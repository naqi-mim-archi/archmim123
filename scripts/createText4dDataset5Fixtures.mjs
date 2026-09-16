import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const sourceFolder = process.argv[2];
if (!sourceFolder || !existsSync(sourceFolder)) {
  throw new Error('Usage: node scripts/createText4dDataset5Fixtures.mjs <dataset-folder>');
}

const files = readdirSync(sourceFolder);
const fixtures = {};
for (const id of ['011', '012', '013']) {
  const imageName = files.find(name => name.toLowerCase().startsWith(`${id}_input_`) && name.toLowerCase().endsWith('.png'));
  if (!imageName) throw new Error(`Missing ${id}_input_*.png in ${sourceFolder}`);
  const imagePath = path.join(sourceFolder, imageName);
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

const outputPath = path.resolve('scripts/fixtures/text4d/dataset5RasterFixtures.mjs');
writeFileSync(outputPath, `// Generated from the user-supplied matched DS 05 rasters.\nexport const dataset5RasterFixtures = ${JSON.stringify(fixtures, null, 2)};\n`);
console.log(outputPath);
