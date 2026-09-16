import type {
  Text4hFreeformWallGap,
  Text4hFreeformWallSegment,
  Text4hGeometryMode,
  Text4hPixelPoint,
} from './text4hGeometryModes';

export interface Text4hAxisWallSegment {
  axis: 'horizontal' | 'vertical';
  line: number;
  start: number;
  end: number;
  thickness: number;
}

export interface Text4hCleanAngularWallSegment extends Text4hFreeformWallSegment {
  cleanup?: 'angle-aligned' | 'consolidated' | 'junction-closed' | 'consolidated-and-closed';
}

interface ExteriorAngularChamferCleanupOptions {
  typicalThickness: number;
  maxLengthPixels: number;
  isExterior: (segment: Pick<Text4hFreeformWallSegment, 'p1' | 'p2' | 'thickness'>) => boolean;
}

interface CleanupOptions {
  mode: Text4hGeometryMode;
  structuralMask: Uint8Array;
  width: number;
  height: number;
  typicalThickness: number;
  protectedGaps?: Text4hFreeformWallGap[];
}

interface GenericSegment {
  p1: Text4hPixelPoint;
  p2: Text4hPixelPoint;
  thickness: number;
  source: 'freeform' | 'axis';
  sourceIndex: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, value));

const distance = (a: Text4hPixelPoint, b: Text4hPixelPoint) =>
  Math.hypot(b.x - a.x, b.y - a.y);

const pointToSegmentDistance = (
  point: Text4hPixelPoint,
  a: Text4hPixelPoint,
  b: Text4hPixelPoint,
) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const denominator = dx * dx + dy * dy;
  if (denominator < 1e-6) return distance(point, a);
  const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator, 0, 1);
  return Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t);
};

const undirectedAngleDifference = (first: GenericSegment, second: GenericSegment) => {
  const firstAngle = Math.atan2(first.p2.y - first.p1.y, first.p2.x - first.p1.x);
  const secondAngle = Math.atan2(second.p2.y - second.p1.y, second.p2.x - second.p1.x);
  const raw = Math.abs(firstAngle - secondAngle) % Math.PI;
  return Math.min(raw, Math.PI - raw);
};

const isAxisAligned = (segment: Pick<Text4hFreeformWallSegment, 'p1' | 'p2'>) => {
  const angle = (Math.atan2(segment.p2.y - segment.p1.y, segment.p2.x - segment.p1.x) * 180 / Math.PI + 180) % 180;
  const delta = (first: number, second: number) => {
    const raw = Math.abs(first - second) % 180;
    return Math.min(raw, 180 - raw);
  };
  return Math.min(delta(angle, 0), delta(angle, 90)) <= 4;
};

const nearestEndpoint = (point: Text4hPixelPoint, segment: Text4hFreeformWallSegment) => {
  const p1Distance = distance(point, segment.p1);
  const p2Distance = distance(point, segment.p2);
  return p1Distance <= p2Distance
    ? { key: 'p1' as const, distance: p1Distance }
    : { key: 'p2' as const, distance: p2Distance };
};

const lineIntersection = (
  origin: Text4hPixelPoint,
  direction: Text4hPixelPoint,
  target: GenericSegment,
) => {
  const targetVector = { x: target.p2.x - target.p1.x, y: target.p2.y - target.p1.y };
  const denominator = direction.x * targetVector.y - direction.y * targetVector.x;
  if (Math.abs(denominator) < 1e-5) return null;
  const offset = { x: target.p1.x - origin.x, y: target.p1.y - origin.y };
  const rayDistance = (offset.x * targetVector.y - offset.y * targetVector.x) / denominator;
  const targetT = (offset.x * direction.y - offset.y * direction.x) / denominator;
  return {
    point: { x: origin.x + direction.x * rayDistance, y: origin.y + direction.y * rayDistance },
    rayDistance,
    targetT,
  };
};

const lineSupport = (
  a: Text4hPixelPoint,
  b: Text4hPixelPoint,
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
) => {
  const length = distance(a, b);
  const samples = Math.max(3, Math.ceil(length * 1.4));
  const dx = length > 0 ? (b.x - a.x) / length : 0;
  const dy = length > 0 ? (b.y - a.y) / length : 0;
  let supported = 0;
  for (let step = 0; step <= samples; step++) {
    const t = step / samples;
    const cx = a.x + (b.x - a.x) * t;
    const cy = a.y + (b.y - a.y) * t;
    let dark = false;
    for (let normal = -radius; normal <= radius && !dark; normal++) {
      const x = Math.round(cx - dy * normal);
      const y = Math.round(cy + dx * normal);
      if (x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x]) dark = true;
    }
    if (dark) supported++;
  }
  return supported / (samples + 1);
};

const normalizedAngleDegrees = (segment: Pick<GenericSegment, 'p1' | 'p2'>) =>
  (Math.atan2(segment.p2.y - segment.p1.y, segment.p2.x - segment.p1.x) * 180 / Math.PI + 180) % 180;

const angleDistanceDegrees = (first: number, second: number) => {
  const raw = Math.abs(first - second) % 180;
  return Math.min(raw, 180 - raw);
};

const closestCanonicalAngle = (angle: number, targets: number[]) => targets
  .map(target => ({ target, error: angleDistanceDegrees(angle, target) }))
  .sort((a, b) => a.error - b.error)[0];

const canonicalAngularError = (segment: Pick<GenericSegment, 'p1' | 'p2'>) =>
  closestCanonicalAngle(normalizedAngleDegrees(segment), [30, 45, 60, 120, 135, 150])?.error ?? 90;

const alignCanonicalAngularFamilies = (
  sourceSegments: Text4hCleanAngularWallSegment[],
  options: CleanupOptions,
) => {
  const segments = sourceSegments.map(segment => ({ ...segment, p1: { ...segment.p1 }, p2: { ...segment.p2 } }));
  const minimumDimension = Math.min(options.width, options.height);
  const eligible = segments.filter(segment =>
    distance(segment.p1, segment.p2) >= Math.max(options.typicalThickness * 3, minimumDimension * 0.025));
  const familySupport = (targets: number[]) => {
    const candidates = eligible.filter(segment => {
      const nearest = closestCanonicalAngle(normalizedAngleDegrees(segment), targets);
      return nearest.error <= 4;
    });
    return {
      count: candidates.length,
      length: candidates.reduce((sum, segment) => sum + distance(segment.p1, segment.p2), 0),
    };
  };
  const totalEligibleLength = eligible.reduce((sum, segment) => sum + distance(segment.p1, segment.p2), 0);
  const fortyFive = familySupport([45, 135]);
  const thirtySixty = familySupport([30, 60, 120, 150]);
  const familyEnabled = (support: { count: number; length: number }) => support.count >= 2
    || support.length >= Math.max(minimumDimension * 0.14, totalEligibleLength * 0.3);
  const enabledTargets = [
    ...(familyEnabled(fortyFive) ? [45, 135] : []),
    ...(familyEnabled(thirtySixty) ? [30, 60, 120, 150] : []),
  ];
  if (!enabledTargets.length) return segments;

  return segments.map(segment => {
    const segmentLength = distance(segment.p1, segment.p2);
    if (segmentLength < Math.max(options.typicalThickness * 2.2, minimumDimension * 0.018)) return segment;
    const nearest = closestCanonicalAngle(
      normalizedAngleDegrees(segment),
      enabledTargets,
    );
    const uncertaintyDegrees = Math.atan2(options.typicalThickness * 0.65, Math.max(1, segmentLength)) * 180 / Math.PI;
    const toleranceDegrees = clamp(uncertaintyDegrees * 1.5, 1.5, 4);
    if (nearest.error > toleranceDegrees) return segment;
    const radians = nearest.target * Math.PI / 180;
    const unit = { x: Math.cos(radians), y: Math.sin(radians) };
    const midpoint = { x: (segment.p1.x + segment.p2.x) / 2, y: (segment.p1.y + segment.p2.y) / 2 };
    const originalVector = { x: segment.p2.x - segment.p1.x, y: segment.p2.y - segment.p1.y };
    const signedSpan = originalVector.x * unit.x + originalVector.y * unit.y;
    const halfSpan = Math.abs(signedSpan) / 2;
    const orientation = signedSpan >= 0 ? 1 : -1;
    const candidate = {
      p1: {
        x: midpoint.x - unit.x * halfSpan * orientation,
        y: midpoint.y - unit.y * halfSpan * orientation,
      },
      p2: {
        x: midpoint.x + unit.x * halfSpan * orientation,
        y: midpoint.y + unit.y * halfSpan * orientation,
      },
    };
    const maximumShift = Math.max(distance(candidate.p1, segment.p1), distance(candidate.p2, segment.p2));
    if (maximumShift > options.typicalThickness * 1.15) return segment;
    const support = lineSupport(
      candidate.p1,
      candidate.p2,
      options.structuralMask,
      options.width,
      options.height,
      Math.max(1, Math.ceil(options.typicalThickness * 0.4)),
    );
    if (support < (segment.bridge ? 0.64 : 0.8)) return segment;
    return { ...segment, ...candidate, cleanup: 'angle-aligned' as const };
  });
};

const mergeAxisRuns = (
  sourceSegments: Text4hAxisWallSegment[],
  typicalThickness: number,
) => {
  const merged: Text4hAxisWallSegment[] = [];
  for (const axis of ['horizontal', 'vertical'] as const) {
    const lineTolerance = Math.max(1, typicalThickness * 0.45);
    const joinTolerance = Math.max(1, typicalThickness * 0.8);
    const groups: Text4hAxisWallSegment[][] = [];
    sourceSegments.filter(segment => segment.axis === axis).forEach(segment => {
      const group = groups.find(items => Math.abs(
        items.reduce((sum, item) => sum + item.line, 0) / items.length - segment.line,
      ) <= lineTolerance);
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
  return merged;
};

const absorbAxisAlignedFreeformBridges = (
  sourceFreeform: Text4hCleanAngularWallSegment[],
  sourceAxis: Text4hAxisWallSegment[],
  typicalThickness: number,
) => {
  const axis = sourceAxis.map(segment => ({ ...segment }));
  const retained: Text4hCleanAngularWallSegment[] = [];
  sourceFreeform.forEach(segment => {
    const angle = normalizedAngleDegrees(segment);
    const horizontal = angleDistanceDegrees(angle, 0) <= 2;
    const vertical = angleDistanceDegrees(angle, 90) <= 2;
    if (!horizontal && !vertical) { retained.push(segment); return; }
    const candidateAxis = horizontal ? 'horizontal' : 'vertical';
    const line = horizontal ? (segment.p1.y + segment.p2.y) / 2 : (segment.p1.x + segment.p2.x) / 2;
    const start = horizontal ? Math.min(segment.p1.x, segment.p2.x) : Math.min(segment.p1.y, segment.p2.y);
    const end = horizontal ? Math.max(segment.p1.x, segment.p2.x) : Math.max(segment.p1.y, segment.p2.y);
    const lineTolerance = Math.max(2, typicalThickness * 0.85);
    const endpointTolerance = Math.max(2, typicalThickness * 1.1);
    const alignedHosts = axis.filter(host => host.axis === candidateAxis && Math.abs(host.line - line) <= lineTolerance);
    const touchesHost = alignedHosts.some(host => start <= host.end + endpointTolerance && end >= host.start - endpointTolerance);
    if (!touchesHost || (!segment.bridge && alignedHosts.length < 2)) { retained.push(segment); return; }
    const weightedLine = alignedHosts.length
      ? alignedHosts.reduce((sum, host) => sum + host.line * Math.max(1, host.end - host.start), 0)
        / alignedHosts.reduce((sum, host) => sum + Math.max(1, host.end - host.start), 0)
      : line;
    axis.push({
      axis: candidateAxis,
      line: weightedLine,
      start,
      end,
      thickness: segment.thickness,
    });
  });
  return { freeform: retained, axis: mergeAxisRuns(axis, typicalThickness) };
};

const isProtectedExtension = (
  a: Text4hPixelPoint,
  b: Text4hPixelPoint,
  gaps: Text4hFreeformWallGap[],
  tolerance: number,
) => {
  const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return gaps.some(gap => {
    const gapMidpoint = { x: (gap.p1.x + gap.p2.x) / 2, y: (gap.p1.y + gap.p2.y) / 2 };
    const parallel = undirectedAngleDifference(
      { p1: a, p2: b, thickness: 1, source: 'freeform', sourceIndex: -1 },
      { p1: gap.p1, p2: gap.p2, thickness: 1, source: 'freeform', sourceIndex: -1 },
    ) <= 8 * Math.PI / 180;
    return parallel
      && pointToSegmentDistance(midpoint, gap.p1, gap.p2) <= tolerance
      && pointToSegmentDistance(gapMidpoint, a, b) <= tolerance;
  });
};

const asGenericSegments = (
  freeform: Text4hCleanAngularWallSegment[],
  axis: Text4hAxisWallSegment[],
): GenericSegment[] => [
  ...freeform.map((segment, sourceIndex) => ({
    p1: { ...segment.p1 }, p2: { ...segment.p2 }, thickness: segment.thickness,
    source: 'freeform' as const, sourceIndex,
  })),
  ...axis.map((segment, sourceIndex) => ({
    p1: segment.axis === 'horizontal'
      ? { x: segment.start, y: segment.line }
      : { x: segment.line, y: segment.start },
    p2: segment.axis === 'horizontal'
      ? { x: segment.end, y: segment.line }
      : { x: segment.line, y: segment.end },
    thickness: segment.thickness,
    source: 'axis' as const,
    sourceIndex,
  })),
];

const closeSupportedJunctions = (
  freeform: Text4hCleanAngularWallSegment[],
  axis: Text4hAxisWallSegment[],
  options: CleanupOptions,
) => {
  // A centerline that merely reaches the *face* of a thick joining wall is
  // still visibly open in the editor. Treat only near-identical coordinates
  // as already joined; wider, raster-filled face-to-axis gaps are repaired.
  const joinedCoordinateTolerance = Math.max(1.25, options.typicalThickness * 0.18);
  const maximumGap = Math.max(4, options.typicalThickness * 2.2);
  const targetPadding = Math.max(2, options.typicalThickness * 0.7);
  const supportRadius = Math.max(1, Math.ceil(options.typicalThickness * 0.32));
  const protectedGaps = options.protectedGaps || [];

  // Two passes allow the second member of an angular/orthogonal junction to
  // see the endpoint repaired in the first pass without any global snapping.
  for (let pass = 0; pass < 2; pass++) {
    const generic = asGenericSegments(freeform, axis);
    generic.forEach(segment => {
      (['p1', 'p2'] as const).forEach(endpointKey => {
        const endpoint = segment[endpointKey];
        const inner = segment[endpointKey === 'p1' ? 'p2' : 'p1'];
        const segmentLength = distance(inner, endpoint);
        if (segmentLength < 1) return;
        const outward = { x: (endpoint.x - inner.x) / segmentLength, y: (endpoint.y - inner.y) / segmentLength };
        const alreadyJoined = generic.some(candidate => {
          if (candidate.source === segment.source && candidate.sourceIndex === segment.sourceIndex) return false;
          return pointToSegmentDistance(endpoint, candidate.p1, candidate.p2) <= joinedCoordinateTolerance;
        });
        if (alreadyJoined) return;

        const candidates = generic.flatMap(candidate => {
          if (candidate.source === segment.source && candidate.sourceIndex === segment.sourceIndex) return [];
          // Existing orthogonal cleanup remains authoritative for axis/axis
          // junctions. This safeguard owns only angular/angular and mixed
          // angular/orthogonal relationships.
          if (segment.source === 'axis' && candidate.source === 'axis') return [];
          const angle = undirectedAngleDifference(segment, candidate);
          if (angle < 24 * Math.PI / 180) return [];
          const intersection = lineIntersection(endpoint, outward, candidate);
          // A skeleton centerline may stop at the joining wall face (short) or
          // run slightly through its thickness (long). Both appear as loose or
          // doubled joins after scaling, so permit a small evidenced extension
          // or trim to the actual line intersection.
          const adjustmentDistance = Math.abs(intersection?.rayDistance || 0);
          if (!intersection || adjustmentDistance <= 1 || adjustmentDistance > maximumGap) return [];
          const targetLength = distance(candidate.p1, candidate.p2);
          const paddingT = targetPadding / Math.max(1, targetLength);
          if (intersection.targetT < -paddingT || intersection.targetT > 1 + paddingT) return [];
          if (isProtectedExtension(endpoint, intersection.point, protectedGaps, targetPadding)) return [];
          const support = lineSupport(
            endpoint,
            intersection.point,
            options.structuralMask,
            options.width,
            options.height,
            supportRadius,
          );
          const wallBandsTouch = pointToSegmentDistance(endpoint, candidate.p1, candidate.p2)
            <= (segment.thickness + candidate.thickness) * 0.52;
          // Mitered thick strokes can meet cleanly while their extracted
          // centerline intersection falls just outside the dark join. Allow
          // that short adjustment only when the two observed wall bands
          // already touch; wider gaps still require explicit raster support.
          if (support < 0.72 && !wallBandsTouch) return [];
          return [{ ...intersection, adjustmentDistance, support }];
        }).sort((a, b) => a.adjustmentDistance - b.adjustmentDistance || b.support - a.support);
        const best = candidates[0];
        if (!best) return;

        if (segment.source === 'freeform') {
          const source = freeform[segment.sourceIndex];
          source[endpointKey] = best.point;
          source.cleanup = source.cleanup === 'consolidated' || source.cleanup === 'consolidated-and-closed'
            ? 'consolidated-and-closed'
            : 'junction-closed';
        } else {
          const source = axis[segment.sourceIndex];
          const coordinate = source.axis === 'horizontal' ? best.point.x : best.point.y;
          if (endpointKey === 'p1') source.start = coordinate;
          else source.end = coordinate;
          if (source.start > source.end) [source.start, source.end] = [source.end, source.start];
        }
      });
    });
  }
};

const mergeCollinearFreeformRuns = (
  sourceSegments: Text4hCleanAngularWallSegment[],
  options: CleanupOptions,
) => {
  const segments = sourceSegments.map(segment => ({ ...segment, p1: { ...segment.p1 }, p2: { ...segment.p2 } }));
  const joinTolerance = Math.max(2, options.typicalThickness * 0.7);
  const lineTolerance = Math.max(1.25, options.typicalThickness * 0.34);
  const angleTolerance = 4.75 * Math.PI / 180;

  let changed = true;
  while (changed) {
    changed = false;
    let best: { first: number; second: number; score: number } | null = null;
    for (let first = 0; first < segments.length; first++) {
      for (let second = first + 1; second < segments.length; second++) {
        const a = segments[first], b = segments[second];
        const angle = undirectedAngleDifference(
          { ...a, source: 'freeform', sourceIndex: first },
          { ...b, source: 'freeform', sourceIndex: second },
        );
        if (angle > angleTolerance) continue;
        const endpointDistances = [
          distance(a.p1, b.p1), distance(a.p1, b.p2),
          distance(a.p2, b.p1), distance(a.p2, b.p2),
        ];
        const endpointGap = Math.min(...endpointDistances);
        if (endpointGap > joinTolerance) continue;
        const allPoints = [a.p1, a.p2, b.p1, b.p2];
        let farthest: [Text4hPixelPoint, Text4hPixelPoint] = [allPoints[0], allPoints[1]];
        let farthestDistance = 0;
        for (let p = 0; p < allPoints.length; p++) for (let q = p + 1; q < allPoints.length; q++) {
          const candidateDistance = distance(allPoints[p], allPoints[q]);
          if (candidateDistance > farthestDistance) {
            farthestDistance = candidateDistance;
            farthest = [allPoints[p], allPoints[q]];
          }
        }
        if (allPoints.some(point => pointToSegmentDistance(point, farthest[0], farthest[1]) > lineTolerance)) continue;
        const support = lineSupport(
          farthest[0], farthest[1], options.structuralMask,
          options.width, options.height,
          Math.max(1, Math.ceil(options.typicalThickness * 0.28)),
        );
        const supportThreshold = a.bridge || b.bridge ? 0.68 : 0.82;
        if (support < supportThreshold) continue;
        const score = angle * 100 + endpointGap - support;
        if (!best || score < best.score) best = { first, second, score };
      }
    }
    if (!best) break;
    const first = segments[best.first], second = segments[best.second];
    const points = [first.p1, first.p2, second.p1, second.p2];
    let endpoints: [Text4hPixelPoint, Text4hPixelPoint] = [points[0], points[1]];
    let span = 0;
    for (let p = 0; p < points.length; p++) for (let q = p + 1; q < points.length; q++) {
      const candidateSpan = distance(points[p], points[q]);
      if (candidateSpan > span) { span = candidateSpan; endpoints = [points[p], points[q]]; }
    }
    const merged: Text4hCleanAngularWallSegment = {
      p1: { ...endpoints[0] },
      p2: { ...endpoints[1] },
      thickness: Math.max(first.thickness, second.thickness),
      confidence: Math.min(first.confidence, second.confidence),
      bridge: Boolean(first.bridge || second.bridge),
      cleanup: first.cleanup === 'junction-closed' || first.cleanup === 'consolidated-and-closed'
        || second.cleanup === 'junction-closed' || second.cleanup === 'consolidated-and-closed'
        ? 'consolidated-and-closed'
        : 'consolidated',
    };
    segments.splice(best.second, 1);
    segments.splice(best.first, 1, merged);
    changed = true;
  }
  return segments;
};

const removeCoveredDuplicates = (
  sourceSegments: Text4hCleanAngularWallSegment[],
  options: Pick<CleanupOptions, 'mode' | 'typicalThickness'>,
) => sourceSegments.filter((candidate, candidateIndex) => {
  const candidateLength = distance(candidate.p1, candidate.p2);
  return !sourceSegments.some((host, hostIndex) => {
    const hostLength = distance(host.p1, host.p2);
    if (hostIndex === candidateIndex || hostLength <= candidateLength * 1.08) return false;
    const angle = undirectedAngleDifference(
      { ...candidate, source: 'freeform', sourceIndex: candidateIndex },
      { ...host, source: 'freeform', sourceIndex: hostIndex },
    );
    // Hybrid/curvilinear rasters approximate one stroke with slightly more
    // angular drift than a canonical 30/45/60-degree plan. Suppress only a
    // substantially overlapping shorter run; nearby but distinct parallel
    // room walls remain outside this narrow wall-width band.
    const shortFragment = candidateLength <= options.typicalThickness * 4.5;
    const angleTolerance = (shortFragment
      ? options.mode === 'hybrid' ? 14 : 12
      : options.mode === 'hybrid' ? 8 : 6) * Math.PI / 180;
    if (angle > angleTolerance) return false;
    const tolerance = Math.max(1, options.typicalThickness * (shortFragment
      ? options.mode === 'hybrid' ? 0.95 : 0.85
      : options.mode === 'hybrid' ? 0.72 : 0.58));
    const firstOffset = pointToSegmentDistance(candidate.p1, host.p1, host.p2);
    const secondOffset = pointToSegmentDistance(candidate.p2, host.p1, host.p2);
    // The wider short-fragment tolerance is safe only when the complete stub
    // lies inside the longer wall band. Longer runs retain the established
    // one-end antialiasing allowance.
    if (shortFragment
      ? Math.max(firstOffset, secondOffset) > tolerance
      : firstOffset > tolerance && secondOffset > tolerance) return false;
    const hostUnit = {
      x: (host.p2.x - host.p1.x) / Math.max(1e-6, hostLength),
      y: (host.p2.y - host.p1.y) / Math.max(1e-6, hostLength),
    };
    const projections = [candidate.p1, candidate.p2].map(point =>
      (point.x - host.p1.x) * hostUnit.x + (point.y - host.p1.y) * hostUnit.y);
    const overlap = Math.max(0, Math.min(hostLength, Math.max(...projections)) - Math.max(0, Math.min(...projections)));
    return overlap >= candidateLength * (shortFragment ? 0.82 : 0.72);
  });
});

const lineLineIntersection = (first: GenericSegment, second: GenericSegment) => {
  const firstLength = distance(first.p1, first.p2);
  if (firstLength < 1e-6) return null;
  return lineIntersection(first.p1, {
    x: (first.p2.x - first.p1.x) / firstLength,
    y: (first.p2.y - first.p1.y) / firstLength,
  }, second)?.point || null;
};

/**
 * Removes the tiny axis-aligned raster cap that can be emitted at a sharp
 * exterior angular corner. The two evidenced angular runs are extended to
 * their line intersection so the exported wall centerlines form one clean
 * corner instead of a visibly chamfered three-segment joint.
 */
export const collapseText4hExteriorAngularChamfers = (
  sourceSegments: Text4hFreeformWallSegment[],
  options: ExteriorAngularChamferCleanupOptions,
) => {
  const segments = sourceSegments.map(segment => ({
    ...segment,
    p1: { ...segment.p1 },
    p2: { ...segment.p2 },
  } as Text4hCleanAngularWallSegment));
  const removed = new Set<number>();
  const endpointTolerance = Math.max(2, options.typicalThickness * 1.55);

  segments.forEach((candidate, candidateIndex) => {
    if (removed.has(candidateIndex)) return;
    const candidateLength = distance(candidate.p1, candidate.p2);
    if (candidateLength < 1 || candidateLength > options.maxLengthPixels
      || candidate.bridge || !isAxisAligned(candidate) || !options.isExterior(candidate)) return;

    const endpointNeighbors = ([candidate.p1, candidate.p2] as const).map(point => segments
      .map((other, otherIndex) => ({ other, otherIndex, nearest: nearestEndpoint(point, other) }))
      .filter(({ otherIndex, other, nearest }) => otherIndex !== candidateIndex
        && !removed.has(otherIndex)
        && distance(other.p1, other.p2) >= Math.max(candidateLength * 2.25, options.typicalThickness * 2.5)
        && !isAxisAligned(other)
        && nearest.distance <= endpointTolerance)
      .sort((first, second) => first.nearest.distance - second.nearest.distance));
    const first = endpointNeighbors[0][0];
    const second = endpointNeighbors[1][0];
    if (!first || !second || first.otherIndex === second.otherIndex) return;
    const firstGeneric = { ...first.other, source: 'freeform' as const, sourceIndex: first.otherIndex };
    const secondGeneric = { ...second.other, source: 'freeform' as const, sourceIndex: second.otherIndex };
    if (undirectedAngleDifference(firstGeneric, secondGeneric) < 20 * Math.PI / 180) return;
    const intersection = lineLineIntersection(firstGeneric, secondGeneric);
    if (!intersection) return;
    const maximumAdjustment = Math.max(options.typicalThickness * 1.8, candidateLength * 2.5);
    if (distance(candidate.p1, intersection) > maximumAdjustment
      || distance(candidate.p2, intersection) > maximumAdjustment) return;
    const midpoint = { x: (candidate.p1.x + candidate.p2.x) / 2, y: (candidate.p1.y + candidate.p2.y) / 2 };
    if (distance(midpoint, intersection) > maximumAdjustment) return;

    first.other[first.nearest.key] = { ...intersection };
    second.other[second.nearest.key] = { ...intersection };
    first.other.cleanup = first.other.cleanup === 'consolidated' || first.other.cleanup === 'consolidated-and-closed'
      ? 'consolidated-and-closed'
      : 'junction-closed';
    second.other.cleanup = second.other.cleanup === 'consolidated' || second.other.cleanup === 'consolidated-and-closed'
      ? 'consolidated-and-closed'
      : 'junction-closed';
    removed.add(candidateIndex);
  });

  return segments.filter((_segment, index) => !removed.has(index));
};

const snapNearestEndpoint = (
  segment: GenericSegment,
  point: Text4hPixelPoint,
  freeform: Text4hCleanAngularWallSegment[],
  axis: Text4hAxisWallSegment[],
  maximumDistance: number,
) => {
  const p1Distance = distance(segment.p1, point);
  const p2Distance = distance(segment.p2, point);
  if (Math.min(p1Distance, p2Distance) > maximumDistance) return false;
  const endpointKey = p1Distance <= p2Distance ? 'p1' : 'p2';
  if (segment.source === 'freeform') {
    freeform[segment.sourceIndex][endpointKey] = { ...point };
    freeform[segment.sourceIndex].cleanup = 'junction-closed';
  } else {
    const source = axis[segment.sourceIndex];
    const coordinate = source.axis === 'horizontal' ? point.x : point.y;
    if (endpointKey === 'p1') source.start = coordinate;
    else source.end = coordinate;
    if (source.start > source.end) [source.start, source.end] = [source.end, source.start];
  }
  return true;
};

const collapseMicroConnectors = (
  sourceFreeform: Text4hCleanAngularWallSegment[],
  sourceAxis: Text4hAxisWallSegment[],
  typicalThickness: number,
) => {
  const freeform = sourceFreeform.map(segment => ({ ...segment, p1: { ...segment.p1 }, p2: { ...segment.p2 } }));
  const axis = sourceAxis.map(segment => ({ ...segment }));
  const maximumConnectorLength = Math.max(2, typicalThickness * 0.85);
  const junctionRadius = Math.max(2.5, typicalThickness * 1.15);
  let changed = true;
  while (changed) {
    changed = false;
    const generic = asGenericSegments(freeform, axis);
    const connectors = generic.filter(segment => {
      const source = segment.source === 'freeform' ? freeform[segment.sourceIndex] : undefined;
      return !source?.bridge && distance(segment.p1, segment.p2) <= maximumConnectorLength;
    });
    for (const connector of connectors) {
      const others = generic.filter(segment =>
        !(segment.source === connector.source && segment.sourceIndex === connector.sourceIndex)
        && distance(segment.p1, segment.p2) >= maximumConnectorLength * 1.5);
      const nearFirst = others.filter(segment => pointToSegmentDistance(connector.p1, segment.p1, segment.p2) <= junctionRadius);
      const nearSecond = others.filter(segment => pointToSegmentDistance(connector.p2, segment.p1, segment.p2) <= junctionRadius);
      let repair: { first: GenericSegment; second: GenericSegment; point: Text4hPixelPoint; score: number } | undefined;
      nearFirst.forEach(first => nearSecond.forEach(second => {
        if (first.source === second.source && first.sourceIndex === second.sourceIndex) return;
        if (first.source !== 'freeform' && second.source !== 'freeform') return;
        if (undirectedAngleDifference(first, second) < 20 * Math.PI / 180) return;
        const point = lineLineIntersection(first, second);
        if (!point) return;
        const midpoint = {
          x: (connector.p1.x + connector.p2.x) / 2,
          y: (connector.p1.y + connector.p2.y) / 2,
        };
        const score = distance(midpoint, point);
        if (score > typicalThickness * 1.6) return;
        if (!repair || score < repair.score) repair = { first, second, point, score };
      }));
      if (!repair) continue;
      const maximumSnap = typicalThickness * 2.2;
      if (!snapNearestEndpoint(repair.first, repair.point, freeform, axis, maximumSnap)
        || !snapNearestEndpoint(repair.second, repair.point, freeform, axis, maximumSnap)) continue;
      if (connector.source === 'freeform') freeform.splice(connector.sourceIndex, 1);
      else axis.splice(connector.sourceIndex, 1);
      changed = true;
      break;
    }
  }
  return { freeform, axis: mergeAxisRuns(axis, typicalThickness) };
};

const extensionCrossesWall = (
  start: Text4hPixelPoint,
  end: Text4hPixelPoint,
  source: GenericSegment,
  target: GenericSegment,
  segments: GenericSegment[],
  tolerance: number,
) => {
  const vector = { x: end.x - start.x, y: end.y - start.y };
  const length = distance(start, end);
  if (length < 1e-6) return false;
  return segments.some(candidate => {
    if ((candidate.source === source.source && candidate.sourceIndex === source.sourceIndex)
      || (candidate.source === target.source && candidate.sourceIndex === target.sourceIndex)) return false;
    const intersection = lineIntersection(start, { x: vector.x / length, y: vector.y / length }, candidate);
    if (!intersection || intersection.rayDistance <= tolerance || intersection.rayDistance >= length - tolerance) return false;
    const candidateLength = distance(candidate.p1, candidate.p2);
    const padding = tolerance / Math.max(1, candidateLength);
    return intersection.targetT >= -padding && intersection.targetT <= 1 + padding;
  });
};

const supportedExtensionRatio = (
  a: Text4hPixelPoint,
  b: Text4hPixelPoint,
  options: CleanupOptions,
) => {
  const length = distance(a, b);
  const samples = Math.max(8, Math.ceil(length * 1.25));
  const tangent = length > 0 ? { x: (b.x - a.x) / length, y: (b.y - a.y) / length } : { x: 1, y: 0 };
  const radius = Math.max(2, Math.ceil(options.typicalThickness * 0.85));
  let supported = 0;
  let currentUnsupported = 0;
  let maximumUnsupported = 0;
  for (let step = 0; step <= samples; step++) {
    const t = step / samples;
    const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    let hasEvidence = false;
    for (let normal = -radius; normal <= radius && !hasEvidence; normal++) {
      const x = Math.round(point.x - tangent.y * normal);
      const y = Math.round(point.y + tangent.x * normal);
      if (x >= 0 && y >= 0 && x < options.width && y < options.height
        && options.structuralMask[y * options.width + x]) hasEvidence = true;
    }
    if (!hasEvidence) {
      hasEvidence = (options.protectedGaps || []).some(gap =>
        pointToSegmentDistance(point, gap.p1, gap.p2) <= Math.max(radius, gap.thickness * 0.75));
    }
    if (hasEvidence) {
      supported++;
      currentUnsupported = 0;
    } else {
      currentUnsupported++;
      maximumUnsupported = Math.max(maximumUnsupported, currentUnsupported);
    }
  }
  return {
    ratio: supported / (samples + 1),
    maximumUnsupportedPixels: maximumUnsupported * length / samples,
  };
};

const completeSupportedWallHosts = (
  sourceFreeform: Text4hCleanAngularWallSegment[],
  sourceAxis: Text4hAxisWallSegment[],
  options: CleanupOptions,
) => {
  const freeform = sourceFreeform.map(segment => ({ ...segment, p1: { ...segment.p1 }, p2: { ...segment.p2 } }));
  const axis = sourceAxis.map(segment => ({ ...segment }));
  const joinedTolerance = Math.max(1.5, options.typicalThickness * 0.2);
  const minimumGap = Math.max(options.typicalThickness * 1.5, 4);
  const maximumGap = Math.min(options.width, options.height) * 0.42;
  for (let pass = 0; pass < 2; pass++) {
    const generic = asGenericSegments(freeform, axis);
    generic.forEach(segment => {
      if (distance(segment.p1, segment.p2) < options.typicalThickness * 2.5) return;
      (['p1', 'p2'] as const).forEach(endpointKey => {
        const endpoint = segment[endpointKey];
        const inner = segment[endpointKey === 'p1' ? 'p2' : 'p1'];
        const segmentLength = distance(inner, endpoint);
        const outward = { x: (endpoint.x - inner.x) / segmentLength, y: (endpoint.y - inner.y) / segmentLength };
        const alreadyJoined = generic.some(candidate => {
          if (candidate.source === segment.source && candidate.sourceIndex === segment.sourceIndex) return false;
          return pointToSegmentDistance(endpoint, candidate.p1, candidate.p2) <= joinedTolerance;
        });
        if (alreadyJoined) return;
        const candidates = generic.flatMap(target => {
          if (target.source === segment.source && target.sourceIndex === segment.sourceIndex) return [];
          if (distance(target.p1, target.p2) < options.typicalThickness * 2) return [];
          if (undirectedAngleDifference(segment, target) < 20 * Math.PI / 180) return [];
          return (['p1', 'p2'] as const).flatMap(targetEndpointKey => {
            const targetPoint = target[targetEndpointKey];
            const gapLength = distance(endpoint, targetPoint);
            if (gapLength < minimumGap || gapLength > maximumGap) return [];
            const towardTarget = { x: (targetPoint.x - endpoint.x) / gapLength, y: (targetPoint.y - endpoint.y) / gapLength };
            const alignment = outward.x * towardTarget.x + outward.y * towardTarget.y;
            const canonicalTolerance = canonicalAngularError(segment) <= 4 && canonicalAngularError(target) <= 4;
            if (alignment < Math.cos((canonicalTolerance ? 5.5 : 3.5) * Math.PI / 180)) return [];
            if (extensionCrossesWall(
              endpoint, targetPoint, segment, target, generic,
              Math.max(1.5, options.typicalThickness * 0.25),
            )) return [];
            const evidence = supportedExtensionRatio(endpoint, targetPoint, options);
            if (evidence.ratio < 0.74
              || evidence.maximumUnsupportedPixels > Math.max(options.typicalThickness * 3.5, gapLength * 0.28)) return [];
            return [{ targetPoint, gapLength, evidence }];
          });
        }).sort((a, b) => b.evidence.ratio - a.evidence.ratio || a.gapLength - b.gapLength);
        const best = candidates[0];
        if (!best) return;
        if (segment.source === 'freeform') {
          freeform[segment.sourceIndex][endpointKey] = { ...best.targetPoint };
          freeform[segment.sourceIndex].cleanup = 'junction-closed';
        } else {
          const source = axis[segment.sourceIndex];
          const coordinate = source.axis === 'horizontal' ? best.targetPoint.x : best.targetPoint.y;
          if (endpointKey === 'p1') source.start = coordinate;
          else source.end = coordinate;
          if (source.start > source.end) [source.start, source.end] = [source.end, source.start];
        }
      });
    });
  }
  return { freeform, axis: mergeAxisRuns(axis, options.typicalThickness) };
};

/**
 * F-only final representation cleanup for straight angular wall networks.
 * The source chords remain untouched for flood fill, OCR, and opening
 * detection. Only angular/hybrid output walls are consolidated, and a loose
 * junction is closed only when the source raster supports the short extension.
 */
export const cleanupText4hAngularWalls = (
  freeformSegments: Text4hFreeformWallSegment[],
  axisSegments: Text4hAxisWallSegment[],
  options: CleanupOptions,
) => {
  const freeform = freeformSegments.map(segment => ({
    ...segment,
    p1: { ...segment.p1 },
    p2: { ...segment.p2 },
  } as Text4hCleanAngularWallSegment));
  const axis = axisSegments.map(segment => ({ ...segment }));
  if (options.mode !== 'angular' && options.mode !== 'hybrid') {
    return { freeformSegments: freeform, axisSegments: axis };
  }

  const aligned = alignCanonicalAngularFamilies(freeform, options);
  closeSupportedJunctions(aligned, axis, options);
  const consolidated = mergeCollinearFreeformRuns(aligned, options);
  const absorbed = absorbAxisAlignedFreeformBridges(consolidated, axis, options.typicalThickness);
  const canonical = collapseMicroConnectors(absorbed.freeform, absorbed.axis, options.typicalThickness);
  const completed = completeSupportedWallHosts(canonical.freeform, canonical.axis, options);
  closeSupportedJunctions(completed.freeform, completed.axis, options);
  return {
    freeformSegments: removeCoveredDuplicates(
      mergeCollinearFreeformRuns(completed.freeform, options),
      options,
    ),
    axisSegments: mergeAxisRuns(completed.axis, options.typicalThickness),
  };
};
