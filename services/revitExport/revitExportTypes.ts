import { UnitSystem } from '../../types';
import { ProjectExportLevelScope } from '../sharedBim/projectExportUtils';

export const REVIT_EXPORT_VERSION = 'revit-export-v1';

export type RevitExportJobStatus =
  | 'queued'
  | 'preparing_manifest'
  | 'uploading'
  | 'processing'
  | 'validating'
  | 'completed'
  | 'completed_with_warnings'
  | 'failed';

export type RevitManifestElementType =
  | 'wall'
  | 'door'
  | 'window'
  | 'wall-opening'
  | 'floor'
  | 'ceiling'
  | 'room'
  | 'column'
  | 'stair'
  | 'railing'
  | 'gridline'
  | 'annotation'
  | 'group'
  | 'furniture'
  | 'fallback';

export interface RevitExportOptions {
  projectName: string;
  projectDescription?: string;
  projectCode?: string;
  revitEngine?: string;
  unitSystem: UnitSystem;
  levelScope: ProjectExportLevelScope;
  activeLevelId?: string;
  selectedLevelIds: string[];
  includeFurniture: boolean;
  includeAnnotations: boolean;
  includeUnsupportedAsDirectShape: boolean;
  createNativeFamilies: boolean;
  runValidation: boolean;
}

export interface RevitManifestPoint {
  x: number;
  y: number;
}

export interface RevitManifestLevel {
  id: string;
  name: string;
  elevation: number;
  height: number;
  order: number;
  metadata?: Record<string, any>;
}

export interface RevitManifestElement {
  id: string;
  type: RevitManifestElementType;
  sourceType: string;
  levelId?: string;
  label?: string;
  subType?: string;
  category?: string;
  geometry: Record<string, any>;
  dimensions: Record<string, any>;
  material?: {
    name: string;
  };
  relationships: Record<string, any>;
  metadata: Record<string, any>;
  exportStrategy: 'native' | 'native-or-fallback' | 'direct-shape-fallback' | 'metadata-only';
}

export interface RevitExportManifest {
  manifestVersion: typeof REVIT_EXPORT_VERSION;
  createdAt: string;
  project: {
    id: string;
    name: string;
    description: string;
    projectCode: string;
    unitSystem: UnitSystem;
    sourceLinearUnit: 'meters';
    coordinateSystem: 'canvas-y-down';
    projectOriginMode: 'internal-origin';
  };
  levels: RevitManifestLevel[];
  elements: RevitManifestElement[];
  settings: {
    includeFurniture: boolean;
    includeAnnotations: boolean;
    includeUnsupportedAsDirectShape: boolean;
    createNativeFamilies: boolean;
    runValidation: boolean;
    revitEngine?: string;
  };
  summary: {
    sourceElementCount: number;
    exportedElementCount: number;
    skippedElementCount: number;
    fallbackElementCount: number;
    classCounts: Record<string, number>;
    warnings: string[];
  };
}

export interface RevitExportStartRequest {
  projectId?: string;
  levelScope?: ProjectExportLevelScope;
  selectedLevelIds?: string[];
  includeFurniture?: boolean;
  includeAnnotations?: boolean;
  includeUnsupportedAsDirectShape?: boolean;
  revitEngine?: string;
  manifest: RevitExportManifest;
}

export interface RevitExportEngineInfo {
  engine: string;
  year: number;
  configured: boolean;
  isDefault: boolean;
}

export interface RevitExportJobResponse {
  jobId: string;
  status: RevitExportJobStatus;
  progressMessage: string;
  warnings: string[];
  errors?: string[];
  downloadUrl: string | null;
  reportUrl: string | null;
  manifestObjectKey?: string;
  rvtObjectKey?: string;
  reportObjectKey?: string;
  workItemId?: string;
}

export interface RevitExportReport {
  exportVersion: typeof REVIT_EXPORT_VERSION;
  status: 'completed' | 'completed_with_warnings' | 'failed';
  projectName: string;
  sourceElementCount: number;
  revitElementCount: number;
  nativeElementCount: number;
  fallbackDirectShapeCount: number;
  skippedElementCount: number;
  levels: Array<{
    sourceLevelId: string;
    name: string;
    elevation: number;
    revitLevelId?: string;
  }>;
  classCounts: Record<string, number>;
  elementMappings: Array<{
    sourceElementId: string;
    sourceType: string;
    revitElementId?: string;
    revitUniqueId?: string;
    revitElementIds?: string[];
    revitUniqueIds?: string[];
    result: 'native' | 'segmented-native' | 'direct-shape' | 'skipped' | 'failed';
    revitCategory?: string;
    fallbackReason?: string;
    validation?: string;
    warning?: string;
    error?: string;
  }>;
  warnings: string[];
  errors: string[];
  validation: Record<string, string | boolean>;
}
