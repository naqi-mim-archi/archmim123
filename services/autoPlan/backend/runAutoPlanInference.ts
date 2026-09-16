import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  AUTO_PLAN_MODEL_PATH_DEFAULT,
  AUTO_PLAN_PROTOTYPE_PATH_DEFAULT,
  AutoPlanInferenceRequest,
  AutoPlanInferenceResponse,
} from '../autoPlanTypes';

const AUTO_PLAN_TIMEOUT_MS = Number(process.env.AUTO_PLAN_TIMEOUT_MS || 900000);
const AUTO_PLAN_STATUS_PATH = path.join(os.tmpdir(), 'archai-auto-plan-status.json');
const AUTO_PLAN_HEARTBEAT_MS = Number(process.env.AUTO_PLAN_HEARTBEAT_MS || 5000);

const resolvePrototypePath = () =>
  process.env.AUTO_PLAN_PROTOTYPE_PATH || AUTO_PLAN_PROTOTYPE_PATH_DEFAULT;

const resolveModelPath = () =>
  process.env.AUTO_PLAN_MODEL_PATH || AUTO_PLAN_MODEL_PATH_DEFAULT;

const resolvePythonPath = (prototypePath: string) => {
  if (process.env.AUTO_PLAN_PYTHON_PATH) return process.env.AUTO_PLAN_PYTHON_PATH;
  const prototypePython = path.join(prototypePath, 'miniconda', 'python.exe');
  if (existsSync(prototypePython)) return prototypePython;
  return process.platform === 'win32' ? 'python' : 'python3';
};

const writeAutoPlanStatus = async (status: Record<string, any>) => {
  await writeFile(AUTO_PLAN_STATUS_PATH, JSON.stringify({
    ...status,
    updatedAt: new Date().toISOString(),
  }, null, 2), 'utf8').catch(() => undefined);
};

const readAutoPlanStatus = async () => {
  try {
    const raw = await readFile(AUTO_PLAN_STATUS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const collectProcess = (
  command: string,
  args: string[],
  cwd: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        AUTO_PLAN_STATUS_PATH,
      },
    });
    let stdout = '';
    let stderr = '';
    const startedAt = Date.now();
    const timer = setTimeout(() => {
      void writeAutoPlanStatus({
        state: 'failed',
        message: `Auto Plan inference timed out after ${Math.round(AUTO_PLAN_TIMEOUT_MS / 1000)} seconds.`,
        elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
        processActive: false,
      });
      child.kill();
      reject(new Error(`Auto Plan inference timed out after ${AUTO_PLAN_TIMEOUT_MS} ms.`));
    }, AUTO_PLAN_TIMEOUT_MS);
    const heartbeat = setInterval(async () => {
      const current = await readAutoPlanStatus();
      if (current.state === 'complete' || current.state === 'failed') return;
      await writeAutoPlanStatus({
        ...current,
        state: current.state || 'running_python',
        message: current.message || 'HouseDiffusion subprocess is still running.',
        elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
        processActive: true,
        heartbeatAt: new Date().toISOString(),
      });
    }, AUTO_PLAN_HEARTBEAT_MS);
    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(heartbeat);
    };

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.on('error', error => {
      cleanup();
      reject(error);
    });
    child.on('close', code => {
      cleanup();
      resolve({ code, stdout, stderr });
    });
  });

export const runAutoPlanInference = async (
  request: AutoPlanInferenceRequest & { normalizedBrief?: any },
): Promise<AutoPlanInferenceResponse> => {
  const prototypePath = resolvePrototypePath();
  const modelPath = resolveModelPath();
  const pythonPath = resolvePythonPath(prototypePath);
  const bridgePath = path.join(process.cwd(), 'ml', 'auto_plan', 'inference_bridge.py');

  console.info('[Auto Plan] Resolving paths', { prototypePath, modelPath, pythonPath, bridgePath });
  await writeAutoPlanStatus({
    state: 'resolving_paths',
    message: 'Resolving Auto Plan prototype, model, and Python paths.',
    prototypePath,
    modelPath,
    pythonPath,
  });

  if (!existsSync(prototypePath)) {
    throw new Error(`Auto Plan prototype path was not found: ${prototypePath}`);
  }
  if (!existsSync(modelPath)) {
    throw new Error(`Auto Plan model file was not found. Expected model path: ${modelPath}`);
  }
  if (!existsSync(bridgePath)) {
    throw new Error(`Auto Plan Python bridge was not found: ${bridgePath}`);
  }

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'archai-auto-plan-'));
  const inputPath = path.join(tmpDir, 'input.json');
  const outputPath = path.join(tmpDir, 'output.json');

  try {
    await writeFile(inputPath, JSON.stringify({
      ...request,
      config: {
        prototypePath,
        modelPath,
      },
    }), 'utf8');

    console.info('[Auto Plan] Starting HouseDiffusion subprocess');
    await writeAutoPlanStatus({
      state: 'starting_python',
      message: 'Starting local HouseDiffusion Python subprocess.',
      prototypePath,
      modelPath,
      pythonPath,
      inputPath,
      outputPath,
    });
    const result = await collectProcess(
      pythonPath,
      [
        bridgePath,
        '--input',
        inputPath,
        '--output',
        outputPath,
        '--prototype',
        prototypePath,
        '--model',
        modelPath,
        '--status',
        AUTO_PLAN_STATUS_PATH,
      ],
      process.cwd(),
    );

    if (result.code !== 0) {
      await writeAutoPlanStatus({
        state: 'failed',
        message: `Auto Plan inference failed with exit code ${result.code}.`,
        stderr: result.stderr,
        stdout: result.stdout,
        modelPath,
      });
      console.error('[Auto Plan] Inference failed', { code: result.code, stderr: result.stderr, stdout: result.stdout });
      throw new Error(`Auto Plan inference failed with exit code ${result.code}. ${result.stderr || result.stdout}`);
    }

    const raw = await readFile(outputPath, 'utf8');
    const parsed = JSON.parse(raw) as AutoPlanInferenceResponse;
    parsed.logs = [
      ...(parsed.logs || []),
      ...result.stdout.split(/\r?\n/).filter(Boolean).map(message => ({ level: 'info' as const, code: 'PYTHON_STDOUT', message })),
    ];
    await writeAutoPlanStatus({
      state: 'complete',
      message: 'Auto Plan inference finished successfully.',
      modelPath,
      roomCount: parsed.payload?.rooms?.length || 0,
      wallCount: parsed.payload?.walls?.length || 0,
      openingCount: parsed.payload?.openings?.length || 0,
    });
    return parsed;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
};

export const getAutoPlanResolvedPaths = () => {
  const prototypePath = resolvePrototypePath();
  return {
    prototypePath,
    modelPath: resolveModelPath(),
    pythonPath: resolvePythonPath(prototypePath),
  };
};

export const getAutoPlanStatus = async () => {
  try {
    const raw = await readFile(AUTO_PLAN_STATUS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {
      state: 'idle',
      message: 'No Auto Plan inference status has been recorded yet.',
      updatedAt: null,
      ...getAutoPlanResolvedPaths(),
    };
  }
};
