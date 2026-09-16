import { ArchElement, Point } from '../../types';
import { WALL_HEIGHT_DEFAULT, WALL_OPENING_HEIGHT_DEFAULT, DOOR_HEIGHT_DEFAULT, WINDOW_SILL_HEIGHT_DEFAULT, WINDOW_TOP_HEIGHT_DEFAULT } from '../../constants';
import { AutoPlanImportPayload, AutoPlanOpening, AutoPlanWallSegment } from './autoPlanTypes';
import { validateAutoPlanPayload } from './autoPlanValidation';

const pointOnWall = (wall: AutoPlanWallSegment, t: number): Point => ({
  x: wall.start.x + (wall.end.x - wall.start.x) * t,
  y: wall.start.y + (wall.end.y - wall.start.y) * t,
});

const wallRotation = (wall: AutoPlanWallSegment): number =>
  Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) * 180 / Math.PI;

const openingSubtype = (opening: AutoPlanOpening): string => {
  if (opening.type === 'wall_opening') return 'open';
  if (opening.type === 'window') return opening.metadata?.subType || 'standard';
  return opening.metadata?.subType || (opening.width >= 1.2 ? 'double' : 'single');
};

export const autoPlanPayloadToArchElements = (
  payload: AutoPlanImportPayload,
  levelId = '0',
): { elements: ArchElement[]; warnings: string[] } => {
  const warnings = validateAutoPlanPayload(payload);
  const wallsById = new Map(payload.walls.map(wall => [wall.id, wall]));
  const batchId = `auto-plan-${Date.now()}`;
  const commonMetadata = {
    autoPlanBatchId: batchId,
    autoPlanGenerator: payload.metadata.generator,
    autoPlanModel: payload.metadata.model,
    autoPlanModelWeightsPath: payload.metadata.modelWeightsPath,
    autoPlanPrototypePath: payload.metadata.sourcePrototypePath,
  };

  const walls: ArchElement[] = payload.walls.map(wall => ({
    id: wall.id,
    type: 'wall',
    levelId,
    p1: wall.start,
    p2: wall.end,
    thickness: wall.thickness,
    height: WALL_HEIGHT_DEFAULT,
    wallSource: 'line',
    metadata: {
      ...commonMetadata,
      autoPlanSource: wall.source,
      autoPlanWallType: wall.wallType,
      ...(wall.metadata || {}),
    },
  }));

  const rooms: ArchElement[] = (payload.rooms || []).map(room => ({
    id: room.id,
    type: 'room',
    levelId,
    boundary: room.boundary,
    pos: room.boundary.length
      ? {
          x: room.boundary.reduce((sum, point) => sum + point.x, 0) / room.boundary.length,
          y: room.boundary.reduce((sum, point) => sum + point.y, 0) / room.boundary.length,
        }
      : undefined,
    label: room.label,
    metadata: {
      ...commonMetadata,
      autoPlanSource: room.source,
      autoPlanRoomType: room.type,
      autoPlanModelTypeId: room.modelTypeId,
      ...(room.metadata || {}),
    },
  }));

  const openings: ArchElement[] = payload.openings.flatMap((opening): ArchElement[] => {
    const host = wallsById.get(opening.hostWallId);
    if (!host) return [];
    const pos = pointOnWall(host, opening.position);
    const base = {
      id: opening.id,
      levelId,
      hostWallId: opening.hostWallId,
      hostT: opening.position,
      pos,
      width: opening.width,
      rotation: wallRotation(host),
      subType: openingSubtype(opening),
      metadata: {
        ...commonMetadata,
        autoPlanSource: opening.source,
        autoPlanOpeningType: opening.type,
        ...(opening.metadata || {}),
      },
    };

    if (opening.type === 'door') {
      return [{
        ...base,
        type: 'door' as const,
        height: opening.height || DOOR_HEIGHT_DEFAULT,
      }];
    }

    if (opening.type === 'window') {
      const sillHeight = opening.sillHeight ?? WINDOW_SILL_HEIGHT_DEFAULT;
      const height = opening.height ?? Math.max(0.4, WINDOW_TOP_HEIGHT_DEFAULT - sillHeight);
      return [{
        ...base,
        type: 'window' as const,
        height,
        sillHeight,
        topHeight: sillHeight + height,
      }];
    }

    return [{
      ...base,
      type: 'wall-opening' as const,
      height: opening.height || WALL_OPENING_HEIGHT_DEFAULT,
    }];
  });

  const boundaryFloor: ArchElement = {
    id: `${batchId}-boundary-floor`,
    type: 'floor',
    levelId,
    boundary: payload.boundary.points,
    metadata: {
      ...commonMetadata,
      autoPlanBoundary: true,
      autoPlanBoundaryType: payload.boundary.type,
    },
  };

  return {
    elements: [boundaryFloor, ...rooms, ...walls, ...openings],
    warnings,
  };
};
