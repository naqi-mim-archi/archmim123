import type { Point } from '../../../../types';
import type { GeneratedData } from '../../types';
import { generateFloorplanImage } from '../../../../services/imageGenService';
import { extractZoningFromImage } from '../../../../services/visionAsciiExtractor';
import { parseAsciiZoningToGeometry } from './asciiParser';

export async function generateFloorplan4a(
  designSummary: string,
  requestedBoundary?: Point[]
): Promise<GeneratedData> {
  // 1. Generate Image using Imagen 3
  console.log('[Text 4.0 A] Step 1: Generating Image');
  const base64Image = await generateFloorplanImage(designSummary);
  
  // 2. Extract ASCII and Zoning JSON via Gemini Vision
  console.log('[Text 4.0 A] Step 2: Extracting Zoning JSON');
  const zoningData = await extractZoningFromImage(base64Image);
  
  // 3. Convert Zoning JSON to Raw Geometry (Walls, Rooms)
  console.log('[Text 4.0 A] Step 3: Parsing Geometry');
  const rawGeometry = parseAsciiZoningToGeometry(zoningData);
  
  // Attach the source image to the generated data so it can be previewed
  rawGeometry.sourceImageBase64 = base64Image;

  return rawGeometry;
}
