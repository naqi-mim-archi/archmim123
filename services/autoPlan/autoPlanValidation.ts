import {
  AutoPlanBoundary,
  AutoPlanImportPayload,
  AutoPlanOpening,
  AutoPlanWallSegment,
} from './autoPlanTypes';
import { Point } from '../../types';

const EPS = 1e-6;

export const polygonArea = (points: Point[]): number => {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area / 2);
};

const orientation = (a: Point, b: Point, c: Point) => {
  const v = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(v) < EPS) return 0;
  return v > 0 ? 1 : 2;
};

const onSegment = (a: Point, b: Point, c: Point) =>
  Math.min(a.x, c.x) - EPS <= b.x && b.x <= Math.max(a.x, c.x) + EPS
  && Math.min(a.y, c.y) - EPS <= b.y && b.y <= Math.max(a.y, c.y) + EPS;

const segmentsIntersect = (a1: Point, a2: Point, b1: Point, b2: Point): boolean => {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a1, b1, a2)) return true;
  if (o2 === 0 && onSegment(a1, b2, a2)) return true;
  if (o3 === 0 && onSegment(b1, a1, b2)) return true;
  if (o4 === 0 && onSegment(b1, a2, b2)) return true;
  return false;
};

export const validateAutoPlanBoundary = (boundary: AutoPlanBoundary): string[] => {
  const errors: string[] = [];
  const points = boundary.points || [];
  if (points.length < 3) errors.push('Boundary must have at least three points.');
  if (points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    errors.push('Boundary contains invalid coordinates.');
  }
  const area = polygonArea(points);
  if (area <= 0.01) errors.push('Boundary area is too small to generate a usable plan.');

  for (let i = 0; i < points.length; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % points.length];
    if (Math.hypot(a2.x - a1.x, a2.y - a1.y) < 0.05) {
      errors.push('Boundary contains a near-zero length edge.');
      break;
    }
    for (let j = i + 1; j < points.length; j++) {
      const isAdjacent = Math.abs(i - j) === 1 || (i === 0 && j === points.length - 1);
      if (isAdjacent) continue;
      const b1 = points[j];
      const b2 = points[(j + 1) % points.length];
      if (segmentsIntersect(a1, a2, b1, b2)) {
        errors.push('Boundary is self-intersecting. Please redraw it as a simple closed polygon.');
        return errors;
      }
    }
  }

  return Array.from(new Set(errors));
};

const wallLength = (wall: AutoPlanWallSegment) =>
  Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);

export const validateAutoPlanPayload = (payload: AutoPlanImportPayload): string[] => {
  const errors = validateAutoPlanBoundary(payload.boundary);
  const wallIds = new Set(payload.walls.map(wall => wall.id));

  payload.walls.forEach(wall => {
    if (wallLength(wall) < 0.05) errors.push(`Wall ${wall.id} is too short.`);
    if (!Number.isFinite(wall.thickness) || wall.thickness <= 0) errors.push(`Wall ${wall.id} has invalid thickness.`);
  });

  const openingKeys = new Set<string>();
  payload.openings.forEach((opening: AutoPlanOpening) => {
    if (!wallIds.has(opening.hostWallId)) errors.push(`${opening.type} ${opening.id} is not hosted on a valid wall.`);
    if (!Number.isFinite(opening.position) || opening.position < 0 || opening.position > 1) {
      errors.push(`${opening.type} ${opening.id} has an invalid host position.`);
    }
    if (!Number.isFinite(opening.width) || opening.width <= 0) errors.push(`${opening.type} ${opening.id} has invalid width.`);
    const duplicateKey = `${opening.hostWallId}:${opening.position.toFixed(2)}:${opening.width.toFixed(2)}`;
    if (openingKeys.has(duplicateKey)) errors.push(`Duplicate opening detected on wall ${opening.hostWallId}.`);
    openingKeys.add(duplicateKey);
  });

  return Array.from(new Set(errors));
};

export const makeRectangleBoundary = (width: number, height: number, units = 'project_units'): AutoPlanBoundary => ({
  type: 'dimensions',
  width,
  height,
  area: width * height,
  units,
  points: [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ],
});
