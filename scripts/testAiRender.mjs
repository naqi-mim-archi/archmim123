import { build } from 'esbuild';
import { fork } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function run() {
  console.log('Compiling test suite testAiRenderRun.ts with esbuild...');
  
  await build({
    entryPoints: [path.join(__dirname, 'testAiRenderRun.ts')],
    bundle: true,
    outfile: path.join(__dirname, 'testAiRenderRun.js'),
    format: 'esm',
    platform: 'node',
    target: 'node18',
    external: ['@google/genai', 'google-auth-library', 'node-fetch', 'three', 'lucide-react', 'motion', 'react', 'react-dom'],
  });

  const child = fork(path.join(__dirname, 'testAiRenderRun.js'), [], {
    stdio: 'inherit'
  });

  child.on('close', (code) => {
    process.exit(code || 0);
  });
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
