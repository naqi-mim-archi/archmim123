import { importTs, check, finish } from './bundleForTest.mjs';

// Render session serialization: image extraction, dedupe, round-trip and version handling.

const {
  collectDataUrls,
  rewriteNodeImageRefs,
  serializeSession,
  parseSessionDoc,
  estimateDataUrlBytes,
  estimateNewUploadBytes,
  countSessionImages,
  extensionForMime,
  dataUrlMime,
  sha256Hex,
  defaultSessionName,
} = await importTs('services/firebase/renderSessionSerialize.ts');

const dataUrl = (payload, mime = 'image/png') => `data:${mime};base64,${Buffer.from(payload).toString('base64')}`;

const RENDER_A = dataUrl('render-a-bytes'.repeat(40));
const RENDER_B = dataUrl('render-b-bytes'.repeat(40), 'image/jpeg');
const UPLOAD = dataUrl('sketch-upload-bytes'.repeat(40));

// A realistic graph: the parent's output is also the child's input, upload and outputs entries.
const nodes = () => ([
  {
    id: 'n1', type: 'upload', title: 'Sketch', status: 'completed', createdAt: 1, position: { x: 0, y: 0 },
    imageUrl: UPLOAD,
    inputImageUrl: UPLOAD,
    uploadedImages: [{ id: 'u1', name: 'sketch.png', category: 'drawing', base64: UPLOAD }],
    outputs: [{ id: 'o0', url: UPLOAD, type: 'image' }],
    prompt: 'modern villa', controlNetEnabled: true, controlNetStrength: 80, aspectRatio: '16:9', resolution: '2K',
  },
  {
    id: 'n2', type: 'image', title: 'Render 1', status: 'completed', createdAt: 2, position: { x: 400, y: 0 },
    parentId: 'n1', inputImageUrl: UPLOAD, imageUrl: RENDER_A,
    outputs: [{ id: 'o1', url: RENDER_A, type: 'image' }, { id: 'o2', url: RENDER_B, type: 'image', mimeType: 'image/jpeg' }],
    activeVariantIndex: 0,
  },
  { id: 'n3', type: 'action', title: 'Empty', status: 'idle', createdAt: 3, position: { x: 800, y: 0 } },
]);
const edges = [{ id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2' }];

// --- collection and dedupe -------------------------------------------------------------------
const found = collectDataUrls(nodes());
check(found.length === 3, `Finds every unique image across all four slots (got ${found.length})`);
check(found.includes(UPLOAD) && found.includes(RENDER_A) && found.includes(RENDER_B), 'Finds imageUrl, inputImageUrl, outputs[] and uploadedImages[]');
check(countSessionImages(nodes()) === 3, 'countSessionImages matches unique images');
check(dataUrlMime(RENDER_B) === 'image/jpeg' && extensionForMime('image/jpeg') === 'jpg', 'MIME and extension mapping');
check(Math.abs(estimateDataUrlBytes(dataUrl('x'.repeat(300))) - 300) <= 2, 'Byte estimate is close to the real payload size');

// --- serialize -------------------------------------------------------------------------------
const uploads = [];
// Full-payload hash: distinct images must never collide.
const fakeHash = async payload => 'h' + Buffer.from(payload).toString('hex').slice(0, 24) + payload.length;
const deps = {
  hash: fakeHash,
  upload: async (hash, mime) => { uploads.push(hash); return `https://storage.test/${hash}`; },
};
const snapshot = { nodes: nodes(), edges, viewport: { x: 10, y: 20, zoom: 0.5 }, selectedNodeId: 'n2', activeHub: 'image_studio' };
const { doc, uploadedBytes, reusedCount } = await serializeSession(snapshot, deps);

check(uploads.length === 3, `Uploads each unique image exactly once (got ${uploads.length} for 6 references)`);
check(reusedCount === 0 && uploadedBytes > 0, 'First save uploads everything');
check(Object.keys(doc.assets).length === 3, 'Asset map has one entry per unique image');
const serialized = JSON.stringify(doc);
check(!serialized.includes('data:image/'), 'No data URLs survive in the saved document');
check(serialized.length < JSON.stringify(nodes()).length / 2, 'Saved document is far smaller than the raw graph');
check(doc.nodes[0].uploadedImages[0].base64.startsWith('https://storage.test/'), 'uploadedImages[].base64 is rewritten');
check(doc.nodes[1].outputs[1].url.startsWith('https://storage.test/'), 'outputs[].url is rewritten');
check(doc.nodes[1].imageUrl === doc.nodes[1].outputs[0].url, 'Identical payloads share one uploaded URL');
check(doc.nodes[0].prompt === 'modern villa' && doc.nodes[0].controlNetStrength === 80 && doc.nodes[2].status === 'idle', 'Non-image node fields are preserved');
check(doc.viewport.zoom === 0.5 && doc.selectedNodeId === 'n2' && doc.activeHub === 'image_studio' && doc.version === 1, 'Viewport, selection, hub and version are saved');

// --- round trip -------------------------------------------------------------------------------
const forward = new Map();
for (const original of collectDataUrls(nodes())) {
  forward.set(original, doc.assets[await fakeHash(original.split(',')[1])].url);
}
const inverse = new Map([...forward].map(([from, to]) => [to, from]));
const restored = rewriteNodeImageRefs(doc.nodes, inverse);
check(JSON.stringify(restored) === JSON.stringify(nodes()), 'rewrite → inverse returns exactly the original nodes');
check(JSON.stringify(rewriteNodeImageRefs(nodes(), new Map())) === JSON.stringify(nodes()), 'An empty map is a no-op');
check(rewriteNodeImageRefs(nodes(), new Map([['https://not-present', 'x']]))[1].imageUrl === RENDER_A, 'Unknown URLs are left untouched');

// --- re-save reuses uploaded assets -------------------------------------------------------------
uploads.length = 0;
const second = await serializeSession(snapshot, { ...deps, existingAssets: doc.assets });
check(uploads.length === 0 && second.reusedCount === 3 && second.uploadedBytes === 0, 'Re-saving an unchanged session uploads nothing');
check(await estimateNewUploadBytes(nodes(), deps.hash, doc.assets) === 0, 'estimateNewUploadBytes is 0 when every asset exists');
check(await estimateNewUploadBytes(nodes(), deps.hash, {}) > 0, 'estimateNewUploadBytes counts new assets');

// --- parse ------------------------------------------------------------------------------------
check(parseSessionDoc(doc).nodes.length === 3, 'parseSessionDoc accepts a valid document');
const rejects = (value, label) => {
  try { parseSessionDoc(value); check(false, label); } catch { check(true, label); }
};
rejects({ ...doc, version: 2 }, 'Rejects a newer session format');
rejects({ version: 1 }, 'Rejects a document with no nodes');
rejects(null, 'Rejects an empty document');
const sparse = parseSessionDoc({ version: 1, nodes: [] });
check(sparse.edges.length === 0 && sparse.viewport.zoom === 1 && sparse.activeHub === 'image_studio', 'Missing optional fields get defaults');

// --- misc -------------------------------------------------------------------------------------
const hash = await sha256Hex('abc');
check(/^[0-9a-f]{32}$/.test(hash) && hash === await sha256Hex('abc') && hash !== await sha256Hex('abd'), 'Content hash is hex, stable and payload-sensitive');
check(defaultSessionName(new Date('2026-09-16T14:02:00')).startsWith('Render session — Sep 16'), 'Default session name includes the date');

finish();
