import type { ConfirmedText4jBrief } from './text4jBrief';
import { getText4jRectangularBoundaryEligibility } from './text4jBrief';

export interface Text4jAspectRaster {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export interface Text4jStructuralFrame {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  ratio: number;
}

export interface Text4jAspectCorrectionPlan {
  applied: boolean;
  targetRatio: number;
  sourceRatio: number;
  correctedRatio: number;
  relativeError: number;
  scaleX: number;
  scaleY: number;
  reason: 'within-tolerance' | 'axis-correction' | 'unsafe-correction';
}

export interface Text4jGeneratedImageAspectResult {
  dataUrl: string;
  applied: boolean;
  targetRatio?: number;
  sourceRatio?: number;
  correctedRatio?: number;
  relativeError?: number;
  reason: 'not-rectangle-locked' | 'frame-not-detected' | Text4jAspectCorrectionPlan['reason'];
}

interface StructuralBand {
  center: number;
  thickness: number;
  peakInk: number;
}

const DARK_LUMINANCE = 132;
const MIN_AXIS_COMPRESSION = 0.55;

const collectStructuralBands = (
  inkByLine: number[],
  minimumInk: number,
  minimumThickness: number,
): StructuralBand[] => {
  const bands: StructuralBand[] = [];
  let start = -1;
  for (let line = 0; line <= inkByLine.length; line++) {
    const structural = line < inkByLine.length && inkByLine[line] >= minimumInk;
    if (structural && start < 0) start = line;
    if (structural || start < 0) continue;
    const end = line - 1;
    const thickness = end - start + 1;
    if (thickness >= minimumThickness) {
      let weightedLine = 0;
      let totalInk = 0;
      let peakInk = 0;
      for (let candidate = start; candidate <= end; candidate++) {
        const ink = inkByLine[candidate];
        weightedLine += candidate * ink;
        totalInk += ink;
        peakInk = Math.max(peakInk, ink);
      }
      bands.push({
        center: totalInk ? weightedLine / totalInk : (start + end) / 2,
        thickness,
        peakInk,
      });
    }
    start = -1;
  }
  return bands;
};

/**
 * Detect the outer thick-wall frame without treating thin dimension strings,
 * labels, or door swings as property extents. This intentionally supports only
 * the reliable full-rectangle case used by the D-only locked-frame guard.
 */
export const detectText4jLockedStructuralFrame = (
  raster: Text4jAspectRaster,
): Text4jStructuralFrame | undefined => {
  const { width, height, data } = raster;
  if (width < 128 || height < 128 || data.length < width * height * 4) return undefined;

  const rowInk = Array<number>(height).fill(0);
  const columnInk = Array<number>(width).fill(0);
  const darkMask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const alpha = (data[offset + 3] ?? 255) / 255;
      const luminance = 0.2126 * data[offset] + 0.7152 * data[offset + 1] + 0.0722 * data[offset + 2];
      const composited = 255 - alpha * (255 - luminance);
      if (composited <= DARK_LUMINANCE) {
        darkMask[y * width + x] = 1;
        rowInk[y]++;
        columnInk[x]++;
      }
    }
  }

  const minimumThickness = Math.max(3, Math.round(Math.min(width, height) * 0.003));
  const horizontalBands = collectStructuralBands(rowInk, width * 0.16, minimumThickness)
    .filter(band => band.center >= height * 0.04 && band.center <= height * 0.96);
  const verticalBands = collectStructuralBands(columnInk, height * 0.16, minimumThickness)
    .filter(band => band.center >= width * 0.04 && band.center <= width * 0.96);
  if (horizontalBands.length < 2 || verticalBands.length < 2) return undefined;

  const cornerRadius = Math.max(4, Math.round(Math.min(width, height) * 0.008));
  const hasCornerInk = (x: number, y: number) => {
    let ink = 0;
    let samples = 0;
    const centerX = Math.round(x), centerY = Math.round(y);
    for (let sampleY = Math.max(0, centerY - cornerRadius); sampleY <= Math.min(height - 1, centerY + cornerRadius); sampleY++) {
      for (let sampleX = Math.max(0, centerX - cornerRadius); sampleX <= Math.min(width - 1, centerX + cornerRadius); sampleX++) {
        ink += darkMask[sampleY * width + sampleX];
        samples++;
      }
    }
    return ink / Math.max(1, samples) >= 0.05;
  };

  let bestFrame: Text4jStructuralFrame | undefined;
  let bestScore = -1;
  for (let topIndex = 0; topIndex < horizontalBands.length - 1; topIndex++) {
    for (let bottomIndex = topIndex + 1; bottomIndex < horizontalBands.length; bottomIndex++) {
      const top = horizontalBands[topIndex];
      const bottom = horizontalBands[bottomIndex];
      const frameHeight = bottom.center - top.center;
      if (frameHeight < height * 0.30 || frameHeight > height * 0.92) continue;
      for (let leftIndex = 0; leftIndex < verticalBands.length - 1; leftIndex++) {
        for (let rightIndex = leftIndex + 1; rightIndex < verticalBands.length; rightIndex++) {
          const left = verticalBands[leftIndex];
          const right = verticalBands[rightIndex];
          const frameWidth = right.center - left.center;
          if (frameWidth < width * 0.30 || frameWidth > width * 0.92) continue;
          const cornerSupport = [
            hasCornerInk(left.center, top.center),
            hasCornerInk(right.center, top.center),
            hasCornerInk(left.center, bottom.center),
            hasCornerInk(right.center, bottom.center),
          ].filter(Boolean).length;
          if (cornerSupport < 3) continue;
          const score = cornerSupport * 10 + frameWidth / width + frameHeight / height;
          if (score <= bestScore) continue;
          bestScore = score;
          bestFrame = {
            minX: left.center,
            maxX: right.center,
            minY: top.center,
            maxY: bottom.center,
            width: frameWidth,
            height: frameHeight,
            ratio: frameWidth / frameHeight,
          };
        }
      }
    }
  }

  return bestFrame;
};

export const planText4jLockedAspectCorrection = (
  frame: Pick<Text4jStructuralFrame, 'ratio'>,
  targetRatio: number,
  tolerance = 0.02,
): Text4jAspectCorrectionPlan => {
  const sourceRatio = frame.ratio;
  const relativeError = Math.abs(sourceRatio - targetRatio) / Math.max(0.0001, targetRatio);
  if (!Number.isFinite(sourceRatio) || !Number.isFinite(targetRatio) || sourceRatio <= 0 || targetRatio <= 0) {
    return {
      applied: false,
      targetRatio,
      sourceRatio,
      correctedRatio: sourceRatio,
      relativeError: Number.POSITIVE_INFINITY,
      scaleX: 1,
      scaleY: 1,
      reason: 'unsafe-correction',
    };
  }
  if (relativeError <= tolerance) {
    return {
      applied: false,
      targetRatio,
      sourceRatio,
      correctedRatio: sourceRatio,
      relativeError,
      scaleX: 1,
      scaleY: 1,
      reason: 'within-tolerance',
    };
  }

  const scaleX = sourceRatio > targetRatio ? targetRatio / sourceRatio : 1;
  const scaleY = sourceRatio < targetRatio ? sourceRatio / targetRatio : 1;
  if (Math.min(scaleX, scaleY) < MIN_AXIS_COMPRESSION) {
    return {
      applied: false,
      targetRatio,
      sourceRatio,
      correctedRatio: sourceRatio,
      relativeError,
      scaleX: 1,
      scaleY: 1,
      reason: 'unsafe-correction',
    };
  }
  return {
    applied: true,
    targetRatio,
    sourceRatio,
    correctedRatio: sourceRatio * scaleX / scaleY,
    relativeError,
    scaleX,
    scaleY,
    reason: 'axis-correction',
  };
};

export const getText4jLockedImageAspectTarget = (
  brief: ConfirmedText4jBrief,
): number | undefined => {
  const eligibility = getText4jRectangularBoundaryEligibility(brief);
  if (brief.project.floors !== 1 || !eligibility.eligible || !brief.dimensions.rectangularBoundary?.locked) return undefined;
  const { width, depth } = brief.dimensions.envelope;
  if (!(width > 0 && depth > 0)) return undefined;
  return width / depth;
};

const loadImage = (dataUrl: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Generated Text 4.0 J image could not be decoded for aspect validation.'));
  image.src = dataUrl;
});

/**
 * D-only image-generation postcondition. It runs before preview/digitization,
 * never calls Gemini, and does not participate in Image-to-JSON extraction.
 */
export const enforceText4jGeneratedImageAspect = async (
  dataUrl: string,
  brief: ConfirmedText4jBrief,
): Promise<Text4jGeneratedImageAspectResult> => {
  const targetRatio = getText4jLockedImageAspectTarget(brief);
  if (!targetRatio || typeof document === 'undefined' || typeof Image === 'undefined') {
    return { dataUrl, applied: false, reason: 'not-rectangle-locked' };
  }

  const image = await loadImage(dataUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) return { dataUrl, applied: false, targetRatio, reason: 'frame-not-detected' };
  sourceContext.fillStyle = '#ffffff';
  sourceContext.fillRect(0, 0, width, height);
  sourceContext.drawImage(image, 0, 0, width, height);

  const frame = detectText4jLockedStructuralFrame(sourceContext.getImageData(0, 0, width, height));
  if (!frame) return { dataUrl, applied: false, targetRatio, reason: 'frame-not-detected' };
  const plan = planText4jLockedAspectCorrection(frame, targetRatio);
  if (!plan.applied) {
    return {
      dataUrl,
      applied: false,
      targetRatio,
      sourceRatio: plan.sourceRatio,
      correctedRatio: plan.correctedRatio,
      relativeError: plan.relativeError,
      reason: plan.reason,
    };
  }

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = width;
  outputCanvas.height = height;
  const outputContext = outputCanvas.getContext('2d');
  if (!outputContext) return { dataUrl, applied: false, targetRatio, reason: 'frame-not-detected' };
  outputContext.fillStyle = '#ffffff';
  outputContext.fillRect(0, 0, width, height);
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = 'high';
  const correctedWidth = width * plan.scaleX;
  const correctedHeight = height * plan.scaleY;
  outputContext.drawImage(
    image,
    (width - correctedWidth) / 2,
    (height - correctedHeight) / 2,
    correctedWidth,
    correctedHeight,
  );

  return {
    dataUrl: outputCanvas.toDataURL('image/png'),
    applied: true,
    targetRatio,
    sourceRatio: plan.sourceRatio,
    correctedRatio: plan.correctedRatio,
    relativeError: plan.relativeError,
    reason: plan.reason,
  };
};
