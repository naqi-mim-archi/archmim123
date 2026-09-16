import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Pre-bundles the Vercel functions into self-contained api/*.js.
// With "type": "module", Node's ESM resolver rejects the extensionless relative imports in the TS sources,
// so the sources can't be deployed unbundled. npm packages stay external (Vercel installs them).

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const entries = [
  { entry: 'services/vercelApiHandler.ts', out: 'api/index.js' },
  { entry: 'services/stripeWebhookHandler.ts', out: 'api/stripe-webhook.js' },
];

for (const { entry, out } of entries) {
  await build({
    entryPoints: [path.join(root, entry)],
    outfile: path.join(root, out),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    packages: 'external',
    logLevel: 'warning',
    banner: { js: `// GENERATED from ${entry} by scripts/buildApiFunction.mjs. Do not edit.` },
  });
  console.log(`Built ${out}`);
}
