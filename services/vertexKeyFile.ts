import fs from 'fs';
import os from 'os';
import path from 'path';

// Service-account keys are files locally (ml/auto_plan/*.json, gitignored) but cannot be committed,
// so on hosts like Vercel they arrive as environment variables instead. This writes that JSON to a
// temp file once per cold start and returns its path, so every backend keeps using a key *file*.

const cache = new Map<string, string>();

const materialise = (json: string, fileName: string): string | null => {
  try {
    const parsed = JSON.parse(json.trim().replace(/^'([\s\S]*)'$/, '$1'));
    if (!parsed?.client_email || !parsed?.private_key) return null;
    if (typeof parsed.private_key === 'string') parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    const target = path.join(os.tmpdir(), fileName);
    fs.writeFileSync(target, JSON.stringify(parsed), { mode: 0o600 });
    return target;
  } catch (error) {
    console.warn(`[Vertex] Could not read the service-account key from the environment: ${error instanceof Error ? error.message : error}`);
    return null;
  }
};

/**
 * Returns a usable key-file path: the repo file when it exists (local dev), otherwise a temp file
 * written from the first environment variable that holds the JSON. Returns the repo path when
 * neither is available, so existing "key not found" errors still name the expected location.
 */
export const resolveVertexKeyPath = (relativePath: string, envVarNames: string[]): string => {
  const repoPath = path.resolve(relativePath);
  if (fs.existsSync(repoPath)) return repoPath;

  const cacheKey = envVarNames.join('|');
  const cached = cache.get(cacheKey);
  if (cached && fs.existsSync(cached)) return cached;

  for (const name of envVarNames) {
    const value = process.env[name];
    if (!value) continue;
    const written = materialise(value, `archai-${path.basename(relativePath)}`);
    if (written) {
      cache.set(cacheKey, written);
      return written;
    }
  }
  return repoPath;
};

export const resolveDefaultVertexKeyPath = (): string =>
  resolveVertexKeyPath('ml/auto_plan/gcp_key.json', ['GOOGLE_VERTEX_SA_KEY_JSON', 'VERTEX_SA_KEY_JSON']);

export const resolveRenderVertexKeyPath = (): string =>
  resolveVertexKeyPath('ml/auto_plan/rendair_gcp_key.json', ['GOOGLE_VERTEX_RENDER_SA_KEY_JSON', 'RENDAIR_SA_KEY_JSON']);
