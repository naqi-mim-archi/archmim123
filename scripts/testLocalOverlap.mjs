const doors = [
  { pos: [-0.0756, -4.301], rotation: 0, width: 0.906, type: "single" },
  { pos: [-1.5275, -3.3488], rotation: 90, width: 1.515, type: "sliding" },
  { pos: [-1.7977, 1.464], rotation: 0, width: 0.754, type: "single" },
];

const windows = [
  { pos: [-1.2617, 3.166], rotation: 90, width: 1.724, type: "standard" },
];

const sameRasterAperture = (first, second) => {
  const a = first.evidence?.pixelBounds, b = second.evidence?.pixelBounds;
  if (!a || !b) return Math.hypot(first.pos[0] - second.pos[0], first.pos[1] - second.pos[1]) <= 0.22;
  return false;
};

const elementsOverlapInPlan = (first, second) => {
  if (sameRasterAperture(first, second)) return true;
  const dist = Math.hypot(first.pos[0] - second.pos[0], first.pos[1] - second.pos[1]);
  const firstType = first.type || first.subType;
  const secondType = second.type || second.subType;
  const isDoor1 = firstType === 'door' || ['single', 'double', 'sliding', 'folding'].includes(firstType || '');
  const isDoor2 = secondType === 'door' || ['single', 'double', 'sliding', 'folding'].includes(secondType || '');
  const isCrossCategory = (isDoor1 || isDoor2) && (isDoor1 !== isDoor2);
  
  console.log(`[OVERLAP TEST] comparing Door at ${first.pos} (type: ${firstType}) and Window at ${second.pos} (type: ${secondType}), dist: ${dist}, isCrossCategory: ${isCrossCategory}`);
  
  if (isCrossCategory) {
    return dist <= 1.8;
  }
  return false;
};

const door = doors[2]; // Door 3
const window = windows[0]; // Window 8
const result = elementsOverlapInPlan(door, window);
console.log('RESULT:', result);
