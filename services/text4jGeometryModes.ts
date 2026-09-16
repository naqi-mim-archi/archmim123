export type Text4jGeometryMode = 'orthogonal' | 'angular' | 'curved' | 'hybrid';

export interface Text4jPixelPoint {
  x: number;
  y: number;
}

export interface Text4jFreeformWallSegment {
  p1: Text4jPixelPoint;
  p2: Text4jPixelPoint;
  thickness: number;
  confidence: number;
  bridge?: boolean;
}

export interface Text4jFreeformWallGap {
  p1: Text4jPixelPoint;
  p2: Text4jPixelPoint;
  thickness: number;
  confidence: number;
}

export interface Text4jGeometryModeAnalysis {
  mode: Text4jGeometryMode;
  segments: Text4jFreeformWallSegment[];
  /**
   * Wall-width skeleton runs seen before component retention. The H extractor
   * may use these only in its topology-validated second-chance recovery.
   */
  candidateSegments?: Text4jFreeformWallSegment[];
  gaps: Text4jFreeformWallGap[];
  nonOrthogonalLength: number;
  structuralLength: number;
  confidence: number;
}

export interface Text4jFreeformGapEvidence {
  doorLeaf: boolean;
  windowFrame: boolean;
  confidence: number;
  hingeAtEnd: boolean;
  facingFlipped: boolean;
  doorLeafSupport?: number;
  arcSupport?: number;
  parallelSupport?: number;
  foldingSupport?: number;
  slidingSupport?: number;
  /** Folding-specific orientation, retained even when its score is below the
   * generic high-confidence threshold used to override swing-leaf evidence. */
  foldingHingeAtEnd?: boolean;
  foldingFacingFlipped?: boolean;
}

export interface Text4jSparseAngularStair {
  p1: Text4jPixelPoint;
  p2: Text4jPixelPoint;
  widthPixels: number;
  stepCount: number;
  confidence: number;
  pixelBounds: { x0: number; y0: number; x1: number; y1: number };
}

export interface Text4jSparseAngularColumn {
  x: number;
  y: number;
  widthPixels: number;
  depthPixels: number;
  confidence: number;
  pixelBounds: { x0: number; y0: number; x1: number; y1: number };
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const distance = (a: Text4jPixelPoint, b: Text4jPixelPoint) => Math.hypot(b.x - a.x, b.y - a.y);
const pointKey = (point: Text4jPixelPoint) => `${point.x},${point.y}`;
const direction = (a: Text4jPixelPoint, b: Text4jPixelPoint) => {
  const length = Math.max(1e-6, distance(a, b));
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
};
const dot = (a: Text4jPixelPoint, b: Text4jPixelPoint) => a.x * b.x + a.y * b.y;
const angleDistanceFromAxis = (segment: Pick<Text4jFreeformWallSegment, 'p1' | 'p2'>) => {
  const angle = Math.abs(Math.atan2(segment.p2.y - segment.p1.y, segment.p2.x - segment.p1.x) * 180 / Math.PI) % 90;
  return Math.min(angle, 90 - angle);
};

interface ThinSegment { p1: Text4jPixelPoint; p2: Text4jPixelPoint; }

const traceThinSegments = (mask: Uint8Array, width: number, height: number, minimumLength: number) => {
  const skeleton = skeletonize(mask, width, height);
  const segments: ThinSegment[] = [];
  traceSkeleton(skeleton, width, height).forEach(path => {
    const simplified = simplifyPath(path.points, 1.25, path.closed);
    for (let index = 1; index < simplified.length; index++) {
      const p1 = simplified[index - 1], p2 = simplified[index];
      if (distance(p1, p2) >= minimumLength) segments.push({ p1, p2 });
    }
  });
  return segments;
};

const normalizedSegmentAngle = (segment: ThinSegment) => {
  const angle = Math.atan2(segment.p2.y - segment.p1.y, segment.p2.x - segment.p1.x) * 180 / Math.PI;
  return (angle + 180) % 180;
};

/** Rotated regular tread groups used only by the sparse-hybrid caller. */
export const detectText4jSparseAngularStairs = (
  evidenceMask: Uint8Array,
  structuralMask: Uint8Array,
  width: number,
  height: number,
  typicalThickness: number,
): Text4jSparseAngularStair[] => {
  // Treads can be as dark as structural ink, so subtracting the wall mask
  // erases the very evidence we need. Regularity (six or more comparable,
  // equally spaced parallel strokes) is the safeguard against wall chords.
  const thin = evidenceMask.slice();
  const candidates = traceThinSegments(thin, width, height, Math.max(12, typicalThickness * 1.4));
  const groups = new Map<number, ThinSegment[]>();
  candidates.forEach(segment => {
    const bin = Math.round(normalizedSegmentAngle(segment) / 5) * 5;
    groups.set(bin, [...(groups.get(bin) || []), segment]);
  });
  const stairs: Text4jSparseAngularStair[] = [];
  groups.forEach((parallel, bin) => {
    if (parallel.length < 6) return;
    const radians = bin * Math.PI / 180;
    const tangent = { x: Math.cos(radians), y: Math.sin(radians) };
    const normal = { x: -tangent.y, y: tangent.x };
    const described = parallel.map(segment => {
      const center = { x: (segment.p1.x + segment.p2.x) / 2, y: (segment.p1.y + segment.p2.y) / 2 };
      return { segment, length: distance(segment.p1, segment.p2), rho: dot(center, normal), along: dot(center, tangent) };
    });
    for (const seed of described) {
      const comparable = described.filter(item => item.length >= seed.length * 0.42 && item.length <= seed.length * 1.9
        && Math.abs(item.along - seed.along) <= Math.max(24, seed.length * 0.58)).sort((a, b) => a.rho - b.rho);
      for (let start = 0; start < comparable.length; start++) {
        const run = [comparable[start]];
        const spacings: number[] = [];
        for (let index = start + 1; index < comparable.length; index++) {
          const nextSpacing = comparable[index].rho - run[run.length - 1].rho;
          if (nextSpacing < 2.5) continue;
          if (nextSpacing > Math.max(18, typicalThickness * 1.7)) break;
          spacings.push(nextSpacing);
          run.push(comparable[index]);
        }
        if (run.length < 6) continue;
        const sortedSpacings = [...spacings].sort((a, b) => a - b);
        const medianSpacing = sortedSpacings[Math.floor(sortedSpacings.length / 2)] || 0;
        if (medianSpacing < 3 || medianSpacing > Math.max(16, typicalThickness * 1.25)) continue;
        const irregular = spacings.filter(spacingValue =>
          Math.abs(spacingValue - medianSpacing) > Math.max(5, medianSpacing * 0.8)).length;
        if (irregular > Math.max(1, Math.floor(spacings.length * 0.35))) continue;
        const along = run.reduce((sum, item) => sum + item.along, 0) / run.length;
        const firstRho = run[0].rho, lastRho = run[run.length - 1].rho;
        const p1 = { x: tangent.x * along + normal.x * firstRho, y: tangent.y * along + normal.y * firstRho };
        const p2 = { x: tangent.x * along + normal.x * lastRho, y: tangent.y * along + normal.y * lastRho };
        const widthPixels = run.map(item => item.length).sort((a, b) => a - b)[Math.floor(run.length / 2)];
        const points = run.flatMap(item => [item.segment.p1, item.segment.p2]);
        stairs.push({
          p1, p2, widthPixels, stepCount: Math.max(1, run.length - 1), confidence: clamp(0.72 + run.length * 0.025, 0, 0.95),
          pixelBounds: { x0: Math.min(...points.map(point => point.x)), y0: Math.min(...points.map(point => point.y)), x1: Math.max(...points.map(point => point.x)), y1: Math.max(...points.map(point => point.y)) },
        });
        return;
      }
    }
  });
  return stairs.sort((a, b) => b.stepCount - a.stepCount).filter((stair, index, all) => !all.slice(0, index).some(existing =>
    distance(stair.p1, existing.p1) < typicalThickness * 3 && distance(stair.p2, existing.p2) < typicalThickness * 3)).slice(0, 2);
};

/** A thin connected triangular/open-space boundary becomes native railings. */
export const detectText4jSparseAngularRailings = (
  railingMask: Uint8Array,
  width: number,
  height: number,
  typicalThickness: number,
) => {
  const minimumDimension = Math.min(width, height);
  const segments = traceThinSegments(railingMask, width, height, Math.max(12, minimumDimension * 0.07))
    .sort((a, b) => distance(b.p1, b.p2) - distance(a.p1, a.p2));
  const joinTolerance = Math.max(5, typicalThickness * 1.7);
  for (let a = 0; a < segments.length; a++) for (let b = a + 1; b < segments.length; b++) for (let c = b + 1; c < segments.length; c++) {
    const triple = [segments[a], segments[b], segments[c]];
    const joins = (first: ThinSegment, second: ThinSegment) => {
      const angleDifference = Math.abs(normalizedSegmentAngle(first) - normalizedSegmentAngle(second));
      const acuteDifference = Math.min(angleDifference, 180 - angleDifference);
      if (acuteDifference < 14) return false;
      return [first.p1, first.p2].some(point => [second.p1, second.p2].some(other => distance(point, other) <= joinTolerance));
    };
    const adjacency = [
      joins(triple[0], triple[1]), joins(triple[0], triple[2]), joins(triple[1], triple[2]),
    ];
    const connectedPairs = adjacency.filter(Boolean).length;
    const perimeter = triple.reduce((sum, segment) => sum + distance(segment.p1, segment.p2), 0);
    // A balcony edge may be a closed triangle or an open three-segment chain
    // whose fourth side is the building wall/window line.
    if (connectedPairs < 2 || perimeter < minimumDimension * 0.45) continue;
    return triple.map(segment => ({ ...segment, confidence: 0.88 }));
  }
  return [];
};

/** Filled oversized blocks at sparse angular wall junctions become columns. */
export const detectText4jSparseAngularColumns = (
  structuralMask: Uint8Array,
  width: number,
  height: number,
  typicalThickness: number,
  segments: Text4jFreeformWallSegment[],
  thresholds: {
    oversizedCoverage?: number;
    quadrantCoverage?: number;
    coreCoverage?: number;
    cornerCoverage?: number;
    edgeTransitionCoverage?: number;
  } = {},
): Text4jSparseAngularColumn[] => {
  const endpoints = segments.flatMap(segment => [segment.p1, segment.p2]);
  const unique = endpoints.filter((point, index) => !endpoints.slice(0, index).some(other => distance(point, other) <= typicalThickness * 0.65));
  const radius = Math.max(3, typicalThickness * 0.92);
  const columns: Text4jSparseAngularColumn[] = [];
  unique.forEach(point => {
    const incidentLongWalls = segments.filter(segment => {
      const nearStart = distance(point, segment.p1) <= typicalThickness * 1.15;
      const nearEnd = distance(point, segment.p2) <= typicalThickness * 1.15;
      return (nearStart || nearEnd) && distance(segment.p1, segment.p2) >= typicalThickness * 3.5;
    });
    if (incidentLongWalls.length < 1) return;
    const oversizedRadius = Math.max(radius + 1, typicalThickness * 1.22);
    const inspectCenter = (center: Text4jPixelPoint) => {
      let oversizedDark = 0, oversizedTotal = 0;
      const quadrants = [
        { dark: 0, total: 0 }, { dark: 0, total: 0 },
        { dark: 0, total: 0 }, { dark: 0, total: 0 },
      ];
      for (let y = Math.round(center.y - oversizedRadius); y <= Math.round(center.y + oversizedRadius); y++) for (let x = Math.round(center.x - oversizedRadius); x <= Math.round(center.x + oversizedRadius); x++) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const ink = structuralMask[y * width + x];
        oversizedTotal++; oversizedDark += ink;
        const quadrantIndex = (x >= center.x ? 1 : 0) + (y >= center.y ? 2 : 0);
        quadrants[quadrantIndex].total++;
        quadrants[quadrantIndex].dark += ink;
      }
      const oversizedCoverage = oversizedDark / Math.max(1, oversizedTotal);
      const minimumQuadrantCoverage = Math.min(...quadrants.map(quadrant => quadrant.dark / Math.max(1, quadrant.total)));
      const cornerOffset = typicalThickness * 0.7;
      const cornerRadius = Math.max(1, Math.round(typicalThickness * 0.12));
      const minimumCornerCoverage = Math.min(...[-1, 1].flatMap(yDirection => [-1, 1].map(xDirection => {
        const corner = { x: center.x + xDirection * cornerOffset, y: center.y + yDirection * cornerOffset };
        let cornerDark = 0, cornerTotal = 0;
        for (let oy = -cornerRadius; oy <= cornerRadius; oy++) for (let ox = -cornerRadius; ox <= cornerRadius; ox++) {
          const x = Math.round(corner.x + ox), y = Math.round(corner.y + oy);
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          cornerTotal++;
          cornerDark += structuralMask[y * width + x];
        }
        return cornerDark / Math.max(1, cornerTotal);
      })));
      return {
        center,
        oversizedCoverage,
        minimumQuadrantCoverage,
        minimumCornerCoverage,
        score: oversizedCoverage + minimumQuadrantCoverage * 0.55 + minimumCornerCoverage * 0.35,
      };
    };
    // Skeleton endpoints often land on an incident wall arm rather than the
    // centre of an oversized square block. Search less than one wall
    // thickness around the evidenced junction; the strict all-quadrant fill
    // test and the caller's mandatory two-column agreement remain unchanged.
    const searchOffset = typicalThickness * 0.62;
    const inspected = [-searchOffset, 0, searchOffset].flatMap(oy =>
      [-searchOffset, 0, searchOffset].map(ox => inspectCenter({ x: point.x + ox, y: point.y + oy })))
      .sort((a, b) => b.score - a.score)[0];
    const candidateCenter = inspected.center;
    const oversizedCoverage = inspected.oversizedCoverage;
    const minimumQuadrantCoverage = inspected.minimumQuadrantCoverage;
    // Thick wall junctions naturally produce filled squares at their endpoints
    // at wall-thickness scale. Promote a junction only when the filled block is
    // visibly oversized relative to its incident wall arms.
    if (oversizedCoverage < (thresholds.oversizedCoverage ?? 0.72)
      || minimumQuadrantCoverage < (thresholds.quadrantCoverage ?? 0.64)) return;
    if (thresholds.cornerCoverage !== undefined
      && inspected.minimumCornerCoverage < thresholds.cornerCoverage) return;
    let dark = 0, total = 0;
    for (let y = Math.round(candidateCenter.y - radius); y <= Math.round(candidateCenter.y + radius); y++) for (let x = Math.round(candidateCenter.x - radius); x <= Math.round(candidateCenter.x + radius); x++) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      total++; dark += structuralMask[y * width + x];
    }
    const coverage = dark / Math.max(1, total);
    if (coverage < (thresholds.coreCoverage ?? 0.82)) return;
    const size = radius * 2;
    if (thresholds.edgeTransitionCoverage !== undefined) {
      const sampleDark = (x: number, y: number) => {
        let ink = 0, samples = 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const px = Math.round(x + ox), py = Math.round(y + oy);
          if (px < 0 || py < 0 || px >= width || py >= height) continue;
          ink += structuralMask[py * width + px];
          samples++;
        }
        return ink / Math.max(1, samples);
      };
      const alongOffsets = [-0.62, -0.36, 0.36, 0.62].map(factor => factor * radius);
      const sideEvidence = [
        { normal: { x: 0, y: -1 }, tangent: { x: 1, y: 0 } },
        { normal: { x: 1, y: 0 }, tangent: { x: 0, y: 1 } },
        { normal: { x: 0, y: 1 }, tangent: { x: 1, y: 0 } },
        { normal: { x: -1, y: 0 }, tangent: { x: 0, y: 1 } },
      ].map(side => alongOffsets.filter(along => {
        const inside = {
          x: candidateCenter.x + side.normal.x * radius * 0.72 + side.tangent.x * along,
          y: candidateCenter.y + side.normal.y * radius * 0.72 + side.tangent.y * along,
        };
        const outside = {
          x: candidateCenter.x + side.normal.x * radius * 1.24 + side.tangent.x * along,
          y: candidateCenter.y + side.normal.y * radius * 1.24 + side.tangent.y * along,
        };
        return sampleDark(inside.x, inside.y) >= 0.67 && sampleDark(outside.x, outside.y) <= 0.33;
      }).length / alongOffsets.length);
      const squareEdgeEvidence = sideEvidence.reduce((sum, value) => sum + value, 0) / sideEvidence.length;
      if (squareEdgeEvidence < thresholds.edgeTransitionCoverage) return;
      const pairedEdgeEvidence = Math.min(
        (sideEvidence[0] + sideEvidence[2]) / 2,
        (sideEvidence[1] + sideEvidence[3]) / 2,
      );
      if (pairedEdgeEvidence < thresholds.edgeTransitionCoverage * 0.65) return;
    }
    // A heavy exterior wall can be substantially thicker than the common
    // interior-wall median. Its ordinary junction must not become a column
    // merely because it fills a global-thickness audit square. A column must
    // still expand materially beyond every incident local wall band.
    const localWallThickness = Math.max(...incidentLongWalls.map(segment => segment.thickness));
    if (size < localWallThickness * 1.42) return;
    columns.push({ x: candidateCenter.x, y: candidateCenter.y, widthPixels: size, depthPixels: size, confidence: clamp(0.7 + coverage * 0.25, 0, 0.95), pixelBounds: { x0: candidateCenter.x - radius, y0: candidateCenter.y - radius, x1: candidateCenter.x + radius, y1: candidateCenter.y + radius } });
  });
  return columns.filter((column, index) => !columns.slice(0, index).some(other => Math.hypot(column.x - other.x, column.y - other.y) <= typicalThickness * 1.8)).slice(0, 6);
};

const downsampleMask = (source: Uint8Array, width: number, height: number, maximumDimension = 680) => {
  const scale = Math.max(1, Math.ceil(Math.max(width, height) / maximumDimension));
  if (scale === 1) return { mask: source, width, height, scale };
  const reducedWidth = Math.ceil(width / scale);
  const reducedHeight = Math.ceil(height / scale);
  const mask = new Uint8Array(reducedWidth * reducedHeight);
  for (let y = 0; y < reducedHeight; y++) {
    for (let x = 0; x < reducedWidth; x++) {
      let ink = 0;
      let samples = 0;
      for (let sy = y * scale; sy < Math.min(height, (y + 1) * scale); sy++) {
        for (let sx = x * scale; sx < Math.min(width, (x + 1) * scale); sx++) {
          ink += source[sy * width + sx];
          samples++;
        }
      }
      // A quarter-block threshold retains an oblique wall edge but does not
      // let isolated antialiasing pixels grow into a new structural stroke.
      mask[y * reducedWidth + x] = ink / Math.max(1, samples) >= 0.24 ? 1 : 0;
    }
  }
  return { mask, width: reducedWidth, height: reducedHeight, scale };
};

const chamferDistance = (mask: Uint8Array, width: number, height: number) => {
  const values = new Float32Array(width * height);
  const infinity = width + height;
  for (let index = 0; index < values.length; index++) values[index] = mask[index] ? infinity : 0;
  const diagonal = Math.SQRT2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (!mask[index]) continue;
      let best = values[index];
      if (x > 0) best = Math.min(best, values[index - 1] + 1);
      if (y > 0) best = Math.min(best, values[index - width] + 1);
      if (x > 0 && y > 0) best = Math.min(best, values[index - width - 1] + diagonal);
      if (x + 1 < width && y > 0) best = Math.min(best, values[index - width + 1] + diagonal);
      values[index] = best;
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const index = y * width + x;
      if (!mask[index]) continue;
      let best = values[index];
      if (x + 1 < width) best = Math.min(best, values[index + 1] + 1);
      if (y + 1 < height) best = Math.min(best, values[index + width] + 1);
      if (x + 1 < width && y + 1 < height) best = Math.min(best, values[index + width + 1] + diagonal);
      if (x > 0 && y + 1 < height) best = Math.min(best, values[index + width - 1] + diagonal);
      values[index] = best;
    }
  }
  return values;
};

const hasPotentialNonOrthogonalCore = (
  core: Uint8Array,
  width: number,
  height: number,
) => {
  let boundary = 0;
  let nonAxis = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const index = y * width + x;
      if (!core[index]) continue;
      const gx = (core[index + 1] - core[index - 1]) * 2
        + core[index - width + 1] - core[index - width - 1]
        + core[index + width + 1] - core[index + width - 1];
      const gy = (core[index + width] - core[index - width]) * 2
        + core[index + width - 1] - core[index - width - 1]
        + core[index + width + 1] - core[index - width + 1];
      if (Math.abs(gx) + Math.abs(gy) < 2) continue;
      boundary++;
      const tangentAngle = Math.abs((Math.atan2(gy, gx) * 180 / Math.PI + 90) % 90);
      const fromAxis = Math.min(tangentAngle, 90 - tangentAngle);
      if (fromAxis >= 9) nonAxis++;
    }
  }
  const minimumEvidence = Math.max(28, Math.min(width, height) * 0.25);
  return nonAxis >= minimumEvidence && nonAxis / Math.max(1, boundary) >= 0.075;
};

const skeletonize = (source: Uint8Array, width: number, height: number) => {
  const image = source.slice();
  const marked = new Uint8Array(image.length);
  const neighbours = (index: number) => [
    image[index - width], image[index - width + 1], image[index + 1], image[index + width + 1],
    image[index + width], image[index + width - 1], image[index - 1], image[index - width - 1],
  ];
  for (let iteration = 0; iteration < 72; iteration++) {
    let removed = 0;
    for (let phase = 0; phase < 2; phase++) {
      marked.fill(0);
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const index = y * width + x;
          if (!image[index]) continue;
          const n = neighbours(index);
          const count = n.reduce((sum, value) => sum + value, 0);
          if (count < 2 || count > 6) continue;
          let transitions = 0;
          for (let i = 0; i < 8; i++) if (!n[i] && n[(i + 1) % 8]) transitions++;
          if (transitions !== 1) continue;
          const firstTriplet = phase === 0 ? n[0] * n[2] * n[4] : n[0] * n[2] * n[6];
          const secondTriplet = phase === 0 ? n[2] * n[4] * n[6] : n[0] * n[4] * n[6];
          if (firstTriplet || secondTriplet) continue;
          marked[index] = 1;
        }
      }
      for (let index = 0; index < image.length; index++) {
        if (!marked[index]) continue;
        image[index] = 0;
        removed++;
      }
    }
    if (!removed) break;
  }
  return image;
};

const rdp = (points: Text4jPixelPoint[], tolerance: number): Text4jPixelPoint[] => {
  if (points.length <= 2) return points;
  const first = points[0], last = points[points.length - 1];
  const vx = last.x - first.x, vy = last.y - first.y;
  const denominator = Math.max(1e-6, vx * vx + vy * vy);
  let maximum = -1;
  let split = -1;
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index];
    const t = clamp(((point.x - first.x) * vx + (point.y - first.y) * vy) / denominator, 0, 1);
    const projection = { x: first.x + vx * t, y: first.y + vy * t };
    const error = distance(point, projection);
    if (error > maximum) { maximum = error; split = index; }
  }
  if (maximum <= tolerance || split < 0) return [first, last];
  return [...rdp(points.slice(0, split + 1), tolerance).slice(0, -1), ...rdp(points.slice(split), tolerance)];
};

const simplifyPath = (points: Text4jPixelPoint[], tolerance: number, closed: boolean) => {
  if (!closed) return rdp(points, tolerance);
  const open = pointKey(points[0]) === pointKey(points[points.length - 1]) ? points.slice(0, -1) : points;
  if (open.length < 4) return points;
  let split = 1;
  let maximum = 0;
  for (let index = 1; index < open.length; index++) {
    const span = distance(open[0], open[index]);
    if (span > maximum) { maximum = span; split = index; }
  }
  const firstHalf = rdp(open.slice(0, split + 1), tolerance);
  const secondHalf = rdp([...open.slice(split), open[0]], tolerance);
  return [...firstHalf.slice(0, -1), ...secondHalf];
};

interface SkeletonPath {
  component: number;
  points: Text4jPixelPoint[];
  closed: boolean;
}

const traceSkeleton = (skeleton: Uint8Array, width: number, height: number) => {
  const offsets = [-width, -width + 1, 1, width + 1, width, width - 1, -1, -width - 1];
  const validNeighbours = (index: number) => {
    const x = index % width;
    return offsets.flatMap(offset => {
      const next = index + offset;
      if (next < 0 || next >= skeleton.length || !skeleton[next]) return [];
      const nextX = next % width;
      if (Math.abs(nextX - x) > 1) return [];
      const dx = nextX - x;
      const dy = Math.floor(next / width) - Math.floor(index / width);
      if (dx && dy) {
        // A one-pixel staircase contains both an orthogonal step and its
        // diagonal shortcut. Keeping all three creates false graph junctions
        // at every oblique pixel and fragments a diagonal wall into stubs.
        const horizontalIntermediate = index + dx;
        const verticalIntermediate = index + dy * width;
        if (skeleton[horizontalIntermediate] || skeleton[verticalIntermediate]) return [];
      }
      return [next];
    });
  };
  const componentIds = new Int32Array(skeleton.length);
  const queue = new Int32Array(skeleton.length);
  let componentCount = 0;
  for (let start = 0; start < skeleton.length; start++) {
    if (!skeleton[start] || componentIds[start]) continue;
    componentCount++;
    let head = 0, tail = 0;
    queue[tail++] = start;
    componentIds[start] = componentCount;
    while (head < tail) {
      const current = queue[head++];
      for (const next of validNeighbours(current)) {
        if (componentIds[next]) continue;
        componentIds[next] = componentCount;
        queue[tail++] = next;
      }
    }
  }

  const usedEdges = new Set<string>();
  const edgeKey = (a: number, b: number) => a < b ? `${a}:${b}` : `${b}:${a}`;
  const toPoint = (index: number): Text4jPixelPoint => ({ x: index % width, y: Math.floor(index / width) });
  const paths: SkeletonPath[] = [];
  const walk = (start: number, next: number, component: number) => {
    const indices = [start];
    let previous = start;
    let current = next;
    usedEdges.add(edgeKey(previous, current));
    while (true) {
      indices.push(current);
      const candidates = validNeighbours(current).filter(candidate => candidate !== previous && !usedEdges.has(edgeKey(current, candidate)));
      if (validNeighbours(current).length !== 2 || !candidates.length) break;
      const following = candidates[0];
      previous = current;
      current = following;
      usedEdges.add(edgeKey(previous, current));
      if (current === start) { indices.push(current); break; }
    }
    return { component, points: indices.map(toPoint), closed: indices[indices.length - 1] === start };
  };

  for (let index = 0; index < skeleton.length; index++) {
    if (!skeleton[index]) continue;
    const neighbours = validNeighbours(index);
    if (neighbours.length === 2) continue;
    for (const next of neighbours) {
      if (usedEdges.has(edgeKey(index, next))) continue;
      paths.push(walk(index, next, componentIds[index]));
    }
  }
  // Closed wall loops have no endpoint or junction, so seed their first unused edge.
  for (let index = 0; index < skeleton.length; index++) {
    if (!skeleton[index]) continue;
    const next = validNeighbours(index).find(candidate => !usedEdges.has(edgeKey(index, candidate)));
    if (next !== undefined) paths.push(walk(index, next, componentIds[index]));
  }
  return paths;
};

const pathLength = (points: Text4jPixelPoint[]) => points.slice(1)
  .reduce((sum, point, index) => sum + distance(points[index], point), 0);

const lineCoreSupport = (
  mask: Uint8Array,
  width: number,
  height: number,
  a: Text4jPixelPoint,
  b: Text4jPixelPoint,
) => {
  const length = distance(a, b);
  const samples = Math.max(2, Math.ceil(length * 1.5));
  let supported = 0;
  for (let step = 0; step <= samples; step++) {
    const t = step / samples;
    const x = clamp(Math.round(a.x + (b.x - a.x) * t), 0, width - 1);
    const y = clamp(Math.round(a.y + (b.y - a.y) * t), 0, height - 1);
    if (mask[y * width + x]) supported++;
  }
  return supported / (samples + 1);
};

export const analyzeText4jGeometryMode = (
  sourceMask: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  typicalThicknessHint: number,
): Text4jGeometryModeAnalysis => {
  const reduced = downsampleMask(sourceMask, sourceWidth, sourceHeight);
  const distances = chamferDistance(reduced.mask, reduced.width, reduced.height);
  const hintedThickness = Math.max(2, typicalThicknessHint / reduced.scale);
  const coreThreshold = clamp(hintedThickness * 0.26, 1.35, 4.25);
  const core = new Uint8Array(reduced.mask.length);
  for (let index = 0; index < core.length; index++) core[index] = distances[index] >= coreThreshold ? 1 : 0;
  if (!hasPotentialNonOrthogonalCore(core, reduced.width, reduced.height)) {
    return { mode: 'orthogonal', segments: [], gaps: [], nonOrthogonalLength: 0, structuralLength: 0, confidence: 1 };
  }

  const skeleton = skeletonize(core, reduced.width, reduced.height);
  const paths = traceSkeleton(skeleton, reduced.width, reduced.height);
  const componentStats = new Map<number, { length: number; minX: number; maxX: number; minY: number; maxY: number }>();
  paths.forEach(path => {
    const length = pathLength(path.points);
    if (length < 2) return;
    const stats = componentStats.get(path.component) || { length: 0, minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    stats.length += length;
    path.points.forEach(point => {
      stats.minX = Math.min(stats.minX, point.x); stats.maxX = Math.max(stats.maxX, point.x);
      stats.minY = Math.min(stats.minY, point.y); stats.maxY = Math.max(stats.maxY, point.y);
    });
    componentStats.set(path.component, stats);
  });
  const minimumDimension = Math.min(reduced.width, reduced.height);
  const rankedComponents = Array.from(componentStats.entries()).map(([id, stats]) => ({
    id,
    ...stats,
    span: Math.hypot(stats.maxX - stats.minX, stats.maxY - stats.minY),
  })).sort((a, b) => (b.length * (1 + b.span / minimumDimension)) - (a.length * (1 + a.span / minimumDimension)));
  const main = rankedComponents[0];
  if (!main) return { mode: 'orthogonal', segments: [], gaps: [], nonOrthogonalLength: 0, structuralLength: 0, confidence: 1 };
  const acceptedComponents = new Set(rankedComponents.filter(component =>
    component.id === main.id
    || (component.length >= Math.max(minimumDimension * 0.05, main.length * 0.035)
      && component.span >= minimumDimension * 0.04)).map(component => component.id));

  const skeletonRadii: number[] = [];
  // The path-filtered median below is less sensitive to filled furniture than
  // using every dark connected component in the source raster.
  paths.filter(path => acceptedComponents.has(path.component)).forEach(path => path.points.forEach(point => {
    skeletonRadii.push(distances[Math.round(point.y) * reduced.width + Math.round(point.x)]);
  }));
  skeletonRadii.sort((a, b) => a - b);
  const radiusMedian = skeletonRadii[Math.floor(skeletonRadii.length / 2)] || hintedThickness / 2;
  const detectedThickness = clamp(
    radiusMedian * 2 * reduced.scale,
    Math.max(3, typicalThicknessHint * 0.65),
    Math.max(6, typicalThicknessHint * 2.5, Math.min(sourceWidth, sourceHeight) * 0.04),
  );
  const simplifyTolerance = Math.max(1.15, detectedThickness / reduced.scale * 0.2);
  const minimumSegmentLength = Math.max(3, detectedThickness / reduced.scale * 0.8);
  const segments: Text4jFreeformWallSegment[] = [];
  const candidateSegments: Text4jFreeformWallSegment[] = [];
  interface PathEndpoint { point: Text4jPixelPoint; inner: Text4jPixelPoint; component: number; }
  const endpoints: PathEndpoint[] = [];
  paths.forEach(path => {
    const simplified = simplifyPath(path.points, simplifyTolerance, path.closed);
    if (simplified.length < 2) return;
    const retainedComponent = acceptedComponents.has(path.component);
    for (let index = 1; index < simplified.length; index++) {
      const p1 = simplified[index - 1], p2 = simplified[index];
      if (distance(p1, p2) < minimumSegmentLength) continue;
      const candidate = {
        p1: { x: p1.x * reduced.scale, y: p1.y * reduced.scale },
        p2: { x: p2.x * reduced.scale, y: p2.y * reduced.scale },
        thickness: detectedThickness,
        confidence: retainedComponent ? 0.84 : 0.64,
      };
      candidateSegments.push(candidate);
      if (retainedComponent) segments.push(candidate);
    }
    if (retainedComponent && !path.closed && simplified.length >= 2) {
      endpoints.push({ point: simplified[0], inner: simplified[1], component: path.component });
      endpoints.push({ point: simplified[simplified.length - 1], inner: simplified[simplified.length - 2], component: path.component });
    }
  });

  const gaps: Text4jFreeformWallGap[] = [];
  const usedEndpoints = new Set<PathEndpoint>();
  const minimumGap = Math.max(2.5, detectedThickness / reduced.scale * 1.15);
  const maximumGap = Math.max(detectedThickness / reduced.scale * 9, minimumDimension * 0.085);
  const candidates: { a: PathEndpoint; b: PathEndpoint; distance: number; alignment: number }[] = [];
  for (let first = 0; first < endpoints.length; first++) {
    for (let second = first + 1; second < endpoints.length; second++) {
      const a = endpoints[first], b = endpoints[second];
      const gapDistance = distance(a.point, b.point);
      if (gapDistance < minimumGap || gapDistance > maximumGap) continue;
      const towardB = direction(a.point, b.point);
      const towardA = { x: -towardB.x, y: -towardB.y };
      const outwardA = direction(a.inner, a.point);
      const outwardB = direction(b.inner, b.point);
      const alignment = Math.min(dot(outwardA, towardB), dot(outwardB, towardA));
      if (alignment < 0.78) continue;
      candidates.push({ a, b, distance: gapDistance, alignment });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || b.alignment - a.alignment).forEach(candidate => {
    if (usedEndpoints.has(candidate.a) || usedEndpoints.has(candidate.b)) return;
    usedEndpoints.add(candidate.a); usedEndpoints.add(candidate.b);
    const p1 = { x: candidate.a.point.x * reduced.scale, y: candidate.a.point.y * reduced.scale };
    const p2 = { x: candidate.b.point.x * reduced.scale, y: candidate.b.point.y * reduced.scale };
    const bridge = { p1, p2, thickness: detectedThickness, confidence: 0.72, bridge: true };
    segments.push(bridge);
    candidateSegments.push(bridge);
    const support = lineCoreSupport(core, reduced.width, reduced.height, candidate.a.point, candidate.b.point);
    if (support < 0.42) gaps.push({ p1, p2, thickness: detectedThickness, confidence: 0.74 });
  });

  const structuralLength = segments.reduce((sum, segment) => sum + distance(segment.p1, segment.p2), 0);
  const nonOrthogonal = segments.filter(segment => angleDistanceFromAxis(segment) >= 10);
  const nonOrthogonalLength = nonOrthogonal.reduce((sum, segment) => sum + distance(segment.p1, segment.p2), 0);
  const nonOrthogonalRatio = nonOrthogonalLength / Math.max(1, structuralLength);
  const hullPoints = segments.flatMap(segment => [segment.p1, segment.p2])
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .filter((point, index, points) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
  const cross = (origin: Text4jPixelPoint, a: Text4jPixelPoint, b: Text4jPixelPoint) =>
    (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
  const lower: Text4jPixelPoint[] = [];
  hullPoints.forEach(point => {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  });
  const upper: Text4jPixelPoint[] = [];
  [...hullPoints].reverse().forEach(point => {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  });
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  const pointToSegmentDistance = (point: Text4jPixelPoint, a: Text4jPixelPoint, b: Text4jPixelPoint) => {
    const dx = b.x - a.x, dy = b.y - a.y;
    const denominator = Math.max(1e-6, dx * dx + dy * dy);
    const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / denominator, 0, 1);
    return Math.hypot(point.x - a.x - dx * t, point.y - a.y - dy * t);
  };
  const hullPerimeter = hull.reduce((sum, point, index) => sum + distance(point, hull[(index + 1) % hull.length]), 0);
  const envelopeTolerance = Math.max(detectedThickness * 2.2, Math.min(sourceWidth, sourceHeight) * 0.012);
  const envelopeNonOrthogonalSegments = nonOrthogonal.filter(segment => {
    const midpoint = { x: (segment.p1.x + segment.p2.x) / 2, y: (segment.p1.y + segment.p2.y) / 2 };
    const hullDistance = hull.length >= 3 ? Math.min(...hull.map((point, index) =>
      pointToSegmentDistance(midpoint, point, hull[(index + 1) % hull.length]))) : Infinity;
    return hullDistance <= envelopeTolerance;
  });
  const envelopeNonOrthogonalLength = envelopeNonOrthogonalSegments
    .reduce((sum, segment) => sum + distance(segment.p1, segment.p2), 0);
  const longEnvelopeSegments = envelopeNonOrthogonalSegments.filter(segment =>
    distance(segment.p1, segment.p2) >= Math.min(sourceWidth, sourceHeight) * 0.065).length;
  // Diagonal furniture, stair flights, door leaves, and swing arcs can be
  // substantial inside an otherwise orthogonal plan. A non-orthogonal mode is
  // enabled only when the retained main structural component also contributes
  // a meaningful part of the evidenced outer envelope.
  const sufficientEvidence = nonOrthogonalLength >= Math.min(sourceWidth, sourceHeight) * 0.28
    && nonOrthogonalRatio >= 0.1
    && envelopeNonOrthogonalLength >= Math.min(sourceWidth, sourceHeight) * 0.16
    && envelopeNonOrthogonalLength / Math.max(1, hullPerimeter) >= 0.07
    && (longEnvelopeSegments >= 1 || envelopeNonOrthogonalSegments.length >= 7);
  if (!sufficientEvidence) {
    return {
      mode: 'orthogonal',
      segments: [],
      candidateSegments,
      gaps: [],
      nonOrthogonalLength,
      structuralLength,
      confidence: 0.92,
    };
  }
  const angleBins = new Set(nonOrthogonal.map(segment => {
    const angle = (Math.atan2(segment.p2.y - segment.p1.y, segment.p2.x - segment.p1.x) * 180 / Math.PI + 180) % 180;
    return Math.round(angle / 15);
  }));
  const curvedEvidence = nonOrthogonal.length >= 8 && angleBins.size >= 5;
  const orthogonalRatio = 1 - nonOrthogonalRatio;
  const mode: Text4jGeometryMode = nonOrthogonalRatio >= 0.76
    ? curvedEvidence ? 'curved' : 'angular'
    : orthogonalRatio >= 0.2
      ? 'hybrid'
      : curvedEvidence ? 'curved' : 'angular';
  return {
    mode,
    segments,
    candidateSegments,
    gaps,
    nonOrthogonalLength,
    structuralLength,
    confidence: clamp(0.7 + nonOrthogonalRatio * 0.22 + Math.min(0.08, nonOrthogonalLength / Math.max(sourceWidth, sourceHeight) * 0.03), 0, 0.96),
  };
};

const sampleLineSupport = (
  mask: Uint8Array,
  width: number,
  height: number,
  origin: Text4jPixelPoint,
  vector: Text4jPixelPoint,
  length: number,
  radius = 1,
) => {
  const samples = Math.max(8, Math.ceil(length * 1.4));
  let supported = 0;
  for (let step = 1; step <= samples; step++) {
    const t = step / samples;
    const cx = origin.x + vector.x * length * t;
    const cy = origin.y + vector.y * length * t;
    let dark = false;
    for (let oy = -radius; oy <= radius && !dark; oy++) {
      for (let ox = -radius; ox <= radius; ox++) {
        const x = Math.round(cx + ox), y = Math.round(cy + oy);
        if (x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x]) { dark = true; break; }
      }
    }
    if (dark) supported++;
  }
  return supported / samples;
};

export const inspectText4jFreeformGap = (
  gap: Text4jFreeformWallGap,
  structuralMask: Uint8Array,
  doorEvidenceMask: Uint8Array,
  width: number,
  height: number,
): Text4jFreeformGapEvidence => {
  const tangent = direction(gap.p1, gap.p2);
  const normal = { x: -tangent.y, y: tangent.x };
  const gapLength = distance(gap.p1, gap.p2);
  let bestLeaf = { support: 0, hingeAtEnd: false, side: 1, hingeOffset: 0 };
  for (const [hinge, hingeAtEnd] of [[gap.p1, false], [gap.p2, true]] as const) {
    for (const hingeOffset of [-1.25, -0.65, 0, 0.65, 1.25]) {
      const origin = {
        x: hinge.x + tangent.x * gap.thickness * hingeOffset,
        y: hinge.y + tangent.y * gap.thickness * hingeOffset,
      };
      for (const side of [-1, 1]) {
        for (const tangentBias of [-0.45, 0, 0.45]) {
          const raw = { x: normal.x * side + tangent.x * tangentBias, y: normal.y * side + tangent.y * tangentBias };
          const magnitude = Math.hypot(raw.x, raw.y);
          const vector = { x: raw.x / magnitude, y: raw.y / magnitude };
          const support = sampleLineSupport(doorEvidenceMask, width, height, origin, vector, gapLength * 0.92, 1);
          if (support > bestLeaf.support) bestLeaf = { support, hingeAtEnd, side, hingeOffset };
        }
      }
    }
  }
  let parallelSupport = 0;
  for (const offsetFactor of [-1.1, -0.75, -0.4, 0, 0.4, 0.75, 1.1]) {
    const origin = {
      x: gap.p1.x + normal.x * gap.thickness * offsetFactor,
      y: gap.p1.y + normal.y * gap.thickness * offsetFactor,
    };
    parallelSupport = Math.max(parallelSupport,
      sampleLineSupport(structuralMask, width, height, origin, tangent, gapLength, 1));
  }
  // Folding leaves form a V/chevron inside the aperture. Test both sides of
  // the host in its own tangent-normal frame; this remains rotation agnostic
  // for circular and elliptical walls.
  let foldingSupport = 0;
  let foldingHingeAtEnd = bestLeaf.hingeAtEnd;
  let foldingSide = bestLeaf.side;
  for (const side of [-1, 1]) {
    for (const depth of [0.28, 0.4, 0.52]) {
      const apex = {
        x: (gap.p1.x + gap.p2.x) / 2 + normal.x * gapLength * depth * side,
        y: (gap.p1.y + gap.p2.y) / 2 + normal.y * gapLength * depth * side,
      };
      const firstVector = direction(gap.p1, apex);
      const secondVector = direction(gap.p2, apex);
      const firstSupport = sampleLineSupport(doorEvidenceMask, width, height, gap.p1, firstVector, distance(gap.p1, apex), 1);
      const secondSupport = sampleLineSupport(doorEvidenceMask, width, height, gap.p2, secondVector, distance(gap.p2, apex), 1);
      const support = Math.min(firstSupport, secondSupport) * 0.65 + (firstSupport + secondSupport) * 0.175;
      if (support > foldingSupport) {
        foldingSupport = support;
        foldingHingeAtEnd = false;
        foldingSide = side;
      }
    }
  }
  // A bi-fold leaf may be drawn fully open: both panels start at one jamb and
  // return to a point inside the aperture instead of forming a jamb-to-jamb V.
  // Audit that two-segment polyline separately. Parallel window frames cannot
  // satisfy the required off-host apex plus return segment.
  for (const [hinge, hingeAtEnd, toward] of [
    [gap.p1, false, tangent],
    [gap.p2, true, { x: -tangent.x, y: -tangent.y }],
  ] as const) {
    for (const tipFraction of [0.55, 0.7, 0.85, 1]) {
      const tip = {
        x: hinge.x + toward.x * gapLength * tipFraction,
        y: hinge.y + toward.y * gapLength * tipFraction,
      };
      for (const side of [-1, 1]) {
        for (const alongFraction of [0.28, 0.4, 0.52]) {
          for (const depth of [0.28, 0.4, 0.52]) {
            const apex = {
              x: hinge.x + toward.x * gapLength * alongFraction + normal.x * gapLength * depth * side,
              y: hinge.y + toward.y * gapLength * alongFraction + normal.y * gapLength * depth * side,
            };
            const firstSupport = sampleLineSupport(
              doorEvidenceMask, width, height, hinge, direction(hinge, apex), distance(hinge, apex), 1,
            );
            const secondSupport = sampleLineSupport(
              doorEvidenceMask, width, height, apex, direction(apex, tip), distance(apex, tip), 1,
            );
            const support = Math.min(firstSupport, secondSupport) * 0.7 + (firstSupport + secondSupport) * 0.15;
            if (support > foldingSupport) {
              foldingSupport = support;
              foldingHingeAtEnd = hingeAtEnd;
              foldingSide = side;
            }
          }
        }
      }
    }
  }
  // Sliding panels are two staggered partial strokes parallel to the host.
  // A window normally carries continuous parallel frame lines, so require
  // complementary half support without a nearly continuous full-width line.
  const panelOffsets = [-1.1, -0.75, -0.4, 0.4, 0.75, 1.1].map(offsetFactor => {
    const origin = {
      x: gap.p1.x + normal.x * gap.thickness * offsetFactor,
      y: gap.p1.y + normal.y * gap.thickness * offsetFactor,
    };
    const first = sampleLineSupport(doorEvidenceMask, width, height, origin, tangent, gapLength * 0.58, 1);
    const secondOrigin = { x: origin.x + tangent.x * gapLength * 0.42, y: origin.y + tangent.y * gapLength * 0.42 };
    const second = sampleLineSupport(doorEvidenceMask, width, height, secondOrigin, tangent, gapLength * 0.58, 1);
    const full = sampleLineSupport(doorEvidenceMask, width, height, origin, tangent, gapLength, 1);
    return { offsetFactor, first, second, full };
  });
  let slidingSupport = 0;
  panelOffsets.forEach(firstPanel => panelOffsets.forEach(secondPanel => {
    if (firstPanel.offsetFactor * secondPanel.offsetFactor >= 0) return;
    const complementary = Math.max(
      Math.min(firstPanel.first, secondPanel.second),
      Math.min(firstPanel.second, secondPanel.first),
    );
    const continuityPenalty = Math.max(firstPanel.full, secondPanel.full) >= 0.88 ? 0.3 : 1;
    slidingSupport = Math.max(slidingSupport, complementary * continuityPenalty);
  }));
  const arcAngles = Array.from({ length: 12 }, (_, index) => (12 + index * 6) * Math.PI / 180);
  const arcTolerance = Math.max(1, Math.round(gap.thickness * 0.22));
  const hinge = bestLeaf.hingeAtEnd ? gap.p2 : gap.p1;
  const alongDirection = bestLeaf.hingeAtEnd ? -1 : 1;
  const shiftedHinge = {
    x: hinge.x + tangent.x * gap.thickness * bestLeaf.hingeOffset,
    y: hinge.y + tangent.y * gap.thickness * bestLeaf.hingeOffset,
  };
  let bestArcSupport = 0;
  for (const radiusScale of [0.78, 0.9, 1.02]) {
    const radius = gapLength * radiusScale;
    let hits = 0;
    arcAngles.forEach(angle => {
      const cx = shiftedHinge.x
        + tangent.x * alongDirection * Math.cos(angle) * radius
        + normal.x * bestLeaf.side * Math.sin(angle) * radius;
      const cy = shiftedHinge.y
        + tangent.y * alongDirection * Math.cos(angle) * radius
        + normal.y * bestLeaf.side * Math.sin(angle) * radius;
      let dark = false;
      for (let oy = -arcTolerance; oy <= arcTolerance && !dark; oy++) for (let ox = -arcTolerance; ox <= arcTolerance; ox++) {
        const x = Math.round(cx + ox), y = Math.round(cy + oy);
        if (x >= 0 && y >= 0 && x < width && y < height && doorEvidenceMask[y * width + x]) { dark = true; break; }
      }
      if (dark) hits++;
    });
    bestArcSupport = Math.max(bestArcSupport, hits / arcAngles.length);
  }
  const doorLeaf = bestLeaf.support >= 0.68
    || (bestLeaf.support >= 0.48 && bestArcSupport >= 0.58);
  const windowFrame = !doorLeaf && parallelSupport >= 0.62;
  return {
    doorLeaf,
    windowFrame,
    confidence: doorLeaf ? clamp(0.62 + bestLeaf.support * 0.34, 0, 0.95)
      : windowFrame ? clamp(0.58 + parallelSupport * 0.32, 0, 0.9) : 0.52,
    hingeAtEnd: foldingSupport >= 0.72 ? foldingHingeAtEnd : bestLeaf.hingeAtEnd,
    facingFlipped: (foldingSupport >= 0.72 ? foldingSide : bestLeaf.side) < 0,
    doorLeafSupport: bestLeaf.support,
    arcSupport: bestArcSupport,
    parallelSupport,
    foldingSupport,
    slidingSupport,
    foldingHingeAtEnd,
    foldingFacingFlipped: foldingSide < 0,
  };
};

/**
 * Recover only symbol-proven door gaps which the primary freeform skeleton did
 * not pair. Sparse angular plans can leave the two wall arms in separate dark
 * components, especially when a swing leaf is lighter than the wall stroke.
 * Endpoint geometry is therefore only a candidate generator: a strong raster
 * leaf/arc result from the normal freeform classifier remains mandatory.
 */
export const recoverText4jSupplementalAngularDoorHosts = (
  structuralMask: Uint8Array,
  doorEvidenceMask: Uint8Array,
  width: number,
  height: number,
  typicalThickness: number,
  observedSegments: Text4jFreeformWallSegment[],
  observedGaps: Text4jFreeformWallGap[],
  allowDenseCurvilinear = false,
) => {
  // Dense plans already supply enough connected topology to the primary gap
  // detector. Relaxed cross-component pairing there creates combinatorial
  // false swings among furniture and short partition chords, so this safeguard
  // is reserved for genuinely sparse angular wall graphs.
  if (!allowDenseCurvilinear
    && observedSegments.filter(segment => angleDistanceFromAxis(segment) >= 10).length > 16) {
    return { segments: [], gaps: [] };
  }
  interface Endpoint {
    point: Text4jPixelPoint;
    inner: Text4jPixelPoint;
    segment: Text4jFreeformWallSegment;
  }
  const endpoints: Endpoint[] = observedSegments.flatMap(segment => [
    { point: segment.p1, inner: segment.p2, segment },
    { point: segment.p2, inner: segment.p1, segment },
  ]);
  const minimumGap = Math.max(typicalThickness * 1.05, Math.min(width, height) * 0.012);
  const maximumGap = Math.max(typicalThickness * 10.5, Math.min(width, height) * 0.105);
  const existingMidpoints = observedGaps.map(gap => ({
    x: (gap.p1.x + gap.p2.x) / 2,
    y: (gap.p1.y + gap.p2.y) / 2,
  }));
  const candidates: Array<{
    first: Endpoint;
    second: Endpoint;
    gap: Text4jFreeformWallGap;
    confidence: number;
  }> = [];
  for (let firstIndex = 0; firstIndex < endpoints.length; firstIndex++) {
    for (let secondIndex = firstIndex + 1; secondIndex < endpoints.length; secondIndex++) {
      const first = endpoints[firstIndex], second = endpoints[secondIndex];
      if (first.segment === second.segment) continue;
      const gapLength = distance(first.point, second.point);
      if (gapLength < minimumGap || gapLength > maximumGap) continue;
      const towardSecond = direction(first.point, second.point);
      const towardFirst = { x: -towardSecond.x, y: -towardSecond.y };
      const outwardFirst = direction(first.inner, first.point);
      const outwardSecond = direction(second.inner, second.point);
      const alignment = Math.min(dot(outwardFirst, towardSecond), dot(outwardSecond, towardFirst));
      // More tolerant than primary graph pairing because raster door evidence
      // below is authoritative; still reject visibly kinked wall fragments.
      if (alignment < 0.52) continue;
      const midpoint = {
        x: (first.point.x + second.point.x) / 2,
        y: (first.point.y + second.point.y) / 2,
      };
      if (existingMidpoints.some(existing => distance(existing, midpoint) <= typicalThickness * 1.6)) continue;
      if (lineCoreSupport(structuralMask, width, height, first.point, second.point) > 0.42) continue;
      const gap: Text4jFreeformWallGap = {
        p1: { ...first.point },
        p2: { ...second.point },
        thickness: typicalThickness,
        confidence: 0.8,
      };
      const evidence = inspectText4jFreeformGap(gap, structuralMask, doorEvidenceMask, width, height);
      if (!evidence.doorLeaf || evidence.confidence < 0.78) continue;
      candidates.push({ first, second, gap, confidence: evidence.confidence });
    }
  }
  candidates.sort((a, b) => b.confidence - a.confidence
    || distance(a.gap.p1, a.gap.p2) - distance(b.gap.p1, b.gap.p2));
  const usedEndpoints = new Set<Endpoint>();
  const selected = candidates.filter(candidate => {
    if (usedEndpoints.has(candidate.first) || usedEndpoints.has(candidate.second)) return false;
    const midpoint = {
      x: (candidate.gap.p1.x + candidate.gap.p2.x) / 2,
      y: (candidate.gap.p1.y + candidate.gap.p2.y) / 2,
    };
    if (candidates.some(other => other !== candidate && other.confidence > candidate.confidence
      && distance(midpoint, {
        x: (other.gap.p1.x + other.gap.p2.x) / 2,
        y: (other.gap.p1.y + other.gap.p2.y) / 2,
      }) <= typicalThickness * 1.8)) return false;
    usedEndpoints.add(candidate.first);
    usedEndpoints.add(candidate.second);
    return true;
  });
  return {
    segments: selected.map(candidate => ({
      p1: candidate.gap.p1,
      p2: candidate.gap.p2,
      thickness: typicalThickness,
      confidence: candidate.confidence,
      bridge: true,
    } satisfies Text4jFreeformWallSegment)),
    gaps: selected.map(candidate => candidate.gap),
  };
};

/**
 * Recover a long framed window that removes almost an entire canonical-angle
 * wall from the thick-ink skeleton. This is intentionally a hybrid-only
 * supplement used by the caller: it requires two parallel light frame lines,
 * dark wall continuation at both jambs, and both completed host ends to meet
 * geometry already observed by the primary detector.
 */
export const recoverText4jFaintAngularWindowHosts = (
  structuralMask: Uint8Array,
  openingEvidenceMask: Uint8Array,
  width: number,
  height: number,
  typicalThickness: number,
  observedSegments: Text4jFreeformWallSegment[],
) => {
  const minimumDimension = Math.min(width, height);
  const diagonal = Math.ceil(Math.hypot(width, height));
  const endpointTolerance = Math.max(6, typicalThickness * 2.8);
  const observedEndpoints = observedSegments.flatMap(segment => [segment.p1, segment.p2]);
  const faintPixels: Text4jPixelPoint[] = [];
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    const index = y * width + x;
    if (openingEvidenceMask[index] && !structuralMask[index]) faintPixels.push({ x, y });
  }
  if (faintPixels.length < minimumDimension * 0.08) return { segments: [], gaps: [] };

  const maskNear = (point: Text4jPixelPoint, radius: number) => {
    const reach = Math.max(1, Math.ceil(radius));
    for (let oy = -reach; oy <= reach; oy++) for (let ox = -reach; ox <= reach; ox++) {
      if (ox * ox + oy * oy > reach * reach) continue;
      const x = Math.round(point.x + ox), y = Math.round(point.y + oy);
      if (x >= 0 && y >= 0 && x < width && y < height && structuralMask[y * width + x]) return true;
    }
    return false;
  };
  const canonicalAngles = [30, 45, 60, 120, 135, 150]
    .flatMap(angle => [-4, -2, 0, 2, 4].map(offset => angle + offset));
  const recovered: Array<{
    segment: Text4jFreeformWallSegment;
    gap: Text4jFreeformWallGap;
    score: number;
  }> = [];

  canonicalAngles.forEach(angle => {
    const radians = angle * Math.PI / 180;
    const tangent = { x: Math.cos(radians), y: Math.sin(radians) };
    const normal = { x: -tangent.y, y: tangent.x };
    const histogram = new Int32Array(diagonal * 2 + 3);
    faintPixels.forEach(point => {
      const rho = Math.round(dot(point, normal)) + diagonal;
      if (rho >= 0 && rho < histogram.length) histogram[rho]++;
    });
    const minimumVotes = Math.max(22, Math.round(minimumDimension * 0.035));
    const rhoCandidates: number[] = [];
    for (let index = 2; index < histogram.length - 2; index++) {
      if (histogram[index] < minimumVotes) continue;
      if (histogram[index] < histogram[index - 1] || histogram[index] < histogram[index + 1]
        || histogram[index] < histogram[index - 2] || histogram[index] < histogram[index + 2]) continue;
      rhoCandidates.push(index - diagonal);
    }
    const runs: Array<{ rho: number; start: number; end: number; density: number }> = [];
    rhoCandidates.forEach(rho => {
      const projections = faintPixels.flatMap(point =>
        Math.abs(dot(point, normal) - rho) <= 1.35 ? [dot(point, tangent)] : []);
      projections.sort((a, b) => a - b);
      let start = 0;
      for (let index = 1; index <= projections.length; index++) {
        if (index < projections.length && projections[index] - projections[index - 1] <= 4.5) continue;
        const runStart = projections[start], runEnd = projections[index - 1];
        const span = runEnd - runStart;
        const density = (index - start) / Math.max(1, span);
        if (span >= minimumDimension * 0.045 && density >= 0.34) {
          runs.push({ rho, start: runStart, end: runEnd, density });
        }
        start = index;
      }
    });

    for (let first = 0; first < runs.length; first++) for (let second = first + 1; second < runs.length; second++) {
      const a = runs[first], b = runs[second];
      const separation = Math.abs(a.rho - b.rho);
      if (separation < 2 || separation > Math.max(6, typicalThickness * 1.25)) continue;
      const gapStart = Math.max(a.start, b.start), gapEnd = Math.min(a.end, b.end);
      const gapLength = gapEnd - gapStart;
      if (gapLength < minimumDimension * 0.045
        || gapLength < Math.min(a.end - a.start, b.end - b.start) * 0.68) continue;
      const hostRho = (a.rho + b.rho) / 2;
      const extend = (from: number, step: -1 | 1) => {
        let firstHit = -1, lastHit = from, misses = 0;
        const limit = Math.ceil(Math.max(typicalThickness * 7, minimumDimension * 0.075));
        for (let offset = 1; offset <= limit; offset++) {
          const along = from + step * offset;
          const point = {
            x: tangent.x * along + normal.x * hostRho,
            y: tangent.y * along + normal.y * hostRho,
          };
          if (maskNear(point, typicalThickness * 0.46)) {
            if (firstHit < 0) firstHit = offset;
            lastHit = along;
            misses = 0;
          } else if (firstHit >= 0 && ++misses > typicalThickness * 0.7) break;
        }
        return { firstHit, end: lastHit };
      };
      const before = extend(gapStart, -1), after = extend(gapEnd, 1);
      if (before.firstHit < 0 || after.firstHit < 0
        || before.firstHit > typicalThickness * 1.8 || after.firstHit > typicalThickness * 1.8
        || gapStart - before.end < typicalThickness * 0.45
        || after.end - gapEnd < typicalThickness * 0.45) continue;
      const toPoint = (along: number): Text4jPixelPoint => ({
        x: tangent.x * along + normal.x * hostRho,
        y: tangent.y * along + normal.y * hostRho,
      });
      const p1 = toPoint(before.end), p2 = toPoint(after.end);
      if (![p1, p2].every(point => observedEndpoints.some(endpoint => distance(point, endpoint) <= endpointTolerance))) continue;
      const gapP1 = toPoint(gapStart), gapP2 = toPoint(gapEnd);
      // Antialiased faces of an intact thick wall also form two parallel light
      // lines. A real framed aperture must be structurally open through its
      // centre; this rejects those intact-wall lookalikes before topology is
      // changed.
      if (lineCoreSupport(structuralMask, width, height, gapP1, gapP2) > 0.28) continue;
      const score = gapLength * Math.min(a.density, b.density);
      if (recovered.some(candidate => {
        const midpointA = { x: (candidate.gap.p1.x + candidate.gap.p2.x) / 2, y: (candidate.gap.p1.y + candidate.gap.p2.y) / 2 };
        const midpointB = { x: (gapP1.x + gapP2.x) / 2, y: (gapP1.y + gapP2.y) / 2 };
        return distance(midpointA, midpointB) <= typicalThickness * 1.4;
      })) return;
      recovered.push({
        segment: { p1, p2, thickness: typicalThickness, confidence: 0.8, bridge: true },
        gap: { p1: gapP1, p2: gapP2, thickness: typicalThickness, confidence: 0.86 },
        score,
      });
    }
  });
  recovered.sort((a, b) => b.score - a.score);
  const selected = recovered.filter((candidate, index, candidates) => !candidates.slice(0, index).some(accepted => {
    const a = { x: (accepted.gap.p1.x + accepted.gap.p2.x) / 2, y: (accepted.gap.p1.y + accepted.gap.p2.y) / 2 };
    const b = { x: (candidate.gap.p1.x + candidate.gap.p2.x) / 2, y: (candidate.gap.p1.y + candidate.gap.p2.y) / 2 };
    return distance(a, b) <= typicalThickness * 2;
  }));
  return { segments: selected.map(candidate => candidate.segment), gaps: selected.map(candidate => candidate.gap) };
};
