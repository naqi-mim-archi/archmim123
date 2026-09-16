import React, { useEffect, useRef, useState } from 'react';
import { CanvasEngine } from '../core/CanvasEngine';
import { PerspectiveEngine } from '../core/PerspectiveEngine';
import { RasterCanvasStore } from '../state/useRasterCanvasStore';
import { Point } from '../types/canvas';

interface PerspectiveOverlayProps {
  store: RasterCanvasStore;
}

export const PerspectiveOverlay: React.FC<PerspectiveOverlayProps> = ({ store }) => {
  const previewRef = useRef<HTMLCanvasElement>(null);
  const [draftStart, setDraftStart] = useState<Point | null>(null);
  const [draftEnd, setDraftEnd] = useState<Point | null>(null);

  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const settings = PerspectiveEngine.withGuidedCorrection(store.perspective, store.width, store.height);
    const previewLayers = store.rotationScope === 'all'
      ? store.layers.map(layer => PerspectiveEngine.transformLayer(layer, store.width, store.height, settings))
      : store.layers.map(layer => layer.id === store.activeLayerId
        ? PerspectiveEngine.transformLayer(layer, store.width, store.height, settings)
        : layer);
    if (settings.edgeMode === 'white') {
      const background = CanvasEngine.createLayer('perspective_preview_bg', 'Preview Background', store.width, store.height, 'draw');
      background.ctx.fillStyle = '#ffffff';
      background.ctx.fillRect(0, 0, store.width, store.height);
      previewLayers.push(background);
    }
    CanvasEngine.compositeLayers(previewLayers, canvas, store.width, store.height);
  }, [
    store.activeLayerId,
    store.height,
    store.layers,
    store.perspective,
    store.renderTrigger,
    store.rotationScope,
    store.width,
  ]);

  const toCanvasPoint = (event: React.PointerEvent): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width * store.width,
      y: (event.clientY - rect.top) / rect.height * store.height,
    };
  };

  const guided = store.perspective.mode === 'guided';
  return (
    <div
      className={`absolute inset-0 z-20 overflow-hidden ${guided ? 'pointer-events-auto cursor-crosshair' : 'pointer-events-none'}`}
      onPointerDown={event => {
        if (!guided) return;
        const point = toCanvasPoint(event);
        setDraftStart(point);
        setDraftEnd(point);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        if (draftStart) setDraftEnd(toCanvasPoint(event));
      }}
      onPointerUp={event => {
        if (draftStart && draftEnd) {
          const distance = Math.hypot(draftEnd.x - draftStart.x, draftEnd.y - draftStart.y);
          if (distance > 8) {
            store.addPerspectiveGuide({
              id: `guide_${Date.now()}`,
              orientation: store.perspective.guideOrientation,
              start: draftStart,
              end: draftEnd,
            });
          }
        }
        setDraftStart(null);
        setDraftEnd(null);
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    >
      <canvas ref={previewRef} width={store.width} height={store.height} className="absolute inset-0 h-full w-full" />
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${store.width} ${store.height}`}>
        <g opacity="0.45" stroke="#fbbf24" strokeWidth="1">
          <line x1={store.width / 3} y1="0" x2={store.width / 3} y2={store.height} />
          <line x1={store.width * 2 / 3} y1="0" x2={store.width * 2 / 3} y2={store.height} />
          <line x1="0" y1={store.height / 3} x2={store.width} y2={store.height / 3} />
          <line x1="0" y1={store.height * 2 / 3} x2={store.width} y2={store.height * 2 / 3} />
        </g>
        {store.perspective.guides.map(guide => (
          <line
            key={guide.id}
            x1={guide.start.x}
            y1={guide.start.y}
            x2={guide.end.x}
            y2={guide.end.y}
            stroke={guide.orientation === 'vertical' ? '#38bdf8' : '#fb7185'}
            strokeWidth="3"
            strokeDasharray="8 5"
          />
        ))}
        {draftStart && draftEnd && (
          <line
            x1={draftStart.x}
            y1={draftStart.y}
            x2={draftEnd.x}
            y2={draftEnd.y}
            stroke={store.perspective.guideOrientation === 'vertical' ? '#38bdf8' : '#fb7185'}
            strokeWidth="3"
          />
        )}
      </svg>
    </div>
  );
};
