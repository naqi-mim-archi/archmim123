import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const sourceFolder = process.argv[2];
if (!sourceFolder || !existsSync(sourceFolder)) {
  throw new Error('Usage: node scripts/createText4gDataset4Fixtures.mjs <dataset-folder>');
}

const fixtures = {};
for (let number = 5; number <= 10; number++) {
  const id = String(number).padStart(3, '0');
  const imagePath = path.join(sourceFolder, `${id}-input.jpeg`);
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'json', imagePath,
  ], { encoding: 'utf8' });
  if (probe.status !== 0) throw new Error(probe.stderr || `ffprobe failed for ${imagePath}`);
  const { width, height } = JSON.parse(probe.stdout).streams[0];
  const decoded = spawnSync('ffmpeg', [
    '-v', 'error', '-i', imagePath, '-f', 'rawvideo', '-pix_fmt', 'gray', 'pipe:1',
  ], { encoding: null, maxBuffer: width * height + 1024 * 1024 });
  if (decoded.status !== 0) throw new Error(decoded.stderr?.toString() || `ffmpeg failed for ${imagePath}`);
  fixtures[id] = {
    width,
    height,
    grayGzipBase64: gzipSync(decoded.stdout, { level: 9 }).toString('base64'),
  };
}

const outputPath = path.resolve('scripts/fixtures/text4g/dataset4RasterFixtures.mjs');
writeFileSync(outputPath, `// Generated from the user-supplied matched DS4 rasters.\nexport const dataset4RasterFixtures = ${JSON.stringify(fixtures, null, 2)};\n`);
console.log(outputPath);
