
export type BuildingType = 
  | 'residential' 
  | 'commercial' 
  | 'institutional' 
  | 'industrial' 
  | 'mixed-use';

export type ProjectMode = 'floorplan' | 'urban';

export type UrbanElementType =
  | 'building-mass'
  | 'road'
  | 'landscape'
  | 'water-body'
  | 'infrastructure'
  | 'parcel'
  | 'urban-block'
  | 'zone'
  | 'asset';

export type AssetType = 'tree' | 'bench' | 'streetlight' | 'car' | 'people' | 'bim-object';

export type AdjacencyKind = 'must_touch' | 'near' | 'avoid' | 'level_sync';

export interface AdjacencyRule {
  to: string;
  kind: AdjacencyKind;
  weight: number;
}

export interface SpaceSpec {
  id: string;
  type: string;
  label: string;
  zone: 'public' | 'private' | 'service' | 'core' | 'hazard';
  minAreaM2?: number;
  targetAreaM2?: number;
  maxAreaM2?: number;
  minWidthM?: number;
  aspectRange?: [number, number];
  daylight?: 'required' | 'preferred' | 'optional' | 'none';
  exteriorContact?: 'required' | 'preferred' | 'none';
  passThrough?: 'never' | 'allowed';
  wetCore?: boolean;
  adjacency?: AdjacencyRule[];
}

export interface SpatialZone extends SpaceSpec {
  weight: number; 
  color?: string;
  subSpaces?: SpatialZone[];
  depth?: number;
}

export interface SpatialProgram {
  id: string;
  name: string;
  icon?: string;
  zones: SpatialZone[];
  minLayoutDim?: number;
}

export interface ProgramBrief {
  templateId: string;
  buildingType: BuildingType;
  spaces: SpaceSpec[];
  entryAnchors: string[];
  zoneOrder: string[];
  codePack: string;
}

export interface LayoutSolution {
  rooms: ArchElement[];
  corridors: ArchElement[];
  doors: ArchElement[];
  windows: ArchElement[];
  score: number;
  violations: string[];
}

export type ElementType =
  | 'line'
  | 'gridline'
  | 'wall'
  | 'arc'
  | 'circle'
  | 'ellipse'
  | 'rectangle'
  | 'door'
  | 'window'
  | 'wall-opening'
  | 'floor'
  | 'ceiling'
  | 'elevation-marker'
  | 'room'
  | 'stair'
  | 'column'
  | 'furniture'
  | 'dimension'
  | 'label'
  | 'railing'
  | 'counter'
  | 'fixture'
  | 'group'
  | 'cad-underlay'
  | UrbanElementType;

export type PlanningStyle =
  | 'open-social-core'
  | 'private-wing'
  | 'central-hub'
  | 'spine-plan'
  | 'courtyard-indoor-outdoor'
  | 'dual-anchor'
  | 'side-wet-core'
  | 'entry-wet-pod'
  | 'linear-galley'
  | 'balcony-front'
  | 'sleeping-alcove'
  | 'corner-facade'
  | 'hotel-style';

export type GeometryStyle =
  | 'rectilinear'
  | 'angular-oblique'
  | 'curved'
  | 'hybrid'
  | 'courtyard-ring'
  | 'organic-freeform';

export type LayoutTypology = PlanningStyle;
export type LayoutGeometry = GeometryStyle;

export interface ProceduralConfig {
  typology: string;
  subtype?: string;
  style: LayoutTypology;
  geometry: LayoutGeometry;
  requirements: {
    numBedrooms?: number;
    numBaths?: number;
    numKitchens?: number;
    numBalconies?: number;
    numStaff?: number;
    numMeetingRooms?: number;
    numExecutiveCabins?: number;
    seatingCapacity?: number;
    hasCounter?: boolean;
    hasWarehouse?: boolean;
    hasClinic?: boolean;
    hasLab?: boolean;
    userPrompt?: string;
    includeCourtyard?: boolean;
    privacyPriority?: 'low' | 'medium' | 'high';
    circulationPreference?: 'compact' | 'spacious';
    [key: string]: any;
  };
  globals: {
    wallThickness: number;
    wallHeight: number;
    unitSystem: UnitSystem;
  };
}

export type UnitSystem = 'metric' | 'imperial';
export type ViewMode = '2D' | '3D';
export type ElevationDirection = 'N' | 'S' | 'E' | 'W';
export type DrawingViewId = 'plan' | `elevation-${Lowercase<ElevationDirection>}`;

export interface Point {
  x: number;
  y: number;
}

export interface Level {
  id: string;
  name: string;
  zElevation: number; // Height from ground (0)
  height: number; // Ceiling height for this level
  order: number;
  metadata?: any;
}

export interface ArchElement {
  id: string;
  type: ElementType;
  locked?: boolean;
  isPlacingDraft?: boolean;
  levelId?: string; // Associated level ID
  layer?: string; // AutoCAD Layer association
  p1?: Point;
  p2?: Point;
  p3?: Point; 
  p4?: Point; 
  thickness?: number;
  pos?: Point;
  rotation?: number;
  width?: number;
  depth?: number; 
  height?: number; 
  label?: string;
  direction?: string; // For elevation markers
  viewId?: DrawingViewId; // Plan/elevation annotation ownership
  sourceType?: ElementType | 'revit_import' | 'aps_revit_import' | 'bim_export' | 'bim_import'; // Synthetic elevation drafting source type or imported asset source
  isFlipped?: boolean;
  facingFlipped?: boolean;
  isCurved?: boolean;
  controlPoint?: Point;
  arcCenter?: Point;
  arcRadius?: number;
  arcStartAngle?: number;
  arcEndAngle?: number;
  arcCounterclockwise?: boolean;
  ellipseCenter?: Point;
  ellipseRadiusX?: number;
  ellipseRadiusY?: number;
  ellipseRotation?: number;
  ellipseStartAngle?: number;
  ellipseEndAngle?: number;
  ellipseCounterclockwise?: boolean;
  color?: string;
  wallSource?: string;
  hostWallId?: string;
  hostT?: number; 
  startT?: number; // Used for splitting closed curve walls
  endT?: number;   // Used for splitting closed curve walls

  // ===== Subtype / Specification =====
  subType?: string; 
  /** Catalog identity, kept separate because several presets share one operation subtype. */
  presetId?: string;
  /** Audit trail for image-derived elements. */
  digitizationProvenance?: 'observed' | 'brief-derived' | 'code-default' | 'repair-generated';
  digitizationConfidence?: number;
  digitizationEvidence?: {
    source: 'raster' | 'ocr' | 'design-brief' | 'catalog-default' | 'geometry-repair';
    pixelBounds?: { x0: number; y0: number; x1: number; y1: number };
    notes?: string[];
  };
  measuredWidth?: number;
  measuredHeight?: number;
  measuredThickness?: number;
  assumedProperties?: string[];
  category?: string;
  iconType?: string;
  assetId?: string;
  sourceFileType?: 'rfa' | 'rvt' | string;
  sourceFileName?: string;
  revitFamilyName?: string;
  revitTypeName?: string;
  classname?: string;
  displayName?: string;
  userCategory?: string;
  isImportedAsset?: boolean;
  nativeCatalogAsset?: boolean;
  modelUrl?: string;
  gltfUrl?: string;
  model3D?: any;
  planView2D?: any;
  elevationViews?: any;
  thumbnail?: string;
  dimensions?: any;
  materials?: any[];
  metadata?: any;
  importTimestamp?: string;
  importVersion?: string;
  bimSourceId?: string;
  bimSourceCategory?: string;
  bimBaseLevelId?: string;
  bimTopLevelId?: string;
  baseOffset?: number;
  topOffset?: number;
  snapMode?: 'hard-wall' | 'preferred-wall' | 'counter-only' | 'default';
  isDigitized?: boolean;
  shape?: 'rect' | 'circle' | 'L' | 'U'; 

  // ===== 3D fields (meters) =====
  elevation?: number;
  sillHeight?: number;
  topHeight?: number;
  customMeshData?: { vertices: number[]; faces: number[] }; // Loaded custom OBJ geometry
  bimMetadata?: any; // Revit family metadata and raw binary data
  seatsCount?: number; // Parametric seating count
  bedPillows?: number; // Pillow layout override
  symbolBaseWidth?: number; // Stable symbol module baseline for independently resizable interior blocks
  symbolBaseDepth?: number; // Stable symbol module baseline for independently resizable interior blocks
  symbolLeftArmDepth?: number; // Optional independent U-shape left arm depth
  symbolRightArmDepth?: number; // Optional independent U-shape right arm depth

  // ===== Floor / Ceiling =====
  boundary?: Point[];
  proceduralId?: string;
  proceduralProgramId?: string;
  proceduralTypology?: string;
  proceduralGeometry?: string;
  proceduralBoundary?: { x: number, y: number, w: number, h: number };
  proceduralBoundaryPoints?: Point[];
  proceduralRequirements?: any;
  isProceduralHost?: boolean;
  isAIGeneratedFloor?: boolean;
  isSmartProceduralHost?: boolean;
  isAutoProceduralHost?: boolean;
  
  // ===== Urban Fields =====
  usageType?: BuildingType | 'infrastructure' | 'park' | 'water' | 'road';
  gfaM2?: number;
  footprintAreaM2?: number;
  far?: number;
  floors?: number;
  density?: number; // people/ha or similar
  
  // ===== Zone Specifics =====
  zoneType?: BuildingType | 'mixed' | 'park';
  preferDensity?: 'low' | 'medium' | 'high';
  preferTypology?: 'perimeter' | 'tower' | 'slab' | 'any';
  
  // ===== Asset Specifics =====
  assetType?: AssetType;
  scale?: number;
  groupId?: string;

  // ===== Rich Label & Dimension Styling =====
  textBold?: boolean;
  textItalic?: boolean;
  textUnderline?: boolean;
  textAlignment?: 'left' | 'center' | 'right';
  textFontSize?: number;
  textFontFamily?: string;
  dimensionColor?: string;
  dimensionLineThickness?: number;
  dimensionShowExtension?: boolean;
  dimensionPrecision?: number;
  roomNameOnly?: boolean;  // Toggle to show name only, or name with detailed measurements
  roomShowArea?: boolean;  // Toggle to show area inside room labels
  cadElements?: ArchElement[]; // Nested elements for CAD underlays
  isCadUnderlay?: boolean;  // Render flags
  parentUnderlayId?: string; // Render flags
  customRoomWidth?: number;  // Customize automatic label dimensions
  customRoomDepth?: number;  // Customize automatic label dimensions

  // Separate styling options for Dimension/Area text inside room labels
  dimBold?: boolean;
  dimItalic?: boolean;
  dimUnderline?: boolean;
  dimFontSize?: number;
  dimFontFamily?: string;
  dimColor?: string;
}

export interface ProjectSettings3D {
  // Global defaults used when creating new levels
  defaultLevelHeight: number;
  slabThickness: number;

  wallHeight: number; // Default wall height
  doorHeight: number;
  windowSillHeight: number;
  windowTopHeight: number;
  wallOpeningHeight: number;
  
  level1Z: number;
  level2Z: number; 
  inchesDecimalPlaces?: number;
}

export interface UrbanSettings {
  targetGFA?: number;
  totalSiteArea?: number;
  targetFAR?: number;
  greenSpacePercent?: number;
  heightConstraintM?: number;
}

export interface SiteMap {
  url: string;
  opacity: number;
  scale: number;
  offset: Point;
  rotation: number;
  isVisible: boolean;
}

export interface SiteLocation {
  lat: number;
  lng: number;
  address: string;
}

export interface TerrainSettings {
  isEnabled: boolean;
  data: number[][]; // Height grid
  resolution: number; // meters between grid points
  origin: Point; // Offset in world coordinates
  size: { width: number; height: number }; // Dimensions in meters
}

export interface Layer {
  name: string;
  visible: boolean;
  locked: boolean;
  color?: string;
}

export interface Project {
  name: string;
  mode: ProjectMode;
  levels: Level[];
  elements: ArchElement[];
  viewBox: { width: number; height: number };
  settings3D?: ProjectSettings3D;
  metadata?: any;
  urbanSettings?: UrbanSettings;
  siteMap?: SiteMap;
  location?: SiteLocation;
  terrain?: TerrainSettings;
  layers?: Layer[];
}

export type EditorTool = 
  | 'select' 
  | 'move'
  | 'copy'
  | 'rotate'
  | 'wall' 
  | 'door' 
  | 'window' 
  | 'wall-opening'
  | 'room' 
  | 'stair' 
  | 'column' 
  | 'furniture'
  | 'counter'
  | 'fixture'
  | 'railing'
  | 'pan'
  | 'delete'
  | 'dimension'
  | 'line'
  | 'gridline'
  | 'rect'
  | 'arc'
  | 'ellipse'
  | 'circle'
  | 'split'
  | 'floor'
  | 'ceiling'
  | 'procedural-boundary'
  | 'smart-procedural-boundary'
  | 'auto-procedural-boundary'
  | 'procedural-polygon'
  | 'procedural-circle'
  | 'building-mass'
  | 'road'
  | 'landscape'
  | 'water-body'
  | 'zone'
  | 'map-adjust'
  | 'tree'
  | 'streetlight'
  | 'bench'
  | 'car'
  | 'walk'
  | 'snap';

export type DockPosition = 'top' | 'bottom' | 'left' | 'right';

export interface EditorState {
  zoom: number;
  offset: Point;
  selectedIds: string[];
  isPanning: boolean;
  activeTool: EditorTool;
  activeLevelId: string; // Currently active floor ID
  
  activePreset?: {
    id?: string;
    label?: string;
    type?: EditorTool;
    subType?: string;
    width?: number;
    depth?: number;
    height?: number;
    thickness?: number;
    shape?: string;
    assetId?: string;
    sourceType?: 'revit_import' | 'bim_export' | 'bim_import' | string;
    sourceFileType?: 'rfa' | 'rvt' | string;
    sourceFileName?: string;
    revitFamilyName?: string;
    revitTypeName?: string;
    classname?: string;
    displayName?: string;
    userCategory?: string;
    isImportedAsset?: boolean;
    nativeCatalogAsset?: boolean;
    model3D?: any;
    planView2D?: any;
    elevationViews?: any;
    thumbnail?: string;
    dimensions?: any;
    materials?: any[];
    metadata?: any;
    importTimestamp?: string;
    importVersion?: string;
    category?: string;
    iconType?: string;
    mainCategory?: string;
    subCategory?: string;
    catalogGroup?: string;
    seatsCount?: number;
    bedPillows?: number;
    customMeshData?: { vertices: number[]; faces: number[] };
    bimMetadata?: any;
  };
  isGridVisible: boolean;
  isSnapEnabled: boolean;
  isWallMode: boolean;
  unitSystem: UnitSystem;
  viewMode: ViewMode;
  drawingView?: DrawingViewId;
  isOrthoEnabled: boolean;
  isEndpointSnap: boolean;
  isMidpointSnap: boolean;
  isIntersectionSnap: boolean;
  isPointAlignmentSnap: boolean;
  isAngularAlignmentSnap: boolean;
  tempBoundaryIds?: string[]; 
  editingBoundaryId?: string; 
  
  multiPointBuffer?: Point[];
  isSiteMapVisible: boolean;
  canvasAngle?: number;
  lastActiveTool?: EditorTool;
  lastIsWallMode?: boolean;
  isDraggingSelected?: boolean;
  showLevelAbove?: boolean;
  showLevelBelow?: boolean;
}
