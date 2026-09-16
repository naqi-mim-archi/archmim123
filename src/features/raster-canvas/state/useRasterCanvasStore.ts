import { useState, useCallback, useRef, useEffect } from 'react';
import {
  CanvasLayer,
  ToolType,
  SelectSubTool,
  DrawSubTool,
  SelectionState,
  ImageAdjustments,
  DEFAULT_ADJUSTMENTS,
  CropExtendState,
  HistoryEntry,
  Point,
  Rect,
  TextProperties,
  TextBoxState,
  PlacedItemState,
  GeometryMode,
  PerspectiveSettings,
  PerspectiveGuide,
} from '../types/canvas';
import { CanvasEngine } from '../core/CanvasEngine';
import { MaskEngine } from '../core/MaskEngine';
import { CropEngine } from '../core/CropEngine';
import { RotationEngine } from '../core/RotationEngine';
import { PerspectiveEngine } from '../core/PerspectiveEngine';
import { FilterEngine } from '../core/FilterEngine';
import { TextEngine } from '../core/TextEngine';
import { PlaceEngine } from '../core/PlaceEngine';

export interface RasterCanvasStore {
  // Dimensions
  width: number;
  height: number;
  setDimensions: (width: number, height: number) => void;

  // Layers
  layers: CanvasLayer[];
  activeLayerId: string | null;
  setActiveLayerId: (id: string) => void;
  addLayer: (name: string, type?: CanvasLayer['type'], imageElement?: HTMLImageElement | HTMLCanvasElement, sourceLayerId?: string | null) => CanvasLayer;
  resetWithImage: (imageElement: HTMLImageElement | HTMLCanvasElement, name?: string) => CanvasLayer;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  reorderLayers: (startIndex: number, endIndex: number) => void;
  setLayerVisibility: (id: string, visible: boolean) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  setLayerBlendMode: (id: string, blendMode: CanvasLayer['blendMode']) => void;
  setLayerLocked: (id: string, locked: boolean) => void;
  selectedLayerIds: string[];
  toggleLayerSelected: (id: string) => void;
  createLayerGroup: () => void;
  ungroupLayer: (groupId: string) => void;
  toggleGroupExpanded: (groupId: string) => void;
  moveLayer: (id: string, direction: 'up' | 'down') => void;
  mergeLayerDown: (id: string) => void;
  flipLayer: (id: string, axis: 'h' | 'v') => void;
  flipAllLayers: (axis: 'h' | 'v') => void;
  rotateLayer: (id: string, degrees: number) => void;
  rotateAllLayers: (degrees: number) => void;
  straightenLayers: (degrees: number, scope: 'all' | 'active') => void;
  scaleLayer: (id: string, factor: number) => void;
  scaleAllLayers: (factor: number) => void;

  // Tools & Settings
  activeTool: ToolType;
  setActiveTool: (tool: ToolType) => void;
  rotationScope: 'all' | 'active';
  setRotationScope: (scope: 'all' | 'active') => void;
  straightenAngle: number;
  setStraightenAngle: (degrees: number) => void;
  geometryMode: GeometryMode;
  setGeometryMode: (mode: GeometryMode) => void;
  perspective: PerspectiveSettings;
  setPerspective: (settings: Partial<PerspectiveSettings>) => void;
  addPerspectiveGuide: (guide: PerspectiveGuide) => void;
  clearPerspectiveGuides: () => void;
  autoPerspective: (sourceCanvas: HTMLCanvasElement) => void;
  applyPerspective: () => void;
  resetPerspective: () => void;
  selectSubTool: SelectSubTool;
  setSelectSubTool: (subTool: SelectSubTool) => void;
  drawSubTool: DrawSubTool;
  setDrawSubTool: (subTool: DrawSubTool) => void;

  // Crop & Extend
  cropState: CropExtendState | null;
  startCrop: () => void;
  updateCropRect: (rect: Rect) => void;
  setCropAspectRatio: (ratio: string | null) => void;
  applyCrop: () => void;
  cancelCrop: () => void;
  extendCanvas: (direction: 'top' | 'bottom' | 'left' | 'right', pixels: number) => void;

  // Brush / Drawing properties
  brushSize: number;
  setBrushSize: (size: number | ((prev: number) => number)) => void;
  brushHardness: number;
  setBrushHardness: (hardness: number) => void;
  brushOpacity: number;
  setBrushOpacity: (opacity: number) => void;
  brushColor: string;
  setBrushColor: (color: string) => void;

  // Text Tool State
  textProps: TextProperties;
  setTextProps: (props: Partial<TextProperties>) => void;
  commitTextLayer: (props: TextProperties, box: TextBoxState, layerId?: string | null) => void;
  addPlacedItem: (name: string, source: HTMLCanvasElement, dataUrl: string) => CanvasLayer;
  updatePlacedItem: (layerId: string, state: PlacedItemState, commit?: boolean) => void;

  // Selection & Masking
  selection: SelectionState;
  setSelectionMask: (maskCanvas: HTMLCanvasElement | null, bounds?: Rect | null) => void;
  clearSelection: () => void;
  invertSelection: () => void;
  featherSelection: (radius: number) => void;
  dilateErodeSelection: (amount: number) => void;

  // Adjustments
  adjustments: ImageAdjustments;
  setAdjustments: (adjustments: Partial<ImageAdjustments>) => void;
  resetAdjustments: () => void;
  adjustmentScope: 'image' | 'selection';
  setAdjustmentScope: (scope: 'image' | 'selection') => void;
  saveAdjustmentsAsLayers: () => void;
  pointColorPicking: boolean;
  setPointColorPicking: (picking: boolean) => void;
  adjustmentDragging: boolean;
  setAdjustmentDragging: (dragging: boolean) => void;

  // Viewport Navigation
  zoom: number;
  setZoom: (zoom: number | ((prev: number) => number)) => void;
  pan: Point;
  setPan: (pan: Point | ((prev: Point) => Point)) => void;
  resetView: () => void;

  // History / Undo / Redo
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  pushHistory: (description: string, specificLayers?: CanvasLayer[]) => void;
  history: HistoryEntry[];
  historyIndex: number;
  restoreHistoryIndex: (index: number) => void;

  // Before / After Comparison
  isComparing: boolean;
  setIsComparing: (comparing: boolean) => void;

  // AI Result Preview Layer
  aiPreviewImage: string | null;
  setAiPreviewImage: (url: string | null) => void;
  applyAiPreview: () => void;
  discardAiPreview: () => void;

  // Force render ticker
  renderTrigger: number;
  requestRender: () => void;
}

export function useRasterCanvasState(initialWidth = 1024, initialHeight = 1024): RasterCanvasStore {
  const [width, setWidthState] = useState(initialWidth);
  const [height, setHeightState] = useState(initialHeight);
  const widthRef = useRef(initialWidth);
  const heightRef = useRef(initialHeight);

  // Sync refs when state changes
  useEffect(() => {
    widthRef.current = width;
    heightRef.current = height;
  }, [width, height]);

  const [layers, setLayers] = useState<CanvasLayer[]>([]);
  const [activeLayerId, setActiveLayerId] = useState<string | null>(null);
  const [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
  const [rotationScope, setRotationScope] = useState<'all' | 'active'>('all');
  const [straightenAngle, setStraightenAngle] = useState<number>(0);
  const [geometryMode, setGeometryModeState] = useState<GeometryMode>('crop');
  const defaultPerspective: PerspectiveSettings = {
    mode: 'auto',
    vertical: 0,
    horizontal: 0,
    aspect: 0,
    scale: 100,
    offsetX: 0,
    offsetY: 0,
    edgeMode: 'auto-crop',
    guides: [],
    guideOrientation: 'vertical',
  };
  const [perspective, setPerspectiveState] = useState<PerspectiveSettings>(defaultPerspective);
  const perspectiveRef = useRef<PerspectiveSettings>(defaultPerspective);

  const [activeTool, setActiveToolState] = useState<ToolType>('select');
  const setActiveTool = useCallback((tool: ToolType) => {
    setActiveToolState(tool);
    if (tool !== 'rotate') setStraightenAngle(0);
    if (tool === 'crop' || tool === 'outpaint') {
      setCropState({
        active: true,
        cropRect: { x: 0, y: 0, width: widthRef.current, height: heightRef.current },
        aspectRatio: null,
        rotation: 0,
        straightenAngle: 0,
        isExtending: tool === 'outpaint',
        originalDimensions: { width: widthRef.current, height: heightRef.current }
      });
    } else if (tool === 'rotate') {
      setGeometryModeState('crop');
      setCropState({
        active: true,
        cropRect: { x: 0, y: 0, width: widthRef.current, height: heightRef.current },
        aspectRatio: null,
        rotation: 0,
        straightenAngle: 0,
        isExtending: false,
        originalDimensions: { width: widthRef.current, height: heightRef.current },
      });
    } else {
      setCropState(null);
    }
  }, []);
  const [selectSubTool, setSelectSubTool] = useState<SelectSubTool>('brush');
  const [drawSubTool, setDrawSubTool] = useState<DrawSubTool>('pen');

  const [brushSize, setBrushSize] = useState<number>(4);
  const [brushHardness, setBrushHardness] = useState<number>(85);
  const [brushOpacity, setBrushOpacity] = useState<number>(100);
  const [brushColor, setBrushColor] = useState<string>('#3b82f6');

  const [selection, setSelection] = useState<SelectionState>({
    active: false,
    maskCanvas: null,
    bounds: null,
    feather: 0,
    mode: 'new',
    pathPoints: [],
  });

  const [adjustments, setAdjustmentsState] = useState<ImageAdjustments>(() => FilterEngine.cloneAdjustments(DEFAULT_ADJUSTMENTS));
  const [adjustmentScope, setAdjustmentScope] = useState<'image' | 'selection'>('image');
  const [pointColorPicking, setPointColorPicking] = useState(false);
  const [adjustmentDragging, setAdjustmentDragging] = useState(false);

  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [aiPreviewImage, setAiPreviewImage] = useState<string | null>(null);
  const [renderTrigger, setRenderTrigger] = useState<number>(0);

  // Synchronous references to avoid race conditions in undo/redo & snapshot recording
  const historyIndexRef = useRef(historyIndex);
  historyIndexRef.current = historyIndex;

  const historyRef = useRef(history);
  historyRef.current = history;

  const layersRef = useRef(layers);
  layersRef.current = layers;

  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const adjustmentsRef = useRef(adjustments);
  adjustmentsRef.current = adjustments;

  const requestRender = useCallback(() => {
    setRenderTrigger(prev => prev + 1);
  }, []);

  const setDimensions = useCallback((w: number, h: number) => {
    widthRef.current = w;
    heightRef.current = h;
    setWidthState(w);
    setHeightState(h);
    requestRender();
  }, [requestRender]);

  // Snapshot generator for history
  const createHistorySnapshot = useCallback((
    description: string, 
    currentLayers: CanvasLayer[],
    currentSelection?: SelectionState,
    currentAdjustments?: ImageAdjustments
  ): HistoryEntry => {
    let snapW = width;
    let snapH = height;
    if (currentLayers.length > 0 && currentLayers[0].canvas && currentLayers[0].canvas.width > 1) {
      snapW = currentLayers[0].canvas.width;
      snapH = currentLayers[0].canvas.height;
    }

    const sel = currentSelection || selectionRef.current;
    const adj = currentAdjustments || adjustmentsRef.current;

    return {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      description,
      layersSnapshot: currentLayers.map(l => ({
        id: l.id,
        name: l.name,
        type: l.type,
        visible: l.visible,
        opacity: l.opacity,
        blendMode: l.blendMode,
        locked: l.locked,
        imageData: l.canvas.toDataURL(),
        transform: { ...l.transform },
        adjustments: l.adjustments ? FilterEngine.cloneAdjustments(l.adjustments) : undefined,
        adjustmentMaskData: l.adjustmentMask ? l.adjustmentMask.toDataURL() : null,
        textProps: l.textProps ? { ...l.textProps } : undefined,
        textBox: l.textBox ? { ...l.textBox } : undefined,
        placedItem: l.placedItem ? { ...l.placedItem } : undefined,
        placedItemSource: l.placedItemSource,
        isAiResult: l.isAiResult,
        groupId: l.groupId,
        expanded: l.expanded,
      })),
      selectionSnapshot: {
        active: sel.active,
        maskData: sel.maskCanvas ? sel.maskCanvas.toDataURL() : null,
        bounds: sel.bounds ? { ...sel.bounds } : null,
      },
      adjustmentsSnapshot: FilterEngine.cloneAdjustments(adj),
      width: Math.max(16, snapW),
      height: Math.max(16, snapH),
    };
  }, [width, height]);

  const pushHistory = useCallback((description: string, specificLayers?: CanvasLayer[]) => {
    const targetLayers = specificLayers || layersRef.current;
    const snap = createHistorySnapshot(description, targetLayers, selectionRef.current, adjustmentsRef.current);
    const currIdx = historyIndexRef.current;

    setHistory(prev => {
      const newHist = prev.slice(0, currIdx + 1);
      newHist.push(snap);
      if (newHist.length > 40) newHist.shift();
      historyRef.current = newHist;
      const newIdx = newHist.length - 1;
      historyIndexRef.current = newIdx;
      setHistoryIndex(newIdx);
      return newHist;
    });
  }, [createHistorySnapshot]);

  const insertAboveSource = useCallback((current: CanvasLayer[], additions: CanvasLayer[], sourceLayerId?: string | null) => {
    const sourceId = sourceLayerId === undefined ? activeLayerId : sourceLayerId;
    const sourceIndex = sourceId ? current.findIndex(layer => layer.id === sourceId) : -1;
    const insertionIndex = sourceIndex >= 0 ? sourceIndex : 0;
    const sourceGroupId = sourceIndex >= 0 ? current[sourceIndex].groupId : undefined;
    const sourceGroup = sourceGroupId ? current.find(layer => layer.id === sourceGroupId) : undefined;
    additions.forEach(layer => {
      if (!layer.groupId && sourceGroupId) layer.groupId = sourceGroupId;
      if (sourceGroup?.locked) layer.locked = true;
    });
    const updated = [...current];
    updated.splice(insertionIndex, 0, ...additions);
    return updated;
  }, [activeLayerId]);

  // Add every new layer directly above the layer that produced it.
  const addLayer = useCallback((name: string, type: CanvasLayer['type'] = 'draw', imageElement?: HTMLImageElement | HTMLCanvasElement, sourceLayerId?: string | null): CanvasLayer => {
    const id = 'layer_' + Math.random().toString(36).substring(2, 9);
    const newLayer = CanvasEngine.createLayer(id, name, width, height, type);
    newLayer.isAiResult = /^AI\b/i.test(name);

    if (imageElement) {
      newLayer.ctx.drawImage(imageElement, 0, 0, width, height);
    }

    setLayers(prev => {
      const updated = insertAboveSource(prev, [newLayer], sourceLayerId);
      layersRef.current = updated;
      setActiveLayerId(id);
      pushHistory(`Add Layer: ${name}`, updated);
      return updated;
    });

    requestRender();
    return newLayer;
  }, [width, height, requestRender, pushHistory, insertAboveSource]);

  // Reset Canvas with new Base Image (atomic dimension update + single layer)
  const resetWithImage = useCallback((imageElement: HTMLImageElement | HTMLCanvasElement, name: string = 'Base Image'): CanvasLayer => {
    const w = imageElement instanceof HTMLImageElement ? (imageElement.naturalWidth || 1024) : imageElement.width;
    const h = imageElement instanceof HTMLImageElement ? (imageElement.naturalHeight || 1024) : imageElement.height;

    const safeW = Math.max(16, w);
    const safeH = Math.max(16, h);

    setWidthState(safeW);
    setHeightState(safeH);

    const id = 'layer_' + Math.random().toString(36).substring(2, 9);
    const newLayer = CanvasEngine.createLayer(id, name, safeW, safeH, 'image');
    newLayer.ctx.drawImage(imageElement, 0, 0, safeW, safeH);

    const initialLayers = [newLayer];
    layersRef.current = initialLayers;
    setLayers(initialLayers);
    setActiveLayerId(id);
    setSelectedLayerIds([]);

    const resetSel: SelectionState = {
      active: false,
      maskCanvas: null,
      bounds: null,
      feather: 0,
      mode: 'new',
      pathPoints: [],
    };
    setSelection(resetSel);
    selectionRef.current = resetSel;

    setAdjustmentsState(FilterEngine.cloneAdjustments(DEFAULT_ADJUSTMENTS));
    adjustmentsRef.current = FilterEngine.cloneAdjustments(DEFAULT_ADJUSTMENTS);

    // Immediately record baseline root snapshot at index 0
    const initialSnap: HistoryEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
      description: `Initial: ${name}`,
      layersSnapshot: [{
        id,
        name,
        type: 'image',
        visible: true,
        opacity: 1,
        blendMode: 'source-over',
        imageData: newLayer.canvas.toDataURL(),
        transform: { ...newLayer.transform },
      }],
      selectionSnapshot: {
        active: false,
      },
      adjustmentsSnapshot: FilterEngine.cloneAdjustments(DEFAULT_ADJUSTMENTS),
      width: safeW,
      height: safeH,
    };
    historyRef.current = [initialSnap];
    setHistory([initialSnap]);
    historyIndexRef.current = 0;
    setHistoryIndex(0);

    requestRender();
    return newLayer;
  }, [requestRender]);

  // Remove Layer
  const removeLayer = useCallback((id: string) => {
    setLayers(prev => {
      const target = prev.find(layer => layer.id === id);
      if (!target || target.locked) return prev;
      const removedIds = target.type === 'group'
        ? new Set([target.id, ...prev.filter(layer => layer.groupId === target.id).map(layer => layer.id)])
        : new Set([id]);
      const filtered = prev.filter(layer => !removedIds.has(layer.id));
      if (!filtered.some(layer => layer.type !== 'group')) return prev;
      layersRef.current = filtered;
      setSelectedLayerIds(current => current.filter(layerId => !removedIds.has(layerId)));
      if (removedIds.has(activeLayerId || '') && filtered.length > 0) {
        setActiveLayerId(filtered.find(layer => layer.type !== 'group')?.id || filtered[0].id);
      }
      pushHistory('Delete Layer', filtered);
      return filtered;
    });
    requestRender();
  }, [activeLayerId, requestRender, pushHistory]);

  // Duplicate Layer
  const duplicateLayer = useCallback((id: string) => {
    setLayers(prev => {
      const target = prev.find(l => l.id === id);
      if (!target) return prev;
      if (target.type === 'group') {
        const groupId = `group_${Date.now()}`;
        const group = CanvasEngine.createLayer(groupId, `${target.name} (Copy)`, widthRef.current, heightRef.current, 'group');
        group.expanded = target.expanded;
        group.opacity = target.opacity;
        group.visible = target.visible;
        const children = prev.filter(layer => layer.groupId === target.id).map((child, index) => {
          const copy = CanvasEngine.duplicateLayer(child, `layer_${Date.now()}_${index}`, `${child.name} (Copy)`);
          copy.groupId = groupId;
          return copy;
        });
        const targetIndex = prev.findIndex(layer => layer.id === id);
        const updated = [...prev];
        updated.splice(targetIndex, 0, group, ...children);
        layersRef.current = updated;
        setActiveLayerId(group.id);
        pushHistory('Duplicate Group', updated);
        return updated;
      }
      const newId = 'layer_' + Math.random().toString(36).substring(2, 9);
      const dup = CanvasEngine.duplicateLayer(target, newId, `${target.name} (Copy)`);
      const targetIdx = prev.findIndex(l => l.id === id);
      const updated = [...prev];
      updated.splice(targetIdx, 0, dup);
      layersRef.current = updated;
      setActiveLayerId(newId);
      pushHistory('Duplicate Layer', updated);
      return updated;
    });
    requestRender();
  }, [requestRender, pushHistory]);

  // Reorder Layers
  const reorderLayers = useCallback((startIndex: number, endIndex: number) => {
    setLayers(prev => {
      const source = prev[startIndex];
      const destination = prev[endIndex];
      if (!source || !destination || source.locked || source.id === destination.id) return prev;

      if (source.groupId) {
        if (source.groupId !== destination.groupId) return prev;
        const siblings = prev.filter(layer => layer.groupId === source.groupId);
        const reordered = siblings.filter(layer => layer.id !== source.id);
        const destinationIndex = reordered.findIndex(layer => layer.id === destination.id);
        reordered.splice(Math.max(0, destinationIndex), 0, source);
        const siblingIds = new Set(siblings.map(layer => layer.id));
        let siblingIndex = 0;
        const result = prev.map(layer => siblingIds.has(layer.id) ? reordered[siblingIndex++] : layer);
        layersRef.current = result;
        pushHistory('Reorder Layers', result);
        return result;
      }

      if (destination.groupId) return prev;
      const blocks = prev
        .filter(layer => !layer.groupId)
        .map(layer => layer.type === 'group'
          ? [layer, ...prev.filter(child => child.groupId === layer.id)]
          : [layer]);
      const sourceBlockIndex = blocks.findIndex(block => block.some(layer => layer.id === source.id));
      const destinationBlockIndex = blocks.findIndex(block => block.some(layer => layer.id === destination.id));
      if (sourceBlockIndex < 0 || destinationBlockIndex < 0) return prev;
      const [sourceBlock] = blocks.splice(sourceBlockIndex, 1);
      blocks.splice(destinationBlockIndex, 0, sourceBlock);
      const result = blocks.flat();
      layersRef.current = result;
      pushHistory('Reorder Layers', result);
      return result;
    });
    requestRender();
  }, [requestRender, pushHistory]);

  // Layer Properties
  const setLayerVisibility = useCallback((id: string, visible: boolean) => {
    setLayers(prev => {
      const updated = prev.map(l => l.id === id ? { ...l, visible } : l);
      layersRef.current = updated;
      pushHistory('Toggle Layer Visibility', updated);
      return updated;
    });
    requestRender();
  }, [requestRender, pushHistory]);

  const setLayerOpacity = useCallback((id: string, opacity: number) => {
    setLayers(prev => {
      const updated = prev.map(l => l.id === id ? { ...l, opacity } : l);
      layersRef.current = updated;
      return updated;
    });
    requestRender();
  }, [requestRender]);

  const setLayerBlendMode = useCallback((id: string, blendMode: CanvasLayer['blendMode']) => {
    setLayers(prev => {
      const updated = prev.map(l => l.id === id ? { ...l, blendMode } : l);
      layersRef.current = updated;
      pushHistory('Layer Blend Mode', updated);
      return updated;
    });
    requestRender();
  }, [requestRender, pushHistory]);

  // Merge Layer Down
  const mergeLayerDown = useCallback((id: string) => {
    setLayers(prev => {
      const idx = prev.findIndex(l => l.id === id);
      if (idx >= prev.length - 1) return prev; // Cannot merge bottom layer
      const top = prev[idx];
      const bottom = prev[idx + 1];
      if (top.locked || bottom.locked || top.type === 'group' || bottom.type === 'group') return prev;
      if (top.groupId !== bottom.groupId) return prev;
      const mergedCanvas = document.createElement('canvas');
      CanvasEngine.compositeLayers([{ ...top, groupId: undefined }, { ...bottom, groupId: undefined }], mergedCanvas, widthRef.current, heightRef.current);
      const merged = CanvasEngine.createLayer(bottom.id, `${bottom.name} + ${top.name}`, widthRef.current, heightRef.current, 'image');
      merged.ctx.drawImage(mergedCanvas, 0, 0);
      merged.groupId = bottom.groupId;
      const updated = prev.filter(layer => layer.id !== top.id).map(layer => layer.id === bottom.id ? merged : layer);
      layersRef.current = updated;
      setActiveLayerId(merged.id);
      pushHistory('Merge Layer Down', updated);
      return updated;
    });
    requestRender();
  }, [requestRender, pushHistory]);

  // Flip Layer
  const flipLayer = useCallback((id: string, axis: 'h' | 'v') => {
    setLayers(prev => {
      const updated = prev.map(layer => layer.id === id && !layer.locked
        ? RotationEngine.flipLayer(layer, axis, widthRef.current, heightRef.current)
        : layer);
      layersRef.current = updated;
      pushHistory(`Flip Layer ${axis.toUpperCase()}`, updated);
      return updated;
    });
    requestRender();
  }, [requestRender, pushHistory]);

  const setLayerLocked = useCallback((id: string, locked: boolean) => {
    setLayers(prev => {
      const updated = prev.map(layer => {
        if (layer.id === id || (prev.find(item => item.id === id)?.type === 'group' && layer.groupId === id)) {
          return { ...layer, locked };
        }
        return layer;
      });
      layersRef.current = updated;
      pushHistory(locked ? 'Lock Layer' : 'Unlock Layer', updated);
      return updated;
    });
    requestRender();
  }, [pushHistory, requestRender]);

  const toggleLayerSelected = useCallback((id: string) => {
    setSelectedLayerIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  }, []);

  const createLayerGroup = useCallback(() => {
    setLayers(prev => {
      const selected = selectedLayerIds.length
        ? prev.filter(layer => selectedLayerIds.includes(layer.id) && layer.type !== 'group')
        : prev.filter(layer => layer.id === activeLayerId && layer.type !== 'group');
      if (!selected.length) return prev;
      const selectedIds = new Set(selected.map(layer => layer.id));
      const insertionIndex = Math.min(...selected.map(layer => {
        const anchorId = layer.groupId || layer.id;
        return prev.findIndex(item => item.id === anchorId);
      }));
      const group = CanvasEngine.createLayer(`group_${Date.now()}`, 'Layer Group', widthRef.current, heightRef.current, 'group');
      group.expanded = true;
      const grouped = selected.map(layer => ({ ...layer, groupId: group.id }));
      const remainder = prev
        .filter(layer => !selectedIds.has(layer.id))
        .filter(layer => layer.type !== 'group' || prev.some(child => child.groupId === layer.id && !selectedIds.has(child.id)));
      remainder.splice(insertionIndex, 0, group, ...grouped);
      layersRef.current = remainder;
      setSelectedLayerIds([]);
      setActiveLayerId(group.id);
      pushHistory('Create Layer Group', remainder);
      return remainder;
    });
    requestRender();
  }, [activeLayerId, selectedLayerIds, pushHistory, requestRender]);

  const ungroupLayer = useCallback((groupId: string) => {
    setLayers(prev => {
      const groupIndex = prev.findIndex(layer => layer.id === groupId && layer.type === 'group');
      if (groupIndex < 0) return prev;
      const updated = prev.filter(layer => layer.id !== groupId).map(layer => layer.groupId === groupId ? { ...layer, groupId: undefined } : layer);
      layersRef.current = updated;
      setSelectedLayerIds(current => current.filter(layerId => layerId !== groupId));
      setActiveLayerId(updated[Math.min(groupIndex, updated.length - 1)]?.id || null);
      pushHistory('Ungroup Layers', updated);
      return updated;
    });
    requestRender();
  }, [pushHistory, requestRender]);

  const toggleGroupExpanded = useCallback((groupId: string) => {
    setLayers(prev => {
      const updated = prev.map(layer => layer.id === groupId ? { ...layer, expanded: layer.expanded === false } : layer);
      layersRef.current = updated;
      return updated;
    });
  }, []);

  const moveLayer = useCallback((id: string, direction: 'up' | 'down') => {
    setLayers(prev => {
      const target = prev.find(layer => layer.id === id);
      if (!target || target.locked) return prev;
      const updated = [...prev];
      if (target.groupId) {
        const siblings = updated.map((layer, index) => ({ layer, index })).filter(item => item.layer.groupId === target.groupId);
        const position = siblings.findIndex(item => item.layer.id === id);
        const other = siblings[position + (direction === 'up' ? -1 : 1)];
        if (!other) return prev;
        const targetIndex = updated.findIndex(layer => layer.id === id);
        [updated[targetIndex], updated[other.index]] = [updated[other.index], updated[targetIndex]];
      } else {
        const blocks: { ids: string[] }[] = [];
        for (const layer of updated) {
          if (layer.groupId) continue;
          blocks.push({ ids: layer.type === 'group' ? [layer.id, ...updated.filter(child => child.groupId === layer.id).map(child => child.id)] : [layer.id] });
        }
        const blockIndex = blocks.findIndex(block => block.ids.includes(id));
        const swapIndex = blockIndex + (direction === 'up' ? -1 : 1);
        if (blockIndex < 0 || swapIndex < 0 || swapIndex >= blocks.length) return prev;
        [blocks[blockIndex], blocks[swapIndex]] = [blocks[swapIndex], blocks[blockIndex]];
        const byId = new Map(updated.map(layer => [layer.id, layer]));
        const orderedIds = blocks.flatMap(block => block.ids);
        const groupedIds = new Set(orderedIds);
        const ordered = orderedIds.map(layerId => byId.get(layerId)!).filter(Boolean);
        updated.splice(0, updated.length, ...ordered, ...prev.filter(layer => !groupedIds.has(layer.id)));
      }
      layersRef.current = updated;
      pushHistory('Move Layer', updated);
      return updated;
    });
    requestRender();
  }, [pushHistory, requestRender]);

  const flipAllLayers = useCallback((axis: 'h' | 'v') => {
    setLayers(prev => {
      const updated = prev.map(layer => layer.locked ? layer : RotationEngine.flipLayer(
        layer,
        axis,
        widthRef.current,
        heightRef.current,
      ));
      layersRef.current = updated;
      pushHistory(`Flip Canvas ${axis.toUpperCase()}`, updated);
      return updated;
    });
    requestRender();
  }, [requestRender, pushHistory]);

  const rotateLayer = useCallback((id: string, degrees: number) => {
    setLayers(prev => {
      const updated = prev.map(layer => layer.id === id && !layer.locked
        ? RotationEngine.rotateLayer(
          layer,
          degrees,
          widthRef.current,
          heightRef.current,
          widthRef.current,
          heightRef.current,
        )
        : layer);
      layersRef.current = updated;
      pushHistory(`Rotate Layer ${degrees}°`, updated);
      return updated;
    });
    requestRender();
  }, [requestRender, pushHistory]);

  const rotateAllLayers = useCallback((degrees: number) => {
    if (degrees % 90 !== 0) return; // For simplicity, full canvas rotation is only supported in 90deg increments

    const oldWidth = widthRef.current;
    const oldHeight = heightRef.current;
    const isOddRightAngle = Math.abs(degrees) % 180 === 90;
    const newWidth = isOddRightAngle ? oldHeight : oldWidth;
    const newHeight = isOddRightAngle ? oldWidth : oldHeight;

    setDimensions(newWidth, newHeight);

    setLayers(prev => {
      const updated = prev.map(layer => layer.locked ? layer : RotationEngine.rotateLayer(
        layer,
        degrees,
        oldWidth,
        oldHeight,
        newWidth,
        newHeight,
      ));
      layersRef.current = updated;
      pushHistory(`Rotate Canvas ${degrees}°`, updated);
      return updated;
    });
    requestRender();
  }, [setDimensions, requestRender, pushHistory]);

  const straightenLayers = useCallback((degrees: number, scope: 'all' | 'active') => {
    const normalizedDegrees = Math.max(-15, Math.min(15, degrees));
    if (Math.abs(normalizedDegrees) < 0.01) return;

    const oldWidth = widthRef.current;
    const oldHeight = heightRef.current;
    const rotateAll = scope === 'all';
    const coverScale = RotationEngine.getStraightenCoverScale(oldWidth, oldHeight, normalizedDegrees);

    setLayers(prev => {
      const updated = prev.map(layer => {
        if (layer.locked || (!rotateAll && layer.id !== activeLayerId)) return layer;
        return RotationEngine.rotateLayer(
          layer,
          normalizedDegrees,
          oldWidth,
          oldHeight,
          oldWidth,
          oldHeight,
          coverScale,
        );
      });
      layersRef.current = updated;
      pushHistory(`Straighten ${rotateAll ? 'Canvas' : 'Layer'} ${normalizedDegrees.toFixed(1)}°`, updated);
      return updated;
    });
    setStraightenAngle(0);
    requestRender();
  }, [activeLayerId, requestRender, pushHistory]);

  const scaleLayer = useCallback((id: string, factor: number) => {
    setLayers(prev => {
      const updated = prev.map(l => {
        if (l.id !== id || l.locked) return l;
        const temp = document.createElement('canvas');
        temp.width = l.canvas.width;
        temp.height = l.canvas.height;
        const tCtx = temp.getContext('2d');
        if (tCtx) {
          tCtx.drawImage(l.canvas, 0, 0);
          l.ctx.clearRect(0, 0, l.canvas.width, l.canvas.height);
          l.ctx.save();
          // Scale around center
          l.ctx.translate(l.canvas.width / 2, l.canvas.height / 2);
          l.ctx.scale(factor, factor);
          l.ctx.translate(-l.canvas.width / 2, -l.canvas.height / 2);
          l.ctx.drawImage(temp, 0, 0);
          l.ctx.restore();
        }
        if (l.adjustmentMask) {
          const mask = MaskEngine.createMaskCanvas(l.adjustmentMask.width, l.adjustmentMask.height);
          const maskCtx = mask.getContext('2d');
          maskCtx?.translate(mask.width / 2, mask.height / 2);
          maskCtx?.scale(factor, factor);
          maskCtx?.translate(-mask.width / 2, -mask.height / 2);
          maskCtx?.drawImage(l.adjustmentMask, 0, 0);
          l.adjustmentMask = mask;
        }
        return l;
      });
      layersRef.current = updated;
      pushHistory(`Scale Layer ${Math.round(factor * 100)}%`, updated);
      return updated;
    });
    requestRender();
  }, [requestRender, pushHistory]);

  const scaleAllLayers = useCallback((factor: number) => {
    const newWidth = Math.round(widthRef.current * factor);
    const newHeight = Math.round(heightRef.current * factor);
    setDimensions(newWidth, newHeight);

    setLayers(prev => {
      const updated = prev.map(l => {
        if (l.locked) return l;
        const temp = document.createElement('canvas');
        temp.width = l.canvas.width;
        temp.height = l.canvas.height;
        temp.getContext('2d')?.drawImage(l.canvas, 0, 0);

        l.canvas.width = newWidth;
        l.canvas.height = newHeight;
        
        l.ctx.save();
        l.ctx.scale(factor, factor);
        l.ctx.drawImage(temp, 0, 0);
        l.ctx.restore();
        if (l.adjustmentMask) {
          const mask = MaskEngine.createMaskCanvas(newWidth, newHeight);
          mask.getContext('2d')?.drawImage(l.adjustmentMask, 0, 0, newWidth, newHeight);
          l.adjustmentMask = mask;
        }
        
        return l;
      });
      layersRef.current = updated;
      pushHistory(`Scale Canvas ${Math.round(factor * 100)}%`, updated);
      return updated;
    });
    requestRender();
  }, [setDimensions, requestRender, pushHistory]);

  // Selection actions
  const setSelectionMask = useCallback((maskCanvas: HTMLCanvasElement | null, bounds?: Rect | null) => {
    if (!maskCanvas) {
      const newSel: SelectionState = {
        active: false,
        maskCanvas: null,
        bounds: null,
        feather: 0,
        mode: 'new',
        pathPoints: [],
      };
      setSelection(newSel);
      selectionRef.current = newSel;
    } else {
      const calculatedBounds = bounds || MaskEngine.getMaskBounds(maskCanvas);
      const newSel: SelectionState = {
        active: !!calculatedBounds,
        maskCanvas,
        bounds: calculatedBounds,
        feather: 0,
        mode: 'new',
        pathPoints: [],
      };
      setSelection(newSel);
      selectionRef.current = newSel;
    }
    requestRender();
  }, [requestRender]);

  const clearSelection = useCallback(() => {
    setSelectionMask(null);
    pushHistory('Clear Selection');
  }, [setSelectionMask, pushHistory]);

  const invertSelection = useCallback(() => {
    if (!selectionRef.current.maskCanvas) {
      const mask = MaskEngine.createMaskCanvas(width, height);
      MaskEngine.applyRect(mask, { x: 0, y: 0, width, height }, 'new');
      setSelectionMask(mask);
    } else {
      MaskEngine.invertMask(selectionRef.current.maskCanvas);
      setSelectionMask(selectionRef.current.maskCanvas);
    }
    pushHistory('Invert Selection');
  }, [width, height, setSelectionMask, pushHistory]);

  const featherSelection = useCallback((radius: number) => {
    if (!selectionRef.current.maskCanvas || radius <= 0) return;
    const feathered = MaskEngine.featherMask(selectionRef.current.maskCanvas, radius);
    setSelectionMask(feathered);
    pushHistory('Feather Selection');
  }, [setSelectionMask, pushHistory]);

  const dilateErodeSelection = useCallback((amount: number) => {
    if (!selectionRef.current.maskCanvas || amount === 0) return;
    MaskEngine.dilateErodeMask(selectionRef.current.maskCanvas, amount);
    setSelectionMask(selectionRef.current.maskCanvas);
    pushHistory('Adjust Selection Boundary');
  }, [setSelectionMask, pushHistory]);

  // Text Tool State
  const [textProps, setTextPropsState] = useState<TextProperties>({
    text: '',
    fontFamily: 'Inter',
    fontSize: 48,
    fontWeight: 600,
    fontStyle: 'normal',
    textDecoration: 'none',
    textTransform: 'none',
    opacity: 100,
    color: '#ffffff',
    align: 'center',
    letterSpacing: 0,
    lineHeight: 1.2,
  });

  const setTextProps = useCallback((props: Partial<TextProperties>) => {
    setTextPropsState(prev => ({ ...prev, ...props }));
  }, []);

  const commitTextLayer = useCallback((props: TextProperties, box: TextBoxState, layerId?: string | null) => {
    if (!props.text.trim()) return;
    setLayers(prev => {
      const existingIndex = layerId ? prev.findIndex(layer => layer.id === layerId && layer.type === 'text') : -1;
      let updated: CanvasLayer[];
      let target: CanvasLayer;
      if (existingIndex >= 0) {
        target = CanvasEngine.duplicateLayer(prev[existingIndex], prev[existingIndex].id, `Text: ${props.text.slice(0, 18)}`);
        TextEngine.render(target, props, box);
        updated = prev.map((layer, index) => index === existingIndex ? target : layer);
      } else {
        target = CanvasEngine.createLayer(`text_${Date.now()}`, `Text: ${props.text.slice(0, 18)}`, widthRef.current, heightRef.current, 'text');
        TextEngine.render(target, props, box);
        updated = insertAboveSource(prev, [target], layerId);
      }
      layersRef.current = updated;
      setActiveLayerId(target.id);
      pushHistory(existingIndex >= 0 ? 'Edit Text Layer' : 'Add Text Layer', updated);
      return updated;
    });
    requestRender();
  }, [pushHistory, requestRender, insertAboveSource]);

  const addPlacedItem = useCallback((name: string, source: HTMLCanvasElement, dataUrl: string): CanvasLayer => {
    const layer = CanvasEngine.createLayer(`placed_${Date.now()}`, name, widthRef.current, heightRef.current, 'image');
    const scale = Math.min(1, widthRef.current * .55 / source.width, heightRef.current * .55 / source.height);
    const itemWidth = Math.max(32, source.width * scale);
    const itemHeight = Math.max(32, source.height * scale);
    const state: PlacedItemState = {
      x: (widthRef.current - itemWidth) / 2,
      y: (heightRef.current - itemHeight) / 2,
      width: itemWidth,
      height: itemHeight,
      rotation: 0,
      skewX: 0,
      skewY: 0,
      flipX: false,
      flipY: false,
    };
    layer.placedItemSource = dataUrl;
    layer.placedItemSourceCanvas = source;
    PlaceEngine.render(layer, source, state);
    setLayers(prev => {
      const updated = insertAboveSource(prev, [layer], activeLayerId);
      layersRef.current = updated;
      setActiveLayerId(layer.id);
      pushHistory(`Place Item: ${name}`, updated);
      return updated;
    });
    requestRender();
    return layer;
  }, [activeLayerId, pushHistory, requestRender, insertAboveSource]);

  const updatePlacedItem = useCallback((layerId: string, state: PlacedItemState, commit = false) => {
    setLayers(prev => {
      const updated = prev.map(layer => {
        if (layer.id !== layerId || layer.locked || !layer.placedItemSourceCanvas) return layer;
        PlaceEngine.render(layer, layer.placedItemSourceCanvas, state);
        return layer;
      });
      layersRef.current = updated;
      if (commit) pushHistory('Transform Placed Item', updated);
      return [...updated];
    });
    requestRender();
  }, [pushHistory, requestRender]);

  // Adjustments
  const setAdjustments = useCallback((newAdj: Partial<ImageAdjustments>) => {
    setAdjustmentsState(prev => {
      const updated = { ...prev, ...newAdj };
      adjustmentsRef.current = updated;
      return updated;
    });
    requestRender();
  }, [requestRender]);

  // Crop & Extend
  const [cropState, setCropState] = useState<CropExtendState | null>(null);

  const setGeometryMode = useCallback((mode: GeometryMode) => {
    setGeometryModeState(mode);
    setStraightenAngle(0);
    if (mode === 'crop') {
      setCropState({
        active: true,
        cropRect: { x: 0, y: 0, width: widthRef.current, height: heightRef.current },
        aspectRatio: null,
        rotation: 0,
        straightenAngle: 0,
        isExtending: false,
        originalDimensions: { width: widthRef.current, height: heightRef.current },
      });
    } else {
      setCropState(prev => prev?.isExtending ? prev : null);
    }
  }, []);

  const setPerspective = useCallback((settings: Partial<PerspectiveSettings>) => {
    setPerspectiveState(prev => {
      const updated = { ...prev, ...settings };
      perspectiveRef.current = updated;
      return updated;
    });
  }, []);

  const saveAdjustmentsAsLayers = useCallback(() => {
    const draft = adjustmentsRef.current;
    if (FilterEngine.isNeutral(draft)) return;

    let frozenMask: HTMLCanvasElement | undefined;
    if (adjustmentScope === 'selection' && selectionRef.current.maskCanvas) {
      const sourceMask = selectionRef.current.maskCanvas;
      const copy = MaskEngine.createMaskCanvas(widthRef.current, heightRef.current);
      copy.getContext('2d')?.drawImage(sourceMask, 0, 0);
      frozenMask = MaskEngine.featherMask(copy, Math.max(2, selectionRef.current.feather || 2));
    }

    const labels: Partial<Record<keyof ImageAdjustments, string>> = {
      exposure: 'Exposure', contrast: 'Contrast', highlights: 'Highlights', shadows: 'Shadows',
      whites: 'Whites', blacks: 'Blacks', temperature: 'Temperature', tint: 'Tint',
      vibrance: 'Vibrance', saturation: 'Saturation', texture: 'Texture', clarity: 'Clarity',
      dehaze: 'Dehaze', vignette: 'Vignette', sharpness: 'Sharpness', noiseReduction: 'Noise Reduction',
    };
    const newLayers: CanvasLayer[] = [];
    const makeLayer = (name: string, settings: ImageAdjustments) => {
      const layer = CanvasEngine.createLayer(`adjustment_${Date.now()}_${newLayers.length}`, name, widthRef.current, heightRef.current, 'adjustment');
      layer.adjustments = settings;
      if (frozenMask) {
        layer.adjustmentMask = MaskEngine.createMaskCanvas(widthRef.current, heightRef.current);
        layer.adjustmentMask.getContext('2d')?.drawImage(frozenMask, 0, 0);
      }
      newLayers.push(layer);
    };

    Object.entries(labels).forEach(([key, label]) => {
      const typedKey = key as keyof ImageAdjustments;
      const value = draft[typedKey];
      if (typeof value !== 'number' || value === 0) return;
      const settings = FilterEngine.cloneAdjustments(DEFAULT_ADJUSTMENTS);
      (settings[typedKey] as number) = value;
      makeLayer(`${label} ${value > 0 ? '+' : ''}${value}`, settings);
    });
    if (draft.toneCurve.some(point => point.x !== point.y)) {
      const settings = FilterEngine.cloneAdjustments(DEFAULT_ADJUSTMENTS);
      settings.toneCurve = draft.toneCurve.map(point => ({ ...point }));
      makeLayer('Tone Curve', settings);
    }
    if (Object.values(draft.hsl).some(value => value.hue || value.saturation || value.luminance)) {
      const settings = FilterEngine.cloneAdjustments(DEFAULT_ADJUSTMENTS);
      settings.hsl = FilterEngine.cloneAdjustments(draft).hsl;
      makeLayer('Color Mixer', settings);
    }
    if (draft.pointColor.enabled && (draft.pointColor.hue || draft.pointColor.saturation || draft.pointColor.luminance)) {
      const settings = FilterEngine.cloneAdjustments(DEFAULT_ADJUSTMENTS);
      settings.pointColor = { ...draft.pointColor };
      makeLayer('Point Color', settings);
    }
    if (!newLayers.length) return;
    const reset = FilterEngine.cloneAdjustments(DEFAULT_ADJUSTMENTS);
    adjustmentsRef.current = reset;
    setAdjustmentsState(reset);
    setLayers(prev => {
      const updated = insertAboveSource(prev, newLayers.reverse(), activeLayerId);
      layersRef.current = updated;
      pushHistory(`Save ${newLayers.length} Adjustment Layer${newLayers.length === 1 ? '' : 's'}`, updated);
      return updated;
    });
    setActiveLayerId(newLayers[0].id);
    requestRender();
  }, [activeLayerId, adjustmentScope, pushHistory, requestRender, insertAboveSource]);

  const addPerspectiveGuide = useCallback((guide: PerspectiveGuide) => {
    setPerspectiveState(prev => {
      const updated = { ...prev, guides: [...prev.guides, guide].slice(-8) };
      perspectiveRef.current = updated;
      return updated;
    });
    requestRender();
  }, [requestRender]);

  const clearPerspectiveGuides = useCallback(() => {
    setPerspective({ guides: [] });
  }, [setPerspective]);

  const resetPerspective = useCallback(() => {
    const reset = { ...defaultPerspective, mode: perspectiveRef.current.mode };
    perspectiveRef.current = reset;
    setPerspectiveState(reset);
    requestRender();
  }, [requestRender]);

  const autoPerspective = useCallback((sourceCanvas: HTMLCanvasElement) => {
    const detected = PerspectiveEngine.estimateAuto(sourceCanvas);
    setPerspective({ ...detected, mode: 'auto' });
  }, [setPerspective]);

  const applyPerspective = useCallback(() => {
    const settings = PerspectiveEngine.withGuidedCorrection(perspectiveRef.current, widthRef.current, heightRef.current);
    const targetAll = rotationScope === 'all';
    setLayers(prev => {
      const updated = prev.map(layer => {
        if (!targetAll && layer.id !== activeLayerId) return layer;
        return PerspectiveEngine.transformLayer(layer, widthRef.current, heightRef.current, settings);
      });
      if (settings.edgeMode === 'white') {
        const background = CanvasEngine.createLayer(
          `perspective_bg_${Date.now()}`,
          'Perspective Edge Background',
          widthRef.current,
          heightRef.current,
          'draw',
        );
        background.locked = true;
        background.ctx.fillStyle = '#ffffff';
        background.ctx.fillRect(0, 0, widthRef.current, heightRef.current);
        updated.push(background);
      }
      layersRef.current = updated;
      pushHistory(`Perspective ${settings.mode}`, updated);
      return updated;
    });
    setPerspectiveState(prev => {
      const reset = { ...defaultPerspective, mode: prev.mode };
      perspectiveRef.current = reset;
      return reset;
    });
    requestRender();
  }, [activeLayerId, rotationScope, requestRender, pushHistory]);

  const startCrop = useCallback(() => {
    setCropState({
      active: true,
      cropRect: { x: 0, y: 0, width: widthRef.current, height: heightRef.current },
      aspectRatio: null,
      rotation: 0,
      straightenAngle: 0,
      isExtending: false,
      originalDimensions: { width: widthRef.current, height: heightRef.current }
    });
  }, []);

  const updateCropRect = useCallback((rect: Rect) => {
    setCropState(prev => prev ? { ...prev, cropRect: rect } : null);
    requestRender();
  }, [requestRender]);

  const setCropAspectRatio = useCallback((ratio: string | null) => {
    setCropState(prev => {
      const curW = widthRef.current;
      const curH = heightRef.current;
      if (!prev) {
        return {
          active: true,
          cropRect: { x: 0, y: 0, width: curW, height: curH },
          aspectRatio: ratio,
          rotation: 0,
          straightenAngle: 0,
          isExtending: false,
          originalDimensions: { width: curW, height: curH }
        };
      }
      
      let targetRatio: number | null = null;
      if (ratio === 'original') targetRatio = curW / curH;
      else if (ratio === '1:1') targetRatio = 1;
      else if (ratio === '16:9') targetRatio = 16 / 9;
      else if (ratio === '9:16') targetRatio = 9 / 16;
      else if (ratio === '4:3') targetRatio = 4 / 3;
      else if (ratio === '3:4') targetRatio = 3 / 4;
      else if (ratio === '3:2') targetRatio = 3 / 2;
      else if (ratio === '2:3') targetRatio = 2 / 3;
      else if (ratio === '4:5') targetRatio = 4 / 5;
      else if (ratio === '5:4') targetRatio = 5 / 4;
      else if (ratio && ratio.includes(':')) {
        const parts = ratio.split(':').map(Number);
        if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
          targetRatio = parts[0] / parts[1];
        }
      } else if (ratio && !isNaN(Number(ratio)) && Number(ratio) > 0) {
        targetRatio = Number(ratio);
      }
      
      let newRect = { ...prev.cropRect };
      if (targetRatio) {
        let w = curW;
        let h = w / targetRatio;
        if (h > curH) {
          h = curH;
          w = h * targetRatio;
        }
        // Center inside canvas
        const x = Math.max(0, Math.round((curW - w) / 2));
        const y = Math.max(0, Math.round((curH - h) / 2));
        newRect = { x, y, width: Math.round(w), height: Math.round(h) };
      }
      
      return { ...prev, aspectRatio: ratio, cropRect: newRect };
    });
    requestRender();
  }, [requestRender]);

  const applyCrop = useCallback(() => {
    if (!cropState) return;
    const oldW = widthRef.current;
    const oldH = heightRef.current;
    const isOutpaint = cropState.isExtending;
    const frame = isOutpaint
      ? CropEngine.normalizeOutpaintRect(cropState.cropRect, oldW, oldH)
      : CropEngine.normalizeRect(cropState.cropRect, oldW, oldH);

    if (isOutpaint && !CropEngine.hasOutpaintArea(frame, oldW, oldH)) return;

    const offset = CropEngine.getPixelPreservingOffset(frame);
    const { width: newW, height: newH } = frame;

    setDimensions(newW, newH);
    if (isOutpaint && (frame.x !== 0 || frame.y !== 0)) {
      setPan(prev => ({
        x: prev.x + frame.x * zoom,
        y: prev.y + frame.y * zoom,
      }));
    }

    setLayers(prev => {
      const updated = prev.map(layer => {
        // Bake the layer's current transform into old-canvas coordinates first.
        const renderedLayer = document.createElement('canvas');
        renderedLayer.width = oldW;
        renderedLayer.height = oldH;
        const renderedCtx = renderedLayer.getContext('2d');
        if (renderedCtx) CanvasEngine.renderLayer(renderedCtx, layer);

        const croppedLayer = CanvasEngine.createLayer(layer.id, layer.name, newW, newH, layer.type);
        croppedLayer.visible = layer.visible;
        croppedLayer.locked = layer.locked;
        croppedLayer.opacity = layer.opacity;
        croppedLayer.blendMode = layer.blendMode;
        croppedLayer.adjustments = layer.adjustments ? FilterEngine.cloneAdjustments(layer.adjustments) : undefined;
        if (layer.adjustmentMask) {
          croppedLayer.adjustmentMask = MaskEngine.createMaskCanvas(newW, newH);
          croppedLayer.adjustmentMask.getContext('2d')?.drawImage(layer.adjustmentMask, offset.x, offset.y);
        }
        croppedLayer.textProps = layer.textProps ? { ...layer.textProps } : undefined;
        croppedLayer.textBox = layer.textBox ? {
          ...layer.textBox,
          x: layer.textBox.x + offset.x,
          y: layer.textBox.y + offset.y,
        } : undefined;
        croppedLayer.placedItem = layer.placedItem ? {
          ...layer.placedItem,
          x: layer.placedItem.x + offset.x,
          y: layer.placedItem.y + offset.y,
        } : undefined;
        croppedLayer.placedItemSource = layer.placedItemSource;
        croppedLayer.placedItemSourceCanvas = layer.placedItemSourceCanvas;
        croppedLayer.shapeProps = layer.shapeProps ? { ...layer.shapeProps } : undefined;
        croppedLayer.isAiResult = layer.isAiResult;
        croppedLayer.groupId = layer.groupId;
        croppedLayer.expanded = layer.expanded;

        // Reframe at 1:1 pixel scale. The destination canvas performs any clipping.
        croppedLayer.ctx.drawImage(renderedLayer, offset.x, offset.y);
        return croppedLayer;
      });

      if (isOutpaint) {
        const whiteBackground = CanvasEngine.createLayer(
          `outpaint_bg_${Date.now()}`,
          'Outpaint Background',
          newW,
          newH,
          'draw',
        );
        whiteBackground.locked = true;
        whiteBackground.ctx.fillStyle = '#ffffff';
        whiteBackground.ctx.fillRect(0, 0, newW, newH);
        whiteBackground.ctx.clearRect(offset.x, offset.y, oldW, oldH);
        updated.push(whiteBackground);

        const mask = MaskEngine.createMaskCanvas(newW, newH);
        MaskEngine.applyRect(mask, { x: 0, y: 0, width: newW, height: newH }, 'new');
        mask.getContext('2d')?.clearRect(offset.x, offset.y, oldW, oldH);
        setSelectionMask(mask, MaskEngine.getMaskBounds(mask));
      }

      layersRef.current = updated;
      pushHistory(`${isOutpaint ? 'Create Outpaint Area' : 'Crop Canvas'} (${newW}×${newH})`, updated);
      return updated;
    });

    if (!isOutpaint) clearSelection();
    setCropState(null);
    if (!isOutpaint) setActiveToolState('rotate');
    requestRender();
  }, [cropState, setDimensions, setSelectionMask, clearSelection, zoom, requestRender, pushHistory]);

  const cancelCrop = useCallback(() => {
    const isOutpaint = cropState?.isExtending;
    setCropState(null);
    setActiveTool(isOutpaint ? 'select' : 'rotate');
    requestRender();
  }, [cropState, setActiveTool, requestRender]);

  const extendCanvas = useCallback((direction: 'top' | 'bottom' | 'left' | 'right', pixels: number) => {
    const oldW = widthRef.current;
    const oldH = heightRef.current;
    
    let newW = oldW;
    let newH = oldH;
    let dx = 0;
    let dy = 0;
    
    if (direction === 'top') { newH += pixels; dy = pixels; }
    if (direction === 'bottom') { newH += pixels; }
    if (direction === 'left') { newW += pixels; dx = pixels; }
    if (direction === 'right') { newW += pixels; }
    
    setDimensions(newW, newH);
    
    setLayers(prev => {
      const updated = prev.map(l => {
        const temp = document.createElement('canvas');
        temp.width = newW;
        temp.height = newH;
        const tCtx = temp.getContext('2d');
        if (tCtx) {
          tCtx.drawImage(l.canvas, dx, dy);
          l.canvas.width = newW;
          l.canvas.height = newH;
          l.ctx.drawImage(temp, 0, 0);
        }
        if (l.adjustmentMask) {
          const mask = MaskEngine.createMaskCanvas(newW, newH);
          mask.getContext('2d')?.drawImage(l.adjustmentMask, dx, dy);
          l.adjustmentMask = mask;
        }
        return l;
      });
      layersRef.current = updated;
      pushHistory(`Extend Canvas ${direction}`, updated);
      return updated;
    });
    requestRender();
  }, [setDimensions, requestRender, pushHistory]);

  const resetAdjustments = useCallback(() => {
    const reset = FilterEngine.cloneAdjustments(DEFAULT_ADJUSTMENTS);
    setAdjustmentsState(reset);
    adjustmentsRef.current = reset;
    requestRender();
    pushHistory('Reset Adjustments');
  }, [requestRender, pushHistory]);

  // Reset Viewport
  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Undo / Redo
  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const restoreHistoryIndex = useCallback((targetIndex: number) => {
    const hist = historyRef.current;
    if (targetIndex < 0 || targetIndex >= hist.length) return;
    const snap = hist[targetIndex];

    const safeW = Math.max(16, snap.width);
    const safeH = Math.max(16, snap.height);

    const layerPromises = snap.layersSnapshot.map(s => {
      return new Promise<CanvasLayer>((resolve) => {
        const layer = CanvasEngine.createLayer(s.id, s.name, safeW, safeH, s.type);
        layer.visible = s.visible;
        layer.opacity = s.opacity;
        layer.blendMode = s.blendMode;
        layer.locked = s.locked ?? false;
        layer.isAiResult = s.isAiResult;
        layer.groupId = s.groupId;
        layer.expanded = s.expanded;
        layer.transform = { ...s.transform };
        if (s.adjustments) layer.adjustments = FilterEngine.cloneAdjustments(s.adjustments);
        if (s.textProps) layer.textProps = { ...s.textProps };
        if (s.textBox) layer.textBox = { ...s.textBox };
        if (s.placedItem) layer.placedItem = { ...s.placedItem };
        if (s.placedItemSource) layer.placedItemSource = s.placedItemSource;

        const restoreMask = () => {
          if (!s.adjustmentMaskData) {
            resolve(layer);
            return;
          }
          const maskImg = new Image();
          maskImg.onload = () => {
            layer.adjustmentMask = MaskEngine.createMaskCanvas(safeW, safeH);
            layer.adjustmentMask.getContext('2d')?.drawImage(maskImg, 0, 0, safeW, safeH);
            resolve(layer);
          };
          maskImg.onerror = () => resolve(layer);
          maskImg.src = s.adjustmentMaskData;
        };
        const restoreLayerImage = () => {
          if (!s.placedItemSource) {
            restoreMask();
            return;
          }
          const sourceImage = new Image();
          sourceImage.onload = () => {
            const sourceCanvas = document.createElement('canvas');
            sourceCanvas.width = sourceImage.naturalWidth || sourceImage.width;
            sourceCanvas.height = sourceImage.naturalHeight || sourceImage.height;
            sourceCanvas.getContext('2d')?.drawImage(sourceImage, 0, 0);
            layer.placedItemSourceCanvas = sourceCanvas;
            restoreMask();
          };
          sourceImage.onerror = restoreMask;
          sourceImage.src = s.placedItemSource;
        };

        if (s.imageData && s.imageData.startsWith('data:image')) {
          const img = new Image();
          img.onload = () => {
            layer.ctx.clearRect(0, 0, safeW, safeH);
            layer.ctx.drawImage(img, 0, 0, safeW, safeH);
            restoreLayerImage();
          };
          img.onerror = restoreLayerImage;
          img.src = s.imageData;
        } else {
          restoreLayerImage();
        }
      });
    });

    Promise.all(layerPromises).then(restoredLayers => {
      setWidthState(safeW);
      setHeightState(safeH);
      setLayers(restoredLayers);
      layersRef.current = restoredLayers;
      setSelectedLayerIds([]);
      if (restoredLayers.length > 0) {
        setActiveLayerId(prev => restoredLayers.some(l => l.id === prev) ? prev : restoredLayers[0].id);
      }

      if (snap.adjustmentsSnapshot) {
        setAdjustmentsState(FilterEngine.cloneAdjustments(snap.adjustmentsSnapshot));
        adjustmentsRef.current = FilterEngine.cloneAdjustments(snap.adjustmentsSnapshot);
      }

      if (snap.selectionSnapshot?.active && snap.selectionSnapshot.maskData) {
        const maskImg = new Image();
        maskImg.onload = () => {
          const maskCanvas = MaskEngine.createMaskCanvas(safeW, safeH);
          const mCtx = maskCanvas.getContext('2d');
          if (mCtx) {
            mCtx.drawImage(maskImg, 0, 0, safeW, safeH);
            const newSel: SelectionState = {
              active: true,
              maskCanvas,
              bounds: snap.selectionSnapshot?.bounds || MaskEngine.getMaskBounds(maskCanvas),
              feather: 0,
              mode: 'new',
              pathPoints: [],
            };
            setSelection(newSel);
            selectionRef.current = newSel;
          }
          requestRender();
        };
        maskImg.src = snap.selectionSnapshot.maskData;
      } else {
        const newSel: SelectionState = {
          active: false,
          maskCanvas: null,
          bounds: null,
          feather: 0,
          mode: 'new',
          pathPoints: [],
        };
        setSelection(newSel);
        selectionRef.current = newSel;
      }

      historyIndexRef.current = targetIndex;
      setHistoryIndex(targetIndex);
      requestRender();
    });
  }, [requestRender]);

  const undo = useCallback(() => {
    const idx = historyIndexRef.current;
    if (idx > 0) {
      restoreHistoryIndex(idx - 1);
    }
  }, [restoreHistoryIndex]);

  const redo = useCallback(() => {
    const idx = historyIndexRef.current;
    const hist = historyRef.current;
    if (idx < hist.length - 1) {
      restoreHistoryIndex(idx + 1);
    }
  }, [restoreHistoryIndex]);

  // Apply AI Preview
  const applyAiPreview = useCallback(() => {
    if (!aiPreviewImage) return;
    const img = new Image();
    img.onload = () => {
      addLayer('AI Result', 'image', img);
      setAiPreviewImage(null);
      clearSelection();
    };
    img.src = aiPreviewImage;
  }, [aiPreviewImage, addLayer, clearSelection]);

  const discardAiPreview = useCallback(() => {
    setAiPreviewImage(null);
  }, []);

  return {
    width,
    height,
    setDimensions,

    layers,
    activeLayerId,
    setActiveLayerId,
    addLayer,
    resetWithImage,
    removeLayer,
    duplicateLayer,
    reorderLayers,
    setLayerVisibility,
    setLayerOpacity,
    setLayerBlendMode,
    setLayerLocked,
    selectedLayerIds,
    toggleLayerSelected,
    createLayerGroup,
    ungroupLayer,
    toggleGroupExpanded,
    moveLayer,
    mergeLayerDown,
    flipLayer,
    flipAllLayers,
    rotateLayer,
    rotateAllLayers,
    straightenLayers,
    scaleLayer,
    scaleAllLayers,

    activeTool,
    setActiveTool,
    rotationScope,
    setRotationScope,
    straightenAngle,
    setStraightenAngle,
    geometryMode,
    setGeometryMode,
    perspective,
    setPerspective,
    addPerspectiveGuide,
    clearPerspectiveGuides,
    autoPerspective,
    applyPerspective,
    resetPerspective,
    selectSubTool,
    setSelectSubTool,
    drawSubTool,
    setDrawSubTool,

    textProps,
    setTextProps,
    commitTextLayer,
    addPlacedItem,
    updatePlacedItem,

    cropState,
    startCrop,
    updateCropRect,
    setCropAspectRatio,
    applyCrop,
    cancelCrop,
    extendCanvas,

    brushSize,
    setBrushSize,
    brushHardness,
    setBrushHardness,
    brushOpacity,
    setBrushOpacity,
    brushColor,
    setBrushColor,

    selection,
    setSelectionMask,
    clearSelection,
    invertSelection,
    featherSelection,
    dilateErodeSelection,

    adjustments,
    setAdjustments,
    resetAdjustments,
    adjustmentScope,
    setAdjustmentScope,
    saveAdjustmentsAsLayers,
    pointColorPicking,
    setPointColorPicking,
    adjustmentDragging,
    setAdjustmentDragging,

    zoom,
    setZoom,
    pan,
    setPan,
    resetView,

    canUndo,
    canRedo,
    undo,
    redo,
    pushHistory,
    history,
    historyIndex,
    restoreHistoryIndex,

    isComparing,
    setIsComparing,

    aiPreviewImage,
    setAiPreviewImage,
    applyAiPreview,
    discardAiPreview,

    renderTrigger,
    requestRender,
  };
}
