import type {
  Text4hFreeformWallGap,
  Text4hFreeformWallSegment,
  Text4hGeometryMode,
  Text4hPixelPoint,
} from './text4hGeometryModes';

export interface Text4hNativeArcRun {
  sourceIndices: number[];
  p1: Text4hPixelPoint;
  p2: Text4hPixelPoint;
  controlPoint: Text4hPixelPoint;
  center: Text4hPixelPoint;
  radius: number;
  startAngle: number;
  endAngle: number;
  counterclockwise: boolean;
  confidence: number;
  rasterSupport: number;
  /** Set only when the source family is a raster-supported ellipse. */
  ellipseRadiusX?: number;
  ellipseRadiusY?: number;
  ellipseRotation?: number;
  ellipseStartAngle?: number;
  ellipseEndAngle?: number;
  ellipseCounterclockwise?: boolean;
  /** Interval independently resampled from a previously proven ellipse. */
  rasterRecovered?: boolean;
}

interface CurveArcOptions {
  mode: Text4hGeometryMode;
  structuralMask: Uint8Array;
  width: number;
  height: number;
  typicalThickness: number;
  /** True only after the caller proves smooth non-axis exterior evidence. */
  curveEvidence?: boolean;
  /** Hybrid plans keep native curves only when their source chords are facade evidence. */
  exteriorEvidence?: (segment: Text4hFreeformWallSegment) => boolean;
  /** A non-facade curve may survive only when its source is a strict raster glazing band. */
  interiorWindowEvidence?: (segment: Text4hFreeformWallSegment) => boolean;
  /**
   * A significant interior architectural family (for example, a circular
   * circulation wall) may survive the hybrid facade gate. The callback is
   * deliberately family-level so isolated fixture and swing arcs cannot opt
   * themselves in one chord at a time.
   */
  interiorArchitecturalEvidence?: (
    arc: Text4hNativeArcRun,
    sourceSegments: Text4hFreeformWallSegment[],
  ) => boolean;
  /** Long exterior family fallback used only when no dominant shell exists. */
  openShellExteriorEvidence?: (
    arc: Text4hNativeArcRun,
    sourceSegments: Text4hFreeformWallSegment[],
  ) => boolean;
  /** Raster-proven apertures whose temporary endpoint chord is only a host locator. */
  hostedGaps?: Text4hFreeformWallGap[];
}

interface OrderedRun {
  points: Text4hPixelPoint[];
  sourceIndices: number[];
  closed: boolean;
}

interface CircleFit {
  center: Text4hPixelPoint;
  radius: number;
  rmsError: number;
  maximumError: number;
  signedSpan: number;
  consistency: number;
  maximumStep: number;
}

interface CurveFamilyModel {
  center: Text4hPixelPoint;
  radiusX: number;
  radiusY: number;
  /** Axis-aligned in the raster; rotated shells remain on the chord path. */
  pointAt: (angle: number) => Text4hPixelPoint;
  residual: (point: Text4hPixelPoint) => number;
  tangentSupport: (segment: Text4hFreeformWallSegment) => number;
}

const TAU = Math.PI * 2;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: Text4hPixelPoint, b: Text4hPixelPoint) => Math.hypot(b.x - a.x, b.y - a.y);
const normalizeDelta = (value: number) => {
  let normalized = value % TAU;
  if (normalized > Math.PI) normalized -= TAU;
  if (normalized < -Math.PI) normalized += TAU;
  return normalized;
};

const normalizeAngle = (value: number) => {
  let normalized = value % TAU;
  if (normalized < 0) normalized += TAU;
  return normalized;
};

const directedSpan = (startAngle: number, endAngle: number, counterclockwise: boolean) => {
  let span = counterclockwise ? startAngle - endAngle : endAngle - startAngle;
  while (span < 0) span += TAU;
  while (span >= TAU) span -= TAU;
  return span;
};

const solveLinearSystem = (matrix: number[][], values: number[]): number[] | undefined => {
  const size = values.length;
  const rows = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) < 1e-9) return undefined;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let entry = column; entry <= size; entry++) rows[column][entry] /= divisor;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let entry = column; entry <= size; entry++) rows[row][entry] -= factor * rows[column][entry];
    }
  }
  return rows.map(row => row[size]);
};

const solveThreeByThree = (matrix: number[][], values: number[]): number[] | undefined => {
  const rows = matrix.map((row, index) => [...row, values[index]]);
  for (let column = 0; column < 3; column++) {
    let pivot = column;
    for (let row = column + 1; row < 3; row++) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    }
    if (Math.abs(rows[pivot][column]) < 1e-8) return undefined;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let entry = column; entry < 4; entry++) rows[column][entry] /= divisor;
    for (let row = 0; row < 3; row++) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let entry = column; entry < 4; entry++) rows[row][entry] -= factor * rows[column][entry];
    }
  }
  return rows.map(row => row[3]);
};

const leastSquaresCircle = (points: Text4hPixelPoint[]): CircleFit | undefined => {
  if (points.length < 4) return undefined;
  const mean = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  mean.x /= points.length;
  mean.y /= points.length;
  let suu = 0, suv = 0, svv = 0, su = 0, sv = 0;
  let sub = 0, svb = 0, sb = 0;
  points.forEach(point => {
    const u = point.x - mean.x;
    const v = point.y - mean.y;
    const b = -(u * u + v * v);
    suu += u * u; suv += u * v; svv += v * v;
    su += u; sv += v;
    sub += u * b; svb += v * b; sb += b;
  });
  const solved = solveThreeByThree(
    [[suu, suv, su], [suv, svv, sv], [su, sv, points.length]],
    [sub, svb, sb],
  );
  if (!solved) return undefined;
  const [a, b, c] = solved;
  const localRadiusSquared = (a * a + b * b) / 4 - c;
  if (!Number.isFinite(localRadiusSquared) || localRadiusSquared <= 0) return undefined;
  const center = { x: mean.x - a / 2, y: mean.y - b / 2 };
  const radius = Math.sqrt(localRadiusSquared);
  const errors = points.map(point => Math.abs(distance(center, point) - radius));
  const angles = points.map(point => Math.atan2(point.y - center.y, point.x - center.x));
  const deltas = angles.slice(1).map((angle, index) => normalizeDelta(angle - angles[index]));
  const signedSpan = deltas.reduce((sum, delta) => sum + delta, 0);
  const totalTurn = deltas.reduce((sum, delta) => sum + Math.abs(delta), 0);
  const dominantSign = Math.sign(signedSpan) || 1;
  const consistentTurn = deltas.reduce((sum, delta) => sum + (Math.sign(delta) === dominantSign ? Math.abs(delta) : 0), 0);
  return {
    center,
    radius,
    rmsError: Math.sqrt(errors.reduce((sum, error) => sum + error * error, 0) / errors.length),
    maximumError: Math.max(...errors),
    signedSpan,
    consistency: consistentTurn / Math.max(1e-6, totalTurn),
    maximumStep: Math.max(...deltas.map(Math.abs)),
  };
};

const circleThroughThreePoints = (
  start: Text4hPixelPoint,
  middle: Text4hPixelPoint,
  end: Text4hPixelPoint,
) => {
  const determinant = 2 * (
    start.x * (middle.y - end.y)
    + middle.x * (end.y - start.y)
    + end.x * (start.y - middle.y)
  );
  if (Math.abs(determinant) < 1e-6) return undefined;
  const startSq = start.x * start.x + start.y * start.y;
  const middleSq = middle.x * middle.x + middle.y * middle.y;
  const endSq = end.x * end.x + end.y * end.y;
  const center = {
    x: (startSq * (middle.y - end.y) + middleSq * (end.y - start.y) + endSq * (start.y - middle.y)) / determinant,
    y: (startSq * (end.x - middle.x) + middleSq * (start.x - end.x) + endSq * (middle.x - start.x)) / determinant,
  };
  const radius = distance(center, start);
  if (!Number.isFinite(radius) || radius < 1e-6) return undefined;
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const middleAngle = Math.atan2(middle.y - center.y, middle.x - center.x);
  const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
  const positiveSpan = (endAngle - startAngle + TAU) % TAU;
  const positiveMiddle = (middleAngle - startAngle + TAU) % TAU;
  const counterclockwise = positiveMiddle > positiveSpan;
  return { center, radius, startAngle, endAngle, counterclockwise };
};

const pointOnArc = (
  center: Text4hPixelPoint,
  radius: number,
  startAngle: number,
  endAngle: number,
  counterclockwise: boolean,
  t: number,
) => {
  let span = counterclockwise ? startAngle - endAngle : endAngle - startAngle;
  if (span < 0) span += TAU;
  const angle = counterclockwise ? startAngle - span * t : startAngle + span * t;
  return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius };
};

/**
 * Reject a hybrid ellipse when its analytic projection escapes the raster
 * family that supposedly supports it. This is intentionally not applied to
 * the established pure-curved route or local circular arcs: it addresses the
 * hybrid failure where a nearly straight partition is extrapolated into a
 * remote ellipse and then treated as facade geometry.
 */
export const text4hCurveArcSourceEnvelopeCoherentForTest = (
  arc: Text4hNativeArcRun,
  sourceSegments: Text4hFreeformWallSegment[],
  width: number,
  height: number,
  typicalThickness: number,
) => {
  if (!sourceSegments.length) return true;
  if (arc.rasterRecovered) return true;
  const bounds = sourceSegments.reduce((current, segment) => ({
    minX: Math.min(current.minX, segment.p1.x, segment.p2.x),
    maxX: Math.max(current.maxX, segment.p1.x, segment.p2.x),
    minY: Math.min(current.minY, segment.p1.y, segment.p2.y),
    maxY: Math.max(current.maxY, segment.p1.y, segment.p2.y),
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
  const expansion = Math.max(4, typicalThickness * 1.35);
  const ellipse = arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined;
  // Local circular arcs already pass the native run's radial-error, sagitta,
  // and raster-support audits. The envelope safeguard exists only for the
  // hybrid failure where sparse chords extrapolate into a remote ellipse.
  if (!ellipse) return true;
  const analyticStart = ellipse ? arc.ellipseStartAngle ?? arc.startAngle : arc.startAngle;
  const analyticEnd = ellipse ? arc.ellipseEndAngle ?? arc.endAngle : arc.endAngle;
  const analyticCounterclockwise = ellipse
    ? arc.ellipseCounterclockwise ?? arc.counterclockwise
    : arc.counterclockwise;
  const analyticSpan = directedSpan(analyticStart, analyticEnd, analyticCounterclockwise);
  const samples = ellipse
    ? (() => {
      const rotation = arc.ellipseRotation || 0;
      const cosR = Math.cos(rotation), sinR = Math.sin(rotation);
      return Array.from({ length: 13 }, (_, index) => {
        const angle = analyticCounterclockwise
          ? analyticStart - analyticSpan * index / 12
          : analyticStart + analyticSpan * index / 12;
        const localX = Math.cos(angle) * arc.ellipseRadiusX!;
        const localY = Math.sin(angle) * arc.ellipseRadiusY!;
        return {
          x: arc.center.x + localX * cosR - localY * sinR,
          y: arc.center.y + localX * sinR + localY * cosR,
        };
      });
    })()
    : Array.from({ length: 13 }, (_, index) => pointOnArc(
      arc.center,
      arc.radius,
      arc.startAngle,
      arc.endAngle,
      arc.counterclockwise,
      index / 12,
    ));
  if (sourceSegments.length >= 2 && analyticSpan >= 0.5) {
    const orientations = sourceSegments.map(segment => {
      let angle = Math.atan2(segment.p2.y - segment.p1.y, segment.p2.x - segment.p1.x) % Math.PI;
      if (angle < 0) angle += Math.PI;
      return angle;
    });
    let tangentDiversity = 0;
    for (let first = 0; first < orientations.length; first++) for (let second = first + 1; second < orientations.length; second++) {
      const delta = Math.abs(orientations[first] - orientations[second]);
      tangentDiversity = Math.max(tangentDiversity, Math.min(delta, Math.PI - delta));
    }
    if (tangentDiversity < Math.min(0.18, analyticSpan * 0.28)) return false;
  }
  return samples.every(point => point.x >= -expansion && point.x <= width + expansion
    && point.y >= -expansion && point.y <= height + expansion
    && point.x >= bounds.minX - expansion && point.x <= bounds.maxX + expansion
    && point.y >= bounds.minY - expansion && point.y <= bounds.maxY + expansion);
};

const rasterSupport = (
  fit: { center: Text4hPixelPoint; radius: number; startAngle: number; endAngle: number; counterclockwise: boolean },
  mask: Uint8Array,
  width: number,
  height: number,
  thickness: number,
) => {
  let span = fit.counterclockwise ? fit.startAngle - fit.endAngle : fit.endAngle - fit.startAngle;
  if (span < 0) span += TAU;
  const samples = Math.max(16, Math.ceil(fit.radius * span * 0.8));
  const radius = Math.max(1, Math.ceil(thickness * 0.42));
  let supported = 0;
  for (let index = 0; index <= samples; index++) {
    const point = pointOnArc(fit.center, fit.radius, fit.startAngle, fit.endAngle, fit.counterclockwise, index / samples);
    let found = false;
    for (let oy = -radius; oy <= radius && !found; oy++) {
      for (let ox = -radius; ox <= radius; ox++) {
        if (ox * ox + oy * oy > radius * radius) continue;
        const x = Math.round(point.x + ox), y = Math.round(point.y + oy);
        if (x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x]) {
          found = true;
          break;
        }
      }
    }
    if (found) supported++;
  }
  return supported / (samples + 1);
};

const ellipseRasterSupport = (
  fit: {
    center: Text4hPixelPoint;
    radiusX: number;
    radiusY: number;
    startAngle: number;
    endAngle: number;
    counterclockwise: boolean;
  },
  mask: Uint8Array,
  width: number,
  height: number,
  thickness: number,
) => {
  let span = fit.counterclockwise ? fit.startAngle - fit.endAngle : fit.endAngle - fit.startAngle;
  while (span < 0) span += TAU;
  const samples = Math.max(16, Math.ceil(Math.max(fit.radiusX, fit.radiusY) * span * 0.8));
  const radius = Math.max(1, Math.ceil(thickness * 0.42));
  let supported = 0;
  for (let index = 0; index <= samples; index++) {
    const t = index / samples;
    const angle = fit.counterclockwise ? fit.startAngle - span * t : fit.startAngle + span * t;
    const point = {
      x: fit.center.x + Math.cos(angle) * fit.radiusX,
      y: fit.center.y + Math.sin(angle) * fit.radiusY,
    };
    let found = false;
    for (let oy = -radius; oy <= radius && !found; oy++) {
      for (let ox = -radius; ox <= radius; ox++) {
        if (ox * ox + oy * oy > radius * radius) continue;
        const x = Math.round(point.x + ox), y = Math.round(point.y + oy);
        if (x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x]) {
          found = true;
          break;
        }
      }
    }
    if (found) supported++;
  }
  return supported / (samples + 1);
};

const fitAxisEllipse = (points: Text4hPixelPoint[]): CurveFamilyModel | undefined => {
  if (points.length < 8) return undefined;
  const mean = points.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), { x: 0, y: 0 });
  mean.x /= points.length;
  mean.y /= points.length;
  const span = Math.max(
    1,
    Math.max(...points.map(point => Math.abs(point.x - mean.x))),
    Math.max(...points.map(point => Math.abs(point.y - mean.y))),
  );
  const basis = (point: Text4hPixelPoint) => {
    const x = (point.x - mean.x) / span;
    const y = (point.y - mean.y) / span;
    return [x * x, y * y, x, y];
  };
  const matrix = Array.from({ length: 4 }, () => Array(4).fill(0));
  const values = Array(4).fill(0);
  points.forEach(point => {
    const row = basis(point);
    for (let i = 0; i < 4; i++) {
      values[i] += row[i];
      for (let j = 0; j < 4; j++) matrix[i][j] += row[i] * row[j];
    }
  });
  const solved = solveLinearSystem(matrix, values);
  if (!solved) return undefined;
  let [a, c, d, e] = solved;
  if (!Number.isFinite(a) || !Number.isFinite(c) || a * c <= 1e-8) return undefined;
  if (a < 0) { a = -a; c = -c; d = -d; e = -e; }
  const centerU = -d / (2 * a), centerV = -e / (2 * c);
  const constant = 1 + a * centerU * centerU + c * centerV * centerV;
  if (!Number.isFinite(constant) || constant <= 0) return undefined;
  const radiusU = Math.sqrt(constant / a), radiusV = Math.sqrt(constant / c);
  const center = { x: mean.x + centerU * span, y: mean.y + centerV * span };
  const radiusX = radiusU * span, radiusY = radiusV * span;
  if (!Number.isFinite(radiusX) || !Number.isFinite(radiusY)
    || Math.min(radiusX, radiusY) < 2 || Math.max(radiusX, radiusY) > span * 8) return undefined;
  const pointAt = (angle: number) => ({
    x: center.x + Math.cos(angle) * radiusX,
    y: center.y + Math.sin(angle) * radiusY,
  });
  const residual = (point: Text4hPixelPoint) => {
    const normalized = Math.hypot((point.x - center.x) / radiusX, (point.y - center.y) / radiusY);
    return Math.abs(normalized - 1) * Math.min(radiusX, radiusY);
  };
  const tangentSupport = (segment: Text4hFreeformWallSegment) => {
    const midpoint = {
      x: (segment.p1.x + segment.p2.x) / 2,
      y: (segment.p1.y + segment.p2.y) / 2,
    };
    const gradient = {
      x: (midpoint.x - center.x) / (radiusX * radiusX),
      y: (midpoint.y - center.y) / (radiusY * radiusY),
    };
    const gradientLength = Math.max(1e-6, Math.hypot(gradient.x, gradient.y));
    const tangentLength = Math.max(1e-6, distance(segment.p1, segment.p2));
    const tangent = { x: (segment.p2.x - segment.p1.x) / tangentLength, y: (segment.p2.y - segment.p1.y) / tangentLength };
    return Math.abs((gradient.x * tangent.x + gradient.y * tangent.y) / gradientLength);
  };
  return { center, radiusX, radiusY, pointAt, residual, tangentSupport };
};

const curveParameter = (model: CurveFamilyModel, point: Text4hPixelPoint) =>
  Math.atan2((point.y - model.center.y) / model.radiusY, (point.x - model.center.x) / model.radiusX);

interface CurveFamilyCandidate {
  model: CurveFamilyModel;
  sourceIndices: number[];
  arcs: Text4hNativeArcRun[];
  score: number;
}

const fitSeparatedCurveFamily = (
  segments: Text4hFreeformWallSegment[],
  sourceIndices: number[],
  options: CurveArcOptions,
): CurveFamilyCandidate | undefined => {
  if (sourceIndices.length < 4) return undefined;
  let active = sourceIndices.slice();
  let model: CurveFamilyModel | undefined;
  for (let iteration = 0; iteration < 4; iteration++) {
    // RDP describes a curve as straight chords. Chord midpoints sit inside
    // the real circle/ellipse and systematically shrink the fitted family;
    // only the observed chord endpoints belong on the analytic curve.
    const points = active.flatMap(index => [segments[index].p1, segments[index].p2]);
    model = fitAxisEllipse(points);
    if (!model) return undefined;
    const tolerance = Math.max(2.4, options.typicalThickness * 1.75, Math.min(model.radiusX, model.radiusY) * 0.065);
    const next = sourceIndices.filter(index => {
      const segment = segments[index];
      const residual = Math.max(model!.residual(segment.p1), model!.residual(segment.p2));
      // Junction pixels can pull a skeleton endpoint toward an intersecting
      // partition by roughly one wall thickness. Tangency, plus the later
      // raster-support audit, keeps those radial partitions out.
      return residual <= tolerance && model!.tangentSupport(segment) <= 0.78;
    });
    if (next.length < 4 || next.length === active.length) {
      active = next;
      break;
    }
    active = next;
  }
  if (!model || active.length < 4 || Math.min(model.radiusX, model.radiusY) < options.typicalThickness * 3.2) return undefined;
  // A curve family must prove changing tangency, not merely fit the small
  // numerical drift of a long straight partition. Dense circular plans have
  // many vertical/horizontal interior walls; fitting those as very narrow
  // ellipses removes them from the established axis detector. A genuinely
  // shallow curve can still survive through the local native-arc fitter.
  const tangentAngles = active.map(index => {
    const segment = segments[index];
    let angle = Math.atan2(segment.p2.y - segment.p1.y, segment.p2.x - segment.p1.x) % Math.PI;
    if (angle < 0) angle += Math.PI;
    return angle;
  });
  let tangentSpread = 0;
  tangentAngles.forEach(first => tangentAngles.forEach(second => {
    const delta = Math.abs(first - second);
    tangentSpread = Math.max(tangentSpread, Math.min(delta, Math.PI - delta));
  }));
  const aspectRatio = Math.max(model.radiusX, model.radiusY) / Math.max(1e-6, Math.min(model.radiusX, model.radiusY));
  const minimumCanvasRadius = Math.min(options.width, options.height) * 0.12;
  if (tangentSpread < 8 * Math.PI / 180
    || aspectRatio > 6
    || (!!options.exteriorEvidence && Math.min(model.radiusX, model.radiusY) < minimumCanvasRadius)) return undefined;
  const minimumRadius = Math.min(model.radiusX, model.radiusY);
  const angleEntries = active.map(index => {
    const segment = segments[index];
    const midpoint = {
      x: (segment.p1.x + segment.p2.x) / 2,
      y: (segment.p1.y + segment.p2.y) / 2,
    };
    const firstAngle = curveParameter(model!, segment.p1);
    const secondAngle = curveParameter(model!, segment.p2);
    const halfSpan = Math.min(Math.PI * 0.22, Math.max(
      Math.abs(normalizeDelta(secondAngle - firstAngle)) / 2,
      distance(segment.p1, segment.p2) / Math.max(1, minimumRadius * 2),
    ));
    return { index, angle: normalizeAngle(curveParameter(model!, midpoint)), halfSpan };
  }).sort((a, b) => a.angle - b.angle);
  // Small circular rooms are commonly interrupted by three or four hosted
  // doors. Four independently evidenced tangent chords are sufficient once
  // the fitted family also passes the analytic residual and raster-support
  // audits below. Requiring six here silently discarded those rooms and left
  // their wall pieces as unrelated straight segments.
  if (angleEntries.length < 4) return undefined;
  let largestGap = -1, largestGapIndex = 0;
  for (let index = 0; index < angleEntries.length; index++) {
    const next = angleEntries[(index + 1) % angleEntries.length];
    const gap = (next.angle - angleEntries[index].angle + TAU) % TAU;
    if (gap > largestGap) { largestGap = gap; largestGapIndex = index; }
  }
  const ordered = angleEntries.slice(largestGapIndex + 1).concat(angleEntries.slice(0, largestGapIndex + 1));
  let previous = -Infinity;
  const unwrapped = ordered.map(entry => {
    let angle = entry.angle;
    while (angle < previous) angle += TAU;
    previous = angle;
    return { ...entry, angle };
  });
  // A door/window is hosted by a continuous analytic wall; it is not a break
  // in the wall object. Join raster intervals across an opening-sized angular
  // gap, while retaining genuinely absent large portions of a curve.
  const joinGap = Math.max(0.12, Math.min(0.5, options.typicalThickness / Math.max(1, minimumRadius) * 14));
  const groups: Array<typeof unwrapped> = [];
  unwrapped.forEach(entry => {
    const current = groups[groups.length - 1];
    if (!current || entry.angle - (current[current.length - 1].angle + current[current.length - 1].halfSpan) > joinGap) groups.push([entry]);
    else current.push(entry);
  });
  const maxPartSpan = Math.PI * 0.72;
  const arcs: Text4hNativeArcRun[] = [];
  groups.forEach(group => {
    const start = group[0].angle - group[0].halfSpan;
    const end = group[group.length - 1].angle + group[group.length - 1].halfSpan;
    const span = end - start;
    const partCount = Math.max(1, Math.ceil(span / maxPartSpan));
    for (let part = 0; part < partCount; part++) {
      const partStart = start + span * part / partCount;
      const partEnd = start + span * (part + 1) / partCount;
      const partSources = group.filter(entry => entry.angle >= partStart - joinGap && entry.angle <= partEnd + joinGap).map(entry => entry.index);
      if (partSources.length < 1 || partEnd - partStart < Math.max(0.08, options.typicalThickness / Math.max(1, minimumRadius) * 1.2)) continue;
      const p1 = model!.pointAt(partStart), p2 = model!.pointAt(partEnd), middle = model!.pointAt((partStart + partEnd) / 2);
      const arc = circleThroughThreePoints(p1, middle, p2);
      if (!arc) continue;
      const familyArcAngles = [p1, middle, p2]
        .map(point => Math.atan2(point.y - arc.center.y, point.x - arc.center.x));
      const familySignedProgress = familyArcAngles.slice(1)
        .reduce((sum, angle, index) => sum + normalizeDelta(angle - familyArcAngles[index]), 0);
      const familyExpectedProgress = familyArcAngles.slice(1)
        .reduce((sum, angle, index) => sum + Math.abs(normalizeDelta(angle - familyArcAngles[index])), 0);
      let orientedArc = { ...arc, counterclockwise: familySignedProgress < 0 };
      if (directedSpan(orientedArc.startAngle, orientedArc.endAngle, orientedArc.counterclockwise) > Math.PI * 1.18
        && familyExpectedProgress <= Math.PI * 1.08) {
        orientedArc = { ...orientedArc, counterclockwise: !orientedArc.counterclockwise };
      }
      if (directedSpan(orientedArc.startAngle, orientedArc.endAngle, orientedArc.counterclockwise) > Math.PI * 1.1) continue;
      const sourcePoints = partSources.flatMap(index => [segments[index].p1, segments[index].p2]);
      const sourceErrors = sourcePoints.map(point => model!.residual(point));
      const support = ellipseRasterSupport({
        center: model!.center,
        radiusX: model!.radiusX,
        radiusY: model!.radiusY,
        startAngle: partStart,
        endAngle: partEnd,
        counterclockwise: false,
      }, options.structuralMask, options.width, options.height, options.typicalThickness);
      if (support < 0.56 || Math.max(...sourceErrors) > Math.max(options.typicalThickness * 2.2, minimumRadius * 0.12)) continue;
      const arcMid = pointOnArc(orientedArc.center, orientedArc.radius, orientedArc.startAngle, orientedArc.endAngle, orientedArc.counterclockwise, 0.5);
      const minimumConfidence = Math.min(...partSources.map(index => segments[index].confidence));
      arcs.push({
        sourceIndices: partSources,
        p1,
        p2,
        // The fitted ellipse is authoritative for its center. The temporary
        // three-point circle is only used to provide a control point for
        // compatibility; mixing its center with ellipse radii creates
        // detached fragments after canvas import.
        center: model!.center,
        radius: orientedArc.radius,
        startAngle: orientedArc.startAngle,
        endAngle: orientedArc.endAngle,
        counterclockwise: orientedArc.counterclockwise,
        controlPoint: { x: 2 * arcMid.x - (p1.x + p2.x) / 2, y: 2 * arcMid.y - (p1.y + p2.y) / 2 },
        confidence: clamp(minimumConfidence * (0.84 + support * 0.16), 0, 0.92),
        rasterSupport: support,
        ellipseRadiusX: model!.radiusX,
        ellipseRadiusY: model!.radiusY,
        ellipseRotation: 0,
        ellipseStartAngle: partStart,
        ellipseEndAngle: partEnd,
        ellipseCounterclockwise: false,
      });
    }
  });
  const totalLength = active.reduce((sum, index) => sum + distance(segments[index].p1, segments[index].p2), 0);
  const coveredSpan = groups.reduce((sum, group) => sum
    + (group[group.length - 1].angle + group[group.length - 1].halfSpan)
    - (group[0].angle - group[0].halfSpan), 0);
  const score = totalLength * Math.max(0.1, Math.min(TAU, coveredSpan)) * (0.7 + arcs.length * 0.04);
  const minimumFamilyLength = Math.max(
    options.typicalThickness * 5,
    Math.min(options.width, options.height) * 0.085,
  );
  if (!arcs.length || totalLength < minimumFamilyLength || coveredSpan < 0.5) return undefined;
  return { model, sourceIndices: active, arcs, score };
};

const fitSeparatedCurveFamilies = (
  segments: Text4hFreeformWallSegment[],
  options: CurveArcOptions,
): Text4hNativeArcRun[] => {
  const eligible = segments.map((segment, index) => ({ segment, index })).filter(({ segment }) =>
    !segment.bridge && segment.confidence >= 0.68 && distance(segment.p1, segment.p2) >= Math.max(3, options.typicalThickness * 0.45));
  const remaining = new Set(eligible.map(item => item.index));
  const arcs: Text4hNativeArcRun[] = [];
  const fitTangentSeededCircleFamily = (indices: number[]) => {
    let best: CurveFamilyCandidate | undefined;
    const maximumPairs = Math.min(indices.length, 36);
    for (let first = 0; first < maximumPairs; first++) {
      const firstSegment = segments[indices[first]];
      const firstMid = { x: (firstSegment.p1.x + firstSegment.p2.x) / 2, y: (firstSegment.p1.y + firstSegment.p2.y) / 2 };
      const firstVector = { x: firstSegment.p2.x - firstSegment.p1.x, y: firstSegment.p2.y - firstSegment.p1.y };
      const firstNormal = { x: -firstVector.y, y: firstVector.x };
      for (let second = first + 1; second < maximumPairs; second++) {
        const secondSegment = segments[indices[second]];
        const secondMid = { x: (secondSegment.p1.x + secondSegment.p2.x) / 2, y: (secondSegment.p1.y + secondSegment.p2.y) / 2 };
        const secondVector = { x: secondSegment.p2.x - secondSegment.p1.x, y: secondSegment.p2.y - secondSegment.p1.y };
        const secondNormal = { x: -secondVector.y, y: secondVector.x };
        const determinant = firstNormal.x * secondNormal.y - firstNormal.y * secondNormal.x;
        if (Math.abs(determinant) < 0.18 * Math.hypot(firstNormal.x, firstNormal.y) * Math.hypot(secondNormal.x, secondNormal.y)) continue;
        const delta = { x: secondMid.x - firstMid.x, y: secondMid.y - firstMid.y };
        const parameter = (delta.x * secondNormal.y - delta.y * secondNormal.x) / determinant;
        const center = { x: firstMid.x + firstNormal.x * parameter, y: firstMid.y + firstNormal.y * parameter };
        const radius = (distance(center, firstSegment.p1) + distance(center, firstSegment.p2)
          + distance(center, secondSegment.p1) + distance(center, secondSegment.p2)) / 4;
        if (!Number.isFinite(radius) || radius < options.typicalThickness * 3.2
          || radius > Math.hypot(options.width, options.height) * 1.2) continue;
        const tolerance = Math.max(2.2, options.typicalThickness * 1.45, radius * 0.055);
        const inliers = indices.filter(index => {
          const segment = segments[index];
          const residual = Math.max(
            Math.abs(distance(center, segment.p1) - radius),
            Math.abs(distance(center, segment.p2) - radius),
          );
          if (residual > tolerance) return false;
          const midpoint = { x: (segment.p1.x + segment.p2.x) / 2, y: (segment.p1.y + segment.p2.y) / 2 };
          const radial = { x: midpoint.x - center.x, y: midpoint.y - center.y };
          const tangent = { x: segment.p2.x - segment.p1.x, y: segment.p2.y - segment.p1.y };
          return Math.abs(radial.x * tangent.x + radial.y * tangent.y)
            / Math.max(1e-6, Math.hypot(radial.x, radial.y) * Math.hypot(tangent.x, tangent.y)) <= 0.52;
        });
        if (inliers.length < 4) continue;
        const candidate = fitSeparatedCurveFamily(segments, inliers, options);
        if (candidate && (!best || candidate.score > best.score)) best = candidate;
      }
    }
    return best;
  };
  const absorbHostedCurveBridges = (candidate: CurveFamilyCandidate) => {
    const model = candidate.model;
    const tolerance = Math.max(2.4, options.typicalThickness * 1.8, Math.min(model.radiusX, model.radiusY) * 0.07);
    const alreadyClaimed = new Set(arcs.flatMap(arc => arc.sourceIndices));
    const bridgeIndices = segments.map((segment, index) => ({ segment, index })).filter(({ segment, index }) =>
      segment.bridge
      && !alreadyClaimed.has(index)
      && Math.max(model.residual(segment.p1), model.residual(segment.p2)) <= tolerance
      && model.tangentSupport(segment) <= 0.72);
    bridgeIndices.forEach(({ segment, index }) => {
      const midpoint = { x: (segment.p1.x + segment.p2.x) / 2, y: (segment.p1.y + segment.p2.y) / 2 };
      const angle = normalizeAngle(curveParameter(model, midpoint));
      const containing = candidate.arcs.find(arc => {
        const start = normalizeAngle(arc.ellipseStartAngle ?? curveParameter(model, arc.p1));
        const end = normalizeAngle(arc.ellipseEndAngle ?? curveParameter(model, arc.p2));
        const span = (end - start + TAU) % TAU;
        const progress = (angle - start + TAU) % TAU;
        return progress <= span + 0.12;
      });
      const matchesHostedGap = options.hostedGaps?.some(gap => {
        const direct = distance(gap.p1, segment.p1) + distance(gap.p2, segment.p2);
        const reversed = distance(gap.p1, segment.p2) + distance(gap.p2, segment.p1);
        return Math.min(direct, reversed) <= Math.max(3, options.typicalThickness * 0.7);
      });
      if (containing) {
        containing.sourceIndices.push(index);
      } else {
        const firstAngle = normalizeAngle(curveParameter(model, segment.p1));
        const secondAngle = normalizeAngle(curveParameter(model, segment.p2));
        const positiveSpan = (secondAngle - firstAngle + TAU) % TAU;
        const partStart = positiveSpan <= Math.PI ? firstAngle : secondAngle;
        const partSpan = positiveSpan <= Math.PI ? positiveSpan : TAU - positiveSpan;
        // A normal hosted opening occupies a local part of its curve family.
        // A much larger chord is an endpoint-pairing error: suppress its
        // straight proxy below, but do not invent an unevidenced curved wall.
        // A bridge whose two endpoints belong to this analytic family is the
        // straight host proxy emitted around an aperture. It must never remain
        // as a wall chord over the curved wall. Rebuild only a local arc; very
        // large pairings are suppressed below without inventing a facade span.
        if (partSpan <= (matchesHostedGap ? 0.9 : 0.72)) {
          const partEnd = partStart + partSpan;
          const p1 = model.pointAt(partStart), p2 = model.pointAt(partEnd), middle = model.pointAt((partStart + partEnd) / 2);
          const fitted = circleThroughThreePoints(p1, middle, p2);
          if (fitted) {
            const arcMid = pointOnArc(fitted.center, fitted.radius, fitted.startAngle, fitted.endAngle, false, 0.5);
            candidate.arcs.push({
              sourceIndices: [index], p1, p2,
              center: model.center,
              radius: fitted.radius,
              startAngle: fitted.startAngle,
              endAngle: fitted.endAngle,
              counterclockwise: false,
              controlPoint: { x: 2 * arcMid.x - (p1.x + p2.x) / 2, y: 2 * arcMid.y - (p1.y + p2.y) / 2 },
              confidence: clamp(segment.confidence, 0, 0.86),
              rasterSupport: 0,
              ellipseRadiusX: model.radiusX,
              ellipseRadiusY: model.radiusY,
              ellipseRotation: 0,
              ellipseStartAngle: partStart,
              ellipseEndAngle: partEnd,
              ellipseCounterclockwise: false,
            });
          }
        }
        }
      candidate.sourceIndices.push(index);
      remaining.delete(index);
    });
  };
  for (let family = 0; family < 4 && remaining.size >= 4; family++) {
    const remainingIndices = Array.from(remaining);
    const candidate = fitSeparatedCurveFamily(segments, remainingIndices, options)
      || fitTangentSeededCircleFamily(remainingIndices);
    if (!candidate) {
      // Once the dominant facade is removed, separate interior circles and
      // side ellipses spatially instead of forcing all remaining wall systems
      // through one incompatible global fit.
      const clusterDistance = Math.max(options.typicalThickness * 5.2, Math.min(options.width, options.height) * 0.075);
      const pending = Array.from(remaining);
      const clusters: number[][] = [];
      const visited = new Set<number>();
      const segmentDistance = (first: Text4hFreeformWallSegment, second: Text4hFreeformWallSegment) => Math.min(
        distance(first.p1, second.p1), distance(first.p1, second.p2),
        distance(first.p2, second.p1), distance(first.p2, second.p2),
      );
      pending.forEach(seed => {
        if (visited.has(seed)) return;
        const cluster: number[] = [];
        const queue = [seed];
        visited.add(seed);
        while (queue.length) {
          const current = queue.shift()!;
          cluster.push(current);
          pending.forEach(next => {
            if (visited.has(next) || segmentDistance(segments[current], segments[next]) > clusterDistance) return;
            visited.add(next);
            queue.push(next);
          });
        }
        if (cluster.length >= 4) clusters.push(cluster);
      });
      const clusteredCandidates = clusters
        .map(cluster => fitSeparatedCurveFamily(segments, cluster, options))
        .filter((value): value is CurveFamilyCandidate => !!value)
        .sort((a, b) => b.score - a.score);
      const clustered = clusteredCandidates[0];
      if (!clustered) break;
      absorbHostedCurveBridges(clustered);
      arcs.push(...clustered.arcs);
      clustered.sourceIndices.forEach(index => remaining.delete(index));
      continue;
    }
    absorbHostedCurveBridges(candidate);
    arcs.push(...candidate.arcs);
    candidate.sourceIndices.forEach(index => remaining.delete(index));
  }
  return arcs;
};

const buildRuns = (segments: Text4hFreeformWallSegment[], typicalThickness: number): OrderedRun[] => {
  const eligible = segments.map((segment, index) => ({ segment, index })).filter(({ segment }) =>
    !segment.bridge
    && segment.confidence >= 0.78
    && distance(segment.p1, segment.p2) >= Math.max(3, typicalThickness * 0.65));
  if (eligible.length < 3) return [];
  const endpoints = eligible.flatMap(({ segment, index }) => [
    { segmentIndex: index, end: 0 as const, point: segment.p1 },
    { segmentIndex: index, end: 1 as const, point: segment.p2 },
  ]);
  const parent = endpoints.map((_, index) => index);
  const root = (index: number): number => parent[index] === index ? index : (parent[index] = root(parent[index]));
  const join = (first: number, second: number) => {
    const firstRoot = root(first), secondRoot = root(second);
    if (firstRoot !== secondRoot) parent[secondRoot] = firstRoot;
  };
  const joinTolerance = Math.max(1.5, typicalThickness * 0.24);
  for (let first = 0; first < endpoints.length; first++) {
    for (let second = first + 1; second < endpoints.length; second++) {
      if (endpoints[first].segmentIndex === endpoints[second].segmentIndex) continue;
      if (distance(endpoints[first].point, endpoints[second].point) <= joinTolerance) join(first, second);
    }
  }
  const nodesBySegment = new Map<number, [number, number]>();
  eligible.forEach(({ index }, eligibleIndex) => {
    nodesBySegment.set(index, [root(eligibleIndex * 2), root(eligibleIndex * 2 + 1)]);
  });
  const incident = new Map<number, number[]>();
  nodesBySegment.forEach((nodes, segmentIndex) => nodes.forEach(node => {
    const current = incident.get(node) || [];
    current.push(segmentIndex);
    incident.set(node, current);
  }));
  const visited = new Set<number>();
  const walk = (startSegment: number, startNode: number): OrderedRun => {
    const points: Text4hPixelPoint[] = [];
    const sourceIndices: number[] = [];
    let segmentIndex = startSegment;
    let enteringNode = startNode;
    while (!visited.has(segmentIndex)) {
      visited.add(segmentIndex);
      const segment = segments[segmentIndex];
      const nodes = nodesBySegment.get(segmentIndex)!;
      const forward = nodes[0] === enteringNode;
      if (!points.length) points.push(forward ? segment.p1 : segment.p2);
      points.push(forward ? segment.p2 : segment.p1);
      sourceIndices.push(segmentIndex);
      const leavingNode = forward ? nodes[1] : nodes[0];
      const nextCandidates = (incident.get(leavingNode) || []).filter(candidate => !visited.has(candidate));
      if ((incident.get(leavingNode) || []).length !== 2 || !nextCandidates.length) break;
      segmentIndex = nextCandidates[0];
      enteringNode = leavingNode;
    }
    return { points, sourceIndices, closed: points.length > 3 && distance(points[0], points[points.length - 1]) <= joinTolerance };
  };
  const runs: OrderedRun[] = [];
  eligible.forEach(({ index }) => {
    if (visited.has(index)) return;
    const nodes = nodesBySegment.get(index)!;
    const startNode = nodes.find(node => (incident.get(node) || []).length !== 2);
    if (startNode !== undefined) runs.push(walk(index, startNode));
  });
  eligible.forEach(({ index }) => {
    if (visited.has(index)) return;
    runs.push(walk(index, nodesBySegment.get(index)![0]));
  });
  return runs;
};

const splitRunAtCurvatureChanges = (run: OrderedRun): OrderedRun[] => {
  if (run.sourceIndices.length < 5 || run.points.length < 6) return [run];
  const headings = run.points.slice(1).map((point, index) => Math.atan2(
    point.y - run.points[index].y,
    point.x - run.points[index].x,
  ));
  const turns = headings.slice(1).map((heading, index) => normalizeDelta(heading - headings[index]));
  const medianMagnitude = (values: number[]) => {
    const sorted = values.map(Math.abs).filter(value => value > 0.008).sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  };
  const cuts: number[] = [];
  for (let junction = 1; junction < run.sourceIndices.length - 1; junction++) {
    const turn = Math.abs(turns[junction - 1] || 0);
    const before = medianMagnitude(turns.slice(Math.max(0, junction - 3), junction));
    const after = medianMagnitude(turns.slice(junction, Math.min(turns.length, junction + 3)));
    const minimum = Math.max(0.018, Math.min(before || after, after || before));
    const maximum = Math.max(before, after);
    const abruptCorner = turn >= Math.PI / 8;
    const curvatureStep = maximum >= 0.075 && maximum / minimum >= 2.35;
    if (!abruptCorner && !curvatureStep) continue;
    const cut = junction + 1;
    if (cut >= 2 && run.sourceIndices.length - cut >= 2
      && (!cuts.length || cut - cuts[cuts.length - 1] >= 2)) cuts.push(cut);
  }
  if (!cuts.length) return [run];
  const parts: OrderedRun[] = [];
  let start = 0;
  [...cuts, run.sourceIndices.length].forEach(end => {
    if (end - start >= 2) parts.push({
      points: run.points.slice(start, end + 1),
      sourceIndices: run.sourceIndices.slice(start, end),
      closed: false,
    });
    start = end;
  });
  return parts.length ? parts : [run];
};

const fitRun = (
  run: OrderedRun,
  segments: Text4hFreeformWallSegment[],
  options: CurveArcOptions,
): Text4hNativeArcRun[] | undefined => {
  if (run.sourceIndices.length < 2 || run.points.length < 3) return undefined;
  const threePoint = run.points.length === 3
    ? circleThroughThreePoints(run.points[0], run.points[1], run.points[2])
    : undefined;
  const global = leastSquaresCircle(run.points) || (threePoint ? (() => {
    const angles = run.points.map(point => Math.atan2(point.y - threePoint.center.y, point.x - threePoint.center.x));
    const deltas = angles.slice(1).map((angle, index) => normalizeDelta(angle - angles[index]));
    const signedSpan = deltas.reduce((sum, delta) => sum + delta, 0);
    return {
      center: threePoint.center,
      radius: threePoint.radius,
      rmsError: 0,
      maximumError: 0,
      signedSpan,
      consistency: 1,
      maximumStep: Math.max(...deltas.map(Math.abs)),
    };
  })() : undefined);
  if (!global) return undefined;
  const span = Math.abs(global.signedSpan);
  // A thick raster wall can make the thinned centerline alternate slightly
  // between its two ink faces. Keep the tolerance inside one wall thickness;
  // the independent continuous-raster-support gate still rejects polygonal
  // or mixed straight/curved runs.
  const radialTolerance = Math.max(1.2, options.typicalThickness * 0.5);
  const maximumTolerance = Math.max(2, options.typicalThickness * 0.9);
  const meaningfulSagitta = global.radius * (1 - Math.cos(Math.min(Math.PI, span) / 2));
  const strictCurveEvidence = options.mode === 'curved' || options.curveEvidence === true;
  const minimumCurveSpan = strictCurveEvidence ? Math.PI / 14 : Math.PI / 7;
  const minimumSagitta = options.typicalThickness * (strictCurveEvidence ? 0.25 : 0.65);
  if (global.radius < options.typicalThickness * (strictCurveEvidence ? 3.2 : 1.8)
    || global.radius > Math.hypot(options.width, options.height) * 3
    || span < minimumCurveSpan
    || global.consistency < 0.9
    || global.maximumStep > Math.PI * 0.32
    || global.rmsError > radialTolerance
    || global.maximumError > maximumTolerance
    || meaningfulSagitta < minimumSagitta) return undefined;

  const angles = run.points.map(point => Math.atan2(point.y - global.center.y, point.x - global.center.x));
  const progress = [0];
  for (let index = 1; index < angles.length; index++) {
    progress.push(progress[index - 1] + Math.abs(normalizeDelta(angles[index] - angles[index - 1])));
  }
  const totalProgress = progress[progress.length - 1];
  const partCount = Math.max(1, Math.ceil(totalProgress / (Math.PI * 0.7)));
  const breakpoints = [0];
  for (let part = 1; part < partCount; part++) {
    const target = totalProgress * part / partCount;
    let bestIndex = breakpoints[breakpoints.length - 1] + 2;
    let bestError = Infinity;
    for (let index = bestIndex; index <= run.points.length - 3; index++) {
      const error = Math.abs(progress[index] - target);
      if (error < bestError) { bestError = error; bestIndex = index; }
    }
    if (bestIndex - breakpoints[breakpoints.length - 1] >= 2) breakpoints.push(bestIndex);
  }
  breakpoints.push(run.points.length - 1);

  const arcs: Text4hNativeArcRun[] = [];
  for (let part = 1; part < breakpoints.length; part++) {
    const startIndex = breakpoints[part - 1];
    const endIndex = breakpoints[part];
    if (endIndex - startIndex < 2) return undefined;
    const targetProgress = (progress[startIndex] + progress[endIndex]) / 2;
    let middleIndex = startIndex + 1;
    for (let index = startIndex + 1; index < endIndex; index++) {
      if (Math.abs(progress[index] - targetProgress) < Math.abs(progress[middleIndex] - targetProgress)) middleIndex = index;
    }
    const arc = circleThroughThreePoints(run.points[startIndex], run.points[middleIndex], run.points[endIndex]);
    if (!arc) return undefined;
    const partAngles = run.points.slice(startIndex, endIndex + 1)
      .map(point => Math.atan2(point.y - arc.center.y, point.x - arc.center.x));
    const signedPartProgress = partAngles.slice(1)
      .reduce((sum, angle, index) => sum + normalizeDelta(angle - partAngles[index]), 0);
    const expectedPartProgress = partAngles.slice(1)
      .reduce((sum, angle, index) => sum + Math.abs(normalizeDelta(angle - partAngles[index])), 0);
    // Three-point fitting can choose the major route when the endpoints sit
    // close together across the angle wrap. The ordered raster path is the
    // authority for direction; a short wall fragment must never become a
    // near-full circle in the editor/canvas import.
    let orientedArc = { ...arc, counterclockwise: signedPartProgress < 0 };
    if (strictCurveEvidence && directedSpan(orientedArc.startAngle, orientedArc.endAngle, orientedArc.counterclockwise) > Math.PI * 1.18
      && expectedPartProgress <= Math.PI * 1.08) {
      orientedArc = { ...orientedArc, counterclockwise: !orientedArc.counterclockwise };
    }
    if (strictCurveEvidence && directedSpan(orientedArc.startAngle, orientedArc.endAngle, orientedArc.counterclockwise) > Math.PI * 1.1) return undefined;
    const partPoints = run.points.slice(startIndex, endIndex + 1);
    const partErrors = partPoints.map(point => Math.abs(distance(orientedArc.center, point) - orientedArc.radius));
    const rmsError = Math.sqrt(partErrors.reduce((sum, error) => sum + error * error, 0) / partErrors.length);
    const support = rasterSupport(orientedArc, options.structuralMask, options.width, options.height, options.typicalThickness);
    // Three-point arcs keep the original run endpoints connected. Their
    // center can be more sensitive to a locally noisy skeleton point than the
    // global least-squares fit, so a wider point residual is admitted only
    // when the actual drawn arc is supported almost continuously by raster ink.
    if (Math.abs(orientedArc.radius - global.radius) > Math.max(options.typicalThickness * 1.4, global.radius * 0.08)
      || rmsError > Math.max(radialTolerance, options.typicalThickness * 0.65)
      || Math.max(...partErrors) > Math.max(maximumTolerance, options.typicalThickness * 1.6)
      || support < 0.94) return undefined;
    const arcMid = pointOnArc(orientedArc.center, orientedArc.radius, orientedArc.startAngle, orientedArc.endAngle, orientedArc.counterclockwise, 0.5);
    const p1 = run.points[startIndex], p2 = run.points[endIndex];
    const sourceIndices = run.sourceIndices.slice(startIndex, endIndex);
    const minimumConfidence = Math.min(...sourceIndices.map(index => segments[index].confidence));
    arcs.push({
      sourceIndices,
      p1,
      p2,
      center: orientedArc.center,
      radius: orientedArc.radius,
      startAngle: orientedArc.startAngle,
      endAngle: orientedArc.endAngle,
      counterclockwise: orientedArc.counterclockwise,
      controlPoint: {
        x: 2 * arcMid.x - (p1.x + p2.x) / 2,
        y: 2 * arcMid.y - (p1.y + p2.y) / 2,
      },
      confidence: clamp(minimumConfidence * (0.9 + support * 0.1), 0, 0.94),
      rasterSupport: support,
    });
  }
  return arcs;
};

export const consolidateText4hCurveArcs = (
  segments: Text4hFreeformWallSegment[],
  options: CurveArcOptions,
): { arcs: Text4hNativeArcRun[]; retainedSegments: Text4hFreeformWallSegment[] } => {
  // Orthogonal and angular modes are deliberately byte-for-byte inactive.
  // Hybrid mode is admitted only because its curved subset must share the same
  // final representation; every candidate still has to pass the circle fit and
  // continuous raster-support gates below.
  if ((options.mode !== 'curved' && options.mode !== 'hybrid') || segments.length < 4) {
    return { arcs: [], retainedSegments: segments };
  }
  // Fit both representations, then allow a continuously supported local arc
  // to override only the family part whose own source chords contradict the
  // global ellipse. Complete circles/ellipses keep their common family; an
  // offset lobe or a compound circular shell keeps its local centre/radius.
  // This avoids the two failure modes of a fixed ordering: local chords can
  // fragment a real ellipse, while a global ellipse can flatten real lobes.
  const localCandidates = buildRuns(segments, options.typicalThickness)
    .flatMap(splitRunAtCurvatureChanges)
    .flatMap(run => fitRun(run, segments, options) || []);
  const fittedFamilyArcs = fitSeparatedCurveFamilies(segments, options);
  const localDepartureTolerance = Math.max(1.5, options.typicalThickness * 0.45);
  const localSamples = (arc: Text4hNativeArcRun) => [0, 0.25, 0.5, 0.75, 1]
    .map(t => pointOnArc(arc.center, arc.radius, arc.startAngle, arc.endAngle, arc.counterclockwise, t));
  const familyResidual = (family: Text4hNativeArcRun, point: Text4hPixelPoint) => {
    const radiusX = family.ellipseRadiusX ?? family.radius;
    const radiusY = family.ellipseRadiusY ?? family.radius;
    return Math.abs(Math.hypot(
      (point.x - family.center.x) / Math.max(1e-6, radiusX),
      (point.y - family.center.y) / Math.max(1e-6, radiusY),
    ) - 1) * Math.min(radiusX, radiusY);
  };
  const contradictoryLocalArcs = localCandidates.filter(local => {
    if (local.rasterSupport < 0.94) return false;
    const sourceSet = new Set(local.sourceIndices);
    const overlappingFamilies = fittedFamilyArcs.filter(family =>
      family.sourceIndices.some(index => sourceSet.has(index)));
    if (!overlappingFamilies.length) return false;
    const residuals = localSamples(local).map(point =>
      Math.min(...overlappingFamilies.map(family => familyResidual(family, point))));
    const departingSamples = residuals.filter(residual => residual > localDepartureTolerance).length;
    const rmsResidual = Math.sqrt(residuals.reduce((sum, residual) => sum + residual * residual, 0) / residuals.length);
    // One noisy skeleton endpoint at a junction must not fragment a coherent
    // circle/ellipse. A local family overrides it only when most of the
    // independently raster-supported arc departs from that analytic shell.
    return departingSamples >= 3 && rmsResidual > localDepartureTolerance * 1.15;
  });
  const localConsolidated = new Set(contradictoryLocalArcs.flatMap(arc => arc.sourceIndices));
  const familyArcs = fittedFamilyArcs.filter(family =>
    !family.sourceIndices.some(index => localConsolidated.has(index)));
  const familyConsolidated = new Set([
    ...familyArcs.flatMap(arc => arc.sourceIndices),
    ...contradictoryLocalArcs.flatMap(arc => arc.sourceIndices),
  ]);
  const remainingSegments = segments.filter((_, index) => !familyConsolidated.has(index));
  const remainingIndexMap = segments
    .map((_, index) => index)
    .filter(index => !familyConsolidated.has(index));
  const orderedArcs = buildRuns(remainingSegments, options.typicalThickness)
    .flatMap(splitRunAtCurvatureChanges)
    .flatMap(run => fitRun(run, remainingSegments, options) || [])
    .map(arc => ({
      ...arc,
      sourceIndices: arc.sourceIndices.map(index => remainingIndexMap[index]),
    }));
  const curveCandidates = [...familyArcs, ...contradictoryLocalArcs, ...orderedArcs];
  const sameEllipseFamily = (first: Text4hNativeArcRun, second: Text4hNativeArcRun) =>
    first.ellipseRadiusX !== undefined && first.ellipseRadiusY !== undefined
    && second.ellipseRadiusX !== undefined && second.ellipseRadiusY !== undefined
    && distance(first.center, second.center) <= options.typicalThickness * 0.8
    && Math.abs(first.ellipseRadiusX - second.ellipseRadiusX) <= options.typicalThickness * 1.2
    && Math.abs(first.ellipseRadiusY - second.ellipseRadiusY) <= options.typicalThickness * 1.2;
  const familySources = (arc: Text4hNativeArcRun) => {
    const family = arc.ellipseRadiusX === undefined
      ? [arc]
      : curveCandidates.filter(candidate => sameEllipseFamily(arc, candidate));
    const indices = Array.from(new Set(family.flatMap(candidate => candidate.sourceIndices)));
    return indices.map(index => segments[index]).filter((segment): segment is Text4hFreeformWallSegment => !!segment);
  };
  const exteriorRatio = (arc: Text4hNativeArcRun) => {
    const sources = familySources(arc);
    return options.exteriorEvidence && sources.length
      ? sources.filter(segment => options.exteriorEvidence!(segment)).length / sources.length
      : 0;
  };
  const dominantExteriorFamily = options.mode === 'hybrid' && options.exteriorEvidence
    ? curveCandidates.filter(arc => arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined
      && exteriorRatio(arc) >= 0.35
      && text4hCurveArcSourceEnvelopeCoherentForTest(
        arc,
        familySources(arc),
        options.width,
        options.height,
        options.typicalThickness,
      ))
      .sort((first, second) =>
        second.ellipseRadiusX! * second.ellipseRadiusY! - first.ellipseRadiusX! * first.ellipseRadiusY!)[0]
    : undefined;
  const fullyInsideDominantExterior = (arc: Text4hNativeArcRun) => {
    if (!dominantExteriorFamily || sameEllipseFamily(arc, dominantExteriorFamily)) return false;
    const arcMidpoint = arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined
      ? (() => {
        const start = arc.ellipseStartAngle ?? arc.startAngle;
        const end = arc.ellipseEndAngle ?? arc.endAngle;
        const counterclockwise = arc.ellipseCounterclockwise ?? arc.counterclockwise;
        const span = directedSpan(start, end, counterclockwise);
        const angle = counterclockwise ? start - span / 2 : start + span / 2;
        const rotation = arc.ellipseRotation || 0;
        const localX = Math.cos(angle) * arc.ellipseRadiusX;
        const localY = Math.sin(angle) * arc.ellipseRadiusY;
        return {
          x: arc.center.x + localX * Math.cos(rotation) - localY * Math.sin(rotation),
          y: arc.center.y + localX * Math.sin(rotation) + localY * Math.cos(rotation),
        };
      })()
      : pointOnArc(arc.center, arc.radius, arc.startAngle, arc.endAngle, arc.counterclockwise, 0.5);
    const dominantRotation = dominantExteriorFamily.ellipseRotation || 0;
    const cosR = Math.cos(dominantRotation), sinR = Math.sin(dominantRotation);
    const radiusX = dominantExteriorFamily.ellipseRadiusX!;
    const radiusY = dominantExteriorFamily.ellipseRadiusY!;
    const margin = options.typicalThickness * 1.5 / Math.max(1, Math.min(radiusX, radiusY));
    return [arc.p1, arcMidpoint, arc.p2].every(point => {
      const dx = point.x - dominantExteriorFamily.center.x;
      const dy = point.y - dominantExteriorFamily.center.y;
      const localX = dx * cosR + dy * sinR;
      const localY = -dx * sinR + dy * cosR;
      return Math.hypot(localX / radiusX, localY / radiusY) <= 1 - margin;
    });
  };
  const arcs = curveCandidates.filter(arc => {
    const sources = familySources(arc);
    if (options.mode === 'hybrid'
      && !text4hCurveArcSourceEnvelopeCoherentForTest(
        arc,
        sources,
        options.width,
        options.height,
        options.typicalThickness,
      )) return false;
    if (options.mode !== 'hybrid' || !options.exteriorEvidence) return true;
    const exteriorCount = sources.filter(segment => options.exteriorEvidence!(segment)).length;
    if (!fullyInsideDominantExterior(arc)
      && exteriorCount >= Math.max(1, Math.ceil(sources.length * 0.35))) return true;
    if (!dominantExteriorFamily && options.openShellExteriorEvidence?.(arc, sources)) return true;
    if (options.interiorArchitecturalEvidence?.(arc, sources)) return true;
    if (!options.interiorWindowEvidence) return false;
    const windowCount = sources.filter(segment => options.interiorWindowEvidence!(segment)).length;
    const sourceLength = sources.reduce((sum, segment) => sum + distance(segment.p1, segment.p2), 0);
    return windowCount >= Math.max(2, Math.ceil(sources.length * 0.6))
      && sourceLength >= Math.min(options.width, options.height) * 0.08;
  });
  const consolidated = new Set(arcs.flatMap(arc => arc.sourceIndices));
  const curveCoversSegment = (segment: Text4hFreeformWallSegment, arc: Text4hNativeArcRun) => {
    const points = [segment.p1, segment.p2];
    const directionLength = Math.max(1e-6, distance(segment.p1, segment.p2));
    const tangent = { x: (segment.p2.x - segment.p1.x) / directionLength, y: (segment.p2.y - segment.p1.y) / directionLength };
    const ellipse = arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined;
    const residuals = points.map(point => {
      const dx = point.x - arc.center.x, dy = point.y - arc.center.y;
      if (!ellipse) return Math.abs(Math.hypot(dx, dy) - arc.radius);
      return Math.abs(Math.hypot(dx / arc.ellipseRadiusX!, dy / arc.ellipseRadiusY!) - 1)
        * Math.min(arc.ellipseRadiusX!, arc.ellipseRadiusY!);
    });
    const midpoint = {
      x: (segment.p1.x + segment.p2.x) / 2,
      y: (segment.p1.y + segment.p2.y) / 2,
    };
    const gradient = ellipse
      ? { x: (midpoint.x - arc.center.x) / (arc.ellipseRadiusX! ** 2), y: (midpoint.y - arc.center.y) / (arc.ellipseRadiusY! ** 2) }
      : { x: midpoint.x - arc.center.x, y: midpoint.y - arc.center.y };
    const gradientLength = Math.max(1e-6, Math.hypot(gradient.x, gradient.y));
    const normalAlignment = Math.abs((gradient.x * tangent.x + gradient.y * tangent.y) / gradientLength);
    return Math.max(...residuals) <= Math.max(options.typicalThickness * 2.4, Math.min(arc.ellipseRadiusX ?? arc.radius, arc.ellipseRadiusY ?? arc.radius) * 0.13)
      && normalAlignment <= 0.68;
  };
  const retainedSegments = segments.filter((segment, index) => {
    if (consolidated.has(index)) return false;
    // Only the proven curvilinear hybrid path may discard an exterior chord
    // after it has been replaced by a supported native curve. Angular plans
    // continue to retain every non-axis chord exactly as before.
    const hostedCurveBridge = segment.bridge && options.hostedGaps?.some(gap => {
      const direct = distance(gap.p1, segment.p1) + distance(gap.p2, segment.p2);
      const reversed = distance(gap.p1, segment.p2) + distance(gap.p2, segment.p1);
      return Math.min(direct, reversed) <= Math.max(3, options.typicalThickness * 0.7);
    });
    if (hostedCurveBridge && arcs.some(arc => curveCoversSegment(segment, arc))) return false;
    const hasEllipseFamily = arcs.some(arc => arc.ellipseRadiusX !== undefined && arc.ellipseRadiusY !== undefined);
    if (!hasEllipseFamily || options.mode !== 'hybrid' || !options.exteriorEvidence || !options.exteriorEvidence(segment)) return true;
    return !arcs.some(arc => curveCoversSegment(segment, arc));
  });
  return {
    arcs,
    retainedSegments,
  };
};
