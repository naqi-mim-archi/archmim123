import fs from 'fs';
import path from 'path';

const transcriptPath = 'C:\\Users\\Muhammad Naqi Ejaz\\.gemini\\antigravity\\brain\\d2d78c55-794a-4d64-892a-42ee9c7932bb\\.system_generated\\logs\\transcript.jsonl';
if (!fs.existsSync(transcriptPath)) {
  console.log('Transcript file not found at:', transcriptPath);
  process.exit(0);
}

const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n');
for (const line of lines) {
  if (!line.trim()) continue;
  try {
    const obj = JSON.parse(line);
    if (obj.type === 'USER_INPUT') {
      console.log(`[USER INPUT] content:\n${obj.content}\n-----------------\n`);
    }
  } catch (e) {
    // ignore
  }
}
