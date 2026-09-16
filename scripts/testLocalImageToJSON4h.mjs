import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { build } from 'esbuild';
import { allElementsRasterFixture } from './fixtures/text4h/allElementsRasterFixture.mjs';
import { dataset4RasterFixtures } from './fixtures/text4h/dataset4RasterFixtures.mjs';
import { dataset5OcrFixtures } from './fixtures/text4h/dataset5OcrFixtures.mjs';
import { dataset5RasterFixtures } from './fixtures/text4h/dataset5RasterFixtures.mjs';

const allElementsExpected = JSON.parse(readFileSync(
  new URL('./fixtures/text4h/allElementsExpected.json', import.meta.url),
  'utf8',
));

const buildResult = await build({
  entryPoints: ['services/localImageToJSON4h.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(buildResult.outputFiles[0].text).toString('base64')}`;
const {
  clampText4hRecoveredSwingGapToJambFacesForTest,
  createText4hDashedOpeningEvidenceMaskForTest,
  detectDoorSwing,
  extractGeometryFromImageData,
  findText4hExplicitHostedOffsetSwingForTest,
  findText4hPhysicalWallFaceSwingForTest,
  arbitrateText4hHostedOpenings,
  recoverText4hInteriorPartitionsForTest,
  recoverText4hTopologyValidatedPartitionsForTest,
  retainText4hCooperatingExteriorWallNetworksForTest,
  resolveText4hHostedNonDoorRasterKindForTest,
  recoverText4hConcentricInteriorRingForTest,
  recoverText4hMissingHostedWindowOrSlidingForTest,
  recoverText4hMissingFacadeWallRunsForTest,
  resolveText4hMissingHostRecoveryScaleForTest,
  resolveText4hFramedInsetPixelsForTest,
  text4hClosedLeafFitsHostForTest,
  text4hDominantEllipseGapHasRasterEvidenceForTest,
  text4hHostedAperturesOverlap,
  text4hInteriorArchitecturalCurveEvidenceForTest,
  text4hOpenShellExteriorCurveFamilyEvidenceForTest,
  text4hShouldRetainHybridCurveModeForTest,
  text4hOpeningHasHost,
  text4hSwingQuadrantForTest,
  text4hParallelDashedOpeningBandCountForTest,
} = await import(moduleUrl);

// An open-plan facade can be split into upper and lower structural networks
// by several windows and doors. Keep both cooperating exterior components,
// but continue rejecting a disconnected interior fixture-sized box.
const splitEnvelopeSegments = [
  { axis: 'horizontal', line: 100, start: 100, end: 900, thickness: 12 },
  { axis: 'vertical', line: 100, start: 100, end: 440, thickness: 12 },
  { axis: 'vertical', line: 900, start: 100, end: 440, thickness: 12 },
  { axis: 'horizontal', line: 900, start: 100, end: 900, thickness: 12 },
  { axis: 'vertical', line: 100, start: 560, end: 900, thickness: 12 },
  { axis: 'vertical', line: 900, start: 560, end: 900, thickness: 12 },
  { axis: 'horizontal', line: 620, start: 100, end: 900, thickness: 9 },
  { axis: 'horizontal', line: 740, start: 100, end: 900, thickness: 9 },
  { axis: 'vertical', line: 500, start: 560, end: 900, thickness: 9 },
  { axis: 'horizontal', line: 300, start: 420, end: 560, thickness: 5 },
  { axis: 'horizontal', line: 420, start: 420, end: 560, thickness: 5 },
  { axis: 'vertical', line: 420, start: 300, end: 420, thickness: 5 },
  { axis: 'vertical', line: 560, start: 300, end: 420, thickness: 5 },
];
const retainedSplitEnvelope = retainText4hCooperatingExteriorWallNetworksForTest(
  splitEnvelopeSegments,
  { x: 0.01, y: 0.01 },
  12,
);
assert.ok(retainedSplitEnvelope.some(segment => segment.axis === 'horizontal' && segment.line === 100),
  'The upper exterior component must survive when the lower network has more total wall length.');
assert.ok(retainedSplitEnvelope.some(segment => segment.axis === 'horizontal' && segment.line === 900),
  'The dominant lower exterior component must remain retained.');
assert.ok(!retainedSplitEnvelope.some(segment => segment.thickness === 5),
  'A disconnected interior fixture-sized box must remain outside the architectural wall network.');

// H-only second-chance topology recovery accepts a thick observed partition
// only when it joins structural anchors and separates independently labelled
// rooms. The same raster line must remain ignored for an intentional open-plan
// Living/Dining label pair.
const topologyWidth = 220;
const topologyHeight = 220;
const topologyThickness = 10;
const topologyMask = new Uint8Array(topologyWidth * topologyHeight);
const drawTopologyLine = (first, second, thickness = topologyThickness) => {
  const length = Math.hypot(second.x - first.x, second.y - first.y);
  const steps = Math.max(1, Math.ceil(length * 1.25));
  const radius = Math.max(1, Math.round(thickness / 2));
  for (let step = 0; step <= steps; step++) {
    const progress = step / steps;
    const cx = first.x + (second.x - first.x) * progress;
    const cy = first.y + (second.y - first.y) * progress;
    for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(topologyHeight - 1, Math.ceil(cy + radius)); y++) {
      for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(topologyWidth - 1, Math.ceil(cx + radius)); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) topologyMask[y * topologyWidth + x] = 1;
      }
    }
  }
};
const topologyShell = [
  { axis: 'horizontal', line: 20, start: 20, end: 200, thickness: topologyThickness },
  { axis: 'horizontal', line: 200, start: 20, end: 200, thickness: topologyThickness },
  { axis: 'vertical', line: 20, start: 20, end: 200, thickness: topologyThickness },
  { axis: 'vertical', line: 200, start: 20, end: 200, thickness: topologyThickness },
];
const verticalTopologyCandidate = {
  axis: 'vertical', line: 110, start: 20, end: 200, thickness: topologyThickness,
};
drawTopologyLine({ x: 110, y: 20 }, { x: 110, y: 200 });
const recoveredOrthogonalTopology = recoverText4hTopologyValidatedPartitionsForTest(
  topologyShell,
  [],
  [...topologyShell, verticalTopologyCandidate],
  [],
  topologyMask,
  topologyWidth,
  topologyHeight,
  topologyThickness,
  [
    { label: 'Bedroom', x: 65, y: 110, confidence: 95 },
    { label: 'Bathroom', x: 155, y: 110, confidence: 95 },
  ],
  { x: 0.05, y: 0.05 },
);
assert.equal(recoveredOrthogonalTopology.recoveredCount, 1,
  'A raster-supported anchored partition must be restored when it separates two OCR room regions.');
const recoveredThinInteriorTopology = recoverText4hTopologyValidatedPartitionsForTest(
  topologyShell,
  [],
  [...topologyShell, { ...verticalTopologyCandidate, thickness: topologyThickness * 0.42 }],
  [],
  topologyMask,
  topologyWidth,
  topologyHeight,
  topologyThickness,
  [
    { label: 'Bedroom', x: 65, y: 110, confidence: 95 },
    { label: 'Bathroom', x: 155, y: 110, confidence: 95 },
  ],
  { x: 0.05, y: 0.05 },
);
assert.equal(recoveredThinInteriorTopology.recoveredCount, 1,
  'A raster-proven interior partition just below half the facade thickness must remain recoverable.');
const doorTerminatedTopologyCandidate = {
  axis: 'vertical', line: 110, start: 20, end: 120, thickness: topologyThickness,
};
const recoveredDoorTerminatedTopology = recoverText4hTopologyValidatedPartitionsForTest(
  topologyShell,
  [],
  [...topologyShell, doorTerminatedTopologyCandidate],
  [],
  topologyMask,
  topologyWidth,
  topologyHeight,
  topologyThickness,
  [
    { label: 'Bedroom', x: 65, y: 70, confidence: 95 },
    { label: 'Bathroom', x: 155, y: 70, confidence: 95 },
  ],
  { x: 0.05, y: 0.05 },
);
assert.equal(recoveredDoorTerminatedTopology.recoveredCount, 1,
  'A long raster partition with one structural anchor may terminate at a door jamb between independent rooms.');
const rejectedOpenPlanDoorTerminatedTopology = recoverText4hTopologyValidatedPartitionsForTest(
  topologyShell,
  [],
  [...topologyShell, doorTerminatedTopologyCandidate],
  [],
  topologyMask,
  topologyWidth,
  topologyHeight,
  topologyThickness,
  [
    { label: 'Living', x: 65, y: 70, confidence: 95 },
    { label: 'Dining', x: 155, y: 70, confidence: 95 },
  ],
  { x: 0.05, y: 0.05 },
);
assert.equal(rejectedOpenPlanDoorTerminatedTopology.recoveredCount, 0,
  'A one-ended candidate must not invent a divider between compatible open-plan room labels.');
const partialTopologyPartition = {
  axis: 'vertical', line: 110, start: 20, end: 150, thickness: topologyThickness,
};
const completedPartialTopology = recoverText4hTopologyValidatedPartitionsForTest(
  [...topologyShell, partialTopologyPartition],
  [],
  [...topologyShell, verticalTopologyCandidate],
  [],
  topologyMask,
  topologyWidth,
  topologyHeight,
  topologyThickness,
  [
    { label: 'Bedroom', x: 65, y: 110, confidence: 95 },
    { label: 'Bathroom', x: 155, y: 110, confidence: 95 },
  ],
  { x: 0.05, y: 0.05 },
);
assert.equal(completedPartialTopology.recoveredCount, 1,
  'A partial jamb-side run must not suppress the full raster partition needed to close labelled rooms.');
const preservedOpenPlanTopology = recoverText4hTopologyValidatedPartitionsForTest(
  topologyShell,
  [],
  [...topologyShell, verticalTopologyCandidate],
  [],
  topologyMask,
  topologyWidth,
  topologyHeight,
  topologyThickness,
  [
    { label: 'Living', x: 65, y: 110, confidence: 95 },
    { label: 'Dining', x: 155, y: 110, confidence: 95 },
  ],
  { x: 0.05, y: 0.05 },
);
assert.equal(preservedOpenPlanTopology.recoveredCount, 0,
  'OCR labels which may intentionally share an open-plan region must not incentivize a partition.');

const diagonalTopologyMask = new Uint8Array(topologyWidth * topologyHeight);
topologyMask.fill(0);
drawTopologyLine({ x: 20, y: 20 }, { x: 200, y: 200 });
diagonalTopologyMask.set(topologyMask);
const recoveredRadialTopology = recoverText4hTopologyValidatedPartitionsForTest(
  topologyShell,
  [],
  topologyShell,
  [{
    p1: { x: 20, y: 20 }, p2: { x: 200, y: 200 },
    thickness: topologyThickness, confidence: 0.82,
  }],
  diagonalTopologyMask,
  topologyWidth,
  topologyHeight,
  topologyThickness,
  [
    { label: 'Bedroom 1', x: 70, y: 150, confidence: 95 },
    { label: 'Bedroom 2', x: 150, y: 70, confidence: 95 },
  ],
  { x: 0.05, y: 0.05 },
);
assert.equal(recoveredRadialTopology.recoveredCount, 1,
  'A diagonal or radial wall must use the same topology-validated recovery as an orthogonal partition.');

// H-only aperture semantics: paired dashed lines are a wall opening, while a
// lone continuous wall stroke cannot become a window. A true low-ink,
// multi-band frame remains eligible as a window.
const apertureMaskWidth = 80;
const apertureMaskHeight = 120;
const dashedOpeningPixels = new Uint8ClampedArray(apertureMaskWidth * apertureMaskHeight * 4);
dashedOpeningPixels.fill(255);
for (const [x, gray] of [[37, 0], [43, 228]]) {
  for (const [start, end] of [[12, 28], [35, 51], [58, 74], [81, 98]]) {
    for (let y = start; y <= end; y++) {
      const offset = (y * apertureMaskWidth + x) * 4;
      dashedOpeningPixels[offset] = gray;
      dashedOpeningPixels[offset + 1] = gray;
      dashedOpeningPixels[offset + 2] = gray;
    }
  }
}
const dashedOpeningMask = createText4hDashedOpeningEvidenceMaskForTest({
  width: apertureMaskWidth,
  height: apertureMaskHeight,
  data: dashedOpeningPixels,
});
const verticalApertureGap = { axis: 'vertical', line: 40, start: 10, end: 110, thickness: 10 };
const dashedOpeningBands = text4hParallelDashedOpeningBandCountForTest(
  verticalApertureGap,
  dashedOpeningMask,
  apertureMaskWidth,
  apertureMaskHeight,
);
assert.equal(dashedOpeningBands, 2, 'Two interrupted parallel strokes must be recognized as a wall-opening symbol.');
assert.equal(resolveText4hHostedNonDoorRasterKindForTest({
  exterior: false,
  explicitOpenPassage: false,
  dashedOpeningBandCount: dashedOpeningBands,
  windowFrame: true,
  windowFrameBandCount: 2,
  continuousStructuralWallBandCount: 0,
  wallBandInk: 0.24,
  missingHostWindow: false,
}), 'opening', 'A double-dashed opening symbol must outrank a competing window-frame reading.');
assert.equal(resolveText4hHostedNonDoorRasterKindForTest({
  exterior: false,
  explicitOpenPassage: false,
  dashedOpeningBandCount: 0,
  windowFrame: true,
  windowFrameBandCount: 1,
  continuousStructuralWallBandCount: 1,
  wallBandInk: 0.34,
  missingHostWindow: false,
}), 'wall', 'A continuous solid wall band must not be exported as a window from weak one-line evidence.');
assert.equal(resolveText4hHostedNonDoorRasterKindForTest({
  exterior: false,
  explicitOpenPassage: false,
  dashedOpeningBandCount: 0,
  windowFrame: true,
  windowFrameBandCount: 2,
  continuousStructuralWallBandCount: 2,
  wallBandInk: 0.36,
  missingHostWindow: false,
}), 'window', 'Separated low-ink frame bands remain strong raster evidence for a true window.');

assert.equal(text4hDominantEllipseGapHasRasterEvidenceForTest(0, 0.8), true,
  'A proven exterior ellipse must retain a strongly traced curved aperture interval.');
assert.equal(text4hDominantEllipseGapHasRasterEvidenceForTest(0, 0.79), false,
  'Sub-threshold symbol ink alone must not extend a dominant exterior ellipse.');

const recoveredJambSwing = {
  axis: 'horizontal', line: 100, start: 100, end: 180, thickness: 10,
  validatedEndpointSwingEvidence: { detected: true, arcConfirmed: true },
  jambFaceClampEvidence: true,
};
assert.deepEqual(
  clampText4hRecoveredSwingGapToJambFacesForTest(
    recoveredJambSwing,
    [
      { axis: 'vertical', line: 100, start: 40, end: 160, thickness: 12 },
      { axis: 'vertical', line: 180, start: 40, end: 160, thickness: 8 },
    ],
    [],
    10,
  ),
  { ...recoveredJambSwing, start: 106, end: 176, jambFaceBoundedEvidence: true },
  'A recovered swing measured to perpendicular wall centrelines must stop at both physical jamb faces.',
);
assert.equal(
  clampText4hRecoveredSwingGapToJambFacesForTest(
    { axis: 'horizontal', line: 100, start: 100, end: 180, thickness: 10 },
    [{ axis: 'vertical', line: 100, start: 40, end: 160, thickness: 12 }],
    [],
    10,
  ).start,
  100,
  'Ordinary non-recovered apertures must not be resized by the jamb-face safeguard.',
);
const leafToJambSwing = clampText4hRecoveredSwingGapToJambFacesForTest(
  {
    ...recoveredJambSwing,
    start: 110,
    physicalWallFaceSwingEvidence: true,
    physicalWallFaceLeafLine: 110,
  },
  [{ axis: 'vertical', line: 180, start: 40, end: 160, thickness: 8 }],
  [],
  10,
);
assert.deepEqual(leafToJambSwing, {
  ...recoveredJambSwing,
  start: 110,
  end: 176,
  physicalWallFaceSwingEvidence: true,
  physicalWallFaceLeafLine: 110,
  jambFaceBoundedEvidence: true,
}, 'A wall-face recovery may clamp one jamb only when its opposite endpoint is the explicit raster leaf.');
const angularClampedSwing = clampText4hRecoveredSwingGapToJambFacesForTest(
  { ...recoveredJambSwing, start: 110 },
  [{ axis: 'vertical', line: 180, start: 40, end: 160, thickness: 8 }],
  [{ p1: { x: 100, y: 50 }, p2: { x: 120, y: 150 }, thickness: 10, confidence: 0.9 }],
  10,
);
assert.ok(angularClampedSwing.start > 115 && angularClampedSwing.start < 115.2,
  'An angular jamb must use its projected physical wall face rather than its centreline intersection.');
assert.equal(resolveText4hFramedInsetPixelsForTest(
  { ...recoveredJambSwing, jambFaceBoundedEvidence: true }, true, 10,
), 0, 'A recovered door already bounded by physical jamb faces must not receive a second frame allowance.');
assert.equal(resolveText4hFramedInsetPixelsForTest(
  { axis: 'horizontal', line: 100, start: 100, end: 180, thickness: 10 }, true, 10,
), 3.8, 'Ordinary framed apertures must retain their established frame allowance.');

assert.equal(text4hClosedLeafFitsHostForTest(56, 7), true,
  'A genuine closed leaf may remain within eight host-wall thicknesses.');
assert.equal(text4hClosedLeafFitsHostForTest(78, 7), false,
  'A long thin fixture edge must not borrow a loose arc as a closed door leaf.');
assert.deepEqual(
  text4hSwingQuadrantForTest('horizontal', false, true),
  text4hSwingQuadrantForTest('vertical', true, true),
  'Perpendicular interpretations of the same swing must resolve to the same world-space quadrant.',
);
assert.notDeepEqual(
  text4hSwingQuadrantForTest('horizontal', false, true),
  text4hSwingQuadrantForTest('vertical', false, true),
  'Legitimate perpendicular swings facing different quadrants must remain distinct.',
);

// DS12 69.1 regression: wall-band merging may stop just before the actual
// hinge. Only matching hosted arcs in both masks plus an explicit leaf may
// move that hinge; a nearby uncorroborated stroke must remain insufficient.
const ds12691Gap = { axis: 'horizontal', line: 353, start: 525, end: 604.2, thickness: 9 };
const ds12691Arc = {
  detected: true, isFlipped: true, facingFlipped: false,
  endpointCount: 1, confidence: 0.94, arcOnly: true, arcConfirmed: true,
};
const ds12691OffsetSwing = findText4hExplicitHostedOffsetSwingForTest(
  ds12691Gap,
  ds12691Arc,
  ds12691Arc,
  [{ axis: 'vertical', line: 590, start: 353, end: 416, thickness: 2 }],
  9,
);
assert.ok(ds12691OffsetSwing?.offsetHinge && Math.abs(ds12691OffsetSwing.hingeOffset + 14.2) < 0.01,
  'DS12 69.1 matching arc-plus-leaf evidence must preserve its offset hinge.');
assert.equal(findText4hExplicitHostedOffsetSwingForTest(
  ds12691Gap,
  ds12691Arc,
  { ...ds12691Arc, facingFlipped: true },
  [{ axis: 'vertical', line: 590, start: 353, end: 416, thickness: 2 }],
  9,
), undefined, 'An offset leaf must not recover a door when the two raster arcs disagree.');

const ds1269RecoveryScale = resolveText4hMissingHostRecoveryScaleForTest(
  { minX: 122, maxX: 932, minY: 170, maxY: 836 },
  { requestedWidthMeters: 10.5, requestedDepthMeters: 8.6 },
  { x: 20 / 810, y: 20 / 810 },
);
assert.ok(Math.abs(ds1269RecoveryScale.x - 8.6 / 666) < 1e-9,
  'DS12 69.2 missing-host recovery must use the confirmed property scale, not the generic 20 m fallback.');

// DS12 69.2 regression: a thin framed assembly can cause its complete host
// wall family to be rejected before ordinary opening classification. Recover
// it only when raster wall continuation reaches a retained perpendicular
// anchor, then choose the stronger sliding/window signature.
const missingHostWidth = 300, missingHostHeight = 200;
const createMissingHostMask = () => new Uint8Array(missingHostWidth * missingHostHeight);
const drawMissingHostLine = (mask, x1, y1, x2, y2, thickness = 1) => {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let step = 0; step <= steps; step++) {
    const x = Math.round(x1 + (x2 - x1) * step / Math.max(1, steps));
    const y = Math.round(y1 + (y2 - y1) * step / Math.max(1, steps));
    for (let oy = -Math.floor(thickness / 2); oy <= Math.floor(thickness / 2); oy++) {
      for (let ox = -Math.floor(thickness / 2); ox <= Math.floor(thickness / 2); ox++) {
        if (x + ox >= 0 && y + oy >= 0 && x + ox < missingHostWidth && y + oy < missingHostHeight) {
          mask[(y + oy) * missingHostWidth + x + ox] = 1;
        }
      }
    }
  }
};
const missingHostRetained = [
  { axis: 'vertical', line: 40, start: 25, end: 175, thickness: 12 },
  { axis: 'horizontal', line: 100, start: 170, end: 260, thickness: 12 },
];
const slidingMissingHostMask = createMissingHostMask();
drawMissingHostLine(slidingMissingHostMask, 40, 100, 100, 100, 2);
drawMissingHostLine(slidingMissingHostMask, 100, 94, 134, 94, 2);
drawMissingHostLine(slidingMissingHostMask, 140, 106, 170, 106, 2);
const slidingMissingHost = recoverText4hMissingHostedWindowOrSlidingForTest(
  missingHostRetained,
  [
    // Deliberately mimic the merged 69.2 band: the actual opening boundary at
    // x=100 is available only from the unmerged raster runs.
    { axis: 'horizontal', line: 100, start: 40, end: 170, thickness: 2 },
  ],
  { x: 0.02, y: 0.02 },
  12,
  slidingMissingHostMask,
  slidingMissingHostMask,
  missingHostWidth,
  missingHostHeight,
  [],
  slidingMissingHostMask,
  slidingMissingHostMask,
);
assert.ok(slidingMissingHost.gaps.some(gap => gap.missingHostFallback === 'sliding'),
  'An anchored missing host with staggered end-to-end panels must recover as a sliding door.');
assert.ok(slidingMissingHost.segments.some(segment => segment.axis === 'horizontal'
  && segment.line === 100 && segment.start <= 40 && segment.end >= 260),
  'Sliding fallback must restore the raster-supported host wall together with the insert.');

const windowMissingHostMask = createMissingHostMask();
drawMissingHostLine(windowMissingHostMask, 40, 100, 100, 100, 2);
drawMissingHostLine(windowMissingHostMask, 100, 94, 170, 94, 2);
drawMissingHostLine(windowMissingHostMask, 100, 106, 170, 106, 2);
const windowMissingHost = recoverText4hMissingHostedWindowOrSlidingForTest(
  missingHostRetained,
  [
    { axis: 'horizontal', line: 100, start: 40, end: 100, thickness: 2 },
    { axis: 'horizontal', line: 94, start: 100, end: 170, thickness: 2 },
    { axis: 'horizontal', line: 106, start: 100, end: 170, thickness: 2 },
  ],
  { x: 0.02, y: 0.02 },
  12,
  windowMissingHostMask,
  windowMissingHostMask,
  missingHostWidth,
  missingHostHeight,
  [],
  windowMissingHostMask,
  windowMissingHostMask,
);
assert.ok(windowMissingHost.gaps.some(gap => gap.missingHostFallback === 'window'),
  'An anchored missing host with stronger parallel-frame evidence must recover as a window.');

const bareMissingHostMask = createMissingHostMask();
drawMissingHostLine(bareMissingHostMask, 40, 100, 100, 100, 2);
const bareMissingHost = recoverText4hMissingHostedWindowOrSlidingForTest(
  missingHostRetained,
  [{ axis: 'horizontal', line: 100, start: 40, end: 100, thickness: 2 }],
  { x: 0.02, y: 0.02 },
  12,
  bareMissingHostMask,
  bareMissingHostMask,
  missingHostWidth,
  missingHostHeight,
  [],
  bareMissingHostMask,
  bareMissingHostMask,
);
assert.equal(bareMissingHost.gaps.length, 0,
  'Raster wall continuation without a window/sliding symbol must never invent an aperture or host.');

// DS 12 / 67.3 regression: final hosted-element arbitration must use the
// actual oriented clear spans. A raster-evidenced door wins over an overlapping
// generic wall opening, while adjacent inserts and inserts on a parallel wall
// remain independent.
const hostedDoor = { pos: [0, 0], rotation: 0, measuredWidth: 0.9 };
assert.equal(text4hHostedAperturesOverlap(
  hostedDoor,
  { pos: [0.72, 0.02], rotation: 0, measuredWidth: 0.8 },
), true, 'A wall opening must not overlap a raster-evidenced door on the same host span.');
assert.equal(text4hHostedAperturesOverlap(
  hostedDoor,
  { pos: [0.86, 0.02], rotation: 0, measuredWidth: 0.8 },
), false, 'Adjacent hosted apertures must remain separate.');
assert.equal(text4hHostedAperturesOverlap(
  hostedDoor,
  { pos: [0.2, 0.24], rotation: 0, measuredWidth: 0.8 },
), false, 'Apertures on nearby parallel walls must not suppress one another.');
assert.equal(text4hHostedAperturesOverlap(
  { pos: [2, 1], rotation: 90, measuredWidth: 1.2 },
  { pos: [2.03, 1.8], rotation: 90, measuredWidth: 0.7 },
), true, 'Overlapping generic wall openings must share the same host-span predicate.');
const arbitrated673Openings = arbitrateText4hHostedOpenings([hostedDoor], [
  { id: 'door-overlap', pos: [0.72, 0.02], rotation: 0, measuredWidth: 0.8, evidence: { confidence: 0.95 } },
  { id: 'strong-opening', pos: [2, 0], rotation: 0, measuredWidth: 1.0, evidence: { confidence: 0.9 } },
  { id: 'weak-overlap', pos: [2.4, 0.01], rotation: 0, measuredWidth: 0.8, evidence: { confidence: 0.5 } },
  { id: 'adjacent-opening', pos: [3.1, 0], rotation: 0, measuredWidth: 0.8, evidence: { confidence: 0.7 } },
]);
assert.deepEqual(arbitrated673Openings.map(opening => opening.id), ['strong-opening', 'adjacent-opening'],
  'DS 12 / 67.3 arbitration must prioritize the door, retain the stronger opening, and preserve adjacent apertures.');
const ds673HostWall = {
  p1: [-1.2620323193061393, 2.139914739607534],
  p2: [1.5131886919860742, 2.139914739607534],
};
assert.equal(text4hOpeningHasHost(
  { pos: [3.2490943459930364, 2.139914739607534] },
  [ds673HostWall],
), false, 'DS 12 / 67.3 must not export an opening whose nearest wall host is 1.736 m away.');
assert.equal(text4hOpeningHasHost(
  { pos: [0.4, 2.139914739607534] },
  [ds673HostWall],
), true, 'A generic opening visibly hosted on the extracted wall must remain available.');
const angularHostWall = { p1: [0, 0], p2: [2, 2], wallSource: 'line' };
assert.equal(text4hOpeningHasHost({ pos: [1, 1] }, [angularHostWall]), true,
  'A generic opening on an angular straight wall must remain available.');
assert.equal(text4hOpeningHasHost({ pos: [1, 1.5] }, [angularHostWall]), false,
  'An angular opening outside the host tolerance must be rejected.');
const curvedHostWall = {
  p1: [5, 0], p2: [0, 5], wallSource: 'arc', isCurved: true,
  arcCenter: [0, 0], arcRadius: 5, arcStartAngle: 0, arcEndAngle: Math.PI / 2,
};
assert.equal(text4hOpeningHasHost({ pos: [Math.SQRT1_2 * 5, Math.SQRT1_2 * 5] }, [curvedHostWall]), true,
  'A generic opening on the bounded native arc must remain available.');
assert.equal(text4hOpeningHasHost({ pos: [-Math.SQRT1_2 * 5, Math.SQRT1_2 * 5] }, [curvedHostWall]), false,
  'An opening on the same circle but outside the retained arc span must be rejected.');
const ellipseHostWall = {
  p1: [4, 0], p2: [0, 2], wallSource: 'ellipse', isCurved: true,
  ellipseCenter: [0, 0], ellipseRadiusX: 4, ellipseRadiusY: 2,
  ellipseStartAngle: 0, ellipseEndAngle: Math.PI / 2,
};
assert.equal(text4hOpeningHasHost({ pos: [Math.SQRT1_2 * 4, Math.SQRT1_2 * 2] }, [ellipseHostWall]), true,
  'A generic opening on a bounded native ellipse must remain available.');
const curveBuildResult = await build({
  entryPoints: ['services/text4hCurveArcs.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
});
const curveModuleUrl = `data:text/javascript;base64,${Buffer.from(curveBuildResult.outputFiles[0].text).toString('base64')}`;
const {
  consolidateText4hCurveArcs,
  text4hCurveArcSourceEnvelopeCoherentForTest,
} = await import(curveModuleUrl);
const geometryBuildResult = await build({
  entryPoints: ['components/generative-wizard/features/text4h/geometry.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
});
const geometryModuleUrl = `data:text/javascript;base64,${Buffer.from(geometryBuildResult.outputFiles[0].text).toString('base64')}`;
const { completeText4hGeometry } = await import(geometryModuleUrl);
const angularCleanupBuildResult = await build({
  entryPoints: ['services/text4hAngularCleanup.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
});
const angularCleanupModuleUrl = `data:text/javascript;base64,${Buffer.from(angularCleanupBuildResult.outputFiles[0].text).toString('base64')}`;
const {
  cleanupText4hAngularWalls,
  collapseText4hExteriorAngularChamfers,
} = await import(angularCleanupModuleUrl);
const geometryModesBuildResult = await build({
  entryPoints: ['services/text4hGeometryModes.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
});
const geometryModesModuleUrl = `data:text/javascript;base64,${Buffer.from(geometryModesBuildResult.outputFiles[0].text).toString('base64')}`;
const {
  detectText4hSparseAngularColumns,
  detectText4hSparseAngularRailings,
  detectText4hSparseAngularStairs,
  inspectText4hFreeformGap,
  recoverText4hSupplementalAngularDoorHosts,
} = await import(geometryModesModuleUrl);
const curveHostingBuildResult = await build({
  entryPoints: ['services/text4hCurveHosting.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
});
const curveHostingModuleUrl = `data:text/javascript;base64,${Buffer.from(curveHostingBuildResult.outputFiles[0].text).toString('base64')}`;
const { projectText4hPointToCurve, text4hCurveHostedPose } = await import(curveHostingModuleUrl);

const hostingEllipse = {
  id: 'text4h-hosting-ellipse', type: 'wall',
  p1: { x: 5, y: 0 }, p2: { x: -5, y: 0 },
  wallSource: 'ellipse', isCurved: true,
  ellipseCenter: { x: 0, y: 0 }, ellipseRadiusX: 5, ellipseRadiusY: 5,
  ellipseRotation: 0, ellipseStartAngle: 0, ellipseEndAngle: Math.PI,
  ellipseCounterclockwise: false,
};
const ellipseProjection = projectText4hPointToCurve(hostingEllipse, { x: 0.1, y: 5.3 });
assert.ok(ellipseProjection && ellipseProjection.point.y > 4.95 && Math.abs(ellipseProjection.point.x) < 0.15,
  'Text 4.0 H curved inserts must project to the analytic ellipse instead of its p1-p2 chord.');
const ellipseHostedPose = text4hCurveHostedPose(hostingEllipse, 0.5, 1.2);
assert.ok(ellipseHostedPose && ellipseHostedPose.pos.y > 4.9,
  'A hosted curved insert must stay on the local analytic curve after width-aware positioning.');

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
const drawArc = (cx, cy, radius, startAngle, endAngle, thickness = 1) => {
  const steps = Math.max(24, Math.ceil(radius * Math.abs(endAngle - startAngle)));
  for (let step = 0; step <= steps; step++) {
    const angle = startAngle + (endAngle - startAngle) * step / steps;
    const x = Math.round(cx + Math.cos(angle) * radius);
    const y = Math.round(cy + Math.sin(angle) * radius);
    fillRect(x - thickness, y - thickness, x + thickness, y + thickness);
  }
};

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

// Thin perpendicular leaves plus their quarter-circle arcs. A leaf alone may
// be a narrow wall/furniture stroke; Text 4.0 H deliberately requires the
// door-specific swing glyph before classifying a single/double door.
verticalWall(141, 586, 620, 1);
verticalWall(266, 350, 384, 1);
horizontalWall(201, 300, 334, 1);
const leafOnlyBaselinePixels = new Uint8ClampedArray(pixels);
drawArc(141, 620, 34, -Math.PI / 2, 0);
drawArc(266, 350, 34, 0, Math.PI / 2);
drawArc(300, 201, 34, 0, Math.PI / 2);

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

// Angular/hybrid horizontal gaps must prefer the thin evidenced leaf over a
// neighboring thick jamb. This preserves the actual hinge endpoint instead
// of mirroring the swing to the opposite side of the opening.
const hingeMaskWidth = 160, hingeMaskHeight = 140;
const hingeMask = new Uint8Array(hingeMaskWidth * hingeMaskHeight);
for (let y = 70; y <= 99; y++) hingeMask[y * hingeMaskWidth + 45] = 1;
for (let y = 70; y <= 105; y++) {
  for (let x = 100; x <= 108; x++) hingeMask[y * hingeMaskWidth + x] = 1;
}
const angularHingeEvidence = detectDoorSwing(
  { axis: 'horizontal', line: 70, start: 40, end: 100, thickness: 14 },
  hingeMask, hingeMaskWidth, hingeMaskHeight, 1, 0.45,
);
assert.equal(angularHingeEvidence.isFlipped, false,
  'Angular horizontal swing detection must retain the thin leaf hinge at the gap start.');

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

// Door-symbol priority regression: a continuous hosted quarter-circle is a
// door-specific glyph. Even if parallel window-like strokes share the gap,
// the explicit arc must classify the aperture as a door, never a window.
const windowPriorityPixels = new Uint8ClampedArray(pixels);
for (let degrees = 0; degrees <= 90; degrees++) {
  const radians = degrees * Math.PI / 180;
  const x = Math.round(380 + Math.cos(radians) * 35);
  const y = Math.round(80 + Math.sin(radians) * 35);
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const px = x + ox, py = y + oy;
      if (px < 0 || py < 0 || px >= width || py >= height) continue;
      const offset = (py * width + px) * 4;
      windowPriorityPixels[offset] = 0;
      windowPriorityPixels[offset + 1] = 0;
      windowPriorityPixels[offset + 2] = 0;
      windowPriorityPixels[offset + 3] = 255;
    }
  }
}
const windowPriorityPlan = extractGeometryFromImageData({ width, height, data: windowPriorityPixels }, options);
const hostedDoorBounds = windowPriorityPlan.doors
  .map(door => door.evidence?.pixelBounds)
  .find(bounds => bounds && bounds.x0 < 390 && bounds.x1 > 420 && bounds.y0 < 90);
assert.ok(hostedDoorBounds,
  'A hosted quarter-circle arc must classify the gap as a door even beside parallel frame strokes.');
assert.ok(!windowPriorityPlan.windows.some(window => {
  const bounds = window.evidence?.pixelBounds;
  return bounds && bounds.x0 < 390 && bounds.x1 > 420 && bounds.y0 < 90;
}), 'Door-symbol evidence must never be downgraded to a window.');

// Reported Text 4.0 H direct-upload signature: wall-band merging can stop a
// narrow vertical hosted gap several pixels before the visible hinge. The
// offset leaf and its matching quarter-circle remain explicit raster evidence
// and must stay a door; a similarly sized bare gap must remain an opening.
const offsetSwingPixels = new Uint8ClampedArray(pixels);
// Remove the fixture's centred leaf/arc before drawing the deliberately
// offset variant below.
for (let y = 196; y <= 241; y++) {
  for (let x = 296; x <= 340; x++) {
    const offset = (y * width + x) * 4;
    offsetSwingPixels[offset] = 255;
    offsetSwingPixels[offset + 1] = 255;
    offsetSwingPixels[offset + 2] = 255;
  }
}
for (let y = 236; y <= 241; y++) for (let x = 296; x <= 304; x++) {
  const offset = (y * width + x) * 4;
  offsetSwingPixels[offset] = 0;
  offsetSwingPixels[offset + 1] = 0;
  offsetSwingPixels[offset + 2] = 0;
  offsetSwingPixels[offset + 3] = 255;
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
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    const px = x + ox, py = y + oy;
    const offset = (py * width + px) * 4;
    offsetSwingPixels[offset] = 0;
    offsetSwingPixels[offset + 1] = 0;
    offsetSwingPixels[offset + 2] = 0;
    offsetSwingPixels[offset + 3] = 255;
  }
}
const offsetSwingPlan = extractGeometryFromImageData({ width, height, data: offsetSwingPixels }, options);
assert.ok(offsetSwingPlan.doors.some(door => door.rotation === 90
  && door.evidence?.notes?.some(note => /offset hinge/i.test(note))),
  'A narrow uploaded swing with matching offset leaf and arc evidence must remain a door.');

// DS12 71/73/74 regression shape: the arc is drafted from a physical wall
// face, ten pixels away from the extracted host centreline. The same raster
// arc plus its explicit leaf may recover it; the leaf alone may not.
const physicalFaceGap = { axis: 'vertical', line: 310, start: 210, end: 245, thickness: 12 };
const physicalFaceLeaf = [{ axis: 'horizontal', line: 245, start: 300, end: 335, thickness: 2 }];
const physicalFaceLeafOnlyPixels = new Uint8ClampedArray(pixels);
for (let y = 196; y <= 241; y++) for (let x = 296; x <= 340; x++) {
  const offset = (y * width + x) * 4;
  physicalFaceLeafOnlyPixels[offset] = 255;
  physicalFaceLeafOnlyPixels[offset + 1] = 255;
  physicalFaceLeafOnlyPixels[offset + 2] = 255;
}
for (let x = 300; x <= 335; x++) {
  const offset = (245 * width + x) * 4;
  physicalFaceLeafOnlyPixels[offset] = 0;
  physicalFaceLeafOnlyPixels[offset + 1] = 0;
  physicalFaceLeafOnlyPixels[offset + 2] = 0;
  physicalFaceLeafOnlyPixels[offset + 3] = 255;
}
assert.ok(findText4hPhysicalWallFaceSwingForTest(
  { width, height, data: offsetSwingPixels },
  physicalFaceGap,
  physicalFaceLeaf,
  12,
)?.arcConfirmed, 'A matching face-level arc and explicit leaf must recover the missed hosted swing.');
assert.equal(findText4hPhysicalWallFaceSwingForTest(
  { width, height, data: physicalFaceLeafOnlyPixels },
  physicalFaceGap,
  physicalFaceLeaf,
  12,
), undefined, 'A physical-wall-face leaf without its matching arc must not manufacture a door.');

// Reported direct-upload raster style: walls are black, but the centered door
// leaf and swing arc are antialiased light gray (sampled near grayscale 190).
// Weak ink may recover this door only as an agreeing leaf-plus-arc pair.
const weakInkDoorBasePixels = new Uint8ClampedArray(leafOnlyBaselinePixels);
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
const weakInkDoorBasePlan = extractGeometryFromImageData({ width, height, data: weakInkDoorBasePixels }, options);
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
assert.equal(weakInkDoorPlan.doors.length, weakInkDoorBasePlan.doors.length + 1,
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
assert.equal(weakLeafOnlyPlan.doors.length, weakInkDoorBasePlan.doors.length,
  'A light-gray perpendicular line without a matching swing arc must remain insufficient door evidence.');

// A nearly closed swing leaf can run parallel to its host wall and visually
// bridge the aperture. The matching quarter-circle must recover that hosted
// door before the continuous wall run causes ordinary gap extraction to miss
// it. The parallel leaf alone remains insufficient evidence.
const closedSwingBasePixels = new Uint8ClampedArray(leafOnlyBaselinePixels);
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
const closedLeafOnlyPlan = extractGeometryFromImageData({ width, height, data: closedSwingBasePixels }, options);
assert.equal(closedSwingPlan.doors.length, closedLeafOnlyPlan.doors.length + 1,
  'A parallel near-closed leaf with its matching quarter-circle must recover a door from a continuous wall run.');
assert.ok(closedSwingPlan.doors.some(door => {
  const bounds = door.evidence?.pixelBounds;
  return bounds && bounds.x0 <= 266 && bounds.x1 >= 299 && Math.abs((bounds.y0 + bounds.y1) / 2 - 350) <= 5;
}), 'The recovered near-closed swing must remain hosted at its raster-evidenced wall interval.');

assert.equal(closedLeafOnlyPlan.doors.length, weakInkDoorBasePlan.doors.length,
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
  ocrStatus: 'provided',
  textObservations: [{
    text: 'BALCONY', confidence: 96,
    bbox: { x0: 140, y0: 430, x1: 238, y1: 466 },
  }],
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
const completedAllElements = runQuietly(() => completeText4hGeometry(allElementsWithBalconyOcr));
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
// shared converter used by generated and manually uploaded Text 4.0 H images.
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
const ds4010SlidingDoor = dataset4Plans['010'].doors.find(door => door.type === 'sliding');
assert.ok(ds4010SlidingDoor?.evidence?.pixelBounds
  && ds4010SlidingDoor.evidence.pixelBounds.x0 <= 130
  && ds4010SlidingDoor.evidence.pixelBounds.x1 >= 300,
  'DS4 010 explicit staggered panels must retain their complete span as a sliding door, not a narrower window fallback.');
assert.equal(dataset4Plans['010'].railings.length, 1,
  'DS4 010 embedded balcony edge must be retained as a railing rather than a window.');

// Matched DS05 regression set: these Text 4.0 H-generated images contain
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
    expected: { doors: 5, windows: 4, openings: 1, columns: 0, railings: 1, rooms: 8 },
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
assert.ok(exactWallFaces.width <= 10 + 1e-9 && exactWallFaces.height <= 12 + 1e-9, 'Text 4.0 H exterior wall faces must fit inside the confirmed envelope.');
assert.ok(Math.abs(exactWallFaces.height - 12) < 1e-9, 'Uniform scaling should fill the limiting requested axis at the exterior wall face.');
assert.ok(Math.abs(exactWidth / exactHeight - 400 / 540) < 1e-9, 'Envelope enforcement must preserve the raster wall aspect ratio.');
assert.equal(exactEnvelope.extractionDiagnostics.scaleSource, 'requested-boundary');
assert.ok(
  exactEnvelope.extractionDiagnostics.warnings.some(warning => /uniform scale preserved the floorplan aspect ratio/i.test(warning)),
  'A source-image aspect mismatch must disclose aspect-preserving letterboxing.',
);
const completedExactEnvelope = runQuietly(() => completeText4hGeometry(exactEnvelope, options.designSummary));
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
const completedOcrAware = runQuietly(() => completeText4hGeometry(ocrAware));
assert.equal(completedOcrAware.doors.filter(door => door.mandatoryExteriorEntry).length, 1, 'Geometry completion must not add a second mandatory entry.');
assert.deepEqual(
  completedOcrAware.rooms.find(room => room.label === 'Master Bedroom').pos,
  ocrAware.rooms.find(room => room.label === 'Master Bedroom').pos,
  'Geometry completion must preserve source orientation instead of mirroring the plan.',
);

// A balcony is circulation-connected by a door, never silently represented as
// a low-sill/full-height window. Existing facade glazing may be reclassified,
// but the resulting assumption must remain explicit in provenance metadata.
const balconyPlan = runQuietly(() => completeText4hGeometry({
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
  return completeText4hGeometry({
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

// F-only geometry-mode regressions. The established orthogonal fixture must
// remain on its original detector, while angular, curved, and hybrid shells
// retain their evidenced non-axis wall geometry instead of collapsing to a
// rectangular approximation.
const createWhiteRaster = (rasterWidth, rasterHeight) => {
  const data = new Uint8ClampedArray(rasterWidth * rasterHeight * 4);
  data.fill(255);
  return { width: rasterWidth, height: rasterHeight, data };
};
const drawDisk = (raster, cx, cy, radius, gray = 0) => {
  const radiusSquared = radius * radius;
  for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(raster.height - 1, Math.ceil(cy + radius)); y++) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(raster.width - 1, Math.ceil(cx + radius)); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > radiusSquared) continue;
      const offset = (y * raster.width + x) * 4;
      raster.data[offset] = gray;
      raster.data[offset + 1] = gray;
      raster.data[offset + 2] = gray;
      raster.data[offset + 3] = 255;
    }
  }
};
const drawThickLine = (raster, x1, y1, x2, y2, thickness = 10, gray = 0) => {
  const length = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
  const steps = Math.ceil(length * 1.25);
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    drawDisk(raster, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, thickness / 2, gray);
  }
};
const drawRasterArc = (raster, cx, cy, radius, startAngle, endAngle, thickness = 2, gray = 0) => {
  const steps = Math.max(24, Math.ceil(radius * Math.abs(endAngle - startAngle) * 1.5));
  for (let step = 0; step <= steps; step++) {
    const angle = startAngle + (endAngle - startAngle) * step / steps;
    drawDisk(raster, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, thickness / 2, gray);
  }
};
const drawPolyline = (raster, points, thickness = 10, closed = false) => {
  const edgeCount = closed ? points.length : points.length - 1;
  for (let index = 0; index < edgeCount; index++) {
    const a = points[index], b = points[(index + 1) % points.length];
    drawThickLine(raster, a[0], a[1], b[0], b[1], thickness);
  }
};
const nonAxisWalls = plan => plan.walls.filter(wall => {
  const dx = Math.abs(wall.p2[0] - wall.p1[0]);
  const dy = Math.abs(wall.p2[1] - wall.p1[1]);
  return dx > 0.08 && dy > 0.08;
});
const nativeArcWalls = plan => plan.walls.filter(wall => wall.wallSource === 'arc' && wall.isCurved);
const nativeCurveWalls = plan => plan.walls.filter(wall =>
  wall.isCurved && (wall.wallSource === 'arc' || wall.wallSource === 'ellipse'));
const boundaryHasNonAxisEdge = plan => plan.boundary.some((point, index) => {
  const next = plan.boundary[(index + 1) % plan.boundary.length];
  return next && Math.abs(next[0] - point[0]) > 0.08 && Math.abs(next[1] - point[1]) > 0.08;
});

assert.equal(nonAxisWalls(first).length, 0,
  'The established rectilinear fixture must stay on the unchanged orthogonal detector.');
assert.equal(nativeArcWalls(first).length, 0,
  'Native-arc consolidation must remain completely inactive for rectilinear plans.');
assert.ok(!first.extractionDiagnostics.warnings.some(warning => /angular|curved|hybrid geometry detector/i.test(warning)),
  'Non-orthogonal safeguards must remain completely inactive for rectilinear plans.');

// DS12 #71 regression: several framed windows can prevent the band builder
// from retaining any horizontal run on one facade. Two retained perpendicular
// wall ends may locate the missing side, but the raster remains authoritative.
const missingFacadeMaskWidth = 520, missingFacadeMaskHeight = 520;
const missingFacadeMask = new Uint8Array(missingFacadeMaskWidth * missingFacadeMaskHeight);
for (let y = 432; y <= 448; y++) {
  for (let x = 80; x <= 440; x++) missingFacadeMask[y * missingFacadeMaskWidth + x] = 1;
}
const missingFacadeSegments = [
  { axis: 'horizontal', line: 80, start: 80, end: 440, thickness: 16 },
  { axis: 'horizontal', line: 250, start: 80, end: 440, thickness: 10 },
  { axis: 'vertical', line: 80, start: 80, end: 440, thickness: 16 },
  { axis: 'vertical', line: 210, start: 250, end: 440, thickness: 10 },
  { axis: 'vertical', line: 335, start: 250, end: 440, thickness: 10 },
  { axis: 'vertical', line: 440, start: 80, end: 440, thickness: 16 },
];
const recoveredMissingFacade = recoverText4hMissingFacadeWallRunsForTest(
  missingFacadeSegments,
  missingFacadeMask,
  missingFacadeMaskWidth,
  missingFacadeMaskHeight,
  14,
);
assert.ok(recoveredMissingFacade.some(segment =>
  segment.axis === 'horizontal'
  && Math.abs(segment.line - 440) <= 10
  && segment.start <= 90
  && segment.end >= 430),
  'Two retained wall ends may restore only a strongly raster-evidenced missing facade run.');

// DS12 #68 regression: a shared vertical partition between two OCR-labelled
// rooms may be retained only below their common junction. Restore its missing
// upper run only when the original raster contains a continuous thick band
// between the two room tags and the surrounding top/bottom walls are observed.
const interiorPartitionWidth = 500, interiorPartitionHeight = 500;
const interiorPartitionMask = createWhiteRaster(interiorPartitionWidth, interiorPartitionHeight);
drawThickLine(interiorPartitionMask, 80, 80, 420, 80, 14);
drawThickLine(interiorPartitionMask, 80, 420, 420, 420, 14);
drawThickLine(interiorPartitionMask, 80, 80, 80, 420, 14);
drawThickLine(interiorPartitionMask, 420, 80, 420, 420, 14);
drawThickLine(interiorPartitionMask, 250, 80, 250, 420, 14);
const interiorPartitionBinaryMask = new Uint8Array(interiorPartitionWidth * interiorPartitionHeight);
for (let index = 0; index < interiorPartitionBinaryMask.length; index++) {
  interiorPartitionBinaryMask[index] = interiorPartitionMask.data[index * 4] < 128 ? 1 : 0;
}
const interiorPartitionSegments = [
  { axis: 'horizontal', line: 80, start: 80, end: 420, thickness: 14 },
  { axis: 'horizontal', line: 420, start: 80, end: 420, thickness: 14 },
  { axis: 'vertical', line: 80, start: 80, end: 420, thickness: 14 },
  { axis: 'vertical', line: 250, start: 250, end: 420, thickness: 14 },
  { axis: 'vertical', line: 420, start: 80, end: 420, thickness: 14 },
];
const recoveredInteriorPartition = recoverText4hInteriorPartitionsForTest(
  interiorPartitionSegments,
  interiorPartitionBinaryMask,
  interiorPartitionWidth,
  interiorPartitionHeight,
  14,
  [
    { label: 'Kitchenette', x: 165, y: 200, confidence: 92 },
    { label: 'Bathroom', x: 335, y: 200, confidence: 92 },
  ],
);
assert.ok(recoveredInteriorPartition.some(segment =>
  segment.axis === 'vertical'
  && Math.abs(segment.line - 250) <= 12
  && segment.start <= 90
  && segment.end >= 410),
  'Two same-row room tags may restore a missing shared partition only from a continuous raster wall band.');

const angularRaster = createWhiteRaster(520, 520);
const angularShell = [[90, 80], [430, 80], [455, 420], [235, 470], [65, 325]];
drawPolyline(angularRaster, angularShell, 14, true);
drawThickLine(angularRaster, 235, 470, 235, 230, 9);
drawThickLine(angularRaster, 235, 230, 430, 230, 9);
const angularPlan = extractGeometryFromImageData(angularRaster, {
  requestedBoundary: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 12 }, { x: 0, y: 12 }],
  designSummary: 'Rooms Included:\n- 1 Living Room\n- 1 Kitchen\n- 1 Bedroom\nFloors: Single-story',
  disableOcr: true,
});
assert.ok(nonAxisWalls(angularPlan).length >= 3,
  'Angular tracing must retain the evidenced diagonal shell walls as native wall chords.');
assert.equal(nativeArcWalls(angularPlan).length, 0,
  'Straight angular walls must remain wall chords rather than being fitted into false arcs.');
assert.ok(boundaryHasNonAxisEdge(angularPlan),
  'An angular shell must retain a non-axis property-boundary edge.');
assert.ok(angularPlan.rooms.length >= 2,
  'Angular walls must participate in the common enclosure and room-recovery pipeline.');
const angularPlanWithNumericOcr = extractGeometryFromImageData(angularRaster, {
  requestedBoundary: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 12 }, { x: 0, y: 12 }],
  designSummary: 'Rooms Included:\n- 1 Living Room\n- 1 Kitchen\n- 1 Bedroom\nFloors: Single-story',
  textObservations: [{
    text: '10.63 m',
    confidence: 92,
    bbox: { x0: 390, y0: 70, x1: 482, y1: 445 },
  }],
  ocrStatus: 'completed',
});
assert.ok(nonAxisWalls(angularPlanWithNumericOcr).length >= nonAxisWalls(angularPlan).length,
  'Final OCR pass must not erase or downgrade angular wall topology when OCR found no reliable room labels.');
assert.ok(angularPlanWithNumericOcr.rooms.length >= angularPlan.rooms.length,
  'Final OCR pass must not reduce angular enclosure recovery when OCR only found dimensions/annotation text.');

const angularOpeningRaster = createWhiteRaster(520, 520);
drawPolyline(angularOpeningRaster, angularShell, 14, true);
drawThickLine(angularOpeningRaster, 235, 470, 235, 230, 9);
drawThickLine(angularOpeningRaster, 235, 230, 430, 230, 9);
const interpolatePoint = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const doorEdgeStart = angularShell[3], doorEdgeEnd = angularShell[4];
const doorGapStart = interpolatePoint(doorEdgeStart, doorEdgeEnd, 0.405);
const doorGapEnd = interpolatePoint(doorEdgeStart, doorEdgeEnd, 0.435);
drawThickLine(angularOpeningRaster, ...doorGapStart, ...doorGapEnd, 18, 255);
const doorVector = [doorGapEnd[0] - doorGapStart[0], doorGapEnd[1] - doorGapStart[1]];
const doorVectorLength = Math.hypot(...doorVector);
const doorNormal = [-doorVector[1] / doorVectorLength, doorVector[0] / doorVectorLength];
drawThickLine(
  angularOpeningRaster,
  doorGapStart[0], doorGapStart[1],
  doorGapStart[0] + doorNormal[0] * Math.max(34, doorVectorLength * 0.82),
  doorGapStart[1] + doorNormal[1] * Math.max(34, doorVectorLength * 0.82),
  2,
);
const doorLeafLength = Math.max(34, doorVectorLength * 0.82);
drawRasterArc(
  angularOpeningRaster,
  doorGapStart[0],
  doorGapStart[1],
  doorLeafLength,
  Math.atan2(doorNormal[1], doorNormal[0]),
  Math.atan2(doorVector[1], doorVector[0]),
  2,
);
const windowEdgeStart = angularShell[2], windowEdgeEnd = angularShell[3];
const windowGapStart = interpolatePoint(windowEdgeStart, windowEdgeEnd, 0.31);
const windowGapEnd = interpolatePoint(windowEdgeStart, windowEdgeEnd, 0.37);
drawThickLine(angularOpeningRaster, ...windowGapStart, ...windowGapEnd, 18, 255);
const windowVector = [windowGapEnd[0] - windowGapStart[0], windowGapEnd[1] - windowGapStart[1]];
const windowVectorLength = Math.hypot(...windowVector);
const windowNormal = [-windowVector[1] / windowVectorLength, windowVector[0] / windowVectorLength];
const windowTangent = [windowVector[0] / windowVectorLength, windowVector[1] / windowVectorLength];
drawThickLine(
  angularOpeningRaster,
  windowGapStart[0] - windowTangent[0] * 9 + windowNormal[0] * 2.5,
  windowGapStart[1] - windowTangent[1] * 9 + windowNormal[1] * 2.5,
  windowGapEnd[0] + windowTangent[0] * 9 + windowNormal[0] * 2.5,
  windowGapEnd[1] + windowTangent[1] * 9 + windowNormal[1] * 2.5,
  2,
);
const angularOpeningPlan = extractGeometryFromImageData(angularOpeningRaster, {
  requestedBoundary: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 12 }, { x: 0, y: 12 }],
  designSummary: 'Rooms Included:\n- 1 Living Room\n- 1 Kitchen\n- 1 Bedroom\nFloors: Single-story',
  disableOcr: true,
});
const isNonAxisRotation = rotation => {
  const normalized = Math.abs(rotation || 0) % 90;
  return Math.min(normalized, 90 - normalized) >= 8;
};
assert.ok(angularOpeningPlan.doors.some(door => isNonAxisRotation(door.rotation)),
  'A swing leaf cut into an angular wall must remain a door on its non-axis host chord.');
assert.ok(angularOpeningPlan.windows.some(window => isNonAxisRotation(window.rotation)),
  'A parallel frame cut into an angular exterior wall must remain a window on its non-axis host chord.');
assert.ok(angularOpeningPlan.rooms.length >= 2,
  'Hosted angular openings must not break the common enclosure flood-fill.');

// DS09 #020 regression: a straight angular host can be emitted as multiple
// detector chords around an opening, and an angular/orthogonal junction can
// stop at the joining wall face. Final F representation cleanup may join those
// pieces only when they remain collinear and the source raster supports them.
const cleanupMaskWidth = 180, cleanupMaskHeight = 130;
const cleanupMask = new Uint8Array(cleanupMaskWidth * cleanupMaskHeight);
const drawCleanupLine = (targetMask, x1, y1, x2, y2, thickness = 7) => {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(length * 1.5));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const cx = x1 + (x2 - x1) * t, cy = y1 + (y2 - y1) * t;
    const radius = thickness / 2;
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
        if (x >= 0 && y >= 0 && x < cleanupMaskWidth && y < cleanupMaskHeight
          && Math.hypot(x - cx, y - cy) <= radius) targetMask[y * cleanupMaskWidth + x] = 1;
      }
    }
  }
};

// A clearly drawn swing can sit between two canonical angular wall fragments
// that the primary skeleton kept in separate components. The F-only hybrid
// safeguard must recover that host gap from the actual leaf evidence; it may
// not infer a door from endpoint proximity alone.
const supplementalDoorMaskWidth = 220, supplementalDoorMaskHeight = 220;
const supplementalDoorStructuralMask = new Uint8Array(supplementalDoorMaskWidth * supplementalDoorMaskHeight);
const supplementalDoorEvidenceMask = new Uint8Array(supplementalDoorStructuralMask.length);
const drawSupplementalLine = (targetMask, x1, y1, x2, y2, thickness = 3) => {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(length * 1.5));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const cx = x1 + (x2 - x1) * t, cy = y1 + (y2 - y1) * t;
    const radius = thickness / 2;
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      if (x >= 0 && y >= 0 && x < supplementalDoorMaskWidth && y < supplementalDoorMaskHeight
        && Math.hypot(x - cx, y - cy) <= radius) targetMask[y * supplementalDoorMaskWidth + x] = 1;
    }
  }
};
drawSupplementalLine(supplementalDoorStructuralMask, 25, 25, 85, 85, 10);
drawSupplementalLine(supplementalDoorStructuralMask, 130, 130, 195, 195, 10);
supplementalDoorEvidenceMask.set(supplementalDoorStructuralMask);
drawSupplementalLine(supplementalDoorEvidenceMask, 85, 85, 42, 128, 2);
const supplementalAngularDoor = recoverText4hSupplementalAngularDoorHosts(
  supplementalDoorStructuralMask,
  supplementalDoorEvidenceMask,
  supplementalDoorMaskWidth,
  supplementalDoorMaskHeight,
  10,
  [
    { p1: { x: 25, y: 25 }, p2: { x: 85, y: 85 }, thickness: 10, confidence: 0.84 },
    { p1: { x: 130, y: 130 }, p2: { x: 195, y: 195 }, thickness: 10, confidence: 0.84 },
  ],
  [],
);
assert.equal(supplementalAngularDoor.gaps.length, 1,
  'A raster-evidenced swing between aligned angular host fragments must recover exactly one door gap.');
const unsupportedSupplementalDoor = recoverText4hSupplementalAngularDoorHosts(
  supplementalDoorStructuralMask,
  supplementalDoorStructuralMask,
  supplementalDoorMaskWidth,
  supplementalDoorMaskHeight,
  10,
  [
    { p1: { x: 25, y: 25 }, p2: { x: 85, y: 85 }, thickness: 10, confidence: 0.84 },
    { p1: { x: 130, y: 130 }, p2: { x: 195, y: 195 }, thickness: 10, confidence: 0.84 },
  ],
  [],
);
assert.equal(unsupportedSupplementalDoor.gaps.length, 0,
  'Aligned angular endpoints without a raster door leaf must remain untouched.');

drawCleanupLine(cleanupMask, 20, 20, 112, 66, 8);
drawCleanupLine(cleanupMask, 112, 12, 112, 104, 8);
const cleanupInput = [
  { p1: { x: 20, y: 20 }, p2: { x: 50, y: 35 }, thickness: 8, confidence: 0.84 },
  { p1: { x: 50, y: 35 }, p2: { x: 66, y: 43 }, thickness: 8, confidence: 0.72, bridge: true },
  { p1: { x: 66, y: 43 }, p2: { x: 104, y: 62 }, thickness: 8, confidence: 0.84 },
];
const cleanupAxisInput = [
  { axis: 'vertical', line: 112, start: 12, end: 104, thickness: 8 },
];
const cleanedAngular = cleanupText4hAngularWalls(cleanupInput, cleanupAxisInput, {
  mode: 'angular', structuralMask: cleanupMask,
  width: cleanupMaskWidth, height: cleanupMaskHeight, typicalThickness: 8,
});
assert.equal(cleanedAngular.freeformSegments.length, 1,
  'Collinear angular wall chords and their evidenced opening bridge must become one clean host wall.');
assert.ok(Math.hypot(
  cleanedAngular.freeformSegments[0].p2.x - cleanedAngular.freeformSegments[0].p1.x,
  cleanedAngular.freeformSegments[0].p2.y - cleanedAngular.freeformSegments[0].p1.y,
) >= 102,
  'A raster-supported loose angular endpoint must close at its orthogonal junction.');

const unsupportedMask = new Uint8Array(cleanupMaskWidth * cleanupMaskHeight);
const unsupportedGap = cleanupText4hAngularWalls([
  { p1: { x: 20, y: 90 }, p2: { x: 60, y: 70 }, thickness: 8, confidence: 0.84 },
], [{ axis: 'vertical', line: 72, start: 40, end: 100, thickness: 8 }], {
  mode: 'angular', structuralMask: unsupportedMask,
  width: cleanupMaskWidth, height: cleanupMaskHeight, typicalThickness: 8,
});
assert.equal(unsupportedGap.freeformSegments[0].p2.x, 60,
  'A loose angular endpoint without raster support must remain open.');

const mixedJunctionMask = new Uint8Array(cleanupMaskWidth * cleanupMaskHeight);
drawCleanupLine(mixedJunctionMask, 15, 95, 64, 95, 8);
drawCleanupLine(mixedJunctionMask, 64, 95, 96, 63, 8);
const cleanedMixedJunction = cleanupText4hAngularWalls([
  { p1: { x: 64, y: 95 }, p2: { x: 96, y: 63 }, thickness: 8, confidence: 0.84 },
], [{ axis: 'horizontal', line: 95, start: 15, end: 60, thickness: 8 }], {
  mode: 'hybrid', structuralMask: mixedJunctionMask,
  width: cleanupMaskWidth, height: cleanupMaskHeight, typicalThickness: 8,
});
assert.equal(cleanedMixedJunction.axisSegments[0].end, 64,
  'An orthogonal host endpoint must close at its raster-supported angular junction in hybrid mode.');

const chamferedExteriorCorner = collapseText4hExteriorAngularChamfers([
  { p1: { x: 0, y: 0 }, p2: { x: 100, y: 100 }, thickness: 8, confidence: 0.84 },
  { p1: { x: 100, y: 100 }, p2: { x: 110, y: 100 }, thickness: 8, confidence: 0.72 },
  { p1: { x: 110, y: 100 }, p2: { x: 210, y: 0 }, thickness: 8, confidence: 0.84 },
], {
  typicalThickness: 8,
  maxLengthPixels: 16,
  isExterior: () => true,
});
assert.equal(chamferedExteriorCorner.length, 2,
  'A tiny exterior raster cap between angular runs must not survive as a chamfer wall.');
assert.ok(chamferedExteriorCorner.every(segment => Math.hypot(
  segment.p1.x - 105,
  segment.p1.y - 105,
) < 0.01 || Math.hypot(segment.p2.x - 105, segment.p2.y - 105) < 0.01),
  'Angular runs must meet at their shared line intersection after cap removal.');
const protectedInteriorCap = collapseText4hExteriorAngularChamfers([
  { p1: { x: 0, y: 0 }, p2: { x: 100, y: 100 }, thickness: 8, confidence: 0.84 },
  { p1: { x: 100, y: 100 }, p2: { x: 110, y: 100 }, thickness: 8, confidence: 0.72 },
  { p1: { x: 110, y: 100 }, p2: { x: 210, y: 0 }, thickness: 8, confidence: 0.84 },
], {
  typicalThickness: 8,
  maxLengthPixels: 16,
  isExterior: () => false,
});
assert.equal(protectedInteriorCap.length, 3,
  'Interior short walls must not be removed by exterior corner cleanup.');

const canonicalAngleMask = new Uint8Array(cleanupMaskWidth * cleanupMaskHeight);
drawCleanupLine(canonicalAngleMask, 18, 18, 82, 80, 9); // 44.1 degrees
drawCleanupLine(canonicalAngleMask, 18, 108, 75, 75, 9); // 30.1 degrees
drawCleanupLine(canonicalAngleMask, 105, 108, 138, 51, 9); // 59.9 degrees
const canonicalAngles = cleanupText4hAngularWalls([
  { p1: { x: 18, y: 18 }, p2: { x: 82, y: 80 }, thickness: 9, confidence: 0.84 },
  { p1: { x: 18, y: 108 }, p2: { x: 75, y: 75 }, thickness: 9, confidence: 0.84 },
  { p1: { x: 105, y: 108 }, p2: { x: 138, y: 51 }, thickness: 9, confidence: 0.84 },
], [], {
  mode: 'angular', structuralMask: canonicalAngleMask,
  width: cleanupMaskWidth, height: cleanupMaskHeight, typicalThickness: 9,
});
const normalizedWallAngle = segment => {
  const angle = (Math.atan2(segment.p2.y - segment.p1.y, segment.p2.x - segment.p1.x) * 180 / Math.PI + 180) % 180;
  return angle;
};
const distanceFromAngle = (angle, target) => Math.min(Math.abs(angle - target), 180 - Math.abs(angle - target));
assert.ok(canonicalAngles.freeformSegments.some(segment => distanceFromAngle(normalizedWallAngle(segment), 45) < 0.01),
  'A raster-supported wall close to 45 degrees must align exactly to the dominant 45-degree family.');
assert.ok(canonicalAngles.freeformSegments.some(segment => [30, 150].some(
  target => distanceFromAngle(normalizedWallAngle(segment), target) < 0.01,
)),
  'A raster-supported wall close to 30 degrees must align exactly to the 30/60-degree family.');
assert.ok(canonicalAngles.freeformSegments.some(segment => [60, 120].some(
  target => distanceFromAngle(normalizedWallAngle(segment), target) < 0.01,
)),
  'A raster-supported wall close to 60 degrees must align exactly to the 30/60-degree family.');

const freeAngleMask = new Uint8Array(cleanupMaskWidth * cleanupMaskHeight);
drawCleanupLine(freeAngleMask, 20, 105, 100, 45, 8);
const freeAngleInput = [{
  p1: { x: 20, y: 105 }, p2: { x: 100, y: 45 }, thickness: 8, confidence: 0.84,
}];
const freeAngleResult = cleanupText4hAngularWalls(freeAngleInput, [], {
  mode: 'angular', structuralMask: freeAngleMask,
  width: cleanupMaskWidth, height: cleanupMaskHeight, typicalThickness: 8,
});
assert.ok(Math.abs(normalizedWallAngle(freeAngleResult.freeformSegments[0]) - normalizedWallAngle(freeAngleInput[0])) < 0.01,
  'A genuine free-angle wall outside the canonical families must retain its measured direction.');

const absorbedBridgeMask = new Uint8Array(cleanupMaskWidth * cleanupMaskHeight);
drawCleanupLine(absorbedBridgeMask, 50, 10, 50, 100, 8);
const absorbedBridge = cleanupText4hAngularWalls([
  { p1: { x: 50.6, y: 40 }, p2: { x: 50.6, y: 60 }, thickness: 8, confidence: 0.72, bridge: true },
], [
  { axis: 'vertical', line: 50, start: 10, end: 40, thickness: 8 },
  { axis: 'vertical', line: 50, start: 60, end: 100, thickness: 8 },
], {
  mode: 'hybrid', structuralMask: absorbedBridgeMask,
  width: cleanupMaskWidth, height: cleanupMaskHeight, typicalThickness: 8,
});
assert.equal(absorbedBridge.freeformSegments.length, 0,
  'An axis-aligned freeform opening bridge must be absorbed into its established orthogonal host.');
assert.equal(absorbedBridge.axisSegments.length, 1,
  'Absorbing an axis-aligned bridge must leave one clean continuous axis host.');

const microConnectorMask = new Uint8Array(cleanupMaskWidth * cleanupMaskHeight);
drawCleanupLine(microConnectorMask, 15, 70, 64, 70, 8);
drawCleanupLine(microConnectorMask, 64, 70, 98, 36, 8);
const microConnector = cleanupText4hAngularWalls([
  { p1: { x: 60, y: 74 }, p2: { x: 98, y: 36 }, thickness: 8, confidence: 0.84 },
], [
  { axis: 'horizontal', line: 70, start: 15, end: 60, thickness: 8 },
  { axis: 'vertical', line: 60, start: 70, end: 74, thickness: 8 },
], {
  mode: 'hybrid', structuralMask: microConnectorMask,
  width: cleanupMaskWidth, height: cleanupMaskHeight, typicalThickness: 8,
});
assert.equal(microConnector.axisSegments.filter(segment => segment.axis === 'vertical').length, 0,
  'A wall-face micro-connector must collapse into a shared angular/orthogonal junction node.');
assert.equal(microConnector.axisSegments.find(segment => segment.axis === 'horizontal')?.end, 64,
  'The surviving orthogonal wall must terminate at the shared canonical junction.');
assert.deepEqual(microConnector.freeformSegments[0].p1, { x: 64, y: 70 },
  'The surviving angular wall must begin at the same shared canonical junction.');

const supportedCompletionMask = new Uint8Array(cleanupMaskWidth * cleanupMaskHeight);
drawCleanupLine(supportedCompletionMask, 20, 100, 80, 40, 8);
drawCleanupLine(supportedCompletionMask, 80, 40, 112, 72, 8);
const supportedCompletion = cleanupText4hAngularWalls([
  { p1: { x: 20, y: 100 }, p2: { x: 50, y: 70 }, thickness: 8, confidence: 0.84 },
  { p1: { x: 80, y: 40 }, p2: { x: 112, y: 72 }, thickness: 8, confidence: 0.84 },
], [], {
  mode: 'angular', structuralMask: supportedCompletionMask,
  width: cleanupMaskWidth, height: cleanupMaskHeight, typicalThickness: 8,
});
assert.ok(supportedCompletion.freeformSegments.some(segment =>
  [segment.p1, segment.p2].some(point => Math.hypot(point.x - 80, point.y - 40) < 0.1)
  && [segment.p1, segment.p2].some(point => Math.hypot(point.x - 20, point.y - 100) < 0.1)),
  'A dangling canonical wall must extend to an existing corner when the complete host is raster-supported.');

const unsupportedCompletionMask = new Uint8Array(cleanupMaskWidth * cleanupMaskHeight);
drawCleanupLine(unsupportedCompletionMask, 20, 100, 50, 70, 8);
drawCleanupLine(unsupportedCompletionMask, 80, 40, 112, 72, 8);
const unsupportedCompletion = cleanupText4hAngularWalls([
  { p1: { x: 20, y: 100 }, p2: { x: 50, y: 70 }, thickness: 8, confidence: 0.84 },
  { p1: { x: 80, y: 40 }, p2: { x: 112, y: 72 }, thickness: 8, confidence: 0.84 },
], [], {
  mode: 'angular', structuralMask: unsupportedCompletionMask,
  width: cleanupMaskWidth, height: cleanupMaskHeight, typicalThickness: 8,
});
assert.deepEqual(unsupportedCompletion.freeformSegments[0].p2, { x: 50, y: 70 },
  'A geometrically convenient but unsupported long closure must remain open.');

const jitteredRunMask = new Uint8Array(cleanupMaskWidth * cleanupMaskHeight);
drawCleanupLine(jitteredRunMask, 18, 102, 132, 43, 9);
const jitteredRun = cleanupText4hAngularWalls([
  { p1: { x: 18, y: 102 }, p2: { x: 62, y: 81 }, thickness: 9, confidence: 0.84 },
  { p1: { x: 64, y: 79 }, p2: { x: 132, y: 43 }, thickness: 9, confidence: 0.84 },
], [], {
  mode: 'angular', structuralMask: jitteredRunMask,
  width: cleanupMaskWidth, height: cleanupMaskHeight, typicalThickness: 9,
});
assert.equal(jitteredRun.freeformSegments.length, 1,
  'Small raster-supported tracing jitter along one angular wall run must clean into one editable wall.');

const sharpCornerInput = [
  { p1: { x: 20, y: 20 }, p2: { x: 50, y: 35 }, thickness: 8, confidence: 0.84 },
  { p1: { x: 50, y: 35 }, p2: { x: 72, y: 64 }, thickness: 8, confidence: 0.84 },
];
const sharpCorner = cleanupText4hAngularWalls(sharpCornerInput, [], {
  mode: 'angular', structuralMask: cleanupMask,
  width: cleanupMaskWidth, height: cleanupMaskHeight, typicalThickness: 8,
});
assert.equal(sharpCorner.freeformSegments.length, 2,
  'A real angular corner must not be flattened by straight-run cleanup.');
const orthogonalNoOp = cleanupText4hAngularWalls(cleanupInput, cleanupAxisInput, {
  mode: 'orthogonal', structuralMask: cleanupMask,
  width: cleanupMaskWidth, height: cleanupMaskHeight, typicalThickness: 8,
});
assert.deepEqual(orthogonalNoOp.freeformSegments.map(({ cleanup, ...segment }) => segment), cleanupInput,
  'The angular cleanup must remain byte-for-byte inactive for orthogonal mode.');
const curvedNoOp = cleanupText4hAngularWalls(cleanupInput, cleanupAxisInput, {
  mode: 'curved', structuralMask: cleanupMask,
  width: cleanupMaskWidth, height: cleanupMaskHeight, typicalThickness: 8,
});
assert.equal(curvedNoOp.freeformSegments.length, cleanupInput.length,
  'The straight angular cleanup must not simplify curved-mode wall chords.');

const curvedRaster = createWhiteRaster(560, 560);
const curveCenter = [280, 280];
const curveRadius = 210;
const curvePoints = Array.from({ length: 144 }, (_, index) => {
  const angle = index / 144 * Math.PI * 2;
  return [curveCenter[0] + Math.cos(angle) * curveRadius, curveCenter[1] + Math.sin(angle) * curveRadius];
});
drawPolyline(curvedRaster, curvePoints, 15, true);
drawThickLine(curvedRaster, 280, 70, 280, 490, 9);
drawThickLine(curvedRaster, 70, 280, 280, 280, 9);
const curvedPlan = extractGeometryFromImageData(curvedRaster, {
  requestedBoundary: [{ x: 0, y: 0 }, { x: 14, y: 0 }, { x: 14, y: 14 }, { x: 0, y: 14 }],
  designSummary: 'Rooms Included:\n- 1 Living Room\n- 2 Bedrooms\n- 1 Kitchen\nFloors: Single-story',
  disableOcr: true,
});
assert.ok(nativeCurveWalls(curvedPlan).length >= 1,
  'A well-evidenced circular shell must serialize as editable native curve walls.');
nativeCurveWalls(curvedPlan).forEach(wall => {
  const ready = wall.wallSource === 'ellipse'
    ? Array.isArray(wall.ellipseCenter) && wall.ellipseCenter.length === 2
      && Number.isFinite(wall.ellipseRadiusX) && wall.ellipseRadiusX > 0
      && Number.isFinite(wall.ellipseRadiusY) && wall.ellipseRadiusY > 0
      && Number.isFinite(wall.ellipseStartAngle) && Number.isFinite(wall.ellipseEndAngle)
    : Array.isArray(wall.arcCenter) && wall.arcCenter.length === 2
      && Number.isFinite(wall.arcRadius) && wall.arcRadius > 0
      && Number.isFinite(wall.arcStartAngle) && Number.isFinite(wall.arcEndAngle)
      && Array.isArray(wall.controlPoint) && wall.controlPoint.length === 2;
  assert.ok(ready, 'Every consolidated curve must carry complete native analytic geometry.');
});
assert.ok(curvedPlan.boundary.length >= 10 && boundaryHasNonAxisEdge(curvedPlan),
  'A curved shell must retain a simplified non-rectangular property boundary.');
assert.ok(curvedPlan.rooms.length >= 3,
  'Curved exterior walls must seal the common flood-fill and preserve interior enclosures.');

const pureCurvedRaster = createWhiteRaster(560, 560);
drawPolyline(pureCurvedRaster, curvePoints, 15, true);
const pureCurvedPlan = extractGeometryFromImageData(pureCurvedRaster, {
  requestedBoundary: [{ x: 0, y: 0 }, { x: 14, y: 0 }, { x: 14, y: 14 }, { x: 0, y: 14 }],
  designSummary: 'Rooms Included:\n- 1 Living Room\nFloors: Single-story',
  disableOcr: true,
});
assert.ok(nativeCurveWalls(pureCurvedPlan).length >= 1 && pureCurvedPlan.rooms.length >= 1,
  'A fully curved shell must remain extractable as native curves even without orthogonal interior walls to bootstrap tracing.');

// Native arc metadata must follow the evidenced short wall route. A near-full
// circle from a tiny endpoint chord is a renderer-level topology defect and
// can create a second giant shell during canvas import.
const nativeArcSpan = wall => {
  let span = wall.arcCounterclockwise
    ? wall.arcStartAngle - wall.arcEndAngle
    : wall.arcEndAngle - wall.arcStartAngle;
  while (span < 0) span += Math.PI * 2;
  while (span >= Math.PI * 2) span -= Math.PI * 2;
  return span;
};
[curvedPlan, pureCurvedPlan].forEach(plan => nativeArcWalls(plan).forEach(wall => {
  assert.ok(nativeArcSpan(wall) <= Math.PI * 1.35,
    'A native curve fragment must never carry a pathological near-full-circle span.');
}));

// Disconnected wall chords around a curved shell are common at doors and
// windows. The family fallback must consolidate them without bridging the
// intentionally missing aperture intervals.
const fragmentedCurveSize = 520;
const fragmentedCurveMask = new Uint8Array(fragmentedCurveSize * fragmentedCurveSize);
const fragmentedCurveSegments = [];
const fragmentedCenter = [260, 260];
const fragmentedRadius = 185;
const drawFragmentedCurve = (start, end, thickness = 12) => {
  const p1 = {
    x: fragmentedCenter[0] + Math.cos(start) * fragmentedRadius,
    y: fragmentedCenter[1] + Math.sin(start) * fragmentedRadius,
  };
  const p2 = {
    x: fragmentedCenter[0] + Math.cos(end) * fragmentedRadius,
    y: fragmentedCenter[1] + Math.sin(end) * fragmentedRadius,
  };
  const steps = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) * 1.4));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const cx = p1.x + (p2.x - p1.x) * t, cy = p1.y + (p2.y - p1.y) * t;
    for (let y = Math.floor(cy - thickness / 2); y <= Math.ceil(cy + thickness / 2); y++) for (let x = Math.floor(cx - thickness / 2); x <= Math.ceil(cx + thickness / 2); x++) {
      if (x >= 0 && y >= 0 && x < fragmentedCurveSize && y < fragmentedCurveSize
        && Math.hypot(x - cx, y - cy) <= thickness / 2) fragmentedCurveMask[y * fragmentedCurveSize + x] = 1;
    }
  }
  fragmentedCurveSegments.push({ p1, p2, thickness, confidence: 0.84 });
};
for (let start = 0; start < Math.PI * 2; start += 0.24) {
  const end = Math.min(Math.PI * 2, start + 0.16);
  if ((start > 0.82 && start < 1.16) || (start > 3.42 && start < 3.86)) continue;
  drawFragmentedCurve(start, end);
}
const hostedGapBridge = {
  p1: { x: fragmentedCenter[0] + Math.cos(0.8) * fragmentedRadius, y: fragmentedCenter[1] + Math.sin(0.8) * fragmentedRadius },
  p2: { x: fragmentedCenter[0] + Math.cos(1.18) * fragmentedRadius, y: fragmentedCenter[1] + Math.sin(1.18) * fragmentedRadius },
  thickness: 12,
  confidence: 0.78,
  bridge: true,
};
fragmentedCurveSegments.push(hostedGapBridge);
const fragmentedCurves = consolidateText4hCurveArcs(fragmentedCurveSegments, {
  mode: 'curved', structuralMask: fragmentedCurveMask,
  width: fragmentedCurveSize, height: fragmentedCurveSize, typicalThickness: 12,
  hostedGaps: [{
    p1: hostedGapBridge.p1,
    p2: hostedGapBridge.p2,
    thickness: hostedGapBridge.thickness,
    confidence: hostedGapBridge.confidence,
  }],
});
assert.ok(fragmentedCurves.arcs.length >= 2,
  'Disconnected curved wall chords must still consolidate into editable native arcs.');
assert.ok(fragmentedCurves.arcs.every(arc => {
  let span = arc.counterclockwise ? arc.startAngle - arc.endAngle : arc.endAngle - arc.startAngle;
  while (span < 0) span += Math.PI * 2;
  while (span >= Math.PI * 2) span -= Math.PI * 2;
  return span < Math.PI * 1.35;
}), 'Curve-family consolidation must keep each aperture-bounded arc span local.');
assert.ok(fragmentedCurves.arcs.some(arc => arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined),
  'A raster-supported circular family should remain an editable ellipse/circle family instead of reverting to fragmented lines.');
assert.ok(!fragmentedCurves.retainedSegments.includes(hostedGapBridge),
  'A hosted opening bridge on a proven analytic curve must be absorbed by that curve instead of exported as a straight chord.');
const fragmentedEllipseFamily = fragmentedCurves.arcs.filter(arc => arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined);
if (fragmentedEllipseFamily.length > 1) {
  const familyCenter = fragmentedEllipseFamily[0].center;
  assert.ok(fragmentedEllipseFamily.every(arc => Math.hypot(arc.center.x - familyCenter.x, arc.center.y - familyCenter.y) < 1e-6),
    'All fragments from one ellipse family must share the fitted center.');
}

const hybridRaster = createWhiteRaster(560, 500);
const hybridShell = [[145, 65], [485, 65], [485, 430], [145, 430], [70, 320], [70, 175]];
drawPolyline(hybridRaster, hybridShell, 14, true);
drawThickLine(hybridRaster, 145, 65, 145, 430, 9);
drawThickLine(hybridRaster, 145, 250, 485, 250, 9);
const hybridPlan = extractGeometryFromImageData(hybridRaster, {
  requestedBoundary: [{ x: 0, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 12 }, { x: 0, y: 12 }],
  designSummary: 'Rooms Included:\n- 1 Living Room\n- 1 Dining Area\n- 2 Bedrooms\nFloors: Single-story',
  disableOcr: true,
});
assert.ok(nonAxisWalls(hybridPlan).length >= 2,
  'Hybrid tracing must add evidenced diagonal walls without replacing its orthogonal wall network.');
assert.equal(nativeArcWalls(hybridPlan).length, 0,
  'A hybrid plan with straight diagonal edges must retain those edges as chords, not false curves.');
assert.ok(hybridPlan.walls.some(wall => Math.abs(wall.p2[0] - wall.p1[0]) < 1e-6)
  && hybridPlan.walls.some(wall => Math.abs(wall.p2[1] - wall.p1[1]) < 1e-6),
  'Hybrid plans must preserve the established horizontal and vertical detector output.');
assert.ok(hybridPlan.rooms.length >= 3,
  'Hybrid walls must flow through the same room-recovery pipeline as orthogonal plans.');

// A large light-gray window may remove most of a canonical diagonal host from
// the thick structural mask. Hybrid-only recovery must use its two frame lines
// plus dark continuation at both jambs; intact diagonal walls remain intact.
const hybridAngularWindowRaster = createWhiteRaster(650, 560);
const hybridAngularWindowShell = [[210, 45], [585, 45], [585, 500], [210, 500], [50, 370], [50, 310]];
drawPolyline(hybridAngularWindowRaster, hybridAngularWindowShell, 14, true);
drawThickLine(hybridAngularWindowRaster, 210, 45, 210, 500, 9);
drawThickLine(hybridAngularWindowRaster, 210, 280, 585, 280, 9);
const faintAngularHostStart = hybridAngularWindowShell[5];
const faintAngularHostEnd = hybridAngularWindowShell[0];
const faintAngularGapStart = interpolatePoint(faintAngularHostStart, faintAngularHostEnd, 0.25);
const faintAngularGapEnd = interpolatePoint(faintAngularHostStart, faintAngularHostEnd, 0.76);
drawThickLine(hybridAngularWindowRaster, ...faintAngularGapStart, ...faintAngularGapEnd, 18, 255);
const faintAngularVector = [faintAngularGapEnd[0] - faintAngularGapStart[0], faintAngularGapEnd[1] - faintAngularGapStart[1]];
const faintAngularLength = Math.hypot(...faintAngularVector);
const faintAngularNormal = [-faintAngularVector[1] / faintAngularLength, faintAngularVector[0] / faintAngularLength];
for (const offset of [-4, 4]) drawThickLine(
  hybridAngularWindowRaster,
  faintAngularGapStart[0] + faintAngularNormal[0] * offset,
  faintAngularGapStart[1] + faintAngularNormal[1] * offset,
  faintAngularGapEnd[0] + faintAngularNormal[0] * offset,
  faintAngularGapEnd[1] + faintAngularNormal[1] * offset,
  2,
  190,
);
const hybridAngularWindowPlan = extractGeometryFromImageData(hybridAngularWindowRaster, {
  requestedBoundary: [{ x: 0, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 12 }, { x: 0, y: 12 }],
  designSummary: 'Rooms Included:\n- 1 Living Room\n- 1 Dining Area\n- 2 Bedrooms\nFloors: Single-story',
  disableOcr: true,
});
assert.ok(hybridAngularWindowPlan.windows.some(window => isNonAxisRotation(window.rotation)
  && (window.evidence?.confidence || 0) >= 0.8),
  'A large two-line framed window must restore its canonical angular host and remain a window.');
assert.ok(nonAxisWalls(hybridAngularWindowPlan).some(wall => {
  const bounds = wall.evidence?.pixelBounds;
  return bounds && bounds.x0 <= 60 && bounds.y0 <= 55 && bounds.x1 >= 200 && bounds.y1 >= 300;
}), 'The recovered angular window must retain one continuous editable host wall across its aperture.');

// Orthogonal apertures inside a hybrid plan must retain the established axis
// classifier. Faint double leaves and staggered sliding panels are symbol
// evidence; a wide bare exterior dropout is reconstructed as wall, not
// promoted to a large fallback window.
const hybridOpeningRaster = createWhiteRaster(560, 500);
drawPolyline(hybridOpeningRaster, hybridShell, 14, true);
drawThickLine(hybridOpeningRaster, 145, 65, 145, 430, 9);
drawThickLine(hybridOpeningRaster, 145, 250, 485, 250, 9);
// Faint double door on the horizontal interior host.
drawThickLine(hybridOpeningRaster, 270, 250, 325, 250, 16, 255);
drawThickLine(hybridOpeningRaster, 262, 250, 262, 285, 2, 190);
drawThickLine(hybridOpeningRaster, 333, 250, 333, 285, 2, 190);
drawRasterArc(hybridOpeningRaster, 262, 250, 35, Math.PI / 2, 0, 2);
drawRasterArc(hybridOpeningRaster, 333, 250, 35, Math.PI / 2, Math.PI, 2);
// Faint staggered sliding panels on the vertical interior host.
drawThickLine(hybridOpeningRaster, 145, 315, 145, 370, 16, 255);
drawThickLine(hybridOpeningRaster, 139, 316, 139, 347, 2, 190);
drawThickLine(hybridOpeningRaster, 151, 338, 151, 369, 2, 190);
// Missing raster ink on the exterior wall, without any opening symbol.
drawThickLine(hybridOpeningRaster, 485, 100, 485, 195, 18, 255);
const hybridOpeningPlan = extractGeometryFromImageData(hybridOpeningRaster, {
  requestedBoundary: [{ x: 0, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 12 }, { x: 0, y: 12 }],
  designSummary: 'Rooms Included:\n- 1 Living Room\n- 1 Dining Area\n- 2 Bedrooms\nFloors: Single-story',
  disableOcr: true,
});
assert.ok(hybridOpeningPlan.extractionDiagnostics.warnings.some(warning => /hybrid geometry detector/i.test(warning)),
  'The hybrid opening safeguard fixture must actually exercise hybrid mode.');
assert.ok(hybridOpeningPlan.doors.some(door => door.type === 'double'),
  'Two faint jamb leaves on an axis-aligned hybrid gap must remain a double door.');
assert.ok(hybridOpeningPlan.doors.some(door => door.type === 'sliding'),
  'Faint staggered panels on an axis-aligned hybrid gap must remain a sliding door.');
assert.ok(hybridOpeningPlan.doors.every(door => door.width <= (door.type === 'single' ? 1.2 : 1.55) + 1e-6),
  'Hybrid swing/symbol doors must keep architectural display widths even when raster gap spans are noisy.');
assert.ok(hybridOpeningPlan.doors.every(door => (door.measuredWidth || door.width) <= (door.type === 'single' ? 1.45 : 1.65) + 1e-6),
  'Ordinary hybrid/angular floorplans must not promote long endpoint-bridges into oversized measured doors.');
assert.equal(hybridOpeningPlan.railings.length, 0,
  'Ordinary hybrid floorplans without balcony evidence must not emit sparse-sheet angular railings.');
assert.ok(!hybridOpeningPlan.windows.some(window => window.width > 1.45 && (window.evidence?.confidence || 0) <= 0.5),
  'A wide bare hybrid exterior dropout must remain reconstructed wall instead of becoming a fallback window.');

// Sparse angular presentation sheets use the same native presets as ordinary
// plans, but their light rotated symbols are invisible to axis-only scans.
// Each supplement remains raster-evidence gated and is invoked only by the
// sparse-hybrid caller, leaving the orthogonal route unchanged.
const sparseMaskWidth = 360;
const sparseMaskHeight = 300;
const sparseStructural = new Uint8Array(sparseMaskWidth * sparseMaskHeight);
const sparseEvidence = new Uint8Array(sparseStructural.length);
const drawMaskLine = (mask, x1, y1, x2, y2, thickness = 1) => {
  const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 1.5));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const x = Math.round(x1 + (x2 - x1) * t);
    const y = Math.round(y1 + (y2 - y1) * t);
    for (let oy = -thickness; oy <= thickness; oy++) for (let ox = -thickness; ox <= thickness; ox++) {
      const px = x + ox, py = y + oy;
      if (px >= 0 && py >= 0 && px < sparseMaskWidth && py < sparseMaskHeight) mask[py * sparseMaskWidth + px] = 1;
    }
  }
};
// Eight regularly spaced, 12-degree treads.
for (let index = 0; index < 8; index++) {
  const y = 98 + index * 7;
  drawMaskLine(sparseEvidence, 145, y, 205, y + 13, 0);
}
assert.equal(detectText4hSparseAngularStairs(
  sparseEvidence, sparseStructural, sparseMaskWidth, sparseMaskHeight, 10,
).length, 1, 'A rotated regular tread group must become one native linear stair.');

const sparseRailing = new Uint8Array(sparseStructural.length);
drawMaskLine(sparseRailing, 25, 210, 120, 245, 0);
drawMaskLine(sparseRailing, 120, 245, 205, 205, 0);
drawMaskLine(sparseRailing, 205, 205, 25, 210, 0);
assert.equal(detectText4hSparseAngularRailings(
  sparseRailing, sparseMaskWidth, sparseMaskHeight, 10,
).length, 3, 'A connected three-edge thin angular boundary must remain three native railings.');

// A filled junction block is larger than its incident wall arms; a normal L
// junction is not. Only the former may become a native column.
for (let y = 40; y <= 60; y++) for (let x = 40; x <= 60; x++) sparseStructural[y * sparseMaskWidth + x] = 1;
drawMaskLine(sparseStructural, 50, 50, 120, 50, 4);
drawMaskLine(sparseStructural, 50, 50, 50, 120, 4);
const sparseColumnSegments = [
  { p1: { x: 50, y: 50 }, p2: { x: 120, y: 50 }, thickness: 9, confidence: 0.9 },
  { p1: { x: 50, y: 50 }, p2: { x: 50, y: 120 }, thickness: 9, confidence: 0.9 },
];
assert.equal(detectText4hSparseAngularColumns(
  sparseStructural, sparseMaskWidth, sparseMaskHeight, 9, sparseColumnSegments,
).length, 1, 'A raster-filled oversized angular junction must become one native column.');

const curvilinearColumnThresholds = {
  oversizedCoverage: 0.5, quadrantCoverage: 0.4, coreCoverage: 0.68, cornerCoverage: 0.5,
  edgeTransitionCoverage: 0.43,
};
const curvilinearColumnMask = new Uint8Array(sparseStructural.length);
for (let y = 42; y <= 58; y++) for (let x = 42; x <= 58; x++) curvilinearColumnMask[y * sparseMaskWidth + x] = 1;
drawMaskLine(curvilinearColumnMask, 50, 50, 120, 50, 4);
drawMaskLine(curvilinearColumnMask, 50, 50, 50, 120, 4);
assert.equal(detectText4hSparseAngularColumns(
  curvilinearColumnMask, sparseMaskWidth, sparseMaskHeight, 9, sparseColumnSegments, curvilinearColumnThresholds,
).length, 1, 'A curve/axis junction with a filled oversized corner block must remain a native column.');
const ordinaryCross = new Uint8Array(sparseStructural.length);
drawMaskLine(ordinaryCross, 50, 50, 120, 50, 4);
drawMaskLine(ordinaryCross, 50, 50, 50, 120, 4);
assert.equal(detectText4hSparseAngularColumns(
  ordinaryCross, sparseMaskWidth, sparseMaskHeight, 9, sparseColumnSegments, curvilinearColumnThresholds,
).length, 0, 'Two thick wall arms without filled square corners must not become a column.');
const heavyWallJunction = new Uint8Array(sparseStructural.length);
drawMaskLine(heavyWallJunction, 5, 50, 180, 50, 8);
drawMaskLine(heavyWallJunction, 50, 5, 50, 180, 8);
assert.equal(detectText4hSparseAngularColumns(
  heavyWallJunction, sparseMaskWidth, sparseMaskHeight, 9, sparseColumnSegments, curvilinearColumnThresholds,
).length, 0, 'A locally thick wall junction without four bounded square edges must not become a column.');

const openBifoldMask = new Uint8Array(sparseStructural.length);
drawMaskLine(openBifoldMask, 40, 100, 84, 144, 1);
drawMaskLine(openBifoldMask, 84, 144, 124, 100, 1);
const openBifoldEvidence = inspectText4hFreeformGap({
  p1: { x: 40, y: 100 }, p2: { x: 160, y: 100 }, thickness: 10, confidence: 0.85,
}, new Uint8Array(sparseStructural.length), openBifoldMask, sparseMaskWidth, sparseMaskHeight);
assert.ok((openBifoldEvidence.foldingSupport || 0) >= 0.52 && !openBifoldEvidence.windowFrame,
  'A fully open two-panel bi-fold on a curved aperture must remain folding evidence, not a window.');
assert.equal(openBifoldEvidence.foldingHingeAtEnd, false,
  'A partial-strength open bi-fold must preserve its folding hinge instead of borrowing a generic leaf hinge.');
assert.equal(typeof openBifoldEvidence.foldingFacingFlipped, 'boolean',
  'A retained bi-fold must expose its evidenced folding side independently from generic swing-leaf evidence.');

// A curvilinear shell may be assembled from several tangent/local circular
// arcs. A visually plausible global ellipse is not authoritative when strong
// connected raster runs prove different local centres/radii. This mirrors the
// offset lobes and long lower arc used by DS10-042 without making the fixture
// depend on that dataset file.
const compoundCurveMaskSize = 640;
const compoundCurveMask = new Uint8Array(compoundCurveMaskSize * compoundCurveMaskSize);
const compoundCurveSegments = [];
const compoundCurveFamilies = [];
const compoundScale = 42;
const compoundOffset = { x: 260, y: 270 };
const compoundPoint = (center, radius, angle) => ({
  x: compoundOffset.x + (center.x + Math.cos(angle) * radius) * compoundScale,
  y: compoundOffset.y - (center.y + Math.sin(angle) * radius) * compoundScale,
});
const drawCompoundLine = (x1, y1, x2, y2, thickness = 5) => {
  const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 1.5));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const x = Math.round(x1 + (x2 - x1) * t), y = Math.round(y1 + (y2 - y1) * t);
    for (let oy = -thickness; oy <= thickness; oy++) for (let ox = -thickness; ox <= thickness; ox++) {
      const px = x + ox, py = y + oy;
      if (px >= 0 && py >= 0 && px < compoundCurveMaskSize && py < compoundCurveMaskSize) {
        compoundCurveMask[py * compoundCurveMaskSize + px] = 1;
      }
    }
  }
};
const addCompoundArc = (center, radius, start, end, counterclockwise, parts = 5) => {
  let span = counterclockwise ? start - end : end - start;
  while (span < 0) span += Math.PI * 2;
  const family = [];
  let previous = compoundPoint(center, radius, start);
  for (let part = 1; part <= parts; part++) {
    const angle = counterclockwise
      ? start - span * part / parts
      : start + span * part / parts;
    const next = compoundPoint(center, radius, angle);
    drawCompoundLine(previous.x, previous.y, next.x, next.y);
    family.push(compoundCurveSegments.length);
    compoundCurveSegments.push({ p1: previous, p2: next, thickness: 11, confidence: 0.9 });
    previous = next;
  }
  compoundCurveFamilies.push(family);
};
addCompoundArc({ x: 1.868, y: -11.059 }, 8.998, 2.147, 1.167, true, 7);
addCompoundArc({ x: 3.92, y: -4.34 }, 2.15, 0.81, 5.00, true, 5);
addCompoundArc({ x: 0.40, y: -1.29 }, 6.57, 5.39, 4.52, true, 6);
addCompoundArc({ x: 0.40, y: -1.29 }, 6.57, 4.52, 3.75, true, 5);
addCompoundArc({ x: -3.73, y: -4.65 }, 1.33, 3.43, 1.02, true, 5);
const compoundCurves = consolidateText4hCurveArcs(compoundCurveSegments, {
  mode: 'curved', structuralMask: compoundCurveMask,
  width: compoundCurveMaskSize, height: compoundCurveMaskSize, typicalThickness: 11,
});
const compoundFamilyOf = index => compoundCurveFamilies.findIndex(family => family.includes(index));
assert.ok(compoundCurves.arcs.filter(arc => arc.ellipseRadiusX === undefined).length >= 3,
  'A shell with independently supported local radii must retain native local arcs instead of one global ellipse.');
assert.ok(!compoundCurves.arcs.some(arc => arc.ellipseRadiusX !== undefined
  && new Set(arc.sourceIndices.map(compoundFamilyOf).filter(index => index >= 0)).size > 1),
  'A fitted ellipse must not consume evidence from multiple contradictory local arc families.');
const compoundHybridCurves = consolidateText4hCurveArcs(compoundCurveSegments, {
  mode: 'hybrid', structuralMask: compoundCurveMask,
  width: compoundCurveMaskSize, height: compoundCurveMaskSize, typicalThickness: 11,
  curveEvidence: true,
  exteriorEvidence: () => false,
});
assert.equal(compoundHybridCurves.arcs.length, 0,
  'Hybrid curve families with no exterior evidence must not be promoted into native arcs merely because local raster support is high.');

// DS 12 / 84: one dominant circular facade may contain a second, genuinely
// architectural circular wall. Preserve that inner family only when it is
// broad, wall-sized, and independently joined to structural partitions.
const ds84Center = { x: 320, y: 320 };
const ds84InnerRadius = 90;
const ds84InnerMask = new Uint8Array(compoundCurveMaskSize * compoundCurveMaskSize);
const ds84InnerSegments = Array.from({ length: 16 }, (_, index) => {
  const start = index / 16 * Math.PI * 2;
  const end = (index + 1) / 16 * Math.PI * 2;
  const p1 = { x: ds84Center.x + Math.cos(start) * ds84InnerRadius, y: ds84Center.y + Math.sin(start) * ds84InnerRadius };
  const p2 = { x: ds84Center.x + Math.cos(end) * ds84InnerRadius, y: ds84Center.y + Math.sin(end) * ds84InnerRadius };
  drawMaskLine(ds84InnerMask, p1.x, p1.y, p2.x, p2.y, 6);
  return { p1, p2, thickness: 12, confidence: 0.9 };
});
const ds84RadialConnectors = [
  { p1: { x: 230, y: 320 }, p2: { x: 80, y: 320 }, thickness: 12, confidence: 0.9 },
  { p1: { x: 383.6, y: 383.6 }, p2: { x: 500, y: 500 }, thickness: 12, confidence: 0.9 },
];
const ds84InnerArc = {
  sourceIndices: ds84InnerSegments.map((_, index) => index),
  p1: ds84InnerSegments[0].p1,
  p2: ds84InnerSegments.at(-1).p2,
  controlPoint: { x: 320, y: 230 },
  center: ds84Center,
  radius: ds84InnerRadius,
  startAngle: 0,
  endAngle: Math.PI * 2 - 0.001,
  counterclockwise: false,
  confidence: 0.9,
  rasterSupport: 1,
  ellipseRadiusX: ds84InnerRadius,
  ellipseRadiusY: ds84InnerRadius,
  ellipseRotation: 0,
  ellipseStartAngle: 0,
  ellipseEndAngle: Math.PI * 2 - 0.001,
  ellipseCounterclockwise: false,
};
assert.equal(text4hInteriorArchitecturalCurveEvidenceForTest(
  ds84InnerArc,
  ds84InnerSegments,
  [...ds84InnerSegments, ...ds84RadialConnectors],
  [],
  compoundCurveMaskSize,
  compoundCurveMaskSize,
  12,
  true,
), true, 'DS 12 / 84 must preserve a broad inner circular wall joined to multiple structural partitions.');
assert.equal(text4hInteriorArchitecturalCurveEvidenceForTest(
  ds84InnerArc,
  ds84InnerSegments,
  ds84InnerSegments,
  [],
  compoundCurveMaskSize,
  compoundCurveMaskSize,
  12,
  true,
), false, 'A large isolated circular furniture or fixture outline must not become an interior wall.');
assert.equal(text4hInteriorArchitecturalCurveEvidenceForTest(
  ds84InnerArc,
  ds84InnerSegments,
  [...ds84InnerSegments, ...ds84RadialConnectors],
  [],
  compoundCurveMaskSize,
  compoundCurveMaskSize,
  12,
  false,
), false, 'The interior-circle recovery must remain inactive outside its proven hybrid-curvilinear gate.');
const ds84RecoveredRasterRing = recoverText4hConcentricInteriorRingForTest(
  ds84InnerMask,
  compoundCurveMaskSize,
  compoundCurveMaskSize,
  12,
  ds84Center,
  55,
  145,
  true,
);
assert.ok(ds84RecoveredRasterRing
  && Math.abs(ds84RecoveredRasterRing.radius - ds84InnerRadius) <= 10,
'DS 12 / 84 must recover the shell-centred inner wall from distributed raster evidence.');
assert.equal(recoverText4hConcentricInteriorRingForTest(
  ds84InnerMask,
  compoundCurveMaskSize,
  compoundCurveMaskSize,
  12,
  { x: ds84Center.x + 75, y: ds84Center.y },
  55,
  145,
  true,
), undefined, 'Offset circular fixtures must remain outside the concentric architectural-wall recovery.');
const ds84ConsolidatedInner = consolidateText4hCurveArcs(ds84InnerSegments, {
  mode: 'hybrid', structuralMask: ds84InnerMask,
  width: compoundCurveMaskSize, height: compoundCurveMaskSize, typicalThickness: 12,
  curveEvidence: true,
  exteriorEvidence: () => false,
  interiorArchitecturalEvidence: (arc, sources) => text4hInteriorArchitecturalCurveEvidenceForTest(
    arc, sources, [...ds84InnerSegments, ...ds84RadialConnectors], [],
    compoundCurveMaskSize, compoundCurveMaskSize, 12, true,
  ),
});
assert.ok(ds84ConsolidatedInner.arcs.some(arc => arc.ellipseRadiusX !== undefined),
  'A structurally joined DS 12 / 84 interior circle must survive hybrid curve-family consolidation.');

// The two false DS 12 / 84 ellipses projected far beyond the source chords;
// rejecting only that impossible projection returns the original walls to the
// shared freeform path and leaves valid curve families untouched.
const escapedEllipseSources = [
  { p1: { x: 180, y: 250 }, p2: { x: 230, y: 252 }, thickness: 12, confidence: 0.9 },
  { p1: { x: 230, y: 252 }, p2: { x: 280, y: 250 }, thickness: 12, confidence: 0.9 },
  { p1: { x: 280, y: 250 }, p2: { x: 330, y: 251 }, thickness: 12, confidence: 0.9 },
  { p1: { x: 330, y: 251 }, p2: { x: 380, y: 250 }, thickness: 12, confidence: 0.9 },
];
assert.equal(text4hCurveArcSourceEnvelopeCoherentForTest({
  ...ds84InnerArc,
  center: { x: 280, y: 250 },
  ellipseRadiusX: 260,
  ellipseRadiusY: 80,
  ellipseStartAngle: Math.PI,
  ellipseEndAngle: 0,
}, escapedEllipseSources, compoundCurveMaskSize, compoundCurveMaskSize, 12), false,
'A hybrid ellipse that escapes its own raster-source envelope must be rejected before it clips or hosts anything.');
assert.equal(text4hCurveArcSourceEnvelopeCoherentForTest({
  ...ds84InnerArc,
  center: { x: 280, y: 250 },
  ellipseRadiusX: 260,
  ellipseRadiusY: 80,
  ellipseStartAngle: Math.PI,
  ellipseEndAngle: 0,
  rasterRecovered: true,
}, escapedEllipseSources, compoundCurveMaskSize, compoundCurveMaskSize, 12), true,
'A raster-resampled interval from a proven ellipse family must survive the original split-source envelope audit.');
assert.equal(text4hCurveArcSourceEnvelopeCoherentForTest(
  ds84InnerArc,
  ds84InnerSegments,
  compoundCurveMaskSize,
  compoundCurveMaskSize,
  12,
), true, 'A coherent circular family must remain unaffected by the DS 12 / 84 false-ellipse safeguard.');
assert.equal(text4hShouldRetainHybridCurveModeForTest(
  'hybrid', 250, 40, 140, 12, compoundCurveMaskSize, compoundCurveMaskSize,
), true, 'DS 12 / 81-style distributed two-chord curve runs must keep hybrid native fitting active.');
assert.equal(text4hShouldRetainHybridCurveModeForTest(
  'hybrid', 250, 40, 90, 12, compoundCurveMaskSize, compoundCurveMaskSize,
), false, 'Sparse angular corner transitions must not opt an angular plan into native curve fitting.');
assert.equal(text4hOpenShellExteriorCurveFamilyEvidenceForTest(
  ds84InnerArc,
  ds84InnerSegments,
  ds84InnerSegments.length,
  compoundCurveMaskSize,
  compoundCurveMaskSize,
  12,
  true,
), true, 'A broadly evidenced curve family may survive an incomplete freeform footprint trace.');
assert.equal(text4hOpenShellExteriorCurveFamilyEvidenceForTest(
  ds84InnerArc,
  ds84InnerSegments,
  0,
  compoundCurveMaskSize,
  compoundCurveMaskSize,
  12,
  true,
  ds84Center,
  40,
), true, 'A broad central circular wall may survive when no dominant open-shell family was available.');
assert.equal(text4hOpenShellExteriorCurveFamilyEvidenceForTest(
  ds84InnerArc,
  ds84InnerSegments.slice(0, 2),
  2,
  compoundCurveMaskSize,
  compoundCurveMaskSize,
  12,
  true,
), false, 'Sparse swing or fixture arcs must remain below the open-shell family gate.');

// A dense curvilinear plan still contains many ordinary vertical/horizontal
// partitions. Slight skeleton drift along one straight partition must not fit
// a tall, narrow ellipse and steal that wall from the established axis route.
const driftingAxisMask = new Uint8Array(compoundCurveMaskSize * compoundCurveMaskSize);
const driftingAxisPoints = [
  { x: 312, y: 90 }, { x: 313, y: 145 }, { x: 311, y: 200 },
  { x: 313, y: 255 }, { x: 312, y: 310 }, { x: 314, y: 365 }, { x: 313, y: 420 },
];
const driftingAxisSegments = driftingAxisPoints.slice(1).map((point, index) => {
  const previous = driftingAxisPoints[index];
  drawMaskLine(driftingAxisMask, previous.x, previous.y, point.x, point.y, 5);
  return { p1: previous, p2: point, thickness: 11, confidence: 0.9 };
});
const driftingAxisCurves = consolidateText4hCurveArcs(driftingAxisSegments, {
  mode: 'hybrid', structuralMask: driftingAxisMask,
  width: compoundCurveMaskSize, height: compoundCurveMaskSize, typicalThickness: 11,
  curveEvidence: true,
});
assert.ok(!driftingAxisCurves.arcs.some(arc => arc.ellipseRadiusX !== undefined),
  'Near-collinear axis walls in a curved/hybrid plan must not become pathological narrow ellipses.');
assert.equal(driftingAxisCurves.retainedSegments.length, driftingAxisSegments.length,
  'Rejecting a false narrow ellipse must return every straight partition segment to the common wall pipeline.');

const tangentSliverMask = new Uint8Array(compoundCurveMaskSize * compoundCurveMaskSize);
const tangentSliverPoints = Array.from({ length: 8 }, (_, index) => {
  const angle = Math.PI - 0.14 + index * 0.04;
  return { x: 360 + Math.cos(angle) * 72, y: 300 + Math.sin(angle) * 210 };
});
const tangentSliverSegments = tangentSliverPoints.slice(1).map((point, index) => {
  const previous = tangentSliverPoints[index];
  drawMaskLine(tangentSliverMask, previous.x, previous.y, point.x, point.y, 5);
  return { p1: previous, p2: point, thickness: 11, confidence: 0.9 };
});
const tangentSliverCurves = consolidateText4hCurveArcs(tangentSliverSegments, {
  mode: 'hybrid', structuralMask: tangentSliverMask,
  width: compoundCurveMaskSize, height: compoundCurveMaskSize, typicalThickness: 11,
  curveEvidence: true,
});
assert.ok(!tangentSliverCurves.arcs.some(arc => arc.ellipseRadiusX !== undefined),
  'A near-axis tangent sliver must remain a local arc/line rather than inventing a complete ellipse family.');

const shallowArcMask = new Uint8Array(compoundCurveMaskSize * compoundCurveMaskSize);
const shallowCenter = { x: 280, y: 450 }, shallowRadius = 190;
const shallowPoints = [3.95, 4.13, 4.31].map(angle => ({
  x: shallowCenter.x + Math.cos(angle) * shallowRadius,
  y: shallowCenter.y + Math.sin(angle) * shallowRadius,
}));
for (let index = 1; index < shallowPoints.length; index++) {
  const first = shallowPoints[index - 1], second = shallowPoints[index];
  const steps = Math.max(1, Math.ceil(Math.hypot(second.x - first.x, second.y - first.y) * 1.5));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const x = Math.round(first.x + (second.x - first.x) * t);
    const y = Math.round(first.y + (second.y - first.y) * t);
    for (let oy = -5; oy <= 5; oy++) for (let ox = -5; ox <= 5; ox++) {
      const px = x + ox, py = y + oy;
      if (px >= 0 && py >= 0 && px < compoundCurveMaskSize && py < compoundCurveMaskSize) {
        shallowArcMask[py * compoundCurveMaskSize + px] = 1;
      }
    }
  }
}
const shallowArcSegments = [0, 1].map(index => ({
  p1: shallowPoints[index], p2: shallowPoints[index + 1], thickness: 11, confidence: 0.9,
}));
assert.ok(consolidateText4hCurveArcs(shallowArcSegments.concat([
  // Two distant curve chords keep the consolidator in its normal four-source
  // entry path without belonging to this connected local run.
  { p1: { x: 500, y: 100 }, p2: { x: 520, y: 112 }, thickness: 11, confidence: 0.82 },
  { p1: { x: 520, y: 112 }, p2: { x: 535, y: 130 }, thickness: 11, confidence: 0.82 },
]), {
  mode: 'curved', structuralMask: shallowArcMask,
  width: compoundCurveMaskSize, height: compoundCurveMaskSize, typicalThickness: 11,
}).arcs.some(arc => arc.sourceIndices.includes(0) && arc.sourceIndices.includes(1)),
  'A short two-chord raster arc must remain a local native arc instead of two floating straight walls.');

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
  geometryModes: {
    angular: { walls: angularPlan.walls.length, nonAxisWalls: nonAxisWalls(angularPlan).length, rooms: angularPlan.rooms.length },
    angularOpenings: { doors: angularOpeningPlan.doors.length, windows: angularOpeningPlan.windows.length, rooms: angularOpeningPlan.rooms.length },
    curved: { walls: curvedPlan.walls.length, nativeArcs: nativeArcWalls(curvedPlan).length, nonAxisWalls: nonAxisWalls(curvedPlan).length, rooms: curvedPlan.rooms.length },
    pureCurved: { walls: pureCurvedPlan.walls.length, nativeArcs: nativeArcWalls(pureCurvedPlan).length, nonAxisWalls: nonAxisWalls(pureCurvedPlan).length, rooms: pureCurvedPlan.rooms.length },
    hybrid: { walls: hybridPlan.walls.length, nonAxisWalls: nonAxisWalls(hybridPlan).length, rooms: hybridPlan.rooms.length },
  },
}, null, 2));
