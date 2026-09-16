import React, { useRef, useEffect, useState, useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';
import { Project, ArchElement, Point, EditorState, ElementType, EditorTool, ProceduralConfig, AssetType } from '../types';
import {
  GRID_SIZE,
  WALL_THICKNESS_DEFAULT,
  WALL_HEIGHT_DEFAULT,
  DOOR_WIDTH_DEFAULT,
  WINDOW_WIDTH_DEFAULT,
  APP_COLORS,
  DEFAULT_PROJECT_SETTINGS_3D,
  PROCEDURAL_TYPOLOGIES,
  getCanonicalInteriorPreset,
  inferInteriorSeatCount,
  normalizeInteriorSubType
} from '../constants';
import { formatDimension, parseDimension, formatArea, generateRoomLabel, globalInchesDecimalPlaces } from '../App';
import { ProceduralLayoutEngine } from '../services/proceduralService';
import { SmartProceduralLayoutEngine } from '../smart-procedural/smartProceduralService';
import { AutoProceduralLayoutEngine } from '../services/autoProceduralService';
import { VectorPdfCanvasContext, downloadVectorPdf } from '../services/vectorPdf';
import { VectorDxfCanvasContext, downloadVectorDxf } from '../services/vectorDxf';
import {
  circularArcFromThreePoints,
  curveLength as analyticCurveLength,
  getCurveBoxPoints,
  getCurvePoint as analyticGetCurvePoint,
  getCurveSource as analyticGetCurveSource,
  isClosedCurveElement,
  isCurvedElement as analyticIsCurvedElement,
  norm01,
  rotateCurveMetadata,
  sampleCurveElement,
  splitCurveElement,
  translateCurveMetadata,
  TAU,
} from '../services/geometry/curveGeometry';
import { drawInteriorBedSymbol, hasInteriorBedSymbol } from './interiorBedSymbols';


// Ray-casting helper to find orthogonal boundaries around a point to auto-dimension room labels
function getEnclosedSpace(px: number, py: number, elements: ArchElement[]) {
  const walls = elements.filter(el => el.type === 'wall' && el.p1 && el.p2);
  
  let x_left: number | null = null;
  let x_right: number | null = null;
  let y_up: number | null = null;
  let y_down: number | null = null;
  
  const LIMIT = 10000; // sufficiently far boundary
  
  for (const wall of walls) {
    const wp1 = wall.p1!;
    const wp2 = wall.p2!;
    
    // Check East (+X)
    const intEast = getLineIntersection(wp1, wp2, { x: px, y: py }, { x: LIMIT, y: py });
    if (intEast) {
      if (x_right === null || intEast.x < x_right) {
        x_right = intEast.x;
      }
    }
    
    // Check West (-X)
    const intWest = getLineIntersection(wp1, wp2, { x: px, y: py }, { x: -LIMIT, y: py });
    if (intWest) {
      if (x_left === null || intWest.x > x_left) {
        x_left = intWest.x;
      }
    }
    
    // Check South (+Y)
    const intSouth = getLineIntersection(wp1, wp2, { x: px, y: py }, { x: px, y: LIMIT });
    if (intSouth) {
      if (y_down === null || intSouth.y < y_down) {
        y_down = intSouth.y;
      }
    }
    
    // Check North (-Y)
    const intNorth = getLineIntersection(wp1, wp2, { x: px, y: py }, { x: px, y: -LIMIT });
    if (intNorth) {
      if (y_up === null || intNorth.y > y_up) {
        y_up = intNorth.y;
      }
    }
  }
  
  if (x_left !== null && x_right !== null && y_up !== null && y_down !== null) {
    const width = x_right - x_left;
    const depth = y_down - y_up;
    return {
      enclosed: true,
      width,
      depth,
      center: { x: (x_left + x_right) / 2, y: (y_up + y_down) / 2 }
    };
  }
  
  return { enclosed: false, width: 5.3, depth: 6.0, center: { x: px, y: py } };
}

interface CanvasProps {
  project: Project;
  editorState: EditorState;
  activeLevelId: string; // New prop for active level
  onElementsChange: (elements: ArchElement[]) => void;
  onElementsCommit: (elements: ArchElement[]) => void;
  onSelectionChange: (ids: string[]) => void;
  onTransformChange: (offset: Point, zoom: number) => void;
  setEditorState: React.Dispatch<React.SetStateAction<EditorState>>;
  activeProceduralConfig: ProceduralConfig | null;
  placingImportedElements?: ArchElement[] | null;
  onDropImportedElements?: (elements: ArchElement[]) => void;
  onCancelImportedElements?: () => void;
  rasterUnderlay?: CanvasRasterUnderlay | null;
}

export interface CanvasRasterUnderlay {
  imageUrl: string;
  opacity?: number;
  pixelReferenceBounds: { minX: number; minY: number; maxX: number; maxY: number };
  worldReferenceBounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface VectorPdfExportOptions {
  sheetWidthMm: number;
  sheetHeightMm: number;
  scale: number;
  marginMm: number;
  fileName: string;
}

export interface CanvasHandle {
  exportVectorPdf: (options: VectorPdfExportOptions) => Promise<void>;
  exportVectorDxf: (fileName?: string) => Promise<void>;
}

interface RenderTarget {
  context?: CanvasRenderingContext2D;
  canvas?: { width: number; height: number };
  isExport?: boolean;
  wallBorderScreenPx?: number;
}

const PDF_STYLE_REFERENCE_SCALE = 200;
const CANVAS_WALL_BORDER_PX = 2.0;
const RESIZE_HANDLE_HIT_RADIUS_PX = 14;
const RESIZE_HANDLE_DRAW_RADIUS_PX = 6;
const FLIP_CONTROL_RADIUS_PX = 8;
const FLIP_CONTROL_HIT_SIZE_PX = 18;
const FLIP_CONTROL_EDGE_GAP_PX = 30;
const DXF_BLOCK_ELEMENT_TYPES = new Set<ElementType>([
  'door', 'window', 'wall-opening', 'column', 'floor', 'ceiling',
  'stair', 'railing', 'furniture', 'counter', 'fixture', 'asset',
]);

interface DxfBlockIdentity {
  name: string;
  familyKey: string;
  rotation: number;
}

const dxfDimension = (value?: number): number => Math.round((value || 0) * 1000);
const dxfNear = (value: number | undefined, target: number): boolean => Math.abs((value || 0) - target) < 0.002;

const getDxfBlockIdentity = (element: ArchElement, hostThickness = 0): DxfBlockIdentity => {
  const subtype = normalizeInteriorSubType(element.subType, element.label, element.shape).toLowerCase();
  const width = element.width;
  const depth = element.depth;
  let name = element.type.toUpperCase().replace(/[^A-Z0-9]+/g, '_');

  if (element.type === 'door') {
    if (subtype.includes('double')) name = dxfNear(width, 1.829) ? 'DOOR_DOUBLE_ENTRY' : 'DOOR_DOUBLE_INTERIOR';
    else if (subtype.includes('sliding')) name = 'DOOR_SLIDING';
    else if (subtype.includes('folding')) name = 'DOOR_FOLDING';
    else if (subtype.includes('glass')) name = 'DOOR_GLASS';
    else if (dxfNear(width, 0.686)) name = 'DOOR_SINGLE_BATH';
    else if (dxfNear(width, 0.838)) name = 'DOOR_SINGLE_BEDROOM';
    else if (dxfNear(width, 0.914)) name = 'DOOR_SINGLE_OFFICE';
    else if (dxfNear(width, 1.219)) name = 'DOOR_SINGLE_ENTRY';
    else name = 'DOOR_SINGLE';
  } else if (element.type === 'window') {
    if (subtype.includes('angled-bay')) name = 'WINDOW_BAY_ANGLED';
    else if (subtype.includes('box-bay')) name = 'WINDOW_BAY_BOX';
    else if (subtype.includes('curved-bay')) name = 'WINDOW_BAY_CURVED';
    else if (dxfNear(width, 0.914)) name = 'WINDOW_REGULAR_3X4';
    else if (dxfNear(width, 1.219)) name = 'WINDOW_REGULAR_4X4';
    else if (dxfNear(width, 1.524)) name = 'WINDOW_REGULAR_5X4';
    else if (dxfNear(width, 1.829)) name = 'WINDOW_LIVING_6X4';
    else name = 'WINDOW_REGULAR';
  } else if (element.type === 'wall-opening') {
    name = 'OPENING';
  } else if (element.type === 'column') {
    if (element.shape === 'circle') name = dxfNear(width, 0.3) ? 'COLUMN_ROUND_300' : 'COLUMN_ROUND';
    else if (dxfNear(width, 0.23) && dxfNear(depth, 0.23)) name = 'COLUMN_RECT_230';
    else if (dxfNear(width, 0.3) && dxfNear(depth, 0.3)) name = 'COLUMN_RECT_300';
    else if (dxfNear(width, 0.45) && dxfNear(depth, 0.45)) name = 'COLUMN_RECT_450';
    else if (dxfNear(width, 0.6) && dxfNear(depth, 0.6)) name = 'COLUMN_RECT_600';
    else name = 'COLUMN_RECT';
  } else if (element.type === 'counter') {
    name = subtype === 'island' ? 'COUNTER_ISLAND' : 'COUNTER_KITCHEN';
  } else if (element.type === 'fixture') {
    name = ({ wc: 'WC', basin: 'BASIN', bath: 'BATHTUB', shower: 'SHOWER', sink: 'SINK', stove: 'STOVE', fridge: 'FRIDGE', washer: 'WASHER' } as Record<string, string>)[subtype] || 'FIXTURE';
  } else if (element.type === 'furniture') {
    const furnitureNames: Record<string, string> = {
      bed_single: 'BED_SINGLE', bed_queen: 'BED_QUEEN', bed_king: 'BED_KING', hospital_bed: 'BED_HOSPITAL',
      table_4: 'TABLE_DINING_4', table_6: 'TABLE_DINING_6', coffee: 'TABLE_COFFEE',
      table_cafe: 'TABLE_CAFE', conference: 'TABLE_CONFERENCE', desk: 'DESK', office_chair: 'OFFICE_CHAIR',
      reception: 'RECEPTION_COUNTER', filing: 'FILING_CABINET', wardrobe: 'WARDROBE', bedside: 'BEDSIDE_TABLE',
      tv_console: 'TV_UNIT', shelf: 'DISPLAY_SHELF', cashier: 'CHECKOUT_COUNTER', whiteboard: 'WHITEBOARD',
    };
    if (subtype === 'sofa') {
      name = dxfNear(width, 0.9) ? 'SOFA_1_SEAT' : dxfNear(width, 1.5) ? 'SOFA_2_SEAT' : dxfNear(width, 2.1) ? 'SOFA_3_SEAT' : 'SOFA';
    } else name = furnitureNames[subtype] || 'FURNITURE';
  } else if (element.type === 'stair') {
    name = `STAIR_${(subtype || 'linear').toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`;
  } else if (element.type === 'railing') {
    name = 'RAILING_BALCONY';
  } else if (element.type === 'floor') {
    name = 'FLOOR';
  } else if (element.type === 'ceiling') {
    name = 'CEILING';
  } else if (element.type === 'asset') {
    name = `ASSET_${(element.assetType || 'OBJECT').toUpperCase()}`;
  }

  const rotation = element.type === 'railing' && element.p1 && element.p2
    ? Math.atan2(element.p2.y - element.p1.y, element.p2.x - element.p1.x) * 180 / Math.PI
    : (element.rotation || 0);
  const geometryKey = element.type === 'floor' || element.type === 'ceiling' || element.type === 'stair'
    ? element.id
    : [
        dxfDimension(width), dxfDimension(depth), dxfDimension(hostThickness),
        element.shape || '', element.isFlipped ? 'F1' : 'F0', element.facingFlipped ? 'R1' : 'R0',
        element.type === 'railing' && element.p1 && element.p2 ? dxfDimension(Math.hypot(element.p2.x - element.p1.x, element.p2.y - element.p1.y)) : '',
        element.type === 'asset' ? Math.round((element.scale || 1) * 1000) : '',
      ].join('|');
  return { name, familyKey: `${name}|${geometryKey}`, rotation };
};

interface Segment {
  p1: Point;
  p2: Point;
  ownerId: string;
}

type InteriorSnapEdge = 'back' | 'left' | 'right';
type InteriorSnapMode = 'back-side' | 'back-only' | 'angle-only';

const stableInteriorSymbolTokens = [
  'counter_l_kitchen',
  'sofa_l_sectional_extendable',
  'desk_l',
  'cntr_u_kitchen',
  'cntr_peninsula',
  'cntr_kitchen_appliance_run',
  'vanity_double_sink',
  'counter_reception_l',
  'counter_bar_straight',
  'restaurant_booth_4',
];

const shouldKeepStableInteriorSymbolBase = (el: ArchElement): boolean => {
  if (!['furniture', 'fixture', 'counter'].includes(el.type)) return false;
  const subType = normalizeInteriorSubType(el.subType, el.label, el.shape).toLowerCase();
  return el.shape === 'L' || el.shape === 'U' || stableInteriorSymbolTokens.some((token) => subType.includes(token));
};

const getStableInteriorSymbolBase = (el: ArchElement) => {
  const preset = getCanonicalInteriorPreset(el.subType) || getCanonicalInteriorPreset(el.label);
  return {
    width: el.symbolBaseWidth || preset?.width,
    depth: el.symbolBaseDepth || preset?.depth,
    leftArmDepth: el.symbolLeftArmDepth,
    rightArmDepth: el.symbolRightArmDepth,
    lockScale: true,
  };
};

const withStableInteriorSymbolBase = (el: ArchElement, fallbackSize: { w: number; d: number }): ArchElement => {
  if (!shouldKeepStableInteriorSymbolBase(el)) return el;
  const preset = getCanonicalInteriorPreset(el.subType) || getCanonicalInteriorPreset(el.label);
  return {
    ...el,
    symbolBaseWidth: el.symbolBaseWidth || preset?.width || fallbackSize.w,
    symbolBaseDepth: el.symbolBaseDepth || preset?.depth || fallbackSize.d,
  };
};

const isUShapedInteriorElement = (el: ArchElement): boolean => {
  const subType = normalizeInteriorSubType(el.subType, el.label, el.shape).toLowerCase();
  return el.shape === 'U' || subType.includes('cntr_u_kitchen');
};

const isLShapedInteriorElement = (el: ArchElement): boolean => {
  if (!['furniture', 'fixture', 'counter'].includes(el.type)) return false;
  const subType = normalizeInteriorSubType(el.subType, el.label, el.shape).toLowerCase();
  return el.shape === 'L' || subType.includes('counter_l') || subType.includes('desk_l') || subType.includes('sofa_l');
};

// --- GEOMETRY & OPTIMIZATION HELPERS ---

const isInViewport = (el: ArchElement, minX: number, maxX: number, minY: number, maxY: number) => {
    const pad = 10;
    if (el.p1 && el.p2) {
        const x1 = el.p1.x, x2 = el.p2.x, y1 = el.p1.y, y2 = el.p2.y;
        const p = (el.thickness || 1) + pad;
        const exMin = x1 < x2 ? x1 : x2;
        const exMax = x1 > x2 ? x1 : x2;
        const eyMin = y1 < y2 ? y1 : y2;
        const eyMax = y1 > y2 ? y1 : y2;
        return !(exMax < minX - p || exMin > maxX + p || eyMax < minY - p || eyMin > maxY + p);
    }
    if (el.pos) {
        const p = (el.width || 5) + pad;
        return !(el.pos.x < minX - p || el.pos.x > maxX + p || el.pos.y < minY - p || el.pos.y > maxY + p);
    }
    if (el.boundary && el.boundary.length > 0) {
        let exMin = Infinity, exMax = -Infinity, eyMin = Infinity, eyMax = -Infinity;
        for (let i = 0; i < el.boundary.length; i++) {
            const bp = el.boundary[i];
            if (bp.x < exMin) exMin = bp.x; if (bp.x > exMax) exMax = bp.x;
            if (bp.y < eyMin) eyMin = bp.y; if (bp.y > eyMax) eyMax = bp.y;
        }
        return !(exMax < minX || exMin > maxX || eyMax < minY || eyMin > maxY);
    }
    return true;
};

// Pure Geometry Helpers

const getFlowyControlPoint = (startPt: Point, endPt: Point, elements: ArchElement[]): Point => {
    // Find previous arc ending exactly at startPt
    const prevArc = elements.find(el => (el.type === 'arc' || el.wallSource === 'arc') && el.p1 && el.p2 && el.controlPoint && Math.hypot(el.p2.x - startPt.x, el.p2.y - startPt.y) < 0.01);
    
    if (prevArc && prevArc.controlPoint) {
        // Tangent continuity: control point should extend from startPt away from previous controlPoint
        const dx = startPt.x - prevArc.controlPoint.x;
        const dy = startPt.y - prevArc.controlPoint.y;
        const dirLen = Math.hypot(dx, dy) || 1;
        const chordDist = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y) / 2;
        return { 
            x: startPt.x + (dx/dirLen) * chordDist, 
            y: startPt.y + (dy/dirLen) * chordDist 
        };
    } else {
        // First arc: Bulge slightly to the right of the chord path
        const dx = endPt.x - startPt.x;
        const dy = endPt.y - startPt.y;
        const midX = (startPt.x + endPt.x) / 2;
        const midY = (startPt.y + endPt.y) / 2;
        return { 
            x: midX - dy * 0.25, 
            y: midY + dx * 0.25 
        };
    }
};

const placementTools = new Set<EditorTool>(['door', 'window', 'wall-opening', 'column', 'furniture', 'fixture', 'counter']);

const getNextGridLabel = (elements: ArchElement[], p1?: Point | null, p2?: Point | null): string => {
  if (!p1 || !p2) {
    const grids = elements.filter(el => el.type === 'gridline');
    if (grids.length === 0) return '1';
    const lastGrid = grids[grids.length - 1];
    const lastLabel = lastGrid.label || '1';
    const num = parseInt(lastLabel, 10);
    if (!isNaN(num)) return String(num + 1);
    if (lastLabel.length === 1) {
      const charCode = lastLabel.charCodeAt(0);
      if ((charCode >= 65 && charCode < 90) || (charCode >= 97 && charCode < 122)) {
        return String.fromCharCode(charCode + 1);
      }
    }
    return '1';
  }

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const isVertical = Math.abs(dy) > Math.abs(dx);
  
  const sameCategoryGrids = elements.filter(el => {
    if (el.type !== 'gridline' || !el.p1 || !el.p2) return false;
    const elVertical = Math.abs(el.p2.y - el.p1.y) > Math.abs(el.p2.x - el.p1.x);
    return elVertical === isVertical;
  });

  if (sameCategoryGrids.length === 0) {
    // Revit standard: Vertical grids get Letters (A, B, C), horizontal grids get Numbers (1, 2, 3)
    return isVertical ? 'A' : '1';
  }

  const lastGrid = sameCategoryGrids[sameCategoryGrids.length - 1];
  const lastLabel = lastGrid.label || (isVertical ? 'A' : '1');
  
  const num = parseInt(lastLabel, 10);
  if (!isNaN(num)) {
    return String(num + 1);
  }
  
  if (lastLabel.length === 1) {
    const charCode = lastLabel.charCodeAt(0);
    if ((charCode >= 65 && charCode < 90) || (charCode >= 97 && charCode < 122)) {
      if (charCode === 90) return 'ZA'; // handles wrap around simple case
      if (charCode === 122) return 'za';
      return String.fromCharCode(charCode + 1);
    }
  }
  
  return isVertical ? 'A' : '1';
};

// ==========================================
// PURE GEOMETRY HELPERS
// ==========================================

const isCurvedElement = analyticIsCurvedElement;
const isClosedCurveWall = isClosedCurveElement;
const getCurveSource = analyticGetCurveSource;

const getCurveParams = (el: ArchElement) => {
    const box = getCurveBoxPoints(el);
    if (!box) return { cx: 0, cy: 0, r: 0, rx: 0, ry: 0, source: null };
    const { boxP1, boxP2 } = box;
    const source = getCurveSource(el);
    if (source === 'circle') {
        const cx = boxP1.x, cy = boxP1.y;
        const r = Math.hypot(boxP2.x - boxP1.x, boxP2.y - boxP1.y);
        return { cx, cy, r, rx: r, ry: r, source };
    } else if (source === 'ellipse') {
        const center = el.ellipseCenter || { x: (boxP1.x + boxP2.x) / 2, y: (boxP1.y + boxP2.y) / 2 };
        const cx = center.x, cy = center.y;
        const rx = el.ellipseRadiusX ?? Math.abs(boxP2.x - boxP1.x) / 2;
        const ry = el.ellipseRadiusY ?? Math.abs(boxP2.y - boxP1.y) / 2;
        return { cx, cy, rx, ry, r: Math.min(rx, ry), source };
    }
    return { cx: 0, cy: 0, r: 0, rx: 0, ry: 0, source: null };
};

const getCurvePoint = analyticGetCurvePoint;
const getWallLength = (wall: ArchElement): number => analyticCurveLength(wall, 64);

const updateHostedOpenings = (wall: ArchElement, elements: ArchElement[]): ArchElement[] => {
  if (!wall.p1 || !wall.p2) return elements;
  return elements.map(el => {
    if ((el.type === 'door' || el.type === 'window' || el.type === 'wall-opening') && el.hostWallId === wall.id && typeof el.hostT === 'number') {
      if (isCurvedElement(wall)) {
        // Improved logic: Position as a chord between two points on the curve
        const width = el.width || 0.8;
        
        // Estimate local speed (dS/dt) at current hostT to find parameter width dt
        const eps = 0.001;
        const pMid = getCurvePoint(wall, el.hostT);
        if (!pMid) return el;
        
        const pNext = getCurvePoint(wall, el.hostT + eps) || pMid;
        const pPrev = getCurvePoint(wall, el.hostT - eps) || pMid;
        const dS = Math.hypot(pNext.x - pPrev.x, pNext.y - pPrev.y);
        const speed = dS / (eps * 2);
        
        if (speed < 0.0001) return el;
        
        let dt = width / speed;
        
        // One iteration of refinement for perfect chord alignment
        let p1 = getCurvePoint(wall, el.hostT - dt / 2);
        let p2 = getCurvePoint(wall, el.hostT + dt / 2);
        
        if (p1 && p2) {
          const chordLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
          if (chordLen > 0.01) {
            dt *= (width / chordLen);
            p1 = getCurvePoint(wall, el.hostT - dt / 2) || p1;
            p2 = getCurvePoint(wall, el.hostT + dt / 2) || p2;
          }
        }
        
        if (p1 && p2) {
          const rotation = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
          return {
            ...el,
            pos: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
            rotation
          };
        }

        // Fallback to tangent if chord calculation fails
        const angle = Math.atan2(pNext.y - pMid.y, pNext.x - pMid.x) * (180 / Math.PI);
        return {
          ...el,
          pos: { x: pMid.x, y: pMid.y },
          rotation: angle
        };
      }
      const dx = wall.p2.x - wall.p1.x;
      const dy = wall.p2.y - wall.p1.y;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      return { ...el, pos: { x: wall.p1.x + dx * el.hostT, y: wall.p1.y + dy * el.hostT }, rotation: angle };
    }
    return el;
  });
};

const getLineIntersection = (p1: Point, p2: Point, p3: Point, p4: Point): Point | null => {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return null;
  const u = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const v = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
    return { x: p1.x + u * (p2.x - p1.x), y: p1.y + u * (p2.y - p1.y) };
  }
  return null;
};

const getInfiniteLineIntersection = (p1: Point, p2: Point, p3: Point, p4: Point): Point | null => {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return null;
  const u = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  return { x: p1.x + u * (p2.x - p1.x), y: p1.y + u * (p2.y - p1.y) };
};

const insetPolygon = (poly: Point[], offset: number): Point[] => {
  const result: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const pPrev = poly[(i + poly.length - 1) % poly.length];
    const pCurr = poly[i];
    const pNext = poly[(i + 1) % poly.length];

    const v1 = { x: pCurr.x - pPrev.x, y: pCurr.y - pPrev.y };
    const v2 = { x: pNext.x - pCurr.x, y: pNext.y - pCurr.y };

    const l1 = Math.hypot(v1.x, v1.y) || 1;
    const l2 = Math.hypot(v2.x, v2.y) || 1;

    // Normal vectors pointing "inward" (assuming counter-clockwise orientation)
    // If results look outward, flip signs of n1/n2 components
    const n1 = { x: -v1.y / l1, y: v1.x / l1 };
    const n2 = { x: -v2.y / l2, y: v2.x / l2 };

    const bisector = { x: n1.x + n2.x, y: n1.y + n2.y };
    const lB = Math.hypot(bisector.x, bisector.y) || 1;
    const bisectorNorm = { x: bisector.x / lB, y: bisector.y / lB };

    const cosHalfAngle = n1.x * bisectorNorm.x + n1.y * bisectorNorm.y;
    const d = offset / Math.max(0.1, Math.abs(cosHalfAngle));

    result.push({ x: pCurr.x + bisectorNorm.x * d, y: pCurr.y + bisectorNorm.y * d });
  }
  return result;
};

const performSplitOnElement = (elements: ArchElement[], targetId: string, t: number, pt: Point): ArchElement[] => {
  const el = elements.find(e => e.id === targetId);
  if (!el || !el.p1 || !el.p2) return elements;

  if (t < 0.015 || t > 0.985) return elements;

  const out = elements.filter(e => e.id !== targetId && e.hostWallId !== targetId);
  const split = splitCurveElement(el, t);
  if (!split) return elements;
  const id1 = crypto.randomUUID();
  const id2 = crypto.randomUUID();
  out.push({ ...split[0], id: id1 });
  out.push({ ...split[1], id: id2 });

  // Redistribute hosted elements
  elements.forEach(oe => {
      if (oe.hostWallId === el.id && oe.hostT !== undefined) {
          if (oe.hostT < t) {
              out.push({ ...oe, hostWallId: id1, hostT: oe.hostT / t });
          } else {
              out.push({ ...oe, hostWallId: id2, hostT: (oe.hostT - t) / (1 - t) });
          }
      }
  });
  return out;
};

const performAutoSplit = (elements: ArchElement[]): ArchElement[] => {
  // Text 4.0 F/G/H digitization previews are authoritative raster-derived
  // payload. Re-running the interactive pairwise auto-split pass over its
  // sampled curves both blocks the browser and can turn a short native arc
  // into a pathological fragment. User-created/ordinary project geometry
  // keeps the existing auto-split behavior.
  if (elements.some(element => element.metadata?.text4fAuthoritativePreview === true || element.metadata?.text4gAuthoritativePreview === true || element.metadata?.text4hAuthoritativePreview === true || element.metadata?.text4jAuthoritativePreview === true)) return elements;
  let anyChanged = false;
  // ...
  let changed = true;
  let out = [...elements];
  let iterations = 0;

  const getWallSegments = (w: ArchElement) => {
      const segs = [];
      if (!w.p1 || !w.p2) return segs;
      if (!isCurvedElement(w)) {
         segs.push({ p1: w.p1, p2: w.p2, t1: 0, t2: 1 });
      } else {
         let prev = getCurvePoint(w, 0)!;
         const N = 40;
         for(let i=1; i<=N; i++) {
            const pt = getCurvePoint(w, i/N)!;
            segs.push({ p1: prev, p2: pt, t1: (i-1)/N, t2: i/N });
            prev = pt;
         }
      }
      return segs;
  };

  while (changed && iterations < 10) {
      changed = false;
      iterations++;
      
      const walls = out.filter(e => e.type === 'wall' && e.p1 && e.p2);
      
      for(let i=0; i<walls.length; i++) {
          for(let j=i+1; j<walls.length; j++) {
              const w1 = walls[i];
              const w2 = walls[j];
              
              // Skip if sharing an exact endpoint
              if ((Math.hypot(w1.p1!.x - w2.p1!.x, w1.p1!.y - w2.p1!.y) < 0.01) ||
                  (Math.hypot(w1.p1!.x - w2.p2!.x, w1.p1!.y - w2.p2!.y) < 0.01) ||
                  (Math.hypot(w1.p2!.x - w2.p1!.x, w1.p2!.y - w2.p1!.y) < 0.01) ||
                  (Math.hypot(w1.p2!.x - w2.p2!.x, w1.p2!.y - w2.p2!.y) < 0.01)) continue;

              const s1 = getWallSegments(w1);
              const s2 = getWallSegments(w2);
              
              let foundSplit = false;
              let t1Split = 0, t2Split = 0;
              let ptSplit: Point | null = null;
              let doSplitW1 = false, doSplitW2 = false;
              
              for (const seg1 of s1) {
                  for (const seg2 of s2) {
                      const int = getLineIntersection(seg1.p1, seg1.p2, seg2.p1, seg2.p2);
                      if (int) {
                          const len1 = Math.hypot(seg1.p2.x - seg1.p1.x, seg1.p2.y - seg1.p1.y);
                          const frac1 = len1 > 1e-6 ? Math.hypot(int.x - seg1.p1.x, int.y - seg1.p1.y) / len1 : 0;
                          const tA = seg1.t1 + frac1 * (seg1.t2 - seg1.t1);
                          
                          const len2 = Math.hypot(seg2.p2.x - seg2.p1.x, seg2.p2.y - seg2.p1.y);
                          const frac2 = len2 > 1e-6 ? Math.hypot(int.x - seg2.p1.x, int.y - seg2.p1.y) / len2 : 0;
                          const tB = seg2.t1 + frac2 * (seg2.t2 - seg2.t1);
                          
                          const margin = 0.02;
                  // check if interior intersection
                  const isInterior = (t: number, w: ArchElement) => {
                      if (isClosedCurveWall(w)) {
                          // Allow splitting anywhere on closed curve, but avoid exactly the split-logic seam
                          const tMod = ((t % 1) + 1) % 1;
                          return tMod > 1e-4 && tMod < 1 - 1e-4;
                      }
                      return t > margin && t < 1 - margin;
                  };
                  const splitW1 = isInterior(tA, w1);
                  const splitW2 = isInterior(tB, w2);
                  
                  if (splitW1 || splitW2) {
                      t1Split = tA;
                      t2Split = tB;
                      ptSplit = int;
                      doSplitW1 = splitW1;
                      doSplitW2 = splitW2;
                      foundSplit = true;
                      break;
                  }
              }
          }
          if (foundSplit) break;
      }
      
      if (foundSplit && ptSplit) {
          // Perform splitting
          const newElements = out.filter(e => e.id !== w1.id && e.id !== w2.id);
          const splitMap = new Map<string, { t: number; id1: string; id2: string }>();
          
          const applySplit = (w: ArchElement, t: number, pt: Point) => {
              const id1 = crypto.randomUUID();
              const id2 = crypto.randomUUID();
              splitMap.set(w.id, { t, id1, id2 });
              const split = splitCurveElement(w, t);
              if (split) {
                  newElements.push({ ...split[0], id: id1 });
                  newElements.push({ ...split[1], id: id2 });
              } else {
                  newElements.push({ ...w, id: id1, p2: pt });
                  newElements.push({ ...w, id: id2, p1: pt });
              }
          };
          
          if (doSplitW1) applySplit(w1, t1Split, ptSplit);
          else newElements.push(w1);
          
          if (doSplitW2) applySplit(w2, t2Split, ptSplit);
          else newElements.push(w2);
          
          out = newElements.map(item => {
              const split = item.hostWallId ? splitMap.get(item.hostWallId) : null;
              if (!split || typeof item.hostT !== 'number') return item;
              if (item.hostT < split.t) {
                  return { ...item, hostWallId: split.id1, hostT: item.hostT / split.t };
              }
              return { ...item, hostWallId: split.id2, hostT: (item.hostT - split.t) / (1 - split.t) };
          });
          changed = true;
          anyChanged = true;
          break;
      }
          }
          if (changed) break;
      }
  }
  return anyChanged ? out : elements;
};

// HELPER: Calculate miter/trim details for arbitrary corner angles
const getTurnInfo = (pPrev: Point, pCurr: Point, pNext: Point, width: number) => {
  // Vectors pointing OUT from corner
  const v1 = { x: pPrev.x - pCurr.x, y: pPrev.y - pCurr.y };
  const v2 = { x: pNext.x - pCurr.x, y: pNext.y - pCurr.y };
  const l1 = Math.hypot(v1.x, v1.y);
  const l2 = Math.hypot(v2.x, v2.y);
  
  if (l1 < 0.001 || l2 < 0.001) return { trim: 0, poly: [] };

  const n1 = { x: v1.x / l1, y: v1.y / l1 };
  const n2 = { x: v2.x / l2, y: v2.y / l2 };

  // Angle between the two segments (0 to 180)
  const dot = n1.x * n2.x + n1.y * n2.y;
  const clampedDot = Math.max(-1, Math.min(1, dot));
  const angle = Math.acos(clampedDot); 

  // Trim distance along centerline
  // d = (w/2) / tan(alpha/2) where alpha is angle between vectors
  const halfTan = Math.tan(angle / 2);
  const trim = Math.abs(halfTan) > 0.0001 ? (width / 2) / halfTan : 0;

  // Directions for normals relative to path
  // Path 1: Prev -> Curr. Vector u1 = -n1.
  const u1 = { x: -n1.x, y: -n1.y };
  // Path 2: Curr -> Next. Vector u2 = n2.
  const u2 = { x: n2.x, y: n2.y };

  // Left Normals (rotated -90deg from direction u: x->y, y->-x)
  const leftN1 = { x: u1.y, y: -u1.x }; 
  const leftN2 = { x: u2.y, y: -u2.x };

  // Cut points on centerlines
  // pCut1 is back from corner along path 1. Corner is pCurr. Back direction is -u1 = n1.
  const pCut1 = { x: pCurr.x + n1.x * trim, y: pCurr.y + n1.y * trim };
  // pCut2 is forward from corner along path 2. Forward direction is u2 = n2.
  const pCut2 = { x: pCurr.x + n2.x * trim, y: pCurr.y + n2.y * trim };

  const hw = width / 2;
  
  // Vertices at Cut 1
  const v1L = { x: pCut1.x + leftN1.x * hw, y: pCut1.y + leftN1.y * hw };
  const v1R = { x: pCut1.x - leftN1.x * hw, y: pCut1.y - leftN1.y * hw };

  // Vertices at Cut 2
  const v2L = { x: pCut2.x + leftN2.x * hw, y: pCut2.y + leftN2.y * hw };
  const v2R = { x: pCut2.x - leftN2.x * hw, y: pCut2.y - leftN2.y * hw };

  // Identification of inner/outer side to create a square landing
  const dL = Math.hypot(v1L.x - v2L.x, v1L.y - v2L.y);
  const dR = Math.hypot(v1R.x - v2R.x, v1R.y - v2R.y);

  if (dL > dR) {
    // Left side is outer, Right side is inner
    const inner = { x: (v1R.x + v2R.x)/2, y: (v1R.y + v2R.y)/2 }; 
    const corner = getInfiniteLineIntersection(
        v1L, { x: v1L.x + u1.x, y: v1L.y + u1.y },
        v2L, { x: v2L.x + u2.x, y: v2L.y + u2.y }
    );
    if (corner && angle < Math.PI * 0.99 && angle > 0.01) {
        return { trim, poly: [v1L, inner, v2L, corner] };
    }
  } else {
    // Right side is outer, Left side is inner
    const inner = { x: (v1L.x + v2L.x)/2, y: (v1L.y + v2L.y)/2 };
    const corner = getInfiniteLineIntersection(
        v1R, { x: v1R.x + u1.x, y: v1R.y + u1.y },
        v2R, { x: v2R.x + u2.x, y: v2R.y + u2.y }
    );
    if (corner && angle < Math.PI * 0.99 && angle > 0.01) {
        return { trim, poly: [v1R, inner, v2R, corner] };
    }
  }

  // The landing polygon connects these 4 points.
  // We want a closed loop: v1L -> v1R -> v2R -> v2L
  return { trim, poly: [v1L, v1R, v2R, v2L] };
};

// DRAW HELPER FOR DOORS
const drawDoorSymbol = (ctx: CanvasRenderingContext2D, width: number, wallThickness: number, subType: string = 'single', isFlipped: boolean, facingFlipped: boolean, color: string, isGhost: boolean, zoom: number) => {
    const leafThick = 0.04 * zoom;
    const handSign = isFlipped ? 1 : -1;
    const facingSign = facingFlipped ? -1 : 1;
    const type = (subType || 'single').toLowerCase();

    // 1. Draw Opening Solid End Caps (closing the hollow wall endpoints at the door opening)
    ctx.save();
    ctx.lineWidth = 1; // Match wall boundaries exactly
    ctx.strokeStyle = '#1e293b'; // slate-800
    // Draw left cap line
    ctx.beginPath();
    ctx.moveTo(-width / 2, -wallThickness / 2);
    ctx.lineTo(-width / 2, wallThickness / 2);
    ctx.stroke();
    // Draw right cap line
    ctx.beginPath();
    ctx.moveTo(width / 2, -wallThickness / 2);
    ctx.lineTo(width / 2, wallThickness / 2);
    ctx.stroke();
    ctx.restore();

    // 2. Draw Architectural Door Jambs/Stops (small rects at both hinge and strike endpoints)
    const jambW = 0.05 * zoom; // Slightly thinner
    const jambH = 0.09 * zoom; // Slightly smaller
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1; // Matches wall boundaries exactly
    
    // Left Jamb
    ctx.fillRect(-width / 2, -jambH / 2, jambW / 2, jambH);
    ctx.strokeRect(-width / 2, -jambH / 2, jambW / 2, jambH);
    
    // Right Jamb
    ctx.fillRect(width / 2 - jambW / 2, -jambH / 2, jambW / 2, jambH);
    ctx.strokeRect(width / 2 - jambW / 2, -jambH / 2, jambW / 2, jambH);
    ctx.restore();

    // Adjusted opening width and hinge coordinates to start exactly from inner face of Jambs
    const cleanWidth = width - jambW;
    const hingeX = handSign * (cleanWidth / 2);

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    
    if (type.includes('double')) {
        const hingeY = 0; // Offset door inward to center
        const leafW = cleanWidth / 2;
        const tSlab = 0.05 * zoom;

        // Leaves as hollow rectangles starting from jamb inner face
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1; // Match wall boundary
        
        // Left Leaf (swings from -cleanWidth/2)
        const lX = -cleanWidth / 2;
        const lY = facingSign === 1 ? hingeY : hingeY - leafW;
        ctx.beginPath();
        ctx.rect(lX, lY, tSlab, leafW);
        ctx.fill();
        ctx.stroke();

        // Right Leaf (swings from cleanWidth/2)
        const rX = cleanWidth / 2 - tSlab;
        const rY = facingSign === 1 ? hingeY : hingeY - leafW;
        ctx.beginPath();
        ctx.rect(rX, rY, tSlab, leafW);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Arcs starting from jamb inner face
        ctx.save();
        ctx.strokeStyle = isGhost ? color : (color === APP_COLORS.highlight ? color : 'rgba(47, 47, 47, 0.35)');
        ctx.lineWidth = 1;
        
        // Left Arc (Hinge at -cleanWidth/2)
        ctx.beginPath();
        ctx.arc(-cleanWidth/2, hingeY, leafW, 0, facingSign * Math.PI/2, facingSign === 1 ? false : true);
        ctx.stroke();
        
        // Right Arc (Hinge at cleanWidth/2)
        ctx.beginPath();
        const endAng = facingSign === 1 ? Math.PI/2 : -Math.PI/2;
        ctx.arc(cleanWidth/2, hingeY, leafW, Math.PI, endAng, facingSign === 1 ? true : false);
        ctx.stroke();
        ctx.restore();

    } else if (type.includes('pocket')) {
        // A pocket door has no swing arc; show one leaf sliding in the wall line.
        const panelH = wallThickness / 3;
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.fillRect(-cleanWidth / 2, -panelH / 2, cleanWidth, panelH);
        ctx.strokeRect(-cleanWidth / 2, -panelH / 2, cleanWidth, panelH);
        ctx.restore();

    } else if (type.includes('sliding')) {
        const panelW = cleanWidth / 2;
        const panelH = wallThickness / 3;
        const overlap = panelW * 0.1;
        
        // Determine offsets based on facingFlipped
        const y1 = -wallThickness / 4;
        const y2 = wallThickness / 4;
        const offY1 = facingFlipped ? y2 : y1;
        const offY2 = facingFlipped ? y1 : y2;

        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1; // Reduce lineweight of slab edges to match wall edges
        // Left Panel (-cleanWidth/2 to 0)
        ctx.fillRect(-cleanWidth/2, offY1 - panelH/2, panelW + overlap, panelH);
        ctx.strokeRect(-cleanWidth/2, offY1 - panelH/2, panelW + overlap, panelH);
        // Right Panel (0 to cleanWidth/2)
        ctx.fillRect(0 - overlap, offY2 - panelH/2, panelW + overlap, panelH);
        ctx.strokeRect(0 - overlap, offY2 - panelH/2, panelW + overlap, panelH);
        ctx.restore();

    } else if (type.includes('folding')) {
        // Bi-fold (2 panels) starting from jamb inner face
        const hingeY = 0; // Offset door inward to center
        const panelLen = cleanWidth / 2; 
        
        // 45 degrees fold angle
        const alpha = Math.PI / 4; 
        // Slide direction: hinged left means slide right (+1), hinged right means slide left (-1)
        const slideDir = -handSign;

        const p0 = {x: hingeX, y: hingeY};
        const p1 = {
            x: p0.x + slideDir * panelLen * Math.cos(alpha),
            y: p0.y + facingSign * panelLen * Math.sin(alpha)
        };

        // Second panel turns back towards the track line
        const p2 = {
            x: p1.x + slideDir * panelLen * Math.cos(alpha),
            y: p0.y
        };

        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1; // Match wall edges
        
        const drawFoldingSlab = (startX: number, startY: number, endX: number, endY: number) => {
            const dx = endX - startX;
            const dy = endY - startY;
            const len = Math.hypot(dx, dy);
            if (len < 0.001) return;
            const ux = dx / len;
            const uy = dy / len;
            const h = wallThickness / 4; // outline/depth similar to sliding door slab
            const nx = -uy * (h / 2);
            const ny = ux * (h / 2);

            ctx.beginPath();
            ctx.moveTo(startX + nx, startY + ny);
            ctx.lineTo(endX + nx, endY + ny);
            ctx.lineTo(endX - nx, endY - ny);
            ctx.lineTo(startX - nx, startY - ny);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        };

        drawFoldingSlab(p0.x, p0.y, p1.x, p1.y);
        drawFoldingSlab(p1.x, p1.y, p2.x, p2.y);
        
        ctx.restore();

    } else if (type.includes('glass')) {
        // Glass Door: single line starting from jamb inner face
        const hingeY = 0; // Offset door inward to center
        const tipX = hingeX;
        const tipY = hingeY + (facingSign * cleanWidth);

        ctx.save();
        ctx.lineWidth = 1; // Matches wall outer boundary
        ctx.strokeStyle = color;
        ctx.beginPath();
        ctx.moveTo(hingeX, hingeY);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = isGhost ? color : (color === APP_COLORS.highlight ? color : 'rgba(47, 47, 47, 0.35)');
        ctx.lineWidth = 1;
        const startAngle = Math.atan2(0, -handSign * cleanWidth);
        const endAngle = Math.atan2(facingSign * cleanWidth, 0);
        const anticlockwise = (handSign === facingSign);
        
        ctx.beginPath();
        ctx.arc(hingeX, hingeY, cleanWidth, startAngle, endAngle, anticlockwise);
        ctx.stroke();
        ctx.restore();

    } else {
        // Single / Main Entrance (Default) starting from jamb inner face
        const hingeY = 0; // Offset door inward to center
        const tSlab = 0.05 * zoom;

        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = color;
        ctx.lineWidth = 1; // Match wall boundary
        
        const x = handSign === 1 ? hingeX - tSlab : hingeX;
        const y = facingSign === 1 ? hingeY : hingeY - cleanWidth;
        ctx.beginPath();
        ctx.rect(x, y, tSlab, cleanWidth);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = isGhost ? color : (color === APP_COLORS.highlight ? color : 'rgba(47, 47, 47, 0.35)');
        ctx.lineWidth = 1;
        const startAngle = Math.atan2(0, -handSign * cleanWidth);
        const endAngle = Math.atan2(facingSign * cleanWidth, 0);
        const anticlockwise = (handSign === facingSign);
        
        ctx.beginPath();
        ctx.arc(hingeX, hingeY, cleanWidth, startAngle, endAngle, anticlockwise);
        ctx.stroke();
        ctx.restore();
    }
};
// DRAW HELPER FOR WINDOWS
const drawWindowSymbol = (ctx: CanvasRenderingContext2D, width: number, tS: number, color: string, zoom: number) => {
    const jambW = 0.05 * zoom;
    const jambH = 0.09 * zoom;
    const cleanWidth = width - jambW;

    // 0. Draw filled window base (white) to hide the grid beneath the window
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-width / 2, -tS / 2, width, tS);
    ctx.restore();

    // 1. Draw solid wall end caps (vertical cut lines) at opening edges (-width/2 and width/2)
    ctx.save();
    ctx.strokeStyle = color === APP_COLORS.highlight || color.includes('rgba(59') ? color : '#1e293b';
    ctx.lineWidth = 1; // Match wall edges exactly
    ctx.beginPath();
    ctx.moveTo(-width / 2, -tS / 2);
    ctx.lineTo(-width / 2, tS / 2);
    ctx.moveTo(width / 2, -tS / 2);
    ctx.lineTo(width / 2, tS / 2);
    ctx.stroke();
    ctx.restore();

    // 2. Draw Jamb stops at the two edges of window, center of wall thickness
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = color === APP_COLORS.highlight || color.includes('rgba(59') ? color : '#1e293b';
    ctx.lineWidth = 1; // Match wall edges exactly
    ctx.fillRect(-width / 2, -jambH / 2, jambW / 2, jambH);
    ctx.strokeRect(-width / 2, -jambH / 2, jambW / 2, jambH);
    ctx.fillRect(width / 2 - jambW / 2, -jambH / 2, jambW / 2, jambH);
    ctx.strokeRect(width / 2 - jambW / 2, -jambH / 2, jambW / 2, jambH);
    ctx.restore();

    // 3. Draw horizontal window lines
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1; // Light weight
    ctx.beginPath();
    ctx.moveTo(-width / 2, -tS / 2);
    ctx.lineTo(width / 2, -tS / 2);
    ctx.moveTo(-width / 2, tS / 2);
    ctx.lineTo(width / 2, tS / 2);
    ctx.stroke();
    ctx.restore();

    // Center line: matching wall edge
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1; // Wall edge weight
    ctx.beginPath();
    ctx.moveTo(-cleanWidth / 2, 0);
    ctx.lineTo(cleanWidth / 2, 0);
    ctx.stroke();
    ctx.restore();
};

// DRAW HELPER FOR WALL OPENINGS
const drawWallOpeningSymbol = (ctx: CanvasRenderingContext2D, width: number, tS: number, color: string, zoom: number) => {
    ctx.save();
    ctx.strokeStyle = color;
    
    // 1. Draw solid cut edges (vertical caps)
    ctx.lineWidth = 1; // Match wall edges exactly
    ctx.beginPath();
    ctx.moveTo(-width / 2, -tS / 2);
    ctx.lineTo(-width / 2, tS / 2);
    ctx.moveTo(width / 2, -tS / 2);
    ctx.lineTo(width / 2, tS / 2);
    ctx.stroke();
    
    // 2. Draw dashed horizontal lines (top and bottom edges)
    ctx.lineWidth = 1;
    const dashLen = 0.1 * zoom;
    const gapLen = 0.08 * zoom;
    ctx.setLineDash([dashLen, gapLen]);
    
    ctx.beginPath();
    ctx.moveTo(-width / 2, -tS / 2);
    ctx.lineTo(width / 2, -tS / 2);
    ctx.moveTo(-width / 2, tS / 2);
    ctx.lineTo(width / 2, tS / 2);
    ctx.stroke();
    
    ctx.setLineDash([]);
    ctx.restore();
};


const translateElements = (elements: ArchElement[], delta: Point): ArchElement[] => {
  const translatePoint = (point: Point): Point => ({ x: point.x + delta.x, y: point.y + delta.y });
  return elements.map(el => {
    const newEl = { ...el };
    if (newEl.p1) {
      newEl.p1 = translatePoint(newEl.p1);
    }
    if (newEl.p2) {
      newEl.p2 = translatePoint(newEl.p2);
    }
    if (newEl.p3) {
      newEl.p3 = translatePoint(newEl.p3);
    }
    if (newEl.p4) {
      newEl.p4 = translatePoint(newEl.p4);
    }
    if (newEl.pos) {
      newEl.pos = translatePoint(newEl.pos);
    }
    if (newEl.controlPoint) {
      newEl.controlPoint = translatePoint(newEl.controlPoint);
    }
    if (newEl.arcCenter) {
      newEl.arcCenter = translatePoint(newEl.arcCenter);
    }
    if (newEl.ellipseCenter) {
      newEl.ellipseCenter = translatePoint(newEl.ellipseCenter);
    }
    if (newEl.boundary) {
      newEl.boundary = newEl.boundary.map(translatePoint);
    }
    if (newEl.cadElements) {
      newEl.cadElements = translateElements(newEl.cadElements, delta);
    }
    return newEl;
  });
};


const getElementsCenter = (elements: ArchElement[]): Point => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let hasGeometry = false;
  const includePoint = (point?: Point) => {
    if (!point) return;
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
    hasGeometry = true;
  };
  elements.forEach(el => {
    includePoint(el.p1);
    includePoint(el.p2);
    includePoint(el.p3);
    includePoint(el.p4);
    includePoint(el.pos);
    includePoint(el.controlPoint);
    includePoint(el.arcCenter);
    includePoint(el.ellipseCenter);
    if (el.boundary && el.boundary.length > 0) {
      el.boundary.forEach(includePoint);
    }
    if (el.cadElements) {
      const childCenter = getElementsCenter(el.cadElements);
      if (childCenter.x !== 0 || childCenter.y !== 0 || el.cadElements.length > 0) {
        el.cadElements.forEach(child => {
          includePoint(child.p1);
          includePoint(child.p2);
          includePoint(child.p3);
          includePoint(child.p4);
          includePoint(child.pos);
          includePoint(child.controlPoint);
          includePoint(child.arcCenter);
          includePoint(child.ellipseCenter);
          child.boundary?.forEach(includePoint);
        });
      }
    }
  });
  if (!hasGeometry) return { x: 0, y: 0 };
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
};


const Canvas = forwardRef<CanvasHandle, CanvasProps>(({ 
  project, 
  editorState, 
  activeLevelId, 
  onElementsChange, 
  onElementsCommit, 
  onSelectionChange, 
  onTransformChange, 
  setEditorState,
  activeProceduralConfig,
  placingImportedElements,
  onDropImportedElements,
  onCancelImportedElements,
  rasterUnderlay,
}, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapImageRef = useRef<HTMLImageElement | null>(null);
  const rasterUnderlayImageRef = useRef<HTMLImageElement | null>(null);
  const [rasterUnderlayImageVersion, setRasterUnderlayImageVersion] = useState(0);
  
  // State
  const [isDrawing, setIsDrawing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const isDraggingSelected = !!editorState.isDraggingSelected;
  const setIsDraggingSelected = useCallback((val: boolean) => setEditorState(s => ({ ...s, isDraggingSelected: val })), [setEditorState]);
  const [isDraggingHandle, setIsDraggingHandle] = useState(false);
  
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [mouseDownPos, setMouseDownPos] = useState<Point | null>(null);
  const [marqueeStart, setMarqueeStart] = useState<Point | null>(null);
  const [marqueeEnd, setMarqueeEnd] = useState<Point | null>(null);
  const [isTwoClickMarqueeActive, setIsTwoClickMarqueeActive] = useState(false);
  const [lassoPoints, setLassoPoints] = useState<Point[]>([]);
  const [isLassoActive, setIsLassoActive] = useState(false);
  const [acquiredPoints, setAcquiredPoints] = useState<Point[]>([]);
  const hoverAcquireTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const potentiallyAcquiringPointRef = useRef<Point | null>(null);
  const [lastMousePos, setLastMousePos] = useState<Point>({ x: 0, y: 0 });

  const [snapPreview, setSnapPreview] = useState<{
    point: Point, 
    type: 'grid' | 'endpoint' | 'midpoint' | 'intersection' | 'wall-path' | 'alignment' | 'parallel' | 'perpendicular' | null,
    alignX?: number,
    alignY?: number,
    alignAngled?: Point,
    alignPts?: Point[],
    refSegment?: { p1: Point, p2: Point }
  }>({point: {x:0, y:0}, type: null});
  const [numericBuffer, setNumericBuffer] = useState<string>("");
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const [hoveredIds, setHoveredIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!hoveredElementId) {
      setHoveredIds(new Set());
      return;
    }
    
    const ids = new Set<string>();
    const getRootId = (id: string): string => {
        const el = project.elements.find(e => e.id === id);
        if (el?.groupId) return getRootId(el.groupId);
        return id;
    };
    const addRecursive = (id: string) => {
        if (ids.has(id)) return;
        ids.add(id);
        project.elements.forEach(el => {
            if (el.groupId === id) addRecursive(el.id);
        });
    };

    const rootId = getRootId(hoveredElementId);
    addRecursive(rootId);
    setHoveredIds(ids);
  }, [hoveredElementId, project.elements]);
  const [dragPreviewElements, setDragPreviewElements] = useState<ArchElement[] | null>(null);
  const [screenMousePos, setScreenMousePos] = useState<Point | null>(null);

  const elementsMap = useMemo(() => {
    const map = new Map<string, ArchElement>();
    const elems = dragPreviewElements || project.elements;
    elems.forEach(e => map.set(e.id, e));
    return map;
  }, [project.elements, dragPreviewElements]);
  const isElevationCanvas = editorState.viewMode === '2D' && !!editorState.drawingView && editorState.drawingView !== 'plan';
  const isElevationElement = (el: ArchElement) => isElevationCanvas && !!el.subType?.startsWith('elevation-');
  const isElevationGreyStructure = (el: ArchElement) => {
    if (!isElevationElement(el)) return false;
    const sourceType = el.sourceType || el.type;
    return ['wall', 'column', 'stair', 'floor', 'ceiling'].includes(sourceType);
  };

  // Tab Cycle State
  const [tabState, setTabState] = useState<{ anchor: Point | null; candidates: string[]; index: number; hoverId: string | null; }>({ anchor: null, candidates: [], index: -1, hoverId: null });
  
  // Reset local drawing state when tool changes
  useEffect(() => {
    setIsDrawing(false);
    setDragStart(null);
    setMarqueeStart(null);
    setMarqueeEnd(null);
    setIsTwoClickMarqueeActive(false);
    setLassoPoints([]);
    setIsLassoActive(false);
    setNumericBuffer("");
    setDragPreviewElements(null);
    setRotationBasePoint(null);
    setRotationReferencePoint(null);
    setIsRotating(false);
    setCopyBasePoint(null);
    setMoveBasePoint(null);
    setActiveGrip(null);
    setActiveHandle(null);
    setIsDragging(false);
    setIsDraggingSelected(false);
    setIsDraggingHandle(false);
  }, [editorState.activeTool]);

  // Tool State
  const [copyBasePoint, setCopyBasePoint] = useState<Point | null>(null);
  const [moveBasePoint, setMoveBasePoint] = useState<Point | null>(null);
  const [isMiddlePanning, setIsMiddlePanning] = useState(false);
  const [isMiddleRotating, setIsMiddleRotating] = useState(false);
  const panStartScreen = useRef<Point | null>(null);
  const panStartOffset = useRef<Point | null>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [rotationBasePoint, setRotationBasePoint] = useState<Point | null>(null);
  const [rotationReferencePoint, setRotationReferencePoint] = useState<Point | null>(null);
  const originalElementsDuringRotate = useRef<ArchElement[] | null>(null);
  const originalElementsDuringDrag = useRef<ArchElement[] | null>(null);
  const [activeGrip, setActiveGrip] = useState<{ id: string, key: string, originalPos: Point, connections: {id: string, key: string}[] } | null>(null);
  const [activeHandle, setActiveHandle] = useState<{
    id: string,
    key: string,
    originalSize: {w:number, d:number},
    originalPos: Point,
    rotation: number,
    originalBoundary?: Point[],
    originalUArmDepths?: { left: number, right: number }
  } | null>(null);

  // Ref to track latest state for stable keyboard listeners
  const latestStateRef = useRef({
    isRotating, isDrawing, isLassoActive, marqueeStart, isDragging, activeGrip, activeHandle, isDraggingSelected,
    numericBuffer, activeTool: editorState.activeTool, unitSystem: editorState.unitSystem,
    isOrthoEnabled: editorState.isOrthoEnabled, dragStart, lastMousePos, rotationBasePoint, rotationReferencePoint,
    project, dragPreviewElements, editorState
  });

  useEffect(() => {
    latestStateRef.current = {
      isRotating, isDrawing, isLassoActive, marqueeStart, isDragging, activeGrip, activeHandle,
      isDraggingSelected,
      numericBuffer, activeTool: editorState.activeTool, unitSystem: editorState.unitSystem,
      isOrthoEnabled: editorState.isOrthoEnabled, dragStart, lastMousePos, rotationBasePoint, rotationReferencePoint,
      project, dragPreviewElements, editorState
    };
  }, [isRotating, isDrawing, isLassoActive, marqueeStart, isDragging, activeGrip, activeHandle, 
      isDraggingSelected,
      numericBuffer, editorState.activeTool, editorState.unitSystem, editorState.isOrthoEnabled, 
      dragStart, lastMousePos, rotationBasePoint, rotationReferencePoint,
      project, dragPreviewElements, editorState]);

  // Optimization Cache
  const spatialIndex = useRef<{
      cell: number,
      buckets: Map<string, Segment[]>
  }>({ cell: 20, buckets: new Map() });

  const rebuildSpatialIndex = useCallback(() => {
      const idx = spatialIndex.current;
      idx.buckets.clear();
      const cellSize = idx.cell;

      project.elements.forEach(el => {
          const elSegs: Segment[] = [];
          if (el.p1 && el.p2) {
              if (isCurvedElement(el)) {
                  let prev = getCurvePoint(el, 0)!;
                  const steps = 32;
                  for (let i = 1; i <= steps; i++) {
                      const curr = getCurvePoint(el, i / steps)!;
                      if (curr) {
                          elSegs.push({ p1: prev, p2: curr, ownerId: el.id });
                          prev = curr;
                      }
                  }
              } else if (el.type === 'rectangle') {
                  const corners = [{ x: el.p1.x, y: el.p1.y }, { x: el.p2.x, y: el.p1.y }, { x: el.p2.x, y: el.p2.y }, { x: el.p1.x, y: el.p2.y }];
                  for (let i = 0; i < 4; i++) {
                      elSegs.push({ p1: corners[i], p2: corners[(i + 1) % 4], ownerId: el.id });
                  }
              } else {
                  elSegs.push({ p1: el.p1, p2: el.p2, ownerId: el.id });
                  if (el.type === 'dimension') {
                    const dx = el.p2.x - el.p1.x, dy = el.p2.y - el.p1.y, len = Math.hypot(dx, dy);
                    if (len > 0.001) {
                        const nx = -dy / len, ny = dx / len;
                        let offset = 0.5;
                        if (el.p3) offset = (el.p3.x - el.p1.x) * nx + (el.p3.y - el.p1.y) * ny;
                        const d1 = { x: el.p1.x + nx * offset, y: el.p1.y + ny * offset };
                        const d2 = { x: el.p2.x + nx * offset, y: el.p2.y + ny * offset };
                        elSegs.push({ p1: d1, p2: d2, ownerId: el.id });
                        // And extension lines roughly
                        elSegs.push({ p1: el.p1, p2: d1, ownerId: el.id });
                        elSegs.push({ p1: el.p2, p2: d2, ownerId: el.id });
                    }
                  }
              }
          } else if (el.pos) {
              elSegs.push({ p1: el.pos, p2: el.pos, ownerId: el.id });
          }

          if (el.boundary) {
              for (let i = 0; i < el.boundary.length; i++) {
                  elSegs.push({ p1: el.boundary[i], p2: el.boundary[(i + 1) % el.boundary.length], ownerId: el.id });
              }
          }

          elSegs.forEach(seg => {
              const minX = Math.min(seg.p1.x, seg.p2.x), maxX = Math.max(seg.p1.x, seg.p2.x);
              const minY = Math.min(seg.p1.y, seg.p2.y), maxY = Math.max(seg.p1.y, seg.p2.y);
              const xStart = Math.floor(minX / cellSize), xEnd = Math.floor(maxX / cellSize);
              const yStart = Math.floor(minY / cellSize), yEnd = Math.floor(maxY / cellSize);

              for (let x = xStart; x <= xEnd; x++) {
                  for (let y = yStart; y <= yEnd; y++) {
                      const key = `${x},${y}`;
                      if (!idx.buckets.has(key)) idx.buckets.set(key, []);
                      idx.buckets.get(key)!.push(seg);
                  }
              }
          });
      });
  }, [project.elements]);

  useEffect(() => {
      rebuildSpatialIndex();
  }, [project.elements, rebuildSpatialIndex]);

  // --- Coordinate Transforms ---
  const getCanvasCoords = useCallback((e: React.MouseEvent | MouseEvent): Point => {
    const canvas = canvasRef.current; if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect(); return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);
  const worldToScreen = useCallback((p: Point): Point => {
    const angle = ((editorState.canvasAngle || 0) * Math.PI) / 180;
    const sx_raw = p.x * editorState.zoom;
    const sy_raw = p.y * editorState.zoom;
    if (angle === 0) {
      return { x: sx_raw + editorState.offset.x, y: sy_raw + editorState.offset.y };
    }
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: (sx_raw * cos - sy_raw * sin) + editorState.offset.x,
      y: (sx_raw * sin + sy_raw * cos) + editorState.offset.y
    };
  }, [editorState.zoom, editorState.offset, editorState.canvasAngle]);

  const screenToWorld = useCallback((p: Point): Point => {
    const angle = ((editorState.canvasAngle || 0) * Math.PI) / 180;
    const dx = p.x - editorState.offset.x;
    const dy = p.y - editorState.offset.y;
    if (angle === 0) {
      return { x: dx / editorState.zoom, y: dy / editorState.zoom };
    }
    const cos = Math.cos(-angle);
    const sin = Math.sin(-angle);
    const rx = dx * cos - dy * sin;
    const ry = dx * sin + dy * cos;
    return {
      x: rx / editorState.zoom,
      y: ry / editorState.zoom
    };
  }, [editorState.zoom, editorState.offset, editorState.canvasAngle]);

  const getOffsetForZoomAtScreenPoint = useCallback((screenPoint: Point, worldPoint: Point, nextZoom: number): Point => {
    const angle = ((editorState.canvasAngle || 0) * Math.PI) / 180;
    const sx = worldPoint.x * nextZoom;
    const sy = worldPoint.y * nextZoom;
    if (angle === 0) {
      return { x: screenPoint.x - sx, y: screenPoint.y - sy };
    }
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: screenPoint.x - (sx * cos - sy * sin),
      y: screenPoint.y - (sx * sin + sy * cos),
    };
  }, [editorState.canvasAngle]);

  // --- Geometry Helpers ---
  const distPointToSegment = (p: Point, a: Point, b: Point) => {
    const vx = b.x - a.x, vy = b.y - a.y, wx = p.x - a.x, wy = p.y - a.y;
    const vv = vx * vx + vy * vy;
    if (vv < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = (wx * vx + wy * vy) / vv;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
  };

  const pointInPolygon = (p: Point, poly: Point[]) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > p.y) !== (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / ((yj - yi) || 1e-12) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const segIntersectsRect = (a: Point, b: Point, minX: number, maxX: number, minY: number, maxY: number) => {
    const inside = (p: Point) => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
    if (inside(a) || inside(b)) return true;
    const sMinX = Math.min(a.x, b.x), sMaxX = Math.max(a.x, b.x), sMinY = Math.min(a.y, b.y), sMaxY = Math.max(a.y, b.y);
    if (sMaxX < minX || sMinX > maxX || sMaxY < minY || sMinY > maxY) return false;
    return true; 
  };

  const polygonIntersectsRect = (poly: Point[], minX: number, maxX: number, minY: number, maxY: number) => {
    if (poly.length < 3) return false;
    if (poly.some(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY)) return true;
    const rectCorners: Point[] = [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }];
    if (rectCorners.some(c => pointInPolygon(c, poly))) return true;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      if (segIntersectsRect(a, b, minX, maxX, minY, maxY)) return true;
    }
    return false;
  };

  const segIntersectsSeg = (p1: Point, p2: Point, q1: Point, q2: Point): boolean => {
    const d = (p2.x - p1.x) * (q2.y - q1.y) - (p2.y - p1.y) * (q2.x - q1.x);
    if (Math.abs(d) < 1e-12) return false;
    const u = ((q1.x - p1.x) * (q2.y - q1.y) - (q1.y - p1.y) * (q2.x - q1.x)) / d;
    const v = ((q1.x - p1.x) * (p2.y - p1.y) - (q1.y - p1.y) * (p2.x - p1.x)) / d;
    return (u >= 0 && u <= 1 && v >= 0 && v <= 1);
  };

  const segIntersectsPolygon = (p1: Point, p2: Point, poly: Point[]): boolean => {
    if (poly.length < 3) return false;
    for (let i = 0; i < poly.length; i++) {
       const q1 = poly[i];
       const q2 = poly[(i + 1) % poly.length];
       if (segIntersectsSeg(p1, p2, q1, q2)) return true;
    }
    return false;
  };

  const polygonIntersectsPolygon = (polyA: Point[], polyB: Point[]): boolean => {
    if (polyA.length < 3 || polyB.length < 3) return false;
    if (polyA.some(p => pointInPolygon(p, polyB))) return true;
    if (polyB.some(p => pointInPolygon(p, polyA))) return true;
    for (let i = 0; i < polyA.length; i++) {
       const a1 = polyA[i], a2 = polyA[(i + 1) % polyA.length];
       if (segIntersectsPolygon(a1, a2, polyB)) return true;
    }
    return false;
  };

  const floorHasVisibleEdge = (floor: ArchElement, elements: ArchElement[]) => {
    if (!floor.boundary || floor.boundary.length < 3) return false;
    const walls = elements.filter(e => e.type === 'wall' && e.p1 && e.p2);
    const EDGE_PARALLEL_COS = Math.cos((15 * Math.PI) / 180); 
    const COVER_DIST = 0.28; 
    for (let i = 0; i < floor.boundary.length; i++) {
      const a = floor.boundary[i], b = floor.boundary[(i + 1) % floor.boundary.length];
      const mid: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const ex = b.x - a.x, ey = b.y - a.y, elen = Math.hypot(ex, ey) || 1e-9;
      const eux = ex / elen, euy = ey / elen;
      let covered = false;
      for (const w of walls) {
        if (w.isCurved || (w.wallSource && ['arc', 'circle', 'ellipse'].includes(w.wallSource))) continue;
        const wx = w.p2!.x - w.p1!.x, wy = w.p2!.y - w.p1!.y, wlen = Math.hypot(wx, wy) || 1e-9;
        const wux = wx / wlen, wuy = wy / wlen;
        if (Math.abs(eux * wux + euy * wuy) < EDGE_PARALLEL_COS) continue;
        if (distPointToSegment(mid, w.p1!, w.p2!) <= (w.thickness || 0.23) * 0.5 + COVER_DIST) { covered = true; break; }
      }
      if (!covered) return true; 
    }
    return false;
  };

  const getFloorFaceHitIfAllowed = (p: Point) => {
    const floors = project.elements.filter(e => e.type === 'floor' && e.boundary && e.boundary.length >= 3);
    for (let i = floors.length - 1; i >= 0; i--) {
      const f = floors[i];
      if (f.boundary && pointInPolygon(p, f.boundary) && floorHasVisibleEdge(f, project.elements)) return f;
    }
    return null;
  };

  const getTabCandidatesAtPoint = (p: Point) => {
    return getHitElements(p).map(el => el.id);
  };

  const sameStringArray = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };

  // State Management
  useEffect(() => {
    if (editorState.activeTool === 'floor' || editorState.activeTool === 'ceiling') setEditorState(s => ({ ...s, tempBoundaryIds: [] }));
    else setEditorState(s => ({ ...s, tempBoundaryIds: undefined }));
  }, [editorState.activeTool, setEditorState]);

  useEffect(() => {
    setCopyBasePoint(null); setMoveBasePoint(null); setIsRotating(false); setRotationBasePoint(null); originalElementsDuringRotate.current = null;
    // Clear multi-point buffer on tool change
    setEditorState(s => ({ ...s, multiPointBuffer: [] }));
    // Reset acquired tracking points
    setAcquiredPoints([]);
    if (hoverAcquireTimeoutRef.current) {
      clearTimeout(hoverAcquireTimeoutRef.current);
      hoverAcquireTimeoutRef.current = null;
    }
    potentiallyAcquiringPointRef.current = null;
  }, [editorState.activeTool]);

  useEffect(() => {
    setAcquiredPoints([]);
    if (hoverAcquireTimeoutRef.current) {
      clearTimeout(hoverAcquireTimeoutRef.current);
      hoverAcquireTimeoutRef.current = null;
    }
    potentiallyAcquiringPointRef.current = null;
  }, [editorState.selectedIds]);

  useEffect(() => {
    const drawTools = ['line', 'gridline', 'wall', 'rect', 'arc', 'ellipse', 'stair', 'railing', 'procedural-boundary', 'smart-procedural-boundary', 'auto-procedural-boundary', 'dimension'];
    if (!drawTools.includes(editorState.activeTool)) { setIsDrawing(false); setDragStart(null); setNumericBuffer(''); }
  }, [editorState.activeTool]);

  // Drawing Commit
  const commitDrawing = useCallback((p: Point) => {
    if (!dragStart) return;
    const tool = editorState.activeTool; const elements = [...project.elements];
    const s3d = { ...DEFAULT_PROJECT_SETTINGS_3D, ...(project.settings3D || {}) };
    const isWallMode = editorState.isWallMode && ['line', 'rect', 'arc', 'ellipse'].includes(tool);

    // Handle Poly-point Stairs (L and U)
    if (tool === 'stair') {
       const preset = editorState.activePreset;
       const subType = preset?.subType || 'linear';
       
       if (subType === 'L' || subType === 'U') {
          return;
       }
    }

    if (tool === 'rect' || tool === 'procedural-boundary' || tool === 'smart-procedural-boundary' || tool === 'auto-procedural-boundary' || tool === 'building-mass' || tool === 'landscape' || tool === 'water-body' || tool === 'zone') { 
        const minX = Math.min(dragStart.x, p.x);
        const maxX = Math.max(dragStart.x, p.x);
        const minY = Math.min(dragStart.y, p.y);
        const maxY = Math.max(dragStart.y, p.y);
        
        if (['building-mass', 'landscape', 'water-body', 'zone'].includes(tool)) {
            const points: Point[] = [{x:minX, y:minY}, {x:maxX, y:minY}, {x:maxX, y:maxY}, {x:minX, y:maxY}];
            elements.push({
                id: crypto.randomUUID(),
                type: tool as ElementType,
                boundary: points,
                levelId: activeLevelId,
                zoneType: tool === 'zone' ? 'mixed' : undefined,
                preferDensity: tool === 'zone' ? 'medium' : undefined,
                preferTypology: tool === 'zone' ? 'any' : undefined
            } as any);
        }
        else if (tool === 'procedural-boundary') {
            const pId = crypto.randomUUID();
            let points: Point[] = [{x:minX, y:minY}, {x:maxX, y:minY}, {x:maxX, y:maxY}, {x:minX, y:maxY}];
            
            const programId = PROCEDURAL_TYPOLOGIES.find(t => t.id === activeProceduralConfig?.typology)?.programId || 'domestic-standard';

            const { elements: proceduralElements } = ProceduralLayoutEngine.generateLayout(points, programId, { 
                seed: Math.random(),
                geometry: activeProceduralConfig?.geometry || 'Rectilinear',
                typology: activeProceduralConfig?.style || 'Standard',
                requirements: activeProceduralConfig?.requirements,
                unitSystem: editorState.unitSystem
            } as any);

            // CREATE HOST
            const hostId = crypto.randomUUID();
            const host: ArchElement = {
              id: hostId,
              type: 'floor',
              boundary: points,
              proceduralId: pId,
              isProceduralHost: true,
              proceduralProgramId: programId,
              proceduralTypology: activeProceduralConfig?.style || 'Standard',
              proceduralGeometry: activeProceduralConfig?.geometry || 'Rectilinear',
              proceduralBoundaryPoints: points,
              proceduralRequirements: {
                  ...activeProceduralConfig?.requirements,
                  ...activeProceduralConfig?.globals
              },
              levelId: activeLevelId
            };
            elements.push(host);

            proceduralElements.forEach(el => {
                elements.push({ 
                    ...el, 
                    levelId: activeLevelId, 
                    proceduralId: pId, 
                });
            });

            // Automatically select the host
            onSelectionChange([hostId]);
        }
        else if (tool === 'smart-procedural-boundary') {
            const pId = crypto.randomUUID();
            let points: Point[] = [{x:minX, y:minY}, {x:maxX, y:minY}, {x:maxX, y:maxY}, {x:minX, y:maxY}];
            
            const programId = PROCEDURAL_TYPOLOGIES.find(t => t.id === activeProceduralConfig?.typology)?.programId || 'domestic-standard';

            const { elements: proceduralElements } = SmartProceduralLayoutEngine.generateLayout(points, programId, { 
                seed: Math.random(),
                geometry: activeProceduralConfig?.geometry || 'Rectilinear',
                typology: activeProceduralConfig?.style || 'Standard',
                requirements: activeProceduralConfig?.requirements,
                unitSystem: editorState.unitSystem
            } as any);

            // CREATE HOST
            const hostId = crypto.randomUUID();
            const host: ArchElement = {
              id: hostId,
              type: 'floor',
              boundary: points,
              proceduralId: pId,
              isProceduralHost: true,
              isSmartProceduralHost: true,
              proceduralProgramId: programId,
              proceduralTypology: activeProceduralConfig?.style || 'Standard',
              proceduralGeometry: activeProceduralConfig?.geometry || 'Rectilinear',
              proceduralBoundaryPoints: points,
              proceduralRequirements: {
                  ...activeProceduralConfig?.requirements,
                  ...activeProceduralConfig?.globals
              },
              levelId: activeLevelId
            };
            elements.push(host);

            proceduralElements.forEach(el => {
                elements.push({ 
                    ...el, 
                    levelId: activeLevelId, 
                    proceduralId: pId, 
                });
            });

            // Automatically select the host
            onSelectionChange([hostId]);
        }
        else if (tool === 'auto-procedural-boundary') {
            const pId = crypto.randomUUID();
            const points: Point[] = [{x:minX, y:minY}, {x:maxX, y:minY}, {x:maxX, y:maxY}, {x:minX, y:maxY}];
            const programId = PROCEDURAL_TYPOLOGIES.find(t => t.id === activeProceduralConfig?.typology)?.programId || 'domestic-standard';
            const hostId = crypto.randomUUID();
            const host: ArchElement = {
              id: hostId,
              type: 'floor',
              boundary: points,
              proceduralId: pId,
              isProceduralHost: true,
              isAutoProceduralHost: true,
              proceduralProgramId: programId,
              proceduralTypology: activeProceduralConfig?.style || 'Standard',
              proceduralGeometry: activeProceduralConfig?.geometry || 'Rectilinear',
              proceduralBoundaryPoints: points,
              proceduralRequirements: {
                  ...activeProceduralConfig?.requirements,
                  ...activeProceduralConfig?.globals
              },
              levelId: activeLevelId
            };
            elements.push(host);
            onSelectionChange([hostId]);
        }
 else {
            const corners = [{x:dragStart.x, y:dragStart.y}, {x:p.x, y:dragStart.y}, {x:p.x, y:p.y}, {x:dragStart.x, y:p.y}]; 
            for (let i=0; i<4; i++) elements.push({
                id:crypto.randomUUID(), 
                type: isWallMode ? 'wall' : 'line', 
                p1:corners[i], p2:corners[(i+1)%4], 
                thickness: isWallMode ? (editorState.activePreset?.thickness || WALL_THICKNESS_DEFAULT) : undefined,
                wallSource: isWallMode ? 'line' : undefined,
                elevation: isWallMode ? 0 : undefined,
                height: undefined,
                levelId: activeLevelId
            }); 
        }
    } else if (['tree', 'streetlight', 'car', 'bench'].includes(tool)) {
        elements.push({
            id: crypto.randomUUID(),
            type: 'asset',
            assetType: tool as AssetType,
            pos: p,
            rotation: 0,
            scale: 1.0,
            levelId: activeLevelId
        } as any);
    } else {
      const isCurvedShape = ['arc', 'circle', 'ellipse'].includes(tool);
      const isUrbanLine = tool === 'road';
      const controlPoint = tool === 'arc' ? getFlowyControlPoint(dragStart, p, elements) : undefined;
      const arcMidpoint = controlPoint
        ? {
            x: 0.25 * dragStart.x + 0.5 * controlPoint.x + 0.25 * p.x,
            y: 0.25 * dragStart.y + 0.5 * controlPoint.y + 0.25 * p.y,
          }
        : undefined;
      const fittedArc = controlPoint && arcMidpoint ? circularArcFromThreePoints(dragStart, arcMidpoint, p) : null;
      const ellipseCenter = tool === 'ellipse' ? { x: (dragStart.x + p.x) / 2, y: (dragStart.y + p.y) / 2 } : undefined;
      elements.push({
        id: crypto.randomUUID(), 
        type: isWallMode ? 'wall' : (tool as ElementType), 
        p1: dragStart, p2: p,
        thickness: (isWallMode || tool === 'wall') ? (editorState.activePreset?.thickness || WALL_THICKNESS_DEFAULT) : (isUrbanLine ? 6.0 : undefined),
        wallSource: isWallMode ? tool : undefined,
        elevation: (isWallMode || tool === 'wall') ? 0 : undefined, 
        height: undefined,
        isCurved: isCurvedShape,
        controlPoint,
        arcCenter: fittedArc?.center,
        arcRadius: fittedArc?.radius,
        arcStartAngle: fittedArc?.startAngle,
        arcEndAngle: fittedArc?.endAngle,
        arcCounterclockwise: fittedArc?.counterclockwise,
        ellipseCenter,
        ellipseRadiusX: tool === 'ellipse' ? Math.abs(p.x - dragStart.x) / 2 : undefined,
        ellipseRadiusY: tool === 'ellipse' ? Math.abs(p.y - dragStart.y) / 2 : undefined,
        width: tool === 'stair' ? 1.05 : undefined,
        subType: (tool === 'stair' && editorState.activePreset) ? editorState.activePreset.subType : undefined,
        levelId: activeLevelId,
        label: tool === 'gridline' ? getNextGridLabel(project.elements, dragStart, p) : undefined
      });
    }
    const splittedElements = performAutoSplit(elements);
    onElementsChange(splittedElements);
    onElementsCommit(splittedElements);
    if (['line', 'wall', 'arc', 'road'].includes(tool)) { setDragStart(p); setIsDrawing(true); } else { setIsDrawing(false); setDragStart(null); }
  }, [dragStart, editorState.activeTool, editorState.isWallMode, project.elements, onElementsChange, onElementsCommit, setIsDrawing, setDragStart, project.settings3D, editorState.activePreset, activeLevelId, activeProceduralConfig, onSelectionChange]);

  const handleConfirmFloorCeiling = () => {
    if (!editorState.tempBoundaryIds || editorState.tempBoundaryIds.length === 0) return;
    const boundaryElements = project.elements.filter(el => editorState.tempBoundaryIds!.includes(el.id));
    const loop = buildClosedBoundary(boundaryElements);
    if (!loop) { alert("Selected elements do not form a closed loop."); return; }
    const type = editorState.activeTool as 'floor' | 'ceiling';
    const updated = [...project.elements, { id: crypto.randomUUID(), type, boundary: loop, levelId: activeLevelId }];
    onElementsChange(updated);
    onElementsCommit(updated);
    setEditorState(s => ({ ...s, tempBoundaryIds: [], activeTool: 'select' }));
  };

  const buildClosedBoundary = (elements: ArchElement[]): Point[] | null => {
    const segments = elements.filter(e => e.p1 && e.p2); if (segments.length < 3) return null;
    let points: Point[] = [segments[0].p1!, segments[0].p2!]; const used = new Set([segments[0].id]);
    while (used.size < segments.length) {
      const last = points[points.length - 1];
      const next = segments.find(s => !used.has(s.id) && (Math.hypot(s.p1!.x - last.x, s.p1!.y - last.y) < 0.2 || Math.hypot(s.p2!.x - last.x, s.p2!.y - last.y) < 0.2));
      if (!next) break;
      const p1 = next.p1!, p2 = next.p2!;
      points.push(Math.hypot(p1.x - last.x, p1.y - last.y) < 0.2 ? p2 : p1); used.add(next.id);
    }
    return Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y) < 0.3 ? points : null;
  };

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent key shortcuts/numeric buffer when typing in an input field (e.g., Copilot chat)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).isContentEditable) return;

      const {
        isRotating, isDrawing, isLassoActive, marqueeStart, isDragging, activeGrip, activeHandle, isDraggingSelected,
        numericBuffer, activeTool, unitSystem, isOrthoEnabled, dragStart, lastMousePos
      } = latestStateRef.current;

      if (e.key === 'Escape') { 
          e.preventDefault();
          e.stopPropagation();

          if (placingImportedElements && placingImportedElements.length > 0) {
              onCancelImportedElements?.();
              return;
          }

          let wasDoingSomething = 
            isRotating || isDrawing || isLassoActive || (marqueeStart !== null) || 
            isDragging || (activeGrip !== null) || (activeHandle !== null) || 
            (numericBuffer !== "");

          setEditorState(s => {
            const hasBuffer = (s.multiPointBuffer && s.multiPointBuffer.length > 0);
            const hasBoundary = (s.tempBoundaryIds && s.tempBoundaryIds.length > 0);
            const isDoingSomethingInState = hasBuffer || hasBoundary;
            const hasSelection = (s.selectedIds && s.selectedIds.length > 0);

            if (!wasDoingSomething && !isDoingSomethingInState) {
                if (hasSelection) {
                    return { ...s, selectedIds: [] };
                }
                if (s.activeTool !== 'select') {
                    return { ...s, activeTool: 'select', isWallMode: false, multiPointBuffer: [], tempBoundaryIds: [] };
                }
            }
            return { ...s, multiPointBuffer: [], tempBoundaryIds: [] };
          });

          setIsDrawing(false);
          setDragStart(null);
          setNumericBuffer("");
          setMarqueeStart(null);
          setMarqueeEnd(null);
          setIsTwoClickMarqueeActive(false);
          setLassoPoints([]);
          setIsLassoActive(false);
          setIsRotating(false);
          setRotationBasePoint(null);
          setRotationReferencePoint(null);
          setIsDragging(false);
          setIsDraggingSelected(false);
          setIsDraggingHandle(false);
          setActiveGrip(null);
          setActiveHandle(null);
          setMoveBasePoint(null);
          setCopyBasePoint(null);
          setDragPreviewElements(null);
          return; 
      }
      if (!isRotating && !isDrawing && !isLassoActive && !marqueeStart && !isDragging && !activeGrip && !activeHandle) return;
      if ((e.key >= '0' && e.key <= '9') || e.key === '.' || e.key === '-' || e.key === "'" || e.key === '"') { setNumericBuffer(prev => prev + e.key); return; }
      if (e.key === 'Backspace') { setNumericBuffer(prev => prev.slice(0, -1)); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (isRotating) { 
          // Recalculate based on buffer to be absolutely sure we use the typed value
          const { rotationBasePoint, rotationReferencePoint, numericBuffer, editorState, project, dragPreviewElements } = latestStateRef.current;
          let finalElements = dragPreviewElements;
          
          if (numericBuffer && rotationBasePoint && rotationReferencePoint && originalElementsDuringRotate.current) {
             const typedDeg = parseFloat(numericBuffer);
             if (!isNaN(typedDeg)) {
                const deltaRad = typedDeg * Math.PI / 180;
                const rotatePoint = (p: Point, pivot: Point, angleRad: number): Point => { 
                  const dx = p.x - pivot.x, dy = p.y - pivot.y; 
                  return { x: pivot.x + dx * Math.cos(angleRad) - dy * Math.sin(angleRad), y: pivot.y + dx * Math.sin(angleRad) + dy * Math.cos(angleRad) }; 
                };
                const rotated = originalElementsDuringRotate.current.map(el => {
                  if (!editorState.selectedIds.includes(el.id)) return el;
                  const next = { ...el };
                  if (next.pos) next.pos = rotatePoint(next.pos, rotationBasePoint, deltaRad);
                  if (next.p1) next.p1 = rotatePoint(next.p1, rotationBasePoint, deltaRad);
                  if (next.p2) next.p2 = rotatePoint(next.p2, rotationBasePoint, deltaRad);
                  if (next.p3) next.p3 = rotatePoint(next.p3, rotationBasePoint, deltaRad);
                  if (next.p4) next.p4 = rotatePoint(next.p4, rotationBasePoint, deltaRad);
                  if (next.controlPoint) next.controlPoint = rotatePoint(next.controlPoint, rotationBasePoint, deltaRad);
                  if (next.boundary) next.boundary = next.boundary.map(p => rotatePoint(p, rotationBasePoint, deltaRad));
                  Object.assign(next, rotateCurveMetadata(next, rotationBasePoint, deltaRad));
                  if (next.rotation !== undefined) { 
                    const original = originalElementsDuringRotate.current!.find(o => o.id === el.id); 
                    if (original) next.rotation = (original.rotation || 0) + typedDeg; 
                  }
                  return next;
                });
                finalElements = rotated;
                project.elements.filter(e => e.type === 'wall').forEach(w => { finalElements = updateHostedOpenings(w, finalElements!); });
             }
          }

          if (finalElements) {
            onElementsCommit(finalElements);
            setDragPreviewElements(null);
          }
          setIsRotating(false); 
          setRotationBasePoint(null); 
          setRotationReferencePoint(null);
          originalElementsDuringRotate.current = null; 
          setNumericBuffer(''); 
          return; 
        }
        if (isDrawing && dragStart && (activeTool === 'line' || activeTool === 'gridline' || activeTool === 'wall' || activeTool === 'arc')) {
          const len = parseDimension(numericBuffer, unitSystem);
          if (len === null || !isFinite(len) || len <= 0) return;
          const dx0 = lastMousePos.x - dragStart.x, dy0 = lastMousePos.y - dragStart.y, d0 = Math.hypot(dx0, dy0);
          let ux = 1, uy = 0; if (d0 > 1e-6) { ux = dx0 / d0; uy = dy0 / d0; }
          if (isOrthoEnabled) { if (Math.abs(dx0) >= Math.abs(dy0)) { ux = Math.sign(dx0 || 1); uy = 0; } else { ux = 0; uy = Math.sign(dy0 || 1); } }
          commitDrawing({ x: dragStart.x + ux * len, y: dragStart.y + uy * len }); setIsDrawing(false); setDragStart(null); setNumericBuffer('');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commitDrawing, setEditorState, placingImportedElements, onCancelImportedElements]); // Simplified dependencies

  useEffect(() => {
    const handleTab = (e: KeyboardEvent) => {
      // Prevent key shortcuts when typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).isContentEditable) return;

      if (editorState.viewMode !== '2D' || editorState.activeTool !== 'select') return;
      if (e.key === 'Escape') { if (tabState.hoverId) setTabState({ anchor: null, candidates: [], index: -1, hoverId: null }); return; }
      if (e.key !== 'Tab' && e.key !== 'Shift') return;
      if (e.key === 'Tab') e.preventDefault();
      const p = lastMousePos; const candidatesNow = getTabCandidatesAtPoint(p);
      if (!candidatesNow.length) return;
      const anchored = tabState.anchor && Math.hypot(p.x - tabState.anchor.x, p.y - tabState.anchor.y) <= 0.35;
      const sameCandidates = anchored && sameStringArray(tabState.candidates, candidatesNow);
      let nextIndex = 0;
      if (sameCandidates && tabState.index >= 0) {
        const dir = (e.key === 'Tab' && e.shiftKey) ? -1 : 1;
        nextIndex = (tabState.index + dir + candidatesNow.length) % candidatesNow.length;
      }
      const nextHoverId = candidatesNow[nextIndex];
      setTabState({ anchor: p, candidates: candidatesNow, index: nextIndex, hoverId: nextHoverId });
      setHoveredElementId(nextHoverId);
    };
    window.addEventListener('keydown', handleTab); return () => window.removeEventListener('keydown', handleTab);
  }, [editorState.viewMode, editorState.activeTool, lastMousePos, project.elements, tabState]);

  // Advanced Geometry
  const findPointOnElement = useCallback((p: Point, el: ArchElement): { point: Point, t: number } | null => {
    if (!el.p1 || !el.p2) return null;
    if (isCurvedElement(el)) {
      const samples = 100; let minD = Infinity, bestT = 0, bestPt = el.p1!;
      for (let i = 0; i <= samples; i++) {
        const t = i / samples, pt = getCurvePoint(el, t); if (!pt) continue;
        const d = Math.sqrt((p.x - pt.x)**2 + (p.y - pt.y)**2);
        if (d < minD) { minD = d; bestT = t; bestPt = pt; }
      }
      return { point: bestPt, t: bestT };
    } else {
      const dx = el.p2!.x - el.p1!.x, dy = el.p2!.y - el.p1!.y, l2 = dx*dx + dy*dy; if (l2 < 0.001) return null;
      let t = Math.max(0, Math.min(1, ((p.x - el.p1!.x) * dx + (p.y - el.p1!.y) * dy) / l2));
      return { point: { x: el.p1!.x + t * dx, y: el.p1!.y + t * dy }, t };
    }
  }, []);

  const getElementsNearPoint = useCallback((p: Point, radius: number = 2.0) => {
    const cellSize = spatialIndex.current.cell;
    const minX = Math.floor((p.x - radius) / cellSize);
    const maxX = Math.floor((p.x + radius) / cellSize);
    const minY = Math.floor((p.y - radius) / cellSize);
    const maxY = Math.floor((p.y + radius) / cellSize);
    
    const candidates = new Set<ArchElement>();
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const key = `${x},${y}`;
        const segments = spatialIndex.current.buckets.get(key);
        if (segments) {
          segments.forEach(s => {
            const el = elementsMap.get(s.ownerId);
            if (el) candidates.add(el);
          });
        }
      }
    }
    // Also include elements without segments but with position (assets/zones can also be in index though)
    return Array.from(candidates);
  }, [elementsMap]);

  const findNearestWall = useCallback((p: Point, elementsOverride?: ArchElement[]): { wall: ArchElement, point: Point, dist: number, angle: number, t: number } | null => {
    let minD = Infinity, res = null; 
    const candidates = elementsOverride || getElementsNearPoint(p, 4.0).filter(e => e.type === 'wall');
    
    candidates.forEach(w => {
      if (!w.p1 || !w.p2) return;
      let proj: Point = w.p1, angle = 0, d = Infinity, bestT = 0;
      if (isCurvedElement(w)) {
        const samples = 40;
        for (let i = 0; i <= samples; i++) {
          const t = i / samples, pt = getCurvePoint(w, t); if (!pt) continue;
          const dist = Math.sqrt((p.x - pt.x)**2 + (p.y - pt.y)**2);
          if (dist < d) { d = dist; proj = pt; bestT = t; const p2_ = getCurvePoint(w, Math.min(1, t + 0.01)); if (p2_) angle = Math.atan2(p2_.y - pt.y, p2_.x - pt.x); }
        }
      } else {
        const dx = w.p2!.x - w.p1!.x, dy = w.p2!.y - w.p1!.y, l2 = dx*dx + dy*dy; if (l2 === 0) return;
        bestT = Math.max(0, Math.min(1, ((p.x - w.p1!.x) * dx + (p.y - w.p1!.y) * dy) / l2));
        proj = { x: w.p1!.x + bestT * dx, y: w.p1!.y + bestT * dy };
        d = Math.sqrt((p.x - proj.x) ** 2 + (p.y - proj.y) ** 2);
        angle = Math.atan2(dy, dx);
      }
      if (d < minD) { minD = d; res = { wall: w, point: proj, dist: d, angle: angle * (180 / Math.PI), t: bestT }; }
    });
    return res;
  }, [getElementsNearPoint]);

  const interiorBackAndSideStickIds = useMemo(() => new Set([
    'bed_single', 'bed_queen', 'bed_king', 'bed_twin_pair', 'bed_bunk', 'bed_loft', 'bed_sofa',
    'bed_side_tables', 'bed_storage', 'day_bed', 'hospital_bed', 'sofa_1', 'sofa_2', 'sofa_3',
    'sofa_round_edge', 'sofa_kidney', 'sofa_curved_lounge', 'wardrobe', 'bedside_table',
    'tv_console', 'display_shelf', 'cabinet_file', 'buffet_cabinet', 'credenza', 'whiteboard',
    'desk', 'reception_desk', 'cntr_kitchen', 'cntr_l_kitchen', 'cntr_base_cabinet', 'fix_sink',
    'fix_double_sink', 'fix_stove', 'appliance_fridge', 'appliance_washer', 'fix_wc',
    'fix_wc_wall_hung', 'fix_basin', 'fix_vanity_basin', 'fix_corner_basin', 'fix_shower',
    'fix_shower_rect', 'fix_bath', 'fix_corner_bath', 'bath_vanity_unit', 'counter_service',
    'cashier_desk', 'counter_reception_arc', 'counter_display_case'
  ]), []);

  const interiorBackOnlyStickIds = useMemo(() => new Set([
    'office_chair', 'chair_accent', 'chair_modern', 'chair_platner',
    'chair_z', 'stool_bar', 'table_bar', 'appliance_hob_2', 'appliance_hob_4'
  ]), []);

  const interiorAngleOnlyIds = useMemo(() => new Set([
    'ottoman_square', 'ottoman_tufted', 'ottoman_puff', 'table_dining_4', 'table_dining_6',
    'table_dining_8', 'table_round_dining', 'table_cafe', 'coffee_table', 'table_oval_coffee',
    'table_round_side', 'table_conference', 'cntr_island'
  ]), []);

  const cornerPriorityInteriorIds = useMemo(() => new Set([
    'cntr_l_kitchen', 'fix_corner_basin', 'fix_corner_bath'
  ]), []);

  const getInteriorSnapMode = useCallback((preset: any, activeTool: EditorTool): InteriorSnapMode => {
    if (!['furniture', 'fixture', 'counter'].includes(activeTool)) return 'angle-only';

    if (preset.snapMode === 'hard-wall' || preset.snapMode === 'preferred-wall') return 'back-side';
    if (preset.snapMode === 'back-only') return 'back-only';
    if (preset.snapMode === 'counter-only') return 'angle-only';

    const keys = [preset?.id, preset?.subType, preset?.iconType, preset?.category]
      .filter(Boolean)
      .map((value: string) => String(value).toLowerCase());
    if (keys.some(key => interiorAngleOnlyIds.has(key))) return 'angle-only';
    if (keys.some(key => interiorBackOnlyStickIds.has(key))) return 'back-only';
    if (keys.some(key => interiorBackAndSideStickIds.has(key))) return 'back-side';
    if (keys.some(key => key.includes('table') || key.includes('ottoman') || key.includes('puff'))) return 'angle-only';
    if (keys.some(key => key.includes('chair') || key.includes('stool') || key.includes('hob'))) return 'back-only';
    return 'back-side';
  }, [interiorAngleOnlyIds, interiorBackOnlyStickIds, interiorBackAndSideStickIds]);

  const resolveInteriorPlacement = useCallback((p: Point, preset: any, activeTool: EditorTool) => {
    const width = preset?.width || (activeTool === 'column' ? 0.45 : 1);
    const depth = preset?.depth || (activeTool === 'column' ? 0.45 : 1);
    const mode = getInteriorSnapMode(preset, activeTool);
    const near = findNearestWall(p);
    if (!near || near.dist >= 1.0 || !near.wall.p1 || !near.wall.p2) {
      return { pos: p, rotation: 0, snapEdge: undefined as InteriorSnapEdge | undefined, wall: null as ArchElement | null };
    }

    const wall = near.wall;
    const wallAngRad = near.angle * Math.PI / 180;
    const ux = Math.cos(wallAngRad);
    const uy = Math.sin(wallAngRad);
    const cross = ux * (p.y - near.point.y) - uy * (p.x - near.point.x);
    const nx = cross >= 0 ? -uy : uy;
    const ny = cross >= 0 ? ux : -ux;
    const wallAng = near.angle;
    const backRotation = cross >= 0 ? wallAng : wallAng + 180;
    const wallFaceOffset = (wall.thickness || WALL_THICKNESS_DEFAULT) / 2;
    const wallFacePoint = {
      x: near.point.x + nx * wallFaceOffset,
      y: near.point.y + ny * wallFaceOffset
    };

    if (mode === 'angle-only') {
      return { pos: p, rotation: backRotation, snapEdge: undefined as InteriorSnapEdge | undefined, wall };
    }

    const candidates: { edge: InteriorSnapEdge; pos: Point; rotation: number; score: number }[] = [];
    const addCandidate = (edge: InteriorSnapEdge, pos: Point, rotation: number) => {
      candidates.push({ edge, pos, rotation, score: Math.hypot(pos.x - p.x, pos.y - p.y) });
    };

    addCandidate('back', { x: wallFacePoint.x + nx * depth / 2, y: wallFacePoint.y + ny * depth / 2 }, backRotation);

    if (mode === 'back-side') {
      const rightRotation = Math.atan2(ny, nx) * 180 / Math.PI;
      const leftRotation = rightRotation + 180;
      addCandidate('left', { x: wallFacePoint.x + nx * width / 2, y: wallFacePoint.y + ny * width / 2 }, rightRotation);
      addCandidate('right', { x: wallFacePoint.x + nx * width / 2, y: wallFacePoint.y + ny * width / 2 }, leftRotation);
    }

    const presetId = String(preset?.id || '').toLowerCase();
    const sorted = candidates.sort((a, b) => {
      const aBackBias = a.edge === 'back' ? -0.3 : 0;
      const bBackBias = b.edge === 'back' ? -0.3 : 0;
      const aCornerBias = cornerPriorityInteriorIds.has(presetId) && a.edge !== 'back' ? -0.08 : 0;
      const bCornerBias = cornerPriorityInteriorIds.has(presetId) && b.edge !== 'back' ? -0.08 : 0;
      return (a.score + aBackBias + aCornerBias) - (b.score + bBackBias + bCornerBias);
    });
    const best = sorted[0];
    return { pos: best.pos, rotation: best.rotation, snapEdge: best.edge, wall };
  }, [findNearestWall, getInteriorSnapMode, cornerPriorityInteriorIds]);

  const getOpeningTIntervals = useCallback((wall: ArchElement, allElements: ArchElement[]) => {
    const candidates = allElements.filter(e => (e.type === 'door' || e.type === 'window' || e.type === 'wall-opening') && e.pos);
    const L = getWallLength(wall);
    const intervals: { tStart: number, tEnd: number, el: ArchElement }[] = [];
    const isClosed = isClosedCurveWall(wall);

    candidates.forEach(el => {
      let isHosted = el.hostWallId === wall.id && typeof el.hostT === 'number';
      let hostT = el.hostT;

      if (!isHosted) {
        // Calculate distance from el.pos to this wall
        const p = el.pos!;
        let proj: Point | null = null;
        let bestT = 0;
        let d = Infinity;

        if (isCurvedElement(wall)) {
          const samples = 40;
          for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            const pt = getCurvePoint(wall, t);
            if (!pt) continue;
            const dist = Math.hypot(p.x - pt.x, p.y - pt.y);
            if (dist < d) {
              d = dist;
              proj = pt;
              bestT = t;
            }
          }
        } else if (wall.p1 && wall.p2) {
          const dx = wall.p2.x - wall.p1.x;
          const dy = wall.p2.y - wall.p1.y;
          const l2 = dx*dx + dy*dy;
          if (l2 > 0) {
            bestT = Math.max(0, Math.min(1, ((p.x - wall.p1.x) * dx + (p.y - wall.p1.y) * dy) / l2));
            proj = { x: wall.p1.x + bestT * dx, y: wall.p1.y + bestT * dy };
            d = Math.hypot(p.x - proj.x, p.y - proj.y);
          }
        }

        const maxDist = (wall.thickness || 0.23) * 1.5; // Allow some margin for alignment tolerance
        if (d < maxDist) {
          isHosted = true;
          hostT = bestT;
        }
      }

      if (isHosted && typeof hostT === 'number') {
        const width = el.width || 0.8;
        let dt = 0;
        const source = wall.wallSource || (wall.isCurved ? wall.type : null);
        if (source === 'arc' || source === 'circle' || source === 'ellipse') {
            const eps = 0.005;
            const tMid = hostT;
            const pMid = getCurvePoint(wall, tMid);
            if (pMid) {
                const tNext = isClosed ? norm01(tMid + eps) : Math.min(1, tMid + eps);
                const tPrev = isClosed ? norm01(tMid - eps) : Math.max(0, tMid - eps);
                const pNext = getCurvePoint(wall, tNext)!;
                const pPrev = getCurvePoint(wall, tPrev)!;
                const dS = Math.hypot(pNext.x - pPrev.x, pNext.y - pPrev.y);
                const speed = dS / (eps * 2);
                if (speed > 0.0001) dt = width / speed;
            }
        } else {
            dt = L > 0 ? width / L : 0;
        }
        intervals.push({ tStart: hostT - dt/2, tEnd: hostT + dt/2, el });
      }
    });
    return intervals.sort((a, b) => a.tStart - b.tStart);
  }, [project.elements]);

  const getWallOpeningSegments = useCallback((wall: ArchElement, allElements: ArchElement[]) => {
    const isClosed = isClosedCurveWall(wall);
    const intervals = getOpeningTIntervals(wall, allElements);
    
    // Split wrapping intervals for closed walls
    const processedIntervals: { tStart: number, tEnd: number, el: ArchElement }[] = [];
    intervals.forEach(int => {
       if (isClosed) {
           if (int.tStart < 0) {
               processedIntervals.push({ tStart: 1 + int.tStart, tEnd: 1, el: int.el });
               processedIntervals.push({ tStart: 0, tEnd: int.tEnd, el: int.el });
           } else if (int.tEnd > 1) {
               processedIntervals.push({ tStart: int.tStart, tEnd: 1, el: int.el });
               processedIntervals.push({ tStart: 0, tEnd: int.tEnd - 1, el: int.el });
           } else {
               processedIntervals.push(int);
           }
       } else {
           processedIntervals.push(int);
       }
    });
    processedIntervals.sort((a, b) => a.tStart - b.tStart);
    
    const segments: { tStart: number, tEnd: number, isOpening: boolean, opening?: ArchElement, prevOpening?: ArchElement, nextOpening?: ArchElement }[] = [];
    let currentT = 0;
    let lastOpening: ArchElement | undefined = undefined;
    
    processedIntervals.forEach(int => {
       if (int.tStart > currentT + 0.0001) {
           segments.push({ 
               tStart: currentT, 
               tEnd: int.tStart, 
               isOpening: false,
               prevOpening: lastOpening,
               nextOpening: int.el
           });
       }
       segments.push({ tStart: Math.max(0, int.tStart), tEnd: Math.min(1, int.tEnd), isOpening: true, opening: int.el });
       currentT = Math.max(currentT, int.tEnd);
       lastOpening = int.el;
    });
    
    if (currentT < 0.999) {
        const firstInt = processedIntervals[0];
        const nextOp = (isClosed && firstInt && firstInt.tStart <= 0.001) ? firstInt.el : undefined;
        segments.push({ 
            tStart: currentT, 
            tEnd: 1.0, 
            isOpening: false, 
            prevOpening: lastOpening,
            nextOpening: nextOp
        });
    }

    if (isClosed && segments.length > 0 && segments[0].tStart === 0 && !segments[0].isOpening) {
        const lastInt = processedIntervals[processedIntervals.length - 1];
        if (lastInt && lastInt.tEnd >= 0.999) {
            segments[0].prevOpening = lastInt.el;
        }
    }
    return segments;
  }, [getOpeningTIntervals]);

  const getWallPolygon = useCallback((wall: ArchElement, allElements: ArchElement[], shrinkScreenAmt: number = 0, range?: [number, number], segData?: { prevOpening?: ArchElement, nextOpening?: ArchElement }): Point[] => {
    if (!wall.p1 || !wall.p2) return [];
    const tStart = range ? range[0] : 0;
    const tEnd = range ? range[1] : 1;
    const t = (wall.thickness || WALL_THICKNESS_DEFAULT) / 2;
    const shrink = shrinkScreenAmt / editorState.zoom;
    const innerT = Math.max(0.01, t - shrink);

    const isClosedWall = isClosedCurveWall(wall);
    let isSeamOpen = false;
    if (isClosedWall) {
       const intervals = getOpeningTIntervals(wall, allElements);
       isSeamOpen = intervals.some(int => int.tStart < 0 || int.tEnd > 1);
    }

    const getWallVectorInward = (w: ArchElement, atP2: boolean, atT?: number): {x: number, y: number} => {
        const evalT = atT !== undefined ? atT : (atP2 ? 1.0 : 0.0);
        const p0 = getCurvePoint(w, evalT)!;
        if (isCurvedElement(w)) {
           const sampleT = atP2 ? Math.max(0, evalT - 0.005) : Math.min(1, evalT + 0.005);
           const p1 = getCurvePoint(w, sampleT)!;
           const dx = p1.x - p0.x, dy = p1.y - p0.y;
           const len = Math.hypot(dx, dy) || 1;
           return { x: dx/len, y: dy/len };
        } else {
           const dx = w.p2!.x - w.p1!.x, dy = w.p2!.y - w.p1!.y;
           const len = Math.hypot(dx, dy) || 1;
           if (atP2) return { x: -dx/len, y: -dy/len };
           return { x: dx/len, y: dy/len };
        }
    };

    const walls = allElements.filter(e => e.type === 'wall' && e.p1 && e.p2);
    
    const getAdjustedEndpoint = (p: Point, isP2: boolean, side: number) => {
      const evalT = isP2 ? tEnd : tStart;
      const isSeamSealed = isClosedWall && !isSeamOpen && (isP2 ? evalT >= 0.999 : evalT <= 0.001);
      const isTrueEnd = isSeamSealed ? false : (isP2 ? (tEnd >= 0.999) : (tStart <= 0.001));
      
      let customNormal = null;
      if (!isTrueEnd && segData) {
          const adjOpening = isP2 ? segData.nextOpening : segData.prevOpening;
          if (adjOpening && typeof adjOpening.hostT === 'number') {
              const vTanOpening = getWallVectorInward(wall, false, adjOpening.hostT);
              const n = { x: -vTanOpening.y, y: vTanOpening.x };
              // For P1 (start of segment), the vOut_our vector is backward. 
              // The default N_our calculation (-y, x) of backward tangent produces a right-hand normal.
              // So we negate the opening's left-hand normal 'n' to match the segment's expected normal handedness.
              customNormal = isP2 ? n : { x: -n.x, y: -n.y };
          }
      }

      const vOut_our = getWallVectorInward(wall, isP2, evalT);
      vOut_our.x = -vOut_our.x; vOut_our.y = -vOut_our.y; 

      const N_our = customNormal || { x: -vOut_our.y, y: vOut_our.x }; 
      const isLeft = isP2 ? (side === -1) : (side === 1);
      const baseOffset = isLeft ? { x: N_our.x * innerT, y: N_our.y * innerT } : { x: -N_our.x * innerT, y: -N_our.y * innerT };
      let pt = { x: p.x + baseOffset.x, y: p.y + baseOffset.y };

      if (!isTrueEnd) return pt;

      const connections = walls.filter(w => w.id !== wall.id && !isClosedCurveWall(w)).map(w => {
        const wP1 = isCurvedElement(w) ? getCurvePoint(w, 0)! : w.p1!;
        const wP2 = isCurvedElement(w) ? getCurvePoint(w, 1)! : w.p2!;
        const d1 = Math.sqrt((p.x - wP1.x)**2 + (p.y - wP1.y)**2);
        const d2 = Math.sqrt((p.x - wP2.x)**2 + (p.y - wP2.y)**2);
        if (d1 < 0.05) return { wall: w, other: wP2, isP2: false }; 
        if (d2 < 0.05) return { wall: w, other: wP1, isP2: true }; 
        return null;
      }).filter(c => c !== null) as {wall: ArchElement, other: Point, isP2: boolean}[];
      
      if (connections.length > 0) {
          const ourOther = isP2 ? (isCurvedElement(wall) ? getCurvePoint(wall, 0)! : wall.p1!) : (isCurvedElement(wall) ? getCurvePoint(wall, 1)! : wall.p2!);
          const allSegs = [...connections, { wall, other: ourOther, isP2 }];
          const segments = allSegs.map(c => {
              const vIn = getWallVectorInward(c.wall, c.isP2);
              const ux = -vIn.x, uy = -vIn.y;
              const angle = Math.atan2(uy, ux);
              return { ...c, ux, uy, angle };
          }).sort((a, b) => a.angle - b.angle);

          let ourIdx = segments.findIndex(s => s.wall.id === wall.id);
          const N_segs = segments.length;
          
          if (ourIdx !== -1 && N_segs > 1) {
              const neighbor = isLeft ? segments[(ourIdx - 1 + N_segs) % N_segs] : segments[(ourIdx + 1) % N_segs];
              const vOut_n = { x: neighbor.ux, y: neighbor.uy }, N_n = { x: -vOut_n.y, y: vOut_n.x };
              const t_n = (neighbor.wall.thickness || WALL_THICKNESS_DEFAULT) / 2;
              const innerT_n = Math.max(0.01, t_n - shrink);
              
              const offset_n = isLeft ? { x: -N_n.x * innerT_n, y: -N_n.y * innerT_n } : { x: N_n.x * innerT_n, y: N_n.y * innerT_n };
              
              const L1A = { x: p.x + baseOffset.x, y: p.y + baseOffset.y }, L1B = { x: L1A.x + vOut_our.x, y: L1A.y + vOut_our.y };
              const L2A = { x: p.x + offset_n.x, y: p.y + offset_n.y }, L2B = { x: L2A.x + vOut_n.x, y: L2A.y + vOut_n.y };
              
              const cross = vOut_our.x * vOut_n.y - vOut_our.y * vOut_n.x;
              if (Math.abs(cross) > 1e-5) {
                  const intersect = getInfiniteLineIntersection(L1A, L1B, L2A, L2B);
                  if (intersect) {
                      const dist = Math.sqrt((intersect.x - p.x)**2 + (intersect.y - p.y)**2);
                      const maxDist = Math.max(innerT, innerT_n) * 4;
                      if (dist <= maxDist) {
                          pt = intersect;
                      } else {
                          const interDist = Math.sqrt((intersect.x - L1A.x)**2 + (intersect.y - L1A.y)**2);
                          if (interDist > 0.001) pt = { x: L1A.x + ((intersect.x - L1A.x)/interDist)*maxDist, y: L1A.y + ((intersect.y - L1A.y)/interDist)*maxDist };
                      }
                  }
              }
          }
      } else if (shrink > 0) {
        pt.x += -vOut_our.x * shrink; pt.y += -vOut_our.y * shrink;
      }
      return pt;
    };

    if (isCurvedElement(wall)) {
       const isClosed = isClosedCurveWall(wall) && (tEnd - tStart > 0.99);
       const steps = isClosed ? 60 : 30;
       const leftPts: Point[] = [];
       const rightPts: Point[] = [];
       
       const startPt = getCurvePoint(wall, tStart)!;
       const endPt = getCurvePoint(wall, tEnd)!;
       
       if (!isClosed) {
           leftPts.push(getAdjustedEndpoint(startPt, false, -1));
           rightPts.push(getAdjustedEndpoint(startPt, false, 1));
       }
       
       const curveSteps = isClosed ? steps - 1 : steps;
       for (let i = (isClosed ? 0 : 1); i <= curveSteps; i++) {
           const t = tStart + (i / steps) * (tEnd - tStart);
           const pt = getCurvePoint(wall, t);
           if (!pt) continue;
           
           const ptPrev = getCurvePoint(wall, Math.max(0, t - 0.01))!;
           const ptNext = getCurvePoint(wall, Math.min(1, t + 0.01))!;
           
           const dx = ptNext.x - ptPrev.x, dy = ptNext.y - ptPrev.y;
           const len = Math.hypot(dx, dy) || 1;
           const nx = -dy/len, ny = dx/len;
           leftPts.push({ x: pt.x + nx * innerT, y: pt.y + ny * innerT });
           rightPts.push({ x: pt.x - nx * innerT, y: pt.y - ny * innerT });
       }
       
       if (!isClosed) {
           leftPts.push(getAdjustedEndpoint(endPt, true, -1));
           rightPts.push(getAdjustedEndpoint(endPt, true, 1));
           return [...leftPts, ...rightPts.reverse()];
       } else {
           return [...leftPts, leftPts[0], rightPts[0], ...[...rightPts].reverse()];
       }
    }

    const pStartIdx = getCurvePoint(wall, tStart)!;
    const pEndIdx = getCurvePoint(wall, tEnd)!;
    return [getAdjustedEndpoint(pStartIdx, false, -1), getAdjustedEndpoint(pEndIdx, true, -1), getAdjustedEndpoint(pEndIdx, true, 1), getAdjustedEndpoint(pStartIdx, false, 1)];
  }, [project.elements, editorState.zoom]);

  const getClampedTForOpening = useCallback((host: ArchElement, width: number, targetT: number, ignoreIds: string[]): number | null => {
    if (!host.p1 || !host.p2) return null;
    const L = getWallLength(host); if (L <= 0) return null;
    const closed = isClosedCurveWall(host);
    const EDGE_MARGIN = 0.0762; // 3 inches
    
    // If the opening plus margins is larger than the wall itself, it cannot fit
    if (!closed && width + 2 * EDGE_MARGIN > L) return null;

    const half = width / (2 * L);
    const marginT = closed ? 0 : EDGE_MARGIN / L;
    const tMin = half + marginT;
    const tMax = 1 - (half + marginT);
    
    let t = closed ? norm01(targetT) : Math.max(tMin, Math.min(tMax, targetT));
    const overlaps = project.elements.filter(e => (e.type === 'door' || e.type === 'window' || e.type === 'wall-opening') && e.hostWallId === host.id && typeof e.hostT === 'number' && !ignoreIds.includes(e.id))
      .some(e => {
        const otherHalf = (e.width || 1) / (2 * L);
        const dt = closed ? Math.min(Math.abs(norm01(e.hostT! - t)), 1 - Math.abs(norm01(e.hostT! - t))) : Math.abs(e.hostT! - t);
        return dt < (half + otherHalf);
      });
    if (overlaps) return null;
    if (!closed && (t < tMin || t > tMax)) return null;
    return t;
  }, [project.elements]);

  const getAllSegments = useCallback((): Segment[] => {
    const canvas = canvasRef.current;
    if (!canvas) return [];

    const p1V = screenToWorld({ x: -100, y: -100 });
    const p2V = screenToWorld({ x: canvas.width + 100, y: -100 });
    const p3V = screenToWorld({ x: canvas.width + 100, y: canvas.height + 100 });
    const p4V = screenToWorld({ x: -100, y: canvas.height + 100 });
    const minXV = Math.min(p1V.x, p2V.x, p3V.x, p4V.x);
    const maxXV = Math.max(p1V.x, p2V.x, p3V.x, p4V.x);
    const minYV = Math.min(p1V.y, p2V.y, p3V.y, p4V.y);
    const maxYV = Math.max(p1V.y, p2V.y, p3V.y, p4V.y);

    const result: Segment[] = [];
    const cellSize = spatialIndex.current.cell;
    const xStart = Math.floor(minXV / cellSize), xEnd = Math.floor(maxXV / cellSize);
    const yStart = Math.floor(minYV / cellSize), yEnd = Math.floor(maxYV / cellSize);

    for (let x = xStart; x <= xEnd; x++) {
        for (let y = yStart; y <= yEnd; y++) {
            const segs = spatialIndex.current.buckets.get(`${x},${y}`);
            if (segs) {
                segs.forEach(s => {
                    if (!result.includes(s)) result.push(s);
                });
            }
        }
    }
    return result;
  }, [screenToWorld]);

  // --- NEW: Resize Handles & Furniture Logic ---
  const getResizeHandles = (el: ArchElement) => {
    if (el.locked) return [];
    if (el.type === 'floor' && el.boundary && el.boundary.length >= 3) {
      return el.boundary.map((point, index) => ({ key: `boundary_${index}`, worldPos: point }));
    }
    if (isElevationElement(el) && el.type === 'rectangle' && el.p1 && el.p2) {
      const minX = Math.min(el.p1.x, el.p2.x);
      const maxX = Math.max(el.p1.x, el.p2.x);
      const minY = Math.min(el.p1.y, el.p2.y);
      const maxY = Math.max(el.p1.y, el.p2.y);
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;
      return [
        { key: 'right', worldPos: { x: maxX, y: midY } },
        { key: 'left', worldPos: { x: minX, y: midY } },
        { key: 'front', worldPos: { x: midX, y: maxY } },
        { key: 'back', worldPos: { x: midX, y: minY } },
      ];
    }
    if ((el.type === 'door' || el.type === 'window' || el.type === 'wall-opening') && el.hostWallId && typeof el.hostT === 'number') {
        const wall = elementsMap.get(el.hostWallId);
        if (wall && wall.p1 && wall.p2) {
            const width = el.width || 0.8;
            const L = getWallLength(wall);
            let dt = (L > 0) ? width / L : 0;
            
            if (isCurvedElement(wall)) {
                const eps = 0.005;
                const pMid = getCurvePoint(wall, el.hostT);
                if (pMid) {
                    const pNext = getCurvePoint(wall, el.hostT + eps) || pMid;
                    const pPrev = getCurvePoint(wall, el.hostT - eps) || pMid;
                    const dS = Math.hypot(pNext.x - pPrev.x, pNext.y - pPrev.y);
                    const speed = dS / (eps * 2);
                    if (speed > 0.0001) dt = width / speed;
                }
            }
            
            const pL = getCurvePoint(wall, el.hostT - dt/2);
            const pR = getCurvePoint(wall, el.hostT + dt/2);
            const handles = [];
            if (pL) handles.push({ key: 'edge_L', worldPos: pL });
            if (pR) handles.push({ key: 'edge_R', worldPos: pR });
            return handles;
        }
    }
    if (el.type === 'stair' && el.p1 && el.p2) {
      const dx = el.p2.x - el.p1.x; const dy = el.p2.y - el.p1.y;
      const len = Math.sqrt(dx*dx + dy*dy);
      // Width handle: at midpoint, offset by width/2
      const nx = -dy/len; const ny = dx/len;
      const mid = { x: (el.p1.x + el.p2.x)/2, y: (el.p1.y + el.p2.y)/2 };
      const width = el.width || 1.0;
      return [
        { key: 'width_right', worldPos: { x: mid.x + nx * width/2, y: mid.y + ny * width/2 } },
        { key: 'width_left', worldPos: { x: mid.x - nx * width/2, y: mid.y - ny * width/2 } }
      ];
    }
    if (!el.pos) return [];
    const w = el.width || 1;
    const d = el.depth || 1;
    const rot = (el.rotation || 0) * Math.PI / 180;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    if (isUShapedInteriorElement(el)) {
      const armThickness = Math.min(w, d, 0.6);
      const leftArmDepth = Math.min(d, Math.max(armThickness, el.symbolLeftArmDepth || d));
      const rightArmDepth = Math.min(d, Math.max(armThickness, el.symbolRightArmDepth || d));
      const points = [
        { key: 'right', lx: w / 2, ly: 0 },
        { key: 'left', lx: -w / 2, ly: 0 },
        { key: 'back', lx: 0, ly: -d / 2 },
        { key: 'u_left_arm', lx: -w / 2 + armThickness / 2, ly: -d / 2 + leftArmDepth },
        { key: 'u_right_arm', lx: w / 2 - armThickness / 2, ly: -d / 2 + rightArmDepth },
      ];
      return points.map(pt => ({
        key: pt.key,
        worldPos: {
          x: el.pos!.x + (pt.lx * cos - pt.ly * sin),
          y: el.pos!.y + (pt.lx * sin + pt.ly * cos)
        }
      }));
    }
    if (isLShapedInteriorElement(el)) {
      const subType = normalizeInteriorSubType(el.subType, el.label, el.shape).toLowerCase();
      const preset = getCanonicalInteriorPreset(el.subType) || getCanonicalInteriorPreset(el.label);
      const baseW = el.symbolBaseWidth || preset?.width || w;
      const baseD = el.symbolBaseDepth || preset?.depth || d;
      const moduleScale = Math.min(1, w / Math.max(0.001, baseW), d / Math.max(0.001, baseD));
      const t = Math.min(w, d, 0.6 * Math.max(0.001, moduleScale));
      let points: { key: string; lx: number; ly: number }[];
      if (subType.includes('counter_reception_l')) {
        points = [
          { key: 'right', lx: w / 2, ly: d / 2 - t / 2 },
          { key: 'back', lx: -w / 2 + t / 2, ly: -d / 2 },
        ];
      } else if (subType.includes('counter_l_kitchen') || subType.includes('sofa_l')) {
        points = [
          { key: 'left', lx: -w / 2, ly: -d / 2 + t / 2 },
          { key: 'front', lx: w / 2 - t / 2, ly: d / 2 },
        ];
      } else {
        points = [
          { key: 'right', lx: w / 2, ly: -d / 2 + t / 2 },
          { key: 'front', lx: -w / 2 + t / 2, ly: d / 2 },
        ];
      }
      return points.map(pt => ({
        key: pt.key,
        worldPos: {
          x: el.pos!.x + (pt.lx * cos - pt.ly * sin),
          y: el.pos!.y + (pt.lx * sin + pt.ly * cos)
        }
      }));
    }
    const points = [
        { key: 'right', lx: w/2, ly: 0 },
        { key: 'left', lx: -w/2, ly: 0 },
        { key: 'front', lx: 0, ly: d/2 },
        { key: 'back', lx: 0, ly: -d/2 },
    ];
    return points.map(pt => ({
        key: pt.key,
        worldPos: {
            x: el.pos!.x + (pt.lx * cos - pt.ly * sin),
            y: el.pos!.y + (pt.lx * sin + pt.ly * cos)
        }
    }));
  };

  const hitTestSingleElement = useCallback((el: ArchElement, world: Point, tolerance: number): boolean => {
    if (el.layer && project.layers) {
      const layer = project.layers.find(l => l.name === el.layer);
      if (layer && (layer.locked || !layer.visible)) {
        return false;
      }
    }
    const baseTolerance = (el.type === 'wall' ? (el.thickness || 0.23) / 2 : 0.15);
    const actualTolerance = Math.max(baseTolerance, tolerance);

    if (el.pos) {
       if (['furniture', 'counter', 'fixture', 'column'].includes(el.type)) {
           const w = el.width || 1; const d = el.depth || 1;
           const rad = -(el.rotation || 0) * Math.PI / 180;
           const dx = world.x - el.pos.x; const dy = world.y - el.pos.y;
           const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
           const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
           if (Math.abs(lx) <= w/2 + actualTolerance && Math.abs(ly) <= d/2 + actualTolerance) return true;
       }
       if (Math.sqrt((world.x - el.pos.x) ** 2 + (world.y - el.pos.y) ** 2) < Math.max(0.5, actualTolerance)) return true;
    }
    if (el.p1 && el.p2) {
      const {x: x1, y: y1} = el.p1, {x: x2, y: y2} = el.p2;
      if (el.type === 'dimension') {
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
        if (len < 0.001) return false;
        const nx = -dy / len, ny = dx / len;
        let offset = 0.5;
        if (el.p3) offset = (el.p3.x - x1) * nx + (el.p3.y - y1) * ny;
        const d1x = x1 + nx * offset, d1y = y1 + ny * offset;
        const d2x = x2 + nx * offset, d2y = y2 + ny * offset;
        const tDim = Math.max(0, Math.min(1, ((world.x - d1x) * (d2x - d1x) + (world.y - d1y) * (d2y - d1y)) / (len * len)));
        return Math.sqrt((world.x - (d1x + tDim * (d2x - d1x))) ** 2 + (world.y - (d1y + tDim * (d2y - d1y))) ** 2) < actualTolerance;
      }
      if (el.type === 'gridline') {
        const bubbleRadWorld = 14 / editorState.zoom;
        if (Math.hypot(world.x - x1, world.y - y1) < bubbleRadWorld) return true;
        if (Math.hypot(world.x - x2, world.y - y2) < bubbleRadWorld) return true;
      }
      const source = getCurveSource(el);
      if (el.type === 'rectangle') {
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2), minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
        return (Math.abs(world.x - minX) < actualTolerance && world.y >= minY - actualTolerance && world.y <= maxY + actualTolerance) || 
               (Math.abs(world.x - maxX) < actualTolerance && world.y >= minY - actualTolerance && world.y <= maxY + actualTolerance) || 
               (Math.abs(world.y - minY) < actualTolerance && world.x >= minX - actualTolerance && world.x <= maxX + actualTolerance) || 
               (Math.abs(world.y - maxY) < actualTolerance && world.x >= minX - actualTolerance && world.x <= maxX + actualTolerance);
      }
      if (source === 'circle' || source === 'ellipse' || source === 'arc') {
          const samples = 80; let minD = Infinity;
          for (let i = 0; i <= samples; i++) {
              const pt = getCurvePoint(el, i / samples);
              if (pt) {
                  const d = Math.hypot(world.x - pt.x, world.y - pt.y);
                  if (d < minD) minD = d;
              }
          }
          return minD < actualTolerance;
      }
      const lenSq = (x2 - x1) ** 2 + (y2 - y1) ** 2; if (lenSq === 0) return false;
      const t = Math.max(0, Math.min(1, ((world.x - x1) * (x2 - x1) + (world.y - y1) * (y2 - y1)) / lenSq));
      if (el.type === 'stair') {
          if (Math.sqrt((world.x - (x1 + t * (x2 - x1))) ** 2 + (world.y - (y1 + t * (y2 - y1))) ** 2) < (el.width || 1)/2 + actualTolerance) return true;
          if (el.p3 && el.p2) {
              const x3 = el.p3.x, y3 = el.p3.y;
              const lenSq2 = (x3 - x2) ** 2 + (y3 - y2) ** 2;
              if (lenSq2 > 0) {
                  const t2 = Math.max(0, Math.min(1, ((world.x - x2) * (x3 - x2) + (world.y - y2) * (y3 - y2)) / lenSq2));
                  if (Math.sqrt((world.x - (x2 + t2 * (x3 - x2))) ** 2 + (world.y - (y2 + t2 * (y3 - y2))) ** 2) < (el.width || 1)/2 + actualTolerance) return true;
              }
          }
          if (el.p4 && el.p3) {
              const x3 = el.p3.x, y3 = el.p3.y;
              const x4 = el.p4.x, y4 = el.p4.y;
              const lenSq3 = (x4 - x3) ** 2 + (y4 - y3) ** 2;
              if (lenSq3 > 0) {
                  const t3 = Math.max(0, Math.min(1, ((world.x - x3) * (x4 - x3) + (world.y - y3) * (y4 - y3)) / lenSq3));
                  if (Math.sqrt((world.x - (x3 + t3 * (x4 - x3))) ** 2 + (world.y - (y3 + t3 * (y4 - y3))) ** 2) < (el.width || 1)/2 + actualTolerance) return true;
              }
          }
          return false;
      }
      return Math.sqrt((world.x - (x1 + t * (x2 - x1))) ** 2 + (world.y - (y1 + t * (y2 - y1))) ** 2) < actualTolerance;
    }
    if (el.boundary && el.boundary.length >= 3) {
      if (el.type === 'ceiling' || (el.usageType as any) === 'site-map') return false; 
      for (let i = 0; i < el.boundary.length; i++) {
        const p1 = el.boundary[i], p2 = el.boundary[(i + 1) % el.boundary.length], dx = p2.x - p1.x, dy = p2.y - p1.y, l2 = dx*dx + dy*dy;
        if (l2 < 0.01) continue; const t = Math.max(0, Math.min(1, ((world.x - p1.x) * dx + (world.y - p1.y) * dy) / l2));
        if (Math.sqrt((world.x - (p1.x + t * dx)) ** 2 + (world.y - (p1.y + t * dy)) ** 2) < actualTolerance) return true;
      }
      const isInPolygon = (pt: Point, poly: Point[]) => {
        let inside = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const xi = poly[i].x, yi = poly[i].y;
          const xj = poly[j].x, yj = poly[j].y;
          const intersect = ((yi > pt.y) !== (yj > pt.y))
              && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
          if (intersect) inside = !inside;
        }
        return inside;
      };
      if (editorState.viewMode === '2D' && editorState.activeTool === 'select' && el.type === 'floor' && isInPolygon(world, el.boundary)) {
        return true;
      }
      return false;
    }
    if ((el.type as any) === 'cad-underlay' && el.cadElements) {
      return el.cadElements.some(child => hitTestSingleElement(child, world, tolerance));
    }
    return false;
  }, [project.layers, editorState.zoom, editorState.viewMode, editorState.activeTool]);

  const hitPriority = (el: ArchElement): number => {
    if (el.type === 'door' || el.type === 'window' || el.type === 'wall-opening' || el.type === 'furniture' || el.type === 'counter' || el.type === 'fixture' || el.type === 'column') return 0;
    if (el.type === 'wall' || el.type === 'line' || el.type === 'railing' || el.type === 'stair' || el.type === 'room' || el.type === 'dimension') return 1;
    if (el.type === 'floor' || el.type === 'ceiling') return 3;
    return 2;
  };

  const getHitElements = useCallback((world: Point) => {
    const candidates = getElementsNearPoint(world, 5.0);
    const sorted = [...candidates].sort((a, b) => hitPriority(a) - hitPriority(b));
    const tolerance = 15 / editorState.zoom;
    return sorted.filter(el => hitTestSingleElement(el, world, tolerance));
  }, [getElementsNearPoint, hitTestSingleElement, editorState.zoom]);

  const getHitElement = useCallback((world: Point) => {
    const threshold = RESIZE_HANDLE_HIT_RADIUS_PX / editorState.zoom;
    // 1. Resize handles. These can be visible on selected or hovered elements, so hit-test both.
    const handleCandidateIds = [
      ...(editorState.selectedIds.length === 1 ? [editorState.selectedIds[0]] : []),
      ...(hoveredElementId ? [hoveredElementId] : []),
    ];
    let nearestHandle: { id: string; key: string; distance: number } | null = null;
    handleCandidateIds.forEach((id) => {
      const el = project.elements.find(e => e.id === id);
      if (!el) return;
      getResizeHandles(el).forEach((h) => {
        const distance = Math.hypot(world.x - h.worldPos.x, world.y - h.worldPos.y);
        if (distance < threshold && (!nearestHandle || distance < nearestHandle.distance)) {
          nearestHandle = { id: el.id, key: h.key, distance };
        }
      });
    });
    if (nearestHandle) {
      return `HANDLE:${nearestHandle.id}:${nearestHandle.key}`;
    }

    const sorted = [...project.elements].sort((a, b) => hitPriority(a) - hitPriority(b));
    return sorted.find(el => {
      const baseTolerance = (el.type === 'wall' ? (el.thickness || 0.23) / 2 : 0.15);
      // Give a dynamic screen space tolerance (e.g. 15 pixels) to make selecting zoomed out objects extremely easy
      const tolerance = Math.max(baseTolerance, 15 / editorState.zoom);

      if (el.pos) {
         // Furniture Box Check
         if (['furniture', 'counter', 'fixture', 'column'].includes(el.type)) {
             const w = el.width || 1; const d = el.depth || 1;
             const rad = -(el.rotation || 0) * Math.PI / 180;
             const dx = world.x - el.pos.x; const dy = world.y - el.pos.y;
             const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
             const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
             if (Math.abs(lx) <= w/2 + tolerance && Math.abs(ly) <= d/2 + tolerance) return true;
         }
         if (Math.sqrt((world.x - el.pos.x) ** 2 + (world.y - el.pos.y) ** 2) < Math.max(0.5, 15 / editorState.zoom)) return true;
      }
      if (el.p1 && el.p2) {
        const {x: x1, y: y1} = el.p1, {x: x2, y: y2} = el.p2;
        if (el.type === 'dimension') {
          const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
          if (len < 0.001) return false;
          const nx = -dy / len, ny = dx / len;
          let offset = 0.5;
          if (el.p3) offset = (el.p3.x - x1) * nx + (el.p3.y - y1) * ny;
          const d1x = x1 + nx * offset, d1y = y1 + ny * offset;
          const d2x = x2 + nx * offset, d2y = y2 + ny * offset;
          const tDim = Math.max(0, Math.min(1, ((world.x - d1x) * (d2x - d1x) + (world.y - d1y) * (d2y - d1y)) / (len * len)));
          return Math.sqrt((world.x - (d1x + tDim * (d2x - d1x))) ** 2 + (world.y - (d1y + tDim * (d2y - d1y))) ** 2) < tolerance;
        }
        if (el.type === 'gridline') {
          const bubbleRadWorld = 14 / editorState.zoom;
          if (Math.hypot(world.x - x1, world.y - y1) < bubbleRadWorld) return true;
          if (Math.hypot(world.x - x2, world.y - y2) < bubbleRadWorld) return true;
        }
        const source = getCurveSource(el);
        if (el.type === 'rectangle') {
          const minX = Math.min(x1, x2), maxX = Math.max(x1, x2), minY = Math.min(y1, y2), maxY = Math.max(y1, y2);
          const onEdge = (Math.abs(world.x - minX) < tolerance && world.y >= minY - tolerance && world.y <= maxY + tolerance) || 
                         (Math.abs(world.x - maxX) < tolerance && world.y >= minY - tolerance && world.y <= maxY + tolerance) || 
                         (Math.abs(world.y - minY) < tolerance && world.x >= minX - tolerance && world.x <= maxX + tolerance) || 
                         (Math.abs(world.y - maxY) < tolerance && world.x >= minX - tolerance && world.x <= maxX + tolerance);
          return onEdge;
        }
        if (source === 'circle' || source === 'ellipse' || source === 'arc') {
            const samples = 80; let minD = Infinity;
            for (let i = 0; i <= samples; i++) {
                const pt = getCurvePoint(el, i / samples);
                if (pt) {
                    const d = Math.hypot(world.x - pt.x, world.y - pt.y);
                    if (d < minD) minD = d;
                }
            }
            return minD < tolerance;
        }
        const lenSq = (x2 - x1) ** 2 + (y2 - y1) ** 2; if (lenSq === 0) return false;
        const t = Math.max(0, Math.min(1, ((world.x - x1) * (x2 - x1) + (world.y - y1) * (y2 - y1)) / lenSq));
        if (el.type === 'stair') {
            // Check segment p1-p2
            if (Math.sqrt((world.x - (x1 + t * (x2 - x1))) ** 2 + (world.y - (y1 + t * (y2 - y1))) ** 2) < (el.width || 1)/2 + tolerance) return true;
            // Check segment p2-p3 if L/U
            if (el.p3 && el.p2) {
                const x3 = el.p3.x, y3 = el.p3.y;
                const lenSq2 = (x3 - x2) ** 2 + (y3 - y2) ** 2;
                if (lenSq2 > 0) {
                    const t2 = Math.max(0, Math.min(1, ((world.x - x2) * (x3 - x2) + (world.y - y2) * (y3 - y2)) / lenSq2));
                    if (Math.sqrt((world.x - (x2 + t2 * (x3 - x2))) ** 2 + (world.y - (y2 + t2 * (y3 - y2))) ** 2) < (el.width || 1)/2 + tolerance) return true;
                }
            }
            // Check segment p3-p4 if U
            if (el.p4 && el.p3) {
                const x3 = el.p3.x, y3 = el.p3.y;
                const x4 = el.p4.x, y4 = el.p4.y;
                const lenSq3 = (x4 - x3) ** 2 + (y4 - y3) ** 2;
                if (lenSq3 > 0) {
                    const t3 = Math.max(0, Math.min(1, ((world.x - x3) * (x4 - x3) + (world.y - y3) * (y4 - y3)) / lenSq3));
                    if (Math.sqrt((world.x - (x3 + t3 * (x4 - x3))) ** 2 + (world.y - (y3 + t3 * (y4 - y3))) ** 2) < (el.width || 1)/2 + tolerance) return true;
                }
            }
            return false;
        }
        return Math.sqrt((world.x - (x1 + t * (x2 - x1))) ** 2 + (world.y - (y1 + t * (y2 - y1))) ** 2) < tolerance;
      }
      if (el.boundary && el.boundary.length >= 3) {
        if (el.type === 'ceiling') return false; 
        for (let i = 0; i < el.boundary.length; i++) {
          const p1 = el.boundary[i], p2 = el.boundary[(i + 1) % el.boundary.length], dx = p2.x - p1.x, dy = p2.y - p1.y, l2 = dx*dx + dy*dy;
          if (l2 < 0.01) continue; const t = Math.max(0, Math.min(1, ((world.x - p1.x) * dx + (world.y - p1.y) * dy) / l2));
          if (Math.sqrt((world.x - (p1.x + t * dx)) ** 2 + (world.y - (p1.y + t * dy)) ** 2) < tolerance) return true;
        }
        return false;
      }
      return false;
    });
  }, [project.elements, editorState.selectedIds, getResizeHandles, editorState.zoom, hoveredElementId]);

  const applyOrtho = (p: Point, base?: Point, e?: React.MouseEvent | KeyboardEvent): Point => {
    if (!base) return p;
    
    // Rect/Ellipse tool: Square/Circle constraint via shift or ortho
    if (editorState.activeTool === 'rect' || editorState.activeTool === 'ellipse') {
        if ((e && e.shiftKey) || editorState.isOrthoEnabled) {
            const dx = p.x - base.x; const dy = p.y - base.y;
            const size = Math.max(Math.abs(dx), Math.abs(dy));
            return { x: base.x + Math.sign(dx || 1) * size, y: base.y + Math.sign(dy || 1) * size };
        }
        return p;
    }

    const linearTools = new Set<EditorTool>(['line', 'gridline', 'wall', 'stair', 'railing']);
    if (!linearTools.has(editorState.activeTool)) return p;
    
    const isOrthoActive = editorState.isOrthoEnabled || (e && e.shiftKey);
    if (!isOrthoActive) return p;
    
    const dx = p.x - base.x; const dy = p.y - base.y;
    if (Math.abs(dx) >= Math.abs(dy)) return { x: p.x, y: base.y };
    else return { x: base.x, y: p.y };
  };

  const getAlignmentPoints = useCallback((): Point[] => {
    const pts: Point[] = [];
    project.elements.forEach(el => {
        // Skip non-design elements
        if (['dimension', 'elevation-marker', 'room'].includes(el.type)) return;

        if (el.p1) pts.push(el.p1);
        if (el.p2) pts.push(el.p2);
        if (el.p3) pts.push(el.p3);
        if (el.p4) pts.push(el.p4);
        if (el.pos) pts.push(el.pos);
        if (el.boundary) pts.push(...el.boundary);
        if (isCurvedElement(el)) {
            const params = getCurveParams(el);
            if (params.source === 'circle' || params.source === 'ellipse') {
                pts.push({ x: params.cx, y: params.cy });
            }
        }
    });
    return pts;
  }, [project.elements]);

  const getSnapPointNearMouse = useCallback((worldPos: Point): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const threshold = 1.2 / (editorState.zoom / 15);
    const allPts = getAlignmentPoints();
    
    for (const p of allPts) {
      const s = worldToScreen(p);
      if (s.x >= 0 && s.x <= canvas.width && s.y >= 0 && s.y <= canvas.height) {
        if (Math.hypot(worldPos.x - p.x, worldPos.y - p.y) < threshold) {
          return p;
        }
      }
    }
    return null;
  }, [getAlignmentPoints, editorState.zoom, worldToScreen]);

  const applyAdvancedSnapping = useCallback((worldPos: Point, basePoint?: Point): { point: Point; type: typeof snapPreview.type; alignX?: number; alignY?: number; alignAngled?: Point; alignPts?: Point[]; refSegment?: { p1: Point, p2: Point } } => {
      const threshold = 1.2 / (editorState.zoom / 15);
      let bestSnap: Point = worldPos; let bestType: typeof snapPreview.type = null; let minD = Infinity;
      const segments = getAllSegments();
      if (editorState.isEndpointSnap) segments.forEach(s => [s.p1, s.p2].forEach(p => { const d = Math.hypot(worldPos.x - p.x, worldPos.y - p.y); if (d < threshold && d < minD) { bestSnap = p; bestType = 'endpoint'; minD = d; } }));
      if (editorState.isIntersectionSnap && !bestType) {
        for (let i = 0; i < segments.length; i++) for (let j = i + 1; j < segments.length; j++) {
            const int = getLineIntersection(segments[i].p1, segments[i].p2, segments[j].p1, segments[j].p2);
            if (int) { const d = Math.hypot(worldPos.x - int.x, worldPos.y - int.y); if (d < threshold && d < minD) { bestSnap = int; bestType = 'intersection'; minD = d; } }
          }
      }
      if (editorState.isMidpointSnap && !bestType) segments.forEach(s => { const mid = { x: (s.p1.x + s.p2.x) / 2, y: (s.p1.y + s.p2.y) / 2 }; const d = Math.hypot(worldPos.x - mid.x, worldPos.y - mid.y); if (d < threshold && d < minD) { bestSnap = mid; bestType = 'midpoint'; minD = d; } });
      
      // Wall Center-line Snapping (Parallel to wall) - Only for Column tool as requested
      if (!bestType && editorState.activeTool === 'column') {
          const near = findNearestWall(worldPos);
          if (near && near.dist < threshold * 0.8) {
              bestSnap = near.point;
              bestType = 'wall-path';
              minD = near.dist;
          }
      }

      if (editorState.isSnapEnabled && editorState.isGridVisible && !bestType) {
        const snapped = { x: Math.round(worldPos.x / GRID_SIZE) * GRID_SIZE, y: Math.round(worldPos.y / GRID_SIZE) * GRID_SIZE };
        const d = Math.hypot(worldPos.x - snapped.x, worldPos.y - snapped.y); if (d < threshold) { bestSnap = snapped; bestType = 'grid'; }
      }

      // --- ALIGNMENT SNAP (H/V/Angled/Parallel/Perpendicular) ---
      let alignX: number | undefined;
      let alignY: number | undefined;
      let alignAngled: Point | undefined;
      let refSegment: { p1: Point, p2: Point } | undefined;
      const alignPts: Point[] = [];

      if (editorState.isPointAlignmentSnap || editorState.isAngularAlignmentSnap) {
        const alignThreshold = threshold * 0.45;
        
        // Dynamic Filtering: Only align to:
        // 1. Current active drawing/drag-start reference point (basePoint or dragStart)
        // 2. Points explicitly acquired via hover-to-track (acquiredPoints)
        const allAlignedPts: Point[] = [];
        if (basePoint) {
            allAlignedPts.push(basePoint);
        } else if (dragStart) {
            allAlignedPts.push(dragStart);
        }
        
        acquiredPoints.forEach(p => {
            const alreadyExists = allAlignedPts.some(ap => Math.hypot(ap.x - p.x, ap.y - p.y) < 0.01);
            if (!alreadyExists) {
                allAlignedPts.push(p);
            }
        });
        
        allAlignedPts.forEach(p => {
            const adx = Math.abs(worldPos.x - p.x);
            const ady = Math.abs(worldPos.y - p.y);
            
            let snappedThisPoint = false;
            // Point Alignment (H/V)
            if (editorState.isPointAlignmentSnap) {
                if (adx < alignThreshold) {
                    bestSnap = { ...bestSnap, x: p.x };
                    alignX = p.x;
                    snappedThisPoint = true;
                }
                if (ady < alignThreshold) {
                    bestSnap = { ...bestSnap, y: p.y };
                    alignY = p.y;
                    snappedThisPoint = true;
                }
            }
            
            // 45 degree Alignment (Angular)
            if (editorState.isAngularAlignmentSnap && !snappedThisPoint && Math.abs(adx - ady) < alignThreshold && adx > alignThreshold * 2) {
                const signX = Math.sign(worldPos.x - p.x) || 1;
                const signY = Math.sign(worldPos.y - p.y) || 1;
                const avgDist = (adx + ady) / 2;
                bestSnap = { x: p.x + signX * avgDist, y: p.y + signY * avgDist };
                alignAngled = p;
                snappedThisPoint = true;
            }

            if (snappedThisPoint && !alignPts.some(ap => ap.x === p.x && ap.y === p.y)) {
                alignPts.push(p);
            }
        });
        if ((alignX !== undefined || alignY !== undefined || alignAngled !== undefined) && !bestType) bestType = 'alignment';

        // --- PARALLEL / PERPENDICULAR SNAP ---
        if (editorState.isAngularAlignmentSnap && !bestType && basePoint) {
            const v_cur = { x: worldPos.x - basePoint.x, y: worldPos.y - basePoint.y };
            const len_cur = Math.hypot(v_cur.x, v_cur.y);
            
            if (len_cur > threshold * 3) {
                for (const s of segments) {
                    const v_seg = { x: s.p2.x - s.p1.x, y: s.p2.y - s.p1.y };
                    const len_seg = Math.hypot(v_seg.x, v_seg.y);
                    if (len_seg < 0.1) continue;
                    
                    const ux = v_seg.x / len_seg, uy = v_seg.y / len_seg;
                    const nx = -uy, ny = ux;
                    
                    // Parallel check: current vector component along normal should be small
                    const d_para = Math.abs(v_cur.x * nx + v_cur.y * ny);
                    if (d_para < alignThreshold) {
                        const proj = v_cur.x * ux + v_cur.y * uy;
                        bestSnap = { x: basePoint.x + ux * proj, y: basePoint.y + uy * proj };
                        bestType = 'parallel';
                        refSegment = s;
                        break;
                    }
                    
                    // Perpendicular check: current vector component along segment should be small
                    const d_perp = Math.abs(v_cur.x * ux + v_cur.y * uy);
                    if (d_perp < alignThreshold) {
                        const proj = v_cur.x * nx + v_cur.y * ny;
                        bestSnap = { x: basePoint.x + nx * proj, y: basePoint.y + ny * proj };
                        bestType = 'perpendicular';
                        refSegment = s;
                        break;
                    }
                }
            }
        }
      }

      return { point: bestSnap, type: bestType, alignX, alignY, alignAngled, alignPts, refSegment };
    }, [editorState, getAllSegments, project.elements, getAlignmentPoints, dragStart, acquiredPoints]);

  const drawElevationMarker = (ctx: CanvasRenderingContext2D, el: ArchElement, screenPos: Point) => {
    const { x, y } = screenPos;
    const isSelected = editorState.selectedIds.includes(el.id);
    const isHovered = hoveredIds.has(el.id);

    const rotationMap: Record<string, number> = { N: Math.PI, S: 0, E: -Math.PI / 2, W: Math.PI / 2 };
    const rot = (el.rotation !== undefined ? (el.rotation * Math.PI / 180) : rotationMap[el.direction || 'N']) + ((editorState.canvasAngle || 0) * Math.PI) / 180;

    const zoomScale = editorState.zoom / 15;
    const radius = 12 * zoomScale;
    
    // Set colors based on selection and hover states
    let strokeColor = '#0f172a'; // Deep charcoal/dark slate for standard CAD look
    let fillColor = '#0f172a';   // Filled black arrowhead
    let textColor = '#0f172a';

    if (isSelected) {
      strokeColor = APP_COLORS.highlight;
      fillColor = APP_COLORS.highlight;
      textColor = APP_COLORS.highlight;
    } else if (isHovered) {
      strokeColor = '#1d4ed8'; // Crisp interactive blue
      fillColor = '#1d4ed8';
      textColor = '#1d4ed8';
    }

    // 1. Draw pointing arrowhead (rotated)
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);

    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = Math.max(0.5, 1.2 * zoomScale);
    
    ctx.beginPath();
    ctx.moveTo(0, -22 * zoomScale);         // Apex pointing up/outwards
    ctx.lineTo(15 * zoomScale, -4 * zoomScale);        // Right base
    ctx.lineTo(-15 * zoomScale, -4 * zoomScale);       // Left base
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Small dash above the peak to exactly match user's image
    ctx.beginPath();
    ctx.moveTo(-2 * zoomScale, -26 * zoomScale);
    ctx.lineTo(2 * zoomScale, -26 * zoomScale);
    ctx.stroke();

    ctx.restore();

    // 2. Draw the upright circle, divider, and directions (unrotated)
    ctx.save();
    ctx.translate(x, y);

    // Circle head (filled background shade to mask overlapping items)
    ctx.fillStyle = APP_COLORS.background;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = Math.max(0.5, 1.2 * zoomScale);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Horizontal divider line
    ctx.beginPath();
    ctx.moveTo(-radius, 0);
    ctx.lineTo(radius, 0);
    ctx.stroke();

    // Minimalist Compass Direction (N, S, E, W) in the upper half
    ctx.fillStyle = textColor;
    ctx.font = 'bold ' + Math.max(4, 9 * zoomScale) + 'px "JetBrains Mono", "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(el.direction || '', 0, -5 * zoomScale);

    // Minimalist dash in the lower half of the circle (matching standard CAD detail block)
    ctx.fillStyle = isSelected ? APP_COLORS.highlight : '#64748b'; // slate grey
    ctx.font = 'normal ' + Math.max(3, 8 * zoomScale) + 'px "JetBrains Mono", "Inter", sans-serif';
    ctx.fillText('-', 0, 5 * zoomScale);

    ctx.restore();
  };

  const drawFloorSummary = (ctx: CanvasRenderingContext2D, el: ArchElement) => {
    if (!el.boundary || el.boundary.length < 3) return;
    if (el.isAIGeneratedFloor) return;
    
    // Calculate bounding box
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    el.boundary.forEach(pt => {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    });
    
    const w = maxX - minX;
    const h = maxY - minY;
    
    // Calculate area (Shoelace formula)
    let polyArea = 0;
    const pts = el.boundary;
    let j = pts.length - 1;
    for (let i = 0; i < pts.length; i++) {
      polyArea += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
      j = i;
    }
    polyArea = Math.abs(polyArea / 2);

    // Construct label lines
    let title = 'FLOORPLAN';
    if (el.proceduralRequirements?.subtype) {
      title = el.proceduralRequirements.subtype.toUpperCase();
    } else if (el.proceduralProgramId) {
      title = el.proceduralProgramId.replace('domestic-', '').replace('residential-', '').replace('office-', '').replace('retail-', '').replace('food-', '').replace('healthcare-', '').replace('educational-', '').replace('industrial-', '').replace(/-/g, ' ').toUpperCase();
    }
    
    const dimStr = `${formatDimension(w, editorState.unitSystem)} x ${formatDimension(h, editorState.unitSystem)}`;
    const areaStr = formatArea(polyArea, editorState.unitSystem);
    
    // Find bottom-center of bounding box in world space
    const bottomCenterWorld = { x: (minX + maxX) / 2, y: maxY };
    const s = worldToScreen(bottomCenterWorld);
    
    ctx.save();
    ctx.translate(s.x, s.y);
    
    const scale = editorState.zoom / 15;
    const titleSize = Math.max(9, 13 * scale);
    const infoSize = Math.max(7.5, 10 * scale);
    
    // Draw card background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
    ctx.lineWidth = 1;
    
    const cardW = Math.max(120, 160 * scale);
    const cardH = Math.max(60, 80 * scale);
    
    ctx.beginPath();
    // Round rect
    const r = 8 * scale;
    const rx = -cardW / 2;
    const ry = 15 * scale; // 15px below the layout
    
    if (ctx.roundRect) {
      ctx.roundRect(rx, ry, cardW, cardH, r > 2 ? r : 2);
    } else {
      ctx.rect(rx, ry, cardW, cardH);
    }
    ctx.fill();
    ctx.stroke();
    
    // Draw text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Line 1: Title
    ctx.fillStyle = '#0f172a';
    ctx.font = `bold ${titleSize}px Inter, sans-serif`;
    ctx.fillText(title, 0, ry + cardH * 0.25);
    
    // Line 2: Dimensions
    ctx.fillStyle = '#475569';
    ctx.font = `${infoSize}px "JetBrains Mono", monospace`;
    ctx.fillText(dimStr, 0, ry + cardH * 0.52);
    
    // Line 3: Area
    ctx.fillStyle = '#1e293b';
    ctx.font = `bold ${infoSize}px "JetBrains Mono", monospace`;
    ctx.fillText(areaStr, 0, ry + cardH * 0.78);
    
    ctx.restore();
  };

  const drawDimensionElement = (ctx: CanvasRenderingContext2D, el: ArchElement, isSelected: boolean, isHovered: boolean) => {
    if (!el.p1 || !el.p2) return;
    const s1 = worldToScreen(el.p1);
    const s2 = worldToScreen(el.p2);
    const zoomScale = editorState.zoom / 15;
    
    const dx = s2.x - s1.x;
    const dy = s2.y - s1.y;
    const lenScreen = Math.hypot(dx, dy);
    if (lenScreen < 2) return;
    
    const ux = dx / lenScreen;
    const uy = dy / lenScreen;
    const nx = -uy; // perpendicular (normal) vector
    const ny = ux;
    
    // Custom styled colors and properties
    const defaultColor = isSelected ? APP_COLORS.highlight : (isHovered ? '#1d4ed8' : '#64748b');
    const color = el.dimensionColor || el.color || defaultColor;
    const lineThickness = (el.dimensionLineThickness || 0.8) * 0.75; // Lighter default
    const showExtension = el.dimensionShowExtension ?? true;
    const fontFamily = el.textFontFamily || '"Inter", sans-serif';
    const fontSize = el.textFontSize || 8; // Smaller default
    const isBold = el.textBold ?? false; // Not bold by default for lighter look
    const isItalic = el.textItalic ?? false;
    const isUnderline = el.textUnderline ?? false;
    const precision = el.dimensionPrecision !== undefined 
      ? el.dimensionPrecision 
      : (editorState.unitSystem === 'imperial' ? globalInchesDecimalPlaces : 2);

    // Calculate Offset
    let offsetDist = 15 * zoomScale; // default
    if (el.p3) {
        const s3 = worldToScreen(el.p3);
        // project (s3 - s1) onto Normal (nx, ny)
        offsetDist = (s3.x - s1.x) * nx + (s3.y - s1.y) * ny;
    }

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(0.4, lineThickness * zoomScale);
    
    const d1 = { x: s1.x + nx * offsetDist, y: s1.y + ny * offsetDist };
    const d2 = { x: s2.x + nx * offsetDist, y: s2.y + ny * offsetDist };
    
    // Main dimension line
    ctx.beginPath();
    ctx.moveTo(d1.x, d1.y);
    ctx.lineTo(d2.x, d2.y);
    ctx.stroke();
    
    // 2. Draw extension lines (dotted)
    if (showExtension) {
      ctx.save();
      ctx.strokeStyle = isSelected ? APP_COLORS.highlight : 'rgba(100, 116, 139, 0.5)';
      ctx.lineWidth = Math.max(0.3, 0.5 * zoomScale);
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      // Ext 1
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(d1.x + nx * (2 * zoomScale * (offsetDist >= 0 ? 1 : -1)), d1.y + ny * (2 * zoomScale * (offsetDist >= 0 ? 1 : -1)));
      // Ext 2
      ctx.moveTo(s2.x, s2.y);
      ctx.lineTo(d2.x + nx * (2 * zoomScale * (offsetDist >= 0 ? 1 : -1)), d2.y + ny * (2 * zoomScale * (offsetDist >= 0 ? 1 : -1)));
      ctx.stroke();
      ctx.restore();
    }
    
    // 3. Draw architectural ticks (diagonal strokes) - finer
    const tickSize = 4 * zoomScale;
    ctx.save();
    ctx.lineWidth = Math.max(0.8, lineThickness * 1.2 * zoomScale);
    ctx.beginPath();
    // Tick at d1
    ctx.moveTo(d1.x - (ux + nx) * tickSize / 2, d1.y - (uy + ny) * tickSize / 2);
    ctx.lineTo(d1.x + (ux + nx) * tickSize / 2, d1.y + (uy + ny) * tickSize / 2);
    // Tick at d2
    ctx.moveTo(d2.x - (ux + nx) * tickSize / 2, d2.y - (uy + ny) * tickSize / 2);
    ctx.lineTo(d2.x + (ux + nx) * tickSize / 2, d2.y + (uy + ny) * tickSize / 2);
    ctx.stroke();
    ctx.restore();
    
    // 4. Dimension Text
    const worldDist = Math.hypot(el.p2.x - el.p1.x, el.p2.y - el.p1.y);
    const label = formatDimension(worldDist, editorState.unitSystem, precision);
    
    ctx.save();
    const halfFontSize = fontSize * 0.5;
    ctx.font = `${isBold ? 'bold ' : ''}${isItalic ? 'italic ' : ''}${Math.max(3, halfFontSize * zoomScale)}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const midX = (d1.x + d2.x) / 2;
    const midY = (d1.y + d2.y) / 2;
    
    // Rotate text to align with dimension line
    let angle = Math.atan2(dy, dx);
    if (angle > Math.PI/2 || angle < -Math.PI/2) angle += Math.PI;
    
    ctx.translate(midX, midY);
    ctx.rotate(angle);
    
    // Background for text to clear the line
    const tw = ctx.measureText(label).width;
    const th = halfFontSize * zoomScale;
    ctx.fillStyle = APP_COLORS.background;
    ctx.fillRect(-tw/2 - 2, -th/2 - 1, tw + 4, th + 2);
    
    ctx.fillStyle = color;
    ctx.fillText(label, 0, 0);
    ctx.restore();
    
    ctx.restore();
  };

  const drawSmartBlock = (ctx: CanvasRenderingContext2D, el: ArchElement, isGhost = false, passMode: 'outline' | 'fill' = 'outline', shrinkScreenAmt: number = 0) => {
    if (!el.pos) return;
    const p = worldToScreen(el.pos);
    const zoom = editorState.zoom;
    const w = Math.max(0, (el.width || 1) * zoom - shrinkScreenAmt);
    const d = Math.max(0, (el.depth || 1) * zoom - shrinkScreenAmt);
    const rot = ((el.rotation || 0) + (editorState.canvasAngle || 0)) * (Math.PI / 180);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(rot);
    if (el.isFlipped || el.facingFlipped) {
      ctx.scale(el.isFlipped ? -1 : 1, el.facingFlipped ? -1 : 1);
    }

    const isColumn = el.type === 'column';
    const isSelected = editorState.selectedIds.includes(el.id);
    const isHovered = hoveredIds.has(el.id);

    if (isColumn) {
        if (passMode === 'fill') {
            ctx.fillStyle = isSelected ? 'rgba(219, 234, 254, 0.95)' : '#ffffff';
            ctx.strokeStyle = ctx.fillStyle;
        } else {
            ctx.strokeStyle = isSelected ? APP_COLORS.highlight : (isHovered ? 'rgba(59, 130, 246, 0.85)' : '#1e293b');
            ctx.fillStyle = isSelected ? 'rgba(219, 234, 254, 0.95)' : '#ffffff';
        }
        ctx.lineWidth = 1; // Match wall edge weight
    } else {
        if (passMode === 'fill') {
            ctx.fillStyle = isSelected ? 'rgba(219, 234, 254, 0.95)' : APP_COLORS.background;
            ctx.strokeStyle = ctx.fillStyle;
        } else {
            const baseColor = APP_COLORS.furniture;
            ctx.strokeStyle = isSelected ? APP_COLORS.highlight : (isHovered ? 'rgba(59, 130, 246, 0.85)' : baseColor);
            ctx.fillStyle = isSelected ? 'rgba(59,130,246,0.05)' : APP_COLORS.background;
        }
        ctx.lineWidth = 1.0;
    } 
    
    if (isGhost) {
        ctx.globalAlpha = 0.6;
    }

    const isImportedRevitAsset = el.isImportedAsset || el.sourceType === 'revit_import' || el.bimMetadata?.sourceType === 'revit_import';
    if (isImportedRevitAsset) {
        const plan = el.planView2D || el.bimMetadata?.planView2D;
        const boundary = Array.isArray(plan?.boundary) && plan.boundary.length >= 3
            ? plan.boundary
            : [
                { x: -(el.width || 1) / 2, y: -(el.depth || 1) / 2 },
                { x: (el.width || 1) / 2, y: -(el.depth || 1) / 2 },
                { x: (el.width || 1) / 2, y: (el.depth || 1) / 2 },
                { x: -(el.width || 1) / 2, y: (el.depth || 1) / 2 },
              ];
        const sx = (el.width || 1) > 0 ? w / ((el.width || 1) * zoom) : 1;
        const sy = (el.depth || 1) > 0 ? d / ((el.depth || 1) * zoom) : 1;
        const toPx = (pt: Point) => ({ x: pt.x * zoom * sx, y: pt.y * zoom * sy });

        ctx.save();
        ctx.beginPath();
        boundary.forEach((pt: Point, index: number) => {
            const px = toPx(pt);
            if (index === 0) ctx.moveTo(px.x, px.y);
            else ctx.lineTo(px.x, px.y);
        });
        ctx.closePath();
        if (passMode === 'fill') {
            ctx.fillStyle = isSelected ? 'rgba(219, 234, 254, 0.95)' : 'rgba(248, 250, 252, 0.98)';
            ctx.fill();
        } else {
            ctx.fillStyle = isSelected ? 'rgba(59,130,246,0.05)' : 'rgba(248, 250, 252, 0.96)';
            ctx.strokeStyle = isSelected ? APP_COLORS.highlight : (isHovered ? 'rgba(59, 130, 246, 0.85)' : '#475569');
            ctx.lineWidth = 1.4;
            ctx.fill();
            ctx.stroke();
            ctx.save();
            ctx.strokeStyle = isSelected ? APP_COLORS.highlight : '#94a3b8';
            ctx.lineWidth = 1;
            (plan?.detailLines || []).forEach((line: { p1: Point; p2: Point }) => {
                const p1 = toPx(line.p1);
                const p2 = toPx(line.p2);
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            });
            ctx.restore();
            const tag = (el.classname || el.bimMetadata?.classname || 'RFA').slice(0, 3).toUpperCase();
            ctx.font = 'bold 9px JetBrains Mono, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = isSelected ? APP_COLORS.highlight : '#334155';
            ctx.fillText(tag, 0, 0);
        }
        ctx.restore();
        ctx.restore();
        return;
    }

    const subType = normalizeInteriorSubType(el.subType, el.label, el.shape).toLowerCase();
    const furnitureLikeSubtypes = [
        'bed', 'sofa', 'chair', 'stool', 'ottoman', 'puff', 'table', 'desk', 'conference',
        'wardrobe', 'bedside', 'coffee', 'tv_console', 'filing', 'shelf', 'buffet',
        'credenza', 'whiteboard', 'reception'
    ];
    const fixtureLikeSubtypes = [
        'wc', 'basin', 'vanity_basin', 'corner_basin', 'sink', 'double_sink', 'stove',
        'hob', 'fridge', 'washer', 'bath', 'shower'
    ];
    const counterLikeSubtypes = [
        'standard', 'island', 'counter', 'cashier', 'reception_curved', 'display_counter',
        'service_counter', 'base_cabinet'
    ];
    const visualType = el.type === 'fixture' && furnitureLikeSubtypes.some(token => subType.includes(token))
        ? 'furniture'
        : el.type === 'furniture' && fixtureLikeSubtypes.some(token => subType.includes(token))
          ? 'fixture'
          : (el.type === 'fixture' || el.type === 'furniture') && counterLikeSubtypes.some(token => subType.includes(token))
            ? 'counter'
            : el.type;
    
    // Keep interior items fully drawn while middle-panning/rotating; their plan symbols are part of the item identity.
    const isDragMover = !!(isDraggingSelected || isMiddlePanning || isMiddleRotating || isRotating);
    const isInteriorVisualType = visualType === 'furniture' || visualType === 'fixture' || visualType === 'counter';
    const isLowLOD = isDragMover && !isInteriorVisualType;
    const detailUnit = Math.max(0.001, Math.min(w || 1, d || 1));
    const detailInset = detailUnit * 0.06;
    const detailGap = detailUnit * 0.08;

    const hasUniversalInteriorSymbol = isInteriorVisualType && hasInteriorBedSymbol(subType);

    if (hasUniversalInteriorSymbol) {
        if (passMode === 'outline') {
            ctx.save();
            ctx.fillStyle = APP_COLORS.background;
            ctx.strokeStyle = isSelected ? APP_COLORS.highlight : (isHovered ? 'rgba(59, 130, 246, 0.85)' : APP_COLORS.furniture);
            drawInteriorBedSymbol(ctx, w, d, subType, editorState.zoom, getStableInteriorSymbolBase(el));
            ctx.restore();

            const placementSnapEdge = (el as ArchElement & { placementSnapEdge?: InteriorSnapEdge }).placementSnapEdge;
            if (isGhost && placementSnapEdge) {
                ctx.save();
                ctx.strokeStyle = '#2563eb';
                ctx.lineWidth = 2;
                ctx.setLineDash([]);
                ctx.beginPath();
                if (placementSnapEdge === 'back') {
                    ctx.moveTo(-w / 2, -d / 2);
                    ctx.lineTo(w / 2, -d / 2);
                } else if (placementSnapEdge === 'left') {
                    ctx.moveTo(-w / 2, -d / 2);
                    ctx.lineTo(-w / 2, d / 2);
                } else {
                    ctx.moveTo(w / 2, -d / 2);
                    ctx.lineTo(w / 2, d / 2);
                }
                ctx.stroke();
                ctx.restore();
            }
        }
        ctx.restore();
        return;
    }
    
    if (visualType !== 'column' && isLowLOD) {
        ctx.fillRect(-w/2, -d/2, w, d);
        ctx.strokeRect(-w/2, -d/2, w, d);
        ctx.restore();
        return;
    }
    
    if (visualType === 'column') {
       if (el.shape === 'circle') { 
           if (passMode === 'fill') { 
               ctx.beginPath(); ctx.arc(0, 0, w/2 - 0.75, 0, Math.PI*2); ctx.fill(); 
           } else { 
               ctx.beginPath(); ctx.arc(0, 0, w/2, 0, Math.PI*2); ctx.stroke(); 
           } 
       } 
       else { 
           if (passMode === 'fill') { 
               ctx.fillRect(-w/2 + 0.75, -d/2 + 0.75, w - 1.5, d - 1.5); 
           } else { 
               ctx.strokeRect(-w/2, -d/2, w, d); 
           }
       }
    } else if (visualType === 'furniture') {
        const hasCatalogSymbol = hasInteriorBedSymbol(subType);
        if (hasCatalogSymbol) {
            if (passMode === 'outline') {
                ctx.save();
                ctx.fillStyle = APP_COLORS.background;
                ctx.strokeStyle = isSelected ? APP_COLORS.highlight : (isHovered ? 'rgba(59, 130, 246, 0.85)' : APP_COLORS.furniture);
                drawInteriorBedSymbol(ctx, w, d, subType, editorState.zoom, getStableInteriorSymbolBase(el));
                ctx.restore();
            }
        } else if (subType.includes('bed_twin_pair')) {
            const gap = w * 0.08;
            const bedW = (w - gap) / 2;
            [-1, 1].forEach((side) => {
                const cx = side * (bedW / 2 + gap / 2);
                ctx.strokeRect(cx - bedW / 2, -d / 2, bedW, d);
                ctx.strokeRect(cx - bedW * 0.3, -d / 2 + d * 0.04, bedW * 0.6, d * 0.18);
                ctx.beginPath(); ctx.moveTo(cx - bedW / 2, d * 0.1); ctx.lineTo(cx + bedW / 2, d * 0.1); ctx.stroke();
            });
        } else if (subType.includes('sofa_bed')) {
            ctx.fillRect(-w/2, -d/2, w, d); ctx.strokeRect(-w/2, -d/2, w, d);
            ctx.strokeRect(-w/2, -d/2, w, d * 0.25);
            ctx.setLineDash([detailUnit * 0.08, detailUnit * 0.06]);
            ctx.strokeRect(-w/2 + w * 0.08, d/2, w * 0.84, d * 0.75);
            ctx.setLineDash([]);
        } else if (subType.includes('bed_bunk') || subType.includes('bed_loft')) {
            ctx.fillRect(-w/2, -d/2, w, d); ctx.strokeRect(-w/2, -d/2, w, d);
            const bunkInsetX = w * 0.06;
            const bunkInsetY = d * 0.04;
            ctx.strokeRect(-w/2 + bunkInsetX, -d/2 + bunkInsetY, w - bunkInsetX * 2, d * 0.22);
            ctx.beginPath(); ctx.moveTo(-w/2, 0); ctx.lineTo(w/2, 0); ctx.stroke();
            ctx.beginPath();
            for (let y = -d * 0.25; y < d * 0.35; y += d * 0.12) {
                ctx.moveTo(w/2 - w * 0.08, y); ctx.lineTo(w/2, y + d * 0.035);
            }
            ctx.stroke();
            if (subType.includes('loft')) {
                ctx.strokeRect(-w/2 + w * 0.08, d * 0.2, w * 0.35, d * 0.25);
            }
        } else if (subType.includes('bed_side_tables')) {
            const tableW = Math.min(w * 0.18, 0.45 * editorState.zoom);
            const bedW = w - tableW * 2;
            ctx.strokeRect(-bedW/2, -d/2, bedW, d);
            ctx.strokeRect(-bedW * 0.35, -d/2 + d * 0.04, bedW * 0.28, d * 0.18);
            ctx.strokeRect(bedW * 0.08, -d/2 + d * 0.04, bedW * 0.28, d * 0.18);
            ctx.strokeRect(-w/2, -d/2 + tableW * 0.25, tableW * 0.8, tableW * 0.8);
            ctx.strokeRect(w/2 - tableW * 0.8, -d/2 + tableW * 0.25, tableW * 0.8, tableW * 0.8);
        } else if (subType.includes('hospital_bed')) {
            ctx.fillRect(-w/2, -d/2, w, d); ctx.strokeRect(-w/2, -d/2, w, d);
            const pillowW = w * 0.6; const pillowH = d * 0.15;
            const railW = Math.max(w * 0.025, detailUnit * 0.025);
            ctx.strokeRect(-pillowW/2, -d/2 + d * 0.04, pillowW, pillowH);
            ctx.strokeRect(-w/2, -d*0.15, railW, d*0.45);
            ctx.strokeRect(w/2 - railW, -d*0.15, railW, d*0.45);
            ctx.beginPath(); ctx.arc(-w*0.35, -d*0.45, detailUnit * 0.04, 0, Math.PI*2); ctx.stroke();
        } else if (subType.includes('bed') && !subType.includes('bedside')) {
            ctx.fillRect(-w/2, -d/2, w, d); ctx.strokeRect(-w/2, -d/2, w, d);
            const pillowW = Math.min(w * 0.4, 0.6 * editorState.zoom); 
            const pillowH = Math.min(d * 0.25, 0.4 * editorState.zoom);
            const isSingle = subType.includes('single');
            if (isSingle) { ctx.strokeRect(-pillowW/2, -d/2 + d * 0.04, pillowW, pillowH); } 
            else { ctx.strokeRect(-w/4 - pillowW/2, -d/2 + d * 0.04, pillowW, pillowH); ctx.strokeRect(w/4 - pillowW/2, -d/2 + d * 0.04, pillowW, pillowH); }
            ctx.beginPath(); ctx.moveTo(-w/2, d * 0.1); ctx.lineTo(w/2, d * 0.1); ctx.stroke();
            if (subType.includes('storage')) {
                ctx.strokeRect(-w * 0.35, d/2 - d * 0.18, w * 0.7, d * 0.14);
                ctx.beginPath(); ctx.moveTo(0, d/2 - d * 0.18); ctx.lineTo(0, d/2 - d * 0.04); ctx.stroke();
            }
        } else if (subType.includes('sofa')) {
            const armW = Math.min(w * 0.15, 0.25 * editorState.zoom);
            const backD = Math.min(d * 0.25, 0.3 * editorState.zoom);
            if (subType.includes('round') || subType.includes('kidney') || subType.includes('curved')) {
                ctx.beginPath();
                ctx.ellipse(0, 0, w * 0.48, d * 0.38, 0, 0.1 * Math.PI, 1.9 * Math.PI);
                ctx.fill(); ctx.stroke();
                ctx.beginPath();
                ctx.ellipse(0, -d * 0.04, w * 0.34, d * 0.2, 0, 0, Math.PI * 2);
                ctx.stroke();
                const seats = inferInteriorSeatCount(el);
                for (let i = 1; i < seats; i++) {
                    const x = -w * 0.35 + (w * 0.7 * i / seats);
                    ctx.beginPath(); ctx.moveTo(x, -d * 0.24); ctx.lineTo(x, d * 0.2); ctx.stroke();
                }
            } else {
                ctx.fillRect(-w/2, -d/2, w, d); ctx.strokeRect(-w/2, -d/2, w, d);
                ctx.strokeRect(-w/2, -d/2, w, backD);
                ctx.strokeRect(-w/2, -d/2, armW, d); ctx.strokeRect(w/2 - armW, -d/2, armW, d);
                
                const seats = inferInteriorSeatCount(el);
                
                const seatAreaW = w - 2*armW;
                const oneSeatW = seatAreaW / seats;
                for(let i=0; i<seats; i++) {
                    ctx.strokeRect(-w/2 + armW + i*oneSeatW, -d/2 + backD, oneSeatW, d - backD);
                }
            }
        } else if (subType.includes('table_cafe') || (el.shape === 'circle' && subType.includes('table')) || subType.includes('table_round')) {
            ctx.beginPath(); ctx.arc(0, 0, Math.min(w, d)/2, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            
            const chairS = Math.min(Math.min(w, d) * 0.45, 0.45 * editorState.zoom);
            const gap = detailGap;
            const drawChair = (cx: number, cy: number, rotC: number) => {
                ctx.save(); ctx.translate(cx, cy); ctx.rotate(rotC);
                ctx.strokeRect(-chairS/2, -chairS/2, chairS, chairS);
                ctx.beginPath(); ctx.arc(0, chairS/2, chairS/2, Math.PI, 0); ctx.stroke();
                ctx.restore();
            };
            drawChair(0, -d/2 - chairS/2 - gap, 0);
            drawChair(0, d/2 + chairS/2 + gap, Math.PI);
        } else if (subType.includes('chair') || subType.includes('stool')) {
            const isStool = subType.includes('stool');
            if (isStool) {
                ctx.beginPath(); ctx.arc(0, 0, Math.min(w, d) * 0.35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(-w*0.25, d*0.25); ctx.lineTo(w*0.25, d*0.25); ctx.stroke();
            } else {
                ctx.fillRect(-w/2, -d/2, w, d); ctx.strokeRect(-w/2, -d/2, w, d);
                ctx.strokeRect(-w * 0.42, -d/2, w * 0.84, d * 0.25);
                ctx.beginPath(); ctx.arc(0, d * 0.12, Math.min(w, d) * 0.25, 0, Math.PI * 2); ctx.stroke();
            }
        } else if (subType.includes('ottoman') || subType.includes('puff')) {
            if (ctx.roundRect) {
                ctx.beginPath(); ctx.roundRect(-w/2, -d/2, w, d, Math.min(w, d) * 0.18); ctx.fill(); ctx.stroke();
            } else {
                ctx.fillRect(-w/2, -d/2, w, d); ctx.strokeRect(-w/2, -d/2, w, d);
            }
            if (subType.includes('tufted')) {
                for (let ix = -1; ix <= 1; ix++) for (let iy = -1; iy <= 1; iy++) {
                    ctx.beginPath(); ctx.arc(ix * w * 0.18, iy * d * 0.18, detailUnit * 0.025, 0, Math.PI * 2); ctx.stroke();
                }
            }
        } else if (subType.includes('conference')) {
            ctx.fillRect(-w/2, -d/2, w, d); ctx.strokeRect(-w/2, -d/2, w, d);
            ctx.beginPath(); ctx.ellipse(0, 0, w*0.4, d*0.2, 0, 0, Math.PI*2); ctx.stroke();
            
            const chairS = Math.min(Math.min(w, d) * 0.15, 0.45 * editorState.zoom);
            const gap = detailGap;
            const drawChair = (cx: number, cy: number, rotC: number) => {
                ctx.save(); ctx.translate(cx, cy); ctx.rotate(rotC);
                ctx.strokeRect(-chairS/2, -chairS/2, chairS, chairS);
                ctx.beginPath(); ctx.arc(0, chairS/2, chairS/2, Math.PI, 0); ctx.stroke();
                ctx.restore();
            };
            const steps = Math.max(3, Math.floor(inferInteriorSeatCount(el) / 2) - 1);
            for (let i = 0; i < steps; i++) {
                const cx = -w/2 + w * ((i + 1) / (steps + 1));
                drawChair(cx, -d/2 - chairS/2 - gap, 0);
                drawChair(cx, d/2 + chairS/2 + gap, Math.PI);
            }
            drawChair(-w/2 - chairS/2 - gap, 0, -Math.PI/2);
            drawChair(w/2 + chairS/2 + gap, 0, Math.PI/2);
        } else if (subType.includes('table') || subType.includes('desk') || subType.includes('conference')) {
            ctx.fillRect(-w/2, -d/2, w, d); ctx.strokeRect(-w/2, -d/2, w, d);
            
            const chairS = Math.min(Math.min(w, d) * 0.35, 0.5 * editorState.zoom); 
            const gap = detailGap;
            const drawChair = (cx: number, cy: number, rotC: number) => {
                ctx.save(); ctx.translate(cx, cy); ctx.rotate(rotC);
                ctx.strokeRect(-chairS/2, -chairS/2, chairS, chairS);
                ctx.beginPath(); ctx.arc(0, chairS/2, chairS/2, Math.PI, 0); ctx.stroke();
                ctx.restore();
            };
            
            const seats = inferInteriorSeatCount(el);
            const sideSeats = Math.max(1, Math.floor((seats - 2) / 2));
            if (seats > 4) {
               for (let i = 0; i < sideSeats; i++) {
                 const cx = -w/2 + w * ((i + 1) / (sideSeats + 1));
                 drawChair(cx, -d/2 - chairS/2 - gap, 0); drawChair(cx, d/2 + chairS/2 + gap, Math.PI);
               }
               if (seats % 2 === 0) {
                 drawChair(-w/2 - chairS/2 - gap, 0, -Math.PI/2); drawChair(w/2 + chairS/2 + gap, 0, Math.PI/2);
               }
            } else {
               drawChair(0, -d/2 - chairS/2 - gap, 0); drawChair(0, d/2 + chairS/2 + gap, Math.PI);
               drawChair(-w/2 - chairS/2 - gap, 0, -Math.PI/2); drawChair(w/2 + chairS/2 + gap, 0, Math.PI/2);
            }
        } else if (subType.includes('wardrobe')) {
            ctx.fillRect(-w/2, -d/2, w, d); ctx.strokeRect(-w/2, -d/2, w, d);
            ctx.beginPath(); ctx.moveTo(-w/2 + w * 0.06, 0); ctx.lineTo(w/2 - w * 0.06, 0); ctx.stroke();
            const handleStep = Math.max(w * 0.18, detailUnit * 0.16);
            for (let xOffset = -w/2 + handleStep; xOffset < w/2 - handleStep * 0.5; xOffset += handleStep) {
                ctx.beginPath(); ctx.moveTo(xOffset - w * 0.03, -d * 0.04); ctx.lineTo(xOffset, d * 0.04); ctx.lineTo(xOffset + w * 0.03, -d * 0.04); ctx.stroke();
            }
        } else if (subType.includes('bedside')) {
            ctx.fillRect(-w/2, -d/2, w, d); ctx.strokeRect(-w/2, -d/2, w, d);
            ctx.strokeRect(-w*0.35, d*0.2, w*0.7, d*0.2);
        } else if (subType.includes('coffee')) {
            ctx.fillRect(-w/2, -d/2, w, d);
            if (ctx.roundRect) {
                ctx.beginPath(); ctx.roundRect(-w/2, -d/2, w, d, Math.min(w, d) * 0.14); ctx.fill(); ctx.stroke();
            } else {
                ctx.strokeRect(-w/2, -d/2, w, d);
            }
            ctx.beginPath(); ctx.arc(0, 0, Math.min(w, d) * 0.2, 0, Math.PI*2); ctx.stroke();
        } else if (subType.includes('tv_console')) {
            ctx.fillRect(-w/2, -d/2, w, d); ctx.strokeRect(-w/2, -d/2, w, d);
            ctx.lineWidth = 2.0;
            ctx.beginPath(); ctx.moveTo(-w * 0.4, 0); ctx.lineTo(w * 0.4, 0); ctx.stroke();
            ctx.lineWidth = 1.0;
        } else if (subType.includes('office_chair')) {
            ctx.beginPath(); ctx.arc(0, 0, w*0.4, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.arc(0, -d*0.3, w*0.3, Math.PI, 0); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-w*0.4, -d*0.1); ctx.lineTo(-w*0.4, d*0.2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w*0.4, -d*0.1); ctx.lineTo(w*0.4, d*0.2); ctx.stroke();
        } else if (subType.includes('reception')) {
            ctx.fillRect(-w/2, -d/2, w, d); ctx.strokeRect(-w/2, -d/2, w, d);
            ctx.lineWidth = 2.0;
            ctx.beginPath(); ctx.moveTo(-w/2 + detailInset, -d/2 + detailInset); ctx.lineTo(w/2 - detailInset, -d/2 + detailInset); ctx.lineTo(w/2 - detailInset, d/2 - detailInset); ctx.stroke();
            ctx.lineWidth = 1.0;
        } else if (subType.includes('filing')) {
            ctx.fillRect(-w/2, -d/2, w, d); ctx.strokeRect(-w/2, -d/2, w, d);
            ctx.beginPath(); ctx.moveTo(-w/2, -d*0.1); ctx.lineTo(w/2, -d*0.1); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-w/2, d*0.3); ctx.lineTo(w/2, d*0.3); ctx.stroke();
            ctx.strokeRect(-w*0.15, -d*0.35, w*0.3, d*0.1);
            ctx.strokeRect(-w*0.15, -d*0.02, w*0.3, d*0.1);
            ctx.strokeRect(-w*0.15, d*0.38, w*0.3, d*0.1);
        } else if (subType.includes('shelf') || subType.includes('cabinet') || subType.includes('buffet') || subType.includes('credenza')) {
            ctx.fillRect(-w/2, -d/2, w, d); ctx.strokeRect(-w/2, -d/2, w, d);
            ctx.beginPath(); ctx.moveTo(-w/2, 0); ctx.lineTo(w/2, 0); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(-w/6, -d/2); ctx.lineTo(-w/6, d/2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(w/6, -d/2); ctx.lineTo(w/6, d/2); ctx.stroke();
        } else if (subType.includes('cashier')) {
            ctx.fillRect(-w/2, -d/2, w, d); ctx.strokeRect(-w/2, -d/2, w, d);
            ctx.strokeRect(-w*0.35, -d*0.35, w*0.3, d*0.45);
            ctx.strokeRect(w*0.15, -d*0.35, w*0.2, d*0.7);
        } else if (subType.includes('whiteboard')) {
            ctx.fillRect(-w/2, -d/2, w, d); ctx.strokeRect(-w/2, -d/2, w, d);
            ctx.strokeRect(-w*0.35, d/2 - d * 0.08, w*0.7, d * 0.08);
        } else {
            ctx.fillRect(-w/2, -d/2, w, d); ctx.strokeRect(-w/2, -d/2, w, d);
            ctx.beginPath(); ctx.moveTo(-w/2, -d/2); ctx.lineTo(w/2, d/2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(w/2, -d/2); ctx.lineTo(-w/2, d/2); ctx.stroke();
        }
    } else if (visualType === 'fixture') {
        const hasCatalogSymbol = hasInteriorBedSymbol(subType);
        if (hasCatalogSymbol) {
            if (passMode === 'outline') {
                ctx.save();
                ctx.fillStyle = APP_COLORS.background;
                ctx.strokeStyle = isSelected ? APP_COLORS.highlight : (isHovered ? 'rgba(59, 130, 246, 0.85)' : APP_COLORS.furniture);
                drawInteriorBedSymbol(ctx, w, d, subType, editorState.zoom, getStableInteriorSymbolBase(el));
                ctx.restore();
            }
        } else if (subType.includes('wc')) {
             const tankD = d * 0.25; ctx.strokeRect(-w/2, -d/2, w, tankD);
             ctx.beginPath(); ctx.ellipse(0, 0, w*0.35, d*0.35, 0, 0, Math.PI*2); ctx.stroke();
        } else if (subType.includes('basin') || subType.includes('vanity')) {
             ctx.strokeRect(-w/2, -d/2, w, d);
             ctx.beginPath(); ctx.ellipse(0, 0, w*0.4, d*0.35, 0, 0, Math.PI*2); ctx.stroke();
             // Tap
             ctx.beginPath(); ctx.moveTo(0, -d/2); ctx.lineTo(0, -d/4); ctx.stroke();
             ctx.beginPath(); ctx.moveTo(-w*0.05, -d/4); ctx.lineTo(w*0.05, -d/4); ctx.stroke();
             if (subType.includes('corner')) { ctx.beginPath(); ctx.moveTo(-w/2, d/2); ctx.lineTo(w/2, -d/2); ctx.stroke(); }
        } else if (subType.includes('bath')) {
             ctx.strokeRect(-w/2, -d/2, w, d);
             const inset = Math.min(w, d) * 0.08;
             if (ctx.roundRect) {
                ctx.beginPath(); ctx.roundRect(-w/2+inset, -d/2+inset, Math.max(1, w-inset*2), Math.max(1, d-inset*2), Math.min(w, d) * 0.16); ctx.stroke();
             } else {
                ctx.strokeRect(-w/2+inset, -d/2+inset, Math.max(1, w-inset*2), Math.max(1, d-inset*2));
             }
             ctx.beginPath(); ctx.arc(-w/2 + w*0.15, 0, Math.min(w, d) * 0.055, 0, Math.PI*2); ctx.stroke();
        } else if (subType.includes('shower')) {
             ctx.strokeRect(-w/2, -d/2, w, d);
             ctx.beginPath(); ctx.moveTo(-w/2, -d/2); ctx.lineTo(w/2, d/2); ctx.stroke();
             ctx.beginPath(); ctx.moveTo(w/2, -d/2); ctx.lineTo(-w/2, d/2); ctx.stroke();
        } else if (subType.includes('sink')) {
             ctx.strokeRect(-w/2, -d/2, w, d);
             const bowlCount = subType.includes('double') ? 2 : 1;
             for (let i = 0; i < bowlCount; i++) {
               const cx = bowlCount === 1 ? 0 : (i === 0 ? -w * 0.22 : w * 0.22);
               ctx.strokeRect(cx - w * 0.18, -d*0.35, w*0.35, d*0.7);
             }
             ctx.beginPath(); ctx.arc(0, -d*0.4, Math.min(w, d) * 0.04, 0, Math.PI*2); ctx.stroke();
             ctx.beginPath(); ctx.moveTo(0, -d*0.4); ctx.lineTo(0, -d*0.15); ctx.stroke();
        } else if (subType.includes('stove') || subType.includes('hob')) {
             ctx.strokeRect(-w/2, -d/2, w, d);
             const br = Math.min(w, d) * 0.15;
             ctx.beginPath(); ctx.arc(-w*0.22, -d*0.22, br, 0, Math.PI*2); ctx.stroke();
             ctx.beginPath(); ctx.arc(w*0.22, -d*0.22, br, 0, Math.PI*2); ctx.stroke();
             ctx.beginPath(); ctx.arc(-w*0.22, d*0.22, br, 0, Math.PI*2); ctx.stroke();
             ctx.beginPath(); ctx.arc(w*0.22, d*0.22, br, 0, Math.PI*2); ctx.stroke();
             ctx.strokeRect(-w*0.4, -d*0.45, w*0.8, d*0.1);
        } else if (subType.includes('fridge')) {
             ctx.strokeRect(-w/2, -d/2, w, d);
             const fridgeInset = Math.min(w, d) * 0.05;
             ctx.strokeRect(-w/2 + fridgeInset, -d/2 + fridgeInset, w - fridgeInset * 2, d - fridgeInset * 2);
             ctx.strokeRect(-w * 0.08, d/2 - d * 0.12, w * 0.05, d * 0.08);
             ctx.strokeRect(w * 0.03, d/2 - d * 0.12, w * 0.05, d * 0.08);
        } else if (subType.includes('washer')) {
             ctx.strokeRect(-w/2, -d/2, w, d);
             ctx.beginPath(); ctx.arc(0, 0, Math.min(w, d)*0.3, 0, Math.PI*2); ctx.stroke();
             ctx.beginPath(); ctx.moveTo(-w/2, -d*0.3); ctx.lineTo(w/2, -d*0.3); ctx.stroke();
        } else {
             ctx.strokeRect(-w/2, -d/2, w, d);
        }
    } else if (visualType === 'counter') {
        const isIsland = (el.subType || '').includes('island');
        const isL = el.shape === 'L' || subType.includes('_l_') || subType.includes('counter_l');
        const isCurved = subType.includes('curved') || subType.includes('round');
        ctx.fillStyle = isGhost ? 'rgba(241, 245, 249, 0.5)' : APP_COLORS.background;
        const hasCatalogSymbol = hasInteriorBedSymbol(subType);
        if (hasCatalogSymbol) {
            if (passMode === 'outline') {
                ctx.save();
                ctx.fillStyle = APP_COLORS.background;
                ctx.strokeStyle = isSelected ? APP_COLORS.highlight : (isHovered ? 'rgba(59, 130, 246, 0.85)' : APP_COLORS.furniture);
                drawInteriorBedSymbol(ctx, w, d, subType, editorState.zoom, getStableInteriorSymbolBase(el));
                ctx.restore();
            }
        } else if (isCurved) {
            ctx.beginPath(); ctx.ellipse(0, 0, w * 0.48, d * 0.38, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.ellipse(0, 0, w * 0.35, d * 0.2, 0, 0, Math.PI * 2); ctx.stroke();
        } else if (isL) {
            const leg = Math.min(w, d) * 0.35;
            ctx.beginPath(); ctx.moveTo(-w/2, -d/2); ctx.lineTo(w/2, -d/2); ctx.lineTo(w/2, -d/2 + leg); ctx.lineTo(-w/2 + leg, -d/2 + leg); ctx.lineTo(-w/2 + leg, d/2); ctx.lineTo(-w/2, d/2); ctx.closePath(); ctx.fill(); ctx.stroke();
        } else {
            ctx.fillRect(-w/2, -d/2, w, d); ctx.strokeRect(-w/2, -d/2, w, d);
            if (subType.includes('display')) {
                const displayInset = Math.min(w, d) * 0.08;
                ctx.setLineDash([detailUnit * 0.08, detailUnit * 0.06]); ctx.strokeRect(-w/2 + displayInset, -d/2 + displayInset, w - displayInset * 2, d - displayInset * 2); ctx.setLineDash([]);
            }
        }
        if (!isIsland && !isCurved) { ctx.beginPath(); ctx.moveTo(-w/2, -d/2 + d * 0.08); ctx.lineTo(w/2, -d/2 + d * 0.08); ctx.stroke(); }
    }

    const placementSnapEdge = (el as ArchElement & { placementSnapEdge?: InteriorSnapEdge }).placementSnapEdge;
    if (isGhost && placementSnapEdge) {
        ctx.save();
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        if (placementSnapEdge === 'back') {
            ctx.moveTo(-w / 2, -d / 2);
            ctx.lineTo(w / 2, -d / 2);
        } else if (placementSnapEdge === 'left') {
            ctx.moveTo(-w / 2, -d / 2);
            ctx.lineTo(-w / 2, d / 2);
        } else {
            ctx.moveTo(w / 2, -d / 2);
            ctx.lineTo(w / 2, d / 2);
        }
        ctx.stroke();
        ctx.restore();
    }

    // Removed textual names of furniture, fixtures, and counters to keep the plan clean
    ctx.restore();
  };

  const drawStair = (ctx: CanvasRenderingContext2D, el: ArchElement, isSelected: boolean) => {
    if (!el.p1 || !el.p2) return;
    const width = (el.width || 1.0) * editorState.zoom;
    const treadDepthWorld = 0.3;
    const treadDepthPx = treadDepthWorld * editorState.zoom;
    const subType = el.subType || 'linear';

    const isDragMover = !!(isDraggingSelected || isMiddlePanning || isMiddleRotating || isRotating);
    const isLowLOD = (editorState.zoom < 3.0) || isDragMover;
    
    if (isLowLOD) {
      const s1 = worldToScreen(el.p1);
      const s2 = worldToScreen(el.p2);
      const dx = s2.x - s1.x; const dy = s2.y - s1.y;
      const len = Math.sqrt(dx*dx + dy*dy);
      if (len < 1) return;
      
      const ux = dx/len; const uy = dy/len;
      const nx = -uy; const ny = ux;
      
      const c1 = { x: s1.x + nx * width/2, y: s1.y + ny * width/2 };
      const c2 = { x: s1.x - nx * width/2, y: s1.y - ny * width/2 };
      const c3 = { x: s2.x - nx * width/2, y: s2.y - ny * width/2 };
      const c4 = { x: s2.x + nx * width/2, y: s2.y + ny * width/2 };
      
      ctx.save();
      ctx.strokeStyle = isSelected ? APP_COLORS.highlight : '#334155';
      ctx.lineWidth = 1.0;
      ctx.fillStyle = isSelected ? 'rgba(59,130,246,0.05)' : APP_COLORS.background;
      ctx.beginPath(); 
      ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y); ctx.lineTo(c4.x, c4.y); 
      ctx.closePath(); 
      ctx.fill(); 
      ctx.stroke();
      
      ctx.beginPath();
      ctx.moveTo(s1.x, s1.y);
      ctx.lineTo(s2.x, s2.y);
      ctx.stroke();
      
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.strokeStyle = isSelected ? APP_COLORS.highlight : '#334155';
    ctx.lineWidth = 1;
    ctx.fillStyle = APP_COLORS.background;
    ctx.globalAlpha = 0.8;
    // ... fill the rest of the run if needed, but the treads fill is handled in drawRun
    ctx.globalAlpha = 1.0;

    const drawRun = (pStart: Point, pEnd: Point, trimEndWorld: number = 0, trimStartWorld: number = 0) => {
        const s1 = worldToScreen(pStart);
        const s2 = worldToScreen(pEnd);
        const dx = s2.x - s1.x; const dy = s2.y - s1.y;
        const len = Math.sqrt(dx*dx + dy*dy);
        if (len < 1) return;
        
        const ux = dx/len; const uy = dy/len;
        const nx = -uy; const ny = ux;

        const trimStart = trimStartWorld * editorState.zoom;
        const trimEnd = trimEndWorld * editorState.zoom;

        const rStart = { x: s1.x + ux * trimStart, y: s1.y + uy * trimStart };
        const rEnd = { x: s2.x - ux * trimEnd, y: s2.y - uy * trimEnd };
        
        const rLen = len - trimStart - trimEnd;
        if (rLen <= 0) return;

        const c1 = { x: rStart.x + nx * width/2, y: rStart.y + ny * width/2 };
        const c2 = { x: rStart.x - nx * width/2, y: rStart.y - ny * width/2 };
        const c3 = { x: rEnd.x - nx * width/2, y: rEnd.y - ny * width/2 };
        const c4 = { x: rEnd.x + nx * width/2, y: rEnd.y + ny * width/2 };

        // Outline
        ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y); ctx.lineTo(c4.x, c4.y); ctx.closePath(); ctx.fill(); ctx.stroke();

        // Treads
        const numSteps = Math.max(1, Math.round(el.metadata?.stepCount || Math.floor(rLen / treadDepthPx)));
        ctx.beginPath();
        for (let i = 1; i <= numSteps; i++) {
            const dist = el.metadata?.stepCount ? i * rLen / numSteps : i * treadDepthPx;
            if (dist > rLen) break;
            const cx = rStart.x + ux * dist; 
            const cy = rStart.y + uy * dist;
            ctx.moveTo(cx + nx * width/2, cy + ny * width/2); ctx.lineTo(cx - nx * width/2, cy - ny * width/2);
        }
        ctx.stroke();

        // Arrow
        const arrowStart = { x: rStart.x + ux * 10, y: rStart.y + uy * 10 };
        const arrowEnd = { x: rEnd.x - ux * 10, y: rEnd.y - uy * 10 };
        if (Math.hypot(arrowEnd.x - arrowStart.x, arrowEnd.y - arrowStart.y) > 20) {
            ctx.save(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.beginPath();
            ctx.moveTo(arrowStart.x, arrowStart.y); ctx.lineTo(arrowEnd.x, arrowEnd.y);
            const headSize = 6;
            ctx.moveTo(arrowEnd.x, arrowEnd.y); ctx.lineTo(arrowEnd.x - ux * headSize + nx * headSize/2, arrowEnd.y - uy * headSize + ny * headSize/2);
            ctx.moveTo(arrowEnd.x, arrowEnd.y); ctx.lineTo(arrowEnd.x - ux * headSize - nx * headSize/2, arrowEnd.y - uy * headSize - ny * headSize/2);
            ctx.stroke(); ctx.restore();
        }

        // Railings
        const railOffset = 0.05 * editorState.zoom;
        ctx.save();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        // Left Rail
        ctx.moveTo(rStart.x + nx * (width/2 - railOffset), rStart.y + ny * (width/2 - railOffset));
        ctx.lineTo(rEnd.x + nx * (width/2 - railOffset), rEnd.y + ny * (width/2 - railOffset));
        // Right Rail
        ctx.moveTo(rStart.x - nx * (width/2 - railOffset), rStart.y - ny * (width/2 - railOffset));
        ctx.lineTo(rEnd.x - nx * (width/2 - railOffset), rEnd.y - ny * (width/2 - railOffset));
        ctx.stroke();
        ctx.restore();
    };

    // Draw arbitrary polygon for landing
    const drawPolygon = (pts: Point[], skippedEdges: number[] = []) => {
       if (pts.length < 3) return;
       ctx.save();
       ctx.fillStyle = 'rgba(200, 200, 200, 0.1)';
       ctx.strokeStyle = isSelected ? APP_COLORS.highlight : '#334155';
       ctx.beginPath();
       const s0 = worldToScreen(pts[0]);
       ctx.moveTo(s0.x, s0.y);
       for (let i = 1; i < pts.length; i++) {
           const s = worldToScreen(pts[i]);
           ctx.lineTo(s.x, s.y);
       }
       ctx.closePath();
       ctx.fill(); ctx.stroke();
       
       // Inner X mark for landing
       ctx.strokeStyle = 'rgba(0,0,0,0.1)';
       ctx.beginPath();
       ctx.moveTo(s0.x, s0.y);
       if (pts.length === 4) {
           const s2 = worldToScreen(pts[2]); ctx.lineTo(s2.x, s2.y);
           const s1 = worldToScreen(pts[1]); const s3 = worldToScreen(pts[3]);
           ctx.moveTo(s1.x, s1.y); ctx.lineTo(s3.x, s3.y);
       }
       ctx.stroke();

       // Railings on landing
       ctx.strokeStyle = '#475569';
       ctx.lineWidth = 1.5;
       for (let i = 0; i < pts.length; i++) {
           if (skippedEdges.includes(i)) continue;
           const p1 = pts[i];
           const p2 = pts[(i+1) % pts.length];
           const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
           if (d > wWorld * 0.4) {
               const s1 = worldToScreen(p1);
               const s2 = worldToScreen(p2);
               ctx.beginPath();
               ctx.moveTo(s1.x, s1.y);
               ctx.lineTo(s2.x, s2.y);
               ctx.stroke();
           }
       }

       ctx.restore();
    };

    const wWorld = el.width || 1.0;

    if (subType === 'linear' || subType === 'spiral') {
        drawRun(el.p1, el.p2);
    } else if (subType === 'L' && el.p3) {
        // Run 1 -> Turn -> Run 2
        // Use miter logic for arbitrary angles
        const turn = getTurnInfo(el.p1, el.p2, el.p3, wWorld);
        
        drawRun(el.p1, el.p2, turn.trim, 0); // Trim end of run 1
        drawRun(el.p2, el.p3, 0, turn.trim); // Trim start of run 2
        drawPolygon(turn.poly, [0, 1]); // The turn wedge
    } else if (subType === 'U' && el.p3 && el.p4) {
        // Run 1 -> Turn P2 -> Bridge P2-P3 -> Turn P3 -> Run 2
        const turn1 = getTurnInfo(el.p1, el.p2, el.p3, wWorld);
        const turn2 = getTurnInfo(el.p2, el.p3, el.p4, wWorld);

        drawRun(el.p1, el.p2, turn1.trim, 0);
        
        // The bridge segment between P2 and P3
        // It starts at P2 displaced by turn1 trim, ends at P3 displaced by turn2 trim
        const dir = { x: el.p3.x - el.p2.x, y: el.p3.y - el.p2.y };
        const len = Math.hypot(dir.x, dir.y);
        const bridgeLen = len - turn1.trim - turn2.trim;
        
        if (bridgeLen > 0.01) {
            // Calculate Bridge Rect corners manually to ensure correct width
            const ux = dir.x / len, uy = dir.y / len;
            const nx = -uy, ny = ux;
            
            // Start point of bridge (after turn 1)
            const startX = el.p2.x + ux * turn1.trim;
            const startY = el.p2.y + uy * turn1.trim;
            // End point of bridge (before turn 2)
            const endX = el.p3.x - ux * turn2.trim;
            const endY = el.p3.y - uy * turn2.trim;
            
            const hw = wWorld / 2;
            // Vertices
            const p1 = { x: startX + nx * hw, y: startY + ny * hw };
            const p2 = { x: endX + nx * hw, y: endY + ny * hw };
            const p3 = { x: endX - nx * hw, y: endY - ny * hw };
            const p4 = { x: startX - nx * hw, y: startY - ny * hw };
            
            drawPolygon([p1, p2, p3, p4], [1, 3]);
        }

        drawRun(el.p3, el.p4, 0, turn2.trim);
        drawPolygon(turn1.poly, [0, 1]);
        drawPolygon(turn2.poly, [0, 1]);
    } else {
        // Fallback
        drawRun(el.p1, el.p2);
        if(el.p3) drawRun(el.p2, el.p3);
    }

    ctx.restore();
    
    // Draw Diamond Handles
    if (isSelected) {
        const drawDiamond = (p: Point) => {
             const s = worldToScreen(p);
             ctx.fillStyle = APP_COLORS.highlight; ctx.beginPath();
             ctx.moveTo(s.x, s.y - 5); ctx.lineTo(s.x + 5, s.y); ctx.lineTo(s.x, s.y + 5); ctx.lineTo(s.x - 5, s.y); ctx.closePath(); ctx.fill();
        }
        drawDiamond(el.p1);
        drawDiamond(el.p2);
        if (el.p3) drawDiamond(el.p3);
        if (el.p4) drawDiamond(el.p4);
        
        if (el.p1 && el.p2) {
            const s1 = worldToScreen(el.p1);
            const s2 = worldToScreen(el.p2);
            const dx = s2.x - s1.x; const dy = s2.y - s1.y;
            const len = Math.sqrt(dx*dx + dy*dy);
            if (len > 0) {
                const nx = -dy/len; const ny = dx/len;
                const mid = { x: (s1.x + s2.x)/2, y: (s1.y + s2.y)/2 };
                const w1 = { x: mid.x + nx * width/2, y: mid.y + ny * width/2 };
                ctx.fillStyle = APP_COLORS.highlight; ctx.beginPath(); ctx.moveTo(w1.x, w1.y - 5); ctx.lineTo(w1.x + 5, w1.y); ctx.lineTo(w1.x, w1.y + 5); ctx.lineTo(w1.x - 5, w1.y); ctx.fill();
                const w2 = { x: mid.x - nx * width/2, y: mid.y - ny * width/2 };
                ctx.fillStyle = APP_COLORS.highlight; ctx.beginPath(); ctx.moveTo(w2.x, w2.y - 5); ctx.lineTo(w2.x + 5, w2.y); ctx.lineTo(w2.x, w2.y + 5); ctx.lineTo(w2.x - 5, w2.y); ctx.fill();
            }
        }
    }
  };

  const drawRailing = (ctx: CanvasRenderingContext2D, el: ArchElement, isSelected: boolean) => {
    if (!el.p1 || !el.p2) return;
    const s1 = worldToScreen(el.p1);
    const s2 = worldToScreen(el.p2);

    ctx.save();
    ctx.strokeStyle = isSelected ? APP_COLORS.highlight : APP_COLORS.railing;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s1.x, s1.y);
    ctx.lineTo(s2.x, s2.y);
    ctx.stroke();

    const dist = Math.hypot(el.p2.x - el.p1.x, el.p2.y - el.p1.y);
    const isDragMover = !!(isDraggingSelected || isMiddlePanning || isMiddleRotating || isRotating);
    const isLowLOD = (editorState.zoom < 3.0) || isDragMover;
    const count = isLowLOD ? 1 : Math.max(2, Math.ceil(dist / 1.0)); 
    const postSize = 4;
    ctx.fillStyle = isSelected ? APP_COLORS.highlight : APP_COLORS.railing;

    for (let i = 0; i <= count; i++) {
        const t = i / count;
        const wx = el.p1.x + (el.p2.x - el.p1.x) * t;
        const wy = el.p1.y + (el.p2.y - el.p1.y) * t;
        const s = worldToScreen({ x: wx, y: wy });
        ctx.fillRect(s.x - postSize / 2, s.y - postSize / 2, postSize, postSize);
    }
    
    if (isSelected) {
        ctx.fillStyle = APP_COLORS.highlight;
        [s1, s2].forEach(p => ctx.fillRect(p.x - 4, p.y - 4, 8, 8));
    }

    ctx.restore();
  };

  const drawOpeningGhost = useCallback((ctx: CanvasRenderingContext2D, el: ArchElement) => {
    if (!el.pos) return;
    const p = worldToScreen(el.pos);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(((el.rotation || 0) + (editorState.canvasAngle || 0)) * (Math.PI / 180));
    
    const width = (el.width || 1) * editorState.zoom;
    const near = findNearestWall(el.pos);
    const wallThickness = near?.wall.thickness || WALL_THICKNESS_DEFAULT;
    const tS = wallThickness * editorState.zoom;

    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = APP_COLORS.primary;
    
    // Clear the background underneath
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-width/2, -tS/2, width, tS);

    if (el.type === 'window') {
        const subType = el.subType || '';
        if (['bay', 'angled-bay', 'box-bay', 'curved-bay'].includes(subType)) {
            const rawWidth = el.width || 1;
            const D = Math.min(0.8, rawWidth * 0.8) * editorState.zoom;
            const facingSign = el.facingFlipped ? -1 : 1;
            const yExt = facingSign * D;
            const edgeY = facingSign * (tS/2);
            ctx.beginPath();
            ctx.moveTo(-width/2, edgeY);
            if (subType === 'box-bay') {
                ctx.lineTo(-width/2, yExt);
                ctx.lineTo(width/2, yExt);
            } else if (subType === 'curved-bay') {
                ctx.quadraticCurveTo(0, yExt * 1.5, width/2, edgeY);
            } else {
                const sq = Math.min(D, width * 0.25);
                ctx.lineTo(-width/2 + sq, yExt);
                ctx.lineTo(width/2 - sq, yExt);
            }
            ctx.lineTo(width/2, edgeY);
            ctx.stroke();
        }
        drawWindowSymbol(ctx, width, tS, APP_COLORS.primary, editorState.zoom);

    } else if (el.type === 'door') {
        drawDoorSymbol(ctx, width, tS, el.subType, !!el.isFlipped, !!el.facingFlipped, APP_COLORS.primary, true, editorState.zoom);
    } else if (el.type === 'wall-opening') {
        drawWallOpeningSymbol(ctx, width, tS, APP_COLORS.primary, editorState.zoom);
    }
    
    ctx.restore();
  }, [worldToScreen, editorState.zoom]);

  const render = useCallback((target?: RenderTarget) => {
    const OPENING_COLOR = '#2f2f2f';
    const canvas = target?.canvas || canvasRef.current;
    const ctx = target?.context || (canvasRef.current ? canvasRef.current.getContext('2d') : null);
    if (!canvas || !ctx) return;
    const isExport = !!target?.isExport;
    const selectedIds = isExport ? [] : editorState.selectedIds;
    const renderedHoveredIds = isExport ? new Set<string>() : hoveredIds;
    const renderedHoveredElementId = isExport ? null : hoveredElementId;
    
    // Categorize elements into layers for sorted drawing
    let rawElementsList = dragPreviewElements || project.elements;
    if (placingImportedElements && placingImportedElements.length > 0) {
      const center = getElementsCenter(placingImportedElements);
      const delta = { x: lastMousePos.x - center.x, y: lastMousePos.y - center.y };
      const translatedDrafts = translateElements(placingImportedElements, delta).map(e => ({
        ...e,
        isPlacingDraft: true
      }));
      rawElementsList = [...rawElementsList, ...translatedDrafts];
    }

    const getLayerStatus = (layerName?: string): { visible: boolean; locked: boolean } => {
      if (!project.layers) return { visible: true, locked: false };
      const layer = project.layers.find(l => l.name === layerName);
      if (!layer) return { visible: true, locked: false };
      return { visible: layer.visible, locked: layer.locked };
    };

    let exportGroupAnchors = new Map<string, Point>();

    const setExportLayer = (element: ArchElement): void => {
      const layerAwareContext = ctx as CanvasRenderingContext2D & {
        setDxfLayer?: (name?: string) => void;
        setDxfElement?: (capture: { id: string; groupId?: string; groupBaseX?: number; groupBaseY?: number; name: string; familyKey: string; createBlock: boolean; baseX: number; baseY: number; rotation: number }) => void;
      };
      layerAwareContext.setDxfLayer?.(element.layer || '0');
      const boundaryAnchor = element.boundary && element.boundary.length > 0
        ? element.boundary.reduce((center, point) => ({
            x: center.x + point.x / element.boundary!.length,
            y: center.y + point.y / element.boundary!.length,
          }), { x: 0, y: 0 })
        : undefined;
      const anchor = element.pos || element.p1 || boundaryAnchor || { x: 0, y: 0 };
      const screenAnchor = worldToScreen(anchor);
      const hostThickness = element.hostWallId
        ? rawElementsList.find(candidate => candidate.id === element.hostWallId)?.thickness || 0
        : 0;
      const blockIdentity = getDxfBlockIdentity(element, hostThickness);
      layerAwareContext.setDxfElement?.({
        id: element.id,
        groupId: element.groupId,
        groupBaseX: element.groupId ? exportGroupAnchors.get(element.groupId)?.x : undefined,
        groupBaseY: element.groupId ? exportGroupAnchors.get(element.groupId)?.y : undefined,
        name: blockIdentity.name,
        familyKey: blockIdentity.familyKey,
        createBlock: !!element.groupId || DXF_BLOCK_ELEMENT_TYPES.has(element.type),
        baseX: screenAnchor.x,
        baseY: screenAnchor.y,
        rotation: blockIdentity.rotation,
      });
    };

    if (!isExport) {
      ctx.fillStyle = APP_COLORS.background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    if (!isExport && rasterUnderlay && rasterUnderlayImageRef.current) {
      const image = rasterUnderlayImageRef.current;
      const pixelBounds = rasterUnderlay.pixelReferenceBounds;
      const worldBounds = rasterUnderlay.worldReferenceBounds;
      const pixelWidth = pixelBounds.maxX - pixelBounds.minX;
      const pixelHeight = pixelBounds.maxY - pixelBounds.minY;
      const worldWidth = worldBounds.maxX - worldBounds.minX;
      const worldHeight = worldBounds.maxY - worldBounds.minY;
      if (pixelWidth > 0 && pixelHeight > 0 && worldWidth > 0 && worldHeight > 0 && image.naturalWidth > 0 && image.naturalHeight > 0) {
        const scaleX = worldWidth / pixelWidth;
        const scaleY = worldHeight / pixelHeight;
        const imageWorldLeft = worldBounds.minX - pixelBounds.minX * scaleX;
        const imageWorldTop = worldBounds.minY - pixelBounds.minY * scaleY;
        const imageWorldRight = imageWorldLeft + image.naturalWidth * scaleX;
        const imageWorldBottom = imageWorldTop + image.naturalHeight * scaleY;
        const topLeft = worldToScreen({ x: imageWorldLeft, y: imageWorldTop });
        const topRight = worldToScreen({ x: imageWorldRight, y: imageWorldTop });
        const bottomLeft = worldToScreen({ x: imageWorldLeft, y: imageWorldBottom });

        ctx.save();
        ctx.globalAlpha = rasterUnderlay.opacity ?? 0.18;
        ctx.transform(
          (topRight.x - topLeft.x) / image.naturalWidth,
          (topRight.y - topLeft.y) / image.naturalWidth,
          (bottomLeft.x - topLeft.x) / image.naturalHeight,
          (bottomLeft.y - topLeft.y) / image.naturalHeight,
          topLeft.x,
          topLeft.y,
        );
        ctx.drawImage(image, 0, 0);
        ctx.restore();
      }
    }
    
    // Fast viewport bounds calculation in world coordinates (Conservative AABB for frustum culling)
    const c1 = screenToWorld({ x: 0, y: 0 });
    const c2 = screenToWorld({ x: canvas.width, y: 0 });
    const c3 = screenToWorld({ x: canvas.width, y: canvas.height });
    const c4 = screenToWorld({ x: 0, y: canvas.height });
    const vMinX = Math.min(c1.x, c2.x, c3.x, c4.x);
    const vMaxX = Math.max(c1.x, c2.x, c3.x, c4.x);
    const vMinY = Math.min(c1.y, c2.y, c3.y, c4.y);
    const vMaxY = Math.max(c1.y, c2.y, c3.y, c4.y);

    const isDragMover = !!(isDraggingSelected || isMiddlePanning || isMiddleRotating || isRotating);
    const isLowLOD = !isExport && ((editorState.zoom < 3.0) || isDragMover);
    
    const rawElements: ArchElement[] = [];
    rawElementsList.forEach(e => {
      if (e.type === 'cad-underlay') {
        if (e.cadElements && !e.converted2d) {
          e.cadElements.forEach(child => {
            rawElements.push({
              ...child,
              isCadUnderlay: true,
              parentUnderlayId: e.id,
              levelId: child.levelId || e.levelId,
              layer: child.layer || e.layer || '0'
            });
          });
        }
        rawElements.push(e);
      } else {
        rawElements.push(e);
      }
    });
    
    const activeLevel = project.levels.find(l => l.id === activeLevelId);
    const activeOrder = activeLevel?.order ?? 0;
    const levelAboveId = project.levels.find(l => l.order === activeOrder + 1)?.id;
    const levelBelowId = project.levels.find(l => l.order === activeOrder - 1)?.id;

    // 1. Level Filtering Optimization: Render current floor elements or global elements (like zones, gridlines, building-mass).
    const activeLevelElements = rawElements.filter(e => {
      const isGlobalType = ['gridline', 'zone', 'urban-block', 'parcel', 'road', 'landscape', 'water-body', 'building-mass', 'elevation-marker'].includes(e.type);
      if (isGlobalType || !e.levelId || e.levelId === activeLevelId) return true;
      
      const isStair = e.type === 'stair';
      const isStructural = ['wall', 'door', 'window', 'wall-opening', 'floor', 'ceiling', 'column'].includes(e.type);
      
      if (isStair) {
          if (e.levelId === levelAboveId || e.levelId === levelBelowId) return true;
      }
      
      if (isStructural) {
          if (editorState.showLevelAbove && e.levelId === levelAboveId) return true;
          if (editorState.showLevelBelow && e.levelId === levelBelowId) return true;
      }

      return false;
    });

    // 2. Viewport / Frustum Culling: Exclude any element completely outside the screen bounds
    const elementsToUse = activeLevelElements.filter(el => {
      // Skip rendering if layer is hidden (unless selected or gridline)
      if (el.layer && el.type !== 'gridline' && !selectedIds.includes(el.id)) {
        if (!getLayerStatus(el.layer).visible) return false;
      }

      if (isExport) return true;

      // Always render selected, hovered, or gridline elements
      if (selectedIds.includes(el.id) || el.id === renderedHoveredElementId || el.type === 'gridline') {
        return true;
      }

      const source = getCurveSource(el);
      if (source === 'arc' || source === 'circle' || source === 'ellipse') {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i <= 96; i += 1) {
          const point = getCurvePoint(el, i / 96);
          if (!point) continue;
          minX = Math.min(minX, point.x);
          maxX = Math.max(maxX, point.x);
          minY = Math.min(minY, point.y);
          maxY = Math.max(maxY, point.y);
        }
        if (Number.isFinite(minX)) {
          const margin = (el.thickness ? el.thickness * 2 : 2.0) + 2.0;
          return !(maxX < vMinX - margin || minX > vMaxX + margin || maxY < vMinY - margin || minY > vMaxY + margin);
        }
      }
      
      // Bounding check for segments (walls, lines, arcs, dimensions, etc.)
      if (el.p1 && el.p2) {
        const minX = Math.min(el.p1.x, el.p2.x);
        const maxX = Math.max(el.p1.x, el.p2.x);
        const minY = Math.min(el.p1.y, el.p2.y);
        const maxY = Math.max(el.p1.y, el.p2.y);
        const margin = (el.thickness ? el.thickness * 2 : 2.0) + 2.0;
        return !(maxX < vMinX - margin || minX > vMaxX + margin || maxY < vMinY - margin || minY > vMaxY + margin);
      }
      
      // Bounding check for positions (furniture, openings, assets, labels, rooms)
      if (el.pos) {
        const margin = Math.max(el.width || 3.0, el.depth || 3.0) * 1.5 + 2.0;
        return el.pos.x >= vMinX - margin && el.pos.x <= vMaxX + margin &&
               el.pos.y >= vMinY - margin && el.pos.y <= vMaxY + margin;
      }
      
      // Bounding check for boundaries (floors, zones)
      if (el.boundary && el.boundary.length > 0) {
        let bMinX = Infinity, bMaxX = -Infinity, bMinY = Infinity, bMaxY = -Infinity;
        for (let i = 0; i < el.boundary.length; i++) {
          const pt = el.boundary[i];
          if (pt.x < bMinX) bMinX = pt.x;
          if (pt.x > bMaxX) bMaxX = pt.x;
          if (pt.y < bMinY) bMinY = pt.y;
          if (pt.y > bMaxY) bMaxY = pt.y;
        }
        return !(bMaxX < vMinX - 2.0 || bMinX > vMaxX + 2.0 || bMaxY < vMinY - 2.0 || bMinY > vMaxY + 2.0);
      }
      
      return true;
    });

    if (isExport) {
      const groupBounds = new Map<string, { minX: number; minY: number; maxX: number; maxY: number }>();
      const includeGroupPoint = (groupId: string | undefined, point: Point | undefined) => {
        if (!groupId || !point) return;
        const bounds = groupBounds.get(groupId) || { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
        bounds.minX = Math.min(bounds.minX, point.x);
        bounds.minY = Math.min(bounds.minY, point.y);
        bounds.maxX = Math.max(bounds.maxX, point.x);
        bounds.maxY = Math.max(bounds.maxY, point.y);
        groupBounds.set(groupId, bounds);
      };

      elementsToUse.forEach(el => {
        includeGroupPoint(el.groupId, el.pos);
        includeGroupPoint(el.groupId, el.p1);
        includeGroupPoint(el.groupId, el.p2);
        includeGroupPoint(el.groupId, el.p3);
        includeGroupPoint(el.groupId, el.p4);
        includeGroupPoint(el.groupId, el.controlPoint);
        el.boundary?.forEach(point => includeGroupPoint(el.groupId, point));
      });

      exportGroupAnchors = new Map([...groupBounds.entries()]
        .filter(([, bounds]) => Number.isFinite(bounds.minX))
        .map(([groupId, bounds]) => [groupId, worldToScreen({
          x: (bounds.minX + bounds.maxX) / 2,
          y: (bounds.minY + bounds.maxY) / 2,
        })]));
    }

    const layers = {
      floor: elementsToUse.filter(e => e.type === 'floor' || e.type === 'ceiling' || e.type === 'room'),
      wall: elementsToUse.filter(e => ['wall', 'building-mass', 'road', 'landscape', 'water-body'].includes(e.type)),
      column: elementsToUse.filter(e => e.type === 'column'),
      asset: elementsToUse.filter(e => e.type === 'asset'),
      zone: elementsToUse.filter(e => ['urban-block', 'parcel', 'zone'].includes(e.type)),
      opening: elementsToUse.filter(e => ['door', 'window', 'wall-opening'].includes(e.type)),
      furniture: elementsToUse.filter(e => ['stair', 'railing', 'furniture', 'counter', 'fixture'].includes(e.type)),
      annotation: elementsToUse.filter(e => ['elevation-marker', 'dimension', 'gridline', 'label', 'line', 'arc', 'circle', 'ellipse', 'rectangle', 'room'].includes(e.type))
    };
    
    // Draw Site Map Background
    if (!isExport && editorState.isSiteMapVisible && project.siteMap && mapImageRef.current) {
        const sm = project.siteMap;
        const img = mapImageRef.current;
        const zoom = editorState.zoom;
        const offset = editorState.offset;
        
        ctx.save();
        ctx.globalAlpha = sm.opacity ?? 0.5;
        
        // Transform to world position of map
        // Correct approach: The map is at project coords (sm.offset), with scale (sm.scale) and rotation (sm.rotation)
        // sm.scale is "pixels per meter" for the ORIGINAL image.
        // So 1 meter in world is sm.scale pixels in image.
        // Or image_width / sm.scale = world_width.
        
        const worldWidth = img.width / (sm.scale || 100);
        const worldHeight = img.height / (sm.scale || 100);
        
        // World position of map center (or top-left depending on how we want it)
        // Let's assume sm.offset is the center of the map in world coordinates.
        const screenPos = worldToScreen(sm.offset);
        
        ctx.translate(screenPos.x, screenPos.y);
        ctx.rotate(((sm.rotation || 0) + (editorState.canvasAngle || 0)) * Math.PI / 180);
        
        const drawWidth = worldWidth * zoom;
        const drawHeight = worldHeight * zoom;
        
        ctx.drawImage(img, -drawWidth/2, -drawHeight/2, drawWidth, drawHeight);
        ctx.restore();
    }
    
    if (!isExport && editorState.isGridVisible && !isMiddlePanning) {
      const isUrban = project.mode === 'urban';
      
      // AutoCAD-style adaptive grid: intervals scale by powers of 10 (or 1-5-10 progression)
      // so that visible grid spacing remains relatively constant on screen.
      const zoom = editorState.zoom;
      // Calculate base unit: we want an interval that translates to ~20-100 pixels on screen
      const k = Math.floor(Math.log10(50 / zoom)); 
      const base = Math.pow(10, k);
      
      // Tertiary (Minor), Secondary (Mid), and Primary (Major) levels
      // We draw from Minor to Major so that Major weights/colors are on top.
      const levels = [
        { size: base,       width: isUrban ? 0.35 : 0.45, alpha: 0.2 }, // Minor
        { size: base * 5,   width: isUrban ? 0.7 : 0.8,   alpha: 0.45 }, // Mid (intermediate)
        { size: base * 10,  width: isUrban ? 1.5 : 2.0,   alpha: 0.85 }  // Major (bold every 10)
      ];
      
      const angleRad = ((editorState.canvasAngle || 0) * Math.PI) / 180;
      const baseGridColor = isUrban ? 'rgb(226, 232, 240)' : 'rgb(203, 213, 225)'; // slate-200 or slate-300
      
      ctx.save();
      ctx.translate(editorState.offset.x, editorState.offset.y);
      ctx.rotate(angleRad);

      const diag = Math.sqrt(canvas.width * canvas.width + canvas.height * canvas.height);
      const halfDiag = diag / 2;
      
      const cx = canvas.width / 2;
      const cy = canvas.height / 2;
      const tx = cx - editorState.offset.x;
      const ty = cy - editorState.offset.y;
      
      const cos = Math.cos(-angleRad);
      const sin = Math.sin(-angleRad);
      const rx = tx * cos - ty * sin;
      const ry = tx * sin + ty * cos;

      // If we are zoomed out or panning/dragging (low LOD), skip minor and mid grid lines to keep screen updates smooth
      const activeLevels = isLowLOD 
        ? levels.filter(lvl => lvl.size === base * 10) 
        : levels;

      const sortedLevels = [...activeLevels].sort((a, b) => a.size - b.size);
      
      for (const lvl of sortedLevels) { 
        const step = lvl.size * zoom;
        if (step < 5) continue; // Too dense to draw
        
        ctx.beginPath();
        // Construct stroke style with alpha
        const components = baseGridColor.match(/\d+/g) || ['203', '213', '225'];
        ctx.strokeStyle = `rgba(${components[0]}, ${components[1]}, ${components[2]}, ${lvl.alpha})`;
        ctx.lineWidth = lvl.width;
        
        const startX = Math.round((rx - halfDiag) / step) * step;
        const endX = Math.round((rx + halfDiag) / step) * step;
        for (let x = startX; x <= endX; x += step) {
          ctx.moveTo(x, ry - halfDiag);
          ctx.lineTo(x, ry + halfDiag);
        }
        
        const startY = Math.round((ry - halfDiag) / step) * step;
        const endY = Math.round((ry + halfDiag) / step) * step;
        for (let y = startY; y <= endY; y += step) {
          ctx.moveTo(rx - halfDiag, y);
          ctx.lineTo(rx + halfDiag, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    
    layers.floor.forEach(el => {
      setExportLayer(el);
      const isGhost = el.levelId !== activeLevelId && !!el.levelId;
      if (!el.boundary || el.boundary.length < 3) return;
      ctx.save();
      if (el.isPlacingDraft) ctx.globalAlpha = 0.5;
      else if (el.isCadUnderlay || (el.layer && getLayerStatus(el.layer).locked)) ctx.globalAlpha = 0.35;
      else if (isGhost) ctx.globalAlpha = 0.33;
      ctx.beginPath();
      el.boundary.forEach((p, i) => { const s = worldToScreen(p); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
      ctx.closePath();
      const isSelected = selectedIds.includes(el.id);
      const isHovered = renderedHoveredIds.has(el.id);
      
      // PROCEDURAL HOST GHOST BOUNDARY
      if (el.isProceduralHost) {
          const isNear = isHovered || isSelected;
          ctx.strokeStyle = isSelected ? APP_COLORS.highlight : (isHovered ? 'rgba(59, 130, 246, 0.8)' : 'rgba(100, 116, 139, 0.4)');
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = isNear ? 2 : 1;
          ctx.stroke();
          
          if (isSelected) {
              const baseFill = 'rgba(59, 130, 246, 0.03)';
              ctx.fillStyle = baseFill;
              ctx.fill();
          }
          ctx.restore();
          return;
      }

      const baseFill = (el.type === 'floor' || el.type === 'room') ? (isSelected ? 'rgba(59, 130, 246, 0.18)' : isHovered ? 'rgba(59, 130, 246, 0.28)' : 'rgba(59, 130, 246, 0.08)') : (isSelected ? 'rgba(147, 51, 234, 0.18)' : isHovered ? 'rgba(147, 51, 234, 0.28)' : 'rgba(147, 51, 234, 0.10)');
      ctx.fillStyle = baseFill; ctx.strokeStyle = isSelected ? APP_COLORS.highlight : (isHovered ? 'rgba(59, 130, 246, 0.85)' : 'rgba(100, 116, 139, 0.3)'); ctx.setLineDash(isSelected ? [6, 4] : (isHovered ? [2, 3] : [5, 5]));
      ctx.fill(); ctx.stroke(); ctx.restore();
    });

    const walls = layers.wall;
    const columns = layers.column;
    const assets = layers.asset;
    const zones = layers.zone;
    
    // Draw Zones
    zones.forEach(el => {
      setExportLayer(el);
      if (!el.boundary || el.boundary.length < 3) return;
      const isSelected = selectedIds.includes(el.id);
      const isHovered = renderedHoveredIds.has(el.id);
      
      ctx.save();
      if (el.isPlacingDraft) ctx.globalAlpha = 0.5;
      else if (el.isCadUnderlay || (el.layer && getLayerStatus(el.layer).locked)) ctx.globalAlpha = 0.35;
      ctx.beginPath();
      el.boundary.forEach((p, i) => { const s = worldToScreen(p); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
      ctx.closePath();
      
      const zoneColorMap: Record<string, string> = {
        'park': 'rgba(34, 197, 94, 0.05)',
        'residential': 'rgba(59, 130, 246, 0.05)',
        'office': 'rgba(239, 68, 68, 0.05)',
        'commercial': 'rgba(239, 68, 68, 0.05)',
        'mixed': 'rgba(139, 92, 246, 0.05)'
      };
      
      ctx.fillStyle = zoneColorMap[el.zoneType || 'mixed'] || 'rgba(148, 163, 184, 0.05)';
      ctx.fill();
      
      ctx.strokeStyle = isSelected ? APP_COLORS.highlight : (isHovered ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.1)');
      ctx.setLineDash([10, 5]);
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Label
      if (editorState.zoom > 0.3 && !isMiddlePanning) {
          const center = el.boundary.reduce((acc, p) => ({ x: acc.x + p.x/el.boundary!.length, y: acc.y + p.y/el.boundary!.length }), { x: 0, y: 0 });
          const s = worldToScreen(center);
          const zoomScale = editorState.zoom / 15;
          ctx.fillStyle = isSelected ? '#2563eb' : 'rgba(0,0,0,0.4)';
          ctx.font = `black ${Math.max(4, 10 * zoomScale)}px Inter`;
          ctx.textAlign = 'center';
          ctx.fillText((el.zoneType || 'Mixed-use').toUpperCase(), s.x, s.y);
          ctx.font = `${Math.max(3, 9 * zoomScale)}px Inter`;
          ctx.fillText(`${el.preferDensity || 'Medium'} Density`, s.x, s.y + 12 * zoomScale);
      }
      
      ctx.restore();
    });

    // Draw Assets
    assets.forEach(el => {
      setExportLayer(el);
      if (!el.pos) return;
      const s = worldToScreen(el.pos);
      const isSelected = selectedIds.includes(el.id);
      
      ctx.save();
      if (el.isPlacingDraft) ctx.globalAlpha = 0.5;
      else if (el.isCadUnderlay || (el.layer && getLayerStatus(el.layer).locked)) ctx.globalAlpha = 0.35;
      ctx.translate(s.x, s.y);
      ctx.rotate(((el.rotation || 0) + (editorState.canvasAngle || 0)) * Math.PI / 180);
      
      const sc = (el.scale || 1.0) * editorState.zoom;
      
      if (el.assetType === 'tree') {
          // Tree Icon (Circle with crossed lines)
          ctx.beginPath();
          ctx.arc(0, 0, 4 * sc, 0, Math.PI * 2);
          ctx.fillStyle = isSelected ? APP_COLORS.highlight : '#166534';
          ctx.fill();
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 0.5 * sc;
          ctx.moveTo(-2 * sc, -2 * sc); ctx.lineTo(2 * sc, 2 * sc);
          ctx.moveTo(2 * sc, -2 * sc); ctx.lineTo(-2 * sc, 2 * sc);
          ctx.stroke();
      } else if (el.assetType === 'streetlight') {
          ctx.beginPath();
          ctx.arc(0, 0, 1.5 * sc, 0, Math.PI * 2);
          ctx.fillStyle = isSelected ? APP_COLORS.highlight : '#475569';
          ctx.fill();
          // Arm
          ctx.fillRect(0, -0.5 * sc, 3 * sc, 1 * sc);
      } else if (el.assetType === 'car') {
          ctx.fillStyle = isSelected ? APP_COLORS.highlight : '#ef4444';
          ctx.fillRect(-1 * sc, -2 * sc, 2 * sc, 4 * sc);
      } else if (el.assetType === 'bench') {
          ctx.fillStyle = isSelected ? APP_COLORS.highlight : '#78350f';
          ctx.fillRect(-1 * sc, -0.3 * sc, 2 * sc, 0.6 * sc);
      } else {
          const w = Math.max(0.6, el.width || 1.2) * editorState.zoom;
          const d = Math.max(0.6, el.depth || 1.2) * editorState.zoom;
          ctx.fillStyle = isSelected ? 'rgba(37, 99, 235, 0.16)' : 'rgba(8, 145, 178, 0.12)';
          ctx.strokeStyle = isSelected ? APP_COLORS.highlight : '#0891b2';
          ctx.lineWidth = Math.max(1, 1.25);
          ctx.setLineDash([6, 4]);
          ctx.fillRect(-w / 2, -d / 2, w, d);
          ctx.strokeRect(-w / 2, -d / 2, w, d);
          ctx.setLineDash([]);
          ctx.fillStyle = isSelected ? APP_COLORS.highlight : '#0e7490';
          ctx.font = `bold ${Math.max(9, Math.min(12, editorState.zoom * 0.45))}px Inter`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('BIM', 0, 0);
      }
      
      ctx.restore();
    });
    
    // Pass 1: Outer boundaries (Dark outline)
    walls.forEach(el => {
      setExportLayer(el);
      const isGhost = el.levelId !== activeLevelId && !!el.levelId;
      if (!el.p1 || !el.p2) return; 
      const isSelected = selectedIds.includes(el.id);
      const isBoundSelected = editorState.tempBoundaryIds?.includes(el.id);
      const isHovered = renderedHoveredIds.has(el.id);
      
      let borderColor = isBoundSelected ? '#10b981' : (isSelected ? APP_COLORS.highlight : (isHovered ? 'rgba(59, 130, 246, 0.85)' : APP_COLORS.wall)); 
      if (el.isCadUnderlay || (el.layer && getLayerStatus(el.layer).locked)) borderColor = 'rgba(148, 163, 184, 0.35)'; 
      
      const oldAlpha = ctx.globalAlpha;
      if (el.isPlacingDraft) ctx.globalAlpha = 0.5;
      else if (el.isCadUnderlay || (el.layer && getLayerStatus(el.layer).locked)) ctx.globalAlpha = 0.35;
      if (isGhost) ctx.globalAlpha = 0.33;
      
      // Urban Overrides
      if (el.type === 'building-mass') borderColor = APP_COLORS.massing;
      if (el.type === 'road') borderColor = APP_COLORS.road;
      if (el.type === 'landscape') borderColor = APP_COLORS.landscape;
      if (el.type === 'water-body') borderColor = APP_COLORS.water;

      if (['landscape', 'water-body', 'road', 'building-mass'].includes(el.type) && el.boundary && el.boundary.length >= 3) {
        ctx.save(); 
        
        // 1. Shadow for Building Mass
        if (el.type === 'building-mass' && !isSelected) {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
            ctx.shadowBlur = 8 * editorState.zoom;
            ctx.shadowOffsetX = 3 * editorState.zoom;
            ctx.shadowOffsetY = 4 * editorState.zoom;
        }

        ctx.beginPath();
        el.boundary.forEach((p, i) => { const s = worldToScreen(p); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
        ctx.closePath();
        
        // 2. Define Colors
        let fillStyle: string | CanvasGradient | CanvasPattern = el.type === 'building-mass' ? APP_COLORS.massing :
                       el.type === 'road' ? APP_COLORS.road :
                       el.type === 'landscape' ? APP_COLORS.landscape :
                       el.type === 'water-body' ? APP_COLORS.water : '#ccc';
        
        if (isSelected) fillStyle = APP_COLORS.highlight;
        
        // 3. Special Textures
        if (el.type === 'water-body' && !isSelected) {
            const bounds = el.boundary.reduce((acc, p) => ({
                minX: Math.min(acc.minX, p.x), maxX: Math.max(acc.maxX, p.x),
                minY: Math.min(acc.minY, p.y), maxY: Math.max(acc.maxY, p.y)
            }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
            const s1 = worldToScreen({ x: bounds.minX, y: bounds.minY });
            const s2 = worldToScreen({ x: bounds.maxX, y: bounds.maxY });
            const grad = ctx.createLinearGradient(s1.x, s1.y, s2.x, s2.y);
            grad.addColorStop(0, '#0ea5e9'); // sky-500
            grad.addColorStop(1, '#0284c7'); // sky-600
            fillStyle = grad;
        }

        ctx.fillStyle = fillStyle;
        ctx.fill();
        
        // 4. Urban Detailing
        ctx.shadowColor = 'transparent'; // Reset shadow for stroke
        ctx.strokeStyle = el.type === 'building-mass' ? '#1e293b' : 'rgba(0,0,0,0.1)';
        ctx.lineWidth = isSelected ? 2 : 0.5;
        ctx.stroke();

        // Parapet Line for Building Mass
        if (el.type === 'building-mass' && !isSelected && editorState.zoom > 0.5) {
            ctx.beginPath();
            const inset = 1.0; // 1m inset
            const insetPoints = insetPolygon(el.boundary, inset);
            insetPoints.forEach((p, i) => { const s = worldToScreen(p); if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y); });
            ctx.closePath();
            ctx.strokeStyle = 'rgba(255,255,255,0.15)';
            ctx.stroke();
        }

        ctx.restore();
        return;
      }
      
      const segments = getWallOpeningSegments(el, rawElementsList);
      segments.forEach(seg => {
          if (seg.isOpening) return;
          const poly = getWallPolygon(el, rawElementsList, 0, [seg.tStart, seg.tEnd], seg); 
          if (poly.length < 4) return;
          const sPoly = poly.map(p => worldToScreen(p)); ctx.save(); 
          ctx.fillStyle = borderColor; 
          ctx.strokeStyle = borderColor;
          ctx.lineWidth = 1;
          ctx.lineJoin = 'miter';
          ctx.beginPath(); ctx.moveTo(sPoly[0].x, sPoly[0].y); 
          for (let i = 1; i < sPoly.length; i++) ctx.lineTo(sPoly[i].x, sPoly[i].y);
          ctx.closePath(); 
          ctx.fill('evenodd');
          ctx.stroke();
          ctx.restore();
      });
    });

    columns.forEach(el => {
         setExportLayer(el);
         ctx.save();
         if (el.isPlacingDraft) ctx.globalAlpha = 0.5;
         else if (el.isCadUnderlay || (el.layer && getLayerStatus(el.layer).locked)) ctx.globalAlpha = 0.35;
         drawSmartBlock(ctx, el, false, 'outline', 0);
         ctx.restore();
    });

    // Pass 2: Inner boundaries (White fill) to create double-line hollow effect
    walls.filter(w => w.type === 'wall').forEach(el => {
      setExportLayer(el);
      if (!el.p1 || !el.p2) return; 
      const isSelected = selectedIds.includes(el.id);
      let innerColor = isSelected ? 'rgba(219, 234, 254, 0.95)' : '#ffffff'; 
      if (el.isCadUnderlay || (el.layer && getLayerStatus(el.layer).locked)) innerColor = 'rgba(241, 245, 249, 0.35)'; 
      const shrinkAmt = isExport ? (target?.wallBorderScreenPx ?? CANVAS_WALL_BORDER_PX) : CANVAS_WALL_BORDER_PX;
      
      const segments = getWallOpeningSegments(el, rawElementsList);
      segments.forEach(seg => {
          if (seg.isOpening) return;
          const poly = getWallPolygon(el, rawElementsList, shrinkAmt, [seg.tStart, seg.tEnd], seg); 
          if (poly.length < 4) return;
          const sPoly = poly.map(p => worldToScreen(p)); ctx.save(); 
          ctx.fillStyle = innerColor; 
          ctx.strokeStyle = innerColor;
          ctx.lineWidth = 1;
          ctx.lineJoin = 'miter';
          ctx.beginPath(); ctx.moveTo(sPoly[0].x, sPoly[0].y); 
          for (let i = 1; i < sPoly.length; i++) ctx.lineTo(sPoly[i].x, sPoly[i].y);
          ctx.closePath(); 
          ctx.fill('evenodd');
          ctx.stroke();
          ctx.restore();
      });
      
      if (isSelected) { 
          ctx.fillStyle = APP_COLORS.highlight; 
          const p1 = worldToScreen(el.p1), p2 = worldToScreen(el.p2); 
          ctx.fillRect(p1.x-4, p1.y-4, 8, 8); ctx.fillRect(p2.x-4, p2.y-4, 8, 8); 
          if (isCurvedElement(el) && el.controlPoint) { 
              const cp = worldToScreen(el.controlPoint); 
              ctx.fillStyle = '#f59e0b'; ctx.fillRect(cp.x-4, cp.y-4, 8, 8); 
          }
      } 
      ctx.restore();
    });

    columns.forEach(el => {
         setExportLayer(el);
         ctx.save();
         if (el.isPlacingDraft) ctx.globalAlpha = 0.5;
         else if (el.isCadUnderlay || (el.layer && getLayerStatus(el.layer).locked)) ctx.globalAlpha = 0.35;
         drawSmartBlock(ctx, el, false, 'fill', 3.0);
         const isSelected = selectedIds.includes(el.id);
         const isHovered = renderedHoveredIds.has(el.id);
         if (isSelected || isHovered) {
             drawSmartBlock(ctx, el, false, 'outline', 0);
         }
         ctx.restore();
    });

    layers.opening.forEach(el => {
      setExportLayer(el);
      const isGhost = el.levelId !== activeLevelId && !!el.levelId;
        const isSelected = selectedIds.includes(el.id); ctx.save();
        if (el.isPlacingDraft) ctx.globalAlpha = 0.5;
        else if (el.isCadUnderlay || (el.layer && getLayerStatus(el.layer).locked)) ctx.globalAlpha = 0.35;
        const isHovered = renderedHoveredIds.has(el.id);
        if (el.pos) {
            const p = worldToScreen(el.pos); ctx.translate(p.x, p.y); ctx.rotate(((el.rotation || 0) + (editorState.canvasAngle || 0)) * (Math.PI / 180));
            const width = (el.width || 2) * editorState.zoom;
            const hostWall = el.hostWallId ? elementsMap.get(el.hostWallId) : null;
            const wallThickness = hostWall ? hostWall.thickness : (findNearestWall(el.pos)?.wall.thickness || WALL_THICKNESS_DEFAULT);
            const tS = wallThickness * editorState.zoom;
            ctx.fillStyle = isSelected ? APP_COLORS.highlight : (isHovered ? 'rgba(59, 130, 246, 0.28)' : OPENING_COLOR);
            if (el.type === 'window') {
                const color = isSelected ? APP_COLORS.highlight : (isHovered ? 'rgba(59, 130, 246, 0.85)' : OPENING_COLOR);
                drawWindowSymbol(ctx, width, tS, color, editorState.zoom);
            } else if (el.type === 'door') {
                const doorColor = isSelected ? APP_COLORS.highlight : (isHovered ? 'rgba(59, 130, 246, 0.85)' : OPENING_COLOR);
                drawDoorSymbol(ctx, width, tS, el.subType, !!el.isFlipped, !!el.facingFlipped, doorColor, false, editorState.zoom);
                
                if (isSelected || isHovered) {
                    const btnRad = FLIP_CONTROL_RADIUS_PX;
                    const offset = FLIP_CONTROL_EDGE_GAP_PX;
                    
                    // Facing flip arrow (vertical double arrow across wall):
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(0, -tS/2 - offset, btnRad, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = '#3b82f6';
                    ctx.lineWidth = 1;
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
                    ctx.shadowBlur = 4;
                    ctx.fill();
                    ctx.stroke();
                    ctx.shadowColor = 'transparent';
                    
                    ctx.strokeStyle = '#3b82f6';
                    ctx.lineWidth = 1.25;
                    ctx.beginPath();
                    ctx.moveTo(0, -tS/2 - offset - 4);
                    ctx.lineTo(0, -tS/2 - offset + 4);
                    ctx.stroke();
                    
                    ctx.beginPath();
                    ctx.moveTo(-2.5, -tS/2 - offset - 1.5);
                    ctx.lineTo(0, -tS/2 - offset - 4);
                    ctx.lineTo(2.5, -tS/2 - offset - 1.5);
                    ctx.stroke();
                    
                    ctx.beginPath();
                    ctx.moveTo(-2.5, -tS/2 - offset + 1.5);
                    ctx.lineTo(0, -tS/2 - offset + 4);
                    ctx.lineTo(2.5, -tS/2 - offset + 1.5);
                    ctx.stroke();
                    ctx.restore();
                    
                    // Hand flip arrow (horizontal double arrow along wall):
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(0, tS/2 + offset, btnRad, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = '#3b82f6';
                    ctx.lineWidth = 1;
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
                    ctx.shadowBlur = 4;
                    ctx.fill();
                    ctx.stroke();
                    ctx.shadowColor = 'transparent';
                    
                    ctx.strokeStyle = '#3b82f6';
                    ctx.lineWidth = 1.25;
                    ctx.beginPath();
                    ctx.moveTo(-4, tS/2 + offset);
                    ctx.lineTo(4, tS/2 + offset);
                    ctx.stroke();
                    
                    ctx.beginPath();
                    ctx.moveTo(-1.5, tS/2 + offset - 2.5);
                    ctx.lineTo(-4, tS/2 + offset);
                    ctx.lineTo(-1.5, tS/2 + offset + 2.5);
                    ctx.stroke();
                    
                    ctx.beginPath();
                    ctx.moveTo(1.5, tS/2 + offset - 2.5);
                    ctx.lineTo(4, tS/2 + offset);
                    ctx.lineTo(1.5, tS/2 + offset + 2.5);
                    ctx.stroke();
                    ctx.restore();
                }
            } else if (el.type === 'wall-opening') {
                const color = isSelected ? APP_COLORS.highlight : (isHovered ? 'rgba(59, 130, 246, 0.85)' : OPENING_COLOR);
                drawWallOpeningSymbol(ctx, width, tS, color, editorState.zoom);
            }
            
            if (isSelected) { ctx.fillStyle = APP_COLORS.highlight; ctx.fillRect(-4, -4, 8, 8); }
        }
        ctx.restore();
    });

    layers.furniture.forEach(el => {
      setExportLayer(el);
      const isGhost = el.levelId !== activeLevelId && !!el.levelId;
         const isSelected = selectedIds.includes(el.id);
         const isHovered = renderedHoveredIds.has(el.id);
         ctx.save();
         if (el.isPlacingDraft) ctx.globalAlpha = 0.5;
         else if (el.isCadUnderlay || (el.layer && getLayerStatus(el.layer).locked)) ctx.globalAlpha = 0.35;
         if (isGhost) ctx.globalAlpha = 0.33;
         if (el.type === 'stair') drawStair(ctx, el, isSelected);
         else if (el.type === 'railing') drawRailing(ctx, el, isSelected);
         else if (el.pos) drawSmartBlock(ctx, el);
         if (!isExport && el.pos && ['furniture', 'fixture', 'counter', 'column'].includes(el.type) && (isSelected || isHovered)) {
           const p = worldToScreen(el.pos);
           const w = (el.width || 1) * editorState.zoom;
           const d = (el.depth || 1) * editorState.zoom;
           const rot = ((el.rotation || 0) + (editorState.canvasAngle || 0)) * Math.PI / 180;
           const btnRad = FLIP_CONTROL_RADIUS_PX;
           const offset = FLIP_CONTROL_EDGE_GAP_PX;
           const drawFlipCircle = (x: number, y: number, mode: 'horizontal' | 'vertical') => {
             ctx.save();
             ctx.beginPath();
             ctx.arc(x, y, btnRad, 0, Math.PI * 2);
             ctx.fillStyle = '#ffffff';
             ctx.strokeStyle = '#3b82f6';
             ctx.lineWidth = 1;
             ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
             ctx.shadowBlur = 4;
             ctx.fill();
             ctx.stroke();
             ctx.shadowColor = 'transparent';
             ctx.strokeStyle = '#3b82f6';
             ctx.lineWidth = 1.25;
             ctx.beginPath();
             if (mode === 'horizontal') {
               ctx.moveTo(x - 4, y);
               ctx.lineTo(x + 4, y);
               ctx.moveTo(x - 1.5, y - 2.5);
               ctx.lineTo(x - 4, y);
               ctx.lineTo(x - 1.5, y + 2.5);
               ctx.moveTo(x + 1.5, y - 2.5);
               ctx.lineTo(x + 4, y);
               ctx.lineTo(x + 1.5, y + 2.5);
             } else {
               ctx.moveTo(x, y - 4);
               ctx.lineTo(x, y + 4);
               ctx.moveTo(x - 2.5, y - 1.5);
               ctx.lineTo(x, y - 4);
               ctx.lineTo(x + 2.5, y - 1.5);
               ctx.moveTo(x - 2.5, y + 1.5);
               ctx.lineTo(x, y + 4);
               ctx.lineTo(x + 2.5, y + 1.5);
             }
             ctx.stroke();
             ctx.restore();
           };
           ctx.save();
           ctx.translate(p.x, p.y);
           ctx.rotate(rot);
           drawFlipCircle(0, -d / 2 - offset, 'horizontal');
           drawFlipCircle(w / 2 + offset, 0, 'vertical');
           ctx.restore();
         }
         ctx.restore();
    });

    const isRoomNameDimCull = !isExport && editorState.zoom < 1.2;
    const isAnnotationCull = !isExport && editorState.zoom < 0.6;

    layers.annotation.forEach(el => {
      setExportLayer(el);
      if (isMiddlePanning && !(isElevationCanvas && (el.subType?.startsWith('elevation-') || el.subType === 'elevation-datum'))) return;
      const isSelected = selectedIds.includes(el.id);
      
      // Decimate annotations when zoomed very far out to prevent slow Canvas font rendering,
      // unless selected (so active editing state is preserved)
      if (!isSelected) {
         if (isAnnotationCull && ['dimension', 'label', 'elevation-marker'].includes(el.type)) {
            return;
         }
         // Rooms are drawn below but we can skip them entirely if zoomed way out
         if (editorState.zoom < 0.35 && el.type === 'room') {
            return;
         }
      }

      ctx.save();
      if (el.isPlacingDraft) ctx.globalAlpha = 0.5;
      else if (el.isCadUnderlay || (el.layer && getLayerStatus(el.layer).locked)) ctx.globalAlpha = 0.35;
      const isHovered = renderedHoveredIds.has(el.id);
      if (el.type === 'elevation-marker' && el.pos) {
        drawElevationMarker(ctx, el, worldToScreen(el.pos));
      } else if (el.type === 'dimension' && el.p1 && el.p2) {
        drawDimensionElement(ctx, el, isSelected, isHovered);
      } else if (el.type === 'gridline' && el.p1 && el.p2) {
        const p1 = worldToScreen(el.p1), p2 = worldToScreen(el.p2);
        ctx.save();
        ctx.strokeStyle = isSelected ? APP_COLORS.highlight : (isHovered ? '#3b82f6' : '#64748b');
        ctx.lineWidth = isSelected ? 2 : (isHovered ? 1.5 : 1.2);
        ctx.setLineDash([15, 6, 3, 6]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);
        const bubbleRad = 14;
        [p1, p2].forEach((pt) => {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, bubbleRad, 0, Math.PI * 2);
            ctx.fillStyle = APP_COLORS.background;
            ctx.fill();
            ctx.strokeStyle = isSelected ? APP_COLORS.highlight : (isHovered ? '#3b82f6' : '#475569');
            ctx.lineWidth = isSelected ? 2 : 1.2;
            ctx.stroke();
            ctx.fillStyle = isSelected ? APP_COLORS.highlight : '#1e293b';
            ctx.font = 'bold 11px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(el.label || '', pt.x, pt.y + 0.5);
        });
        ctx.restore();
      } else if (el.type === 'line' && el.p1 && el.p2) {
        const p1 = worldToScreen(el.p1), p2 = worldToScreen(el.p2);
        if (el.subType === 'elevation-datum') {
          const marker = p2;
          const color = isSelected ? APP_COLORS.highlight : (isHovered ? '#3b82f6' : (el.color || '#64748b'));
          ctx.save();
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.1;
          ctx.setLineDash([10, 7]);
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(marker.x - 15, marker.y);
          ctx.stroke();
          ctx.setLineDash([]);

          const r = 12;
          ctx.beginPath();
          ctx.arc(marker.x, marker.y, r, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.strokeStyle = '#64748b';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.fillStyle = '#111827';
          ctx.beginPath();
          ctx.moveTo(marker.x, marker.y);
          ctx.arc(marker.x, marker.y, r, Math.PI, Math.PI * 1.5);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(marker.x, marker.y);
          ctx.arc(marker.x, marker.y, r, 0, Math.PI * 0.5);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(marker.x - r - 8, marker.y);
          ctx.lineTo(marker.x + r + 8, marker.y);
          ctx.moveTo(marker.x, marker.y - r - 8);
          ctx.lineTo(marker.x, marker.y + r + 8);
          ctx.stroke();

          const lines = (el.label || '').split('\n');
          ctx.fillStyle = color;
          ctx.font = 'bold 12px Inter, sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          lines.forEach((line, index) => {
            ctx.fillText(line, marker.x + r + 8, marker.y + (index - (lines.length - 1) / 2) * 14);
          });
          ctx.restore();
        } else {
          ctx.strokeStyle = isSelected ? APP_COLORS.highlight : (isHovered ? '#3b82f6' : (el.color || '#2f2f2f'));
          ctx.lineWidth = isSelected ? 2 : (el.locked ? 0.8 : 1);
          if (el.locked) ctx.setLineDash([8, 6]);
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
          ctx.setLineDash([]);
        }
      } else if (el.type === 'arc' && el.p1 && el.p2 && el.controlPoint) {
        ctx.strokeStyle = isSelected ? APP_COLORS.highlight : (isHovered ? '#3b82f6' : '#2f2f2f');
        ctx.lineWidth = isSelected ? 2 : 1;
        if (el.arcCenter && el.arcRadius !== undefined && el.arcStartAngle !== undefined && el.arcEndAngle !== undefined) {
          const center = worldToScreen(el.arcCenter);
          ctx.beginPath();
          ctx.arc(center.x, center.y, el.arcRadius * editorState.zoom, el.arcStartAngle, el.arcEndAngle, el.arcCounterclockwise);
          ctx.stroke();
        } else {
          const p1 = worldToScreen(el.p1), p2 = worldToScreen(el.p2), cp = worldToScreen(el.controlPoint);
          ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y); ctx.stroke();
        }
      } else if (el.type === 'circle' && el.p1 && el.p2) {
        const p1 = worldToScreen(el.p1);
        const r = Math.hypot(el.p2.x - el.p1.x, el.p2.y - el.p1.y) * editorState.zoom;
        ctx.strokeStyle = isSelected ? APP_COLORS.highlight : (isHovered ? '#3b82f6' : '#2f2f2f');
        ctx.lineWidth = isSelected ? 2 : 1;
        ctx.beginPath(); ctx.arc(p1.x, p1.y, r, 0, Math.PI * 2); ctx.stroke();
      } else if (el.type === 'ellipse' && el.p1 && el.p2) {
        ctx.strokeStyle = isSelected ? APP_COLORS.highlight : (isHovered ? '#3b82f6' : '#2f2f2f');
        ctx.lineWidth = isSelected ? 2 : 1;
        if (el.ellipseCenter && el.ellipseRadiusX !== undefined && el.ellipseRadiusY !== undefined) {
          const center = worldToScreen(el.ellipseCenter);
          ctx.beginPath();
          ctx.ellipse(
            center.x,
            center.y,
            el.ellipseRadiusX * editorState.zoom,
            el.ellipseRadiusY * editorState.zoom,
            el.ellipseRotation || 0,
            el.ellipseStartAngle ?? 0,
            el.ellipseEndAngle ?? Math.PI * 2,
            el.ellipseCounterclockwise
          );
          ctx.stroke();
        } else {
          const p1 = worldToScreen(el.p1), p2 = worldToScreen(el.p2);
          ctx.beginPath(); ctx.ellipse((p1.x+p2.x)/2, (p1.y+p2.y)/2, Math.abs(p2.x-p1.x)/2, Math.abs(p2.y-p1.y)/2, 0, 0, Math.PI * 2); ctx.stroke();
        }
      } else if (el.type === 'rectangle' && el.p1 && el.p2) {
        const p1 = worldToScreen(el.p1), p2 = worldToScreen(el.p2);
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p1.x - p2.x);
        const h = Math.abs(p1.y - p2.y);
        const isElevationRect = (el.subType || '').startsWith('elevation-');
        ctx.strokeStyle = isSelected ? APP_COLORS.highlight : (isHovered ? '#3b82f6' : (el.color || '#2f2f2f'));
        ctx.lineWidth = isSelected ? 2 : isElevationRect ? 1.4 : 1;
        if (isElevationRect) {
          const subType = el.subType || '';
          const glassLike = (el.subType || '').toLowerCase().includes('glass');
          ctx.fillStyle = glassLike ? 'rgba(224, 242, 254, 0.55)' : '#ffffff';
          ctx.fillRect(x, y, w, h);
          if (subType.includes('window')) {
            ctx.beginPath();
            ctx.moveTo(x, y + h * 0.5);
            ctx.lineTo(x + w, y + h * 0.5);
            ctx.moveTo(x + w * 0.5, y);
            ctx.lineTo(x + w * 0.5, y + h);
            ctx.stroke();
          } else if (subType === 'elevation-interior') {
            const label = `${el.label || ''} ${el.sourceType || ''} ${el.subType || ''}`.toLowerCase();
            ctx.save();
            ctx.strokeStyle = isSelected ? APP_COLORS.highlight : '#64748b';
            ctx.lineWidth = Math.max(0.8, Math.min(1.1, editorState.zoom * 0.05));
            ctx.beginPath();
            if (label.includes('table') || label.includes('desk')) {
              ctx.moveTo(x + w * 0.08, y + h * 0.2);
              ctx.lineTo(x + w * 0.92, y + h * 0.2);
              ctx.moveTo(x + w * 0.2, y + h * 0.2);
              ctx.lineTo(x + w * 0.2, y + h);
              ctx.moveTo(x + w * 0.8, y + h * 0.2);
              ctx.lineTo(x + w * 0.8, y + h);
            } else if (label.includes('bed') || label.includes('sofa') || label.includes('seat') || label.includes('chair')) {
              ctx.moveTo(x + w * 0.08, y + h * 0.45);
              ctx.lineTo(x + w * 0.92, y + h * 0.45);
              ctx.moveTo(x + w * 0.12, y + h * 0.2);
              ctx.lineTo(x + w * 0.12, y + h);
              ctx.moveTo(x + w * 0.88, y + h * 0.58);
              ctx.lineTo(x + w * 0.88, y + h);
            } else if (label.includes('cabinet') || label.includes('wardrobe') || label.includes('shelf') || label.includes('counter')) {
              ctx.moveTo(x, y + h * 0.33);
              ctx.lineTo(x + w, y + h * 0.33);
              ctx.moveTo(x, y + h * 0.66);
              ctx.lineTo(x + w, y + h * 0.66);
              ctx.moveTo(x + w * 0.5, y);
              ctx.lineTo(x + w * 0.5, y + h);
            } else {
              ctx.moveTo(x + w * 0.12, y + h * 0.25);
              ctx.lineTo(x + w * 0.88, y + h * 0.25);
              ctx.moveTo(x + w * 0.12, y + h * 0.75);
              ctx.lineTo(x + w * 0.88, y + h * 0.75);
            }
            ctx.stroke();
            ctx.restore();
          }
        }
        ctx.strokeRect(x, y, w, h);
      } else if (el.type === 'label' && el.pos) {
        const s = worldToScreen(el.pos);
        const zoomScale = editorState.zoom / 15;
        const baseFontSize = el.textFontSize || 12;
        const rot = ((el.rotation || 0) + (editorState.canvasAngle || 0)) * (Math.PI / 180);
        
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(rot);
        ctx.scale(zoomScale, zoomScale);
        
        ctx.fillStyle = isSelected ? APP_COLORS.highlight : (el.color || '#1e293b');
        ctx.font = `${el.textBold ? 'bold ' : ''}${el.textItalic ? 'italic ' : ''}${baseFontSize}px ${el.textFontFamily || 'Inter'}`;
        ctx.textAlign = el.textAlignment || 'center';
        
        const label = el.label || '';
        if (label.includes('\n')) {
          const lines = label.split('\n');
          ctx.textBaseline = 'middle';
          lines.forEach((line, i) => {
            ctx.fillText(line, 0, i * baseFontSize * 1.2);
          });
        } else {
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(label, 0, 0);
        }
        ctx.restore();
      } else if (el.type === 'room' && el.pos) {
        const s = worldToScreen(el.pos);
        const zoomScale = editorState.zoom / 15;
        const color = isSelected ? APP_COLORS.highlight : (isHovered ? '#1d4ed8' : '#0f172a');
        
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate((editorState.canvasAngle || 0) * Math.PI / 180);

        if (el.metadata?.autoProceduralNode) {
          const nodeRadius = Math.max(10, Math.min(24, Math.max(el.width || 1, el.depth || 1) * editorState.zoom * 0.09));
          ctx.beginPath();
          ctx.arc(0, 0, nodeRadius, 0, Math.PI * 2);
          ctx.fillStyle = isSelected ? 'rgba(16, 185, 129, 0.24)' : (isHovered ? 'rgba(16, 185, 129, 0.18)' : 'rgba(236, 253, 245, 0.92)');
          ctx.fill();
          ctx.strokeStyle = isSelected ? '#059669' : (isHovered ? '#10b981' : '#34d399');
          ctx.lineWidth = isSelected ? 2 : 1.4;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-nodeRadius * 0.42, 0);
          ctx.lineTo(nodeRadius * 0.42, 0);
          ctx.moveTo(0, -nodeRadius * 0.42);
          ctx.lineTo(0, nodeRadius * 0.42);
          ctx.strokeStyle = isSelected ? '#047857' : '#10b981';
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        
        const label = el.label || '';
        const lines = label.split('\n');
        
        // Optimize: If zoomed out or dragging heavy load, skip sub-lines (dimensions & area info) to avoid heavy text layout Math
        const skipRoomSublines = isRoomNameDimCull || (isDragMover && lines.length > 1);
        
        // Match the image style: Top line Bold/Uppercase, following lines regular
        lines.forEach((line, i) => {
          if (i === 0) {
            ctx.fillStyle = color;
            const size = el.textFontSize ? el.textFontSize * 0.5 : 6;
            ctx.font = `bold ${Math.max(3, size * zoomScale * 1.2)}px Inter, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(line.toUpperCase(), 0, -4 * zoomScale);
          } else if (!skipRoomSublines) {
            ctx.fillStyle = el.dimColor || '#64748b';
            const size = el.dimFontSize ? el.dimFontSize * 0.5 : 5;
            ctx.font = `${Math.max(2.5, size * zoomScale)}px "JetBrains Mono", monospace`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            // Offset for dimensions and area
            const yOffset = (i === 1 ? 4 : 10) * zoomScale;
            ctx.fillText(line, 0, yOffset);
          }
        });
        
        ctx.restore();
      }
      ctx.restore();
    });

    // Draw summary info card for procedural floors
    if (!isMiddlePanning) {
      project.elements.forEach(el => {
        if (el.type === 'floor' && (el.isProceduralHost || el.isAIGeneratedFloor) && el.levelId === activeLevelId) {
          setExportLayer(el);
          drawFloorSummary(ctx, el);
        }
      });
    }

    (ctx as CanvasRenderingContext2D & { finishDxfElement?: () => void }).finishDxfElement?.();

    // Draw selection bounding box for cad-underlay elements
    project.elements.forEach(el => {
      if (el.type === 'cad-underlay' && selectedIds.includes(el.id) && el.cadElements) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const includePoint = (point?: Point | null) => {
          if (!point) return;
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        };

        el.cadElements.forEach(child => {
          const source = getCurveSource(child);
          if (source === 'arc' || source === 'circle' || source === 'ellipse') {
            for (let i = 0; i <= 96; i += 1) includePoint(getCurvePoint(child, i / 96));
          } else {
            includePoint(child.pos);
            includePoint(child.p1);
            includePoint(child.p2);
            includePoint(child.p3);
            includePoint(child.p4);
          }
          if (child.boundary && child.boundary.length > 0) {
            child.boundary.forEach(includePoint);
          }
        });
        if (minX !== Infinity) {
          const p1 = worldToScreen({ x: minX, y: minY });
          const p2 = worldToScreen({ x: maxX, y: maxY });
          ctx.save();
          ctx.strokeStyle = APP_COLORS.highlight;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(
            Math.min(p1.x, p2.x) - 10,
            Math.min(p1.y, p2.y) - 10,
            Math.abs(p2.x - p1.x) + 20,
            Math.abs(p2.y - p1.y) + 20
          );
          ctx.fillStyle = APP_COLORS.highlight;
          ctx.font = 'bold 10px Inter, sans-serif';
          ctx.fillText("CAD Reference Underlay (Locked)", Math.min(p1.x, p2.x) - 10, Math.min(p1.y, p2.y) - 15);
          ctx.restore();
        }
      }
    });

    // PDF export stops after the plan layers. Selection handles, drawing previews,
    // snapping aids, cursor graphics, and other editor chrome stay on screen only.
    if (isExport) return;

    // Unified Handle Drawing (Selection or Hover)
    const displayId = hoveredElementId || (editorState.selectedIds.length === 1 ? editorState.selectedIds[0] : null);
    if (displayId && !isDrawing) {
        const el = project.elements.find(e => e.id === displayId);
        if (el) {
            const handles = getResizeHandles(el);
            handles.forEach(h => {
                const sPos = worldToScreen(h.worldPos);
                ctx.save();
                ctx.fillStyle = APP_COLORS.background;
                ctx.strokeStyle = APP_COLORS.highlight;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(sPos.x, sPos.y - RESIZE_HANDLE_DRAW_RADIUS_PX);
                ctx.lineTo(sPos.x + RESIZE_HANDLE_DRAW_RADIUS_PX, sPos.y);
                ctx.lineTo(sPos.x, sPos.y + RESIZE_HANDLE_DRAW_RADIUS_PX);
                ctx.lineTo(sPos.x - RESIZE_HANDLE_DRAW_RADIUS_PX, sPos.y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            });
        }
    }

    if (isDrawing) {
        if ((editorState.activeTool === 'procedural-polygon' || editorState.activeTool === 'procedural-boundary' || editorState.activeTool === 'smart-procedural-boundary' || editorState.activeTool === 'auto-procedural-boundary') && editorState.multiPointBuffer && editorState.multiPointBuffer.length > 0) {
            const points = [...editorState.multiPointBuffer, lastMousePos];
            const screenPoints: Point[] = points.map(worldToScreen);
            
            ctx.save();
            ctx.strokeStyle = APP_COLORS.primary;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(screenPoints[0].x, screenPoints[0].y);
            for (let i = 1; i < screenPoints.length; i++) {
                ctx.lineTo(screenPoints[i].x, screenPoints[i].y);
            }
            if (editorState.multiPointBuffer.length >= 2) ctx.closePath();
            ctx.stroke();

            // Real-time Dimension & Area Display
            if (points.length >= 2) {
              const area = ProceduralLayoutEngine.getPolygonArea({ points });
              const bounds = ProceduralLayoutEngine.getPolygonBounds({ points });
              const areaLabel = formatArea(area, editorState.unitSystem);
              const dimLabel = `${formatDimension(bounds.w, editorState.unitSystem)} x ${formatDimension(bounds.h, editorState.unitSystem)}`;
              
              const sPos = worldToScreen(lastMousePos);
              ctx.save();
              ctx.font = 'bold 12px Inter';
              const text = `${dimLabel} (${areaLabel})`;
              const tw = ctx.measureText(text).width;
              ctx.fillStyle = APP_COLORS.background;
              ctx.fillRect(sPos.x + 10, sPos.y - 30, tw + 10, 24);
              ctx.strokeStyle = APP_COLORS.primary;
              ctx.strokeRect(sPos.x + 10, sPos.y - 30, tw + 10, 24);
              ctx.fillStyle = APP_COLORS.primary;
              ctx.fillText(text, sPos.x + 15, sPos.y - 14);
              ctx.restore();
            }

            if (points.length >= 3) {
                const programId = PROCEDURAL_TYPOLOGIES.find(t => t.id === activeProceduralConfig?.typology)?.programId || 'domestic-standard';
                const engineToUse = editorState.activeTool === 'smart-procedural-boundary'
                  ? SmartProceduralLayoutEngine
                  : editorState.activeTool === 'auto-procedural-boundary'
                    ? AutoProceduralLayoutEngine
                    : ProceduralLayoutEngine;
                
                const { elements: ghostElems } = engineToUse.generateLayout(points, programId, { 
                    seed: 123,
                    typology: activeProceduralConfig?.style || 'Standard',
                    geometry: activeProceduralConfig?.geometry || 'Rectilinear',
                    requirements: activeProceduralConfig?.requirements,
                    unitSystem: editorState.unitSystem
                } as any);
                ctx.save(); ctx.globalAlpha = 0.3; ctx.setLineDash([2, 4]); ctx.strokeStyle = APP_COLORS.primary;
                ghostElems.forEach(el => {
                    if (el.type === 'wall' && el.p1 && el.p2) {
                        const s1 = worldToScreen(el.p1), s2 = worldToScreen(el.p2);
                        ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
                    }
                });
                ctx.restore();
            }
            ctx.restore();
        }

        if (editorState.activeTool === 'dimension' && editorState.multiPointBuffer && editorState.multiPointBuffer.length > 0) {
            const buffer = editorState.multiPointBuffer;
            if (buffer.length === 1) {
                const ghostEl: Partial<ArchElement> = {
                    id: 'ghost', type: 'dimension',
                    p1: buffer[0], p2: lastMousePos
                };
                drawDimensionElement(ctx, ghostEl as ArchElement, true, false);
            } else if (buffer.length === 2) {
                const ghostEl: Partial<ArchElement> = {
                    id: 'ghost', type: 'dimension',
                    p1: buffer[0], p2: buffer[1], p3: lastMousePos
                };
                drawDimensionElement(ctx, ghostEl as ArchElement, true, false);
            }
        }
        else if (editorState.activeTool === 'stair' && editorState.multiPointBuffer && editorState.multiPointBuffer.length > 0) {
            const pts = [...editorState.multiPointBuffer, lastMousePos];
            const preset = editorState.activePreset;
            const subType = preset?.subType || 'linear';
            const ghostEl: Partial<ArchElement> = {
                id: 'ghost', type: 'stair',
                p1: pts[0], p2: pts[1],
                p3: pts[2], p4: pts[3],
                width: 1.05, subType
            };
            ctx.save();
            ctx.globalAlpha = 0.6;
            drawStair(ctx, ghostEl as ArchElement, false);
            ctx.restore();
        }
        else if (dragStart) {
          const p1 = worldToScreen(dragStart), p2 = worldToScreen(lastMousePos); ctx.strokeStyle = APP_COLORS.primary; ctx.setLineDash([5, 5]);
          if (['rect', 'procedural-boundary', 'smart-procedural-boundary', 'auto-procedural-boundary', 'procedural-circle', 'building-mass', 'landscape', 'water-body'].includes(editorState.activeTool)) {
            if (editorState.activeTool === 'procedural-circle') {
                const r = Math.hypot(lastMousePos.x - dragStart.x, lastMousePos.y - dragStart.y);
                ctx.beginPath(); ctx.arc(p1.x, p1.y, r * editorState.zoom, 0, Math.PI * 2); ctx.stroke();
            } else {
                ctx.strokeRect(Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.abs(p1.x-p2.x), Math.abs(p1.y-p2.y));
            }
            if (editorState.activeTool === 'procedural-boundary' || editorState.activeTool === 'smart-procedural-boundary' || editorState.activeTool === 'auto-procedural-boundary' || editorState.activeTool === 'procedural-circle') {
                const isCircle = editorState.activeTool === 'procedural-circle';
                let points: Point[] = [];
                if (isCircle) {
                    const r = Math.hypot(lastMousePos.x - dragStart.x, lastMousePos.y - dragStart.y);
                    for (let i = 0; i < 32; i++) {
                        const a = (i / 32) * Math.PI * 2;
                        points.push({ x: dragStart.x + Math.cos(a) * r, y: dragStart.y + Math.sin(a) * r });
                    }
                } else {
                    const minX = Math.min(dragStart.x, lastMousePos.x), maxX = Math.max(dragStart.x, lastMousePos.x);
                    const minY = Math.min(dragStart.y, lastMousePos.y), maxY = Math.max(dragStart.y, lastMousePos.y);
                    points = [
                        { x: minX, y: minY },
                        { x: maxX, y: minY },
                        { x: maxX, y: maxY },
                        { x: minX, y: maxY },
                    ];
                }
                const seed = (dragStart.x * 33 + dragStart.y * 77); // Stable seed during drag
                const programId = PROCEDURAL_TYPOLOGIES.find(t => t.id === activeProceduralConfig?.typology)?.programId || 'domestic-standard';
                const engineToUse = editorState.activeTool === 'smart-procedural-boundary'
                  ? SmartProceduralLayoutEngine
                  : editorState.activeTool === 'auto-procedural-boundary'
                    ? AutoProceduralLayoutEngine
                    : ProceduralLayoutEngine;

                const { elements: ghostElems } = engineToUse.generateLayout(points, programId, { 
                    seed,
                    geometry: isCircle ? 'Circular' : (activeProceduralConfig?.geometry || 'Rectilinear'),
                    typology: activeProceduralConfig?.style || 'Standard',
                    requirements: activeProceduralConfig?.requirements,
                    unitSystem: editorState.unitSystem
                } as any);
                    ctx.save();
                    ctx.globalAlpha = 0.5;
                    ctx.setLineDash([2, 4]);
                    ctx.strokeStyle = APP_COLORS.primary;
                    ghostElems.forEach(el => {
                        if (el.type === 'wall' && el.p1 && el.p2) {
                            const s1 = worldToScreen(el.p1);
                            const s2 = worldToScreen(el.p2);
                            ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(s2.x, s2.y); ctx.stroke();
                        } else if (el.type === 'room' && el.pos) {
                            const s = worldToScreen(el.pos);
                            const zoomScale = editorState.zoom / 15;
                            const label = el.label || '';
                            const lines = label.split('\n');
                            
                            ctx.save();
                            ctx.translate(s.x, s.y);
                            lines.forEach((line, i) => {
                                if (i === 0) {
                                  ctx.fillStyle = '#0f172a';
                                  ctx.font = 'bold ' + Math.max(5, 11 * zoomScale) + 'px Inter';
                                  ctx.textAlign = 'center';
                                  ctx.fillText(line.toUpperCase(), 0, -5 * zoomScale);
                                } else {
                                  ctx.fillStyle = '#64748b';
                                  ctx.font = Math.max(4, 9 * zoomScale) + 'px "JetBrains Mono", monospace';
                                  ctx.textAlign = 'center';
                                  ctx.fillText(line, 0, (i === 1 ? 7 : 17) * zoomScale);
                                }
                            });
                            ctx.restore();
                        } else if (['furniture', 'fixture', 'counter', 'column'].includes(el.type)) {
                            drawSmartBlock(ctx, el as ArchElement, true);
                        } else if (el.type === 'stair') {
                            drawStair(ctx, el as ArchElement, false);
                        } else if (el.type === 'railing') {
                            drawRailing(ctx, el as ArchElement, false);
                        }
                    });
                    ctx.restore();
                }
            }
          else if (editorState.activeTool === 'gridline') {
            ctx.save();
            ctx.strokeStyle = APP_COLORS.primary;
            ctx.setLineDash([15, 6, 3, 6]);
            ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
            ctx.restore();
            const bubbleRad = 14;
            const nextLabel = getNextGridLabel(project.elements, dragStart, lastMousePos);
            [p1, p2].forEach(pt => {
                ctx.beginPath(); ctx.arc(pt.x, pt.y, bubbleRad, 0, Math.PI*2); ctx.fillStyle = APP_COLORS.background; ctx.fill();
                ctx.strokeStyle = APP_COLORS.primary; ctx.lineWidth = 1; ctx.stroke();
                ctx.fillStyle = '#0f172a'; ctx.font = 'bold 11px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(nextLabel, pt.x, pt.y + 0.5);
            });
          }
          else if (editorState.activeTool === 'ellipse') { ctx.beginPath(); ctx.ellipse((p1.x+p2.x)/2, (p1.y+p2.y)/2, Math.abs(p2.x-p1.x)/2, Math.abs(p2.y-p1.y)/2, 0, 0, Math.PI*2); ctx.stroke(); }
          else if (editorState.activeTool === 'arc') { const cp = worldToScreen(getFlowyControlPoint(dragStart, lastMousePos, project.elements)); ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y); ctx.stroke(); }
          else { ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); } ctx.setLineDash([]);
          const len = Math.sqrt((lastMousePos.x-dragStart.x)**2+(lastMousePos.y-dragStart.y)**2); const label = formatDimension(len, editorState.unitSystem); const sPos = worldToScreen(lastMousePos); ctx.save(); ctx.font = 'bold 12px JetBrains Mono, monospace'; const tw = ctx.measureText(label).width; ctx.fillStyle = APP_COLORS.background; ctx.fillRect(sPos.x+10, sPos.y-25, tw+10, 20); ctx.strokeStyle = APP_COLORS.primary; ctx.strokeRect(sPos.x+10, sPos.y-25, tw+10, 20); ctx.fillStyle = APP_COLORS.primary; ctx.fillText(label, sPos.x+15, sPos.y-11); ctx.restore();
        }
    }
    
    // --- GHOST PREVIEW LOGIC ---
    const isPlacing = placementTools.has(editorState.activeTool);
    if (isPlacing && !isDrawing && !isDragging && !isRotating && !activeGrip && !isMiddlePanning) {
        const preset = editorState.activePreset || {};
        const activeTool = editorState.activeTool; // Extract for narrowing
        const defaultW = activeTool === 'column' ? 0.45 : 1;
        const ghostEl: Partial<ArchElement> = {
            id: 'ghost',
            type: activeTool as ElementType, // Explicit cast to ElementType
            width: preset.width || defaultW,
            depth: preset.depth || defaultW,
            shape: preset.shape as any || (activeTool === 'column' ? 'rect' : undefined),
            subType: preset.subType,
            label: preset.label,
            height: preset.height,
            seatsCount: preset.seatsCount,
            bedPillows: preset.bedPillows,
            pos: lastMousePos,
            rotation: 0,
        };

        const isWallHosted = ['door', 'window', 'wall-opening'].includes(activeTool);
        const isFreestandingWithAlign = ['furniture', 'fixture', 'counter', 'column'].includes(activeTool);

        if (isWallHosted) {
            const near = findNearestWall(lastMousePos);
            if (near && near.dist < 2.0) {
                ghostEl.pos = near.point;
                ghostEl.rotation = near.angle;
                const w = near.wall;
                if (w && w.p1 && w.p2) {
                    const dx = w.p2.x - w.p1.x; const dy = w.p2.y - w.p1.y;
                    const cross = dx * (lastMousePos.y - w.p1.y) - dy * (lastMousePos.x - w.p1.x);
                    ghostEl.facingFlipped = cross < 0;
                }
            } else {
                ghostEl.pos = undefined; // Don't draw if not near a wall
            }
        } else if (isFreestandingWithAlign) {
            const placement = resolveInteriorPlacement(lastMousePos, preset, activeTool);
            ghostEl.pos = placement.pos;
            ghostEl.rotation = placement.rotation;
            (ghostEl as Partial<ArchElement> & { placementSnapEdge?: InteriorSnapEdge }).placementSnapEdge = placement.snapEdge;
        }
        
        if (ghostEl.pos) {
            if (['furniture', 'fixture', 'counter', 'column'].includes(activeTool)) {
                drawSmartBlock(ctx, ghostEl as ArchElement, true);
            } else if (isWallHosted) {
                drawOpeningGhost(ctx, ghostEl as ArchElement);
            }
        }
    }

    if (editorState.activeTool === 'copy' && copyBasePoint) {
      const p1 = worldToScreen(copyBasePoint), p2 = worldToScreen(lastMousePos); ctx.save(); ctx.strokeStyle = APP_COLORS.primary; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); ctx.restore();
    }
    // --- ROTATION VISUAL FEEDBACK ---
    if (editorState.activeTool === 'rotate' && rotationBasePoint) {
      const pPivot = worldToScreen(rotationBasePoint);
      const pMouse = worldToScreen(lastMousePos);
      
      // Step 1: Selecting reference arm
      if (!isRotating) {
        ctx.save();
        ctx.strokeStyle = APP_COLORS.primary;
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(pPivot.x, pPivot.y); ctx.lineTo(pMouse.x, pMouse.y); ctx.stroke();
        ctx.restore();
      } 
      // Step 2: Rotating
      else if (rotationReferencePoint) {
        const pRef = worldToScreen(rotationReferencePoint);
        let currentAngle = Math.atan2(lastMousePos.y - rotationBasePoint.y, lastMousePos.x - rotationBasePoint.x);
        const startAngle = Math.atan2(rotationReferencePoint.y - rotationBasePoint.y, rotationReferencePoint.x - rotationBasePoint.x);
        
        if (numericBuffer) { 
          const typedDeg = parseFloat(numericBuffer); 
          if (!isNaN(typedDeg)) currentAngle = startAngle + (typedDeg * Math.PI / 180); 
        }
        if (editorState.isOrthoEnabled) { 
          const snap = Math.PI / 4; 
          currentAngle = startAngle + Math.round((currentAngle - startAngle) / snap) * snap; 
        }
        
        const dist = Math.hypot(lastMousePos.x - rotationBasePoint.x, lastMousePos.y - rotationBasePoint.y) || 5;
        const pTarget = worldToScreen({ 
          x: rotationBasePoint.x + Math.cos(currentAngle) * dist, 
          y: rotationBasePoint.y + Math.sin(currentAngle) * dist 
        });

        ctx.save();
        // Draw Pivot
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.arc(pPivot.x, pPivot.y, 4, 0, Math.PI * 2); ctx.fill();
        
        // Draw Reference Arm (Thin dash)
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(pPivot.x, pPivot.y); ctx.lineTo(pRef.x, pRef.y); ctx.stroke();
        
        // Draw Current Arm (Bold dash)
        ctx.strokeStyle = APP_COLORS.primary;
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(pPivot.x, pPivot.y); ctx.lineTo(pTarget.x, pTarget.y); ctx.stroke();
        
        // Draw Angle Arc
        const radius = Math.min(dist * editorState.zoom, 80);
        ctx.beginPath();
        ctx.arc(pPivot.x, pPivot.y, radius, startAngle, currentAngle, (currentAngle < startAngle));
        ctx.stroke();
        
        // Label
        const deltaDeg = (currentAngle - startAngle) * 180 / Math.PI;
        const label = `${deltaDeg.toFixed(1)}°`; 
        const sPos = worldToScreen(lastMousePos); 
        ctx.font = 'bold 12px JetBrains Mono, monospace'; 
        const tw = ctx.measureText(label).width; 
        ctx.fillStyle = APP_COLORS.background; 
        ctx.fillRect(sPos.x + 10, sPos.y - 25, tw + 12, 20); 
        ctx.strokeStyle = APP_COLORS.primary; 
        ctx.strokeRect(sPos.x + 10, sPos.y - 25, tw + 12, 20); 
        ctx.fillStyle = APP_COLORS.primary; 
        ctx.fillText(label, sPos.x + 16, sPos.y - 11);
        ctx.restore();
      }
    }
    if (displayId && !isDrawing && !isRotating) {
       const el = project.elements.find(e => e.id === displayId);
       if (el && (el.p1 && el.p2 || el.type === 'dimension')) { // Expanded to dimensions
         let len = 0;
         if (el.p1 && el.p2) len = Math.sqrt((el.p2.x-el.p1.x)**2+(el.p2.y-el.p1.y)**2);
         let label = formatDimension(len, editorState.unitSystem);
         const sPos = worldToScreen(lastMousePos); ctx.save(); ctx.font = 'bold 12px JetBrains Mono, monospace'; const tw = ctx.measureText(label).width; ctx.fillStyle = APP_COLORS.background; ctx.fillRect(sPos.x+10, sPos.y-25, tw+10, 20); ctx.strokeStyle = APP_COLORS.primary; ctx.strokeRect(sPos.x+10, sPos.y-25, tw+10, 20); ctx.fillStyle = APP_COLORS.primary; ctx.fillText(label, sPos.x+15, sPos.y-11); ctx.restore();
       }
    }
    if (editorState.activeTool === 'split' && !isDrawing) {
       const hit = getHitElement(lastMousePos);
       if (hit && typeof hit !== 'string') {
           const res = findPointOnElement(lastMousePos, hit);
           if (res) {
               const p = worldToScreen(res.point);
               ctx.save();
               ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2;
               ctx.beginPath();
               ctx.arc(p.x, p.y, 6, 0, Math.PI*2);
               ctx.moveTo(p.x - 8, p.y); ctx.lineTo(p.x + 8, p.y);
               ctx.moveTo(p.x, p.y - 8); ctx.lineTo(p.x, p.y + 8);
               ctx.stroke();
               ctx.restore();
           }
       }
    }
    if (marqueeStart && marqueeEnd) { const x = Math.min(marqueeStart.x, marqueeEnd.x), y = Math.min(marqueeStart.y, marqueeEnd.y), w = Math.abs(marqueeStart.x-marqueeEnd.x), h = Math.abs(marqueeStart.y-marqueeEnd.y); ctx.save(); const isCrossing = marqueeEnd.x < marqueeStart.x; if (isCrossing) { ctx.fillStyle = APP_COLORS.crossingOverlay; ctx.strokeStyle = '#22c55e'; ctx.setLineDash([4, 4]); } else { ctx.fillStyle = APP_COLORS.selectionOverlay; ctx.strokeStyle = APP_COLORS.highlight; } ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h); ctx.restore(); }
    if (isLassoActive && lassoPoints.length >= 2) {
      ctx.save();
      const isCrossing = lassoPoints[lassoPoints.length - 1].x < lassoPoints[0].x;
      if (isCrossing) {
        ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
      } else {
        ctx.fillStyle = 'rgba(37, 99, 235, 0.2)';
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.moveTo(lassoPoints[0].x, lassoPoints[0].y);
      for (let i = 1; i < lassoPoints.length; i++) {
        ctx.lineTo(lassoPoints[i].x, lassoPoints[i].y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    
    // Alignment Guides
    if (snapPreview.alignX !== undefined || snapPreview.alignY !== undefined || snapPreview.alignAngled || snapPreview.type === 'parallel' || snapPreview.type === 'perpendicular') {
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = '#22c55e'; 
        ctx.lineWidth = 1;
        const p = worldToScreen(snapPreview.point);
        const canvas = canvasRef.current;
        if (canvas) {
            if (snapPreview.alignX !== undefined) {
                ctx.beginPath(); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, canvas.height); ctx.stroke();
            }
            if (snapPreview.alignY !== undefined) {
                ctx.beginPath(); ctx.moveTo(0, p.y); ctx.lineTo(canvas.width, p.y); ctx.stroke();
            }
            if (snapPreview.alignAngled) {
                const s1 = worldToScreen(snapPreview.alignAngled);
                const dx = p.x - s1.x; const dy = p.y - s1.y;
                const len = Math.max(canvas.width, canvas.height) * 2;
                ctx.beginPath(); ctx.moveTo(p.x - dx * len, p.y - dy * len); ctx.lineTo(p.x + dx * len, p.y + dy * len); ctx.stroke();
            }
            if ((snapPreview.type === 'parallel' || snapPreview.type === 'perpendicular') && snapPreview.refSegment && dragStart) {
                const s1 = worldToScreen(dragStart);
                const dx = p.x - s1.x; const dy = p.y - s1.y;
                const len = Math.max(canvas.width, canvas.height) * 2;
                ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(p.x + dx * len, p.y + dy * len); ctx.stroke();
                
                // Draw reference highlight
                ctx.save();
                ctx.strokeStyle = '#22c55e';
                ctx.lineWidth = 2;
                ctx.setLineDash([2, 2]);
                const rp1 = worldToScreen(snapPreview.refSegment.p1);
                const rp2 = worldToScreen(snapPreview.refSegment.p2);
                ctx.beginPath(); ctx.moveTo(rp1.x, rp1.y); ctx.lineTo(rp2.x, rp2.y); ctx.stroke();
                ctx.restore();
            }
        }
        if (snapPreview.alignPts) {
            ctx.fillStyle = '#22c55e';
            snapPreview.alignPts.forEach(pt => {
                const spt = worldToScreen(pt);
                ctx.beginPath(); ctx.arc(spt.x, spt.y, 4 / (editorState.zoom / 15), 0, Math.PI * 2); ctx.fill();
            });
        }
        ctx.restore();
    }

    // Draw Acquired Tracking Points (Subtle small green crosses)
    if (acquiredPoints.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1.5;
      acquiredPoints.forEach(pt => {
        const spt = worldToScreen(pt);
        ctx.beginPath();
        ctx.moveTo(spt.x - 4, spt.y);
        ctx.lineTo(spt.x + 4, spt.y);
        ctx.moveTo(spt.x, spt.y - 4);
        ctx.lineTo(spt.x, spt.y + 4);
        ctx.stroke();
      });
      ctx.restore();
    }

    if (snapPreview.type) { 
      const p = worldToScreen(snapPreview.point); ctx.save(); ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2; ctx.beginPath(); 
      if (snapPreview.type === 'endpoint') { ctx.strokeRect(p.x-5, p.y-5, 10, 10); } 
      else if (snapPreview.type === 'midpoint') { ctx.beginPath(); ctx.moveTo(p.x, p.y - 4); ctx.lineTo(p.x - 4, p.y + 3); ctx.lineTo(p.x + 4, p.y + 3); ctx.closePath(); ctx.stroke(); } 
      else if (snapPreview.type === 'intersection') { ctx.moveTo(p.x-5,p.y-5);ctx.lineTo(p.x+5,p.y+5);ctx.moveTo(p.x+5,p.y-5);ctx.lineTo(p.x-5,p.y+5); ctx.stroke(); } 
      else if (snapPreview.type === 'wall-path') { 
          ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.stroke();
          ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
      }
      else if (snapPreview.type === 'grid') { ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 1; ctx.setLineDash([]); ctx.strokeRect(p.x-4, p.y-4, 8, 8); }
      else if (snapPreview.type === 'parallel') {
          ctx.strokeStyle = '#22c55e';
          ctx.beginPath();
          ctx.moveTo(p.x - 6, p.y - 2); ctx.lineTo(p.x + 2, p.y - 6);
          ctx.moveTo(p.x - 2, p.y + 6); ctx.lineTo(p.x + 6, p.y + 2);
          ctx.stroke();
      }
      else if (snapPreview.type === 'perpendicular') {
          ctx.strokeStyle = '#22c55e';
          ctx.beginPath();
          ctx.moveTo(p.x - 6, p.y); ctx.lineTo(p.x + 6, p.y);
          ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 6);
          ctx.stroke();
          ctx.strokeRect(p.x, p.y - 4, 4, 4);
      }
      ctx.restore(); 
    }

    if (screenMousePos && !isMiddlePanning && !isMiddleRotating && editorState.activeTool !== 'pan') {
      ctx.save();
      // Use cursor: none reliably when crosshair is active
      if (canvasRef.current && canvasRef.current.style.cursor !== 'none') {
        canvasRef.current.style.cursor = 'none';
      }

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      const cx = screenMousePos.x;
      const cy = screenMousePos.y;
      
      // Crosshair lines
      ctx.beginPath();
      ctx.moveTo(cx - 18, cy);
      ctx.lineTo(cx + 18, cy);
      ctx.moveTo(cx, cy - 18);
      ctx.lineTo(cx, cy + 18);
      ctx.stroke();
      
      // Pickbox selection square (using precise and compact dashes for sharp high-density CAD custom dotted square look)
      ctx.beginPath();
      ctx.setLineDash([1, 1]);
      ctx.strokeRect(cx - 5.5, cy - 5.5, 11, 11);
      ctx.restore();
    } else if (canvasRef.current && canvasRef.current.style.cursor === 'none') {
       // Reset cursor if tool is pan or it's otherwise not drawing crosshairs
       canvasRef.current.style.cursor = '';
    }
  }, [project.elements, editorState, isDrawing, dragStart, lastMousePos, worldToScreen, snapPreview, marqueeStart, marqueeEnd, isLassoActive, lassoPoints, getWallPolygon, hoveredElementId, copyBasePoint, isRotating, rotationBasePoint, numericBuffer, findNearestWall, resolveInteriorPlacement, tabState.hoverId, drawOpeningGhost, isMiddlePanning, screenMousePos, acquiredPoints, placingImportedElements, rasterUnderlay, rasterUnderlayImageVersion]);

  useImperativeHandle(ref, () => ({
    exportVectorPdf: async (options: VectorPdfExportOptions) => {
      const activeLevel = project.levels.find(level => level.id === activeLevelId);
      const activeOrder = activeLevel?.order ?? 0;
      const levelAboveId = project.levels.find(level => level.order === activeOrder + 1)?.id;
      const levelBelowId = project.levels.find(level => level.order === activeOrder - 1)?.id;

      const exportElements = project.elements.filter(el => {
        const layer = el.layer ? project.layers?.find(item => item.name === el.layer) : undefined;
        if (layer && !layer.visible && el.type !== 'gridline') return false;

        const isGlobalType = ['gridline', 'zone', 'urban-block', 'parcel', 'road', 'landscape', 'water-body', 'building-mass', 'elevation-marker'].includes(el.type);
        if (isGlobalType || !el.levelId || el.levelId === activeLevelId) return true;
        if (el.type === 'stair' && (el.levelId === levelAboveId || el.levelId === levelBelowId)) return true;
        if (['wall', 'door', 'window', 'wall-opening', 'floor', 'ceiling', 'column'].includes(el.type)) {
          if (editorState.showLevelAbove && el.levelId === levelAboveId) return true;
          if (editorState.showLevelBelow && el.levelId === levelBelowId) return true;
        }
        return false;
      });

      const boundsPoints: Point[] = [];
      exportElements.forEach(el => {
        [el.p1, el.p2, el.p3, el.p4, el.controlPoint].forEach(point => {
          if (point) boundsPoints.push(point);
        });
        el.boundary?.forEach(point => boundsPoints.push(point));
        if (el.pos) {
          const halfWidth = Math.max(el.width || 0, el.thickness || 0, 0.5) / 2;
          const halfDepth = Math.max(el.depth || 0, el.thickness || 0, 0.5) / 2;
          boundsPoints.push(
            { x: el.pos.x - halfWidth, y: el.pos.y - halfDepth },
            { x: el.pos.x + halfWidth, y: el.pos.y + halfDepth }
          );
        }
      });

      if (boundsPoints.length === 0) {
        throw new Error('There is no visible 2D view geometry to export.');
      }

      const screenPoints: Point[] = boundsPoints.map(point => worldToScreen(point));
      const minX = Math.min(...screenPoints.map(point => point.x));
      const maxX = Math.max(...screenPoints.map(point => point.x));
      const minY = Math.min(...screenPoints.map(point => point.y));
      const maxY = Math.max(...screenPoints.map(point => point.y));
      const screenCenter = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };

      const pageWidth = options.sheetWidthMm;
      const pageHeight = options.sheetHeightMm;
      const margin = Math.max(0, Math.min(options.marginMm, Math.min(pageWidth, pageHeight) / 3));
      const mmPerScreenPixel = (1000 / options.scale) / editorState.zoom;
      const styleMmPerScreenPixel = (1000 / PDF_STYLE_REFERENCE_SCALE) / editorState.zoom;
      const vectorContext = new VectorPdfCanvasContext(
        pageWidth,
        pageHeight,
        [1, 0, 0, 1, 0, 0],
        styleMmPerScreenPixel,
      );
      vectorContext.beginPath();
      vectorContext.rect(margin, margin, pageWidth - margin * 2, pageHeight - margin * 2);
      vectorContext.clip();
      vectorContext.setTransform(
        mmPerScreenPixel,
        0,
        0,
        mmPerScreenPixel,
        pageWidth / 2 - screenCenter.x * mmPerScreenPixel,
        pageHeight / 2 - screenCenter.y * mmPerScreenPixel,
      );

      render({
        context: vectorContext as unknown as CanvasRenderingContext2D,
        canvas: {
          width: pageWidth / mmPerScreenPixel,
          height: pageHeight / mmPerScreenPixel,
        },
        isExport: true,
        wallBorderScreenPx: CANVAS_WALL_BORDER_PX * (options.scale / PDF_STYLE_REFERENCE_SCALE),
      });

      const cleanName = (options.fileName || project.name || 'plan')
        .replace(/[^a-z0-9-_]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'plan';
      const bytes = vectorContext.toPdfBytes(project.name || 'Vector Plan');
      downloadVectorPdf(bytes, `${cleanName}.pdf`);
    },
    exportVectorDxf: async (fileName?: string) => {
      const activeLevel = project.levels.find(level => level.id === activeLevelId);
      const activeOrder = activeLevel?.order ?? 0;
      const levelAboveId = project.levels.find(level => level.order === activeOrder + 1)?.id;
      const levelBelowId = project.levels.find(level => level.order === activeOrder - 1)?.id;
      const hasVisibleGeometry = project.elements.some(el => {
        const layer = el.layer ? project.layers?.find(item => item.name === el.layer) : undefined;
        if (layer && !layer.visible && el.type !== 'gridline') return false;
        const isGlobalType = ['gridline', 'zone', 'urban-block', 'parcel', 'road', 'landscape', 'water-body', 'building-mass', 'elevation-marker'].includes(el.type);
        if (isGlobalType || !el.levelId || el.levelId === activeLevelId) return true;
        if (el.type === 'stair' && (el.levelId === levelAboveId || el.levelId === levelBelowId)) return true;
        if (['wall', 'door', 'window', 'wall-opening', 'floor', 'ceiling', 'column'].includes(el.type)) {
          if (editorState.showLevelAbove && el.levelId === levelAboveId) return true;
          if (editorState.showLevelBelow && el.levelId === levelBelowId) return true;
        }
        return false;
      });
      if (!hasVisibleGeometry) throw new Error('There is no visible 2D plan geometry to export.');

      // Cancel the viewport transform so the established canvas renderer writes
      // directly to standard 1:1 DXF model space in the selected project units.
      const angle = -((editorState.canvasAngle || 0) * Math.PI) / 180;
      const exportUnitScale = editorState.unitSystem === 'imperial' ? 39.37007874015748 : 1;
      const scale = exportUnitScale / editorState.zoom;
      const a = scale * Math.cos(angle);
      const b = scale * Math.sin(angle);
      const c = -scale * Math.sin(angle);
      const d = scale * Math.cos(angle);
      const e = -(a * editorState.offset.x + c * editorState.offset.y);
      const f = -(b * editorState.offset.x + d * editorState.offset.y);
      const sourceCanvas = canvasRef.current;
      const vectorContext = new VectorDxfCanvasContext(
        [a, b, c, d, e, f],
        sourceCanvas?.width || 100000,
        sourceCanvas?.height || 100000,
        project.layers || [],
        editorState.unitSystem,
      );

      render({
        context: vectorContext as unknown as CanvasRenderingContext2D,
        canvas: vectorContext.canvas,
        isExport: true,
        wallBorderScreenPx: CANVAS_WALL_BORDER_PX,
      });

      const cleanName = (fileName || project.name || 'plan')
        .replace(/[^a-z0-9-_]+/gi, '-')
        .replace(/^-+|-+$/g, '') || 'plan';
      downloadVectorDxf(vectorContext.toDxfString(), `${cleanName}.dxf`);
    },
  }), [activeLevelId, editorState, project, render, worldToScreen]);
  
  // Load Site Map Image
  useEffect(() => {
    if (project.siteMap?.url) {
      const img = new Image();
      img.src = project.siteMap.url;
      img.onload = () => {
        mapImageRef.current = img;
        render();
      };
      img.onerror = () => {
        console.error("Failed to load site map image");
        mapImageRef.current = null;
      };
    } else {
      mapImageRef.current = null;
      render();
    }
  }, [project.siteMap?.url, render]);

  useEffect(() => {
    if (!rasterUnderlay?.imageUrl) {
      rasterUnderlayImageRef.current = null;
      setRasterUnderlayImageVersion(version => version + 1);
      return;
    }
    const image = new Image();
    image.onload = () => {
      rasterUnderlayImageRef.current = image;
      setRasterUnderlayImageVersion(version => version + 1);
    };
    image.onerror = () => {
      rasterUnderlayImageRef.current = null;
      setRasterUnderlayImageVersion(version => version + 1);
    };
    image.src = rasterUnderlay.imageUrl;
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [rasterUnderlay?.imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;

    const resizeObserver = new ResizeObserver((entries) => {
      window.requestAnimationFrame(() => {
        if (!canvasRef.current) return;
        const rect = parent.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        render();
      });
    });

    resizeObserver.observe(parent);

    const rect = parent.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    render();

    return () => {
      resizeObserver.disconnect();
    };
  }, [render]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (placingImportedElements && placingImportedElements.length > 0) {
      if (e.button === 0) {
        // Left click: Drop/place the elements!
        const center = getElementsCenter(placingImportedElements);
        const delta = { x: lastMousePos.x - center.x, y: lastMousePos.y - center.y };
        const finalElements = translateElements(placingImportedElements, delta);
        onDropImportedElements?.(finalElements);
        e.preventDefault();
        e.stopPropagation();
        return;
      } else if (e.button === 2) {
        // Right click: Cancel placement!
        onCancelImportedElements?.();
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    if (e.button === 1) { 
      e.preventDefault(); 
      if (e.shiftKey && !isElevationCanvas) {
        setIsMiddleRotating(true);
        panStartScreen.current = getCanvasCoords(e);
        panStartOffset.current = { x: editorState.canvasAngle || 0, y: 0 };
      } else {
        setIsMiddlePanning(true); 
        panStartScreen.current = getCanvasCoords(e); 
        panStartOffset.current = { ...editorState.offset }; 
      }
      return; 
    }
    const raw = getCanvasCoords(e), world = screenToWorld(raw), snap = applyAdvancedSnapping(world, (isDrawing || activeGrip || isRotating) ? (dragStart || undefined) : undefined), snapped = snap.point; setMouseDownPos(world);
    
    // --- HIGHER PRIORITY ROTATE TOOL ---
    if (editorState.activeTool === 'rotate') {
      // Auto-select if nothing selected
      if (editorState.selectedIds.length === 0) {
        const hit = getHitElement(world);
        if (hit && typeof hit !== 'string' && hit.type !== 'elevation-marker') {
          onSelectionChange([hit.id]);
          // Continue to set pivot on same click for better UX
        } else {
          return; // Clicked air with nothing selected, do nothing
        }
      }

      if (!rotationBasePoint) { 
        setRotationBasePoint(snapped); 
      } 
      else if (!rotationReferencePoint) {
        setRotationReferencePoint(snapped);
        setIsRotating(true); 
        originalElementsDuringRotate.current = JSON.parse(JSON.stringify(project.elements)); 
        setDragStart(snapped); 
      }
      else { 
        if (dragPreviewElements) {
          onElementsCommit(dragPreviewElements);
          setDragPreviewElements(null);
        } else {
          onElementsCommit(project.elements);
        }
        setIsRotating(false); 
        setRotationBasePoint(null); 
        setRotationReferencePoint(null);
        originalElementsDuringRotate.current = null; 
        setNumericBuffer(''); 
      }
      return;
    }

    if (editorState.activeTool === 'pan' || e.button === 1) { setIsDragging(true); setDragStart(raw); return; }

    if (editorState.activeTool === 'split') {
        const hit = getHitElement(world);
        if (hit && typeof hit !== 'string') {
            const result = findPointOnElement(world, hit);
            if (result) {
                const updatedElements = performSplitOnElement(project.elements, hit.id, result.t, result.point);
                onElementsChange(updatedElements);
                onElementsCommit(updatedElements);
            }
        }
        return;
    }
    
    // Check Resize Handles First
    const hitInfo = getHitElement(world);
    if (typeof hitInfo === 'string' && hitInfo.startsWith('HANDLE:')) {
        const parts = hitInfo.split(':');
        const sourceElements = dragPreviewElements || project.elements;
        const el = sourceElements.find(e => e.id === parts[1]);
        if (el && (el.pos || el.p1 || (el.boundary && el.boundary.length > 0))) { // Ensure position exists
            // For stairs, use p1 as anchor if pos is missing
            const anchor = el.pos || el.p1 || el.boundary![0];
            const rectW = el.p1 && el.p2 ? Math.abs(el.p2.x - el.p1.x) : undefined;
            const rectD = el.p1 && el.p2 ? Math.abs(el.p2.y - el.p1.y) : undefined;
            setActiveHandle({
              id: parts[1],
              key: parts[2],
              originalSize: { w: el.width || rectW || 1, d: el.depth || el.height || rectD || 1 },
              originalPos: anchor,
              rotation: el.rotation || 0,
              originalBoundary: el.boundary ? el.boundary.map(point => ({ ...point })) : undefined,
              originalUArmDepths: isUShapedInteriorElement(el)
                ? {
                    left: el.symbolLeftArmDepth || el.depth || 1,
                    right: el.symbolRightArmDepth || el.depth || 1,
                  }
                : undefined,
            });
            setIsDraggingHandle(true); setDragStart(world); return;
        }
    }

    // Furniture Placement (Single Click)
    const activeTool = editorState.activeTool; // Assign to const to aid TS narrowing
    switch (activeTool) {
      case 'room': {
        if (isElevationCanvas) {
          const newEl: ArchElement = {
            id: crypto.randomUUID(),
            type: 'label',
            pos: snapped,
            label: 'Elevation Note',
            levelId: activeLevelId,
            viewId: editorState.drawingView,
            textFontSize: 10,
            textFontFamily: 'Inter',
            textBold: true,
            textAlignment: 'center',
            color: '#1e293b',
          };
          const updated = [...project.elements, newEl];
          onElementsChange(updated);
          onElementsCommit(updated);
          onSelectionChange([newEl.id]);
          return;
        }
        const isImperial = editorState.unitSystem === 'imperial';
        const existingRooms = project.elements.filter(el => el.type === 'room');
        const nextRoomNum = existingRooms.length + 1;
        const nextRoomName = `Space ${String(nextRoomNum).padStart(2, '0')}`;
        
        // Find if placed inside an enclosed space
        const enc = getEnclosedSpace(snapped.x, snapped.y, project.elements);
        const isEnclosed = enc.enclosed;
        const width = isEnclosed ? enc.width : 5.3;
        const depth = isEnclosed ? enc.depth : 6.0;
        
        // Detailed Dimensions toggle default remains OFF if not enclosed
        const roomNameOnly = !isEnclosed;
        const labelText = generateRoomLabel(nextRoomName, width, depth, editorState.unitSystem, roomNameOnly, false);

        const newEl: ArchElement = {
          id: crypto.randomUUID(),
          type: 'room',
          pos: isEnclosed ? enc.center : snapped,
          width,
          depth,
          rotation: 0,
          label: labelText,
          levelId: activeLevelId,
          textFontSize: 6,
          textFontFamily: 'Inter',
          textBold: true,
          textItalic: false,
          textUnderline: false,
          textAlignment: 'center',
          color: '#1e293b',
          roomNameOnly,
          roomShowArea: false,
          // Secondary dimension/area styles: bold = false by default
          dimFontSize: 5,
          dimFontFamily: '"JetBrains Mono", monospace',
          dimBold: false, // bold only for space name and not dimension/area
          dimItalic: false,
          dimUnderline: false,
          dimColor: '#64748b'
        };
        
        const updated = [...project.elements, newEl];
        onElementsChange(updated);
        onElementsCommit(updated);
        onSelectionChange([newEl.id]);
        return;
      }
      case 'column':
      case 'furniture':
      case 'fixture':
      case 'counter': {
        const preset = editorState.activePreset || {};
        const defaultW = activeTool === 'column' ? 0.45 : 1;
        const placement = resolveInteriorPlacement(snapped, preset, activeTool);
        const newEl: ArchElement = {
          id: crypto.randomUUID(), type: activeTool as ElementType, pos: placement.pos,
          width: preset.width || defaultW, depth: preset.depth || defaultW, shape: preset.shape as any || (activeTool === 'column' ? 'rect' : undefined),
          subType: preset.subType, label: preset.label, rotation: placement.rotation, elevation: 0, height: preset.height,
          assetId: preset.assetId, sourceType: preset.sourceType, sourceFileType: preset.sourceFileType,
          sourceFileName: preset.sourceFileName, revitFamilyName: preset.revitFamilyName,
          revitTypeName: preset.revitTypeName, classname: preset.classname, displayName: preset.displayName,
          userCategory: preset.userCategory, isImportedAsset: preset.isImportedAsset,
          nativeCatalogAsset: preset.nativeCatalogAsset, model3D: preset.model3D, planView2D: preset.planView2D,
          elevationViews: preset.elevationViews, thumbnail: preset.thumbnail, dimensions: preset.dimensions,
          materials: preset.materials, metadata: preset.metadata, importTimestamp: preset.importTimestamp,
          importVersion: preset.importVersion,
          category: preset.category, iconType: preset.iconType,
          customMeshData: preset.customMeshData, bimMetadata: preset.bimMetadata,
          seatsCount: preset.seatsCount, bedPillows: preset.bedPillows,
          levelId: activeLevelId
        };
        const updated = [...project.elements, newEl];
        onElementsChange(updated);
        onElementsCommit(updated);
        onSelectionChange([newEl.id]);
        return;
      }
    }

    if (editorState.activeTool === 'floor' || editorState.activeTool === 'ceiling') {
      const hit = getHitElement(world);
      if (hit && typeof hit !== 'string' && ['wall','line','arc','circle','ellipse'].includes(hit.type)) {
        setEditorState(s => ({
          ...s,
          tempBoundaryIds: s.tempBoundaryIds?.includes(hit.id)
            ? s.tempBoundaryIds.filter(id => id !== hit.id)
            : [...(s.tempBoundaryIds || []), hit.id]
        }));
      }
      return;
    }

    // --- MULTI-POINT DRAWING LOGIC (Stair L/U, Procedural Polygon, Dimension) ---
    if (['stair', 'dimension'].includes(editorState.activeTool)) {
        const preset = editorState.activePreset;
        const subType = preset?.subType || 'linear';
        
        if (editorState.activeTool === 'stair' && (subType === 'L' || subType === 'U')) {
            const newBuffer = [...(editorState.multiPointBuffer || []), snapped];
            const maxPoints = subType === 'L' ? 3 : 4;
            
            if (newBuffer.length >= maxPoints) {
                const newStair: ArchElement = {
                    id: crypto.randomUUID(), type: 'stair',
                    p1: newBuffer[0], p2: newBuffer[1],
                    p3: newBuffer[2], p4: newBuffer[3],
                    width: preset?.width || 1.05, subType,
                    levelId: activeLevelId
                };
                onElementsChange([...project.elements, newStair]);
                onElementsCommit([...project.elements, newStair]);
                setEditorState(s => ({ ...s, multiPointBuffer: [] }));
                setIsDrawing(false);
            } else {
                setEditorState(s => ({ ...s, multiPointBuffer: newBuffer }));
                setIsDrawing(true);
            }
            return;
        }

        if (editorState.activeTool === 'dimension') {
            const newBuffer = [...(editorState.multiPointBuffer || []), snapped];
            if (newBuffer.length === 3) {
                const newDim: ArchElement = {
                    id: crypto.randomUUID(), 
                    type: 'dimension',
                    p1: newBuffer[0], 
                    p2: newBuffer[1],
                    p3: newBuffer[2],
                    levelId: activeLevelId,
                    dimensionLineThickness: 0.8,
                    textFontSize: 4,
                    textBold: false,
                    dimensionShowExtension: true
                };
                onElementsChange([...project.elements, newDim]);
                onElementsCommit([...project.elements, newDim]);
                setEditorState(s => ({ ...s, multiPointBuffer: [] }));
                setIsDrawing(false);
            } else {
                setEditorState(s => ({ ...s, multiPointBuffer: newBuffer }));
                setIsDrawing(true);
            }
            return;
        }
    }

    const activeDoor = project.elements.find(e => editorState.selectedIds.includes(e.id) && e.type === 'door' && e.pos) || 
                       project.elements.find(e => hoveredIds.has(e.id) && e.type === 'door' && e.pos);
    if (activeDoor && activeDoor.pos) {
      const nearWall = findNearestWall(activeDoor.pos); const wallThickness = (nearWall?.wall.thickness || WALL_THICKNESS_DEFAULT); const tS = wallThickness; const btnWWorld = FLIP_CONTROL_HIT_SIZE_PX / editorState.zoom, btnHWorld = FLIP_CONTROL_HIT_SIZE_PX / editorState.zoom, offsetWorld = FLIP_CONTROL_EDGE_GAP_PX / editorState.zoom;
      const dx = world.x - activeDoor.pos.x, dy = world.y - activeDoor.pos.y, rad = -(activeDoor.rotation || 0) * Math.PI / 180;
      const localX = dx * Math.cos(rad) - dy * Math.sin(rad), localY = dx * Math.sin(rad) + dy * Math.cos(rad);
      const checkPill = (y: number) => (localX > -btnWWorld / 2 && localX < btnWWorld / 2 && localY > y - btnHWorld / 2 && localY < y + btnHWorld / 2);
      const facingBtnClicked = checkPill(-tS / 2 - offsetWorld), handBtnClicked = checkPill(tS / 2 + offsetWorld);
      if (facingBtnClicked || handBtnClicked) {
        const updated = project.elements.map(item => item.id === activeDoor.id ? (facingBtnClicked ? { ...item, facingFlipped: !item.facingFlipped } : { ...item, isFlipped: !item.isFlipped }) : item);
        onElementsChange(updated);
        onElementsCommit(updated);
        return;
      }
    }
    const activeInterior = project.elements.find(e => editorState.selectedIds.includes(e.id) && ['furniture', 'fixture', 'counter', 'column'].includes(e.type) && e.pos) ||
                           project.elements.find(e => hoveredIds.has(e.id) && ['furniture', 'fixture', 'counter', 'column'].includes(e.type) && e.pos);
    if (activeInterior && activeInterior.pos) {
      const w = activeInterior.width || 1;
      const d = activeInterior.depth || 1;
      const btnWWorld = FLIP_CONTROL_HIT_SIZE_PX / editorState.zoom;
      const btnHWorld = FLIP_CONTROL_HIT_SIZE_PX / editorState.zoom;
      const offsetWorld = FLIP_CONTROL_EDGE_GAP_PX / editorState.zoom;
      const dx = world.x - activeInterior.pos.x;
      const dy = world.y - activeInterior.pos.y;
      const rad = -(activeInterior.rotation || 0) * Math.PI / 180;
      const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
      const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
      const hitBox = (cx: number, cy: number) => (
        localX > cx - btnWWorld / 2 && localX < cx + btnWWorld / 2 &&
        localY > cy - btnHWorld / 2 && localY < cy + btnHWorld / 2
      );
      const horizontalBtnClicked = hitBox(0, -d / 2 - offsetWorld);
      const verticalBtnClicked = hitBox(w / 2 + offsetWorld, 0);
      if (horizontalBtnClicked || verticalBtnClicked) {
        const updated = project.elements.map(item => {
          if (item.id !== activeInterior.id) return item;
          return horizontalBtnClicked
            ? { ...item, isFlipped: !item.isFlipped }
            : { ...item, facingFlipped: !item.facingFlipped };
        });
        onElementsChange(updated);
        onElementsCommit(updated);
        return;
      }
    }
    if (editorState.activeTool === 'copy') {
      if (editorState.selectedIds.length === 0) { const hit = getHitElement(world); if (hit && typeof hit !== 'string' && hit.type !== 'elevation-marker') onSelectionChange([hit.id]); return; }
      if (!copyBasePoint) { setCopyBasePoint(snapped); }
      else {
        const dx = snapped.x - copyBasePoint.x, dy = snapped.y - copyBasePoint.y; const offsetPoint = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
        const selected = project.elements.filter(el => editorState.selectedIds.includes(el.id));
        const newElements: ArchElement[] = []; const idMap = new Map<string, string>();
        
        // Group re-mapping logic for Copying
        const groupMap = new Map<string, string>();
        
        selected.forEach(el => {
          if (el.type === 'elevation-marker') return;
          if (isElevationGreyStructure(el)) return;
          const isOpening = ['door', 'window', 'wall-opening'].includes(el.type);
          if (isOpening && el.hostWallId) return;
          
          const newId = crypto.randomUUID(); idMap.set(el.id, newId);
          
          let newGroupId = el.groupId;
          if (el.groupId) {
            if (!groupMap.has(el.groupId)) {
              groupMap.set(el.groupId, crypto.randomUUID());
            }
            newGroupId = groupMap.get(el.groupId);
          }

          newElements.push({ 
            ...translateCurveMetadata(el, dx, dy), 
            id: newId,
            groupId: newGroupId,
            pos: el.pos ? offsetPoint(el.pos) : el.pos, 
            p1: el.p1 ? offsetPoint(el.p1) : el.p1, 
            p2: el.p2 ? offsetPoint(el.p2) : el.p2, 
            p3: el.p3 ? offsetPoint(el.p3) : el.p3,
            p4: el.p4 ? offsetPoint(el.p4) : el.p4,
            controlPoint: el.controlPoint ? offsetPoint(el.controlPoint) : el.controlPoint, 
            boundary: el.boundary ? el.boundary.map(offsetPoint) : undefined, 
            levelId: activeLevelId 
          });
        });
        project.elements.forEach(el => {
          const isOpening = el.type === 'door' || el.type === 'window' || el.type === 'wall-opening';
          if (isOpening && el.hostWallId && idMap.has(el.hostWallId)) { 
            const hostWall = project.elements.find(w => w.id === el.hostWallId);
            if (hostWall) {
              const checkedT = getClampedTForOpening(hostWall, el.width || 1, el.hostT || 0.5, [el.id]);
              if (checkedT !== null) {
                newElements.push({ ...el, id: crypto.randomUUID(), hostWallId: idMap.get(el.hostWallId)!, hostT: checkedT, levelId: activeLevelId });
              }
            }
          }
        });
        const finalElements = [...project.elements, ...newElements];
        onElementsChange(finalElements); 
        onElementsCommit(finalElements);
        setCopyBasePoint(null);
      }
      return;
    }
    if (editorState.activeTool === 'move' && editorState.selectedIds.length > 0) {
      const hit = getHitElement(world); if (!hit || typeof hit === 'string' || !editorState.selectedIds.includes(hit.id)) { setMoveBasePoint(world); return; }
    }
    // FIX: ADD 'stair' AND 'railing' TO THE ALLOWED DRAWING TOOLS
    if (['line', 'rect', 'gridline', 'wall', 'arc', 'ellipse', 'circle', 'stair', 'railing', 'procedural-boundary', 'smart-procedural-boundary', 'auto-procedural-boundary', 'building-mass', 'road', 'landscape', 'water-body'].includes(editorState.activeTool)) {
      if (isDrawing && dragStart) commitDrawing(applyOrtho(snapped, dragStart, e));
      else { setIsDrawing(true); setDragStart(snapped); } return;
    }
    if (editorState.activeTool === 'split') {
      const hit = getHitElement(world); if (hit && typeof hit !== 'string' && hit.p1 && hit.p2) {
        const res = findPointOnElement(snapped, hit); if (res && res.t > 0.05 && res.t < 0.95) {
          const elements = [...project.elements], idx = elements.findIndex(e => e.id === hit.id);
          if (!hit.isCurved && !hit.wallSource) elements.splice(idx, 1, {...hit, id:crypto.randomUUID(), p2:res.point}, {...hit, id:crypto.randomUUID(), p1:res.point});
          onElementsChange(elements);
          onElementsCommit(elements);
        }
      } return;
    }
    if (isElevationCanvas && ['door', 'window', 'wall-opening'].includes(editorState.activeTool)) {
      const openingType = editorState.activeTool as ElementType;
      const wallBodies = project.elements.filter(el => el.type === 'rectangle' && el.subType === 'elevation-wall' && el.p1 && el.p2);
      let best: { wall: ArchElement; dist: number } | null = null;
      wallBodies.forEach(wall => {
        const minX = Math.min(wall.p1!.x, wall.p2!.x);
        const maxX = Math.max(wall.p1!.x, wall.p2!.x);
        const minY = Math.min(wall.p1!.y, wall.p2!.y);
        const maxY = Math.max(wall.p1!.y, wall.p2!.y);
        const dx = snapped.x < minX ? minX - snapped.x : snapped.x > maxX ? snapped.x - maxX : 0;
        const dy = snapped.y < minY ? minY - snapped.y : snapped.y > maxY ? snapped.y - maxY : 0;
        const dist = Math.hypot(dx, dy);
        if (!best || dist < best.dist) best = { wall, dist };
      });
      if (best && best.dist < 1.5) {
        const s3d = { ...DEFAULT_PROJECT_SETTINGS_3D, ...(project.settings3D || {}) };
        const width = editorState.activePreset?.width || (openingType === 'door' ? DOOR_WIDTH_DEFAULT : openingType === 'window' ? WINDOW_WIDTH_DEFAULT : 1.0);
        const height = openingType === 'door'
          ? s3d.doorHeight
          : openingType === 'window'
            ? Math.max(0.2, s3d.windowTopHeight - s3d.windowSillHeight)
            : s3d.wallOpeningHeight;
        const wallMinY = Math.min(best.wall.p1!.y, best.wall.p2!.y);
        const wallMaxY = Math.max(best.wall.p1!.y, best.wall.p2!.y);
        const bottomY = openingType === 'door' ? wallMaxY : Math.max(wallMinY + height, Math.min(wallMaxY, snapped.y + height / 2));
        const topY = Math.max(wallMinY, bottomY - height);
        const x = Math.max(Math.min(snapped.x, Math.max(best.wall.p1!.x, best.wall.p2!.x) - width / 2), Math.min(best.wall.p1!.x, best.wall.p2!.x) + width / 2);
        const newEl: ArchElement = {
          id: crypto.randomUUID(),
          type: 'rectangle',
          sourceType: openingType,
          subType: `elevation-${openingType}`,
          hostWallId: best.wall.id,
          p1: { x: x - width / 2, y: topY },
          p2: { x: x + width / 2, y: bottomY },
          width,
          height,
          color: openingType === 'door' ? '#16a34a' : openingType === 'window' ? '#0284c7' : '#d97706',
          viewId: editorState.drawingView,
          levelId: activeLevelId,
        };
        const updated = [...project.elements, newEl];
        onElementsChange(updated);
        onElementsCommit(updated);
        onSelectionChange([newEl.id]);
      }
      return;
    }

    if (['door', 'window', 'wall-opening'].includes(editorState.activeTool)) {
      const near = findNearestWall(world); if (near && near.dist < 2.0) {
        const wall = near.wall; const width = editorState.activePreset?.width || (editorState.activeTool === 'door' ? DOOR_WIDTH_DEFAULT : (editorState.activeTool === 'window' ? WINDOW_WIDTH_DEFAULT : 1.0));
        const t = getClampedTForOpening(wall, width, norm01(near.t), []);
        if (t === null) return;
        const hostT = isClosedCurveWall(wall) ? norm01(t) : t;
        const s3d = { ...DEFAULT_PROJECT_SETTINGS_3D, ...(project.settings3D || {}) };
        const openingType = editorState.activeTool as ElementType;
        const subType = editorState.activePreset?.subType || '';
        const opening3D = openingType === 'door' ? { elevation: 0, height: s3d.doorHeight } : openingType === 'window' ? { elevation: 0, sillHeight: s3d.windowSillHeight, topHeight: s3d.windowTopHeight, height: (s3d.windowTopHeight - s3d.windowSillHeight) } : { elevation: 0, height: s3d.wallOpeningHeight };
        
        if (['bay', 'angled-bay', 'box-bay', 'curved-bay'].includes(subType) && !isCurvedElement(wall)) {
            const elements = [...project.elements];
            const idx = elements.findIndex(e => e.id === wall.id);
            if (idx === -1) return;
            const dx = wall.p2!.x - wall.p1!.x, dy = wall.p2!.y - wall.p1!.y;
            const L = Math.hypot(dx, dy) || 1;
            if (width >= L * 0.95) { alert("Bay window is too wide for this wall."); return; }
            
            const ux = dx/L, uy = dy/L;
            let nx = world.x - near.point.x, ny = world.y - near.point.y;
            const nLen = Math.hypot(nx, ny);
            if (nLen > 0.05) { nx /= nLen; ny /= nLen; } else { nx = -uy; ny = ux; }
            
            const dt = (width / 2) / L;
            let tLeft = hostT - dt, tRight = hostT + dt;
            if (tLeft < 0) { tLeft = 0; tRight = width / L; }
            if (tRight > 1) { tRight = 1; tLeft = 1 - width / L; }
            
            const pL = { x: wall.p1!.x + dx * tLeft, y: wall.p1!.y + dy * tLeft };
            const pR = { x: wall.p1!.x + dx * tRight, y: wall.p1!.y + dy * tRight };
            const w1id = crypto.randomUUID();
            const w2id = crypto.randomUUID();
            
            let bayWalls: ArchElement[] = [];
            let bayWindows: ArchElement[] = [];
            const D = Math.min(0.8, width * 0.8);
            const type = (subType === 'bay' ? 'angled-bay' : subType);
            
            if (type === 'curved-bay') {
                const bId = crypto.randomUUID();
                bayWalls.push({ ...wall, id: bId, p1: pL, p2: pR, isCurved: true, wallSource: 'arc', controlPoint: { x: (pL.x+pR.x)/2 + nx * D * 2, y: (pL.y+pR.y)/2 + ny * D * 2 } });
                bayWindows.push({ id: crypto.randomUUID(), type: 'window', subType: 'standard', pos: { x: (pL.x+pR.x)/2 + nx * D, y: (pL.y+pR.y)/2 + ny * D }, rotation: Math.atan2(pR.y-pL.y, pR.x-pL.x)*180/Math.PI, width: width * 0.6, hostWallId: bId, hostT: 0.5, ...opening3D, levelId: activeLevelId });
            } else if (type === 'box-bay') {
                const pOutL = { x: pL.x + nx * D, y: pL.y + ny * D }, pOutR = { x: pR.x + nx * D, y: pR.y + ny * D };
                const b1 = { ...wall, id: crypto.randomUUID(), p1: pL, p2: pOutL }, b2 = { ...wall, id: crypto.randomUUID(), p1: pOutL, p2: pOutR }, b3 = { ...wall, id: crypto.randomUUID(), p1: pOutR, p2: pR };
                bayWalls.push(b1, b2, b3);
                bayWindows.push({ id: crypto.randomUUID(), type: 'window', subType: 'standard', pos: { x: (pL.x+pOutL.x)/2, y: (pL.y+pOutL.y)/2 }, rotation: Math.atan2(pOutL.y-pL.y, pOutL.x-pL.x)*180/Math.PI, width: D * 0.6, hostWallId: b1.id, hostT: 0.5, ...opening3D, levelId: activeLevelId });
                bayWindows.push({ id: crypto.randomUUID(), type: 'window', subType: 'standard', pos: { x: (pOutL.x+pOutR.x)/2, y: (pOutL.y+pOutR.y)/2 }, rotation: Math.atan2(pOutR.y-pOutL.y, pOutR.x-pOutL.x)*180/Math.PI, width: width * 0.8, hostWallId: b2.id, hostT: 0.5, ...opening3D, levelId: activeLevelId });
                bayWindows.push({ id: crypto.randomUUID(), type: 'window', subType: 'standard', pos: { x: (pOutR.x+pR.x)/2, y: (pOutR.y+pR.y)/2 }, rotation: Math.atan2(pR.y-pOutR.y, pR.x-pOutR.x)*180/Math.PI, width: D * 0.6, hostWallId: b3.id, hostT: 0.5, ...opening3D, levelId: activeLevelId });
            } else {
                const sq = Math.min(D, width * 0.25);
                const pOutL = { x: pL.x + nx * D + ux * sq, y: pL.y + ny * D + uy * sq }, pOutR = { x: pR.x + nx * D - ux * sq, y: pR.y + ny * D - uy * sq };
                const b1 = { ...wall, id: crypto.randomUUID(), p1: pL, p2: pOutL }, b2 = { ...wall, id: crypto.randomUUID(), p1: pOutL, p2: pOutR }, b3 = { ...wall, id: crypto.randomUUID(), p1: pOutR, p2: pR };
                bayWalls.push(b1, b2, b3);
                bayWindows.push({ id: crypto.randomUUID(), type: 'window', subType: 'standard', pos: { x: (pL.x+pOutL.x)/2, y: (pL.y+pOutL.y)/2 }, rotation: Math.atan2(pOutL.y-pL.y, pOutL.x-pL.x)*180/Math.PI, width: Math.hypot(pOutL.x-pL.x, pOutL.y-pL.y) * 0.6, hostWallId: b1.id, hostT: 0.5, ...opening3D, levelId: activeLevelId });
                bayWindows.push({ id: crypto.randomUUID(), type: 'window', subType: 'standard', pos: { x: (pOutL.x+pOutR.x)/2, y: (pOutL.y+pOutR.y)/2 }, rotation: Math.atan2(pOutR.y-pOutL.y, pOutR.x-pOutL.x)*180/Math.PI, width: Math.hypot(pOutR.x-pOutL.x, pOutR.y-pOutL.y) * 0.8, hostWallId: b2.id, hostT: 0.5, ...opening3D, levelId: activeLevelId });
                bayWindows.push({ id: crypto.randomUUID(), type: 'window', subType: 'standard', pos: { x: (pOutR.x+pR.x)/2, y: (pOutR.y+pR.y)/2 }, rotation: Math.atan2(pR.y-pOutR.y, pR.x-pOutR.x)*180/Math.PI, width: Math.hypot(pR.x-pOutR.x, pR.y-pOutR.y) * 0.6, hostWallId: b3.id, hostT: 0.5, ...opening3D, levelId: activeLevelId });
            }
            
            const newElements = elements.map(e => {
                if (e.id === wall.id) return null; // Remove old wall
                if (e.hostWallId === wall.id && typeof e.hostT === 'number') {
                    if (e.hostT <= tLeft + 0.01) return { ...e, hostWallId: w1id, hostT: tLeft > 0 ? e.hostT / tLeft : 0 };
                    if (e.hostT >= tRight - 0.01) return { ...e, hostWallId: w2id, hostT: tRight < 1 ? (e.hostT - tRight) / (1 - tRight) : 1 };
                    return null; // Delete overlapping openings
                }
                return e;
            }).filter(Boolean) as ArchElement[];
            
            if (Math.hypot(pL.x - wall.p1!.x, pL.y - wall.p1!.y) > 0.02) newElements.push({ ...wall, id: w1id, p2: pL });
            if (Math.hypot(wall.p2!.x - pR.x, wall.p2!.y - pR.y) > 0.02) newElements.push({ ...wall, id: w2id, p1: pR });
            newElements.push(...bayWalls, ...bayWindows);
            onElementsChange(newElements);
            onElementsCommit(newElements);
        } else {
            let facingFlipped = false;
            if (wall && wall.p1 && wall.p2) {
                const dx = wall.p2.x - wall.p1.x;
                const dy = wall.p2.y - wall.p1.y;
                const cross = dx * (world.y - wall.p1.y) - dy * (world.x - wall.p1.x);
                facingFlipped = cross < 0;
            }
            const updated = [ ...project.elements, { id: crypto.randomUUID(), type: openingType, pos: near.point, rotation: near.angle, width, subType, hostWallId: wall.id, hostT: hostT, facingFlipped, ...opening3D, levelId: activeLevelId } ];
            onElementsChange(updated);
            onElementsCommit(updated);
        }
      } return;
    }
    if (editorState.activeTool === 'select' && isTwoClickMarqueeActive) {
      if (marqueeStart && marqueeEnd) {
        const p1W = screenToWorld(marqueeStart), p2W = screenToWorld(marqueeEnd), minX = Math.min(p1W.x, p2W.x), maxX = Math.max(p1W.x, p2W.x), minY = Math.min(p1W.y, p2W.y), maxY = Math.max(p1W.y, p2W.y), isCrossing = marqueeEnd.x < marqueeStart.x;
        const marqueeIds = project.elements.filter(el => { 
          if (el.type === 'ceiling') return false; 
          const points: Point[] = [];
          if (el.pos) points.push(el.pos);
          if (el.p1) points.push(el.p1);
          if (el.p2) points.push(el.p2);
          if (el.p3) points.push(el.p3);
          if (el.p4) points.push(el.p4);
          if (el.controlPoint) points.push(el.controlPoint);
          if (el.boundary) el.boundary.forEach(p => points.push(p));
          
          if (points.length === 0) return false;

          const rX1 = Math.min(...points.map(p => p.x));
          const rX2 = Math.max(...points.map(p => p.x));
          const rY1 = Math.min(...points.map(p => p.y));
          const rY2 = Math.max(...points.map(p => p.y));

          return (rX1 >= minX && rX2 <= maxX && rY1 >= minY && rY2 <= maxY) || 
                 (isCrossing && rX1 < maxX && rX2 > minX && rY1 < maxY && rY2 > minY);
        }).map(el => el.id);
        if (e.shiftKey) onSelectionChange(Array.from(new Set([...(editorState.selectedIds || []), ...marqueeIds])));
        else if (e.altKey) onSelectionChange((editorState.selectedIds || []).filter(id => !marqueeIds.includes(id)));
        else onSelectionChange(marqueeIds);
      }
      setMarqueeStart(null);
      setMarqueeEnd(null);
      setIsTwoClickMarqueeActive(false);
      return;
    }
    if (editorState.activeTool === 'select' || editorState.activeTool === 'move') {
      const selected = project.elements.filter(el => editorState.selectedIds.includes(el.id));
      
      const findConnections = (pos: Point): {id: string, key: string}[] => {
        const EPS = 0.05;
        const conns: {id: string, key: string}[] = [];
        project.elements.forEach(el => {
          if (el.p1 && Math.hypot(el.p1.x - pos.x, el.p1.y - pos.y) < EPS) conns.push({id: el.id, key: 'p1'});
          if (el.p2 && Math.hypot(el.p2.x - pos.x, el.p2.y - pos.y) < EPS) conns.push({id: el.id, key: 'p2'});
          if (el.p3 && Math.hypot(el.p3.x - pos.x, el.p3.y - pos.y) < EPS) conns.push({id: el.id, key: 'p3'});
          if (el.p4 && Math.hypot(el.p4.x - pos.x, el.p4.y - pos.y) < EPS) conns.push({id: el.id, key: 'p4'});
          if (el.controlPoint && Math.hypot(el.controlPoint.x - pos.x, el.controlPoint.y - pos.y) < EPS) conns.push({id: el.id, key: 'control'});
          if (el.pos && !['door','window','wall-opening'].includes(el.type) && Math.hypot(el.pos.x - pos.x, el.pos.y - pos.y) < EPS) conns.push({id: el.id, key: 'pos'});
        });
        return conns;
      };

      for (const el of selected) {
        if (isElevationGreyStructure(el)) continue;
        if (el.p1 && el.p2) {
          if (Math.sqrt((world.x-el.p1.x)**2+(world.y-el.p1.y)**2)<0.6) { setActiveGrip({id:el.id, key:'p1', originalPos:el.p1, connections: findConnections(el.p1)}); return; }
          if (Math.sqrt((world.x-el.p2.x)**2+(world.y-el.p2.y)**2)<0.6) { setActiveGrip({id:el.id, key:'p2', originalPos:el.p2, connections: findConnections(el.p2)}); return; }
          if (el.p3 && Math.sqrt((world.x-el.p3.x)**2+(world.y-el.p3.y)**2)<0.6) { setActiveGrip({id:el.id, key:'p3', originalPos:el.p3, connections: findConnections(el.p3)}); return; }
          if (el.p4 && Math.sqrt((world.x-el.p4.x)**2+(world.y-el.p4.y)**2)<0.6) { setActiveGrip({id:el.id, key:'p4', originalPos:el.p4, connections: findConnections(el.p4)}); return; }
          if (el.controlPoint && Math.sqrt((world.x-el.controlPoint.x)**2+(world.y-el.controlPoint.y)**2)<0.6) { setActiveGrip({id:el.id, key:'control', originalPos:el.controlPoint, connections: findConnections(el.controlPoint)}); return; }
        } else if (el.pos && Math.sqrt((world.x-el.pos.x)**2+(world.y-el.pos.y)**2)<0.6) { setActiveGrip({id:el.id, key:'pos', originalPos:el.pos, connections: findConnections(el.pos)}); return; }
      }
      
      let hit: ArchElement | null = null;
      if (tabState.anchor && tabState.hoverId) {
        const stillNear = Math.hypot(world.x - tabState.anchor.x, world.y - tabState.anchor.y) <= 0.35;
        if (stillNear) { hit = project.elements.find(el => el.id === tabState.hoverId) || null; }
      }
      if (!hit) { 
          let h = getHitElement(world); 
          if (!h && snapped) {
              h = getHitElement(snapped);
          }
          if(h && typeof h !== 'string') hit = h; 
      }
      if (!hit && editorState.viewMode === '2D' && editorState.activeTool === 'select') {
        const floorFace = getFloorFaceHitIfAllowed(world);
        if (floorFace) hit = floorFace;
      }
      if (tabState.hoverId) { setTabState({ anchor: null, candidates: [], index: -1, hoverId: null }); }

      if (hit) {
        if (e.shiftKey && editorState.activeTool === 'select') onSelectionChange(editorState.selectedIds.includes(hit.id) ? editorState.selectedIds : [...editorState.selectedIds, hit.id]);
        else if (e.altKey && editorState.activeTool === 'select') onSelectionChange(editorState.selectedIds.filter(id => id !== hit.id));
        else { if (!editorState.selectedIds.includes(hit.id)) onSelectionChange([hit.id]); }
        
        if (editorState.activeTool === 'select' && (hit.type === 'floor' || hit.type === 'ceiling')) {
          setIsDraggingSelected(false); setIsDragging(false); setDragStart(null);
        } else if (isElevationGreyStructure(hit)) {
          setIsDraggingSelected(false); setIsDragging(false); setDragStart(null);
        } else {
          setIsDraggingSelected(true); setIsDragging(true); setDragStart(world);
          originalElementsDuringDrag.current = JSON.parse(JSON.stringify(project.elements));
        }
      } else {
        if (editorState.activeTool === 'select') { 
          if (!e.shiftKey && !e.altKey) onSelectionChange([]); 
          setMarqueeStart(raw); 
          setMarqueeEnd(raw); 
          setLassoPoints([raw]);
          setIsLassoActive(false);
        }
      }
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const raw = getCanvasCoords(e);
    if (editorState.activeTool !== 'pan' && !isMiddlePanning && !isMiddleRotating) {
      setScreenMousePos(raw);
    } else if (screenMousePos) {
      setScreenMousePos(null);
    }
    if (isMiddlePanning && panStartScreen.current && panStartOffset.current) { const p = raw; onTransformChange({ x: panStartOffset.current.x + (p.x - panStartScreen.current.x), y: panStartOffset.current.y + (p.y - panStartScreen.current.y) }, editorState.zoom); return; }
    if (isMiddleRotating && panStartScreen.current && panStartOffset.current) {
        const p = raw;
        const deltaX = p.x - panStartScreen.current.x;
        const sensitivity = 0.5;
        // Invert rotation logic to match CAD expectations: moving right rotates CW
        const newAngle = (panStartOffset.current.x + deltaX * sensitivity) % 360;
        setEditorState(s => ({ ...s, canvasAngle: newAngle < 0 ? newAngle + 360 : newAngle }));
        return;
    }
    const world = screenToWorld(raw);
    const base = (isDrawing || activeGrip || isDraggingSelected || isRotating) ? (dragStart || undefined) : undefined;
    const target = applyOrtho(world, base, e); const snap = applyAdvancedSnapping(target, base); setSnapPreview(snap); setLastMousePos(snap.point);
    
    // --- HOVER TO TRACK POINT ACQUISITION ---
    if (editorState.isPointAlignmentSnap || editorState.isAngularAlignmentSnap) {
      const hoveredSnapPt = getSnapPointNearMouse(target);
      if (hoveredSnapPt) {
        const isAlreadyPOT = potentiallyAcquiringPointRef.current && 
          Math.hypot(potentiallyAcquiringPointRef.current.x - hoveredSnapPt.x, potentiallyAcquiringPointRef.current.y - hoveredSnapPt.y) < 0.05;
        
        if (!isAlreadyPOT) {
          if (hoverAcquireTimeoutRef.current) clearTimeout(hoverAcquireTimeoutRef.current);
          potentiallyAcquiringPointRef.current = hoveredSnapPt;
          hoverAcquireTimeoutRef.current = setTimeout(() => {
            setAcquiredPoints(prev => {
              const idx = prev.findIndex(p => Math.hypot(p.x - hoveredSnapPt.x, p.y - hoveredSnapPt.y) < 0.05);
              if (idx >= 0) {
                return prev.filter((_, i) => i !== idx);
              } else {
                const updated = [...prev, hoveredSnapPt];
                if (updated.length > 5) updated.shift();
                return updated;
              }
            });
            potentiallyAcquiringPointRef.current = null;
          }, 350);
        }
      } else {
        if (hoverAcquireTimeoutRef.current) {
          clearTimeout(hoverAcquireTimeoutRef.current);
          hoverAcquireTimeoutRef.current = null;
        }
        potentiallyAcquiringPointRef.current = null;
      }
    }
    
    // Resizing Logic
    if (isDraggingHandle && activeHandle && dragStart) {
        const boundaryTarget = elementsMap.get(activeHandle.id);
        if (activeHandle.key.startsWith('boundary_') && boundaryTarget?.boundary && activeHandle.originalBoundary) {
            const index = Number(activeHandle.key.split('_')[1]);
            if (!Number.isNaN(index) && index >= 0 && index < activeHandle.originalBoundary.length) {
                const nextBoundary = activeHandle.originalBoundary.map((point, pointIndex) =>
                    pointIndex === index ? snap.point : point
                );
                const nextHost: ArchElement = {
                    ...boundaryTarget,
                    boundary: nextBoundary,
                    proceduralBoundaryPoints: nextBoundary,
                };

                if (boundaryTarget.isAutoProceduralHost && nextBoundary.length >= 3) {
                    const proceduralId = boundaryTarget.proceduralId || boundaryTarget.id;
                    const programId = boundaryTarget.proceduralProgramId
                        || PROCEDURAL_TYPOLOGIES.find(t => t.id === activeProceduralConfig?.typology)?.programId
                        || 'domestic-standard';
                    const result = AutoProceduralLayoutEngine.generateLayout(nextBoundary, programId, {
                        seed: 0.42,
                        geometry: (boundaryTarget.proceduralGeometry || activeProceduralConfig?.geometry || 'Rectilinear') as any,
                        typology: (boundaryTarget.proceduralTypology || activeProceduralConfig?.style || 'Standard') as any,
                        requirements: boundaryTarget.proceduralRequirements || activeProceduralConfig?.requirements,
                        unitSystem: editorState.unitSystem
                    });
                    const generated = result.elements.map(element => ({
                        ...element,
                        id: element.id || crypto.randomUUID(),
                        levelId: activeLevelId,
                        proceduralId,
                        height: element.type === 'wall' ? (element.height || project.settings3D?.wallHeight || WALL_HEIGHT_DEFAULT) : element.height,
                        thickness: element.type === 'wall' ? (element.thickness || WALL_THICKNESS_DEFAULT) : element.thickness,
                    }));
                    setDragPreviewElements([
                        ...project.elements.filter(element => element.id !== boundaryTarget.id && element.proceduralId !== proceduralId),
                        { ...nextHost, proceduralId },
                        ...generated,
                    ]);
                } else {
                    setDragPreviewElements(project.elements.map(element => element.id === activeHandle.id ? nextHost : element));
                }
            }
            return;
        }

        const activeElevationRect = elementsMap.get(activeHandle.id);
        if (activeElevationRect && isElevationElement(activeElevationRect) && activeElevationRect.type === 'rectangle' && activeElevationRect.p1 && activeElevationRect.p2) {
            const minSize = 0.05;
            const minX = Math.min(activeElevationRect.p1.x, activeElevationRect.p2.x);
            const maxX = Math.max(activeElevationRect.p1.x, activeElevationRect.p2.x);
            const minY = Math.min(activeElevationRect.p1.y, activeElevationRect.p2.y);
            const maxY = Math.max(activeElevationRect.p1.y, activeElevationRect.p2.y);
            let nextMinX = minX;
            let nextMaxX = maxX;
            let nextMinY = minY;
            let nextMaxY = maxY;
            if (activeHandle.key === 'left') nextMinX = Math.min(snap.point.x, maxX - minSize);
            else if (activeHandle.key === 'right') nextMaxX = Math.max(snap.point.x, minX + minSize);
            else if (activeHandle.key === 'back') nextMinY = Math.min(snap.point.y, maxY - minSize);
            else if (activeHandle.key === 'front') nextMaxY = Math.max(snap.point.y, minY + minSize);
            setDragPreviewElements(project.elements.map(el => el.id === activeHandle.id ? {
              ...el,
              p1: { x: nextMinX, y: nextMinY },
              p2: { x: nextMaxX, y: nextMaxY },
              width: nextMaxX - nextMinX,
              height: nextMaxY - nextMinY,
            } : el));
            return;
        }

        // --- HOSTED OPENING RESIZING ---
        if (activeHandle.key === 'edge_L' || activeHandle.key === 'edge_R') {
            const el = elementsMap.get(activeHandle.id);
            if (el && el.hostWallId) {
                const wall = elementsMap.get(el.hostWallId);
                if (wall && wall.p1 && wall.p2) {
                    const near = findNearestWall(snap.point, [wall]);
                    if (near) {
                        const L = getWallLength(wall);
                        const width = el.width || 0.8;
                        let dt = (L > 0) ? width / L : 0;
                        if (isCurvedElement(wall)) {
                            const eps = 0.005;
                            const pNext = getCurvePoint(wall, el.hostT! + eps);
                            const pPrev = getCurvePoint(wall, el.hostT! - eps);
                            if (pNext && pPrev) {
                                const speed = Math.hypot(pNext.x - pPrev.x, pNext.y - pPrev.y) / (eps * 2);
                                if (speed > 0.0001) dt = width / speed;
                            }
                        }
                        
                        const isLeft = activeHandle.key === 'edge_L';
                        const fixedT = isLeft ? el.hostT! + dt/2 : el.hostT! - dt/2;
                        const dragT = near.t;
                        
                        const newHostT = (fixedT + dragT) / 2;
                        let newWidth = Math.abs(dragT - fixedT) * L;
                        
                        if (isCurvedElement(wall)) {
                            // Calculate actual curve distance
                            const steps = 10;
                            let curveDist = 0;
                            const tMin = Math.min(fixedT, dragT), tMax = Math.max(fixedT, dragT);
                            let prevPt = getCurvePoint(wall, tMin);
                            if (prevPt) {
                                for(let i=1; i<=steps; i++) {
                                    const currPt = getCurvePoint(wall, tMin + (tMax - tMin) * i / steps);
                                    if (currPt) {
                                        curveDist += Math.hypot(currPt.x - prevPt.x, currPt.y - prevPt.y);
                                        prevPt = currPt;
                                    }
                                }
                            }
                            newWidth = curveDist;
                        }
                        
                        newWidth = Math.max(0.1, newWidth);
                        const elements = project.elements.map(item => {
                            if (item.id === el.id) {
                                return { ...item, width: newWidth, hostT: newHostT };
                            }
                            return item;
                        });
                        const updated = updateHostedOpenings(wall, elements);
                        setDragPreviewElements(updated);
                    }
                }
            }
            return;
        }

        // --- STAIR ASYMMETRIC WIDTH RESIZING ---
        if (activeHandle.key === 'width_left' || activeHandle.key === 'width_right') {
             const el = elementsMap.get(activeHandle.id);
             if (el && el.p1 && el.p2) {
                 const p1 = el.p1; const p2 = el.p2;
                 const oldW = el.width || 1.0;
                 const dx = p2.x - p1.x; const dy = p2.y - p1.y;
                 const len = Math.sqrt(dx*dx + dy*dy);
                 if (len > 0) {
                    const ux = dx/len; const uy = dy/len;
                    const nx = -uy; const ny = ux;
                    const isRight = activeHandle.key === 'width_right';
                    const offsetDir = isRight ? -1 : 1; 
                    const midX = (p1.x + p2.x) / 2;
                    const midY = (p1.y + p2.y) / 2;
                    const fixedEdgeX = midX + nx * (oldW/2 * offsetDir);
                    const fixedEdgeY = midY + ny * (oldW/2 * offsetDir);
                    const mx = snap.point.x - fixedEdgeX;
                    const my = snap.point.y - fixedEdgeY;
                    let dist = mx * nx + my * ny;
                    if (!isRight) dist = -dist;
                    const newWidth = Math.max(0.3, dist); 
                    const shiftDir = isRight ? 1 : -1;
                    const newCenterX = fixedEdgeX + nx * (newWidth/2 * shiftDir);
                    const newCenterY = fixedEdgeY + ny * (newWidth/2 * shiftDir);
                    const deltaX = newCenterX - midX;
                    const deltaY = newCenterY - midY;
                    const newP1 = { x: p1.x + deltaX, y: p1.y + deltaY };
                    const newP2 = { x: p2.x + deltaX, y: p2.y + deltaY };
                    
                    setDragPreviewElements(project.elements.map(e => e.id === el.id ? { ...e, p1: newP1, p2: newP2, width: newWidth } : e));
                 }
             }
             return;
        }

        if (activeHandle.key === 'u_left_arm' || activeHandle.key === 'u_right_arm') {
            const target = elementsMap.get(activeHandle.id);
            if (target?.pos && isUShapedInteriorElement(target)) {
                const dx = snap.point.x - dragStart.x;
                const dy = snap.point.y - dragStart.y;
                const r = activeHandle.rotation * Math.PI / 180;
                const cos = Math.cos(r), sin = Math.sin(r);
                const ldy = -dx * sin + dy * cos;
                const originalLeftDepth = activeHandle.originalUArmDepths?.left || activeHandle.originalSize.d;
                const originalRightDepth = activeHandle.originalUArmDepths?.right || activeHandle.originalSize.d;
                const armThickness = Math.min(activeHandle.originalSize.w, activeHandle.originalSize.d, 0.6);
                const isLeftArm = activeHandle.key === 'u_left_arm';
                const nextLeftDepth = Math.max(armThickness, isLeftArm ? originalLeftDepth + ldy : originalLeftDepth);
                const nextRightDepth = Math.max(armThickness, isLeftArm ? originalRightDepth : originalRightDepth + ldy);
                const newD = Math.max(armThickness, nextLeftDepth, nextRightDepth);
                const offY = (newD - activeHandle.originalSize.d) / 2;
                const wOffX = -offY * sin;
                const wOffY = offY * cos;
                setDragPreviewElements(project.elements.map(el => {
                    if (el.id !== activeHandle.id) return el;
                    const resized = {
                      ...el,
                      depth: newD,
                      symbolLeftArmDepth: nextLeftDepth,
                      symbolRightArmDepth: nextRightDepth,
                      pos: { x: activeHandle.originalPos.x + wOffX, y: activeHandle.originalPos.y + wOffY }
                    };
                    return withStableInteriorSymbolBase(resized, activeHandle.originalSize);
                }));
            }
            return;
        }

        const dx = snap.point.x - dragStart.x; const dy = snap.point.y - dragStart.y;
        const r = activeHandle.rotation * Math.PI / 180; const cos = Math.cos(r), sin = Math.sin(r);
        const ldx = dx * cos + dy * sin; const ldy = -dx * sin + dy * cos; 
        let newW = activeHandle.originalSize.w; let newD = activeHandle.originalSize.d;
        let offX = 0; let offY = 0;
        if (activeHandle.key === 'right') { newW = Math.max(0.2, activeHandle.originalSize.w + ldx); offX = ldx / 2; } 
        else if (activeHandle.key === 'left') { newW = Math.max(0.2, activeHandle.originalSize.w - ldx); offX = ldx / 2; } 
        else if (activeHandle.key === 'front') { newD = Math.max(0.2, activeHandle.originalSize.d + ldy); offY = ldy / 2; } 
        else if (activeHandle.key === 'back') { newD = Math.max(0.2, activeHandle.originalSize.d - ldy); offY = ldy / 2; }
        const wOffX = offX * cos - offY * sin; const wOffY = offX * sin + offY * cos;
        setDragPreviewElements(project.elements.map(el => {
            if (el.id !== activeHandle.id) return el;
            const resized = {
              ...el,
              width: newW,
              depth: newD,
              pos: { x: activeHandle.originalPos.x + wOffX, y: activeHandle.originalPos.y + wOffY }
            };
            return withStableInteriorSymbolBase(resized, activeHandle.originalSize);
        }));
        return;
    }

    let isCycledHover = false;
    if (tabState.anchor && tabState.hoverId) {
      const moved = Math.hypot(world.x - tabState.anchor.x, world.y - tabState.anchor.y) > 0.55;
      if (moved) {
        setTabState({ anchor: null, candidates: [], index: -1, hoverId: null });
      } else {
        setHoveredElementId(tabState.hoverId);
        isCycledHover = true;
      }
    }

    if (!isCycledHover) {
      const hit = getHitElement(world);
      setHoveredElementId(hit && typeof hit !== 'string' ? hit.id : null);
    }

    // Grip Drag Logic
    if (activeGrip) {
      const updatedElements = project.elements.map(el => {
        let next = { ...el };
        let changed = false;

        const myConns = activeGrip.connections.filter(c => c.id === el.id);
        if (myConns.length > 0) {
            myConns.forEach(c => {
                if (c.key === 'p1') { next.p1 = snap.point; changed = true; }
                else if (c.key === 'p2') { next.p2 = snap.point; changed = true; }
                else if (c.key === 'p3') { next.p3 = snap.point; changed = true; }
                else if (c.key === 'p4') { next.p4 = snap.point; changed = true; }
                else if (c.key === 'control') { next.controlPoint = snap.point; changed = true; }
                else if (c.key === 'pos' && !['door','window','wall-opening'].includes(next.type)) { next.pos = snap.point; changed = true; }
            });
        }

        // Maintain specialized logic for openings being explicitly dragged
        if (el.id === activeGrip.id && activeGrip.key === 'pos' && ['door','window','wall-opening'].includes(el.type)) {
            const wall = elementsMap.get(el.hostWallId);
            if (wall && wall.p1 && wall.p2) {
                const dxW = wall.p2.x - wall.p1.x, dyW = wall.p2.y - wall.p1.y; const l2 = dxW * dxW + dyW * dyW;
                if (l2 > 0.0001) {
                    const currentT = ((snap.point.x - wall.p1.x) * dxW + (snap.point.y - wall.p1.y) * dyW) / l2;
                    const checkedT = getClampedTForOpening(wall, el.width || 1, currentT, [el.id]);
                    if (checkedT !== null) { next.hostT = checkedT; changed = true; }
                }
            }
        }
        return changed ? next : el;
      });
      let nextResult = updatedElements; project.elements.filter(e => e.type === 'wall').forEach(w => { nextResult = updateHostedOpenings(w, nextResult); });
      setDragPreviewElements(nextResult); return;
    }
    if (isRotating && rotationBasePoint && originalElementsDuringRotate.current && rotationReferencePoint) {
      const worldNow = snap.point;
      let currentAngle = Math.atan2(worldNow.y - rotationBasePoint.y, worldNow.x - rotationBasePoint.x);
      let startAngle = Math.atan2(rotationReferencePoint.y - rotationBasePoint.y, rotationReferencePoint.x - rotationBasePoint.x);
      
      if (numericBuffer) { 
        const typedDeg = parseFloat(numericBuffer); 
        if (!isNaN(typedDeg)) currentAngle = startAngle + (typedDeg * Math.PI / 180); 
      }
      
      if (editorState.isOrthoEnabled || e.shiftKey) { 
        const snapVal = Math.PI / 4; // 45 degree Snap
        currentAngle = startAngle + Math.round((currentAngle - startAngle) / snapVal) * snapVal; 
      }
      
      const deltaRad = currentAngle - startAngle;
      const rotatePoint = (p: Point, pivot: Point, angleRad: number): Point => { 
        const dx = p.x - pivot.x, dy = p.y - pivot.y; 
        return { x: pivot.x + dx * Math.cos(angleRad) - dy * Math.sin(angleRad), y: pivot.y + dx * Math.sin(angleRad) + dy * Math.cos(angleRad) }; 
      };
      
      const rotated = originalElementsDuringRotate.current!.map(el => {
        if (!editorState.selectedIds.includes(el.id) || el.locked) return el;
        const next = { ...el };
        if (next.pos) next.pos = rotatePoint(next.pos, rotationBasePoint, deltaRad);
        if (next.p1) next.p1 = rotatePoint(next.p1, rotationBasePoint, deltaRad);
        if (next.p2) next.p2 = rotatePoint(next.p2, rotationBasePoint, deltaRad);
        if (next.p3) next.p3 = rotatePoint(next.p3, rotationBasePoint, deltaRad);
        if (next.p4) next.p4 = rotatePoint(next.p4, rotationBasePoint, deltaRad);
        if (next.controlPoint) next.controlPoint = rotatePoint(next.controlPoint, rotationBasePoint, deltaRad);
        if (next.boundary) next.boundary = next.boundary.map(p => rotatePoint(p, rotationBasePoint, deltaRad));
        Object.assign(next, rotateCurveMetadata(next, rotationBasePoint, deltaRad));
        if (next.rotation !== undefined) { 
          const original = originalElementsDuringRotate.current!.find(o => o.id === el.id); 
          if (original) next.rotation = (original.rotation || 0) + deltaRad * 180 / Math.PI; 
        }
        return next;
      });
      
      let nextElems = rotated; 
      project.elements.filter(e => e.type === 'wall').forEach(w => { nextElems = updateHostedOpenings(w, nextElems); });
      setDragPreviewElements(nextElems); 
      return;
    }
    if (isDragging && dragStart) {
      if (isDraggingSelected && mouseDownPos) {
        const baseline = originalElementsDuringDrag.current || project.elements;
        const worldNowRaw = screenToWorld(getCanvasCoords(e)); 
        let worldNow = worldNowRaw;
        
        // Ortho support (Shift key or global ortho)
        if ((editorState.isOrthoEnabled || e.shiftKey)) { 
          const dxT = worldNowRaw.x - mouseDownPos.x; 
          const dyT = worldNowRaw.y - mouseDownPos.y; 
          if (Math.abs(dxT) >= Math.abs(dyT)) worldNow = { x: worldNowRaw.x, y: mouseDownPos.y }; 
          else worldNow = { x: mouseDownPos.x, y: worldNowRaw.y }; 
        }
        
        // Total delta from click origin
        const dx = worldNow.x - mouseDownPos.x; 
        const dy = worldNow.y - mouseDownPos.y;
        const isCopyMode = (e.ctrlKey || e.altKey);
        
        let nextElements: ArchElement[] = [];

        if (isCopyMode) {
          // --- COPY LOGIC ---
          const selectedInBaseline = baseline.filter(el => editorState.selectedIds.includes(el.id) && !el.locked && !isElevationGreyStructure(el));
          const idMap = new Map<string, string>();
          const newClones: ArchElement[] = [];
          
          selectedInBaseline.forEach(el => {
            if (el.type === 'elevation-marker') return;
            const newId = crypto.randomUUID();
            idMap.set(el.id, newId);
            
            const offsetPoint = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
            newClones.push({
              ...translateCurveMetadata(el, dx, dy),
              id: newId,
              pos: el.pos ? offsetPoint(el.pos) : el.pos,
              p1: el.p1 ? offsetPoint(el.p1) : el.p1,
              p2: el.p2 ? offsetPoint(el.p2) : el.p2,
              p3: el.p3 ? offsetPoint(el.p3) : el.p3,
              p4: el.p4 ? offsetPoint(el.p4) : el.p4,
              controlPoint: el.controlPoint ? offsetPoint(el.controlPoint) : el.controlPoint,
              boundary: el.boundary ? el.boundary.map(offsetPoint) : el.boundary,
              levelId: activeLevelId
            });
          });

          // Handle hosted openings for copied walls
          baseline.forEach(el => {
            const isOpening = ['door', 'window', 'wall-opening'].includes(el.type);
            if (isOpening && el.hostWallId && idMap.has(el.hostWallId)) {
               newClones.push({ ...el, id: crypto.randomUUID(), hostWallId: idMap.get(el.hostWallId)!, levelId: activeLevelId });
            }
          });

          nextElements = [...baseline, ...newClones];
        } else {
          // --- MOVE LOGIC ---
          let updated = baseline.map(el => {
            if (!editorState.selectedIds.includes(el.id) || el.locked || isElevationGreyStructure(el)) return el;
            const offsetPoint = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy });
            return {
              ...translateCurveMetadata(el, dx, dy),
              pos: el.pos ? offsetPoint(el.pos) : el.pos,
              p1: el.p1 ? offsetPoint(el.p1) : el.p1,
              p2: el.p2 ? offsetPoint(el.p2) : el.p2,
              p3: el.p3 ? offsetPoint(el.p3) : el.p3,
              p4: el.p4 ? offsetPoint(el.p4) : el.p4,
              controlPoint: el.controlPoint ? offsetPoint(el.controlPoint) : el.controlPoint,
              boundary: el.boundary ? el.boundary.map(offsetPoint) : el.boundary
            };
          });

          // Apply sticky stretching to connected unselected elements
          const movingElements = baseline.filter(el => editorState.selectedIds.includes(el.id) && !isElevationGreyStructure(el));
          if (movingElements.length > 0) {
            const tolerance = 0.05;
            const movingPoints: Point[] = [];
            movingElements.forEach(me => {
              const pts = [me.p1, me.p2, me.p3, me.p4, me.controlPoint, me.pos];
              pts.forEach(p => { if (p) movingPoints.push(p); });
              if (me.boundary) me.boundary.forEach(pt => movingPoints.push(pt));
            });

            updated = updated.map(el => {
              if (editorState.selectedIds.includes(el.id)) return el;
              let next = { ...el }; let changed = false;
              const checkAndOffset = (pt: Point | undefined): { pt: Point | undefined, changed: boolean } => {
                if (!pt) return { pt, changed: false };
                for (const mPt of movingPoints) {
                  if (Math.hypot(pt.x - mPt.x, pt.y - mPt.y) < tolerance) return { pt: { x: pt.x + dx, y: pt.y + dy }, changed: true };
                }
                return { pt, changed: false };
              };
              if (next.p1) { const r = checkAndOffset(next.p1); if (r.changed) { next.p1 = r.pt; changed = true; } }
              if (next.p2) { const r = checkAndOffset(next.p2); if (r.changed) { next.p2 = r.pt; changed = true; } }
              if (next.p3) { const r = checkAndOffset(next.p3); if (r.changed) { next.p3 = r.pt; changed = true; } }
              if (next.p4) { const r = checkAndOffset(next.p4); if (r.changed) { next.p4 = r.pt; changed = true; } }
              if (next.controlPoint) { const r = checkAndOffset(next.controlPoint); if (r.changed) { next.controlPoint = r.pt; changed = true; } }
              if (next.pos) { const r = checkAndOffset(next.pos); if (r.changed) { next.pos = r.pt; changed = true; } }
              if (next.boundary) {
                let bc = false; const nb = next.boundary.map(pt => { const r = checkAndOffset(pt); if (r.changed) { bc = true; return r.pt!; } return pt; });
                if (bc) { next.boundary = nb; changed = true; }
              }
              return changed ? next : el;
            });
          }
          nextElements = updated;
        }

        let finalElements = nextElements;
        nextElements.filter(e => e.type === 'wall').forEach(w => { finalElements = updateHostedOpenings(w, finalElements); });
        
        setDragPreviewElements(finalElements); 
        const isMovingAutoProceduralNode = !isCopyMode && baseline.some(el =>
          editorState.selectedIds.includes(el.id) &&
          el.type === 'room' &&
          el.metadata?.autoProceduralNode
        );
        if (isMovingAutoProceduralNode) {
          onElementsChange(finalElements);
        }
        return;
      } else { 
        onTransformChange({ x: editorState.offset.x+(raw.x-dragStart.x), y: editorState.offset.y+(raw.y-dragStart.y) }, editorState.zoom); 
        setDragStart(raw); 
      }
    }
    if (marqueeStart || isLassoActive) {
      if (isTwoClickMarqueeActive) {
        setMarqueeEnd(raw);
      } else if (e.buttons === 1) {
        if (marqueeStart) {
          const dist = Math.hypot(raw.x - marqueeStart.x, raw.y - marqueeStart.y);
          if (!isLassoActive && dist > 5) {
            setIsLassoActive(true);
            setMarqueeStart(null);
            setMarqueeEnd(null);
            setLassoPoints([marqueeStart, raw]);
          } else if (isLassoActive) {
            setLassoPoints(prev => [...prev, raw]);
          } else {
            setMarqueeEnd(raw);
          }
        } else if (isLassoActive) {
          setLassoPoints(prev => [...prev, raw]);
        }
      } else {
        if (marqueeStart) setMarqueeEnd(raw);
      }
    }
  };
  const onMouseUp = (e: React.MouseEvent) => {
    const raw = getCanvasCoords(e), world = screenToWorld(raw);
    const target = applyOrtho(world, dragStart || undefined, e);
    const snapped = applyAdvancedSnapping(target, dragStart || undefined).point;

    // 1. If we have a drag preview (from Selection Drag, Resizing, Move Tool, or Grip Edit), commit it and return.
    // This is the primary finalization for most mouse-based transformations.
    if (dragPreviewElements) {
        const finalElements = performAutoSplit(dragPreviewElements);
        onElementsChange(finalElements);
        onElementsCommit(finalElements);
        
        // Clean up all drag-related states
        setDragPreviewElements(null);
        setIsDragging(false);
        setIsDraggingSelected(false);
        setIsDraggingHandle(false);
        setDragStart(null);
        setMoveBasePoint(null);
        setActiveGrip(null);
        setActiveHandle(null);
        setIsRotating(false);
        setRotationBasePoint(null);
        setRotationReferencePoint(null);
        originalElementsDuringDrag.current = null;
        originalElementsDuringRotate.current = null;
        setMarqueeStart(null);
        setMarqueeEnd(null);
        return;
    }

    if (isMiddlePanning || isMiddleRotating) { 
      setIsMiddlePanning(false); 
      setIsMiddleRotating(false); 
      panStartScreen.current = null; 
      panStartOffset.current = null; 
      return; 
    }

    // 2. Handle 2-click Move Tool interaction (where the second click might not have triggered a preview yet or is finished)
    if (editorState.activeTool === 'move' && moveBasePoint && editorState.selectedIds.length > 0 && !isDraggingSelected) {
      const delta = { x: world.x - moveBasePoint.x, y: world.y - moveBasePoint.y };
      let moved = project.elements.map(el => {
        if (!editorState.selectedIds.includes(el.id) || el.locked || isElevationGreyStructure(el)) return el;
        const offsetPoint = (p: Point): Point => ({ x: p.x + delta.x, y: p.y + delta.y });
        return {
          ...translateCurveMetadata(el, delta.x, delta.y),
          pos: el.pos ? offsetPoint(el.pos) : el.pos,
          p1: el.p1 ? offsetPoint(el.p1) : el.p1,
          p2: el.p2 ? offsetPoint(el.p2) : el.p2,
          p3: el.p3 ? offsetPoint(el.p3) : el.p3,
          p4: el.p4 ? offsetPoint(el.p4) : el.p4,
          controlPoint: el.controlPoint ? offsetPoint(el.controlPoint) : el.controlPoint,
          boundary: el.boundary ? el.boundary.map(offsetPoint) : el.boundary
        };
      });

      // Apply sticky stretching to unselected adjacent elements
      const movingElements = project.elements.filter(el => editorState.selectedIds.includes(el.id) && !isElevationGreyStructure(el));
      if (movingElements.length > 0) {
        const tolerance = 0.05;
        const movingPoints: Point[] = [];
        movingElements.forEach(me => {
          const pts = [me.p1, me.p2, me.p3, me.p4, me.controlPoint, me.pos];
          pts.forEach(p => { if (p) movingPoints.push(p); });
          if (me.boundary) me.boundary.forEach(pt => movingPoints.push(pt));
        });

        moved = moved.map(el => {
          if (editorState.selectedIds.includes(el.id)) return el;
          let next = { ...el }; let changed = false;
          const checkAndOffset = (pt: Point | undefined): { pt: Point | undefined, changed: boolean } => {
            if (!pt) return { pt, changed: false };
            for (const mPt of movingPoints) {
              if (Math.hypot(pt.x - mPt.x, pt.y - mPt.y) < tolerance) return { pt: { x: pt.x + delta.x, y: pt.y + delta.y }, changed: true };
            }
            return { pt, changed: false };
          };
          if (next.p1) { const r = checkAndOffset(next.p1); if (r.changed) { next.p1 = r.pt; changed = true; } }
          if (next.p2) { const r = checkAndOffset(next.p2); if (r.changed) { next.p2 = r.pt; changed = true; } }
          if (next.p3) { const r = checkAndOffset(next.p3); if (r.changed) { next.p3 = r.pt; changed = true; } }
          if (next.p4) { const r = checkAndOffset(next.p4); if (r.changed) { next.p4 = r.pt; changed = true; } }
          if (next.controlPoint) { const r = checkAndOffset(next.controlPoint); if (r.changed) { next.controlPoint = r.pt; changed = true; } }
          if (next.pos) { const r = checkAndOffset(next.pos); if (r.changed) { next.pos = r.pt; changed = true; } }
          if (next.boundary) {
             let bc = false; const nb = next.boundary.map(pt => { const r = checkAndOffset(pt); if (r.changed) { bc = true; return r.pt!; } return pt; });
             if (bc) { next.boundary = nb; changed = true; }
          }
          return changed ? next : el;
        });
      }

      const splitted = performAutoSplit(moved);
      onElementsChange(splitted); 
      onElementsCommit(splitted); 
      setMoveBasePoint(null); 
      setIsDragging(false);
      setDragStart(null);
      return;
    }

    if (isDrawing && dragStart && ['rect', 'arc', 'ellipse', 'procedural-boundary', 'smart-procedural-boundary', 'auto-procedural-boundary', 'building-mass', 'landscape', 'water-body'].includes(editorState.activeTool)) { 
      if (Math.sqrt((world.x-mouseDownPos!.x)**2+(world.y-mouseDownPos!.y)**2)>0.5) commitDrawing(applyAdvancedSnapping(applyOrtho(world, dragStart, e), dragStart).point); 
    }
    let isNextTwoClickMarquee = false;
    if (isLassoActive && lassoPoints.length >= 2) {
      const lassoWorldPolygon = lassoPoints.map(p => screenToWorld(p));
      const isCrossing = lassoPoints[lassoPoints.length - 1]?.x < lassoPoints[0]?.x;
      const lassoIds = project.elements.filter(el => {
        if (el.type === 'ceiling') return false; 
        if (el.p1 && el.p2) {
          const p1In = pointInPolygon(el.p1, lassoWorldPolygon);
          const p2In = pointInPolygon(el.p2, lassoWorldPolygon);
          if (!isCrossing) {
            let allIn = p1In && p2In;
            if (allIn && (el.isCurved || (el.wallSource && ['arc','ellipse'].includes(el.wallSource)))) {
              for (let idx = 1; idx < 5; idx++) {
                const pt = getCurvePoint(el, idx / 5);
                if (pt && !pointInPolygon(pt, lassoWorldPolygon)) { allIn = false; break; }
              }
            }
            return allIn;
          } else {
            let crossIn = p1In || p2In;
            if (!crossIn) {
              if (el.isCurved || (el.wallSource && ['arc','ellipse'].includes(el.wallSource))) {
                for (let idx = 1; idx < 10; idx++) {
                  const pt = getCurvePoint(el, idx / 10);
                  if (pt && pointInPolygon(pt, lassoWorldPolygon)) { crossIn = true; break; }
                }
              } else {
                crossIn = segIntersectsPolygon(el.p1, el.p2, lassoWorldPolygon);
              }
            }
            return crossIn;
          }
        }
        if (el.pos) {
          return pointInPolygon(el.pos, lassoWorldPolygon);
        }
        if (el.boundary) {
          if (!isCrossing) {
            return el.boundary.every(pt => pointInPolygon(pt, lassoWorldPolygon));
          } else {
            return polygonIntersectsPolygon(el.boundary, lassoWorldPolygon);
          }
        }
        return false;
      }).map(el => el.id);

      if (e.shiftKey) onSelectionChange(Array.from(new Set([...(editorState.selectedIds || []), ...lassoIds])));
      else if (e.altKey) onSelectionChange((editorState.selectedIds || []).filter(id => !lassoIds.includes(id)));
      else onSelectionChange(lassoIds);

      setLassoPoints([]);
      setIsLassoActive(false);
    } else if (marqueeStart && marqueeEnd && isTwoClickMarqueeActive) {
      const p1W = screenToWorld(marqueeStart), p2W = screenToWorld(marqueeEnd), minX = Math.min(p1W.x, p2W.x), maxX = Math.max(p1W.x, p2W.x), minY = Math.min(p1W.y, p2W.y), maxY = Math.max(p1W.y, p2W.y), isCrossing = marqueeEnd.x < marqueeStart.x;
      const marqueeWorldRect = { minX, maxX, minY, maxY };
      const marqueeWorldPolygon = [
          { x: minX, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: maxY },
          { x: minX, y: maxY }
      ];

      const marqueeIds = project.elements.filter(el => { 
        if (el.type === 'ceiling') return false; 
        
        // Comprehensive point gathering
        const points: Point[] = [];
        if (el.pos) points.push(el.pos);
        if (el.p1) points.push(el.p1);
        if (el.p2) points.push(el.p2);
        if (el.p3) points.push(el.p3);
        if (el.p4) points.push(el.p4);
        if (el.controlPoint) points.push(el.controlPoint);
        if (el.boundary) el.boundary.forEach(p => points.push(p));
        
        if (points.length === 0) return false;

        const allInside = points.every(p => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
        if (!isCrossing) return allInside;

        // Crossing Selection (Intersect check)
        // 1. Box check
        const rX1 = Math.min(...points.map(p => p.x)), rX2 = Math.max(...points.map(p => p.x));
        const rY1 = Math.min(...points.map(p => p.y)), rY2 = Math.max(...points.map(p => p.y));
        const aabbOverlap = rX1 < maxX && rX2 > minX && rY1 < maxY && rY2 > minY;
        if (aabbOverlap) return true;

        // 2. Specific segment intersection for line-based elements
        if (el.p1 && el.p2) {
           if (segIntersectsPolygon(el.p1, el.p2, marqueeWorldPolygon)) return true;
        }
        if (el.p2 && el.p3) {
            if (segIntersectsPolygon(el.p2, el.p3, marqueeWorldPolygon)) return true;
        }

        return false;
      }).map(el => el.id);
      if (e.shiftKey) onSelectionChange(Array.from(new Set([...(editorState.selectedIds || []), ...marqueeIds])));
      else if (e.altKey) onSelectionChange((editorState.selectedIds || []).filter(id => !marqueeIds.includes(id)));
      else onSelectionChange(marqueeIds);

      setIsTwoClickMarqueeActive(false);
    } else if (marqueeStart) {
      isNextTwoClickMarquee = true;
      setIsTwoClickMarqueeActive(true);
    }
    const finalElements = performAutoSplit(project.elements);
    const didAutoSplitOnMouseUp = finalElements !== project.elements;
    if (didAutoSplitOnMouseUp) onElementsChange(finalElements);
    
    // Only clear drawing state if it's not a drawing tool or if it was a significant drag-commit.
    // Chained tools (line, wall, arc) will have their state reset/maintained by commitDrawing.
    const isDrawingTool = ['line', 'rect', 'gridline', 'wall', 'arc', 'ellipse', 'circle', 'stair', 'railing', 'procedural-boundary', 'smart-procedural-boundary', 'auto-procedural-boundary', 'building-mass', 'road', 'landscape', 'water-body', 'zone', 'dimension'].includes(editorState.activeTool);
    const wasSignificantDrag = mouseDownPos && Math.sqrt((world.x - mouseDownPos.x)**2 + (world.y - mouseDownPos.y)**2) > 0.5;
    
    let drawingCommitted = false;
    // If it was a hold-and-drag drawing operation, commit it now
    if (isDrawingTool && isDrawing && dragStart && wasSignificantDrag) {
        commitDrawing(applyOrtho(snapped, dragStart, e));
        drawingCommitted = true;
    }

    if (!isDrawingTool || wasSignificantDrag) {
        setIsDrawing(false); 
        setDragStart(null);
    }
    
    setIsDragging(false); 
    setIsDraggingSelected(false); 
    originalElementsDuringDrag.current = null;
    setIsDraggingHandle(false); 
    if (!isNextTwoClickMarquee) {
      setMarqueeStart(null); 
      setMarqueeEnd(null); 
    }
    setActiveGrip(null); 
    setActiveHandle(null); 
    
    // Catch-all commit for marquee and other drag operations.
    // Drawing tools now commit specifically in commitDrawing or on significant drag-release.
    // Rotation and complex tools have their own commit points.
    if (!drawingCommitted && (wasSignificantDrag || marqueeStart || didAutoSplitOnMouseUp) && editorState.activeTool !== 'rotate') {
        onElementsCommit(finalElements);
    }
  };

  return (
    <div className="relative w-full h-full">
      <canvas 
        ref={canvasRef} 
        onMouseDown={onMouseDown} 
        onMouseMove={onMouseMove} 
        onMouseUp={onMouseUp} 
        onWheel={(e) => {
          const f = Math.exp(-e.deltaY * 0.001);
          const raw = getCanvasCoords(e as any);
          const wb = screenToWorld(raw);
          const nz = Math.min(5000, Math.max(0.01, editorState.zoom * f));
          onTransformChange(getOffsetForZoomAtScreenPoint(raw, wb, nz), nz);
        }}  
        onDoubleClick={() => { setIsDrawing(false); setDragStart(null); onSelectionChange([]); }} 
        onContextMenu={(e) => e.preventDefault()} 
        onMouseLeave={() => setScreenMousePos(null)}
        onMouseEnter={(e) => { if (editorState.activeTool !== 'pan' && !isMiddlePanning && !isMiddleRotating) setScreenMousePos(getCanvasCoords(e)); }}
        className={`w-full h-full bg-slate-50 ${
          (isMiddlePanning || (editorState.activeTool === 'pan' && isDragging)) 
            ? 'cursor-grabbing' 
            : isDraggingSelected 
              ? 'cursor-move'
              : (editorState.activeTool === 'pan' ? 'cursor-grab' : (screenMousePos ? 'cursor-none' : 'cursor-default'))
        }`} 
      />
      {(editorState.activeTool === 'floor' || editorState.activeTool === 'ceiling') &&
      editorState.tempBoundaryIds && editorState.tempBoundaryIds.length > 0 && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white/90 backdrop-blur shadow-2xl border border-slate-200 px-4 py-2.5 rounded-2xl z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-2">{editorState.activeTool} Mode</span>
          <button onClick={handleConfirmFloorCeiling} className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-md active:scale-95">Confirm</button>
          <button onClick={() => setEditorState(s => ({ ...s, tempBoundaryIds: [] }))} className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95">Cancel</button>
        </div>
      )}
    </div>
  );
});

Canvas.displayName = 'Canvas';

export default Canvas;
