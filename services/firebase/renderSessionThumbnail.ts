import type { CanvasNodeData } from '../../src/features/ai-rendering-canvas/types/graph';

// Composes up to four of a session's newest renders into one thumbnail, on the dark
// render-canvas background. Async because restored sessions hold https image URLs.

const WIDTH = 480;
const HEIGHT = 300;
const GUTTER = 2;
const BACKGROUND = '#0f172a';

const pickImages = (nodes: CanvasNodeData[]): string[] => {
  const urls = (nodes || [])
    .filter(node => node.status === 'completed' || node.imageUrl)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map(node => node.outputs?.[node.activeVariantIndex || 0]?.url || node.outputs?.[0]?.url || node.imageUrl)
    .filter((url): url is string => !!url);
  return [...new Set(urls)].slice(0, 4);
};

const loadImage = (url: string): Promise<HTMLImageElement | null> => new Promise(resolve => {
  const image = new Image();
  if (!url.startsWith('data:')) image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = () => resolve(null);
  image.src = url;
});

// Cover-fit one image into a cell.
const drawCover = (ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, w: number, h: number) => {
  const scale = Math.max(w / image.width, h / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(image, x + (w - drawWidth) / 2, y + (h - drawHeight) / 2, drawWidth, drawHeight);
  ctx.restore();
};

const cellsFor = (count: number): Array<[number, number, number, number]> => {
  const halfW = (WIDTH - GUTTER) / 2;
  const halfH = (HEIGHT - GUTTER) / 2;
  if (count <= 1) return [[0, 0, WIDTH, HEIGHT]];
  if (count === 2) return [[0, 0, halfW, HEIGHT], [halfW + GUTTER, 0, halfW, HEIGHT]];
  if (count === 3) return [[0, 0, halfW, HEIGHT], [halfW + GUTTER, 0, halfW, halfH], [halfW + GUTTER, halfH + GUTTER, halfW, halfH]];
  return [
    [0, 0, halfW, halfH], [halfW + GUTTER, 0, halfW, halfH],
    [0, halfH + GUTTER, halfW, halfH], [halfW + GUTTER, halfH + GUTTER, halfW, halfH],
  ];
};

// Returns a JPEG data URL, or null when nothing could be drawn (the caller then keeps the old thumbnail).
export const renderSessionThumbnail = async (nodes: CanvasNodeData[]): Promise<string | null> => {
  if (typeof document === 'undefined') return null;
  try {
    const urls = pickImages(nodes);
    const images = (await Promise.all(urls.map(loadImage))).filter((img): img is HTMLImageElement => !!img);
    if (images.length === 0) return null;

    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const cells = cellsFor(images.length);
    images.forEach((image, index) => {
      const cell = cells[index];
      if (cell) drawCover(ctx, image, ...cell);
    });
    return canvas.toDataURL('image/jpeg', 0.8);
  } catch (error) {
    // Tainted canvas (a cross-origin image without CORS) or any other failure: keep the previous thumbnail.
    console.warn('[Render session] Thumbnail could not be composed:', error);
    return null;
  }
};
