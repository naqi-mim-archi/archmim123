import type { ArchElement, Point } from '../../types';

export const TAU = Math.PI * 2;
const EPSILON = 1e-9;

export type CurveSource = 'line' | 'arc' | 'circle' | 'ellipse';

export const normalizeRadians = (angle: number): number => {
  const value = angle % TAU;
  return value < 0 ? value + TAU : value;
};

export const norm01 = (value: number): number => ((value % 1) + 1) % 1;

export const pointDistance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export const rotatePoint = (point: Point, pivot: Point, angleRad: number): Point => {
  const dx = point.x - pivot.x;
  const dy = point.y - pivot.y;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  };
};

export const translatePoint = (point: Point, dx: number, dy: number): Point => ({
  x: point.x + dx,
  y: point.y + dy,
});

export const getCurveSource = (element: ArchElement): CurveSource | null => {
  const source = element.wallSource || (['arc', 'circle', 'ellipse'].includes(element.type)
    ? element.type
    : element.isCurved
      ? element.type
      : null);

  if (source === 'arc' || source === 'circle' || source === 'ellipse') return source;
  if (element.isCurved && element.controlPoint) return 'arc';
  if (element.p1 && element.p2) return 'line';
  return null;
};

export const isCurvedElement = (element: ArchElement): boolean => {
  const source = getCurveSource(element);
  return source === 'arc' || source === 'circle' || source === 'ellipse';
};

export const isClosedCurveElement = (element: ArchElement): boolean => {
  const source = getCurveSource(element);
  if (element.startT !== undefined || element.endT !== undefined) return false;
  if (source === 'circle') return true;
  if (source !== 'ellipse') return false;
  if (element.ellipseStartAngle === undefined && element.ellipseEndAngle === undefined) return true;
  return angleSpan(element.ellipseStartAngle ?? 0, element.ellipseEndAngle ?? TAU, element.ellipseCounterclockwise) >= TAU - 1e-6;
};

export const interpolateAngle = (start: number, end: number, t: number, counterclockwise = false): number => {
  let span = counterclockwise ? start - end : end - start;
  if (span < 0) span += TAU;
  return counterclockwise ? start - span * t : start + span * t;
};

export const angleSpan = (start: number, end: number, counterclockwise = false): number => {
  let span = counterclockwise ? start - end : end - start;
  if (span < 0) span += TAU;
  return span;
};

export const pointOnCircularArc = (center: Point, radius: number, angle: number): Point => ({
  x: center.x + Math.cos(angle) * radius,
  y: center.y + Math.sin(angle) * radius,
});

export const quadraticControlForCircularArc = (
  center: Point,
  radius: number,
  startAngle: number,
  endAngle: number,
  counterclockwise = false,
): Point => {
  const p1 = pointOnCircularArc(center, radius, startAngle);
  const p2 = pointOnCircularArc(center, radius, endAngle);
  const midAngle = interpolateAngle(startAngle, endAngle, 0.5, counterclockwise);
  const mid = pointOnCircularArc(center, radius, midAngle);
  return {
    x: 2 * mid.x - (p1.x + p2.x) / 2,
    y: 2 * mid.y - (p1.y + p2.y) / 2,
  };
};

export const circularArcFromThreePoints = (start: Point, mid: Point, end: Point): {
  center: Point;
  radius: number;
  startAngle: number;
  endAngle: number;
  counterclockwise: boolean;
} | null => {
  const ax = start.x;
  const ay = start.y;
  const bx = mid.x;
  const by = mid.y;
  const cx = end.x;
  const cy = end.y;
  const determinant = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(determinant) < EPSILON) return null;
  const aSq = ax * ax + ay * ay;
  const bSq = bx * bx + by * by;
  const cSq = cx * cx + cy * cy;
  const center = {
    x: (aSq * (by - cy) + bSq * (cy - ay) + cSq * (ay - by)) / determinant,
    y: (aSq * (cx - bx) + bSq * (ax - cx) + cSq * (bx - ax)) / determinant,
  };
  const radius = pointDistance(center, start);
  if (!Number.isFinite(radius) || radius < EPSILON) return null;
  const startAngle = normalizeRadians(Math.atan2(start.y - center.y, start.x - center.x));
  const endAngle = normalizeRadians(Math.atan2(end.y - center.y, end.x - center.x));
  const ccwMid = pointOnCircularArc(center, radius, interpolateAngle(startAngle, endAngle, 0.5, true));
  const cwMid = pointOnCircularArc(center, radius, interpolateAngle(startAngle, endAngle, 0.5, false));
  return {
    center,
    radius,
    startAngle,
    endAngle,
    counterclockwise: pointDistance(mid, ccwMid) < pointDistance(mid, cwMid),
  };
};

export const getCurveBoxPoints = (element: ArchElement): { boxP1: Point; boxP2: Point } | null => {
  if (!element.p1 || !element.p2) return null;
  const boxP1 = element.startT !== undefined && element.p3 ? element.p3 : element.p1;
  const boxP2 = element.startT !== undefined && element.p4 ? element.p4 : element.p2;
  return { boxP1, boxP2 };
};

const mappedTurn = (element: ArchElement, t: number): number => {
  if (element.startT === undefined || element.endT === undefined) return t;
  let span = element.endT - element.startT;
  if (span < 0) span += 1;
  return element.startT + t * span;
};

const ellipseAngleAt = (element: ArchElement, t: number): number => {
  if (element.ellipseStartAngle !== undefined || element.ellipseEndAngle !== undefined) {
    return interpolateAngle(
      element.ellipseStartAngle ?? 0,
      element.ellipseEndAngle ?? TAU,
      t,
      element.ellipseCounterclockwise,
    );
  }
  return mappedTurn(element, t) * TAU;
};

export const getCurvePoint = (element: ArchElement, t: number): Point | null => {
  if (!element.p1 || !element.p2) return null;
  const source = getCurveSource(element);
  const mappedT = mappedTurn(element, t);

  if (source === 'circle') {
    const box = getCurveBoxPoints(element);
    if (!box) return null;
    const radius = pointDistance(box.boxP1, box.boxP2);
    const angle = mappedT * TAU;
    return pointOnCircularArc(box.boxP1, radius, angle);
  }

  if (source === 'ellipse') {
    const box = getCurveBoxPoints(element);
    if (!box) return null;
    const center = element.ellipseCenter || midpoint(box.boxP1, box.boxP2);
    const rx = Math.max(EPSILON, element.ellipseRadiusX ?? Math.abs(box.boxP2.x - box.boxP1.x) / 2);
    const ry = Math.max(EPSILON, element.ellipseRadiusY ?? Math.abs(box.boxP2.y - box.boxP1.y) / 2);
    const angle = ellipseAngleAt(element, t);
    const rotation = element.ellipseRotation || 0;
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    const x = Math.cos(angle) * rx;
    const y = Math.sin(angle) * ry;
    return {
      x: center.x + x * cosR - y * sinR,
      y: center.y + x * sinR + y * cosR,
    };
  }

  if (source === 'arc') {
    if (
      element.arcCenter &&
      element.arcRadius !== undefined &&
      element.arcStartAngle !== undefined &&
      element.arcEndAngle !== undefined
    ) {
      const angle = interpolateAngle(element.arcStartAngle, element.arcEndAngle, t, element.arcCounterclockwise);
      return pointOnCircularArc(element.arcCenter, element.arcRadius, angle);
    }
    const controlPoint = element.controlPoint || midpoint(element.p1, element.p2);
    const mt = 1 - t;
    return {
      x: mt * mt * element.p1.x + 2 * mt * t * controlPoint.x + t * t * element.p2.x,
      y: mt * mt * element.p1.y + 2 * mt * t * controlPoint.y + t * t * element.p2.y,
    };
  }

  return {
    x: element.p1.x + t * (element.p2.x - element.p1.x),
    y: element.p1.y + t * (element.p2.y - element.p1.y),
  };
};

export const sampleCurveElement = (element: ArchElement, samples = 24): Point[] => {
  if (!isCurvedElement(element)) return element.p1 && element.p2 ? [element.p1, element.p2] : [];
  const count = Math.max(1, Math.floor(samples));
  const points: Point[] = [];
  for (let index = 0; index <= count; index += 1) {
    const point = getCurvePoint(element, index / count);
    if (point) points.push(point);
  }
  return points;
};

export const curveLength = (element: ArchElement, samples = 64): number => {
  if (!element.p1 || !element.p2) return 0;
  const source = getCurveSource(element);
  if (source === 'circle') {
    const box = getCurveBoxPoints(element);
    if (!box) return 0;
    const full = TAU * pointDistance(box.boxP1, box.boxP2);
    if (element.startT === undefined || element.endT === undefined) return full;
    let span = element.endT - element.startT;
    if (span < 0) span += 1;
    return full * span;
  }
  const points = sampleCurveElement(element, isCurvedElement(element) ? samples : 1);
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += pointDistance(points[index - 1], points[index]);
  }
  return length;
};

const splitQuadraticBezierArc = (element: ArchElement, t: number): [ArchElement, ArchElement] | null => {
  if (!element.p1 || !element.p2) return null;
  const cp = element.controlPoint || midpoint(element.p1, element.p2);
  const leftCp = { x: element.p1.x + t * (cp.x - element.p1.x), y: element.p1.y + t * (cp.y - element.p1.y) };
  const rightCp = { x: cp.x + t * (element.p2.x - cp.x), y: cp.y + t * (element.p2.y - cp.y) };
  const cut = { x: leftCp.x + t * (rightCp.x - leftCp.x), y: leftCp.y + t * (rightCp.y - leftCp.y) };
  return [
    { ...element, p2: cut, controlPoint: leftCp },
    { ...element, p1: cut, controlPoint: rightCp },
  ];
};

const refreshAnalyticalArcEndpoints = (element: ArchElement): ArchElement => {
  if (
    !element.arcCenter ||
    element.arcRadius === undefined ||
    element.arcStartAngle === undefined ||
    element.arcEndAngle === undefined
  ) {
    return element;
  }
  return {
    ...element,
    p1: pointOnCircularArc(element.arcCenter, element.arcRadius, element.arcStartAngle),
    p2: pointOnCircularArc(element.arcCenter, element.arcRadius, element.arcEndAngle),
    controlPoint: quadraticControlForCircularArc(
      element.arcCenter,
      element.arcRadius,
      element.arcStartAngle,
      element.arcEndAngle,
      element.arcCounterclockwise,
    ),
  };
};

export const splitCurveElement = (element: ArchElement, t: number): [ArchElement, ArchElement] | null => {
  if (!element.p1 || !element.p2 || t <= 0 || t >= 1) return null;
  const source = getCurveSource(element);

  if (source === 'arc') {
    if (
      element.arcCenter &&
      element.arcRadius !== undefined &&
      element.arcStartAngle !== undefined &&
      element.arcEndAngle !== undefined
    ) {
      const splitAngle = interpolateAngle(element.arcStartAngle, element.arcEndAngle, t, element.arcCounterclockwise);
      const first = refreshAnalyticalArcEndpoints({ ...element, arcEndAngle: normalizeRadians(splitAngle) });
      const second = refreshAnalyticalArcEndpoints({ ...element, arcStartAngle: normalizeRadians(splitAngle) });
      return [first, second];
    }
    return splitQuadraticBezierArc(element, t);
  }

  if (source === 'circle' || source === 'ellipse') {
    const box = getCurveBoxPoints(element);
    if (!box) return null;
    const ellipseCenter = element.ellipseCenter || midpoint(box.boxP1, box.boxP2);
    const ellipseRadiusX = element.ellipseRadiusX ?? Math.abs(box.boxP2.x - box.boxP1.x) / 2;
    const ellipseRadiusY = element.ellipseRadiusY ?? Math.abs(box.boxP2.y - box.boxP1.y) / 2;
    const startT = element.startT ?? 0;
    const endT = element.endT ?? 1;
    let span = endT - startT;
    if (span < 0) span += 1;
    const splitT = norm01(startT + t * span);

    const first: ArchElement = {
      ...element,
      p3: box.boxP1,
      p4: box.boxP2,
      startT,
      endT: splitT,
    };
    const second: ArchElement = {
      ...element,
      p3: box.boxP1,
      p4: box.boxP2,
      startT: splitT,
      endT,
    };

    if (source === 'ellipse') {
      first.ellipseCenter = ellipseCenter;
      first.ellipseRadiusX = ellipseRadiusX;
      first.ellipseRadiusY = ellipseRadiusY;
      first.ellipseStartAngle = ellipseAngleAt(element, 0);
      first.ellipseEndAngle = ellipseAngleAt(element, t);
      second.ellipseCenter = ellipseCenter;
      second.ellipseRadiusX = ellipseRadiusX;
      second.ellipseRadiusY = ellipseRadiusY;
      second.ellipseStartAngle = ellipseAngleAt(element, t);
      second.ellipseEndAngle = ellipseAngleAt(element, 1);
    }

    first.p1 = getCurvePoint(first, 0)!;
    first.p2 = getCurvePoint(first, 1)!;
    second.p1 = getCurvePoint(second, 0)!;
    second.p2 = getCurvePoint(second, 1)!;
    return [first, second];
  }

  const splitPoint = getCurvePoint(element, t);
  if (!splitPoint) return null;
  return [
    { ...element, p2: splitPoint },
    { ...element, p1: splitPoint },
  ];
};

export const rotateCurveMetadata = (element: ArchElement, pivot: Point, deltaRad: number): ArchElement => {
  const next = { ...element };
  if (next.arcCenter) next.arcCenter = rotatePoint(next.arcCenter, pivot, deltaRad);
  if (next.ellipseCenter) next.ellipseCenter = rotatePoint(next.ellipseCenter, pivot, deltaRad);
  if (next.arcStartAngle !== undefined) next.arcStartAngle = normalizeRadians(next.arcStartAngle + deltaRad);
  if (next.arcEndAngle !== undefined) next.arcEndAngle = normalizeRadians(next.arcEndAngle + deltaRad);
  if (next.ellipseRotation !== undefined) next.ellipseRotation = normalizeRadians(next.ellipseRotation + deltaRad);
  return next;
};

export const translateCurveMetadata = (element: ArchElement, dx: number, dy: number): ArchElement => {
  const next = { ...element };
  if (next.arcCenter) next.arcCenter = translatePoint(next.arcCenter, dx, dy);
  if (next.ellipseCenter) next.ellipseCenter = translatePoint(next.ellipseCenter, dx, dy);
  return next;
};
