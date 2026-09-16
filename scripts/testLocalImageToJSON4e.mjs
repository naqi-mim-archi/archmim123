import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { allElementsRasterFixture } from './fixtures/text4e/allElementsRasterFixture.mjs';
import { dataset4RasterFixtures } from './fixtures/text4e/dataset4RasterFixtures.mjs';
import { dataset5OcrFixtures } from './fixtures/text4e/dataset5OcrFixtures.mjs';
import { dataset5RasterFixtures } from './fixtures/text4e/dataset5RasterFixtures.mjs';

const allElementsExpected = JSON.parse(readFileSync(
  new URL('./fixtures/text4e/allElementsExpected.json', import.meta.url),
  'utf8',
));

const buildResult = await build({
  entryPoints: ['services/localImageToJSON4e.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(buildResult.outputFiles[0].text).toString('base64')}`;
const { extractGeometryFromImageData } = await import(moduleUrl);
const geometryBuildResult = await build({
  entryPoints: ['components/generative-wizard/features/text4e/geometry.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
});
const geometryModuleUrl = `data:text/javascript;base64,${Buffer.from(geometryBuildResult.outputFiles[0].text).toString('base64')}`;
const { completeText4eGeometry } = await import(geometryModuleUrl);

const EXTERIOR_WALL_THICKNESS_METERS = 0.23;
const wallOuterFaceBounds = walls => {
  const exteriorWalls = walls.filter(wall => /exterior|outer/i.test(wall.type || ''));
  const candidates = exteriorWalls.length ? exteriorWalls : walls;
  const points = candidates.flatMap(wall => {
    const [x1, y1] = wall.p1;
    const [x2, y2] = wall.p2;
    const length = Math.hypot(x2 - x1, y2 - y1);
    const half = (/exterior|outer/i.test(wall.type || '') ? EXTERIOR_WALL_THICKNESS_METERS : 0.115) / 2;
    const ox = length ? -(y2 - y1) / length * half : 0;
    const oy = length ? (x2 - x1) / length * half : 0;
    return [[x1 + ox, y1 + oy], [x1 - ox, y1 - oy], [x2 + ox, y2 + oy], [x2 - ox, y2 - oy]];
  });
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
};

const runQuietly = callback => {
  const originalWarn = console.warn;
  const originalInfo = console.info;
  console.warn = () => {};
  console.info = () => {};
  try {
    return callback();
  } finally {
    console.warn = originalWarn;
    console.info = originalInfo;
  }
};

const width = 600;
const height = 700;
const pixels = new Uint8ClampedArray(width * height * 4);
pixels.fill(255);

const fillRect = (x1, y1, x2, y2, gray = 0) => {
  for (let y = Math.max(0, y1); y <= Math.min(height - 1, y2); y++) {
    for (let x = Math.max(0, x1); x <= Math.min(width - 1, x2); x++) {
      const offset = (y * width + x) * 4;
      pixels[offset] = gray;
      pixels[offset + 1] = gray;
      pixels[offset + 2] = gray;
      pixels[offset + 3] = 255;
    }
  }
};
const horizontalWall = (y, x1, x2, thickness = 8) => fillRect(x1, y - Math.floor(thickness / 2), x2, y + Math.floor(thickness / 2));
const verticalWall = (x, y1, y2, thickness = 8) => fillRect(x - Math.floor(thickness / 2), y1, x + Math.floor(thickness / 2), y2);

// 10 m x 12 m orthogonal shell with a 2x2 partition network.
horizontalWall(80, 100, 380, 12);
horizontalWall(80, 430, 500, 12); // 1.25 m exterior window gap.
horizontalWall(620, 100, 140, 12);
horizontalWall(620, 175, 500, 12); // 0.875 m exterior entry gap.
verticalWall(100, 80, 620, 12);
verticalWall(500, 80, 620, 12);
horizontalWall(69, 381, 429, 1); // thin parallel window-frame evidence

horizontalWall(350, 100, 265, 7);
horizontalWall(350, 300, 500, 7); // 0.875 m internal door gap.
verticalWall(300, 80, 200, 7);
verticalWall(300, 235, 620, 7); // 0.78 m internal door gap.

// Thin perpendicular door leaves. They are evidence for openings, not walls.
verticalWall(141, 586, 620, 1);
verticalWall(266, 350, 384, 1);
horizontalWall(201, 300, 334, 1);

const options = {
  requestedBoundary: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 12 }, { x: 0, y: 12 }],
  designSummary: `Parameters:
Rooms Included:
- 1 Living Room
- 1 Kitchen
- 1 Master Bedroom
- 1 Bathroom
Room Adjacency:
- Kitchen near living
Layout Type: Compact
Floors: Single-story`,
};

const first = extractGeometryFromImageData({ width, height, data: pixels }, options);
const second = extractGeometryFromImageData({ width, height, data: pixels }, options);

assert.deepEqual(first, second, 'Local extraction must be deterministic.');
assert.ok((first.walls?.length || 0) >= 6, 'Expected the exterior shell and two partitions.');
assert.equal(first.rooms?.length, 4, 'Expected four enclosed spaces.');
assert.ok((first.doors?.length || 0) >= 2, 'Expected exterior and interior doors.');
assert.ok((first.windows?.length || 0) >= 1, 'Expected the exterior window gap.');
assert.deepEqual(first.furniture, [], 'Shell extraction must not invent furniture.');
assert.deepEqual(first.fixtures, [], 'Shell extraction must not invent fixtures.');
assert.ok(first.rooms?.every(room => !/^Room \d+$/.test(room.label)), 'Design-brief room names should be used when available.');
assert.equal(first.extractionDiagnostics.ocr.status, 'unavailable', 'Pure extraction must disclose absent OCR rather than treating it as readable text.');
assert.equal(first.extractionDiagnostics.ocr.observationCount, 0);
assert.equal(first.extractionDiagnostics.metrics.wallCount, first.walls.length);
assert.equal(first.extractionDiagnostics.metrics.enclosedSpaceCount, first.rooms.length);
assert.equal(first.extractionDiagnostics.metrics.detectedDoorCount, first.doors.length);
assert.equal(first.extractionDiagnostics.metrics.detectedWindowCount, first.windows.length);
assert.ok(first.walls.every(wall => wall.provenance === 'observed' && wall.evidence?.source === 'raster'), 'Extracted walls must retain raster provenance.');
assert.ok(first.doors.every(door => door.provenance === 'observed' && door.measuredWidth > 0), 'Detected doors must retain their measured opening span.');
assert.ok(
  first.doors.some(door => door.evidence?.confidence >= 0.8 && typeof door.isFlipped === 'boolean' && typeof door.facingFlipped === 'boolean'),
  'A raster-evidenced swing door must preserve hinge hand and facing direction.',
);
assert.ok(first.rooms.every(room => room.provenance && room.evidence), 'Every extracted room marker must disclose its source.');

// A compact wet room can be a freestanding structural wall box inside an
// open plan. It is disconnected from the exterior wall network, but its four
// evidenced sides and an OCR room tag must keep it out of the anti-clutter
// rejection used for cabinets and fixture symbols.
const islandWidth = 500;
const islandHeight = 500;
const islandPixels = new Uint8ClampedArray(islandWidth * islandHeight * 4);
islandPixels.fill(255);
const islandFillRect = (x1, y1, x2, y2, gray = 0) => {
  for (let y = Math.max(0, y1); y <= Math.min(islandHeight - 1, y2); y++) {
    for (let x = Math.max(0, x1); x <= Math.min(islandWidth - 1, x2); x++) {
      const offset = (y * islandWidth + x) * 4;
      islandPixels[offset] = gray;
      islandPixels[offset + 1] = gray;
      islandPixels[offset + 2] = gray;
      islandPixels[offset + 3] = 255;
    }
  }
};
const islandHorizontal = (y, x1, x2, thickness = 8) => islandFillRect(x1, y - Math.floor(thickness / 2), x2, y + Math.floor(thickness / 2));
const islandVertical = (x, y1, y2, thickness = 8) => islandFillRect(x - Math.floor(thickness / 2), y1, x + Math.floor(thickness / 2), y2);
islandHorizontal(50, 50, 450, 12);
islandHorizontal(450, 50, 450, 12);
islandVertical(50, 50, 450, 12);
islandVertical(450, 50, 450, 12);
islandVertical(275, 50, 450, 8);
islandHorizontal(180, 100, 145, 8);
islandHorizontal(180, 175, 210, 8);
islandHorizontal(310, 100, 210, 8);
islandVertical(100, 180, 310, 8);
islandVertical(210, 180, 310, 8);
islandVertical(145, 180, 210, 1);
const islandBathroomPlan = extractGeometryFromImageData({ width: islandWidth, height: islandHeight, data: islandPixels }, {
  requestedBoundary: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
  designSummary: 'Rooms Included:\n- 1 Living Room\n- 1 Bedroom\n- 1 Common Bathroom\nFloors: Single-story',
  textObservations: [{ text: 'Common Bathroom', confidence: 96, bbox: { x0: 112, y0: 225, x1: 198, y1: 255 } }],
  ocrStatus: 'provided',
});
const islandBathroomWalls = islandBathroomPlan.walls.filter(wall => {
  const bounds = wall.evidence?.pixelBounds;
  if (!bounds) return false;
  const centerX = (bounds.x0 + bounds.x1) / 2;
  const centerY = (bounds.y0 + bounds.y1) / 2;
  return centerX >= 90 && centerX <= 220 && centerY >= 170 && centerY <= 320;
});
assert.ok(islandBathroomWalls.length >= 4,
  'A freestanding OCR-tagged bathroom wall box must survive main-network clutter rejection.');
assert.ok(islandBathroomPlan.extractionDiagnostics.metrics.enclosedSpaceCount >= 3,
  'A retained freestanding bathroom must create its own enclosed raster space.');

// Exterior dimension strings use a long thin dimension line plus two short
// extension lines. That annotation must never become a balcony/railing when
// no open projection is present in the plan or Design Brief.
const dimensionOnlyPixels = new Uint8ClampedArray(pixels);
const paintDimensionPixel = (x, y, gray = 0) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = (y * width + x) * 4;
  dimensionOnlyPixels[offset] = gray;
  dimensionOnlyPixels[offset + 1] = gray;
  dimensionOnlyPixels[offset + 2] = gray;
  dimensionOnlyPixels[offset + 3] = 255;
};
for (let y = 80; y <= 620; y++) paintDimensionPixel(60, y);
for (let x = 60; x <= 100; x++) {
  paintDimensionPixel(x, 80);
  paintDimensionPixel(x, 620);
}
for (let x = 100; x <= 500; x++) paintDimensionPixel(x, 660);
for (let y = 620; y <= 660; y++) {
  paintDimensionPixel(100, y);
  paintDimensionPixel(500, y);
}
const dimensionOnlyPlan = extractGeometryFromImageData({ width, height, data: dimensionOnlyPixels }, options);
assert.equal(dimensionOnlyPlan.railings.length, 0, 'Exterior dimension annotations must not become false balcony railings.');
assert.ok(!dimensionOnlyPlan.rooms.some(room => /balcony|terrace|loggia/i.test(room.label)),
  'Exterior dimension annotations must not create a false balcony room.');

// Some clean drafting styles show a clear quarter-circle swing arc while the
// straight leaf is faint or absent. Preserve that door without reclassifying
// unrelated fixtures elsewhere in the raster.
const arcOnlyPixels = new Uint8ClampedArray(pixels);
for (let y = 355; y <= 390; y++) {
  for (let x = 263; x <= 268; x++) {
    const offset = (y * width + x) * 4;
    arcOnlyPixels[offset] = 255;
    arcOnlyPixels[offset + 1] = 255;
    arcOnlyPixels[offset + 2] = 255;
  }
}
for (let degrees = 0; degrees <= 90; degrees++) {
  const radians = degrees * Math.PI / 180;
  const x = Math.round(265 + Math.cos(radians) * 35);
  const y = Math.round(350 + Math.sin(radians) * 35);
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const px = x + ox, py = y + oy;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const offset = (py * width + px) * 4;
      arcOnlyPixels[offset] = 0;
      arcOnlyPixels[offset + 1] = 0;
      arcOnlyPixels[offset + 2] = 0;
      arcOnlyPixels[offset + 3] = 255;
    }
  }
}
const arcOnlyPlan = extractGeometryFromImageData({ width, height, data: arcOnlyPixels }, options);
assert.equal(arcOnlyPlan.doors.length, first.doors.length,
  'A centered quarter-circle swing arc must retain the door when its straight leaf is faint.');

// Reported Text 4.0 E direct-upload signature: wall-band merging can stop a
// narrow vertical hosted gap several pixels before the visible hinge. The
// offset leaf and its matching quarter-circle remain explicit raster evidence
// and must stay a door; a similarly sized bare gap must remain an opening.
const offsetSwingPixels = new Uint8ClampedArray(pixels);
for (let y = 196; y <= 205; y++) {
  for (let x = 296; x <= 340; x++) {
    const offset = (y * width + x) * 4;
    offsetSwingPixels[offset] = 255;
    offsetSwingPixels[offset + 1] = 255;
    offsetSwingPixels[offset + 2] = 255;
  }
}
const offsetHingeY = 245;
for (let x = 300; x <= 335; x++) {
  const offset = (offsetHingeY * width + x) * 4;
  offsetSwingPixels[offset] = 0;
  offsetSwingPixels[offset + 1] = 0;
  offsetSwingPixels[offset + 2] = 0;
  offsetSwingPixels[offset + 3] = 255;
}
for (let degrees = 0; degrees <= 90; degrees++) {
  const radians = degrees * Math.PI / 180;
  const x = Math.round(300 + Math.sin(radians) * 35);
  const y = Math.round(offsetHingeY - Math.cos(radians) * 35);
  const offset = (y * width + x) * 4;
  offsetSwingPixels[offset] = 0;
  offsetSwingPixels[offset + 1] = 0;
  offsetSwingPixels[offset + 2] = 0;
  offsetSwingPixels[offset + 3] = 255;
}
const offsetSwingPlan = extractGeometryFromImageData({ width, height, data: offsetSwingPixels }, options);
assert.ok(offsetSwingPlan.doors.some(door => door.rotation === 90
  && door.evidence?.notes?.some(note => /offset hinge/i.test(note))),
  'A narrow uploaded swing with matching offset leaf and arc evidence must remain a door.');

// Reported direct-upload raster style: walls are black, but the centered door
// leaf and swing arc are antialiased light gray (sampled near grayscale 190).
// Weak ink may recover this door only as an agreeing leaf-plus-arc pair.
const weakInkDoorBasePixels = new Uint8ClampedArray(pixels);
const paintWeakInk = (target, x, y, gray = 190) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const offset = (y * width + x) * 4;
  target[offset] = gray;
  target[offset + 1] = gray;
  target[offset + 2] = gray;
  target[offset + 3] = 255;
};
for (let y = 345; y <= 390; y++) {
  for (let x = 262; x <= 269; x++) paintWeakInk(weakInkDoorBasePixels, x, y, 255);
}
const weakInkDoorPixels = new Uint8ClampedArray(weakInkDoorBasePixels);
for (let y = 350; y <= 385; y++) {
  paintWeakInk(weakInkDoorPixels, 265, y);
  paintWeakInk(weakInkDoorPixels, 266, y);
}
for (let degrees = 0; degrees <= 90; degrees++) {
  const radians = degrees * Math.PI / 180;
  const x = Math.round(265 + Math.cos(radians) * 35);
  const y = Math.round(350 + Math.sin(radians) * 35);
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) paintWeakInk(weakInkDoorPixels, x + ox, y + oy);
  }
}
const weakInkDoorPlan = extractGeometryFromImageData({ width, height, data: weakInkDoorPixels }, options);
assert.equal(weakInkDoorPlan.doors.length, first.doors.length,
  'A centered light-gray leaf with its matching swing arc must not remain a wall opening.');
assert.ok(weakInkDoorPlan.doors.some(door => {
  const bounds = door.evidence?.pixelBounds;
  return bounds && bounds.x0 <= 266 && bounds.x1 >= 299 && Math.abs((bounds.y0 + bounds.y1) / 2 - 350) <= 5;
}), 'The recovered weak-ink door must stay hosted at the observed internal wall gap.');

const weakLeafOnlyPixels = new Uint8ClampedArray(weakInkDoorBasePixels);
for (let y = 350; y <= 385; y++) {
  paintWeakInk(weakLeafOnlyPixels, 265, y);
  paintWeakInk(weakLeafOnlyPixels, 266, y);
}
const weakLeafOnlyPlan = extractGeometryFromImageData({ width, height, data: weakLeafOnlyPixels }, options);
assert.equal(weakLeafOnlyPlan.doors.length, first.doors.length - 1,
  'A light-gray perpendicular line without a matching swing arc must remain insufficient door evidence.');

// A nearly closed swing leaf can run parallel to its host wall and visually
// bridge the aperture. The matching quarter-circle must recover that hosted
// door before the continuous wall run causes ordinary gap extraction to miss
// it. The parallel leaf alone remains insufficient evidence.
const closedSwingBasePixels = new Uint8ClampedArray(pixels);
for (let y = 345; y <= 390; y++) {
  for (let x = 262; x <= 269; x++) paintWeakInk(closedSwingBasePixels, x, y, 255);
}
for (let y = 346; y <= 354; y++) {
  for (let x = 265; x <= 300; x++) paintWeakInk(closedSwingBasePixels, x, y, 0);
}
for (let x = 265; x <= 300; x++) {
  paintWeakInk(closedSwingBasePixels, x, 340, 0);
  paintWeakInk(closedSwingBasePixels, x, 341, 0);
  paintWeakInk(closedSwingBasePixels, x, 342, 0);
}
for (let y = 342; y <= 350; y++) paintWeakInk(closedSwingBasePixels, 265, y, 0);

const closedSwingPixels = new Uint8ClampedArray(closedSwingBasePixels);
for (let degrees = 12; degrees <= 78; degrees++) {
  const radians = degrees * Math.PI / 180;
  const x = Math.round(265 + Math.cos(radians) * 35);
  const y = Math.round(350 - Math.sin(radians) * 35);
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) paintWeakInk(closedSwingPixels, x + ox, y + oy, 0);
  }
}
const closedSwingPlan = extractGeometryFromImageData({ width, height, data: closedSwingPixels }, options);
assert.equal(closedSwingPlan.doors.length, first.doors.length,
  'A parallel near-closed leaf with its matching quarter-circle must recover a door from a continuous wall run.');
assert.ok(closedSwingPlan.doors.some(door => {
  const bounds = door.evidence?.pixelBounds;
  return bounds && bounds.x0 <= 266 && bounds.x1 >= 299 && Math.abs((bounds.y0 + bounds.y1) / 2 - 350) <= 5;
}), 'The recovered near-closed swing must remain hosted at its raster-evidenced wall interval.');

const closedLeafOnlyPlan = extractGeometryFromImageData({ width, height, data: closedSwingBasePixels }, options);
assert.equal(closedLeafOnlyPlan.doors.length, first.doors.length - 1,
  'A parallel line over a continuous wall without a matching swing arc must not become a door.');

// Sliding-door regression: two staggered, partial-width panels on opposite
// wall faces must be classified as a door, while full-width parallel lines
// remain window evidence.
const slidingWidth = 600;
const slidingHeight = 500;
const slidingPixels = new Uint8ClampedArray(slidingWidth * slidingHeight * 4);
slidingPixels.fill(255);
const slidingFillRect = (x1, y1, x2, y2, gray = 0) => {
  for (let y = Math.max(0, y1); y <= Math.min(slidingHeight - 1, y2); y++) {
    for (let x = Math.max(0, x1); x <= Math.min(slidingWidth - 1, x2); x++) {
      const offset = (y * slidingWidth + x) * 4;
      slidingPixels[offset] = gray;
      slidingPixels[offset + 1] = gray;
      slidingPixels[offset + 2] = gray;
      slidingPixels[offset + 3] = 255;
    }
  }
};
const slidingHorizontal = (y, x1, x2, thickness = 8) => slidingFillRect(x1, y - Math.floor(thickness / 2), x2, y + Math.floor(thickness / 2));
const slidingVertical = (x, y1, y2, thickness = 8) => slidingFillRect(x - Math.floor(thickness / 2), y1, x + Math.floor(thickness / 2), y2);
slidingHorizontal(80, 100, 500, 12);
slidingHorizontal(420, 100, 500, 12);
slidingVertical(100, 80, 420, 12);
slidingVertical(500, 80, 420, 12);
slidingHorizontal(250, 100, 230, 8);
slidingHorizontal(250, 290, 500, 8);
slidingHorizontal(244, 231, 264, 1);
slidingHorizontal(256, 256, 289, 1);
const slidingPlan = extractGeometryFromImageData({ width: slidingWidth, height: slidingHeight, data: slidingPixels }, {
  requestedBoundary: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }],
  designSummary: 'Rooms Included:\n- 1 Living Room\n- 1 Dining Room\nFloors: Single-story',
});
assert.ok(slidingPlan.doors.some(door => door.type === 'sliding'), 'Staggered sliding panels must survive as a sliding-door subtype.');

const narrowSlidingPixels = new Uint8ClampedArray(slidingWidth * slidingHeight * 4);
narrowSlidingPixels.fill(255);
const narrowFillRect = (x1, y1, x2, y2, gray = 0) => {
  for (let y = Math.max(0, y1); y <= Math.min(slidingHeight - 1, y2); y++) {
    for (let x = Math.max(0, x1); x <= Math.min(slidingWidth - 1, x2); x++) {
      const offset = (y * slidingWidth + x) * 4;
      narrowSlidingPixels[offset] = gray;
      narrowSlidingPixels[offset + 1] = gray;
      narrowSlidingPixels[offset + 2] = gray;
      narrowSlidingPixels[offset + 3] = 255;
    }
  }
};
const narrowHorizontal = (y, x1, x2, thickness = 8) => narrowFillRect(x1, y - Math.floor(thickness / 2), x2, y + Math.floor(thickness / 2));
const narrowVertical = (x, y1, y2, thickness = 8) => narrowFillRect(x - Math.floor(thickness / 2), y1, x + Math.floor(thickness / 2), y2);
narrowHorizontal(80, 100, 500, 12);
narrowHorizontal(420, 100, 500, 12);
narrowVertical(100, 80, 420, 12);
narrowVertical(500, 80, 420, 12);
narrowHorizontal(250, 100, 240, 8);
narrowHorizontal(250, 265, 500, 8);
narrowHorizontal(244, 241, 253, 1);
narrowHorizontal(256, 252, 264, 1);
const narrowSlidingPlan = extractGeometryFromImageData({ width: slidingWidth, height: slidingHeight, data: narrowSlidingPixels }, {
  requestedBoundary: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 8 }, { x: 0, y: 8 }],
  designSummary: 'Rooms Included:\n- 1 Living Room\n- 1 Bathroom\nFloors: Single-story',
});
assert.ok(!narrowSlidingPlan.doors.some(door => door.type === 'sliding'),
  'A fixture-width parallel mark below 0.8 m must not become a sliding door.');

// Matched all-elements fixture derived from Image_Floorplan_01.jpeg and its
// user-verified JSON_Floorplan_01.json. The stored raster is the extractor's
// Otsu-thresholded image, compressed as portable row-run data.
const allElementsPixels = new Uint8ClampedArray(
  allElementsRasterFixture.width * allElementsRasterFixture.height * 4,
);
allElementsPixels.fill(255);
const allElementsPackedRuns = gunzipSync(Buffer.from(
  allElementsRasterFixture.darkRunPairsGzipBase64,
  'base64',
));
const allElementsRunPairs = new Uint32Array(
  allElementsPackedRuns.buffer,
  allElementsPackedRuns.byteOffset,
  allElementsPackedRuns.byteLength / Uint32Array.BYTES_PER_ELEMENT,
);
for (let index = 0; index < allElementsRunPairs.length; index += 2) {
  const start = allElementsRunPairs[index];
  const end = start + allElementsRunPairs[index + 1];
  for (let pixel = start; pixel < end; pixel++) {
    const offset = pixel * 4;
    allElementsPixels[offset] = 0;
    allElementsPixels[offset + 1] = 0;
    allElementsPixels[offset + 2] = 0;
  }
}
const allElementsPlan = extractGeometryFromImageData({
  width: allElementsRasterFixture.width,
  height: allElementsRasterFixture.height,
  data: allElementsPixels,
}, {
  requestedWidthMeters: allElementsExpected.requestedWidthMeters,
  requestedDepthMeters: allElementsExpected.requestedDepthMeters,
  enforceRequestedEnvelope: true,
  exteriorWallThicknessMeters: 0.2286,
  disableOcr: true,
  ocrStatus: 'disabled',
});
const expectedDoorTypes = allElementsExpected.doors.map(door => door.subtype).sort();
const actualDoorTypes = allElementsPlan.doors.map(door => door.type).sort();
assert.deepEqual(actualDoorTypes, expectedDoorTypes, 'The matched raster must recover every door subtype without extras.');
for (const expectedDoor of allElementsExpected.doors) {
  const candidates = allElementsPlan.doors.filter(door => door.type === expectedDoor.subtype);
  const match = candidates.sort((a, b) =>
    Math.abs(a.measuredWidth - expectedDoor.widthMeters) - Math.abs(b.measuredWidth - expectedDoor.widthMeters))[0];
  assert.ok(match && Math.abs(match.measuredWidth - expectedDoor.widthMeters) <= 0.035,
    `${expectedDoor.subtype} door width must remain within 35 mm of the matched JSON.`);
}
const allElementsSingles = allElementsPlan.doors.filter(door => door.type === 'single');
assert.equal(allElementsSingles.length, 2);
assert.deepEqual(
  allElementsSingles.map(door => door.isFlipped).sort(),
  [false, true],
  'The two single-door hinge hands must remain distinct.',
);
assert.ok(allElementsSingles.every(door => door.facingFlipped === true), 'Both matched single doors must retain their north-opening facing.');
assert.equal(allElementsPlan.doors.filter(door => door.mandatoryExteriorEntry).length, 1);
assert.equal(allElementsPlan.doors.find(door => door.mandatoryExteriorEntry)?.type, 'double', 'The evidenced double door must remain the main entrance.');

const expectedWindowWidths = [...allElementsExpected.windows].sort((a, b) => a - b);
const actualWindowWidths = allElementsPlan.windows.map(window => window.measuredWidth).sort((a, b) => a - b);
assert.equal(actualWindowWidths.length, expectedWindowWidths.length, 'The wall opening must not become a third window.');
actualWindowWidths.forEach((measured, index) => assert.ok(
  Math.abs(measured - expectedWindowWidths[index]) <= 0.035,
  'Matched window widths must remain within 35 mm of expected JSON.',
));
assert.ok(allElementsPlan.windows.every(window => window.type === 'standard'), 'Window subtype must not be inferred from width alone.');
const pointToWallProjection = (point, wall) => {
  const dx = wall.p2[0] - wall.p1[0], dy = wall.p2[1] - wall.p1[1];
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1,
    ((point[0] - wall.p1[0]) * dx + (point[1] - wall.p1[1]) * dy) / lengthSquared,
  )) : 0;
  const projected = [wall.p1[0] + dx * t, wall.p1[1] + dy * t];
  return { t, distance: Math.hypot(point[0] - projected[0], point[1] - projected[1]), length: Math.sqrt(lengthSquared) };
};
allElementsPlan.windows.forEach(window => {
  const nearestHost = allElementsPlan.walls.map(wall => ({ wall, ...pointToWallProjection(window.pos, wall) }))
    .sort((a, b) => a.distance - b.distance)[0];
  const edgeMargin = 0.0762;
  const halfWidthRatio = window.width / (2 * nearestHost.length);
  assert.ok(nearestHost.distance <= 0.08, 'Each observed window must remain on a continuous extracted host wall.');
  assert.ok(nearestHost.length >= window.width + edgeMargin * 2,
    'The host wall must be long enough for main-canvas validation to preserve the window.');
  assert.ok(nearestHost.t - halfWidthRatio >= edgeMargin / nearestHost.length - 1e-6
    && nearestHost.t + halfWidthRatio <= 1 - edgeMargin / nearestHost.length + 1e-6,
  'The observed window position must fit its host without preview-only clamping.');
});
const westLivingWindow = allElementsPlan.windows.find(window => window.rotation === 90 && window.width > 2.3);
assert.ok(westLivingWindow, 'The matched west living-room window must be retained.');
assert.ok(Math.abs(westLivingWindow.evidence.pixelBounds.y0 - 377) <= 1
  && Math.abs(westLivingWindow.evidence.pixelBounds.y1 - 560) <= 1,
'OCR text must not displace the west window from its raster-evidenced jambs.');
assert.equal(allElementsPlan.openings.length, 1, 'The kitchen access must remain a wall opening.');
assert.ok(Math.abs(allElementsPlan.openings[0].measuredWidth - allElementsExpected.wallOpenings[0]) <= 0.035);

assert.equal(allElementsPlan.columns.length, allElementsExpected.columns.count);
assert.ok(allElementsPlan.columns.every(column =>
  column.presetId === 'col_lg_sq' && column.width === 0.45 && column.depth === 0.45),
  'All four visually evidenced corner columns must resolve to the 18-inch preset.',
);
assert.equal(allElementsPlan.stairs.length, allElementsExpected.stairs.count);
assert.equal(allElementsPlan.stairs[0].presetId, 'stair_lin');
assert.equal(allElementsPlan.stairs[0].width, allElementsExpected.stairs.widthMeters);
assert.equal(allElementsPlan.stairs[0].stepCount, allElementsExpected.stairs.stepCount);
assert.ok(allElementsPlan.stairs[0].p1[1] > allElementsPlan.stairs[0].p2[1], 'North-to-south stair direction must survive raster Y inversion.');
assert.equal(allElementsPlan.railings.length, allElementsExpected.railings.count);
assert.ok(allElementsPlan.railings.every(railing => railing.presetId === 'rail_balcony'));
assert.equal(allElementsPlan.slabs.length, allElementsExpected.slabs.count);
const matchedBoundaryX = allElementsPlan.boundary.map(point => point[0]);
const matchedBoundaryY = allElementsPlan.boundary.map(point => point[1]);
const matchedSlabX = allElementsPlan.slabs[0].boundary.map(point => point[0]);
const matchedSlabY = allElementsPlan.slabs[0].boundary.map(point => point[1]);
assert.ok(Math.abs(Math.max(...matchedBoundaryX) - Math.min(...matchedBoundaryX) - allElementsExpected.requestedWidthMeters) <= 0.35,
  'Property width must remain measured at the extreme fixed-property faces without stretching the raster.');
assert.ok(Math.abs(Math.max(...matchedBoundaryY) - Math.min(...matchedBoundaryY) - allElementsExpected.requestedDepthMeters) <= 0.35,
  'Property depth must remain measured at the extreme fixed-property faces without stretching the raster.');
assert.ok(Math.max(...matchedSlabX) - Math.min(...matchedSlabX) < Math.max(...matchedBoundaryX) - Math.min(...matchedBoundaryX),
  'The native floor slab must stop at wall/column centerlines instead of exceeding their outer faces.');
assert.ok(Math.max(...matchedSlabY) - Math.min(...matchedSlabY) < Math.max(...matchedBoundaryY) - Math.min(...matchedBoundaryY),
  'The native floor slab depth must stop at wall/column centerlines.');
assert.ok(allElementsPlan.slabs[0].boundary.length >= 8, 'The floor slab must include the balcony projection, not collapse to the wall rectangle.');
assert.ok(allElementsExpected.requiredRoomLabels.every(label =>
  allElementsPlan.rooms.some(room => room.label === label && room.provenance === 'observed')),
  'The evidenced balcony projection must retain its space marker even when OCR misses the label.',
);
assert.deepEqual(allElementsPlan.furniture, []);
assert.deepEqual(allElementsPlan.fixtures, []);
assert.ok(allElementsPlan.walls.every(wall => Math.hypot(
  wall.p2[0] - wall.p1[0], wall.p2[1] - wall.p1[1],
) > 0.35), 'Column-edge fragments must not survive as separate short walls.');

// A dimension line with two extension lines forms the same coarse three-edge
// signature as a railing. An explicit BALCONY OCR label must spatially bind the
// detector to the real west projection and reject the detached north dimension.
const allElementsWithBalconyOcr = extractGeometryFromImageData({
  width: allElementsRasterFixture.width,
  height: allElementsRasterFixture.height,
  data: allElementsPixels,
}, {
  requestedWidthMeters: allElementsExpected.requestedWidthMeters,
  requestedDepthMeters: allElementsExpected.requestedDepthMeters,
  enforceRequestedEnvelope: true,
  exteriorWallThicknessMeters: 0.2286,
  ocrStatus: 'provided',
  textObservations: [{
    text: 'BALCONY', confidence: 96,
    bbox: { x0: 140, y0: 430, x1: 238, y1: 466 },
  }],
});
assert.equal(allElementsWithBalconyOcr.railings.length, 3);
const ocrRailingX = allElementsWithBalconyOcr.railings.flatMap(railing => [railing.p1[0], railing.p2[0]]);
const ocrRailingY = allElementsWithBalconyOcr.railings.flatMap(railing => [railing.p1[1], railing.p2[1]]);
assert.ok(
  Math.max(...ocrRailingY) - Math.min(...ocrRailingY) > Math.max(...ocrRailingX) - Math.min(...ocrRailingX),
  'BALCONY text must select the tall west-side railing, not the north dimension annotation.',
);
const completedAllElements = runQuietly(() => completeText4eGeometry(allElementsWithBalconyOcr));
assert.equal(completedAllElements.windows.length, allElementsWithBalconyOcr.windows.length,
  'Raster completion must not reclassify an observed balcony-side window as an invented door.');
assert.equal(completedAllElements.doors.length, allElementsWithBalconyOcr.doors.length,
  'Raster completion must not add circulation doors absent from the image.');
assert.deepEqual(completedAllElements.railings, allElementsWithBalconyOcr.railings,
  'Raster completion must preserve the evidenced balcony railing location.');
assert.deepEqual(completedAllElements.slabs, allElementsWithBalconyOcr.slabs,
  'Raster completion must preserve the single extracted slab.');

// Matched DS4 regression set: five conventional plans plus one deliberately
// disconnected architectural-element sheet. These fixtures exercise the same
// shared converter used by generated and manually uploaded Text 4.0 E images.
const dataset4Cases = {
  '005': {
    width: 9.263294333199589, depth: 11.363951442301511,
    textObservations: [{ text: 'BALCONY', confidence: 96, bbox: { x0: 140, y0: 430, x1: 240, y1: 468 } }],
    expected: { doors: 5, windows: 2, openings: 1, columns: 4, stairs: 1, railings: 3, slabs: 1 },
    doorTypes: ['double', 'folding', 'single', 'single', 'sliding'],
  },
  '006': {
    width: 9.94920393439011, depth: 8.079611069611682,
    textObservations: [{ text: 'BALCONY', confidence: 96, bbox: { x0: 835, y0: 168, x1: 940, y1: 205 } }],
    expected: { doors: 8, windows: 3, openings: 2, columns: 2, stairs: 2, railings: 3, slabs: 0 },
    doorTypes: ['double', 'double', 'folding', 'single', 'single', 'single', 'single', 'sliding'],
  },
  '007': {
    width: 11.009509287667726, depth: 16.849631178452654,
    textObservations: [{ text: 'BALCONY', confidence: 96, bbox: { x0: 170, y0: 465, x1: 258, y1: 500 } }],
    expected: { doors: 9, windows: 6, openings: 2, columns: 4, stairs: 1, railings: 3, slabs: 1 },
    requiredDoorTypes: ['folding', 'sliding'],
  },
  '008': {
    width: 11.763333333333334, depth: 7.763333333333334,
    textObservations: [],
    expected: { doors: 6, windows: 2, openings: 0, columns: 0, stairs: 0, railings: 0, slabs: 1 },
  },
  '009': {
    width: 7.496666666666667, depth: 10.909857927580909,
    textObservations: [],
    expected: { doors: 5, windows: 2, openings: 0, columns: 0, stairs: 0, railings: 0, slabs: 1 },
  },
  '010': {
    width: 6.2514213010738695, depth: 7.383020258170265,
    textObservations: [{ text: 'BALCONY', confidence: 96, bbox: { x0: 138, y0: 520, x1: 295, y1: 562 } }],
    expected: { doors: 5, windows: 2, openings: 0, columns: 0, stairs: 0, railings: 1, slabs: 1 },
    requiredDoorTypes: ['sliding'],
  },
};
const expandGrayFixture = fixture => {
  const gray = gunzipSync(Buffer.from(fixture.grayGzipBase64, 'base64'));
  const rgba = new Uint8ClampedArray(gray.length * 4);
  for (let index = 0; index < gray.length; index++) {
    const offset = index * 4;
    rgba[offset] = gray[index];
    rgba[offset + 1] = gray[index];
    rgba[offset + 2] = gray[index];
    rgba[offset + 3] = 255;
  }
  return { width: fixture.width, height: fixture.height, data: rgba };
};
const dataset4Plans = {};
for (const [id, testCase] of Object.entries(dataset4Cases)) {
  const plan = extractGeometryFromImageData(expandGrayFixture(dataset4RasterFixtures[id]), {
    requestedWidthMeters: testCase.width,
    requestedDepthMeters: testCase.depth,
    enforceRequestedEnvelope: true,
    exteriorWallThicknessMeters: 0.2286,
    textObservations: testCase.textObservations,
    ocrStatus: 'provided',
  });
  dataset4Plans[id] = plan;
  for (const [key, count] of Object.entries(testCase.expected)) {
    assert.equal(plan[key].length, count, `DS4 ${id} must preserve its matched ${key} count.`);
  }
  if (testCase.doorTypes) {
    assert.deepEqual(plan.doors.map(door => door.type).sort(), [...testCase.doorTypes].sort(),
      `DS4 ${id} must preserve every matched door family.`);
  }
  for (const requiredType of testCase.requiredDoorTypes || []) {
    assert.ok(plan.doors.some(door => door.type === requiredType), `DS4 ${id} must retain its ${requiredType} door.`);
  }
  for (const opening of [...plan.doors, ...plan.windows, ...plan.openings]) {
    const nearestHost = plan.walls.map(wall => ({ wall, ...pointToWallProjection(opening.pos, wall) }))
      .sort((a, b) => a.distance - b.distance)[0];
    assert.ok(nearestHost && nearestHost.distance <= 0.08,
      `DS4 ${id} ${opening.type || 'wall-opening'} must remain tied to a continuous host wall.`);
    assert.ok(nearestHost.length + 1e-6 >= opening.width,
      `DS4 ${id} host wall must be at least as long as its opening.`);
  }
  assert.deepEqual(plan.furniture, []);
  assert.deepEqual(plan.fixtures, []);
}
assert.ok(dataset4Plans['008'].windows.some(window => window.rotation === 90),
  'DS4 008 must recover the west vertical window that a bridged frame previously erased.');
assert.equal(dataset4Plans['010'].windows.length, 2,
  'DS4 010 balcony railing and solid partition must not survive as false windows.');
assert.equal(dataset4Plans['010'].railings.length, 1,
  'DS4 010 embedded balcony edge must be retained as a railing rather than a window.');

// Matched DS05 regression set: these Text 4.0 E-generated images contain
// overlapping labels and dense fixture strokes. The shared converter must
// prefer clean, hosted architectural evidence over speculative elements.
const dataset5Cases = {
  '011': {
    width: 10.5, depth: 8.6,
    expected: { doors: 7, windows: 10, columns: 0, railings: 0, rooms: 7 },
    forbiddenDoorTypes: ['double', 'folding'],
  },
  '012': {
    width: 7.3, depth: 8.5,
    expected: { doors: 5, windows: 3, openings: 1, columns: 0, railings: 1, rooms: 8 },
    forbiddenDoorTypes: ['double', 'folding', 'sliding'],
  },
  '013': {
    width: 9.144, depth: 15.24,
    expected: { doors: 8, columns: 0, railings: 3, rooms: 9 },
    forbiddenDoorTypes: ['double'],
    requiredDoorTypes: ['folding'],
  },
};
const axisAlignedInterval = wall => {
  const horizontal = Math.abs(wall.p2[0] - wall.p1[0]) >= Math.abs(wall.p2[1] - wall.p1[1]);
  return horizontal
    ? { axis: 'horizontal', line: (wall.p1[1] + wall.p2[1]) / 2, start: Math.min(wall.p1[0], wall.p2[0]), end: Math.max(wall.p1[0], wall.p2[0]) }
    : { axis: 'vertical', line: (wall.p1[0] + wall.p2[0]) / 2, start: Math.min(wall.p1[1], wall.p2[1]), end: Math.max(wall.p1[1], wall.p2[1]) };
};
const dataset5Plans = {};
for (const [id, testCase] of Object.entries(dataset5Cases)) {
  const plan = extractGeometryFromImageData(expandGrayFixture(dataset5RasterFixtures[id]), {
    requestedWidthMeters: testCase.width,
    requestedDepthMeters: testCase.depth,
    enforceRequestedEnvelope: true,
    exteriorWallThicknessMeters: 0.2286,
    textObservations: dataset5OcrFixtures[id],
    ocrStatus: 'provided',
  });
  dataset5Plans[id] = plan;
  for (const [key, count] of Object.entries(testCase.expected)) {
    assert.equal(plan[key].length, count, `DS05 ${id} must preserve its cleaned ${key} count.`);
  }
  for (const forbiddenType of testCase.forbiddenDoorTypes || []) {
    assert.ok(!plan.doors.some(door => door.type === forbiddenType),
      `DS05 ${id} must not promote an ambiguous window or wall junction to a ${forbiddenType} door.`);
  }
  for (const requiredType of testCase.requiredDoorTypes || []) {
    assert.ok(plan.doors.some(door => door.type === requiredType),
      `DS05 ${id} must retain its visually evidenced ${requiredType} door.`);
  }
  for (const door of plan.doors) {
    const maximumWidth = door.type === 'single' ? 1.4 : door.type === 'sliding' ? 3.2 : 2.4;
    assert.ok((door.measuredWidth || door.width) <= maximumWidth + 1e-6,
      `DS05 ${id} must reject implausibly oversized ${door.type} doors.`);
  }
  for (const opening of [...plan.doors, ...plan.windows, ...plan.openings]) {
    const nearestHost = plan.walls.map(wall => ({ wall, ...pointToWallProjection(opening.pos, wall) }))
      .sort((a, b) => a.distance - b.distance)[0];
    assert.ok(nearestHost && nearestHost.distance <= 0.08,
      `DS05 ${id} ${opening.type || 'wall-opening'} must remain tied to a continuous host wall.`);
    assert.ok(nearestHost.length + 1e-6 >= opening.width,
      `DS05 ${id} host wall must be at least as long as its opening.`);
  }
  assert.ok(plan.walls.every(wall => Math.hypot(
    wall.p2[0] - wall.p1[0], wall.p2[1] - wall.p1[1],
  ) > 0.35), `DS05 ${id} must remove short wall clutter at intersections.`);
  for (let firstIndex = 0; firstIndex < plan.walls.length; firstIndex++) {
    const firstInterval = axisAlignedInterval(plan.walls[firstIndex]);
    for (let secondIndex = firstIndex + 1; secondIndex < plan.walls.length; secondIndex++) {
      const secondInterval = axisAlignedInterval(plan.walls[secondIndex]);
      if (firstInterval.axis !== secondInterval.axis || Math.abs(firstInterval.line - secondInterval.line) > 0.04) continue;
      const overlap = Math.min(firstInterval.end, secondInterval.end) - Math.max(firstInterval.start, secondInterval.start);
      assert.ok(overlap <= 0.06,
        `DS05 ${id} must not retain overlapping collinear wall fragments.`);
    }
  }
  assert.deepEqual(plan.furniture, []);
  assert.deepEqual(plan.fixtures, []);
}
assert.equal(dataset5Plans['011'].doors.filter(door => door.type === 'sliding').length, 1,
  'DS05 011 must retain its clear sliding door while rejecting false folding doors.');
assert.equal(dataset5Plans['013'].doors.filter(door => door.type === 'folding').length, 1,
  'DS05 013 must require a distinctive folding symbol instead of converting ordinary windows.');

const boundaryX = first.boundary.map(point => point[0]);
const boundaryY = first.boundary.map(point => point[1]);
const boundaryWidth = Math.max(...boundaryX) - Math.min(...boundaryX);
const boundaryHeight = Math.max(...boundaryY) - Math.min(...boundaryY);
assert.ok(boundaryWidth <= 10 + 1e-9 && boundaryHeight <= 12 + 1e-9, 'Boundary must fit inside the request.');
assert.ok(Math.abs(boundaryHeight - 12) < 1e-9, 'The limiting requested dimension should be filled.');
const firstWallFaces = wallOuterFaceBounds(first.walls);
const firstWallPoints = first.walls.flatMap(wall => [wall.p1, wall.p2]);
const firstCenterlineWidth = Math.max(...firstWallPoints.map(point => point[0])) - Math.min(...firstWallPoints.map(point => point[0]));
const firstCenterlineHeight = Math.max(...firstWallPoints.map(point => point[1])) - Math.min(...firstWallPoints.map(point => point[1]));
assert.ok(Math.abs(firstCenterlineWidth / firstCenterlineHeight - 400 / 540) < 1e-9, 'Uniform scaling must preserve the raster wall-axis aspect ratio.');
assert.ok(Math.abs(firstWallFaces.height - 12) < 1e-9, 'Requested depth must terminate at the exterior wall faces.');
assert.ok(Math.abs(boundaryWidth - firstWallFaces.width) < 1e-9 && Math.abs(boundaryHeight - firstWallFaces.height) < 1e-9, 'The JSON property boundary must coincide with the extreme exterior wall faces.');

const exactEnvelope = extractGeometryFromImageData({ width, height, data: pixels }, {
  ...options,
  enforceRequestedEnvelope: true,
});
const exactWallPoints = exactEnvelope.walls.flatMap(wall => [wall.p1, wall.p2]);
const exactWidth = Math.max(...exactWallPoints.map(point => point[0])) - Math.min(...exactWallPoints.map(point => point[0]));
const exactHeight = Math.max(...exactWallPoints.map(point => point[1])) - Math.min(...exactWallPoints.map(point => point[1]));
const exactWallFaces = wallOuterFaceBounds(exactEnvelope.walls);
assert.ok(exactWallFaces.width <= 10 + 1e-9 && exactWallFaces.height <= 12 + 1e-9, 'Text 4.0 E exterior wall faces must fit inside the confirmed envelope.');
assert.ok(Math.abs(exactWallFaces.height - 12) < 1e-9, 'Uniform scaling should fill the limiting requested axis at the exterior wall face.');
assert.ok(Math.abs(exactWidth / exactHeight - 400 / 540) < 1e-9, 'Envelope enforcement must preserve the raster wall aspect ratio.');
assert.equal(exactEnvelope.extractionDiagnostics.scaleSource, 'requested-boundary');
assert.ok(
  exactEnvelope.extractionDiagnostics.warnings.some(warning => /uniform scale preserved the floorplan aspect ratio/i.test(warning)),
  'A source-image aspect mismatch must disclose aspect-preserving letterboxing.',
);
const completedExactEnvelope = runQuietly(() => completeText4eGeometry(exactEnvelope, options.designSummary));
const completedExactPoints = completedExactEnvelope.walls.flatMap(wall => [wall.p1, wall.p2]);
assert.ok(
  Math.abs(
    (Math.max(...completedExactPoints.map(point => point[0])) - Math.min(...completedExactPoints.map(point => point[0]))) /
    (Math.max(...completedExactPoints.map(point => point[1])) - Math.min(...completedExactPoints.map(point => point[1]))) - 400 / 540
  ) < 1e-9,
  'Geometry completion must preserve the traced wall aspect ratio.',
);
const completedExactWallFaces = wallOuterFaceBounds(completedExactEnvelope.walls);
assert.ok(
  Math.abs(completedExactWallFaces.height - 12) < 1e-9,
  'Geometry completion must preserve the authoritative outer-face depth.',
);
assert.ok(
  ['walls', 'doors', 'windows', 'openings', 'rooms'].every(key => (completedExactEnvelope[key] || []).every(item => item.provenance && item.evidence)),
  'Observed and locally completed geometry must remain distinguishable after completion.',
);

const horizontalOnlyEnvelope = extractGeometryFromImageData({ width, height, data: pixels }, {
  requestedWidthMeters: 10,
  designSummary: options.designSummary,
  enforceRequestedEnvelope: true,
});
const horizontalOnlyFaces = wallOuterFaceBounds(horizontalOnlyEnvelope.walls);
const horizontalOnlyPoints = horizontalOnlyEnvelope.walls.flatMap(wall => [wall.p1, wall.p2]);
const horizontalOnlyCenterlineWidth = Math.max(...horizontalOnlyPoints.map(point => point[0])) - Math.min(...horizontalOnlyPoints.map(point => point[0]));
const horizontalOnlyCenterlineHeight = Math.max(...horizontalOnlyPoints.map(point => point[1])) - Math.min(...horizontalOnlyPoints.map(point => point[1]));
assert.ok(Math.abs(horizontalOnlyFaces.width - 10) < 1e-9, 'One horizontal dimension must establish the exterior-face width.');
assert.ok(Math.abs(horizontalOnlyCenterlineWidth / horizontalOnlyCenterlineHeight - 400 / 540) < 1e-9, 'A horizontal-only scale must infer depth without stretching.');
assert.ok(Math.abs(horizontalOnlyFaces.height - 13.4195) < 1e-9, 'The missing depth must be inferred from the traced wall-axis ratio.');
assert.equal(horizontalOnlyEnvelope.extractionDiagnostics.scaleSource, 'requested-boundary');

const verticalOnlyEnvelope = extractGeometryFromImageData({ width, height, data: pixels }, {
  requestedDepthMeters: 12,
  designSummary: options.designSummary,
  enforceRequestedEnvelope: true,
});
const verticalOnlyFaces = wallOuterFaceBounds(verticalOnlyEnvelope.walls);
const verticalOnlyPoints = verticalOnlyEnvelope.walls.flatMap(wall => [wall.p1, wall.p2]);
const verticalOnlyCenterlineWidth = Math.max(...verticalOnlyPoints.map(point => point[0])) - Math.min(...verticalOnlyPoints.map(point => point[0]));
const verticalOnlyCenterlineHeight = Math.max(...verticalOnlyPoints.map(point => point[1])) - Math.min(...verticalOnlyPoints.map(point => point[1]));
assert.ok(Math.abs(verticalOnlyFaces.height - 12) < 1e-9, 'One vertical dimension must establish the exterior-face depth.');
assert.ok(Math.abs(verticalOnlyCenterlineWidth / verticalOnlyCenterlineHeight - 400 / 540) < 1e-9, 'A vertical-only scale must infer width without stretching.');
assert.ok(Math.abs(verticalOnlyFaces.width - 8.94851851851852) < 1e-9, 'The missing width must be inferred from the traced wall-axis ratio.');
assert.equal(verticalOnlyEnvelope.extractionDiagnostics.scaleSource, 'requested-boundary');

// OCR evidence is allowed to override a conflicting requested frame, keeps
// distinct semantic zones inside one open space, and carries printed room
// dimensions into the native labels.
const observation = (text, x, y, w = 110, h = 18) => ({
  text,
  confidence: 95,
  bbox: { x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 },
});
const ocrAware = extractGeometryFromImageData({ width, height, data: pixels }, {
  ...options,
  designSummary: `Rooms Included:
- 1 Master Bedroom
- 1 Bathroom
- 1 Living Room
- 1 Dining Area
- 1 Kitchen
Floors: Single-story`,
  textObservations: [
    observation('MASTER BEDROOM', 200, 180),
    observation('5.0m x 6.75m', 200, 210),
    observation('BATHROOM', 400, 180),
    observation('5.0m x 6.75m', 400, 210),
    observation('LIVING ROOM', 190, 455),
    observation('5.0m x 6.75m', 190, 485),
    observation('DINING AREA', 220, 525),
    observation('KITCHEN', 400, 455),
    observation('5.0m x 6.75m', 400, 485),
  ],
});
assert.equal(ocrAware.extractionDiagnostics.scaleSource, 'image-text', 'Consistent printed dimensions should establish scale.');
assert.equal(ocrAware.extractionDiagnostics.ocr.status, 'provided');
assert.equal(ocrAware.extractionDiagnostics.ocr.observationCount, 9);
assert.equal(ocrAware.extractionDiagnostics.detectedRoomLabels, 5, 'All readable room labels should be retained.');
assert.equal(ocrAware.rooms.length, 5, 'Open-plan labels must not be collapsed to one flood-filled region.');
assert.ok(ocrAware.rooms.some(room => room.label === 'Living Room') && ocrAware.rooms.some(room => room.label === 'Dining Area'), 'Distinct open-plan zones must survive.');
assert.ok(ocrAware.rooms.every(room => room.sourceWidth && room.sourceDepth), 'Nearby printed dimensions should be attached to each OCR room tag.');
const ocrBoundaryX = ocrAware.boundary.map(point => point[0]);
const ocrBoundaryY = ocrAware.boundary.map(point => point[1]);
const ocrWallFaces = wallOuterFaceBounds(ocrAware.walls);
assert.ok(Math.abs((Math.max(...ocrBoundaryX) - Math.min(...ocrBoundaryX)) - ocrWallFaces.width) < 1e-6, 'OCR-derived property width must follow the exterior wall faces.');
assert.ok(Math.abs((Math.max(...ocrBoundaryY) - Math.min(...ocrBoundaryY)) - ocrWallFaces.height) < 1e-6, 'OCR-derived property depth must follow the exterior wall faces.');
assert.ok(Math.abs(ocrWallFaces.width - 10.23) < 1e-6 && Math.abs(ocrWallFaces.height - 13.73) < 1e-6, 'OCR wall-axis scale must gain one exterior wall thickness across each property axis.');
assert.equal(ocrAware.doors.filter(door => door.mandatoryExteriorEntry).length, 1, 'Exactly one extracted door should be the mandatory entry.');
const completedOcrAware = runQuietly(() => completeText4eGeometry(ocrAware));
assert.equal(completedOcrAware.doors.filter(door => door.mandatoryExteriorEntry).length, 1, 'Geometry completion must not add a second mandatory entry.');
assert.deepEqual(
  completedOcrAware.rooms.find(room => room.label === 'Master Bedroom').pos,
  ocrAware.rooms.find(room => room.label === 'Master Bedroom').pos,
  'Geometry completion must preserve source orientation instead of mirroring the plan.',
);

// A balcony is circulation-connected by a door, never silently represented as
// a low-sill/full-height window. Existing facade glazing may be reclassified,
// but the resulting assumption must remain explicit in provenance metadata.
const balconyPlan = runQuietly(() => completeText4eGeometry({
  walls: [
    { levelIndex: 0, p1: [0, 0], p2: [10, 0], type: 'exterior', provenance: 'observed', evidence: { source: 'raster', confidence: 0.9 } },
    { levelIndex: 0, p1: [10, 0], p2: [10, 8], type: 'exterior', provenance: 'observed', evidence: { source: 'raster', confidence: 0.9 } },
    { levelIndex: 0, p1: [10, 8], p2: [0, 8], type: 'exterior', provenance: 'observed', evidence: { source: 'raster', confidence: 0.9 } },
    { levelIndex: 0, p1: [0, 8], p2: [0, 0], type: 'exterior', provenance: 'observed', evidence: { source: 'raster', confidence: 0.9 } },
    { levelIndex: 0, p1: [0, 4], p2: [10, 4], type: 'interior', provenance: 'observed', evidence: { source: 'raster', confidence: 0.85 } },
  ],
  rooms: [
    { levelIndex: 0, label: 'Living Room', pos: [5, 6], provenance: 'observed', evidence: { source: 'ocr', confidence: 0.92 } },
    { levelIndex: 0, label: 'Balcony', pos: [5, 7], provenance: 'observed', evidence: { source: 'ocr', confidence: 0.92 } },
  ],
  doors: [],
  windows: [
    { levelIndex: 0, pos: [5, 8], rotation: 0, type: 'standard', width: 1.5, measuredWidth: 1.5, provenance: 'observed', evidence: { source: 'raster', confidence: 0.84 } },
  ],
  openings: [], columns: [], stairs: [], slabs: [], railings: [], furniture: [], fixtures: [],
}));
const balconyAccess = balconyPlan.doors.find(door => door.assumedProperties?.includes('glazed-balcony-access'));
assert.ok(balconyAccess, 'A balcony must retain an explicit glazed access door.');
assert.ok(['sliding', 'glass'].includes(balconyAccess.type));
assert.ok(!balconyPlan.windows.some(window => window.type === 'full-height'), 'Balcony circulation must not be encoded as a window subtype.');
assert.ok(balconyAccess.provenance && balconyAccess.evidence, 'Reclassified balcony access must retain its evidence trail.');

// Landscape regression: dense, thin fixture/cabinet strokes must not become
// walls, and a portrait-shaped request must not rotate or stretch the source.
const noisyWidth = 900;
const noisyHeight = 550;
const noisyPixels = new Uint8ClampedArray(noisyWidth * noisyHeight * 4);
noisyPixels.fill(255);
const noisyFillRect = (x1, y1, x2, y2, gray = 0) => {
  for (let y = Math.max(0, y1); y <= Math.min(noisyHeight - 1, y2); y++) {
    for (let x = Math.max(0, x1); x <= Math.min(noisyWidth - 1, x2); x++) {
      const offset = (y * noisyWidth + x) * 4;
      noisyPixels[offset] = gray;
      noisyPixels[offset + 1] = gray;
      noisyPixels[offset + 2] = gray;
      noisyPixels[offset + 3] = 255;
    }
  }
};
const noisyHorizontal = (y, x1, x2, thickness = 8) => noisyFillRect(x1, y - Math.floor(thickness / 2), x2, y + Math.floor(thickness / 2));
const noisyVertical = (x, y1, y2, thickness = 8) => noisyFillRect(x - Math.floor(thickness / 2), y1, x + Math.floor(thickness / 2), y2);

noisyHorizontal(90, 100, 800, 14);
noisyHorizontal(460, 100, 800, 14);
noisyVertical(100, 90, 460, 14);
noisyVertical(800, 90, 460, 14);
noisyHorizontal(275, 100, 390, 9);
noisyHorizontal(275, 430, 800, 9);
noisyVertical(430, 90, 235, 9);
noisyVertical(430, 315, 460, 9);

// A dense bank of fixture/cabinet strokes plus annotation lines.
for (let x = 650; x <= 770; x += 5) noisyVertical(x, 120, 235, 2);
for (let y = 325; y <= 415; y += 6) noisyHorizontal(y, 150, 285, 2);
noisyHorizontal(55, 180, 720, 2); // detached dimension line
noisyVertical(390, 275, 314, 1); // door leaf evidence
noisyHorizontal(236, 430, 468, 1);

const noisyOptions = {
  requestedBoundary: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 12 }, { x: 0, y: 12 }],
  designSummary: `Rooms Included:
- 1 Living Room
- 1 Kitchen
- 1 Master Bedroom
- 1 Bathroom
Room Adjacency:
- Kitchen near living
Layout Type: Compact
Floors: Single-story`,
};
const noisy = extractGeometryFromImageData({ width: noisyWidth, height: noisyHeight, data: noisyPixels }, noisyOptions);
const noisyX = noisy.boundary.map(point => point[0]);
const noisyY = noisy.boundary.map(point => point[1]);
const noisyBoundaryWidth = Math.max(...noisyX) - Math.min(...noisyX);
const noisyBoundaryHeight = Math.max(...noisyY) - Math.min(...noisyY);
assert.ok(noisyBoundaryWidth > noisyBoundaryHeight, 'Landscape raster must remain landscape.');
const noisyWallPoints = noisy.walls.flatMap(wall => [wall.p1, wall.p2]);
const noisyCenterlineWidth = Math.max(...noisyWallPoints.map(point => point[0])) - Math.min(...noisyWallPoints.map(point => point[0]));
const noisyCenterlineHeight = Math.max(...noisyWallPoints.map(point => point[1])) - Math.min(...noisyWallPoints.map(point => point[1]));
assert.ok(Math.abs(noisyCenterlineWidth / noisyCenterlineHeight - 700 / 370) < 1e-9, 'Landscape raster wall axes must not be stretched.');
assert.ok((noisy.walls?.length || 0) <= 10, 'Thin fixtures and annotation strokes must not be promoted to walls.');
assert.equal(noisy.rooms?.length, 4, 'Noisy plan should retain its four architectural spaces.');
assert.ok((noisy.boundary?.length || 0) <= 20, 'Slab boundary must be simplified before import.');

const noisyLetterboxed = extractGeometryFromImageData({ width: noisyWidth, height: noisyHeight, data: noisyPixels }, {
  ...noisyOptions,
  enforceRequestedEnvelope: true,
});
const noisyLetterboxPoints = noisyLetterboxed.walls.flatMap(wall => [wall.p1, wall.p2]);
const noisyLetterboxWidth = Math.max(...noisyLetterboxPoints.map(point => point[0])) - Math.min(...noisyLetterboxPoints.map(point => point[0]));
const noisyLetterboxHeight = Math.max(...noisyLetterboxPoints.map(point => point[1])) - Math.min(...noisyLetterboxPoints.map(point => point[1]));
const noisyLetterboxFaces = wallOuterFaceBounds(noisyLetterboxed.walls);
assert.ok(Math.abs(noisyLetterboxFaces.width - 10) < 1e-9, 'Landscape letterboxing should fill the limiting horizontal axis at the wall faces.');
assert.ok(noisyLetterboxFaces.height < 12, 'Landscape letterboxing should leave unused vertical space rather than stretching.');
assert.ok(Math.abs(noisyLetterboxWidth / noisyLetterboxHeight - 700 / 370) < 1e-9, 'Landscape envelope enforcement must preserve wall proportions.');

const completedNoisy = runQuietly(() => {
  // This fixture tests orientation only, not the independent access-policy audit.
  return completeText4eGeometry({
    ...noisy,
    rooms: noisy.rooms.map((room, index) => ({ ...room, label: `Room ${index + 1}` })),
  });
});
const completedWallPoints = completedNoisy.walls.flatMap(wall => [wall.p1, wall.p2]);
const completedWidth = Math.max(...completedWallPoints.map(point => point[0])) - Math.min(...completedWallPoints.map(point => point[0]));
const completedHeight = Math.max(...completedWallPoints.map(point => point[1])) - Math.min(...completedWallPoints.map(point => point[1]));
assert.ok(completedWidth > completedHeight, 'Geometry completion must not rotate a landscape plan.');

// Enclosure-repair regression: image models occasionally leave all four
// facade corners visibly close but topologically open. That must no longer
// discard an otherwise useful generation.
const brokenPixels = new Uint8ClampedArray(width * height * 4);
brokenPixels.fill(255);
const brokenFillRect = (x1, y1, x2, y2, gray = 0) => {
  for (let y = Math.max(0, y1); y <= Math.min(height - 1, y2); y++) {
    for (let x = Math.max(0, x1); x <= Math.min(width - 1, x2); x++) {
      const offset = (y * width + x) * 4;
      brokenPixels[offset] = gray;
      brokenPixels[offset + 1] = gray;
      brokenPixels[offset + 2] = gray;
      brokenPixels[offset + 3] = 255;
    }
  }
};
const brokenHorizontal = (y, x1, x2, thickness = 10) => brokenFillRect(x1, y - Math.floor(thickness / 2), x2, y + Math.floor(thickness / 2));
const brokenVertical = (x, y1, y2, thickness = 10) => brokenFillRect(x - Math.floor(thickness / 2), y1, x + Math.floor(thickness / 2), y2);
brokenHorizontal(100, 130, 470, 12);
brokenHorizontal(600, 130, 470, 12);
brokenVertical(100, 130, 570, 12);
brokenVertical(500, 130, 570, 12);
brokenHorizontal(350, 100, 260, 8);
brokenHorizontal(350, 340, 500, 8);
brokenVertical(300, 100, 300, 8);
brokenVertical(300, 400, 600, 8);
const repairedEnclosure = extractGeometryFromImageData({ width, height, data: brokenPixels }, options);
assert.ok((repairedEnclosure.walls?.length || 0) >= 6, 'Disconnected wall endpoints should be repaired into a usable network.');
assert.equal(repairedEnclosure.rooms?.length, 4, 'Enclosure repair should recover the intended four-room partition.');
assert.ok(
  repairedEnclosure.extractionDiagnostics?.warnings.some(warning => /closed locally|locally reinforced/i.test(warning)),
  'Enclosure repair must be reported in diagnostics instead of throwing away the generation.',
);

console.log(JSON.stringify({
  walls: first.walls.length,
  rooms: first.rooms.map(room => room.label),
  doors: first.doors.length,
  windows: first.windows.length,
  openings: first.openings.length,
  boundaryPoints: first.boundary.length,
  noisyLandscape: {
    walls: noisy.walls.length,
    rooms: noisy.rooms.length,
    width: noisyBoundaryWidth,
    height: noisyBoundaryHeight,
    boundaryPoints: noisy.boundary.length,
  },
  ocrAware: {
    scaleSource: ocrAware.extractionDiagnostics.scaleSource,
    rooms: ocrAware.rooms.map(room => room.label),
    width: Math.max(...ocrBoundaryX) - Math.min(...ocrBoundaryX),
    height: Math.max(...ocrBoundaryY) - Math.min(...ocrBoundaryY),
  },
  repairedEnclosure: {
    walls: repairedEnclosure.walls.length,
    rooms: repairedEnclosure.rooms.length,
    warnings: repairedEnclosure.extractionDiagnostics.warnings,
  },
}, null, 2));
