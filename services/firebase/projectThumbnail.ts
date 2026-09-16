import type { ArchElement, Point, Project } from '../../types';

// Draws the thumbnail from project geometry (not a screenshot), so it's deterministic and independent of pan/zoom.

const WIDTH = 480;
const HEIGHT = 300;
const PADDING = 24;

const elementPoints = (el: ArchElement): Point[] => {
  const points: Point[] = [];
  for (const key of ['p1', 'p2', 'p3', 'p4'] as const) {
    const p = el[key];
    if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) points.push(p);
  }
  if (Array.isArray(el.boundary)) points.push(...el.boundary.filter(p => Number.isFinite(p?.x) && Number.isFinite(p?.y)));
  if (el.pos && Number.isFinite(el.pos.x) && Number.isFinite(el.pos.y) && el.type !== 'elevation-marker') points.push(el.pos);
  return points;
};

export const renderProjectThumbnail = (project: Project): string | null => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const levelId = project.levels?.[0]?.id;
  const elements = (project.elements || []).filter(el => !el.levelId || !levelId || el.levelId === levelId);
  const allPoints = elements.flatMap(elementPoints);
  if (allPoints.length === 0) return canvas.toDataURL('image/jpeg', 0.8);

  const xs = allPoints.map(p => p.x);
  const ys = allPoints.map(p => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min((WIDTH - PADDING * 2) / Math.max(maxX - minX, 1e-6), (HEIGHT - PADDING * 2) / Math.max(maxY - minY, 1e-6));
  const offsetX = (WIDTH - (maxX - minX) * scale) / 2;
  const offsetY = (HEIGHT - (maxY - minY) * scale) / 2;
  const tx = (p: Point) => [offsetX + (p.x - minX) * scale, offsetY + (p.y - minY) * scale] as const;

  // Room / floor fills first
  ctx.fillStyle = '#e2e8f0';
  for (const el of elements) {
    if (!Array.isArray(el.boundary) || el.boundary.length < 3) continue;
    ctx.beginPath();
    el.boundary.forEach((p, i) => (i === 0 ? ctx.moveTo(...tx(p)) : ctx.lineTo(...tx(p))));
    ctx.closePath();
    ctx.fill();
  }

  ctx.lineCap = 'round';
  for (const el of elements) {
    if (!el.p1 || !el.p2) continue;
    const isWall = el.type === 'wall';
    ctx.strokeStyle = isWall ? '#0f172a' : '#94a3b8';
    ctx.lineWidth = isWall ? Math.max(1.5, Math.min(6, (el.thickness || 0.2) * scale)) : 1;
    ctx.beginPath();
    ctx.moveTo(...tx(el.p1));
    ctx.lineTo(...tx(el.p2));
    ctx.stroke();
  }

  ctx.fillStyle = '#64748b';
  for (const el of elements) {
    if (!el.pos || el.p1 || el.type === 'elevation-marker') continue;
    const [x, y] = tx(el.pos);
    const w = Math.max(2, Math.min(24, (el.width || 0.5) * scale));
    const d = Math.max(2, Math.min(24, (el.depth || el.width || 0.5) * scale));
    ctx.fillRect(x - w / 2, y - d / 2, w, d);
  }

  return canvas.toDataURL('image/jpeg', 0.8);
};
