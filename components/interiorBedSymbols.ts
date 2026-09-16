import { getCanonicalInteriorPreset, normalizeInteriorSubType } from '../constants';

export interface InteriorSymbolBase {
  width?: number;
  depth?: number;
  leftArmDepth?: number;
  rightArmDepth?: number;
  lockScale?: boolean;
}

const normalize = (subType: string) => normalizeInteriorSubType(subType).toLowerCase();
const has = (subType: string, token: string) => subType.includes(token);

const line = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) => {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
};

const roundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius = 0,
) => {
  const r = Math.max(0, Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2));
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, width, height, r);
  } else {
    ctx.rect(x, y, width, height);
  }
  ctx.fill();
  ctx.stroke();
};

const rect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) => {
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);
};

const circle = (ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) => {
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
};

const ellipse = (ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number) => {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
};

const arc = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  start: number,
  end: number,
) => {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, start, end);
  ctx.stroke();
};

const pathFillStroke = (ctx: CanvasRenderingContext2D, draw: () => void) => {
  ctx.beginPath();
  draw();
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
};

const drawPillow = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
  roundedRect(ctx, x, y, w, h, Math.min(w, h) * 0.16);
};

const drawStandardBed = (ctx: CanvasRenderingContext2D, w: number, d: number, pillows: 1 | 2) => {
  const left = -w / 2;
  const top = -d / 2;
  roundedRect(ctx, left, top, w, d, Math.min(w, d) * 0.02);
  rect(ctx, left, top, w, d * 0.30);
  const gap = w * 0.04;
  const pillowW = pillows === 1 ? w * 0.46 : (w - gap * 3) / 2;
  const pillowY = top + d * 0.06;
  if (pillows === 1) {
    drawPillow(ctx, -pillowW / 2, pillowY, pillowW, d * 0.16);
  } else {
    drawPillow(ctx, left + gap, pillowY, pillowW, d * 0.16);
    drawPillow(ctx, left + gap * 2 + pillowW, pillowY, pillowW, d * 0.16);
  }
  arc(ctx, left + w * 0.08, top + d * 0.35, w * 0.38, d * 0.15, -Math.PI / 2, 0);
  arc(ctx, left + w * 0.92, top + d * 0.35, w * 0.38, d * 0.15, Math.PI, Math.PI * 1.5);
};

const drawTwinPair = (ctx: CanvasRenderingContext2D, w: number, d: number) => {
  const bedW = w * 0.42;
  const gap = w * 0.16;
  ctx.save();
  ctx.translate(-(bedW + gap) / 2, 0);
  drawStandardBed(ctx, bedW, d, 1);
  ctx.restore();
  ctx.save();
  ctx.translate((bedW + gap) / 2, 0);
  drawStandardBed(ctx, bedW, d, 1);
  ctx.restore();
};

const drawBunkOrLoft = (ctx: CanvasRenderingContext2D, w: number, d: number, loft = false) => {
  drawStandardBed(ctx, w, d, 1);
  for (let i = 0; i < 5; i += 1) {
    const y = -d * 0.18 + i * d * 0.08;
    line(ctx, w * 0.36, y, w * 0.50, y);
  }
  if (loft) {
    rect(ctx, -w * 0.20, d * 0.20, w * 0.40, d * 0.18);
  } else {
    rect(ctx, -w * 0.48, d * 0.42, w * 0.96, d * 0.06);
  }
};

const drawSofa = (ctx: CanvasRenderingContext2D, w: number, d: number, seats = 1) => {
  const armW = Math.min(w * 0.16, d * 0.20);
  const backD = d * 0.18;
  roundedRect(ctx, -w * 0.44, -d * 0.34, w * 0.88, d * 0.70, d * 0.06);
  rect(ctx, -w * 0.42, -d * 0.48, w * 0.84, backD);
  roundedRect(ctx, -w * 0.50, -d * 0.38, armW, d * 0.70, armW * 0.45);
  roundedRect(ctx, w * 0.50 - armW, -d * 0.38, armW, d * 0.70, armW * 0.45);
  const insideL = -w * 0.50 + armW;
  const insideR = w * 0.50 - armW;
  const seatW = (insideR - insideL) / seats;
  for (let i = 1; i < seats; i += 1) {
    const x = insideL + seatW * i;
    line(ctx, x, -d * 0.30, x, d * 0.34);
  }
  line(ctx, insideL, -d * 0.18, insideR, -d * 0.18);
};

const drawCurvedSofa = (ctx: CanvasRenderingContext2D, w: number, d: number, variant: 'round' | 'kidney' | 'arc') => {
  if (variant === 'round') {
    roundedRect(ctx, -w * 0.42, -d * 0.24, w * 0.84, d * 0.52, d * 0.24);
    roundedRect(ctx, -w * 0.36, -d * 0.16, w * 0.72, d * 0.36, d * 0.15);
    line(ctx, 0, -d * 0.18, 0, d * 0.20);
    return;
  }
  pathFillStroke(ctx, () => {
    ctx.moveTo(-w * 0.48, d * 0.16);
    ctx.bezierCurveTo(-w * 0.38, -d * 0.48, w * 0.34, -d * 0.50, w * 0.48, d * 0.12);
    ctx.bezierCurveTo(w * 0.18, d * 0.34, -w * 0.20, d * 0.34, -w * 0.48, d * 0.16);
  });
  arc(ctx, 0, d * 0.04, w * 0.38, d * 0.28, Math.PI * 1.05, Math.PI * 1.92);
  if (variant === 'kidney') {
    line(ctx, w * 0.10, -d * 0.34, w * 0.10, -d * 0.22);
    line(ctx, w * 0.28, -d * 0.24, w * 0.31, -d * 0.12);
  }
};

const drawChair = (ctx: CanvasRenderingContext2D, w: number, d: number, variant: string) => {
  if (variant === 'office') {
    roundedRect(ctx, -w * 0.28, -d * 0.22, w * 0.56, d * 0.48, d * 0.10);
    roundedRect(ctx, -w * 0.34, -d * 0.02, w * 0.08, d * 0.30, d * 0.03);
    roundedRect(ctx, w * 0.26, -d * 0.02, w * 0.08, d * 0.30, d * 0.03);
    roundedRect(ctx, -w * 0.34, -d * 0.48, w * 0.68, d * 0.08, d * 0.04);
    line(ctx, 0, -d * 0.40, 0, -d * 0.22);
    return;
  }
  if (variant === 'accent') {
    arc(ctx, 0, -d * 0.04, w * 0.42, d * 0.48, Math.PI, Math.PI * 2);
    arc(ctx, 0, -d * 0.02, w * 0.32, d * 0.34, Math.PI, Math.PI * 2);
    roundedRect(ctx, -w * 0.34, d * 0.05, w * 0.68, d * 0.28, d * 0.08);
    roundedRect(ctx, -w * 0.44, -d * 0.06, w * 0.10, d * 0.48, d * 0.04);
    roundedRect(ctx, w * 0.34, -d * 0.06, w * 0.10, d * 0.48, d * 0.04);
    return;
  }
  if (variant === 'modern') {
    roundedRect(ctx, -w * 0.32, -d * 0.30, w * 0.64, d * 0.56, d * 0.09);
    roundedRect(ctx, -w * 0.46, -d * 0.16, w * 0.10, d * 0.38, d * 0.04);
    roundedRect(ctx, w * 0.36, -d * 0.16, w * 0.10, d * 0.38, d * 0.04);
    roundedRect(ctx, -w * 0.30, -d * 0.42, w * 0.60, d * 0.08, d * 0.04);
    return;
  }
  if (variant === 'platner') {
    circle(ctx, 0, 0, Math.min(w, d) * 0.42);
    circle(ctx, 0, 0, Math.min(w, d) * 0.28);
    for (let i = 0; i < 36; i += 1) {
      const a = (Math.PI * 2 * i) / 36;
      line(ctx, Math.cos(a) * w * 0.30, Math.sin(a) * d * 0.30, Math.cos(a) * w * 0.42, Math.sin(a) * d * 0.42);
    }
    return;
  }
  if (variant === 'z') {
    rect(ctx, -w * 0.24, -d * 0.36, w * 0.48, d * 0.72);
    roundedRect(ctx, -w * 0.34, -d * 0.48, w * 0.68, d * 0.07, d * 0.02);
    roundedRect(ctx, -w * 0.34, d * 0.42, w * 0.68, d * 0.07, d * 0.02);
    roundedRect(ctx, -w * 0.48, -d * 0.16, w * 0.08, d * 0.32, d * 0.02);
    roundedRect(ctx, w * 0.40, -d * 0.16, w * 0.08, d * 0.32, d * 0.02);
    return;
  }
  roundedRect(ctx, -w * 0.34, -d * 0.28, w * 0.68, d * 0.56, d * 0.08);
  roundedRect(ctx, -w * 0.42, -d * 0.02, w * 0.10, d * 0.36, d * 0.03);
  roundedRect(ctx, w * 0.32, -d * 0.02, w * 0.10, d * 0.36, d * 0.03);
};

const drawOttoman = (ctx: CanvasRenderingContext2D, w: number, d: number, variant: string) => {
  if (variant === 'puff') {
    circle(ctx, 0, 0, Math.min(w, d) * 0.42);
    for (let i = 0; i < 8; i += 1) {
      const a = (Math.PI * 2 * i) / 8;
      line(ctx, 0, 0, Math.cos(a) * w * 0.42, Math.sin(a) * d * 0.42);
    }
    circle(ctx, 0, 0, Math.min(w, d) * 0.05);
    return;
  }
  roundedRect(ctx, -w * 0.44, -d * 0.38, w * 0.88, d * 0.76, d * 0.08);
  if (variant === 'tufted') {
    for (let i = -2; i <= 2; i += 1) line(ctx, -w * 0.44, i * d * 0.18, w * 0.44, (i + 2) * d * 0.18);
    for (let i = -2; i <= 2; i += 1) line(ctx, -w * 0.44, i * d * 0.18, w * 0.44, (i - 2) * d * 0.18);
    for (let x = -1; x <= 1; x += 1) for (let y = -1; y <= 1; y += 1) circle(ctx, x * w * 0.20, y * d * 0.18, Math.min(w, d) * 0.025);
  } else {
    circle(ctx, 0, 0, Math.min(w, d) * 0.035);
  }
};

const drawTable = (ctx: CanvasRenderingContext2D, w: number, d: number, seats = 0, round = false) => {
  if (round) circle(ctx, 0, 0, Math.min(w, d) * 0.34);
  else roundedRect(ctx, -w * 0.34, -d * 0.28, w * 0.68, d * 0.56, Math.min(w, d) * 0.03);
  if (!seats) return;
  const chairW = Math.min(w, d) * 0.16;
  const chairD = Math.min(w, d) * 0.20;
  const positions = seats === 4
    ? [[0, -d * 0.44, 0], [0, d * 0.44, 0], [-w * 0.44, 0, 1], [w * 0.44, 0, 1]]
    : Array.from({ length: seats }, (_, i) => {
      const topCount = Math.ceil(seats / 2);
      const isTop = i < topCount;
      const rowIndex = isTop ? i : i - topCount;
      const count = isTop ? topCount : seats - topCount;
      const x = count === 1 ? 0 : -w * 0.28 + (w * 0.56 * rowIndex) / (count - 1);
      return [x, isTop ? -d * 0.44 : d * 0.44, 0];
    });
  positions.forEach(([x, y, side]) => {
    roundedRect(ctx, x - (side ? chairD : chairW) / 2, y - (side ? chairW : chairD) / 2, side ? chairD : chairW, side ? chairW : chairD, chairW * 0.25);
  });
};

const drawStorage = (ctx: CanvasRenderingContext2D, w: number, d: number, kind = '') => {
  roundedRect(ctx, -w * 0.46, -d * 0.32, w * 0.92, d * 0.64, Math.min(w, d) * 0.02);
  rect(ctx, -w * 0.46, -d * 0.42, w * 0.92, d * 0.08);
  if (kind.includes('wardrobe')) {
    line(ctx, -w * 0.15, -d * 0.32, -w * 0.15, d * 0.32);
    line(ctx, w * 0.15, -d * 0.32, w * 0.15, d * 0.32);
  } else if (kind.includes('shelf')) {
    line(ctx, -w * 0.40, 0, w * 0.40, 0);
  } else if (kind.includes('whiteboard')) {
    rect(ctx, -w * 0.48, -d * 0.08, w * 0.96, d * 0.16);
  }
};

const drawCounter = (ctx: CanvasRenderingContext2D, w: number, d: number, lShape = false) => {
  if (lShape) {
    rect(ctx, -w * 0.48, -d * 0.48, w * 0.92, d * 0.20);
    rect(ctx, w * 0.22, -d * 0.48, w * 0.22, d * 0.92);
    return;
  }
  rect(ctx, -w * 0.46, -d * 0.28, w * 0.92, d * 0.56);
  line(ctx, -w * 0.46, -d * 0.20, w * 0.46, -d * 0.20);
};

const drawSink = (ctx: CanvasRenderingContext2D, w: number, d: number, double = false) => {
  rect(ctx, -w * 0.46, -d * 0.36, w * 0.92, d * 0.72);
  const bowlW = double ? w * 0.36 : w * 0.62;
  const bowls = double ? [-w * 0.22, w * 0.22] : [0];
  bowls.forEach((x) => roundedRect(ctx, x - bowlW / 2, -d * 0.22, bowlW, d * 0.44, d * 0.04));
  bowls.forEach((x) => circle(ctx, x, 0, Math.min(w, d) * 0.035));
  roundedRect(ctx, -w * 0.05, -d * 0.34, w * 0.10, d * 0.06, d * 0.02);
};

const drawCooktop = (ctx: CanvasRenderingContext2D, w: number, d: number, burners = 4) => {
  rect(ctx, -w * 0.42, -d * 0.42, w * 0.84, d * 0.84);
  const xs = burners === 2 ? [0] : [-w * 0.18, w * 0.18];
  const ys = burners === 2 ? [-d * 0.18, d * 0.18] : [-d * 0.18, d * 0.18];
  xs.forEach((x) => ys.forEach((y) => circle(ctx, x, y, Math.min(w, d) * 0.12)));
  for (let i = 0; i < Math.min(4, burners); i += 1) circle(ctx, -w * 0.24 + i * w * 0.16, d * 0.34, Math.min(w, d) * 0.035);
};

const drawAppliance = (ctx: CanvasRenderingContext2D, w: number, d: number, kind: string) => {
  rect(ctx, -w * 0.36, -d * 0.42, w * 0.72, d * 0.84);
  if (kind === 'washer') circle(ctx, 0, d * 0.08, Math.min(w, d) * 0.22);
  if (kind === 'fridge') {
    rect(ctx, -w * 0.34, -d * 0.48, w * 0.68, d * 0.06);
    roundedRect(ctx, w * 0.36, -d * 0.08, w * 0.08, d * 0.34, d * 0.02);
  }
};

const drawBathroom = (ctx: CanvasRenderingContext2D, w: number, d: number, subType: string) => {
  if (has(subType, 'wc')) {
    roundedRect(ctx, -w * 0.32, -d * 0.46, w * 0.64, d * 0.22, d * 0.04);
    ellipse(ctx, 0, d * 0.08, w * 0.30, d * 0.34);
    ellipse(ctx, 0, d * 0.08, w * 0.22, d * 0.25);
    return;
  }
  if (has(subType, 'corner_basin') || has(subType, 'corner_bath')) {
    pathFillStroke(ctx, () => {
      ctx.moveTo(-w * 0.42, -d * 0.42);
      ctx.lineTo(w * 0.42, -d * 0.42);
      ctx.quadraticCurveTo(w * 0.42, d * 0.42, -w * 0.42, d * 0.42);
    });
    circle(ctx, -w * 0.10, d * 0.06, Math.min(w, d) * 0.035);
    return;
  }
  if (has(subType, 'basin') || has(subType, 'vanity')) {
    rect(ctx, -w * 0.44, -d * 0.34, w * 0.88, d * 0.68);
    roundedRect(ctx, -w * 0.28, -d * 0.16, w * 0.56, d * 0.32, d * 0.04);
    circle(ctx, 0, 0, Math.min(w, d) * 0.04);
    return;
  }
  if (has(subType, 'shower')) {
    rect(ctx, -w * 0.42, -d * 0.42, w * 0.84, d * 0.84);
    rect(ctx, -w * 0.36, -d * 0.36, w * 0.72, d * 0.72);
    circle(ctx, 0, -d * 0.25, Math.min(w, d) * 0.06);
    return;
  }
  if (has(subType, 'bath')) {
    rect(ctx, -w * 0.46, -d * 0.30, w * 0.92, d * 0.60);
    roundedRect(ctx, -w * 0.38, -d * 0.22, w * 0.76, d * 0.44, d * 0.18);
    circle(ctx, 0, 0, Math.min(w, d) * 0.035);
  }
};

export const hasInteriorBedSymbol = (subType: string): boolean => {
  const normalized = normalize(subType);
  return Boolean(getCanonicalInteriorPreset(normalized)) || [
    'bed', 'chair', 'sofa', 'table', 'desk', 'counter', 'sink', 'stove', 'hob', 'fridge', 'washer',
    'wc', 'basin', 'shower', 'bath', 'wardrobe', 'shelf', 'cabinet', 'console', 'credenza', 'whiteboard',
  ].some((token) => normalized.includes(token));
};

export const drawInteriorBedSymbol = (
  ctx: CanvasRenderingContext2D,
  w: number,
  d: number,
  subType: string,
  _renderScale = 1,
  _symbolBase?: InteriorSymbolBase,
) => {
  const normalized = normalize(subType);
  if (!hasInteriorBedSymbol(normalized)) return false;

  if (has(normalized, 'bed_twin_pair')) drawTwinPair(ctx, w, d);
  else if (has(normalized, 'bed_bunk')) drawBunkOrLoft(ctx, w, d);
  else if (has(normalized, 'bed_loft')) drawBunkOrLoft(ctx, w, d, true);
  else if (has(normalized, 'bed')) drawStandardBed(ctx, w, d, has(normalized, 'single') || has(normalized, 'day') || has(normalized, 'hospital') ? 1 : 2);
  else if (has(normalized, 'sofa_round_edge')) drawCurvedSofa(ctx, w, d, 'round');
  else if (has(normalized, 'sofa_kidney')) drawCurvedSofa(ctx, w, d, 'kidney');
  else if (has(normalized, 'sofa_curved')) drawCurvedSofa(ctx, w, d, 'arc');
  else if (has(normalized, 'sofa')) drawSofa(ctx, w, d, w > 1.8 ? 3 : w > 1.1 ? 2 : 1);
  else if (has(normalized, 'office_chair')) drawChair(ctx, w, d, 'office');
  else if (has(normalized, 'chair_accent')) drawChair(ctx, w, d, 'accent');
  else if (has(normalized, 'chair_modern')) drawChair(ctx, w, d, 'modern');
  else if (has(normalized, 'chair_platner')) drawChair(ctx, w, d, 'platner');
  else if (has(normalized, 'chair_z')) drawChair(ctx, w, d, 'z');
  else if (has(normalized, 'chair') || has(normalized, 'stool')) drawChair(ctx, w, d, 'default');
  else if (has(normalized, 'ottoman_puff')) drawOttoman(ctx, w, d, 'puff');
  else if (has(normalized, 'ottoman_tufted')) drawOttoman(ctx, w, d, 'tufted');
  else if (has(normalized, 'ottoman')) drawOttoman(ctx, w, d, 'square');
  else if (has(normalized, 'table_4')) drawTable(ctx, w, d, 4);
  else if (has(normalized, 'table_6')) drawTable(ctx, w, d, 6);
  else if (has(normalized, 'table_8') || has(normalized, 'conference')) drawTable(ctx, w, d, 8);
  else if (has(normalized, 'round') || has(normalized, 'cafe')) drawTable(ctx, w, d, has(normalized, 'dining') ? 6 : 0, true);
  else if (has(normalized, 'table') || normalized === 'coffee' || normalized === 'desk') drawTable(ctx, w, d);
  else if (has(normalized, 'wardrobe') || has(normalized, 'shelf') || has(normalized, 'cabinet') || has(normalized, 'console') || has(normalized, 'credenza') || has(normalized, 'whiteboard')) drawStorage(ctx, w, d, normalized);
  else if (has(normalized, 'counter_l')) drawCounter(ctx, w, d, true);
  else if (has(normalized, 'counter') || normalized === 'standard' || normalized === 'island' || normalized === 'reception' || has(normalized, 'cashier')) drawCounter(ctx, w, d);
  else if (has(normalized, 'double_sink')) drawSink(ctx, w, d, true);
  else if (has(normalized, 'sink')) drawSink(ctx, w, d);
  else if (has(normalized, 'stove') || has(normalized, 'hob_4')) drawCooktop(ctx, w, d, 4);
  else if (has(normalized, 'hob_2')) drawCooktop(ctx, w, d, 2);
  else if (has(normalized, 'fridge')) drawAppliance(ctx, w, d, 'fridge');
  else if (has(normalized, 'washer')) drawAppliance(ctx, w, d, 'washer');
  else if (has(normalized, 'wc') || has(normalized, 'basin') || has(normalized, 'shower') || has(normalized, 'bath') || has(normalized, 'vanity')) drawBathroom(ctx, w, d, normalized);
  else drawStorage(ctx, w, d);

  return true;
};
