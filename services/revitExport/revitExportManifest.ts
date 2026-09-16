import { ArchElement, Project } from '../../types';
import {
  DEFAULT_PROJECT_SETTINGS_3D,
  DOOR_HEIGHT_DEFAULT,
  WALL_HEIGHT_DEFAULT,
  WALL_OPENING_HEIGHT_DEFAULT,
  WALL_THICKNESS_DEFAULT,
  WINDOW_SILL_HEIGHT_DEFAULT,
  WINDOW_TOP_HEIGHT_DEFAULT,
} from '../../constants';
import {
  cleanExportFileName,
  closeBoundary,
  elementMaterialName,
  findHostWall,
  getExportableProjectSlice,
  pointDistance,
  polygonCentroid,
  sampleCurveElement,
  wallThickness,
} from '../sharedBim/projectExportUtils';
import {
  REVIT_EXPORT_VERSION,
  RevitExportManifest,
  RevitExportOptions,
  RevitManifestElement,
  RevitManifestElementType,
} from './revitExportTypes';

export const getDefaultRevitExportOptions = (
  project: Project,
  unitSystem: RevitExportOptions['unitSystem'] = 'metric',
  activeLevelId?: string,
): RevitExportOptions => ({
  projectName: project.name || 'Archi AI Revit Export',
  projectDescription: project.metadata?.description || '',
  projectCode: project.metadata?.projectCode || '',
  revitEngine: '',
  unitSystem,
  levelScope: 'all',
  activeLevelId,
  selectedLevelIds: project.levels.map(level => level.id),
  includeFurniture: true,
  includeAnnotations: true,
  includeUnsupportedAsDirectShape: true,
  createNativeFamilies: true,
  runValidation: true,
});

const classCountsFrom = (elements: RevitManifestElement[]): Record<string, number> => (
  elements.reduce<Record<string, number>>((counts, element) => {
    counts[element.type] = (counts[element.type] || 0) + 1;
    return counts;
  }, {})
);

const baseMetadata = (element: ArchElement) => ({
  originalNativeType: element.type,
  sourceLayer: element.layer,
  sourceViewId: element.viewId,
  sourceGroupId: element.groupId,
  sourceFileName: element.sourceFileName,
  sourceType: element.sourceType,
  bimImportSourceId: element.bimSourceId,
  ifcGuid: element.metadata?.bimExport?.ifcGuid,
  ifcClass: element.metadata?.bimExport?.ifcClass,
  customMetadata: element.metadata,
});

const dimensionsForHosted = (element: ArchElement, type: 'door' | 'window') => {
  const sillHeight = type === 'window'
    ? Math.max(0, element.sillHeight ?? element.elevation ?? WINDOW_SILL_HEIGHT_DEFAULT)
    : Math.max(0, element.elevation ?? 0);
  const topHeight = type === 'window'
    ? Math.max(sillHeight + 0.05, element.topHeight ?? WINDOW_TOP_HEIGHT_DEFAULT)
    : undefined;
  return {
    width: Math.max(0.05, element.width || (type === 'door' ? 0.9 : 1.2)),
    height: Math.max(0.05, element.height || (topHeight ? topHeight - sillHeight : DOOR_HEIGHT_DEFAULT)),
    sillHeight: type === 'window' ? sillHeight : undefined,
    topHeight,
    baseOffset: type === 'door' ? sillHeight : undefined,
    rotation: element.rotation || 0,
  };
};

const levelForElement = (element: ArchElement, levels: Project['levels']) => (
  levels.find(level => level.id === element.levelId)
);

const defaultVerticalHeight = (element: ArchElement, levels: Project['levels'], settings3D?: Project['settings3D']) => (
  element.height
  || levelForElement(element, levels)?.height
  || settings3D?.wallHeight
  || settings3D?.defaultLevelHeight
  || DEFAULT_PROJECT_SETTINGS_3D.wallHeight
  || WALL_HEIGHT_DEFAULT
);

const defaultSlabThickness = (settings3D?: Project['settings3D']) => (
  settings3D?.slabThickness || DEFAULT_PROJECT_SETTINGS_3D.slabThickness || 0.3
);

const createWallManifest = (
  element: ArchElement,
  options: RevitExportOptions,
  levels: Project['levels'],
  settings3D?: Project['settings3D'],
): RevitManifestElement | null => {
  if (!element.p1 || !element.p2) return null;
  const curveSamples = element.isCurved || element.wallSource === 'arc' || element.wallSource === 'circle' || element.wallSource === 'ellipse'
    ? sampleCurveElement(element, 32)
    : undefined;
  const isNativeStraight = !element.isCurved && (!element.wallSource || element.wallSource === 'line') && !!element.p1 && !!element.p2;
  const isNativeArc = element.wallSource === 'arc' && (!!element.controlPoint || (!!element.arcCenter && !!element.arcRadius && element.arcStartAngle !== undefined && element.arcEndAngle !== undefined));
  const canCreateNativeWall = isNativeStraight || isNativeArc || (curveSamples && curveSamples.length >= 2);
  return {
    id: element.id,
    type: 'wall',
    sourceType: element.type,
    levelId: element.levelId,
    label: element.label || element.subType || 'Wall',
    subType: element.subType,
    category: element.category,
    geometry: {
      kind: element.wallSource || (element.isCurved ? 'curved' : 'line'),
      p1: element.p1,
      p2: element.p2,
      p3: element.p3,
      p4: element.p4,
      controlPoint: element.controlPoint,
      arcCenter: element.arcCenter,
      arcRadius: element.arcRadius,
      arcStartAngle: element.arcStartAngle,
      arcEndAngle: element.arcEndAngle,
      arcCounterclockwise: element.arcCounterclockwise,
      ellipseCenter: element.ellipseCenter,
      ellipseRadiusX: element.ellipseRadiusX,
      ellipseRadiusY: element.ellipseRadiusY,
      ellipseRotation: element.ellipseRotation,
      ellipseStartAngle: element.ellipseStartAngle,
      ellipseEndAngle: element.ellipseEndAngle,
      ellipseCounterclockwise: element.ellipseCounterclockwise,
      startT: element.startT,
      endT: element.endT,
      samples: curveSamples,
    },
    dimensions: {
      thickness: wallThickness(element),
      height: Math.max(0.05, defaultVerticalHeight(element, levels, settings3D)),
      baseOffset: element.baseOffset ?? element.elevation ?? 0,
      topOffset: element.topOffset ?? 0,
    },
    material: { name: elementMaterialName(element, 'Wall Material') },
    relationships: {
      baseLevelId: element.bimBaseLevelId || element.levelId,
      topLevelId: element.bimTopLevelId,
    },
    metadata: baseMetadata(element),
    exportStrategy: canCreateNativeWall ? 'native-or-fallback' : (options.includeUnsupportedAsDirectShape ? 'direct-shape-fallback' : 'metadata-only'),
  };
};

const createHostedManifest = (
  element: ArchElement,
  type: 'door' | 'window',
  walls: ArchElement[],
): RevitManifestElement | null => {
  if (!element.pos) return null;
  const host = findHostWall(element, walls);
  const dimensions = dimensionsForHosted(element, type);
  return {
    id: element.id,
    type,
    sourceType: element.type,
    levelId: element.levelId,
    label: element.label || element.subType || type,
    subType: element.subType,
    category: element.category,
    geometry: {
      insertionPoint: element.pos,
      hostProjectedPoint: host?.point,
      hostParameter: host?.t,
      hostDistance: host?.dist,
      rotation: host?.angleDegrees ?? element.rotation ?? 0,
      facingFlipped: !!element.facingFlipped,
      handFlipped: !!element.isFlipped,
    },
    dimensions,
    material: { name: elementMaterialName(element, type === 'door' ? 'Door Material' : 'Window Material') },
    relationships: {
      hostWallId: host?.wall.id || element.hostWallId,
      hostWallResolved: !!host,
    },
    metadata: baseMetadata(element),
    exportStrategy: host ? 'native-or-fallback' : 'direct-shape-fallback',
  };
};

const createOpeningManifest = (element: ArchElement, walls: ArchElement[]): RevitManifestElement | null => {
  if (!element.pos) return null;
  const host = findHostWall(element, walls);
  return {
    id: element.id,
    type: 'wall-opening',
    sourceType: element.type,
    levelId: element.levelId,
    label: element.label || 'Wall Opening',
    subType: element.subType,
    category: element.category,
    geometry: {
      insertionPoint: element.pos,
      hostProjectedPoint: host?.point,
      hostParameter: host?.t,
      rotation: host?.angleDegrees ?? element.rotation ?? 0,
    },
    dimensions: {
      width: Math.max(0.05, element.width || 1),
      height: Math.max(0.05, element.height || WALL_OPENING_HEIGHT_DEFAULT),
      baseOffset: Math.max(0, element.elevation ?? 0),
    },
    material: { name: elementMaterialName(element, 'Opening Material') },
    relationships: {
      hostWallId: host?.wall.id || element.hostWallId,
      hostWallResolved: !!host,
    },
    metadata: baseMetadata(element),
    exportStrategy: host ? 'native-or-fallback' : 'direct-shape-fallback',
  };
};

const boundaryThickness = (element: ArchElement, type: 'floor' | 'ceiling' | 'room', settings3D?: Project['settings3D']) => (
  type === 'room' ? undefined : Math.max(0.02, element.height || defaultSlabThickness(settings3D))
);

const boundaryElevation = (
  element: ArchElement,
  type: 'floor' | 'ceiling' | 'room',
  levels: Project['levels'],
  thickness?: number,
  settings3D?: Project['settings3D'],
) => {
  if (element.elevation !== undefined) return element.elevation;
  if (type !== 'ceiling') return 0;
  const level = levels.find(item => item.id === element.levelId);
  const levelHeight = level?.height || settings3D?.defaultLevelHeight || DEFAULT_PROJECT_SETTINGS_3D.defaultLevelHeight || WALL_HEIGHT_DEFAULT;
  return Math.max(0, levelHeight - (thickness || defaultSlabThickness(settings3D)));
};

const createBoundaryManifest = (
  element: ArchElement,
  type: 'floor' | 'ceiling' | 'room',
  levels: Project['levels'],
  settings3D?: Project['settings3D'],
): RevitManifestElement | null => {
  if (!element.boundary || element.boundary.length < 3) return null;
  const boundary = closeBoundary(element.boundary);
  const centroid = polygonCentroid(element.boundary);
  const thickness = boundaryThickness(element, type, settings3D);
  return {
    id: element.id,
    type,
    sourceType: element.type,
    levelId: element.levelId,
    label: element.label || element.subType || type,
    subType: element.subType,
    category: element.category,
    geometry: {
      boundary,
      insertionPoint: element.pos || centroid,
      centroid,
    },
    dimensions: {
      thickness,
      height: type === 'room' ? element.height : undefined,
      elevation: boundaryElevation(element, type, levels, thickness, settings3D),
      area: Math.abs(boundary.slice(0, -1).reduce((sum, point, index) => {
        const next = boundary[index + 1];
        return sum + (point.x * next.y - next.x * point.y);
      }, 0)) / 2,
    },
    material: { name: elementMaterialName(element, type === 'ceiling' ? 'Ceiling Material' : type === 'floor' ? 'Floor Material' : 'Room Material') },
    relationships: {},
    metadata: baseMetadata(element),
    exportStrategy: type === 'ceiling' ? 'native-or-fallback' : 'native',
  };
};

const createColumnManifest = (element: ArchElement, levels: Project['levels'], settings3D?: Project['settings3D']): RevitManifestElement | null => {
  if (!element.pos) return null;
  return {
    id: element.id,
    type: 'column',
    sourceType: element.type,
    levelId: element.levelId,
    label: element.label || element.subType || 'Column',
    subType: element.subType,
    category: element.category,
    geometry: {
      position: element.pos,
      rotation: element.rotation || 0,
      shape: element.shape || 'rect',
    },
    dimensions: {
      width: Math.max(0.05, element.width || element.thickness || 0.45),
      depth: Math.max(0.05, element.depth || element.width || element.thickness || 0.45),
      height: Math.max(0.05, defaultVerticalHeight(element, levels, settings3D)),
      baseOffset: element.elevation || 0,
    },
    material: { name: elementMaterialName(element, 'Column Material') },
    relationships: {
      baseLevelId: element.levelId,
      topLevelId: element.bimTopLevelId,
    },
    metadata: baseMetadata(element),
    exportStrategy: 'native-or-fallback',
  };
};

const createPathManifest = (element: ArchElement, type: 'stair' | 'railing' | 'gridline'): RevitManifestElement | null => {
  if (!element.p1 || !element.p2) return null;
  const runLength = pointDistance(element.p1, element.p2);
  const derivedStepCount = type === 'stair'
    ? Math.max(1, Math.floor(runLength / 0.3))
    : undefined;
  const stairRiserCount = type === 'stair'
    ? Math.max(1, element.metadata?.riserCount || element.metadata?.stepCount || derivedStepCount || 1)
    : undefined;
  const stairTreadCount = type === 'stair'
    ? Math.max(1, element.metadata?.treadCount || stairRiserCount || 1)
    : undefined;
  const stairHeight = type === 'stair'
    ? Math.max(0.05, element.height || element.metadata?.height || (stairRiserCount || 1) * 0.15)
    : element.height;
  return {
    id: element.id,
    type,
    sourceType: element.type,
    levelId: element.levelId,
    label: element.label || element.subType || type,
    subType: element.subType,
    category: element.category,
    geometry: {
      p1: element.p1,
      p2: element.p2,
      samples: element.isCurved ? sampleCurveElement(element, 24) : undefined,
      rotation: element.rotation || 0,
    },
    dimensions: {
      width: element.width,
      height: type === 'railing' ? (element.height || 1) : stairHeight,
      runLength,
      stepCount: type === 'stair' ? stairTreadCount : undefined,
      riserCount: stairRiserCount,
      treadCount: stairTreadCount,
      treadLength: type === 'stair' ? (element.metadata?.treadLength || runLength / Math.max(1, stairTreadCount || 1)) : undefined,
      riserHeight: type === 'stair' ? stairHeight / Math.max(1, stairRiserCount || 1) : undefined,
      baseOffset: element.elevation || 0,
    },
    material: { name: elementMaterialName(element, type === 'gridline' ? 'Grid Material' : type === 'railing' ? 'Railing Material' : 'Stair Material') },
    relationships: {
      hostElementId: element.hostWallId,
    },
    metadata: baseMetadata(element),
    exportStrategy: type === 'gridline' ? 'native' : 'native-or-fallback',
  };
};

const createAnnotationManifest = (element: ArchElement): RevitManifestElement | null => {
  const elementType = String(element.type);
  const geometry: Record<string, any> = {};
  if (element.p1) geometry.p1 = element.p1;
  if (element.p2) geometry.p2 = element.p2;
  if (element.p3) geometry.p3 = element.p3;
  if (element.p4) geometry.p4 = element.p4;
  if (element.pos) geometry.position = element.pos;
  if (element.controlPoint) geometry.controlPoint = element.controlPoint;
  if (element.arcCenter) geometry.arcCenter = element.arcCenter;
  if (element.arcRadius !== undefined) geometry.arcRadius = element.arcRadius;
  if (element.arcStartAngle !== undefined) geometry.arcStartAngle = element.arcStartAngle;
  if (element.arcEndAngle !== undefined) geometry.arcEndAngle = element.arcEndAngle;
  if (element.arcCounterclockwise !== undefined) geometry.arcCounterclockwise = element.arcCounterclockwise;
  if (element.ellipseCenter) geometry.ellipseCenter = element.ellipseCenter;
  if (element.ellipseRadiusX !== undefined) geometry.ellipseRadiusX = element.ellipseRadiusX;
  if (element.ellipseRadiusY !== undefined) geometry.ellipseRadiusY = element.ellipseRadiusY;
  if (element.ellipseRotation !== undefined) geometry.ellipseRotation = element.ellipseRotation;
  if (element.ellipseStartAngle !== undefined) geometry.ellipseStartAngle = element.ellipseStartAngle;
  if (element.ellipseEndAngle !== undefined) geometry.ellipseEndAngle = element.ellipseEndAngle;
  if (element.ellipseCounterclockwise !== undefined) geometry.ellipseCounterclockwise = element.ellipseCounterclockwise;
  if (['arc', 'circle', 'ellipse'].includes(elementType) || element.isCurved) geometry.samples = sampleCurveElement(element, 48);
  if (!Object.keys(geometry).length) return null;
  return {
    id: element.id,
    type: 'annotation',
    sourceType: element.type,
    levelId: element.levelId,
    label: element.label || element.direction || element.type,
    subType: element.subType,
    category: element.category,
    geometry: {
      ...geometry,
      annotationKind: element.type,
      rotation: element.rotation || 0,
      viewId: element.viewId,
      elevation: element.elevation || 0,
    },
    dimensions: {
      width: element.width,
      height: element.height,
      textFontSize: element.textFontSize,
    },
    material: { name: elementMaterialName(element, 'Annotation Material') },
    relationships: {},
    metadata: baseMetadata(element),
    exportStrategy: element.type === 'dimension' ? 'metadata-only' : 'native-or-fallback',
  };
};

const createFallbackManifest = (element: ArchElement, includeUnsupportedAsDirectShape: boolean): RevitManifestElement | null => {
  if (!includeUnsupportedAsDirectShape) return null;
  const position = element.pos || element.p1 || (element.boundary?.length ? polygonCentroid(element.boundary) : { x: 0, y: 0 });
  const manifestType: RevitManifestElementType = element.type === 'furniture' || element.type === 'fixture' || element.type === 'counter'
    ? 'furniture'
    : element.type === 'group' ? 'group' : 'fallback';
  return {
    id: element.id,
    type: manifestType,
    sourceType: element.type,
    levelId: element.levelId,
    label: element.label || element.subType || element.type,
    subType: element.subType,
    category: element.category,
    geometry: {
      position,
      p1: element.p1,
      p2: element.p2,
      boundary: element.boundary,
      rotation: element.rotation || 0,
      shape: element.shape,
      customMeshData: element.customMeshData,
    },
    dimensions: {
      width: element.width || element.thickness || WALL_THICKNESS_DEFAULT,
      depth: element.depth || element.thickness || WALL_THICKNESS_DEFAULT,
      height: element.height || 0.75,
      elevation: element.elevation || 0,
    },
    material: { name: elementMaterialName(element, 'DirectShape Material') },
    relationships: {
      groupId: element.groupId,
    },
    metadata: baseMetadata(element),
    exportStrategy: manifestType === 'group' ? 'metadata-only' : 'direct-shape-fallback',
  };
};

const createManifestElement = (
  element: ArchElement,
  walls: ArchElement[],
  levels: Project['levels'],
  settings3D: Project['settings3D'],
  options: RevitExportOptions,
): RevitManifestElement | null => {
  if (element.type === 'wall') return createWallManifest(element, options, levels, settings3D);
  if (element.type === 'door') return createHostedManifest(element, 'door', walls);
  if (element.type === 'window') return createHostedManifest(element, 'window', walls);
  if (element.type === 'wall-opening') return createOpeningManifest(element, walls);
  if (element.type === 'floor') return createBoundaryManifest(element, 'floor', levels, settings3D);
  if (element.type === 'ceiling') return createBoundaryManifest(element, 'ceiling', levels, settings3D);
  if (element.type === 'room') return createBoundaryManifest(element, 'room', levels, settings3D);
  if (element.type === 'column') return createColumnManifest(element, levels, settings3D);
  if (element.type === 'stair') return createPathManifest(element, 'stair');
  if (element.type === 'railing') return createPathManifest(element, 'railing');
  if (element.type === 'gridline') return createPathManifest(element, 'gridline');
  if (['line', 'arc', 'circle', 'ellipse', 'rectangle', 'dimension', 'label', 'elevation-marker'].includes(element.type)) {
    return options.includeAnnotations ? createAnnotationManifest(element) : null;
  }
  if (['furniture', 'fixture', 'counter'].includes(element.type) && !options.includeFurniture) return null;
  return createFallbackManifest(element, options.includeUnsupportedAsDirectShape);
};

export const createRevitExportManifest = (project: Project, options: RevitExportOptions): RevitExportManifest => {
  const { levels, elements } = getExportableProjectSlice(project, options);
  const walls = elements.filter(element => element.type === 'wall');
  const warnings: string[] = [];
  const manifestElements: RevitManifestElement[] = [];
  let skippedElementCount = 0;

  elements.forEach(element => {
    const created = createManifestElement(element, walls, levels, project.settings3D, options);
    if (!created) {
      skippedElementCount += 1;
      warnings.push(`Skipped ${element.type} ${element.id}: no valid direct Revit manifest mapping or disabled by export settings.`);
      return;
    }
    if (created.exportStrategy === 'direct-shape-fallback') {
      warnings.push(`${created.sourceType} ${created.id} will export as DirectShape fallback if no native Revit mapping is possible.`);
    }
    if ((created.type === 'door' || created.type === 'window' || created.type === 'wall-opening') && !created.relationships.hostWallResolved) {
      warnings.push(`${created.type} ${created.id} has no resolved host wall and may export as fallback geometry.`);
    }
    manifestElements.push(created);
  });

  const fallbackElementCount = manifestElements.filter(element => element.exportStrategy === 'direct-shape-fallback').length;
  return {
    manifestVersion: REVIT_EXPORT_VERSION,
    createdAt: new Date().toISOString(),
    project: {
      id: project.metadata?.projectId || cleanExportFileName(project.name || 'project', 'project'),
      name: options.projectName || project.name || 'Archi AI Revit Export',
      description: options.projectDescription || '',
      projectCode: options.projectCode || '',
      unitSystem: options.unitSystem,
      sourceLinearUnit: 'meters',
      coordinateSystem: 'canvas-y-down',
      projectOriginMode: 'internal-origin',
    },
    levels: levels.map(level => ({
      id: level.id,
      name: level.name,
      elevation: level.zElevation,
      height: level.height,
      order: level.order,
      metadata: {
        ifcGuid: level.metadata?.bimExport?.ifcGuid,
        customMetadata: level.metadata,
      },
    })),
    elements: manifestElements,
    settings: {
      includeFurniture: options.includeFurniture,
      includeAnnotations: options.includeAnnotations,
      includeUnsupportedAsDirectShape: options.includeUnsupportedAsDirectShape,
      createNativeFamilies: options.createNativeFamilies,
      runValidation: options.runValidation,
      revitEngine: options.revitEngine,
    },
    summary: {
      sourceElementCount: elements.length,
      exportedElementCount: manifestElements.length,
      skippedElementCount,
      fallbackElementCount,
      classCounts: classCountsFrom(manifestElements),
      warnings,
    },
  };
};

export const validateRevitExportManifest = (manifest: RevitExportManifest): { isValid: boolean; errors: string[]; warnings: string[] } => {
  const errors: string[] = [];
  const warnings = [...(manifest.summary?.warnings || [])];
  if (manifest.manifestVersion !== REVIT_EXPORT_VERSION) errors.push(`Unsupported manifest version: ${manifest.manifestVersion}`);
  if (!manifest.project?.name) errors.push('Manifest project name is required.');
  if (!Array.isArray(manifest.levels) || manifest.levels.length === 0) errors.push('Manifest must contain at least one level.');
  if (!Array.isArray(manifest.elements)) errors.push('Manifest elements must be an array.');
  if (manifest.elements.some(element => !element.id || !element.type)) errors.push('Every manifest element must include id and type.');
  const ids = manifest.elements.map(element => element.id);
  if (ids.length !== new Set(ids).size) errors.push('Manifest element IDs must be unique.');
  if (JSON.stringify(manifest).toLowerCase().includes('ifcstep')) errors.push('Manifest must not contain IFC STEP data.');
  if (manifest.elements.length === 0) warnings.push('Manifest contains no exportable elements.');
  return { isValid: errors.length === 0, errors, warnings };
};
