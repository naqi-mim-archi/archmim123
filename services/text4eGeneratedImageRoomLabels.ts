import type { GeneratedData } from '../components/generative-wizard/types';
import type { ConfirmedText4eBrief } from './text4eBrief';

type LengthUnit = ConfirmedText4eBrief['dimensions']['envelope']['unit'];

interface AxisSegment {
  axis: 'horizontal' | 'vertical';
  line: number;
  start: number;
  end: number;
  thickness: number;
}

export interface Text4eRoomCrossDimensionLabel {
  label: string;
  position: [number, number];
  widthMeters: number;
  depthMeters: number;
  dimensionText: string;
}

const isFinitePoint = (point?: number[]): point is number[] =>
  !!point && point.length >= 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]);

const wallThickness = (type = '') => /exterior/i.test(type) ? 0.23 : 0.115;

const toAxisSegments = (geometry: GeneratedData): AxisSegment[] => [
  ...(geometry.walls || []).map(wall => ({ ...wall, thickness: wallThickness(wall.type) })),
  ...(geometry.railings || []).map(railing => ({ ...railing, type: 'railing', thickness: 0 })),
].flatMap((item): AxisSegment[] => {
  if (!isFinitePoint(item.p1) || !isFinitePoint(item.p2)) return [];
  const [x1, y1] = item.p1, [x2, y2] = item.p2;
  const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
  if (dx < 0.05 && dy < 0.05) return [];
  if (dx >= dy * 3) {
    return [{
      axis: 'horizontal' as const,
      line: (y1 + y2) / 2,
      start: Math.min(x1, x2),
      end: Math.max(x1, x2),
      thickness: item.thickness,
    }];
  }
  if (dy >= dx * 3) {
    return [{
      axis: 'vertical' as const,
      line: (x1 + x2) / 2,
      start: Math.min(y1, y2),
      end: Math.max(y1, y2),
      thickness: item.thickness,
    }];
  }
  return [];
});

const bracketingSegments = (
  segments: AxisSegment[],
  axis: AxisSegment['axis'],
  position: number,
  perpendicularPosition: number,
) => {
  const directional = segments.filter(segment => segment.axis === axis);
  for (const tolerance of [0.2, 0.6, 1.2, Number.POSITIVE_INFINITY]) {
    const spanning = directional.filter(segment =>
      perpendicularPosition >= segment.start - tolerance && perpendicularPosition <= segment.end + tolerance);
    const before = spanning.filter(segment => segment.line < position).sort((a, b) => b.line - a.line)[0];
    const after = spanning.filter(segment => segment.line > position).sort((a, b) => a.line - b.line)[0];
    if (before && after) return { before, after };
  }
  return undefined;
};

const formatImperialLength = (meters: number) => {
  const totalInches = Math.max(1, Math.round(meters / 0.0254));
  return `${Math.floor(totalInches / 12)}'-${totalInches % 12}\"`;
};

export const formatText4eRoomCrossDimensions = (
  widthMeters: number,
  depthMeters: number,
  unit: LengthUnit,
): string => unit === 'ft'
  ? `${formatImperialLength(widthMeters)} x ${formatImperialLength(depthMeters)}`
  : `${widthMeters.toFixed(2)} m x ${depthMeters.toFixed(2)} m`;

export const buildText4eRoomCrossDimensionLabels = (
  geometry: GeneratedData,
  unit: LengthUnit,
): Text4eRoomCrossDimensionLabel[] => {
  const segments = toAxisSegments(geometry);
  return (geometry.rooms || []).flatMap(room => {
    if (!room.label?.trim() || !isFinitePoint(room.pos)) return [];
    // Never compete with a Gemini label block which OCR already confirmed,
    // and never guess placement for a brief-derived room. The fallback is only
    // safe when OCR found the name but found no accompanying cross dimensions.
    if (room.sourceWidth && room.sourceDepth) return [];
    if (room.evidence?.source !== 'ocr') return [];
    const [x, y] = room.pos;
    const horizontal = bracketingSegments(segments, 'horizontal', y, x);
    const vertical = bracketingSegments(segments, 'vertical', x, y);
    const derivedWidth = vertical
      ? vertical.after.line - vertical.before.line - (vertical.before.thickness + vertical.after.thickness) / 2
      : undefined;
    const derivedDepth = horizontal
      ? horizontal.after.line - horizontal.before.line - (horizontal.before.thickness + horizontal.after.thickness) / 2
      : undefined;
    const widthMeters = derivedWidth && derivedWidth >= 0.55 ? derivedWidth : room.sourceWidth;
    const depthMeters = derivedDepth && derivedDepth >= 0.55 ? derivedDepth : room.sourceDepth;
    if (!(widthMeters && depthMeters && widthMeters > 0 && depthMeters > 0)) return [];
    return [{
      label: room.label.trim().toUpperCase(),
      position: [x, y] as [number, number],
      widthMeters,
      depthMeters,
      dimensionText: formatText4eRoomCrossDimensions(widthMeters, depthMeters, unit),
    }];
  });
};

const loadImage = (dataUrl: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Generated Text 4.0 E image could not be decoded for room annotation.'));
  image.src = dataUrl;
});

const geometryBounds = (geometry: GeneratedData) => {
  const points = (geometry.walls || []).flatMap(wall => [wall.p1, wall.p2]).filter(isFinitePoint);
  if (points.length < 4) return undefined;
  const xs = points.map(point => point[0]), ys = points.map(point => point[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  if (!(maxX > minX && maxY > minY)) return undefined;
  return { minX, maxX, minY, maxY };
};

const evidencePixelBounds = (geometry: GeneratedData) => {
  const boxes = (geometry.walls || []).flatMap(wall => wall.evidence?.pixelBounds ? [wall.evidence.pixelBounds] : []);
  if (boxes.length < 4) return undefined;
  const minX = Math.min(...boxes.map(box => Math.min(box.x0, box.x1)));
  const maxX = Math.max(...boxes.map(box => Math.max(box.x0, box.x1)));
  const minY = Math.min(...boxes.map(box => Math.min(box.y0, box.y1)));
  const maxY = Math.max(...boxes.map(box => Math.max(box.y0, box.y1)));
  if (!(maxX > minX && maxY > minY)) return undefined;
  return { minX, maxX, minY, maxY };
};

const wrapRoomName = (context: CanvasRenderingContext2D, label: string, maxWidth: number) => {
  const words = label.replace(/\s*\/\s*/g, ' / ').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && context.measureText(candidate).width > maxWidth && lines.length < 1) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
};

/**
 * Presentation-only annotation pass. Geometry extraction has already finished,
 * so these labels cannot become OCR/wall evidence or affect JSON conversion.
 * The canvas size and existing pixels are preserved exactly.
 */
export const annotateText4eGeneratedImageRooms = async (
  dataUrl: string,
  geometry: GeneratedData,
  brief: ConfirmedText4eBrief,
): Promise<string> => {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return dataUrl;
  const ocrStatus = geometry.extractionDiagnostics?.ocr?.status;
  if (ocrStatus !== 'completed' && ocrStatus !== 'provided') return dataUrl;
  const labels = buildText4eRoomCrossDimensionLabels(geometry, brief.dimensions.envelope.unit);
  const worldBounds = geometryBounds(geometry);
  const pixelBounds = evidencePixelBounds(geometry);
  if (!labels.length || !worldBounds || !pixelBounds) return dataUrl;

  const image = await loadImage(dataUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return dataUrl;
  context.drawImage(image, 0, 0, width, height);

  const worldWidth = worldBounds.maxX - worldBounds.minX;
  const worldDepth = worldBounds.maxY - worldBounds.minY;
  const pixelWidth = pixelBounds.maxX - pixelBounds.minX;
  const pixelDepth = pixelBounds.maxY - pixelBounds.minY;
  const mapX = (x: number) => pixelBounds.minX + (x - worldBounds.minX) / worldWidth * pixelWidth;
  const mapY = (y: number) => pixelBounds.minY + (worldBounds.maxY - y) / worldDepth * pixelDepth;
  const baseFontSize = Math.max(10, Math.round(Math.min(width, height) * 0.014));

  for (const label of labels) {
    const centerX = mapX(label.position[0]);
    const centerY = mapY(label.position[1]);
    const roomPixelWidth = label.widthMeters / worldWidth * pixelWidth;
    const maxTextWidth = Math.max(70, Math.min(roomPixelWidth * 0.82, width * 0.28));
    let fontSize = baseFontSize;
    context.font = `600 ${fontSize}px Arial, sans-serif`;
    let nameLines = wrapRoomName(context, label.label, maxTextWidth);
    while (fontSize > 9 && nameLines.some(line => context.measureText(line).width > maxTextWidth)) {
      fontSize--;
      context.font = `600 ${fontSize}px Arial, sans-serif`;
      nameLines = wrapRoomName(context, label.label, maxTextWidth);
    }
    const dimensionFontSize = Math.max(9, fontSize - 2);
    context.font = `500 ${dimensionFontSize}px Arial, sans-serif`;
    const textWidth = Math.max(
      context.measureText(label.dimensionText).width,
      ...nameLines.map(line => {
        context.font = `600 ${fontSize}px Arial, sans-serif`;
        const measured = context.measureText(line).width;
        context.font = `500 ${dimensionFontSize}px Arial, sans-serif`;
        return measured;
      }),
    );
    const lineHeight = fontSize * 1.12;
    const boxWidth = textWidth + 10;
    const boxHeight = nameLines.length * lineHeight + dimensionFontSize * 1.3 + 8;
    const boxX = Math.max(2, Math.min(width - boxWidth - 2, centerX - boxWidth / 2));
    const boxY = Math.max(2, Math.min(height - boxHeight - 2, centerY - boxHeight / 2));
    context.save();
    context.globalAlpha = 0.94;
    context.fillStyle = '#ffffff';
    context.fillRect(boxX, boxY, boxWidth, boxHeight);
    context.restore();
    context.fillStyle = '#111111';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    let textY = boxY + 5 + lineHeight / 2;
    context.font = `600 ${fontSize}px Arial, sans-serif`;
    for (const line of nameLines) {
      context.fillText(line, boxX + boxWidth / 2, textY);
      textY += lineHeight;
    }
    context.font = `500 ${dimensionFontSize}px Arial, sans-serif`;
    context.fillText(label.dimensionText, boxX + boxWidth / 2, textY + dimensionFontSize * 0.45);
  }

  return canvas.toDataURL('image/png');
};
