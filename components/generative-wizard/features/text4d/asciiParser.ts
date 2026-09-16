import type { GeneratedData } from '../../types';
import type { ExtractedZoningData } from '../../../../services/visionAsciiExtractor4d';

const FT_TO_M = 0.3048;
const TOLERANCE = 0.1;

function isClose(a: number, b: number) {
  return Math.abs(a - b) < TOLERANCE;
}

export function parseAsciiZoningToGeometry(zoningData: ExtractedZoningData): GeneratedData {
  const walls: { p1: number[], p2: number[], type: string }[] = [];
  const rooms: { label: string, pos: number[] }[] = [];
  const doors: { pos: number[], rotation: number, type: string, width: number }[] = [];
  const windows: { pos: number[], rotation: number, type: string, width: number }[] = [];

  // Calculate global scale factors from the 0-1000 bounding boxes
  let totalImgWidth = 0;
  let totalImgHeight = 0;
  let totalRealWidth = 0;
  let totalRealHeight = 0;

  for (const r of zoningData.rooms) {
    if (!r.box) continue; // safety fallback
    const [ymin, xmin, ymax, xmax] = r.box;
    totalImgWidth += (xmax - xmin);
    totalImgHeight += (ymax - ymin);
    totalRealWidth += (r.width_ft * FT_TO_M);
    totalRealHeight += (r.depth_ft * FT_TO_M);
  }

  const scaleX = totalImgWidth > 0 ? totalRealWidth / totalImgWidth : 0.01;
  const scaleY = totalImgHeight > 0 ? totalRealHeight / totalImgHeight : 0.01;

  const rects: any[] = [];
  let minGlobalX = Infinity;
  let minGlobalY = Infinity;

  // 1. Calculate raw metric positions
  for (const r of zoningData.rooms) {
    const w = r.width_ft * FT_TO_M;
    const h = r.depth_ft * FT_TO_M;

    let x = 0;
    let y = 0;

    if (r.box) {
      const [ymin, xmin] = r.box;
      x = xmin * scaleX;
      y = ymin * scaleY;
    }

    if (x < minGlobalX) minGlobalX = x;
    if (y < minGlobalY) minGlobalY = y;

    rects.push({ name: r.name, minX: x, minY: y, w, h });
  }

  // 2. Normalize to origin (0,0) and snap to grid
  const GRID = 0.5;
  const snap = (v: number) => Math.round(v / GRID) * GRID;

  const snappedRects = rects.map(r => {
    const normX = r.minX - minGlobalX;
    const normY = r.minY - minGlobalY;
    const snappedMinX = snap(normX);
    const snappedMinY = snap(normY);
    // Use actual dimensions snapped to grid
    const snappedMaxX = snappedMinX + snap(r.w);
    const snappedMaxY = snappedMinY + snap(r.h);

    rooms.push({
      label: r.name,
      pos: [snappedMinX + (snappedMaxX - snappedMinX) / 2, snappedMinY + (snappedMaxY - snappedMinY) / 2]
    });

    return {
      name: r.name,
      minX: snappedMinX,
      minY: snappedMinY,
      maxX: snappedMaxX,
      maxY: snappedMaxY
    };
  });

  const allLines: {p1: number[], p2: number[], rooms: string[]}[] = [];

  function addLine(x1: number, y1: number, x2: number, y2: number, roomName: string) {
    const pA = x1 < x2 || (x1 === x2 && y1 < y2) ? [x1, y1] : [x2, y2];
    const pB = pA[0] === x1 && pA[1] === y1 ? [x2, y2] : [x1, y1];

    let found = false;
    for (const l of allLines) {
      if (isClose(l.p1[0], pA[0]) && isClose(l.p1[1], pA[1]) &&
          isClose(l.p2[0], pB[0]) && isClose(l.p2[1], pB[1])) {
        if (!l.rooms.includes(roomName)) l.rooms.push(roomName);
        found = true;
        break;
      }
    }
    if (!found) {
      allLines.push({ p1: pA, p2: pB, rooms: [roomName] });
    }
  }

  for (const r of snappedRects) {
    addLine(r.minX, r.minY, r.maxX, r.minY, r.name); // Top
    addLine(r.maxX, r.minY, r.maxX, r.maxY, r.name); // Right
    addLine(r.maxX, r.maxY, r.minX, r.maxY, r.name); // Bottom
    addLine(r.minX, r.maxY, r.minX, r.minY, r.name); // Left
  }

  const exteriorLines = [];
  const interiorLines = [];

  for (const l of allLines) {
    if (l.rooms.length > 1) {
      walls.push({ p1: l.p1, p2: l.p2, type: 'partition' });
      interiorLines.push(l);

      // Spawn door on every interior wall partition for connectivity
      const cx = (l.p1[0] + l.p2[0]) / 2;
      const cy = (l.p1[1] + l.p2[1]) / 2;
      const isHorizontal = Math.abs(l.p1[1] - l.p2[1]) < TOLERANCE;
      doors.push({
        pos: [cx, cy],
        rotation: isHorizontal ? 0 : 90,
        type: 'single',
        width: 0.9
      });
    } else {
      walls.push({ p1: l.p1, p2: l.p2, type: 'exterior' });
      exteriorLines.push(l);
    }
  }

  // Basic Window Placement
  for (const ext of exteriorLines) {
    const isHorizontal = Math.abs(ext.p1[1] - ext.p2[1]) < TOLERANCE;
    const length = Math.sqrt(Math.pow(ext.p2[0]-ext.p1[0], 2) + Math.pow(ext.p2[1]-ext.p1[1], 2));

    // Only place windows on longer exterior walls
    if (length > 2) {
      const cx = (ext.p1[0] + ext.p2[0]) / 2;
      const cy = (ext.p1[1] + ext.p2[1]) / 2;
      windows.push({
        pos: [cx, cy],
        rotation: isHorizontal ? 0 : 90,
        type: 'fixed',
        width: 1.2
      });
    }
  }

  return { walls, rooms, doors, windows };
}
