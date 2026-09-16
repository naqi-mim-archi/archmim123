import { useState, useCallback, useRef } from 'react';
import { 
  CanvasNodeData, 
  CanvasEdge, 
  GraphViewport, 
  PendingConnection, 
  HubType, 
  NodeType,
  NodeOutputItem 
} from '../types/graph';
import { GraphEngine, DEFAULT_NODE_WIDTH, DEFAULT_NODE_HEIGHT } from '../core/GraphEngine';

export interface GraphStore {
  nodes: CanvasNodeData[];
  edges: CanvasEdge[];
  viewport: GraphViewport;
  selectedNodeId: string | null;
  pendingConnection: PendingConnection | null;
  canUndo: boolean;
  canRedo: boolean;

  // History Actions
  undo: () => void;
  redo: () => void;

  // Node Actions
  addNode: (node: Partial<CanvasNodeData> & { title: string; type: NodeType }) => CanvasNodeData;
  updateNode: (id: string, updates: Partial<CanvasNodeData>) => void;
  removeNode: (id: string) => void;
  moveNode: (id: string, position: { x: number; y: number }) => void;
  selectNode: (id: string | null) => void;

  // Edge & Connection Actions
  addEdge: (sourceNodeId: string, targetNodeId: string, label?: string) => CanvasEdge | null;
  removeEdge: (edgeId: string) => void;
  removeEdgeBetween: (sourceNodeId: string, targetNodeId: string) => void;
  startConnecting: (sourceNodeId: string, startPos: { x: number; y: number }) => void;
  updateConnecting: (currentPos: { x: number; y: number }) => void;
  finishConnecting: (targetNodeId: string | null) => void;
  cancelConnecting: () => void;

  // High-Level Branching / Forking Actions
  forkNode: (
    parentNodeId: string, 
    hubType: HubType, 
    workflowTitle?: string
  ) => { actionNode: CanvasNodeData; edge: CanvasEdge };

  forkParentNode: (childNodeId: string) => void;

  addCompletedImageNode: (
    parentId: string | undefined,
    imageUrl: string,
    outputs: NodeOutputItem[],
    promptText: string,
    hubType: HubType,
    workflowId?: number,
    model?: string,
    style?: string,
    costUsd?: number
  ) => CanvasNodeData;

  // Viewport
  setViewport: (viewport: GraphViewport | ((prev: GraphViewport) => GraphViewport)) => void;
  fitToView: (containerWidth: number, containerHeight: number) => void;
  resetGraph: () => void;
}

export const createInitialBlankNode = (pos = { x: 80, y: 80 }): CanvasNodeData => ({
  id: 'node_root',
  type: 'action',
  title: 'AI Rendering',
  subtitle: 'Click + to select a workflow or upload an image',
  position: pos,
  width: 320,
  height: 240,
  isInitialBlank: true,
  status: 'idle',
  createdAt: Date.now(),
});

interface GraphSnapshot {
  nodes: CanvasNodeData[];
  edges: CanvasEdge[];
  selectedNodeId: string | null;
}

export function useGraphStore(initialNodes: CanvasNodeData[] = []): GraphStore {
  const [nodes, setNodes] = useState<CanvasNodeData[]>(initialNodes);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [viewport, setViewport] = useState<GraphViewport>({ x: 80, y: 80, zoom: 1 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);

  // History State for Undo / Redo
  const [past, setPast] = useState<GraphSnapshot[]>([]);
  const [future, setFuture] = useState<GraphSnapshot[]>([]);

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const selectedNodeIdRef = useRef(selectedNodeId);
  selectedNodeIdRef.current = selectedNodeId;

  // Push Snapshot before destructive or state-changing action
  const pushSnapshot = useCallback(() => {
    setPast(prev => [
      ...prev.slice(-30), // keep up to 30 history states
      {
        nodes: nodesRef.current,
        edges: edgesRef.current,
        selectedNodeId: selectedNodeIdRef.current,
      }
    ]);
    setFuture([]);
  }, []);

  // Undo Action
  const undo = useCallback(() => {
    setPast(prevPast => {
      if (prevPast.length === 0) return prevPast;
      const previous = prevPast[prevPast.length - 1];
      const newPast = prevPast.slice(0, prevPast.length - 1);

      setFuture(prevFuture => [
        {
          nodes: nodesRef.current,
          edges: edgesRef.current,
          selectedNodeId: selectedNodeIdRef.current,
        },
        ...prevFuture,
      ]);

      setNodes(previous.nodes);
      setEdges(previous.edges);
      setSelectedNodeId(previous.selectedNodeId);
      return newPast;
    });
  }, []);

  // Redo Action
  const redo = useCallback(() => {
    setFuture(prevFuture => {
      if (prevFuture.length === 0) return prevFuture;
      const next = prevFuture[0];
      const newFuture = prevFuture.slice(1);

      setPast(prevPast => [
        ...prevPast,
        {
          nodes: nodesRef.current,
          edges: edgesRef.current,
          selectedNodeId: selectedNodeIdRef.current,
        },
      ]);

      setNodes(next.nodes);
      setEdges(next.edges);
      setSelectedNodeId(next.selectedNodeId);
      return newFuture;
    });
  }, []);

  // Add Node
  const addNode = useCallback((data: Partial<CanvasNodeData> & { title: string; type: NodeType }): CanvasNodeData => {
    pushSnapshot();
    const id = data.id || 'node_' + Math.random().toString(36).substring(2, 9);
    const newNode: CanvasNodeData = {
      id,
      type: data.type,
      title: data.title,
      subtitle: data.subtitle,
      position: data.position || { x: 100, y: 100 },
      width: data.width || DEFAULT_NODE_WIDTH,
      height: data.height || DEFAULT_NODE_HEIGHT,
      imageUrl: data.imageUrl,
      outputs: data.outputs || (data.imageUrl ? [{ id: 'out_1', url: data.imageUrl, type: 'image' }] : []),
      activeVariantIndex: data.activeVariantIndex || 0,
      prompt: data.prompt,
      compiledPrompt: data.compiledPrompt,
      hubType: data.hubType,
      workflowId: data.workflowId,
      model: data.model,
      style: data.style,
      status: data.status || 'idle',
      progress: data.progress,
      processingTimeMs: data.processingTimeMs,
      costEstimateUsd: data.costEstimateUsd,
      error: data.error,
      createdAt: data.createdAt || Date.now(),
      parentId: data.parentId,
    };

    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(id);
    return newNode;
  }, [pushSnapshot]);

  // Update Node
  const updateNode = useCallback((id: string, updates: Partial<CanvasNodeData>) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
  }, []);

  // Remove Node
  const removeNode = useCallback((id: string) => {
    pushSnapshot();
    setNodes(prev => prev.filter(n => n.id !== id));
    setEdges(prev => prev.filter(e => e.sourceNodeId !== id && e.targetNodeId !== id));
    setSelectedNodeId(prev => prev === id ? null : prev);
  }, [pushSnapshot]);

  // Move Node
  const moveNode = useCallback((id: string, position: { x: number; y: number }) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, position } : n));
  }, []);

  // Select Node
  const selectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
  }, []);

  // Add Edge
  const addEdge = useCallback((sourceNodeId: string, targetNodeId: string, label?: string): CanvasEdge | null => {
    if (sourceNodeId === targetNodeId) return null;

    pushSnapshot();
    let createdEdge: CanvasEdge | null = null;
    
    setEdges(prev => {
      const exists = prev.some(e => e.sourceNodeId === sourceNodeId && e.targetNodeId === targetNodeId);
      if (exists) return prev;
      
      createdEdge = {
        id: `edge_${sourceNodeId}_to_${targetNodeId}`,
        sourceNodeId,
        targetNodeId,
        sourceHandle: 'output',
        targetHandle: 'input',
        label,
        animated: true,
      };
      return [...prev, createdEdge];
    });

    return createdEdge;
  }, [pushSnapshot]);

  // Remove Edge
  const removeEdge = useCallback((edgeId: string) => {
    pushSnapshot();
    setEdges(prev => prev.filter(e => e.id !== edgeId));
  }, [pushSnapshot]);

  // Remove Edge Between Two Specific Nodes
  const removeEdgeBetween = useCallback((sourceNodeId: string, targetNodeId: string) => {
    pushSnapshot();
    setEdges(prev => prev.filter(e => !(e.sourceNodeId === sourceNodeId && e.targetNodeId === targetNodeId)));
  }, [pushSnapshot]);

  // Start Connecting (Drag from output port)
  const startConnecting = useCallback((sourceNodeId: string, startPos: { x: number; y: number }) => {
    setPendingConnection({
      sourceNodeId,
      sourceHandle: 'output',
      currentMousePos: startPos,
    });
  }, []);

  // Update Connecting Position
  const updateConnecting = useCallback((currentPos: { x: number; y: number }) => {
    setPendingConnection(prev => prev ? { ...prev, currentMousePos: currentPos } : null);
  }, []);

  // Finish Connecting (Dropped on target input port)
  const finishConnecting = useCallback((targetNodeId: string | null) => {
    if (pendingConnection && targetNodeId && pendingConnection.sourceNodeId !== targetNodeId) {
      addEdge(pendingConnection.sourceNodeId, targetNodeId);
    }
    setPendingConnection(null);
  }, [pendingConnection, addEdge]);

  // Cancel Connecting
  const cancelConnecting = useCallback(() => {
    setPendingConnection(null);
  }, []);

  // Fork Node: Creates a connected branch node with clean offset (Fork Out)
  const forkNode = useCallback((
    parentNodeId: string,
    hubType?: HubType,
    workflowTitle?: string
  ) => {
    pushSnapshot();
    const parentNode = nodes.find(n => n.id === parentNodeId);
    if (!parentNode) {
      throw new Error(`Parent node ${parentNodeId} not found`);
    }

    const pos = GraphEngine.calculateForkPosition(parentNode, nodes, 380, 360);
    const actionNodeId = 'node_' + Math.random().toString(36).substring(2, 9);
    const parentImg = parentNode.imageUrl || parentNode.outputs?.[0]?.url || parentNode.inputImageUrl;

    const actionNode: CanvasNodeData = {
      id: actionNodeId,
      type: 'action',
      title: workflowTitle || (hubType ? `${hubType.replace('_', ' ').toUpperCase()} Task` : parentNode.title),
      subtitle: `Input from ${parentNode.title}`,
      position: pos,
      width: 340,
      height: 380,
      hubType: hubType || parentNode.hubType || 'image_studio',
      workflowId: parentNode.workflowId,
      model: parentNode.model,
      style: parentNode.style,
      prompt: parentNode.prompt,
      controlNetEnabled: parentNode.controlNetEnabled,
      controlNetStrength: parentNode.controlNetStrength,
      inputImageUrl: parentImg,
      imageUrl: parentImg,
      isInitialBlank: false,
      isConfiguring: true,
      status: 'idle',
      createdAt: Date.now(),
      parentId: parentNodeId,
    };

    const edge: CanvasEdge = {
      id: `edge_${parentNodeId}_to_${actionNodeId}`,
      sourceNodeId: parentNodeId,
      targetNodeId: actionNodeId,
      sourceHandle: 'output',
      targetHandle: 'input',
      animated: true,
    };

    setNodes(prev => [...prev, actionNode]);
    setEdges(prev => [...prev, edge]);
    setSelectedNodeId(actionNodeId);

    return { actionNode, edge };
  }, [nodes, pushSnapshot]);

  // Fork Parent Node: Creates a new input node feeding into this node (Fork In)
  const forkParentNode = useCallback((childNodeId: string) => {
    pushSnapshot();
    const childNode = nodes.find(n => n.id === childNodeId);
    if (!childNode) return;

    // Place the new parent to the left
    const pos = {
      x: childNode.position.x - 380,
      y: childNode.position.y
    };
    
    // Slight jitter if there's already a node there
    const overlapping = nodes.find(n => Math.abs(n.position.x - pos.x) < 50 && Math.abs(n.position.y - pos.y) < 50);
    if (overlapping) {
      pos.y -= 100; // shift up
    }

    const actionNodeId = 'node_' + Math.random().toString(36).substring(2, 9);
    
    const parentNode: CanvasNodeData = {
      id: actionNodeId,
      type: 'action',
      title: 'Input Node',
      subtitle: `Input for ${childNode.title}`,
      position: pos,
      width: 320,
      height: 240,
      hubType: 'image_studio',
      isInitialBlank: true,
      status: 'idle',
      createdAt: Date.now(),
    };

    const edge: CanvasEdge = {
      id: `edge_${actionNodeId}_to_${childNodeId}`,
      sourceNodeId: actionNodeId,
      targetNodeId: childNodeId,
      sourceHandle: 'output',
      targetHandle: 'input',
      animated: true,
    };

    setNodes(prev => [...prev, parentNode].map(n => n.id === childNodeId ? { ...n, parentId: actionNodeId } : n));
    setEdges(prev => [...prev, edge]);
    setSelectedNodeId(actionNodeId);
  }, [nodes, pushSnapshot]);

  // Add Completed Image Node
  const addCompletedImageNode = useCallback((
    parentId: string | undefined,
    imageUrl: string,
    outputs: NodeOutputItem[],
    promptText: string,
    hubType: HubType,
    workflowId?: number,
    model?: string,
    style?: string,
    costUsd?: number
  ): CanvasNodeData => {
    pushSnapshot();
    let pos = { x: 150, y: 150 };
    const parentNode = parentId ? nodes.find(n => n.id === parentId) : undefined;
    if (parentNode) {
      pos = GraphEngine.calculateForkPosition(parentNode, nodes);
    } else if (nodes.length > 0) {
      const lastNode = nodes[nodes.length - 1];
      pos = { x: lastNode.position.x + 340, y: lastNode.position.y };
    }

    const id = 'node_' + Math.random().toString(36).substring(2, 9);
    const newNode: CanvasNodeData = {
      id,
      type: 'image',
      title: promptText ? (promptText.length > 32 ? promptText.substring(0, 30) + '...' : promptText) : 'AI Render Output',
      subtitle: `${model || 'AI Model'} • ${hubType.replace('_', ' ')}`,
      position: pos,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
      imageUrl,
      outputs: outputs.length > 0 ? outputs : [{ id: 'out_1', url: imageUrl, type: 'image' }],
      activeVariantIndex: 0,
      prompt: promptText,
      hubType,
      workflowId,
      model,
      style,
      status: 'completed',
      costEstimateUsd: costUsd,
      createdAt: Date.now(),
      parentId,
    };

    setNodes(prev => [...prev, newNode]);

    if (parentId) {
      const edge: CanvasEdge = {
        id: `edge_${parentId}_to_${id}`,
        sourceNodeId: parentId,
        targetNodeId: id,
        sourceHandle: 'output',
        targetHandle: 'input',
        animated: true,
      };
      setEdges(prev => [...prev, edge]);
    }

    setSelectedNodeId(id);
    return newNode;
  }, [nodes, pushSnapshot]);

  // Fit to view
  const fitToView = useCallback((containerWidth: number, containerHeight: number) => {
    const fit = GraphEngine.calculateFitViewport(nodes, containerWidth, containerHeight);
    setViewport(fit);
  }, [nodes]);

  // Reset Graph
  const resetGraph = useCallback(() => {
    pushSnapshot();
    setNodes([]);
    setEdges([]);
    setSelectedNodeId(null);
    setPendingConnection(null);
    setViewport({ x: 80, y: 80, zoom: 1 });
  }, [pushSnapshot]);

  return {
    nodes,
    edges,
    viewport,
    selectedNodeId,
    pendingConnection,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undo,
    redo,
    addNode,
    updateNode,
    removeNode,
    moveNode,
    selectNode,
    addEdge,
    removeEdge,
    removeEdgeBetween,
    startConnecting,
    updateConnecting,
    finishConnecting,
    cancelConnecting,
    forkNode,
    forkParentNode,
    addCompletedImageNode,
    setViewport,
    fitToView,
    resetGraph,
  };
}
