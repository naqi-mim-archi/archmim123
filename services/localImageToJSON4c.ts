import type { Point } from '../types';
import type { GeneratedData } from '../components/generative-wizard/types';
import { recognizeFloorplanText4c, type FloorplanTextObservation } from './localFloorplanOcr4c';

type Axis = 'horizontal' | 'vertical';

export interface LocalImageExtractionOptions {
  /** Used when no explicit requested boundary is available. */
  targetSizeMeters?: number;
  /** The requested design boundary. By default, the traced plan is fitted inside it without distortion. */
  requestedBoundary?: Point[];
  /** Text 4.0 C uses its confirmed width and depth as independent, authoritative axes. */
  enforceRequestedEnvelope?: boolean;
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
  /** Internal audit state supplied by the browser wrapper. */
  ocrStatus?: 'disabled' | 'completed' | 'unavailable' | 'provided' | 'timed-out';
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
  base64Data: string,
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
        let textObservations = options.textObservations;
        let ocrStatus: NonNullable<LocalImageExtractionOptions['ocrStatus']> = options.ocrStatus
          || (options.disableOcr ? 'disabled' : textObservations ? 'provided' : 'unavailable');
        let ocrDurationMs = options.ocrDurationMs;
        if (!textObservations && !options.disableOcr) {
          const ocrStartedAt = performance.now();
          try {
            const budgetMs = Math.max(100, options.ocrTimeBudgetMs ?? 1200);
            const timeout = Symbol('ocr-timeout');
            const result = await Promise.race([
              recognizeFloorplanText4c(canvas),
              new Promise<typeof timeout>(resolveTimeout => setTimeout(() => resolveTimeout(timeout), budgetMs)),
            ]);
            ocrDurationMs = performance.now() - ocrStartedAt;
            if (result === timeout) {
              console.warn(`[Text 4.0 C] Local OCR exceeded its ${budgetMs}ms budget; continuing with raster and design-brief signals.`);
              textObservations = [];
              ocrStatus = 'timed-out';
            } else {
              textObservations = result;
              ocrStatus = 'completed';
            }
          } catch (error) {
            ocrDurationMs = performance.now() - ocrStartedAt;
            console.warn('[Text 4.0 C] Local OCR was unavailable; continuing with raster and design-brief signals.', error);
            textObservations = [];
            ocrStatus = 'unavailable';
          }
        }
        resolve(extractGeometryFromImageData(context.getImageData(0, 0, width, height), {
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
    image.src = base64Data.startsWith('data:image') ? base64Data : `data:image/png;base64,${base64Data}`;
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

const removeRecognizedTextFromMask = (
  source: Uint8Array,
  width: number,
  height: number,
  observations: FloorplanTextObservation[],
) => {
  if (!observations.length) return source;
  const mask = source.slice();
  for (const observation of observations) {
    const text = observation.text.trim();
    const looksLikeRoomOrDimension = /\b(bed|bedroom|master|primary|guest|living|lounge|dining|kitchen|bath|toilet|powder|wc|ensuite|closet|wardrobe|utility|laundry|balcony|terrace|foyer|entry|hall|corridor|office|study|store|pantry|garage|parking|lobby|reception|family|staff|maid|courtyard)\b/i.test(text)
      || /(?:\d+(?:\.\d+)?\s*(?:m|mm|cm|ft|feet|foot|')|\d+\s*(?:'|\u2032)\s*-?\s*\d*\s*(?:"|\u2033|in)?)/i.test(text);
    if (observation.confidence < 45 || !looksLikeRoomOrDimension) continue;
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
    if (length < minimumRun || length < thickness * 2.5 || thickness > maximumBandThickness) return [];
    // A one-pixel stroke is normally text, furniture, a dimension line, or a
    // door-swing symbol. Keep it as opening evidence, but never promote it to
    // a structural wall.
    if (thickness < 2 || solidity < 0.48) return [];
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

const isOutsideAt = (outside: Uint8Array, width: number, height: number, x: number, y: number) => {
  const px = Math.round(x), py = Math.round(y);
  return px < 0 || py < 0 || px >= width || py >= height || outside[py * width + px] === 1;
};

const isExteriorSegment = (
  segment: PixelSegment,
  outside: Uint8Array,
  width: number,
  height: number,
  sampleOffset: number,
) => {
  let exteriorVotes = 0;
  for (const fraction of [0.2, 0.5, 0.8]) {
    const along = segment.start + (segment.end - segment.start) * fraction;
    const first = segment.axis === 'horizontal'
      ? isOutsideAt(outside, width, height, along, segment.line - sampleOffset)
      : isOutsideAt(outside, width, height, segment.line - sampleOffset, along);
    const second = segment.axis === 'horizontal'
      ? isOutsideAt(outside, width, height, along, segment.line + sampleOffset)
      : isOutsideAt(outside, width, height, segment.line + sampleOffset, along);
    if (first !== second) exteriorVotes++;
  }
  return exteriorVotes >= 2;
};

const hasPerpendicularDoorStroke = (
  gap: PixelGap,
  darkMask: Uint8Array,
  width: number,
  height: number,
) => {
  const gapLength = gap.end - gap.start;
  const minimumStroke = Math.max(4, gapLength * 0.32);
  const maximumStroke = gapLength * 1.55;
  const normalReach = Math.ceil(gapLength * 1.25);
  const endSearch = Math.max(2, Math.ceil(gap.thickness));
  const candidateAlong: number[] = [];
  for (let offset = -endSearch; offset <= endSearch; offset++) {
    candidateAlong.push(Math.round(gap.start + offset), Math.round(gap.end + offset));
  }
  for (const along of candidateAlong) {
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
          if (runStart <= gap.line + gap.thickness && runEnd >= gap.line - gap.thickness && length >= minimumStroke && length <= maximumStroke) return true;
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
          if (runStart <= gap.line + gap.thickness && runEnd >= gap.line - gap.thickness && length >= minimumStroke && length <= maximumStroke) return true;
          runStart = -1;
        }
      }
    }
  }
  return false;
};

const hasParallelWindowFrame = (
  gap: PixelGap,
  darkMask: Uint8Array,
  width: number,
  height: number,
) => {
  const from = Math.ceil(gap.start + Math.max(1, gap.thickness * 0.2));
  const to = Math.floor(gap.end - Math.max(1, gap.thickness * 0.2));
  if (to - from < 4) return false;
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
  return bestSupport >= 0.62;
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
  if (/balcony|terrace/i.test(name)) return 'Balcony';
  if (/laundry/i.test(name)) return 'Laundry';
  if (/pantry/i.test(name)) return 'Pantry';
  if (/study|office|workspace/i.test(name)) return 'Study';
  if (/store|storage|utility/i.test(name)) return 'Storage';
  if (/garage/i.test(name)) return 'Garage';
  return name.replace(/^\d+\s*/, '').trim();
};

const ROOM_TEXT_PATTERN = /master|primary|secondary|guest\s*bed|bed\s*room|bedroom|ensuite|bath|powder|owder\s*room|toilet|washroom|living|lounge|family\s*room|dining|kitchen|foyer|entry|entrance|reception|corridor|hallway|passage|walk.?in|\bw\.?i\.?c\.?\b|closet|wardrobe|balcony|terrace|laundry|pantry|study|office|workspace|store|storage|utility|garage/i;

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

/** Pure raster-to-geometry rule engine used by Text 4.0 C. */
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
  const minimumRun = Math.max(12, Math.round(Math.min(width, height) * 0.025));
  const rawSegments = [
    ...extractDirectionalBands(darkMask, width, height, 'horizontal', minimumRun),
    ...extractDirectionalBands(darkMask, width, height, 'vertical', minimumRun),
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
  let usableSegments = retainMainWallNetwork(lengthFilteredSegments, preliminaryScale, typicalThickness);
  if (usableSegments.length < 4) {
    throw new Error('Local extraction rejected the detected strokes as annotation noise rather than architectural walls.');
  }

  let { barrier, radius } = rasterizeWalls(usableSegments, width, height, typicalThickness);
  let preliminaryFlood = floodSpaces(barrier, width, height, preliminaryScale);
  let enclosureRepairMode: 'junctions' | 'shell' | undefined;
  if (!preliminaryFlood.spaces.length) {
    const repaired = repairEnclosureTopology(usableSegments, width, height, preliminaryScale, typicalThickness);
    usableSegments = repaired.segments;
    barrier = repaired.barrier;
    radius = repaired.radius;
    preliminaryFlood = repaired.flood;
    enclosureRepairMode = repaired.mode;
  }
  if (!preliminaryFlood.spaces.length) {
    throw new Error('The local enclosure repair could not recover a usable plan envelope.');
  }
  const wallBounds = segmentBounds(usableSegments);
  const footprintPixels = validateFootprint(
    traceFootprint(barrier, preliminaryFlood.outside, width, height),
    wallBounds,
    typicalThickness,
  );
  const footprintBounds: PixelBounds = footprintPixels.length >= 4 ? {
    minX: Math.min(...footprintPixels.map(point => point.x)),
    maxX: Math.max(...footprintPixels.map(point => point.x)),
    minY: Math.min(...footprintPixels.map(point => point.y)),
    maxY: Math.max(...footprintPixels.map(point => point.y)),
  } : wallBounds;
  const requestedBounds = getBoundaryBounds(options.requestedBoundary);
  const requestedRoomLabels = parseRequestedRoomNames(options.designSummary);
  const targetSize = options.targetSizeMeters || DEFAULT_TARGET_SIZE_METERS;
  const pixelWidth = Math.max(1, footprintBounds.maxX - footprintBounds.minX);
  const pixelHeight = Math.max(1, footprintBounds.maxY - footprintBounds.minY);
  const uniformScale = targetSize / Math.max(pixelWidth, pixelHeight);
  const requestedScale = requestedBounds ? Math.min(
    (requestedBounds.maxX - requestedBounds.minX) / pixelWidth,
    (requestedBounds.maxY - requestedBounds.minY) / pixelHeight,
  ) : undefined;
  const textScaleEstimate = estimateScaleFromRoomText(roomTextTags, usableSegments, typicalThickness);
  const reliableTextScale = textScaleEstimate && (textScaleEstimate.sampleCount >= 2 || textScaleEstimate.confidence >= 48)
    ? textScaleEstimate.scale
    : undefined;
  const enforceRequestedEnvelope = !!(options.enforceRequestedEnvelope && requestedBounds);
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
  const finalUniformScale = enforceRequestedEnvelope ? (requestedScale ?? scale) : scale;
  const finalScale = { x: finalUniformScale, y: finalUniformScale };
  const targetMinX = requestedBounds
    ? requestedBounds.minX + ((requestedBounds.maxX - requestedBounds.minX) - pixelWidth * finalScale.x) / 2
    : -(pixelWidth * finalScale.x) / 2;
  const targetMaxY = requestedBounds
    ? requestedBounds.maxY - ((requestedBounds.maxY - requestedBounds.minY) - pixelHeight * finalScale.y) / 2
    : (pixelHeight * finalScale.y) / 2;
  const mapX = (x: number) => targetMinX + (x - footprintBounds.minX) * finalScale.x;
  const mapY = (y: number) => targetMaxY - (y - footprintBounds.minY) * finalScale.y;
  const mapPoint = (x: number, y: number) => [mapX(x), mapY(y)];

  const finalFlood = floodSpaces(barrier, width, height, finalScale);
  const sampleOffset = radius + 2;
  const walls: NonNullable<GeneratedData['walls']> = usableSegments.map(segment => ({
    levelIndex: 0,
    p1: segment.axis === 'horizontal' ? mapPoint(segment.start, segment.line) : mapPoint(segment.line, segment.start),
    p2: segment.axis === 'horizontal' ? mapPoint(segment.end, segment.line) : mapPoint(segment.line, segment.end),
    type: isExteriorSegment(segment, finalFlood.outside, width, height, sampleOffset) ? 'exterior' : 'interior',
    provenance: 'observed',
    evidence: {
      source: 'raster',
      confidence: clamp(0.62 + Math.min(0.28, segment.thickness / Math.max(1, typicalThickness) * 0.14), 0, 0.9),
      pixelBounds: segment.axis === 'horizontal'
        ? { x0: segment.start, y0: segment.line - segment.thickness / 2, x1: segment.end, y1: segment.line + segment.thickness / 2 }
        : { x0: segment.line - segment.thickness / 2, y0: segment.start, x1: segment.line + segment.thickness / 2, y1: segment.end },
    },
  }));

  const hostedGaps = deduplicatePixelGaps(gaps.filter(gap => usableSegments.some(segment => segment.axis === gap.axis &&
    Math.abs(segment.line - gap.line) <= Math.max(2, typicalThickness) &&
    gap.start >= segment.start - 2 && gap.end <= segment.end + 2)), typicalThickness);
  const gapRecords = hostedGaps.map(gap => {
    const midpoint = (gap.start + gap.end) / 2;
    const firstOutside = gap.axis === 'horizontal'
      ? isOutsideAt(finalFlood.outside, width, height, midpoint, gap.line - sampleOffset)
      : isOutsideAt(finalFlood.outside, width, height, gap.line - sampleOffset, midpoint);
    const secondOutside = gap.axis === 'horizontal'
      ? isOutsideAt(finalFlood.outside, width, height, midpoint, gap.line + sampleOffset)
      : isOutsideAt(finalFlood.outside, width, height, gap.line + sampleOffset, midpoint);
    const exterior = firstOutside !== secondOutside || (firstOutside && secondOutside);
    const doorStroke = hasPerpendicularDoorStroke(gap, darkMask, width, height);
    const windowFrame = hasParallelWindowFrame(gap, darkMask, width, height);
    const widthMeters = (gap.end - gap.start) * (gap.axis === 'horizontal' ? finalScale.x : finalScale.y);
    const position = gap.axis === 'horizontal' ? mapPoint(midpoint, gap.line) : mapPoint(gap.line, midpoint);
    return { gap, exterior, doorStroke, windowFrame, widthMeters, position, rotation: gap.axis === 'horizontal' ? 0 : 90 };
  }).filter(record => record.widthMeters >= 0.45 && record.widthMeters <= 4.5);

  const doors: NonNullable<GeneratedData['doors']> = [];
  const windows: NonNullable<GeneratedData['windows']> = [];
  const openings: NonNullable<GeneratedData['openings']> = [];
  const exteriorRecords = gapRecords.filter(record => record.exterior);
  const explicitExteriorDoors = exteriorRecords.filter(record => record.doorStroke && !record.windowFrame);
  const entryTag = roomTextTags.find(tag => /foyer|entry|entrance|reception/i.test(tag.label));
  const pixelDistanceToEntry = (record: (typeof gapRecords)[number]) => {
    if (!entryTag) return 0;
    const midpoint = (record.gap.start + record.gap.end) / 2;
    const x = record.gap.axis === 'horizontal' ? midpoint : record.gap.line;
    const y = record.gap.axis === 'horizontal' ? record.gap.line : midpoint;
    return Math.hypot(x - entryTag.x, y - entryTag.y);
  };
  const entryRecord = [...(explicitExteriorDoors.length
    ? explicitExteriorDoors
    : exteriorRecords.filter(record => !record.windowFrame).length
      ? exteriorRecords.filter(record => !record.windowFrame)
      : exteriorRecords)]
    .sort((a, b) => {
      if (entryTag) return pixelDistanceToEntry(a) - pixelDistanceToEntry(b);
      if (a.doorStroke !== b.doorStroke) return Number(b.doorStroke) - Number(a.doorStroke);
      const aDoorWidth = Math.abs(a.widthMeters - 0.9), bDoorWidth = Math.abs(b.widthMeters - 0.9);
      return aDoorWidth - bDoorWidth || b.gap.line - a.gap.line;
    })[0];
  for (const record of gapRecords) {
    const gapPixelBounds = record.gap.axis === 'horizontal'
      ? { x0: record.gap.start, y0: record.gap.line - record.gap.thickness / 2, x1: record.gap.end, y1: record.gap.line + record.gap.thickness / 2 }
      : { x0: record.gap.line - record.gap.thickness / 2, y0: record.gap.start, x1: record.gap.line + record.gap.thickness / 2, y1: record.gap.end };
    if (record.exterior) {
      const isDoor = record === entryRecord || (record.doorStroke && !record.windowFrame);
      if (isDoor) {
        doors.push({
          levelIndex: 0,
          pos: record.position,
          rotation: record.rotation,
          width: clamp(record.widthMeters, 0.7, 1.8),
          type: record.widthMeters >= 1.35 ? 'double' : 'single',
          mandatoryExteriorEntry: record === entryRecord,
          measuredWidth: record.widthMeters,
          provenance: 'observed',
          evidence: {
            source: 'raster', confidence: record.doorStroke ? 0.86 : 0.55, pixelBounds: gapPixelBounds,
            ...(!record.doorStroke ? { notes: ['Exterior entry classification inferred from an unframed wall gap.'] } : {}),
          },
        });
      } else {
        windows.push({
          levelIndex: 0, pos: record.position, rotation: record.rotation, width: record.widthMeters,
          type: record.widthMeters >= 1.8 ? 'sliding' : 'standard', measuredWidth: record.widthMeters,
          provenance: 'observed',
          evidence: { source: 'raster', confidence: record.windowFrame ? 0.84 : 0.48, pixelBounds: gapPixelBounds },
        });
      }
    } else if (record.widthMeters >= 2.0 || (!record.doorStroke && record.widthMeters >= 1.5)) {
      openings.push({
        levelIndex: 0, pos: record.position, rotation: record.rotation, width: record.widthMeters,
        measuredWidth: record.widthMeters, provenance: 'observed',
        evidence: { source: 'raster', confidence: record.doorStroke || record.windowFrame ? 0.42 : 0.62, pixelBounds: gapPixelBounds },
      });
    } else {
      doors.push({
        levelIndex: 0, pos: record.position, rotation: record.rotation,
        width: clamp(record.widthMeters, 0.7, 1.2), type: 'single', measuredWidth: record.widthMeters,
        provenance: 'observed',
        evidence: { source: 'raster', confidence: record.doorStroke ? 0.82 : 0.5, pixelBounds: gapPixelBounds },
      });
    }
  }

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

  const boundaryPixels = footprintPixels.length >= 4 ? footprintPixels : rectangularFootprint(footprintBounds);
  const boundary = boundaryPixels.map(point => mapPoint(point.x, point.y));

  const warnings: string[] = [];
  const requestedAspect = requestedBounds
    ? (requestedBounds.maxX - requestedBounds.minX) / Math.max(0.01, requestedBounds.maxY - requestedBounds.minY)
    : undefined;
  const detectedAspect = pixelWidth / pixelHeight;
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
    columns: [],
    stairs: [],
    slabs: [],
    railings: [],
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
