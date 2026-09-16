import { ArchElement, Layer, Project, Point } from '../types';
import { DEFAULT_PROJECT_SETTINGS_3D, WALL_HEIGHT_DEFAULT } from '../constants';

interface DxfPair {
  code: number;
  value: string;
}

interface RawLine {
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  layer: string;
}

interface ImportStats {
  lines: number;
  walls: number;
  arcs: number;
  circles: number;
  text: number;
  layers: number;
  unitScale: number;
  unitSource: string;
}

export interface DxfImportResult {
  project: Project;
  stats: ImportStats;
}

export type DxfImportUnit =
  | 'auto'
  | 'unitless'
  | 'inches'
  | 'feet'
  | 'us-survey-feet'
  | 'miles'
  | 'millimeters'
  | 'centimeters'
  | 'meters'
  | 'kilometers'
  | 'microinches'
  | 'mils'
  | 'yards'
  | 'angstroms'
  | 'nanometers'
  | 'microns'
  | 'decimeters'
  | 'decameters'
  | 'hectometers'
  | 'gigameters'
  | 'astronomical-units'
  | 'light-years'
  | 'parsecs';

export type DxfLengthType = 'Architectural' | 'Decimal' | 'Engineering' | 'Fractional' | 'Scientific';
export type DxfAngleType = 'Decimal Degrees' | 'Deg/Min/Sec' | 'Grads' | 'Radians' | "Surveyor's Units";
export type DxfLightingUnit = 'International' | 'American';

export interface DxfUnitSettings {
  lengthType: DxfLengthType;
  lengthPrecision: string;
  drawingUnit: Exclude<DxfImportUnit, 'auto'>;
  insertionUnit: Exclude<DxfImportUnit, 'auto'>;
  lighting: DxfLightingUnit;
  angleType: DxfAngleType;
  anglePrecision: string;
}

interface DxfImportOptions {
  unit?: DxfImportUnit;
}

const INSUNITS_TO_METERS: Record<number, { scale: number; label: string }> = {
  0: { scale: 1, label: 'unitless' },
  1: { scale: 0.0254, label: 'inches' },
  2: { scale: 0.3048, label: 'feet' },
  3: { scale: 1609.344, label: 'miles' },
  4: { scale: 0.001, label: 'millimeters' },
  5: { scale: 0.01, label: 'centimeters' },
  6: { scale: 1, label: 'meters' },
  7: { scale: 1000, label: 'kilometers' },
  8: { scale: 0.0000000254, label: 'microinches' },
  9: { scale: 0.0000254, label: 'mils' },
  10: { scale: 0.9144, label: 'yards' },
  11: { scale: 0.0000000001, label: 'angstroms' },
  12: { scale: 0.000000001, label: 'nanometers' },
  13: { scale: 0.000001, label: 'microns' },
  14: { scale: 0.1, label: 'decimeters' },
  15: { scale: 10, label: 'decameters' },
  16: { scale: 100, label: 'hectometers' },
  17: { scale: 1000000000, label: 'gigameters' },
  18: { scale: 149597870700, label: 'astronomical units' },
  19: { scale: 9460730472580800, label: 'light years' },
  20: { scale: 30856775814913673, label: 'parsecs' },
  21: { scale: 1200 / 3937, label: 'US survey feet' },
};

const IMPORT_UNITS_TO_METERS: Record<Exclude<DxfImportUnit, 'auto'>, { scale: number; label: string }> = {
  unitless: { scale: 1, label: 'unitless' },
  inches: { scale: 0.0254, label: 'inches' },
  feet: { scale: 0.3048, label: 'feet' },
  'us-survey-feet': { scale: 1200 / 3937, label: 'US survey feet' },
  miles: { scale: 1609.344, label: 'miles' },
  millimeters: { scale: 0.001, label: 'millimeters' },
  centimeters: { scale: 0.01, label: 'centimeters' },
  meters: { scale: 1, label: 'meters' },
  kilometers: { scale: 1000, label: 'kilometers' },
  microinches: { scale: 0.0000000254, label: 'microinches' },
  mils: { scale: 0.0000254, label: 'mils' },
  yards: { scale: 0.9144, label: 'yards' },
  angstroms: { scale: 0.0000000001, label: 'angstroms' },
  nanometers: { scale: 0.000000001, label: 'nanometers' },
  microns: { scale: 0.000001, label: 'microns' },
  decimeters: { scale: 0.1, label: 'decimeters' },
  decameters: { scale: 10, label: 'decameters' },
  hectometers: { scale: 100, label: 'hectometers' },
  gigameters: { scale: 1000000000, label: 'gigameters' },
  'astronomical-units': { scale: 149597870700, label: 'astronomical units' },
  'light-years': { scale: 9460730472580800, label: 'light years' },
  parsecs: { scale: 30856775814913673, label: 'parsecs' },
};

const INSUNITS_TO_IMPORT_UNIT: Record<number, Exclude<DxfImportUnit, 'auto'>> = {
  0: 'unitless',
  1: 'inches',
  2: 'feet',
  3: 'miles',
  4: 'millimeters',
  5: 'centimeters',
  6: 'meters',
  7: 'kilometers',
  8: 'microinches',
  9: 'mils',
  10: 'yards',
  11: 'angstroms',
  12: 'nanometers',
  13: 'microns',
  14: 'decimeters',
  15: 'decameters',
  16: 'hectometers',
  17: 'gigameters',
  18: 'astronomical-units',
  19: 'light-years',
  20: 'parsecs',
  21: 'us-survey-feet',
};

const LENGTH_TYPE_BY_LUNITS: Record<number, DxfLengthType> = {
  1: 'Scientific',
  2: 'Decimal',
  3: 'Engineering',
  4: 'Architectural',
  5: 'Fractional',
};

const ANGLE_TYPE_BY_AUNITS: Record<number, DxfAngleType> = {
  0: 'Decimal Degrees',
  1: 'Deg/Min/Sec',
  2: 'Grads',
  3: 'Radians',
  4: "Surveyor's Units",
};

const LENGTH_PRECISION_BY_TYPE: Record<DxfLengthType, string[]> = {
  Architectural: [`0'-0"`, `0'-0 1/2"`, `0'-0 1/4"`, `0'-0 1/8"`, `0'-0 1/16"`, `0'-0 1/32"`, `0'-0 1/64"`, `0'-0 1/128"`, `0'-0 1/256"`],
  Decimal: ['0', '0.0', '0.00', '0.000', '0.0000', '0.00000', '0.000000', '0.0000000', '0.00000000'],
  Engineering: [`0'-0"`, `0'-0.0"`, `0'-0.00"`, `0'-0.000"`, `0'-0.0000"`, `0'-0.00000"`, `0'-0.000000"`, `0'-0.0000000"`],
  Fractional: ['0', '0 1/2', '0 1/4', '0 1/8', '0 1/16', '0 1/32', '0 1/64', '0 1/128', '0 1/256'],
  Scientific: ['0E+01', '0.0E+01', '0.00E+01', '0.000E+01', '0.0000E+01', '0.00000E+01', '0.000000E+01', '0.0000000E+01'],
};

const ANGLE_PRECISION_BY_TYPE: Record<DxfAngleType, string[]> = {
  'Decimal Degrees': ['0', '0.0', '0.00', '0.000', '0.0000', '0.00000', '0.000000', '0.0000000'],
  'Deg/Min/Sec': ['0d', `0d00'`, `0d00'00"`, `0d00'00.0"`, `0d00'00.00"`, `0d00'00.000"`, `0d00'00.0000"`],
  Grads: ['0g', '0.0g', '0.00g', '0.000g', '0.0000g', '0.00000g', '0.000000g', '0.0000000g'],
  Radians: ['0r', '0.0r', '0.00r', '0.000r', '0.0000r', '0.00000r', '0.000000r', '0.0000000r'],
  "Surveyor's Units": ['N 0d E', `N 0d00' E`, `N 0d00'00" E`, `N 0d00'00.0" E`, `N 0d00'00.00" E`, `N 0d00'00.000" E`, `N 0d00'00.0000" E`],
};

const ACI_COLORS: Record<number, string> = {
  1: '#ff0000',
  2: '#ffff00',
  3: '#00ff00',
  4: '#00ffff',
  5: '#0000ff',
  6: '#ff00ff',
  7: '#ffffff',
  8: '#808080',
  9: '#c0c0c0',
};

const cleanLayerName = (name?: string): string => {
  const value = (name || '0').trim();
  return value || '0';
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const shouldImportText = (text: string, cadHeightMeters: number | undefined): boolean => {
  if (!text) return false;
  if (text.length > 48) return false;
  if (/^[\W_]+$/.test(text)) return false;
  if (cadHeightMeters !== undefined && cadHeightMeters > 0.9) return false;
  return true;
};

const parsePairs = (contents: string): DxfPair[] => {
  const lines = contents.replace(/\r/g, '').split('\n');
  const pairs: DxfPair[] = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = Number.parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) continue;
    pairs.push({ code, value: lines[i + 1].trimEnd() });
  }
  return pairs;
};

const parseNumber = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseIntValue = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const headerIntValue = (pairs: DxfPair[], variableName: string): number | undefined => {
  for (let i = 0; i < pairs.length - 1; i += 1) {
    if (pairs[i].code === 9 && pairs[i].value.toUpperCase() === variableName.toUpperCase()) {
      return parseIntValue(pairs[i + 1].value);
    }
  }
  return undefined;
};

const precisionAt = (values: string[], index: number | undefined): string => values[clamp(index ?? 0, 0, values.length - 1)];

const extractSectionPairs = (pairs: DxfPair[], sectionName: string): DxfPair[] => {
  const target = sectionName.toUpperCase();
  const sectionPairs: DxfPair[] = [];
  let inTargetSection = false;

  for (let i = 0; i < pairs.length; i += 1) {
    const pair = pairs[i];
    if (pair.code === 0 && pair.value.toUpperCase() === 'SECTION') {
      const namePair = pairs[i + 1];
      inTargetSection = namePair?.code === 2 && namePair.value.toUpperCase() === target;
      if (inTargetSection) i += 1;
      continue;
    }

    if (pair.code === 0 && pair.value.toUpperCase() === 'ENDSEC') {
      if (inTargetSection) break;
      inTargetSection = false;
      continue;
    }

    if (inTargetSection) sectionPairs.push(pair);
  }

  return sectionPairs;
};

const toPoint = (x: number, y: number, scale: number) => ({ x: x * scale, y: -y * scale });

const getBounds = (lines: RawLine[], elements: ArchElement[] = []) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const includePoint = (point?: Point) => {
    if (!point) return;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  };

  lines.forEach(line => [line.p1, line.p2].forEach(includePoint));

  elements.forEach((element) => {
    if (element.type === 'circle' && element.p1 && element.p2) {
      const radius = Math.hypot(element.p2.x - element.p1.x, element.p2.y - element.p1.y);
      includePoint({ x: element.p1.x - radius, y: element.p1.y - radius });
      includePoint({ x: element.p1.x + radius, y: element.p1.y + radius });
      return;
    }

    if (element.type === 'arc' && element.arcCenter && element.arcRadius !== undefined && element.arcStartAngle !== undefined && element.arcEndAngle !== undefined) {
      const steps = 64;
      for (let i = 0; i <= steps; i += 1) {
        let span = element.arcCounterclockwise ? element.arcStartAngle - element.arcEndAngle : element.arcEndAngle - element.arcStartAngle;
        if (span < 0) span += TAU;
        const angle = element.arcCounterclockwise
          ? element.arcStartAngle - span * (i / steps)
          : element.arcStartAngle + span * (i / steps);
        includePoint({
          x: element.arcCenter.x + Math.cos(angle) * element.arcRadius,
          y: element.arcCenter.y + Math.sin(angle) * element.arcRadius,
        });
      }
      return;
    }

    if (element.type === 'ellipse' && element.ellipseCenter && element.ellipseRadiusX !== undefined && element.ellipseRadiusY !== undefined) {
      const steps = 96;
      const start = element.ellipseStartAngle ?? 0;
      const end = element.ellipseEndAngle ?? TAU;
      const rotation = element.ellipseRotation || 0;
      const cosR = Math.cos(rotation);
      const sinR = Math.sin(rotation);
      for (let i = 0; i <= steps; i += 1) {
        let span = element.ellipseCounterclockwise ? start - end : end - start;
        if (span < 0) span += TAU;
        const angle = element.ellipseCounterclockwise ? start - span * (i / steps) : start + span * (i / steps);
        const x = Math.cos(angle) * element.ellipseRadiusX;
        const y = Math.sin(angle) * element.ellipseRadiusY;
        includePoint({
          x: element.ellipseCenter.x + x * cosR - y * sinR,
          y: element.ellipseCenter.y + x * sinR + y * cosR,
        });
      }
      return;
    }

    [element.p1, element.p2, element.p3, element.p4, element.pos].forEach(point => {
      if (point) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
      }
    });
  });

  return Number.isFinite(minX) ? { minX, minY, maxX, maxY } : { minX: -10, minY: -10, maxX: 10, maxY: 10 };
};

const inferUnitScale = (pairs: DxfPair[], selectedUnit: DxfImportUnit = 'auto'): { scale: number; source: string } => {
  if (selectedUnit !== 'auto') {
    const found = IMPORT_UNITS_TO_METERS[selectedUnit];
    return { scale: found.scale, source: `user selected ${found.label}` };
  }

  for (let i = 0; i < pairs.length - 1; i += 1) {
    if (pairs[i].code === 9 && pairs[i].value === '$INSUNITS') {
      const unit = parseIntValue(pairs[i + 1].value);
      if (unit !== undefined && INSUNITS_TO_METERS[unit]) {
        const found = INSUNITS_TO_METERS[unit];
        return { scale: found.scale, source: `$INSUNITS ${found.label}` };
      }
    }
  }

  return { scale: 1, source: 'default meters (unitless DXF)' };
};

const collectLayers = (pairs: DxfPair[]): Layer[] => {
  const layers = new Map<string, Layer>();
  layers.set('0', { name: '0', visible: true, locked: false });

  for (let i = 0; i < pairs.length; i += 1) {
    if (pairs[i].code !== 0 || pairs[i].value !== 'LAYER') continue;
    let name = '0';
    let color: string | undefined;
    for (let j = i + 1; j < pairs.length && pairs[j].code !== 0; j += 1) {
      if (pairs[j].code === 2) name = cleanLayerName(pairs[j].value);
      if (pairs[j].code === 62) {
        const aci = Math.abs(parseIntValue(pairs[j].value) || 0);
        color = ACI_COLORS[aci];
      }
    }
    layers.set(name.toUpperCase(), { name, visible: true, locked: false, color });
  }

  return [...layers.values()];
};

const readEntity = (pairs: DxfPair[], start: number) => {
  const type = pairs[start].value;
  const entity: DxfPair[] = [];
  let end = start + 1;
  for (; end < pairs.length; end += 1) {
    if (pairs[end].code === 0) break;
    entity.push(pairs[end]);
  }
  return { type, entity, end };
};

const valuesByCode = (entity: DxfPair[], code: number): string[] => entity.filter(pair => pair.code === code).map(pair => pair.value);

const firstValue = (entity: DxfPair[], code: number): string | undefined => valuesByCode(entity, code)[0];

const isPaperSpaceEntity = (entity: DxfPair[]): boolean => parseIntValue(firstValue(entity, 67)) === 1;

const TAU = Math.PI * 2;

const normalizeRadians = (angle: number): number => {
  const value = angle % TAU;
  return value < 0 ? value + TAU : value;
};

const cadAngleToCanvasAngle = (angle: number): number => normalizeRadians(-angle);

const createArcElement = (
  center: Point,
  radius: number,
  startAngle: number,
  endAngle: number,
  layer: string,
  levelId: string,
  counterclockwise: boolean
): ArchElement => {
  const p1 = { x: center.x + Math.cos(startAngle) * radius, y: center.y + Math.sin(startAngle) * radius };
  const p2 = { x: center.x + Math.cos(endAngle) * radius, y: center.y + Math.sin(endAngle) * radius };
  const span = counterclockwise
    ? (startAngle - endAngle + TAU) % TAU
    : (endAngle - startAngle + TAU) % TAU;
  const mid = counterclockwise
    ? startAngle - span / 2
    : startAngle + span / 2;
  const midPoint = { x: center.x + Math.cos(mid) * radius, y: center.y + Math.sin(mid) * radius };
  const controlPoint = { x: 2 * midPoint.x - (p1.x + p2.x) / 2, y: 2 * midPoint.y - (p1.y + p2.y) / 2 };

  return {
    id: crypto.randomUUID(),
    type: 'arc',
    p1,
    p2,
    controlPoint,
    arcCenter: center,
    arcRadius: radius,
    arcStartAngle: normalizeRadians(startAngle),
    arcEndAngle: normalizeRadians(endAngle),
    arcCounterclockwise: counterclockwise,
    isCurved: true,
    layer,
    levelId,
  };
};

const createBulgeArc = (start: Point, end: Point, bulge: number, layer: string, levelId: string): ArchElement | null => {
  const chord = Math.hypot(end.x - start.x, end.y - start.y);
  if (chord < 1e-9 || Math.abs(bulge) < 1e-9) return null;

  const theta = 4 * Math.atan(Math.abs(bulge));
  const radius = chord / (2 * Math.sin(theta / 2));
  const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const ux = (end.x - start.x) / chord;
  const uy = (end.y - start.y) / chord;
  const sagitta = Math.abs(bulge) * chord / 2;
  const centerOffset = radius - sagitta;
  const side = bulge > 0 ? -1 : 1;
  const center = { x: mid.x + (-uy) * centerOffset * side, y: mid.y + ux * centerOffset * side };
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x);

  return createArcElement(center, radius, startAngle, endAngle, layer, levelId, bulge > 0);
};

const basisFunction = (i: number, degree: number, t: number, knots: number[]): number => {
  if (degree === 0) {
    const isLastKnot = t === knots[knots.length - 1] && t >= knots[i] && t <= knots[i + 1];
    return (t >= knots[i] && t < knots[i + 1]) || isLastKnot ? 1 : 0;
  }

  const leftDen = knots[i + degree] - knots[i];
  const rightDen = knots[i + degree + 1] - knots[i + 1];
  const left = leftDen ? ((t - knots[i]) / leftDen) * basisFunction(i, degree - 1, t, knots) : 0;
  const right = rightDen ? ((knots[i + degree + 1] - t) / rightDen) * basisFunction(i + 1, degree - 1, t, knots) : 0;
  return left + right;
};

const sampleSpline = (controlPoints: Point[], knots: number[], degree: number, sampleCount = 64): Point[] => {
  if (controlPoints.length < 2) return controlPoints;
  if (knots.length < controlPoints.length + degree + 1) return controlPoints;

  const start = knots[degree];
  const end = knots[knots.length - degree - 1];
  if (end <= start) return controlPoints;

  const points: Point[] = [];
  for (let sample = 0; sample <= sampleCount; sample += 1) {
    const t = sample === sampleCount ? end : start + (end - start) * (sample / sampleCount);
    let x = 0;
    let y = 0;
    let weight = 0;
    for (let i = 0; i < controlPoints.length; i += 1) {
      const b = basisFunction(i, degree, t, knots);
      x += controlPoints[i].x * b;
      y += controlPoints[i].y * b;
      weight += b;
    }
    if (weight > 1e-9) points.push({ x: x / weight, y: y / weight });
  }
  return points;
};

const extractLwPolylineVertices = (entity: DxfPair[]): Array<{ x: number; y: number; bulge: number }> => {
  const vertices: Array<{ x?: number; y?: number; bulge: number }> = [];
  let current: { x?: number; y?: number; bulge: number } | null = null;

  entity.forEach((pair) => {
    if (pair.code === 10) {
      if (current && current.x !== undefined && current.y !== undefined) vertices.push(current);
      current = { x: parseNumber(pair.value), bulge: 0 };
    } else if (pair.code === 20 && current) {
      current.y = parseNumber(pair.value);
    } else if (pair.code === 42 && current) {
      current.bulge = parseNumber(pair.value) || 0;
    }
  });

  if (current && current.x !== undefined && current.y !== undefined) vertices.push(current);
  return vertices as Array<{ x: number; y: number; bulge: number }>;
};

const normalizeAngle = (angle: number): number => {
  let value = angle % Math.PI;
  if (value < 0) value += Math.PI;
  return value;
};

const angleDiff = (a: number, b: number): number => {
  const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(diff, Math.PI - diff);
};

const segmentLength = (line: RawLine): number => Math.hypot(line.p2.x - line.p1.x, line.p2.y - line.p1.y);

const lineAngle = (line: RawLine): number => Math.atan2(line.p2.y - line.p1.y, line.p2.x - line.p1.x);

const pointLineDistance = (point: { x: number; y: number }, line: RawLine): number => {
  const dx = line.p2.x - line.p1.x;
  const dy = line.p2.y - line.p1.y;
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs((point.x - line.p1.x) * dy - (point.y - line.p1.y) * dx) / len;
};

const projectionRange = (line: RawLine, angle: number): [number, number] => {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const a = line.p1.x * ux + line.p1.y * uy;
  const b = line.p2.x * ux + line.p2.y * uy;
  return [Math.min(a, b), Math.max(a, b)];
};

const overlapRatio = (a: [number, number], b: [number, number]): number => {
  const overlap = Math.max(0, Math.min(a[1], b[1]) - Math.max(a[0], b[0]));
  const shortest = Math.max(0.0001, Math.min(a[1] - a[0], b[1] - b[0]));
  return overlap / shortest;
};

export const pairLinesToWalls = (lines: RawLine[]): { walls: ArchElement[]; consumed: Set<number> } => {
  const walls: ArchElement[] = [];
  const consumed = new Set<number>();
  const minWallLength = 0.45;
  const minThickness = 0.05;
  const maxThickness = 0.45;
  const maxAngleDiff = 2 * Math.PI / 180;

  const maxWallPairCandidates = 1800;
  const candidates = lines
    .map((line, index) => ({ line, index, length: segmentLength(line), angle: lineAngle(line) }))
    .filter(item => item.length >= minWallLength)
    .sort((a, b) => b.length - a.length)
    .slice(0, maxWallPairCandidates);

  for (let i = 0; i < candidates.length; i += 1) {
    if (consumed.has(candidates[i].index)) continue;
    let best: { j: number; distance: number; overlap: number } | null = null;

    for (let j = i + 1; j < candidates.length; j += 1) {
      if (consumed.has(candidates[j].index)) continue;
      if (candidates[i].line.layer !== candidates[j].line.layer) continue;
      if (angleDiff(candidates[i].angle, candidates[j].angle) > maxAngleDiff) continue;

      const distance = (pointLineDistance(candidates[j].line.p1, candidates[i].line) + pointLineDistance(candidates[j].line.p2, candidates[i].line)) / 2;
      if (distance < minThickness || distance > maxThickness) continue;

      const rangeA = projectionRange(candidates[i].line, candidates[i].angle);
      const rangeB = projectionRange(candidates[j].line, candidates[i].angle);
      const overlap = overlapRatio(rangeA, rangeB);
      if (overlap < 0.72) continue;
      if (!best || overlap > best.overlap) best = { j, distance, overlap };
    }

    if (!best) continue;
    const a = candidates[i].line;
    const b = candidates[best.j].line;
    
    // Check if the lines are oriented in opposite directions and align them
    const distSame = Math.hypot(a.p1.x - b.p1.x, a.p1.y - b.p1.y);
    const distOpp  = Math.hypot(a.p1.x - b.p2.x, a.p1.y - b.p2.y);
    let p1, p2;
    if (distSame <= distOpp) {
      p1 = { x: (a.p1.x + b.p1.x) / 2, y: (a.p1.y + b.p1.y) / 2 };
      p2 = { x: (a.p2.x + b.p2.x) / 2, y: (a.p2.y + b.p2.y) / 2 };
    } else {
      p1 = { x: (a.p1.x + b.p2.x) / 2, y: (a.p1.y + b.p2.y) / 2 };
      p2 = { x: (a.p2.x + b.p1.x) / 2, y: (a.p2.y + b.p1.y) / 2 };
    }

    walls.push({
      id: crypto.randomUUID(),
      type: 'wall',
      p1,
      p2,
      thickness: Number(best.distance.toFixed(4)),
      elevation: 0,
      height: WALL_HEIGHT_DEFAULT,
      layer: a.layer,
      wallSource: 'line',
      subType: best.distance >= 0.18 ? 'exterior' : 'interior',
    });
    consumed.add(candidates[i].index);
    consumed.add(candidates[best.j].index);
  }

  return { walls, consumed };
};

const DXF_SCALE_DETECTION_UNITS: Exclude<DxfImportUnit, 'auto'>[] = [
  'meters',
  'feet',
  'inches',
  'centimeters',
  'millimeters',
];

const collectRawLinesForScale = (pairs: DxfPair[], scale: number): RawLine[] => {
  const rawLines: RawLine[] = [];

  for (let i = 0; i < pairs.length; i += 1) {
    if (pairs[i].code !== 0) continue;
    const { type, entity, end } = readEntity(pairs, i);
    const layer = cleanLayerName(firstValue(entity, 8));

    if (type === 'LINE') {
      const x1 = parseNumber(firstValue(entity, 10));
      const y1 = parseNumber(firstValue(entity, 20));
      const x2 = parseNumber(firstValue(entity, 11));
      const y2 = parseNumber(firstValue(entity, 21));
      if ([x1, y1, x2, y2].every(value => value !== undefined)) {
        rawLines.push({ p1: toPoint(x1!, y1!, scale), p2: toPoint(x2!, y2!, scale), layer });
      }
    } else if (type === 'LWPOLYLINE') {
      const xs = valuesByCode(entity, 10).map(value => parseNumber(value)).filter((value): value is number => value !== undefined);
      const ys = valuesByCode(entity, 20).map(value => parseNumber(value)).filter((value): value is number => value !== undefined);
      const closed = !!((parseIntValue(firstValue(entity, 70)) || 0) & 1);
      const count = Math.min(xs.length, ys.length);
      for (let pointIndex = 0; pointIndex < count - 1; pointIndex += 1) {
        rawLines.push({ p1: toPoint(xs[pointIndex], ys[pointIndex], scale), p2: toPoint(xs[pointIndex + 1], ys[pointIndex + 1], scale), layer });
      }
      if (closed && count > 2) rawLines.push({ p1: toPoint(xs[count - 1], ys[count - 1], scale), p2: toPoint(xs[0], ys[0], scale), layer });
    }

    i = end - 1;
  }

  return rawLines;
};

const scoreDxfDrawingUnit = (
  geometryPairs: DxfPair[],
  unit: Exclude<DxfImportUnit, 'auto'>,
  insertionUnit: Exclude<DxfImportUnit, 'auto'>,
): number => {
  const unitInfo = IMPORT_UNITS_TO_METERS[unit];
  if (!unitInfo) return Number.NEGATIVE_INFINITY;

  const rawLines = collectRawLinesForScale(geometryPairs, unitInfo.scale);
  if (rawLines.length === 0) return Number.NEGATIVE_INFINITY;

  const { walls, consumed } = pairLinesToWalls(rawLines);
  const bounds = getBounds(rawLines);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const longestSide = Math.max(width, height);
  const shortestSide = Math.min(width, height);
  const consumedRatio = consumed.size / rawLines.length;
  const avgThickness = walls.length
    ? walls.reduce((sum, wall) => sum + (wall.thickness || 0), 0) / walls.length
    : 0;

  let score = walls.length * 50;
  score += consumedRatio * 100;

  if (longestSide >= 6 && longestSide <= 80) score += 120;
  else if (longestSide >= 3 && longestSide <= 150) score += 50;
  else score -= Math.min(180, Math.abs(longestSide - 40));

  if (shortestSide >= 2 && shortestSide <= 60) score += 40;
  else if (shortestSide < 1) score -= 80;

  if (avgThickness >= 0.08 && avgThickness <= 0.35) score += 80;
  else if (avgThickness >= 0.05 && avgThickness <= 0.45) score += 35;

  if (unit === insertionUnit) score += 15;
  if (unit === 'meters') score += 8;

  return score;
};

const detectDrawingUnitFromGeometry = (
  pairs: DxfPair[],
  insertionUnit: Exclude<DxfImportUnit, 'auto'>,
): Exclude<DxfImportUnit, 'auto'> => {
  const entityPairs = extractSectionPairs(pairs, 'ENTITIES');
  const geometryPairs = entityPairs.length ? entityPairs : pairs;
  const candidates = new Set<Exclude<DxfImportUnit, 'auto'>>([
    insertionUnit,
    ...DXF_SCALE_DETECTION_UNITS,
  ]);

  let bestUnit: Exclude<DxfImportUnit, 'auto'> = 'meters';
  let bestScore = Number.NEGATIVE_INFINITY;

  candidates.forEach(unit => {
    const score = scoreDxfDrawingUnit(geometryPairs, unit, insertionUnit);
    if (score > bestScore) {
      bestScore = score;
      bestUnit = unit;
    }
  });

  return bestUnit;
};

export const detectDxfUnitSettings = (contents: string): DxfUnitSettings => {
  const pairs = parsePairs(contents);
  const lengthType = LENGTH_TYPE_BY_LUNITS[headerIntValue(pairs, '$LUNITS') ?? 2] || 'Decimal';
  const angleType = ANGLE_TYPE_BY_AUNITS[headerIntValue(pairs, '$AUNITS') ?? 0] || 'Decimal Degrees';
  const insunits = headerIntValue(pairs, '$INSUNITS');
  const lightingValue = headerIntValue(pairs, '$LIGHTINGUNITS');
  const insertionUnit = insunits !== undefined && INSUNITS_TO_IMPORT_UNIT[insunits] ? INSUNITS_TO_IMPORT_UNIT[insunits] : 'meters';

  return {
    lengthType,
    lengthPrecision: precisionAt(LENGTH_PRECISION_BY_TYPE[lengthType], headerIntValue(pairs, '$LUPREC')),
    drawingUnit: detectDrawingUnitFromGeometry(pairs, insertionUnit),
    insertionUnit,
    lighting: lightingValue === 1 ? 'American' : 'International',
    angleType,
    anglePrecision: precisionAt(ANGLE_PRECISION_BY_TYPE[angleType], headerIntValue(pairs, '$AUPREC')),
  };
};

interface DxfEntity {
  type: string;
  entity: DxfPair[];
}

const parseBlocks = (pairs: DxfPair[]): Map<string, DxfEntity[]> => {
  const blocks = new Map<string, DxfEntity[]>();
  const blockSection = extractSectionPairs(pairs, 'BLOCKS');
  
  let currentBlockName: string | null = null;
  let currentBlockEntities: DxfEntity[] = [];

  for (let i = 0; i < blockSection.length; i += 1) {
    if (blockSection[i].code !== 0) continue;
    const { type, entity, end } = readEntity(blockSection, i);
    
    if (type === 'BLOCK') {
      currentBlockName = firstValue(entity, 2) || null;
      currentBlockEntities = [];
    } else if (type === 'ENDBLK') {
      if (currentBlockName) {
        blocks.set(currentBlockName, currentBlockEntities);
      }
      currentBlockName = null;
    } else {
      if (currentBlockName) {
        currentBlockEntities.push({ type, entity });
      }
    }
    
    i = end - 1;
  }
  return blocks;
};

const addEntityElements = (
  pairs: DxfPair[],
  scale: number,
  levelId: string,
  blocks?: Map<string, DxfEntity[]>
) => {
  const elements: ArchElement[] = [];
  const rawLines: RawLine[] = [];
  let importedTextCount = 0;
  const maxImportedText = 250;

  const processEntities = (
    entityList: DxfEntity[],
    parentPos: Point = { x: 0, y: 0 },
    sX: number = 1.0,
    sY: number = 1.0,
    rotDeg: number = 0.0,
    depth: number = 0
  ) => {
    if (depth > 8) return;

    const rotRad = (rotDeg * Math.PI) / 180;

    for (let idx = 0; idx < entityList.length; idx += 1) {
      const { type, entity } = entityList[idx];
      if (isPaperSpaceEntity(entity) || type === 'VIEWPORT') continue;
      const layer = cleanLayerName(firstValue(entity, 8));

      const getTransformedPoint = (lx: number, ly: number): Point => {
        const sx = lx * sX;
        const sy = ly * sY;
        const rx = sx * Math.cos(rotRad) - sy * Math.sin(rotRad);
        const ry = sx * Math.sin(rotRad) + sy * Math.cos(rotRad);
        return { x: parentPos.x + rx, y: parentPos.y + ry };
      };

      if (type === 'LINE') {
        const x1 = parseNumber(firstValue(entity, 10));
        const y1 = parseNumber(firstValue(entity, 20));
        const x2 = parseNumber(firstValue(entity, 11));
        const y2 = parseNumber(firstValue(entity, 21));
        if ([x1, y1, x2, y2].every(val => val !== undefined)) {
          const pt1 = getTransformedPoint(x1!, y1!);
          const pt2 = getTransformedPoint(x2!, y2!);
          rawLines.push({ p1: toPoint(pt1.x, pt1.y, scale), p2: toPoint(pt2.x, pt2.y, scale), layer });
        }
      } else if (type === 'LWPOLYLINE') {
        const vertices = extractLwPolylineVertices(entity);
        const closed = !!((parseIntValue(firstValue(entity, 70)) || 0) & 1);
        const count = vertices.length;

        const pts: Point[] = [];
        for (let ptIdx = 0; ptIdx < count; ptIdx++) {
          pts.push(getTransformedPoint(vertices[ptIdx].x, vertices[ptIdx].y));
        }

        for (let ptIdx = 0; ptIdx < count - 1; ptIdx += 1) {
          const p1 = toPoint(pts[ptIdx].x, pts[ptIdx].y, scale);
          const p2 = toPoint(pts[ptIdx + 1].x, pts[ptIdx + 1].y, scale);
          const arc = createBulgeArc(p1, p2, vertices[ptIdx].bulge, layer, levelId);
          if (arc) elements.push(arc);
          else rawLines.push({ p1, p2, layer });
        }
        if (closed && count > 2) {
          const p1 = toPoint(pts[count - 1].x, pts[count - 1].y, scale);
          const p2 = toPoint(pts[0].x, pts[0].y, scale);
          const arc = createBulgeArc(p1, p2, vertices[count - 1].bulge, layer, levelId);
          if (arc) elements.push(arc);
          else rawLines.push({ p1, p2, layer });
        }
      } else if (type === 'POLYLINE') {
        const vertices: Array<{ x: number; y: number; bulge: number }> = [];
        const closed = !!((parseIntValue(firstValue(entity, 70)) || 0) & 1);

        while (idx + 1 < entityList.length) {
          const nextEntity = entityList[idx + 1];
          if (nextEntity.type === 'SEQEND') {
            idx += 1;
            break;
          }
          if (nextEntity.type === 'VERTEX') {
            const vx = parseNumber(firstValue(nextEntity.entity, 10));
            const vy = parseNumber(firstValue(nextEntity.entity, 20));
            if (vx !== undefined && vy !== undefined) {
              vertices.push({ x: vx, y: vy, bulge: parseNumber(firstValue(nextEntity.entity, 42)) || 0 });
            }
          }
          idx += 1;
        }

        const count = vertices.length;
        const pts: Point[] = [];
        for (let ptIdx = 0; ptIdx < count; ptIdx++) {
          pts.push(getTransformedPoint(vertices[ptIdx].x, vertices[ptIdx].y));
        }

        for (let ptIdx = 0; ptIdx < count - 1; ptIdx += 1) {
          const p1 = toPoint(pts[ptIdx].x, pts[ptIdx].y, scale);
          const p2 = toPoint(pts[ptIdx + 1].x, pts[ptIdx + 1].y, scale);
          const arc = createBulgeArc(p1, p2, vertices[ptIdx].bulge, layer, levelId);
          if (arc) elements.push(arc);
          else rawLines.push({ p1, p2, layer });
        }
        if (closed && count > 2) {
          const p1 = toPoint(pts[count - 1].x, pts[count - 1].y, scale);
          const p2 = toPoint(pts[0].x, pts[0].y, scale);
          const arc = createBulgeArc(p1, p2, vertices[count - 1].bulge, layer, levelId);
          if (arc) elements.push(arc);
          else rawLines.push({ p1, p2, layer });
        }
      } else if (type === 'CIRCLE') {
        const cx = parseNumber(firstValue(entity, 10)) || 0;
        const cy = parseNumber(firstValue(entity, 20)) || 0;
        const r = parseNumber(firstValue(entity, 40)) || 0;
        const center = getTransformedPoint(cx, cy);
        const radiusScaled = r * ((Math.abs(sX) + Math.abs(sY)) / 2);

        elements.push({
          id: crypto.randomUUID(),
          type: 'circle',
          p1: toPoint(center.x, center.y, scale),
          p2: toPoint(center.x + radiusScaled, center.y, scale),
          layer,
          levelId,
        });
      } else if (type === 'ARC') {
        const cx = parseNumber(firstValue(entity, 10)) || 0;
        const cy = parseNumber(firstValue(entity, 20)) || 0;
        const r = parseNumber(firstValue(entity, 40)) || 0;
        const startAngle = (parseNumber(firstValue(entity, 50)) || 0) * Math.PI / 180;
        const endAngle = (parseNumber(firstValue(entity, 51)) || 0) * Math.PI / 180;

        const center = getTransformedPoint(cx, cy);
        const radiusScaled = r * ((Math.abs(sX) + Math.abs(sY)) / 2);
        const centerPoint = toPoint(center.x, center.y, scale);
        elements.push(createArcElement(
          centerPoint,
          radiusScaled * scale,
          cadAngleToCanvasAngle(startAngle + rotRad),
          cadAngleToCanvasAngle(endAngle + rotRad),
          layer,
          levelId,
          true
        ));
      } else if (type === 'ELLIPSE') {
        const cx = parseNumber(firstValue(entity, 10)) || 0;
        const cy = parseNumber(firstValue(entity, 20)) || 0;
        const mx = parseNumber(firstValue(entity, 11)) || 0;
        const my = parseNumber(firstValue(entity, 21)) || 0;
        const ratio = parseNumber(firstValue(entity, 40)) || 1;
        const startParam = parseNumber(firstValue(entity, 41)) ?? 0;
        const endParam = parseNumber(firstValue(entity, 42)) ?? TAU;
        const center = getTransformedPoint(cx, cy);
        const majorEnd = getTransformedPoint(cx + mx, cy + my);
        const centerPoint = toPoint(center.x, center.y, scale);
        const majorVector = { x: (majorEnd.x - center.x) * scale, y: -(majorEnd.y - center.y) * scale };
        const radiusX = Math.hypot(majorVector.x, majorVector.y);
        const radiusY = radiusX * ratio * ((Math.abs(sX) + Math.abs(sY)) / 2);
        const rotation = Math.atan2(majorVector.y, majorVector.x);

        elements.push({
          id: crypto.randomUUID(),
          type: 'ellipse',
          p1: { x: centerPoint.x - radiusX, y: centerPoint.y - radiusY },
          p2: { x: centerPoint.x + radiusX, y: centerPoint.y + radiusY },
          ellipseCenter: centerPoint,
          ellipseRadiusX: radiusX,
          ellipseRadiusY: radiusY,
          ellipseRotation: rotation,
          ellipseStartAngle: normalizeRadians(-startParam),
          ellipseEndAngle: normalizeRadians(-endParam),
          ellipseCounterclockwise: true,
          isCurved: true,
          layer,
          levelId,
        });
      } else if (type === 'SPLINE') {
        const xs = valuesByCode(entity, 10).map(v => parseNumber(v)).filter((v): v is number => v !== undefined);
        const ys = valuesByCode(entity, 20).map(v => parseNumber(v)).filter((v): v is number => v !== undefined);
        const knots = valuesByCode(entity, 40).map(v => parseNumber(v)).filter((v): v is number => v !== undefined);
        const degree = parseIntValue(firstValue(entity, 71)) || 3;
        const controlPoints = xs.slice(0, Math.min(xs.length, ys.length)).map((x, pointIndex) => {
          const pt = getTransformedPoint(x, ys[pointIndex]);
          return toPoint(pt.x, pt.y, scale);
        });
        const sampled = sampleSpline(controlPoints, knots, degree, Math.max(32, controlPoints.length * 12));
        for (let sampleIndex = 0; sampleIndex < sampled.length - 1; sampleIndex += 1) {
          rawLines.push({ p1: sampled[sampleIndex], p2: sampled[sampleIndex + 1], layer });
        }
      } else if (type === 'TEXT' || type === 'MTEXT') {
        const lx = parseNumber(firstValue(entity, 10));
        const ly = parseNumber(firstValue(entity, 20));
        const text = (firstValue(entity, 1) || '').replace(/\\P/g, '\n').trim();
        const height = parseNumber(firstValue(entity, 40));
        const rotation = parseNumber(firstValue(entity, 50)) || 0;

        if (lx !== undefined && ly !== undefined && importedTextCount < maxImportedText) {
          const pt = getTransformedPoint(lx, ly);
          const cadHeightMeters = height !== undefined ? height * scale * ((Math.abs(sX) + Math.abs(sY)) / 2) : undefined;

          if (shouldImportText(text, cadHeightMeters)) {
            elements.push({
              id: crypto.randomUUID(),
              type: 'label',
              pos: toPoint(pt.x, pt.y, scale),
              label: text,
              textFontSize: cadHeightMeters ? clamp(cadHeightMeters * 15, 1.5, 50) : 3,
              textFontFamily: 'Arial',
              rotation: -(rotation + rotDeg),
              layer,
              levelId,
            });
            importedTextCount += 1;
          }
        }
      } else if (type === 'INSERT' && blocks) {
        const blockName = firstValue(entity, 2);
        const ix = parseNumber(firstValue(entity, 10)) || 0;
        const iy = parseNumber(firstValue(entity, 20)) || 0;
        const insScaleX = parseNumber(firstValue(entity, 41)) ?? 1.0;
        const insScaleY = parseNumber(firstValue(entity, 42)) ?? 1.0;
        const insRot = parseNumber(firstValue(entity, 50)) || 0;

        if (blockName) {
          const blockEntities = blocks.get(blockName);
          if (blockEntities) {
            const transformedInsertPos = getTransformedPoint(ix, iy);
            processEntities(
              blockEntities,
              transformedInsertPos,
              sX * insScaleX,
              sY * insScaleY,
              rotDeg + insRot,
              depth + 1
            );
          }
        }
      }
    }
  };

  const rootEntities: DxfEntity[] = [];
  for (let i = 0; i < pairs.length; i += 1) {
    if (pairs[i].code !== 0) continue;
    const { type, entity, end } = readEntity(pairs, i);
    if (isPaperSpaceEntity(entity) || type === 'VIEWPORT') {
      i = end - 1;
      continue;
    }
    rootEntities.push({ type, entity });
    
    if (type === 'POLYLINE') {
      let nextIndex = end;
      while (nextIndex < pairs.length) {
        const nextEntity = readEntity(pairs, nextIndex);
        rootEntities.push({ type: nextEntity.type, entity: nextEntity.entity });
        if (nextEntity.type === 'SEQEND') {
          i = nextEntity.end - 1;
          break;
        }
        nextIndex = nextEntity.end;
      }
    } else {
      i = end - 1;
    }
  }

  processEntities(rootEntities);

  rawLines.forEach((line) => {
    elements.push({ id: crypto.randomUUID(), type: 'line', p1: line.p1, p2: line.p2, layer: line.layer, levelId });
  });

  return { elements, rawLines, walls: [] };
};

export const importDxfToProject = (contents: string, fileName = 'Imported DXF', options: DxfImportOptions = {}): DxfImportResult => {
  const pairs = parsePairs(contents);
  const blocks = parseBlocks(pairs);
  const entityPairs = extractSectionPairs(pairs, 'ENTITIES');
  const geometryPairs = entityPairs.length ? entityPairs : pairs;
  const unit = inferUnitScale(pairs, options.unit);
  const layers = collectLayers(pairs);
  const levelId = crypto.randomUUID();
  const { elements, rawLines, walls } = addEntityElements(geometryPairs, unit.scale, levelId, blocks);
  const bounds = getBounds(rawLines, elements);
  const width = Math.max(20, bounds.maxX - bounds.minX || 20);
  const height = Math.max(20, bounds.maxY - bounds.minY || 20);

  return {
    project: {
      name: fileName.replace(/\.dxf$/i, '') || 'Imported DXF',
      mode: 'floorplan',
      levels: [{ id: levelId, name: 'Level 1', zElevation: 0, height: WALL_HEIGHT_DEFAULT, order: 0 }],
      elements,
      layers,
      viewBox: { width, height },
      settings3D: {
        ...DEFAULT_PROJECT_SETTINGS_3D,
        defaultLevelHeight: WALL_HEIGHT_DEFAULT,
      },
    },
    stats: {
      lines: rawLines.length,
      walls: walls.length,
      arcs: elements.filter(element => element.type === 'arc').length,
      circles: elements.filter(element => element.type === 'circle').length,
      text: elements.filter(element => element.type === 'label').length,
      layers: layers.length,
      unitScale: unit.scale,
      unitSource: unit.source,
    },
  };
};
