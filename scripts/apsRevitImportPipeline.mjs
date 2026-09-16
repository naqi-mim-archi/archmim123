import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const buildDir = path.join(root, 'aps-revit-import', 'build');
const addinDir = path.join(root, 'aps-revit-import', 'RevitImportExtractorAddin');
const sampleDir = path.resolve(root, '..', '..', '..', '02. Docs', '04. Rvt Import', 'Sample for Rvt', 'APS Revit Import');
const defaultSampleRvtPath = path.join(sampleDir, 'Sample-RVT-File..rvt');
const defaultExpectedJsonPath = path.join(sampleDir, 'Floorplan Sample JSON.json');

const AUTH_URL = 'https://developer.api.autodesk.com/authentication/v2/token';
const DATA_URL = 'https://developer.api.autodesk.com';
const APPBUNDLE_ID = 'OurAppApsRevitImport';
const ACTIVITY_ID = 'OurAppApsRevitImportActivity';
const ALIAS = 'dev';
const cliArgs = process.argv.slice(2);

const readCliValue = (name) => {
  const equalsArg = cliArgs.find((arg) => arg.startsWith(`${name}=`));
  if (equalsArg) return equalsArg.slice(name.length + 1);
  const index = cliArgs.indexOf(name);
  return index >= 0 ? cliArgs[index + 1] : undefined;
};

const sampleRvtPath = path.resolve(readCliValue('--sample-rvt') || defaultSampleRvtPath);
const expectedJsonPath = path.resolve(readCliValue('--expected-json') || defaultExpectedJsonPath);

const normalizeEngine = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  if (/^\d{4}$/.test(raw)) return `Autodesk.Revit+${raw}`;
  if (/^Autodesk\.Revit\+\d{4}$/.test(raw)) return raw;
  return raw;
};

const engineYear = (engine) => Number(String(engine || '').match(/Autodesk\.Revit\+(\d+)/)?.[1] || 0);
const engineSuffix = (engine) => engineYear(engine) ? `_${engineYear(engine)}` : '';
const versionedId = (base, engine, useVersionedId) => useVersionedId ? `${base}${engineYear(engine)}` : base;

const envOrder = [
  'APS_CLIENT_ID',
  'APS_CLIENT_SECRET',
  'APS_REGION',
  'APS_BUCKET_KEY',
  'APS_REVIT_ENGINE',
  'APS_REVIT_IMPORT_ENGINE',
  'APS_REVIT_IMPORT_APPBUNDLE_ID',
  'APS_REVIT_IMPORT_ACTIVITY_ID',
  'APS_REVIT_IMPORT_ACTIVITY_ALIAS',
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
  if (!response.ok) throw new Error(`APS authentication failed (${response.status}): ${redact(env, text)}`);
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
    .map((engine) => ({ engine, year: engineYear(engine) }))
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

const buildBundle = async (engine, appBundleId) => {
  const year = engineYear(engine);
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
  await run(dotnet, [
    'publish',
    path.join(addinDir, 'RevitImportExtractorAddin.csproj'),
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
    `Copy-Item -Path '${path.join(publishDir, '*').replaceAll("'", "''")}' -Destination '${packageContentsDir.replaceAll("'", "''")}' -Recurse -Force; Remove-Item -LiteralPath '${path.join(packageContentsDir, 'PackageContents.xml').replaceAll("'", "''")}' -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath '${path.join(packageContentsDir, 'OurApp.RevitImportExtractorAddin.addin').replaceAll("'", "''")}' -Force -ErrorAction SilentlyContinue; Copy-Item -LiteralPath '${path.join(addinDir, 'PackageContents.xml').replaceAll("'", "''")}' -Destination '${path.join(packageRoot, 'PackageContents.xml').replaceAll("'", "''")}' -Force; Copy-Item -LiteralPath '${path.join(addinDir, 'OurApp.RevitImportExtractorAddin.addin').replaceAll("'", "''")}' -Destination '${path.join(packageRoot, 'OurApp.RevitImportExtractorAddin.addin').replaceAll("'", "''")}' -Force`,
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
  const body = { id: appBundleId, engine, description: 'APS Revit Importer DB extraction AppBundle.' };
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
  await aliasVersion(env, token, 'appbundles', appBundleId, env.APS_REVIT_IMPORT_ACTIVITY_ALIAS, payload.version);
  const owner = await getNickname(env, token);
  env[`APS_REVIT_IMPORT_ENGINE${envSuffix}`] = engine;
  env[`APS_REVIT_IMPORT_APPBUNDLE_ID${envSuffix}`] = payload.id || (owner ? `${owner}.${appBundleId}` : appBundleId);
  await writeEnv(env);
  return { owner, appBundleRef: `${owner ? `${owner}.` : '.'}${appBundleId}+${env.APS_REVIT_IMPORT_ACTIVITY_ALIAS}` };
};

const createActivity = async (env, token, owner, appBundleRef, engine, appBundleId, activityId, envSuffix) => {
  const activityBody = {
    id: activityId,
    commandLine: [`"$(engine.path)\\revitcoreconsole.exe" /i "$(args[inputRvt].path)" /al "$(appbundles[${appBundleId}].path)"`],
    parameters: {
      inputRvt: { verb: 'get', description: 'Source RVT file', required: true, localName: 'input.rvt' },
      optionsJson: { verb: 'get', description: 'APS Revit Importer options', required: true, localName: 'aps-revit-import-options.json' },
      extractionManifest: { verb: 'put', description: 'Neutral Revit extraction manifest', required: true, localName: 'RevitExtractionManifest.json' },
      extractionReport: { verb: 'put', description: 'Extractor report JSON', required: true, localName: 'RevitExtractionReport.json' },
      executionLog: { verb: 'put', description: 'Extractor execution log', required: false, localName: 'APSRevitImport_Execution.log' },
    },
    engine,
    appbundles: [appBundleRef],
    description: 'Extract Revit DB API data directly from RVT for APS Revit Importer.',
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
  await aliasVersion(env, token, 'activities', activityId, env.APS_REVIT_IMPORT_ACTIVITY_ALIAS, payload.version);
  env[`APS_REVIT_IMPORT_ACTIVITY_ID${envSuffix}`] = payload.id || (owner ? `${owner}.${activityId}` : activityId);
  env[`APS_REVIT_IMPORT_ACTIVITY_ALIAS${envSuffix}`] = env.APS_REVIT_IMPORT_ACTIVITY_ALIAS;
  await writeEnv(env);
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

const convertManifestToProject = async (manifestPath, outDir, sourceFileName, engine) => {
  const tempDir = path.join(buildDir, 'converter-module');
  const outFile = path.join(tempDir, 'apsRevitImportConverter.mjs');
  await fs.mkdir(tempDir, { recursive: true });
  await run(process.execPath, [
    path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild'),
    path.join(root, 'services', 'apsRevitImport', 'apsRevitImportConverter.ts'),
    '--bundle',
    '--platform=node',
    '--format=esm',
    `--outfile=${outFile}`,
  ], { quiet: true });
  const mod = await import(`${pathToFileURL(outFile).href}?t=${Date.now()}`);
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const result = mod.convertApsRevitExtractionToNative(manifest, sourceFileName, { revitEngine: engine });
  const projectPath = path.join(outDir, 'Sample-RVT-File_APS-Revit-Import_Project.json');
  const reportPath = path.join(outDir, 'Sample-RVT-File_APS-Revit-Import_Report.json');
  await fs.writeFile(projectPath, JSON.stringify(result.project, null, 2), 'utf8');
  await fs.writeFile(reportPath, JSON.stringify(result.report, null, 2), 'utf8');
  return { result, projectPath, reportPath };
};

const createComparisonReport = async (outDir, importedProject, importReport) => {
  const expected = existsSync(expectedJsonPath) ? JSON.parse(await fs.readFile(expectedJsonPath, 'utf8')) : null;
  const countByType = (project) => (project?.elements || []).reduce((counts, element) => {
    counts[element.type] = (counts[element.type] || 0) + 1;
    return counts;
  }, {});
  const comparison = {
    generatedAt: new Date().toISOString(),
    expectedProjectJson: expectedJsonPath,
    importedProjectJson: path.join(outDir, 'Sample-RVT-File_APS-Revit-Import_Project.json'),
    screenshotReferences: {
      archAiPlan: path.join(sampleDir, 'Arch-AI-Screenshot-1 (2D Plan View).png'),
      archAiNorthEast3d: path.join(sampleDir, 'Arch-AI-Screenshot-2 (3D View North-East).png'),
      archAiSouthWest3d: path.join(sampleDir, 'Arch-AI-Screenshot-3 (3D View South-West).png'),
      revitPlan: path.join(sampleDir, 'Revit-Screenshot-1 (Plan).png'),
      revitNorthEast3d: path.join(sampleDir, 'Revit-Screenshot-2 (3D View North-East).png'),
      revitSouthWest3d: path.join(sampleDir, 'Revit-Screenshot-3 (3D View South-West).png'),
    },
    expectedCounts: expected ? {
      levels: expected.levels?.length || 0,
      elements: expected.elements?.length || 0,
      byType: countByType(expected),
    } : null,
    importedCounts: {
      levels: importedProject.levels?.length || 0,
      elements: importedProject.elements?.length || 0,
      byType: countByType(importedProject),
    },
    importReportSummary: {
      nativeElementCount: importReport.nativeElementCount,
      fallbackElementCount: importReport.fallbackElementCount,
      skippedElementCount: importReport.skippedElementCount,
      warnings: importReport.warnings,
      errors: importReport.errors,
    },
    findings: [
      'Comparison is based on extracted Revit DB semantics and expected native project counts.',
      'Screenshots are referenced for manual visual QA after opening the imported project in the app.',
      'No runtime IFC, DWG, DXF, mesh, screenshot, or image conversion intermediate is used by this importer.',
    ],
  };
  const comparisonPath = path.join(outDir, 'Sample-RVT-File_APS-Revit-Import_Comparison.json');
  await fs.writeFile(comparisonPath, JSON.stringify(comparison, null, 2), 'utf8');
  return comparisonPath;
};

const submitSampleWorkItem = async (env, token, samplePath, activityFullId, engine) => {
  const jobId = `sample-aps-rvt-import-${Date.now().toString(36)}`;
  const bucketKey = env.APS_BUCKET_KEY;
  const inputKey = `${jobId}/input/Sample-RVT-File.rvt`;
  const optionsKey = `${jobId}/input/aps-revit-import-options.json`;
  const manifestKey = `${jobId}/output/RevitExtractionManifest.json`;
  const extractionReportKey = `${jobId}/output/RevitExtractionReport.json`;
  const logKey = `${jobId}/output/APSRevitImport_Execution.log`;
  const options = {
    manifestVersion: 'aps-revit-import-v1',
    sourceFileName: path.basename(samplePath),
    importModelElements: true,
    importPlanAnnotations: true,
    importDimensions: true,
    importGenericFamiliesAsBlocks: true,
    includeLinkedModelReferencesAsWarnings: true,
    revitEngine: engine,
  };
  await uploadObject(env, token, bucketKey, inputKey, samplePath, 'application/octet-stream');
  await uploadBytes(env, token, bucketKey, optionsKey, new TextEncoder().encode(JSON.stringify(options, null, 2)), 'application/json');
  await uploadBytes(env, token, bucketKey, manifestKey, new Uint8Array(), 'application/json');
  await uploadBytes(env, token, bucketKey, extractionReportKey, new Uint8Array(), 'application/json');
  await uploadBytes(env, token, bucketKey, logKey, new Uint8Array(), 'text/plain');
  const workItem = await apsFetch(env, token, `${daBase(env)}/workitems`, {
    method: 'POST',
    body: JSON.stringify({
      activityId: activityFullId,
      arguments: {
        inputRvt: { url: await signedDownloadUrl(env, token, bucketKey, inputKey), verb: 'get' },
        optionsJson: { url: await signedDownloadUrl(env, token, bucketKey, optionsKey), verb: 'get' },
        extractionManifest: { url: await automationSignedUrl(env, token, bucketKey, manifestKey, 'write'), verb: 'put' },
        extractionReport: { url: await automationSignedUrl(env, token, bucketKey, extractionReportKey, 'write'), verb: 'put' },
        executionLog: { url: await automationSignedUrl(env, token, bucketKey, logKey, 'write'), verb: 'put' },
      },
    }),
  });

  let status = workItem.status;
  let latest = workItem;
  const terminalStatuses = new Set(['success', 'failed', 'failedinstructions', 'faileddownload', 'failedupload', 'cancelled', 'timeout']);
  for (let i = 0; i < 120; i += 1) {
    if (terminalStatuses.has(String(status).toLowerCase())) break;
    await new Promise((resolve) => setTimeout(resolve, 10000));
    latest = await apsFetch(env, token, `${daBase(env)}/workitems/${encodeURIComponent(workItem.id)}`);
    status = latest.status;
    console.log(`WorkItem ${workItem.id}: ${status}`);
  }
  const outDir = path.join(buildDir, 'sample-workitem', workItem.id);
  await fs.mkdir(outDir, { recursive: true });
  if (String(status).toLowerCase() !== 'success') {
    if (latest.reportUrl) await downloadFile(latest.reportUrl, path.join(outDir, 'automation-report.txt')).catch(() => {});
    throw new Error(`Sample APS Revit Import WorkItem did not succeed. Final status: ${status || 'unknown'}`);
  }

  const manifestPath = path.join(outDir, 'Sample-RVT-File_APS-Revit-Import_Manifest.json');
  const extractionReportPath = path.join(outDir, 'Sample-RVT-File_APS-Revit-Import_ExtractionReport.json');
  const executionLogPath = path.join(outDir, 'APSRevitImport_Execution.log');
  await downloadFile(await signedDownloadUrl(env, token, bucketKey, manifestKey), manifestPath);
  await downloadFile(await signedDownloadUrl(env, token, bucketKey, extractionReportKey), extractionReportPath);
  await downloadFile(await signedDownloadUrl(env, token, bucketKey, logKey), executionLogPath).catch(() => {});
  if (latest.reportUrl) await downloadFile(latest.reportUrl, path.join(outDir, 'automation-report.txt')).catch(() => {});

  const { result, projectPath, reportPath } = await convertManifestToProject(manifestPath, outDir, path.basename(samplePath), engine);
  const comparisonPath = await createComparisonReport(outDir, result.project, result.report);
  console.log(JSON.stringify({
    workItemId: workItem.id,
    status,
    outputDirectory: outDir,
    manifestPath,
    extractionReportPath,
    projectPath,
    reportPath,
    executionLogPath,
    comparisonPath,
    nativeElementCount: result.report.nativeElementCount,
    fallbackElementCount: result.report.fallbackElementCount,
    skippedElementCount: result.report.skippedElementCount,
  }, null, 2));
};

const main = async () => {
  const env = await readEnv();
  env.APS_REVIT_IMPORT_ACTIVITY_ALIAS ||= ALIAS;
  for (const key of ['APS_CLIENT_ID', 'APS_CLIENT_SECRET', 'APS_REGION']) {
    if (!env[key]) throw new Error(`Missing ${key} in .env.`);
  }
  if (!existsSync(sampleRvtPath)) throw new Error(`Sample RVT not found: ${sampleRvtPath}`);
  const requestedEngine = normalizeEngine(readCliValue('--engine') || readCliValue('--year'));
  const runSample = !cliArgs.includes('--setup-only');

  console.log('Verifying APS authentication...');
  const token = await authToken(env);

  console.log('Querying APS Revit engines...');
  const engines = await listRevitEngines(env, token);
  const targetEngine = requestedEngine || env.APS_REVIT_IMPORT_ENGINE || env.APS_REVIT_ENGINE || selectLatestEngine(engines);
  if (!engines.includes(targetEngine)) {
    throw new Error(`Requested Revit engine ${targetEngine} is not available in APS. Available engines: ${engines.join(', ')}`);
  }
  const useVersionedId = Boolean(requestedEngine && env.APS_REVIT_IMPORT_ENGINE && targetEngine !== env.APS_REVIT_IMPORT_ENGINE);
  const suffix = useVersionedId ? engineSuffix(targetEngine) : '';
  const appBundleId = versionedId(APPBUNDLE_ID, targetEngine, useVersionedId);
  const activityId = versionedId(ACTIVITY_ID, targetEngine, useVersionedId);
  if (!useVersionedId) {
    env.APS_REVIT_IMPORT_ENGINE = targetEngine;
    if (!env.APS_REVIT_ENGINE) env.APS_REVIT_ENGINE = targetEngine;
    await writeEnv(env);
  }
  console.log(`Selected Revit engine: ${targetEngine}`);

  console.log('Ensuring OSS bucket...');
  await ensureBucket(env, token);

  console.log('Building APS Revit Importer AppBundle...');
  const { bundleZip, bridgeVersion, apiVersion } = await buildBundle(targetEngine, appBundleId);
  console.log(`Built AppBundle with bridge ${bridgeVersion} and Revit API references ${apiVersion}.`);

  console.log('Uploading importer AppBundle and creating alias...');
  const { owner, appBundleRef } = await createAppBundle(env, token, bundleZip, targetEngine, appBundleId, suffix);

  console.log('Creating importer Activity and alias...');
  await createActivity(env, token, owner, appBundleRef, targetEngine, appBundleId, activityId, suffix);

  if (runSample) {
    console.log('Submitting Sample-RVT-File.rvt WorkItem...');
    const fullActivityId = `${env[`APS_REVIT_IMPORT_ACTIVITY_ID${suffix}`]}+${env[`APS_REVIT_IMPORT_ACTIVITY_ALIAS${suffix}`] || env.APS_REVIT_IMPORT_ACTIVITY_ALIAS}`;
    await submitSampleWorkItem(env, token, sampleRvtPath, fullActivityId, targetEngine);
  }
};

main().catch((error) => {
  readEnv()
    .then((env) => console.error(redact(env, error?.message || String(error))))
    .finally(() => process.exit(1));
});
