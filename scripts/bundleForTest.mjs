import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Bundles a TypeScript module to a temp ESM file (npm packages external) and imports it.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const importTs = async (relativeEntry) => {
  // Inside the project so bare imports (firebase-admin, stripe…) resolve from node_modules.
  const outfile = path.join(root, 'node_modules', '.cache', 'archai-tests', `${path.basename(relativeEntry, '.ts')}-${process.pid}.mjs`);
  await build({
    entryPoints: [path.join(root, relativeEntry)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    packages: 'external',
    logLevel: 'error',
  });
  return import(pathToFileURL(outfile).href);
};

let passed = 0;
let failed = 0;
export const check = (condition, label) => {
  if (condition) {
    passed += 1;
    console.log(`[PASS] ${label}`);
  } else {
    failed += 1;
    console.log(`[FAIL] ${label}`);
  }
};
export const finish = () => {
  console.log(`\nPASSED: ${passed}\nFAILED: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
};
