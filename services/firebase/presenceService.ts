import { get, off, onDisconnect, onValue, ref, remove, serverTimestamp, set, update } from 'firebase/database';
import { getFirebaseDatabase, isRealtimeDbConfigured } from './firebaseConfig';
import {
  CursorThrottle,
  HEARTBEAT_MS,
  IntervalThrottle,
  CAMERA_MIN_INTERVAL_MS,
  colorForUid,
  isPeerStale,
  type PresenceView,
  type Point,
} from './presenceThrottle';

// Live presence over the Realtime Database: who is in a project, what they are looking at and
// where their cursor is. Cursors are world coordinates, so each viewer maps them with its own
// zoom/pan. Everything here no-ops when VITE_FIREBASE_DATABASE_URL is unset.

export interface PresenceIdentity {
  uid: string;
  name: string;
  photoURL?: string | null;
}

export interface PresenceCamera {
  position: [number, number, number];
  target: [number, number, number];
  isParallel: boolean;
  orthographicZoom?: number;
}

export interface PresencePeer extends PresenceIdentity {
  key: string;
  color: string;
  view: PresenceView | null;
  cursor: Point | null;
  camera: PresenceCamera | null;
  selectedIds: string[];
  lastActive: number;
}

export interface PresenceHandle {
  setView: (view: PresenceView) => void;
  setCursor: (point: Point | null) => void;
  setCamera: (camera: PresenceCamera) => void;
  setSelection: (ids: string[]) => void;
  leave: () => void;
}

const NOOP_HANDLE: PresenceHandle = {
  setView: () => undefined,
  setCursor: () => undefined,
  setCamera: () => undefined,
  setSelection: () => undefined,
  leave: () => undefined,
};

const sessionId = (() => {
  try {
    return globalThis.crypto?.randomUUID?.() || `s_${Math.random().toString(36).slice(2)}`;
  } catch {
    return `s_${Math.random().toString(36).slice(2)}`;
  }
})();

const presencePath = (projectId: string) => `presence/${projectId}`;
const selfPath = (projectId: string, uid: string) => `${presencePath(projectId)}/${uid}/${sessionId}`;

// ---------------------------------------------------------------- peers store (external store)

let peers: PresencePeer[] = [];
const listeners = new Set<() => void>();
let activeSubscription: { projectId: string; detach: () => void } | null = null;

const emit = () => listeners.forEach(listener => listener());

export const peersStore = {
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: () => peers,
};

const flattenPeers = (raw: any, selfUid: string | null): PresencePeer[] => {
  const now = Date.now();
  const result: PresencePeer[] = [];
  for (const [uid, sessions] of Object.entries(raw || {})) {
    if (uid === selfUid) continue;
    let newest: any = null;
    for (const [key, value] of Object.entries((sessions || {}) as Record<string, any>)) {
      if (!value) continue;
      if (isPeerStale(value.lastActive, now)) continue;
      if (!newest || (value.lastActive || 0) > (newest.value.lastActive || 0)) newest = { key, value };
    }
    if (!newest) continue;
    const value = newest.value;
    result.push({
      key: `${uid}_${newest.key}`,
      uid,
      name: value.name || 'Collaborator',
      photoURL: value.photoURL || null,
      color: value.color || colorForUid(uid),
      view: value.view || null,
      cursor: value.cursor && typeof value.cursor.x === 'number' ? { x: value.cursor.x, y: value.cursor.y } : null,
      camera: value.camera || null,
      selectedIds: Array.isArray(value.selectedIds) ? value.selectedIds : [],
      lastActive: value.lastActive || 0,
    });
  }
  return result.sort((a, b) => b.lastActive - a.lastActive);
};

// One listener per project, shared by every component that needs peers.
export const subscribePresence = (projectId: string | null, selfUid: string | null): (() => void) => {
  if (activeSubscription && activeSubscription.projectId === projectId) return activeSubscription.detach;
  activeSubscription?.detach();
  activeSubscription = null;
  peers = [];
  emit();
  if (!projectId || !isRealtimeDbConfigured) return () => undefined;

  const node = ref(getFirebaseDatabase(), presencePath(projectId));
  const handler = onValue(node, snapshot => {
    peers = flattenPeers(snapshot.val(), selfUid);
    emit();
  }, error => {
    console.warn('[Presence] Could not read presence:', error);
    peers = [];
    emit();
  });
  const detach = () => {
    off(node, 'value', handler);
    peers = [];
    emit();
    activeSubscription = null;
  };
  activeSubscription = { projectId, detach };
  return detach;
};

// ---------------------------------------------------------------- publishing

interface JoinState {
  key: string;
  refCount: number;
  handle: PresenceHandle;
  dispose: () => void;
}

let joinState: JoinState | null = null;

const createHandle = (projectId: string, identity: PresenceIdentity): { handle: PresenceHandle; dispose: () => void } => {
  const db = getFirebaseDatabase();
  const selfRef = ref(db, selfPath(projectId, identity.uid));
  const color = colorForUid(identity.uid);
  const cursorThrottle = new CursorThrottle();
  const cameraThrottle = new IntervalThrottle(CAMERA_MIN_INTERVAL_MS);

  let pendingCursor: Point | null = null;
  let frame: number | null = null;
  let view: PresenceView | null = null;
  let disposed = false;

  const writeBase = () => {
    void set(selfRef, {
      uid: identity.uid,
      name: identity.name,
      color,
      photoURL: identity.photoURL || null,
      view,
      cursor: null,
      selectedIds: [],
      lastActive: Date.now(),
    }).catch(error => console.warn('[Presence] Could not announce presence:', error));
  };

  // Re-arm the disconnect cleanup after every reconnect, or a dropped tab lingers forever.
  const connectedRef = ref(db, '.info/connected');
  const connectedHandler = onValue(connectedRef, snapshot => {
    if (disposed || snapshot.val() !== true) return;
    void onDisconnect(selfRef).remove().catch(() => undefined);
    writeBase();
  });

  const patch = (fields: Record<string, unknown>) => {
    if (disposed) return;
    void update(selfRef, { ...fields, lastActive: Date.now() }).catch(() => undefined);
  };

  const pump = () => {
    frame = null;
    if (disposed) return;
    const decision = cursorThrottle.next(pendingCursor);
    if (decision.kind === 'publish') patch({ cursor: decision.cursor });
    if (pendingCursor !== null) schedule();
  };

  const schedule = () => {
    if (frame !== null || disposed) return;
    frame = requestAnimationFrame(pump);
  };

  const onVisibility = () => {
    const decision = cursorThrottle.setHidden(document.visibilityState === 'hidden');
    if (decision.kind === 'idle') patch({ cursor: null });
  };
  document.addEventListener('visibilitychange', onVisibility);

  const heartbeat = window.setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    patch({});
  }, HEARTBEAT_MS);

  const handle: PresenceHandle = {
    setView: nextView => {
      view = nextView;
      patch({ view: nextView });
    },
    setCursor: point => {
      pendingCursor = point;
      schedule();
    },
    setCamera: camera => {
      if (!cameraThrottle.shouldSend()) return;
      patch({ camera });
    },
    setSelection: ids => patch({ selectedIds: (ids || []).slice(0, 20) }),
    leave: () => undefined,
  };

  const dispose = () => {
    disposed = true;
    if (frame !== null) cancelAnimationFrame(frame);
    window.clearInterval(heartbeat);
    document.removeEventListener('visibilitychange', onVisibility);
    off(connectedRef, 'value', connectedHandler);
    void onDisconnect(selfRef).cancel().catch(() => undefined);
    void remove(selfRef).catch(() => undefined);
  };

  return { handle, dispose };
};

// Ref-counted so React StrictMode's double-invoked effects don't thrash the presence node.
export const joinPresence = (projectId: string | null, identity: PresenceIdentity | null): PresenceHandle => {
  if (!projectId || !identity || !isRealtimeDbConfigured) return NOOP_HANDLE;
  const key = `${projectId}:${identity.uid}`;
  if (joinState && joinState.key === key) {
    joinState.refCount += 1;
    return { ...joinState.handle, leave: () => releasePresence(key) };
  }
  joinState?.dispose();
  const { handle, dispose } = createHandle(projectId, identity);
  joinState = { key, refCount: 1, handle, dispose };
  return { ...handle, leave: () => releasePresence(key) };
};

const releasePresence = (key: string) => {
  if (!joinState || joinState.key !== key) return;
  joinState.refCount -= 1;
  if (joinState.refCount > 0) return;
  joinState.dispose();
  joinState = null;
};

export { colorForUid };

// Test helper: how many peers are currently known.
export const __peerCountForTests = () => peers.length;

export const readPresenceOnce = async (projectId: string, selfUid: string | null): Promise<PresencePeer[]> => {
  if (!isRealtimeDbConfigured) return [];
  const snapshot = await get(ref(getFirebaseDatabase(), presencePath(projectId)));
  return flattenPeers(snapshot.val(), selfUid);
};
