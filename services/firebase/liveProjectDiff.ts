// Pure helpers for live co-editing of a plan (no Firebase imports, so scripts/testLiveSync.mjs
// can exercise them directly).
//
// The live copy lives at live/{projectId}: `meta` holds every project field except the elements,
// and `elements/{key}` holds one element each, so two people editing different walls never
// overwrite each other. Values are JSON strings ({ j, by }) because Realtime Database keys and
// arrays can't represent every element faithfully. Conflicts on the same element: last write wins.

export interface LiveEntry {
  j: string;
  by: string;
}

export interface LiveRoom {
  meta?: LiveEntry | null;
  elements?: Record<string, LiveEntry> | null;
  savedAt?: number | null;
  seededAt?: number | null;
}

interface ElementLike {
  id: string;
  [key: string]: any;
}

interface ProjectLike<E extends ElementLike = ElementLike> {
  elements: E[];
  [key: string]: any;
}

// Realtime Database keys can't contain . # $ [ ] or /; escape them (and %) reversibly.
export const encodeLiveKey = (id: string): string =>
  String(id).replace(/[.#$\[\]\/%]/g, ch => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);

export const decodeLiveKey = (key: string): string =>
  String(key).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

// Anything bigger (e.g. an embedded image) is left to the normal Save instead of being streamed.
export const MAX_LIVE_ENTRY_CHARS = 900_000;

export const projectMetaJson = (project: ProjectLike): string => {
  const { elements: _elements, ...meta } = project;
  return JSON.stringify(meta);
};

// Tracks what the live copy currently holds, so local changes can be diffed against it and
// remote changes that we already have (including our own echo) are ignored.
export class LiveSyncLedger {
  readonly elements = new Map<string, string>();
  private readonly refs = new Map<string, unknown>();
  meta: string | null = null;
  readonly oversized = new Set<string>();

  // Baseline = this project (we just seeded the live copy from it).
  resetFromProject(project: ProjectLike) {
    this.elements.clear();
    this.refs.clear();
    this.oversized.clear();
    for (const element of project.elements || []) {
      if (!element?.id) continue;
      const json = JSON.stringify(element);
      if (json.length > MAX_LIVE_ENTRY_CHARS) {
        this.oversized.add(element.id);
        continue;
      }
      this.elements.set(element.id, json);
      this.refs.set(element.id, element);
    }
    const meta = projectMetaJson(project);
    this.meta = meta.length > MAX_LIVE_ENTRY_CHARS ? null : meta;
  }

  // Baseline = whatever the live copy holds.
  resetFromRoom(room: LiveRoom | null | undefined) {
    this.elements.clear();
    this.refs.clear();
    this.oversized.clear();
    for (const [key, entry] of Object.entries(room?.elements || {})) {
      if (entry && typeof entry.j === 'string') this.elements.set(decodeLiveKey(key), entry.j);
    }
    this.meta = typeof room?.meta?.j === 'string' ? room.meta.j : null;
  }

  // Local project -> the multi-path update to send (empty object when nothing changed).
  collectLocal(project: ProjectLike, by: string): Record<string, LiveEntry | null> {
    const updates: Record<string, LiveEntry | null> = {};
    const present = new Set<string>();
    for (const element of project.elements || []) {
      if (!element?.id) continue;
      present.add(element.id);
      if (this.refs.get(element.id) === element) continue; // same object: unchanged
      const json = JSON.stringify(element);
      this.refs.set(element.id, element);
      if (this.elements.get(element.id) === json) continue;
      if (json.length > MAX_LIVE_ENTRY_CHARS) {
        this.oversized.add(element.id);
        continue;
      }
      this.oversized.delete(element.id);
      this.elements.set(element.id, json);
      updates[`elements/${encodeLiveKey(element.id)}`] = { j: json, by };
    }
    for (const id of Array.from(this.elements.keys())) {
      if (present.has(id)) continue;
      this.elements.delete(id);
      this.refs.delete(id);
      updates[`elements/${encodeLiveKey(id)}`] = null;
    }
    const meta = projectMetaJson(project);
    if (meta !== this.meta && meta.length <= MAX_LIVE_ENTRY_CHARS) {
      this.meta = meta;
      updates.meta = { j: meta, by };
    }
    return updates;
  }

  // A remote element arrived; returns the parsed element when it's news to us.
  noteRemoteElement<E extends ElementLike>(key: string, entry: LiveEntry | null | undefined): E | null {
    if (!entry || typeof entry.j !== 'string') return null;
    const id = decodeLiveKey(key);
    if (this.elements.get(id) === entry.j) return null; // already have it (incl. our own echo)
    let parsed: E;
    try {
      parsed = JSON.parse(entry.j);
    } catch {
      return null;
    }
    if (!parsed || parsed.id !== id) return null;
    this.elements.set(id, entry.j);
    this.refs.set(id, parsed);
    return parsed;
  }

  // A remote removal arrived; true when we still had the element.
  noteRemoteRemoval(key: string): boolean {
    const id = decodeLiveKey(key);
    if (!this.elements.has(id)) return false;
    this.elements.delete(id);
    this.refs.delete(id);
    return true;
  }

  noteRemoteMeta(entry: LiveEntry | null | undefined): Record<string, any> | null {
    if (!entry || typeof entry.j !== 'string' || entry.j === this.meta) return null;
    try {
      const parsed = JSON.parse(entry.j);
      this.meta = entry.j;
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
}

// Seed payload for live/{projectId}: the whole plan.
export const buildLiveSeed = (project: ProjectLike, by: string): { meta: LiveEntry | null; elements: Record<string, LiveEntry> } => {
  const elements: Record<string, LiveEntry> = {};
  for (const element of project.elements || []) {
    if (!element?.id) continue;
    const json = JSON.stringify(element);
    if (json.length > MAX_LIVE_ENTRY_CHARS) continue;
    elements[encodeLiveKey(element.id)] = { j: json, by };
  }
  const meta = projectMetaJson(project);
  return { meta: meta.length <= MAX_LIVE_ENTRY_CHARS ? { j: meta, by } : null, elements };
};

// Merge remote changes into a project, keeping the local element order.
export const applyRemoteChanges = <P extends ProjectLike>(
  project: P,
  upserts: Map<string, ElementLike>,
  removals: Set<string>,
  meta: Record<string, any> | null,
): P => {
  const seen = new Set<string>();
  const elements: ElementLike[] = [];
  for (const element of project.elements || []) {
    if (removals.has(element.id)) continue;
    elements.push(upserts.get(element.id) || element);
    seen.add(element.id);
  }
  upserts.forEach((element, id) => {
    if (!seen.has(id) && !removals.has(id)) elements.push(element);
  });
  const base: Record<string, any> = meta ? { ...meta } : { ...project };
  delete base.elements;
  return { ...base, elements } as P;
};

// Build a full project from the live copy (when joining people who are already editing).
export const projectFromLiveRoom = <P extends ProjectLike>(room: LiveRoom, fallback: P): P => {
  let meta: Record<string, any> | null = null;
  try {
    meta = room.meta?.j ? JSON.parse(room.meta.j) : null;
  } catch {
    meta = null;
  }
  const base: Record<string, any> = meta || { ...fallback };
  delete base.elements;
  const elements: ElementLike[] = [];
  for (const entry of Object.values(room.elements || {})) {
    try {
      const parsed = JSON.parse(entry.j);
      if (parsed?.id) elements.push(parsed);
    } catch {
      // skip a corrupt entry rather than refusing the whole plan
    }
  }
  return { ...base, elements } as P;
};
