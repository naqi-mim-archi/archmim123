import React, { useState, useEffect } from 'react';
import {
  MousePointer,
  Brush,
  Sparkles,
  Move,
  Type,
  Layers as LayersIcon,
  Upload,
  Image as ImageIcon,
  Download,
  RotateCcw,
  Trash2,
  Copy,
  Plus,
  ArrowDown,
  Eye,
  EyeOff,
  Square,
  Lasso,
  Wand2,
  Eraser,
  Sun,
  Moon,
  Droplets,
  Check,
  X,
  Palette,
  FlipHorizontal,
  FlipVertical,
  Maximize2,
  ArrowUp,
  ArrowRight,
  ArrowLeft,
  RotateCw,
  RotateCcw as RotateCcwIcon,
  Scaling,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Bold,
  Italic,
  Underline,
  Crop as CropIcon,
  Ratio,
  SlidersHorizontal,
  ImagePlus,
  Folder,
  FolderOpen,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  Pencil,
} from 'lucide-react';
import { ToolType, SelectSubTool, DrawSubTool, BlendMode, ImageAdjustments } from '../types/canvas';
import { ARCHITECTURAL_PRESETS, AiActionType } from '../types/aiEdit';
import { RasterCanvasStore } from '../state/useRasterCanvasStore';
import { StudioImageItem } from './RasterCanvasView';
import { AdjustmentsPanel } from './AdjustmentsPanel';
import { CanvasEngine } from '../core/CanvasEngine';

interface RasterSidebarProps {
  store: RasterCanvasStore;
  hasUserImage: boolean;
  onUploadClick: () => void;
  onPlaceUpload: () => void;
  availableStudioImages: StudioImageItem[];
  onOpenStudioModal: () => void;
  onOpenAiEdit: (prompt?: string, action?: AiActionType, maskBase64?: string, baseImageBase64?: string, referenceImageBase64?: string) => void;
  onGenerateOutpaint: (prompt: string, model: string) => Promise<void>;
  onExportClick: () => void;
  compositeCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  onDeleteSelection: () => void;
  onCutout: () => void;
  onInvertSelection: () => void;
}

export const RasterSidebar: React.FC<RasterSidebarProps> = ({
  store,
  hasUserImage,
  onUploadClick,
  onPlaceUpload,
  availableStudioImages,
  onOpenStudioModal,
  onOpenAiEdit,
  onGenerateOutpaint,
  onExportClick,
  compositeCanvasRef,
  onDeleteSelection,
  onCutout,
  onInvertSelection,
}) => {
  const [textContent, setTextContent] = useState<string>('Architectural Note');
  const [textSize, setTextSize] = useState<number>(24);
  const [selectedColorPreset, setSelectedColorPreset] = useState<string>('#ffffff');
  const [outpaintPrompt, setOutpaintPrompt] = useState<string>('Continue the scene seamlessly, matching the existing architecture, perspective, lighting, and materials.');
  const [outpaintModel, setOutpaintModel] = useState<string>('gemini-3-pro-image');
  const [isOutpainting, setIsOutpainting] = useState<boolean>(false);
  const [outpaintError, setOutpaintError] = useState<string | null>(null);
  const [aiTask, setAiTask] = useState<AiActionType>('replace');
  const [aiPrompt, setAiPrompt] = useState<string>('');

  const handleGenerateOutpaint = async () => {
    if (!store.selection.active || !store.selection.maskCanvas || isOutpainting) return;
    setIsOutpainting(true);
    setOutpaintError(null);
    try {
      await onGenerateOutpaint(outpaintPrompt, outpaintModel);
    } catch (error) {
      setOutpaintError(error instanceof Error ? error.message : 'Outpaint generation failed.');
    } finally {
      setIsOutpainting(false);
    }
  };

  // Load Google Font dynamically
  useEffect(() => {
    if (store.activeTool !== 'text' || !store.textProps?.fontFamily) return;
    
    const font = store.textProps.fontFamily;
    const linkId = `google-font-${font.replace(/\s+/g, '-')}`;
    if (!document.getElementById(linkId)) {
      const link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      link.href = `https://fonts.googleapis.com/css2?family=${font.replace(/\s+/g, '+')}:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,700&display=swap`;
      document.head.appendChild(link);
    }
  }, [store.textProps?.fontFamily, store.activeTool]);

  const mainTools: { id: ToolType; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
    { id: 'select', label: 'Select', icon: MousePointer },
    { id: 'outpaint', label: 'Outpaint', icon: Maximize2 },
    { id: 'ai_edit', label: 'AI Edit', icon: Sparkles },
    { id: 'draw', label: 'Scribble', icon: Pencil },
    { id: 'rotate', label: 'Geometry', icon: CropIcon },
    { id: 'adjust', label: 'Adjust', icon: SlidersHorizontal },
    { id: 'place', label: 'Place', icon: ImagePlus },
    { id: 'transform', label: 'Transform', icon: Move },
    { id: 'text', label: 'Text', icon: Type },
    { id: 'layers', label: 'Layers', icon: LayersIcon },
  ];

  const colorPalette = [
    '#ffffff', '#000000', '#f43f5e', '#3b82f6', 
    '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'
  ];

  const activeLayer = store.layers.find(l => l.id === store.activeLayerId);
  const activePlacedLayer = activeLayer?.placedItem ? activeLayer : null;
  const hasOutpaintArea = Boolean(store.cropState?.isExtending && (
    store.cropState.cropRect.x < 0 ||
    store.cropState.cropRect.y < 0 ||
    store.cropState.cropRect.x + store.cropState.cropRect.width > store.width ||
    store.cropState.cropRect.y + store.cropState.cropRect.height > store.height
  ));

  return (
    <div className="w-[380px] border-r border-slate-800 h-full bg-slate-900/90 flex flex-col shrink-0 overflow-hidden z-20 shadow-2xl select-none font-sans text-xs">
      {/* 1. Header with Title, Close, and 4 Category Switch Buttons */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/80 flex flex-col gap-2.5 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-indigo-400" />
            <h3 className="text-xs font-bold text-slate-100 tracking-wide">Rendering Workflows</h3>
          </div>
        </div>

      </div>

      {/* 2. Scrollable Body: Image Source, Tools, and Tool Parameters */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 scrollbar-thin">
        {/* A. Image Source / Upload Box */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-wider font-bold text-slate-400">Image Source</span>
            <span className="text-[9px] font-mono text-indigo-400">
              {store.width} × {store.height}px
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onUploadClick}
              className="flex-1 py-2 px-3 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all hover:border-indigo-500/60"
            >
              <Upload size={13} className="text-indigo-400" />
              <span>{hasUserImage ? 'Replace Image' : 'Upload Image / Plan'}</span>
            </button>

            {availableStudioImages.length > 0 && (
              <button
                onClick={onOpenStudioModal}
                className="py-2 px-2.5 bg-indigo-950/50 hover:bg-indigo-900/60 text-indigo-300 border border-indigo-800/50 rounded-xl text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition-all"
                title={`Load from render outputs (${availableStudioImages.length})`}
              >
                <ImageIcon size={13} />
                <span>Renders ({availableStudioImages.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* B. Main editor tools */}
        <div>
          <label className="block text-[9px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Editing Tools</label>
          <div className="grid grid-cols-4 gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
            {mainTools.map(tool => {
              const Icon = tool.icon;
              const isActive = store.activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  onClick={() => {
                    store.setActiveTool(tool.id);
                    if (tool.id === 'draw') {
                      store.setDrawSubTool('pen');
                      store.setBrushSize(4);
                      store.setBrushOpacity(100);
                    }
                  }}
                  className={`py-2 px-0.5 rounded-lg text-[10px] font-bold flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                  title={tool.label}
                >
                  <Icon size={14} />
                  <span className="truncate w-full text-center leading-tight text-[9px]">{tool.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* C. Dynamic Active Tool Parameters Panel */}
        <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3 space-y-3">
          {store.activeTool === 'adjust' && (
            <AdjustmentsPanel store={store} embedded />
          )}

          {store.activeTool === 'rotate' && (
            <div className="mb-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Geometry & Framing</span>
                <button
                  type="button"
                  onPointerDown={() => store.setIsComparing(true)}
                  onPointerUp={() => store.setIsComparing(false)}
                  onPointerLeave={() => store.setIsComparing(false)}
                  className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-[9px] font-bold text-slate-300 hover:text-white"
                >
                  Hold Before
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
                {([
                  ['crop', 'Crop'],
                  ['rotate', 'Rotate'],
                  ['perspective', 'Perspective'],
                ] as const).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => store.setGeometryMode(mode)}
                    className={`rounded-lg px-2 py-2 text-[10px] font-bold transition-colors ${store.geometryMode === mode ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Geometry: CROP */}
          {store.activeTool === 'rotate' && store.geometryMode === 'crop' && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-indigo-300">Crop & Aspect Ratio</span>
                <span className="text-[9px] font-mono text-slate-400">
                  {store.cropState ? `${Math.round(store.cropState.cropRect.width)} × ${Math.round(store.cropState.cropRect.height)}` : `${store.width} × ${store.height}`} px
                </span>
              </div>

              {/* Aspect Ratio Presets */}
              <div className="space-y-1.5">
                <span className="text-[10px] text-slate-400">Preset Ratio</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: null, label: 'Freeform' },
                    { id: 'original', label: 'Original' },
                    { id: '1:1', label: '1:1 Square' },
                    { id: '16:9', label: '16:9 Landscape' },
                    { id: '9:16', label: '9:16 Portrait' },
                    { id: '4:3', label: '4:3 Standard' },
                    { id: '3:4', label: '3:4 Portrait' },
                    { id: '3:2', label: '3:2 Photo' },
                    { id: '2:3', label: '2:3 Photo' },
                    { id: '4:5', label: '4:5 Social' },
                    { id: '5:4', label: '5:4 Social' },
                    { id: '21:9', label: '21:9 Ultra' },
                  ].map(preset => {
                    const isSelected = (store.cropState?.aspectRatio || null) === preset.id;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => store.setCropAspectRatio(preset.id)}
                        className={`py-1.5 px-2 rounded-lg text-[10px] font-semibold transition-all cursor-pointer truncate ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold'
                            : 'bg-slate-900/80 text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800'
                        }`}
                        title={preset.label}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Orientation Switcher & Actions */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    const cur = store.cropState?.aspectRatio;
                    if (cur === '16:9') store.setCropAspectRatio('9:16');
                    else if (cur === '9:16') store.setCropAspectRatio('16:9');
                    else if (cur === '4:3') store.setCropAspectRatio('3:4');
                    else if (cur === '3:4') store.setCropAspectRatio('4:3');
                    else if (cur === '3:2') store.setCropAspectRatio('2:3');
                    else if (cur === '2:3') store.setCropAspectRatio('3:2');
                    else if (cur === '4:5') store.setCropAspectRatio('5:4');
                    else if (cur === '5:4') store.setCropAspectRatio('4:5');
                    else if (store.cropState) {
                      const { width: cw, height: ch, x: cx, y: cy } = store.cropState.cropRect;
                      store.updateCropRect({
                        x: cx,
                        y: cy,
                        width: Math.min(store.width, ch),
                        height: Math.min(store.height, cw),
                      });
                    }
                  }}
                  className="py-1.5 px-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  title="Swap orientation between Landscape and Portrait"
                >
                  <Ratio size={13} className="text-indigo-400" />
                  <span>Flip Ratio (W↔H)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    store.updateCropRect({ x: 0, y: 0, width: store.width, height: store.height });
                    store.setCropAspectRatio(null);
                  }}
                  className="py-1.5 px-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  title="Reset to full canvas"
                >
                  <RotateCcw size={13} className="text-amber-400" />
                  <span>Reset Box</span>
                </button>
              </div>

              {/* Apply / Cancel Crop Action Buttons */}
              <div className="pt-2 border-t border-slate-800 space-y-1.5">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => store.applyCrop()}
                    className="py-2 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer transition-all"
                  >
                    <Check size={14} strokeWidth={2.5} />
                    <span>Apply Crop</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => store.cancelCrop()}
                    className="py-2 px-3 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                  >
                    <X size={14} />
                    <span>Cancel</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 text-center leading-tight">
                  Drag the corner handles or edges on canvas. Press <kbd className="px-1 py-0.5 bg-slate-800 rounded text-[9px] text-slate-200">Enter</kbd> to apply.
                </p>
              </div>
            </div>
          )}

          {/* Tool: OUTPAINT */}
          {store.activeTool === 'outpaint' && (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-sky-300">Outpaint Canvas</span>
                <span className="text-[9px] font-mono text-slate-400">{store.width} × {store.height}px</span>
              </div>

              {store.cropState?.isExtending ? (
                <>
                  <div className="rounded-xl border border-sky-800/50 bg-sky-950/30 p-2.5 text-[10px] leading-relaxed text-sky-100/80">
                    Drag any edge or corner outward. The original image remains at its exact pixel scale and the added area will be white.
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={store.applyCrop}
                      disabled={!hasOutpaintArea}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-3 py-2 text-xs font-bold text-white shadow-md shadow-sky-700/20 transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Check size={14} strokeWidth={2.5} />
                      Create Area
                    </button>
                    <button
                      type="button"
                      onClick={store.cancelCrop}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
                    >
                      <X size={14} />
                      Cancel
                    </button>
                  </div>
                  <p className="text-center text-[10px] leading-tight text-slate-500">At least one boundary must extend beyond the original image.</p>
                </>
              ) : store.selection.active && store.selection.maskCanvas ? (
                <>
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-800/50 bg-emerald-950/30 p-2.5 text-[10px] text-emerald-200">
                    <Check size={13} />
                    Added white area auto-selected and ready for AI outpaint.
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">AI Model</label>
                    <select
                      value={outpaintModel}
                      onChange={e => setOutpaintModel(e.target.value)}
                      className="w-full cursor-pointer rounded-lg border border-slate-800 bg-slate-900 p-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                      <option value="gemini-3-pro-image">Gemini 3 Pro - Highest Quality</option>
                      <option value="gemini-3.1-flash-image">Gemini 3.1 Flash - Faster</option>
                      <option value="gemini-3.1-flash-lite-image">Gemini 3.1 Flash Lite - Fastest</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Outpaint Prompt</label>
                    <textarea
                      value={outpaintPrompt}
                      onChange={e => setOutpaintPrompt(e.target.value)}
                      rows={3}
                      placeholder="Describe what should continue into the new area..."
                      className="w-full resize-none rounded-xl border border-slate-800 bg-slate-900 p-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>

                  {outpaintError && (
                    <div className="rounded-lg border border-rose-800/60 bg-rose-950/40 p-2 text-[10px] text-rose-300">{outpaintError}</div>
                  )}

                  <button
                    type="button"
                    onClick={handleGenerateOutpaint}
                    disabled={isOutpainting || !outpaintPrompt.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-3 py-2.5 text-xs font-bold text-white shadow-lg shadow-sky-900/30 transition-all hover:from-sky-500 hover:to-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Sparkles size={14} className={isOutpainting ? 'animate-pulse' : ''} />
                    {isOutpainting ? 'Generating Outpaint...' : 'Generate Outpaint'}
                  </button>
                </>
              ) : (
                <div className="space-y-2">
                  <p className="text-[10px] leading-relaxed text-slate-400">The generated result is added as a separate layer, leaving the original image untouched.</p>
                  <button
                    type="button"
                    onClick={() => store.setActiveTool('outpaint')}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 py-2.5 text-xs font-bold text-white transition-colors hover:bg-sky-500"
                  >
                    <Maximize2 size={14} />
                    Extend Another Area
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tool: SELECT */}
          {store.activeTool === 'select' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-indigo-300">Selection Modes</span>
                {store.selection.active && (
                  <span className="text-[9px] bg-indigo-950 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-800/40">
                    Active Mask
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'brush', label: 'Brush Mask', icon: Brush },
                  { id: 'rect', label: 'Rectangle', icon: Square },
                  { id: 'lasso', label: 'Lasso', icon: Lasso },
                  { id: 'magic', label: 'Magic Wand', icon: Wand2 },
                ].map(sub => {
                  const SubIcon = sub.icon;
                  const isSel = store.selectSubTool === sub.id;
                  return (
                    <button
                      key={sub.id}
                      onClick={() => store.setSelectSubTool(sub.id as SelectSubTool)}
                      className={`p-2 rounded-lg text-[11px] font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                        isSel
                          ? 'bg-slate-800 text-indigo-400 border border-indigo-500/50 shadow-sm'
                          : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                      }`}
                    >
                      <SubIcon size={13} />
                      <span>{sub.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Brush Size Slider (for Brush Mask) */}
              {store.selectSubTool === 'brush' && (
                <div className="space-y-1.5 pt-1 border-t border-slate-800">
                  <div className="flex justify-between items-center text-[10px] text-slate-400">
                    <span>Brush Radius</span>
                    <span className="font-mono text-indigo-300 font-bold">{store.brushSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="4"
                    max="120"
                    value={store.brushSize}
                    onChange={e => store.setBrushSize(Number(e.target.value))}
                    className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
              )}

              {/* Selection Actions */}
              {store.selection.active && (
                <div className="space-y-1.5 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => onOpenAiEdit()}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-3 py-2 text-[11px] font-bold text-white shadow-lg shadow-indigo-600/20 hover:from-indigo-500 hover:to-purple-500"
                  >
                    <Sparkles size={13} />
                    AI Inpaint on Selection
                  </button>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={onInvertSelection}
                      className="py-1.5 px-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-lg text-[10px] font-semibold cursor-pointer"
                    >
                      Invert Mask
                    </button>
                    <button
                      onClick={store.clearSelection}
                      className="py-1.5 px-2 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 rounded-lg text-[10px] font-semibold cursor-pointer"
                    >
                      Clear Selection
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tool: SCRIBBLE */}
          {store.activeTool === 'draw' && (
            <div className="space-y-3">
              <span className="text-[10px] uppercase font-bold text-indigo-300 block">Scribble Tools</span>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'pen', label: 'Pen', size: 4, opacity: 100 },
                  { id: 'marker', label: 'Marker', size: 10, opacity: 100 },
                  { id: 'highlighter', label: 'Highlighter', size: 18, opacity: 35 },
                  { id: 'eraser', label: 'Eraser', size: 12, opacity: 100 },
                ].map(sub => {
                  const isSel = store.drawSubTool === sub.id;
                  return (
                    <button
                      key={sub.id}
                      onClick={() => {
                        store.setDrawSubTool(sub.id as DrawSubTool);
                        store.setBrushSize(sub.size);
                        store.setBrushOpacity(sub.opacity);
                      }}
                      className={`p-2 rounded-lg text-[11px] font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                        isSel
                          ? 'bg-slate-800 text-indigo-400 border border-indigo-500/50'
                          : 'bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 border border-transparent'
                      }`}
                    >
                      <span>{sub.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Stroke Size */}
              <div className="space-y-1.5 pt-1 border-t border-slate-800">
                <div className="flex justify-between items-center text-[10px] text-slate-400">
                  <span>Stroke Size</span>
                  <span className="font-mono text-indigo-300 font-bold">{store.brushSize}px</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="80"
                  value={store.brushSize}
                  onChange={e => store.setBrushSize(Number(e.target.value))}
                  className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>

              {/* Palette */}
              {store.drawSubTool !== 'eraser' && (
                <div className="space-y-1.5 pt-1 border-t border-slate-800">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Color Palette</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {colorPalette.map(c => (
                      <button
                        key={c}
                        onClick={() => {
                          store.setBrushColor(c);
                          setSelectedColorPreset(c);
                        }}
                        style={{ backgroundColor: c }}
                        className={`w-6 h-6 rounded-full border transition-all cursor-pointer ${
                          store.brushColor === c ? 'scale-125 border-indigo-400 shadow-md ring-2 ring-indigo-500/40' : 'border-slate-700'
                        }`}
                      />
                    ))}
                    <input
                      type="color"
                      value={store.brushColor}
                      onChange={e => store.setBrushColor(e.target.value)}
                      className="w-6 h-6 rounded-full bg-transparent border-0 cursor-pointer p-0"
                      title="Custom color"
                    />
                  </div>
                </div>
              )}

              {/* Scribble to Render */}
              <div className="space-y-2 pt-3 border-t border-slate-800">
                <span className="text-[10px] uppercase font-bold text-indigo-300 block">Scribble to Render</span>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Scribble a rough guide on a separate layer, then render it as a realistic element.
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {['Tree', 'Shrub', 'Person', 'Car', 'Sofa', 'Pendant Light'].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAiPrompt(`A photorealistic ${preset.toLowerCase()} matching the scene's lighting and perspective`)}
                      className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  placeholder="Optional: describe it, or leave blank to infer all items"
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 p-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const activeLayer = store.layers.find(layer => layer.id === store.activeLayerId);
                    if (!activeLayer) return;

                    const { width, height } = activeLayer.canvas;
                    const pixels = activeLayer.ctx.getImageData(0, 0, width, height).data;
                    let minX = width;
                    let minY = height;
                    let maxX = -1;
                    let maxY = -1;
                    for (let y = 0; y < height; y++) {
                      for (let x = 0; x < width; x++) {
                        if (pixels[(y * width + x) * 4 + 3] > 0) {
                          minX = Math.min(minX, x);
                          minY = Math.min(minY, y);
                          maxX = Math.max(maxX, x);
                          maxY = Math.max(maxY, y);
                        }
                      }
                    }
                    if (maxX < 0 || maxY < 0) {
                      alert('Please draw a scribble first.');
                      return;
                    }

                    const scribbleWidth = maxX - minX + 1;
                    const scribbleHeight = maxY - minY + 1;
                    const objectScale = Math.max(scribbleWidth, scribbleHeight);
                    const maxInfluence = Math.round(Math.min(width, height) * 0.22);
                    const sideInfluence = Math.min(
                      maxInfluence,
                      Math.max(32, Math.round(objectScale * 0.65)),
                    );
                    const topInfluence = Math.min(
                      maxInfluence,
                      Math.max(24, Math.round(objectScale * 0.4)),
                    );
                    const bottomInfluence = Math.min(
                      maxInfluence,
                      Math.max(48, Math.round(objectScale * 0.85)),
                    );
                    const mask = document.createElement('canvas');
                    mask.width = width;
                    mask.height = height;
                    const maskCtx = mask.getContext('2d');
                    if (!maskCtx) return;
                    const x = Math.max(0, minX - sideInfluence);
                    const y = Math.max(0, minY - topInfluence);
                    const right = Math.min(width, maxX + sideInfluence + 1);
                    const bottom = Math.min(height, maxY + bottomInfluence + 1);
                    maskCtx.fillStyle = '#ffffff';
                    maskCtx.beginPath();
                    maskCtx.roundRect(
                      x,
                      y,
                      right - x,
                      bottom - y,
                      Math.min(24, sideInfluence / 2),
                    );
                    maskCtx.fill();

                    const cleanScene = document.createElement('canvas');
                    CanvasEngine.compositeLayers(
                      store.layers.filter(layer => layer.id !== activeLayer.id),
                      cleanScene,
                      width,
                      height,
                    );
                    const scribbleGuide = document.createElement('canvas');
                    scribbleGuide.width = width;
                    scribbleGuide.height = height;
                    const guideContext = scribbleGuide.getContext('2d');
                    if (!guideContext) return;
                    // Match the ordinary render-upload convention.
                    guideContext.fillStyle = '#ffffff';
                    guideContext.fillRect(0, 0, width, height);
                    guideContext.globalCompositeOperation = 'source-over';
                    guideContext.drawImage(activeLayer.canvas, 0, 0);

                    store.setSelectionMask(mask, { x, y, width: right - x, height: bottom - y });
                    onOpenAiEdit(
                      aiPrompt,
                      'scribble',
                      mask.toDataURL('image/png'),
                      cleanScene.toDataURL('image/png'),
                      scribbleGuide.toDataURL('image/png'),
                    );
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-3 py-2 text-xs font-bold text-white shadow-lg shadow-purple-900/20 hover:from-purple-500 hover:to-indigo-500"
                >
                  <Sparkles size={14} />
                  Render Scribble
                </button>
              </div>

            </div>
          )}

          {/* Tool: AI EDIT */}
          {store.activeTool === 'ai_edit' && (
            <div className="space-y-3">
              <span className="block text-[10px] font-bold uppercase text-indigo-300">AI Inpainting Task</span>
              <select
                value={aiTask}
                onChange={e => setAiTask(e.target.value as AiActionType)}
                className="w-full cursor-pointer rounded-lg border border-slate-800 bg-slate-900 p-2 text-xs font-semibold text-slate-200 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="remove">Remove Object</option>
                <option value="replace">Replace Element</option>
                <option value="add">Add Architectural Element</option>
                <option value="material">Change Material / Texture</option>
                <option value="scribble">Scribble to Render</option>
              </select>
              <textarea
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                rows={2}
                placeholder={aiTask === 'remove' ? 'Describe the object to remove...' : 'Describe your architectural edit...'}
                className="w-full resize-none rounded-lg border border-slate-800 bg-slate-900 p-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
                {ARCHITECTURAL_PRESETS.slice(0, 10).map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setAiPrompt(preset.promptSnippet)}
                    className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1 text-[10px] text-slate-300 hover:border-indigo-700 hover:bg-indigo-950"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => onOpenAiEdit(aiPrompt, aiTask)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-3 py-2.5 text-xs font-bold text-white shadow-xl shadow-indigo-600/30 hover:from-indigo-500 hover:to-purple-500"
              >
                <Sparkles size={14} />
                Open AI Edit
              </button>
              {!store.selection.active && (
                <p className="text-center text-[10px] text-amber-300/80">Create a selection first to localize the edit.</p>
              )}
            </div>
          )}

          {/* Tool: PLACE */}
          {store.activeTool === 'place' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Place Item</span>
                {activePlacedLayer && <span className="max-w-40 truncate text-[9px] text-slate-500">{activePlacedLayer.name}</span>}
              </div>
              <button onClick={onPlaceUpload} className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-700/60 bg-cyan-950/30 py-2.5 text-[11px] font-bold text-cyan-200 hover:bg-cyan-900/40">
                <ImagePlus size={14} /> Upload Items
              </button>
              <p className="text-[9px] leading-relaxed text-slate-500">JPG, PNG, WEBP, AVIF, GIF, and PDF page one. You can also drag multiple files directly onto the canvas.</p>

              {activePlacedLayer ? (
                <>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2 text-[9px] leading-relaxed text-slate-400">
                    Drag inside the frame to move. Edge and corner handles resize; the upper handle rotates; diamond handles skew. Flip controls appear above the item.
                  </div>
                </>
              ) : (
                <p className="rounded-lg border border-amber-800/40 bg-amber-950/20 p-2 text-[9px] text-amber-300">Upload an item or select an existing placed-item layer.</p>
              )}
            </div>
          )}

          {/* Tool: TEXT */}
          {store.activeTool === 'text' && (
            <div className="space-y-4">
              <span className="text-[10px] uppercase font-bold text-indigo-300 block">Text Typography</span>
              
              <div className="space-y-2">
                <span className="text-[10px] text-slate-400">Font Family</span>
                <select
                  value={store.textProps.fontFamily}
                  onChange={e => store.setTextProps({ fontFamily: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                >
                  {['Inter', 'Roboto', 'Open Sans', 'Montserrat', 'Playfair Display', 'Lora', 'Poppins', 'Raleway', 'Oswald', 'Source Sans Pro', 'Merriweather', 'PT Sans', 'Nunito', 'Work Sans', 'DM Sans'].map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <span className="text-[10px] text-slate-400">Weight</span>
                  <select
                    value={store.textProps.fontWeight}
                    onChange={e => store.setTextProps({ fontWeight: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="300">Light (300)</option>
                    <option value="400">Regular (400)</option>
                    <option value="500">Medium (500)</option>
                    <option value="600">Semi-Bold (600)</option>
                    <option value="700">Bold (700)</option>
                    <option value="800">Extra-Bold (800)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] text-slate-400">Size</span>
                  <input
                    type="number"
                    min="8" max="200"
                    value={store.textProps.fontSize}
                    onChange={e => store.setTextProps({ fontSize: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                <button
                  onClick={() => store.setTextProps({ fontWeight: store.textProps.fontWeight == '700' ? '400' : '700' })}
                  className={`p-1.5 flex-1 rounded flex justify-center ${store.textProps.fontWeight == '700' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                ><Bold size={14} /></button>
                <button
                  onClick={() => store.setTextProps({ fontStyle: store.textProps.fontStyle === 'italic' ? 'normal' : 'italic' })}
                  className={`p-1.5 flex-1 rounded flex justify-center ${store.textProps.fontStyle === 'italic' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                ><Italic size={14} /></button>
                <button
                  onClick={() => store.setTextProps({ textDecoration: store.textProps.textDecoration === 'underline' ? 'none' : 'underline' })}
                  className={`p-1.5 flex-1 rounded flex justify-center ${store.textProps.textDecoration === 'underline' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                ><Underline size={14} /></button>
                <div className="w-[1px] bg-slate-700 mx-1" />
                <button
                  onClick={() => store.setTextProps({ align: 'left' })}
                  className={`p-1.5 flex-1 rounded flex justify-center ${store.textProps.align === 'left' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                ><AlignLeft size={14} /></button>
                <button
                  onClick={() => store.setTextProps({ align: 'center' })}
                  className={`p-1.5 flex-1 rounded flex justify-center ${store.textProps.align === 'center' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                ><AlignCenter size={14} /></button>
                <button
                  onClick={() => store.setTextProps({ align: 'right' })}
                  className={`p-1.5 flex-1 rounded flex justify-center ${store.textProps.align === 'right' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                ><AlignRight size={14} /></button>
                <button
                  onClick={() => store.setTextProps({ align: 'justify' })}
                  className={`p-1.5 flex-1 rounded flex justify-center ${store.textProps.align === 'justify' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                ><AlignJustify size={14} /></button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <span className="text-[10px] text-slate-400">Color</span>
                  <input
                    type="color"
                    value={store.textProps.color}
                    onChange={e => store.setTextProps({ color: e.target.value })}
                    className="w-full h-8 rounded-lg bg-transparent border border-slate-800 cursor-pointer p-0"
                  />
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] text-slate-400">Transform</span>
                  <select
                    value={store.textProps.textTransform}
                    onChange={e => store.setTextProps({ textTransform: e.target.value as any })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="none">None</option>
                    <option value="uppercase">UPPERCASE</option>
                    <option value="lowercase">lowercase</option>
                    <option value="capitalize">Capitalize</option>
                  </select>
                </div>
              </div>

              <p className="text-[10px] text-slate-400 leading-relaxed pt-2">
                Draw a frame on the image, then type directly inside it. Use the frame handles to resize, move, rotate, or skew. Select an existing text layer before choosing Text to edit it again.
              </p>
            </div>
          )}

          {/* Tool: LAYERS */}
          {store.activeTool === 'layers' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-indigo-300">Layers Stack</span>
                <div className="flex gap-1">
                  <button onClick={store.createLayerGroup} className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[9px] font-bold text-slate-300 hover:text-white" title="Group checked layers">
                    <Folder size={10} /> Group
                  </button>
                  <button onClick={() => store.addLayer('New Layer', 'draw')} className="flex items-center gap-1 rounded bg-indigo-600/30 px-2 py-1 text-[9px] font-bold text-indigo-300 hover:bg-indigo-600 hover:text-white">
                    <Plus size={10} /> Add
                  </button>
                </div>
              </div>

              {/* Active Layer Opacity & Blend Mode */}
              {activeLayer && (
                <div className="space-y-2 bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                  <div className="flex justify-between items-center text-[10px] text-slate-400">
                    <span>Opacity</span>
                    <span className="font-mono text-indigo-300">{Math.round(activeLayer.opacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round(activeLayer.opacity * 100)}
                    onChange={e => store.setLayerOpacity(activeLayer.id, Number(e.target.value) / 100)}
                    onMouseUp={() => store.pushHistory('Layer Opacity')}
                    onTouchEnd={() => store.pushHistory('Layer Opacity')}
                    className="w-full accent-indigo-500 h-1 bg-slate-800 rounded cursor-pointer"
                  />
                  <div className="flex justify-between items-center pt-1 text-[10px]">
                    <span className="text-slate-400">Blend Mode</span>
                    <select
                      value={activeLayer.blendMode}
                      onChange={e => store.setLayerBlendMode(activeLayer.id, e.target.value as BlendMode)}
                      className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-slate-200 text-[10px] cursor-pointer"
                    >
                      <option value="source-over">Normal</option>
                      <option value="multiply">Multiply</option>
                      <option value="screen">Screen</option>
                      <option value="overlay">Overlay</option>
                      <option value="darken">Darken</option>
                      <option value="lighten">Lighten</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Layers List */}
              <div className="space-y-1 max-h-44 overflow-y-auto scrollbar-thin">
                {store.layers.filter(layer => {
                  if (!layer.groupId) return true;
                  const group = store.layers.find(item => item.id === layer.groupId);
                  return group?.expanded !== false;
                }).map((layer) => {
                  const isCurrent = layer.id === store.activeLayerId;
                  const isGroup = layer.type === 'group';
                  const originalIndex = store.layers.findIndex(item => item.id === layer.id);
                  return (
                    <div
                      key={layer.id}
                      onClick={() => store.setActiveLayerId(layer.id)}
                      className={`flex items-center justify-between gap-1 rounded-lg border p-2 transition-all cursor-pointer ${layer.groupId ? 'ml-4' : ''} ${
                        isCurrent
                          ? 'bg-slate-800 border-indigo-500 text-slate-100 shadow-sm'
                          : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {!isGroup && (
                          <input
                            type="checkbox"
                            checked={store.selectedLayerIds.includes(layer.id)}
                            onChange={() => store.toggleLayerSelected(layer.id)}
                            onClick={event => event.stopPropagation()}
                            className="h-3 w-3 accent-indigo-500"
                            title="Select for grouping"
                          />
                        )}
                        {isGroup && (
                          <button onClick={event => { event.stopPropagation(); store.toggleGroupExpanded(layer.id); }} className="text-slate-500 hover:text-white">
                            {layer.expanded === false ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            store.setLayerVisibility(layer.id, !layer.visible);
                          }}
                          className="text-slate-500 hover:text-slate-300"
                        >
                          {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                        </button>
                        {isGroup && (layer.expanded === false ? <Folder size={12} className="text-amber-400" /> : <FolderOpen size={12} className="text-amber-400" />)}
                        <span className="text-[11px] font-semibold truncate">{layer.name}</span>
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5">
                        <button onClick={event => { event.stopPropagation(); store.setLayerLocked(layer.id, !layer.locked); }} className={`p-0.5 ${layer.locked ? 'text-amber-400' : 'text-slate-600 hover:text-slate-300'}`} title={layer.locked ? 'Unlock' : 'Lock'}>
                          {layer.locked ? <Lock size={11} /> : <Unlock size={11} />}
                        </button>
                        {originalIndex > 0 && <button onClick={event => { event.stopPropagation(); store.moveLayer(layer.id, 'up'); }} className="p-0.5 text-slate-600 hover:text-white" title="Move up"><ArrowUp size={11} /></button>}
                        {originalIndex < store.layers.length - 1 && <button onClick={event => { event.stopPropagation(); store.moveLayer(layer.id, 'down'); }} className="p-0.5 text-slate-600 hover:text-white" title="Move down"><ArrowDown size={11} /></button>}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            store.duplicateLayer(layer.id);
                          }}
                          className="p-0.5 text-slate-500 hover:text-indigo-300"
                          title="Duplicate"
                        >
                          <Copy size={11} />
                        </button>
                        {isGroup && (
                          <button onClick={event => { event.stopPropagation(); store.ungroupLayer(layer.id); }} className="p-0.5 text-slate-500 hover:text-amber-300" title="Ungroup">
                            <FolderOpen size={11} />
                          </button>
                        )}
                        {store.layers.length > 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              store.removeLayer(layer.id);
                            }}
                            className="p-0.5 text-slate-500 hover:text-rose-400"
                            title="Delete"
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
          )}

          {/* Tool: ROTATE */}
          {store.activeTool === 'rotate' && store.geometryMode === 'rotate' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-amber-300">Rotate & Straighten</span>
                <span className="text-[9px] font-mono text-slate-500">Pixel scale 1:1</span>
              </div>

              <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
                <button
                  type="button"
                  onClick={() => store.setRotationScope('all')}
                  className={`rounded-lg px-2 py-1.5 text-[10px] font-bold transition-colors ${store.rotationScope === 'all' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                >
                  All Layers
                </button>
                <button
                  type="button"
                  onClick={() => store.setRotationScope('active')}
                  disabled={!store.activeLayerId}
                  className={`rounded-lg px-2 py-1.5 text-[10px] font-bold transition-colors disabled:opacity-40 ${store.rotationScope === 'active' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                >
                  Selected Layer
                </button>
              </div>

              {store.rotationScope === 'active' && activeLayer && (
                <div className="truncate rounded-lg border border-amber-800/40 bg-amber-950/20 px-2.5 py-2 text-[10px] text-amber-200">
                  Selected: <span className="font-bold">{activeLayer.name}</span>
                </div>
              )}

              <div className="space-y-2">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Quarter Turn</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      store.setStraightenAngle(0);
                      if (store.rotationScope === 'all') store.rotateAllLayers(-90);
                      else if (store.activeLayerId) store.rotateLayer(store.activeLayerId, -90);
                    }}
                    className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-[10px] font-bold text-slate-200 hover:border-amber-600 hover:text-amber-300"
                  >
                    <RotateCcwIcon size={15} />
                    90° Anti-clockwise
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      store.setStraightenAngle(0);
                      if (store.rotationScope === 'all') store.rotateAllLayers(90);
                      else if (store.activeLayerId) store.rotateLayer(store.activeLayerId, 90);
                    }}
                    className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2.5 text-[10px] font-bold text-slate-200 hover:border-amber-600 hover:text-amber-300"
                  >
                    <RotateCw size={15} />
                    90° Clockwise
                  </button>
                </div>
              </div>

              <div className="space-y-2 border-t border-slate-800 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Straighten</span>
                  <span className="font-mono text-[11px] font-bold text-amber-300">{store.straightenAngle.toFixed(1)}°</span>
                </div>
                <input
                  type="range"
                  min="-15"
                  max="15"
                  step="0.1"
                  value={store.straightenAngle}
                  onChange={event => store.setStraightenAngle(Number(event.target.value))}
                  className="h-1 w-full cursor-pointer accent-amber-500"
                />
                <div className="flex justify-between font-mono text-[9px] text-slate-600">
                  <span>-15°</span>
                  <button type="button" onClick={() => store.setStraightenAngle(0)} className="text-slate-400 hover:text-white">Reset</button>
                  <span>+15°</span>
                </div>
                <button
                  type="button"
                  onClick={() => store.straightenLayers(store.straightenAngle, store.rotationScope)}
                  disabled={Math.abs(store.straightenAngle) < 0.01 || (store.rotationScope === 'active' && !store.activeLayerId)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-3 py-2.5 text-xs font-bold text-slate-950 hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Check size={14} />
                  Apply Straighten
                </button>
              </div>

              <div className="space-y-2 border-t border-slate-800 pt-3">
                <span className="block text-[9px] font-bold uppercase tracking-wider text-slate-400">Flip</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (store.rotationScope === 'all') store.flipAllLayers('h');
                      else if (store.activeLayerId) store.flipLayer(store.activeLayerId, 'h');
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 py-2 text-[10px] font-bold text-slate-200 hover:border-amber-600 hover:text-amber-300"
                  >
                    <FlipHorizontal size={14} /> Horizontal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (store.rotationScope === 'all') store.flipAllLayers('v');
                      else if (store.activeLayerId) store.flipLayer(store.activeLayerId, 'v');
                    }}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 py-2 text-[10px] font-bold text-slate-200 hover:border-amber-600 hover:text-amber-300"
                  >
                    <FlipVertical size={14} /> Vertical
                  </button>
                </div>
              </div>

              <p className="text-[10px] leading-relaxed text-slate-500">
                Straighten uses a minimal uniform zoom and center crop to remove blank corners while preserving the original aspect ratio without stretching or skewing.
              </p>
            </div>
          )}

          {/* Geometry: PERSPECTIVE */}
          {store.activeTool === 'rotate' && store.geometryMode === 'perspective' && (
            <div className="space-y-3.5">
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
                <button
                  type="button"
                  onClick={() => store.setRotationScope('all')}
                  className={`rounded-lg px-2 py-1.5 text-[10px] font-bold ${store.rotationScope === 'all' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:bg-slate-800'}`}
                >All Layers</button>
                <button
                  type="button"
                  onClick={() => store.setRotationScope('active')}
                  className={`rounded-lg px-2 py-1.5 text-[10px] font-bold ${store.rotationScope === 'active' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:bg-slate-800'}`}
                >Selected Layer</button>
              </div>

              <div className="grid grid-cols-4 gap-1">
                {(['auto', 'vertical', 'horizontal', 'guided'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => store.setPerspective({ mode })}
                    className={`rounded-lg border px-1 py-1.5 text-[9px] font-bold capitalize ${store.perspective.mode === mode ? 'border-amber-500 bg-amber-500/15 text-amber-300' : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-white'}`}
                  >{mode}</button>
                ))}
              </div>

              {store.perspective.mode === 'auto' && (
                <button
                  type="button"
                  onClick={() => compositeCanvasRef.current && store.autoPerspective(compositeCanvasRef.current)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-sky-500"
                >
                  <Wand2 size={14} /> Detect Architectural Lines
                </button>
              )}

              {store.perspective.mode === 'guided' && (
                <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
                  <p className="text-[10px] leading-relaxed text-slate-400">Draw two vertical and two horizontal references. Their line families will be rectified exactly to the image axes.</p>
                  <div className="grid grid-cols-2 gap-1">
                    <button
                      type="button"
                      onClick={() => store.setPerspective({ guideOrientation: 'vertical' })}
                      className={`rounded-lg py-1.5 text-[10px] font-bold ${store.perspective.guideOrientation === 'vertical' ? 'bg-sky-500 text-slate-950' : 'bg-slate-950 text-slate-400'}`}
                    >Vertical Guide</button>
                    <button
                      type="button"
                      onClick={() => store.setPerspective({ guideOrientation: 'horizontal' })}
                      className={`rounded-lg py-1.5 text-[10px] font-bold ${store.perspective.guideOrientation === 'horizontal' ? 'bg-rose-400 text-slate-950' : 'bg-slate-950 text-slate-400'}`}
                    >Horizontal Guide</button>
                  </div>
                  <button type="button" onClick={store.clearPerspectiveGuides} className="w-full rounded-lg border border-slate-800 py-1.5 text-[10px] font-bold text-slate-400 hover:text-white">
                    Clear Guides ({store.perspective.guides.length})
                  </button>
                </div>
              )}

              <div className="space-y-2.5 border-t border-slate-800 pt-3">
                {([
                  ['vertical', 'Vertical', -100, 100],
                  ['horizontal', 'Horizontal', -100, 100],
                  ['aspect', 'Aspect', -50, 50],
                  ['scale', 'Scale', 70, 140],
                  ['offsetX', 'Offset X', -100, 100],
                  ['offsetY', 'Offset Y', -100, 100],
                ] as const).map(([key, label, min, max]) => (
                  <div key={key} className="space-y-1">
                    <div className="flex justify-between text-[9px] font-bold text-slate-400">
                      <span>{label}</span>
                      <span className="font-mono text-amber-300">{Math.round(store.perspective[key])}</span>
                    </div>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      step="1"
                      value={store.perspective[key]}
                      onChange={event => store.setPerspective({ [key]: Number(event.target.value) })}
                      className="h-1 w-full cursor-pointer accent-amber-500"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-1.5">
                <span className="text-[9px] font-bold uppercase text-slate-400">Empty Edges</span>
                <select
                  value={store.perspective.edgeMode}
                  onChange={event => store.setPerspective({ edgeMode: event.target.value as any })}
                  className="w-full rounded-lg border border-slate-800 bg-slate-900 p-2 text-[10px] text-slate-200"
                >
                  <option value="auto-crop">Auto Crop / Cover</option>
                  <option value="transparent">Transparent</option>
                  <option value="white">White</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-3">
                <button type="button" onClick={store.resetPerspective} className="rounded-xl border border-slate-800 bg-slate-900 py-2 text-[10px] font-bold text-slate-300 hover:text-white">
                  Reset
                </button>
                <button type="button" onClick={store.applyPerspective} className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-500 py-2 text-[10px] font-bold text-slate-950 hover:bg-amber-400">
                  <Check size={13} /> Apply Perspective
                </button>
              </div>
              <p className="text-[9px] leading-relaxed text-slate-500">Geometric homography only. No generative AI is used.</p>
            </div>
          )}

          {/* Tool: TRANSFORM */}
          {store.activeTool === 'transform' && (
            <div className="space-y-4">
              <span className="text-[10px] uppercase font-bold text-indigo-300 block">Transform & Placement</span>

              {/* Scale Canvas */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex justify-between items-center text-[10px] text-slate-400">
                  <span>Scale Canvas</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => store.scaleAllLayers(0.5)} className="py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg flex items-center justify-center gap-1 text-slate-300 hover:text-indigo-400 transition-colors text-[10px] font-bold">
                    <Scaling size={12} /> 50%
                  </button>
                  <button onClick={() => store.scaleAllLayers(2.0)} className="py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg flex items-center justify-center gap-1 text-slate-300 hover:text-indigo-400 transition-colors text-[10px] font-bold">
                    <Scaling size={12} /> 200%
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* 3. Bottom Action Controls Footer */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/80 space-y-2 shrink-0">
        <button
          onClick={onExportClick}
          className="w-full py-2 px-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/25 cursor-pointer transition-all"
        >
          <Download size={13} />
          <span>Export Render / Image</span>
        </button>

      </div>
    </div>
  );
};
