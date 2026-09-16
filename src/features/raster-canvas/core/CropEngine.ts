import { Rect } from '../types/canvas';

export interface NormalizedCropRect extends Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class CropEngine {
  static normalizeRect(rect: Rect, canvasWidth: number, canvasHeight: number, minSize = 10): NormalizedCropRect {
    const minWidth = Math.min(minSize, canvasWidth);
    const minHeight = Math.min(minSize, canvasHeight);
    const x = Math.max(0, Math.min(canvasWidth - minWidth, Math.round(rect.x)));
    const y = Math.max(0, Math.min(canvasHeight - minHeight, Math.round(rect.y)));
    const width = Math.max(minWidth, Math.min(canvasWidth - x, Math.round(rect.width)));
    const height = Math.max(minHeight, Math.min(canvasHeight - y, Math.round(rect.height)));
    return { x, y, width, height };
  }

  static getPixelPreservingDrawArgs(rect: NormalizedCropRect): [number, number, number, number, number, number, number, number] {
    return [rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height];
  }

  static normalizeOutpaintRect(rect: Rect, canvasWidth: number, canvasHeight: number): NormalizedCropRect {
    const x = Math.min(0, Math.round(rect.x));
    const y = Math.min(0, Math.round(rect.y));
    const right = Math.max(canvasWidth, Math.round(rect.x + rect.width));
    const bottom = Math.max(canvasHeight, Math.round(rect.y + rect.height));

    return {
      x,
      y,
      width: right - x,
      height: bottom - y,
    };
  }

  static getPixelPreservingOffset(rect: NormalizedCropRect): { x: number; y: number } {
    return { x: -rect.x, y: -rect.y };
  }

  static hasOutpaintArea(rect: NormalizedCropRect, canvasWidth: number, canvasHeight: number): boolean {
    return rect.x < 0 || rect.y < 0 || rect.width > canvasWidth || rect.height > canvasHeight;
  }
}
