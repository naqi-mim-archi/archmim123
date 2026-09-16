import type { Point } from '../../../../types';
import type { GeneratedData } from '../../types';
import { generateFloorplanImage4e } from '../../../../services/imageGenService4e';
import { extractGeometryFromLocalImage } from '../../../../services/localImageToJSON4e';
import { warmLocalFloorplanOcr4e } from '../../../../services/localFloorplanOcr4e';
import type { ConfirmedText4eBrief } from '../../../../services/text4eBrief';
import { text4eBriefToDesignSummary } from '../../../../services/text4eBrief';
import { buildText4eFallbackGeometry } from '../../../../services/text4eFallbackGeometry';
import { annotateText4eGeneratedImageRooms } from '../../../../services/text4eGeneratedImageRoomLabels';
import { resolveText4eWallPreset } from '../../../../services/text4ePresetResolver';
export { refineDesignRequirements4e } from '../../../../services/chatService4e';
export { completeText4eGeometry } from './geometry';

export interface Text4eImageConversionOptions {
  workflowStartedAt?: number;
  warmOcr?: boolean;
  annotateGeneratedPreview?: boolean;
  requestedExtentsMeters?: { width?: number; depth?: number };
  /** Emits a raster-only, import-locked preview while local OCR continues. */
  onGeometryReady?: (geometry: GeneratedData) => void;
}

export async function convertFloorplanImage4e(
  base64Image: string,
  confirmedBrief: ConfirmedText4eBrief,
  requestedBoundary?: Point[],
  options: Text4eImageConversionOptions = {},
): Promise<GeneratedData> {
  const workflowStartedAt = options.workflowStartedAt ?? Date.now();
  const designSummary = text4eBriefToDesignSummary(confirmedBrief);
  const exteriorWallThicknessMeters = resolveText4eWallPreset({
    semanticRole: 'exterior',
    projectClass: [confirmedBrief.project.category, confirmedBrief.project.type, confirmedBrief.project.purpose].filter(Boolean).join(' '),
    evidenceStrength: 'none',
  }).resolvedValues.thicknessM ?? 0.23;

  // Direct uploads have no Gemini wait during which the cached worker can
  // warm. This remains best-effort and does not change the extractor itself.
  if (options.warmOcr !== false) void warmLocalFloorplanOcr4e();

  console.log('[Text 4.0 E] Step 2: Extracting Geometry Locally');
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
    console.warn('[Text 4.0 E] Local image tracing failed; preserving the image with deterministic fallback geometry.', error);
    rawGeometry = buildText4eFallbackGeometry(confirmedBrief, requestedBoundary, error);
  }
  console.log(`[Text 4.0 E] Local extraction completed in ${Date.now() - extractionStartedAt}ms; total workflow ${Date.now() - workflowStartedAt}ms`);

  let previewImage = base64Image;
  if (options.annotateGeneratedPreview) {
    // Generated-image labels remain presentation-only and are deliberately not
    // applied to uploads, preserving the exact raster under conversion test.
    try {
      previewImage = await annotateText4eGeneratedImageRooms(base64Image, rawGeometry, confirmedBrief);
    } catch (error) {
      console.warn('[Text 4.0 E] Deterministic room-dimension annotation was unavailable; preserving the generated image.', error);
    }
  }
  rawGeometry.sourceImageBase64 = previewImage;
  return rawGeometry;
}

export async function generateFloorplan4e(
  confirmedBrief: ConfirmedText4eBrief,
  requestedBoundary?: Point[],
  options: Pick<Text4eImageConversionOptions, 'onGeometryReady'> = {},
): Promise<GeneratedData> {
  const workflowStartedAt = Date.now();

  // Warm the cached local OCR worker while Vertex renders the image. This is
  // best-effort and never delays or prevents the image-generation request.
  void warmLocalFloorplanOcr4e();

  // 1. Generate the source image using the confirmed canonical brief.
  console.log('[Text 4.0 E] Step 1: Generating Image');
  const base64Image = await generateFloorplanImage4e(confirmedBrief);
  return convertFloorplanImage4e(base64Image, confirmedBrief, requestedBoundary, {
    workflowStartedAt,
    warmOcr: false,
    annotateGeneratedPreview: false,
    onGeometryReady: options.onGeometryReady,
  });
}
