import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface ImportedPlaceItem {
  name: string;
  canvas: HTMLCanvasElement;
  dataUrl: string;
}

export class PlaceImportEngine {
  static supports(file: File): boolean {
    return file.type.startsWith('image/') || file.type === 'application/pdf' || /\.(png|jpe?g|webp|avif|gif|pdf)$/i.test(file.name);
  }

  static async decode(file: File): Promise<ImportedPlaceItem> {
    if (!this.supports(file)) throw new Error('Use a JPG, PNG, WEBP, AVIF, GIF, or PDF file.');
    if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) return this.decodePdf(file);
    return this.decodeImage(file);
  }

  private static async decodeImage(file: File): Promise<ImportedPlaceItem> {
    const url = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('The image could not be decoded.'));
        element.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;
      canvas.getContext('2d')?.drawImage(image, 0, 0);
      return { name: file.name, canvas, dataUrl: canvas.toDataURL('image/png') };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private static async decodePdf(file: File): Promise<ImportedPlaceItem> {
    const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const page = await document.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(2, 2048 / Math.max(baseViewport.width, baseViewport.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PDF rendering is unavailable.');
    await page.render({ canvasContext: context, viewport, canvas }).promise;
    return { name: `${file.name} (Page 1)`, canvas, dataUrl: canvas.toDataURL('image/png') };
  }
}
