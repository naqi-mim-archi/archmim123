
import React, { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Project, ArchElement, Point, EditorState } from '../types';
import { WALL_THICKNESS_DEFAULT, WALL_HEIGHT_DEFAULT, DEFAULT_PROJECT_SETTINGS_3D, DOOR_WIDTH_DEFAULT, WINDOW_WIDTH_DEFAULT, inferInteriorSeatCount } from '../constants';
import { curveLength as analyticCurveLength, getCurvePoint as analyticGetCurvePoint } from '../services/geometry/curveGeometry';

export interface View3DCameraFrame {
  position: [number, number, number];
  target: [number, number, number];
  isParallel: boolean;
  orthographicZoom?: number;
}

interface Viewer3DProps {
  project: Project;
  editorState?: EditorState;
  activeLevelId?: string;
  onSelectionChange?: (ids: string[]) => void;
  onElementsChange?: (elements: ArchElement[]) => void;
  onElementsCommit?: (elements: ArchElement[]) => void;
  setEditorState?: React.Dispatch<React.SetStateAction<EditorState>>;
  initialCameraFrame?: View3DCameraFrame | null;
  onCameraFrameChange?: (frame: View3DCameraFrame) => void;
}

const orbitCursorSvg = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M7 7h5a5 5 0 0 1 5 5v1"/><path fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m14 10 3 3 3-3"/><path fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M17 17h-5a5 5 0 0 1-5-5v-1"/><path fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="m10 14-3-3-3 3"/></svg>'
);

const ORBIT_CURSOR = `url("data:image/svg+xml,${orbitCursorSvg}") 12 12, grab`;
const LEGACY_3D_PREVIEW_IDS = new Set(['__3d-placement-preview', '3d-placement-preview']);
const NON_PIVOT_ELEMENT_TYPES = new Set(['dimension', 'label', 'elevation-marker', 'cad-underlay', 'group']);

const Viewer3D: React.FC<Viewer3DProps> = ({ project, editorState, activeLevelId, onSelectionChange, onElementsChange, onElementsCommit, setEditorState, initialCameraFrame, onCameraFrameChange }) => {
  // ── DOM / Three.js refs (set once in setup, never replaced) ──────────────────
  const containerRef   = useRef<HTMLDivElement>(null);
  const rendererRef    = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef       = useRef<THREE.Scene | null>(null);
  const cameraRef      = useRef<THREE.Camera | null>(null);
  const controlsRef    = useRef<OrbitControls | null>(null);
  const elemGroupRef   = useRef<THREE.Group | null>(null);
  const groundRef      = useRef<THREE.Mesh | null>(null);
  const gridRef        = useRef<THREE.GridHelper | null>(null);
  const animFrameRef   = useRef<number | null>(null);
  const snapFrameRef   = useRef<number | null>(null);

  // ── Reactive-data refs (updated every render – zero stale-closure risk) ───────
  // These are plain mutable refs, always holding the latest value.
  const projectRef    = useRef<Project>(project);
  const editorStateRef = useRef<EditorState | undefined>(editorState);
  const activeLevelIdRef = useRef<string | undefined>(activeLevelId);
  const selectedIdsRef = useRef<string[]>(editorState?.selectedIds || []);
  const onSelectionChangeRef = useRef<typeof onSelectionChange>(onSelectionChange);
  const onElementsChangeRef = useRef<typeof onElementsChange>(onElementsChange);
  const onElementsCommitRef = useRef<typeof onElementsCommit>(onElementsCommit);
  const setEditorStateRef = useRef<typeof setEditorState>(setEditorState);
  const onCameraFrameChangeRef = useRef<typeof onCameraFrameChange>(onCameraFrameChange);
  const cameraFrameReadyRef = useRef(false);
  const isParallelRef = useRef(false);
  const isMonotoneRef = useRef(true);
  projectRef.current  = project;          // sync on every render
  editorStateRef.current = editorState;
  activeLevelIdRef.current = activeLevelId;
  selectedIdsRef.current = editorState?.selectedIds || [];
  onSelectionChangeRef.current = onSelectionChange;
  onElementsChangeRef.current = onElementsChange;
  onElementsCommitRef.current = onElementsCommit;
  setEditorStateRef.current = setEditorState;
  onCameraFrameChangeRef.current = onCameraFrameChange;

  const doRebuild = useRef<() => void>(() => {});
  const [isParallel, setIsParallel] = useState(initialCameraFrame?.isParallel ?? false);
  const [isMonotone, setIsMonotone] = useState(true);
  const [navigationDragMode, setNavigationDragMode] = useState<'none' | 'orbit' | 'pan'>('none');
  const [selectionMarquee, setSelectionMarquee] = useState<{ start: Point; end: Point } | null>(null);
  isParallelRef.current = isParallel;
  isMonotoneRef.current = isMonotone;

  const meshCache = useRef<Map<string, { hash: string; obj: THREE.Object3D }>>(new Map());
  const gltfCache = useRef<Map<string, THREE.Group>>(new Map());
  const gltfLoaderRef = useRef<GLTFLoader | null>(null);
  const materialsRef = useRef<{ [key: string]: THREE.MeshStandardMaterial } | null>(null);

  const collectPivotBounds = (selectedOnly: boolean) => {
    const proj = projectRef.current;
    const defaultLevelId = proj.levels[0]?.id;
    const levelId = activeLevelIdRef.current || defaultLevelId;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, hasAny = false;
    const expand = (x: number, z: number) => {
      hasAny = true;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    };

    proj.elements.forEach((el) => {
      if (LEGACY_3D_PREVIEW_IDS.has(el.id) || NON_PIVOT_ELEMENT_TYPES.has(el.type)) return;
      if ((el.levelId || defaultLevelId) !== levelId) return;
      if (selectedOnly && !selectedIdsRef.current.includes(el.id)) return;
      if (el.p1) expand(el.p1.x, el.p1.y);
      if (el.p2) expand(el.p2.x, el.p2.y);
      if (el.p3) expand(el.p3.x, el.p3.y);
      if (el.p4) expand(el.p4.x, el.p4.y);
      if (el.pos) expand(el.pos.x, el.pos.y);
      if (el.controlPoint) expand(el.controlPoint.x, el.controlPoint.y);
      if (el.arcCenter) expand(el.arcCenter.x, el.arcCenter.y);
      if (el.ellipseCenter) expand(el.ellipseCenter.x, el.ellipseCenter.y);
      if (el.boundary) el.boundary.forEach((p) => expand(p.x, p.y));
    });

    return { minX, maxX, minZ, maxZ, hasAny };
  };

  useEffect(() => {
    if (!onElementsChange || !project) return;
    const levelId = activeLevelId || project.levels[0]?.id;
    const currentLevel = project.elements.filter(el => (el.levelId || project.levels[0]?.id) === levelId);
    const cleaned = currentLevel
      .filter(el => !LEGACY_3D_PREVIEW_IDS.has(el.id))
      .map(el => el.isPlacingDraft ? { ...el, isPlacingDraft: undefined } : el);
    const changed = cleaned.length !== currentLevel.length || currentLevel.some((el, idx) => el.isPlacingDraft || cleaned[idx]?.id !== el.id);
    if (changed) onElementsChange(cleaned);
  }, [project, activeLevelId, onElementsChange]);

  // ══════════════════════════════════════════════════════════════════════════════
  // ONE-TIME SCENE SETUP — empty deps array, never re-runs
  // ══════════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const W = container.clientWidth  || window.innerWidth;
    const H = container.clientHeight || window.innerHeight;

    // ── Scene ──────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);
    sceneRef.current = scene;

    // ── Lights ─────────────────────────────────────────────────────────────────
    const ambient = new THREE.AmbientLight(0xffffff, 0.45);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 0.4);
    hemi.position.set(0, 50, 0);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffffff, 0.65);
    sun.name = 'sun';
    sun.position.set(60, 100, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left   = -50;
    sun.shadow.camera.right  = 50;
    sun.shadow.camera.top    = 50;
    sun.shadow.camera.bottom = -50;
    sun.shadow.camera.near   = 0.5;
    sun.shadow.camera.far    = 500;
    sun.shadow.bias          = -0.0015;
    scene.add(sun);

    // ── Ground + Grid ──────────────────────────────────────────────────────────
    // Ground is at y = -0.01 so wall bottoms (at y=0) are never coplanar with it.
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, metalness: 0.0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;  // slightly below y=0 to prevent wall-bottom z-fighting
    ground.receiveShadow = true;
    scene.add(ground);
    groundRef.current = ground;

    // ── Elements group ─────────────────────────────────────────────────────────
    const elemGroup = new THREE.Group();
    scene.add(elemGroup);
    elemGroupRef.current = elemGroup;
    const previewGroup = new THREE.Group();
    previewGroup.name = '3d-local-preview';
    scene.add(previewGroup);

    // ── Camera (perspective default) ───────────────────────────────────────────
    const cam = new THREE.PerspectiveCamera(45, W / H, 0.1, 5000);
    cam.position.set(0, 30, 50);
    cam.lookAt(0, 0, 0);
    cameraRef.current = cam;

    // ── Renderer ───────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ── OrbitControls (Revit-style) ────────────────────────────────────────────
    const controls = new OrbitControls(cam, renderer.domElement);
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.06;
    controls.zoomSpeed      = 1.2;
    controls.mouseButtons   = { LEFT: undefined as any, MIDDLE: THREE.MOUSE.ROTATE, RIGHT: undefined as any };
    if (initialCameraFrame) {
      cam.position.fromArray(initialCameraFrame.position);
      controls.target.fromArray(initialCameraFrame.target);
      cameraFrameReadyRef.current = true;
    }
    controlsRef.current = controls;

    // Shift → swap middle to orbit
    const onKD = (e: KeyboardEvent) => { if (e.key === 'Shift') controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN; };
    const onKU = (e: KeyboardEvent) => { if (e.key === 'Shift') controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE; };
    const onBl = () => { controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE; setNavigationDragMode('none'); };
    window.addEventListener('keydown', onKD);
    window.addEventListener('keyup',   onKU);
    window.addEventListener('blur',    onBl);

    // Camera change → ViewCube sync
    const onCamChange = () => {
      const c = cameraRef.current!;
      const off = new THREE.Vector3().subVectors(c.position, controls.target);
      const r = off.length();
      if (r === 0) return;
      window.dispatchEvent(new CustomEvent('3d-camera-change', {
        detail: { theta: Math.atan2(off.x, off.z), phi: Math.acos(Math.max(-1, Math.min(1, off.y / r))) }
      }));
      onCameraFrameChangeRef.current?.({
        position: [c.position.x, c.position.y, c.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z],
        isParallel: isParallelRef.current,
        orthographicZoom: c instanceof THREE.OrthographicCamera ? c.zoom : undefined,
      });
      cameraFrameReadyRef.current = true;
    };
    controls.addEventListener('change', onCamChange);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const dragState: {
      start?: Point;
      originals?: ArchElement[];
      selectedIds?: string[];
      moved?: boolean;
      draftTool?: string;
      pointerId?: number;
      pointerDown?: boolean;
    } = {};
    const selectionGestureState: {
      button?: number;
      start?: Point;
      end?: Point;
      active?: boolean;
      shiftKey?: boolean;
      altKey?: boolean;
    } = {};
    const middlePanState: {
      pointerId?: number;
      start?: Point;
      startTarget?: THREE.Vector3;
      startPosition?: THREE.Vector3;
    } = {};
    let orbitPivotFrame: number | null = null;

    const getLevelElevNow = (lid?: string) => lid ? (projectRef.current.levels.find(l => l.id === lid)?.zElevation ?? 0) : 0;
    const getLevelHeightNow = (lid?: string) => lid ? (projectRef.current.levels.find(l => l.id === lid)?.height ?? WALL_HEIGHT_DEFAULT) : WALL_HEIGHT_DEFAULT;

    const getEventPoint = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, cameraRef.current!);
      const levelId = activeLevelIdRef.current || projectRef.current.levels[0]?.id;
      const levelY = getLevelElevNow(levelId);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -levelY);
      const hit = new THREE.Vector3();
      if (!raycaster.ray.intersectPlane(plane, hit)) return null;
      const point = { x: hit.x, y: hit.z };
      const state = editorStateRef.current;
      if (state?.isSnapEnabled && state.isGridVisible) {
        return { x: Math.round(point.x / 0.25) * 0.25, y: Math.round(point.y / 0.25) * 0.25 };
      }
      return point;
    };

    const pickElementId = (e: PointerEvent) => {
      const group = elemGroupRef.current;
      if (!group || !cameraRef.current) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, cameraRef.current);
      const hits = raycaster
        .intersectObjects(group.children, true)
        .filter(i => i.object.userData?.elementId && !i.object.userData?.isSelectionOutline);
      if (hits.length === 0) return null;

      const elementById = new Map<string, ArchElement>(projectRef.current.elements.map(el => [el.id, el] as [string, ArchElement]));
      const pickRank = (id: string) => {
        const type = elementById.get(id)?.type;
        if (type === 'door' || type === 'window' || type === 'wall-opening') return 0;
        if (type === 'furniture' || type === 'fixture' || type === 'counter' || type === 'column' || type === 'asset') return 1;
        if (type === 'stair' || type === 'railing') return 2;
        if (type === 'floor' || type === 'ceiling' || type === 'landscape' || type === 'water-body') return 5;
        if (type === 'wall') return 6;
        return 3;
      };

      const nearest = hits[0].distance;
      const candidates = hits
        .filter(hit => hit.distance <= nearest + 1.25)
        .sort((a, b) => {
          const rankDiff = pickRank(a.object.userData.elementId) - pickRank(b.object.userData.elementId);
          return rankDiff !== 0 ? rankDiff : a.distance - b.distance;
      });
      return candidates[0].object.userData.elementId as string | null;
    };

    const getScreenPoint = (e: PointerEvent): Point => {
      const rect = renderer.domElement.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const getElementScreenRect = (elementId: string) => {
      const group = elemGroupRef.current;
      const camera = cameraRef.current;
      if (!group || !camera) return null;
      const object = group.children.find(child => child.userData?.elementId === elementId);
      if (!object) return null;
      const box = new THREE.Box3().setFromObject(object);
      if (box.isEmpty()) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      const corners = [
        new THREE.Vector3(box.min.x, box.min.y, box.min.z),
        new THREE.Vector3(box.min.x, box.min.y, box.max.z),
        new THREE.Vector3(box.min.x, box.max.y, box.min.z),
        new THREE.Vector3(box.min.x, box.max.y, box.max.z),
        new THREE.Vector3(box.max.x, box.min.y, box.min.z),
        new THREE.Vector3(box.max.x, box.min.y, box.max.z),
        new THREE.Vector3(box.max.x, box.max.y, box.min.z),
        new THREE.Vector3(box.max.x, box.max.y, box.max.z),
      ].map(corner => corner.project(camera));
      const xs = corners.map(corner => (corner.x * 0.5 + 0.5) * rect.width);
      const ys = corners.map(corner => (-corner.y * 0.5 + 0.5) * rect.height);
      return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
      };
    };

    const selectByScreenMarquee = (start: Point, end: Point, shiftKey?: boolean, altKey?: boolean) => {
      const minX = Math.min(start.x, end.x);
      const maxX = Math.max(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const maxY = Math.max(start.y, end.y);
      const isCrossing = end.x < start.x;
      const ids = currentLevelElements()
        .filter(el => el.type !== 'ceiling')
        .filter(el => {
          const bounds = getElementScreenRect(el.id);
          if (!bounds) return false;
          const fullyInside = bounds.minX >= minX && bounds.maxX <= maxX && bounds.minY >= minY && bounds.maxY <= maxY;
          if (!isCrossing) return fullyInside;
          return bounds.minX <= maxX && bounds.maxX >= minX && bounds.minY <= maxY && bounds.maxY >= minY;
        })
        .map(el => el.id);

      if (shiftKey) onSelectionChangeRef.current?.(Array.from(new Set([...selectedIdsRef.current, ...ids])));
      else if (altKey) onSelectionChangeRef.current?.(selectedIdsRef.current.filter(id => !ids.includes(id)));
      else onSelectionChangeRef.current?.(ids);
    };

    const startSelectionGesture = (e: PointerEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      selectionGestureState.button = e.button;
      selectionGestureState.start = getScreenPoint(e);
      selectionGestureState.end = selectionGestureState.start;
      selectionGestureState.active = false;
      selectionGestureState.shiftKey = e.shiftKey;
      selectionGestureState.altKey = e.altKey;
      setSelectionMarquee(null);
      renderer.domElement.setPointerCapture(e.pointerId);
    };

    const currentLevelElements = () => {
      const proj = projectRef.current;
      const levelId = activeLevelIdRef.current || proj.levels[0]?.id;
      return proj.elements
        .filter(el => !LEGACY_3D_PREVIEW_IDS.has(el.id))
        .filter(el => (el.levelId || proj.levels[0]?.id) === levelId)
        .map(el => el.isPlacingDraft ? { ...el, isPlacingDraft: undefined } : el);
    };

    const active3DLineTool = (tool?: string) => ['wall','line','gridline','dimension','railing','stair','road','arc','ellipse','circle'].includes(tool || '');
    const active3DRectTool = (tool?: string) => ['rect','floor','ceiling','room','building-mass','landscape','water-body'].includes(tool || '');
    const wallModeShapeTool = (tool?: string) => !!tool && ['line','rect','arc','ellipse'].includes(tool);
    const placementTool = (tool?: string) => ['door','window','wall-opening','column','furniture','fixture','counter','tree','streetlight','bench','car'].includes(tool || '');

    const translateElement = (el: ArchElement, dx: number, dy: number): ArchElement => {
      const movePt = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
      return {
        ...el,
        pos: el.pos ? movePt(el.pos) : el.pos,
        p1: el.p1 ? movePt(el.p1) : el.p1,
        p2: el.p2 ? movePt(el.p2) : el.p2,
        p3: el.p3 ? movePt(el.p3) : el.p3,
        p4: el.p4 ? movePt(el.p4) : el.p4,
        controlPoint: el.controlPoint ? movePt(el.controlPoint) : el.controlPoint,
        boundary: el.boundary?.map(movePt),
      };
    };

    const nearestWallPlacement = (point: Point, maxDist = 2.0) => {
      const walls = projectRef.current.elements.filter(el => el.type === 'wall' && el.p1 && el.p2);
      let best: { wall: ArchElement; point: Point; t: number; angle: number; dist: number } | null = null;
      walls.forEach((wall) => {
        const p1 = wall.p1!, p2 = wall.p2!;
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const len2 = dx * dx + dy * dy;
        if (len2 < 0.001) return;
        const t = Math.max(0, Math.min(1, ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / len2));
        const projected = { x: p1.x + dx * t, y: p1.y + dy * t };
        const dist = Math.hypot(point.x - projected.x, point.y - projected.y);
        if (!best || dist < best.dist) best = { wall, point: projected, t, angle: Math.atan2(dy, dx) * 180 / Math.PI, dist };
      });
      return best && best.dist < maxDist ? best : null;
    };

    const draftElementFromPoints = (tool: string, p1: Point, p2: Point): ArchElement | null => {
      const levelId = activeLevelIdRef.current || projectRef.current.levels[0]?.id;
      const s3dNow = { ...DEFAULT_PROJECT_SETTINGS_3D, ...(projectRef.current.settings3D || {}) };
      const preset = editorStateRef.current?.activePreset || {};
      const isWallMode = tool === 'wall' || (!!editorStateRef.current?.isWallMode && wallModeShapeTool(tool));
      const base = { id: crypto.randomUUID(), levelId };
      if (active3DLineTool(tool)) {
        const type = isWallMode ? 'wall' : tool === 'road' ? 'road' : tool;
        return {
          ...base,
          type: type as ArchElement['type'],
          p1,
          p2,
          width: preset.width || (tool === 'road' ? 4 : tool === 'stair' ? 1.05 : tool === 'railing' ? 0.05 : undefined),
          thickness: isWallMode ? (preset.thickness || WALL_THICKNESS_DEFAULT) : undefined,
          height: isWallMode ? s3dNow.wallHeight : preset.height,
          elevation: isWallMode ? 0 : undefined,
          wallSource: isWallMode ? (tool === 'wall' ? 'line' : tool) : undefined,
          isCurved: isWallMode ? ['arc','ellipse','circle'].includes(tool) : ['arc','ellipse','circle'].includes(tool),
          subType: preset.subType,
        };
      }
      if (active3DRectTool(tool)) {
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);
        if (Math.abs(maxX - minX) < 0.05 || Math.abs(maxY - minY) < 0.05) return null;
        const boundary = [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ];
        if (tool === 'rect' && !isWallMode) {
          return { ...base, type: 'rectangle', p1, p2 };
        }
        if (tool === 'rect' && isWallMode) {
          return {
            ...base,
            type: 'wall',
            p1,
            p2,
            boundary,
            thickness: preset.thickness || WALL_THICKNESS_DEFAULT,
            height: s3dNow.wallHeight,
            elevation: 0,
            wallSource: 'rect',
          };
        }
        if (tool === 'room') {
          return {
            ...base,
            type: 'floor',
            boundary,
            label: 'Room',
          };
        }
        return {
          ...base,
          type: tool as ArchElement['type'],
          boundary,
          height: tool === 'building-mass' ? (preset.height || 10) : preset.height,
          usageType: tool === 'building-mass' ? 'residential' : undefined,
        };
      }
      return null;
    };

    const draftElementsFromPoints = (tool: string, p1: Point, p2: Point): ArchElement[] => {
      const state = editorStateRef.current;
      const isWallMode = tool === 'wall' || (!!state?.isWallMode && wallModeShapeTool(tool));
      const levelId = activeLevelIdRef.current || projectRef.current.levels[0]?.id;
      const s3dNow = { ...DEFAULT_PROJECT_SETTINGS_3D, ...(projectRef.current.settings3D || {}) };
      const preset = state?.activePreset || {};
      if (tool === 'rect' && isWallMode) {
        const minX = Math.min(p1.x, p2.x);
        const maxX = Math.max(p1.x, p2.x);
        const minY = Math.min(p1.y, p2.y);
        const maxY = Math.max(p1.y, p2.y);
        if (Math.abs(maxX - minX) < 0.05 || Math.abs(maxY - minY) < 0.05) return [];
        const corners = [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY },
        ];
        return corners.map((corner, i) => ({
          id: crypto.randomUUID(),
          type: 'wall' as const,
          p1: corner,
          p2: corners[(i + 1) % corners.length],
          thickness: preset.thickness || WALL_THICKNESS_DEFAULT,
          height: s3dNow.wallHeight,
          elevation: 0,
          wallSource: 'line',
          levelId,
        }));
      }
      const draft = draftElementFromPoints(tool, p1, p2);
      return draft ? [draft] : [];
    };

    const stairPointCount = (subType?: string) => subType === 'L' ? 3 : subType === 'U' ? 4 : 2;

    const stairFromPoints = (points: Point[], subType?: string): ArchElement | null => {
      const needed = stairPointCount(subType);
      if (points.length < needed) return null;
      const preset = editorStateRef.current?.activePreset || {};
      return {
        id: crypto.randomUUID(),
        type: 'stair',
        p1: points[0],
        p2: points[1],
        p3: points[2],
        p4: points[3],
        width: preset.width || 1.05,
        subType: subType || 'linear',
        levelId: activeLevelIdRef.current || projectRef.current.levels[0]?.id,
      };
    };

    const previewStairPoints = (points: Point[], subType?: string) => {
      const preview = stairFromPoints(points, subType);
      showPreviewElements(preview ? [preview] : []);
    };

    const disposePreview = () => {
      previewGroup.traverse((obj: any) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) obj.material.forEach((m: THREE.Material) => m.dispose());
          else obj.material.dispose();
        }
      });
      previewGroup.clear();
    };

    const previewMaterial = (color = 0x2563eb, opacity = 0.34) => new THREE.MeshStandardMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      roughness: 0.7,
    });

    const addPreviewBox = (center: Point, width: number, depth: number, height: number, rotationDeg = 0, color = 0x2563eb) => {
      const levelId = activeLevelIdRef.current || projectRef.current.levels[0]?.id;
      const y = getLevelElevNow(levelId) + height / 2;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(width, 0.03), Math.max(height, 0.03), Math.max(depth, 0.03)), previewMaterial(color));
      mesh.position.set(center.x, y, center.y);
      mesh.rotation.y = -(rotationDeg * Math.PI / 180);
      previewGroup.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }));
      edges.position.copy(mesh.position);
      edges.rotation.copy(mesh.rotation);
      previewGroup.add(edges);
    };

    const addPreviewLine = (points: THREE.Vector3[], color = 0x22c55e, opacity = 0.95) => {
      if (points.length < 2) return;
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false })
      );
      line.renderOrder = 100;
      previewGroup.add(line);
    };

    const addPreviewOpeningSymbol = (el: ArchElement) => {
      if (!el.pos) return;
      const levelId = activeLevelIdRef.current || projectRef.current.levels[0]?.id;
      const lZ = getLevelElevNow(levelId);
      const w = el.width || (el.type === 'door' ? DOOR_WIDTH_DEFAULT : WINDOW_WIDTH_DEFAULT);
      const rot = (el.rotation || 0) * Math.PI / 180;
      const ux = Math.cos(rot);
      const uz = Math.sin(rot);
      const nx = -uz;
      const nz = ux;
      const lift = el.type === 'window' ? 1.2 : el.type === 'wall-opening' ? 1.0 : 0.08;
      const y = lZ + lift;
      const local = (x: number, z: number) => new THREE.Vector3(el.pos!.x + ux * x + nx * z, y, el.pos!.y + uz * x + nz * z);

      if (el.type === 'door') {
        addPreviewLine([local(-w / 2, 0), local(w / 2, 0)], 0x22c55e);
        addPreviewLine([local(-w / 2, 0), local(-w / 2, w * 0.65)], 0x22c55e);
        const arc: THREE.Vector3[] = [];
        for (let i = 0; i <= 18; i++) {
          const a = (i / 18) * Math.PI / 2;
          arc.push(local(-w / 2 + Math.cos(a) * w * 0.65, Math.sin(a) * w * 0.65));
        }
        addPreviewLine(arc, 0x22c55e);
      } else if (el.type === 'window') {
        addPreviewLine([local(-w / 2, -0.08), local(w / 2, -0.08)], 0x06b6d4);
        addPreviewLine([local(-w / 2, 0.08), local(w / 2, 0.08)], 0x06b6d4);
        addPreviewLine([local(0, -0.12), local(0, 0.12)], 0x06b6d4);
      } else {
        addPreviewLine([local(-w / 2, -0.12), local(w / 2, -0.12), local(w / 2, 0.12), local(-w / 2, 0.12), local(-w / 2, -0.12)], 0xf59e0b);
      }
    };

    const showPreviewElements = (elements: ArchElement[]) => {
      disposePreview();
      const s3dNow = { ...DEFAULT_PROJECT_SETTINGS_3D, ...(projectRef.current.settings3D || {}) };
      elements.forEach((el) => {
        if (el.type === 'wall' && el.p1 && el.p2) {
          const dx = el.p2.x - el.p1.x;
          const dy = el.p2.y - el.p1.y;
          const len = Math.hypot(dx, dy);
          if (len < 0.001) return;
          addPreviewBox(
            { x: (el.p1.x + el.p2.x) / 2, y: (el.p1.y + el.p2.y) / 2 },
            len,
            el.thickness || WALL_THICKNESS_DEFAULT,
            el.height || s3dNow.wallHeight,
            Math.atan2(dy, dx) * 180 / Math.PI,
            0x2563eb
          );
          return;
        }
        if (el.type === 'stair' && el.p1 && el.p2 && (el.p3 || el.p4)) {
          const pts = [el.p1, el.p2, el.p3, el.p4].filter(Boolean) as Point[];
          for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i];
            const b = pts[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy);
            if (len < 0.001) continue;
            addPreviewBox(
              { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
              len,
              el.width || 1.05,
              0.35,
              Math.atan2(dy, dx) * 180 / Math.PI,
              0x64748b
            );
          }
          return;
        }
        if ((el.type === 'line' || el.type === 'gridline' || el.type === 'railing' || el.type === 'road' || el.type === 'stair') && el.p1 && el.p2) {
          const dx = el.p2.x - el.p1.x;
          const dy = el.p2.y - el.p1.y;
          const len = Math.hypot(dx, dy);
          if (len < 0.001) return;
          addPreviewBox(
            { x: (el.p1.x + el.p2.x) / 2, y: (el.p1.y + el.p2.y) / 2 },
            len,
            el.width || (el.type === 'road' ? 4 : el.type === 'stair' ? 1.05 : 0.04),
            el.type === 'railing' ? 1 : el.type === 'stair' ? 0.35 : 0.04,
            Math.atan2(dy, dx) * 180 / Math.PI,
            0x64748b
          );
          return;
        }
        if ((el.type === 'rectangle' || el.type === 'floor' || el.type === 'ceiling' || el.type === 'building-mass' || el.type === 'landscape' || el.type === 'water-body') && (el.boundary || (el.p1 && el.p2))) {
          const pts = el.boundary || (el.p1 && el.p2 ? [
            el.p1,
            { x: el.p2.x, y: el.p1.y },
            el.p2,
            { x: el.p1.x, y: el.p2.y },
          ] : []);
          if (!pts || pts.length < 3) return;
          const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p.x, -p.y)));
          const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), previewMaterial(0x2563eb, 0.22));
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.y = getLevelElevNow(el.levelId) + 0.06;
          previewGroup.add(mesh);
          return;
        }
        if ((el.type === 'door' || el.type === 'window' || el.type === 'wall-opening') && el.pos) {
          addPreviewBox(el.pos, el.width || 1, 0.14, el.type === 'door' ? s3dNow.doorHeight : 0.28, el.rotation || 0, 0x22c55e);
          addPreviewOpeningSymbol(el);
          return;
        }
        if ((['column','furniture','fixture','counter','asset'].includes(el.type)) && el.pos) {
          addPreviewBox(el.pos, el.width || 0.8, el.depth || 0.8, el.height || 0.6, el.rotation || 0, 0x22c55e);
        }
      });
    };

    const placeElementAt = (point: Point) => {
      const state = editorStateRef.current;
      const tool = state?.activeTool;
      if (!state || !tool) return false;
      const s3dNow = { ...DEFAULT_PROJECT_SETTINGS_3D, ...(projectRef.current.settings3D || {}) };
      const preset = state.activePreset || {};
      const levelId = activeLevelIdRef.current || projectRef.current.levels[0]?.id;
      let created: ArchElement | null = null;

      if (tool === 'door' || tool === 'window' || tool === 'wall-opening') {
        const placement = nearestWallPlacement(point);
        if (!placement) return false;
        created = {
          id: crypto.randomUUID(),
          type: tool,
          pos: placement.point,
          rotation: placement.angle,
          hostWallId: placement.wall.id,
          hostT: placement.t,
          width: preset.width || (tool === 'door' ? DOOR_WIDTH_DEFAULT : WINDOW_WIDTH_DEFAULT),
          subType: preset.subType || (tool === 'door' ? 'single' : 'standard'),
          levelId,
          ...(tool === 'door'
            ? { elevation: 0, height: s3dNow.doorHeight }
            : tool === 'window'
              ? { elevation: 0, sillHeight: s3dNow.windowSillHeight, topHeight: s3dNow.windowTopHeight, height: s3dNow.windowTopHeight - s3dNow.windowSillHeight }
              : { elevation: 0, height: s3dNow.wallOpeningHeight })
        };
      } else if (['column','furniture','fixture','counter'].includes(tool)) {
        created = {
          id: crypto.randomUUID(),
          type: tool as ArchElement['type'],
          pos: point,
          rotation: preset.rotation || 0,
          width: preset.width || (tool === 'column' ? 0.35 : 1),
          depth: preset.depth || (tool === 'column' ? 0.35 : 0.6),
          height: preset.height || (tool === 'column' ? getLevelHeightNow(levelId) : tool === 'counter' ? 0.9 : 0.5),
          subType: preset.subType,
          shape: preset.shape,
          assetId: preset.assetId,
          sourceType: preset.sourceType,
          sourceFileType: preset.sourceFileType,
          sourceFileName: preset.sourceFileName,
          revitFamilyName: preset.revitFamilyName,
          revitTypeName: preset.revitTypeName,
          classname: preset.classname,
          displayName: preset.displayName,
          userCategory: preset.userCategory,
          isImportedAsset: preset.isImportedAsset,
          nativeCatalogAsset: preset.nativeCatalogAsset,
          model3D: preset.model3D,
          planView2D: preset.planView2D,
          elevationViews: preset.elevationViews,
          thumbnail: preset.thumbnail,
          dimensions: preset.dimensions,
          materials: preset.materials,
          metadata: preset.metadata,
          importTimestamp: preset.importTimestamp,
          importVersion: preset.importVersion,
          customMeshData: preset.customMeshData,
          bimMetadata: preset.bimMetadata,
          seatsCount: preset.seatsCount,
          bedPillows: preset.bedPillows,
          levelId,
        };
      } else if (['tree','streetlight','bench','car'].includes(tool)) {
        created = {
          id: crypto.randomUUID(),
          type: 'asset',
          pos: point,
          assetType: tool as any,
          scale: preset.scale || 1,
          width: preset.width || 1,
          depth: preset.depth || 1,
          height: preset.height || 1,
          levelId,
        };
      }

      if (!created) return false;
      const next = [...currentLevelElements(), created];
      onElementsCommitRef.current?.(next);
      onSelectionChangeRef.current?.([created.id]);
      setEditorStateRef.current?.(prev => ({ ...prev, selectedIds: [created!.id] }));
      return true;
    };

    const shouldContinueDrawing = (tool?: string) => ['line', 'wall', 'arc', 'road'].includes(tool || '');

    const finishDrawingAt = (point: Point) => {
      if (!dragState.start || !dragState.originals || !dragState.draftTool) return false;
      const drafts = draftElementsFromPoints(dragState.draftTool, dragState.start, point);
      if (!drafts.length) {
        showPreviewElements([]);
        return false;
      }

      const nextElements = [...dragState.originals, ...drafts];
      onElementsCommitRef.current?.(nextElements);
      onSelectionChangeRef.current?.(drafts.map(d => d.id));
      showPreviewElements([]);

      if (shouldContinueDrawing(dragState.draftTool)) {
        dragState.start = point;
        dragState.originals = nextElements;
        dragState.moved = false;
        dragState.pointerDown = false;
        dragState.pointerId = undefined;
        setEditorStateRef.current?.(prev => ({ ...prev, selectedIds: drafts.map(d => d.id) }));
      } else {
        const ids = drafts.map(d => d.id);
        dragState.start = undefined;
        dragState.originals = undefined;
        dragState.draftTool = undefined;
        dragState.moved = false;
        dragState.pointerDown = false;
        dragState.pointerId = undefined;
        setEditorStateRef.current?.(prev => ({ ...prev, activeTool: 'select', selectedIds: ids }));
      }
      return true;
    };

    const cancelPendingDrawing = () => {
      dragState.start = undefined;
      dragState.originals = undefined;
      dragState.draftTool = undefined;
      dragState.moved = false;
      dragState.pointerDown = false;
      dragState.pointerId = undefined;
      showPreviewElements([]);
      controls.enabled = true;
    };

    const placementPreviewAt = (point: Point): ArchElement | null => {
      const state = editorStateRef.current;
      const tool = state?.activeTool;
      if (!state || !placementTool(tool)) return null;
      const s3dNow = { ...DEFAULT_PROJECT_SETTINGS_3D, ...(projectRef.current.settings3D || {}) };
      const preset = state.activePreset || {};
      const levelId = activeLevelIdRef.current || projectRef.current.levels[0]?.id;

      if (tool === 'door' || tool === 'window' || tool === 'wall-opening') {
        const placement = nearestWallPlacement(point);
        if (!placement) return null;
        return {
          id: '3d-placement-preview',
          type: tool,
          pos: placement.point,
          rotation: placement.angle,
          hostWallId: placement.wall.id,
          hostT: placement.t,
          width: preset.width || (tool === 'door' ? DOOR_WIDTH_DEFAULT : WINDOW_WIDTH_DEFAULT),
          subType: preset.subType || (tool === 'door' ? 'single' : 'standard'),
          levelId,
          ...(tool === 'door'
            ? { elevation: 0, height: s3dNow.doorHeight }
            : tool === 'window'
              ? { elevation: 0, sillHeight: s3dNow.windowSillHeight, topHeight: s3dNow.windowTopHeight, height: s3dNow.windowTopHeight - s3dNow.windowSillHeight }
              : { elevation: 0, height: s3dNow.wallOpeningHeight })
        };
      }

      if (['column','furniture','fixture','counter'].includes(tool)) {
        return {
          id: '3d-placement-preview',
          type: tool as ArchElement['type'],
          pos: point,
          rotation: preset.rotation || 0,
          width: preset.width || (tool === 'column' ? 0.35 : 1),
          depth: preset.depth || (tool === 'column' ? 0.35 : 0.6),
          height: preset.height || (tool === 'column' ? getLevelHeightNow(levelId) : tool === 'counter' ? 0.9 : 0.5),
          subType: preset.subType,
          shape: preset.shape,
          assetId: preset.assetId,
          sourceType: preset.sourceType,
          sourceFileType: preset.sourceFileType,
          sourceFileName: preset.sourceFileName,
          revitFamilyName: preset.revitFamilyName,
          revitTypeName: preset.revitTypeName,
          classname: preset.classname,
          displayName: preset.displayName,
          userCategory: preset.userCategory,
          isImportedAsset: preset.isImportedAsset,
          nativeCatalogAsset: preset.nativeCatalogAsset,
          model3D: preset.model3D,
          planView2D: preset.planView2D,
          elevationViews: preset.elevationViews,
          thumbnail: preset.thumbnail,
          dimensions: preset.dimensions,
          materials: preset.materials,
          metadata: preset.metadata,
          importTimestamp: preset.importTimestamp,
          importVersion: preset.importVersion,
          customMeshData: preset.customMeshData,
          bimMetadata: preset.bimMetadata,
          seatsCount: preset.seatsCount,
          bedPillows: preset.bedPillows,
          levelId,
        };
      }

      if (['tree','streetlight','bench','car'].includes(tool)) {
        return {
          id: '3d-placement-preview',
          type: 'asset',
          pos: point,
          assetType: tool as any,
          scale: preset.scale || 1,
          width: preset.width || 1,
          depth: preset.depth || 1,
          height: preset.height || 1,
          levelId,
        };
      }

      return null;
    };

    const updatePlacementPreview = (e: PointerEvent) => {
      const state = editorStateRef.current;
      if (!state || !placementTool(state.activeTool) || dragState.start || selectionGestureState.start || middlePanState.start) return;
      const point = getEventPoint(e);
      const preview = point ? placementPreviewAt(point) : null;
      showPreviewElements(preview ? [preview] : []);
    };

    const clearPlacementPreview = () => {
      disposePreview();
    };

    const startMiddlePan = (e: PointerEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      controls.enabled = false;
      middlePanState.pointerId = e.pointerId;
      middlePanState.start = getScreenPoint(e);
      middlePanState.startTarget = controls.target.clone();
      middlePanState.startPosition = cameraRef.current!.position.clone();
      setNavigationDragMode('pan');
      renderer.domElement.setPointerCapture(e.pointerId);
    };

    const updateMiddlePan = (e: PointerEvent) => {
      if (!middlePanState.start || !middlePanState.startTarget || !middlePanState.startPosition) return;
      const camera = cameraRef.current;
      if (!camera) return;
      e.preventDefault();
      e.stopImmediatePropagation();

      const current = getScreenPoint(e);
      const dx = current.x - middlePanState.start.x;
      const dy = current.y - middlePanState.start.y;
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      camera.updateMatrix();
      camera.updateMatrixWorld();
      const xAxis = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
      const yAxis = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);

      let panX = 0;
      let panY = 0;
      if (camera instanceof THREE.OrthographicCamera) {
        panX = dx * (camera.right - camera.left) / camera.zoom / rect.width;
        panY = dy * (camera.top - camera.bottom) / camera.zoom / rect.height;
      } else if (camera instanceof THREE.PerspectiveCamera) {
        const offset = middlePanState.startPosition.clone().sub(middlePanState.startTarget);
        const targetDistance = offset.length() * Math.tan((camera.fov / 2) * Math.PI / 180);
        panX = 2 * dx * targetDistance / rect.height;
        panY = 2 * dy * targetDistance / rect.height;
      }

      const panOffset = xAxis.multiplyScalar(-panX).add(yAxis.multiplyScalar(panY));
      camera.position.copy(middlePanState.startPosition).add(panOffset);
      controls.target.copy(middlePanState.startTarget).add(panOffset);
      controls.update();
    };

    const endMiddlePan = (e?: PointerEvent) => {
      middlePanState.pointerId = undefined;
      middlePanState.start = undefined;
      middlePanState.startTarget = undefined;
      middlePanState.startPosition = undefined;
      controls.enabled = true;
      setNavigationDragMode('none');
      controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
      if (e) {
        try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {}
      }
    };

    const alignOrbitTargetToPivot = () => {
      const camera = cameraRef.current;
      if (!camera || !controls) return;
      const selectedBounds = selectedIdsRef.current.length ? collectPivotBounds(true) : null;
      const bounds = selectedBounds?.hasAny ? selectedBounds : collectPivotBounds(false);
      if (!bounds.hasAny) return;

      const pivot = new THREE.Vector3(
        (bounds.minX + bounds.maxX) / 2,
        0,
        (bounds.minZ + bounds.maxZ) / 2
      );
      if (controls.target.distanceTo(pivot) < 0.001) return;

      if (orbitPivotFrame !== null) cancelAnimationFrame(orbitPivotFrame);
      const startTarget = controls.target.clone();
      const startPosition = camera.position.clone();
      const endPosition = startPosition.clone().add(pivot.clone().sub(startTarget));
      const startedAt = performance.now();
      const duration = 180;

      const animatePivot = (now: number) => {
        const p = Math.min((now - startedAt) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        controls.target.lerpVectors(startTarget, pivot, eased);
        camera.position.lerpVectors(startPosition, endPosition, eased);
        controls.update();
        if (p < 1) {
          orbitPivotFrame = requestAnimationFrame(animatePivot);
        } else {
          orbitPivotFrame = null;
        }
      };

      orbitPivotFrame = requestAnimationFrame(animatePivot);
    };

    const onPointerDown3D = (e: PointerEvent) => {
      if (e.button === 1) {
        if (e.shiftKey) {
          startMiddlePan(e);
          return;
        }
        alignOrbitTargetToPivot();
        controls.mouseButtons.MIDDLE = e.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
        setNavigationDragMode(e.shiftKey ? 'pan' : 'orbit');
        return;
      }
      const state = editorStateRef.current;
      const placeable = ['door','window','wall-opening','column','furniture','fixture','counter','tree','streetlight','bench','car'].includes(state?.activeTool || '');
      if (e.button === 2) {
        startSelectionGesture(e);
        return;
      }
      if (e.button === 0 && state && (state.activeTool === 'select' || placeable)) {
        startSelectionGesture(e);
        return;
      }
      if (!state || state.activeTool === 'pan') return;
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const point = getEventPoint(e);
      if (!point) return;

      if (state.activeTool === 'stair') {
        const subType = state.activePreset?.subType || 'linear';
        if (subType === 'L' || subType === 'U') {
          const buffer = [...(state.multiPointBuffer || []), point];
          const needed = stairPointCount(subType);
          if (buffer.length >= needed) {
            const stair = stairFromPoints(buffer, subType);
            if (stair) {
              const next = [...currentLevelElements(), stair];
              onElementsCommitRef.current?.(next);
              onSelectionChangeRef.current?.([stair.id]);
              setEditorStateRef.current?.(prev => ({ ...prev, multiPointBuffer: [], selectedIds: [stair.id] }));
              showPreviewElements([]);
            }
          } else {
            setEditorStateRef.current?.(prev => ({ ...prev, multiPointBuffer: buffer }));
            previewStairPoints(buffer, subType);
          }
          return;
        }
      }

      if (active3DLineTool(state.activeTool) || active3DRectTool(state.activeTool)) {
        if (!dragState.start || dragState.draftTool !== state.activeTool) {
          dragState.start = point;
          dragState.originals = currentLevelElements();
          dragState.draftTool = state.activeTool;
        }
        dragState.moved = false;
        dragState.pointerDown = true;
        dragState.pointerId = e.pointerId;
        controls.enabled = false;
        renderer.domElement.setPointerCapture(e.pointerId);
        return;
      }

      const hitId = pickElementId(e);
      if (state.activeTool === 'move' && selectedIdsRef.current.length > 0) {
        dragState.start = point;
        dragState.selectedIds = [...selectedIdsRef.current];
        dragState.originals = currentLevelElements();
        dragState.moved = false;
        controls.enabled = false;
        renderer.domElement.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }

    };

    const onPointerMove3D = (e: PointerEvent) => {
      if (middlePanState.start) {
        updateMiddlePan(e);
        return;
      }
      if (selectionGestureState.start) {
        e.preventDefault();
        e.stopImmediatePropagation();
        selectionGestureState.end = getScreenPoint(e);
        const dist = Math.hypot(selectionGestureState.end.x - selectionGestureState.start.x, selectionGestureState.end.y - selectionGestureState.start.y);
        if (dist > 4) {
          selectionGestureState.active = true;
          setSelectionMarquee({ start: selectionGestureState.start, end: selectionGestureState.end });
        }
        return;
      }
      updatePlacementPreview(e);
      const state = editorStateRef.current;
      if (state?.activeTool === 'stair' && (state.activePreset?.subType === 'L' || state.activePreset?.subType === 'U') && state.multiPointBuffer?.length) {
        const point = getEventPoint(e);
        if (point) previewStairPoints([...state.multiPointBuffer, point], state.activePreset.subType);
        return;
      }
      if (dragState.start && dragState.originals && dragState.draftTool) {
        if (!state || state.activeTool !== dragState.draftTool) {
          cancelPendingDrawing();
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        const point = getEventPoint(e);
        if (!point) return;
        const drafts = draftElementsFromPoints(dragState.draftTool, dragState.start, point);
        if (dragState.pointerDown && Math.hypot(point.x - dragState.start.x, point.y - dragState.start.y) > 0.01) {
          dragState.moved = true;
        }
        showPreviewElements(drafts);
        return;
      }
      if (!dragState.start || !dragState.originals || !dragState.selectedIds) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const point = getEventPoint(e);
      if (!point) return;
      const dx = point.x - dragState.start.x;
      const dy = point.y - dragState.start.y;
      if (Math.hypot(dx, dy) < 0.002) return;
      dragState.moved = true;
      const selected = new Set(dragState.selectedIds);
      onElementsChangeRef.current?.(dragState.originals.map(el => selected.has(el.id) ? translateElement(el, dx, dy) : el));
    };

    const onPointerUp3D = (e: PointerEvent) => {
      if (e.button === 1) {
        if (middlePanState.start) {
          e.preventDefault();
          e.stopImmediatePropagation();
          endMiddlePan(e);
          return;
        }
        setNavigationDragMode('none');
        controls.mouseButtons.MIDDLE = e.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
        return;
      }
      if (selectionGestureState.start && e.button === selectionGestureState.button) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const end = selectionGestureState.end || getScreenPoint(e);
        if (selectionGestureState.active) {
          selectByScreenMarquee(selectionGestureState.start, end, selectionGestureState.shiftKey, selectionGestureState.altKey);
        } else {
          const state = editorStateRef.current;
          const point = getEventPoint(e);
          if (state && point) {
            const placeable = ['door','window','wall-opening','column','furniture','fixture','counter','tree','streetlight','bench','car'].includes(state.activeTool);
            if (placeable) {
              placeElementAt(point);
            } else if (state.activeTool === 'select') {
              const hitId = pickElementId(e);
              if (hitId) {
                onSelectionChangeRef.current?.(selectionGestureState.shiftKey
                  ? Array.from(new Set([...selectedIdsRef.current, hitId]))
                  : [hitId]);
              } else if (!selectionGestureState.shiftKey) {
                onSelectionChangeRef.current?.([]);
              }
            }
          }
        }
        selectionGestureState.button = undefined;
        selectionGestureState.start = undefined;
        selectionGestureState.end = undefined;
        selectionGestureState.active = false;
        setSelectionMarquee(null);
        try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {}
        return;
      }
      if (dragState.start && dragState.originals && dragState.draftTool) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const point = getEventPoint(e) || dragState.start;
        const dist = Math.hypot(point.x - dragState.start.x, point.y - dragState.start.y);
        if (dist > 0.05) finishDrawingAt(point);
        else showPreviewElements([]);
        dragState.pointerDown = false;
        dragState.pointerId = undefined;
        controls.enabled = true;
        try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {}
        return;
      }
      if (!dragState.start || !dragState.originals || !dragState.selectedIds) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const point = getEventPoint(e) || dragState.start;
      const dx = point.x - dragState.start.x;
      const dy = point.y - dragState.start.y;
      const selected = new Set(dragState.selectedIds);
      if (dragState.moved) {
        onElementsCommitRef.current?.(dragState.originals.map(el => selected.has(el.id) ? translateElement(el, dx, dy) : el));
      }
      dragState.start = undefined;
      dragState.originals = undefined;
      dragState.selectedIds = undefined;
      dragState.moved = false;
      controls.enabled = true;
      try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {}
    };

    const onContextMenu3D = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onPointerLeave3D = () => {
      clearPlacementPreview();
    };

    const onWindowPointerUp3D = (e: PointerEvent) => {
      if (e.button !== 1) return;
      if (middlePanState.start) {
        endMiddlePan(e);
        return;
      }
      setNavigationDragMode('none');
      controls.mouseButtons.MIDDLE = e.shiftKey ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    };

    const onPointerCancel3D = (e: PointerEvent) => {
      selectionGestureState.button = undefined;
      selectionGestureState.start = undefined;
      selectionGestureState.end = undefined;
      selectionGestureState.active = false;
      setSelectionMarquee(null);
      clearPlacementPreview();
      cancelPendingDrawing();
      if (middlePanState.start) endMiddlePan(e);
      else {
        setNavigationDragMode('none');
        controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
      }
      try { renderer.domElement.releasePointerCapture(e.pointerId); } catch {}
      onPointerUp3D(e);
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown3D, true);
    renderer.domElement.addEventListener('pointermove', onPointerMove3D, true);
    renderer.domElement.addEventListener('pointerup', onPointerUp3D, true);
    renderer.domElement.addEventListener('pointercancel', onPointerCancel3D, true);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave3D);
    renderer.domElement.addEventListener('contextmenu', onContextMenu3D);
    window.addEventListener('pointerup', onWindowPointerUp3D);

    // ── Render loop ────────────────────────────────────────────────────────────
    let rafId: number;
    const loop = () => {
      rafId = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, cameraRef.current!);
    };
    loop();
    animFrameRef.current = rafId!;

    // ── Resize observer (container-aware) ─────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      const c = cameraRef.current;
      if (c instanceof THREE.PerspectiveCamera)    { c.aspect = w / h; c.updateProjectionMatrix(); }
      else if (c instanceof THREE.OrthographicCamera) {
        const half = (c.top - c.bottom) / 2;
        c.left = -half * (w / h); c.right = half * (w / h);
        c.updateProjectionMatrix();
      }
      renderer.setSize(w, h);
    });
    ro.observe(container);

    const disposeObject = (obj: THREE.Object3D) => {
      obj.traverse((c: any) => {
        if (c.geometry) c.geometry.dispose();
      });
    };

    // ════════════════════════════════════════════════════════════════════════════
    // REBUILD FUNCTION — stable, defined once, reads refs for fresh data
    // ════════════════════════════════════════════════════════════════════════════
    doRebuild.current = () => {
      const proj     = projectRef.current;    // always latest
      const parallel = isParallelRef.current; // always latest
      const group    = elemGroupRef.current;
      const thisCam  = cameraRef.current;
      const ctrls    = controlsRef.current;
      const rend     = rendererRef.current;
      if (!group || !thisCam || !ctrls || !rend) return;

      const newCache = new Map<string, { hash: string; obj: THREE.Object3D }>();
      const isMono   = isMonotoneRef.current;

      // ── Helpers ─────────────────────────────────────────────────────────────
      const getElev  = (lid?: string) => lid ? (proj.levels.find(l => l.id === lid)?.zElevation ?? 0) : 0;
      const getLvlH  = (lid?: string) => lid ? (proj.levels.find(l => l.id === lid)?.height ?? WALL_HEIGHT_DEFAULT) : WALL_HEIGHT_DEFAULT;

      // Polygon-offset mesh + edge outline
      const addMesh = (mesh: THREE.Mesh | THREE.Object3D, parent: THREE.Object3D, edgeColor = isMono ? 0x94a3b8 : 0x475569) => {
        if (!mesh) return;
        mesh.castShadow = true; mesh.receiveShadow = true;
        const applyOff = (mat?: THREE.Material) => {
          if (!mat) return;
          (mat as any).polygonOffset       = true;
          (mat as any).polygonOffsetFactor = 2;
          (mat as any).polygonOffsetUnits  = 2;
        };
        const m = (mesh as any).material;
        if (m) {
          if (Array.isArray(m)) m.forEach(applyOff); else applyOff(m);
        }
        mesh.renderOrder = 0;
        parent.add(mesh);
        try {
          if ((mesh as THREE.Mesh).geometry) {
            const edges = new THREE.EdgesGeometry((mesh as THREE.Mesh).geometry, 15);
            const line  = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: edgeColor, depthTest: true }));
            line.position.copy(mesh.position);
            line.rotation.copy(mesh.rotation);
            line.scale.copy(mesh.scale);
            line.renderOrder = 1;
            parent.add(line);
          }
        } catch { /* skip on degenerate geometry */ }
      };

      // Curve point sampler
      const getCurvePoint = analyticGetCurvePoint;

      const getWallLen = (wall: ArchElement): number => {
        return analyticCurveLength(wall, 64);
      };

      // Opening segments for a wall (doors/windows cut holes)
      const getOpeningSegs = (wall: ArchElement) => {
        const L = getWallLen(wall);
        const intervals = proj.elements
          .filter(e => ['door','window','wall-opening'].includes(e.type) && e.hostWallId === wall.id && typeof e.hostT === 'number')
          .map(op => { const dt = L > 0 ? (op.width || 0.8) / L : 0; return { tS: op.hostT! - dt/2, tE: op.hostT! + dt/2, op }; })
          .sort((a, b) => a.tS - b.tS);
        const segs: { tS: number, tE: number, isOpen: boolean, op?: ArchElement }[] = [];
        let cur = 0;
        intervals.forEach(iv => {
          if (iv.tS > cur + 0.0001) segs.push({ tS: cur, tE: iv.tS, isOpen: false });
          segs.push({ tS: Math.max(0, iv.tS), tE: Math.min(1, iv.tE), isOpen: true, op: iv.op });
          cur = Math.max(cur, iv.tE);
        });
        if (cur < 0.999) segs.push({ tS: cur, tE: 1, isOpen: false });
        return segs;
      };

      // ── Signed endpoint adjustment ──────────────────────────────────────────────────
      //   positive → shorten (move endpoint inward along wall)
      //   negative → extend  (move endpoint outward, past original position)
      //
      //  T-junction stem: always trims to stop exactly at the through-wall face.
      //  L-corner winner (smaller id): extends to fill the full corner block.
      //  L-corner loser  (larger id):  trims back so no overlap with winner.
      const endAdjust = (el: ArchElement, endPt: Point): number => {
        const thk     = el.thickness || WALL_THICKNESS_DEFAULT;
        const myAngle = Math.atan2(el.p2!.y - el.p1!.y, el.p2!.x - el.p1!.x);
        const SNAP    = 0.6;   // generous snap radius (matches app SNAP_THRESHOLD ~0.5m)
        const EPS     = 0.003; // 3 mm buffer to guarantee no shared-face z-fighting
        let   result  = 0;     // 0 = no adjustment

        for (const other of proj.elements) {
          if (other.id === el.id || other.type !== 'wall' || !other.p1 || !other.p2) continue;
          const otherThk = other.thickness || WALL_THICKNESS_DEFAULT;

          // Skip collinear walls
          const otAngle = Math.atan2(other.p2.y - other.p1.y, other.p2.x - other.p1.x);
          let diff = Math.abs(myAngle - otAngle) % Math.PI;
          if (diff > Math.PI / 2) diff = Math.PI - diff;
          if (diff < 0.15) continue;

          // L-corner: endPt near another wall's endpoint
          const nearP1 = Math.hypot(other.p1.x - endPt.x, other.p1.y - endPt.y) < SNAP;
          const nearP2 = Math.hypot(other.p2.x - endPt.x, other.p2.y - endPt.y) < SNAP;

          // T-junction: endPt projects onto other wall's body
          const odx = other.p2.x - other.p1.x, odz = other.p2.y - other.p1.y;
          const oLen = Math.hypot(odx, odz);
          let onBody = false;
          if (oLen > 0.001) {
            const t = ((endPt.x - other.p1.x) * odx + (endPt.y - other.p1.y) * odz) / (oLen * oLen);
            if (t > 0.02 && t < 0.98) {
              const projX = other.p1.x + t * odx, projZ = other.p1.y + t * odz;
              onBody = Math.hypot(endPt.x - projX, endPt.y - projZ) < otherThk * 1.5;
            }
          }

          if (onBody) {
            // T-junction stem: trim to stop at the through-wall's face
            const trim = otherThk / 2 + EPS;
            if (result >= 0) result = Math.max(result, trim);
          } else if (nearP1 || nearP2) {
            if (el.id < other.id) {
              // L-corner WINNER: extend past endpoint by loser's half-thickness
              // so the winner fills the entire corner block
              const ext = -(otherThk / 2 - EPS);  // negative = extend outward
              result = Math.min(result, ext);
            } else {
              // L-corner LOSER: trim back to winner's face
              const trim = otherThk / 2 + EPS;
              if (result >= 0) result = Math.max(result, trim);
            }
          }
        }
        return result;
      };

      // Helper to check if this wall is the "loser" or lower hierarchy when intersecting with a wall of different thickness/material
      // Lower thickness walls or alphabetically larger IDs will get a microscopic thickness reduction (e.g. 0.3mm)
      // to resolve visual material overlap/glitching (z-fighting) on exterior/interior joints.
      const getWallHierarchyNarrowing = (el: ArchElement): number => {
        let maxReduction = 0;
        const myThk = el.thickness || WALL_THICKNESS_DEFAULT;
        const SNAP = 0.6;

        for (const other of proj.elements) {
          if (other.id === el.id || other.type !== 'wall' || !other.p1 || !other.p2) continue;
          const otherThk = other.thickness || WALL_THICKNESS_DEFAULT;
          if (Math.abs(myThk - otherThk) < 0.001 && el.id < other.id) continue;

          // If there is any endpoint connection (L-corner or T-junction)
          const nearP1 = Math.hypot(other.p1.x - el.p1.x, other.p1.y - el.p1.y) < SNAP || Math.hypot(other.p1.x - el.p2.x, other.p1.y - el.p2.y) < SNAP;
          const nearP2 = Math.hypot(other.p2.x - el.p1.x, other.p2.y - el.p1.y) < SNAP || Math.hypot(other.p2.x - el.p2.x, other.p2.y - el.p2.y) < SNAP;
          
          if (nearP1 || nearP2) {
            // Different thickness or materials joining: reduce the thickness of the "loser" (smaller thickness, or larger ID if equal)
            if (myThk < otherThk || (Math.abs(myThk - otherThk) < 0.001 && el.id > other.id)) {
              maxReduction = 0.0015; // 1.5mm narrowing to prevent material overlaps
            }
          }
        }
        return maxReduction;
      };

      const s3d = { ...DEFAULT_PROJECT_SETTINGS_3D, ...(proj.settings3D || {}) };

      if (!materialsRef.current) {
        materialsRef.current = {
          wall:  new THREE.MeshStandardMaterial({ roughness: 0.9 }),
          conc:  new THREE.MeshStandardMaterial({ roughness: 0.9 }),
          brick: new THREE.MeshStandardMaterial({ roughness: 1.0 }),
          glass: new THREE.MeshStandardMaterial({ transparent: true, side: THREE.DoubleSide, roughness: 0.05 }),
          door:  new THREE.MeshStandardMaterial({ roughness: 0.8 }),
          wFrame:new THREE.MeshStandardMaterial({ roughness: 0.5 }),
          slab:  new THREE.MeshStandardMaterial({ roughness: 0.8 }),
          steel: new THREE.MeshStandardMaterial({ roughness: 0.2 }),
          wood:  new THREE.MeshStandardMaterial({ roughness: 0.8 }),
          plant: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
          annotation: new THREE.MeshStandardMaterial({ roughness: 0.9 }),
          road: new THREE.MeshStandardMaterial({ roughness: 0.95 }),
        };
      }
      const M = materialsRef.current;

      // Update material properties dynamically based on monotone mode
      if (isMono) {
        M.wall.color.setHex(0xffffff);
        M.conc.color.setHex(0xf1f5f9);
        M.brick.color.setHex(0xfafafa);
        M.glass.color.setHex(0xffffff);
        M.glass.opacity = 0.15;
        M.glass.metalness = 0.1;
        M.door.color.setHex(0xffffff);
        M.wFrame.color.setHex(0xf1f5f9);
        M.slab.color.setHex(0xf8fafc);
        M.steel.color.setHex(0xf1f5f9);
        M.steel.metalness = 0.1;
        M.wood.color.setHex(0xffffff);
        M.plant.color.setHex(0xf8fafc);
        M.annotation.color.setHex(0xcbd5e1);
        M.road.color.setHex(0xe2e8f0);
      } else {
        M.wall.color.setHex(0xf1f5f9);
        M.conc.color.setHex(0x94a3b8);
        M.brick.color.setHex(0x8c4b31);
        M.glass.color.setHex(0xbae6fd);
        M.glass.opacity = 0.35;
        M.glass.metalness = 0.8;
        M.door.color.setHex(0x78350f);
        M.wFrame.color.setHex(0x334155);
        M.slab.color.setHex(0xe2e8f0);
        M.steel.color.setHex(0x475569);
        M.steel.metalness = 0.8;
        M.wood.color.setHex(0xb45309);
        M.plant.color.setHex(0x16a34a);
        M.annotation.color.setHex(0x64748b);
        M.road.color.setHex(0x334155);
      }

      const makePlanShape = (points: Point[]) => new THREE.Shape(points.map(p => new THREE.Vector2(p.x, -p.y)));

      const makeFlatStrip = (p1: Point, p2: Point, width: number, mat: THREE.Material, y: number) => {
        const dx = p2.x - p1.x;
        const dz = p2.y - p1.y;
        const len = Math.hypot(dx, dz);
        if (len < 0.001) return null;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(len, Math.max(0.01, width * 0.25), width), mat);
        mesh.position.set((p1.x + p2.x) / 2, y, (p1.y + p2.y) / 2);
        mesh.rotation.y = -Math.atan2(dz, dx);
        return mesh;
      };

      const makeTextSprite = (text: string, y: number) => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 160;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillRect(8, 42, 496, 76);
        ctx.strokeStyle = isMono ? '#cbd5e1' : '#64748b';
        ctx.strokeRect(8, 42, 496, 76);
        ctx.fillStyle = isMono ? '#475569' : '#0f172a';
        ctx.font = '700 42px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text.slice(0, 28), 256, 82);
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: true });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(Math.max(1.6, text.length * 0.15), 0.48, 1);
        sprite.position.y = y;
        return sprite;
      };

      const openingPlacement = (op: ArchElement): { pos: Point, rotation: number, host?: ArchElement } | null => {
        if (op.pos) return { pos: op.pos, rotation: op.rotation || 0 };
        if (op.p1 && op.p2) {
          return {
            pos: { x: (op.p1.x + op.p2.x) / 2, y: (op.p1.y + op.p2.y) / 2 },
            rotation: Math.atan2(op.p2.y - op.p1.y, op.p2.x - op.p1.x) * 180 / Math.PI
          };
        }
        if (op.hostWallId && typeof op.hostT === 'number') {
          const host = proj.elements.find(w => w.id === op.hostWallId && w.type === 'wall' && w.p1 && w.p2);
          if (host) {
            const pos = getCurvePoint(host, op.hostT);
            if (!pos) return null;
            const pA = getCurvePoint(host, Math.max(0, op.hostT - 0.01)) || host.p1!;
            const pB = getCurvePoint(host, Math.min(1, op.hostT + 0.01)) || host.p2!;
            return { pos, rotation: Math.atan2(pB.y - pA.y, pB.x - pA.x) * 180 / Math.PI, host };
          }
        }
        return null;
      };

      const SKIP = new Set(['elevation-marker','room','procedural-boundary','zone','parcel','urban-block']);

      // ── Build elements ────────────────────────────────────────────────────────
      proj.elements.forEach(el => {
        if (LEGACY_3D_PREVIEW_IDS.has(el.id)) return;
        if (SKIP.has(el.type)) return;
        
        // Skip invisible layers
        if (el.layer && proj.layers) {
          const layer = proj.layers.find(l => l.name === el.layer);
          if (layer && !layer.visible) return;
        }

        const lZ = getElev(el.levelId);
        const lH = getLvlH(el.levelId);

        const level = proj.levels.find(l => l.id === el.levelId);
        const zElev = level?.zElevation ?? 0;
        const zHeight = level?.height ?? WALL_HEIGHT_DEFAULT;
        const hash = JSON.stringify({
          id: el.id,
          type: el.type,
          subType: el.subType,
          p1: el.p1,
          p2: el.p2,
          p3: el.p3,
          p4: el.p4,
          pos: el.pos,
          controlPoint: el.controlPoint,
          boundary: el.boundary,
          width: el.width,
          depth: el.depth,
          height: el.height,
          shape: el.shape,
          thickness: el.thickness,
          rotation: el.rotation,
          seatsCount: el.seatsCount,
          bedPillows: el.bedPillows,
          isFlipped: el.isFlipped,
          facingFlipped: el.facingFlipped,
          zElev,
          zHeight,
          slabThickness: s3d.slabThickness,
          windowSillHeight: s3d.windowSillHeight,
          windowTopHeight: s3d.windowTopHeight,
          doorHeight: s3d.doorHeight,
          wallOpeningHeight: s3d.wallOpeningHeight,
          modelUrl: el.modelUrl || el.model3D?.url || el.gltfUrl,
          customMeshData: el.customMeshData ? true : false,
          selected: selectedIdsRef.current.includes(el.id),
          isMono
        });

        const cached = meshCache.current.get(el.id);
        if (cached && cached.hash === hash) {
          if (!group.children.includes(cached.obj)) {
            group.add(cached.obj);
          }
          newCache.set(el.id, cached);
          return;
        }

        if (cached) {
          group.remove(cached.obj);
          disposeObject(cached.obj);
        }

        const elGroup = new THREE.Group();
        elGroup.name = el.id;

        const runBuild = () => {
          // CAD UNDERLAY / GROUP CHILDREN
          if ((el.type === 'cad-underlay' || el.type === 'group') && el.cadElements?.length) {
            el.cadElements.forEach((child) => {
              const childZ = lZ + 0.025;
              if (child.p1 && child.p2) {
                const strip = makeFlatStrip(child.p1, child.p2, child.type === 'gridline' ? 0.015 : 0.03, M.annotation, childZ);
                if (strip) addMesh(strip, elGroup, 0x94a3b8);
              } else if (child.boundary && child.boundary.length >= 3) {
                const mesh = new THREE.Mesh(new THREE.ShapeGeometry(makePlanShape(child.boundary)), M.annotation);
                mesh.rotation.x = -Math.PI / 2;
                mesh.position.y = childZ;
                addMesh(mesh, elGroup, 0x94a3b8);
              }
            });
            return;
          }

          // FLAT CANVAS PRIMITIVES / ANNOTATIONS
          if (['line','gridline','dimension'].includes(el.type) && el.p1 && el.p2) {
            const strip = makeFlatStrip(el.p1, el.p2, el.type === 'gridline' ? 0.012 : 0.025, M.annotation, lZ + 0.035);
            if (strip) addMesh(strip, elGroup, 0x64748b);
            if (el.type === 'dimension' && el.label) {
              const sprite = makeTextSprite(el.label, lZ + 0.5);
              if (sprite) {
                sprite.position.x = (el.p1.x + el.p2.x) / 2;
                sprite.position.z = (el.p1.y + el.p2.y) / 2;
                elGroup.add(sprite);
              }
            }
            return;
          }

          if ((el.type === 'label' || el.type === 'room') && el.pos && el.label) {
            const sprite = makeTextSprite(el.label, lZ + 0.65);
            if (sprite) {
              sprite.position.x = el.pos.x;
              sprite.position.z = el.pos.y;
              elGroup.add(sprite);
            }
            return;
          }

          if ((el.type === 'rectangle' || el.type === 'arc' || el.type === 'circle' || el.type === 'ellipse') && (el.boundary || (el.p1 && el.p2))) {
            if (el.boundary && el.boundary.length >= 3) {
              const mesh = new THREE.Mesh(new THREE.ShapeGeometry(makePlanShape(el.boundary)), M.annotation);
              mesh.rotation.x = -Math.PI / 2;
              mesh.position.y = lZ + 0.03;
              addMesh(mesh, elGroup, 0x94a3b8);
            } else if (el.p1 && el.p2) {
              const points: Point[] = [];
              const count = (el.type === 'rectangle') ? 4 : 32;
              if (el.type === 'rectangle') {
                points.push(el.p1, { x: el.p2.x, y: el.p1.y }, el.p2, { x: el.p1.x, y: el.p2.y });
              } else {
                for (let i = 0; i <= count; i++) {
                  const pt = getCurvePoint(el, i / count);
                  if (pt) points.push(pt);
                }
              }
              points.forEach((pt, idx) => {
                const next = points[(idx + 1) % points.length];
                if (!next || (el.type === 'arc' && idx === points.length - 1)) return;
                const strip = makeFlatStrip(pt, next, 0.025, M.annotation, lZ + 0.035);
                if (strip) addMesh(strip, elGroup, 0x94a3b8);
              });
            }
            return;
          }

          // FLOOR / CEILING
          if ((el.type === 'floor' || el.type === 'ceiling') && el.boundary && el.boundary.length >= 3) {
            // ExtrudeGeometry shape Y axis maps to world -Z after rotation.x=-PI/2.
            // Negate Y so world_z = +p.y (matching all other elements that use position.set).
            const shape = makePlanShape(el.boundary);
            const mesh  = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: s3d.slabThickness, bevelEnabled: false }), M.slab);
            mesh.rotation.x = -Math.PI / 2;
            mesh.position.y  = (el.type === 'floor' ? lZ : lZ + lH) - s3d.slabThickness;
            addMesh(mesh, elGroup);
            return;
          }

          // WALL
          if (el.type === 'wall' && el.p1 && el.p2) {
            const thk      = el.thickness || WALL_THICKNESS_DEFAULT;
            let   mat      = M.wall;
            if      (thk < 0.05)  mat = M.glass;
            else if (thk > 0.25)  mat = M.conc;
            else if (thk >= 0.22) mat = M.brick;
            const wallH   = el.height || lH;
            const curved  = el.isCurved || ['arc','circle','ellipse'].includes(el.wallSource || '');

            if (curved) {
              const narrowing = getWallHierarchyNarrowing(el);
              const finalThk = thk - 2 * narrowing;
              // Curved walls: tessellate into short box segments
              getOpeningSegs(el).forEach(seg => {
                const spans: {yMin:number, yMax:number}[] = [];
                if (seg.isOpen && seg.op) {
                  const op = seg.op;
                  if (op.type === 'window') {
                    const sill = op.sillHeight ?? s3d.windowSillHeight;
                    const wh = op.height ?? (s3d.windowTopHeight - s3d.windowSillHeight);
                    if (sill > 0.01) spans.push({ yMin:0, yMax:sill });
                    if (sill+wh < wallH-0.01) spans.push({ yMin:sill+wh, yMax:wallH });
                  } else if (op.type === 'door') {
                    const dh = op.height ?? s3d.doorHeight;
                    if (dh < wallH-0.01) spans.push({ yMin:dh, yMax:wallH });
                  } else { spans.push({ yMin: op.height ?? s3d.wallOpeningHeight, yMax:wallH }); }
                } else { spans.push({ yMin:0, yMax:wallH }); }
                spans.forEach(span => {
                  const h = span.yMax - span.yMin;
                  const yPos = lZ + span.yMin + h / 2;
                  for (let i = 0; i < 16; i++) {
                    const pt1 = getCurvePoint(el, seg.tS + (i/16)*(seg.tE-seg.tS));
                    const pt2 = getCurvePoint(el, seg.tS + ((i+1)/16)*(seg.tE-seg.tS));
                    if (!pt1 || !pt2) continue;
                    const dx = pt2.x-pt1.x, dz = pt2.y-pt1.y, len = Math.hypot(dx,dz);
                    if (len < 0.001) continue;
                    const m = new THREE.Mesh(new THREE.BoxGeometry(len, h, finalThk), mat);
                    m.position.set((pt1.x+pt2.x)/2, yPos, (pt1.y+pt2.y)/2);
                    m.rotation.y = -Math.atan2(dz, dx);
                    addMesh(m, elGroup);
                  }
                });
              });

            } else {
              // Straight walls: use ExtrudeGeometry from the EXACT 2D footprint polygon.
              // Adjacent walls' footprints fit together without overlap → zero z-fighting.
              const wallDx = el.p2.x - el.p1.x, wallDz = el.p2.y - el.p1.y;
              const wallLen = Math.hypot(wallDx, wallDz);
              if (wallLen < 0.001) return;
              const ux = wallDx/wallLen, uz = wallDz/wallLen; // unit direction
              const nx = -uz, nz = ux;                        // unit normal
              
              const narrowing = getWallHierarchyNarrowing(el);
              const hw = (thk / 2) - narrowing;

              // Pre-compute signed adjustments at each wall endpoint
              const adjP1 = endAdjust(el, el.p1);
              const adjP2 = endAdjust(el, el.p2);

              getOpeningSegs(el).forEach(seg => {
                const rawPt1 = getCurvePoint(el, seg.tS)!;
                const rawPt2 = getCurvePoint(el, seg.tE)!;
                if (!rawPt1 || !rawPt2) return;

                // Apply adjustment only at real wall endpoints (not at opening sub-segment edges)
                const adj1 = seg.tS < 0.001 ? adjP1 : 0;
                const adj2 = seg.tE > 0.999 ? adjP2 : 0;

                // adj > 0: move inward (shorten). adj < 0: move outward (extend past endpoint).
                const pt1 = { x: rawPt1.x + ux * adj1, y: rawPt1.y + uz * adj1 };
                const pt2 = { x: rawPt2.x - ux * adj2, y: rawPt2.y - uz * adj2 };
                if (Math.hypot(pt2.x-pt1.x, pt2.y-pt1.y) < 0.001) return;

                // 2D footprint polygon (world X-Z plane before rotation)
                // After rotation.x=-PI/2 the shape Y axis maps to world -Z, so negate Y
                // to ensure world_z = +pt.y (same convention as position.set elements).
                const corners = [
                  new THREE.Vector2(pt1.x + nx*hw, -(pt1.y + nz*hw)),  // start-left
                  new THREE.Vector2(pt2.x + nx*hw, -(pt2.y + nz*hw)),  // end-left
                  new THREE.Vector2(pt2.x - nx*hw, -(pt2.y - nz*hw)),  // end-right
                  new THREE.Vector2(pt1.x - nx*hw, -(pt1.y - nz*hw)),  // start-right
                ];
                const footprint = new THREE.Shape(corners);

                // Height spans (full wall or partial above/below opening)
                const spans: {yMin:number, yMax:number}[] = [];
                if (seg.isOpen && seg.op) {
                  const op = seg.op;
                  if (op.type === 'window') {
                    const sill = op.sillHeight ?? s3d.windowSillHeight;
                    const wh = op.height ?? (s3d.windowTopHeight - s3d.windowSillHeight);
                    if (sill > 0.01) spans.push({ yMin:0, yMax:sill });
                    if (sill+wh < wallH-0.01) spans.push({ yMin:sill+wh, yMax:wallH });
                  } else if (op.type === 'door') {
                    const dh = op.height ?? s3d.doorHeight;
                    if (dh < wallH-0.01) spans.push({ yMin:dh, yMax:wallH });
                  } else { spans.push({ yMin: op.height ?? s3d.wallOpeningHeight, yMax:wallH }); }
                } else { spans.push({ yMin:0, yMax:wallH }); }

                spans.forEach(span => {
                  const h = span.yMax - span.yMin;
                  if (h < 0.001) return;
                  // ExtrudeGeometry depth = height; rotation.x=-PI/2 makes extrusion go upward
                  const geo  = new THREE.ExtrudeGeometry(footprint, { depth: h, bevelEnabled: false });
                  const mesh = new THREE.Mesh(geo, mat);
                  mesh.rotation.x = -Math.PI / 2;
                  mesh.position.y  = lZ + span.yMin;
                  addMesh(mesh, elGroup);
                });
              });
            }
            return;
          }

          // COLUMN / FURNITURE / FIXTURE / COUNTER / ASSET (Parametric & Detailed 3D Models)
          if (['column','furniture','fixture','counter','asset'].includes(el.type)) {
            let cx = 0, cz = 0, w = 1, d = 1, rot = 0;
            if (el.pos) { cx=el.pos.x; cz=el.pos.y; w=el.width||1; d=el.depth||1; rot=-(el.rotation||0)*Math.PI/180; }
            else if (el.p1 && el.p2) { cx=(el.p1.x+el.p2.x)/2; cz=(el.p1.y+el.p2.y)/2; w=Math.abs(el.p2.x-el.p1.x)||0.5; d=Math.abs(el.p2.y-el.p1.y)||0.5; }
            const h = el.height || (el.type === 'column' ? lH : el.type === 'counter' ? 0.9 : 0.5);
            const eleZ = lZ + (el.elevation || 0);

            // Container group for composite parts
            const compGroup = new THREE.Group();
            compGroup.position.set(cx, eleZ, cz);
            compGroup.rotation.y = rot;

            // Render Custom Loaded 3D Model (GLTF / GLB)
            const modelUrl = el.modelUrl || el.model3D?.url || el.gltfUrl;
            if (modelUrl) {
              if (!gltfLoaderRef.current) {
                gltfLoaderRef.current = new GLTFLoader();
              }
              const cachedGltf = gltfCache.current.get(modelUrl);
              if (cachedGltf) {
                const modelClone = cachedGltf.clone(true);
                const bbox = new THREE.Box3().setFromObject(modelClone);
                const bsize = bbox.getSize(new THREE.Vector3());
                const targetW = Math.max(0.05, w);
                const targetH = Math.max(0.05, h);
                const targetD = Math.max(0.05, d);
                const scaleX = targetW / (bsize.x || 1);
                const scaleY = targetH / (bsize.y || 1);
                const scaleZ = targetD / (bsize.z || 1);
                modelClone.scale.set(scaleX, scaleY, scaleZ);

                const center = bbox.getCenter(new THREE.Vector3());
                modelClone.position.set(-center.x * scaleX, targetH / 2 - center.y * scaleY, -center.z * scaleZ);

                modelClone.traverse((child: any) => {
                  if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    child.userData = { elementId: el.id };
                  }
                });

                compGroup.add(modelClone);
                elGroup.add(compGroup);
                return;
              } else {
                // Placeholder preview while loading
                const placeholderMat = new THREE.MeshStandardMaterial({
                  color: isMono ? 0x94a3b8 : 0x3b82f6,
                  roughness: 0.6,
                  metalness: 0.1,
                  transparent: true,
                  opacity: 0.65,
                  wireframe: true,
                });
                const placeholder = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), placeholderMat);
                placeholder.position.y = h / 2;
                addMesh(placeholder, compGroup);
                elGroup.add(compGroup);

                // Load GLTF/GLB (supports Data URIs and Network URLs)
                if (modelUrl.startsWith('data:')) {
                  try {
                    const base64Index = modelUrl.indexOf(';base64,');
                    const b64 = base64Index !== -1 ? modelUrl.slice(base64Index + 8) : (modelUrl.split(',')[1] || modelUrl);
                    const binaryString = atob(b64);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) {
                      bytes[i] = binaryString.charCodeAt(i);
                    }
                    gltfLoaderRef.current.parse(
                      bytes.buffer,
                      '',
                      (gltf) => {
                        gltfCache.current.set(modelUrl, gltf.scene);
                        doRebuild.current();
                      },
                      (err) => {
                        console.warn(`[Viewer3D] Failed to parse 3D data URI model:`, err);
                      }
                    );
                  } catch (parseErr) {
                    console.warn(`[Viewer3D] Error decoding 3D data URI:`, parseErr);
                  }
                  return;
                }

                // Asynchronously load GLTF/GLB from URL
                gltfLoaderRef.current.load(
                  modelUrl,
                  (gltf) => {
                    gltfCache.current.set(modelUrl, gltf.scene);
                    doRebuild.current();
                  },
                  undefined,
                  (err) => {
                    console.warn(`[Viewer3D] Failed to load 3D model from ${modelUrl}:`, err);
                  }
                );
                return;
              }
            }

            // Render Custom Loaded OBJ Geometry
            if (el.customMeshData) {
              const geom = new THREE.BufferGeometry();
              const vertices = new Float32Array(el.customMeshData.vertices);
              geom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
              geom.setIndex(el.customMeshData.faces);
              geom.computeVertexNormals();

              // Normalize OBJ mesh size to match bounds
              const bboxMesh = new THREE.Mesh(geom, M.steel);
              const bbox = new THREE.Box3().setFromObject(bboxMesh);
              const bsize = bbox.getSize(new THREE.Vector3());
              bboxMesh.scale.set(w / (bsize.x || 1), h / (bsize.y || 1), d / (bsize.z || 1));
              
              const objCenter = bbox.getCenter(new THREE.Vector3());
              bboxMesh.position.set(-objCenter.x * bboxMesh.scale.x, h / 2, -objCenter.z * bboxMesh.scale.z);
              addMesh(bboxMesh, compGroup);
              elGroup.add(compGroup);
              return;
            }

            const sub = (el.subType || '').toLowerCase();
            const addBoxPart = (bw: number, bh: number, bd: number, x: number, y: number, z: number, mat: THREE.Material = M.wall) => {
              const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.01, bw), Math.max(0.01, bh), Math.max(0.01, bd)), mat);
              mesh.position.set(x, y, z);
              addMesh(mesh, compGroup);
              return mesh;
            };
            const addCylPart = (radius: number, ch: number, x: number, y: number, z: number, mat: THREE.Material = M.slab, segments = 24) => {
              const mesh = new THREE.Mesh(new THREE.CylinderGeometry(Math.max(0.01, radius), Math.max(0.01, radius), Math.max(0.01, ch), segments), mat);
              mesh.position.set(x, y, z);
              addMesh(mesh, compGroup);
              return mesh;
            };

            const isImportedRevitAsset = el.isImportedAsset || el.sourceType === 'revit_import' || el.bimMetadata?.sourceType === 'revit_import';
            if (isImportedRevitAsset) {
              const sourceMat = el.materials?.[0] || el.bimMetadata?.materials?.[0];
              const color = sourceMat?.color || '#5b5f58';
              const importedMat = new THREE.MeshStandardMaterial({
                color,
                roughness: 0.72,
                metalness: 0.08,
              });
              const bodyH = Math.max(0.05, h * 0.82);
              const body = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, d), importedMat);
              body.position.y = bodyH / 2;
              addMesh(body, compGroup);

              const edgeMat = new THREE.MeshStandardMaterial({ color: '#1f2933', roughness: 0.8, metalness: 0.12 });
              addBoxPart(Math.max(0.02, w * 0.04), h, Math.max(0.02, d * 0.04), -w / 2 + w * 0.08, h / 2, -d / 2 + d * 0.08, edgeMat);
              addBoxPart(Math.max(0.02, w * 0.04), h, Math.max(0.02, d * 0.04), w / 2 - w * 0.08, h / 2, -d / 2 + d * 0.08, edgeMat);
              addBoxPart(Math.max(0.02, w * 0.04), h, Math.max(0.02, d * 0.04), -w / 2 + w * 0.08, h / 2, d / 2 - d * 0.08, edgeMat);
              addBoxPart(Math.max(0.02, w * 0.04), h, Math.max(0.02, d * 0.04), w / 2 - w * 0.08, h / 2, d / 2 - d * 0.08, edgeMat);
              elGroup.add(compGroup);
              return;
            }

            if (el.type === 'column') {
              const colM = new THREE.Mesh(el.shape === 'circle' ? new THREE.CylinderGeometry(w/2, w/2, h, 32) : new THREE.BoxGeometry(w, h, d), M.conc);
              colM.position.y = h / 2;
              addMesh(colM, compGroup);
            } else if (sub.includes('sofa_l_sectional_extendable')) {
              const baseH = 0.15;
              const seatModule = 0.75;
              const legDepth = Math.min(0.85, Math.max(0.45, w - 0.35), Math.max(0.45, d - 0.35));
              const backThk = 0.15;
              const backH = Math.max(0.25, h - baseH);
              const armW = 0.15;
              const seatH = 0.18;
              const cornerX = w / 2 - legDepth;

              addBoxPart(w, baseH, legDepth, 0, baseH / 2, -d / 2 + legDepth / 2, M.wood);
              addBoxPart(legDepth, baseH, d, w / 2 - legDepth / 2, baseH / 2, 0, M.wood);
              addBoxPart(w, backH, backThk, 0, baseH + backH / 2, -d / 2 + backThk / 2, M.wall);
              addBoxPart(backThk, backH, d, w / 2 - backThk / 2, baseH + backH / 2, 0, M.wall);
              addBoxPart(armW, h * 0.7, legDepth, -w / 2 + armW / 2, h * 0.35, -d / 2 + legDepth / 2, M.wall);
              addBoxPart(legDepth, h * 0.45, armW, w / 2 - legDepth / 2, h * 0.225, d / 2 - armW / 2, M.wall);

              const rowSeats = Math.max(2, Math.min(8, Math.round(w / seatModule)));
              const rowSeatW = (w - armW - backThk) / rowSeats;
              for (let i = 0; i < rowSeats; i++) {
                addBoxPart(
                  Math.max(0.05, rowSeatW - 0.02),
                  seatH,
                  Math.max(0.05, legDepth - backThk - 0.02),
                  -w / 2 + armW + rowSeatW * (i + 0.5),
                  baseH + seatH / 2,
                  -d / 2 + backThk + (legDepth - backThk) / 2,
                  M.wall
                );
              }

              const verticalExtensionSeats = Math.max(1, Math.min(6, Math.round(Math.max(seatModule, d - legDepth) / seatModule)));
              const chaiseSeatD = Math.max(0.05, (d - legDepth) / verticalExtensionSeats);
              for (let i = 0; i < verticalExtensionSeats; i++) {
                addBoxPart(
                  Math.max(0.05, legDepth - backThk - 0.02),
                  seatH,
                  Math.max(0.05, chaiseSeatD - 0.02),
                  cornerX + (legDepth - backThk) / 2,
                  baseH + seatH / 2,
                  -d / 2 + legDepth + chaiseSeatD * (i + 0.5),
                  M.wall
                );
              }
            } else if (sub.includes('sofa')) {
              // ── 3D Detailed Parametric Sofa Model ──
              // 1. Base frame
              const baseH = 0.15;
              const base = new THREE.Mesh(new THREE.BoxGeometry(w, baseH, d), M.wood);
              base.position.y = baseH / 2;
              addMesh(base, compGroup);

              // 2. Back rest
              const backThk = 0.15;
              const backH = h - baseH;
              const back = new THREE.Mesh(new THREE.BoxGeometry(w, backH, backThk), M.wall);
              back.position.set(0, baseH + backH / 2, -d/2 + backThk/2);
              addMesh(back, compGroup);

              // 3. Side armrests
              const armW = 0.15;
              const armH = h * 0.7;
              const armL = new THREE.Mesh(new THREE.BoxGeometry(armW, armH, d - backThk), M.wall);
              armL.position.set(-w/2 + armW/2, armH/2, backThk/2);
              addMesh(armL, compGroup);

              const armR = new THREE.Mesh(new THREE.BoxGeometry(armW, armH, d - backThk), M.wall);
              armR.position.set(w/2 - armW/2, armH/2, backThk/2);
              addMesh(armR, compGroup);

              // 4. Seats - Dynamic cushions based on seatsCount or width
              const seats = inferInteriorSeatCount(el);
              const seatW = (w - armW * 2) / seats;
              const seatD = d - backThk;
              const seatH = 0.18;
              for (let i = 0; i < seats; i++) {
                const cushion = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.02, seatH, seatD - 0.02), M.wall);
                cushion.position.set(-w/2 + armW + seatW * (i + 0.5), baseH + seatH/2, backThk/2);
                addMesh(cushion, compGroup);
              }
            } else if (sub.includes('bed_bunk') || sub.includes('bed_loft')) {
              const frameH = 0.2;
              const matH = 0.18;
              const drawTier = (yBase: number) => {
                addBoxPart(w, frameH, d, 0, yBase + frameH / 2, 0, M.wood);
                addBoxPart(Math.max(0.05, w - 0.06), matH, Math.max(0.05, d - 0.06), 0, yBase + frameH + matH / 2, 0, M.slab);
                addBoxPart(w, 0.55, 0.1, 0, yBase + 0.275, -d / 2 + 0.05, M.wood);
              };
              if (sub.includes('loft')) {
                drawTier(1.05);
                addBoxPart(w * 0.4, 0.72, d * 0.28, -w * 0.2, 0.36, d * 0.2, M.wood);
              } else {
                drawTier(0);
                drawTier(1.05);
              }
              addBoxPart(0.06, 1.65, 0.06, -w / 2 + 0.08, 0.82, -d / 2 + 0.08, M.steel);
              addBoxPart(0.06, 1.65, 0.06, w / 2 - 0.08, 0.82, -d / 2 + 0.08, M.steel);
              for (let i = 0; i < 5; i++) addBoxPart(0.5, 0.035, 0.035, w / 2 + 0.02, 0.25 + i * 0.26, d * 0.28, M.steel);
            } else if (sub.includes('bed_twin_pair')) {
              const gap = 0.15;
              const bedW = (w - gap) / 2;
              [-1, 1].forEach((side) => {
                const x = side * (bedW / 2 + gap / 2);
                addBoxPart(bedW, 0.25, d, x, 0.125, 0, M.wood);
                addBoxPart(Math.max(0.05, bedW - 0.06), 0.22, d - 0.06, x, 0.36, 0, M.slab);
                addBoxPart(bedW, 0.55, 0.12, x, 0.275, -d / 2 + 0.06, M.wood);
              });
            } else if (sub.includes('bed')) {
              // ── 3D Detailed Bed Model ──
              // 1. Bed Frame
              const frameH = 0.25;
              const frame = new THREE.Mesh(new THREE.BoxGeometry(w, frameH, d), M.wood);
              frame.position.y = frameH / 2;
              addMesh(frame, compGroup);

              // 2. Mattress
              const matH = 0.22;
              const mattress = new THREE.Mesh(new THREE.BoxGeometry(w - 0.06, matH, d - 0.06), M.slab);
              mattress.position.set(0, frameH + matH/2, 0);
              addMesh(mattress, compGroup);

              // 3. Headboard
              const hbH = h;
              const hbThk = 0.12;
              const headboard = new THREE.Mesh(new THREE.BoxGeometry(w, hbH, hbThk), M.wood);
              headboard.position.set(0, hbH/2, -d/2 + hbThk/2);
              addMesh(headboard, compGroup);

              // 4. Pillows (1 for single bed, 2 for wider beds)
              const numPillows = w >= 1.2 ? 2 : 1;
              const pilW = (w - 0.2) / numPillows;
              const pilD = 0.4;
              const pilH = 0.08;
              for (let i = 0; i < numPillows; i++) {
                const pillow = new THREE.Mesh(new THREE.BoxGeometry(pilW * 0.85, pilH, pilD), M.wall);
                pillow.position.set(-w/2 + 0.1 + pilW * (i + 0.5), frameH + matH + pilH/2, -d/2 + hbThk + pilD/2 + 0.05);
                addMesh(pillow, compGroup);
              }
            } else if (el.type === 'counter') {
              // ── 3D Detailed Counter Panel & Top ──
              const topH = 0.04;
              const bodyH = h - topH;
              const drawCounterRun = (bw: number, bd: number, x: number, z: number) => {
                addBoxPart(Math.max(0.05, bw - 0.02), bodyH, Math.max(0.05, bd - 0.02), x, bodyH / 2, z, M.wood);
                addBoxPart(bw, topH, bd, x, bodyH + topH / 2, z, M.slab);
              };
              if (el.shape === 'L' || sub.includes('_l_') || sub.includes('counter_l')) {
                const run = Math.min(0.65, Math.min(w, d));
                drawCounterRun(w, run, 0, -d / 2 + run / 2);
                drawCounterRun(run, d, -w / 2 + run / 2, 0);
              } else if (el.shape === 'U' || sub.includes('_u_')) {
                const run = Math.min(0.65, Math.min(w, d));
                drawCounterRun(w, run, 0, -d / 2 + run / 2);
                drawCounterRun(run, d, -w / 2 + run / 2, 0);
                drawCounterRun(run, d, w / 2 - run / 2, 0);
              } else if (sub.includes('wall_cabinet')) {
                addBoxPart(w, h, d, 0, 1.35 + h / 2, 0, M.wood);
              } else if (sub.includes('tall_pantry')) {
                addBoxPart(w, h, d, 0, h / 2, 0, M.wood);
              } else if (sub.includes('display')) {
                addBoxPart(w, bodyH * 0.65, d, 0, bodyH * 0.325, 0, M.wood);
                addBoxPart(w, bodyH * 0.45, d, 0, bodyH * 0.875, 0, M.glass);
              } else {
                drawCounterRun(w, d, 0, 0);
              }
            } else if (sub.includes('wc')) {
              // ── 3D Detailed Sanitary WC Toilet ──
              // Base bowl
              const bowl = new THREE.Mesh(new THREE.CylinderGeometry(w/2, w/3, 0.4, 16), M.slab);
              bowl.position.set(0, 0.2, 0.1);
              bowl.scale.set(1, 1, 1.3);
              addMesh(bowl, compGroup);
              // Flush Tank
              const tank = new THREE.Mesh(new THREE.BoxGeometry(w, 0.45, 0.22), M.slab);
              tank.position.set(0, 0.4 + 0.225, -d/2 + 0.11);
              addMesh(tank, compGroup);
            } else if (sub.includes('basin')) {
              // ── 3D Detailed Wash Basin ──
              // Stand cabinet vanity
              const vanity = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.85, d), M.wood);
              vanity.position.y = (h * 0.85) / 2;
              addMesh(vanity, compGroup);
              // Sink bowl rim
              const bowl = new THREE.Mesh(new THREE.BoxGeometry(w - 0.08, h * 0.15, d - 0.08), M.slab);
              bowl.position.set(0, h * 0.85 + (h * 0.15)/2, 0);
              addMesh(bowl, compGroup);
            } else if (sub.includes('bidet')) {
              addBoxPart(w * 0.9, 0.24, d * 0.82, 0, 0.12, 0.04, M.slab);
              addCylPart(Math.min(w, d) * 0.18, 0.06, 0, 0.28, d * 0.08, M.glass, 18);
            } else if (sub.includes('urinal')) {
              addBoxPart(w * 0.8, h, d * 0.22, 0, h / 2, -d / 2 + d * 0.11, M.slab);
              const bowlFace = addCylPart(w * 0.18, 0.05, 0, h * 0.45, -d * 0.36, M.glass, 18);
              bowlFace.rotation.x = Math.PI / 2;
            } else if (sub.includes('dishwasher') || sub.includes('dryer') || sub.includes('oven')) {
              addBoxPart(w, h, d, 0, h / 2, 0, M.steel);
              addBoxPart(Math.max(0.05, w - 0.12), Math.max(0.05, h * 0.55), 0.035, 0, h * 0.52, d / 2 + 0.02, sub.includes('oven') ? M.glass : M.wall);
            } else if (sub.includes('range_hood')) {
              addBoxPart(w, 0.12, d, 0, Math.max(1.6, h), 0, M.steel);
              addBoxPart(w * 0.45, h, d * 0.45, 0, h / 2, 0, M.steel);
            } else if (sub.includes('lamp') || sub.includes('light')) {
              addCylPart(0.04, Math.max(0.2, h * 0.72), 0, h * 0.36, 0, M.steel, 12);
              addCylPart(Math.min(w, d) * 0.32, 0.18, 0, h * 0.83, 0, M.glass, 24);
            } else if (sub.includes('plant') || sub.includes('planter')) {
              const potH = Math.min(0.45, h * 0.35);
              if (el.shape === 'circle' || sub.includes('round') || sub.includes('circular')) {
                addCylPart(Math.max(0.08, Math.min(w, d) * 0.32), potH, 0, potH / 2, 0, M.wood, 24);
              } else {
                addBoxPart(w, potH, d, 0, potH / 2, 0, M.wood);
              }
              if (sub.includes('tree') || sub.includes('plant') || sub.includes('palm')) {
                addCylPart(0.035, Math.max(0.25, h * 0.45), 0, potH + h * 0.22, 0, M.wood, 10);
                addCylPart(Math.max(0.12, Math.min(w, d) * 0.28), Math.max(0.25, h * 0.35), 0, potH + h * 0.52, 0, M.plant, 18);
              }
            } else if (sub.includes('rug') || sub.includes('mat')) {
              if (el.shape === 'circle' || sub.includes('round')) {
                addCylPart(Math.max(0.05, Math.min(w, d) / 2), Math.max(0.012, h), 0, Math.max(0.012, h) / 2, 0, M.annotation, 48);
              } else {
                addBoxPart(w, Math.max(0.012, h), d, 0, Math.max(0.012, h) / 2, 0, M.annotation);
              }
            } else if (sub.includes('booth')) {
              addBoxPart(w, 0.16, d, 0, 0.08, 0, M.wood);
              addBoxPart(w, h, 0.12, 0, h / 2, -d / 2 + 0.06, M.wall);
              addBoxPart(w, h, 0.12, 0, h / 2, d / 2 - 0.06, M.wall);
              addBoxPart(w * 0.55, 0.08, d * 0.45, 0, 0.58, 0, M.wood);
            } else if (sub.includes('gondola') || sub.includes('retail_wall_shelf')) {
              addBoxPart(w, h, d, 0, h / 2, 0, M.wood);
              for (let i = 1; i <= 4; i++) addBoxPart(w, 0.025, d + 0.02, 0, (h * i) / 5, 0, M.steel);
            } else if (sub.includes('tv_console')) {
              addBoxPart(w, h * 0.55, d, 0, h * 0.275, 0, M.wood);
              addBoxPart(w * 0.65, h * 0.55, 0.04, 0, h * 0.9, -d / 2 + 0.02, M.steel);
            } else if (sub.includes('clothes_rack')) {
              addBoxPart(w, 0.04, 0.04, 0, h, 0, M.steel);
              addCylPart(0.025, h, -w * 0.42, h / 2, 0, M.steel, 8);
              addCylPart(0.025, h, w * 0.42, h / 2, 0, M.steel, 8);
            } else if (sub.includes('vase') || sub.includes('waste_bin') || sub.includes('umbrella_stand')) {
              addCylPart(Math.max(0.05, Math.min(w, d) * 0.35), h, 0, h / 2, 0, M.slab, 24);
            } else if (sub.includes('water_dispenser')) {
              addBoxPart(w, h * 0.72, d, 0, h * 0.36, 0, M.steel);
              addCylPart(Math.min(w, d) * 0.26, h * 0.28, 0, h * 0.86, 0, M.glass, 18);
            } else if (sub.includes('fire_extinguisher')) {
              addCylPart(Math.min(w, d) * 0.18, h * 0.72, 0, h * 0.36, 0, M.door, 16);
              addBoxPart(w * 0.7, 0.04, d * 0.55, 0, 0.04, 0, M.steel);
            } else if (sub.includes('sculpture')) {
              addBoxPart(w * 0.75, h * 0.35, d * 0.75, 0, h * 0.175, 0, M.slab);
              addCylPart(Math.min(w, d) * 0.22, h * 0.55, 0, h * 0.68, 0, M.steel, 18);
            } else if (sub.includes('chair') || sub.includes('stool')) {
              addBoxPart(w * 0.78, 0.12, d * 0.72, 0, 0.48, 0.05, M.slab);
              addBoxPart(w * 0.78, 0.42, 0.08, 0, 0.72, -d * 0.32, M.wall);
              addCylPart(0.04, 0.48, -w * 0.28, 0.24, d * 0.22, M.steel, 12);
              addCylPart(0.04, 0.48, w * 0.28, 0.24, d * 0.22, M.steel, 12);
            } else if (sub.includes('ottoman') || sub.includes('puff')) {
              addBoxPart(w, h, d, 0, h / 2, 0, M.slab);
            } else if (sub.includes('table') || sub.includes('desk') || sub.includes('conference')) {
              addBoxPart(w, 0.08, d, 0, h, 0, M.wood);
              const legH = Math.max(0.1, h - 0.08);
              [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => {
                addCylPart(0.035, legH, sx * w * 0.38, legH / 2, sz * d * 0.35, M.steel, 10);
              });
            } else if (sub.includes('sink')) {
              addBoxPart(w, 0.08, d, 0, 0.04, 0, M.slab);
              const bowls = sub.includes('double') ? 2 : 1;
              for (let i = 0; i < bowls; i++) {
                const x = bowls === 1 ? 0 : (i === 0 ? -w * 0.22 : w * 0.22);
                addBoxPart(w * 0.34, 0.12, d * 0.62, x, 0.12, 0, M.steel);
              }
            } else if (sub.includes('stove') || sub.includes('hob')) {
              addBoxPart(w, 0.12, d, 0, 0.06, 0, M.steel);
              const burners = sub.includes('2') ? 2 : 4;
              for (let i = 0; i < burners; i++) {
                const col = i % 2;
                const row = Math.floor(i / 2);
                addCylPart(Math.min(w, d) * 0.11, 0.025, (col ? 0.22 : -0.22) * w, 0.14, (row ? 0.22 : -0.22) * d, M.slab, 16);
              }
            } else if (sub.includes('fridge') || sub.includes('washer')) {
              addBoxPart(w, h, d, 0, h / 2, 0, M.steel);
              if (sub.includes('fridge')) {
                addBoxPart(0.03, h * 0.75, 0.03, w / 2 - 0.08, h * 0.5, d / 2 + 0.02, M.wall);
              } else {
                const door = addCylPart(Math.min(w, d) * 0.24, 0.04, 0, h * 0.48, d / 2 + 0.03, M.wall, 24);
                door.rotation.x = Math.PI / 2;
              }
            } else if (sub.includes('bath')) {
              addBoxPart(w, 0.48, d, 0, 0.24, 0, M.slab);
              addBoxPart(Math.max(0.05, w - 0.16), 0.08, Math.max(0.05, d - 0.16), 0, 0.52, 0, M.glass);
            } else if (sub.includes('shower')) {
              addBoxPart(w, 0.08, d, 0, 0.04, 0, M.slab);
              addBoxPart(0.035, h, d, -w / 2 + 0.017, h / 2, 0, M.glass);
              addBoxPart(w, h, 0.035, 0, h / 2, -d / 2 + 0.017, M.glass);
            } else if (sub.includes('wardrobe') || sub.includes('shelf') || sub.includes('filing') || sub.includes('cabinet') || sub.includes('credenza') || sub.includes('console') || sub.includes('whiteboard')) {
              addBoxPart(w, h, d, 0, h / 2, 0, sub.includes('whiteboard') ? M.slab : M.wood);
              if (!sub.includes('whiteboard')) {
                addBoxPart(w, 0.02, d + 0.02, 0, h * 0.5, 0, M.steel);
                addBoxPart(0.02, h, d + 0.02, 0, h / 2, 0, M.steel);
              }
            } else {
              // Standard fallback box primitive
              const fallback = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.steel);
              fallback.position.y = h / 2;
              addMesh(fallback, compGroup);
            }

            elGroup.add(compGroup);
            return;
          }

          // DOOR / WINDOW / WALL OPENING
          if (el.type==='door'||el.type==='window'||el.type==='wall-opening') {
            const placement = openingPlacement(el);
            if (!placement) return;
            const w=el.width || (el.type === 'door' ? DOOR_WIDTH_DEFAULT : WINDOW_WIDTH_DEFAULT);
            const hostThk = placement.host?.thickness || WALL_THICKNESS_DEFAULT;
            const rot=-(placement.rotation||0)*Math.PI/180, g=new THREE.Group();
            if (el.type==='door') {
              const dh=el.height||s3d.doorHeight;
              const panel = new THREE.Mesh(new THREE.BoxGeometry(w,dh,Math.max(0.04, hostThk * 0.28)), el.subType==='glass'?M.glass:M.door);
              panel.position.y = dh / 2;
              addMesh(panel, g);
              if (el.subType === 'double') {
                addMesh(new THREE.Mesh(new THREE.BoxGeometry(0.025, dh, Math.max(0.05, hostThk * 0.34)), M.steel), g);
              } else if (el.subType === 'sliding') {
                const rail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, Math.max(0.05, hostThk * 0.5)), M.steel);
                rail.position.y = dh + 0.035;
                addMesh(rail, g);
              } else if (el.subType === 'folding') {
                [-0.25, 0.25].forEach((x) => {
                  const fold = new THREE.Mesh(new THREE.BoxGeometry(0.02, dh, Math.max(0.05, hostThk * 0.38)), M.steel);
                  fold.position.x = x * w;
                  addMesh(fold, g);
                });
              }
              g.position.set(placement.pos.x, lZ, placement.pos.y);
            } else if (el.type==='window') {
              const sill=el.sillHeight??s3d.windowSillHeight, wh=el.height??(s3d.windowTopHeight-s3d.windowSillHeight);
              g.position.set(placement.pos.x, lZ+sill, placement.pos.y);
              addMesh(new THREE.Mesh(new THREE.BoxGeometry(w,Math.max(0.04, wh),Math.max(0.08, hostThk * 0.45)), M.wFrame), g);
              addMesh(new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.1,w-0.12),Math.max(0.1,wh-0.12),Math.max(0.03, hostThk * 0.12)), M.glass), g);
              const mullion = new THREE.Mesh(new THREE.BoxGeometry(0.025, Math.max(0.1, wh - 0.08), Math.max(0.085, hostThk * 0.48)), M.wFrame);
              mullion.position.y = 0;
              addMesh(mullion, g);
              g.children.forEach(child => { child.position.y += wh / 2; });
            } else {
              const oh = el.height ?? s3d.wallOpeningHeight;
              g.position.set(placement.pos.x, lZ + oh, placement.pos.y);
              const header = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, Math.max(0.08, hostThk * 0.45)), M.wFrame);
              addMesh(header, g);
            }
            g.rotation.y=rot; elGroup.add(g);
            return;
          }

          // STAIR
          if (el.type==='stair' && el.p1 && el.p2) {
            const pts = [el.p1, el.p2, el.p3, el.p4].filter(Boolean) as Point[];
            const w=el.width||1.05;
            let cumulativeRise = 0;
            for (let s = 0; s < pts.length - 1; s++) {
              const a = pts[s], b = pts[s + 1];
              const dx=b.x-a.x, dz=b.y-a.y, len=Math.hypot(dx,dz);
              if (len<0.1) continue;
              const steps=Math.max(1,Math.floor(len/0.3)), angle=Math.atan2(dz,dx);
              const g=new THREE.Group(); g.position.set(a.x,lZ,a.y); g.rotation.y=-angle;
              for(let i=0;i<steps;i++){
                const t=new THREE.Mesh(new THREE.BoxGeometry(len/steps,0.04,w),M.conc);
                t.position.set(i*(len/steps)+(len/steps)/2,cumulativeRise + 0.15*(i+1)-0.02,0); addMesh(t,g);
              }
              cumulativeRise += 0.15 * steps;
              elGroup.add(g);
            }
            return;
          }

          // RAILING
          if (el.type==='railing' && el.p1 && el.p2) {
            const dx=el.p2.x-el.p1.x, dz=el.p2.y-el.p1.y, dist=Math.hypot(dx,dz), h=el.height||1;
            const g=new THREE.Group(); g.position.set(el.p1.x,lZ,el.p1.y); g.rotation.y=-Math.atan2(dz,dx);
            const posts=Math.max(2,Math.floor(dist/0.8)+1);
            for(let i=0;i<posts;i++){ const p=new THREE.Mesh(new THREE.BoxGeometry(0.05,h,0.05),M.steel); p.position.set((i/(posts-1))*dist,h/2,0); addMesh(p,g); }
            const r=new THREE.Mesh(new THREE.BoxGeometry(dist,0.05,0.05),M.steel); r.position.set(dist/2,h,0); addMesh(r,g); elGroup.add(g); return;
          }

          // URBAN / SITE LINEAR ELEMENTS
          if ((el.type === 'road' || el.type === 'infrastructure') && el.p1 && el.p2) {
            const width = el.width || (el.type === 'road' ? 4 : 1.2);
            const strip = makeFlatStrip(el.p1, el.p2, width, el.type === 'road' ? M.road : M.steel, lZ + 0.025);
            if (strip) addMesh(strip, elGroup, 0x1e293b);
            if (el.type === 'road' && strip) {
              const center = makeFlatStrip(el.p1, el.p2, 0.08, M.annotation, lZ + 0.055);
              if (center) addMesh(center, elGroup, 0xf8fafc);
            }
            return;
          }

          // URBAN ASSETS
          if (el.type === 'asset' && el.pos) {
            const assetType = el.assetType || el.subType || 'tree';
            const scale = el.scale || 1;
            const g = new THREE.Group();
            g.position.set(el.pos.x, lZ, el.pos.y);
            if (assetType === 'tree') {
              const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.12 * scale, 1.2 * scale, 12), M.wood);
              trunk.position.y = 0.6 * scale;
              addMesh(trunk, g);
              const crown = new THREE.Mesh(new THREE.SphereGeometry(0.55 * scale, 20, 12), M.plant);
              crown.position.y = 1.45 * scale;
              addMesh(crown, g);
            } else if (assetType === 'streetlight') {
              addMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.035 * scale, 0.045 * scale, 2.4 * scale, 12), M.steel), g);
              g.children[0].position.y = 1.2 * scale;
              const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.45 * scale, 0.08 * scale, 0.16 * scale), M.glass);
              lamp.position.set(0.18 * scale, 2.35 * scale, 0);
              addMesh(lamp, g);
            } else if (assetType === 'car') {
              addMesh(new THREE.Mesh(new THREE.BoxGeometry(1.8 * scale, 0.45 * scale, 0.9 * scale), M.steel), g);
              g.children[0].position.y = 0.28 * scale;
              const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.9 * scale, 0.35 * scale, 0.75 * scale), M.glass);
              cabin.position.y = 0.68 * scale;
              addMesh(cabin, g);
            } else {
              addMesh(new THREE.Mesh(new THREE.BoxGeometry(1.2 * scale, 0.45 * scale, 0.45 * scale), M.wood), g);
              g.children[0].position.y = 0.25 * scale;
            }
            elGroup.add(g);
            return;
          }

          // BUILDING MASS
          if (el.type==='building-mass' && el.boundary && el.boundary.length>=3) {
            const shape=makePlanShape(el.boundary), massH=el.height||10;
            const color = isMono ? '#f8fafc' : (el.usageType==='office'?'#3b82f6':el.usageType==='residential'?'#475569':el.usageType==='mixed-use'?'#db2777':'#94a3b8');
            const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:massH,bevelEnabled:false}),new THREE.MeshStandardMaterial({color,roughness:0.4,metalness:isMono?0.05:0.2}));
            mesh.rotation.x=-Math.PI/2; mesh.position.y=lZ; addMesh(mesh,elGroup); return;
          }

          // LANDSCAPE / WATER
          if (['landscape','water-body'].includes(el.type) && el.boundary && el.boundary.length>=3) {
            const shape=makePlanShape(el.boundary);
            const color = isMono 
              ? (el.type==='landscape'?'#f8fafc':'#f1f5f9')
              : (el.type==='landscape'?'#10b981':'#0284c7');
            const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),new THREE.MeshStandardMaterial({color,roughness:el.type==='water-body'?0.05:1,metalness:el.type==='water-body'?(isMono?0.1:0.5):0,side:THREE.DoubleSide}));
            mesh.rotation.x=-Math.PI/2; mesh.position.y=lZ+0.05; addMesh(mesh,elGroup); return;
          }
        };

        runBuild();
        elGroup.userData.elementId = el.id;
        elGroup.traverse((obj) => { obj.userData.elementId = el.id; });
        if (selectedIdsRef.current.includes(el.id)) {
          const selectionMaterial = new THREE.LineBasicMaterial({
            color: isMono ? 0x2563eb : 0xf59e0b,
            depthTest: false,
            transparent: true,
            opacity: 0.95,
          });
          if (el.type === 'wall' && el.p1 && el.p2) {
            const thk = el.thickness || WALL_THICKNESS_DEFAULT;
            const wallH = el.height || lH;
            const curved = el.isCurved || ['arc','circle','ellipse'].includes(el.wallSource || '');
            const points: THREE.Vector3[] = [];
            const addSeg = (a: THREE.Vector3, b: THREE.Vector3) => { points.push(a, b); };
            const addPrism = (a: Point, b: Point) => {
              const dx = b.x - a.x;
              const dz = b.y - a.y;
              const len = Math.hypot(dx, dz);
              if (len < 0.001) return;
              const nx = -dz / len * thk / 2;
              const nz = dx / len * thk / 2;
              const corners = [
                new THREE.Vector3(a.x + nx, lZ, a.y + nz),
                new THREE.Vector3(b.x + nx, lZ, b.y + nz),
                new THREE.Vector3(b.x - nx, lZ, b.y - nz),
                new THREE.Vector3(a.x - nx, lZ, a.y - nz),
              ];
              const top = corners.map(p => p.clone().setY(lZ + wallH));
              [[0,1],[1,2],[2,3],[3,0]].forEach(([i,j]) => {
                addSeg(corners[i], corners[j]);
                addSeg(top[i], top[j]);
              });
              [0,1,2,3].forEach(i => addSeg(corners[i], top[i]));
            };

            if (curved) {
              const samples: Point[] = [];
              for (let i = 0; i <= 32; i++) {
                const pt = getCurvePoint(el, i / 32);
                if (pt) samples.push(pt);
              }
              const outerTop: THREE.Vector3[] = [];
              const innerTop: THREE.Vector3[] = [];
              const outerBottom: THREE.Vector3[] = [];
              const innerBottom: THREE.Vector3[] = [];
              samples.forEach((pt, i) => {
                const prev = samples[Math.max(0, i - 1)] || pt;
                const next = samples[Math.min(samples.length - 1, i + 1)] || pt;
                const dx = next.x - prev.x;
                const dz = next.y - prev.y;
                const len = Math.hypot(dx, dz) || 1;
                const nx = -dz / len * thk / 2;
                const nz = dx / len * thk / 2;
                outerBottom.push(new THREE.Vector3(pt.x + nx, lZ, pt.y + nz));
                innerBottom.push(new THREE.Vector3(pt.x - nx, lZ, pt.y - nz));
                outerTop.push(new THREE.Vector3(pt.x + nx, lZ + wallH, pt.y + nz));
                innerTop.push(new THREE.Vector3(pt.x - nx, lZ + wallH, pt.y - nz));
              });
              [outerBottom, innerBottom, outerTop, innerTop].forEach(polyline => {
                for (let i = 0; i < polyline.length - 1; i++) addSeg(polyline[i], polyline[i + 1]);
              });
              if (outerBottom.length && innerBottom.length) {
                const last = outerBottom.length - 1;
                addSeg(outerBottom[0], innerBottom[0]);
                addSeg(outerTop[0], innerTop[0]);
                addSeg(outerBottom[last], innerBottom[last]);
                addSeg(outerTop[last], innerTop[last]);
                [outerBottom[0], innerBottom[0], outerBottom[last], innerBottom[last]].forEach((bottom, idx) => {
                  const top = idx < 2 ? [outerTop[0], innerTop[0]][idx] : [outerTop[last], innerTop[last]][idx - 2];
                  addSeg(bottom, top);
                });
              }
            } else {
              addPrism(el.p1, el.p2);
            }

            const outline = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points), selectionMaterial);
            outline.userData.elementId = el.id;
            outline.userData.isSelectionOutline = true;
            outline.renderOrder = 10;
            elGroup.add(outline);
          } else {
            const selectedMeshes: THREE.Mesh[] = [];
            elGroup.traverse((obj) => {
              if ((obj as THREE.Mesh).isMesh) selectedMeshes.push(obj as THREE.Mesh);
            });
            selectedMeshes.forEach((mesh) => {
              try {
                const selectedEdges = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 35), selectionMaterial);
                selectedEdges.userData.elementId = el.id;
                selectedEdges.userData.isSelectionOutline = true;
                selectedEdges.renderOrder = 10;
                mesh.add(selectedEdges);
              } catch { /* skip degenerate selected geometry */ }
            });
          }
        }
        group.add(elGroup);
        newCache.set(el.id, { hash, obj: elGroup });
      });

      // Dispose any elements that are no longer in the project
      meshCache.current.forEach((val, key) => {
        if (!newCache.has(key)) {
          group.remove(val.obj);
          disposeObject(val.obj);
        }
      });
      meshCache.current = newCache;

      // ── Auto-center camera on element bounding box ───────────────────────────
      const { minX, maxX, minZ, maxZ, hasAny } = collectPivotBounds(false);

      if (hasAny) {
        const cx   = (minX+maxX)/2, cz = (minZ+maxZ)/2;
        const span = Math.max(maxX-minX, maxZ-minZ, 10);
        const d    = span * 1.4, h = span * 0.8;
        const target = new THREE.Vector3(cx, 0, cz);

        // Adjust shadow frustum and sun position dynamically to optimize shadow rendering quality & performance
        const sceneSun = sceneRef.current?.getObjectByName('sun') as THREE.DirectionalLight | undefined;
        if (sceneSun) {
          sceneSun.position.set(cx + span * 1.2, span * 2.0, cz + span * 0.8);
          sceneSun.target.position.set(cx, 0, cz);
          sceneSun.target.updateMatrixWorld();
          
          const shadowCam = sceneSun.shadow.camera;
          const halfSpan = span * 1.2;
          shadowCam.left = -halfSpan;
          shadowCam.right = halfSpan;
          shadowCam.top = halfSpan;
          shadowCam.bottom = -halfSpan;
          shadowCam.near = 0.5;
          shadowCam.far = span * 5.0;
          shadowCam.updateProjectionMatrix();
        }

        if (!cameraFrameReadyRef.current) {
          ctrls.target.copy(target);
          if (parallel) {
            thisCam.position.set(cx, h*1.5, cz);
          } else {
            thisCam.position.set(cx + d*0.6, h, cz + d*0.8);
          }
          thisCam.lookAt(target);
        }

        if (!cameraFrameReadyRef.current && thisCam instanceof THREE.OrthographicCamera) {
          const w  = rend.domElement.clientWidth || rend.domElement.width;
          const hh = rend.domElement.clientHeight || rend.domElement.height;
          const asp = hh > 0 ? w/hh : 1;
          const half = span * 0.8;
          thisCam.left=-half*asp; thisCam.right=half*asp; thisCam.top=half; thisCam.bottom=-half;
          thisCam.updateProjectionMatrix();
        }

        // Move ground+grid to centre on model
        if (groundRef.current) groundRef.current.position.set(cx, 0, cz);
        if (gridRef.current)   gridRef.current.position.set(cx, 0.01, cz);

        ctrls.update();
        onCamChange(); // sync ViewCube
      }
    };
    // ── End of doRebuild definition ───────────────────────────────────────────

    // First build (project data already in projectRef.current)
    doRebuild.current();

    // ── Cleanup ────────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId);
      if (orbitPivotFrame !== null) cancelAnimationFrame(orbitPivotFrame);
      if (snapFrameRef.current !== null) cancelAnimationFrame(snapFrameRef.current);
      window.removeEventListener('keydown', onKD);
      window.removeEventListener('keyup',   onKU);
      window.removeEventListener('blur',    onBl);
      controls.removeEventListener('change', onCamChange);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown3D, true);
      renderer.domElement.removeEventListener('pointermove', onPointerMove3D, true);
      renderer.domElement.removeEventListener('pointerup', onPointerUp3D, true);
      renderer.domElement.removeEventListener('pointercancel', onPointerCancel3D, true);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave3D);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu3D);
      window.removeEventListener('pointerup', onWindowPointerUp3D);
      disposePreview();
      scene.remove(previewGroup);
      controls.dispose();
      ro.disconnect();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      // Reset refs so rebuild guards correctly skip if somehow called after unmount
      sceneRef.current = null; elemGroupRef.current = null;
      cameraRef.current = null; controlsRef.current = null;
      doRebuild.current = () => {};   // no-op after unmount

      // Clear mesh cache and dispose geometries
      meshCache.current.forEach((val) => {
        disposeObject(val.obj);
      });
      meshCache.current.clear();
    };
  }, []); // ← EMPTY: runs exactly once

  // ══════════════════════════════════════════════════════════════════════════════
  // REBUILD TRIGGER — fires whenever project changes
  // No useCallback, no closures, just calls the stable ref.
  // ══════════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    doRebuild.current(); // always has latest project via projectRef.current
  }, [project, isMonotone, editorState?.selectedIds]);

  // ══════════════════════════════════════════════════════════════════════════════
  // PERSPECTIVE / PARALLEL TOGGLE
  // ══════════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const container  = containerRef.current;
    const renderer   = rendererRef.current;
    const controls   = controlsRef.current;
    if (!container || !renderer || !controls) return;

    const W = container.clientWidth  || window.innerWidth;
    const H = container.clientHeight || window.innerHeight;
    const previousFrame: View3DCameraFrame | null = cameraRef.current && controls
      ? {
          position: [cameraRef.current.position.x, cameraRef.current.position.y, cameraRef.current.position.z],
          target: [controls.target.x, controls.target.y, controls.target.z],
          isParallel,
          orthographicZoom: cameraRef.current instanceof THREE.OrthographicCamera ? cameraRef.current.zoom : undefined,
        }
      : (initialCameraFrame || null);

    let newCam: THREE.Camera;
    if (isParallel) {
      const oc = new THREE.OrthographicCamera(-50, 50, 50*(H/W), -50*(H/W), 0.1, 5000);
      oc.position.set(0, 100, 0); oc.lookAt(0, 0, 0);
      newCam = oc;
    } else {
      const pc = new THREE.PerspectiveCamera(45, W/H, 0.1, 5000);
      pc.position.set(0, 30, 50); pc.lookAt(0, 0, 0);
      newCam = pc;
    }

    if (previousFrame) {
      newCam.position.fromArray(previousFrame.position);
      controls.target.fromArray(previousFrame.target);
      if (newCam instanceof THREE.OrthographicCamera && previousFrame.orthographicZoom) {
        newCam.zoom = previousFrame.orthographicZoom;
        newCam.updateProjectionMatrix();
      }
      cameraFrameReadyRef.current = true;
    }

    cameraRef.current = newCam;
    (controls as any).object = newCam;
    controls.update();

    // Restart render loop with the new camera
    if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    const scene = sceneRef.current;
    if (scene) {
      let rafId: number;
      const loop = () => { rafId = requestAnimationFrame(loop); controls.update(); renderer.render(scene, newCam); };
      loop(); animFrameRef.current = rafId!;
    }

    // Rebuild repositions the new camera correctly onto the model
    doRebuild.current();
  }, [isParallel]); // only isParallel — no dependency on callbacks

  // ══════════════════════════════════════════════════════════════════════════════
  // VIEW-CUBE SNAP — reads refs, needs no deps
  // ══════════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const snapTo = (dir: string) => {
      const cam   = cameraRef.current;
      const ctrls = controlsRef.current;
      if (!cam || !ctrls) return;
      if (snapFrameRef.current !== null) { cancelAnimationFrame(snapFrameRef.current); snapFrameRef.current = null; }

      const selectedBounds = selectedIdsRef.current.length ? collectPivotBounds(true) : null;
      const bounds = selectedBounds?.hasAny ? selectedBounds : collectPivotBounds(false);
      const t = bounds.hasAny
        ? new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2)
        : ctrls.target.clone();
      const startPos = cam.position.clone(), startTgt = ctrls.target.clone();

      // Estimate scene size from bounding box
      const { minX, maxX, minZ, maxZ, hasAny } = bounds;
      const d = hasAny ? Math.max(maxX-minX, maxZ-minZ, 10)*1.4 : 30;
      const h = d * 0.7;

      const target = new THREE.Vector3();
      switch(dir) {
        case 'TOP':    target.set(t.x,t.y+d*1.5,t.z);          break;
        case 'BOTTOM': target.set(t.x,t.y-d*1.5,t.z);          break;
        case 'N':      target.set(t.x,t.y+2,t.z+d);            break;
        case 'S':      target.set(t.x,t.y+2,t.z-d);            break;
        case 'E':      target.set(t.x+d,t.y+2,t.z);            break;
        case 'W':      target.set(t.x-d,t.y+2,t.z);            break;
        case 'NE':     target.set(t.x+d*.7,h,t.z+d*.7);        break;
        case 'NW':     target.set(t.x-d*.7,h,t.z+d*.7);        break;
        case 'SE':     target.set(t.x+d*.7,h,t.z-d*.7);        break;
        case 'SW':     target.set(t.x-d*.7,h,t.z-d*.7);        break;
        default: return;
      }

      let st: number|null = null;
      const anim = (ts: number) => {
        if (!st) st = ts;
        const p = Math.min((ts-st)/500, 1);
        const e = p<.5 ? 4*p*p*p : 1-Math.pow(-2*p+2,3)/2;
        cam.position.lerpVectors(startPos, target, e);
        ctrls.target.lerpVectors(startTgt, t, e);
        ctrls.update();
        if (p<1) { snapFrameRef.current = requestAnimationFrame(anim); } else { snapFrameRef.current = null; }
      };
      snapFrameRef.current = requestAnimationFrame(anim);
    };

    const handler = (e: Event) => snapTo((e as CustomEvent).detail);
    window.addEventListener('snap-3d-camera', handler);
    return () => window.removeEventListener('snap-3d-camera', handler);
  }, []); // empty — reads from refs only

  useEffect(() => {
    const handleToggleProjection = (e: Event) => {
      const nextVal = (e as CustomEvent).detail;
      setIsParallel(nextVal);
    };
    window.addEventListener('toggle-3d-projection', handleToggleProjection);
    return () => window.removeEventListener('toggle-3d-projection', handleToggleProjection);
  }, []);

  // Snap to Render Canvas listener
  useEffect(() => {
    const handleTakeSnap = () => {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (renderer && scene && camera) {
        renderer.render(scene, camera);
        const dataUrl = renderer.domElement.toDataURL('image/png');
        window.dispatchEvent(new CustomEvent('3d-snap-taken', { detail: { dataUrl } }));
      }
    };
    window.addEventListener('take-3d-snap', handleTakeSnap);
    return () => window.removeEventListener('take-3d-snap', handleTakeSnap);
  }, []);

  // Walk mode implementation
  useEffect(() => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;
    
    if (editorState?.activeTool === 'walk') {
      controls.enableZoom = false;
      controls.enablePan = false;
      
      const levelId = activeLevelIdRef.current || projectRef.current?.levels[0]?.id;
      const elevation = projectRef.current?.levels.find(l => l.id === levelId)?.zElevation || 0;
      const walkHeight = elevation + 1.8; // ~6 feet
      
      camera.position.y = walkHeight;
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      controls.target.copy(camera.position).add(dir.multiplyScalar(1.0));
      controls.update();

      const keys = new Set<string>();
      const onKeyDown = (e: KeyboardEvent) => keys.add(e.key.toLowerCase());
      const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);

      let walkFrame: number;
      const speed = 0.1;
      const walkLoop = () => {
        if (!cameraRef.current || !controlsRef.current) return;
        const cam = cameraRef.current;
        const ctrl = controlsRef.current;
        
        let moved = false;
        const forwardDir = new THREE.Vector3();
        cam.getWorldDirection(forwardDir);
        forwardDir.y = 0;
        forwardDir.normalize();

        const rightDir = new THREE.Vector3().crossVectors(forwardDir, new THREE.Vector3(0,1,0));

        if (keys.has('w') || keys.has('arrowup')) {
          cam.position.addScaledVector(forwardDir, speed);
          ctrl.target.addScaledVector(forwardDir, speed);
          moved = true;
        }
        if (keys.has('s') || keys.has('arrowdown')) {
          cam.position.addScaledVector(forwardDir, -speed);
          ctrl.target.addScaledVector(forwardDir, -speed);
          moved = true;
        }
        if (keys.has('a') || keys.has('arrowleft')) {
          cam.position.addScaledVector(rightDir, -speed);
          ctrl.target.addScaledVector(rightDir, -speed);
          moved = true;
        }
        if (keys.has('d') || keys.has('arrowright')) {
          cam.position.addScaledVector(rightDir, speed);
          ctrl.target.addScaledVector(rightDir, speed);
          moved = true;
        }
        
        if (moved || cam.position.y !== walkHeight) {
          cam.position.y = walkHeight;
          cam.getWorldDirection(dir);
          ctrl.target.copy(cam.position).add(dir.multiplyScalar(1.0));
          ctrl.update();
        }
        walkFrame = requestAnimationFrame(walkLoop);
      };
      walkFrame = requestAnimationFrame(walkLoop);

      return () => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        cancelAnimationFrame(walkFrame);
      };
    } else {
      controls.enableZoom = true;
      controls.enablePan = true;
    }
  }, [editorState?.activeTool]);

  const activeCursor = (() => {
    if (navigationDragMode === 'orbit') return ORBIT_CURSOR;
    if (navigationDragMode === 'pan') return 'grabbing';
    if (selectionMarquee) return 'crosshair';
    const tool = editorState?.activeTool;
    if (tool === 'pan') return 'grab';
    if (tool === 'move') return 'move';
    if (tool === 'select') return 'default';
    if (tool === 'delete') return 'not-allowed';
    return 'crosshair';
  })();

  return (
    <div className="relative w-full h-full overflow-hidden bg-white">
      <div ref={containerRef} className="w-full h-full" style={{ cursor: activeCursor }} />
      {selectionMarquee && (() => {
        const left = Math.min(selectionMarquee.start.x, selectionMarquee.end.x);
        const top = Math.min(selectionMarquee.start.y, selectionMarquee.end.y);
        const width = Math.abs(selectionMarquee.end.x - selectionMarquee.start.x);
        const height = Math.abs(selectionMarquee.end.y - selectionMarquee.start.y);
        const isCrossing = selectionMarquee.end.x < selectionMarquee.start.x;
        return (
          <div
            className="absolute pointer-events-none z-40"
            style={{
              left,
              top,
              width,
              height,
              border: `1px ${isCrossing ? 'dashed' : 'solid'} ${isCrossing ? '#22c55e' : '#2563eb'}`,
              background: isCrossing ? 'rgba(34, 197, 94, 0.12)' : 'rgba(37, 99, 235, 0.12)',
            }}
          />
        );
      })()}
      <div className="absolute bottom-4 right-4 z-50 flex gap-2">
        <button
          onClick={() => setIsMonotone(m => !m)}
          className="px-3 py-1.5 bg-white/95 hover:bg-slate-50 border border-slate-300 text-[10px] font-bold text-slate-600 rounded-md transition-all uppercase tracking-widest shadow-md hover:shadow-lg active:scale-95"
        >
          {isMonotone ? 'Consistent Colors' : 'Minimalist Monotone'}
        </button>
      </div>
    </div>
  );
};

export default Viewer3D;
