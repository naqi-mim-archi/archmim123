import { CanvasLayer, PlacedItemState } from '../types/canvas';

export class PlaceEngine {
  static render(layer: CanvasLayer, source: CanvasImageSource, state: PlacedItemState): void {
    const ctx = layer.ctx;
    ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
    ctx.save();
    ctx.translate(state.x + state.width / 2, state.y + state.height / 2);
    ctx.rotate(state.rotation * Math.PI / 180);
    ctx.transform(1, Math.tan(state.skewY * Math.PI / 180), Math.tan(state.skewX * Math.PI / 180), 1, 0, 0);
    ctx.scale(state.flipX ? -1 : 1, state.flipY ? -1 : 1);
    ctx.drawImage(source, -state.width / 2, -state.height / 2, state.width, state.height);
    ctx.restore();
    layer.placedItem = { ...state };
  }
}
