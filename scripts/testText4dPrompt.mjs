import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';

const buildModule = async entryPoint => {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  });
  const url = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`;
  return import(url);
};

const briefModule = await buildModule('services/text4dBrief.ts');
const promptModule = await buildModule('services/text4dPromptBuilder.ts');
const chatVariationModule = await buildModule('services/text4dConversationVariation.ts');
const fallbackModule = await buildModule('services/text4dFallbackGeometry.ts');
const imageConfigModule = await buildModule('services/text4dImageConfig.ts');
const imageAspectGuardModule = await buildModule('services/text4dGeneratedImageAspectGuard.ts');
const roomLabelModule = await buildModule('services/text4dGeneratedImageRoomLabels.ts');
const directUploadModule = await buildModule('services/text4dDirectUpload.ts');
const importHandoffModule = await buildModule('services/text4dImportHandoff.ts');
const text4dFeatureSource = await readFile('components/generative-wizard/features/text4d/index.ts', 'utf8');
const {
  applyText4dRectangularBoundaryPolicy,
  getText4dRectangularBoundaryEligibility,
  legacySummaryToText4dBrief,
  setText4dRectangularBoundaryLock,
  text4dHasExplicitRectangularRequest,
  text4dBriefBoundaryMeters,
  text4dBriefToDesignSummary,
  updateText4dBriefFromSummary,
  validateText4dBrief,
} = briefModule;
const { buildText4dImagePrompt } = promptModule;
const { getText4dConversationProfile } = chatVariationModule;
const { buildText4dFallbackGeometry } = fallbackModule;
const {
  TEXT4D_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION,
  TEXT4D_LOW_LATENCY_GENERATION_CONFIG,
} = imageConfigModule;
const {
  detectText4dLockedStructuralFrame,
  getText4dLockedImageAspectTarget,
  planText4dLockedAspectCorrection,
} = imageAspectGuardModule;
const {
  buildText4dRoomCrossDimensionLabels,
  formatText4dRoomCrossDimensions,
} = roomLabelModule;
const {
  prepareText4dDirectUpload,
  validateText4dDirectUploadScale,
} = directUploadModule;
const {
  finalizeText4dImportHandoff,
  isText4dAuthoritativePreview,
  markText4dAuthoritativePreview,
} = importHandoffModule;

const previewHandoffFixture = [
  {
    id: 'wall-preview',
    type: 'wall',
    pos: { x: 0, y: 0 },
    p1: { x: 0, y: 0 },
    p2: { x: 4, y: 0 },
    thickness: 0.2,
  },
  {
    id: 'door-preview',
    type: 'door',
    pos: { x: 2.2, y: 0.05 },
    rotation: 4,
    width: 0.9,
    hostWallId: 'wall-preview',
    hostT: 0.5,
  },
];
const authoritativePreview = markText4dAuthoritativePreview(previewHandoffFixture);
assert.equal(isText4dAuthoritativePreview(authoritativePreview), true);
let handoffNormalizerCalls = 0;
const handedOffPreview = finalizeText4dImportHandoff(authoritativePreview, element => {
  handoffNormalizerCalls += 1;
  return { ...element, pos: { x: 999, y: 999 } };
});
assert.equal(handoffNormalizerCalls, 0);
assert.strictEqual(handedOffPreview, authoritativePreview);
assert.deepEqual(handedOffPreview[1].pos, previewHandoffFixture[1].pos);
assert.equal(handedOffPreview[1].rotation, previewHandoffFixture[1].rotation);

const legacyPreview = finalizeText4dImportHandoff(previewHandoffFixture, element => ({
  ...element,
  pos: { x: 999, y: 999 },
}));
assert.deepEqual(legacyPreview[1].pos, { x: 999, y: 999 });

const chatProfiles = [0, 1, 2].map(getText4dConversationProfile);
assert.equal(new Set(chatProfiles.map(profile => `${profile.envelope}|${profile.planning}`)).size, 3);
assert.ok(chatProfiles.every(profile => /short side about \d+% of long side/.test(profile.envelope)));
assert.ok(chatProfiles.every(profile => /prioritize/.test(profile.planning)));

const imperialSummary = `Parameters:

Purpose: Apartment

Total Area: 600 sq ft (20' x 30')

Rooms Included:
- 1 Living Room
- 1 Open Kitchen
- 1 Master Bedroom (attached ensuite)
- 1 Common Bathroom
- 1 Balcony

Room Adjacency:
- Open kitchen shares an edge with living room
- Balcony accessible from living room

Layout Type: Open Concept

Floors: Single-story`;

const imperialBrief = legacySummaryToText4dBrief(imperialSummary);
assert.equal(imperialBrief.dimensions.area.value, 600);
assert.equal(imperialBrief.dimensions.area.unit, 'sq_ft');
assert.equal(imperialBrief.dimensions.envelope.width, 20);
assert.equal(imperialBrief.dimensions.envelope.depth, 30);
assert.equal(imperialBrief.dimensions.envelope.unit, 'ft');
assert.equal(imperialBrief.rooms.length, 5);
assert.equal(validateText4dBrief(imperialBrief).valid, true);
assert.equal(getText4dRectangularBoundaryEligibility(imperialBrief).coverageRatio, 1);
assert.equal(getText4dRectangularBoundaryEligibility(imperialBrief).eligible, true);
assert.deepEqual(imperialBrief.dimensions.rectangularBoundary, { locked: true, source: 'automatic_area_match' });

const imperialPrompt = buildText4dImagePrompt(imperialBrief);
const orderedHeadings = [
  'RENDER RESOLVED FLOOR PLAN',
  'SQUARE 1:1 LOCK:',
  'SPEC:',
  'ROOMS EXACT:',
  'ADJACENCY:',
  'PLAN:',
  'ROOM LABELS MANDATORY:',
  'STYLE text4d-digitizable-floorplan-v1:',
  'DIMENSIONS:',
];
let previousIndex = -1;
for (const heading of orderedHeadings) {
  const index = imperialPrompt.indexOf(heading);
  assert.ok(index > previousIndex, `${heading} must appear in the required prompt order.`);
  previousIndex = index;
}
assert.match(imperialPrompt, /STYLE text4d-digitizable-floorplan-v1/);
assert.match(imperialPrompt, /orthographic, white, crisp pure-black/);
assert.match(imperialPrompt, /pure-black/);
assert.match(imperialPrompt, /9-inch/);
assert.match(imperialPrompt, /20'-0"/);
assert.match(imperialPrompt, /30'-0"/);
assert.match(imperialPrompt, /SQUARE 1:1 LOCK/i);
assert.match(imperialPrompt, /fixed-property bbox 492x737px at x=266-758, y=144-881/i);
assert.match(imperialPrompt, /target width:depth 20:30=0\.6667:1; 2% tolerance/i);
assert.match(imperialPrompt, /Include walls, balconies\/terraces\/porches\/decks\/steps\/railings/i);
assert.match(imperialPrompt, /Dimension strings span this bbox/i);
assert.match(imperialPrompt, /Exclude annotations and all door leaves\/swings, inward\/outward/i);
assert.match(imperialPrompt, /BOUNDARY SHAPE: RECTANGLE LOCKED/i);
assert.match(imperialPrompt, /full exterior-wall rectangle, no L\/U\/notches\/courtyard/i);
assert.match(imperialPrompt, /one full Design Brief name per space/i);
assert.match(imperialPrompt, /no abbreviations, room dimensions\/areas, backgrounds, legends, duplicates/i);
assert.match(imperialPrompt, /0\.33x normal label height/i);
assert.match(imperialPrompt, /clear white floor area only/i);
assert.match(imperialPrompt, /never touch, cross, cover, or replace architecture/i);
assert.match(imperialPrompt, /Living Room/i);
assert.match(imperialPrompt, /Open Kitchen/i);
assert.match(imperialPrompt, /Master Bedroom \(attached ensuite\)/i);
assert.match(imperialPrompt, /Common Bathroom/i);
assert.match(imperialPrompt, /Balcony/i);
assert.doesNotMatch(imperialPrompt, /\[(?:LIV|KIT|MBR|CBATH|BALC)\]/i);
assert.doesNotMatch(imperialPrompt, /13'-6" x 12'-0"/i);
assert.doesNotMatch(imperialPrompt, /coordinates are in METERS/i);
assert.match(imperialPrompt, /hinged or sliding glazed access door/i);
assert.match(imperialPrompt, /never a window/i);
assert.match(imperialPrompt, /single story: no stair/i);
const imperialPromptWords = imperialPrompt.split(/\s+/).length;
assert.ok(imperialPromptWords <= 275, `Resolved render prompt must stay within the low-latency budget; received ${imperialPromptWords} words.`);

const narrowDeepBrief = {
  ...imperialBrief,
  dimensions: {
    ...imperialBrief.dimensions,
    area: { ...imperialBrief.dimensions.area, value: 800 },
    envelope: { ...imperialBrief.dimensions.envelope, width: 20, depth: 40 },
  },
};
const narrowDeepPrompt = buildText4dImagePrompt(narrowDeepBrief);
assert.match(narrowDeepPrompt, /fixed-property bbox 369x737px at x=328-697, y=144-881/i);

const requestedCaseBrief = {
  ...imperialBrief,
  dimensions: {
    ...imperialBrief.dimensions,
    area: { ...imperialBrief.dimensions.area, value: 1000 },
    envelope: { ...imperialBrief.dimensions.envelope, width: 25, depth: 40 },
  },
};
const requestedCasePrompt = buildText4dImagePrompt(requestedCaseBrief);
assert.match(requestedCasePrompt, /fixed-property bbox 461x737px at x=282-743, y=144-881/i);
assert.match(requestedCasePrompt, /target width:depth 25:40=0\.625:1; 2% tolerance/i);
assert.match(requestedCasePrompt, /BOUNDARY SHAPE: RECTANGLE LOCKED; 1000 sq ft approximately fills the dimensional rectangle/i);

const creativeSummary = imperialSummary.replace("600 sq ft (20' x 30')", "900 sq ft (25' x 40')");
const creativeBrief = legacySummaryToText4dBrief(creativeSummary);
const creativeEligibility = getText4dRectangularBoundaryEligibility(creativeBrief);
assert.ok(Math.abs(creativeEligibility.coverageRatio - 0.9) < 1e-9);
assert.equal(creativeEligibility.eligible, false);
assert.deepEqual(creativeBrief.dimensions.rectangularBoundary, { locked: false, source: 'ineligible' });
assert.deepEqual(
  setText4dRectangularBoundaryLock(creativeBrief, true).dimensions.rectangularBoundary,
  { locked: false, source: 'ineligible' },
  'An incompatible area must not be manually rectangle-locked.',
);
const creativePrompt = buildText4dImagePrompt(creativeBrief);
assert.match(creativePrompt, /BOUNDARY SHAPE: CREATIVE UNLOCKED/i);
assert.match(creativePrompt, /enclosed area 900 sq ft=90% of bbox/i);
assert.match(creativePrompt, /intelligent compact, L\/U, stepped, or offset form/i);
assert.doesNotMatch(creativePrompt, /RECTANGLE LOCKED/i);

const thresholdBrief = legacySummaryToText4dBrief(imperialSummary.replace("600 sq ft (20' x 30')", "950 sq ft (25' x 40')"));
assert.equal(getText4dRectangularBoundaryEligibility(thresholdBrief).eligible, true, '95% coverage must be rectangle-eligible.');
assert.equal(thresholdBrief.dimensions.rectangularBoundary.locked, true);
const belowThresholdBrief = legacySummaryToText4dBrief(imperialSummary.replace("600 sq ft (20' x 30')", "949 sq ft (25' x 40')"));
assert.equal(getText4dRectangularBoundaryEligibility(belowThresholdBrief).eligible, false);

const manualUnlock = setText4dRectangularBoundaryLock(requestedCaseBrief, false);
assert.deepEqual(manualUnlock.dimensions.rectangularBoundary, { locked: false, source: 'user_confirmed' });
const explicitLock = applyText4dRectangularBoundaryPolicy(manualUnlock, 'Use a rectangular boundary.');
assert.deepEqual(explicitLock.dimensions.rectangularBoundary, { locked: true, source: 'explicit_user_request' });
assert.equal(text4dHasExplicitRectangularRequest('Please make it rectangular.'), true);
assert.equal(text4dHasExplicitRectangularRequest('Use a non-rectangular creative plan.'), false);

const landscapePrompt = buildText4dImagePrompt({
  ...requestedCaseBrief,
  dimensions: {
    ...requestedCaseBrief.dimensions,
    envelope: { ...requestedCaseBrief.dimensions.envelope, width: 40, depth: 25 },
  },
});
assert.match(landscapePrompt, /fixed-property bbox 737x461px at x=144-881, y=282-743/i);

const multiFloorPrompt = buildText4dImagePrompt({
  ...requestedCaseBrief,
  project: { ...requestedCaseBrief.project, floors: 2 },
});
assert.match(multiFloorPrompt, /fixed-property footprint spans 45% panel width x 72% panel height in each equal nonoverlapping floor panel/i);
assert.match(multiFloorPrompt, /BOUNDARY SHAPE: CREATIVE UNLOCKED/i);

const reportedExamples = [
  { width: 33, depth: 30, pixels: '737x670px', ratio: '33:30=1.1:1' },
  { width: 36.5, depth: 26.5, pixels: '737x535px', ratio: '36.5:26.5=1.3774:1' },
  { width: 25, depth: 40, pixels: '461x737px', ratio: '25:40=0.625:1' },
];
for (const example of reportedExamples) {
  const prompt = buildText4dImagePrompt({
    ...requestedCaseBrief,
    dimensions: {
      ...requestedCaseBrief.dimensions,
      envelope: { ...requestedCaseBrief.dimensions.envelope, width: example.width, depth: example.depth },
    },
  });
  assert.ok(prompt.includes(example.pixels), `${example.width}x${example.depth} must have a deterministic pixel frame.`);
  assert.ok(prompt.includes(example.ratio), `${example.width}x${example.depth} must state its exact ratio.`);
}

assert.deepEqual(TEXT4D_LOW_LATENCY_GENERATION_CONFIG.responseModalities, ['IMAGE']);
assert.equal(TEXT4D_LOW_LATENCY_GENERATION_CONFIG.thinkingConfig.thinkingLevel, 'minimal');
assert.equal(TEXT4D_LOW_LATENCY_GENERATION_CONFIG.thinkingConfig.includeThoughts, false);
assert.equal(TEXT4D_LOW_LATENCY_GENERATION_CONFIG.imageConfig.imageSize, '1K');
assert.equal(TEXT4D_LOW_LATENCY_GENERATION_CONFIG.imageConfig.aspectRatio, '1:1');
assert.equal(TEXT4D_LOW_LATENCY_GENERATION_CONFIG.candidateCount, 1);
assert.match(TEXT4D_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /hard rendering constraint/i);
assert.match(TEXT4D_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /within 2%/i);
assert.match(TEXT4D_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /Count balconies, terraces, porches, decks, steps, and railings/i);
assert.match(TEXT4D_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /Exclude annotations and every door leaf or swing arc/i);
assert.match(TEXT4D_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /RECTANGLE LOCKED/i);
assert.match(TEXT4D_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /CREATIVE UNLOCKED/i);
assert.match(TEXT4D_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /never force a rectangle by default/i);
assert.match(TEXT4D_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /Never render prompt instructions, pixel coordinates/i);
assert.match(TEXT4D_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /reserving clear white label zones/i);
assert.match(TEXT4D_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /one full Design Brief room name/i);
assert.match(TEXT4D_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /0\.33 times normal room-label height/i);
assert.match(TEXT4D_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /never abbreviate and never render room dimensions, room areas, label backgrounds, legends, or duplicate labels/i);
assert.match(TEXT4D_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /complete glyph box fits inside clear white floor space/i);
assert.match(TEXT4D_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /No label glyph may touch, cross, obscure, or replace any wall, door leaf, swing arc, window, wall opening, column, stair, railing, fixture, or other architectural mark/i);
assert.match(text4dFeatureSource, /annotateGeneratedPreview:\s*false/, 'The normal D-generated preview must not re-add room dimensions after OCR.');

assert.equal(formatText4dRoomCrossDimensions(3.77, 2.77, 'ft'), `12'-4\" x 9'-1\"`);
assert.equal(formatText4dRoomCrossDimensions(3.77, 2.77, 'm'), '3.77 m x 2.77 m');
const deterministicRoomLabels = buildText4dRoomCrossDimensionLabels({
  walls: [
    { p1: [0, 0], p2: [4, 0], type: 'exterior' },
    { p1: [4, 0], p2: [4, 3], type: 'exterior' },
    { p1: [4, 3], p2: [0, 3], type: 'exterior' },
    { p1: [0, 3], p2: [0, 0], type: 'exterior' },
  ],
  rooms: [{
    label: 'Master Bedroom',
    pos: [2, 1.5],
    evidence: { source: 'ocr', confidence: 0.9 },
  }],
}, 'ft');
assert.equal(deterministicRoomLabels.length, 1);
assert.equal(deterministicRoomLabels[0].label, 'MASTER BEDROOM');
assert.ok(Math.abs(deterministicRoomLabels[0].widthMeters - 3.77) < 1e-9);
assert.ok(Math.abs(deterministicRoomLabels[0].depthMeters - 2.77) < 1e-9);
assert.equal(deterministicRoomLabels[0].dimensionText, `12'-4\" x 9'-1\"`);
assert.equal(buildText4dRoomCrossDimensionLabels({
  walls: [
    { p1: [0, 0], p2: [4, 0], type: 'exterior' },
    { p1: [4, 0], p2: [4, 3], type: 'exterior' },
    { p1: [4, 3], p2: [0, 3], type: 'exterior' },
    { p1: [0, 3], p2: [0, 0], type: 'exterior' },
  ],
  rooms: [{
    label: 'Master Bedroom',
    pos: [2, 1.5],
    sourceWidth: 3.8,
    sourceDepth: 2.4,
    evidence: { source: 'ocr', confidence: 0.9 },
  }],
}, 'm').length, 0, 'A Gemini room block with OCR-confirmed dimensions must never receive a duplicate overlay.');
assert.equal(buildText4dRoomCrossDimensionLabels({
  walls: [
    { p1: [0, 0], p2: [4, 0], type: 'exterior' },
    { p1: [4, 0], p2: [4, 3], type: 'exterior' },
    { p1: [4, 3], p2: [0, 3], type: 'exterior' },
    { p1: [0, 3], p2: [0, 0], type: 'exterior' },
  ],
  rooms: [{
    label: 'Master Bedroom',
    pos: [2, 1.5],
    evidence: { source: 'design-brief', confidence: 0.4 },
  }],
}, 'm').length, 0, 'A brief-derived room must not receive an uncertain presentation overlay.');

const syntheticWidth = 1024;
const syntheticHeight = 1024;
const syntheticPixels = new Uint8ClampedArray(syntheticWidth * syntheticHeight * 4).fill(255);
const paintBlack = (x, y) => {
  if (x < 0 || y < 0 || x >= syntheticWidth || y >= syntheticHeight) return;
  const offset = (y * syntheticWidth + x) * 4;
  syntheticPixels[offset] = 0;
  syntheticPixels[offset + 1] = 0;
  syntheticPixels[offset + 2] = 0;
  syntheticPixels[offset + 3] = 255;
};
const paintHorizontal = (y, x0, x1, thickness) => {
  for (let row = Math.round(y - thickness / 2); row < Math.round(y + thickness / 2); row++) {
    for (let x = x0; x <= x1; x++) paintBlack(x, row);
  }
};
const paintVertical = (x, y0, y1, thickness) => {
  for (let column = Math.round(x - thickness / 2); column < Math.round(x + thickness / 2); column++) {
    for (let y = y0; y <= y1; y++) paintBlack(column, y);
  }
};
paintHorizontal(130, 205, 817, 12);
paintHorizontal(882, 205, 817, 12);
paintVertical(205, 130, 882, 12);
paintVertical(817, 130, 882, 12);
paintHorizontal(500, 205, 817, 10);
paintVertical(500, 130, 500, 10);
// Thin dimension strings must never become structural bounds.
paintHorizontal(88, 205, 817, 1);
paintVertical(160, 130, 882, 1);
// A thick annotation-like stroke below the plan must not replace the connected exterior frame.
paintHorizontal(950, 205, 500, 4);

const detectedLockedFrame = detectText4dLockedStructuralFrame({
  width: syntheticWidth,
  height: syntheticHeight,
  data: syntheticPixels,
});
assert.ok(detectedLockedFrame, 'The D image guard must detect a thick rectangular exterior frame.');
assert.ok(Math.abs(detectedLockedFrame.ratio - 612 / 752) < 0.01);
const lockedTarget = getText4dLockedImageAspectTarget(requestedCaseBrief);
assert.equal(lockedTarget, 0.625);
const lockedCorrection = planText4dLockedAspectCorrection(detectedLockedFrame, lockedTarget);
assert.equal(lockedCorrection.applied, true);
assert.equal(lockedCorrection.reason, 'axis-correction');
assert.ok(Math.abs(lockedCorrection.correctedRatio - 0.625) < 1e-9);
assert.ok(lockedCorrection.scaleX < 1 && lockedCorrection.scaleY === 1);
assert.equal(getText4dLockedImageAspectTarget(creativeBrief), undefined, 'Creative-unlocked plans must bypass deterministic axis correction.');
assert.equal(planText4dLockedAspectCorrection({ ratio: 0.63 }, 0.625).applied, false);
assert.equal(getText4dLockedImageAspectTarget({
  ...requestedCaseBrief,
  project: { ...requestedCaseBrief.project, floors: 2 },
}), undefined, 'The single-frame correction must not distort multi-panel floorplan images.');

const metricSummary = imperialSummary
  .replace("600 sq ft (20' x 30')", '55.74 sqm (6.1m x 9.14m)')
  .replace('Single-story', '2-story');
const metricBrief = legacySummaryToText4dBrief(metricSummary);
const metricPrompt = buildText4dImagePrompt(metricBrief);
assert.equal(metricBrief.dimensions.area.unit, 'sq_m');
assert.equal(metricBrief.dimensions.envelope.unit, 'm');
assert.match(metricPrompt, /230 mm/);
assert.match(metricPrompt, /6.1 m/);
assert.match(metricPrompt, /one stair in common circulation/i);
assert.doesNotMatch(metricPrompt, /9-inch/);
assert.doesNotMatch(metricPrompt, /20'-0"/);

const editedSummary = text4dBriefToDesignSummary(imperialBrief).replace("20'-0\" x 30'-0\"", "24'-0\" x 25'-0\"");
const editedBrief = updateText4dBriefFromSummary(editedSummary, imperialBrief, 'dimensions');
assert.equal(editedBrief.dimensions.envelope.width, 24);
assert.equal(editedBrief.dimensions.envelope.depth, 25);
assert.equal(editedBrief.dimensions.envelope.source, 'user_confirmed');
assert.match(buildText4dImagePrompt(editedBrief), /width 24'-0" above; depth 25'-0" left/);

const boundary = text4dBriefBoundaryMeters(imperialBrief);
assert.ok(boundary);
assert.ok(Math.abs(boundary[1].x - 6.096) < 0.000001);
assert.ok(Math.abs(boundary[2].y - 9.144) < 0.000001);

const blankDirectUpload = validateText4dDirectUploadScale({ unitSystem: 'imperial', width: '', depth: '', area: '' });
assert.equal(blankDirectUpload.valid, false, 'A direct upload must provide at least one dimension.');
const partialDirectUpload = prepareText4dDirectUpload(imperialBrief, { unitSystem: 'imperial', width: '25', depth: '', area: '' });
assert.equal(partialDirectUpload.validation.valid, true, 'A single horizontal extent must establish upload scale.');
assert.equal(partialDirectUpload.validation.hasDimensions, true);
assert.equal(partialDirectUpload.validation.hasCompleteDimensions, false);
assert.equal(partialDirectUpload.requestedBoundary, undefined, 'A single extent must not invent a rectangular boundary.');
assert.ok(Math.abs(partialDirectUpload.requestedExtentsMeters.width - 7.62) < 0.000001);
assert.equal(partialDirectUpload.requestedExtentsMeters.depth, undefined);
const verticalOnlyDirectUpload = prepareText4dDirectUpload(imperialBrief, { unitSystem: 'imperial', width: '', depth: '40', area: '' });
assert.equal(verticalOnlyDirectUpload.validation.valid, true, 'A single vertical extent must establish upload scale.');
assert.ok(Math.abs(verticalOnlyDirectUpload.requestedExtentsMeters.depth - 12.192) < 0.000001);
assert.equal(verticalOnlyDirectUpload.requestedExtentsMeters.width, undefined);
const areaOnlyDirectUpload = prepareText4dDirectUpload(imperialBrief, { unitSystem: 'imperial', width: '', depth: '', area: '1000' });
assert.equal(areaOnlyDirectUpload.validation.valid, false, 'Area alone must not substitute for a known linear scale.');
assert.equal(areaOnlyDirectUpload.requestedBoundary, undefined, 'Area-only context must not invent a rectangular boundary.');
assert.equal(areaOnlyDirectUpload.brief.dimensions.area.value, 1000);
assert.equal(areaOnlyDirectUpload.brief.dimensions.envelope.width, 0, 'Direct upload scale must not silently inherit the Design Brief width.');
const dimensionsOnlyDirectUpload = prepareText4dDirectUpload(imperialBrief, { unitSystem: 'imperial', width: '25', depth: '40', area: '' });
assert.equal(dimensionsOnlyDirectUpload.validation.valid, true);
assert.ok(Math.abs(dimensionsOnlyDirectUpload.requestedBoundary[1].x - 7.62) < 0.000001);
assert.ok(Math.abs(dimensionsOnlyDirectUpload.requestedBoundary[2].y - 12.192) < 0.000001);
assert.ok(Math.abs(dimensionsOnlyDirectUpload.requestedExtentsMeters.width - 7.62) < 0.000001);
assert.ok(Math.abs(dimensionsOnlyDirectUpload.requestedExtentsMeters.depth - 12.192) < 0.000001);
assert.equal(dimensionsOnlyDirectUpload.brief.dimensions.area.value, 0, 'Direct upload scale must not silently inherit the Design Brief area.');
const architecturalDirectUpload = prepareText4dDirectUpload(imperialBrief, { unitSystem: 'imperial', width: `25'-6"`, depth: '40 ft 0 in', area: '1,000 sq ft' });
assert.equal(architecturalDirectUpload.validation.valid, true, 'Direct upload must accept standard architectural feet-and-inches notation.');
assert.ok(Math.abs(architecturalDirectUpload.requestedBoundary[1].x - 7.7724) < 0.000001);
assert.equal(architecturalDirectUpload.brief.dimensions.envelope.width, 25.5);
assert.equal(architecturalDirectUpload.brief.dimensions.area.value, 1000);
const shorthandDirectUpload = validateText4dDirectUploadScale({ unitSystem: 'imperial', width: '36-6', depth: `26'-6"`, area: '1000 sft' });
assert.equal(shorthandDirectUpload.valid, true, 'Direct upload must accept common architectural shorthand and sft area notation.');
assert.equal(shorthandDirectUpload.width, 36.5);
const metricDirectUpload = prepareText4dDirectUpload(imperialBrief, { unitSystem: 'metric', width: '7.5', depth: '12', area: '90' });
assert.equal(metricDirectUpload.validation.valid, true);
assert.equal(metricDirectUpload.brief.dimensions.envelope.unit, 'm');
assert.equal(metricDirectUpload.brief.dimensions.area.unit, 'sq_m');
const formattedMetricDirectUpload = validateText4dDirectUploadScale({ unitSystem: 'metric', width: '762 cm', depth: '12,192 mm', area: '92.9 m²' });
assert.equal(formattedMetricDirectUpload.valid, true, 'Direct upload must accept standard metric length and area notation.');
assert.equal(formattedMetricDirectUpload.width, 7.62);
assert.equal(formattedMetricDirectUpload.depth, 12.192);
assert.equal(formattedMetricDirectUpload.area, 92.9);
const wrongUnitDirectUpload = validateText4dDirectUploadScale({ unitSystem: 'imperial', width: '7.62 m', depth: '12.19 m', area: '' });
assert.equal(wrongUnitDirectUpload.valid, false, 'Direct upload must not silently reinterpret metric text while Imperial is selected.');
assert.equal(imperialBrief.dimensions.envelope.width, 20, 'Preparing an upload must not mutate the normal confirmed brief.');

const fallback = buildText4dFallbackGeometry(imperialBrief, boundary, new Error('synthetic trace failure'));
assert.equal(fallback.rooms.length, 5, 'Fallback geometry must preserve every requested room count.');
assert.equal(fallback.walls.length, 8, 'Five rooms require a four-wall shell and four deterministic partitions.');
assert.equal(fallback.doors.filter(door => door.mandatoryExteriorEntry).length, 1, 'Fallback geometry must contain one exterior entry.');
assert.ok(fallback.doors.length >= fallback.rooms.length, 'Fallback rooms must be connected by an interior door tree plus entry.');
assert.equal(fallback.extractionDiagnostics.canImport, true);
assert.match(fallback.extractionDiagnostics.warnings[0], /synthetic trace failure/);

const invalidBrief = legacySummaryToText4dBrief('Purpose: House\nRooms Included:\n- 1 Living Room\nFloors: Single-story');
assert.equal(validateText4dBrief(invalidBrief).valid, false);
assert.ok(validateText4dBrief(invalidBrief).errors.some(error => /width and depth/i.test(error)));

console.log(`Text 4.0 D canonical brief and prompt regression tests passed (${imperialPromptWords} prompt words).`);
