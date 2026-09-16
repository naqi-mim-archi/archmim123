import type { Point } from '../../../../types';
import type { GeneratedData } from '../../types';
import { generateFloorplanImage4d } from '../../../../services/imageGenService4d';
import { extractGeometryFromLocalImage } from '../../../../services/localImageToJSON4d';
import { warmLocalFloorplanOcr4d } from '../../../../services/localFloorplanOcr4d';
import type { ConfirmedText4dBrief } from '../../../../services/text4dBrief';
import { text4dBriefToDesignSummary } from '../../../../services/text4dBrief';
import { buildText4dFallbackGeometry } from '../../../../services/text4dFallbackGeometry';
import { annotateText4dGeneratedImageRooms } from '../../../../services/text4dGeneratedImageRoomLabels';
import { resolveText4dWallPreset } from '../../../../services/text4dPresetResolver';
export { refineDesignRequirements4d } from '../../../../services/chatService4d';
export { completeText4dGeometry } from './geometry';

export interface Text4dImageConversionOptions {
  workflowStartedAt?: number;
  warmOcr?: boolean;
  annotateGeneratedPreview?: boolean;
  requestedExtentsMeters?: { width?: number; depth?: number };
  /** Emits a raster-only, import-locked preview while local OCR continues. */
  onGeometryReady?: (geometry: GeneratedData) => void;
}

export async function convertFloorplanImage4d(
  base64Image: string,
  confirmedBrief: ConfirmedText4dBrief,
  requestedBoundary?: Point[],
  options: Text4dImageConversionOptions = {},
): Promise<GeneratedData> {
  const workflowStartedAt = options.workflowStartedAt ?? Date.now();
  const designSummary = text4dBriefToDesignSummary(confirmedBrief);
  const exteriorWallThicknessMeters = resolveText4dWallPreset({
    semanticRole: 'exterior',
    projectClass: [confirmedBrief.project.category, confirmedBrief.project.type, confirmedBrief.project.purpose].filter(Boolean).join(' '),
    evidenceStrength: 'none',
  }).resolvedValues.thicknessM ?? 0.23;

  // Direct uploads have no Gemini wait during which the cached worker can
  // warm. This remains best-effort and does not change the extractor itself.
  if (options.warmOcr !== false) void warmLocalFloorplanOcr4d();

  console.log('[Text 4.0 D] Step 2: Extracting Geometry Locally');
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
    console.warn('[Text 4.0 D] Local image tracing failed; preserving the image with deterministic fallback geometry.', error);
    rawGeometry = buildText4dFallbackGeometry(confirmedBrief, requestedBoundary, error);
  }
  console.log(`[Text 4.0 D] Local extraction completed in ${Date.now() - extractionStartedAt}ms; total workflow ${Date.now() - workflowStartedAt}ms`);

  let previewImage = base64Image;
  if (options.annotateGeneratedPreview) {
    // Generated-image labels remain presentation-only and are deliberately not
    // applied to uploads, preserving the exact raster under conversion test.
    try {
      previewImage = await annotateText4dGeneratedImageRooms(base64Image, rawGeometry, confirmedBrief);
    } catch (error) {
      console.warn('[Text 4.0 D] Deterministic room-dimension annotation was unavailable; preserving the generated image.', error);
    }
  }
  rawGeometry.sourceImageBase64 = previewImage;
  return rawGeometry;
}

export async function generateFloorplan4d(
  confirmedBrief: ConfirmedText4dBrief,
  requestedBoundary?: Point[],
  options: Pick<Text4dImageConversionOptions, 'onGeometryReady'> = {},
): Promise<GeneratedData> {
  const workflowStartedAt = Date.now();

  // Warm the cached local OCR worker while Vertex renders the image. This is
  // best-effort and never delays or prevents the image-generation request.
  void warmLocalFloorplanOcr4d();

  // 1. Generate the source image using the confirmed canonical brief.
  console.log('[Text 4.0 D] Step 1: Generating Image');
  const base64Image = await generateFloorplanImage4d(confirmedBrief);
  return convertFloorplanImage4d(base64Image, confirmedBrief, requestedBoundary, {
    workflowStartedAt,
    warmOcr: false,
    annotateGeneratedPreview: false,
    onGeometryReady: options.onGeometryReady,
  });
}
