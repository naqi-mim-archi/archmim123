import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const buildDir = path.join(root, 'revit-export', 'build');
const addinDir = path.join(root, 'revit-export', 'RevitExportAddin');
const defaultSampleJsonPath = path.resolve(root, '..', '..', '..', '02. Docs', '04. Rvt Import', 'Sample for Rvt', 'Floorplan Sample JSON.json');
const sampleRfaZipPath = path.resolve(root, '..', '..', '..', '02. Docs', '04. Rvt Import', 'Sample for Rvt', 'For Revit Export', 'Sample-RFA-Files.zip');

const AUTH_URL = 'https://developer.api.autodesk.com/authentication/v2/token';
const DATA_URL = 'https://developer.api.autodesk.com';
const APPBUNDLE_ID = 'OurAppRevitExport';
const ACTIVITY_ID = 'OurAppRevitExportActivity';
const cliArgs = process.argv.slice(2);

const readCliValue = (name) => {
  const equalsArg = cliArgs.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = cliArgs.indexOf(name);
  return index >= 0 ? cliArgs[index + 1] : undefined;
};

const sampleJsonPath = path.resolve(readCliValue('--sample-json') || defaultSampleJsonPath);

const normalizeEngine = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{4}$/.test(raw)) return `Autodesk.Revit+${raw}`;
  if (/^Autodesk\.Revit\+\d{4}$/.test(raw)) return raw;
  return raw;
};

const engineYear = (engine) => Number(String(engine || '').match(/Autodesk\.Revit\+(\d+)/)?.[1] || 0);

const engineSuffix = (engine) => {
  const year = engineYear(engine);
  return year ? `_${year}` : '';
};

const versionedId = (base, engine, useVersionedId) => (
  useVersionedId ? `${base}${engineYear(engine)}` : base
);

const envOrder = [
  'APS_CLIENT_ID',
  'APS_CLIENT_SECRET',
  'APS_REGION',
  'APS_BUCKET_KEY',
  'APS_REVIT_ENGINE',
  'APS_REVIT_APPBUNDLE_ID',
  'APS_REVIT_ACTIVITY_ID',
  'APS_REVIT_ACTIVITY_ALIAS',
];

const readEnv = async () => {
  const text = existsSync(envPath) ? await fs.readFile(envPath, 'utf8') : '';
  const env = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
};

const writeEnv = async (env) => {
  const keys = [...new Set([...envOrder, ...Object.keys(env)])].filter((key) => env[key] !== undefined && env[key] !== '');
  await fs.writeFile(envPath, `${keys.map((key) => `${key}=${env[key]}`).join('\n')}\n`, 'utf8');
};

const redact = (env, value) => {
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const key of ['APS_CLIENT_SECRET', 'APS_CLIENT_ID']) {
    if (env[key]) text = text.split(env[key]).join(`[redacted:${key}]`);
  }
  return text.replace(/[A-Za-z0-9_-]{45,}/g, '[redacted]');
};

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: options.cwd || root,
    shell: false,
    env: { ...process.env, ...(options.env || {}) },
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    output += text;
    if (!options.quiet) process.stdout.write(text);
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    output += text;
    if (!options.quiet) process.stderr.write(text);
  });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) resolve(output);
    else reject(new Error(`${command} exited with ${code}`));
  });
});

const authToken = async (env) => {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.APS_CLIENT_ID,
    client_secret: env.APS_CLIENT_SECRET,
    scope: 'data:read data:write data:create bucket:read bucket:create code:all',
  });
  const response = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`APS authentication failed (${response.status}): ${redact(env, text)}`);
  }
  return JSON.parse(text).access_token;
};

const daRegion = (region) => {
  const normalized = String(region || 'US').trim().toLowerCase();
  if (normalized === 'us' || normalized === 'usa' || normalized === 'us-east') return 'us-east';
  if (normalized === 'emea' || normalized === 'eu' || normalized === 'europe') return 'eu';
  return normalized;
};

const daBase = (env) => `${DATA_URL}/da/${daRegion(env.APS_REGION)}/v3`;

const apsFetch = async (env, token, url, init = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`APS request failed (${response.status}) ${url}: ${redact(env, text.slice(0, 1200))}`);
    error.status = response.status;
    throw error;
  }
  return text ? JSON.parse(text) : {};
};

const listRevitEngines = async (env, token) => {
  const payload = await apsFetch(env, token, `${daBase(env)}/engines`);
  const engines = Array.isArray(payload) ? payload : (payload.data || payload.value || []);
  return engines.filter((engine) => String(engine).startsWith('Autodesk.Revit+'));
};

const selectLatestEngine = (engines) => {
  const parsed = engines
    .map((engine) => ({ engine, year: Number(String(engine).match(/Autodesk\.Revit\+(\d+)/)?.[1] || 0) }))
    .filter((item) => item.year > 0)
    .sort((a, b) => b.year - a.year || String(b.engine).localeCompare(String(a.engine)));
  if (!parsed.length) throw new Error('No Autodesk.Revit+ engines were returned by APS.');
  return parsed[0].engine;
};

const latestNuGetVersionForYear = async (packageId, year) => {
  const response = await fetch(`https://api.nuget.org/v3-flatcontainer/${packageId.toLowerCase()}/index.json`);
  if (!response.ok) throw new Error(`Could not query NuGet package ${packageId}.`);
  const versions = (await response.json()).versions || [];
  const matches = versions.filter((version) => version.startsWith(`${year}.`) && !version.includes('beta') && !version.includes('alpha'));
  if (!matches.length) throw new Error(`No ${packageId} NuGet version found for Revit ${year}.`);
  return matches.at(-1);
};

const ensureBucket = async (env, token) => {
  if (env.APS_BUCKET_KEY) {
    const details = await fetch(`${DATA_URL}/oss/v2/buckets/${encodeURIComponent(env.APS_BUCKET_KEY)}/details`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (details.ok) return env.APS_BUCKET_KEY;
  }

  const seed = String(env.APS_CLIENT_ID || 'archai').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
  for (let i = 0; i < 5; i += 1) {
    const bucketKey = `archai-rvt-${seed}-${Date.now().toString(36)}${i || ''}`;
    try {
      await apsFetch(env, token, `${DATA_URL}/oss/v2/buckets`, {
        method: 'POST',
        headers: { 'x-ads-region': String(env.APS_REGION || 'US').toUpperCase().includes('EMEA') ? 'EMEA' : 'US' },
        body: JSON.stringify({ bucketKey, policyKey: 'transient' }),
      });
      env.APS_BUCKET_KEY = bucketKey;
      await writeEnv(env);
      return bucketKey;
    } catch (error) {
      if (error.status !== 409) throw error;
    }
  }
  throw new Error('Could not create a unique APS OSS bucket.');
};

const ensureDotnet = async (channel = '8.0') => {
  const expectedMajor = `${channel}`.split('.')[0];
  try {
    const out = await run('dotnet', ['--list-sdks'], { quiet: true });
    if (out.split(/\r?\n/).some((line) => line.trim().startsWith(`${expectedMajor}.`))) return 'dotnet';
  } catch {}

  const dotnetDir = process.env.APS_DOTNET_DIR || path.join(process.env.USERPROFILE || root, `.archai-dotnet${expectedMajor}`);
  const dotnetExe = path.join(dotnetDir, 'dotnet.exe');
  if (existsSync(dotnetExe)) return dotnetExe;

  await fs.mkdir(path.join(root, '.tools'), { recursive: true });
  const installScript = path.join(root, '.tools', 'dotnet-install.ps1');
  const response = await fetch('https://dot.net/v1/dotnet-install.ps1');
  if (!response.ok) throw new Error('Could not download dotnet-install.ps1.');
  await fs.writeFile(installScript, await response.text(), 'utf8');
  await run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installScript, '-Channel', channel, '-InstallDir', dotnetDir]);
  return dotnetExe;
};

const prepareFamilies = async () => {
  const familyDir = path.join(addinDir, 'Assets', 'Families');
  await fs.mkdir(familyDir, { recursive: true });
  if (!existsSync(sampleRfaZipPath)) return;
  await run('powershell', [
    '-NoProfile',
    '-Command',
    `Expand-Archive -LiteralPath '${sampleRfaZipPath.replaceAll("'", "''")}' -DestinationPath '${familyDir.replaceAll("'", "''")}' -Force`,
  ], { quiet: true });
};

const buildBundle = async (env, engine, appBundleId = APPBUNDLE_ID) => {
  const year = Number(String(engine).match(/Autodesk\.Revit\+(\d+)/)?.[1]);
  const bridgeVersion = await latestNuGetVersionForYear('Autodesk.Forge.DesignAutomation.Revit', year);
  const apiVersion = await latestNuGetVersionForYear('Revit_All_Main_Versions_API_x64', year);
  const targetFramework = year >= 2027 ? 'net10.0-windows' : 'net8.0-windows';
  const dotnet = await ensureDotnet(year >= 2027 ? '10.0' : '8.0');
  const publishDir = path.join(buildDir, 'addin-publish');
  const packageRoot = path.join(buildDir, `${appBundleId}.bundle`);
  const packageContentsDir = path.join(packageRoot, 'Contents');
  const bundleZip = path.join(buildDir, `${appBundleId}.bundle.zip`);
  await fs.rm(publishDir, { recursive: true, force: true });
  await fs.rm(packageRoot, { recursive: true, force: true });
  await fs.rm(bundleZip, { force: true });
  await fs.mkdir(buildDir, { recursive: true });
  await prepareFamilies();
  await run(dotnet, [
    'publish',
    path.join(addinDir, 'RevitExportAddin.csproj'),
    '-c',
    'Release',
    '-o',
    publishDir,
    `/p:DesignAutomationRevitVersion=${bridgeVersion}`,
    `/p:RevitApiPackageVersion=${apiVersion}`,
    `/p:RevitTargetFramework=${targetFramework}`,
  ]);
  await fs.rm(path.join(publishDir, 'RevitAPI.dll'), { force: true });
  await fs.rm(path.join(publishDir, 'RevitAPIUI.dll'), { force: true });
  await fs.rm(path.join(publishDir, 'AdWindows.dll'), { force: true });
  await fs.rm(path.join(publishDir, 'UIFramework.dll'), { force: true });
  await fs.mkdir(packageContentsDir, { recursive: true });
  await run('powershell', [
    '-NoProfile',
    '-Command',
    `Copy-Item -Path '${path.join(publishDir, '*').replaceAll("'", "''")}' -Destination '${packageContentsDir.replaceAll("'", "''")}' -Recurse -Force; Remove-Item -LiteralPath '${path.join(packageContentsDir, 'PackageContents.xml').replaceAll("'", "''")}' -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath '${path.join(packageContentsDir, 'OurApp.RevitExportAddin.addin').replaceAll("'", "''")}' -Force -ErrorAction SilentlyContinue; Copy-Item -LiteralPath '${path.join(addinDir, 'PackageContents.xml').replaceAll("'", "''")}' -Destination '${path.join(packageRoot, 'PackageContents.xml').replaceAll("'", "''")}' -Force; Copy-Item -LiteralPath '${path.join(addinDir, 'OurApp.RevitExportAddin.addin').replaceAll("'", "''")}' -Destination '${path.join(packageRoot, 'OurApp.RevitExportAddin.addin').replaceAll("'", "''")}' -Force`,
  ], { quiet: true });
  await run('powershell', [
    '-NoProfile',
    '-Command',
    `Compress-Archive -Path '${packageRoot.replaceAll("'", "''")}' -DestinationPath '${bundleZip.replaceAll("'", "''")}' -Force`,
  ], { quiet: true });
  return { bundleZip, bridgeVersion, apiVersion };
};

const uploadMultipart = async (env, uploadParameters, filePath) => {
  const endpoint = uploadParameters.endpointURL || uploadParameters.endpointUrl || uploadParameters.url;
  const formData = uploadParameters.formData || uploadParameters.form || {};
  if (!endpoint) throw new Error('APS AppBundle response did not include an upload endpoint.');
  const body = new FormData();
  for (const [key, value] of Object.entries(formData)) body.append(key, value);
  body.append('file', new Blob([await fs.readFile(filePath)]), path.basename(filePath));
  const upload = await fetch(endpoint, { method: 'POST', body });
  if (!upload.ok) throw new Error(`AppBundle upload failed (${upload.status}): ${redact(env, await upload.text())}`);
};

const getNickname = async (env, token) => {
  try {
    const payload = await apsFetch(env, token, `${daBase(env)}/forgeapps/me`);
    return typeof payload === 'string' ? payload : (payload.nickname || payload.id || '');
  } catch {
    return '';
  }
};

const aliasVersion = async (env, token, kind, id, alias, version) => {
  try {
    await apsFetch(env, token, `${daBase(env)}/${kind}/${encodeURIComponent(id)}/aliases`, {
      method: 'POST',
      body: JSON.stringify({ id: alias, version }),
    });
  } catch (error) {
    if (error.status !== 409) throw error;
    await apsFetch(env, token, `${daBase(env)}/${kind}/${encodeURIComponent(id)}/aliases/${encodeURIComponent(alias)}`, {
      method: 'PATCH',
      body: JSON.stringify({ version }),
    });
  }
};

const createAppBundle = async (env, token, bundleZip, engine, appBundleId, envSuffix) => {
  const body = { id: appBundleId, engine, description: 'Direct project-to-RVT exporter AppBundle.' };
  let payload;
  try {
    payload = await apsFetch(env, token, `${daBase(env)}/appbundles`, { method: 'POST', body: JSON.stringify(body) });
  } catch (error) {
    if (error.status !== 409) throw error;
    payload = await apsFetch(env, token, `${daBase(env)}/appbundles/${encodeURIComponent(appBundleId)}/versions`, {
      method: 'POST',
      body: JSON.stringify({ engine, description: body.description }),
    });
  }
  await uploadMultipart(env, payload.uploadParameters, bundleZip);
  await aliasVersion(env, token, 'appbundles', appBundleId, env.APS_REVIT_ACTIVITY_ALIAS, payload.version);
  const owner = await getNickname(env, token);
  env[`APS_REVIT_ENGINE${envSuffix}`] = engine;
  env[`APS_REVIT_APPBUNDLE_ID${envSuffix}`] = payload.id || (owner ? `${owner}.${appBundleId}` : appBundleId);
  await writeEnv(env);
  return { owner, appBundleRef: `${owner ? `${owner}.` : '.'}${appBundleId}+${env.APS_REVIT_ACTIVITY_ALIAS}` };
};

const createActivity = async (env, token, owner, appBundleRef, engine, appBundleId, activityId, envSuffix) => {
  const activityBody = {
    id: activityId,
    commandLine: [`"$(engine.path)\\revitcoreconsole.exe" /al "$(appbundles[${appBundleId}].path)"`],
    parameters: {
      manifest: { verb: 'get', description: 'Direct Revit export manifest', required: true, localName: 'revit-export-manifest.json' },
      resultRvt: { verb: 'put', description: 'Generated Revit project', required: true, localName: 'project.rvt' },
      reportJson: { verb: 'put', description: 'Structured Revit export report', required: true, localName: 'revit-export-report.json' },
      executionLog: { verb: 'put', description: 'Optional exporter execution log', required: false, localName: 'revit-export-execution.log' },
    },
    engine,
    appbundles: [appBundleRef],
    description: 'Create an RVT project directly from an OurApp Revit export manifest.',
  };
  let payload;
  try {
    payload = await apsFetch(env, token, `${daBase(env)}/activities`, { method: 'POST', body: JSON.stringify(activityBody) });
  } catch (error) {
    if (error.status !== 409) throw error;
    payload = await apsFetch(env, token, `${daBase(env)}/activities/${encodeURIComponent(activityId)}/versions`, {
      method: 'POST',
      body: JSON.stringify({ ...activityBody, id: null }),
    });
  }
  await aliasVersion(env, token, 'activities', activityId, env.APS_REVIT_ACTIVITY_ALIAS, payload.version);
  env[`APS_REVIT_ACTIVITY_ID${envSuffix}`] = payload.id || (owner ? `${owner}.${activityId}` : activityId);
  env[`APS_REVIT_ACTIVITY_ALIAS${envSuffix}`] = env.APS_REVIT_ACTIVITY_ALIAS;
  await writeEnv(env);
};

const createManifest = async (engine) => {
  const tempDir = path.join(buildDir, 'manifest-module');
  const outFile = path.join(tempDir, 'revitExportManifest.mjs');
  await fs.mkdir(tempDir, { recursive: true });
  await run(process.execPath, [
    path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild'),
    path.join(root, 'services', 'revitExport', 'revitExportManifest.ts'),
    '--bundle',
    '--platform=node',
    '--format=esm',
    `--outfile=${outFile}`,
  ], { quiet: true });
  const mod = await import(`${pathToFileURL(outFile).href}?t=${Date.now()}`);
  const project = JSON.parse(await fs.readFile(sampleJsonPath, 'utf8'));
  const activeLevelId = project.activeLevelId || project.levels?.[0]?.id;
  const options = mod.getDefaultRevitExportOptions(project, project.settings?.unitSystem || 'imperial', activeLevelId);
  options.revitEngine = engine;
  const manifest = mod.createRevitExportManifest(project, options);
  const manifestPath = path.join(buildDir, 'sample-workitem', 'revit-export-manifest.json');
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return manifestPath;
};

const createSignedS3UploadUrl = async (env, token, bucketKey, key) => {
  const payload = await apsFetch(env, token, `${DATA_URL}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(key)}/signeds3upload?parts=1&minutesExpiration=60`);
  const uploadUrl = payload.urls?.[0] || payload.uploadUrl || payload.url;
  if (!uploadUrl || !payload.uploadKey) throw new Error(`No signed S3 upload URL returned for ${key}.`);
  return { uploadUrl, uploadKey: payload.uploadKey };
};

const uploadBytes = async (env, token, bucketKey, key, bytes, contentType) => {
  const { uploadUrl, uploadKey } = await createSignedS3UploadUrl(env, token, bucketKey, key);
  const upload = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': contentType }, body: bytes });
  if (!upload.ok) throw new Error(`Upload failed for ${key}: ${upload.status}`);
  await apsFetch(env, token, `${DATA_URL}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(key)}/signeds3upload`, {
    method: 'POST',
    body: JSON.stringify({ uploadKey }),
  });
};

const uploadObject = async (env, token, bucketKey, key, filePath, contentType) => {
  await uploadBytes(env, token, bucketKey, key, await fs.readFile(filePath), contentType);
};

const signedDownloadUrl = async (env, token, bucketKey, key) => {
  const payload = await apsFetch(env, token, `${DATA_URL}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(key)}/signeds3download?minutesExpiration=60`);
  return payload.url || payload.signedUrl;
};

const automationSignedUrl = async (env, token, bucketKey, key, access) => {
  const signedAccess = access === 'write' ? 'readwrite' : access;
  const payload = await apsFetch(env, token, `${DATA_URL}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(key)}/signed?access=${encodeURIComponent(signedAccess)}`, {
    method: 'POST',
    body: JSON.stringify({ minutesExpiration: 60, singleUse: false }),
  });
  return payload.signedUrl || payload.url;
};

const downloadFile = async (url, outPath) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${outPath}.`);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, Buffer.from(await response.arrayBuffer()));
};

const submitSampleWorkItem = async (env, token, manifestPath, activityFullId) => {
  const jobId = `sample-rvt-${Date.now().toString(36)}`;
  const bucketKey = env.APS_BUCKET_KEY;
  const inputKey = `${jobId}/input/revit-export-manifest.json`;
  const rvtKey = `${jobId}/output/project.rvt`;
  const reportKey = `${jobId}/output/revit-export-report.json`;
  const logKey = `${jobId}/output/revit-export-execution.log`;
  await uploadObject(env, token, bucketKey, inputKey, manifestPath, 'application/json');
  await uploadBytes(env, token, bucketKey, rvtKey, new Uint8Array(), 'application/octet-stream');
  await uploadBytes(env, token, bucketKey, reportKey, new Uint8Array(), 'application/json');
  await uploadBytes(env, token, bucketKey, logKey, new Uint8Array(), 'text/plain');
  const workItem = await apsFetch(env, token, `${daBase(env)}/workitems`, {
    method: 'POST',
    body: JSON.stringify({
      activityId: activityFullId,
      arguments: {
        manifest: { url: await signedDownloadUrl(env, token, bucketKey, inputKey), verb: 'get' },
        resultRvt: { url: await automationSignedUrl(env, token, bucketKey, rvtKey, 'write'), verb: 'put' },
        reportJson: { url: await automationSignedUrl(env, token, bucketKey, reportKey, 'write'), verb: 'put' },
        executionLog: { url: await automationSignedUrl(env, token, bucketKey, logKey, 'write'), verb: 'put' },
      },
    }),
  });

  let status = workItem.status;
  let latest = workItem;
  const terminalStatuses = new Set(['success', 'failed', 'failedinstructions', 'faileddownload', 'failedupload', 'cancelled', 'timeout']);
  for (let i = 0; i < 90; i += 1) {
    if (terminalStatuses.has(String(status).toLowerCase())) break;
    await new Promise((resolve) => setTimeout(resolve, 10000));
    latest = await apsFetch(env, token, `${daBase(env)}/workitems/${encodeURIComponent(workItem.id)}`);
    status = latest.status;
    console.log(`WorkItem ${workItem.id}: ${status}`);
  }
  if (String(status).toLowerCase() !== 'success') {
    if (latest.reportUrl) {
      await downloadFile(latest.reportUrl, path.join(buildDir, 'sample-workitem', 'automation-report.txt')).catch(() => {});
    }
    throw new Error(`Sample WorkItem did not succeed. Final status: ${status || 'unknown'}`);
  }

  const outDir = path.join(buildDir, 'sample-workitem', workItem.id);
  await downloadFile(await signedDownloadUrl(env, token, bucketKey, rvtKey), path.join(outDir, 'project.rvt'));
  await downloadFile(await signedDownloadUrl(env, token, bucketKey, reportKey), path.join(outDir, 'revit-export-report.json'));
  await downloadFile(await signedDownloadUrl(env, token, bucketKey, logKey), path.join(outDir, 'revit-export-execution.log')).catch(() => {});
  if (latest.reportUrl) await downloadFile(latest.reportUrl, path.join(outDir, 'automation-report.txt'));
  console.log(`Sample RVT output: ${path.join(outDir, 'project.rvt')}`);
};

const main = async () => {
  const env = await readEnv();
  for (const key of ['APS_CLIENT_ID', 'APS_CLIENT_SECRET', 'APS_REGION', 'APS_REVIT_ACTIVITY_ALIAS']) {
    if (!env[key]) throw new Error(`Missing ${key} in .env.`);
  }
  const requestedEngine = normalizeEngine(readCliValue('--engine') || readCliValue('--year'));
  const runSample = !cliArgs.includes('--setup-only');

  console.log('Verifying APS authentication...');
  const token = await authToken(env);

  console.log('Querying APS Revit engines...');
  const engines = await listRevitEngines(env, token);
  const targetEngine = requestedEngine || selectLatestEngine(engines);
  if (!engines.includes(targetEngine)) {
    throw new Error(`Requested Revit engine ${targetEngine} is not available in APS. Available engines: ${engines.join(', ')}`);
  }
  const useVersionedId = Boolean(requestedEngine && env.APS_REVIT_ENGINE && targetEngine !== env.APS_REVIT_ENGINE);
  const suffix = useVersionedId ? engineSuffix(targetEngine) : '';
  const appBundleId = versionedId(APPBUNDLE_ID, targetEngine, useVersionedId);
  const activityId = versionedId(ACTIVITY_ID, targetEngine, useVersionedId);
  if (!useVersionedId) {
    env.APS_REVIT_ENGINE = targetEngine;
    await writeEnv(env);
  }
  console.log(`Selected Revit engine: ${targetEngine}`);

  console.log('Ensuring OSS bucket...');
  await ensureBucket(env, token);
  console.log('OSS bucket is configured.');

  console.log('Building and packaging Revit AppBundle...');
  const { bundleZip, bridgeVersion, apiVersion } = await buildBundle(env, targetEngine, appBundleId);
  console.log(`Built AppBundle with bridge ${bridgeVersion} and Revit API references ${apiVersion}.`);

  console.log('Uploading AppBundle and creating alias...');
  const { owner, appBundleRef } = await createAppBundle(env, token, bundleZip, targetEngine, appBundleId, suffix);

  console.log('Creating Activity and dev alias...');
  await createActivity(env, token, owner, appBundleRef, targetEngine, appBundleId, activityId, suffix);

  if (runSample) {
    console.log('Creating sample manifest and submitting WorkItem...');
    const manifestPath = await createManifest(targetEngine);
    const fullActivityId = `${env[`APS_REVIT_ACTIVITY_ID${suffix}`]}+${env[`APS_REVIT_ACTIVITY_ALIAS${suffix}`] || env.APS_REVIT_ACTIVITY_ALIAS}`;
    await submitSampleWorkItem(env, token, manifestPath, fullActivityId);
  }
};

main().catch((error) => {
  readEnv()
    .then((env) => console.error(redact(env, error?.message || String(error))))
    .finally(() => process.exit(1));
});
