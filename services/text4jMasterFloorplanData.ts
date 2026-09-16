import type { Point } from '../types';
import type { GeneratedData } from '../components/generative-wizard/types';
import type { ConfirmedText4jBrief } from './text4jBrief';

export type Text4jMasterFloorplanSourceKind = 'generated' | 'uploaded';
export type Text4jMasterThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

export interface Text4jMasterFloorplanRequest {
  imageBase64: string;
  brief: ConfirmedText4jBrief;
  requestedBoundary?: Point[];
  requestedExtentsMeters?: { width?: number; depth?: number };
  sourceKind: Text4jMasterFloorplanSourceKind;
  thinkingLevel?: Text4jMasterThinkingLevel;
  /** Route known expensive/complex plans directly to the stronger spatial model. */
  preferHighAccuracy?: boolean;
}

interface DataUrlParts {
  mimeType: string;
  data: string;
}

interface GraphJunction {
  id: string;
  x: number;
  y: number;
}

interface GraphWall {
  id: string;
  startJunctionId: string;
  endJunctionId: string;
  type?: string;
  curveType?: string;
  centerX?: number;
  centerY?: number;
  radius?: number;
  radiusX?: number;
  radiusY?: number;
  rotation?: number;
  startAngle?: number;
  endAngle?: number;
  counterclockwise?: boolean;
  confidence?: number;
}

interface GraphAperture {
  id?: string;
  hostWallId: string;
  offset: number;
  widthRatio: number;
  kind: 'door' | 'window' | 'opening' | 'unknown';
  subtype?: string;
  hingeSide?: string;
  swingDirection?: string;
  confidence?: number;
}

export interface Text4jMasterGraphValidation {
  valid: boolean;
  errors: string[];
  exteriorJunctionCount: number;
  apertureCount: number;
}

interface MasterGraphTransform {
  geometry: any;
  boundary: number[][];
  scaleSource: NonNullable<GeneratedData['extractionDiagnostics']>['scaleSource'];
  scalePolicy: 'two-axis-authoritative' | 'uniform-width' | 'uniform-depth' | 'default';
  sourceAspectConflict: number;
}

export const splitText4jDataUrl = (base64Image: string): DataUrlParts => {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(base64Image);
  if (!match) return { mimeType: 'image/jpeg', data: base64Image };
  return { mimeType: match[1], data: match[2] };
};

export const buildText4jMasterFloorplanPrompt = (
  brief: ConfirmedText4jBrief,
  sourceKind: Text4jMasterFloorplanSourceKind,
  requestedBoundary?: Point[],
  requestedExtentsMeters?: { width?: number; depth?: number },
): string => {
  // Metric dimensions and the Design Brief intentionally stay outside Gemini's
  // tracing task. They are deterministic post-processing inputs and must not
  // bias the model into redesigning or independently inventing scale.
  void brief;
  void requestedBoundary;
  void requestedExtentsMeters;
  const role = sourceKind === 'generated'
    ? 'The raster was generated from a confirmed design, but the raster itself is the only geometry authority.'
    : 'The raster was uploaded by the user. Act only as a draftsman; do not redesign, complete, simplify, beautify, or reinterpret it.';

  return `You are the Text 4.0 J master floorplan geometry transcriber.

${role}

Return one JSON object matching the supplied schema. Concentrate exclusively on walls and wall apertures.

GEOMETRY RULES:
- Output normalized image coordinates only: left=0, right=1000, top=0, bottom=1000. Y increases downward. Never output meters.
- Ignore all room names, dimensions, areas, furniture, fixtures, counters, cabinets, annotations, stairs, columns, slabs, railings, and loose text.
- Trace the structural wall centerlines exactly as visible. Do not redesign or regularize the plan.
- Create one junction for every real corner, wall end, T-junction, short return, recess, projection, angular corridor turn, and curved-wall endpoint.
- Do not quantize coordinates to a coarse grid. Preserve visibly different X/Y coordinates and every short angular segment.
- exteriorLoop is the ordered sequence of exterior junction IDs around the complete fixed-property shell. Do not repeat the first ID at the end.
- Every consecutive exteriorLoop pair, including last-to-first, must have exactly one exterior wall.
- Walls reference shared junction IDs. Never repeat endpoint coordinates inside a wall and never create duplicate walls.
- Preserve multi-segment angular corridors and recessed entries segment-by-segment. Never replace a zigzag with a shortcut diagonal.
- Straight walls use curveType=line. A clean curve uses arc, circle, or ellipse metadata and must not be split into many chords.
- A circular/elliptical exterior shell must use two or more analytic arc/ellipse edges between distinct junctions; never approximate it with straight chords or a same-junction wall.
- Curve angles are radians in normalized image axes. centerX/centerY and radii use the same normalized coordinate space.
- Do not infer architecture from labels or the Design Brief. Trace only raster-evidenced geometry.

APERTURE RULES:
- Return every visible door, window, and clear wall opening in apertures.
- Every aperture must reference hostWallId. Do not output an independent position or rotation.
- offset is the aperture center as a 0..1 fraction along its host wall from startJunctionId to endJunctionId.
- widthRatio is aperture width divided by host-wall length and must fit fully inside the host: offset-widthRatio/2 >= 0 and offset+widthRatio/2 <= 1.
- Classify from visual evidence: swing leaf/arc=door, parallel glazing=window, clear passage without leaf/glazing=opening.
- If an aperture is unmistakably present but its class is uncertain, use kind=unknown rather than omitting it.
- Preserve evidenced door subtype and swing fields. Folding doors must fold toward the visible folding/slab side.
- Do not move an aperture away from its observed raster position merely to create artificial corner clearance.

Before returning JSON, audit that the exterior loop is closed, all wall references exist, all coordinates are within 0..1000, no duplicate wall edge exists, and every aperture is fully contained by its host wall.`;
};

const numberPair = (value: unknown): number[] | undefined => {
  if (!Array.isArray(value) || value.length < 2) return undefined;
  const x = Number(value[0]);
  const y = Number(value[1]);
  return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : undefined;
};

const asNumber = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const positiveNumber = (value: unknown): number | undefined => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
};

const requestedBoundaryExtents = (boundary?: Point[]) => {
  if (!boundary?.length) return {};
  const xs = boundary.map(point => point.x).filter(Number.isFinite);
  const ys = boundary.map(point => point.y).filter(Number.isFinite);
  if (!xs.length || !ys.length) return {};
  return {
    width: Math.max(...xs) - Math.min(...xs),
    depth: Math.max(...ys) - Math.min(...ys),
  };
};

const edgeKey = (a: string, b: string) => a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;

const orientation = (a: GraphJunction, b: GraphJunction, c: GraphJunction) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

const strictlyIntersects = (a: GraphJunction, b: GraphJunction, c: GraphJunction, d: GraphJunction) => {
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  const epsilon = 1e-6;
  return ((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon))
    && ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon));
};

export const validateText4jMasterFloorplanGraph = (rawData: any): Text4jMasterGraphValidation => {
  const errors: string[] = [];
  if (rawData?.coordinateSpace !== 'normalized_0_1000') errors.push('coordinateSpace must be normalized_0_1000.');

  const junctions = (Array.isArray(rawData?.junctions) ? rawData.junctions : []) as GraphJunction[];
  const junctionMap = new Map<string, GraphJunction>();
  for (const junction of junctions) {
    const id = String(junction?.id || '').trim();
    const x = Number(junction?.x), y = Number(junction?.y);
    if (!id || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1000 || y < 0 || y > 1000) {
      errors.push('Every junction requires a unique ID and coordinates inside 0..1000.');
      continue;
    }
    if (junctionMap.has(id)) errors.push(`Duplicate junction ID ${id}.`);
    junctionMap.set(id, { id, x, y });
  }

  const rawLoop = Array.isArray(rawData?.exteriorLoop) ? rawData.exteriorLoop.map(String) : [];
  const exteriorLoop = rawLoop.length > 1 && rawLoop[0] === rawLoop[rawLoop.length - 1] ? rawLoop.slice(0, -1) : rawLoop;
  if (exteriorLoop.length < 3) errors.push('Exterior loop requires at least three junctions.');
  if (new Set(exteriorLoop).size !== exteriorLoop.length) errors.push('Exterior loop must not repeat junction IDs.');
  for (const id of exteriorLoop) if (!junctionMap.has(id)) errors.push(`Exterior loop references missing junction ${id}.`);

  const walls = (Array.isArray(rawData?.walls) ? rawData.walls : []) as GraphWall[];
  const wallMap = new Map<string, GraphWall>();
  const wallEdges = new Set<string>();
  for (const wall of walls) {
    const id = String(wall?.id || '').trim();
    const start = String(wall?.startJunctionId || '');
    const end = String(wall?.endJunctionId || '');
    if (!id || !junctionMap.has(start) || !junctionMap.has(end) || start === end) {
      errors.push('Every wall requires a unique ID and two different existing junction references.');
      continue;
    }
    if (wallMap.has(id)) errors.push(`Duplicate wall ID ${id}.`);
    const key = edgeKey(start, end);
    if (wallEdges.has(key)) errors.push(`Duplicate wall edge ${start}-${end}.`);
    const curveType = String(wall.curveType || 'line').toLowerCase();
    if (curveType !== 'line') {
      const centerX = Number(wall.centerX), centerY = Number(wall.centerY);
      const radiusX = Number(wall.radiusX ?? wall.radius), radiusY = Number(wall.radiusY ?? wall.radius);
      if (!Number.isFinite(centerX) || !Number.isFinite(centerY) || centerX < 0 || centerX > 1000 || centerY < 0 || centerY > 1000
        || !Number.isFinite(radiusX) || radiusX <= 0 || !Number.isFinite(radiusY) || radiusY <= 0
        || !Number.isFinite(Number(wall.startAngle)) || !Number.isFinite(Number(wall.endAngle))) {
        errors.push(`Curved wall ${id} requires complete center, radius, and angle metadata.`);
      }
    }
    wallMap.set(id, wall);
    wallEdges.add(key);
  }

  for (let index = 0; index < exteriorLoop.length; index += 1) {
    const a = exteriorLoop[index];
    const b = exteriorLoop[(index + 1) % exteriorLoop.length];
    const matches = walls.filter(wall => edgeKey(String(wall.startJunctionId), String(wall.endJunctionId)) === edgeKey(a, b)
      && /exterior|outer/i.test(String(wall.type || '')));
    if (matches.length !== 1) errors.push(`Exterior edge ${a}-${b} must have exactly one exterior wall.`);
  }

  if (exteriorLoop.every(id => junctionMap.has(id))) {
    for (let aIndex = 0; aIndex < exteriorLoop.length; aIndex += 1) {
      const aNext = (aIndex + 1) % exteriorLoop.length;
      for (let bIndex = aIndex + 1; bIndex < exteriorLoop.length; bIndex += 1) {
        const bNext = (bIndex + 1) % exteriorLoop.length;
        if (aIndex === bIndex || aNext === bIndex || bNext === aIndex) continue;
        if (strictlyIntersects(
          junctionMap.get(exteriorLoop[aIndex])!, junctionMap.get(exteriorLoop[aNext])!,
          junctionMap.get(exteriorLoop[bIndex])!, junctionMap.get(exteriorLoop[bNext])!,
        )) errors.push('Exterior loop self-intersects.');
      }
    }
  }

  const apertures = (Array.isArray(rawData?.apertures) ? rawData.apertures : []) as GraphAperture[];
  for (const aperture of apertures) {
    const host = wallMap.get(String(aperture?.hostWallId || ''));
    const offset = Number(aperture?.offset), widthRatio = Number(aperture?.widthRatio);
    if (!host) errors.push('Every aperture must reference an existing host wall.');
    if (!Number.isFinite(offset) || !Number.isFinite(widthRatio) || widthRatio <= 0
      || offset < 0 || offset > 1 || offset - widthRatio / 2 < -1e-6 || offset + widthRatio / 2 > 1 + 1e-6) {
      errors.push('Every aperture must be fully contained by its host wall.');
    }
  }

  return {
    valid: errors.length === 0 && walls.length >= exteriorLoop.length && exteriorLoop.length >= 3,
    errors: [...new Set(errors)],
    exteriorJunctionCount: exteriorLoop.length,
    apertureCount: apertures.length,
  };
};

const normalizeSweep = (start: number, end: number, counterclockwise: boolean) => {
  const tau = Math.PI * 2;
  let sweep = end - start;
  // Positive radians travel clockwise in an image coordinate system because Y
  // points downward. Counterclockwise visual travel therefore uses a negative sweep.
  if (counterclockwise) {
    while (sweep >= 0) sweep -= tau;
  } else {
    while (sweep <= 0) sweep += tau;
  }
  return sweep;
};

const transformMasterGraph = (
  rawData: any,
  request: Pick<Text4jMasterFloorplanRequest, 'requestedBoundary' | 'requestedExtentsMeters'>,
): MasterGraphTransform | undefined => {
  if (rawData?.coordinateSpace !== 'normalized_0_1000' || !Array.isArray(rawData?.junctions)) return undefined;
  const junctions = rawData.junctions as GraphJunction[];
  const junctionMap = new Map(junctions.map(junction => [String(junction.id), junction]));
  const rawLoop = Array.isArray(rawData.exteriorLoop) ? rawData.exteriorLoop.map(String) : [];
  const loop = rawLoop.length > 1 && rawLoop[0] === rawLoop[rawLoop.length - 1] ? rawLoop.slice(0, -1) : rawLoop;
  const loopPoints = loop.map(id => junctionMap.get(id)).filter(Boolean) as GraphJunction[];
  if (loopPoints.length < 3) return undefined;

  const minX = Math.min(...loopPoints.map(point => Number(point.x)));
  const maxX = Math.max(...loopPoints.map(point => Number(point.x)));
  const minY = Math.min(...loopPoints.map(point => Number(point.y)));
  const maxY = Math.max(...loopPoints.map(point => Number(point.y)));
  const normalizedWidth = maxX - minX;
  const normalizedDepth = maxY - minY;
  if (!(normalizedWidth > 0) || !(normalizedDepth > 0)) return undefined;

  const boundaryExtents = requestedBoundaryExtents(request.requestedBoundary);
  const requestedWidth = positiveNumber(request.requestedExtentsMeters?.width) || positiveNumber(boundaryExtents.width);
  const requestedDepth = positiveNumber(request.requestedExtentsMeters?.depth) || positiveNumber(boundaryExtents.depth);
  let xScale: number;
  let yScale: number;
  let scalePolicy: MasterGraphTransform['scalePolicy'];
  if (requestedWidth && requestedDepth) {
    xScale = requestedWidth / normalizedWidth;
    yScale = requestedDepth / normalizedDepth;
    scalePolicy = 'two-axis-authoritative';
  } else if (requestedWidth) {
    xScale = yScale = requestedWidth / normalizedWidth;
    scalePolicy = 'uniform-width';
  } else if (requestedDepth) {
    xScale = yScale = requestedDepth / normalizedDepth;
    scalePolicy = 'uniform-depth';
  } else {
    xScale = yScale = 20 / Math.max(normalizedWidth, normalizedDepth);
    scalePolicy = 'default';
  }
  const scaleSource: MasterGraphTransform['scaleSource'] = requestedWidth || requestedDepth ? 'requested-boundary' : 'default';
  const rasterAspect = normalizedWidth / normalizedDepth;
  const requestedAspect = requestedWidth && requestedDepth ? requestedWidth / requestedDepth : undefined;
  const sourceAspectConflict = requestedAspect
    ? Math.abs(rasterAspect - requestedAspect) / Math.max(0.01, requestedAspect)
    : 0;

  const mapXY = (x: number, y: number): number[] => [(x - minX) * xScale, (maxY - y) * yScale];
  const mapJunction = (id: string) => {
    const point = junctionMap.get(id);
    return point ? mapXY(Number(point.x), Number(point.y)) : undefined;
  };
  const wallById = new Map<string, any>();
  const walls = ((Array.isArray(rawData.walls) ? rawData.walls : []) as GraphWall[]).map(wall => {
    const p1 = mapJunction(String(wall.startJunctionId));
    const p2 = mapJunction(String(wall.endJunctionId));
    if (!p1 || !p2) return undefined;
    const curveType = String(wall.curveType || 'line').toLowerCase();
    const center = Number.isFinite(Number(wall.centerX)) && Number.isFinite(Number(wall.centerY))
      ? mapXY(Number(wall.centerX), Number(wall.centerY))
      : undefined;
    const anisotropic = Math.abs(xScale - yScale) / Math.max(xScale, yScale) > 1e-6;
    const transformedCurveType = anisotropic && (curveType === 'arc' || curveType === 'circle') ? 'ellipse' : curveType;
    const transformed = {
      id: String(wall.id),
      levelIndex: 0,
      p1,
      p2,
      type: wall.type,
      curveType: transformedCurveType,
      center,
      radius: positiveNumber(wall.radius) ? Number(wall.radius) * xScale : undefined,
      radiusX: positiveNumber(wall.radiusX ?? wall.radius) ? Number(wall.radiusX ?? wall.radius) * xScale : undefined,
      radiusY: positiveNumber(wall.radiusY ?? wall.radius) ? Number(wall.radiusY ?? wall.radius) * yScale : undefined,
      rotation: Number.isFinite(Number(wall.rotation)) ? -Number(wall.rotation) : undefined,
      startAngle: Number.isFinite(Number(wall.startAngle)) ? -Number(wall.startAngle) : undefined,
      endAngle: Number.isFinite(Number(wall.endAngle)) ? -Number(wall.endAngle) : undefined,
      counterclockwise: typeof wall.counterclockwise === 'boolean' ? !wall.counterclockwise : undefined,
      confidence: wall.confidence,
      rawWall: wall,
    };
    wallById.set(String(wall.id), transformed);
    return transformed;
  }).filter(Boolean);

  const pointOnRawWall = (wall: GraphWall, offset: number) => {
    const start = junctionMap.get(String(wall.startJunctionId));
    const end = junctionMap.get(String(wall.endJunctionId));
    if (!start || !end) return undefined;
    const curveType = String(wall.curveType || 'line').toLowerCase();
    const centerX = Number(wall.centerX), centerY = Number(wall.centerY);
    const radiusX = positiveNumber(wall.radiusX ?? wall.radius);
    const radiusY = positiveNumber(wall.radiusY ?? wall.radius);
    const startAngle = Number(wall.startAngle), endAngle = Number(wall.endAngle);
    if (curveType !== 'line' && Number.isFinite(centerX) && Number.isFinite(centerY)
      && radiusX && radiusY && Number.isFinite(startAngle) && Number.isFinite(endAngle)) {
      const sweep = normalizeSweep(startAngle, endAngle, Boolean(wall.counterclockwise));
      const angle = startAngle + sweep * offset;
      return [centerX + radiusX * Math.cos(angle), centerY + radiusY * Math.sin(angle)];
    }
    return [start.x + (end.x - start.x) * offset, start.y + (end.y - start.y) * offset];
  };

  const hostLength = (wall: GraphWall) => {
    let length = 0;
    let previous = pointOnRawWall(wall, 0);
    const steps = String(wall.curveType || 'line').toLowerCase() === 'line' ? 1 : 32;
    for (let step = 1; step <= steps; step += 1) {
      const current = pointOnRawWall(wall, step / steps);
      if (previous && current) {
        const a = mapXY(previous[0], previous[1]);
        const b = mapXY(current[0], current[1]);
        length += Math.hypot(b[0] - a[0], b[1] - a[1]);
      }
      previous = current;
    }
    return length;
  };

  const apertures = ((Array.isArray(rawData.apertures) ? rawData.apertures : []) as GraphAperture[]).map(aperture => {
    const host = ((Array.isArray(rawData.walls) ? rawData.walls : []) as GraphWall[])
      .find(wall => String(wall.id) === String(aperture.hostWallId));
    const transformedHost = wallById.get(String(aperture.hostWallId));
    if (!host || !transformedHost) return undefined;
    const offset = Number(aperture.offset);
    const rawPoint = pointOnRawWall(host, offset);
    const before = pointOnRawWall(host, Math.max(0, offset - 0.001));
    const after = pointOnRawWall(host, Math.min(1, offset + 0.001));
    if (!rawPoint || !before || !after) return undefined;
    const pos = mapXY(rawPoint[0], rawPoint[1]);
    const tangentStart = mapXY(before[0], before[1]);
    const tangentEnd = mapXY(after[0], after[1]);
    return {
      ...aperture,
      pos,
      rotation: Math.atan2(tangentEnd[1] - tangentStart[1], tangentEnd[0] - tangentStart[0]) * 180 / Math.PI,
      width: Math.max(0.05, hostLength(host) * Number(aperture.widthRatio)),
      type: aperture.subtype,
    };
  }).filter(Boolean);

  return {
    geometry: {
      coordinateSpace: 'meters_cartesian',
      walls,
      apertures,
    },
    boundary: loop.map(mapJunction).filter(Boolean) as number[][],
    scaleSource,
    scalePolicy,
    sourceAspectConflict,
  };
};

const validWalls = (data: any): NonNullable<GeneratedData['walls']> => (Array.isArray(data?.walls) ? data.walls : [])
  .map((wall: any) => {
    const p1 = numberPair(wall.p1);
    const p2 = numberPair(wall.p2);
    if (!p1 || !p2 || Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) < 0.05) return undefined;
    const curveType = String(wall.curveType || wall.wallSource || 'line').toLowerCase();
    const normalized: NonNullable<GeneratedData['walls']>[number] = {
      levelIndex: Number.isFinite(Number(wall.levelIndex)) ? Number(wall.levelIndex) : 0,
      p1,
      p2,
      type: /exterior|outer/i.test(wall.type) ? 'exterior' : /partition/i.test(wall.type) ? 'partition' : /glass/i.test(wall.type) ? 'glass' : 'interior',
      provenance: 'observed',
      evidence: { source: 'raster', confidence: asNumber(wall.confidence, curveType === 'line' ? 0.82 : 0.88), notes: ['Text 4.0 J Gemini geometry graph.'] },
    };
    if (curveType === 'arc' || curveType === 'circle') {
      const center = numberPair(wall.center || wall.arcCenter);
      const radius = asNumber(wall.radius ?? wall.arcRadius, 0);
      if (center && radius > 0.05) {
        normalized.wallSource = 'arc';
        normalized.isCurved = true;
        normalized.arcCenter = center;
        normalized.arcRadius = radius;
        normalized.arcStartAngle = asNumber(wall.startAngle ?? wall.arcStartAngle, 0);
        normalized.arcEndAngle = asNumber(wall.endAngle ?? wall.arcEndAngle, Math.PI * 2);
        normalized.arcCounterclockwise = wall.counterclockwise ?? wall.arcCounterclockwise ?? true;
      }
    } else if (curveType === 'ellipse') {
      const center = numberPair(wall.center || wall.ellipseCenter);
      const radiusX = asNumber(wall.radiusX ?? wall.ellipseRadiusX, 0);
      const radiusY = asNumber(wall.radiusY ?? wall.ellipseRadiusY, 0);
      if (center && radiusX > 0.05 && radiusY > 0.05) {
        normalized.wallSource = 'ellipse';
        normalized.isCurved = true;
        normalized.ellipseCenter = center;
        normalized.ellipseRadiusX = radiusX;
        normalized.ellipseRadiusY = radiusY;
        normalized.ellipseRotation = asNumber(wall.rotation ?? wall.ellipseRotation, 0);
        normalized.ellipseStartAngle = asNumber(wall.startAngle ?? wall.ellipseStartAngle, 0);
        normalized.ellipseEndAngle = asNumber(wall.endAngle ?? wall.ellipseEndAngle, Math.PI * 2);
        normalized.ellipseCounterclockwise = wall.counterclockwise ?? wall.ellipseCounterclockwise ?? true;
      }
    }
    return normalized;
  })
  .filter(Boolean) as NonNullable<GeneratedData['walls']>;

const positioned = <T extends { pos: number[] }>(items: unknown, mapper: (item: any, pos: number[]) => T | undefined): T[] =>
  (Array.isArray(items) ? items : [])
    .map(item => {
      const pos = numberPair((item as any).pos);
      return pos ? mapper(item, pos) : undefined;
    })
    .filter(Boolean) as T[];

const normalizedApertures = (items: unknown) => {
  const doors: NonNullable<GeneratedData['doors']> = [];
  const windows: NonNullable<GeneratedData['windows']> = [];
  const openings: NonNullable<GeneratedData['openings']> = [];
  for (const aperture of Array.isArray(items) ? items : []) {
    const pos = numberPair(aperture?.pos);
    if (!pos) continue;
    const common = {
      levelIndex: 0,
      pos,
      rotation: asNumber(aperture.rotation, 0),
      width: Math.max(0.05, asNumber(aperture.width, 0.9)),
      provenance: 'observed' as const,
      evidence: {
        source: 'raster' as const,
        confidence: asNumber(aperture.confidence, 0.82),
        notes: [`Hosted by Gemini wall ${String(aperture.hostWallId || '')}.`],
      },
    };
    const kind = String(aperture.kind || 'unknown').toLowerCase();
    if (kind === 'door') {
      const subtype = /double|sliding|folding|glass|single/i.test(String(aperture.type || aperture.subtype))
        ? String(aperture.type || aperture.subtype).toLowerCase()
        : 'single';
      doors.push({
        ...common,
        type: subtype,
        isFlipped: String(aperture.hingeSide).toLowerCase() === 'right',
        facingFlipped: String(aperture.swingDirection).toLowerCase() === 'outward',
      });
    } else if (kind === 'window') {
      const subtype = /bay|full-height/i.test(String(aperture.type || aperture.subtype))
        ? String(aperture.type || aperture.subtype).toLowerCase()
        : 'standard';
      windows.push({ ...common, type: subtype });
    } else {
      openings.push(common);
    }
  }
  return { doors, windows, openings };
};

export const normalizeText4jMasterFloorplanData = (
  rawData: any,
  request: Pick<Text4jMasterFloorplanRequest, 'brief' | 'imageBase64' | 'sourceKind' | 'requestedBoundary' | 'requestedExtentsMeters'>,
): GeneratedData => {
  const graphValidation = validateText4jMasterFloorplanGraph(rawData);
  const transformed = transformMasterGraph(rawData, request);

  // Compatibility for stored pre-graph transcripts. New Gemini responses use
  // the graph path exclusively; legacy data remains previewable but is not
  // mistaken for a validated graph result.
  const geometry = transformed?.geometry || rawData || {};
  const walls = validWalls(geometry);
  const graphApertures = normalizedApertures(geometry.apertures);
  const legacyDoors = positioned(geometry?.doors, (door, pos) => ({
    levelIndex: 0, pos, rotation: asNumber(door.rotation, 0), type: String(door.type || 'single'),
    width: Math.max(0.35, asNumber(door.width, 0.9)), provenance: 'observed' as const,
    evidence: { source: 'raster' as const, confidence: 0.72, notes: ['Legacy Gemini transcript.'] },
  }));
  const legacyWindows = positioned(geometry?.windows, (window, pos) => ({
    levelIndex: 0, pos, rotation: asNumber(window.rotation, 0), type: String(window.type || 'standard'),
    width: Math.max(0.25, asNumber(window.width, 1.2)), provenance: 'observed' as const,
    evidence: { source: 'raster' as const, confidence: 0.72, notes: ['Legacy Gemini transcript.'] },
  }));
  const legacyOpenings = positioned(geometry?.openings, (opening, pos) => ({
    levelIndex: 0, pos, rotation: asNumber(opening.rotation, 0), width: Math.max(0.25, asNumber(opening.width, 0.9)),
    provenance: 'observed' as const,
    evidence: { source: 'raster' as const, confidence: 0.68, notes: ['Legacy Gemini transcript.'] },
  }));
  const doors = [...graphApertures.doors, ...legacyDoors];
  const windows = [...graphApertures.windows, ...legacyWindows];
  const openings = [...graphApertures.openings, ...legacyOpenings];
  const isGraph = Boolean(transformed);
  const boundary = transformed?.boundary || [];
  const canImport = isGraph
    ? graphValidation.valid && boundary.length >= 3 && walls.length >= boundary.length
    : walls.length >= 2;
  const confidence: NonNullable<GeneratedData['extractionDiagnostics']>['confidence'] = !canImport
    ? 'low'
    : isGraph ? 'high' : 'medium';
  const scalePolicy = transformed?.scalePolicy;
  const model = String(rawData?.__masterModel || '').trim();
  const thinkingLevel = String(rawData?.__masterThinkingLevel || '').trim();
  const retryReason = String(rawData?.__masterRetryReason || '').trim();

  return {
    boundary,
    walls,
    doors,
    windows,
    openings,
    columns: [],
    stairs: [],
    slabs: [],
    railings: [],
    rooms: [],
    furniture: [],
    fixtures: [],
    sourceImageBase64: request.imageBase64,
    extractionDiagnostics: {
      confidence,
      canImport,
      scaleSource: transformed?.scaleSource || 'requested-boundary',
      warnings: [
        request.sourceKind === 'generated'
          ? 'Generated raster was transcribed through the independent Text 4.0 J Gemini geometry graph.'
          : 'Uploaded raster was transcribed through the independent Text 4.0 J Gemini geometry graph.',
        ...(model ? [`Gemini model: ${model}.`] : []),
        ...(thinkingLevel ? [`Gemini thinking level: ${thinkingLevel}.`] : []),
        ...(retryReason ? ['The fast geometry graph failed validation and was retraced by Gemini 3.6 Flash.'] : []),
        ...(scalePolicy === 'two-axis-authoritative'
          ? ['Both supplied exterior dimensions calibrated the traced X/Y axes independently.']
          : scalePolicy === 'uniform-width'
            ? ['The supplied width established one uniform metric scale.']
            : scalePolicy === 'uniform-depth'
              ? ['The supplied depth established one uniform metric scale.']
              : []),
        ...(transformed && transformed.sourceAspectConflict > 0.02
          ? [`The raster envelope differed from the supplied aspect by ${(transformed.sourceAspectConflict * 100).toFixed(1)}%; deterministic dimension calibration corrected it.`]
          : []),
        ...(!graphValidation.valid && isGraph ? graphValidation.errors : []),
      ],
      detectedRoomLabels: 0,
      requestedRoomLabels: 0,
      metrics: {
        wallCount: walls.length,
        enclosedSpaceCount: 0,
        detectedDoorCount: doors.length,
        detectedWindowCount: windows.length,
        detectedOpeningCount: openings.length,
        unresolvedRoomLabels: 0,
        envelopeAspectConflict: transformed?.sourceAspectConflict || 0,
      },
      ocr: { status: 'disabled', observationCount: 0 },
      topologyRepairMode: graphValidation.valid ? 'none' : 'junctions',
    },
  };
};

export const isText4jMasterFloorplanDataUsable = (data: GeneratedData): boolean =>
  (data.walls?.length || 0) >= 2 && data.extractionDiagnostics?.canImport === true;

export async function transcribeText4jMasterFloorplanData(
  request: Text4jMasterFloorplanRequest,
): Promise<GeneratedData> {
  const { data, mimeType } = splitText4jDataUrl(request.imageBase64);
  const prompt = buildText4jMasterFloorplanPrompt(
    request.brief,
    request.sourceKind,
    request.requestedBoundary,
    request.requestedExtentsMeters,
  );
  const response = await fetch('/api/text4j/master-geometry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBytes: data,
      mimeType,
      prompt,
      sourceKind: request.sourceKind,
      thinkingLevel: request.thinkingLevel || 'minimal',
      preferHighAccuracy: request.preferHighAccuracy === true,
    }),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Text 4.0 J master floorplan data API error (${response.status}): ${errorText}`);
  }
  const payload = await response.json();
  const geometry = payload.geometry || payload;
  if (payload.model) geometry.__masterModel = payload.model;
  if (payload.thinkingLevel) geometry.__masterThinkingLevel = payload.thinkingLevel;
  if (payload.retryReason) geometry.__masterRetryReason = payload.retryReason;
  return normalizeText4jMasterFloorplanData(geometry, request);
}
