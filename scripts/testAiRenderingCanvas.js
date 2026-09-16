// src/features/ai-rendering-canvas/core/GraphEngine.ts
var DEFAULT_NODE_WIDTH = 280;
var DEFAULT_NODE_HEIGHT = 320;
var DEFAULT_ACTION_NODE_HEIGHT = 160;
var GraphEngine = class {
  /**
   * Calculates the output port position on the right edge of the node.
   */
  static getOutputPortPosition(node) {
    const width = node.width || DEFAULT_NODE_WIDTH;
    const height = node.height || (node.type === "action" ? DEFAULT_ACTION_NODE_HEIGHT : DEFAULT_NODE_HEIGHT);
    return {
      x: node.position.x + width,
      y: node.position.y + height / 2
    };
  }
  /**
   * Calculates the input port position on the left edge of the node.
   */
  static getInputPortPosition(node) {
    const height = node.height || (node.type === "action" ? DEFAULT_ACTION_NODE_HEIGHT : DEFAULT_NODE_HEIGHT);
    return {
      x: node.position.x,
      y: node.position.y + height / 2
    };
  }
  /**
   * Generates a sleek cubic Bezier SVG path between two coordinates (left-to-right flow).
   */
  static calculateBezierPath(p12, p22) {
    const dx = Math.abs(p22.x - p12.x);
    const curvature = Math.max(dx * 0.5, 60);
    const c1x = p12.x + curvature;
    const c1y = p12.y;
    const c2x = p22.x - curvature;
    const c2y = p22.y;
    return `M ${p12.x} ${p12.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p22.x} ${p22.y}`;
  }
  /**
   * Calculates optimal auto-layout position for a new forked/child node to avoid overlapping.
   */
  static calculateForkPosition(parentNode, existingNodes, horizontalOffset = 340, verticalSpacing = 340) {
    const targetX = parentNode.position.x + horizontalOffset;
    const siblings = existingNodes.filter((n) => n.parentId === parentNode.id);
    const siblingIndex = siblings.length;
    let targetY = parentNode.position.y;
    if (siblingIndex > 0) {
      const isEven = siblingIndex % 2 === 0;
      const offsetMultiplier = Math.ceil(siblingIndex / 2);
      targetY = isEven ? parentNode.position.y + offsetMultiplier * verticalSpacing : parentNode.position.y - offsetMultiplier * verticalSpacing;
    }
    return { x: targetX, y: targetY };
  }
  /**
   * Converts screen pixel coordinates to canvas graph space considering pan and zoom.
   */
  static screenToGraph(screenX2, screenY2, containerRect2, viewport2) {
    const relX = screenX2 - containerRect2.left;
    const relY = screenY2 - containerRect2.top;
    return {
      x: (relX - viewport2.x) / viewport2.zoom,
      y: (relY - viewport2.y) / viewport2.zoom
    };
  }
  /**
   * Converts canvas graph coordinates to screen coordinates.
   */
  static graphToScreen(graphX, graphY, viewport2) {
    return {
      x: graphX * viewport2.zoom + viewport2.x,
      y: graphY * viewport2.zoom + viewport2.y
    };
  }
  /**
   * Fits all nodes cleanly within the visible viewport.
   */
  static calculateFitViewport(nodes, containerWidth, containerHeight, padding = 80) {
    if (nodes.length === 0) {
      return { x: containerWidth / 2 - 150, y: containerHeight / 2 - 150, zoom: 1 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of nodes) {
      const w = node.width || DEFAULT_NODE_WIDTH;
      const h = node.height || DEFAULT_NODE_HEIGHT;
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + w);
      maxY = Math.max(maxY, node.position.y + h);
    }
    const graphWidth = maxX - minX + padding * 2;
    const graphHeight = maxY - minY + padding * 2;
    const zoomX = containerWidth / graphWidth;
    const zoomY = containerHeight / graphHeight;
    const zoom = Math.min(Math.max(Math.min(zoomX, zoomY), 0.25), 1.5);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const x = containerWidth / 2 - centerX * zoom;
    const y = containerHeight / 2 - centerY * zoom;
    return { x, y, zoom };
  }
};

// scripts/testAiRenderingCanvas.ts
var passCount = 0;
var failCount = 0;
function assert(condition, msg) {
  if (condition) {
    console.log(`[PASS] ${msg}`);
    passCount++;
  } else {
    console.error(`[FAIL] ${msg}`);
    failCount++;
  }
}
console.log("=== STARTING AI RENDERING CANVAS TESTS ===\n");
var sampleNode = {
  id: "node_1",
  type: "image",
  title: "Test Node 1",
  position: { x: 100, y: 100 },
  width: 280,
  height: 320,
  status: "completed",
  createdAt: Date.now()
};
var outPort = GraphEngine.getOutputPortPosition(sampleNode);
assert(outPort.x === 380, `Output port X is 380 (got: ${outPort.x})`);
assert(outPort.y === 260, `Output port Y is 260 (got: ${outPort.y})`);
var inPort = GraphEngine.getInputPortPosition(sampleNode);
assert(inPort.x === 100, `Input port X is 100 (got: ${inPort.x})`);
assert(inPort.y === 260, `Input port Y is 260 (got: ${inPort.y})`);
var p1 = { x: 100, y: 200 };
var p2 = { x: 400, y: 350 };
var path = GraphEngine.calculateBezierPath(p1, p2);
assert(path.startsWith("M 100 200 C"), `Bezier path starts with M 100 200 C (got: ${path})`);
assert(path.endsWith("400 350"), `Bezier path ends at target coordinates (got: ${path})`);
var childNodes = [sampleNode];
var fork1 = GraphEngine.calculateForkPosition(sampleNode, childNodes);
assert(fork1.x === sampleNode.position.x + 340, `Fork 1 X offset is +340px (got: ${fork1.x})`);
assert(fork1.y === sampleNode.position.y, `Fork 1 Y is aligned with parent (got: ${fork1.y})`);
var child2 = {
  id: "node_2",
  type: "image",
  title: "Child 1",
  position: fork1,
  parentId: "node_1",
  status: "completed",
  createdAt: Date.now()
};
childNodes.push(child2);
var fork2 = GraphEngine.calculateForkPosition(sampleNode, childNodes);
assert(fork2.x === sampleNode.position.x + 340, `Fork 2 X offset is +340px (got: ${fork2.x})`);
assert(fork2.y !== sampleNode.position.y, `Fork 2 Y is staggered vertically to avoid collision (got: ${fork2.y})`);
var containerRect = {
  left: 50,
  top: 50,
  right: 1050,
  bottom: 850,
  width: 1e3,
  height: 800,
  x: 50,
  y: 50,
  toJSON: () => {
  }
};
var viewport = { x: 100, y: 100, zoom: 1.5 };
var screenX = 350;
var screenY = 400;
var graphCoord = GraphEngine.screenToGraph(screenX, screenY, containerRect, viewport);
var backToScreen = GraphEngine.graphToScreen(graphCoord.x, graphCoord.y, viewport);
assert(Math.abs(backToScreen.x + containerRect.left - screenX) < 1e-3, `Coordinate round-trip X matches`);
assert(Math.abs(backToScreen.y + containerRect.top - screenY) < 1e-3, `Coordinate round-trip Y matches`);
var nodesToFit = [
  { id: "n1", type: "image", title: "N1", position: { x: 0, y: 0 }, width: 280, height: 320, status: "completed", createdAt: Date.now() },
  { id: "n2", type: "image", title: "N2", position: { x: 600, y: 400 }, width: 280, height: 320, status: "completed", createdAt: Date.now() }
];
var fit = GraphEngine.calculateFitViewport(nodesToFit, 1200, 800);
assert(fit.zoom > 0 && fit.zoom <= 1.5, `Fit zoom is within valid range (got: ${fit.zoom})`);
console.log(`
=== ALL ${passCount} AI RENDERING CANVAS TESTS PASSED ===
`);
if (failCount > 0) {
  process.exit(1);
}
