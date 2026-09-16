import { ArchElement, Layer, Level, Point, Project } from '../types';
import {
  COLUMN_PRESETS,
  DEFAULT_PROJECT_SETTINGS_3D,
  DOOR_PRESETS,
  STAIR_PRESETS,
  WALL_HEIGHT_DEFAULT,
  WALL_PRESETS,
  WINDOW_PRESETS,
} from '../constants';

export type BimImportLogLevel = 'info' | 'warning' | 'error';

export interface BimImportLog {
  level: BimImportLogLevel;
  code: string;
  message: string;
  sourceElementId?: string;
  category?: string;
}

export interface BimImportStats {
  levels: number;
  totalSourceElements: number;
  nativeElements: number;
  genericElements: number;
  unsupportedElements: number;
  walls: number;
  doors: number;
  windows: number;
  openings: number;
  floors: number;
  ceilings: number;
  stairs: number;
  columns: number;
  railings: number;
  rooms: number;
  grids: number;
  dimensions: number;
  labels: number;
  shapes: number;
}

export interface BimImportConversionResult {
  project: Project;
  levels: Level[];
  elements: ArchElement[];
  layers: Layer[];
  logs: BimImportLog[];
  stats: BimImportStats;
  sourceMetadata: Record<string, any>;
  canConvert: boolean;
}

export interface BimImportSession {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: 'IFC' | 'UNKNOWN';
  status: 'preview-ready' | 'conversion-ready' | 'blocked';
  previewElements: ArchElement[];
  previewLevels: Level[];
  conversion: BimImportConversionResult;
  schema?: string;
  logs: BimImportLog[];
}

interface UnitContext {
  lengthScale: number;
  angleUnit: 'radians' | 'degrees';
  flipY: boolean;
}

type RawRecord = Record<string, any>;

const BIM_IMPORT_VERSION = 'bim-import-ifc-v1';

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
  { name: 'GRIDLINES', visible: true, locked: false },
  { name: 'DIMENSIONS', visible: true, locked: false },
  { name: 'ROOMS', visible: true, locked: false },
  { name: 'TEXT', visible: true, locked: false },
  { name: 'SHAPES', visible: true, locked: false },
  { name: 'BIM_GENERIC', visible: true, locked: false },
];

const emptyStats = (): BimImportStats => ({
  levels: 0,
  totalSourceElements: 0,
  nativeElements: 0,
  genericElements: 0,
  unsupportedElements: 0,
  walls: 0,
  doors: 0,
  windows: 0,
  openings: 0,
  floors: 0,
  ceilings: 0,
  stairs: 0,
  columns: 0,
  railings: 0,
  rooms: 0,
  grids: 0,
  dimensions: 0,
  labels: 0,
  shapes: 0,
});

const makeId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

const log = (
  logs: BimImportLog[],
  level: BimImportLogLevel,
  code: string,
  message: string,
  raw?: RawRecord,
) => {
  logs.push({
    level,
    code,
    message,
    sourceElementId: raw ? String(raw.id ?? raw.elementId ?? raw.uniqueId ?? raw.UniqueId ?? '') || undefined : undefined,
    category: raw ? String(raw.category ?? raw.Category ?? raw.builtInCategory ?? '') || undefined : undefined,
  });
};

const toFinite = (value: any): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (value && typeof value === 'object') {
    return toFinite(value.value ?? value.Value ?? value.number ?? value.length);
  }
  return undefined;
};

const cleanCategory = (value: any): string => String(value ?? '').trim().toLowerCase().replace(/^ost_/, '').replace(/[\s_-]+/g, '');

const firstDefined = <T,>(...values: T[]): T | undefined => values.find(value => value !== undefined && value !== null);

const getByPath = (obj: any, path: string): any => {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
};

const getAny = (obj: any, paths: string[]): any => {
  for (const path of paths) {
    const value = getByPath(obj, path);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
};

const getLengthScale = (unitName?: string): number => {
  const unit = String(unitName || 'feet').toLowerCase();
  if (unit.includes('millimeter') || unit === 'mm') return 0.001;
  if (unit.includes('centimeter') || unit === 'cm') return 0.01;
  if (unit.includes('meter') || unit === 'm') return 1;
  if (unit.includes('inch') || unit === 'in') return 0.0254;
  if (unit.includes('foot') || unit.includes('feet') || unit === 'ft' || unit === 'revit-internal') return 0.3048;
  return 0.3048;
};

const getUnitContext = (payload: any): UnitContext => ({
  lengthScale: getLengthScale(getAny(payload, ['units.length', 'units', 'lengthUnit', 'unit', 'displayUnit'])),
  angleUnit: String(getAny(payload, ['units.angle', 'angleUnit']) || 'radians').toLowerCase().includes('degree') ? 'degrees' : 'radians',
  flipY: getAny(payload, ['coordinateSystem.flipY', 'flipY']) !== false,
});

const toLength = (value: any, units: UnitContext, fallback = 0): number => {
  const numeric = toFinite(value);
  if (numeric === undefined) return fallback;
  const unitOverride = value && typeof value === 'object' ? String(value.unit ?? value.units ?? '').toLowerCase() : '';
  const scale = unitOverride ? getLengthScale(unitOverride) : units.lengthScale;
  return numeric * scale;
};

const toAngleRadians = (value: any, units: UnitContext, fallback = 0): number => {
  const numeric = toFinite(value);
  if (numeric === undefined) return fallback;
  return units.angleUnit === 'degrees' || Math.abs(numeric) > Math.PI * 2 + 0.001 ? numeric * Math.PI / 180 : numeric;
};

const toPoint = (value: any, units: UnitContext): Point | null => {
  if (!value) return null;
  const xRaw = Array.isArray(value) ? value[0] : firstDefined(value.x, value.X, value[0]);
  const yRaw = Array.isArray(value) ? value[1] : firstDefined(value.y, value.Y, value[1]);
  const x = toFinite(xRaw);
  const y = toFinite(yRaw);
  if (x === undefined || y === undefined) return null;
  return {
    x: x * units.lengthScale,
    y: (units.flipY ? -y : y) * units.lengthScale,
  };
};

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

const makeArcFromCenter = (
  center: Point,
  radius: number,
  startAngle: number,
  endAngle: number,
  counterclockwise = false,
) => {
  const tau = Math.PI * 2;
  let span = counterclockwise ? startAngle - endAngle : endAngle - startAngle;
  if (span < 0) span += tau;
  const midAngle = counterclockwise ? startAngle - span / 2 : startAngle + span / 2;
  const p1 = { x: center.x + Math.cos(startAngle) * radius, y: center.y + Math.sin(startAngle) * radius };
  const p2 = { x: center.x + Math.cos(endAngle) * radius, y: center.y + Math.sin(endAngle) * radius };
  const mid = { x: center.x + Math.cos(midAngle) * radius, y: center.y + Math.sin(midAngle) * radius };
  const controlPoint = { x: 2 * mid.x - (p1.x + p2.x) / 2, y: 2 * mid.y - (p1.y + p2.y) / 2 };
  return { p1, p2, controlPoint };
};

const curvePoint = (el: ArchElement, t: number): Point | null => {
  if (!el.p1 || !el.p2) return null;
  const source = el.wallSource || (['arc', 'circle', 'ellipse'].includes(el.type) || el.isCurved ? el.type : null);
  const tau = Math.PI * 2;
  const interpAngle = (start: number, end: number, amount: number, ccw = false) => {
    let span = ccw ? start - end : end - start;
    if (span < 0) span += tau;
    return ccw ? start - span * amount : start + span * amount;
  };
  if (source === 'circle') {
    const radius = Math.hypot(el.p2.x - el.p1.x, el.p2.y - el.p1.y);
    const a = t * tau;
    return { x: el.p1.x + Math.cos(a) * radius, y: el.p1.y + Math.sin(a) * radius };
  }
  if (source === 'ellipse') {
    const center = el.ellipseCenter || midpoint(el.p1, el.p2);
    const rx = el.ellipseRadiusX ?? Math.abs(el.p2.x - el.p1.x) / 2;
    const ry = el.ellipseRadiusY ?? Math.abs(el.p2.y - el.p1.y) / 2;
    const start = el.ellipseStartAngle ?? 0;
    const end = el.ellipseEndAngle ?? tau;
    const a = (el.ellipseStartAngle !== undefined || el.ellipseEndAngle !== undefined)
      ? interpAngle(start, end, t, el.ellipseCounterclockwise)
      : t * tau;
    const rotation = el.ellipseRotation || 0;
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    return { x: center.x + x * cosR - y * sinR, y: center.y + x * sinR + y * cosR };
  }
  if (source === 'arc') {
    if (el.arcCenter && el.arcRadius !== undefined && el.arcStartAngle !== undefined && el.arcEndAngle !== undefined) {
      const a = interpAngle(el.arcStartAngle, el.arcEndAngle, t, el.arcCounterclockwise);
      return { x: el.arcCenter.x + Math.cos(a) * el.arcRadius, y: el.arcCenter.y + Math.sin(a) * el.arcRadius };
    }
    const cp = el.controlPoint || midpoint(el.p1, el.p2);
    const mt = 1 - t;
    return {
      x: mt * mt * el.p1.x + 2 * mt * t * cp.x + t * t * el.p2.x,
      y: mt * mt * el.p1.y + 2 * mt * t * cp.y + t * t * el.p2.y,
    };
  }
  return { x: el.p1.x + t * (el.p2.x - el.p1.x), y: el.p1.y + t * (el.p2.y - el.p1.y) };
};

const nearestPointOnWall = (point: Point, wall: ArchElement) => {
  if (!wall.p1 || !wall.p2) return null;
  if (wall.isCurved || wall.wallSource === 'arc' || wall.wallSource === 'circle' || wall.wallSource === 'ellipse') {
    let best = { t: 0, point: wall.p1, dist: Infinity, angle: 0 };
    const samples = 96;
    for (let i = 0; i <= samples; i += 1) {
      const t = i / samples;
      const candidate = curvePoint(wall, t);
      if (!candidate) continue;
      const dist = Math.hypot(point.x - candidate.x, point.y - candidate.y);
      if (dist < best.dist) {
        const next = curvePoint(wall, Math.min(1, t + 0.005)) || candidate;
        best = {
          t,
          point: candidate,
          dist,
          angle: Math.atan2(next.y - candidate.y, next.x - candidate.x) * 180 / Math.PI,
        };
      }
    }
    return best;
  }
  const dx = wall.p2.x - wall.p1.x;
  const dy = wall.p2.y - wall.p1.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return null;
  const t = Math.max(0, Math.min(1, ((point.x - wall.p1.x) * dx + (point.y - wall.p1.y) * dy) / len2));
  const projected = { x: wall.p1.x + dx * t, y: wall.p1.y + dy * t };
  return {
    t,
    point: projected,
    dist: Math.hypot(point.x - projected.x, point.y - projected.y),
    angle: Math.atan2(dy, dx) * 180 / Math.PI,
  };
};

const findHostWall = (point: Point, walls: ArchElement[], preferredHostId?: string) => {
  const candidates = preferredHostId ? walls.filter(wall =>
    wall.bimSourceId === preferredHostId
    || wall.metadata?.bimImport?.sourceId === preferredHostId
    || wall.metadata?.bimImport?.sourceParentId === preferredHostId
  ) : walls;
  const pool = candidates.length ? candidates : walls;
  let best: ReturnType<typeof nearestPointOnWall> & { wall: ArchElement } | null = null;
  pool.forEach(wall => {
    const candidate = nearestPointOnWall(point, wall);
    if (!candidate) return;
    if (!best || candidate.dist < best.dist) best = { ...candidate, wall };
  });
  return best;
};

const getSourceId = (raw: RawRecord): string => {
  const existing = firstDefined(raw.id, raw.elementId, raw.uniqueId, raw.UniqueId, raw.sourceId);
  return String(existing ?? makeId('source'));
};

const getSourceCategory = (raw: RawRecord): string => String(firstDefined(raw.category, raw.Category, raw.builtInCategory, raw.className, raw.type, 'Unknown'));

const withBimMetadata = (el: ArchElement, raw: RawRecord, fileName: string, extra: Record<string, any> = {}): ArchElement => {
  const sourceId = getSourceId(raw);
  const sourceCategory = getSourceCategory(raw);
  const sourceParentId = firstDefined(raw.sourceParentId, raw.parentId, raw.ParentId);
  return {
    ...el,
    sourceType: 'bim_import',
    sourceFileType: 'ifc',
    sourceFileName: fileName,
    bimSourceId: sourceId,
    bimSourceCategory: sourceCategory,
    importTimestamp: new Date().toISOString(),
    importVersion: BIM_IMPORT_VERSION,
    metadata: {
      ...(el.metadata || {}),
      bimImport: {
        sourceId,
        sourceParentId,
        sourceCategory,
        sourceTypeName: firstDefined(raw.typeName, raw.name, raw.familyName, raw.symbolName),
        parameters: raw.parameters || raw.Parameters,
        ...extra,
      },
    },
  };
};

const matchPreset = <T extends Record<string, any>>(
  presets: T[],
  dimensions: Record<string, number | undefined>,
  tolerance = 0.002,
): T | undefined => presets.find(preset =>
  Object.entries(dimensions).every(([key, value]) => value === undefined || preset[key] === undefined || Math.abs(preset[key] - value) <= tolerance)
);

const readLevelName = (raw: RawRecord): string => String(firstDefined(raw.name, raw.Name, raw.levelName, raw.LevelName, `Level ${raw.order ?? ''}`)).trim() || 'Level';

const readLevelElevation = (raw: RawRecord, units: UnitContext): number => {
  const directMeters = toFinite(firstDefined(raw.zElevation, raw.elevationMeters, raw.elevationM));
  if (directMeters !== undefined) return directMeters;
  return toLength(firstDefined(raw.elevation, raw.Elevation, raw.z, raw.Z), units, 0);
};

const createLevels = (payload: any, units: UnitContext, logs: BimImportLog[]): Level[] => {
  const rawLevels = getAny(payload, ['levels', 'Levels', 'project.levels', 'model.levels']);
  const sourceLevels = Array.isArray(rawLevels) ? rawLevels : [];
  if (sourceLevels.length === 0) {
    log(logs, 'warning', 'NO_LEVELS', 'No IFC building storeys were found. A single BIM Level 1 preview level was created.');
    return [{ id: makeId('bim_level'), name: 'BIM Level 1', zElevation: 0, height: WALL_HEIGHT_DEFAULT, order: 0 }];
  }

  const sorted = sourceLevels
    .map((level, index) => ({
      raw: level,
      sourceId: String(firstDefined(level.id, level.elementId, level.uniqueId, level.name, index)),
      name: readLevelName(level),
      zElevation: readLevelElevation(level, units),
      order: toFinite(firstDefined(level.order, level.index, level.levelIndex)) ?? index,
    }))
    .sort((a, b) => a.zElevation - b.zElevation || a.order - b.order);

  return sorted.map((level, index) => {
    const next = sorted[index + 1];
    const explicitHeight = toLength(firstDefined(level.raw.height, level.raw.storyHeight), units, 0);
    return {
      id: `bim_level_${level.sourceId.replace(/[^A-Za-z0-9_-]+/g, '_')}_${index}`,
      name: level.name,
      zElevation: level.zElevation,
      height: explicitHeight > 0 ? explicitHeight : Math.max(0.1, next ? next.zElevation - level.zElevation : WALL_HEIGHT_DEFAULT),
      order: index,
    };
  });
};

const makeLevelMaps = (levels: Level[], payload: any) => {
  const rawLevels = Array.isArray(getAny(payload, ['levels', 'Levels', 'project.levels', 'model.levels']))
    ? getAny(payload, ['levels', 'Levels', 'project.levels', 'model.levels'])
    : [];
  const bySource = new Map<string, Level>();
  const byName = new Map<string, Level>();
  levels.forEach((level, index) => {
    const raw = rawLevels[index] || {};
    [raw.id, raw.elementId, raw.uniqueId, raw.name, raw.Name, level.name].forEach(value => {
      if (value !== undefined && value !== null) bySource.set(String(value), level);
    });
    byName.set(level.name.toLowerCase(), level);
  });
  return { bySource, byName };
};

const resolveLevel = (raw: RawRecord, levels: Level[], maps: ReturnType<typeof makeLevelMaps>, keys: string[]): Level => {
  for (const key of keys) {
    const value = getByPath(raw, key);
    if (value === undefined || value === null) continue;
    if (typeof value === 'object') {
      const nestedId = firstDefined(value.id, value.elementId, value.uniqueId, value.name, value.Name);
      if (nestedId !== undefined && maps.bySource.has(String(nestedId))) return maps.bySource.get(String(nestedId))!;
      const nestedName = readLevelName(value);
      if (maps.byName.has(nestedName.toLowerCase())) return maps.byName.get(nestedName.toLowerCase())!;
    }
    if (maps.bySource.has(String(value))) return maps.bySource.get(String(value))!;
    if (maps.byName.has(String(value).toLowerCase())) return maps.byName.get(String(value).toLowerCase())!;
  }
  return levels[0];
};

const readCurve = (raw: RawRecord, units: UnitContext) => {
  const geom = firstDefined(raw.geometry, raw.Geometry, raw.locationCurve, raw.curve, raw.path, raw);
  const kind = String(firstDefined(geom.kind, geom.type, geom.curveType, raw.curveType, '')).toLowerCase();
  const start = toPoint(firstDefined(geom.start, geom.Start, geom.p1, geom.from, raw.p1), units);
  const end = toPoint(firstDefined(geom.end, geom.End, geom.p2, geom.to, raw.p2), units);
  const center = toPoint(firstDefined(geom.center, geom.Center, raw.center), units);
  const controlPoint = toPoint(firstDefined(geom.controlPoint, geom.mid, geom.midPoint, raw.controlPoint), units);
  const points = Array.isArray(geom.points) ? geom.points.map((point: any) => toPoint(point, units)).filter(Boolean) as Point[] : [];
  const radius = toLength(firstDefined(geom.radius, geom.Radius, raw.radius), units, 0);
  const radiusX = toLength(firstDefined(geom.radiusX, geom.majorRadius, geom.rx, raw.radiusX), units, 0);
  const radiusY = toLength(firstDefined(geom.radiusY, geom.minorRadius, geom.ry, raw.radiusY), units, 0);
  const startAngle = toAngleRadians(firstDefined(geom.startAngle, geom.startParam, raw.startAngle), units, 0);
  const endAngle = toAngleRadians(firstDefined(geom.endAngle, geom.endParam, raw.endAngle), units, Math.PI * 2);
  return { kind, start, end, center, controlPoint, points, radius, radiusX, radiusY, startAngle, endAngle, geom };
};

const readBoundary = (raw: RawRecord, units: UnitContext): Point[] => {
  const geom = firstDefined(raw.geometry, raw.Geometry, raw);
  const candidate = firstDefined(geom.boundary, geom.profile, geom.outline, geom.points, geom.loop, geom.loops?.[0], raw.boundary);
  if (!Array.isArray(candidate)) return [];
  return candidate.map(point => toPoint(point, units)).filter(Boolean) as Point[];
};

const lineElementFromCurve = (raw: RawRecord, units: UnitContext, base: Partial<ArchElement>): ArchElement | null => {
  const curve = readCurve(raw, units);
  const p1 = curve.start || curve.points[0];
  const p2 = curve.end || curve.points[1];
  if (curve.kind.includes('circle') && curve.center && curve.radius > 0) {
    return {
      ...base,
      id: base.id || makeId('bim_shape'),
      type: 'circle',
      p1: curve.center,
      p2: { x: curve.center.x + curve.radius, y: curve.center.y },
      layer: base.layer || 'SHAPES',
    } as ArchElement;
  }
  if (curve.kind.includes('ellipse') && curve.center && (curve.radiusX > 0 || curve.radiusY > 0)) {
    const rx = curve.radiusX || curve.radius;
    const ry = curve.radiusY || curve.radiusX || curve.radius;
    return {
      ...base,
      id: base.id || makeId('bim_shape'),
      type: 'ellipse',
      p1: { x: curve.center.x - rx, y: curve.center.y - ry },
      p2: { x: curve.center.x + rx, y: curve.center.y + ry },
      ellipseCenter: curve.center,
      ellipseRadiusX: rx,
      ellipseRadiusY: ry,
      ellipseRotation: toAngleRadians(firstDefined(curve.geom.rotation, curve.geom.angle), units, 0),
      ellipseStartAngle: curve.startAngle,
      ellipseEndAngle: curve.endAngle,
      ellipseCounterclockwise: !!curve.geom.counterclockwise,
      isCurved: true,
      layer: base.layer || 'SHAPES',
    } as ArchElement;
  }
  if ((curve.kind.includes('arc') || (curve.center && curve.radius > 0 && p1 && p2)) && p1 && p2) {
    const arcData = curve.center && curve.radius > 0
      ? makeArcFromCenter(curve.center, curve.radius, curve.startAngle, curve.endAngle, !!curve.geom.counterclockwise)
      : { p1, p2, controlPoint: curve.controlPoint || midpoint(p1, p2) };
    return {
      ...base,
      id: base.id || makeId('bim_shape'),
      type: 'arc',
      p1: arcData.p1,
      p2: arcData.p2,
      controlPoint: arcData.controlPoint,
      arcCenter: curve.center || undefined,
      arcRadius: curve.radius || undefined,
      arcStartAngle: curve.center ? curve.startAngle : undefined,
      arcEndAngle: curve.center ? curve.endAngle : undefined,
      arcCounterclockwise: !!curve.geom.counterclockwise,
      isCurved: true,
      layer: base.layer || 'SHAPES',
    } as ArchElement;
  }
  if (p1 && p2) {
    return {
      ...base,
      id: base.id || makeId('bim_shape'),
      type: 'line',
      p1,
      p2,
      isCurved: false,
      layer: base.layer || 'SHAPES',
    } as ArchElement;
  }
  return null;
};

const createWall = (raw: RawRecord, units: UnitContext, levels: Level[], maps: ReturnType<typeof makeLevelMaps>, fileName: string, logs: BimImportLog[]): ArchElement | null => {
  const baseLevel = resolveLevel(raw, levels, maps, ['baseLevelId', 'baseLevel', 'levelId', 'level', 'constraints.baseLevel']);
  const topLevel = resolveLevel(raw, levels, maps, ['topLevelId', 'topLevel', 'constraints.topLevel']);
  const baseOffset = toLength(getAny(raw, ['baseOffset', 'constraints.baseOffset', 'parameters.Base Offset']), units, 0);
  const topOffset = toLength(getAny(raw, ['topOffset', 'constraints.topOffset', 'parameters.Top Offset']), units, 0);
  const explicitHeight = toLength(getAny(raw, ['height', 'unconnectedHeight', 'parameters.Unconnected Height']), units, 0);
  const height = explicitHeight > 0
    ? explicitHeight
    : Math.max(0.05, (topLevel.zElevation + topOffset) - (baseLevel.zElevation + baseOffset)) || baseLevel.height;
  const thickness = Math.max(0.01, toLength(getAny(raw, ['thickness', 'width', 'type.thickness', 'parameters.Width']), units, WALL_PRESETS[0].thickness));
  const preset = matchPreset(WALL_PRESETS, { thickness });
  const curve = readCurve(raw, units);
  const shapeBase: Partial<ArchElement> = {
    id: makeId('bim_wall'),
    type: 'wall',
    thickness,
    height,
    elevation: baseOffset,
    levelId: baseLevel.id,
    layer: 'WALLS',
    subType: preset?.id || `custom-wall-${Math.round(thickness * 1000)}mm`,
    label: preset?.label || `Custom Wall ${(thickness * 1000).toFixed(0)} mm`,
    bimBaseLevelId: baseLevel.id,
    bimTopLevelId: topLevel.id,
    baseOffset,
    topOffset,
  };

  let wall: ArchElement | null = null;
  if (curve.kind.includes('circle') && curve.center && curve.radius > 0) {
    wall = {
      ...shapeBase,
      p1: curve.center,
      p2: { x: curve.center.x + curve.radius, y: curve.center.y },
      wallSource: 'circle',
      isCurved: true,
    } as ArchElement;
  } else if (curve.kind.includes('ellipse') && curve.center && (curve.radiusX > 0 || curve.radiusY > 0)) {
    const rx = curve.radiusX || curve.radius;
    const ry = curve.radiusY || curve.radiusX || curve.radius;
    wall = {
      ...shapeBase,
      p1: { x: curve.center.x - rx, y: curve.center.y - ry },
      p2: { x: curve.center.x + rx, y: curve.center.y + ry },
      wallSource: 'ellipse',
      isCurved: true,
      ellipseCenter: curve.center,
      ellipseRadiusX: rx,
      ellipseRadiusY: ry,
      ellipseRotation: toAngleRadians(firstDefined(curve.geom.rotation, curve.geom.angle), units, 0),
      ellipseStartAngle: curve.startAngle,
      ellipseEndAngle: curve.endAngle,
      ellipseCounterclockwise: !!curve.geom.counterclockwise,
    } as ArchElement;
  } else if (curve.kind.includes('arc') || (curve.center && curve.radius > 0)) {
    const p1 = curve.start || curve.points[0];
    const p2 = curve.end || curve.points[1];
    if (curve.center && curve.radius > 0) {
      const arc = makeArcFromCenter(curve.center, curve.radius, curve.startAngle, curve.endAngle, !!curve.geom.counterclockwise);
      wall = {
        ...shapeBase,
        p1: arc.p1,
        p2: arc.p2,
        controlPoint: arc.controlPoint,
        wallSource: 'arc',
        isCurved: true,
        arcCenter: curve.center,
        arcRadius: curve.radius,
        arcStartAngle: curve.startAngle,
        arcEndAngle: curve.endAngle,
        arcCounterclockwise: !!curve.geom.counterclockwise,
      } as ArchElement;
    } else if (p1 && p2) {
      wall = {
        ...shapeBase,
        p1,
        p2,
        controlPoint: curve.controlPoint || midpoint(p1, p2),
        wallSource: 'arc',
        isCurved: true,
      } as ArchElement;
    }
  } else {
    const p1 = curve.start || curve.points[0];
    const p2 = curve.end || curve.points[1];
    if (p1 && p2) {
      wall = {
        ...shapeBase,
        p1,
        p2,
        wallSource: 'line',
        isCurved: false,
      } as ArchElement;
    }
  }

  if (!wall) {
    log(logs, 'warning', 'WALL_GEOMETRY_UNSUPPORTED', 'Wall skipped because no supported location curve was present.', raw);
    return null;
  }
  return withBimMetadata(wall, raw, fileName, { presetId: preset?.id, baseLevel: baseLevel.name, topLevel: topLevel.name });
};

const createHostedOpening = (
  raw: RawRecord,
  units: UnitContext,
  levels: Level[],
  maps: ReturnType<typeof makeLevelMaps>,
  walls: ArchElement[],
  fileName: string,
  openingType: 'door' | 'window' | 'wall-opening',
  logs: BimImportLog[],
): ArchElement | null => {
  const level = resolveLevel(raw, levels, maps, ['levelId', 'level', 'baseLevelId', 'baseLevel']);
  const pos = toPoint(firstDefined(raw.location, raw.insertionPoint, raw.origin, raw.point, raw.pos), units);
  if (!pos) {
    log(logs, 'warning', 'OPENING_LOCATION_MISSING', `${openingType} skipped because no insertion point was present.`, raw);
    return null;
  }
  const width = Math.max(0.05, toLength(getAny(raw, ['width', 'Width', 'parameters.Width']), units, openingType === 'door' ? 0.9 : 1.2));
  const height = Math.max(0.05, toLength(getAny(raw, ['height', 'Height', 'parameters.Height']), units, openingType === 'window' ? 1.2 : 2.1));
  const sillHeight = toLength(getAny(raw, ['sillHeight', 'parameters.Sill Height', 'parameters.SillHeight']), units, DEFAULT_PROJECT_SETTINGS_3D.windowSillHeight);
  const topHeight = toLength(getAny(raw, ['topHeight', 'headHeight', 'parameters.Head Height']), units, sillHeight + height);
  const preferredHostId = String(firstDefined(raw.hostId, raw.hostElementId, raw.host?.id, raw.HostId, ''));
  const host = findHostWall(pos, walls, preferredHostId || undefined);
  if (!host) {
    log(logs, 'warning', 'OPENING_HOST_NOT_FOUND', `${openingType} imported without a host wall.`, raw);
  }
  const doorPreset = openingType === 'door' ? matchPreset(DOOR_PRESETS, { width }, 0.003) : undefined;
  const winPreset = openingType === 'window' ? matchPreset(WINDOW_PRESETS, { width, height }, 0.003) : undefined;
  const el: ArchElement = {
    id: makeId(`bim_${openingType.replace('-', '_')}`),
    type: openingType,
    pos: host?.point || pos,
    rotation: host?.angle ?? toAngleRadians(firstDefined(raw.rotation, raw.angle), units, 0) * 180 / Math.PI,
    width,
    height: openingType === 'window' ? Math.max(0.05, topHeight - sillHeight) : height,
    elevation: openingType === 'window' ? sillHeight : toLength(getAny(raw, ['elevation', 'baseOffset']), units, 0),
    sillHeight: openingType === 'window' ? sillHeight : undefined,
    topHeight: openingType === 'window' ? topHeight : undefined,
    hostWallId: host?.wall.id,
    hostT: host?.t,
    facingFlipped: !!firstDefined(raw.facingFlipped, raw.mirrored, raw.isMirrored),
    isFlipped: !!firstDefined(raw.handFlipped, raw.handFlipped),
    subType: doorPreset?.subType || winPreset?.subType || `custom-${openingType}`,
    label: String(firstDefined(raw.typeName, raw.name, doorPreset?.label, winPreset?.label, openingType)),
    levelId: level.id,
    layer: openingType === 'door' ? 'DOORS' : openingType === 'window' ? 'WINDOWS' : 'OPENINGS',
  };
  return withBimMetadata(el, raw, fileName, {
    presetId: doorPreset?.id || winPreset?.id,
    hostSourceId: preferredHostId || undefined,
    hostWallId: host?.wall.id,
  });
};

const createColumn = (raw: RawRecord, units: UnitContext, levels: Level[], maps: ReturnType<typeof makeLevelMaps>, fileName: string, logs: BimImportLog[]): ArchElement | null => {
  const level = resolveLevel(raw, levels, maps, ['levelId', 'level', 'baseLevelId', 'baseLevel']);
  const pos = toPoint(firstDefined(raw.location, raw.origin, raw.point, raw.pos), units);
  if (!pos) {
    log(logs, 'warning', 'COLUMN_LOCATION_MISSING', 'Column skipped because no location point was present.', raw);
    return null;
  }
  const width = Math.max(0.05, toLength(getAny(raw, ['width', 'Width', 'dimensions.width', 'parameters.Width', 'parameters.b']), units, 0.45));
  const depth = Math.max(0.05, toLength(getAny(raw, ['depth', 'Depth', 'dimensions.depth', 'parameters.Depth', 'parameters.h']), units, width));
  const preset = matchPreset(COLUMN_PRESETS, { width, depth }, 0.005);
  const shape = cleanCategory(firstDefined(raw.shape, raw.familyName)).includes('round') ? 'circle' : (preset?.shape || 'rect');
  return withBimMetadata({
    id: makeId('bim_column'),
    type: 'column',
    pos,
    width,
    depth,
    height: toLength(getAny(raw, ['height', 'unconnectedHeight']), units, level.height),
    shape: shape as any,
    rotation: toAngleRadians(firstDefined(raw.rotation, raw.angle), units, 0) * 180 / Math.PI,
    label: preset?.label || `Custom Column ${(width * 1000).toFixed(0)}x${(depth * 1000).toFixed(0)} mm`,
    levelId: level.id,
    layer: 'COLUMNS',
  }, raw, fileName, { presetId: preset?.id });
};

const createBoundaryElement = (
  raw: RawRecord,
  units: UnitContext,
  levels: Level[],
  maps: ReturnType<typeof makeLevelMaps>,
  fileName: string,
  type: 'floor' | 'ceiling' | 'room',
  logs: BimImportLog[],
): ArchElement | null => {
  const level = resolveLevel(raw, levels, maps, ['levelId', 'level', 'baseLevelId', 'baseLevel']);
  const boundary = readBoundary(raw, units);
  const label = String(firstDefined(raw.name, raw.number, raw.typeName, type));
  if (type === 'room') {
    const pos = toPoint(firstDefined(raw.location, raw.center, raw.pos), units)
      || (boundary.length ? boundary.reduce((acc, point) => ({ x: acc.x + point.x / boundary.length, y: acc.y + point.y / boundary.length }), { x: 0, y: 0 }) : null);
    if (!pos) {
      log(logs, 'warning', 'ROOM_LOCATION_MISSING', 'Room skipped because no location or boundary was present.', raw);
      return null;
    }
    return withBimMetadata({
      id: makeId('bim_room'),
      type: 'room',
      pos,
      boundary: boundary.length ? boundary : undefined,
      label,
      levelId: level.id,
      layer: 'ROOMS',
    }, raw, fileName);
  }
  if (boundary.length < 3) {
    log(logs, 'warning', 'BOUNDARY_MISSING', `${type} skipped because its boundary was missing or incomplete.`, raw);
    return null;
  }
  return withBimMetadata({
    id: makeId(`bim_${type}`),
    type,
    boundary,
    height: toLength(getAny(raw, ['thickness', 'height', 'parameters.Thickness']), units, DEFAULT_PROJECT_SETTINGS_3D.slabThickness),
    elevation: toLength(getAny(raw, ['elevation', 'offset', 'heightOffsetFromLevel']), units, 0),
    levelId: level.id,
    layer: type === 'floor' ? 'FLOORS' : 'CEILINGS',
  }, raw, fileName);
};

const createStair = (raw: RawRecord, units: UnitContext, levels: Level[], maps: ReturnType<typeof makeLevelMaps>, fileName: string, logs: BimImportLog[]): ArchElement | null => {
  const level = resolveLevel(raw, levels, maps, ['baseLevelId', 'baseLevel', 'levelId', 'level']);
  const curve = readCurve(raw, units);
  const p1 = curve.start || curve.points[0] || toPoint(firstDefined(raw.start, raw.bottomPoint), units);
  const p2 = curve.end || curve.points[curve.points.length - 1] || toPoint(firstDefined(raw.end, raw.topPoint), units);
  if (!p1 || !p2) {
    log(logs, 'warning', 'STAIR_PATH_MISSING', 'Stair skipped because no run path was present.', raw);
    return null;
  }
  const width = Math.max(0.2, toLength(getAny(raw, ['width', 'actualRunWidth', 'parameters.Actual Run Width']), units, STAIR_PRESETS[0].width));
  const preset = matchPreset(STAIR_PRESETS, { width }, 0.05);
  return withBimMetadata({
    id: makeId('bim_stair'),
    type: 'stair',
    p1,
    p2,
    width,
    subType: preset?.subType || String(firstDefined(raw.shape, raw.stairType, 'linear')),
    height: toLength(getAny(raw, ['height', 'actualRiserHeight']), units, level.height),
    levelId: level.id,
    layer: 'STAIRS',
    metadata: {
      stepCount: toFinite(firstDefined(raw.stepCount, raw.riserCount, raw.actualRisersNumber)),
    },
  }, raw, fileName, {
    stepCount: toFinite(firstDefined(raw.stepCount, raw.riserCount, raw.actualRisersNumber)),
  });
};

const createPathSegments = (
  raw: RawRecord,
  units: UnitContext,
  levels: Level[],
  maps: ReturnType<typeof makeLevelMaps>,
  fileName: string,
  type: 'railing' | 'gridline',
  logs: BimImportLog[],
): ArchElement[] => {
  const level = resolveLevel(raw, levels, maps, ['levelId', 'level', 'baseLevelId', 'baseLevel']);
  const curve = readCurve(raw, units);
  const points = curve.points.length ? curve.points : [curve.start, curve.end].filter(Boolean) as Point[];
  if (points.length < 2) {
    const direct = lineElementFromCurve(raw, units, { type, levelId: level.id, layer: type === 'railing' ? 'RAILINGS' : 'GRIDLINES' });
    if (direct?.p1 && direct.p2) return [withBimMetadata({ ...direct, type, layer: type === 'railing' ? 'RAILINGS' : 'GRIDLINES' }, raw, fileName)];
    log(logs, 'warning', 'PATH_MISSING', `${type} skipped because no path was present.`, raw);
    return [];
  }
  return points.slice(0, -1).map((point, index) => withBimMetadata({
    id: makeId(`bim_${type}`),
    type,
    p1: point,
    p2: points[index + 1],
    label: type === 'gridline' ? String(firstDefined(raw.name, raw.label, index + 1)) : undefined,
    height: type === 'railing' ? toLength(getAny(raw, ['height', 'topRailHeight']), units, 1.1) : undefined,
    levelId: level.id,
    layer: type === 'railing' ? 'RAILINGS' : 'GRIDLINES',
  }, raw, fileName));
};

const createAnnotation = (raw: RawRecord, units: UnitContext, levels: Level[], maps: ReturnType<typeof makeLevelMaps>, fileName: string, type: 'dimension' | 'label'): ArchElement | null => {
  const level = resolveLevel(raw, levels, maps, ['levelId', 'level', 'view.levelId']);
  if (type === 'dimension') {
    const curve = readCurve(raw, units);
    const p1 = curve.start || curve.points[0];
    const p2 = curve.end || curve.points[1];
    if (!p1 || !p2) return null;
    return withBimMetadata({
      id: makeId('bim_dimension'),
      type: 'dimension',
      p1,
      p2,
      label: String(firstDefined(raw.valueString, raw.text, raw.label, '')),
      dimensionColor: '#334155',
      dimensionLineThickness: 0.8,
      dimensionShowExtension: true,
      levelId: level.id,
      layer: 'DIMENSIONS',
    }, raw, fileName);
  }
  const pos = toPoint(firstDefined(raw.location, raw.origin, raw.point, raw.pos), units);
  if (!pos) return null;
  return withBimMetadata({
    id: makeId('bim_label'),
    type: 'label',
    pos,
    label: String(firstDefined(raw.text, raw.label, raw.name, 'IFC Note')),
    rotation: toAngleRadians(firstDefined(raw.rotation, raw.angle), units, 0) * 180 / Math.PI,
    textFontSize: 12,
    textFontFamily: 'Arial',
    levelId: level.id,
    layer: 'TEXT',
  }, raw, fileName);
};

const createUnsupported = (raw: RawRecord, units: UnitContext, levels: Level[], maps: ReturnType<typeof makeLevelMaps>, fileName: string): ArchElement => {
  const level = resolveLevel(raw, levels, maps, ['levelId', 'level', 'baseLevelId', 'baseLevel']);
  const boundary = readBoundary(raw, units);
  const pos = toPoint(firstDefined(raw.location, raw.origin, raw.center, raw.point, raw.pos), units)
    || (boundary.length ? boundary.reduce((acc, point) => ({ x: acc.x + point.x / boundary.length, y: acc.y + point.y / boundary.length }), { x: 0, y: 0 }) : { x: 0, y: 0 });
  const width = Math.max(0.2, toLength(getAny(raw, ['width', 'bbox.width', 'dimensions.width']), units, 1.2));
  const depth = Math.max(0.2, toLength(getAny(raw, ['depth', 'bbox.depth', 'dimensions.depth']), units, 1.2));
  const height = Math.max(0.05, toLength(getAny(raw, ['height', 'bbox.height', 'dimensions.height']), units, 0.75));
  return withBimMetadata({
    id: makeId('bim_generic'),
    type: 'asset',
    assetType: 'bim-object',
    pos,
    width,
    depth,
    height,
    scale: Math.max(width, depth, height, 0.2) / 1.2,
    label: String(firstDefined(raw.name, raw.familyName, raw.typeName, getSourceCategory(raw), 'BIM Object')),
    levelId: level.id,
    layer: 'BIM_GENERIC',
  }, raw, fileName, { conversionStatus: 'generic-fallback' });
};

const incrementStats = (stats: BimImportStats, el: ArchElement, generic = false) => {
  if (generic) {
    stats.genericElements += 1;
    stats.unsupportedElements += 1;
    return;
  }
  stats.nativeElements += 1;
  if (el.type === 'wall') stats.walls += 1;
  else if (el.type === 'door') stats.doors += 1;
  else if (el.type === 'window') stats.windows += 1;
  else if (el.type === 'wall-opening') stats.openings += 1;
  else if (el.type === 'floor') stats.floors += 1;
  else if (el.type === 'ceiling') stats.ceilings += 1;
  else if (el.type === 'stair') stats.stairs += 1;
  else if (el.type === 'column') stats.columns += 1;
  else if (el.type === 'railing') stats.railings += 1;
  else if (el.type === 'room') stats.rooms += 1;
  else if (el.type === 'gridline') stats.grids += 1;
  else if (el.type === 'dimension') stats.dimensions += 1;
  else if (el.type === 'label') stats.labels += 1;
  else if (['line', 'arc', 'circle', 'ellipse', 'rectangle'].includes(el.type)) stats.shapes += 1;
};

type IfcValue = number | string | boolean | undefined | IfcRef | IfcTypedValue | IfcValue[];
interface IfcRef { ref: number }
interface IfcTypedValue { type: string; args: IfcValue[] }
interface IfcRecord {
  id: number;
  type: string;
  args: IfcValue[];
  rawArgs: string;
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Transform3 {
  origin: Vec3;
  xAxis: Vec3;
  yAxis: Vec3;
  zAxis: Vec3;
}

interface IfcParsePayload {
  version: string;
  schema?: string;
  units: {
    length: string;
    angle: string;
  };
  coordinateSystem: {
    flipY: boolean;
  };
  levels: RawRecord[];
  elements: RawRecord[];
  parserWarnings: Array<{ code: string; message: string; sourceElementId?: string; category?: string }>;
}

const IDENTITY_TRANSFORM: Transform3 = {
  origin: { x: 0, y: 0, z: 0 },
  xAxis: { x: 1, y: 0, z: 0 },
  yAxis: { x: 0, y: 1, z: 0 },
  zAxis: { x: 0, y: 0, z: 1 },
};

const isIfcRef = (value: IfcValue): value is IfcRef => !!value && typeof value === 'object' && !Array.isArray(value) && 'ref' in value;
const isIfcTyped = (value: IfcValue): value is IfcTypedValue => !!value && typeof value === 'object' && !Array.isArray(value) && 'type' in value && 'args' in value;

const decodeIfcString = (value: string): string => value
  .slice(1, -1)
  .replace(/''/g, "'");

const splitTopLevel = (raw: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let start = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      if (ch === "'" && raw[i + 1] === "'") {
        i += 1;
      } else if (ch === "'") {
        inString = false;
      }
      continue;
    }
    if (ch === "'") inString = true;
    else if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(raw.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = raw.slice(start).trim();
  if (tail || raw.trim()) parts.push(tail);
  return parts;
};

const parseIfcValue = (token: string): IfcValue => {
  const value = token.trim();
  if (!value || value === '$' || value === '*') return undefined;
  if (value.startsWith("'") && value.endsWith("'")) return decodeIfcString(value);
  if (/^#\d+$/i.test(value)) return { ref: Number(value.slice(1)) };
  if (value.startsWith('(') && value.endsWith(')')) {
    return splitTopLevel(value.slice(1, -1)).map(parseIfcValue);
  }
  if (/^\.[^.]+\.$/.test(value)) {
    const enumValue = value.slice(1, -1).toUpperCase();
    if (enumValue === 'T') return true;
    if (enumValue === 'F') return false;
    return enumValue;
  }
  const typed = value.match(/^([A-Z][A-Z0-9_]*)\(([\s\S]*)\)$/i);
  if (typed) {
    return {
      type: typed[1].toUpperCase(),
      args: splitTopLevel(typed[2]).map(parseIfcValue),
    };
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  return value;
};

const parseIfcStepRecords = (text: string): Map<number, IfcRecord> => {
  const records = new Map<number, IfcRecord>();
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '#') continue;
    let cursor = i + 1;
    while (/\d/.test(text[cursor] || '')) cursor += 1;
    const id = Number(text.slice(i + 1, cursor));
    while (/\s/.test(text[cursor] || '')) cursor += 1;
    if (text[cursor] !== '=') continue;
    cursor += 1;
    while (/\s/.test(text[cursor] || '')) cursor += 1;
    const typeStart = cursor;
    while (/[A-Z0-9_]/i.test(text[cursor] || '')) cursor += 1;
    const type = text.slice(typeStart, cursor).toUpperCase();
    while (/\s/.test(text[cursor] || '')) cursor += 1;
    if (text[cursor] !== '(') continue;
    cursor += 1;
    const argsStart = cursor;
    let depth = 1;
    let inString = false;
    while (cursor < text.length && depth > 0) {
      const ch = text[cursor];
      if (inString) {
        if (ch === "'" && text[cursor + 1] === "'") {
          cursor += 2;
          continue;
        }
        if (ch === "'") inString = false;
      } else if (ch === "'") {
        inString = true;
      } else if (ch === '(') {
        depth += 1;
      } else if (ch === ')') {
        depth -= 1;
      }
      cursor += 1;
    }
    const rawArgs = text.slice(argsStart, cursor - 1);
    records.set(id, { id, type, args: splitTopLevel(rawArgs).map(parseIfcValue), rawArgs });
    i = cursor;
  }
  return records;
};

const unwrapIfcValue = (value: IfcValue): IfcValue => {
  if (isIfcTyped(value)) return unwrapIfcValue(value.args[0]);
  return value;
};

const ifcNumber = (value: IfcValue, fallback = 0): number => {
  const unwrapped = unwrapIfcValue(value);
  return typeof unwrapped === 'number' && Number.isFinite(unwrapped) ? unwrapped : fallback;
};

const ifcString = (value: IfcValue, fallback = ''): string => {
  const unwrapped = unwrapIfcValue(value);
  if (typeof unwrapped === 'string') return unwrapped;
  if (typeof unwrapped === 'number') return String(unwrapped);
  if (typeof unwrapped === 'boolean') return unwrapped ? 'true' : 'false';
  return fallback;
};

const ifcRefId = (value: IfcValue): number | undefined => isIfcRef(value) ? value.ref : undefined;
const ifcRefIds = (value: IfcValue): number[] => Array.isArray(value) ? value.map(ifcRefId).filter((id): id is number => id !== undefined) : [];

const vec = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
const addVec = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const subVec = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scaleVec = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
const dotVec = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const crossVec = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const lengthVec = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const normalizeVec = (a: Vec3, fallback: Vec3): Vec3 => {
  const length = lengthVec(a);
  return length > 1e-9 ? scaleVec(a, 1 / length) : fallback;
};

const applyTransform = (transform: Transform3, point: Vec3): Vec3 => addVec(
  addVec(addVec(transform.origin, scaleVec(transform.xAxis, point.x)), scaleVec(transform.yAxis, point.y)),
  scaleVec(transform.zAxis, point.z),
);

const applyDirection = (transform: Transform3, direction: Vec3): Vec3 => addVec(
  addVec(scaleVec(transform.xAxis, direction.x), scaleVec(transform.yAxis, direction.y)),
  scaleVec(transform.zAxis, direction.z),
);

const composeTransforms = (parent: Transform3, child: Transform3): Transform3 => ({
  origin: applyTransform(parent, child.origin),
  xAxis: normalizeVec(applyDirection(parent, child.xAxis), parent.xAxis),
  yAxis: normalizeVec(applyDirection(parent, child.yAxis), parent.yAxis),
  zAxis: normalizeVec(applyDirection(parent, child.zAxis), parent.zAxis),
});

const rawPoint = (point: Vec3) => ({ x: point.x, y: point.y, z: point.z });

const bboxFromPoints = (points: Vec3[]) => {
  if (!points.length) return null;
  return points.reduce((acc, point) => ({
    minX: Math.min(acc.minX, point.x),
    minY: Math.min(acc.minY, point.y),
    minZ: Math.min(acc.minZ, point.z),
    maxX: Math.max(acc.maxX, point.x),
    maxY: Math.max(acc.maxY, point.y),
    maxZ: Math.max(acc.maxZ, point.z),
  }), {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
  });
};

const closeBoundary = (points: Vec3[]): Vec3[] => {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  return Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z) < 1e-6 ? points : [...points, first];
};

const interpolateChain = (points: Vec3[], t: number): Vec3 => {
  if (points.length === 1) return points[0];
  const scaled = Math.max(0, Math.min(1, t)) * (points.length - 1);
  const index = Math.min(points.length - 2, Math.floor(scaled));
  const local = scaled - index;
  return {
    x: points[index].x + (points[index + 1].x - points[index].x) * local,
    y: points[index].y + (points[index + 1].y - points[index].y) * local,
    z: points[index].z + (points[index + 1].z - points[index].z) * local,
  };
};

const resamplePolyline = (points: Vec3[], maxPoints = 18): Vec3[] => {
  if (points.length <= maxPoints) return points;
  return Array.from({ length: maxPoints }, (_, index) => interpolateChain(points, index / (maxPoints - 1)));
};

const deriveCenterlineFromClosedProfile = (points: Vec3[]): Vec3[] => {
  if (points.length < 8) return [];
  let loop = [...points];
  const first = loop[0];
  const last = loop[loop.length - 1];
  if (Math.hypot(first.x - last.x, first.y - last.y, first.z - last.z) < 1e-6) loop = loop.slice(0, -1);
  if (loop.length < 8) return [];

  let split = -1;
  let maxDistance = 0;
  for (let i = 0; i < loop.length - 1; i += 1) {
    const distance = Math.hypot(loop[i].x - loop[i + 1].x, loop[i].y - loop[i + 1].y, loop[i].z - loop[i + 1].z);
    if (distance > maxDistance) {
      maxDistance = distance;
      split = i;
    }
  }
  if (split < 2 || split > loop.length - 4) return [];
  const firstChain = loop.slice(0, split + 1);
  const secondChain = loop.slice(split + 1).reverse();
  if (firstChain.length < 2 || secondChain.length < 2) return [];
  const count = Math.max(4, Math.min(32, Math.max(firstChain.length, secondChain.length)));
  return resamplePolyline(Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    const a = interpolateChain(firstChain, t);
    const b = interpolateChain(secondChain, t);
    return vec((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  }));
};

const fitArcFromPoints = (points: Vec3[]) => {
  if (points.length < 5) return null;
  const a = points[0];
  const b = points[Math.floor(points.length / 2)];
  const c = points[points.length - 1];
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-9) return null;
  const ux = (
    (a.x * a.x + a.y * a.y) * (b.y - c.y)
    + (b.x * b.x + b.y * b.y) * (c.y - a.y)
    + (c.x * c.x + c.y * c.y) * (a.y - b.y)
  ) / d;
  const uy = (
    (a.x * a.x + a.y * a.y) * (c.x - b.x)
    + (b.x * b.x + b.y * b.y) * (a.x - c.x)
    + (c.x * c.x + c.y * c.y) * (b.x - a.x)
  ) / d;
  const center = vec(ux, uy, 0);
  const radius = Math.hypot(a.x - ux, a.y - uy);
  if (!Number.isFinite(radius) || radius < 1e-6) return null;
  const averageError = points.reduce((sum, point) => sum + Math.abs(Math.hypot(point.x - ux, point.y - uy) - radius), 0) / points.length;
  if (averageError > radius * 0.04) return null;
  return {
    center,
    radius,
    startAngle: Math.atan2(a.y - uy, a.x - ux),
    endAngle: Math.atan2(c.y - uy, c.x - ux),
  };
};

const parseIfcTextToPayload = (text: string): IfcParsePayload => {
  const records = parseIfcStepRecords(text);
  const schema = text.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i)?.[1];
  const parserWarnings: IfcParsePayload['parserWarnings'] = [];

  const record = (value?: IfcValue | number): IfcRecord | undefined => {
    if (typeof value === 'number') return records.get(value);
    const id = ifcRefId(value);
    return id === undefined ? undefined : records.get(id);
  };

  const byType = (types: string[]) => Array.from(records.values()).filter(item => types.includes(item.type));

  const getPoint = (value?: IfcValue): Vec3 | null => {
    const item = record(value);
    if (!item || item.type !== 'IFCCARTESIANPOINT') return null;
    const coords = Array.isArray(item.args[0]) ? item.args[0] : [];
    return vec(ifcNumber(coords[0], 0), ifcNumber(coords[1], 0), ifcNumber(coords[2], 0));
  };

  const getDirection = (value?: IfcValue, fallback = vec(1, 0, 0)): Vec3 => {
    const item = record(value);
    if (!item || item.type !== 'IFCDIRECTION') return fallback;
    const coords = Array.isArray(item.args[0]) ? item.args[0] : [];
    return normalizeVec(vec(ifcNumber(coords[0], fallback.x), ifcNumber(coords[1], fallback.y), ifcNumber(coords[2], fallback.z)), fallback);
  };

  const getAxisPlacement = (value?: IfcValue): Transform3 => {
    const item = record(value);
    if (!item) return IDENTITY_TRANSFORM;
    if (item.type === 'IFCAXIS2PLACEMENT2D') {
      const origin = getPoint(item.args[0]) || vec(0, 0, 0);
      const xAxis = getDirection(item.args[1], vec(1, 0, 0));
      return {
        origin,
        xAxis,
        yAxis: normalizeVec(vec(-xAxis.y, xAxis.x, 0), vec(0, 1, 0)),
        zAxis: vec(0, 0, 1),
      };
    }
    if (item.type === 'IFCAXIS2PLACEMENT3D') {
      const origin = getPoint(item.args[0]) || vec(0, 0, 0);
      const zAxis = getDirection(item.args[1], vec(0, 0, 1));
      let xAxis = getDirection(item.args[2], Math.abs(zAxis.z) > 0.9 ? vec(1, 0, 0) : vec(0, 0, 1));
      let yAxis = normalizeVec(crossVec(zAxis, xAxis), vec(0, 1, 0));
      xAxis = normalizeVec(crossVec(yAxis, zAxis), xAxis);
      yAxis = normalizeVec(yAxis, vec(0, 1, 0));
      return { origin, xAxis, yAxis, zAxis };
    }
    return IDENTITY_TRANSFORM;
  };

  const getCartesianTransform = (value?: IfcValue): Transform3 => {
    const item = record(value);
    if (!item || !item.type.startsWith('IFCCARTESIANTRANSFORMATIONOPERATOR')) return IDENTITY_TRANSFORM;
    const scale = ifcNumber(item.args[3], 1);
    const origin = getPoint(item.args[2]) || vec(0, 0, 0);
    const xAxis = scaleVec(getDirection(item.args[0], vec(1, 0, 0)), scale);
    const yAxis = scaleVec(getDirection(item.args[1], vec(0, 1, 0)), scale);
    const zAxis = scaleVec(getDirection(item.args[4], vec(0, 0, 1)), scale);
    return { origin, xAxis, yAxis, zAxis };
  };

  const placementMemo = new Map<number, Transform3>();
  const getLocalPlacement = (value?: IfcValue): Transform3 => {
    const id = ifcRefId(value);
    if (id === undefined) return IDENTITY_TRANSFORM;
    if (placementMemo.has(id)) return placementMemo.get(id)!;
    const item = records.get(id);
    if (!item || item.type !== 'IFCLOCALPLACEMENT') return IDENTITY_TRANSFORM;
    const parent = getLocalPlacement(item.args[0]);
    const relative = getAxisPlacement(item.args[1]);
    const placement = composeTransforms(parent, relative);
    placementMemo.set(id, placement);
    return placement;
  };

  const getLengthUnitName = () => {
    const assignment = byType(['IFCUNITASSIGNMENT'])[0];
    const assigned = ifcRefIds(assignment?.args[0]);
    for (const id of assigned) {
      const unit = records.get(id);
      if (!unit) continue;
      if (unit.type === 'IFCCONVERSIONBASEDUNIT' && ifcString(unit.args[1]).toUpperCase() === 'LENGTHUNIT') {
        const name = ifcString(unit.args[2]).toLowerCase();
        if (name.includes('foot')) return 'foot';
        if (name.includes('inch')) return 'inch';
        if (name.includes('met')) return 'meter';
      }
      if (unit.type === 'IFCSIUNIT' && ifcString(unit.args[1]).toUpperCase() === 'LENGTHUNIT') {
        const prefix = ifcString(unit.args[2]).toUpperCase();
        const unitName = ifcString(unit.args[3]).toUpperCase();
        if (unitName === 'METRE' && prefix === 'MILLI') return 'millimeter';
        if (unitName === 'METRE' && prefix === 'CENTI') return 'centimeter';
        if (unitName === 'METRE') return 'meter';
      }
    }
    return 'meter';
  };

  const materialByProduct = new Map<number, number>();
  byType(['IFCRELASSOCIATESMATERIAL']).forEach(rel => {
    const materialId = ifcRefId(rel.args[5]);
    if (materialId === undefined) return;
    ifcRefIds(rel.args[4]).forEach(productId => materialByProduct.set(productId, materialId));
  });

  const materialThickness = (materialId?: number): number | undefined => {
    if (materialId === undefined) return undefined;
    const item = records.get(materialId);
    if (!item) return undefined;
    if (item.type === 'IFCMATERIALLAYER') return ifcNumber(item.args[1], 0) || undefined;
    if (item.type === 'IFCMATERIALLAYERSET') {
      const total = ifcRefIds(item.args[0]).reduce((sum, layerId) => sum + (materialThickness(layerId) || 0), 0);
      return total || undefined;
    }
    if (item.type === 'IFCMATERIALLAYERSETUSAGE') return materialThickness(ifcRefId(item.args[0]));
    return undefined;
  };

  const productStorey = new Map<number, number>();
  const aggregateParent = new Map<number, number>();
  byType(['IFCRELCONTAINEDINSPATIALSTRUCTURE']).forEach(rel => {
    const storeyId = ifcRefId(rel.args[5]);
    if (storeyId === undefined) return;
    ifcRefIds(rel.args[4]).forEach(productId => productStorey.set(productId, storeyId));
  });
  byType(['IFCRELAGGREGATES']).forEach(rel => {
    const parentId = ifcRefId(rel.args[4]);
    if (parentId === undefined) return;
    ifcRefIds(rel.args[5]).forEach(childId => aggregateParent.set(childId, parentId));
  });

  const resolveStorey = (productId: number, seen = new Set<number>()): number | undefined => {
    if (productStorey.has(productId)) return productStorey.get(productId);
    if (seen.has(productId)) return undefined;
    seen.add(productId);
    const parentId = aggregateParent.get(productId);
    return parentId === undefined ? undefined : resolveStorey(parentId, seen);
  };

  const storeys = byType(['IFCBUILDINGSTOREY'])
    .map((storey, index) => {
      const placement = getLocalPlacement(storey.args[5]);
      return {
        id: `#${storey.id}`,
        elementId: `#${storey.id}`,
        uniqueId: ifcString(storey.args[0], `#${storey.id}`),
        name: ifcString(storey.args[2], ifcString(storey.args[7], `Storey ${index + 1}`)),
        elevation: ifcNumber(storey.args[9], placement.origin.z),
        order: index,
        className: storey.type,
      };
    })
    .sort((a, b) => a.elevation - b.elevation || a.order - b.order);

  const nextStoreyById = new Map<string, string>();
  storeys.forEach((storey, index) => {
    const next = storeys[index + 1];
    if (next) nextStoreyById.set(storey.id, next.id);
  });

  const voidHostByOpening = new Map<number, number>();
  const fillOpeningByElement = new Map<number, number>();
  const fillingByOpening = new Map<number, number>();
  byType(['IFCRELVOIDSELEMENT']).forEach(rel => {
    const host = ifcRefId(rel.args[4]);
    const opening = ifcRefId(rel.args[5]);
    if (host !== undefined && opening !== undefined) voidHostByOpening.set(opening, host);
  });
  byType(['IFCRELFILLSELEMENT']).forEach(rel => {
    const opening = ifcRefId(rel.args[4]);
    const filling = ifcRefId(rel.args[5]);
    if (opening !== undefined && filling !== undefined) {
      fillOpeningByElement.set(filling, opening);
      fillingByOpening.set(opening, filling);
    }
  });

  const getShapeRepresentations = (productShapeId?: number | IfcValue, identifier?: string) => {
    const productShape = record(productShapeId);
    if (!productShape || productShape.type !== 'IFCPRODUCTDEFINITIONSHAPE') return [] as IfcRecord[];
    const reps = ifcRefIds(productShape.args[2]).map(id => records.get(id)).filter((item): item is IfcRecord => !!item);
    return identifier ? reps.filter(rep => ifcString(rep.args[1]).toLowerCase() === identifier.toLowerCase()) : reps;
  };

  const getRepresentationItems = (representation: IfcRecord, inherited = IDENTITY_TRANSFORM): Array<{ id: number; transform: Transform3 }> => {
    const items: Array<{ id: number; transform: Transform3 }> = [];
    ifcRefIds(representation.args[3]).forEach(itemId => {
      const item = records.get(itemId);
      if (!item) return;
      if (item.type === 'IFCMAPPEDITEM') {
        const map = record(item.args[0]);
        const mapRepresentation = record(map?.args[1]);
        if (!mapRepresentation) return;
        const mapOrigin = getAxisPlacement(map?.args[0]);
        const operator = getCartesianTransform(item.args[1]);
        const mappedTransform = composeTransforms(composeTransforms(inherited, operator), mapOrigin);
        items.push(...getRepresentationItems(mapRepresentation, mappedTransform));
      } else if (item.type === 'IFCGEOMETRICCURVESET') {
        ifcRefIds(item.args[0]).forEach(curveId => items.push({ id: curveId, transform: inherited }));
      } else {
        items.push({ id: itemId, transform: inherited });
      }
    });
    return items;
  };

  const getCurvePoints = (curveId: number, transform: Transform3): Vec3[] => {
    const curve = records.get(curveId);
    if (!curve) return [];
    if (curve.type === 'IFCPOLYLINE') {
      return ifcRefIds(curve.args[0]).map(id => getPoint({ ref: id })).filter((point): point is Vec3 => !!point).map(point => applyTransform(transform, point));
    }
    if (curve.type === 'IFCCOMPOSITECURVE') {
      return ifcRefIds(curve.args[0]).flatMap(segmentId => getCurvePoints(segmentId, transform));
    }
    if (curve.type === 'IFCCOMPOSITECURVESEGMENT') {
      const nestedId = ifcRefId(curve.args[2]);
      return nestedId === undefined ? [] : getCurvePoints(nestedId, transform);
    }
    return [];
  };

  const curveToGeometry = (curveId: number, transform: Transform3): RawRecord['geometry'] | null => {
    const curve = records.get(curveId);
    if (!curve) return null;
    if (curve.type === 'IFCPOLYLINE') {
      const points = getCurvePoints(curveId, transform);
      if (points.length < 2) return null;
      const fitted = fitArcFromPoints(points);
      if (fitted && points.length > 4) {
        return {
          kind: 'arc',
          type: 'arc',
          center: rawPoint(fitted.center),
          radius: fitted.radius,
          startAngle: fitted.startAngle,
          endAngle: fitted.endAngle,
          points: points.map(rawPoint),
        };
      }
      if (points.length > 6) {
        return {
          kind: 'arc',
          type: 'arc',
          start: rawPoint(points[0]),
          end: rawPoint(points[points.length - 1]),
          controlPoint: rawPoint(points[Math.floor(points.length / 2)]),
          points: points.map(rawPoint),
        };
      }
      return {
        kind: points.length === 2 ? 'line' : 'polyline',
        type: points.length === 2 ? 'line' : 'polyline',
        start: rawPoint(points[0]),
        end: rawPoint(points[points.length - 1]),
        points: points.map(rawPoint),
      };
    }
    if (curve.type === 'IFCTRIMMEDCURVE') {
      const baseId = ifcRefId(curve.args[0]);
      const base = baseId === undefined ? undefined : records.get(baseId);
      if (!base || !['IFCCIRCLE', 'IFCELLIPSE'].includes(base.type)) return null;
      const axis = composeTransforms(transform, getAxisPlacement(base.args[0]));
      const start = Array.isArray(curve.args[1]) ? ifcNumber(curve.args[1][0], 0) : 0;
      const end = Array.isArray(curve.args[2]) ? ifcNumber(curve.args[2][0], 360) : 360;
      const rotation = Math.atan2(axis.xAxis.y, axis.xAxis.x);
      if (base.type === 'IFCCIRCLE') {
        return {
          kind: 'arc',
          type: 'arc',
          center: rawPoint(axis.origin),
          radius: ifcNumber(base.args[1], 0),
          startAngle: start * Math.PI / 180 + rotation,
          endAngle: end * Math.PI / 180 + rotation,
          counterclockwise: curve.args[3] === false,
        };
      }
      return {
        kind: 'ellipse',
        type: 'ellipse',
        center: rawPoint(axis.origin),
        radiusX: ifcNumber(base.args[1], 0),
        radiusY: ifcNumber(base.args[2], 0),
        rotation,
        startAngle: start * Math.PI / 180,
        endAngle: end * Math.PI / 180,
        counterclockwise: curve.args[3] === false,
      };
    }
    if (curve.type === 'IFCCIRCLE' || curve.type === 'IFCELLIPSE') {
      const axis = composeTransforms(transform, getAxisPlacement(curve.args[0]));
      const rotation = Math.atan2(axis.xAxis.y, axis.xAxis.x);
      if (curve.type === 'IFCCIRCLE') {
        return {
          kind: 'circle',
          type: 'circle',
          center: rawPoint(axis.origin),
          radius: ifcNumber(curve.args[1], 0),
          rotation,
        };
      }
      return {
        kind: 'ellipse',
        type: 'ellipse',
        center: rawPoint(axis.origin),
        radiusX: ifcNumber(curve.args[1], 0),
        radiusY: ifcNumber(curve.args[2], 0),
        rotation,
      };
    }
    if (curve.type === 'IFCCOMPOSITECURVESEGMENT') {
      const nestedId = ifcRefId(curve.args[2]);
      return nestedId === undefined ? null : curveToGeometry(nestedId, transform);
    }
    return null;
  };

  const getProfilePoints = (profileId?: number): Vec3[] => {
    if (profileId === undefined) return [];
    const profile = records.get(profileId);
    if (!profile) return [];
    if (profile.type === 'IFCRECTANGLEPROFILEDEF') {
      const placement = getAxisPlacement(profile.args[2]);
      const width = ifcNumber(profile.args[3], 0);
      const depth = ifcNumber(profile.args[4], 0);
      return [
        vec(-width / 2, -depth / 2, 0),
        vec(width / 2, -depth / 2, 0),
        vec(width / 2, depth / 2, 0),
        vec(-width / 2, depth / 2, 0),
        vec(-width / 2, -depth / 2, 0),
      ].map(point => applyTransform(placement, point));
    }
    if (profile.type === 'IFCARBITRARYCLOSEDPROFILEDEF' || profile.type === 'IFCARBITRARYPROFILEDEFWITHVOIDS') {
      const curveId = ifcRefId(profile.args[2]);
      return curveId === undefined ? [] : getCurvePoints(curveId, IDENTITY_TRANSFORM);
    }
    return [];
  };

  const analyzeProductShape = (productShapeId: number | undefined, productPlacement: Transform3) => {
    const bodyReps = getShapeRepresentations(productShapeId, 'Body');
    const allPoints: Vec3[] = [];
    const baseLoops: Vec3[][] = [];
    const rectangleDimensions: Array<{ x: number; y: number }> = [];
    bodyReps.forEach(rep => {
      getRepresentationItems(rep).forEach(itemRef => {
        const item = records.get(itemRef.id);
        if (!item || item.type !== 'IFCEXTRUDEDAREASOLID') return;
        const profileId = ifcRefId(item.args[0]);
        const profile = profileId === undefined ? undefined : records.get(profileId);
        if (profile?.type === 'IFCRECTANGLEPROFILEDEF') {
          rectangleDimensions.push({ x: ifcNumber(profile.args[3], 0), y: ifcNumber(profile.args[4], 0) });
        }
        const profilePoints = getProfilePoints(profileId);
        const solidPlacement = getAxisPlacement(item.args[1]);
        const direction = getDirection(item.args[2], vec(0, 0, 1));
        const depth = ifcNumber(item.args[3], 0);
        const solidTransform = composeTransforms(composeTransforms(productPlacement, itemRef.transform), solidPlacement);
        const base = profilePoints.map(point => applyTransform(solidTransform, point));
        const top = base.map(point => addVec(point, scaleVec(applyDirection(solidTransform, direction), depth)));
        if (base.length) baseLoops.push(base);
        allPoints.push(...base, ...top);
      });
    });
    const bbox = bboxFromPoints(allPoints);
    return {
      bbox,
      baseLoops,
      rectangleDimensions,
      verticalHeight: bbox ? Math.abs(bbox.maxZ - bbox.minZ) : undefined,
      horizontalWidth: bbox ? Math.abs(bbox.maxX - bbox.minX) : undefined,
      horizontalDepth: bbox ? Math.abs(bbox.maxY - bbox.minY) : undefined,
      center: bbox ? vec((bbox.minX + bbox.maxX) / 2, (bbox.minY + bbox.maxY) / 2, (bbox.minZ + bbox.maxZ) / 2) : undefined,
    };
  };

  const getProductBase = (product: IfcRecord): RawRecord => {
    const storeyId = resolveStorey(product.id);
    const levelId = storeyId !== undefined ? `#${storeyId}` : storeys[0]?.id;
    return {
      id: `#${product.id}`,
      elementId: `#${product.id}`,
      ifcGuid: ifcString(product.args[0], ''),
      name: ifcString(product.args[2], ifcString(product.args[4], product.type)),
      typeName: ifcString(product.args[4], product.type),
      className: product.type,
      category: product.type,
      levelId,
      baseLevelId: levelId,
      topLevelId: levelId ? nextStoreyById.get(levelId) : undefined,
    };
  };

  const productRotationDegrees = (placement: Transform3) => Math.atan2(placement.xAxis.y, placement.xAxis.x) * 180 / Math.PI;

  const addWallRecords = (product: IfcRecord, elements: RawRecord[]) => {
    const placement = getLocalPlacement(product.args[5]);
    const representationId = ifcRefId(product.args[6]);
    const base = getProductBase(product);
    const shape = analyzeProductShape(representationId, placement);
    const material = materialThickness(materialByProduct.get(product.id));
    const rectThickness = shape.rectangleDimensions.map(dim => Math.min(dim.x, dim.y)).filter(value => value > 0).sort((a, b) => a - b)[0];
    const thickness = material || rectThickness || 0.375;
    const height = shape.verticalHeight || 10;
    const axisRep = getShapeRepresentations(representationId, 'Axis')[0];
    const axisItems = axisRep ? getRepresentationItems(axisRep) : [];

    if (axisItems.length) {
      axisItems.forEach(item => {
        const geometry = curveToGeometry(item.id, composeTransforms(placement, item.transform));
        if (!geometry) return;
        const points = Array.isArray(geometry.points) ? geometry.points : [];
        if (geometry.kind === 'polyline' && points.length > 2) {
          points.slice(0, -1).forEach((point: any, index: number) => {
            elements.push({
              ...base,
              id: `${base.id}:axis-${index}`,
              elementId: `${base.id}:axis-${index}`,
              geometry: { kind: 'line', start: point, end: points[index + 1] },
              thickness,
              height,
              sourceParentId: base.id,
            });
          });
        } else {
          elements.push({ ...base, geometry, thickness, height });
        }
      });
      return;
    }

    const centerline = deriveCenterlineFromClosedProfile(shape.baseLoops[0] || []);
    if (centerline.length > 1) {
      parserWarnings.push({
        code: 'BODY_PROFILE_WALL_APPROXIMATED',
        message: `${product.type} ${base.id} had no Axis representation. It was converted as segmented native wall geometry from the swept body profile.`,
        sourceElementId: base.id,
        category: product.type,
      });
      centerline.slice(0, -1).forEach((point, index) => {
        elements.push({
          ...base,
          id: `${base.id}:profile-${index}`,
          elementId: `${base.id}:profile-${index}`,
          geometry: { kind: 'line', start: rawPoint(point), end: rawPoint(centerline[index + 1]) },
          thickness,
          height,
          sourceParentId: base.id,
        });
      });
    } else if (shape.center) {
      elements.push({
        ...base,
        location: rawPoint(shape.center),
        width: shape.horizontalWidth || thickness,
        depth: shape.horizontalDepth || thickness,
        height,
        category: `${product.type}UnsupportedGeometry`,
      });
    }
  };

  const addBoundaryRecord = (product: IfcRecord, elements: RawRecord[], type: 'floor' | 'ceiling') => {
    const placement = getLocalPlacement(product.args[5]);
    const shape = analyzeProductShape(ifcRefId(product.args[6]), placement);
    const boundary = closeBoundary(shape.baseLoops[0] || []).map(rawPoint);
    if (boundary.length < 4) return;
    elements.push({
      ...getProductBase(product),
      category: type === 'floor' ? 'IfcSlabFloor' : 'IfcCeiling',
      className: product.type,
      boundary,
      thickness: shape.verticalHeight || 0.3,
      height: shape.verticalHeight || 0.3,
      elevation: (shape.bbox?.minZ ?? 0) - ifcNumber(storeys.find(level => level.id === `#${resolveStorey(product.id)}`)?.elevation, 0),
    });
  };

  const addColumnRecord = (product: IfcRecord, elements: RawRecord[]) => {
    const placement = getLocalPlacement(product.args[5]);
    const shape = analyzeProductShape(ifcRefId(product.args[6]), placement);
    const center = shape.center || placement.origin;
    elements.push({
      ...getProductBase(product),
      location: rawPoint(center),
      width: shape.horizontalWidth || 1.5,
      depth: shape.horizontalDepth || shape.horizontalWidth || 1.5,
      height: shape.verticalHeight || 10,
      rotation: productRotationDegrees(placement),
      shape: ifcString(product.args[4]).toLowerCase().includes('round') ? 'round' : 'rect',
    });
  };

  const addHostedRecord = (product: IfcRecord, elements: RawRecord[], type: 'door' | 'window') => {
    const placement = getLocalPlacement(product.args[5]);
    const storeyId = resolveStorey(product.id);
    const storey = storeys.find(item => item.id === `#${storeyId}`);
    const openingId = fillOpeningByElement.get(product.id);
    const hostId = openingId !== undefined ? voidHostByOpening.get(openingId) : undefined;
    const height = ifcNumber(product.args[8], type === 'door' ? 7 : 4);
    const width = ifcNumber(product.args[9], type === 'door' ? 3 : 3);
    elements.push({
      ...getProductBase(product),
      category: type === 'door' ? 'IfcDoor' : 'IfcWindow',
      location: rawPoint(placement.origin),
      width,
      height,
      sillHeight: type === 'window' ? Math.max(0, placement.origin.z - (storey?.elevation || 0)) : undefined,
      topHeight: type === 'window' ? Math.max(0, placement.origin.z - (storey?.elevation || 0)) + height : undefined,
      rotation: productRotationDegrees(placement),
      hostId: hostId !== undefined ? `#${hostId}` : undefined,
      openingSourceId: openingId !== undefined ? `#${openingId}` : undefined,
    });
  };

  const addOpeningRecord = (product: IfcRecord, elements: RawRecord[]) => {
    if (fillingByOpening.has(product.id)) return;
    const placement = getLocalPlacement(product.args[5]);
    const shape = analyzeProductShape(ifcRefId(product.args[6]), placement);
    const bbox = shape.bbox;
    const center = shape.center || placement.origin;
    const hostId = voidHostByOpening.get(product.id);
    const host = hostId !== undefined ? records.get(hostId) : undefined;
    const hostPlacement = host ? getLocalPlacement(host.args[5]) : IDENTITY_TRANSFORM;
    const hostShape = host ? analyzeProductShape(ifcRefId(host.args[6]), hostPlacement) : null;
    const hostHeight = hostShape?.verticalHeight;
    const derivedHeight = shape.verticalHeight || 7;
    const openingHeight = hostHeight && derivedHeight > hostHeight * 1.05 ? Math.min(7, hostHeight) : derivedHeight;
    elements.push({
      ...getProductBase(product),
      category: 'IfcOpeningElement',
      location: rawPoint(center),
      width: Math.max(shape.horizontalWidth || 0, shape.horizontalDepth || 0, 1),
      height: openingHeight,
      rotation: productRotationDegrees(placement),
      elevation: bbox ? bbox.minZ : center.z,
      hostId: hostId !== undefined ? `#${hostId}` : undefined,
    });
  };

  const addStairFlightRecord = (product: IfcRecord, elements: RawRecord[]) => {
    const placement = getLocalPlacement(product.args[5]);
    const shape = analyzeProductShape(ifcRefId(product.args[6]), placement);
    const bbox = shape.bbox;
    if (!bbox) return;
    const spanX = bbox.maxX - bbox.minX;
    const spanY = bbox.maxY - bbox.minY;
    const horizontal = Math.abs(spanX) >= Math.abs(spanY);
    const y = (bbox.minY + bbox.maxY) / 2;
    const x = (bbox.minX + bbox.maxX) / 2;
    elements.push({
      ...getProductBase(product),
      category: 'IfcStairFlight',
      geometry: {
        kind: 'line',
        start: rawPoint(horizontal ? vec(bbox.minX, y, bbox.minZ) : vec(x, bbox.minY, bbox.minZ)),
        end: rawPoint(horizontal ? vec(bbox.maxX, y, bbox.maxZ) : vec(x, bbox.maxY, bbox.maxZ)),
      },
      width: Math.max(0.5, Math.min(Math.abs(spanX), Math.abs(spanY)) || 3),
      height: Math.max(0.1, bbox.maxZ - bbox.minZ),
      stepCount: ifcNumber(product.args[9], ifcNumber(product.args[8], undefined as any)),
      riserCount: ifcNumber(product.args[8], undefined as any),
      treadLength: ifcNumber(product.args[11], undefined as any),
      rotation: productRotationDegrees(placement),
    });
  };

  const addRailingRecord = (product: IfcRecord, elements: RawRecord[]) => {
    const placement = getLocalPlacement(product.args[5]);
    const shape = analyzeProductShape(ifcRefId(product.args[6]), placement);
    const bbox = shape.bbox;
    if (!bbox) return;
    const spanX = bbox.maxX - bbox.minX;
    const spanY = bbox.maxY - bbox.minY;
    const horizontal = Math.abs(spanX) >= Math.abs(spanY);
    const y = (bbox.minY + bbox.maxY) / 2;
    const x = (bbox.minX + bbox.maxX) / 2;
    elements.push({
      ...getProductBase(product),
      category: 'IfcRailing',
      geometry: {
        kind: 'line',
        start: rawPoint(horizontal ? vec(bbox.minX, y, bbox.minZ) : vec(x, bbox.minY, bbox.minZ)),
        end: rawPoint(horizontal ? vec(bbox.maxX, y, bbox.minZ) : vec(x, bbox.maxY, bbox.minZ)),
      },
      height: Math.max(0.5, bbox.maxZ - bbox.minZ),
    });
  };

  const addSpaceRecord = (product: IfcRecord, elements: RawRecord[]) => {
    const placement = getLocalPlacement(product.args[5]);
    const shape = analyzeProductShape(ifcRefId(product.args[6]), placement);
    const center = shape.center || placement.origin;
    const boundary = closeBoundary(shape.baseLoops[0] || []).map(rawPoint);
    elements.push({
      ...getProductBase(product),
      category: 'IfcSpaceRoom',
      location: rawPoint(center),
      boundary: boundary.length >= 4 ? boundary : undefined,
    });
  };

  const addGridRecords = (product: IfcRecord, elements: RawRecord[]) => {
    const placement = getLocalPlacement(product.args[5]);
    const axes = [...ifcRefIds(product.args[7]), ...ifcRefIds(product.args[8]), ...ifcRefIds(product.args[9])];
    axes.forEach((axisId, index) => {
      const axis = records.get(axisId);
      const curveId = ifcRefId(axis?.args[1]);
      if (curveId === undefined) return;
      const geometry = curveToGeometry(curveId, placement);
      if (!geometry) return;
      elements.push({
        ...getProductBase(product),
        id: `#${product.id}:axis-${axisId}`,
        elementId: `#${product.id}:axis-${axisId}`,
        category: 'IfcGridAxis',
        name: ifcString(axis?.args[0], `Grid ${index + 1}`),
        geometry,
      });
    });
  };

  const addAnnotationRecords = (product: IfcRecord, elements: RawRecord[]) => {
    const placement = getLocalPlacement(product.args[5]);
    const reps = getShapeRepresentations(ifcRefId(product.args[6]));
    reps.flatMap(rep => getRepresentationItems(rep)).forEach((item, index) => {
      const geometry = curveToGeometry(item.id, composeTransforms(placement, item.transform));
      if (!geometry) return;
      const points = Array.isArray(geometry.points) ? geometry.points : [];
      if (geometry.kind === 'polyline' && points.length > 2) {
        points.slice(0, -1).forEach((point: any, pointIndex: number) => {
          elements.push({
            ...getProductBase(product),
            id: `#${product.id}:curve-${index}-${pointIndex}`,
            elementId: `#${product.id}:curve-${index}-${pointIndex}`,
            category: 'IfcGeometricCurve',
            geometry: { kind: 'line', start: point, end: points[pointIndex + 1] },
          });
        });
      } else {
        elements.push({
          ...getProductBase(product),
          id: `#${product.id}:curve-${index}`,
          elementId: `#${product.id}:curve-${index}`,
          category: geometry.kind === 'circle' ? 'IfcCircle' : geometry.kind === 'ellipse' ? 'IfcEllipse' : geometry.kind === 'arc' ? 'IfcArc' : 'IfcLine',
          geometry,
        });
      }
    });
  };

  const elements: RawRecord[] = [];
  byType(['IFCWALL', 'IFCWALLSTANDARDCASE']).forEach(product => addWallRecords(product, elements));
  byType(['IFCDOOR']).forEach(product => addHostedRecord(product, elements, 'door'));
  byType(['IFCWINDOW']).forEach(product => addHostedRecord(product, elements, 'window'));
  byType(['IFCOPENINGELEMENT']).forEach(product => addOpeningRecord(product, elements));
  byType(['IFCSLAB']).forEach(product => {
    const predefined = ifcString(product.args[8]).toLowerCase();
    addBoundaryRecord(product, elements, predefined.includes('roof') || predefined.includes('ceiling') ? 'ceiling' : 'floor');
  });
  byType(['IFCCOVERING']).forEach(product => {
    if (ifcString(product.args[8]).toLowerCase().includes('ceiling')) addBoundaryRecord(product, elements, 'ceiling');
  });
  byType(['IFCCOLUMN']).forEach(product => addColumnRecord(product, elements));
  byType(['IFCSTAIRFLIGHT']).forEach(product => addStairFlightRecord(product, elements));
  byType(['IFCRAILING']).forEach(product => addRailingRecord(product, elements));
  byType(['IFCSPACE']).forEach(product => addSpaceRecord(product, elements));
  byType(['IFCGRID']).forEach(product => addGridRecords(product, elements));
  byType(['IFCANNOTATION']).forEach(product => addAnnotationRecords(product, elements));

  const handledIds = new Set(elements.map(item => String(item.id).split(':')[0]));
  byType(['IFCBUILDINGELEMENTPROXY', 'IFCFURNISHINGELEMENT', 'IFCFLOWTERMINAL']).forEach(product => {
    if (handledIds.has(`#${product.id}`)) return;
    const placement = getLocalPlacement(product.args[5]);
    const shape = analyzeProductShape(ifcRefId(product.args[6]), placement);
    elements.push({
      ...getProductBase(product),
      category: product.type,
      location: rawPoint(shape.center || placement.origin),
      width: shape.horizontalWidth || 1,
      depth: shape.horizontalDepth || 1,
      height: shape.verticalHeight || 1,
    });
  });

  return {
    version: BIM_IMPORT_VERSION,
    schema,
    units: {
      length: getLengthUnitName(),
      angle: 'radians',
    },
    coordinateSystem: {
      flipY: true,
    },
    levels: storeys,
    elements,
    parserWarnings,
  };
};

const extractSourceElements = (payload: any): RawRecord[] => {
  const candidates = [
    getAny(payload, ['ifcElements']),
    getAny(payload, ['elements']),
    getAny(payload, ['model.elements']),
    getAny(payload, ['data.elements']),
  ];
  const found = candidates.find(Array.isArray);
  return Array.isArray(found) ? found : [];
};

export const convertIfcPayloadToNative = (payload: any, fileName: string): BimImportConversionResult => {
  const logs: BimImportLog[] = [];
  const stats = emptyStats();
  const units = getUnitContext(payload);
  (payload.parserWarnings || []).forEach((warning: any) => {
    log(logs, 'warning', warning.code || 'IFC_PARSER_WARNING', warning.message || 'IFC parser warning.', {
      id: warning.sourceElementId,
      category: warning.category,
    });
  });
  const levels = createLevels(payload, units, logs);
  const levelMaps = makeLevelMaps(levels, payload);
  const sourceElements = extractSourceElements(payload);
  const walls: ArchElement[] = [];
  const deferred: RawRecord[] = [];
  const elements: ArchElement[] = [];

  stats.levels = levels.length;
  stats.totalSourceElements = sourceElements.length;

  sourceElements.forEach((raw) => {
    const category = cleanCategory(getSourceCategory(raw));
    if (category.includes('wall') && !category.includes('opening')) {
      const wall = createWall(raw, units, levels, levelMaps, fileName, logs);
      if (wall) {
        walls.push(wall);
        elements.push(wall);
        incrementStats(stats, wall);
      }
    } else {
      deferred.push(raw);
    }
  });

  deferred.forEach((raw) => {
    const category = cleanCategory(getSourceCategory(raw));
    let created: ArchElement | ArchElement[] | null = null;

    if (category.includes('door')) created = createHostedOpening(raw, units, levels, levelMaps, walls, fileName, 'door', logs);
    else if (category.includes('window')) created = createHostedOpening(raw, units, levels, levelMaps, walls, fileName, 'window', logs);
    else if (category.includes('opening')) created = createHostedOpening(raw, units, levels, levelMaps, walls, fileName, 'wall-opening', logs);
    else if (category.includes('floor')) created = createBoundaryElement(raw, units, levels, levelMaps, fileName, 'floor', logs);
    else if (category.includes('ceiling') || category.includes('roof')) created = createBoundaryElement(raw, units, levels, levelMaps, fileName, 'ceiling', logs);
    else if (category.includes('stair')) created = createStair(raw, units, levels, levelMaps, fileName, logs);
    else if (category.includes('column')) created = createColumn(raw, units, levels, levelMaps, fileName, logs);
    else if (category.includes('railing')) created = createPathSegments(raw, units, levels, levelMaps, fileName, 'railing', logs);
    else if (category.includes('room') || category.includes('area')) created = createBoundaryElement(raw, units, levels, levelMaps, fileName, 'room', logs);
    else if (category.includes('grid')) created = createPathSegments(raw, units, levels, levelMaps, fileName, 'gridline', logs);
    else if (category.includes('dimension')) created = createAnnotation(raw, units, levels, levelMaps, fileName, 'dimension');
    else if (category.includes('text') || category.includes('tag') || category.includes('note')) created = createAnnotation(raw, units, levels, levelMaps, fileName, 'label');
    else if (category.includes('line') || category.includes('curve') || category.includes('arc') || category.includes('circle') || category.includes('ellipse')) {
      const level = resolveLevel(raw, levels, levelMaps, ['levelId', 'level', 'view.levelId']);
      created = lineElementFromCurve(raw, units, { id: makeId('bim_shape'), levelId: level.id, layer: 'SHAPES' });
      if (created) created = withBimMetadata(created, raw, fileName);
    } else {
      created = createUnsupported(raw, units, levels, levelMaps, fileName);
      log(logs, 'warning', 'UNSUPPORTED_GENERIC_OBJECT', `Unsupported IFC class "${getSourceCategory(raw)}" was kept as a generic BIM object.`, raw);
    }

    const createdItems = Array.isArray(created) ? created : created ? [created] : [];
    createdItems.forEach(item => {
      elements.push(item);
      incrementStats(stats, item, item.type === 'asset' && item.assetType === 'bim-object');
    });
  });

  if (sourceElements.length === 0) {
    log(logs, 'error', 'NO_IFC_ELEMENTS', 'No supported IFC source elements were found in this file.');
  }

  return {
    project: {
      name: fileName.replace(/\.[^/.]+$/, ''),
      mode: 'floorplan',
      levels,
      elements,
      layers: LAYERS,
      viewBox: { width: 100, height: 100 },
      settings3D: {
        ...DEFAULT_PROJECT_SETTINGS_3D,
        defaultLevelHeight: levels[0]?.height || WALL_HEIGHT_DEFAULT,
        wallHeight: levels[0]?.height || WALL_HEIGHT_DEFAULT,
        level1Z: levels[0]?.zElevation || 0,
        level2Z: levels[1]?.zElevation || (levels[0]?.height || WALL_HEIGHT_DEFAULT),
      },
    },
    levels,
    elements,
    layers: LAYERS,
    logs,
    stats,
    sourceMetadata: {
      parser: 'ifc-step-deterministic',
      sourceFileName: fileName,
      schema: payload.schema,
      units,
      payloadVersion: payload.version,
    },
    canConvert: elements.length > 0 && sourceElements.length > 0,
  };
};

export const createBimImportSessionFromFile = async (file: File): Promise<BimImportSession> => {
  const buffer = await file.arrayBuffer();
  const lower = file.name.toLowerCase();
  const fileType: BimImportSession['fileType'] = lower.endsWith('.ifc') ? 'IFC' : 'UNKNOWN';
  if (fileType !== 'IFC') {
    throw new Error('BIM Importer supports IFC files exported from Revit or another BIM authoring tool.');
  }
  const text = new TextDecoder().decode(buffer);
  if (!/ISO-10303-21/i.test(text)) {
    throw new Error('The selected file is not a valid IFC STEP file.');
  }
  const payload = parseIfcTextToPayload(text);
  const conversion = convertIfcPayloadToNative(payload, file.name);

  const sessionLogs = [
    ...conversion.logs,
    ...(conversion.canConvert
      ? [{ level: 'info' as const, code: 'IFC_SESSION_READY', message: 'IFC preview is ready. Conversion will create native Main Canvas elements only after Convert to Interactive.' }]
      : []),
  ];

  return {
    id: makeId('bim_session'),
    fileName: file.name,
    fileSize: file.size,
    fileType,
    status: conversion.canConvert ? 'conversion-ready' : 'blocked',
    previewElements: conversion.elements,
    previewLevels: conversion.levels,
    conversion,
    schema: payload.schema,
    logs: sessionLogs,
  };
};

export const getBimImportSupportedCategories = () => [
  'IfcWall',
  'IfcDoor',
  'IfcWindow',
  'IfcOpeningElement',
  'IfcSlab',
  'IfcCovering',
  'IfcStairFlight',
  'IfcColumn',
  'IfcRailing',
  'IfcSpace',
  'IfcGrid',
  'IfcAnnotation',
  'IfcLine/Curve',
  'IfcCircle',
  'IfcEllipse',
];
