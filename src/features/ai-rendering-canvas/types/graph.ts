import { Workflow } from '../../../../services/aiRender/workflowRegistry';

export type HubType = 'image_studio' | 'raster_canvas' | 'video_studio' | 'gen_3d';

export type NodeType = 'image' | 'action' | 'upload' | 'prompt_hub';

export type NodeJobStatus = 'idle' | 'queued' | 'running' | 'completed' | 'failed';

export interface PortPosition {
  x: number;
  y: number;
}

export interface NodeOutputItem {
  id: string;
  url: string;
  type?: 'image' | 'video' | '3d';
  mimeType?: string;
}

export interface CanvasNodeData {
  id: string;
  type: NodeType;
  title: string;
  subtitle?: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;

  // Image & Output data
  imageUrl?: string;
  inputImageUrl?: string;
  outputs?: NodeOutputItem[];
  activeVariantIndex?: number;
  
  // Prompt & In-Node Modular Workflow context
  prompt?: string;
  compiledPrompt?: string;
  hubType?: HubType;
  workflowId?: number;
  model?: string;
  style?: string;
  aspectRatio?: string;
  resolution?: string;
  variants?: number;
  controlNetEnabled?: boolean;
  controlNetStrength?: number;
  imageStyle?: string;
  uploadedImages?: any[];
  incomingEdgeTags?: Record<string, string>;
  peopleOption?: string;
  cameraOption?: string;
  lightingOption?: string;
  materialsOption?: string;
  environmentOption?: string;
  moodOption?: string;
  customCameraInput?: string;
  customLightingInput?: string;
  customMaterialsInput?: string;
  customEnvironmentInput?: string;
  customMoodInput?: string;
  customImageAspectRatio?: string;
  inputImageDimensions?: { width: number; height: number };
  durationSeconds?: number;
  audioEnabled?: boolean;
  cameraMotion?: string;
  
  // UI & Flow states
  isInitialBlank?: boolean;
  isConfiguring?: boolean;
  
  // Execution status
  status: NodeJobStatus;
  progress?: number;
  processingTimeMs?: number;
  costEstimateUsd?: number;
  error?: string;

  // Metadata
  createdAt: number;
  parentId?: string;
}

export interface CanvasEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: 'output';
  targetHandle?: 'input';
  label?: string;
  animated?: boolean;
}

export interface GraphViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface PendingConnection {
  sourceNodeId: string;
  sourceHandle: 'output';
  currentMousePos: { x: number; y: number };
}

// Serializable snapshot of the whole canvas (also used by undo in useGraphStore).
export interface GraphSnapshot {
  nodes: CanvasNodeData[];
  edges: CanvasEdge[];
  selectedNodeId: string | null;
}

export interface RenderSessionAsset {
  url: string;
  mime: string;
  bytes: number;
}

// What a saved render session holds. Image payloads are uploaded to Storage and
// referenced by URL here; `assets` maps content hash -> uploaded asset.
export interface RenderSessionDocV1 {
  version: 1;
  activeHub: HubType;
  viewport: GraphViewport;
  selectedNodeId: string | null;
  nodes: CanvasNodeData[];
  edges: CanvasEdge[];
  assets: Record<string, RenderSessionAsset>;
  savedAt: number;
}
