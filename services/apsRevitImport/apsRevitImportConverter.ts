import { ArchElement, ElementType, Layer, Level, Point, Project } from '../../types';
import {
  COLUMN_PRESETS,
  DEFAULT_PROJECT_SETTINGS_3D,
  DOOR_HEIGHT_DEFAULT,
  DOOR_PRESETS,
  INTERIOR_ELEMENT_PRESETS,
  STAIR_PRESETS,
  WALL_HEIGHT_DEFAULT,
  WALL_OPENING_HEIGHT_DEFAULT,
  WALL_PRESETS,
  WALL_THICKNESS_DEFAULT,
  WINDOW_SILL_HEIGHT_DEFAULT,
  WINDOW_TOP_HEIGHT_DEFAULT,
  WINDOW_PRESETS,
  normalizeInteriorElement,
} from '../../constants';
import {
  ApsRevitCurveManifest,
  ApsRevitElementManifest,
  ApsRevitExtractionManifest,
  ApsRevitImportConversionResult,
  ApsRevitImportOptions,
  ApsRevitImportReport,
  ApsRevitImportReportRow,
  APS_REVIT_IMPORT_VERSION,
} from './apsRevitImportTypes';
import { AppPoint3, apsRevitImportCoordinates } from './apsRevitImportCoordinateService';
import { sampleCurveElement } from '../geometry/curveGeometry';

type NativeResult = ArchElement | ArchElement[] | null;

interface ConversionContext {
  manifest: ApsRevitExtractionManifest;
  fileName: string;
  options: ApsRevitImportOptions;
  levels: Level[];
  levelMap: Map<string, Level>;
  usedIds: Set<string>;
  rows: ApsRevitImportReportRow[];
  warnings: string[];
}

const LAYERS: Layer[] = [
  { name: '0', visible: true, locked: false },
  { name: 'WALLS', visible: true, locked: false },
  { name: 'DOORS', visible: true, locked: false },
  { name: 'WINDOWS', visible: true, locked: false },
  { name: 'OPENINGS', visible: true, locked: false },
  { name: 'COLUMNS', visible: true, locked: false },
  { name: 'STAIRS', visible: true, locked: false },
  { name: 'RAILINGS', visible: true, locked: false },
  { name: 'FLOORS', visible: true, locked: false },
  { name: 'CEILINGS', visible: true, locked: false },
  { name: 'ROOMS', visible: true, locked: false },
  { name: 'GRIDLINES', visible: true, locked: false },
  { name: 'DIMENSIONS', visible: true, locked: false },
  { name: 'TEXT', visible: true, locked: false },
  { name: 'SHAPES', visible: true, locked: false },
  { name: 'APS_REVIT_FALLBACK', visible: true, locked: false },
];

const DEFAULT_OPTIONS: ApsRevitImportOptions = {
  importModelElements: true,
  importPlanAnnotations: true,
  importDimensions: true,
  importGenericFamiliesAsBlocks: true,
  includeLinkedModelReferencesAsWarnings: true,
};

const EPSILON = 1e-7;
const TAU = Math.PI * 2;
const STEP_SYNTAX_MARKER = ['ISO', '10303', '21'].join('-');

export const getDefaultApsRevitImportOptions = (revitEngine = ''): ApsRevitImportOptions => ({
  ...DEFAULT_OPTIONS,
  revitEngine,
});

const safeIdPart = (value: unknown): string => String(value ?? '')
  .trim()
  .replace(/[^A-Za-z0-9_-]+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 80);

const isSafeElementType = (value: unknown): value is ElementType => (
  typeof value === 'string'
  && [
    'line', 'gridline', 'wall', 'arc', 'circle', 'ellipse', 'rectangle', 'door', 'window',
    'wall-opening', 'floor', 'ceiling', 'elevation-marker', 'room', 'stair', 'column',
    'furniture', 'dimension', 'label', 'railing', 'counter', 'fixture', 'group', 'asset',
  ].includes(value)
);

const toFinite = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, any>;
    return toFinite(record.value ?? record.Value ?? record.number ?? record.length, fallback);
  }
  return fallback;
};

const firstDefined = <T,>(...values: T[]): T | undefined => values.find(value => value !== undefined && value !== null);

const cleanCategory = (value: unknown): string => String(value ?? '')
  .toLowerCase()
  .trim()
  .replace(/^ost_/, '')
  .replace(/[\s_-]+/g, '');

const isTruthyRevitParameter = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return ['1', 'true', 'yes'].includes(value.trim().toLowerCase());
  if (value && typeof value === 'object') {
    const record = value as Record<string, any>;
    return isTruthyRevitParameter(record.value ?? record.Value ?? record.displayValue ?? record.DisplayValue);
  }
  return false;
};

const isRevitDetailDraftingCurve = (raw: ApsRevitElementManifest): boolean => {
  if (/^Detail(?:Line|Arc|Curve)$/i.test(raw.className || '')) return true;
  const category = cleanCategory(raw.category || raw.builtInCategory);
  const hasCurveGeometry = !!raw.geometry?.locationCurve || !!raw.geometry?.curves?.length;
  const isLineOrCurve = category.includes('line') || category.includes('curve');
  const detailLineParameter = firstDefined(
    raw.parameters?.DetailLine,
    raw.parameters?.['Detail Line'],
    raw.parameters?.['DETAIL LINE'],
  );
  return hasCurveGeometry && isLineOrCurve && isTruthyRevitParameter(detailLineParameter);
};

const closePoints = (points: Point[]): Point[] => {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  return Math.hypot(first.x - last.x, first.y - last.y) < EPSILON ? points : [...points, first];
};

const pointDistance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

const removeDuplicatePoints = (points: Point[], tolerance = EPSILON): Point[] => (
  points.filter((point, index) => index === 0 || pointDistance(point, points[index - 1]) > tolerance)
);

const polygonCentroid = (points: Point[]): Point => {
  if (!points.length) return { x: 0, y: 0 };
  const loop = closePoints(points);
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
    return points.reduce((acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }), { x: 0, y: 0 });
  }
  return { x: x / (3 * twiceArea), y: y / (3 * twiceArea) };
};

const matchPreset = <T extends Record<string, any>>(presets: T[], dimensions: Record<string, number | undefined>, tolerance = 0.003): T | undefined => (
  presets.find(preset => Object.entries(dimensions).every(([key, value]) => (
    value === undefined || preset[key] === undefined || Math.abs(preset[key] - value) <= tolerance
  )))
);

const sourceFamilyType = (raw: ApsRevitElementManifest): string => (
  [raw.familyName, raw.typeName].filter(Boolean).join(' : ') || raw.typeName || raw.name || raw.className || raw.category
);

const sourceKeyValues = (raw: ApsRevitElementManifest): string[] => (
  [raw.elementId, raw.uniqueId, raw.ourAppParameters?.OurApp_ElementId, raw.ourAppParameters?.OurApp_IfcGuid]
    .filter((value): value is string => value !== undefined && value !== null && String(value).trim().length > 0)
    .map(String)
);

const buildLevelMap = (levels: Level[], manifest: ApsRevitExtractionManifest): Map<string, Level> => {
  const map = new Map<string, Level>();
  manifest.levels.forEach((source, index) => {
    const target = levels[index];
    if (!target) return;
    [source.elementId, source.uniqueId, source.name, target.id, target.name].forEach(value => {
      if (value !== undefined && value !== null) map.set(String(value).toLowerCase(), target);
    });
  });
  return map;
};

const createLevels = (manifest: ApsRevitExtractionManifest, warnings: string[]): Level[] => {
  const sorted = [...(manifest.levels || [])]
    .sort((a, b) => a.elevation - b.elevation || a.order - b.order || a.name.localeCompare(b.name));
  if (!sorted.length) {
    warnings.push('No Revit levels were extracted. A single fallback level was created.');
    return [{ id: 'aps_revit_level_1', name: 'Level 1', zElevation: 0, height: WALL_HEIGHT_DEFAULT, order: 0 }];
  }
  return sorted.map((level, index) => {
    const next = sorted[index + 1];
    const zElevation = apsRevitImportCoordinates.toAppLength(level.elevation);
    const nextElevation = next ? apsRevitImportCoordinates.toAppLength(next.elevation) : undefined;
    const height = nextElevation !== undefined
      ? Math.max(0.1, nextElevation - zElevation)
      : WALL_HEIGHT_DEFAULT;
    return {
      id: `aps_revit_level_${safeIdPart(level.uniqueId || level.elementId || index)}`,
      name: level.name || `Level ${index + 1}`,
      zElevation,
      height,
      order: index,
      metadata: {
        apsRevitImport: {
          sourceElementId: level.elementId,
          sourceUniqueId: level.uniqueId,
          sourceElevationFeet: level.elevation,
          parameters: level.parameters || {},
        },
      },
    };
  });
};

const resolveLevel = (ctx: ConversionContext, raw: ApsRevitElementManifest): Level => {
  for (const candidate of [raw.levelElementId, raw.levelUniqueId, raw.levelName]) {
    if (!candidate) continue;
    const match = ctx.levelMap.get(String(candidate).toLowerCase());
    if (match) return match;
  }
  const z = raw.geometry?.locationPoint?.z ?? raw.geometry?.boundingBox?.min.z;
  if (typeof z === 'number') {
    const meters = apsRevitImportCoordinates.toAppLength(z);
    const closest = [...ctx.levels].sort((a, b) => Math.abs(a.zElevation - meters) - Math.abs(b.zElevation - meters))[0];
    if (closest) return closest;
  }
  return ctx.levels[0];
};

const resolveCeilingHostLevel = (ctx: ConversionContext, raw: ApsRevitElementManifest): Level => {
  const bboxMinZ = raw.geometry?.boundingBox?.min.z;
  const zMeters = typeof bboxMinZ === 'number'
    ? apsRevitImportCoordinates.toAppLength(bboxMinZ)
    : undefined;
  if (zMeters === undefined) return resolveLevel(ctx, raw);

  const sorted = [...ctx.levels].sort((a, b) => a.zElevation - b.zElevation);
  const tolerance = 0.025;
  let lower = sorted[0] || resolveLevel(ctx, raw);
  for (let index = 0; index < sorted.length; index += 1) {
    const level = sorted[index];
    if (level.zElevation < zMeters - tolerance) lower = level;
    if (Math.abs(level.zElevation - zMeters) <= tolerance) {
      return sorted[Math.max(0, index - 1)] || level;
    }
    if (level.zElevation > zMeters + tolerance) break;
  }
  return lower;
};

const makeTargetId = (ctx: ConversionContext, raw: ApsRevitElementManifest, prefix: string): string => {
  const roundTripId = raw.ourAppParameters?.OurApp_ElementId;
  const preferred = typeof roundTripId === 'string' && roundTripId.trim()
    ? roundTripId.trim()
    : `${prefix}_${safeIdPart(raw.uniqueId || raw.elementId || crypto.randomUUID())}`;
  let candidate = preferred;
  let index = 1;
  while (ctx.usedIds.has(candidate)) {
    candidate = `${preferred}_${index}`;
    index += 1;
  }
  ctx.usedIds.add(candidate);
  return candidate;
};

const addRow = (
  ctx: ConversionContext,
  raw: ApsRevitElementManifest,
  result: ApsRevitImportReportRow['result'],
  target?: ArchElement | null,
  message?: string,
) => {
  ctx.rows.push({
    sourceRevitElementId: raw.elementId,
    sourceRevitUniqueId: raw.uniqueId,
    sourceRevitCategory: raw.category,
    sourceRevitFamilyType: sourceFamilyType(raw),
    targetNativeType: target?.type,
    targetAppElementId: target?.id,
    result,
    warning: result === 'native' ? message : undefined,
    fallbackReason: result === 'fallback' || result === 'skipped' ? message : undefined,
  });
  if (message && result !== 'native') ctx.warnings.push(`${raw.category} ${raw.elementId}: ${message}`);
};

const withImportMetadata = (
  element: ArchElement,
  raw: ApsRevitElementManifest,
  ctx: ConversionContext,
  extra: Record<string, any> = {},
): ArchElement => ({
  ...element,
  sourceType: 'aps_revit_import' as any,
  sourceFileType: 'rvt',
  sourceFileName: ctx.fileName,
  bimSourceId: raw.uniqueId || raw.elementId,
  bimSourceCategory: raw.category,
  revitFamilyName: raw.familyName,
  revitTypeName: raw.typeName,
  importTimestamp: ctx.manifest.extractedAt || new Date().toISOString(),
  importVersion: APS_REVIT_IMPORT_VERSION,
  metadata: {
    ...(element.metadata || {}),
    apsRevitImport: {
      sourceElementId: raw.elementId,
      sourceUniqueId: raw.uniqueId,
      sourceCategory: raw.category,
      builtInCategory: raw.builtInCategory,
      className: raw.className,
      familyName: raw.familyName,
      typeName: raw.typeName,
      typeId: raw.typeId,
      hostElementId: raw.hostElementId,
      hostUniqueId: raw.hostUniqueId,
      levelElementId: raw.levelElementId,
      levelUniqueId: raw.levelUniqueId,
      materialIds: raw.materialIds || [],
      materialNames: raw.materialNames || [],
      parameters: raw.parameters || {},
      ourAppParameters: raw.ourAppParameters || {},
      sourceViewId: raw.sourceViewId || raw.geometry?.sourceViewId,
      sourceViewName: raw.sourceViewName || raw.geometry?.sourceViewName,
      warnings: raw.warnings || [],
      ...extra,
    },
  },
});

const materialArray = (raw: ApsRevitElementManifest) => (
  (raw.materialNames || []).map((name, index) => ({
    id: raw.materialIds?.[index] || name,
    name,
  }))
);

const curveStartEnd = (curve?: ApsRevitCurveManifest): { p1: Point; p2: Point } | null => {
  const p1 = apsRevitImportCoordinates.toAppPoint(curve?.start || curve?.points?.[0]);
  const p2 = apsRevitImportCoordinates.toAppPoint(curve?.end || curve?.points?.[1]);
  return p1 && p2 ? { p1, p2 } : null;
};

const normalizeRadians = (angle: number): number => ((angle % TAU) + TAU) % TAU;

const angleFromCenter = (point: Point, center: Point): number => (
  normalizeRadians(Math.atan2(point.y - center.y, point.x - center.x))
);

const hasDistinctEndpoints = (curve?: ApsRevitCurveManifest): boolean => {
  const endpoints = curveStartEnd(curve);
  return !!endpoints && pointDistance(endpoints.p1, endpoints.p2) > EPSILON;
};

const isBoundedCircularArc = (curve?: ApsRevitCurveManifest): boolean => (
  !!curve
  && (curve.kind === 'arc' || curve.kind === 'circle')
  && curve.isBound !== false
  && !!curve.center
  && !!curve.radius
  && hasDistinctEndpoints(curve)
);

const interpolateAngle = (start: number, end: number, t: number, counterclockwise = false): number => {
  let span = counterclockwise ? start - end : end - start;
  if (span < 0) span += TAU;
  return counterclockwise ? start - span * t : start + span * t;
};

const pointOnCircle = (center: Point, radius: number, angle: number): Point => ({
  x: center.x + Math.cos(angle) * radius,
  y: center.y + Math.sin(angle) * radius,
});

const toAppDirection = (point?: ApsRevitCurveManifest['xDirection'] | null): Point | null => {
  if (!point) return null;
  const x = toFinite(point.x, NaN);
  const y = toFinite(point.y, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y: -y };
};

const inferCurveCounterclockwise = (
  mid: Point | null,
  pointAt: (counterclockwise: boolean) => Point,
  fallback = false,
): boolean => {
  if (!mid) return fallback;
  const ccwPoint = pointAt(true);
  const cwPoint = pointAt(false);
  return pointDistance(mid, ccwPoint) <= pointDistance(mid, cwPoint);
};

const circularArcFromCurve = (curve: ApsRevitCurveManifest) => {
  const endpoints = curveStartEnd(curve);
  const center = apsRevitImportCoordinates.toAppPoint(curve.center);
  const radius = apsRevitImportCoordinates.toAppLength(curve.radius || 0);
  if (!endpoints || !center || radius <= EPSILON) return null;

  const startAngle = angleFromCenter(endpoints.p1, center);
  const endAngle = angleFromCenter(endpoints.p2, center);
  const mid = apsRevitImportCoordinates.toAppPoint(curve.mid || undefined);
  const counterclockwise = inferCurveCounterclockwise(
    mid,
    candidate => pointOnCircle(center, radius, interpolateAngle(startAngle, endAngle, 0.5, candidate)),
    false,
  );
  return {
    ...endpoints,
    center,
    radius,
    mid,
    startAngle,
    endAngle,
    counterclockwise,
  };
};

const ellipsePointAt = (
  center: Point,
  radiusX: number,
  radiusY: number,
  rotation: number,
  angle: number,
): Point => {
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const x = Math.cos(angle) * radiusX;
  const y = Math.sin(angle) * radiusY;
  return {
    x: center.x + x * cosR - y * sinR,
    y: center.y + x * sinR + y * cosR,
  };
};

const ellipseAngleFromPoint = (
  point: Point,
  center: Point,
  radiusX: number,
  radiusY: number,
  rotation: number,
): number => {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const localX = dx * cosR + dy * sinR;
  const localY = -dx * sinR + dy * cosR;
  return normalizeRadians(Math.atan2(localY / Math.max(EPSILON, radiusY), localX / Math.max(EPSILON, radiusX)));
};

const ellipseFromCurve = (curve: ApsRevitCurveManifest) => {
  const center = apsRevitImportCoordinates.toAppPoint(curve.center);
  if (!center) return null;
  const radiusX = apsRevitImportCoordinates.toAppLength(curve.radiusX ?? curve.radius ?? 0);
  const radiusY = apsRevitImportCoordinates.toAppLength(curve.radiusY ?? curve.radius ?? 0);
  if (radiusX <= EPSILON || radiusY <= EPSILON) return null;

  const xDirection = toAppDirection(curve.xDirection);
  const rotation = xDirection && pointDistance(xDirection, { x: 0, y: 0 }) > EPSILON
    ? Math.atan2(xDirection.y, xDirection.x)
    : apsRevitImportCoordinates.toAppAngleRadians(curve.rotation || 0);
  const endpoints = curveStartEnd(curve);
  const mid = apsRevitImportCoordinates.toAppPoint(curve.mid || undefined);
  const isPartial = !!endpoints && hasDistinctEndpoints(curve);
  const startAngle = isPartial ? ellipseAngleFromPoint(endpoints!.p1, center, radiusX, radiusY, rotation) : undefined;
  const endAngle = isPartial ? ellipseAngleFromPoint(endpoints!.p2, center, radiusX, radiusY, rotation) : undefined;
  const counterclockwise = startAngle === undefined || endAngle === undefined
    ? undefined
    : inferCurveCounterclockwise(
      mid,
      candidate => ellipsePointAt(center, radiusX, radiusY, rotation, interpolateAngle(startAngle, endAngle, 0.5, candidate)),
      false,
    );

  return {
    center,
    radiusX,
    radiusY,
    rotation,
    startAngle,
    endAngle,
    counterclockwise,
  };
};

const perpendicularDistanceToSegment = (point: Point, start: Point, end: Point): number => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= EPSILON) return pointDistance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / len2));
  return pointDistance(point, { x: start.x + dx * t, y: start.y + dy * t });
};

const simplifyPolyline = (points: Point[], tolerance: number): Point[] => {
  if (points.length <= 2) return points;
  let maxDistance = -1;
  let splitIndex = -1;
  const start = points[0];
  const end = points[points.length - 1];
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularDistanceToSegment(points[index], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = index;
    }
  }
  if (maxDistance <= tolerance || splitIndex < 0) return [start, end];
  const left = simplifyPolyline(points.slice(0, splitIndex + 1), tolerance);
  const right = simplifyPolyline(points.slice(splitIndex), tolerance);
  return [...left.slice(0, -1), ...right];
};

const limitPolylinePoints = (points: Point[], maxPoints: number): Point[] => {
  if (points.length <= maxPoints) return points;
  const limited: Point[] = [];
  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round(index * (points.length - 1) / (maxPoints - 1));
    limited.push(points[sourceIndex]);
  }
  return removeDuplicatePoints(limited);
};

const curvePointsToAppPolyline = (curve: ApsRevitCurveManifest): Point[] => {
  const raw = (curve.points || [])
    .map(point => apsRevitImportCoordinates.toAppPoint(point))
    .filter(Boolean) as Point[];
  const unique = removeDuplicatePoints(raw);
  if (unique.length <= 2) return unique;
  const simplified = simplifyPolyline(unique, curve.kind === 'spline' ? 0.015 : 0.005);
  return limitPolylinePoints(simplified, curve.kind === 'spline' ? 129 : 257);
};

const curveToShape = (curve: ApsRevitCurveManifest, base: Partial<ArchElement>): ArchElement[] => {
  const kind = curve.kind || 'unknown';
  if ((kind === 'polyline' || kind === 'spline') && Array.isArray(curve.points) && curve.points.length > 1) {
    const points = curvePointsToAppPolyline(curve);
    return points.slice(0, -1).flatMap((p1, index) => {
      const p2 = points[index + 1];
      return [{ ...base, id: `${base.id}_${index}`, type: 'line', p1, p2, layer: base.layer || 'SHAPES' } as ArchElement];
    });
  }

  if (isBoundedCircularArc(curve)) {
    const arc = circularArcFromCurve(curve);
    if (!arc) return [];
    return [{
      ...base,
      type: 'arc',
      p1: arc.p1,
      p2: arc.p2,
      controlPoint: arc.mid || midpoint(arc.p1, arc.p2),
      arcCenter: arc.center,
      arcRadius: arc.radius,
      arcStartAngle: arc.startAngle,
      arcEndAngle: arc.endAngle,
      arcCounterclockwise: arc.counterclockwise,
      isCurved: true,
      layer: base.layer || 'SHAPES',
    } as ArchElement];
  }

  if (kind === 'circle' && curve.center && curve.radius) {
    const center = apsRevitImportCoordinates.toAppPoint(curve.center);
    if (!center) return [];
    const radius = apsRevitImportCoordinates.toAppLength(curve.radius);
    return [{
      ...base,
      type: 'circle',
      p1: center,
      p2: { x: center.x + radius, y: center.y },
      layer: base.layer || 'SHAPES',
    } as ArchElement];
  }

  if (kind === 'ellipse' && curve.center) {
    const ellipse = ellipseFromCurve(curve);
    if (!ellipse) return [];
    return [{
      ...base,
      type: 'ellipse',
      p1: { x: ellipse.center.x - ellipse.radiusX, y: ellipse.center.y - ellipse.radiusY },
      p2: { x: ellipse.center.x + ellipse.radiusX, y: ellipse.center.y + ellipse.radiusY },
      ellipseCenter: ellipse.center,
      ellipseRadiusX: ellipse.radiusX,
      ellipseRadiusY: ellipse.radiusY,
      ellipseRotation: ellipse.rotation,
      ellipseStartAngle: ellipse.startAngle,
      ellipseEndAngle: ellipse.endAngle,
      ellipseCounterclockwise: ellipse.counterclockwise,
      startT: ellipse.startAngle === undefined ? undefined : normalizeRadians(ellipse.startAngle) / TAU,
      endT: ellipse.endAngle === undefined ? undefined : normalizeRadians(ellipse.endAngle) / TAU,
      isCurved: true,
      layer: base.layer || 'SHAPES',
    } as ArchElement];
  }

  const endpoints = curveStartEnd(curve);
  if (!endpoints) return [];
  if (kind === 'arc' && curve.center) {
    const arc = circularArcFromCurve(curve);
    if (!arc) return [];
    return [{
      ...base,
      type: 'arc',
      p1: arc.p1,
      p2: arc.p2,
      controlPoint: arc.mid || midpoint(arc.p1, arc.p2),
      arcCenter: arc.center,
      arcRadius: arc.radius,
      arcStartAngle: arc.startAngle,
      arcEndAngle: arc.endAngle,
      arcCounterclockwise: arc.counterclockwise,
      isCurved: true,
      layer: base.layer || 'SHAPES',
    } as ArchElement];
  }
  return [{
    ...base,
    type: 'line',
    p1: endpoints.p1,
    p2: endpoints.p2,
    layer: base.layer || 'SHAPES',
  } as ArchElement];
};

const nearestPointOnWall = (point: Point, wall: ArchElement) => {
  if (!wall.p1 || !wall.p2) return null;
  const points = wall.isCurved || ['arc', 'circle', 'ellipse'].includes(wall.wallSource || '')
    ? sampleCurveElement(wall, 64)
    : [wall.p1, wall.p2];
  let best: { point: Point; t: number; dist: number; angle: number } | null = null;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < EPSILON) continue;
    const localT = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2));
    const projected = { x: a.x + dx * localT, y: a.y + dy * localT };
    const candidate = {
      point: projected,
      t: (i + localT) / (points.length - 1),
      dist: pointDistance(point, projected),
      angle: Math.atan2(dy, dx) * 180 / Math.PI,
    };
    if (!best || candidate.dist < best.dist) best = candidate;
  }
  return best;
};

const findHostWall = (
  raw: ApsRevitElementManifest,
  point: Point,
  walls: ArchElement[],
): { wall: ArchElement; point: Point; t: number; dist: number; angle: number } | null => {
  const hostKeys = [raw.hostElementId, raw.hostUniqueId].filter(Boolean).map(String);
  const preferred = hostKeys.length
    ? walls.filter(wall => {
      const metadata = wall.metadata?.apsRevitImport || {};
      return hostKeys.includes(metadata.sourceElementId) || hostKeys.includes(metadata.sourceUniqueId);
    })
    : [];
  const pool = preferred.length ? preferred : walls;
  let best: { wall: ArchElement; point: Point; t: number; dist: number; angle: number } | null = null;
  pool.forEach(wall => {
    const candidate = nearestPointOnWall(point, wall);
    if (!candidate) return;
    if (!best || candidate.dist < best.dist) best = { wall, ...candidate };
  });
  return best;
};

const boundaryFromRaw = (raw: ApsRevitElementManifest): Point[] => {
  const loop = raw.geometry?.boundaryLoops?.find(points => points.length >= 3)
    || raw.geometry?.footprint
    || [];
  return closePoints(loop.map(point => apsRevitImportCoordinates.toAppPoint(point)).filter(Boolean) as Point[]);
};

const createFallback = (ctx: ConversionContext, raw: ApsRevitElementManifest, reason: string): ArchElement | null => {
  if (!ctx.options.importGenericFamiliesAsBlocks) {
    addRow(ctx, raw, 'skipped', null, `${reason}; generic/custom family blocks are disabled.`);
    return null;
  }
  const level = resolveLevel(ctx, raw);
  const point = apsRevitImportCoordinates.toAppPoint(raw.geometry?.locationPoint)
    || apsRevitImportCoordinates.toAppPoint(raw.geometry?.boundingBox?.min)
    || { x: 0, y: 0 };
  const bbox = raw.geometry?.boundingBox;
  const width = raw.geometry?.width
    ? apsRevitImportCoordinates.toAppLength(raw.geometry.width)
    : bbox ? Math.max(0.05, Math.abs(apsRevitImportCoordinates.toAppLength(bbox.max.x - bbox.min.x))) : 1;
  const depth = raw.geometry?.depth
    ? apsRevitImportCoordinates.toAppLength(raw.geometry.depth)
    : bbox ? Math.max(0.05, Math.abs(apsRevitImportCoordinates.toAppLength(bbox.max.y - bbox.min.y))) : 1;
  const height = raw.geometry?.height
    ? apsRevitImportCoordinates.toAppLength(raw.geometry.height)
    : bbox ? Math.max(0.05, Math.abs(apsRevitImportCoordinates.toAppLength((bbox.max.z || 0) - (bbox.min.z || 0)))) : 0.75;

  const label = sourceFamilyType(raw);
  const lookupText = `${raw.familyName || ''} ${raw.typeName || ''} ${raw.name || ''}`.toLowerCase();
  const preset = INTERIOR_ELEMENT_PRESETS.find(candidate => {
    const haystack = [candidate.label, candidate.subType, candidate.id, candidate.category].filter(Boolean).join(' ').toLowerCase();
    return haystack && lookupText.includes(String(candidate.subType || candidate.id || candidate.label).toLowerCase());
  });

  const base: ArchElement = preset ? normalizeInteriorElement({
    id: makeTargetId(ctx, raw, 'aps_revit_item'),
    type: preset.type || 'furniture',
    subType: preset.subType,
    label: label || preset.label,
    pos: point,
    width: width || preset.width,
    depth: depth || preset.depth,
    height: height || preset.height,
    rotation: apsRevitImportCoordinates.toAppRotationDegrees(raw.geometry?.rotation || 0),
    levelId: level.id,
    layer: 'APS_REVIT_FALLBACK',
    category: preset.category || raw.category,
    iconType: preset.iconType,
    materials: materialArray(raw),
  }) as ArchElement : {
    id: makeTargetId(ctx, raw, 'aps_revit_block'),
    type: 'asset',
    assetType: 'bim-object',
    label,
    displayName: label,
    pos: point,
    width,
    depth,
    height,
    rotation: apsRevitImportCoordinates.toAppRotationDegrees(raw.geometry?.rotation || 0),
    levelId: level.id,
    layer: 'APS_REVIT_FALLBACK',
    category: raw.category,
    sourceFileType: 'rvt',
    materials: materialArray(raw),
  };

  const element = withImportMetadata(base, raw, ctx, {
    fallbackReason: reason,
    boundingBox: raw.geometry?.boundingBox,
  });
  addRow(ctx, raw, 'fallback', element, reason);
  return element;
};

const createWall = (ctx: ConversionContext, raw: ApsRevitElementManifest): ArchElement | null => {
  const level = resolveLevel(ctx, raw);
  const curve = raw.geometry?.locationCurve;
  if (!curve) {
    return createFallback(ctx, raw, 'Wall did not include a Revit LocationCurve that can become a native canvas wall.');
  }

  const thickness = apsRevitImportCoordinates.toAppLength(firstDefined(
    raw.ourAppParameters?.OurApp_Thickness,
    raw.geometry?.thickness,
    raw.parameters?.Width,
    raw.parameters?.['Width'],
  ), WALL_THICKNESS_DEFAULT / 0.3048);
  const height = apsRevitImportCoordinates.toAppLength(firstDefined(
    raw.ourAppParameters?.OurApp_Height,
    raw.geometry?.height,
    raw.parameters?.UnconnectedHeight,
    raw.parameters?.['Unconnected Height'],
  ), (level.height || WALL_HEIGHT_DEFAULT) / 0.3048);
  const preset = matchPreset(WALL_PRESETS, { thickness });
  const endpoints = curveStartEnd(curve);
  const circleCenter = curve.kind === 'circle' ? apsRevitImportCoordinates.toAppPoint(curve.center || undefined) : null;
  const circleRadius = curve.kind === 'circle' ? apsRevitImportCoordinates.toAppLength(curve.radius || 0) : 0;
  const ellipseGeometry = curve.kind === 'ellipse' ? ellipseFromCurve(curve) : null;
  const p1 = endpoints?.p1
    || circleCenter
    || (ellipseGeometry ? { x: ellipseGeometry.center.x - ellipseGeometry.radiusX, y: ellipseGeometry.center.y - ellipseGeometry.radiusY } : null);
  const p2 = endpoints?.p2
    || (circleCenter && circleRadius > 0 ? { x: circleCenter.x + circleRadius, y: circleCenter.y } : null)
    || (ellipseGeometry ? { x: ellipseGeometry.center.x + ellipseGeometry.radiusX, y: ellipseGeometry.center.y + ellipseGeometry.radiusY } : null);
  if (!p1 || !p2) {
    return createFallback(ctx, raw, `Unsupported Revit wall curve "${curve.kind}" did not include enough curve geometry.`);
  }
  const base: ArchElement = {
    id: makeTargetId(ctx, raw, 'aps_revit_wall'),
    type: 'wall',
    p1,
    p2,
    thickness,
    height: Math.max(0.05, height),
    levelId: level.id,
    layer: 'WALLS',
    label: raw.name || raw.typeName || preset?.label || 'Wall',
    subType: preset?.id || raw.typeName,
    category: raw.category,
    materials: materialArray(raw),
    baseOffset: apsRevitImportCoordinates.toAppLength(firstDefined(raw.parameters?.BaseOffset, raw.parameters?.['Base Offset']), 0),
    topOffset: apsRevitImportCoordinates.toAppLength(firstDefined(raw.parameters?.TopOffset, raw.parameters?.['Top Offset']), 0),
  };

  if (isBoundedCircularArc(curve)) {
    const arc = circularArcFromCurve(curve);
    if (!arc) return createFallback(ctx, raw, `Unsupported Revit wall arc "${curve.kind}" did not include enough circular geometry.`);
    base.wallSource = 'arc';
    base.isCurved = true;
    base.p1 = arc.p1;
    base.p2 = arc.p2;
    base.controlPoint = arc.mid || midpoint(arc.p1, arc.p2);
    base.arcCenter = arc.center;
    base.arcRadius = arc.radius;
    base.arcStartAngle = arc.startAngle;
    base.arcEndAngle = arc.endAngle;
    base.arcCounterclockwise = arc.counterclockwise;
  } else if (curve.kind === 'circle' && circleCenter && circleRadius > 0) {
    base.wallSource = 'circle';
    base.isCurved = true;
    base.p1 = circleCenter;
    base.p2 = { x: circleCenter.x + circleRadius, y: circleCenter.y };
  } else if (curve.kind === 'ellipse' && ellipseGeometry) {
    base.wallSource = 'ellipse';
    base.isCurved = true;
    base.p1 = { x: ellipseGeometry.center.x - ellipseGeometry.radiusX, y: ellipseGeometry.center.y - ellipseGeometry.radiusY };
    base.p2 = { x: ellipseGeometry.center.x + ellipseGeometry.radiusX, y: ellipseGeometry.center.y + ellipseGeometry.radiusY };
    base.ellipseCenter = ellipseGeometry.center;
    base.ellipseRadiusX = ellipseGeometry.radiusX;
    base.ellipseRadiusY = ellipseGeometry.radiusY;
    base.ellipseRotation = ellipseGeometry.rotation;
    base.ellipseStartAngle = ellipseGeometry.startAngle;
    base.ellipseEndAngle = ellipseGeometry.endAngle;
    base.ellipseCounterclockwise = ellipseGeometry.counterclockwise;
    base.startT = ellipseGeometry.startAngle === undefined ? undefined : normalizeRadians(ellipseGeometry.startAngle) / TAU;
    base.endT = ellipseGeometry.endAngle === undefined ? undefined : normalizeRadians(ellipseGeometry.endAngle) / TAU;
  } else if (curve.kind !== 'line') {
    return createFallback(ctx, raw, `Unsupported Revit wall curve "${curve.kind}" was preserved as a block/proxy.`);
  }

  const element = withImportMetadata(base, raw, ctx);
  addRow(ctx, raw, 'native', element);
  return element;
};

const createHosted = (
  ctx: ConversionContext,
  raw: ApsRevitElementManifest,
  walls: ArchElement[],
  type: 'door' | 'window' | 'wall-opening',
): ArchElement | null => {
  const point = apsRevitImportCoordinates.toAppPoint(raw.geometry?.locationPoint);
  if (!point) return createFallback(ctx, raw, `${type} did not include a Revit insertion point.`);
  const host = findHostWall(raw, point, walls);
  if (!host) return createFallback(ctx, raw, `${type} could not be matched to a compatible native host wall.`);
  const level = resolveLevel(ctx, raw);
  const width = apsRevitImportCoordinates.toAppLength(firstDefined(
    raw.ourAppParameters?.OurApp_Width,
    raw.geometry?.width,
    raw.parameters?.Width,
    raw.parameters?.['Rough Width'],
  ), (type === 'door' ? 0.9 : 1.1) / 0.3048);
  const height = apsRevitImportCoordinates.toAppLength(firstDefined(
    raw.ourAppParameters?.OurApp_Height,
    raw.geometry?.height,
    raw.parameters?.Height,
    raw.parameters?.['Rough Height'],
  ), (type === 'door' ? DOOR_HEIGHT_DEFAULT : WALL_OPENING_HEIGHT_DEFAULT) / 0.3048);
  const sillHeight = type === 'window'
    ? apsRevitImportCoordinates.toAppLength(firstDefined(raw.geometry?.height ? raw.parameters?.SillHeight : undefined, raw.parameters?.['Sill Height']), WINDOW_SILL_HEIGHT_DEFAULT / 0.3048)
    : apsRevitImportCoordinates.toAppLength(firstDefined(raw.parameters?.BaseOffset, raw.parameters?.['Base Offset']), 0);
  const preset = type === 'door'
    ? matchPreset(DOOR_PRESETS, { width })
    : type === 'window'
      ? matchPreset(WINDOW_PRESETS, { width, height })
      : undefined;
  const element: ArchElement = withImportMetadata({
    id: makeTargetId(ctx, raw, `aps_revit_${type.replace('-', '_')}`),
    type,
    pos: host.point,
    width,
    height,
    sillHeight: type === 'window' ? sillHeight : undefined,
    topHeight: type === 'window' ? Math.max(sillHeight + 0.05, apsRevitImportCoordinates.toAppLength(firstDefined(raw.parameters?.HeadHeight, raw.parameters?.['Head Height']), (sillHeight + height) / 0.3048)) : undefined,
    rotation: host.angle,
    hostWallId: host.wall.id,
    hostT: host.t,
    levelId: level.id,
    layer: type === 'door' ? 'DOORS' : type === 'window' ? 'WINDOWS' : 'OPENINGS',
    label: raw.name || raw.typeName || preset?.label || type,
    subType: preset?.subType || preset?.id || raw.typeName,
    category: raw.category,
    materials: materialArray(raw),
  }, raw, ctx, {
    hostDistanceMeters: host.dist,
    resolvedHostWallId: host.wall.id,
  });
  addRow(ctx, raw, 'native', element);
  return element;
};

const createBoundaryElement = (
  ctx: ConversionContext,
  raw: ApsRevitElementManifest,
  type: 'floor' | 'ceiling' | 'room',
): ArchElement | null => {
  const boundary = boundaryFromRaw(raw);
  if (boundary.length < 4) return createFallback(ctx, raw, `${type} did not include a reliable closed boundary loop.`);
  const level = type === 'ceiling' ? resolveCeilingHostLevel(ctx, raw) : resolveLevel(ctx, raw);
  const heightOrThickness = type === 'room'
    ? apsRevitImportCoordinates.toAppLength(raw.geometry?.height, level.height)
    : apsRevitImportCoordinates.toAppLength(firstDefined(raw.geometry?.thickness, raw.geometry?.height), DEFAULT_PROJECT_SETTINGS_3D.slabThickness / 0.3048);
  const elevation = type === 'ceiling'
    ? 0
    : apsRevitImportCoordinates.toAppLength(raw.geometry?.boundingBox?.min.z, 0) - level.zElevation;
  const element = withImportMetadata({
    id: makeTargetId(ctx, raw, `aps_revit_${type}`),
    type,
    boundary,
    pos: apsRevitImportCoordinates.toAppPoint(raw.geometry?.locationPoint) || polygonCentroid(boundary),
    height: heightOrThickness,
    elevation,
    levelId: level.id,
    layer: type === 'floor' ? 'FLOORS' : type === 'ceiling' ? 'CEILINGS' : 'ROOMS',
    label: raw.name || raw.typeName || type,
    category: raw.category,
    materials: materialArray(raw),
    metadata: type === 'room' ? {
      roomShowArea: true,
      roomNameOnly: false,
    } : undefined,
  }, raw, ctx, {
    holes: raw.geometry?.holes || [],
    areaSquareMeters: raw.geometry?.area ? apsRevitImportCoordinates.toAppArea(raw.geometry.area) : undefined,
  });
  addRow(ctx, raw, 'native', element);
  return element;
};

const createColumn = (ctx: ConversionContext, raw: ApsRevitElementManifest): ArchElement | null => {
  const point = apsRevitImportCoordinates.toAppPoint(raw.geometry?.locationPoint)
    || apsRevitImportCoordinates.toAppPoint(raw.geometry?.boundingBox?.min);
  if (!point) return createFallback(ctx, raw, 'Column did not include a reliable location point or bounding box.');
  const level = resolveLevel(ctx, raw);
  const bbox = raw.geometry?.boundingBox;
  const width = apsRevitImportCoordinates.toAppLength(firstDefined(raw.geometry?.width, raw.geometry?.diameter, bbox ? bbox.max.x - bbox.min.x : undefined), 0.45 / 0.3048);
  const depth = apsRevitImportCoordinates.toAppLength(firstDefined(raw.geometry?.depth, raw.geometry?.diameter, bbox ? bbox.max.y - bbox.min.y : undefined), width / 0.3048);
  const height = apsRevitImportCoordinates.toAppLength(firstDefined(raw.geometry?.height, bbox ? (bbox.max.z || 0) - (bbox.min.z || 0) : undefined), level.height / 0.3048);
  const shape = raw.geometry?.shapeHint === 'circle' || cleanCategory(raw.typeName).includes('round') ? 'circle' : 'rect';
  const preset = matchPreset(COLUMN_PRESETS, { width, depth });
  const element = withImportMetadata({
    id: makeTargetId(ctx, raw, 'aps_revit_column'),
    type: 'column',
    pos: point,
    width,
    depth,
    height,
    rotation: apsRevitImportCoordinates.toAppRotationDegrees(raw.geometry?.rotation || 0),
    shape,
    levelId: level.id,
    layer: 'COLUMNS',
    label: raw.name || raw.typeName || preset?.label || 'Column',
    subType: preset?.id || raw.typeName,
    category: raw.category,
    materials: materialArray(raw),
  }, raw, ctx);
  addRow(ctx, raw, 'native', element);
  return element;
};

const pathEndpoints = (raw: ApsRevitElementManifest): { p1: Point; p2: Point } | null => {
  const pathCurve = raw.geometry?.path?.find(curve => curve.start && curve.end);
  const line = curveStartEnd(pathCurve || raw.geometry?.locationCurve);
  if (line) return line;
  const bbox = raw.geometry?.boundingBox;
  if (!bbox) return null;
  const min = apsRevitImportCoordinates.toAppPoint(bbox.min);
  const max = apsRevitImportCoordinates.toAppPoint(bbox.max);
  if (!min || !max) return null;
  return Math.abs(max.x - min.x) >= Math.abs(max.y - min.y)
    ? { p1: { x: min.x, y: (min.y + max.y) / 2 }, p2: { x: max.x, y: (min.y + max.y) / 2 } }
    : { p1: { x: (min.x + max.x) / 2, y: min.y }, p2: { x: (min.x + max.x) / 2, y: max.y } };
};

const horizontalBoundingBoxSpanFeet = (raw: ApsRevitElementManifest): { x: number; y: number } | null => {
  const bbox = raw.geometry?.boundingBox;
  if (!bbox) return null;
  return {
    x: Math.abs((bbox.max.x || 0) - (bbox.min.x || 0)),
    y: Math.abs((bbox.max.y || 0) - (bbox.min.y || 0)),
  };
};

const readPathWidthFeet = (raw: ApsRevitElementManifest, type: 'stair' | 'railing' | 'gridline'): number => {
  if (type !== 'stair') return toFinite(raw.geometry?.width, 0.05 / 0.3048);
  const fromParameters = firstDefined(
    raw.ourAppParameters?.OurApp_Width,
    raw.parameters?.ActualRunWidth,
    raw.parameters?.['Actual Run Width'],
    raw.parameters?.RunWidth,
    raw.parameters?.['Run Width'],
  );
  const parameterWidth = toFinite(fromParameters, NaN);
  if (Number.isFinite(parameterWidth) && parameterWidth > EPSILON) return parameterWidth;

  const spans = horizontalBoundingBoxSpanFeet(raw);
  if (spans && spans.x > EPSILON && spans.y > EPSILON) return Math.min(spans.x, spans.y);
  return toFinite(raw.geometry?.width, 1.05 / 0.3048);
};

const createPathElement = (
  ctx: ConversionContext,
  raw: ApsRevitElementManifest,
  type: 'stair' | 'railing' | 'gridline',
): ArchElement | null => {
  const endpoints = pathEndpoints(raw);
  if (!endpoints) return createFallback(ctx, raw, `${type} did not include a reliable line or path.`);
  const level = resolveLevel(ctx, raw);
  const width = apsRevitImportCoordinates.toAppLength(readPathWidthFeet(raw, type), type === 'stair' ? 1.05 / 0.3048 : 0.05 / 0.3048);
  const height = apsRevitImportCoordinates.toAppLength(raw.geometry?.height, type === 'railing' ? 1 / 0.3048 : level.height / 0.3048);
  const preset = type === 'stair' ? matchPreset(STAIR_PRESETS, { width }, 0.05) : undefined;
  const element = withImportMetadata({
    id: makeTargetId(ctx, raw, `aps_revit_${type}`),
    type,
    p1: endpoints.p1,
    p2: endpoints.p2,
    width,
    height,
    levelId: level.id,
    layer: type === 'stair' ? 'STAIRS' : type === 'railing' ? 'RAILINGS' : 'GRIDLINES',
    label: raw.name || raw.typeName || type,
    subType: preset?.subType || raw.typeName,
    category: raw.category,
    materials: materialArray(raw),
    metadata: type === 'stair' ? {
      stepCount: toFinite(firstDefined(raw.parameters?.ActualTreadsNumber, raw.parameters?.['Actual Number of Treads'], raw.parameters?.TreadCount), undefined as any),
      riserCount: toFinite(firstDefined(raw.parameters?.ActualRisersNumber, raw.parameters?.['Actual Number of Risers'], raw.parameters?.RiserCount), undefined as any),
      treadCount: toFinite(firstDefined(raw.parameters?.ActualTreadsNumber, raw.parameters?.['Actual Number of Treads'], raw.parameters?.TreadCount), undefined as any),
    } : undefined,
  }, raw, ctx);
  addRow(ctx, raw, 'native', element);
  return element;
};

const createAnnotation = (ctx: ConversionContext, raw: ApsRevitElementManifest): NativeResult => {
  if (!ctx.options.importPlanAnnotations) {
    addRow(ctx, raw, 'skipped', null, 'Plan annotation import option is disabled.');
    return null;
  }
  if (isRevitDetailDraftingCurve(raw)) {
    addRow(ctx, raw, 'skipped', null, 'Revit detail/drafting curve skipped; APS import keeps model curves but excludes view-only drafting symbols.');
    return null;
  }
  const category = cleanCategory(raw.category);
  const level = resolveLevel(ctx, raw);
  if (category.includes('textnote') || category.includes('text') || raw.geometry?.text) {
    const pos = apsRevitImportCoordinates.toAppPoint(raw.geometry?.locationPoint)
      || apsRevitImportCoordinates.toAppPoint(raw.geometry?.boundingBox?.min)
      || { x: 0, y: 0 };
    const element = withImportMetadata({
      id: makeTargetId(ctx, raw, 'aps_revit_text'),
      type: 'label',
      pos,
      label: raw.geometry?.text || raw.name || '',
      rotation: apsRevitImportCoordinates.toAppRotationDegrees(raw.geometry?.rotation || 0),
      textAlignment: raw.geometry?.alignment === 'center' ? 'center' : raw.geometry?.alignment === 'right' ? 'right' : 'left',
      textFontSize: apsRevitImportCoordinates.toAppLength(raw.parameters?.TextSize || raw.parameters?.['Text Size'], 0.25 / 0.3048),
      levelId: level.id,
      layer: 'TEXT',
      viewId: 'plan',
    }, raw, ctx);
    addRow(ctx, raw, 'native', element);
    return element;
  }

  if (category.includes('dimension') || raw.className === 'Dimension') {
    if (!ctx.options.importDimensions) {
      addRow(ctx, raw, 'skipped', null, 'Dimension import option is disabled.');
      return null;
    }
    const curve = raw.geometry?.curves?.[0] || raw.geometry?.locationCurve;
    const endpoints = curveStartEnd(curve);
    if (!endpoints) {
      const fallback = createFallback(ctx, raw, 'Dimension references could not be mapped, so it was kept as a safe annotation fallback.');
      if (fallback) fallback.locked = true;
      return fallback;
    }
    const element = withImportMetadata({
      id: makeTargetId(ctx, raw, 'aps_revit_dimension'),
      type: 'dimension',
      p1: endpoints.p1,
      p2: endpoints.p2,
      label: raw.geometry?.valueText || raw.name,
      levelId: level.id,
      layer: 'DIMENSIONS',
      locked: false,
      viewId: 'plan',
    }, raw, ctx);
    addRow(ctx, raw, 'native', element);
    return element;
  }

  const curves = raw.geometry?.curves || (raw.geometry?.locationCurve ? [raw.geometry.locationCurve] : []);
  if (curves.length) {
    const id = makeTargetId(ctx, raw, 'aps_revit_curve');
    const shapes = curves.flatMap((curve, curveIndex) => curveToShape(curve, {
      id: curves.length === 1 ? id : `${id}_${curveIndex}`,
      levelId: level.id,
      layer: 'SHAPES',
      viewId: 'plan',
      label: raw.name,
    })).map(shape => withImportMetadata(shape, raw, ctx));
    shapes.forEach(shape => addRow(ctx, raw, 'native', shape));
    return shapes;
  }

  return createFallback(ctx, raw, 'Annotation geometry was not recognized.');
};

const createElement = (ctx: ConversionContext, raw: ApsRevitElementManifest, walls: ArchElement[]): NativeResult => {
  const category = cleanCategory(raw.category || raw.builtInCategory || raw.className);
  const nativeType = raw.ourAppParameters?.OurApp_NativeElementType;
  if (isSafeElementType(nativeType)) {
    const nativeCategory = cleanCategory(nativeType);
    if (nativeCategory === 'wall') return createWall(ctx, raw);
    if (nativeCategory === 'door') return createHosted(ctx, raw, walls, 'door');
    if (nativeCategory === 'window') return createHosted(ctx, raw, walls, 'window');
    if (nativeCategory === 'wallopening') return createHosted(ctx, raw, walls, 'wall-opening');
  }
  if (category.includes('wall') && !category.includes('opening')) return createWall(ctx, raw);
  if (category.includes('door')) return createHosted(ctx, raw, walls, 'door');
  if (category.includes('window')) return createHosted(ctx, raw, walls, 'window');
  if (category.includes('opening')) return createHosted(ctx, raw, walls, 'wall-opening');
  if (category.includes('floor')) return createBoundaryElement(ctx, raw, 'floor');
  if (category.includes('ceiling') || category.includes('roof')) return createBoundaryElement(ctx, raw, 'ceiling');
  if (category.includes('room') || raw.className === 'Room') return createBoundaryElement(ctx, raw, 'room');
  if (category.includes('column')) return createColumn(ctx, raw);
  if (category.includes('stair')) return createPathElement(ctx, raw, 'stair');
  if (category.includes('railing')) return createPathElement(ctx, raw, 'railing');
  if (category.includes('grid')) return createPathElement(ctx, raw, 'gridline');
  if (raw.isAnnotation || category.includes('line') || category.includes('curve') || category.includes('text') || category.includes('dimension')) {
    return createAnnotation(ctx, raw);
  }
  return createFallback(ctx, raw, 'No native canvas equivalent is currently available for this Revit category/family.');
};

const flattenResults = (value: NativeResult): ArchElement[] => Array.isArray(value) ? value : value ? [value] : [];

const projectBounds = (elements: ArchElement[]) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (point?: Point) => {
    if (!point) return;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  };
  elements.forEach(element => {
    visit(element.pos);
    visit(element.p1);
    visit(element.p2);
    visit(element.controlPoint);
    element.boundary?.forEach(visit);
  });
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 };
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
};

const countBy = <T,>(values: T[], key: (value: T) => string | undefined): Record<string, number> => (
  values.reduce<Record<string, number>>((counts, value) => {
    const name = key(value) || 'Unknown';
    counts[name] = (counts[name] || 0) + 1;
    return counts;
  }, {})
);

const buildReport = (
  ctx: ConversionContext,
  elements: ArchElement[],
  errors: string[],
): ApsRevitImportReport => {
  const fallbackElementCount = ctx.rows.filter(row => row.result === 'fallback').length;
  const skippedElementCount = ctx.rows.filter(row => row.result === 'skipped').length;
  const nativeElementCount = ctx.rows.filter(row => row.result === 'native').length;
  const bounds = projectBounds(elements);
  const selectedPlanViews = (ctx.manifest.views || []).filter(view => view.selectedForAnnotations);
  const ignoredPlanViews = (ctx.manifest.views || []).filter(view => !view.selectedForAnnotations);
  const wallCount = elements.filter(element => element.type === 'wall').length;
  const hostedWithoutWall = elements.filter(element => ['door', 'window', 'wall-opening'].includes(element.type) && !element.hostWallId).length;
  const validation: ApsRevitImportReport['validation'] = {
    hasLevels: ctx.levels.length > 0,
    hasElements: elements.length > 0,
    projectBoundingBox: `${bounds.minX.toFixed(3)},${bounds.minY.toFixed(3)} to ${bounds.maxX.toFixed(3)},${bounds.maxY.toFixed(3)}`,
    coordinateTransform: 'revit-internal feet -> meters, x=x, y=-y, z=z',
    wallCount,
    hostedElementsWithoutNativeWall: hostedWithoutWall,
    selectedPlanViewCount: selectedPlanViews.length,
    linkedModelCount: ctx.manifest.linkedModels?.length || 0,
    containsIfcStepSyntax: JSON.stringify(ctx.manifest).includes(STEP_SYNTAX_MARKER),
    emptyImportedProject: elements.length === 0,
  };
  return {
    importVersion: APS_REVIT_IMPORT_VERSION,
    status: errors.length ? 'failed' : ctx.warnings.length || fallbackElementCount || skippedElementCount ? 'completed_with_warnings' : 'completed',
    source: ctx.manifest.source,
    selectedRevitEngine: ctx.options.revitEngine,
    projectName: ctx.manifest.source.projectName || ctx.fileName.replace(/\.[^/.]+$/, ''),
    sourceElementCount: ctx.manifest.elements.length,
    importedElementCount: elements.length,
    nativeElementCount,
    fallbackElementCount,
    skippedElementCount,
    levels: ctx.levels.map(level => ({
      ...level,
      sourceElementId: level.metadata?.apsRevitImport?.sourceElementId,
      sourceUniqueId: level.metadata?.apsRevitImport?.sourceUniqueId,
    })),
    selectedPlanViews,
    ignoredPlanViews,
    linkedModels: ctx.manifest.linkedModels || [],
    classCounts: countBy(ctx.manifest.elements, raw => raw.category),
    targetTypeCounts: countBy(elements, element => element.type),
    elementMappings: ctx.rows,
    warnings: [...new Set([...ctx.manifest.warnings, ...ctx.warnings])],
    errors,
    validation,
  };
};

export const convertApsRevitExtractionToNative = (
  manifest: ApsRevitExtractionManifest,
  fileName = manifest.source?.fileName || 'Imported Revit Project.rvt',
  importOptions: Partial<ApsRevitImportOptions> = {},
): ApsRevitImportConversionResult => {
  const warnings = [...(manifest.warnings || [])];
  const errors: string[] = [];
  if (manifest.manifestVersion !== APS_REVIT_IMPORT_VERSION) {
    errors.push(`Unsupported APS Revit import manifest version: ${manifest.manifestVersion}`);
  }
  if (JSON.stringify(manifest).includes(STEP_SYNTAX_MARKER)) {
    errors.push('APS Revit Importer manifest must not contain IFC STEP syntax.');
  }

  const levels = createLevels(manifest, warnings);
  const ctx: ConversionContext = {
    manifest,
    fileName,
    options: { ...DEFAULT_OPTIONS, ...(manifest.options || {}), ...importOptions },
    levels,
    levelMap: new Map(),
    usedIds: new Set(),
    rows: [],
    warnings,
  };
  ctx.levelMap = buildLevelMap(levels, manifest);

  if (ctx.options.includeLinkedModelReferencesAsWarnings && manifest.linkedModels?.length) {
    manifest.linkedModels.forEach(link => {
      ctx.warnings.push(`Linked Revit model detected but not imported as editable elements in V1: ${link.name}`);
    });
  }

  const sourceElements = ctx.options.importModelElements
    ? manifest.elements
    : manifest.elements.filter(element => element.isAnnotation);
  const wallSource = sourceElements.filter(element => cleanCategory(element.category).includes('wall') && !cleanCategory(element.category).includes('opening'));
  const nonWallSource = sourceElements.filter(element => !wallSource.includes(element));
  const elements: ArchElement[] = [];
  const walls: ArchElement[] = [];

  wallSource.forEach(raw => {
    const wall = createWall(ctx, raw);
    if (!wall) return;
    walls.push(wall);
    elements.push(wall);
  });

  nonWallSource.forEach(raw => {
    const created = createElement(ctx, raw, walls);
    elements.push(...flattenResults(created));
  });

  if (!elements.length) {
    errors.push('APS Revit Importer produced an empty native project.');
  }

  const bounds = projectBounds(elements);
  const report = buildReport(ctx, elements, errors);
  const project: Project = {
    name: `${(manifest.source.projectName || fileName).replace(/\.[^/.]+$/, '')} - APS Revit Import`,
    mode: 'floorplan',
    levels,
    elements,
    layers: LAYERS,
    viewBox: {
      width: Math.max(100, bounds.width + 10),
      height: Math.max(100, bounds.height + 10),
    },
    settings3D: {
      ...DEFAULT_PROJECT_SETTINGS_3D,
      defaultLevelHeight: levels[0]?.height || WALL_HEIGHT_DEFAULT,
      wallHeight: levels[0]?.height || WALL_HEIGHT_DEFAULT,
      level1Z: levels[0]?.zElevation || 0,
      level2Z: levels[1]?.zElevation ?? ((levels[0]?.zElevation || 0) + (levels[0]?.height || WALL_HEIGHT_DEFAULT)),
    },
    metadata: {
      apsRevitImport: {
        importVersion: APS_REVIT_IMPORT_VERSION,
        importedAt: new Date().toISOString(),
        sourceFileName: fileName,
        source: manifest.source,
        options: ctx.options,
        reportSummary: {
          nativeElementCount: report.nativeElementCount,
          fallbackElementCount: report.fallbackElementCount,
          skippedElementCount: report.skippedElementCount,
          warnings: report.warnings.length,
          errors: report.errors.length,
        },
      },
    },
  };

  return {
    project,
    levels,
    elements,
    layers: LAYERS,
    report,
    canConvert: errors.length === 0 && elements.length > 0,
  };
};

export const getApsRevitImportSupportedCategories = () => [
  'Levels',
  'Walls',
  'Doors',
  'Windows',
  'Wall Openings',
  'Columns',
  'Floors',
  'Ceilings',
  'Stairs',
  'Railings',
  'Rooms',
  'Grids',
  'Detail/Model Curves',
  'Text Notes',
  'Dimensions',
  'Generic/custom families as blocks',
];
