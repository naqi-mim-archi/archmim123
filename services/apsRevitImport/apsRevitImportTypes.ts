import { ArchElement, Layer, Level, Project } from '../../types';

export const APS_REVIT_IMPORT_VERSION = 'aps-revit-import-v1';

export type ApsRevitImportJobStatus =
  | 'queued'
  | 'uploading'
  | 'extracting_revit_data'
  | 'converting_to_canvas'
  | 'validating'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed';

export interface ApsRevitImportOptions {
  importModelElements: boolean;
  importPlanAnnotations: boolean;
  importDimensions: boolean;
  importGenericFamiliesAsBlocks: boolean;
  includeLinkedModelReferencesAsWarnings: boolean;
  revitEngine?: string;
}

export interface ApsRevitImportEngineInfo {
  engine: string;
  year: number;
  configured: boolean;
  isDefault: boolean;
}

export interface ApsRevitPoint3 {
  x: number;
  y: number;
  z?: number;
}

export interface ApsRevitCurveManifest {
  kind: 'line' | 'arc' | 'circle' | 'ellipse' | 'polyline' | 'spline' | 'unknown';
  start?: ApsRevitPoint3;
  end?: ApsRevitPoint3;
  center?: ApsRevitPoint3;
  mid?: ApsRevitPoint3;
  normal?: ApsRevitPoint3;
  xDirection?: ApsRevitPoint3;
  yDirection?: ApsRevitPoint3;
  radius?: number;
  radiusX?: number;
  radiusY?: number;
  startAngle?: number;
  endAngle?: number;
  rotation?: number;
  points?: ApsRevitPoint3[];
  isBound?: boolean;
  warning?: string;
}

export interface ApsRevitBoundingBox {
  min: ApsRevitPoint3;
  max: ApsRevitPoint3;
}

export interface ApsRevitLevelManifest {
  elementId: string;
  uniqueId?: string;
  name: string;
  elevation: number;
  order: number;
  parameters?: Record<string, any>;
}

export interface ApsRevitViewManifest {
  elementId: string;
  uniqueId?: string;
  name: string;
  viewType: string;
  levelElementId?: string;
  levelUniqueId?: string;
  levelName?: string;
  isTemplate?: boolean;
  selectedForAnnotations?: boolean;
  ignoredReason?: string;
}

export interface ApsRevitMaterialManifest {
  elementId: string;
  uniqueId?: string;
  name: string;
  color?: string;
  transparency?: number;
}

export interface ApsRevitElementGeometry {
  locationPoint?: ApsRevitPoint3;
  locationCurve?: ApsRevitCurveManifest;
  curves?: ApsRevitCurveManifest[];
  path?: ApsRevitCurveManifest[];
  boundaryLoops?: ApsRevitPoint3[][];
  holes?: ApsRevitPoint3[][];
  footprint?: ApsRevitPoint3[];
  boundingBox?: ApsRevitBoundingBox;
  rotation?: number;
  width?: number;
  depth?: number;
  height?: number;
  thickness?: number;
  diameter?: number;
  area?: number;
  volume?: number;
  text?: string;
  valueText?: string;
  alignment?: string;
  sourceViewId?: string;
  sourceViewName?: string;
  shapeHint?: 'rect' | 'circle' | 'unknown';
  warnings?: string[];
}

export interface ApsRevitElementManifest {
  elementId: string;
  uniqueId?: string;
  category: string;
  builtInCategory?: string;
  className?: string;
  name?: string;
  familyName?: string;
  typeName?: string;
  typeId?: string;
  typeUniqueId?: string;
  levelElementId?: string;
  levelUniqueId?: string;
  levelName?: string;
  hostElementId?: string;
  hostUniqueId?: string;
  materialIds?: string[];
  materialNames?: string[];
  parameters?: Record<string, any>;
  ourAppParameters?: Record<string, any>;
  geometry?: ApsRevitElementGeometry;
  sourceViewId?: string;
  sourceViewName?: string;
  isAnnotation?: boolean;
  isLinkedElement?: boolean;
  warnings?: string[];
}

export interface ApsRevitLinkedModelManifest {
  elementId?: string;
  uniqueId?: string;
  name: string;
  path?: string;
  loaded?: boolean;
}

export interface ApsRevitExtractionManifest {
  manifestVersion: typeof APS_REVIT_IMPORT_VERSION;
  extractedAt: string;
  source: {
    fileName: string;
    revitVersion?: string;
    projectName?: string;
    units: 'feet';
    coordinateSystem: 'revit-internal';
  };
  options?: ApsRevitImportOptions;
  levels: ApsRevitLevelManifest[];
  views: ApsRevitViewManifest[];
  materials?: ApsRevitMaterialManifest[];
  linkedModels?: ApsRevitLinkedModelManifest[];
  elements: ApsRevitElementManifest[];
  warnings: string[];
}

export interface ApsRevitImportReportRow {
  sourceRevitElementId: string;
  sourceRevitUniqueId?: string;
  sourceRevitCategory: string;
  sourceRevitFamilyType?: string;
  targetNativeType?: string;
  targetAppElementId?: string;
  result: 'native' | 'fallback' | 'skipped';
  warning?: string;
  fallbackReason?: string;
}

export interface ApsRevitImportReport {
  importVersion: typeof APS_REVIT_IMPORT_VERSION;
  status: 'completed' | 'completed_with_warnings' | 'failed';
  source: ApsRevitExtractionManifest['source'];
  selectedRevitEngine?: string;
  projectName: string;
  sourceElementCount: number;
  importedElementCount: number;
  nativeElementCount: number;
  fallbackElementCount: number;
  skippedElementCount: number;
  levels: Array<Level & { sourceElementId?: string; sourceUniqueId?: string }>;
  selectedPlanViews: ApsRevitViewManifest[];
  ignoredPlanViews: ApsRevitViewManifest[];
  linkedModels: ApsRevitLinkedModelManifest[];
  classCounts: Record<string, number>;
  targetTypeCounts: Record<string, number>;
  elementMappings: ApsRevitImportReportRow[];
  warnings: string[];
  errors: string[];
  validation: Record<string, string | number | boolean | string[]>;
}

export interface ApsRevitImportConversionResult {
  project: Project;
  levels: Level[];
  elements: ArchElement[];
  layers: Layer[];
  report: ApsRevitImportReport;
  canConvert: boolean;
}

export interface ApsRevitImportJobResponse {
  jobId: string;
  status: ApsRevitImportJobStatus;
  progressMessage: string;
  warnings: string[];
  errors?: string[];
  project?: Project | null;
  report?: ApsRevitImportReport | null;
  manifest?: ApsRevitExtractionManifest | null;
  workItemId?: string;
  manifestUrl?: string | null;
  projectJsonUrl?: string | null;
  reportUrl?: string | null;
  executionLogUrl?: string | null;
  inputObjectKey?: string;
  manifestObjectKey?: string;
  reportObjectKey?: string;
  projectObjectKey?: string;
  logObjectKey?: string;
}

export interface ApsRevitImportStartRequest {
  fileName: string;
  fileBase64: string;
  options: ApsRevitImportOptions;
}
