import React from 'react';
import {
  Layers,
  Eye,
  EyeOff,
  Trash2,
  Copy,
  Plus,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
} from 'lucide-react';
import { CanvasLayer, BlendMode } from '../types/canvas';

interface LayersPanelProps {
  isOpen: boolean;
  onClose: () => void;
  layers: CanvasLayer[];
  activeLayerId: string | null;
  onSelectLayer: (id: string) => void;
  onAddLayer: () => void;
  onDuplicateLayer: (id: string) => void;
  onRemoveLayer: (id: string) => void;
  onToggleVisibility: (id: string, current: boolean) => void;
  onOpacityChange: (id: string, opacity: number) => void;
  onBlendModeChange: (id: string, mode: BlendMode) => void;
  onMergeDown: (id: string) => void;
  onReorder: (startIndex: number, endIndex: number) => void;
}

export const LayersPanel: React.FC<LayersPanelProps> = ({
  isOpen,
  onClose,
  layers,
  activeLayerId,
  onSelectLayer,
  onAddLayer,
  onDuplicateLayer,
  onRemoveLayer,
  onToggleVisibility,
  onOpacityChange,
  onBlendModeChange,
  onMergeDown,
  onReorder,
}) => {
  if (!isOpen) return null;

  const activeLayer = layers.find(l => l.id === activeLayerId);

  return (
    <div className="w-64 bg-slate-900 border-l border-slate-800 flex flex-col h-full shrink-0 select-none z-20 shadow-2xl">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-indigo-400" />
          <span className="text-xs font-bold text-slate-200">Layers</span>
          <span className="bg-slate-800 text-slate-400 text-[10px] font-mono px-1.5 py-0.5 rounded-full font-bold">
            {layers.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={onAddLayer}
            className="p-1 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded-lg transition-colors cursor-pointer"
            title="Add Layer"
          >
            <Plus size={14} />
          </button>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <ChevronLeft size={14} />
          </button>
        </div>
      </div>

      {/* Active Layer Controls (Opacity & Blend Mode) */}
      {activeLayer && (
        <div className="p-3 border-b border-slate-800/80 space-y-2 bg-slate-950/40 text-xs">
          {/* Opacity Slider */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase font-bold text-slate-500">Opacity:</span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(activeLayer.opacity * 100)}
              onChange={e => onOpacityChange(activeLayer.id, Number(e.target.value) / 100)}
              className="flex-1 accent-indigo-500 h-1 cursor-pointer"
            />
            <span className="text-[10px] font-mono text-slate-300 w-8 text-right">
              {Math.round(activeLayer.opacity * 100)}%
            </span>
          </div>

          {/* Blend Mode */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase font-bold text-slate-500">Blend:</span>
            <select
              value={activeLayer.blendMode}
              onChange={e => onBlendModeChange(activeLayer.id, e.target.value as BlendMode)}
              className="bg-slate-950 border border-slate-800 text-slate-300 text-[11px] rounded-lg px-2 py-1 focus:outline-none cursor-pointer flex-1"
            >
              <option value="source-over">Normal</option>
              <option value="multiply">Multiply</option>
              <option value="screen">Screen</option>
              <option value="overlay">Overlay</option>
              <option value="darken">Darken</option>
              <option value="lighten">Lighten</option>
              <option value="color-dodge">Color Dodge</option>
              <option value="color-burn">Color Burn</option>
            </select>
          </div>
        </div>
      )}

      {/* Layers List (Top to Bottom) */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {layers.map((layer, index) => {
          const isActive = layer.id === activeLayerId;
          return (
            <div
              key={layer.id}
              onClick={() => onSelectLayer(layer.id)}
              className={`p-2 rounded-xl flex items-center justify-between gap-2 border transition-all cursor-pointer ${
                isActive
                  ? 'bg-slate-800/90 border-indigo-500/60 shadow-sm'
                  : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800/40'
              }`}
            >
              {/* Visibility Eye */}
              <button
                onClick={e => {
                  e.stopPropagation();
                  onToggleVisibility(layer.id, !layer.visible);
                }}
                className={`p-1 rounded transition-colors ${
                  layer.visible ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-400'
                }`}
                title={layer.visible ? 'Hide Layer' : 'Show Layer'}
              >
                {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>

              {/* Layer Title */}
              <span className="flex-1 text-xs font-semibold text-slate-200 truncate">
                {layer.name}
              </span>

              {/* Reorder / Action Buttons */}
              <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                {index > 0 && (
                  <button
                    onClick={() => onReorder(index, index - 1)}
                    className="p-1 text-slate-500 hover:text-white rounded hover:bg-slate-700 transition-colors"
                    title="Move Up"
                  >
                    <ArrowUp size={11} />
                  </button>
                )}
                {index < layers.length - 1 && (
                  <button
                    onClick={() => onReorder(index, index + 1)}
                    className="p-1 text-slate-500 hover:text-white rounded hover:bg-slate-700 transition-colors"
                    title="Move Down"
                  >
                    <ArrowDown size={11} />
                  </button>
                )}
                <button
                  onClick={() => onDuplicateLayer(layer.id)}
                  className="p-1 text-slate-500 hover:text-white rounded hover:bg-slate-700 transition-colors"
                  title="Duplicate Layer"
                >
                  <Copy size={11} />
                </button>
                {layers.length > 1 && (
                  <button
                    onClick={() => onRemoveLayer(layer.id)}
                    className="p-1 text-slate-500 hover:text-rose-400 rounded hover:bg-rose-950/40 transition-colors"
                    title="Delete Layer"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
