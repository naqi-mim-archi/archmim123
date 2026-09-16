import React from 'react';
import { Sparkles, Move, Scissors, XCircle } from 'lucide-react';
import { Point, Rect } from '../types/canvas';

interface SelectionFloatingBarProps {
  bounds: Rect | null;
  zoom: number;
  pan: Point;
  onOpenAiEdit: () => void;
  onTransform: () => void;
  onCutout: () => void;
  onClear: () => void;
}

export const SelectionFloatingBar: React.FC<SelectionFloatingBarProps> = ({
  bounds,
  zoom,
  pan,
  onOpenAiEdit,
  onTransform,
  onCutout,
  onClear,
}) => {
  if (!bounds) return null;

  const screenX = bounds.x * zoom + pan.x + (bounds.width * zoom) / 2;
  const screenY = bounds.y * zoom + pan.y - 48;

  return (
    <div
      style={{ left: screenX, top: Math.max(12, screenY), transform: 'translateX(-50%)' }}
      className="absolute z-30 flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-900/95 p-1 shadow-2xl backdrop-blur-md"
    >
      <button onClick={onOpenAiEdit} className="flex cursor-pointer items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-500" title="Generate an AI edit inside this selection">
        <Sparkles size={12} /> <span>AI Edit</span>
      </button>
      <button onClick={onTransform} className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-300 hover:bg-slate-800 hover:text-white" title="Transform selection">
        <Move size={12} /> <span>Transform</span>
      </button>
      <button onClick={onCutout} className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-300 hover:bg-slate-800 hover:text-white" title="Extract selection as a transparent layer">
        <Scissors size={12} /> <span>Cutout</span>
      </button>
      <button onClick={onClear} className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium text-slate-400 hover:bg-slate-800 hover:text-white" title="Clear selection">
        <XCircle size={12} /> <span>Clear</span>
      </button>
    </div>
  );
};
