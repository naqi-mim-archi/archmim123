import type { GeneratedData } from '../components/generative-wizard/types';
import type {
  Text4jStructuredGeometry,
  Text4jStructuredWallCandidate,
} from './text4jStructured3dClient';

type GeneratedWall = NonNullable<GeneratedData['walls']>[number];

export interface Text4jReconciliationRaster {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export interface Text4jStructuredReconciliationAudit {
  provider: 'Structured3D';
  baselineWalls: number;
  structuredFaces: number;
  pairedCenterlines: number;
  acceptedRepairs: number;
  rejectedUnpaired: number;
  rejectedUnsupported: number;
  rejectedModeConflict: number;
  rejectedExistingWall: number;
  rejectedConnectivity: number;
  rejectedOverlap: number;
  rejectedLengthBudget: number;
  finalWalls: number;
  unavailable: boolean;
}

interface PixelPoint { x: number; y: number }
interface PixelSegment {
  p1: PixelPoint;
  p2: PixelPoint;
  length: number;
  confidence: number;
}

interface CenterlineCandidate extends PixelSegment {
  bandSupport: number;
  faceSeparation: number;
}

interface MetricSegment {
  p1: PixelPoint;
  p2: PixelPoint;
  length: number;
  bandSupport: number;
  faceSeparation: number;
  confidence: number;
}

interface SegmentRelation {
  angleDifference: number;
  normalDistance: number;
  overlapRatio: number;
  overlapStart: number;
  overlapEnd: number;
}

interface PixelMetricTransform {
  resizeRatio: number;
  metersPerPixel: number;
  sourceWallThicknessPixels: number;
  map: (point: PixelPoint) => PixelPoint;
}

const TAU = Math.PI * 2;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const median = (values: number[]) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const pointDistance = (first: PixelPoint, second: PixelPoint) => Math.hypot(first.x - second.x, first.y - second.y);
const segmentLength = (p1: PixelPoint, p2: PixelPoint) => pointDistance(p1, p2);
const toPoint = (value: number[]): PixelPoint => ({ x: value[0], y: value[1] });
const toArray = (value: PixelPoint): number[] => [value.x, value.y];
const segmentAngle = (segment: Pick<PixelSegment, 'p1' | 'p2'>) =>
  Math.atan2(segment.p2.y - segment.p1.y, segment.p2.x - segment.p1.x);
const undirectedAngleDifference = (first: number, second: number) => {
  let difference = Math.abs((first - second + Math.PI) % TAU - Math.PI);
  if (difference > Math.PI / 2) difference = Math.PI - difference;
  return Math.abs(difference);
};
const axisDrift = (angle: number) => {
  const normalized = Math.abs(angle * 180 / Math.PI) % 90;
  return Math.min(normalized, 90 - normalized);
};

const projectPointToSegment = (point: PixelPoint, segment: Pick<PixelSegment, 'p1' | 'p2' | 'length'>) => {
  if (segment.length <= 1e-8) return { point: segment.p1, distance: pointDistance(point, segment.p1), progress: 0 };
  const dx = segment.p2.x - segment.p1.x, dy = segment.p2.y - segment.p1.y;
  const progress = clamp(((point.x - segment.p1.x) * dx + (point.y - segment.p1.y) * dy) / (segment.length * segment.length), 0, 1);
  const projected = { x: segment.p1.x + dx * progress, y: segment.p1.y + dy * progress };
  return { point: projected, distance: pointDistance(point, projected), progress };
};

const relateSegments = (
  first: Pick<PixelSegment, 'p1' | 'p2' | 'length'>,
  second: Pick<PixelSegment, 'p1' | 'p2' | 'length'>,
): SegmentRelation => {
  if (first.length <= 1e-8 || second.length <= 1e-8) {
    return { angleDifference: Math.PI, normalDistance: Infinity, overlapRatio: 0, overlapStart: 0, overlapEnd: 0 };
  }
  const angleDifference = undirectedAngleDifference(segmentAngle(first), segmentAngle(second));
  const unit = {
    x: (first.p2.x - first.p1.x) / first.length,
    y: (first.p2.y - first.p1.y) / first.length,
  };
  const projection = [second.p1, second.p2].map(point =>
    (point.x - first.p1.x) * unit.x + (point.y - first.p1.y) * unit.y);
  const overlapStart = Math.max(0, Math.min(...projection));
  const overlapEnd = Math.min(first.length, Math.max(...projection));
  const overlap = Math.max(0, overlapEnd - overlapStart);
  const firstMidpoint = { x: (first.p1.x + first.p2.x) / 2, y: (first.p1.y + first.p2.y) / 2 };
  const secondMidpoint = { x: (second.p1.x + second.p2.x) / 2, y: (second.p1.y + second.p2.y) / 2 };
  const normalDistance = (
    projectPointToSegment(firstMidpoint, second).distance
    + projectPointToSegment(secondMidpoint, first).distance
  ) / 2;
  return {
    angleDifference,
    normalDistance,
    overlapRatio: overlap / Math.max(1e-8, Math.min(first.length, second.length)),
    overlapStart,
    overlapEnd,
  };
};

const rasterIsDark = (raster: Text4jReconciliationRaster, x: number, y: number) => {
  const px = Math.round(x), py = Math.round(y);
  if (px < 0 || py < 0 || px >= raster.width || py >= raster.height) return false;
  const offset = (py * raster.width + px) * 4;
  const red = Number(raster.data[offset] ?? 255);
  const green = Number(raster.data[offset + 1] ?? red);
  const blue = Number(raster.data[offset + 2] ?? red);
  const alpha = Number(raster.data[offset + 3] ?? 255);
  return alpha > 24 && red * 0.299 + green * 0.587 + blue * 0.114 < 185;
};

const bandSupportBetweenFaces = (
  first: PixelSegment,
  second: PixelSegment,
  relation: SegmentRelation,
  raster: Text4jReconciliationRaster,
) => {
  const unit = {
    x: (first.p2.x - first.p1.x) / first.length,
    y: (first.p2.y - first.p1.y) / first.length,
  };
  const alongSamples = Math.max(10, Math.min(36, Math.round((relation.overlapEnd - relation.overlapStart) / 12)));
  let dark = 0, total = 0;
  for (let index = 0; index < alongSamples; index++) {
    const distance = relation.overlapStart + (relation.overlapEnd - relation.overlapStart) * ((index + 0.5) / alongSamples);
    const onFirst = { x: first.p1.x + unit.x * distance, y: first.p1.y + unit.y * distance };
    const onSecond = projectPointToSegment(onFirst, second).point;
    const acrossSamples = Math.max(3, Math.min(11, Math.round(pointDistance(onFirst, onSecond)) + 1));
    for (let across = 0; across < acrossSamples; across++) {
      const progress = acrossSamples === 1 ? 0.5 : across / (acrossSamples - 1);
      const point = {
        x: onFirst.x + (onSecond.x - onFirst.x) * progress,
        y: onFirst.y + (onSecond.y - onFirst.y) * progress,
      };
      total++;
      if (rasterIsDark(raster, point.x, point.y)) dark++;
    }
  }
  return total ? dark / total : 0;
};

const centerlineBetweenFaces = (
  first: PixelSegment,
  second: PixelSegment,
  relation: SegmentRelation,
  support: number,
): CenterlineCandidate => {
  const unit = {
    x: (first.p2.x - first.p1.x) / first.length,
    y: (first.p2.y - first.p1.y) / first.length,
  };
  const pointAt = (distance: number) => {
    const onFirst = { x: first.p1.x + unit.x * distance, y: first.p1.y + unit.y * distance };
    const onSecond = projectPointToSegment(onFirst, second).point;
    return { x: (onFirst.x + onSecond.x) / 2, y: (onFirst.y + onSecond.y) / 2 };
  };
  const p1 = pointAt(relation.overlapStart), p2 = pointAt(relation.overlapEnd);
  return {
    p1,
    p2,
    length: segmentLength(p1, p2),
    confidence: clamp((first.confidence + second.confidence) / 2 * 0.65 + support * 0.35, 0, 0.98),
    bandSupport: support,
    faceSeparation: relation.normalDistance,
  };
};

const normalizeStructuredFaces = (
  walls: Text4jStructuredWallCandidate[],
  raster: Text4jReconciliationRaster,
  typicalThickness: number,
) => {
  const faces: PixelSegment[] = walls.flatMap(wall => {
    const p1 = { ...wall.p1 }, p2 = { ...wall.p2 };
    const length = segmentLength(p1, p2);
    return length >= Math.max(5, typicalThickness * 1.4)
      ? [{ p1, p2, length, confidence: wall.confidence }]
      : [];
  });
  const minimumSeparation = Math.max(1.5, typicalThickness * 0.18);
  const maximumSeparation = Math.max(4, typicalThickness * 1.8);
  const hypotheses: Array<{ first: number; second: number; candidate: CenterlineCandidate; score: number }> = [];
  faces.forEach((first, firstIndex) => {
    for (let secondIndex = firstIndex + 1; secondIndex < faces.length; secondIndex++) {
      const second = faces[secondIndex];
      const relation = relateSegments(first, second);
      if (relation.angleDifference > 3 * Math.PI / 180
        || relation.overlapRatio < 0.58
        || relation.normalDistance < minimumSeparation
        || relation.normalDistance > maximumSeparation) continue;
      const support = bandSupportBetweenFaces(first, second, relation, raster);
      if (support < 0.5) continue;
      const candidate = centerlineBetweenFaces(first, second, relation, support);
      const thicknessAgreement = 1 - Math.min(1, Math.abs(relation.normalDistance - typicalThickness) / Math.max(1, typicalThickness));
      hypotheses.push({
        first: firstIndex,
        second: secondIndex,
        candidate,
        score: support * 3 + relation.overlapRatio + thicknessAgreement * 0.35,
      });
    }
  });

  const used = new Set<number>();
  const paired: CenterlineCandidate[] = [];
  hypotheses.sort((a, b) => b.score - a.score || b.candidate.length - a.candidate.length).forEach(hypothesis => {
    if (used.has(hypothesis.first) || used.has(hypothesis.second)) return;
    used.add(hypothesis.first);
    used.add(hypothesis.second);
    paired.push(hypothesis.candidate);
  });

  const deduplicated: CenterlineCandidate[] = [];
  [...paired].sort((a, b) => b.bandSupport - a.bandSupport || b.length - a.length).forEach(candidate => {
    const duplicate = deduplicated.some(existing => {
      const relation = relateSegments(candidate, existing);
      return relation.angleDifference <= 3 * Math.PI / 180
        && relation.overlapRatio >= 0.65
        && relation.normalDistance <= Math.max(2, typicalThickness * 0.7);
    });
    if (!duplicate) deduplicated.push(candidate);
  });
  return { faces, paired: deduplicated, usedFaceCount: used.size };
};

const estimatePixelMetricTransform = (
  baseline: GeneratedData,
  structured: Text4jStructuredGeometry,
): PixelMetricTransform | undefined => {
  const resizeRatio = Math.min(1, 1200 / Math.max(structured.sourceWidth, structured.sourceHeight));
  const scales: number[] = [];
  const processedThicknesses: number[] = [];
  const xOffsets: number[] = [];
  const yOffsets: number[] = [];

  for (const wall of baseline.walls || []) {
    if (wall.isCurved || wall.wallSource === 'arc' || wall.wallSource === 'ellipse') continue;
    const evidence = wall.evidence?.pixelBounds;
    if (!evidence) continue;
    const p1 = toPoint(wall.p1), p2 = toPoint(wall.p2);
    const metricLength = pointDistance(p1, p2);
    const horizontal = Math.abs(p2.y - p1.y) <= Math.max(0.02, metricLength * 0.025);
    const vertical = Math.abs(p2.x - p1.x) <= Math.max(0.02, metricLength * 0.025);
    if (horizontal) {
      const pixelLength = Math.max(1, evidence.x1 - evidence.x0);
      scales.push(metricLength / pixelLength);
      processedThicknesses.push(Math.max(1, evidence.y1 - evidence.y0));
    } else if (vertical) {
      const pixelLength = Math.max(1, evidence.y1 - evidence.y0);
      scales.push(metricLength / pixelLength);
      processedThicknesses.push(Math.max(1, evidence.x1 - evidence.x0));
    }
  }
  let metersPerPixel = median(scales.filter(value => Number.isFinite(value) && value > 0));
  if (!(metersPerPixel > 0)) {
    const points = (baseline.walls || []).flatMap(wall => [toPoint(wall.p1), toPoint(wall.p2)]);
    if (!points.length) return undefined;
    const spanX = Math.max(...points.map(point => point.x)) - Math.min(...points.map(point => point.x));
    const spanY = Math.max(...points.map(point => point.y)) - Math.min(...points.map(point => point.y));
    metersPerPixel = Math.max(spanX / structured.sourceWidth, spanY / structured.sourceHeight);
  }

  for (const wall of baseline.walls || []) {
    if (wall.isCurved || wall.wallSource === 'arc' || wall.wallSource === 'ellipse') continue;
    const evidence = wall.evidence?.pixelBounds;
    if (!evidence) continue;
    const p1 = toPoint(wall.p1), p2 = toPoint(wall.p2);
    const metricLength = pointDistance(p1, p2);
    const horizontal = Math.abs(p2.y - p1.y) <= Math.max(0.02, metricLength * 0.025);
    const vertical = Math.abs(p2.x - p1.x) <= Math.max(0.02, metricLength * 0.025);
    if (horizontal) {
      const metricMin = Math.min(p1.x, p2.x), metricMax = Math.max(p1.x, p2.x);
      xOffsets.push(metricMin - evidence.x0 * metersPerPixel, metricMax - evidence.x1 * metersPerPixel);
      yOffsets.push((p1.y + p2.y) / 2 + ((evidence.y0 + evidence.y1) / 2) * metersPerPixel);
    } else if (vertical) {
      xOffsets.push((p1.x + p2.x) / 2 - ((evidence.x0 + evidence.x1) / 2) * metersPerPixel);
      const metricMin = Math.min(p1.y, p2.y), metricMax = Math.max(p1.y, p2.y);
      yOffsets.push(metricMax + evidence.y0 * metersPerPixel, metricMin + evidence.y1 * metersPerPixel);
    }
  }

  const baselinePoints = (baseline.walls || []).flatMap(wall => [toPoint(wall.p1), toPoint(wall.p2)]);
  const baselineCenterX = baselinePoints.length
    ? (Math.min(...baselinePoints.map(point => point.x)) + Math.max(...baselinePoints.map(point => point.x))) / 2
    : 0;
  const baselineCenterY = baselinePoints.length
    ? (Math.min(...baselinePoints.map(point => point.y)) + Math.max(...baselinePoints.map(point => point.y))) / 2
    : 0;
  const xOffset = median(xOffsets) || baselineCenterX - structured.sourceWidth * resizeRatio * metersPerPixel / 2;
  const yOffset = median(yOffsets) || baselineCenterY + structured.sourceHeight * resizeRatio * metersPerPixel / 2;
  return {
    resizeRatio,
    metersPerPixel,
    sourceWallThicknessPixels: Math.max(3, (median(processedThicknesses) || Math.min(structured.sourceWidth, structured.sourceHeight) * 0.012) / resizeRatio),
    map: point => ({
      x: point.x * resizeRatio * metersPerPixel + xOffset,
      y: -point.y * resizeRatio * metersPerPixel + yOffset,
    }),
  };
};

const sampleWallSegments = (wall: GeneratedWall): PixelSegment[] => {
  const directedAngle = (start: number, end: number, counterclockwise = false, progress = 1) => {
    let span = counterclockwise ? start - end : end - start;
    while (span < 0) span += TAU;
    while (span >= TAU) span -= TAU;
    return counterclockwise ? start - span * progress : start + span * progress;
  };
  const wallPoint = (progress: number): PixelPoint => {
    if (wall.wallSource === 'ellipse' && wall.ellipseCenter
      && wall.ellipseRadiusX !== undefined && wall.ellipseRadiusY !== undefined) {
      const angle = directedAngle(wall.ellipseStartAngle || 0, wall.ellipseEndAngle ?? TAU, wall.ellipseCounterclockwise, progress);
      const rotation = wall.ellipseRotation || 0;
      const x = Math.cos(angle) * wall.ellipseRadiusX, y = Math.sin(angle) * wall.ellipseRadiusY;
      return {
        x: wall.ellipseCenter[0] + x * Math.cos(rotation) - y * Math.sin(rotation),
        y: wall.ellipseCenter[1] + x * Math.sin(rotation) + y * Math.cos(rotation),
      };
    }
    if ((wall.wallSource === 'arc' || wall.isCurved) && wall.arcCenter
      && wall.arcRadius !== undefined && wall.arcStartAngle !== undefined && wall.arcEndAngle !== undefined) {
      const angle = directedAngle(wall.arcStartAngle, wall.arcEndAngle, wall.arcCounterclockwise, progress);
      return { x: wall.arcCenter[0] + Math.cos(angle) * wall.arcRadius, y: wall.arcCenter[1] + Math.sin(angle) * wall.arcRadius };
    }
    if (wall.isCurved && wall.controlPoint) {
      const mt = 1 - progress;
      return {
        x: mt * mt * wall.p1[0] + 2 * mt * progress * wall.controlPoint[0] + progress * progress * wall.p2[0],
        y: mt * mt * wall.p1[1] + 2 * mt * progress * wall.controlPoint[1] + progress * progress * wall.p2[1],
      };
    }
    return {
      x: wall.p1[0] + (wall.p2[0] - wall.p1[0]) * progress,
      y: wall.p1[1] + (wall.p2[1] - wall.p1[1]) * progress,
    };
  };
  const curved = wall.isCurved || wall.wallSource === 'arc' || wall.wallSource === 'ellipse';
  const count = curved ? 64 : 1;
  const segments: PixelSegment[] = [];
  let previous = wallPoint(0);
  for (let index = 1; index <= count; index++) {
    const current = wallPoint(index / count);
    const length = pointDistance(previous, current);
    if (length > 1e-6) segments.push({ p1: previous, p2: current, length, confidence: wall.evidence?.confidence || 0.8 });
    previous = current;
  }
  return segments;
};

const baselineMode = (walls: GeneratedWall[]): 'orthogonal' | 'angular' | 'curved' | 'hybrid' => {
  const curved = walls.some(wall => wall.isCurved || wall.wallSource === 'arc' || wall.wallSource === 'ellipse');
  const angular = walls.some(wall => {
    if (wall.isCurved || wall.wallSource === 'arc' || wall.wallSource === 'ellipse') return false;
    return axisDrift(Math.atan2(wall.p2[1] - wall.p1[1], wall.p2[0] - wall.p1[0])) > 4;
  });
  return curved ? angular ? 'hybrid' : 'curved' : angular ? 'angular' : 'orthogonal';
};

const candidateMatchesWall = (candidate: MetricSegment, wall: GeneratedWall, normalTolerance: number) =>
  sampleWallSegments(wall).some(segment => {
    const relation = relateSegments(candidate, segment);
    return relation.angleDifference <= 4 * Math.PI / 180
      && relation.overlapRatio >= 0.45
      && relation.normalDistance <= normalTolerance;
  });

const nearestPointOnWalls = (point: PixelPoint, walls: GeneratedWall[]) => {
  let best: { point: PixelPoint; distance: number; wall?: GeneratedWall } = { point, distance: Infinity };
  walls.forEach(wall => sampleWallSegments(wall).forEach(segment => {
    const projected = projectPointToSegment(point, segment);
    if (projected.distance < best.distance) best = { point: projected.point, distance: projected.distance, wall };
  }));
  return best;
};

const properSegmentIntersections = (candidate: MetricSegment, walls: GeneratedWall[], endpointTolerance: number) => {
  const intersections: PixelPoint[] = [];
  const first = candidate.p1, second = candidate.p2;
  const r = { x: second.x - first.x, y: second.y - first.y };
  walls.forEach(wall => sampleWallSegments(wall).forEach(segment => {
    const s = { x: segment.p2.x - segment.p1.x, y: segment.p2.y - segment.p1.y };
    const cross = r.x * s.y - r.y * s.x;
    if (Math.abs(cross) <= 1e-8) return;
    const offset = { x: segment.p1.x - first.x, y: segment.p1.y - first.y };
    const t = (offset.x * s.y - offset.y * s.x) / cross;
    const u = (offset.x * r.y - offset.y * r.x) / cross;
    if (t < 0 || t > 1 || u < 0 || u > 1) return;
    const point = { x: first.x + r.x * t, y: first.y + r.y * t };
    if (pointDistance(point, first) > endpointTolerance && pointDistance(point, second) > endpointTolerance) intersections.push(point);
  }));
  return intersections;
};

const countNearOverlaps = (walls: GeneratedWall[], tolerance: number) => {
  const straight = walls.flatMap((wall, index) => wall.isCurved || wall.wallSource === 'arc' || wall.wallSource === 'ellipse'
    ? []
    : [{ index, p1: toPoint(wall.p1), p2: toPoint(wall.p2), length: segmentLength(toPoint(wall.p1), toPoint(wall.p2)), confidence: 1 }]);
  let count = 0;
  straight.forEach((first, firstIndex) => {
    for (let secondIndex = firstIndex + 1; secondIndex < straight.length; secondIndex++) {
      const relation = relateSegments(first, straight[secondIndex]);
      if (relation.angleDifference <= 2 * Math.PI / 180
        && relation.overlapRatio >= 0.65
        && relation.normalDistance <= tolerance) count++;
    }
  });
  return count;
};

export const reconcileText4jStructuredGeometryWithRaster = (
  baseline: GeneratedData,
  structured: Text4jStructuredGeometry,
  raster: Text4jReconciliationRaster,
): { data: GeneratedData; audit: Text4jStructuredReconciliationAudit } => {
  const baselineWalls = [...(baseline.walls || [])];
  const audit: Text4jStructuredReconciliationAudit = {
    provider: 'Structured3D',
    baselineWalls: baselineWalls.length,
    structuredFaces: structured.walls.length,
    pairedCenterlines: 0,
    acceptedRepairs: 0,
    rejectedUnpaired: structured.walls.length,
    rejectedUnsupported: 0,
    rejectedModeConflict: 0,
    rejectedExistingWall: 0,
    rejectedConnectivity: 0,
    rejectedOverlap: 0,
    rejectedLengthBudget: 0,
    finalWalls: baselineWalls.length,
    unavailable: false,
  };
  const finalize = (walls: GeneratedWall[], unavailableWarning?: string) => ({
    data: {
      ...baseline,
      walls,
      extractionDiagnostics: baseline.extractionDiagnostics ? {
        ...baseline.extractionDiagnostics,
        warnings: audit.unavailable && unavailableWarning
          ? [unavailableWarning, ...baseline.extractionDiagnostics.warnings]
          : baseline.extractionDiagnostics.warnings,
        metrics: baseline.extractionDiagnostics.metrics ? {
          ...baseline.extractionDiagnostics.metrics,
          wallCount: walls.length,
        } : baseline.extractionDiagnostics.metrics,
        structuredReconciliation: { ...audit },
      } : baseline.extractionDiagnostics,
    },
    audit,
  });
  const transform = estimatePixelMetricTransform(baseline, structured);
  if (!transform || baselineWalls.length < 3) {
    audit.unavailable = true;
    return finalize(
      baselineWalls,
      `Structured3D contribution unavailable: Local baseline ${baselineWalls.length} walls = J Hybrid Final ${baselineWalls.length} walls because pixel-to-Local alignment could not be established.`,
    );
  }

  const normalized = normalizeStructuredFaces(structured.walls, raster, transform.sourceWallThicknessPixels);
  audit.pairedCenterlines = normalized.paired.length;
  audit.rejectedUnpaired = Math.max(0, normalized.faces.length - normalized.usedFaceCount);
  const candidates: MetricSegment[] = normalized.paired.map(candidate => {
    const p1 = transform.map(candidate.p1), p2 = transform.map(candidate.p2);
    return { ...candidate, p1, p2, length: pointDistance(p1, p2) };
  });
  const mode = baselineMode(baselineWalls);
  const wallThicknessMeters = Math.max(0.08, transform.sourceWallThicknessPixels * transform.resizeRatio * transform.metersPerPixel);
  const existingTolerance = Math.max(0.12, wallThicknessMeters * 1.3);
  const connectionTolerance = Math.max(0.22, wallThicknessMeters * 1.8);
  const overlapTolerance = Math.max(0.08, wallThicknessMeters * 1.35);
  const baselineOverlapCount = countNearOverlaps(baselineWalls, overlapTolerance);
  const baselineLength = baselineWalls.reduce((sum, wall) => sum + pointDistance(toPoint(wall.p1), toPoint(wall.p2)), 0);
  const maximumAddedLength = Math.max(2.5, baselineLength * 0.38);
  const bounds = baselineWalls.flatMap(wall => [toPoint(wall.p1), toPoint(wall.p2)]).reduce((result, point) => ({
    minX: Math.min(result.minX, point.x), maxX: Math.max(result.maxX, point.x),
    minY: Math.min(result.minY, point.y), maxY: Math.max(result.maxY, point.y),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const accepted: GeneratedWall[] = [];
  let acceptedLength = 0;
  let currentOverlapCount = baselineOverlapCount;

  candidates.sort((a, b) => b.bandSupport - a.bandSupport || b.length - a.length).forEach(candidate => {
    const angle = segmentAngle(candidate);
    const drift = axisDrift(angle);
    if ((mode === 'orthogonal' && drift > 3)
      || ((mode === 'curved' || mode === 'hybrid') && drift > 4)) {
      audit.rejectedModeConflict++;
      return;
    }
    if (candidate.length < 0.48 || candidate.bandSupport < 0.58) {
      audit.rejectedUnsupported++;
      return;
    }
    if (baselineWalls.some(wall => candidateMatchesWall(candidate, wall, existingTolerance))
      || accepted.some(wall => candidateMatchesWall(candidate, wall, existingTolerance))) {
      audit.rejectedExistingWall++;
      return;
    }
    const firstAttachment = nearestPointOnWalls(candidate.p1, [...baselineWalls, ...accepted]);
    const secondAttachment = nearestPointOnWalls(candidate.p2, [...baselineWalls, ...accepted]);
    if (firstAttachment.distance > connectionTolerance || secondAttachment.distance > connectionTolerance) {
      audit.rejectedConnectivity++;
      return;
    }
    if (properSegmentIntersections(candidate, baselineWalls, connectionTolerance).length > 1) {
      audit.rejectedConnectivity++;
      return;
    }
    const snapped = {
      ...candidate,
      p1: firstAttachment.point,
      p2: secondAttachment.point,
      length: pointDistance(firstAttachment.point, secondAttachment.point),
    };
    if (snapped.length < 0.4 || [...baselineWalls, ...accepted].some(wall => candidateMatchesWall(snapped, wall, existingTolerance))) {
      audit.rejectedExistingWall++;
      return;
    }
    const midpoint = { x: (snapped.p1.x + snapped.p2.x) / 2, y: (snapped.p1.y + snapped.p2.y) / 2 };
    const exterior = Math.min(
      Math.abs(midpoint.x - bounds.minX), Math.abs(midpoint.x - bounds.maxX),
      Math.abs(midpoint.y - bounds.minY), Math.abs(midpoint.y - bounds.maxY),
    ) <= connectionTolerance && firstAttachment.wall?.type === 'exterior' && secondAttachment.wall?.type === 'exterior';
    const repair: GeneratedWall = {
      levelIndex: 0,
      p1: toArray(snapped.p1),
      p2: toArray(snapped.p2),
      type: exterior ? 'exterior' : 'interior',
      wallSource: 'line',
      isCurved: false,
      provenance: 'repair-generated',
      evidence: {
        source: 'geometry-repair',
        confidence: clamp(snapped.confidence, 0, 0.94),
        notes: [`Structured3D paired wall faces accepted as a missing Local centerline (${Math.round(snapped.bandSupport * 100)}% raster-band support).`],
      },
    };
    if (acceptedLength + snapped.length > maximumAddedLength) {
      audit.rejectedLengthBudget++;
      return;
    }
    const proposedWalls = [...baselineWalls, ...accepted, repair];
    const proposedOverlapCount = countNearOverlaps(proposedWalls, overlapTolerance);
    if (proposedOverlapCount > currentOverlapCount) {
      audit.rejectedOverlap++;
      return;
    }
    accepted.push(repair);
    acceptedLength += snapped.length;
    currentOverlapCount = proposedOverlapCount;
  });

  const walls = [...baselineWalls, ...accepted];
  audit.acceptedRepairs = accepted.length;
  audit.finalWalls = walls.length;
  return finalize(walls);
};

const loadReconciliationRaster = (
  imageBase64: string,
  width: number,
  height: number,
): Promise<Text4jReconciliationRaster> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('The browser could not create the Structured3D reconciliation raster.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      resolve(context.getImageData(0, 0, width, height));
    } catch (error) {
      reject(error);
    }
  };
  image.onerror = () => reject(new Error('The source image could not be decoded for Structured3D reconciliation.'));
  image.src = imageBase64;
});

export const reconcileText4jStructuredGeometry = async (
  imageBase64: string,
  baseline: GeneratedData,
  structured: Text4jStructuredGeometry,
) => reconcileText4jStructuredGeometryWithRaster(
  baseline,
  structured,
  await loadReconciliationRaster(imageBase64, structured.sourceWidth, structured.sourceHeight),
);
