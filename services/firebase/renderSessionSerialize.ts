import type {
  CanvasNodeData,
  CanvasEdge,
  GraphViewport,
  HubType,
  RenderSessionAsset,
  RenderSessionDocV1,
} from '../../src/features/ai-rendering-canvas/types/graph';

// Pure session (de)serialization: no Firebase, no browser APIs, so scripts/testRenderSession.mjs
// can exercise it directly. Generated renders are base64 data URLs held inside nodes; a session
// with a handful of them is tens of MB, so they are uploaded once (deduped by content hash) and
// replaced by their download URLs.

export const DATA_URL_RE = /^data:([^;,]+);base64,(.*)$/s;

export const isDataUrl = (value: unknown): value is string =>
  typeof value === 'string' && DATA_URL_RE.test(value);

export const dataUrlMime = (dataUrl: string): string => DATA_URL_RE.exec(dataUrl)?.[1] || 'image/png';

export const dataUrlPayload = (dataUrl: string): string => DATA_URL_RE.exec(dataUrl)?.[2] || '';

export const estimateDataUrlBytes = (dataUrl: string): number =>
  Math.ceil((dataUrlPayload(dataUrl).length * 3) / 4);

export const extensionForMime = (mime: string): string => {
  const subtype = (mime.split('/')[1] || 'png').split('+')[0];
  return subtype === 'jpeg' ? 'jpg' : subtype.replace(/[^a-z0-9]/gi, '') || 'png';
};

// The only four places a CanvasNodeData can hold an image payload.
const readSlots = (node: CanvasNodeData): string[] => {
  const values: string[] = [];
  if (node.imageUrl) values.push(node.imageUrl);
  if (node.inputImageUrl) values.push(node.inputImageUrl);
  for (const output of node.outputs || []) if (output?.url) values.push(output.url);
  for (const image of node.uploadedImages || []) if (image?.base64) values.push(image.base64);
  return values;
};

export const collectDataUrls = (nodes: CanvasNodeData[]): string[] => {
  const seen = new Set<string>();
  for (const node of nodes || []) {
    for (const value of readSlots(node)) if (isDataUrl(value)) seen.add(value);
  }
  return [...seen];
};

// Rewrites the four image slots through `map`. Works in either direction (data URL -> https,
// or https -> data URL), and leaves anything not in the map untouched.
export const rewriteNodeImageRefs = (nodes: CanvasNodeData[], map: Map<string, string>): CanvasNodeData[] => {
  if (!map.size) return nodes;
  const swap = (value?: string) => (value && map.has(value) ? map.get(value)! : value);
  return (nodes || []).map(node => {
    const next: CanvasNodeData = { ...node };
    if (node.imageUrl) next.imageUrl = swap(node.imageUrl);
    if (node.inputImageUrl) next.inputImageUrl = swap(node.inputImageUrl);
    if (node.outputs) next.outputs = node.outputs.map(output => (output?.url ? { ...output, url: swap(output.url)! } : output));
    if (node.uploadedImages) {
      next.uploadedImages = node.uploadedImages.map((image: any) =>
        image?.base64 ? { ...image, base64: swap(image.base64) } : image);
    }
    return next;
  });
};

export const countSessionImages = (nodes: CanvasNodeData[]): number =>
  new Set((nodes || []).flatMap(readSlots)).size;

export interface SerializeDeps {
  // Content hash of the base64 payload (production: SHA-256 via crypto.subtle).
  hash: (base64Payload: string) => Promise<string>;
  // Uploads one data URL and returns its download URL.
  upload: (hash: string, mime: string, dataUrl: string) => Promise<string>;
  // Assets from the previously saved version of this session, so unchanged images are not re-uploaded.
  existingAssets?: Record<string, RenderSessionAsset>;
  onProgress?: (done: number, total: number) => void;
}

export interface SerializeResult {
  doc: RenderSessionDocV1;
  uploadedBytes: number;
  reusedCount: number;
}

export const serializeSession = async (
  input: {
    nodes: CanvasNodeData[];
    edges: CanvasEdge[];
    viewport: GraphViewport;
    selectedNodeId: string | null;
    activeHub: HubType;
  },
  deps: SerializeDeps,
): Promise<SerializeResult> => {
  const dataUrls = collectDataUrls(input.nodes);
  const assets: Record<string, RenderSessionAsset> = { ...(deps.existingAssets || {}) };
  const map = new Map<string, string>();
  let uploadedBytes = 0;
  let reusedCount = 0;

  for (let index = 0; index < dataUrls.length; index++) {
    const dataUrl = dataUrls[index];
    const mime = dataUrlMime(dataUrl);
    const key = await deps.hash(dataUrlPayload(dataUrl));
    const existing = assets[key];
    if (existing?.url) {
      map.set(dataUrl, existing.url);
      reusedCount += 1;
    } else {
      const bytes = estimateDataUrlBytes(dataUrl);
      const url = await deps.upload(key, mime, dataUrl);
      assets[key] = { url, mime, bytes };
      map.set(dataUrl, url);
      uploadedBytes += bytes;
    }
    deps.onProgress?.(index + 1, dataUrls.length);
  }

  return {
    doc: {
      version: 1,
      activeHub: input.activeHub,
      viewport: input.viewport,
      selectedNodeId: input.selectedNodeId ?? null,
      nodes: rewriteNodeImageRefs(input.nodes, map),
      edges: input.edges || [],
      assets,
      savedAt: Date.now(),
    },
    uploadedBytes,
    reusedCount,
  };
};

// Bytes that a save would newly add to storage (used for the quota check before any upload).
export const estimateNewUploadBytes = async (
  nodes: CanvasNodeData[],
  hash: SerializeDeps['hash'],
  existingAssets?: Record<string, RenderSessionAsset>,
): Promise<number> => {
  let total = 0;
  for (const dataUrl of collectDataUrls(nodes)) {
    const key = await hash(dataUrlPayload(dataUrl));
    if (!existingAssets?.[key]) total += estimateDataUrlBytes(dataUrl);
  }
  return total;
};

export const parseSessionDoc = (raw: unknown): RenderSessionDocV1 => {
  const doc = raw as RenderSessionDocV1;
  if (!doc || typeof doc !== 'object') throw new Error('This saved session is empty or unreadable.');
  if (doc.version !== 1) throw new Error(`This session was saved by a newer version of ArchAI (format ${String((doc as any).version)}).`);
  if (!Array.isArray(doc.nodes)) throw new Error('This saved session has no canvas data.');
  return {
    version: 1,
    activeHub: doc.activeHub || 'image_studio',
    viewport: doc.viewport || { x: 80, y: 80, zoom: 1 },
    selectedNodeId: doc.selectedNodeId ?? null,
    nodes: doc.nodes,
    edges: Array.isArray(doc.edges) ? doc.edges : [],
    assets: doc.assets || {},
    savedAt: doc.savedAt || 0,
  };
};

export const defaultSessionName = (now = new Date()): string =>
  `Render session — ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}`;

// Browser SHA-256; falls back to a cheap string hash where crypto.subtle is unavailable (http://, older webviews).
export const sha256Hex = async (payload: string): Promise<string> => {
  const subtle = (globalThis as any).crypto?.subtle;
  if (subtle) {
    const bytes = new TextEncoder().encode(payload);
    const digest = await subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  }
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < payload.length; i++) {
    h1 = Math.imul(h1 ^ payload.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + payload.charCodeAt(i) + i, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}${payload.length.toString(16)}`;
};
