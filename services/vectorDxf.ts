type Matrix = [number, number, number, number, number, number];

interface Point {
  x: number;
  y: number;
}

interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface DxfGradient {
  kind: 'linear';
  stops: Array<{ offset: number; color: Color }>;
  addColorStop: (offset: number, color: string) => void;
}

interface CanvasState {
  transform: Matrix;
  fillStyle: string | DxfGradient;
  strokeStyle: string | DxfGradient;
  globalAlpha: number;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  miterLimit: number;
  lineDash: number[];
  lineDashOffset: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  shadowBlur: number;
  shadowColor: string;
  shadowOffsetX: number;
  shadowOffsetY: number;
}

interface Subpath {
  points: Point[];
  closed: boolean;
  nativeEllipse?: NativeEllipsePath;
}

interface NativeEllipsePath {
  center: Point;
  axisX: Point;
  axisY: Point;
  full: boolean;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface DxfLayerDefinition {
  name: string;
  color?: string;
}

export type DxfExportUnitSystem = 'metric' | 'imperial';

interface DxfExportUnitSettings {
  insunits: 1 | 6;
  measurement: 0 | 1;
  lunits: 2 | 4;
}

interface DxfElementCapture {
  id: string;
  groupId?: string;
  groupBaseX?: number;
  groupBaseY?: number;
  name: string;
  familyKey: string;
  createBlock: boolean;
  baseX: number;
  baseY: number;
  rotation: number;
}

interface DxfBlockRecord {
  key: string;
  name: string;
  ownerElementId: string;
  entities: string[];
}

interface DxfBlockInstance {
  elementId: string;
  layer: string;
  base: Point;
  rotation: number;
}

interface DxfActiveBlock {
  definition: DxfBlockRecord;
  instance: DxfBlockInstance;
  captureGeometry: boolean;
  isGroup: boolean;
}

interface DxfGroupRecord {
  id: string;
  dictionaryName: string;
  objectHandle?: string;
  handles: string[];
}

interface DxfEntityRecord {
  handle: string;
  entity: string;
  groupId?: string;
}

const TAU = Math.PI * 2;

const fmt = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.abs(value) < 0.0000001 ? 0 : value;
  return rounded.toFixed(6).replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, '').replace(/\.$/, '');
};

const multiply = (left: Matrix, right: Matrix): Matrix => [
  left[0] * right[0] + left[2] * right[1],
  left[1] * right[0] + left[3] * right[1],
  left[0] * right[2] + left[2] * right[3],
  left[1] * right[2] + left[3] * right[3],
  left[0] * right[4] + left[2] * right[5] + left[4],
  left[1] * right[4] + left[3] * right[5] + left[5],
];

const applyMatrix = (matrix: Matrix, x: number, y: number): Point => ({
  x: matrix[0] * x + matrix[2] * y + matrix[4],
  y: matrix[1] * x + matrix[3] * y + matrix[5],
});

const cloneState = (state: CanvasState): CanvasState => ({
  ...state,
  transform: [...state.transform] as Matrix,
  lineDash: [...state.lineDash],
});

const namedColors: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  transparent: 'rgba(0,0,0,0)',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
};

const parseColor = (input: string): Color => {
  const value = (namedColors[input.toLowerCase()] || input).trim().toLowerCase();
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      return {
        r: parseInt(hex[0] + hex[0], 16) / 255,
        g: parseInt(hex[1] + hex[1], 16) / 255,
        b: parseInt(hex[2] + hex[2], 16) / 255,
        a: hex.length === 4 ? parseInt(hex[3] + hex[3], 16) / 255 : 1,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16) / 255,
        g: parseInt(hex.slice(2, 4), 16) / 255,
        b: parseInt(hex.slice(4, 6), 16) / 255,
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
  }

  const rgb = value.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const parts = rgb[1].split(',').map(part => part.trim());
    const channel = (part: string) => part.endsWith('%') ? parseFloat(part) / 100 : parseFloat(part) / 255;
    return {
      r: channel(parts[0]),
      g: channel(parts[1]),
      b: channel(parts[2]),
      a: parts[3] === undefined ? 1 : parseFloat(parts[3]),
    };
  }

  return { r: 0, g: 0, b: 0, a: 1 };
};

const indexedColor = (color: Color): number => {
  const palette = [
    { index: 1, r: 1, g: 0, b: 0 },
    { index: 2, r: 1, g: 1, b: 0 },
    { index: 3, r: 0, g: 1, b: 0 },
    { index: 4, r: 0, g: 1, b: 1 },
    { index: 5, r: 0, g: 0, b: 1 },
    { index: 6, r: 1, g: 0, b: 1 },
    { index: 7, r: 1, g: 1, b: 1 },
    { index: 8, r: 0.5, g: 0.5, b: 0.5 },
    { index: 9, r: 0.75, g: 0.75, b: 0.75 },
  ];
  return palette.reduce((best, candidate) => {
    const distance = (candidate.r - color.r) ** 2 + (candidate.g - color.g) ** 2 + (candidate.b - color.b) ** 2;
    const bestDistance = (best.r - color.r) ** 2 + (best.g - color.g) ** 2 + (best.b - color.b) ** 2;
    return distance < bestDistance ? candidate : best;
  }, palette[0]).index;
};

const triangulate = (input: Point[]): Point[][] => {
  const points = input.filter((point, index) => {
    const previous = input[(index + input.length - 1) % input.length];
    return Math.hypot(point.x - previous.x, point.y - previous.y) > 0.000001;
  });
  if (points.length < 3) return [];

  const signedArea = points.reduce((total, point, index) => {
    const next = points[(index + 1) % points.length];
    return total + point.x * next.y - next.x * point.y;
  }, 0);
  const orientation = signedArea >= 0 ? 1 : -1;
  const indices = points.map((_, index) => index);
  const triangles: Point[][] = [];
  const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const inside = (point: Point, a: Point, b: Point, c: Point) => {
    const ab = cross(a, b, point) * orientation;
    const bc = cross(b, c, point) * orientation;
    const ca = cross(c, a, point) * orientation;
    return ab >= -0.000001 && bc >= -0.000001 && ca >= -0.000001;
  };

  let guard = points.length * points.length;
  while (indices.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let index = 0; index < indices.length; index += 1) {
      const previousIndex = indices[(index + indices.length - 1) % indices.length];
      const currentIndex = indices[index];
      const nextIndex = indices[(index + 1) % indices.length];
      const a = points[previousIndex];
      const b = points[currentIndex];
      const c = points[nextIndex];
      if (cross(a, b, c) * orientation <= 0.000001) continue;
      if (indices.some(candidate => candidate !== previousIndex && candidate !== currentIndex && candidate !== nextIndex && inside(points[candidate], a, b, c))) continue;
      triangles.push([a, b, c]);
      indices.splice(index, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (indices.length === 3) triangles.push(indices.map(index => points[index]));
  if (triangles.length === 0) {
    for (let index = 1; index < points.length - 1; index += 1) triangles.push([points[0], points[index], points[index + 1]]);
  }
  return triangles;
};

const escapeDxfText = (value: string): string => {
  let result = '';
  for (const char of value.replace(/[\r\n]+/g, ' ')) {
    const code = char.codePointAt(0) || 32;
    if (char === '\\') result += '\\\\';
    else if (code >= 32 && code <= 126) result += char;
    else result += `\\U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return result;
};

const pair = (code: number, value: string | number): string => `${code.toString().padStart(3, ' ')}\r\n${value}\r\n`;

const DXF_EXPORT_UNITS: Record<DxfExportUnitSystem, DxfExportUnitSettings> = {
  metric: { insunits: 6, measurement: 1, lunits: 2 },
  imperial: { insunits: 1, measurement: 0, lunits: 4 },
};

export class VectorDxfCanvasContext {
  readonly canvas: { width: number; height: number };
  private state: CanvasState;
  private stack: CanvasState[] = [];
  private path: Subpath[] = [];
  private currentSubpath: Subpath | null = null;
  private entities: DxfEntityRecord[] = [];
  private bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  private linetypes = new Map<string, { name: string; pattern: number[] }>();
  private layers = new Map<string, { name: string; color: number }>();
  private layerAliases = new Map<string, string>();
  private currentLayer = '0';
  private blocks = new Map<string, DxfBlockRecord>();
  private insertedBlockElements = new Set<string>();
  private pendingGroupInserts = new Map<string, DxfBlockInstance>();
  private activeBlock: DxfActiveBlock | null = null;
  private currentGroupId?: string;
  private groups = new Map<string, DxfGroupRecord>();
  private handleSeed = 0x100;
  private requiresModernDxf = false;

  globalCompositeOperation = 'source-over';
  imageSmoothingEnabled = true;
  imageSmoothingQuality: ImageSmoothingQuality = 'low';
  filter = 'none';
  private readonly exportUnits: DxfExportUnitSettings;

  constructor(initialTransform: Matrix, canvasWidth = 100000, canvasHeight = 100000, layerDefinitions: DxfLayerDefinition[] = [], unitSystem: DxfExportUnitSystem = 'metric') {
    this.canvas = { width: canvasWidth, height: canvasHeight };
    this.exportUnits = DXF_EXPORT_UNITS[unitSystem];
    this.state = {
      transform: initialTransform,
      fillStyle: '#000000',
      strokeStyle: '#000000',
      globalAlpha: 1,
      lineWidth: 1,
      lineCap: 'butt',
      lineJoin: 'miter',
      miterLimit: 10,
      lineDash: [],
      lineDashOffset: 0,
      font: '10px sans-serif',
      textAlign: 'start',
      textBaseline: 'alphabetic',
      shadowBlur: 0,
      shadowColor: 'rgba(0,0,0,0)',
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    };
    this.registerLayer('0');
    layerDefinitions.forEach(layer => this.registerLayer(layer.name, layer.color));
  }

  setDxfLayer(name?: string): void {
    const sourceName = name?.trim() || '0';
    this.currentLayer = this.layerAliases.get(sourceName.toLowerCase()) || this.registerLayer(sourceName);
  }

  setDxfElement(capture: DxfElementCapture): void {
    this.finishDxfElement();
    this.currentGroupId = capture.groupId;

    if (capture.groupId) {
      const groupKey = `GROUP:${capture.groupId}`;
      let definition = this.blocks.get(groupKey);
      if (!definition) {
        definition = {
          key: groupKey,
          name: this.createBlockName(`GROUP_${capture.groupId}`),
          ownerElementId: capture.groupId,
          entities: [],
        };
        this.blocks.set(groupKey, definition);
      }
      const base = applyMatrix(this.state.transform, capture.groupBaseX ?? capture.baseX, capture.groupBaseY ?? capture.baseY);
      const instance: DxfBlockInstance = {
        elementId: capture.groupId,
        layer: this.currentLayer,
        base,
        rotation: 0,
      };
      this.pendingGroupInserts.set(capture.groupId, instance);
      this.activeBlock = {
        definition,
        instance,
        captureGeometry: true,
        isGroup: true,
      };
      return;
    }

    if (!capture.createBlock) return;

    let definition = this.blocks.get(capture.familyKey);
    if (!definition) {
      definition = {
        key: capture.familyKey,
        name: this.createBlockName(capture.name),
        ownerElementId: capture.id,
        entities: [],
      };
      this.blocks.set(capture.familyKey, definition);
    }
    this.activeBlock = {
      definition,
      instance: {
        elementId: capture.id,
        layer: this.currentLayer,
        base: applyMatrix(this.state.transform, capture.baseX, capture.baseY),
        rotation: capture.rotation || 0,
      },
      captureGeometry: definition.ownerElementId === capture.id,
      isGroup: false,
    };
  }

  finishDxfElement(): void {
    const active = this.activeBlock;
    this.activeBlock = null;
    if (!active || active.definition.entities.length === 0 || this.insertedBlockElements.has(active.instance.elementId)) return;
    if (active.isGroup) return;
    this.pushModelEntity(this.insertEntity(active.definition, active.instance));
    this.insertedBlockElements.add(active.instance.elementId);
  }

  get fillStyle(): string | CanvasGradient | CanvasPattern { return this.state.fillStyle as unknown as string | CanvasGradient; }
  set fillStyle(value: string | CanvasGradient | CanvasPattern) { this.state.fillStyle = value as unknown as string | DxfGradient; }
  get strokeStyle(): string | CanvasGradient | CanvasPattern { return this.state.strokeStyle as unknown as string | CanvasGradient; }
  set strokeStyle(value: string | CanvasGradient | CanvasPattern) { this.state.strokeStyle = value as unknown as string | DxfGradient; }
  get globalAlpha(): number { return this.state.globalAlpha; }
  set globalAlpha(value: number) { this.state.globalAlpha = Math.max(0, Math.min(1, value)); }
  get lineWidth(): number { return this.state.lineWidth; }
  set lineWidth(value: number) { if (value > 0) this.state.lineWidth = value; }
  get lineCap(): CanvasLineCap { return this.state.lineCap; }
  set lineCap(value: CanvasLineCap) { this.state.lineCap = value; }
  get lineJoin(): CanvasLineJoin { return this.state.lineJoin; }
  set lineJoin(value: CanvasLineJoin) { this.state.lineJoin = value; }
  get miterLimit(): number { return this.state.miterLimit; }
  set miterLimit(value: number) { this.state.miterLimit = value; }
  get lineDashOffset(): number { return this.state.lineDashOffset; }
  set lineDashOffset(value: number) { this.state.lineDashOffset = value; }
  get font(): string { return this.state.font; }
  set font(value: string) { this.state.font = value; }
  get textAlign(): CanvasTextAlign { return this.state.textAlign; }
  set textAlign(value: CanvasTextAlign) { this.state.textAlign = value; }
  get textBaseline(): CanvasTextBaseline { return this.state.textBaseline; }
  set textBaseline(value: CanvasTextBaseline) { this.state.textBaseline = value; }
  get shadowBlur(): number { return this.state.shadowBlur; }
  set shadowBlur(value: number) { this.state.shadowBlur = value; }
  get shadowColor(): string { return this.state.shadowColor; }
  set shadowColor(value: string) { this.state.shadowColor = value; }
  get shadowOffsetX(): number { return this.state.shadowOffsetX; }
  set shadowOffsetX(value: number) { this.state.shadowOffsetX = value; }
  get shadowOffsetY(): number { return this.state.shadowOffsetY; }
  set shadowOffsetY(value: number) { this.state.shadowOffsetY = value; }

  save(): void { this.stack.push(cloneState(this.state)); }
  restore(): void { const previous = this.stack.pop(); if (previous) this.state = previous; }
  translate(x: number, y: number): void { this.state.transform = multiply(this.state.transform, [1, 0, 0, 1, x, y]); }
  rotate(angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.state.transform = multiply(this.state.transform, [cos, sin, -sin, cos, 0, 0]);
  }
  scale(x: number, y: number): void { this.state.transform = multiply(this.state.transform, [x, 0, 0, y, 0, 0]); }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.state.transform = multiply(this.state.transform, [a, b, c, d, e, f]);
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void { this.state.transform = [a, b, c, d, e, f]; }
  resetTransform(): void { this.state.transform = [1, 0, 0, 1, 0, 0]; }

  beginPath(): void { this.path = []; this.currentSubpath = null; }
  closePath(): void { if (this.currentSubpath) this.currentSubpath.closed = true; }

  moveTo(x: number, y: number): void {
    const subpath = { points: [applyMatrix(this.state.transform, x, y)], closed: false };
    this.path.push(subpath);
    this.currentSubpath = subpath;
  }

  lineTo(x: number, y: number): void {
    const point = applyMatrix(this.state.transform, x, y);
    if (!this.currentSubpath) this.moveTo(x, y);
    else this.currentSubpath.points.push(point);
  }

  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void {
    const cp1 = applyMatrix(this.state.transform, cp1x, cp1y);
    const cp2 = applyMatrix(this.state.transform, cp2x, cp2y);
    const end = applyMatrix(this.state.transform, x, y);
    if (!this.currentSubpath) {
      this.moveTo(cp1x, cp1y);
      return;
    }
    const start = this.currentSubpath.points[this.currentSubpath.points.length - 1];
    const controlLength = Math.hypot(cp1.x - start.x, cp1.y - start.y) + Math.hypot(cp2.x - cp1.x, cp2.y - cp1.y) + Math.hypot(end.x - cp2.x, end.y - cp2.y);
    const steps = Math.max(8, Math.min(64, Math.ceil(controlLength / 75)));
    for (let index = 1; index <= steps; index += 1) {
      const t = index / steps;
      const u = 1 - t;
      this.currentSubpath.points.push({
        x: u * u * u * start.x + 3 * u * u * t * cp1.x + 3 * u * t * t * cp2.x + t * t * t * end.x,
        y: u * u * u * start.y + 3 * u * u * t * cp1.y + 3 * u * t * t * cp2.y + t * t * t * end.y,
      });
    }
  }

  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    const control = applyMatrix(this.state.transform, cpx, cpy);
    const end = applyMatrix(this.state.transform, x, y);
    if (!this.currentSubpath) {
      this.moveTo(cpx, cpy);
      return;
    }
    const start = this.currentSubpath.points[this.currentSubpath.points.length - 1];
    const controlLength = Math.hypot(control.x - start.x, control.y - start.y) + Math.hypot(end.x - control.x, end.y - control.y);
    const steps = Math.max(8, Math.min(64, Math.ceil(controlLength / 75)));
    for (let index = 1; index <= steps; index += 1) {
      const t = index / steps;
      const u = 1 - t;
      this.currentSubpath.points.push({
        x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
        y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
      });
    }
  }

  rect(x: number, y: number, width: number, height: number): void {
    this.moveTo(x, y);
    this.lineTo(x + width, y);
    this.lineTo(x + width, y + height);
    this.lineTo(x, y + height);
    this.closePath();
  }

  roundRect(x: number, y: number, width: number, height: number, radii: number | DOMPointInit | Iterable<number | DOMPointInit> = 0): this {
    const radiusValue = typeof radii === 'number' ? radii : 0;
    const radius = Math.max(0, Math.min(radiusValue, Math.abs(width) / 2, Math.abs(height) / 2));
    this.moveTo(x + radius, y);
    this.lineTo(x + width - radius, y);
    this.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.lineTo(x + width, y + height - radius);
    this.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.lineTo(x + radius, y + height);
    this.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.lineTo(x, y + radius);
    this.quadraticCurveTo(x, y, x + radius, y);
    this.closePath();
    return this;
  }

  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, counterclockwise = false): void {
    this.addEllipseArc(x, y, radius, radius, 0, startAngle, endAngle, counterclockwise);
  }

  ellipse(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, counterclockwise = false): void {
    this.addEllipseArc(x, y, radiusX, radiusY, rotation, startAngle, endAngle, counterclockwise);
  }

  private addEllipseArc(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number, counterclockwise: boolean): void {
    let delta = endAngle - startAngle;
    if (!counterclockwise) {
      while (delta < 0) delta += TAU;
      if (delta > TAU) delta = TAU;
    } else {
      while (delta > 0) delta -= TAU;
      if (delta < -TAU) delta = -TAU;
    }
    if (Math.abs(delta) < 0.0000001 && Math.abs(endAngle - startAngle) >= TAU) delta = counterclockwise ? -TAU : TAU;
    const nativePath = this.nativeEllipsePath(x, y, radiusX, radiusY, rotation, Math.abs(Math.abs(delta) - TAU) < 0.000001);

    const steps = Math.max(8, Math.ceil(Math.abs(delta) / (Math.PI / 36)));
    for (let index = 0; index <= steps; index += 1) {
      const angle = startAngle + delta * index / steps;
      const cosRotation = Math.cos(rotation);
      const sinRotation = Math.sin(rotation);
      const localX = x + radiusX * Math.cos(angle) * cosRotation - radiusY * Math.sin(angle) * sinRotation;
      const localY = y + radiusX * Math.cos(angle) * sinRotation + radiusY * Math.sin(angle) * cosRotation;
      if (index === 0) {
        const start = applyMatrix(this.state.transform, localX, localY);
        const current = this.currentSubpath?.points[this.currentSubpath.points.length - 1];
        if (!current) {
          this.moveTo(localX, localY);
          if (this.currentSubpath) this.currentSubpath.nativeEllipse = nativePath;
        }
        else if (Math.hypot(current.x - start.x, current.y - start.y) > 0.0001) this.lineTo(localX, localY);
        else if (this.currentSubpath && this.currentSubpath.points.length === 1) this.currentSubpath.nativeEllipse = nativePath;
      } else this.lineTo(localX, localY);
    }
  }

  fill(): void {
    const color = this.paintColor(this.state.fillStyle);
    if (color.a * this.state.globalAlpha <= 0.001) return;
    this.path.filter(subpath => subpath.points.length >= 3).forEach(subpath => {
      this.pushEntity(this.hatchEntity(subpath.points, color));
      subpath.points.forEach(point => this.include(point));
    });
  }

  stroke(): void {
    const color = this.paintColor(this.state.strokeStyle);
    if (color.a * this.state.globalAlpha <= 0.001) return;
    const linetype = this.registerLinetype();
    this.path.filter(subpath => subpath.points.length >= 2).forEach(subpath => {
      this.pushEntity(this.nativeCurveEntity(subpath, color) || this.polylineEntity(subpath, color, linetype));
      subpath.points.forEach(point => this.include(point));
    });
  }

  clip(): void {
    // DXF is emitted in 1:1 model space, so paper-sheet clipping is intentionally not applied.
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    const previousPath = this.path;
    const previousSubpath = this.currentSubpath;
    this.beginPath();
    this.rect(x, y, width, height);
    this.fill();
    this.path = previousPath;
    this.currentSubpath = previousSubpath;
  }

  strokeRect(x: number, y: number, width: number, height: number): void {
    const previousPath = this.path;
    const previousSubpath = this.currentSubpath;
    this.beginPath();
    this.rect(x, y, width, height);
    this.stroke();
    this.path = previousPath;
    this.currentSubpath = previousSubpath;
  }

  clearRect(): void {}
  setLineDash(segments: number[]): void { this.state.lineDash = segments.filter(value => Number.isFinite(value) && value >= 0); }
  getLineDash(): number[] { return [...this.state.lineDash]; }

  createLinearGradient(): CanvasGradient {
    const gradient: DxfGradient = {
      kind: 'linear',
      stops: [],
      addColorStop: (offset: number, color: string) => {
        gradient.stops.push({ offset: Math.max(0, Math.min(1, offset)), color: parseColor(color) });
        gradient.stops.sort((left, right) => left.offset - right.offset);
      },
    };
    return gradient as unknown as CanvasGradient;
  }

  measureText(text: string): TextMetrics {
    const font = this.parseFont();
    const width = [...text].reduce((total, char) => total + (char === ' ' ? 0.34 : font.widthFactor) * font.size, 0);
    return { width } as TextMetrics;
  }

  fillText(text: string, x: number, y: number, maxWidth?: number): void { this.drawText(text, x, y, maxWidth); }
  strokeText(text: string, x: number, y: number, maxWidth?: number): void { this.drawText(text, x, y, maxWidth, true); }

  private drawText(text: string, x: number, y: number, maxWidth?: number, stroke = false): void {
    if (!text) return;
    const font = this.parseFont();
    const metrics = this.measureText(text);
    let adjustedX = x;
    if (this.state.textAlign === 'center') adjustedX -= metrics.width / 2;
    else if (this.state.textAlign === 'right' || this.state.textAlign === 'end') adjustedX -= metrics.width;

    let adjustedY = y;
    if (this.state.textBaseline === 'top' || this.state.textBaseline === 'hanging') adjustedY += font.size * 0.82;
    else if (this.state.textBaseline === 'middle') adjustedY += font.size * 0.32;
    else if (this.state.textBaseline === 'bottom' || this.state.textBaseline === 'ideographic') adjustedY -= font.size * 0.18;

    const origin = applyMatrix(this.state.transform, adjustedX, adjustedY);
    const xAxis = { x: this.state.transform[0], y: this.state.transform[1] };
    const yAxis = { x: this.state.transform[2], y: this.state.transform[3] };
    const height = Math.max(0.01, font.size * Math.hypot(yAxis.x, yAxis.y));
    const naturalWidth = Math.max(0.0001, metrics.width * Math.hypot(xAxis.x, xAxis.y));
    const maxWidthScale = maxWidth && metrics.width > maxWidth ? maxWidth / metrics.width : 1;
    const widthFactor = Math.max(0.01, Math.min(100, maxWidthScale));
    const rotation = -Math.atan2(xAxis.y, xAxis.x) * 180 / Math.PI;
    const color = this.paintColor(stroke ? this.state.strokeStyle : this.state.fillStyle);
    const isGroupBlockText = !!this.activeBlock?.isGroup;
    const entity = this.textEntity(text, origin, height, rotation, widthFactor, color, isGroupBlockText);
    if (isGroupBlockText) this.pushEntity(entity);
    else {
      // Text remains a direct model-space entity even while surrounding geometry
      // is being captured into a block, so it stays directly editable in AutoCAD.
      this.pushModelEntity(entity);
    }
    this.include(origin);
    this.include({ x: origin.x + naturalWidth * widthFactor, y: origin.y + height });
  }

  drawImage(): void {
    // Raster imagery is excluded, matching the established vector PDF behavior.
  }

  private parseFont(): { size: number; widthFactor: number } {
    const sizeMatch = this.state.font.match(/([0-9.]+)px/i);
    const size = sizeMatch ? parseFloat(sizeMatch[1]) : 10;
    const lower = this.state.font.toLowerCase();
    const bold = /\b(bold|600|700|800|900|black)\b/.test(lower);
    const mono = /mono|courier|jetbrains/.test(lower);
    return { size, widthFactor: mono ? 0.6 : (bold ? 0.57 : 0.54) };
  }

  private paintColor(paint: string | DxfGradient): Color {
    return typeof paint === 'string' ? parseColor(paint) : (paint.stops[0]?.color || { r: 0, g: 0, b: 0, a: 1 });
  }

  private registerLayer(sourceName: string, color?: string): string {
    const aliasKey = sourceName.toLowerCase();
    const existingAlias = this.layerAliases.get(aliasKey);
    if (existingAlias) return existingAlias;

    const baseName = (sourceName || '0')
      .replace(/[^\x20-\x7e]/g, '_')
      .replace(/[<>/\\"\:;?*|=,]/g, '_')
      .trim()
      .slice(0, 31) || '0';
    let safeName = baseName;
    let suffix = 2;
    while (this.layers.has(safeName.toLowerCase())) {
      const suffixText = `_${suffix++}`;
      safeName = `${baseName.slice(0, 31 - suffixText.length)}${suffixText}`;
    }
    const layerColor = color ? indexedColor(parseColor(color)) : 7;
    this.layers.set(safeName.toLowerCase(), { name: safeName, color: layerColor });
    this.layerAliases.set(aliasKey, safeName);
    return safeName;
  }

  private createBlockName(sourceName: string): string {
    const safeLabel = (sourceName || 'OBJECT')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_+/g, '_') || 'OBJECT';
    const baseName = safeLabel.slice(0, 31);
    const existingNames = new Set([...this.blocks.values()].map(block => block.name));
    if (!existingNames.has(baseName)) return baseName;
    let suffix = 2;
    while (existingNames.has(`${baseName.slice(0, 31 - `${suffix}`.length - 1)}_${suffix}`)) suffix += 1;
    return `${baseName.slice(0, 31 - `${suffix}`.length - 1)}_${suffix}`;
  }

  private entityPoint(point: Point): Point {
    if (!this.activeBlock) return point;
    const dx = point.x - this.activeBlock.instance.base.x;
    const dy = point.y - this.activeBlock.instance.base.y;
    const angle = -this.activeBlock.instance.rotation * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
  }

  private entityLayer(): string {
    return this.activeBlock ? '0' : this.currentLayer;
  }

  private pushEntity(entity: string): void {
    if (this.activeBlock) {
      if (this.activeBlock.captureGeometry) this.activeBlock.definition.entities.push(this.withHandle(entity));
    }
    else this.pushModelEntity(entity);
  }

  private pushModelEntity(entity: string): void {
    const handle = this.nextHandle();
    this.entities.push({ handle, entity: this.withHandle(entity, handle), groupId: this.currentGroupId });
    this.addEntityToCurrentGroup(handle);
  }

  private nextHandle(): string {
    return (this.handleSeed++).toString(16).toUpperCase();
  }

  private withHandle(entity: string, handle = this.nextHandle()): string {
    const parts = entity.split('\r\n');
    if (parts.length < 3 || parts[0].trim() !== '0') return pair(5, handle) + entity;
    return `${parts[0]}\r\n${parts[1]}\r\n${pair(5, handle)}${parts.slice(2).join('\r\n')}`;
  }

  private addEntityToCurrentGroup(handle: string): void {
    if (!this.currentGroupId) return;
    let group = this.groups.get(this.currentGroupId);
    if (!group) {
      group = {
        id: this.currentGroupId,
        dictionaryName: `*A${this.groups.size + 1}`,
        handles: [],
      };
      this.groups.set(this.currentGroupId, group);
    }
    if (!group.handles.includes(handle)) group.handles.push(handle);
  }

  private effectiveScale(): number {
    const matrix = this.state.transform;
    return Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2])) || 1;
  }

  private registerLinetype(): string {
    if (this.state.lineDash.length === 0 || this.state.lineDash.every(value => value === 0)) return 'CONTINUOUS';
    const scale = this.effectiveScale();
    const pattern = this.state.lineDash.map((value, index) => Math.max(0.01, value * scale) * (index % 2 === 0 ? 1 : -1));
    const key = pattern.map(value => fmt(value)).join(',');
    const existing = this.linetypes.get(key);
    if (existing) return existing.name;
    const value = { name: `CANVAS_DASH_${this.linetypes.size + 1}`, pattern };
    this.linetypes.set(key, value);
    return value.name;
  }

  private polylineEntity(subpath: Subpath, color: Color, _linetype: string): string {
    const layer = this.entityLayer();
    let value = pair(0, 'POLYLINE') + pair(8, layer) + pair(62, indexedColor(color));
    value += pair(66, 1) + pair(10, 0) + pair(20, 0) + pair(30, 0) + pair(70, subpath.closed ? 1 : 0);
    subpath.points.forEach(point => {
      const local = this.entityPoint(point);
      value += pair(0, 'VERTEX') + pair(8, layer) + pair(10, fmt(local.x)) + pair(20, fmt(-local.y)) + pair(30, 0);
    });
    return value + pair(0, 'SEQEND') + pair(8, layer);
  }

  private hatchEntity(points: Point[], color: Color): string {
    return triangulate(points).map(triangle => {
      const [a, b, c] = triangle.map(point => this.entityPoint(point));
      return pair(0, 'SOLID') + pair(8, this.entityLayer()) + pair(62, indexedColor(color)) +
        pair(10, fmt(a.x)) + pair(20, fmt(-a.y)) + pair(30, 0) +
        pair(11, fmt(b.x)) + pair(21, fmt(-b.y)) + pair(31, 0) +
        pair(12, fmt(c.x)) + pair(22, fmt(-c.y)) + pair(32, 0) +
        pair(13, fmt(c.x)) + pair(23, fmt(-c.y)) + pair(33, 0);
    }).join('');
  }

  private textEntity(text: string, origin: Point, height: number, rotation: number, widthFactor: number, color: Color, blockSpace = false): string {
    const local = blockSpace ? this.entityPoint(origin) : origin;
    const layer = blockSpace ? '0' : this.currentLayer;
    return pair(0, 'TEXT') + pair(8, layer) + pair(62, indexedColor(color)) +
      pair(10, fmt(local.x)) + pair(20, fmt(-local.y)) + pair(30, 0) + pair(40, fmt(height)) +
      pair(1, escapeDxfText(text)) + pair(41, fmt(widthFactor)) + pair(50, fmt(rotation)) + pair(7, 'STANDARD');
  }

  private insertEntity(block: DxfBlockRecord, instance: DxfBlockInstance): string {
    const rotation = ((-instance.rotation % 360) + 360) % 360;
    return pair(0, 'INSERT') + pair(8, instance.layer) + pair(2, block.name) +
      pair(10, fmt(instance.base.x)) + pair(20, fmt(-instance.base.y)) + pair(30, 0) +
      pair(41, 1) + pair(42, 1) + pair(43, 1) + pair(50, fmt(rotation));
  }

  private blockSection(): string {
    const definitions = [...this.blocks.values()]
      .filter(block => block.entities.length > 0)
      .map(block => pair(0, 'BLOCK') + pair(8, '0') + pair(2, block.name) + pair(70, 0) +
        pair(10, 0) + pair(20, 0) + pair(30, 0) + pair(3, block.name) + pair(1, '') +
        block.entities.join('') + pair(0, 'ENDBLK') + pair(8, '0'))
      .join('');
    return pair(0, 'SECTION') + pair(2, 'BLOCKS') + definitions + pair(0, 'ENDSEC');
  }

  private insertPendingGroups(): void {
    this.pendingGroupInserts.forEach((instance, groupId) => {
      if (this.insertedBlockElements.has(groupId)) return;
      const block = this.blocks.get(`GROUP:${groupId}`);
      if (!block || block.entities.length === 0) return;
      this.currentGroupId = undefined;
      this.pushModelEntity(this.insertEntity(block, instance));
      this.insertedBlockElements.add(groupId);
    });
  }

  private nativeEllipsePath(x: number, y: number, radiusX: number, radiusY: number, rotation: number, full: boolean): NativeEllipsePath {
    const center = applyMatrix(this.state.transform, x, y);
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const axisXEnd = applyMatrix(this.state.transform, x + radiusX * cos, y + radiusX * sin);
    const axisYEnd = applyMatrix(this.state.transform, x - radiusY * sin, y + radiusY * cos);
    return {
      center,
      axisX: { x: axisXEnd.x - center.x, y: axisXEnd.y - center.y },
      axisY: { x: axisYEnd.x - center.x, y: axisYEnd.y - center.y },
      full,
    };
  }

  private include(point: Point): void {
    this.bounds.minX = Math.min(this.bounds.minX, point.x);
    this.bounds.maxX = Math.max(this.bounds.maxX, point.x);
    this.bounds.minY = Math.min(this.bounds.minY, -point.y);
    this.bounds.maxY = Math.max(this.bounds.maxY, -point.y);
  }

  private dxfEntityPoint(point: Point): Point {
    const local = this.entityPoint(point);
    return { x: local.x, y: -local.y };
  }

  private nativeCurveEntity(subpath: Subpath, color: Color): string | null {
    if (!subpath.nativeEllipse || subpath.points.length < 3) return null;
    const native = subpath.nativeEllipse;
    const center = this.dxfEntityPoint(native.center);
    const axisXEnd = this.dxfEntityPoint({ x: native.center.x + native.axisX.x, y: native.center.y + native.axisX.y });
    const axisYEnd = this.dxfEntityPoint({ x: native.center.x + native.axisY.x, y: native.center.y + native.axisY.y });
    const axisX = { x: axisXEnd.x - center.x, y: axisXEnd.y - center.y };
    const axisY = { x: axisYEnd.x - center.x, y: axisYEnd.y - center.y };
    const lenX = Math.hypot(axisX.x, axisX.y);
    const lenY = Math.hypot(axisY.x, axisY.y);
    if (lenX <= 0.000001 || lenY <= 0.000001) return null;
    const orthogonality = Math.abs(axisX.x * axisY.x + axisX.y * axisY.y) / (lenX * lenY);
    if (orthogonality > 0.02) return null;

    const layer = this.entityLayer();
    const first = this.dxfEntityPoint(subpath.points[0]);
    const last = this.dxfEntityPoint(subpath.points[subpath.points.length - 1]);
    const closed = native.full || Math.hypot(first.x - last.x, first.y - last.y) <= Math.max(lenX, lenY) * 0.01;
    if (Math.abs(lenX - lenY) / Math.max(lenX, lenY) < 0.001) {
      if (closed) {
        return pair(0, 'CIRCLE') + pair(8, layer) + pair(62, indexedColor(color)) +
          pair(10, fmt(center.x)) + pair(20, fmt(center.y)) + pair(30, 0) + pair(40, fmt((lenX + lenY) / 2));
      }
      const start = Math.atan2(first.y - center.y, first.x - center.x) * 180 / Math.PI;
      const end = Math.atan2(last.y - center.y, last.x - center.x) * 180 / Math.PI;
      const orientation = this.pathOrientationInDxf(subpath, center);
      const startDeg = orientation >= 0 ? start : end;
      const endDeg = orientation >= 0 ? end : start;
      return pair(0, 'ARC') + pair(8, layer) + pair(62, indexedColor(color)) +
        pair(10, fmt(center.x)) + pair(20, fmt(center.y)) + pair(30, 0) + pair(40, fmt((lenX + lenY) / 2)) +
        pair(50, fmt(this.normalizeDegrees(startDeg))) + pair(51, fmt(this.normalizeDegrees(endDeg)));
    }

    const major = lenX >= lenY ? axisX : axisY;
    const minor = lenX >= lenY ? axisY : axisX;
    const majorLen = Math.max(lenX, lenY);
    const minorLen = Math.min(lenX, lenY);
    let startParam = 0;
    let endParam = TAU;
    if (!closed) {
      const mid = this.dxfEntityPoint(subpath.points[Math.floor(subpath.points.length / 2)]);
      const firstParam = this.ellipseParameter(first, center, major, minor);
      const lastParam = this.ellipseParameter(last, center, major, minor);
      const midParam = this.ellipseParameter(mid, center, major, minor);
      const forwardMid = this.normalizeRadians(firstParam + this.positiveAngleDelta(firstParam, lastParam) / 2);
      const reverseMid = this.normalizeRadians(lastParam + this.positiveAngleDelta(lastParam, firstParam) / 2);
      if (this.angularDistance(midParam, reverseMid) < this.angularDistance(midParam, forwardMid)) {
        startParam = lastParam;
        endParam = firstParam;
      } else {
        startParam = firstParam;
        endParam = lastParam;
      }
    }
    this.requiresModernDxf = true;
    return pair(0, 'ELLIPSE') + pair(8, layer) + pair(62, indexedColor(color)) +
      pair(10, fmt(center.x)) + pair(20, fmt(center.y)) + pair(30, 0) +
      pair(11, fmt(major.x)) + pair(21, fmt(major.y)) + pair(31, 0) +
      pair(40, fmt(minorLen / majorLen)) + pair(41, fmt(startParam)) + pair(42, fmt(endParam));
  }

  private pathOrientationInDxf(subpath: Subpath, center: Point): number {
    let total = 0;
    for (let index = 1; index < subpath.points.length; index += 1) {
      const a = this.dxfEntityPoint(subpath.points[index - 1]);
      const b = this.dxfEntityPoint(subpath.points[index]);
      total += (a.x - center.x) * (b.y - center.y) - (a.y - center.y) * (b.x - center.x);
    }
    return total;
  }

  private ellipseParameter(point: Point, center: Point, major: Point, minor: Point): number {
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    const majorSq = major.x * major.x + major.y * major.y;
    const minorSq = minor.x * minor.x + minor.y * minor.y;
    return this.normalizeRadians(Math.atan2((dx * minor.x + dy * minor.y) / minorSq, (dx * major.x + dy * major.y) / majorSq));
  }

  private positiveAngleDelta(start: number, end: number): number {
    return this.normalizeRadians(end - start);
  }

  private angularDistance(a: number, b: number): number {
    const delta = Math.abs(this.normalizeRadians(a - b));
    return Math.min(delta, TAU - delta);
  }

  private normalizeRadians(angle: number): number {
    const value = angle % TAU;
    return value < 0 ? value + TAU : value;
  }

  private normalizeDegrees(angle: number): number {
    const value = angle % 360;
    return value < 0 ? value + 360 : value;
  }

  private linetypeTable(): string {
    const definitions = [
      pair(0, 'LTYPE') + pair(2, 'BYLAYER') + pair(70, 0) + pair(3, '') + pair(72, 65) + pair(73, 0) + pair(40, 0),
      pair(0, 'LTYPE') + pair(2, 'BYBLOCK') + pair(70, 0) + pair(3, '') + pair(72, 65) + pair(73, 0) + pair(40, 0),
      pair(0, 'LTYPE') + pair(2, 'CONTINUOUS') + pair(70, 0) + pair(3, 'Solid line') + pair(72, 65) + pair(73, 0) + pair(40, 0),
    ];
    this.linetypes.forEach(item => {
      const totalLength = item.pattern.reduce((total, value) => total + Math.abs(value), 0);
      let definition = pair(0, 'LTYPE') + pair(2, item.name) + pair(70, 0) + pair(3, 'Canvas dash pattern') + pair(72, 65) + pair(73, item.pattern.length) + pair(40, fmt(totalLength));
      item.pattern.forEach(value => { definition += pair(49, fmt(value)); });
      definitions.push(definition);
    });
    return pair(0, 'TABLE') + pair(2, 'LTYPE') + pair(70, definitions.length) + definitions.join('') + pair(0, 'ENDTAB');
  }

  private layerTable(): string {
    const layers = [...this.layers.values()];
    let value = pair(0, 'TABLE') + pair(2, 'LAYER') + pair(70, layers.length);
    layers.forEach(layer => {
      value += pair(0, 'LAYER') + pair(2, layer.name) + pair(70, 0) + pair(62, layer.color) + pair(6, 'CONTINUOUS');
    });
    return value + pair(0, 'ENDTAB');
  }

  private styleTable(): string {
    return pair(0, 'TABLE') + pair(2, 'STYLE') + pair(70, 1) + pair(0, 'STYLE') + pair(2, 'STANDARD') +
      pair(70, 0) + pair(40, 0) + pair(41, 1) + pair(50, 0) + pair(71, 0) + pair(42, 2.5) + pair(3, 'txt') + pair(4, '') + pair(0, 'ENDTAB');
  }

  private viewportTable(bounds: Bounds): string {
    const width = Math.max(1, bounds.maxX - bounds.minX);
    const height = Math.max(1, bounds.maxY - bounds.minY);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const aspectRatio = 16 / 9;
    const viewHeight = Math.max(height, width / aspectRatio) * 1.1;
    return pair(0, 'TABLE') + pair(2, 'VPORT') + pair(70, 1) + pair(0, 'VPORT') + pair(2, '*ACTIVE') + pair(70, 0) +
      pair(10, 0) + pair(20, 0) + pair(11, 1) + pair(21, 1) + pair(12, fmt(centerX)) + pair(22, fmt(centerY)) +
      pair(13, 0) + pair(23, 0) + pair(14, 10) + pair(24, 10) + pair(15, 10) + pair(25, 10) +
      pair(16, 0) + pair(26, 0) + pair(36, 1) + pair(17, 0) + pair(27, 0) + pair(37, 0) +
      pair(40, fmt(viewHeight)) + pair(41, fmt(aspectRatio)) + pair(42, 50) + pair(43, 0) + pair(44, 0) +
      pair(50, 0) + pair(51, 0) + pair(71, 0) + pair(72, 100) + pair(73, 1) + pair(0, 'ENDTAB');
  }

  private prepareGroupObjectHandles(): void {
    const groups = [...this.groups.values()].filter(group => group.handles.length > 0);
    groups.forEach(group => {
      if (!group.objectHandle) group.objectHandle = this.nextHandle();
    });
  }

  private entityWithGroupReactor(record: DxfEntityRecord): string {
    const groupHandle = record.groupId ? this.groups.get(record.groupId)?.objectHandle : undefined;
    if (!groupHandle) return record.entity;
    const parts = record.entity.split('\r\n');
    if (parts.length < 5 || parts[0].trim() !== '0') return record.entity;
    return [
      parts[0],
      parts[1],
      parts[2],
      parts[3],
      pair(102, '{ACAD_REACTORS').trimEnd(),
      pair(330, groupHandle).trimEnd(),
      pair(102, '}').trimEnd(),
      ...parts.slice(4),
    ].join('\r\n');
  }

  private objectsSection(): string {
    const groups = [...this.groups.values()].filter(group => group.handles.length > 0 && group.objectHandle);
    if (groups.length === 0) return '';

    const rootHandle = this.nextHandle();
    const groupDictionaryHandle = this.nextHandle();

    let rootDictionary = pair(0, 'DICTIONARY') + pair(5, rootHandle) + pair(330, 0) + pair(100, 'AcDbDictionary') + pair(281, 1);
    rootDictionary += pair(3, 'ACAD_GROUP') + pair(350, groupDictionaryHandle);

    let groupDictionary = pair(0, 'DICTIONARY') + pair(5, groupDictionaryHandle) +
      pair(102, '{ACAD_REACTORS') + pair(330, rootHandle) + pair(102, '}') +
      pair(330, rootHandle) + pair(100, 'AcDbDictionary') + pair(281, 1);
    groups.forEach(group => {
      groupDictionary += pair(3, group.dictionaryName) + pair(350, group.objectHandle!);
    });

    const groupObjects = groups.map(group => {
      let value = pair(0, 'GROUP') + pair(5, group.objectHandle!) +
        pair(102, '{ACAD_REACTORS') + pair(330, groupDictionaryHandle) + pair(102, '}') +
        pair(330, groupDictionaryHandle) + pair(100, 'AcDbGroup') + pair(300, '') +
        pair(70, 1) + pair(71, 1);
      group.handles.forEach(memberHandle => { value += pair(340, memberHandle); });
      return value;
    }).join('');

    return pair(0, 'SECTION') + pair(2, 'OBJECTS') + rootDictionary + groupDictionary + groupObjects + pair(0, 'ENDSEC');
  }

  toDxfString(): string {
    this.finishDxfElement();
    this.insertPendingGroups();
    this.prepareGroupObjectHandles();
    const hasGroups = [...this.groups.values()].some(group => group.handles.length > 0);
    const bounds = Number.isFinite(this.bounds.minX) ? this.bounds : { minX: 0, minY: 0, maxX: 1000, maxY: 1000 };
    let header = pair(0, 'SECTION') + pair(2, 'HEADER');
    header += pair(9, '$ACADVER') + pair(1, hasGroups || this.requiresModernDxf ? 'AC1015' : 'AC1009');
    header += pair(9, '$INSUNITS') + pair(70, this.exportUnits.insunits);
    header += pair(9, '$MEASUREMENT') + pair(70, this.exportUnits.measurement);
    header += pair(9, '$LUNITS') + pair(70, this.exportUnits.lunits);
    header += pair(9, '$LUPREC') + pair(70, 4);
    header += pair(9, '$EXTMIN') + pair(10, fmt(bounds.minX)) + pair(20, fmt(bounds.minY)) + pair(30, 0);
    header += pair(9, '$EXTMAX') + pair(10, fmt(bounds.maxX)) + pair(20, fmt(bounds.maxY)) + pair(30, 0);
    header += pair(9, '$LIMMIN') + pair(10, fmt(bounds.minX)) + pair(20, fmt(bounds.minY));
    header += pair(9, '$LIMMAX') + pair(10, fmt(bounds.maxX)) + pair(20, fmt(bounds.maxY));
    header += pair(0, 'ENDSEC');

    const tables = pair(0, 'SECTION') + pair(2, 'TABLES') + this.layerTable() + pair(0, 'ENDSEC');
    const blocks = this.blockSection();
    const entities = pair(0, 'SECTION') + pair(2, 'ENTITIES') + this.entities.map(record => this.entityWithGroupReactor(record)).join('') + pair(0, 'ENDSEC');
    return header + tables + blocks + entities + this.objectsSection() + pair(0, 'EOF');
  }
}

export const downloadVectorDxf = (contents: string, fileName: string): void => {
  const blob = new Blob([contents], { type: 'application/dxf;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  anchor.dataset.vectorDxfDownload = 'true';
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 60000);
};
