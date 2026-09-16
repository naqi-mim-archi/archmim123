import { ArchElement, Level, Point, Project } from '../../types';
import { WALL_THICKNESS_DEFAULT } from '../../constants';
import {
  midpoint,
  pointDistance,
  sampleCurveElement,
} from '../geometry/curveGeometry';

export type ProjectExportLevelScope = 'all' | 'active' | 'selected';

export interface ProjectExportScopeOptions {
  levelScope: ProjectExportLevelScope;
  activeLevelId?: string;
  selectedLevelIds?: string[];
}

export interface ExportableProjectSlice {
  levels: Level[];
  elements: ArchElement[];
}

const EPSILON = 1e-7;

export const levelSort = (levels: Level[]): Level[] =>
  [...levels].sort((a, b) => a.zElevation - b.zElevation || a.order - b.order);

export const selectExportLevels = (project: Project, options: ProjectExportScopeOptions): Level[] => {
  const levels = levelSort(project.levels || []);
  if (!levels.length) return [];
  if (options.levelScope === 'active') {
    const active = levels.find(level => level.id === options.activeLevelId);
    return active ? [active] : [levels[0]];
  }
  if (options.levelScope === 'selected') {
    const selectedIds = new Set(options.selectedLevelIds || []);
    const selected = levels.filter(level => selectedIds.has(level.id));
    return selected.length ? selected : [levels[0]];
  }
  return levels;
};

export const isLayerVisible = (project: Project, element: ArchElement): boolean => {
  if (!element.layer || !project.layers?.length) return true;
  const layer = project.layers.find(item => item.name.toLowerCase() === element.layer!.toLowerCase());
  return layer?.visible !== false;
};

export const getExportableProjectSlice = (project: Project, options: ProjectExportScopeOptions): ExportableProjectSlice => {
  const levels = selectExportLevels(project, options);
  const levelIds = new Set(levels.map(level => level.id));
  const defaultLevelId = project.levels?.[0]?.id || levels[0]?.id;
  const elements = (project.elements || []).filter(element => {
    if (element.isPlacingDraft) return false;
    if (!isLayerVisible(project, element)) return false;
    const levelId = element.levelId || defaultLevelId;
    return !levelId || levelIds.has(levelId);
  });
  return { levels, elements };
};

export const cleanExportFileName = (name: string, fallback = 'export'): string => (name || fallback)
  .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '_')
  .replace(/\s+/g, '_')
  .replace(/_+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 96) || fallback;

export { midpoint, pointDistance, sampleCurveElement };

export const closeBoundary = (points: Point[]): Point[] => {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  return pointDistance(first, last) < EPSILON ? points : [...points, first];
};

export const polygonCentroid = (points: Point[]): Point => {
  if (!points.length) return { x: 0, y: 0 };
  const loop = closeBoundary(points);
  let twiceArea = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < loop.length - 1; i += 1) {
    const a = loop[i];
    const b = loop[i + 1];
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    x += (a.x + b.x) * cross;
    y += (a.y + b.y) * cross;
  }
  if (Math.abs(twiceArea) < EPSILON) {
    return points.reduce((acc, point) => ({
      x: acc.x + point.x / points.length,
      y: acc.y + point.y / points.length,
    }), { x: 0, y: 0 });
  }
  return { x: x / (3 * twiceArea), y: y / (3 * twiceArea) };
};

export const nearestPointOnWall = (point: Point, wall: ArchElement): { point: Point; t: number; dist: number; angleDegrees: number } | null => {
  const points = wall.isCurved || wall.wallSource === 'arc' || wall.wallSource === 'circle' || wall.wallSource === 'ellipse'
    ? sampleCurveElement(wall, 64)
    : wall.p1 && wall.p2 ? [wall.p1, wall.p2] : [];
  if (points.length < 2) return null;

  let best: { point: Point; t: number; dist: number; angleDegrees: number } | null = null;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    if (length2 < EPSILON) continue;
    const localT = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2));
    const projected = { x: a.x + dx * localT, y: a.y + dy * localT };
    const candidate = {
      point: projected,
      t: (i + localT) / (points.length - 1),
      dist: pointDistance(point, projected),
      angleDegrees: Math.atan2(dy, dx) * 180 / Math.PI,
    };
    if (!best || candidate.dist < best.dist) best = candidate;
  }
  return best;
};

export const findHostWall = (
  element: ArchElement,
  walls: ArchElement[],
): { wall: ArchElement; point: Point; t: number; dist: number; angleDegrees: number } | null => {
  if (!element.pos) return null;
  const preferred = element.hostWallId ? walls.find(wall => wall.id === element.hostWallId) : undefined;
  const pool = preferred ? [preferred] : walls;
  let best: { wall: ArchElement; point: Point; t: number; dist: number; angleDegrees: number } | null = null;
  pool.forEach(wall => {
    const candidate = nearestPointOnWall(element.pos!, wall);
    if (!candidate) return;
    if (!best || candidate.dist < best.dist) best = { wall, ...candidate };
  });
  return best;
};

export const elementMaterialName = (element: ArchElement, fallback: string): string => {
  const material = Array.isArray(element.materials) ? element.materials[0] : undefined;
  const candidate = material?.name || material?.label || material?.materialName || element.bimMetadata?.materials?.[0]?.name;
  return String(candidate || fallback).trim() || fallback;
};

export const wallThickness = (wall: ArchElement): number => Math.max(0.01, wall.thickness || WALL_THICKNESS_DEFAULT);
