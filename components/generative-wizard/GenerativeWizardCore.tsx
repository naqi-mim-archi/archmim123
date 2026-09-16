
import React, { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from 'react';
import { X, Sparkles, ArrowRight, Check, RefreshCw, Loader2, Wand2, MessageSquare, Send, Edit3, User, Bot, Upload, Image as ImageIcon, Copy, ScanLine, Globe, Zap, Settings2, ChevronDown, Plus, Minus, Trash2, AlertTriangle, Download } from 'lucide-react';
import { Project, ArchElement, Point, EditorState, UnitSystem } from '../../types';
import Canvas from '../Canvas';
import { formatDimension, parseDimension } from '../../App';
import { WALL_PRESETS, DOOR_PRESETS, WINDOW_PRESETS, COLUMN_PRESETS, FURNITURE_PRESETS, FIXTURE_PRESETS, normalizeInteriorElement } from '../../constants';
import type { GeneratedData, GenerativeWizardMode } from './types';
import ModeSelector from './ModeSelector';
import AiRenderingPanel from './AiRenderingPanel';
import type { HubType as AiRenderingHubType } from '../../src/features/ai-rendering-canvas/types/graph';
import { generateFloorplan4 } from './features/text4';
import { generateFloorplan4a } from './features/text4a';
import { generateFloorplan4b } from './features/text4b';
import { convertFloorplanImage4d } from './features/text4d';
import { convertFloorplanImage4e } from './features/text4e';
import { convertFloorplanImage4f } from './features/text4f';
import { convertFloorplanImage4g } from './features/text4g';
import { convertFloorplanImage4h } from './features/text4h';
import { convertFloorplanImage4j } from './features/text4j';
import { generateFloorplanImage4g } from '../../services/imageGenService4g';
import { generateFloorplanImage4h } from '../../services/imageGenService4h';
import { generateFloorplanImage4j } from '../../services/imageGenService4j';
import { redrawAutoScanFloorplan } from '../../services/text4hAutoScanRedraw';
import { text4gHostedAperturesOverlap } from '../../services/localImageToJSON4g';
import { text4hHostedAperturesOverlap } from '../../services/localImageToJSON4h';
import { text4jHostedAperturesOverlap } from '../../services/localImageToJSON4j';
import { transcribeText4gMasterFloorplanData, type Text4gMasterThinkingLevel } from '../../services/text4gMasterFloorplanData';
import { transcribeText4hMasterFloorplanData, type Text4hMasterThinkingLevel } from '../../services/text4hMasterFloorplanData';
import {
  AutoProceduralPanel,
  AutoPlanPanel,
  completeGeometryForMode,
  findReferenceFloorplan,
  generateChatFloorplanForMode,
  generateFloorplanDigitizer,
  generateFloorplanFromImage,
  generateFloorplanFromReference,
  generateFloorplanRedrawV2,
  generateFloorplanSmartText2Plan,
  generateFloorplanText2Plan,
  importInteriorFromImage,
  isSpatialTextMode,
  isStructuredChatMode,
  mapTracerDataToArchElements,
  refineRequirementsForMode,
  traceFloorplanTracer,
  urlToBase64,
} from './features';
import type { ConfirmedText4cBrief, Text4cBriefSection } from '../../services/text4cBrief';
import {
  createEmptyText4cBrief,
  legacySummaryToText4cBrief,
  text4cBriefBoundaryMeters,
  text4cBriefToDesignSummary,
  updateText4cBriefFromSummary,
  validateText4cBrief,
} from '../../services/text4cBrief';
import {
  resolveText4cDoorPreset,
  resolveText4cWallPreset,
  resolveText4cWindowPreset,
  type Text4cEvidenceStrength,
  type Text4cWallRole,
} from '../../services/text4cPresetResolver';
import type { ConfirmedText4dBrief } from '../../services/text4dBrief';
import {
  applyText4dRectangularBoundaryPolicy,
  createEmptyText4dBrief,
  getText4dRectangularBoundaryEligibility,
  legacySummaryToText4dBrief,
  setText4dRectangularBoundaryLock,
  text4dBriefBoundaryMeters,
  text4dBriefToDesignSummary,
  updateText4dBriefFromSummary,
  validateText4dBrief,
} from '../../services/text4dBrief';
import {
  resolveText4dDoorPreset,
  resolveText4dWallPreset,
  resolveText4dWindowPreset,
} from '../../services/text4dPresetResolver';
import {
  prepareText4dDirectUpload,
  validateText4dDirectUploadScale,
  type Text4dDirectUploadScaleInput,
} from '../../services/text4dDirectUpload';
import { markText4dAuthoritativePreview } from '../../services/text4dImportHandoff';
import type { ConfirmedText4eBrief } from '../../services/text4eBrief';
import {
  applyText4eRectangularBoundaryPolicy,
  createEmptyText4eBrief,
  getText4eRectangularBoundaryEligibility,
  legacySummaryToText4eBrief,
  setText4eRectangularBoundaryLock,
  text4eBriefBoundaryMeters,
  text4eBriefToDesignSummary,
  updateText4eBriefFromSummary,
  validateText4eBrief,
} from '../../services/text4eBrief';
import {
  resolveText4eDoorPreset,
  resolveText4eWallPreset,
  resolveText4eWindowPreset,
} from '../../services/text4ePresetResolver';
import {
  prepareText4eDirectUpload,
  validateText4eDirectUploadScale,
  type Text4eDirectUploadScaleInput,
} from '../../services/text4eDirectUpload';
import { markText4eAuthoritativePreview } from '../../services/text4eImportHandoff';
import type { ConfirmedText4fBrief } from '../../services/text4fBrief';
import {
  applyText4fRectangularBoundaryPolicy,
  createEmptyText4fBrief,
  getText4fRectangularBoundaryEligibility,
  legacySummaryToText4fBrief,
  setText4fRectangularBoundaryLock,
  text4fBriefBoundaryMeters,
  text4fBriefToDesignSummary,
  updateText4fBriefFromSummary,
  validateText4fBrief,
} from '../../services/text4fBrief';
import {
  resolveText4fDoorPreset,
  resolveText4fWallPreset,
  resolveText4fWindowPreset,
} from '../../services/text4fPresetResolver';
import {
  prepareText4fDirectUpload,
  validateText4fDirectUploadScale,
  type Text4fDirectUploadScaleInput,
} from '../../services/text4fDirectUpload';
import { markText4fAuthoritativePreview } from '../../services/text4fImportHandoff';
import {
  curveLength as analyticCurveLength,
  isCurvedElement as analyticIsCurvedElement,
} from '../../services/geometry/curveGeometry';
import { projectText4fPointToCurve, text4fCurveHostedPose } from '../../services/text4fCurveHosting';
import type { ConfirmedText4gBrief } from '../../services/text4gBrief';
import {
  applyText4gRectangularBoundaryPolicy,
  createEmptyText4gBrief,
  getText4gRectangularBoundaryEligibility,
  legacySummaryToText4gBrief,
  setText4gRectangularBoundaryLock,
  text4gBriefBoundaryMeters,
  text4gBriefToDesignSummary,
  updateText4gBriefFromSummary,
  validateText4gBrief,
} from '../../services/text4gBrief';
import {
  resolveText4gDoorPreset,
  resolveText4gWallPreset,
  resolveText4gWindowPreset,
} from '../../services/text4gPresetResolver';
import {
  prepareText4gDirectUpload,
  validateText4gDirectUploadScale,
  type Text4gDirectUploadScaleInput,
} from '../../services/text4gDirectUpload';
import { markText4gAuthoritativePreview } from '../../services/text4gImportHandoff';
import { projectText4gPointToCurve, text4gCurveHostedPose } from '../../services/text4gCurveHosting';
import type { ConfirmedText4hBrief } from '../../services/text4hBrief';
import {
  applyText4hRectangularBoundaryPolicy,
  createEmptyText4hBrief,
  getText4hRectangularBoundaryEligibility,
  legacySummaryToText4hBrief,
  setText4hRectangularBoundaryLock,
  text4hBriefBoundaryMeters,
  text4hBriefToDesignSummary,
  updateText4hBriefFromSummary,
  validateText4hBrief,
} from '../../services/text4hBrief';
import {
  resolveText4hDoorPreset,
  resolveText4hWallPreset,
  resolveText4hWindowPreset,
} from '../../services/text4hPresetResolver';
import {
  prepareText4hDirectUpload,
  validateText4hDirectUploadScale,
  type Text4hDirectUploadScaleInput,
} from '../../services/text4hDirectUpload';
import { markText4hAuthoritativePreview } from '../../services/text4hImportHandoff';
import { projectText4hPointToCurve, text4hCurveHostedPose } from '../../services/text4hCurveHosting';
import { buildText4dImagePrompt } from '../../services/text4dPromptBuilder';
import { buildText4eImagePrompt } from '../../services/text4ePromptBuilder';
import { buildText4fImagePrompt } from '../../services/text4fPromptBuilder';
import { buildText4gImagePrompt } from '../../services/text4gPromptBuilder';
import { buildText4hImagePrompt } from '../../services/text4hPromptBuilder';
import type { ConfirmedText4jBrief } from '../../services/text4jBrief';
import {
  applyText4jRectangularBoundaryPolicy,
  createEmptyText4jBrief,
  getText4jRectangularBoundaryEligibility,
  legacySummaryToText4jBrief,
  setText4jRectangularBoundaryLock,
  text4jBriefBoundaryMeters,
  text4jBriefToDesignSummary,
  updateText4jBriefFromSummary,
  validateText4jBrief,
} from '../../services/text4jBrief';
import {
  resolveText4jDoorPreset,
  resolveText4jWallPreset,
  resolveText4jWindowPreset,
} from '../../services/text4jPresetResolver';
import {
  prepareText4jDirectUpload,
  validateText4jDirectUploadScale,
  type Text4jDirectUploadScaleInput,
} from '../../services/text4jDirectUpload';
import { markText4jAuthoritativePreview } from '../../services/text4jImportHandoff';
import { projectText4jPointToCurve, text4jCurveHostedPose } from '../../services/text4jCurveHosting';
import { buildText4jImagePrompt } from '../../services/text4jPromptBuilder';
import type { Text4jStructuredGeometry } from '../../services/text4jStructured3dClient';

const isSingleDoor = (el: ArchElement): boolean => {
  if (el.type !== 'door') return false;
  const sub = (el.subType || '').toLowerCase();
  if (sub === 'single' || sub === 'main' || sub.includes('single') || sub.includes('main')) return true;
  if (sub === 'double' || sub.includes('double') || sub === 'sliding' || sub === 'folding' || sub === 'glass') return false;
  if (el.width !== undefined && el.width < 1.1) return true;
  return false;
};

const isDoubleDoor = (el: ArchElement): boolean => {
  if (el.type !== 'door') return false;
  const sub = (el.subType || '').toLowerCase();
  if (sub === 'double' || sub.includes('double')) return true;
  if (sub === 'sliding' || sub === 'folding' || sub === 'glass') return false;
  if (el.width !== undefined && el.width >= 1.1 && el.width <= 2.0) return true;
  return false;
};

const scaleArchElements = (elements: ArchElement[], scale: number): ArchElement[] => {
  const text4fAuthoritative = elements.some(element => element.metadata?.text4fAuthoritativePreview === true);
  const text4gAuthoritative = elements.some(element => element.metadata?.text4gAuthoritativePreview === true);
  const text4hAuthoritative = elements.some(element => element.metadata?.text4hAuthoritativePreview === true);
  const text4jAuthoritative = elements.some(element => element.metadata?.text4jAuthoritativePreview === true);
  const scaledElements = elements.map(el => {
    const scaled = { ...el };
    if (scaled.p1) scaled.p1 = { x: scaled.p1.x * scale, y: scaled.p1.y * scale };
    if (scaled.p2) scaled.p2 = { x: scaled.p2.x * scale, y: scaled.p2.y * scale };
    if (scaled.p3) scaled.p3 = { x: scaled.p3.x * scale, y: scaled.p3.y * scale };
    if (scaled.p4) scaled.p4 = { x: scaled.p4.x * scale, y: scaled.p4.y * scale };
    if (scaled.pos) scaled.pos = { x: scaled.pos.x * scale, y: scaled.pos.y * scale };
    if (scaled.controlPoint) scaled.controlPoint = { x: scaled.controlPoint.x * scale, y: scaled.controlPoint.y * scale };
    if (scaled.arcCenter) scaled.arcCenter = { x: scaled.arcCenter.x * scale, y: scaled.arcCenter.y * scale };
    if (scaled.arcRadius !== undefined) scaled.arcRadius = scaled.arcRadius * scale;
    if (scaled.ellipseCenter) scaled.ellipseCenter = { x: scaled.ellipseCenter.x * scale, y: scaled.ellipseCenter.y * scale };
    if (scaled.ellipseRadiusX !== undefined) scaled.ellipseRadiusX = scaled.ellipseRadiusX * scale;
    if (scaled.ellipseRadiusY !== undefined) scaled.ellipseRadiusY = scaled.ellipseRadiusY * scale;
    if (scaled.boundary) {
      scaled.boundary = scaled.boundary.map(pt => ({ x: pt.x * scale, y: pt.y * scale }));
    }
    if (scaled.cadElements) {
      scaled.cadElements = scaleArchElements(scaled.cadElements, scale);
    }
    if (scaled.width !== undefined) {
      let w = scaled.width * scale;
      if (isSingleDoor(el)) {
        w = Math.max(0.6858, w); // 2'3" is 0.6858 meters
      } else if (isDoubleDoor(el)) {
        w = Math.max(1.524, w); // 5' is 1.524 meters
      }
      scaled.width = w;
    }
    if (scaled.depth !== undefined) scaled.depth = scaled.depth * scale;
    if (scaled.customRoomWidth !== undefined) scaled.customRoomWidth = scaled.customRoomWidth * scale;
    if (scaled.customRoomDepth !== undefined) scaled.customRoomDepth = scaled.customRoomDepth * scale;
    return scaled;
  });

  // Scaling the Copilot preview must preserve the exact hosted relationship.
  // Recompute hosted positions from the scaled wall, matching main-canvas insertion.
  const wallMap = new Map<string, ArchElement>(
    scaledElements.filter(el => el.type === 'wall').map(el => [el.id, el])
  );
  return scaledElements.map(el => {
    if (!['door', 'window', 'wall-opening'].includes(el.type) || !el.hostWallId) return el;
    const wall = wallMap.get(el.hostWallId);
    if (!wall?.p1 || !wall.p2) return el;
    const t = Math.max(0, Math.min(1, el.hostT ?? 0.5));
    if ((text4fAuthoritative || text4gAuthoritative || text4hAuthoritative || text4jAuthoritative) && analyticIsCurvedElement(wall)) {
      const pose = text4jAuthoritative
        ? text4jCurveHostedPose(wall, t, el.width || 0.8)
        : text4hAuthoritative
        ? text4hCurveHostedPose(wall, t, el.width || 0.8)
        : text4gAuthoritative
          ? text4gCurveHostedPose(wall, t, el.width || 0.8)
          : text4fCurveHostedPose(wall, t, el.width || 0.8);
      if (pose) return {
        ...el,
        hostT: t,
        pos: pose.pos,
        rotation: (el.metadata?.text4fObservedChordRotation === true || el.metadata?.text4gObservedChordRotation === true || el.metadata?.text4hObservedChordRotation === true || el.metadata?.text4jObservedChordRotation === true) ? el.rotation : pose.rotation,
      };
    }
    const dx = wall.p2.x - wall.p1.x;
    const dy = wall.p2.y - wall.p1.y;
    return {
      ...el,
      hostT: t,
      pos: { x: wall.p1.x + dx * t, y: wall.p1.y + dy * t },
      rotation: Math.atan2(dy, dx) * 180 / Math.PI,
    };
  });
};

const PREVIEW_LEVEL_ID = '0';

const normalizeToPreviewLevel = (elements: ArchElement[]): ArchElement[] => {
  return elements.map(el => ({
    ...el,
    levelId: PREVIEW_LEVEL_ID,
    cadElements: el.cadElements ? normalizeToPreviewLevel(el.cadElements) : el.cadElements,
  }));
};

type ImportConversionMode = 'underlay' | 'smart-2d' | 'smart-3d' | 'ai-gemini' | 'bim-interactive';
const SHOW_LEGACY_AI_GEN_MODE_SELECTOR = false;

interface ExternalImportDraft {
  title: string;
  fileName: string;
  elements: ArchElement[];
  stats?: {
    lines?: number;
    arcs?: number;
    circles?: number;
    layers?: number;
  };
  isBimAsset?: boolean;
  bimMetadata?: any;
  isBimImport?: boolean;
  canConvert?: boolean;
  levels?: Project['levels'];
  logs?: Array<{ level: 'info' | 'warning' | 'error'; code: string; message: string }>;
  bimImportSession?: any;
}

interface GenerativeWizardProps {
  isOpen: boolean;
  initialMode?: GenerativeWizardMode;
  initialAiRenderingHub?: AiRenderingHubType;
  initialText4hImageTest?: boolean;
  onClose: () => void;
  onApply: (elements: ArchElement[], options?: { viewMode?: '2D' | '3D' }) => void;
  canvasProjectTemplate?: Project;
  externalImport?: ExternalImportDraft | null;
  onApplyExternalImport?: (elements: ArchElement[], mode: ImportConversionMode) => void | Promise<void>;
  currentBoundary?: Point[];
  unitSystem?: UnitSystem;
  onChangeUnitSystem?: (unit: UnitSystem) => void;
  onLoadBimToInventory?: (asset: any) => void;
  initialSnapshots?: {url: string, name: string}[];
  onSnapshotsConsumed?: () => void;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

const CompositedProcessingSpinner: React.FC<{ size?: number; strokeWidth?: number }> = ({ size = 64, strokeWidth = 6 }) => {
  const spinnerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const spinner = spinnerRef.current;
    if (!spinner) return;
    const animation = spinner.animate(
      [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
      { duration: 760, iterations: Infinity, easing: 'linear' },
    );
    return () => animation.cancel();
  }, []);

  return (
    <div
      ref={spinnerRef}
      aria-label="Processing"
      role="status"
      style={{
        width: size,
        height: size,
        borderWidth: strokeWidth,
        borderColor: '#dbeafe',
        borderTopColor: '#0878e8',
        borderRadius: '9999px',
        borderStyle: 'solid',
        backfaceVisibility: 'hidden',
        transform: 'translateZ(0)',
        willChange: 'transform',
      }}
    />
  );
};

type Text4gComparisonKey = 'master' | 'local';
type Text4hComparisonKey = 'master' | 'local';
type Text4jComparisonKey = 'master' | 'local';

interface Text4gComparisonResult {
  key: Text4gComparisonKey;
  label: string;
  status: 'idle' | 'pending' | 'done' | 'error';
  durationMs?: number;
  data?: GeneratedData;
  error?: string;
}

type Text4gComparisonResults = Record<Text4gComparisonKey, Text4gComparisonResult>;
type Text4hComparisonResult = Text4gComparisonResult & { key: Text4hComparisonKey };
type Text4hComparisonResults = Record<Text4hComparisonKey, Text4hComparisonResult>;
type Text4jComparisonResult = Text4gComparisonResult & { key: Text4jComparisonKey };
type Text4jComparisonResults = Record<Text4jComparisonKey, Text4jComparisonResult>;

const text4jStructuredPreviewData = (
  geometry: Text4jStructuredGeometry,
  sourceImageBase64: string,
): GeneratedData => {
  const scale = 20 / Math.max(1, geometry.sourceWidth, geometry.sourceHeight);
  return {
    walls: geometry.walls.map(wall => ({
      p1: [wall.p1.x * scale, wall.p1.y * scale],
      p2: [wall.p2.x * scale, wall.p2.y * scale],
      type: 'exterior',
      provenance: 'observed',
      evidence: {
        source: 'raster',
        confidence: wall.confidence,
        notes: ['Structured3D wall candidate; semantic type and metric scale are intentionally provisional.'],
      },
    })),
    doors: [], windows: [], openings: [], rooms: [], columns: [], stairs: [], slabs: [], railings: [], furniture: [], fixtures: [],
    sourceImageBase64,
    extractionDiagnostics: {
      confidence: 'medium',
      canImport: false,
      processing: true,
      scaleSource: 'default',
      warnings: ['Structured3D candidate geometry only. Local scale, cleanup, curves, and architectural details are still processing.'],
      detectedRoomLabels: 0,
      requestedRoomLabels: 0,
    },
  };
};


const parseV2Summary = (text: string) => {
  const safeText = text || '';
  
  const programMatch = safeText.match(/(?:Purpose|Program):\s*([\s\S]*?)(?=(?:Total Area|Size|Rooms Included|Room Adjacency|Adjacency Flow|Layout Type|Detail Level|Floors):|$)/i);
  const sizeMatch = safeText.match(/(?:Total Area|Size):\s*([\s\S]*?)(?=(?:Rooms Included|Room Adjacency|Adjacency Flow|Layout Type|Detail Level|Floors):|$)/i);
  const roomsMatch = safeText.match(/(?:Rooms Included|Rooms):\s*([\s\S]*?)(?=(?:Room Adjacency|Adjacency Flow|Layout Type|Detail Level|Floors):|$)/i);
  const adjacencyMatch = safeText.match(/(?:Room Adjacency|Adjacency|Adjacency Flow):\s*([\s\S]*?)(?=(?:Layout Type|Detail Level|Floors):|$)/i);
  const styleMatch = safeText.match(/(?:Layout Type|Planning Style):\s*([\s\S]*?)(?=(?:Detail Level|Floors):|$)/i);
  const labelsMatch = safeText.match(/(?:Detail Level|Labels):\s*([\s\S]*?)(?=(?:Floors):|$)/i);
  const floorsMatch = safeText.match(/(?:Floors):\s*([\s\S]*?)(?=$)/i);

  let program = programMatch ? programMatch[1].trim() : '';
  let size = sizeMatch ? sizeMatch[1].trim() : '';
  let rooms = roomsMatch ? roomsMatch[1].trim() : '';
  let adjacency = adjacencyMatch ? adjacencyMatch[1].trim() : '';
  let style = styleMatch ? styleMatch[1].trim() : '';
  let labels = labelsMatch ? labelsMatch[1].trim() : '';
  let floors = floorsMatch ? floorsMatch[1].trim() : '';

  if (program && !program.includes('Category:')) {
    const isRes = /apartment|house|villa|condo|residen/i.test(program) || /bed/i.test(rooms);
    const category = isRes ? 'Residential' : 'Commercial';
    let type = program;
    const beds = rooms.match(/(\d+)\s*(?:x\s*)?(?:bed|master)/i);
    if (beds) type = `${beds[1]} Bedroom ${program}`;
    program = `Program: ${category}, Category: ${program}, Type: ${type}`;
  }

  if (labels && labels.includes('Full Architectural Elements')) {
    labels = '\u2705 Room Labels (ON)';
  } else if (!labels) {
    labels = '\u2705 Room Labels (ON)';
  }

  return { program, size, rooms, adjacency, style, labels, floors };
};

const constructV2Summary = (d: ReturnType<typeof parseV2Summary>) => {
  return `Parameters:

Purpose: ${d.program}

Total Area: ${d.size}

Rooms Included:
${d.rooms}

Room Adjacency:
${d.adjacency}

Layout Type: ${d.style}

Detail Level:
${d.labels}
${'\u2705'} Full Architectural Elements (walls, windows, doors)

Floors: ${d.floors}`;
};

const parseFloorsField = (floorsStr: string): number => {
  const match = (floorsStr || '').match(/(\d+)/);
  if (match) return parseInt(match[1]);
  if (/single/i.test(floorsStr || '')) return 1;
  return 1;
};

const formatFloorsField = (count: number): string => {
  if (count === 1) return "Single-story";
  return `${count}-story`;
};

const TYPOLOGIES: any = {
  "Residential": {
    name: "Residential",
    subcategories: {
      "Apartments": [
        { id: "domestic-studio", name: "Studio", variants: ["Direct-entry studio", "Niche-entry studio", "Hotel-style bath-near-entry studio", "Wall-kitchen open studio", "Balcony-front studio"] },
        { id: "domestic-1br", name: "1 Bedroom", variants: ["Open social core 1BR", "Closed-kitchen 1BR", "Compact no-corridor 1BR", "Lobby-bedroom 1BR", "Balcony-front living 1BR", "Side wet-core 1BR", "Corner bedroom 1BR", "Dual-aspect living-bedroom 1BR"] },
        { id: "domestic-standard", name: "2 Bedroom", variants: ["Open public core 2BR", "Side bedroom wing 2BR", "Central living hub 2BR", "Split-bedroom 2BR", "Service spine 2BR", "Balcony-front 2BR", "Corner-master 2BR", "Compact lobby 2BR", "Dual-aspect 2BR", "Public-front/private-rear 2BR"] },
        { id: "domestic-3br", name: "3 Bedroom", variants: ["All-bedroom wing 3BR", "Master-suite + children wing 3BR", "Central family lounge 3BR", "Service spine 3BR", "Split public/private bar 3BR", "Corner-public 3BR", "Dual balcony 3BR", "Private rear cluster 3BR", "Compact corridor 3BR", "Terrace-front 3BR"] },
        { id: "domestic-4br", name: "4 Bedroom", variants: ["Formal front/private rear 4BR", "Dual living 4BR", "Split bedroom wings 4BR", "Central family lounge 4BR", "Service spine 4BR", "Terrace-front 4BR", "Gallery-entry 4BR", "Master-wing luxury 4BR", "Guest-bedroom-front 4BR", "Dual-balcony family 4BR"] },
        { id: "domestic-duplex", name: "Duplex", variants: ["Public-lower/private-upper duplex", "Double-height living duplex", "Upper family-lounge duplex", "Roof-terrace duplex", "Stacked service-core duplex", "Split-suite duplex", "Guest-suite lower duplex"] },
        { id: "domestic-penthouse", name: "Penthouse", variants: ["Luxury wrap-around terrace penthouse", "Sky-loft double-height penthouse", "Central gallery core penthouse"] },
        { id: "domestic-serviced", name: "Serviced Apartment", variants: ["Hotel-service entrance studio", "Compact-efficiency suite", "Short-stay serviced 1BR"] }
      ],
      "Houses / Villas": [
        { id: "house-single", name: "House", variants: ["Traditional foyer single-family", "Side garage direct-entry house", "Central courtyard house"] },
        { id: "house-villa", name: "Villa", variants: ["Indoor/outdoor terrace villa", "Multi-wing garden villa", "Grand gallery entrance villa"] },
        { id: "house-row", name: "Row House", variants: ["Narrow plot linear row-house", "Lightwell central slot row-house"] },
        { id: "house-farmhouse", name: "Farmhouse", variants: ["Wrap-around porch farmhouse", "Central hearth country style"] },
        { id: "house-mansion", name: "Mansion", variants: ["Multi-anchor monumental wing mansion", "Double-stair lobby estate"] }
      ],
      "Shared / Special": [
        { id: "domestic-coliving", name: "Co-living", variants: ["Communal kitchen core co-living", "Winged pods shared living"] },
        { id: "res-student", name: "Student Housing", variants: ["Double-room cluster student dorm", "Central lounge corridor block"] },
        { id: "res-senior", name: "Senior Living", variants: ["Barrier-free accessible layout", "Caregiver-adjacent senior suite"] }
      ]
    }
  },
  "Commercial": {
    name: "Commercial & Special Typologies",
    subcategories: {
      "Office": [
        { id: "office-open", name: "Open Office", variants: ["Reception spine", "Central collaboration hub", "Meeting-front/work-deep", "Perimeter daylight workspace", "Pantry node", "Pod-cluster", "Linear work hall", "Dual-zone quiet/social"] },
        { id: "office-corporate", name: "Corporate Office", variants: ["Lobby-boardroom front", "Central work hall", "Executive perimeter wing", "service-core grouped offices"] },
        { id: "office-cowork", name: "Co-working", variants: ["Hot-desk central gallery", "Private office rings", "Social event/cafe core"] }
      ],
      "Retail": [
        { id: "retail-shop", name: "Shop", variants: ["Single-frontage boutique", "Center-island checkout", "Deep-shelf linear layout"] },
        { id: "retail-showroom", name: "Showroom", variants: ["Perimeter display loop", "Central pedestal gallery", "Glazed storefront showroom"] },
        { id: "retail-grocery", name: "Grocery", variants: ["Grid aisle system", "Perimeter cold-storage storage", "Front checkout terminal"] }
      ],
      "Food & Beverage": [
        { id: "food-cafe", name: "Cafe", variants: ["Window lounge cafe", "Center counter service bar", "Outdoor patio wrap cafe"] },
        { id: "food-restaurant", name: "Restaurant", variants: ["Dining floor front/kitchen rear", "Banquette wall dining", "Center bar restaurant"] },
        { id: "food-qsr", name: "QSR (Quick Service)", variants: ["Drive-thru dual queue", "Order-counter forward QSR", "High-seat back bar"] }
      ],
      "Healthcare": [
        { id: "healthcare-clinic", name: "Clinic", variants: ["Triage lobby center", "Examination pod loop", "Private doctor suite clinic"] },
        { id: "healthcare-ward", name: "Ward", variants: ["Central nurse station hub", "Perimeter bed bays", "Isolation cleanroom zone"] }
      ],
      "Education": [
        { id: "educational-center", name: "Classrooms", variants: ["Courtyard class corridor", "Double-width lab classrooms", "Lecture hall forward"] },
        { id: "educational-training", name: "Training Center", variants: ["Modular seminar suites", "Computer lab row-desk setup"] }
      ],
      "Industrial / Warehouse": [
        { id: "industrial-warehouse", name: "Warehouse", variants: ["High-bay racking rows", "Loading dock forward logistics"] },
        { id: "industrial-factory", name: "Factory", variants: ["Linear assembly floor", "Heavy machinery zoning", "Control room balcony"] },
        { id: "industrial-storage", name: "Storage", variants: ["Safe lockbox vault array", "Cold storage spine grid"] }
      ]
    }
  }
};

const parseProgramField = (programStr: string, useImplicitDefaults = true) => {
  const groupMatch = programStr.match(/Program:\s*([^,]+)/i);
  const catMatch = programStr.match(/Category:\s*([^,]+)/i);
  const typeMatch = programStr.match(/Type:\s*([^,(]+)/i);
  const variantMatch = programStr.match(/(?:Variant|Variants|Variant:|Type:.*?\((.*?)\))/i);

  let group = groupMatch ? groupMatch[1].trim() : "";
  let category = catMatch ? catMatch[1].trim() : "";
  let type = typeMatch ? typeMatch[1].trim() : "";
  let variant = "";

  if (group.toLowerCase().includes("residential")) {
    group = "Residential";
  } else if (group.toLowerCase().includes("commercial")) {
    group = "Commercial";
  } else if (group) {
    group = "Other";
  }

  if (group === "Residential") {
    if (/apartment/i.test(category)) category = "Apartments";
    else if (/house|villa/i.test(category)) category = "Houses / Villas";
    else if (/shared|special|co-living|student|senior/i.test(category)) category = "Shared / Special";
    else if (category) category = "Other";
  } else if (group === "Commercial") {
    if (/office/i.test(category)) category = "Office";
    else if (/retail|shop|showroom|grocery/i.test(category)) category = "Retail";
    else if (/food|beverage|cafe|restaurant|qsr/i.test(category)) category = "Food & Beverage";
    else if (/healthcare|clinic|ward/i.test(category)) category = "Healthcare";
    else if (/educational|education|classroom|training/i.test(category)) category = "Education";
    else if (/industrial|warehouse|factory|storage/i.test(category)) category = "Industrial / Warehouse";
    else if (category) category = "Other";
  }

  if (group && category && category !== "Other" && TYPOLOGIES[group]) {
    const list = TYPOLOGIES[group].subcategories[category] || [];
    const matchedTypeObj = list.find((t: any) => t.name.toLowerCase() === type.toLowerCase() || type.toLowerCase().includes(t.name.toLowerCase()));
    if (matchedTypeObj) {
      type = matchedTypeObj.name;
      const rawText = programStr.toLowerCase();
      const matchedVariant = matchedTypeObj.variants.find((v: string) => rawText.includes(v.toLowerCase()));
      if (matchedVariant) variant = matchedVariant;
    } else if (type) {
      type = "Other";
    }
  }

  let customGroup = group === "Other" ? (groupMatch ? groupMatch[1].trim() : programStr) : "";
  let customCategory = category === "Other" ? (catMatch ? catMatch[1].trim() : "") : "";
  let customType = type === "Other" ? (typeMatch ? typeMatch[1].trim() : "") : "";
  let customVariant = variantMatch ? variantMatch[1].trim() : "";

  return {
    group: group || (useImplicitDefaults ? "Residential" : ""),
    category: category || (useImplicitDefaults ? "Apartments" : ""),
    type: type || (useImplicitDefaults ? "2 Bedroom" : ""),
    variant: variant || "",
    customGroup,
    customCategory,
    customType,
    customVariant
  };
};

const formatProgramField = (p: ReturnType<typeof parseProgramField>) => {
  const g = p.group === "Other" ? p.customGroup : (p.group === "Commercial" ? "Commercial & Special Typologies" : p.group);
  const c = p.category === "Other" ? p.customCategory : p.category;
  const t = p.type === "Other" ? p.customType : p.type;
  const v = p.variant ? ` (${p.variant})` : (p.customVariant ? ` (${p.customVariant})` : "");
  return `Program: ${g}, Category: ${c}, Type: ${t}${v}`;
};

interface RoomItem {
  name: string;
  count: number;
  details?: string;
}

const parseRoomsList = (roomsStr: string): RoomItem[] => {
  const items: RoomItem[] = [];
  const lines = (roomsStr || '').split(/[\n\r]+|\s+[-*]\s+/);
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const cleanLine = trimmed.replace(/^[-*\s]+/g, '').trim();
    if (!cleanLine) return;
    
    const countMatch = cleanLine.match(/^(\d+)/);
    const count = countMatch ? parseInt(countMatch[1]) : 1;
    const detailsMatch = cleanLine.match(/\((.*?)\)/);
    const details = detailsMatch ? detailsMatch[1] : undefined;
    const name = cleanLine.replace(/\(.*?\)/, '').replace(/^\d+\s*/, '').trim();
    if (name) {
      items.push({ name, count, details });
    }
  });
  return items;
};

const formatRoomsList = (items: RoomItem[]): string => {
  return items.map(item => {
    const d = item.details ? ` (${item.details})` : '';
    return `- ${item.count} ${item.name}${d}`;
  }).join('\n');
};

const parseSizeField = (sizeStr: string, useImplicitDefaults = true) => {
  const areaMatch = sizeStr.match(/([\d.,]+)\s*([a-zA-Z\s]+)/);
  const dimsMatch = sizeStr.match(/\(([^)]+)\)/);
  let areaVal = areaMatch ? areaMatch[1] : (useImplicitDefaults ? "1000" : "");
  let areaUnit = areaMatch ? areaMatch[2].trim() : "sq ft";
  
  let dims = dimsMatch ? dimsMatch[1] : (useImplicitDefaults ? "25' x 40'" : "");
  const parts = dims.split(/x|by|\*/i);
  let width = parts[0] ? parts[0].trim() : "";
  let height = parts[1] ? parts[1].trim() : "";
  
  return { areaVal, areaUnit, width, height };
};

const formatSizeField = (s: ReturnType<typeof parseSizeField>) => {
  const widthStr = s.width || "";
  const heightStr = s.height || "";
  const dims = widthStr && heightStr ? `(${widthStr} x ${heightStr})` : (widthStr || heightStr ? `(${widthStr || heightStr})` : "");
  return `${s.areaVal} ${s.areaUnit} ${dims}`.trim();
};

interface ChatV2SummaryEditorProps {
  value: string;
  onChange: (value: string) => void;
  strictDimensions?: boolean;
  text4cBrief?: ConfirmedText4cBrief | ConfirmedText4dBrief | ConfirmedText4eBrief | ConfirmedText4fBrief | ConfirmedText4gBrief | ConfirmedText4hBrief | ConfirmedText4jBrief;
  onText4cBriefChange?: (brief: any) => void;
  updateText4BriefFromSummary?: (summary: string, brief: any, section: Text4cBriefSection) => any;
  showText4dRectangularBoundary?: boolean;
  text4IsolatedVariant?: 'd' | 'e' | 'f' | 'g' | 'h' | 'j';
}

const ChatV2SummaryEditor = ({
  value,
  onChange,
  strictDimensions = false,
  text4cBrief,
  onText4cBriefChange,
  updateText4BriefFromSummary = updateText4cBriefFromSummary,
  showText4dRectangularBoundary = false,
  text4IsolatedVariant = 'd',
}: ChatV2SummaryEditorProps) => {
  const [data, setData] = useState(() => parseV2Summary(value));

  useEffect(() => {
    const parsed = parseV2Summary(value);
    const hasChanged = 
      parsed.program !== data.program ||
      parsed.size !== data.size ||
      parsed.rooms !== data.rooms ||
      parsed.adjacency !== data.adjacency ||
      parsed.style !== data.style ||
      parsed.floors !== data.floors ||
      parsed.labels !== data.labels;

    if (hasChanged) {
      setData(parsed);
    }
  }, [value]);

  const programState = useMemo(() => parseProgramField(data.program, !strictDimensions), [data.program, strictDimensions]);
  const sizeState = useMemo(() => parseSizeField(data.size, !strictDimensions), [data.size, strictDimensions]);
  const parsedRooms = useMemo(() => parseRoomsList(data.rooms), [data.rooms]);
  const parsedAdjacencies = useMemo(() => {
    return (data.adjacency || '').split(/[\n\r]+|\s+[-*]\s+/)
      .map(line => line.trim().replace(/^[-*\s]+/g, '').trim())
      .filter(Boolean);
  }, [data.adjacency]);
  const rectangularBrief = showText4dRectangularBoundary && text4cBrief
    ? text4cBrief as ConfirmedText4dBrief | ConfirmedText4eBrief | ConfirmedText4fBrief | ConfirmedText4gBrief | ConfirmedText4hBrief | ConfirmedText4jBrief
    : undefined;
  const rectangularEligibility = rectangularBrief
    ? text4IsolatedVariant === 'j'
      ? getText4jRectangularBoundaryEligibility(rectangularBrief as ConfirmedText4jBrief)
      : text4IsolatedVariant === 'h'
      ? getText4hRectangularBoundaryEligibility(rectangularBrief as ConfirmedText4hBrief)
      : text4IsolatedVariant === 'g'
      ? getText4gRectangularBoundaryEligibility(rectangularBrief as ConfirmedText4gBrief)
      : text4IsolatedVariant === 'f'
      ? getText4fRectangularBoundaryEligibility(rectangularBrief as ConfirmedText4fBrief)
      : text4IsolatedVariant === 'e'
      ? getText4eRectangularBoundaryEligibility(rectangularBrief as ConfirmedText4eBrief)
      : getText4dRectangularBoundaryEligibility(rectangularBrief as ConfirmedText4dBrief)
    : undefined;
  const rectangularCoveragePercent = rectangularEligibility && Number.isFinite(rectangularEligibility.coverageRatio)
    ? Number((rectangularEligibility.coverageRatio * 100).toFixed(1))
    : 0;
  const rectangularBoundarySourceLabel = rectangularBrief?.dimensions.rectangularBoundary.source === 'explicit_user_request'
    ? 'PROMPT LOCK'
    : rectangularBrief?.dimensions.rectangularBoundary.source === 'user_confirmed'
      ? 'MANUAL'
      : rectangularEligibility?.eligible
        ? 'AUTO MATCH'
        : 'UNAVAILABLE';

  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDetails, setNewRoomDetails] = useState('');
  const [newAdjacencyText, setNewAdjacencyText] = useState('');

  const updateField = (field: keyof typeof data, val: string) => {
    const newData = { ...data, [field]: val };
    setData(newData);
    const nextSummary = constructV2Summary(newData);
    if (text4cBrief && onText4cBriefChange) {
      const sectionByField: Record<keyof typeof data, Text4cBriefSection> = {
        program: 'project',
        size: 'dimensions',
        rooms: 'rooms',
        adjacency: 'adjacency',
        style: 'planning',
        labels: 'planning',
        floors: 'floors',
      };
      onText4cBriefChange(updateText4BriefFromSummary(nextSummary, text4cBrief, sectionByField[field]));
    } else {
      onChange(nextSummary);
    }
  };

  const handleProgramChange = (updates: Partial<ReturnType<typeof parseProgramField>>) => {
    const nextProgramState = { ...programState, ...updates };
    updateField('program', formatProgramField(nextProgramState));
  };

  const handleSizeChange = (updates: Partial<ReturnType<typeof parseSizeField>>) => {
    const nextSizeState = { ...sizeState, ...updates };
    updateField('size', formatSizeField(nextSizeState));
  };

  const handleRoomCountChange = (index: number, delta: number) => {
    const nextRooms = [...parsedRooms];
    nextRooms[index].count = Math.max(1, nextRooms[index].count + delta);
    updateField('rooms', formatRoomsList(nextRooms));
  };

  const handleRoomDelete = (index: number) => {
    const nextRooms = parsedRooms.filter((_, i) => i !== index);
    updateField('rooms', formatRoomsList(nextRooms));
  };

  const handleAddRoom = () => {
    if (!newRoomName.trim()) return;
    const nextRooms = [...parsedRooms, {
      name: newRoomName.trim(),
      count: 1,
      details: newRoomDetails.trim() || undefined
    }];
    updateField('rooms', formatRoomsList(nextRooms));
    setNewRoomName('');
    setNewRoomDetails('');
  };

  const handleAddAdjacency = () => {
    if (!newAdjacencyText.trim()) return;
    const nextAdjacencies = [...parsedAdjacencies, newAdjacencyText.trim()];
    updateField('adjacency', nextAdjacencies.map(a => `- ${a}`).join('\n'));
    setNewAdjacencyText('');
  };

  const handleAdjacencyDelete = (index: number) => {
    const nextAdjacencies = parsedAdjacencies.filter((_, i) => i !== index);
    updateField('adjacency', nextAdjacencies.map(a => `- ${a}`).join('\n'));
  };

  // Get options for dropdowns based on group and category selections
  const categoryOptions = programState.group && TYPOLOGIES[programState.group] 
    ? Object.keys(TYPOLOGIES[programState.group].subcategories) 
    : [];

  const typeOptions = programState.group && programState.category && TYPOLOGIES[programState.group]?.subcategories?.[programState.category]
    ? TYPOLOGIES[programState.group].subcategories[programState.category]
    : [];

  const activeTypeObj = typeOptions.find((t: any) => t.name === programState.type);
  const variantOptions = activeTypeObj ? activeTypeObj.variants : [];

  const formatDimensionWithUnit = (val: string, unit: string) => {
    if (!val) return "";
    const cleaned = val.replace(/['m]/g, "").trim();
    return unit === "sq ft" ? `${cleaned}'` : `${cleaned}m`;
  };

  const handleUnitChange = (nextUnit: string) => {
    if (!strictDimensions || nextUnit === sizeState.areaUnit) {
      handleSizeChange({
        areaUnit: nextUnit,
        width: formatDimensionWithUnit(sizeState.width, nextUnit),
        height: formatDimensionWithUnit(sizeState.height, nextUnit),
      });
      return;
    }
    const toMetric = nextUnit !== 'sq ft';
    const lengthFactor = toMetric ? 0.3048 : 3.280839895;
    const areaFactor = toMetric ? 0.09290304 : 10.763910417;
    const convert = (raw: string, factor: number) => {
      const numeric = Number.parseFloat(raw.replace(/[^\d.-]/g, ''));
      return Number.isFinite(numeric) ? String(Number((numeric * factor).toFixed(2))) : '';
    };
    handleSizeChange({
      areaUnit: nextUnit,
      areaVal: convert(sizeState.areaVal, areaFactor),
      width: formatDimensionWithUnit(convert(sizeState.width, lengthFactor), nextUnit),
      height: formatDimensionWithUnit(convert(sizeState.height, lengthFactor), nextUnit),
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full h-full min-h-[480px] overflow-y-auto pr-2 custom-scrollbar">
      {/* Left Column: Metadata Controls */}
      <div className="flex flex-col gap-5">
        
        {/* Program (Category & Type) Dropdowns */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Program (Category & Type)</label>
          
          <div className="grid grid-cols-1 gap-2">
            {/* Group selector */}
            <select 
              className="w-full text-xs font-semibold text-indigo-700 bg-white border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-indigo-500 outline-none"
              value={programState.group} 
              onChange={e => handleProgramChange({ group: e.target.value, category: "", type: "", variant: "" })}
            >
              {strictDimensions && <option value="">-- Select Program --</option>}
              <option value="Residential">Residential</option>
              <option value="Commercial">Commercial & Special Typologies</option>
              <option value="Other">Other (Custom)</option>
            </select>

            {programState.group === "Other" && (
              <input 
                className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg p-2 outline-none"
                placeholder="Enter custom program group"
                value={programState.customGroup}
                onChange={e => handleProgramChange({ customGroup: e.target.value })}
              />
            )}

            {/* Category selector */}
            {programState.group !== "Other" && (
              <select 
                className="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-indigo-500 outline-none"
                value={programState.category} 
                onChange={e => handleProgramChange({ category: e.target.value, type: "", variant: "" })}
              >
                <option value="">-- Select Category --</option>
                {categoryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="Other">Other (Custom)</option>
              </select>
            )}

            {programState.category === "Other" && (
              <input 
                className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg p-2 outline-none"
                placeholder="Enter custom category"
                value={programState.customCategory}
                onChange={e => handleProgramChange({ customCategory: e.target.value })}
              />
            )}

            {/* Type selector */}
            {programState.group !== "Other" && programState.category !== "Other" && (
              <select 
                className="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-indigo-500 outline-none"
                value={programState.type} 
                onChange={e => handleProgramChange({ type: e.target.value, variant: "" })}
              >
                <option value="">-- Select Type --</option>
                {typeOptions.map((t: any) => <option key={t.name} value={t.name}>{t.name}</option>)}
                <option value="Other">Other (Custom)</option>
              </select>
            )}

            {programState.type === "Other" && (
              <input 
                className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg p-2 outline-none"
                placeholder="Enter custom type"
                value={programState.customType}
                onChange={e => handleProgramChange({ customType: e.target.value })}
              />
            )}

            {/* Variant selector */}
            {programState.group !== "Other" && programState.category !== "Other" && programState.type !== "Other" && variantOptions.length > 0 && (
              <select 
                className="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg p-2 focus:ring-1 focus:ring-indigo-500 outline-none"
                value={programState.variant} 
                onChange={e => handleProgramChange({ variant: e.target.value })}
              >
                <option value="">-- Select Layout Variant --</option>
                {variantOptions.map(v => <option key={v} value={v}>{v}</option>)}
                <option value="Other">Other (Custom)</option>
              </select>
            )}

            {programState.variant === "Other" && (
              <input 
                className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg p-2 outline-none"
                placeholder="Enter custom variant"
                value={programState.customVariant}
                onChange={e => handleProgramChange({ customVariant: e.target.value })}
              />
            )}
          </div>
        </div>

        {/* Size Inputs */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Size (Area & Dimensions)</label>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Area Value</label>
              <input 
                className="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg p-2 outline-none"
                value={sizeState.areaVal} 
                onChange={e => handleSizeChange({ areaVal: e.target.value })} 
                placeholder="Area e.g. 1000"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Unit</label>
              <select 
                className="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg p-2 outline-none"
                value={sizeState.areaUnit} 
                onChange={e => handleUnitChange(e.target.value)}
              >
                <option value="sq ft">sq ft</option>
                <option value="sqm">sqm</option>
              </select>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-0.5">
              <label className="text-[10px] font-bold text-slate-400">Envelope Dimensions (Width x Depth)</label>
              {text4cBrief && text4cBrief.dimensions.envelope.source !== 'user_confirmed' && (
                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">COPILOT INFERRED</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <input 
                className="w-1/2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg p-2 outline-none"
                value={sizeState.width.replace(/['m]/g, '')} 
                onChange={e => handleSizeChange({ width: formatDimensionWithUnit(e.target.value, sizeState.areaUnit) })} 
                placeholder="Width"
              />
              <span className="text-slate-400 text-xs font-bold">x</span>
              <input 
                className="w-1/2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg p-2 outline-none"
                value={sizeState.height.replace(/['m]/g, '')} 
                onChange={e => handleSizeChange({ height: formatDimensionWithUnit(e.target.value, sizeState.areaUnit) })} 
                placeholder="Depth"
              />
              <span className="text-slate-400 text-xs font-semibold">
                {sizeState.areaUnit === "sq ft" ? "ft" : "m"}
              </span>
            </div>
          </div>
          {text4cBrief && onText4cBriefChange && (
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-0.5">Envelope Scope</label>
              <select
                className="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg p-2 outline-none"
                value={text4cBrief.dimensions.envelope.scope}
                onChange={e => onText4cBriefChange({
                  ...text4cBrief,
                  dimensions: {
                    ...text4cBrief.dimensions,
                    envelope: {
                      ...text4cBrief.dimensions.envelope,
                      scope: e.target.value as ConfirmedText4cBrief['dimensions']['envelope']['scope'],
                      source: 'user_confirmed',
                    },
                  },
                  provenance: {
                    ...text4cBrief.provenance,
                    confirmed: false,
                    lastEditedSection: 'dimensions',
                  },
                })}
              >
                <option value="enclosed_plan_envelope">Enclosed plan envelope</option>
                <option value="building_footprint">Building footprint</option>
              </select>
            </div>
          )}
          {rectangularBrief && rectangularEligibility && onText4cBriefChange && (
            <div className={`rounded-lg border p-3 ${rectangularEligibility.eligible ? 'border-blue-200 bg-white shadow-sm' : 'border-slate-200 bg-slate-100'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-900">Rectangular Boundary</span>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${rectangularEligibility.eligible ? 'text-blue-700 bg-blue-50 border border-blue-200' : 'text-slate-600 bg-white border border-slate-200'}`}>
                    {rectangularBoundarySourceLabel}
                  </span>
                </div>
                <label className={`relative inline-flex items-center ${rectangularEligibility.eligible ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={rectangularEligibility.eligible && rectangularBrief.dimensions.rectangularBoundary.locked}
                    disabled={!rectangularEligibility.eligible}
                    onChange={event => onText4cBriefChange(text4IsolatedVariant === 'j'
                      ? setText4jRectangularBoundaryLock(rectangularBrief as ConfirmedText4jBrief, event.target.checked)
                      : text4IsolatedVariant === 'h'
                      ? setText4hRectangularBoundaryLock(rectangularBrief as ConfirmedText4hBrief, event.target.checked)
                      : text4IsolatedVariant === 'g'
                      ? setText4gRectangularBoundaryLock(rectangularBrief as ConfirmedText4gBrief, event.target.checked)
                      : text4IsolatedVariant === 'f'
                      ? setText4fRectangularBoundaryLock(rectangularBrief as ConfirmedText4fBrief, event.target.checked)
                      : text4IsolatedVariant === 'e'
                        ? setText4eRectangularBoundaryLock(rectangularBrief as ConfirmedText4eBrief, event.target.checked)
                        : setText4dRectangularBoundaryLock(rectangularBrief as ConfirmedText4dBrief, event.target.checked))}
                  />
                  <div className="w-9 h-5 bg-slate-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
              <p className="mt-1.5 text-[10px] font-medium leading-relaxed text-slate-700">
                {rectangularEligibility.eligible
                  ? `Area is ${rectangularCoveragePercent}% of the dimensional rectangle (valid range 95-105%). Turn off to allow creative intelligent forms.`
                  : `Unavailable: area is ${rectangularCoveragePercent}% of the dimensional rectangle. Outside 95-105%, Gemini remains creatively unlocked.`}
              </p>
            </div>
          )}
        </div>

        {/* Style, Floors, and Labels */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-2">Planning Style</label>
            <select
              className="w-full text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg p-2 outline-none"
              value={data.style}
              onChange={e => updateField('style', e.target.value)}
            >
              <option value="Open Concept">Open Concept</option>
              <option value="Closed concept">Closed concept</option>
              <option value="Modular">Modular</option>
              <option value="Traditional">Traditional</option>
            </select>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-2">Floors</label>
            <div className="flex items-center gap-2">
              <button 
                type="button"
                onClick={() => {
                  const count = Math.max(1, parseFloorsField(data.floors) - 1);
                  updateField('floors', formatFloorsField(count));
                }}
                className="p-1 bg-white border border-slate-200 rounded hover:bg-slate-100 transition-colors"
              >
                <Minus size={14} />
              </button>
              <span className="flex-1 text-center font-bold text-xs text-slate-700">
                {parseFloorsField(data.floors)} Floors
              </span>
              <button 
                type="button"
                onClick={() => {
                  const count = parseFloorsField(data.floors) + 1;
                  updateField('floors', formatFloorsField(count));
                }}
                className="p-1 bg-white border border-slate-200 rounded hover:bg-slate-100 transition-colors"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>

        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Room Labels Rendering</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              className="sr-only peer"
              checked={data.labels.includes('ON')}
              onChange={e => updateField('labels', e.target.checked ? '\u2705 Room Labels (ON)' : '\u274c Room Labels (OFF)')}
            />
            <div className="w-9 h-5 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

      </div>

      {/* Right Column: Rooms & Spaces + Adjacency flow */}
      <div className="flex flex-col gap-5">
        
        {/* Rooms & Spaces Editor */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col flex-1 min-h-[220px]">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-3">Rooms & Spaces</label>
          
          <div className="flex-1 overflow-y-auto max-h-[160px] mb-3 pr-1 custom-scrollbar">
            <div className="flex flex-wrap gap-2">
              {parsedRooms.map((room, index) => (
                <div key={index} className="flex items-center gap-1 bg-white border border-slate-200 text-[11px] font-semibold pl-1.5 pr-1 py-0.5 rounded-full shadow-sm">
                  <button 
                    type="button" 
                    onClick={() => handleRoomCountChange(index, -1)}
                    className="text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <Minus size={10} />
                  </button>
                  <span className="text-indigo-600 font-bold px-0.5">{room.count}</span>
                  <button
                    type="button" 
                    onClick={() => handleRoomCountChange(index, 1)}
                    className="text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <Plus size={10} />
                  </button>
                  <span className="text-slate-700 ml-1">
                    {room.name}{room.details ? ` (${room.details})` : ''}
                  </span>
                  <button 
                    type="button"
                    onClick={() => handleRoomDelete(index)}
                    className="text-slate-400 hover:text-red-500 border-l border-slate-200 pl-1.5 ml-1.5"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 border-t border-slate-200 pt-3">
            <input 
              className="flex-1 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg p-2 outline-none"
              placeholder="e.g. Master Bedroom"
              value={newRoomName}
              onChange={e => setNewRoomName(e.target.value)}
            />
            <input 
              className="w-1/3 text-xs text-slate-500 bg-white border border-slate-200 rounded-lg p-2 outline-none"
              placeholder="details (e.g. ensuite)"
              value={newRoomDetails}
              onChange={e => setNewRoomDetails(e.target.value)}
            />
            <button 
              type="button"
              onClick={handleAddRoom}
              className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center justify-center"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Adjacency Flow Editor */}
        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col flex-1 min-h-[180px]">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block mb-3">Adjacency Flow</label>
          
          <div className="flex-1 overflow-y-auto max-h-[140px] space-y-2 mb-3 pr-1 custom-scrollbar">
            {parsedAdjacencies.map((adj, index) => (
              <div key={index} className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 font-semibold shadow-sm">
                <span>Rule # {(index + 1).toString().padStart(2, '0')}: {adj}</span>
                <button 
                  type="button"
                  onClick={() => handleAdjacencyDelete(index)}
                  className="text-slate-400 hover:text-red-500 p-0.5 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2 border-t border-slate-200 pt-3">
            <input 
              className="flex-1 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg p-2 outline-none"
              placeholder="e.g. Kitchen connected to Dining"
              value={newAdjacencyText}
              onChange={e => setNewAdjacencyText(e.target.value)}
            />
            <button 
              type="button"
              onClick={handleAddAdjacency}
              className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center justify-center"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

const GenerativeWizard: React.FC<GenerativeWizardProps> = ({ 
  isOpen, 
  initialMode = 'chat',
  initialAiRenderingHub = 'image_studio',
  initialText4hImageTest = false,
  onClose, 
  onApply, 
  canvasProjectTemplate,
  externalImport,
  onApplyExternalImport,
  currentBoundary,
  unitSystem = 'metric' as UnitSystem,
  onChangeUnitSystem,
  onLoadBimToInventory,
  initialSnapshots,
  onSnapshotsConsumed,
}) => {
  const [mode, setMode] = useState<GenerativeWizardMode>('chat');
  const [isModeDropdownOpen, setIsModeDropdownOpen] = useState(false);
  const [step, setStep] = useState<'input' | 'summary' | 'text4d-image-test' | 'generating' | 'preview' | 'manual-fallback' | 'import-options'>('input');
  const [isDragging, setIsDragging] = useState(false);
  const isText4hWorkspace = initialMode === 'chat-v4h';
  const isAutoScanWorkspace = isText4hWorkspace && initialText4hImageTest;
  const isAutoPlanWorkspace = isText4hWorkspace && !isAutoScanWorkspace;
  const isAutoPlanGenerationMode = isAutoPlanWorkspace && mode === 'chat-v4h';
  const isAutoScanFlashMode = isAutoScanWorkspace && mode === 'chat-v4h';

  const handleWizardBack = useCallback(() => {
    if (step === 'input') {
      if (isAutoPlanWorkspace && mode === 'smart-procedural') {
        setMode('chat-v4h');
        return;
      }
      if (isAutoScanWorkspace && mode === 'digitizer') {
        setMode('chat-v4h');
        setStep('text4d-image-test');
        return;
      }
      onClose();
      return;
    }
    if (step === 'text4d-image-test' && isAutoScanWorkspace) {
      onClose();
      return;
    }
    if (step === 'import-options') {
      setStep('preview');
      return;
    }
    if (step === 'preview' || step === 'generating') {
      setStep('summary');
      return;
    }
    setStep('input');
  }, [step, mode, isAutoPlanWorkspace, isAutoScanWorkspace, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const registerBackAction = (event: Event) => {
      const detail = (event as CustomEvent<{ priority: number; action?: () => void }>).detail;
      if (detail && detail.priority < 10) {
        detail.priority = 10;
        detail.action = handleWizardBack;
      }
      event.preventDefault();
    };
    window.addEventListener('archai:navigate-back', registerBackAction);
    return () => window.removeEventListener('archai:navigate-back', registerBackAction);
  }, [isOpen, handleWizardBack]);
  
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [designSummary, setDesignSummary] = useState('');
  const [text4cBrief, setText4cBrief] = useState<ConfirmedText4cBrief>(() => createEmptyText4cBrief());
  const text4cBriefDirtyRef = useRef(false);
  const text4cVariationIndexRef = useRef(0);
  const text4cValidation = useMemo(() => validateText4cBrief(text4cBrief), [text4cBrief]);
  const [text4dBrief, setText4dBrief] = useState<ConfirmedText4dBrief>(() => createEmptyText4dBrief());
  const text4dBriefDirtyRef = useRef(false);
  const text4dVariationIndexRef = useRef(0);
  const text4dValidation = useMemo(() => validateText4dBrief(text4dBrief), [text4dBrief]);
  const [text4eBrief, setText4eBrief] = useState<ConfirmedText4eBrief>(() => createEmptyText4eBrief());
  const text4eBriefDirtyRef = useRef(false);
  const text4eVariationIndexRef = useRef(0);
  const text4eValidation = useMemo(() => validateText4eBrief(text4eBrief), [text4eBrief]);
  const [text4fBrief, setText4fBrief] = useState<ConfirmedText4fBrief>(() => createEmptyText4fBrief());
  const text4fBriefDirtyRef = useRef(false);
  const text4fVariationIndexRef = useRef(0);
  const text4fValidation = useMemo(() => validateText4fBrief(text4fBrief), [text4fBrief]);
  const [text4gBrief, setText4gBrief] = useState<ConfirmedText4gBrief>(() => createEmptyText4gBrief());
  const text4gBriefDirtyRef = useRef(false);
  const text4gVariationIndexRef = useRef(0);
  const text4gValidation = useMemo(() => validateText4gBrief(text4gBrief), [text4gBrief]);
  const [text4hBrief, setText4hBrief] = useState<ConfirmedText4hBrief>(() => createEmptyText4hBrief());
  const text4hBriefDirtyRef = useRef(false);
  const text4hVariationIndexRef = useRef(0);
  const text4hValidation = useMemo(() => validateText4hBrief(text4hBrief), [text4hBrief]);
  const [text4jBrief, setText4jBrief] = useState<ConfirmedText4jBrief>(() => createEmptyText4jBrief());
  const text4jBriefDirtyRef = useRef(false);
  const text4jVariationIndexRef = useRef(0);
  const text4jValidation = useMemo(() => validateText4jBrief(text4jBrief), [text4jBrief]);
  const isText4cMode = mode === 'chat-v4c';
  const isText4dMode = mode === 'chat-v4d';
  const isText4eMode = mode === 'chat-v4e';
  const isText4fMode = mode === 'chat-v4f';
  const isText4gMode = mode === 'chat-v4g';
  const isText4hMode = mode === 'chat-v4h';
  const isText4jMode = mode === 'chat-v4j';
  const isText4IsolatedMode = isText4dMode || isText4eMode || isText4fMode || isText4gMode || isText4hMode || isText4jMode;
  const isText4ReplicaMode = isText4cMode || isText4IsolatedMode;
  const activeText4Validation = isText4jMode ? text4jValidation : isText4hMode ? text4hValidation : isText4gMode ? text4gValidation : isText4fMode ? text4fValidation : isText4eMode ? text4eValidation : isText4dMode ? text4dValidation : text4cValidation;
  
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [text4dConversionSource, setText4dConversionSource] = useState<'generated' | 'uploaded-test' | null>(null);
  const [text4dDirectUploadScale, setText4dDirectUploadScale] = useState<Text4dDirectUploadScaleInput>({
    unitSystem: unitSystem === 'imperial' ? 'imperial' : 'metric',
    width: '',
    depth: '',
    area: '',
  });
  const text4dDirectUploadValidation = useMemo(
    () => validateText4dDirectUploadScale(text4dDirectUploadScale),
    [text4dDirectUploadScale],
  );
  const [text4eConversionSource, setText4eConversionSource] = useState<'generated' | 'uploaded-test' | null>(null);
  const [text4eDirectUploadScale, setText4eDirectUploadScale] = useState<Text4eDirectUploadScaleInput>({
    unitSystem: unitSystem === 'imperial' ? 'imperial' : 'metric', width: '', depth: '', area: '',
  });
  const text4eDirectUploadValidation = useMemo(
    () => validateText4eDirectUploadScale(text4eDirectUploadScale),
    [text4eDirectUploadScale],
  );
  const [text4fConversionSource, setText4fConversionSource] = useState<'generated' | 'uploaded-test' | null>(null);
  const [text4fDirectUploadScale, setText4fDirectUploadScale] = useState<Text4fDirectUploadScaleInput>({
    unitSystem: unitSystem === 'imperial' ? 'imperial' : 'metric', width: '', depth: '', area: '',
  });
  const text4fDirectUploadValidation = useMemo(
    () => validateText4fDirectUploadScale(text4fDirectUploadScale),
    [text4fDirectUploadScale],
  );
  const [text4gConversionSource, setText4gConversionSource] = useState<'generated' | 'uploaded-test' | null>(null);
  const [text4gDirectUploadScale, setText4gDirectUploadScale] = useState<Text4gDirectUploadScaleInput>({
    unitSystem: unitSystem === 'imperial' ? 'imperial' : 'metric', width: '', depth: '', area: '',
  });
  const text4gDirectUploadValidation = useMemo(
    () => validateText4gDirectUploadScale(text4gDirectUploadScale),
    [text4gDirectUploadScale],
  );
  const [text4hConversionSource, setText4hConversionSource] = useState<'generated' | 'uploaded-test' | null>(null);
  const [text4hDirectUploadScale, setText4hDirectUploadScale] = useState<Text4hDirectUploadScaleInput>({
    unitSystem: unitSystem === 'imperial' ? 'imperial' : 'metric', width: '', depth: '', area: '',
  });
  const text4hDirectUploadValidation = useMemo(
    () => validateText4hDirectUploadScale(text4hDirectUploadScale),
    [text4hDirectUploadScale],
  );
  const [text4jConversionSource, setText4jConversionSource] = useState<'generated' | 'uploaded-test' | null>(null);
  const [text4jDirectUploadScale, setText4jDirectUploadScale] = useState<Text4jDirectUploadScaleInput>({
    unitSystem: unitSystem === 'imperial' ? 'imperial' : 'metric', width: '', depth: '', area: '',
  });
  const text4jDirectUploadValidation = useMemo(
    () => validateText4jDirectUploadScale(text4jDirectUploadScale),
    [text4jDirectUploadScale],
  );
  const activeText4IsolatedBrief = isText4jMode ? text4jBrief : isText4hMode ? text4hBrief : isText4gMode ? text4gBrief : isText4fMode ? text4fBrief : isText4eMode ? text4eBrief : text4dBrief;
  const activeText4IsolatedConversionSource = isText4jMode ? text4jConversionSource : isText4hMode ? text4hConversionSource : isText4gMode ? text4gConversionSource : isText4fMode ? text4fConversionSource : isText4eMode ? text4eConversionSource : text4dConversionSource;
  const activeText4IsolatedUploadScale = isText4jMode ? text4jDirectUploadScale : isText4hMode ? text4hDirectUploadScale : isText4gMode ? text4gDirectUploadScale : isText4fMode ? text4fDirectUploadScale : isText4eMode ? text4eDirectUploadScale : text4dDirectUploadScale;
  const activeText4IsolatedUploadValidation = isText4jMode ? text4jDirectUploadValidation : isText4hMode ? text4hDirectUploadValidation : isText4gMode ? text4gDirectUploadValidation : isText4fMode ? text4fDirectUploadValidation : isText4eMode ? text4eDirectUploadValidation : text4dDirectUploadValidation;
  const setActiveText4IsolatedUploadScale = isText4jMode ? setText4jDirectUploadScale : isText4hMode ? setText4hDirectUploadScale : isText4gMode ? setText4gDirectUploadScale : isText4fMode ? setText4fDirectUploadScale : isText4eMode ? setText4eDirectUploadScale : setText4dDirectUploadScale;
  const [generatedData, setGeneratedData] = useState<GeneratedData | null>(null);
  const [text4gComparisonResults, setText4gComparisonResults] = useState<Text4gComparisonResults | null>(null);
  const [selectedText4gComparison, setSelectedText4gComparison] = useState<Text4gComparisonKey>('local');
  const [text4gMasterThinkingLevel, setText4gMasterThinkingLevel] = useState<Text4gMasterThinkingLevel>('minimal');
  const [text4gComparisonContext, setText4gComparisonContext] = useState<{
    base64Image: string;
    confirmedBrief: ConfirmedText4gBrief;
    requestedBoundary?: Point[];
    requestedExtentsMeters?: { width?: number; depth?: number };
    sourceKind: 'generated' | 'uploaded';
    summary: string;
  } | null>(null);
  const [text4hComparisonResults, setText4hComparisonResults] = useState<Text4hComparisonResults | null>(null);
  const [selectedText4hComparison, setSelectedText4hComparison] = useState<Text4hComparisonKey>('local');
  const [autoScanGeneratedImage, setAutoScanGeneratedImage] = useState<string | null>(null);
  const [showAutoScanGeneratedImage, setShowAutoScanGeneratedImage] = useState(false);
  const [autoPlanImageVisibility, setAutoPlanImageVisibility] = useState<Record<Text4hComparisonKey, boolean>>({ master: false, local: false });
  const [showImageToJsonLogs, setShowImageToJsonLogs] = useState(false);
  const [text4hMasterThinkingLevel, setText4hMasterThinkingLevel] = useState<Text4hMasterThinkingLevel>('minimal');
  const [text4hComparisonContext, setText4hComparisonContext] = useState<{
    base64Image: string;
    confirmedBrief: ConfirmedText4hBrief;
    requestedBoundary?: Point[];
    requestedExtentsMeters?: { width?: number; depth?: number };
    sourceKind: 'generated' | 'uploaded';
    summary: string;
  } | null>(null);
  const [text4jComparisonResults, setText4jComparisonResults] = useState<Text4jComparisonResults | null>(null);
  const [selectedText4jComparison, setSelectedText4jComparison] = useState<Text4jComparisonKey>('local');
  const [isText4dDigitizationPending, setIsText4dDigitizationPending] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const handleCopyPrompt = () => {
    let promptToCopy = '';
    if (isText4jMode) {
      promptToCopy = buildText4jImagePrompt(text4jBrief);
    } else if (isText4hMode) {
      promptToCopy = buildText4hImagePrompt(text4hBrief);
    } else if (isText4gMode) {
      promptToCopy = buildText4gImagePrompt(text4gBrief);
    } else if (isText4fMode) {
      promptToCopy = buildText4fImagePrompt(text4fBrief);
    } else if (isText4eMode) {
      promptToCopy = buildText4eImagePrompt(text4eBrief);
    } else if (isText4dMode) {
      promptToCopy = buildText4dImagePrompt(text4dBrief);
    } else {
      promptToCopy = designSummary;
    }
    if (promptToCopy) {
      navigator.clipboard.writeText(promptToCopy);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2000);
    }
  };
  const [rawTracerData, setRawTracerData] = useState<any>(null); // Store raw API response
  const [error, setError] = useState<string | null>(null);

  // Tracer Settings
  const [tracerOverlap, setTracerOverlap] = useState(80);
  const [tracerConfidence, setTracerConfidence] = useState(50);

  // New state for Fusion Fallback
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<number | null>(null);
  const debounceTimer = useRef<number | null>(null);
  const previewCanvasHostRef = useRef<HTMLDivElement>(null);
  const text4gComparisonCanvasRefs = useRef<Record<Text4gComparisonKey, HTMLDivElement | null>>({ master: null, local: null });
  const text4hComparisonCanvasRefs = useRef<Record<Text4hComparisonKey, HTMLDivElement | null>>({ master: null, local: null });
  const text4jComparisonCanvasRefs = useRef<Record<Text4jComparisonKey, HTMLDivElement | null>>({ master: null, local: null });
  const lastAutoFitKeyRef = useRef<string | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [baseElements, setBaseElements] = useState<ArchElement[]>([]);
  const [isImportingInterior, setIsImportingInterior] = useState(false);
  const [scaleFactor, setScaleFactor] = useState<number>(1.0);
  const [inputW, setInputW] = useState('');
  const [inputH, setInputH] = useState('');
  const [importConversionMode, setImportConversionMode] = useState<ImportConversionMode>('underlay');

  const [zoom, setZoom] = useState(15);
  const [offset, setOffset] = useState({ x: 400, y: 300 });
  const isExternalImport = !!externalImport;

  const measureElements = useCallback((elements: ArchElement[], shellOnly: boolean, includeWallFaces = false) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const includePoint = (point?: Point) => {
      if (!point) return;
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
    };

    const visit = (el: ArchElement) => {
      if (shellOnly && el.type !== 'wall' && el.type !== 'column') return;
      includePoint(el.p1);
      includePoint(el.p2);
      if (includeWallFaces && el.type === 'wall' && el.p1 && el.p2) {
        const dx = el.p2.x - el.p1.x;
        const dy = el.p2.y - el.p1.y;
        const length = Math.hypot(dx, dy);
        if (length > 0) {
          const halfThickness = Math.max(0.01, el.thickness || 0.23) / 2;
          const offsetX = -dy / length * halfThickness;
          const offsetY = dx / length * halfThickness;
          includePoint({ x: el.p1.x + offsetX, y: el.p1.y + offsetY });
          includePoint({ x: el.p1.x - offsetX, y: el.p1.y - offsetY });
          includePoint({ x: el.p2.x + offsetX, y: el.p2.y + offsetY });
          includePoint({ x: el.p2.x - offsetX, y: el.p2.y - offsetY });
        }
      }
      includePoint(el.p3);
      includePoint(el.p4);
      includePoint(el.pos);
      includePoint(el.controlPoint);
      if (el.arcCenter && el.arcRadius !== undefined) {
        includePoint({ x: el.arcCenter.x - el.arcRadius, y: el.arcCenter.y - el.arcRadius });
        includePoint({ x: el.arcCenter.x + el.arcRadius, y: el.arcCenter.y + el.arcRadius });
      } else {
        includePoint(el.arcCenter);
      }
      if (el.ellipseCenter && el.ellipseRadiusX !== undefined && el.ellipseRadiusY !== undefined) {
        includePoint({ x: el.ellipseCenter.x - el.ellipseRadiusX, y: el.ellipseCenter.y - el.ellipseRadiusY });
        includePoint({ x: el.ellipseCenter.x + el.ellipseRadiusX, y: el.ellipseCenter.y + el.ellipseRadiusY });
      } else {
        includePoint(el.ellipseCenter);
      }
      el.boundary?.forEach(includePoint);
      el.cadElements?.forEach(visit);
    };

    elements.forEach(visit);
    if (minX === Infinity || maxX === Infinity || minY === Infinity || maxY === Infinity) {
      return { minX: 0, maxX: 0, minY: 0, maxY: 0, w: 0, h: 0 };
    }
    return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
  }, []);

  const naturalBounds = useMemo(() => {
    return measureElements(baseElements, !isExternalImport, isText4IsolatedMode && !isExternalImport);
  }, [baseElements, isExternalImport, isText4IsolatedMode, measureElements]);

  const naturalCenterlineBounds = useMemo(() => {
    return measureElements(baseElements, !isExternalImport, false);
  }, [baseElements, isExternalImport, measureElements]);
  const text4dWallFaceAllowanceW = isText4IsolatedMode && !isExternalImport
    ? Math.max(0, naturalBounds.w - naturalCenterlineBounds.w)
    : 0;
  const text4dWallFaceAllowanceH = isText4IsolatedMode && !isExternalImport
    ? Math.max(0, naturalBounds.h - naturalCenterlineBounds.h)
    : 0;
  const currentW = isText4IsolatedMode && !isExternalImport
    ? naturalCenterlineBounds.w * scaleFactor + text4dWallFaceAllowanceW
    : naturalBounds.w * scaleFactor;
  const currentH = isText4IsolatedMode && !isExternalImport
    ? naturalCenterlineBounds.h * scaleFactor + text4dWallFaceAllowanceH
    : naturalBounds.h * scaleFactor;
  const scaleForRequestedWidth = (targetWidth: number) => isText4IsolatedMode && !isExternalImport
    ? Math.max(0.01, targetWidth - text4dWallFaceAllowanceW) / Math.max(0.01, naturalCenterlineBounds.w)
    : targetWidth / Math.max(0.01, naturalBounds.w);
  const scaleForRequestedHeight = (targetHeight: number) => isText4IsolatedMode && !isExternalImport
    ? Math.max(0.01, targetHeight - text4dWallFaceAllowanceH) / Math.max(0.01, naturalCenterlineBounds.h)
    : targetHeight / Math.max(0.01, naturalBounds.h);

  const previewElements = useMemo(() => {
    if (scaleFactor === 1.0) return baseElements;
    return scaleArchElements(baseElements, scaleFactor);
  }, [baseElements, scaleFactor]);

  const previewLevels = useMemo<Project['levels']>(() => {
    if (externalImport?.isBimImport && externalImport.levels?.length) return externalImport.levels;
    return [{ id: PREVIEW_LEVEL_ID, name: 'Level 1', zElevation: 0, height: 3, order: 0 }];
  }, [externalImport]);

  const previewActiveLevelId = previewLevels[0]?.id || PREVIEW_LEVEL_ID;

  const previewProject = useMemo<Project>(() => ({
    // Render through the active canvas project configuration so wall/opening
    // styles, layers, 3D properties, and future Canvas improvements stay shared.
    ...(canvasProjectTemplate || {}),
    name: 'Preview',
    mode: 'floorplan',
    levels: previewLevels,
    elements: previewElements,
    viewBox: canvasProjectTemplate?.viewBox || { width: 800, height: 600 }
  }), [canvasProjectTemplate, previewElements, previewLevels]);

  const previewEditorState = useMemo<EditorState>(() => ({
    zoom,
    offset,
    selectedIds: [],
    isPanning: false,
    activeTool: 'select',
    activeLevelId: previewActiveLevelId,
    isGridVisible: true,
    isSnapEnabled: false,
    isWallMode: false,
    unitSystem,
    viewMode: '2D',
    isOrthoEnabled: false,
    isEndpointSnap: false,
    isMidpointSnap: false,
    isIntersectionSnap: false,
    isPointAlignmentSnap: false,
    isAngularAlignmentSnap: false,
    isSiteMapVisible: false,
    canvasAngle: 0,
  }), [zoom, offset, unitSystem, previewActiveLevelId]);

  const previewBounds = useMemo(() => {
    return measureElements(previewElements, !isExternalImport, isText4IsolatedMode && !isExternalImport);
  }, [previewElements, isExternalImport, isText4IsolatedMode, measureElements]);

  const screenBounds = useMemo(() => {
    const { minX, maxX, minY, maxY } = previewBounds;
    return {
      left: minX * zoom + offset.x,
      right: maxX * zoom + offset.x,
      top: minY * zoom + offset.y,
      bottom: maxY * zoom + offset.y,
    };
  }, [previewBounds, zoom, offset]);

  useEffect(() => {
    if (currentW && currentH) {
      setInputW(formatDimension(currentW, unitSystem));
      setInputH(formatDimension(currentH, unitSystem));
    }
  }, [scaleFactor, unitSystem, currentW, currentH]);

  useEffect(() => {
    if (isOpen) {
      const openText4hImageTest = initialMode === 'chat-v4h' && initialText4hImageTest && !externalImport;
      setMode(initialMode);
      setStep(openText4hImageTest ? 'text4d-image-test' : 'input');
      setIsDragging(false);
      setChatHistory([{ role: 'model', text: "Hi! I'm your Architectural Copilot. Describe what you want to design. You may answer only the questions you know - I'll handle the rest! (You can also switch to Redraw to upload an existing plan.)" }]);
      setUserInput('');
      setIsTyping(false);
      setDesignSummary('');
      setText4cBrief(createEmptyText4cBrief());
      text4cBriefDirtyRef.current = false;
      text4cVariationIndexRef.current = Math.floor(Math.random() * 3);
      setText4dBrief(createEmptyText4dBrief());
      text4dBriefDirtyRef.current = false;
      text4dVariationIndexRef.current = Math.floor(Math.random() * 3);
      setText4eBrief(createEmptyText4eBrief());
      text4eBriefDirtyRef.current = false;
      text4eVariationIndexRef.current = Math.floor(Math.random() * 3);
      setText4fBrief(createEmptyText4fBrief());
      text4fBriefDirtyRef.current = false;
      text4fVariationIndexRef.current = Math.floor(Math.random() * 3);
      setText4gBrief(createEmptyText4gBrief());
      text4gBriefDirtyRef.current = false;
      text4gVariationIndexRef.current = Math.floor(Math.random() * 3);
      setText4gComparisonResults(null);
      setSelectedText4gComparison('master');
      setText4hBrief(createEmptyText4hBrief());
      text4hBriefDirtyRef.current = false;
      text4hVariationIndexRef.current = Math.floor(Math.random() * 3);
      setText4hComparisonResults(null);
      setSelectedText4hComparison('master');
      setAutoScanGeneratedImage(null);
      setShowAutoScanGeneratedImage(false);
      setAutoPlanImageVisibility({ master: false, local: false });
      setShowImageToJsonLogs(false);
      setText4jBrief(createEmptyText4jBrief());
      text4jBriefDirtyRef.current = false;
      text4jVariationIndexRef.current = Math.floor(Math.random() * 3);
      setText4jComparisonResults(null);
      setSelectedText4jComparison('local');
      setSelectedImage(null);
      setSelectedFile(null);
      setText4dConversionSource(null);
      setText4dDirectUploadScale({
        unitSystem: unitSystem === 'imperial' ? 'imperial' : 'metric',
        width: '',
        depth: '',
        area: '',
      });
      setText4eConversionSource(null);
      setText4eDirectUploadScale({
        unitSystem: unitSystem === 'imperial' ? 'imperial' : 'metric', width: '', depth: '', area: '',
      });
      setText4fConversionSource(null);
      setText4fDirectUploadScale({
        unitSystem: unitSystem === 'imperial' ? 'imperial' : 'metric', width: '', depth: '', area: '',
      });
      setText4gConversionSource(null);
      setText4gDirectUploadScale({
        unitSystem: unitSystem === 'imperial' ? 'imperial' : 'metric', width: '', depth: '', area: '',
      });
      setText4hConversionSource(openText4hImageTest ? 'uploaded-test' : null);
      setText4hDirectUploadScale({
        unitSystem: unitSystem === 'imperial' ? 'imperial' : 'metric', width: '', depth: '', area: '',
      });
      setText4jConversionSource(null);
      setText4jDirectUploadScale({
        unitSystem: unitSystem === 'imperial' ? 'imperial' : 'metric', width: '', depth: '', area: '',
      });
      setGeneratedData(null);
      setIsText4dDigitizationPending(false);
      setRawTracerData(null);
      setError(null);
      setTracerOverlap(80);
      setTracerConfidence(50);
      setFallbackUrl(null);
      setInfoMessage(null);
      setCountdown(0);
      setBaseElements([]);
      setScaleFactor(1.0);
      setInputW('');
      setInputH('');
      setImportConversionMode('underlay');
      if (externalImport) {
        setStep('preview');
        setBaseElements(externalImport.isBimImport ? externalImport.elements : normalizeToPreviewLevel(externalImport.elements));
        setChatHistory([{ role: 'model', text: externalImport.isBimImport
          ? `Review "${externalImport.fileName}", then click Convert to Interactive to create native Main Canvas elements.`
          : `Review "${externalImport.fileName}", scale it with the same dimension controls, then continue to choose how it should be imported.` }]);
      }
    }
  }, [isOpen, externalImport, initialMode, initialText4hImageTest]);

  useEffect(() => {
    if (!isOpen || !isText4ReplicaMode) return;
    const controller = new AbortController();
    const startedAt = performance.now();
    fetch(isText4jMode ? '/api/text4j/auth/warm' : isText4hMode ? '/api/text4h/auth/warm' : isText4gMode ? '/api/text4g/auth/warm' : isText4fMode ? '/api/text4f/auth/warm' : isText4eMode ? '/api/text4e/auth/warm' : isText4dMode ? '/api/text4d/auth/warm' : '/api/text2plan/auth/warm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: controller.signal,
    }).then(async response => {
      if (!response.ok) throw new Error(await response.text());
      const result = await response.json();
      console.debug(`[Text 4.0 ${isText4jMode ? 'J' : isText4hMode ? 'H' : isText4gMode ? 'G' : isText4fMode ? 'F' : isText4eMode ? 'E' : isText4dMode ? 'D' : 'C'}] Background Vertex auth ready in ${Math.round(performance.now() - startedAt)}ms (server ${result.warmupMs ?? '?'}ms)`);
    }).catch(error => {
      if (error?.name !== 'AbortError') console.warn(`[Text 4.0 ${isText4jMode ? 'J' : isText4hMode ? 'H' : isText4gMode ? 'G' : isText4fMode ? 'F' : isText4eMode ? 'E' : isText4dMode ? 'D' : 'C'}] Background Vertex auth warm-up failed; image generation will retry.`, error);
    });
    return () => controller.abort();
  }, [isOpen, mode, isText4ReplicaMode, isText4dMode, isText4eMode, isText4fMode, isText4gMode, isText4hMode, isText4jMode]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  useEffect(() => {
    if (step === 'preview' && generatedData && !externalImport) {
      const elements = mapToArchElements(generatedData);
      setBaseElements(isText4jMode ? markText4jAuthoritativePreview(elements) : isText4hMode ? markText4hAuthoritativePreview(elements) : isText4gMode ? markText4gAuthoritativePreview(elements) : isText4fMode ? markText4fAuthoritativePreview(elements) : elements);
      setScaleFactor(1.0);
    }
  }, [step, generatedData, externalImport, isText4fMode, isText4gMode, isText4hMode, isText4jMode]);

  useLayoutEffect(() => {
    if (!isOpen || step !== 'preview' || previewBounds.w <= 0 || previewBounds.h <= 0) return;

    const autoFitKey = externalImport
      ? `external:${externalImport.fileName}:${previewElements.length}:${previewBounds.minX}:${previewBounds.minY}:${previewBounds.maxX}:${previewBounds.maxY}`
      : `generated:${previewElements.length}:${previewBounds.minX}:${previewBounds.minY}:${previewBounds.maxX}:${previewBounds.maxY}`;
    if (lastAutoFitKeyRef.current === autoFitKey) return;

    let frameA = 0;
    let frameB = 0;
    const fitToPreviewCanvas = () => {
      const canvas = previewCanvasHostRef.current?.querySelector('canvas');
      const rect = canvas?.getBoundingClientRect() || previewCanvasHostRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 1 || rect.height <= 1) return;

      const padWorld = Math.max(1, Math.max(previewBounds.w, previewBounds.h) * 0.08);
      const fitWidth = previewBounds.w + padWorld * 2;
      const fitHeight = previewBounds.h + padWorld * 2;
      const nextZoom = Math.max(0.01, Math.min(rect.width / fitWidth, rect.height / fitHeight, 40));
      const centerX = (previewBounds.minX + previewBounds.maxX) / 2;
      const centerY = (previewBounds.minY + previewBounds.maxY) / 2;

      lastAutoFitKeyRef.current = autoFitKey;
      setZoom(nextZoom);
      setOffset({
        x: rect.width / 2 - centerX * nextZoom,
        y: rect.height / 2 - centerY * nextZoom,
      });
    };

    frameA = window.requestAnimationFrame(() => {
      frameB = window.requestAnimationFrame(fitToPreviewCanvas);
    });
    return () => {
      window.cancelAnimationFrame(frameA);
      window.cancelAnimationFrame(frameB);
    };
  }, [isOpen, step, externalImport, previewElements.length, previewBounds]);

  // Tracer Real-time Updates (Split logic for Overlap vs Confidence)
  useEffect(() => {
    if (mode !== 'tracer' || step !== 'preview' || !selectedFile) return;

    // 1. Confidence Change: Client-side Filter (Immediate/Fast)
    if (rawTracerData) {
        const newData = mapTracerDataToArchElements(rawTracerData, tracerConfidence, selectedFile);
        setGeneratedData(newData);
    }

  }, [tracerConfidence, rawTracerData, selectedFile, mode, step]);

  useEffect(() => {
    if (mode !== 'tracer' || step !== 'preview' || !selectedFile) return;

    // 2. Overlap Change: Server-side Re-fetch (Debounced)
    // Only fetch if overlap changed, not if just confidence changed (handled above)
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(() => {
       handleGenerateTracer(true); // Silent re-fetch
    }, 600);

    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); }
  }, [tracerOverlap]);

  // Paste Listener for Manual Fallback
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (step !== 'manual-fallback') return;
      
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const blob = items[i].getAsFile();
          if (blob) {
            setStep('generating'); // Show loading state
            const reader = new FileReader();
            reader.onload = async (event) => {
              const base64 = event.target?.result as string;
              try {
                  const result = await generateFloorplanRedrawV2(base64);
                  setGeneratedData(result);
                  setStep('preview');
              } catch (err) {
                  console.error(err);
                  setError("Failed to process the pasted image. Please try uploading manually in Redraw mode.");
                  setStep('manual-fallback');
              }
            };
            reader.readAsDataURL(blob);
          }
          return;
        }
      }
    };
    
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [step]);

  useEffect(() => {
    if (countdown > 0) {
        timerRef.current = window.setInterval(() => {
            setCountdown(prev => prev - 1);
        }, 1000);
    } else if (countdown <= 0) {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (infoMessage) {
          setInfoMessage(null);
        }
    }
    return () => {
        if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [countdown, infoMessage]);

  // --- HANDLERS ---

  const extractInfoFromHistory = (history: { role: string, text: string }[]) => {
    let program = "";
    let size = "";
    let rooms: string[] = [];
    let adjacency: string[] = [];
    let style = "";
    let floors = "";
    let labels = "\u2705 Room Labels (ON)";

    history.forEach(h => {
      const txt = h.text.toLowerCase();

      // 1. Program
      if (txt.includes("apartment")) program = "Program: Residential, Category: Apartment, Type: Apartment";
      else if (txt.includes("house") || txt.includes("home")) program = "Program: Residential, Category: House, Type: House";
      else if (txt.includes("villa")) program = "Program: Residential, Category: Villa, Type: Villa";
      else if (txt.includes("office")) program = "Program: Commercial, Category: Office, Type: Office";

      // 2. Size / Dimensions
      const dimMatch = h.text.match(/(\d+)\s*(?:ft|m)?\s*[x\u00d7]\s*(\d+)\s*(?:ft|m)?/i);
      const areaMatch = h.text.match(/(\d+[,.]?\d*)\s*(?:sq\s*ft|sft|sqft|sqm|sq\s*m|square\s*feet|square\s*meters)/i);
      if (dimMatch) {
        const w = parseInt(dimMatch[1]);
        const h = parseInt(dimMatch[2]);
        size = `${w * h} sq ft (${w}' x ${h}')`;
      } else if (areaMatch) {
        const areaVal = parseFloat(areaMatch[1].replace(',', ''));
        const w = Math.round(Math.sqrt(areaVal / 1.5));
        const h = Math.round(w * 1.5);
        size = `${areaVal} sq ft (${w}' x ${h}')`;
      }

      // 3. Rooms
      const bedMatch = h.text.match(/(\d+)\s*(?:bed|bedroom)/i);
      const bathMatch = h.text.match(/(\d+)\s*(?:bath|bathroom)/i);
      const kitchenMatch = h.text.match(/(\d+)\s*(?:kitchen)/i);
      const livingMatch = h.text.match(/(\d+)\s*(?:living|lounge|family)/i);

      if (bedMatch) {
        rooms = rooms.filter(r => !r.includes("Bedrooms"));
        rooms.push(`- ${bedMatch[1]} Bedrooms`);
      }
      if (bathMatch) {
        rooms = rooms.filter(r => !r.includes("Bathrooms"));
        rooms.push(`- ${bathMatch[1]} Bathrooms`);
      }
      if (kitchenMatch) {
        rooms = rooms.filter(r => !r.includes("Kitchen"));
        rooms.push(`- ${kitchenMatch[1]} Kitchen`);
      }
      if (livingMatch) {
        rooms = rooms.filter(r => !r.includes("Living"));
        rooms.push(`- ${livingMatch[1]} Living Area`);
      }

      // 4. Floors
      if (txt.includes("single story") || txt.includes("one story") || txt.includes("1 story") || txt.includes("single-story")) floors = "Single-story";
      else if (txt.includes("two story") || txt.includes("2 story") || txt.includes("double story") || txt.includes("2-storey")) floors = "2-storey";

      // 5. Style
      if (txt.includes("open concept") || txt.includes("open plan")) style = "Open Concept";
      else if (txt.includes("closed plan") || txt.includes("closed concept")) style = "Closed Plan";
    });

    return { program, size, rooms: rooms.join("\n"), adjacency: adjacency.join("\n"), style, floors, labels };
  };

  const handleText4cBriefChange = useCallback((nextBrief: ConfirmedText4cBrief) => {
    text4cBriefDirtyRef.current = true;
    setText4cBrief(nextBrief);
    setDesignSummary(text4cBriefToDesignSummary(nextBrief));
    setError(null);
  }, []);

  const handleText4dBriefChange = useCallback((nextBrief: ConfirmedText4dBrief) => {
    text4dBriefDirtyRef.current = true;
    setText4dBrief(nextBrief);
    setDesignSummary(text4dBriefToDesignSummary(nextBrief));
    setError(null);
  }, []);

  const handleText4eBriefChange = useCallback((nextBrief: ConfirmedText4eBrief) => {
    text4eBriefDirtyRef.current = true;
    setText4eBrief(nextBrief);
    setDesignSummary(text4eBriefToDesignSummary(nextBrief));
    setError(null);
  }, []);

  const handleText4fBriefChange = useCallback((nextBrief: ConfirmedText4fBrief) => {
    text4fBriefDirtyRef.current = true;
    setText4fBrief(nextBrief);
    setDesignSummary(text4fBriefToDesignSummary(nextBrief));
    setError(null);
  }, []);

  const handleText4gBriefChange = useCallback((nextBrief: ConfirmedText4gBrief) => {
    text4gBriefDirtyRef.current = true;
    setText4gBrief(nextBrief);
    setDesignSummary(text4gBriefToDesignSummary(nextBrief));
    setError(null);
  }, []);

  const handleText4hBriefChange = useCallback((nextBrief: ConfirmedText4hBrief) => {
    text4hBriefDirtyRef.current = true;
    setText4hBrief(nextBrief);
    setDesignSummary(text4hBriefToDesignSummary(nextBrief));
    setError(null);
  }, []);

  const handleText4jBriefChange = useCallback((nextBrief: ConfirmedText4jBrief) => {
    text4jBriefDirtyRef.current = true;
    setText4jBrief(nextBrief);
    setDesignSummary(text4jBriefToDesignSummary(nextBrief));
    setError(null);
  }, []);

  const handleSendMessage = async () => {
    if (!userInput.trim()) return;
    const newHistory = [...chatHistory, { role: 'user' as const, text: userInput }];
    setChatHistory(newHistory);
    setUserInput('');
    setIsTyping(true);
    try {
      const variationIndex = isText4jMode ? text4jVariationIndexRef.current : isText4hMode ? text4hVariationIndexRef.current : isText4gMode ? text4gVariationIndexRef.current : isText4fMode ? text4fVariationIndexRef.current : isText4eMode ? text4eVariationIndexRef.current : isText4dMode ? text4dVariationIndexRef.current : text4cVariationIndexRef.current;
      const result = await refineRequirementsForMode(mode, newHistory, variationIndex);
      setIsTyping(false);
      
      const updatedHistory = [...newHistory, { role: 'model' as const, text: result.reply }];
      setChatHistory(updatedHistory);

      if (result.summary) {
        if (isText4jMode) {
          if (!text4jBriefDirtyRef.current) {
            const nextBrief = applyText4jRectangularBoundaryPolicy(
              legacySummaryToText4jBrief(result.summary, text4jBrief, 'model_inferred'),
              newHistory.filter(message => message.role === 'user').map(message => message.text).join('\n'),
            );
            setText4jBrief(nextBrief);
            setDesignSummary(text4jBriefToDesignSummary(nextBrief));
          }
        } else if (isText4hMode) {
          if (!text4hBriefDirtyRef.current) {
            const nextBrief = applyText4hRectangularBoundaryPolicy(
              legacySummaryToText4hBrief(result.summary, text4hBrief, 'model_inferred'),
              newHistory.filter(message => message.role === 'user').map(message => message.text).join('\n'),
            );
            setText4hBrief(nextBrief);
            setDesignSummary(text4hBriefToDesignSummary(nextBrief));
          }
        } else if (isText4gMode) {
          if (!text4gBriefDirtyRef.current) {
            const nextBrief = applyText4gRectangularBoundaryPolicy(
              legacySummaryToText4gBrief(result.summary, text4gBrief, 'model_inferred'),
              newHistory.filter(message => message.role === 'user').map(message => message.text).join('\n'),
            );
            setText4gBrief(nextBrief);
            setDesignSummary(text4gBriefToDesignSummary(nextBrief));
          }
        } else if (isText4fMode) {
          if (!text4fBriefDirtyRef.current) {
            const nextBrief = applyText4fRectangularBoundaryPolicy(
              legacySummaryToText4fBrief(result.summary, text4fBrief, 'model_inferred'),
              newHistory.filter(message => message.role === 'user').map(message => message.text).join('\n'),
            );
            setText4fBrief(nextBrief);
            setDesignSummary(text4fBriefToDesignSummary(nextBrief));
          }
        } else if (isText4eMode) {
          if (!text4eBriefDirtyRef.current) {
            const nextBrief = applyText4eRectangularBoundaryPolicy(
              legacySummaryToText4eBrief(result.summary, text4eBrief, 'model_inferred'),
              newHistory.filter(message => message.role === 'user').map(message => message.text).join('\n'),
            );
            setText4eBrief(nextBrief);
            setDesignSummary(text4eBriefToDesignSummary(nextBrief));
          }
        } else if (isText4dMode) {
          if (!text4dBriefDirtyRef.current) {
            const nextBrief = applyText4dRectangularBoundaryPolicy(
              legacySummaryToText4dBrief(result.summary, text4dBrief, 'model_inferred'),
              newHistory.filter(message => message.role === 'user').map(message => message.text).join('\n'),
            );
            setText4dBrief(nextBrief);
            setDesignSummary(text4dBriefToDesignSummary(nextBrief));
          }
        } else if (isText4cMode) {
          if (!text4cBriefDirtyRef.current) {
            const nextBrief = legacySummaryToText4cBrief(result.summary, text4cBrief, 'model_inferred');
            setText4cBrief(nextBrief);
            setDesignSummary(text4cBriefToDesignSummary(nextBrief));
          }
        } else {
          setDesignSummary(result.summary);
        }
      } else if (isStructuredChatMode(mode)) {
        // Real-time parsing from chat history to update right panel fields incrementally
        const inferred = extractInfoFromHistory(updatedHistory);
        const currentData = parseV2Summary(designSummary);
        const mergedData = {
          program: inferred.program || currentData.program,
          size: inferred.size || currentData.size,
          rooms: inferred.rooms || currentData.rooms,
          adjacency: inferred.adjacency || currentData.adjacency,
          style: inferred.style || currentData.style,
          floors: inferred.floors || currentData.floors,
          labels: inferred.labels || currentData.labels,
        };
        const nextSummary = constructV2Summary(mergedData);
        if (isText4jMode) {
          if (!text4jBriefDirtyRef.current) {
            const nextBrief = applyText4jRectangularBoundaryPolicy(
              legacySummaryToText4jBrief(nextSummary, text4jBrief, 'model_inferred'),
              newHistory.filter(message => message.role === 'user').map(message => message.text).join('\n'),
            );
            setText4jBrief(nextBrief);
            setDesignSummary(text4jBriefToDesignSummary(nextBrief));
          }
        } else if (isText4hMode) {
          if (!text4hBriefDirtyRef.current) {
            const nextBrief = applyText4hRectangularBoundaryPolicy(
              legacySummaryToText4hBrief(nextSummary, text4hBrief, 'model_inferred'),
              newHistory.filter(message => message.role === 'user').map(message => message.text).join('\n'),
            );
            setText4hBrief(nextBrief);
            setDesignSummary(text4hBriefToDesignSummary(nextBrief));
          }
        } else if (isText4gMode) {
          if (!text4gBriefDirtyRef.current) {
            const nextBrief = applyText4gRectangularBoundaryPolicy(
              legacySummaryToText4gBrief(nextSummary, text4gBrief, 'model_inferred'),
              newHistory.filter(message => message.role === 'user').map(message => message.text).join('\n'),
            );
            setText4gBrief(nextBrief);
            setDesignSummary(text4gBriefToDesignSummary(nextBrief));
          }
        } else if (isText4fMode) {
          if (!text4fBriefDirtyRef.current) {
            const nextBrief = applyText4fRectangularBoundaryPolicy(
              legacySummaryToText4fBrief(nextSummary, text4fBrief, 'model_inferred'),
              newHistory.filter(message => message.role === 'user').map(message => message.text).join('\n'),
            );
            setText4fBrief(nextBrief);
            setDesignSummary(text4fBriefToDesignSummary(nextBrief));
          }
        } else if (isText4eMode) {
          if (!text4eBriefDirtyRef.current) {
            const nextBrief = applyText4eRectangularBoundaryPolicy(
              legacySummaryToText4eBrief(nextSummary, text4eBrief, 'model_inferred'),
              newHistory.filter(message => message.role === 'user').map(message => message.text).join('\n'),
            );
            setText4eBrief(nextBrief);
            setDesignSummary(text4eBriefToDesignSummary(nextBrief));
          }
        } else if (isText4dMode) {
          if (!text4dBriefDirtyRef.current) {
            const nextBrief = applyText4dRectangularBoundaryPolicy(
              legacySummaryToText4dBrief(nextSummary, text4dBrief, 'model_inferred'),
              newHistory.filter(message => message.role === 'user').map(message => message.text).join('\n'),
            );
            setText4dBrief(nextBrief);
            setDesignSummary(text4dBriefToDesignSummary(nextBrief));
          }
        } else if (isText4cMode) {
          if (!text4cBriefDirtyRef.current) {
            const nextBrief = legacySummaryToText4cBrief(nextSummary, text4cBrief, 'model_inferred');
            setText4cBrief(nextBrief);
            setDesignSummary(text4cBriefToDesignSummary(nextBrief));
          }
        } else {
          setDesignSummary(nextSummary);
        }
      }

      if (result.isReady && result.summary && (mode as any) !== 'chat-v2' && (mode as any) !== 'chat-v3' && (mode as any) !== 'chat-v4' && (mode as any) !== 'chat-v4a' && (mode as any) !== 'chat-v4b' && (mode as any) !== 'chat-v4c' && (mode as any) !== 'chat-v4d' && (mode as any) !== 'chat-v4e' && (mode as any) !== 'chat-v4f' && (mode as any) !== 'chat-v4g' && (mode as any) !== 'chat-v4h' && (mode as any) !== 'chat-v4j') {
        setTimeout(() => setStep('summary'), 1500);
      }
    } catch (err) {
      console.error(err);
      setIsTyping(false);
      setChatHistory(prev => [...prev, { role: 'model', text: "I encountered an error processing that. Could you try rephrasing?" }]);
    }
  };

  const generate = async (apiCall: () => Promise<any>, silent = false, trackText4dDigitization = false) => {
    if (trackText4dDigitization) setIsText4dDigitizationPending(true);
    if (!silent) {
        setStep('generating');
        setError(null);
        setInfoMessage(null);
    }
    if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
    }
    setCountdown(0);
    try {
      const result = await apiCall();
      const authoritativeResult = completeGeometryForMode(mode, result, designSummary);
      setGeneratedData(authoritativeResult);
      setStep('preview');
    } catch (e: any) {
        const errorMessage = (e.toString() || '').toLowerCase();
        if (errorMessage.includes('429') || errorMessage.includes('quota') || errorMessage.includes('resource_exhausted') || errorMessage.includes('rate limit')) {
            setInfoMessage("We're experiencing high traffic at the moment. Your request is queued.");
            setCountdown(345); // 5 minutes 45 seconds
            if (isText4ReplicaMode) {
              setStep('input');
            } else if (mode === 'chat' || (mode as any) === 'chat-v2' || (mode as any) === 'chat-v3' || (mode as any) === 'chat-v4' || (mode as any) === 'chat-v4a' || (mode as any) === 'chat-v4b' || mode === 'text2plan' || mode === 'smart-text2plan' || mode === 'reference' || mode === 'fusion') {
              setStep('summary');
            } else {
              setStep('input');
            }
        } else {
            console.error(e);
            if (!silent) {
                setError(e.message || "Failed to generate geometry. Please try again.");
                if (isText4ReplicaMode) {
                  setStep('input');
                } else if (mode === 'chat' || (mode as any) === 'chat-v2' || (mode as any) === 'chat-v3' || (mode as any) === 'chat-v4' || (mode as any) === 'chat-v4a' || (mode as any) === 'chat-v4b' || mode === 'text2plan' || mode === 'smart-text2plan' || mode === 'reference' || mode === 'fusion') {
                  setStep('summary');
                } else {
                  setStep('input');
                }
            }
        }
    } finally {
      if (trackText4dDigitization) setIsText4dDigitizationPending(false);
    }
  }

  const formatText4gSeconds = (durationMs?: number) =>
    durationMs === undefined ? '...' : `${(durationMs / 1000).toFixed(2)} sec`;

  const summarizeText4gResult = (data?: GeneratedData) => {
    const metrics = data?.extractionDiagnostics?.metrics;
    const walls = metrics?.wallCount ?? data?.walls?.length ?? 0;
    const spaces = metrics?.enclosedSpaceCount ?? data?.rooms?.length ?? 0;
    const openings = metrics
      ? metrics.detectedDoorCount + metrics.detectedWindowCount + metrics.detectedOpeningCount
      : (data?.doors?.length ?? 0) + (data?.windows?.length ?? 0) + (data?.openings?.length ?? 0);
    return { walls, spaces, openings };
  };

  const exportText4gComparisonJson = (data: GeneratedData | undefined, key: Text4gComparisonKey) => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Text_4_0_${isText4jMode ? 'J' : isText4hMode ? 'H' : 'G'}_${key === 'master' ? (isText4jMode ? 'Structured3D_Candidates' : 'Gemini_Master') : (isText4jMode ? 'Hybrid_Final' : 'Local_Fallback')}_floorplan.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const safeText4gFilePart = (value: string) =>
    value.replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'unknown';

  const downloadText4gBlob = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  const downloadText4gDataUrl = (dataUrl: string, fileName: string) => {
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const getText4gSourceImageExtension = (dataUrl: string) => {
    const mime = /^data:(image\/[a-zA-Z0-9.+-]+);base64,/.exec(dataUrl)?.[1] || 'image/png';
    if (/jpe?g/i.test(mime)) return 'jpg';
    if (/webp/i.test(mime)) return 'webp';
    return 'png';
  };

  const getText4gDigitizingDimensionLabel = () => {
    const activeScale = isText4hMode ? text4hDirectUploadScale : text4gDirectUploadScale;
    const activeBrief = isText4hMode ? text4hBrief : text4gBrief;
    const unit = activeScale.unitSystem === 'imperial' ? 'ft' : 'm';
    const directParts = [
      activeScale.width ? `W${activeScale.width}${unit}` : '',
      activeScale.depth ? `D${activeScale.depth}${unit}` : '',
      activeScale.area ? `A${activeScale.area}${activeScale.unitSystem === 'imperial' ? 'sqft' : 'sqm'}` : '',
    ].filter(Boolean);
    if (directParts.length) return safeText4gFilePart(directParts.join('_'));

    const envelope = activeBrief.dimensions.envelope;
    if (envelope.width || envelope.depth) {
      return safeText4gFilePart([
        envelope.width ? `W${envelope.width}${envelope.unit}` : '',
        envelope.depth ? `D${envelope.depth}${envelope.unit}` : '',
      ].filter(Boolean).join('_'));
    }

    if (currentW > 0 || currentH > 0) {
      return safeText4gFilePart(`W${currentW.toFixed(2)}m_D${currentH.toFixed(2)}m`);
    }
    return 'dimensions-unspecified';
  };

  const downloadAllText4gTestData = () => {
    const comparisonResults = isText4hMode ? text4hComparisonResults : text4gComparisonResults;
    const comparisonCanvasRefs = isText4hMode ? text4hComparisonCanvasRefs : text4gComparisonCanvasRefs;
    if (!comparisonResults) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sourceKind = (isText4hMode ? text4hConversionSource : text4gConversionSource) || 'unknown-source';
    const dimensions = getText4gDigitizingDimensionLabel();
    const prefix = `Text_4_0_${isText4hMode ? 'H' : 'G'}_${safeText4gFilePart(sourceKind)}_${dimensions}_${timestamp}`;
    const sourceImage = generatedData?.sourceImageBase64 || selectedImage;

    if (sourceImage) {
      downloadText4gDataUrl(sourceImage, `${prefix}_01_input-image_${dimensions}.${getText4gSourceImageExtension(sourceImage)}`);
    }

    (['master', 'local'] as Text4gComparisonKey[]).forEach(key => {
      const result = comparisonResults[key];
      if (result.status === 'done' && result.data) {
        downloadText4gBlob(
          new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' }),
          `${prefix}_${key === 'master' ? '02_gemini-master-json' : '03_local-fallback-json'}.json`,
        );
      }
      const canvas = comparisonCanvasRefs.current[key]?.querySelector('canvas');
      if (canvas) {
        downloadText4gDataUrl(
          canvas.toDataURL('image/png'),
          `${prefix}_${key === 'master' ? '04_gemini-master-screenshot' : '05_local-fallback-screenshot'}.png`,
        );
      }
    });

    const logPayload = {
      mode: `Text 4.0 ${isText4hMode ? 'H' : 'G'}`,
      timestamp,
      sourceKind,
      digitizingDimensions: dimensions,
      selectedResult: isText4hMode ? selectedText4hComparison : selectedText4gComparison,
      brief: isText4hMode ? text4hBrief : text4gBrief,
      summary: designSummary,
      results: Object.fromEntries((['master', 'local'] as Text4gComparisonKey[]).map(key => {
        const result = comparisonResults[key];
        return [key, {
          label: result.label,
          status: result.status,
          durationMs: result.durationMs,
          durationSeconds: result.durationMs === undefined ? undefined : Number((result.durationMs / 1000).toFixed(2)),
          error: result.error,
          counts: summarizeText4gResult(result.data),
          diagnostics: result.data?.extractionDiagnostics,
        }];
      })),
    };
    downloadText4gBlob(
      new Blob([JSON.stringify(logPayload, null, 2)], { type: 'application/json' }),
      `${prefix}_06_comparison-logs.json`,
    );
  };

  const handleGenerateMasterFloorplanData = async () => {
    const comparisonContext = isText4hMode ? text4hComparisonContext : text4gComparisonContext;
    const comparisonResults = isText4hMode ? text4hComparisonResults : text4gComparisonResults;
    const setComparisonResults = isText4hMode ? setText4hComparisonResults : setText4gComparisonResults;
    const setSelectedComparison = isText4hMode ? setSelectedText4hComparison : setSelectedText4gComparison;
    if (!comparisonContext || comparisonResults?.master?.status === 'pending') return;
    const { base64Image, confirmedBrief, requestedBoundary, requestedExtentsMeters, sourceKind, summary } = comparisonContext;

    setComparisonResults((prev: any) => prev ? {
      ...prev,
      master: {
        ...prev.master,
        status: 'pending',
        error: undefined,
      },
    } : prev);

    const startedAt = performance.now();
    try {
      const data = isText4hMode
        ? await transcribeText4hMasterFloorplanData({
          imageBase64: base64Image,
          brief: confirmedBrief as ConfirmedText4hBrief,
          requestedBoundary,
          requestedExtentsMeters,
          sourceKind,
          thinkingLevel: text4hMasterThinkingLevel,
        })
        : await transcribeText4gMasterFloorplanData({
          imageBase64: base64Image,
          brief: confirmedBrief as ConfirmedText4gBrief,
          requestedBoundary,
          requestedExtentsMeters,
          sourceKind,
          thinkingLevel: text4gMasterThinkingLevel,
        });
      const completedData = completeGeometryForMode(mode, { ...data, sourceImageBase64: base64Image }, summary);
      setComparisonResults((prev: any) => prev ? {
        ...prev,
        master: {
          ...prev.master,
          status: 'done',
          durationMs: performance.now() - startedAt,
          data: completedData,
        },
      } : prev);
      setSelectedComparison('master' as any);
      setGeneratedData(completedData);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Unknown conversion error');
      setComparisonResults((prev: any) => prev ? {
        ...prev,
        master: {
          ...prev.master,
          status: 'error',
          durationMs: performance.now() - startedAt,
          error: message,
        },
      } : prev);
    }
  };

  const runText4gComparisonConversion = async (
    base64Image: string,
    confirmedBrief: ConfirmedText4gBrief | ConfirmedText4hBrief,
    requestedBoundary: Point[] | undefined,
    requestedExtentsMeters: { width?: number; depth?: number } | undefined,
    sourceKind: 'generated' | 'uploaded',
    summary: string,
  ) => {
    const useText4h = isText4hMode;
    const setComparisonContext = useText4h ? setText4hComparisonContext : setText4gComparisonContext;
    const setComparisonResults = useText4h ? setText4hComparisonResults : setText4gComparisonResults;
    const setSelectedComparison = useText4h ? setSelectedText4hComparison : setSelectedText4gComparison;
    setComparisonContext({
      base64Image,
      confirmedBrief: confirmedBrief as any,
      requestedBoundary,
      requestedExtentsMeters,
      sourceKind,
      summary,
    });
    const initialResults = {
      master: { key: 'master', label: 'Gemini Master JSON', status: 'idle' },
      local: { key: 'local', label: 'Local Fallback JSON', status: 'pending' },
    } as Text4gComparisonResults & Text4hComparisonResults;
    setComparisonResults(initialResults as any);
    setSelectedComparison('local' as any);
    setGeneratedData(null);
    setStep('generating');
    setIsText4dDigitizationPending(true);

    let shownFirstResult = false;
    const commitResult = (key: Text4gComparisonKey | Text4hComparisonKey, data: GeneratedData, durationMs: number) => {
      const completedData = completeGeometryForMode(mode, { ...data, sourceImageBase64: base64Image }, summary);
      setComparisonResults((prev: any) => ({
        ...(prev || initialResults),
        [key]: {
          ...(prev?.[key] || initialResults[key]),
          status: 'done',
          durationMs,
          data: completedData,
        },
      }));
      if (!shownFirstResult) {
        shownFirstResult = true;
        setSelectedComparison(key as any);
        setGeneratedData(completedData);
        setStep('preview');
      }
    };
    const commitError = (key: Text4gComparisonKey | Text4hComparisonKey, error: unknown, durationMs: number) => {
      const message = error instanceof Error ? error.message : String(error || 'Unknown conversion error');
      setComparisonResults((prev: any) => ({
        ...(prev || initialResults),
        [key]: {
          ...(prev?.[key] || initialResults[key]),
          status: 'error',
          durationMs,
          error: message,
        },
      }));
    };

    const localTask = (async () => {
      const startedAt = performance.now();
      try {
        const data = useText4h
          ? await convertFloorplanImage4h(base64Image, confirmedBrief as ConfirmedText4hBrief, requestedBoundary, {
            workflowStartedAt: Date.now(),
            warmOcr: sourceKind !== 'generated',
            annotateGeneratedPreview: false,
            requestedExtentsMeters,
            preventFallbackForCurvilinearGenerated: true,
            sourceKind,
            useMasterFloorplanData: false,
          })
          : await convertFloorplanImage4g(base64Image, confirmedBrief as ConfirmedText4gBrief, requestedBoundary, {
          workflowStartedAt: Date.now(),
          warmOcr: sourceKind !== 'generated',
          annotateGeneratedPreview: false,
          requestedExtentsMeters,
          preventFallbackForCurvilinearGenerated: true,
          sourceKind,
          useMasterFloorplanData: false,
        });
        commitResult('local', data, performance.now() - startedAt);
      } catch (error) {
        commitError('local', error, performance.now() - startedAt);
      }
    })();

    await Promise.allSettled([localTask]);
    setIsText4dDigitizationPending(false);
    if (!shownFirstResult) {
      setError(`Text 4.0 ${useText4h ? 'H' : 'G'} local conversion failed. Check the result card for details.`);
      setStep(sourceKind === 'uploaded' ? 'text4d-image-test' : 'summary');
    }
  };

  const runText4hComparisonConversion = runText4gComparisonConversion;

  const runAutoPlanVariants = async (
    confirmedBrief: ConfirmedText4hBrief,
    requestedBoundary: Point[] | undefined,
    summary: string,
  ) => {
    const initialResults: Text4hComparisonResults = {
      master: { key: 'master', label: 'Generated Floorplan - Variant 1', status: 'pending' },
      local: { key: 'local', label: 'Generated Floorplan - Variant 2', status: 'pending' },
    };
    setText4hComparisonContext(null);
    setText4hComparisonResults(initialResults);
    setSelectedText4hComparison('master');
    setAutoPlanImageVisibility({ master: false, local: false });
    setShowImageToJsonLogs(false);
    setSelectedImage(null);
    setGeneratedData(null);
    setStep('generating');
    setIsText4dDigitizationPending(true);

    let shownFirstResult = false;
    const commitVariant = (key: Text4hComparisonKey, data: GeneratedData, durationMs: number) => {
      setText4hComparisonResults(prev => ({
        ...(prev || initialResults),
        [key]: { ...(prev?.[key] || initialResults[key]), status: 'done', durationMs, data },
      }));
      if (!shownFirstResult) {
        shownFirstResult = true;
        setSelectedText4hComparison(key);
        setGeneratedData(data);
        setStep('preview');
      }
    };
    const commitVariantError = (key: Text4hComparisonKey, error: unknown, durationMs: number) => {
      const message = error instanceof Error ? error.message : String(error || 'Unknown generation error');
      setText4hComparisonResults(prev => ({
        ...(prev || initialResults),
        [key]: { ...(prev?.[key] || initialResults[key]), status: 'error', durationMs, error: message },
      }));
    };
    const generateVariant = async (key: Text4hComparisonKey) => {
      const startedAt = performance.now();
      try {
        const variantIndex = key === 'master' ? 1 : 2;
        const image = await generateFloorplanImage4h(confirmedBrief, { variantIndex, variantCount: 2 });
        const geometry = await convertFloorplanImage4h(image, confirmedBrief, requestedBoundary, {
          workflowStartedAt: Date.now(),
          warmOcr: false,
          annotateGeneratedPreview: false,
          preventFallbackForCurvilinearGenerated: true,
          sourceKind: 'generated',
          useMasterFloorplanData: false,
        });
        const completed = completeGeometryForMode(mode, { ...geometry, sourceImageBase64: image }, summary);
        commitVariant(key, completed, performance.now() - startedAt);
      } catch (variantError) {
        commitVariantError(key, variantError, performance.now() - startedAt);
      }
    };

    await Promise.allSettled([
      generateVariant('master'),
      generateVariant('local'),
    ]);
    setIsText4dDigitizationPending(false);
    if (!shownFirstResult) {
      setError('AutoPlan could not generate either floorplan variant. Review the brief and try again.');
      setStep('preview');
    }
  };

  const runText4jHybridConversion = async (
    base64Image: string,
    confirmedBrief: ConfirmedText4jBrief,
    requestedBoundary: Point[] | undefined,
    requestedExtentsMeters: { width?: number; depth?: number } | undefined,
    sourceKind: 'generated' | 'uploaded',
    summary: string,
  ) => {
    const initialResults: Text4jComparisonResults = {
      master: { key: 'master', label: 'Structured3D Geometry', status: 'pending' },
      local: { key: 'local', label: 'J Hybrid Final', status: 'pending' },
    };
    setText4jComparisonResults(initialResults);
    setSelectedText4jComparison('local');
    setGeneratedData(null);
    setStep('generating');
    setIsText4dDigitizationPending(true);
    const startedAt = performance.now();
    try {
      const data = await convertFloorplanImage4j(base64Image, confirmedBrief, requestedBoundary, {
        workflowStartedAt: Date.now(),
        warmOcr: sourceKind !== 'generated',
        annotateGeneratedPreview: false,
        requestedExtentsMeters,
        preventFallbackForCurvilinearGenerated: true,
        sourceKind,
        useMasterFloorplanData: false,
        onStructuredReady: structured => {
          setText4jComparisonResults(previous => ({
            ...(previous || initialResults),
            master: {
              key: 'master',
              label: `Structured3D Geometry (${structured.walls.length} walls)`,
              status: 'done',
              durationMs: performance.now() - startedAt,
              data: text4jStructuredPreviewData(structured, base64Image),
            },
          }));
        },
      });
      const completedData = completeGeometryForMode(mode, { ...data, sourceImageBase64: base64Image }, summary);
      setText4jComparisonResults(previous => ({
        ...(previous || initialResults),
        local: {
          key: 'local',
          label: 'J Hybrid Final',
          status: 'done',
          durationMs: performance.now() - startedAt,
          data: completedData,
        },
      }));
      setSelectedText4jComparison('local');
      setGeneratedData(completedData);
      setStep('preview');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || 'Unknown hybrid conversion error');
      setText4jComparisonResults(previous => {
        const current = previous || initialResults;
        return {
          ...current,
          master: current.master.status === 'pending'
            ? { key: 'master', label: 'Structured3D Geometry', status: 'error', durationMs: performance.now() - startedAt, error: message }
            : current.master,
          local: { key: 'local', label: 'J Hybrid Final', status: 'error', durationMs: performance.now() - startedAt, error: message },
        };
      });
      setError(message);
      // Keep the source image and both pipeline cards visible. Returning to the
      // brief hid the actual integration failure and looked like regeneration.
      setStep('preview');
    } finally {
      setIsText4dDigitizationPending(false);
    }
  };

  const handleGenerateFromChat = () => {
    if (isText4jMode) {
      const validation = validateText4jBrief(text4jBrief);
      if (!validation.valid) {
        setError(`Complete the Design Brief Confirmation: ${validation.errors.join(' ')}`);
        return;
      }
      const confirmedBrief: ConfirmedText4jBrief = {
        ...text4jBrief,
        provenance: { ...text4jBrief.provenance, confirmed: true },
      };
      const confirmedSummary = text4jBriefToDesignSummary(confirmedBrief);
      const requestedBoundary = text4jBriefBoundaryMeters(confirmedBrief);
      setText4jBrief(confirmedBrief);
      setDesignSummary(confirmedSummary);
      setText4jConversionSource('generated');
      setError(null);
      setInfoMessage(null);
      setCountdown(0);
      setStep('generating');
      setIsText4dDigitizationPending(true);
      setText4jComparisonResults(null);
      (async () => {
        try {
          const base64Image = await generateFloorplanImage4j(confirmedBrief);
          setSelectedImage(base64Image);
          await runText4jHybridConversion(base64Image, confirmedBrief, requestedBoundary, undefined, 'generated', confirmedSummary);
        } catch (error: any) {
          console.error('[Text 4.0 J] Hybrid generation failed.', error);
          setError(error.message || 'Failed to generate Text 4.0 J hybrid geometry.');
          setStep('summary');
          setIsText4dDigitizationPending(false);
        }
      })();
      return;
    }
    if (isText4hMode) {
      const validation = validateText4hBrief(text4hBrief);
      if (!validation.valid) {
        setError(`Complete the Design Brief Confirmation: ${validation.errors.join(' ')}`);
        return;
      }
      const confirmedBrief: ConfirmedText4hBrief = {
        ...text4hBrief,
        provenance: { ...text4hBrief.provenance, confirmed: true },
      };
      const confirmedSummary = text4hBriefToDesignSummary(confirmedBrief);
      const requestedBoundary = text4hBriefBoundaryMeters(confirmedBrief);
      setText4hBrief(confirmedBrief);
      setDesignSummary(confirmedSummary);
      setText4hConversionSource('generated');
      setError(null);
      setInfoMessage(null);
      setCountdown(0);
      setStep('generating');
      setIsText4dDigitizationPending(true);
      setText4hComparisonResults(null);
      (async () => {
        try {
          await runAutoPlanVariants(confirmedBrief, requestedBoundary, confirmedSummary);
        } catch (error: any) {
          console.error('[AutoPlan] Variant generation failed.', error);
          setError(error.message || 'Failed to generate AutoPlan floorplan variants.');
          setStep('summary');
          setIsText4dDigitizationPending(false);
        }
      })();
      return;
    }
    if (isText4gMode) {
      const validation = validateText4gBrief(text4gBrief);
      if (!validation.valid) {
        setError(`Complete the Design Brief Confirmation: ${validation.errors.join(' ')}`);
        return;
      }
      const confirmedBrief: ConfirmedText4gBrief = {
        ...text4gBrief,
        provenance: { ...text4gBrief.provenance, confirmed: true },
      };
      const confirmedSummary = text4gBriefToDesignSummary(confirmedBrief);
      const requestedBoundary = text4gBriefBoundaryMeters(confirmedBrief);
      setText4gBrief(confirmedBrief);
      setDesignSummary(confirmedSummary);
      setText4gConversionSource('generated');
      setError(null);
      setInfoMessage(null);
      setCountdown(0);
      setStep('generating');
      setIsText4dDigitizationPending(true);
      setText4gComparisonResults(null);
      (async () => {
        try {
          const base64Image = await generateFloorplanImage4g(confirmedBrief);
          setSelectedImage(base64Image);
          await runText4gComparisonConversion(
            base64Image,
            confirmedBrief,
            requestedBoundary,
            undefined,
            'generated',
            confirmedSummary,
          );
        } catch (error: any) {
          console.error('[Text 4.0 G] Comparison generation failed.', error);
          setError(error.message || 'Failed to generate Text 4.0 G comparison geometry.');
          setStep('summary');
          setIsText4dDigitizationPending(false);
        }
      })();
      return;
    }
    if (isText4fMode) {
      const validation = validateText4fBrief(text4fBrief);
      if (!validation.valid) {
        setError(`Complete the Design Brief Confirmation: ${validation.errors.join(' ')}`);
        return;
      }
      const confirmedBrief: ConfirmedText4fBrief = {
        ...text4fBrief,
        provenance: { ...text4fBrief.provenance, confirmed: true },
      };
      const confirmedSummary = text4fBriefToDesignSummary(confirmedBrief);
      const requestedBoundary = text4fBriefBoundaryMeters(confirmedBrief);
      setText4fBrief(confirmedBrief);
      setDesignSummary(confirmedSummary);
      setText4fConversionSource('generated');
      generate(() => generateChatFloorplanForMode(
        mode, confirmedSummary, currentBoundary, requestedBoundary,
        undefined, undefined, undefined, undefined, undefined, confirmedBrief,
        { onGeometryReady: provisional => { setGeneratedData(provisional); setStep('preview'); } },
      ), false, true);
      return;
    }
    if (isText4eMode) {
      const validation = validateText4eBrief(text4eBrief);
      if (!validation.valid) {
        setError(`Complete the Design Brief Confirmation: ${validation.errors.join(' ')}`);
        return;
      }
      const confirmedBrief: ConfirmedText4eBrief = {
        ...text4eBrief,
        provenance: { ...text4eBrief.provenance, confirmed: true },
      };
      const confirmedSummary = text4eBriefToDesignSummary(confirmedBrief);
      const requestedBoundary = text4eBriefBoundaryMeters(confirmedBrief);
      setText4eBrief(confirmedBrief);
      setDesignSummary(confirmedSummary);
      setText4eConversionSource('generated');
      generate(() => generateChatFloorplanForMode(
        mode, confirmedSummary, currentBoundary, requestedBoundary,
        undefined, undefined, undefined, confirmedBrief,
        { onGeometryReady: provisional => { setGeneratedData(provisional); setStep('preview'); } },
      ), false, true);
      return;
    }
    if (isText4dMode) {
      const validation = validateText4dBrief(text4dBrief);
      if (!validation.valid) {
        setError(`Complete the Design Brief Confirmation: ${validation.errors.join(' ')}`);
        return;
      }
      const confirmedBrief: ConfirmedText4dBrief = {
        ...text4dBrief,
        provenance: { ...text4dBrief.provenance, confirmed: true },
      };
      const confirmedSummary = text4dBriefToDesignSummary(confirmedBrief);
      const requestedBoundary = text4dBriefBoundaryMeters(confirmedBrief);
      setText4dBrief(confirmedBrief);
      setDesignSummary(confirmedSummary);
      setText4dConversionSource('generated');
      generate(() => generateChatFloorplanForMode(
        mode,
        confirmedSummary,
        currentBoundary,
        requestedBoundary,
        undefined,
        confirmedBrief,
        {
          onGeometryReady: provisional => {
            setGeneratedData(provisional);
            setStep('preview');
          },
        },
      ), false, true);
      return;
    }
    if (mode === 'chat-v4c') {
      const validation = validateText4cBrief(text4cBrief);
      if (!validation.valid) {
        setError(`Complete the Design Brief Confirmation: ${validation.errors.join(' ')}`);
        return;
      }
      const confirmedBrief: ConfirmedText4cBrief = {
        ...text4cBrief,
        provenance: { ...text4cBrief.provenance, confirmed: true },
      };
      const confirmedSummary = text4cBriefToDesignSummary(confirmedBrief);
      const requestedBoundary = text4cBriefBoundaryMeters(confirmedBrief);
      setText4cBrief(confirmedBrief);
      setDesignSummary(confirmedSummary);
      generate(() => generateChatFloorplanForMode(
        mode,
        confirmedSummary,
        currentBoundary,
        requestedBoundary,
        confirmedBrief,
      ));
      return;
    }

    const enrichedSummary = `${designSummary}
STRICT GENERATION RULES:
1. DOORS: Do NOT just use single doors. Balcony access is a wide low-sill window, never a door. Use 'double' for main entries only when requested.
2. STAIRS: Only include if Multi-Floor (>1). Place in common areas (Hall/Foyer), never in private rooms.
3. SCALE: Ensure coordinates are in METERS. A typical bedroom is ~4x4m.
4. NO FURNITURE: Generate architectural shell only.
`;
    if (isSpatialTextMode(mode)) {
      const requestedSize = parseSizeField(parseV2Summary(designSummary).size);
      const unitScale = /sq\s*ft/i.test(requestedSize.areaUnit) ? 0.3048 : 1;
      const width = parseFloat(requestedSize.width) * unitScale;
      const depth = parseFloat(requestedSize.height) * unitScale;
      const requestedBoundary: Point[] | undefined = width > 0 && depth > 0
        ? [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: depth }, { x: 0, y: depth }]
        : undefined;
      generate(() => generateChatFloorplanForMode(mode, enrichedSummary, currentBoundary, requestedBoundary));
    } else {
      generate(() => generateChatFloorplanForMode(mode, enrichedSummary, currentBoundary));
    }
  };

  const handleSkipText4dImageGeneration = () => {
    if (!isText4IsolatedMode) return;
    setSelectedImage(null);
    setSelectedFile(null);
    setGeneratedData(null);
    setIsText4dDigitizationPending(false);
    (isText4jMode ? setText4jConversionSource : isText4hMode ? setText4hConversionSource : isText4gMode ? setText4gConversionSource : isText4fMode ? setText4fConversionSource : isText4eMode ? setText4eConversionSource : setText4dConversionSource)('uploaded-test');
    (isText4jMode ? setText4jDirectUploadScale : isText4hMode ? setText4hDirectUploadScale : isText4gMode ? setText4gDirectUploadScale : isText4fMode ? setText4fDirectUploadScale : isText4eMode ? setText4eDirectUploadScale : setText4dDirectUploadScale)({
      unitSystem: unitSystem === 'imperial' ? 'imperial' : 'metric',
      width: '',
      depth: '',
      area: '',
    });
    setError(null);
    setInfoMessage(null);
    setCountdown(0);
    setStep('text4d-image-test');
  };

  const handleConvertUploadedText4dImage = async () => {
    if (!isText4IsolatedMode || !selectedImage) return;
    const prepared = isText4jMode
      ? prepareText4jDirectUpload(text4jBrief, text4jDirectUploadScale)
      : isText4hMode
      ? prepareText4hDirectUpload(text4hBrief, text4hDirectUploadScale)
      : isText4gMode
      ? prepareText4gDirectUpload(text4gBrief, text4gDirectUploadScale)
      : isText4fMode
        ? prepareText4fDirectUpload(text4fBrief, text4fDirectUploadScale)
      : isText4eMode
        ? prepareText4eDirectUpload(text4eBrief, text4eDirectUploadScale)
        : prepareText4dDirectUpload(text4dBrief, text4dDirectUploadScale);
    if (!prepared.validation.valid) {
      setError(prepared.validation.errors.join(' '));
      return;
    }


    (isText4jMode ? setText4jConversionSource : isText4hMode ? setText4hConversionSource : isText4gMode ? setText4gConversionSource : isText4fMode ? setText4fConversionSource : isText4eMode ? setText4eConversionSource : setText4dConversionSource)('uploaded-test');
    setError(null);
    setInfoMessage(null);
    setStep('generating');
    setIsText4dDigitizationPending(true);
    try {
      const uploadSummary = isText4jMode
        ? text4jBriefToDesignSummary(prepared.brief as ConfirmedText4jBrief)
        : isText4hMode
        ? text4hBriefToDesignSummary(prepared.brief as ConfirmedText4hBrief)
        : isText4gMode
        ? text4gBriefToDesignSummary(prepared.brief as ConfirmedText4gBrief)
        : isText4fMode
          ? text4fBriefToDesignSummary(prepared.brief as ConfirmedText4fBrief)
        : isText4eMode
          ? text4eBriefToDesignSummary(prepared.brief as ConfirmedText4eBrief)
          : text4dBriefToDesignSummary(prepared.brief as ConfirmedText4dBrief);
      if (isText4jMode) {
        await runText4jHybridConversion(
          selectedImage,
          prepared.brief as ConfirmedText4jBrief,
          prepared.requestedBoundary,
          prepared.requestedExtentsMeters,
          'uploaded',
          uploadSummary,
        );
        return;
      }
      if (isText4hMode) {
        if (isAutoScanFlashMode) {
          const initialResults: Text4hComparisonResults = {
            local: { key: 'local', label: 'Direct Conversion', status: 'pending' },
            master: { key: 'master', label: 'App-Generated Image Conversion', status: 'pending' },
          };
          setText4hComparisonResults(initialResults);
          setSelectedText4hComparison('local');
          setAutoScanGeneratedImage(null);
          setShowAutoScanGeneratedImage(false);
          setShowImageToJsonLogs(false);
          setGeneratedData(null);
          setIsText4dDigitizationPending(true);

          let shownFirstResult = false;
          const commitAutoScanResult = (key: Text4hComparisonKey, data: GeneratedData, durationMs: number) => {
            setText4hComparisonResults(prev => ({
              ...(prev || initialResults),
              [key]: { ...(prev?.[key] || initialResults[key]), status: 'done', durationMs, data },
            }));
            if (!shownFirstResult) {
              shownFirstResult = true;
              setSelectedText4hComparison(key);
              setGeneratedData(data);
              setStep('preview');
            }
          };
          const commitAutoScanError = (key: Text4hComparisonKey, error: unknown, durationMs: number) => {
            const message = error instanceof Error ? error.message : String(error || 'Unknown conversion error');
            setText4hComparisonResults(prev => ({
              ...(prev || initialResults),
              [key]: { ...(prev?.[key] || initialResults[key]), status: 'error', durationMs, error: message },
            }));
          };
          const convertAutoScanImage = async (image: string, key: Text4hComparisonKey, startedAt: number) => {
            try {
              const rawGeometry = await convertFloorplanImage4h(
                image,
                prepared.brief as ConfirmedText4hBrief,
                prepared.requestedBoundary,
                {
                  workflowStartedAt: Date.now(),
                  warmOcr: true,
                  annotateGeneratedPreview: false,
                  requestedExtentsMeters: prepared.requestedExtentsMeters,
                  preventFallbackForCurvilinearGenerated: true,
                  sourceKind: 'uploaded',
                  useMasterFloorplanData: false,
                },
              );
              const completed = completeGeometryForMode(mode, { ...rawGeometry, sourceImageBase64: image }, uploadSummary);
              commitAutoScanResult(key, completed, performance.now() - startedAt);
            } catch (conversionError) {
              commitAutoScanError(key, conversionError, performance.now() - startedAt);
            }
          };

          const directStartedAt = performance.now();
          const directTask = convertAutoScanImage(selectedImage, 'local', directStartedAt);
          const generatedStartedAt = performance.now();
          const generatedTask = (async () => {
            try {
              const normalizedImage = await redrawAutoScanFloorplan(selectedImage, {
                unitSystem: text4hDirectUploadScale.unitSystem,
                width: prepared.validation.width,
                depth: prepared.validation.depth,
                area: prepared.validation.area,
              });
              setAutoScanGeneratedImage(normalizedImage);
              await convertAutoScanImage(normalizedImage, 'master', generatedStartedAt);
            } catch (redrawError) {
              commitAutoScanError('master', redrawError, performance.now() - generatedStartedAt);
            }
          })();

          await Promise.allSettled([directTask, generatedTask]);
          setIsText4dDigitizationPending(false);
          if (!shownFirstResult) {
            setError('AutoScan could not digitize either floorplan result. Verify the image and dimensions, then try again.');
            setStep('preview');
          }
          return;
        }
        await runText4hComparisonConversion(
          selectedImage,
          prepared.brief as ConfirmedText4hBrief,
          prepared.requestedBoundary,
          prepared.requestedExtentsMeters,
          'uploaded',
          uploadSummary,
        );
        return;
      }
      if (isText4gMode) {
        await runText4gComparisonConversion(
          selectedImage,
          prepared.brief as ConfirmedText4gBrief,
          prepared.requestedBoundary,
          prepared.requestedExtentsMeters,
          'uploaded',
          uploadSummary,
        );
        return;
      }
      const conversionOptions = {
          warmOcr: true,
          annotateGeneratedPreview: false,
          requestedExtentsMeters: prepared.requestedExtentsMeters,
          ...((isText4gMode || isText4hMode || isText4jMode) ? { preventFallbackForCurvilinearGenerated: true } : {}),
          onGeometryReady: provisional => {
            setGeneratedData(provisional);
            setStep('preview');
          },
        };
      const rawGeometry = isText4jMode
        ? await convertFloorplanImage4j(selectedImage, prepared.brief as ConfirmedText4jBrief, prepared.requestedBoundary, conversionOptions)
        : isText4hMode
        ? await convertFloorplanImage4h(selectedImage, prepared.brief as ConfirmedText4hBrief, prepared.requestedBoundary, conversionOptions)
        : isText4gMode
        ? await convertFloorplanImage4g(selectedImage, prepared.brief as ConfirmedText4gBrief, prepared.requestedBoundary, conversionOptions)
        : isText4fMode
          ? await convertFloorplanImage4f(selectedImage, prepared.brief as ConfirmedText4fBrief, prepared.requestedBoundary, conversionOptions)
        : isText4eMode
          ? await convertFloorplanImage4e(selectedImage, prepared.brief as ConfirmedText4eBrief, prepared.requestedBoundary, conversionOptions)
          : await convertFloorplanImage4d(selectedImage, prepared.brief as ConfirmedText4dBrief, prepared.requestedBoundary, conversionOptions);
      const authoritativeResult = completeGeometryForMode(mode, rawGeometry, uploadSummary);
      setGeneratedData(authoritativeResult);
      setStep('preview');
    } catch (conversionError) {
      console.error(`[Text 4.0 ${isText4jMode ? 'J' : isText4hMode ? 'H' : isText4gMode ? 'G' : isText4fMode ? 'F' : isText4eMode ? 'E' : 'D'}] Uploaded image conversion failed.`, conversionError);
      setError(conversionError instanceof Error ? conversionError.message : 'Failed to convert the uploaded floorplan image.');
      setStep('text4d-image-test');
    } finally {
      setIsText4dDigitizationPending(false);
    }
  };
  
  const handleGenerateFromFusion = async () => {
    setStep('generating');
    setError(null);
    setInfoMessage(null);
    setFallbackUrl(null);
    setCountdown(0);

    try {
        // Step 1: Find Image URL
        const imageUrl = await findReferenceFloorplan(designSummary);
        if (!imageUrl) throw new Error("Could not locate a suitable reference floorplan online.");
        
        try {
            // Step 2: Fetch Image (Try Direct -> Proxy A -> Proxy B)
            const base64 = await urlToBase64(imageUrl);
            
            // Step 3: Redraw
            const result = await generateFloorplanRedrawV2(base64);
            setGeneratedData(result);
            setStep('preview');

        } catch (err: any) {
            // Check for specific CORS Error from our service
            if (err.message === "CORS_ERROR") {
                setFallbackUrl(imageUrl);
                setStep('manual-fallback');
                return;
            }
            throw err; // Rethrow other errors
        }

    } catch (e: any) {
         // Standard Error Handling
         const errorMessage = (e.toString() || '').toLowerCase();
         if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
             setInfoMessage("We're experiencing high traffic. Please wait.");
             setCountdown(345);
             setStep('summary');
         } else {
             console.error(e);
             setError("Failed to generate geometry. Please try again.");
             setStep('summary');
         }
    }
  };

  const handleGenerateFromImage = () => { if (selectedImage) generate(() => generateFloorplanFromImage(selectedImage)); };
  const handleGenerateRedrawV2 = () => { if (selectedImage) generate(() => generateFloorplanRedrawV2(selectedImage)); };
  const handleGenerateDigitizer = () => { if (selectedImage) generate(() => generateFloorplanDigitizer(selectedImage)); };
  const handleGenerateFromReference = () => { if (selectedImage && designSummary) generate(() => generateFloorplanFromReference(designSummary, selectedImage, currentBoundary)); };

  const handleGenerateTracer = async (silent: boolean = false) => {
    if (!selectedFile) return;
    if (!silent) setStep('generating');
    try {
      const data = await traceFloorplanTracer(selectedFile, tracerOverlap, tracerConfidence);
      setRawTracerData(data);
      const elements = mapTracerDataToArchElements(data, tracerConfidence, selectedFile);
      setBaseElements(elements);
      if (!silent) setStep('preview');
    } catch (e) {
      console.error(e);
      if (!silent) {
        setError(e instanceof Error ? e.message : "Failed to trace image.");
        setStep('input');
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setSelectedImage(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };
  
  const handleImportInterior = async () => {
    if (!selectedImage || !generatedData || isText4dDigitizationPending) return;
    setIsImportingInterior(true);
    try {
      const result = await importInteriorFromImage(selectedImage, generatedData);
      // Merge into current baseElements
      const updatedData = {
        ...generatedData,
        furniture: [...(generatedData?.furniture || []), ...(result.furniture || [])],
        fixtures: [...(generatedData?.fixtures || []), ...(result.fixtures || [])],
      } as GeneratedData;
      setGeneratedData(updatedData);
      const newElements = mapToArchElements(updatedData);
      setBaseElements(newElements);
    } catch (e) {
        console.error("Interior Import Error:", e);
        setError("Failed to import interior.");
    } finally {
        setIsImportingInterior(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setSelectedFile(file); // Store raw file for Tracer API
    const reader = new FileReader();
    reader.onload = (e) => setSelectedImage(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  // --- PREVIEW ---
  // Replaced with dynamic, high-fidelity Canvas rendering

  const mapToArchElements = (data: GeneratedData): ArchElement[] => {
    const elements: ArchElement[] = [];
    const getLevelId = (idx?: number) => (idx !== undefined ? idx.toString() : "0");
    const isText4c = mode === 'chat-v4c';
    const isText4d = mode === 'chat-v4d';
    const isText4e = mode === 'chat-v4e';
    const isText4f = mode === 'chat-v4f';
    const isText4g = mode === 'chat-v4g';
    const isText4h = mode === 'chat-v4h';
    const isText4j = mode === 'chat-v4j';
    const isText4Isolated = isText4d || isText4e || isText4f || isText4g || isText4h || isText4j;
    const isText4Digitized = isText4c || isText4Isolated;
    const activeText4Brief = isText4j ? text4jBrief : isText4h ? text4hBrief : isText4g ? text4gBrief : isText4f ? text4fBrief : isText4e ? text4eBrief : isText4d ? text4dBrief : text4cBrief;
    const text4ProjectClass = [activeText4Brief.project.category, activeText4Brief.project.type, activeText4Brief.project.purpose]
      .filter(Boolean)
      .join(' ');
    const evidenceStrength = (source?: { evidence?: { confidence?: number } }): Text4cEvidenceStrength => {
      const confidence = source?.evidence?.confidence;
      if (typeof confidence !== 'number' || !Number.isFinite(confidence)) return 'none';
      if (confidence >= 0.75) return 'strong';
      if (confidence >= 0.6) return 'medium';
      return 'weak';
    };
    const digitizationFields = (source?: {
      presetId?: string;
      provenance?: ArchElement['digitizationProvenance'];
      evidence?: { source: NonNullable<ArchElement['digitizationEvidence']>['source']; confidence: number; pixelBounds?: { x0: number; y0: number; x1: number; y1: number }; notes?: string[] };
      measuredWidth?: number;
      measuredHeight?: number;
      measuredThickness?: number;
      assumedProperties?: string[];
    }): Partial<ArchElement> => source ? ({
      ...(source.presetId ? { presetId: source.presetId } : {}),
      ...(source.provenance ? { digitizationProvenance: source.provenance } : {}),
      ...(source.evidence ? {
        digitizationConfidence: source.evidence.confidence,
        digitizationEvidence: {
          source: source.evidence.source,
          ...(source.evidence.pixelBounds ? { pixelBounds: source.evidence.pixelBounds } : {}),
          ...(source.evidence.notes?.length ? { notes: source.evidence.notes } : {}),
        },
      } : {}),
      ...(source.measuredWidth !== undefined ? { measuredWidth: source.measuredWidth } : {}),
      ...(source.measuredHeight !== undefined ? { measuredHeight: source.measuredHeight } : {}),
      ...(source.measuredThickness !== undefined ? { measuredThickness: source.measuredThickness } : {}),
      ...(source.assumedProperties?.length ? { assumedProperties: source.assumedProperties } : {}),
    }) : ({});
    const mergeAssumptions = (source: { assumedProperties?: string[] }, additions: string[]) => (
      Array.from(new Set([...(source.assumedProperties || []), ...additions]))
    );

    // Text 3.0 and Text 4.0 always receive one continuous host slab beneath the complete plan.
    // This is derived locally, so it adds no model tokens or inference time.
    const sourceSlabs = [...(data.slabs || [])];
    if ((mode as any) === 'chat-v3' || (mode as any) === 'chat-v4' || (mode as any) === 'chat-v4a' || (mode as any) === 'chat-v4b' || ((mode as any) === 'chat-v4c' || (mode as any) === 'chat-v4d' || (mode as any) === 'chat-v4e' || (mode as any) === 'chat-v4f' || (mode as any) === 'chat-v4g' || (mode as any) === 'chat-v4h' || (mode as any) === 'chat-v4j')) {
      const hostBoundary = data.boundary && data.boundary.length >= 3
        ? data.boundary
        : (() => {
            const points = data.walls?.flatMap(w => [w.p1, w.p2]) || [];
            if (!points.length) return [];
            const xs = points.map(p => p[0]);
            const ys = points.map(p => p[1]);
            const x1 = Math.min(...xs), x2 = Math.max(...xs);
            const y1 = Math.min(...ys), y2 = Math.max(...ys);
            return [[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]];
          })();
      // Text 4.0 D's shared raster extractor already supplies the authoritative
      // centerline slab. `data.boundary` remains the separate outer-face
      // property extent and must not be synthesized as a second floor.
      const preserveText4dExtractedSlab = isText4Isolated && sourceSlabs.some(s => s.type === 'floor' && s.boundary?.length >= 3);
      if (hostBoundary.length >= 3 && !preserveText4dExtractedSlab) {
        const boundaryKey = (pts: number[][]) => pts
          .map(p => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).sort().join('|');
        const hostKey = boundaryKey(hostBoundary);
        const alreadyPresent = sourceSlabs.some(s => s.type === 'floor' && boundaryKey(s.boundary) === hostKey);
        if (!alreadyPresent) sourceSlabs.unshift({ levelIndex: 0, boundary: hostBoundary, type: 'floor' });
      }
    }

    // 1. NORMALIZE COORDINATES (Center to 0,0)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const allPts: number[][] = [
        ...(data.walls?.flatMap(w => [w.p1, w.p2]) || []),
        ...(data.boundary || []),
        ...(sourceSlabs.flatMap(s => s.boundary) || []),
        // Furniture removed from normalization bounds
    ];
    if (allPts.length > 0) {
        allPts.forEach(p => {
            minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
            minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
        });
        // Calculate center
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        
        // Helper to offset (with Y inverted to map Cartesian up-increasing to Canvas down-increasing)
        const off = (p: number[]) => ({ x: p[0] - cx, y: cy - p[1] });
        const offArr = (pts: number[][]) => pts.map(p => off(p));

        // --- HELPER: GEOMETRY SNAPPING ---
        // We create walls first so we can snap others to them.
        const createdWalls: { id: string, p1: Point, p2: Point, thickness: number, element: ArchElement }[] = [];

        const wallPoints = data.walls?.flatMap(w => [w.p1, w.p2]) || [];
        const wallMinX = Math.min(...wallPoints.map(p => p[0]));
        const wallMaxX = Math.max(...wallPoints.map(p => p[0]));
        const wallMinY = Math.min(...wallPoints.map(p => p[1]));
        const wallMaxY = Math.max(...wallPoints.map(p => p[1]));
        const isEnvelopeWall = (w: NonNullable<GeneratedData['walls']>[number]) => {
          const tolerance = 0.08;
          const onX = (Math.abs(w.p1[0] - wallMinX) < tolerance && Math.abs(w.p2[0] - wallMinX) < tolerance) ||
            (Math.abs(w.p1[0] - wallMaxX) < tolerance && Math.abs(w.p2[0] - wallMaxX) < tolerance);
          const onY = (Math.abs(w.p1[1] - wallMinY) < tolerance && Math.abs(w.p2[1] - wallMinY) < tolerance) ||
            (Math.abs(w.p1[1] - wallMaxY) < tolerance && Math.abs(w.p2[1] - wallMaxY) < tolerance);
          return onX || onY;
        };
        const getWallThickness = (t: string, isOuter: boolean) => {
          if (isOuter || t === 'exterior') return 0.2286; // 9 inches minimum
          if (t === 'partition') return 0.075;
          if (t === 'glass') return 0.02;
          return 0.15; 
        };

        // --- PASS 1: WALLS ---
        data.walls?.forEach(w => {
          const p1 = off(w.p1);
          const p2 = off(w.p2);
          const outerWall = ((mode as any) === 'chat-v3' || (mode as any) === 'chat-v4' || (mode as any) === 'chat-v4a' || (mode as any) === 'chat-v4b' || isText4Digitized) && isEnvelopeWall(w);
          const wallRole: Text4cWallRole = outerWall || w.type === 'exterior'
            ? 'exterior'
            : w.type === 'partition'
              ? 'partition'
              : w.type === 'glass'
                ? 'glass'
                : /structural/i.test(w.type)
                  ? 'structural-interior'
                  : 'interior';
          const presetInput = {
            semanticRole: wallRole,
            projectClass: text4ProjectClass,
            measuredThicknessM: w.measuredThickness,
            evidenceStrength: evidenceStrength(w),
            toleranceM: 0.02,
          };
          const presetResolution = isText4j
            ? resolveText4jWallPreset(presetInput)
            : isText4h
            ? resolveText4hWallPreset(presetInput)
            : isText4g
            ? resolveText4gWallPreset(presetInput)
            : isText4f
            ? resolveText4fWallPreset(presetInput)
            : isText4e
            ? resolveText4eWallPreset(presetInput)
            : isText4d
            ? resolveText4dWallPreset(presetInput)
            : isText4c ? resolveText4cWallPreset(presetInput) : null;
          const thickness = presetResolution?.resolvedValues.thicknessM ?? getWallThickness(w.type, outerWall);
          const id = crypto.randomUUID();
          // Text 4.0 F/G local extractors can preserve an evidenced
          // ellipse family. Keep that analytic payload on the authoritative
          // preview just like the existing F arc payload; without this small
          // handoff branch the preview would silently downgrade an ellipse to
          // a straight wall while importing the same JSON.
          const fCurve = w as typeof w & {
            ellipseCenter?: number[];
            ellipseRadiusX?: number;
            ellipseRadiusY?: number;
            ellipseRotation?: number;
            ellipseStartAngle?: number;
            ellipseEndAngle?: number;
            ellipseCounterclockwise?: boolean;
          };
          const fCurvePayload = (isText4f || isText4g || isText4h || isText4j) && (fCurve.wallSource as string) === 'ellipse' && fCurve.isCurved
            && fCurve.ellipseCenter && fCurve.ellipseRadiusX !== undefined && fCurve.ellipseRadiusY !== undefined
            && fCurve.ellipseStartAngle !== undefined && fCurve.ellipseEndAngle !== undefined
            ? {
              wallSource: 'ellipse',
              isCurved: true,
              ellipseCenter: off(fCurve.ellipseCenter),
              ellipseRadiusX: fCurve.ellipseRadiusX,
              ellipseRadiusY: fCurve.ellipseRadiusY,
              ellipseRotation: -(fCurve.ellipseRotation || 0),
              ellipseStartAngle: -fCurve.ellipseStartAngle,
              ellipseEndAngle: -fCurve.ellipseEndAngle,
              ellipseCounterclockwise: !fCurve.ellipseCounterclockwise,
            }
            : undefined;
          const assumedProperties = isText4Digitized
            ? mergeAssumptions(w, [
                ...(presetResolution?.provenance === 'semantic-default' ? ['wall-thickness-from-catalog'] : []),
                'wall-height-3.0m',
              ])
            : w.assumedProperties;
          
          elements.push({
            id, type: 'wall',
            p1, p2,
            ...(fCurvePayload || ((isText4f || isText4g || isText4h || isText4j) && w.wallSource === 'arc' && w.isCurved && w.controlPoint && w.arcCenter
              && w.arcRadius !== undefined && w.arcStartAngle !== undefined && w.arcEndAngle !== undefined ? {
                wallSource: 'arc',
                isCurved: true,
                controlPoint: off(w.controlPoint),
                arcCenter: off(w.arcCenter),
                arcRadius: w.arcRadius,
                arcStartAngle: -w.arcStartAngle,
                arcEndAngle: -w.arcEndAngle,
                arcCounterclockwise: !w.arcCounterclockwise,
              } : {})),
            thickness, height: 3.0,
            levelId: getLevelId(w.levelIndex),
            ...digitizationFields(w),
            ...(presetResolution ? {
              subType: presetResolution.subtype,
              ...(presetResolution.presetId ? { presetId: presetResolution.presetId } : {}),
              metadata: { [isText4j ? 'text4jPresetResolution' : isText4h ? 'text4hPresetResolution' : isText4g ? 'text4gPresetResolution' : isText4f ? 'text4fPresetResolution' : isText4e ? 'text4ePresetResolution' : isText4d ? 'text4dPresetResolution' : 'text4cPresetResolution']: presetResolution },
            } : {}),
            ...(assumedProperties?.length ? { assumedProperties } : {}),
          });
          
          createdWalls.push({ id, p1, p2, thickness, element: elements[elements.length - 1] });
        });

        // --- HELPER: FIND NEAREST WALL & ANGLE ---
        const getNearestWallInfo = (pos: Point, levelId?: string) => {
            let minD = Infinity;
            let bestWall = null;
            let angle = 0;
            let hostT = 0.5;
            let snapped = pos;
            
            for(const w of createdWalls) {
                const wallElement = elements.find(el => el.id === w.id);
                if (levelId !== undefined && wallElement?.levelId !== levelId) continue;
                if ((isText4f || isText4g || isText4h || isText4j) && wallElement && analyticIsCurvedElement(wallElement)) {
                    const projected = isText4j
                      ? projectText4jPointToCurve(wallElement, pos)
                      : isText4h
                      ? projectText4hPointToCurve(wallElement, pos)
                      : isText4g
                      ? projectText4gPointToCurve(wallElement, pos)
                      : projectText4fPointToCurve(wallElement, pos);
                    if (projected && projected.distance < minD) {
                        minD = projected.distance;
                        bestWall = w;
                        angle = projected.angle;
                        hostT = projected.t;
                        snapped = projected.point;
                    }
                    continue;
                }
                const dx = w.p2.x - w.p1.x;
                const dy = w.p2.y - w.p1.y;
                const lenSq = dx*dx + dy*dy;
                if(lenSq < 0.001) continue;
                
                // Project point onto line segment
                let t = ((pos.x - w.p1.x) * dx + (pos.y - w.p1.y) * dy) / lenSq;
                t = Math.max(0, Math.min(1, t));
                const px = w.p1.x + t * dx;
                const py = w.p1.y + t * dy;
                const d = Math.hypot(pos.x - px, pos.y - py);
                
                if (d < minD) {
                    minD = d;
                    bestWall = w;
                    angle = Math.atan2(dy, dx) * (180/Math.PI);
                    hostT = t;
                    snapped = { x: px, y: py };
                }
            }
            return { wall: bestWall, dist: minD, angle, hostT, snapped };
        };

        const addHostedOpening = (
          type: 'door' | 'window' | 'wall-opening',
          rawPos: number[], width: number, levelIndex?: number, extra: Partial<ArchElement> = {}, sourceRotation?: number
        ) => {
          const levelId = getLevelId(levelIndex);
          const pos = off(rawPos);
          const nearestWall = getNearestWallInfo(pos, levelId);
          const { wall, dist, hostT, snapped } = nearestWall;
          let angle = nearestWall.angle;
          if (!wall) return;
          const wallLength = (isText4f || isText4g || isText4h || isText4j) && analyticIsCurvedElement(wall.element)
            ? analyticCurveLength(wall.element, 96)
            : Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
          const safeWidth = Math.max(0.3, Math.min(width, Math.max(0.3, wallLength - 0.2)));
          let safeHostT = hostT;
          let safePos = snapped;
          if (isText4Digitized && wallLength > 0.3) {
            const minimumHostT = Math.min(0.5, (safeWidth / 2 + 0.1) / wallLength);
            safeHostT = Math.max(minimumHostT, Math.min(1 - minimumHostT, hostT));
            safePos = {
              x: wall.p1.x + (wall.p2.x - wall.p1.x) * safeHostT,
              y: wall.p1.y + (wall.p2.y - wall.p1.y) * safeHostT,
            };
          }
          const widthWasClamped = Math.abs(safeWidth - width) > 0.005;
          const hostedExtra: Partial<ArchElement> = isText4Digitized && widthWasClamped && extra.presetId
            ? {
                ...extra,
                presetId: undefined,
                assumedProperties: Array.from(new Set([...(extra.assumedProperties || []), 'preset-cleared-after-host-clamp'])),
              }
            : extra;
          let finalExtra = hostedExtra;
          let observedCurveRotation: number | undefined;
          if ((isText4f || isText4g || isText4h || isText4j) && analyticIsCurvedElement(wall.element) && type === 'door'
            && Number.isFinite(sourceRotation) && typeof hostedExtra.isFlipped === 'boolean'
            && hostedExtra.subType !== 'folding') {
            const sourceCanvasRotation = -(sourceRotation as number);
            const delta = ((angle - sourceCanvasRotation + 540) % 360) - 180;
            if (Math.abs(delta) > 90) finalExtra = {
              ...hostedExtra,
              isFlipped: !hostedExtra.isFlipped,
              ...(typeof hostedExtra.facingFlipped === 'boolean'
                ? { facingFlipped: !hostedExtra.facingFlipped }
                : {}),
            };
          }
          if ((isText4f || isText4g || isText4h || isText4j) && analyticIsCurvedElement(wall.element)) {
            const pose = isText4j
              ? text4jCurveHostedPose(wall.element, safeHostT, safeWidth)
              : isText4h
              ? text4hCurveHostedPose(wall.element, safeHostT, safeWidth)
              : isText4g
              ? text4gCurveHostedPose(wall.element, safeHostT, safeWidth)
              : text4fCurveHostedPose(wall.element, safeHostT, safeWidth);
            if (pose) {
              safePos = pose.pos;
              angle = pose.rotation;
              if (Number.isFinite(sourceRotation)) {
                const sourceCanvasRotation = -(sourceRotation as number);
                const nearestEquivalent = sourceCanvasRotation
                  + Math.round((pose.rotation - sourceCanvasRotation) / 180) * 180;
                if (Math.abs(nearestEquivalent - pose.rotation) <= 24) {
                  angle = nearestEquivalent;
                  observedCurveRotation = nearestEquivalent;
                }
              }
            }
          }
          if ((isText4g || isText4h || isText4j) && (type === 'door' || type === 'wall-opening')) {
            const candidate = { pos: [safePos.x, safePos.y], rotation: angle, width: safeWidth };
            const overlappingIndices = elements.flatMap((element, index) => {
              if (element.hostWallId !== wall.id || !element.pos
                || (element.type !== 'door' && element.type !== 'wall-opening')) return [];
              const overlaps = (isText4j ? text4jHostedAperturesOverlap : isText4h ? text4hHostedAperturesOverlap : text4gHostedAperturesOverlap)(candidate, {
                pos: [element.pos.x, element.pos.y],
                rotation: element.rotation,
                width: element.width,
                measuredWidth: element.measuredWidth,
              });
              return overlaps ? [index] : [];
            });
            if (type === 'wall-opening') {
              const rasterDoorWins = overlappingIndices.some(index => elements[index].type === 'door'
                && elements[index].digitizationEvidence?.source === 'raster');
              const duplicateOpening = overlappingIndices.some(index => elements[index].type === 'wall-opening');
              if (rasterDoorWins || duplicateOpening) return;
            } else if (finalExtra.digitizationEvidence?.source === 'raster') {
              for (let index = overlappingIndices.length - 1; index >= 0; index--) {
                const elementIndex = overlappingIndices[index];
                if (elements[elementIndex].type === 'wall-opening') elements.splice(elementIndex, 1);
              }
            }
          }
          const sourceMetadata = finalExtra.metadata && typeof finalExtra.metadata === 'object' ? finalExtra.metadata : {};
          elements.push({
            id: crypto.randomUUID(), type, pos: safePos, width: safeWidth,
            rotation: angle, hostWallId: wall.id, hostT: safeHostT,
            elevation: 0, levelId, ...finalExtra,
            ...(isText4Digitized ? {
              metadata: {
                ...sourceMetadata,
                ...(observedCurveRotation !== undefined ? { [isText4j ? 'text4jObservedChordRotation' : isText4h ? 'text4hObservedChordRotation' : isText4g ? 'text4gObservedChordRotation' : 'text4fObservedChordRotation']: true } : {}),
                [isText4j ? 'text4jHostDistanceM' : isText4h ? 'text4hHostDistanceM' : isText4g ? 'text4gHostDistanceM' : isText4f ? 'text4fHostDistanceM' : isText4e ? 'text4eHostDistanceM' : isText4d ? 'text4dHostDistanceM' : 'text4cHostDistanceM']: Number.isFinite(dist) ? dist : null,
                [isText4j ? 'text4jHostNeedsReview' : isText4h ? 'text4hHostNeedsReview' : isText4g ? 'text4gHostNeedsReview' : isText4f ? 'text4fHostNeedsReview' : isText4e ? 'text4eHostNeedsReview' : isText4d ? 'text4dHostNeedsReview' : 'text4cHostNeedsReview']: Number.isFinite(dist) && dist > 0.35,
                [isText4j ? 'text4jPresetClearedByHostClamp' : isText4h ? 'text4hPresetClearedByHostClamp' : isText4g ? 'text4gPresetClearedByHostClamp' : isText4f ? 'text4fPresetClearedByHostClamp' : isText4e ? 'text4ePresetClearedByHostClamp' : isText4d ? 'text4dPresetClearedByHostClamp' : 'text4cPresetClearedByHostClamp']: widthWasClamped && !!extra.presetId,
              },
            } : {}),
          });
        };

        // --- PASS 2: OPENINGS & STRUCTURE (No Furniture) ---

        // Other Linear/Shape elements
        data.stairs?.forEach(s => {
          elements.push({
            id: crypto.randomUUID(), type: 'stair',
            p1: off(s.p1), p2: off(s.p2),
            width: s.width, subType: s.shape,
            levelId: getLevelId(s.levelIndex),
            ...digitizationFields(s),
            ...(isText4d && s.stepCount ? { metadata: { stepCount: s.stepCount } } : {}),
          });
        });

        let largestSlabIndex = -1;
        let maxArea = -1;
        sourceSlabs.forEach((s, idx) => {
          if (!s.boundary || s.boundary.length < 3) return;
          let minX_s = Infinity, maxX_s = -Infinity, minY_s = Infinity, maxY_s = -Infinity;
          s.boundary.forEach(pt => {
            minX_s = Math.min(minX_s, pt[0]); maxX_s = Math.max(maxX_s, pt[0]);
            minY_s = Math.min(minY_s, pt[1]); maxY_s = Math.max(maxY_s, pt[1]);
          });
          const area = (maxX_s - minX_s) * (maxY_s - minY_s);
          if (area > maxArea) {
            maxArea = area;
            largestSlabIndex = idx;
          }
        });

        sourceSlabs.forEach((s, idx) => {
          elements.push({
            id: crypto.randomUUID(), type: s.type as any,
            boundary: offArr(s.boundary),
            levelId: getLevelId(s.levelIndex),
            ...( ((mode as any) === 'chat-v2' || (mode as any) === 'chat-v3' || (mode as any) === 'chat-v4' || (mode as any) === 'chat-v4a' || (mode as any) === 'chat-v4b' || (mode as any) === 'chat-v4c' || (mode as any) === 'chat-v4d' || (mode as any) === 'chat-v4e' || (mode as any) === 'chat-v4f' || (mode as any) === 'chat-v4g' || (mode as any) === 'chat-v4h' || (mode as any) === 'chat-v4j') && idx === largestSlabIndex ? { isAIGeneratedFloor: true } : {} )
          });
        });

        data.railings?.forEach(r => {
          elements.push({
            id: crypto.randomUUID(), type: 'railing',
            p1: off(r.p1), p2: off(r.p2),
            height: 1.1, levelId: getLevelId(r.levelIndex),
            ...digitizationFields(r),
          });
        });

        data.doors?.forEach(d => {
          const nearbyRoomRole = d.mandatoryExteriorEntry
            ? 'main entrance'
            : (data.rooms || [])
                .map(room => ({ room, distance: Math.hypot(room.pos[0] - d.pos[0], room.pos[1] - d.pos[1]) }))
                .sort((a, b) => a.distance - b.distance)
                .slice(0, 2)
                .sort((a, b) => {
                  const aWet = /bath|powder|toilet|wc|lavatory/i.test(a.room.label) ? 0 : 1;
                  const bWet = /bath|powder|toilet|wc|lavatory/i.test(b.room.label) ? 0 : 1;
                  return aWet - bWet || a.distance - b.distance;
                })[0]?.room.label;
          const doorPresetInput = {
            measuredWidthM: d.measuredWidth,
            measuredHeightM: d.measuredHeight,
            detectedSubtype: d.type,
            roomRole: nearbyRoomRole,
            evidenceStrength: evidenceStrength(d),
            toleranceM: 0.025,
          };
          const presetResolution = isText4j
            ? resolveText4jDoorPreset(doorPresetInput)
            : isText4h
            ? resolveText4hDoorPreset(doorPresetInput)
            : isText4g
            ? resolveText4gDoorPreset(doorPresetInput)
            : isText4f
            ? resolveText4fDoorPreset(doorPresetInput)
            : isText4e
            ? resolveText4eDoorPreset(doorPresetInput)
            : isText4d
            ? resolveText4dDoorPreset(doorPresetInput)
            : isText4c ? resolveText4cDoorPreset(doorPresetInput) : null;
          const resolvedWidth = presetResolution?.resolvedValues.widthM ?? d.width ?? 0.9;
          const resolvedHeight = presetResolution?.resolvedValues.heightM ?? d.measuredHeight ?? 2.1336;
          const applyPreset = !!presetResolution?.presetId && presetResolution.resolvedValues.widthM !== null;
          const assumedProperties = isText4Digitized ? mergeAssumptions(d, [
            ...(d.measuredHeight === undefined ? ['door-height-2.1336m'] : []),
            ...(presetResolution?.provenance === 'role-default' ? ['door-width-from-room-role'] : []),
          ]) : d.assumedProperties;
          const mandatoryEntryMetadata = d.mandatoryExteriorEntry
            ? ((mode as any) === 'chat-v4' || (mode as any) === 'chat-v4a' || (mode as any) === 'chat-v4b' || isText4Digitized
              ? { text4MandatoryExteriorEntry: true }
              : { text3MandatoryExteriorEntry: true })
            : {};
          const doorMetadata = {
            ...mandatoryEntryMetadata,
            ...(presetResolution ? { [isText4j ? 'text4jPresetResolution' : isText4h ? 'text4hPresetResolution' : isText4g ? 'text4gPresetResolution' : isText4f ? 'text4fPresetResolution' : isText4e ? 'text4ePresetResolution' : isText4d ? 'text4dPresetResolution' : 'text4cPresetResolution']: presetResolution } : {}),
          };
          addHostedOpening('door', d.pos, resolvedWidth, d.levelIndex, {
            ...digitizationFields(d),
            subType: presetResolution?.subtype || d.type,
            presetId: applyPreset ? presetResolution!.presetId! : undefined,
            height: resolvedHeight,
            isFlipped: d.isFlipped,
            facingFlipped: d.facingFlipped,
            ...(assumedProperties?.length ? { assumedProperties } : {}),
            ...(Object.keys(doorMetadata).length ? { metadata: doorMetadata } : {}),
          }, d.rotation);
        });

        data.windows?.forEach(w => {
          const isBalconyAccess = ((mode as any) === 'chat-v3' || (mode as any) === 'chat-v4' || (mode as any) === 'chat-v4a' || (mode as any) === 'chat-v4b' || (mode as any) === 'chat-v4c' || (mode as any) === 'chat-v4d' || (mode as any) === 'chat-v4e' || (mode as any) === 'chat-v4f' || (mode as any) === 'chat-v4g' || (mode as any) === 'chat-v4h' || (mode as any) === 'chat-v4j') && w.type === 'full-height';
          const sillHeight = isBalconyAccess ? 0.1524 : 0.9144;
          const windowPresetInput = {
            measuredWidthM: w.measuredWidth,
            measuredHeightM: w.measuredHeight,
            detectedSubtype: w.type,
            evidenceStrength: evidenceStrength(w),
            toleranceM: 0.025,
          };
          const presetResolution = isText4j
            ? resolveText4jWindowPreset(windowPresetInput)
            : isText4h
            ? resolveText4hWindowPreset(windowPresetInput)
            : isText4g
            ? resolveText4gWindowPreset(windowPresetInput)
            : isText4f
            ? resolveText4fWindowPreset(windowPresetInput)
            : isText4e
            ? resolveText4eWindowPreset(windowPresetInput)
            : isText4d
            ? resolveText4dWindowPreset(windowPresetInput)
            : isText4c ? resolveText4cWindowPreset(windowPresetInput) : null;
          const resolvedWidth = presetResolution?.resolvedValues.widthM ?? w.width ?? 1.2;
          const resolvedHeight = presetResolution?.resolvedValues.heightM ?? w.measuredHeight ?? (2.1336 - sillHeight);
          const applyPreset = !!presetResolution?.presetId && presetResolution.resolvedValues.widthM !== null;
          const resolvedSubtype = presetResolution?.subtype === 'regular'
            ? 'standard'
            : presetResolution?.subtype || w.type || 'standard';
          const assumedProperties = isText4Digitized ? mergeAssumptions(w, [
            isBalconyAccess ? 'window-sill-0.1524m' : 'window-sill-0.9144m',
            ...(w.measuredHeight === undefined
              ? [presetResolution?.resolvedValues.heightM !== null && presetResolution?.resolvedValues.heightM !== undefined
                  ? 'window-height-from-catalog'
                  : 'window-height-from-default']
              : []),
          ]) : w.assumedProperties;
          addHostedOpening('window', w.pos, resolvedWidth, w.levelIndex, {
            ...digitizationFields(w),
            subType: resolvedSubtype, sillHeight,
            presetId: applyPreset ? presetResolution!.presetId! : undefined,
            topHeight: sillHeight + resolvedHeight, height: resolvedHeight,
            ...(assumedProperties?.length ? { assumedProperties } : {}),
            ...(presetResolution ? { metadata: { [isText4j ? 'text4jPresetResolution' : isText4h ? 'text4hPresetResolution' : isText4g ? 'text4gPresetResolution' : isText4f ? 'text4fPresetResolution' : isText4e ? 'text4ePresetResolution' : isText4d ? 'text4dPresetResolution' : 'text4cPresetResolution']: presetResolution } } : {}),
          });
        });
        
        data.openings?.forEach(o => {
          addHostedOpening('wall-opening', o.pos, o.width || 1.0, o.levelIndex, {
            height: 2.1336,
            ...digitizationFields(o),
          });
        });

        data.columns?.forEach(c => {
          elements.push({
            id: crypto.randomUUID(), type: 'column',
            pos: off(c.pos), width: c.width, depth: c.depth,
            shape: c.shape as any, levelId: getLevelId(c.levelIndex),
            ...digitizationFields(c),
          });
        });

        data.rooms?.forEach(r => {
          let finalLabel = r.label.toUpperCase();
          const pos = off(r.pos);
          let extraProps: any = {};

          if ((mode as any) === 'chat-v2' || (mode as any) === 'chat-v3' || (mode as any) === 'chat-v4' || (mode as any) === 'chat-v4a' || (mode as any) === 'chat-v4b' || (mode as any) === 'chat-v4c' || (mode as any) === 'chat-v4d' || (mode as any) === 'chat-v4e' || (mode as any) === 'chat-v4f' || (mode as any) === 'chat-v4g' || (mode as any) === 'chat-v4h' || (mode as any) === 'chat-v4j') {
            extraProps.textFontSize = 6;
            extraProps.dimFontSize = 5;
            
            let minX_room = -Infinity, maxX_room = Infinity;
            let minY_room = -Infinity, maxY_room = Infinity;

            createdWalls.forEach(w => {
              const isHorizontal = Math.abs(w.p1.y - w.p2.y) < 0.1;
              const isVertical = Math.abs(w.p1.x - w.p2.x) < 0.1;
              
              if (isVertical) {
                const wx = w.p1.x;
                const yMin = Math.min(w.p1.y, w.p2.y);
                const yMax = Math.max(w.p1.y, w.p2.y);
                if (pos.y >= yMin - 0.5 && pos.y <= yMax + 0.5) {
                  if (wx > pos.x && wx < maxX_room) maxX_room = wx;
                  if (wx < pos.x && wx > minX_room) minX_room = wx;
                }
              }
              if (isHorizontal) {
                const wy = w.p1.y;
                const xMin = Math.min(w.p1.x, w.p2.x);
                const xMax = Math.max(w.p1.x, w.p2.x);
                if (pos.x >= xMin - 0.5 && pos.x <= xMax + 0.5) {
                  if (wy > pos.y && wy < maxY_room) maxY_room = wy;
                  if (wy < pos.y && wy > minY_room) minY_room = wy;
                }
              }
            });

            const inferredWidth = minX_room !== -Infinity && maxX_room !== Infinity ? maxX_room - minX_room : undefined;
            const inferredDepth = minY_room !== -Infinity && maxY_room !== Infinity ? maxY_room - minY_room : undefined;
            const width = r.sourceWidth ?? inferredWidth;
            const depth = r.sourceDepth ?? inferredDepth;

            if (width !== undefined && depth !== undefined) {

              if (width > 0.5 && depth > 0.5 && width < 30 && depth < 30) {
                const area = width * depth;
                const clearSpan = Math.min(width, depth);
                extraProps.textFontSize = clearSpan < 1.4 ? 3.5 : clearSpan < 2.2 ? 4.5 : 6;
                extraProps.dimFontSize = clearSpan < 1.4 ? 2.8 : clearSpan < 2.2 ? 3.8 : 5;
                let dimStr = '';
                let areaStr = '';

                if (unitSystem === 'imperial') {
                  dimStr = `${formatDimension(width, 'imperial')} x ${formatDimension(depth, 'imperial')}`;
                  areaStr = `(${(area * 10.7639).toFixed(1)} ft\u00b2)`;
                } else {
                  dimStr = `${formatDimension(width, 'metric')} x ${formatDimension(depth, 'metric')}`;
                  areaStr = `(${area.toFixed(1)} m\u00b2)`;
                }
                finalLabel = `${r.label.toUpperCase()}\n${dimStr}\n${areaStr}`;
              }
            }
          }

          elements.push({
            id: crypto.randomUUID(), type: 'room',
            pos: pos, label: finalLabel,
            levelId: getLevelId(r.levelIndex),
            ...digitizationFields(r),
            ...extraProps
          });
        });

        data.furniture?.forEach(f => {
          const mappedX = minX + f.pos[0] * (maxX - minX);
          const mappedY = minY + f.pos[1] * (maxY - minY);
          elements.push(normalizeInteriorElement({
            id: crypto.randomUUID(),
            type: 'furniture',
            pos: off([mappedX, mappedY]),
            width: f.width,
            depth: f.depth,
            rotation: f.rotation,
            subType: f.subType,
            levelId: getLevelId(f.levelIndex),
            ...digitizationFields(f),
          }));
        });

        data.fixtures?.forEach(f => {
          const itemType = (f.subType === 'cntr_kitchen' || f.subType === 'cntr_island') ? 'counter' : 'fixture';
          const mappedX = minX + f.pos[0] * (maxX - minX);
          const mappedY = minY + f.pos[1] * (maxY - minY);
          elements.push(normalizeInteriorElement({
            id: crypto.randomUUID(),
            type: itemType,
            pos: off([mappedX, mappedY]),
            width: f.width,
            depth: f.depth,
            rotation: f.rotation,
            subType: f.subType,
            levelId: getLevelId(f.levelIndex),
            ...digitizationFields(f),
          }));
        });
    }

    return elements;
  };

  const buildText4gComparisonProject = (data: GeneratedData): Project => {
    const mappedElements = mapToArchElements(data);
    const elements = isText4jMode
      ? markText4jAuthoritativePreview(mappedElements)
      : isText4hMode
        ? markText4hAuthoritativePreview(mappedElements)
        : markText4gAuthoritativePreview(mappedElements);
    return {
      ...(canvasProjectTemplate || {}),
      name: `Text 4.0 ${isText4jMode ? 'J' : isText4hMode ? 'H' : 'G'} Comparison Preview`,
      mode: 'floorplan',
      levels: [{ id: PREVIEW_LEVEL_ID, name: 'Level 1', zElevation: 0, height: 3, order: 0 }],
      elements,
      viewBox: canvasProjectTemplate?.viewBox || { width: 800, height: 600 },
    };
  };

  const buildText4gComparisonEditorState = (elements: ArchElement[], width = 430, height = 420): EditorState => {
    const bounds = measureElements(elements, true, true);
    const padWorld = Math.max(1, Math.max(bounds.w, bounds.h) * 0.1);
    const fitWidth = Math.max(1, bounds.w + padWorld * 2);
    const fitHeight = Math.max(1, bounds.h + padWorld * 2);
    const nextZoom = Math.max(0.01, Math.min(width / fitWidth, height / fitHeight, 42));
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    return {
      ...previewEditorState,
      zoom: nextZoom,
      offset: {
        x: width / 2 - centerX * nextZoom,
        y: height / 2 - centerY * nextZoom,
      },
      selectedIds: [],
      activeLevelId: PREVIEW_LEVEL_ID,
    };
  };

  const renderText4gComparisonPreview = (key: Text4gComparisonKey) => {
    const comparisonResults = isText4jMode ? text4jComparisonResults : isText4hMode ? text4hComparisonResults : text4gComparisonResults;
    const selectedComparison = isText4jMode ? selectedText4jComparison : isText4hMode ? selectedText4hComparison : selectedText4gComparison;
    const setSelectedComparison = isText4jMode ? setSelectedText4jComparison : isText4hMode ? setSelectedText4hComparison : setSelectedText4gComparison;
    const comparisonCanvasRefs = isText4jMode ? text4jComparisonCanvasRefs : isText4hMode ? text4hComparisonCanvasRefs : text4gComparisonCanvasRefs;
    const result = comparisonResults?.[key];
    if (!result) return null;
    const selected = selectedComparison === key;
    const counts = summarizeText4gResult(result.data);
    const projectForResult = result.data ? buildText4gComparisonProject(result.data) : null;
    const editorStateForResult = projectForResult
      ? buildText4gComparisonEditorState(projectForResult.elements)
      : null;
    const rasterPixelBounds = result.data?.walls?.reduce<{
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    } | null>((bounds, wall) => {
      const pixels = wall.evidence?.pixelBounds;
      if (!pixels) return bounds;
      return {
        minX: Math.min(bounds?.minX ?? Infinity, pixels.x0),
        minY: Math.min(bounds?.minY ?? Infinity, pixels.y0),
        maxX: Math.max(bounds?.maxX ?? -Infinity, pixels.x1),
        maxY: Math.max(bounds?.maxY ?? -Infinity, pixels.y1),
      };
    }, null);
    const rasterWorldBounds = projectForResult
      ? measureElements(projectForResult.elements.filter(element => element.type === 'wall'), true, true)
      : null;
    const autoPlanRasterRegistration = isAutoPlanGenerationMode
      && result.data?.sourceImageBase64
      && rasterPixelBounds
      && rasterWorldBounds
      && rasterPixelBounds.maxX > rasterPixelBounds.minX
      && rasterPixelBounds.maxY > rasterPixelBounds.minY
      && rasterWorldBounds.w > 0
      && rasterWorldBounds.h > 0
      ? {
          imageUrl: result.data.sourceImageBase64,
          opacity: 0.25,
          pixelReferenceBounds: rasterPixelBounds,
          worldReferenceBounds: rasterWorldBounds,
        }
      : null;
    const selectResult = () => {
      if (result.status !== 'done' || !result.data || (isText4jMode && key === 'master')) return;
      setSelectedComparison(key as any);
      setGeneratedData(result.data);
    };

    return (
      <div
        key={key}
        className={`flex min-w-0 flex-1 flex-col rounded-2xl border bg-white shadow-sm overflow-hidden ${selected ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-slate-200'}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white/95 p-3">
          <button
            type="button"
            onClick={selectResult}
            disabled={result.status !== 'done' || (isText4jMode && key === 'master')}
            className="min-w-0 text-left disabled:cursor-not-allowed"
          >
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-800">{result.label}</div>
            <div className={`mt-1 text-[11px] font-bold ${result.status === 'done' ? 'text-emerald-700' : result.status === 'error' ? 'text-red-700' : result.status === 'pending' ? 'text-blue-700' : 'text-slate-500'}`}>
              {result.status === 'pending' ? 'Processing...' : result.status === 'error' ? 'Failed' : result.status === 'idle' ? 'Not Generated (On-Demand)' : isText4jMode && key === 'master' ? 'Geometry candidate view' : selected ? 'Selected for Import' : 'Ready - click to select'}
            </div>
            {showImageToJsonLogs && <div className="mt-1 text-[11px] font-semibold text-slate-600">
              {result.status === 'idle' ? 'Optional (Click to generate)' : `Time ${formatText4gSeconds(result.durationMs)}`}
            </div>}
            {showImageToJsonLogs && result.status === 'done' && (
              <div className="mt-0.5 text-[10px] font-semibold text-slate-500">
                Walls {counts.walls} · Spaces {counts.spaces} · Openings {counts.openings}
              </div>
            )}
            {isText4jMode && key === 'local' && result.data?.extractionDiagnostics?.structuredReconciliation && (
              <div className="mt-1 text-[10px] font-bold text-emerald-700">
                Local {result.data.extractionDiagnostics.structuredReconciliation.baselineWalls}
                {' + '}Structured {result.data.extractionDiagnostics.structuredReconciliation.acceptedRepairs}
                {' = '}Final {result.data.extractionDiagnostics.structuredReconciliation.finalWalls}
                {` | Rejected ${result.data.extractionDiagnostics.structuredReconciliation.rejectedOverlap} overlap, ${result.data.extractionDiagnostics.structuredReconciliation.rejectedLengthBudget} length`}
              </div>
            )}
          </button>
          <div className="flex items-center gap-1.5 shrink-0">
            {key === 'master' && !isAutoScanFlashMode && !isAutoPlanGenerationMode && !isText4jMode && (
              <select
                aria-label="Gemini Master thinking level"
                value={isText4hMode ? text4hMasterThinkingLevel : text4gMasterThinkingLevel}
                onChange={event => isText4hMode ? setText4hMasterThinkingLevel(event.target.value as Text4hMasterThinkingLevel) : setText4gMasterThinkingLevel(event.target.value as Text4gMasterThinkingLevel)}
                disabled={result.status === 'pending'}
                className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold capitalize text-slate-700 outline-none hover:border-indigo-300 focus:border-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                title="Gemini 3.5 Flash-Lite thinking level"
              >
                <option value="minimal">Minimal</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            )}
            {key === 'master' && !isAutoScanFlashMode && !isAutoPlanGenerationMode && !isText4jMode && (result.status === 'idle' || result.status === 'error' || result.status === 'done') && (
              <button
                type="button"
                onClick={handleGenerateMasterFloorplanData}
                disabled={result.status === 'pending'}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 hover:border-indigo-300 disabled:opacity-40 transition-all shadow-xs"
                title={result.status === 'done' ? 'Regenerate Gemini Master' : 'Generate Gemini Master'}
              >
                <Sparkles size={13} className="text-indigo-600" />
                <span>{result.status === 'done' ? 'Regenerate' : result.status === 'error' ? 'Retry' : 'Generate'}</span>
              </button>
            )}
            {isAutoScanFlashMode && key === 'master' && autoScanGeneratedImage && (
              <button
                type="button"
                onClick={() => setShowAutoScanGeneratedImage(current => !current)}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-bold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              >
                <ImageIcon size={13} />
                {showAutoScanGeneratedImage ? 'Show Floorplan' : 'Show Image'}
              </button>
            )}
            {isAutoPlanGenerationMode && autoPlanRasterRegistration && (
              <button
                type="button"
                onClick={() => setAutoPlanImageVisibility(current => ({ ...current, [key]: !current[key] }))}
                className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-[11px] font-bold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
                title="Preview generated image underlay; it will not be imported"
              >
                <ImageIcon size={13} />
                {autoPlanImageVisibility[key] ? 'Hide Image' : 'Show Image'}
              </button>
            )}
            {!isAutoScanFlashMode && !isAutoPlanGenerationMode && <button
              type="button"
              onClick={() => exportText4gComparisonJson(result.data, key)}
              disabled={result.status !== 'done' || !result.data}
              className="h-8 w-8 shrink-0 rounded-lg border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center"
              title={`Export ${result.label}`}
            >
              <Download size={15} />
            </button>}
          </div>
        </div>
        <div
          ref={node => { comparisonCanvasRefs.current[key] = node; }}
          className="relative min-h-[360px] flex-1 bg-slate-50"
        >
          {isAutoScanFlashMode && key === 'master' && showAutoScanGeneratedImage && autoScanGeneratedImage ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white p-4">
              <img
                src={autoScanGeneratedImage}
                alt="App-generated standardized floorplan"
                className="max-h-full max-w-full object-contain"
              />
            </div>
          ) : projectForResult && editorStateForResult ? (
            <Canvas
              project={projectForResult}
              editorState={editorStateForResult}
              activeLevelId={PREVIEW_LEVEL_ID}
              onElementsChange={() => {}}
              onElementsCommit={() => {}}
              onSelectionChange={() => {}}
              onTransformChange={() => {}}
              setEditorState={() => {}}
              activeProceduralConfig={null}
              rasterUnderlay={autoPlanImageVisibility[key] ? autoPlanRasterRegistration : null}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
              {result.status === 'pending' ? (
                <div className="flex flex-col items-center gap-3 text-blue-700">
                  {isAutoScanFlashMode || isAutoPlanGenerationMode
                    ? <CompositedProcessingSpinner size={24} strokeWidth={3} />
                    : <Loader2 size={24} className="animate-spin" />}
                  <div className="text-xs font-bold">{isAutoScanFlashMode ? (key === 'local' ? 'Digitizing uploaded image...' : 'Generating and digitizing standardized image...') : isAutoPlanGenerationMode ? `Generating and digitizing variant ${key === 'master' ? '1' : '2'}...` : isText4jMode ? 'Fetching Structured3D geometry...' : 'Transcribing Gemini Master JSON...'}</div>
                </div>
              ) : result.status === 'idle' ? (
                <div className="flex flex-col items-center gap-3 max-w-xs text-slate-700">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 border border-indigo-100 shadow-xs text-indigo-600">
                    <Sparkles size={24} />
                  </div>
                  <div className="text-sm font-bold text-slate-800">Gemini Master JSON</div>
                  <p className="text-xs text-slate-500 leading-normal">
                    AI-transcribed floorplan via Gemini vision models. Generated on-demand to conserve API credits.
                  </p>
                  {!isAutoScanFlashMode && !isAutoPlanGenerationMode && <button
                    type="button"
                    onClick={handleGenerateMasterFloorplanData}
                    className="mt-1 flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 active:scale-95 transition-all"
                  >
                    <Sparkles size={15} />
                    <span>Generate Gemini Master JSON</span>
                  </button>}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 max-w-xs text-red-700">
                  <div className="text-xs font-semibold leading-relaxed">
                    {result.error || `${result.label} failed.`}
                  </div>
                  {!isAutoScanFlashMode && !isAutoPlanGenerationMode && <button
                    type="button"
                    onClick={handleGenerateMasterFloorplanData}
                    className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700 hover:bg-red-100"
                  >
                    <RefreshCw size={14} />
                    <span>Retry Gemini Master JSON</span>
                  </button>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const hasSelectedSimplifiedFloorplan = (isAutoScanFlashMode || isAutoPlanGenerationMode) && previewElements.length > 0;
  const hasImageToJsonComparison = !!(
    (isText4gMode || isText4hMode || isText4jMode)
    && (isText4jMode ? text4jComparisonResults : isText4hMode ? text4hComparisonResults : text4gComparisonResults)
    && !externalImport
  );

  const handleApply = async () => {
    if (previewElements.length === 0) return;
    if (isText4dDigitizationPending && !hasSelectedSimplifiedFloorplan) return;
    if (!externalImport && generatedData?.extractionDiagnostics?.canImport === false && !hasSelectedSimplifiedFloorplan) return;
    if (externalImport?.isBimImport && externalImport.canConvert === false) return;
    if (externalImport && onApplyExternalImport) {
      await onApplyExternalImport(previewElements, externalImport.isBimImport ? 'bim-interactive' : importConversionMode);
      onClose();
      return;
    }
    onApply(isText4jMode ? markText4jAuthoritativePreview(previewElements) : isText4hMode ? markText4hAuthoritativePreview(previewElements) : isText4gMode ? markText4gAuthoritativePreview(previewElements) : isText4fMode ? markText4fAuthoritativePreview(previewElements) : isText4eMode ? markText4eAuthoritativePreview(previewElements) : isText4dMode ? markText4dAuthoritativePreview(previewElements) : previewElements);
    onClose();
  };

  if (!isOpen) return null;

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

  const hasValidBounds = previewBounds.w > 0 && previewBounds.h > 0 && 
                         isFinite(screenBounds.left) && isFinite(screenBounds.right) && 
                         isFinite(screenBounds.top) && isFinite(screenBounds.bottom);

  const hLineY = hasValidBounds ? Math.max(35, screenBounds.top - 55) : 35;
  const vLineX = hasValidBounds ? Math.max(70, screenBounds.left - 65) : 70;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-3 pt-12">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[96vw] overflow-hidden flex flex-col h-[calc(100vh-4rem)] animate-in zoom-in-95 duration-200">
        
        {/* Full-screen tools use the app bar as their sole Back control. */}
        {mode !== 'ai-rendering' && <div className="px-6 py-4 border-b border-slate-100 flex items-center bg-white shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-indigo-600">
              <Sparkles size={20} />
              <h2 className="font-bold text-lg text-slate-900">
                {externalImport?.isBimImport
                  ? "BIM Importer Preview"
                  : externalImport?.isBimAsset
                    ? "BIM Revit Family Scale & Verify"
                    : isText4hWorkspace
                      ? isAutoScanWorkspace ? "AutoScan" : "AutoPlan"
                    : mode === 'ai-rendering'
                      ? initialAiRenderingHub === 'gen_3d' ? "3D Generator" : "Render Canvas"
                      : "Design Copilot"}
              </h2>
            </div>
            
            {SHOW_LEGACY_AI_GEN_MODE_SELECTOR && step === 'input' && mode !== 'ai-rendering' && !isText4hWorkspace && (
              <ModeSelector
                mode={mode}
                isOpen={isModeDropdownOpen}
                onOpenChange={setIsModeDropdownOpen}
                onModeChange={setMode}
              />
            )}
            {step === 'input' && isAutoPlanWorkspace && (
              <div className="flex items-center rounded-lg border border-blue-100 bg-blue-50 p-1">
                <button
                  type="button"
                  onClick={() => setMode('chat-v4h')}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${mode === 'chat-v4h' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-blue-700'}`}
                >
                  Flash
                </button>
                <button
                  type="button"
                  onClick={() => setMode('smart-procedural')}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${mode === 'smart-procedural' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-blue-700'}`}
                >
                  Instant
                </button>
              </div>
            )}
            {isAutoScanWorkspace && (step === 'text4d-image-test' || step === 'input') && (
              <div className="flex items-center rounded-lg border border-blue-100 bg-blue-50 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode('chat-v4h');
                    setStep('text4d-image-test');
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${mode === 'chat-v4h' && step === 'text4d-image-test' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-blue-700'}`}
                >
                  Simple Plans - Flash
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('digitizer');
                    setStep('input');
                  }}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${mode === 'digitizer' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-blue-700'}`}
                >
                  <Edit3 size={14} /> Pro
                </button>
              </div>
            )}
          </div>

        </div>}

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-50 relative">

          {step === 'input' && mode === 'auto-plan' && !isExternalImport && (
            <AutoPlanPanel
              currentBoundary={currentBoundary}
              unitSystem={unitSystem}
              onApply={onApply}
              onClose={onClose}
            />
          )}

          {step === 'input' && mode === 'smart-procedural' && isAutoPlanWorkspace && !isExternalImport && (
            <AutoProceduralPanel
              workflow="smart"
              currentBoundary={currentBoundary}
              unitSystem={unitSystem}
              onApply={onApply}
              onClose={onClose}
            />
          )}

          {step === 'input' && mode === 'ai-rendering' && (
            <AiRenderingPanel
              onClose={onClose}
              initialHub={initialAiRenderingHub}
              initialSnapshots={initialSnapshots}
              onSnapshotsConsumed={onSnapshotsConsumed}
              onApplyToCanvas={(elements, options) => {
                onApply(elements, options);
                onClose();
              }}
            />
          )}

          {/* Side-by-side Unified Panel for chat-v2 / chat-v3 / chat-v4 */}
          {step === 'input' && ((mode as any) === 'chat-v2' || (mode as any) === 'chat-v3' || (mode as any) === 'chat-v4' || (mode as any) === 'chat-v4a' || (mode as any) === 'chat-v4b' || (mode as any) === 'chat-v4c' || (mode as any) === 'chat-v4d' || (mode as any) === 'chat-v4e' || (mode as any) === 'chat-v4f' || (mode as any) === 'chat-v4g' || (mode as any) === 'chat-v4h' || (mode as any) === 'chat-v4j') && (
            <div className="flex-1 flex overflow-hidden h-full">
              {/* Left Panel: Chat (1/3 width) */}
              <div className="w-1/3 border-r border-slate-200 flex flex-col h-full bg-slate-50">
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex gap-2 max-w-[90%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-indigo-100 text-indigo-600' : 'bg-green-100 text-green-600'}`}>
                          {msg.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                        </div>
                        <div className={`p-2.5 rounded-xl text-xs leading-relaxed ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm'}`}>
                          {msg.text}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex justify-start"><div className="bg-slate-200 rounded-full px-3 py-1.5 text-[10px] text-slate-500 animate-pulse">Thinking...</div></div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="p-3 bg-white border-t border-slate-200 shrink-0">
                  <div className="flex gap-2">
                    <input type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="Type something..." className="flex-1 px-3 py-2 bg-slate-100 text-slate-900 placeholder:text-slate-400 border-none rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-xs" />
                    <button onClick={handleSendMessage} disabled={!userInput.trim() || isTyping} className="p-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-all disabled:opacity-50"><Send size={14} /></button>
                  </div>
                </div>
              </div>

              {/* Right Panel: Design Brief Confirmation Editor (2/3 width) */}
              <div className="w-2/3 flex flex-col h-full bg-white p-6 overflow-hidden">
                <div className="flex items-center gap-3 text-indigo-700 border-b border-indigo-50 pb-4 shrink-0"><Edit3 size={24} /><h3 className="text-xl font-bold">Design Brief Confirmation</h3></div>
                
                <div className="flex-1 min-h-0 overflow-y-auto py-4">
                  <ChatV2SummaryEditor
                    value={designSummary}
                    onChange={setDesignSummary}
                    strictDimensions={isText4ReplicaMode}
                    text4cBrief={isText4jMode ? text4jBrief : isText4hMode ? text4hBrief : isText4gMode ? text4gBrief : isText4fMode ? text4fBrief : isText4eMode ? text4eBrief : isText4dMode ? text4dBrief : isText4cMode ? text4cBrief : undefined}
                    onText4cBriefChange={isText4jMode ? handleText4jBriefChange : isText4hMode ? handleText4hBriefChange : isText4gMode ? handleText4gBriefChange : isText4fMode ? handleText4fBriefChange : isText4eMode ? handleText4eBriefChange : isText4dMode ? handleText4dBriefChange : isText4cMode ? handleText4cBriefChange : undefined}
                    updateText4BriefFromSummary={isText4jMode ? updateText4jBriefFromSummary : isText4hMode ? updateText4hBriefFromSummary : isText4gMode ? updateText4gBriefFromSummary : isText4fMode ? updateText4fBriefFromSummary : isText4eMode ? updateText4eBriefFromSummary : isText4dMode ? updateText4dBriefFromSummary : updateText4cBriefFromSummary}
                    showText4dRectangularBoundary={isText4IsolatedMode}
                    text4IsolatedVariant={isText4jMode ? 'j' : isText4hMode ? 'h' : isText4gMode ? 'g' : isText4fMode ? 'f' : isText4eMode ? 'e' : 'd'}
                  />
                </div>

                <div className="border-t border-slate-100 pt-4 flex items-center justify-between gap-3 shrink-0">
                  {isText4ReplicaMode && error ? (
                    <p className="text-xs font-semibold text-red-700 max-w-md">Generation stopped: {error}</p>
                  ) : isText4ReplicaMode && infoMessage ? (
                    <p className="text-xs font-semibold text-amber-700 max-w-md">{infoMessage}</p>
                  ) : isText4ReplicaMode && !activeText4Validation.valid ? (
                    <p className="text-xs font-semibold text-amber-700 max-w-md">{activeText4Validation.errors.join(' ')}</p>
                  ) : <span />}
                  <div className="flex items-center gap-3">
                    {isText4IsolatedMode && (
                      <button
                        onClick={handleCopyPrompt}
                        type="button"
                        className="px-5 py-3 bg-white text-indigo-700 font-bold rounded-xl border border-indigo-200 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
                        title="Copy the exact prompt string built for floorplan image generation"
                      >
                        {copiedPrompt ? <Check size={17} className="text-emerald-600" /> : <Copy size={17} />}
                        {copiedPrompt ? 'COPIED PROMPT!' : 'COPY PROMPT'}
                      </button>
                    )}
                    {isText4IsolatedMode && !isText4hMode && (
                      <button
                        onClick={handleSkipText4dImageGeneration}
                        className="px-5 py-3 bg-white text-amber-700 font-bold rounded-xl border border-amber-300 hover:bg-amber-50 transition-all flex items-center justify-center gap-2"
                        title={`Skip Gemini image generation and test Text 4.0 ${isText4jMode ? 'J' : isText4hMode ? 'H' : isText4gMode ? 'G' : isText4fMode ? 'F' : isText4eMode ? 'E' : 'D'} with an existing floorplan image`}
                      >
                        <Upload size={17} /> SKIP TO IMAGE TEST
                      </button>
                    )}
                    <button
                      onClick={handleGenerateFromChat}
                      disabled={countdown > 0 || (isText4ReplicaMode && !activeText4Validation.valid)}
                      className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-250 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {countdown > 0 ? `Please wait ${minutes}:${seconds.toString().padStart(2, '0')}` : <><Wand2 size={18} /> Generate Geometry</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {step === 'input' && (mode === 'chat' || mode === 'fusion' || mode === 'text2plan' || mode === 'smart-text2plan') && (
            <>
              <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {chatHistory.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex gap-3 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-indigo-100 text-indigo-650' : 'bg-green-100 text-green-600'}`}>
                        {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                      </div>
                      <div className={`p-3.5 rounded-2xl text-sm leading-relaxed ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm'}`}>
                        {msg.text}
                      </div>
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="flex justify-start"><div className="bg-slate-200 rounded-full px-4 py-2 text-xs text-slate-500 animate-pulse">Thinking...</div></div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="p-4 bg-white border-t border-slate-200 shrink-0">
                <div className="flex gap-2">
                  <input type="text" value={userInput} onChange={(e) => setUserInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} placeholder="Type your answer or requirement..." className="flex-1 px-4 py-3 bg-slate-100 text-slate-900 placeholder:text-slate-400 border-none rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
   autoFocus />
                  <button onClick={handleSendMessage} disabled={!userInput.trim() || isTyping} className="p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all disabled:opacity-50"><Send size={18} /></button>
                </div>
              </div>
            </>
          )}

          {step === 'input' && (mode === 'image' || mode === 'redraw-v2' || mode === 'digitizer' || mode === 'tracer') && (
            <div className="flex-1 flex flex-col items-center justify-center p-8 animate-in fade-in slide-in-from-bottom-4">
               {!selectedImage ? (
                 <label 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`w-full max-w-lg h-64 border-2 border-dashed rounded-2xl transition-all cursor-pointer flex flex-col items-center justify-center group ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50 hover:bg-white hover:border-indigo-400'}`}
                 >
                    <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Upload className="text-indigo-600" size={32} /></div>
                    <span className="text-slate-600 font-bold text-lg">
                      {isDragging ? 'Drop Image Here' : 'Upload or Drag & Drop Image'}
                    </span>
                    <span className="text-slate-400 text-xs mt-1">PNG, JPG or WebP</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                 </label>
               ) : (
                 <div className="w-full max-w-lg space-y-6">
                    <div className="relative aspect-video rounded-2xl overflow-hidden border border-slate-200 shadow-md bg-white">
                       <img src={selectedImage} alt="Preview" className="w-full h-full object-contain" />
                       <button onClick={() => { setSelectedImage(null); setSelectedFile(null); }} className="absolute top-2 right-2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70"><X size={16} /></button>
                    </div>
                    
                    {/* Controls Removed from here - moved to Preview Step for Tracer */}

                    {mode === 'image' && (
                        <button onClick={handleGenerateFromImage} disabled={countdown > 0} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                          {countdown > 0 ? `Please wait ${minutes}:${seconds.toString().padStart(2, '0')}` : <><Wand2 size={18} /> Trace Geometry (Fast)</>}
                        </button>
                    )}
                    
                    {mode === 'redraw-v2' && (
                        <button onClick={handleGenerateRedrawV2} disabled={countdown > 0} className="w-full py-3 bg-purple-600 text-white font-bold rounded-xl hover:bg-purple-700 shadow-lg shadow-purple-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                          {countdown > 0 ? `Please wait ${minutes}:${seconds.toString().padStart(2, '0')}` : <><Sparkles size={18} /> Smart Reconstruct (Logic)</>}
                        </button>
                    )}

                    {mode === 'digitizer' && (
                        <button onClick={handleGenerateDigitizer} disabled={countdown > 0} className="w-full py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                          {countdown > 0 ? `Please wait ${minutes}:${seconds.toString().padStart(2, '0')}` : <><Edit3 size={18} /> Recreate Floorplan (Draftsman)</>}
                        </button>
                    )}

                    {mode === 'tracer' && (
                        <button onClick={() => handleGenerateTracer(false)} disabled={countdown > 0} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                          {countdown > 0 ? `Please wait ${minutes}:${seconds.toString().padStart(2, '0')}` : <><Zap size={18} /> Trace Floorplan (Realtime)</>}
                        </button>
                    )}
                 </div>
               )}
            </div>
          )}

          {step === 'input' && mode === 'reference' && (
            <div className="flex-1 flex flex-col p-6 gap-4 animate-in fade-in slide-in-from-bottom-4">
               <div className="flex-1 flex gap-4 overflow-hidden">
                  <div className="flex-1 flex flex-col h-full">
                    <h3 className="text-sm font-bold text-slate-700 mb-2">1. Reference Image</h3>
                    {!selectedImage ? (
                      <label className="flex-1 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 hover:bg-white hover:border-indigo-400 transition-all cursor-pointer flex flex-col items-center justify-center group">
                          <Upload className="text-indigo-400 mb-2 group-hover:scale-110 transition-transform" size={24} />
                          <span className="text-slate-500 font-medium text-sm text-center px-4">Upload style reference</span>
                          <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                      </label>
                    ) : (
                      <div className="flex-1 relative rounded-2xl overflow-hidden border border-slate-200 bg-white">
                        <img src={selectedImage} alt="Reference" className="w-full h-full object-contain" />
                        <button onClick={() => { setSelectedImage(null); setSelectedFile(null); }} className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full hover:bg-black/70"><X size={14} /></button>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col h-full">
                    <h3 className="text-sm font-bold text-slate-700 mb-2">2. Design Brief</h3>
                    <textarea value={designSummary} onChange={(e) => setDesignSummary(e.target.value)} placeholder="E.g., Adapt this style for a 2-bedroom apartment..." className="flex-1 p-4 bg-white border border-slate-200 rounded-2xl text-slate-800 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
                  </div>
               </div>
               <button onClick={() => setStep('summary')} disabled={!selectedImage || !designSummary.trim()} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">Review & Generate <ArrowRight size={18} /></button>
            </div>
          )}

          {step === 'summary' && (
            <div className="flex-1 p-8 flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-4 h-full overflow-hidden">
              <div className={`w-full ${ (mode as any) === 'chat-v2' || (mode as any) === 'chat-v3' || (mode as any) === 'chat-v4' || (mode as any) === 'chat-v4a' || (mode as any) === 'chat-v4b' || (mode as any) === 'chat-v4c' || (mode as any) === 'chat-v4d' || (mode as any) === 'chat-v4e' || (mode as any) === 'chat-v4f' || (mode as any) === 'chat-v4g' || (mode as any) === 'chat-v4h' || (mode as any) === 'chat-v4j' ? 'max-w-5xl h-full flex flex-col' : 'max-w-xl' } bg-white rounded-2xl shadow-xl border border-slate-200 p-6 space-y-6 flex flex-col`}>
                <div className="flex items-center gap-3 text-indigo-700 border-b border-indigo-50 pb-4 shrink-0"><Edit3 size={24} /><h3 className="text-xl font-bold">Design Brief Confirmation</h3></div>
                <div className="space-y-2 flex-1 flex flex-col min-h-0 overflow-hidden">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0">Final Requirements</label>
                  {(mode as any) === 'chat-v2' || (mode as any) === 'chat-v3' || (mode as any) === 'chat-v4' || (mode as any) === 'chat-v4a' || (mode as any) === 'chat-v4b' || (mode as any) === 'chat-v4c' || (mode as any) === 'chat-v4d' || (mode as any) === 'chat-v4e' || (mode as any) === 'chat-v4f' || (mode as any) === 'chat-v4g' || (mode as any) === 'chat-v4h' || (mode as any) === 'chat-v4j' ? (
                    <ChatV2SummaryEditor
                      value={designSummary}
                      onChange={setDesignSummary}
                      strictDimensions={isText4ReplicaMode}
                      text4cBrief={isText4jMode ? text4jBrief : isText4hMode ? text4hBrief : isText4gMode ? text4gBrief : isText4fMode ? text4fBrief : isText4eMode ? text4eBrief : isText4dMode ? text4dBrief : isText4cMode ? text4cBrief : undefined}
                      onText4cBriefChange={isText4jMode ? handleText4jBriefChange : isText4hMode ? handleText4hBriefChange : isText4gMode ? handleText4gBriefChange : isText4fMode ? handleText4fBriefChange : isText4eMode ? handleText4eBriefChange : isText4dMode ? handleText4dBriefChange : isText4cMode ? handleText4cBriefChange : undefined}
                      updateText4BriefFromSummary={isText4jMode ? updateText4jBriefFromSummary : isText4hMode ? updateText4hBriefFromSummary : isText4gMode ? updateText4gBriefFromSummary : isText4fMode ? updateText4fBriefFromSummary : isText4eMode ? updateText4eBriefFromSummary : isText4dMode ? updateText4dBriefFromSummary : updateText4cBriefFromSummary}
                      showText4dRectangularBoundary={isText4IsolatedMode}
                      text4IsolatedVariant={isText4jMode ? 'j' : isText4hMode ? 'h' : isText4gMode ? 'g' : isText4fMode ? 'f' : isText4eMode ? 'e' : 'd'}
                    />
                  ) : (
                    <textarea value={designSummary} onChange={(e) => setDesignSummary(e.target.value)} className="w-full h-32 p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl text-slate-800 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none resize-none leading-relaxed" />
                  )}
                </div>
                <div className="flex justify-end gap-3 pt-2 shrink-0">
                  {isText4ReplicaMode && !activeText4Validation.valid && (
                    <p className="self-center text-xs font-semibold text-amber-700 max-w-xs">{activeText4Validation.errors.join(' ')}</p>
                  )}
                  {isText4IsolatedMode && (
                    <button
                      onClick={handleCopyPrompt}
                      type="button"
                      className="px-5 py-3 bg-white text-indigo-700 font-bold rounded-xl border border-indigo-200 hover:bg-indigo-50 transition-all flex items-center justify-center gap-2"
                      title="Copy the exact prompt string built for floorplan image generation"
                    >
                      {copiedPrompt ? <Check size={17} className="text-emerald-600" /> : <Copy size={17} />}
                      {copiedPrompt ? 'COPIED PROMPT!' : 'COPY PROMPT'}
                    </button>
                  )}
                  {isText4IsolatedMode && !isText4hMode && (
                    <button
                      onClick={handleSkipText4dImageGeneration}
                      className="px-5 py-3 bg-white text-amber-700 font-bold rounded-xl border border-amber-300 hover:bg-amber-50 transition-all flex items-center justify-center gap-2"
                      title={`Skip Gemini image generation and test Text 4.0 ${isText4jMode ? 'J' : isText4hMode ? 'H' : isText4gMode ? 'G' : isText4fMode ? 'F' : isText4eMode ? 'E' : 'D'} with an existing floorplan image`}
                    >
                      <Upload size={17} /> SKIP TO IMAGE TEST
                    </button>
                  )}
                  <button 
                    onClick={mode === 'smart-text2plan' ? () => generate(() => generateFloorplanSmartText2Plan(designSummary, currentBoundary)) : (mode === 'text2plan' ? () => generate(() => generateFloorplanText2Plan(designSummary, currentBoundary)) : (mode === 'chat' || (mode as any) === 'chat-v2' || (mode as any) === 'chat-v3' || (mode as any) === 'chat-v4' || (mode as any) === 'chat-v4a' || (mode as any) === 'chat-v4b' || (mode as any) === 'chat-v4c' || (mode as any) === 'chat-v4d' || (mode as any) === 'chat-v4e' || (mode as any) === 'chat-v4f' || (mode as any) === 'chat-v4g' || (mode as any) === 'chat-v4h' || (mode as any) === 'chat-v4j' ? handleGenerateFromChat : (mode === 'image' ? handleGenerateFromImage : (mode === 'redraw-v2' ? handleGenerateRedrawV2 : (mode === 'digitizer' ? handleGenerateDigitizer : (mode === 'fusion' ? handleGenerateFromFusion : (mode === 'tracer' ? () => handleGenerateTracer(false) : handleGenerateFromReference)))))))}
                    disabled={countdown > 0 || (isText4ReplicaMode && !activeText4Validation.valid)}
                    className="flex-[2] py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {countdown > 0 ? `Please wait ${minutes}:${seconds.toString().padStart(2, '0')}` : <><Wand2 size={18} /> Generate Geometry</>}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'text4d-image-test' && isText4IsolatedMode && (
            <div className="flex-1 p-6 overflow-y-auto animate-in fade-in slide-in-from-bottom-4">
              <div className="w-full max-w-5xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-5">
                <div className="text-center space-y-2">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-black uppercase tracking-widest">
                    <Zap size={13} /> {isAutoScanFlashMode ? 'Simple Plans - Flash' : `Text 4.0 ${isText4jMode ? 'J' : isText4hMode ? 'H' : isText4gMode ? 'G' : isText4fMode ? 'F' : isText4eMode ? 'E' : 'D'} Conversion Test`}
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900">Upload a pre-created floorplan image</h3>
                  <p className="text-sm text-slate-500 max-w-2xl mx-auto">
                    {isAutoScanFlashMode
                      ? 'Upload the floorplan and provide its property dimensions. AutoScan will standardize and digitize it automatically.'
                      : `Gemini image generation is skipped. The uploaded raster goes directly through the independent Text 4.0 ${isText4jMode ? 'J' : isText4hMode ? 'H' : isText4gMode ? 'G' : isText4fMode ? 'F' : isText4eMode ? 'E' : 'D'} image-to-JSON conversion path.`}
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">1. Floorplan image</h4>
                        <p className="text-xs text-slate-500">PNG, JPG or WebP</p>
                      </div>
                    </div>
                    {!selectedImage ? (
                      <label
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`w-full h-72 border-2 border-dashed rounded-2xl transition-all cursor-pointer flex flex-col items-center justify-center group ${isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50 hover:bg-white hover:border-indigo-400'}`}
                      >
                        <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                          <Upload className="text-indigo-600" size={32} />
                        </div>
                        <span className="text-slate-700 font-bold">{isDragging ? 'Drop Floorplan Here' : 'Upload or Drag & Drop Floorplan'}</span>
                        <input type="file" className="hidden" accept="image/png,image/jpeg,image/webp" onChange={handleImageUpload} />
                      </label>
                    ) : (
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`relative h-72 rounded-2xl overflow-hidden border-2 bg-slate-50 transition-colors ${isDragging ? 'border-indigo-500' : 'border-slate-200'}`}
                      >
                        <img src={selectedImage} alt="Uploaded floorplan test" className="w-full h-full object-contain bg-white" />
                        <button
                          onClick={() => { setSelectedImage(null); setSelectedFile(null); setError(null); }}
                          className="absolute top-3 right-3 p-2 bg-black/55 text-white rounded-full hover:bg-black/75"
                          title="Remove image"
                        >
                          <X size={17} />
                        </button>
                        <label className="absolute left-3 bottom-3 px-3 py-2 bg-white/95 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 hover:bg-white cursor-pointer flex items-center gap-2 shadow-sm">
                          <Upload size={14} /> Replace
                          <input type="file" className="hidden" accept="image/png,image/jpeg,image/webp" onChange={handleImageUpload} />
                        </label>
                      </div>
                    )}
                  </div>

                  <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-bold text-slate-800">2. Property scale context <span className="text-red-600">(Required)</span></h4>
                        <p className="text-xs text-slate-500 mt-1">Enter either extent or both. Total area is optional. A missing extent is inferred without stretching the plan.</p>
                      </div>
                      <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1 shrink-0">
                        {(['metric', 'imperial'] as const).map(value => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setActiveText4IsolatedUploadScale(current => ({ ...current, unitSystem: value }))}
                            className={`px-3 py-1.5 rounded-md text-xs font-bold capitalize transition-colors ${activeText4IsolatedUploadScale.unitSystem === value ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:text-slate-800'}`}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-[11px] font-black uppercase tracking-wider text-slate-500">Property Extents as Dimensions</label>
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <label className="space-y-1">
                          <span className="text-xs font-semibold text-slate-600">Horiz Dim</span>
                          <div className="relative">
                            <input
                              type="text"
                              inputMode={activeText4IsolatedUploadScale.unitSystem === 'imperial' ? 'text' : 'decimal'}
                              autoComplete="off"
                              spellCheck={false}
                              value={activeText4IsolatedUploadScale.width}
                              onChange={event => setActiveText4IsolatedUploadScale(current => ({ ...current, width: event.target.value }))}
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 pr-14 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                              placeholder={activeText4IsolatedUploadScale.unitSystem === 'imperial' ? `e.g. 25'-6"` : 'e.g. 7.62 m'}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">{activeText4IsolatedUploadScale.unitSystem === 'imperial' ? 'ft / in' : 'metric'}</span>
                          </div>
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-semibold text-slate-600">Vert Dim</span>
                          <div className="relative">
                            <input
                              type="text"
                              inputMode={activeText4IsolatedUploadScale.unitSystem === 'imperial' ? 'text' : 'decimal'}
                              autoComplete="off"
                              spellCheck={false}
                              value={activeText4IsolatedUploadScale.depth}
                              onChange={event => setActiveText4IsolatedUploadScale(current => ({ ...current, depth: event.target.value }))}
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 pr-14 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                              placeholder={activeText4IsolatedUploadScale.unitSystem === 'imperial' ? `e.g. 40'-0"` : 'e.g. 12.19 m'}
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">{activeText4IsolatedUploadScale.unitSystem === 'imperial' ? 'ft / in' : 'metric'}</span>
                          </div>
                        </label>
                      </div>
                      <p className="mt-2 text-[11px] text-slate-500">
                        {activeText4IsolatedUploadScale.unitSystem === 'imperial'
                          ? `Accepted: 25'-6", 25 ft 6 in, 25-6, or decimal feet.`
                          : 'Accepted: metres (7.62 m), centimetres (762 cm), or millimetres (7620 mm).'}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="h-px bg-slate-200 flex-1" />
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">or / and</span>
                      <div className="h-px bg-slate-200 flex-1" />
                    </div>

                    <label className="space-y-1 block">
                      <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Total Property Area</span>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          spellCheck={false}
                          value={activeText4IsolatedUploadScale.area}
                          onChange={event => setActiveText4IsolatedUploadScale(current => ({ ...current, area: event.target.value }))}
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 pr-16 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder={activeText4IsolatedUploadScale.unitSystem === 'imperial' ? 'e.g. 1,000 sq ft' : 'e.g. 92.9 m\u00b2'}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">{activeText4IsolatedUploadScale.unitSystem === 'imperial' ? 'sq ft' : 'm\u00b2'}</span>
                      </div>
                      <span className="block text-[11px] text-slate-500">
                        {activeText4IsolatedUploadScale.unitSystem === 'imperial' ? 'Accepted: sq ft, sqft, sft, or ft\u00b2.' : 'Accepted: m\u00b2, sqm, or sq m.'}
                      </span>
                    </label>

                    <div className={`rounded-xl border px-3 py-2.5 text-xs ${activeText4IsolatedUploadValidation.valid ? 'border-green-200 bg-green-50 text-green-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                      {activeText4IsolatedUploadValidation.valid
                        ? activeText4IsolatedUploadValidation.hasDimensions && activeText4IsolatedUploadValidation.hasArea
                          ? `${activeText4IsolatedUploadValidation.hasCompleteDimensions ? 'Both dimensions' : 'One dimension'} and area are ready for conversion.`
                          : activeText4IsolatedUploadValidation.hasDimensions
                            ? activeText4IsolatedUploadValidation.hasCompleteDimensions
                              ? 'Both property dimensions are ready for conversion.'
                              : 'One property dimension is ready; the missing extent will be inferred from the traced plan.'
                            : 'Property area is ready for conversion.'
                        : activeText4IsolatedUploadValidation.errors.join(' ')}
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                    Conversion stopped: {error}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-5">
                  <button
                    onClick={handleConvertUploadedText4dImage}
                    disabled={!selectedImage || !activeText4IsolatedUploadValidation.valid}
                    className="px-7 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Zap size={18} /> {isAutoScanFlashMode ? 'Digitize Floorplan' : 'Convert Image to Floorplan JSON'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'manual-fallback' && fallbackUrl && (
            <div className="flex-1 p-8 flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-4 text-center">
               <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-6">
                  <ImageIcon size={32} />
               </div>
               <h3 className="text-2xl font-bold text-slate-800 mb-2">I found a matching plan!</h3>
               <p className="text-slate-500 max-w-md mb-6">
                 However, the website's security prevented me from downloading it automatically.
               </p>
               
               <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl p-4 shadow-sm mb-6 flex items-center gap-3">
                  <Globe className="text-indigo-500 shrink-0" size={20} />
                  <div className="flex-1 overflow-hidden">
                     <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-indigo-600 hover:underline truncate block font-medium">
                       {fallbackUrl}
                     </a>
                  </div>
                  <button onClick={() => { navigator.clipboard.writeText(fallbackUrl); }} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500" title="Copy URL">
                     <Copy size={16} />
                  </button>
               </div>

               <div className="bg-slate-50 border-2 border-dashed border-indigo-300 rounded-2xl p-8 w-full max-w-lg flex flex-col items-center gap-4">
                  <div className="flex items-center gap-2 text-indigo-700 font-bold">
                     <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">1</span>
                     Click the link above to open image
                  </div>
                  <div className="flex items-center gap-2 text-indigo-700 font-bold">
                     <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">2</span>
                     Right-click image & "Copy Image"
                  </div>
                  <div className="flex items-center gap-2 text-indigo-700 font-bold">
                     <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">3</span>
                     Press <span className="bg-white border border-slate-300 px-1.5 py-0.5 rounded text-xs font-mono text-slate-600 mx-1">Ctrl+V</span> here
                  </div>
                  
                  <div className="mt-4 text-xs text-slate-400 font-medium uppercase tracking-wider animate-pulse">
                     Waiting for paste...
                  </div>
               </div>
               
               <button onClick={() => setStep('input')} className="mt-8 text-slate-400 hover:text-slate-600 text-sm font-medium">Cancel</button>
            </div>
          )}

          {step === 'generating' && (
             <div className="flex-1 flex flex-col items-center justify-center space-y-6 animate-in fade-in">
                <div className="relative"><div className="absolute inset-0 bg-blue-500/20 blur-2xl rounded-full animate-pulse"></div>{isAutoScanFlashMode || isAutoPlanGenerationMode ? <CompositedProcessingSpinner /> : <Loader2 size={64} className="text-blue-600 animate-spin relative z-10" />}</div>
                <div className="text-center space-y-2"><h3 className="font-bold text-slate-800 text-xl">{isAutoScanFlashMode ? 'Digitizing Floorplan...' : isAutoPlanGenerationMode ? 'Generating Floorplan Variants...' : isText4IsolatedMode && activeText4IsolatedConversionSource === 'uploaded-test' ? 'Converting Image to Floorplan JSON...' : mode === 'fusion' ? 'Fusion 3.0: Searching & Architecting...' : 'Architecting your Space...'}</h3><p className="text-slate-500 text-sm max-w-xs mx-auto">{isAutoScanFlashMode ? 'Standardizing the drawing and converting it into an editable floorplan.' : isAutoPlanGenerationMode ? 'Creating two design variants and converting both into editable floorplans.' : isText4IsolatedMode && activeText4IsolatedConversionSource === 'uploaded-test' ? 'Running the independent Text 4.0 local OCR, tracing, and spatial validation.' : mode === 'fusion' ? 'Locating reference plans and tracing structure.' : 'Calculating architectural logic and geometry.'}</p></div>
             </div>
          )}

          {step === 'preview' && (
            <div className="flex-1 flex flex-col p-6 min-h-0 overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
                {!isAutoScanFlashMode && !isAutoPlanGenerationMode && (generatedData?.sourceImageBase64 || ((isText4gMode || isText4hMode || isText4jMode) && selectedImage)) && (
                  <div className="w-1/3 min-h-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col animate-in slide-in-from-left-4 duration-300">
                    <div className="p-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between gap-2 shrink-0">
                       <span className="flex items-center gap-2"><ImageIcon size={14} className="text-indigo-600" /> {isText4IsolatedMode && activeText4IsolatedConversionSource === 'uploaded-test' ? 'Uploaded Test Image' : 'AI Architect Image'}</span>
                       {isText4IsolatedMode && activeText4IsolatedConversionSource === 'uploaded-test' && (
                         <button
                           onClick={() => setStep('text4d-image-test')}
                           className="text-[10px] font-bold normal-case tracking-normal text-indigo-600 hover:text-indigo-800"
                         >
                           Replace
                         </button>
                       )}
                    </div>
                    <div className="flex-1 p-2 overflow-hidden bg-slate-50/50">
                      <img src={generatedData?.sourceImageBase64 || selectedImage || ''} alt="AI Generated Architecture" className="w-full h-full object-contain rounded-xl border border-slate-200/60 bg-white shadow-sm" />
                    </div>
                  </div>
                )}
                <div ref={previewCanvasHostRef} className="flex-1 min-h-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden relative">
                  {isAutoScanFlashMode && !text4hComparisonResults && (
                    <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-lg border border-blue-200 bg-white/95 px-3 py-2 text-xs font-black uppercase tracking-wider text-blue-700 shadow-sm">
                      Digitized Floorplan
                    </div>
                  )}
                  {generatedData?.extractionDiagnostics && !hasImageToJsonComparison && (
                    <button
                      type="button"
                      onClick={() => setShowImageToJsonLogs(current => !current)}
                      className={`absolute right-3 top-3 z-40 rounded-lg border px-3 py-2 text-[11px] font-bold shadow-sm transition-colors ${showImageToJsonLogs ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700'}`}
                    >
                      Logs
                    </button>
                  )}
                  {externalImport?.isBimAsset && externalImport?.bimMetadata?.previewUrl && (
                    <div className="absolute top-4 left-4 bg-white/90 backdrop-blur border border-slate-200 rounded-2xl p-3 shadow-lg z-10 flex flex-col gap-2 animate-in slide-in-from-left-4 duration-300">
                      <span className="text-[9px] font-extrabold text-indigo-650 uppercase tracking-widest block">Family Visual Preview</span>
                      <img 
                        src={externalImport.bimMetadata.previewUrl} 
                        alt="BIM Family Preview" 
                        className="w-32 h-32 object-contain rounded-xl border border-slate-100 bg-white shadow-sm" 
                      />
                    </div>
                  )}
                {(isText4gMode || isText4hMode || isText4jMode) && (isText4jMode ? text4jComparisonResults : isText4hMode ? text4hComparisonResults : text4gComparisonResults) && !externalImport ? (
                  <div className="absolute inset-0 flex flex-col gap-3 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3 shrink-0">
                      <div>
                        <div className="text-[11px] font-black uppercase tracking-wider text-slate-800">{isAutoScanFlashMode ? 'Digitized Floorplans' : isAutoPlanGenerationMode ? 'Generated Floorplans' : isText4jMode ? 'Text 4.0 J Hybrid Geometry' : isText4hMode ? 'AutoPlan JSON Comparison' : 'Text 4.0 G JSON Comparison'}</div>
                        <div className="text-[11px] font-semibold text-slate-500">{isAutoScanFlashMode ? 'Compare the direct upload conversion with the app-standardized conversion. Select either result to import.' : isAutoPlanGenerationMode ? 'Choose between two locally digitized variants of the confirmed floorplan brief.' : isText4jMode ? 'Structured3D candidate geometry is shown in the middle; the locally scaled, cleaned hybrid JSON on the right is the import payload.' : 'Gemini Master JSON and Local Fallback JSON are shown side by side. Click a pane to choose the import payload.'}</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {generatedData?.extractionDiagnostics && (
                          <button
                            type="button"
                            onClick={() => setShowImageToJsonLogs(current => !current)}
                            className={`rounded-lg border px-3 py-2 text-[11px] font-bold transition-colors ${showImageToJsonLogs ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:text-blue-700'}`}
                          >
                            Logs
                          </button>
                        )}
                        {!isAutoScanFlashMode && !isAutoPlanGenerationMode && !isText4jMode && <button
                          type="button"
                          onClick={downloadAllText4gTestData}
                          className="shrink-0 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-black text-indigo-700 shadow-sm hover:bg-indigo-50 flex items-center gap-2"
                        >
                          <Download size={15} /> Download All Test Data
                        </button>}
                      </div>
                    </div>
                    {showImageToJsonLogs && isText4jMode && generatedData?.extractionDiagnostics && generatedData.extractionDiagnostics.warnings.length > 0 && (
                      <div className={`flex max-h-16 shrink-0 items-start gap-2 overflow-y-auto border px-3 py-2 text-[11px] ${generatedData.extractionDiagnostics.canImport === false ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        <div>
                          <span className="font-black uppercase">Extraction {generatedData.extractionDiagnostics.confidence}: </span>
                          {generatedData.extractionDiagnostics.warnings.slice(0, 2).join(' ')}
                        </div>
                      </div>
                    )}
                    <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
                      {isAutoScanFlashMode ? renderText4gComparisonPreview('local') : renderText4gComparisonPreview('master')}
                      {isAutoScanFlashMode ? renderText4gComparisonPreview('master') : renderText4gComparisonPreview('local')}
                    </div>
                  </div>
                ) : (
                  <Canvas
                    project={previewProject}
                    editorState={previewEditorState}
                    activeLevelId={previewActiveLevelId}
                    onElementsChange={(elements) => {
                      const unscaled = scaleArchElements(elements, 1 / scaleFactor);
                      setBaseElements(unscaled);
                    }}
                    onElementsCommit={(elements) => {
                      const unscaled = scaleArchElements(elements, 1 / scaleFactor);
                      setBaseElements(unscaled);
                    }}
                    onSelectionChange={() => {}}
                    onTransformChange={(offset, zoom) => {
                      setZoom(zoom);
                      setOffset(offset);
                    }}
                    setEditorState={(valOrFunc) => {
                      if (typeof valOrFunc === 'function') {
                        const next = valOrFunc(previewEditorState);
                        if (next.zoom !== undefined) setZoom(next.zoom);
                        if (next.offset !== undefined) setOffset(next.offset);
                      } else if (valOrFunc) {
                        if (valOrFunc.zoom !== undefined) setZoom(valOrFunc.zoom);
                        if (valOrFunc.offset !== undefined) setOffset(valOrFunc.offset);
                      }
                    }}
                    activeProceduralConfig={null}
                  />
                )}

                {showImageToJsonLogs && !isText4jMode && !externalImport && generatedData?.extractionDiagnostics && generatedData.extractionDiagnostics.warnings.length > 0 && (
                  <div className={`absolute left-4 bottom-4 z-30 w-[min(430px,calc(100%-2rem))] rounded-xl border p-3 shadow-lg backdrop-blur pointer-events-auto ${generatedData.extractionDiagnostics.processing ? 'bg-blue-50/95 border-blue-200' : generatedData.extractionDiagnostics.canImport === false ? 'bg-red-50/95 border-red-200' : 'bg-amber-50/95 border-amber-200'}`}>
                    <div className="flex items-start gap-2">
                      {generatedData.extractionDiagnostics.processing
                        ? <Loader2 size={16} className="text-blue-600 mt-0.5 shrink-0 animate-spin" />
                        : <AlertTriangle size={16} className={generatedData.extractionDiagnostics.canImport === false ? 'text-red-600 mt-0.5 shrink-0' : 'text-amber-600 mt-0.5 shrink-0'} />}
                      <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-wider text-slate-800">
                          Extraction confidence: {generatedData.extractionDiagnostics.confidence} {'\u00b7'} Scale: {generatedData.extractionDiagnostics.scaleSource.replace('-', ' ')}
                        </div>
                        {generatedData.extractionDiagnostics.metrics && (
                          <div className="mt-0.5 text-[10px] font-semibold text-slate-600">
                            Walls {generatedData.extractionDiagnostics.metrics.wallCount}
                            {' \u00b7 '}Spaces {generatedData.extractionDiagnostics.metrics.enclosedSpaceCount}
                            {' \u00b7 '}Openings {generatedData.extractionDiagnostics.metrics.detectedDoorCount + generatedData.extractionDiagnostics.metrics.detectedWindowCount + generatedData.extractionDiagnostics.metrics.detectedOpeningCount}
                            {generatedData.extractionDiagnostics.ocr ? ` \u00b7 OCR ${generatedData.extractionDiagnostics.ocr.status}` : ''}
                          </div>
                        )}
                        {generatedData.extractionDiagnostics.warnings.slice(0, 2).map((warning, index) => (
                          <div key={`${warning}-${index}`} className="mt-1 text-[11px] leading-snug text-slate-700">{warning}</div>
                        ))}
                        {generatedData.extractionDiagnostics.canImport === false && !generatedData.extractionDiagnostics.processing && (
                          <div className="mt-1.5 text-[11px] font-bold text-red-700">{isAutoScanFlashMode || isAutoPlanGenerationMode ? 'Review these extraction warnings before importing the selected floorplan.' : 'Regenerate with clearer dimensions before importing.'}</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {externalImport?.isBimImport && (
                  <div className="absolute left-4 bottom-4 z-20 w-[min(520px,calc(100%-2rem))] bg-white/95 backdrop-blur border border-slate-200 rounded-xl shadow-lg p-3 pointer-events-auto">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div>
                        <div className="text-[10px] font-black uppercase tracking-wider text-cyan-700">BIM Preview State</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {previewProject.levels.length} levels . {externalImport.elements.length} preview objects
                        </div>
                      </div>
                      <div className={`px-2 py-1 rounded-md text-[10px] font-black ${externalImport.canConvert === false ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
                        {externalImport.canConvert === false ? 'Needs IFC elements' : 'Ready'}
                      </div>
                    </div>
                    {externalImport.logs?.slice(0, 3).map((item, index) => (
                      <div key={`${item.code}-${index}`} className="text-[11px] text-slate-600 leading-relaxed">
                        <span className="font-bold">{item.code}</span>: {item.message}
                      </div>
                    ))}
                  </div>
                )}

                {/* Metric/Imperial Unit Switch Button */}
                <div className="absolute top-4 right-4 z-20 flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200 shadow-sm pointer-events-auto">
                  <button 
                    onClick={() => onChangeUnitSystem?.('metric')} 
                    className={`px-3 py-1 text-xs font-bold rounded transition-all ${unitSystem === 'metric' ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Metric
                  </button>
                  <button 
                    onClick={() => onChangeUnitSystem?.('imperial')} 
                    className={`px-3 py-1 text-xs font-bold rounded transition-all ${unitSystem === 'imperial' ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    Imperial
                  </button>
                </div>

                {/* Dynamic Dimension Lines Overlay */}
                {hasValidBounds && !externalImport?.isBimImport && (
                  <svg className="absolute inset-0 pointer-events-none select-none z-10 w-full h-full">
                    {/* Horizontal Dimension Line */}
                    {/* Extension left */}
                    <line 
                      x1={screenBounds.left} 
                      y1={screenBounds.top} 
                      x2={screenBounds.left} 
                      y2={hLineY} 
                      stroke="#94a3b8" 
                      strokeWidth={1} 
                      strokeDasharray="3 3" 
                    />
                    {/* Extension right */}
                    <line 
                      x1={screenBounds.right} 
                      y1={screenBounds.top} 
                      x2={screenBounds.right} 
                      y2={hLineY} 
                      stroke="#94a3b8" 
                      strokeWidth={1} 
                      strokeDasharray="3 3" 
                    />
                    {/* Main line */}
                    <line 
                      x1={screenBounds.left} 
                      y1={hLineY} 
                      x2={screenBounds.right} 
                      y2={hLineY} 
                      stroke="#3b82f6" 
                      strokeWidth={1.5} 
                    />
                    {/* Slash left */}
                    <line 
                      x1={screenBounds.left - 4} 
                      y1={hLineY + 4} 
                      x2={screenBounds.left + 4} 
                      y2={hLineY - 4} 
                      stroke="#3b82f6" 
                      strokeWidth={2} 
                    />
                    {/* Slash right */}
                    <line 
                      x1={screenBounds.right - 4} 
                      y1={hLineY + 4} 
                      x2={screenBounds.right + 4} 
                      y2={hLineY - 4} 
                      stroke="#3b82f6" 
                      strokeWidth={2} 
                    />

                    {/* Vertical Dimension Line */}
                    {/* Extension top */}
                    <line 
                      x1={screenBounds.left} 
                      y1={screenBounds.top} 
                      x2={vLineX} 
                      y2={screenBounds.top} 
                      stroke="#94a3b8" 
                      strokeWidth={1} 
                      strokeDasharray="3 3" 
                    />
                    {/* Extension bottom */}
                    <line 
                      x1={screenBounds.left} 
                      y1={screenBounds.bottom} 
                      x2={vLineX} 
                      y2={screenBounds.bottom} 
                      stroke="#94a3b8" 
                      strokeWidth={1} 
                      strokeDasharray="3 3" 
                    />
                    {/* Main line */}
                    <line 
                      x1={vLineX} 
                      y1={screenBounds.top} 
                      x2={vLineX} 
                      y2={screenBounds.bottom} 
                      stroke="#3b82f6" 
                      strokeWidth={1.5} 
                    />
                    {/* Slash top */}
                    <line 
                      x1={vLineX - 4} 
                      y1={screenBounds.top + 4} 
                      x2={vLineX + 4} 
                      y2={screenBounds.top - 4} 
                      stroke="#3b82f6" 
                      strokeWidth={2} 
                    />
                    {/* Slash bottom */}
                    <line 
                      x1={vLineX - 4} 
                      y1={screenBounds.bottom + 4} 
                      x2={vLineX + 4} 
                      y2={screenBounds.bottom - 4} 
                      stroke="#3b82f6" 
                      strokeWidth={2} 
                    />
                  </svg>
                )}

                {/* Horizontal Dimension Input & Buttons (Centered over horizontal dimension line) */}
                {!externalImport?.isBimImport && <div 
                  className="absolute z-20 flex flex-col items-center pointer-events-auto transition-all"
                  style={{ 
                    left: `${hasValidBounds ? (screenBounds.left + screenBounds.right) / 2 : 400}px`, 
                    top: `${hLineY}px`,
                    transform: 'translate(-50%, -50%)'
                  }}
                >
                  <div className="text-[9px] font-bold text-blue-600 uppercase tracking-wider mb-0.5 bg-white border border-blue-200 px-1.5 py-0.5 rounded shadow-sm">
                    Horizontal Width
                  </div>
                  <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-md px-2 py-1 gap-1">
                    <button 
                      onClick={() => {
                        const inc = unitSystem === 'metric' ? 0.5 : 0.3048;
                        const nextW = Math.max(0.5, currentW - inc);
                        if (naturalBounds.w > 0) setScaleFactor(scaleForRequestedWidth(nextW));
                      }}
                      className="w-6 h-6 flex items-center justify-center hover:bg-slate-100 rounded text-slate-600 font-bold text-xs"
                      title="Decrease Width"
                    >
                      -
                    </button>
                    <input
                      type="text"
                      value={inputW}
                      onChange={(e) => setInputW(e.target.value)}
                      onBlur={() => {
                        const parsed = parseDimension(inputW, unitSystem);
                        if (parsed && parsed > 0 && naturalBounds.w > 0) {
                          setScaleFactor(scaleForRequestedWidth(parsed));
                        } else {
                          setInputW(formatDimension(currentW, unitSystem));
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-24 text-center font-mono text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button 
                      onClick={() => {
                        const inc = unitSystem === 'metric' ? 0.5 : 0.3048;
                        const nextW = currentW + inc;
                        if (naturalBounds.w > 0) setScaleFactor(scaleForRequestedWidth(nextW));
                      }}
                      className="w-6 h-6 flex items-center justify-center hover:bg-slate-100 rounded text-slate-600 font-bold text-xs"
                      title="Increase Width"
                    >
                      +
                    </button>
                  </div>
                </div>}

                {/* Vertical Dimension Input & Buttons (Centered over vertical dimension line) */}
                {!externalImport?.isBimImport && <div 
                  className="absolute z-20 flex flex-col items-center pointer-events-auto transition-all"
                  style={{ 
                    left: `${vLineX}px`, 
                    top: `${hasValidBounds ? (screenBounds.top + screenBounds.bottom) / 2 : 300}px`,
                    transform: 'translate(-50%, -50%)'
                  }}
                >
                  <div className="text-[9px] font-bold text-blue-600 uppercase tracking-wider mb-0.5 bg-white border border-blue-200 px-1.5 py-0.5 rounded shadow-sm">
                    Vertical Height
                  </div>
                  <div className="flex flex-col items-center bg-white border border-slate-200 rounded-lg shadow-md p-1.5 gap-1">
                    <button 
                      onClick={() => {
                        const inc = unitSystem === 'metric' ? 0.5 : 0.3048;
                        const nextH = currentH + inc;
                        if (naturalBounds.h > 0) setScaleFactor(scaleForRequestedHeight(nextH));
                      }}
                      className="w-6 h-6 flex items-center justify-center hover:bg-slate-100 rounded text-slate-600 font-bold text-xs"
                      title="Increase Height"
                    >
                      &#9650;
                    </button>
                    <input
                      type="text"
                      value={inputH}
                      onChange={(e) => setInputH(e.target.value)}
                      onBlur={() => {
                        const parsed = parseDimension(inputH, unitSystem);
                        if (parsed && parsed > 0 && naturalBounds.h > 0) {
                          setScaleFactor(scaleForRequestedHeight(parsed));
                        } else {
                          setInputH(formatDimension(currentH, unitSystem));
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-24 text-center font-mono text-xs font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button 
                      onClick={() => {
                        const inc = unitSystem === 'metric' ? 0.5 : 0.3048;
                        const nextH = Math.max(0.5, currentH - inc);
                        if (naturalBounds.h > 0) setScaleFactor(scaleForRequestedHeight(nextH));
                      }}
                      className="w-6 h-6 flex items-center justify-center hover:bg-slate-100 rounded text-slate-600 font-bold text-xs"
                      title="Decrease Height"
                    >
                      &#9660;
                    </button>
                  </div>
                </div>}
              </div>
            </div>
              
              {mode === 'tracer' && (
                  <div className="mt-4 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center gap-4">
                      <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider min-w-max">Tracer Controls</span>
                      <div className="flex-1 flex items-center gap-2">
                          <span className="text-xs text-slate-500">Overlap ({tracerOverlap}%)</span>
                          <input 
                            type="range" min="0" max="100" value={tracerOverlap} 
                            onChange={(e) => setTracerOverlap(parseInt(e.target.value))} 
                            className="flex-1 h-1 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-indigo-600" 
                          />
                      </div>
                      <div className="flex-1 flex items-center gap-2">
                          <span className="text-xs text-slate-500">Confidence ({tracerConfidence}%)</span>
                          <input 
                            type="range" min="0" max="100" value={tracerConfidence} 
                            onChange={(e) => setTracerConfidence(parseInt(e.target.value))} 
                            className="flex-1 h-1 bg-slate-300 rounded-lg appearance-none cursor-pointer accent-indigo-600" 
                          />
                      </div>
                  </div>
              )}

              <div className="mt-4 flex justify-between items-center">
                 {!isAutoScanFlashMode && <button onClick={() => isExternalImport ? setStep('input') : setStep('summary')} className={`px-4 py-2 text-slate-500 hover:text-slate-800 font-medium text-sm flex items-center gap-2 ${isExternalImport ? 'invisible' : ''}`}><RefreshCw size={16} /> Regenerate</button>}
                 
                 {isAutoScanFlashMode || externalImport?.isBimAsset || externalImport?.isBimImport ? (
                   <div className="flex-1" /> // empty space to keep alignment
                 ) : (
                   <button 
                      onClick={handleImportInterior}
                      disabled={isImportingInterior || isText4dDigitizationPending}
                      className="px-5 py-2.5 bg-indigo-100 text-indigo-700 font-bold rounded-xl hover:bg-indigo-200 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                   >
                      {isImportingInterior || isText4dDigitizationPending ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />} Import Interior
                   </button>
                 )}

                 <div className="flex gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors">Discard</button>
                    {externalImport?.isBimAsset ? (
                      <button 
                        onClick={() => {
                          if (onLoadBimToInventory && externalImport) {
                            onLoadBimToInventory({
                              name: externalImport.title,
                              width: currentW,
                              depth: currentH,
                              height: externalImport.bimMetadata?.height || 0.75,
                              category: externalImport.bimMetadata?.category,
                              customMeshData: externalImport.elements[0]?.customMeshData || undefined,
                              bimMetadata: externalImport.bimMetadata
                            });
                          }
                          onClose();
                        }} 
                        className="px-6 py-2.5 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-lg shadow-green-600 transition-all flex items-center gap-2"
                      >
                        <Check size={18} /> Load to Inventory
                      </button>
                    ) : (
                      <button
                        onClick={() => externalImport?.isBimImport ? handleApply() : isExternalImport ? setStep('import-options') : handleApply()}
                        disabled={(isText4dDigitizationPending && !hasSelectedSimplifiedFloorplan) || ((isAutoScanFlashMode || isAutoPlanGenerationMode) && previewElements.length === 0) || (externalImport?.isBimImport && externalImport.canConvert === false) || (!externalImport && generatedData?.extractionDiagnostics?.canImport === false && !hasSelectedSimplifiedFloorplan)}
                        className="px-6 py-2.5 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shadow-lg shadow-green-600 transition-all flex items-center gap-2"
                      >
                        {isText4dDigitizationPending && !hasSelectedSimplifiedFloorplan ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                        {isText4dDigitizationPending && !hasSelectedSimplifiedFloorplan
                          ? 'Finalizing OCR...'
                          : isAutoScanFlashMode
                            ? `Import ${selectedText4hComparison === 'local' ? 'Direct Conversion' : 'App-Generated Conversion'}`
                          : isAutoPlanGenerationMode
                            ? `Import Generated Floorplan - Variant ${selectedText4hComparison === 'master' ? '1' : '2'}`
                          : externalImport?.isBimImport
                            ? 'Convert to Interactive'
                            : isExternalImport
                              ? 'Next'
                              : isText4jMode && text4jComparisonResults
                                ? 'Import J Hybrid Final'
                              : isText4hMode && text4hComparisonResults
                                ? `Import ${selectedText4hComparison === 'master' ? 'Gemini Master' : 'Local Fallback'}`
                              : isText4gMode && text4gComparisonResults
                                ? `Import ${selectedText4gComparison === 'master' ? 'Gemini Master' : 'Local Fallback'}`
                                : 'Import'}
                      </button>
                    )}
                 </div>
              </div>
            </div>
          )}

          {step === 'import-options' && externalImport && (
            <div className="flex-1 flex flex-col p-8 animate-in slide-in-from-right-4 duration-300">
              <div className="max-w-3xl mx-auto w-full">
                <div className="mb-6">
                  <p className="text-xs font-black text-indigo-600 uppercase tracking-[0.2em]">Step 2</p>
                  <h3 className="text-2xl font-black text-slate-900 mt-1">Choose Import Method</h3>
                  <p className="text-sm text-slate-500 mt-2">
                    The DXF is scaled in Copilot. Choose whether to place it raw or run one of the existing converters before placement.
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 mb-5">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-black text-slate-900">{externalImport.fileName}</div>
                      <div className="text-xs text-slate-500 mt-1">
                        Current extents: {formatDimension(currentW, unitSystem)} x {formatDimension(currentH, unitSystem)}
                      </div>
                    </div>
                    {externalImport.stats && (
                      <div className="grid grid-cols-4 gap-3 text-center">
                        <div><div className="text-xs text-slate-500">Lines</div><div className="font-black text-slate-900">{externalImport.stats.lines ?? 0}</div></div>
                        <div><div className="text-xs text-slate-500">Arcs</div><div className="font-black text-slate-900">{externalImport.stats.arcs ?? 0}</div></div>
                        <div><div className="text-xs text-slate-500">Circles</div><div className="font-black text-slate-900">{externalImport.stats.circles ?? 0}</div></div>
                        <div><div className="text-xs text-slate-500">Layers</div><div className="font-black text-slate-900">{externalImport.stats.layers ?? 0}</div></div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[
                    { id: 'underlay' as ImportConversionMode, label: 'Raw CAD Underlay', desc: 'Place the imported DXF as editable CAD reference geometry.' },
                    { id: 'smart-2d' as ImportConversionMode, label: 'Smart Convert 2D', desc: 'Place imported CAD vectors directly as 2D canvas elements.' },
                    { id: 'smart-3d' as ImportConversionMode, label: 'Smart Convert 3D', desc: 'Run the existing deterministic wall-pair conversion before placement.' },
                    { id: 'ai-gemini' as ImportConversionMode, label: 'AI Floorplan Convert', desc: 'Run the existing Gemini DXF conversion before placement.' },
                  ].map(option => (
                    <button
                      key={option.id}
                      onClick={() => setImportConversionMode(option.id)}
                      className={`text-left rounded-2xl border p-4 transition-all ${importConversionMode === option.id ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-100' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                    >
                      <div className="text-sm font-black text-slate-900">{option.label}</div>
                      <div className="text-xs text-slate-500 leading-relaxed mt-1">{option.desc}</div>
                    </button>
                  ))}
                </div>

                <div className="mt-8 flex justify-end">
                  <div className="flex gap-3">
                    <button onClick={onClose} className="px-5 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors">Discard</button>
                    <button onClick={handleApply} className="px-6 py-2.5 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-lg shadow-green-600 transition-all flex items-center gap-2"><Check size={18} /> Import</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GenerativeWizard;
