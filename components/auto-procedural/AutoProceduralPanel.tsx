import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Check, DoorOpen, Maximize2, MousePointer2, RefreshCw, Upload, Wand2 } from 'lucide-react';
import { ArchElement, DockPosition, EditorState, EditorTool, LayoutGeometry, LayoutTypology, Point, ProceduralConfig, Project, UnitSystem } from '../../types';
import Canvas from '../Canvas';
import { DrawBar, SnapBar, Toolbox } from '../Toolbar';
import { DEFAULT_PROJECT_SETTINGS_3D, PROCEDURAL_GEOMETRIES, PROCEDURAL_STYLES, PROCEDURAL_TYPOLOGIES, WALL_HEIGHT_DEFAULT, WALL_THICKNESS_DEFAULT, normalizeInteriorElement } from '../../constants';
import { AutoProceduralLayoutEngine } from '../../services/autoProceduralService';
import { SmartProceduralFurnishEngine } from '../../smart-procedural/smartFurnishService';
import { SmartProceduralLayoutEngine } from '../../smart-procedural/smartProceduralService';

interface AutoProceduralPanelProps {
  currentBoundary?: Point[];
  hostFloor?: ArchElement;
  initialConfig?: ProceduralConfig | null;
  unitSystem: UnitSystem;
  onApply: (elements: ArchElement[]) => void;
  onClose: () => void;
  workflow?: 'auto' | 'smart';
}

type AutoProceduralStage = 'setup' | 'nodes' | 'walls' | 'openings' | 'furniture' | 'import';

const PREVIEW_LEVEL_ID = '0';

const stageOrder: AutoProceduralStage[] = ['setup', 'nodes', 'walls', 'openings', 'furniture', 'import'];

const stageLabel: Record<AutoProceduralStage, string> = {
  setup: 'Setup',
  nodes: 'Room Nodes',
  walls: 'Walls',
  openings: 'Openings',
  furniture: 'Furniture',
  import: 'Import',
};

const inputClass = 'w-full h-9 rounded-xl bg-slate-50 border border-slate-200 px-3 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500';
const actionButtonClass = 'h-9 px-3 rounded-xl bg-white border border-slate-200 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5';
const primaryButtonClass = 'h-9 px-4 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5';

const subtypeBedroomDefaults: Record<string, { bedrooms: number; bathrooms: number; balconies: number }> = {
  studio: { bedrooms: 0, bathrooms: 1, balconies: 0 },
  '1br': { bedrooms: 1, bathrooms: 1, balconies: 1 },
  '2br': { bedrooms: 2, bathrooms: 2, balconies: 1 },
  '3br': { bedrooms: 3, bathrooms: 2, balconies: 1 },
  '4br': { bedrooms: 4, bathrooms: 3, balconies: 2 },
  duplex: { bedrooms: 3, bathrooms: 3, balconies: 1 },
  penthouse: { bedrooms: 3, bathrooms: 3, balconies: 2 },
  house: { bedrooms: 3, bathrooms: 2, balconies: 0 },
  villa: { bedrooms: 4, bathrooms: 3, balconies: 0 },
  'row-house': { bedrooms: 3, bathrooms: 2, balconies: 0 },
  farmhouse: { bedrooms: 3, bathrooms: 2, balconies: 0 },
  coliving: { bedrooms: 6, bathrooms: 3, balconies: 0 },
};

const polygonArea = (points: Point[]): number => {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area / 2);
};

const boundsOf = (points: Point[]) => {
  if (!points.length) return { minX: 0, minY: 0, maxX: 12, maxY: 8, width: 12, height: 8 };
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
};

const boundarySignature = (boundary?: Point[]): string =>
  (boundary || []).map(point => `${point.x.toFixed(3)},${point.y.toFixed(3)}`).join('|');

const findProceduralHost = (elements: ArchElement[]): ArchElement | undefined =>
  elements.find(element =>
    element.type === 'floor'
    && (element.isAutoProceduralHost || element.isSmartProceduralHost)
    && element.boundary
    && element.boundary.length >= 3
  );

const isAutoBatchElement = (element: ArchElement, proceduralId?: string): boolean =>
  !!proceduralId && (
    element.proceduralId === proceduralId
    || (element.type === 'floor' && (element.isAutoProceduralHost || element.isSmartProceduralHost))
  );

const isNodeElement = (element: ArchElement): boolean =>
  element.type === 'room' && !!element.metadata?.autoProceduralNode;

const isOpeningElement = (element: ArchElement): boolean =>
  element.type === 'door' || element.type === 'window' || element.type === 'wall-opening';

const stripDisplayState = (element: ArchElement, source?: ArchElement): ArchElement => {
  if (!element.metadata?.autoProceduralDisplayLock) return element;
  const metadata = { ...(element.metadata || {}) };
  delete metadata.autoProceduralDisplayLock;
  return {
    ...element,
    locked: source?.locked,
    metadata,
  };
};

const buildClosedBoundary = (elements: ArchElement[]): Point[] | null => {
  const segments = elements.filter(element => element.p1 && element.p2);
  if (segments.length < 3) return null;

  const tolerance = 0.2;
  const used = new Set<string>([segments[0].id]);
  const points: Point[] = [segments[0].p1!, segments[0].p2!];

  while (used.size < segments.length) {
    const last = points[points.length - 1];
    const next = segments.find(segment => {
      if (used.has(segment.id)) return false;
      return Math.hypot(segment.p1!.x - last.x, segment.p1!.y - last.y) < tolerance ||
        Math.hypot(segment.p2!.x - last.x, segment.p2!.y - last.y) < tolerance;
    });
    if (!next) break;
    const p1 = next.p1!;
    const p2 = next.p2!;
    points.push(Math.hypot(p1.x - last.x, p1.y - last.y) < tolerance ? p2 : p1);
    used.add(next.id);
  }

  if (used.size !== segments.length) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.hypot(first.x - last.x, first.y - last.y) > 0.3) return null;
  return points.slice(0, -1);
};

const createPreviewProject = (elements: ArchElement[] = []): Project => ({
  name: 'Auto Procedural Preview',
  mode: 'floorplan',
  levels: [{ id: PREVIEW_LEVEL_ID, name: 'Level 1', zElevation: 0, height: WALL_HEIGHT_DEFAULT, order: 0 }],
  elements,
  viewBox: { width: 1200, height: 800 },
  settings3D: {
    ...DEFAULT_PROJECT_SETTINGS_3D,
    wallHeight: WALL_HEIGHT_DEFAULT,
    defaultLevelHeight: WALL_HEIGHT_DEFAULT,
  },
});

const createEditorState = (unitSystem: UnitSystem): EditorState => ({
  zoom: 26,
  offset: { x: 420, y: 260 },
  selectedIds: [],
  isPanning: false,
  activeTool: 'auto-procedural-boundary',
  activeLevelId: PREVIEW_LEVEL_ID,
  isGridVisible: true,
  isSnapEnabled: true,
  isWallMode: false,
  unitSystem,
  viewMode: '2D',
  drawingView: 'plan',
  isOrthoEnabled: false,
  isEndpointSnap: true,
  isMidpointSnap: true,
  isIntersectionSnap: true,
  isPointAlignmentSnap: true,
  isAngularAlignmentSnap: true,
  isSiteMapVisible: false,
  multiPointBuffer: [],
});

const AutoProceduralPanel: React.FC<AutoProceduralPanelProps> = ({
  currentBoundary,
  hostFloor,
  initialConfig,
  unitSystem,
  onApply,
  onClose,
  workflow = 'auto',
}) => {
  const isSmartWorkflow = workflow === 'smart';
  const initialTypology = hostFloor?.proceduralProgramId
    ? (PROCEDURAL_TYPOLOGIES.find(item => item.programId === hostFloor.proceduralProgramId)?.id || initialConfig?.typology || 'residential')
    : (initialConfig?.typology || 'residential');
  const initialSubtype = initialConfig?.subtype ||
    (hostFloor?.proceduralRequirements as any)?.subtype ||
    PROCEDURAL_TYPOLOGIES.find(item => item.id === initialTypology)?.subtypes[0] ||
    '2br';
  const initialDefaults = subtypeBedroomDefaults[String(initialSubtype).toLowerCase()] || subtypeBedroomDefaults['2br'];

  const [stage, setStage] = useState<AutoProceduralStage>('setup');
  const [typologyId, setTypologyId] = useState(initialTypology);
  const [subtype, setSubtype] = useState(initialSubtype);
  const [planningStyle, setPlanningStyle] = useState<string>(initialConfig?.style || hostFloor?.proceduralTypology || PROCEDURAL_STYLES[0]);
  const [geometryStyle, setGeometryStyle] = useState<string>(initialConfig?.geometry || hostFloor?.proceduralGeometry || PROCEDURAL_GEOMETRIES[0]);
  const [bedrooms, setBedrooms] = useState(initialConfig?.requirements?.numBedrooms ?? initialDefaults.bedrooms);
  const [bathrooms, setBathrooms] = useState(initialConfig?.requirements?.numBaths ?? initialDefaults.bathrooms);
  const [kitchens, setKitchens] = useState(initialConfig?.requirements?.numKitchens ?? 1);
  const [balconies, setBalconies] = useState(initialConfig?.requirements?.numBalconies ?? initialDefaults.balconies);
  const [dimensionWidth, setDimensionWidth] = useState('15');
  const [dimensionHeight, setDimensionHeight] = useState('10');
  const [seed, setSeed] = useState(0.42);
  const [project, setProject] = useState<Project>(() => createPreviewProject(hostFloor ? [{
    ...hostFloor,
    id: hostFloor.id || crypto.randomUUID(),
    levelId: PREVIEW_LEVEL_ID,
    isProceduralHost: true,
    isAutoProceduralHost: !isSmartWorkflow,
    isSmartProceduralHost: isSmartWorkflow,
  }] : []));
  const [editorState, setEditorState] = useState<EditorState>(() => createEditorState(unitSystem));
  const [toolboxPos, setToolboxPos] = useState<DockPosition>('left');
  const [drawBarPos, setDrawBarPos] = useState<DockPosition>('top');
  const [snapBarPos, setSnapBarPos] = useState<DockPosition>('bottom');
  const [status, setStatus] = useState(
    isSmartWorkflow
      ? 'Draw a boundary here, or generate an Instant floorplan from dimensions.'
      : 'Draw a native Auto Procedural boundary in this canvas, or generate from dimensions.'
  );
  const [warnings, setWarnings] = useState<string[]>([]);
  const didSeedBoundaryRef = useRef(false);

  const selectedTypology = useMemo(
    () => PROCEDURAL_TYPOLOGIES.find(item => item.id === typologyId) || PROCEDURAL_TYPOLOGIES[0],
    [typologyId]
  );

  const activeConfig = useMemo<ProceduralConfig>(() => ({
    typology: typologyId,
    subtype,
    style: planningStyle as LayoutTypology,
    geometry: geometryStyle as LayoutGeometry,
    requirements: {
      ...(initialConfig?.requirements || {}),
      subtype,
      numBedrooms: bedrooms,
      numBaths: bathrooms,
      numKitchens: kitchens,
      numBalconies: balconies,
    },
    globals: {
      wallThickness: initialConfig?.globals?.wallThickness || WALL_THICKNESS_DEFAULT,
      wallHeight: initialConfig?.globals?.wallHeight || WALL_HEIGHT_DEFAULT,
      unitSystem,
    },
  }), [bathrooms, balconies, bedrooms, geometryStyle, initialConfig, kitchens, planningStyle, subtype, typologyId, unitSystem]);

  const buildRequirements = useCallback(() => ({
    ...activeConfig.requirements,
    ...activeConfig.globals,
  }), [activeConfig]);

  const makeHost = useCallback((boundary: Point[], host?: ArchElement): ArchElement => {
    const proceduralId = host?.proceduralId || `auto-procedural-${crypto.randomUUID()}`;
    return {
      ...(host || {}),
      id: host?.id || crypto.randomUUID(),
      type: 'floor',
      boundary,
      proceduralId,
      isProceduralHost: true,
      isAutoProceduralHost: !isSmartWorkflow,
      isSmartProceduralHost: isSmartWorkflow,
      proceduralProgramId: selectedTypology.programId,
      proceduralTypology: planningStyle,
      proceduralGeometry: geometryStyle,
      proceduralBoundaryPoints: boundary,
      proceduralRequirements: buildRequirements(),
      levelId: PREVIEW_LEVEL_ID,
      metadata: {
        ...(host?.metadata || {}),
        autoProcedural: true,
        autoProceduralFeature: isSmartWorkflow ? 'Instant' : 'Auto Procedural',
      },
    };
  }, [buildRequirements, geometryStyle, isSmartWorkflow, planningStyle, selectedTypology.programId]);

  const normalizeGeneratedElement = useCallback((element: ArchElement, proceduralId: string): ArchElement => {
    const next: ArchElement = {
      ...element,
      id: element.id || crypto.randomUUID(),
      proceduralId,
      levelId: PREVIEW_LEVEL_ID,
      metadata: {
        ...(element.metadata || {}),
        autoProcedural: true,
        autoProceduralNode: element.type === 'room' ? true : element.metadata?.autoProceduralNode,
      },
    };
    if (next.type === 'wall') {
      next.thickness = next.thickness || activeConfig.globals.wallThickness;
      next.height = next.height || activeConfig.globals.wallHeight;
      next.elevation = next.elevation ?? 0;
    }
    if (['furniture', 'fixture', 'counter'].includes(next.type)) {
      return normalizeInteriorElement(next);
    }
    return next;
  }, [activeConfig.globals.wallHeight, activeConfig.globals.wallThickness]);

  const replaceProceduralBatch = useCallback((
    boundary: Point[],
    sourceElements: ArchElement[] = project.elements,
    hostOverride?: ArchElement,
    options: { nextSeed?: number; keepFurniture?: boolean; removeIds?: Set<string> } = {}
  ) => {
    if (boundary.length < 3 || polygonArea(boundary) < 1) {
      setStatus('Draw a valid closed boundary before generation.');
      setWarnings(['Boundary area is too small or incomplete.']);
      return;
    }

    const previousHost = hostOverride || findProceduralHost(sourceElements);
    const host = makeHost(boundary, previousHost);
    const proceduralId = host.proceduralId || host.id;
    const layoutEngine = isSmartWorkflow ? SmartProceduralLayoutEngine : AutoProceduralLayoutEngine;
    const result = layoutEngine.generateLayout(boundary, selectedTypology.programId, {
      seed: options.nextSeed ?? seed,
      typology: planningStyle as LayoutTypology,
      geometry: geometryStyle as LayoutGeometry,
      unitSystem,
      requirements: buildRequirements(),
    });

    const generated = result.elements.map(element => normalizeGeneratedElement(element, proceduralId));
    const keep = sourceElements.filter(element => {
      if (options.removeIds?.has(element.id)) return false;
      if (element.id === host.id) return false;
      if (element.proceduralId && element.proceduralId === proceduralId) {
        return options.keepFurniture &&
          ['furniture', 'fixture', 'counter'].includes(element.type) &&
          !element.metadata?.autoProceduralFurniture;
      }
      return true;
    });

    const nextElements = [...keep, host, ...generated];
    setProject(prev => ({ ...prev, elements: nextElements }));
    setEditorState(prev => ({ ...prev, activeTool: 'select', selectedIds: [host.id], activeLevelId: PREVIEW_LEVEL_ID }));
    setStage(prev => prev === 'setup' ? 'nodes' : prev);
    setWarnings(result.warnings || []);
    setStatus(`Generated ${generated.filter(element => element.type === 'room').length} rooms, ${generated.filter(element => element.type === 'wall').length} walls, and ${generated.filter(element => ['door', 'window', 'wall-opening'].includes(element.type)).length} openings from the native boundary.`);
  }, [buildRequirements, geometryStyle, isSmartWorkflow, makeHost, normalizeGeneratedElement, planningStyle, project.elements, seed, selectedTypology.programId, unitSystem]);

  useEffect(() => {
    if (didSeedBoundaryRef.current) return;
    const seededBoundary = hostFloor?.boundary || currentBoundary;
    if (!seededBoundary || seededBoundary.length < 3) return;
    didSeedBoundaryRef.current = true;
    replaceProceduralBatch(seededBoundary);
  }, [currentBoundary, hostFloor?.boundary, replaceProceduralBatch]);

  const host = useMemo(() => findProceduralHost(project.elements), [project.elements]);
  const boundary = host?.boundary || [];
  const stats = useMemo(() => ({
    rooms: project.elements.filter(element => element.type === 'room').length,
    walls: project.elements.filter(element => element.type === 'wall').length,
    openings: project.elements.filter(element => ['door', 'window', 'wall-opening'].includes(element.type)).length,
    furniture: project.elements.filter(element => ['furniture', 'fixture', 'counter'].includes(element.type)).length,
    area: polygonArea(boundary),
  }), [boundary, project.elements]);

  const stageVisibleElements = useMemo(() => {
    const proceduralId = host?.proceduralId;
    return project.elements
      .filter(element => {
        if (!isAutoBatchElement(element, proceduralId)) return true;
        if (element.type === 'floor' && (element.isAutoProceduralHost || element.isSmartProceduralHost)) return true;

        switch (stage) {
          case 'setup':
            return false;
          case 'nodes':
            return isNodeElement(element) || element.type === 'wall' || element.type === 'line' || element.type === 'railing';
          case 'walls':
            return isNodeElement(element) || element.type === 'wall' || element.type === 'line' || element.type === 'railing' || element.type === 'column' || element.type === 'stair';
          case 'openings':
            return isNodeElement(element) || element.type === 'wall' || element.type === 'line' || element.type === 'railing' || element.type === 'column' || element.type === 'stair' || isOpeningElement(element);
          case 'furniture':
          case 'import':
            return true;
          default:
            return true;
        }
      })
      .map(element => {
        const shouldLockForStage = stage === 'nodes' && isAutoBatchElement(element, proceduralId) && !isNodeElement(element) && element.type !== 'floor';
        if (!shouldLockForStage) return element;
        return {
          ...element,
          locked: true,
          metadata: {
            ...(element.metadata || {}),
            autoProceduralDisplayLock: true,
          },
        };
      });
  }, [host?.proceduralId, project.elements, stage]);

  const visibleProject = useMemo<Project>(() => ({
    ...project,
    elements: stageVisibleElements,
  }), [project, stageVisibleElements]);

  const mergeVisibleElements = useCallback((nextVisibleElements: ArchElement[]) => {
    const originalById = new Map<string, ArchElement>(project.elements.map(element => [element.id, element]));
    const visibleIds = new Set(stageVisibleElements.map(element => element.id));
    const nextById = new Map<string, ArchElement>(nextVisibleElements.map(element => [
      element.id,
      stripDisplayState(element, originalById.get(element.id)),
    ]));
    const merged: ArchElement[] = [];
    const consumed = new Set<string>();

    project.elements.forEach(element => {
      if (!visibleIds.has(element.id)) {
        merged.push(element);
        return;
      }
      const next = nextById.get(element.id);
      if (next) {
        merged.push(next);
        consumed.add(element.id);
      }
    });

    nextById.forEach((element, id) => {
      if (!originalById.has(id) && !consumed.has(id)) merged.push(element);
    });

    return merged;
  }, [project.elements, stageVisibleElements]);

  const applyNodeDeltas = useCallback((previousElements: ArchElement[], nextElements: ArchElement[]): ArchElement[] => {
    const previousById = new Map(previousElements.map(element => [element.id, element]));
    const movedNodes = nextElements
      .filter(isNodeElement)
      .map(node => {
        const previous = previousById.get(node.id);
        if (!previous?.pos || !node.pos) return null;
        const dx = node.pos.x - previous.pos.x;
        const dy = node.pos.y - previous.pos.y;
        if (Math.hypot(dx, dy) < 0.01) return null;
        return { previous, next: node, dx, dy };
      })
      .filter(Boolean) as Array<{ previous: ArchElement; next: ArchElement; dx: number; dy: number }>;

    if (movedNodes.length === 0) return nextElements;
    const proceduralId = host?.proceduralId || movedNodes[0]?.next.proceduralId;
    if (!proceduralId) return nextElements;

    const transformPoint = (point: Point, influenceScale = 1): Point => {
      let x = point.x;
      let y = point.y;
      movedNodes.forEach(({ previous, dx, dy }) => {
        if (!previous.pos) return;
        const halfW = Math.max((previous.width || 1.2) / 2, 0.6);
        const halfD = Math.max((previous.depth || 1.2) / 2, 0.6);
        const edgeX = Math.max(0, Math.abs(point.x - previous.pos.x) - halfW);
        const edgeY = Math.max(0, Math.abs(point.y - previous.pos.y) - halfD);
        const falloff = Math.max(halfW, halfD, 1.2);
        const distance = Math.hypot(edgeX, edgeY);
        const weight = distance <= 0 ? 1 : Math.max(0, 1 - distance / falloff);
        x += dx * weight * influenceScale;
        y += dy * weight * influenceScale;
      });
      return { x, y };
    };

    const movedNodeIds = new Set(movedNodes.map(item => item.next.id));
    const adjusted = nextElements.map(element => {
      if (!isAutoBatchElement(element, proceduralId)) return element;
      if (element.type === 'floor' && (element.isAutoProceduralHost || element.isSmartProceduralHost)) return element;
      if (movedNodeIds.has(element.id)) return element;

      if (element.type === 'wall' || element.type === 'line' || element.type === 'railing') {
        return {
          ...element,
          p1: element.p1 ? transformPoint(element.p1) : element.p1,
          p2: element.p2 ? transformPoint(element.p2) : element.p2,
          controlPoint: element.controlPoint ? transformPoint(element.controlPoint) : element.controlPoint,
        };
      }

      if (isOpeningElement(element)) {
        return {
          ...element,
          pos: element.pos ? transformPoint(element.pos) : element.pos,
        };
      }

      if (isNodeElement(element)) {
        return {
          ...element,
          pos: element.pos ? transformPoint(element.pos, 0.35) : element.pos,
        };
      }

      if (['furniture', 'fixture', 'counter', 'column', 'stair'].includes(element.type)) {
        return {
          ...element,
          pos: element.pos ? transformPoint(element.pos, 0.8) : element.pos,
          p1: element.p1 ? transformPoint(element.p1, 0.8) : element.p1,
          p2: element.p2 ? transformPoint(element.p2, 0.8) : element.p2,
          p3: element.p3 ? transformPoint(element.p3, 0.8) : element.p3,
          p4: element.p4 ? transformPoint(element.p4, 0.8) : element.p4,
        };
      }

      return element;
    });

    setStatus('Room node moved. Walls, openings, and nearby plan elements were adjusted from the node edit.');
    return adjusted;
  }, [host?.proceduralId]);

  const fitToView = useCallback(() => {
    const points: Point[] = [];
    project.elements.forEach(element => {
      if (element.boundary) points.push(...element.boundary);
      if (element.p1) points.push(element.p1);
      if (element.p2) points.push(element.p2);
      if (element.pos) points.push(element.pos);
    });
    const b = boundsOf(points);
    const zoom = Math.max(8, Math.min(60, Math.min(760 / (b.width + 3), 460 / (b.height + 3))));
    setEditorState(prev => ({
      ...prev,
      zoom,
      offset: {
        x: 520 - ((b.minX + b.maxX) / 2) * zoom,
        y: 300 - ((b.minY + b.maxY) / 2) * zoom,
      },
    }));
  }, [project.elements]);

  const handleElementsChange = useCallback((elements: ArchElement[]) => {
    const merged = mergeVisibleElements(elements);
    const adjusted = applyNodeDeltas(project.elements, merged);
    setProject(prev => ({ ...prev, elements: adjusted }));
  }, [applyNodeDeltas, mergeVisibleElements, project.elements]);

  const handleElementsCommit = useCallback((elements: ArchElement[]) => {
    const merged = mergeVisibleElements(elements);
    const previousHost = findProceduralHost(project.elements);
    const nextHost = findProceduralHost(merged);

    if (nextHost?.boundary) {
      const isNewHost = !previousHost || previousHost.id !== nextHost.id;
      const boundaryChanged = boundarySignature(previousHost?.boundary) !== boundarySignature(nextHost.boundary);
      if (isNewHost || boundaryChanged) {
        replaceProceduralBatch(nextHost.boundary, merged, nextHost, { keepFurniture: stage === 'furniture' || stage === 'import' });
        return;
      }
    }

    const adjusted = applyNodeDeltas(project.elements, merged);
    setProject(prev => ({ ...prev, elements: adjusted }));
  }, [applyNodeDeltas, mergeVisibleElements, project.elements, replaceProceduralBatch, stage]);

  const handleSelectionChange = useCallback((ids: string[]) => {
    setEditorState(prev => ({ ...prev, selectedIds: ids }));
  }, []);

  const handleToolSelect = useCallback((tool: EditorTool, preset?: any) => {
    if (tool === 'delete') {
      const ids = new Set(editorState.selectedIds);
      setProject(prev => ({
        ...prev,
        elements: prev.elements.filter(element => {
          if (ids.has(element.id)) return false;
          if (element.hostWallId && ids.has(element.hostWallId)) return false;
          return true;
        }),
      }));
      setEditorState(prev => ({ ...prev, activeTool: 'select', selectedIds: [] }));
      return;
    }
    setEditorState(prev => ({
      ...prev,
      activeTool: tool,
      activePreset: preset,
      isWallMode: false,
      selectedIds: tool === 'select' ? prev.selectedIds : [],
    }));
  }, [editorState.selectedIds]);

  const generateFromDimensions = useCallback(() => {
    const width = Math.max(1, Number(dimensionWidth) || 15);
    const height = Math.max(1, Number(dimensionHeight) || 10);
    const currentBounds = boundsOf(boundary);
    const minX = boundary.length ? currentBounds.minX : 0;
    const minY = boundary.length ? currentBounds.minY : 0;
    replaceProceduralBatch([
      { x: minX, y: minY },
      { x: minX + width, y: minY },
      { x: minX + width, y: minY + height },
      { x: minX, y: minY + height },
    ], project.elements, host);
  }, [boundary, dimensionHeight, dimensionWidth, host, project.elements, replaceProceduralBatch]);

  const convertSelectedLoop = useCallback(() => {
    const selected = project.elements.filter(element => editorState.selectedIds.includes(element.id));
    const loop = buildClosedBoundary(selected);
    if (!loop) {
      setWarnings(['Select a closed loop made from native line or wall segments before converting to an Auto Procedural boundary.']);
      setStatus('Closed polygon was not detected from the selected native segments.');
      return;
    }
    replaceProceduralBatch(loop, project.elements, undefined, { removeIds: new Set(selected.map(element => element.id)) });
  }, [editorState.selectedIds, project.elements, replaceProceduralBatch]);

  const regenerate = useCallback(() => {
    if (!host?.boundary) {
      generateFromDimensions();
      return;
    }
    const nextSeed = Number((Math.random()).toFixed(4));
    setSeed(nextSeed);
    replaceProceduralBatch(host.boundary, project.elements, host, { nextSeed, keepFurniture: stage === 'furniture' || stage === 'import' });
  }, [generateFromDimensions, host, project.elements, replaceProceduralBatch, stage]);

  const generateFurniture = useCallback(() => {
    const currentHost = findProceduralHost(project.elements);
    if (!currentHost?.boundary) {
      setWarnings(['Generate walls and rooms before adding furniture.']);
      return;
    }
    const proceduralId = currentHost.proceduralId || currentHost.id;
    // Keep the same full-plan context used by the original Smart Procedural furnishing action.
    const furnishedElements = SmartProceduralFurnishEngine.furnishFloor(currentHost, project.elements);
    const base = project.elements.filter(element =>
      !(element.proceduralId === proceduralId && ['furniture', 'fixture', 'counter'].includes(element.type) && element.metadata?.autoProceduralFurniture)
    );
    const furniture = furnishedElements
      .map(element => normalizeInteriorElement({
        ...element,
        proceduralId,
        levelId: PREVIEW_LEVEL_ID,
        metadata: {
          ...(element.metadata || {}),
          autoProcedural: true,
          autoProceduralFurniture: true,
        },
      }));
    if (furniture.length === 0) {
      setWarnings(['No furnishable rooms were found. Generate a floorplan with labelled rooms before furnishing.']);
      setStatus('Furniture was not placed because the current floorplan has no supported labelled rooms.');
      return;
    }
    setProject(prev => ({ ...prev, elements: [...base, ...furniture] }));
    setStage('furniture');
    setWarnings([]);
    setStatus(`Placed ${furniture.length} furniture, fixture, and counter elements using the Smart Procedural interior engine.`);
  }, [project.elements]);

  const approveStage = useCallback(() => {
    const idx = stageOrder.indexOf(stage);
    const nextStage = stageOrder[Math.min(stageOrder.length - 1, idx + 1)];
    setStage(nextStage);
    if (nextStage === 'furniture' && stats.furniture === 0) {
      generateFurniture();
    }
  }, [generateFurniture, stage, stats.furniture]);

  const handleImport = useCallback(() => {
    if (project.elements.length === 0) return;
    onApply(project.elements.map(element => {
      const imported = {
        ...element,
        levelId: element.levelId || PREVIEW_LEVEL_ID,
        isPlacingDraft: false,
      };
      if (!isSmartWorkflow) return imported;
      const detached = { ...imported };
      delete detached.isProceduralHost;
      delete detached.isSmartProceduralHost;
      delete detached.isAutoProceduralHost;
      delete detached.proceduralId;
      delete detached.proceduralBoundary;
      delete detached.proceduralBoundaryPoints;
      delete detached.proceduralProgramId;
      delete detached.proceduralTypology;
      delete detached.proceduralGeometry;
      delete detached.proceduralRequirements;
      const metadata = { ...(detached.metadata || {}) };
      delete metadata.autoProcedural;
      delete metadata.autoProceduralFeature;
      delete metadata.autoProceduralNode;
      delete metadata.autoProceduralDisplayLock;
      delete metadata.autoProceduralFurniture;
      return {
        ...detached,
        metadata: {
          ...metadata,
          importedFromInstant: true,
        },
      } as ArchElement;
    }));
    onClose();
  }, [isSmartWorkflow, onApply, onClose, project.elements]);

  const selectedElements = project.elements.filter(element => editorState.selectedIds.includes(element.id));
  const hasOpeningSelected = selectedElements.some(element => ['door', 'window', 'wall-opening'].includes(element.type));
  const hasWallSelected = selectedElements.some(element => element.type === 'wall');
  const stageNote: Record<AutoProceduralStage, string> = {
    setup: 'Draw or convert the boundary. Generation will create editable native room nodes first.',
    nodes: 'Move room nodes directly on the canvas. Nearby walls and openings react live from the node movement.',
    walls: 'Review and edit generated wall segments with native canvas tools.',
    openings: 'Review doors, windows, and wall openings. Move, delete, add, or regenerate as needed.',
    furniture: 'Review Smart Procedural furniture, fixtures, and counters on the same canvas.',
    import: 'Final review before loading this floor to the main canvas.',
  };
  const approveLabel: Record<AutoProceduralStage, string> = {
    setup: 'Approve Setup',
    nodes: 'Approve Nodes',
    walls: 'Approve Walls',
    openings: 'Approve Openings',
    furniture: 'Approve Furniture',
    import: 'Ready',
  };

  return (
    <div className="h-full w-full flex bg-slate-50 overflow-hidden">
      <aside className="w-72 shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center gap-2 text-blue-700">
            <Wand2 size={18} />
            <div className="font-black text-sm text-slate-900">{isSmartWorkflow ? 'Instant' : 'Auto Procedural'}</div>
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
            Generate, edit, furnish, and review the floorplan here before importing it to the main canvas.
          </div>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-3 gap-1.5">
            {stageOrder.map(item => (
              <button
                key={item}
                onClick={() => setStage(item)}
                className={`h-8 rounded-lg text-[9px] font-black uppercase tracking-wide border transition-colors ${
                  stage === item ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {stageLabel[item]}
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-[11px] text-blue-800 leading-relaxed">
            <div className="font-black uppercase tracking-wide text-blue-700 mb-1">{stageLabel[stage]}</div>
            {stageNote[stage]}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400">Property</span>
              <select
                value={typologyId}
                onChange={(event) => {
                  const next = PROCEDURAL_TYPOLOGIES.find(item => item.id === event.target.value) || PROCEDURAL_TYPOLOGIES[0];
                  setTypologyId(next.id);
                  setSubtype(next.subtypes[0]);
                }}
                className={inputClass}
              >
                {PROCEDURAL_TYPOLOGIES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400">Subtype</span>
              <select value={subtype} onChange={(event) => setSubtype(event.target.value)} className={inputClass}>
                {selectedTypology.subtypes.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400">Planning</span>
              <select value={planningStyle} onChange={(event) => setPlanningStyle(event.target.value)} className={inputClass}>
                {PROCEDURAL_STYLES.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400">Geometry</span>
              <select value={geometryStyle} onChange={(event) => setGeometryStyle(event.target.value)} className={inputClass}>
                {PROCEDURAL_GEOMETRIES.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>

          {typologyId === 'residential' && (
            <div className="grid grid-cols-4 gap-2">
              {[
                ['Bed', bedrooms, setBedrooms],
                ['Bath', bathrooms, setBathrooms],
                ['Kit', kitchens, setKitchens],
                ['Bal', balconies, setBalconies],
              ].map(([label, value, setter]) => (
                <label key={String(label)} className="space-y-1">
                  <span className="text-[10px] font-black uppercase text-slate-400">{String(label)}</span>
                  <input
                    type="number"
                    min={0}
                    value={Number(value)}
                    onChange={(event) => (setter as React.Dispatch<React.SetStateAction<number>>)(Number(event.target.value))}
                    className={inputClass}
                  />
                </label>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
            <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">Boundary Tools</div>
            <button onClick={() => handleToolSelect(isSmartWorkflow ? 'smart-procedural-boundary' : 'auto-procedural-boundary')} className={primaryButtonClass}>
              <Wand2 size={14} /> Draw Rect Boundary
            </button>
            <div className="grid grid-cols-2 gap-2">
              <input value={dimensionWidth} onChange={(event) => setDimensionWidth(event.target.value)} className={inputClass} placeholder="Width" />
              <input value={dimensionHeight} onChange={(event) => setDimensionHeight(event.target.value)} className={inputClass} placeholder="Depth" />
            </div>
            <button onClick={generateFromDimensions} className={actionButtonClass}>
              <Maximize2 size={14} /> Generate From Dimensions
            </button>
            <button onClick={convertSelectedLoop} className={actionButtonClass}>
              <MousePointer2 size={14} /> Use Selected Closed Lines
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button onClick={regenerate} className={actionButtonClass}><RefreshCw size={14} /> Regenerate</button>
            <button onClick={approveStage} disabled={stage === 'import'} className={actionButtonClass}><Check size={14} /> {approveLabel[stage]}</button>
            <button onClick={generateFurniture} className={actionButtonClass}><DoorOpen size={14} /> Furnish Floorplan</button>
            <button onClick={handleImport} disabled={project.elements.length === 0} className={primaryButtonClass}><Upload size={14} /> Import to Canvas</button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div><span className="font-black text-slate-400">Area</span><div className="font-bold text-slate-800">{stats.area.toFixed(1)} m2</div></div>
              <div><span className="font-black text-slate-400">Rooms</span><div className="font-bold text-slate-800">{stats.rooms}</div></div>
              <div><span className="font-black text-slate-400">Walls</span><div className="font-bold text-slate-800">{stats.walls}</div></div>
              <div><span className="font-black text-slate-400">Openings</span><div className="font-bold text-slate-800">{stats.openings}</div></div>
            </div>
          </div>

          <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-[11px] text-blue-800 leading-relaxed">
            {status}
          </div>

          {warnings.length > 0 && (
            <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 text-[11px] text-amber-800 leading-relaxed space-y-1">
              <div className="flex items-center gap-1 font-black uppercase tracking-wide"><AlertCircle size={13} /> Warnings</div>
              {warnings.slice(0, 3).map((warning, index) => <div key={`${warning}-${index}`}>{warning}</div>)}
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 min-w-0 relative bg-white">
        <div className="absolute inset-0">
          <Canvas
            project={visibleProject}
            editorState={editorState}
            activeLevelId={PREVIEW_LEVEL_ID}
            onElementsChange={handleElementsChange}
            onElementsCommit={handleElementsCommit}
            onSelectionChange={handleSelectionChange}
            onTransformChange={(offset, zoom) => setEditorState(prev => ({ ...prev, offset, zoom }))}
            setEditorState={setEditorState}
            activeProceduralConfig={activeConfig}
          />
        </div>

        <Toolbox
          activeTool={editorState.activeTool}
          selectedCount={editorState.selectedIds.length}
          hasOpeningSelected={hasOpeningSelected}
          hasElevationSelected={false}
          hasWallSelected={hasWallSelected}
          onToolSelect={handleToolSelect}
          onUndo={() => {}}
          onRedo={() => {}}
          onRotate={() => handleToolSelect('rotate')}
          onMirror={() => {}}
          onGroup={() => {}}
          onUngroup={() => {}}
          isSingleGroupSelected={false}
          onFitToView={fitToView}
          position={toolboxPos}
          onPositionChange={setToolboxPos}
        />

        <DrawBar
          activeTool={editorState.activeTool}
          isWallMode={editorState.isWallMode}
          onToolSelect={handleToolSelect}
          position={drawBarPos}
          onPositionChange={setDrawBarPos}
          mode="floorplan"
        />

        <SnapBar
          position={snapBarPos}
          onPositionChange={setSnapBarPos}
          isOrtho={editorState.isOrthoEnabled}
          toggleOrtho={() => setEditorState(prev => ({ ...prev, isOrthoEnabled: !prev.isOrthoEnabled }))}
          isGrid={editorState.isGridVisible}
          toggleGrid={() => setEditorState(prev => ({ ...prev, isGridVisible: !prev.isGridVisible }))}
          isSnap={editorState.isSnapEnabled}
          toggleSnap={() => setEditorState(prev => ({ ...prev, isSnapEnabled: !prev.isSnapEnabled }))}
          isEndpoint={editorState.isEndpointSnap}
          toggleEndpoint={() => setEditorState(prev => ({ ...prev, isEndpointSnap: !prev.isEndpointSnap }))}
          isMidpoint={editorState.isMidpointSnap}
          toggleMidpoint={() => setEditorState(prev => ({ ...prev, isMidpointSnap: !prev.isMidpointSnap }))}
          isIntersection={editorState.isIntersectionSnap}
          toggleIntersection={() => setEditorState(prev => ({ ...prev, isIntersectionSnap: !prev.isIntersectionSnap }))}
          isPointAlignment={editorState.isPointAlignmentSnap}
          togglePointAlignment={() => setEditorState(prev => ({ ...prev, isPointAlignmentSnap: !prev.isPointAlignmentSnap }))}
          isAngularAlignment={editorState.isAngularAlignmentSnap}
          toggleAngularAlignment={() => setEditorState(prev => ({ ...prev, isAngularAlignmentSnap: !prev.isAngularAlignmentSnap }))}
        />

      </main>
    </div>
  );
};

export default AutoProceduralPanel;
