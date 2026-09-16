import { importTs, check, finish } from './bundleForTest.mjs';

// Presence publishing policy, driven by an injected clock: the cost guardrails live here.

const {
  CursorThrottle, IntervalThrottle,
  CURSOR_MIN_INTERVAL_MS, CURSOR_IDLE_MS, PEER_STALE_MS,
  isPeerStale, colorForUid, initialsFor, sameView, describeView,
} = await importTs('services/firebase/presenceThrottle.ts');

let now = 1_000_000;
const clock = () => now;
const advance = ms => { now += ms; };

// --- cursor throttle ----------------------------------------------------------------------------
const throttle = new CursorThrottle(clock);
check(throttle.next({ x: 1, y: 1 }).kind === 'publish', 'First movement publishes immediately');
check(throttle.next({ x: 1.5, y: 1 }).kind === 'skip', 'A second move inside the interval is dropped');
advance(CURSOR_MIN_INTERVAL_MS);
check(throttle.next({ x: 2, y: 1 }).kind === 'publish', `Publishes again after ${CURSOR_MIN_INTERVAL_MS}ms`);
advance(CURSOR_MIN_INTERVAL_MS);
check(throttle.next({ x: 2.001, y: 1 }).kind === 'skip', 'A sub-threshold move is not worth a write');

// Sitting still: one null write, then silence.
advance(CURSOR_IDLE_MS);
const idle = throttle.next({ x: 2.001, y: 1 });
check(idle.kind === 'publish' && idle.cursor === null, 'Going idle clears the cursor once');
advance(CURSOR_IDLE_MS);
check(throttle.next({ x: 2.001, y: 1 }).kind === 'skip', 'Staying idle writes nothing more');
advance(CURSOR_MIN_INTERVAL_MS);
check(throttle.next({ x: 9, y: 9 }).kind === 'publish', 'Moving again resumes publishing');

// Leaving the canvas.
check(throttle.next(null).kind === 'publish', 'Leaving the canvas clears the cursor');
check(throttle.next(null).kind === 'skip', 'Leaving twice writes nothing more');

// Hidden tabs cost nothing.
const hidden = new CursorThrottle(clock);
hidden.next({ x: 1, y: 1 });
check(hidden.setHidden(true).kind === 'idle', 'Hiding the tab clears the cursor');
advance(CURSOR_MIN_INTERVAL_MS * 10);
check(hidden.next({ x: 5, y: 5 }).kind === 'skip', 'A hidden tab publishes nothing');
hidden.setHidden(false);
advance(CURSOR_MIN_INTERVAL_MS);
check(hidden.next({ x: 6, y: 6 }).kind === 'publish', 'Becoming visible resumes publishing');

// Rate ceiling over a burst of 1000 moves in one second.
const burst = new CursorThrottle(clock);
let published = 0;
for (let i = 0; i < 1000; i++) {
  advance(1);
  if (burst.next({ x: i, y: i }).kind === 'publish') published += 1;
}
check(published <= 16, `A 1s burst of 1000 moves publishes at most ~15 times (got ${published})`);

// --- interval throttle (camera) -------------------------------------------------------------------
const camera = new IntervalThrottle(125, clock);
check(camera.shouldSend() === true, 'First camera frame is sent');
advance(100);
check(camera.shouldSend() === false, 'Camera frames inside the interval are dropped');
advance(30);
check(camera.shouldSend() === true, 'Camera frames resume after the interval');

// --- peers ------------------------------------------------------------------------------------------
check(isPeerStale(null) === true, 'A peer with no heartbeat is stale');
check(isPeerStale(Date.now()) === false, 'A fresh heartbeat is not stale');
check(isPeerStale(Date.now() - PEER_STALE_MS - 1) === true, `A peer quiet for over ${PEER_STALE_MS}ms is dropped`);

check(colorForUid('abc') === colorForUid('abc'), 'Peer colour is stable for a user');
check(typeof colorForUid('abc') === 'string' && colorForUid('abc').startsWith('#'), 'Peer colour is a hex colour');
check(initialsFor('Naqi Mim Ejaz') === 'NM' && initialsFor('') === '?', 'Avatar initials');

const plan = { viewMode: '2D', drawingView: 'plan', activeLevelId: 'l1' };
check(sameView(plan, { ...plan }) === true, 'Same view matches');
check(sameView(plan, { ...plan, activeLevelId: 'l2' }) === false, 'A different level is a different view');
check(sameView(plan, { ...plan, drawingView: 'elevation-n' }) === false, 'An elevation is a different view');
check(sameView(plan, null) === false, 'A missing view never matches');

check(describeView({ viewMode: '3D' }) === '3D view', 'describeView: 3D');
check(describeView(plan, 'Level 1') === 'Plan · Level 1', 'describeView: plan with level name');
check(describeView({ ...plan, drawingView: 'elevation-n' }) === 'Elevation N', 'describeView: elevation');

finish();
