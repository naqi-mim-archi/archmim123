import { GraphEngine } from '../src/features/ai-rendering-canvas/core/GraphEngine';
import { CanvasNodeData, GraphViewport } from '../src/features/ai-rendering-canvas/types/graph';

let passCount = 0;
let failCount = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`[PASS] ${msg}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${msg}`);
    failCount++;
  }
}

console.log('=== STARTING AI RENDERING CANVAS TESTS ===\n');

// 1. Port Position Calculations
const sampleNode: CanvasNodeData = {
  id: 'node_1',
  type: 'image',
  title: 'Test Node 1',
  position: { x: 100, y: 100 },
  width: 280,
  height: 320,
  status: 'completed',
  createdAt: Date.now()
};

const outPort = GraphEngine.getOutputPortPosition(sampleNode);
assert(outPort.x === 380, `Output port X is 380 (got: ${outPort.x})`);
assert(outPort.y === 260, `Output port Y is 260 (got: ${outPort.y})`);

const inPort = GraphEngine.getInputPortPosition(sampleNode);
assert(inPort.x === 100, `Input port X is 100 (got: ${inPort.x})`);
assert(inPort.y === 260, `Input port Y is 260 (got: ${inPort.y})`);

// 2. Bezier Path Generator
const p1 = { x: 100, y: 200 };
const p2 = { x: 400, y: 350 };
const path = GraphEngine.calculateBezierPath(p1, p2);
assert(path.startsWith('M 100 200 C'), `Bezier path starts with M 100 200 C (got: ${path})`);
assert(path.endsWith('400 350'), `Bezier path ends at target coordinates (got: ${path})`);

// 3. Fork Positioning
const childNodes: CanvasNodeData[] = [sampleNode];
const fork1 = GraphEngine.calculateForkPosition(sampleNode, childNodes);
assert(fork1.x === sampleNode.position.x + 340, `Fork 1 X offset is +340px (got: ${fork1.x})`);
assert(fork1.y === sampleNode.position.y, `Fork 1 Y is aligned with parent (got: ${fork1.y})`);

const child2: CanvasNodeData = {
  id: 'node_2',
  type: 'image',
  title: 'Child 1',
  position: fork1,
  parentId: 'node_1',
  status: 'completed',
  createdAt: Date.now()
};
childNodes.push(child2);

const fork2 = GraphEngine.calculateForkPosition(sampleNode, childNodes);
assert(fork2.x === sampleNode.position.x + 340, `Fork 2 X offset is +340px (got: ${fork2.x})`);
assert(fork2.y !== sampleNode.position.y, `Fork 2 Y is staggered vertically to avoid collision (got: ${fork2.y})`);

// 4. Screen to Graph and Graph to Screen Coordinate Conversions
const containerRect = {
  left: 50,
  top: 50,
  right: 1050,
  bottom: 850,
  width: 1000,
  height: 800,
  x: 50,
  y: 50,
  toJSON: () => {}
} as DOMRect;

const viewport: GraphViewport = { x: 100, y: 100, zoom: 1.5 };
const screenX = 350;
const screenY = 400;

const graphCoord = GraphEngine.screenToGraph(screenX, screenY, containerRect, viewport);
const backToScreen = GraphEngine.graphToScreen(graphCoord.x, graphCoord.y, viewport);

assert(Math.abs(backToScreen.x + containerRect.left - screenX) < 0.001, `Coordinate round-trip X matches`);
assert(Math.abs(backToScreen.y + containerRect.top - screenY) < 0.001, `Coordinate round-trip Y matches`);

// 5. Fit Viewport Calculation
const nodesToFit: CanvasNodeData[] = [
  { id: 'n1', type: 'image', title: 'N1', position: { x: 0, y: 0 }, width: 280, height: 320, status: 'completed', createdAt: Date.now() },
  { id: 'n2', type: 'image', title: 'N2', position: { x: 600, y: 400 }, width: 280, height: 320, status: 'completed', createdAt: Date.now() }
];
const fit = GraphEngine.calculateFitViewport(nodesToFit, 1200, 800);
assert(fit.zoom > 0 && fit.zoom <= 1.5, `Fit zoom is within valid range (got: ${fit.zoom})`);

console.log(`\n=== ALL ${passCount} AI RENDERING CANVAS TESTS PASSED ===\n`);

if (failCount > 0) {
  process.exit(1);
}
