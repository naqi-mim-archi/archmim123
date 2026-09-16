import { CanvasNodeData, CanvasEdge, GraphViewport, PortPosition } from '../types/graph';

export const DEFAULT_NODE_WIDTH = 280;
export const DEFAULT_NODE_HEIGHT = 320;
export const DEFAULT_ACTION_NODE_HEIGHT = 160;

export class GraphEngine {
  /**
   * Calculates the output port position on the right edge of the node.
   */
  static getOutputPortPosition(node: CanvasNodeData): PortPosition {
    const width = node.width || DEFAULT_NODE_WIDTH;
    const height = node.height || (node.type === 'action' ? DEFAULT_ACTION_NODE_HEIGHT : DEFAULT_NODE_HEIGHT);
    return {
      x: node.position.x + width,
      y: node.position.y + height / 2,
    };
  }

  /**
   * Calculates the input port position on the left edge of the node.
   */
  static getInputPortPosition(node: CanvasNodeData): PortPosition {
    const height = node.height || (node.type === 'action' ? DEFAULT_ACTION_NODE_HEIGHT : DEFAULT_NODE_HEIGHT);
    return {
      x: node.position.x,
      y: node.position.y + height / 2,
    };
  }

  /**
   * Generates a sleek cubic Bezier SVG path between two coordinates (left-to-right flow).
   */
  static calculateBezierPath(p1: PortPosition, p2: PortPosition): string {
    const dx = Math.abs(p2.x - p1.x);
    // Smooth horizontal curvature distance based on distance
    const curvature = Math.max(dx * 0.5, 60);

    const c1x = p1.x + curvature;
    const c1y = p1.y;
    const c2x = p2.x - curvature;
    const c2y = p2.y;

    return `M ${p1.x} ${p1.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }

  /**
   * Calculates optimal auto-layout position for a new forked/child node to avoid overlapping.
   */
  static calculateForkPosition(
    parentNode: CanvasNodeData,
    existingNodes: CanvasNodeData[],
    horizontalOffset = 340,
    verticalSpacing = 340
  ): { x: number; y: number } {
    const targetX = parentNode.position.x + horizontalOffset;
    
    // Find all existing child nodes of this parent
    const siblings = existingNodes.filter(n => n.parentId === parentNode.id);
    const siblingIndex = siblings.length;

    // Centered vertical distribution around parent center
    let targetY = parentNode.position.y;
    if (siblingIndex > 0) {
      const isEven = siblingIndex % 2 === 0;
      const offsetMultiplier = Math.ceil(siblingIndex / 2);
      targetY = isEven 
        ? parentNode.position.y + offsetMultiplier * verticalSpacing 
        : parentNode.position.y - offsetMultiplier * verticalSpacing;
    }

    return { x: targetX, y: targetY };
  }

  /**
   * Converts screen pixel coordinates to canvas graph space considering pan and zoom.
   */
  static screenToGraph(
    screenX: number,
    screenY: number,
    containerRect: DOMRect,
    viewport: GraphViewport
  ): { x: number; y: number } {
    const relX = screenX - containerRect.left;
    const relY = screenY - containerRect.top;
    return {
      x: (relX - viewport.x) / viewport.zoom,
      y: (relY - viewport.y) / viewport.zoom,
    };
  }

  /**
   * Converts canvas graph coordinates to screen coordinates.
   */
  static graphToScreen(
    graphX: number,
    graphY: number,
    viewport: GraphViewport
  ): { x: number; y: number } {
    return {
      x: graphX * viewport.zoom + viewport.x,
      y: graphY * viewport.zoom + viewport.y,
    };
  }

  /**
   * Fits all nodes cleanly within the visible viewport.
   */
  static calculateFitViewport(
    nodes: CanvasNodeData[],
    containerWidth: number,
    containerHeight: number,
    padding = 80
  ): GraphViewport {
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
}
