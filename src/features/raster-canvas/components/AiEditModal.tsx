import React, { useState } from 'react';
import {
  Sparkles,
  Trash2,
  RefreshCw,
  PlusCircle,
  Palette,
  ChevronLeft,
  Play,
  Check,
  RotateCcw,
  Layers,
  ChevronRight,
  Maximize2,
  PenTool,
} from 'lucide-react';
import { AiActionType, ARCHITECTURAL_PRESETS } from '../types/aiEdit';
import { RasterAiService } from '../services/rasterAiService';
import { MaskEngine } from '../core/MaskEngine';
import { AiCanvasRegistrationEngine } from '../core/AiCanvasRegistrationEngine';

interface AiEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  baseImageBase64: string;
  maskBase64: string;
  referenceImageBase64?: string;
  onApplyResult: (newImageBase64: string) => void;
  initialPrompt?: string;
  initialAction?: AiActionType;
}

export const AiEditModal: React.FC<AiEditModalProps> = ({
  isOpen,
  onClose,
  baseImageBase64,
  maskBase64,
  referenceImageBase64,
  onApplyResult,
  initialPrompt,
  initialAction,
}) => {
  const [activeTab, setActiveTab] = useState<AiActionType>(initialAction || 'remove');
  const [promptText, setPromptText] = useState<string>(initialPrompt || '');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.1-flash-image');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [previewResult, setPreviewResult] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<string | null>(null);
  const [costUsd, setCostUsd] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);

  // Sync initial prompt/action when re-opened from selection bar
  React.useEffect(() => {
    if (!isOpen) return;
    if (initialPrompt !== undefined) setPromptText(initialPrompt);
    if (initialAction !== undefined) setActiveTab(initialAction);
    setPreviewResult(null);
    setApplyResult(null);
    setError(null);
    setElapsedTime(0);
  }, [isOpen, initialPrompt, initialAction]);

  React.useEffect(() => {
    if (activeTab === 'scribble') {
      if (selectedModel !== 'flux-2-pro' && selectedModel !== 'stable-diffusion-xl') {
        setSelectedModel('flux-2-pro');
      }
    } else if (selectedModel === 'flux-2-pro' || selectedModel === 'stable-diffusion-xl') {
      setSelectedModel('gemini-3.1-flash-image');
    }
  }, [activeTab, selectedModel]);

  if (!isOpen) return null;

  const tabs: { id: AiActionType; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; description: string }[] = [
    { id: 'remove', label: 'Remove Object', icon: Trash2, description: 'Reconstruct background behind unwanted people, furniture, or artifacts' },
    { id: 'replace', label: 'Replace Object', icon: RefreshCw, description: 'Replace selected fixture or element while preserving geometry & lighting' },
    { id: 'add', label: 'Add Element', icon: PlusCircle, description: 'Place people, greenery, furniture, or decor inside the marked region' },
    { id: 'material', label: 'Change Material', icon: Palette, description: 'Swap surface finish (e.g. travertine, oak, concrete) preserving structure' },
    { id: 'outpaint', label: 'Outpaint / Extend', icon: Maximize2, description: 'Seamlessly extend the image outward, generating new content that continues the scene' },
    { id: 'scribble', label: 'Scribble to Render', icon: PenTool, description: 'Render rough sketch marks into photorealistic architectural elements' },
  ];

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    setPreviewResult(null);
    setApplyResult(null);

    const timer = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);

    try {
      const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('An AI edit image could not be loaded.'));
        image.src = src;
      });

      const baseImage = await loadImage(baseImageBase64);
      const baseCanvas = document.createElement('canvas');
      baseCanvas.width = baseImage.naturalWidth || baseImage.width || 1024;
      baseCanvas.height = baseImage.naturalHeight || baseImage.height || 1024;
      baseCanvas.getContext('2d')?.drawImage(baseImage, 0, 0, baseCanvas.width, baseCanvas.height);

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = baseCanvas.width;
      maskCanvas.height = baseCanvas.height;
      if (maskBase64) {
        const maskImage = await loadImage(maskBase64);
        maskCanvas.getContext('2d')?.drawImage(maskImage, 0, 0, maskCanvas.width, maskCanvas.height);
      }

      const prepared = AiCanvasRegistrationEngine.prepareRequest(baseCanvas, maskCanvas);
      let preparedReferenceImage: string | undefined;
      if (activeTab === 'scribble' && referenceImageBase64) {
        const referenceImage = await loadImage(referenceImageBase64);
        const referenceCanvas = document.createElement('canvas');
        referenceCanvas.width = prepared.registration.modelWidth;
        referenceCanvas.height = prepared.registration.modelHeight;
        const referenceContext = referenceCanvas.getContext('2d');
        if (referenceContext) {
          referenceContext.fillStyle = '#ffffff';
          referenceContext.fillRect(0, 0, referenceCanvas.width, referenceCanvas.height);
          referenceContext.drawImage(
            referenceImage,
            prepared.registration.contentX,
            prepared.registration.contentY,
            prepared.registration.contentWidth,
            prepared.registration.contentHeight,
          );
          preparedReferenceImage = referenceCanvas.toDataURL('image/png');
        }
      }
      const result = await RasterAiService.executeAiEdit({
        action: activeTab,
        baseImageBase64: prepared.baseCanvas.toDataURL('image/png'),
        maskBase64: maskBase64 ? MaskEngine.exportInpaintingMaskBase64(prepared.maskCanvas) : undefined,
        userPrompt: promptText,
        model: selectedModel,
        aspectRatio: prepared.registration.aspectRatio,
        strength: activeTab === 'scribble' ? 95 : undefined,
        referenceImageBase64: preparedReferenceImage,
      });

      if (!result.imageUrl) {
        throw new Error('No image returned from AI engine');
      }

      const generatedImage = await loadImage(result.base64 || result.imageUrl);
      const registeredResult = AiCanvasRegistrationEngine.extractRegisteredResult(generatedImage, prepared.registration);
      const alignedResult = maskBase64
        ? AiCanvasRegistrationEngine.alignGeneratedToBase(registeredResult, baseCanvas, maskCanvas)
        : registeredResult;
      const blendFeather = activeTab === 'scribble'
        ? Math.max(4, Math.round(Math.min(baseCanvas.width, baseCanvas.height) * 0.008))
        : 1;
      const previewCanvas = maskBase64
        ? MaskEngine.blendInpaintingResult(baseCanvas, alignedResult, maskCanvas, false, blendFeather)
        : alignedResult;
      setApplyResult(alignedResult.toDataURL('image/png'));
      setPreviewResult(previewCanvas.toDataURL('image/png'));
      setCostUsd(result.costEstimateUsd);
    } catch (err: any) {
      setError(err.message || 'AI generation failed');
    } finally {
      clearInterval(timer);
      setIsLoading(false);
    }
  };

  const handlePresetClick = (snippet: string) => {
    if (!promptText.trim()) {
      setPromptText(snippet);
    } else {
      setPromptText(prev => `${prev}, ${snippet}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl border border-indigo-500/30">
              <Sparkles size={16} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">AI Generative Edit</h3>
              <p className="text-[11px] text-slate-400">Contextual inpainting & material replacement</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="grid grid-cols-4 gap-1 p-2 bg-slate-950/80 border-b border-slate-800">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setPreviewResult(null);
                  setApplyResult(null);
                  setError(null);
                }}
                className={`py-2 px-3 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Main Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          <p className="text-xs text-indigo-300/90 font-medium">
            {tabs.find(t => t.id === activeTab)?.description}
          </p>

          {/* Prompt Description (Except for pure Remove which is automatic) */}
          {activeTab !== 'remove' && (
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {activeTab === 'replace'
                  ? 'Replacement Description'
                  : activeTab === 'add'
                    ? 'Element to Add'
                    : activeTab === 'scribble'
                      ? 'Description (Optional)'
                      : 'Target Material Finish'}
              </label>
              <textarea
                value={promptText}
                onChange={e => setPromptText(e.target.value)}
                rows={2}
                placeholder={
                  activeTab === 'replace'
                    ? 'e.g. Black aluminium sliding door with clear glass'
                    : activeTab === 'add'
                    ? 'e.g. Modern bouclé armchair or mature fiddle leaf fig'
                    : activeTab === 'scribble'
                    ? 'Optional: describe the drawing, or leave blank to infer all items'
                    : 'e.g. Light beige travertine stone or smoked oak wood'
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans resize-none"
              />
            </div>
          )}

          {/* Quick Architectural Presets */}
          {activeTab !== 'remove' && (
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Quick Architectural Presets
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                {ARCHITECTURAL_PRESETS.filter(p => {
                  if (activeTab === 'material') return p.category === 'materials';
                  if (activeTab === 'add') return p.category === 'people' || p.category === 'vegetation' || p.category === 'furniture' || p.category === 'decor';
                  return true;
                }).map(preset => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handlePresetClick(preset.promptSnippet)}
                    className="bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white px-2 py-1 rounded-lg text-[10px] font-medium transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <span>+</span>
                    <span>{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Model Selector */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
            <span className="text-xs font-medium text-slate-400">AI Model:</span>
            <select
              value={selectedModel}
              onChange={e => setSelectedModel(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none cursor-pointer"
            >
              {activeTab === 'scribble' ? (
                <>
                  <option value="flux-2-pro">FLUX.2 Pro + ControlNet (Recommended)</option>
                  <option value="stable-diffusion-xl">Stable Diffusion XL + ControlNet</option>
                </>
              ) : (
                <>
                  <option value="gemini-3.1-flash-image">Gemini 3.1 Flash (Fast Precision Inpainting)</option>
                  <option value="gemini-3-pro-image">Gemini 3 Pro (Ultra-Photorealistic)</option>
                  <option value="flux-2-pro">FLUX.2 Pro (High Fidelity)</option>
                </>
              )}
            </select>
          </div>

          {/* Error display */}
          {error && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs">
              {error}
            </div>
          )}

          {/* Result Preview Container */}
          {previewResult && (
            <div className="space-y-3 pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                  <Check size={14} /> AI Preview Generated
                </span>
                {costUsd !== null && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    Est. ${costUsd.toFixed(4)} USD
                  </span>
                )}
              </div>

              <div className="relative rounded-xl overflow-hidden border border-indigo-500/40 bg-slate-950 aspect-video flex items-center justify-center">
                <img src={previewResult} alt="AI Result Preview" className="max-h-full max-w-full object-contain" />
              </div>

              {/* AI results are always non-destructive layers. */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleGenerate}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 border border-slate-800 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <RotateCcw size={12} />
                  <span>Regenerate</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onApplyResult(applyResult || previewResult);
                    onClose();
                  }}
                  className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-3 py-2 rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Layers size={12} />
                  <span>Apply as New Layer</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Generate Bar (when no preview yet) */}
        {!previewResult && (
          <div className="px-5 py-3.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              Only selected masked region will be altered
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={isLoading}
                className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-600/20 flex items-center gap-2 transition-all cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <RefreshCw size={13} className="animate-spin text-amber-300" />
                    <span>Generating ({elapsedTime}s)...</span>
                  </>
                ) : (
                  <>
                    <Play size={13} fill="currentColor" />
                    <span>Generate Edit</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
