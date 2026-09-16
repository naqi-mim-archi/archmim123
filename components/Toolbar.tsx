import React, { useState, useEffect, useRef } from 'react';
import { ProjectMode, EditorTool, DockPosition } from '../types';
import { 
  Square, DoorOpen, Layout, MousePointer2, Maximize2, RotateCcw, Trash2, Undo, Redo, Download, Upload as UploadIcon, Layers, Hand, Settings, Grid3X3, Crosshair, Pencil, RectangleHorizontal, Scissors, Circle as CircleIcon, Orbit as ArcIcon, CircleDashed as EllipseIcon, 
  Armchair, Bath, Columns, Utensils, Compass, Target, Sparkles, Wand2, Wand, Map, Waves, Palmtree, Zap, Refrigerator,
  GripHorizontal, GripVertical, ChevronDown, Triangle, X as CloseIcon, Boxes, Search, SlidersHorizontal, Footprints, Camera
} from 'lucide-react';
import { 
  WallIcon, DoorIcon, WindowIcon, WallOpeningIcon, ColumnIcon, 
  StairIcon, LabelIcon, MoveIcon, CopyIcon, 
  RotateIcon, MirrorIcon, DimensionIcon, FitToViewIcon, SelectIcon,
  OrthoIcon, LineIcon, RectIcon, RailingIcon, CounterIcon, SplitIcon,
  WALL_PRESETS, DOOR_PRESETS, WINDOW_PRESETS, COLUMN_PRESETS, STAIR_PRESETS, INTERIOR_ELEMENT_PRESETS, INTERIOR_ELEMENT_CATEGORIES, RAILING_PRESETS,
  inferInteriorSeatCount
} from '../constants';
import { drawInteriorBedSymbol } from './interiorBedSymbols';

interface TooltipProps {
  label: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

const Tooltip: React.FC<TooltipProps> = ({ label, children, position = 'right' }) => {
  const positionClasses = {
    top: 'bottom-full mb-3 left-1/2 -translate-x-1/2 translate-y-1 group-hover:translate-y-0',
    bottom: 'top-full mt-3 left-1/2 -translate-x-1/2 -translate-y-1 group-hover:translate-y-0',
    left: 'right-full mr-3 top-1/2 -translate-y-1/2 translate-x-1 group-hover:translate-x-0',
    right: 'left-full ml-3 group-hover:translate-x-0 top-1/2 -translate-y-1/2 -translate-x-1',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-slate-900',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-900',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-slate-900',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-slate-900',
  };

  return (
    <div className="relative group">
      {children}
      <div className={`absolute z-[100] px-2 py-1.5 bg-slate-900 text-white text-[10px] font-medium rounded-md shadow-xl whitespace-nowrap pointer-events-none invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-150 delay-150 ${positionClasses[position]}`}>
        {label}
        <div className={`absolute border-4 border-transparent ${arrowClasses[position]}`} />
      </div>
    </div>
  );
};

interface InteriorPreviewPreset {
  id?: string;
  width?: number;
  depth?: number;
  subType?: string;
  type?: string;
  shape?: string;
  seatsCount?: number;
  classname?: string;
  isImportedAsset?: boolean;
  sourceType?: string;
  planView2D?: any;
  thumbnail?: string;
  bimMetadata?: any;
}

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill = true
) => {
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
    if (fill) ctx.fill();
    ctx.stroke();
    return;
  }
  if (fill) ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x, y, w, h);
};

const drawPreviewChair = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  rotation: number
) => {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.strokeRect(-size / 2, -size / 2, size, size);
  ctx.beginPath();
  ctx.arc(0, size / 2, size / 2, Math.PI, 0);
  ctx.stroke();
  ctx.restore();
};

const getInteriorPreviewType = (preset: InteriorPreviewPreset) => {
  const sub = (preset.subType || '').toLowerCase();
  const furnitureTokens = [
    'bed', 'sofa', 'chair', 'stool', 'ottoman', 'puff', 'table', 'desk', 'conference',
    'wardrobe', 'bedside', 'coffee', 'tv_console', 'filing', 'shelf', 'buffet',
    'credenza', 'whiteboard', 'reception'
  ];
  const fixtureTokens = [
    'wc', 'basin', 'vanity_basin', 'corner_basin', 'sink', 'double_sink', 'stove',
    'hob', 'fridge', 'washer', 'bath', 'shower'
  ];
  const counterTokens = [
    'standard', 'island', 'counter', 'cashier', 'reception_curved', 'display_counter',
    'service_counter', 'base_cabinet'
  ];
  if (sub.includes('cashier') || sub.includes('reception_curved')) return 'counter';
  if (furnitureTokens.some((token) => sub.includes(token))) return 'furniture';
  if (counterTokens.some((token) => sub.includes(token))) return 'counter';
  if (fixtureTokens.some((token) => sub.includes(token))) return 'fixture';
  return preset.type || 'furniture';
};

const drawInteriorPlanPreview = (canvas: HTMLCanvasElement, preset: InteriorPreviewPreset) => {
  const cssW = 180;
  const cssH = 92;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.save();

  const subType = (preset.subType || '').toLowerCase();
  const visualType = getInteriorPreviewType(preset);
  const baseW = Math.max(0.15, preset.width || 1);
  const baseD = Math.max(0.15, preset.depth || 1);
  const isImportedRevitAsset = preset.isImportedAsset || preset.sourceType === 'revit_import' || preset.bimMetadata?.sourceType === 'revit_import';
  const hasExternalSeats =
    subType.includes('table') || subType.includes('conference') || subType.includes('dining');
  const previewW = baseW + (hasExternalSeats ? 0.75 : 0.08);
  const previewD = baseD + (hasExternalSeats ? 0.75 : 0.08);
  const scale = Math.min((cssW - 28) / previewW, (cssH - 12) / previewD);
  const px = (value: number) => value / scale;
  const w = baseW;
  const d = baseD;

  ctx.translate(cssW / 2, cssH / 2);
  ctx.scale(scale, scale);
  ctx.strokeStyle = '#475569';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = px(1);
  ctx.lineCap = 'round';

  if (isImportedRevitAsset) {
    const plan = preset.planView2D || preset.bimMetadata?.planView2D;
    const boundary = Array.isArray(plan?.boundary) && plan.boundary.length >= 3
      ? plan.boundary
      : [
          { x: -baseW / 2, y: -baseD / 2 },
          { x: baseW / 2, y: -baseD / 2 },
          { x: baseW / 2, y: baseD / 2 },
          { x: -baseW / 2, y: baseD / 2 },
        ];
    ctx.beginPath();
    boundary.forEach((pt: { x: number; y: number }, index: number) => {
      if (index === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.closePath();
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#475569';
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#94a3b8';
    (plan?.detailLines || []).forEach((line: { p1: { x: number; y: number }; p2: { x: number; y: number } }) => {
      ctx.beginPath();
      ctx.moveTo(line.p1.x, line.p1.y);
      ctx.lineTo(line.p2.x, line.p2.y);
      ctx.stroke();
    });
    ctx.scale(1 / scale, 1 / scale);
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('RFA', 0, 0);
    ctx.restore();
    return;
  }
  ctx.lineJoin = 'round';

  const fillStrokeRect = (x: number, y: number, rw: number, rh: number) => {
    ctx.fillRect(x, y, rw, rh);
    ctx.strokeRect(x, y, rw, rh);
  };

  const drawPillow = (cx: number, top: number, pw: number, ph: number) => {
    drawRoundedRect(ctx, cx - pw / 2, top, pw, ph, px(4), false);
  };

  const drawStandardBed = (single = false) => {
    fillStrokeRect(-w / 2, -d / 2, w, d);
    const pillowW = Math.min(w * 0.36, 0.55);
    const pillowH = Math.min(d * 0.17, 0.35);
    if (single) {
      drawPillow(0, -d / 2 + px(5), pillowW, pillowH);
    } else {
      drawPillow(-w * 0.23, -d / 2 + px(5), pillowW, pillowH);
      drawPillow(w * 0.23, -d / 2 + px(5), pillowW, pillowH);
    }
    ctx.beginPath();
    ctx.moveTo(-w / 2, d * 0.1);
    ctx.lineTo(w / 2, d * 0.1);
    ctx.stroke();
  };

  if (visualType === 'furniture') {
    if (drawInteriorBedSymbol(ctx, w, d, subType)) {
      // Drawn from the catalog reference symbols for these furniture presets.
    } else if (subType.includes('bed_twin_pair')) {
      const gap = Math.min(w * 0.08, 0.14);
      const bedW = (w - gap) / 2;
      [-1, 1].forEach((side) => {
        const cx = side * (bedW / 2 + gap / 2);
        fillStrokeRect(cx - bedW / 2, -d / 2, bedW, d);
        drawPillow(cx, -d / 2 + px(5), bedW * 0.52, d * 0.16);
        ctx.beginPath();
        ctx.moveTo(cx - bedW / 2, d * 0.1);
        ctx.lineTo(cx + bedW / 2, d * 0.1);
        ctx.stroke();
      });
    } else if (subType.includes('sofa_bed')) {
      fillStrokeRect(-w / 2, -d / 2, w, d);
      ctx.strokeRect(-w / 2, -d / 2, w, d * 0.25);
      ctx.setLineDash([px(5), px(4)]);
      ctx.strokeRect(-w * 0.42, d / 2, w * 0.84, d * 0.75);
      ctx.setLineDash([]);
    } else if (subType.includes('bed_bunk') || subType.includes('bed_loft')) {
      fillStrokeRect(-w / 2, -d / 2, w, d);
      ctx.strokeRect(-w * 0.38, -d / 2 + px(5), w * 0.76, d * 0.22);
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(w / 2, 0);
      for (let y = -d * 0.25; y < d * 0.35; y += Math.max(px(6), d * 0.12)) {
        ctx.moveTo(w / 2 - px(10), y);
        ctx.lineTo(w / 2, y + px(5));
      }
      ctx.stroke();
      if (subType.includes('loft')) {
        ctx.strokeRect(-w / 2 + px(8), d * 0.18, w * 0.35, d * 0.25);
      }
    } else if (subType.includes('bed_side_tables')) {
      const tableW = Math.min(w * 0.18, 0.45);
      const bedW = w - tableW * 2;
      fillStrokeRect(-bedW / 2, -d / 2, bedW, d);
      drawPillow(-bedW * 0.23, -d / 2 + px(5), bedW * 0.28, d * 0.16);
      drawPillow(bedW * 0.23, -d / 2 + px(5), bedW * 0.28, d * 0.16);
      ctx.strokeRect(-w / 2, -d / 2 + tableW * 0.25, tableW * 0.8, tableW * 0.8);
      ctx.strokeRect(w / 2 - tableW * 0.8, -d / 2 + tableW * 0.25, tableW * 0.8, tableW * 0.8);
    } else if (subType.includes('hospital_bed')) {
      drawStandardBed(true);
      ctx.strokeRect(-w / 2, -d * 0.15, px(3), d * 0.45);
      ctx.strokeRect(w / 2 - px(3), -d * 0.15, px(3), d * 0.45);
      ctx.beginPath();
      ctx.arc(-w * 0.35, -d * 0.43, px(4), 0, Math.PI * 2);
      ctx.stroke();
    } else if (subType.includes('bedside')) {
      fillStrokeRect(-w / 2, -d / 2, w, d);
      ctx.strokeRect(-w * 0.35, d * 0.2, w * 0.7, d * 0.2);
    } else if (subType.includes('bed')) {
      drawStandardBed(subType.includes('single') || subType.includes('day_bed'));
      if (subType.includes('storage')) {
        ctx.strokeRect(-w * 0.35, d / 2 - d * 0.18, w * 0.7, d * 0.14);
        ctx.beginPath();
        ctx.moveTo(0, d / 2 - d * 0.18);
        ctx.lineTo(0, d / 2 - d * 0.04);
        ctx.stroke();
      }
    } else if (subType.includes('sofa')) {
      const armW = Math.min(w * 0.15, 0.25);
      const backD = Math.min(d * 0.25, 0.3);
      if (subType.includes('round') || subType.includes('kidney') || subType.includes('curved')) {
        ctx.beginPath();
        ctx.ellipse(0, 0, w * 0.48, d * 0.38, 0, 0.1 * Math.PI, 1.9 * Math.PI);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(0, -d * 0.04, w * 0.34, d * 0.2, 0, 0, Math.PI * 2);
        ctx.stroke();
        const seats = inferInteriorSeatCount(preset);
        for (let i = 1; i < seats; i++) {
          const x = -w * 0.35 + (w * 0.7 * i / seats);
          ctx.beginPath();
          ctx.moveTo(x, -d * 0.24);
          ctx.lineTo(x, d * 0.2);
          ctx.stroke();
        }
      } else {
        fillStrokeRect(-w / 2, -d / 2, w, d);
        ctx.strokeRect(-w / 2, -d / 2, w, backD);
        ctx.strokeRect(-w / 2, -d / 2, armW, d);
        ctx.strokeRect(w / 2 - armW, -d / 2, armW, d);
        const seats = inferInteriorSeatCount(preset);
        const seatAreaW = w - 2 * armW;
        const oneSeatW = seatAreaW / seats;
        for (let i = 0; i < seats; i++) {
          ctx.strokeRect(-w / 2 + armW + i * oneSeatW, -d / 2 + backD, oneSeatW, d - backD);
        }
      }
    } else if (subType.includes('table_cafe') || preset.shape === 'circle' || subType.includes('table_round')) {
      const radius = Math.min(w, d) / 2;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const chairS = Math.min(radius * 0.75, 0.42);
      drawPreviewChair(ctx, 0, -d / 2 - chairS * 0.68, chairS, 0);
      drawPreviewChair(ctx, 0, d / 2 + chairS * 0.68, chairS, Math.PI);
      if (subType.includes('dining')) {
        drawPreviewChair(ctx, -w / 2 - chairS * 0.68, 0, chairS, -Math.PI / 2);
        drawPreviewChair(ctx, w / 2 + chairS * 0.68, 0, chairS, Math.PI / 2);
      }
    } else if (subType.includes('conference') || subType.includes('table') || subType.includes('desk')) {
      fillStrokeRect(-w / 2, -d / 2, w, d);
      if (subType.includes('conference')) {
        ctx.beginPath();
        ctx.ellipse(0, 0, w * 0.4, d * 0.2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      const chairS = Math.min(Math.min(w, d) * 0.35, 0.42);
      const seats = inferInteriorSeatCount(preset);
      const sideSeats = Math.max(1, Math.floor((seats - 2) / 2));
      if (seats > 4) {
        for (let i = 0; i < sideSeats; i++) {
          const cx = -w / 2 + w * ((i + 1) / (sideSeats + 1));
          drawPreviewChair(ctx, cx, -d / 2 - chairS * 0.65, chairS, 0);
          drawPreviewChair(ctx, cx, d / 2 + chairS * 0.65, chairS, Math.PI);
        }
        drawPreviewChair(ctx, -w / 2 - chairS * 0.65, 0, chairS, -Math.PI / 2);
        drawPreviewChair(ctx, w / 2 + chairS * 0.65, 0, chairS, Math.PI / 2);
      } else if (!subType.includes('desk')) {
        drawPreviewChair(ctx, 0, -d / 2 - chairS * 0.65, chairS, 0);
        drawPreviewChair(ctx, 0, d / 2 + chairS * 0.65, chairS, Math.PI);
        drawPreviewChair(ctx, -w / 2 - chairS * 0.65, 0, chairS, -Math.PI / 2);
        drawPreviewChair(ctx, w / 2 + chairS * 0.65, 0, chairS, Math.PI / 2);
      } else {
        ctx.beginPath();
        ctx.moveTo(-w * 0.35, -d * 0.18);
        ctx.lineTo(w * 0.35, -d * 0.18);
        ctx.stroke();
      }
    } else if (subType.includes('chair')) {
      if (subType.includes('office')) {
        ctx.beginPath();
        ctx.arc(0, 0, Math.min(w, d) * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -d * 0.3, w * 0.3, Math.PI, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-w * 0.4, -d * 0.1);
        ctx.lineTo(-w * 0.4, d * 0.2);
        ctx.moveTo(w * 0.4, -d * 0.1);
        ctx.lineTo(w * 0.4, d * 0.2);
        ctx.stroke();
      } else {
        fillStrokeRect(-w / 2, -d / 2, w, d);
        ctx.strokeRect(-w * 0.42, -d / 2, w * 0.84, d * 0.25);
        ctx.beginPath();
        ctx.arc(0, d * 0.12, Math.min(w, d) * 0.25, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (subType.includes('stool')) {
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, d) * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-w * 0.25, d * 0.25);
      ctx.lineTo(w * 0.25, d * 0.25);
      ctx.stroke();
    } else if (subType.includes('ottoman') || subType.includes('puff')) {
      drawRoundedRect(ctx, -w / 2, -d / 2, w, d, Math.min(w, d) * 0.18);
      if (subType.includes('tufted')) {
        for (let ix = -1; ix <= 1; ix++) {
          for (let iy = -1; iy <= 1; iy++) {
            ctx.beginPath();
            ctx.arc(ix * w * 0.18, iy * d * 0.18, px(2), 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }
    } else if (subType.includes('reception')) {
      fillStrokeRect(-w / 2, -d / 2, w, d);
      ctx.beginPath();
      ctx.moveTo(-w / 2 + px(3), -d / 2 + px(3));
      ctx.lineTo(w / 2 - px(3), -d / 2 + px(3));
      ctx.lineTo(w / 2 - px(3), d / 2 - px(3));
      ctx.stroke();
    } else if (subType.includes('wardrobe') || subType.includes('shelf') || subType.includes('cabinet') || subType.includes('buffet') || subType.includes('credenza')) {
      fillStrokeRect(-w / 2, -d / 2, w, d);
      ctx.beginPath();
      ctx.moveTo(-w / 2, 0);
      ctx.lineTo(w / 2, 0);
      ctx.moveTo(-w / 6, -d / 2);
      ctx.lineTo(-w / 6, d / 2);
      ctx.moveTo(w / 6, -d / 2);
      ctx.lineTo(w / 6, d / 2);
      ctx.stroke();
    } else if (subType.includes('coffee')) {
      drawRoundedRect(ctx, -w / 2, -d / 2, w, d, Math.min(w, d) * 0.14);
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, d) * 0.2, 0, Math.PI * 2);
      ctx.stroke();
    } else if (subType.includes('tv_console')) {
      fillStrokeRect(-w / 2, -d / 2, w, d);
      ctx.beginPath();
      ctx.moveTo(-w * 0.4, 0);
      ctx.lineTo(w * 0.4, 0);
      ctx.stroke();
    } else if (subType.includes('whiteboard')) {
      fillStrokeRect(-w / 2, -d / 2, w, d);
      ctx.strokeRect(-w * 0.35, d / 2 - px(4), w * 0.7, px(4));
    } else {
      fillStrokeRect(-w / 2, -d / 2, w, d);
    }
  } else if (visualType === 'fixture') {
    if (drawInteriorBedSymbol(ctx, w, d, subType)) {
      // Drawn from the catalog reference symbols for these kitchen presets.
    } else if (subType.includes('wc')) {
      const tankD = d * 0.25;
      ctx.strokeRect(-w / 2, -d / 2, w, tankD);
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.35, d * 0.35, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (subType.includes('basin') || subType.includes('vanity')) {
      ctx.strokeRect(-w / 2, -d / 2, w, d);
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.4, d * 0.35, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -d / 2);
      ctx.lineTo(0, -d / 4);
      ctx.moveTo(-w * 0.05, -d / 4);
      ctx.lineTo(w * 0.05, -d / 4);
      ctx.stroke();
      if (subType.includes('corner')) {
        ctx.beginPath();
        ctx.moveTo(-w / 2, d / 2);
        ctx.lineTo(w / 2, -d / 2);
        ctx.stroke();
      }
    } else if (subType.includes('bath')) {
      ctx.strokeRect(-w / 2, -d / 2, w, d);
      drawRoundedRect(ctx, -w / 2 + px(5), -d / 2 + px(5), w - px(10), d - px(10), px(10), false);
      ctx.beginPath();
      ctx.arc(-w / 2 + w * 0.15, 0, px(4), 0, Math.PI * 2);
      ctx.stroke();
    } else if (subType.includes('shower')) {
      ctx.strokeRect(-w / 2, -d / 2, w, d);
      ctx.beginPath();
      ctx.moveTo(-w / 2, -d / 2);
      ctx.lineTo(w / 2, d / 2);
      ctx.moveTo(w / 2, -d / 2);
      ctx.lineTo(-w / 2, d / 2);
      ctx.stroke();
    } else if (subType.includes('sink')) {
      ctx.strokeRect(-w / 2, -d / 2, w, d);
      const bowlCount = subType.includes('double') ? 2 : 1;
      for (let i = 0; i < bowlCount; i++) {
        const cx = bowlCount === 1 ? 0 : (i === 0 ? -w * 0.22 : w * 0.22);
        ctx.strokeRect(cx - w * 0.18, -d * 0.35, w * 0.35, d * 0.7);
      }
      ctx.beginPath();
      ctx.arc(0, -d * 0.4, px(3), 0, Math.PI * 2);
      ctx.moveTo(0, -d * 0.4);
      ctx.lineTo(0, -d * 0.15);
      ctx.stroke();
    } else if (subType.includes('stove') || subType.includes('hob')) {
      ctx.strokeRect(-w / 2, -d / 2, w, d);
      const burners = subType.includes('hob_2') ? [[-0.22, 0], [0.22, 0]] : [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]];
      burners.forEach(([bx, by]) => {
        ctx.beginPath();
        ctx.arc(w * bx, d * by, Math.min(w, d) * 0.15, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.strokeRect(-w * 0.4, -d * 0.45, w * 0.8, d * 0.1);
    } else if (subType.includes('fridge')) {
      ctx.strokeRect(-w / 2, -d / 2, w, d);
      ctx.strokeRect(-w / 2 + px(2), -d / 2 + px(2), w - px(4), d - px(4));
      ctx.strokeRect(-px(5), d / 2 - px(6), px(3), px(4));
      ctx.strokeRect(px(2), d / 2 - px(6), px(3), px(4));
    } else if (subType.includes('washer')) {
      ctx.strokeRect(-w / 2, -d / 2, w, d);
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, d) * 0.3, 0, Math.PI * 2);
      ctx.moveTo(-w / 2, -d * 0.3);
      ctx.lineTo(w / 2, -d * 0.3);
      ctx.stroke();
    } else {
      ctx.strokeRect(-w / 2, -d / 2, w, d);
    }
  } else if (visualType === 'counter') {
    const isIsland = subType.includes('island');
    const isL = preset.shape === 'L' || subType.includes('_l_') || subType.includes('counter_l');
    const isCurved = subType.includes('curved') || subType.includes('round');
    if (drawInteriorBedSymbol(ctx, w, d, subType)) {
      // Drawn from the catalog reference symbols for these kitchen presets.
    } else if (isCurved) {
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.48, d * 0.38, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, w * 0.35, d * 0.2, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (isL) {
      const leg = Math.min(w, d) * 0.35;
      ctx.beginPath();
      ctx.moveTo(-w / 2, -d / 2);
      ctx.lineTo(w / 2, -d / 2);
      ctx.lineTo(w / 2, -d / 2 + leg);
      ctx.lineTo(-w / 2 + leg, -d / 2 + leg);
      ctx.lineTo(-w / 2 + leg, d / 2);
      ctx.lineTo(-w / 2, d / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else {
      fillStrokeRect(-w / 2, -d / 2, w, d);
      if (subType.includes('display')) {
        ctx.setLineDash([px(4), px(3)]);
        ctx.strokeRect(-w / 2 + px(4), -d / 2 + px(4), w - px(8), d - px(8));
        ctx.setLineDash([]);
      }
    }
    if (!isIsland && !isCurved) {
      ctx.beginPath();
      ctx.moveTo(-w / 2, -d / 2 + px(5));
      ctx.lineTo(w / 2, -d / 2 + px(5));
      ctx.stroke();
    }
  } else {
    fillStrokeRect(-w / 2, -d / 2, w, d);
  }

  ctx.restore();
};

const InteriorElementPreview: React.FC<{ preset: InteriorPreviewPreset }> = ({ preset }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) drawInteriorPlanPreview(canvasRef.current, preset);
  }, [preset]);

  return (
    <canvas
      ref={canvasRef}
      width={180}
      height={92}
      className="h-20 w-full"
      aria-hidden="true"
    />
  );
};

const getCategoryIcon = (categoryId: string, active: boolean) => {
  const cls = active ? 'text-blue-600' : 'text-slate-700';
  const strokeWidth = 1.5;
  if (categoryId === 'furniture') return <Armchair size={28} strokeWidth={strokeWidth} className={cls} />;
  if (categoryId === 'kitchen') return <Refrigerator size={28} strokeWidth={strokeWidth} className={cls} />;
  if (categoryId === 'bathroom') return <Bath size={28} strokeWidth={strokeWidth} className={cls} />;
  if (categoryId === 'retail-hospitality') return <Utensils size={28} strokeWidth={strokeWidth} className={cls} />;
  if (categoryId === 'lighting-electrical-climate') return <Zap size={28} strokeWidth={strokeWidth} className={cls} />;
  if (categoryId === 'decor-soft-furnishings-plants') return <Palmtree size={28} strokeWidth={strokeWidth} className={cls} />;
  return <span className={cls}><CounterIcon size={28} /></span>;
};

interface DraggableToolbarProps {
  name: string;
  position: DockPosition;
  onPositionChange: (pos: DockPosition) => void;
  children: React.ReactNode;
}

const DraggableToolbar: React.FC<DraggableToolbarProps> = ({ name, position, onPositionChange, children }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [tempPos, setTempPos] = useState({ x: 0, y: 0 });
  const barRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only drag if clicking the handle
    if ((e.target as HTMLElement).closest('.drag-handle')) {
       setIsDragging(true);
       const rect = barRef.current!.getBoundingClientRect();
       setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
       setTempPos({ x: rect.left, y: rect.top });
       e.preventDefault();
    }
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setTempPos({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
    };

    const handleMouseUp = (e: MouseEvent) => {
      setIsDragging(false);
      const w = window.innerWidth;
      const h = window.innerHeight;
      const x = e.clientX;
      const y = e.clientY;

      const dists = {
        top: y,
        bottom: h - y,
        left: x,
        right: w - x,
      };

      let closest: DockPosition = 'top';
      let minDist = dists.top;

      if (dists.bottom < minDist) { closest = 'bottom'; minDist = dists.bottom; }
      if (dists.left < minDist) { closest = 'left'; minDist = dists.left; }
      if (dists.right < minDist) { closest = 'right'; minDist = dists.right; }

      onPositionChange(closest);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset, onPositionChange]);

  const isVertical = position === 'left' || position === 'right';
  
  const dockStyles: Record<DockPosition, string> = {
    top: 'top-[56px] left-1/2 -translate-x-1/2 flex-row',
    bottom: 'bottom-5 left-1/2 -translate-x-1/2 flex-row',
    left: 'left-5 top-1/2 -translate-y-1/2 flex-col',
    right: 'right-5 top-1/2 -translate-y-1/2 flex-col',
  };

  const style: React.CSSProperties = isDragging ? {
    position: 'fixed',
    left: tempPos.x,
    top: tempPos.y,
    transform: 'none',
    zIndex: 9999,
  } : {};

  const tooltipPosMap: Record<DockPosition, 'top' | 'bottom' | 'left' | 'right'> = {
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left'
  };

  return (
    <div 
      ref={barRef}
      style={style}
      onMouseDown={handleMouseDown}
      className={`${isDragging ? '' : `absolute ${dockStyles[position]}`} bg-white/95 backdrop-blur shadow-lg shadow-slate-200/50 border border-slate-200 rounded-2xl p-1 flex gap-0.5 z-50 transition-all duration-300 items-start`}
    >
      <Tooltip label={name} position={tooltipPosMap[position]}>
        <div 
          className={`drag-handle flex items-center justify-center p-1.5 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing rounded-lg hover:bg-slate-100 ${isVertical ? 'flex-col' : 'flex-row'}`}
        >
          {isVertical ? <GripHorizontal size={14} /> : <GripVertical size={14} />}
        </div>
      </Tooltip>
      <div className={`flex gap-0.5 ${isVertical ? 'flex-col' : 'flex-row'}`}>
        {React.Children.map(children, child => {
          if (React.isValidElement(child)) {
            // Do not pass custom props to standard DOM elements (like <div>) or React.Fragment
            if (typeof child.type === 'string' || child.type === React.Fragment) {
              return child;
            }
            return React.cloneElement(child as React.ReactElement<any>, { 
              tooltipPosition: tooltipPosMap[position],
              isVerticalBar: isVertical
            });
          }
          return child;
        })}
      </div>
    </div>
  );
};

interface ToolbarButtonProps {
  onClick: () => void;
  onPresetSelect?: (preset: any) => void;
  active?: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  tooltipPosition?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  variant?: 'primary' | 'neutral';
  presets?: any[];
  isVerticalBar?: boolean;
  requiresPreset?: boolean; // New prop to force dropdown
  onOpen3DGenerator?: () => void;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ onClick, onPresetSelect, active, disabled, icon, label, tooltipPosition, className, variant = 'primary', presets, isVerticalBar, requiresPreset, onOpen3DGenerator }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isInteriorMenu = !!presets?.some((preset) => preset.catalogGroup === 'Interior Elements');
  const [interiorSearch, setInteriorSearch] = useState('');
  const [activeInteriorCategory, setActiveInteriorCategory] = useState(INTERIOR_ELEMENT_CATEGORIES[0].id);
  const activeCategoryDef = INTERIOR_ELEMENT_CATEGORIES.find(cat => cat.id === activeInteriorCategory) || INTERIOR_ELEMENT_CATEGORIES[0];
  const [activeInteriorSubcategory, setActiveInteriorSubcategory] = useState(activeCategoryDef.subcategories[0]);
  useEffect(() => {
    if (!activeCategoryDef.subcategories.includes(activeInteriorSubcategory)) {
      setActiveInteriorSubcategory(activeCategoryDef.subcategories[0]);
    }
  }, [activeCategoryDef, activeInteriorSubcategory]);
  const normalizedSearch = interiorSearch.trim().toLowerCase();
  const uniquePresets = (presets || []).filter((preset, index, list) => {
    const key = preset.isImportedAsset
      ? `imported:${preset.assetId || preset.classname || preset.id}`
      : `native:${preset.id || preset.subType || preset.label}`;
    return list.findIndex((candidate) => {
      const candidateKey = candidate.isImportedAsset
        ? `imported:${candidate.assetId || candidate.classname || candidate.id}`
        : `native:${candidate.id || candidate.subType || candidate.label}`;
      return candidateKey === key;
    }) === index;
  });
  const filteredInteriorPresets = uniquePresets.filter((preset) => {
    if (!isInteriorMenu) return false;
    const categoryMatches = preset.mainCategory === activeCategoryDef.label;
    const subMatches = !activeInteriorSubcategory || preset.subCategory === activeInteriorSubcategory;
    const searchMatches = !normalizedSearch || [
      preset.label,
      preset.subCategory,
      preset.mainCategory,
      preset.subType,
      preset.classname,
      preset.sourceFileName,
      preset.revitFamilyName,
      preset.userCategory
    ].join(' ').toLowerCase().includes(normalizedSearch);
    return searchMatches && (normalizedSearch || (categoryMatches && subMatches));
  });
  
  // Track if a preset has been selected at least once to enable main button
  const [hasSelectedPreset, setHasSelectedPreset] = useState(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleMainClick = (e: React.MouseEvent) => {
    if (requiresPreset && !hasSelectedPreset) {
      // Force open dropdown
      e.stopPropagation();
      setIsOpen(!isOpen);
      return;
    }

    onClick();
    if (presets && !hasSelectedPreset) {
      if (onPresetSelect && presets.length > 0) {
        onPresetSelect(presets[0]);
        setHasSelectedPreset(true);
      }
    }
    
    // Blur the button after click to prevent focus ring
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.blur();
    }
  }

  const handleDropdownClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
    // Blur the button after click to prevent focus ring
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.blur();
    }
  };

  const handlePresetClick = (preset: any) => {
    // If the preset has a 'type' property (like merged fixtures), we might need to change tool
    // But generally onToolSelect handles the 'tool' argument.
    // Here we assume the parent 'onToolSelect' handles preset logic.
    
    // We pass the preset up. The parent should handle if the tool type changes (e.g. fixture vs counter)
    if (onPresetSelect) onPresetSelect(preset);
    
    setHasSelectedPreset(true);
    setIsOpen(false);
  }

  return (
    <div className={`relative flex flex-col items-center group/btn`} ref={dropdownRef}>
      <Tooltip label={label} position={tooltipPosition}>
        <div className={`flex ${isVerticalBar ? 'flex-col gap-0.5' : 'flex-col gap-0.5'}`}>
          <button
            onClick={handleMainClick}
            disabled={disabled}
            className={`p-2 rounded-t-xl ${!presets ? 'rounded-b-xl' : 'rounded-b-none'} transition-all flex items-center justify-center focus:outline-none focus:ring-0 ${
              active 
                ? (variant === 'primary' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-200 text-slate-700') 
                : 'bg-white hover:bg-slate-100 text-slate-500'
            } ${disabled ? 'opacity-30 cursor-not-allowed text-slate-300' : ''} ${requiresPreset && !hasSelectedPreset ? 'opacity-70 ring-1 ring-slate-200' : ''} ${className}`}
          >
            {icon}
          </button>
          
          {presets && presets.length > 0 && (
             <button
               onClick={handleDropdownClick}
               className={`h-4 w-full flex items-center justify-center rounded-b-xl transition-colors focus:outline-none focus:ring-0 ${
                 active
                 ? 'bg-blue-700 text-white hover:bg-blue-800'
                 : 'bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600'
               }`}
             >
                <ChevronDown size={10} />
             </button>
          )}
        </div>
      </Tooltip>

      {/* Dropdown Menu */}
      {isOpen && presets && (
        isInteriorMenu ? (
        <div className={`absolute z-[200] bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 w-[620px] max-w-[calc(100vw-48px)] max-h-[calc(100vh-120px)] overflow-y-auto ${
           isVerticalBar ? 'left-full top-0 ml-2' : 'top-full left-1/2 -translate-x-1/2 mt-2'
        }`}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-xl font-black text-slate-900">Interior Elements</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onOpen3DGenerator?.();
                }}
                className="h-10 px-3 rounded-lg border border-indigo-200 bg-indigo-50 flex items-center justify-center gap-2 text-xs font-bold text-indigo-700 hover:bg-indigo-100 transition-colors"
              >
                <Sparkles size={16} />
                3D Generator
              </button>
              <button type="button" className="h-10 w-10 rounded-lg border border-slate-200 flex items-center justify-center text-slate-600 hover:bg-slate-50">
                <SlidersHorizontal size={18} />
              </button>
            </div>
          </div>
          <div className="relative mb-4">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={interiorSearch}
              onChange={(event) => setInteriorSearch(event.target.value)}
              placeholder="Search interior elements..."
              className="w-full h-11 pl-10 pr-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {INTERIOR_ELEMENT_CATEGORIES.map((cat) => {
              const catActive = cat.id === activeInteriorCategory && !normalizedSearch;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setInteriorSearch('');
                    setActiveInteriorCategory(cat.id);
                    setActiveInteriorSubcategory(cat.subcategories[0]);
                  }}
                  className={`h-20 rounded-xl border flex flex-col items-center justify-center gap-1.5 text-xs font-medium transition-colors ${catActive ? 'border-blue-500 text-blue-600 bg-blue-50/40' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                >
                  {getCategoryIcon(cat.id, catActive)}
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>
          {!normalizedSearch && (
            <div className="flex flex-wrap gap-2 p-2 rounded-xl border border-slate-200 mb-4">
              {activeCategoryDef.subcategories.map((sub) => (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setActiveInteriorSubcategory(sub)}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${sub === activeInteriorSubcategory ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-400' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                >
                  {sub}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            {filteredInteriorPresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handlePresetClick(preset)}
                className="min-h-36 rounded-xl border border-slate-200 bg-white hover:border-blue-400 hover:shadow-md transition-all p-3 text-center flex flex-col items-center justify-between"
              >
                <InteriorElementPreview preset={preset} />
                <span className="text-xs font-normal text-slate-600 leading-tight">{preset.label}</span>
              </button>
            ))}
          </div>
          {filteredInteriorPresets.length === 0 && (
            <div className="py-10 text-center text-sm font-medium text-slate-500">No matching interior elements.</div>
          )}
        </div>
        ) : (
        <div className={`absolute z-[200] bg-white border border-slate-200 rounded-xl shadow-xl p-1 min-w-[160px] flex flex-col gap-0.5 max-h-64 overflow-y-auto ${
           isVerticalBar ? 'left-full top-0 ml-2' : 'top-full left-1/2 -translate-x-1/2 mt-2'
        }`}>
          {presets.map((preset) => (
             <button
                key={preset.id}
                onClick={() => handlePresetClick(preset)}
                className="text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 rounded-lg transition-colors whitespace-nowrap flex items-center justify-between"
             >
                <span>{preset.label}</span>
             </button>
          ))}
        </div>
        )
      )}
    </div>
  );
}

interface DrawBarProps {
  activeTool: EditorTool;
  isWallMode: boolean;
  onToolSelect: (tool: EditorTool, preset?: any) => void;
  position: DockPosition;
  onPositionChange: (pos: DockPosition) => void;
  mode: ProjectMode;
  disabledToolIds?: Set<EditorTool>;
  customInteriorPresets?: any[];
  onOpen3DGenerator?: () => void;
}

interface DrawToolItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  presets?: any[];
  requiresPreset?: boolean;
}

export const DrawBar: React.FC<DrawBarProps> = ({ activeTool, isWallMode, onToolSelect, position, onPositionChange, mode, disabledToolIds, customInteriorPresets, onOpen3DGenerator }) => {
  const showLegacyProceduralButtons = false;
  const floorplanTools: DrawToolItem[] = [
    { id: 'wall', label: 'Wall', shortcut: 'W', icon: <WallIcon size={18} />, presets: WALL_PRESETS },
    { id: 'line', label: 'Line / Polyline', shortcut: 'L', icon: <LineIcon size={18} /> },
    { id: 'rect', label: 'Rectangle', shortcut: 'REC', icon: <RectIcon size={18} /> },
    { id: 'arc', label: 'Arc', shortcut: 'A', icon: <ArcIcon size={18} /> },
    { id: 'ellipse', label: 'Ellipse', shortcut: 'E', icon: <EllipseIcon size={18} /> },
    { id: 'door', label: 'Door', shortcut: 'D', icon: <DoorIcon size={18} />, presets: DOOR_PRESETS },
    { id: 'window', label: 'Window', shortcut: 'Ctrl+W', icon: <WindowIcon size={18} />, presets: WINDOW_PRESETS },
    { id: 'wall-opening', label: 'Wall Opening', shortcut: '', icon: <WallOpeningIcon size={18} /> },
    { id: 'column', label: 'Column', shortcut: 'C', icon: <ColumnIcon size={18} />, presets: COLUMN_PRESETS },
    { id: 'stair', label: 'Stairs', shortcut: 'S', icon: <StairIcon size={18} />, presets: STAIR_PRESETS },
    { id: 'railing', label: 'Railing', shortcut: '', icon: <RailingIcon size={18} />, presets: RAILING_PRESETS },
    { id: 'floor', label: 'Floor Slab', shortcut: '', icon: <Layers size={18} /> },
    { id: 'ceiling', label: 'Ceiling Slab', shortcut: '', icon: <Layout size={18} /> },
    { id: 'fixture', label: 'Interior Elements', shortcut: 'Shift+F', icon: <Boxes size={18} />, presets: [...INTERIOR_ELEMENT_PRESETS, ...(customInteriorPresets || [])], requiresPreset: true },
    { id: 'room', label: 'Label', shortcut: 'T', icon: <LabelIcon size={18} /> },
    { id: 'gridline', label: 'Grid Line', shortcut: 'G / GR', icon: <Grid3X3 size={18} /> },
    { id: 'dimension', label: 'Dimension', shortcut: 'Ctrl+D / DIM', icon: <DimensionIcon size={18} /> },
    ...(showLegacyProceduralButtons ? [
      { id: 'procedural-boundary', label: 'Procedural Rect', icon: <Wand2 size={18} /> },
      { id: 'smart-procedural-boundary', label: 'Smart Procedural', icon: <Sparkles size={18} className="text-blue-500" /> },
      { id: 'auto-procedural-boundary', label: 'Auto Procedural', icon: <Wand size={18} className="text-blue-600" /> },
    ] : []),
    { id: 'walk' as any, label: 'Walk Around (3D)', icon: <Footprints size={18} /> },
    { id: 'snap' as any, label: 'Snap to Render Canvas (3D)', icon: <Camera size={18} /> },
  ];

  const urbanTools: DrawToolItem[] = [
    { id: 'building-mass', label: 'Building Mass', icon: <Map size={18} /> },
    { id: 'road', label: 'Road Path', icon: <Pencil size={18} /> },
    { id: 'landscape', label: 'Landscape / Park', icon: <Palmtree size={18} /> },
    { id: 'water-body', label: 'Water Body', icon: <Waves size={18} /> },
    { id: 'zone', label: 'Zoning / Land Use', icon: <Layers size={18} /> },
    { id: 'tree', label: 'Plant Tree', icon: <Palmtree size={18} /> },
    { id: 'streetlight', label: 'Streetlight', icon: <Zap size={18} /> },
    { id: 'dimension', label: 'Dimension', shortcut: 'Ctrl+D / DIM', icon: <DimensionIcon size={18} /> },
  ];

  const drawTools = mode === 'urban' ? urbanTools : floorplanTools;

  const handleToolSelectWrapper = (toolId: EditorTool, preset?: any) => {
    if (disabledToolIds?.has(toolId)) return;
    // If the preset changes the tool type (e.g. Counters inside Fixtures menu)
    const presetTool = preset?.type || (preset?.catalogGroup === 'Interior Elements' && preset?.mainCategory === '1. Furniture' ? 'furniture' : toolId);
    if (preset && presetTool !== toolId) {
        onToolSelect(presetTool as EditorTool, preset);
    } else {
        onToolSelect(toolId, preset);
    }
  };

  return (
    <DraggableToolbar name="Draw Bar" position={position} onPositionChange={onPositionChange}>
      {drawTools.map((tool) => {
        const isShapeTool = ['line', 'rect', 'arc', 'ellipse'].includes(tool.id);
        const isActive = activeTool === tool.id || (tool.id === 'fixture' && (activeTool === 'counter' || activeTool === 'furniture')) || (tool.id === 'wall' && isWallMode) || (isShapeTool && isWallMode && activeTool === tool.id) || (isShapeTool && activeTool === tool.id);
        const isDisabled = disabledToolIds?.has(tool.id as EditorTool) ?? false;
        return (
          <ToolbarButton 
            key={tool.id}
            active={isActive}
            disabled={isDisabled}
            onClick={() => handleToolSelectWrapper(tool.id as EditorTool)}
          onPresetSelect={(preset) => handleToolSelectWrapper(tool.id as EditorTool, preset)}
          icon={tool.icon}
          label={`${tool.label} ${tool.shortcut ? `(${tool.shortcut})` : ''}`}
          presets={tool.presets}
          requiresPreset={tool.requiresPreset}
          onOpen3DGenerator={tool.id === 'fixture' ? onOpen3DGenerator : undefined}
        />
        );
      })}
    </DraggableToolbar>
  );
};

interface ToolboxProps {
  activeTool: EditorTool;
  selectedCount: number;
  hasOpeningSelected: boolean;
  hasElevationSelected: boolean;
  hasWallSelected: boolean;
  onToolSelect: (tool: EditorTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  onRotate: () => void;
  onMirror: (axis?: 'horizontal' | 'vertical') => void;
  onGroup: () => void;
  onUngroup: () => void;
  isSingleGroupSelected: boolean;
  onFitToView: () => void;
  position: DockPosition;
  onPositionChange: (pos: DockPosition) => void;
}

export const Toolbox: React.FC<ToolboxProps> = ({ 
  activeTool, selectedCount, hasOpeningSelected, hasElevationSelected, hasWallSelected, onToolSelect, onUndo, onRedo, onRotate, onMirror, onGroup, onUngroup, isSingleGroupSelected, onFitToView, position, onPositionChange 
}) => {
  const hasSelection = selectedCount > 0;
  const isVertical = position === 'left' || position === 'right';

  return (
    <DraggableToolbar name="Toolbox" position={position} onPositionChange={onPositionChange}>
      <ToolbarButton active={activeTool === 'select'} onClick={() => onToolSelect('select')} icon={<SelectIcon size={18} />} label="Select (V / Esc)" />
      <ToolbarButton active={activeTool === 'pan'} onClick={() => onToolSelect('pan')} icon={<Hand size={18} />} label="Pan (H / Space hold)" />
      <div className={`bg-slate-200 ${isVertical ? 'h-px mx-2 my-1' : 'w-px my-2 mx-1'}`} />
      <ToolbarButton active={activeTool === 'split'} disabled={!hasWallSelected && activeTool !== 'split'} onClick={() => onToolSelect('split')} icon={<SplitIcon size={18} />} label="Split (X)" />
      <div className={`bg-slate-200 ${isVertical ? 'h-px mx-2 my-1' : 'w-px my-2 mx-1'}`} />
      <ToolbarButton active={activeTool === 'move'} disabled={!hasSelection} onClick={() => onToolSelect('move')} icon={<MoveIcon size={18} />} label="Move (M)" />
      <ToolbarButton active={activeTool === 'copy'} disabled={!hasSelection || hasElevationSelected} onClick={() => onToolSelect('copy')} icon={<CopyIcon size={18} />} label="Copy (Ctrl+C / CO)" />
      <ToolbarButton disabled={!hasSelection || hasOpeningSelected} onClick={onRotate} icon={<RotateIcon size={18} />} label="Rotate (R / RO)" />
      <ToolbarButton 
        disabled={!hasSelection || hasOpeningSelected || hasElevationSelected} 
        onClick={() => onMirror('horizontal')} 
        onPresetSelect={(p) => onMirror(p.id)}
        presets={[
            { id: 'horizontal', label: 'Mirror Horizontal (MI H)' },
            { id: 'vertical', label: 'Mirror Vertical (MI V)' }
        ]}
        icon={<MirrorIcon size={18} />} 
        label="Mirror (MI)" 
      />
      <div className={`bg-slate-200 ${isVertical ? 'h-px mx-2 my-1' : 'w-px my-2 mx-1'}`} />
      {isSingleGroupSelected ? (
        <ToolbarButton disabled={!hasSelection} onClick={onUngroup} icon={<Layers size={18} />} label="Ungroup (Ctrl+Shift+G)" />
      ) : (
        <ToolbarButton disabled={selectedCount < 1} onClick={onGroup} icon={<Boxes size={18} />} label="Group (Ctrl+G)" />
      )}
      <div className={`bg-slate-200 ${isVertical ? 'h-px mx-2 my-1' : 'w-px my-2 mx-1'}`} />
      <ToolbarButton active={activeTool === 'delete'} disabled={!hasSelection} onClick={() => onToolSelect('delete')} icon={<Trash2 size={18} />} label="Delete (DEL / Backspace)" className={activeTool === 'delete' ? 'bg-blue-600 text-white' : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'} />
      <div className={`bg-slate-200 ${isVertical ? 'h-px mx-2 my-1' : 'w-px my-2 mx-1'}`} />
      <ToolbarButton onClick={onFitToView} icon={<FitToViewIcon size={18} />} label="Fit to View (F / Z+Space)" />
      <div className={`bg-slate-200 ${isVertical ? 'h-px mx-2 my-1' : 'w-px my-2 mx-1'}`} />
      <ToolbarButton onClick={onUndo} icon={<Undo size={18} />} label="Undo (Ctrl+Z)" />
      <ToolbarButton onClick={onRedo} icon={<Redo size={18} />} label="Redo (Ctrl+Y)" />
    </DraggableToolbar>
  );
};

interface SnapBarProps {
  isOrtho: boolean; toggleOrtho: () => void;
  isGrid: boolean; toggleGrid: () => void;
  isSnap: boolean; toggleSnap: () => void;
  isEndpoint: boolean; toggleEndpoint: () => void;
  isMidpoint: boolean; toggleMidpoint: () => void;
  isIntersection: boolean; toggleIntersection: () => void;
  isPointAlignment: boolean; togglePointAlignment: () => void;
  isAngularAlignment: boolean; toggleAngularAlignment: () => void;
  position: DockPosition;
  onPositionChange: (pos: DockPosition) => void;
  hasSiteMap?: boolean;
  onOpenSiteMapPanel?: () => void;
}

export const SnapBar: React.FC<SnapBarProps> = ({ 
  isOrtho, toggleOrtho, isGrid, toggleGrid, isSnap, toggleSnap, 
  isEndpoint, toggleEndpoint, isMidpoint, toggleMidpoint, isIntersection, toggleIntersection,
  isPointAlignment, togglePointAlignment,
  isAngularAlignment, toggleAngularAlignment,
  position, onPositionChange,
  hasSiteMap, onOpenSiteMapPanel
}) => {
  const isVertical = position === 'left' || position === 'right';

  return (
    <DraggableToolbar name="Snap Bar" position={position} onPositionChange={onPositionChange}>
      <ToolbarButton active={isOrtho} onClick={toggleOrtho} icon={<OrthoIcon size={14} />} label="Ortho (F8)" variant="neutral" className="!p-1.5 px-2 !shadow-none !scale-100" />
      <ToolbarButton active={isGrid} onClick={toggleGrid} icon={<Grid3X3 size={14} />} label="Grid (F7)" variant="neutral" className="!p-1.5 px-2 !shadow-none !scale-100" />
      <ToolbarButton active={isSnap && isGrid} disabled={!isGrid} onClick={toggleSnap} icon={<Crosshair size={14} />} label="Grid Snap (F9)" variant="neutral" className="!p-1.5 px-2 !shadow-none !scale-100" />
      <div className={`bg-slate-200 ${isVertical ? 'h-px mx-2 my-1' : 'w-px my-2 mx-1'}`} />
      <ToolbarButton active={isAngularAlignment} onClick={toggleAngularAlignment} icon={<Compass size={14} />} label="Angular Alignment (Parallel/Perp/45°)" variant="neutral" className="!p-1.5 px-2 !shadow-none !scale-100" />
      <ToolbarButton active={isPointAlignment} onClick={togglePointAlignment} icon={<Target size={14} />} label="Point Alignment (H/V)" variant="neutral" className="!p-1.5 px-2 !shadow-none !scale-100" />
      <div className={`bg-slate-200 ${isVertical ? 'h-px mx-2 my-1' : 'w-px my-2 mx-1'}`} />
      <ToolbarButton active={isEndpoint} onClick={toggleEndpoint} icon={<Square size={14} />} label="Endpoint" variant="neutral" className="!p-1.5 px-2 !shadow-none !scale-100" />
      <ToolbarButton active={isMidpoint} onClick={toggleMidpoint} icon={<Triangle size={14} />} label="Midpoint" variant="neutral" className="!p-1.5 px-2 !shadow-none !scale-100" />
      <ToolbarButton active={isIntersection} onClick={toggleIntersection} icon={<CloseIcon size={14} />} label="Intersection" variant="neutral" className="!p-1.5 px-2 !shadow-none !scale-100" />
    </DraggableToolbar>
  );
};
