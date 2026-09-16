import fs from 'fs';

const content = fs.readFileSync('C:\\Users\\Muhammad Naqi Ejaz\\.gemini\\antigravity\\brain\\5431b0f5-7174-47af-9994-25f4f35e973d\\.system_generated\\tasks\\task-632.log', 'utf8');
const lines = content.split('\n');
for (const line of lines) {
  if (line.includes('job_7t5fms1b6') || line.includes('job_aw1poucjk')) {
    console.log(line);
  }
}
