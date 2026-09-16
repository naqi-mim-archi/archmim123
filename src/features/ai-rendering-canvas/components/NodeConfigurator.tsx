import React, { useState } from 'react';
import { 
  Sparkles, Upload, Sliders, ChevronUp, ChevronDown, X
} from 'lucide-react';
import { CanvasNodeData } from '../types/graph';
import { WORKFLOWS } from '../../../../services/aiRender/workflowRegistry';
import { isControlNetSupported, CONTROLNET_MODELS, WorkflowCostEstimator } from '../../../../services/aiRender/modelPricingRegistry';

const ALL_WORKFLOWS = Object.values(WORKFLOWS);
const VIDEO_WORKFLOWS = ALL_WORKFLOWS.filter(workflow => workflow.hubCategory === 'video_studio');
const WORKFLOWS_BY_HUB = {
  image_studio: ALL_WORKFLOWS.filter(workflow => workflow.hubCategory === 'image_studio'),
  raster_canvas: ALL_WORKFLOWS.filter(workflow => workflow.hubCategory === 'raster_canvas'),
  gen_3d: ALL_WORKFLOWS.filter(workflow => workflow.hubCategory === 'gen_3d'),
};

interface NodeConfiguratorProps {
  node: CanvasNodeData;
  incomingNodes?: CanvasNodeData[];
  onConfigureNode: (id: string, updates: Partial<CanvasNodeData>) => void;
  onGenerateNode: (node: CanvasNodeData) => void;
  onUploadImage: (file: File) => void;
  onRemoveIncomingEdge?: (sourceNodeId: string) => void;
}

export const NodeConfigurator: React.FC<NodeConfiguratorProps> = ({
  node,
  incomingNodes = [],
  onConfigureNode,
  onGenerateNode,
  onUploadImage,
  onRemoveIncomingEdge,
}) => {
  const [showAdvancedDirectives, setShowAdvancedDirectives] = useState(false);
  const [isEnhancingPrompt, setIsEnhancingPrompt] = useState(false);
  
  const currentHub = node.hubType || 'image_studio';
  const workflowHub = currentHub === 'video_studio' ? 'image_studio' : currentHub;
  const availableWorkflows = WORKFLOWS_BY_HUB[workflowHub];
  const activeWorkflow = node.workflowId ? WORKFLOWS[node.workflowId] : availableWorkflows[0];
  const isVideoComingSoon = activeWorkflow?.hubCategory === 'video_studio';

  const isReferenceGuided = activeWorkflow?.slug === 'reference-guided';
  const isImageRequired = Boolean(
    activeWorkflow?.required_fields?.includes('source_image') || 
    activeWorkflow?.required_fields?.includes('drawing_image') ||
    (activeWorkflow?.input_types?.some(t => t.startsWith('image/')) && 
     !activeWorkflow.input_types.includes('text') && 
     !activeWorkflow.input_types.includes('text/plain'))
  );

  const isMultiInputAllowed = Boolean(
    activeWorkflow?.optional_fields?.includes('reference_images') || 
    activeWorkflow?.required_fields?.includes('style_reference_image') || 
    activeWorkflow?.slug === 'reference-guided' ||
    activeWorkflow?.slug === 'style-transfer'
  );

  const uploadedImages = node.uploadedImages || (node.inputImageUrl ? [{ id: '1', name: 'Input Reference', base64: node.inputImageUrl, category: 'drawing', drawingType: 'Floor Plan' }] : []);
  const controlNetEnabled = node.controlNetEnabled !== false;
  const controlNetStrength = node.controlNetStrength ?? 80;

  const combinedImages = [
    ...uploadedImages.map(img => ({ ...img, source: 'upload' })),
    ...incomingNodes.map(inNode => {
      const imgUrl = inNode.imageUrl || inNode.outputs?.[0]?.url || inNode.inputImageUrl;
      const existingTag = node.incomingEdgeTags?.[inNode.id] || 'drawing';
      return {
        id: `incoming_${inNode.id}`,
        nodeId: inNode.id,
        name: `From: ${inNode.title}`,
        base64: imgUrl,
        category: existingTag,
        source: 'incoming'
      };
    }).filter(img => img.base64)
  ];

  const modelsList = activeWorkflow
    ? currentHub === 'image_studio'
      ? (() => {
          const ALL_IMAGE_MODELS = [
            'gemini-3-pro-image',
            'gemini-3.1-flash-image',
            'gemini-3.1-flash-lite-image',
            'flux-2-pro',
            'stable-diffusion-xl'
          ];
          const allowed = activeWorkflow.allowed_models;
          const remaining = ALL_IMAGE_MODELS.filter(m => !allowed.includes(m));
          let fullList = [...allowed, ...remaining];

          if (isImageRequired && controlNetEnabled) {
            const cnOnly = fullList.filter(m => isControlNetSupported(m));
            return cnOnly.length > 0 ? cnOnly : CONTROLNET_MODELS;
          }
          return fullList;
        })()
      : activeWorkflow.allowed_models
    : [];

  const getModelIcon = (modelKey: string) => {
    if (!modelKey) return '🍌';
    const key = modelKey.toLowerCase();
    if (key.includes('flux')) return '⚡';
    if (key.includes('stable-diffusion') || key.includes('sdxl')) return '🎨';
    if (key.includes('veo') || key.includes('video')) return '🎥';
    if (key.includes('trellis') || key.includes('gsplat') || key.includes('3d')) return '🧊';
    return '🍌'; 
  };

  const handleEnhanceWithAi = async () => {
    if (!activeWorkflow) return;
    setIsEnhancingPrompt(true);
    try {
      const res = await fetch('/api/ai-render/enhance-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_input: node.prompt || activeWorkflow.name,
          workflow_id: activeWorkflow.id,
          image_style: node.style || 'realistic',
          model: node.model || activeWorkflow.default_model,
          people: node.peopleOption || 'none',
          camera_angle: node.cameraOption || 'auto',
          custom_camera: node.customCameraInput || '',
          lighting: node.lightingOption || 'auto',
          custom_lighting: node.customLightingInput || '',
          materials: node.materialsOption || 'auto',
          custom_materials: node.customMaterialsInput || '',
          environment: node.environmentOption || 'auto',
          custom_environment: node.customEnvironmentInput || '',
          mood: node.moodOption || 'auto',
          custom_mood: node.customMoodInput || '',
          has_reference_image: uploadedImages.length > 0,
          reference_images_count: uploadedImages.length,
          controlnet_enabled: controlNetEnabled,
          controlnet_strength: controlNetStrength
        })
      });
      const data = await res.json();
      if (data.enhanced_prompt) {
        onConfigureNode(node.id, { compiledPrompt: data.enhanced_prompt });
      }
    } catch (err) {
      console.warn('Auto prompt enhance error:', err);
    } finally {
      setIsEnhancingPrompt(false);
    }
  };

  const costEstimation = activeWorkflow
    ? WorkflowCostEstimator.calculate(activeWorkflow.id, node.model || activeWorkflow.default_model, {
        resolution: node.resolution || '2K',
        duration_seconds: node.durationSeconds || 4,
        audio: node.audioEnabled || false,
        prompt_tokens_estimate: 1000,
        input_images_count: uploadedImages.length
      })
    : null;
    
  // Multiply cost by variants
  const totalCost = (costEstimation?.estimateUsd || 0.04) * (node.variants || 1);

  return (
    <div className="space-y-3 p-1">
      {/* Workflow Selector */}
      <div>
        <label className="block text-[9px] uppercase tracking-wider font-bold text-slate-400 mb-1">Workflow</label>
        <select
          value={activeWorkflow?.id || availableWorkflows[0]?.id}
          onChange={e => {
            const wfId = Number(e.target.value);
            const wf = WORKFLOWS[wfId];
            if (wf && wf.hubCategory !== 'video_studio') {
              onConfigureNode(node.id, {
                workflowId: wf.id,
                model: wf.default_model,
                hubType: wf.hubCategory,
              });
            }
          }}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none font-bold cursor-pointer"
        >
          <optgroup label={currentHub === 'gen_3d' ? '3D Workflows' : currentHub === 'raster_canvas' ? 'Editing Workflows' : 'Render Workflows'}>
            {availableWorkflows.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </optgroup>
          {currentHub !== 'gen_3d' && currentHub !== 'raster_canvas' && (
            <optgroup label="Video Workflows - Coming Soon">
              {VIDEO_WORKFLOWS.map(w => (
                <option key={w.id} value={w.id} disabled>{w.name} - Coming Soon</option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {isReferenceGuided && (
        <div className="bg-indigo-950/40 border border-indigo-800/60 rounded-xl p-2.5 text-slate-300 leading-relaxed space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-indigo-300 text-[10px]">
            <Sparkles size={12} className="text-indigo-400 shrink-0" />
            <span>Reference Guided Synthesis</span>
          </div>
          <p className="text-slate-400 text-[8.5px] leading-relaxed">
            The drawing guides the core design, while reference images guide the style, materials, lighting, colors, and overall mood.
          </p>
        </div>
      )}

      {currentHub === 'image_studio' && (
        <div>
          <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400 mb-1.5">Image Style</label>
          <select
            value={node.style || 'realistic'}
            onChange={e => onConfigureNode(node.id, { style: e.target.value })}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none font-bold font-sans cursor-pointer"
          >
            <option value="realistic">Realistic</option>
            <option value="artistic_sketch">Artistic Sketch</option>
            <option value="architectural_drawing">Architectural Drawing</option>
            <option value="oil_painting">Oil Painting</option>
            <option value="watercolor">Watercolor</option>
            <option value="marker_drawing">Marker Drawing</option>
            <option value="charcoal_drawing">Charcoal Drawing</option>
            <option value="retro_comic">Retro Comic</option>
            <option value="illustration">Illustration</option>
            <option value="dynamic_blur">Dynamic Blur</option>
          </select>
        </div>
      )}

      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="block text-[9px] uppercase tracking-wider font-bold text-slate-400">Design Prompt</label>
        </div>
        <textarea
          placeholder="Enter design prompt..."
          value={node.prompt || ''}
          onChange={e => onConfigureNode(node.id, { prompt: e.target.value })}
          rows={2}
          className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 rounded-lg p-2 text-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-none scrollbar-thin"
        />
      </div>

      <div>
        <div className="flex justify-between items-center mb-1.5">
          <label className="block text-[10px] uppercase tracking-wider font-bold text-slate-400">
            Input Images {isImageRequired ? '(Required)' : '(Optional)'}
          </label>
          <span className="text-[10px] text-slate-500 font-mono">
            {combinedImages.length} Loaded
          </span>
        </div>

        {(!isMultiInputAllowed && combinedImages.length >= 1) ? null : (
          <div className="border-2 border-dashed border-slate-700/80 hover:border-indigo-500/60 rounded-xl p-2 text-center bg-slate-950/40 hover:bg-slate-950/80 transition-all group">
            <label className="cursor-pointer flex flex-col items-center justify-center gap-1.5">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  if (e.target.files && e.target.files.length > 0) {
                    onUploadImage(e.target.files[0]);
                  }
                }}
              />
              <div className="p-1 rounded-xl bg-slate-900 group-hover:bg-indigo-950/60 text-slate-400 group-hover:text-indigo-400 transition-colors">
                <Upload size={14} />
              </div>
              <span className="text-[10px] font-semibold text-indigo-400 group-hover:text-indigo-300">
                Upload Image
              </span>
            </label>
          </div>
        )}

        {combinedImages.length > 0 && (
          <div className="mt-2 space-y-1.5 max-h-[120px] overflow-y-auto pr-1 scrollbar-thin">
            {combinedImages.map((img, idx) => (
              <div key={img.id || idx} className="bg-slate-950/80 border border-slate-800 rounded-lg p-1.5 flex items-start gap-2">
                <img src={img.base64} alt="upload" className="w-8 h-8 rounded object-cover border border-slate-800 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] font-bold text-slate-200 truncate pr-1">{img.name}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      {img.source === 'incoming' && (
                        <span className="px-1 py-0.5 rounded bg-indigo-950/50 border border-indigo-800 text-[8px] text-indigo-300">
                          Forked In
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (img.source === 'incoming' && img.nodeId) {
                            if (onRemoveIncomingEdge) onRemoveIncomingEdge(img.nodeId);
                          } else {
                            const updated = (node.uploadedImages || []).filter(u => u.id !== img.id);
                            onConfigureNode(node.id, {
                              uploadedImages: updated,
                              inputImageUrl: updated.length > 0 ? updated[0].base64 : undefined,
                            });
                          }
                        }}
                        className="p-0.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                        title={img.source === 'incoming' ? "Disconnect incoming fork" : "Remove uploaded image"}
                      >
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                  <select
                    value={img.category}
                    onChange={e => {
                      if (img.source === 'incoming') {
                        onConfigureNode(node.id, {
                          incomingEdgeTags: {
                            ...(node.incomingEdgeTags || {}),
                            [img.nodeId]: e.target.value
                          }
                        });
                      } else {
                        const updatedImages = uploadedImages.map(u => 
                          u.id === img.id ? { ...u, category: e.target.value } : u
                        );
                        onConfigureNode(node.id, { uploadedImages: updatedImages });
                      }
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-[9px] text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="drawing">Design Drawing (Geometry)</option>
                    <option value="reference">Visual Reference (Style/Color)</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {(isImageRequired || uploadedImages.length > 0) && (
        <div className="bg-slate-950/80 border border-indigo-950/80 rounded-xl p-2.5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sliders size={12} className={controlNetEnabled ? "text-indigo-400" : "text-slate-500"} />
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-200">ControlNet</span>
            </div>
            <button
              type="button"
              onClick={() => onConfigureNode(node.id, { controlNetEnabled: !controlNetEnabled })}
              className={`w-7 h-4 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                controlNetEnabled ? 'bg-indigo-600' : 'bg-slate-700'
              }`}
            >
              <div className={`bg-white w-3 h-3 rounded-full shadow-md transform transition-transform ${controlNetEnabled ? 'translate-x-3' : 'translate-x-0'}`} />
            </button>
          </div>
          {controlNetEnabled && (
            <div className="pt-1.5 border-t border-slate-800/80 space-y-1">
              <div className="flex items-center justify-between text-[9px]">
                <span className="text-slate-300">Conditioning Fidelity</span>
                <span className="font-mono font-bold text-indigo-300">{controlNetStrength}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={controlNetStrength}
                onChange={e => onConfigureNode(node.id, { controlNetStrength: Number(e.target.value) })}
                className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
          )}
        </div>
      )}

      {/* Aspects & Resolution */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-[9px] uppercase tracking-wider font-bold text-slate-400 mb-1">Aspect Ratio</label>
          <select
            value={node.aspectRatio || '16:9'}
            onChange={e => onConfigureNode(node.id, { aspectRatio: e.target.value })}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-slate-300 text-[10px] cursor-pointer"
          >
            <option value="1:1">1:1 Square</option>
            <option value="16:9">16:9 Landscape</option>
            <option value="4:3">4:3 Standard</option>
            <option value="9:16">9:16 Portrait</option>
            <option value="3:4">3:4 Standard Portrait</option>
            {uploadedImages.length > 0 && <option value="custom">Match Input</option>}
          </select>
        </div>
        <div>
          <label className="block text-[9px] uppercase tracking-wider font-bold text-slate-400 mb-1">Variants</label>
          <select
            value={node.variants || 1}
            onChange={e => onConfigureNode(node.id, { variants: Number(e.target.value) })}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-1.5 text-slate-300 text-[10px] cursor-pointer"
          >
            <option value="1">1 Variant</option>
            <option value="2">2 Variants</option>
            <option value="3">3 Variants</option>
            <option value="4">4 Variants</option>
          </select>
        </div>
      </div>

      <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-950/40">
        <button
          type="button"
          onClick={() => setShowAdvancedDirectives(!showAdvancedDirectives)}
          className="w-full px-2 py-1.5 flex items-center justify-between text-slate-300 hover:text-white transition-colors cursor-pointer text-[10px] font-semibold"
        >
          <div className="flex items-center gap-1.5">
            <Sliders size={10} className="text-indigo-400" />
            <span>Advanced Directives</span>
          </div>
          {showAdvancedDirectives ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
        {showAdvancedDirectives && (
          <div className="p-2 border-t border-slate-800 space-y-2 text-[10px]">
            <div>
              <label className="block text-[8px] uppercase text-slate-400 mb-0.5">Camera Angle</label>
              <select value={node.cameraOption || 'auto'} onChange={e => onConfigureNode(node.id, { cameraOption: e.target.value })} className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-slate-300">
                <option value="auto">Auto / Contextual</option>
                <option value="eye-level">Eye-Level Perspective</option>
                <option value="aerial">Aerial / Drone View</option>
                <option value="isometric">Isometric Axonometric</option>
              </select>
            </div>
            <div>
              <label className="block text-[8px] uppercase text-slate-400 mb-0.5">Lighting</label>
              <select value={node.lightingOption || 'auto'} onChange={e => onConfigureNode(node.id, { lightingOption: e.target.value })} className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-slate-300">
                <option value="auto">Auto / Natural</option>
                <option value="golden-hour">Golden Hour</option>
                <option value="blue-hour">Blue Hour</option>
                <option value="night">Night</option>
              </select>
            </div>
            <div>
              <label className="block text-[8px] uppercase text-slate-400 mb-0.5">People</label>
              <select value={node.peopleOption || 'none'} onChange={e => onConfigureNode(node.id, { peopleOption: e.target.value })} className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-slate-300">
                <option value="none">No People</option>
                <option value="sparse">Few People</option>
                <option value="active">Active</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-[9px] uppercase tracking-wider font-bold text-slate-400 mb-1">AI Engine Model</label>
        <select
          value={node.model || activeWorkflow?.default_model}
          onChange={e => onConfigureNode(node.id, { model: e.target.value })}
          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 text-xs font-bold focus:ring-1 focus:ring-indigo-500 cursor-pointer"
        >
          {modelsList.map(m => (
            <option key={m} value={m}>{getModelIcon(m)} {m}</option>
          ))}
        </select>
      </div>

      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2 space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[9px] uppercase font-bold text-indigo-300">Compiled AI Prompt</span>
          <button
            type="button"
            onClick={handleEnhanceWithAi}
            className="px-1.5 py-0.5 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded text-[8px] font-bold cursor-pointer"
          >
            {isEnhancingPrompt ? "..." : "Enhance"}
          </button>
        </div>
        <textarea
          value={node.compiledPrompt || node.prompt || ''}
          onChange={e => onConfigureNode(node.id, { compiledPrompt: e.target.value })}
          rows={2}
          className="w-full bg-slate-900 border border-slate-800 rounded p-1 text-indigo-200 text-[9px] font-mono leading-relaxed resize-none focus:outline-none"
        />
      </div>

      <div className="pt-1">
        <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1.5 px-1">
          <span>Est. Cost ({node.variants || 1}x):</span>
          <span className="font-mono text-emerald-400 font-bold">${totalCost.toFixed(4)} USD</span>
        </div>
        <button
          type="button"
          onClick={() => onGenerateNode(node)}
          disabled={isVideoComingSoon}
          className="w-full py-2 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-indigo-600/30 cursor-pointer disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Sparkles size={14} />
          <span>{isVideoComingSoon ? 'Video Workflow - Coming Soon' : 'Generate Render'}</span>
        </button>
      </div>
    </div>
  );
};
