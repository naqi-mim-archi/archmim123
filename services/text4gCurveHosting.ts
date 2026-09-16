import type { ArchElement, Point } from '../types';
import { getCurvePoint } from './geometry/curveGeometry';

/**
 * Text 4.0 G-only hosted-insert geometry for native arcs and ellipses.
 * The editor stores a curved wall as an analytic path; using its p1-p2 chord
 * relocates openings toward the interior and gives them the wrong rotation.
 */
export const text4gCurveHostedPose = (wall: ArchElement, hostT: number, width: number) => {
  const t = Math.max(0, Math.min(1, hostT));
  const pMid = getCurvePoint(wall, t);
  if (!pMid) return null;
  const eps = 0.001;
  const pPrev = getCurvePoint(wall, Math.max(0, t - eps)) || pMid;
  const pNext = getCurvePoint(wall, Math.min(1, t + eps)) || pMid;
  const sampleSpan = Math.max(eps, Math.min(1, t + eps) - Math.max(0, t - eps));
  const speed = Math.hypot(pNext.x - pPrev.x, pNext.y - pPrev.y) / sampleSpan;
  let dt = speed > 1e-6 ? width / speed : 0;
  let p1 = getCurvePoint(wall, Math.max(0, t - dt / 2));
  let p2 = getCurvePoint(wall, Math.min(1, t + dt / 2));
  if (p1 && p2) {
    const chordLength = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (chordLength > 1e-6) {
      dt *= width / chordLength;
      p1 = getCurvePoint(wall, Math.max(0, t - dt / 2)) || p1;
      p2 = getCurvePoint(wall, Math.min(1, t + dt / 2)) || p2;
    }
  }
  if (!p1 || !p2) return {
    pos: pMid,
    rotation: Math.atan2(pNext.y - pPrev.y, pNext.x - pPrev.x) * 180 / Math.PI,
  };
  return {
    pos: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
    rotation: Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180 / Math.PI,
  };
};

export const projectText4gPointToCurve = (wall: ArchElement, point: Point) => {
  let bestT = 0;
  let bestPoint = getCurvePoint(wall, 0);
  let bestDistance = bestPoint ? Math.hypot(point.x - bestPoint.x, point.y - bestPoint.y) : Infinity;
  const samples = 128;
  for (let index = 1; index <= samples; index++) {
    const t = index / samples;
    const candidate = getCurvePoint(wall, t);
    if (!candidate) continue;
    const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
    if (distance < bestDistance) { bestT = t; bestPoint = candidate; bestDistance = distance; }
  }
  let reach = 1 / samples;
  for (let iteration = 0; iteration < 7; iteration++) {
    const candidates = [Math.max(0, bestT - reach), bestT, Math.min(1, bestT + reach)];
    candidates.forEach(t => {
      const candidate = getCurvePoint(wall, t);
      if (!candidate) return;
      const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
      if (distance < bestDistance) { bestT = t; bestPoint = candidate; bestDistance = distance; }
    });
    reach /= 2;
  }
  if (!bestPoint) return null;
  const pose = text4gCurveHostedPose(wall, bestT, 0.01);
  return { t: bestT, point: bestPoint, distance: bestDistance, angle: pose?.rotation || 0 };
};
