import React, { useEffect, useRef, useState } from 'react';
import { FlipHorizontal, FlipVertical, Move, RotateCw } from 'lucide-react';
import { RasterCanvasStore } from '../state/useRasterCanvasStore';
import { PlacedItemState } from '../types/canvas';

type Action = 'move' | 'rotate' | 'skew-x' | 'skew-y' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

export const PlaceOverlay: React.FC<{ store: RasterCanvasStore }> = ({ store }) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const activeLayer = store.layers.find(layer => layer.id === store.activeLayerId && layer.placedItem && !layer.locked);
  const [state, setState] = useState<PlacedItemState | null>(activeLayer?.placedItem ? { ...activeLayer.placedItem } : null);
  const interaction = useRef<{ action: Action; start: { x: number; y: number }; state: PlacedItemState; angle: number } | null>(null);

  useEffect(() => {
    setState(activeLayer?.placedItem ? { ...activeLayer.placedItem } : null);
  }, [activeLayer?.id, activeLayer?.placedItem]);

  if (!activeLayer || !state) return null;

  const point = (event: React.PointerEvent) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (event.clientX - rect.left) * store.width / rect.width,
      y: (event.clientY - rect.top) * store.height / rect.height,
    };
  };

  const begin = (event: React.PointerEvent, action: Action) => {
    event.preventDefault();
    event.stopPropagation();
    const start = point(event);
    const center = { x: state.x + state.width / 2, y: state.y + state.height / 2 };
    interaction.current = {
      action,
      start,
      state: { ...state },
      angle: Math.atan2(start.y - center.y, start.x - center.x) * 180 / Math.PI - state.rotation,
    };
    rootRef.current?.setPointerCapture(event.pointerId);
  };

  const move = (event: React.PointerEvent) => {
    if (!interaction.current) return;
    event.preventDefault();
    const current = interaction.current;
    const cursor = point(event);
    const dx = cursor.x - current.start.x, dy = cursor.y - current.start.y;
    const start = current.state;
    let next = { ...start };
    if (current.action === 'move') {
      next.x = start.x + dx; next.y = start.y + dy;
    } else if (current.action === 'rotate') {
      const center = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
      next.rotation = Math.round((Math.atan2(cursor.y - center.y, cursor.x - center.x) * 180 / Math.PI - current.angle) * 10) / 10;
    } else if (current.action === 'skew-x') next.skewX = Math.max(-60, Math.min(60, start.skewX + dx * .2));
    else if (current.action === 'skew-y') next.skewY = Math.max(-60, Math.min(60, start.skewY + dy * .2));
    else {
      if (current.action.includes('w')) { next.x = start.x + dx; next.width = start.width - dx; }
      if (current.action.includes('e')) next.width = start.width + dx;
      if (current.action.includes('n')) { next.y = start.y + dy; next.height = start.height - dy; }
      if (current.action.includes('s')) next.height = start.height + dy;
      if (next.width < 24) { if (current.action.includes('w')) next.x -= 24 - next.width; next.width = 24; }
      if (next.height < 24) { if (current.action.includes('n')) next.y -= 24 - next.height; next.height = 24; }
    }
    setState(next);
    store.updatePlacedItem(activeLayer.id, next);
  };

  const end = (event: React.PointerEvent) => {
    if (!interaction.current) return;
    interaction.current = null;
    store.updatePlacedItem(activeLayer.id, state, true);
    try { rootRef.current?.releasePointerCapture(event.pointerId); } catch {}
  };

  const setAndCommit = (next: PlacedItemState) => {
    setState(next);
    store.updatePlacedItem(activeLayer.id, next, true);
  };
  const handle = (action: Action, classes: string, title?: string) => (
    <button title={title} onPointerDown={event => begin(event, action)} className={`absolute z-20 border border-cyan-600 bg-white shadow ${classes}`} />
  );

  return (
    <div ref={rootRef} className="absolute inset-0 z-40 touch-none" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <div
        className="absolute border border-cyan-400 shadow-[0_0_0_1px_rgba(15,23,42,.7)]"
        style={{
          left: state.x, top: state.y, width: state.width, height: state.height,
          transform: `rotate(${state.rotation}deg) skew(${state.skewX}deg, ${state.skewY}deg)`,
          transformOrigin: 'center',
        }}
      >
        <button onPointerDown={event => begin(event, 'move')} className="absolute inset-3 flex cursor-move items-center justify-center bg-transparent text-transparent hover:bg-cyan-400/5 hover:text-cyan-300"><Move size={20} /></button>
        <div className="absolute -top-12 left-1/2 h-6 w-px -translate-x-1/2 bg-cyan-400" />
        <button title="Rotate" onPointerDown={event => begin(event, 'rotate')} className="absolute -top-[62px] left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border border-cyan-500 bg-slate-950 text-cyan-300"><RotateCw size={11} /></button>
        {handle('nw', '-left-1.5 -top-1.5 h-3 w-3 cursor-nwse-resize')}
        {handle('ne', '-right-1.5 -top-1.5 h-3 w-3 cursor-nesw-resize')}
        {handle('sw', '-bottom-1.5 -left-1.5 h-3 w-3 cursor-nesw-resize')}
        {handle('se', '-bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize')}
        {handle('n', '-top-1.5 left-1/2 h-3 w-5 -translate-x-1/2 cursor-ns-resize')}
        {handle('s', '-bottom-1.5 left-1/2 h-3 w-5 -translate-x-1/2 cursor-ns-resize')}
        {handle('w', '-left-1.5 top-1/2 h-5 w-3 -translate-y-1/2 cursor-ew-resize')}
        {handle('e', '-right-1.5 top-1/2 h-5 w-3 -translate-y-1/2 cursor-ew-resize')}
        {handle('skew-x', '-bottom-7 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 cursor-ew-resize bg-cyan-300', 'Horizontal skew')}
        {handle('skew-y', '-right-7 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 cursor-ns-resize bg-cyan-300', 'Vertical skew')}
      </div>
      <div className="absolute z-30 flex gap-1 rounded-lg border border-slate-700 bg-slate-950/95 p-1 shadow-xl" style={{ left: Math.max(4, state.x), top: Math.max(4, state.y - 92) }}>
        <button onClick={() => setAndCommit({ ...state, flipX: !state.flipX })} className={`rounded p-1.5 ${state.flipX ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`} title="Flip horizontally"><FlipHorizontal size={13} /></button>
        <button onClick={() => setAndCommit({ ...state, flipY: !state.flipY })} className={`rounded p-1.5 ${state.flipY ? 'bg-cyan-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`} title="Flip vertically"><FlipVertical size={13} /></button>
        <span className="self-center px-1 font-mono text-[9px] text-slate-500">{Math.round(state.width)} x {Math.round(state.height)} | {state.rotation.toFixed(1)}°</span>
      </div>
    </div>
  );
};
