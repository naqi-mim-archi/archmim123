import type { Point } from '../types';
import type { GeneratedData } from '../components/generative-wizard/types';
import { recognizeFloorplanText4e, type FloorplanTextObservation } from './localFloorplanOcr4e';

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
  /** Text 4.0 E uses its confirmed width and depth as independent, authoritative axes. */
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
  base64Eata: string,
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
          const ocrTask = recognizeFloorplanText4e(canvas);
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
              console.warn('[Text 4.0 E] Early raster preview was unavailable; continuing to final digitization.', error);
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
              console.warn(`[Text 4.0 E] Local OCR exceeded its ${budgetMs}ms budget; continuing with raster and design-brief signals.`);
              textObservations = [];
              ocrStatus = 'timed-out';
            } else {
              textObservations = result;
              ocrStatus = 'completed';
            }
          } catch (error) {
            ocrDurationMs = performance.now() - ocrStartedAt;
            console.warn('[Text 4.0 E] Local OCR was unavailable; continuing with raster and design-brief signals.', error);
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
    image.src = base64Eata.startsWith('data:image') ? base64Eata : `data:image/png;base64,${base64Eata}`;
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
  /** Wall-band merging stopped before a matching visible leaf/arc hinge. */
  offsetHinge?: boolean;
  /** Raster-axis offset from the detected gap endpoint to the visible hinge. */
  hingeOffset?: number;
  /** A near-closed leaf visually bridged the aperture along the host wall. */
  closedLeaf?: boolean;
}

const detectDoorSwing = (
  gap: PixelGap,
  darkMask: Uint8Array,
  width: number,
  height: number,
  endpointSearchScale = 1,
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
            if (strokeEnd - strokeStart + 1 > Math.max(4, gap.thickness * 0.65)) {
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
            if (strokeEnd - strokeStart + 1 > Math.max(4, gap.thickness * 0.65)) {
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
      for (const radiusScale of [0.84, 0.94, 1.04]) {
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

const detectBestDoorSwing = (
  gap: PixelGap,
  darkMask: Uint8Array,
  width: number,
  height: number,
) => {
  const leaf = detectDoorSwing(gap, darkMask, width, height);
  const arc = detectDoorSwingArc(gap, darkMask, width, height);
  const centered = leaf.confidence >= arc.confidence ? leaf : arc;
  if (centered.detected) return centered;
  if (gap.end - gap.start > gap.thickness * 8) return centered;

  // Raster wall-band merging can stop a few pixels before the actual hinge.
  // Search farther only when a straight leaf is found, then require a matching
  // jamb-centred quarter-circle at that exact offset. Neither dimensions nor a
  // bare hosted gap can activate this recovery.
  const offsetLeaf = detectDoorSwing(gap, darkMask, width, height, 2);
  const hingeOffset = offsetLeaf.hingeOffset || 0;
  const minimumOffset = Math.max(2, Math.ceil(gap.thickness));
  if (!offsetLeaf.detected || Math.abs(hingeOffset) <= minimumOffset) return centered;
  const offsetArc = detectDoorSwingArc(gap, darkMask, width, height, {
    endpoint: offsetLeaf.isFlipped ? 'end' : 'start',
    hingeOffset,
  });
  if (!offsetArc.detected) return centered;
  return {
    ...offsetLeaf,
    confidence: Math.min(offsetLeaf.confidence, offsetArc.confidence),
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
const recoverClosedSwingDoorGaps = (
  hostSegments: PixelSegment[],
  symbolSegments: PixelSegment[],
  typicalThickness: number,
  cleanDoorMask: Uint8Array,
  originalMask: Uint8Array,
  width: number,
  height: number,
) => {
  const candidates: PixelGap[] = [];
  const maximumLeafThickness = Math.max(3, typicalThickness * 0.7);
  const minimumNormalOffset = Math.max(2, typicalThickness * 0.35);
  const maximumNormalOffset = Math.max(minimumNormalOffset, typicalThickness * 1.8);
  const hostMargin = Math.max(4, typicalThickness * 1.25);

  symbolSegments.forEach(leaf => {
    const leafLength = leaf.end - leaf.start;
    if (leaf.thickness < 2
      || leaf.thickness > maximumLeafThickness
      || leafLength < typicalThickness * 2.5
      || leafLength > typicalThickness * 8) return;

    const hosts = hostSegments.filter(host => host.axis === leaf.axis
      && host.thickness >= typicalThickness * 0.45
      && leaf.thickness >= host.thickness * 0.35
      && leafLength >= host.thickness * 2.8
      && Math.min(host.end, leaf.end) - Math.max(host.start, leaf.start) >= leafLength * 0.55
      && Math.abs(host.line - leaf.line) >= minimumNormalOffset
      && Math.abs(host.line - leaf.line) <= maximumNormalOffset);

    hosts.forEach(host => {
      const gap: PixelGap = {
        axis: host.axis,
        line: host.line,
        start: leaf.start,
        end: leaf.end,
        thickness: host.thickness,
      };
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
      if (beforeSupport < 0.72 || afterSupport < 0.72) return;
      const ink = wallBandInkRatio(gap, originalMask, width, height, typicalThickness);
      if (ink < 0.52) return;
      const arc = detectDoorSwingArc(gap, cleanDoorMask, width, height);
      if (!arc.detected) return;
      const leafSide = leaf.line < host.line ? -1 : 1;
      const expectedFacing = gap.axis === 'horizontal' ? leafSide < 0 : leafSide > 0;
      if (arc.facingFlipped !== expectedFacing) return;

      const hingeAlong = arc.isFlipped ? gap.end : gap.start;
      const hingeConnector = gap.axis === 'horizontal'
        ? lineDarkSupport(cleanDoorMask, width, height,
          { x: hingeAlong, y: host.line }, { x: hingeAlong, y: leaf.line }, 1)
        : lineDarkSupport(cleanDoorMask, width, height,
          { x: host.line, y: hingeAlong }, { x: leaf.line, y: hingeAlong }, 1);
      if (hingeConnector < 0.72) return;

      gap.closedSwingEvidence = {
        ...arc,
        arcOnly: false,
        closedLeaf: true,
        confidence: Math.min(0.86, Math.max(0.82, arc.confidence)),
      };
      candidates.push(gap);
    });
  });
  return deduplicatePixelGaps(candidates, typicalThickness);
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
  const minimumPanel = gapLength * 0.24;
  const maximumPanel = gapLength * 0.92;
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
    const firstCenter = (first.start + first.end) / 2;
    const secondCenter = (second.start + second.end) / 2;
    const union = Math.max(first.end, second.end) - Math.min(first.start, second.start) + 1;
    const overlap = Math.max(0, Math.min(first.end, second.end) - Math.max(first.start, second.start) + 1);
    const shorter = Math.min(first.end - first.start + 1, second.end - second.start + 1);
      const qualifies = Math.abs(firstCenter - secondCenter) >= gapLength * 0.08
      && union >= gapLength * 0.68
      && overlap / Math.max(1, shorter) <= 0.85;
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
) => {
  if (gap.closedSwingEvidence) {
    return {
      doorSwing: gap.closedSwingEvidence,
      slidingEvidence: { detected: false, normalDirection: 1 as const, confidence: 0 },
      foldingEvidence: { detected: false, normalDirection: 1 as const, confidence: 0 },
      windowFrame: false,
      windowFrameSupport: 0,
    };
  }
  const cleanSwing = detectBestDoorSwing(gap, cleanMask, width, height);
  const cleanWeakSwing = cleanSwing.detected
    ? cleanSwing
    : detectWeakInkDoorSwing(gap, cleanDoorMask, width, height);
  const cleanSliding = detectSlidingDoorPanels(gap, cleanMask, width, height);
  const cleanFolding = detectFoldingDoor(gap, cleanMask, width, height);
  const cleanWindowSupport = parallelWindowFrameSupport(gap, cleanMask, width, height);
  const cleanWindow = cleanWindowSupport >= 0.62;
  if (gapOverlapsRecognizedText(gap, observations, typicalThickness)) {
    return {
      doorSwing: cleanWeakSwing,
      slidingEvidence: cleanSliding,
      foldingEvidence: cleanFolding,
      windowFrame: cleanWindow,
      windowFrameSupport: cleanWindowSupport,
    };
  }
  const originalSwing = detectBestDoorSwing(gap, originalMask, width, height);
  const originalWeakSwing = originalSwing.detected
    ? originalSwing
    : detectWeakInkDoorSwing(gap, originalDoorMask, width, height);
  const originalSliding = detectSlidingDoorPanels(gap, originalMask, width, height);
  const originalFolding = detectFoldingDoor(gap, originalMask, width, height);
  const originalWindowSupport = parallelWindowFrameSupport(gap, originalMask, width, height);
  return {
    doorSwing: originalWeakSwing.confidence > cleanWeakSwing.confidence ? originalWeakSwing : cleanWeakSwing,
    slidingEvidence: originalSliding.confidence > cleanSliding.confidence ? originalSliding : cleanSliding,
    foldingEvidence: originalFolding.confidence > cleanFolding.confidence ? originalFolding : cleanFolding,
    windowFrame: cleanWindow || originalWindowSupport >= 0.62,
    windowFrameSupport: Math.max(cleanWindowSupport, originalWindowSupport),
  };
};

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
  const lineTolerance = Math.max(2, typicalThickness * 3);
  for (const axis of ['horizontal', 'vertical'] as const) {
    const groups: PixelSegment[][] = [];
    segments.filter(segment => segment.axis === axis).forEach(segment => {
      const group = groups.find(items => Math.abs(median(items.map(item => item.line)) - segment.line) <= lineTolerance);
      if (group) group.push(segment);
      else groups.push([segment]);
    });
    groups.forEach(group => {
      const intervals = [...group].sort((a, b) => a.start - b.start || a.end - b.end);
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
        if (evidence.windowFrame || (evidence.doorSwing.detected && !evidence.doorSwing.arcOnly)
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
    );
    if (!evidence.windowFrame || evidence.doorSwing.detected
      || evidence.slidingEvidence.detected || evidence.foldingEvidence.detected) return;
    candidates.push(gap);
  });
  return deduplicatePixelGaps(candidates, typicalThickness);
};

const recoverHollowWindowBands = (
  hostSegments: PixelSegment[],
  pixelScale: { x: number; y: number },
  typicalThickness: number,
  cleanMask: Uint8Array,
  originalMask: Uint8Array,
  width: number,
  height: number,
  observations: FloorplanTextObservation[],
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
      );
      if (!evidence.windowFrame || evidence.doorSwing.detected
        || evidence.slidingEvidence.detected || evidence.foldingEvidence.detected) continue;
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
    if (gap.closedSwingEvidence) {
      duplicate.line = gap.line;
      duplicate.start = gap.start;
      duplicate.end = gap.end;
      duplicate.thickness = Math.max(duplicate.thickness, gap.thickness);
      duplicate.closedSwingEvidence = gap.closedSwingEvidence;
      continue;
    }
    if (duplicate.closedSwingEvidence) continue;
    // Use the narrower observed clear span; anti-aliasing around a thick wall
    // tends to make the same opening look slightly wider on one parallel edge.
    if (gap.end - gap.start < duplicate.end - duplicate.start) {
      duplicate.line = gap.line;
      duplicate.start = gap.start;
      duplicate.end = gap.end;
      duplicate.thickness = Math.max(duplicate.thickness, gap.thickness);
    }
  }
  return unique;
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
    const start = segment.axis === 'horizontal' ? rawBounds.minX : rawBounds.minY;
    const end = segment.axis === 'horizontal' ? rawBounds.maxX : rawBounds.maxY;
    if (existing) {
      existing.start = Math.min(existing.start, start);
      existing.end = Math.max(existing.end, end);
      existing.thickness = Math.max(existing.thickness, segment.thickness);
    } else {
      scanAxes.push({ axis: segment.axis, line: segment.line, start, end, thickness: segment.thickness });
    }
  });
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
  const minimumProjection = typicalThickness * 2.5;
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
 * the geometrically detected projection nearest that label. With no such label
 * the original raster-only detector remains available, preserving the early
 * geometry pass and plans whose balcony text cannot be read.
 */
const selectRailingProjectionsBySpaceEvidence = (
  projections: DetectedRailingProjection[],
  roomTextTags: RoomTextTag[],
  wallBounds: PixelBounds,
  typicalThickness: number,
) => {
  const openSpaceTags = roomTextTags.filter(tag => /balcony|terrace|loggia|porch|deck/i.test(tag.label));
  if (!projections.length) return projections;
  if (!openSpaceTags.length) {
    return projections.filter(projection => {
      const projectionDepth = projection.side === 'left' || projection.side === 'right'
        ? projection.bounds.maxX - projection.bounds.minX
        : projection.bounds.maxY - projection.bounds.minY;
      const frameNormalSpan = projection.side === 'left' || projection.side === 'right'
        ? wallBounds.maxX - wallBounds.minX
        : wallBounds.maxY - wallBounds.minY;
      // Dimension lines sit only one or two wall weights beyond the facade.
      // An unlabeled permanent projection must have usable physical depth.
      return projectionDepth >= Math.max(typicalThickness * 4, frameNormalSpan * 0.1);
    });
  }
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
  const thinLimit = Math.max(3, typicalThickness * 0.45);
  const boundaryTolerance = Math.max(3, typicalThickness * 1.4);
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
      return segment.axis === 'horizontal'
        ? segment.line < bounds.minY - boundaryTolerance
          || segment.line > bounds.maxY + boundaryTolerance
          || Math.abs(segment.line - bounds.minY) <= boundaryTolerance
          || Math.abs(segment.line - bounds.maxY) <= boundaryTolerance
          || segment.start < bounds.minX - boundaryTolerance
          || segment.end > bounds.maxX + boundaryTolerance
        : segment.line < bounds.minX - boundaryTolerance
          || segment.line > bounds.maxX + boundaryTolerance
          || Math.abs(segment.line - bounds.minX) <= boundaryTolerance
          || Math.abs(segment.line - bounds.maxX) <= boundaryTolerance
          || segment.start < bounds.minY - boundaryTolerance
          || segment.end > bounds.maxY + boundaryTolerance;
    }), Math.max(2, typicalThickness * 0.25));
    const seed = [...candidates].sort((a, b) =>
      pointDistance(tag, a) - pointDistance(tag, b)
      || (b.end - b.start) - (a.end - a.start))[0];
    if (!seed) return;
    const selected = [seed];
    let expanded = true;
    while (expanded && selected.length < 3) {
      expanded = false;
      const next = candidates.filter(candidate => !selected.includes(candidate))
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
  return recovered;
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

/** Pure raster-to-geometry rule engine used by Text 4.0 E. */
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
  const darkMask = removeRecognizedTextFromMask(originalDarkMask, width, height, textObservations);
  const originalDoorEvidenceMask = createDoorEvidenceMask(image);
  const doorEvidenceMask = removeRecognizedTextFromMask(originalDoorEvidenceMask, width, height, textObservations);
  const minimumRun = Math.max(12, Math.round(Math.min(width, height) * 0.025));
  const rawSegments = [
    ...extractDirectionalBands(darkMask, width, height, 'horizontal', minimumRun),
    ...extractDirectionalBands(darkMask, width, height, 'vertical', minimumRun),
  ];
  const symbolMinimumRun = Math.max(8, Math.round(Math.min(width, height) * 0.012));
  const symbolSegments = [
    ...extractDirectionalBands(darkMask, width, height, 'horizontal', symbolMinimumRun, 1),
    ...extractDirectionalBands(darkMask, width, height, 'vertical', symbolMinimumRun, 1),
  ];
  const doorSymbolSegments = [
    ...extractDirectionalBands(doorEvidenceMask, width, height, 'horizontal', symbolMinimumRun, 1),
    ...extractDirectionalBands(doorEvidenceMask, width, height, 'vertical', symbolMinimumRun, 1),
  ];
  if (rawSegments.length < 4) {
    throw new Error('Local extraction found no usable wall network. Regenerate a clean, high-contrast orthogonal floor plan.');
  }

  const typicalThickness = estimateTypicalWallThickness(rawSegments);
  const minimumStructuralThickness = Math.max(3, typicalThickness * 0.38);
  const structuralSegments = rawSegments.filter(segment => segment.thickness >= minimumStructuralThickness);
  if (structuralSegments.length < 4) {
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
  const ordinaryPreRetentionSymbolGaps = recoverSymbolSupportedGaps(
    lengthFilteredSegments,
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
    lengthFilteredSegments,
    doorSymbolSegments,
    typicalThickness,
    doorEvidenceMask,
    originalDarkMask,
    width,
    height,
  );
  const preRetentionSymbolGaps = deduplicatePixelGaps([
    ...ordinaryPreRetentionSymbolGaps,
    ...closedSwingDoorGaps,
  ], typicalThickness);
  // Window and door symbols can split one facade into separate connected
  // components. Bridge only symbol-evidenced gaps before selecting the main
  // architectural network, while preserving each gap for hosted elements.
  const networkConnectedSegments = mergeWallsAcrossHostedGaps(
    lengthFilteredSegments,
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
  if (usableSegments.length < 4) {
    throw new Error('Local extraction rejected the detected strokes as annotation noise rather than architectural walls.');
  }
  if (!componentSheetMode) {
    usableSegments = recoverMissingFacadeWallRuns(
      usableSegments,
      originalDarkMask,
      width,
      height,
      typicalThickness,
    );
  }

  let { barrier } = rasterizeWalls(usableSegments, width, height, typicalThickness);
  let preliminaryFlood = floodSpaces(barrier, width, height, preliminaryScale);
  let enclosureRepairMode: 'junctions' | 'shell' | undefined;
  if (!componentSheetMode && !preliminaryFlood.spaces.length) {
    const repaired = repairEnclosureTopology(usableSegments, width, height, preliminaryScale, typicalThickness);
    usableSegments = repaired.segments;
    barrier = repaired.barrier;
    preliminaryFlood = repaired.flood;
    enclosureRepairMode = repaired.mode;
  }
  if (!componentSheetMode && !preliminaryFlood.spaces.length) {
    throw new Error('The local enclosure repair could not recover a usable plan envelope.');
  }
  const wallBounds = segmentBounds(usableSegments);
  const frameAxisBounds = wallAxisBounds(usableSegments, wallBounds);
  const detectedPixelColumns = componentSheetMode
    ? detectIsolatedComponentColumns(usableSegments, typicalThickness, darkMask, width, height)
    : detectCornerColumns(darkMask, width, height, wallBounds, typicalThickness, usableSegments);
  const detectedPixelStairs = componentSheetMode ? isolatedStairEvidence : detectLinearStairs(symbolSegments, typicalThickness);
  const detectedRailingProjections = selectRailingProjectionsBySpaceEvidence(
    detectRailingProjections(
      darkMask, width, height, symbolSegments, frameAxisBounds, typicalThickness,
    ),
    roomTextTags,
    frameAxisBounds,
    typicalThickness,
  );
  const rectangularWallFrame = !componentSheetMode && hasCompleteRectangularWallFrame(usableSegments, frameAxisBounds, typicalThickness);
  let footprintPixels = componentSheetMode
    ? rectangularFootprint(frameAxisBounds)
    : rectangularWallFrame
    ? rectangularFootprint(frameAxisBounds)
    : validateFootprint(
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
    footprintPixels = validateFootprint(
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
  const propertyPixelBounds = detectedRailingProjections.reduce<PixelBounds>((bounds, projection) => ({
    minX: Math.min(bounds.minX, projection.bounds.minX),
    maxX: Math.max(bounds.maxX, projection.bounds.maxX),
    minY: Math.min(bounds.minY, projection.bounds.minY),
    maxY: Math.max(bounds.maxY, projection.bounds.maxY),
  }), { ...wallFacePixelBounds });
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
  const useEvidencedFixedBounds = detectedPixelColumns.length > 0 || detectedRailingProjections.length > 0;
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

  const finalFlood = floodSpaces(barrier, width, height, finalScale);
  let outputWallSegments = canonicalizeWallsAtDetectedColumns(
    usableSegments,
    detectedPixelColumns,
    typicalThickness,
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
        const hasSymbol = evidence.windowFrame || (evidence.doorSwing.detected && !evidence.doorSwing.arcOnly)
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
  );
  const recoveredHollowWindowGaps = recoverHollowWindowBands(
    usableSegments,
    finalScale,
    typicalThickness,
    darkMask,
    originalDarkMask,
    width,
    height,
    textObservations,
  );
  const componentRowGaps = componentSheetMode
    ? enumerateComponentRowGaps(usableSegments, finalScale, typicalThickness)
    : [];
  const existingHostedGapCandidates = [
    ...gaps.filter(gap => componentSheetMode || usableSegments.some(segment => segment.axis === gap.axis &&
      Math.abs(segment.line - gap.line) <= Math.max(2, typicalThickness) &&
      gap.start >= segment.start - 2 && gap.end <= segment.end + 2)),
    ...recoveredSymbolGaps,
    ...componentRowGaps,
    ...preRetentionSymbolGaps.filter(gap => componentSheetMode || usableSegments.some(segment => segment.axis === gap.axis
      && Math.abs(segment.line - gap.line) <= Math.max(2, typicalThickness * 2)
      && gap.start >= segment.start - typicalThickness && gap.end <= segment.end + typicalThickness)),
  ];
  const novelEmbeddedWindowGaps = [...recoveredEmbeddedWindowGaps, ...recoveredHollowWindowGaps].filter(gap => !existingHostedGapCandidates.some(candidate => {
    if (candidate.axis !== gap.axis || Math.abs(candidate.line - gap.line) > typicalThickness * 1.5) return false;
    const overlap = Math.min(candidate.end, gap.end) - Math.max(candidate.start, gap.start);
    const shorter = Math.min(candidate.end - candidate.start, gap.end - gap.start);
    return overlap > 0 && overlap / Math.max(1, shorter) >= 0.55;
  }));
  const candidateHostedGaps = deduplicatePixelGaps([
    ...existingHostedGapCandidates,
    ...novelEmbeddedWindowGaps,
  ], typicalThickness);
  const hostedGaps = candidateHostedGaps.filter(gap => {
    const inkRatio = wallBandInkRatio(gap, originalDarkMask, width, height, typicalThickness);
    if (!gap.closedSwingEvidence && inkRatio >= 0.58) return false;
    if (gap.closedSwingEvidence) return true;
    const evidence = detectGapSymbolEvidence(
      gap, darkMask, originalDarkMask, width, height, textObservations, typicalThickness,
      doorEvidenceMask, originalDoorEvidenceMask,
    );
    if (evidence.doorSwing.detected || evidence.slidingEvidence.detected || evidence.foldingEvidence.detected) return true;
    return inkRatio < 0.68;
  });
  const distanceToPixelBounds = (tag: RoomTextTag, bounds: PixelBounds) => {
    const dx = tag.x < bounds.minX ? bounds.minX - tag.x : tag.x > bounds.maxX ? tag.x - bounds.maxX : 0;
    const dy = tag.y < bounds.minY ? bounds.minY - tag.y : tag.y > bounds.maxY ? tag.y - bounds.maxY : 0;
    return Math.hypot(dx, dy);
  };
  const openSpaceTagsWithoutProjection = roomTextTags.filter(tag => {
    if (!/balcony|terrace|loggia|porch|deck/i.test(tag.label)) return false;
    return !detectedRailingProjections.some(projection => {
      const span = Math.max(projection.bounds.maxX - projection.bounds.minX, projection.bounds.maxY - projection.bounds.minY);
      return distanceToPixelBounds(tag, projection.bounds) <= Math.max(typicalThickness * 6, span * 0.45);
    });
  });
  const embeddedRailingGaps = new Set<PixelGap>();
  openSpaceTagsWithoutProjection.forEach(tag => {
    const nearest = hostedGaps.flatMap(gap => {
      const envelopeExtreme = gap.axis === 'horizontal'
        ? Math.abs(gap.line - frameAxisBounds.minY) <= typicalThickness * 1.5
          || Math.abs(gap.line - frameAxisBounds.maxY) <= typicalThickness * 1.5
        : Math.abs(gap.line - frameAxisBounds.minX) <= typicalThickness * 1.5
          || Math.abs(gap.line - frameAxisBounds.maxX) <= typicalThickness * 1.5;
      if (!envelopeExtreme) return [];
      const along = gap.axis === 'horizontal' ? tag.x : tag.y;
      const normal = gap.axis === 'horizontal' ? tag.y : tag.x;
      const span = gap.end - gap.start;
      if (along < gap.start - span * 0.15 || along > gap.end + span * 0.15) return [];
      const normalDistance = Math.abs(normal - gap.line);
      if (normalDistance > Math.max(typicalThickness * 6, span * 0.85)) return [];
      const evidence = detectGapSymbolEvidence(
        gap, darkMask, originalDarkMask, width, height, textObservations, typicalThickness,
        doorEvidenceMask, originalDoorEvidenceMask,
      );
      if ((evidence.doorSwing.detected && !evidence.windowFrame) || evidence.foldingEvidence.detected
        || wallBandInkRatio(gap, originalDarkMask, width, height, typicalThickness) >= 0.55) return [];
      return [{ gap, distance: normalDistance }];
    }).sort((a, b) => a.distance - b.distance)[0];
    if (nearest) embeddedRailingGaps.add(nearest.gap);
  });
  const architecturalHostedGaps = hostedGaps.filter(gap => !embeddedRailingGaps.has(gap));
  outputWallSegments = mergeWallsAcrossHostedGaps(outputWallSegments, architecturalHostedGaps, typicalThickness);
  outputWallSegments = mergeTouchingCollinearWallSegments(outputWallSegments, finalScale, typicalThickness);
  outputWallSegments = outputWallSegments.filter(segment =>
    (segment.end - segment.start) * (segment.axis === 'horizontal' ? finalScale.x : finalScale.y) > 0.35);
  const walls: NonNullable<GeneratedData['walls']> = outputWallSegments.map(segment => {
    const envelopeExtreme = segment.axis === 'horizontal'
      ? Math.abs(segment.line - frameAxisBounds.minY) <= typicalThickness * 1.5 || Math.abs(segment.line - frameAxisBounds.maxY) <= typicalThickness * 1.5
      : Math.abs(segment.line - frameAxisBounds.minX) <= typicalThickness * 1.5 || Math.abs(segment.line - frameAxisBounds.maxX) <= typicalThickness * 1.5;
    const exterior = envelopeExtreme || isGapOnFootprintEdge(segment, footprintPixels, typicalThickness * 1.8);
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
  const gapRecords = architecturalHostedGaps.map(gap => {
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
    );
    const doorSwing = symbolEvidence.doorSwing;
    const slidingEvidence = symbolEvidence.slidingEvidence;
    const foldingEvidence = symbolEvidence.foldingEvidence;
    const windowFrame = symbolEvidence.windowFrame;
    const windowFrameSupport = symbolEvidence.windowFrameSupport;
    const rawWidthMeters = (gap.end - gap.start)
      * (gap.axis === 'horizontal' ? finalScale.x : finalScale.y);
    // A folding leaf is a distinct chevron in an otherwise open wall gap. A
    // parallel frame is authoritative window evidence and must win over an
    // accidental V formed by glazing bars, fixtures, or nearby text.
    const foldingDoor = foldingEvidence.detected
      && (!windowFrame || (windowFrameSupport < 0.8 && foldingEvidence.confidence >= 0.9))
      && rawWidthMeters <= 2.4;
    const slidingDoor = slidingEvidence.detected
      && !foldingDoor
      && rawWidthMeters >= 0.8
      && rawWidthMeters <= 3.2;
    const swingDoorWidthLimit = doorSwing.endpointCount >= 2 ? 2.4 : 1.4;
    const doorStroke = doorSwing.detected && rawWidthMeters <= swingDoorWidthLimit;
    // Band merging stops framed openings a few raster pixels inside the actual
    // jamb faces. Restore that symmetric frame inset only when a door/window
    // symbol is visibly present; bare wall openings already span face to face.
    const framedInsetPixels = doorStroke || slidingDoor || foldingDoor || windowFrame
      ? typicalThickness * 0.38
      : 0;
    const widthMeters = (gap.end - gap.start + framedInsetPixels)
      * (gap.axis === 'horizontal' ? finalScale.x : finalScale.y);
    const position = gap.axis === 'horizontal' ? mapPoint(midpoint, gap.line) : mapPoint(gap.line, midpoint);
    return {
      gap,
      exterior,
      doorSwing,
      doorStroke,
      slidingDoor,
      slidingEvidence,
      foldingDoor,
      foldingEvidence,
      windowFrame,
      rejectedDoorSymbol: doorSwing.detected && !doorStroke,
      widthMeters,
      position,
      rotation: gap.axis === 'horizontal' ? 0 : 90,
    };
  }).filter(record => record.widthMeters >= 0.45 && record.widthMeters <= 4.5);

  const doors: NonNullable<GeneratedData['doors']> = [];
  const windows: NonNullable<GeneratedData['windows']> = [];
  const openings: NonNullable<GeneratedData['openings']> = [];
  const exteriorRecords = gapRecords.filter(record => record.exterior);
  const explicitExteriorDoors = exteriorRecords.filter(record =>
    record.foldingDoor || (record.slidingDoor && !record.windowFrame) || (record.doorStroke && !record.windowFrame));
  const exteriorHasSwingEntry = exteriorRecords.some(record => record.doorStroke && !record.windowFrame);
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
  const entryDoorSizedFallbackRecords = exteriorRecords.filter(record =>
    record.widthMeters >= 0.55 && record.widthMeters <= 1.4);
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
  for (const record of gapRecords) {
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
    if (record.rejectedDoorSymbol && record !== entryRecord
      && !record.windowFrame && !record.foldingDoor && !record.slidingDoor) continue;
    if (record.exterior) {
      const exteriorSlidingDoor = effectiveSlidingDoor && (!exteriorHasSwingEntry || record === entryRecord);
      const isDoor = record === entryRecord || record.foldingDoor
        || (exteriorSlidingDoor && !record.windowFrame)
        || (record.doorStroke && !record.windowFrame);
      if (isDoor) {
        const doorType = record.foldingDoor
          ? 'folding'
          : exteriorSlidingDoor
            ? 'sliding'
          : record.doorSwing.endpointCount >= 2 && record.widthMeters >= 1.1
            ? 'double'
            : 'single';
        const parallelEvidence = record.foldingDoor ? record.foldingEvidence : record.slidingEvidence;
        const facingFlipped = record.foldingDoor || record.slidingDoor
          ? record.gap.axis === 'horizontal' ? parallelEvidence.normalDirection < 0 : parallelEvidence.normalDirection > 0
          : record.doorSwing.facingFlipped;
        doors.push({
          levelIndex: 0,
          pos: record.position,
          rotation: record.rotation,
          width: clamp(record.widthMeters, doorType === 'single' ? 0.6 : 0.7, 2.4),
          type: doorType,
          isFlipped: record.doorSwing.isFlipped,
          facingFlipped,
          mandatoryExteriorEntry: record === entryRecord,
          measuredWidth: record.widthMeters,
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
      } else {
        windows.push({
          levelIndex: 0, pos: record.position, rotation: record.rotation, width: record.widthMeters,
          type: 'standard', measuredWidth: record.widthMeters,
          provenance: 'observed',
          evidence: { source: 'raster', confidence: record.windowFrame ? 0.84 : 0.48, pixelBounds: gapPixelBounds },
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
      const doorType = record.foldingDoor
        ? 'folding'
        : effectiveSlidingDoor
          ? 'sliding'
        : record.doorSwing.endpointCount >= 2 && record.widthMeters >= 1.1
          ? 'double'
          : 'single';
      const parallelEvidence = record.foldingDoor ? record.foldingEvidence : record.slidingEvidence;
      const facingFlipped = record.foldingDoor || record.slidingDoor
        ? record.gap.axis === 'horizontal' ? parallelEvidence.normalDirection < 0 : parallelEvidence.normalDirection > 0
        : record.doorSwing.facingFlipped;
      doors.push({
        levelIndex: 0, pos: record.position, rotation: record.rotation,
        width: clamp(record.widthMeters, doorType === 'single' ? 0.6 : 0.7, doorType === 'single' ? 1.2 : 2.4),
        type: doorType,
        isFlipped: record.doorSwing.isFlipped,
        facingFlipped,
        measuredWidth: record.widthMeters,
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
  const projectedRailings: NonNullable<GeneratedData['railings']> = detectedRailingProjections.flatMap(projection =>
    projection.segments.flatMap(segment => {
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
    }));
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
  const recoveredTaggedRailingPixels = existingRailingCount >= 3 ? [] : recoverTaggedRailingSegments(
    symbolSegments,
    roomTextTags,
    frameAxisBounds,
    typicalThickness,
    width,
    height,
  );
  const taggedRailingPixels = existingRailingCount > 0
    && existingRailingCount + recoveredTaggedRailingPixels.length < 3
    ? []
    : recoveredTaggedRailingPixels;
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
  const railings: NonNullable<GeneratedData['railings']> = [...projectedRailings, ...embeddedRailings, ...taggedRailings];

  const spaces = finalFlood.spaces.sort((a, b) => b.areaMeters - a.areaMeters);
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
  const boundary = detectedRailingProjections.length
    ? mappedBoundary
    : outerWallFaceBounds ? fitPolygonToBounds(mappedBoundary, outerWallFaceBounds) : mappedBoundary;
  const slabBoundaryPixels = rectangularWallFrame && detectedRailingProjections.length === 1
    ? rectangularFootprintWithProjection(frameAxisBounds, detectedRailingProjections[0])
    : rectangularWallFrame
      ? rectangularFootprint(frameAxisBounds)
      : footprintPixels.length >= 4 ? footprintPixels : rectangularFootprint(frameAxisBounds);
  const slabBoundary = slabBoundaryPixels.map(point => mapPoint(point.x, point.y));
  const slabs: NonNullable<GeneratedData['slabs']> = componentSheetMode
    ? []
    : [{ levelIndex: 0, boundary: slabBoundary, type: 'floor' }];

  const warnings: string[] = [];
  if (componentSheetMode) warnings.push('Disconnected architectural element sheet detected; isolated presets were preserved without inventing a floor slab or enclosing shell.');
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
  if (usableSegments.length > 70) warnings.push('The image contains a dense wall network; fixture or furniture strokes may still need cleanup.');
  if (enclosureRepairMode === 'junctions') warnings.push('Small disconnected wall junctions were closed locally to recover enclosed rooms.');
  if (enclosureRepairMode === 'shell') warnings.push('The detected outer wall was locally reinforced to preserve the generated plan instead of discarding it.');
  const confidence: NonNullable<GeneratedData['extractionDiagnostics']>['confidence'] =
    !enclosureRepairMode && roomTextTags.length >= Math.max(2, requestedRoomLabels.length * 0.7) && !!reliableTextScale && usableSegments.length <= 70
      ? 'high'
      : roomTextTags.length || requestedRoomLabels.length
        ? 'medium'
        : 'low';
  const canImport = enforceRequestedEnvelope || !(scaleConflict > 0.75 && (textScaleEstimate?.sampleCount || 0) < 2);

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
