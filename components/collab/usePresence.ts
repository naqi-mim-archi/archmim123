import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { User } from 'firebase/auth';
import {
  joinPresence,
  peersStore,
  subscribePresence,
  type PresenceHandle,
  type PresencePeer,
} from '../../services/firebase/presenceService';

const EMPTY: PresencePeer[] = [];

// Joins the project's presence room and returns a stable handle for publishing.
export const usePresence = (projectId: string | null, user: User | null): PresenceHandle => {
  const handleRef = useRef<PresenceHandle | null>(null);

  const identity = useMemo(() => (user ? {
    uid: user.uid,
    name: user.displayName || user.email || 'Collaborator',
    photoURL: user.photoURL,
  } : null), [user]);

  useEffect(() => {
    if (!projectId || !identity) {
      handleRef.current = null;
      return;
    }
    const handle = joinPresence(projectId, identity);
    handleRef.current = handle;
    const unsubscribe = subscribePresence(projectId, identity.uid);
    return () => {
      handle.leave();
      unsubscribe();
      handleRef.current = null;
    };
  }, [projectId, identity]);

  // Stable identity: the caller can keep this in a ref without re-running effects at 15 Hz.
  return useMemo<PresenceHandle>(() => ({
    setView: view => handleRef.current?.setView(view),
    setCursor: point => handleRef.current?.setCursor(point),
    setCamera: camera => handleRef.current?.setCamera(camera),
    setSelection: ids => handleRef.current?.setSelection(ids),
    leave: () => handleRef.current?.leave(),
  }), []);
};

// Read peers where they are drawn, not in App: this keeps 15 Hz updates out of the main tree.
export const usePresencePeers = (): PresencePeer[] =>
  useSyncExternalStore(peersStore.subscribe, peersStore.getSnapshot, () => EMPTY);

export interface RemoteSelector {
  uid: string;
  name: string;
  color: string;
}

// Which peers have which node selected on the render canvas. The result only changes when a
// selection changes, so cursor traffic doesn't re-render the node cards.
const EMPTY_SELECTIONS = new Map<string, RemoteSelector[]>();
let selectionsKey = '';
let selectionsCache = EMPTY_SELECTIONS;
const getRenderSelections = () => {
  const peers = peersStore.getSnapshot().filter(peer => peer.view?.viewMode === 'render' && peer.selectedIds.length > 0);
  const key = peers.map(peer => `${peer.uid}:${peer.color}:${peer.name}:${peer.selectedIds.join(',')}`).join('|');
  if (key === selectionsKey) return selectionsCache;
  const next = new Map<string, RemoteSelector[]>();
  for (const peer of peers) {
    for (const id of peer.selectedIds) {
      const list = next.get(id) || [];
      list.push({ uid: peer.uid, name: peer.name, color: peer.color });
      next.set(id, list);
    }
  }
  selectionsKey = key;
  selectionsCache = next.size ? next : EMPTY_SELECTIONS;
  return selectionsCache;
};

export const useRenderPeerSelections = (): Map<string, RemoteSelector[]> =>
  useSyncExternalStore(peersStore.subscribe, getRenderSelections, () => EMPTY_SELECTIONS);
