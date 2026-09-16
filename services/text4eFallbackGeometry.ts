import type { Point } from '../types';
import type { GeneratedData } from '../components/generative-wizard/types';
import type { ConfirmedText4eBrief } from './text4eBrief';

interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface RoomLeaf {
  label: string;
  box: Box;
}

const meters = (value: number, unit: 'ft' | 'm'): number => unit === 'ft' ? value * 0.3048 : value;

const boundaryBox = (brief: ConfirmedText4eBrief, requestedBoundary?: Point[]): Box => {
  if (requestedBoundary && requestedBoundary.length >= 3) {
    const xs = requestedBoundary.map(point => point.x);
    const ys = requestedBoundary.map(point => point.y);
    const box = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
    if (box.maxX > box.minX && box.maxY > box.minY) return box;
  }
  const width = Math.max(3, meters(brief.dimensions.envelope.width, brief.dimensions.envelope.unit));
  const depth = Math.max(3, meters(brief.dimensions.envelope.depth, brief.dimensions.envelope.unit));
  return { minX: 0, minY: 0, maxX: width, maxY: depth };
};

const expandedRoomLabels = (brief: ConfirmedText4eBrief): string[] => brief.rooms.flatMap(room =>
  Array.from({ length: Math.max(1, room.count) }, (_, index) =>
    room.count > 1 ? `${room.name} ${index + 1}` : room.name
  )
);

/**
 * Deterministic, no-model safety geometry. This is used only if a valid source
 * image was returned but browser-local raster extraction could not recover a
 * wall network. A recursive guillotine partition guarantees a closed envelope,
 * one region per requested room, and a connected door tree.
 */
export const buildText4eFallbackGeometry = (
  brief: ConfirmedText4eBrief,
  requestedBoundary?: Point[],
  extractionError?: unknown,
): GeneratedData => {
  const outer = boundaryBox(brief, requestedBoundary);
  const labels = expandedRoomLabels(brief);
  const walls: NonNullable<GeneratedData['walls']> = [
    { levelIndex: 0, p1: [outer.minX, outer.minY], p2: [outer.maxX, outer.minY], type: 'exterior' },
    { levelIndex: 0, p1: [outer.maxX, outer.minY], p2: [outer.maxX, outer.maxY], type: 'exterior' },
    { levelIndex: 0, p1: [outer.maxX, outer.maxY], p2: [outer.minX, outer.maxY], type: 'exterior' },
    { levelIndex: 0, p1: [outer.minX, outer.maxY], p2: [outer.minX, outer.minY], type: 'exterior' },
  ];
  const doors: NonNullable<GeneratedData['doors']> = [];
  const leaves: RoomLeaf[] = [];

  const partition = (roomLabels: string[], box: Box, depth: number) => {
    if (roomLabels.length <= 1) {
      leaves.push({ label: roomLabels[0] || 'Living Room', box });
      return;
    }
    const firstCount = Math.ceil(roomLabels.length / 2);
    const fraction = firstCount / roomLabels.length;
    const boxWidth = box.maxX - box.minX;
    const boxDepth = box.maxY - box.minY;
    const splitVertically = boxWidth / Math.max(0.1, boxDepth) >= 0.9;
    if (splitVertically) {
      const splitX = box.minX + boxWidth * fraction;
      walls.push({ levelIndex: 0, p1: [splitX, box.minY], p2: [splitX, box.maxY], type: 'interior' });
      doors.push({
        levelIndex: 0,
        pos: [splitX, box.minY + boxDepth * (depth % 2 ? 0.62 : 0.38)],
        rotation: 90,
        width: Math.min(0.9, Math.max(0.7, boxDepth * 0.22)),
        type: 'single',
      });
      partition(roomLabels.slice(0, firstCount), { ...box, maxX: splitX }, depth + 1);
      partition(roomLabels.slice(firstCount), { ...box, minX: splitX }, depth + 1);
    } else {
      const splitY = box.minY + boxDepth * fraction;
      walls.push({ levelIndex: 0, p1: [box.minX, splitY], p2: [box.maxX, splitY], type: 'interior' });
      doors.push({
        levelIndex: 0,
        pos: [box.minX + boxWidth * (depth % 2 ? 0.62 : 0.38), splitY],
        rotation: 0,
        width: Math.min(0.9, Math.max(0.7, boxWidth * 0.22)),
        type: 'single',
      });
      partition(roomLabels.slice(0, firstCount), { ...box, maxY: splitY }, depth + 1);
      partition(roomLabels.slice(firstCount), { ...box, minY: splitY }, depth + 1);
    }
  };
  partition(labels.length ? labels : ['Living Room'], outer, 0);

  const rooms: NonNullable<GeneratedData['rooms']> = leaves.map(leaf => ({
    levelIndex: 0,
    label: leaf.label,
    pos: [(leaf.box.minX + leaf.box.maxX) / 2, (leaf.box.minY + leaf.box.maxY) / 2],
  }));
  const bottomLeaves = leaves.filter(leaf => Math.abs(leaf.box.minY - outer.minY) < 0.001);
  const entryLeaf = bottomLeaves.find(leaf => /foyer|entry|living|lounge|reception/i.test(leaf.label)) || bottomLeaves[0] || leaves[0];
  if (entryLeaf) {
    doors.push({
      levelIndex: 0,
      pos: [(entryLeaf.box.minX + entryLeaf.box.maxX) / 2, outer.minY],
      rotation: 0,
      width: Math.min(1.2, Math.max(0.9, (entryLeaf.box.maxX - entryLeaf.box.minX) * 0.25)),
      type: 'single',
      mandatoryExteriorEntry: true,
    });
  }

  const windows: NonNullable<GeneratedData['windows']> = [];
  for (const leaf of leaves.filter(item => /living|lounge|bedroom|office|kitchen|dining/i.test(item.label))) {
    const leafWidth = leaf.box.maxX - leaf.box.minX;
    const leafDepth = leaf.box.maxY - leaf.box.minY;
    if (Math.abs(leaf.box.maxY - outer.maxY) < 0.001) {
      windows.push({ levelIndex: 0, pos: [(leaf.box.minX + leaf.box.maxX) / 2, outer.maxY], rotation: 0, width: Math.min(1.5, leafWidth * 0.45), type: 'standard' });
    } else if (Math.abs(leaf.box.minX - outer.minX) < 0.001) {
      windows.push({ levelIndex: 0, pos: [outer.minX, (leaf.box.minY + leaf.box.maxY) / 2], rotation: 90, width: Math.min(1.5, leafDepth * 0.45), type: 'standard' });
    } else if (Math.abs(leaf.box.maxX - outer.maxX) < 0.001) {
      windows.push({ levelIndex: 0, pos: [outer.maxX, (leaf.box.minY + leaf.box.maxY) / 2], rotation: 90, width: Math.min(1.5, leafDepth * 0.45), type: 'standard' });
    }
  }

  const reason = extractionError instanceof Error ? extractionError.message : String(extractionError || 'unknown raster topology');
  return {
    boundary: [
      [outer.minX, outer.minY],
      [outer.maxX, outer.minY],
      [outer.maxX, outer.maxY],
      [outer.minX, outer.maxY],
      [outer.minX, outer.minY],
    ],
    walls,
    doors,
    windows,
    openings: [],
    rooms,
    columns: [],
    stairs: [],
    slabs: [],
    railings: [],
    furniture: [],
    fixtures: [],
    extractionDiagnostics: {
      confidence: 'low',
      canImport: true,
      scaleSource: requestedBoundary?.length ? 'requested-boundary' : 'default',
      warnings: [`The generated image was preserved using deterministic fallback geometry because local tracing reported: ${reason}`],
      detectedRoomLabels: 0,
      requestedRoomLabels: labels.length,
    },
  };
};
