import { CanvasLayer, Point, Rect, TransformState } from '../types/canvas';
import { FilterEngine } from './FilterEngine';

export class CanvasEngine {
  /**
   * Composites all visible layers from bottom to top onto the output canvas.
   */
  static compositeLayers(
    layers: CanvasLayer[],
    targetCanvas: HTMLCanvasElement,
    width: number,
    height: number
  ): void {
    targetCanvas.width = width;
    targetCanvas.height = height;
    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    const topLevel = layers.filter(layer => !layer.groupId);
    for (let index = topLevel.length - 1; index >= 0; index--) {
      const layer = topLevel[index];
      if (!layer.visible || layer.opacity <= 0) continue;
      if (layer.type === 'group') {
        const groupCanvas = document.createElement('canvas');
        groupCanvas.width = width;
        groupCanvas.height = height;
        this.compositeFlat(layers.filter(child => child.groupId === layer.id), groupCanvas, width, height);
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = layer.blendMode;
        ctx.drawImage(groupCanvas, 0, 0);
        ctx.restore();
      } else {
        this.compositeSingle(layer, targetCanvas, width, height);
      }
    }
  }

  private static compositeFlat(layers: CanvasLayer[], targetCanvas: HTMLCanvasElement, width: number, height: number): void {
    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    for (let index = layers.length - 1; index >= 0; index--) {
      const layer = layers[index];
      if (!layer.visible || layer.opacity <= 0 || layer.type === 'group') continue;
      this.compositeSingle(layer, targetCanvas, width, height);
    }
  }

  private static compositeSingle(layer: CanvasLayer, targetCanvas: HTMLCanvasElement, width: number, height: number): void {
    const ctx = targetCanvas.getContext('2d');
    if (!ctx) return;

      if (layer.type === 'adjustment' && layer.adjustments) {
        const source = document.createElement('canvas');
        source.width = width;
        source.height = height;
        source.getContext('2d')?.drawImage(targetCanvas, 0, 0);
        const adjusted = document.createElement('canvas');
        FilterEngine.applyAdjustments(source, adjusted, layer.adjustments, layer.adjustmentMask);
        ctx.save();
        ctx.globalAlpha = layer.opacity;
        ctx.globalCompositeOperation = layer.blendMode;
        ctx.drawImage(adjusted, 0, 0);
        ctx.restore();
        return;
      }

      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = layer.blendMode;

      this.renderLayer(ctx, layer);

      ctx.restore();
  }

  /**
   * Renders an individual layer with its transform (translation, rotation, scale, perspective).
   */
  static renderLayer(ctx: CanvasRenderingContext2D, layer: CanvasLayer): void {
    const t = layer.transform;

    ctx.save();
    ctx.translate(t.x, t.y);

    if (t.rotation !== 0) {
      ctx.rotate((t.rotation * Math.PI) / 180);
    }

    const sx = t.flipH ? -t.scaleX : t.scaleX;
    const sy = t.flipV ? -t.scaleY : t.scaleY;
    if (sx !== 1 || sy !== 1) {
      ctx.scale(sx, sy);
    }

    if (t.skewX !== 0 || t.skewY !== 0) {
      ctx.transform(1, (t.skewY * Math.PI) / 180, (t.skewX * Math.PI) / 180, 1, 0, 0);
    }

    // Draw layer content
    ctx.drawImage(layer.canvas, 0, 0);

    ctx.restore();
  }

  /**
   * Converts viewport client coordinates (mouse/touch event) to canvas image pixel coordinates.
   */
  static screenToCanvas(
    clientX: number,
    clientY: number,
    canvasRect: DOMRect,
    zoom: number,
    pan: Point
  ): Point {
    const relativeX = clientX - canvasRect.left;
    const relativeY = clientY - canvasRect.top;

    return {
      x: (relativeX - pan.x) / zoom,
      y: (relativeY - pan.y) / zoom,
    };
  }

  /**
   * Creates an empty layer with an initialized canvas.
   */
  static createLayer(
    id: string,
    name: string,
    width: number,
    height: number,
    type: CanvasLayer['type'] = 'draw'
  ): CanvasLayer {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    return {
      id,
      name,
      type,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: 'source-over',
      canvas,
      ctx,
      transform: {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        flipH: false,
        flipV: false,
        skewX: 0,
        skewY: 0,
      },
    };
  }

  /**
   * Clones a layer with all its canvas data.
   */
  static duplicateLayer(layer: CanvasLayer, newId: string, newName: string): CanvasLayer {
    const newLayer = this.createLayer(newId, newName, layer.canvas.width, layer.canvas.height, layer.type);
    newLayer.visible = layer.visible;
    newLayer.locked = layer.locked;
    newLayer.opacity = layer.opacity;
    newLayer.blendMode = layer.blendMode;
    newLayer.transform = { ...layer.transform };
    if (layer.adjustments) newLayer.adjustments = FilterEngine.cloneAdjustments(layer.adjustments);
    if (layer.adjustmentMask) {
      newLayer.adjustmentMask = document.createElement('canvas');
      newLayer.adjustmentMask.width = layer.adjustmentMask.width;
      newLayer.adjustmentMask.height = layer.adjustmentMask.height;
      newLayer.adjustmentMask.getContext('2d')?.drawImage(layer.adjustmentMask, 0, 0);
    }
    if (layer.textProps) newLayer.textProps = { ...layer.textProps };
    if (layer.textBox) newLayer.textBox = { ...layer.textBox };
    if (layer.placedItem) newLayer.placedItem = { ...layer.placedItem };
    newLayer.placedItemSource = layer.placedItemSource;
    newLayer.placedItemSourceCanvas = layer.placedItemSourceCanvas;
    if (layer.shapeProps) newLayer.shapeProps = { ...layer.shapeProps };
    newLayer.isAiResult = layer.isAiResult;
    newLayer.groupId = layer.groupId;
    newLayer.expanded = layer.expanded;

    newLayer.ctx.drawImage(layer.canvas, 0, 0);
    return newLayer;
  }
}
