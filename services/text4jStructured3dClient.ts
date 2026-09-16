export interface Text4jStructuredPixelPoint {
  x: number;
  y: number;
}

export interface Text4jStructuredWallCandidate {
  id: string;
  p1: Text4jStructuredPixelPoint;
  p2: Text4jStructuredPixelPoint;
  confidence: number;
  planeId?: number;
  lineId?: number;
}

export interface Text4jStructuredGeometry {
  sourceWidth: number;
  sourceHeight: number;
  processingMs: number;
  jobId: string;
  walls: Text4jStructuredWallCandidate[];
  candidateJson: unknown;
}

interface StructuredApiResponse {
  success?: boolean;
  error?: string;
  jobId?: string;
  processingMs?: number;
  sourceImage?: { width?: number; height?: number };
  archaiCandidateData?: {
    elements?: Array<{
      id?: string;
      type?: string;
      digitizationConfidence?: number;
      metadata?: {
        structured3d?: {
          planeId?: number;
          lineId?: number;
          sourcePixelP1?: Text4jStructuredPixelPoint;
          sourcePixelP2?: Text4jStructuredPixelPoint;
        };
      };
    }>;
  };
}

const finitePoint = (value: unknown): value is Text4jStructuredPixelPoint => {
  const point = value as Text4jStructuredPixelPoint | undefined;
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
};

export const requestText4jStructuredGeometry = async (
  imageBase64: string,
): Promise<Text4jStructuredGeometry> => {
  const response = await fetch('/api/text4j/structured3d/convert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64 }),
  });
  const payload = await response.json() as StructuredApiResponse;
  if (!response.ok || !payload.success) {
    throw new Error(payload.error || `Structured3D conversion failed with HTTP ${response.status}.`);
  }

  const sourceWidth = Number(payload.sourceImage?.width);
  const sourceHeight = Number(payload.sourceImage?.height);
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) {
    throw new Error('Structured3D did not return the source image dimensions required for J geometry alignment.');
  }

  const walls = (payload.archaiCandidateData?.elements || []).flatMap((element, index) => {
    if (element.type !== 'wall') return [];
    const source = element.metadata?.structured3d;
    if (!finitePoint(source?.sourcePixelP1) || !finitePoint(source?.sourcePixelP2)) return [];
    const length = Math.hypot(
      source.sourcePixelP2.x - source.sourcePixelP1.x,
      source.sourcePixelP2.y - source.sourcePixelP1.y,
    );
    if (length < 2) return [];
    return [{
      id: element.id || `structured-wall-${index + 1}`,
      p1: source.sourcePixelP1,
      p2: source.sourcePixelP2,
      confidence: Number.isFinite(element.digitizationConfidence)
        ? Math.max(0, Math.min(1, Number(element.digitizationConfidence)))
        : 0.8,
      planeId: source.planeId,
      lineId: source.lineId,
    }];
  });

  if (walls.length < 3) {
    throw new Error(`Structured3D returned only ${walls.length} usable wall candidates; J requires a primary geometry network.`);
  }

  return {
    sourceWidth,
    sourceHeight,
    processingMs: Number(payload.processingMs) || 0,
    jobId: payload.jobId || '',
    walls,
    candidateJson: payload.archaiCandidateData,
  };
};
