import { importTs, check, finish } from './bundleForTest.mjs';

// Live co-editing: per-element diffing, echo suppression and merging (two simulated editors
// exchanging updates through an in-memory copy of live/{projectId}).

const {
  LiveSyncLedger, buildLiveSeed, applyRemoteChanges, projectFromLiveRoom,
  encodeLiveKey, decodeLiveKey, MAX_LIVE_ENTRY_CHARS,
} = await importTs('services/firebase/liveProjectDiff.ts');

const wall = (id, x = 0) => ({ id, type: 'wall', levelId: 'L1', start: { x, y: 0 }, end: { x: x + 100, y: 0 } });
const plan = (elements, extra = {}) => ({ name: 'Plan', levels: [{ id: 'L1', name: 'Ground' }], elements, ...extra });

// --- keys ------------------------------------------------------------------------------------
for (const id of ['wall-1', 'a.b', 'x/y', 'we#ird$[id]', '50%']) {
  const key = encodeLiveKey(id);
  check(!/[.#$\[\]\/]/.test(key), `Key for "${id}" is a legal database key`);
  check(decodeLiveKey(key) === id, `Key for "${id}" round-trips`);
}

// --- in-memory room + multi-path update --------------------------------------------------------
const room = { meta: null, elements: {} };
const applyUpdate = updates => {
  const events = [];
  for (const [path, value] of Object.entries(updates)) {
    if (path === 'meta') { room.meta = value; events.push({ type: 'meta', value }); continue; }
    const key = path.slice('elements/'.length);
    if (value === null) { delete room.elements[key]; events.push({ type: 'removed', key }); }
    else { room.elements[key] = value; events.push({ type: 'changed', key, value }); }
  }
  return events;
};
// Deliver events to a client the way the hook does.
const deliver = (client, events) => {
  const upserts = new Map(); const removals = new Set(); let meta = null;
  for (const event of events) {
    if (event.type === 'meta') meta = client.ledger.noteRemoteMeta(event.value) || meta;
    if (event.type === 'changed') { const el = client.ledger.noteRemoteElement(event.key, event.value); if (el) upserts.set(el.id, el); }
    if (event.type === 'removed' && client.ledger.noteRemoteRemoval(event.key)) removals.add(decodeLiveKey(event.key));
  }
  if (upserts.size || removals.size || meta) client.project = applyRemoteChanges(client.project, upserts, removals, meta);
  return { upserts: upserts.size, removals: removals.size, meta: !!meta };
};

// Alice opens alone and seeds.
const alice = { by: 'tabA', ledger: new LiveSyncLedger(), project: plan([wall('w1'), wall('w2', 200)]) };
alice.ledger.resetFromProject(alice.project);
Object.assign(room, buildLiveSeed(alice.project, alice.by));
check(Object.keys(room.elements).length === 2 && room.meta, 'Seed holds every element and the meta');
check(Object.keys(alice.ledger.collectLocal(alice.project, alice.by)).length === 0, 'Nothing to send right after seeding');

// Bob joins while Alice is there: adopts the live copy.
const bob = { by: 'tabB', ledger: new LiveSyncLedger(), project: null };
bob.ledger.resetFromRoom(room);
bob.project = projectFromLiveRoom(room, plan([]));
check(bob.project.elements.length === 2 && bob.project.name === 'Plan', 'Joiner gets the plan from the live copy');
check(Object.keys(bob.ledger.collectLocal(bob.project, bob.by)).length === 0, 'Joiner has nothing to send after adopting');

// Bob draws a line.
bob.project = { ...bob.project, elements: [...bob.project.elements, { id: 'line1', type: 'line', points: [1, 2, 3] }] };
let updates = bob.ledger.collectLocal(bob.project, bob.by);
check(Object.keys(updates).length === 1 && updates['elements/line1'], 'Adding one line sends exactly one element');
let events = applyUpdate(updates);
check(deliver(bob, events).upserts === 0, "Bob's own echo is ignored");
let got = deliver(alice, events);
check(got.upserts === 1 && alice.project.elements.some(e => e.id === 'line1'), 'Alice receives the new line');
check(Object.keys(alice.ledger.collectLocal(alice.project, alice.by)).length === 0, 'Receiving does not echo back');

// Both edit different walls at once: nobody loses anything.
alice.project = { ...alice.project, elements: alice.project.elements.map(e => (e.id === 'w1' ? { ...e, thickness: 30 } : e)) };
bob.project = { ...bob.project, elements: bob.project.elements.map(e => (e.id === 'w2' ? { ...e, height: 320 } : e)) };
const fromAlice = applyUpdate(alice.ledger.collectLocal(alice.project, alice.by));
const fromBob = applyUpdate(bob.ledger.collectLocal(bob.project, bob.by));
deliver(alice, fromBob); deliver(bob, fromAlice);
const find = (p, id) => p.elements.find(e => e.id === id);
check(find(alice.project, 'w1').thickness === 30 && find(alice.project, 'w2').height === 320, 'Alice has both edits');
check(find(bob.project, 'w1').thickness === 30 && find(bob.project, 'w2').height === 320, 'Bob has both edits');
check(JSON.stringify(alice.project.elements.map(e => e.id)) === JSON.stringify(bob.project.elements.map(e => e.id)), 'Element order stays consistent');

// Same wall: last write wins, and both end up identical.
alice.project = { ...alice.project, elements: alice.project.elements.map(e => (e.id === 'w1' ? { ...e, thickness: 10 } : e)) };
const first = applyUpdate(alice.ledger.collectLocal(alice.project, alice.by));
bob.project = { ...bob.project, elements: bob.project.elements.map(e => (e.id === 'w1' ? { ...e, thickness: 99 } : e)) };
const second = applyUpdate(bob.ledger.collectLocal(bob.project, bob.by));
deliver(alice, first); deliver(alice, second); deliver(bob, first); deliver(bob, second);
check(find(alice.project, 'w1').thickness === 99 && find(bob.project, 'w1').thickness === 99, 'Same element: last write wins on both sides');

// Delete.
bob.project = { ...bob.project, elements: bob.project.elements.filter(e => e.id !== 'w2') };
updates = bob.ledger.collectLocal(bob.project, bob.by);
check(updates['elements/w2'] === null, 'Deleting sends a removal');
got = deliver(alice, applyUpdate(updates));
check(got.removals === 1 && !find(alice.project, 'w2'), 'Alice sees the deletion');

// A generated plan replaces everything (e.g. image-to-walls on a fresh canvas).
alice.project = { ...alice.project, elements: [wall('g1'), wall('g2', 50), wall('g3', 90)] };
updates = alice.ledger.collectLocal(alice.project, alice.by);
got = deliver(bob, applyUpdate(updates));
check(bob.project.elements.map(e => e.id).sort().join() === 'g1,g2,g3', 'A whole generated plan reaches the other editor');

// Meta (levels, name) syncs as a unit.
alice.project = { ...alice.project, name: 'Renamed', levels: [...alice.project.levels, { id: 'L2', name: 'First' }] };
updates = alice.ledger.collectLocal(alice.project, alice.by);
check(updates.meta && Object.keys(updates).length === 1, 'Adding a level sends only the meta');
got = deliver(bob, applyUpdate(updates));
check(got.meta && bob.project.name === 'Renamed' && bob.project.levels.length === 2 && bob.project.elements.length === 3, 'Bob gets the new level and keeps elements');

// Identity shortcut: unchanged objects are not re-serialised, and nothing is sent.
check(Object.keys(bob.ledger.collectLocal(bob.project, bob.by)).length === 0, 'Steady state sends nothing');

// Oversized element is skipped rather than breaking the stream.
const huge = { id: 'img', type: 'image', data: 'x'.repeat(MAX_LIVE_ENTRY_CHARS + 10) };
updates = alice.ledger.collectLocal({ ...alice.project, elements: [...alice.project.elements, huge] }, alice.by);
check(!updates['elements/img'] && alice.ledger.oversized.has('img'), 'Oversized element is left to the normal Save');

// Corrupt / foreign entries are ignored.
check(bob.ledger.noteRemoteElement('zz', { j: '{not json', by: 'x' }) === null, 'Corrupt entry ignored');
check(bob.ledger.noteRemoteElement('zz', { j: JSON.stringify({ id: 'other' }), by: 'x' }) === null, 'Entry whose id does not match its key is ignored');


// --- render session graph (nodes + edges under their own children) ----------------------------
const { rewriteNodeImageRefs, collectDataUrls } = await importTs('services/firebase/renderSessionSerialize.ts');

const gNode = (id, x) => ({ id, type: 'image', title: 'Render Node', position: { x, y: 0 }, status: 'idle' });
const room2 = { nodes: {}, edges: {} };
const applyGraph = updates => {
  const events = [];
  for (const [path, value] of Object.entries(updates)) {
    const [child, key] = path.split('/');
    if (value === null) { delete room2[child][key]; events.push({ child, type: 'removed', key }); }
    else { room2[child][key] = value; events.push({ child, type: 'changed', key, value }); }
  }
  return events;
};
const deliverGraph = (client, events) => {
  const out = { nodes: [], removedNodeIds: [], edges: [], removedEdgeIds: [] };
  for (const event of events) {
    const ledger = event.child === 'nodes' ? client.nodes : client.edges;
    if (event.type === 'changed') {
      const parsed = ledger.noteRemoteElement(event.key, event.value);
      if (parsed) (event.child === 'nodes' ? out.nodes : out.edges).push(parsed);
    } else if (ledger.noteRemoteRemoval(event.key)) {
      (event.child === 'nodes' ? out.removedNodeIds : out.removedEdgeIds).push(decodeLiveKey(event.key));
    }
  }
  return out;
};

const ann = { by: 'tabA', nodes: new LiveSyncLedger('nodes'), edges: new LiveSyncLedger('edges'), graph: { nodes: [gNode('n1', 0), gNode('n2', 400)], edges: [] } };
const ben = { by: 'tabB', nodes: new LiveSyncLedger('nodes'), edges: new LiveSyncLedger('edges'), graph: { nodes: [], edges: [] } };
ann.nodes.resetFromProject({ elements: ann.graph.nodes });
ann.edges.resetFromProject({ elements: ann.graph.edges });
Object.assign(room2, { nodes: buildLiveSeed({ elements: ann.graph.nodes }, ann.by).elements, edges: {} });
ben.nodes.resetFromRoom(room2); ben.edges.resetFromRoom(room2);
ben.graph.nodes = Object.values(room2.nodes).map(entry => JSON.parse(entry.j));
check(ben.graph.nodes.length === 2, 'Joiner picks up the render graph');

// Ann drags a node.
ann.graph.nodes = ann.graph.nodes.map(n => (n.id === 'n1' ? { ...n, position: { x: 250, y: 120 } } : n));
let g = deliverGraph(ben, applyGraph(ann.nodes.collectLocal({ elements: ann.graph.nodes }, ann.by)));
check(g.nodes.length === 1 && g.nodes[0].position.x === 250, 'A node drag reaches the other person');

// Ben connects the two nodes.
ben.graph.edges = [{ id: 'e1', sourceNodeId: 'n1', targetNodeId: 'n2' }];
g = deliverGraph(ann, applyGraph(ben.edges.collectLocal({ elements: ben.graph.edges }, ben.by)));
check(g.edges.length === 1 && g.edges[0].sourceNodeId === 'n1', 'A new connection reaches the other person');
check(Object.keys(ann.nodes.collectLocal({ elements: ann.graph.nodes }, ann.by)).length === 0, 'Nodes and edges do not interfere');

// Ben deletes a node.
ben.graph.nodes = ben.graph.nodes.filter(n => n.id !== 'n2');
g = deliverGraph(ann, applyGraph(ben.nodes.collectLocal({ elements: ben.graph.nodes }, ben.by)));
check(g.removedNodeIds.join() === 'n2', 'A deleted node reaches the other person');

// A finished render: the picture goes to Storage, only its link travels.
const bigImage = `data:image/png;base64,${'Q'.repeat(2_000_000)}`;
const rendered = [{ ...gNode('n1', 250), imageUrl: bigImage, outputs: [{ id: 'out_0', url: bigImage, type: 'image' }] }];
check(collectDataUrls(rendered).length === 1, 'The same picture is found once, not per slot');
const wire = rewriteNodeImageRefs(rendered, new Map([[bigImage, 'https://storage/img.png']]));
const wireJson = JSON.stringify(wire[0]);
check(!wireJson.includes('data:image'), 'No image data goes through the database');
check(wireJson.length < 2000, 'The node on the wire is small');
const updates2 = ann.nodes.collectLocal({ elements: wire }, ann.by);
g = deliverGraph(ben, applyGraph(updates2));
check(g.nodes[0].imageUrl === 'https://storage/img.png' && g.nodes[0].outputs[0].url === 'https://storage/img.png', 'The render reaches the other person as a link');

finish();
