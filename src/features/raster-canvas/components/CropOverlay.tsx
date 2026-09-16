import React, { useState, useEffect, useRef } from 'react';
import {
  Check,
  X,
  RotateCcw,
} from 'lucide-react';
import { RasterCanvasStore } from '../state/useRasterCanvasStore';
import { Rect } from '../types/canvas';

interface CropOverlayProps {
  store: RasterCanvasStore;
}

type DragHandle = 
  | 'center'
  | 'nw'
  | 'ne'
  | 'sw'
  | 'se'
  | 'n'
  | 's'
  | 'w'
  | 'e';

export const CropOverlay: React.FC<CropOverlayProps> = ({ store }) => {
  const { cropState, width: canvasW, height: canvasH, zoom } = store;
  const [activeHandle, setActiveHandle] = useState<DragHandle | null>(null);
  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    rect: Rect;
    handle: DragHandle;
  } | null>(null);

  // Keyboard shortcut listener: Enter to apply, Escape to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        store.applyCrop();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        store.cancelCrop();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store]);

  if (!cropState || !cropState.active) {
    return null;
  }

  const { cropRect, aspectRatio } = cropState;
  const { x, y, width: rectW, height: rectH } = cropRect;
  const isOutpaint = cropState.isExtending;

  // Parse numeric target aspect ratio if locked
  const getTargetRatio = (): number | null => {
    if (!aspectRatio || aspectRatio === 'free') return null;
    if (aspectRatio === 'original') return canvasW / canvasH;
    if (aspectRatio === '1:1') return 1;
    if (aspectRatio === '16:9') return 16 / 9;
    if (aspectRatio === '9:16') return 9 / 16;
    if (aspectRatio === '4:3') return 4 / 3;
    if (aspectRatio === '3:4') return 3 / 4;
    if (aspectRatio === '3:2') return 3 / 2;
    if (aspectRatio === '2:3') return 2 / 3;
    if (aspectRatio === '4:5') return 4 / 5;
    if (aspectRatio === '5:4') return 5 / 4;
    if (aspectRatio.includes(':')) {
      const parts = aspectRatio.split(':').map(Number);
      if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
        return parts[0] / parts[1];
      }
    }
    const num = parseFloat(aspectRatio);
    return !isNaN(num) && num > 0 ? num : null;
  };

  const handlePointerDown = (e: React.PointerEvent, handle: DragHandle) => {
    e.preventDefault();
    e.stopPropagation();
    
    setActiveHandle(handle);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      rect: { ...cropRect },
      handle,
    };

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch (_) {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeHandle || !dragStartRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const { clientX: startX, clientY: startY, rect: startRect, handle } = dragStartRef.current;
    const currentZoom = zoom || 1;

    // Convert mouse movement delta from screen space to canvas image coordinates
    const deltaX = (e.clientX - startX) / currentZoom;
    const deltaY = (e.clientY - startY) / currentZoom;

    const minDim = 24;
    const targetRatio = getTargetRatio();

    if (handle === 'center') {
      if (isOutpaint) return;
      // Reposition the entire crop window
      let newX = startRect.x + deltaX;
      let newY = startRect.y + deltaY;

      // Clamp so crop box stays completely within canvas
      newX = Math.max(0, Math.min(canvasW - startRect.width, newX));
      newY = Math.max(0, Math.min(canvasH - startRect.height, newY));

      store.updateCropRect({
        ...startRect,
        x: Math.round(newX),
        y: Math.round(newY),
      });
      return;
    }

    // Handle corner and edge resizes
    let newLeft = startRect.x;
    let newTop = startRect.y;
    let newRight = startRect.x + startRect.width;
    let newBottom = startRect.y + startRect.height;

    // 1. Calculate unconstrained raw bounds from active handle
    if (isOutpaint) {
      const maxHorizontalExtension = canvasW;
      const maxVerticalExtension = canvasH;
      if (handle.includes('w')) {
        newLeft = Math.max(-maxHorizontalExtension, Math.min(0, startRect.x + deltaX));
      }
      if (handle.includes('e')) {
        newRight = Math.min(canvasW + maxHorizontalExtension, Math.max(canvasW, startRect.x + startRect.width + deltaX));
      }
      if (handle.includes('n')) {
        newTop = Math.max(-maxVerticalExtension, Math.min(0, startRect.y + deltaY));
      }
      if (handle.includes('s')) {
        newBottom = Math.min(canvasH + maxVerticalExtension, Math.max(canvasH, startRect.y + startRect.height + deltaY));
      }
    } else {
      if (handle.includes('w')) {
        newLeft = Math.max(0, Math.min(startRect.x + startRect.width - minDim, startRect.x + deltaX));
      }
      if (handle.includes('e')) {
        newRight = Math.min(canvasW, Math.max(startRect.x + minDim, startRect.x + startRect.width + deltaX));
      }
      if (handle.includes('n')) {
        newTop = Math.max(0, Math.min(startRect.y + startRect.height - minDim, startRect.y + deltaY));
      }
      if (handle.includes('s')) {
        newBottom = Math.min(canvasH, Math.max(startRect.y + minDim, startRect.y + startRect.height + deltaY));
      }
    }

    let updatedW = newRight - newLeft;
    let updatedH = newBottom - newTop;

    // 2. Apply aspect ratio constraints if locked
    if (targetRatio && !isOutpaint) {
      if (handle === 'nw') {
        const calcW = updatedH * targetRatio;
        if (newRight - calcW >= 0) {
          updatedW = calcW;
          newLeft = newRight - updatedW;
        } else {
          updatedW = newRight;
          newLeft = 0;
          updatedH = updatedW / targetRatio;
          newTop = newBottom - updatedH;
        }
      } else if (handle === 'ne') {
        const calcW = updatedH * targetRatio;
        if (newLeft + calcW <= canvasW) {
          updatedW = calcW;
          newRight = newLeft + updatedW;
        } else {
          updatedW = canvasW - newLeft;
          newRight = canvasW;
          updatedH = updatedW / targetRatio;
          newTop = newBottom - updatedH;
        }
      } else if (handle === 'sw') {
        const calcW = updatedH * targetRatio;
        if (newRight - calcW >= 0) {
          updatedW = calcW;
          newLeft = newRight - updatedW;
        } else {
          updatedW = newRight;
          newLeft = 0;
          updatedH = updatedW / targetRatio;
          newBottom = newTop + updatedH;
        }
      } else if (handle === 'se') {
        const calcW = updatedH * targetRatio;
        if (newLeft + calcW <= canvasW) {
          updatedW = calcW;
          newRight = newLeft + updatedW;
        } else {
          updatedW = canvasW - newLeft;
          newRight = canvasW;
          updatedH = updatedW / targetRatio;
          newBottom = newTop + updatedH;
        }
      } else if (handle === 'n' || handle === 's') {
        updatedW = updatedH * targetRatio;
        const centerX = startRect.x + startRect.width / 2;
        newLeft = Math.max(0, centerX - updatedW / 2);
        if (newLeft + updatedW > canvasW) {
          newLeft = canvasW - updatedW;
        }
        if (newLeft < 0) {
          newLeft = 0;
          updatedW = canvasW;
          updatedH = updatedW / targetRatio;
          if (handle === 'n') newTop = newBottom - updatedH;
          else newBottom = newTop + updatedH;
        }
      } else if (handle === 'w' || handle === 'e') {
        updatedH = updatedW / targetRatio;
        const centerY = startRect.y + startRect.height / 2;
        newTop = Math.max(0, centerY - updatedH / 2);
        if (newTop + updatedH > canvasH) {
          newTop = canvasH - updatedH;
        }
        if (newTop < 0) {
          newTop = 0;
          updatedH = canvasH;
          updatedW = updatedH * targetRatio;
          if (handle === 'w') newLeft = newRight - updatedW;
          else newRight = newLeft + updatedW;
        }
      }
    }

    // Final safety clamps
    if (isOutpaint) {
      newLeft = Math.min(0, Math.max(-canvasW, newLeft));
      newTop = Math.min(0, Math.max(-canvasH, newTop));
      newRight = Math.max(canvasW, Math.min(canvasW * 2, newRight));
      newBottom = Math.max(canvasH, Math.min(canvasH * 2, newBottom));
      updatedW = newRight - newLeft;
      updatedH = newBottom - newTop;
    } else {
      newLeft = Math.max(0, Math.min(canvasW - minDim, newLeft));
      newTop = Math.max(0, Math.min(canvasH - minDim, newTop));
      updatedW = Math.max(minDim, Math.min(canvasW - newLeft, updatedW));
      updatedH = Math.max(minDim, Math.min(canvasH - newTop, updatedH));
    }

    store.updateCropRect({
      x: Math.round(newLeft),
      y: Math.round(newTop),
      width: Math.round(updatedW),
      height: Math.round(updatedH),
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setActiveHandle(null);
    dragStartRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (_) {}
  };

  const roundedW = Math.round(rectW);
  const roundedH = Math.round(rectH);
  const displayRatio = aspectRatio || `${(roundedW / roundedH).toFixed(2)}:1`;
  const hasOutpaintArea = x < 0 || y < 0 || x + rectW > canvasW || y + rectH > canvasH;

  return (
    <div className="absolute inset-0 pointer-events-none z-30 select-none">
      {/* 1. Dark Shroud Over Non-Cropped Area */}
      {!isOutpaint && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          width={canvasW}
          height={canvasH}
          viewBox={`0 0 ${canvasW} ${canvasH}`}
        >
          <path
            d={`M 0 0 H ${canvasW} V ${canvasH} H 0 Z M ${x} ${y} V ${y + rectH} H ${x + rectW} V ${y} Z`}
            fill="rgba(0, 0, 0, 0.65)"
            fillRule="evenodd"
          />
        </svg>
      )}

      {isOutpaint && (
        <>
          {y < 0 && <div className="absolute bg-white pointer-events-none" style={{ left: x, top: y, width: rectW, height: -y }} />}
          {y + rectH > canvasH && <div className="absolute bg-white pointer-events-none" style={{ left: x, top: canvasH, width: rectW, height: y + rectH - canvasH }} />}
          {x < 0 && <div className="absolute bg-white pointer-events-none" style={{ left: x, top: 0, width: -x, height: canvasH }} />}
          {x + rectW > canvasW && <div className="absolute bg-white pointer-events-none" style={{ left: canvasW, top: 0, width: x + rectW - canvasW, height: canvasH }} />}
        </>
      )}

      {/* 2. Active Crop Box Boundary */}
      <div
        className="absolute border border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.6)] pointer-events-auto"
        style={{
          left: `${x}px`,
          top: `${y}px`,
          width: `${rectW}px`,
          height: `${rectH}px`,
          cursor: activeHandle ? undefined : isOutpaint ? 'default' : 'move',
        }}
        onPointerDown={e => {
          if (!isOutpaint) handlePointerDown(e, 'center');
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Rule of Thirds Grid Lines (3x3) */}
        <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none">
          <div className="border-r border-b border-white/30" />
          <div className="border-r border-b border-white/30" />
          <div className="border-b border-white/30" />
          <div className="border-r border-b border-white/30" />
          <div className="border-r border-b border-white/30" />
          <div className="border-b border-white/30" />
          <div className="border-r border-b border-white/30" />
          <div className="border-r border-b border-white/30" />
          <div />
        </div>

        {/* 3. Corner Handles (Windows Photos style thick L-brackets) */}
        {/* Top-Left Corner */}
        <div
          className="absolute -top-3 -left-3 w-7 h-7 flex items-start justify-start cursor-nwse-resize group pointer-events-auto"
          onPointerDown={e => handlePointerDown(e, 'nw')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          title="Drag to resize top-left corner"
        >
          <div className="w-5 h-5 border-t-[3px] border-l-[3px] border-white shadow-sm transition-transform group-hover:scale-110" />
        </div>

        {/* Top-Right Corner */}
        <div
          className="absolute -top-3 -right-3 w-7 h-7 flex items-start justify-end cursor-nesw-resize group pointer-events-auto"
          onPointerDown={e => handlePointerDown(e, 'ne')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          title="Drag to resize top-right corner"
        >
          <div className="w-5 h-5 border-t-[3px] border-r-[3px] border-white shadow-sm transition-transform group-hover:scale-110" />
        </div>

        {/* Bottom-Left Corner */}
        <div
          className="absolute -bottom-3 -left-3 w-7 h-7 flex items-end justify-start cursor-nesw-resize group pointer-events-auto"
          onPointerDown={e => handlePointerDown(e, 'sw')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          title="Drag to resize bottom-left corner"
        >
          <div className="w-5 h-5 border-b-[3px] border-l-[3px] border-white shadow-sm transition-transform group-hover:scale-110" />
        </div>

        {/* Bottom-Right Corner */}
        <div
          className="absolute -bottom-3 -right-3 w-7 h-7 flex items-end justify-end cursor-nwse-resize group pointer-events-auto"
          onPointerDown={e => handlePointerDown(e, 'se')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          title="Drag to resize bottom-right corner"
        >
          <div className="w-5 h-5 border-b-[3px] border-r-[3px] border-white shadow-sm transition-transform group-hover:scale-110" />
        </div>

        {/* 4. Edge Handles (Centered Drag Bars) */}
        {/* Top Edge */}
        <div
          className="absolute -top-2 left-1/2 -translate-x-1/2 w-10 h-4 flex items-center justify-center cursor-ns-resize pointer-events-auto group"
          onPointerDown={e => handlePointerDown(e, 'n')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          title="Drag top edge"
        >
          <div className="w-6 h-1.5 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform" />
        </div>

        {/* Bottom Edge */}
        <div
          className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-10 h-4 flex items-center justify-center cursor-ns-resize pointer-events-auto group"
          onPointerDown={e => handlePointerDown(e, 's')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          title="Drag bottom edge"
        >
          <div className="w-6 h-1.5 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform" />
        </div>

        {/* Left Edge */}
        <div
          className="absolute -left-2 top-1/2 -translate-y-1/2 w-4 h-10 flex items-center justify-center cursor-ew-resize pointer-events-auto group"
          onPointerDown={e => handlePointerDown(e, 'w')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          title="Drag left edge"
        >
          <div className="w-1.5 h-6 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform" />
        </div>

        {/* Right Edge */}
        <div
          className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-10 flex items-center justify-center cursor-ew-resize pointer-events-auto group"
          onPointerDown={e => handlePointerDown(e, 'e')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          title="Drag right edge"
        >
          <div className="w-1.5 h-6 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform" />
        </div>

        {/* 5. Dimension & Ratio Badge (Floating above top-left of crop box) */}
        <div className="absolute -top-8 left-0 flex items-center gap-1.5 bg-slate-950/90 text-white border border-slate-700/80 px-2 py-0.5 rounded-md text-[11px] font-mono shadow-lg backdrop-blur-sm pointer-events-none">
          <span className="font-bold text-indigo-400">{roundedW} × {roundedH}</span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-300 capitalize">{displayRatio}</span>
        </div>

        {/* 6. Floating Action Bar (Apply / Cancel / Reset directly below crop box) */}
        <div
          className="absolute -bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-slate-900/95 border border-slate-700/90 p-1 rounded-xl shadow-2xl backdrop-blur-md pointer-events-auto"
          onPointerDown={e => {
            // Keep the crop box from starting a center drag before a button click.
            e.stopPropagation();
          }}
        >
          {/* Apply Button */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              store.applyCrop();
            }}
            disabled={isOutpaint && !hasOutpaintArea}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
            title={isOutpaint ? 'Create Outpaint Area (Enter)' : 'Apply Crop (Enter)'}
          >
            <Check size={13} strokeWidth={2.5} />
            <span>{isOutpaint ? 'Create Area' : 'Apply'}</span>
          </button>

          {/* Reset Button */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              store.updateCropRect({ x: 0, y: 0, width: canvasW, height: canvasH });
              store.setCropAspectRatio(null);
            }}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg text-xs transition-colors cursor-pointer"
            title="Reset to Full Image"
          >
            <RotateCcw size={13} />
          </button>

          <div className="w-[1px] h-4 bg-slate-700 mx-0.5" />

          {/* Cancel Button */}
          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              store.cancelCrop();
            }}
            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
            title="Cancel Crop (Esc)"
          >
            <X size={13} />
            <span>Cancel</span>
          </button>
        </div>
      </div>
    </div>
  );
};
