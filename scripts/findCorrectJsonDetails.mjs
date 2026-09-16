import fs from 'fs';
import path from 'path';

const correctJsonPath = 'C:\\Users\\Muhammad Naqi Ejaz\\Documents\\Temp 23\\Archi26\\02. Docs\\05. Auto Plan\\Data set 01\\DS 12\\67 - ortho\\67.2\\Correct_JSON.json';
const data = JSON.parse(fs.readFileSync(correctJsonPath, 'utf8'));

const elements = data.elements || [];
const doors = elements.filter(el => el.type === 'door');
const windows = elements.filter(el => el.type === 'window');
const openings = elements.filter(el => el.type === 'wall-opening');

console.log('CORRECT DOORS:');
doors.forEach(d => console.log(`pos: ${JSON.stringify(d.pos)}, width: ${d.width || d.widthM}, subType: ${d.subType}, rotation: ${d.rotation}`));

console.log('\nCORRECT WINDOWS:');
windows.forEach(w => console.log(`pos: ${JSON.stringify(w.pos)}, width: ${w.width || w.widthM}, subType: ${w.subType}, rotation: ${w.rotation}`));

console.log('\nCORRECT OPENINGS:');
openings.forEach(o => console.log(`pos: ${JSON.stringify(o.pos)}, width: ${o.width || o.widthM}, subType: ${o.subType}, rotation: ${o.rotation}`));
