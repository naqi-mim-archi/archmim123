import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Upload,
  Image as ImageIcon,
  Layers as LayersIcon,
  ChevronLeft,
  Check,
  Maximize2,
  Plus,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Eye,
  Undo2,
  Redo2,
} from 'lucide-react';
import { useRasterCanvasState } from '../state/useRasterCanvasStore';
import { RasterSidebar } from './RasterSidebar';
import { SelectionFloatingBar } from './SelectionFloatingBar';
import { SelectionPromptBar } from './SelectionPromptBar';
import { AiEditModal } from './AiEditModal';
import { ExportModal } from './ExportModal';
import { TextOverlay } from './TextOverlay';
import { RotateOverlay } from './RotateOverlay';
import { PerspectiveOverlay } from './PerspectiveOverlay';
import { CropOverlay } from './CropOverlay';
import { PlaceOverlay } from './PlaceOverlay';
import { CanvasEngine } from '../core/CanvasEngine';
import { MaskEngine } from '../core/MaskEngine';
import { FilterEngine } from '../core/FilterEngine';
import { PlaceImportEngine } from '../core/PlaceImportEngine';
import { shouldLoadInitialRasterImage } from '../core/RasterImageLifecycle';
import { RasterAiService } from '../services/rasterAiService';
import { AiCanvasRegistrationEngine } from '../core/AiCanvasRegistrationEngine';
import { Point, Rect, TextBoxState } from '../types/canvas';
import type { AiActionType } from '../types/aiEdit';

export interface StudioImageItem {
  id: string;
  name: string;
  url: string;
  category?: string;
}

interface RasterCanvasViewProps {
  isOpen?: boolean;
  initialImageBase64?: string;
  availableStudioImages?: StudioImageItem[];
  onBackToCanvas?: (editedImageBase64?: string) => void;
}

const PENCIL_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M4 20h4L19 9l-4-4L4 16v4Z' fill='%23f8fafc' stroke='%230f172a' stroke-width='1.6' stroke-linejoin='round'/%3E%3Cpath d='m13.5 6.5 4 4' fill='none' stroke='%230f172a' stroke-width='1.6'/%3E%3C/svg%3E") 4 20, crosshair`;

export const RasterCanvasView: React.FC<RasterCanvasViewProps> = ({
  isOpen = true,
  initialImageBase64,
  availableStudioImages = [],
  onBackToCanvas,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const committedCompositeRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const placeFileInputRef = useRef<HTMLInputElement>(null);
  // Stores original image dataURL for the Compare toggle
  const originalImageRef = useRef<string | null>(null);
  // Canvas size changes must not reload and scale the original source after a crop.
  const loadedInitialImageRef = useRef<string | null>(null);
  const initialCompositeRef = useRef<string | null>(null);

  const store = useRasterCanvasState(1024, 1024);

  // Modals & Panels UI State
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [aiModalPrompt, setAiModalPrompt] = useState<string>('');
  const [aiModalAction, setAiModalAction] = useState<AiActionType>('replace');
  const [aiModalMask, setAiModalMask] = useState<string | null>(null);
  const [aiModalBaseImage, setAiModalBaseImage] = useState<string | null>(null);
  const [aiModalReferenceImage, setAiModalReferenceImage] = useState<string | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isStudioModalOpen, setIsStudioModalOpen] = useState<boolean>(false);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);
  const [hasUserImage, setHasUserImage] = useState<boolean>(false);
  const [committedRevision, setCommittedRevision] = useState(0);

  // Interaction State
  const isMouseDownRef = useRef<boolean>(false);
  const isRightMouseDownRef = useRef<boolean>(false);
  const rightDragStartRef = useRef<{ x: number; y: number; startSize: number; startHardness: number } | null>(null);
  const dragStartRef = useRef<Point | null>(null);
  const lastPointRef = useRef<Point | null>(null);
  const lassoPointsRef = useRef<Point[]>([]);
  const isPanningRef = useRef<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const scribbleRenderFrameRef = useRef<number | null>(null);

  // Function to load any image onto the canvas and auto-fit view
  const loadImageToCanvas = useCallback((imageSrc: string, layerName = 'Base Image', asNewLayer = false) => {
    const handleImageElement = (img: HTMLImageElement) => {
      const w = img.naturalWidth || 1024;
      const h = img.naturalHeight || 1024;

      if (!asNewLayer || !hasUserImage || store.layers.length === 0) {
        initialCompositeRef.current = null;
        store.resetWithImage(img, layerName);

        // Store the original image dataURL so Compare works
        if (!originalImageRef.current) {
          originalImageRef.current = imageSrc;
        }

        // Auto-fit zoom to container
        if (containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          const scaleX = (rect.width * 0.88) / w;
          const scaleY = (rect.height * 0.88) / h;
          const initialZoom = Math.max(0.05, Math.min(3.0, Math.min(scaleX, scaleY)));
          store.setZoom(initialZoom);
          store.setPan({
            x: (rect.width - w * initialZoom) / 2,
            y: (rect.height - h * initialZoom) / 2,
          });
        }
        setHasUserImage(true);
      } else {
        store.addLayer(layerName, 'image', img);
        requestAnimationFrame(() => {
          store.pushHistory(`Add Layer: ${layerName}`);
        });
      }
    };

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => handleImageElement(img);
    img.onerror = () => {
      // Fallback for CORS or blob URLs
      if (imageSrc.startsWith('http')) {
        fetch(imageSrc)
          .then(res => res.blob())
          .then(blob => {
            const objectUrl = URL.createObjectURL(blob);
            const fallbackImg = new Image();
            fallbackImg.onload = () => {
              handleImageElement(fallbackImg);
              URL.revokeObjectURL(objectUrl);
            };
            fallbackImg.src = objectUrl;
          })
          .catch(() => {
            const fallbackImg2 = new Image();
            fallbackImg2.onload = () => handleImageElement(fallbackImg2);
            fallbackImg2.src = imageSrc;
          });
      } else {
        const fallbackImg = new Image();
        fallbackImg.onload = () => handleImageElement(fallbackImg);
        fallbackImg.src = imageSrc;
      }
    };
    img.src = imageSrc;
  }, [hasUserImage, store]);

  // Function to calculate optimal zoom and center canvas perfectly in viewport
  const fitAndCenterCanvas = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const padding = 0.85; // 85% of container dimensions
        const scaleX = (rect.width * padding) / store.width;
        const scaleY = (rect.height * padding) / store.height;
        const fitZoom = Math.max(0.1, Math.min(2.5, Math.min(scaleX, scaleY)));
        store.setZoom(fitZoom);
        store.setPan({
          x: (rect.width - store.width * fitZoom) / 2,
          y: (rect.height - store.height * fitZoom) / 2,
        });
      }
    }
  }, [store.width, store.height, store.setZoom, store.setPan]);

  // Load initial image or initialize blank canvas centered in viewport
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (initialImageBase64) {
      if (shouldLoadInitialRasterImage(loadedInitialImageRef.current, initialImageBase64)) {
        // Mark synchronously so rerenders cannot start a duplicate asynchronous load.
        loadedInitialImageRef.current = initialImageBase64;
        loadImageToCanvas(initialImageBase64, 'Canvas Image', false);
      }
    } else if (store.layers.length === 0) {
      loadedInitialImageRef.current = null;
      // Default blank canvas
      const blank = store.addLayer('Background', 'draw');
      blank.ctx.fillStyle = '#ffffff';
      blank.ctx.fillRect(0, 0, store.width, store.height);
      timer = setTimeout(() => {
        fitAndCenterCanvas();
      }, 50);
    } else {
      timer = setTimeout(() => {
        fitAndCenterCanvas();
      }, 50);
    }
    
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [initialImageBase64, fitAndCenterCanvas]);

  // File Upload Handlers
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        loadImageToCanvas(event.target.result, file.name, true);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = ''; // Reset input
  };

  const importPlacedFiles = async (files: File[]) => {
    for (const file of files) {
      if (!PlaceImportEngine.supports(file)) continue;
      const imported = await PlaceImportEngine.decode(file);
      store.addPlacedItem(imported.name, imported.canvas, imported.dataUrl);
    }
    if (files.some(PlaceImportEngine.supports)) store.setActiveTool('place');
  };

  const handlePlaceFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    void importPlacedFiles(Array.from(event.target.files || []));
    event.target.value = '';
  };

  // Drag & Drop Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    void importPlacedFiles(Array.from(e.dataTransfer.files || []));
  };

  // Rebuild the expensive committed layer stack only when document content changes.
  useEffect(() => {
    if (!committedCompositeRef.current) committedCompositeRef.current = document.createElement('canvas');
    CanvasEngine.compositeLayers(store.layers, committedCompositeRef.current, store.width, store.height);
    setCommittedRevision(revision => revision + 1);
  }, [store.layers, store.width, store.height, store.renderTrigger]);

  useEffect(() => {
    if (!hasUserImage || initialCompositeRef.current || !committedCompositeRef.current) return;
    initialCompositeRef.current = committedCompositeRef.current.toDataURL('image/png');
  }, [hasUserImage, committedRevision]);

  // Draft adjustments are rendered separately so slider movement never recomposites saved layers.
  useEffect(() => {
    const canvas = compositeCanvasRef.current;
    const committed = committedCompositeRef.current;
    if (!canvas || !committed) return;
    let cancelled = false;
    let frame = 0;
    if (store.isComparing && originalImageRef.current) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const origImg = new Image();
        origImg.onload = () => {
          if (cancelled) return;
          canvas.width = store.width;
          canvas.height = store.height;
          ctx.clearRect(0, 0, store.width, store.height);
          ctx.drawImage(origImg, 0, 0, store.width, store.height);
        };
        origImg.src = originalImageRef.current;
        return () => { cancelled = true; };
      }
    }

    frame = requestAnimationFrame(() => {
      if (cancelled) return;
      canvas.width = store.width;
      canvas.height = store.height;
      const hasDraft = store.activeTool === 'adjust' && !FilterEngine.isNeutral(store.adjustments);
      if (!hasDraft) {
        canvas.getContext('2d')?.drawImage(committed, 0, 0);
        return;
      }

      const previewScale = store.adjustmentDragging
        ? Math.min(1, 640 / Math.max(store.width, store.height))
        : 1;
      const previewWidth = Math.max(1, Math.round(store.width * previewScale));
      const previewHeight = Math.max(1, Math.round(store.height * previewScale));
      const source = document.createElement('canvas');
      source.width = previewWidth;
      source.height = previewHeight;
      source.getContext('2d')?.drawImage(committed, 0, 0, previewWidth, previewHeight);

      let previewMask: HTMLCanvasElement | null = null;
      if (store.adjustmentScope === 'selection' && store.selection.maskCanvas) {
        previewMask = document.createElement('canvas');
        previewMask.width = previewWidth;
        previewMask.height = previewHeight;
        previewMask.getContext('2d')?.drawImage(store.selection.maskCanvas, 0, 0, previewWidth, previewHeight);
      }
      const adjusted = document.createElement('canvas');
      FilterEngine.applyAdjustments(source, adjusted, store.adjustments, previewMask);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(adjusted, 0, 0, store.width, store.height);
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [committedRevision, store.adjustments, store.adjustmentScope, store.adjustmentDragging, store.selection.maskCanvas, store.activeTool, store.width, store.height, store.isComparing]);

  // Marching Ants / Selection Overlay Render Loop
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    overlay.width = store.width;
    overlay.height = store.height;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (store.selection.active && store.selection.maskCanvas) {
      // Render selection outline with semi-transparent indigo fill
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.drawImage(store.selection.maskCanvas, 0, 0);

      // Only draw the dashed bounding rectangle if using the rectangular selection tool
      if (store.selectSubTool === 'rect' && store.selection.bounds) {
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        const b = store.selection.bounds;
        ctx.strokeRect(b.x, b.y, b.width, b.height);
      }
      ctx.restore();
    }
  }, [store.selection, store.width, store.height, store.renderTrigger, store.selectSubTool]);

  // Trigger re-render when compare mode toggles so the canvas redraws immediately
  useEffect(() => {
    store.requestRender();
  }, [store.isComparing]);

  // Coordinate Conversion Helper (Exact 1:1 Pixel Mapping from rendered canvas)
  const getCanvasCoords = useCallback((e: React.MouseEvent): Point => {
    const canvas = compositeCanvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          x: (e.clientX - rect.left) * (store.width / rect.width),
          y: (e.clientY - rect.top) * (store.height / rect.height),
        };
      }
    }
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return CanvasEngine.screenToCanvas(e.clientX, e.clientY, rect, store.zoom, store.pan);
  }, [store.width, store.height, store.zoom, store.pan]);

  const scheduleScribbleRender = () => {
    if (scribbleRenderFrameRef.current !== null) return;
    scribbleRenderFrameRef.current = requestAnimationFrame(() => {
      scribbleRenderFrameRef.current = null;
      store.requestRender();
    });
  };

  const paintScribbleSegment = (from: Point, to: Point) => {
    const activeLayer = store.layers.find(layer => layer.id === store.activeLayerId);
    if (!activeLayer || !activeLayer.visible || activeLayer.locked) return;

    const paint = (ctx: CanvasRenderingContext2D) => {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = store.brushSize;
      if (store.drawSubTool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
      } else {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = store.brushColor;
        ctx.globalAlpha = store.brushOpacity / 100;
      }
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
      ctx.restore();
    };

    paint(activeLayer.ctx);

    const transform = activeLayer.transform;
    const activeLayerIndex = store.layers.findIndex(layer => layer.id === activeLayer.id);
    const hasVisibleContentAbove = store.layers
      .slice(0, Math.max(0, activeLayerIndex))
      .some(layer => layer.visible && layer.type !== 'group');
    const canPreviewDirectly = store.drawSubTool !== 'eraser'
      && !store.isComparing
      && !hasVisibleContentAbove
      && !activeLayer.groupId
      && !activeLayer.adjustments
      && activeLayer.opacity === 1
      && activeLayer.blendMode === 'source-over'
      && transform.x === 0
      && transform.y === 0
      && transform.scaleX === 1
      && transform.scaleY === 1
      && transform.rotation === 0
      && !transform.flipH
      && !transform.flipV
      && transform.skewX === 0
      && transform.skewY === 0
      && !transform.corners;
    const previewContext = canPreviewDirectly ? compositeCanvasRef.current?.getContext('2d') : null;
    if (previewContext) paint(previewContext);
    else scheduleScribbleRender();
  };

  // Pointer Down
  const handleMouseDown = (e: React.MouseEvent) => {
    // Middle click or Spacebar = Pan
    if (e.button === 1 || e.altKey || (e.button === 0 && e.shiftKey && store.activeTool === 'transform')) {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX - store.pan.x, y: e.clientY - store.pan.y };
      return;
    }

    // Right Click = Photoshop-style Quick Brush Adjust
    if (e.button === 2) {
      e.preventDefault();
      isRightMouseDownRef.current = true;
      rightDragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        startSize: store.brushSize,
        startHardness: store.brushHardness,
      };
      return;
    }

    if (e.button !== 0) return; // Left click only

    if (store.activeTool === 'adjust' && store.pointColorPicking) {
      const point = getCanvasCoords(e);
      const canvas = compositeCanvasRef.current;
      const ctx = canvas?.getContext('2d', { willReadFrequently: true });
      if (canvas && ctx && point.x >= 0 && point.y >= 0 && point.x < store.width && point.y < store.height) {
        const pixel = ctx.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data;
        const [targetHue] = FilterEngine.rgbToHsl(pixel[0], pixel[1], pixel[2]);
        store.setAdjustments({ pointColor: { ...store.adjustments.pointColor, enabled: true, targetHue } });
      }
      store.setPointColorPicking(false);
      return;
    }

    isMouseDownRef.current = true;
    const pt = getCanvasCoords(e);
    dragStartRef.current = pt;
    lastPointRef.current = pt;

    // Tool specific mousedown
    if (store.activeTool === 'select') {
      if (store.selectSubTool === 'rect') {
        // Start rect marquee
      } else if (store.selectSubTool === 'lasso') {
        lassoPointsRef.current = [pt];
      } else if (store.selectSubTool === 'brush') {
        let mask = store.selection.maskCanvas;
        if (!mask) mask = MaskEngine.createMaskCanvas(store.width, store.height);
        MaskEngine.paintBrushStroke(mask, pt, pt, store.brushSize, 'add');
        store.setSelectionMask(mask);
      } else if (store.selectSubTool === 'magic') {
        const composite = compositeCanvasRef.current;
        if (composite) {
          let mask = store.selection.maskCanvas;
          if (!mask) mask = MaskEngine.createMaskCanvas(store.width, store.height);
          MaskEngine.magicWandSelect(composite, mask, pt.x, pt.y, 32, 'new');
          store.setSelectionMask(mask);
          requestAnimationFrame(() => store.pushHistory('Magic Wand Selection'));
        }
      }
    } else if (store.activeTool === 'draw') {
      paintScribbleSegment(pt, pt);
    }
  };

  // Pointer Move
  const handleMouseMove = (e: React.MouseEvent) => {
    // 1. Panning
    if (isPanningRef.current) {
      store.setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    // 2. Photoshop Right-Drag Quick Brush Sizing
    if (isRightMouseDownRef.current && rightDragStartRef.current) {
      const dx = e.clientX - rightDragStartRef.current.x;
      const dy = rightDragStartRef.current.y - e.clientY;

      const newSize = Math.max(2, Math.min(200, Math.round(rightDragStartRef.current.startSize + dx * 0.5)));
      const newHardness = Math.max(0, Math.min(100, Math.round(rightDragStartRef.current.startHardness + dy * 0.5)));

      store.setBrushSize(newSize);
      store.setBrushHardness(newHardness);
      return;
    }

    if (!isMouseDownRef.current) return;
    const pt = getCanvasCoords(e);

    // 3. Selection tool dragging
    if (store.activeTool === 'select') {
      if (store.selectSubTool === 'rect' && dragStartRef.current) {
        const x = Math.min(dragStartRef.current.x, pt.x);
        const y = Math.min(dragStartRef.current.y, pt.y);
        const w = Math.abs(pt.x - dragStartRef.current.x);
        const h = Math.abs(pt.y - dragStartRef.current.y);

        const mask = MaskEngine.createMaskCanvas(store.width, store.height);
        MaskEngine.applyRect(mask, { x, y, width: w, height: h }, 'new');
        store.setSelectionMask(mask, { x, y, width: w, height: h });
      } else if (store.selectSubTool === 'lasso') {
        lassoPointsRef.current.push(pt);
      } else if (store.selectSubTool === 'brush' && lastPointRef.current) {
        let mask = store.selection.maskCanvas;
        if (!mask) mask = MaskEngine.createMaskCanvas(store.width, store.height);
        MaskEngine.paintBrushStroke(mask, lastPointRef.current, pt, store.brushSize, 'add');
        store.setSelectionMask(mask);
      }
    } else if (store.activeTool === 'transform' && store.selection.active && store.selection.bounds && lastPointRef.current) {
      // Transform drag: move selection mask by delta
      const dx = pt.x - lastPointRef.current.x;
      const dy = pt.y - lastPointRef.current.y;

      if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
        const oldBounds = store.selection.bounds;
        const newBounds = {
          x: oldBounds.x + dx,
          y: oldBounds.y + dy,
          width: oldBounds.width,
          height: oldBounds.height,
        };
        const newMask = MaskEngine.createMaskCanvas(store.width, store.height);
        MaskEngine.applyRect(newMask, newBounds, 'new');
        store.setSelectionMask(newMask, newBounds);
      }
    } else if (store.activeTool === 'draw' && lastPointRef.current) {
      paintScribbleSegment(lastPointRef.current, pt);
    }

    lastPointRef.current = pt;
  };

  // Pointer Up
  const handleMouseUp = () => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
    }

    if (isRightMouseDownRef.current) {
      isRightMouseDownRef.current = false;
      rightDragStartRef.current = null;
    }

    if (isMouseDownRef.current) {
      isMouseDownRef.current = false;

      // Selection tools history
      if (store.activeTool === 'select') {
        if (store.selectSubTool === 'lasso' && lassoPointsRef.current.length > 2) {
          const mask = MaskEngine.createMaskCanvas(store.width, store.height);
          MaskEngine.applyPolygon(mask, lassoPointsRef.current, 'new');
          store.setSelectionMask(mask);
          lassoPointsRef.current = [];
          requestAnimationFrame(() => store.pushHistory('Lasso Selection'));
        } else if (store.selectSubTool === 'brush' && store.selection.maskCanvas) {
          requestAnimationFrame(() => store.pushHistory('Brush Mask Selection'));
        } else if (store.selectSubTool === 'rect' && store.selection.maskCanvas) {
          requestAnimationFrame(() => store.pushHistory('Rect Selection'));
        }
      }

      if (store.activeTool === 'draw') {
        if (scribbleRenderFrameRef.current !== null) {
          cancelAnimationFrame(scribbleRenderFrameRef.current);
          scribbleRenderFrameRef.current = null;
        }
        store.requestRender();
        requestAnimationFrame(() => store.pushHistory(store.drawSubTool === 'eraser' ? 'Eraser Stroke' : 'Scribble Stroke'));
      }

      if (store.activeTool === 'transform' && store.selection.active) {
        requestAnimationFrame(() => store.pushHistory('Move Selection'));
      }
    }
  };

  // Wheel Zoom — centered on cursor position (7-8x reduced sensitivity for precise control)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.015 : 0.985;
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    const mouseX = e.clientX - containerRect.left;
    const mouseY = e.clientY - containerRect.top;
    store.setZoom(prev => {
      const newZoom = Math.max(0.05, Math.min(8, prev * zoomFactor));
      // Adjust pan so zoom is centered on cursor
      store.setPan(p => ({
        x: mouseX - (mouseX - p.x) * (newZoom / prev),
        y: mouseY - (mouseY - p.y) * (newZoom / prev),
      }));
      return newZoom;
    });
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.stopPropagation();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        e.stopPropagation();
        store.redo();
      } else if (e.key === '[') {
        store.setBrushSize(prev => Math.max(2, prev - 4));
      } else if (e.key === ']') {
        store.setBrushSize(prev => Math.min(200, prev + 4));
      } else if (e.key === 'Escape') {
        if (store.selection.active) {
          store.clearSelection();
        } else if (store.activeTool === 'select') {
          store.setActiveTool('draw');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store.undo, store.redo, store.setBrushSize, store.clearSelection, store.setActiveTool, store.selection.active, store.activeTool]);

  useEffect(() => {
    if (store.activeTool !== 'draw') return;
    const active = store.layers.find(layer => layer.id === store.activeLayerId);
    if (!active || active.type !== 'draw' || active.locked) {
      store.addLayer('Scribble', 'draw', undefined, active?.id);
    }
  }, [store.activeTool, store.activeLayerId]);

  const activeTextLayer = store.activeTool === 'text'
    ? store.layers.find(layer => layer.id === store.activeLayerId && layer.type === 'text' && !layer.locked)
    : undefined;
  const textTargetRef = useRef<string>('');

  useEffect(() => {
    if (store.activeTool !== 'text') {
      textTargetRef.current = '';
      return;
    }
    const targetKey = activeTextLayer?.id || 'new';
    if (textTargetRef.current === targetKey) return;
    textTargetRef.current = targetKey;
    if (activeTextLayer?.textProps) store.setTextProps(activeTextLayer.textProps);
    else store.setTextProps({ text: '' });
  }, [store.activeTool, store.activeLayerId, activeTextLayer?.id]);

  const handleCommitText = (box: TextBoxState) => {
    if (!store.textProps.text.trim()) return;
    store.commitTextLayer(store.textProps, box, activeTextLayer?.id);
    store.setActiveTool('select');
  };

  // Contextual Cutout Action
  const handleCutout = () => {
    const composite = compositeCanvasRef.current;
    if (!store.selection.maskCanvas || !composite) return;

    const w = composite.width;
    const h = composite.height;

    const cutoutCanvas = document.createElement('canvas');
    cutoutCanvas.width = w;
    cutoutCanvas.height = h;
    const cCtx = cutoutCanvas.getContext('2d')!;

    // Draw current composite then clip to selection mask
    cCtx.drawImage(composite, 0, 0);
    cCtx.globalCompositeOperation = 'destination-in';
    cCtx.drawImage(store.selection.maskCanvas, 0, 0, w, h);
    cCtx.globalCompositeOperation = 'source-over';

    const dataUrl = cutoutCanvas.toDataURL('image/png');
    const img = new Image();
    img.onload = () => {
      store.addLayer('Subject Cutout', 'image', img);
      store.clearSelection();
      requestAnimationFrame(() => store.pushHistory('Cutout Subject'));
    };
    img.src = dataUrl;
  };

  // Delete Selection Pixels
  const handleDeleteSelection = () => {
    if (!store.selection.maskCanvas) return;
    const activeLayer = store.layers.find(l => l.id === store.activeLayerId);
    if (!activeLayer || activeLayer.locked) return;

    activeLayer.ctx.save();
    activeLayer.ctx.globalCompositeOperation = 'destination-out';
    activeLayer.ctx.drawImage(store.selection.maskCanvas, 0, 0);
    activeLayer.ctx.restore();

    store.clearSelection();
    store.requestRender();
    requestAnimationFrame(() => store.pushHistory('Delete Selection Pixels'));
  };

  const handleInvertSelection = () => {
    if (!store.selection.active || !store.selection.maskCanvas) return;
    const mask = store.selection.maskCanvas;
    const ctx = mask.getContext('2d');
    if (!ctx) return;
    const imgData = ctx.getImageData(0, 0, mask.width, mask.height);
    const data = imgData.data;
    for (let i = 3; i < data.length; i += 4) {
      data[i] = 255 - data[i];
    }
    ctx.putImageData(imgData, 0, 0);
    store.requestRender();
    requestAnimationFrame(() => store.pushHistory('Invert Selection'));
  };

  const handleGenerateOutpaint = async (prompt: string, model: string) => {
    const composite = compositeCanvasRef.current;
    const mask = store.selection.maskCanvas;
    if (!composite || !mask) throw new Error('Create an outpaint area before generating.');

    const prepared = AiCanvasRegistrationEngine.prepareRequest(composite, mask);

    const result = await RasterAiService.executeAiEdit({
      action: 'outpaint',
      baseImageBase64: prepared.baseCanvas.toDataURL('image/png'),
      maskBase64: MaskEngine.exportInpaintingMaskBase64(prepared.maskCanvas),
      userPrompt: prompt,
      model,
      aspectRatio: prepared.registration.aspectRatio,
    });

    const generatedImage = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('The generated outpaint image could not be loaded.'));
      image.src = result.base64 || result.imageUrl;
    });

    const transparentBase = document.createElement('canvas');
    transparentBase.width = store.width;
    transparentBase.height = store.height;
    const registeredResult = AiCanvasRegistrationEngine.extractRegisteredResult(generatedImage, prepared.registration);
    const alignedResult = AiCanvasRegistrationEngine.alignGeneratedToBase(registeredResult, composite, mask);
    const isolatedOutpaint = MaskEngine.blendInpaintingResult(transparentBase, alignedResult, mask, true, 1);
    const layer = store.addLayer('AI Outpaint', 'image', isolatedOutpaint);
    layer.isAiResult = true;
    store.clearSelection();
    store.requestRender();
  };

  const openAiEdit = (
    prompt = '',
    action: AiActionType = 'replace',
    maskBase64?: string,
    baseImageBase64?: string,
    referenceImageBase64?: string,
  ) => {
    setAiModalPrompt(prompt);
    setAiModalAction(action);
    setAiModalMask(maskBase64 || null);
    setAiModalBaseImage(baseImageBase64 || null);
    setAiModalReferenceImage(referenceImageBase64 || null);
    setIsAiModalOpen(true);
  };

  const getCanvasCursor = () => {
    if (store.activeTool === 'select') {
      if (store.selectSubTool === 'brush') return 'cursor-cell';
      return 'cursor-crosshair';
    }
    if (store.activeTool === 'transform') return 'cursor-move';
    return 'cursor-crosshair';
  };

  const handleBackToCanvas = useCallback(() => {
    if (!onBackToCanvas) return;
    const currentComposite = committedCompositeRef.current?.toDataURL('image/png');
    const hasCommittedEdits = Boolean(
      currentComposite &&
      initialCompositeRef.current &&
      currentComposite !== initialCompositeRef.current
    );
    onBackToCanvas(hasCommittedEdits ? currentComposite : undefined);
  }, [onBackToCanvas]);

  const handleWorkspaceBack = useCallback(() => {
    if (isAiModalOpen) {
      setIsAiModalOpen(false);
      return;
    }
    if (isExportModalOpen) {
      setIsExportModalOpen(false);
      return;
    }
    if (isStudioModalOpen) {
      setIsStudioModalOpen(false);
      return;
    }
    handleBackToCanvas();
  }, [isAiModalOpen, isExportModalOpen, isStudioModalOpen, handleBackToCanvas]);

  useEffect(() => {
    if (!isOpen || !onBackToCanvas) return;
    const handleAppBack = (event: Event) => {
      const detail = (event as CustomEvent<{ priority: number; action?: () => void }>).detail;
      if (detail && detail.priority < 20) {
        detail.priority = 20;
        detail.action = handleWorkspaceBack;
      }
      event.preventDefault();
    };
    const handleEscapeBack = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || (!isAiModalOpen && !isExportModalOpen && !isStudioModalOpen)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      handleWorkspaceBack();
    };
    window.addEventListener('archai:navigate-back', handleAppBack);
    window.addEventListener('keydown', handleEscapeBack, true);
    return () => {
      window.removeEventListener('archai:navigate-back', handleAppBack);
      window.removeEventListener('keydown', handleEscapeBack, true);
    };
  }, [isOpen, onBackToCanvas, isAiModalOpen, isExportModalOpen, isStudioModalOpen, handleWorkspaceBack]);

  return (
    <div className="flex h-full w-full bg-slate-950 text-slate-200 select-none overflow-hidden relative">
      {/* Hidden File Input for Image Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept="image/png,image/jpeg,image/webp,image/avif"
        className="hidden"
      />
      <input
        type="file"
        ref={placeFileInputRef}
        onChange={handlePlaceFileInputChange}
        accept="image/png,image/jpeg,image/webp,image/avif,image/gif,application/pdf"
        multiple
        className="hidden"
      />

      {/* 1. Left Vertical Sidebar (Tools, Upload, Prompts, Presets, Adjustments, Layers) */}
      <RasterSidebar
        store={store}
        hasUserImage={hasUserImage}
        onUploadClick={() => fileInputRef.current?.click()}
        onPlaceUpload={() => placeFileInputRef.current?.click()}
        availableStudioImages={availableStudioImages}
        onOpenStudioModal={() => setIsStudioModalOpen(true)}
        onOpenAiEdit={openAiEdit}
        onGenerateOutpaint={handleGenerateOutpaint}
        onExportClick={() => setIsExportModalOpen(true)}
        compositeCanvasRef={compositeCanvasRef}
        onDeleteSelection={handleDeleteSelection}
        onCutout={handleCutout}
        onInvertSelection={handleInvertSelection}
      />

      {/* 2. Central Pan/Zoom Canvas Workspace */}
      <div className="flex-1 flex flex-col h-full relative overflow-hidden bg-slate-950">
        
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onContextMenu={e => e.preventDefault()}
          className={`flex-1 h-full relative overflow-hidden bg-slate-950 ${getCanvasCursor()}`}
          style={{
            backgroundImage: 'radial-gradient(rgba(0, 113, 227, 0.18) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            cursor: store.activeTool === 'draw' ? PENCIL_CURSOR : undefined,
          }}
        >
          {/* Drag Over Visual Highlight */}
          {isDragOver && (
            <div className="absolute inset-4 z-40 border-2 border-dashed border-indigo-500 bg-indigo-950/70 rounded-2xl flex flex-col items-center justify-center gap-3 backdrop-blur-sm pointer-events-none animate-in fade-in duration-150">
              <Upload size={36} className="text-indigo-400 animate-bounce" />
              <p className="text-sm font-bold text-white">Drop images or a PDF to place as editable layers</p>
            </div>
          )}

          {/* Transformed Canvas Container (Positioned absolutely at top-0 left-0, panned & scaled) */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: `${store.width}px`,
              height: `${store.height}px`,
              transform: `translate(${store.pan.x}px, ${store.pan.y}px) scale(${store.zoom})`,
              transformOrigin: '0 0',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            }}
            className="border border-slate-800 bg-slate-900 shrink-0"
          >
            {/* Primary Composite Canvas */}
            <canvas
              ref={compositeCanvasRef}
              width={store.width}
              height={store.height}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />

            {/* Selection & Marching Ants Overlay Canvas */}
            <canvas
              ref={overlayCanvasRef}
              width={store.width}
              height={store.height}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />

            {!store.isComparing && store.activeTool === 'rotate' && store.geometryMode === 'rotate' && <RotateOverlay store={store} />}
            {!store.isComparing && store.activeTool === 'rotate' && store.geometryMode === 'perspective' && <PerspectiveOverlay store={store} />}
            {!store.isComparing && store.activeTool === 'place' && <PlaceOverlay store={store} />}
            
            {/* Text Overlay */}
            <TextOverlay 
              active={!store.isComparing && store.activeTool === 'text'}
              canvasWidth={store.width}
              canvasHeight={store.height}
              textProps={store.textProps}
              initialBox={activeTextLayer?.textBox}
              onTextChange={text => store.setTextProps({ text })}
              onCommit={handleCommitText}
              onCancel={() => store.setActiveTool('select')}
            />

            {/* Crop Overlay */}
            {!store.isComparing && ((store.activeTool === 'rotate' && store.geometryMode === 'crop') || store.activeTool === 'outpaint' || (store.cropState?.isExtending && store.cropState.active)) && (
              <CropOverlay store={store} />
            )}
          </div>

          {/* Floating Contextual Pill above selection */}
          {store.selection.active && store.activeTool !== 'outpaint' && store.activeTool !== 'rotate' && (
            <SelectionFloatingBar
              bounds={store.selection.bounds}
              zoom={store.zoom}
              pan={store.pan}
              onOpenAiEdit={() => openAiEdit()}
              onTransform={() => store.setActiveTool('transform')}
              onCutout={handleCutout}
              onClear={store.clearSelection}
            />
          )}

          {store.selection.active && store.activeTool === 'select' && (
            <SelectionPromptBar
              bounds={store.selection.bounds}
              zoom={store.zoom}
              pan={store.pan}
              onGenerate={(prompt, action) => openAiEdit(prompt, action as AiActionType)}
            />
          )}

          {/* Floating Bottom-Right Viewport Controls (Zoom, Fit, Compare) */}
          <div className="absolute bottom-4 right-4 flex items-center gap-1.5 bg-slate-900/90 border border-slate-800/80 p-1 rounded-xl backdrop-blur-md shadow-2xl z-20 text-xs">
            <button
              onClick={store.undo}
              disabled={!store.canUndo}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-300"
              title="Undo last image edit (Ctrl+Z)"
            >
              <Undo2 size={14} />
              <span>Undo</span>
            </button>
            <button
              onClick={store.redo}
              disabled={!store.canRedo}
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-bold text-slate-300 transition-colors hover:bg-slate-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-300"
              title="Redo last image edit (Ctrl+Y)"
            >
              <Redo2 size={14} />
              <span>Redo</span>
            </button>
            <div className="mx-0.5 h-4 w-[1px] bg-slate-800" />
            <button
              onClick={() => store.setZoom(z => Math.min(5, z * 1.2))}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn size={14} />
            </button>
            <span className="text-[10px] font-mono text-slate-400 w-10 text-center">
              {Math.round(store.zoom * 100)}%
            </span>
            <button
              onClick={() => store.setZoom(z => Math.max(0.2, z / 1.2))}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut size={14} />
            </button>
            <div className="h-4 w-[1px] bg-slate-800 mx-0.5" />
            <button
              onClick={fitAndCenterCanvas}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Fit to Screen"
            >
              <Maximize2 size={14} />
            </button>
            <button
              onClick={() => store.setZoom(1)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
              title="Reset 100%"
            >
              <RotateCcw size={14} />
            </button>
            {originalImageRef.current && (
              <>
                <div className="h-4 w-[1px] bg-slate-800 mx-0.5" />
                <button
                  onMouseDown={() => store.setIsComparing(true)}
                  onMouseUp={() => store.setIsComparing(false)}
                  onMouseLeave={() => store.setIsComparing(false)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer ${
                    store.isComparing
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                  title="Hold to compare with original image"
                >
                  <Eye size={12} />
                  <span>Compare</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Load from render outputs modal */}
      {isStudioModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div className="flex items-center gap-2">
                <ImageIcon size={16} className="text-purple-400" />
                <h3 className="text-sm font-bold text-slate-100">Load Render Output</h3>
              </div>
              <button
                onClick={() => setIsStudioModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {availableStudioImages.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => {
                      loadImageToCanvas(item.url, item.name, true);
                      setIsStudioModalOpen(false);
                    }}
                    className="group relative rounded-xl overflow-hidden border border-slate-800 hover:border-indigo-500 bg-slate-950 p-2 cursor-pointer transition-all hover:scale-102 shadow-sm"
                  >
                    <div className="aspect-square w-full rounded-lg overflow-hidden bg-slate-900 mb-2 flex items-center justify-center">
                      <img src={item.url} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="text-[11px] font-semibold text-slate-200 truncate group-hover:text-indigo-300">
                      {item.name}
                    </div>
                    {item.category && (
                      <div className="text-[9px] text-slate-500 uppercase font-bold">
                        {item.category}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <AiEditModal
        isOpen={isAiModalOpen}
        onClose={() => {
          setIsAiModalOpen(false);
          setAiModalMask(null);
          setAiModalBaseImage(null);
          setAiModalReferenceImage(null);
        }}
        baseImageBase64={aiModalBaseImage || compositeCanvasRef.current?.toDataURL('image/png') || ''}
        referenceImageBase64={aiModalReferenceImage || undefined}
        maskBase64={
          aiModalMask ||
          (store.selection.maskCanvas
            ? MaskEngine.exportInpaintingMaskBase64(store.selection.maskCanvas)
            : '')
        }
        initialPrompt={aiModalPrompt}
        initialAction={aiModalAction}
        onApplyResult={(newImageBase64) => {
          const image = new Image();
          image.onload = () => {
            const mask = store.selection.maskCanvas;
            const source = compositeCanvasRef.current || document.createElement('canvas');
            const generated = document.createElement('canvas');
            generated.width = store.width;
            generated.height = store.height;
            generated.getContext('2d')?.drawImage(image, 0, 0, store.width, store.height);
            const layerImage = mask
              ? MaskEngine.blendInpaintingResult(
                  source,
                  generated,
                  mask,
                  true,
                  aiModalAction === 'scribble'
                    ? Math.max(4, Math.round(Math.min(store.width, store.height) * 0.008))
                    : 1,
                )
              : generated;
            const label = aiModalAction === 'remove' ? 'AI Object Removal'
              : aiModalAction === 'replace' ? 'AI Replacement'
                : aiModalAction === 'material' ? 'AI Material'
                  : aiModalAction === 'add' ? 'AI Added Element'
                    : 'AI Edit';
            store.addLayer(label, 'image', layerImage, store.activeLayerId);
            store.clearSelection();
          };
          image.src = newImageBase64;
        }}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        layers={store.layers}
        width={store.width}
        height={store.height}
      />
    </div>
  );
};
