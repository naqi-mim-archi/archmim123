import React, { useState, useRef } from 'react';
import { NodeConfigurator } from './NodeConfigurator';
import { 
  CanvasNodeData, 
  HubType, 
  PortPosition 
} from '../types/graph';
import { ArchElement } from '../../../../types';
import { 
  Sparkles, 
  Upload, 
  Trash2, 
  Download, 
  Edit3, 
  GitFork, 
  ChevronLeft, 
  ChevronRight, 
  Loader2, 
  AlertCircle,
  Plus,
  Sliders,
  Maximize2,
  Play,
  RotateCcw,
  Check,
  Box,
  Eye
} from 'lucide-react';
import { WORKFLOWS } from '../../../../services/aiRender/workflowRegistry';
import { isControlNetSupported } from '../../../../services/aiRender/modelPricingRegistry';
import { getSample3DModelDataUri } from '../../../../services/aiRender/sampleGlb';

const ALL_WORKFLOWS = Object.values(WORKFLOWS);
const WORKFLOWS_BY_HUB = {
  image_studio: ALL_WORKFLOWS.filter(workflow => workflow.hubCategory === 'image_studio'),
  raster_canvas: ALL_WORKFLOWS.filter(workflow => workflow.hubCategory === 'raster_canvas'),
  video_studio: ALL_WORKFLOWS.filter(workflow => workflow.hubCategory === 'video_studio'),
  gen_3d: ALL_WORKFLOWS.filter(workflow => workflow.hubCategory === 'gen_3d'),
};

interface CanvasNodeProps {
  node: CanvasNodeData;
  incomingNodes?: CanvasNodeData[];
  isConnecting?: boolean;
  pendingSourceNodeId?: string;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, pos: { x: number; y: number }) => void;
  onDelete: (id: string) => void;
  onStartConnect: (id: string, startPos: PortPosition) => void;
  onFinishConnect: (id: string) => void;
  onFork: (id: string, hubType?: HubType) => void;
  onForkIn?: (id: string) => void;
  onRemoveEdgeBetween?: (sourceNodeId: string, targetNodeId: string) => void;
  onEditInRasterCanvas: (id: string, imageUrl: string) => void;
  onConfigureNode?: (id: string, updates: Partial<CanvasNodeData>) => void;
  onGenerateNode?: (node: CanvasNodeData) => void;
  onImageUploaded?: (file: File, position?: { x: number; y: number }) => void;
  onImportToCanvas?: (elements: ArchElement[], options?: { viewMode?: '2D' | '3D' }) => void;
  // Collaborators who currently have this node selected (live presence).
  remoteSelectors?: { uid: string; name: string; color: string }[];
}

const CanvasNodeComponent: React.FC<CanvasNodeProps> = ({
  node,
  incomingNodes = [],
  isConnecting = false,
  pendingSourceNodeId,
  isSelected,
  remoteSelectors,
  onSelect,
  onMove,
  onDelete,
  onStartConnect,
  onFinishConnect,
  onFork,
  onForkIn,
  onRemoveEdgeBetween,
  onEditInRasterCanvas,
  onConfigureNode,
  onGenerateNode,
  onImageUploaded,
  onImportToCanvas,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [activeVariant, setActiveVariant] = useState(node.activeVariantIndex || 0);
  // A finished render also keeps the image it was made from, so the two can be compared here.
  const [showsInput, setShowsInput] = useState(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; nodeX: number; nodeY: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // In-node editing state fallbacks
  const currentHub = node.hubType || 'image_studio';
  const availableWorkflows = WORKFLOWS_BY_HUB[currentHub];
  const activeWorkflow = node.workflowId ? WORKFLOWS[node.workflowId] : availableWorkflows[0];

  const outputs = node.outputs && node.outputs.length > 0 
    ? node.outputs 
    : (node.imageUrl ? [{ id: 'out_0', url: node.imageUrl, type: (node.imageUrl.endsWith('.glb') || node.imageUrl.endsWith('.gltf') || node.hubType === 'gen_3d') ? ('3d' as const) : ('image' as const) }] : []);

  const currentOutput = outputs[activeVariant];
  const rawUrl = currentOutput?.url || node.imageUrl;
  const isBrokenKhronosUrl = Boolean(rawUrl && rawUrl.includes('KhronosGroup') && rawUrl.includes('Box.glb'));
  const currentImageUrl = isBrokenKhronosUrl ? getSample3DModelDataUri() : rawUrl;
  const hasInputComparison = Boolean(node.inputImageUrl && currentImageUrl && node.inputImageUrl !== currentImageUrl);
  const displayImageUrl = (hasInputComparison && showsInput ? node.inputImageUrl : currentImageUrl) || node.inputImageUrl;
  const hasDisplayImage = Boolean(displayImageUrl);
  const hasResult = Boolean(currentImageUrl) && node.status !== 'running';
  const isBlankCard = node.isInitialBlank && !displayImageUrl;

  const is3DOutput = Boolean(
    currentOutput?.type === '3d' || 
    (currentImageUrl && (currentImageUrl.toLowerCase().endsWith('.glb') || currentImageUrl.toLowerCase().endsWith('.gltf') || currentImageUrl.startsWith('data:model/gltf-binary'))) ||
    node.hubType === 'gen_3d' || 
    node.workflowId === 29 || 
    node.workflowId === 30 ||
    currentOutput?.mimeType?.includes('gltf') ||
    currentOutput?.mimeType?.includes('glb')
  );

  const isGlbModelUrl = Boolean(
    currentImageUrl && (currentImageUrl.toLowerCase().endsWith('.glb') || currentImageUrl.toLowerCase().endsWith('.gltf') || currentImageUrl.startsWith('data:model/gltf-binary') || currentOutput?.type === '3d')
  );

  const handleImport3DToCanvas = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onImportToCanvas) return;
    const modelUrl = currentImageUrl || node.imageUrl || '';
    const element: ArchElement = {
      id: crypto.randomUUID(),
      type: 'furniture',
      subType: 'ai_3d_model',
      pos: { x: 0, y: 0 },
      width: 1.5,
      depth: 1.5,
      height: 1.2,
      modelUrl: modelUrl,
      gltfUrl: modelUrl,
      category: 'AI 3D Model',
      label: node.title || 'AI 3D Model',
      sourceType: 'ai_3d_generation',
      isImportedAsset: true,
      boundary: [
        { x: -0.75, y: -0.75 },
        { x: 0.75, y: -0.75 },
        { x: 0.75, y: 0.75 },
        { x: -0.75, y: 0.75 }
      ]
    };
    onImportToCanvas([element], { viewMode: '3D' });
  };

  // Single-input vs multi-input connection logic
  const wfId = node.workflowId || (node.hubType === 'video_studio' ? 19 : node.hubType === 'gen_3d' ? 29 : 1);
  const wf = WORKFLOWS[wfId] || activeWorkflow;
  const isMultiInputAllowed = Boolean(
    wf?.optional_fields?.includes('reference_images') || 
    wf?.required_fields?.includes('style_reference_image') || 
    wf?.slug === 'reference-guided' ||
    wf?.slug === 'style-transfer'
  );
  const hasExistingInput = Boolean(
    node.inputImageUrl || 
    (node.uploadedImages && node.uploadedImages.length > 0) || 
    (incomingNodes && incomingNodes.length > 0)
  );
  const isAlreadyConnected = Boolean(
    pendingSourceNodeId && incomingNodes.some(inNode => inNode.id === pendingSourceNodeId)
  );
  const isSelf = pendingSourceNodeId === node.id;
  const isConnectionAllowed = Boolean(
    isConnecting && 
    pendingSourceNodeId && 
    !isSelf && 
    !isAlreadyConnected && 
    (isMultiInputAllowed || !hasExistingInput)
  );

  // Node Drag Handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, .port-handle, input, textarea, select')) return;
    
    e.stopPropagation();
    onSelect(node.id);
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      nodeX: node.position.x,
      nodeY: node.position.y,
    };

    const handlePointerMove = (moveEvent: PointerEvent) => {
      if (!dragStartRef.current) return;
      const dx = moveEvent.clientX - dragStartRef.current.mouseX;
      const dy = moveEvent.clientY - dragStartRef.current.mouseY;
      onMove(node.id, {
        x: dragStartRef.current.nodeX + dx,
        y: dragStartRef.current.nodeY + dy,
      });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  // Drop-anywhere on node handler during active connection
  const handleNodePointerUp = (e: React.PointerEvent) => {
    if (isConnecting && pendingSourceNodeId) {
      if (isConnectionAllowed) {
        e.stopPropagation();
        if (onFinishConnect) onFinishConnect(node.id);
      }
    }
  };

  // Width & dimensions
  const nodeWidth = node.width || (isBlankCard ? 320 : hasResult ? 300 : 340);

  return (
    <div
      style={{
        transform: `translate3d(${node.position.x}px, ${node.position.y}px, 0)`,
        width: `${nodeWidth}px`,
        ...(remoteSelectors && remoteSelectors.length > 0
          ? { outline: `2px solid ${remoteSelectors[0].color}`, outlineOffset: '3px' }
          : null),
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handleNodePointerUp}
      className={`canvas-node absolute flex max-h-[calc(100vh-9rem)] flex-col overflow-hidden select-none rounded-2xl border transition-colors duration-150 ${
        isConnecting && isConnectionAllowed
          ? 'bg-slate-900/95 border-indigo-400 ring-2 ring-indigo-400/90 shadow-2xl shadow-indigo-500/50 cursor-pointer animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]'
          : isConnecting && (!isConnectionAllowed || isSelf)
          ? 'bg-slate-900/70 border-slate-800/80 opacity-50 cursor-not-allowed'
          : isSelected
          ? 'bg-slate-900/95 border-indigo-500 shadow-2xl shadow-indigo-500/25 ring-1 ring-indigo-500/60 z-20'
          : 'bg-slate-900/90 border-slate-800 hover:border-slate-700 shadow-xl shadow-black/40 z-10'
      }`}
    >
      {remoteSelectors && remoteSelectors.length > 0 && (
        <div className="absolute top-1.5 right-9 z-30 flex gap-1 pointer-events-none">
          {remoteSelectors.slice(0, 3).map(selector => (
            <span
              key={selector.uid}
              className="rounded-full px-2 py-0.5 text-[9px] font-bold text-white shadow whitespace-nowrap max-w-[120px] truncate"
              style={{ backgroundColor: selector.color }}
            >
              {selector.name}
            </span>
          ))}
        </div>
      )}

      {/* Visual Drop Target Badge during connection */}
      {isConnecting && isConnectionAllowed && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-indigo-600 border border-indigo-400 text-[9px] font-bold text-white shadow-lg shadow-indigo-500/50 flex items-center gap-1 z-30 pointer-events-none animate-bounce">
          <Sparkles size={10} />
          <span>Drop to connect as input</span>
        </div>
      )}

      {/* 1. Left Input Port (Fork In) */}
      {(() => {
        const canForkIn = isMultiInputAllowed || !hasExistingInput;
        if (!canForkIn && incomingNodes.length === 0) {
          return null;
        }

        return (
          <div className="absolute -left-3 top-1/2 -translate-y-1/2 z-30 flex items-center">
            <div
              className="port-handle w-6 h-6 flex items-center justify-center cursor-crosshair group relative"
              onClick={(e) => {
                e.stopPropagation();
                if (canForkIn && onForkIn) onForkIn(node.id);
              }}
              onPointerUp={(e) => {
                e.stopPropagation();
                if (onFinishConnect) onFinishConnect(node.id);
              }}
              title={
                incomingNodes.length > 0
                  ? `${incomingNodes.length} incoming fork(s) connected`
                  : "Fork in (Create input node) OR drop connection here"
              }
            >
              <div className="w-3.5 h-3.5 rounded-full bg-slate-950 border-2 border-indigo-400 group-hover:border-white group-hover:scale-125 transition-all shadow-md flex items-center justify-center">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 group-hover:bg-white" />
              </div>

              {/* Badge showing incoming connection count */}
              {incomingNodes.length > 0 && (
                <div className="absolute -top-1.5 -right-1 px-1 min-w-[14px] h-[14px] rounded-full bg-indigo-600 border border-indigo-300 text-[8px] font-bold text-white shadow-md flex items-center justify-center pointer-events-none">
                  {incomingNodes.length}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 2. Right Output Port (Fork Out) */}
      <div
        className="port-handle absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center cursor-crosshair z-30 group"
        onClick={(e) => {
          e.stopPropagation();
          if (onFork) onFork(node.id, currentHub);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          if (onStartConnect) onStartConnect(node.id, {
            x: node.position.x + nodeWidth,
            y: node.position.y + 120, // Approximate handle Y position
          });
        }}
        title="Fork out (Branch node) OR drag to connect"
      >
        <div className="w-3.5 h-3.5 rounded-full bg-slate-950 border-2 border-indigo-400 group-hover:border-white group-hover:scale-125 transition-all shadow-md flex items-center justify-center">
          <Plus size={8} className="text-indigo-400 group-hover:text-white" />
        </div>
      </div>

      {/* 3. Node Header */}
      <div className={`shrink-0 p-2.5 border-b border-slate-800/80 flex items-center justify-between gap-2 bg-slate-950/50 rounded-t-2xl ${isConnecting ? 'pointer-events-none' : ''}`}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-indigo-400" />
          <span className="text-[11px] font-bold text-slate-300">{currentHub === 'gen_3d' ? '3D Generator Node' : 'Render Node'}</span>
        </div>

        {/* Delete button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(node.id);
          }}
          className="p-1 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
          title="Delete Node"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* 4. Node Body */}
      <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 space-y-3 scrollbar-thin ${isConnecting ? 'pointer-events-none' : ''}`}>
        {/* STATE A: Running Job Animation */}
        {node.status === 'running' ? (
          <div className="rounded-xl border border-indigo-500/40 bg-indigo-950/20 p-6 flex flex-col items-center justify-center gap-2 aspect-square animate-pulse text-center">
            <Loader2 size={28} className="text-indigo-400 animate-spin" />
            <span className="text-xs font-semibold text-indigo-300">Rendering Scene...</span>
            <span className="text-[10px] text-indigo-400/80 font-mono">Running Vertex AI Multi-Modal</span>
          </div>
        ) : isBlankCard && !isSelected ? (
          /* STATE B: Initial Blank Card (Unselected) */
          <div className="py-4 flex flex-col items-center justify-center text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center shadow-lg">
              <Sparkles size={24} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-200 mb-0.5">Start AI Rendering</h4>
              <p className="text-[10px] text-slate-400 max-w-[240px]">
                Click to select workflow or upload image
              </p>
            </div>
          </div>
        ) : (
          /* STATE C: Image Preview and/or Configurator */
          <div className="space-y-3">
            {/* Image / 3D Asset Preview */}
            {hasDisplayImage && (
              <div className="space-y-2">
                <div
                  onDoubleClick={() => !isGlbModelUrl && onEditInRasterCanvas(node.id, displayImageUrl!)}
                  className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 aspect-square group/img flex flex-col items-center justify-center cursor-pointer"
                  title={is3DOutput ? "3D Model Asset" : "Double-click to edit image"}
                >
                  {isGlbModelUrl ? (
                    <div className="w-full h-full bg-gradient-to-b from-slate-900 via-indigo-950/40 to-slate-950 p-4 flex flex-col items-center justify-center text-center space-y-2 relative">
                      <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-300 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                        <Box size={28} className="text-indigo-400 animate-pulse" />
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-slate-200">3D Asset Generated</h5>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">TRELLIS GLB Binary Model</p>
                      </div>
                      {onImportToCanvas && (
                        <button
                          onClick={handleImport3DToCanvas}
                          className="mt-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-emerald-950 transition-all cursor-pointer"
                          title="Import into project canvas and open in 3D viewer"
                        >
                          <Eye size={13} />
                          <span>View in 3D Canvas</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <img
                        src={displayImageUrl}
                        alt={node.title}
                        className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-200"
                      />

                      {/* The source image, alongside the render: click to swap which one is large */}
                      {hasInputComparison && (
                        <button
                          onClick={e => { e.stopPropagation(); setShowsInput(v => !v); }}
                          onDoubleClick={e => e.stopPropagation()}
                          title={showsInput ? 'Showing the uploaded image — click for the render' : 'Uploaded image — click to compare'}
                          className="absolute bottom-2 left-2 z-20 w-20 rounded-lg overflow-hidden border border-slate-700 bg-slate-950/90 shadow-lg hover:border-indigo-500 transition-colors cursor-pointer"
                        >
                          <img
                            src={(showsInput ? currentImageUrl : node.inputImageUrl) || ''}
                            alt={showsInput ? 'Render' : 'Uploaded image'}
                            className="w-full aspect-square object-cover"
                          />
                          <span className="block py-0.5 text-[9px] font-bold text-slate-300 tracking-wide">
                            {showsInput ? 'RENDER' : 'INPUT'}
                          </span>
                        </button>
                      )}

                      {/* Badge naming what the large image is */}
                      {hasInputComparison && showsInput && (
                        <div className="absolute top-2 left-2 bg-slate-900/80 backdrop-blur-md px-2 py-1 rounded-md border border-slate-700 flex items-center gap-1.5 z-10 text-[10px] font-bold text-indigo-300 shadow-sm">
                          <Upload size={12} />
                          <span>Uploaded image</span>
                        </div>
                      )}

                      {/* Upload Badge for input images */}
                      {displayImageUrl === node.inputImageUrl && !currentImageUrl && (
                        <div className="absolute top-2 left-2 bg-slate-900/80 backdrop-blur-md px-2 py-1 rounded-md border border-slate-700 flex items-center gap-1.5 z-10 text-[10px] font-bold text-indigo-300 shadow-sm">
                          <Upload size={12} />
                          <span>Uploaded Sketch</span>
                        </div>
                      )}

                      {/* 3D Model Badge if workflow is 3D */}
                      {is3DOutput && (
                        <div className="absolute top-2 left-2 bg-indigo-900/90 backdrop-blur-md px-2 py-1 rounded-md border border-indigo-500/50 flex items-center gap-1.5 z-10 text-[10px] font-bold text-indigo-200 shadow-sm">
                          <Box size={12} />
                          <span>3D Asset</span>
                        </div>
                      )}

                      {/* Hover Badge: Double Click prompt */}
                      <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover/img:opacity-100 flex flex-col items-center justify-center gap-1 text-white transition-opacity duration-150 backdrop-blur-[2px]">
                        {is3DOutput && onImportToCanvas ? (
                          <button
                            onClick={handleImport3DToCanvas}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-lg"
                          >
                            <Eye size={14} />
                            <span>View in 3D Canvas</span>
                          </button>
                        ) : (
                          <>
                            <Edit3 size={20} className="text-indigo-400" />
                            <span className="text-[11px] font-bold">Double-Click to Edit</span>
                            <span className="text-[9px] text-slate-300">Opens image editor</span>
                          </>
                        )}
                      </div>

                      {/* Full Screen Button (Explicit) */}
                      {!is3DOutput && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditInRasterCanvas(node.id, displayImageUrl!);
                          }}
                          className="absolute top-2 right-2 p-1.5 bg-slate-900/80 hover:bg-indigo-600 text-slate-300 hover:text-white rounded-lg opacity-0 group-hover/img:opacity-100 transition-all z-10 backdrop-blur-md border border-slate-700 hover:border-indigo-500"
                          title="View Full Screen (Editor)"
                        >
                          <Maximize2 size={14} />
                        </button>
                      )}
                    </>
                  )}

                  {/* Multiple Variants Navigation */}
                  {outputs.length > 1 && (
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-slate-950/80 backdrop-blur-md px-2 py-1 rounded-full border border-slate-800 flex items-center gap-2 text-[10px] text-slate-300 font-mono z-10">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveVariant(prev => (prev > 0 ? prev - 1 : outputs.length - 1));
                        }}
                        className="hover:text-white p-1 hover:bg-slate-800 rounded-full"
                      >
                        <ChevronLeft size={12} />
                      </button>
                      <span>{activeVariant + 1}/{outputs.length}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveVariant(prev => (prev < outputs.length - 1 ? prev + 1 : 0));
                        }}
                        className="hover:text-white p-1 hover:bg-slate-800 rounded-full"
                      >
                        <ChevronRight size={12} />
                      </button>
                    </div>
                  )}

                  {/* Cost Badge */}
                  {node.costEstimateUsd && (
                    <div className="absolute top-2 right-2 bg-slate-950/80 backdrop-blur-md px-1.5 py-0.5 rounded-md border border-slate-800 text-[9px] font-mono text-emerald-400">
                      ${node.costEstimateUsd.toFixed(3)}
                    </div>
                  )}
                </div>

                {/* Prompt snippet (only shown when unselected or if no configurator) */}
                {!isSelected && node.prompt && (
                  <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 text-[10px] text-slate-300 line-clamp-2 leading-relaxed">
                    <span className="text-indigo-400 font-semibold mr-1">Prompt:</span>
                    {node.prompt}
                  </div>
                )}
              </div>
            )}

            {/* The Configurator Toolbar (Only shown when selected) */}
            {isSelected && (
              <div className="pt-2 animate-in fade-in slide-in-from-top-2 duration-200">
                <NodeConfigurator
                  node={node}
                  incomingNodes={incomingNodes}
                  onConfigureNode={onConfigureNode!}
                  onGenerateNode={onGenerateNode!}
                  onRemoveIncomingEdge={(sourceId) => {
                    if (onRemoveEdgeBetween) {
                      onRemoveEdgeBetween(sourceId, node.id);
                    }
                  }}
                  onUploadImage={(file) => {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                      const b64 = ev.target?.result as string;
                      const existing = node.uploadedImages || [];
                      onConfigureNode!(node.id, {
                        inputImageUrl: b64,
                        controlNetEnabled: true,
                        uploadedImages: [...existing, {
                          id: `upload_${Date.now()}`,
                          name: file.name,
                          base64: b64,
                          category: 'drawing',
                          drawingType: 'Floor Plan',
                          referenceAspects: ['All (Complete Theme & Mood)'],
                          label: file.name,
                        }],
                      });
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Node Footer (Always shown unless running) */}
      {node.status !== 'running' && (
        <div className="shrink-0 p-2 border-t border-slate-800/80 bg-slate-950/50 rounded-b-2xl flex items-center justify-between gap-1 text-xs">
          {/* Branch / Fork Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFork(node.id, currentHub);
            }}
            className="flex-1 py-1.5 px-2 bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-[11px]"
            title="Fork/Branch this image into next rendering task"
          >
            <GitFork size={12} />
            <span>Fork Branch</span>
          </button>

          {/* Import 3D Model to Canvas */}
          {is3DOutput && (currentImageUrl || node.imageUrl) && onImportToCanvas && (
            <button
              onClick={handleImport3DToCanvas}
              className="py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer text-[11px] shadow-sm shadow-emerald-950"
              title="Import 3D model to project canvas and view in 3D mode"
            >
              <Box size={13} />
              <span>View in 3D</span>
            </button>
          )}

          {/* Open image editor */}
          {displayImageUrl && !isGlbModelUrl && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEditInRasterCanvas(node.id, displayImageUrl);
              }}
              className="p-1.5 bg-cyan-950/40 hover:bg-cyan-600 text-cyan-300 hover:text-white border border-cyan-800/40 rounded-lg transition-colors cursor-pointer"
              title="Edit Image (Inpaint, Erase, Mask)"
            >
              <Edit3 size={13} />
            </button>
          )}

          {/* Download Image or 3D Model */}
          {displayImageUrl && (
            <a
              href={displayImageUrl}
              download={isGlbModelUrl ? `model-3d-${node.id}.glb` : `render-node-${node.id}.png`}
              onClick={(e) => {
                e.stopPropagation();
                if (displayImageUrl.startsWith('data:')) {
                  const link = document.createElement('a');
                  link.href = displayImageUrl;
                  link.download = isGlbModelUrl ? `model-3d-${node.id}.glb` : `render-node-${node.id}.png`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                  e.preventDefault();
                }
              }}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              title={isGlbModelUrl ? "Download 3D Model (.glb)" : "Download image"}
            >
              <Download size={13} />
            </a>
          )}
        </div>
      )}

      {/* Hidden File Input for this Node */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={e => {
          if (e.target.files && e.target.files.length > 0 && onImageUploaded) {
            onImageUploaded(e.target.files[0], { x: node.position.x, y: node.position.y });
            e.target.value = '';
          }
        }}
      />
    </div>
  );
};

export const CanvasNode = React.memo(CanvasNodeComponent);
