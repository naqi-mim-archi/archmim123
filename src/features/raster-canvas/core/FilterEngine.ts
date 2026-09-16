import { COLOR_MIXER_CHANNELS, ImageAdjustments } from '../types/canvas';

const clamp = (value: number, min = 0, max = 255) => Math.min(max, Math.max(min, value));
const smoothstep = (a: number, b: number, value: number) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export class FilterEngine {
  static cloneAdjustments(value: ImageAdjustments): ImageAdjustments {
    return {
      ...value,
      toneCurve: value.toneCurve.map(point => ({ ...point })),
      hsl: Object.fromEntries(Object.entries(value.hsl).map(([key, item]) => [key, { ...item }])) as ImageAdjustments['hsl'],
      pointColor: { ...value.pointColor },
    };
  }

  static isNeutral(value: ImageAdjustments): boolean {
    const scalarKeys: (keyof ImageAdjustments)[] = [
      'exposure', 'brightness', 'contrast', 'highlights', 'shadows', 'whites', 'blacks',
      'temperature', 'tint', 'vibrance', 'saturation', 'texture', 'clarity', 'dehaze',
      'vignette', 'sharpness', 'noiseReduction', 'blur',
    ];
    return scalarKeys.every(key => value[key] === 0) && !value.blackAndWhite &&
      value.toneCurve.every(point => point.x === point.y) &&
      Object.values(value.hsl).every(item => item.hue === 0 && item.saturation === 0 && item.luminance === 0) &&
      (!value.pointColor.enabled || (value.pointColor.hue === 0 && value.pointColor.saturation === 0 && value.pointColor.luminance === 0));
  }

  static rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > .5 ? d / (2 - max - min) : d / (max + min);
    let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h / 6 * 360, s, l];
  }

  private static hslToRgb(h: number, s: number, l: number): [number, number, number] {
    h = ((h % 360) + 360) % 360 / 360;
    if (s === 0) return [l * 255, l * 255, l * 255];
    const q = l < .5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const hue = (t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [hue(h + 1 / 3) * 255, hue(h) * 255, hue(h - 1 / 3) * 255];
  }

  private static hueDistance(a: number, b: number) {
    const distance = Math.abs(a - b) % 360;
    return Math.min(distance, 360 - distance);
  }

  private static blurData(source: HTMLCanvasElement, radius: number): Uint8ClampedArray | null {
    if (radius <= 0) return null;
    const canvas = document.createElement('canvas');
    canvas.width = source.width; canvas.height = source.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(source, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  }

  static applyAdjustments(sourceCanvas: HTMLCanvasElement, targetCanvas: HTMLCanvasElement, a: ImageAdjustments, maskCanvas?: HTMLCanvasElement | null): void {
    const width = sourceCanvas.width, height = sourceCanvas.height;
    targetCanvas.width = width; targetCanvas.height = height;
    const sCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    const tCtx = targetCanvas.getContext('2d', { willReadFrequently: true });
    if (!sCtx || !tCtx) return;
    const src = sCtx.getImageData(0, 0, width, height).data;
    const image = tCtx.createImageData(width, height), out = image.data;
    const maskCtx = maskCanvas?.getContext('2d', { willReadFrequently: true });
    const mask = maskCtx ? maskCtx.getImageData(0, 0, width, height).data : null;
    const fine = this.blurData(sourceCanvas, a.texture !== 0 || a.sharpness > 0 ? 1 : 0);
    const local = this.blurData(sourceCanvas, a.clarity !== 0 ? 5 : 0);
    const denoise = this.blurData(sourceCanvas, a.noiseReduction > 0 ? 1.4 : 0);
    const hasCurve = a.toneCurve.some(point => point.x !== point.y);
    const hasMixer = Object.values(a.hsl).some(item => item.hue !== 0 || item.saturation !== 0 || item.luminance !== 0);
    const hasPointColor = a.pointColor.enabled && (a.pointColor.hue !== 0 || a.pointColor.saturation !== 0 || a.pointColor.luminance !== 0);
    const hasColorWork = a.saturation !== 0 || a.vibrance !== 0 || a.blackAndWhite || hasMixer || hasPointColor;
    const curve = hasCurve ? [...a.toneCurve].sort((left, right) => left.x - right.x) : [];
    const lut = new Uint8Array(256);
    for (let value = 0; hasCurve && value < 256; value++) {
      let left = curve[0], right = curve[curve.length - 1];
      for (let p = 1; p < curve.length; p++) if (curve[p].x >= value) { left = curve[p - 1]; right = curve[p]; break; }
      const amount = right.x === left.x ? 0 : (value - left.x) / (right.x - left.x);
      lut[value] = clamp(Math.round(left.y + (right.y - left.y) * amount));
    }
    const centers = [0, 30, 60, 120, 180, 220, 275, 320];
    const exposure = Math.pow(2, a.exposure / 50), contrast = Math.pow(2, a.contrast / 50);
    for (let i = 0; i < src.length; i += 4) {
      const r = src[i], g = src[i + 1], b = src[i + 2], alpha = src[i + 3];
      if (!alpha) { out[i + 3] = 0; continue; }
      const maskWeight = mask ? mask[i + 3] / 255 : 1;
      if (!maskWeight) { out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = alpha; continue; }
      let nr = r, ng = g, nb = b;
      if (denoise) {
        const edge = Math.abs(r - denoise[i]) + Math.abs(g - denoise[i + 1]) + Math.abs(b - denoise[i + 2]);
        const strength = clamp(1 - edge / 90, 0, 1) * a.noiseReduction / 100;
        nr += (denoise[i] - nr) * strength; ng += (denoise[i + 1] - ng) * strength; nb += (denoise[i + 2] - nb) * strength;
      }
      nr = nr * exposure + a.brightness * 1.28; ng = ng * exposure + a.brightness * 1.28; nb = nb * exposure + a.brightness * 1.28;
      nr = (nr - 128) * contrast + 128; ng = (ng - 128) * contrast + 128; nb = (nb - 128) * contrast + 128;
      let lum = .2126 * nr + .7152 * ng + .0722 * nb;
      const tonal = a.shadows * .65 * (1 - smoothstep(35, 150, lum)) + a.highlights * .65 * smoothstep(105, 225, lum) +
        a.blacks * .55 * (1 - smoothstep(0, 75, lum)) + a.whites * .55 * smoothstep(180, 255, lum);
      nr += tonal + a.temperature * .3 + a.tint * .1; ng += tonal - a.tint * .2; nb += tonal - a.temperature * .3 + a.tint * .1;
      if (a.dehaze) {
        const amount = a.dehaze / 100;
        nr = (nr - 145) * (1 + amount * .65) + 145 - amount * 5;
        ng = (ng - 145) * (1 + amount * .65) + 145 - amount * 5;
        nb = (nb - 145) * (1 + amount * .65) + 145 - amount * 5;
      }
      if (fine) {
        const amount = a.texture / 100 * .55 + a.sharpness / 100 * .75;
        nr += (nr - fine[i]) * amount; ng += (ng - fine[i + 1]) * amount; nb += (nb - fine[i + 2]) * amount;
      }
      if (local) {
        const amount = a.clarity / 100 * .55;
        nr += (nr - local[i]) * amount; ng += (ng - local[i + 1]) * amount; nb += (nb - local[i + 2]) * amount;
      }
      if (hasColorWork) {
        let [h, s, l] = this.rgbToHsl(clamp(nr), clamp(ng), clamp(nb));
        s = clamp(s * (1 + a.saturation / 100 + a.vibrance / 100 * (1 - s * .7)), 0, 1);
        if (hasMixer) {
          COLOR_MIXER_CHANNELS.forEach((channel, index) => {
            const item = a.hsl[channel], weight = 1 - clamp(this.hueDistance(h, centers[index]) / 45, 0, 1);
            h += item.hue * .45 * weight; s = clamp(s + item.saturation / 100 * weight, 0, 1); l = clamp(l + item.luminance / 200 * weight, 0, 1);
          });
        }
        if (hasPointColor) {
          const weight = 1 - smoothstep(a.pointColor.range * .45, a.pointColor.range, this.hueDistance(h, a.pointColor.targetHue));
          h += a.pointColor.hue * .45 * weight; s = clamp(s + a.pointColor.saturation / 100 * weight, 0, 1); l = clamp(l + a.pointColor.luminance / 200 * weight, 0, 1);
        }
        [nr, ng, nb] = this.hslToRgb(h, a.blackAndWhite ? 0 : s, l);
      }
      if (hasCurve) {
        lum = clamp(.2126 * nr + .7152 * ng + .0722 * nb);
        const ratio = lum > 0 ? lut[Math.round(lum)] / lum : 1;
        nr *= ratio; ng *= ratio; nb *= ratio;
      }
      if (a.vignette) {
        const pixel = i / 4, x = pixel % width, y = Math.floor(pixel / width);
        const dx = (x - width / 2) / (width / 2), dy = (y - height / 2) / (height / 2);
        const gain = 1 - a.vignette / 100 * .75 * smoothstep(.25, 1.15, Math.sqrt(dx * dx + dy * dy));
        nr *= gain; ng *= gain; nb *= gain;
      }
      out[i] = Math.round(r + (clamp(nr) - r) * maskWeight);
      out[i + 1] = Math.round(g + (clamp(ng) - g) * maskWeight);
      out[i + 2] = Math.round(b + (clamp(nb) - b) * maskWeight);
      out[i + 3] = alpha;
    }
    tCtx.putImageData(image, 0, 0);
  }
}
