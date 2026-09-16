import { CanvasLayer, PerspectiveSettings, Point } from '../types/canvas';
import { CanvasEngine } from './CanvasEngine';
import { FilterEngine } from './FilterEngine';

type Matrix3 = [number, number, number, number, number, number, number, number, number];

export class PerspectiveEngine {
  private static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private static solve(matrix: number[][], values: number[]): number[] {
    const rows = matrix.map((row, index) => [...row, values[index]]);
    for (let column = 0; column < values.length; column++) {
      let pivot = column;
      for (let row = column + 1; row < rows.length; row++) {
        if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
      }
      [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
      const divisor = rows[column][column] || 1e-12;
      for (let cell = column; cell <= values.length; cell++) rows[column][cell] /= divisor;
      for (let row = 0; row < rows.length; row++) {
        if (row === column) continue;
        const factor = rows[row][column];
        for (let cell = column; cell <= values.length; cell++) {
          rows[row][cell] -= factor * rows[column][cell];
        }
      }
    }
    return rows.map(row => row[values.length]);
  }

  static homography(source: Point[], destination: Point[]): Matrix3 {
    const a: number[][] = [];
    const b: number[] = [];
    for (let index = 0; index < 4; index++) {
      const { x, y } = source[index];
      const { x: u, y: v } = destination[index];
      a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
      b.push(u);
      a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
      b.push(v);
    }
    const h = this.solve(a, b);
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }

  static project(matrix: Matrix3, point: Point): Point {
    const denominator = matrix[6] * point.x + matrix[7] * point.y + matrix[8];
    return {
      x: (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / denominator,
      y: (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / denominator,
    };
  }

  private static multiply(left: Matrix3, right: Matrix3): Matrix3 {
    const output = new Array(9).fill(0);
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        for (let inner = 0; inner < 3; inner++) {
          output[row * 3 + column] += left[row * 3 + inner] * right[inner * 3 + column];
        }
      }
    }
    return output as Matrix3;
  }

  private static line(start: Point, end: Point): [number, number, number] {
    return [
      start.y - end.y,
      end.x - start.x,
      start.x * end.y - end.x * start.y,
    ];
  }

  private static intersection(
    first: [number, number, number],
    second: [number, number, number],
  ): [number, number, number] {
    return [
      first[1] * second[2] - first[2] * second[1],
      first[2] * second[0] - first[0] * second[2],
      first[0] * second[1] - first[1] * second[0],
    ];
  }

  private static guidedMatrix(width: number, height: number, settings: PerspectiveSettings): Matrix3 | null {
    const vertical = settings.guides.filter(guide => guide.orientation === 'vertical');
    const horizontal = settings.guides.filter(guide => guide.orientation === 'horizontal');
    if (vertical.length < 2 || horizontal.length < 2) return null;

    const verticalVanishing = this.intersection(
      this.line(vertical[0].start, vertical[0].end),
      this.line(vertical[1].start, vertical[1].end),
    );
    const horizontalVanishing = this.intersection(
      this.line(horizontal[0].start, horizontal[0].end),
      this.line(horizontal[1].start, horizontal[1].end),
    );
    const horizon = this.intersection(verticalVanishing, horizontalVanishing);
    const rectification: Matrix3 = [
      verticalVanishing[2], 0, -verticalVanishing[0],
      0, horizontalVanishing[2], -horizontalVanishing[1],
      horizon[0], horizon[1], horizon[2],
    ];
    const corners = [
      this.project(rectification, { x: 0, y: 0 }),
      this.project(rectification, { x: width, y: 0 }),
      this.project(rectification, { x: width, y: height }),
      this.project(rectification, { x: 0, y: height }),
    ];
    if (corners.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
    const minX = Math.min(...corners.map(point => point.x));
    const maxX = Math.max(...corners.map(point => point.x));
    const minY = Math.min(...corners.map(point => point.y));
    const maxY = Math.max(...corners.map(point => point.y));
    if (maxX - minX < 1e-6 || maxY - minY < 1e-6) return null;
    const normalize: Matrix3 = [
      width / (maxX - minX), 0, -minX * width / (maxX - minX),
      0, height / (maxY - minY), -minY * height / (maxY - minY),
      0, 0, 1,
    ];
    return this.multiply(normalize, rectification);
  }

  static buildMatrix(width: number, height: number, settings: PerspectiveSettings): Matrix3 {
    const guided = settings.mode === 'guided' ? this.guidedMatrix(width, height, settings) : null;
    if (guided) {
      const centerX = width / 2;
      const centerY = height / 2;
      const correctionZoom = settings.edgeMode === 'auto-crop' ? 1.06 : 1;
      const scaleX = Math.max(0.25, settings.scale / 100) * correctionZoom * (1 + settings.aspect / 200);
      const scaleY = Math.max(0.25, settings.scale / 100) * correctionZoom;
      const offsetX = settings.offsetX / 100 * width * 0.25;
      const offsetY = settings.offsetY / 100 * height * 0.25;
      const fineTune: Matrix3 = [
        scaleX, 0, centerX + offsetX - scaleX * centerX,
        0, scaleY, centerY + offsetY - scaleY * centerY,
        0, 0, 1,
      ];
      return this.multiply(fineTune, guided);
    }
    const source = [
      { x: 0, y: 0 }, { x: width, y: 0 },
      { x: width, y: height }, { x: 0, y: height },
    ];
    const destination = source.map(point => ({ ...point }));
    const verticalInset = Math.abs(settings.vertical) / 100 * width * 0.22;
    const horizontalInset = Math.abs(settings.horizontal) / 100 * height * 0.22;

    if (settings.vertical >= 0) {
      destination[0].x += verticalInset;
      destination[1].x -= verticalInset;
    } else {
      destination[3].x += verticalInset;
      destination[2].x -= verticalInset;
    }
    if (settings.horizontal >= 0) {
      destination[0].y += horizontalInset;
      destination[3].y -= horizontalInset;
    } else {
      destination[1].y += horizontalInset;
      destination[2].y -= horizontalInset;
    }

    const aspectX = 1 + settings.aspect / 200;
    const correctionZoom = settings.edgeMode === 'auto-crop'
      ? 1 + (Math.abs(settings.vertical) + Math.abs(settings.horizontal)) / 100 * 0.28
      : 1;
    const scale = Math.max(0.25, settings.scale / 100) * correctionZoom;
    const centerX = width / 2;
    const centerY = height / 2;
    const offsetX = settings.offsetX / 100 * width * 0.25;
    const offsetY = settings.offsetY / 100 * height * 0.25;
    destination.forEach(point => {
      point.x = centerX + (point.x - centerX) * scale * aspectX + offsetX;
      point.y = centerY + (point.y - centerY) * scale + offsetY;
    });
    return this.homography(source, destination);
  }

  static withGuidedCorrection(
    settings: PerspectiveSettings,
    width: number,
    height: number,
  ): PerspectiveSettings {
    if (settings.mode !== 'guided' || settings.guides.length === 0) return settings;
    const verticalGuides = settings.guides.filter(guide => guide.orientation === 'vertical');
    const horizontalGuides = settings.guides.filter(guide => guide.orientation === 'horizontal');
    if (verticalGuides.length >= 2 && horizontalGuides.length >= 2) return settings;
    const verticalSlope = verticalGuides.length
      ? verticalGuides.reduce((sum, guide) => sum + (guide.end.x - guide.start.x) / Math.max(1, Math.abs(guide.end.y - guide.start.y)), 0) / verticalGuides.length
      : 0;
    const horizontalSlope = horizontalGuides.length
      ? horizontalGuides.reduce((sum, guide) => sum + (guide.end.y - guide.start.y) / Math.max(1, Math.abs(guide.end.x - guide.start.x)), 0) / horizontalGuides.length
      : 0;
    return {
      ...settings,
      vertical: this.clamp(settings.vertical + verticalSlope * 120 * (height / width), -100, 100),
      horizontal: this.clamp(settings.horizontal + horizontalSlope * 120 * (width / height), -100, 100),
    };
  }

  static estimateAuto(canvas: HTMLCanvasElement): Pick<PerspectiveSettings, 'vertical' | 'horizontal'> {
    const sampleWidth = Math.min(320, canvas.width);
    const sampleHeight = Math.max(32, Math.round(canvas.height * sampleWidth / canvas.width));
    const sample = document.createElement('canvas');
    sample.width = sampleWidth;
    sample.height = sampleHeight;
    const ctx = sample.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { vertical: 0, horizontal: 0 };
    ctx.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);
    const pixels = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
    const luminance = (x: number, y: number) => {
      const index = (y * sampleWidth + x) * 4;
      return pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
    };
    const edgeSpan = (y: number) => {
      let left = 0;
      let right = sampleWidth - 1;
      let leftStrength = 0;
      let rightStrength = 0;
      for (let x = 2; x < sampleWidth - 2; x++) {
        const strength = Math.abs(luminance(x + 1, y) - luminance(x - 1, y));
        if (x < sampleWidth / 2 && strength > leftStrength) { left = x; leftStrength = strength; }
        if (x >= sampleWidth / 2 && strength > rightStrength) { right = x; rightStrength = strength; }
      }
      return right - left;
    };
    const top = edgeSpan(Math.max(2, Math.round(sampleHeight * 0.2)));
    const bottom = edgeSpan(Math.min(sampleHeight - 3, Math.round(sampleHeight * 0.8)));
    const vertical = this.clamp((bottom - top) / sampleWidth * 180, -45, 45);
    return { vertical, horizontal: 0 };
  }

  private static drawTriangle(
    ctx: CanvasRenderingContext2D,
    image: HTMLCanvasElement,
    source: [Point, Point, Point],
    destination: [Point, Point, Point],
  ): void {
    const [s0, s1, s2] = source;
    const [d0, d1, d2] = destination;
    const denominator = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
    if (Math.abs(denominator) < 1e-8) return;
    const a = (d0.x * (s1.y - s2.y) + d1.x * (s2.y - s0.y) + d2.x * (s0.y - s1.y)) / denominator;
    const c = (d0.x * (s2.x - s1.x) + d1.x * (s0.x - s2.x) + d2.x * (s1.x - s0.x)) / denominator;
    const e = (d0.x * (s1.x * s2.y - s2.x * s1.y) + d1.x * (s2.x * s0.y - s0.x * s2.y) + d2.x * (s0.x * s1.y - s1.x * s0.y)) / denominator;
    const b = (d0.y * (s1.y - s2.y) + d1.y * (s2.y - s0.y) + d2.y * (s0.y - s1.y)) / denominator;
    const d = (d0.y * (s2.x - s1.x) + d1.y * (s0.x - s2.x) + d2.y * (s1.x - s0.x)) / denominator;
    const f = (d0.y * (s1.x * s2.y - s2.x * s1.y) + d1.y * (s2.x * s0.y - s0.x * s2.y) + d2.y * (s0.x * s1.y - s1.x * s0.y)) / denominator;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(d0.x, d0.y);
    ctx.lineTo(d1.x, d1.y);
    ctx.lineTo(d2.x, d2.y);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(a, b, c, d, e, f);
    ctx.drawImage(image, 0, 0);
    ctx.restore();
  }

  static warpCanvas(source: HTMLCanvasElement, settings: PerspectiveSettings): HTMLCanvasElement {
    const width = source.width;
    const height = source.height;
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    const ctx = output.getContext('2d');
    if (!ctx) return output;
    if (settings.edgeMode === 'white') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
    }
    const matrix = this.buildMatrix(width, height, settings);
    const divisions = 24;
    for (let row = 0; row < divisions; row++) {
      for (let column = 0; column < divisions; column++) {
        const x0 = column / divisions * width;
        const x1 = (column + 1) / divisions * width;
        const y0 = row / divisions * height;
        const y1 = (row + 1) / divisions * height;
        const s00 = { x: x0, y: y0 };
        const s10 = { x: x1, y: y0 };
        const s11 = { x: x1, y: y1 };
        const s01 = { x: x0, y: y1 };
        this.drawTriangle(ctx, source, [s00, s10, s11], [this.project(matrix, s00), this.project(matrix, s10), this.project(matrix, s11)]);
        this.drawTriangle(ctx, source, [s00, s11, s01], [this.project(matrix, s00), this.project(matrix, s11), this.project(matrix, s01)]);
      }
    }
    return output;
  }

  static transformLayer(
    layer: CanvasLayer,
    width: number,
    height: number,
    settings: PerspectiveSettings,
  ): CanvasLayer {
    const flattened = document.createElement('canvas');
    flattened.width = width;
    flattened.height = height;
    const flattenedContext = flattened.getContext('2d');
    if (flattenedContext) CanvasEngine.renderLayer(flattenedContext, layer);
    // Edge backgrounds belong to the document composition, not each layer.
    const warped = this.warpCanvas(flattened, {
      ...settings,
      edgeMode: settings.edgeMode === 'white' ? 'transparent' : settings.edgeMode,
    });
    const result = CanvasEngine.createLayer(layer.id, layer.name, width, height, layer.type);
    result.visible = layer.visible;
    result.locked = layer.locked;
    result.opacity = layer.opacity;
    result.blendMode = layer.blendMode;
    result.adjustments = layer.adjustments ? FilterEngine.cloneAdjustments(layer.adjustments) : undefined;
    if (layer.adjustmentMask) {
      result.adjustmentMask = this.warpCanvas(layer.adjustmentMask, {
        ...settings,
        edgeMode: 'transparent',
      });
    }
    result.textProps = layer.textProps ? { ...layer.textProps } : undefined;
    result.textBox = layer.textBox ? { ...layer.textBox } : undefined;
    result.placedItem = layer.placedItem ? { ...layer.placedItem } : undefined;
    result.placedItemSource = layer.placedItemSource;
    result.placedItemSourceCanvas = layer.placedItemSourceCanvas;
    result.shapeProps = layer.shapeProps ? { ...layer.shapeProps } : undefined;
    result.isAiResult = layer.isAiResult;
    result.groupId = layer.groupId;
    result.expanded = layer.expanded;
    result.ctx.drawImage(warped, 0, 0);
    return result;
  }
}
