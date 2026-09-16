const splitImageDataUrl = (imageDataUrl: string) => {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageDataUrl);
  if (!match) return { mimeType: 'image/jpeg', imageBytes: imageDataUrl };
  return { mimeType: match[1], imageBytes: match[2] };
};

export interface AutoScanRedrawDimensions {
  unitSystem: 'imperial' | 'metric';
  width?: number;
  depth?: number;
  area?: number;
}

export const redrawAutoScanFloorplan = async (
  sourceImageDataUrl: string,
  dimensions: AutoScanRedrawDimensions,
): Promise<string> => {
  const source = splitImageDataUrl(sourceImageDataUrl);
  const response = await fetch('/api/text4h/image-redraw', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBytes: source.imageBytes,
      mimeType: source.mimeType,
      dimensions,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`AutoScan redraw failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (!data.imageBytes) throw new Error('AutoScan redraw returned no image.');
  return `data:${data.mimeType || 'image/jpeg'};base64,${data.imageBytes}`;
};
