import type { Point } from '../../types';

// The 2D canvas transform, shared by Canvas.tsx and the remote-cursor overlay so both
// map world coordinates to screen pixels exactly the same way.

export interface CanvasTransform {
  zoom: number;
  offset: Point;
  canvasAngle?: number;
}

export const worldToScreenPoint = (p: Point, t: CanvasTransform): Point => {
  const angle = ((t.canvasAngle || 0) * Math.PI) / 180;
  const sx = p.x * t.zoom;
  const sy = p.y * t.zoom;
  if (angle === 0) return { x: sx + t.offset.x, y: sy + t.offset.y };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: (sx * cos - sy * sin) + t.offset.x, y: (sx * sin + sy * cos) + t.offset.y };
};

export const screenToWorldPoint = (p: Point, t: CanvasTransform): Point => {
  const angle = ((t.canvasAngle || 0) * Math.PI) / 180;
  const dx = p.x - t.offset.x;
  const dy = p.y - t.offset.y;
  if (angle === 0) return { x: dx / t.zoom, y: dy / t.zoom };
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  return { x: (dx * cos - dy * sin) / t.zoom, y: (dx * sin + dy * cos) / t.zoom };
};
