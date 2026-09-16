import assert from 'node:assert/strict';
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

const briefModule = await buildModule('services/text4cBrief.ts');
const promptModule = await buildModule('services/text4cPromptBuilder.ts');
const chatVariationModule = await buildModule('services/text4cConversationVariation.ts');
const fallbackModule = await buildModule('services/text4cFallbackGeometry.ts');
const imageConfigModule = await buildModule('services/text4cImageConfig.ts');
const {
  legacySummaryToText4cBrief,
  text4cBriefBoundaryMeters,
  text4cBriefToDesignSummary,
  updateText4cBriefFromSummary,
  validateText4cBrief,
} = briefModule;
const { buildText4cImagePrompt } = promptModule;
const { getText4cConversationProfile } = chatVariationModule;
const { buildText4cFallbackGeometry } = fallbackModule;
const { TEXT4C_LOW_LATENCY_GENERATION_CONFIG } = imageConfigModule;

const chatProfiles = [0, 1, 2].map(getText4cConversationProfile);
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

const imperialBrief = legacySummaryToText4cBrief(imperialSummary);
assert.equal(imperialBrief.dimensions.area.value, 600);
assert.equal(imperialBrief.dimensions.area.unit, 'sq_ft');
assert.equal(imperialBrief.dimensions.envelope.width, 20);
assert.equal(imperialBrief.dimensions.envelope.depth, 30);
assert.equal(imperialBrief.dimensions.envelope.unit, 'ft');
assert.equal(imperialBrief.rooms.length, 5);
assert.equal(validateText4cBrief(imperialBrief).valid, true);

const imperialPrompt = buildText4cImagePrompt(imperialBrief);
const orderedHeadings = [
  'RENDER RESOLVED FLOOR PLAN',
  'SPEC:',
  'SQUARE 1:1 LOCK:',
  'ROOMS EXACT:',
  'ADJACENCY:',
  'PLAN:',
  'STYLE text4c-digitizable-floorplan-v1:',
  'DIMENSIONS:',
];
let previousIndex = -1;
for (const heading of orderedHeadings) {
  const index = imperialPrompt.indexOf(heading);
  assert.ok(index > previousIndex, `${heading} must appear in the required prompt order.`);
  previousIndex = index;
}
assert.match(imperialPrompt, /STYLE text4c-digitizable-floorplan-v1/);
assert.match(imperialPrompt, /orthographic, white, crisp pure-black/);
assert.match(imperialPrompt, /pure-black/);
assert.match(imperialPrompt, /9-inch/);
assert.match(imperialPrompt, /20'-0"/);
assert.match(imperialPrompt, /30'-0"/);
assert.match(imperialPrompt, /SQUARE 1:1 LOCK/i);
assert.match(imperialPrompt, /exterior-wall box in canvas x=26-74%, y=14-86%/i);
assert.match(imperialPrompt, /centered uniform-scale; white margins; never stretch\/crop/i);
assert.doesNotMatch(imperialPrompt, /coordinates are in METERS/i);
assert.match(imperialPrompt, /hinged or sliding glazed access door/i);
assert.match(imperialPrompt, /never a window/i);
assert.match(imperialPrompt, /single story: no stair/i);
const imperialPromptWords = imperialPrompt.split(/\s+/).length;
assert.ok(imperialPromptWords <= 200, `Resolved render prompt must stay within the low-latency budget; received ${imperialPromptWords} words.`);

const narrowDeepBrief = {
  ...imperialBrief,
  dimensions: {
    ...imperialBrief.dimensions,
    area: { ...imperialBrief.dimensions.area, value: 800 },
    envelope: { ...imperialBrief.dimensions.envelope, width: 20, depth: 40 },
  },
};
const narrowDeepPrompt = buildText4cImagePrompt(narrowDeepBrief);
assert.match(narrowDeepPrompt, /exterior-wall box in canvas x=32-68%, y=14-86%/i);

const requestedCaseBrief = {
  ...imperialBrief,
  dimensions: {
    ...imperialBrief.dimensions,
    area: { ...imperialBrief.dimensions.area, value: 1000 },
    envelope: { ...imperialBrief.dimensions.envelope, width: 25, depth: 40 },
  },
};
const requestedCasePrompt = buildText4cImagePrompt(requestedCaseBrief);
assert.match(requestedCasePrompt, /exterior-wall box in canvas x=27\.5-72\.5%, y=14-86%/i);

const landscapePrompt = buildText4cImagePrompt({
  ...requestedCaseBrief,
  dimensions: {
    ...requestedCaseBrief.dimensions,
    envelope: { ...requestedCaseBrief.dimensions.envelope, width: 40, depth: 25 },
  },
});
assert.match(landscapePrompt, /exterior-wall box in canvas x=14-86%, y=27\.5-72\.5%/i);

const multiFloorPrompt = buildText4cImagePrompt({
  ...requestedCaseBrief,
  project: { ...requestedCaseBrief.project, floors: 2 },
});
assert.match(multiFloorPrompt, /exterior-wall box in each equal nonoverlapping floor panel x=27\.5-72\.5%, y=14-86%/i);

assert.deepEqual(TEXT4C_LOW_LATENCY_GENERATION_CONFIG.responseModalities, ['IMAGE']);
assert.equal(TEXT4C_LOW_LATENCY_GENERATION_CONFIG.thinkingConfig.thinkingLevel, 'minimal');
assert.equal(TEXT4C_LOW_LATENCY_GENERATION_CONFIG.thinkingConfig.includeThoughts, false);
assert.equal(TEXT4C_LOW_LATENCY_GENERATION_CONFIG.imageConfig.imageSize, '1K');
assert.equal(TEXT4C_LOW_LATENCY_GENERATION_CONFIG.imageConfig.aspectRatio, '1:1');
assert.equal(TEXT4C_LOW_LATENCY_GENERATION_CONFIG.candidateCount, 1);

const metricSummary = imperialSummary
  .replace("600 sq ft (20' x 30')", '55.74 sqm (6.1m x 9.14m)')
  .replace('Single-story', '2-story');
const metricBrief = legacySummaryToText4cBrief(metricSummary);
const metricPrompt = buildText4cImagePrompt(metricBrief);
assert.equal(metricBrief.dimensions.area.unit, 'sq_m');
assert.equal(metricBrief.dimensions.envelope.unit, 'm');
assert.match(metricPrompt, /230 mm/);
assert.match(metricPrompt, /6.1 m/);
assert.match(metricPrompt, /one stair in common circulation/i);
assert.doesNotMatch(metricPrompt, /9-inch/);
assert.doesNotMatch(metricPrompt, /20'-0"/);

const editedSummary = text4cBriefToDesignSummary(imperialBrief).replace("20'-0\" x 30'-0\"", "24'-0\" x 25'-0\"");
const editedBrief = updateText4cBriefFromSummary(editedSummary, imperialBrief, 'dimensions');
assert.equal(editedBrief.dimensions.envelope.width, 24);
assert.equal(editedBrief.dimensions.envelope.depth, 25);
assert.equal(editedBrief.dimensions.envelope.source, 'user_confirmed');
assert.match(buildText4cImagePrompt(editedBrief), /width 24'-0" above; depth 25'-0" left/);

const boundary = text4cBriefBoundaryMeters(imperialBrief);
assert.ok(boundary);
assert.ok(Math.abs(boundary[1].x - 6.096) < 0.000001);
assert.ok(Math.abs(boundary[2].y - 9.144) < 0.000001);

const fallback = buildText4cFallbackGeometry(imperialBrief, boundary, new Error('synthetic trace failure'));
assert.equal(fallback.rooms.length, 5, 'Fallback geometry must preserve every requested room count.');
assert.equal(fallback.walls.length, 8, 'Five rooms require a four-wall shell and four deterministic partitions.');
assert.equal(fallback.doors.filter(door => door.mandatoryExteriorEntry).length, 1, 'Fallback geometry must contain one exterior entry.');
assert.ok(fallback.doors.length >= fallback.rooms.length, 'Fallback rooms must be connected by an interior door tree plus entry.');
assert.equal(fallback.extractionDiagnostics.canImport, true);
assert.match(fallback.extractionDiagnostics.warnings[0], /synthetic trace failure/);

const invalidBrief = legacySummaryToText4cBrief('Purpose: House\nRooms Included:\n- 1 Living Room\nFloors: Single-story');
assert.equal(validateText4cBrief(invalidBrief).valid, false);
assert.ok(validateText4cBrief(invalidBrief).errors.some(error => /width and depth/i.test(error)));

console.log(`Text 4.0 C canonical brief and prompt regression tests passed (${imperialPromptWords} prompt words).`);
