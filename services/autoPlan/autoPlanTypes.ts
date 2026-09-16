import { ArchElement, Point, UnitSystem } from '../../types';

export type AutoPlanResidentialCategory =
  | 'Apartments'
  | 'Houses / Villas'
  | 'Shared / Special Residential'
  | 'Other Category';

export type AutoPlanResidentialType =
  | 'Studio'
  | '1 Bedroom'
  | '2 Bedroom'
  | '3 Bedroom'
  | '4 Bedroom'
  | 'Duplex'
  | 'Penthouse'
  | 'Serviced Apartment'
  | 'House'
  | 'Villa'
  | 'Row House'
  | 'Farmhouse'
  | 'Mansion'
  | 'Co-living'
  | 'Student Housing'
  | 'Senior Living'
  | 'Other / Custom Residential';

export type AutoPlanBoundaryType = 'rectangle' | 'polygon' | 'dimensions';
export type AutoPlanGenerationStage = 'setup' | 'nodes' | 'walls' | 'openings' | 'import';
export type AutoPlanSource = 'model' | 'user' | 'rule';

export interface AutoPlanBoundary {
  type: AutoPlanBoundaryType;
  points: Point[];
  width?: number;
  height?: number;
  area?: number;
  units: string;
}

export interface AutoPlanBriefRoom {
  type: string;
  count: number;
  required: boolean;
  publicZone?: boolean;
  privateZone?: boolean;
  serviceZone?: boolean;
  kitchenType?: 'open' | 'closed';
  modelType?: string;
  modelTypeId?: number;
  displayLabel?: string;
  unsupportedByModel?: boolean;
  metadata?: Record<string, any>;
}

export interface AutoPlanAdjacencyRule {
  spaceA: string;
  spaceB: string;
  relationship: 'connected' | 'near_or_connected' | 'near' | 'avoid';
}

export interface AutoPlanBrief {
  projectType: 'residential';
  category: AutoPlanResidentialCategory;
  residentialType: AutoPlanResidentialType;
  boundary: AutoPlanBoundary;
  rooms: AutoPlanBriefRoom[];
  adjacencyRules: AutoPlanAdjacencyRule[];
  negativeRules: AutoPlanAdjacencyRule[];
  mustHave: string[];
  mustNotHave: string[];
  exclusions: string[];
  notes: string;
  originalPrompt: string;
  unsupportedRequests: Array<{
    requestedType: string;
    mappedTo?: string;
    reason: string;
  }>;
}

export interface AutoPlanBriefInput {
  prompt: string;
  category: AutoPlanResidentialCategory;
  residentialType: AutoPlanResidentialType;
  bedrooms: number;
  bathrooms: number;
  kitchens: number;
  balconies: number;
  openKitchen: boolean;
  requiredSpaces: string[];
  optionalSpaces: string[];
  adjacencyNotes: string;
  mustHave: string;
  mustNotHave: string;
  exclusions: string;
  notes: string;
}

export interface AutoPlanRoomNode {
  id: string;
  type: string;
  label: string;
  x: number;
  y: number;
  radius?: number;
  areaHint?: number;
  required: boolean;
  source: AutoPlanSource;
  locked?: boolean;
  publicZone?: boolean;
  privateZone?: boolean;
  serviceZone?: boolean;
  metadata?: Record<string, any>;
}

export interface AutoPlanWallSegment {
  id: string;
  start: Point;
  end: Point;
  thickness: number;
  wallType?: string;
  source: AutoPlanSource;
  roomIds?: string[];
  metadata?: Record<string, any>;
}

export interface AutoPlanOpening {
  id: string;
  type: 'door' | 'window' | 'wall_opening';
  hostWallId: string;
  position: number;
  width: number;
  height?: number;
  sillHeight?: number;
  swing?: string;
  source: AutoPlanSource;
  roomId?: string;
  metadata?: Record<string, any>;
}

export interface AutoPlanRoomPolygon {
  id: string;
  type: string;
  label: string;
  boundary: Point[];
  area?: number;
  source: AutoPlanSource;
  modelTypeId?: number;
  metadata?: Record<string, any>;
}

export interface AutoPlanMetadata {
  generator: 'Auto Plan';
  feature: 'AI Residential Floorplan Generator';
  model: 'house_diffusion';
  modelWeightsPath: string;
  sourcePrototypePath: string;
  createdAt: string;
  inferenceStage?: string;
  diagnostics?: Record<string, any>;
}

export interface AutoPlanImportPayload {
  boundary: AutoPlanBoundary;
  brief: AutoPlanBrief;
  nodes: AutoPlanRoomNode[];
  walls: AutoPlanWallSegment[];
  openings: AutoPlanOpening[];
  rooms?: AutoPlanRoomPolygon[];
  metadata: AutoPlanMetadata;
}

export interface AutoPlanInferenceRequest {
  boundary: AutoPlanBoundary;
  briefInput: AutoPlanBriefInput;
  approvedNodes?: AutoPlanRoomNode[];
  approvedWalls?: AutoPlanWallSegment[];
  stage?: Exclude<AutoPlanGenerationStage, 'setup' | 'import'>;
  unitSystem?: UnitSystem;
}

export interface AutoPlanInferenceResponse {
  payload: AutoPlanImportPayload;
  projectElements?: ArchElement[];
  warnings: string[];
  logs: Array<{ level: 'info' | 'warning' | 'error'; message: string; code?: string }>;
}

export const AUTO_PLAN_RESIDENTIAL_OPTIONS: Array<{
  category: AutoPlanResidentialCategory;
  types: AutoPlanResidentialType[];
}> = [
  {
    category: 'Apartments',
    types: ['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4 Bedroom', 'Duplex', 'Penthouse', 'Serviced Apartment'],
  },
  {
    category: 'Houses / Villas',
    types: ['House', 'Villa', 'Row House', 'Farmhouse', 'Mansion'],
  },
  {
    category: 'Shared / Special Residential',
    types: ['Co-living', 'Student Housing', 'Senior Living'],
  },
  {
    category: 'Other Category',
    types: ['Other / Custom Residential'],
  },
];

export const AUTO_PLAN_PROTOTYPE_PATH_DEFAULT =
  'C:\\Users\\Muhammad Naqi Ejaz\\Documents\\Temp 23\\Archi26\\01. Codes\\02. Working Codes\\synaps-clone-mini';

export const AUTO_PLAN_MODEL_PATH_DEFAULT =
  'C:\\Users\\Muhammad Naqi Ejaz\\Documents\\Temp 23\\Archi26\\06. Available Model\\01. HouseDiffusion\\model250000.pt';
