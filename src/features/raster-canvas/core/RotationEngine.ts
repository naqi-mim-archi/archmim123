import { CanvasLayer } from '../types/canvas';
import { CanvasEngine } from './CanvasEngine';
import { FilterEngine } from './FilterEngine';

export class RotationEngine {
  static getStraightenCoverScale(width: number, height: number, degrees: number): number {
    if (width <= 0 || height <= 0) return 1;
    const radians = Math.abs((degrees * Math.PI) / 180);
    const sin = Math.abs(Math.sin(radians));
    const cos = Math.abs(Math.cos(radians));

    // Minimum uniform zoom whose inverse-rotated viewport corners remain
    // inside the source image. This preserves aspect ratio and removes blanks.
    return Math.max(
      cos + (height / width) * sin,
      cos + (width / height) * sin,
    );
  }

  private static flattenLayer(layer: CanvasLayer, width: number, height: number): HTMLCanvasElement {
    const flattened = document.createElement('canvas');
    flattened.width = width;
    flattened.height = height;
    const ctx = flattened.getContext('2d');
    if (ctx) CanvasEngine.renderLayer(ctx, layer);
    return flattened;
  }

  private static createResultLayer(layer: CanvasLayer, width: number, height: number): CanvasLayer {
    const result = CanvasEngine.createLayer(layer.id, layer.name, width, height, layer.type);
    result.visible = layer.visible;
    result.locked = layer.locked;
    result.opacity = layer.opacity;
    result.blendMode = layer.blendMode;
    result.adjustments = layer.adjustments ? FilterEngine.cloneAdjustments(layer.adjustments) : undefined;
    result.textProps = layer.textProps ? { ...layer.textProps } : undefined;
    result.textBox = layer.textBox ? { ...layer.textBox } : undefined;
    result.placedItem = layer.placedItem ? { ...layer.placedItem } : undefined;
    result.placedItemSource = layer.placedItemSource;
    result.placedItemSourceCanvas = layer.placedItemSourceCanvas;
    result.shapeProps = layer.shapeProps ? { ...layer.shapeProps } : undefined;
    result.isAiResult = layer.isAiResult;
    result.groupId = layer.groupId;
    result.expanded = layer.expanded;
    return result;
  }

  static rotateLayer(
    layer: CanvasLayer,
    degrees: number,
    sourceWidth: number,
    sourceHeight: number,
    targetWidth: number,
    targetHeight: number,
    uniformScale = 1,
  ): CanvasLayer {
    const source = this.flattenLayer(layer, sourceWidth, sourceHeight);
    const result = this.createResultLayer(layer, targetWidth, targetHeight);
    result.ctx.save();
    result.ctx.translate(targetWidth / 2, targetHeight / 2);
    result.ctx.rotate((degrees * Math.PI) / 180);
    result.ctx.scale(uniformScale, uniformScale);
    result.ctx.drawImage(source, -sourceWidth / 2, -sourceHeight / 2);
    result.ctx.restore();
    if (layer.adjustmentMask) {
      result.adjustmentMask = document.createElement('canvas');
      result.adjustmentMask.width = targetWidth;
      result.adjustmentMask.height = targetHeight;
      const maskCtx = result.adjustmentMask.getContext('2d');
      maskCtx?.save();
      maskCtx?.translate(targetWidth / 2, targetHeight / 2);
      maskCtx?.rotate((degrees * Math.PI) / 180);
      maskCtx?.scale(uniformScale, uniformScale);
      maskCtx?.drawImage(layer.adjustmentMask, -sourceWidth / 2, -sourceHeight / 2);
      maskCtx?.restore();
    }
    return result;
  }

  static flipLayer(
    layer: CanvasLayer,
    axis: 'h' | 'v',
    width: number,
    height: number,
  ): CanvasLayer {
    const source = this.flattenLayer(layer, width, height);
    const result = this.createResultLayer(layer, width, height);
    result.ctx.save();
    if (axis === 'h') {
      result.ctx.setTransform(-1, 0, 0, 1, width, 0);
    } else {
      result.ctx.setTransform(1, 0, 0, -1, 0, height);
    }
    result.ctx.drawImage(source, 0, 0);
    result.ctx.restore();
    if (layer.adjustmentMask) {
      result.adjustmentMask = document.createElement('canvas');
      result.adjustmentMask.width = width;
      result.adjustmentMask.height = height;
      const maskCtx = result.adjustmentMask.getContext('2d');
      if (axis === 'h') maskCtx?.setTransform(-1, 0, 0, 1, width, 0);
      else maskCtx?.setTransform(1, 0, 0, -1, 0, height);
      maskCtx?.drawImage(layer.adjustmentMask, 0, 0);
    }
    return result;
  }
}
