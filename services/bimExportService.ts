import { ArchElement, Level, Point, Project, UnitSystem } from '../types';
import {
  DEFAULT_PROJECT_SETTINGS_3D,
  DOOR_HEIGHT_DEFAULT,
  WALL_HEIGHT_DEFAULT,
  WALL_OPENING_HEIGHT_DEFAULT,
  WALL_THICKNESS_DEFAULT,
  WINDOW_SILL_HEIGHT_DEFAULT,
  WINDOW_TOP_HEIGHT_DEFAULT,
} from '../constants';
import { getCurveBoxPoints, sampleCurveElement } from './geometry/curveGeometry';

export const BIM_EXPORT_SCHEMA = 'IFC4';
export const BIM_EXPORT_VERSION = 'bim-export-ifc-v1';

export type BimExportLogLevel = 'info' | 'warning' | 'error';
export type BimExportLevelScope = 'all' | 'active' | 'selected';

export interface BimExportOptions {
  schema: typeof BIM_EXPORT_SCHEMA;
  projectName: string;
  projectDescription?: string;
  projectCode?: string;
  unitSystem: UnitSystem;
  levelScope: BimExportLevelScope;
  selectedLevelIds: string[];
  activeLevelId?: string;
  includeUnsupportedAsProxy: boolean;
}

export interface BimExportLog {
  level: BimExportLogLevel;
  code: string;
  message: string;
  nativeElementId?: string;
  ifcClass?: string;
}

export interface BimExportClassCounts {
  [ifcClass: string]: number;
}

export interface BimExportSummary {
  schema: typeof BIM_EXPORT_SCHEMA;
  unitSystem: UnitSystem;
  projectName: string;
  levelCount: number;
  sourceElementCount: number;
  exportedNativeElements: number;
  generatedIfcObjects: number;
  proxyExports: number;
  skippedElements: number;
  warnings: number;
  errors: number;
  classCounts: BimExportClassCounts;
  levelSummaries: Array<{ id: string; name: string; elevation: number; elementCount: number }>;
}

export interface BimExportValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface BimExportResult {
  ifcText: string;
  fileName: string;
  updatedProject: Project;
  summary: BimExportSummary;
  logs: BimExportLog[];
  validation: BimExportValidationResult;
}

type IfcArg = string | number | boolean | undefined | null | IfcRef | IfcRaw | IfcTyped | IfcArg[];
interface IfcRef { ref: number }
interface IfcRaw { raw: string }
interface IfcTyped { type: string; args: IfcArg[] }

interface IfcEntity {
  id: number;
  type: string;
  globalId?: string;
}

interface ExportProduct {
  entityId: number;
  ifcClass: string;
  globalId: string;
  nativeElement?: ArchElement;
  levelId?: string;
  storeyEntityId?: number;
  isGenerated?: boolean;
  isOpeningFeature?: boolean;
  isProxy?: boolean;
}

interface ExportContext {
  writer: IfcWriter;
  ownerHistoryId: number;
  modelContextId: number;
  bodyContextId: number;
  axisContextId: number;
  annotationContextId: number;
  storeyByLevelId: Map<string, number>;
  levels: Level[];
  options: BimExportOptions;
  logs: BimExportLog[];
  summary: BimExportSummary;
  usedGuids: Set<string>;
  guidByElementId: Map<string, { guid: string; ifcClass: string }>;
  products: ExportProduct[];
  materialByName: Map<string, number>;
  materialLayerUsageByKey: Map<string, number>;
  wallProductsByNativeId: Map<string, ExportProduct>;
  groupAssignments: Map<string, number[]>;
  hierarchyGuids: {
    project?: string;
    site?: string;
    building?: string;
    storeys: Record<string, string>;
  };
}

const IFC_GUID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$';
const EPSILON = 1e-7;

const ifcRef = (id?: number): IfcRef | undefined => id ? { ref: id } : undefined;
const ifcEnum = (name: string): IfcRaw => ({ raw: `.${name}.` });
const ifcRaw = (raw: string): IfcRaw => ({ raw });
const ifcTyped = (type: string, ...args: IfcArg[]): IfcTyped => ({ type, args });

const isIfcRef = (value: IfcArg): value is IfcRef => !!value && typeof value === 'object' && !Array.isArray(value) && 'ref' in value;
const isIfcRaw = (value: IfcArg): value is IfcRaw => !!value && typeof value === 'object' && !Array.isArray(value) && 'raw' in value;
const isIfcTyped = (value: IfcArg): value is IfcTyped => !!value && typeof value === 'object' && !Array.isArray(value) && 'type' in value && 'args' in value;

class IfcWriter {
  private nextId = 1;
  private readonly lines: string[] = [];
  readonly entities: IfcEntity[] = [];

  add(type: string, args: IfcArg[], globalId?: string): number {
    const id = this.nextId;
    this.nextId += 1;
    this.lines.push(`#${id}=${type.toUpperCase()}(${args.map(arg => this.formatArg(arg)).join(',')});`);
    this.entities.push({ id, type: type.toUpperCase(), globalId });
    return id;
  }

  toStep(schema: string, fileName: string): string {
    const timestamp = new Date().toISOString();
    return [
      'ISO-10303-21;',
      'HEADER;',
      `FILE_DESCRIPTION(('ViewDefinition [CoordinationView_V2.0]'),'2;1');`,
      `FILE_NAME(${this.formatArg(fileName)},${this.formatArg(timestamp)},(${this.formatArg('Archi AI')}),(${this.formatArg('Archi AI')}),${this.formatArg('BIM Exporter')},${this.formatArg('Archi AI Native IFC Writer')},${this.formatArg('')});`,
      `FILE_SCHEMA((${this.formatArg(schema)}));`,
      'ENDSEC;',
      'DATA;',
      ...this.lines,
      'ENDSEC;',
      'END-ISO-10303-21;',
      '',
    ].join('\n');
  }

  count(type: string): number {
    const upper = type.toUpperCase();
    return this.entities.filter(entity => entity.type === upper).length;
  }

  private formatArg(arg: IfcArg): string {
    if (arg === undefined || arg === null) return '$';
    if (Array.isArray(arg)) return `(${arg.map(item => this.formatArg(item)).join(',')})`;
    if (isIfcRef(arg)) return `#${arg.ref}`;
    if (isIfcRaw(arg)) return arg.raw;
    if (isIfcTyped(arg)) return `${arg.type.toUpperCase()}(${arg.args.map(item => this.formatArg(item)).join(',')})`;
    if (typeof arg === 'boolean') return arg ? '.T.' : '.F.';
    if (typeof arg === 'number') return formatNumber(arg);
    return `'${String(arg).replace(/'/g, "''")}'`;
  }
}

const formatNumber = (value: number): string => {
  if (!Number.isFinite(value)) return '0.';
  if (Math.abs(value) < EPSILON) return '0.';
  const fixed = value.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
  return fixed.includes('.') ? fixed : `${fixed}.`;
};

const log = (logs: BimExportLog[], level: BimExportLogLevel, code: string, message: string, nativeElementId?: string, ifcClass?: string) => {
  logs.push({ level, code, message, nativeElementId, ifcClass });
};

const emptySummary = (project: Project, options: BimExportOptions, levels: Level[], sourceElementCount: number): BimExportSummary => ({
  schema: BIM_EXPORT_SCHEMA,
  unitSystem: options.unitSystem,
  projectName: options.projectName || project.name || 'Archi AI Project',
  levelCount: levels.length,
  sourceElementCount,
  exportedNativeElements: 0,
  generatedIfcObjects: 0,
  proxyExports: 0,
  skippedElements: 0,
  warnings: 0,
  errors: 0,
  classCounts: {},
  levelSummaries: levels.map(level => ({ id: level.id, name: level.name, elevation: level.zElevation, elementCount: 0 })),
});

const incrementClass = (summary: BimExportSummary, ifcClass: string) => {
  summary.classCounts[ifcClass] = (summary.classCounts[ifcClass] || 0) + 1;
  summary.generatedIfcObjects += 1;
};

const getLogCounts = (logs: BimExportLog[]) => ({
  warnings: logs.filter(item => item.level === 'warning').length,
  errors: logs.filter(item => item.level === 'error').length,
});

const cleanFileName = (name: string): string => (name || 'bim-export')
  .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '_')
  .replace(/\s+/g, '_')
  .replace(/_+/g, '_')
  .replace(/^_+|_+$/g, '')
  .slice(0, 96) || 'bim-export';

const validIfcGuid = (value: any): value is string => typeof value === 'string' && /^[0-9A-Za-z_$]{22}$/.test(value);

const hashBytes = (seed: string): Uint8Array => {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let h3 = 0x9e3779b9;
  let h4 = 0x85ebca6b;
  for (let i = 0; i < seed.length; i += 1) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x85ebca6b);
    h3 = Math.imul(h3 ^ c, 0xc2b2ae35);
    h4 = Math.imul(h4 ^ c, 0x27d4eb2f);
  }
  h1 ^= h2 >>> 15; h2 ^= h3 >>> 13; h3 ^= h4 >>> 16; h4 ^= h1 >>> 11;
  const values = [h1, h2, h3, h4].map(value => value >>> 0);
  const bytes = new Uint8Array(16);
  values.forEach((value, index) => {
    bytes[index * 4] = (value >>> 24) & 0xff;
    bytes[index * 4 + 1] = (value >>> 16) & 0xff;
    bytes[index * 4 + 2] = (value >>> 8) & 0xff;
    bytes[index * 4 + 3] = value & 0xff;
  });
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytes;
};

const compressGuidBytes = (bytes: Uint8Array): string => {
  let value = 0n;
  bytes.forEach(byte => {
    value = (value << 8n) + BigInt(byte);
  });
  let output = '';
  for (let i = 0; i < 22; i += 1) {
    output = IFC_GUID_CHARS[Number(value & 0x3fn)] + output;
    value >>= 6n;
  }
  return output;
};

const stableIfcGuid = (seed: string): string => compressGuidBytes(hashBytes(seed));

const guidFor = (ctx: ExportContext, seed: string, existing?: string): string => {
  let candidate = validIfcGuid(existing) ? existing : stableIfcGuid(seed);
  let attempt = 1;
  while (ctx.usedGuids.has(candidate)) {
    candidate = stableIfcGuid(`${seed}:${attempt}`);
    attempt += 1;
  }
  ctx.usedGuids.add(candidate);
  return candidate;
};

const existingElementGuid = (el: ArchElement): string | undefined => {
  const candidates = [
    el.metadata?.bimExport?.ifcGuid,
    el.metadata?.ifcGuid,
    el.bimMetadata?.ifcGuid,
    el.bimMetadata?.globalId,
  ];
  return candidates.find(validIfcGuid);
};

const pointDistance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const degToRad = (degrees = 0): number => degrees * Math.PI / 180;

const levelSort = (levels: Level[]) => [...levels].sort((a, b) => a.zElevation - b.zElevation || a.order - b.order);

const selectedLevelsForOptions = (project: Project, options: BimExportOptions): Level[] => {
  const levels = levelSort(project.levels.length ? project.levels : [{ id: 'level-1', name: 'Level 1', zElevation: 0, height: WALL_HEIGHT_DEFAULT, order: 0 }]);
  if (options.levelScope === 'active') {
    return levels.filter(level => level.id === options.activeLevelId) || levels.slice(0, 1);
  }
  if (options.levelScope === 'selected') {
    const selected = levels.filter(level => options.selectedLevelIds.includes(level.id));
    return selected.length ? selected : levels.slice(0, 1);
  }
  return levels;
};

const isLayerVisible = (project: Project, el: ArchElement): boolean => {
  if (!el.layer || !project.layers?.length) return true;
  const layer = project.layers.find(item => item.name.toLowerCase() === el.layer!.toLowerCase());
  return layer?.visible !== false;
};

const exportableElements = (project: Project, options: BimExportOptions): { levels: Level[]; elements: ArchElement[] } => {
  const levels = selectedLevelsForOptions(project, options);
  const levelIds = new Set(levels.map(level => level.id));
  const firstLevelId = project.levels[0]?.id || levels[0]?.id;
  const elements = project.elements.filter(el => {
    if (el.isPlacingDraft) return false;
    if (!isLayerVisible(project, el)) return false;
    const levelId = el.levelId || firstLevelId;
    return !levelId || levelIds.has(levelId);
  });
  return { levels, elements };
};

const resolveLevel = (ctx: ExportContext, el: ArchElement): Level => {
  const levelId = el.levelId || ctx.levels[0]?.id;
  return ctx.levels.find(level => level.id === levelId) || ctx.levels[0];
};

const levelBaseZ = (level?: Level): number => level?.zElevation || 0;
const ifcPoint = (p: Point, z = 0): [number, number, number] => [p.x, -p.y, z];
const fromIfcY = (value: number): number => -value;

const closePoints = (points: Point[]): Point[] => {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  return pointDistance(first, last) < EPSILON ? points : [...points, first];
};

const polygonCentroid = (points: Point[]): Point => {
  if (!points.length) return { x: 0, y: 0 };
  let twiceArea = 0;
  let x = 0;
  let y = 0;
  const loop = closePoints(points);
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

const rectangleAroundSegment = (p1: Point, p2: Point, width: number): Point[] => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length * width / 2;
  const ny = dx / length * width / 2;
  return [
    { x: p1.x + nx, y: p1.y + ny },
    { x: p2.x + nx, y: p2.y + ny },
    { x: p2.x - nx, y: p2.y - ny },
    { x: p1.x - nx, y: p1.y - ny },
  ];
};

const offsetPolylineBand = (points: Point[], width: number): Point[] => {
  if (points.length < 2) return [];
  const half = width / 2;
  const normals = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    const dx = next.x - point.x;
    const dy = next.y - point.y;
    const length = Math.hypot(dx, dy) || 1;
    return { x: -dy / length, y: dx / length };
  });
  const left = points.map((point, index) => {
    const prev = normals[Math.max(0, index - 1)];
    const next = normals[Math.min(normals.length - 1, index)];
    const nx = prev.x + next.x;
    const ny = prev.y + next.y;
    const length = Math.hypot(nx, ny) || 1;
    return { x: point.x + nx / length * half, y: point.y + ny / length * half };
  });
  const right = points.map((point, index) => {
    const prev = normals[Math.max(0, index - 1)];
    const next = normals[Math.min(normals.length - 1, index)];
    const nx = prev.x + next.x;
    const ny = prev.y + next.y;
    const length = Math.hypot(nx, ny) || 1;
    return { x: point.x - nx / length * half, y: point.y - ny / length * half };
  });
  return [...left, ...right.reverse()];
};

const nearestPointOnWall = (point: Point, wall: ArchElement): { point: Point; t: number; dist: number; angle: number } | null => {
  const samples = wall.isCurved || wall.wallSource === 'arc' || wall.wallSource === 'circle' || wall.wallSource === 'ellipse'
    ? sampleCurveElement(wall, 64)
    : wall.p1 && wall.p2 ? [wall.p1, wall.p2] : [];
  if (samples.length < 2) return null;
  let best: { point: Point; t: number; dist: number; angle: number } | null = null;
  for (let i = 0; i < samples.length - 1; i += 1) {
    const a = samples[i];
    const b = samples[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length2 = dx * dx + dy * dy;
    if (length2 < EPSILON) continue;
    const localT = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2));
    const projected = { x: a.x + dx * localT, y: a.y + dy * localT };
    const dist = pointDistance(point, projected);
    const chainT = (i + localT) / (samples.length - 1);
    const candidate = { point: projected, t: chainT, dist, angle: Math.atan2(dy, dx) * 180 / Math.PI };
    if (!best || candidate.dist < best.dist) best = candidate;
  }
  return best;
};

const findHostWall = (el: ArchElement, walls: ArchElement[]): { wall: ArchElement; point: Point; angle: number; t: number; dist: number } | null => {
  if (!el.pos) return null;
  const preferred = el.hostWallId ? walls.find(wall => wall.id === el.hostWallId) : undefined;
  const pool = preferred ? [preferred] : walls;
  let best: { wall: ArchElement; point: Point; angle: number; t: number; dist: number } | null = null;
  pool.forEach(wall => {
    const hit = nearestPointOnWall(el.pos!, wall);
    if (!hit) return;
    if (!best || hit.dist < best.dist) best = { wall, ...hit };
  });
  return best;
};

const elementMaterialName = (el: ArchElement, fallback: string): string => {
  const material = Array.isArray(el.materials) ? el.materials[0] : undefined;
  const candidate = material?.name || material?.label || material?.materialName || el.bimMetadata?.materials?.[0]?.name;
  return String(candidate || fallback).trim() || fallback;
};

const addCartesianPoint = (writer: IfcWriter, coords: number[]): number => writer.add('IFCCARTESIANPOINT', [coords]);
const addDirection = (writer: IfcWriter, coords: number[]): number => writer.add('IFCDIRECTION', [coords]);

const addAxis2Placement3D = (writer: IfcWriter, point: [number, number, number], xAxisAngle = 0): number => {
  const pointId = addCartesianPoint(writer, point);
  const zDir = addDirection(writer, [0, 0, 1]);
  const xDir = addDirection(writer, [Math.cos(xAxisAngle), Math.sin(xAxisAngle), 0]);
  return writer.add('IFCAXIS2PLACEMENT3D', [ifcRef(pointId), ifcRef(zDir), ifcRef(xDir)]);
};

const addAxis2Placement2D = (writer: IfcWriter, point: [number, number], xAxisAngle = 0): number => {
  const pointId = addCartesianPoint(writer, point);
  const xDir = addDirection(writer, [Math.cos(xAxisAngle), Math.sin(xAxisAngle)]);
  return writer.add('IFCAXIS2PLACEMENT2D', [ifcRef(pointId), ifcRef(xDir)]);
};

const addLocalPlacement = (writer: IfcWriter, point: [number, number, number], rotationRad = 0, parentPlacementId?: number): number => {
  const axisId = addAxis2Placement3D(writer, point, rotationRad);
  return writer.add('IFCLOCALPLACEMENT', [ifcRef(parentPlacementId), ifcRef(axisId)]);
};

const addPolyline = (writer: IfcWriter, points: Array<[number, number, number]>): number => {
  const pointIds = points.map(point => addCartesianPoint(writer, point));
  return writer.add('IFCPOLYLINE', [pointIds.map(ifcRef)]);
};

const addClosedProfile = (writer: IfcWriter, points: Point[], z = 0, profileName = 'Profile'): number => {
  const loop = closePoints(points);
  const polyline = addPolyline(writer, loop.map(point => ifcPoint(point, 0)));
  return writer.add('IFCARBITRARYCLOSEDPROFILEDEF', [ifcEnum('AREA'), profileName, ifcRef(polyline)]);
};

const addExtrudedSolidFromProfile = (writer: IfcWriter, profileId: number, baseZ: number, height: number): number => {
  const solidPlacement = addAxis2Placement3D(writer, [0, 0, baseZ]);
  const direction = addDirection(writer, [0, 0, 1]);
  return writer.add('IFCEXTRUDEDAREASOLID', [ifcRef(profileId), ifcRef(solidPlacement), ifcRef(direction), Math.max(0.01, height)]);
};

const addBodyRepresentation = (ctx: ExportContext, solidIds: number[]): number => (
  ctx.writer.add('IFCSHAPEREPRESENTATION', [ifcRef(ctx.bodyContextId), 'Body', 'SweptSolid', solidIds.map(ifcRef)])
);

const addAxisRepresentation = (ctx: ExportContext, curveIds: number[]): number => (
  ctx.writer.add('IFCSHAPEREPRESENTATION', [ifcRef(ctx.axisContextId), 'Axis', 'Curve2D', curveIds.map(ifcRef)])
);

const addAnnotationRepresentation = (ctx: ExportContext, curveIds: number[]): number => (
  ctx.writer.add('IFCSHAPEREPRESENTATION', [ifcRef(ctx.annotationContextId), 'Annotation', 'Curve2D', curveIds.map(ifcRef)])
);

const addProductShape = (writer: IfcWriter, representationIds: number[]): number => (
  writer.add('IFCPRODUCTDEFINITIONSHAPE', [undefined, undefined, representationIds.map(ifcRef)])
);

const addBoxShape = (ctx: ExportContext, width: number, depth: number, height: number, baseZ: number): number => {
  const profilePlacement = addAxis2Placement2D(ctx.writer, [0, 0]);
  const profile = ctx.writer.add('IFCRECTANGLEPROFILEDEF', [ifcEnum('AREA'), 'Box Profile', ifcRef(profilePlacement), Math.max(0.01, width), Math.max(0.01, depth)]);
  const solid = addExtrudedSolidFromProfile(ctx.writer, profile, baseZ, Math.max(0.01, height));
  return addProductShape(ctx.writer, [addBodyRepresentation(ctx, [solid])]);
};

const addBoundaryShape = (ctx: ExportContext, boundary: Point[], baseZ: number, thickness: number, profileName: string): number => {
  const profile = addClosedProfile(ctx.writer, boundary, 0, profileName);
  const solid = addExtrudedSolidFromProfile(ctx.writer, profile, baseZ, thickness);
  return addProductShape(ctx.writer, [addBodyRepresentation(ctx, [solid])]);
};

const addMaterial = (ctx: ExportContext, name: string): number => {
  const key = name.toLowerCase();
  const existing = ctx.materialByName.get(key);
  if (existing) return existing;
  const id = ctx.writer.add('IFCMATERIAL', [name, undefined, undefined]);
  ctx.materialByName.set(key, id);
  return id;
};

const addMaterialAssignment = (ctx: ExportContext, productId: number, materialName: string) => {
  const materialId = addMaterial(ctx, materialName);
  const guid = guidFor(ctx, `rel-material:${productId}:${materialName}`);
  ctx.writer.add('IFCRELASSOCIATESMATERIAL', [guid, ifcRef(ctx.ownerHistoryId), `Material ${materialName}`, undefined, [ifcRef(productId)], ifcRef(materialId)], guid);
};

const addWallMaterialLayerAssignment = (ctx: ExportContext, productId: number, materialName: string, thickness: number) => {
  const key = `${materialName.toLowerCase()}:${formatNumber(thickness)}`;
  let usageId = ctx.materialLayerUsageByKey.get(key);
  if (!usageId) {
    const materialId = addMaterial(ctx, materialName);
    const layerId = ctx.writer.add('IFCMATERIALLAYER', [ifcRef(materialId), Math.max(0.001, thickness), undefined, `${materialName} Layer`, undefined, undefined, undefined]);
    const layerSetId = ctx.writer.add('IFCMATERIALLAYERSET', [[ifcRef(layerId)], `${materialName} Layer Set`, undefined]);
    usageId = ctx.writer.add('IFCMATERIALLAYERSETUSAGE', [ifcRef(layerSetId), ifcEnum('AXIS2'), ifcEnum('POSITIVE'), -thickness / 2, undefined]);
    ctx.materialLayerUsageByKey.set(key, usageId);
  }
  const guid = guidFor(ctx, `rel-wall-material:${productId}:${materialName}`);
  ctx.writer.add('IFCRELASSOCIATESMATERIAL', [guid, ifcRef(ctx.ownerHistoryId), `Material ${materialName}`, undefined, [ifcRef(productId)], ifcRef(usageId)], guid);
};

const propertyValue = (value: any): IfcTyped => {
  if (typeof value === 'number' && Number.isFinite(value)) return ifcTyped('IFCREAL', value);
  if (typeof value === 'boolean') return ifcTyped('IFCBOOLEAN', value);
  return ifcTyped('IFCTEXT', value === undefined || value === null ? '' : String(value));
};

const addPropertySet = (ctx: ExportContext, productId: number, name: string, props: Record<string, any>, seed: string) => {
  const propertyIds = Object.entries(props)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([propName, value]) => ctx.writer.add('IFCPROPERTYSINGLEVALUE', [propName, undefined, propertyValue(value), undefined]));
  if (!propertyIds.length) return;
  const psetGuid = guidFor(ctx, `pset:${seed}:${name}`);
  const psetId = ctx.writer.add('IFCPROPERTYSET', [psetGuid, ifcRef(ctx.ownerHistoryId), name, undefined, propertyIds.map(ifcRef)], psetGuid);
  const relGuid = guidFor(ctx, `rel-pset:${seed}:${name}`);
  ctx.writer.add('IFCRELDEFINESBYPROPERTIES', [relGuid, ifcRef(ctx.ownerHistoryId), `Defines ${name}`, undefined, [ifcRef(productId)], ifcRef(psetId)], relGuid);
};

const nativeProps = (el: ArchElement, ifcClass: string, level: Level, extra: Record<string, any> = {}) => ({
  NativeElementId: el.id,
  NativeElementType: el.type,
  NativeClassName: el.classname || el.subType || el.type,
  IfcExportClass: ifcClass,
  ExportVersion: BIM_EXPORT_VERSION,
  Width: el.width,
  Depth: el.depth,
  Height: el.height,
  Thickness: el.thickness,
  BaseLevel: level.name,
  TopLevel: el.bimTopLevelId,
  SillHeight: el.sillHeight,
  Elevation: el.elevation,
  Rotation: el.rotation,
  SourcePresetOrCustom: el.subType || el.label || 'custom',
  HostWallId: el.hostWallId,
  ...extra,
});

const registerProduct = (
  ctx: ExportContext,
  product: ExportProduct,
  countAsNative = true,
) => {
  ctx.products.push(product);
  incrementClass(ctx.summary, product.ifcClass);
  if (product.nativeElement) {
    ctx.guidByElementId.set(product.nativeElement.id, { guid: product.globalId, ifcClass: product.ifcClass });
    if (countAsNative) ctx.summary.exportedNativeElements += 1;
    const levelSummary = ctx.summary.levelSummaries.find(item => item.id === product.levelId);
    if (levelSummary && countAsNative) levelSummary.elementCount += 1;
    if (product.nativeElement.groupId) {
      const members = ctx.groupAssignments.get(product.nativeElement.groupId) || [];
      members.push(product.entityId);
      ctx.groupAssignments.set(product.nativeElement.groupId, members);
    }
  }
};

const createProjectStructure = (ctx: ExportContext, project: Project) => {
  const writer = ctx.writer;
  const projectPlacement = addLocalPlacement(writer, [0, 0, 0]);
  const sitePlacement = addLocalPlacement(writer, [0, 0, 0], 0, projectPlacement);
  const buildingPlacement = addLocalPlacement(writer, [0, 0, 0], 0, sitePlacement);
  const projectGuid = guidFor(ctx, `project:${project.name}:${ctx.options.projectCode || ''}`, project.metadata?.bimExport?.ifcProjectGuid);
  const siteGuid = guidFor(ctx, `site:${project.name}:${project.location?.address || 'default'}`, project.metadata?.bimExport?.ifcSiteGuid);
  const buildingGuid = guidFor(ctx, `building:${project.name}:${ctx.options.projectCode || ''}`, project.metadata?.bimExport?.ifcBuildingGuid);
  ctx.hierarchyGuids.project = projectGuid;
  ctx.hierarchyGuids.site = siteGuid;
  ctx.hierarchyGuids.building = buildingGuid;
  const projectId = writer.add('IFCPROJECT', [
    projectGuid,
    ifcRef(ctx.ownerHistoryId),
    ctx.options.projectName || project.name || 'Archi AI Project',
    ctx.options.projectDescription,
    ctx.options.projectCode || undefined,
    undefined,
    undefined,
    [ifcRef(ctx.modelContextId)],
    ifcRef(writer.entities.find(entity => entity.type === 'IFCUNITASSIGNMENT')?.id),
  ], projectGuid);
  const siteId = writer.add('IFCSITE', [
    siteGuid,
    ifcRef(ctx.ownerHistoryId),
    project.location?.address || 'Default Site',
    undefined,
    undefined,
    ifcRef(sitePlacement),
    undefined,
    undefined,
    ifcEnum('ELEMENT'),
    undefined,
    undefined,
    project.location?.lat,
    undefined,
    undefined,
  ], siteGuid);
  const buildingId = writer.add('IFCBUILDING', [
    buildingGuid,
    ifcRef(ctx.ownerHistoryId),
    ctx.options.projectName || project.name || 'Building',
    ctx.options.projectDescription,
    undefined,
    ifcRef(buildingPlacement),
    undefined,
    undefined,
    ifcEnum('ELEMENT'),
    0,
    undefined,
    undefined,
  ], buildingGuid);
  writer.add('IFCRELAGGREGATES', [guidFor(ctx, 'rel-project-site'), ifcRef(ctx.ownerHistoryId), 'Project Container', undefined, ifcRef(projectId), [ifcRef(siteId)]]);
  writer.add('IFCRELAGGREGATES', [guidFor(ctx, 'rel-site-building'), ifcRef(ctx.ownerHistoryId), 'Site Container', undefined, ifcRef(siteId), [ifcRef(buildingId)]]);

  const storeyIds: number[] = [];
  ctx.levels.forEach((level, index) => {
    const placementId = addLocalPlacement(writer, [0, 0, level.zElevation], 0, buildingPlacement);
    const guid = guidFor(ctx, `storey:${level.id}:${level.name}:${level.zElevation}`, level.metadata?.bimExport?.ifcGuid);
    ctx.hierarchyGuids.storeys[level.id] = guid;
    const storeyId = writer.add('IFCBUILDINGSTOREY', [
      guid,
      ifcRef(ctx.ownerHistoryId),
      level.name || `Level ${index + 1}`,
      `Native level ${level.id}`,
      undefined,
      ifcRef(placementId),
      undefined,
      level.name || `Level ${index + 1}`,
      ifcEnum('ELEMENT'),
      level.zElevation,
    ], guid);
    ctx.storeyByLevelId.set(level.id, storeyId);
    storeyIds.push(storeyId);
  });
  writer.add('IFCRELAGGREGATES', [guidFor(ctx, 'rel-building-storeys'), ifcRef(ctx.ownerHistoryId), 'Building Storeys', undefined, ifcRef(buildingId), storeyIds.map(ifcRef)]);
};

const createCommonContexts = (writer: IfcWriter) => {
  const personId = writer.add('IFCPERSON', [undefined, 'Archi AI', undefined, undefined, undefined, undefined, undefined, undefined]);
  const orgId = writer.add('IFCORGANIZATION', [undefined, 'Archi AI', undefined, undefined, undefined]);
  const ownerId = writer.add('IFCPERSONANDORGANIZATION', [ifcRef(personId), ifcRef(orgId), undefined]);
  const appId = writer.add('IFCAPPLICATION', [ifcRef(orgId), '1.0', 'BIM Exporter', 'ARCHAI_BIM_EXPORTER']);
  const ownerHistoryId = writer.add('IFCOWNERHISTORY', [ifcRef(ownerId), ifcRef(appId), undefined, ifcEnum('ADDED'), undefined, undefined, undefined, Math.floor(Date.now() / 1000)]);
  const lengthUnitId = writer.add('IFCSIUNIT', [undefined, ifcEnum('LENGTHUNIT'), undefined, ifcEnum('METRE')]);
  const areaUnitId = writer.add('IFCSIUNIT', [undefined, ifcEnum('AREAUNIT'), undefined, ifcEnum('SQUARE_METRE')]);
  const volumeUnitId = writer.add('IFCSIUNIT', [undefined, ifcEnum('VOLUMEUNIT'), undefined, ifcEnum('CUBIC_METRE')]);
  const angleUnitId = writer.add('IFCSIUNIT', [undefined, ifcEnum('PLANEANGLEUNIT'), undefined, ifcEnum('RADIAN')]);
  writer.add('IFCUNITASSIGNMENT', [[ifcRef(lengthUnitId), ifcRef(areaUnitId), ifcRef(volumeUnitId), ifcRef(angleUnitId)]]);
  const originId = addAxis2Placement3D(writer, [0, 0, 0]);
  const trueNorthId = addDirection(writer, [0, 1]);
  const modelContextId = writer.add('IFCGEOMETRICREPRESENTATIONCONTEXT', [undefined, 'Model', 3, 0.00001, ifcRef(originId), ifcRef(trueNorthId)]);
  const bodyContextId = writer.add('IFCGEOMETRICREPRESENTATIONSUBCONTEXT', ['Body', 'Model', undefined, undefined, undefined, undefined, ifcRef(modelContextId), undefined, ifcEnum('MODEL_VIEW'), undefined]);
  const axisContextId = writer.add('IFCGEOMETRICREPRESENTATIONSUBCONTEXT', ['Axis', 'Model', undefined, undefined, undefined, undefined, ifcRef(modelContextId), undefined, ifcEnum('GRAPH_VIEW'), undefined]);
  const annotationContextId = writer.add('IFCGEOMETRICREPRESENTATIONSUBCONTEXT', ['Annotation', 'Model', undefined, undefined, undefined, undefined, ifcRef(modelContextId), undefined, ifcEnum('PLAN_VIEW'), undefined]);
  return { ownerHistoryId, modelContextId, bodyContextId, axisContextId, annotationContextId };
};

const addLinearOrCurvedAxisCurve = (ctx: ExportContext, el: ArchElement, level: Level, baseOffset = 0): number | null => {
  const z = levelBaseZ(level) + baseOffset;
  if (el.wallSource === 'circle' && el.p1 && el.p2) {
    const box = getCurveBoxPoints(el);
    if (!box) return null;
    const center = ifcPoint(box.boxP1, z);
    const placement = addAxis2Placement3D(ctx.writer, center);
    const circle = ctx.writer.add('IFCCIRCLE', [ifcRef(placement), Math.max(0.01, pointDistance(box.boxP1, box.boxP2))]);
    if (el.startT !== undefined && el.endT !== undefined) {
      let span = el.endT - el.startT;
      if (span < 0) span += 1;
      if (span > 0.000001 && span < 0.999999) {
        return ctx.writer.add('IFCTRIMMEDCURVE', [
          ifcRef(circle),
          [el.startT * 360],
          [el.endT * 360],
          true,
          ifcEnum('PARAMETER'),
        ]);
      }
    }
    return circle;
  }
  if ((el.wallSource === 'ellipse' || el.type === 'ellipse') && (el.ellipseCenter || (el.p1 && el.p2))) {
    const box = getCurveBoxPoints(el);
    const center = el.ellipseCenter || (box ? midpoint(box.boxP1, box.boxP2) : midpoint(el.p1!, el.p2!));
    const placement = addAxis2Placement3D(ctx.writer, ifcPoint(center, z), el.ellipseRotation || 0);
    const rx = Math.max(0.01, el.ellipseRadiusX ?? (box ? Math.abs(box.boxP2.x - box.boxP1.x) / 2 : Math.abs(el.p2!.x - el.p1!.x) / 2));
    const ry = Math.max(0.01, el.ellipseRadiusY ?? (box ? Math.abs(box.boxP2.y - box.boxP1.y) / 2 : Math.abs(el.p2!.y - el.p1!.y) / 2));
    const ellipse = ctx.writer.add('IFCELLIPSE', [ifcRef(placement), rx, ry]);
    if (el.ellipseStartAngle !== undefined || el.ellipseEndAngle !== undefined) {
      return ctx.writer.add('IFCTRIMMEDCURVE', [
        ifcRef(ellipse),
        [((el.ellipseStartAngle ?? 0) * 180 / Math.PI)],
        [((el.ellipseEndAngle ?? Math.PI * 2) * 180 / Math.PI)],
        !el.ellipseCounterclockwise,
        ifcEnum('PARAMETER'),
      ]);
    }
    return ellipse;
  }
  if ((el.wallSource === 'arc' || el.type === 'arc') && el.arcCenter && el.arcRadius && el.arcStartAngle !== undefined && el.arcEndAngle !== undefined) {
    const placement = addAxis2Placement3D(ctx.writer, ifcPoint(el.arcCenter, z));
    const circle = ctx.writer.add('IFCCIRCLE', [ifcRef(placement), el.arcRadius]);
    return ctx.writer.add('IFCTRIMMEDCURVE', [
      ifcRef(circle),
      [el.arcStartAngle * 180 / Math.PI],
      [el.arcEndAngle * 180 / Math.PI],
      !el.arcCounterclockwise,
      ifcEnum('PARAMETER'),
    ]);
  }
  const points = el.isCurved || el.wallSource === 'arc'
    ? sampleCurveElement(el, 24)
    : el.p1 && el.p2 ? [el.p1, el.p2] : [];
  if (points.length < 2) return null;
  return addPolyline(ctx.writer, points.map(point => ifcPoint(point, z)));
};

const exportWall = (ctx: ExportContext, el: ArchElement) => {
  if (!el.p1 || !el.p2) {
    ctx.summary.skippedElements += 1;
    log(ctx.logs, 'warning', 'WALL_MISSING_PATH', 'Wall skipped because p1/p2 path geometry is missing.', el.id, 'IfcWall');
    return;
  }
  const level = resolveLevel(ctx, el);
  const baseOffset = el.baseOffset ?? el.elevation ?? 0;
  const thickness = Math.max(0.01, el.thickness || WALL_THICKNESS_DEFAULT);
  const height = Math.max(0.05, el.height || level.height || WALL_HEIGHT_DEFAULT);
  const axisCurveId = addLinearOrCurvedAxisCurve(ctx, el, level, baseOffset);
  if (!axisCurveId) {
    ctx.summary.skippedElements += 1;
    log(ctx.logs, 'warning', 'WALL_AXIS_UNSUPPORTED', 'Wall skipped because no valid IFC axis curve could be created.', el.id, 'IfcWall');
    return;
  }
  const centerline = el.isCurved || el.wallSource === 'arc' || el.wallSource === 'circle' || el.wallSource === 'ellipse'
    ? sampleCurveElement(el, 32)
    : [el.p1, el.p2];
  const bodyBoundary = centerline.length === 2
    ? rectangleAroundSegment(centerline[0], centerline[1], thickness)
    : offsetPolylineBand(centerline, thickness);
  const profile = addClosedProfile(ctx.writer, bodyBoundary, 0, 'Wall Body');
  const solid = addExtrudedSolidFromProfile(ctx.writer, profile, levelBaseZ(level) + baseOffset, height);
  const shapeId = addProductShape(ctx.writer, [addAxisRepresentation(ctx, [axisCurveId]), addBodyRepresentation(ctx, [solid])]);
  const placementId = addLocalPlacement(ctx.writer, [0, 0, 0]);
  const guid = guidFor(ctx, `element:${el.id}:IfcWall`, existingElementGuid(el));
  const wallId = ctx.writer.add('IFCWALL', [
    guid,
    ifcRef(ctx.ownerHistoryId),
    el.label || el.subType || 'Wall',
    undefined,
    el.subType || 'Native Wall',
    ifcRef(placementId),
    ifcRef(shapeId),
    el.id,
    ifcEnum('STANDARD'),
  ], guid);
  const storeyId = ctx.storeyByLevelId.get(level.id);
  const product: ExportProduct = { entityId: wallId, ifcClass: 'IfcWall', globalId: guid, nativeElement: el, levelId: level.id, storeyEntityId: storeyId };
  registerProduct(ctx, product);
  ctx.wallProductsByNativeId.set(el.id, product);
  addWallMaterialLayerAssignment(ctx, wallId, elementMaterialName(el, 'Wall Material'), thickness);
  addPropertySet(ctx, wallId, 'Pset_ArchiAI_Native', nativeProps(el, 'IfcWall', level, {
    BaseOffset: baseOffset,
    WallPathType: el.wallSource || (el.isCurved ? 'curved' : 'line'),
    TopOffset: el.topOffset,
  }), el.id);
  if (centerline.length > 2 && !(el.arcCenter || el.ellipseCenter || el.wallSource === 'circle' || el.wallSource === 'ellipse')) {
    log(ctx.logs, 'warning', 'CURVED_WALL_BODY_APPROXIMATED', 'Curved wall body was exported as a segmented swept profile while preserving an editable IFC axis curve where possible.', el.id, 'IfcWall');
  }
};

const exportOpeningFeature = (
  ctx: ExportContext,
  el: ArchElement,
  hostWall: ArchElement,
  level: Level,
  width: number,
  height: number,
  sillOrBase: number,
  seedSuffix: string,
  generated = false,
): ExportProduct | null => {
  const hostProduct = ctx.wallProductsByNativeId.get(hostWall.id);
  if (!hostProduct || !el.pos) return null;
  const hostThickness = Math.max(0.1, (hostWall.thickness || WALL_THICKNESS_DEFAULT) * 1.35);
  const placementId = addLocalPlacement(ctx.writer, ifcPoint(el.pos, levelBaseZ(level) + sillOrBase), degToRad(el.rotation || 0));
  const shapeId = addBoxShape(ctx, Math.max(0.05, width), hostThickness, Math.max(0.05, height), 0);
  const openingGuid = guidFor(ctx, `opening:${el.id}:${seedSuffix}`);
  const openingId = ctx.writer.add('IFCOPENINGELEMENT', [
    openingGuid,
    ifcRef(ctx.ownerHistoryId),
    `${el.label || el.type} Opening`,
    undefined,
    'Opening',
    ifcRef(placementId),
    ifcRef(shapeId),
    `${el.id}:opening`,
    ifcEnum('OPENING'),
  ], openingGuid);
  ctx.writer.add('IFCRELVOIDSELEMENT', [
    guidFor(ctx, `rel-void:${hostProduct.entityId}:${openingId}`),
    ifcRef(ctx.ownerHistoryId),
    'Wall Opening',
    undefined,
    ifcRef(hostProduct.entityId),
    ifcRef(openingId),
  ]);
  const product: ExportProduct = {
    entityId: openingId,
    ifcClass: 'IfcOpeningElement',
    globalId: openingGuid,
    nativeElement: generated ? undefined : el,
    levelId: level.id,
    storeyEntityId: ctx.storeyByLevelId.get(level.id),
    isGenerated: generated,
    isOpeningFeature: true,
  };
  registerProduct(ctx, product, !generated);
  addPropertySet(ctx, openingId, 'Pset_ArchiAI_Native', nativeProps(el, 'IfcOpeningElement', level, {
    HostWallId: hostWall.id,
    GeneratedForFilling: generated,
    OpeningWidth: width,
    OpeningHeight: height,
  }), `${el.id}:opening:${seedSuffix}`);
  return product;
};

const exportDoorOrWindow = (ctx: ExportContext, el: ArchElement, type: 'door' | 'window', walls: ArchElement[]) => {
  if (!el.pos) {
    ctx.summary.skippedElements += 1;
    log(ctx.logs, 'warning', 'HOSTED_ELEMENT_MISSING_POSITION', `${type} skipped because insertion position is missing.`, el.id, type === 'door' ? 'IfcDoor' : 'IfcWindow');
    return;
  }
  const level = resolveLevel(ctx, el);
  const host = findHostWall(el, walls);
  const ifcClass = type === 'door' ? 'IfcDoor' : 'IfcWindow';
  const width = Math.max(0.05, el.width || (type === 'door' ? 0.9 : 1.2));
  const sill = type === 'window' ? Math.max(0, el.sillHeight ?? el.elevation ?? WINDOW_SILL_HEIGHT_DEFAULT) : Math.max(0, el.elevation ?? 0);
  const height = Math.max(0.05, el.height || (type === 'window' ? Math.max(0.05, (el.topHeight || WINDOW_TOP_HEIGHT_DEFAULT) - sill) : DOOR_HEIGHT_DEFAULT));
  const depth = Math.max(0.08, (host?.wall.thickness || WALL_THICKNESS_DEFAULT) * 0.55);
  const rotation = host?.angle ?? el.rotation ?? 0;
  const placementId = addLocalPlacement(ctx.writer, ifcPoint(host?.point || el.pos, levelBaseZ(level) + sill), degToRad(rotation));
  const shapeId = addBoxShape(ctx, width, depth, height, 0);
  const guid = guidFor(ctx, `element:${el.id}:${ifcClass}`, existingElementGuid(el));
  const entityId = type === 'door'
    ? ctx.writer.add('IFCDOOR', [
      guid, ifcRef(ctx.ownerHistoryId), el.label || el.subType || 'Door', undefined, el.subType || 'Native Door',
      ifcRef(placementId), ifcRef(shapeId), el.id, height, width, ifcEnum('DOOR'), ifcEnum('SINGLE_SWING_LEFT'), undefined,
    ], guid)
    : ctx.writer.add('IFCWINDOW', [
      guid, ifcRef(ctx.ownerHistoryId), el.label || el.subType || 'Window', undefined, el.subType || 'Native Window',
      ifcRef(placementId), ifcRef(shapeId), el.id, height, width, ifcEnum('WINDOW'), ifcEnum('SINGLE_PANEL'), undefined,
    ], guid);
  const product: ExportProduct = { entityId, ifcClass, globalId: guid, nativeElement: el, levelId: level.id, storeyEntityId: ctx.storeyByLevelId.get(level.id) };
  registerProduct(ctx, product);
  addMaterialAssignment(ctx, entityId, elementMaterialName(el, type === 'door' ? 'Door Material' : 'Window Material'));
  addPropertySet(ctx, entityId, 'Pset_ArchiAI_Native', nativeProps(el, ifcClass, level, {
    Width: width,
    Height: height,
    SillHeight: type === 'window' ? sill : undefined,
    Rotation: rotation,
    HostWallId: host?.wall.id,
    HostParameter: host?.t,
  }), el.id);
  if (host) {
    const opening = exportOpeningFeature(ctx, { ...el, pos: host.point, rotation }, host.wall, level, width, height, sill, 'filled', true);
    if (opening) {
      ctx.writer.add('IFCRELFILLSELEMENT', [
        guidFor(ctx, `rel-fill:${opening.entityId}:${entityId}`),
        ifcRef(ctx.ownerHistoryId),
        `${ifcClass} Filling`,
        undefined,
        ifcRef(opening.entityId),
        ifcRef(entityId),
      ]);
    }
  } else {
    log(ctx.logs, 'warning', 'HOST_WALL_NOT_FOUND', `${ifcClass} exported without a wall void/fill relationship because no host wall could be resolved.`, el.id, ifcClass);
  }
};

const exportWallOpening = (ctx: ExportContext, el: ArchElement, walls: ArchElement[]) => {
  if (!el.pos) {
    ctx.summary.skippedElements += 1;
    log(ctx.logs, 'warning', 'OPENING_MISSING_POSITION', 'Wall opening skipped because position is missing.', el.id, 'IfcOpeningElement');
    return;
  }
  const level = resolveLevel(ctx, el);
  const host = findHostWall(el, walls);
  if (!host) {
    if (ctx.options.includeUnsupportedAsProxy) exportProxy(ctx, el, 'Unhosted wall opening proxy');
    else {
      ctx.summary.skippedElements += 1;
      log(ctx.logs, 'warning', 'OPENING_HOST_NOT_FOUND', 'Wall opening skipped because no host wall could be resolved and proxy export is disabled.', el.id, 'IfcOpeningElement');
    }
    return;
  }
  exportOpeningFeature(
    ctx,
    { ...el, pos: host.point, rotation: host.angle },
    host.wall,
    level,
    Math.max(0.05, el.width || 1),
    Math.max(0.05, el.height || WALL_OPENING_HEIGHT_DEFAULT),
    Math.max(0, el.elevation ?? 0),
    'native',
    false,
  );
};

const exportBoundaryElement = (ctx: ExportContext, el: ArchElement, ifcClass: 'IfcSlab' | 'IfcCovering' | 'IfcSpace') => {
  if (!el.boundary || el.boundary.length < 3) {
    ctx.summary.skippedElements += 1;
    log(ctx.logs, 'warning', 'BOUNDARY_MISSING', `${ifcClass} skipped because boundary geometry is missing.`, el.id, ifcClass);
    return;
  }
  const level = resolveLevel(ctx, el);
  const thickness = Math.max(0.02, el.height || ctx.options.unitSystem && DEFAULT_PROJECT_SETTINGS_3D.slabThickness || 0.3);
  const baseZ = levelBaseZ(level) + (el.elevation ?? (ifcClass === 'IfcCovering' ? Math.max(0, level.height - thickness) : 0));
  const shapeId = addBoundaryShape(ctx, el.boundary, baseZ, ifcClass === 'IfcSpace' ? Math.max(0.05, level.height || WALL_HEIGHT_DEFAULT) : thickness, `${ifcClass} Profile`);
  const centroid = polygonCentroid(el.boundary);
  const placementId = addLocalPlacement(ctx.writer, ifcPoint(centroid, levelBaseZ(level)));
  const guid = guidFor(ctx, `element:${el.id}:${ifcClass}`, existingElementGuid(el));
  let entityId: number;
  if (ifcClass === 'IfcSlab') {
    entityId = ctx.writer.add('IFCSLAB', [
      guid, ifcRef(ctx.ownerHistoryId), el.label || 'Floor', undefined, el.subType || 'Native Floor',
      ifcRef(placementId), ifcRef(shapeId), el.id, ifcEnum('FLOOR'),
    ], guid);
  } else if (ifcClass === 'IfcCovering') {
    entityId = ctx.writer.add('IFCCOVERING', [
      guid, ifcRef(ctx.ownerHistoryId), el.label || 'Ceiling', undefined, el.subType || 'Native Ceiling',
      ifcRef(placementId), ifcRef(shapeId), el.id, ifcEnum('CEILING'),
    ], guid);
  } else {
    entityId = ctx.writer.add('IFCSPACE', [
      guid, ifcRef(ctx.ownerHistoryId), el.label || 'Room', undefined, el.subType || 'Native Room',
      ifcRef(placementId), ifcRef(shapeId), el.id, ifcEnum('SPACE'), el.elevation || 0,
    ], guid);
  }
  registerProduct(ctx, { entityId, ifcClass, globalId: guid, nativeElement: el, levelId: level.id, storeyEntityId: ctx.storeyByLevelId.get(level.id) });
  addMaterialAssignment(ctx, entityId, elementMaterialName(el, ifcClass === 'IfcCovering' ? 'Ceiling Material' : ifcClass === 'IfcSlab' ? 'Floor Material' : 'Space Material'));
  addPropertySet(ctx, entityId, 'Pset_ArchiAI_Native', nativeProps(el, ifcClass, level, {
    BoundaryPointCount: el.boundary.length,
    Thickness: ifcClass === 'IfcSpace' ? undefined : thickness,
  }), el.id);
};

const exportColumn = (ctx: ExportContext, el: ArchElement) => {
  if (!el.pos) {
    ctx.summary.skippedElements += 1;
    log(ctx.logs, 'warning', 'COLUMN_MISSING_POSITION', 'Column skipped because position is missing.', el.id, 'IfcColumn');
    return;
  }
  const level = resolveLevel(ctx, el);
  const width = Math.max(0.05, el.width || el.thickness || 0.45);
  const depth = Math.max(0.05, el.depth || width);
  const height = Math.max(0.05, el.height || level.height || WALL_HEIGHT_DEFAULT);
  const placementId = addLocalPlacement(ctx.writer, ifcPoint(el.pos, levelBaseZ(level) + (el.elevation || 0)), degToRad(el.rotation || 0));
  const boundary = el.shape === 'circle'
    ? Array.from({ length: 24 }, (_, index) => {
      const a = index / 24 * Math.PI * 2;
      return { x: Math.cos(a) * width / 2, y: Math.sin(a) * depth / 2 };
    })
    : undefined;
  const shapeId = boundary
    ? addProductShape(ctx.writer, [addBodyRepresentation(ctx, [addExtrudedSolidFromProfile(ctx.writer, addClosedProfile(ctx.writer, boundary, 0, 'Column Profile'), 0, height)])])
    : addBoxShape(ctx, width, depth, height, 0);
  const guid = guidFor(ctx, `element:${el.id}:IfcColumn`, existingElementGuid(el));
  const entityId = ctx.writer.add('IFCCOLUMN', [
    guid, ifcRef(ctx.ownerHistoryId), el.label || el.subType || 'Column', undefined, el.shape === 'circle' ? 'Round Column' : 'Native Column',
    ifcRef(placementId), ifcRef(shapeId), el.id, ifcEnum('COLUMN'),
  ], guid);
  registerProduct(ctx, { entityId, ifcClass: 'IfcColumn', globalId: guid, nativeElement: el, levelId: level.id, storeyEntityId: ctx.storeyByLevelId.get(level.id) });
  addMaterialAssignment(ctx, entityId, elementMaterialName(el, 'Column Material'));
  addPropertySet(ctx, entityId, 'Pset_ArchiAI_Native', nativeProps(el, 'IfcColumn', level, { Width: width, Depth: depth, Height: height, Shape: el.shape }), el.id);
};

const exportPathBoxElement = (ctx: ExportContext, el: ArchElement, ifcClass: 'IfcStairFlight' | 'IfcRailing') => {
  if (!el.p1 || !el.p2) {
    ctx.summary.skippedElements += 1;
    log(ctx.logs, 'warning', 'PATH_MISSING', `${ifcClass} skipped because p1/p2 path geometry is missing.`, el.id, ifcClass);
    return;
  }
  const level = resolveLevel(ctx, el);
  const width = Math.max(0.05, el.width || (ifcClass === 'IfcRailing' ? 0.08 : 1));
  const height = Math.max(0.05, el.height || (ifcClass === 'IfcRailing' ? 1.1 : level.height || WALL_HEIGHT_DEFAULT));
  const boundary = rectangleAroundSegment(el.p1, el.p2, width);
  const profile = addClosedProfile(ctx.writer, boundary, 0, `${ifcClass} Body`);
  const solid = addExtrudedSolidFromProfile(ctx.writer, profile, levelBaseZ(level) + (el.elevation || 0), height);
  const axis = addPolyline(ctx.writer, [ifcPoint(el.p1, levelBaseZ(level)), ifcPoint(el.p2, levelBaseZ(level) + (ifcClass === 'IfcStairFlight' ? height : 0))]);
  const shapeId = addProductShape(ctx.writer, [addAxisRepresentation(ctx, [axis]), addBodyRepresentation(ctx, [solid])]);
  const placementId = addLocalPlacement(ctx.writer, [0, 0, 0]);
  const guid = guidFor(ctx, `element:${el.id}:${ifcClass}`, existingElementGuid(el));
  let entityId: number;
  if (ifcClass === 'IfcStairFlight') {
    const runLength = pointDistance(el.p1, el.p2);
    const risers = Math.max(1, Math.round(el.metadata?.stepCount || el.metadata?.riserCount || height / 0.17));
    const treads = Math.max(1, risers - 1);
    entityId = ctx.writer.add('IFCSTAIRFLIGHT', [
      guid, ifcRef(ctx.ownerHistoryId), el.label || 'Stair Flight', undefined, el.subType || 'Native Stair',
      ifcRef(placementId), ifcRef(shapeId), el.id, ifcEnum('STRAIGHT'), risers, treads, height / risers, runLength / treads,
    ], guid);
    const stairGuid = guidFor(ctx, `aggregate-stair:${el.id}`);
    const stairId = ctx.writer.add('IFCSTAIR', [
      stairGuid, ifcRef(ctx.ownerHistoryId), el.label || 'Stair', undefined, el.subType || 'Native Stair',
      ifcRef(placementId), undefined, `${el.id}:stair`, ifcEnum('STRAIGHT_RUN_STAIR'),
    ], stairGuid);
    ctx.writer.add('IFCRELAGGREGATES', [guidFor(ctx, `rel-stair-flight:${el.id}`), ifcRef(ctx.ownerHistoryId), 'Stair Flight Assembly', undefined, ifcRef(stairId), [ifcRef(entityId)]]);
    incrementClass(ctx.summary, 'IfcStair');
  } else {
    entityId = ctx.writer.add('IFCRAILING', [
      guid, ifcRef(ctx.ownerHistoryId), el.label || 'Railing', undefined, el.subType || 'Native Railing',
      ifcRef(placementId), ifcRef(shapeId), el.id, ifcEnum('GUARDRAIL'),
    ], guid);
  }
  registerProduct(ctx, { entityId, ifcClass, globalId: guid, nativeElement: el, levelId: level.id, storeyEntityId: ctx.storeyByLevelId.get(level.id) });
  addMaterialAssignment(ctx, entityId, elementMaterialName(el, ifcClass === 'IfcRailing' ? 'Railing Material' : 'Stair Material'));
  addPropertySet(ctx, entityId, 'Pset_ArchiAI_Native', nativeProps(el, ifcClass, level, {
    Width: width,
    Height: height,
    RunLength: pointDistance(el.p1, el.p2),
  }), el.id);
};

const exportGridline = (ctx: ExportContext, el: ArchElement) => {
  if (!el.p1 || !el.p2) {
    ctx.summary.skippedElements += 1;
    log(ctx.logs, 'warning', 'GRID_MISSING_PATH', 'Gridline skipped because p1/p2 path geometry is missing.', el.id, 'IfcGrid');
    return;
  }
  const level = resolveLevel(ctx, el);
  const placementId = addLocalPlacement(ctx.writer, [0, 0, levelBaseZ(level)]);
  const curveId = addPolyline(ctx.writer, [ifcPoint(el.p1, 0), ifcPoint(el.p2, 0)]);
  const axisId = ctx.writer.add('IFCGRIDAXIS', [el.label || 'A', ifcRef(curveId), true]);
  const guid = guidFor(ctx, `element:${el.id}:IfcGrid`, existingElementGuid(el));
  const entityId = ctx.writer.add('IFCGRID', [
    guid, ifcRef(ctx.ownerHistoryId), el.label || 'Grid', undefined, 'Native Gridline',
    ifcRef(placementId), undefined, [ifcRef(axisId)], [], [], ifcEnum('RECTANGULAR'),
  ], guid);
  registerProduct(ctx, { entityId, ifcClass: 'IfcGrid', globalId: guid, nativeElement: el, levelId: level.id, storeyEntityId: ctx.storeyByLevelId.get(level.id) });
  addPropertySet(ctx, entityId, 'Pset_ArchiAI_Native', nativeProps(el, 'IfcGrid', level), el.id);
};

const annotationCurve = (ctx: ExportContext, el: ArchElement, level: Level): number | null => {
  const z = levelBaseZ(level) + (el.elevation || 0);
  const elementType = String(el.type);
  if ((el.type === 'line' || el.type === 'dimension' || el.type === 'gridline') && el.p1 && el.p2) {
    return addPolyline(ctx.writer, [ifcPoint(el.p1, z), ifcPoint(el.p2, z)]);
  }
  if ((elementType === 'rectangle' || elementType === 'rect') && el.p1 && el.p2) {
    const points = [
      { x: el.p1.x, y: el.p1.y },
      { x: el.p2.x, y: el.p1.y },
      { x: el.p2.x, y: el.p2.y },
      { x: el.p1.x, y: el.p2.y },
      { x: el.p1.x, y: el.p1.y },
    ];
    return addPolyline(ctx.writer, points.map(point => ifcPoint(point, z)));
  }
  if (el.type === 'circle' && el.p1 && el.p2) {
    const placement = addAxis2Placement3D(ctx.writer, ifcPoint(el.p1, z));
    return ctx.writer.add('IFCCIRCLE', [ifcRef(placement), pointDistance(el.p1, el.p2)]);
  }
  if (el.type === 'ellipse' && (el.ellipseCenter || (el.p1 && el.p2))) {
    const center = el.ellipseCenter || midpoint(el.p1!, el.p2!);
    const placement = addAxis2Placement3D(ctx.writer, ifcPoint(center, z), el.ellipseRotation || 0);
    return ctx.writer.add('IFCELLIPSE', [ifcRef(placement), el.ellipseRadiusX || Math.abs(el.p2!.x - el.p1!.x) / 2, el.ellipseRadiusY || Math.abs(el.p2!.y - el.p1!.y) / 2]);
  }
  if ((el.type === 'arc' || el.isCurved) && el.p1 && el.p2) {
    const points = sampleCurveElement(el, 24);
    if (points.length >= 2) return addPolyline(ctx.writer, points.map(point => ifcPoint(point, z)));
  }
  if ((el.type === 'label' || el.type === 'elevation-marker') && el.pos) {
    const size = 0.2;
    const p1 = { x: el.pos.x - size / 2, y: el.pos.y };
    const p2 = { x: el.pos.x + size / 2, y: el.pos.y };
    return addPolyline(ctx.writer, [ifcPoint(p1, z), ifcPoint(p2, z)]);
  }
  return null;
};

const exportAnnotation = (ctx: ExportContext, el: ArchElement) => {
  const level = resolveLevel(ctx, el);
  const curveId = annotationCurve(ctx, el, level);
  if (!curveId) {
    ctx.summary.skippedElements += 1;
    log(ctx.logs, 'warning', 'ANNOTATION_GEOMETRY_MISSING', 'Annotation skipped because supported curve geometry is missing.', el.id, 'IfcAnnotation');
    return;
  }
  const shapeId = addProductShape(ctx.writer, [addAnnotationRepresentation(ctx, [curveId])]);
  const placementId = addLocalPlacement(ctx.writer, [0, 0, 0]);
  const guid = guidFor(ctx, `element:${el.id}:IfcAnnotation`, existingElementGuid(el));
  const entityId = ctx.writer.add('IFCANNOTATION', [
    guid, ifcRef(ctx.ownerHistoryId), el.label || el.direction || el.type, undefined, el.type,
    ifcRef(placementId), ifcRef(shapeId),
  ], guid);
  registerProduct(ctx, { entityId, ifcClass: 'IfcAnnotation', globalId: guid, nativeElement: el, levelId: level.id, storeyEntityId: ctx.storeyByLevelId.get(level.id) });
  addPropertySet(ctx, entityId, 'Pset_ArchiAI_Native', nativeProps(el, 'IfcAnnotation', level, {
    Text: el.label,
    Direction: el.direction,
    ViewId: el.viewId,
  }), el.id);
  if (el.type === 'label' || el.type === 'dimension' || el.type === 'elevation-marker') {
    log(ctx.logs, 'info', 'ANNOTATION_LIMITED', `${el.type} exported as IFC annotation geometry with text metadata.`, el.id, 'IfcAnnotation');
  }
};

const exportProxy = (ctx: ExportContext, el: ArchElement, reason = 'Unsupported native object exported as proxy') => {
  if (!ctx.options.includeUnsupportedAsProxy) {
    ctx.summary.skippedElements += 1;
    log(ctx.logs, 'warning', 'UNSUPPORTED_SKIPPED', `${el.type} skipped because generic proxy export is disabled.`, el.id, 'IfcBuildingElementProxy');
    return;
  }
  const level = resolveLevel(ctx, el);
  const position = el.pos || el.p1 || (el.boundary?.length ? polygonCentroid(el.boundary) : { x: 0, y: 0 });
  const width = Math.max(0.1, el.width || (el.p1 && el.p2 ? pointDistance(el.p1, el.p2) : 1));
  const depth = Math.max(0.1, el.depth || el.thickness || 1);
  const height = Math.max(0.05, el.height || 0.75);
  const placementId = addLocalPlacement(ctx.writer, ifcPoint(position, levelBaseZ(level) + (el.elevation || 0)), degToRad(el.rotation || 0));
  const shapeId = el.boundary?.length && el.boundary.length >= 3
    ? addBoundaryShape(ctx, el.boundary, 0, height, 'Proxy Profile')
    : addBoxShape(ctx, width, depth, height, 0);
  const guid = guidFor(ctx, `element:${el.id}:IfcBuildingElementProxy`, existingElementGuid(el));
  const entityId = ctx.writer.add('IFCBUILDINGELEMENTPROXY', [
    guid, ifcRef(ctx.ownerHistoryId), el.label || el.subType || el.type, reason, el.type,
    ifcRef(placementId), ifcRef(shapeId), el.id, ifcEnum('USERDEFINED'),
  ], guid);
  registerProduct(ctx, { entityId, ifcClass: 'IfcBuildingElementProxy', globalId: guid, nativeElement: el, levelId: level.id, storeyEntityId: ctx.storeyByLevelId.get(level.id), isProxy: true });
  ctx.summary.proxyExports += 1;
  addMaterialAssignment(ctx, entityId, elementMaterialName(el, 'Proxy Material'));
  addPropertySet(ctx, entityId, 'Pset_ArchiAI_Native', nativeProps(el, 'IfcBuildingElementProxy', level, {
    ProxyReason: reason,
    OriginalNativeType: el.type,
  }), el.id);
  log(ctx.logs, 'warning', 'UNSUPPORTED_PROXY', `${el.type} exported as IfcBuildingElementProxy.`, el.id, 'IfcBuildingElementProxy');
};

const exportGroupEntities = (ctx: ExportContext, elements: ArchElement[]) => {
  const explicitGroups = elements.filter(el => el.type === 'group');
  const groupIds = new Set([...explicitGroups.map(el => el.id), ...Array.from(ctx.groupAssignments.keys())]);
  groupIds.forEach(groupId => {
    const members = ctx.groupAssignments.get(groupId) || [];
    if (!members.length) return;
    const groupEl = elements.find(el => el.id === groupId);
    const guid = guidFor(ctx, `group:${groupId}`, groupEl ? existingElementGuid(groupEl) : undefined);
    const groupEntityId = ctx.writer.add('IFCGROUP', [guid, ifcRef(ctx.ownerHistoryId), groupEl?.label || groupEl?.subType || 'Native Group', undefined, groupId], guid);
    ctx.writer.add('IFCRELASSIGNSTOGROUP', [
      guidFor(ctx, `rel-group:${groupId}`),
      ifcRef(ctx.ownerHistoryId),
      'Native Group Members',
      undefined,
      members.map(ifcRef),
      undefined,
      ifcRef(groupEntityId),
    ]);
    incrementClass(ctx.summary, 'IfcGroup');
    if (groupEl) {
      const level = resolveLevel(ctx, groupEl);
      ctx.guidByElementId.set(groupEl.id, { guid, ifcClass: 'IfcGroup' });
      addPropertySet(ctx, groupEntityId, 'Pset_ArchiAI_Native', nativeProps(groupEl, 'IfcGroup', level, { MemberCount: members.length }), groupEl.id);
    }
  });
};

const addContainmentRelations = (ctx: ExportContext) => {
  ctx.levels.forEach(level => {
    const storeyId = ctx.storeyByLevelId.get(level.id);
    if (!storeyId) return;
    const productIds = ctx.products
      .filter(product => product.storeyEntityId === storeyId && !product.isOpeningFeature)
      .map(product => product.entityId);
    if (!productIds.length) return;
    ctx.writer.add('IFCRELCONTAINEDINSPATIALSTRUCTURE', [
      guidFor(ctx, `rel-containment:${level.id}`),
      ifcRef(ctx.ownerHistoryId),
      `Elements on ${level.name}`,
      undefined,
      productIds.map(ifcRef),
      ifcRef(storeyId),
    ]);
  });
};

const createContext = (project: Project, options: BimExportOptions, levels: Level[], sourceElementCount: number): ExportContext => {
  const writer = new IfcWriter();
  const common = createCommonContexts(writer);
  const logs: BimExportLog[] = [];
  return {
    writer,
    ...common,
    storeyByLevelId: new Map(),
    levels,
    options,
    logs,
    summary: emptySummary(project, options, levels, sourceElementCount),
    usedGuids: new Set(),
    guidByElementId: new Map(),
    products: [],
    materialByName: new Map(),
    materialLayerUsageByKey: new Map(),
    wallProductsByNativeId: new Map(),
    groupAssignments: new Map(),
    hierarchyGuids: { storeys: {} },
  };
};

const validateExport = (ctx: ExportContext, ifcText: string): BimExportValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!/ISO-10303-21/i.test(ifcText)) errors.push('Missing STEP header.');
  if (!new RegExp(`FILE_SCHEMA\\s*\\(\\s*\\(\\s*'${BIM_EXPORT_SCHEMA}'`, 'i').test(ifcText)) errors.push(`Missing ${BIM_EXPORT_SCHEMA} schema declaration.`);
  if (ctx.writer.count('IFCPROJECT') !== 1) errors.push('IFC file must contain exactly one IfcProject.');
  if (ctx.writer.count('IFCBUILDING') < 1) errors.push('IFC file must contain an IfcBuilding.');
  if (ctx.writer.count('IFCBUILDINGSTOREY') < 1) errors.push('IFC file must contain at least one IfcBuildingStorey.');
  if (ctx.writer.count('IFCUNITASSIGNMENT') < 1) errors.push('IFC file must contain unit assignment.');
  const globalIds = ctx.writer.entities.map(entity => entity.globalId).filter(validIfcGuid);
  if (globalIds.length !== new Set(globalIds).size) errors.push('IFC GlobalIds must be unique.');
  const invalidGuid = ctx.writer.entities.find(entity => entity.globalId !== undefined && !validIfcGuid(entity.globalId));
  if (invalidGuid) errors.push(`Invalid GlobalId on #${invalidGuid.id} ${invalidGuid.type}.`);
  const containedProducts = ctx.products.filter(product => !product.isOpeningFeature);
  if (ctx.summary.sourceElementCount > 0 && containedProducts.length === 0) errors.push('No exportable IFC products were generated.');
  if (ctx.products.some(product => !product.storeyEntityId && !product.isOpeningFeature)) warnings.push('Some products were exported without storey containment.');
  if (ctx.logs.some(item => item.level === 'error')) errors.push('Export log contains errors.');
  return { isValid: errors.length === 0, errors, warnings };
};

const updateProjectWithGuids = (project: Project, ctx: ExportContext): Project => {
  const exportedAt = new Date().toISOString();
  const elements = project.elements.map(el => {
    const guidInfo = ctx.guidByElementId.get(el.id);
    if (!guidInfo) return el;
    return {
      ...el,
      metadata: {
        ...(el.metadata || {}),
        bimExport: {
          ...(el.metadata?.bimExport || {}),
          ifcGuid: guidInfo.guid,
          ifcClass: guidInfo.ifcClass,
          originalNativeId: el.id,
          schema: BIM_EXPORT_SCHEMA,
          exportVersion: BIM_EXPORT_VERSION,
          lastExportedAt: exportedAt,
        },
      },
    };
  });
  const levels = project.levels.map(level => {
    const guid = ctx.hierarchyGuids.storeys[level.id];
    if (!guid) return level;
    return {
      ...level,
      metadata: {
        ...(level.metadata || {}),
        bimExport: {
          ...(level.metadata?.bimExport || {}),
          ifcGuid: guid,
          schema: BIM_EXPORT_SCHEMA,
          exportVersion: BIM_EXPORT_VERSION,
          lastExportedAt: exportedAt,
        },
      },
    };
  });
  return {
    ...project,
    levels,
    elements,
    metadata: {
      ...(project.metadata || {}),
      bimExport: {
        ...(project.metadata?.bimExport || {}),
        ifcProjectGuid: ctx.hierarchyGuids.project,
        ifcSiteGuid: ctx.hierarchyGuids.site,
        ifcBuildingGuid: ctx.hierarchyGuids.building,
        schema: BIM_EXPORT_SCHEMA,
        exportVersion: BIM_EXPORT_VERSION,
        lastExportedAt: exportedAt,
      },
    },
  } as Project;
};

export const getDefaultBimExportOptions = (project: Project, unitSystem: UnitSystem = 'metric', activeLevelId?: string): BimExportOptions => ({
  schema: BIM_EXPORT_SCHEMA,
  projectName: project.name || 'Archi AI Project',
  projectDescription: project.metadata?.description || '',
  projectCode: project.metadata?.projectCode || '',
  unitSystem,
  levelScope: 'all',
  selectedLevelIds: project.levels.map(level => level.id),
  activeLevelId,
  includeUnsupportedAsProxy: true,
});

export const getBimExportPreflightSummary = (project: Project, options: BimExportOptions): BimExportSummary => {
  const { levels, elements } = exportableElements(project, options);
  const summary = emptySummary(project, options, levels, elements.length);
  const firstLevelId = levels[0]?.id;
  elements.forEach(el => {
    const levelId = el.levelId || firstLevelId;
    const levelSummary = summary.levelSummaries.find(item => item.id === levelId);
    if (levelSummary) levelSummary.elementCount += 1;
    const mapped = getIfcClassForElement(el, options.includeUnsupportedAsProxy);
    if (mapped) summary.classCounts[mapped] = (summary.classCounts[mapped] || 0) + 1;
    else summary.skippedElements += 1;
    if (mapped === 'IfcBuildingElementProxy') summary.proxyExports += 1;
  });
  summary.exportedNativeElements = elements.length - summary.skippedElements;
  summary.generatedIfcObjects = Object.values(summary.classCounts).reduce((sum, count) => sum + count, 0);
  return summary;
};

const getIfcClassForElement = (el: ArchElement, includeProxy: boolean): string | null => {
  if (el.type === 'wall') return 'IfcWall';
  if (el.type === 'door') return 'IfcDoor';
  if (el.type === 'window') return 'IfcWindow';
  if (el.type === 'wall-opening') return 'IfcOpeningElement';
  if (el.type === 'floor') return 'IfcSlab';
  if (el.type === 'ceiling') return 'IfcCovering';
  if (el.type === 'stair') return 'IfcStairFlight';
  if (el.type === 'column') return 'IfcColumn';
  if (el.type === 'railing') return 'IfcRailing';
  if (el.type === 'room') return 'IfcSpace';
  if (el.type === 'gridline') return 'IfcGrid';
  if (['line', 'arc', 'circle', 'ellipse', 'rectangle', 'rect', 'dimension', 'label', 'elevation-marker'].includes(el.type)) return 'IfcAnnotation';
  if (el.type === 'group') return 'IfcGroup';
  return includeProxy ? 'IfcBuildingElementProxy' : null;
};

export const exportProjectToIfc = (project: Project, options: BimExportOptions): BimExportResult => {
  const { levels, elements } = exportableElements(project, options);
  const ctx = createContext(project, options, levels, elements.length);
  if (options.schema !== BIM_EXPORT_SCHEMA) {
    log(ctx.logs, 'warning', 'SCHEMA_FORCED_IFC4', `Only ${BIM_EXPORT_SCHEMA} is currently supported; export used ${BIM_EXPORT_SCHEMA}.`);
  }
  createProjectStructure(ctx, project);

  const walls = elements.filter(el => el.type === 'wall');
  walls.forEach(el => exportWall(ctx, el));
  elements.filter(el => el.type !== 'wall').forEach(el => {
    if (el.type === 'door') exportDoorOrWindow(ctx, el, 'door', walls);
    else if (el.type === 'window') exportDoorOrWindow(ctx, el, 'window', walls);
    else if (el.type === 'wall-opening') exportWallOpening(ctx, el, walls);
    else if (el.type === 'floor') exportBoundaryElement(ctx, el, 'IfcSlab');
    else if (el.type === 'ceiling') exportBoundaryElement(ctx, el, 'IfcCovering');
    else if (el.type === 'room') exportBoundaryElement(ctx, el, 'IfcSpace');
    else if (el.type === 'column') exportColumn(ctx, el);
    else if (el.type === 'stair') exportPathBoxElement(ctx, el, 'IfcStairFlight');
    else if (el.type === 'railing') exportPathBoxElement(ctx, el, 'IfcRailing');
    else if (el.type === 'gridline') exportGridline(ctx, el);
    else if (['line', 'arc', 'circle', 'ellipse', 'rectangle', 'rect', 'dimension', 'label', 'elevation-marker'].includes(el.type)) exportAnnotation(ctx, el);
    else if (el.type === 'group') {
      // Group entities are emitted after members are known.
    } else {
      exportProxy(ctx, el);
    }
  });
  exportGroupEntities(ctx, elements);
  addContainmentRelations(ctx);

  const logCounts = getLogCounts(ctx.logs);
  ctx.summary.warnings = logCounts.warnings;
  ctx.summary.errors = logCounts.errors;
  const fileName = `${cleanFileName(options.projectName || project.name || 'bim-export')}.ifc`;
  const ifcText = ctx.writer.toStep(BIM_EXPORT_SCHEMA, fileName);
  const validation = validateExport(ctx, ifcText);
  validation.errors.forEach(message => log(ctx.logs, 'error', 'VALIDATION_ERROR', message));
  validation.warnings.forEach(message => log(ctx.logs, 'warning', 'VALIDATION_WARNING', message));
  const finalCounts = getLogCounts(ctx.logs);
  ctx.summary.warnings = finalCounts.warnings;
  ctx.summary.errors = finalCounts.errors;
  return {
    ifcText,
    fileName,
    updatedProject: updateProjectWithGuids(project, ctx),
    summary: ctx.summary,
    logs: ctx.logs,
    validation,
  };
};

export const downloadIfcFile = (contents: string, fileName: string): void => {
  const blob = new Blob([contents], { type: 'application/x-step' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName.toLowerCase().endsWith('.ifc') ? fileName : `${fileName}.ifc`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};
