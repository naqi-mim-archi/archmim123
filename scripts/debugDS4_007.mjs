import fs from 'fs';

// Let's modify the test file temporary to catch assertions instead of throwing, and run it
let content = fs.readFileSync('scripts/testLocalImageToJSON4g.mjs', 'utf8');

// Replace assert.equal with a logging function
content = content.replace(
  "assert.equal(plan[key].length, count, `DS4 ${id} must preserve its matched ${key} count.`)",
  "if (plan[key].length !== count) console.log(`[FAIL] DS4 ${id} ${key} count is ${plan[key].length}, expected ${count}\\nDoors:`, plan.doors.map(d => ({ pos: d.pos, type: d.type })))"
);

fs.writeFileSync('scripts/testLocalImageToJSON4g_temp.mjs', content, 'utf8');

import('./testLocalImageToJSON4g_temp.mjs').then(() => {
  // Clean up
  try {
    fs.unlinkSync('scripts/testLocalImageToJSON4g_temp.mjs');
  } catch (e) {}
});
