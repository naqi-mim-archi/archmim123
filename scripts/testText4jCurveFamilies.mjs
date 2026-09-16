import assert from 'node:assert/strict';
import { build } from 'esbuild';

const load = async entryPoint => {
  const result = await build({
    entryPoints: [entryPoint], bundle: true, format: 'esm', platform: 'node',
    write: false, logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
};

const {
  recoverText4jConcentricInteriorRingForTest,
  text4jDominantEllipseGapHasRasterEvidenceForTest,
  text4jInteriorArchitecturalCurveEvidenceForTest,
  text4jOpenShellExteriorCurveFamilyEvidenceForTest,
  text4jShouldRetainHybridCurveModeForTest,
} = await load('services/localImageToJSON4j.ts');
const {
  consolidateText4jCurveArcs,
  text4jCurveArcSourceEnvelopeCoherentForTest,
} = await load('services/text4jCurveArcs.ts');

const size = 640;
const center = { x: 320, y: 320 };
const radius = 90;
const mask = new Uint8Array(size * size);
const drawLine = (p1, p2, thickness = 6) => {
  const steps = Math.max(1, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) * 1.5));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const x = Math.round(p1.x + (p2.x - p1.x) * t);
    const y = Math.round(p1.y + (p2.y - p1.y) * t);
    for (let oy = -thickness; oy <= thickness; oy++) for (let ox = -thickness; ox <= thickness; ox++) {
      const px = x + ox, py = y + oy;
      if (px >= 0 && py >= 0 && px < size && py < size) mask[py * size + px] = 1;
    }
  }
};
const ring = Array.from({ length: 16 }, (_, index) => {
  const start = index / 16 * Math.PI * 2;
  const end = (index + 1) / 16 * Math.PI * 2;
  const p1 = { x: center.x + Math.cos(start) * radius, y: center.y + Math.sin(start) * radius };
  const p2 = { x: center.x + Math.cos(end) * radius, y: center.y + Math.sin(end) * radius };
  drawLine(p1, p2);
  return { p1, p2, thickness: 12, confidence: 0.9 };
});
const connectors = [
  { p1: { x: 230, y: 320 }, p2: { x: 80, y: 320 }, thickness: 12, confidence: 0.9 },
  { p1: { x: 383.6, y: 383.6 }, p2: { x: 500, y: 500 }, thickness: 12, confidence: 0.9 },
];
const ringArc = {
  sourceIndices: ring.map((_, index) => index),
  p1: ring[0].p1, p2: ring.at(-1).p2,
  controlPoint: { x: 320, y: 230 }, center, radius,
  startAngle: 0, endAngle: Math.PI * 2 - 0.001, counterclockwise: false,
  confidence: 0.9, rasterSupport: 1,
  ellipseRadiusX: radius, ellipseRadiusY: radius, ellipseRotation: 0,
  ellipseStartAngle: 0, ellipseEndAngle: Math.PI * 2 - 0.001,
  ellipseCounterclockwise: false,
};

assert.equal(text4jInteriorArchitecturalCurveEvidenceForTest(
  ringArc, ring, [...ring, ...connectors], [], size, size, 12, true,
), true, 'An attached DS12-84-sized interior circle must be architectural.');
assert.equal(text4jInteriorArchitecturalCurveEvidenceForTest(
  ringArc, ring, ring, [], size, size, 12, true,
), false, 'An isolated circular object must not become a wall.');
assert.equal(text4jInteriorArchitecturalCurveEvidenceForTest(
  ringArc, ring, [...ring, ...connectors], [], size, size, 12, false,
), false, 'The recovery must be inactive outside hybrid-curvilinear mode.');
const recoveredRasterRing = recoverText4jConcentricInteriorRingForTest(
  mask, size, size, 12, center, 55, 145, true,
);
assert.ok(recoveredRasterRing && Math.abs(recoveredRasterRing.radius - radius) <= 10,
  'A concentric raster ring interrupted into wall chords must be recovered at its observed radius.');
assert.equal(recoverText4jConcentricInteriorRingForTest(
  mask, size, size, 12, center, 55, 145, false,
), undefined, 'Concentric raster recovery must stay disabled outside the hybrid-curve gate.');
assert.equal(recoverText4jConcentricInteriorRingForTest(
  mask, size, size, 12, { x: center.x + 75, y: center.y }, 55, 145, true,
), undefined, 'An offset circular object must not be borrowed into the shell-centred recovery.');

const retainedRing = consolidateText4jCurveArcs(ring, {
  mode: 'hybrid', structuralMask: mask, width: size, height: size,
  typicalThickness: 12, curveEvidence: true, exteriorEvidence: () => false,
  interiorArchitecturalEvidence: (arc, sources) => text4jInteriorArchitecturalCurveEvidenceForTest(
    arc, sources, [...ring, ...connectors], [], size, size, 12, true,
  ),
});
assert.ok(retainedRing.arcs.some(arc => arc.ellipseRadiusX !== undefined),
  'The attached inner ring must survive hybrid consolidation.');

const escapedSources = [180, 230, 280, 330].map(x => ({
  p1: { x, y: 250 }, p2: { x: x + 50, y: 251 }, thickness: 12, confidence: 0.9,
}));
assert.equal(text4jCurveArcSourceEnvelopeCoherentForTest({
  ...ringArc, center: { x: 280, y: 250 }, ellipseRadiusX: 260,
  ellipseRadiusY: 80, ellipseStartAngle: Math.PI, ellipseEndAngle: 0,
}, escapedSources, size, size, 12), false,
'A projected ellipse that escapes its raster family must be rejected.');
assert.equal(text4jCurveArcSourceEnvelopeCoherentForTest({
  ...ringArc, center: { x: 280, y: 250 }, ellipseRadiusX: 260,
  ellipseRadiusY: 80, ellipseStartAngle: Math.PI, ellipseEndAngle: 0,
  rasterRecovered: true,
}, escapedSources, size, size, 12), true,
'An interval independently resampled from a proven ellipse must not be rejected against the original split-source bounds.');
assert.equal(text4jCurveArcSourceEnvelopeCoherentForTest(ringArc, ring, size, size, 12), true,
  'A coherent existing curve must remain accepted.');
assert.equal(text4jCurveArcSourceEnvelopeCoherentForTest({
  ...ringArc,
  ellipseRadiusX: undefined,
  ellipseRadiusY: undefined,
}, escapedSources.slice(0, 2), size, size, 12), true,
'A locally fitted circular arc must remain governed by its existing radial and raster audits.');
assert.equal(text4jShouldRetainHybridCurveModeForTest(
  'hybrid', 250, 40, 140, 12, size, size,
), true, 'Distributed two-chord curve runs must keep a proven hybrid plan on native curve fitting.');
assert.equal(text4jShouldRetainHybridCurveModeForTest(
  'hybrid', 250, 40, 90, 12, size, size,
), false, 'Sparse corner transitions in an angular plan must not enable native curve fitting.');
assert.equal(text4jShouldRetainHybridCurveModeForTest(
  'orthogonal', 250, 250, 250, 12, size, size,
), false, 'Orthogonal plans must remain outside the hybrid curve mode regardless of raw chord counts.');
assert.equal(text4jOpenShellExteriorCurveFamilyEvidenceForTest(
  ringArc, ring, ring.length, size, size, 12, true,
), true, 'A long raster-supported curve family may survive an incomplete footprint trace.');
assert.equal(text4jOpenShellExteriorCurveFamilyEvidenceForTest(
  ringArc, ring, 0, size, size, 12, true,
), false, 'An interior curve cannot borrow the open-shell exterior fallback.');
assert.equal(text4jOpenShellExteriorCurveFamilyEvidenceForTest(
  ringArc, ring, 0, size, size, 12, true, center, 40,
), true, 'A broad central circular wall may survive when an open shell has no dominant exterior family.');
assert.equal(text4jOpenShellExteriorCurveFamilyEvidenceForTest(
  ringArc, ring.slice(0, 2), 2, size, size, 12, true,
), false, 'A sparse door or fixture arc cannot become an open-shell exterior wall.');
assert.equal(text4jDominantEllipseGapHasRasterEvidenceForTest(0.5, 0), true,
  'Observed structural ink must continue a proven dominant ellipse.');
assert.equal(text4jDominantEllipseGapHasRasterEvidenceForTest(0.24, 0.6), true,
  'Mixed wall and symbol ink must continue a proven dominant ellipse.');
assert.equal(text4jDominantEllipseGapHasRasterEvidenceForTest(0, 0.8), true,
  'A strong curved window or door band may bridge its intentionally blank wall interval.');
assert.equal(text4jDominantEllipseGapHasRasterEvidenceForTest(0, 0.79), false,
  'Weak isolated symbol ink must not manufacture an exterior curve interval.');

console.log(JSON.stringify({
  attachedInteriorCurve: true,
  concentricRasterRing: true,
  isolatedCircleRejected: true,
  escapedEllipseRejected: true,
}));
