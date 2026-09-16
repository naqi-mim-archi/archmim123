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

const briefModule = await buildModule('services/text4jBrief.ts');
const promptModule = await buildModule('services/text4jPromptBuilder.ts');
const chatVariationModule = await buildModule('services/text4jConversationVariation.ts');
const fallbackModule = await buildModule('services/text4jFallbackGeometry.ts');
const imageConfigModule = await buildModule('services/text4jImageConfig.ts');
const imageAspectGuardModule = await buildModule('services/text4jGeneratedImageAspectGuard.ts');
const roomLabelModule = await buildModule('services/text4jGeneratedImageRoomLabels.ts');
const directUploadModule = await buildModule('services/text4jDirectUpload.ts');
const importHandoffModule = await buildModule('services/text4jImportHandoff.ts');
const masterFloorplanModule = await buildModule('services/text4jMasterFloorplanData.ts');
const text4jFeatureSource = await readFile('components/generative-wizard/features/text4j/index.ts', 'utf8');
const wizardCoreSource = await readFile('components/generative-wizard/GenerativeWizardCore.tsx', 'utf8');
const masterFloorplanSource = await readFile('services/text4jMasterFloorplanData.ts', 'utf8');
const masterBackendSource = await readFile('services/text4jBackend.ts', 'utf8');
const structuredClientSource = await readFile('services/text4jStructured3dClient.ts', 'utf8');
const localExtractorSource = await readFile('services/localImageToJSON4j.ts', 'utf8');
const {
  applyText4jRectangularBoundaryPolicy,
  getText4jRectangularBoundaryEligibility,
  legacySummaryToText4jBrief,
  setText4jRectangularBoundaryLock,
  text4jHasExplicitRectangularRequest,
  text4jBriefBoundaryMeters,
  text4jBriefToDesignSummary,
  updateText4jBriefFromSummary,
  validateText4jBrief,
} = briefModule;
const { buildText4jImagePrompt } = promptModule;
const { getText4jConversationProfile } = chatVariationModule;
const { buildText4jFallbackGeometry } = fallbackModule;
const {
  TEXT4J_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION,
  TEXT4J_LOW_LATENCY_GENERATION_CONFIG,
} = imageConfigModule;
const {
  detectText4jLockedStructuralFrame,
  getText4jLockedImageAspectTarget,
  planText4jLockedAspectCorrection,
} = imageAspectGuardModule;
const {
  buildText4jRoomCrossDimensionLabels,
  formatText4jRoomCrossDimensions,
} = roomLabelModule;
const {
  prepareText4jDirectUpload,
  validateText4jDirectUploadScale,
} = directUploadModule;
const {
  finalizeText4jImportHandoff,
  isText4jAuthoritativePreview,
  markText4jAuthoritativePreview,
} = importHandoffModule;
const {
  buildText4jMasterFloorplanPrompt,
  isText4jMasterFloorplanDataUsable,
  normalizeText4jMasterFloorplanData,
  splitText4jDataUrl,
  validateText4jMasterFloorplanGraph,
} = masterFloorplanModule;

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
const authoritativePreview = markText4jAuthoritativePreview(previewHandoffFixture);
assert.equal(isText4jAuthoritativePreview(authoritativePreview), true);
let handoffNormalizerCalls = 0;
const handedOffPreview = finalizeText4jImportHandoff(authoritativePreview, element => {
  handoffNormalizerCalls += 1;
  return { ...element, pos: { x: 999, y: 999 } };
});
assert.equal(handoffNormalizerCalls, 0);
assert.strictEqual(handedOffPreview, authoritativePreview);
assert.deepEqual(handedOffPreview[1].pos, previewHandoffFixture[1].pos);
assert.equal(handedOffPreview[1].rotation, previewHandoffFixture[1].rotation);

const legacyPreview = finalizeText4jImportHandoff(previewHandoffFixture, element => ({
  ...element,
  pos: { x: 999, y: 999 },
}));
assert.deepEqual(legacyPreview[1].pos, { x: 999, y: 999 });

const appImportSource = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
assert.match(appImportSource, /finalizeText4jImportHandoff\(\s*remappedElements/,
  'Main-canvas placement must honor Text 4.0 J authoritative preview geometry before any legacy host normalization.');
const canvasSource = await readFile(new URL('../components/Canvas.tsx', import.meta.url), 'utf8');
assert.match(canvasSource, /text4jAuthoritativePreview/,
  'Canvas auto-split must bypass Text 4.0 J authoritative preview geometry after import.');
assert.match(text4jFeatureSource, /requestText4jStructuredGeometry\(base64Image\)/,
  'Text 4.0 J conversion must request Structured3D wall-face candidates.');
assert.match(text4jFeatureSource, /Promise\.allSettled\(\[structuredTask, localTask\]\)/,
  'Structured3D and the unchanged J-local baseline should run in parallel.');
assert.match(text4jFeatureSource, /reconcileText4jStructuredGeometry\(base64Image, localResult\.value, structuredResult\.value\)/,
  'Structured3D may influence J only through the post-Local geometry reconciler.');
assert.doesNotMatch(text4jFeatureSource, /transcribeText4jMasterFloorplanData/,
  'J must not substitute Gemini Master geometry for the Structured3D-assisted Local workflow.');
assert.match(wizardCoreSource, /runText4jHybridConversion/,
  'Text 4.0 J Design Copilot should expose the Structured3D plus local hybrid workflow.');
assert.match(wizardCoreSource, /useMasterFloorplanData:\s*false/,
  'Text 4.0 J must keep the inherited Gemini Master path disabled.');
assert.match(wizardCoreSource, /Import J Hybrid Final/,
  'Text 4.0 J must import only the final hybrid result.');
assert.match(wizardCoreSource, /Structured3D candidate geometry is shown in the middle/,
  'Text 4.0 J should show image, Structured geometry, and hybrid final as three panes.');
assert.match(wizardCoreSource, /isText4jMode && key === 'master'/,
  'The provisional Structured3D pane must remain view-only.');
assert.match(wizardCoreSource, /Keep the source image and both pipeline cards visible/,
  'A J hybrid failure must stay on the preview instead of returning to Design Brief Confirmation.');
assert.match(masterBackendSource, /restart that service on port 5000/,
  'A stale Structured3D process must produce an actionable API error.');
assert.match(structuredClientSource, /sourcePixelP1/);
assert.match(structuredClientSource, /sourcePixelP2/);
assert.doesNotMatch(localExtractorSource, /projectText4jStructuredWalls|structuredGeometry/,
  'The mature J-local extractor must not ingest raw Structured3D faces.');
assert.match(localExtractorSource, /estimatePixelScale\(preliminaryBounds, options\)/,
  'J local extraction must remain responsible for metric scale.');

const chatProfiles = [0, 1, 2].map(getText4jConversationProfile);
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

const imperialBrief = legacySummaryToText4jBrief(imperialSummary);
assert.equal(imperialBrief.dimensions.area.value, 600);
assert.equal(imperialBrief.dimensions.area.unit, 'sq_ft');
assert.equal(imperialBrief.dimensions.envelope.width, 20);
assert.equal(imperialBrief.dimensions.envelope.depth, 30);
assert.equal(imperialBrief.dimensions.envelope.unit, 'ft');
assert.equal(imperialBrief.rooms.length, 5);
assert.equal(validateText4jBrief(imperialBrief).valid, true);
assert.equal(getText4jRectangularBoundaryEligibility(imperialBrief).coverageRatio, 1);
assert.equal(getText4jRectangularBoundaryEligibility(imperialBrief).eligible, true);
assert.deepEqual(imperialBrief.dimensions.rectangularBoundary, { locked: true, source: 'automatic_area_match' });

const imperialPrompt = buildText4jImagePrompt(imperialBrief);
const masterPromptForUpload = buildText4jMasterFloorplanPrompt(imperialBrief, 'uploaded', undefined, { width: 6.096, depth: 9.144 });
assert.match(masterPromptForUpload, /master floorplan geometry/i);
assert.match(masterPromptForUpload, /Act only as a draftsman; do not redesign/i);
assert.match(masterPromptForUpload, /must not be split into many chords/i);
assert.match(masterPromptForUpload, /Folding doors must fold toward the visible folding\/slab side/i);
assert.match(masterPromptForUpload, /Return one JSON object matching the supplied schema/i);
assert.match(masterPromptForUpload, /normalized image coordinates/i);
assert.match(masterPromptForUpload, /one junction for every real corner/i);
assert.match(masterPromptForUpload, /exteriorLoop is the ordered sequence/i);
assert.match(masterPromptForUpload, /Every aperture must reference hostWallId/i);
assert.match(masterPromptForUpload, /Ignore all room names, dimensions, areas/i);
assert.doesNotMatch(masterPromptForUpload, /primaryScaleAxis|propertyEnvelope/i);
assert.doesNotMatch(masterPromptForUpload, /generate another image/i);
assert.doesNotMatch(masterFloorplanSource, /localGeometryEvidence|from ['"].*localImageToJSON4j/i,
  'Gemini Master geometry must remain independent from the Local JSON transcript and extractor implementation.');
assert.match(masterBackendSource, /gemini-3\.5-flash-lite/);
assert.doesNotMatch(masterBackendSource, /gemini-3\.6-flash/,
  'Every Gemini Master conversion must use the fixed Gemini 3.5 Flash-Lite model.');
assert.doesNotMatch(masterBackendSource, /preferHighAccuracy/,
  'Gemini Master backend model selection must not vary by plan complexity or Local conversion duration.');
assert.match(masterBackendSource, /ThinkingLevel\.MINIMAL/);
assert.match(masterBackendSource, /ThinkingLevel\.LOW/);
assert.match(masterBackendSource, /ThinkingLevel\.MEDIUM/);
assert.match(masterBackendSource, /ThinkingLevel\.HIGH/);
assert.match(masterFloorplanSource, /thinkingLevel: request\.thinkingLevel \|\| 'minimal'/,
  'Gemini Master thinking level must be sent with a minimal default.');
assert.match(masterBackendSource, /location: "global"/);
assert.match(masterBackendSource, /MEDIA_RESOLUTION_HIGH/);
assert.match(masterBackendSource, /validateText4jMasterFloorplanGraph/);
const masterRouteSource = masterBackendSource.slice(
  masterBackendSource.indexOf("if (url.startsWith('/api/text4j/master-geometry'))"),
  masterBackendSource.indexOf('const ai = new GoogleGenAI({', masterBackendSource.indexOf("if (url.startsWith('/api/text4j/master-geometry'))") + 100),
);
assert.doesNotMatch(masterRouteSource, /temperature\s*:/,
  'Latest Gemini 3.5/3.6 Master requests must not send deprecated sampling parameters.');
assert.deepEqual(splitText4jDataUrl('data:image/png;base64,abc123'), { mimeType: 'image/png', data: 'abc123' });
const normalizedMasterData = normalizeText4jMasterFloorplanData({
  walls: [{
    p1: [0, 0],
    p2: [4, 0],
    type: 'exterior',
    curveType: 'ellipse',
    center: [2, 1],
    radiusX: 2,
    radiusY: 1,
    startAngle: 0,
    endAngle: 3.14,
  }],
  windows: [{ pos: [2, 0], rotation: 0, width: 1.2, type: 'standard' }],
  rooms: [{ label: 'Living Room', pos: [2, 1] }],
}, { brief: imperialBrief, imageBase64: 'data:image/jpeg;base64,test', sourceKind: 'uploaded' });
assert.equal(normalizedMasterData.walls?.[0].wallSource, 'ellipse');
assert.equal(normalizedMasterData.walls?.[0].isCurved, true);
assert.equal(normalizedMasterData.windows?.length, 1);
assert.equal(normalizedMasterData.extractionDiagnostics?.canImport, false);
assert.equal(isText4jMasterFloorplanDataUsable(normalizedMasterData), false);
const usableMasterData = normalizeText4jMasterFloorplanData({
  walls: [
    { p1: [0, 0], p2: [4, 0], type: 'exterior' },
    { p1: [4, 0], p2: [4, 3], type: 'exterior' },
  ],
}, { brief: imperialBrief, imageBase64: 'data:image/jpeg;base64,test', sourceKind: 'generated' });
assert.equal(isText4jMasterFloorplanDataUsable(usableMasterData), true);
const ds77NormalizedMaster = normalizeText4jMasterFloorplanData({
  coordinateSpace: 'normalized_0_1000',
  junctions: [
    { id: 'J1', x: 40, y: 30 },
    { id: 'J2', x: 960, y: 30 },
    { id: 'J3', x: 960, y: 970 },
    { id: 'J4', x: 40, y: 970 },
    { id: 'J5', x: 420, y: 240 },
    { id: 'J6', x: 540, y: 360 },
  ],
  exteriorLoop: ['J1', 'J2', 'J3', 'J4'],
  walls: [
    { id: 'W1', startJunctionId: 'J1', endJunctionId: 'J2', type: 'exterior', curveType: 'line' },
    { id: 'W2', startJunctionId: 'J2', endJunctionId: 'J3', type: 'exterior', curveType: 'line' },
    { id: 'W3', startJunctionId: 'J3', endJunctionId: 'J4', type: 'exterior', curveType: 'line' },
    { id: 'W4', startJunctionId: 'J4', endJunctionId: 'J1', type: 'exterior', curveType: 'line' },
    { id: 'W5', startJunctionId: 'J5', endJunctionId: 'J6', type: 'interior', curveType: 'line' },
  ],
  apertures: [
    { id: 'A1', hostWallId: 'W1', offset: 0.5, widthRatio: 0.1, kind: 'door', subtype: 'single', hingeSide: 'left', swingDirection: 'inward' },
    { id: 'A2', hostWallId: 'W2', offset: 0.4, widthRatio: 0.15, kind: 'window', subtype: 'standard', hingeSide: 'unknown', swingDirection: 'unknown' },
  ],
}, {
  brief: imperialBrief,
  imageBase64: 'data:image/png;base64,ds77',
  sourceKind: 'uploaded',
  requestedExtentsMeters: { width: 12.192, depth: 12.192 },
});
const ds77WallPoints = ds77NormalizedMaster.walls.flatMap(wall => [wall.p1, wall.p2]);
const ds77Width = Math.max(...ds77WallPoints.map(point => point[0])) - Math.min(...ds77WallPoints.map(point => point[0]));
const ds77Depth = Math.max(...ds77WallPoints.map(point => point[1])) - Math.min(...ds77WallPoints.map(point => point[1]));
assert.ok(Math.abs(ds77Depth - 12.192) < 1e-9, 'DS12-77: authoritative depth must be exact.');
assert.ok(Math.abs(ds77Width - 12.192) < 1e-9, 'DS12-77: authoritative width must be exact.');
assert.deepEqual(ds77NormalizedMaster.walls[0].p2, ds77NormalizedMaster.walls[1].p1,
  'Junction expansion must preserve Gemini wall closure exactly.');
assert.equal(ds77NormalizedMaster.extractionDiagnostics.scaleSource, 'requested-boundary');
assert.match(ds77NormalizedMaster.extractionDiagnostics.warnings.join(' '), /calibrated the traced X\/Y axes independently/i);
assert.equal(ds77NormalizedMaster.rooms.length, 0, 'Room extraction must not affect Gemini Master geometry quality.');
assert.equal(ds77NormalizedMaster.doors.length, 1);
assert.equal(ds77NormalizedMaster.windows.length, 1);
assert.deepEqual(ds77NormalizedMaster.doors[0].pos, [6.096, 12.192],
  'Hosted door position must be derived from its wall and offset.');
assert.equal(ds77NormalizedMaster.doors[0].rotation, 0,
  'Hosted door rotation must be derived from its wall tangent.');
assert.ok(Math.abs(ds77NormalizedMaster.doors[0].width - 1.2192) < 1e-9,
  'Hosted door width must be derived from its host-wall ratio.');
assert.equal(ds77NormalizedMaster.extractionDiagnostics.canImport, true);
const ds77WidthOnlyMaster = normalizeText4jMasterFloorplanData({
  coordinateSpace: 'normalized_0_1000',
  junctions: [
    { id: 'J1', x: 40, y: 30 }, { id: 'J2', x: 960, y: 30 },
    { id: 'J3', x: 960, y: 970 }, { id: 'J4', x: 40, y: 970 },
  ],
  exteriorLoop: ['J1', 'J2', 'J3', 'J4'],
  walls: [
    { id: 'W1', startJunctionId: 'J1', endJunctionId: 'J2', type: 'exterior', curveType: 'line' },
    { id: 'W2', startJunctionId: 'J2', endJunctionId: 'J3', type: 'exterior', curveType: 'line' },
    { id: 'W3', startJunctionId: 'J3', endJunctionId: 'J4', type: 'exterior', curveType: 'line' },
    { id: 'W4', startJunctionId: 'J4', endJunctionId: 'J1', type: 'exterior', curveType: 'line' },
  ],
  apertures: [],
}, {
  brief: imperialBrief,
  imageBase64: 'data:image/png;base64,ds77-width-only',
  sourceKind: 'uploaded',
  requestedExtentsMeters: { width: 12.192 },
});
assert.ok(Math.abs(ds77WidthOnlyMaster.walls[0].p2[0] - 12.192) < 1e-9,
  'DS12-77: one supplied width must establish uniform scale.');
assert.ok(Math.abs(ds77WidthOnlyMaster.walls[1].p1[1] - 12.192 * 940 / 920) < 1e-9,
  'DS12-77: the missing depth must be inferred from Gemini raster geometry without stretching.');
const invalidHostedGraph = {
  coordinateSpace: 'normalized_0_1000',
  junctions: [
    { id: 'J1', x: 0, y: 0 }, { id: 'J2', x: 1000, y: 0 },
    { id: 'J3', x: 1000, y: 1000 }, { id: 'J4', x: 0, y: 1000 },
  ],
  exteriorLoop: ['J1', 'J2', 'J3', 'J4'],
  walls: [
    { id: 'W1', startJunctionId: 'J1', endJunctionId: 'J2', type: 'exterior', curveType: 'line' },
    { id: 'W2', startJunctionId: 'J2', endJunctionId: 'J3', type: 'exterior', curveType: 'line' },
    { id: 'W3', startJunctionId: 'J3', endJunctionId: 'J4', type: 'exterior', curveType: 'line' },
    { id: 'W4', startJunctionId: 'J4', endJunctionId: 'J1', type: 'exterior', curveType: 'line' },
  ],
  apertures: [{ id: 'A1', hostWallId: 'missing', offset: 0.5, widthRatio: 0.2, kind: 'window' }],
};
assert.equal(validateText4jMasterFloorplanGraph(invalidHostedGraph).valid, false,
  'An unhosted aperture must invalidate Gemini Master geometry.');
assert.match(validateText4jMasterFloorplanGraph(invalidHostedGraph).errors.join(' '), /existing host wall/i);
const invalidHostedResult = normalizeText4jMasterFloorplanData(invalidHostedGraph, {
  brief: imperialBrief, imageBase64: 'data:image/png;base64,invalid-host', sourceKind: 'uploaded',
});
assert.equal(invalidHostedResult.extractionDiagnostics.canImport, false);
const diagonalHostedMaster = normalizeText4jMasterFloorplanData({
  coordinateSpace: 'normalized_0_1000',
  junctions: [
    { id: 'J1', x: 0, y: 0 }, { id: 'J2', x: 1000, y: 0 },
    { id: 'J3', x: 1000, y: 1000 }, { id: 'J4', x: 0, y: 1000 },
    { id: 'J5', x: 200, y: 200 }, { id: 'J6', x: 600, y: 600 },
  ],
  exteriorLoop: ['J1', 'J2', 'J3', 'J4'],
  walls: [
    { id: 'W1', startJunctionId: 'J1', endJunctionId: 'J2', type: 'exterior', curveType: 'line' },
    { id: 'W2', startJunctionId: 'J2', endJunctionId: 'J3', type: 'exterior', curveType: 'line' },
    { id: 'W3', startJunctionId: 'J3', endJunctionId: 'J4', type: 'exterior', curveType: 'line' },
    { id: 'W4', startJunctionId: 'J4', endJunctionId: 'J1', type: 'exterior', curveType: 'line' },
    { id: 'W5', startJunctionId: 'J5', endJunctionId: 'J6', type: 'interior', curveType: 'line' },
  ],
  apertures: [
    { id: 'A1', hostWallId: 'W5', offset: 0.25, widthRatio: 0.2, kind: 'unknown', subtype: 'unknown', hingeSide: 'unknown', swingDirection: 'unknown' },
  ],
}, {
  brief: imperialBrief, imageBase64: 'data:image/png;base64,diagonal-host', sourceKind: 'uploaded',
  requestedExtentsMeters: { width: 10, depth: 10 },
});
assert.equal(diagonalHostedMaster.openings.length, 1, 'An observed but unclassified aperture must be retained as a wall opening.');
assert.deepEqual(diagonalHostedMaster.openings[0].pos, [3, 7],
  'Angular aperture position must be derived along its diagonal host wall.');
assert.ok(Math.abs(diagonalHostedMaster.openings[0].rotation + 45) < 1e-9,
  'Angular aperture rotation must equal its host-wall tangent.');
const selfIntersectingGraph = {
  coordinateSpace: 'normalized_0_1000',
  junctions: [
    { id: 'J1', x: 0, y: 0 }, { id: 'J2', x: 1000, y: 1000 },
    { id: 'J3', x: 0, y: 1000 }, { id: 'J4', x: 1000, y: 0 },
  ],
  exteriorLoop: ['J1', 'J2', 'J3', 'J4'],
  walls: [
    { id: 'W1', startJunctionId: 'J1', endJunctionId: 'J2', type: 'exterior', curveType: 'line' },
    { id: 'W2', startJunctionId: 'J2', endJunctionId: 'J3', type: 'exterior', curveType: 'line' },
    { id: 'W3', startJunctionId: 'J3', endJunctionId: 'J4', type: 'exterior', curveType: 'line' },
    { id: 'W4', startJunctionId: 'J4', endJunctionId: 'J1', type: 'exterior', curveType: 'line' },
  ],
  apertures: [],
};
assert.equal(validateText4jMasterFloorplanGraph(selfIntersectingGraph).valid, false);
assert.match(validateText4jMasterFloorplanGraph(selfIntersectingGraph).errors.join(' '), /self-intersects/i,
  'Self-intersecting exterior geometry must never be importable.');
const curvedHostedMaster = normalizeText4jMasterFloorplanData({
  coordinateSpace: 'normalized_0_1000',
  junctions: [
    { id: 'J1', x: 0, y: 0 }, { id: 'J2', x: 1000, y: 0 },
    { id: 'J3', x: 1000, y: 1000 }, { id: 'J4', x: 0, y: 1000 },
    { id: 'J5', x: 200, y: 500 }, { id: 'J6', x: 800, y: 500 },
  ],
  exteriorLoop: ['J1', 'J2', 'J3', 'J4'],
  walls: [
    { id: 'W1', startJunctionId: 'J1', endJunctionId: 'J2', type: 'exterior', curveType: 'line' },
    { id: 'W2', startJunctionId: 'J2', endJunctionId: 'J3', type: 'exterior', curveType: 'line' },
    { id: 'W3', startJunctionId: 'J3', endJunctionId: 'J4', type: 'exterior', curveType: 'line' },
    { id: 'W4', startJunctionId: 'J4', endJunctionId: 'J1', type: 'exterior', curveType: 'line' },
    { id: 'W5', startJunctionId: 'J5', endJunctionId: 'J6', type: 'interior', curveType: 'arc', centerX: 500, centerY: 500, radius: 300, startAngle: Math.PI, endAngle: 0, counterclockwise: false },
  ],
  apertures: [
    { id: 'A1', hostWallId: 'W5', offset: 0.5, widthRatio: 0.1, kind: 'window', subtype: 'standard', hingeSide: 'unknown', swingDirection: 'unknown' },
  ],
}, {
  brief: imperialBrief, imageBase64: 'data:image/png;base64,curved-host', sourceKind: 'uploaded',
  requestedExtentsMeters: { width: 10 },
});
assert.equal(curvedHostedMaster.walls[4].wallSource, 'arc', 'A native Gemini arc must remain a native arc under uniform scaling.');
assert.equal(curvedHostedMaster.walls[4].isCurved, true);
assert.deepEqual(curvedHostedMaster.windows[0].pos.map(value => Number(value.toFixed(9))), [5, 8],
  'A curved-wall aperture must be evaluated on its host curve, not its endpoint chord.');
const orderedHeadings = [
  'RENDER RESOLVED FLOOR PLAN',
  'SQUARE 1:1 LOCK:',
  'SPEC:',
  'ROOMS EXACT:',
  'ADJACENCY:',
  'PLAN:',
  'ROOM LABELS MANDATORY:',
  'STYLE text4j-digitizable-floorplan-v1:',
  'DIMENSIONS:',
];
let previousIndex = -1;
for (const heading of orderedHeadings) {
  const index = imperialPrompt.indexOf(heading);
  assert.ok(index > previousIndex, `${heading} must appear in the required prompt order.`);
  previousIndex = index;
}
assert.match(imperialPrompt, /STYLE text4j-digitizable-floorplan-v1/);
assert.match(imperialPrompt, /orthographic, white, crisp pure-black/);
assert.match(imperialPrompt, /pure-black/);
assert.match(imperialPrompt, /9-inch/);
assert.match(imperialPrompt, /20'-0"/);
assert.match(imperialPrompt, /30'-0"/);
assert.match(imperialPrompt, /SQUARE 1:1 LOCK/i);
assert.match(imperialPrompt, /fixed-property bbox centered, about 492x737px/i);
assert.doesNotMatch(imperialPrompt, /\bat x=\d+-\d+,\s*y=\d+-\d+/i);
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
const narrowDeepPrompt = buildText4jImagePrompt(narrowDeepBrief);
assert.match(narrowDeepPrompt, /fixed-property bbox centered, about 369x737px/i);

const requestedCaseBrief = {
  ...imperialBrief,
  dimensions: {
    ...imperialBrief.dimensions,
    area: { ...imperialBrief.dimensions.area, value: 1000 },
    envelope: { ...imperialBrief.dimensions.envelope, width: 25, depth: 40 },
  },
};
const requestedCasePrompt = buildText4jImagePrompt(requestedCaseBrief);
assert.match(requestedCasePrompt, /fixed-property bbox centered, about 461x737px/i);
assert.match(requestedCasePrompt, /target width:depth 25:40=0\.625:1; 2% tolerance/i);
assert.match(requestedCasePrompt, /BOUNDARY SHAPE: RECTANGLE LOCKED; 1000 sq ft approximately fills the dimensional rectangle/i);

const creativeSummary = imperialSummary.replace("600 sq ft (20' x 30')", "900 sq ft (25' x 40')");
const creativeBrief = legacySummaryToText4jBrief(creativeSummary);
const creativeEligibility = getText4jRectangularBoundaryEligibility(creativeBrief);
assert.ok(Math.abs(creativeEligibility.coverageRatio - 0.9) < 1e-9);
assert.equal(creativeEligibility.eligible, false);
assert.deepEqual(creativeBrief.dimensions.rectangularBoundary, { locked: false, source: 'ineligible' });
assert.deepEqual(
  setText4jRectangularBoundaryLock(creativeBrief, true).dimensions.rectangularBoundary,
  { locked: false, source: 'ineligible' },
  'An incompatible area must not be manually rectangle-locked.',
);
const creativePrompt = buildText4jImagePrompt(creativeBrief);
assert.match(creativePrompt, /BOUNDARY SHAPE: CREATIVE UNLOCKED/i);
assert.match(creativePrompt, /enclosed area 900 sq ft=90% of bbox/i);
assert.match(creativePrompt, /intelligent compact, L\/U, stepped, or offset form/i);
assert.doesNotMatch(creativePrompt, /RECTANGLE LOCKED/i);

const thresholdBrief = legacySummaryToText4jBrief(imperialSummary.replace("600 sq ft (20' x 30')", "950 sq ft (25' x 40')"));
assert.equal(getText4jRectangularBoundaryEligibility(thresholdBrief).eligible, true, '95% coverage must be rectangle-eligible.');
assert.equal(thresholdBrief.dimensions.rectangularBoundary.locked, true);
const belowThresholdBrief = legacySummaryToText4jBrief(imperialSummary.replace("600 sq ft (20' x 30')", "949 sq ft (25' x 40')"));
assert.equal(getText4jRectangularBoundaryEligibility(belowThresholdBrief).eligible, false);

const manualUnlock = setText4jRectangularBoundaryLock(requestedCaseBrief, false);
assert.deepEqual(manualUnlock.dimensions.rectangularBoundary, { locked: false, source: 'user_confirmed' });
const explicitLock = applyText4jRectangularBoundaryPolicy(manualUnlock, 'Use a rectangular boundary.');
assert.deepEqual(explicitLock.dimensions.rectangularBoundary, { locked: true, source: 'explicit_user_request' });
assert.equal(text4jHasExplicitRectangularRequest('Please make it rectangular.'), true);
assert.equal(text4jHasExplicitRectangularRequest('Use a non-rectangular creative plan.'), false);

const landscapePrompt = buildText4jImagePrompt({
  ...requestedCaseBrief,
  dimensions: {
    ...requestedCaseBrief.dimensions,
    envelope: { ...requestedCaseBrief.dimensions.envelope, width: 40, depth: 25 },
  },
});
assert.match(landscapePrompt, /fixed-property bbox centered, about 737x461px/i);

const multiFloorPrompt = buildText4jImagePrompt({
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
  const prompt = buildText4jImagePrompt({
    ...requestedCaseBrief,
    dimensions: {
      ...requestedCaseBrief.dimensions,
      envelope: { ...requestedCaseBrief.dimensions.envelope, width: example.width, depth: example.depth },
    },
  });
  assert.ok(prompt.includes(example.pixels), `${example.width}x${example.depth} must have a deterministic pixel frame.`);
  assert.ok(prompt.includes(example.ratio), `${example.width}x${example.depth} must state its exact ratio.`);
  assert.doesNotMatch(prompt, /\bat x=\d+-\d+,\s*y=\d+-\d+/i);
}

const circularPrompt = buildText4jImagePrompt({
  ...creativeBrief,
  project: {
    ...creativeBrief.project,
    purpose: `${creativeBrief.project.purpose}; circular radial apartment floorplan`,
  },
  planningStyle: 'Circular radial plan with curved exterior walls',
});
assert.match(circularPrompt, /CREATIVE UNLOCKED CURVILINEAR/i);
assert.match(circularPrompt, /honor requested circular\/radial\/arc geometry/i);
assert.match(circularPrompt, /connected curvilinear\/radial shell with true arcs/i);
assert.doesNotMatch(circularPrompt, /connected orthogonal shell/i);

assert.deepEqual(TEXT4J_LOW_LATENCY_GENERATION_CONFIG.responseModalities, ['IMAGE']);
assert.equal(TEXT4J_LOW_LATENCY_GENERATION_CONFIG.thinkingConfig.thinkingLevel, 'minimal');
assert.equal(TEXT4J_LOW_LATENCY_GENERATION_CONFIG.thinkingConfig.includeThoughts, false);
assert.equal(TEXT4J_LOW_LATENCY_GENERATION_CONFIG.imageConfig.imageSize, '1K');
assert.equal(TEXT4J_LOW_LATENCY_GENERATION_CONFIG.imageConfig.aspectRatio, '1:1');
assert.equal(TEXT4J_LOW_LATENCY_GENERATION_CONFIG.candidateCount, 1);
assert.match(TEXT4J_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /hard rendering constraint/i);
assert.match(TEXT4J_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /within 2%/i);
assert.match(TEXT4J_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /Count balconies, terraces, porches, decks, steps, and railings/i);
assert.match(TEXT4J_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /Exclude annotations and every door leaf or swing arc/i);
assert.match(TEXT4J_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /RECTANGLE LOCKED/i);
assert.match(TEXT4J_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /CREATIVE UNLOCKED/i);
assert.match(TEXT4J_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /never force a rectangle by default/i);
assert.match(TEXT4J_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /Never render prompt instructions, pixel coordinates/i);
assert.match(TEXT4J_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /reserving clear white label zones/i);
assert.match(TEXT4J_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /one full Design Brief room name/i);
assert.match(TEXT4J_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /0\.33 times normal room-label height/i);
assert.match(TEXT4J_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /never abbreviate and never render room dimensions, room areas, label backgrounds, legends, or duplicate labels/i);
assert.match(TEXT4J_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /complete glyph box fits inside clear white floor space/i);
assert.match(TEXT4J_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION, /No label glyph may touch, cross, obscure, or replace any wall, door leaf, swing arc, window, wall opening, column, stair, railing, fixture, or other architectural mark/i);
assert.match(text4jFeatureSource, /annotateGeneratedPreview:\s*false/, 'The normal D-generated preview must not re-add room dimensions after OCR.');

assert.equal(formatText4jRoomCrossDimensions(3.77, 2.77, 'ft'), `12'-4\" x 9'-1\"`);
assert.equal(formatText4jRoomCrossDimensions(3.77, 2.77, 'm'), '3.77 m x 2.77 m');
const deterministicRoomLabels = buildText4jRoomCrossDimensionLabels({
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
assert.equal(buildText4jRoomCrossDimensionLabels({
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
assert.equal(buildText4jRoomCrossDimensionLabels({
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

const detectedLockedFrame = detectText4jLockedStructuralFrame({
  width: syntheticWidth,
  height: syntheticHeight,
  data: syntheticPixels,
});
assert.ok(detectedLockedFrame, 'The D image guard must detect a thick rectangular exterior frame.');
assert.ok(Math.abs(detectedLockedFrame.ratio - 612 / 752) < 0.01);
const lockedTarget = getText4jLockedImageAspectTarget(requestedCaseBrief);
assert.equal(lockedTarget, 0.625);
const lockedCorrection = planText4jLockedAspectCorrection(detectedLockedFrame, lockedTarget);
assert.equal(lockedCorrection.applied, true);
assert.equal(lockedCorrection.reason, 'axis-correction');
assert.ok(Math.abs(lockedCorrection.correctedRatio - 0.625) < 1e-9);
assert.ok(lockedCorrection.scaleX < 1 && lockedCorrection.scaleY === 1);
assert.equal(getText4jLockedImageAspectTarget(creativeBrief), undefined, 'Creative-unlocked plans must bypass deterministic axis correction.');
assert.equal(planText4jLockedAspectCorrection({ ratio: 0.63 }, 0.625).applied, false);
assert.equal(getText4jLockedImageAspectTarget({
  ...requestedCaseBrief,
  project: { ...requestedCaseBrief.project, floors: 2 },
}), undefined, 'The single-frame correction must not distort multi-panel floorplan images.');

const metricSummary = imperialSummary
  .replace("600 sq ft (20' x 30')", '55.74 sqm (6.1m x 9.14m)')
  .replace('Single-story', '2-story');
const metricBrief = legacySummaryToText4jBrief(metricSummary);
const metricPrompt = buildText4jImagePrompt(metricBrief);
assert.equal(metricBrief.dimensions.area.unit, 'sq_m');
assert.equal(metricBrief.dimensions.envelope.unit, 'm');
assert.match(metricPrompt, /230 mm/);
assert.match(metricPrompt, /6.1 m/);
assert.match(metricPrompt, /one stair in common circulation/i);
assert.doesNotMatch(metricPrompt, /9-inch/);
assert.doesNotMatch(metricPrompt, /20'-0"/);

const editedSummary = text4jBriefToDesignSummary(imperialBrief).replace("20'-0\" x 30'-0\"", "24'-0\" x 25'-0\"");
const editedBrief = updateText4jBriefFromSummary(editedSummary, imperialBrief, 'dimensions');
assert.equal(editedBrief.dimensions.envelope.width, 24);
assert.equal(editedBrief.dimensions.envelope.depth, 25);
assert.equal(editedBrief.dimensions.envelope.source, 'user_confirmed');
assert.match(buildText4jImagePrompt(editedBrief), /width 24'-0" above; depth 25'-0" left/);

const boundary = text4jBriefBoundaryMeters(imperialBrief);
assert.ok(boundary);
assert.ok(Math.abs(boundary[1].x - 6.096) < 0.000001);
assert.ok(Math.abs(boundary[2].y - 9.144) < 0.000001);

const blankDirectUpload = validateText4jDirectUploadScale({ unitSystem: 'imperial', width: '', depth: '', area: '' });
assert.equal(blankDirectUpload.valid, false, 'A direct upload must provide at least one dimension.');
const partialDirectUpload = prepareText4jDirectUpload(imperialBrief, { unitSystem: 'imperial', width: '25', depth: '', area: '' });
assert.equal(partialDirectUpload.validation.valid, true, 'A single horizontal extent must establish upload scale.');
assert.equal(partialDirectUpload.validation.hasDimensions, true);
assert.equal(partialDirectUpload.validation.hasCompleteDimensions, false);
assert.equal(partialDirectUpload.requestedBoundary, undefined, 'A single extent must not invent a rectangular boundary.');
assert.ok(Math.abs(partialDirectUpload.requestedExtentsMeters.width - 7.62) < 0.000001);
assert.equal(partialDirectUpload.requestedExtentsMeters.depth, undefined);
const verticalOnlyDirectUpload = prepareText4jDirectUpload(imperialBrief, { unitSystem: 'imperial', width: '', depth: '40', area: '' });
assert.equal(verticalOnlyDirectUpload.validation.valid, true, 'A single vertical extent must establish upload scale.');
assert.ok(Math.abs(verticalOnlyDirectUpload.requestedExtentsMeters.depth - 12.192) < 0.000001);
assert.equal(verticalOnlyDirectUpload.requestedExtentsMeters.width, undefined);
const areaOnlyDirectUpload = prepareText4jDirectUpload(imperialBrief, { unitSystem: 'imperial', width: '', depth: '', area: '1000' });
assert.equal(areaOnlyDirectUpload.validation.valid, false, 'Area alone must not substitute for a known linear scale.');
assert.equal(areaOnlyDirectUpload.requestedBoundary, undefined, 'Area-only context must not invent a rectangular boundary.');
assert.equal(areaOnlyDirectUpload.brief.dimensions.area.value, 1000);
assert.equal(areaOnlyDirectUpload.brief.dimensions.envelope.width, 0, 'Direct upload scale must not silently inherit the Design Brief width.');
const dimensionsOnlyDirectUpload = prepareText4jDirectUpload(imperialBrief, { unitSystem: 'imperial', width: '25', depth: '40', area: '' });
assert.equal(dimensionsOnlyDirectUpload.validation.valid, true);
assert.ok(Math.abs(dimensionsOnlyDirectUpload.requestedBoundary[1].x - 7.62) < 0.000001);
assert.ok(Math.abs(dimensionsOnlyDirectUpload.requestedBoundary[2].y - 12.192) < 0.000001);
assert.ok(Math.abs(dimensionsOnlyDirectUpload.requestedExtentsMeters.width - 7.62) < 0.000001);
assert.ok(Math.abs(dimensionsOnlyDirectUpload.requestedExtentsMeters.depth - 12.192) < 0.000001);
assert.equal(dimensionsOnlyDirectUpload.brief.dimensions.area.value, 0, 'Direct upload scale must not silently inherit the Design Brief area.');
const architecturalDirectUpload = prepareText4jDirectUpload(imperialBrief, { unitSystem: 'imperial', width: `25'-6"`, depth: '40 ft 0 in', area: '1,000 sq ft' });
assert.equal(architecturalDirectUpload.validation.valid, true, 'Direct upload must accept standard architectural feet-and-inches notation.');
assert.ok(Math.abs(architecturalDirectUpload.requestedBoundary[1].x - 7.7724) < 0.000001);
assert.equal(architecturalDirectUpload.brief.dimensions.envelope.width, 25.5);
assert.equal(architecturalDirectUpload.brief.dimensions.area.value, 1000);
const shorthandDirectUpload = validateText4jDirectUploadScale({ unitSystem: 'imperial', width: '36-6', depth: `26'-6"`, area: '1000 sft' });
assert.equal(shorthandDirectUpload.valid, true, 'Direct upload must accept common architectural shorthand and sft area notation.');
assert.equal(shorthandDirectUpload.width, 36.5);
const metricDirectUpload = prepareText4jDirectUpload(imperialBrief, { unitSystem: 'metric', width: '7.5', depth: '12', area: '90' });
assert.equal(metricDirectUpload.validation.valid, true);
assert.equal(metricDirectUpload.brief.dimensions.envelope.unit, 'm');
assert.equal(metricDirectUpload.brief.dimensions.area.unit, 'sq_m');
const formattedMetricDirectUpload = validateText4jDirectUploadScale({ unitSystem: 'metric', width: '762 cm', depth: '12,192 mm', area: '92.9 m²' });
assert.equal(formattedMetricDirectUpload.valid, true, 'Direct upload must accept standard metric length and area notation.');
assert.equal(formattedMetricDirectUpload.width, 7.62);
assert.equal(formattedMetricDirectUpload.depth, 12.192);
assert.equal(formattedMetricDirectUpload.area, 92.9);
const wrongUnitDirectUpload = validateText4jDirectUploadScale({ unitSystem: 'imperial', width: '7.62 m', depth: '12.19 m', area: '' });
assert.equal(wrongUnitDirectUpload.valid, false, 'Direct upload must not silently reinterpret metric text while Imperial is selected.');
assert.equal(imperialBrief.dimensions.envelope.width, 20, 'Preparing an upload must not mutate the normal confirmed brief.');

const fallback = buildText4jFallbackGeometry(imperialBrief, boundary, new Error('synthetic trace failure'));
assert.equal(fallback.rooms.length, 5, 'Fallback geometry must preserve every requested room count.');
assert.equal(fallback.walls.length, 8, 'Five rooms require a four-wall shell and four deterministic partitions.');
assert.equal(fallback.doors.filter(door => door.mandatoryExteriorEntry).length, 1, 'Fallback geometry must contain one exterior entry.');
assert.ok(fallback.doors.length >= fallback.rooms.length, 'Fallback rooms must be connected by an interior door tree plus entry.');
assert.equal(fallback.extractionDiagnostics.canImport, true);
assert.match(fallback.extractionDiagnostics.warnings[0], /synthetic trace failure/);

const invalidBrief = legacySummaryToText4jBrief('Purpose: House\nRooms Included:\n- 1 Living Room\nFloors: Single-story');
assert.equal(validateText4jBrief(invalidBrief).valid, false);
assert.ok(validateText4jBrief(invalidBrief).errors.some(error => /width and depth/i.test(error)));

console.log(`Text 4.0 J canonical brief and prompt regression tests passed (${imperialPromptWords} prompt words).`);
