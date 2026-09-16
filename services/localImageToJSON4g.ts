import type { Point } from '../types';
import type { GeneratedData } from '../components/generative-wizard/types';
import { recognizeFloorplanText4g, type FloorplanTextObservation } from './localFloorplanOcr4g';
import {
  analyzeText4gGeometryMode,
  detectText4gSparseAngularColumns,
  detectText4gSparseAngularRailings,
  detectText4gSparseAngularStairs,
  inspectText4gFreeformGap,
  recoverText4gFaintAngularWindowHosts,
  recoverText4gSupplementalAngularDoorHosts,
  type Text4gFreeformWallGap,
  type Text4gFreeformWallSegment,
  type Text4gGeometryMode,
  type Text4gPixelPoint,
} from './text4gGeometryModes';
import {
  consolidateText4gCurveArcs,
  text4gCurveArcSourceEnvelopeCoherentForTest,
  type Text4gNativeArcRun,
} from './text4gCurveArcs';
import {
  cleanupText4gAngularWalls,
  collapseText4gExteriorAngularChamfers,
} from './text4gAngularCleanup';

type Axis = 'horizontal' | 'vertical';

export interface LocalImageExtractionOptions {
  /** Used when no explicit requested boundary is available. */
  targetSizeMeters?: number;
  /** The requested design boundary. By default, the traced plan is fitted inside it without distortion. */
  requestedBoundary?: Point[];
  /** Optional outer-face horizontal extent when only one property axis is known. */
  requestedWidthMeters?: number;
  /** Optional outer-face vertical extent when only one property axis is known. */
  requestedDepthMeters?: number;
  /** Text 4.0 G uses its confirmed width and depth as independent, authoritative axes. */
  enforceRequestedEnvelope?: boolean;
  /** Resolved editor thickness used to align requested dimensions to exterior wall faces, not wall axes. */
  exteriorWallThicknessMeters?: number;
  /** Used only to name spaces which were actually found in the raster. */
  designSummary?: string;
  /** Maximum browser-side working resolution. */
  maxImageDimension?: number;
  /** Injected by the browser-local OCR layer; exposed for deterministic tests. */
  textObservations?: FloorplanTextObservation[];
  /** Disable OCR for diagnostics or low-resource clients. */
  disableOcr?: boolean;
  /** Maximum post-image wait for browser-local OCR. Raster extraction continues when exceeded. */
  ocrTimeBudgetMs?: number;
  /** Wait for the OCR worker to finish instead of using the short preview budget. */
  awaitOcrCompletion?: boolean;
  /** Receives raster-only geometry before OCR so the UI can render an early, locked preview. */
  onGeometryReady?: (geometry: GeneratedData) => void;
  /** Internal audit state supplied by the browser wrapper. */
  ocrStatus?: 'processing' | 'disabled' | 'completed' | 'unavailable' | 'provided' | 'timed-out';
  /** Internal timing supplied by the browser wrapper. */
  ocrDurationMs?: number;
}

export interface RasterImageData {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

interface PixelSegment {
  axis: Axis;
  line: number;
  start: number;
  end: number;
  thickness: number;
}

interface PixelGap {
  axis: Axis;
  line: number;
  start: number;
  end: number;
  thickness: number;
  /** Strong arc-plus-near-closed-leaf evidence recovered across continuous wall ink. */
  closedSwingEvidence?: DoorSwingEvidence;
  /** Raster jamb-to-jamb blank or OCR/topology-proven open-plan passage. */
  openPassageEvidence?: true;
  /** Raster-evidenced fallback used only when the opening's host wall was discarded. */
  missingHostFallback?: 'sliding' | 'window';
  /** A strict staggered two-panel symbol, retained across overlapping fallback gaps. */
  explicitSlidingEvidence?: true;
  /** Strict leaf-plus-arc evidence recovered only at a long wall endpoint. */
  validatedEndpointSwingEvidence?: DoorSwingEvidence;
  /** Strict leaf-plus-arc evidence sampled at the physical wall face. */
  physicalWallFaceSwingEvidence?: true;
  /** Along-host coordinate of the explicit leaf that validated wall-face recovery. */
  physicalWallFaceLeafLine?: number;
  /** This recovery was measured to a structural jamb centreline and may be face-clamped. */
  jambFaceClampEvidence?: true;
  /** Final recovered geometry is already bounded by observed physical jamb faces. */
  jambFaceBoundedEvidence?: true;
}

interface PixelBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface SpaceRegion {
  id: number;
  areaPixels: number;
  areaMeters: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  x: number;
  y: number;
}

interface FloodResult {
  outside: Uint8Array;
  labels: Int32Array;
  /** Every enclosed raster region, including small rooms which need OCR confirmation. */
  regions: SpaceRegion[];
  spaces: SpaceRegion[];
}

interface RoomTextTag {
  label: string;
  x: number;
  y: number;
  confidence: number;
  sourceWidth?: number;
  sourceDepth?: number;
}

interface PixelPoint {
  x: number;
  y: number;
}

interface Text4gHostedAperture {
  pos: number[];
  rotation?: number;
  width?: number;
  measuredWidth?: number;
  evidence?: { confidence?: number };
}

/**
 * Returns true only when two hosted inserts occupy the same oriented clear
 * span in plan. This is intentionally independent of raster classification:
 * it is used after door/window/opening evidence has already been resolved.
 */
export const text4gHostedAperturesOverlap = (
  first: Text4gHostedAperture,
  second: Text4gHostedAperture,
) => {
  const firstWidth = first.measuredWidth || first.width || 0;
  const secondWidth = second.measuredWidth || second.width || 0;
  if (firstWidth <= 0 || secondWidth <= 0) return false;
  const firstRotation = first.rotation || 0;
  const secondRotation = second.rotation || 0;
  const rawRotationDelta = Math.abs(firstRotation - secondRotation) % 180;
  if (Math.min(rawRotationDelta, 180 - rawRotationDelta) > 12) return false;

  const radians = firstRotation * Math.PI / 180;
  const tangentX = Math.cos(radians), tangentY = Math.sin(radians);
  const deltaX = second.pos[0] - first.pos[0], deltaY = second.pos[1] - first.pos[1];
  const alongDistance = Math.abs(deltaX * tangentX + deltaY * tangentY);
  const normalDistance = Math.abs(-deltaX * tangentY + deltaY * tangentX);
  const sameHostTolerance = Math.max(0.08, Math.min(0.16, Math.min(firstWidth, secondWidth) * 0.16));
  const overlap = (firstWidth + secondWidth) / 2 - alongDistance;
  return normalDistance <= sameHostTolerance && overlap > 0.01;
};

export const arbitrateText4gHostedOpenings = <T extends Text4gHostedAperture>(
  doors: Text4gHostedAperture[],
  openings: T[],
) => {
  const ranked = openings
    .filter(opening => !doors.some(door => text4gHostedAperturesOverlap(door, opening)))
    .sort((first, second) => (second.evidence?.confidence || 0) - (first.evidence?.confidence || 0));
  return ranked.filter((opening, index) => !ranked.slice(0, index).some(retained =>
    text4gHostedAperturesOverlap(retained, opening)));
};

interface Text4gOpeningHostWall {
  p1: number[];
  p2: number[];
  wallSource?: string;
  isCurved?: boolean;
  controlPoint?: number[];
  arcCenter?: number[];
  arcRadius?: number;
  arcStartAngle?: number;
  arcEndAngle?: number;
  arcCounterclockwise?: boolean;
  ellipseCenter?: number[];
  ellipseRadiusX?: number;
  ellipseRadiusY?: number;
  ellipseRotation?: number;
  ellipseStartAngle?: number;
  ellipseEndAngle?: number;
  ellipseCounterclockwise?: boolean;
}

const text4gHostWallPoint = (wall: Text4gOpeningHostWall, progress: number) => {
  const t = clamp(progress, 0, 1);
  const directedAngle = (start: number, end: number, counterclockwise = false) => {
    let span = counterclockwise ? start - end : end - start;
    while (span < 0) span += Math.PI * 2;
    while (span >= Math.PI * 2) span -= Math.PI * 2;
    return counterclockwise ? start - span * t : start + span * t;
  };
  if (wall.wallSource === 'ellipse' && wall.ellipseCenter
    && wall.ellipseRadiusX !== undefined && wall.ellipseRadiusY !== undefined) {
    const angle = directedAngle(
      wall.ellipseStartAngle ?? 0,
      wall.ellipseEndAngle ?? Math.PI * 2,
      wall.ellipseCounterclockwise,
    );
    const rotation = wall.ellipseRotation || 0;
    const x = Math.cos(angle) * wall.ellipseRadiusX;
    const y = Math.sin(angle) * wall.ellipseRadiusY;
    return [
      wall.ellipseCenter[0] + x * Math.cos(rotation) - y * Math.sin(rotation),
      wall.ellipseCenter[1] + x * Math.sin(rotation) + y * Math.cos(rotation),
    ];
  }
  if ((wall.wallSource === 'arc' || wall.isCurved) && wall.arcCenter
    && wall.arcRadius !== undefined && wall.arcStartAngle !== undefined && wall.arcEndAngle !== undefined) {
    const angle = directedAngle(wall.arcStartAngle, wall.arcEndAngle, wall.arcCounterclockwise);
    return [
      wall.arcCenter[0] + Math.cos(angle) * wall.arcRadius,
      wall.arcCenter[1] + Math.sin(angle) * wall.arcRadius,
    ];
  }
  if ((wall.wallSource === 'arc' || wall.isCurved) && wall.controlPoint) {
    const mt = 1 - t;
    return [
      mt * mt * wall.p1[0] + 2 * mt * t * wall.controlPoint[0] + t * t * wall.p2[0],
      mt * mt * wall.p1[1] + 2 * mt * t * wall.controlPoint[1] + t * t * wall.p2[1],
    ];
  }
  return [
    wall.p1[0] + (wall.p2[0] - wall.p1[0]) * t,
    wall.p1[1] + (wall.p2[1] - wall.p1[1]) * t,
  ];
};

export const text4gOpeningHasHost = (
  opening: Pick<Text4gHostedAperture, 'pos'>,
  walls: Text4gOpeningHostWall[],
  tolerance = 0.22,
) => walls.some(wall => {
  const curved = wall.wallSource === 'arc' || wall.wallSource === 'ellipse' || wall.isCurved;
  const sampleCount = curved ? 96 : 1;
  let previous = text4gHostWallPoint(wall, 0);
  for (let index = 1; index <= sampleCount; index++) {
    const current = text4gHostWallPoint(wall, index / sampleCount);
    const dx = current[0] - previous[0], dy = current[1] - previous[1];
    const lengthSquared = dx * dx + dy * dy;
    const progress = lengthSquared
      ? clamp(((opening.pos[0] - previous[0]) * dx + (opening.pos[1] - previous[1]) * dy) / lengthSquared, 0, 1)
      : 0;
    const x = previous[0] + dx * progress, y = previous[1] + dy * progress;
    if (Math.hypot(opening.pos[0] - x, opening.pos[1] - y) <= tolerance) return true;
    previous = current;
  }
  return false;
});

interface PixelEdge {
  a: PixelPoint;
  b: PixelPoint;
  used: boolean;
}

const DEFAULT_TARGET_SIZE_METERS = 20;
const DEFAULT_MAX_IMAGE_DIMENSION = 1200;
const DEFAULT_EXTERIOR_WALL_THICKNESS_METERS = 0.23;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const pointKey = (point: PixelPoint) => `${point.x},${point.y}`;

const getBoundaryBounds = (boundary?: Point[]) => {
  if (!boundary?.length) return undefined;
  const xs = boundary.map(point => point.x).filter(Number.isFinite);
  const ys = boundary.map(point => point.y).filter(Number.isFinite);
  if (!xs.length || !ys.length) return undefined;
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  if (maxX - minX <= 0 || maxY - minY <= 0) return undefined;
  return { minX, maxX, minY, maxY };
};

const normalizeOptions = (
  optionsOrTargetSize: number | LocalImageExtractionOptions,
): LocalImageExtractionOptions => typeof optionsOrTargetSize === 'number'
  ? { targetSizeMeters: optionsOrTargetSize }
  : optionsOrTargetSize;

/**
 * Convert a generated floor-plan raster into native floor-plan JSON without a
 * second model call. The browser wrapper deliberately delegates all geometry
 * work to extractGeometryFromImageData so the rule engine remains testable.
 */
export const extractGeometryFromLocalImage = async (
  base64Fata: string,
  optionsOrTargetSize: number | LocalImageExtractionOptions = {},
): Promise<GeneratedData> => {
  const options = normalizeOptions(optionsOrTargetSize);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = async () => {
      try {
        const maxDimension = Math.max(320, options.maxImageDimension || DEFAULT_MAX_IMAGE_DIMENSION);
        const resizeRatio = Math.min(1, maxDimension / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
        const width = Math.max(1, Math.round((image.naturalWidth || image.width) * resizeRatio));
        const height = Math.max(1, Math.round((image.naturalHeight || image.height) * resizeRatio));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('The browser could not create a 2D canvas for floor-plan extraction.');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        const imageData = context.getImageData(0, 0, width, height);
        let textObservations = options.textObservations;
        let ocrStatus: NonNullable<LocalImageExtractionOptions['ocrStatus']> = options.ocrStatus
          || (options.disableOcr ? 'disabled' : textObservations ? 'provided' : 'unavailable');
        let ocrDurationMs = options.ocrDurationMs;
        if (!textObservations && !options.disableOcr) {
          const ocrStartedAt = performance.now();
          // Start OCR first so its worker can run while the synchronous raster
          // pass prepares the early architectural preview.
          const ocrTask = recognizeFloorplanText4g(canvas);
          if (options.onGeometryReady) {
            try {
              const provisional = extractGeometryFromImageData(imageData, {
                ...options,
                designSummary: undefined,
                disableOcr: true,
                onGeometryReady: undefined,
                ocrStatus: 'processing',
              });
              provisional.rooms = (provisional.rooms || []).map((room, index) => ({
                ...room,
                label: `Space ${String(index + 1).padStart(2, '0')}`,
                provenance: 'observed',
                evidence: {
                  source: 'raster',
                  confidence: room.evidence?.confidence ?? 0.6,
                  notes: ['Temporary enclosure label; local OCR is still processing.'],
                },
              }));
              if (provisional.extractionDiagnostics) {
                provisional.extractionDiagnostics.processing = true;
                provisional.extractionDiagnostics.canImport = false;
                provisional.extractionDiagnostics.warnings = [
                  'Architectural geometry is ready. OCR and final digitization are still processing; Import will unlock when they finish.',
                ];
                provisional.extractionDiagnostics.detectedRoomLabels = 0;
                provisional.extractionDiagnostics.ocr = {
                  status: 'processing',
                  observationCount: 0,
                };
              }
              options.onGeometryReady(provisional);
            } catch (error) {
              console.warn('[Text 4.0 G] Early raster preview was unavailable; continuing to final digitization.', error);
            }
          }
          try {
            const budgetMs = Math.max(100, options.ocrTimeBudgetMs ?? 1200);
            const timeout = Symbol('ocr-timeout');
            const result = options.awaitOcrCompletion
              ? await ocrTask
              : await Promise.race([
                  ocrTask,
                  new Promise<typeof timeout>(resolveTimeout => setTimeout(() => resolveTimeout(timeout), budgetMs)),
                ]);
            ocrDurationMs = performance.now() - ocrStartedAt;
            if (result === timeout) {
              console.warn(`[Text 4.0 G] Local OCR exceeded its ${budgetMs}ms budget; continuing with raster and design-brief signals.`);
              textObservations = [];
              ocrStatus = 'timed-out';
            } else {
              textObservations = result;
              ocrStatus = 'completed';
            }
          } catch (error) {
            ocrDurationMs = performance.now() - ocrStartedAt;
            console.warn('[Text 4.0 G] Local OCR was unavailable; continuing with raster and design-brief signals.', error);
            textObservations = [];
            ocrStatus = 'unavailable';
          }
        }
        resolve(extractGeometryFromImageData(imageData, {
          ...options,
          textObservations,
          ocrStatus,
          ocrDurationMs,
        }));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error('The generated floor-plan image could not be decoded.'));
    image.src = base64Fata.startsWith('data:image') ? base64Fata : `data:image/png;base64,${base64Fata}`;
  });
};

const otsuThreshold = (histogram: Uint32Array, total: number) => {
  let weightedTotal = 0;
  for (let value = 0; value < 256; value++) weightedTotal += value * histogram[value];
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let bestThreshold = 128;
  for (let value = 0; value < 256; value++) {
    backgroundWeight += histogram[value];
    if (!backgroundWeight) continue;
    const foregroundWeight = total - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundSum += value * histogram[value];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (weightedTotal - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      bestThreshold = value;
    }
  }
  return clamp(bestThreshold + 8, 80, 205);
};

const createDarkMask = (image: RasterImageData) => {
  const pixelCount = image.width * image.height;
  if (image.data.length < pixelCount * 4) throw new Error('Invalid RGBA image data supplied to floor-plan extraction.');
  const grayscale = new Uint8Array(pixelCount);
  const histogram = new Uint32Array(256);
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const offset = pixel * 4;
    const alpha = image.data[offset + 3] / 255;
    const luminance = 0.2126 * image.data[offset] + 0.7152 * image.data[offset + 1] + 0.0722 * image.data[offset + 2];
    const composited = Math.round(255 - alpha * (255 - luminance));
    grayscale[pixel] = composited;
    histogram[composited]++;
  }
  const threshold = otsuThreshold(histogram, pixelCount);
  const mask = new Uint8Array(pixelCount);
  for (let pixel = 0; pixel < pixelCount; pixel++) mask[pixel] = grayscale[pixel] <= threshold ? 1 : 0;
  return mask;
};

/**
 * Door leaves and swing arcs are commonly printed in a lighter drafting pen
 * than walls. Keep that weak ink out of structural tracing, but make it
 * available to the E-only door classifier for leaf-plus-arc confirmation.
 */
const createDoorEvidenceMask = (image: RasterImageData) => {
  const pixelCount = image.width * image.height;
  if (image.data.length < pixelCount * 4) throw new Error('Invalid RGBA image data supplied to floor-plan extraction.');
  const mask = new Uint8Array(pixelCount);
  for (let pixel = 0; pixel < pixelCount; pixel++) {
    const offset = pixel * 4;
    const alpha = image.data[offset + 3] / 255;
    const luminance = 0.2126 * image.data[offset] + 0.7152 * image.data[offset + 1] + 0.0722 * image.data[offset + 2];
    const composited = Math.round(255 - alpha * (255 - luminance));
    mask[pixel] = composited <= 210 ? 1 : 0;
  }
  return mask;
};

// Some presentation plans draw an exterior railing in a mid-gray pen. Keep
// this tonal evidence separate from black structural ink so it cannot become
// a wall. The sparse-hybrid caller is the only consumer.
const createCoolGrayRailingMask = (image: RasterImageData) => {
  const mask = new Uint8Array(image.width * image.height);
  for (let pixel = 0; pixel < mask.length; pixel++) {
    const offset = pixel * 4;
    const red = image.data[offset], green = image.data[offset + 1], blue = image.data[offset + 2];
    const alpha = image.data[offset + 3] / 255;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    mask[pixel] = alpha >= 0.75 && luminance >= 25 && luminance <= 165 ? 1 : 0;
  }
  return mask;
};

const isArchitecturalTextObservation = (observation: FloorplanTextObservation) => {
  const text = observation.text.trim();
  return observation.confidence >= 45 && (
    /\b(bed|bedroom|master|primary|guest|living|lounge|dining|kitchen|bath|toilet|powder|wc|ensuite|closet|wardrobe|utility|laundry|balcon(?:y)?|terrace|foyer|entry|hall|corridor|office|study|store|pantry|garage|parking|lobby|reception|family|staff|maid|courtyard)\b/i.test(text)
    || /(?:\d+(?:\.\d+)?\s*(?:m|mm|cm|ft|feet|foot|')|\d+\s*(?:'|\u2032)\s*-?\s*\d*\s*(?:"|\u2033|in)?)/i.test(text)
  );
};

const removeRecognizedTextFromMask = (
  source: Uint8Array,
  width: number,
  height: number,
  observations: FloorplanTextObservation[],
) => {
  if (!observations.length) return source;
  const mask = source.slice();
  for (const observation of observations) {
    if (!isArchitecturalTextObservation(observation)) continue;
    const padding = Math.max(1, Math.round(Math.min(
      observation.bbox.x1 - observation.bbox.x0,
      observation.bbox.y1 - observation.bbox.y0,
    ) * 0.05));
    const x0 = clamp(Math.floor(observation.bbox.x0) - padding, 0, width - 1);
    const x1 = clamp(Math.ceil(observation.bbox.x1) + padding, 0, width - 1);
    const y0 = clamp(Math.floor(observation.bbox.y0) - padding, 0, height - 1);
    const y1 = clamp(Math.ceil(observation.bbox.y1) + padding, 0, height - 1);
    const boxWidth = Math.max(1, x1 - x0 + 1);
    const boxHeight = Math.max(1, y1 - y0 + 1);
    if (boxWidth > width * 0.5 || boxHeight > height * 0.14) continue;
    let crossesStructuralStroke = false;
    for (let y = y0; y <= y1 && !crossesStructuralStroke; y++) {
      let ink = 0;
      for (let x = x0; x <= x1; x++) ink += source[y * width + x];
      if (ink / boxWidth >= 0.72) crossesStructuralStroke = true;
    }
    for (let x = x0; x <= x1 && !crossesStructuralStroke; x++) {
      let ink = 0;
      for (let y = y0; y <= y1; y++) ink += source[y * width + x];
      if (ink / boxHeight >= 0.8) crossesStructuralStroke = true;
    }
    if (crossesStructuralStroke) continue;
    for (let y = y0; y <= y1; y++) mask.fill(0, y * width + x0, y * width + x1 + 1);
  }
  return mask;
};

interface Run {
  line: number;
  start: number;
  end: number;
}

interface BandBuilder {
  minLine: number;
  maxLine: number;
  lastLine: number;
  starts: number[];
  ends: number[];
  ink: number;
}

const extractDirectionalBands = (
  mask: Uint8Array,
  width: number,
  height: number,
  axis: Axis,
  minimumRun: number,
  minimumThickness = 2,
  allowCompactStub = false,
): PixelSegment[] => {
  const lineCount = axis === 'horizontal' ? height : width;
  const lineLength = axis === 'horizontal' ? width : height;
  const runsByLine: Run[][] = Array.from({ length: lineCount }, () => []);
  for (let line = 0; line < lineCount; line++) {
    let cursor = 0;
    while (cursor < lineLength) {
      const index = axis === 'horizontal' ? line * width + cursor : cursor * width + line;
      if (!mask[index]) {
        cursor++;
        continue;
      }
      const start = cursor;
      while (cursor + 1 < lineLength) {
        const nextIndex = axis === 'horizontal' ? line * width + cursor + 1 : (cursor + 1) * width + line;
        if (!mask[nextIndex]) break;
        cursor++;
      }
      const end = cursor;
      if (end - start + 1 >= minimumRun) runsByLine[line].push({ line, start, end });
      cursor++;
    }
  }

  const builders: BandBuilder[] = [];
  for (let line = 0; line < lineCount; line++) {
    const claimed = new Set<BandBuilder>();
    for (const run of runsByLine[line]) {
      const runLength = run.end - run.start + 1;
      let best: BandBuilder | undefined;
      let bestOverlap = -1;
      for (const builder of builders) {
        if (claimed.has(builder) || line - builder.lastLine > 1) continue;
        const representativeStart = median(builder.starts);
        const representativeEnd = median(builder.ends);
        const overlap = Math.min(run.end, representativeEnd) - Math.max(run.start, representativeStart) + 1;
        const referenceLength = representativeEnd - representativeStart + 1;
        const comparableLength = Math.min(runLength, referenceLength) / Math.max(1, Math.max(runLength, referenceLength)) >= 0.35;
        if (!comparableLength) continue;
        if (overlap < Math.min(runLength, referenceLength) * 0.55 || overlap <= bestOverlap) continue;
        best = builder;
        bestOverlap = overlap;
      }
      if (!best) {
        best = { minLine: line, maxLine: line, lastLine: line, starts: [], ends: [], ink: 0 };
        builders.push(best);
      }
      best.minLine = Math.min(best.minLine, line);
      best.maxLine = Math.max(best.maxLine, line);
      best.lastLine = line;
      best.starts.push(run.start);
      best.ends.push(run.end);
      best.ink += runLength;
      claimed.add(best);
    }
  }

  const maximumBandThickness = Math.max(8, Math.round(Math.min(width, height) * 0.08));
  return builders.flatMap(builder => {
    const thickness = builder.maxLine - builder.minLine + 1;
    const start = median(builder.starts);
    const end = median(builder.ends);
    const length = end - start + 1;
    const solidity = builder.ink / Math.max(1, thickness * length);
    if (length < minimumRun || (!allowCompactStub && length < thickness * 2.5) || thickness > maximumBandThickness) return [];
    // A one-pixel stroke is normally text, furniture, a dimension line, or a
    // door-swing symbol. Keep it as opening evidence, but never promote it to
    // a structural wall.
    if (thickness < minimumThickness || solidity < 0.48) return [];
    return [{
      axis,
      line: (builder.minLine + builder.maxLine) / 2,
      start,
      end,
      thickness,
    }];
  });
};

const segmentBounds = (segments: PixelSegment[]): PixelBounds => ({
  minX: Math.min(...segments.map(segment => segment.axis === 'horizontal' ? segment.start : segment.line)),
  maxX: Math.max(...segments.map(segment => segment.axis === 'horizontal' ? segment.end : segment.line)),
  minY: Math.min(...segments.map(segment => segment.axis === 'horizontal' ? segment.line : segment.start)),
  maxY: Math.max(...segments.map(segment => segment.axis === 'horizontal' ? segment.line : segment.end)),
});

const generatedWallFaceBounds = (
  walls: NonNullable<GeneratedData['walls']>,
  exteriorWallThicknessMeters: number,
): PixelBounds | undefined => {
  const exteriorWalls = walls.filter(wall => /exterior|outer/i.test(wall.type || ''));
  const candidates = exteriorWalls.length ? exteriorWalls : walls;
  if (!candidates.length) return undefined;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  candidates.forEach(wall => {
    const [x1, y1] = wall.p1;
    const [x2, y2] = wall.p2;
    const length = Math.hypot(x2 - x1, y2 - y1);
    if (!Number.isFinite(length) || length <= 0) return;
    const halfThickness = (/exterior|outer/i.test(wall.type || '') ? exteriorWallThicknessMeters : 0.115) / 2;
    const offsetX = -(y2 - y1) / length * halfThickness;
    const offsetY = (x2 - x1) / length * halfThickness;
    for (const [x, y] of [
      [x1 + offsetX, y1 + offsetY],
      [x1 - offsetX, y1 - offsetY],
      [x2 + offsetX, y2 + offsetY],
      [x2 - offsetX, y2 - offsetY],
    ]) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  });
  return Number.isFinite(minX) && maxX > minX && maxY > minY ? { minX, maxX, minY, maxY } : undefined;
};

const fitPolygonToBounds = (points: number[][], target: PixelBounds): number[][] => {
  if (!points.length) return points;
  const source: PixelBounds = {
    minX: Math.min(...points.map(point => point[0])),
    maxX: Math.max(...points.map(point => point[0])),
    minY: Math.min(...points.map(point => point[1])),
    maxY: Math.max(...points.map(point => point[1])),
  };
  const sourceWidth = source.maxX - source.minX;
  const sourceHeight = source.maxY - source.minY;
  if (sourceWidth <= 0 || sourceHeight <= 0) return points;
  return points.map(point => [
    target.minX + (point[0] - source.minX) / sourceWidth * (target.maxX - target.minX),
    target.minY + (point[1] - source.minY) / sourceHeight * (target.maxY - target.minY),
  ]);
};

const estimateTypicalWallThickness = (segments: PixelSegment[]) => {
  const candidates = segments.filter(segment => segment.thickness >= 2);
  if (!candidates.length) return 2;
  // Rank by actual ink mass, then estimate from only the strongest strokes.
  // This remains stable when a fixture contributes dozens of thin lines.
  const eliteCount = Math.min(12, Math.max(4, Math.ceil(candidates.length * 0.2)));
  const elite = [...candidates]
    .sort((a, b) =>
      (b.end - b.start) * b.thickness - (a.end - a.start) * a.thickness ||
      b.thickness - a.thickness)
    .slice(0, eliteCount);
  return Math.max(2, median(elite.map(segment => segment.thickness)) || 2);
};

const estimatePixelScale = (
  bounds: PixelBounds,
  options: LocalImageExtractionOptions,
) => {
  const requested = getBoundaryBounds(options.requestedBoundary);
  const pixelWidth = Math.max(1, bounds.maxX - bounds.minX);
  const pixelHeight = Math.max(1, bounds.maxY - bounds.minY);
  if (requested) {
    const uniform = Math.min(
      (requested.maxX - requested.minX) / pixelWidth,
      (requested.maxY - requested.minY) / pixelHeight,
    );
    return { x: uniform, y: uniform };
  }
  const uniform = (options.targetSizeMeters || DEFAULT_TARGET_SIZE_METERS) / Math.max(pixelWidth, pixelHeight);
  return { x: uniform, y: uniform };
};

const resolveMissingHostRecoveryScale = (
  bounds: PixelBounds,
  options: LocalImageExtractionOptions,
  fallback: { x: number; y: number },
) => {
  if (options.requestedBoundary) return fallback;
  const pixelWidth = Math.max(1, bounds.maxX - bounds.minX);
  const pixelHeight = Math.max(1, bounds.maxY - bounds.minY);
  const candidates = [
    typeof options.requestedWidthMeters === 'number' && options.requestedWidthMeters > 0
      ? options.requestedWidthMeters / pixelWidth
      : undefined,
    typeof options.requestedDepthMeters === 'number' && options.requestedDepthMeters > 0
      ? options.requestedDepthMeters / pixelHeight
      : undefined,
  ].filter((value): value is number => value !== undefined && Number.isFinite(value) && value > 0);
  if (!candidates.length) return fallback;
  const uniform = Math.min(...candidates);
  return { x: uniform, y: uniform };
};

export const resolveText4gMissingHostRecoveryScaleForTest = resolveMissingHostRecoveryScale;

const deduplicateParallelSegments = (segments: PixelSegment[], typicalThickness: number) => {
  const tolerance = Math.max(2, typicalThickness * 1.75);
  const kept: PixelSegment[] = [];
  const sorted = [...segments].sort((a, b) => a.axis.localeCompare(b.axis) || a.line - b.line || a.start - b.start);
  for (const segment of sorted) {
    const duplicate = kept.find(candidate => {
      if (candidate.axis !== segment.axis || Math.abs(candidate.line - segment.line) > tolerance) return false;
      const overlap = Math.min(candidate.end, segment.end) - Math.max(candidate.start, segment.start);
      const shorter = Math.min(candidate.end - candidate.start, segment.end - segment.start);
      return overlap > 0 && overlap / Math.max(1, shorter) >= 0.60;
    });
    if (!duplicate) {
      kept.push({ ...segment });
      continue;
    }
    const firstWeight = (duplicate.end - duplicate.start) * Math.max(1, duplicate.thickness);
    const secondWeight = (segment.end - segment.start) * Math.max(1, segment.thickness);
    duplicate.line = (duplicate.line * firstWeight + segment.line * secondWeight) / (firstWeight + secondWeight);
    duplicate.start = Math.min(duplicate.start, segment.start);
    duplicate.end = Math.max(duplicate.end, segment.end);
    duplicate.thickness = Math.max(duplicate.thickness, segment.thickness, Math.abs(duplicate.line - segment.line));
  }
  return kept;
};

const mergeCollinearSegments = (
  segments: PixelSegment[],
  pixelScale: { x: number; y: number },
  typicalThickness: number,
  width: number,
  height: number,
) => {
  const merged: PixelSegment[] = [];
  const gaps: PixelGap[] = [];
  const networkBounds = segmentBounds(segments);
  const alignmentTolerance = Math.max(1.5, typicalThickness * 0.9);
  for (const axis of ['horizontal', 'vertical'] as const) {
    const directionSegments = segments.filter(segment => segment.axis === axis).sort((a, b) => a.line - b.line || a.start - b.start);
    const groups: PixelSegment[][] = [];
    for (const segment of directionSegments) {
      const group = groups.find(candidate => Math.abs(median(candidate.map(item => item.line)) - segment.line) <= alignmentTolerance);
      if (group) group.push(segment);
      else groups.push([segment]);
    }
    for (const group of groups) {
      const weightTotal = group.reduce((sum, segment) => sum + Math.max(1, segment.end - segment.start), 0);
      const line = group.reduce((sum, segment) => sum + segment.line * Math.max(1, segment.end - segment.start), 0) / weightTotal;
      const alongScale = axis === 'horizontal' ? pixelScale.x : pixelScale.y;
      const planAlongSpan = axis === 'horizontal' ? width : height;
      const envelopeCoordinates = axis === 'horizontal'
        ? [networkBounds.minY, networkBounds.maxY]
        : [networkBounds.minX, networkBounds.maxX];
      const isEnvelopeBand = envelopeCoordinates.some(coordinate => Math.abs(line - coordinate) <= typicalThickness * 2);
      const joinDistance = Math.max(2, Math.min(0.12 / alongScale, typicalThickness * 1.25));
      const minimumOpening = Math.max(joinDistance + 1, typicalThickness * 1.5);
      const maximumOpening = Math.max(minimumOpening, Math.min(3.5 / alongScale, planAlongSpan * (isEnvelopeBand ? 0.32 : 0.26)));
      const intervals = [...group].sort((a, b) => a.start - b.start || a.end - b.end);
      let current: PixelSegment = { ...intervals[0], line };
      for (let index = 1; index < intervals.length; index++) {
        const next = intervals[index];
        const gapWidth = next.start - current.end;
        const currentLength = Math.max(1, current.end - current.start);
        const nextLength = Math.max(1, next.end - next.start);
        const lengthSimilarity = Math.min(currentLength, nextLength) / Math.max(currentLength, nextLength);
        const thicknessSimilarity = Math.min(current.thickness, next.thickness) / Math.max(1, Math.max(current.thickness, next.thickness));
        const plausibleOpening = gapWidth <= maximumOpening &&
          (isEnvelopeBand || thicknessSimilarity >= 0.5) &&
          (isEnvelopeBand || gapWidth <= typicalThickness * 8 || lengthSimilarity >= 0.22);
        if (gapWidth <= joinDistance || plausibleOpening) {
          if (gapWidth >= minimumOpening) {
            gaps.push({
              axis,
              line,
              start: current.end,
              end: next.start,
              thickness: Math.max(current.thickness, next.thickness),
            });
          }
          current.end = Math.max(current.end, next.end);
          current.thickness = Math.max(current.thickness, next.thickness);
        } else {
          merged.push(current);
          current = { ...next, line };
        }
      }
      merged.push(current);
    }
  }
  return { segments: merged, gaps };
};

const snapWallNetwork = (
  segments: PixelSegment[],
  pixelScale: { x: number; y: number },
  typicalThickness: number,
) => {
  const horizontal = segments.filter(segment => segment.axis === 'horizontal');
  const vertical = segments.filter(segment => segment.axis === 'vertical');
  const snapX = Math.max(2, Math.min(0.3 / pixelScale.x, typicalThickness * 2.5));
  const snapY = Math.max(2, Math.min(0.3 / pixelScale.y, typicalThickness * 2.5));
  for (const hWall of horizontal) {
    for (const vWall of vertical) {
      if (hWall.line < vWall.start - snapY || hWall.line > vWall.end + snapY) continue;
      if (Math.abs(hWall.start - vWall.line) <= snapX) hWall.start = vWall.line;
      if (Math.abs(hWall.end - vWall.line) <= snapX) hWall.end = vWall.line;
      if (vWall.line < hWall.start - snapX || vWall.line > hWall.end + snapX) continue;
      if (Math.abs(vWall.start - hWall.line) <= snapY) vWall.start = hWall.line;
      if (Math.abs(vWall.end - hWall.line) <= snapY) vWall.end = hWall.line;
    }
  }
};

const darkSupportAlongGap = (
  axis: Axis,
  line: number,
  start: number,
  end: number,
  darkMask: Uint8Array,
  width: number,
  height: number,
  normalRadius: number,
) => {
  const from = Math.ceil(Math.min(start, end));
  const to = Math.floor(Math.max(start, end));
  if (to < from) return 0;
  let supported = 0;
  for (let along = from; along <= to; along++) {
    let hasDarkPixel = false;
    for (let normal = Math.round(line) - normalRadius; normal <= Math.round(line) + normalRadius; normal++) {
      const x = axis === 'horizontal' ? along : normal;
      const y = axis === 'horizontal' ? normal : along;
      if (x >= 0 && y >= 0 && x < width && y < height && darkMask[y * width + x]) {
        hasDarkPixel = true;
        break;
      }
    }
    if (hasDarkPixel) supported++;
  }
  return supported / Math.max(1, to - from + 1);
};

/**
 * Recover a wall end that clearly aims at a perpendicular wall. This handles
 * doors/windows whose symbols fragment the thick source stroke so severely
 * that only one jamb-side wall band survived the initial run detector.
 */
const closeSupportedJunctionGaps = (
  segments: PixelSegment[],
  darkMask: Uint8Array,
  width: number,
  height: number,
  pixelScale: { x: number; y: number },
  typicalThickness: number,
) => {
  const normalRadius = Math.max(2, Math.ceil(typicalThickness));
  for (let pass = 0; pass < 2; pass++) {
    for (const segment of segments) {
      const alongScale = segment.axis === 'horizontal' ? pixelScale.x : pixelScale.y;
      const planAlongSpan = segment.axis === 'horizontal' ? width : height;
      const maximumGap = Math.max(typicalThickness * 2, Math.min(0.45 / alongScale, planAlongSpan * 0.06));
      // Only bridge a gap without raster support when it is on the order of a
      // wall thickness. Meter-scale automatic extension connected cabinet and
      // fixture strokes to nearby walls and turned them into false networks.
      const automaticGap = Math.max(2, typicalThickness * 1.5);
      const perpendicular = segments.filter(candidate => candidate.axis !== segment.axis);
      for (const endKey of ['start', 'end'] as const) {
        const endpoint = segment[endKey];
        const direction = endKey === 'start' ? -1 : 1;
        const targets = perpendicular.flatMap(candidate => {
          const targetAlong = candidate.line;
          const distance = (targetAlong - endpoint) * direction;
          const crossesTargetSpan = segment.line >= candidate.start - normalRadius && segment.line <= candidate.end + normalRadius;
          return distance > 1 && distance <= maximumGap && crossesTargetSpan ? [{ candidate, targetAlong, distance }] : [];
        }).sort((a, b) => a.distance - b.distance);
        const target = targets.find(item => {
          if (item.distance <= automaticGap) return true;
          const support = darkSupportAlongGap(segment.axis, segment.line, endpoint, item.targetAlong, darkMask, width, height, normalRadius);
          return support >= 0.65;
        });
        if (!target) continue;
        // This is topology repair only. Openings are emitted exclusively from
        // independently observed collinear wall gaps, never from an inferred
        // corner/T-junction extension.
        segment[endKey] = target.targetAlong;
      }
    }
  }
};

const retainMainWallNetwork = (
  segments: PixelSegment[],
  pixelScale: { x: number; y: number },
  typicalThickness: number,
) => {
  if (segments.length <= 1) return segments;
  const parents = segments.map((_, index) => index);
  const find = (index: number): number => parents[index] === index ? index : (parents[index] = find(parents[index]));
  const unite = (first: number, second: number) => {
    const rootA = find(first), rootB = find(second);
    if (rootA !== rootB) parents[rootB] = rootA;
  };
  const toleranceX = Math.max(2, Math.min(0.32 / pixelScale.x, typicalThickness * 3));
  const toleranceY = Math.max(2, Math.min(0.32 / pixelScale.y, typicalThickness * 3));
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i], b = segments[j];
      if (a.axis === b.axis) {
        const lineTolerance = a.axis === 'horizontal' ? toleranceY : toleranceX;
        const alongTolerance = a.axis === 'horizontal' ? toleranceX : toleranceY;
        if (Math.abs(a.line - b.line) <= lineTolerance && Math.min(a.end, b.end) >= Math.max(a.start, b.start) - alongTolerance) unite(i, j);
      } else {
        const horizontal = a.axis === 'horizontal' ? a : b;
        const vertical = a.axis === 'vertical' ? a : b;
        if (vertical.line >= horizontal.start - toleranceX && vertical.line <= horizontal.end + toleranceX &&
            horizontal.line >= vertical.start - toleranceY && horizontal.line <= vertical.end + toleranceY) unite(i, j);
      }
    }
  }
  const scores = new Map<number, number>();
  segments.forEach((segment, index) => {
    const alongScale = segment.axis === 'horizontal' ? pixelScale.x : pixelScale.y;
    const root = find(index);
    scores.set(root, (scores.get(root) || 0) + (segment.end - segment.start) * alongScale);
  });
  const mainRoot = Array.from(scores).sort((a, b) => b[1] - a[1])[0]?.[0];
  return segments.filter((_, index) => find(index) === mainRoot);
};

/**
 * Keep a freestanding structural room box when reliable OCR lands inside it.
 * This is deliberately narrower than retaining every disconnected component:
 * the four raster walls must form a coherent orthogonal enclosure around the
 * tag, so cabinets, fixture blocks, text, and loose annotation strokes remain
 * excluded by the existing main-network clutter filter.
 */
const retainTaggedInteriorWallBoxes = (
  segments: PixelSegment[],
  retainedSegments: PixelSegment[],
  roomTextTags: RoomTextTag[],
  pixelScale: { x: number; y: number },
  typicalThickness: number,
) => {
  if (!roomTextTags.length) return retainedSegments;
  const retained = new Set(retainedSegments);
  const result = [...retainedSegments];
  const toleranceX = Math.max(2, Math.min(0.3 / pixelScale.x, typicalThickness * 2.5));
  const toleranceY = Math.max(2, Math.min(0.3 / pixelScale.y, typicalThickness * 2.5));
  const vertical = segments.filter(segment => segment.axis === 'vertical');
  const horizontal = segments.filter(segment => segment.axis === 'horizontal');

  roomTextTags.forEach(tag => {
    const spanningVerticals = vertical.filter(segment =>
      segment.start <= tag.y + toleranceY && segment.end >= tag.y - toleranceY);
    const spanningHorizontals = horizontal.filter(segment =>
      segment.start <= tag.x + toleranceX && segment.end >= tag.x - toleranceX);
    const left = spanningVerticals.filter(segment => segment.line < tag.x)
      .sort((a, b) => b.line - a.line)[0];
    const right = spanningVerticals.filter(segment => segment.line > tag.x)
      .sort((a, b) => a.line - b.line)[0];
    const top = spanningHorizontals.filter(segment => segment.line < tag.y)
      .sort((a, b) => b.line - a.line)[0];
    const bottom = spanningHorizontals.filter(segment => segment.line > tag.y)
      .sort((a, b) => a.line - b.line)[0];
    if (!left || !right || !top || !bottom) return;

    const clearWidth = (right.line - left.line) * pixelScale.x;
    const clearHeight = (bottom.line - top.line) * pixelScale.y;
    if (Math.min(clearWidth, clearHeight) < 0.65 || Math.max(clearWidth, clearHeight) > 8) return;

    const horizontalSpansBox = (segment: PixelSegment) =>
      segment.start <= left.line + toleranceX && segment.end >= right.line - toleranceX;
    const verticalSpansBox = (segment: PixelSegment) =>
      segment.start <= top.line + toleranceY && segment.end >= bottom.line - toleranceY;
    if (!horizontalSpansBox(top) || !horizontalSpansBox(bottom)
      || !verticalSpansBox(left) || !verticalSpansBox(right)) return;

    const boxWalls = [left, right, top, bottom];
    if (boxWalls.filter(segment => !retained.has(segment)).length < 2) return;
    boxWalls.forEach(segment => {
      if (retained.has(segment)) return;
      retained.add(segment);
      result.push(segment);
    });
  });
  return result;
};

const rasterizeWalls = (
  segments: PixelSegment[],
  width: number,
  height: number,
  typicalThickness: number,
) => {
  const barrier = new Uint8Array(width * height);
  const radius = Math.max(1, Math.round(Math.max(2, typicalThickness) / 2));
  for (const segment of segments) {
    if (segment.axis === 'horizontal') {
      const y1 = clamp(Math.round(segment.line) - radius, 0, height - 1);
      const y2 = clamp(Math.round(segment.line) + radius, 0, height - 1);
      const x1 = clamp(Math.floor(segment.start), 0, width - 1);
      const x2 = clamp(Math.ceil(segment.end), 0, width - 1);
      for (let y = y1; y <= y2; y++) barrier.fill(1, y * width + x1, y * width + x2 + 1);
    } else {
      const x1 = clamp(Math.round(segment.line) - radius, 0, width - 1);
      const x2 = clamp(Math.round(segment.line) + radius, 0, width - 1);
      const y1 = clamp(Math.floor(segment.start), 0, height - 1);
      const y2 = clamp(Math.ceil(segment.end), 0, height - 1);
      for (let y = y1; y <= y2; y++) barrier.fill(1, y * width + x1, y * width + x2 + 1);
    }
  }
  return { barrier, radius };
};

const rasterizeFreeformWalls = (
  barrier: Uint8Array,
  segments: Text4gFreeformWallSegment[],
  width: number,
  height: number,
) => {
  const fillDisk = (cx: number, cy: number, radius: number) => {
    const x0 = clamp(Math.floor(cx - radius), 0, width - 1);
    const x1 = clamp(Math.ceil(cx + radius), 0, width - 1);
    const y0 = clamp(Math.floor(cy - radius), 0, height - 1);
    const y1 = clamp(Math.ceil(cy + radius), 0, height - 1);
    const radiusSquared = radius * radius;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= radiusSquared) barrier[y * width + x] = 1;
      }
    }
  };
  segments.forEach(segment => {
    const length = Math.hypot(segment.p2.x - segment.p1.x, segment.p2.y - segment.p1.y);
    const steps = Math.max(1, Math.ceil(length * 1.25));
    const radius = Math.max(1, segment.thickness / 2);
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      fillDisk(
        segment.p1.x + (segment.p2.x - segment.p1.x) * t,
        segment.p1.y + (segment.p2.y - segment.p1.y) * t,
        radius,
      );
    }
  });
};

// Accepted native curves must participate in the same enclosure flood as the
// raster chords they replace. This is intentionally called only by the F
// curvilinear path after curve evidence has passed its fit/support gates; it
// never adds geometry to orthogonal or angular-only plans.
const rasterizeNativeText4gArcs = (
  barrier: Uint8Array,
  arcs: Array<{
    center: Text4gPixelPoint;
    radius: number;
    ellipseRadiusX?: number;
    ellipseRadiusY?: number;
    ellipseRotation?: number;
    ellipseStartAngle?: number;
    ellipseEndAngle?: number;
    ellipseCounterclockwise?: boolean;
    startAngle: number;
    endAngle: number;
    counterclockwise: boolean;
  }>,
  width: number,
  height: number,
  typicalThickness: number,
) => {
  const fillDisk = (cx: number, cy: number, radius: number) => {
    const x0 = clamp(Math.floor(cx - radius), 0, width - 1);
    const x1 = clamp(Math.ceil(cx + radius), 0, width - 1);
    const y0 = clamp(Math.floor(cy - radius), 0, height - 1);
    const y1 = clamp(Math.ceil(cy + radius), 0, height - 1);
    const radiusSquared = radius * radius;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radiusSquared) barrier[y * width + x] = 1;
    }
  };
  arcs.forEach(arc => {
    const startAngle = arc.ellipseStartAngle ?? arc.startAngle;
    const endAngle = arc.ellipseEndAngle ?? arc.endAngle;
    const counterclockwise = arc.ellipseCounterclockwise ?? arc.counterclockwise;
    let span = counterclockwise ? startAngle - endAngle : endAngle - startAngle;
    while (span < 0) span += Math.PI * 2;
    while (span >= Math.PI * 2) span -= Math.PI * 2;
    const steps = Math.max(8, Math.ceil(arc.radius * span * 1.25));
    const radius = Math.max(1, typicalThickness / 2);
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const angle = counterclockwise ? startAngle - span * t : startAngle + span * t;
      const ellipseRadiusX = arc.ellipseRadiusX ?? arc.radius;
      const ellipseRadiusY = arc.ellipseRadiusY ?? arc.radius;
      const rotation = arc.ellipseRotation || 0;
      const cosR = Math.cos(rotation), sinR = Math.sin(rotation);
      const x = Math.cos(angle) * ellipseRadiusX;
      const y = Math.sin(angle) * ellipseRadiusY;
      fillDisk(
        arc.center.x + x * cosR - y * sinR,
        arc.center.y + x * sinR + y * cosR,
        radius,
      );
    }
  });
};

const freeformBounds = (segments: Text4gFreeformWallSegment[]): PixelBounds | undefined => {
  if (!segments.length) return undefined;
  const points = segments.flatMap(segment => [segment.p1, segment.p2]);
  return {
    minX: Math.min(...points.map(point => point.x)),
    maxX: Math.max(...points.map(point => point.x)),
    minY: Math.min(...points.map(point => point.y)),
    maxY: Math.max(...points.map(point => point.y)),
  };
};

const freeformAxisProjections = (
  segments: Text4gFreeformWallSegment[],
  minimumLength: number,
): PixelSegment[] => segments.flatMap<PixelSegment>(segment => {
  const dx = segment.p2.x - segment.p1.x;
  const dy = segment.p2.y - segment.p1.y;
  const length = Math.hypot(dx, dy);
  if (length < minimumLength) return [];
  const angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI) % 90;
  const fromAxis = Math.min(angle, 90 - angle);
  if (fromAxis > 5) return [];
  if (Math.abs(dx) >= Math.abs(dy)) return [{
    axis: 'horizontal' as const,
    line: (segment.p1.y + segment.p2.y) / 2,
    start: Math.min(segment.p1.x, segment.p2.x),
    end: Math.max(segment.p1.x, segment.p2.x),
    thickness: segment.thickness,
  }];
  return [{
    axis: 'vertical' as const,
    line: (segment.p1.x + segment.p2.x) / 2,
    start: Math.min(segment.p1.y, segment.p2.y),
    end: Math.max(segment.p1.y, segment.p2.y),
    thickness: segment.thickness,
  }];
});

const freeformCoveredByAxisWall = (
  segment: Text4gFreeformWallSegment,
  axisWalls: PixelSegment[],
  tolerance: number,
) => {
  const projection = freeformAxisProjections([segment], 0)[0];
  if (!projection) return false;
  return axisWalls.some(wall => {
    if (wall.axis !== projection.axis || Math.abs(wall.line - projection.line) > tolerance) return false;
    const overlap = Math.min(wall.end, projection.end) - Math.max(wall.start, projection.start);
    return overlap >= (projection.end - projection.start) * 0.72;
  });
};

const isFreeformExterior = (
  segment: Pick<Text4gFreeformWallSegment, 'p1' | 'p2' | 'thickness'>,
  outside: Uint8Array,
  width: number,
  height: number,
) => {
  const dx = segment.p2.x - segment.p1.x, dy = segment.p2.y - segment.p1.y;
  const length = Math.max(1e-6, Math.hypot(dx, dy));
  const normal = { x: -dy / length, y: dx / length };
  const offset = Math.max(2, segment.thickness * 0.75);
  let sideAOutside = 0, sideBOutside = 0, samples = 0;
  for (let index = 1; index <= 7; index++) {
    const t = index / 8;
    const cx = segment.p1.x + dx * t, cy = segment.p1.y + dy * t;
    const points = [
      { x: Math.round(cx + normal.x * offset), y: Math.round(cy + normal.y * offset) },
      { x: Math.round(cx - normal.x * offset), y: Math.round(cy - normal.y * offset) },
    ];
    if (points.some(point => point.x < 0 || point.y < 0 || point.x >= width || point.y >= height)) continue;
    sideAOutside += outside[points[0].y * width + points[0].x];
    sideBOutside += outside[points[1].y * width + points[1].x];
    samples++;
  }
  if (!samples) return false;
  const ratioA = sideAOutside / samples, ratioB = sideBOutside / samples;
  return Math.max(ratioA, ratioB) >= 0.55 && Math.min(ratioA, ratioB) <= 0.45;
};

const floodSpaces = (
  barrier: Uint8Array,
  width: number,
  height: number,
  pixelScale: { x: number; y: number },
) : FloodResult => {
  const pixelCount = width * height;
  const outside = new Uint8Array(pixelCount);
  const labels = new Int32Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0, tail = 0;
  const enqueueOutside = (index: number) => {
    if (index < 0 || index >= pixelCount || barrier[index] || outside[index]) return;
    outside[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x++) {
    enqueueOutside(x);
    enqueueOutside((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    enqueueOutside(y * width);
    enqueueOutside(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    if (x > 0) enqueueOutside(index - 1);
    if (x + 1 < width) enqueueOutside(index + 1);
    if (index >= width) enqueueOutside(index - width);
    if (index + width < pixelCount) enqueueOutside(index + width);
  }

  const regions: SpaceRegion[] = [];
  const spaces: SpaceRegion[] = [];
  let regionId = 0;
  for (let start = 0; start < pixelCount; start++) {
    if (barrier[start] || outside[start] || labels[start]) continue;
    regionId++;
    head = 0;
    tail = 0;
    queue[tail++] = start;
    labels[start] = regionId;
    let areaPixels = 0, sumX = 0, sumY = 0;
    let minX = width, maxX = 0, minY = height, maxY = 0;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width, y = Math.floor(index / width);
      areaPixels++;
      sumX += x;
      sumY += y;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      const add = (next: number) => {
        if (barrier[next] || outside[next] || labels[next]) return;
        labels[next] = regionId;
        queue[tail++] = next;
      };
      if (x > 0) add(index - 1);
      if (x + 1 < width) add(index + 1);
      if (y > 0) add(index - width);
      if (y + 1 < height) add(index + width);
    }
    let x = Math.round(sumX / areaPixels), y = Math.round(sumY / areaPixels);
    if (labels[y * width + x] !== regionId) {
      let found = false;
      for (let radius = 1; radius <= Math.max(maxX - minX, maxY - minY) && !found; radius++) {
        const x1 = clamp(x - radius, minX, maxX), x2 = clamp(x + radius, minX, maxX);
        const y1 = clamp(y - radius, minY, maxY), y2 = clamp(y + radius, minY, maxY);
        for (let scanX = x1; scanX <= x2 && !found; scanX++) {
          for (const scanY of [y1, y2]) {
            if (labels[scanY * width + scanX] === regionId) { x = scanX; y = scanY; found = true; break; }
          }
        }
        for (let scanY = y1; scanY <= y2 && !found; scanY++) {
          for (const scanX of [x1, x2]) {
            if (labels[scanY * width + scanX] === regionId) { x = scanX; y = scanY; found = true; break; }
          }
        }
      }
    }
    const areaMeters = areaPixels * pixelScale.x * pixelScale.y;
    const roomWidth = (maxX - minX + 1) * pixelScale.x;
    const roomHeight = (maxY - minY + 1) * pixelScale.y;
    const region = { id: regionId, areaPixels, areaMeters, minX, maxX, minY, maxY, x, y };
    regions.push(region);
    // Small real rooms are recovered when an OCR tag lands in `regions`; this
    // generic list stays conservative to avoid cabinet and door-swing pockets.
    if (areaMeters < 0.65 || Math.min(roomWidth, roomHeight) < 0.65) continue;
    spaces.push(region);
  }
  return { outside, labels, regions, spaces };
};

/**
 * Last-mile topology repair for otherwise usable wall detections. Image models
 * sometimes leave corner/T-junction strokes a few pixels short, so the room
 * flood leaks to the canvas edge even though the plan is visually clear. This
 * repair runs only after the conservative pass finds zero enclosed spaces.
 */
const repairEnclosureTopology = (
  sourceSegments: PixelSegment[],
  width: number,
  height: number,
  pixelScale: { x: number; y: number },
  typicalThickness: number,
) => {
  const segments = sourceSegments.map(segment => ({ ...segment }));
  const bounds = segmentBounds(segments);
  const normalTolerance = Math.max(typicalThickness * 2.5, 3);
  const maximumHorizontalGap = Math.max(typicalThickness * 2, Math.min(1.2 / pixelScale.x, width * 0.14));
  const maximumVerticalGap = Math.max(typicalThickness * 2, Math.min(1.2 / pixelScale.y, height * 0.14));

  // Extend a dangling endpoint to the nearest perpendicular wall when their
  // centerlines clearly aim at each other. Unlike the primary repair, this
  // does not require dark raster support because it is invoked only on a
  // network that otherwise has no enclosed region.
  for (let pass = 0; pass < 2; pass++) {
    for (const segment of segments) {
      const maximumGap = segment.axis === 'horizontal' ? maximumHorizontalGap : maximumVerticalGap;
      const perpendicular = segments.filter(candidate => candidate.axis !== segment.axis);
      for (const endKey of ['start', 'end'] as const) {
        const endpoint = segment[endKey];
        const direction = endKey === 'start' ? -1 : 1;
        const target = perpendicular.flatMap(candidate => {
          const distance = (candidate.line - endpoint) * direction;
          const crossesSpan = segment.line >= candidate.start - normalTolerance && segment.line <= candidate.end + normalTolerance;
          return distance > 0 && distance <= maximumGap && crossesSpan
            ? [{ line: candidate.line, distance }]
            : [];
        }).sort((first, second) => first.distance - second.distance)[0];
        if (target) segment[endKey] = target.line;
      }
    }
    snapWallNetwork(segments, pixelScale, typicalThickness);
  }

  let raster = rasterizeWalls(segments, width, height, typicalThickness);
  let flood = floodSpaces(raster.barrier, width, height, pixelScale);
  if (flood.spaces.length) {
    return { segments, ...raster, flood, mode: 'junctions' as const };
  }

  // If the detected facade itself contains a large discontinuity, reinforce
  // only the four bounds of the already-selected main wall network. The
  // original interior walls and observed opening gaps are retained.
  const shell: PixelSegment[] = [
    { axis: 'horizontal', line: bounds.minY, start: bounds.minX, end: bounds.maxX, thickness: typicalThickness },
    { axis: 'horizontal', line: bounds.maxY, start: bounds.minX, end: bounds.maxX, thickness: typicalThickness },
    { axis: 'vertical', line: bounds.minX, start: bounds.minY, end: bounds.maxY, thickness: typicalThickness },
    { axis: 'vertical', line: bounds.maxX, start: bounds.minY, end: bounds.maxY, thickness: typicalThickness },
  ];
  const reinforced = deduplicateParallelSegments([...segments, ...shell], typicalThickness);
  snapWallNetwork(reinforced, pixelScale, typicalThickness);
  raster = rasterizeWalls(reinforced, width, height, typicalThickness);
  flood = floodSpaces(raster.barrier, width, height, pixelScale);
  return { segments: reinforced, ...raster, flood, mode: 'shell' as const };
};

interface DoorSwingEvidence {
  detected: boolean;
  /** The leaf is hinged at the gap's end rather than its start. */
  isFlipped: boolean;
  /** Matches the editor's facing flag after raster Y is converted to canvas Y. */
  facingFlipped: boolean;
  /** Two evidenced hinge leaves are the conservative signature for a double swing door. */
  endpointCount: number;
  confidence: number;
  /** The quarter-circle arc was present but the straight leaf was too faint. */
  arcOnly?: boolean;
  /** A straight leaf was accepted only after matching a jamb-centred swing arc. */
  arcConfirmed?: boolean;
  /** An arc was detected even when the leaf and arc orientations did not agree. */
  arcEvidence?: boolean;
  /** Matching half-width arcs were independently validated from both jambs. */
  doubleArcConfirmed?: boolean;
  /** Wall-band merging stopped before a matching visible leaf/arc hinge. */
  offsetHinge?: boolean;
  /** Raster-axis offset from the detected gap endpoint to the visible hinge. */
  hingeOffset?: number;
  /** A near-closed leaf visually bridged the aperture along the host wall. */
  closedLeaf?: boolean;
}

/**
 * Missing-host recovery is allowed to reconstruct wall geometry, but it must
 * never manufacture the door symbol that justifies that reconstruction. A
 * genuine open swing has a separate thin leaf perpendicular to its host. The
 * leaf must meet the proposed host at the detected hinge and extend to the
 * same side as the recovered arc. Nearby walls, fixtures, and glazing bars do
 * not qualify merely because they sit inside the same search neighbourhood.
 */
const findExplicitPerpendicularSwingLeaf = (
  gap: PixelGap,
  swing: DoorSwingEvidence,
  symbolSegments: PixelSegment[],
  typicalThickness: number,
) => {
  if (!swing.detected || !swing.arcConfirmed || swing.endpointCount !== 1) return undefined;
  const gapLength = gap.end - gap.start;
  const hingeAlong = (swing.isFlipped ? gap.end : gap.start) + (swing.hingeOffset || 0);
  const hingeTolerance = Math.max(3, typicalThickness * 0.95);
  const hostReachTolerance = Math.max(2, typicalThickness * 0.55);
  const minimumLeafLength = Math.max(8, gapLength * 0.42);
  const maximumLeafLength = Math.max(minimumLeafLength + 2, gapLength * 1.65);
  // A recovered leaf must remain materially thinner than its host wall.
  // Otherwise the nearest perpendicular jamb itself can be misread as the
  // leaf and widen the recovered door past the raster hinge.
  const maximumLeafThickness = Math.max(3, typicalThickness * 0.78);

  return symbolSegments
    .filter(leaf => leaf.axis !== gap.axis
      && leaf.thickness >= 1
      && leaf.thickness <= maximumLeafThickness
      && leaf.end - leaf.start >= minimumLeafLength
      // A one-pixel drafting leaf is accepted only when it spans most of the
      // aperture. This preserves faint real leaves without allowing short OCR
      // strokes or fixture ticks to corroborate a recovered host.
      && (leaf.thickness >= 2 || leaf.end - leaf.start >= gapLength * 0.72)
      && leaf.end - leaf.start <= maximumLeafLength
      && Math.abs(leaf.line - hingeAlong) <= hingeTolerance
      && leaf.start <= gap.line + hostReachTolerance
      && leaf.end >= gap.line - hostReachTolerance)
    .map(leaf => {
      const negativeReach = Math.max(0, gap.line - leaf.start);
      const positiveReach = Math.max(0, leaf.end - gap.line);
      const normalDirection: -1 | 1 = positiveReach >= negativeReach ? 1 : -1;
      const expectedFacing = gap.axis === 'horizontal'
        ? normalDirection < 0
        : normalDirection > 0;
      const outwardReach = Math.max(negativeReach, positiveReach);
      const score = Math.abs(leaf.line - hingeAlong)
        + Math.abs(Math.min(negativeReach, positiveReach)) * 0.08
        - outwardReach * 0.01;
      return { leaf, expectedFacing, outwardReach, score };
    })
    .filter(candidate => candidate.expectedFacing === swing.facingFlipped
      && candidate.outwardReach >= minimumLeafLength * 0.75)
    .sort((first, second) => first.score - second.score)[0]?.leaf;
};

/**
 * Band extraction can stop a few pixels before a visible swing hinge. Permit
 * that offset only when the same hosted arc survives both raster masks and a
 * separate perpendicular leaf reaches the proposed host. This keeps the
 * exception tied to the door glyph rather than to a wider proximity search.
 */
const findExplicitHostedOffsetSwing = (
  gap: PixelGap,
  cleanHostedArc: DoorSwingEvidence,
  originalHostedArc: DoorSwingEvidence,
  symbolSegments: PixelSegment[],
  typicalThickness: number,
) => {
  const matchingHostedArc = cleanHostedArc.detected && originalHostedArc.detected
    && cleanHostedArc.isFlipped === originalHostedArc.isFlipped
    && cleanHostedArc.facingFlipped === originalHostedArc.facingFlipped;
  if (!matchingHostedArc) return undefined;
  const hostedHinge = originalHostedArc.isFlipped ? gap.end : gap.start;
  return symbolSegments
    .filter(leaf => leaf.axis !== gap.axis
      && Math.abs(leaf.line - hostedHinge) <= typicalThickness * 2.4)
    .map(leaf => ({
      leaf,
      swing: {
        ...originalHostedArc,
        endpointCount: 1,
        confidence: Math.min(cleanHostedArc.confidence, originalHostedArc.confidence),
        arcOnly: false,
        arcConfirmed: true,
        offsetHinge: true,
        hingeOffset: leaf.line - hostedHinge,
      } as DoorSwingEvidence,
    }))
    .filter(candidate => findExplicitPerpendicularSwingLeaf(
      gap,
      candidate.swing,
      symbolSegments,
      typicalThickness,
    ) === candidate.leaf)
    .sort((first, second) => Math.abs(first.swing.hingeOffset || 0) - Math.abs(second.swing.hingeOffset || 0))[0]?.swing;
};

export const findText4gExplicitHostedOffsetSwingForTest = findExplicitHostedOffsetSwing;

export const detectDoorSwing = (
  gap: PixelGap,
  darkMask: Uint8Array,
  width: number,
  height: number,
  endpointSearchScale = 1,
  leafCrossStrokeFactor = 0.65,
): DoorSwingEvidence => {
  const gapLength = gap.end - gap.start;
  const minimumStroke = Math.max(4, gapLength * 0.42);
  const maximumStroke = gapLength * 1.55;
  const normalReach = Math.ceil(gapLength * 1.25);
  const endSearch = Math.max(2, Math.ceil(gap.thickness * endpointSearchScale));
  const endpointRuns: Array<{
    endpoint: 'start' | 'end'; normalDirection: -1 | 1; length: number; hingeOffset: number;
  }> = [];
  for (const endpoint of ['start', 'end'] as const) {
    let best: (typeof endpointRuns)[number] | undefined;
    const anchor = endpoint === 'start' ? gap.start : gap.end;
    for (let offset = -endSearch; offset <= endSearch; offset++) {
      const along = Math.round(anchor + offset);
    if (gap.axis === 'horizontal') {
      if (along < 0 || along >= width) continue;
      const y1 = clamp(Math.floor(gap.line - normalReach), 0, height - 1);
      const y2 = clamp(Math.ceil(gap.line + normalReach), 0, height - 1);
      let runStart = -1;
      for (let y = y1; y <= y2 + 1; y++) {
        const dark = y <= y2 && darkMask[y * width + along];
        if (dark && runStart < 0) runStart = y;
        if ((!dark || y > y2) && runStart >= 0) {
          const runEnd = y - 1;
          const length = runEnd - runStart + 1;
          if (runStart <= gap.line + gap.thickness && runEnd >= gap.line - gap.thickness && length >= minimumStroke && length <= maximumStroke) {
            const midY = Math.round((runStart + runEnd) / 2);
            let strokeStart = along, strokeEnd = along;
            while (strokeStart > 0 && darkMask[midY * width + strokeStart - 1]) strokeStart--;
            while (strokeEnd + 1 < width && darkMask[midY * width + strokeEnd + 1]) strokeEnd++;
            if (strokeEnd - strokeStart + 1 > Math.max(4, gap.thickness * leafCrossStrokeFactor)) {
              runStart = -1;
              continue;
            }
            const negativeReach = Math.max(0, gap.line - runStart);
            const positiveReach = Math.max(0, runEnd - gap.line);
            const candidate = {
              endpoint,
              normalDirection: (positiveReach >= negativeReach ? 1 : -1) as -1 | 1,
              length,
              hingeOffset: along - anchor,
            };
            if (!best || candidate.length > best.length) best = candidate;
          }
          runStart = -1;
        }
      }
    } else {
      if (along < 0 || along >= height) continue;
      const x1 = clamp(Math.floor(gap.line - normalReach), 0, width - 1);
      const x2 = clamp(Math.ceil(gap.line + normalReach), 0, width - 1);
      let runStart = -1;
      for (let x = x1; x <= x2 + 1; x++) {
        const dark = x <= x2 && darkMask[along * width + x];
        if (dark && runStart < 0) runStart = x;
        if ((!dark || x > x2) && runStart >= 0) {
          const runEnd = x - 1;
          const length = runEnd - runStart + 1;
          if (runStart <= gap.line + gap.thickness && runEnd >= gap.line - gap.thickness && length >= minimumStroke && length <= maximumStroke) {
            const midX = Math.round((runStart + runEnd) / 2);
            let strokeStart = along, strokeEnd = along;
            while (strokeStart > 0 && darkMask[(strokeStart - 1) * width + midX]) strokeStart--;
            while (strokeEnd + 1 < height && darkMask[(strokeEnd + 1) * width + midX]) strokeEnd++;
            if (strokeEnd - strokeStart + 1 > Math.max(4, gap.thickness * leafCrossStrokeFactor)) {
              runStart = -1;
              continue;
            }
            const negativeReach = Math.max(0, gap.line - runStart);
            const positiveReach = Math.max(0, runEnd - gap.line);
            const candidate = {
              endpoint,
              normalDirection: (positiveReach >= negativeReach ? 1 : -1) as -1 | 1,
              length,
              hingeOffset: along - anchor,
            };
            if (!best || candidate.length > best.length) best = candidate;
          }
          runStart = -1;
        }
      }
    }
    }
    if (best) endpointRuns.push(best);
  }
  const primary = [...endpointRuns].sort((a, b) => b.length - a.length)[0];
  if (!primary) return { detected: false, isFlipped: false, facingFlipped: false, endpointCount: 0, confidence: 0 };
  return {
    detected: true,
    isFlipped: primary.endpoint === 'end',
    // mapToArchElements inverts raster Y. These mappings preserve the leaf on
    // the same visual side of both horizontal and vertical hosted walls.
    facingFlipped: gap.axis === 'horizontal' ? primary.normalDirection < 0 : primary.normalDirection > 0,
    endpointCount: endpointRuns.length,
    confidence: endpointRuns.length >= 2 ? 0.9 : 0.84,
    hingeOffset: primary.hingeOffset,
  };
};

/**
 * Recover a swing from its quarter-circle arc when the straight leaf is too
 * faint to form a continuous perpendicular run. The sampled arc must remain
 * centred on a jamb endpoint, which keeps unrelated circular fixtures from
 * being promoted to doors.
 */
const detectDoorSwingArc = (
  gap: PixelGap,
  darkMask: Uint8Array,
  width: number,
  height: number,
  hingeHint?: { endpoint: 'start' | 'end'; hingeOffset: number },
  radiusScales: number[] = [0.84, 0.94, 1.04],
): DoorSwingEvidence => {
  const gapLength = gap.end - gap.start;
  if (gapLength < 10) return { detected: false, isFlipped: false, facingFlipped: false, endpointCount: 0, confidence: 0 };
  const sampleAngles = Array.from({ length: 12 }, (_, index) => (12 + index * 6) * Math.PI / 180);
  const tolerance = Math.max(1, Math.round(gap.thickness * 0.22));
  let best: { endpoint: 'start' | 'end'; normalDirection: -1 | 1; ratio: number } | undefined;
  const hasInkNear = (x: number, y: number) => {
    const centerX = Math.round(x), centerY = Math.round(y);
    for (let oy = -tolerance; oy <= tolerance; oy++) {
      for (let ox = -tolerance; ox <= tolerance; ox++) {
        const px = centerX + ox, py = centerY + oy;
        if (px >= 0 && py >= 0 && px < width && py < height && darkMask[py * width + px]) return true;
      }
    }
    return false;
  };
  const endpoints: Array<'start' | 'end'> = hingeHint ? [hingeHint.endpoint] : ['start', 'end'];
  for (const endpoint of endpoints) {
    const hinge = (endpoint === 'start' ? gap.start : gap.end)
      + (hingeHint?.endpoint === endpoint ? hingeHint.hingeOffset : 0);
    const alongDirection = endpoint === 'start' ? 1 : -1;
    for (const normalDirection of [-1, 1] as const) {
      for (const radiusScale of radiusScales) {
        const radius = gapLength * radiusScale;
        let hits = 0;
        sampleAngles.forEach(angle => {
          const along = hinge + alongDirection * Math.cos(angle) * radius;
          const normal = gap.line + normalDirection * Math.sin(angle) * radius;
          const x = gap.axis === 'horizontal' ? along : normal;
          const y = gap.axis === 'horizontal' ? normal : along;
          if (hasInkNear(x, y)) hits++;
        });
        const ratio = hits / sampleAngles.length;
        if (ratio >= 0.75 && (!best || ratio > best.ratio)) best = { endpoint, normalDirection, ratio };
      }
    }
  }
  if (!best) return { detected: false, isFlipped: false, facingFlipped: false, endpointCount: 0, confidence: 0 };
  return {
    detected: true,
    isFlipped: best.endpoint === 'end',
    facingFlipped: gap.axis === 'horizontal' ? best.normalDirection < 0 : best.normalDirection > 0,
    endpointCount: 1,
    confidence: clamp(0.68 + best.ratio * 0.2, 0, 0.84),
    arcOnly: true,
  };
};

/**
 * Recover a swing arc when wall-band extraction placed the candidate gap a
 * few pixels away from the visible jamb. This requires one continuous hosted
 * quarter-circle through all three angular sectors. Straight glazing bars can
 * intersect a few samples, but cannot pass the continuity gate. The search is
 * limited to one local door-width so another room's swing cannot reclassify a
 * facade window.
 */
const detectHostedDoorArc = (
  gap: PixelGap,
  mask: Uint8Array,
  width: number,
  height: number,
  requireThinRadialProfile = true,
  allowEllipticalProfile = false,
): DoorSwingEvidence => {
  const gapLength = gap.end - gap.start;
  if (gapLength < Math.max(12, gap.thickness * 2.2)
    || gapLength > Math.max(width, height) * 0.18) {
    return { detected: false, isFlipped: false, facingFlipped: false, endpointCount: 0, confidence: 0 };
  }
  const tolerance = clamp(Math.round(gap.thickness * 0.2), 2, 4);
  const hasInkNear = (x: number, y: number) => {
    const centerX = Math.round(x), centerY = Math.round(y);
    for (let offsetY = -tolerance; offsetY <= tolerance; offsetY++) {
      for (let offsetX = -tolerance; offsetX <= tolerance; offsetX++) {
        const pixelX = centerX + offsetX, pixelY = centerY + offsetY;
        if (pixelX >= 0 && pixelY >= 0 && pixelX < width && pixelY < height
          && mask[pixelY * width + pixelX]) return true;
      }
    }
    return false;
  };
  let best: { endpoint: 'start' | 'end'; normal: -1 | 1; ratio: number; run: number } | undefined;
  for (const lineShift of [-0.6, 0, 0.6]) {
    for (const endpoint of ['start', 'end'] as const) {
      const alongDirection = endpoint === 'start' ? 1 : -1;
      for (const normalDirection of [-1, 1] as const) {
        // Wall-band extraction can over- or underestimate a door gap. Search
        // the normal door-radius range as well as the slightly farther hosted
        // range, while the continuity and empty-outside-flank gates below keep
        // framed windows from satisfying this recovery.
        for (const alongRadiusScale of [0.82, 0.96, 1.08, 1.22, 1.4]) {
          // Printed/scanned plans are often scaled differently on X and Y.
          // A real quarter-circle door swing can therefore arrive as a
          // quarter ellipse. Search the two radii independently while keeping
          // the same continuous three-sector and empty-flank requirements.
          const normalRadiusScales = allowEllipticalProfile
            ? [0.82, 0.96, 1.08, 1.22, 1.4, 1.6]
            : [alongRadiusScale];
          for (const normalRadiusScale of normalRadiusScales) {
          const alongRadius = gapLength * alongRadiusScale;
          const normalRadius = gapLength * normalRadiusScale;
          const samples: boolean[] = [];
          const inwardSamples: boolean[] = [];
          const outwardSamples: boolean[] = [];
          for (let index = 0; index < 19; index++) {
            const angle = (8 + index * 4) * Math.PI / 180;
            const along = (endpoint === 'start' ? gap.start : gap.end)
              + alongDirection * Math.cos(angle) * alongRadius;
            const normal = gap.line + lineShift * gap.thickness
              + normalDirection * Math.sin(angle) * normalRadius;
            samples.push(hasInkNear(
              gap.axis === 'horizontal' ? along : normal,
              gap.axis === 'horizontal' ? normal : along,
            ));
            const radialDelta = Math.max(3, gap.thickness * 0.6);
            const inwardAlongRadius = Math.max(2, alongRadius - radialDelta);
            const inwardNormalRadius = Math.max(2, normalRadius - radialDelta);
            const inwardAlong = (endpoint === 'start' ? gap.start : gap.end)
              + alongDirection * Math.cos(angle) * inwardAlongRadius;
            const inwardNormal = gap.line + lineShift * gap.thickness
              + normalDirection * Math.sin(angle) * inwardNormalRadius;
            inwardSamples.push(hasInkNear(
              gap.axis === 'horizontal' ? inwardAlong : inwardNormal,
              gap.axis === 'horizontal' ? inwardNormal : inwardAlong,
            ));
            const outwardAlongRadius = alongRadius + radialDelta;
            const outwardNormalRadius = normalRadius + radialDelta;
            const outwardAlong = (endpoint === 'start' ? gap.start : gap.end)
              + alongDirection * Math.cos(angle) * outwardAlongRadius;
            const outwardNormal = gap.line + lineShift * gap.thickness
              + normalDirection * Math.sin(angle) * outwardNormalRadius;
            outwardSamples.push(hasInkNear(
              gap.axis === 'horizontal' ? outwardAlong : outwardNormal,
              gap.axis === 'horizontal' ? outwardNormal : outwardAlong,
            ));
          }
          const sectorHits = [
            samples.slice(0, 6).filter(Boolean).length,
            samples.slice(6, 13).filter(Boolean).length,
            samples.slice(13).filter(Boolean).length,
          ];
          let consecutive = 0, longestRun = 0;
          samples.forEach(sample => {
            consecutive = sample ? consecutive + 1 : 0;
            longestRun = Math.max(longestRun, consecutive);
          });
          const ratio = samples.filter(Boolean).length / samples.length;
          const inwardRatio = inwardSamples.filter(Boolean).length / inwardSamples.length;
          const outwardRatio = outwardSamples.filter(Boolean).length / outwardSamples.length;
          if (ratio < 0.76 || longestRun < 9
            // The first samples sit immediately beside the jamb and can be
            // erased with the wall face during OCR cleanup. The middle and
            // outer arc sectors remain strict and must still be continuous.
            || sectorHits[0] < 2 || sectorHits[1] < 4 || sectorHits[2] < 3
            // Solid corners and clusters can cover the nominal samples, but
            // unlike a thin swing arc they remain dark on the outer flank.
            || outwardRatio > 0.62 || ratio - outwardRatio < 0.18
            || (requireThinRadialProfile && (inwardRatio > 0.62
              || ratio - inwardRatio < 0.18))) continue;
          if (!best || ratio > best.ratio || (ratio === best.ratio && longestRun > best.run)) {
            best = { endpoint, normal: normalDirection, ratio, run: longestRun };
          }
          }
        }
      }
    }
  }
  if (!best) return { detected: false, isFlipped: false, facingFlipped: false, endpointCount: 0, confidence: 0 };
  return {
    detected: true,
    isFlipped: best.endpoint === 'end',
    facingFlipped: gap.axis === 'horizontal' ? best.normal < 0 : best.normal > 0,
    endpointCount: 1,
    confidence: clamp(0.72 + best.ratio * 0.18 + best.run / 190, 0, 0.94),
    arcOnly: true,
    arcEvidence: true,
    arcConfirmed: true,
  };
};

const detectBestDoorSwing = (
  gap: PixelGap,
  darkMask: Uint8Array,
  width: number,
  height: number,
  preferThinLeaf = false,
) => {
  const leafStrokeFactor = preferThinLeaf ? 0.45 : 0.65;
  const leaf = detectDoorSwing(gap, darkMask, width, height, 1, leafStrokeFactor);
  const arc = detectDoorSwingArc(gap, darkMask, width, height);
  if (leaf.detected && leaf.endpointCount >= 2 && !arc.detected
    // A double-door aperture is visibly wider than the host-wall stroke.
    // This rejects compact paired fixture/window marks whose two curved
    // outlines can otherwise resemble two miniature swing arcs.
    && gap.end - gap.start >= gap.thickness * 4.2) {
    // A true double swing uses two half-width leaves/arcs sharing the centre
    // of one hosted gap. Validate an arc from both jambs; the two leaf strokes
    // alone are intentionally insufficient because fixtures can mimic them.
    const halfArcScales = [0.42, 0.5, 0.58];
    const startArc = detectDoorSwingArc(
      gap,
      darkMask,
      width,
      height,
      { endpoint: 'start', hingeOffset: 0 },
      halfArcScales,
    );
    const endArc = detectDoorSwingArc(
      gap,
      darkMask,
      width,
      height,
      { endpoint: 'end', hingeOffset: 0 },
      halfArcScales,
    );
    if (startArc.detected && endArc.detected
      && startArc.facingFlipped === endArc.facingFlipped) {
      return {
        ...leaf,
        confidence: Math.min(leaf.confidence, startArc.confidence, endArc.confidence),
        arcConfirmed: true,
        arcEvidence: true,
        doubleArcConfirmed: true,
      };
    }
  }
  if (leaf.detected && arc.detected
    && leaf.isFlipped === arc.isFlipped
    && leaf.facingFlipped === arc.facingFlipped) {
    return {
      ...leaf,
      confidence: Math.max(leaf.confidence, arc.confidence),
      arcConfirmed: true,
      arcEvidence: true,
    };
  }
  const centered = leaf.confidence >= arc.confidence ? leaf : arc;
  const centeredWithArc = { ...centered, arcEvidence: arc.detected || centered.arcOnly || centered.arcConfirmed };
  if (centered.detected) return centeredWithArc;
  if (gap.end - gap.start > gap.thickness * 8) return centeredWithArc;

  // Raster wall-band merging can stop a few pixels before the actual hinge.
  // Search farther only when a straight leaf is found, then require a matching
  // jamb-centred quarter-circle at that exact offset. Neither dimensions nor a
  // bare hosted gap can activate this recovery.
  const offsetLeaf = detectDoorSwing(gap, darkMask, width, height, 2, leafStrokeFactor);
  const hingeOffset = offsetLeaf.hingeOffset || 0;
  const minimumOffset = Math.max(2, Math.ceil(gap.thickness));
  if (!offsetLeaf.detected || Math.abs(hingeOffset) <= minimumOffset) return centeredWithArc;
  const offsetArc = detectDoorSwingArc(gap, darkMask, width, height, {
    endpoint: offsetLeaf.isFlipped ? 'end' : 'start',
    hingeOffset,
  });
  if (!offsetArc.detected) return centeredWithArc;
  return {
    ...offsetLeaf,
    confidence: Math.min(offsetLeaf.confidence, offsetArc.confidence),
    arcConfirmed: true,
    arcEvidence: true,
    offsetHinge: true,
  };
};

/**
 * Weak drafting ink may recover a door only when a perpendicular leaf and its
 * matching jamb-centred quarter-circle agree. A faint line or arc by itself
 * remains insufficient, so this path cannot turn an empty wall gap into a
 * door from geometry or dimensions alone.
 */
const detectWeakInkDoorSwing = (
  gap: PixelGap,
  doorMask: Uint8Array,
  width: number,
  height: number,
): DoorSwingEvidence => {
  if (gap.end - gap.start > gap.thickness * 8) {
    return { detected: false, isFlipped: false, facingFlipped: false, endpointCount: 0, confidence: 0 };
  }
  const leaf = detectDoorSwing(gap, doorMask, width, height, 2);
  if (!leaf.detected || leaf.endpointCount !== 1
    || Math.abs(leaf.hingeOffset || 0) > Math.max(2, Math.ceil(gap.thickness))) {
    return { detected: false, isFlipped: false, facingFlipped: false, endpointCount: 0, confidence: 0 };
  }
  const arc = detectDoorSwingArc(gap, doorMask, width, height, {
    endpoint: leaf.isFlipped ? 'end' : 'start',
    hingeOffset: leaf.hingeOffset || 0,
  });
  if (!arc.detected || arc.isFlipped !== leaf.isFlipped || arc.facingFlipped !== leaf.facingFlipped) {
    return { detected: false, isFlipped: false, facingFlipped: false, endpointCount: 0, confidence: 0 };
  }
  return {
    ...leaf,
    confidence: Math.min(0.82, leaf.confidence, arc.confidence),
    arcConfirmed: true,
    offsetHinge: Math.abs(leaf.hingeOffset || 0) > Math.max(2, Math.ceil(gap.thickness)),
  };
};

/**
 * Recover a swing whose nearly closed leaf runs parallel to its host wall and
 * therefore prevents ordinary wall-gap discovery. This safeguard is
 * deliberately stricter than normal door classification: a short parallel
 * leaf, a hinge connector, a matching quarter-circle, and continuous host
 * wall support must all agree before an aperture is proposed.
 */
export const text4gClosedLeafFitsHostForTest = (
  leafLength: number,
  hostThickness: number,
) => leafLength <= hostThickness * 8;

export const text4gSwingQuadrantForTest = (
  axis: PixelGap['axis'],
  isFlipped: boolean,
  facingFlipped: boolean,
) => {
  const horizontal = axis === 'horizontal';
  const tangent = horizontal
    ? { x: isFlipped ? -1 : 1, y: 0 }
    : { x: 0, y: isFlipped ? -1 : 1 };
  const normal = horizontal
    ? { x: 0, y: facingFlipped ? -1 : 1 }
    : { x: facingFlipped ? 1 : -1, y: 0 };
  return { x: tangent.x + normal.x, y: tangent.y + normal.y };
};

const recoverClosedSwingDoorGaps = (
  hostSegments: PixelSegment[],
  symbolSegments: PixelSegment[],
  existingSymbolGaps: PixelGap[],
  typicalThickness: number,
  cleanDoorMask: Uint8Array,
  originalMask: Uint8Array,
  width: number,
  height: number,
) => {
  const candidates: PixelGap[] = [];
  const maximumLeafThickness = Math.max(3, typicalThickness * 0.7);
  const minimumNormalOffset = Math.max(2, typicalThickness * 0.35);
  // A near-closed leaf sits immediately beside its host wall face. Wider
  // parallel offsets are usually sanitary/furniture outlines beside a wall,
  // even when a curved fixture edge resembles a quarter-circle.
  const maximumNormalOffset = Math.max(minimumNormalOffset, typicalThickness * 1.4);
  const hostMargin = Math.max(4, typicalThickness * 1.25);

  symbolSegments.forEach(leaf => {
    const leafLength = leaf.end - leaf.start;
    if (leaf.thickness < 2
      || leaf.thickness > maximumLeafThickness
      || leafLength < typicalThickness * 2.5
      || leafLength > typicalThickness * 8) return;

    const hosts = hostSegments.filter(host => host.axis === leaf.axis
      && host.thickness >= typicalThickness * 0.45
      // A closed door leaf is a separate symbol stroke, not one of the host
      // wall's faces or centre strokes. Keeping it materially thinner than
      // the wall prevents solid junctions from manufacturing swing evidence.
      && leaf.thickness <= Math.max(3, host.thickness * 0.42)
      && leafLength >= host.thickness * 2.8
      // A near-closed leaf remains door-width relative to its own host. Very
      // long thin fixture/partition edges beside an under-extracted wall are
      // not allowed to borrow a loose quarter-circle from nearby sanitary ink.
      && text4gClosedLeafFitsHostForTest(leafLength, host.thickness)
      && Math.min(host.end, leaf.end) - Math.max(host.start, leaf.start) >= leafLength * 0.55
      && (Math.abs(host.line - leaf.line) <= Math.max(1, typicalThickness * 0.2)
        || Math.abs(host.line - leaf.line) >= minimumNormalOffset)
      && Math.abs(host.line - leaf.line) <= Math.min(
        maximumNormalOffset,
        Math.max(minimumNormalOffset, host.thickness * 1.4),
      ));

    hosts.forEach(host => {
      const gap: PixelGap = {
        axis: host.axis,
        line: host.line,
        start: leaf.start,
        end: leaf.end,
        thickness: host.thickness,
      };
      // A real nearly-closed door leaf still spans several host-wall strokes.
      // Shorter parallel marks are commonly sanitary fittings or furniture
      // outlines whose curved edges can otherwise imitate a hosted swing arc.
      if (gap.end - gap.start < gap.thickness * 4.5) return;
      const beforeSupport = gap.axis === 'horizontal'
        ? lineDarkSupport(originalMask, width, height,
          { x: gap.start - hostMargin, y: host.line }, { x: gap.start - 1, y: host.line }, 1)
        : lineDarkSupport(originalMask, width, height,
          { x: host.line, y: gap.start - hostMargin }, { x: host.line, y: gap.start - 1 }, 1);
      const afterSupport = gap.axis === 'horizontal'
        ? lineDarkSupport(originalMask, width, height,
          { x: gap.end + 1, y: host.line }, { x: gap.end + hostMargin, y: host.line }, 1)
        : lineDarkSupport(originalMask, width, height,
          { x: host.line, y: gap.end + 1 }, { x: host.line, y: gap.end + hostMargin }, 1);
      const perpendicularJambSupport = (along: number) => gap.axis === 'horizontal'
        ? Math.max(
          lineDarkSupport(originalMask, width, height,
            { x: along, y: host.line - hostMargin }, { x: along, y: host.line - 1 }, 1),
          lineDarkSupport(originalMask, width, height,
            { x: along, y: host.line + 1 }, { x: along, y: host.line + hostMargin }, 1),
        )
        : Math.max(
          lineDarkSupport(originalMask, width, height,
            { x: host.line - hostMargin, y: along }, { x: host.line - 1, y: along }, 1),
          lineDarkSupport(originalMask, width, height,
            { x: host.line + 1, y: along }, { x: host.line + hostMargin, y: along }, 1),
        );
      // A closed leaf may begin at a perpendicular corner return rather than
      // between two collinear wall runs. In either topology the opposite jamb
      // and the host continuation must both be raster-supported.
      if ((beforeSupport < 0.72 && perpendicularJambSupport(gap.start) < 0.72)
        || (afterSupport < 0.72 && perpendicularJambSupport(gap.end) < 0.72)
        || Math.max(beforeSupport, afterSupport) < 0.72) return;
      const ink = wallBandInkRatio(gap, originalMask, width, height, typicalThickness);
      if (ink < 0.52) return;
      const alignedClosedLeaf = Math.abs(host.line - leaf.line) <= Math.max(1, typicalThickness * 0.2);
      const cleanHostedArc = detectHostedDoorArc(gap, cleanDoorMask, width, height, true, true);
      const originalHostedArc = detectHostedDoorArc(gap, originalMask, width, height, true, true);
      const hostedArc = originalHostedArc.confidence > cleanHostedArc.confidence
        ? originalHostedArc
        : cleanHostedArc;
      const cleanLooseArc = detectDoorSwingArc(gap, cleanDoorMask, width, height);
      const originalLooseArc = detectDoorSwingArc(gap, originalMask, width, height);
      const looseArc = originalLooseArc.confidence > cleanLooseArc.confidence
        ? originalLooseArc
        : cleanLooseArc;
      const arc = hostedArc.detected ? hostedArc : looseArc;
      if (!arc.detected) return;
      // The loose sampler is retained only for wide, unmistakable near-closed
      // sweeps such as the antialiased regression fixture. Compact fixture
      // bowls and sink rims can match a few quarter-circle samples, but their
      // span is too short relative to the host-wall stroke.
      if (!hostedArc.detected && gap.end - gap.start < gap.thickness * 5) return;
      if (!alignedClosedLeaf) {
        const leafSide = leaf.line < host.line ? -1 : 1;
        const expectedFacing = gap.axis === 'horizontal' ? leafSide < 0 : leafSide > 0;
        if (arc.facingFlipped !== expectedFacing) return;
      }

      const hingeAlong = arc.isFlipped ? gap.end : gap.start;
      const hingeConnector = alignedClosedLeaf ? 1 : gap.axis === 'horizontal'
        ? lineDarkSupport(cleanDoorMask, width, height,
          { x: hingeAlong, y: host.line }, { x: hingeAlong, y: leaf.line }, 1)
        : lineDarkSupport(cleanDoorMask, width, height,
          { x: host.line, y: hingeAlong }, { x: leaf.line, y: hingeAlong }, 1);
      if (hingeConnector < 0.72) return;

      gap.closedSwingEvidence = {
        ...arc,
        arcOnly: false,
        arcConfirmed: true,
        closedLeaf: true,
        confidence: Math.min(0.86, Math.max(0.82, arc.confidence)),
      };
      const existingDuplicate = existingSymbolGaps.some(existing => {
        if (existing.axis === gap.axis) {
          if (Math.abs(existing.line - gap.line) > typicalThickness * 1.5) return false;
          const overlap = Math.min(existing.end, gap.end) - Math.max(existing.start, gap.start);
          const shorter = Math.min(existing.end - existing.start, gap.end - gap.start);
          return overlap > 0 && overlap / Math.max(1, shorter) >= 0.45;
        }
        const intersectionAlongGap = existing.line;
        const intersectionAlongExisting = gap.line;
        const gapEndpointDistance = Math.min(
          Math.abs(intersectionAlongGap - gap.start),
          Math.abs(intersectionAlongGap - gap.end),
        );
        const existingEndpointDistance = Math.min(
          Math.abs(intersectionAlongExisting - existing.start),
          Math.abs(intersectionAlongExisting - existing.end),
        );
        const junctionTolerance = Math.max(
          typicalThickness * 1.75,
          gap.thickness * 1.5,
          existing.thickness * 1.5,
        );
        return gapEndpointDistance <= junctionTolerance
          && existingEndpointDistance <= junctionTolerance;
      });
      // One raster swing can be interpreted from both its real hosted wall
      // and the perpendicular leaf. Prefer the already evidenced ordinary
      // host and do not duplicate the same symbol as a closed swing.
      if (existingDuplicate) return;
      candidates.push(gap);
    });
  });
  return deduplicatePixelGaps(candidates, typicalThickness);
};

/**
 * A short wall return beside a door can be almost as deep as it is long, so
 * the ordinary wall-band filter correctly treats it as ambiguous compact ink.
 * Recover that return only when a continuous swing arc starts at its free end,
 * the far jamb has raster wall support, and that support reaches an existing
 * perpendicular structural wall. This restores the host wall and door as one
 * unit without admitting cabinets, columns, or isolated compact rectangles.
 */
const recoverOneSidedSwingDoorHosts = (
  compactSegments: PixelSegment[],
  structuralSegments: PixelSegment[],
  doorSymbolSegments: PixelSegment[],
  typicalThickness: number,
  cleanDoorMask: Uint8Array,
  originalDoorMask: Uint8Array,
  originalDarkMask: Uint8Array,
  width: number,
  height: number,
) => {
  const recoveredSegments: PixelSegment[] = [];
  const recoveredGaps: PixelGap[] = [];
  const minimumGap = Math.max(14, typicalThickness * 2.8);
  const maximumGap = Math.max(minimumGap + 2, typicalThickness * 10);
  const step = Math.max(2, Math.round(typicalThickness * 0.3));
  const spanTolerance = Math.max(3, typicalThickness * 1.5);
  const supportRadius = Math.max(2, Math.round(typicalThickness * 0.65));

  compactSegments.forEach(seed => {
    const seedLength = seed.end - seed.start;
    if (seedLength < Math.max(12, seed.thickness * 1.05)
      || seedLength > typicalThickness * 14
      || seed.thickness < typicalThickness * 0.65) return;

    for (const endpoint of ['start', 'end'] as const) {
      const direction = endpoint === 'start' ? -1 : 1;
      const hinge = seed[endpoint];
      let best: { gap: PixelGap; arc: DoorSwingEvidence; bridgeEnd: number; score: number } | undefined;

      // The far jamb is normally the start/end of a longer collinear wall.
      // The compact return is absent from the ordinary structural set, so
      // enumerate that directly before trying the older perpendicular-return
      // recovery below. A continuous hosted swing arc is still mandatory.
      structuralSegments.filter(target => target.axis === seed.axis
        && Math.abs(target.line - seed.line) <= typicalThickness * 1.5
        && target !== seed).forEach(target => {
        const targetJamb = direction > 0 ? target.start : target.end;
        const gapLength = (targetJamb - hinge) * direction;
        if (gapLength < minimumGap || gapLength > maximumGap) return;
        const gap: PixelGap = {
          axis: seed.axis,
          line: (seed.line + target.line) / 2,
          start: Math.min(hinge, targetJamb),
          end: Math.max(hinge, targetJamb),
          thickness: typicalThickness,
        };
        const cleanArc = detectHostedDoorArc(gap, cleanDoorMask, width, height, true, true);
        const originalArc = detectHostedDoorArc(gap, originalDoorMask, width, height, true, true);
        const arc = originalArc.confidence > cleanArc.confidence ? originalArc : cleanArc;
        if (!arc.detected || !arc.arcConfirmed) return;
        const alignmentPenalty = Math.abs(target.line - seed.line) / Math.max(1, typicalThickness * 100);
        const score = arc.confidence + 0.12 - alignmentPenalty;
        if (!best || score > best.score) best = { gap, arc, bridgeEnd: targetJamb, score };
      });

      for (let gapLength = minimumGap; gapLength <= maximumGap; gapLength += step) {
        const farJamb = hinge + direction * gapLength;
        if (farJamb < 0 || farJamb >= (seed.axis === 'horizontal' ? width : height)) continue;
        const gap: PixelGap = {
          axis: seed.axis,
          line: seed.line,
          start: Math.min(hinge, farJamb),
          end: Math.max(hinge, farJamb),
          thickness: typicalThickness,
        };
        const targets = structuralSegments.filter(target => target.axis !== seed.axis
          && seed.line >= target.start - spanTolerance
          && seed.line <= target.end + spanTolerance)
          .map(target => ({ target, distance: (target.line - farJamb) * direction }))
          .filter(item => item.distance >= -typicalThickness * 0.75
            && item.distance <= typicalThickness * 8)
          .sort((first, second) => Math.abs(first.distance) - Math.abs(second.distance));
        const target = targets[0];
        if (!target) continue;
        const support = darkSupportAlongGap(
          seed.axis,
          seed.line,
          farJamb,
          target.target.line,
          originalDarkMask,
          width,
          height,
          supportRadius,
        );
        if (support < 0.58) continue;
        // Confirm structural anchoring before the expensive polar arc scan.
        // The previous order sampled two complete masks for every hypothetical
        // gap length—even when no perpendicular wall could host the far jamb.
        const cleanArc = detectHostedDoorArc(gap, cleanDoorMask, width, height, true, true);
        const originalArc = detectHostedDoorArc(gap, originalDoorMask, width, height, true, true);
        const arc = originalArc.confidence > cleanArc.confidence ? originalArc : cleanArc;
        if (!arc.detected || !arc.arcConfirmed) continue;
        const score = arc.confidence + support * 0.12 - Math.abs(target.distance) / Math.max(1, typicalThickness * 100);
        if (!best || score > best.score) best = { gap, arc, bridgeEnd: target.target.line, score };
      }
      if (!best) continue;
      const explicitLeaf = findExplicitPerpendicularSwingLeaf(
        best.gap,
        { ...best.arc, arcConfirmed: true },
        doorSymbolSegments,
        typicalThickness,
      );
      const cleanHostedArc = detectHostedDoorArc(best.gap, cleanDoorMask, width, height, true, true);
      const originalHostedArc = detectHostedDoorArc(best.gap, originalDoorMask, width, height, true, true);
      const offsetSwing = explicitLeaf
        ? undefined
        : findExplicitHostedOffsetSwing(
          best.gap,
          cleanHostedArc,
          originalHostedArc,
          doorSymbolSegments,
          typicalThickness,
        );
      if (!explicitLeaf && !offsetSwing) continue;
      best.gap.closedSwingEvidence = {
        ...(offsetSwing || best.arc),
        arcOnly: false,
        arcConfirmed: true,
        confidence: Math.max(0.88, (offsetSwing || best.arc).confidence),
      };
      best.gap.jambFaceClampEvidence = true;
      recoveredGaps.push(best.gap);
      recoveredSegments.push({
        axis: seed.axis,
        line: seed.line,
        start: Math.min(seed.start, seed.end, best.bridgeEnd),
        end: Math.max(seed.start, seed.end, best.bridgeEnd),
        thickness: Math.max(typicalThickness, Math.min(seed.thickness, typicalThickness * 2.2)),
      });
    }
  });

  return {
    segments: deduplicateParallelSegments(recoveredSegments, Math.max(2, typicalThickness * 0.35)),
    gaps: deduplicatePixelGaps(recoveredGaps, typicalThickness),
  };
};

/**
 * Door arcs are drafted from a physical wall face, while band extraction
 * stores the host centreline. Recover a missed endpoint swing only when the
 * same face-level arc survives both raster masks and a separate perpendicular
 * leaf reaches the original host. This does not relax centreline detection or
 * admit an arc by itself.
 */
const findPhysicalWallFaceSwing = (
  gap: PixelGap,
  doorSymbolSegments: PixelSegment[],
  typicalThickness: number,
  cleanDoorMask: Uint8Array,
  originalDoorMask: Uint8Array,
  width: number,
  height: number,
) => {
  const gapLength = gap.end - gap.start;
  const hostReachTolerance = Math.max(3, typicalThickness * 0.75);
  const maximumLeafThickness = Math.max(3, typicalThickness * 0.78);
  const leaves = doorSymbolSegments.filter(leaf => leaf.axis !== gap.axis
    && leaf.thickness >= 1
    && leaf.thickness <= maximumLeafThickness
    && leaf.thickness <= Math.max(3, gap.thickness * 0.8)
    && leaf.line >= gap.start - typicalThickness * 1.2
    && leaf.line <= gap.end + typicalThickness * 1.2
    && leaf.start <= gap.line + hostReachTolerance
    && leaf.end >= gap.line - hostReachTolerance
    && leaf.end - leaf.start >= gapLength * 0.3
    && (leaf.thickness >= 2 || leaf.end - leaf.start >= gapLength * 0.34));
  const faceOffsets = Array.from(new Set([0, 0.6, 0.8, 0.9, 1, 1.2]
    .map(factor => Math.round(typicalThickness * factor))));
  let best: { swing: DoorSwingEvidence; score: number; leaf: PixelSegment } | undefined;
  for (const faceDirection of [-1, 1] as const) {
    for (const faceOffset of faceOffsets) {
      const faceGap = { ...gap, line: gap.line + faceDirection * faceOffset };
      const cleanArc = detectHostedDoorArc(faceGap, cleanDoorMask, width, height, true, true);
      const originalArc = detectHostedDoorArc(faceGap, originalDoorMask, width, height, true, true);
      if (!cleanArc.detected || !originalArc.detected
        || cleanArc.isFlipped !== originalArc.isFlipped
        || cleanArc.facingFlipped !== originalArc.facingFlipped) continue;
      const hingeAlong = originalArc.isFlipped ? gap.end : gap.start;
      leaves.forEach(leaf => {
        if (leaf.start > faceGap.line + hostReachTolerance
          || leaf.end < faceGap.line - hostReachTolerance) return;
        if (Math.abs(leaf.line - hingeAlong) > typicalThickness * 1.2) return;
        const negativeReach = Math.max(0, faceGap.line - leaf.start);
        const positiveReach = Math.max(0, leaf.end - faceGap.line);
        const normalDirection: -1 | 1 = positiveReach >= negativeReach ? 1 : -1;
        const expectedFacing = gap.axis === 'horizontal'
          ? normalDirection < 0
          : normalDirection > 0;
        if (expectedFacing !== originalArc.facingFlipped) return;
        const confidence = Math.min(cleanArc.confidence, originalArc.confidence);
        const score = confidence
          - Math.abs(faceOffset - typicalThickness * 0.75) / Math.max(1, typicalThickness * 100)
          - Math.abs(leaf.line - hingeAlong) / Math.max(1, typicalThickness * 100);
        if (best && score <= best.score) return;
        best = {
          leaf,
          score,
          swing: {
            ...originalArc,
            endpointCount: 1,
            confidence: Math.max(0.88, confidence),
            arcOnly: false,
            arcConfirmed: true,
          },
        };
      });
    }
  }
  return best;
};

export const findText4gPhysicalWallFaceSwingForTest = (
  image: RasterImageData,
  gap: PixelGap,
  doorSymbolSegments: PixelSegment[],
  typicalThickness: number,
) => {
  const mask = createDoorEvidenceMask(image);
  return findPhysicalWallFaceSwing(
    gap,
    doorSymbolSegments,
    typicalThickness,
    mask,
    mask,
    image.width,
    image.height,
  )?.swing;
};

const recoverPhysicalWallFaceSwingHosts = (
  structuralSegments: PixelSegment[],
  existingGaps: PixelGap[],
  doorSymbolSegments: PixelSegment[],
  pixelScale: { x: number; y: number },
  typicalThickness: number,
  cleanDoorMask: Uint8Array,
  originalDoorMask: Uint8Array,
  originalDarkMask: Uint8Array,
  width: number,
  height: number,
  observations: FloorplanTextObservation[],
) => {
  const recoveredSegments: PixelSegment[] = [];
  const recoveredGaps: PixelGap[] = [];

  structuralSegments.filter(seed => seed.end - seed.start >= typicalThickness * 2).forEach(seed => {
    const alongScale = seed.axis === 'horizontal' ? pixelScale.x : pixelScale.y;
    for (const endpoint of ['start', 'end'] as const) {
      const direction = endpoint === 'start' ? -1 : 1;
      const jamb = seed[endpoint];
      const rawCandidates = doorSymbolSegments.filter(leaf => leaf.axis !== seed.axis)
        .map(leaf => ({
          leaf,
          distance: (leaf.line - jamb) * direction,
          anchor: structuralSegments.filter(anchor => anchor.axis !== seed.axis
            && Math.abs(anchor.line - leaf.line) <= typicalThickness * 1.5
            && seed.line >= anchor.start - typicalThickness
            && seed.line <= anchor.end + typicalThickness)
            .sort((first, second) => Math.abs(first.line - leaf.line) - Math.abs(second.line - leaf.line))[0],
        }));
      const candidates = rawCandidates.filter(item => item.distance * alongScale >= 0.45
          && item.distance * alongScale <= 1.4
          && item.anchor
          && item.leaf.end - item.leaf.start >= item.distance * 0.3);

      let best: { gap: PixelGap; swing: DoorSwingEvidence; score: number; bridgeEnd: number } | undefined;
      candidates.forEach(({ leaf }) => {
        const gap: PixelGap = {
          axis: seed.axis,
          line: seed.line,
          start: Math.min(jamb, leaf.line),
          end: Math.max(jamb, leaf.line),
          thickness: Math.max(seed.thickness, typicalThickness * 0.75),
        };
        const duplicatesExistingGap = existingGaps.some(existing => {
          if (existing.axis !== gap.axis || Math.abs(existing.line - gap.line) > typicalThickness * 1.5) return false;
          const overlap = Math.min(existing.end, gap.end) - Math.max(existing.start, gap.start);
          const shorter = Math.min(existing.end - existing.start, gap.end - gap.start);
          return overlap > 0 && overlap / Math.max(1, shorter) >= 0.55;
        });
        if (duplicatesExistingGap) return;
        if (gapOverlapsRecognizedText(gap, observations, typicalThickness)) return;
        const faceSwing = findPhysicalWallFaceSwing(
          gap, doorSymbolSegments, typicalThickness,
          cleanDoorMask, originalDoorMask, width, height,
        );
        if (!faceSwing || (best && faceSwing.score <= best.score)) return;
        best = { gap, bridgeEnd: faceSwing.leaf.line, score: faceSwing.score, swing: faceSwing.swing };
      });
      if (!best) continue;
      best.gap.validatedEndpointSwingEvidence = best.swing;
      best.gap.physicalWallFaceSwingEvidence = true;
      best.gap.physicalWallFaceLeafLine = best.bridgeEnd;
      best.gap.jambFaceClampEvidence = true;
      recoveredGaps.push(best.gap);
      recoveredSegments.push({
        axis: seed.axis,
        line: seed.line,
        start: Math.min(seed.start, best.bridgeEnd),
        end: Math.max(seed.end, best.bridgeEnd),
        thickness: seed.thickness,
      });
    }
  });

  return {
    segments: deduplicateParallelSegments(recoveredSegments, Math.max(2, typicalThickness * 0.35)),
    gaps: deduplicatePixelGaps(recoveredGaps, typicalThickness),
  };
};

/**
 * Recover a long open-plan separator that has one short wall return and a
 * perpendicular host at the far jamb. Unlike door recovery, this path has no
 * symbol fallback: two OCR room tags must lie on opposite sides of the blank
 * band, the return's other end must be structurally anchored, and the gap
 * itself must contain very little wall-width ink.
 */
const recoverOpposedRoomOpenPassages = (
  segments: PixelSegment[],
  pixelScale: { x: number; y: number },
  typicalThickness: number,
  originalDarkMask: Uint8Array,
  width: number,
  height: number,
  roomTextTags: RoomTextTag[],
) => {
  if (roomTextTags.length < 2) return [];
  const tolerance = Math.max(3, typicalThickness * 1.8);
  const result: PixelGap[] = [];
  const endpointAnchored = (segment: PixelSegment, endpoint: number) => segments.some(other =>
    other.axis !== segment.axis
    && Math.abs(other.line - endpoint) <= tolerance
    && segment.line >= other.start - tolerance
    && segment.line <= other.end + tolerance);
  const opposedTags = (gap: PixelGap) => {
    const alongPadding = gap.axis === 'horizontal'
      ? 0.7 / Math.max(1e-6, pixelScale.x)
      : 0.7 / Math.max(1e-6, pixelScale.y);
    const reach = Math.max(width, height) * 0.43;
    const nearby = roomTextTags.filter(tag => {
      const along = gap.axis === 'horizontal' ? tag.x : tag.y;
      const normal = gap.axis === 'horizontal' ? tag.y - gap.line : tag.x - gap.line;
      return along >= gap.start - alongPadding && along <= gap.end + alongPadding
        && Math.abs(normal) <= reach;
    });
    return nearby.some(first => nearby.some(second => first !== second
      && (gap.axis === 'horizontal' ? first.y - gap.line : first.x - gap.line)
        * (gap.axis === 'horizontal' ? second.y - gap.line : second.x - gap.line) < 0));
  };

  segments.forEach(seed => {
    if (seed.end - seed.start < typicalThickness * 5) return;
    const alongScale = seed.axis === 'horizontal' ? pixelScale.x : pixelScale.y;
    const minimumGap = Math.max(typicalThickness * 4, 0.9 / Math.max(1e-6, alongScale));
    const maximumGap = Math.min(Math.max(width, height) * 0.34, 3.6 / Math.max(1e-6, alongScale));
    for (const endpoint of ['start', 'end'] as const) {
      const otherEndpoint = endpoint === 'start' ? seed.end : seed.start;
      if (!endpointAnchored(seed, otherEndpoint) || endpointAnchored(seed, seed[endpoint])) continue;
      const direction = endpoint === 'start' ? -1 : 1;
      const target = segments.filter(other => other.axis !== seed.axis
        && seed.line >= other.start - tolerance
        && seed.line <= other.end + tolerance)
        .map(other => ({ other, distance: (other.line - seed[endpoint]) * direction }))
        .filter(item => item.distance >= minimumGap && item.distance <= maximumGap)
        .sort((first, second) => first.distance - second.distance)[0];
      if (!target) continue;
      const gap: PixelGap = {
        axis: seed.axis,
        line: seed.line,
        start: Math.min(seed[endpoint], target.other.line),
        end: Math.max(seed[endpoint], target.other.line),
        thickness: typicalThickness,
        openPassageEvidence: true,
      };
      if (!opposedTags(gap)
        || wallBandInkRatio(gap, originalDarkMask, width, height, typicalThickness) >= 0.18) continue;
      result.push(gap);
    }
  });
  return deduplicatePixelGaps(result, typicalThickness);
};

/**
 * Sliding doors are deliberately recognized only from the characteristic two
 * staggered, partial-width panels on opposite sides of the wall axis. A full
 * parallel stroke remains a window-frame signal, preventing wide windows from
 * being promoted to doors merely because of their size.
 */
interface ParallelDoorEvidence {
  detected: boolean;
  normalDirection: -1 | 1;
  confidence: number;
}

const detectSlidingDoorPanels = (
  gap: PixelGap,
  darkMask: Uint8Array,
  width: number,
  height: number,
): ParallelDoorEvidence => {
  const gapLength = gap.end - gap.start;
  if (gapLength < 12) return { detected: false, normalDirection: 1, confidence: 0 };
  const margin = Math.max(1, Math.round(gap.thickness * 0.15));
  const from = Math.ceil(gap.start + margin);
  const to = Math.floor(gap.end - margin);
  const minimumPanel = gapLength * 0.28;
  const maximumPanel = gapLength * 0.78;
  const normalStart = 1;
  const normalEnd = Math.max(normalStart, Math.ceil(gap.thickness * 1.8));
  const runs: Array<{ start: number; end: number; offset: number }> = [];

  for (const side of [-1, 1] as const) {
    for (let distance = normalStart; distance <= normalEnd; distance++) {
      let runStart = -1;
      let lastDark = -1;
      for (let along = from; along <= to + 2; along++) {
        let dark = false;
        if (along <= to) {
          for (let antialias = -1; antialias <= 1; antialias++) {
            const normal = Math.round(gap.line + side * distance + antialias);
            const x = gap.axis === 'horizontal' ? along : normal;
            const y = gap.axis === 'horizontal' ? normal : along;
            if (x >= 0 && y >= 0 && x < width && y < height && darkMask[y * width + x]) {
              dark = true;
              break;
            }
          }
        }
        if (dark) {
          if (runStart < 0) runStart = along;
          lastDark = along;
        }
        if ((!dark && lastDark >= 0 && along - lastDark > 1) || along > to) {
          const runEnd = lastDark;
          const length = runEnd - runStart + 1;
          if (length >= minimumPanel && length <= maximumPanel) runs.push({ start: runStart, end: runEnd, offset: side * distance });
          runStart = -1;
          lastDark = -1;
        }
      }
    }
  }

  let best: { first: (typeof runs)[number]; second: (typeof runs)[number]; score: number } | undefined;
  for (let firstIndex = 0; firstIndex < runs.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < runs.length; secondIndex++) {
      const first = runs[firstIndex], second = runs[secondIndex];
      if (Math.abs(first.offset - second.offset) < Math.max(2, gap.thickness * 0.22)) continue;
      // The two sliding panels occupy opposite faces of the host wall. Two
      // runs on the same side are normally glazing bars or anti-aliasing.
      if (Math.sign(first.offset) === Math.sign(second.offset)) continue;
      const firstCenter = (first.start + first.end) / 2;
      const secondCenter = (second.start + second.end) / 2;
      const union = Math.max(first.end, second.end) - Math.min(first.start, second.start) + 1;
      const overlap = Math.max(0, Math.min(first.end, second.end) - Math.max(first.start, second.start) + 1);
      const shorter = Math.min(first.end - first.start + 1, second.end - second.start + 1);
      const longer = Math.max(first.end - first.start + 1, second.end - second.start + 1);
      const overlapRatio = overlap / Math.max(1, shorter);
      const panelLengthBalance = shorter / Math.max(1, longer);
      const jambAnchored = (first.start <= gap.start + gapLength * 0.18
        && second.end >= gap.end - gapLength * 0.18)
        || (second.start <= gap.start + gapLength * 0.18
          && first.end >= gap.end - gapLength * 0.18);
      // A sliding-door glyph is two similarly sized, staggered leaves. A long
      // glazing frame plus one short mullion can otherwise satisfy the offset
      // and coverage tests even though it is a window.
      const qualifies = Math.abs(firstCenter - secondCenter) >= gapLength * 0.08
        && union >= gapLength * 0.72
        && overlapRatio >= 0.05
        && overlapRatio <= 0.65
        && panelLengthBalance >= 0.68
        && jambAnchored;
      if (!qualifies) continue;
      const score = union / gapLength + Math.abs(firstCenter - secondCenter) / gapLength;
      if (!best || score > best.score) best = { first, second, score };
    }
  }
  if (!best) return { detected: false, normalDirection: 1, confidence: 0 };
  const averageOffset = (best.first.offset + best.second.offset) / 2;
  return {
    detected: true,
    normalDirection: averageOffset < 0 ? -1 : 1,
    confidence: 0.88,
  };
};

/**
 * Long retained walls must not enter the broad compact-return recovery: doing
 * so can bridge unrelated collinear wall components before enclosure flood.
 * This path considers only the wall's immediate endpoint and the nearest
 * transverse structural jamb. It adds a local host span only after a single
 * leaf and its matching quarter-circle arc are both raster-confirmed.
 */
const recoverLongWallEndpointSwingDoorHosts = (
  structuralSegments: PixelSegment[],
  doorSymbolSegments: PixelSegment[],
  pixelScale: { x: number; y: number },
  typicalThickness: number,
  cleanDoorMask: Uint8Array,
  originalDoorMask: Uint8Array,
  width: number,
  height: number,
  observations: FloorplanTextObservation[],
  eligibleRecoveredHosts?: PixelGap[],
) => {
  const recoveredSegments: PixelSegment[] = [];
  const recoveredGaps: PixelGap[] = [];
  const spanTolerance = Math.max(3, typicalThickness * 1.5);
  const minimumWidthMeters = 0.45;
  const maximumWidthMeters = 1.4;

  structuralSegments.filter(seed => seed.end - seed.start > typicalThickness * 14
    && (!eligibleRecoveredHosts || eligibleRecoveredHosts.some(host => host.axis === seed.axis
      && Math.abs(host.line - seed.line) <= typicalThickness
      && host.start >= seed.start - typicalThickness
      && host.end <= seed.end + typicalThickness))).forEach(seed => {
    const alongScale = seed.axis === 'horizontal' ? pixelScale.x : pixelScale.y;
    for (const endpoint of ['start', 'end'] as const) {
      const direction = endpoint === 'start' ? -1 : 1;
      const hostEndpoint = seed[endpoint];
      // Do not jump over a nearer transverse wall. The nearest raster wall in
      // the outward direction must itself define a door-sized clear span.
      const nearestJamb = structuralSegments.filter(target => target.axis !== seed.axis
        && seed.line >= target.start - spanTolerance
        && seed.line <= target.end + spanTolerance)
        .map(target => ({ target, distance: (target.line - hostEndpoint) * direction }))
        .filter(item => item.distance > typicalThickness * 0.5
          && item.distance * alongScale <= maximumWidthMeters)
        .sort((first, second) => first.distance - second.distance)[0];
      if (!nearestJamb) continue;
      const widthMeters = nearestJamb.distance * alongScale;
      if (widthMeters < minimumWidthMeters) continue;

      const gap: PixelGap = {
        axis: seed.axis,
        line: seed.line,
        start: Math.min(hostEndpoint, nearestJamb.target.line),
        end: Math.max(hostEndpoint, nearestJamb.target.line),
        thickness: typicalThickness,
      };
      if (gapOverlapsRecognizedText(gap, observations, typicalThickness)) continue;
      const cleanSwing = detectBestDoorSwing(gap, cleanDoorMask, width, height);
      const originalSwing = detectBestDoorSwing(gap, originalDoorMask, width, height);
      const swing = originalSwing.confidence > cleanSwing.confidence ? originalSwing : cleanSwing;
      const explicitSwingLeaf = findExplicitPerpendicularSwingLeaf(
        gap,
        swing,
        doorSymbolSegments,
        typicalThickness,
      );
      const cleanHostedArc = detectHostedDoorArc(gap, cleanDoorMask, width, height, true, true);
      const originalHostedArc = detectHostedDoorArc(gap, originalDoorMask, width, height, true, true);
      const hostedOffsetSwing = findExplicitHostedOffsetSwing(
        gap,
        cleanHostedArc,
        originalHostedArc,
        doorSymbolSegments,
        typicalThickness,
      );
      let strictSwing = swing.detected
        && swing.endpointCount === 1
        && swing.arcConfirmed
        && !swing.arcOnly
        && swing.confidence >= 0.8
        && Math.abs(swing.hingeOffset || 0) <= typicalThickness * 2.4
        && explicitSwingLeaf
        ? swing
        : hostedOffsetSwing;
      // If band merging stopped before the visible hinge, require the same
      // continuous hosted arc in both masks. This admits the evidenced offset
      // leaf while preventing a nearby fixture stroke from moving the hinge.
      if (strictSwing && Math.abs(strictSwing.hingeOffset || 0) > typicalThickness * 1.35) {
        if (!cleanHostedArc.detected || !originalHostedArc.detected
          || cleanHostedArc.isFlipped !== strictSwing.isFlipped
          || originalHostedArc.isFlipped !== strictSwing.isFlipped
          || cleanHostedArc.facingFlipped !== strictSwing.facingFlipped
          || originalHostedArc.facingFlipped !== strictSwing.facingFlipped) {
          strictSwing = undefined;
        }
      }
      // A wall-centre candidate can cross both the real door leaf and the
      // opposite jamb, making a single door look like two perpendicular
      // endpoint strokes. Search only the physical wall faces, and accept
      // that ambiguity only when the same quarter-circle is independently
      // present in both the cleaned and original raster masks.
      let wallFaceSwing: DoorSwingEvidence | undefined;
      if (!strictSwing && swing.detected && swing.endpointCount >= 1 && swing.endpointCount <= 2 && !swing.arcConfirmed) {
        const startThickness = gap.start === nearestJamb.target.line
          ? nearestJamb.target.thickness
          : seed.thickness;
        const endThickness = gap.end === nearestJamb.target.line
          ? nearestJamb.target.thickness
          : seed.thickness;
        const startCandidates = [gap.start - startThickness / 2, gap.start, gap.start + startThickness / 2];
        const endCandidates = [gap.end - endThickness / 2, gap.end, gap.end + endThickness / 2];
        for (const normalDirection of [-1, 1] as const) {
          for (const start of startCandidates) {
            for (const end of endCandidates) {
              if (end - start < typicalThickness * 2.2) continue;
              const faceGap: PixelGap = {
                ...gap,
                line: gap.line + normalDirection * typicalThickness * 0.65,
                start,
                end,
              };
              // With two endpoint strokes, one stroke is often the opposite
              // jamb rather than a second leaf. Use the stricter continuous
              // hosted-arc profile so jamb/fixture ink cannot decide the
              // swing direction. A single evidenced endpoint can use the
              // ordinary quarter-circle sampler at the physical wall face.
              const cleanArc = swing.endpointCount === 2
                ? detectHostedDoorArc(faceGap, cleanDoorMask, width, height, true, true)
                : detectDoorSwingArc(faceGap, cleanDoorMask, width, height);
              const originalArc = swing.endpointCount === 2
                ? detectHostedDoorArc(faceGap, originalDoorMask, width, height, true, true)
                : detectDoorSwingArc(faceGap, originalDoorMask, width, height);
              if (!cleanArc.detected || !originalArc.detected
                || cleanArc.isFlipped !== originalArc.isFlipped
                || cleanArc.facingFlipped !== originalArc.facingFlipped) continue;
              const confidence = Math.min(swing.confidence, cleanArc.confidence, originalArc.confidence);
              if (confidence < 0.82 || (wallFaceSwing && confidence <= wallFaceSwing.confidence)) continue;
              wallFaceSwing = {
                ...originalArc,
                // With one leaf endpoint, that observed leaf is the hinge;
                // the wall-face arc supplies only the swing side. With two
                // ambiguous endpoint strokes, the stricter hosted arc owns
                // both orientation fields.
                isFlipped: swing.endpointCount === 1 ? swing.isFlipped : originalArc.isFlipped,
                endpointCount: 1,
                confidence,
                arcOnly: false,
                arcEvidence: true,
                arcConfirmed: true,
              };
            }
          }
        }
      }
      // Arc-only evidence remains insufficient. The wall-face exception above
      // still requires an independently visible leaf and matching arc.
      const validatedSwing = strictSwing || (wallFaceSwing
        && findExplicitPerpendicularSwingLeaf(
          gap,
          wallFaceSwing,
          doorSymbolSegments,
          typicalThickness,
        )
        ? wallFaceSwing
        : undefined);
      if (!validatedSwing) continue;

      gap.validatedEndpointSwingEvidence = {
        ...validatedSwing,
        arcConfirmed: true,
        confidence: Math.max(0.86, validatedSwing.confidence),
      };
      gap.jambFaceClampEvidence = true;
      recoveredGaps.push(gap);
      recoveredSegments.push({
        axis: seed.axis,
        line: seed.line,
        start: Math.min(seed.start, nearestJamb.target.line),
        end: Math.max(seed.end, nearestJamb.target.line),
        thickness: seed.thickness,
      });
    }
  });

  return {
    segments: deduplicateParallelSegments(recoveredSegments, Math.max(2, typicalThickness * 0.35)),
    gaps: deduplicatePixelGaps(recoveredGaps, typicalThickness),
  };
};

export const recoverText4gLongWallEndpointSwingHostsForTest = recoverLongWallEndpointSwingDoorHosts;

/**
 * A missing host can split a sliding glyph into two nearly end-to-end leaves.
 * Keep that looser signature out of ordinary aperture classification: it is
 * valid only inside the anchored missing-host recovery below.
 */
const detectEndToEndSlidingDoorPanels = (
  gap: PixelGap,
  darkMask: Uint8Array,
  width: number,
  height: number,
): ParallelDoorEvidence => {
  const gapLength = gap.end - gap.start;
  if (gapLength < 12) return { detected: false, normalDirection: 1, confidence: 0 };
  const margin = Math.max(1, Math.round(gap.thickness * 0.15));
  const from = Math.ceil(gap.start + margin);
  const to = Math.floor(gap.end - margin);
  const runs: Array<{ start: number; end: number; offset: number }> = [];
  const normalReach = Math.max(2, Math.ceil(gap.thickness * 1.8));
  for (const side of [-1, 1] as const) {
    for (let distance = 1; distance <= normalReach; distance++) {
      let runStart = -1, lastDark = -1;
      for (let along = from; along <= to + 2; along++) {
        let dark = false;
        if (along <= to) {
          for (let antialias = -1; antialias <= 1; antialias++) {
            const normal = Math.round(gap.line + side * distance + antialias);
            const x = gap.axis === 'horizontal' ? along : normal;
            const y = gap.axis === 'horizontal' ? normal : along;
            if (x >= 0 && y >= 0 && x < width && y < height && darkMask[y * width + x]) {
              dark = true;
              break;
            }
          }
        }
        if (dark) {
          if (runStart < 0) runStart = along;
          lastDark = along;
        }
        if ((!dark && lastDark >= 0 && along - lastDark > 1) || along > to) {
          const length = lastDark - runStart + 1;
          if (length >= gapLength * 0.26 && length <= gapLength * 0.78) {
            runs.push({ start: runStart, end: lastDark, offset: side * distance });
          }
          runStart = -1;
          lastDark = -1;
        }
      }
    }
  }
  let best: { score: number; direction: -1 | 1 } | undefined;
  for (let firstIndex = 0; firstIndex < runs.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < runs.length; secondIndex++) {
      const first = runs[firstIndex], second = runs[secondIndex];
      if (Math.sign(first.offset) === Math.sign(second.offset)) continue;
      if (Math.abs(first.offset - second.offset) < Math.max(2, gap.thickness * 0.22)) continue;
      const shorter = Math.min(first.end - first.start + 1, second.end - second.start + 1);
      const longer = Math.max(first.end - first.start + 1, second.end - second.start + 1);
      if (shorter / Math.max(1, longer) < 0.62) continue;
      const unionStart = Math.min(first.start, second.start);
      const unionEnd = Math.max(first.end, second.end);
      const union = unionEnd - unionStart + 1;
      if (union < gapLength * 0.76) continue;
      const separation = Math.max(0, Math.max(first.start, second.start) - Math.min(first.end, second.end) - 1);
      const overlap = Math.max(0, Math.min(first.end, second.end) - Math.max(first.start, second.start) + 1);
      if (separation > gapLength * 0.12 || overlap / Math.max(1, shorter) > 0.65) continue;
      const jambAnchored = (first.start <= gap.start + gapLength * 0.18
        && second.end >= gap.end - gapLength * 0.18)
        || (second.start <= gap.start + gapLength * 0.18
          && first.end >= gap.end - gapLength * 0.18);
      if (!jambAnchored) continue;
      const score = union / gapLength + (1 - separation / gapLength) * 0.2;
      if (!best || score > best.score) {
        best = { score, direction: (first.offset + second.offset) / 2 < 0 ? -1 : 1 };
      }
    }
  }
  return best
    ? { detected: true, normalDirection: best.direction, confidence: clamp(0.8 + best.score * 0.06, 0, 0.88) }
    : { detected: false, normalDirection: 1, confidence: 0 };
};

const lineDarkSupport = (
  darkMask: Uint8Array,
  width: number,
  height: number,
  a: PixelPoint,
  b: PixelPoint,
  radius = 1,
) => {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
  let supported = 0;
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    const x = Math.round(a.x + (b.x - a.x) * t);
    const y = Math.round(a.y + (b.y - a.y) * t);
    let dark = false;
    for (let oy = -radius; oy <= radius && !dark; oy++) {
      for (let ox = -radius; ox <= radius; ox++) {
        const px = x + ox, py = y + oy;
        if (px >= 0 && py >= 0 && px < width && py < height && darkMask[py * width + px]) {
          dark = true;
          break;
        }
      }
    }
    if (dark) supported++;
  }
  return supported / (steps + 1);
};

const detectFoldingDoor = (
  gap: PixelGap,
  darkMask: Uint8Array,
  width: number,
  height: number,
): ParallelDoorEvidence => {
  const gapLength = gap.end - gap.start;
  if (gapLength < 18) return { detected: false, normalDirection: 1, confidence: 0 };
  let best: { score: number; side: -1 | 1 } | undefined;
  for (const side of [-1, 1] as const) {
    for (const startInset of [0, 0.08, 0.16, 0.24, 0.32]) {
      for (const endInset of [0, 0.12, 0.24, 0.32]) {
        const alongStart = gap.start + gapLength * startInset;
        const alongEnd = gap.end - gapLength * endInset;
        if (alongEnd - alongStart < gapLength * 0.55) continue;
        for (const amplitudeFactor of [0.24, 0.32, 0.4, 0.5]) {
          const midpoint = (alongStart + alongEnd) / 2;
          const amplitude = gapLength * amplitudeFactor;
          const start = gap.axis === 'horizontal'
            ? { x: alongStart, y: gap.line }
            : { x: gap.line, y: alongStart };
          const apex = gap.axis === 'horizontal'
            ? { x: midpoint, y: gap.line + side * amplitude }
            : { x: gap.line + side * amplitude, y: midpoint };
          const end = gap.axis === 'horizontal'
            ? { x: alongEnd, y: gap.line }
            : { x: gap.line, y: alongEnd };
          const first = lineDarkSupport(darkMask, width, height, start, apex, 1);
          const second = lineDarkSupport(darkMask, width, height, apex, end, 1);
          const score = Math.min(first, second);
          if (score >= 0.58 && (!best || score > best.score)) best = { score, side };
        }
      }
    }
  }
  return best
    ? { detected: true, normalDirection: best.side, confidence: clamp(0.78 + best.score * 0.18, 0, 0.94) }
    : { detected: false, normalDirection: 1, confidence: 0 };
};

const parallelWindowFrameSupport = (
  gap: PixelGap,
  darkMask: Uint8Array,
  width: number,
  height: number,
) => {
  const from = Math.ceil(gap.start + Math.max(1, gap.thickness * 0.2));
  const to = Math.floor(gap.end - Math.max(1, gap.thickness * 0.2));
  if (to - from < 4) return 0;
  let bestSupport = 0;
  const normalReach = Math.max(2, Math.ceil(gap.thickness * 1.5));
  for (let offset = -normalReach; offset <= normalReach; offset++) {
    let supported = 0;
    for (let along = from; along <= to; along++) {
      let dark = false;
      for (let antialias = -1; antialias <= 1; antialias++) {
        const x = gap.axis === 'horizontal' ? along : Math.round(gap.line + offset + antialias);
        const y = gap.axis === 'horizontal' ? Math.round(gap.line + offset + antialias) : along;
        if (x >= 0 && y >= 0 && x < width && y < height && darkMask[y * width + x]) {
          dark = true;
          break;
        }
      }
      if (dark) supported++;
    }
    bestSupport = Math.max(bestSupport, supported / Math.max(1, to - from + 1));
  }
  return bestSupport;
};

const parallelWindowFrameBandCount = (
  gap: PixelGap,
  mask: Uint8Array,
  width: number,
  height: number,
) => {
  const from = Math.ceil(gap.start + Math.max(1, gap.thickness * 0.2));
  const to = Math.floor(gap.end - Math.max(1, gap.thickness * 0.2));
  if (to - from < 4) return 0;
  const normalReach = Math.max(2, Math.ceil(gap.thickness * 1.5));
  const supportedOffsets: number[] = [];
  for (let offset = -normalReach; offset <= normalReach; offset++) {
    let supported = 0;
    for (let along = from; along <= to; along++) {
      let dark = false;
      for (let antialias = -1; antialias <= 1; antialias++) {
        const x = gap.axis === 'horizontal' ? along : Math.round(gap.line + offset + antialias);
        const y = gap.axis === 'horizontal' ? Math.round(gap.line + offset + antialias) : along;
        if (x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x]) { dark = true; break; }
      }
      if (dark) supported++;
    }
    if (supported / Math.max(1, to - from + 1) >= 0.86) supportedOffsets.push(offset);
  }
  let bands = 0;
  for (let index = 0; index < supportedOffsets.length;) {
    let end = index;
    while (end + 1 < supportedOffsets.length && supportedOffsets[end + 1] === supportedOffsets[end] + 1) end++;
    if (end - index + 1 >= 2) bands++;
    index = end + 1;
  }
  return bands;
};

/**
 * A genuine aperture cannot retain both heavy faces of a double-line wall
 * continuously across its whole span. Thin glazing bars and a near-closed
 * door leaf may each form a continuous line, so require two separately
 * supported bands whose individual stroke widths are wall-like.
 */
const hasTwoContinuousStructuralWallBands = (
  gap: PixelGap,
  mask: Uint8Array,
  width: number,
  height: number,
  typicalThickness: number,
) => {
  const from = Math.ceil(gap.start + Math.max(2, gap.thickness * 0.2));
  const to = Math.floor(gap.end - Math.max(2, gap.thickness * 0.2));
  if (to - from < Math.max(6, typicalThickness)) return false;
  const normalReach = Math.max(4, Math.ceil(typicalThickness * 1.6));
  const supportedOffsets: number[] = [];
  for (let offset = -normalReach; offset <= normalReach; offset++) {
    let supported = 0;
    for (let along = from; along <= to; along++) {
      const x = gap.axis === 'horizontal' ? along : Math.round(gap.line + offset);
      const y = gap.axis === 'horizontal' ? Math.round(gap.line + offset) : along;
      if (x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x]) supported++;
    }
    if (supported / Math.max(1, to - from + 1) >= 0.86) supportedOffsets.push(offset);
  }
  const minimumBandWidth = Math.max(3, Math.round(typicalThickness * 0.28));
  let thickBandCount = 0;
  for (let index = 0; index < supportedOffsets.length;) {
    let end = index;
    while (end + 1 < supportedOffsets.length && supportedOffsets[end + 1] === supportedOffsets[end] + 1) end++;
    if (end - index + 1 >= minimumBandWidth) thickBandCount++;
    index = end + 1;
  }
  return thickBandCount >= 2;
};

const hasParallelWindowFrame = (
  gap: PixelGap,
  darkMask: Uint8Array,
  width: number,
  height: number,
) => parallelWindowFrameSupport(gap, darkMask, width, height) >= 0.62;

const gapOverlapsRecognizedText = (
  gap: PixelGap,
  observations: FloorplanTextObservation[],
  typicalThickness: number,
) => {
  const normalReach = Math.max(3, typicalThickness * 2);
  const gapBounds = gap.axis === 'horizontal'
    ? { x0: gap.start, x1: gap.end, y0: gap.line - normalReach, y1: gap.line + normalReach }
    : { x0: gap.line - normalReach, x1: gap.line + normalReach, y0: gap.start, y1: gap.end };
  return observations.some(observation => {
    if (!isArchitecturalTextObservation(observation)) return false;
    const overlapX = Math.max(0, Math.min(gapBounds.x1, observation.bbox.x1) - Math.max(gapBounds.x0, observation.bbox.x0));
    const overlapY = Math.max(0, Math.min(gapBounds.y1, observation.bbox.y1) - Math.max(gapBounds.y0, observation.bbox.y0));
    if (!overlapX || !overlapY) return false;
    const gapLength = Math.max(1, gap.end - gap.start);
    const alongOverlap = gap.axis === 'horizontal' ? overlapX : overlapY;
    return alongOverlap / gapLength >= 0.08;
  });
};

/**
 * Opening symbols are first read from the OCR-cleaned raster. The untouched
 * raster is a useful recovery source only when the candidate does not overlap
 * an OCR box; this preserves real frames next to labels without allowing the
 * label strokes themselves to become a window or door.
 */
const detectGapSymbolEvidence = (
  gap: PixelGap,
  cleanMask: Uint8Array,
  originalMask: Uint8Array,
  width: number,
  height: number,
  observations: FloorplanTextObservation[],
  typicalThickness: number,
  cleanDoorMask: Uint8Array = cleanMask,
  originalDoorMask: Uint8Array = originalMask,
  preferThinAngularLeaf = false,
) => {
  if (gap.validatedEndpointSwingEvidence) {
    return {
      doorSwing: gap.validatedEndpointSwingEvidence,
      slidingEvidence: { detected: false, normalDirection: 1 as const, confidence: 0 },
      foldingEvidence: { detected: false, normalDirection: 1 as const, confidence: 0 },
      hostedArcRecovery: gap.validatedEndpointSwingEvidence,
      windowFrame: false,
      windowFrameSupport: 0,
    };
  }
  if (gap.closedSwingEvidence) {
    return {
      doorSwing: gap.closedSwingEvidence,
      // This recovery is admitted only by a matching arc and explicit swing
      // leaf. Incidental parallel or chevron strokes inside the reconstructed
      // host must not reclassify that verified swing symbol downstream.
      slidingEvidence: { detected: false, normalDirection: 1 as const, confidence: 0 },
      foldingEvidence: { detected: false, normalDirection: 1 as const, confidence: 0 },
      hostedArcRecovery: gap.closedSwingEvidence,
      windowFrame: false,
      windowFrameSupport: 0,
    };
  }
  const cleanSwing = detectBestDoorSwing(gap, cleanMask, width, height, preferThinAngularLeaf);
  const cleanWeakSwing = cleanSwing.detected
    ? cleanSwing
    : detectWeakInkDoorSwing(gap, cleanDoorMask, width, height);
  const cleanHostedArc = detectHostedDoorArc(gap, cleanDoorMask, width, height);
  const cleanHostedArcRecovery = detectHostedDoorArc(gap, cleanDoorMask, width, height, false);
  const cleanDoorSwing = cleanHostedArc.confidence > cleanWeakSwing.confidence
    ? cleanHostedArc
    : cleanWeakSwing;
  const cleanSliding = detectSlidingDoorPanels(gap, cleanMask, width, height);
  const cleanFolding = detectFoldingDoor(gap, cleanMask, width, height);
  const cleanWindowSupport = parallelWindowFrameSupport(gap, cleanMask, width, height);
  const cleanWindow = cleanWindowSupport >= 0.62;
  if (gapOverlapsRecognizedText(gap, observations, typicalThickness)) {
    // OCR boxes may erase a real swing arc. The original mask is consulted
    // only through the continuous, host-local arc validator above; isolated
    // letters and remote room symbols cannot satisfy that geometry.
    const originalHostedArc = detectHostedDoorArc(gap, originalDoorMask, width, height);
    const originalHostedArcRecovery = detectHostedDoorArc(gap, originalDoorMask, width, height, false);
    return {
      doorSwing: originalHostedArc.confidence > cleanDoorSwing.confidence
        ? originalHostedArc
        : cleanDoorSwing,
      slidingEvidence: cleanSliding,
      foldingEvidence: cleanFolding,
      hostedArcRecovery: originalHostedArcRecovery.confidence > cleanHostedArcRecovery.confidence
        ? originalHostedArcRecovery
        : cleanHostedArcRecovery,
      windowFrame: cleanWindow,
      windowFrameSupport: cleanWindowSupport,
    };
  }
  const originalSwing = detectBestDoorSwing(gap, originalMask, width, height, preferThinAngularLeaf);
  const originalWeakSwing = originalSwing.detected
    ? originalSwing
    : detectWeakInkDoorSwing(gap, originalDoorMask, width, height);
  const originalHostedArc = detectHostedDoorArc(gap, originalDoorMask, width, height);
  const originalHostedArcRecovery = detectHostedDoorArc(gap, originalDoorMask, width, height, false);
  const originalSliding = detectSlidingDoorPanels(gap, originalMask, width, height);
  const originalFolding = detectFoldingDoor(gap, originalMask, width, height);
  const originalWindowSupport = parallelWindowFrameSupport(gap, originalMask, width, height);
  return {
    doorSwing: [originalWeakSwing, originalHostedArc, cleanDoorSwing]
      .sort((first, second) => second.confidence - first.confidence)[0],
    slidingEvidence: originalSliding.confidence > cleanSliding.confidence ? originalSliding : cleanSliding,
    foldingEvidence: originalFolding.confidence > cleanFolding.confidence ? originalFolding : cleanFolding,
    hostedArcRecovery: originalHostedArcRecovery.confidence > cleanHostedArcRecovery.confidence
      ? originalHostedArcRecovery
      : cleanHostedArcRecovery,
    windowFrame: cleanWindow || originalWindowSupport >= 0.62,
    windowFrameSupport: Math.max(cleanWindowSupport, originalWindowSupport),
  };
};

/**
 * Recover a wall family that was rejected because most of it is drawn as a
 * thin window/sliding assembly. One end must join the retained wall network,
 * and raster-supported wall continuation must reach a retained perpendicular
 * anchor at the other end. The opening itself is admitted only from explicit
 * window or sliding evidence; swing, folding, and bare-passage candidates are
 * left to their established detectors.
 */
const recoverMissingHostedWindowOrSliding = (
  retained: PixelSegment[],
  symbolSegments: PixelSegment[],
  pixelScale: { x: number; y: number },
  typicalThickness: number,
  cleanMask: Uint8Array,
  originalMask: Uint8Array,
  width: number,
  height: number,
  observations: FloorplanTextObservation[],
  cleanDoorMask: Uint8Array,
  originalDoorMask: Uint8Array,
) => {
  const recoveredSegments: PixelSegment[] = [];
  const recoveredGaps: PixelGap[] = [];
  const lineTolerance = Math.max(2, typicalThickness * 1.35);
  const crossingTolerance = Math.max(2, typicalThickness * 1.1);
  const wallContinuationSupport = (axis: Axis, line: number, start: number, end: number) => {
    if (end - start < typicalThickness * 0.7) return 0;
    const radius = Math.max(2, Math.ceil(typicalThickness * 0.75));
    let supported = 0, total = 0;
    for (let along = Math.ceil(start); along <= Math.floor(end); along++) {
      let dark = false;
      for (let offset = -radius; offset <= radius; offset++) {
        const x = axis === 'horizontal' ? along : Math.round(line + offset);
        const y = axis === 'horizontal' ? Math.round(line + offset) : along;
        if (x >= 0 && y >= 0 && x < width && y < height && originalMask[y * width + x]) {
          dark = true;
          break;
        }
      }
      supported += dark ? 1 : 0;
      total++;
    }
    return supported / Math.max(1, total);
  };
  const rasterParallelRunEndpoints = (axis: Axis, line: number) => {
    const endpoints: number[] = [];
    const normalReach = Math.max(2, Math.ceil(typicalThickness * 1.5));
    const alongLimit = axis === 'horizontal' ? width : height;
    const minimumRun = Math.max(5, Math.round(typicalThickness * 1.8));
    for (let offset = -normalReach; offset <= normalReach; offset++) {
      let runStart = -1, lastDark = -1;
      for (let along = 0; along <= alongLimit + 1; along++) {
        let dark = false;
        if (along < alongLimit) {
          for (let antialias = -1; antialias <= 1; antialias++) {
            const normal = Math.round(line + offset + antialias);
            const x = axis === 'horizontal' ? along : normal;
            const y = axis === 'horizontal' ? normal : along;
            if (x >= 0 && y >= 0 && x < width && y < height && originalMask[y * width + x]) {
              dark = true;
              break;
            }
          }
        }
        if (dark) {
          if (runStart < 0) runStart = along;
          lastDark = along;
        }
        if ((!dark && lastDark >= 0 && along - lastDark > 1) || along > alongLimit) {
          if (lastDark - runStart + 1 >= minimumRun) endpoints.push(runStart, lastDark);
          runStart = -1;
          lastDark = -1;
        }
      }
    }
    return endpoints;
  };

  retained.forEach(seed => {
    const oppositeAxis: Axis = seed.axis === 'horizontal' ? 'vertical' : 'horizontal';
    const perpendicularAnchors = retained.filter(anchor => anchor.axis === oppositeAxis
      && seed.line >= anchor.start - crossingTolerance
      && seed.line <= anchor.end + crossingTolerance);
    const boundaryCandidates = Array.from(new Set([
      ...symbolSegments.filter(symbol => symbol.axis === seed.axis
        && Math.abs(symbol.line - seed.line) <= lineTolerance)
        .flatMap(symbol => [symbol.start, symbol.end]),
      // Preserve pre-merge run transitions. In DS12 69.2 the upper sliding
      // leaf touches a thin wall stroke, so band extraction merges both and
      // hides the actual jamb coordinate from the segment endpoint list.
      ...rasterParallelRunEndpoints(seed.axis, seed.line),
    ].map(value => Math.round(value))));
    for (const direction of [-1, 1] as const) {
      const joinedEnd = direction < 0 ? seed.start : seed.end;
      const anchors = perpendicularAnchors.filter(anchor => direction < 0
        ? anchor.line < joinedEnd - typicalThickness
        : anchor.line > joinedEnd + typicalThickness);
      for (const boundary of boundaryCandidates) {
        if (direction < 0 ? boundary >= joinedEnd - typicalThickness : boundary <= joinedEnd + typicalThickness) continue;
        const gap: PixelGap = {
          axis: seed.axis,
          line: seed.line,
          start: Math.min(boundary, joinedEnd),
          end: Math.max(boundary, joinedEnd),
          thickness: seed.thickness,
        };
        const gapMeters = (gap.end - gap.start) * (seed.axis === 'horizontal' ? pixelScale.x : pixelScale.y);
        if (gapMeters < 0.45 || gapMeters > 3.2) continue;
        if (gapOverlapsRecognizedText(gap, observations, typicalThickness)) continue;

        const anchor = anchors.filter(item => direction < 0
          ? item.line <= boundary + crossingTolerance
          : item.line >= boundary - crossingTolerance)
          .sort((first, second) => Math.abs(first.line - boundary) - Math.abs(second.line - boundary))[0];
        if (!anchor) continue;
        const continuationStart = direction < 0 ? anchor.line : boundary;
        const continuationEnd = direction < 0 ? boundary : anchor.line;
        if (wallContinuationSupport(seed.axis, seed.line, continuationStart, continuationEnd) < 0.72) continue;

        const established = detectGapSymbolEvidence(
          gap, cleanMask, originalMask, width, height, observations, typicalThickness,
          cleanDoorMask, originalDoorMask,
        );
        if (established.doorSwing.detected || established.hostedArcRecovery.detected
          || established.foldingEvidence.detected || gap.openPassageEvidence) continue;
        const cleanEndToEnd = detectEndToEndSlidingDoorPanels(gap, cleanDoorMask, width, height);
        const originalEndToEnd = detectEndToEndSlidingDoorPanels(gap, originalDoorMask, width, height);
        const sliding = [established.slidingEvidence, cleanEndToEnd, originalEndToEnd]
          .sort((first, second) => second.confidence - first.confidence)[0];
        const frameSupport = Math.max(
          parallelWindowFrameSupport(gap, cleanMask, width, height),
          parallelWindowFrameSupport(gap, originalMask, width, height),
        );
        const frameBands = Math.max(
          parallelWindowFrameBandCount(gap, cleanMask, width, height),
          parallelWindowFrameBandCount(gap, originalMask, width, height),
        );
        const windowConfidence = frameBands >= 2 && frameSupport >= 0.62
          ? clamp(0.68 + frameSupport * 0.2 + Math.min(3, frameBands) * 0.025, 0, 0.94)
          : 0;
        if (!sliding.detected && !windowConfidence) continue;
        const explicitSliding = established.slidingEvidence.detected;
        gap.missingHostFallback = explicitSliding || (sliding.detected && sliding.confidence > windowConfidence)
          ? 'sliding'
          : 'window';
        if (explicitSliding) gap.explicitSlidingEvidence = true;
        const hostStart = direction < 0 ? anchor.line : seed.start;
        const hostEnd = direction < 0 ? seed.end : anchor.line;
        recoveredSegments.push({
          axis: seed.axis,
          line: seed.line,
          start: Math.min(hostStart, hostEnd),
          end: Math.max(hostStart, hostEnd),
          thickness: seed.thickness,
        });
        recoveredGaps.push(gap);
      }
    }
  });

  const gaps = deduplicatePixelGaps(recoveredGaps, typicalThickness);
  return {
    segments: deduplicateParallelSegments([...retained, ...recoveredSegments], typicalThickness),
    gaps,
  };
};

export const recoverText4gMissingHostedWindowOrSlidingForTest = recoverMissingHostedWindowOrSliding;

const recoverSymbolSupportedGaps = (
  segments: PixelSegment[],
  pixelScale: { x: number; y: number },
  typicalThickness: number,
  cleanMask: Uint8Array,
  originalMask: Uint8Array,
  width: number,
  height: number,
  observations: FloorplanTextObservation[],
  cleanDoorMask: Uint8Array = cleanMask,
  originalDoorMask: Uint8Array = originalMask,
) => {
  const recovered: PixelGap[] = [];
  // Wall faces belonging to different offset partitions must not be grouped
  // into one aperture host. A broader tolerance let the kitchen return and
  // bedroom partition in DS12-71 bridge the real living/foyer access gap.
  const lineTolerance = Math.max(2, typicalThickness * 1.2);
  for (const axis of ['horizontal', 'vertical'] as const) {
    const groups: PixelSegment[][] = [];
    segments.filter(segment => segment.axis === axis).forEach(segment => {
      const group = groups.find(items => Math.abs(median(items.map(item => item.line)) - segment.line) <= lineTolerance);
      if (group) group.push(segment);
      else groups.push([segment]);
    });
    groups.forEach(group => {
      // Directional band extraction can report nested wall-face intervals on
      // the same axis. Collapse those overlaps before looking for apertures;
      // otherwise an arbitrary nested interval can hide the real jamb pair or
      // create a false gap inside one continuous wall.
      const intervals: PixelSegment[] = [];
      [...group].sort((a, b) => a.start - b.start || b.end - a.end).forEach(segment => {
        const previous = intervals[intervals.length - 1];
        if (!previous || segment.start > previous.end + Math.max(1, typicalThickness * 0.2)) {
          intervals.push({ ...segment });
          return;
        }
        const previousLength = Math.max(1, previous.end - previous.start);
        const segmentLength = Math.max(1, segment.end - segment.start);
        previous.line = (previous.line * previousLength + segment.line * segmentLength)
          / (previousLength + segmentLength);
        previous.end = Math.max(previous.end, segment.end);
        previous.thickness = Math.max(previous.thickness, segment.thickness);
      });
      for (let index = 1; index < intervals.length; index++) {
        const previous = intervals[index - 1], next = intervals[index];
        if (next.start <= previous.end) continue;
        const gapMeters = (next.start - previous.end) * (axis === 'horizontal' ? pixelScale.x : pixelScale.y);
        if (gapMeters < 0.45 || gapMeters > 4.5) continue;
        const previousLength = previous.end - previous.start;
        const nextLength = next.end - next.start;
        if (Math.min(previousLength, nextLength) < typicalThickness * 1.8) continue;
        const candidate: PixelGap = {
          axis,
          line: (previous.line * previousLength + next.line * nextLength) / Math.max(1, previousLength + nextLength),
          start: previous.end,
          end: next.start,
          thickness: Math.max(previous.thickness, next.thickness),
        };
        const evidence = detectGapSymbolEvidence(
          candidate, cleanMask, originalMask, width, height, observations, typicalThickness,
          cleanDoorMask, originalDoorMask,
        );
        if (evidence.windowFrame || evidence.hostedArcRecovery.detected || (evidence.doorSwing.detected
          && (!evidence.doorSwing.arcOnly || evidence.doorSwing.arcConfirmed))
          || evidence.slidingEvidence.detected || evidence.foldingEvidence.detected) {
          recovered.push(candidate);
        }
      }
    });
  }
  return deduplicatePixelGaps(recovered, typicalThickness);
};

const enumerateComponentRowGaps = (
  segments: PixelSegment[],
  pixelScale: { x: number; y: number },
  typicalThickness: number,
) => {
  const gaps: PixelGap[] = [];
  const groups: PixelSegment[][] = [];
  segments.filter(segment => segment.axis === 'horizontal'
    && segment.thickness >= typicalThickness * 0.45).forEach(segment => {
    const group = groups.find(items => Math.abs(median(items.map(item => item.line)) - segment.line) <= typicalThickness * 1.25);
    if (group) group.push(segment);
    else groups.push([segment]);
  });
  groups.forEach(group => {
    const intervals = [...group].sort((a, b) => a.start - b.start || a.end - b.end);
    for (let index = 1; index < intervals.length; index++) {
      const previous = intervals[index - 1], next = intervals[index];
      if (next.start <= previous.end) continue;
      const widthMeters = (next.start - previous.end) * pixelScale.x;
      if (widthMeters < 0.45 || widthMeters > 3.2) continue;
      gaps.push({
        axis: 'horizontal',
        line: (previous.line + next.line) / 2,
        start: previous.end,
        end: next.start,
        thickness: Math.max(previous.thickness, next.thickness),
      });
    }
  });
  return deduplicatePixelGaps(gaps, typicalThickness);
};

const wallBandInkRatio = (
  gap: PixelGap,
  mask: Uint8Array,
  width: number,
  height: number,
  typicalThickness: number,
) => {
  const normalRadius = Math.max(2, Math.round(typicalThickness / 2));
  const alongStart = clamp(Math.ceil(gap.start + typicalThickness * 0.35), 0, gap.axis === 'horizontal' ? width - 1 : height - 1);
  const alongEnd = clamp(Math.floor(gap.end - typicalThickness * 0.35), 0, gap.axis === 'horizontal' ? width - 1 : height - 1);
  let dark = 0, total = 0;
  for (let along = alongStart; along <= alongEnd; along++) {
    for (let normal = Math.round(gap.line) - normalRadius; normal <= Math.round(gap.line) + normalRadius; normal++) {
      const x = gap.axis === 'horizontal' ? along : normal;
      const y = gap.axis === 'horizontal' ? normal : along;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      total++;
      dark += mask[y * width + x];
    }
  }
  return dark / Math.max(1, total);
};

/**
 * Some drafting styles draw several window-frame lines through the wall band.
 * Their ink can make the ordinary band merger see one continuous wall and
 * erase the clear jamb-to-jamb gap. Recover that gap from a thin, parallel
 * frame only when a continuous host exists, the wall band is visibly hollow,
 * and no OCR text overlaps the candidate.
 */
const recoverWindowFramesInsideHostWalls = (
  hostSegments: PixelSegment[],
  symbolSegments: PixelSegment[],
  pixelScale: { x: number; y: number },
  typicalThickness: number,
  cleanMask: Uint8Array,
  originalMask: Uint8Array,
  width: number,
  height: number,
  observations: FloorplanTextObservation[],
  cleanDoorMask: Uint8Array = cleanMask,
  originalDoorMask: Uint8Array = originalMask,
) => {
  const candidates: PixelGap[] = [];
  const maximumFrameThickness = Math.max(3, typicalThickness * 0.72);
  const lineTolerance = Math.max(3, typicalThickness * 1.7);
  symbolSegments.filter(segment => segment.thickness <= maximumFrameThickness).forEach(frame => {
    const lengthMeters = (frame.end - frame.start) * (frame.axis === 'horizontal' ? pixelScale.x : pixelScale.y);
    if (lengthMeters < 0.45 || lengthMeters > 3.2) return;
    const host = hostSegments.filter(segment => segment.axis === frame.axis
      && Math.abs(segment.line - frame.line) <= lineTolerance
      && segment.start <= frame.start + typicalThickness
      && segment.end >= frame.end - typicalThickness
      && segment.end - segment.start >= frame.end - frame.start + typicalThickness * 1.5)
      .sort((a, b) => Math.abs(a.line - frame.line) - Math.abs(b.line - frame.line))[0];
    if (!host) return;
    const gap: PixelGap = {
      axis: frame.axis,
      line: host.line,
      start: frame.start,
      end: frame.end,
      thickness: host.thickness,
    };
    if (gapOverlapsRecognizedText(gap, observations, typicalThickness)) return;
    if (wallBandInkRatio(gap, originalMask, width, height, typicalThickness) >= 0.64) return;
    const evidence = detectGapSymbolEvidence(
      gap, cleanMask, originalMask, width, height, observations, typicalThickness,
      cleanDoorMask, originalDoorMask,
    );
    // Keep the hosted frame span even when it also contains a verified door
    // symbol. Final classification owns the priority decision; discarding it
    // here previously made a true door vanish before arbitration.
    if (!evidence.windowFrame) return;
    candidates.push(gap);
  });
  return deduplicatePixelGaps(candidates, typicalThickness);
};

const recoverHollowHostedApertures = (
  hostSegments: PixelSegment[],
  pixelScale: { x: number; y: number },
  typicalThickness: number,
  cleanMask: Uint8Array,
  originalMask: Uint8Array,
  width: number,
  height: number,
  observations: FloorplanTextObservation[],
  cleanDoorMask: Uint8Array = cleanMask,
  originalDoorMask: Uint8Array = originalMask,
) => {
  const candidates: PixelGap[] = [];
  const radius = Math.max(2, Math.round(typicalThickness / 2));
  const minimumSolidRun = Math.max(3, Math.round(typicalThickness));
  const densityAt = (segment: PixelSegment, along: number) => {
    let dark = 0, total = 0;
    for (let normal = Math.round(segment.line) - radius; normal <= Math.round(segment.line) + radius; normal++) {
      const x = segment.axis === 'horizontal' ? along : normal;
      const y = segment.axis === 'horizontal' ? normal : along;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      total++;
      dark += originalMask[y * width + x];
    }
    return dark / Math.max(1, total);
  };
  hostSegments.forEach(segment => {
    const from = clamp(Math.ceil(segment.start), 0, segment.axis === 'horizontal' ? width - 1 : height - 1);
    const to = clamp(Math.floor(segment.end), 0, segment.axis === 'horizontal' ? width - 1 : height - 1);
    let cursor = from;
    while (cursor <= to) {
      if (densityAt(segment, cursor) > 0.52) {
        cursor++;
        continue;
      }
      const start = cursor;
      while (cursor <= to && densityAt(segment, cursor) <= 0.52) cursor++;
      const end = cursor - 1;
      const gapMeters = (end - start) * (segment.axis === 'horizontal' ? pixelScale.x : pixelScale.y);
      if (gapMeters < 0.45 || gapMeters > 3.2) continue;
      const beforeStart = Math.max(from, start - minimumSolidRun);
      const afterEnd = Math.min(to, end + minimumSolidRun);
      let beforeSolid = 0, afterSolid = 0;
      for (let along = beforeStart; along < start; along++) beforeSolid += densityAt(segment, along) >= 0.68 ? 1 : 0;
      for (let along = end + 1; along <= afterEnd; along++) afterSolid += densityAt(segment, along) >= 0.68 ? 1 : 0;
      if (beforeSolid < Math.min(minimumSolidRun, start - beforeStart) * 0.65
        || afterSolid < Math.min(minimumSolidRun, afterEnd - end) * 0.65) continue;
      const gap: PixelGap = {
        axis: segment.axis,
        line: segment.line,
        start,
        end,
        thickness: segment.thickness,
      };
      if (gapOverlapsRecognizedText(gap, observations, typicalThickness)) continue;
      const evidence = detectGapSymbolEvidence(
        gap, cleanMask, originalMask, width, height, observations, typicalThickness,
        cleanDoorMask, originalDoorMask,
      );
      const blankWallBand = wallBandInkRatio(gap, originalMask, width, height, typicalThickness) <= 0.08;
      const evidencedDoor = evidence.hostedArcRecovery.arcConfirmed
        || evidence.doorSwing.arcConfirmed
        || evidence.doorSwing.arcEvidence
        || evidence.slidingEvidence.detected
        || evidence.foldingEvidence.detected;
      if (!evidence.windowFrame && !blankWallBand) continue;
      if (!evidence.windowFrame && !evidencedDoor) gap.openPassageEvidence = true;
      candidates.push(gap);
    }
  });
  return deduplicatePixelGaps(candidates, typicalThickness);
};

const deduplicatePixelGaps = (gaps: PixelGap[], typicalThickness: number) => {
  const unique: PixelGap[] = [];
  for (const gap of [...gaps].sort((a, b) => a.axis.localeCompare(b.axis) || a.line - b.line || a.start - b.start)) {
    const duplicate = unique.find(candidate => {
      if (candidate.axis !== gap.axis || Math.abs(candidate.line - gap.line) > typicalThickness * 1.5) return false;
      const overlap = Math.min(candidate.end, gap.end) - Math.max(candidate.start, gap.start);
      const shorter = Math.min(candidate.end - candidate.start, gap.end - gap.start);
      return overlap > 0 && overlap / Math.max(1, shorter) >= 0.55;
    });
    if (!duplicate) {
      unique.push({ ...gap });
      continue;
    }
    if (gap.validatedEndpointSwingEvidence) {
      if (gap.physicalWallFaceSwingEvidence
        && duplicate.end - duplicate.start >= gap.end - gap.start) {
        duplicate.validatedEndpointSwingEvidence = gap.validatedEndpointSwingEvidence;
        duplicate.physicalWallFaceSwingEvidence = true;
        duplicate.physicalWallFaceLeafLine = gap.physicalWallFaceLeafLine;
        if (gap.jambFaceClampEvidence) duplicate.jambFaceClampEvidence = true;
        continue;
      }
      duplicate.line = gap.line;
      duplicate.start = gap.start;
      duplicate.end = gap.end;
      duplicate.thickness = Math.max(duplicate.thickness, gap.thickness);
      duplicate.validatedEndpointSwingEvidence = gap.validatedEndpointSwingEvidence;
      if (gap.physicalWallFaceSwingEvidence) duplicate.physicalWallFaceSwingEvidence = true;
      if (gap.physicalWallFaceLeafLine !== undefined) duplicate.physicalWallFaceLeafLine = gap.physicalWallFaceLeafLine;
      if (gap.jambFaceClampEvidence) duplicate.jambFaceClampEvidence = true;
      continue;
    }
    if (duplicate.validatedEndpointSwingEvidence) continue;
    if (gap.closedSwingEvidence) {
      duplicate.line = gap.line;
      duplicate.start = gap.start;
      duplicate.end = gap.end;
      duplicate.thickness = Math.max(duplicate.thickness, gap.thickness);
      duplicate.closedSwingEvidence = gap.closedSwingEvidence;
      if (gap.jambFaceClampEvidence) duplicate.jambFaceClampEvidence = true;
      continue;
    }
    if (duplicate.closedSwingEvidence) continue;
    // A verified staggered two-panel glyph is more specific than a generic
    // parallel window frame. Preserve its complete jamb-to-jamb span when a
    // narrower fallback candidate overlaps it; all non-explicit conflicts
    // retain the established narrower-gap behaviour below.
    if (gap.explicitSlidingEvidence && !duplicate.explicitSlidingEvidence) {
      duplicate.line = gap.line;
      duplicate.start = gap.start;
      duplicate.end = gap.end;
      duplicate.thickness = Math.max(duplicate.thickness, gap.thickness);
      duplicate.missingHostFallback = 'sliding';
      duplicate.explicitSlidingEvidence = true;
      continue;
    }
    if (duplicate.explicitSlidingEvidence) continue;
    if (gap.openPassageEvidence) duplicate.openPassageEvidence = true;
    if (gap.missingHostFallback) duplicate.missingHostFallback = gap.missingHostFallback;
    // Use the narrower observed clear span; anti-aliasing around a thick wall
    // tends to make the same opening look slightly wider on one parallel edge.
    if (gap.end - gap.start < duplicate.end - duplicate.start) {
      duplicate.line = gap.line;
      duplicate.start = gap.start;
      duplicate.end = gap.end;
      duplicate.thickness = Math.max(duplicate.thickness, gap.thickness);
      if (gap.openPassageEvidence) duplicate.openPassageEvidence = true;
      if (gap.missingHostFallback) duplicate.missingHostFallback = gap.missingHostFallback;
    }
  }
  return unique;
};

/**
 * Recovery candidates are sometimes measured between adjacent wall
 * centrelines. A door aperture must instead stop at the physical jamb faces;
 * otherwise its leaf crosses the neighbouring wall and the centreline-to-face
 * remainder looks like a fabricated host stub. Limit this correction to
 * raster-validated recovered swings, leaving ordinary detected apertures
 * byte-for-byte unchanged.
 */
export const clampText4gRecoveredSwingGapToJambFacesForTest = (
  gap: PixelGap,
  axisWalls: PixelSegment[],
  freeformWalls: Text4gFreeformWallSegment[],
  typicalThickness: number,
) => {
  if (!gap.jambFaceClampEvidence) return gap;
  type Jamb = { along: number; inset: number; centerTolerance: number };
  const jambs: Jamb[] = axisWalls.filter(wall => wall.axis !== gap.axis
    && gap.line >= wall.start - typicalThickness
    && gap.line <= wall.end + typicalThickness)
    .map(wall => ({
      along: wall.line,
      // Merged wall families can carry the combined thickness of several
      // coincident bands. Do not let that inflate a door-face inset.
      inset: Math.max(0.5, Math.min(wall.thickness / 2, typicalThickness * 0.6)),
      centerTolerance: Math.max(1, Math.min(typicalThickness * 0.25, wall.thickness * 0.3)),
    }));
  const minimumCrossingSine = Math.sin(25 * Math.PI / 180);
  freeformWalls.forEach(wall => {
    const dx = wall.p2.x - wall.p1.x, dy = wall.p2.y - wall.p1.y;
    const length = Math.hypot(dx, dy);
    if (length <= 1e-6) return;
    const crossingComponent = gap.axis === 'horizontal' ? Math.abs(dy) / length : Math.abs(dx) / length;
    if (crossingComponent < minimumCrossingSine) return;
    const denominator = gap.axis === 'horizontal' ? dy : dx;
    const numerator = gap.line - (gap.axis === 'horizontal' ? wall.p1.y : wall.p1.x);
    const t = numerator / denominator;
    if (t < -0.02 || t > 1.02) return;
    const along = gap.axis === 'horizontal'
      ? wall.p1.x + dx * t
      : wall.p1.y + dy * t;
    jambs.push({
      along,
      // Project half the angular wall thickness onto the recovered host axis.
      inset: Math.min(typicalThickness * 1.5, Math.max(0.5, wall.thickness / (2 * crossingComponent))),
      centerTolerance: Math.max(1, Math.min(typicalThickness * 0.25, wall.thickness * 0.3)),
    });
  });
  const nearestCenteredJamb = (endpoint: number) => jambs
    .map(jamb => ({ jamb, distance: Math.abs(jamb.along - endpoint) }))
    .filter(item => item.distance <= item.jamb.centerTolerance)
    .sort((first, second) => first.distance - second.distance)[0]?.jamb;
  const startJamb = nearestCenteredJamb(gap.start);
  const endJamb = nearestCenteredJamb(gap.end);
  // The reported overrun signature is a recovered jamb-to-jamb span. A
  // one-ended recovery may intentionally use its visible leaf as the other
  // endpoint; resizing those changed established DS04/DS05 doors.
  const freeEndpoint = startJamb ? gap.end : gap.start;
  const explicitLeafAtFreeEndpoint = gap.physicalWallFaceLeafLine !== undefined
    && Math.abs(gap.physicalWallFaceLeafLine - freeEndpoint) <= Math.max(1, typicalThickness * 0.35);
  const physicalLeafToJambRecovery = gap.physicalWallFaceSwingEvidence
    && !gap.validatedEndpointSwingEvidence?.offsetHinge
    && explicitLeafAtFreeEndpoint
    && (!!startJamb !== !!endJamb);
  if ((!startJamb || !endJamb) && !physicalLeafToJambRecovery) return gap;
  const start = startJamb ? startJamb.along + startJamb.inset : gap.start;
  const end = endJamb ? endJamb.along - endJamb.inset : gap.end;
  if (end - start < Math.max(8, typicalThickness * 1.5)) return gap;
  if (Math.abs(start - gap.start) < 1e-6 && Math.abs(end - gap.end) < 1e-6) return gap;
  return { ...gap, start, end, jambFaceBoundedEvidence: true };
};

export const resolveText4gFramedInsetPixelsForTest = (
  gap: PixelGap,
  hasFramedSymbol: boolean,
  typicalThickness: number,
) => gap.jambFaceBoundedEvidence || !hasFramedSymbol ? 0 : typicalThickness * 0.38;

interface DetectedPixelColumn {
  x: number;
  y: number;
  widthPixels: number;
  depthPixels: number;
  confidence: number;
  pixelBounds: { x0: number; y0: number; x1: number; y1: number };
}

interface DetectedPixelStair {
  p1: PixelPoint;
  p2: PixelPoint;
  widthPixels: number;
  stepCount: number;
  confidence: number;
  pixelBounds: { x0: number; y0: number; x1: number; y1: number };
}

interface DetectedRailingProjection {
  side: 'left' | 'right' | 'top' | 'bottom';
  bounds: PixelBounds;
  segments: PixelSegment[];
  confidence: number;
}

const wallAxisBounds = (wallSegments: PixelSegment[], fallback: PixelBounds): PixelBounds => {
  const horizontalLines = wallSegments.filter(segment => segment.axis === 'horizontal').map(segment => segment.line);
  const verticalLines = wallSegments.filter(segment => segment.axis === 'vertical').map(segment => segment.line);
  return horizontalLines.length >= 2 && verticalLines.length >= 2
    ? {
        minX: Math.min(...verticalLines), maxX: Math.max(...verticalLines),
        minY: Math.min(...horizontalLines), maxY: Math.max(...horizontalLines),
      }
    : fallback;
};

interface DetectedPixelColumn {
  x: number;
  y: number;
  widthPixels: number;
  depthPixels: number;
  confidence: number;
  pixelBounds: { x0: number; y0: number; x1: number; y1: number };
}

interface DetectedPixelStair {
  p1: PixelPoint;
  p2: PixelPoint;
  widthPixels: number;
  stepCount: number;
  confidence: number;
  pixelBounds: { x0: number; y0: number; x1: number; y1: number };
}

interface DetectedRailingProjection {
  side: 'left' | 'right' | 'top' | 'bottom';
  bounds: PixelBounds;
  segments: PixelSegment[];
  confidence: number;
}


/**
 * A multi-line window can connect several scan columns and make the band
 * builder keep only the longer jamb-side wall piece. Re-scan only axes already
 * established by the selected wall network and restore high-density wall
 * runs. Hollow runs remain absent and are later emitted as hosted openings.
 */
const recoverMissingFacadeWallRuns = (
  segments: PixelSegment[],
  mask: Uint8Array,
  width: number,
  height: number,
  typicalThickness: number,
) => {
  if (segments.length < 4) return segments;
  const rawBounds = segmentBounds(segments);
  const bounds = wallAxisBounds(segments, rawBounds);
  const radius = Math.max(2, Math.round(typicalThickness / 2));
  const minimumRun = Math.max(8, Math.round(typicalThickness * 1.15));
  const scanAxes: PixelSegment[] = [
    { axis: 'horizontal', line: bounds.minY, start: bounds.minX, end: bounds.maxX, thickness: typicalThickness },
    { axis: 'horizontal', line: bounds.maxY, start: bounds.minX, end: bounds.maxX, thickness: typicalThickness },
    { axis: 'vertical', line: bounds.minX, start: bounds.minY, end: bounds.maxY, thickness: typicalThickness },
    { axis: 'vertical', line: bounds.maxX, start: bounds.minY, end: bounds.maxY, thickness: typicalThickness },
  ];
  segments.forEach(segment => {
    const existing = scanAxes.find(candidate => candidate.axis === segment.axis
      && Math.abs(candidate.line - segment.line) <= Math.max(2, typicalThickness * 0.45));
    if (existing) {
      const start = segment.axis === 'horizontal' ? rawBounds.minX : rawBounds.minY;
      const end = segment.axis === 'horizontal' ? rawBounds.maxX : rawBounds.maxY;
      existing.start = Math.min(existing.start, start);
      existing.end = Math.max(existing.end, end);
      existing.thickness = Math.max(existing.thickness, segment.thickness);
    }
  });
  // A facade split by several windows may lose every horizontal/vertical band
  // on that side while its perpendicular walls still end on the raster stroke.
  // Use two or more aligned retained endpoints only to locate the observed band;
  // the pixels below remain authoritative for whether any wall run is restored.
  for (const axis of ['horizontal', 'vertical'] as const) {
    const perpendicular = segments.filter(segment => segment.axis !== axis);
    const endpoints = perpendicular.flatMap(segment => [
      { normal: segment.start, along: segment.line },
      { normal: segment.end, along: segment.line },
    ]).sort((a, b) => a.normal - b.normal);
    const clusters: typeof endpoints[] = [];
    endpoints.forEach(endpoint => {
      const cluster = clusters.find(items =>
        Math.abs(median(items.map(item => item.normal)) - endpoint.normal)
          <= Math.max(2, typicalThickness * 1.5));
      if (cluster) cluster.push(endpoint);
      else clusters.push([endpoint]);
    });
    clusters.forEach(cluster => {
      const alongValues = [...new Set(cluster.map(item => Math.round(item.along)))];
      if (alongValues.length < 2
        || Math.max(...alongValues) - Math.min(...alongValues) < typicalThickness * 5) return;
      const nominalLine = median(cluster.map(item => item.normal));
      const outsideKnownFacade = axis === 'horizontal'
        ? nominalLine < bounds.minY - typicalThickness * 3
          || nominalLine > bounds.maxY + typicalThickness * 3
        : nominalLine < bounds.minX - typicalThickness * 3
          || nominalLine > bounds.maxX + typicalThickness * 3;
      if (!outsideKnownFacade) return;
      const start = Math.min(...alongValues), end = Math.max(...alongValues);
      const supportedLines: number[] = [];
      for (let line = Math.round(nominalLine - typicalThickness);
        line <= Math.round(nominalLine + typicalThickness);
        line++) {
        if (darkSupportAlongGap(axis, line, start, end, mask, width, height, 1) >= 0.35) {
          supportedLines.push(line);
        }
      }
      if (!supportedLines.length) return;
      const runs: number[][] = [];
      supportedLines.forEach(line => {
        const run = runs[runs.length - 1];
        if (run && line === run[run.length - 1] + 1) run.push(line);
        else runs.push([line]);
      });
      const bestRun = runs.sort((a, b) => b.length - a.length)[0];
      if (!bestRun || bestRun.length < Math.max(3, typicalThickness * 0.35)) return;
      const line = median(bestRun);
      if (scanAxes.some(existing => existing.axis === axis
        && Math.abs(existing.line - line) <= Math.max(2, typicalThickness * 0.45))) return;
      scanAxes.push({
        axis,
        line,
        start,
        end,
        thickness: Math.max(typicalThickness, bestRun.length),
      });
    });
  }
  const densityAt = (side: PixelSegment, along: number) => {
    let dark = 0, total = 0;
    for (let normal = Math.round(side.line) - radius; normal <= Math.round(side.line) + radius; normal++) {
      const x = side.axis === 'horizontal' ? along : normal;
      const y = side.axis === 'horizontal' ? normal : along;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      total++;
      dark += mask[y * width + x];
    }
    return dark / Math.max(1, total);
  };
  const recovered: PixelSegment[] = [];
  scanAxes.forEach(side => {
    const from = Math.ceil(side.start), to = Math.floor(side.end);
    let cursor = from;
    while (cursor <= to) {
      if (densityAt(side, cursor) < 0.62) {
        cursor++;
        continue;
      }
      const start = cursor;
      let lastSolid = cursor;
      cursor++;
      while (cursor <= to && (densityAt(side, cursor) >= 0.62 || cursor - lastSolid <= 2)) {
        if (densityAt(side, cursor) >= 0.62) lastSolid = cursor;
        cursor++;
      }
      if (lastSolid - start + 1 >= minimumRun) recovered.push({
        axis: side.axis,
        line: side.line,
        start,
        end: lastSolid,
        thickness: typicalThickness,
      });
    }
  });
  const combined = deduplicateParallelSegments([...segments, ...recovered], typicalThickness);
  snapWallNetwork(combined, { x: 1, y: 1 }, typicalThickness);
  return combined;
};

export const recoverText4gMissingFacadeWallRunsForTest = recoverMissingFacadeWallRuns;

/**
 * Recover a raster-proven interior partition when the main-network pass keeps
 * only the lower/upper continuation of the same wall. This is intentionally
 * limited to two reliable OCR room tags on the same row: the tags locate a
 * likely shared partition, while the continuous thick raster band remains the
 * authority for adding it. Text, dimensions, and room labels alone can never
 * create a wall.
 */
const recoverRasterSupportedInteriorPartitions = (
  segments: PixelSegment[],
  mask: Uint8Array,
  width: number,
  height: number,
  typicalThickness: number,
  roomTextTags: RoomTextTag[],
) => {
  if (segments.length < 4 || roomTextTags.length < 2) return segments;
  const horizontal = segments.filter(segment => segment.axis === 'horizontal');
  const vertical = segments.filter(segment => segment.axis === 'vertical');
  if (horizontal.length < 2) return segments;
  const rowTolerance = Math.max(typicalThickness * 5, height * 0.08);
  const tagTolerance = Math.max(2, typicalThickness * 1.5);
  const result = [...segments];
  let changed = false;
  const candidatePairs: Array<[RoomTextTag, RoomTextTag]> = [];
  for (let first = 0; first < roomTextTags.length; first++) {
    for (let second = first + 1; second < roomTextTags.length; second++) {
      const left = roomTextTags[first], right = roomTextTags[second];
      if (Math.abs(left.y - right.y) > rowTolerance) continue;
      if (Math.abs(left.x - right.x) < typicalThickness * 6) continue;
      candidatePairs.push(left.x < right.x ? [left, right] : [right, left]);
    }
  }
  for (const [leftTag, rightTag] of candidatePairs) {
    const top = horizontal
      .filter(segment => segment.line < Math.min(leftTag.y, rightTag.y)
        && segment.end >= leftTag.x - tagTolerance
        && segment.start <= rightTag.x + tagTolerance)
      .sort((a, b) => b.line - a.line)[0];
    const bottom = horizontal
      .filter(segment => segment.line > Math.max(leftTag.y, rightTag.y)
        && segment.end >= leftTag.x - tagTolerance
        && segment.start <= rightTag.x + tagTolerance)
      .sort((a, b) => a.line - b.line)[0];
    if (!top || !bottom || bottom.line - top.line < typicalThickness * 6) continue;

    const start = Math.ceil(top.line + typicalThickness * 0.8);
    const end = Math.floor(bottom.line - typicalThickness * 0.8);
    const scanMin = Math.ceil(leftTag.x + typicalThickness * 2);
    const scanMax = Math.floor(rightTag.x - typicalThickness * 2);
    if (scanMax <= scanMin || end <= start) continue;
    const normalRadius = Math.max(1, Math.round(typicalThickness * 0.55));
    const columnSupport = (x: number) => {
      let supported = 0;
      for (let y = start; y <= end; y++) {
        let dark = false;
        for (let offset = -normalRadius; offset <= normalRadius; offset++) {
          const sampleX = x + offset;
          if (sampleX >= 0 && sampleX < width && mask[y * width + sampleX]) {
            dark = true;
            break;
          }
        }
        if (dark) supported++;
      }
      return supported / Math.max(1, end - start + 1);
    };
    const candidates = [] as Array<{ x: number; support: number }>;
    for (let x = scanMin; x <= scanMax; x++) {
      const support = columnSupport(x);
      if (support >= 0.9) candidates.push({ x, support });
    }
    if (!candidates.length) continue;
    const runs: Array<typeof candidates> = [];
    for (const candidate of candidates) {
      const run = runs[runs.length - 1];
      if (run && candidate.x === run[run.length - 1].x + 1) run.push(candidate);
      else runs.push([candidate]);
    }
    const band = runs.sort((a, b) => {
      const scoreA = a.length * Math.max(...a.map(item => item.support));
      const scoreB = b.length * Math.max(...b.map(item => item.support));
      return scoreB - scoreA;
    })[0];
    if (!band || band.length < Math.max(3, Math.round(typicalThickness * 0.35))) continue;
    const best = band.slice().sort((a, b) => b.support - a.support)[0];
    const localTop = horizontal
      .filter(segment => segment.line < Math.min(leftTag.y, rightTag.y)
        && segment.start <= best.x + tagTolerance
        && segment.end >= best.x - tagTolerance)
      .sort((a, b) => b.line - a.line)[0] || top;
    const localBottom = horizontal
      .filter(segment => segment.line > Math.max(leftTag.y, rightTag.y)
        && segment.start <= best.x + tagTolerance
        && segment.end >= best.x - tagTolerance)
      .sort((a, b) => a.line - b.line)[0] || bottom;

    const existing = vertical.find(segment =>
      Math.abs(segment.line - best.x) <= Math.max(2, typicalThickness * 1.25)
      && segment.start <= end + typicalThickness
      && segment.end >= start - typicalThickness);
    // This safeguard only extends a retained wall continuation. It never
    // invents a new partition from two labels and a dark raster column.
    if (!existing) continue;
    existing.start = Math.min(existing.start, localTop.line);
    existing.end = Math.max(existing.end, localBottom.line);
    existing.thickness = Math.max(existing.thickness, band.length);
    changed = true;
  }
  return changed ? deduplicateParallelSegments(result, typicalThickness) : segments;
};

export const recoverText4gInteriorPartitionsForTest = recoverRasterSupportedInteriorPartitions;

export const text4gInteriorArchitecturalCurveEvidenceForTest = (
  arc: Text4gNativeArcRun,
  sourceSegments: Text4gFreeformWallSegment[],
  curveSourceSegments: Text4gFreeformWallSegment[],
  axisSegments: PixelSegment[],
  width: number,
  height: number,
  typicalThickness: number,
  active: boolean,
  nestCenter?: Text4gPixelPoint,
  nestTolerance?: number,
) => {
  if (!active || arc.ellipseRadiusX === undefined || arc.ellipseRadiusY === undefined
    || sourceSegments.length < 4) return false;
  const minimumRadius = Math.min(arc.ellipseRadiusX, arc.ellipseRadiusY);
  if (minimumRadius < Math.max(typicalThickness * 4.2, Math.min(width, height) * 0.055)) return false;
  const maximumRadius = Math.max(arc.ellipseRadiusX, arc.ellipseRadiusY);
  if (minimumRadius / Math.max(1e-6, maximumRadius) < 0.82) return false;
  if (nestCenter && Math.hypot(arc.center.x - nestCenter.x, arc.center.y - nestCenter.y)
    > Math.max(typicalThickness * 2.5, nestTolerance || 0)) return false;
  const rotation = arc.ellipseRotation || 0;
  const cosR = Math.cos(rotation), sinR = Math.sin(rotation);
  const parameter = (point: Text4gPixelPoint) => {
    const dx = point.x - arc.center.x, dy = point.y - arc.center.y;
    const localX = dx * cosR + dy * sinR;
    const localY = -dx * sinR + dy * cosR;
    let angle = Math.atan2(localY / Math.max(1e-6, arc.ellipseRadiusY!), localX / Math.max(1e-6, arc.ellipseRadiusX!));
    if (angle < 0) angle += Math.PI * 2;
    return angle;
  };
  const angles = sourceSegments.flatMap(segment => [parameter(segment.p1), parameter(segment.p2)]).sort((a, b) => a - b);
  let largestGap = 0;
  for (let index = 0; index < angles.length; index++) {
    const next = index + 1 < angles.length ? angles[index + 1] : angles[0] + Math.PI * 2;
    largestGap = Math.max(largestGap, next - angles[index]);
  }
  const angularCoverage = Math.PI * 2 - largestGap;
  const sourceLength = sourceSegments.reduce((sum, segment) =>
    sum + Math.hypot(segment.p2.x - segment.p1.x, segment.p2.y - segment.p1.y), 0);
  if (angularCoverage < Math.PI * 1.15 || sourceLength < minimumRadius * 1.35) return false;

  const sourceSet = new Set(sourceSegments);
  const curveResidual = (point: Text4gPixelPoint) => {
    const dx = point.x - arc.center.x, dy = point.y - arc.center.y;
    const localX = dx * cosR + dy * sinR;
    const localY = -dx * sinR + dy * cosR;
    return Math.abs(Math.hypot(
      localX / Math.max(1e-6, arc.ellipseRadiusX!),
      localY / Math.max(1e-6, arc.ellipseRadiusY!),
    ) - 1) * minimumRadius;
  };
  const connectorTolerance = Math.max(3, typicalThickness * 1.65);
  const freeformConnectors = curveSourceSegments.filter(segment => !sourceSet.has(segment)
    && Math.min(curveResidual(segment.p1), curveResidual(segment.p2)) <= connectorTolerance).length;
  const axisConnectors = axisSegments.filter(segment => {
    const p1 = segment.axis === 'horizontal'
      ? { x: segment.start, y: segment.line }
      : { x: segment.line, y: segment.start };
    const p2 = segment.axis === 'horizontal'
      ? { x: segment.end, y: segment.line }
      : { x: segment.line, y: segment.end };
    const midpoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    return Math.min(curveResidual(p1), curveResidual(midpoint), curveResidual(p2)) <= connectorTolerance;
  }).length;
  const connectorCount = freeformConnectors + axisConnectors;
  return connectorCount >= 2
    || (connectorCount >= 1
      && angularCoverage >= Math.PI * 1.5
      && sourceLength >= minimumRadius * 2.8);
};

export interface Text4gConcentricInteriorRingEvidence {
  center: Text4gPixelPoint;
  radius: number;
  support: number;
  intervals: Array<{ start: number; end: number }>;
}

export const text4gShouldRetainHybridCurveModeForTest = (
  geometryMode: Text4gGeometryMode,
  nonAxisExteriorEvidence: number,
  smoothCurvedExteriorEvidence: number,
  distributedCurvedExteriorEvidence: number,
  typicalThickness: number,
  width: number,
  height: number,
) => {
  if (geometryMode !== 'hybrid') return geometryMode === 'curved';
  const minimumDimension = Math.min(width, height);
  const nonAxisThreshold = Math.max(typicalThickness * 8, minimumDimension * 0.12);
  const strongCurveThreshold = Math.max(typicalThickness * 8, minimumDimension * 0.16);
  const distributedCurveThreshold = Math.max(typicalThickness * 10, minimumDimension * 0.18);
  return nonAxisExteriorEvidence >= nonAxisThreshold
    && (smoothCurvedExteriorEvidence >= strongCurveThreshold
      || (distributedCurvedExteriorEvidence >= distributedCurveThreshold
        && distributedCurvedExteriorEvidence >= nonAxisExteriorEvidence * 0.42));
};

export const text4gOpenShellExteriorCurveFamilyEvidenceForTest = (
  arc: Text4gNativeArcRun,
  sourceSegments: Text4gFreeformWallSegment[],
  outsideSourceCount: number,
  width: number,
  height: number,
  typicalThickness: number,
  active: boolean,
  nestCenter?: Text4gPixelPoint,
  nestTolerance?: number,
) => {
  if (!active || sourceSegments.length < 3 || arc.rasterSupport < 0.56) return false;
  const sourceLength = sourceSegments.reduce((sum, segment) =>
    sum + Math.hypot(segment.p2.x - segment.p1.x, segment.p2.y - segment.p1.y), 0);
  if (sourceLength < Math.max(typicalThickness * 7, Math.min(width, height) * 0.1)) return false;
  const orientations = sourceSegments.map(segment => {
    let angle = Math.atan2(segment.p2.y - segment.p1.y, segment.p2.x - segment.p1.x) % Math.PI;
    if (angle < 0) angle += Math.PI;
    return angle;
  });
  let tangentDiversity = 0;
  orientations.forEach(first => orientations.forEach(second => {
    const delta = Math.abs(first - second);
    tangentDiversity = Math.max(tangentDiversity, Math.min(delta, Math.PI - delta));
  }));
  if (tangentDiversity < 0.22) return false;
  if (arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined) {
    const minimumRadius = Math.min(arc.ellipseRadiusX, arc.ellipseRadiusY);
    const maximumRadius = Math.max(arc.ellipseRadiusX, arc.ellipseRadiusY);
    if (minimumRadius < typicalThickness * 3.2 || maximumRadius / minimumRadius > 4.5) return false;
    const centralCircularFamily = !!nestCenter
      && minimumRadius / maximumRadius >= 0.8
      && Math.hypot(arc.center.x - nestCenter.x, arc.center.y - nestCenter.y)
        <= Math.max(typicalThickness * 2.5, nestTolerance || 0);
    if (!centralCircularFamily
      && outsideSourceCount < Math.max(1, Math.ceil(sourceSegments.length * 0.35))) return false;
  } else if (outsideSourceCount < Math.max(1, Math.ceil(sourceSegments.length * 0.35))) {
    return false;
  }
  return true;
};

/**
 * Decide whether an uncovered sample on an already proven dominant exterior
 * ellipse is still backed by raster geometry. Curved windows and doors replace
 * the thick wall band with several thin symbol strokes, so their strongest
 * samples legitimately have no structural-mask hit. Requiring an exceptionally
 * strong symbol band keeps that exception narrower than the ordinary mixed
 * wall/symbol route and prevents faint annotations from completing a curve.
 */
export const text4gDominantEllipseGapHasRasterEvidenceForTest = (
  structuralSupport: number,
  symbolSupport: number,
) => structuralSupport >= 0.46
  || (structuralSupport >= 0.22 && symbolSupport >= 0.58)
  || symbolSupport >= 0.8;

/**
 * Recover a strongly raster-supported circular partition nested inside an
 * already proven curved shell. This detector is deliberately concentric and
 * opt-in: it cannot run for orthogonal/angular plans or for unconstrained
 * offset curves, furniture, plumbing symbols, and door swing arcs.
 */
export const recoverText4gConcentricInteriorRingForTest = (
  darkMask: Uint8Array,
  width: number,
  height: number,
  typicalThickness: number,
  center: Text4gPixelPoint,
  minimumRadius: number,
  maximumRadius: number,
  active: boolean,
): Text4gConcentricInteriorRingEvidence | undefined => {
  if (!active || darkMask.length !== width * height || maximumRadius <= minimumRadius) return undefined;
  const TAU = Math.PI * 2;
  const radiusStart = Math.max(2, Math.ceil(minimumRadius));
  const radiusEnd = Math.min(Math.floor(maximumRadius), Math.floor(Math.min(width, height) * 0.48));
  if (radiusEnd <= radiusStart) return undefined;
  const radialSupport = (radius: number, radialWindow: number, samples: number) => {
    let supported = 0;
    for (let index = 0; index < samples; index++) {
      const angle = TAU * index / samples;
      let dark = false;
      for (let offset = -radialWindow; offset <= radialWindow && !dark; offset++) {
        const x = Math.round(center.x + Math.cos(angle) * (radius + offset));
        const y = Math.round(center.y + Math.sin(angle) * (radius + offset));
        for (let dy = -1; dy <= 1 && !dark; dy++) for (let dx = -1; dx <= 1; dx++) {
          const sampleX = x + dx, sampleY = y + dy;
          if (sampleX >= 0 && sampleX < width && sampleY >= 0 && sampleY < height
            && darkMask[sampleY * width + sampleX]) { dark = true; break; }
        }
      }
      if (dark) supported++;
    }
    return supported / samples;
  };
  let best: { radius: number; support: number; contrast: number; score: number } | undefined;
  const farOffset = Math.max(6, Math.round(typicalThickness * 1.7));
  for (let radius = radiusStart; radius <= radiusEnd; radius++) {
    const support = radialSupport(radius, 1, 180);
    if (support < 0.42) continue;
    const inner = radius - farOffset >= radiusStart ? radialSupport(radius - farOffset, 1, 120) : 0;
    const outer = radius + farOffset <= radiusEnd ? radialSupport(radius + farOffset, 1, 120) : 0;
    const contrast = support - Math.max(inner, outer);
    const score = support + Math.max(0, contrast) * 0.8;
    if (contrast >= 0.1 && (!best || score > best.score)) best = { radius, support, contrast, score };
  }
  if (!best) return undefined;

  const angularSamples = 360;
  const radialWindow = Math.max(2, Math.round(typicalThickness * 0.58));
  const supported = Array.from({ length: angularSamples }, (_, index) => {
    const angle = TAU * index / angularSamples;
    for (let offset = -radialWindow; offset <= radialWindow; offset++) {
      const x = Math.round(center.x + Math.cos(angle) * (best!.radius + offset));
      const y = Math.round(center.y + Math.sin(angle) * (best!.radius + offset));
      if (x >= 0 && x < width && y >= 0 && y < height && darkMask[y * width + x]) return true;
    }
    return false;
  });
  // Anti-aliasing and wall intersections cause only tiny holes; bridge those,
  // but leave normal door-width gaps intact.
  for (let index = 0; index < angularSamples; index++) {
    if (supported[index]) continue;
    let length = 0;
    while (length < 5 && !supported[(index + length) % angularSamples]) length++;
    if (length > 0 && length <= 4
      && supported[(index - 1 + angularSamples) % angularSamples]
      && supported[(index + length) % angularSamples]) {
      for (let fill = 0; fill < length; fill++) supported[(index + fill) % angularSamples] = true;
    }
  }
  const sectorCount = 12;
  const evidencedSectors = Array.from({ length: sectorCount }, (_, sector) => {
    const start = Math.floor(sector * angularSamples / sectorCount);
    const end = Math.floor((sector + 1) * angularSamples / sectorCount);
    return supported.slice(start, end).filter(Boolean).length / Math.max(1, end - start) >= 0.28;
  }).filter(Boolean).length;
  if (evidencedSectors < 9) return undefined;

  const firstGap = supported.findIndex(value => !value);
  const intervals: Array<{ start: number; end: number }> = [];
  if (firstGap < 0) intervals.push({ start: 0, end: TAU - TAU / angularSamples });
  else {
    let cursor = firstGap + 1;
    const limit = firstGap + angularSamples + 1;
    while (cursor < limit) {
      while (cursor < limit && !supported[cursor % angularSamples]) cursor++;
      const start = cursor;
      while (cursor < limit && supported[cursor % angularSamples]) cursor++;
      if (cursor - start >= 6) intervals.push({
        start: TAU * start / angularSamples,
        end: TAU * cursor / angularSamples,
      });
    }
  }
  const coveredSpan = intervals.reduce((sum, interval) => sum + interval.end - interval.start, 0);
  if (intervals.length > 8 || coveredSpan < Math.PI * 1.15) return undefined;
  return { center, radius: best.radius, support: best.support, intervals };
};

const squareDarkCoverage = (
  darkMask: Uint8Array,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
) => {
  const minX = clamp(Math.round(centerX - radius), 0, width - 1);
  const maxX = clamp(Math.round(centerX + radius), 0, width - 1);
  const minY = clamp(Math.round(centerY - radius), 0, height - 1);
  const maxY = clamp(Math.round(centerY + radius), 0, height - 1);
  let dark = 0, total = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      total++;
      if (darkMask[y * width + x]) dark++;
    }
  }
  return dark / Math.max(1, total);
};

/** Detect filled structural blocks at the four wall-network extrema. */
const detectCornerColumns = (
  darkMask: Uint8Array,
  width: number,
  height: number,
  wallBounds: PixelBounds,
  typicalThickness: number,
  wallSegments: PixelSegment[],
): DetectedPixelColumn[] => {
  const axisBounds = wallAxisBounds(wallSegments, wallBounds);
  const corners: PixelPoint[] = [
    { x: axisBounds.minX, y: axisBounds.minY },
    { x: axisBounds.maxX, y: axisBounds.minY },
    { x: axisBounds.maxX, y: axisBounds.maxY },
    { x: axisBounds.minX, y: axisBounds.maxY },
  ];
  const minimumRadius = Math.max(2, Math.floor(typicalThickness * 0.55));
  const maximumRadius = Math.max(minimumRadius, Math.ceil(typicalThickness * 2.2));
  const searchReach = Math.max(2, Math.round(typicalThickness * 0.8));
  return corners.flatMap(corner => {
    let bestRadius = 0;
    let bestCoverage = 0;
    let bestCenter = { ...corner };
    for (let offsetY = -searchReach; offsetY <= searchReach; offsetY += 2) {
      for (let offsetX = -searchReach; offsetX <= searchReach; offsetX += 2) {
        const center = { x: corner.x + offsetX, y: corner.y + offsetY };
        for (let radius = minimumRadius; radius <= maximumRadius; radius++) {
          const coverage = squareDarkCoverage(darkMask, width, height, center.x, center.y, radius);
          // A structural column should fill almost the entire sampled square.
          // The stricter threshold prevents adjoining wall arms from inflating
          // an 18-inch corner column into the next larger preset.
          if (coverage < 0.9) continue;
          if (radius > bestRadius || radius === bestRadius && coverage > bestCoverage) {
            bestRadius = radius;
            bestCoverage = coverage;
            bestCenter = center;
          }
        }
      }
    }
    const size = bestRadius * 2;
    // A normal orthogonal wall junction can form a small filled square around
    // its axis. Require a materially larger block before promoting it to the
    // currently evidenced 18-inch column class.
    const centerShift = Math.max(
      Math.abs(bestCenter.x - corner.x),
      Math.abs(bestCenter.y - corner.y),
    );
    if (size < typicalThickness * 2.2 || centerShift > typicalThickness * 0.25) return [];
    return [{
      x: bestCenter.x,
      y: bestCenter.y,
      widthPixels: size,
      depthPixels: size,
      confidence: clamp(0.68 + bestCoverage * 0.25, 0, 0.94),
      pixelBounds: {
        x0: bestCenter.x - bestRadius,
        y0: bestCenter.y - bestRadius,
        x1: bestCenter.x + bestRadius,
        y1: bestCenter.y + bestRadius,
      },
    }];
  });
};

const detectIsolatedComponentColumns = (
  segments: PixelSegment[],
  typicalThickness: number,
  darkMask: Uint8Array,
  width: number,
  height: number,
): DetectedPixelColumn[] => {
  const minimumSize = typicalThickness * 1.55;
  const candidates = segments.flatMap(segment => {
    const length = segment.end - segment.start;
    if (segment.thickness < minimumSize || length < minimumSize) return [];
    const ratio = Math.min(length, segment.thickness) / Math.max(length, segment.thickness);
    if (ratio < 0.62) return [];
    const size = Math.min(length, segment.thickness);
    const centerAlong = (segment.start + segment.end) / 2;
    const x = segment.axis === 'horizontal' ? centerAlong : segment.line;
    const y = segment.axis === 'horizontal' ? segment.line : centerAlong;
    return [{
      x,
      y,
      widthPixels: size,
      depthPixels: size,
      confidence: 0.86,
      pixelBounds: { x0: x - size / 2, y0: y - size / 2, x1: x + size / 2, y1: y + size / 2 },
    }];
  });
  const unique: DetectedPixelColumn[] = [];
  candidates.forEach(candidate => {
    if (!unique.some(existing => Math.hypot(existing.x - candidate.x, existing.y - candidate.y) <= typicalThickness * 1.5)) {
      unique.push(candidate);
    }
  });
  const horizontalRows: PixelSegment[][] = [];
  segments.filter(segment => segment.axis === 'horizontal').forEach(segment => {
    const row = horizontalRows.find(items => Math.abs(median(items.map(item => item.line)) - segment.line) <= typicalThickness);
    if (row) row.push(segment);
    else horizontalRows.push([segment]);
  });
  const isolatedColumnRow = horizontalRows
    .filter(row => row.length >= 2)
    .sort((a, b) => median(b.map(segment => segment.line)) - median(a.map(segment => segment.line)))[0];
  if (isolatedColumnRow) {
    const line = median(isolatedColumnRow.map(segment => segment.line));
    const minStart = Math.min(...isolatedColumnRow.map(segment => segment.start));
    const maxEnd = Math.max(...isolatedColumnRow.map(segment => segment.end));
    const size = typicalThickness * 1.95;
    for (const x of [minStart + size / 2, maxEnd - size / 2]) {
      if (squareDarkCoverage(darkMask, width, height, x, line, size * 0.42) < 0.5) continue;
      if (unique.some(existing => Math.hypot(existing.x - x, existing.y - line) <= typicalThickness * 1.5)) continue;
      unique.push({
        x,
        y: line,
        widthPixels: size,
        depthPixels: size,
        confidence: 0.82,
        pixelBounds: { x0: x - size / 2, y0: line - size / 2, x1: x + size / 2, y1: line + size / 2 },
      });
    }
  }
  return unique.slice(0, 8);
};

const detectLinearStairs = (
  rawSegments: PixelSegment[],
  typicalThickness: number,
): DetectedPixelStair[] => {
  const thinLimit = Math.max(3, typicalThickness * 0.36);
  const candidates = rawSegments.filter(segment =>
    segment.thickness <= thinLimit && segment.end - segment.start >= typicalThickness * 3.2);
  const matches: { segments: PixelSegment[]; axis: Axis; score: number }[] = [];

  for (const axis of ['horizontal', 'vertical'] as const) {
    const parallel = candidates.filter(segment => segment.axis === axis);
    for (const seed of parallel) {
      const seedLength = seed.end - seed.start;
      const seedCenter = (seed.start + seed.end) / 2;
      const aligned = parallel.filter(segment => {
        const length = segment.end - segment.start;
        const center = (segment.start + segment.end) / 2;
        return length >= seedLength * 0.68 && length <= seedLength * 1.35
          && Math.abs(center - seedCenter) <= Math.max(4, seedLength * 0.18);
      }).sort((a, b) => a.line - b.line);
      for (let startIndex = 0; startIndex < aligned.length; startIndex++) {
        const run = [aligned[startIndex]];
        let expectedSpacing: number | undefined;
        for (let index = startIndex + 1; index < aligned.length; index++) {
          const spacing = aligned[index].line - run[run.length - 1].line;
          if (spacing < 2) continue;
          if (spacing > Math.max(10, typicalThickness * 4.5)) break;
          if (expectedSpacing === undefined) expectedSpacing = spacing;
          if (Math.abs(spacing - expectedSpacing) > Math.max(2, expectedSpacing * 0.32)) break;
          expectedSpacing = (expectedSpacing * (run.length - 1) + spacing) / run.length;
          run.push(aligned[index]);
        }
        if (run.length < 7) continue;
        const commonStart = Math.max(...run.map(segment => segment.start));
        const commonEnd = Math.min(...run.map(segment => segment.end));
        if (commonEnd - commonStart < seedLength * 0.62) continue;
        const score = run.length + (commonEnd - commonStart) / Math.max(1, seedLength);
        matches.push({ segments: run, axis, score });
      }
    }
  }
  const selected: typeof matches = [];
  [...matches].sort((a, b) => b.score - a.score).forEach(match => {
    const overlapsSelected = selected.some(candidate => {
      if (candidate.axis !== match.axis) return false;
      const shared = match.segments.filter(segment => candidate.segments.includes(segment)).length;
      return shared / Math.max(1, Math.min(match.segments.length, candidate.segments.length)) >= 0.5;
    });
    if (!overlapsSelected) selected.push(match);
  });
  return selected.slice(0, 4).map(match => {
    const firstLine = Math.min(...match.segments.map(segment => segment.line));
    const lastLine = Math.max(...match.segments.map(segment => segment.line));
    // Use the common tread span, not the median outer span. A stair beside an
    // exterior wall can otherwise absorb the wall stroke into its width.
    const commonStart = Math.max(...match.segments.map(segment => segment.start));
    const commonEnd = Math.min(...match.segments.map(segment => segment.end));
    const center = (commonStart + commonEnd) / 2;
    return match.axis === 'horizontal'
      ? {
          p1: { x: center, y: firstLine },
          p2: { x: center, y: lastLine },
          widthPixels: commonEnd - commonStart,
          stepCount: Math.max(1, match.segments.length - 1),
          confidence: clamp(0.7 + match.segments.length * 0.025, 0, 0.94),
          pixelBounds: { x0: commonStart, y0: firstLine, x1: commonEnd, y1: lastLine },
        }
      : {
          p1: { x: firstLine, y: center },
          p2: { x: lastLine, y: center },
          widthPixels: commonEnd - commonStart,
          stepCount: Math.max(1, match.segments.length - 1),
          confidence: clamp(0.7 + match.segments.length * 0.025, 0, 0.94),
          pixelBounds: { x0: firstLine, y0: commonStart, x1: lastLine, y1: commonEnd },
        };
  });
};

const detectRailingProjections = (
  darkMask: Uint8Array,
  width: number,
  height: number,
  rawSegments: PixelSegment[],
  wallBounds: PixelBounds,
  typicalThickness: number,
): DetectedRailingProjection[] => {
  const thinLimit = Math.max(3, typicalThickness * 0.38);
  const thin = rawSegments.filter(segment => segment.thickness <= thinLimit);
  const tolerance = Math.max(3, typicalThickness * 1.4);
  // A shallow balcony can sit only a little beyond a thick exterior wall.
  // Requiring 2.5 wall widths hid those explicit three-sided railing symbols
  // (DS12-74). OCR label gating below already rejects unrelated dimension
  // lines, so keep the raster projection threshold deliberately local.
  const minimumProjection = Math.max(6, typicalThickness * 1.2);
  const projections: DetectedRailingProjection[] = [];
  const near = (a: number, b: number) => Math.abs(a - b) <= tolerance;

  // Balcony rails are often drawn as a single hairline with square marker
  // nodes. Those nodes can fragment directional-band extraction, so recover a
  // long outer rail directly from the raster when two transverse connectors
  // visibly tie it back to the main wall frame.
  const scanOuterRail = (axis: Axis) => {
    const lineCount = axis === 'vertical' ? width : height;
    const alongCount = axis === 'vertical' ? height : width;
    const outside = (line: number) => axis === 'vertical'
      ? line < wallBounds.minX - minimumProjection || line > wallBounds.maxX + minimumProjection
      : line < wallBounds.minY - minimumProjection || line > wallBounds.maxY + minimumProjection;
    const found: PixelSegment[] = [];
    for (let line = 0; line < lineCount; line++) {
      if (!outside(line)) continue;
      let start = -1, lastDark = -1;
      for (let along = 0; along <= alongCount; along++) {
        const dark = along < alongCount && darkMask[(axis === 'vertical' ? along * width + line : line * width + along)] === 1;
        if (dark) {
          if (start < 0) start = along;
          lastDark = along;
        }
        if ((!dark && lastDark >= 0 && along - lastDark > 3) || along === alongCount) {
          if (lastDark - start >= typicalThickness * 6) {
            found.push({ axis, line, start, end: lastDark, thickness: 1 });
          }
          start = -1;
          lastDark = -1;
        }
      }
    }
    return found;
  };
  const directVerticalRails = scanOuterRail('vertical');
  const directHorizontalRails = scanOuterRail('horizontal');

  const verticalRails = deduplicateParallelSegments([
    ...thin.filter(segment => segment.axis === 'vertical'
      && (segment.line < wallBounds.minX - minimumProjection || segment.line > wallBounds.maxX + minimumProjection)),
    ...directVerticalRails,
  ], Math.max(2, typicalThickness * 0.25)).filter(segment => segment.end - segment.start >= typicalThickness * 6);
  for (const rail of verticalRails) {
    const side = rail.line < wallBounds.minX ? 'left' : 'right';
    const hostX = side === 'left' ? wallBounds.minX : wallBounds.maxX;
    const connectorSupport = (line: number) => lineDarkSupport(darkMask, width, height,
      { x: rail.line, y: line }, { x: hostX, y: line }, 2);
    const connectorLines = [rail.start, rail.end].map(endpoint => {
      let best = { line: endpoint, support: 0 };
      for (let line = Math.round(endpoint - tolerance); line <= Math.round(endpoint + tolerance); line++) {
        const support = connectorSupport(line);
        if (support > best.support) best = { line, support };
      }
      return best;
    });
    const connectors = rawSegments.filter(segment => segment.axis === 'horizontal'
      && (near(segment.line, rail.start) || near(segment.line, rail.end))
      && Math.min(segment.start, segment.end) <= Math.min(rail.line, hostX) + tolerance
      && Math.max(segment.start, segment.end) >= Math.max(rail.line, hostX) - tolerance);
    const first = connectors.find(segment => near(segment.line, rail.start));
    const second = connectors.find(segment => near(segment.line, rail.end));
    if ((!first || !second) && connectorLines.some(item => item.support < 0.62)) continue;
    const firstLine = first?.line ?? connectorLines[0].line;
    const secondLine = second?.line ?? connectorLines[1].line;
    const connector = (segment: PixelSegment | undefined, line: number): PixelSegment => ({
      axis: 'horizontal', line,
      start: Math.min(rail.line, hostX), end: Math.max(rail.line, hostX),
      thickness: Math.min(segment?.thickness ?? 1, thinLimit),
    });
    projections.push({
      side,
      bounds: { minX: Math.min(rail.line, hostX), maxX: Math.max(rail.line, hostX), minY: firstLine, maxY: secondLine },
      segments: [{ ...rail, start: firstLine, end: secondLine }, connector(first, firstLine), connector(second, secondLine)],
      confidence: 0.86,
    });
  }

  const horizontalRails = deduplicateParallelSegments([
    ...thin.filter(segment => segment.axis === 'horizontal'
      && (segment.line < wallBounds.minY - minimumProjection || segment.line > wallBounds.maxY + minimumProjection)),
    ...directHorizontalRails,
  ], Math.max(2, typicalThickness * 0.25)).filter(segment => segment.end - segment.start >= typicalThickness * 6);
  for (const rail of horizontalRails) {
    const side = rail.line < wallBounds.minY ? 'top' : 'bottom';
    const hostY = side === 'top' ? wallBounds.minY : wallBounds.maxY;
    const connectorSupport = (line: number) => lineDarkSupport(darkMask, width, height,
      { x: line, y: rail.line }, { x: line, y: hostY }, 2);
    const connectorLines = [rail.start, rail.end].map(endpoint => {
      let best = { line: endpoint, support: 0 };
      for (let line = Math.round(endpoint - tolerance); line <= Math.round(endpoint + tolerance); line++) {
        const support = connectorSupport(line);
        if (support > best.support) best = { line, support };
      }
      return best;
    });
    const connectors = rawSegments.filter(segment => segment.axis === 'vertical'
      && (near(segment.line, rail.start) || near(segment.line, rail.end))
      && Math.min(segment.start, segment.end) <= Math.min(rail.line, hostY) + tolerance
      && Math.max(segment.start, segment.end) >= Math.max(rail.line, hostY) - tolerance);
    const first = connectors.find(segment => near(segment.line, rail.start));
    const second = connectors.find(segment => near(segment.line, rail.end));
    if ((!first || !second) && connectorLines.some(item => item.support < 0.62)) continue;
    const firstLine = first?.line ?? connectorLines[0].line;
    const secondLine = second?.line ?? connectorLines[1].line;
    const connector = (segment: PixelSegment | undefined, line: number): PixelSegment => ({
      axis: 'vertical', line,
      start: Math.min(rail.line, hostY), end: Math.max(rail.line, hostY),
      thickness: Math.min(segment?.thickness ?? 1, thinLimit),
    });
    projections.push({
      side,
      bounds: { minX: firstLine, maxX: secondLine, minY: Math.min(rail.line, hostY), maxY: Math.max(rail.line, hostY) },
      segments: [{ ...rail, start: firstLine, end: secondLine }, connector(first, firstLine), connector(second, secondLine)],
      confidence: 0.86,
    });
  }
  return projections.sort((a, b) => {
    const areaA = (a.bounds.maxX - a.bounds.minX) * (a.bounds.maxY - a.bounds.minY);
    const areaB = (b.bounds.maxX - b.bounds.minX) * (b.bounds.maxY - b.bounds.minY);
    return areaB - areaA;
  }).slice(0, 2);
};

/**
 * Dimension strings and their two extension lines can look like a three-sided
 * balcony railing. When OCR has found an explicit open-space label, retain only
 * the geometrically detected projection nearest that label. Without an
 * explicit open-space label, a three-sided thin component is ambiguous with
 * dimension lines and offset walls and must remain ordinary raster geometry.
 */
const selectRailingProjectionsBySpaceEvidence = (
  projections: DetectedRailingProjection[],
  roomTextTags: RoomTextTag[],
  wallBounds: PixelBounds,
  typicalThickness: number,
) => {
  const openSpaceTags = roomTextTags.filter(tag => /balcony|terrace|loggia|porch|deck/i.test(tag.label));
  if (!projections.length) return projections;
  if (!openSpaceTags.length) return [];
  const distanceToBounds = (tag: RoomTextTag, bounds: PixelBounds) => {
    const dx = tag.x < bounds.minX ? bounds.minX - tag.x : tag.x > bounds.maxX ? tag.x - bounds.maxX : 0;
    const dy = tag.y < bounds.minY ? bounds.minY - tag.y : tag.y > bounds.maxY ? tag.y - bounds.maxY : 0;
    return Math.hypot(dx, dy);
  };
  const selected = new Set<DetectedRailingProjection>();
  openSpaceTags.forEach(tag => {
    const ranked = projections.map(projection => {
      const span = Math.max(
        projection.bounds.maxX - projection.bounds.minX,
        projection.bounds.maxY - projection.bounds.minY,
      );
      return { projection, distance: distanceToBounds(tag, projection.bounds), span };
    }).sort((a, b) => a.distance - b.distance);
    const nearest = ranked[0];
    // A label may sit just inside the host wall rather than inside the open
    // projection itself. Accept that small offset, but never a remote facade
    // dimension line on the opposite side of the plan.
    if (nearest && nearest.distance <= Math.max(typicalThickness * 6, nearest.span * 0.45)) {
      selected.add(nearest.projection);
    }
  });
  return Array.from(selected);
};

/** Recover thin balcony edges around an OCR-confirmed open-space label. */
const recoverTaggedRailingSegments = (
  segments: PixelSegment[],
  roomTextTags: RoomTextTag[],
  bounds: PixelBounds,
  typicalThickness: number,
  width: number,
  height: number,
) => {
  const tags = roomTextTags.filter(tag => /balcony|terrace|loggia|deck|porch/i.test(tag.label));
  if (!tags.length) return [];
  // Railing symbols use hairline strokes even when the exterior wall is very
  // thick. Capping this local threshold prevents a host wall face from taking
  // one of the three connected-symbol slots (and hiding the opposite rail).
  const thinLimit = Math.max(3, Math.min(6, typicalThickness * 0.45));
  const boundaryTolerance = Math.max(3, typicalThickness * 1.4);
  const projectionOffset = Math.max(4, typicalThickness * 0.8);
  const connectionTolerance = Math.max(4, typicalThickness * 1.8);
  const tagReach = Math.max(width, height) * 0.2;
  const pointDistance = (tag: RoomTextTag, segment: PixelSegment) => {
    if (segment.axis === 'horizontal') {
      const along = clamp(tag.x, segment.start, segment.end);
      return Math.hypot(tag.x - along, tag.y - segment.line);
    }
    const along = clamp(tag.y, segment.start, segment.end);
    return Math.hypot(tag.x - segment.line, tag.y - along);
  };
  const endpointPoints = (segment: PixelSegment): PixelPoint[] => segment.axis === 'horizontal'
    ? [{ x: segment.start, y: segment.line }, { x: segment.end, y: segment.line }]
    : [{ x: segment.line, y: segment.start }, { x: segment.line, y: segment.end }];
  const connected = (first: PixelSegment, second: PixelSegment) => endpointPoints(first).some(a =>
    endpointPoints(second).some(b => Math.hypot(a.x - b.x, a.y - b.y) <= connectionTolerance));
  const recovered: PixelSegment[] = [];
  tags.forEach(tag => {
    const candidates = deduplicateParallelSegments(segments.filter(segment => {
      if (segment.thickness > thinLimit || segment.end - segment.start < typicalThickness * 3.5) return false;
      if (pointDistance(tag, segment) > tagReach) return false;
      // Every member of a projected railing symbol either sits outside the
      // wall frame or connects the frame to that exterior offset. Merely
      // touching the envelope is insufficient: windows and wall faces do so
      // as well and must never consume a railing-component slot.
      return segment.axis === 'horizontal'
        ? segment.line < bounds.minY - projectionOffset
          || segment.line > bounds.maxY + projectionOffset
          || segment.start < bounds.minX - projectionOffset
          || segment.end > bounds.maxX + projectionOffset
        : segment.line < bounds.minX - projectionOffset
          || segment.line > bounds.maxX + projectionOffset
          || segment.start < bounds.minY - projectionOffset
          || segment.end > bounds.maxY + projectionOffset;
    }), Math.max(2, typicalThickness * 0.25));
    // Start from the actual exterior edge, not merely the thin stroke nearest
    // the BALCONY text. Interior windows and the host wall can extend a few
    // pixels past an axis bound; they are not railing seeds. Once an exterior
    // seed is proven, the connected traversal may still retain its side
    // returns back to the facade.
    const exteriorSeeds = candidates.filter(segment => segment.axis === 'horizontal'
      ? segment.line < bounds.minY - projectionOffset || segment.line > bounds.maxY + projectionOffset
      : segment.line < bounds.minX - projectionOffset || segment.line > bounds.maxX + projectionOffset);
    const seed = [...exteriorSeeds].sort((a, b) =>
      pointDistance(tag, a) - pointDistance(tag, b)
      || (b.end - b.start) - (a.end - a.start))[0];
    if (!seed) return;
    const projectionDepth = seed.axis === 'horizontal'
      ? Math.min(Math.abs(seed.line - bounds.minY), Math.abs(seed.line - bounds.maxY))
      : Math.min(Math.abs(seed.line - bounds.minX), Math.abs(seed.line - bounds.maxX));
    const belongsToSeedProjection = (candidate: PixelSegment) => {
      if (candidate.axis === seed.axis) {
        return Math.abs(candidate.line - seed.line) <= boundaryTolerance;
      }
      // Side returns may connect the outer rail back to the facade, but a
      // long thin wall face or dimension extension that traverses the whole
      // plan must not join unrelated inner strokes into the railing group.
      return candidate.end - candidate.start
        <= projectionDepth + connectionTolerance * 2;
    };
    const selected = [seed];
    let expanded = true;
    // A double-line railing symbol can yield paired strokes for one side.
    // Traverse the small connected component far enough to reach every side;
    // collinear deduplication below still emits one semantic rail per side.
    while (expanded && selected.length < 6) {
      expanded = false;
      const next = candidates.filter(candidate => !selected.includes(candidate)
        && belongsToSeedProjection(candidate))
        .filter(candidate => selected.some(existing => connected(existing, candidate)))
        .sort((a, b) => pointDistance(tag, a) - pointDistance(tag, b))[0];
      if (next) {
        selected.push(next);
        expanded = true;
      }
    }
    if (selected.length === 1 && seed.end - seed.start < typicalThickness * 6) return;
    selected.forEach(segment => {
      if (!recovered.some(existing => connected(existing, segment)
        && existing.axis === segment.axis
        && Math.abs(existing.line - segment.line) <= boundaryTolerance
        && Math.abs(existing.start - segment.start) <= connectionTolerance
        && Math.abs(existing.end - segment.end) <= connectionTolerance)) recovered.push(segment);
    });
  });
  // A double-line railing convention is one semantic boundary, not two
  // railings. Collapse only close, strongly overlapping parallel strokes;
  // perpendicular returns and opposite balcony sides remain independent.
  return [...recovered]
    .sort((first, second) => (second.end - second.start) - (first.end - first.start))
    .filter((segment, index, ordered) => !ordered.slice(0, index).some(host => {
      if (host.axis !== segment.axis
        || Math.abs(host.line - segment.line) > Math.max(6, typicalThickness * 0.9)) return false;
      const overlap = Math.min(host.end, segment.end) - Math.max(host.start, segment.start);
      const shorter = Math.min(host.end - host.start, segment.end - segment.start);
      return overlap > 0 && overlap / Math.max(1, shorter) >= 0.72;
    }));
};

/**
 * Filled corner columns can expose their own short edges to the directional
 * band detector. Those are not additional walls. Remove only segments fully
 * contained by a detected column and snap adjacent wall endpoints to the
 * column axis, leaving every non-column wall untouched.
 */
const canonicalizeWallsAtDetectedColumns = (
  segments: PixelSegment[],
  columns: DetectedPixelColumn[],
  typicalThickness: number,
  alignIncidentAxis = false,
) => {
  if (!columns.length) return segments;
  const tolerance = Math.max(2, typicalThickness * 0.4);
  const insideColumn = (segment: PixelSegment, column: DetectedPixelColumn) => {
    const bounds = column.pixelBounds;
    if (segment.axis === 'horizontal') {
      return segment.line >= bounds.y0 - tolerance && segment.line <= bounds.y1 + tolerance
        && segment.start >= bounds.x0 - tolerance && segment.end <= bounds.x1 + tolerance;
    }
    return segment.line >= bounds.x0 - tolerance && segment.line <= bounds.x1 + tolerance
      && segment.start >= bounds.y0 - tolerance && segment.end <= bounds.y1 + tolerance;
  };
  const result = segments.filter(segment => !columns.some(column => insideColumn(segment, column)))
    .map(segment => ({ ...segment }));
  result.forEach(segment => {
    const endpointColumn = (endpoint: number) => columns
      .filter(column => segment.axis === 'horizontal'
        ? segment.line >= column.pixelBounds.y0 - tolerance && segment.line <= column.pixelBounds.y1 + tolerance
          && endpoint >= column.pixelBounds.x0 - tolerance && endpoint <= column.pixelBounds.x1 + tolerance
        : segment.line >= column.pixelBounds.x0 - tolerance && segment.line <= column.pixelBounds.x1 + tolerance
          && endpoint >= column.pixelBounds.y0 - tolerance && endpoint <= column.pixelBounds.y1 + tolerance)
      .sort((a, b) => {
        const centerA = segment.axis === 'horizontal' ? a.x : a.y;
        const centerB = segment.axis === 'horizontal' ? b.x : b.y;
        return Math.abs(endpoint - centerA) - Math.abs(endpoint - centerB);
      })[0];
    const startColumn = endpointColumn(segment.start);
    const endColumn = endpointColumn(segment.end);
    if (startColumn) segment.start = segment.axis === 'horizontal' ? startColumn.x : startColumn.y;
    if (endColumn) segment.end = segment.axis === 'horizontal' ? endColumn.x : endColumn.y;
    if (alignIncidentAxis && (startColumn || endColumn)) {
      const incident = startColumn || endColumn!;
      const columnAxis = segment.axis === 'horizontal' ? incident.y : incident.x;
      if (Math.abs(segment.line - columnAxis) <= Math.max(tolerance, typicalThickness * 2)) {
        segment.line = columnAxis;
      }
    }
    // A facade joining two evidenced corner columns uses their common axis.
    // This makes perpendicular walls terminate at one intersection instead of
    // stopping on different faces of the filled column block.
    if (startColumn && endColumn && startColumn !== endColumn) {
      segment.line = segment.axis === 'horizontal'
        ? (startColumn.y + endColumn.y) / 2
        : (startColumn.x + endColumn.x) / 2;
    }
  });
  snapWallNetwork(result, { x: 1, y: 1 }, typicalThickness);
  return result;
};

/**
 * The editor represents an opening as an element hosted by one continuous wall;
 * the opening itself cuts the rendered wall. A wide, strongly evidenced raster
 * opening can survive symbol recovery even when the two jamb-side wall bands
 * were too far apart for the initial collinear merge. Join only the two bands
 * that terminate at that recovered gap so preview hosting and main-canvas
 * validation use the same complete host wall.
 */
const mergeWallsAcrossHostedGaps = (
  segments: PixelSegment[],
  hostedGaps: PixelGap[],
  typicalThickness: number,
) => {
  const result = segments.map(segment => ({ ...segment }));
  const lineTolerance = Math.max(2, typicalThickness * 1.2);
  const endpointTolerance = Math.max(2, typicalThickness * 0.8);
  hostedGaps.forEach(gap => {
    const alreadySpansGap = result.some(segment => segment.axis === gap.axis
      && Math.abs(segment.line - gap.line) <= lineTolerance
      && segment.start <= gap.start + endpointTolerance
      && segment.end >= gap.end - endpointTolerance);
    if (alreadySpansGap) return;
    const before = result.filter(segment => segment.axis === gap.axis
      && Math.abs(segment.line - gap.line) <= lineTolerance
      && Math.abs(segment.end - gap.start) <= endpointTolerance)
      .sort((a, b) => Math.abs(a.end - gap.start) - Math.abs(b.end - gap.start))[0];
    const after = result.filter(segment => segment.axis === gap.axis
      && Math.abs(segment.line - gap.line) <= lineTolerance
      && Math.abs(segment.start - gap.end) <= endpointTolerance)
      .sort((a, b) => Math.abs(a.start - gap.end) - Math.abs(b.start - gap.end))[0];
    if (!before || !after || before === after) return;
    const beforeWeight = Math.max(1, before.end - before.start);
    const afterWeight = Math.max(1, after.end - after.start);
    const merged: PixelSegment = {
      axis: gap.axis,
      line: (before.line * beforeWeight + after.line * afterWeight) / (beforeWeight + afterWeight),
      start: Math.min(before.start, after.start),
      end: Math.max(before.end, after.end),
      thickness: Math.max(before.thickness, after.thickness, gap.thickness),
    };
    result.splice(result.indexOf(before), 1);
    result.splice(result.indexOf(after), 1);
    result.push(merged);
  });
  snapWallNetwork(result, { x: 1, y: 1 }, typicalThickness);
  return result;
};

/**
 * Collapse only overlapping or virtually touching collinear wall runs. Real
 * raster gaps remain untouched unless an evidenced hosted opening joined them
 * earlier. This removes duplicate junction fragments without inventing walls
 * across open-plan edges.
 */
const mergeTouchingCollinearWallSegments = (
  segments: PixelSegment[],
  pixelScale: { x: number; y: number },
  typicalThickness: number,
) => {
  const merged: PixelSegment[] = [];
  for (const axis of ['horizontal', 'vertical'] as const) {
    const alongScale = axis === 'horizontal' ? pixelScale.x : pixelScale.y;
    const normalScale = axis === 'horizontal' ? pixelScale.y : pixelScale.x;
    const lineTolerance = Math.max(1, Math.min(typicalThickness * 0.45, 0.04 / Math.max(1e-6, normalScale)));
    const joinTolerance = Math.max(1, Math.min(typicalThickness * 0.5, 0.06 / Math.max(1e-6, alongScale)));
    const groups: PixelSegment[][] = [];
    segments.filter(segment => segment.axis === axis).forEach(segment => {
      const group = groups.find(items => Math.abs(median(items.map(item => item.line)) - segment.line) <= lineTolerance);
      if (group) group.push(segment);
      else groups.push([segment]);
    });
    groups.forEach(group => {
      const intervals = [...group].sort((a, b) => a.start - b.start || a.end - b.end);
      let current = { ...intervals[0] };
      for (let index = 1; index < intervals.length; index++) {
        const next = intervals[index];
        if (next.start > current.end + joinTolerance) {
          merged.push(current);
          current = { ...next };
          continue;
        }
        const currentWeight = Math.max(1, current.end - current.start);
        const nextWeight = Math.max(1, next.end - next.start);
        current.line = (current.line * currentWeight + next.line * nextWeight) / (currentWeight + nextWeight);
        current.start = Math.min(current.start, next.start);
        current.end = Math.max(current.end, next.end);
        current.thickness = Math.max(current.thickness, next.thickness);
      }
      merged.push(current);
    });
  }
  snapWallNetwork(merged, pixelScale, typicalThickness);
  return merged;
};

const isGapOnFootprintEdge = (gap: PixelGap, footprint: PixelPoint[], tolerance: number) => {
  const requiredOverlap = Math.max(1, gap.end - gap.start) * 0.75;
  return footprint.slice(0, -1).some((point, index) => {
    const next = footprint[index + 1];
    if (!next) return false;
    if (gap.axis === 'horizontal') {
      if (Math.abs(point.y - next.y) > tolerance || Math.abs(gap.line - point.y) > tolerance) return false;
      const overlap = Math.min(gap.end, Math.max(point.x, next.x)) - Math.max(gap.start, Math.min(point.x, next.x));
      return overlap >= requiredOverlap;
    }
    if (Math.abs(point.x - next.x) > tolerance || Math.abs(gap.line - point.x) > tolerance) return false;
    const overlap = Math.min(gap.end, Math.max(point.y, next.y)) - Math.max(gap.start, Math.min(point.y, next.y));
    return overlap >= requiredOverlap;
  });
};

const hasCompleteRectangularWallFrame = (
  segments: PixelSegment[],
  bounds: PixelBounds,
  typicalThickness: number,
) => {
  const coverage = (axis: Axis, line: number, start: number, end: number) => {
    const tolerance = typicalThickness * 1.5;
    const intervals = segments
      .filter(segment => segment.axis === axis && Math.abs(segment.line - line) <= tolerance)
      .map(segment => ({ start: Math.max(start, segment.start), end: Math.min(end, segment.end) }))
      .filter(interval => interval.end > interval.start)
      .sort((a, b) => a.start - b.start);
    let covered = 0, cursor = start;
    for (const interval of intervals) {
      if (interval.end <= cursor) continue;
      covered += Math.max(0, interval.end - Math.max(cursor, interval.start));
      cursor = Math.max(cursor, interval.end);
    }
    return covered / Math.max(1, end - start);
  };
  const horizontalSpan = [bounds.minX, bounds.maxX] as const;
  const verticalSpan = [bounds.minY, bounds.maxY] as const;
  return coverage('horizontal', bounds.minY, ...horizontalSpan) >= 0.72
    && coverage('horizontal', bounds.maxY, ...horizontalSpan) >= 0.72
    && coverage('vertical', bounds.minX, ...verticalSpan) >= 0.72
    && coverage('vertical', bounds.maxX, ...verticalSpan) >= 0.72;
};

const traceFootprint = (
  barrier: Uint8Array,
  outside: Uint8Array,
  width: number,
  height: number,
) => {
  const included = new Uint8Array(width * height);
  for (let index = 0; index < included.length; index++) included[index] = outside[index] ? 0 : 1;

  // Retain only the largest connected non-outside component. This removes
  // detached annotation strokes and dimension lines from the slab outline.
  const component = new Int32Array(width * height);
  const queue = new Int32Array(width * height);
  let componentId = 0, largestId = 0, largestArea = 0;
  for (let start = 0; start < included.length; start++) {
    if (!included[start] || component[start]) continue;
    componentId++;
    let head = 0, tail = 0, area = 0;
    queue[tail++] = start;
    component[start] = componentId;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width, y = Math.floor(index / width);
      area++;
      const add = (next: number) => {
        if (!included[next] || component[next]) return;
        component[next] = componentId;
        queue[tail++] = next;
      };
      if (x > 0) add(index - 1);
      if (x + 1 < width) add(index + 1);
      if (y > 0) add(index - width);
      if (y + 1 < height) add(index + width);
    }
    if (area > largestArea) { largestArea = area; largestId = componentId; }
  }
  if (!largestId) return [];

  const edges: PixelEdge[] = [];
  const addEdge = (ax: number, ay: number, bx: number, by: number) => edges.push({ a: { x: ax, y: ay }, b: { x: bx, y: by }, used: false });
  const belongs = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && component[y * width + x] === largestId;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!belongs(x, y)) continue;
      if (!belongs(x, y - 1)) addEdge(x, y, x + 1, y);
      if (!belongs(x + 1, y)) addEdge(x + 1, y, x + 1, y + 1);
      if (!belongs(x, y + 1)) addEdge(x + 1, y + 1, x, y + 1);
      if (!belongs(x - 1, y)) addEdge(x, y + 1, x, y);
    }
  }
  const byStart = new Map<string, PixelEdge[]>();
  edges.forEach(edge => {
    const key = pointKey(edge.a);
    const list = byStart.get(key) || [];
    list.push(edge);
    byStart.set(key, list);
  });
  const loops: PixelPoint[][] = [];
  for (const initial of edges) {
    if (initial.used) continue;
    const loop: PixelPoint[] = [initial.a];
    let edge: PixelEdge | undefined = initial;
    while (edge && !edge.used) {
      edge.used = true;
      loop.push(edge.b);
      if (pointKey(edge.b) === pointKey(loop[0])) break;
      edge = (byStart.get(pointKey(edge.b)) || []).find(candidate => !candidate.used);
    }
    if (loop.length >= 4 && pointKey(loop[0]) === pointKey(loop[loop.length - 1])) loops.push(loop);
  }
  const area = (loop: PixelPoint[]) => Math.abs(loop.slice(0, -1).reduce((sum, point, index) => {
    const next = loop[(index + 1) % (loop.length - 1)];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
  const loop = loops.sort((a, b) => area(b) - area(a))[0];
  if (!loop) return [];
  const simplified: PixelPoint[] = [];
  for (const point of loop) {
    simplified.push(point);
    while (simplified.length >= 3) {
      const a = simplified[simplified.length - 3];
      const b = simplified[simplified.length - 2];
      const c = simplified[simplified.length - 1];
      if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) simplified.splice(simplified.length - 2, 1);
      else break;
    }
  }
  return simplified;
};

const rectangularFootprint = (bounds: PixelBounds): PixelPoint[] => [
  { x: bounds.minX, y: bounds.minY },
  { x: bounds.maxX, y: bounds.minY },
  { x: bounds.maxX, y: bounds.maxY },
  { x: bounds.minX, y: bounds.maxY },
  { x: bounds.minX, y: bounds.minY },
];

const rectangularFootprintWithProjection = (
  bounds: PixelBounds,
  projection: DetectedRailingProjection,
): PixelPoint[] => {
  if (projection.side === 'left') return [
    { x: bounds.minX, y: bounds.minY }, { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY }, { x: bounds.minX, y: bounds.maxY },
    { x: bounds.minX, y: projection.bounds.maxY }, { x: projection.bounds.minX, y: projection.bounds.maxY },
    { x: projection.bounds.minX, y: projection.bounds.minY }, { x: bounds.minX, y: projection.bounds.minY },
    { x: bounds.minX, y: bounds.minY },
  ];
  if (projection.side === 'right') return [
    { x: bounds.minX, y: bounds.minY }, { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: projection.bounds.minY }, { x: projection.bounds.maxX, y: projection.bounds.minY },
    { x: projection.bounds.maxX, y: projection.bounds.maxY }, { x: bounds.maxX, y: projection.bounds.maxY },
    { x: bounds.maxX, y: bounds.maxY }, { x: bounds.minX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.minY },
  ];
  if (projection.side === 'top') return [
    { x: bounds.minX, y: bounds.minY }, { x: projection.bounds.minX, y: bounds.minY },
    { x: projection.bounds.minX, y: projection.bounds.minY }, { x: projection.bounds.maxX, y: projection.bounds.minY },
    { x: projection.bounds.maxX, y: bounds.minY }, { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY }, { x: bounds.minX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.minY },
  ];
  return [
    { x: bounds.minX, y: bounds.minY }, { x: bounds.maxX, y: bounds.minY },
    { x: bounds.maxX, y: bounds.maxY }, { x: projection.bounds.maxX, y: bounds.maxY },
    { x: projection.bounds.maxX, y: projection.bounds.maxY }, { x: projection.bounds.minX, y: projection.bounds.maxY },
    { x: projection.bounds.minX, y: bounds.maxY }, { x: bounds.minX, y: bounds.maxY },
    { x: bounds.minX, y: bounds.minY },
  ];
};

const simplifyFootprint = (input: PixelPoint[], notchTolerance: number) => {
  let points = input.map(point => ({ ...point }));
  if (points.length > 1 && pointKey(points[0]) === pointKey(points[points.length - 1])) points.pop();
  points = points.filter((point, index) => index === 0 || pointKey(point) !== pointKey(points[index - 1]));

  const removeCollinear = () => {
    let changed = true;
    while (changed && points.length > 4) {
      changed = false;
      for (let index = 0; index < points.length; index++) {
        const previous = points[(index - 1 + points.length) % points.length];
        const point = points[index];
        const next = points[(index + 1) % points.length];
        if ((previous.x === point.x && point.x === next.x) || (previous.y === point.y && point.y === next.y)) {
          points.splice(index, 1);
          changed = true;
          break;
        }
      }
    }
  };
  removeCollinear();

  // Collapse pixel-scale rectangular detours created where wall masks overlap.
  // Architectural recesses remain because their connector is much wider than
  // the detected wall thickness.
  let changed = true;
  while (changed && points.length > 6) {
    changed = false;
    for (let index = 0; index <= points.length - 4; index++) {
      const [a, b, c, d] = points.slice(index, index + 4);
      const connector = Math.hypot(b.x - c.x, b.y - c.y);
      const reconnectsOrthogonally = a.x === d.x || a.y === d.y;
      if (connector > notchTolerance || !reconnectsOrthogonally) continue;
      points.splice(index + 1, 2);
      changed = true;
      removeCollinear();
      break;
    }
  }
  if (points.length) points.push({ ...points[0] });
  return points;
};

const validateFootprint = (
  traced: PixelPoint[],
  fallbackBounds: PixelBounds,
  typicalThickness: number,
) => {
  if (traced.length < 4) return rectangularFootprint(fallbackBounds);
  const candidate = simplifyFootprint(traced, Math.max(2, typicalThickness * 1.25));
  if (candidate.length < 5) return rectangularFootprint(fallbackBounds);
  const open = candidate.slice(0, -1);
  const bounds: PixelBounds = {
    minX: Math.min(...open.map(point => point.x)),
    maxX: Math.max(...open.map(point => point.x)),
    minY: Math.min(...open.map(point => point.y)),
    maxY: Math.max(...open.map(point => point.y)),
  };
  const boxWidth = Math.max(1, bounds.maxX - bounds.minX);
  const boxHeight = Math.max(1, bounds.maxY - bounds.minY);
  const area = Math.abs(open.reduce((sum, point, index) => {
    const next = open[(index + 1) % open.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
  const edgeLengths = open.map((point, index) => {
    const next = open[(index + 1) % open.length];
    return Math.hypot(next.x - point.x, next.y - point.y);
  });
  const shortEdgeCount = edgeLengths.filter(length => length < Math.max(2, typicalThickness * 0.75)).length;
  const perimeter = edgeLengths.reduce((sum, length) => sum + length, 0);
  const valid = open.length <= 48 &&
    area / (boxWidth * boxHeight) >= 0.35 &&
    shortEdgeCount / edgeLengths.length <= 0.25 &&
    perimeter <= 4 * (boxWidth + boxHeight);
  return valid ? candidate : rectangularFootprint(fallbackBounds);
};

const simplifyFreeformFootprint = (traced: PixelPoint[], tolerance: number) => {
  const open = traced.length > 1 && pointKey(traced[0]) === pointKey(traced[traced.length - 1])
    ? traced.slice(0, -1)
    : traced;
  if (open.length < 3) return traced;
  const pointToSegmentDistance = (point: PixelPoint, first: PixelPoint, last: PixelPoint) => {
    const dx = last.x - first.x, dy = last.y - first.y;
    const denominator = Math.max(1e-6, dx * dx + dy * dy);
    const t = clamp(((point.x - first.x) * dx + (point.y - first.y) * dy) / denominator, 0, 1);
    return Math.hypot(point.x - first.x - dx * t, point.y - first.y - dy * t);
  };
  const rdp = (points: PixelPoint[]): PixelPoint[] => {
    if (points.length <= 2) return points;
    let split = -1, maximum = -1;
    for (let index = 1; index < points.length - 1; index++) {
      const error = pointToSegmentDistance(points[index], points[0], points[points.length - 1]);
      if (error > maximum) { maximum = error; split = index; }
    }
    if (maximum <= tolerance || split < 0) return [points[0], points[points.length - 1]];
    return [...rdp(points.slice(0, split + 1)).slice(0, -1), ...rdp(points.slice(split))];
  };
  let opposite = 1, maximumSpan = 0;
  for (let index = 1; index < open.length; index++) {
    const span = Math.hypot(open[index].x - open[0].x, open[index].y - open[0].y);
    if (span > maximumSpan) { maximumSpan = span; opposite = index; }
  }
  const firstHalf = rdp(open.slice(0, opposite + 1));
  const secondHalf = rdp([...open.slice(opposite), open[0]]);
  const simplified = [...firstHalf.slice(0, -1), ...secondHalf];
  if (simplified.length) simplified.push({ ...simplified[0] });
  return simplified;
};

const validateFreeformFootprint = (
  traced: PixelPoint[],
  fallbackBounds: PixelBounds,
  typicalThickness: number,
) => {
  if (traced.length < 4) return rectangularFootprint(fallbackBounds);
  const candidate = simplifyFreeformFootprint(traced, Math.max(1.5, typicalThickness * 0.32));
  if (candidate.length < 5) return rectangularFootprint(fallbackBounds);
  const open = candidate.slice(0, -1);
  const bounds: PixelBounds = {
    minX: Math.min(...open.map(point => point.x)), maxX: Math.max(...open.map(point => point.x)),
    minY: Math.min(...open.map(point => point.y)), maxY: Math.max(...open.map(point => point.y)),
  };
  const boxArea = Math.max(1, (bounds.maxX - bounds.minX) * (bounds.maxY - bounds.minY));
  const area = Math.abs(open.reduce((sum, point, index) => {
    const next = open[(index + 1) % open.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
  const perimeter = open.reduce((sum, point, index) => sum + Math.hypot(
    open[(index + 1) % open.length].x - point.x,
    open[(index + 1) % open.length].y - point.y,
  ), 0);
  const valid = open.length <= 128
    && area / boxArea >= 0.28
    && perimeter <= 5.5 * ((bounds.maxX - bounds.minX) + (bounds.maxY - bounds.minY));
  return valid ? candidate : rectangularFootprint(fallbackBounds);
};

const canonicalRoomName = (rawName: string, index: number, count: number) => {
  const name = rawName.replace(/\([^)]*\)/g, ' ').replace(/\bwith\b[\s\S]*/i, '').replace(/\s+/g, ' ').trim();
  if (/master.*bed|primary.*bed/i.test(name)) return 'Master Bedroom';
  if (/secondary.*bed|guest.*bed/i.test(name)) return count > 1 ? `Bedroom ${index + 1}` : 'Secondary Bedroom';
  if (/bed(room)?/i.test(name)) return index === 0 && count > 1 ? 'Master Bedroom' : count > 1 ? `Bedroom ${index + 1}` : 'Bedroom';
  if (/ensuite|attached.*bath/i.test(name)) return 'Ensuite';
  if (/powder|owder/i.test(name)) return 'Powder Room';
  if (/bath|toilet|washroom/i.test(name)) return count > 1 ? (index === 0 ? 'Ensuite' : `Bathroom ${index + 1}`) : 'Bathroom';
  if (/living.*dining|lounge.*dining/i.test(name)) return 'Living / Dining';
  if (/living|lounge|family room/i.test(name)) return 'Living Room';
  if (/dining/i.test(name)) return 'Dining Area';
  if (/kitchen/i.test(name)) return 'Kitchen';
  if (/foyer|entry|entrance lobby|reception/i.test(name)) return 'Foyer';
  if (/corridor|hallway|passage/i.test(name)) return 'Corridor';
  if (/walk.?in|\bw\.?i\.?c\.?\b|closet|wardrobe/i.test(name)) return count > 1 ? `Closet ${index + 1}` : 'Walk-in Closet';
  if (/balcon(?:y)?|terrace/i.test(name)) return 'Balcony';
  if (/laundry/i.test(name)) return 'Laundry';
  if (/pantry/i.test(name)) return 'Pantry';
  if (/study|office|workspace/i.test(name)) return 'Study';
  if (/store|storage|utility/i.test(name)) return 'Storage';
  if (/garage/i.test(name)) return 'Garage';
  return name.replace(/^\d+\s*/, '').trim();
};

const ROOM_TEXT_PATTERN = /master|primary|secondary|guest\s*bed|bed\s*room|bedroom|ensuite|bath|powder|owder\s*room|toilet|washroom|living|lounge|family\s*room|dining|kitchen|foyer|entry|entrance|reception|corridor|hallway|passage|walk.?in|\bw\.?i\.?c\.?\b|closet|wardrobe|balcon(?:y)?|terrace|laundry|pantry|study|office|workspace|store|storage|utility|garage/i;

const parsePrintedDimensions = (text: string) => {
  const normalized = text.replace(/[’′]/g, "'").replace(/[”″]/g, '"').replace(/[–—]/g, '-');
  const imperial = normalized.match(/(\d{1,2}(?:\.\d+)?)\s*'\s*(?:-?\s*(\d{1,2}(?:\.\d+)?)\s*"?)?\s*(?:x|×|by)\s*(\d{1,2}(?:\.\d+)?)\s*'\s*(?:-?\s*(\d{1,2}(?:\.\d+)?)\s*"?)?/i);
  if (imperial) {
    return {
      width: Number(imperial[1]) * 0.3048 + Number(imperial[2] || 0) * 0.0254,
      depth: Number(imperial[3]) * 0.3048 + Number(imperial[4] || 0) * 0.0254,
    };
  }
  // OCR commonly drops the foot mark but retains the feet-inches separator:
  // 13'-0" x 11'-0" becomes 13-0" x 11-0".
  const inferredImperial = normalized.match(/(\d{1,2})\s*-\s*(\d{1,2})\s*"?\s*(?:x|×|by)\s*(\d{1,2})\s*-\s*(\d{1,2})\s*"?/i);
  if (inferredImperial) {
    const inchesA = Number(inferredImperial[2]), inchesB = Number(inferredImperial[4]);
    if (inchesA < 12 && inchesB < 12) {
      return {
        width: Number(inferredImperial[1]) * 0.3048 + inchesA * 0.0254,
        depth: Number(inferredImperial[3]) * 0.3048 + inchesB * 0.0254,
      };
    }
  }
  const metric = normalized.match(/(\d{1,2}(?:\.\d+)?)\s*m(?:et(?:er|re)s?)?\s*(?:x|×|by)\s*(\d{1,2}(?:\.\d+)?)\s*m(?:et(?:er|re)s?)?/i);
  if (metric) return { width: Number(metric[1]), depth: Number(metric[2]) };
  return undefined;
};

const mergeStackedRoomLabelObservations = (observations: FloorplanTextObservation[]) => {
  const candidates = observations.filter(observation =>
    observation.confidence >= 20 &&
    (ROOM_TEXT_PATTERN.test(observation.text) || !/[\d][^\n]{0,12}(?:x|×|by)[^\n]{0,12}[\d]/i.test(observation.text)));
  const parents = candidates.map((_, index) => index);
  const find = (index: number): number => parents[index] === index ? index : (parents[index] = find(parents[index]));
  const unite = (first: number, second: number) => {
    const rootA = find(first), rootB = find(second);
    if (rootA !== rootB) parents[rootB] = rootA;
  };
  for (let first = 0; first < candidates.length; first++) {
    for (let second = first + 1; second < candidates.length; second++) {
      const a = candidates[first], b = candidates[second];
      const widthA = Math.max(1, a.bbox.x1 - a.bbox.x0), widthB = Math.max(1, b.bbox.x1 - b.bbox.x0);
      const heightA = Math.max(1, a.bbox.y1 - a.bbox.y0), heightB = Math.max(1, b.bbox.y1 - b.bbox.y0);
      const overlapX = Math.min(a.bbox.x1, b.bbox.x1) - Math.max(a.bbox.x0, b.bbox.x0);
      const centerDx = Math.abs((a.bbox.x0 + a.bbox.x1 - b.bbox.x0 - b.bbox.x1) / 2);
      const verticalGap = Math.max(a.bbox.y0, b.bbox.y0) - Math.min(a.bbox.y1, b.bbox.y1);
      const horizontallyAligned = overlapX / Math.min(widthA, widthB) >= 0.35 || centerDx <= Math.min(widthA, widthB) * 0.45;
      const verticallyStacked = verticalGap >= -Math.min(heightA, heightB) * 0.35 && verticalGap <= Math.max(7, Math.min(heightA, heightB) * 0.85);
      if (horizontallyAligned && verticallyStacked) unite(first, second);
    }
  }
  const groups = new Map<number, FloorplanTextObservation[]>();
  candidates.forEach((candidate, index) => {
    const root = find(index);
    const group = groups.get(root) || [];
    group.push(candidate);
    groups.set(root, group);
  });
  return Array.from(groups.values()).map(group => {
    const sorted = [...group].sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
    return {
      text: sorted.map(observation => observation.text).join(' ').replace(/\s+/g, ' ').trim(),
      confidence: Math.max(...group.map(observation => observation.confidence)),
      bbox: {
        x0: Math.min(...group.map(observation => observation.bbox.x0)),
        y0: Math.min(...group.map(observation => observation.bbox.y0)),
        x1: Math.max(...group.map(observation => observation.bbox.x1)),
        y1: Math.max(...group.map(observation => observation.bbox.y1)),
      },
    };
  });
};

const extractRoomTextTags = (
  observations: FloorplanTextObservation[],
  width: number,
  height: number,
) => {
  const dimensions = observations.flatMap(observation => {
    const parsed = parsePrintedDimensions(observation.text);
    return parsed ? [{ observation, ...parsed }] : [];
  });
  const tags: RoomTextTag[] = [];
  for (const observation of mergeStackedRoomLabelObservations(observations)) {
    if (observation.confidence < 22 || !ROOM_TEXT_PATTERN.test(observation.text)) continue;
    const label = canonicalRoomName(observation.text, 0, 1);
    if (!label || /^room\s*\d*$/i.test(label)) continue;
    const x = (observation.bbox.x0 + observation.bbox.x1) / 2;
    const y = (observation.bbox.y0 + observation.bbox.y1) / 2;
    const ownDimensions = parsePrintedDimensions(observation.text);
    const nearby = ownDimensions ? undefined : dimensions
      .filter(candidate => candidate.observation !== observation)
      .map(candidate => {
        const centerX = (candidate.observation.bbox.x0 + candidate.observation.bbox.x1) / 2;
        const centerY = (candidate.observation.bbox.y0 + candidate.observation.bbox.y1) / 2;
        const dx = Math.abs(centerX - x), dy = Math.abs(centerY - y);
        // Adjacent compact rooms often have dimensions on the same row. Keep
        // horizontal pairing local to the label column to avoid borrowing a
        // neighbour's printed size.
        const allowedX = Math.max(width * 0.025, (observation.bbox.x1 - observation.bbox.x0) * 1.25);
        const allowedY = Math.max(height * 0.07, (observation.bbox.y1 - observation.bbox.y0) * 5);
        return { candidate, distance: Math.hypot(dx / allowedX, dy / allowedY), valid: dx <= allowedX && dy <= allowedY };
      })
      .filter(item => item.valid)
      .sort((a, b) => a.distance - b.distance)[0]?.candidate;
    const sourceWidth = ownDimensions?.width ?? nearby?.width;
    const sourceDepth = ownDimensions?.depth ?? nearby?.depth;
    const duplicate = tags.find(tag => tag.label === label && Math.hypot(tag.x - x, tag.y - y) < Math.min(width, height) * 0.035);
    if (duplicate) {
      if (observation.confidence > duplicate.confidence) {
        duplicate.x = x;
        duplicate.y = y;
        duplicate.confidence = observation.confidence;
      }
      duplicate.sourceWidth ??= sourceWidth;
      duplicate.sourceDepth ??= sourceDepth;
      continue;
    }
    tags.push({ label, x, y, confidence: observation.confidence, sourceWidth, sourceDepth });
  }
  return tags;
};

const estimateScaleFromRoomText = (
  tags: RoomTextTag[],
  segments: PixelSegment[],
  typicalThickness: number,
) => {
  const candidates: { scale: number; confidence: number }[] = [];
  const tolerance = Math.max(3, typicalThickness * 2);
  for (const tag of tags) {
    if (!tag.sourceWidth || !tag.sourceDepth) continue;
    const left = segments.filter(segment => segment.axis === 'vertical' && segment.line < tag.x && tag.y >= segment.start - tolerance && tag.y <= segment.end + tolerance)
      .sort((a, b) => b.line - a.line)[0];
    const right = segments.filter(segment => segment.axis === 'vertical' && segment.line > tag.x && tag.y >= segment.start - tolerance && tag.y <= segment.end + tolerance)
      .sort((a, b) => a.line - b.line)[0];
    const top = segments.filter(segment => segment.axis === 'horizontal' && segment.line < tag.y && tag.x >= segment.start - tolerance && tag.x <= segment.end + tolerance)
      .sort((a, b) => b.line - a.line)[0];
    const bottom = segments.filter(segment => segment.axis === 'horizontal' && segment.line > tag.y && tag.x >= segment.start - tolerance && tag.x <= segment.end + tolerance)
      .sort((a, b) => a.line - b.line)[0];
    if (!left || !right || !top || !bottom) continue;
    const pixelWidth = right.line - left.line;
    const pixelDepth = bottom.line - top.line;
    if (pixelWidth < typicalThickness * 3 || pixelDepth < typicalThickness * 3) continue;
    const scaleX = tag.sourceWidth / pixelWidth;
    const scaleY = tag.sourceDepth / pixelDepth;
    const agreement = Math.min(scaleX, scaleY) / Math.max(scaleX, scaleY);
    if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || agreement < 0.68) continue;
    candidates.push({ scale: Math.sqrt(scaleX * scaleY), confidence: tag.confidence * agreement });
  }
  if (!candidates.length) return undefined;
  const center = median(candidates.map(candidate => candidate.scale));
  const inliers = candidates.filter(candidate => Math.abs(candidate.scale - center) / center <= 0.28);
  const accepted = inliers.length ? inliers : candidates;
  const weight = accepted.reduce((sum, candidate) => sum + Math.max(1, candidate.confidence), 0);
  return {
    scale: accepted.reduce((sum, candidate) => sum + candidate.scale * Math.max(1, candidate.confidence), 0) / weight,
    sampleCount: accepted.length,
    confidence: Math.max(...accepted.map(candidate => candidate.confidence)),
  };
};

const parseRequestedRoomNames = (designSummary = '') => {
  const section = designSummary.match(/(?:Rooms Included|Rooms):\s*([\s\S]*?)(?=(?:Room Adjacency|Adjacency Flow|Layout Type|Detail Level|Floors|STRICT GENERATION RULES):|$)/i)?.[1] || '';
  const lines = section.split(/[\n\r]+/).map(line => line.replace(/^\s*[-*•✓✅]+\s*/, '').trim()).filter(Boolean);
  const labels: string[] = [];
  const numberWords: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8 };
  for (const line of lines) {
    const countMatch = line.match(/^\s*(\d+|one|two|three|four|five|six|seven|eight)\s*(?:x\s*)?/i);
    const count = countMatch ? (Number(countMatch[1]) || numberWords[countMatch[1].toLowerCase()] || 1) : 1;
    const name = countMatch ? line.slice(countMatch[0].length) : line;
    for (let index = 0; index < count; index++) {
      const label = canonicalRoomName(name, index, count);
      if (label) labels.push(label);
    }
  }
  return labels;
};

const roomSizePreference = (label: string) => {
  if (/living/i.test(label)) return 1;
  if (/master|primary/i.test(label)) return 0.88;
  if (/bedroom/i.test(label)) return 0.76;
  if (/dining|garage/i.test(label)) return 0.72;
  if (/kitchen|study|office/i.test(label)) return 0.58;
  if (/laundry|storage/i.test(label)) return 0.32;
  if (/bath|ensuite|powder/i.test(label)) return 0.16;
  if (/closet|pantry|foyer|corridor/i.test(label)) return 0.05;
  return 0.5;
};

const fitRoomNamesToSpaces = (labels: string[], spaceCount: number) => {
  const result = [...labels];
  if (result.length > spaceCount) {
    const livingIndex = result.findIndex(label => /living/i.test(label));
    const diningIndex = result.findIndex(label => /dining/i.test(label));
    if (livingIndex >= 0 && diningIndex >= 0 && livingIndex !== diningIndex) {
      result[livingIndex] = 'Living / Dining';
      result.splice(diningIndex, 1);
    }
  }
  while (result.length > spaceCount) {
    const removable = result.findIndex(label => /balcony|corridor|foyer/i.test(label));
    if (removable >= 0) result.splice(removable, 1);
    else result.splice(result.length - 1, 1);
  }
  while (result.length < spaceCount) result.push(`Room ${result.length + 1}`);
  return result;
};

const assignRoomNames = (spaces: SpaceRegion[], requestedLabels: string[], fillAllSpaces = true) => {
  const labels = fillAllSpaces
    ? fitRoomNamesToSpaces(requestedLabels, spaces.length)
    : requestedLabels.slice(0, spaces.length);
  const byArea = [...spaces].sort((a, b) => a.areaMeters - b.areaMeters);
  const remaining = new Set(byArea);
  const assignments = new Map<SpaceRegion, string>();
  const labelsByPriority = labels.map((label, index) => ({ label, index, preference: roomSizePreference(label) }))
    .sort((a, b) => Math.abs(b.preference - 0.5) - Math.abs(a.preference - 0.5));
  for (const item of labelsByPriority) {
    const candidates = Array.from(remaining);
    const targetRank = item.preference * Math.max(0, byArea.length - 1);
    const best = candidates.sort((a, b) => {
      const rankA = byArea.indexOf(a), rankB = byArea.indexOf(b);
      return Math.abs(rankA - targetRank) - Math.abs(rankB - targetRank) || b.areaMeters - a.areaMeters;
    })[0];
    if (!best) continue;
    assignments.set(best, item.label);
    remaining.delete(best);
  }
  return assignments;
};

/** Pure raster-to-geometry rule engine used by Text 4.0 G. */
export const classifyText4gRasterGeometry = (
  image: RasterImageData,
  options: Pick<LocalImageExtractionOptions, 'textObservations'> = {},
): Text4gGeometryMode => {
  const { width, height } = image;
  if (width < 64 || height < 64) return 'orthogonal';
  const originalDarkMask = createDarkMask(image);
  const textObservations = options.textObservations || [];
  const darkMask = removeRecognizedTextFromMask(originalDarkMask, width, height, textObservations);
  const minimumRun = Math.max(12, Math.round(Math.min(width, height) * 0.025));
  const rawSegments = [
    ...extractDirectionalBands(darkMask, width, height, 'horizontal', minimumRun),
    ...extractDirectionalBands(darkMask, width, height, 'vertical', minimumRun),
  ];
  return analyzeText4gGeometryMode(
    darkMask,
    width,
    height,
    estimateTypicalWallThickness(rawSegments),
  ).mode;
};

export const extractGeometryFromImageData = (
  image: RasterImageData,
  options: LocalImageExtractionOptions = {},
): GeneratedData => {
  const { width, height } = image;
  if (width < 64 || height < 64) throw new Error('The generated floor-plan image is too small to trace reliably.');
  const textObservations = options.textObservations || [];
  const ocrStatus: NonNullable<LocalImageExtractionOptions['ocrStatus']> = options.ocrStatus
    || (options.disableOcr ? 'disabled' : options.textObservations ? 'provided' : 'unavailable');
  const roomTextTags = extractRoomTextTags(textObservations, width, height);
  const originalDarkMask = createDarkMask(image);
  let darkMask = removeRecognizedTextFromMask(originalDarkMask, width, height, textObservations);
  const originalDoorEvidenceMask = createDoorEvidenceMask(image);
  let doorEvidenceMask = removeRecognizedTextFromMask(originalDoorEvidenceMask, width, height, textObservations);
  const minimumRun = Math.max(12, Math.round(Math.min(width, height) * 0.025));
  let rawSegments = [
    ...extractDirectionalBands(darkMask, width, height, 'horizontal', minimumRun),
    ...extractDirectionalBands(darkMask, width, height, 'vertical', minimumRun),
  ];
  let geometryModeAnalysis = analyzeText4gGeometryMode(
    darkMask,
    width,
    height,
    estimateTypicalWallThickness(rawSegments),
  );
  if (textObservations.length && !roomTextTags.length && geometryModeAnalysis.mode !== 'orthogonal') {
    const unstrippedRawSegments = [
      ...extractDirectionalBands(originalDarkMask, width, height, 'horizontal', minimumRun),
      ...extractDirectionalBands(originalDarkMask, width, height, 'vertical', minimumRun),
    ];
    const unstrippedModeAnalysis = analyzeText4gGeometryMode(
      originalDarkMask,
      width,
      height,
      estimateTypicalWallThickness(unstrippedRawSegments),
    );
    if (unstrippedModeAnalysis.mode !== 'orthogonal'
      && unstrippedModeAnalysis.segments.length >= geometryModeAnalysis.segments.length) {
      darkMask = originalDarkMask;
      doorEvidenceMask = originalDoorEvidenceMask;
      rawSegments = unstrippedRawSegments;
      geometryModeAnalysis = unstrippedModeAnalysis;
    }
  }
  let geometryMode: Text4gGeometryMode = geometryModeAnalysis.mode;
  let freeformSegments = geometryMode === 'orthogonal' ? [] : geometryModeAnalysis.segments;
  let freeformGaps = geometryMode === 'orthogonal' ? [] : geometryModeAnalysis.gaps;
  const faintAngularWindowGaps = new Set<Text4gFreeformWallGap>();
  // A fully circular shell may expose only a few short axis tangencies. These
  // projections bootstrap the common scale/OCR pipeline; they are never added
  // to a normal orthogonal plan and never replace the retained curve chords.
  if (geometryMode !== 'orthogonal' && rawSegments.length < 4) {
    rawSegments = deduplicateParallelSegments([
      ...rawSegments,
      ...freeformAxisProjections(freeformSegments, minimumRun),
    ], Math.max(2, estimateTypicalWallThickness(rawSegments)));
  }
  const symbolMinimumRun = Math.max(8, Math.round(Math.min(width, height) * 0.012));
  const symbolSegments = [
    ...extractDirectionalBands(darkMask, width, height, 'horizontal', symbolMinimumRun, 1),
    ...extractDirectionalBands(darkMask, width, height, 'vertical', symbolMinimumRun, 1),
  ];
  const doorSymbolSegments = [
    ...extractDirectionalBands(doorEvidenceMask, width, height, 'horizontal', symbolMinimumRun, 1),
    ...extractDirectionalBands(doorEvidenceMask, width, height, 'vertical', symbolMinimumRun, 1),
  ];
  if (rawSegments.length < 4 && freeformSegments.length < 4) {
    throw new Error('Local extraction found no usable wall network. Regenerate a clean, high-contrast floor plan.');
  }

  const typicalThickness = estimateTypicalWallThickness(rawSegments);
  const minimumStructuralThickness = Math.max(3, typicalThickness * 0.38);
  const structuralSegments = rawSegments.filter(segment => segment.thickness >= minimumStructuralThickness);
  if (structuralSegments.length < 4 && freeformSegments.length < 4) {
    throw new Error('Local extraction found too few structural wall strokes after removing symbols and annotation lines.');
  }
  const deduplicated = deduplicateParallelSegments(structuralSegments, typicalThickness);
  const preliminaryBounds = segmentBounds(deduplicated);
  const preliminaryScale = estimatePixelScale(preliminaryBounds, options);
  const { segments: mergedSegments, gaps } = mergeCollinearSegments(deduplicated, preliminaryScale, typicalThickness, width, height);
  closeSupportedJunctionGaps(mergedSegments, darkMask, width, height, preliminaryScale, typicalThickness);
  snapWallNetwork(mergedSegments, preliminaryScale, typicalThickness);
  const lengthFilteredSegments = mergedSegments.filter(segment => {
    const alongScale = segment.axis === 'horizontal' ? preliminaryScale.x : preliminaryScale.y;
    const minimumPixels = Math.max(minimumRun, Math.min(0.45 / alongScale, typicalThickness * 5));
    return segment.end - segment.start >= minimumPixels;
  });
  const compactDoorHostCandidates = [
    ...extractDirectionalBands(darkMask, width, height, 'horizontal', minimumRun, 2, true),
    ...extractDirectionalBands(darkMask, width, height, 'vertical', minimumRun, 2, true),
  ].filter(segment => segment.thickness >= minimumStructuralThickness
    && !lengthFilteredSegments.some(host => host.axis === segment.axis
      && Math.abs(host.line - segment.line) <= typicalThickness
      && segment.start >= host.start - typicalThickness
      && segment.end <= host.end + typicalThickness));
  const compactOneSidedSwingHosts = recoverOneSidedSwingDoorHosts(
    [
      ...compactDoorHostCandidates,
      // A clear swing may begin at the free end of an already-retained short
      // wall, as at the DS12 69.2 bathroom. Its perpendicular leaf must not be
      // mistaken for the host merely because the real host is one-sided.
      ...lengthFilteredSegments,
    ],
    lengthFilteredSegments,
    doorSymbolSegments,
    typicalThickness,
    doorEvidenceMask,
    originalDoorEvidenceMask,
    originalDarkMask,
    width,
    height,
  );
  const physicalWallFaceSwingHosts = geometryMode === 'orthogonal'
    ? recoverPhysicalWallFaceSwingHosts(
      lengthFilteredSegments,
      gaps,
      doorSymbolSegments,
      resolveMissingHostRecoveryScale(preliminaryBounds, options, preliminaryScale),
      typicalThickness,
      doorEvidenceMask,
      originalDoorEvidenceMask,
      originalDarkMask,
      width,
      height,
      textObservations,
    )
    : { segments: [], gaps: [] };
  const longEndpointSwingHosts = geometryMode === 'orthogonal'
    ? recoverLongWallEndpointSwingDoorHosts(
      lengthFilteredSegments,
      doorSymbolSegments,
      resolveMissingHostRecoveryScale(preliminaryBounds, options, preliminaryScale),
      typicalThickness,
      doorEvidenceMask,
      originalDoorEvidenceMask,
      width,
      height,
      textObservations,
    )
    : { segments: [], gaps: [] };
  const oneSidedSwingHosts = {
    segments: deduplicateParallelSegments([
      ...compactOneSidedSwingHosts.segments,
      ...physicalWallFaceSwingHosts.segments,
    ], Math.max(2, typicalThickness * 0.35)),
    gaps: deduplicatePixelGaps([
      ...compactOneSidedSwingHosts.gaps,
      ...physicalWallFaceSwingHosts.gaps,
      ...longEndpointSwingHosts.gaps,
    ], typicalThickness),
  };
  const symbolHostSegments = deduplicateParallelSegments([
    ...lengthFilteredSegments,
    ...oneSidedSwingHosts.segments,
  ], Math.max(2, typicalThickness * 0.35));
  const ordinaryPreRetentionSymbolGaps = recoverSymbolSupportedGaps(
    symbolHostSegments,
    preliminaryScale,
    typicalThickness,
    darkMask,
    originalDarkMask,
    width,
    height,
    textObservations,
    doorEvidenceMask,
    originalDoorEvidenceMask,
  );
  const closedSwingDoorGaps = recoverClosedSwingDoorGaps(
    symbolHostSegments,
    doorSymbolSegments,
    deduplicatePixelGaps([
      ...gaps,
      ...ordinaryPreRetentionSymbolGaps,
      ...oneSidedSwingHosts.gaps,
    ], typicalThickness),
    typicalThickness,
    doorEvidenceMask,
    originalDarkMask,
    width,
    height,
  );
  const preRetentionSymbolGaps = deduplicatePixelGaps([
    ...ordinaryPreRetentionSymbolGaps,
    ...oneSidedSwingHosts.gaps,
  ], typicalThickness);
  // Window and door symbols can split one facade into separate connected
  // components. Bridge only symbol-evidenced gaps before selecting the main
  // architectural network, while preserving each gap for hosted elements.
  const networkConnectedSegments = mergeWallsAcrossHostedGaps(
    symbolHostSegments,
    preRetentionSymbolGaps,
    typicalThickness,
  );
  let usableSegments = retainMainWallNetwork(networkConnectedSegments, preliminaryScale, typicalThickness);
  usableSegments = retainTaggedInteriorWallBoxes(
    networkConnectedSegments,
    usableSegments,
    roomTextTags,
    preliminaryScale,
    typicalThickness,
  );
  if (geometryMode !== 'orthogonal' && usableSegments.length >= 4) {
    const candidateBounds = segmentBounds(usableSegments);
    const candidateFrame = wallAxisBounds(usableSegments, candidateBounds);
    const candidateFreeformBounds = freeformBounds(freeformSegments);
    const axisCoverageX = candidateFreeformBounds
      ? (candidateFrame.maxX - candidateFrame.minX) / Math.max(1, candidateFreeformBounds.maxX - candidateFreeformBounds.minX)
      : 1;
    const axisCoverageY = candidateFreeformBounds
      ? (candidateFrame.maxY - candidateFrame.minY) / Math.max(1, candidateFreeformBounds.maxY - candidateFreeformBounds.minY)
      : 1;
    if (axisCoverageX >= 0.9 && axisCoverageY >= 0.9
      && hasCompleteRectangularWallFrame(usableSegments, candidateFrame, typicalThickness)) {
      // Orthogonal evidence is authoritative when it independently proves a
      // complete wall frame. Diagonal stairs, furniture, swing arcs, and
      // balcony symbols must never opt such a plan into another detector.
      geometryMode = 'orthogonal';
      freeformSegments = [];
      freeformGaps = [];
    }
  }
  if (geometryMode === 'hybrid') {
    const recoveredAngularWindows = recoverText4gFaintAngularWindowHosts(
      originalDarkMask,
      originalDoorEvidenceMask,
      width,
      height,
      typicalThickness,
      freeformSegments,
    );
    recoveredAngularWindows.gaps.forEach(gap => faintAngularWindowGaps.add(gap));
    freeformSegments = [...freeformSegments, ...recoveredAngularWindows.segments];
    freeformGaps = [...freeformGaps, ...recoveredAngularWindows.gaps];
  }
  const horizontalComponentRows: number[] = [];
  lengthFilteredSegments.filter(segment => segment.axis === 'horizontal').forEach(segment => {
    if (!horizontalComponentRows.some(line => Math.abs(line - segment.line) <= typicalThickness * 2)) {
      horizontalComponentRows.push(segment.line);
    }
  });
  const isolatedStairEvidence = detectLinearStairs(symbolSegments, typicalThickness);
  const horizontalComponentSegments = lengthFilteredSegments.filter(segment => segment.axis === 'horizontal').length;
  const verticalComponentSegments = lengthFilteredSegments.filter(segment => segment.axis === 'vertical').length;
  const componentSheetMode = usableSegments.length < 4
    && horizontalComponentSegments >= 8
    && verticalComponentSegments <= 1
    && horizontalComponentRows.length >= 4
    && isolatedStairEvidence.length >= 1
    && roomTextTags.every(tag => /balcony|terrace|loggia|porch|deck/i.test(tag.label));
  if (componentSheetMode) {
    const compactWallStubs = extractDirectionalBands(
      darkMask,
      width,
      height,
      'horizontal',
      Math.max(8, Math.round(typicalThickness * 0.75)),
      Math.max(2, typicalThickness * 0.38),
      true,
    ).filter(segment => segment.thickness >= minimumStructuralThickness);
    usableSegments = deduplicateParallelSegments([
      ...mergedSegments,
      ...compactWallStubs,
    ].filter(segment => segment.end - segment.start >= Math.max(8, typicalThickness * 0.7)), typicalThickness)
      .map(segment => ({ ...segment }));
  }
  if (usableSegments.length < 4 && freeformSegments.length < 4) {
    throw new Error('Local extraction rejected the detected strokes as annotation noise rather than architectural walls.');
  }
  let missingHostedWindowOrSlidingGaps: PixelGap[] = [];
  let postMissingHostEndpointSwingHosts: { segments: PixelSegment[]; gaps: PixelGap[] } = {
    segments: [],
    gaps: [],
  };
  if (!componentSheetMode && geometryMode === 'orthogonal') {
    usableSegments = recoverMissingFacadeWallRuns(
      usableSegments,
      originalDarkMask,
      width,
      height,
      typicalThickness,
    );
    usableSegments = recoverRasterSupportedInteriorPartitions(
      usableSegments,
      originalDarkMask,
      width,
      height,
      typicalThickness,
      roomTextTags,
    );
    const missingHostedRecovery = recoverMissingHostedWindowOrSliding(
      usableSegments,
      symbolSegments,
      resolveMissingHostRecoveryScale(preliminaryBounds, options, preliminaryScale),
      typicalThickness,
      darkMask,
      originalDarkMask,
      width,
      height,
      textObservations,
      doorEvidenceMask,
      originalDoorEvidenceMask,
    );
    usableSegments = missingHostedRecovery.segments;
    missingHostedWindowOrSlidingGaps = missingHostedRecovery.gaps;
    if (missingHostedWindowOrSlidingGaps.length) {
      // A framed sliding/window symbol may be the evidence that restores an
      // otherwise discarded wall family. Only after that host exists can a
      // neighbouring endpoint swing be evaluated. Restrict this second pass
      // to those recovered host lines so unrelated walls cannot gain another
      // recovery opportunity or alter enclosure topology.
      postMissingHostEndpointSwingHosts = recoverLongWallEndpointSwingDoorHosts(
        usableSegments,
        doorSymbolSegments,
        resolveMissingHostRecoveryScale(preliminaryBounds, options, preliminaryScale),
        typicalThickness,
        doorEvidenceMask,
        originalDoorEvidenceMask,
        width,
        height,
        textObservations,
        missingHostedWindowOrSlidingGaps,
      );
    }
  }

  let { barrier } = rasterizeWalls(usableSegments, width, height, typicalThickness);
  if (geometryMode !== 'orthogonal') rasterizeFreeformWalls(barrier, freeformSegments, width, height);
  let preliminaryFlood = floodSpaces(barrier, width, height, preliminaryScale);
  let enclosureRepairMode: 'junctions' | 'shell' | undefined;
  if (geometryMode === 'orthogonal' && !componentSheetMode && !preliminaryFlood.spaces.length) {
    const repaired = repairEnclosureTopology(usableSegments, width, height, preliminaryScale, typicalThickness);
    usableSegments = repaired.segments;
    barrier = repaired.barrier;
    preliminaryFlood = repaired.flood;
    enclosureRepairMode = repaired.mode;
  }
  const roomSlabEnclosureIncomplete = !componentSheetMode
    && geometryMode !== 'orthogonal'
    && !preliminaryFlood.spaces.length;
  if (!componentSheetMode && geometryMode === 'orthogonal' && !preliminaryFlood.spaces.length) {
    throw new Error('The local enclosure repair could not recover a usable plan envelope.');
  }
  const orthogonalWallBounds = usableSegments.length ? segmentBounds(usableSegments) : undefined;
  const detectedFreeformBounds = freeformBounds(freeformSegments);
  const wallBounds: PixelBounds = orthogonalWallBounds && detectedFreeformBounds ? {
    minX: Math.min(orthogonalWallBounds.minX, detectedFreeformBounds.minX),
    maxX: Math.max(orthogonalWallBounds.maxX, detectedFreeformBounds.maxX),
    minY: Math.min(orthogonalWallBounds.minY, detectedFreeformBounds.minY),
    maxY: Math.max(orthogonalWallBounds.maxY, detectedFreeformBounds.maxY),
  } : orthogonalWallBounds || detectedFreeformBounds || { minX: 0, maxX: width, minY: 0, maxY: height };
  const frameAxisBounds = geometryMode === 'orthogonal'
    ? wallAxisBounds(usableSegments, wallBounds)
    : wallBounds;
  const curvilinearAngleBins = new Set(freeformSegments.map(segment => {
    const angle = (Math.atan2(segment.p2.y - segment.p1.y, segment.p2.x - segment.p1.x) * 180 / Math.PI + 180) % 180;
    return Math.round(angle / 10);
  }));
  const smoothCurvilinearCandidate = geometryMode === 'curved'
    || (geometryMode === 'hybrid'
      && freeformSegments.length >= 18
      && curvilinearAngleBins.size >= 8);
  const sparseHybridSymbols = geometryMode === 'hybrid'
    && freeformSegments.filter(segment => {
      const angle = Math.abs(Math.atan2(segment.p2.y - segment.p1.y, segment.p2.x - segment.p1.x) * 180 / Math.PI) % 90;
      return Math.min(angle, 90 - angle) >= 10;
    }).length <= 16;
  const ordinaryPixelColumns = componentSheetMode
    ? detectIsolatedComponentColumns(usableSegments, typicalThickness, darkMask, width, height)
    : geometryMode === 'orthogonal'
      ? detectCornerColumns(darkMask, width, height, wallBounds, typicalThickness, usableSegments)
      : [];
  const curvilinearColumnSegments: Text4gFreeformWallSegment[] = smoothCurvilinearCandidate
    ? [
      ...freeformSegments,
      ...usableSegments.map(segment => segment.axis === 'horizontal'
        ? {
          p1: { x: segment.start, y: segment.line },
          p2: { x: segment.end, y: segment.line },
          thickness: segment.thickness,
          confidence: 0.86,
        }
        : {
          p1: { x: segment.line, y: segment.start },
          p2: { x: segment.line, y: segment.end },
          thickness: segment.thickness,
          confidence: 0.86,
        }),
    ]
    : freeformSegments;
  const rawSupplementalAngularColumns = sparseHybridSymbols || smoothCurvilinearCandidate
    ? detectText4gSparseAngularColumns(
      originalDarkMask,
      width,
      height,
      typicalThickness,
      curvilinearColumnSegments,
      smoothCurvilinearCandidate
        ? {
          oversizedCoverage: 0.5,
          quadrantCoverage: 0.4,
          coreCoverage: 0.68,
          cornerCoverage: 0.5,
          edgeTransitionCoverage: 0.43,
        }
        : undefined,
    )
    : [];
  const supplementalAngularColumns = rawSupplementalAngularColumns.length >= 2
    ? rawSupplementalAngularColumns
    : [];
  const detectedPixelColumns = [...ordinaryPixelColumns, ...supplementalAngularColumns].filter((column, index, all) =>
    !all.slice(0, index).some(existing => Math.hypot(existing.x - column.x, existing.y - column.y) <= typicalThickness * 1.6));
  const ordinaryPixelStairs = componentSheetMode ? isolatedStairEvidence : detectLinearStairs(symbolSegments, typicalThickness);
  const supplementalAngularStairs = (sparseHybridSymbols || smoothCurvilinearCandidate) && !ordinaryPixelStairs.length
    ? detectText4gSparseAngularStairs(originalDoorEvidenceMask, originalDarkMask, width, height, typicalThickness)
    : [];
  const detectedPixelStairs = [...ordinaryPixelStairs, ...supplementalAngularStairs];
  const detectedAngularRailings = sparseHybridSymbols || smoothCurvilinearCandidate
    ? detectText4gSparseAngularRailings(createCoolGrayRailingMask(image), width, height, typicalThickness)
    : [];
  const sparseAngularComponentSheetMode = !componentSheetMode
    && sparseHybridSymbols
    && roomTextTags.length === 0
    && detectedAngularRailings.length >= 2
    && supplementalAngularColumns.length >= 1
    && supplementalAngularStairs.length >= 1;
  if (sparseAngularComponentSheetMode) {
    const recoveredAngularDoors = recoverText4gSupplementalAngularDoorHosts(
      originalDarkMask,
      originalDoorEvidenceMask,
      width,
      height,
      typicalThickness,
      freeformSegments,
      freeformGaps,
      false,
    );
    freeformSegments = [...freeformSegments, ...recoveredAngularDoors.segments];
    freeformGaps = [...freeformGaps, ...recoveredAngularDoors.gaps];
  }
  const detectedRailingProjections = selectRailingProjectionsBySpaceEvidence(
    detectRailingProjections(
      darkMask, width, height, symbolSegments, frameAxisBounds, typicalThickness,
    ),
    roomTextTags,
    frameAxisBounds,
    typicalThickness,
  );
  const rectangularWallFrame = geometryMode === 'orthogonal'
    && !componentSheetMode
    && hasCompleteRectangularWallFrame(usableSegments, frameAxisBounds, typicalThickness);
  let footprintPixels = componentSheetMode
    ? rectangularFootprint(frameAxisBounds)
    : rectangularWallFrame
    ? rectangularFootprint(frameAxisBounds)
    : (geometryMode === 'orthogonal' ? validateFootprint : validateFreeformFootprint)(
        traceFootprint(barrier, preliminaryFlood.outside, width, height),
        frameAxisBounds,
        typicalThickness,
      );
  if (detectedRailingProjections.length && !rectangularWallFrame) {
    const projectionOutside = preliminaryFlood.outside.slice();
    detectedRailingProjections.forEach(projection => {
      const minX = clamp(Math.floor(projection.bounds.minX), 0, width - 1);
      const maxX = clamp(Math.ceil(projection.bounds.maxX), 0, width - 1);
      const minY = clamp(Math.floor(projection.bounds.minY), 0, height - 1);
      const maxY = clamp(Math.ceil(projection.bounds.maxY), 0, height - 1);
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) projectionOutside[y * width + x] = 0;
      }
    });
    footprintPixels = (geometryMode === 'orthogonal' ? validateFootprint : validateFreeformFootprint)(
      traceFootprint(barrier, projectionOutside, width, height),
      frameAxisBounds,
      typicalThickness,
    );
  }
  const footprintBounds: PixelBounds = footprintPixels.length >= 4 ? {
    minX: Math.min(...footprintPixels.map(point => point.x)),
    maxX: Math.max(...footprintPixels.map(point => point.x)),
    minY: Math.min(...footprintPixels.map(point => point.y)),
    maxY: Math.max(...footprintPixels.map(point => point.y)),
  } : frameAxisBounds;
  const wallFacePaddingPixels = typicalThickness / 2;
  const wallFacePixelBounds: PixelBounds = rectangularWallFrame ? {
    minX: frameAxisBounds.minX - wallFacePaddingPixels,
    maxX: frameAxisBounds.maxX + wallFacePaddingPixels,
    minY: frameAxisBounds.minY - wallFacePaddingPixels,
    maxY: frameAxisBounds.maxY + wallFacePaddingPixels,
  } : { ...footprintBounds };
  detectedPixelColumns.forEach(column => {
    wallFacePixelBounds.minX = Math.min(wallFacePixelBounds.minX, column.pixelBounds.x0);
    wallFacePixelBounds.maxX = Math.max(wallFacePixelBounds.maxX, column.pixelBounds.x1);
    wallFacePixelBounds.minY = Math.min(wallFacePixelBounds.minY, column.pixelBounds.y0);
    wallFacePixelBounds.maxY = Math.max(wallFacePixelBounds.maxY, column.pixelBounds.y1);
  });
  const propertyPixelBounds = detectedAngularRailings.reduce<PixelBounds>((bounds, railing) => ({
    minX: Math.min(bounds.minX, railing.p1.x, railing.p2.x),
    maxX: Math.max(bounds.maxX, railing.p1.x, railing.p2.x),
    minY: Math.min(bounds.minY, railing.p1.y, railing.p2.y),
    maxY: Math.max(bounds.maxY, railing.p1.y, railing.p2.y),
  }), detectedRailingProjections.reduce<PixelBounds>((bounds, projection) => ({
    minX: Math.min(bounds.minX, projection.bounds.minX),
    maxX: Math.max(bounds.maxX, projection.bounds.maxX),
    minY: Math.min(bounds.minY, projection.bounds.minY),
    maxY: Math.max(bounds.maxY, projection.bounds.maxY),
  }), { ...wallFacePixelBounds }));
  const requestedBounds = getBoundaryBounds(options.requestedBoundary);
  const requestedRoomLabels = parseRequestedRoomNames(options.designSummary);
  const targetSize = options.targetSizeMeters || DEFAULT_TARGET_SIZE_METERS;
  const exteriorWallThicknessMeters = clamp(
    options.exteriorWallThicknessMeters ?? DEFAULT_EXTERIOR_WALL_THICKNESS_METERS,
    0.05,
    0.6,
  );
  const requestedWidthMeters = requestedBounds
    ? requestedBounds.maxX - requestedBounds.minX
    : typeof options.requestedWidthMeters === 'number' && Number.isFinite(options.requestedWidthMeters) && options.requestedWidthMeters > 0
      ? options.requestedWidthMeters
      : undefined;
  const requestedDepthMeters = requestedBounds
    ? requestedBounds.maxY - requestedBounds.minY
    : typeof options.requestedDepthMeters === 'number' && Number.isFinite(options.requestedDepthMeters) && options.requestedDepthMeters > 0
      ? options.requestedDepthMeters
      : undefined;
  const hasRequestedExtent = requestedWidthMeters !== undefined || requestedDepthMeters !== undefined;
  const useEvidencedFixedBounds = geometryMode !== 'orthogonal'
    || detectedPixelColumns.length > 0
    || detectedRailingProjections.length > 0
    || detectedAngularRailings.length > 0;
  const footprintPixelWidth = Math.max(1, propertyPixelBounds.maxX - propertyPixelBounds.minX);
  const footprintPixelHeight = Math.max(1, propertyPixelBounds.maxY - propertyPixelBounds.minY);
  const wallAxisPixelWidth = Math.max(1, frameAxisBounds.maxX - frameAxisBounds.minX);
  const wallAxisPixelHeight = Math.max(1, frameAxisBounds.maxY - frameAxisBounds.minY);
  const uniformScale = targetSize / Math.max(footprintPixelWidth, footprintPixelHeight);
  const requestedScaleCandidates = [
    requestedWidthMeters !== undefined
      ? useEvidencedFixedBounds
        ? requestedWidthMeters / footprintPixelWidth
        : Math.max(0.01, requestedWidthMeters - exteriorWallThicknessMeters) / wallAxisPixelWidth
      : undefined,
    requestedDepthMeters !== undefined
      ? useEvidencedFixedBounds
        ? requestedDepthMeters / footprintPixelHeight
        : Math.max(0.01, requestedDepthMeters - exteriorWallThicknessMeters) / wallAxisPixelHeight
      : undefined,
  ].filter((candidate): candidate is number => candidate !== undefined && Number.isFinite(candidate) && candidate > 0);
  const requestedScale = requestedScaleCandidates.length ? Math.min(...requestedScaleCandidates) : undefined;
  const textScaleEstimate = estimateScaleFromRoomText(roomTextTags, usableSegments, typicalThickness);
  const reliableTextScale = textScaleEstimate && (textScaleEstimate.sampleCount >= 2 || textScaleEstimate.confidence >= 48)
    ? textScaleEstimate.scale
    : undefined;
  const enforceRequestedEnvelope = !!(options.enforceRequestedEnvelope && requestedScale);
  const scale = reliableTextScale ?? requestedScale ?? uniformScale;
  const scaleSource: NonNullable<GeneratedData['extractionDiagnostics']>['scaleSource'] = enforceRequestedEnvelope
    ? 'requested-boundary'
    : reliableTextScale
      ? 'image-text'
      : requestedScale
        ? 'requested-boundary'
        : 'default';
  // Never deform a generated plan to make both requested axes fit. A single
  // uniform scale preserves room/opening proportions and centers any unused
  // space inside the confirmed envelope, matching the square-canvas prompt.
  const componentSheetScale = exteriorWallThicknessMeters / Math.max(1, typicalThickness);
  const finalUniformScale = componentSheetMode ? componentSheetScale : enforceRequestedEnvelope ? (requestedScale ?? scale) : scale;
  const finalScale = { x: finalUniformScale, y: finalUniformScale };
  const coordinateBounds = hasRequestedExtent && !useEvidencedFixedBounds ? frameAxisBounds : propertyPixelBounds;
  const coordinatePixelWidth = hasRequestedExtent && !useEvidencedFixedBounds ? wallAxisPixelWidth : footprintPixelWidth;
  const coordinatePixelHeight = hasRequestedExtent && !useEvidencedFixedBounds ? wallAxisPixelHeight : footprintPixelHeight;
  const targetCenterX = requestedBounds ? (requestedBounds.minX + requestedBounds.maxX) / 2 : 0;
  const targetCenterY = requestedBounds ? (requestedBounds.minY + requestedBounds.maxY) / 2 : 0;
  const targetMinX = targetCenterX - coordinatePixelWidth * finalScale.x / 2;
  const targetMaxY = targetCenterY + coordinatePixelHeight * finalScale.y / 2;
  const mapX = (x: number) => targetMinX + (x - coordinateBounds.minX) * finalScale.x;
  const mapY = (y: number) => targetMaxY - (y - coordinateBounds.minY) * finalScale.y;
  const mapPoint = (x: number, y: number) => [mapX(x), mapY(y)];

  let finalFlood = floodSpaces(barrier, width, height, finalScale);
  let outputWallSegments = canonicalizeWallsAtDetectedColumns(
    usableSegments,
    detectedPixelColumns,
    typicalThickness,
    smoothCurvilinearCandidate,
  );

  const recoveredSymbolGaps: PixelGap[] = [];
  for (const axis of ['horizontal', 'vertical'] as const) {
    const groups: PixelSegment[][] = [];
    usableSegments.filter(segment => segment.axis === axis).forEach(segment => {
      const group = groups.find(items => Math.abs(median(items.map(item => item.line)) - segment.line) <= typicalThickness * 1.5);
      if (group) group.push(segment);
      else groups.push([segment]);
    });
    groups.forEach(group => {
      const intervals = [...group].sort((a, b) => a.start - b.start);
      for (let index = 1; index < intervals.length; index++) {
        const previous = intervals[index - 1], next = intervals[index];
        const start = previous.end, end = next.start;
        const gapMeters = (end - start) * (axis === 'horizontal' ? finalScale.x : finalScale.y);
        if (gapMeters < 0.45 || gapMeters > 3.2) continue;
        const candidate: PixelGap = {
          axis,
          line: (previous.line + next.line) / 2,
          start,
          end,
          thickness: Math.max(previous.thickness, next.thickness),
        };
        const evidence = detectGapSymbolEvidence(
          candidate, darkMask, originalDarkMask, width, height, textObservations, typicalThickness,
          doorEvidenceMask, originalDoorEvidenceMask,
        );
        const hasSymbol = evidence.windowFrame || evidence.hostedArcRecovery.detected || (evidence.doorSwing.detected
          && (!evidence.doorSwing.arcOnly || evidence.doorSwing.arcConfirmed))
          || evidence.slidingEvidence.detected || evidence.foldingEvidence.detected;
        if (hasSymbol) recoveredSymbolGaps.push(candidate);
      }
    });
  }
  const recoveredEmbeddedWindowGaps = recoverWindowFramesInsideHostWalls(
    usableSegments,
    symbolSegments,
    finalScale,
    typicalThickness,
    darkMask,
    originalDarkMask,
    width,
    height,
    textObservations,
    doorEvidenceMask,
    originalDoorEvidenceMask,
  );
  const recoveredHollowHostedGaps = recoverHollowHostedApertures(
    usableSegments,
    finalScale,
    typicalThickness,
    darkMask,
    originalDarkMask,
    width,
    height,
    textObservations,
    doorEvidenceMask,
    originalDoorEvidenceMask,
  );
  const componentRowGaps = componentSheetMode
    ? enumerateComponentRowGaps(usableSegments, finalScale, typicalThickness)
    : [];
  const hasExistingUnframedPassage = gaps.some(gap => {
    const hosted = usableSegments.some(segment => segment.axis === gap.axis
      && Math.abs(segment.line - gap.line) <= Math.max(2, typicalThickness)
      && gap.start >= segment.start - 2
      && gap.end <= segment.end + 2);
    if (!hosted || wallBandInkRatio(gap, originalDarkMask, width, height, typicalThickness) >= 0.58) {
      return false;
    }
    const evidence = detectGapSymbolEvidence(
      gap,
      darkMask,
      originalDarkMask,
      width,
      height,
      textObservations,
      typicalThickness,
      doorEvidenceMask,
      originalDoorEvidenceMask,
    );
    return !evidence.windowFrame
      && !evidence.doorSwing.detected
      && !evidence.slidingEvidence.detected
      && !evidence.foldingEvidence.detected;
  });
  const opposedRoomOpenPassages = geometryMode === 'orthogonal'
    && !componentSheetMode
    && !hasExistingUnframedPassage
    ? recoverOpposedRoomOpenPassages(
      // Inspect pre-network structural runs. A later enclosure repair may
      // legitimately bridge the same blank span into its host wall, but the
      // opening still needs to survive as an aperture record.
      lengthFilteredSegments,
      finalScale,
      typicalThickness,
      originalDarkMask,
      width,
      height,
      roomTextTags,
    )
    : [];
  // Skeleton tracing can report a visually orthogonal aperture as a freeform
  // gap merely because the overall plan is hybrid. Route those near-axis gaps
  // back through the established orthogonal symbol classifier and host-wall
  // reconstruction. Only genuinely angled gaps remain in the freeform path.
  const hybridAxisFreeformGapPairs = geometryMode === 'hybrid'
    ? freeformGaps.flatMap(source => {
      const dx = source.p2.x - source.p1.x;
      const dy = source.p2.y - source.p1.y;
      const horizontal = Math.abs(dy) <= Math.abs(dx) * Math.tan(3 * Math.PI / 180);
      const vertical = Math.abs(dx) <= Math.abs(dy) * Math.tan(3 * Math.PI / 180);
      if (!horizontal && !vertical) return [];
      const gap: PixelGap = horizontal
        ? {
            axis: 'horizontal',
            line: (source.p1.y + source.p2.y) / 2,
            start: Math.min(source.p1.x, source.p2.x),
            end: Math.max(source.p1.x, source.p2.x),
            thickness: source.thickness,
          }
        : {
            axis: 'vertical',
            line: (source.p1.x + source.p2.x) / 2,
            start: Math.min(source.p1.y, source.p2.y),
            end: Math.max(source.p1.y, source.p2.y),
            thickness: source.thickness,
          };
      return [{ source, gap }];
    })
    : [];
  const existingHostedGapCandidates = [
    ...gaps.filter(gap => componentSheetMode || usableSegments.some(segment => segment.axis === gap.axis &&
      Math.abs(segment.line - gap.line) <= Math.max(2, typicalThickness) &&
      gap.start >= segment.start - 2 && gap.end <= segment.end + 2)),
    ...recoveredSymbolGaps,
    ...missingHostedWindowOrSlidingGaps,
    ...postMissingHostEndpointSwingHosts.gaps,
    ...componentRowGaps,
    ...opposedRoomOpenPassages,
    ...hybridAxisFreeformGapPairs.map(pair => pair.gap),
    // A near-closed leaf overlays an already continuous wall. It participates
    // in opening classification, but deliberately bypasses the earlier wall
    // network bridge so it cannot change enclosure topology.
    ...closedSwingDoorGaps.filter(gap => componentSheetMode || usableSegments.some(segment =>
      segment.axis === gap.axis
      && Math.abs(segment.line - gap.line) <= Math.max(2, typicalThickness * 2)
      && gap.start >= segment.start - typicalThickness
      && gap.end <= segment.end + typicalThickness)),
    ...preRetentionSymbolGaps.filter(gap => gap.validatedEndpointSwingEvidence || componentSheetMode
      || usableSegments.some(segment => segment.axis === gap.axis
        && Math.abs(segment.line - gap.line) <= Math.max(2, typicalThickness * 2)
        && gap.start >= segment.start - typicalThickness && gap.end <= segment.end + typicalThickness)),
  ];
  const novelEmbeddedWindowGaps = [
    ...recoveredEmbeddedWindowGaps,
    ...recoveredHollowHostedGaps.filter(gap => !gap.openPassageEvidence),
  ].filter(gap => !existingHostedGapCandidates.some(candidate => {
    if (candidate.axis !== gap.axis || Math.abs(candidate.line - gap.line) > typicalThickness * 1.5) return false;
    const overlap = Math.min(candidate.end, gap.end) - Math.max(candidate.start, gap.start);
    const shorter = Math.min(candidate.end - candidate.start, gap.end - gap.start);
    return overlap > 0 && overlap / Math.max(1, shorter) >= 0.55;
  }));
  const candidateHostedGaps = deduplicatePixelGaps([
    ...existingHostedGapCandidates,
    ...novelEmbeddedWindowGaps,
    // Preserve the raster-proven blank metadata even when another recovery
    // path produced a wider weak-symbol candidate over the same aperture.
    ...recoveredHollowHostedGaps.filter(gap => gap.openPassageEvidence),
  ], typicalThickness);
  candidateHostedGaps.forEach(gap => {
    if (gap.validatedEndpointSwingEvidence || gap.closedSwingEvidence) return;
    const existingEvidence = detectGapSymbolEvidence(
      gap, darkMask, originalDarkMask, width, height, textObservations, typicalThickness,
      doorEvidenceMask, originalDoorEvidenceMask,
    );
    // Face-level recovery is only for an otherwise missed swing. Never replace
    // an already confirmed centreline arc, because that can change a correct
    // door's hand or facing merely because the same arc is visible at a wall face.
    if (existingEvidence.doorSwing.arcConfirmed
      || existingEvidence.hostedArcRecovery.arcConfirmed) return;
    const faceSwing = findPhysicalWallFaceSwing(
      gap,
      doorSymbolSegments,
      typicalThickness,
      doorEvidenceMask,
      originalDoorEvidenceMask,
      width,
      height,
    );
    if (faceSwing) gap.validatedEndpointSwingEvidence = faceSwing.swing;
    if (faceSwing) gap.physicalWallFaceSwingEvidence = true;
    if (faceSwing) gap.physicalWallFaceLeafLine = faceSwing.leaf.line;
  });
  const hostedGaps = candidateHostedGaps.filter(gap => {
    const inkRatio = wallBandInkRatio(gap, originalDarkMask, width, height, typicalThickness);
    if (gap.validatedEndpointSwingEvidence) return true;
    if (gap.missingHostFallback) return true;
    if (!gap.closedSwingEvidence && inkRatio >= 0.58) return false;
    if (gap.closedSwingEvidence) return true;
    const evidence = detectGapSymbolEvidence(
      gap, darkMask, originalDarkMask, width, height, textObservations, typicalThickness,
      doorEvidenceMask, originalDoorEvidenceMask,
    );
    if (evidence.doorSwing.detected || evidence.slidingEvidence.detected || evidence.foldingEvidence.detected) return true;
    return inkRatio < 0.68;
  });
  // A room label beside an exterior wall gap is not, by itself, a railing
  // symbol. Keep the gap in the normal opening pipeline unless a connected
  // thin projection is visibly recovered below. This prevents a window or
  // host wall from being retyped as a railing merely because BALCONY text is
  // nearby (DS12-70/71/74).
  const embeddedRailingGaps = new Set<PixelGap>();
  const openSpaceTagsWithoutProjection = roomTextTags.filter(tag => {
    if (!/balcony|terrace|loggia|porch|deck/i.test(tag.label)) return false;
    return !detectedRailingProjections.some(projection => {
      const dx = tag.x < projection.bounds.minX
        ? projection.bounds.minX - tag.x
        : tag.x > projection.bounds.maxX ? tag.x - projection.bounds.maxX : 0;
      const dy = tag.y < projection.bounds.minY
        ? projection.bounds.minY - tag.y
        : tag.y > projection.bounds.maxY ? tag.y - projection.bounds.maxY : 0;
      const span = Math.max(
        projection.bounds.maxX - projection.bounds.minX,
        projection.bounds.maxY - projection.bounds.minY,
      );
      return Math.hypot(dx, dy) <= Math.max(typicalThickness * 6, span * 0.45);
    });
  });
  openSpaceTagsWithoutProjection.forEach(tag => {
    const nearest = hostedGaps.flatMap(gap => {
      const atMinimum = gap.axis === 'horizontal'
        ? Math.abs(gap.line - frameAxisBounds.minY) <= typicalThickness * 1.5
        : Math.abs(gap.line - frameAxisBounds.minX) <= typicalThickness * 1.5;
      const atMaximum = gap.axis === 'horizontal'
        ? Math.abs(gap.line - frameAxisBounds.maxY) <= typicalThickness * 1.5
        : Math.abs(gap.line - frameAxisBounds.maxX) <= typicalThickness * 1.5;
      if (!atMinimum && !atMaximum) return [];
      const along = gap.axis === 'horizontal' ? tag.x : tag.y;
      const normal = gap.axis === 'horizontal' ? tag.y : tag.x;
      const span = gap.end - gap.start;
      if (along < gap.start - span * 0.15 || along > gap.end + span * 0.15) return [];
      const normalDistance = Math.abs(normal - gap.line);
      if (normalDistance > Math.max(typicalThickness * 6, span * 0.85)) return [];
      // A tagged balcony edge must sit outside the tag, not between the tag
      // and the enclosed plan. This keeps facade windows facing a balcony in
      // the normal opening classifier.
      const tagInsideEdge = atMinimum ? normal > gap.line : normal < gap.line;
      if (!tagInsideEdge) return [];
      const evidence = detectGapSymbolEvidence(
        gap, darkMask, originalDarkMask, width, height, textObservations, typicalThickness,
        doorEvidenceMask, originalDoorEvidenceMask,
      );
      const separatedRailingBands = parallelWindowFrameBandCount(
        gap, originalDoorEvidenceMask, width, height,
      ) >= 3;
      const wallInk = wallBandInkRatio(gap, originalDarkMask, width, height, typicalThickness);
      const confirmedDoorSymbol = evidence.doorSwing.arcConfirmed
        || evidence.doorSwing.arcOnly
        || evidence.doorSwing.arcEvidence
        || evidence.slidingEvidence.detected
        || evidence.foldingEvidence.detected;
      // A thin, framed dropout on the outer side of an explicit BALCONY tag is
      // the embedded railing convention used by compact plans. Leaf-like
      // endpoints alone do not veto it; only a validated door glyph does.
      const railingStrokeEvidence = evidence.windowFrame
        && (separatedRailingBands || wallInk < 0.25);
      if (!railingStrokeEvidence || confirmedDoorSymbol || wallInk >= 0.55) return [];
      return [{ gap, distance: normalDistance }];
    }).sort((a, b) => a.distance - b.distance)[0];
    if (nearest) embeddedRailingGaps.add(nearest.gap);
  });
  const architecturalHostedGaps = hostedGaps.filter(gap => !embeddedRailingGaps.has(gap));
  // Long endpoint recovery must not alter enclosure flood, room count, or
  // aperture discovery. Add its validated host spans only after those stages
  // have finished, immediately before final wall hosting.
  outputWallSegments = deduplicateParallelSegments([
    ...outputWallSegments,
    ...longEndpointSwingHosts.segments,
    ...postMissingHostEndpointSwingHosts.segments,
  ], Math.max(2, typicalThickness * 0.35));
  const hostedGapsForWallMerge = architecturalHostedGaps.map(gap =>
    clampText4gRecoveredSwingGapToJambFacesForTest(
      gap,
      outputWallSegments,
      freeformSegments,
      typicalThickness,
    ));
  outputWallSegments = mergeWallsAcrossHostedGaps(outputWallSegments, hostedGapsForWallMerge, typicalThickness);
  outputWallSegments = mergeTouchingCollinearWallSegments(outputWallSegments, finalScale, typicalThickness);
  outputWallSegments = outputWallSegments.filter(segment =>
    (segment.end - segment.start) * (segment.axis === 'horizontal' ? finalScale.x : finalScale.y) > 0.35);
  const retainedFreeformSegments = freeformSegments.filter(segment =>
    !freeformCoveredByAxisWall(segment, outputWallSegments, Math.max(2, typicalThickness * 0.9)));
  const pointSegmentDistance = (point: Text4gPixelPoint, first: PixelPoint, second: PixelPoint) => {
    const dx = second.x - first.x, dy = second.y - first.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared <= 1e-6 ? 0 : clamp(
      ((point.x - first.x) * dx + (point.y - first.y) * dy) / lengthSquared,
      0,
      1,
    );
    return Math.hypot(point.x - (first.x + dx * t), point.y - (first.y + dy * t));
  };
  const segmentOnFootprintEdge = (segment: Text4gFreeformWallSegment, toleranceFactor = 2.2) => {
    if (footprintPixels.length < 3) return false;
    const samples = [
      segment.p1,
      { x: (segment.p1.x + segment.p2.x) / 2, y: (segment.p1.y + segment.p2.y) / 2 },
      segment.p2,
    ];
    const tolerance = typicalThickness * toleranceFactor;
    return samples.filter(sample => footprintPixels.slice(0, -1).some((first, index) => {
      const second = footprintPixels[index + 1];
      return !!second && pointSegmentDistance(sample, first, second) <= tolerance;
    })).length >= 2;
  };
  const segmentHasSeparatedGlazingBands = (segment: Text4gFreeformWallSegment) => {
    const dx = segment.p2.x - segment.p1.x, dy = segment.p2.y - segment.p1.y;
    const length = Math.hypot(dx, dy);
    if (length < Math.max(18, typicalThickness * 2.6)) return false;
    const tangent = { x: dx / length, y: dy / length };
    const normal = { x: -tangent.y, y: tangent.x };
    const midpoint = {
      x: (segment.p1.x + segment.p2.x) / 2,
      y: (segment.p1.y + segment.p2.y) / 2,
    };
    const sampleLength = Math.min(length * 0.82, Math.max(22, typicalThickness * 4.2));
    const first = {
      x: midpoint.x - tangent.x * sampleLength / 2,
      y: midpoint.y - tangent.y * sampleLength / 2,
    };
    const second = {
      x: midpoint.x + tangent.x * sampleLength / 2,
      y: midpoint.y + tangent.y * sampleLength / 2,
    };
    const supportedOffsets: number[] = [];
    const normalReach = Math.max(4, Math.ceil(typicalThickness * 1.7));
    for (let offset = -normalReach; offset <= normalReach; offset++) {
      const support = lineDarkSupport(
        originalDoorEvidenceMask,
        width,
        height,
        { x: first.x + normal.x * offset, y: first.y + normal.y * offset },
        { x: second.x + normal.x * offset, y: second.y + normal.y * offset },
        1,
      );
      if (support >= 0.74) supportedOffsets.push(offset);
    }
    const bands: Array<{ start: number; end: number }> = [];
    for (let index = 0; index < supportedOffsets.length;) {
      let end = index;
      while (end + 1 < supportedOffsets.length && supportedOffsets[end + 1] === supportedOffsets[end] + 1) end++;
      bands.push({ start: supportedOffsets[index], end: supportedOffsets[end] });
      index = end + 1;
    }
    const separatedBands = bands.filter((band, index) =>
      bands.some((other, otherIndex) => otherIndex !== index
        && Math.max(band.start, other.start) - Math.min(band.end, other.end) >= 2));
    return separatedBands.length >= 2
      && Math.max(...separatedBands.map(band => band.end - band.start + 1))
        <= Math.max(4, Math.ceil(typicalThickness * 0.42));
  };
  const nonAxisExteriorEvidence = retainedFreeformSegments
    .filter(segment => {
      const angle = Math.abs(Math.atan2(segment.p2.y - segment.p1.y, segment.p2.x - segment.p1.x) * 180 / Math.PI) % 90;
      return Math.min(angle, 90 - angle) >= 10 && isFreeformExterior(segment, finalFlood.outside, width, height);
    })
    .reduce((sum, segment) => sum + Math.hypot(segment.p2.x - segment.p1.x, segment.p2.y - segment.p1.y), 0);
  const curvedExteriorNeighbourCount = (segment: Text4gFreeformWallSegment, maximumAngleDelta: number) => {
    const absoluteAngle = (Math.atan2(segment.p2.y - segment.p1.y, segment.p2.x - segment.p1.x) * 180 / Math.PI + 180) % 180;
    return retainedFreeformSegments.filter(other => {
      if (other === segment) return false;
      const otherAngle = (Math.atan2(other.p2.y - other.p1.y, other.p2.x - other.p1.x) * 180 / Math.PI + 180) % 180;
      const rawAngleDelta = Math.abs(otherAngle - absoluteAngle);
      const angleDelta = Math.min(rawAngleDelta, 180 - rawAngleDelta);
      const joins = Math.min(
        Math.hypot(segment.p1.x - other.p1.x, segment.p1.y - other.p1.y),
        Math.hypot(segment.p1.x - other.p2.x, segment.p1.y - other.p2.y),
        Math.hypot(segment.p2.x - other.p1.x, segment.p2.y - other.p1.y),
        Math.hypot(segment.p2.x - other.p2.x, segment.p2.y - other.p2.y),
      ) <= Math.max(2, typicalThickness * 1.5);
      return joins && angleDelta >= 2 && angleDelta <= maximumAngleDelta;
    }).length;
  };
  const curvedExteriorEvidence = (minimumNeighbours: number, maximumAngleDelta: number) => retainedFreeformSegments
    .filter(segment => {
      const absoluteAngle = (Math.atan2(segment.p2.y - segment.p1.y, segment.p2.x - segment.p1.x) * 180 / Math.PI + 180) % 180;
      const length = Math.hypot(segment.p2.x - segment.p1.x, segment.p2.y - segment.p1.y);
      return Math.min(absoluteAngle % 90, 90 - (absoluteAngle % 90)) >= 10
        && isFreeformExterior(segment, finalFlood.outside, width, height)
        && length >= typicalThickness * 0.65
        && curvedExteriorNeighbourCount(segment, maximumAngleDelta) >= minimumNeighbours;
    })
    .reduce((sum, segment) => sum + Math.hypot(segment.p2.x - segment.p1.x, segment.p2.y - segment.p1.y), 0);
  const smoothCurvedExteriorEvidence = curvedExteriorEvidence(2, 22);
  // Door/window interruptions often leave a real curve as two-chord runs, so
  // neither chord has two neighbours. Count that distributed evidence only
  // when most non-axis facade ink participates in gradual (not corner-like)
  // direction changes. Polygonal/angular plans therefore stay on their
  // established route.
  const distributedCurvedExteriorEvidence = curvedExteriorEvidence(1, 18);
  const nativeCurveMode: Text4gGeometryMode = text4gShouldRetainHybridCurveModeForTest(
    geometryMode,
    nonAxisExteriorEvidence,
    smoothCurvedExteriorEvidence,
    distributedCurvedExteriorEvidence,
    typicalThickness,
    width,
    height,
  ) ? geometryMode : geometryMode === 'hybrid' ? 'angular' : geometryMode;
  const curveEvidenceMode = geometryMode === 'curved'
    || (geometryMode === 'hybrid' && nativeCurveMode === 'hybrid');
  // Curves are allowed to pass through horizontal/vertical tangencies. The
  // axis detector sees those tangencies too, so filtering them before curve
  // fitting produces an analytically incomplete circle/ellipse. Feed the
  // original F freeform trace to proven curvilinear plans and reconcile axis
  // duplicates only after a supported native family exists.
  const curveSourceSegments = curveEvidenceMode ? freeformSegments : retainedFreeformSegments;
  const interiorArchitecturalCurveEvidence = (
    arc: Text4gNativeArcRun,
    sourceSegments: Text4gFreeformWallSegment[],
  ) => {
    const active = curveEvidenceMode && nativeCurveMode === 'hybrid';
    return text4gInteriorArchitecturalCurveEvidenceForTest(
      arc,
      sourceSegments,
      curveSourceSegments,
      outputWallSegments,
      width,
      height,
      typicalThickness,
      active,
      { x: (wallBounds.minX + wallBounds.maxX) / 2, y: (wallBounds.minY + wallBounds.maxY) / 2 },
      Math.min(wallBounds.maxX - wallBounds.minX, wallBounds.maxY - wallBounds.minY) * 0.1,
    );
  };
  const openShellExteriorCurveEvidence = (
    arc: Text4gNativeArcRun,
    sourceSegments: Text4gFreeformWallSegment[],
  ) => {
    const active = curveEvidenceMode && nativeCurveMode === 'hybrid';
    const outsideSourceCount = sourceSegments.filter(segment =>
      isFreeformExterior(segment, finalFlood.outside, width, height)).length;
    return text4gOpenShellExteriorCurveFamilyEvidenceForTest(
      arc,
      sourceSegments,
      outsideSourceCount,
      width,
      height,
      typicalThickness,
      active && smoothCurvilinearCandidate,
      { x: (wallBounds.minX + wallBounds.maxX) / 2, y: (wallBounds.minY + wallBounds.maxY) / 2 },
      Math.min(wallBounds.maxX - wallBounds.minX, wallBounds.maxY - wallBounds.minY) * 0.3,
    );
  };
  const consolidatedFreeform = consolidateText4gCurveArcs(curveSourceSegments, {
    mode: nativeCurveMode,
    structuralMask: originalDarkMask,
    width,
    height,
    typicalThickness,
    curveEvidence: curveEvidenceMode,
    hostedGaps: curveEvidenceMode ? freeformGaps : undefined,
    exteriorEvidence: curveEvidenceMode
      ? segment => isFreeformExterior(segment, finalFlood.outside, width, height)
        && segmentOnFootprintEdge(segment, 2.6)
      : undefined,
    interiorWindowEvidence: curveEvidenceMode
      ? segment => !isFreeformExterior(segment, finalFlood.outside, width, height)
        && segmentHasSeparatedGlazingBands(segment)
      : undefined,
    interiorArchitecturalEvidence: curveEvidenceMode
      ? interiorArchitecturalCurveEvidence
      : undefined,
    openShellExteriorEvidence: curveEvidenceMode
      ? openShellExteriorCurveEvidence
      : undefined,
  });
  const recoverNestedInteriorCurve = () => {
    if (!(curveEvidenceMode && nativeCurveMode === 'hybrid')) return;
    const nestedCenter = { x: (wallBounds.minX + wallBounds.maxX) / 2, y: (wallBounds.minY + wallBounds.maxY) / 2 };
    const nestedCenterTolerance = Math.min(
      wallBounds.maxX - wallBounds.minX,
      wallBounds.maxY - wallBounds.minY,
    ) * 0.1;
    const dominantOuterEllipse = consolidatedFreeform.arcs
      .filter(arc => arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined
        && Math.min(arc.ellipseRadiusX, arc.ellipseRadiusY) >= Math.min(width, height) * 0.28
        && Math.hypot(arc.center.x - nestedCenter.x, arc.center.y - nestedCenter.y) <= nestedCenterTolerance)
      .sort((first, second) =>
        second.ellipseRadiusX! * second.ellipseRadiusY! - first.ellipseRadiusX! * first.ellipseRadiusY!)[0];
    if (dominantOuterEllipse) {
      const maximumNestedRadius = Math.min(dominantOuterEllipse.ellipseRadiusX!, dominantOuterEllipse.ellipseRadiusY!) * 0.48;
      const nestedSegments = consolidatedFreeform.retainedSegments.filter(segment => {
        if (segment.bridge || segment.confidence < 0.68) return false;
        const midpoint = { x: (segment.p1.x + segment.p2.x) / 2, y: (segment.p1.y + segment.p2.y) / 2 };
        const radial = { x: midpoint.x - nestedCenter.x, y: midpoint.y - nestedCenter.y };
        const radius = Math.hypot(radial.x, radial.y);
        if (radius < typicalThickness * 4 || radius > maximumNestedRadius) return false;
        const tangent = { x: segment.p2.x - segment.p1.x, y: segment.p2.y - segment.p1.y };
        return Math.abs(radial.x * tangent.x + radial.y * tangent.y)
          / Math.max(1e-6, radius * Math.hypot(tangent.x, tangent.y)) <= 0.58;
      });
      if (nestedSegments.length >= 4) {
        const nestedConsolidated = consolidateText4gCurveArcs(nestedSegments, {
          mode: 'curved',
          structuralMask: originalDarkMask,
          width,
          height,
          typicalThickness,
          curveEvidence: true,
        });
        const acceptedNested = nestedConsolidated.arcs.filter(arc => {
          const sameEllipseFamily = (candidate: (typeof nestedConsolidated.arcs)[number]) =>
            candidate.ellipseRadiusX !== undefined && candidate.ellipseRadiusY !== undefined
            && arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined
            && Math.hypot(candidate.center.x - arc.center.x, candidate.center.y - arc.center.y)
              <= Math.max(3, typicalThickness * 0.8)
            && Math.abs(candidate.ellipseRadiusX - arc.ellipseRadiusX)
              <= Math.max(4, arc.ellipseRadiusX * 0.08)
            && Math.abs(candidate.ellipseRadiusY - arc.ellipseRadiusY)
              <= Math.max(4, arc.ellipseRadiusY * 0.08);
          const familySourceIndices = Array.from(new Set(
            nestedConsolidated.arcs
              .filter(sameEllipseFamily)
              .flatMap(candidate => candidate.sourceIndices),
          ));
          const sources = familySourceIndices
            .map(index => nestedSegments[index])
            .filter((segment): segment is Text4gFreeformWallSegment => !!segment);
          return text4gInteriorArchitecturalCurveEvidenceForTest(
            arc,
            sources,
            curveSourceSegments,
            outputWallSegments,
            width,
            height,
            typicalThickness,
            true,
            nestedCenter,
            nestedCenterTolerance,
          );
        });
        if (acceptedNested.length) {
          const acceptedSources = new Set<Text4gFreeformWallSegment>();
          acceptedNested.forEach(arc => {
            const mappedSourceIndices = arc.sourceIndices.flatMap(index => {
              const segment = nestedSegments[index];
              if (!segment) return [];
              acceptedSources.add(segment);
              const sourceIndex = curveSourceSegments.indexOf(segment);
              return sourceIndex >= 0 ? [sourceIndex] : [];
            });
            if (mappedSourceIndices.length) consolidatedFreeform.arcs.push({ ...arc, sourceIndices: mappedSourceIndices });
          });
          consolidatedFreeform.retainedSegments.splice(
            0,
            consolidatedFreeform.retainedSegments.length,
            ...consolidatedFreeform.retainedSegments.filter(segment => !acceptedSources.has(segment)),
          );
        }
      }
      const hasNestedFamily = consolidatedFreeform.arcs.some(arc =>
        arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined
        && Math.max(arc.ellipseRadiusX, arc.ellipseRadiusY) <= maximumNestedRadius * 1.08
        && Math.hypot(arc.center.x - nestedCenter.x, arc.center.y - nestedCenter.y) <= nestedCenterTolerance);
      if (!hasNestedFamily && nestedSegments.length >= 4) {
        const ring = recoverText4gConcentricInteriorRingForTest(
          originalDarkMask,
          width,
          height,
          typicalThickness,
          nestedCenter,
          Math.max(typicalThickness * 4.2, Math.min(width, height) * 0.055),
          maximumNestedRadius,
          true,
        );
        if (ring) {
          const sourceIndices = nestedSegments
            .map(segment => curveSourceSegments.indexOf(segment))
            .filter(index => index >= 0);
          const maximumPartSpan = Math.PI * 0.72;
          ring.intervals.forEach(interval => {
            const span = interval.end - interval.start;
            const partCount = Math.max(1, Math.ceil(span / maximumPartSpan));
            for (let part = 0; part < partCount; part++) {
              const startAngle = interval.start + span * part / partCount;
              const endAngle = interval.start + span * (part + 1) / partCount;
              const middleAngle = (startAngle + endAngle) / 2;
              const p1 = {
                x: ring.center.x + Math.cos(startAngle) * ring.radius,
                y: ring.center.y + Math.sin(startAngle) * ring.radius,
              };
              const p2 = {
                x: ring.center.x + Math.cos(endAngle) * ring.radius,
                y: ring.center.y + Math.sin(endAngle) * ring.radius,
              };
              const middle = {
                x: ring.center.x + Math.cos(middleAngle) * ring.radius,
                y: ring.center.y + Math.sin(middleAngle) * ring.radius,
              };
              consolidatedFreeform.arcs.push({
                sourceIndices: [...sourceIndices],
                p1,
                p2,
                center: ring.center,
                radius: ring.radius,
                startAngle,
                endAngle,
                counterclockwise: false,
                controlPoint: {
                  x: 2 * middle.x - (p1.x + p2.x) / 2,
                  y: 2 * middle.y - (p1.y + p2.y) / 2,
                },
                confidence: Math.min(0.9, 0.74 + ring.support * 0.18),
                rasterSupport: ring.support,
                ellipseRadiusX: ring.radius,
                ellipseRadiusY: ring.radius,
                ellipseRotation: 0,
                ellipseStartAngle: startAngle,
                ellipseEndAngle: endAngle,
                ellipseCounterclockwise: false,
              });
            }
          });
          const consumed = new Set(nestedSegments.filter(segment => {
            const endpoints = [segment.p1, segment.p2];
            return endpoints.every(point =>
              Math.abs(Math.hypot(point.x - ring.center.x, point.y - ring.center.y) - ring.radius)
                <= Math.max(3, typicalThickness * 2.2));
          }));
          consolidatedFreeform.retainedSegments.splice(
            0,
            consolidatedFreeform.retainedSegments.length,
            ...consolidatedFreeform.retainedSegments.filter(segment => !consumed.has(segment)),
          );
        }
      }
    }
  };
  recoverNestedInteriorCurve();
  if (curveEvidenceMode && consolidatedFreeform.arcs.length >= 2) {
    type ConsolidatedArc = (typeof consolidatedFreeform.arcs)[number];
    const ellipseArcs = consolidatedFreeform.arcs.filter(arc =>
      arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined);
    if (ellipseArcs.length) {
      const ellipseParameter = (ellipse: ConsolidatedArc, point: Text4gPixelPoint) => {
        const radiusX = ellipse.ellipseRadiusX!;
        const radiusY = ellipse.ellipseRadiusY!;
        const rotation = ellipse.ellipseRotation || 0;
        const cosR = Math.cos(rotation), sinR = Math.sin(rotation);
        const dx = point.x - ellipse.center.x, dy = point.y - ellipse.center.y;
        const localX = dx * cosR + dy * sinR;
        const localY = -dx * sinR + dy * cosR;
        const normalizedRadius = Math.hypot(
          localX / Math.max(1e-6, radiusX),
          localY / Math.max(1e-6, radiusY),
        );
        return {
          angle: Math.atan2(
            localY / Math.max(1e-6, radiusY),
            localX / Math.max(1e-6, radiusX),
          ),
          residual: Math.abs(normalizedRadius - 1) * Math.min(radiusX, radiusY),
        };
      };
      const ellipsePointAt = (ellipse: ConsolidatedArc, angle: number): Text4gPixelPoint => {
        const radiusX = ellipse.ellipseRadiusX!;
        const radiusY = ellipse.ellipseRadiusY!;
        const rotation = ellipse.ellipseRotation || 0;
        const cosR = Math.cos(rotation), sinR = Math.sin(rotation);
        const localX = Math.cos(angle) * radiusX;
        const localY = Math.sin(angle) * radiusY;
        return {
          x: ellipse.center.x + localX * cosR - localY * sinR,
          y: ellipse.center.y + localX * sinR + localY * cosR,
        };
      };
      const directedSpan = (start: number, end: number, counterclockwise: boolean) => {
        let span = counterclockwise ? start - end : end - start;
        while (span < 0) span += Math.PI * 2;
        while (span >= Math.PI * 2) span -= Math.PI * 2;
        return span;
      };
      const exteriorSourceRatio = (arc: ConsolidatedArc) => {
        const sources = arc.sourceIndices
          .map(index => curveSourceSegments[index])
          .filter((segment): segment is Text4gFreeformWallSegment => !!segment);
        if (!sources.length) return 0;
        return sources.filter(segment =>
          isFreeformExterior(segment, finalFlood.outside, width, height)
          && segmentOnFootprintEdge(segment, 2.8)).length / sources.length;
      };
      const promoted = consolidatedFreeform.arcs.map(arc => {
        if (arc.ellipseRadiusX !== undefined || arc.ellipseRadiusY !== undefined
          || exteriorSourceRatio(arc) < 0.6) return arc;
        const chordMidpoint = {
          x: (arc.p1.x + arc.p2.x) / 2,
          y: (arc.p1.y + arc.p2.y) / 2,
        };
        const analyticMidpoint = {
          x: (arc.controlPoint.x + chordMidpoint.x) / 2,
          y: (arc.controlPoint.y + chordMidpoint.y) / 2,
        };
        const match = ellipseArcs.map(ellipse => {
          const samples = [arc.p1, analyticMidpoint, arc.p2].map(point =>
            ellipseParameter(ellipse, point));
          const endpointResidual = Math.max(samples[0].residual, samples[2].residual);
          const midpointResidual = samples[1].residual;
          const score = endpointResidual + midpointResidual * 0.7;
          return { ellipse, samples, endpointResidual, midpointResidual, score };
        }).filter(candidate =>
          exteriorSourceRatio(candidate.ellipse) >= 0.6
          && candidate.endpointResidual <= Math.max(3, typicalThickness * 1.35)
          && candidate.midpointResidual <= Math.max(5, typicalThickness * 2.25))
          .sort((first, second) => first.score - second.score)[0];
        if (!match) return arc;
        const [startSample, middleSample, endSample] = match.samples;
        const directions = [false, true].map(counterclockwise => {
          const span = directedSpan(startSample.angle, endSample.angle, counterclockwise);
          const middleProgress = directedSpan(startSample.angle, middleSample.angle, counterclockwise);
          return { counterclockwise, span, middleProgress };
        }).filter(candidate =>
          candidate.span >= 0.025
          && candidate.span <= Math.PI * 1.2
          && candidate.middleProgress <= candidate.span + 0.08)
          .sort((first, second) => first.span - second.span);
        const direction = directions[0];
        if (!direction) return arc;
        const projectedP1 = ellipsePointAt(match.ellipse, startSample.angle);
        const projectedP2 = ellipsePointAt(match.ellipse, endSample.angle);
        const middleAngle = direction.counterclockwise
          ? startSample.angle - direction.span / 2
          : startSample.angle + direction.span / 2;
        const projectedMiddle = ellipsePointAt(match.ellipse, middleAngle);
        return {
          ...arc,
          p1: projectedP1,
          p2: projectedP2,
          center: match.ellipse.center,
          radius: (match.ellipse.ellipseRadiusX! + match.ellipse.ellipseRadiusY!) / 2,
          startAngle: startSample.angle,
          endAngle: endSample.angle,
          counterclockwise: direction.counterclockwise,
          controlPoint: {
            x: 2 * projectedMiddle.x - (projectedP1.x + projectedP2.x) / 2,
            y: 2 * projectedMiddle.y - (projectedP1.y + projectedP2.y) / 2,
          },
          confidence: Math.max(arc.confidence, 0.82),
          ellipseRadiusX: match.ellipse.ellipseRadiusX,
          ellipseRadiusY: match.ellipse.ellipseRadiusY,
          ellipseRotation: match.ellipse.ellipseRotation || 0,
          ellipseStartAngle: startSample.angle,
          ellipseEndAngle: endSample.angle,
          ellipseCounterclockwise: direction.counterclockwise,
        };
      });
      consolidatedFreeform.arcs.splice(0, consolidatedFreeform.arcs.length, ...promoted);
    }
  }
  if (curveEvidenceMode && consolidatedFreeform.arcs.length >= 1) {
    const TAU = Math.PI * 2;
    const familyKey = (arc: (typeof consolidatedFreeform.arcs)[number]) => [
      Math.round(arc.center.x / Math.max(1, typicalThickness)),
      Math.round(arc.center.y / Math.max(1, typicalThickness)),
      Math.round((arc.ellipseRadiusX ?? arc.radius) / Math.max(1, typicalThickness)),
      Math.round((arc.ellipseRadiusY ?? arc.radius) / Math.max(1, typicalThickness)),
    ].join(':');
    const families = new Map<string, typeof consolidatedFreeform.arcs>();
    consolidatedFreeform.arcs.filter(arc => arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined).forEach(arc => {
      const key = familyKey(arc);
      const family = families.get(key) || [];
      family.push(arc);
      families.set(key, family);
    });
    families.forEach(family => {
      if (!family.length) return;
      const representative = family[0];
      const radiusX = representative.ellipseRadiusX!;
      const radiusY = representative.ellipseRadiusY!;
      const intervals = family.flatMap(arc => {
        const start = ((arc.ellipseStartAngle ?? arc.startAngle) % TAU + TAU) % TAU;
        const endRaw = ((arc.ellipseEndAngle ?? arc.endAngle) % TAU + TAU) % TAU;
        const span = (endRaw - start + TAU) % TAU;
        const end = start + span;
        return end <= TAU
          ? [{ start, end }]
          : [{ start, end: TAU }, { start: 0, end: end - TAU }];
      }).sort((a, b) => a.start - b.start);
      const merged: Array<{ start: number; end: number }> = [];
      intervals.forEach(interval => {
        const current = merged[merged.length - 1];
        if (!current || interval.start > current.end + 0.035) merged.push({ ...interval });
        else current.end = Math.max(current.end, interval.end);
      });
      const restoreCurveHost = (
        p1: Text4gPixelPoint,
        p2: Text4gPixelPoint,
        startAngle: number,
        endAngle: number,
      ) => {
        const span = endAngle - startAngle;
        if (span < 0.035 || span > 1.15) return;
        const middleAngle = startAngle + span / 2;
        const coveredByFamily = family.some(arc => {
          const arcStart = ((arc.ellipseStartAngle ?? arc.startAngle) % TAU + TAU) % TAU;
          const arcEnd = ((arc.ellipseEndAngle ?? arc.endAngle) % TAU + TAU) % TAU;
          const arcSpan = (arcEnd - arcStart + TAU) % TAU;
          const progress = ((middleAngle % TAU + TAU) % TAU - arcStart + TAU) % TAU;
          return progress <= arcSpan + 0.04;
        });
        if (coveredByFamily) return;
        const middle = {
          x: representative.center.x + Math.cos(middleAngle) * radiusX,
          y: representative.center.y + Math.sin(middleAngle) * radiusY,
        };
        consolidatedFreeform.arcs.push({
          sourceIndices: [...representative.sourceIndices],
          p1, p2,
          center: representative.center,
          radius: (radiusX + radiusY) / 2,
          startAngle,
          endAngle,
          counterclockwise: false,
          controlPoint: {
            x: 2 * middle.x - (p1.x + p2.x) / 2,
            y: 2 * middle.y - (p1.y + p2.y) / 2,
          },
          confidence: 0.82,
          rasterSupport: 0,
          ellipseRadiusX: radiusX,
          ellipseRadiusY: radiusY,
          ellipseRotation: representative.ellipseRotation || 0,
          ellipseStartAngle: startAngle,
          ellipseEndAngle: endAngle,
          ellipseCounterclockwise: false,
        });
      };
      const acceptCurveGap = (
        p1: Text4gPixelPoint,
        p2: Text4gPixelPoint,
      ) => {
        const pixelLength = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const widthMeters = pixelLength * finalUniformScale;
        if (widthMeters < 0.45 || widthMeters > 2.4) return;
        const gap: Text4gFreeformWallGap = { p1, p2, thickness: typicalThickness, confidence: 0.82 };
        const evidence = inspectText4gFreeformGap(gap, originalDarkMask, originalDoorEvidenceMask, width, height);
        if (!evidence.doorLeaf && !evidence.windowFrame
          && (evidence.foldingSupport || 0) < 0.52
          && (evidence.slidingSupport || 0) < 0.62) return;
        const midpoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        if (freeformGaps.some(existing => Math.hypot(
          midpoint.x - (existing.p1.x + existing.p2.x) / 2,
          midpoint.y - (existing.p1.y + existing.p2.y) / 2,
        ) <= typicalThickness * 1.8)) return;
        freeformGaps.push(gap);
      };
      const angularGaps = merged.length ? merged.map((interval, index) => {
        const next = merged[(index + 1) % merged.length];
        const start = interval.end;
        const end = index + 1 < merged.length ? next.start : next.start + TAU;
        return { start, end, span: end - start };
      }) : [];
      const gapContainsDepartingLocalArc = (start: number, end: number) =>
        consolidatedFreeform.arcs.some(arc => {
          if (arc.ellipseRadiusX !== undefined || arc.ellipseRadiusY !== undefined) return false;
          let localSpan = arc.counterclockwise
            ? arc.startAngle - arc.endAngle
            : arc.endAngle - arc.startAngle;
          while (localSpan < 0) localSpan += TAU;
          const localMidAngle = arc.counterclockwise
            ? arc.startAngle - localSpan / 2
            : arc.startAngle + localSpan / 2;
          const localMidpoint = {
            x: arc.center.x + Math.cos(localMidAngle) * arc.radius,
            y: arc.center.y + Math.sin(localMidAngle) * arc.radius,
          };
          let familyAngle = Math.atan2(
            (localMidpoint.y - representative.center.y) / Math.max(1e-6, radiusY),
            (localMidpoint.x - representative.center.x) / Math.max(1e-6, radiusX),
          );
          while (familyAngle < start) familyAngle += TAU;
          const residual = Math.abs(Math.hypot(
            (localMidpoint.x - representative.center.x) / Math.max(1e-6, radiusX),
            (localMidpoint.y - representative.center.y) / Math.max(1e-6, radiusY),
          ) - 1) * Math.min(radiusX, radiusY);
          return familyAngle <= end && residual > Math.max(1.5, typicalThickness * 0.45);
        });
      angularGaps.forEach(candidate => {
        if (candidate.span < 0.035 || candidate.span > 1.15) return;
        // A strong native local arc in this interval is real shell geometry,
        // not an aperture in the global family. Do not paint the ellipse back
        // over an offset lobe or compound circular fragment.
        if (gapContainsDepartingLocalArc(candidate.start, candidate.end)) return;
        const startAngle = candidate.start % TAU, endAngle = candidate.end % TAU;
        const p1 = { x: representative.center.x + Math.cos(startAngle) * radiusX, y: representative.center.y + Math.sin(startAngle) * radiusY };
        const p2 = { x: representative.center.x + Math.cos(endAngle) * radiusX, y: representative.center.y + Math.sin(endAngle) * radiusY };
        // A hosted insert interrupts raster ink, not the editable wall object.
        // Close only a bounded gap between two pieces of the same already
        // accepted analytic family; opening classification remains evidence-led.
        restoreCurveHost(p1, p2, candidate.start, candidate.end);
        acceptCurveGap(p1, p2);
      });
      // Some family intervals intentionally span a raster aperture so the
      // analytic wall remains continuous. Scan those intervals for a local
      // centreline dropout with independent door/window symbol evidence;
      // topology remains the curve, while the dropout becomes its host item.
      const inkRadius = Math.max(1, Math.round(typicalThickness * 0.18));
      const hasStructuralInk = (point: Text4gPixelPoint) => {
        for (let oy = -inkRadius; oy <= inkRadius; oy++) for (let ox = -inkRadius; ox <= inkRadius; ox++) {
          if (ox * ox + oy * oy > inkRadius * inkRadius) continue;
          const x = Math.round(point.x + ox), y = Math.round(point.y + oy);
          if (x >= 0 && y >= 0 && x < width && y < height && originalDarkMask[y * width + x]) return true;
        }
        return false;
      };
      const scanCurveInterval = (interval: { start: number; end: number }) => {
        const sampleCount = Math.max(12, Math.ceil((interval.end - interval.start) * Math.max(radiusX, radiusY) / 2));
        const supported = Array.from({ length: sampleCount + 1 }, (_, index) => {
          const angle = interval.start + (interval.end - interval.start) * index / sampleCount;
          return hasStructuralInk({ x: representative.center.x + Math.cos(angle) * radiusX, y: representative.center.y + Math.sin(angle) * radiusY });
        });
        // Ignore one-sample antialiasing/symbol crossings inside an aperture.
        for (let index = 1; index < supported.length - 1; index++) {
          if (supported[index] && !supported[index - 1] && !supported[index + 1]) supported[index] = false;
        }
        let runStart = -1;
        for (let index = 0; index <= supported.length; index++) {
          if (index < supported.length && !supported[index] && runStart < 0) runStart = index;
          if ((index === supported.length || supported[index]) && runStart >= 0) {
            const runEnd = index - 1;
            if (runEnd - runStart >= 2) {
              const startAngle = interval.start + (interval.end - interval.start) * runStart / sampleCount;
              const endAngle = interval.start + (interval.end - interval.start) * runEnd / sampleCount;
              acceptCurveGap(
                { x: representative.center.x + Math.cos(startAngle) * radiusX, y: representative.center.y + Math.sin(startAngle) * radiusY },
                { x: representative.center.x + Math.cos(endAngle) * radiusX, y: representative.center.y + Math.sin(endAngle) * radiusY },
              );
            }
            runStart = -1;
          }
        }
      };
      merged.forEach(scanCurveInterval);
      // A long missing family interval can contain two adjacent hosted doors
      // separated by a short surviving pier. Scan it instead of treating the
      // entire multi-opening span as one oversized aperture.
      angularGaps.filter(candidate => candidate.span <= 1.8).forEach(scanCurveInterval);
    });
    // Native tracing can fit the same exterior stroke once as a global
    // ellipse and again as one or more short local arcs. After the local arcs
    // have been admitted to the matching analytic family above, collapse only
    // overlapping/touching intervals of that exact family. Real offset lobes
    // and compound curves retain different centres/radii and remain separate.
    const canonicalEllipseFamilies = new Map<string, typeof consolidatedFreeform.arcs>();
    consolidatedFreeform.arcs
      .filter(arc => arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined)
      .forEach(arc => {
        const key = familyKey(arc);
        const family = canonicalEllipseFamilies.get(key) || [];
        family.push(arc);
        canonicalEllipseFamilies.set(key, family);
      });
    const canonicalEllipseArcs: typeof consolidatedFreeform.arcs = [];
    canonicalEllipseFamilies.forEach(family => {
      const representative = family[0];
      const radiusX = representative.ellipseRadiusX!;
      const radiusY = representative.ellipseRadiusY!;
      const rotation = representative.ellipseRotation || 0;
      const intervals = family.flatMap(arc => {
        const start = ((arc.ellipseStartAngle ?? arc.startAngle) % TAU + TAU) % TAU;
        const end = ((arc.ellipseEndAngle ?? arc.endAngle) % TAU + TAU) % TAU;
        const counterclockwise = arc.ellipseCounterclockwise ?? arc.counterclockwise;
        const increasingStart = counterclockwise ? end : start;
        const increasingEnd = counterclockwise ? start : end;
        const span = (increasingEnd - increasingStart + TAU) % TAU;
        const unwrappedEnd = increasingStart + span;
        return unwrappedEnd <= TAU
          ? [{ start: increasingStart, end: unwrappedEnd }]
          : [
            { start: increasingStart, end: TAU },
            { start: 0, end: unwrappedEnd - TAU },
          ];
      }).sort((first, second) => first.start - second.start);
      const merged: Array<{ start: number; end: number }> = [];
      intervals.forEach(interval => {
        const current = merged[merged.length - 1];
        if (!current || interval.start > current.end + 0.035) merged.push({ ...interval });
        else current.end = Math.max(current.end, interval.end);
      });
      if (merged.length >= 2
        && merged[0].start <= 0.035
        && merged[merged.length - 1].end >= TAU - 0.035) {
        const first = merged.shift()!;
        const last = merged.pop()!;
        merged.push({ start: last.start, end: first.end + TAU });
      }
      const pointAt = (angle: number): Text4gPixelPoint => {
        const cosR = Math.cos(rotation), sinR = Math.sin(rotation);
        const localX = Math.cos(angle) * radiusX;
        const localY = Math.sin(angle) * radiusY;
        return {
          x: representative.center.x + localX * cosR - localY * sinR,
          y: representative.center.y + localX * sinR + localY * cosR,
        };
      };
      merged.forEach(interval => {
        const p1 = pointAt(interval.start);
        const p2 = pointAt(interval.end);
        const middle = pointAt(interval.start + (interval.end - interval.start) / 2);
        canonicalEllipseArcs.push({
          ...representative,
          sourceIndices: Array.from(new Set(family.flatMap(arc => arc.sourceIndices))),
          p1,
          p2,
          startAngle: interval.start,
          endAngle: interval.end,
          counterclockwise: false,
          controlPoint: {
            x: 2 * middle.x - (p1.x + p2.x) / 2,
            y: 2 * middle.y - (p1.y + p2.y) / 2,
          },
          confidence: Math.max(...family.map(arc => arc.confidence)),
          rasterSupport: Math.max(...family.map(arc => arc.rasterSupport)),
          ellipseRadiusX: radiusX,
          ellipseRadiusY: radiusY,
          ellipseRotation: rotation,
          ellipseStartAngle: interval.start,
          ellipseEndAngle: interval.end,
          ellipseCounterclockwise: false,
        });
      });
    });
    consolidatedFreeform.arcs.splice(
      0,
      consolidatedFreeform.arcs.length,
      ...consolidatedFreeform.arcs.filter(arc =>
        arc.ellipseRadiusX === undefined || arc.ellipseRadiusY === undefined),
      ...canonicalEllipseArcs,
    );
    // Independently fitted curve pieces can terminate on opposite jambs of the
    // same exterior insert. Recover that aperture from the two native endpoints
    // only when the raster between them contains a specific door signature.
    const curveEndpoints = consolidatedFreeform.arcs.flatMap((arc, arcIndex) => [
      { point: arc.p1, arcIndex }, { point: arc.p2, arcIndex },
    ]);
    for (let firstIndex = 0; firstIndex < curveEndpoints.length; firstIndex++) {
      for (let secondIndex = firstIndex + 1; secondIndex < curveEndpoints.length; secondIndex++) {
        const first = curveEndpoints[firstIndex], second = curveEndpoints[secondIndex];
        if (first.arcIndex === second.arcIndex) continue;
        const pixelLength = Math.hypot(second.point.x - first.point.x, second.point.y - first.point.y);
        const widthMeters = pixelLength * finalUniformScale;
        if (widthMeters < 0.55 || widthMeters > 2.25) continue;
        const gap: Text4gFreeformWallGap = {
          p1: first.point, p2: second.point, thickness: typicalThickness, confidence: 0.8,
        };
        if (!isFreeformExterior(gap, finalFlood.outside, width, height)) continue;
        const midpoint = { x: (gap.p1.x + gap.p2.x) / 2, y: (gap.p1.y + gap.p2.y) / 2 };
        if (freeformGaps.some(existing => Math.hypot(
          midpoint.x - (existing.p1.x + existing.p2.x) / 2,
          midpoint.y - (existing.p1.y + existing.p2.y) / 2,
        ) <= typicalThickness * 1.8)) continue;
        const evidence = inspectText4gFreeformGap(gap, originalDarkMask, originalDoorEvidenceMask, width, height);
        const foldingSignature = (evidence.foldingSupport || 0) >= 0.25
          && (evidence.parallelSupport || 0) < 0.45
          && (evidence.doorLeafSupport || 0) >= 0.12;
        const slidingSignature = widthMeters >= 1.1 && (evidence.slidingSupport || 0) >= 0.68;
        const swingSignature = (evidence.doorLeafSupport || 0) >= 0.62
          && (evidence.parallelSupport || 0) < 0.45;
        if (foldingSignature || slidingSignature || swingSignature) freeformGaps.push(gap);
      }
    }
  }
  if (curveEvidenceMode && consolidatedFreeform.arcs.length) {
    const TAU = Math.PI * 2;
    const directedCurveSpan = (start: number, end: number, counterclockwise: boolean) => {
      let span = counterclockwise ? start - end : end - start;
      while (span < 0) span += TAU;
      while (span >= TAU) span -= TAU;
      return span;
    };
    const curveParameterDistance = (arc: (typeof consolidatedFreeform.arcs)[number], point: Text4gPixelPoint) => {
      const radiusX = arc.ellipseRadiusX ?? arc.radius;
      const radiusY = arc.ellipseRadiusY ?? arc.radius;
      const rotation = arc.ellipseRotation || 0;
      const cosR = Math.cos(rotation), sinR = Math.sin(rotation);
      const dx = point.x - arc.center.x, dy = point.y - arc.center.y;
      const localX = dx * cosR + dy * sinR;
      const localY = -dx * sinR + dy * cosR;
      const angle = Math.atan2(localY / Math.max(1e-6, radiusY), localX / Math.max(1e-6, radiusX));
      const residual = Math.abs(Math.hypot(localX / Math.max(1e-6, radiusX), localY / Math.max(1e-6, radiusY)) - 1)
        * Math.min(radiusX, radiusY);
      const start = arc.ellipseStartAngle ?? arc.startAngle;
      const end = arc.ellipseEndAngle ?? arc.endAngle;
      const counterclockwise = arc.ellipseCounterclockwise ?? arc.counterclockwise;
      const span = directedCurveSpan(start, end, counterclockwise);
      const progress = directedCurveSpan(start, angle, counterclockwise);
      return { residual, within: progress <= span + 0.08 };
    };
    const ellipseFamilyArcs = consolidatedFreeform.arcs.filter(arc =>
      arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined);
    if (ellipseFamilyArcs.length) {
      const uniqueArcs = consolidatedFreeform.arcs.filter(arc => {
        if (arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined) return true;
        const chordMidpoint = { x: (arc.p1.x + arc.p2.x) / 2, y: (arc.p1.y + arc.p2.y) / 2 };
        const analyticMidpoint = {
          x: (arc.controlPoint.x + chordMidpoint.x) / 2,
          y: (arc.controlPoint.y + chordMidpoint.y) / 2,
        };
        return ![arc.p1, analyticMidpoint, arc.p2].every(point =>
          ellipseFamilyArcs.some(ellipseArc => {
            const sample = curveParameterDistance(ellipseArc, point);
            return sample.within && sample.residual <= Math.max(2.5, typicalThickness * 1.5);
          }));
      });
      consolidatedFreeform.arcs.splice(0, consolidatedFreeform.arcs.length, ...uniqueArcs);
    }
    const curvePointAt = (arc: (typeof consolidatedFreeform.arcs)[number], angle: number): Text4gPixelPoint => {
      const radiusX = arc.ellipseRadiusX ?? arc.radius;
      const radiusY = arc.ellipseRadiusY ?? arc.radius;
      const rotation = arc.ellipseRotation || 0;
      const cosR = Math.cos(rotation), sinR = Math.sin(rotation);
      return {
        x: arc.center.x + Math.cos(angle) * radiusX * cosR - Math.sin(angle) * radiusY * sinR,
        y: arc.center.y + Math.cos(angle) * radiusX * sinR + Math.sin(angle) * radiusY * cosR,
      };
    };
    const curveTangentAt = (arc: (typeof consolidatedFreeform.arcs)[number], angle: number): Text4gPixelPoint => {
      const radiusX = arc.ellipseRadiusX ?? arc.radius;
      const radiusY = arc.ellipseRadiusY ?? arc.radius;
      const rotation = arc.ellipseRotation || 0;
      const cosR = Math.cos(rotation), sinR = Math.sin(rotation);
      const local = { x: -Math.sin(angle) * radiusX, y: Math.cos(angle) * radiusY };
      const rotated = {
        x: local.x * cosR - local.y * sinR,
        y: local.x * sinR + local.y * cosR,
      };
      const length = Math.max(1e-6, Math.hypot(rotated.x, rotated.y));
      return { x: rotated.x / length, y: rotated.y / length };
    };
    const curveBandSupport = (
      mask: Uint8Array,
      arc: (typeof consolidatedFreeform.arcs)[number],
      angle: number,
    ) => {
      const point = curvePointAt(arc, angle);
      const tangent = curveTangentAt(arc, angle);
      const normal = { x: -tangent.y, y: tangent.x };
      const pixelRadius = Math.max(1, Math.round(typicalThickness * 0.16));
      let hits = 0, samples = 0;
      for (const offsetFactor of [-0.52, -0.26, 0, 0.26, 0.52]) {
        const cx = point.x + normal.x * typicalThickness * offsetFactor;
        const cy = point.y + normal.y * typicalThickness * offsetFactor;
        let found = false;
        for (let oy = -pixelRadius; oy <= pixelRadius && !found; oy++) {
          for (let ox = -pixelRadius; ox <= pixelRadius; ox++) {
            if (ox * ox + oy * oy > pixelRadius * pixelRadius) continue;
            const x = Math.round(cx + ox), y = Math.round(cy + oy);
            if (x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x]) {
              found = true;
              break;
            }
          }
        }
        samples++;
        if (found) hits++;
      }
      return hits / Math.max(1, samples);
    };
    const extendCurveEndpoint = (
      arc: (typeof consolidatedFreeform.arcs)[number],
      endpoint: 'start' | 'end',
    ) => {
      const counterclockwise = arc.ellipseCounterclockwise ?? arc.counterclockwise;
      const baseAngle = endpoint === 'start'
        ? arc.ellipseStartAngle ?? arc.startAngle
        : arc.ellipseEndAngle ?? arc.endAngle;
      const direction = endpoint === 'start'
        ? (counterclockwise ? 1 : -1)
        : (counterclockwise ? -1 : 1);
      const step = 0.014;
      const maximumExtension = 0.42;
      const dropoutBudget = 0.042;
      let missedSpan = 0;
      let bestAngle = baseAngle;
      for (let travelled = step; travelled <= maximumExtension; travelled += step) {
        const angle = baseAngle + direction * travelled;
        const structuralSupport = curveBandSupport(originalDarkMask, arc, angle);
        const symbolSupport = curveBandSupport(originalDoorEvidenceMask, arc, angle);
        const supported = structuralSupport >= 0.34 || (symbolSupport >= 0.46 && structuralSupport >= 0.16);
        if (supported) {
          bestAngle = angle;
          missedSpan = 0;
        } else {
          missedSpan += step;
          if (missedSpan > dropoutBudget) break;
        }
      }
      if (Math.abs(bestAngle - baseAngle) < step * 1.5) return;
      const point = curvePointAt(arc, bestAngle);
      if (endpoint === 'start') {
        arc.p1 = point;
        arc.startAngle = bestAngle;
        if (arc.ellipseStartAngle !== undefined) arc.ellipseStartAngle = bestAngle;
      } else {
        arc.p2 = point;
        arc.endAngle = bestAngle;
        if (arc.ellipseEndAngle !== undefined) arc.ellipseEndAngle = bestAngle;
      }
      const start = arc.ellipseStartAngle ?? arc.startAngle;
      const end = arc.ellipseEndAngle ?? arc.endAngle;
      const span = directedCurveSpan(start, end, counterclockwise);
      const middleAngle = counterclockwise ? start - span / 2 : start + span / 2;
      const middle = curvePointAt(arc, middleAngle);
      arc.controlPoint = {
        x: 2 * middle.x - (arc.p1.x + arc.p2.x) / 2,
        y: 2 * middle.y - (arc.p1.y + arc.p2.y) / 2,
      };
    };
    consolidatedFreeform.arcs.forEach(arc => {
      extendCurveEndpoint(arc, 'start');
      extendCurveEndpoint(arc, 'end');
    });
    const lateCurveFamilySources = (arc: (typeof consolidatedFreeform.arcs)[number]) => {
      const sameFamily = (candidate: (typeof consolidatedFreeform.arcs)[number]) =>
        arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined
        && candidate.ellipseRadiusX !== undefined && candidate.ellipseRadiusY !== undefined
        && Math.hypot(candidate.center.x - arc.center.x, candidate.center.y - arc.center.y)
          <= typicalThickness * 0.8
        && Math.abs(candidate.ellipseRadiusX - arc.ellipseRadiusX) <= typicalThickness * 1.2
        && Math.abs(candidate.ellipseRadiusY - arc.ellipseRadiusY) <= typicalThickness * 1.2;
      const family = arc.ellipseRadiusX === undefined
        ? [arc]
        : consolidatedFreeform.arcs.filter(sameFamily);
      return Array.from(new Set(family.flatMap(candidate => candidate.sourceIndices)))
        .map(index => curveSourceSegments[index])
        .filter((segment): segment is Text4gFreeformWallSegment => !!segment);
    };
    if (nativeCurveMode === 'hybrid') {
      const dominantEllipse = consolidatedFreeform.arcs
        .filter(arc => arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined)
        .filter(arc => {
          const sources = lateCurveFamilySources(arc);
          const exteriorCount = sources.filter(segment =>
            isFreeformExterior(segment, finalFlood.outside, width, height)
            && segmentOnFootprintEdge(segment, 2.8)).length;
          return exteriorCount >= Math.max(1, Math.ceil(sources.length * 0.35));
        })
        .sort((first, second) =>
          second.ellipseRadiusX! * second.ellipseRadiusY! - first.ellipseRadiusX! * first.ellipseRadiusY!)[0];
      if (dominantEllipse) {
        const family = consolidatedFreeform.arcs.filter(arc =>
          arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined
          && Math.hypot(arc.center.x - dominantEllipse.center.x, arc.center.y - dominantEllipse.center.y)
            <= typicalThickness * 0.8
          && Math.abs(arc.ellipseRadiusX - dominantEllipse.ellipseRadiusX!) <= typicalThickness * 1.2
          && Math.abs(arc.ellipseRadiusY - dominantEllipse.ellipseRadiusY!) <= typicalThickness * 1.2);
        const angleCovered = (angle: number) => family.some(arc => {
          const start = arc.ellipseStartAngle ?? arc.startAngle;
          const end = arc.ellipseEndAngle ?? arc.endAngle;
          const counterclockwise = arc.ellipseCounterclockwise ?? arc.counterclockwise;
          const rawSpan = counterclockwise ? start - end : end - start;
          if (Math.abs(rawSpan) >= TAU - 0.12) return true;
          return directedCurveSpan(start, angle, counterclockwise)
            <= directedCurveSpan(start, end, counterclockwise) + 0.025;
        });
        const sampleCount = 360;
        const supported = Array.from({ length: sampleCount }, (_, index) => {
          const angle = TAU * index / sampleCount;
          if (angleCovered(angle)) return false;
          const structuralSupport = curveBandSupport(originalDarkMask, dominantEllipse, angle);
          const symbolSupport = curveBandSupport(originalDoorEvidenceMask, dominantEllipse, angle);
          return text4gDominantEllipseGapHasRasterEvidenceForTest(
            structuralSupport,
            symbolSupport,
          );
        });
        const firstGap = supported.findIndex(value => !value);
        if (firstGap >= 0) {
          let cursor = firstGap + 1;
          const limit = firstGap + sampleCount + 1;
          const sourceIndices = Array.from(new Set(family.flatMap(arc => arc.sourceIndices)));
          while (cursor < limit) {
            while (cursor < limit && !supported[cursor % sampleCount]) cursor++;
            const startIndex = cursor;
            while (cursor < limit && supported[cursor % sampleCount]) cursor++;
            if (cursor - startIndex < 6) continue;
            const startAngle = TAU * startIndex / sampleCount;
            const endAngle = TAU * cursor / sampleCount;
            const span = endAngle - startAngle;
            const partCount = Math.max(1, Math.ceil(span / (Math.PI * 0.72)));
            for (let part = 0; part < partCount; part++) {
              const partStart = startAngle + span * part / partCount;
              const partEnd = startAngle + span * (part + 1) / partCount;
              const p1 = curvePointAt(dominantEllipse, partStart);
              const p2 = curvePointAt(dominantEllipse, partEnd);
              const middle = curvePointAt(dominantEllipse, (partStart + partEnd) / 2);
              consolidatedFreeform.arcs.push({
                ...dominantEllipse,
                sourceIndices: [...sourceIndices],
                p1,
                p2,
                startAngle: partStart,
                endAngle: partEnd,
                counterclockwise: false,
                controlPoint: {
                  x: 2 * middle.x - (p1.x + p2.x) / 2,
                  y: 2 * middle.y - (p1.y + p2.y) / 2,
                },
                confidence: Math.min(dominantEllipse.confidence, 0.82),
                rasterSupport: 0.72,
                ellipseStartAngle: partStart,
                ellipseEndAngle: partEnd,
                ellipseCounterclockwise: false,
                rasterRecovered: true,
              });
            }
          }
        }
      }
    }
    if (nativeCurveMode === 'hybrid') {
      const rejectedSources = new Set<Text4gFreeformWallSegment>();
      const coherentArcs = consolidatedFreeform.arcs.filter(arc => {
        const sources = lateCurveFamilySources(arc);
        const coherent = text4gCurveArcSourceEnvelopeCoherentForTest(
          arc,
          sources,
          width,
          height,
          typicalThickness,
        );
        if (!coherent) sources.forEach(segment => rejectedSources.add(segment));
        return coherent;
      });
      if (coherentArcs.length !== consolidatedFreeform.arcs.length) {
        consolidatedFreeform.arcs.splice(0, consolidatedFreeform.arcs.length, ...coherentArcs);
        rejectedSources.forEach(segment => {
          if (!consolidatedFreeform.retainedSegments.includes(segment)) consolidatedFreeform.retainedSegments.push(segment);
        });
      }
    }
    // The late source-envelope check can return fragments consumed by an
    // over-fitted curve. Give only those newly retained hybrid fragments one
    // final opportunity to form a raster-supported nested architectural ring.
    recoverNestedInteriorCurve();
    rasterizeNativeText4gArcs(barrier, consolidatedFreeform.arcs, width, height, typicalThickness);
    finalFlood = floodSpaces(barrier, width, height, finalScale);

    outputWallSegments = outputWallSegments.filter(segment => {
      const p1 = segment.axis === 'horizontal'
        ? { x: segment.start, y: segment.line }
        : { x: segment.line, y: segment.start };
      const p2 = segment.axis === 'horizontal'
        ? { x: segment.end, y: segment.line }
        : { x: segment.line, y: segment.end };
      const midpoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      const covered = consolidatedFreeform.arcs.some(arc => {
        const samples = [curveParameterDistance(arc, p1), curveParameterDistance(arc, midpoint), curveParameterDistance(arc, p2)];
        return samples.every(sample => sample.within)
          && Math.max(samples[0].residual, samples[2].residual) <= Math.max(2.5, typicalThickness * 1.25)
          && samples[1].residual <= Math.max(3.5, typicalThickness * 1.8);
      });
      const asFreeform = { p1, p2, thickness: segment.thickness, confidence: 0.8 };
      const exteriorFamilyProxy = isFreeformExterior(asFreeform, finalFlood.outside, width, height)
        && consolidatedFreeform.arcs.some(arc => {
          const first = curveParameterDistance(arc, p1), second = curveParameterDistance(arc, p2);
          return Math.max(first.residual, second.residual) <= Math.max(4, typicalThickness * 2.4);
        });
      return !covered && !exteriorFamilyProxy;
    });
  }
  if (smoothCurvilinearCandidate && curveEvidenceMode) {
    // Curve/hybrid tracing also sees the lightly drifting centerlines of
    // ordinary horizontal and vertical room partitions. Return those lines to
    // the established orthogonal network before angular cleanup; otherwise
    // they survive as several nearly-axis freeform fragments and bypass the
    // same merging/opening rules used by a rectilinear plan.
    const projectedStraightPartitions = freeformAxisProjections(
      consolidatedFreeform.retainedSegments,
      Math.max(typicalThickness * 1.8, 0.35 / Math.max(1e-6, finalUniformScale)),
    );
    if (projectedStraightPartitions.length) {
      outputWallSegments = mergeTouchingCollinearWallSegments(
        deduplicateParallelSegments(
          [...outputWallSegments, ...projectedStraightPartitions],
          Math.max(2, typicalThickness * 0.75),
        ),
        finalScale,
        typicalThickness,
      );
    }
  }
  const cleanedAngularWalls = cleanupText4gAngularWalls(
    consolidatedFreeform.retainedSegments,
    outputWallSegments,
    {
      mode: geometryMode,
      structuralMask: originalDarkMask,
      width,
      height,
      typicalThickness,
      protectedGaps: [
        ...freeformGaps,
        ...architecturalHostedGaps.map(gap => ({
          p1: gap.axis === 'horizontal'
            ? { x: gap.start, y: gap.line }
            : { x: gap.line, y: gap.start },
          p2: gap.axis === 'horizontal'
            ? { x: gap.end, y: gap.line }
            : { x: gap.line, y: gap.end },
          thickness: gap.thickness,
          confidence: 1,
        })),
      ],
    },
  );
  outputWallSegments = cleanedAngularWalls.axisSegments;
  const curveApertureChord = (segment: Text4gFreeformWallSegment) => {
    if (!curveEvidenceMode) return false;
    const segmentLength = Math.hypot(segment.p2.x - segment.p1.x, segment.p2.y - segment.p1.y);
    const segmentMidpoint = { x: (segment.p1.x + segment.p2.x) / 2, y: (segment.p1.y + segment.p2.y) / 2 };
    const apertureAligned = freeformGaps.some(gap => {
      const gapLength = Math.hypot(gap.p2.x - gap.p1.x, gap.p2.y - gap.p1.y);
      const gapMidpoint = { x: (gap.p1.x + gap.p2.x) / 2, y: (gap.p1.y + gap.p2.y) / 2 };
      const alignment = Math.abs(
        ((segment.p2.x - segment.p1.x) * (gap.p2.x - gap.p1.x)
          + (segment.p2.y - segment.p1.y) * (gap.p2.y - gap.p1.y))
        / Math.max(1e-6, segmentLength * gapLength),
      );
      return alignment >= 0.88
        && Math.hypot(segmentMidpoint.x - gapMidpoint.x, segmentMidpoint.y - gapMidpoint.y)
          <= Math.max(typicalThickness * 2.2, gapLength * 0.75);
    });
    const eligibleProxy = segment.bridge
      || isFreeformExterior(segment, finalFlood.outside, width, height)
      || (apertureAligned && segmentLength * finalUniformScale <= 2.4);
    if (!eligibleProxy) return false;
    return consolidatedFreeform.arcs.some(arc => {
      const radiusX = arc.ellipseRadiusX ?? arc.radius;
      const radiusY = arc.ellipseRadiusY ?? arc.radius;
      const endpointResidual = (point: Text4gPixelPoint) => Math.abs(Math.hypot(
        (point.x - arc.center.x) / Math.max(1e-6, radiusX),
        (point.y - arc.center.y) / Math.max(1e-6, radiusY),
      ) - 1) * Math.min(radiusX, radiusY);
      return Math.max(endpointResidual(segment.p1), endpointResidual(segment.p2))
        <= Math.max(4, typicalThickness * 2.4);
    });
  };
  const duplicatesAxisWall = (segment: Text4gFreeformWallSegment) => {
    if (!curveEvidenceMode) return false;
    const dx = segment.p2.x - segment.p1.x, dy = segment.p2.y - segment.p1.y;
    const horizontal = Math.abs(dy) <= Math.abs(dx) * 0.08;
    const vertical = Math.abs(dx) <= Math.abs(dy) * 0.08;
    if (!horizontal && !vertical) return false;
    return outputWallSegments.some(axis => {
      if ((horizontal && axis.axis !== 'horizontal') || (vertical && axis.axis !== 'vertical')) return false;
      const line = horizontal ? (segment.p1.y + segment.p2.y) / 2 : (segment.p1.x + segment.p2.x) / 2;
      if (Math.abs(line - axis.line) > typicalThickness * 1.15) return false;
      const start = horizontal ? Math.min(segment.p1.x, segment.p2.x) : Math.min(segment.p1.y, segment.p2.y);
      const end = horizontal ? Math.max(segment.p1.x, segment.p2.x) : Math.max(segment.p1.y, segment.p2.y);
      const overlap = Math.max(0, Math.min(end, axis.end) - Math.max(start, axis.start));
      return overlap >= (end - start) * 0.72;
    });
  };
  const freeformStructuralCoreRatio = (segment: Text4gFreeformWallSegment) => {
    const dx = segment.p2.x - segment.p1.x, dy = segment.p2.y - segment.p1.y;
    const length = Math.max(1e-6, Math.hypot(dx, dy));
    const normal = { x: -dy / length, y: dx / length };
    let dark = 0, samples = 0;
    for (const progress of [0.2, 0.35, 0.5, 0.65, 0.8]) {
      const center = { x: segment.p1.x + dx * progress, y: segment.p1.y + dy * progress };
      for (const offsetFactor of [-0.34, -0.17, 0, 0.17, 0.34]) {
        const x = Math.round(center.x + normal.x * typicalThickness * offsetFactor);
        const y = Math.round(center.y + normal.y * typicalThickness * offsetFactor);
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        samples++;
        dark += originalDarkMask[y * width + x];
      }
    }
    return dark / Math.max(1, samples);
  };
  const supportedCurvilinearStraightWall = (segment: Text4gFreeformWallSegment) => {
    if (!smoothCurvilinearCandidate || !curveEvidenceMode) return true;
    const angle = Math.abs(Math.atan2(segment.p2.y - segment.p1.y, segment.p2.x - segment.p1.x) * 180 / Math.PI) % 90;
    const distanceFromAxis = Math.min(angle, 90 - angle);
    if (distanceFromAxis <= 7) return true;
    // Door leaves, swing arcs, cabinet outlines, and furniture edges can join
    // two real walls but do not contain a filled wall-width raster core. Keep
    // a non-axis interior chord only when its own middle run proves that core.
    return freeformStructuralCoreRatio(segment) >= 0.52;
  };
  const exportFreeformSegments = collapseText4gExteriorAngularChamfers(
    cleanedAngularWalls.freeformSegments,
    {
      typicalThickness,
      maxLengthPixels: Math.max(typicalThickness * 2.4, 0.45 / Math.max(1e-6, finalUniformScale)),
      isExterior: segment => isFreeformExterior(segment, finalFlood.outside, width, height),
    },
  ).filter(segment => !curveApertureChord(segment)
    && !duplicatesAxisWall(segment)
    && supportedCurvilinearStraightWall(segment));
  const orthogonalWalls: NonNullable<GeneratedData['walls']> = outputWallSegments.map(segment => {
    const envelopeExtreme = segment.axis === 'horizontal'
      ? Math.abs(segment.line - frameAxisBounds.minY) <= typicalThickness * 1.5 || Math.abs(segment.line - frameAxisBounds.maxY) <= typicalThickness * 1.5
      : Math.abs(segment.line - frameAxisBounds.minX) <= typicalThickness * 1.5 || Math.abs(segment.line - frameAxisBounds.maxX) <= typicalThickness * 1.5;
    const asFreeform = segment.axis === 'horizontal'
      ? { p1: { x: segment.start, y: segment.line }, p2: { x: segment.end, y: segment.line }, thickness: segment.thickness }
      : { p1: { x: segment.line, y: segment.start }, p2: { x: segment.line, y: segment.end }, thickness: segment.thickness };
    const exterior = curveEvidenceMode
      ? envelopeExtreme || isGapOnFootprintEdge(segment, footprintPixels, typicalThickness * 1.8)
      : geometryMode === 'orthogonal'
      ? envelopeExtreme || isGapOnFootprintEdge(segment, footprintPixels, typicalThickness * 1.8)
      : isFreeformExterior(asFreeform, finalFlood.outside, width, height);
    return {
      levelIndex: 0,
      p1: segment.axis === 'horizontal' ? mapPoint(segment.start, segment.line) : mapPoint(segment.line, segment.start),
      p2: segment.axis === 'horizontal' ? mapPoint(segment.end, segment.line) : mapPoint(segment.line, segment.end),
      type: exterior ? 'exterior' : 'interior',
      provenance: 'observed',
      evidence: {
        source: 'raster',
        confidence: clamp(0.62 + Math.min(0.28, segment.thickness / Math.max(1, typicalThickness) * 0.14), 0, 0.9),
        pixelBounds: segment.axis === 'horizontal'
          ? { x0: segment.start, y0: segment.line - segment.thickness / 2, x1: segment.end, y1: segment.line + segment.thickness / 2 }
          : { x0: segment.line - segment.thickness / 2, y0: segment.start, x1: segment.line + segment.thickness / 2, y1: segment.end },
      },
    };
  });
  const isTinyAngularConnector = (segment: (typeof cleanedAngularWalls.freeformSegments)[number]) => {
    const lengthMeters = Math.hypot(segment.p2.x - segment.p1.x, segment.p2.y - segment.p1.y) * finalUniformScale;
    if (geometryMode === 'orthogonal' || lengthMeters >= 0.35 || segment.bridge) return false;
    if (isFreeformExterior(segment, finalFlood.outside, width, height)) return false;
    const connectedToLongWall = (point: Text4gPixelPoint) => exportFreeformSegments.some(other => {
      if (other === segment) return false;
      const otherLengthMeters = Math.hypot(other.p2.x - other.p1.x, other.p2.y - other.p1.y) * finalUniformScale;
      if (otherLengthMeters < 0.6) return false;
      return Math.min(
        Math.hypot(point.x - other.p1.x, point.y - other.p1.y),
        Math.hypot(point.x - other.p2.x, point.y - other.p2.y),
      ) <= typicalThickness * 1.35;
    });
    return connectedToLongWall(segment.p1) && connectedToLongWall(segment.p2);
  };
  const pointIsHostedByAxisWall = (point: Text4gPixelPoint) => outputWallSegments.some(axisSegment => {
    if (axisSegment.axis === 'horizontal') {
      return Math.abs(point.y - axisSegment.line) <= typicalThickness * 1.45
        && point.x >= axisSegment.start - typicalThickness * 1.45
        && point.x <= axisSegment.end + typicalThickness * 1.45;
    }
    return Math.abs(point.x - axisSegment.line) <= typicalThickness * 1.45
      && point.y >= axisSegment.start - typicalThickness * 1.45
      && point.y <= axisSegment.end + typicalThickness * 1.45;
  });
  const isUnsupportedInteriorAngularBridge = (segment: (typeof cleanedAngularWalls.freeformSegments)[number]) => {
    if (geometryMode === 'orthogonal' || !segment.bridge) return false;
    const lengthMeters = Math.hypot(segment.p2.x - segment.p1.x, segment.p2.y - segment.p1.y) * finalUniformScale;
    if (lengthMeters >= 2.05 || isFreeformExterior(segment, finalFlood.outside, width, height)) return false;
    return pointIsHostedByAxisWall(segment.p1) && pointIsHostedByAxisWall(segment.p2);
  };
  const freeformOnFootprintEdge = (segment: Text4gFreeformWallSegment) => {
    return curveEvidenceMode && segmentOnFootprintEdge(segment, 1.9);
  };
  const freeformWalls: NonNullable<GeneratedData['walls']> = exportFreeformSegments
    .filter(segment => Math.hypot(segment.p2.x - segment.p1.x, segment.p2.y - segment.p1.y) * finalUniformScale > 0.22)
    .filter(segment => !isTinyAngularConnector(segment))
    .filter(segment => !isUnsupportedInteriorAngularBridge(segment))
    .map(segment => {
      const exterior = isFreeformExterior(segment, finalFlood.outside, width, height)
        || freeformOnFootprintEdge(segment);
      return {
        levelIndex: 0,
        p1: mapPoint(segment.p1.x, segment.p1.y),
        p2: mapPoint(segment.p2.x, segment.p2.y),
        type: exterior ? 'exterior' : 'interior',
        provenance: 'observed',
        evidence: {
          source: 'raster',
          confidence: segment.confidence,
          pixelBounds: {
            x0: Math.min(segment.p1.x, segment.p2.x) - segment.thickness / 2,
            y0: Math.min(segment.p1.y, segment.p2.y) - segment.thickness / 2,
            x1: Math.max(segment.p1.x, segment.p2.x) + segment.thickness / 2,
            y1: Math.max(segment.p1.y, segment.p2.y) + segment.thickness / 2,
          },
          notes: [segment.bridge
            ? 'Continuous non-orthogonal host wall restored across an independently retained raster opening.'
            : segment.cleanup
              ? 'Straight angular wall run cleaned from collinear raster chords; only raster-supported junction closure was permitted.'
              : `${geometryMode[0].toUpperCase()}${geometryMode.slice(1)} wall chord retained by the Text 4.0 G geometry detector.`],
        },
      };
    });
  if (curveEvidenceMode && detectedPixelColumns.length) {
    const TAU = Math.PI * 2;
    const directedSpan = (start: number, end: number, counterclockwise: boolean) => {
      let span = counterclockwise ? start - end : end - start;
      while (span < 0) span += TAU;
      while (span >= TAU) span -= TAU;
      return span;
    };
    consolidatedFreeform.arcs.forEach(arc => {
      const radiusX = arc.ellipseRadiusX ?? arc.radius;
      const radiusY = arc.ellipseRadiusY ?? arc.radius;
      const rotation = arc.ellipseRotation || 0;
      const cosR = Math.cos(rotation), sinR = Math.sin(rotation);
      const start = arc.ellipseStartAngle ?? arc.startAngle;
      const end = arc.ellipseEndAngle ?? arc.endAngle;
      const counterclockwise = arc.ellipseCounterclockwise ?? arc.counterclockwise;
      const originalSpan = directedSpan(start, end, counterclockwise);
      const candidates = detectedPixelColumns.flatMap(column => {
        const dx = column.x - arc.center.x, dy = column.y - arc.center.y;
        const localX = dx * cosR + dy * sinR;
        const localY = -dx * sinR + dy * cosR;
        const angle = Math.atan2(localY / Math.max(1e-6, radiusY), localX / Math.max(1e-6, radiusX));
        const residual = Math.abs(Math.hypot(localX / Math.max(1e-6, radiusX), localY / Math.max(1e-6, radiusY)) - 1)
          * Math.min(radiusX, radiusY);
        const point = {
          x: arc.center.x + Math.cos(angle) * radiusX * cosR - Math.sin(angle) * radiusY * sinR,
          y: arc.center.y + Math.cos(angle) * radiusX * sinR + Math.sin(angle) * radiusY * cosR,
        };
        return residual <= typicalThickness * 1.8 ? [{ angle, point, column }] : [];
      });
      const startExtension = candidates.map(candidate => ({
        ...candidate,
        span: directedSpan(candidate.angle, end, counterclockwise),
      })).filter(candidate => candidate.span > originalSpan
        && candidate.span - originalSpan <= 0.34
        && Math.hypot(candidate.point.x - arc.p1.x, candidate.point.y - arc.p1.y) <= typicalThickness * 8)
        .sort((a, b) => a.span - b.span)[0];
      const endExtension = candidates.map(candidate => ({
        ...candidate,
        span: directedSpan(startExtension?.angle ?? start, candidate.angle, counterclockwise),
      })).filter(candidate => candidate.span > (startExtension?.span ?? originalSpan)
        && candidate.span - (startExtension?.span ?? originalSpan) <= 0.34
        && Math.hypot(candidate.point.x - arc.p2.x, candidate.point.y - arc.p2.y) <= typicalThickness * 8)
        .sort((a, b) => a.span - b.span)[0];
      if (startExtension) {
        arc.p1 = startExtension.point;
        arc.startAngle = startExtension.angle;
        if (arc.ellipseStartAngle !== undefined) arc.ellipseStartAngle = startExtension.angle;
      }
      if (endExtension) {
        arc.p2 = endExtension.point;
        arc.endAngle = endExtension.angle;
        if (arc.ellipseEndAngle !== undefined) arc.ellipseEndAngle = endExtension.angle;
      }
      if ((startExtension || endExtension) && arc.ellipseRadiusX === undefined) {
        const span = directedSpan(arc.startAngle, arc.endAngle, arc.counterclockwise);
        const middleAngle = arc.counterclockwise ? arc.startAngle - span / 2 : arc.startAngle + span / 2;
        const middle = {
          x: arc.center.x + Math.cos(middleAngle) * arc.radius,
          y: arc.center.y + Math.sin(middleAngle) * arc.radius,
        };
        arc.controlPoint = {
          x: 2 * middle.x - (arc.p1.x + arc.p2.x) / 2,
          y: 2 * middle.y - (arc.p1.y + arc.p2.y) / 2,
        };
      }
    });
  }
  const nativeCurveFamilySources = (arc: (typeof consolidatedFreeform.arcs)[number]) => {
    const sameFamily = (candidate: (typeof consolidatedFreeform.arcs)[number]) =>
      arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined
      && candidate.ellipseRadiusX !== undefined && candidate.ellipseRadiusY !== undefined
      && Math.hypot(candidate.center.x - arc.center.x, candidate.center.y - arc.center.y) <= typicalThickness * 0.8
      && Math.abs(candidate.ellipseRadiusX - arc.ellipseRadiusX) <= typicalThickness * 1.2
      && Math.abs(candidate.ellipseRadiusY - arc.ellipseRadiusY) <= typicalThickness * 1.2;
    const family = arc.ellipseRadiusX === undefined
      ? [arc]
      : consolidatedFreeform.arcs.filter(sameFamily);
    return Array.from(new Set(family.flatMap(candidate => candidate.sourceIndices)))
      .map(index => curveSourceSegments[index])
      .filter((segment): segment is Text4gFreeformWallSegment => !!segment);
  };
  const nativeCurveHasOpenShellExteriorEvidence = (arc: (typeof consolidatedFreeform.arcs)[number]) => {
    const sources = nativeCurveFamilySources(arc);
    const outsideSourceCount = sources.filter(segment =>
      isFreeformExterior(segment, finalFlood.outside, width, height)).length;
    return text4gOpenShellExteriorCurveFamilyEvidenceForTest(
      arc,
      sources,
      outsideSourceCount,
      width,
      height,
      typicalThickness,
      curveEvidenceMode && nativeCurveMode === 'hybrid' && smoothCurvilinearCandidate,
    );
  };
  const dominantNativeExteriorCurve = consolidatedFreeform.arcs
    .filter(arc => arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined)
    .filter(arc => {
      const sources = nativeCurveFamilySources(arc);
      const exteriorVotes = sources.filter(segment =>
        isFreeformExterior(segment, finalFlood.outside, width, height)
        && segmentOnFootprintEdge(segment, 2.8)).length;
      return exteriorVotes >= Math.max(1, Math.ceil(sources.length * 0.35))
        || nativeCurveHasOpenShellExteriorEvidence(arc);
    })
    .sort((first, second) =>
      second.ellipseRadiusX! * second.ellipseRadiusY! - first.ellipseRadiusX! * first.ellipseRadiusY!)[0];
  const nativeCurveInsideDominant = (arc: (typeof consolidatedFreeform.arcs)[number]) => {
    if (!dominantNativeExteriorCurve || arc === dominantNativeExteriorCurve) return false;
    const sameFamily = arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined
      && Math.hypot(arc.center.x - dominantNativeExteriorCurve.center.x, arc.center.y - dominantNativeExteriorCurve.center.y) <= typicalThickness * 0.8
      && Math.abs(arc.ellipseRadiusX - dominantNativeExteriorCurve.ellipseRadiusX!) <= typicalThickness * 1.2
      && Math.abs(arc.ellipseRadiusY - dominantNativeExteriorCurve.ellipseRadiusY!) <= typicalThickness * 1.2;
    if (sameFamily) return false;
    const middle = { x: (arc.p1.x + arc.p2.x) / 2, y: (arc.p1.y + arc.p2.y) / 2 };
    const rotation = dominantNativeExteriorCurve.ellipseRotation || 0;
    const cosR = Math.cos(rotation), sinR = Math.sin(rotation);
    const radiusX = dominantNativeExteriorCurve.ellipseRadiusX!;
    const radiusY = dominantNativeExteriorCurve.ellipseRadiusY!;
    const margin = typicalThickness * 1.5 / Math.max(1, Math.min(radiusX, radiusY));
    return [arc.p1, middle, arc.p2].every(point => {
      const dx = point.x - dominantNativeExteriorCurve.center.x;
      const dy = point.y - dominantNativeExteriorCurve.center.y;
      const localX = dx * cosR + dy * sinR;
      const localY = -dx * sinR + dy * cosR;
      return Math.hypot(localX / radiusX, localY / radiusY) <= 1 - margin;
    });
  };
  const nativeCurveRole = (arc: (typeof consolidatedFreeform.arcs)[number]): 'exterior' | 'interior' => {
    if (nativeCurveInsideDominant(arc)) return 'interior';
    if (nativeCurveHasOpenShellExteriorEvidence(arc)) return 'exterior';
    const sources = nativeCurveFamilySources(arc);
    const exteriorVotes = sources.filter(segment =>
      isFreeformExterior(segment, finalFlood.outside, width, height)
      && segmentOnFootprintEdge(segment, 2.8)).length;
    return exteriorVotes >= Math.max(1, Math.ceil(sources.length * 0.35)) ? 'exterior' : 'interior';
  };
  const nativeArcWalls: NonNullable<GeneratedData['walls']> = consolidatedFreeform.arcs.map(arc => {
    const sourceSegments = arc.sourceIndices
      .map(index => curveSourceSegments[index])
      .filter((segment): segment is Text4gFreeformWallSegment => !!segment);
    const exteriorVotes = sourceSegments.filter(segment => isFreeformExterior(segment, finalFlood.outside, width, height)).length;
    const mappedP1 = mapPoint(arc.p1.x, arc.p1.y);
    const mappedP2 = mapPoint(arc.p2.x, arc.p2.y);
    const mappedCenter = mapPoint(arc.center.x, arc.center.y);
    const mappedControl = mapPoint(arc.controlPoint.x, arc.controlPoint.y);
    const ellipse = arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined;
    const mappedChordDx = mappedP2[0] - mappedP1[0];
    const mappedChordDy = mappedP2[1] - mappedP1[1];
    const mappedChordLength = Math.hypot(mappedChordDx, mappedChordDy);
    const mappedChordAngle = Math.abs(Math.atan2(mappedChordDy, mappedChordDx) * 180 / Math.PI) % 90;
    const mappedAxisDrift = Math.min(mappedChordAngle, 90 - mappedChordAngle);
    const nearOrthogonalNativeArc = !ellipse
      && mappedChordLength >= 2
      && mappedAxisDrift <= 8;
    const axisSnappedMappedP1 = nearOrthogonalNativeArc
      ? Math.abs(mappedChordDx) <= Math.abs(mappedChordDy)
        ? [(mappedP1[0] + mappedP2[0]) / 2, mappedP1[1]]
        : [mappedP1[0], (mappedP1[1] + mappedP2[1]) / 2]
      : mappedP1;
    const axisSnappedMappedP2 = nearOrthogonalNativeArc
      ? Math.abs(mappedChordDx) <= Math.abs(mappedChordDy)
        ? [(mappedP1[0] + mappedP2[0]) / 2, mappedP2[1]]
        : [mappedP2[0], (mappedP1[1] + mappedP2[1]) / 2]
      : mappedP2;
    const mappedEllipseRadiusX = ellipse ? arc.ellipseRadiusX! * finalScale.x : undefined;
    const mappedEllipseRadiusY = ellipse ? arc.ellipseRadiusY! * finalScale.y : undefined;
    const startAngle = ellipse
      ? -(arc.ellipseStartAngle ?? Math.atan2((mappedP1[1] - mappedCenter[1]) / Math.max(1e-6, mappedEllipseRadiusY!), (mappedP1[0] - mappedCenter[0]) / Math.max(1e-6, mappedEllipseRadiusX!)))
      : Math.atan2(mappedP1[1] - mappedCenter[1], mappedP1[0] - mappedCenter[0]);
    const endAngle = ellipse
      ? -(arc.ellipseEndAngle ?? Math.atan2((mappedP2[1] - mappedCenter[1]) / Math.max(1e-6, mappedEllipseRadiusY!), (mappedP2[0] - mappedCenter[0]) / Math.max(1e-6, mappedEllipseRadiusX!)))
      : Math.atan2(mappedP2[1] - mappedCenter[1], mappedP2[0] - mappedCenter[0]);
    const pixelBounds = sourceSegments.reduce((bounds, segment) => ({
      x0: Math.min(bounds.x0, segment.p1.x, segment.p2.x),
      y0: Math.min(bounds.y0, segment.p1.y, segment.p2.y),
      x1: Math.max(bounds.x1, segment.p1.x, segment.p2.x),
      y1: Math.max(bounds.y1, segment.p1.y, segment.p2.y),
    }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
    const type = nativeCurveMode === 'hybrid'
      ? nativeCurveRole(arc)
      : exteriorVotes >= Math.max(1, Math.ceil(sourceSegments.length / 2)) ? 'exterior' : 'interior';
    if (nearOrthogonalNativeArc) {
      return {
        levelIndex: 0,
        p1: axisSnappedMappedP1,
        p2: axisSnappedMappedP2,
        type,
        wallSource: 'line',
        isCurved: false,
        provenance: 'observed',
        evidence: {
          source: 'raster',
          confidence: arc.confidence,
          pixelBounds,
          notes: [`Near-orthogonal ${geometryMode} wall chord preserved as a straight wall (${Math.round(arc.rasterSupport * 100)}% raster support).`],
        },
      } as any;
    }
    return {
      levelIndex: 0,
      p1: mappedP1,
      p2: mappedP2,
      // Hybrid native curves already passed the consolidator's independent
      // 35% outside-space evidence gate. Requiring the same vote again per
      // split arc incorrectly downgraded aperture-adjacent spans whose source
      // chords were consumed by a neighbouring family run.
      type,
      wallSource: ellipse ? 'ellipse' : 'arc',
      isCurved: true,
      ...(ellipse
        ? {
          ellipseCenter: mappedCenter,
          ellipseRadiusX: mappedEllipseRadiusX,
          ellipseRadiusY: mappedEllipseRadiusY,
          ellipseRotation: arc.ellipseRotation || 0,
          ellipseStartAngle: startAngle,
          ellipseEndAngle: endAngle,
          // mapPoint reflects the raster Y axis into Cartesian plan coordinates.
          ellipseCounterclockwise: arc.ellipseCounterclockwise === undefined
            ? !arc.counterclockwise
            : !arc.ellipseCounterclockwise,
        }
        : {
          controlPoint: mappedControl,
          arcCenter: mappedCenter,
          arcRadius: arc.radius * finalUniformScale,
          arcStartAngle: startAngle,
          arcEndAngle: endAngle,
          // mapPoint reflects the raster Y axis into Cartesian plan coordinates.
          arcCounterclockwise: !arc.counterclockwise,
        }),
      provenance: 'observed',
      evidence: {
        source: 'raster',
        confidence: arc.confidence,
        pixelBounds,
        notes: [`High-confidence ${geometryMode} wall chords consolidated into one editable native ${ellipse ? 'ellipse' : 'arc'} (${Math.round(arc.rasterSupport * 100)}% raster support).`],
      },
    } as any;
  });
  const clippedOrthogonalWalls = curveEvidenceMode && nativeArcWalls.length
    ? orthogonalWalls.map(wall => {
      if (wall.type === 'exterior') return wall;
      const horizontal = Math.abs(wall.p1[1] - wall.p2[1]) <= 1e-6;
      const vertical = Math.abs(wall.p1[0] - wall.p2[0]) <= 1e-6;
      if (!horizontal && !vertical) return wall;
      const snapTolerance = Math.max(0.08, typicalThickness * finalUniformScale * 1.8);
      const directedSpan = (start: number, end: number, counterclockwise: boolean) => {
        let span = counterclockwise ? start - end : end - start;
        while (span < 0) span += Math.PI * 2;
        while (span >= Math.PI * 2) span -= Math.PI * 2;
        return span;
      };
      const intersections = (curve: (typeof nativeArcWalls)[number], point: number[]) => {
        const center = curve.wallSource === 'ellipse' ? curve.ellipseCenter : curve.arcCenter;
        const radiusX = curve.wallSource === 'ellipse' ? curve.ellipseRadiusX : curve.arcRadius;
        const radiusY = curve.wallSource === 'ellipse' ? curve.ellipseRadiusY : curve.arcRadius;
        if (!center || !radiusX || !radiusY) return [] as number[][];
        const rotation = curve.wallSource === 'ellipse' ? curve.ellipseRotation || 0 : 0;
        const cos = Math.cos(rotation), sin = Math.sin(rotation);
        let a = 0, b = 0, c = 0;
        if (horizontal) {
          const dy = point[1] - center[1];
          a = cos * cos / (radiusX * radiusX) + sin * sin / (radiusY * radiusY);
          b = 2 * cos * sin * dy * (1 / (radiusX * radiusX) - 1 / (radiusY * radiusY));
          c = dy * dy * (sin * sin / (radiusX * radiusX) + cos * cos / (radiusY * radiusY)) - 1;
        } else {
          const dx = point[0] - center[0];
          a = sin * sin / (radiusX * radiusX) + cos * cos / (radiusY * radiusY);
          b = 2 * cos * sin * dx * (1 / (radiusX * radiusX) - 1 / (radiusY * radiusY));
          c = dx * dx * (cos * cos / (radiusX * radiusX) + sin * sin / (radiusY * radiusY)) - 1;
        }
        const discriminant = b * b - 4 * a * c;
        if (a <= 1e-9 || discriminant < 0) return [] as number[][];
        const values = [(-b - Math.sqrt(discriminant)) / (2 * a), (-b + Math.sqrt(discriminant)) / (2 * a)];
        return values.map(value => horizontal
          ? [center[0] + value, point[1]]
          : [point[0], center[1] + value]).filter(candidate => {
          const dx = candidate[0] - center[0], dy = candidate[1] - center[1];
          const localX = dx * cos + dy * sin;
          const localY = -dx * sin + dy * cos;
          const angle = Math.atan2(localY / radiusY, localX / radiusX);
          const start = curve.wallSource === 'ellipse' ? curve.ellipseStartAngle : curve.arcStartAngle;
          const end = curve.wallSource === 'ellipse' ? curve.ellipseEndAngle : curve.arcEndAngle;
          const counterclockwise = curve.wallSource === 'ellipse'
            ? !!curve.ellipseCounterclockwise
            : !!curve.arcCounterclockwise;
          if (start === undefined || end === undefined) return false;
          return directedSpan(start, angle, counterclockwise) <= directedSpan(start, end, counterclockwise) + 0.035;
        });
      };
      const snapEndpoint = (point: number[]) => {
        const candidates = nativeArcWalls
          .filter(curve => curve.type === 'exterior')
          .flatMap(curve => intersections(curve, point))
          .map(candidate => ({ candidate, distance: Math.hypot(candidate[0] - point[0], candidate[1] - point[1]) }))
          .filter(candidate => candidate.distance <= snapTolerance)
          .sort((first, second) => first.distance - second.distance);
        return candidates[0]?.candidate || point;
      };
      const p1 = snapEndpoint(wall.p1), p2 = snapEndpoint(wall.p2);
      if (p1 === wall.p1 && p2 === wall.p2) return wall;
      return {
        ...wall,
        p1,
        p2,
        evidence: wall.evidence ? {
          ...wall.evidence,
          notes: [...(wall.evidence.notes || []), 'Interior axis endpoint clipped to its evidenced native exterior curve.'],
        } : wall.evidence,
      };
    })
    : orthogonalWalls;
  const walls: NonNullable<GeneratedData['walls']> = [...clippedOrthogonalWalls, ...freeformWalls, ...nativeArcWalls];
  const gapRecords = architecturalHostedGaps.map(gap => {
    // Keep symbol classification on the original raster interval; trimming
    // first would move the sampled hinge/arc endpoints and could suppress a
    // correct recovered door. Only final geometry uses the physical faces.
    const outputGap = clampText4gRecoveredSwingGapToJambFacesForTest(
      gap,
      outputWallSegments,
      freeformSegments,
      typicalThickness,
    );
    const midpoint = (gap.start + gap.end) / 2;
    const envelopeExtreme = gap.axis === 'horizontal'
      ? Math.abs(gap.line - frameAxisBounds.minY) <= typicalThickness * 1.5 || Math.abs(gap.line - frameAxisBounds.maxY) <= typicalThickness * 1.5
      : Math.abs(gap.line - frameAxisBounds.minX) <= typicalThickness * 1.5 || Math.abs(gap.line - frameAxisBounds.maxX) <= typicalThickness * 1.5;
    // Flood-fill can leak through a real facade opening and then incorrectly
    // mark an internal partition as exterior. Geometric envelope membership
    // remains stable for windows, balcony facades, and stepped footprints.
    const exterior = !componentSheetMode
      && (envelopeExtreme || isGapOnFootprintEdge(gap, footprintPixels, typicalThickness * 1.8));
    const symbolEvidence = detectGapSymbolEvidence(
      gap, darkMask, originalDarkMask, width, height, textObservations, typicalThickness,
      doorEvidenceMask, originalDoorEvidenceMask,
      geometryMode !== 'orthogonal',
    );
    // Hybrid plans keep the proven orthogonal classifier above. Faint symbol
    // ink gets one additional read only when a matching swing arc validates
    // the leaf. Two thin strokes alone are not a door signature.
    const faintHybridSwing = geometryMode === 'hybrid' && !symbolEvidence.doorSwing.detected
      ? detectDoorSwing(gap, originalDoorEvidenceMask, width, height, 2, 0.45)
      : undefined;
    const faintCurvilinearArc = curveEvidenceMode && faintHybridSwing?.endpointCount === 1
      ? detectDoorSwingArc(gap, originalDoorEvidenceMask, width, height, {
        endpoint: faintHybridSwing.isFlipped ? 'end' : 'start',
        hingeOffset: faintHybridSwing.hingeOffset || 0,
      })
      : undefined;
    const faintCurvilinearSingle = curveEvidenceMode
      && faintHybridSwing?.endpointCount === 1
      && gap.end - gap.start <= typicalThickness * 5.5
      && Math.abs(faintHybridSwing.hingeOffset || 0) <= Math.max(2, gap.thickness * 1.25)
      && faintCurvilinearArc?.detected
      && faintCurvilinearArc.isFlipped === faintHybridSwing.isFlipped
      && faintCurvilinearArc.facingFlipped === faintHybridSwing.facingFlipped
      ? {
        ...faintHybridSwing,
        arcConfirmed: true,
        confidence: Math.min(0.84, faintHybridSwing.confidence, faintCurvilinearArc.confidence),
      }
      : undefined;
    const faintHybridDoubleStartArc = geometryMode === 'hybrid' && faintHybridSwing?.endpointCount === 2
      ? detectDoorSwingArc(
        gap,
        originalDoorEvidenceMask,
        width,
        height,
        { endpoint: 'start', hingeOffset: 0 },
        [0.38, 0.48, 0.55],
      )
      : undefined;
    const faintHybridDoubleEndArc = geometryMode === 'hybrid' && faintHybridSwing?.endpointCount === 2
      ? detectDoorSwingArc(
        gap,
        originalDoorEvidenceMask,
        width,
        height,
        { endpoint: 'end', hingeOffset: 0 },
        [0.38, 0.48, 0.55],
      )
      : undefined;
    const faintHybridDouble = faintHybridSwing?.endpointCount === 2
      && faintHybridDoubleStartArc?.detected
      && faintHybridDoubleEndArc?.detected
      && faintHybridDoubleStartArc.facingFlipped === faintHybridDoubleEndArc.facingFlipped
      ? {
        ...faintHybridSwing,
        arcEvidence: true,
        arcConfirmed: true,
        doubleArcConfirmed: true,
        confidence: Math.min(
          0.88,
          faintHybridSwing.confidence,
          faintHybridDoubleStartArc.confidence,
          faintHybridDoubleEndArc.confidence,
        ),
      }
      : undefined;
    const baseDoorSwing = faintCurvilinearSingle || faintHybridDouble || symbolEvidence.doorSwing;
    const hostedCorroboratedSwing = !exterior
      && baseDoorSwing.detected
      && !baseDoorSwing.arcConfirmed
      && symbolEvidence.hostedArcRecovery.detected
      && symbolEvidence.hostedArcRecovery.arcConfirmed
      ? {
        ...baseDoorSwing,
        isFlipped: symbolEvidence.hostedArcRecovery.isFlipped,
        facingFlipped: symbolEvidence.hostedArcRecovery.facingFlipped,
        confidence: Math.max(baseDoorSwing.confidence, symbolEvidence.hostedArcRecovery.confidence),
        arcEvidence: true,
        arcConfirmed: true,
      }
      : undefined;
    const doorSwing = hostedCorroboratedSwing || baseDoorSwing;
    const faintHybridWindowFrame = geometryMode === 'hybrid'
      && !symbolEvidence.windowFrame
      && parallelWindowFrameBandCount(gap, originalDoorEvidenceMask, width, height) >= 3;
    const faintHybridSliding = geometryMode === 'hybrid'
      && !symbolEvidence.slidingEvidence.detected
      && !symbolEvidence.windowFrame
      && !faintHybridWindowFrame
      ? detectSlidingDoorPanels(gap, originalDoorEvidenceMask, width, height)
      : undefined;
    const foldingEvidence = symbolEvidence.foldingEvidence;
    // A faint exterior window can produce a false arc-only swing because its
    // glazing bars are sampled as a quarter-circle. Recover the frame at a
    // slightly lower support threshold only for that ambiguous combination;
    // a real leaf-plus-arc door remains authoritative.
    const arcOnlyWindowFrame = doorSwing.arcOnly
      && Math.max(
        parallelWindowFrameSupport(gap, darkMask, width, height),
        parallelWindowFrameSupport(gap, originalDoorEvidenceMask, width, height),
      ) >= 0.25;
    const windowFrame = gap.missingHostFallback === 'window'
      || symbolEvidence.windowFrame || faintHybridWindowFrame || arcOnlyWindowFrame;
    const windowFrameSupport = faintHybridWindowFrame
      ? Math.max(0.86, symbolEvidence.windowFrameSupport)
      : symbolEvidence.windowFrameSupport;
    const rawWidthMeters = (gap.end - gap.start)
      * (gap.axis === 'horizontal' ? finalScale.x : finalScale.y);
    const wallBandInk = wallBandInkRatio(gap, originalDarkMask, width, height, typicalThickness);
    const touchesTransverseEnvelopeJamb = gap.axis === 'horizontal'
      ? Math.abs(gap.start - frameAxisBounds.minX) <= typicalThickness * 1.5
        || Math.abs(gap.end - frameAxisBounds.maxX) <= typicalThickness * 1.5
      : Math.abs(gap.start - frameAxisBounds.minY) <= typicalThickness * 1.5
        || Math.abs(gap.end - frameAxisBounds.maxY) <= typicalThickness * 1.5;
    const axisGapEvidence = curveEvidenceMode
      ? inspectText4gFreeformGap({
        p1: gap.axis === 'horizontal' ? { x: gap.start, y: gap.line } : { x: gap.line, y: gap.start },
        p2: gap.axis === 'horizontal' ? { x: gap.end, y: gap.line } : { x: gap.line, y: gap.end },
        thickness: gap.thickness,
        confidence: 0.8,
      }, originalDarkMask, originalDoorEvidenceMask, width, height)
      : undefined;
    const curvilinearAxisSliding = curveEvidenceMode
      && !windowFrame
      && rawWidthMeters >= 1.2
      && rawWidthMeters <= 2.05
      && (axisGapEvidence?.parallelSupport || 0) >= 0.15
      && (axisGapEvidence?.parallelSupport || 0) < 0.55
      && (axisGapEvidence?.doorLeafSupport || 0) < 0.2;
    const slidingEvidence = gap.missingHostFallback === 'sliding'
      ? {
        ...symbolEvidence.slidingEvidence,
        detected: true,
        confidence: Math.max(0.8, symbolEvidence.slidingEvidence.confidence),
      }
      : faintHybridSliding?.detected
      ? { ...faintHybridSliding, confidence: Math.min(0.86, faintHybridSliding.confidence) }
      : curvilinearAxisSliding
        ? { ...symbolEvidence.slidingEvidence, detected: true, confidence: 0.78 }
        : symbolEvidence.slidingEvidence;
    // A folding leaf is a distinct chevron in an otherwise open wall gap. A
    // parallel frame is authoritative window evidence and must win over an
    // accidental V formed by glazing bars, fixtures, or nearby text.
    const foldingDoor = foldingEvidence.detected
      && (!windowFrame || (windowFrameSupport < 0.8 && foldingEvidence.confidence >= 0.9))
      && rawWidthMeters <= 2.4;
    // At an interior wall's exterior-frame junction, dense fixture/corner
    // ink can simultaneously imitate an arc, a chevron, and parallel glazing.
    // Those mutually incompatible readings are not a door symbol. Suppress
    // only this near-solid, arc-only corner conflict; leaf-backed doors and
    // ordinary framed openings retain their established classifiers.
    const ambiguousCornerFixture = !envelopeExtreme
      && touchesTransverseEnvelopeJamb
      && doorSwing.arcOnly
      && windowFrame
      && foldingEvidence.detected
      && wallBandInk >= 0.55;
    // A fixture curve can resemble a quarter-circle swing beside a double-line
    // partition. If both heavy structural wall faces remain uninterrupted
    // across the candidate, there is physically no aperture to host a door.
    // This is stricter than ordinary window-frame detection: thin glazing
    // bands and one near-closed door leaf do not satisfy the two-wall test.
    const intactDoubleLineWall = doorSwing.arcOnly
      && windowFrame
      && hasTwoContinuousStructuralWallBands(
        gap,
        originalDarkMask,
        width,
        height,
        typicalThickness,
      );
    // Dense cabinet/fixture outlines can present both a perfect parallel frame
    // and a chevron on an interior wall even though no aperture exists. Those
    // mutually incompatible symbols are rejected only when there is no swing
    // leaf/arc and substantial wall-band ink remains. Exterior windows and
    // ordinary interior glazing do not enter this conflict path.
    const ambiguousInteriorFrameFixture = !exterior
      && !doorSwing.detected
      && windowFrame
      && foldingEvidence.detected
      && wallBandInk >= 0.4;
    const slidingDoor = slidingEvidence.detected
      && !foldingDoor
      && rawWidthMeters >= 0.8
      && rawWidthMeters <= 3.2;
    const swingDoorWidthLimit = doorSwing.endpointCount >= 2
      ? 2.4
      : doorSwing.arcConfirmed ? 2 : 1.4;
    // Arc-only swing evidence is intentionally weaker than an explicit
    // window frame. If both signatures occupy the same gap, preserve the
    // window; a leaf-plus-arc or multi-leaf swing still remains a door.
    // Single/double swing doors require the distinctive swing arc. A leaf
    // alone can resemble a thin wall and is therefore not enough. Arc-only
    // recovery remains valid when no window frame is evidenced; the
    // window-frame priority above prevents glazing bars from being promoted.
    const clearSwingSymbol = doorSwing.arcOnly
      || doorSwing.arcConfirmed
      || doorSwing.arcEvidence
      || doorSwing.offsetHinge
      || doorSwing.closedLeaf;
    const doorStroke = doorSwing.detected
      && rawWidthMeters <= swingDoorWidthLimit
      && clearSwingSymbol
      // A validated continuous hosted arc is the authoritative door glyph,
      // even when the wall gap also resembles a narrow glazing frame.
      && (!windowFrame || (doorSwing.endpointCount >= 2
        ? doorSwing.doubleArcConfirmed
        : doorSwing.arcConfirmed));
    // Band merging stops framed openings a few raster pixels inside the actual
    // jamb faces. Restore that symmetric frame inset only when a door/window
    // symbol is visibly present; bare wall openings already span face to face.
    const framedInsetPixels = resolveText4gFramedInsetPixelsForTest(
      outputGap,
      doorStroke || slidingDoor || foldingDoor || windowFrame,
      typicalThickness,
    );
    const outputMidpoint = (outputGap.start + outputGap.end) / 2;
    const widthMeters = (outputGap.end - outputGap.start + framedInsetPixels)
      * (gap.axis === 'horizontal' ? finalScale.x : finalScale.y);
    const position = gap.axis === 'horizontal'
      ? mapPoint(outputMidpoint, gap.line)
      : mapPoint(gap.line, outputMidpoint);
    const intactThinWallSupport = smoothCurvilinearCandidate
      ? gap.axis === 'horizontal'
        ? lineDarkSupport(originalDarkMask, width, height, { x: gap.start, y: gap.line }, { x: gap.end, y: gap.line }, 1)
        : lineDarkSupport(originalDarkMask, width, height, { x: gap.line, y: gap.start }, { x: gap.line, y: gap.end }, 1)
      : 0;
    return {
      gap: outputGap,
      rasterGap: gap,
      exterior,
      doorSwing,
      hostedArcRecovery: symbolEvidence.hostedArcRecovery,
      doorStroke,
      slidingDoor,
      curvilinearAxisSliding,
      slidingEvidence,
      foldingDoor,
      foldingEvidence,
      windowFrame,
      // OCR/topology-proven open-plan passages may contain furniture strokes
      // that resemble an incomplete leaf. That weak negative signal must not
      // suppress the explicitly evidenced passage.
      rejectedDoorSymbol: doorSwing.detected && !doorStroke && !gap.openPassageEvidence,
      widthMeters,
      position,
      intactThinWall: intactThinWallSupport >= 0.72,
      ambiguousCornerFixture,
      intactDoubleLineWall,
      ambiguousInteriorFrameFixture,
      rotation: gap.axis === 'horizontal' ? 0 : 90,
    };
  }).filter(record => !record.intactThinWall
    && !record.ambiguousCornerFixture
    && !record.intactDoubleLineWall
    && !record.ambiguousInteriorFrameFixture
    && record.widthMeters >= 0.45 && record.widthMeters <= 4.5);

  const doors: NonNullable<GeneratedData['doors']> = [];
  const windows: NonNullable<GeneratedData['windows']> = [];
  const openings: NonNullable<GeneratedData['openings']> = [];
  const curveLinearLeafDoors = new Set<NonNullable<GeneratedData['doors']>[number]>();
  const exteriorRecords = gapRecords.filter(record => record.exterior);
  const explicitExteriorDoors = exteriorRecords.filter(record =>
    record.foldingDoor || (record.slidingDoor && !record.windowFrame) || (record.doorStroke && !record.windowFrame));
  const entryTag = roomTextTags.find(tag => /foyer|entry|entrance|reception/i.test(tag.label));
  const pixelDistanceToEntry = (record: (typeof gapRecords)[number]) => {
    if (!entryTag) return 0;
    const midpoint = (record.gap.start + record.gap.end) / 2;
    const x = record.gap.axis === 'horizontal' ? midpoint : record.gap.line;
    const y = record.gap.axis === 'horizontal' ? record.gap.line : midpoint;
    return Math.hypot(x - entryTag.x, y - entryTag.y);
  };
  const entryFallbackRecords = exteriorRecords.filter(record =>
    !record.windowFrame && record.widthMeters >= 0.55 && record.widthMeters <= 1.4);
  const entryDoorSizedFallbackRecords = roomTextTags.length
    ? exteriorRecords.filter(record => record.widthMeters >= 0.55 && record.widthMeters <= 1.4)
    : [];
  const entryRecord = [...(explicitExteriorDoors.length
    ? explicitExteriorDoors
    : entryFallbackRecords.length ? entryFallbackRecords : entryDoorSizedFallbackRecords)]
    .sort((a, b) => {
      if (entryTag) return pixelDistanceToEntry(a) - pixelDistanceToEntry(b);
      if (a.doorSwing.endpointCount !== b.doorSwing.endpointCount) {
        return b.doorSwing.endpointCount - a.doorSwing.endpointCount;
      }
      if (a.doorStroke !== b.doorStroke) return Number(b.doorStroke) - Number(a.doorStroke);
      const aDoorWidth = Math.abs(a.widthMeters - 0.9), bDoorWidth = Math.abs(b.widthMeters - 0.9);
      return aDoorWidth - bDoorWidth || b.gap.line - a.gap.line;
    })[0];

  const resolveDoorType = (
    record: (typeof gapRecords)[number],
    effectiveSlidingDoor: boolean,
  ): 'single' | 'double' | 'folding' | 'sliding' => {
    if (record.foldingDoor) return 'folding';
    if (effectiveSlidingDoor) return 'sliding';
    const widthMeters = record.widthMeters;
    const hasDoubleArc = !!record.doorSwing.doubleArcConfirmed;
    const hasSingleArc = !!record.doorSwing.arcConfirmed;
    if (hasDoubleArc && widthMeters <= 2.135) return 'double';
    if (hasSingleArc && widthMeters <= 1.372) return 'single';
    if (widthMeters > 1.372 && widthMeters <= 2.4 && !record.windowFrame) return 'sliding';
    if (hasDoubleArc) return 'sliding';
    if (!hasSingleArc && !record.windowFrame) return 'sliding';
    if (widthMeters > 1.372) return 'sliding';
    return 'single';
  };

  const swingQuadrant = (record: (typeof gapRecords)[number]) =>
    text4gSwingQuadrantForTest(
      record.gap.axis,
      record.doorSwing.isFlipped,
      record.doorSwing.facingFlipped,
    );

  for (const record of gapRecords) {
    const sharesPerpendicularSwingJunction = (candidate: (typeof gapRecords)[number]) => {
      if (candidate === record || candidate.gap.axis === record.gap.axis) return false;
      // Duplicate interpretation is an evidence question, so compare the
      // original raster intervals. Face-clamped output geometry must not turn
      // two legitimate corner-sharing doors into apparent duplicates.
      const recordGap = record.rasterGap;
      const candidateGap = candidate.rasterGap;
      const intersectionAlongRecord = candidateGap.line;
      const intersectionAlongCandidate = recordGap.line;
      const recordEndpointDistance = Math.min(
        Math.abs(intersectionAlongRecord - recordGap.start),
        Math.abs(intersectionAlongRecord - recordGap.end),
      );
      const candidateEndpointDistance = Math.min(
        Math.abs(intersectionAlongCandidate - candidateGap.start),
        Math.abs(intersectionAlongCandidate - candidateGap.end),
      );
      const tolerance = Math.max(
        typicalThickness * 1.75,
        record.gap.thickness * 1.5,
        candidate.gap.thickness * 1.5,
      );
      return recordEndpointDistance <= tolerance && candidateEndpointDistance <= tolerance;
    };
    const duplicatePerpendicularClosedSwing = record.doorSwing.closedLeaf && gapRecords.some(candidate => {
      if (candidate === record
        || candidate.gap.axis === record.gap.axis
        || candidate.doorSwing.closedLeaf
        || !(candidate.doorStroke || candidate.foldingDoor || candidate.slidingDoor)) return false;
      return sharesPerpendicularSwingJunction(candidate);
    });
    const duplicatePerpendicularArcOnlySwing = record.doorSwing.arcOnly && gapRecords.some(candidate => {
      if (candidate === record
        || candidate.gap.axis === record.gap.axis
        || candidate.doorSwing.arcOnly
        || !candidate.doorStroke
        || !sharesPerpendicularSwingJunction(candidate)) return false;
      const recordQuadrant = swingQuadrant(record);
      const candidateQuadrant = swingQuadrant(candidate);
      return recordQuadrant.x === candidateQuadrant.x
        && recordQuadrant.y === candidateQuadrant.y;
    });
    // A swing at one raster junction can be rediscovered from its true wall
    // gap and from the perpendicular jamb/return that resembles a closed
    // leaf. Only a closed-leaf reinterpretation is suppressed; two ordinary
    // perpendicular swings may legitimately share one corner jamb.
    if (duplicatePerpendicularClosedSwing || duplicatePerpendicularArcOnlySwing) continue;
    const gapPixelBounds = record.gap.axis === 'horizontal'
      ? { x0: record.gap.start, y0: record.gap.line - record.gap.thickness / 2, x1: record.gap.end, y1: record.gap.line + record.gap.thickness / 2 }
      : { x0: record.gap.line - record.gap.thickness / 2, y0: record.gap.start, x1: record.gap.line + record.gap.thickness / 2, y1: record.gap.end };
    const gapMidpoint = (record.gap.start + record.gap.end) / 2;
    const gapX = record.gap.axis === 'horizontal' ? gapMidpoint : record.gap.line;
    const gapY = record.gap.axis === 'horizontal' ? record.gap.line : gapMidpoint;
    const nearBalconyLabel = roomTextTags.some(tag => /balcony|terrace|loggia|deck/i.test(tag.label)
      && Math.hypot(tag.x - gapX, tag.y - gapY) <= Math.max(width, height) * 0.22);
    const sameHostSwing = !componentSheetMode && nearBalconyLabel && record.slidingDoor && gapRecords.some(candidate => candidate !== record
      && candidate.doorStroke
      && candidate.gap.axis === record.gap.axis
      && Math.abs(candidate.gap.line - record.gap.line) <= typicalThickness * 1.2);
    const effectiveSlidingDoor = record.slidingDoor && !sameHostSwing;
    const unsupportedHybridInteriorLeafDoor = geometryMode === 'hybrid'
      && !record.exterior
      && record.doorStroke
      && !record.windowFrame
      && !record.foldingDoor
      && !effectiveSlidingDoor
      && record.doorSwing.endpointCount < 2
      && !record.doorSwing.arcOnly
      && !record.doorSwing.arcConfirmed
      && !record.doorSwing.offsetHinge
      && !record.doorSwing.closedLeaf;
    if (unsupportedHybridInteriorLeafDoor) continue;
    // A wide exterior dropout without a frame, leaf, swing, or parallel-panel
    // signature is missing wall evidence, not a large window. The continuous
    // host was already reconstructed above; suppress only the unsupported
    // hybrid fallback element so the wall remains visible and editable.
    const unsupportedWideHybridExteriorGap = geometryMode === 'hybrid'
      && record.exterior
      && record.widthMeters > 1.45
      && !record.windowFrame
      && !record.foldingDoor
      && !record.slidingDoor
      && !record.doorStroke;
    if (unsupportedWideHybridExteriorGap) continue;
    if (record.rejectedDoorSymbol && record !== entryRecord
      && !record.windowFrame && !record.foldingDoor && !record.slidingDoor) continue;
    if (record.exterior) {
      // Entry selection may still identify a useful exterior gap for
      // diagnostics, but it must never manufacture a door without a visible
      // door symbol.  Windows and unclassified openings stay in their own
      // evidence-led branches.
      const hasClearDoorSymbol = record.foldingDoor || effectiveSlidingDoor || record.doorStroke;
      const isDoor = hasClearDoorSymbol;
      if (isDoor) {
        const doorType = resolveDoorType(record, effectiveSlidingDoor);
        const parallelEvidence = record.foldingDoor ? record.foldingEvidence : record.slidingEvidence;
        const facingFlipped = record.foldingDoor || record.slidingDoor
          ? record.gap.axis === 'horizontal' ? parallelEvidence.normalDirection < 0 : parallelEvidence.normalDirection > 0
          : record.doorSwing.facingFlipped;
        const exportedWidth = clamp(
          record.widthMeters,
          doorType === 'single' ? 0.6 : 0.7,
          geometryMode === 'hybrid'
            ? doorType === 'single' ? 1.0 : 1.55
            : doorType === 'single' ? 1.372 : 2.4,
        );
        doors.push({
          levelIndex: 0,
          pos: record.position,
          rotation: record.rotation,
          width: exportedWidth,
          type: doorType,
          isFlipped: record.doorSwing.isFlipped,
          facingFlipped,
          mandatoryExteriorEntry: record === entryRecord,
          measuredWidth: geometryMode === 'hybrid' ? exportedWidth : record.widthMeters,
          provenance: 'observed',
          evidence: {
            source: 'raster', confidence: record.foldingDoor || record.slidingDoor ? parallelEvidence.confidence : record.doorSwing.confidence || 0.55, pixelBounds: gapPixelBounds,
            ...(record.doorSwing.offsetHinge
              ? { notes: ['Door swing recovered from matching offset hinge leaf and quarter-circle arc evidence.'] }
              : record.doorSwing.closedLeaf
              ? { notes: ['Door swing recovered from matching near-closed leaf and quarter-circle arc evidence.'] }
              : record.doorSwing.arcOnly
              ? { notes: ['Door swing recovered from a jamb-centred quarter-circle arc.'] }
              : !record.doorStroke ? { notes: ['Exterior entry classification inferred from an unframed wall gap.'] } : {}),
          },
        });
      } else if (record.windowFrame) {
        windows.push({
          levelIndex: 0, pos: record.position, rotation: record.rotation, width: record.widthMeters,
          type: 'standard', measuredWidth: record.widthMeters,
          provenance: 'observed',
          evidence: { source: 'raster', confidence: 0.84, pixelBounds: gapPixelBounds },
        });
      }
    } else if (!record.foldingDoor && !effectiveSlidingDoor && !record.doorStroke
      && (record.windowFrame || sameHostSwing)) {
      windows.push({
        levelIndex: 0, pos: record.position, rotation: record.rotation, width: record.widthMeters,
        type: 'standard', measuredWidth: record.widthMeters,
        provenance: 'observed',
        evidence: { source: 'raster', confidence: 0.82, pixelBounds: gapPixelBounds },
      });
    } else if (!record.foldingDoor && !effectiveSlidingDoor && !record.doorStroke) {
      openings.push({
        levelIndex: 0, pos: record.position, rotation: record.rotation, width: record.widthMeters,
        measuredWidth: record.widthMeters, provenance: 'observed',
        evidence: { source: 'raster', confidence: 0.62, pixelBounds: gapPixelBounds },
      });
    } else {
      const doorType = resolveDoorType(record, effectiveSlidingDoor);
      const parallelEvidence = record.foldingDoor ? record.foldingEvidence : record.slidingEvidence;
      const facingFlipped = record.foldingDoor || record.slidingDoor
        ? record.gap.axis === 'horizontal' ? parallelEvidence.normalDirection < 0 : parallelEvidence.normalDirection > 0
        : record.doorSwing.facingFlipped;
      const exportedWidth = clamp(
        record.widthMeters,
        doorType === 'single' ? 0.6 : 0.7,
        geometryMode === 'hybrid' ? doorType === 'single' ? 1.0 : 1.55 : doorType === 'single' ? 1.372 : 2.4,
      );
      doors.push({
        levelIndex: 0, pos: record.position, rotation: record.rotation,
        width: exportedWidth,
        type: doorType,
        isFlipped: record.doorSwing.isFlipped,
        facingFlipped,
        measuredWidth: geometryMode === 'hybrid' ? exportedWidth : record.widthMeters,
        provenance: 'observed',
        evidence: {
          source: 'raster', confidence: record.foldingDoor || record.slidingDoor ? parallelEvidence.confidence : record.doorSwing.confidence || 0.5,
          pixelBounds: gapPixelBounds,
          ...(record.doorSwing.offsetHinge
            ? { notes: ['Door swing recovered from matching offset hinge leaf and quarter-circle arc evidence.'] }
            : record.doorSwing.closedLeaf
              ? { notes: ['Door swing recovered from matching near-closed leaf and quarter-circle arc evidence.'] }
            : record.doorSwing.arcOnly
              ? { notes: ['Door swing recovered from a jamb-centred quarter-circle arc.'] }
              : {}),
        },
      });
    }
  }

  // Adjacent scan bands can occasionally describe the same swing leaf twice.
  // Keep one evidenced hosted door whenever their physical clear widths
  // overlap on the same wall axis; genuinely adjacent doors remain untouched.
  const rankedDoors = [...doors].sort((a, b) =>
    (b.evidence?.confidence || 0) - (a.evidence?.confidence || 0)
    || Math.abs((a.measuredWidth || a.width) - 0.9) - Math.abs((b.measuredWidth || b.width) - 0.9));
  const uniqueDoors: typeof doors = [];
  rankedDoors.forEach(door => {
    const horizontal = Math.abs((door.rotation || 0) % 180) < 45;
    const duplicate = uniqueDoors.some(existing => {
      const existingHorizontal = Math.abs((existing.rotation || 0) % 180) < 45;
      if (horizontal !== existingHorizontal) return false;
      const normalDistance = horizontal
        ? Math.abs(existing.pos[1] - door.pos[1])
        : Math.abs(existing.pos[0] - door.pos[0]);
      if (normalDistance > 0.08) return false;
      const alongDistance = horizontal
        ? Math.abs(existing.pos[0] - door.pos[0])
        : Math.abs(existing.pos[1] - door.pos[1]);
      const overlap = ((existing.width || 0.9) + (door.width || 0.9)) / 2 - alongDistance;
      return overlap > 0.04;
    });
    if (!duplicate) uniqueDoors.push(door);
  });
  doors.splice(0, doors.length, ...uniqueDoors);

  // Non-axis gaps rejoin the same native door/window/opening collections after
  // the proven orthogonal classifier has completed. This keeps the old route
  // byte-for-byte inactive for ordinary plans while allowing an angled or
  // locally curved host chord to carry the same architectural element types.
  const hasMandatoryEntry = () => doors.some(door => door.mandatoryExteriorEntry);
  const curveDirectedSpan = (start: number, end: number, counterclockwise: boolean) => {
    const TAU = Math.PI * 2;
    let span = counterclockwise ? start - end : end - start;
    while (span < 0) span += TAU;
    while (span >= TAU) span -= TAU;
    return span;
  };
  const curveFrameBandsAt = (
    arc: (typeof consolidatedFreeform.arcs)[number],
    angle: number,
  ) => {
    const radiusX = arc.ellipseRadiusX ?? arc.radius;
    const radiusY = arc.ellipseRadiusY ?? arc.radius;
    const rotation = arc.ellipseRotation || 0;
    const cosR = Math.cos(rotation), sinR = Math.sin(rotation);
    const localPoint = { x: Math.cos(angle) * radiusX, y: Math.sin(angle) * radiusY };
    const center = {
      x: arc.center.x + localPoint.x * cosR - localPoint.y * sinR,
      y: arc.center.y + localPoint.x * sinR + localPoint.y * cosR,
    };
    const localTangent = { x: -Math.sin(angle) * radiusX, y: Math.cos(angle) * radiusY };
    const rotatedTangent = {
      x: localTangent.x * cosR - localTangent.y * sinR,
      y: localTangent.x * sinR + localTangent.y * cosR,
    };
    const tangentLength = Math.max(1e-6, Math.hypot(rotatedTangent.x, rotatedTangent.y));
    const tangent = { x: rotatedTangent.x / tangentLength, y: rotatedTangent.y / tangentLength };
    const normal = { x: -tangent.y, y: tangent.x };
    const sampleLength = Math.max(18, typicalThickness * 3.2);
    const first = {
      x: center.x - tangent.x * sampleLength / 2,
      y: center.y - tangent.y * sampleLength / 2,
    };
    const second = {
      x: center.x + tangent.x * sampleLength / 2,
      y: center.y + tangent.y * sampleLength / 2,
    };
    const supportedOffsets: number[] = [];
    const normalReach = Math.max(3, Math.ceil(typicalThickness * 1.55));
    for (let offset = -normalReach; offset <= normalReach; offset++) {
      const support = lineDarkSupport(
        originalDoorEvidenceMask,
        width,
        height,
        { x: first.x + normal.x * offset, y: first.y + normal.y * offset },
        { x: second.x + normal.x * offset, y: second.y + normal.y * offset },
        1,
      );
      if (support >= 0.78) supportedOffsets.push(offset);
    }
    let bandCount = 0, widestBand = 0;
    for (let index = 0; index < supportedOffsets.length;) {
      let end = index;
      while (end + 1 < supportedOffsets.length && supportedOffsets[end + 1] === supportedOffsets[end] + 1) end++;
      const bandWidth = end - index + 1;
      bandCount++;
      widestBand = Math.max(widestBand, bandWidth);
      index = end + 1;
    }
    return {
      center,
      separatedThinBands: bandCount >= 2
        && widestBand <= Math.max(4, Math.ceil(typicalThickness * 0.38)),
    };
  };
  freeformGaps.forEach((gap: Text4gFreeformWallGap) => {
    const pixelLength = Math.hypot(gap.p2.x - gap.p1.x, gap.p2.y - gap.p1.y);
    const widthMeters = pixelLength * finalUniformScale;
    if (widthMeters < 0.45 || widthMeters > 4.5) return;
    const midpoint = { x: (gap.p1.x + gap.p2.x) / 2, y: (gap.p1.y + gap.p2.y) / 2 };
    const curveHost = curveEvidenceMode ? consolidatedFreeform.arcs.map(arc => {
      const radiusX = arc.ellipseRadiusX ?? arc.radius;
      const radiusY = arc.ellipseRadiusY ?? arc.radius;
      const endpointResiduals = [gap.p1, gap.p2].map(point =>
        Math.abs(Math.hypot((point.x - arc.center.x) / Math.max(1e-6, radiusX), (point.y - arc.center.y) / Math.max(1e-6, radiusY)) - 1)
          * Math.min(radiusX, radiusY));
      const endpointResidual = (endpointResiduals[0] + endpointResiduals[1]) / 2;
      const angle = Math.atan2((midpoint.y - arc.center.y) / Math.max(1e-6, radiusY), (midpoint.x - arc.center.x) / Math.max(1e-6, radiusX));
      const start = arc.ellipseStartAngle ?? arc.startAngle;
      const end = arc.ellipseEndAngle ?? arc.endAngle;
      const counterclockwise = arc.ellipseCounterclockwise ?? arc.counterclockwise;
      const within = curveDirectedSpan(start, angle, counterclockwise)
        <= curveDirectedSpan(start, end, counterclockwise) + 0.14;
      return {
        arc, angle, endpointResidual, maximumEndpointResidual: Math.max(...endpointResiduals),
        within,
        point: { x: arc.center.x + Math.cos(angle) * radiusX, y: arc.center.y + Math.sin(angle) * radiusY },
        tangent: { x: -Math.sin(angle) * radiusX, y: Math.cos(angle) * radiusY },
        separatedThinBands: curveFrameBandsAt(arc, angle).separatedThinBands,
      };
    }).filter(candidate => candidate.within
      && candidate.maximumEndpointResidual <= Math.max(4, typicalThickness * 2.15))
      .sort((a, b) => a.endpointResidual - b.endpointResidual)[0] : undefined;
    const hostedMidpoint = curveHost?.point ?? midpoint;
    const position = mapPoint(hostedMidpoint.x, hostedMidpoint.y);
    const evidence = inspectText4gFreeformGap(
      gap,
      originalDarkMask,
      originalDoorEvidenceMask,
      width,
      height,
    );
    const recoveredFaintAngularWindow = faintAngularWindowGaps.has(gap);
    const exterior = isFreeformExterior(gap, finalFlood.outside, width, height);
    const entryDistance = entryTag ? Math.hypot(entryTag.x - midpoint.x, entryTag.y - midpoint.y) : Infinity;
    const nearEntryTag = entryDistance <= Math.max(typicalThickness * 8, pixelLength * 1.4);
    const doorSized = widthMeters >= 0.55 && widthMeters <= 1.45;
    const freeformDoorSized = widthMeters >= 0.55 && widthMeters <= 2.1;
    const unlabeledAngularFreeform = geometryMode !== 'orthogonal' && roomTextTags.length === 0;
    const windowLikeFreeform = unlabeledAngularFreeform
      && (evidence.parallelSupport || 0) >= 0.75
      && (evidence.arcSupport || 0) < 0.45
      && (evidence.doorLeafSupport || 0) < 0.8
      && (evidence.foldingSupport || 0) < 0.72
      && (evidence.slidingSupport || 0) < 0.68;
    // A curved window is drawn as straight parallel glazing inside its local
    // tangent aperture. The full aperture may score below the generic frame
    // threshold after raster rotation, while a short subdivision can resemble
    // a sliding panel. Prefer the full, long parallel frame over that sub-gap.
    const curvedWindowFrame = !!curveHost
      && widthMeters >= 1.35
      && curveHost.separatedThinBands
      && (evidence.parallelSupport || 0) >= 0.28
      && (evidence.doorLeafSupport || 0) < 0.45
      && (evidence.foldingSupport || 0) < 0.62
      && (evidence.slidingSupport || 0) < 0.58;
    const authoritativeFreeformWindow = evidence.windowFrame
      && (!curveHost || widthMeters < 1.45 || curveHost.separatedThinBands)
      || curvedWindowFrame;
    // Curved glazing bars can form a shallow chevron after straightening the
    // local tangent frame. A proven parallel window frame remains authoritative
    // unless the folding signature is exceptionally strong and non-parallel.
    const curvedChevronDoor = !!curveHost
      && widthMeters >= 1.2
      && widthMeters <= 2.1
      && (evidence.foldingSupport || 0) >= 0.25
      && (evidence.parallelSupport || 0) < 0.4
      && (evidence.slidingSupport || 0) < 0.45
      && (evidence.doorLeafSupport || 0) >= 0.12
      && (evidence.doorLeafSupport || 0) < 0.55;
    const parallelWallOrFrame = (evidence.parallelSupport || 0) >= 0.82;
    const orientedFoldingDoor = freeformDoorSized
      && ((evidence.foldingSupport || 0) >= 0.72 || curvedChevronDoor)
      && !parallelWallOrFrame
      && (!authoritativeFreeformWindow
        || ((evidence.foldingSupport || 0) >= 0.9 && (evidence.parallelSupport || 0) < 0.8));
    const orientedSlidingDoor = freeformDoorSized
      && widthMeters >= 1.1
      && !orientedFoldingDoor
      && !authoritativeFreeformWindow
      && (evidence.slidingSupport || 0) >= 0.68
      && (evidence.parallelSupport || 0) < 0.9;
    const supportedSwingLeaf = (evidence.doorLeafSupport || 0) >= 0.62
      && (evidence.parallelSupport || 0) < 0.45
      && (evidence.foldingSupport || 0) < 0.55
      && (evidence.slidingSupport || 0) < 0.5;
    const strongFreeformDoorEvidence = freeformDoorSized && (orientedFoldingDoor || orientedSlidingDoor || ((evidence.doorLeaf || supportedSwingLeaf)
      && freeformDoorSized
      && (evidence.arcSupport || 0) >= 0.58
      && (evidence.parallelSupport || 0) < 0.72
      && !windowLikeFreeform));
    // Once a direction-aware fold/slide or a matching leaf-plus-arc has passed
    // the freeform symbol gates, it is more specific than a coincident frame.
    // Window evidence still wins every ambiguous case that does not pass those
    // full door-symbol checks.
    const isDoor = strongFreeformDoorEvidence;
    const nearbyDoor = doors.findIndex(element => Math.hypot(element.pos[0] - position[0], element.pos[1] - position[1]) <= 0.16);
    if (nearbyDoor >= 0) return;
    const nearbyWindow = windows.findIndex(element => Math.hypot(element.pos[0] - position[0], element.pos[1] - position[1]) <= 0.16);
    const nearbyOpening = openings.findIndex(element => Math.hypot(element.pos[0] - position[0], element.pos[1] - position[1]) <= 0.16);
    const rawRotation = (Math.atan2(-(gap.p2.y - gap.p1.y), gap.p2.x - gap.p1.x) * 180 / Math.PI + 180) % 180;
    const distanceFromAxis = Math.min(rawRotation % 90, 90 - (rawRotation % 90));
    const distanceFromCanonical = Math.min(...[0, 30, 45, 60, 90, 120, 135, 150, 180]
      .map(angle => Math.abs(rawRotation - angle)));
    // Axis-aligned walls inside a hybrid plan remain owned by the established
    // orthogonal classifier. The freeform pass may revisit an axis tangency
    // only when it has been matched to an analytic curve family.
    if (!curveHost && distanceFromAxis <= 6) return;
    if (smoothCurvilinearCandidate && !curveHost && !nearEntryTag && distanceFromCanonical > 4) return;
    // A strong oriented leaf read is more specific than the axis fallback
    // that may have seen the same curved-host aperture first. Upgrade that
    // provisional window/opening instead of silently discarding the door.
    if (isDoor) {
      if (nearbyWindow >= 0) windows.splice(nearbyWindow, 1);
      if (nearbyOpening >= 0) openings.splice(nearbyOpening, 1);
    } else if (nearbyWindow >= 0 || nearbyOpening >= 0) return;
    if (unlabeledAngularFreeform && !isDoor && evidence.doorLeaf && !evidence.windowFrame && !recoveredFaintAngularWindow && widthMeters > 1.45) return;
    // Openings remain straight editor objects even when their host is curved.
    // Preserve the evidenced jamb-to-jamb chord angle; the curve supplies the
    // hosted position/topology, not a replacement tangent orientation.
    const rotation = rawRotation;
    const pixelBounds = {
      x0: Math.min(gap.p1.x, gap.p2.x) - gap.thickness / 2,
      y0: Math.min(gap.p1.y, gap.p2.y) - gap.thickness / 2,
      x1: Math.max(gap.p1.x, gap.p2.x) + gap.thickness / 2,
      y1: Math.max(gap.p1.y, gap.p2.y) + gap.thickness / 2,
    };
    if (isDoor) {
      const evidencedSingleSwing = widthMeters <= 1.65
        && (evidence.doorLeafSupport || 0) >= 0.72
        && (evidence.arcSupport || 0) >= 0.58
        && (evidence.foldingSupport || 0) < 0.55
        && (evidence.slidingSupport || 0) < 0.6;
      const doorType = orientedFoldingDoor ? 'folding'
        : orientedSlidingDoor ? 'sliding'
          : evidencedSingleSwing ? 'single'
            : widthMeters >= 1.15 ? 'double' : 'single';
      const exportedWidth = clamp(widthMeters, 0.6, doorType === 'double' ? 2.1 : doorType === 'single' ? 1.2 : 1.55);
      // inspectText4gFreeformGap reports hinge/side in the gap's own p1->p2
      // frame. A native curve host has an independent analytic direction.
      // Normalize the two local axes before serializing so renderer direction
      // does not reverse the detected swing/folding side.
      const gapVector = {
        x: gap.p2.x - gap.p1.x,
        y: gap.p2.y - gap.p1.y,
      };
      const curveVector = curveHost?.tangent;
      const reverseForCurveHost = !!curveVector
        && gapVector.x * curveVector.x + gapVector.y * curveVector.y < 0;
      const evidencedHingeAtEnd = doorType === 'folding'
        ? evidence.foldingHingeAtEnd ?? evidence.hingeAtEnd
        : evidence.hingeAtEnd;
      const evidencedFacingFlipped = doorType === 'folding'
        ? evidence.foldingFacingFlipped ?? evidence.facingFlipped
        : evidence.facingFlipped;
      const retainedDoor: NonNullable<GeneratedData['doors']>[number] = {
        levelIndex: 0,
        pos: position,
        rotation,
        width: exportedWidth,
        type: doorType,
        isFlipped: reverseForCurveHost ? !evidencedHingeAtEnd : evidencedHingeAtEnd,
        facingFlipped: doorType === 'folding'
          ? evidencedFacingFlipped
          : reverseForCurveHost ? !evidencedFacingFlipped : evidencedFacingFlipped,
        mandatoryExteriorEntry: exterior && !hasMandatoryEntry(),
        measuredWidth: exportedWidth,
        provenance: 'observed',
        evidence: {
          source: 'raster',
          confidence: Math.max(
            evidence.confidence,
            orientedFoldingDoor ? (evidence.foldingSupport || 0) : 0,
            orientedSlidingDoor ? (evidence.slidingSupport || 0) : 0,
          ),
          pixelBounds,
          notes: ['Door retained on an evidenced non-orthogonal host wall.'],
        },
      };
      doors.push(retainedDoor);
      if (curveHost
        && doorType === 'single'
        && widthMeters <= 1.05
        && (evidence.doorLeafSupport || 0) >= 0.82
        && (evidence.arcSupport || 0) < 0.25) curveLinearLeafDoors.add(retainedDoor);
    } else if (exterior || authoritativeFreeformWindow || recoveredFaintAngularWindow) {
      if (exterior && !authoritativeFreeformWindow && !recoveredFaintAngularWindow && widthMeters > 1.45) return;
      windows.push({
        levelIndex: 0,
        pos: position,
        rotation,
        width: widthMeters,
        type: 'standard',
        measuredWidth: widthMeters,
        provenance: 'observed',
        evidence: {
          source: 'raster',
          confidence: recoveredFaintAngularWindow ? 0.86 : authoritativeFreeformWindow ? Math.max(0.78, evidence.confidence) : 0.48,
          pixelBounds,
          notes: ['Opening retained on an evidenced non-orthogonal exterior host wall.'],
        },
      });
    } else {
      openings.push({
        levelIndex: 0,
        pos: position,
        rotation,
        width: widthMeters,
        measuredWidth: widthMeters,
        provenance: 'observed',
        evidence: {
          source: 'raster',
          confidence: 0.6,
          pixelBounds,
          notes: ['Wall opening retained on an evidenced non-orthogonal host wall.'],
        },
      });
    }
  });

  if (curveEvidenceMode) {
    // A sliding insert on a curve is commonly rasterized as two adjacent,
    // parallel straight leaf fragments. Merge only that narrow signature;
    // swing leaves have arc support and folding leaves form a chevron instead.
    for (let firstIndex = 0; firstIndex < doors.length; firstIndex++) {
      const first = doors[firstIndex];
      if (!curveLinearLeafDoors.has(first)) continue;
      for (let secondIndex = firstIndex + 1; secondIndex < doors.length; secondIndex++) {
        const second = doors[secondIndex];
        if (!curveLinearLeafDoors.has(second)) continue;
        const rawAngleDifference = Math.abs((first.rotation || 0) - (second.rotation || 0)) % 180;
        const angleDifference = Math.min(rawAngleDifference, 180 - rawAngleDifference);
        const distance = Math.hypot(first.pos[0] - second.pos[0], first.pos[1] - second.pos[1]);
        const combinedWidth = (first.width || 0) + (second.width || 0);
        if (angleDifference > 22 || distance > combinedWidth * 0.68 || combinedWidth < 1.15 || combinedWidth > 2.15) continue;
        const radiansA = (first.rotation || 0) * Math.PI / 90;
        const radiansB = (second.rotation || 0) * Math.PI / 90;
        const mergedRotation = (Math.atan2(Math.sin(radiansA) + Math.sin(radiansB), Math.cos(radiansA) + Math.cos(radiansB)) * 90 / Math.PI + 180) % 180;
        const boundsA = first.evidence?.pixelBounds, boundsB = second.evidence?.pixelBounds;
        const mergedDoor: NonNullable<GeneratedData['doors']>[number] = {
          ...first,
          pos: [(first.pos[0] + second.pos[0]) / 2, (first.pos[1] + second.pos[1]) / 2],
          rotation: mergedRotation,
          width: clamp(combinedWidth, 1.2, 1.8),
          measuredWidth: clamp(combinedWidth, 1.2, 1.8),
          type: 'sliding',
          mandatoryExteriorEntry: first.mandatoryExteriorEntry || second.mandatoryExteriorEntry,
          evidence: {
            source: 'raster',
            confidence: Math.min(first.evidence?.confidence || 0.82, second.evidence?.confidence || 0.82),
            pixelBounds: boundsA && boundsB ? {
              x0: Math.min(boundsA.x0, boundsB.x0), y0: Math.min(boundsA.y0, boundsB.y0),
              x1: Math.max(boundsA.x1, boundsB.x1), y1: Math.max(boundsA.y1, boundsB.y1),
            } : boundsA || boundsB,
            notes: ['Adjacent parallel raster leaves merged as one sliding insert on a curved host wall.'],
          },
        };
        doors.splice(secondIndex, 1);
        doors.splice(firstIndex, 1, mergedDoor);
        curveLinearLeafDoors.delete(first);
        curveLinearLeafDoors.delete(second);
        firstIndex--;
        break;
      }
    }
    type HostedElement = (typeof doors)[number] | (typeof windows)[number] | (typeof openings)[number];
    const sameRasterAperture = (first: HostedElement, second: HostedElement) => {
      const a = first.evidence?.pixelBounds, b = second.evidence?.pixelBounds;
      if (!a || !b) return Math.hypot(first.pos[0] - second.pos[0], first.pos[1] - second.pos[1]) <= 0.22;
      const intersectionWidth = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
      const intersectionHeight = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
      const intersection = intersectionWidth * intersectionHeight;
      const smallerArea = Math.max(1, Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0)));
      const centerDistance = Math.hypot((a.x0 + a.x1 - b.x0 - b.x1) / 2, (a.y0 + a.y1 - b.y0 - b.y1) / 2);
      return intersection / smallerArea >= 0.35 || centerDistance <= typicalThickness * 1.35;
    };
    const deduplicate = <T extends HostedElement>(elements: T[]) => {
      const ranked = [...elements].sort((a, b) => (b.evidence?.confidence || 0) - (a.evidence?.confidence || 0));
      return ranked.filter((element, index) => !ranked.slice(0, index).some(existing => sameRasterAperture(existing, element)));
    };
    doors.splice(0, doors.length, ...deduplicate(doors));
    windows.splice(0, windows.length, ...deduplicate(windows));
    openings.splice(0, openings.length, ...deduplicate(openings));
    // Symbol-proven doors are more specific than a frame/opening fallback
    // emitted for the same raster aperture. A window remains authoritative
    // over a generic wall opening when both occupy the same evidenced gap.
    for (let index = windows.length - 1; index >= 0; index--) {
      if (doors.some(door => sameRasterAperture(door, windows[index]))) windows.splice(index, 1);
    }
    for (let index = openings.length - 1; index >= 0; index--) {
      if (doors.some(door => sameRasterAperture(door, openings[index]))
        || windows.some(window => sameRasterAperture(window, openings[index]))) openings.splice(index, 1);
    }
    const existingAperturePixelCenters = [...doors, ...windows, ...openings]
      .map(element => element.evidence?.pixelBounds)
      .filter((bounds): bounds is { x0: number; y0: number; x1: number; y1: number } => !!bounds)
      .map(bounds => ({
        x: (bounds.x0 + bounds.x1) / 2,
        y: (bounds.y0 + bounds.y1) / 2,
        span: Math.max(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0),
      }));
    const nearExistingAperture = (point: PixelPoint, radius = typicalThickness * 8) =>
      existingAperturePixelCenters.some(existing =>
        Math.hypot(existing.x - point.x, existing.y - point.y) <= Math.max(radius, existing.span * 1.15));
    const sampleCurvePoint = (arc: (typeof consolidatedFreeform.arcs)[number], progress: number): PixelPoint => {
      const start = arc.ellipseStartAngle ?? arc.startAngle;
      const end = arc.ellipseEndAngle ?? arc.endAngle;
      const counterclockwise = arc.ellipseCounterclockwise ?? arc.counterclockwise;
      const span = curveDirectedSpan(start, end, counterclockwise);
      const angle = counterclockwise ? start - span * progress : start + span * progress;
      const radiusX = arc.ellipseRadiusX ?? arc.radius;
      const radiusY = arc.ellipseRadiusY ?? arc.radius;
      const rotation = arc.ellipseRotation || 0;
      const cosR = Math.cos(rotation), sinR = Math.sin(rotation);
      return {
        x: arc.center.x + Math.cos(angle) * radiusX * cosR - Math.sin(angle) * radiusY * sinR,
        y: arc.center.y + Math.cos(angle) * radiusX * sinR + Math.sin(angle) * radiusY * cosR,
      };
    };
    const curveWindowEvidence = (arc: (typeof consolidatedFreeform.arcs)[number], progress: number) => {
      const center = sampleCurvePoint(arc, progress);
      const before = sampleCurvePoint(arc, Math.max(0, progress - 0.012));
      const after = sampleCurvePoint(arc, Math.min(1, progress + 0.012));
      const tangentLength = Math.max(typicalThickness * 3.2, 18);
      const dx = after.x - before.x, dy = after.y - before.y;
      const length = Math.max(1e-6, Math.hypot(dx, dy));
      const tangent = { x: dx / length, y: dy / length };
      const normal = { x: -tangent.y, y: tangent.x };
      const first = { x: center.x - tangent.x * tangentLength / 2, y: center.y - tangent.y * tangentLength / 2 };
      const second = { x: center.x + tangent.x * tangentLength / 2, y: center.y + tangent.y * tangentLength / 2 };
      const normalReach = Math.max(3, Math.ceil(typicalThickness * 1.55));
      const supportedOffsets: number[] = [];
      for (let offset = -normalReach; offset <= normalReach; offset++) {
        const shiftedFirst = { x: first.x + normal.x * offset, y: first.y + normal.y * offset };
        const shiftedSecond = { x: second.x + normal.x * offset, y: second.y + normal.y * offset };
        const support = lineDarkSupport(originalDoorEvidenceMask, width, height, shiftedFirst, shiftedSecond, 1);
        if (support >= 0.78) supportedOffsets.push(offset);
      }
      let bandCount = 0;
      let widestBand = 0;
      for (let index = 0; index < supportedOffsets.length;) {
        let end = index;
        while (end + 1 < supportedOffsets.length && supportedOffsets[end + 1] === supportedOffsets[end] + 1) end++;
        const bandWidth = end - index + 1;
        if (bandWidth >= 1) {
          bandCount++;
          widestBand = Math.max(widestBand, bandWidth);
        }
        index = end + 1;
      }
      return {
        center,
        // Solid curved wall ink produces one wide contiguous band. A recoverable
        // curved window has multiple narrow, separated parallel frame bands.
        support: bandCount >= 2 && widestBand <= Math.max(4, Math.ceil(typicalThickness * 0.38)) ? 1 : 0,
      };
    };
    const recoveredCurveWindows: typeof windows = [];
    consolidatedFreeform.arcs.forEach(arc => {
      const sourceSegments = arc.sourceIndices
        .map(index => curveSourceSegments[index])
        .filter((segment): segment is Text4gFreeformWallSegment => !!segment);
      const exteriorVotes = sourceSegments.filter(segment => isFreeformExterior(segment, finalFlood.outside, width, height)).length;
      const exteriorArc = nativeCurveMode === 'hybrid'
        ? nativeCurveRole(arc) === 'exterior'
        : exteriorVotes >= Math.max(1, Math.ceil(sourceSegments.length / 2));
      if (!exteriorArc) return;
      const radiusX = arc.ellipseRadiusX ?? arc.radius;
      const radiusY = arc.ellipseRadiusY ?? arc.radius;
      const span = curveDirectedSpan(
        arc.ellipseStartAngle ?? arc.startAngle,
        arc.ellipseEndAngle ?? arc.endAngle,
        arc.ellipseCounterclockwise ?? arc.counterclockwise,
      );
      const sampleCount = Math.max(18, Math.ceil(span * Math.max(radiusX, radiusY) / Math.max(3, typicalThickness * 0.38)));
      const marked = Array.from({ length: sampleCount + 1 }, (_, index) => {
        const progress = index / sampleCount;
        const evidence = curveWindowEvidence(arc, progress);
        return {
          progress,
          center: evidence.center,
          marked: evidence.support >= 0.2 && !nearExistingAperture(evidence.center),
        };
      });
      let runStart = -1;
      for (let index = 0; index <= marked.length; index++) {
        if (index < marked.length && marked[index].marked && runStart < 0) runStart = index;
        if ((index === marked.length || !marked[index].marked) && runStart >= 0) {
          const runEnd = index - 1;
          const runLength = runEnd - runStart + 1;
          if (runLength >= 2) {
            const startProgress = marked[runStart].progress;
            const endProgress = marked[runEnd].progress;
            const midProgress = (startProgress + endProgress) / 2;
            const p1 = sampleCurvePoint(arc, startProgress);
            const p2 = sampleCurvePoint(arc, endProgress);
            const midpoint = sampleCurvePoint(arc, midProgress);
            const widthMeters = Math.hypot(p2.x - p1.x, p2.y - p1.y) * finalUniformScale;
            if (widthMeters >= 0.65 && widthMeters <= 4.5) {
              const mappedP1 = mapPoint(p1.x, p1.y);
              const mappedP2 = mapPoint(p2.x, p2.y);
              recoveredCurveWindows.push({
                levelIndex: 0,
                pos: mapPoint(midpoint.x, midpoint.y),
                rotation: Math.atan2(-(p2.y - p1.y), p2.x - p1.x) * 180 / Math.PI,
                width: widthMeters,
                type: 'standard',
                measuredWidth: widthMeters,
                provenance: 'observed',
                evidence: {
                  source: 'raster',
                  confidence: 0.8,
                  pixelBounds: {
                    x0: Math.min(p1.x, p2.x) - typicalThickness / 2,
                    y0: Math.min(p1.y, p2.y) - typicalThickness / 2,
                    x1: Math.max(p1.x, p2.x) + typicalThickness / 2,
                    y1: Math.max(p1.y, p2.y) + typicalThickness / 2,
                  },
                  notes: ['Parallel glazing recovered on an exterior native curve after gap tracing missed the aperture.'],
                },
              });
              existingAperturePixelCenters.push({
                x: midpoint.x,
                y: midpoint.y,
                span: Math.hypot(mappedP2[0] - mappedP1[0], mappedP2[1] - mappedP1[1]) / Math.max(1e-6, finalUniformScale),
              });
            }
          }
          runStart = -1;
        }
      }
    });
    windows.push(...recoveredCurveWindows);
    const strongCurvedWindows = windows.filter(window =>
      (window.evidence?.notes || []).some(note =>
        /non-orthogonal exterior host wall|Parallel glazing recovered on an exterior native curve/i.test(note))
      && (window.evidence?.confidence || 0) >= 0.76);
    const peerWideWindows = strongCurvedWindows.filter(window => (window.measuredWidth || window.width) >= 1.45);
    if (peerWideWindows.length >= 2) {
      const peerWidths = peerWideWindows.map(window => window.measuredWidth || window.width).sort((a, b) => a - b);
      const peerWidth = peerWidths[Math.floor(peerWidths.length / 2)];
      strongCurvedWindows.forEach(window => {
        const currentWidth = window.measuredWidth || window.width;
        const recoveredCurveWindow = (window.evidence?.notes || [])
          .some(note => /Parallel glazing recovered on an exterior native curve/i.test(note));
        const minimumNormalizableWidth = recoveredCurveWindow ? 0.6 : 0.75;
        if (currentWidth >= minimumNormalizableWidth && currentWidth <= peerWidth * 0.68) {
          const recoveredExpansion = Math.max(0.22, typicalThickness * finalUniformScale * 3.2);
          const targetWidth = recoveredCurveWindow
            // A recovered curved window may represent only the strongest middle
            // glazing band. Expand it from its own raster evidence, but do not
            // blindly copy a far larger peer width because adjacent curved doors
            // often sit very close on the same exterior arc.
            ? Math.min(peerWidth * 0.72, currentWidth + recoveredExpansion)
            : peerWidth;
          window.width = targetWidth;
          window.measuredWidth = targetWidth;
          window.evidence = window.evidence ? {
            ...window.evidence,
            notes: [...(window.evidence.notes || []), 'Curved-window width normalized to matching peer glazing on the same analytic exterior family.'],
          } : window.evidence;
        }
      });
    }
    const rotationDelta = (firstRotation = 0, secondRotation = 0) => {
      const raw = Math.abs(firstRotation - secondRotation) % 180;
      return Math.min(raw, 180 - raw);
    };
    const planDistance = (first: number[], second: number[]) =>
      Math.hypot(first[0] - second[0], first[1] - second[1]);
    for (let index = openings.length - 1; index >= 0; index--) {
      const opening = openings[index];
      const notes = opening.evidence?.notes || [];
      const genericFreeformOpening = notes.some(note =>
        /Wall opening retained on an evidenced non-orthogonal host wall/i.test(note));
      if (!genericFreeformOpening) continue;
      const openingWidth = opening.measuredWidth || opening.width || 0;
      const overlapsDoorInPlan = doors.some(door => {
        const angleClose = rotationDelta(opening.rotation || 0, door.rotation || 0) <= 18;
        if (!angleClose) return false;
        const doorWidth = door.measuredWidth || door.width || 0;
        const tolerance = Math.max(0.22, Math.min(openingWidth || 0.8, doorWidth || 0.8) * 0.42);
        return planDistance(opening.pos, door.pos) <= tolerance;
      });
      const openingAngle = Math.abs(opening.rotation || 0) % 90;
      const openingAxisDrift = Math.min(openingAngle, 90 - openingAngle);
      const hasNearbySpecificAperture = [...doors, ...windows].some(aperture => {
        const apertureWidth = aperture.measuredWidth || aperture.width || 0;
        const tolerance = Math.max(0.28, Math.max(openingWidth || 0.8, apertureWidth || 0.8) * 0.55);
        return planDistance(opening.pos, aperture.pos) <= tolerance;
      });
      const oversizedDiagonalScar = openingWidth > 2.15
        && openingAxisDrift > 8
        && !hasNearbySpecificAperture;
      if (overlapsDoorInPlan || oversizedDiagonalScar) openings.splice(index, 1);
    }

  }

  // Universal final arbitration: orthogonal, curved, and hybrid routes all
  // converge here after their door-symbol classifiers finish. Every retained
  // door has raster evidence (swing arc, paired double arcs, folding leaves, or
  // sliding leaves), so it is authoritative over a generic wall opening. The
  // same pass prevents multiple generic openings from cutting one host span.
  openings.splice(0, openings.length, ...arbitrateText4gHostedOpenings(doors, openings));
  const hostTolerance = Math.max(0.18, typicalThickness * finalUniformScale * 1.8);
  openings.splice(0, openings.length, ...openings.filter(opening =>
    text4gOpeningHasHost(opening, walls, hostTolerance)));

  const columnCatalog = [
    { presetId: 'col_sm_sq', size: 0.23 },
    { presetId: 'col_md_sq', size: 0.3 },
    { presetId: 'col_lg_sq', size: 0.45 },
    { presetId: 'col_hv_sq', size: 0.6 },
  ];
  const columns: NonNullable<GeneratedData['columns']> = detectedPixelColumns.map(column => {
    const measuredWidth = column.widthPixels * finalScale.x;
    const measuredDepth = column.depthPixels * finalScale.y;
    const nearest = [...columnCatalog].sort((a, b) => Math.abs(a.size - measuredWidth) - Math.abs(b.size - measuredWidth))[0];
    const usePreset = Math.abs(nearest.size - measuredWidth) <= Math.max(0.04, measuredWidth * 0.18);
    return {
      levelIndex: 0,
      pos: mapPoint(column.x, column.y),
      width: usePreset ? nearest.size : measuredWidth,
      depth: usePreset ? nearest.size : measuredDepth,
      shape: 'rect',
      presetId: usePreset ? nearest.presetId : undefined,
      measuredWidth,
      provenance: 'observed',
      evidence: { source: 'raster', confidence: column.confidence, pixelBounds: column.pixelBounds },
    };
  });
  const stairs: NonNullable<GeneratedData['stairs']> = detectedPixelStairs.map(stair => {
    const measuredWidth = stair.widthPixels * (Math.abs(stair.p2.y - stair.p1.y) >= Math.abs(stair.p2.x - stair.p1.x) ? finalScale.x : finalScale.y);
    const useLinearPreset = Math.abs(measuredWidth - 1.05) <= 0.2;
    return {
      levelIndex: 0,
      p1: mapPoint(stair.p1.x, stair.p1.y),
      p2: mapPoint(stair.p2.x, stair.p2.y),
      width: useLinearPreset ? 1.05 : measuredWidth,
      shape: 'linear',
      stepCount: stair.stepCount,
      presetId: useLinearPreset ? 'stair_lin' : undefined,
      measuredWidth,
      provenance: 'observed',
      evidence: { source: 'raster', confidence: stair.confidence, pixelBounds: stair.pixelBounds },
    };
  });
  const seenRailingSegments = new Set<string>();
  const maximumRailingStrokeThickness = Math.max(3, typicalThickness * 0.45);
  const projectedRailings: NonNullable<GeneratedData['railings']> = detectedRailingProjections.flatMap(projection => {
    const projectionStrokeThickness = Math.min(...projection.segments.map(segment => segment.thickness));
    const projectionRailingThickness = Math.min(
      maximumRailingStrokeThickness,
      Math.max(3, projectionStrokeThickness * 3),
    );
    return projection.segments.flatMap(segment => {
      // The two projection connectors may be real thick balcony side walls.
      // Never retype solid wall ink as a railing merely because it closes a
      // three-sided projection; a true rail remains thin across this sample.
      if (segment.thickness > projectionRailingThickness
        || wallBandInkRatio(segment, originalDarkMask, width, height, typicalThickness) >= 0.55) return [];
      const key = `${segment.axis}:${Math.round(segment.line)}:${Math.round(segment.start)}:${Math.round(segment.end)}`;
      if (seenRailingSegments.has(key)) return [];
      seenRailingSegments.add(key);
      const p1 = segment.axis === 'horizontal' ? mapPoint(segment.start, segment.line) : mapPoint(segment.line, segment.start);
      const p2 = segment.axis === 'horizontal' ? mapPoint(segment.end, segment.line) : mapPoint(segment.line, segment.end);
      return [{
        levelIndex: 0,
        p1,
        p2,
        presetId: 'rail_balcony',
        provenance: 'observed' as const,
        evidence: {
          source: 'raster' as const,
          confidence: projection.confidence,
          pixelBounds: segment.axis === 'horizontal'
            ? { x0: segment.start, y0: segment.line - segment.thickness / 2, x1: segment.end, y1: segment.line + segment.thickness / 2 }
            : { x0: segment.line - segment.thickness / 2, y0: segment.start, x1: segment.line + segment.thickness / 2, y1: segment.end },
        },
      }];
    });
  });
  const embeddedRailings: NonNullable<GeneratedData['railings']> = Array.from(embeddedRailingGaps).map(gap => ({
    levelIndex: 0,
    p1: gap.axis === 'horizontal' ? mapPoint(gap.start, gap.line) : mapPoint(gap.line, gap.start),
    p2: gap.axis === 'horizontal' ? mapPoint(gap.end, gap.line) : mapPoint(gap.line, gap.end),
    presetId: 'rail_balcony',
    provenance: 'observed',
    evidence: {
      source: 'raster',
      confidence: 0.82,
      pixelBounds: gap.axis === 'horizontal'
        ? { x0: gap.start, y0: gap.line - gap.thickness / 2, x1: gap.end, y1: gap.line + gap.thickness / 2 }
        : { x0: gap.line - gap.thickness / 2, y0: gap.start, x1: gap.line + gap.thickness / 2, y1: gap.end },
      notes: ['Open edge bound to an OCR-evidenced balcony/terrace label.'],
    },
  }));
  const existingRailingCount = projectedRailings.length + embeddedRailings.length;
  // A geometrically proven projection already supplies the authoritative
  // railing component. Label-near thin-stroke recovery is a fallback only;
  // combining both paths can re-add the inner balcony wall or its glazing as
  // extra rails (DS12-70).
  const recoveredTaggedRailingPixels = existingRailingCount > 0 ? [] : recoverTaggedRailingSegments(
    symbolSegments,
    roomTextTags,
    frameAxisBounds,
    typicalThickness,
    width,
    height,
  );
  const taggedRailingPixels = recoveredTaggedRailingPixels;
  const existingRailingBounds = [...projectedRailings, ...embeddedRailings]
    .map(railing => railing.evidence?.pixelBounds)
    .filter((bounds): bounds is { x0: number; y0: number; x1: number; y1: number } => !!bounds);
  const taggedRailings: NonNullable<GeneratedData['railings']> = taggedRailingPixels.flatMap(segment => {
    const bounds = segment.axis === 'horizontal'
      ? { minX: segment.start, minY: segment.line - segment.thickness / 2, maxX: segment.end, maxY: segment.line + segment.thickness / 2 }
      : { minX: segment.line - segment.thickness / 2, minY: segment.start, maxX: segment.line + segment.thickness / 2, maxY: segment.end };
    const duplicate = existingRailingBounds.some(existing => {
      const existingMinX = existing.x0;
      const existingMaxX = existing.x1;
      const existingMinY = existing.y0;
      const existingMaxY = existing.y1;
      const overlapX = Math.max(0, Math.min(bounds.maxX, existingMaxX) - Math.max(bounds.minX, existingMinX));
      const overlapY = Math.max(0, Math.min(bounds.maxY, existingMaxY) - Math.max(bounds.minY, existingMinY));
      return segment.axis === 'horizontal'
        ? overlapX >= (segment.end - segment.start) * 0.75 && Math.abs((existingMinY + existingMaxY) / 2 - segment.line) <= typicalThickness
        : overlapY >= (segment.end - segment.start) * 0.75 && Math.abs((existingMinX + existingMaxX) / 2 - segment.line) <= typicalThickness;
    });
    if (duplicate) return [];
    return [{
      levelIndex: 0,
      p1: segment.axis === 'horizontal' ? mapPoint(segment.start, segment.line) : mapPoint(segment.line, segment.start),
      p2: segment.axis === 'horizontal' ? mapPoint(segment.end, segment.line) : mapPoint(segment.line, segment.end),
      presetId: 'rail_balcony',
      provenance: 'observed' as const,
      evidence: {
        source: 'raster' as const,
        confidence: 0.78,
        pixelBounds: segment.axis === 'horizontal'
          ? { x0: segment.start, y0: segment.line - segment.thickness / 2, x1: segment.end, y1: segment.line + segment.thickness / 2 }
          : { x0: segment.line - segment.thickness / 2, y0: segment.start, x1: segment.line + segment.thickness / 2, y1: segment.end },
        notes: ['Thin connected edge recovered beside an OCR-confirmed balcony/terrace label.'],
      },
    }];
  });
  const angularRailings: NonNullable<GeneratedData['railings']> = (sparseAngularComponentSheetMode ? detectedAngularRailings : []).map(segment => ({
    levelIndex: 0,
    p1: mapPoint(segment.p1.x, segment.p1.y),
    p2: mapPoint(segment.p2.x, segment.p2.y),
    presetId: 'rail_balcony',
    provenance: 'observed',
    evidence: {
      source: 'raster',
      confidence: segment.confidence,
      pixelBounds: {
        x0: Math.min(segment.p1.x, segment.p2.x), y0: Math.min(segment.p1.y, segment.p2.y),
        x1: Math.max(segment.p1.x, segment.p2.x), y1: Math.max(segment.p1.y, segment.p2.y),
      },
      notes: ['Cool-gray connected exterior edge retained as a native angular railing, never as a wall.'],
    },
  }));
  const railings: NonNullable<GeneratedData['railings']> = [...projectedRailings, ...embeddedRailings, ...taggedRailings, ...angularRailings];

  const spaces = sparseAngularComponentSheetMode
    ? []
    : finalFlood.spaces.sort((a, b) => b.areaMeters - a.areaMeters);
  let rooms: NonNullable<GeneratedData['rooms']>;
  if (roomTextTags.length) {
    rooms = roomTextTags.map(tag => ({
      levelIndex: 0,
      label: tag.label,
      pos: mapPoint(tag.x, tag.y),
      sourceWidth: tag.sourceWidth,
      sourceDepth: tag.sourceDepth,
      provenance: 'observed',
      evidence: { source: 'ocr', confidence: clamp(tag.confidence / 100, 0, 1) },
    }));
    const observedFamilies = roomTextTags.map(tag => canonicalRoomName(tag.label, 0, 1).toLowerCase());
    const unmatchedRequested = requestedRoomLabels.filter(label => {
      const canonical = canonicalRoomName(label, 0, 1).toLowerCase();
      const exactIndex = observedFamilies.findIndex(observed => observed === canonical);
      const broadIndex = exactIndex >= 0 ? exactIndex : observedFamilies.findIndex(observed =>
        (/bedroom/.test(observed) && /bedroom/.test(canonical)) ||
        (/bath|ensuite|powder/.test(observed) && /bath|ensuite|powder/.test(canonical)) ||
        (/living|lounge/.test(observed) && /living|lounge/.test(canonical)) ||
        (/storage|laundry|utility/.test(observed) && /storage|laundry|utility/.test(canonical)));
      if (broadIndex < 0) return true;
      observedFamilies.splice(broadIndex, 1);
      return false;
    });
    const taggedRegionIds = new Set(roomTextTags.map(tag => {
      const x = clamp(Math.round(tag.x), 0, width - 1), y = clamp(Math.round(tag.y), 0, height - 1);
      return finalFlood.labels[y * width + x];
    }).filter(Boolean));
    const availableSpaces = spaces.filter(space => !taggedRegionIds.has(space.id));
    const missingAssignments = assignRoomNames(availableSpaces, unmatchedRequested, false);
    for (const [space, label] of missingAssignments) {
      rooms.push({
        levelIndex: 0, label, pos: mapPoint(space.x, space.y), provenance: 'brief-derived',
        evidence: { source: 'design-brief', confidence: 0.45, notes: ['Assigned to an unlabelled enclosure by relative size.'] },
      });
    }
  } else {
    const roomNames = assignRoomNames(spaces, requestedRoomLabels);
    rooms = spaces.map((space, index) => ({
      levelIndex: 0,
      label: roomNames.get(space) || `Room ${index + 1}`,
      pos: mapPoint(space.x, space.y),
      provenance: roomNames.get(space) ? 'brief-derived' : 'observed',
      evidence: {
        source: roomNames.get(space) ? 'design-brief' : 'raster',
        confidence: roomNames.get(space) ? 0.42 : 0.6,
        notes: roomNames.get(space) ? ['Room name assigned by enclosure-size ranking because no OCR label was available.'] : undefined,
      },
    }));
  }
  detectedRailingProjections.forEach((projection, index) => {
    if (rooms.some(room => /balcony|terrace|loggia/i.test(room.label))) return;
    rooms.push({
      levelIndex: 0,
      label: detectedRailingProjections.length > 1 ? `Balcony ${index + 1}` : 'Balcony',
      pos: mapPoint(
        (projection.bounds.minX + projection.bounds.maxX) / 2,
        (projection.bounds.minY + projection.bounds.maxY) / 2,
      ),
      provenance: 'observed',
      evidence: {
        source: 'raster',
        confidence: projection.confidence,
        notes: ['Open projection identified from three connected balcony railing edges.'],
      },
    });
  });

  const boundaryPixels = rectangularWallFrame && detectedRailingProjections.length === 1
    ? rectangularFootprintWithProjection(wallFacePixelBounds, detectedRailingProjections[0])
    : footprintPixels.length >= 4 ? footprintPixels : rectangularFootprint(footprintBounds);
  // Flood-fill can select a small interior contour even after the curve
  // consolidator has proved a near-complete exterior ellipse. In that narrow
  // case the native curve is the stronger property-envelope observation.
  // Partial arcs, rail projections, and every non-curvilinear plan continue to
  // use the established traced-footprint route.
  const dominantClosedEllipse = !detectedRailingProjections.length
    ? nativeArcWalls
      .filter(wall => wall.type === 'exterior'
        && wall.wallSource === 'ellipse'
        && Array.isArray(wall.ellipseCenter)
        && Number.isFinite(wall.ellipseRadiusX)
        && Number.isFinite(wall.ellipseRadiusY)
        && Number.isFinite(wall.ellipseStartAngle)
        && Number.isFinite(wall.ellipseEndAngle)
        && Math.abs((wall.ellipseEndAngle as number) - (wall.ellipseStartAngle as number)) >= Math.PI * 1.7)
      .sort((a, b) =>
        ((b.ellipseRadiusX as number) * (b.ellipseRadiusY as number))
        - ((a.ellipseRadiusX as number) * (a.ellipseRadiusY as number)))[0]
    : undefined;
  const sampleClosedEllipseBoundary = (
    wall: NonNullable<typeof dominantClosedEllipse>,
    radialOffset: number,
  ) => {
    const center = wall.ellipseCenter as number[];
    const radiusX = Math.max(0.01, (wall.ellipseRadiusX as number) + radialOffset);
    const radiusY = Math.max(0.01, (wall.ellipseRadiusY as number) + radialOffset);
    const rotation = wall.ellipseRotation || 0;
    const cosR = Math.cos(rotation), sinR = Math.sin(rotation);
    return Array.from({ length: 49 }, (_, index) => {
      const angle = index / 48 * Math.PI * 2;
      const x = Math.cos(angle) * radiusX, y = Math.sin(angle) * radiusY;
      return [
        center[0] + x * cosR - y * sinR,
        center[1] + x * sinR + y * cosR,
      ];
    });
  };
  const nativeCurveFaceBoundary = dominantClosedEllipse
    ? sampleClosedEllipseBoundary(dominantClosedEllipse, exteriorWallThicknessMeters / 2)
    : undefined;
  const nativeCurveSlabBoundary = dominantClosedEllipse
    ? sampleClosedEllipseBoundary(dominantClosedEllipse, 0)
    : undefined;
  const outerWallFaceBounds = generatedWallFaceBounds(walls, exteriorWallThicknessMeters);
  const mappedBoundary = boundaryPixels.map(point => {
    const mapped = mapPoint(point.x, point.y);
    if (!outerWallFaceBounds || !rectangularWallFrame) return mapped;
    return [
      Math.abs(point.x - wallBounds.minX) <= 1 ? outerWallFaceBounds.minX
        : Math.abs(point.x - wallBounds.maxX) <= 1 ? outerWallFaceBounds.maxX : mapped[0],
      Math.abs(point.y - wallBounds.minY) <= 1 ? outerWallFaceBounds.maxY
        : Math.abs(point.y - wallBounds.maxY) <= 1 ? outerWallFaceBounds.minY : mapped[1],
    ];
  });
  // Property dimensions follow the extreme exterior faces. The editor floor
  // slab is a separate object and follows wall centerlines (plus evidenced open
  // projection rail edges), matching native canvas construction.
  const boundary = nativeCurveFaceBoundary || (detectedRailingProjections.length
    ? mappedBoundary
    : outerWallFaceBounds ? fitPolygonToBounds(mappedBoundary, outerWallFaceBounds) : mappedBoundary);
  const slabBoundaryPixels = rectangularWallFrame && detectedRailingProjections.length === 1
    ? rectangularFootprintWithProjection(frameAxisBounds, detectedRailingProjections[0])
    : rectangularWallFrame
      ? rectangularFootprint(frameAxisBounds)
      : footprintPixels.length >= 4 ? footprintPixels : rectangularFootprint(frameAxisBounds);
  const slabBoundary = nativeCurveSlabBoundary || slabBoundaryPixels.map(point => mapPoint(point.x, point.y));
  const slabs: NonNullable<GeneratedData['slabs']> = componentSheetMode || sparseAngularComponentSheetMode || roomSlabEnclosureIncomplete
    ? []
    : [{ levelIndex: 0, boundary: slabBoundary, type: 'floor' }];

  const warnings: string[] = [];
  if (componentSheetMode) warnings.push('Disconnected architectural element sheet detected; isolated presets were preserved without inventing a floor slab or enclosing shell.');
  if (sparseAngularComponentSheetMode) warnings.push('Sparse angular component sheet detected; native walls, openings, railings, columns, and stairs were preserved without inventing a false enclosing room.');
  if (roomSlabEnclosureIncomplete) {
    warnings.push('Room/slab enclosure incomplete: evidenced curvilinear or hybrid walls and openings were preserved, but closed room and floor-slab recovery needs review.');
  }
  if (geometryMode !== 'orthogonal') {
    const representations = [
      `${freeformWalls.length} evidenced non-orthogonal wall chords`,
      ...(nativeArcWalls.length ? [`${nativeArcWalls.length} high-confidence native wall arcs`] : []),
    ];
    warnings.push(
      `${geometryMode[0].toUpperCase()}${geometryMode.slice(1)} geometry detector retained ${representations.join(' and ')}; scaling, OCR, enclosure recovery, and JSON mapping used the common Text 4.0 G pipeline.`,
    );
  }
  const requestedAspect = requestedBounds
    ? (requestedBounds.maxX - requestedBounds.minX) / Math.max(0.01, requestedBounds.maxY - requestedBounds.minY)
    : undefined;
  const detectedAspect = footprintPixelWidth / footprintPixelHeight;
  const envelopeAspectConflict = requestedAspect
    ? Math.abs(detectedAspect - requestedAspect) / requestedAspect
    : 0;
  const scaleConflict = reliableTextScale && requestedScale
    ? Math.abs(reliableTextScale - requestedScale) / requestedScale
    : 0;
  if (!roomTextTags.length) {
    warnings.push(ocrStatus === 'disabled'
      ? 'Local OCR was disabled; room names were inferred from the design brief and enclosed-space sizes.'
      : ocrStatus === 'timed-out'
        ? 'Local OCR reached its speed budget; room names were inferred from the design brief and enclosed-space sizes.'
      : ocrStatus === 'unavailable'
        ? 'Local OCR was unavailable; room names were inferred from the design brief and enclosed-space sizes.'
        : 'Local OCR found no reliable room labels; names were inferred from the design brief and enclosed-space sizes.');
  }
  if (roomTextTags.length && !reliableTextScale) warnings.push('Printed dimensions were insufficient or geometrically inconsistent, so image scale could not be verified from text.');
  if (enforceRequestedEnvelope && envelopeAspectConflict > 0.04) {
    warnings.push(`Detected wall proportions differed from the confirmed envelope by ${Math.round(envelopeAspectConflict * 100)}%; uniform scale preserved the floorplan aspect ratio and centered it inside the requested envelope.`);
  }
  if (scaleConflict > 0.2) warnings.push(enforceRequestedEnvelope
    ? `Printed room dimensions disagree with the requested boundary by ${Math.round(scaleConflict * 100)}%; the confirmed envelope was used as an aspect-preserving fit boundary.`
    : `Printed room dimensions disagree with the requested boundary by ${Math.round(scaleConflict * 100)}%; the printed image dimensions were preserved.`);
  if (requestedRoomLabels.length && roomTextTags.length < requestedRoomLabels.length * 0.6) warnings.push(`Only ${roomTextTags.length} of ${requestedRoomLabels.length} requested room labels were read directly from the image.`);
  if (requestedRoomLabels.length && spaces.length < requestedRoomLabels.length * 0.6) warnings.push(`Only ${spaces.length} enclosed spaces were recovered for ${requestedRoomLabels.length} requested room labels; review room topology before import.`);
  if (!windows.length && exteriorRecords.length >= 2) warnings.push('No exterior opening had a reliable window-frame signature; review openings before import.');
  if (usableSegments.length + freeformWalls.length > 90) warnings.push('The image contains a dense wall network; fixture or furniture strokes may still need cleanup.');
  if (enclosureRepairMode === 'junctions') warnings.push('Small disconnected wall junctions were closed locally to recover enclosed rooms.');
  if (enclosureRepairMode === 'shell') warnings.push('The detected outer wall was locally reinforced to preserve the generated plan instead of discarding it.');
  const evidencedOpeningCount = doors.length + windows.length + openings.length;
  const confidence: NonNullable<GeneratedData['extractionDiagnostics']>['confidence'] =
    roomSlabEnclosureIncomplete
      ? (walls.length >= 8 || evidencedOpeningCount >= 3 ? 'medium' : 'low')
      : !enclosureRepairMode && roomTextTags.length >= Math.max(2, requestedRoomLabels.length * 0.7) && !!reliableTextScale && usableSegments.length + freeformWalls.length <= 90
        ? 'high'
        : roomTextTags.length || requestedRoomLabels.length
          ? 'medium'
          : 'low';
  const scaleAllowsImport = enforceRequestedEnvelope || !(scaleConflict > 0.75 && (textScaleEstimate?.sampleCount || 0) < 2);
  const canImport = roomSlabEnclosureIncomplete
    ? scaleAllowsImport && walls.length >= 3
    : scaleAllowsImport;

  return {
    boundary,
    walls,
    doors,
    windows,
    openings,
    rooms,
    columns,
    stairs,
    slabs,
    railings,
    furniture: [],
    fixtures: [],
    extractionDiagnostics: {
      confidence,
      canImport,
      scaleSource,
      warnings,
      detectedRoomLabels: roomTextTags.length,
      requestedRoomLabels: requestedRoomLabels.length,
      metrics: {
        wallCount: walls.length,
        enclosedSpaceCount: spaces.length,
        detectedDoorCount: doors.length,
        detectedWindowCount: windows.length,
        detectedOpeningCount: openings.length,
        unresolvedRoomLabels: Math.max(0, requestedRoomLabels.length - roomTextTags.length),
        envelopeAspectConflict,
      },
      ocr: { status: ocrStatus, observationCount: textObservations.length, durationMs: options.ocrDurationMs },
      topologyRepairMode: enclosureRepairMode || 'none',
    },
  };
};
