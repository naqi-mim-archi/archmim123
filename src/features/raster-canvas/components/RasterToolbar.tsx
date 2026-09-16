import React from 'react';
import {
  MousePointer,
  Brush,
  Move,
  Type,
  Layers,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Eye,
  Download,
  Square,
  Lasso,
  Wand2,
  Eraser,
  RotateCcw,
  Upload,
  Image as ImageIcon,
  Crop,
  Check,
  X,
  Pencil,
} from 'lucide-react';
import { ToolType, SelectSubTool, DrawSubTool } from '../types/canvas';

interface RasterToolbarProps {
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  selectSubTool: SelectSubTool;
  setSelectSubTool: (subTool: SelectSubTool) => void;
  drawSubTool: DrawSubTool;
  setDrawSubTool: (subTool: DrawSubTool) => void;
  brushSize: number;
  setBrushSize: (size: number | ((prev: number) => number)) => void;
  brushColor: string;
  setBrushColor: (color: string) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitScreen: () => void;
  isComparing: boolean;
  setIsComparing: (c: boolean) => void;
  onExportClick: () => void;
  onUploadClick: () => void;
  onLoadFromStudioClick?: () => void;
}

export const RasterToolbar: React.FC<RasterToolbarProps> = ({
  activeTool,
  setActiveTool,
  selectSubTool,
  setSelectSubTool,
  drawSubTool,
  setDrawSubTool,
  brushSize,
  setBrushSize,
  brushColor,
  setBrushColor,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  onZoomIn,
  onZoomOut,
  onFitScreen,
  isComparing,
  setIsComparing,
  onExportClick,
  onUploadClick,
  onLoadFromStudioClick,
}) => {
  const mainTools: { id: ToolType; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { id: 'select', label: 'Select', icon: MousePointer },
    { id: 'crop', label: 'Crop', icon: Crop },
    { id: 'draw', label: 'Scribble', icon: Pencil },
    { id: 'transform', label: 'Transform', icon: Move },
    { id: 'text', label: 'Text', icon: Type },
    { id: 'layers', label: 'Layers', icon: Layers },
  ];

  return (
    <div className="bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-2 flex items-center justify-between gap-4 select-none shrink-0 z-20">
      {/* 1. Main Tools Group */}
      <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800/80">
        {mainTools.map(tool => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => setActiveTool(tool.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title={tool.label}
            >
              <Icon size={14} />
              <span>{tool.label}</span>
            </button>
          );
        })}
      </div>

      {/* 2. Tool Options Sub-Bar (Contextual Controls) */}
      <div className="flex-1 flex items-center gap-3 overflow-x-auto scrollbar-none">
        {activeTool === 'crop' && (
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <span className="text-[10px] uppercase font-bold text-indigo-400 mr-1">Crop Mode:</span>
            <span className="text-[11px] text-slate-400">
              Drag handles on canvas to crop. Press <kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px] text-slate-200">Enter</kbd> to apply.
            </span>
          </div>
        )}

        {activeTool === 'select' && (
          <div className="flex items-center gap-1.5 text-xs text-slate-300">
            <span className="text-[10px] uppercase font-bold text-slate-500 mr-1">Selection Mode:</span>
            {[
              { id: 'brush', label: 'Brush Mask', icon: Brush },
              { id: 'rect', label: 'Rectangle', icon: Square },
              { id: 'lasso', label: 'Lasso', icon: Lasso },
              { id: 'magic', label: 'Magic Wand', icon: Wand2 },
            ].map(sub => {
              const SubIcon = sub.icon;
              return (
                <button
                  key={sub.id}
                  onClick={() => setSelectSubTool(sub.id as SelectSubTool)}
                  className={`px-2 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-all cursor-pointer ${
                    selectSubTool === sub.id
                      ? 'bg-slate-800 text-indigo-400 border border-indigo-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <SubIcon size={12} />
                  <span>{sub.label}</span>
                </button>
              );
            })}

            {selectSubTool === 'brush' && (
              <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500">Brush Size:</span>
                <input
                  type="range"
                  min="4"
                  max="120"
                  value={brushSize}
                  onChange={e => setBrushSize(Number(e.target.value))}
                  className="w-20 accent-indigo-500 h-1 cursor-pointer"
                />
                <span className="text-[10px] font-mono text-slate-400 w-8">{brushSize}px</span>
              </div>
            )}
          </div>
        )}

        {activeTool === 'draw' && (
          <div className="flex items-center gap-3 text-xs text-slate-300">
            <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
              <button
                onClick={() => {
                  setDrawSubTool('pen');
                  setBrushSize(4);
                }}
                className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 cursor-pointer ${
                  drawSubTool === 'pen' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Pencil size={12} />
                <span>Pen</span>
              </button>
              <button
                onClick={() => setDrawSubTool('eraser')}
                className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 cursor-pointer ${
                  drawSubTool === 'eraser' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Eraser size={12} />
                <span>Eraser</span>
              </button>
            </div>

            {/* Brush Size Slider */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-bold text-slate-500">Size:</span>
              <input
                type="range"
                min="2"
                max="120"
                value={brushSize}
                onChange={e => setBrushSize(Number(e.target.value))}
                className="w-20 accent-indigo-500 h-1 cursor-pointer"
              />
              <span className="font-mono text-[10px] text-slate-400 w-6">{brushSize}px</span>
            </div>

            {/* Brush Color Picker */}
            {drawSubTool !== 'eraser' && (
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] uppercase font-bold text-slate-500">Color:</span>
                <input
                  type="color"
                  value={brushColor}
                  onChange={e => setBrushColor(e.target.value)}
                  className="w-5 h-5 rounded cursor-pointer border-0 bg-transparent"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Global Canvas Actions (Undo/Redo, Zoom, Compare, Export) */}
      <div className="flex items-center gap-2">
        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="p-1.5 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 cursor-pointer"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={14} />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="p-1.5 rounded text-slate-400 hover:text-white disabled:opacity-30 disabled:hover:text-slate-400 cursor-pointer"
            title="Redo (Ctrl+Y)"
          >
            <Redo2 size={14} />
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 bg-slate-950 px-1.5 py-0.5 rounded-lg border border-slate-800 text-xs">
          <button onClick={onZoomOut} className="p-1 text-slate-400 hover:text-white cursor-pointer" title="Zoom Out">
            <ZoomOut size={13} />
          </button>
          <span className="font-mono text-[10px] text-slate-300 w-10 text-center font-bold">
            {Math.round(zoom * 100)}%
          </span>
          <button onClick={onZoomIn} className="p-1 text-slate-400 hover:text-white cursor-pointer" title="Zoom In">
            <ZoomIn size={13} />
          </button>
          <button onClick={onFitScreen} className="p-1 text-slate-400 hover:text-white cursor-pointer" title="Fit to Screen">
            <Maximize2 size={13} />
          </button>
        </div>

        {/* Upload Image Button */}
        <button
          onClick={onUploadClick}
          className="bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-indigo-600/60 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
          title="Upload image from computer to edit"
        >
          <Upload size={13} className="text-indigo-400" />
          <span>Upload</span>
        </button>

        {/* Load from render outputs button */}
        {onLoadFromStudioClick && (
          <button
            onClick={onLoadFromStudioClick}
            className="bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-purple-600/60 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
            title="Load image from render outputs and references"
          >
            <ImageIcon size={13} className="text-purple-400" />
            <span>Renders</span>
          </button>
        )}

        {/* Before / After Compare Button */}
        <button
          onMouseDown={() => setIsComparing(true)}
          onMouseUp={() => setIsComparing(false)}
          onMouseLeave={() => setIsComparing(false)}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 border transition-all cursor-pointer ${
            isComparing
              ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
              : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
          }`}
          title="Hold to view original before edits"
        >
          <Eye size={13} />
          <span>Compare</span>
        </button>

        {/* Export Button */}
        <button
          onClick={onExportClick}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/20 cursor-pointer"
        >
          <Download size={13} />
          <span>Export</span>
        </button>
      </div>
    </div>
  );
};
