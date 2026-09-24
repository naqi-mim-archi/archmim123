import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { 
  CanvasNodeData, 
  CanvasEdge, 
  GraphViewport, 
  HubType, 
  PortPosition 
} from '../types/graph';
import { ArchElement } from '../../../../types';
import { GraphEngine } from '../core/GraphEngine';
import RenderRemoteCursors from '../../../../components/collab/RenderRemoteCursors';
import { useRenderPeerSelections } from '../../../../components/collab/usePresence';
import { GraphStore } from '../state/useGraphStore';
import { CanvasNode } from './CanvasNode';
import { EdgeLayer } from './EdgeLayer';
import { WORKFLOWS } from '../../../../services/aiRender/workflowRegistry';
import { 
  Sparkles, 
  Plus, 
  Maximize2, 
  RotateCcw, 
  ZoomIn, 
  ZoomOut, 
  Undo2,
  Redo2
} from 'lucide-react';

const ALL_WORKFLOWS = Object.values(WORKFLOWS);

interface AiRenderingCanvasProps {
  store: GraphStore;
  isDrawerOpen: boolean;
  onOpenDrawer: (sourceNodeId?: string) => void;
  onCloseDrawer: () => void;
  activeHub: HubType;
  onEditInRasterCanvas: (nodeId: string, imageUrl: string) => void;
  onImageUploaded: (file: File, position?: { x: number; y: number }) => void;
  onConfigureNode?: (id: string, updates: Partial<CanvasNodeData>) => void;
  onGenerateNode?: (node: CanvasNodeData) => void;
  onImportToCanvas?: (elements: ArchElement[], options?: { viewMode?: '2D' | '3D' }) => void;
  drawerChildren: React.ReactNode;
  isOverlayOpen?: boolean;
  // Live collaboration: the pointer in graph coordinates, null when it leaves the canvas.
  onGraphPointerMove?: (point: { x: number; y: number } | null) => void;
}

const EMPTY_INCOMING_NODES: CanvasNodeData[] = [];

export const AiRenderingCanvas: React.FC<AiRenderingCanvasProps> = ({
  store,
  isDrawerOpen,
  onOpenDrawer,
  onCloseDrawer,
  activeHub,
  onEditInRasterCanvas,
  onImageUploaded,
  onConfigureNode,
  onGenerateNode,
  onImportToCanvas,
  drawerChildren,
  isOverlayOpen = false,
  onGraphPointerMove,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const remoteSelections = useRenderPeerSelections();
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ mouseX: number; mouseY: number; startPanX: number; startPanY: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasAutoCenteredRef = useRef(false);

  // Zoom Handler (at pointer location with 7-8x reduced smooth sensitivity)
  const handleWheel = (e: React.WheelEvent) => {
    if ((e.target as HTMLElement).closest('.canvas-node')) return;

    e.preventDefault();
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.015 : 0.985;
    store.setViewport(prev => {
      const newZoom = Math.min(Math.max(prev.zoom * zoomFactor, 0.1), 3.0);
      const newX = mouseX - (mouseX - prev.x) * (newZoom / prev.zoom);
      const newY = mouseY - (mouseY - prev.y) * (newZoom / prev.zoom);
      return { x: newX, y: newY, zoom: newZoom };
    });
  };

  // Auto-fit and center initial canvas viewport on mount
  const fitAndCenterGraph = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        if (store.nodes.length === 0) {
          store.setViewport({
            x: 64,
            y: 64,
            zoom: 0.85,
          });
        } else {
          store.fitToView(rect.width, rect.height);
        }
      }
    }
  }, [store.nodes.length, store.fitToView, store.setViewport]);

  // Run auto-fit ONLY ONCE on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      fitAndCenterGraph();
    }, 50);
    return () => clearTimeout(timer);
  }, []); // Run exactly once on mount

  // Global Keyboard Shortcuts for Undo / Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOverlayOpen) return;

      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          store.redo();
        } else {
          e.preventDefault();
          store.undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        store.redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store.undo, store.redo, isOverlayOpen]);

  // Canvas Pan Handlers
  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return; // Left or Middle click
    if ((e.target as HTMLElement).closest('.port-handle, button, input, textarea, select, .canvas-node, .edge-item, .edge-delete-btn, svg g')) return;

    isPanningRef.current = true;
    panStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startPanX: store.viewport.x,
      startPanY: store.viewport.y,
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (_) {}
    store.selectNode(null);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isPanningRef.current && panStartRef.current) {
      const dx = e.clientX - panStartRef.current.mouseX;
      const dy = e.clientY - panStartRef.current.mouseY;
      const newX = panStartRef.current.startPanX + dx;
      const newY = panStartRef.current.startPanY + dy;
      store.setViewport(prev => ({
        ...prev,
        x: newX,
        y: newY,
      }));
    }

    // Share the pointer with collaborators (graph coordinates, so it lands on the same node for them).
    if (onGraphPointerMove && containerRef.current) {
      onGraphPointerMove(GraphEngine.screenToGraph(e.clientX, e.clientY, containerRef.current.getBoundingClientRect(), store.viewport));
    }

    // If dragging an edge connection, update target line
    if (store.pendingConnection && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const graphPos = GraphEngine.screenToGraph(e.clientX, e.clientY, rect, store.viewport);
      store.updateConnecting(graphPos);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      panStartRef.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch (_) {}
    }
    if (store.pendingConnection) {
      store.cancelConnecting();
    }
  };

  // Handle Drag & Drop Images onto canvas
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!containerRef.current) return;

    const files = (Array.from(e.dataTransfer.files) as File[]).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      const rect = containerRef.current.getBoundingClientRect();
      const dropGraphPos = GraphEngine.screenToGraph(e.clientX, e.clientY, rect, store.viewport);
      files.forEach(file => {
        onImageUploaded(file, dropGraphPos);
      });
    }
  };

  const incomingNodesByTarget = useMemo(() => {
    const nodesById = new Map(store.nodes.map(node => [node.id, node]));
    const incoming = new Map<string, CanvasNodeData[]>();
    for (const edge of store.edges) {
      const source = nodesById.get(edge.sourceNodeId);
      if (!source) continue;
      const current = incoming.get(edge.targetNodeId);
      if (current) current.push(source);
      else incoming.set(edge.targetNodeId, [source]);
    }
    return incoming;
  }, [store.nodes, store.edges]);

  const handleFork = useCallback((nodeId: string, hubType?: HubType) => {
    store.forkNode(nodeId, hubType || activeHub);
  }, [store.forkNode, activeHub]);

  const handleCreateNode = useCallback(() => {
    const newPos = {
      x: -store.viewport.x / store.viewport.zoom + 120,
      y: -store.viewport.y / store.viewport.zoom + 120,
    };
    const activeWorkflow = ALL_WORKFLOWS.find(workflow => workflow.hubCategory === activeHub);
    const isDirect3DNode = activeHub === 'gen_3d';
    store.addNode({
      type: 'action',
      title: isDirect3DNode ? '3D Generator' : 'AI Rendering',
      subtitle: isDirect3DNode ? 'Configure a furniture or interior model' : 'Click + to select a workflow or upload an image',
      position: newPos,
      width: 320,
      height: 240,
      isInitialBlank: !isDirect3DNode,
      isConfiguring: isDirect3DNode,
      hubType: activeHub,
      workflowId: isDirect3DNode ? activeWorkflow?.id : undefined,
      model: isDirect3DNode ? activeWorkflow?.default_model : undefined,
      status: 'idle',
    });
  }, [store.viewport, store.addNode, activeHub]);

  return (
    <div className="flex-1 flex overflow-hidden h-full relative bg-slate-950 select-none">
      {/* 2. Main Graph Canvas Viewport */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => onGraphPointerMove?.(null)}
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
        className="flex-1 h-full relative overflow-hidden cursor-grab active:cursor-grabbing bg-slate-950"
        style={{
          backgroundImage: `radial-gradient(circle, rgba(0, 113, 227, 0.22) 1px, transparent 1px)`,
          backgroundSize: `${24 * store.viewport.zoom}px ${24 * store.viewport.zoom}px`,
          backgroundPosition: `${store.viewport.x}px ${store.viewport.y}px`,
        }}
      >
        <RenderRemoteCursors viewport={store.viewport} />

        {/* Transform Layer for Pan & Zoom */}
        <div
          className="absolute inset-0 origin-top-left pointer-events-none"
          style={{
            transform: `matrix(${store.viewport.zoom}, 0, 0, ${store.viewport.zoom}, ${store.viewport.x}, ${store.viewport.y})`,
          }}
        >
          {/* SVG Connection Edges Layer */}
          <EdgeLayer
            nodes={store.nodes}
            edges={store.edges}
            pendingConnection={store.pendingConnection}
            onRemoveEdge={store.removeEdge}
          />

          {/* Node Cards */}
          <div className="pointer-events-auto">
            {store.nodes.map(node => {
              const incomingNodes = incomingNodesByTarget.get(node.id) || EMPTY_INCOMING_NODES;

              return (
                <CanvasNode
                  key={node.id}
                  node={node}
                  incomingNodes={incomingNodes}
                  isConnecting={Boolean(store.pendingConnection)}
                  pendingSourceNodeId={store.pendingConnection?.sourceNodeId}
                  isSelected={store.selectedNodeId === node.id}
                  remoteSelectors={remoteSelections.get(node.id)}
                  onSelect={store.selectNode}
                  onMove={store.moveNode}
                  onDelete={store.removeNode}
                  onStartConnect={store.startConnecting}
                  onFinishConnect={store.finishConnecting}
                  onFork={handleFork}
                  onForkIn={store.forkParentNode}
                  onEditInRasterCanvas={onEditInRasterCanvas}
                  onConfigureNode={onConfigureNode}
                  onGenerateNode={onGenerateNode}
                  onImageUploaded={onImageUploaded}
                  onImportToCanvas={onImportToCanvas}
                  onRemoveEdgeBetween={store.removeEdgeBetween}
                />
              );
            })}
          </div>
        </div>

        {/* Bottom-right graph and viewport controls */}
        <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-slate-900/90 border border-slate-800/80 p-1 rounded-xl backdrop-blur-md shadow-2xl z-20 text-xs">
          <button
            onClick={handleCreateNode}
            className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
            title="Create a new blank rendering node on canvas"
          >
            <Plus size={14} />
            <span>New Node</span>
          </button>
          <div className="h-4 w-[1px] bg-slate-800 mx-0.5" />
          <button
            onClick={store.undo}
            disabled={!store.canUndo}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 size={14} />
            <span>Undo</span>
          </button>
          <button
            onClick={store.redo}
            disabled={!store.canRedo}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
            title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
          >
            <Redo2 size={14} />
            <span>Redo</span>
          </button>
          <div className="h-4 w-[1px] bg-slate-800 mx-0.5" />
          <button
            onClick={() => store.setViewport(prev => ({ ...prev, zoom: Math.min(prev.zoom * 1.2, 2.5) }))}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn size={14} />
          </button>
          <span className="text-[10px] font-mono text-slate-400 w-10 text-center">
            {Math.round(store.viewport.zoom * 100)}%
          </span>
          <button
            onClick={() => store.setViewport(prev => ({ ...prev, zoom: Math.max(prev.zoom * 0.8, 0.2) }))}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut size={14} />
          </button>
          <div className="h-4 w-[1px] bg-slate-800 mx-0.5" />
          <button
            onClick={fitAndCenterGraph}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Fit to View"
          >
            <Maximize2 size={14} />
          </button>
          <button
            onClick={fitAndCenterGraph}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Reset View (100%)"
          >
            <RotateCcw size={14} />
          </button>
        </div>

        {/* Hidden File Input for Direct Canvas Upload */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => {
            if (e.target.files && e.target.files.length > 0) {
              Array.from(e.target.files).forEach(file => {
                onImageUploaded(file);
              });
              e.target.value = '';
            }
          }}
        />
      </div>
    </div>
  );
};
