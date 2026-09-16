import assert from 'node:assert/strict';
import { build } from 'esbuild';

const result = await build({
  entryPoints: ['services/text4jStructuredGeometryReconciler.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`;
const { reconcileText4jStructuredGeometryWithRaster } = await import(moduleUrl);

const width = 1000, height = 1000;
const pixels = new Uint8ClampedArray(width * height * 4).fill(255);
const fillBand = (x0, y0, x1, y1) => {
  for (let y = Math.max(0, y0); y <= Math.min(height - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(width - 1, x1); x++) {
      const offset = (y * width + x) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
      pixels[offset + 3] = 255;
    }
  }
};

fillBand(95, 95, 905, 105);
fillBand(895, 95, 905, 905);
fillBand(95, 895, 905, 905);
fillBand(95, 95, 105, 905);
fillBand(100, 494, 900, 506); // Missing Local wall proven by a structural raster band.
fillBand(300, 694, 500, 706); // Disconnected wall-like band must not be added.

const evidence = (x0, y0, x1, y1) => ({ source: 'raster', confidence: 0.86, pixelBounds: { x0, y0, x1, y1 } });
const baseline = {
  walls: [
    { p1: [0, 8], p2: [8, 8], type: 'exterior', evidence: evidence(100, 95, 900, 105) },
    { p1: [8, 8], p2: [8, 0], type: 'exterior', evidence: evidence(895, 100, 905, 900) },
    { p1: [0, 0], p2: [8, 0], type: 'exterior', evidence: evidence(100, 895, 900, 905) },
    { p1: [0, 8], p2: [0, 0], type: 'exterior', evidence: evidence(95, 100, 105, 900) },
  ],
  doors: [{ pos: [4, 0], rotation: 0, type: 'single', width: 0.9 }],
  windows: [{ pos: [2, 8], rotation: 0, type: 'standard', width: 1.2 }],
  openings: [{ pos: [6, 0], rotation: 0, width: 1.1 }],
  rooms: [{ label: 'Room', pos: [4, 4] }],
  columns: [{ pos: [0, 0], size: 0.3 }],
  stairs: [{ pos: [6, 5], width: 1.1 }],
  slabs: [{ boundary: [[0, 0], [8, 0], [8, 8], [0, 8]] }],
  railings: [{ p1: [0, 0], p2: [1, 0] }],
  furniture: [{ pos: [2, 2], type: 'chair' }],
  fixtures: [{ pos: [6, 6], type: 'sink' }],
  extractionDiagnostics: {
    confidence: 'high', canImport: true, scaleSource: 'requested-boundary', warnings: [],
    detectedRoomLabels: 1, requestedRoomLabels: 0,
    metrics: {
      wallCount: 4, enclosedSpaceCount: 1, detectedDoorCount: 1, detectedWindowCount: 1,
      detectedOpeningCount: 0, unresolvedRoomLabels: 0, envelopeAspectConflict: 0,
    },
  },
};

const candidate = (id, x1, y1, x2, y2) => ({
  id, p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 }, confidence: 0.85,
});
const structured = {
  sourceWidth: width,
  sourceHeight: height,
  processingMs: 10,
  jobId: 'synthetic',
  candidateJson: {},
  walls: [
    candidate('existing-face-a', 100, 95, 900, 95),
    candidate('existing-face-b', 100, 105, 900, 105),
    candidate('missing-face-a', 100, 494, 900, 494),
    candidate('missing-face-b', 100, 506, 900, 506),
    candidate('disconnected-face-a', 300, 694, 500, 694),
    candidate('disconnected-face-b', 300, 706, 500, 706),
    candidate('false-diagonal-a', 250, 250, 500, 500),
    candidate('false-diagonal-b', 254, 246, 504, 496),
  ],
};

const reconciled = reconcileText4jStructuredGeometryWithRaster(
  baseline,
  structured,
  { width, height, data: pixels },
);

assert.equal(reconciled.audit.acceptedRepairs, 1, 'Only the connected, raster-supported missing wall should be accepted.');
assert.equal(reconciled.data.walls.length, 5);
const repaired = reconciled.data.walls.find(wall => wall.provenance === 'repair-generated');
assert.ok(repaired, 'The missing centerline should retain geometry-repair provenance.');
assert.ok(Math.abs(repaired.p1[1] - 4) < 0.08 && Math.abs(repaired.p2[1] - 4) < 0.08);
assert.deepEqual(reconciled.data.doors, baseline.doors, 'Structured geometry must not change Local doors.');
assert.deepEqual(reconciled.data.windows, baseline.windows, 'Structured geometry must not change Local windows.');
assert.deepEqual(reconciled.data.openings, baseline.openings, 'Structured geometry must not change Local openings.');
assert.deepEqual(reconciled.data.rooms, baseline.rooms, 'Structured geometry must not change Local rooms or labels.');
for (const key of ['columns', 'stairs', 'slabs', 'railings', 'furniture', 'fixtures']) {
  assert.deepEqual(reconciled.data[key], baseline[key], `Structured geometry must not change Local ${key}.`);
}
assert.equal(reconciled.data.walls.some(wall => {
  const dx = Math.abs(wall.p2[0] - wall.p1[0]), dy = Math.abs(wall.p2[1] - wall.p1[1]);
  return dx > 0.2 && dy > 0.2;
}), false, 'Structured diagonals must not change an orthogonal Local result.');

fillBand(100, 108, 900, 118);
const overlapStructured = {
  ...structured,
  walls: [
    candidate('missing-face-a', 100, 494, 900, 494),
    candidate('missing-face-b', 100, 506, 900, 506),
    candidate('near-overlap-face-a', 100, 108.2, 900, 108.2),
    candidate('near-overlap-face-b', 100, 118.2, 900, 118.2),
  ],
};
const overlapResult = reconcileText4jStructuredGeometryWithRaster(
  baseline,
  overlapStructured,
  { width, height, data: pixels },
);
assert.equal(overlapResult.audit.acceptedRepairs, 1,
  'A valid missing wall must survive when a later Structured candidate introduces a near-overlap.');
assert.equal(overlapResult.audit.rejectedOverlap, 1,
  'Only the Structured candidate that introduces the near-overlap should be rejected.');
assert.equal(overlapResult.data.walls.length, baseline.walls.length + 1,
  'Candidate-level overlap rejection must preserve earlier valid repairs.');
assert.equal(overlapResult.data.extractionDiagnostics.structuredReconciliation.finalWalls, baseline.walls.length + 1,
  'The exported diagnostics must make the Local plus Structured wall contribution explicit.');

fillBand(100, 294, 900, 306);
const lengthLimitedResult = reconcileText4jStructuredGeometryWithRaster(
  baseline,
  {
    ...structured,
    walls: [
      candidate('first-missing-face-a', 100, 494, 900, 494),
      candidate('first-missing-face-b', 100, 506, 900, 506),
      candidate('second-missing-face-a', 100, 294, 900, 294),
      candidate('second-missing-face-b', 100, 306, 900, 306),
    ],
  },
  { width, height, data: pixels },
);
assert.equal(lengthLimitedResult.audit.acceptedRepairs, 1,
  'The bounded repair budget should retain the first valid missing wall.');
assert.equal(lengthLimitedResult.audit.rejectedLengthBudget, 1,
  'A later candidate that exceeds the cumulative repair budget should be rejected alone.');
assert.equal(lengthLimitedResult.data.walls.length, baseline.walls.length + 1);

console.log(JSON.stringify(reconciled.audit));
