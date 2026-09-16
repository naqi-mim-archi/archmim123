import type { Point } from '../../../../types';
import type { GeneratedData } from '../../types';
import { generateFloorplanImage4g } from '../../../../services/imageGenService4g';
import {
  classifyText4gRasterGeometry,
  extractGeometryFromLocalImage,
} from '../../../../services/localImageToJSON4g';
import { warmLocalFloorplanOcr4g } from '../../../../services/localFloorplanOcr4g';
import type { ConfirmedText4gBrief } from '../../../../services/text4gBrief';
import { text4gBriefToDesignSummary } from '../../../../services/text4gBrief';
import { buildText4gFallbackGeometry } from '../../../../services/text4gFallbackGeometry';
import { annotateText4gGeneratedImageRooms } from '../../../../services/text4gGeneratedImageRoomLabels';
import {
  isText4gMasterFloorplanDataUsable,
  transcribeText4gMasterFloorplanData,
  type Text4gMasterFloorplanSourceKind,
} from '../../../../services/text4gMasterFloorplanData';
import { resolveText4gWallPreset } from '../../../../services/text4gPresetResolver';
export { refineDesignRequirements4g } from '../../../../services/chatService4g';
export { completeText4gGeometry } from './geometry';

export interface Text4gImageConversionOptions {
  workflowStartedAt?: number;
  warmOcr?: boolean;
  annotateGeneratedPreview?: boolean;
  requestedExtentsMeters?: { width?: number; depth?: number };
  preventFallbackForCurvilinearGenerated?: boolean;
  sourceKind?: Text4gMasterFloorplanSourceKind;
  useMasterFloorplanData?: boolean;
  /** Emits a raster-only, import-locked preview while local OCR continues. */
  onGeometryReady?: (geometry: GeneratedData) => void;
}

const text4gBriefRequestsCurvilinearGeometry = (brief: ConfirmedText4gBrief): boolean => {
  const text = [
    brief.project.purpose,
    brief.project.type,
    brief.project.variant || '',
    brief.planningStyle,
    ...brief.adjacency.map(rule => rule.description),
  ].join(' ');
  return /\b(?:circular|circle|round|radial|curved|curvilinear|arc|elliptic|elliptical|ellipse|organic|semi[-\s]?circular)\b/i.test(text);
};

const buildText4gImageOnlyFailureGeometry = (
  base64Image: string,
  confirmedBrief: ConfirmedText4gBrief,
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

const classifyText4gBase64Geometry = async (base64Image: string): Promise<'orthogonal' | 'angular' | 'curved' | 'hybrid'> => {
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
        resolve(classifyText4gRasterGeometry(ctx.getImageData(0, 0, width, height)));
      } catch {
        resolve('orthogonal');
      }
    };
    img.onerror = () => resolve('orthogonal');
    img.src = base64Image;
  });
};

export async function convertFloorplanImage4g(
  base64Image: string,
  confirmedBrief: ConfirmedText4gBrief,
  requestedBoundary?: Point[],
  options: Text4gImageConversionOptions = {},
): Promise<GeneratedData> {
  const workflowStartedAt = options.workflowStartedAt ?? Date.now();
  const designSummary = text4gBriefToDesignSummary(confirmedBrief);
  const exteriorWallThicknessMeters = resolveText4gWallPreset({
    semanticRole: 'exterior',
    projectClass: [confirmedBrief.project.category, confirmedBrief.project.type, confirmedBrief.project.purpose].filter(Boolean).join(' '),
    evidenceStrength: 'none',
  }).resolvedValues.thicknessM ?? 0.23;

  // Direct uploads have no Gemini wait during which the cached worker can
  // warm. This remains best-effort and does not change the extractor itself.
  if (options.warmOcr !== false) void warmLocalFloorplanOcr4g();

  const sourceKind = options.sourceKind || 'uploaded';
  if (options.useMasterFloorplanData !== false) {
    console.log('[Text 4.0 G] Step 2: Transcribing master floorplan data');
    const transcriptStartedAt = Date.now();
    try {
      const rasterMode = await classifyText4gBase64Geometry(base64Image);
      const masterGeometry = await transcribeText4gMasterFloorplanData({
        imageBase64: base64Image,
        brief: confirmedBrief,
        requestedBoundary,
        requestedExtentsMeters: options.requestedExtentsMeters,
        sourceKind,
        // This classifier contributes only a coarse model-routing hint; none
        // of its wall coordinates or extracted geometry enter Gemini Master.
        preferHighAccuracy: rasterMode !== 'orthogonal' || text4gBriefRequestsCurvilinearGeometry(confirmedBrief),
      });
      if (isText4gMasterFloorplanDataUsable(masterGeometry)) {
        console.log(`[Text 4.0 G] Master floorplan data accepted in ${Date.now() - transcriptStartedAt}ms; total workflow ${Date.now() - workflowStartedAt}ms`);
        masterGeometry.sourceImageBase64 = base64Image;
        return masterGeometry;
      }
      console.warn('[Text 4.0 G] Master floorplan data was too weak; continuing with local image-to-JSON fallback.');
    } catch (error) {
      console.warn('[Text 4.0 G] Master floorplan data unavailable; continuing with local image-to-JSON fallback.', error);
    }
  }

  console.log('[Text 4.0 G] Step 2 fallback: Extracting Geometry Locally');
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
      ? await classifyText4gBase64Geometry(base64Image)
      : 'orthogonal';
    const shouldPreventCurvilinearFallback = options.preventFallbackForCurvilinearGenerated
      && (text4gBriefRequestsCurvilinearGeometry(confirmedBrief) || rasterMode === 'curved' || rasterMode === 'hybrid');
    if (shouldPreventCurvilinearFallback) {
      console.warn(`[Text 4.0 G] ${rasterMode} image tracing failed after mature extraction; preserving raster without rectangular fallback geometry.`, error);
      rawGeometry = buildText4gImageOnlyFailureGeometry(base64Image, confirmedBrief, error);
      if (rawGeometry.extractionDiagnostics?.warnings) {
        rawGeometry.extractionDiagnostics.warnings = [
          ...rawGeometry.extractionDiagnostics.warnings,
          `Full curvilinear/hybrid extraction reported: ${error instanceof Error ? error.message : String(error || 'unknown raster topology')}`,
        ];
      }
    } else {
      console.warn('[Text 4.0 G] Local image tracing failed; preserving the image with deterministic fallback geometry.', error);
      rawGeometry = buildText4gFallbackGeometry(confirmedBrief, requestedBoundary, error);
    }
  }
  console.log(`[Text 4.0 G] Local extraction completed in ${Date.now() - extractionStartedAt}ms; total workflow ${Date.now() - workflowStartedAt}ms`);

  let previewImage = base64Image;
  if (options.annotateGeneratedPreview) {
    // Generated-image labels remain presentation-only and are deliberately not
    // applied to uploads, preserving the exact raster under conversion test.
    try {
      previewImage = await annotateText4gGeneratedImageRooms(base64Image, rawGeometry, confirmedBrief);
    } catch (error) {
      console.warn('[Text 4.0 G] Deterministic room-dimension annotation was unavailable; preserving the generated image.', error);
    }
  }
  rawGeometry.sourceImageBase64 = previewImage;
  return rawGeometry;
}

export async function generateFloorplan4g(
  confirmedBrief: ConfirmedText4gBrief,
  requestedBoundary?: Point[],
  options: Pick<Text4gImageConversionOptions, 'onGeometryReady'> = {},
): Promise<GeneratedData> {
  const workflowStartedAt = Date.now();

  // Warm the cached local OCR worker while Vertex renders the image. This is
  // best-effort and never delays or prevents the image-generation request.
  void warmLocalFloorplanOcr4g();

  // 1. Generate the source image using the confirmed canonical brief.
  console.log('[Text 4.0 G] Step 1: Generating Image');
  const base64Image = await generateFloorplanImage4g(confirmedBrief);
  return convertFloorplanImage4g(base64Image, confirmedBrief, requestedBoundary, {
    workflowStartedAt,
    warmOcr: false,
    annotateGeneratedPreview: false,
    preventFallbackForCurvilinearGenerated: true,
    sourceKind: 'generated',
    useMasterFloorplanData: true,
    onGeometryReady: options.onGeometryReady,
  });
}
