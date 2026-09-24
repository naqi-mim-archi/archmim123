import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import { get, off, onChildAdded, onChildChanged, onChildRemoved, ref, serverTimestamp, set, update } from 'firebase/database';
import { getDownloadURL, ref as storageRef, uploadString } from 'firebase/storage';
import { getFirebaseDatabase, getFirebaseStorage, isRealtimeDbConfigured } from '../../services/firebase/firebaseConfig';
import { presenceSessionId, readPresenceOnce } from '../../services/firebase/presenceService';
import { LiveSyncLedger, buildLiveSeed, decodeLiveKey, type LiveEntry, type LiveRoom } from '../../services/firebase/liveProjectDiff';
import { collectDataUrls, rewriteNodeImageRefs, sha256Hex } from '../../services/firebase/renderSessionSerialize';
import type { CanvasEdge, CanvasNodeData } from '../../src/features/ai-rendering-canvas/types/graph';
import type { GraphStore } from '../../src/features/ai-rendering-canvas/state/useGraphStore';

// Live co-editing of a saved render session: node moves, new nodes, prompts, connections and
// finished renders reach everyone who has the session open.
//
// Images never travel through the database (a render is megabytes). They are uploaded to the
// session's own Storage folder — the same place Save uses, keyed by content hash so the same
// image is uploaded once — and the node carries the link instead.

export type LiveSessionStatus = 'off' | 'connecting' | 'live' | 'viewing' | 'error';

const FLUSH_MS = 120;

interface Options {
  sessionId: string | null;
  ownerId: string | null;
  user: User | null;
  store: GraphStore;
}

export const useLiveRenderSession = ({ sessionId, ownerId, user, store }: Options): LiveSessionStatus => {
  const [status, setStatus] = useState<LiveSessionStatus>('off');
  const storeRef = useRef(store);
  storeRef.current = store;
  const sessionRef = useRef<{ flush: () => void } | null>(null);
  const uid = user?.uid || null;

  useEffect(() => {
    if (!sessionId || !ownerId || !user || !isRealtimeDbConfigured) {
      setStatus('off');
      return;
    }
    let cancelled = false;
    const detachers: Array<() => void> = [];
    const nodeLedger = new LiveSyncLedger('nodes');
    const edgeLedger = new LiveSyncLedger('edges');
    const by = presenceSessionId;
    // data URL -> https link, so the same picture is only ever uploaded once.
    const uploaded = new Map<string, string>();
    let canWrite = false;
    let ready = false;
    let flushTimer: number | null = null;
    let flushing = false;
    let warned = false;

    const db = getFirebaseDatabase();
    const liveRef = ref(db, `live/${sessionId}`);

    // Swap every data URL in the graph for a Storage link before it goes on the wire.
    const toWireNodes = async (nodes: CanvasNodeData[]): Promise<CanvasNodeData[]> => {
      const pending = collectDataUrls(nodes).filter(url => !uploaded.has(url));
      for (const dataUrl of pending) {
        try {
          const hash = await sha256Hex(dataUrl);
          const extension = /^data:image\/([a-z0-9.+-]+);/i.exec(dataUrl)?.[1]?.replace('jpeg', 'jpg') || 'png';
          const target = storageRef(getFirebaseStorage(), `users/${ownerId}/renderSessions/${sessionId}/images/${hash}.${extension}`);
          await uploadString(target, dataUrl, 'data_url');
          uploaded.set(dataUrl, await getDownloadURL(target));
        } catch (error) {
          if (!warned) console.warn('[Live] Could not share a render image with collaborators:', error);
          warned = true;
          uploaded.set(dataUrl, ''); // don't retry this one on every flush
        }
      }
      const map = new Map([...uploaded].filter(([, url]) => !!url));
      return rewriteNodeImageRefs(nodes, map);
    };

    // Remote changes are batched into one store update per frame.
    let pendingNodes = new Map<string, CanvasNodeData>();
    let pendingNodeRemovals = new Set<string>();
    let pendingEdges = new Map<string, CanvasEdge>();
    let pendingEdgeRemovals = new Set<string>();
    let applyScheduled = false;
    const scheduleApply = () => {
      if (applyScheduled) return;
      applyScheduled = true;
      requestAnimationFrame(() => {
        applyScheduled = false;
        if (cancelled) return;
        const nodes = [...pendingNodes.values()];
        const removedNodeIds = [...pendingNodeRemovals];
        const edges = [...pendingEdges.values()];
        const removedEdgeIds = [...pendingEdgeRemovals];
        pendingNodes = new Map();
        pendingNodeRemovals = new Set();
        pendingEdges = new Map();
        pendingEdgeRemovals = new Set();
        if (!nodes.length && !removedNodeIds.length && !edges.length && !removedEdgeIds.length) return;
        storeRef.current.mergeRemote({ nodes, removedNodeIds, edges, removedEdgeIds });
      });
    };

    const flush = async () => {
      flushTimer = null;
      if (!ready || !canWrite || cancelled || flushing) return;
      flushing = true;
      try {
        const wireNodes = await toWireNodes(storeRef.current.nodes || []);
        if (cancelled) return;
        const updates = {
          ...nodeLedger.collectLocal({ elements: wireNodes } as any, by),
          ...edgeLedger.collectLocal({ elements: storeRef.current.edges || [] } as any, by),
        };
        if (Object.keys(updates).length === 0) return;
        await update(liveRef, updates);
      } catch (error) {
        if (!warned) console.warn('[Live] Could not send your change to collaborators:', error);
        warned = true;
      } finally {
        flushing = false;
      }
    };

    sessionRef.current = {
      flush: () => {
        if (flushTimer !== null) return;
        flushTimer = window.setTimeout(() => void flush(), FLUSH_MS);
      },
    };

    const start = async () => {
      setStatus('connecting');
      let role: string | null = null;
      try {
        const res = await fetch('/api/share/live-access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'session', targetId: sessionId }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        role = (await res.json())?.role || null;
      } catch (error) {
        console.info('[Live] Live editing unavailable for this session:', error);
        if (!cancelled) setStatus('error');
        return;
      }
      if (cancelled || !role) return;
      canWrite = role === 'owner' || role === 'editor';

      const [snapshot, peers] = await Promise.all([get(liveRef), readPresenceOnce(`rs_${sessionId}`, user.uid)]);
      if (cancelled) return;
      const room = (snapshot.val() || null) as (LiveRoom & { nodes?: Record<string, LiveEntry>; edges?: Record<string, LiveEntry> }) | null;
      const roomHasData = !!(room && (room.nodes || room.edges));

      if (peers.length > 0 && roomHasData && room) {
        // Someone is already working in this session: take what they have.
        nodeLedger.resetFromRoom(room as any);
        edgeLedger.resetFromRoom(room as any);
        const parse = <T,>(entries: Record<string, LiveEntry> | undefined): T[] => Object.values(entries || {})
          .map(entry => { try { return JSON.parse(entry.j); } catch { return null; } })
          .filter(Boolean) as T[];
        storeRef.current.hydrate({
          nodes: parse<CanvasNodeData>(room.nodes),
          edges: parse<CanvasEdge>(room.edges),
        }, { keepHistory: true });
      } else if (canWrite) {
        const wireNodes = await toWireNodes(storeRef.current.nodes || []);
        if (cancelled) return;
        const nodeSeed = buildLiveSeed({ elements: wireNodes } as any, by);
        const edgeSeed = buildLiveSeed({ elements: storeRef.current.edges || [] } as any, by);
        nodeLedger.resetFromProject({ elements: wireNodes } as any);
        edgeLedger.resetFromProject({ elements: storeRef.current.edges || [] } as any);
        try {
          await set(liveRef, { nodes: nodeSeed.elements, edges: edgeSeed.elements, seededAt: serverTimestamp() });
        } catch (error) {
          console.warn('[Live] Could not start live editing for this session:', error);
          if (!cancelled) setStatus('error');
          return;
        }
      } else {
        nodeLedger.resetFromRoom(room as any);
        edgeLedger.resetFromRoom(room as any);
      }
      if (cancelled) return;

      const watch = <T extends { id: string }>(
        child: 'nodes' | 'edges',
        ledger: LiveSyncLedger,
        upserts: () => Map<string, T>,
        removals: () => Set<string>,
      ) => {
        const childRef = ref(db, `live/${sessionId}/${child}`);
        const onEntry = (snap: any) => {
          const parsed = ledger.noteRemoteElement<any>(String(snap.key), snap.val() as LiveEntry);
          if (!parsed) return;
          removals().delete(parsed.id);
          upserts().set(parsed.id, parsed as T);
          scheduleApply();
        };
        const added = onChildAdded(childRef, onEntry);
        const changed = onChildChanged(childRef, onEntry);
        const removed = onChildRemoved(childRef, snap => {
          if (!ledger.noteRemoteRemoval(String(snap.key))) return;
          const id = decodeLiveKey(String(snap.key));
          upserts().delete(id);
          removals().add(id);
          scheduleApply();
        });
        detachers.push(() => {
          off(childRef, 'child_added', added);
          off(childRef, 'child_changed', changed);
          off(childRef, 'child_removed', removed);
        });
      };
      watch<CanvasNodeData>('nodes', nodeLedger, () => pendingNodes, () => pendingNodeRemovals);
      watch<CanvasEdge>('edges', edgeLedger, () => pendingEdges, () => pendingEdgeRemovals);

      ready = true;
      setStatus(canWrite ? 'live' : 'viewing');
      void flush();
    };

    void start();

    return () => {
      cancelled = true;
      ready = false;
      if (flushTimer !== null) window.clearTimeout(flushTimer);
      detachers.forEach(detach => detach());
      sessionRef.current = null;
      setStatus('off');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, ownerId, uid]);

  // Any local change to the graph schedules a diff against the live copy.
  useEffect(() => {
    sessionRef.current?.flush();
  }, [store.nodes, store.edges]);

  return status;
};
