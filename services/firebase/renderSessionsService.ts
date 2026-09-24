import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { deleteObject, getDownloadURL, listAll, ref, uploadString } from 'firebase/storage';
import type {
  CanvasEdge,
  CanvasNodeData,
  GraphViewport,
  HubType,
  RenderSessionDocV1,
} from '../../src/features/ai-rendering-canvas/types/graph';
import { getFirebaseDb, getFirebaseStorage } from './firebaseConfig';
import { resolveRole, type LinkAccess, type ProjectRole } from './shareAccess';
import { checkStorageAllowance } from '../billing/balanceClient';
import { StorageLimitError } from './projectsService';
import {
  countSessionImages,
  defaultSessionName,
  estimateNewUploadBytes,
  extensionForMime,
  parseSessionDoc,
  serializeSession,
  sha256Hex,
} from './renderSessionSerialize';

// Saved render-canvas sessions. Mirrors projectsService.ts: small payloads inline in the
// Firestore doc, large ones in Storage, with images extracted to Storage either way.

export const INLINE_SESSION_LIMIT_BYTES = 700 * 1024;
export const MAX_SESSION_UPLOAD_BYTES = 50 * 1024 * 1024;
export { StorageLimitError };

export interface CloudRenderSessionSummary {
  id: string;
  name: string;
  hub: HubType;
  nodeCount: number;
  imageCount: number;
  thumbnailUrl: string | null;
  storageMode: 'inline' | 'storage';
  createdAt: Date | null;
  updatedAt: Date | null;
  ownerId: string;
  role: ProjectRole;
  linkAccess: LinkAccess;
}

const sessionPath = (uid: string, sessionId: string) => `users/${uid}/renderSessions/${sessionId}`;

const toDate = (value: any): Date | null => (value && typeof value.toDate === 'function' ? value.toDate() : null);

const dataUrlBytes = (dataUrl: string) => Math.ceil(((dataUrl.split(',')[1] || '').length * 3) / 4);

export const saveRenderSession = async (
  userId: string,
  snapshot: { nodes: CanvasNodeData[]; edges: CanvasEdge[]; viewport: GraphViewport; selectedNodeId: string | null },
  activeHub: HubType,
  options: {
    sessionId?: string | null;
    name?: string;
    thumbnailDataUrl?: string | null;
    onProgress?: (done: number, total: number) => void;
    ownerEmail?: string | null;
  } = {},
): Promise<{ sessionId: string; storageMode: 'inline' | 'storage' }> => {
  const db = getFirebaseDb();
  const storage = getFirebaseStorage();

  // Resolve the target session (an id we no longer own becomes a new session).
  let sessionId = options.sessionId || null;
  let previous: RenderSessionDocV1 | null = null;
  let existingData: any = null;
  if (sessionId) {
    try {
      const existing = await getDoc(doc(db, 'renderSessions', sessionId));
      const role = existing.exists() ? resolveRole(existing.data() as any, userId) : null;
      // A viewer saving a shared session gets their own copy rather than an error.
      if (!existing.exists() || !(role === 'owner' || role === 'editor')) sessionId = null;
      else {
        existingData = existing.data();
        previous = await loadRenderSession(userId, sessionId).catch(() => null);
      }
    } catch {
      sessionId = null;
    }
  }
  const isNew = !sessionId;
  if (!sessionId) sessionId = doc(collection(db, 'renderSessions')).id;
  // Files live under the owner's prefix, so their storage quota is the one that counts.
  const ownerId = existingData?.ownerId || userId;
  const base = sessionPath(ownerId, sessionId);

  // Quota check before any Storage write, covering only what is actually new.
  const newImageBytes = await estimateNewUploadBytes(snapshot.nodes, sha256Hex, previous?.assets);
  const thumbnailBytes = options.thumbnailDataUrl ? dataUrlBytes(options.thumbnailDataUrl) : 0;
  if (newImageBytes > MAX_SESSION_UPLOAD_BYTES) {
    throw new StorageLimitError('This session is too large to save. Delete some variants or branches and try again.');
  }
  if (newImageBytes + thumbnailBytes > 0) {
    const allowance = await checkStorageAllowance(newImageBytes + thumbnailBytes);
    if (!allowance.allowed) throw new StorageLimitError(allowance.message || 'This save would take you past your storage limit.');
  }

  const { doc: sessionDoc } = await serializeSession(
    { ...snapshot, activeHub },
    {
      hash: sha256Hex,
      existingAssets: previous?.assets,
      onProgress: options.onProgress,
      upload: async (hash, mime, dataUrl) => {
        const imageRef = ref(storage, `${base}/images/${hash}.${extensionForMime(mime)}`);
        await uploadString(imageRef, dataUrl, 'data_url', { contentType: mime });
        return getDownloadURL(imageRef);
      },
    },
  );

  let thumbnailUrl: string | null = previous ? await getDoc(doc(db, 'renderSessions', sessionId)).then(s => s.data()?.thumbnailUrl ?? null).catch(() => null) : null;
  if (options.thumbnailDataUrl) {
    const thumbRef = ref(storage, `${base}/thumbnail.jpg`);
    await uploadString(thumbRef, options.thumbnailDataUrl, 'data_url', { contentType: 'image/jpeg' });
    thumbnailUrl = await getDownloadURL(thumbRef);
  }

  const json = JSON.stringify(sessionDoc);
  const storageMode: 'inline' | 'storage' = new Blob([json]).size < INLINE_SESSION_LIMIT_BYTES ? 'inline' : 'storage';
  let dataUrl: string | null = null;
  if (storageMode === 'storage') {
    const dataRef = ref(storage, `${base}/session.json`);
    await uploadString(dataRef, json, 'raw', { contentType: 'application/json' });
    dataUrl = await getDownloadURL(dataRef);
  }

  const record: Record<string, unknown> = {
    ownerId,
    name: (options.name || defaultSessionName()).slice(0, 200),
    hub: activeHub,
    nodeCount: snapshot.nodes.length,
    imageCount: countSessionImages(snapshot.nodes),
    thumbnailUrl,
    storageMode,
    data: storageMode === 'inline' ? json : null,
    dataUrl,
    updatedAt: serverTimestamp(),
  };
  // Shown to people it's shared with ("… shared this with you"). Only the owner stamps it.
  if (ownerId === userId && options.ownerEmail) record.ownerEmail = String(options.ownerEmail).slice(0, 320);
  if (isNew) {
    record.createdAt = serverTimestamp();
    record.linkAccess = 'none';
    record.members = {};
    record.memberIds = [];
  }

  await setDoc(doc(db, 'renderSessions', sessionId), record, { merge: !isNew });
  if (!isNew && storageMode === 'inline') {
    deleteObject(ref(storage, `${base}/session.json`)).catch(() => undefined);
  }
  return { sessionId, storageMode };
};

// Sessions this user owns plus the ones shared with them.
export const listRenderSessions = async (userId: string): Promise<CloudRenderSessionSummary[]> => {
  const sessions = collection(getFirebaseDb(), 'renderSessions');
  const [owned, shared] = await Promise.all([
    getDocs(query(sessions, where('ownerId', '==', userId))),
    getDocs(query(sessions, where('memberIds', 'array-contains', userId))).catch(() => null),
  ]);
  if (!shared) console.warn('[Render session] The shared-sessions query was refused; showing your own sessions only.');
  const docs = new Map<string, any>();
  for (const entry of shared?.docs || []) docs.set(entry.id, entry.data());
  for (const entry of owned.docs) docs.set(entry.id, entry.data());
  return [...docs.entries()]
    .map(([id, data]) => {
      return {
        id,
        name: data.name || 'Render session',
        hub: (data.hub || 'image_studio') as HubType,
        nodeCount: Number(data.nodeCount) || 0,
        imageCount: Number(data.imageCount) || 0,
        thumbnailUrl: data.thumbnailUrl || null,
        storageMode: data.storageMode === 'storage' ? 'storage' : 'inline',
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
        ownerId: data.ownerId,
        role: resolveRole(data, userId),
        linkAccess: data.linkAccess === 'view' ? 'view' : 'none',
      } as CloudRenderSessionSummary;
    })
    .sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0));
};

export interface LoadedRenderSession {
  doc: RenderSessionDocV1;
  role: ProjectRole;
  name: string;
  ownerId: string;
  ownerEmail: string | null;
}

export const loadRenderSessionWithRole = async (userId: string | null, sessionId: string): Promise<LoadedRenderSession> => {
  const snap = await getDoc(doc(getFirebaseDb(), 'renderSessions', sessionId));
  if (!snap.exists()) throw new Error('Session not found.');
  const data = snap.data() as any;
  const role = resolveRole(data, userId);
  if (!role) throw new Error('Session not found.');
  const parsed = data.storageMode === 'storage'
    ? await (async () => {
        if (!data.dataUrl) throw new Error('This session is missing its saved canvas data.');
        const response = await fetch(data.dataUrl);
        if (!response.ok) throw new Error(`Could not download this session (HTTP ${response.status}).`);
        return parseSessionDoc(await response.json());
      })()
    : parseSessionDoc(JSON.parse(data.data));
  return { doc: parsed, role, name: data.name || 'Render session', ownerId: data.ownerId, ownerEmail: data.ownerEmail || null };
};

export const loadRenderSession = async (userId: string, sessionId: string): Promise<RenderSessionDocV1> => {
  const snap = await getDoc(doc(getFirebaseDb(), 'renderSessions', sessionId));
  if (!snap.exists() || !resolveRole(snap.data() as any, userId)) throw new Error('Session not found.');
  const data = snap.data();
  if (data.storageMode === 'storage') {
    if (!data.dataUrl) throw new Error('This session is missing its saved canvas data.');
    const response = await fetch(data.dataUrl);
    if (!response.ok) throw new Error(`Could not download this session (HTTP ${response.status}).`);
    return parseSessionDoc(await response.json());
  }
  return parseSessionDoc(JSON.parse(data.data));
};

export const deleteRenderSession = async (userId: string, sessionId: string): Promise<void> => {
  const storage = getFirebaseStorage();
  const base = sessionPath(userId, sessionId);
  await Promise.all(['session.json', 'thumbnail.jpg'].map(name => deleteObject(ref(storage, `${base}/${name}`)).catch(() => undefined)));
  // Unlike projects, the images folder holds one object per unique render.
  try {
    const images = await listAll(ref(storage, `${base}/images`));
    await Promise.all(images.items.map(item => deleteObject(item).catch(() => undefined)));
  } catch {
    // no images folder
  }
  await deleteDoc(doc(getFirebaseDb(), 'renderSessions', sessionId));
};
