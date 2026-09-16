import type { Point } from '../../../../types';
import type { GeneratedData } from '../../types';
import { generateFloorplanImage4f } from '../../../../services/imageGenService4f';
import { extractGeometryFromLocalImage } from '../../../../services/localImageToJSON4f';
import { warmLocalFloorplanOcr4f } from '../../../../services/localFloorplanOcr4f';
import type { ConfirmedText4fBrief } from '../../../../services/text4fBrief';
import { text4fBriefToDesignSummary } from '../../../../services/text4fBrief';
import { buildText4fFallbackGeometry } from '../../../../services/text4fFallbackGeometry';
import { annotateText4fGeneratedImageRooms } from '../../../../services/text4fGeneratedImageRoomLabels';
import { resolveText4fWallPreset } from '../../../../services/text4fPresetResolver';
export { refineDesignRequirements4f } from '../../../../services/chatService4f';
export { completeText4fGeometry } from './geometry';

export interface Text4fImageConversionOptions {
  workflowStartedAt?: number;
  warmOcr?: boolean;
  annotateGeneratedPreview?: boolean;
  requestedExtentsMeters?: { width?: number; depth?: number };
  /** Emits a raster-only, import-locked preview while local OCR continues. */
  onGeometryReady?: (geometry: GeneratedData) => void;
}

export async function convertFloorplanImage4f(
  base64Image: string,
  confirmedBrief: ConfirmedText4fBrief,
  requestedBoundary?: Point[],
  options: Text4fImageConversionOptions = {},
): Promise<GeneratedData> {
  const workflowStartedAt = options.workflowStartedAt ?? Date.now();
  const designSummary = text4fBriefToDesignSummary(confirmedBrief);
  const exteriorWallThicknessMeters = resolveText4fWallPreset({
    semanticRole: 'exterior',
    projectClass: [confirmedBrief.project.category, confirmedBrief.project.type, confirmedBrief.project.purpose].filter(Boolean).join(' '),
    evidenceStrength: 'none',
  }).resolvedValues.thicknessM ?? 0.23;

  // Direct uploads have no Gemini wait during which the cached worker can
  // warm. This remains best-effort and does not change the extractor itself.
  if (options.warmOcr !== false) void warmLocalFloorplanOcr4f();

  console.log('[Text 4.0 F] Step 2: Extracting Geometry Locally');
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
    console.warn('[Text 4.0 F] Local image tracing failed; preserving the image with deterministic fallback geometry.', error);
    rawGeometry = buildText4fFallbackGeometry(confirmedBrief, requestedBoundary, error);
  }
  console.log(`[Text 4.0 F] Local extraction completed in ${Date.now() - extractionStartedAt}ms; total workflow ${Date.now() - workflowStartedAt}ms`);

  let previewImage = base64Image;
  if (options.annotateGeneratedPreview) {
    // Generated-image labels remain presentation-only and are deliberately not
    // applied to uploads, preserving the exact raster under conversion test.
    try {
      previewImage = await annotateText4fGeneratedImageRooms(base64Image, rawGeometry, confirmedBrief);
    } catch (error) {
      console.warn('[Text 4.0 F] Deterministic room-dimension annotation was unavailable; preserving the generated image.', error);
    }
  }
  rawGeometry.sourceImageBase64 = previewImage;
  return rawGeometry;
}

export async function generateFloorplan4f(
  confirmedBrief: ConfirmedText4fBrief,
  requestedBoundary?: Point[],
  options: Pick<Text4fImageConversionOptions, 'onGeometryReady'> = {},
): Promise<GeneratedData> {
  const workflowStartedAt = Date.now();

  // Warm the cached local OCR worker while Vertex renders the image. This is
  // best-effort and never delays or prevents the image-generation request.
  void warmLocalFloorplanOcr4f();

  // 1. Generate the source image using the confirmed canonical brief.
  console.log('[Text 4.0 F] Step 1: Generating Image');
  const base64Image = await generateFloorplanImage4f(confirmedBrief);
  return convertFloorplanImage4f(base64Image, confirmedBrief, requestedBoundary, {
    workflowStartedAt,
    warmOcr: false,
    annotateGeneratedPreview: false,
    onGeometryReady: options.onGeometryReady,
  });
}
