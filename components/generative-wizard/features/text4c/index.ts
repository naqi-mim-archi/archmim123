import type { Point } from '../../../../types';
import type { GeneratedData } from '../../types';
import { generateFloorplanImage4c } from '../../../../services/imageGenService4c';
import { extractGeometryFromLocalImage } from '../../../../services/localImageToJSON4c';
import { warmLocalFloorplanOcr4c } from '../../../../services/localFloorplanOcr4c';
import type { ConfirmedText4cBrief } from '../../../../services/text4cBrief';
import { text4cBriefToDesignSummary } from '../../../../services/text4cBrief';
import { buildText4cFallbackGeometry } from '../../../../services/text4cFallbackGeometry';
export { refineDesignRequirements4c } from '../../../../services/chatService4c';
export { completeText4cGeometry } from './geometry';

export async function generateFloorplan4c(
  confirmedBrief: ConfirmedText4cBrief,
  requestedBoundary?: Point[]
): Promise<GeneratedData> {
  const workflowStartedAt = Date.now();
  const designSummary = text4cBriefToDesignSummary(confirmedBrief);

  // Warm the cached local OCR worker while Vertex renders the image. This is
  // best-effort and never delays or prevents the image-generation request.
  void warmLocalFloorplanOcr4c();

  // 1. Generate the source image using the confirmed canonical brief.
  console.log('[Text 4.0 C] Step 1: Generating Image');
  const base64Image = await generateFloorplanImage4c(confirmedBrief);
  
  // 2. Local Pixel-to-JSON extraction
  console.log('[Text 4.0 C] Step 2: Extracting Geometry Locally');
  const extractionStartedAt = Date.now();
  let rawGeometry: GeneratedData;
  try {
    rawGeometry = await extractGeometryFromLocalImage(base64Image, {
      requestedBoundary,
      designSummary,
      enforceRequestedEnvelope: true,
      // Keep OCR useful but prevent a slow browser worker from recreating the
      // long generation delays that Text 4.0 C previously eliminated.
      ocrTimeBudgetMs: 900,
    });
  } catch (error) {
    console.warn('[Text 4.0 C] Local image tracing failed; preserving the image with deterministic fallback geometry.', error);
    rawGeometry = buildText4cFallbackGeometry(confirmedBrief, requestedBoundary, error);
  }
  console.log(`[Text 4.0 C] Local extraction completed in ${Date.now() - extractionStartedAt}ms; total workflow ${Date.now() - workflowStartedAt}ms`);
  
  // Attach the source image to the generated data so it can be previewed
  rawGeometry.sourceImageBase64 = base64Image;

  return rawGeometry;
}
