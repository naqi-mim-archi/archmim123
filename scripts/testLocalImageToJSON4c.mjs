import assert from 'node:assert/strict';
import { build } from 'esbuild';

const buildResult = await build({
  entryPoints: ['services/localImageToJSON4c.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(buildResult.outputFiles[0].text).toString('base64')}`;
const { extractGeometryFromImageData } = await import(moduleUrl);
const geometryBuildResult = await build({
  entryPoints: ['components/generative-wizard/features/text4c/geometry.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
});
const geometryModuleUrl = `data:text/javascript;base64,${Buffer.from(geometryBuildResult.outputFiles[0].text).toString('base64')}`;
const { completeText4cGeometry } = await import(geometryModuleUrl);

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
assert.ok(first.rooms.every(room => room.provenance && room.evidence), 'Every extracted room marker must disclose its source.');

const boundaryX = first.boundary.map(point => point[0]);
const boundaryY = first.boundary.map(point => point[1]);
const boundaryWidth = Math.max(...boundaryX) - Math.min(...boundaryX);
const boundaryHeight = Math.max(...boundaryY) - Math.min(...boundaryY);
assert.ok(boundaryWidth <= 10 + 1e-9 && boundaryHeight <= 12 + 1e-9, 'Boundary must fit inside the request.');
assert.ok(Math.abs(boundaryHeight - 12) < 1e-9, 'The limiting requested dimension should be filled.');
assert.ok(Math.abs(boundaryWidth / boundaryHeight - 400 / 540) < 1e-9, 'Raster aspect ratio must be preserved.');

const exactEnvelope = extractGeometryFromImageData({ width, height, data: pixels }, {
  ...options,
  enforceRequestedEnvelope: true,
});
const exactWallPoints = exactEnvelope.walls.flatMap(wall => [wall.p1, wall.p2]);
const exactWidth = Math.max(...exactWallPoints.map(point => point[0])) - Math.min(...exactWallPoints.map(point => point[0]));
const exactHeight = Math.max(...exactWallPoints.map(point => point[1])) - Math.min(...exactWallPoints.map(point => point[1]));
assert.ok(exactWidth <= 10 + 1e-9 && exactHeight <= 12 + 1e-9, 'Text 4.0 C must fit inside the confirmed envelope.');
assert.ok(Math.abs(exactHeight - 12) < 1e-9, 'Uniform scaling should fill the limiting requested axis.');
assert.ok(Math.abs(exactWidth / exactHeight - 400 / 540) < 1e-9, 'Envelope enforcement must preserve the raster wall aspect ratio.');
assert.equal(exactEnvelope.extractionDiagnostics.scaleSource, 'requested-boundary');
assert.ok(
  exactEnvelope.extractionDiagnostics.warnings.some(warning => /uniform scale preserved the floorplan aspect ratio/i.test(warning)),
  'A source-image aspect mismatch must disclose aspect-preserving letterboxing.',
);
const completedExactEnvelope = runQuietly(() => completeText4cGeometry(exactEnvelope, options.designSummary));
const completedExactPoints = completedExactEnvelope.walls.flatMap(wall => [wall.p1, wall.p2]);
assert.ok(
  Math.abs(
    (Math.max(...completedExactPoints.map(point => point[0])) - Math.min(...completedExactPoints.map(point => point[0]))) /
    (Math.max(...completedExactPoints.map(point => point[1])) - Math.min(...completedExactPoints.map(point => point[1]))) - 400 / 540
  ) < 1e-9,
  'Geometry completion must preserve the traced wall aspect ratio.',
);
assert.ok(
  Math.abs(Math.max(...completedExactPoints.map(point => point[1])) - Math.min(...completedExactPoints.map(point => point[1])) - 12) < 1e-9,
  'Geometry completion must preserve the authoritative depth.',
);
assert.ok(
  ['walls', 'doors', 'windows', 'openings', 'rooms'].every(key => (completedExactEnvelope[key] || []).every(item => item.provenance && item.evidence)),
  'Observed and locally completed geometry must remain distinguishable after completion.',
);

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
assert.ok(Math.abs((Math.max(...ocrBoundaryX) - Math.min(...ocrBoundaryX)) - 10) < 1e-6, 'OCR-derived horizontal scale should be preserved.');
assert.ok(Math.abs((Math.max(...ocrBoundaryY) - Math.min(...ocrBoundaryY)) - 13.5) < 1e-6, 'OCR scale may exceed a contradictory requested frame without distortion.');
assert.equal(ocrAware.doors.filter(door => door.mandatoryExteriorEntry).length, 1, 'Exactly one extracted door should be the mandatory entry.');
const completedOcrAware = runQuietly(() => completeText4cGeometry(ocrAware));
assert.equal(completedOcrAware.doors.filter(door => door.mandatoryExteriorEntry).length, 1, 'Geometry completion must not add a second mandatory entry.');
assert.deepEqual(
  completedOcrAware.rooms.find(room => room.label === 'Master Bedroom').pos,
  ocrAware.rooms.find(room => room.label === 'Master Bedroom').pos,
  'Geometry completion must preserve source orientation instead of mirroring the plan.',
);

// A balcony is circulation-connected by a door, never silently represented as
// a low-sill/full-height window. Existing facade glazing may be reclassified,
// but the resulting assumption must remain explicit in provenance metadata.
const balconyPlan = runQuietly(() => completeText4cGeometry({
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
assert.ok(Math.abs(noisyBoundaryWidth / noisyBoundaryHeight - 700 / 370) < 1e-9, 'Landscape raster must not be stretched.');
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
assert.ok(Math.abs(noisyLetterboxWidth - 10) < 1e-9, 'Landscape letterboxing should fill the limiting horizontal axis.');
assert.ok(noisyLetterboxHeight < 12, 'Landscape letterboxing should leave unused vertical space rather than stretching.');
assert.ok(Math.abs(noisyLetterboxWidth / noisyLetterboxHeight - 700 / 370) < 1e-9, 'Landscape envelope enforcement must preserve wall proportions.');

const completedNoisy = runQuietly(() => {
  // This fixture tests orientation only, not the independent access-policy audit.
  return completeText4cGeometry({
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
