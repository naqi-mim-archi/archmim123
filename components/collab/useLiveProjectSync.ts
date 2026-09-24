import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import {
  get,
  off,
  onChildAdded,
  onChildChanged,
  onChildRemoved,
  onValue,
  ref,
  serverTimestamp,
  set,
  update,
} from 'firebase/database';
import { getFirebaseDatabase, isRealtimeDbConfigured } from '../../services/firebase/firebaseConfig';
import { presenceSessionId, readPresenceOnce } from '../../services/firebase/presenceService';
import {
  LiveSyncLedger,
  applyRemoteChanges,
  buildLiveSeed,
  decodeLiveKey,
  projectFromLiveRoom,
  type LiveEntry,
  type LiveRoom,
} from '../../services/firebase/liveProjectDiff';
import type { Project } from '../../types';

// Live co-editing of an open cloud plan. Every change to `project` (drawing, moving, deleting,
// generated plans, image-to-walls…) is diffed per element and streamed to live/{projectId};
// changes from other editors are merged back in. Viewers receive changes but never send.
//
// Joining: if other people are already in the plan, we adopt the live copy (it has their unsaved
// work); if we're alone, the live copy is re-seeded from the plan we just loaded.

export type LiveSyncStatus = 'off' | 'connecting' | 'live' | 'viewing' | 'error';

const LOCAL_FLUSH_MS = 80;

interface Options {
  projectId: string | null;
  user: User | null;
  project: Project | null;
  setProject: (updater: (prev: Project | null) => Project | null) => void;
  loadedAtMs: number | null;
  onRemoteSave: (savedAtMs: number) => void;
}

export const useLiveProjectSync = ({ projectId, user, project, setProject, loadedAtMs, onRemoteSave }: Options): LiveSyncStatus => {
  const [status, setStatus] = useState<LiveSyncStatus>('off');
  const projectRef = useRef(project);
  projectRef.current = project;
  const setProjectRef = useRef(setProject);
  setProjectRef.current = setProject;
  const onRemoteSaveRef = useRef(onRemoteSave);
  onRemoteSaveRef.current = onRemoteSave;
  const loadedAtRef = useRef(loadedAtMs);
  loadedAtRef.current = loadedAtMs;

  // Set while a session is running.
  const sessionRef = useRef<{ flush: () => void; publishSave: (ms: number) => void } | null>(null);
  const uid = user?.uid || null;

  useEffect(() => {
    if (!projectId || !user || !isRealtimeDbConfigured) {
      setStatus('off');
      return;
    }
    let cancelled = false;
    const detachers: Array<() => void> = [];
    const ledger = new LiveSyncLedger();
    const by = presenceSessionId;
    let canWrite = false;
    let ready = false;
    let flushTimer: number | null = null;
    let warned = false;

    const db = getFirebaseDatabase();
    const liveRef = ref(db, `live/${projectId}`);

    // Remote changes are batched and applied in one state update per frame.
    let pendingUpserts = new Map<string, any>();
    let pendingRemovals = new Set<string>();
    let pendingMeta: Record<string, any> | null = null;
    let applyScheduled = false;
    const scheduleApply = () => {
      if (applyScheduled) return;
      applyScheduled = true;
      requestAnimationFrame(() => {
        applyScheduled = false;
        if (cancelled) return;
        const upserts = pendingUpserts;
        const removals = pendingRemovals;
        const meta = pendingMeta;
        pendingUpserts = new Map();
        pendingRemovals = new Set();
        pendingMeta = null;
        if (!upserts.size && !removals.size && !meta) return;
        setProjectRef.current(prev => (prev ? applyRemoteChanges(prev, upserts, removals, meta) : prev));
      });
    };

    const flush = () => {
      flushTimer = null;
      if (!ready || !canWrite || cancelled) return;
      const current = projectRef.current;
      if (!current) return;
      const updates = ledger.collectLocal(current as any, by);
      if (Object.keys(updates).length === 0) return;
      update(liveRef, updates).catch(error => {
        if (!warned) console.warn('[Live] Could not send your edit to collaborators:', error);
        warned = true;
      });
    };

    sessionRef.current = {
      flush: () => {
        if (flushTimer !== null) return;
        flushTimer = window.setTimeout(flush, LOCAL_FLUSH_MS);
      },
      publishSave: (ms: number) => {
        if (!ready || !canWrite) return;
        void set(ref(db, `live/${projectId}/savedAt`), ms).catch(() => undefined);
      },
    };

    const start = async () => {
      setStatus('connecting');
      let role: string | null = null;
      try {
        const res = await fetch('/api/share/live-access', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        role = (await res.json())?.role || null;
      } catch (error) {
        console.info('[Live] Live editing unavailable for this plan:', error);
        if (!cancelled) setStatus('error');
        return;
      }
      if (cancelled || !role) return;
      canWrite = role === 'owner' || role === 'editor';

      const [snapshot, peers] = await Promise.all([get(liveRef), readPresenceOnce(projectId, user.uid)]);
      if (cancelled) return;
      const room = (snapshot.val() || null) as LiveRoom | null;
      const roomHasData = !!(room && (room.meta || room.elements));
      const current = projectRef.current;

      if (peers.length > 0 && roomHasData && room) {
        // People are already editing: take their live copy, which may hold unsaved work.
        ledger.resetFromRoom(room);
        const joined = projectFromLiveRoom(room, (current || { elements: [] }) as any) as Project;
        setProjectRef.current(() => joined);
      } else if (canWrite && current) {
        // Alone: the plan we just loaded is the truth.
        ledger.resetFromProject(current as any);
        const seed = buildLiveSeed(current as any, by);
        try {
          await set(liveRef, { ...seed, seededAt: serverTimestamp(), savedAt: loadedAtRef.current ?? null });
        } catch (error) {
          console.warn('[Live] Could not start live editing:', error);
          if (!cancelled) setStatus('error');
          return;
        }
      } else {
        // A viewer on their own: keep the loaded plan, only follow changes from now on.
        ledger.resetFromRoom(room);
      }
      if (cancelled) return;

      const elementsRef = ref(db, `live/${projectId}/elements`);
      const onElement = (snap: any) => {
        const element = ledger.noteRemoteElement(String(snap.key), snap.val() as LiveEntry);
        if (!element) return;
        pendingRemovals.delete(element.id);
        pendingUpserts.set(element.id, element);
        scheduleApply();
      };
      const added = onChildAdded(elementsRef, onElement);
      const changed = onChildChanged(elementsRef, onElement);
      const removed = onChildRemoved(elementsRef, snap => {
        if (!ledger.noteRemoteRemoval(String(snap.key))) return;
        const id = decodeLiveKey(String(snap.key));
        pendingUpserts.delete(id);
        pendingRemovals.add(id);
        scheduleApply();
      });
      detachers.push(() => {
        off(elementsRef, 'child_added', added);
        off(elementsRef, 'child_changed', changed);
        off(elementsRef, 'child_removed', removed);
      });

      const metaRef = ref(db, `live/${projectId}/meta`);
      const metaHandler = onValue(metaRef, snap => {
        const meta = ledger.noteRemoteMeta(snap.val() as LiveEntry);
        if (!meta) return;
        pendingMeta = meta;
        scheduleApply();
      });
      detachers.push(() => off(metaRef, 'value', metaHandler));

      // Someone saved: move our save baseline so our next save isn't flagged as a conflict.
      const savedRef = ref(db, `live/${projectId}/savedAt`);
      const savedHandler = onValue(savedRef, snap => {
        const value = snap.val();
        if (typeof value === 'number' && (loadedAtRef.current == null || value > loadedAtRef.current)) {
          onRemoteSaveRef.current(value);
        }
      });
      detachers.push(() => off(savedRef, 'value', savedHandler));

      ready = true;
      setStatus(canWrite ? 'live' : 'viewing');
      flush(); // anything edited while we were connecting
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
  }, [projectId, uid]);

  // Every local change schedules a (throttled) diff against the live copy.
  useEffect(() => {
    sessionRef.current?.flush();
  }, [project]);

  // Our own saves are announced so collaborators' save baselines move too.
  useEffect(() => {
    if (loadedAtMs != null) sessionRef.current?.publishSave(loadedAtMs);
  }, [loadedAtMs]);

  return status;
};
