import React, { useEffect, useRef, useState } from 'react';
import { Check, Move, RotateCw, X } from 'lucide-react';
import { TextBoxState, TextProperties } from '../types/canvas';

type Interaction = 'draw' | 'move' | 'rotate' | 'skew-x' | 'skew-y' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

interface Props {
  active: boolean;
  canvasWidth: number;
  canvasHeight: number;
  textProps: TextProperties;
  initialBox?: TextBoxState | null;
  onTextChange: (text: string) => void;
  onCommit: (box: TextBoxState) => void;
  onCancel: () => void;
}

const DEFAULT_BOX: TextBoxState = { x: 0, y: 0, width: 0, height: 0, rotation: 0, skewX: 0, skewY: 0 };

export const TextOverlay: React.FC<Props> = ({
  active,
  canvasWidth,
  canvasHeight,
  textProps,
  initialBox,
  onTextChange,
  onCommit,
  onCancel,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const interactionRef = useRef<{
    type: Interaction;
    start: { x: number; y: number };
    box: TextBoxState;
    startAngle?: number;
  } | null>(null);
  const [box, setBox] = useState<TextBoxState | null>(initialBox ? { ...initialBox } : null);

  useEffect(() => {
    setBox(initialBox ? { ...initialBox } : null);
    if (initialBox) requestAnimationFrame(() => textareaRef.current?.focus());
  }, [initialBox]);

  useEffect(() => {
    if (!active) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onCancel(); }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && box) {
        event.preventDefault();
        onCommit(box);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [active, box, onCancel, onCommit]);

  if (!active) return null;

  const pointFromEvent = (event: React.PointerEvent) => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(canvasWidth, (event.clientX - rect.left) * canvasWidth / rect.width)),
      y: Math.max(0, Math.min(canvasHeight, (event.clientY - rect.top) * canvasHeight / rect.height)),
    };
  };

  const begin = (event: React.PointerEvent, type: Interaction) => {
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromEvent(event);
    const current = box || { ...DEFAULT_BOX, x: point.x, y: point.y };
    const center = { x: current.x + current.width / 2, y: current.y + current.height / 2 };
    interactionRef.current = {
      type,
      start: point,
      box: { ...current },
      startAngle: Math.atan2(point.y - center.y, point.x - center.x) * 180 / Math.PI - current.rotation,
    };
    rootRef.current?.setPointerCapture(event.pointerId);
    if (type === 'draw') setBox(current);
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    if (!box) begin(event, 'draw');
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    event.preventDefault();
    event.stopPropagation();
    const point = pointFromEvent(event);
    const dx = point.x - interaction.start.x;
    const dy = point.y - interaction.start.y;
    const start = interaction.box;
    let next = { ...start };

    if (interaction.type === 'draw') {
      next = {
        ...start,
        x: Math.min(interaction.start.x, point.x),
        y: Math.min(interaction.start.y, point.y),
        width: Math.abs(dx),
        height: Math.abs(dy),
      };
    } else if (interaction.type === 'move') {
      next.x = Math.max(-start.width + 10, Math.min(canvasWidth - 10, start.x + dx));
      next.y = Math.max(-start.height + 10, Math.min(canvasHeight - 10, start.y + dy));
    } else if (interaction.type === 'rotate') {
      const center = { x: start.x + start.width / 2, y: start.y + start.height / 2 };
      next.rotation = Math.round((Math.atan2(point.y - center.y, point.x - center.x) * 180 / Math.PI - (interaction.startAngle || 0)) * 10) / 10;
    } else if (interaction.type === 'skew-x') {
      next.skewX = Math.max(-60, Math.min(60, start.skewX + dx * .2));
    } else if (interaction.type === 'skew-y') {
      next.skewY = Math.max(-60, Math.min(60, start.skewY + dy * .2));
    } else {
      if (interaction.type.includes('w')) { next.x = start.x + dx; next.width = start.width - dx; }
      if (interaction.type.includes('e')) next.width = start.width + dx;
      if (interaction.type.includes('n')) { next.y = start.y + dy; next.height = start.height - dy; }
      if (interaction.type.includes('s')) next.height = start.height + dy;
      if (next.width < 50) { if (interaction.type.includes('w')) next.x -= 50 - next.width; next.width = 50; }
      if (next.height < 30) { if (interaction.type.includes('n')) next.y -= 30 - next.height; next.height = 30; }
    }
    setBox(next);
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    const interaction = interactionRef.current;
    if (!interaction) return;
    interactionRef.current = null;
    try { rootRef.current?.releasePointerCapture(event.pointerId); } catch {}
    if (interaction.type === 'draw') {
      setBox(current => {
        if (!current || current.width < 12 || current.height < 12) {
          const point = pointFromEvent(event);
          return { x: Math.max(0, point.x - 150), y: Math.max(0, point.y - 40), width: 300, height: 80, rotation: 0, skewX: 0, skewY: 0 };
        }
        return current;
      });
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  };

  const handle = (type: Interaction, className: string, title?: string) => (
    <button
      type="button"
      title={title}
      onPointerDown={event => begin(event, type)}
      className={`absolute z-20 block border border-cyan-600 bg-white shadow-sm ${className}`}
    />
  );

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-50 cursor-text touch-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {!box && (
        <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2 rounded-lg border border-cyan-400/30 bg-slate-950/90 px-3 py-2 text-[11px] font-semibold text-cyan-100 shadow-xl">
          Click and drag to draw a text frame
        </div>
      )}
      {box && (
        <>
          <div
            className="absolute border border-cyan-400 shadow-[0_0_0_1px_rgba(15,23,42,.65)]"
            style={{
              left: box.x,
              top: box.y,
              width: box.width,
              height: box.height,
              transform: `rotate(${box.rotation}deg) skew(${box.skewX}deg, ${box.skewY}deg)`,
              transformOrigin: 'center',
            }}
            onPointerDown={event => event.stopPropagation()}
          >
            <textarea
              ref={textareaRef}
              value={textProps.text}
              placeholder="Type here..."
              onChange={event => onTextChange(event.target.value)}
              onPointerDown={event => event.stopPropagation()}
              spellCheck
              className="absolute inset-0 h-full w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
              style={{
                color: textProps.color,
                fontFamily: `"${textProps.fontFamily}", sans-serif`,
                fontSize: textProps.fontSize,
                fontWeight: textProps.fontWeight,
                fontStyle: textProps.fontStyle,
                textDecoration: textProps.textDecoration,
                textTransform: textProps.textTransform,
                textAlign: textProps.align,
                letterSpacing: textProps.letterSpacing,
                lineHeight: textProps.lineHeight,
                opacity: (textProps.opacity ?? 100) / 100,
                whiteSpace: 'pre-wrap',
                overflowWrap: 'break-word',
              }}
            />
            <button type="button" onPointerDown={event => begin(event, 'move')} className="absolute -top-7 left-1/2 flex h-6 -translate-x-1/2 cursor-move items-center gap-1 rounded bg-slate-950 px-2 text-[9px] font-bold text-slate-200 shadow"><Move size={11} /> Move</button>
            <div className="absolute -top-12 left-1/2 h-5 w-px -translate-x-1/2 bg-cyan-400" />
            <button type="button" title="Rotate text" onPointerDown={event => begin(event, 'rotate')} className="absolute -top-[62px] left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border border-cyan-500 bg-slate-950 text-cyan-300"><RotateCw size={11} /></button>
            {handle('nw', '-left-1.5 -top-1.5 h-3 w-3 cursor-nwse-resize')}
            {handle('ne', '-right-1.5 -top-1.5 h-3 w-3 cursor-nesw-resize')}
            {handle('sw', '-bottom-1.5 -left-1.5 h-3 w-3 cursor-nesw-resize')}
            {handle('se', '-bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize')}
            {handle('n', '-top-1.5 left-1/2 h-3 w-5 -translate-x-1/2 cursor-ns-resize')}
            {handle('s', '-bottom-1.5 left-1/2 h-3 w-5 -translate-x-1/2 cursor-ns-resize')}
            {handle('w', '-left-1.5 top-1/2 h-5 w-3 -translate-y-1/2 cursor-ew-resize')}
            {handle('e', '-right-1.5 top-1/2 h-5 w-3 -translate-y-1/2 cursor-ew-resize')}
            {handle('skew-x', '-bottom-7 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 cursor-ew-resize bg-cyan-300', 'Drag horizontally to skew')}
            {handle('skew-y', '-right-7 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 cursor-ns-resize bg-cyan-300', 'Drag vertically to skew')}
          </div>
          <div className="absolute z-30 flex gap-1 rounded-lg border border-slate-700 bg-slate-950/95 p-1 shadow-xl" style={{ left: Math.max(4, box.x), top: Math.max(4, box.y - 94) }} onPointerDown={event => event.stopPropagation()}>
            <button onClick={() => onCommit(box)} disabled={!textProps.text.trim()} className="flex items-center gap-1 rounded-md bg-cyan-600 px-2.5 py-1.5 text-[10px] font-bold text-white disabled:opacity-40"><Check size={12} /> Apply</button>
            <button onClick={onCancel} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-bold text-slate-300 hover:bg-slate-800"><X size={12} /> Cancel</button>
            <span className="self-center px-1 font-mono text-[9px] text-slate-500">{Math.round(box.width)} x {Math.round(box.height)} | {box.rotation.toFixed(1)}°</span>
          </div>
        </>
      )}
    </div>
  );
};
