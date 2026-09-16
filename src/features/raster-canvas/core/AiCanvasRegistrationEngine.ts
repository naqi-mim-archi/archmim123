export interface AiCanvasRegistration {
  modelWidth: number;
  modelHeight: number;
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
  aspectRatio: string;
}

interface SupportedAspectRatio {
  label: string;
  width: number;
  height: number;
}

const SUPPORTED_ASPECT_RATIOS: SupportedAspectRatio[] = [
  { label: '1:1', width: 1, height: 1 },
  { label: '3:2', width: 3, height: 2 },
  { label: '2:3', width: 2, height: 3 },
  { label: '4:3', width: 4, height: 3 },
  { label: '3:4', width: 3, height: 4 },
  { label: '16:9', width: 16, height: 9 },
  { label: '9:16', width: 9, height: 16 },
  { label: '5:4', width: 5, height: 4 },
  { label: '4:5', width: 4, height: 5 },
  { label: '21:9', width: 21, height: 9 },
];

export class AiCanvasRegistrationEngine {
  static getRegistration(contentWidth: number, contentHeight: number): AiCanvasRegistration {
    const contentRatio = contentWidth / contentHeight;
    const target = SUPPORTED_ASPECT_RATIOS.reduce((closest, candidate) => {
      const closestDelta = Math.abs(closest.width / closest.height - contentRatio);
      const candidateDelta = Math.abs(candidate.width / candidate.height - contentRatio);
      return candidateDelta < closestDelta ? candidate : closest;
    });
    const units = Math.max(
      Math.ceil(contentWidth / target.width),
      Math.ceil(contentHeight / target.height),
    );
    const modelWidth = units * target.width;
    const modelHeight = units * target.height;

    return {
      modelWidth,
      modelHeight,
      contentX: Math.floor((modelWidth - contentWidth) / 2),
      contentY: Math.floor((modelHeight - contentHeight) / 2),
      contentWidth,
      contentHeight,
      aspectRatio: target.label,
    };
  }

  static prepareRequest(
    baseCanvas: HTMLCanvasElement,
    maskCanvas: HTMLCanvasElement,
  ): { baseCanvas: HTMLCanvasElement; maskCanvas: HTMLCanvasElement; registration: AiCanvasRegistration } {
    const registration = this.getRegistration(baseCanvas.width, baseCanvas.height);
    const preparedBase = document.createElement('canvas');
    preparedBase.width = registration.modelWidth;
    preparedBase.height = registration.modelHeight;
    const baseCtx = preparedBase.getContext('2d');
    if (baseCtx) {
      baseCtx.fillStyle = '#ffffff';
      baseCtx.fillRect(0, 0, preparedBase.width, preparedBase.height);
      baseCtx.drawImage(baseCanvas, registration.contentX, registration.contentY);
    }

    const preparedMask = document.createElement('canvas');
    preparedMask.width = registration.modelWidth;
    preparedMask.height = registration.modelHeight;
    preparedMask.getContext('2d')?.drawImage(maskCanvas, registration.contentX, registration.contentY);

    return { baseCanvas: preparedBase, maskCanvas: preparedMask, registration };
  }

  static extractRegisteredResult(
    generatedImage: HTMLImageElement | HTMLCanvasElement,
    registration: AiCanvasRegistration,
  ): HTMLCanvasElement {
    const normalized = document.createElement('canvas');
    normalized.width = registration.modelWidth;
    normalized.height = registration.modelHeight;
    normalized.getContext('2d')?.drawImage(
      generatedImage,
      0,
      0,
      registration.modelWidth,
      registration.modelHeight,
    );

    const extracted = document.createElement('canvas');
    extracted.width = registration.contentWidth;
    extracted.height = registration.contentHeight;
    extracted.getContext('2d')?.drawImage(
      normalized,
      registration.contentX,
      registration.contentY,
      registration.contentWidth,
      registration.contentHeight,
      0,
      0,
      registration.contentWidth,
      registration.contentHeight,
    );
    return extracted;
  }

  /**
   * Corrects the small whole-frame translation image models can introduce.
   * Only protected pixels outside the edit mask participate in registration.
   */
  static alignGeneratedToBase(
    generatedCanvas: HTMLCanvasElement,
    baseCanvas: HTMLCanvasElement,
    maskCanvas: HTMLCanvasElement,
    maxShift = 3,
  ): HTMLCanvasElement {
    const width = baseCanvas.width;
    const height = baseCanvas.height;
    if (
      width !== generatedCanvas.width ||
      height !== generatedCanvas.height ||
      width !== maskCanvas.width ||
      height !== maskCanvas.height
    ) {
      return generatedCanvas;
    }

    const baseCtx = baseCanvas.getContext('2d', { willReadFrequently: true });
    const generatedCtx = generatedCanvas.getContext('2d', { willReadFrequently: true });
    const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!baseCtx || !generatedCtx || !maskCtx) return generatedCanvas;

    const base = baseCtx.getImageData(0, 0, width, height).data;
    const generated = generatedCtx.getImageData(0, 0, width, height).data;
    const mask = maskCtx.getImageData(0, 0, width, height).data;
    const sampleStep = Math.max(2, Math.floor(Math.min(width, height) / 320));

    const scoreShift = (translateX: number, translateY: number): number => {
      let error = 0;
      let samples = 0;
      const edgePadding = maxShift + 1;

      for (let y = edgePadding; y < height - edgePadding; y += sampleStep) {
        const generatedY = y - translateY;
        if (generatedY < 0 || generatedY >= height) continue;

        for (let x = edgePadding; x < width - edgePadding; x += sampleStep) {
          const maskIndex = (y * width + x) * 4;
          const maskLuminance = Math.max(mask[maskIndex], mask[maskIndex + 1], mask[maskIndex + 2]);
          if (mask[maskIndex + 3] > 16 && maskLuminance > 16) continue;

          const rightIndex = (y * width + Math.min(width - 1, x + 1)) * 4;
          const downIndex = (Math.min(height - 1, y + 1) * width + x) * 4;
          const luminance = base[maskIndex] + base[maskIndex + 1] + base[maskIndex + 2];
          const rightLuminance = base[rightIndex] + base[rightIndex + 1] + base[rightIndex + 2];
          const downLuminance = base[downIndex] + base[downIndex + 1] + base[downIndex + 2];
          if (Math.abs(luminance - rightLuminance) + Math.abs(luminance - downLuminance) < 24) continue;

          const generatedIndex = (generatedY * width + (x - translateX)) * 4;
          error += Math.min(64, Math.abs(base[maskIndex] - generated[generatedIndex]));
          error += Math.min(64, Math.abs(base[maskIndex + 1] - generated[generatedIndex + 1]));
          error += Math.min(64, Math.abs(base[maskIndex + 2] - generated[generatedIndex + 2]));
          samples += 3;
        }
      }

      return samples > 0 ? error / samples : Number.POSITIVE_INFINITY;
    };

    const zeroScore = scoreShift(0, 0);
    let bestScore = zeroScore;
    let bestX = 0;
    let bestY = 0;
    for (let y = -maxShift; y <= maxShift; y++) {
      for (let x = -maxShift; x <= maxShift; x++) {
        if (x === 0 && y === 0) continue;
        const score = scoreShift(x, y);
        if (score < bestScore) {
          bestScore = score;
          bestX = x;
          bestY = y;
        }
      }
    }

    // Avoid moving intentionally regenerated frames unless alignment is clearly better.
    if (!Number.isFinite(zeroScore) || bestScore >= zeroScore * 0.985) return generatedCanvas;

    const aligned = document.createElement('canvas');
    aligned.width = width;
    aligned.height = height;
    aligned.getContext('2d')?.drawImage(generatedCanvas, bestX, bestY);
    return aligned;
  }
}
