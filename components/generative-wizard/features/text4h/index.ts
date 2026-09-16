import type { Point } from '../../../../types';
import type { GeneratedData } from '../../types';
import { generateFloorplanImage4h } from '../../../../services/imageGenService4h';
import {
  classifyText4hRasterGeometry,
  extractGeometryFromLocalImage,
} from '../../../../services/localImageToJSON4h';
import { warmLocalFloorplanOcr4h } from '../../../../services/localFloorplanOcr4h';
import type { ConfirmedText4hBrief } from '../../../../services/text4hBrief';
import { text4hBriefToDesignSummary } from '../../../../services/text4hBrief';
import { buildText4hFallbackGeometry } from '../../../../services/text4hFallbackGeometry';
import { annotateText4hGeneratedImageRooms } from '../../../../services/text4hGeneratedImageRoomLabels';
import {
  isText4hMasterFloorplanDataUsable,
  transcribeText4hMasterFloorplanData,
  type Text4hMasterFloorplanSourceKind,
} from '../../../../services/text4hMasterFloorplanData';
import { resolveText4hWallPreset } from '../../../../services/text4hPresetResolver';
export { refineDesignRequirements4h } from '../../../../services/chatService4h';
export { completeText4hGeometry } from './geometry';

export interface Text4hImageConversionOptions {
  workflowStartedAt?: number;
  warmOcr?: boolean;
  annotateGeneratedPreview?: boolean;
  requestedExtentsMeters?: { width?: number; depth?: number };
  preventFallbackForCurvilinearGenerated?: boolean;
  sourceKind?: Text4hMasterFloorplanSourceKind;
  useMasterFloorplanData?: boolean;
  /** Emits a raster-only, import-locked preview while local OCR continues. */
  onGeometryReady?: (geometry: GeneratedData) => void;
}

const text4hBriefRequestsCurvilinearGeometry = (brief: ConfirmedText4hBrief): boolean => {
  const text = [
    brief.project.purpose,
    brief.project.type,
    brief.project.variant || '',
    brief.planningStyle,
    ...brief.adjacency.map(rule => rule.description),
  ].join(' ');
  return /\b(?:circular|circle|round|radial|curved|curvilinear|arc|elliptic|elliptical|ellipse|organic|semi[-\s]?circular)\b/i.test(text);
};

const buildText4hImageOnlyFailureGeometry = (
  base64Image: string,
  confirmedBrief: ConfirmedText4hBrief,
  error: unknown,
): GeneratedData => {
  const reason = error instanceof Error ? error.message : String(error || 'unknown raster topology');
  const requestedRoomLabels = confirmedBrief.rooms.reduce((sum, room) => sum + Math.max(1, room.count), 0);
  return {
    boundary: [],
    walls: [],
    doors: [],
    windows: [],
    openings: [],
    rooms: [],
    columns: [],
    stairs: [],
    slabs: [],
    railings: [],
    furniture: [],
    fixtures: [],
    sourceImageBase64: base64Image,
    extractionDiagnostics: {
      confidence: 'low',
      canImport: false,
      scaleSource: 'requested-boundary',
      warnings: [
        `Curvilinear generated image was preserved without deterministic rectangular fallback because local tracing reported: ${reason}`,
      ],
      detectedRoomLabels: 0,
      requestedRoomLabels,
    },
  };
};

const classifyText4hBase64Heometry = async (base64Image: string): Promise<'orthogonal' | 'angular' | 'curved' | 'hybrid'> => {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return 'orthogonal';
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxDimension = 1200;
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve('orthogonal');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(classifyText4hRasterGeometry(ctx.getImageData(0, 0, width, height)));
      } catch {
        resolve('orthogonal');
      }
    };
    img.onerror = () => resolve('orthogonal');
    img.src = base64Image;
  });
};

export async function convertFloorplanImage4h(
  base64Image: string,
  confirmedBrief: ConfirmedText4hBrief,
  requestedBoundary?: Point[],
  options: Text4hImageConversionOptions = {},
): Promise<GeneratedData> {
  const workflowStartedAt = options.workflowStartedAt ?? Date.now();
  const designSummary = text4hBriefToDesignSummary(confirmedBrief);
  const exteriorWallThicknessMeters = resolveText4hWallPreset({
    semanticRole: 'exterior',
    projectClass: [confirmedBrief.project.category, confirmedBrief.project.type, confirmedBrief.project.purpose].filter(Boolean).join(' '),
    evidenceStrength: 'none',
  }).resolvedValues.thicknessM ?? 0.23;

  // Direct uploads have no Gemini wait during which the cached worker can
  // warm. This remains best-effort and does not change the extractor itself.
  if (options.warmOcr !== false) void warmLocalFloorplanOcr4h();

  const sourceKind = options.sourceKind || 'uploaded';
  if (options.useMasterFloorplanData !== false) {
    console.log('[Text 4.0 H] Step 2: Transcribing master floorplan data');
    const transcriptStartedAt = Date.now();
    try {
      const rasterMode = await classifyText4hBase64Heometry(base64Image);
      const masterGeometry = await transcribeText4hMasterFloorplanData({
        imageBase64: base64Image,
        brief: confirmedBrief,
        requestedBoundary,
        requestedExtentsMeters: options.requestedExtentsMeters,
        sourceKind,
        // This classifier contributes only a coarse model-routing hint; none
        // of its wall coordinates or extracted geometry enter Gemini Master.
        preferHighAccuracy: rasterMode !== 'orthogonal' || text4hBriefRequestsCurvilinearGeometry(confirmedBrief),
      });
      if (isText4hMasterFloorplanDataUsable(masterGeometry)) {
        console.log(`[Text 4.0 H] Master floorplan data accepted in ${Date.now() - transcriptStartedAt}ms; total workflow ${Date.now() - workflowStartedAt}ms`);
        masterGeometry.sourceImageBase64 = base64Image;
        return masterGeometry;
      }
      console.warn('[Text 4.0 H] Master floorplan data was too weak; continuing with local image-to-JSON fallback.');
    } catch (error) {
      console.warn('[Text 4.0 H] Master floorplan data unavailable; continuing with local image-to-JSON fallback.', error);
    }
  }

  console.log('[Text 4.0 H] Step 2 fallback: Extracting Geometry Locally');
  const extractionStartedAt = Date.now();
  let rawGeometry: GeneratedData;
  try {
    rawGeometry = await extractGeometryFromLocalImage(base64Image, {
      requestedBoundary,
      requestedWidthMeters: options.requestedExtentsMeters?.width,
      requestedDepthMeters: options.requestedExtentsMeters?.depth,
      designSummary,
      enforceRequestedEnvelope: true,
      exteriorWallThicknessMeters,
      // The raster-only callback makes the plan visible immediately. The final
      // result now waits for OCR instead of discarding labels at a 900ms cutoff.
      awaitOcrCompletion: true,
      onGeometryReady: options.onGeometryReady
        ? provisional => {
            provisional.sourceImageBase64 = base64Image;
            options.onGeometryReady?.(provisional);
          }
        : undefined,
    });
  } catch (error) {
    const rasterMode = options.preventFallbackForCurvilinearGenerated
      ? await classifyText4hBase64Heometry(base64Image)
      : 'orthogonal';
    const shouldPreventCurvilinearFallback = options.preventFallbackForCurvilinearGenerated
      && (text4hBriefRequestsCurvilinearGeometry(confirmedBrief) || rasterMode === 'curved' || rasterMode === 'hybrid');
    if (shouldPreventCurvilinearFallback) {
      console.warn(`[Text 4.0 H] ${rasterMode} image tracing failed after mature extraction; preserving raster without rectangular fallback geometry.`, error);
      rawGeometry = buildText4hImageOnlyFailureGeometry(base64Image, confirmedBrief, error);
      if (rawGeometry.extractionDiagnostics?.warnings) {
        rawGeometry.extractionDiagnostics.warnings = [
          ...rawGeometry.extractionDiagnostics.warnings,
          `Full curvilinear/hybrid extraction reported: ${error instanceof Error ? error.message : String(error || 'unknown raster topology')}`,
        ];
      }
    } else {
      console.warn('[Text 4.0 H] Local image tracing failed; preserving the image with deterministic fallback geometry.', error);
      rawGeometry = buildText4hFallbackGeometry(confirmedBrief, requestedBoundary, error);
    }
  }
  console.log(`[Text 4.0 H] Local extraction completed in ${Date.now() - extractionStartedAt}ms; total workflow ${Date.now() - workflowStartedAt}ms`);

  let previewImage = base64Image;
  if (options.annotateGeneratedPreview) {
    // Generated-image labels remain presentation-only and are deliberately not
    // applied to uploads, preserving the exact raster under conversion test.
    try {
      previewImage = await annotateText4hGeneratedImageRooms(base64Image, rawGeometry, confirmedBrief);
    } catch (error) {
      console.warn('[Text 4.0 H] Deterministic room-dimension annotation was unavailable; preserving the generated image.', error);
    }
  }
  rawGeometry.sourceImageBase64 = previewImage;
  return rawGeometry;
}

export async function generateFloorplan4h(
  confirmedBrief: ConfirmedText4hBrief,
  requestedBoundary?: Point[],
  options: Pick<Text4hImageConversionOptions, 'onGeometryReady'> = {},
): Promise<GeneratedData> {
  const workflowStartedAt = Date.now();

  // Warm the cached local OCR worker while Vertex renders the image. This is
  // best-effort and never delays or prevents the image-generation request.
  void warmLocalFloorplanOcr4h();

  // 1. Generate the source image using the confirmed canonical brief.
  console.log('[Text 4.0 H] Step 1: Generating Image');
  const base64Image = await generateFloorplanImage4h(confirmedBrief);
  return convertFloorplanImage4h(base64Image, confirmedBrief, requestedBoundary, {
    workflowStartedAt,
    warmOcr: false,
    annotateGeneratedPreview: false,
    preventFallbackForCurvilinearGenerated: true,
    sourceKind: 'generated',
    useMasterFloorplanData: true,
    onGeometryReady: options.onGeometryReady,
  });
}
