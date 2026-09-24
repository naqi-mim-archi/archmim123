// Pure throttle policy for presence publishing, with an injected clock so it can be tested.
// Cursors are the hot path: 15 Hz, only when the pointer actually moved, paused when idle or hidden.

export const CURSOR_MIN_INTERVAL_MS = 66; // ~15 Hz
export const CURSOR_MIN_DELTA = 0.02; // world units
export const CURSOR_IDLE_MS = 5000;
export const CAMERA_MIN_INTERVAL_MS = 125; // ~8 Hz
export const HEARTBEAT_MS = 15000;
export const PEER_STALE_MS = 60000;

export interface Point {
  x: number;
  y: number;
}

export type ThrottleDecision =
  | { kind: 'skip' }
  | { kind: 'publish'; cursor: Point | null }
  | { kind: 'idle' }; // write cursor: null once, then stay quiet

export class CursorThrottle {
  private lastSentAt = 0;
  private lastSent: Point | null = null; // what peers currently see
  private lastSeen: Point | null = null; // last position we looked at (movement is measured against this)
  private lastMovedAt = 0;
  private idleSent = false;
  private hidden = false;

  constructor(private readonly now: () => number = () => Date.now()) {}

  setHidden(hidden: boolean): ThrottleDecision {
    this.hidden = hidden;
    if (!hidden) {
      this.idleSent = false;
      this.lastMovedAt = this.now();
      return { kind: 'skip' };
    }
    if (this.lastSent === null && this.idleSent) return { kind: 'skip' };
    this.lastSent = null;
    this.idleSent = true;
    return { kind: 'idle' };
  }

  // Called with the latest pointer position (or null when the pointer left the canvas).
  next(pending: Point | null): ThrottleDecision {
    const now = this.now();

    if (pending === null) {
      this.lastSeen = null;
      if (this.lastSent === null) return { kind: 'skip' };
      this.lastSent = null;
      this.idleSent = true;
      return { kind: 'publish', cursor: null };
    }

    if (this.hidden) return { kind: 'skip' };

    const moved = !this.lastSeen
      || Math.abs(pending.x - this.lastSeen.x) >= CURSOR_MIN_DELTA
      || Math.abs(pending.y - this.lastSeen.y) >= CURSOR_MIN_DELTA;
    this.lastSeen = pending;

    if (moved) this.lastMovedAt = now;

    if (!moved) {
      // Stationary for a while: tell peers once, then stop writing entirely.
      if (!this.idleSent && now - this.lastMovedAt >= CURSOR_IDLE_MS) {
        this.idleSent = true;
        this.lastSent = null;
        return { kind: 'publish', cursor: null };
      }
      return { kind: 'skip' };
    }

    if (now - this.lastSentAt < CURSOR_MIN_INTERVAL_MS) return { kind: 'skip' };

    this.lastSentAt = now;
    this.lastSent = pending;
    this.idleSent = false;
    return { kind: 'publish', cursor: pending };
  }
}

export class IntervalThrottle {
  private lastSentAt = 0;
  constructor(private readonly intervalMs: number, private readonly now: () => number = () => Date.now()) {}
  shouldSend(): boolean {
    const now = this.now();
    if (now - this.lastSentAt < this.intervalMs) return false;
    this.lastSentAt = now;
    return true;
  }
}

export const isPeerStale = (lastActive: number | null | undefined, now = Date.now()): boolean =>
  !lastActive || now - lastActive > PEER_STALE_MS;

// Stable per-user colour, so the cursor, avatar and share list all agree.
export const PRESENCE_COLORS = [
  '#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed',
  '#0891b2', '#dc2626', '#65a30d', '#c026d3', '#0284c7',
];

export const colorForUid = (uid: string): string => {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) hash = (Math.imul(hash, 31) + uid.charCodeAt(i)) >>> 0;
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length];
};

export const initialsFor = (name: string): string =>
  String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('') || '?';

export interface PresenceView {
  viewMode: string;
  drawingView: string;
  activeLevelId: string;
}

export const sameView = (a: PresenceView | null | undefined, b: PresenceView | null | undefined): boolean =>
  !!a && !!b && a.viewMode === b.viewMode && a.drawingView === b.drawingView && a.activeLevelId === b.activeLevelId;

export const describeView = (view: PresenceView | null | undefined, levelName?: string): string => {
  if (!view) return 'Somewhere else';
  if (view.viewMode === 'render') return 'Render canvas';
  if (view.viewMode === '3D') return '3D view';
  if (view.drawingView && view.drawingView.startsWith('elevation-')) {
    const direction = view.drawingView.split('-')[1]?.toUpperCase();
    return `Elevation ${direction}`;
  }
  return levelName ? `Plan · ${levelName}` : 'Plan';
};
