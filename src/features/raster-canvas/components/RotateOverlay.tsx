import React, { useEffect, useRef } from 'react';
import { CanvasEngine } from '../core/CanvasEngine';
import { RotationEngine } from '../core/RotationEngine';
import { RasterCanvasStore } from '../state/useRasterCanvasStore';

interface RotateOverlayProps {
  store: RasterCanvasStore;
}

export const RotateOverlay: React.FC<RotateOverlayProps> = ({ store }) => {
  const previewRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    canvas.width = store.width;
    canvas.height = store.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (Math.abs(store.straightenAngle) < 0.01) return;

    const radians = (store.straightenAngle * Math.PI) / 180;
    const coverScale = RotationEngine.getStraightenCoverScale(
      store.width,
      store.height,
      store.straightenAngle,
    );
    for (let index = store.layers.length - 1; index >= 0; index--) {
      const layer = store.layers[index];
      if (!layer.visible || layer.opacity <= 0) continue;

      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = layer.blendMode;
      if (store.rotationScope === 'all' || layer.id === store.activeLayerId) {
        ctx.translate(store.width / 2, store.height / 2);
        ctx.rotate(radians);
        ctx.scale(coverScale, coverScale);
        ctx.translate(-store.width / 2, -store.height / 2);
      }
      CanvasEngine.renderLayer(ctx, layer);
      ctx.restore();
    }
  }, [
    store.activeLayerId,
    store.height,
    store.layers,
    store.renderTrigger,
    store.rotationScope,
    store.straightenAngle,
    store.width,
  ]);

  const hasPreview = Math.abs(store.straightenAngle) >= 0.01;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <canvas
        ref={previewRef}
        width={store.width}
        height={store.height}
        className={`absolute inset-0 h-full w-full bg-slate-950 transition-opacity ${hasPreview ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        className="absolute inset-0 border border-amber-300/70"
        style={{
          backgroundImage: [
            'linear-gradient(to right, rgba(251, 191, 36, 0.38) 1px, transparent 1px)',
            'linear-gradient(to bottom, rgba(251, 191, 36, 0.38) 1px, transparent 1px)',
          ].join(','),
          backgroundSize: '25% 25%',
        }}
      />
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-amber-400/40 bg-slate-950/85 px-3 py-1 font-mono text-[10px] font-bold text-amber-200 shadow-xl backdrop-blur">
        {store.straightenAngle > 0 ? '+' : ''}{store.straightenAngle.toFixed(1)}°
      </div>
    </div>
  );
};
