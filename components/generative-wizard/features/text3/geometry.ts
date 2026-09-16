import type { GeneratedData } from '../../types';
import { auditText3AccessGraph } from '../../../../services/text3SpatialPolicy';

export const completeText3Geometry = (input: GeneratedData, designSummary = ''): GeneratedData => {
  const data: GeneratedData = {
    ...input,
    walls: input.walls?.map(w => ({ ...w, p1: [...w.p1], p2: [...w.p2] })),
    doors: input.doors?.map(d => ({ ...d, pos: [...d.pos] })),
    windows: input.windows?.map(w => ({ ...w, pos: [...w.pos] })),
    openings: input.openings?.map(o => ({ ...o, pos: [...o.pos] })),
    rooms: input.rooms?.map(r => ({ ...r, pos: [...r.pos] })),
    slabs: input.slabs?.map(s => ({ ...s, boundary: s.boundary.map(p => [...p]) })),
    railings: input.railings?.map(r => ({ ...r, p1: [...r.p1], p2: [...r.p2] })),
  };
  if (!data.walls?.length) return data;
  type GeneratedDoor = NonNullable<GeneratedData['doors']>[number];
  type GeneratedWall = NonNullable<GeneratedData['walls']>[number];
  const fallbackDoors: GeneratedDoor[] = [];
  const fallbackDoorHosts = new Map<GeneratedDoor, { wall: GeneratedWall; p1: number[]; p2: number[] }>();
  const rememberFallbackDoor = (door: GeneratedDoor, wall: GeneratedWall, p1 = wall.p1, p2 = wall.p2) => {
    fallbackDoors.push(door);
    fallbackDoorHosts.set(door, { wall, p1: [...p1], p2: [...p2] });
  };

  const bounds = () => {
    const pts = data.walls!.flatMap(w => [w.p1, w.p2]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
  };
  let box = bounds();
  const cx = (box.minX + box.maxX) / 2, cy = (box.minY + box.maxY) / 2;
  const mapPoints = (fn: (p: number[]) => number[]) => {
    data.walls?.forEach(w => { w.p1 = fn(w.p1); w.p2 = fn(w.p2); });
    data.doors?.forEach(d => { d.pos = fn(d.pos); });
    data.windows?.forEach(w => { w.pos = fn(w.pos); });
    data.openings?.forEach(o => { o.pos = fn(o.pos); });
    data.rooms?.forEach(r => { r.pos = fn(r.pos); });
    data.slabs?.forEach(s => { s.boundary = s.boundary.map(fn); });
    data.railings?.forEach(r => { r.p1 = fn(r.p1); r.p2 = fn(r.p2); });
    if (data.boundary) data.boundary = data.boundary.map(fn);
  };

  // Presentation convention: the short entry/balcony facades are horizontal.
  if ((box.maxX - box.minX) > (box.maxY - box.minY)) {
    mapPoints(p => [cx - (p[1] - cy), cy + (p[0] - cx)]);
    box = bounds();
  }

  const foyer = data.rooms?.find(r => /foyer|\bentry\b|reception|entrance.*lobby|entry.*corridor/i.test(r.label));
  const distanceToEnvelope = (pos: number[]) => Math.min(
    Math.abs(pos[0] - box.minX), Math.abs(pos[0] - box.maxX),
    Math.abs(pos[1] - box.minY), Math.abs(pos[1] - box.maxY)
  );
  const actualExteriorDoor = data.doors?.filter(door => distanceToEnvelope(door.pos) < 0.2)
    .sort((a, b) => distanceToEnvelope(a.pos) - distanceToEnvelope(b.pos))[0];
  const entryReferenceY = actualExteriorDoor?.pos[1] ?? foyer?.pos[1];
  if (entryReferenceY !== undefined && Math.abs(entryReferenceY - box.maxY) < Math.abs(entryReferenceY - box.minY)) {
    const midY = (box.minY + box.maxY) / 2;
    mapPoints(p => [p[0], 2 * midY - p[1]]);
    box = bounds();
  }

  const wallLength = (w: NonNullable<GeneratedData['walls']>[number]) =>
    Math.hypot(w.p2[0] - w.p1[0], w.p2[1] - w.p1[1]);
  const distanceToSegment = (p: number[], w: NonNullable<GeneratedData['walls']>[number]) => {
    const dx = w.p2[0] - w.p1[0], dy = w.p2[1] - w.p1[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - w.p1[0]) * dx + (p[1] - w.p1[1]) * dy) / l2)) : 0;
    return Math.hypot(p[0] - (w.p1[0] + t * dx), p[1] - (w.p1[1] + t * dy));
  };

  // Conservative facade normalization: only remove an inset line when both it
  // and the true outer line cover almost the complete same rectangular facade.
  // Openings hosted on that duplicate line are moved onto the retained facade.
  const normalizeDuplicateEnvelope = () => {
    type EnvelopeSide = {
      axis: 'horizontal' | 'vertical';
      outerCoordinate: number;
      inwardSign: -1 | 1;
      spanStart: number;
      spanEnd: number;
    };
    const sides: EnvelopeSide[] = [
      { axis: 'vertical', outerCoordinate: box.minX, inwardSign: 1, spanStart: box.minY, spanEnd: box.maxY },
      { axis: 'vertical', outerCoordinate: box.maxX, inwardSign: -1, spanStart: box.minY, spanEnd: box.maxY },
      { axis: 'horizontal', outerCoordinate: box.minY, inwardSign: 1, spanStart: box.minX, spanEnd: box.maxX },
      { axis: 'horizontal', outerCoordinate: box.maxY, inwardSign: -1, spanStart: box.minX, spanEnd: box.maxX },
    ];
    const isAxisWall = (wall: GeneratedWall, axis: EnvelopeSide['axis']) => axis === 'vertical'
      ? Math.abs(wall.p1[0] - wall.p2[0]) < 0.08
      : Math.abs(wall.p1[1] - wall.p2[1]) < 0.08;
    const wallCoordinate = (wall: GeneratedWall, axis: EnvelopeSide['axis']) => axis === 'vertical'
      ? (wall.p1[0] + wall.p2[0]) / 2
      : (wall.p1[1] + wall.p2[1]) / 2;
    const wallInterval = (wall: GeneratedWall, axis: EnvelopeSide['axis']) => axis === 'vertical'
      ? { start: Math.min(wall.p1[1], wall.p2[1]), end: Math.max(wall.p1[1], wall.p2[1]) }
      : { start: Math.min(wall.p1[0], wall.p2[0]), end: Math.max(wall.p1[0], wall.p2[0]) };
    const coverageRatio = (walls: GeneratedWall[], side: EnvelopeSide) => {
      const intervals = walls.map(wall => wallInterval(wall, side.axis))
        .map(interval => ({ start: Math.max(interval.start, side.spanStart), end: Math.min(interval.end, side.spanEnd) }))
        .filter(interval => interval.end > interval.start)
        .sort((a, b) => a.start - b.start);
      let covered = 0, cursor = side.spanStart;
      intervals.forEach(interval => {
        if (interval.end <= cursor) return;
        const start = Math.max(cursor, interval.start);
        covered += Math.max(0, interval.end - start);
        cursor = Math.max(cursor, interval.end);
      });
      return covered / Math.max(0.01, side.spanEnd - side.spanStart);
    };

    const removedHosts = new Map<GeneratedWall, EnvelopeSide>();
    sides.forEach(side => {
      const outerWalls = data.walls!.filter(wall => isAxisWall(wall, side.axis) &&
        Math.abs(wallCoordinate(wall, side.axis) - side.outerCoordinate) <= 0.08);
      if (coverageRatio(outerWalls, side) < 0.9) return;

      const insetCandidates = data.walls!.filter(wall => {
        if (!isAxisWall(wall, side.axis) || /exterior|outer/i.test(wall.type || '')) return false;
        const inwardOffset = (wallCoordinate(wall, side.axis) - side.outerCoordinate) * side.inwardSign;
        return inwardOffset >= 0.17 && inwardOffset <= 0.32;
      });
      const candidateCoordinates: number[] = [];
      insetCandidates.forEach(wall => {
        const coordinate = wallCoordinate(wall, side.axis);
        if (!candidateCoordinates.some(existing => Math.abs(existing - coordinate) <= 0.06)) candidateCoordinates.push(coordinate);
      });
      candidateCoordinates.forEach(coordinate => {
        const lineWalls = insetCandidates.filter(wall => Math.abs(wallCoordinate(wall, side.axis) - coordinate) <= 0.06);
        if (coverageRatio(lineWalls, side) < 0.85) return;
        lineWalls.forEach(wall => removedHosts.set(wall, side));
      });
    });
    if (!removedHosts.size) return;

    const hostedItems = [...(data.doors || []), ...(data.windows || []), ...(data.openings || [])];
    hostedItems.forEach(item => {
      const removedHost = Array.from(removedHosts.keys()).find(wall => distanceToSegment(item.pos, wall) < 0.12);
      if (!removedHost) return;
      const side = removedHosts.get(removedHost)!;
      if (side.axis === 'vertical') item.pos = [side.outerCoordinate, item.pos[1]];
      else item.pos = [item.pos[0], side.outerCoordinate];
    });
    data.walls = data.walls!.filter(wall => !removedHosts.has(wall));

    const facadeSide = (pos: number[]) => sides.find(side => side.axis === 'vertical'
      ? Math.abs(pos[0] - side.outerCoordinate) < 0.12
      : Math.abs(pos[1] - side.outerCoordinate) < 0.12);
    const windows = data.windows || [];
    const removedWindows = new Set<typeof windows[number]>();
    for (let i = 0; i < windows.length; i++) {
      const first = windows[i];
      if (removedWindows.has(first)) continue;
      const firstSide = facadeSide(first.pos);
      if (!firstSide) continue;
      for (let j = i + 1; j < windows.length; j++) {
        const second = windows[j];
        if (removedWindows.has(second) || facadeSide(second.pos) !== firstSide || first.levelIndex !== second.levelIndex) continue;
        const firstAlong = firstSide.axis === 'vertical' ? first.pos[1] : first.pos[0];
        const secondAlong = firstSide.axis === 'vertical' ? second.pos[1] : second.pos[0];
        const firstWidth = first.width || 1.2, secondWidth = second.width || 1.2;
        const overlap = Math.min(firstAlong + firstWidth / 2, secondAlong + secondWidth / 2) -
          Math.max(firstAlong - firstWidth / 2, secondAlong - secondWidth / 2);
        if (overlap < Math.min(firstWidth, secondWidth) * 0.5) continue;
        const keepSecond = second.type === 'full-height' && first.type !== 'full-height';
        const keeper = keepSecond ? second : first;
        const duplicate = keepSecond ? first : second;
        keeper.width = Math.max(firstWidth, secondWidth);
        removedWindows.add(duplicate);
        if (keepSecond) break;
      }
    }
    data.windows = windows.filter(window => !removedWindows.has(window));
    box = bounds();
  };
  normalizeDuplicateEnvelope();

  // Fallback only: extend a dangling wall endpoint along its existing line to
  // the nearest clearly intersecting wall. Near-parallel targets are excluded.
  const closeShortWallGaps = () => {
    const maxGap = 0.3048; // 1 foot
    const minIntersectionAngle = Math.PI / 4; // 45 degrees
    const cross = (a: number[], b: number[]) => a[0] * b[1] - a[1] * b[0];
    const pointToLineSegment = (point: number[], start: number[], end: number[]) => {
      const dx = end[0] - start[0], dy = end[1] - start[1];
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq ? Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSq)) : 0;
      return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
    };
    const crossesOpening = (start: number[], end: number[]) =>
      [...(data.doors || []), ...(data.windows || []), ...(data.openings || [])].some(opening =>
        pointToLineSegment(opening.pos, start, end) <= Math.max(0.08, (opening.width || 0.8) / 2)
      );

    data.walls!.forEach(wall => {
      (['p1', 'p2'] as const).forEach(key => {
        const otherKey = key === 'p1' ? 'p2' : 'p1';
        const endpoint = wall[key];
        const inward = wall[otherKey];
        const dx = endpoint[0] - inward[0], dy = endpoint[1] - inward[1];
        const length = Math.hypot(dx, dy);
        if (length < 0.1) return;
        const ray = [dx / length, dy / length];
        let bestPoint: number[] | undefined;
        let bestDistance = maxGap + 1;

        data.walls!.forEach(target => {
          if (target === wall) return;
          const targetVector = [target.p2[0] - target.p1[0], target.p2[1] - target.p1[1]];
          const targetLength = Math.hypot(targetVector[0], targetVector[1]);
          if (targetLength < 0.1) return;
          const cosine = Math.min(1, Math.abs((ray[0] * targetVector[0] + ray[1] * targetVector[1]) / targetLength));
          const angle = Math.acos(cosine);
          if (angle < minIntersectionAngle) return;

          const denominator = cross(ray, targetVector);
          if (Math.abs(denominator) < 0.0001) return;
          const fromEndpoint = [target.p1[0] - endpoint[0], target.p1[1] - endpoint[1]];
          const distance = cross(fromEndpoint, targetVector) / denominator;
          const targetT = cross(fromEndpoint, ray) / denominator;
          if (distance <= 0.005 || distance > maxGap || targetT < -0.01 || targetT > 1.01 || distance >= bestDistance) return;
          const intersection = [endpoint[0] + ray[0] * distance, endpoint[1] + ray[1] * distance];
          if (crossesOpening(endpoint, intersection)) return;
          bestPoint = intersection;
          bestDistance = distance;
        });

        if (bestPoint) wall[key] = bestPoint;
      });
    });
    box = bounds();
  };
  closeShortWallGaps();

  type GeneratedRoom = NonNullable<GeneratedData['rooms']>[number];
  type SharedRoomBoundary = {
    wall: NonNullable<GeneratedData['walls']>[number];
    axis: 'horizontal' | 'vertical';
    start: number;
    end: number;
    length: number;
    pos: number[];
  };
  const roomBounds = (room: GeneratedRoom) => {
    const vertical = data.walls!.filter(w => Math.abs(w.p1[0] - w.p2[0]) < 0.1 && room.pos[1] >= Math.min(w.p1[1], w.p2[1]) - 0.2 && room.pos[1] <= Math.max(w.p1[1], w.p2[1]) + 0.2);
    const horizontal = data.walls!.filter(w => Math.abs(w.p1[1] - w.p2[1]) < 0.1 && room.pos[0] >= Math.min(w.p1[0], w.p2[0]) - 0.2 && room.pos[0] <= Math.max(w.p1[0], w.p2[0]) + 0.2);
    return {
      left: Math.max(...vertical.map(w => w.p1[0]).filter(x => x < room.pos[0]), box.minX),
      right: Math.min(...vertical.map(w => w.p1[0]).filter(x => x > room.pos[0]), box.maxX),
      bottom: Math.max(...horizontal.map(w => w.p1[1]).filter(y => y < room.pos[1]), box.minY),
      top: Math.min(...horizontal.map(w => w.p1[1]).filter(y => y > room.pos[1]), box.maxY),
    };
  };
  const findSharedRoomBoundary = (a: GeneratedRoom, b: GeneratedRoom, minimumLength = 0.75): SharedRoomBoundary | undefined => {
    if (a === b) return undefined;
    const ra = roomBounds(a), rb = roomBounds(b);
    const tolerance = 0.25;
    const candidates: Array<{ axis: 'horizontal' | 'vertical'; coordinate: number; start: number; end: number }> = [];
    const addVertical = (xa: number, xb: number) => {
      const start = Math.max(ra.bottom, rb.bottom), end = Math.min(ra.top, rb.top);
      if (Math.abs(xa - xb) <= tolerance && end - start >= minimumLength) candidates.push({ axis: 'vertical', coordinate: (xa + xb) / 2, start, end });
    };
    const addHorizontal = (ya: number, yb: number) => {
      const start = Math.max(ra.left, rb.left), end = Math.min(ra.right, rb.right);
      if (Math.abs(ya - yb) <= tolerance && end - start >= minimumLength) candidates.push({ axis: 'horizontal', coordinate: (ya + yb) / 2, start, end });
    };
    addVertical(ra.right, rb.left);
    addVertical(rb.right, ra.left);
    addHorizontal(ra.top, rb.bottom);
    addHorizontal(rb.top, ra.bottom);

    const matches: SharedRoomBoundary[] = [];
    candidates.forEach(candidate => data.walls!.forEach(wall => {
      const vertical = Math.abs(wall.p1[0] - wall.p2[0]) < 0.1;
      if ((candidate.axis === 'vertical') !== vertical) return;
      const coordinate = vertical ? (wall.p1[0] + wall.p2[0]) / 2 : (wall.p1[1] + wall.p2[1]) / 2;
      if (Math.abs(coordinate - candidate.coordinate) > 0.2) return;
      const wallStart = vertical ? Math.min(wall.p1[1], wall.p2[1]) : Math.min(wall.p1[0], wall.p2[0]);
      const wallEnd = vertical ? Math.max(wall.p1[1], wall.p2[1]) : Math.max(wall.p1[0], wall.p2[0]);
      const start = Math.max(candidate.start, wallStart), end = Math.min(candidate.end, wallEnd);
      if (end - start < minimumLength) return;
      matches.push({ wall, axis: candidate.axis, start, end, length: end - start, pos: vertical ? [coordinate, (start + end) / 2] : [(start + end) / 2, coordinate] });
    }));
    return matches.sort((a, b) => b.length - a.length)[0];
  };
  const isOnSharedRoomBoundary = (pos: number[], shared: SharedRoomBoundary) => {
    const along = shared.axis === 'vertical' ? pos[1] : pos[0];
    return distanceToSegment(pos, shared.wall) < 0.12 && along >= shared.start - 0.1 && along <= shared.end + 0.1;
  };

  // Anchor the main outside entry to the foyer when present; otherwise it must
  // enter Living/Living-Dining directly, never another room type.
  const directEntryRoom = foyer || data.rooms?.find(r => /living/i.test(r.label));
  if (directEntryRoom) {
    const entryRoomBounds = roomBounds(directEntryRoom);
    const entryWallCandidates = data.walls.flatMap(wall => {
      if (!(
      Math.abs(entryRoomBounds.bottom - box.minY) < 0.35 &&
      Math.abs(wall.p1[1] - wall.p2[1]) < 0.1 &&
      Math.abs((wall.p1[1] + wall.p2[1]) / 2 - box.minY) < 0.08
      )) return [];
      const segmentStart = Math.max(Math.min(wall.p1[0], wall.p2[0]), entryRoomBounds.left);
      const segmentEnd = Math.min(Math.max(wall.p1[0], wall.p2[0]), entryRoomBounds.right);
      return segmentEnd - segmentStart >= 0.65 ? [{ wall, segmentStart, segmentEnd }] : [];
    }).sort((a, b) => (b.segmentEnd - b.segmentStart) - (a.segmentEnd - a.segmentStart));
    const entryHost = entryWallCandidates[0];
    if (entryHost) {
      const { wall: foyerEntryWall, segmentStart, segmentEnd } = entryHost;
      const segmentLength = segmentEnd - segmentStart;
      const validatorMargin = 0.0762; // Same 3-inch margin used by validateOpenings.
      const usableWidth = segmentLength - validatorMargin * 2;
      const existingFoyerExteriorDoor = data.doors?.find(door =>
        distanceToSegment(door.pos, foyerEntryWall) < 0.12 &&
        door.pos[0] >= segmentStart - 0.1 && door.pos[0] <= segmentEnd + 0.1
      );
      if (existingFoyerExteriorDoor && usableWidth >= 0.55) {
        existingFoyerExteriorDoor.mandatoryExteriorEntry = true;
        existingFoyerExteriorDoor.width = Math.min(existingFoyerExteriorDoor.width || 0.9, usableWidth);
        const halfWidth = existingFoyerExteriorDoor.width / 2;
        existingFoyerExteriorDoor.pos = [
          Math.max(segmentStart + validatorMargin + halfWidth,
            Math.min(segmentEnd - validatorMargin - halfWidth, existingFoyerExteriorDoor.pos[0])),
          (foyerEntryWall.p1[1] + foyerEntryWall.p2[1]) / 2,
        ];
      } else if (!existingFoyerExteriorDoor && usableWidth >= 0.55) {
        const entryWidth = Math.min(0.9, usableWidth);
        const halfWidth = entryWidth / 2;
        const entryX = Math.max(segmentStart + validatorMargin + halfWidth,
          Math.min(segmentEnd - validatorMargin - halfWidth, directEntryRoom.pos[0]));
        const entryDoor: GeneratedDoor = {
          pos: [entryX, (foyerEntryWall.p1[1] + foyerEntryWall.p2[1]) / 2],
          rotation: 0,
          type: 'single',
          width: entryWidth,
          levelIndex: directEntryRoom.levelIndex,
          mandatoryExteriorEntry: true,
        };
        (data.doors ||= []).push(entryDoor);
        rememberFallbackDoor(entryDoor, foyerEntryWall,
          [segmentStart, foyerEntryWall.p1[1]], [segmentEnd, foyerEntryWall.p1[1]]);
      }
    }
  }

  const kitchen = data.rooms?.find(r => /kitchen/i.test(r.label));
  const living = data.rooms?.find(r => /living|dining/i.test(r.label));
  const dining = data.rooms?.find(r => /dining/i.test(r.label));
  const livingOnly = data.rooms?.find(r => /living/i.test(r.label));
  const foyerRoom = data.rooms?.find(r => /foyer|entry/i.test(r.label));
  const lobby = data.rooms?.find(r => /lobby|hall|corridor/i.test(r.label));
  const bedroomLobby = data.rooms?.find(r => /bedroom.*lobby|private.*lobby/i.test(r.label));
  const sharedCirculation = (data.rooms || []).filter(r => r !== bedroomLobby && /foyer|\bentry\b|circulation|hall|corridor|lobby/i.test(r.label));
  const commonBath = data.rooms?.find(r => /common.*bath|shared.*bath|powder/i.test(r.label));
  const nonEnsuiteBedroom = data.rooms?.find(r => /bedroom/i.test(r.label) && !/master|suite/i.test(r.label));
  const openKitchenRequested = /open[\s-]*(?:concept|plan)?\s*kitchen|open[\s-]*kitchen/i.test(designSummary) ||
    !!(kitchen && /open[\s-]*kitchen/i.test(kitchen.label));
  const findInterveningWall = (a: NonNullable<GeneratedData['rooms']>[number], b: NonNullable<GeneratedData['rooms']>[number], requireSingle = false) => {
    const vx = b.pos[0] - a.pos[0], vy = b.pos[1] - a.pos[1];
    const segmentLength = Math.hypot(vx, vy);
    if (segmentLength < 0.2) return undefined;
    const candidates = data.walls!.filter(w => {
      const wx = w.p2[0] - w.p1[0], wy = w.p2[1] - w.p1[1];
      const denom = vx * wy - vy * wx;
      if (Math.abs(denom) < 0.001) return false;
      const qx = w.p1[0] - a.pos[0], qy = w.p1[1] - a.pos[1];
      const t = (qx * wy - qy * wx) / denom;
      const u = (qx * vy - qy * vx) / denom;
      return t > 0.08 && t < 0.92 && u >= -0.03 && u <= 1.03;
    });
    if (requireSingle && candidates.length !== 1) return undefined;
    const mid = [(a.pos[0] + b.pos[0]) / 2, (a.pos[1] + b.pos[1]) / 2];
    return candidates.sort((wa, wb) => distanceToSegment(mid, wa) - distanceToSegment(mid, wb))[0];
  };
  const connectRooms = (
    a: NonNullable<GeneratedData['rooms']>[number] | undefined,
    b: NonNullable<GeneratedData['rooms']>[number] | undefined,
    kind: 'opening' | 'door',
    requireSingleWall = false
  ) => {
    if (!a || !b) return;
    const shared = findInterveningWall(a, b, requireSingleWall);
    if (!shared || wallLength(shared) < 1.1) return;
    const alreadyConnected = [...(data.openings || []), ...(data.doors || [])]
      .some(o => distanceToSegment(o.pos, shared) < 0.12);
    if (alreadyConnected) return;
    const pos = [(shared.p1[0] + shared.p2[0]) / 2, (shared.p1[1] + shared.p2[1]) / 2];
    if (kind === 'opening') {
      (data.openings ||= []).push({ pos, width: wallLength(shared) * 0.65, rotation: 0, levelIndex: shared.levelIndex });
    } else {
      const door: GeneratedDoor = { pos, width: 0.9, rotation: 0, type: 'single', levelIndex: shared.levelIndex };
      (data.doors ||= []).push(door);
      rememberFallbackDoor(door, shared);
    }
  };
  const roomsShareOpenPlanZone = (a: GeneratedRoom, b: GeneratedRoom) => {
    const ra = roomBounds(a), rb = roomBounds(b);
    return Math.abs(ra.left - rb.left) < 0.15 && Math.abs(ra.right - rb.right) < 0.15 && Math.abs(ra.bottom - rb.bottom) < 0.15 && Math.abs(ra.top - rb.top) < 0.15;
  };
  type SharedRoomEdge = { axis: 'horizontal' | 'vertical'; coordinate: number; start: number; end: number; length: number };
  const sharedRoomEdges = (a: GeneratedRoom, b: GeneratedRoom): SharedRoomEdge[] => {
    if (a === b) return [];
    const ra = roomBounds(a), rb = roomBounds(b);
    const tolerance = 0.25;
    const edges: SharedRoomEdge[] = [];
    const addVertical = (xa: number, xb: number) => {
      const start = Math.max(ra.bottom, rb.bottom), end = Math.min(ra.top, rb.top);
      if (Math.abs(xa - xb) <= tolerance && end - start >= 0.75) {
        edges.push({ axis: 'vertical', coordinate: (xa + xb) / 2, start, end, length: end - start });
      }
    };
    const addHorizontal = (ya: number, yb: number) => {
      const start = Math.max(ra.left, rb.left), end = Math.min(ra.right, rb.right);
      if (Math.abs(ya - yb) <= tolerance && end - start >= 0.75) {
        edges.push({ axis: 'horizontal', coordinate: (ya + yb) / 2, start, end, length: end - start });
      }
    };
    addVertical(ra.right, rb.left);
    addVertical(rb.right, ra.left);
    addHorizontal(ra.top, rb.bottom);
    addHorizontal(rb.top, ra.bottom);
    return edges;
  };
  const isPublicOrCirculation = (room: GeneratedRoom) => /foyer|\bentry\b|vestibule|reception|lobby|hall|corridor|circulation|living|lounge|family\s*room|dining/i.test(room.label);
  const isCirculationLabel = (room: GeneratedRoom) => /foyer|\bentry\b|vestibule|reception|lobby|hall|corridor|circulation/i.test(room.label);
  const circulationRoomsOverlap = (a: GeneratedRoom, b: GeneratedRoom) => {
    if (!isCirculationLabel(a) || !isCirculationLabel(b)) return false;
    const ra = roomBounds(a), rb = roomBounds(b);
    const overlap = Math.max(0, Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left)) *
      Math.max(0, Math.min(ra.top, rb.top) - Math.max(ra.bottom, rb.bottom));
    const smaller = Math.min(
      Math.max(0, ra.right - ra.left) * Math.max(0, ra.top - ra.bottom),
      Math.max(0, rb.right - rb.left) * Math.max(0, rb.top - rb.bottom)
    );
    return smaller > 0.1 && overlap / smaller >= 0.5;
  };
  const hasUnwalledSharedEdge = (a: GeneratedRoom, b: GeneratedRoom) => {
    const openEdgeEligible = (isPublicOrCirculation(a) && isPublicOrCirculation(b)) ||
      (openKitchenRequested && (/kitchen/i.test(a.label) || /kitchen/i.test(b.label)) &&
        (/living|dining/i.test(a.label) || /living|dining/i.test(b.label)));
    if (!openEdgeEligible) return false;
    if (roomsShareOpenPlanZone(a, b)) return true;
    return sharedRoomEdges(a, b).some(edge => {
      const coverage = data.walls!.flatMap(wall => {
        const vertical = Math.abs(wall.p1[0] - wall.p2[0]) < 0.1;
        if ((edge.axis === 'vertical') !== vertical) return [];
        const coordinate = vertical ? (wall.p1[0] + wall.p2[0]) / 2 : (wall.p1[1] + wall.p2[1]) / 2;
        if (Math.abs(coordinate - edge.coordinate) > 0.15) return [];
        const wallStart = vertical ? Math.min(wall.p1[1], wall.p2[1]) : Math.min(wall.p1[0], wall.p2[0]);
        const wallEnd = vertical ? Math.max(wall.p1[1], wall.p2[1]) : Math.max(wall.p1[0], wall.p2[0]);
        const start = Math.max(edge.start, wallStart), end = Math.min(edge.end, wallEnd);
        return end > start ? [{ start, end }] : [];
      }).sort((left, right) => left.start - right.start);
      let cursor = edge.start;
      for (const interval of coverage) {
        if (interval.start - cursor >= 0.75) return true;
        cursor = Math.max(cursor, interval.end);
      }
      return edge.end - cursor >= 0.75;
    });
  };
  const connectSharedRooms = (a: GeneratedRoom | undefined, b: GeneratedRoom | undefined, kind: 'opening' | 'door') => {
    if (!a || !b) return false;
    if (roomsShareOpenPlanZone(a, b) || circulationRoomsOverlap(a, b) || hasUnwalledSharedEdge(a, b)) return true;
    const shared = findSharedRoomBoundary(a, b);
    if (!shared || shared.length < (kind === 'opening' ? 1.1 : 0.75)) return false;
    const existingOpening = data.openings?.some(item => isOnSharedRoomBoundary(item.pos, shared));
    const existingDoor = data.doors?.some(item => isOnSharedRoomBoundary(item.pos, shared));
    if (kind === 'opening') {
      if (existingOpening) return true;
      data.doors = data.doors?.filter(item => !isOnSharedRoomBoundary(item.pos, shared));
      (data.openings ||= []).push({ pos: shared.pos, width: Math.min(shared.length - 0.15, shared.length * 0.65), rotation: shared.axis === 'vertical' ? 90 : 0, levelIndex: shared.wall.levelIndex });
    } else if (!existingDoor && !existingOpening) {
      const door: GeneratedDoor = { pos: shared.pos, width: Math.min(0.9, shared.length - 0.1), rotation: shared.axis === 'vertical' ? 90 : 0, type: 'single', levelIndex: shared.wall.levelIndex };
      (data.doors ||= []).push(door);
      rememberFallbackDoor(door, shared.wall,
        shared.axis === 'vertical' ? [shared.pos[0], shared.start] : [shared.start, shared.pos[1]],
        shared.axis === 'vertical' ? [shared.pos[0], shared.end] : [shared.end, shared.pos[1]]);
    }
    return true;
  };
  const connectFirstShared = (source: GeneratedRoom | undefined, targets: Array<GeneratedRoom | undefined>, kind: 'opening' | 'door') => {
    if (!source) return false;
    for (const target of targets) if (target && connectSharedRooms(source, target, kind)) return true;
    return false;
  };

  if (kitchen) connectFirstShared(kitchen, [dining, livingOnly], openKitchenRequested ? 'opening' : 'door');
  connectSharedRooms(livingOnly, dining, 'opening');
  connectFirstShared(foyerRoom, [livingOnly, dining], 'door');
  if (bedroomLobby) connectFirstShared(bedroomLobby, [livingOnly, dining, ...sharedCirculation], 'door');
  else connectFirstShared(lobby, [livingOnly, dining, foyerRoom], 'door');

  // Bedrooms may meet Living/Dining through doors only, never wall openings.
  const bedrooms = (data.rooms || []).filter(r => /bedroom/i.test(r.label) && !/lobby/i.test(r.label));
  const publicRooms = (data.rooms || []).filter(r => /living|dining/i.test(r.label));
  bedrooms.forEach(bedroom => publicRooms.forEach(publicRoom => {
    const shared = findSharedRoomBoundary(bedroom, publicRoom);
    if (!shared) return;
    const hadOpening = data.openings?.some(item => isOnSharedRoomBoundary(item.pos, shared));
    if (!hadOpening) return;
    data.openings = data.openings?.filter(item => !isOnSharedRoomBoundary(item.pos, shared));
    const hasDoor = data.doors?.some(item => isOnSharedRoomBoundary(item.pos, shared));
    if (!hasDoor) {
      const door: GeneratedDoor = { pos: shared.pos, width: Math.min(0.9, shared.length - 0.1), rotation: shared.axis === 'vertical' ? 90 : 0, type: 'single', levelIndex: shared.wall.levelIndex };
      (data.doors ||= []).push(door);
      rememberFallbackDoor(door, shared.wall,
        shared.axis === 'vertical' ? [shared.pos[0], shared.start] : [shared.start, shared.pos[1]],
        shared.axis === 'vertical' ? [shared.pos[0], shared.end] : [shared.end, shared.pos[1]]);
    }
  }));
  // A non-ensuite bedroom may share the common bathroom Jack-and-Jill style,
  // while the bathroom retains its existing common-side entrance.
  connectRooms(nonEnsuiteBedroom, commonBath, 'door', true);

  // Universal bathroom access rules: bathroom boundaries may contain doors,
  // but never wall openings, and a bathroom may never open into a kitchen.
  const bathrooms = (data.rooms || []).filter(r => /bath|powder|wc|toilet/i.test(r.label));
  const bathroomWalls = new Set<NonNullable<GeneratedData['walls']>[number]>();
  const bathroomKitchenWalls = new Set<NonNullable<GeneratedData['walls']>[number]>();
  bathrooms.forEach(bath => {
    (data.rooms || []).forEach(other => {
      if (other === bath) return;
      const shared = findInterveningWall(bath, other, true);
      if (!shared) return;
      bathroomWalls.add(shared);
      if (/kitchen/i.test(other.label)) bathroomKitchenWalls.add(shared);
    });
  });
  const liesOnAny = (pos: number[], walls: Set<NonNullable<GeneratedData['walls']>[number]>) =>
    Array.from(walls).some(w => distanceToSegment(pos, w) < 0.12);
  data.openings = data.openings?.filter(o => !liesOnAny(o.pos, bathroomWalls));
  data.doors = data.doors?.filter(d => !liesOnAny(d.pos, bathroomKitchenWalls));

  const masterBedroom = data.rooms?.find(r => /master.*bed|master.*suite/i.test(r.label));
  bathrooms.forEach(bath => {
    if (/ensuite|attached/i.test(bath.label)) connectRooms(bath, masterBedroom, 'door', true);
    else connectRooms(bath, lobby || livingOnly || dining, 'door', true);
  });

  // Final access fallback: connect only components that remain unreachable
  // from the entry after all existing Gemini and targeted repair connections.
  const accessRooms = (data.rooms || []).filter(room => !/balcony|terrace/i.test(room.label));
  const isBathroom = (room: GeneratedRoom) => /bath|powder|\bwc\b|toilet/i.test(room.label);
  const isEnsuite = (room: GeneratedRoom) => /ensuite|attached/i.test(room.label);
  const isBedroom = (room: GeneratedRoom) => /bedroom|master.*suite/i.test(room.label) && !/lobby/i.test(room.label);
  const isKitchen = (room: GeneratedRoom) => /kitchen/i.test(room.label);
  const isDining = (room: GeneratedRoom) => /dining/i.test(room.label);
  const isLiving = (room: GeneratedRoom) => /living|lounge|family\s*room/i.test(room.label);
  const isEntry = (room: GeneratedRoom) => /foyer|\bentry\b|vestibule|reception/i.test(room.label);
  const isCirculation = (room: GeneratedRoom) => /lobby|hall|corridor|circulation/i.test(room.label);
  const existingRoomConnection = (a: GeneratedRoom, b: GeneratedRoom) => {
    if (circulationRoomsOverlap(a, b) || hasUnwalledSharedEdge(a, b)) return true;
    const shared = findSharedRoomBoundary(a, b);
    if (!shared) return false;
    return [...(data.doors || []), ...(data.openings || [])].some(item => isOnSharedRoomBoundary(item.pos, shared));
  };
  const reachableFromEntry = () => {
    const root = foyerRoom || livingOnly;
    const reached = new Set<GeneratedRoom>();
    if (!root) return reached;
    const queue = [root];
    reached.add(root);
    while (queue.length) {
      const current = queue.shift()!;
      accessRooms.forEach(candidate => {
        if (!reached.has(candidate) && existingRoomConnection(current, candidate)) {
          reached.add(candidate);
          queue.push(candidate);
        }
      });
    }
    return reached;
  };
  const targetAllowed = (source: GeneratedRoom, target: GeneratedRoom, reached: Set<GeneratedRoom>) => {
    if (source === target || isBathroom(target) && !isEnsuite(source)) return false;
    if (isEntry(target) && !isLiving(source) && !(isCirculation(source) && !/bedroom|private/i.test(source.label))) return false;
    if (isEnsuite(source)) return !!masterBedroom && target === masterBedroom;
    if (isBathroom(source)) return !isKitchen(target) && (isEntry(target) || isCirculation(target) || isLiving(target) || isDining(target));
    if (isBedroom(source)) return !isKitchen(target) && !isBathroom(target) && !isBedroom(target) &&
      (isEntry(target) || isCirculation(target) || isLiving(target) || isDining(target));
    if (isKitchen(source)) {
      if (isDining(target) || isLiving(target)) return true;
      const publicZoneReached = Array.from(reached).some(room => isLiving(room) || isDining(room));
      return publicZoneReached && (isEntry(target) || isCirculation(target));
    }
    if (isDining(source)) return isLiving(target) || isKitchen(target) || isEntry(target) || isCirculation(target);
    if (isLiving(source)) return isEntry(target) || isCirculation(target) || isDining(target);
    if (isEntry(source)) return isLiving(target) || isDining(target);
    return isEntry(target) || isCirculation(target) || isLiving(target) || isDining(target) || isBedroom(target);
  };
  const targetPriority = (source: GeneratedRoom, target: GeneratedRoom) => {
    if (isLiving(source)) return isEntry(target) ? 0 : isCirculation(target) ? 1 : 2;
    if (isDining(source)) return isLiving(target) ? 0 : isKitchen(target) ? 1 : 2;
    if (isKitchen(source)) return isDining(target) ? 0 : isLiving(target) ? 1 : isCirculation(target) ? 2 : 3;
    if (isBedroom(source)) return isCirculation(target) ? 0 : isEntry(target) ? 1 : isLiving(target) ? 2 : 3;
    if (isBathroom(source)) return isCirculation(target) ? 0 : isEntry(target) ? 1 : 2;
    return isCirculation(target) || isEntry(target) ? 0 : 1;
  };
  const fallbackConnectionKind = (source: GeneratedRoom, target: GeneratedRoom): 'door' | 'opening' => {
    if (isKitchen(source) || isKitchen(target)) {
      return openKitchenRequested ? 'opening' : 'door';
    }
    if ((isDining(source) && isLiving(target)) || (isLiving(source) && isDining(target))) return 'opening';
    return 'door';
  };
  const addFallbackConnection = (source: GeneratedRoom, target: GeneratedRoom, shared: SharedRoomBoundary) => {
    if (existingRoomConnection(source, target)) return false;
    const kind = fallbackConnectionKind(source, target);
    if (kind === 'opening') {
      if (isBathroom(source) || isBathroom(target) || isBedroom(source) || isBedroom(target)) return false;
      (data.openings ||= []).push({
        pos: shared.pos,
        width: Math.min(shared.length * 0.7, shared.length - 0.15),
        rotation: shared.axis === 'vertical' ? 90 : 0,
        levelIndex: shared.wall.levelIndex,
      });
    } else {
      const door: GeneratedDoor = {
        pos: shared.pos,
        width: Math.max(0.7, Math.min(0.9, shared.length - 0.1)),
        rotation: shared.axis === 'vertical' ? 90 : 0,
        type: 'single',
        levelIndex: shared.wall.levelIndex,
      };
      (data.doors ||= []).push(door);
      rememberFallbackDoor(door, shared.wall,
        shared.axis === 'vertical' ? [shared.pos[0], shared.start] : [shared.start, shared.pos[1]],
        shared.axis === 'vertical' ? [shared.pos[0], shared.end] : [shared.end, shared.pos[1]]);
    }
    return true;
  };
  const removeShortPublicPartition = (reached: Set<GeneratedRoom>, unreachable: GeneratedRoom[]) => {
    const circulationSources = Array.from(reached).filter(room => isEntry(room) || isCirculation(room));
    const publicTargets = unreachable.filter(room => isLiving(room) || isDining(room));
    for (const source of circulationSources) {
      for (const target of publicTargets) {
        if (existingRoomConnection(source, target)) continue;
        const shared = findSharedRoomBoundary(source, target, 0.65);
        if (!shared || shared.length > 0.75 + 0.001) continue;
        const completeWallLength = wallLength(shared.wall);
        if (completeWallLength > 0.9 || completeWallLength > shared.length + 0.15) continue;
        data.walls = data.walls!.filter(wall => wall !== shared.wall);
        return true;
      }
    }
    return false;
  };

  for (let repairCount = 0; repairCount < accessRooms.length; repairCount++) {
    const reached = reachableFromEntry();
    const unreachable = accessRooms.filter(room => !reached.has(room));
    if (!unreachable.length) break;
    if (removeShortPublicPartition(reached, unreachable)) continue;
    const options = unreachable.flatMap(source => Array.from(reached)
      .filter(target => targetAllowed(source, target, reached))
      .map(target => ({ source, target, shared: findSharedRoomBoundary(source, target) }))
      .filter((option): option is { source: GeneratedRoom; target: GeneratedRoom; shared: SharedRoomBoundary } => !!option.shared)
    ).sort((a, b) => targetPriority(a.source, a.target) - targetPriority(b.source, b.target) || b.shared.length - a.shared.length);
    const next = options[0];
    if (!next || !addFallbackConnection(next.source, next.target, next.shared)) break;
  }

  // Resolve conflicts only for doors created by this local fallback. Existing
  // generated doors are never moved or retyped.
  const projectToWall = (pos: number[], wall: NonNullable<GeneratedData['walls']>[number]) => {
    const dx = wall.p2[0] - wall.p1[0], dy = wall.p2[1] - wall.p1[1];
    const length = Math.hypot(dx, dy);
    const ux = length ? dx / length : 1, uy = length ? dy / length : 0;
    const along = Math.max(0, Math.min(length, (pos[0] - wall.p1[0]) * ux + (pos[1] - wall.p1[1]) * uy));
    return { length, ux, uy, along, pos: [wall.p1[0] + ux * along, wall.p1[1] + uy * along] };
  };
  fallbackDoors.filter(door => data.doors?.includes(door)).forEach(door => {
    const rememberedHost = fallbackDoorHosts.get(door);
    const hostWall = rememberedHost?.wall || data.walls!.filter(wall => distanceToSegment(door.pos, wall) < 0.2)
      .sort((a, b) => distanceToSegment(door.pos, a) - distanceToSegment(door.pos, b))[0];
    if (!hostWall) return;
    const projection = projectToWall(door.pos, hostWall);
    const hostStart = rememberedHost ? projectToWall(rememberedHost.p1, hostWall).along : 0;
    const hostEnd = rememberedHost ? projectToWall(rememberedHost.p2, hostWall).along : projection.length;
    const segmentStart = Math.min(hostStart, hostEnd), segmentEnd = Math.max(hostStart, hostEnd);
    const halfWidth = Math.min((door.width || 0.9) / 2, Math.max(0, projection.length / 2 - 0.05));
    const cornerClearance = halfWidth + 0.15;
    const hasSwingClearance = segmentEnd - segmentStart >= cornerClearance * 2;
    const minAlong = hasSwingClearance ? segmentStart + cornerClearance : (segmentStart + segmentEnd) / 2;
    const maxAlong = hasSwingClearance ? segmentEnd - cornerClearance : minAlong;
    const preferredAlong = Math.max(minAlong, Math.min(maxAlong, projection.along));
    const candidateOffsets = [0];
    for (let offset = 0.2; offset <= projection.length; offset += 0.2) candidateOffsets.push(offset, -offset);
    const candidates = (hasSwingClearance ? candidateOffsets : [])
      .map(offset => Math.max(minAlong, Math.min(maxAlong, preferredAlong + offset)))
      .filter((along, index, list) => list.findIndex(value => Math.abs(value - along) < 0.01) === index);
    const clearCandidate = candidates.find(along => {
      const candidate = [hostWall.p1[0] + projection.ux * along, hostWall.p1[1] + projection.uy * along];
      return !(data.doors || []).some(other => other !== door &&
        Math.hypot(candidate[0] - other.pos[0], candidate[1] - other.pos[1]) <
          (door.width || 0.9) + (other.width || 0.9) + 0.15);
    });
    const finalAlong = clearCandidate ?? preferredAlong;
    door.pos = [hostWall.p1[0] + projection.ux * finalAlong, hostWall.p1[1] + projection.uy * finalAlong];
    door.rotation = Math.abs(projection.ux) < Math.abs(projection.uy) ? 90 : 0;
    if (clearCandidate === undefined) door.type = 'pocket';
  });

  const balcony = data.rooms?.find(r => /balcony|terrace/i.test(r.label));
  if (balcony) {
    const facadeWidth = box.maxX - box.minX;
    const balconyAccessRoom = [livingOnly, dining, ...bedrooms]
      .filter((room): room is GeneratedRoom => !!room && !isBathroom(room))
      .filter(room => Math.abs(roomBounds(room).top - box.maxY) < 0.35)
      .sort((a, b) => (isLiving(a) ? -1 : isLiving(b) ? 1 : isDining(a) ? -1 : isDining(b) ? 1 : 0))[0];
    const accessRoomBounds = balconyAccessRoom ? roomBounds(balconyAccessRoom) : undefined;
    const livingFacadeWall = accessRoomBounds ? data.walls.filter(w => {
      if (Math.abs(w.p1[1] - w.p2[1]) >= 0.1 || Math.abs((w.p1[1] + w.p2[1]) / 2 - box.maxY) >= 0.35) return false;
      const start = Math.max(Math.min(w.p1[0], w.p2[0]), accessRoomBounds.left);
      const end = Math.min(Math.max(w.p1[0], w.p2[0]), accessRoomBounds.right);
      return end - start >= 0.8;
    }).sort((a, b) => distanceToSegment([balconyAccessRoom!.pos[0], box.maxY], a) - distanceToSegment([balconyAccessRoom!.pos[0], box.maxY], b))[0] : undefined;
    const width = livingFacadeWall ? wallLength(livingFacadeWall) : Math.max(1.8, facadeWidth * 0.7);
    const half = Math.min(width / 2, facadeWidth / 2);
    const requestedCenter = livingFacadeWall
      ? (livingFacadeWall.p1[0] + livingFacadeWall.p2[0]) / 2
      : (livingOnly?.pos[0] ?? (box.minX + box.maxX) / 2);
    const centerX = Math.max(box.minX + half, Math.min(box.maxX - half, requestedCenter));
    const x1 = centerX - half, x2 = centerX + half, y1 = box.maxY, y2 = box.maxY + 0.9144;
    // Room-by-room slabs overlap the continuous host slab and render darker.
    // Keep only this exact balcony slab; mapToArchElements adds the host slab.
    data.slabs = [{ levelIndex: balcony.levelIndex, type: 'floor', boundary: [[x1,y1],[x2,y1],[x2,y2],[x1,y2],[x1,y1]] }];
    // Railings are rebuilt from the same three exposed slab edges, guaranteeing a match.
    data.railings = [
      { levelIndex: balcony.levelIndex, p1: [x1,y1], p2: [x1,y2] },
      { levelIndex: balcony.levelIndex, p1: [x1,y2], p2: [x2,y2] },
      { levelIndex: balcony.levelIndex, p1: [x2,y2], p2: [x2,y1] },
    ];
    const facadeWall = livingFacadeWall;
    if (facadeWall && accessRoomBounds) {
      data.doors = data.doors?.filter(d => distanceToSegment(d.pos, facadeWall) > 0.2);
      const segmentStart = Math.max(Math.min(facadeWall.p1[0], facadeWall.p2[0]), accessRoomBounds.left);
      const segmentEnd = Math.min(Math.max(facadeWall.p1[0], facadeWall.p2[0]), accessRoomBounds.right);
      const segmentLength = segmentEnd - segmentStart;
      const accessX = (segmentStart + segmentEnd) / 2;
      const accessY = (facadeWall.p1[1] + facadeWall.p2[1]) / 2;
      const existingFacadeWindow = data.windows?.find(window =>
        distanceToSegment(window.pos, facadeWall) < 0.2 &&
        Math.abs(window.pos[0] - accessX) <= segmentLength / 2 + (window.width || 0) / 2
      );
      const accessWidth = Math.max(0.8, Math.min(segmentLength * 0.7, segmentLength - 0.15));
      if (existingFacadeWindow) {
        if (existingFacadeWindow.type !== 'full-height') {
          existingFacadeWindow.type = 'full-height';
          existingFacadeWindow.pos = [accessX, accessY];
          existingFacadeWindow.width = Math.max(existingFacadeWindow.width || 0, accessWidth);
          existingFacadeWindow.rotation = 0;
        }
      } else {
        (data.windows ||= []).push({
          levelIndex: balcony.levelIndex,
          pos: [accessX, accessY], rotation: 0, type: 'full-height', width: accessWidth,
        });
      }
    }
  } else {
    // The continuous locally-derived host slab replaces overlapping room slabs.
    data.slabs = [];
  }

  // Every living room and bedroom receives at least one window on an eligible
  // entry/balcony facade. The full-height type marks the 6-inch balcony sill.
  const horizontalExteriorWalls = data.walls.filter(w => {
    if (Math.abs(w.p1[1] - w.p2[1]) >= 0.1) return false;
    const y = (w.p1[1] + w.p2[1]) / 2;
    return Math.abs(y - box.minY) < 0.35 || Math.abs(y - box.maxY) < 0.35;
  });
  type RoomExteriorSegment = { wall: NonNullable<GeneratedData['walls']>[number]; start: number; end: number; length: number; y: number };
  const roomExteriorSegments = (room: GeneratedRoom): RoomExteriorSegment[] => {
    const roomBox = roomBounds(room);
    return horizontalExteriorWalls.flatMap(wall => {
      const y = (wall.p1[1] + wall.p2[1]) / 2;
      const roomTouchesFacade = Math.abs(y - box.minY) < 0.35
        ? Math.abs(roomBox.bottom - box.minY) < 0.35
        : Math.abs(roomBox.top - box.maxY) < 0.35;
      if (!roomTouchesFacade) return [];
      const start = Math.max(Math.min(wall.p1[0], wall.p2[0]), roomBox.left);
      const end = Math.min(Math.max(wall.p1[0], wall.p2[0]), roomBox.right);
      return end - start >= 0.8 ? [{ wall, start, end, length: end - start, y }] : [];
    });
  };
  const ensureExteriorWindow = (room: NonNullable<GeneratedData['rooms']>[number]) => {
    const candidates = roomExteriorSegments(room).sort((a, b) =>
      (Math.abs(b.y - box.maxY) < 0.35 ? 1 : 0) - (Math.abs(a.y - box.maxY) < 0.35 ? 1 : 0) || b.length - a.length
    );
    const candidate = candidates[0];
    if (!candidate) return;
    const alreadyHasWindow = data.windows?.some(window => {
      if (distanceToSegment(window.pos, candidate.wall) >= 0.15) return false;
      const halfWidth = (window.width || 0.8) / 2;
      const overlap = Math.min(candidate.end, window.pos[0] + halfWidth) - Math.max(candidate.start, window.pos[0] - halfWidth);
      return overlap >= 0.15;
    });
    if (alreadyHasWindow) return;
    const x = (candidate.start + candidate.end) / 2;
    (data.windows ||= []).push({
      levelIndex: room.levelIndex,
      pos: [x, candidate.y], rotation: 0, type: 'standard',
      width: Math.min(1.5, candidate.length - 0.2),
    });
  };
  (data.rooms || []).filter(r => /living|bedroom/i.test(r.label)).forEach(ensureExteriorWindow);

  const roomArea = (r: NonNullable<GeneratedData['rooms']>[number]) => {
    const vertical = data.walls!.filter(w => Math.abs(w.p1[0] - w.p2[0]) < 0.1 && r.pos[1] >= Math.min(w.p1[1], w.p2[1]) - 0.2 && r.pos[1] <= Math.max(w.p1[1], w.p2[1]) + 0.2);
    const horizontal = data.walls!.filter(w => Math.abs(w.p1[1] - w.p2[1]) < 0.1 && r.pos[0] >= Math.min(w.p1[0], w.p2[0]) - 0.2 && r.pos[0] <= Math.max(w.p1[0], w.p2[0]) + 0.2);
    const left = Math.max(...vertical.map(w => w.p1[0]).filter(x => x < r.pos[0]), box.minX);
    const right = Math.min(...vertical.map(w => w.p1[0]).filter(x => x > r.pos[0]), box.maxX);
    const bottom = Math.max(...horizontal.map(w => w.p1[1]).filter(y => y < r.pos[1]), box.minY);
    const top = Math.min(...horizontal.map(w => w.p1[1]).filter(y => y > r.pos[1]), box.maxY);
    return Math.max(0, right - left) * Math.max(0, top - bottom);
  };
  const enforceLargestRole = (rooms: NonNullable<GeneratedData['rooms']>, role: RegExp) => {
    if (rooms.length < 2) return;
    const current = rooms.find(r => role.test(r.label));
    const largest = rooms.slice().sort((a, b) => roomArea(b) - roomArea(a))[0];
    if (current && largest !== current && roomArea(largest) > roomArea(current)) [current.label, largest.label] = [largest.label, current.label];
  };
  enforceLargestRole(data.rooms?.filter(r => /bedroom/i.test(r.label)) || [], /master/i);
  enforceLargestRole(data.rooms?.filter(r => /bath|powder/i.test(r.label)) || [], /ensuite|attached/i);

  // Read-only space-syntax audit. Existing safe repair functions above remain
  // the only mutation path; this audit never triggers retries or model calls.
  const auditStarted = performance.now();
  const graphRooms = (data.rooms || []).map((room, index) => ({ id: `room-${index}`, label: room.label }));
  const graphEdges: Array<{ a: string; b: string; access: 'door' | 'opening' | 'window' }> = [];
  for (let i = 0; i < (data.rooms || []).length; i++) {
    for (let j = i + 1; j < (data.rooms || []).length; j++) {
      const roomA = data.rooms![i];
      const roomB = data.rooms![j];
      if (circulationRoomsOverlap(roomA, roomB) || hasUnwalledSharedEdge(roomA, roomB)) {
        graphEdges.push({ a: `room-${i}`, b: `room-${j}`, access: 'opening' });
        continue;
      }
      const shared = findInterveningWall(roomA, roomB, true);
      if (!shared) continue;
      const door = data.doors?.find(item => distanceToSegment(item.pos, shared) < 0.12);
      const opening = data.openings?.find(item => distanceToSegment(item.pos, shared) < 0.12);
      const window = data.windows?.find(item => distanceToSegment(item.pos, shared) < 0.12);
      const access = door ? 'door' : opening ? 'opening' : window ? 'window' : undefined;
      if (access) graphEdges.push({ a: `room-${i}`, b: `room-${j}`, access });
    }
  }
  const entryIndex = directEntryRoom ? (data.rooms || []).indexOf(directEntryRoom) : -1;
  const graphIssues = auditText3AccessGraph(graphRooms, graphEdges, entryIndex >= 0 ? `room-${entryIndex}` : undefined);
  if (graphIssues.length) console.warn('[Text 3.0 spatial audit]', graphIssues);
  console.debug(`[Text 3.0] local spatial audit ${(performance.now() - auditStarted).toFixed(1)} ms`);
  return data;
};
