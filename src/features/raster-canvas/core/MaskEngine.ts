import { Point, Rect, SelectionMode } from '../types/canvas';

export class MaskEngine {
  /**
   * Creates a dedicated offscreen canvas for a binary mask.
   */
  static createMaskCanvas(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    return canvas;
  }

  /**
   * Applies rectangular selection to the mask canvas.
   */
  static applyRect(
    maskCanvas: HTMLCanvasElement,
    rect: Rect,
    mode: SelectionMode = 'new'
  ): void {
    const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    if (mode === 'new') {
      ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    } else if (mode === 'add') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    } else if (mode === 'subtract') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /**
   * Applies polygon or lasso path to the mask canvas.
   */
  static applyPolygon(
    maskCanvas: HTMLCanvasElement,
    points: Point[],
    mode: SelectionMode = 'new'
  ): void {
    if (points.length < 3) return;
    const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    if (mode === 'new') {
      ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();

    if (mode === 'subtract') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  }

  /**
   * Paints a continuous brush stroke onto the mask canvas.
   */
  static paintBrushStroke(
    maskCanvas: HTMLCanvasElement,
    p1: Point,
    p2: Point,
    radius: number,
    mode: SelectionMode = 'add'
  ): void {
    const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = radius * 2;

    if (mode === 'subtract') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = '#ffffff';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = '#ffffff';
    }

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * Inverts the mask (selected becomes unselected and vice versa).
   */
  static invertMask(maskCanvas: HTMLCanvasElement): void {
    const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const imgData = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha > 0) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
        data[i + 3] = 0;
      } else {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  /**
   * Feathers the mask edges with a soft Gaussian blur.
   */
  static featherMask(maskCanvas: HTMLCanvasElement, radius: number): HTMLCanvasElement {
    if (radius <= 0) return maskCanvas;
    const blurred = document.createElement('canvas');
    blurred.width = maskCanvas.width;
    blurred.height = maskCanvas.height;
    const bCtx = blurred.getContext('2d');
    if (!bCtx) return maskCanvas;

    bCtx.filter = `blur(${radius}px)`;
    bCtx.drawImage(maskCanvas, 0, 0);
    return blurred;
  }

  /**
   * Expands (dilation) or Contracts (erosion) the selection boundary.
   */
  static dilateErodeMask(maskCanvas: HTMLCanvasElement, amount: number): void {
    if (amount === 0) return;
    const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const width = maskCanvas.width;
    const height = maskCanvas.height;
    const srcData = ctx.getImageData(0, 0, width, height);
    const src = srcData.data;
    const outCanvas = document.createElement('canvas');
    outCanvas.width = width;
    outCanvas.height = height;
    const outCtx = outCanvas.getContext('2d');
    if (!outCtx) return;
    const outData = outCtx.createImageData(width, height);
    const out = outData.data;

    const rad = Math.abs(Math.round(amount));
    const isDilate = amount > 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        let selected = isDilate ? false : true;

        for (let dy = -rad; dy <= rad; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -rad; dx <= rad; dx++) {
            if (dx * dx + dy * dy > rad * rad) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const nIdx = (ny * width + nx) * 4;
            const isMasked = src[nIdx + 3] > 128;
            if (isDilate && isMasked) {
              selected = true;
              break;
            }
            if (!isDilate && !isMasked) {
              selected = false;
              break;
            }
          }
          if (isDilate && selected) break;
          if (!isDilate && !selected) break;
        }

        if (selected) {
          out[idx] = 255;
          out[idx + 1] = 255;
          out[idx + 2] = 255;
          out[idx + 3] = 255;
        }
      }
    }

    ctx.putImageData(outData, 0, 0);
  }

  /**
   * Magic Wand / Smart flood-fill selection algorithm.
   * Scans from start point and connects contiguous pixels within RGB color distance tolerance.
   */
  static magicWandSelect(
    sourceCanvas: HTMLCanvasElement,
    maskCanvas: HTMLCanvasElement,
    startX: number,
    startY: number,
    tolerance: number = 32,
    mode: SelectionMode = 'new'
  ): Rect | null {
    const sCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    const mCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!sCtx || !mCtx) return null;

    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    const x0 = Math.floor(startX);
    const y0 = Math.floor(startY);
    if (x0 < 0 || x0 >= width || y0 < 0 || y0 >= height) return null;

    const srcImg = sCtx.getImageData(0, 0, width, height);
    const src = srcImg.data;
    const targetIdx = (y0 * width + x0) * 4;
    const tr = src[targetIdx];
    const tg = src[targetIdx + 1];
    const tb = src[targetIdx + 2];

    const visited = new Uint8Array(width * height);
    const queue: number[] = [x0 + y0 * width];
    visited[x0 + y0 * width] = 1;

    let minX = x0;
    let maxX = x0;
    let minY = y0;
    let maxY = y0;

    if (mode === 'new') {
      mCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    }

    const maskImg = mCtx.getImageData(0, 0, width, height);
    const mask = maskImg.data;

    const tolSq = tolerance * tolerance * 3;

    while (queue.length > 0) {
      const curr = queue.pop()!;
      const cx = curr % width;
      const cy = Math.floor(curr / width);

      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      const mIdx = curr * 4;
      if (mode === 'subtract') {
        mask[mIdx + 3] = 0;
      } else {
        mask[mIdx] = 255;
        mask[mIdx + 1] = 255;
        mask[mIdx + 2] = 255;
        mask[mIdx + 3] = 255;
      }

      // Check 4-connected neighbors
      const neighbors = [
        cx > 0 ? curr - 1 : -1,
        cx < width - 1 ? curr + 1 : -1,
        cy > 0 ? curr - width : -1,
        cy < height - 1 ? curr + width : -1
      ];

      for (const n of neighbors) {
        if (n === -1 || visited[n]) continue;
        const nIdx = n * 4;
        const dr = src[nIdx] - tr;
        const dg = src[nIdx + 1] - tg;
        const db = src[nIdx + 2] - tb;
        const distSq = dr * dr + dg * dg + db * db;

        if (distSq <= tolSq) {
          visited[n] = 1;
          queue.push(n);
        }
      }
    }

    mCtx.putImageData(maskImg, 0, 0);
    return {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX + 1),
      height: Math.max(1, maxY - minY + 1)
    };
  }

  /**
   * Calculates the exact bounding box of the active selection mask.
   */
  static getMaskBounds(maskCanvas: HTMLCanvasElement): Rect | null {
    const ctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    const width = maskCanvas.width;
    const height = maskCanvas.height;
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > 10) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (maxX === -1) return null;
    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1
    };
  }

  /**
   * Converts the binary mask to standard black-and-white base64 PNG (white = edit area, black = preserve).
   */
  static exportInpaintingMaskBase64(maskCanvas: HTMLCanvasElement): string {
    const outCanvas = document.createElement('canvas');
    outCanvas.width = maskCanvas.width;
    outCanvas.height = maskCanvas.height;
    const ctx = outCanvas.getContext('2d');
    if (!ctx) return '';

    // Fill background with pure black
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);

    // Draw white mask on top
    ctx.drawImage(maskCanvas, 0, 0);
    return outCanvas.toDataURL('image/png');
  }

  /**
   * Converts any mask canvas (whether transparent/white or black/white)
   * into a true alpha mask where selected pixels have alpha > 0 and unselected pixels have alpha = 0.
   */
  static convertToAlphaMask(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
    const width = sourceCanvas.width;
    const height = sourceCanvas.height;
    const alphaCanvas = document.createElement('canvas');
    alphaCanvas.width = width;
    alphaCanvas.height = height;
    const ctx = alphaCanvas.getContext('2d', { willReadFrequently: true });
    const sCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || !sCtx) return alphaCanvas;

    const srcData = sCtx.getImageData(0, 0, width, height);
    const outData = ctx.createImageData(width, height);
    const src = srcData.data;
    const out = outData.data;

    for (let i = 0; i < src.length; i += 4) {
      const r = src[i];
      const g = src[i + 1];
      const b = src[i + 2];
      const a = src[i + 3];

      // If already transparent in alpha channel, unselected
      if (a === 0) {
        out[i] = 255;
        out[i + 1] = 255;
        out[i + 2] = 255;
        out[i + 3] = 0;
        continue;
      }

      // Calculate luminance for black-and-white raster masks
      const luminance = (0.299 * r + 0.587 * g + 0.114 * b) * (a / 255);
      const isSelected = luminance > 35;

      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
      out[i + 3] = isSelected ? Math.round(Math.min(255, luminance)) : 0;
    }

    ctx.putImageData(outData, 0, 0);
    return alphaCanvas;
  }

  /** Keeps the feathered transition inside the selection so protected pixels never leak. */
  static createSeamlessBlendMask(maskCanvas: HTMLCanvasElement, featherRadius: number): HTMLCanvasElement {
    const alphaMask = this.convertToAlphaMask(maskCanvas);
    if (featherRadius <= 0) return alphaMask;

    const featheredMask = this.featherMask(alphaMask, featherRadius);
    const ctx = featheredMask.getContext('2d');
    if (!ctx) return alphaMask;
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(alphaMask, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    return featheredMask;
  }

  /**
   * Blends an AI generated inpainting result with the base canvas strictly over the selection mask.
   * Ensures 100% bit-for-bit preservation of all unselected pixels with smooth anti-aliased edge transitions.
   */
  static blendInpaintingResult(
    baseCanvas: HTMLCanvasElement,
    generatedImage: HTMLImageElement | HTMLCanvasElement,
    maskCanvas: HTMLCanvasElement,
    isolatedOnly = false,
    featherRadius = 1
  ): HTMLCanvasElement {
    const width = baseCanvas.width;
    const height = baseCanvas.height;
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = width;
    outputCanvas.height = height;
    const outCtx = outputCanvas.getContext('2d');
    if (!outCtx) return outputCanvas;

    // Prepare one shared edge mask for both isolated and committed results.
    const effectiveMask = this.createSeamlessBlendMask(maskCanvas, featherRadius);

    // 3. Create masked AI layer containing only the generated pixels inside the selection
    const maskedAiCanvas = document.createElement('canvas');
    maskedAiCanvas.width = width;
    maskedAiCanvas.height = height;
    const mCtx = maskedAiCanvas.getContext('2d');
    if (mCtx) {
      mCtx.drawImage(generatedImage, 0, 0, width, height);
      mCtx.globalCompositeOperation = 'destination-in';
      mCtx.drawImage(effectiveMask, 0, 0, width, height);
    }

    if (isolatedOnly) {
      // Return isolated cutout layer (transparent outside selection)
      outCtx.drawImage(maskedAiCanvas, 0, 0);
      return outputCanvas;
    }

    // Composite once over the untouched base. Punching the base out with the
    // same feathered mask would apply fractional edge alpha twice and create a halo.
    outCtx.drawImage(baseCanvas, 0, 0);
    outCtx.drawImage(maskedAiCanvas, 0, 0);

    return outputCanvas;
  }
}
