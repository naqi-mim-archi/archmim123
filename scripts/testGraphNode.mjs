import { importTs, check, finish } from './bundleForTest.mjs';

// Locks the node builder shut: it once used a field whitelist that silently dropped
// inputImageUrl, uploadedImages, ControlNet settings and the directive fields, which
// loses data on upload and makes saved sessions unrestorable.

const { buildNode } = await importTs('src/features/ai-rendering-canvas/state/useGraphStore.ts');

const fullNode = {
  id: 'n_full', type: 'image', title: 'Render', subtitle: 'variant 2',
  position: { x: 120, y: 340 }, width: 320, height: 240,
  imageUrl: 'data:image/png;base64,AAAA', inputImageUrl: 'data:image/png;base64,BBBB',
  outputs: [{ id: 'o1', url: 'data:image/png;base64,AAAA', type: 'image', mimeType: 'image/png' }],
  activeVariantIndex: 1,
  prompt: 'a villa', compiledPrompt: 'TASK: a villa', hubType: 'image_studio', workflowId: 2,
  model: 'flux-2-pro', style: 'realistic', aspectRatio: '3:2', resolution: '4K', variants: 3,
  controlNetEnabled: false, controlNetStrength: 45, imageStyle: 'cinematic',
  uploadedImages: [{ id: 'u1', name: 'sketch.png', category: 'drawing', base64: 'data:image/png;base64,CCCC' }],
  incomingEdgeTags: { n_prev: 'reference' },
  peopleOption: 'none', cameraOption: 'eye level', lightingOption: 'golden hour',
  materialsOption: 'concrete', environmentOption: 'urban', moodOption: 'calm',
  customCameraInput: 'low angle', customLightingInput: 'overcast', customMaterialsInput: 'travertine',
  customEnvironmentInput: 'lakeside', customMoodInput: 'serene', customImageAspectRatio: '21:9',
  inputImageDimensions: { width: 1024, height: 768 },
  durationSeconds: 6, audioEnabled: true, cameraMotion: 'dolly in',
  isInitialBlank: false, isConfiguring: true,
  status: 'completed', progress: 100, processingTimeMs: 12345, costEstimateUsd: 0.1375,
  error: undefined, createdAt: 1700000000000, parentId: 'n_parent',
};

const built = buildNode(fullNode);
const missing = Object.keys(fullNode).filter(key => JSON.stringify(built[key]) !== JSON.stringify(fullNode[key]));
check(missing.length === 0, `buildNode preserves every field (dropped/changed: ${missing.join(', ') || 'none'})`);

// Spot-checks for the fields that were silently lost before.
for (const key of ['inputImageUrl', 'uploadedImages', 'controlNetEnabled', 'controlNetStrength', 'aspectRatio', 'resolution', 'isConfiguring', 'incomingEdgeTags', 'cameraOption', 'customMoodInput']) {
  check(JSON.stringify(built[key]) === JSON.stringify(fullNode[key]), `Keeps ${key}`);
}

// Defaults
const minimal = buildNode({ title: 'Blank', type: 'action' });
check(/^node_/.test(minimal.id), 'Generates an id when none is given');
check(minimal.position.x === 100 && minimal.position.y === 100, 'Defaults the position');
check(minimal.width === 280 && minimal.height === 320, 'Defaults width and height');
check(minimal.status === 'idle' && Array.isArray(minimal.outputs) && minimal.outputs.length === 0, 'Defaults status and outputs');
check(typeof minimal.createdAt === 'number' && minimal.createdAt > 0, 'Stamps createdAt');
check(minimal.activeVariantIndex === 0, 'Defaults the active variant');

const derived = buildNode({ title: 'From image', type: 'image', imageUrl: 'data:image/png;base64,ZZZZ' });
check(derived.outputs.length === 1 && derived.outputs[0].url === 'data:image/png;base64,ZZZZ', 'Derives outputs from imageUrl when none are given');
check(buildNode({ title: 'x', type: 'image', id: 'keep-me' }).id === 'keep-me', 'Keeps an explicit id (session restore relies on this)');

finish();
