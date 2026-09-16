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

interface PdfGradient {
  kind: 'linear';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  stops: Array<{ offset: number; color: Color }>;
  addColorStop: (offset: number, color: string) => void;
}

interface CanvasState {
  transform: Matrix;
  fillStyle: string | PdfGradient;
  strokeStyle: string | PdfGradient;
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

interface FontInfo {
  size: number;
  resource: string;
  widthFactor: number;
}

const MM_TO_PT = 72 / 25.4;
const KAPPA = 0.5522847498307936;

const fmt = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.abs(value) < 0.0000001 ? 0 : value;
  return rounded.toFixed(5).replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, '').replace(/\.$/, '');
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

const escapePdfText = (text: string): string => {
  let result = '';
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (char === '(' || char === ')' || char === '\\') result += `\\${char}`;
    else if (code >= 32 && code <= 126) result += char;
    else if (code <= 255) result += `\\${code.toString(8).padStart(3, '0')}`;
    else result += '?';
  }
  return result;
};

const latin1Bytes = (value: string): Uint8Array => {
  const bytes = new Uint8Array(value.length);
  for (let i = 0; i < value.length; i += 1) bytes[i] = value.charCodeAt(i) & 0xff;
  return bytes;
};

export class VectorPdfCanvasContext {
  readonly canvas: { width: number; height: number };
  private state: CanvasState;
  private stack: CanvasState[] = [];
  private path = '';
  private currentPoint: Point | null = null;
  private commands: string[] = [];
  private alphaResources = new Map<string, { name: string; alpha: number }>();
  private shadingResources = new Map<string, { name: string; gradient: PdfGradient }>();
  private usedFonts = new Set<string>();

  globalCompositeOperation = 'source-over';
  imageSmoothingEnabled = true;
  imageSmoothingQuality: ImageSmoothingQuality = 'low';
  filter = 'none';

  constructor(
    readonly pageWidthMm: number,
    readonly pageHeightMm: number,
    initialTransform: Matrix,
    private readonly styleScale?: number,
  ) {
    this.canvas = { width: pageWidthMm, height: pageHeightMm };
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
    this.commands.push(`${fmt(MM_TO_PT)} 0 0 ${fmt(-MM_TO_PT)} 0 ${fmt(pageHeightMm * MM_TO_PT)} cm`);
  }

  get fillStyle(): string | CanvasGradient | CanvasPattern { return this.state.fillStyle as unknown as string | CanvasGradient; }
  set fillStyle(value: string | CanvasGradient | CanvasPattern) { this.state.fillStyle = value as unknown as string | PdfGradient; }
  get strokeStyle(): string | CanvasGradient | CanvasPattern { return this.state.strokeStyle as unknown as string | CanvasGradient; }
  set strokeStyle(value: string | CanvasGradient | CanvasPattern) { this.state.strokeStyle = value as unknown as string | PdfGradient; }
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

  save(): void {
    this.stack.push(cloneState(this.state));
    this.commands.push('q');
  }

  restore(): void {
    const previous = this.stack.pop();
    if (!previous) return;
    this.state = previous;
    this.commands.push('Q');
  }

  translate(x: number, y: number): void {
    this.state.transform = multiply(this.state.transform, [1, 0, 0, 1, x, y]);
  }

  rotate(angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    this.state.transform = multiply(this.state.transform, [cos, sin, -sin, cos, 0, 0]);
  }

  scale(x: number, y: number): void {
    this.state.transform = multiply(this.state.transform, [x, 0, 0, y, 0, 0]);
  }

  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.state.transform = multiply(this.state.transform, [a, b, c, d, e, f]);
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.state.transform = [a, b, c, d, e, f];
  }

  resetTransform(): void {
    this.state.transform = [1, 0, 0, 1, 0, 0];
  }

  beginPath(): void {
    this.path = '';
    this.currentPoint = null;
  }

  closePath(): void {
    this.path += 'h\n';
  }

  moveTo(x: number, y: number): void {
    const point = applyMatrix(this.state.transform, x, y);
    this.path += `${fmt(point.x)} ${fmt(point.y)} m\n`;
    this.currentPoint = point;
  }

  lineTo(x: number, y: number): void {
    const point = applyMatrix(this.state.transform, x, y);
    if (!this.currentPoint) this.path += `${fmt(point.x)} ${fmt(point.y)} m\n`;
    else this.path += `${fmt(point.x)} ${fmt(point.y)} l\n`;
    this.currentPoint = point;
  }

  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void {
    const cp1 = applyMatrix(this.state.transform, cp1x, cp1y);
    const cp2 = applyMatrix(this.state.transform, cp2x, cp2y);
    const point = applyMatrix(this.state.transform, x, y);
    if (!this.currentPoint) this.path += `${fmt(cp1.x)} ${fmt(cp1.y)} m\n`;
    this.path += `${fmt(cp1.x)} ${fmt(cp1.y)} ${fmt(cp2.x)} ${fmt(cp2.y)} ${fmt(point.x)} ${fmt(point.y)} c\n`;
    this.currentPoint = point;
  }

  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void {
    const control = applyMatrix(this.state.transform, cpx, cpy);
    const point = applyMatrix(this.state.transform, x, y);
    const start = this.currentPoint || control;
    const cp1 = { x: start.x + (control.x - start.x) * 2 / 3, y: start.y + (control.y - start.y) * 2 / 3 };
    const cp2 = { x: point.x + (control.x - point.x) * 2 / 3, y: point.y + (control.y - point.y) * 2 / 3 };
    if (!this.currentPoint) this.path += `${fmt(start.x)} ${fmt(start.y)} m\n`;
    this.path += `${fmt(cp1.x)} ${fmt(cp1.y)} ${fmt(cp2.x)} ${fmt(cp2.y)} ${fmt(point.x)} ${fmt(point.y)} c\n`;
    this.currentPoint = point;
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
    const tau = Math.PI * 2;
    let delta = endAngle - startAngle;
    if (!counterclockwise) {
      while (delta < 0) delta += tau;
      if (delta > tau) delta = tau;
    } else {
      while (delta > 0) delta -= tau;
      if (delta < -tau) delta = -tau;
    }
    if (Math.abs(delta) < 0.0000001 && Math.abs(endAngle - startAngle) >= tau) delta = counterclockwise ? -tau : tau;

    const cosRotation = Math.cos(rotation);
    const sinRotation = Math.sin(rotation);
    const localPoint = (angle: number): Point => ({
      x: x + radiusX * Math.cos(angle) * cosRotation - radiusY * Math.sin(angle) * sinRotation,
      y: y + radiusX * Math.cos(angle) * sinRotation + radiusY * Math.sin(angle) * cosRotation,
    });
    const localDerivative = (angle: number): Point => ({
      x: -radiusX * Math.sin(angle) * cosRotation - radiusY * Math.cos(angle) * sinRotation,
      y: -radiusX * Math.sin(angle) * sinRotation + radiusY * Math.cos(angle) * cosRotation,
    });

    const segments = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2)));
    const step = delta / segments;
    const start = localPoint(startAngle);
    const transformedStart = applyMatrix(this.state.transform, start.x, start.y);
    if (!this.currentPoint) this.moveTo(start.x, start.y);
    else if (Math.hypot(this.currentPoint.x - transformedStart.x, this.currentPoint.y - transformedStart.y) > 0.0001) this.lineTo(start.x, start.y);

    for (let index = 0; index < segments; index += 1) {
      const a0 = startAngle + step * index;
      const a1 = a0 + step;
      const p0 = localPoint(a0);
      const p1 = localPoint(a1);
      const d0 = localDerivative(a0);
      const d1 = localDerivative(a1);
      const factor = 4 / 3 * Math.tan(step / 4);
      this.bezierCurveTo(
        p0.x + d0.x * factor,
        p0.y + d0.y * factor,
        p1.x - d1.x * factor,
        p1.y - d1.y * factor,
        p1.x,
        p1.y,
      );
    }
  }

  fill(fillRule: CanvasFillRule = 'nonzero'): void {
    if (!this.path) return;
    if (typeof this.state.fillStyle !== 'string') {
      const shadingName = this.registerShading(this.state.fillStyle);
      this.commands.push('q', this.path, fillRule === 'evenodd' ? 'W* n' : 'W n', `/${shadingName} sh`, 'Q');
      return;
    }
    const color = parseColor(this.state.fillStyle);
    this.commands.push(this.colorCommand(color, false), this.path, fillRule === 'evenodd' ? 'f*' : 'f');
  }

  stroke(): void {
    if (!this.path) return;
    const color = typeof this.state.strokeStyle === 'string' ? parseColor(this.state.strokeStyle) : this.gradientFallback(this.state.strokeStyle);
    this.commands.push(this.strokeState(color), this.path, 'S');
  }

  clip(fillRule: CanvasFillRule = 'nonzero'): void {
    if (!this.path) return;
    this.commands.push(this.path, fillRule === 'evenodd' ? 'W* n' : 'W n');
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    const rectPath = this.rectanglePath(x, y, width, height);
    if (typeof this.state.fillStyle !== 'string') {
      const shadingName = this.registerShading(this.state.fillStyle);
      this.commands.push('q', rectPath, 'W n', `/${shadingName} sh`, 'Q');
      return;
    }
    const color = parseColor(this.state.fillStyle);
    this.commands.push(this.colorCommand(color, false), rectPath, 'f');
  }

  strokeRect(x: number, y: number, width: number, height: number): void {
    const color = typeof this.state.strokeStyle === 'string' ? parseColor(this.state.strokeStyle) : this.gradientFallback(this.state.strokeStyle);
    this.commands.push(this.strokeState(color), this.rectanglePath(x, y, width, height), 'S');
  }

  clearRect(): void {
    // The export page starts blank and the plan renderer never needs destructive clearing.
  }

  setLineDash(segments: number[]): void {
    this.state.lineDash = segments.filter(value => Number.isFinite(value) && value >= 0);
  }

  getLineDash(): number[] {
    return [...this.state.lineDash];
  }

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): CanvasGradient {
    const start = applyMatrix(this.state.transform, x0, y0);
    const end = applyMatrix(this.state.transform, x1, y1);
    const gradient: PdfGradient = {
      kind: 'linear',
      x0: start.x,
      y0: start.y,
      x1: end.x,
      y1: end.y,
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

  fillText(text: string, x: number, y: number, maxWidth?: number): void {
    this.drawText(text, x, y, false, maxWidth);
  }

  strokeText(text: string, x: number, y: number, maxWidth?: number): void {
    this.drawText(text, x, y, true, maxWidth);
  }

  private drawText(text: string, x: number, y: number, stroke: boolean, maxWidth?: number): void {
    const font = this.parseFont();
    this.usedFonts.add(font.resource);
    const metrics = this.measureText(text);
    let adjustedX = x;
    if (this.state.textAlign === 'center') adjustedX -= metrics.width / 2;
    else if (this.state.textAlign === 'right' || this.state.textAlign === 'end') adjustedX -= metrics.width;

    let adjustedY = y;
    if (this.state.textBaseline === 'top' || this.state.textBaseline === 'hanging') adjustedY += font.size * 0.82;
    else if (this.state.textBaseline === 'middle') adjustedY += font.size * 0.32;
    else if (this.state.textBaseline === 'bottom' || this.state.textBaseline === 'ideographic') adjustedY -= font.size * 0.18;

    const matrix = this.state.transform;
    const origin = applyMatrix(matrix, adjustedX, adjustedY);
    const horizontalScale = maxWidth && metrics.width > maxWidth ? maxWidth / metrics.width : 1;
    const textMatrix = [
      matrix[0] * horizontalScale,
      matrix[1] * horizontalScale,
      -matrix[2],
      -matrix[3],
      origin.x,
      origin.y,
    ];
    const color = parseColor(stroke ? String(this.state.strokeStyle) : String(this.state.fillStyle));
    const paint = stroke ? this.colorCommand(color, true) : this.colorCommand(color, false);
    const renderMode = stroke ? '1 Tr' : '0 Tr';
    this.commands.push(
      paint,
      'BT',
      `/${font.resource} ${fmt(font.size)} Tf`,
      renderMode,
      `${textMatrix.map(fmt).join(' ')} Tm`,
      `(${escapePdfText(text)}) Tj`,
      'ET',
    );
  }

  drawImage(): void {
    // Raster sources are deliberately excluded from vector plan export.
  }

  private parseFont(): FontInfo {
    const sizeMatch = this.state.font.match(/([0-9.]+)px/i);
    const size = sizeMatch ? parseFloat(sizeMatch[1]) : 10;
    const lower = this.state.font.toLowerCase();
    const bold = /\b(bold|600|700|800|900|black)\b/.test(lower);
    const italic = /\b(italic|oblique)\b/.test(lower);
    const mono = /mono|courier|jetbrains/.test(lower);
    let resource = mono ? 'F5' : 'F1';
    if (mono && bold && italic) resource = 'F8';
    else if (mono && bold) resource = 'F6';
    else if (mono && italic) resource = 'F7';
    else if (!mono && bold && italic) resource = 'F4';
    else if (!mono && bold) resource = 'F2';
    else if (!mono && italic) resource = 'F3';
    return { size, resource, widthFactor: mono ? 0.6 : (bold ? 0.57 : 0.54) };
  }

  private rectanglePath(x: number, y: number, width: number, height: number): string {
    const p1 = applyMatrix(this.state.transform, x, y);
    const p2 = applyMatrix(this.state.transform, x + width, y);
    const p3 = applyMatrix(this.state.transform, x + width, y + height);
    const p4 = applyMatrix(this.state.transform, x, y + height);
    return `${fmt(p1.x)} ${fmt(p1.y)} m\n${fmt(p2.x)} ${fmt(p2.y)} l\n${fmt(p3.x)} ${fmt(p3.y)} l\n${fmt(p4.x)} ${fmt(p4.y)} l\nh`;
  }

  private effectiveScale(): number {
    if (this.styleScale !== undefined) return this.styleScale;
    const matrix = this.state.transform;
    return Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2])) || 1;
  }

  private alphaName(alpha: number): string {
    const normalized = Math.max(0, Math.min(1, alpha));
    const key = normalized.toFixed(4);
    const existing = this.alphaResources.get(key);
    if (existing) return existing.name;
    const resource = { name: `GS${this.alphaResources.size + 1}`, alpha: normalized };
    this.alphaResources.set(key, resource);
    return resource.name;
  }

  private colorCommand(color: Color, stroke: boolean): string {
    const alpha = color.a * this.state.globalAlpha;
    const operator = stroke ? 'RG' : 'rg';
    return `/${this.alphaName(alpha)} gs\n${fmt(color.r)} ${fmt(color.g)} ${fmt(color.b)} ${operator}`;
  }

  private strokeState(color: Color): string {
    const scale = this.effectiveScale();
    const cap = this.state.lineCap === 'round' ? 1 : this.state.lineCap === 'square' ? 2 : 0;
    const join = this.state.lineJoin === 'round' ? 1 : this.state.lineJoin === 'bevel' ? 2 : 0;
    const dash = this.state.lineDash.map(value => fmt(value * scale)).join(' ');
    return [
      this.colorCommand(color, true),
      `${fmt(this.state.lineWidth * scale)} w`,
      `${cap} J`,
      `${join} j`,
      `${fmt(this.state.miterLimit)} M`,
      `[${dash}] ${fmt(this.state.lineDashOffset * scale)} d`,
    ].join('\n');
  }

  private gradientFallback(gradient: PdfGradient): Color {
    return gradient.stops[0]?.color || { r: 0, g: 0, b: 0, a: 1 };
  }

  private registerShading(gradient: PdfGradient): string {
    const key = JSON.stringify(gradient);
    const existing = this.shadingResources.get(key);
    if (existing) return existing.name;
    const resource = { name: `Sh${this.shadingResources.size + 1}`, gradient };
    this.shadingResources.set(key, resource);
    return resource.name;
  }

  toPdfBytes(title = 'Vector Plan'): Uint8Array {
    while (this.stack.length > 0) this.restore();
    const content = this.commands.join('\n') + '\n';
    const fontDefinitions: Record<string, string> = {
      F1: 'Helvetica',
      F2: 'Helvetica-Bold',
      F3: 'Helvetica-Oblique',
      F4: 'Helvetica-BoldOblique',
      F5: 'Courier',
      F6: 'Courier-Bold',
      F7: 'Courier-Oblique',
      F8: 'Courier-BoldOblique',
    };

    const objects: string[] = ['', '', '', ''];
    const fontRefs = new Map<string, number>();
    Object.entries(fontDefinitions).forEach(([name, baseFont]) => {
      fontRefs.set(name, objects.length + 1);
      objects.push(`<< /Type /Font /Subtype /Type1 /BaseFont /${baseFont} /Encoding /WinAnsiEncoding >>`);
    });

    const alphaRefs = new Map<string, number>();
    this.alphaResources.forEach(resource => {
      alphaRefs.set(resource.name, objects.length + 1);
      objects.push(`<< /Type /ExtGState /ca ${fmt(resource.alpha)} /CA ${fmt(resource.alpha)} >>`);
    });

    const shadingRefs = new Map<string, number>();
    this.shadingResources.forEach(resource => {
      const stops = resource.gradient.stops;
      const start = stops[0]?.color || { r: 0, g: 0, b: 0, a: 1 };
      const end = stops[stops.length - 1]?.color || start;
      shadingRefs.set(resource.name, objects.length + 1);
      objects.push(
        `<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [${fmt(resource.gradient.x0)} ${fmt(resource.gradient.y0)} ${fmt(resource.gradient.x1)} ${fmt(resource.gradient.y1)}] ` +
        `/Function << /FunctionType 2 /Domain [0 1] /C0 [${fmt(start.r)} ${fmt(start.g)} ${fmt(start.b)}] /C1 [${fmt(end.r)} ${fmt(end.g)} ${fmt(end.b)}] /N 1 >> /Extend [true true] >>`,
      );
    });

    const contentRef = objects.length + 1;
    objects.push(`<< /Length ${latin1Bytes(content).length} >>\nstream\n${content}endstream`);

    const fontResources = [...fontRefs.entries()].map(([name, ref]) => `/${name} ${ref} 0 R`).join(' ');
    const alphaResources = [...alphaRefs.entries()].map(([name, ref]) => `/${name} ${ref} 0 R`).join(' ');
    const shadingResources = [...shadingRefs.entries()].map(([name, ref]) => `/${name} ${ref} 0 R`).join(' ');
    const resources = `<< /Font << ${fontResources} >> /ExtGState << ${alphaResources} >> /Shading << ${shadingResources} >> >>`;
    const pageWidthPt = this.pageWidthMm * MM_TO_PT;
    const pageHeightPt = this.pageHeightMm * MM_TO_PT;

    objects[0] = '<< /Type /Catalog /Pages 2 0 R >>';
    objects[1] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
    objects[2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${fmt(pageWidthPt)} ${fmt(pageHeightPt)}] /Resources ${resources} /Contents ${contentRef} 0 R >>`;
    objects[3] = `<< /Title (${escapePdfText(title)}) /Creator (Canvas Vector PDF Export) /Producer (Native PDF Writer) >>`;

    let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const offsets: number[] = [0];
    objects.forEach((object, index) => {
      offsets.push(latin1Bytes(pdf).length);
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = latin1Bytes(pdf).length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let index = 1; index <= objects.length; index += 1) {
      pdf += `${offsets[index].toString().padStart(10, '0')} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return latin1Bytes(pdf);
  }
}

export const downloadVectorPdf = (bytes: Uint8Array, fileName: string): void => {
  const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = 'none';
  anchor.dataset.vectorPdfDownload = 'true';
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => {
    anchor.remove();
    URL.revokeObjectURL(url);
  }, 60000);
};
