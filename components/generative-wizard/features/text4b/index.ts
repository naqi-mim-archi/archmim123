import type { Point } from '../../../../types';
import type { GeneratedData } from '../../types';
import { generateFloorplanImage4b } from '../../../../services/imageGenService4b';
import { extractZoningFromImage4b } from '../../../../services/visionAsciiExtractor4b';
import { parseAsciiZoningToGeometry } from './asciiParser';

export async function generateFloorplan4b(
  designSummary: string,
  requestedBoundary?: Point[]
): Promise<GeneratedData> {
  // 1. Generate Image using Imagen 3
  console.log('[Text 4.0 B] Step 1: Generating Image');
  const base64Image = await generateFloorplanImage4b(designSummary);
  
  // 2. Extract ASCII and Zoning JSON via Gemini Vision
  console.log('[Text 4.0 B] Step 2: Extracting Zoning JSON');
  const zoningData = await extractZoningFromImage4b(base64Image);
  
  // 3. Convert Zoning JSON to Raw Geometry (Walls, Rooms)
  console.log('[Text 4.0 B] Step 3: Parsing Geometry');
  const rawGeometry = parseAsciiZoningToGeometry(zoningData);
  
  // Attach the source image to the generated data so it can be previewed
  rawGeometry.sourceImageBase64 = base64Image;

  return rawGeometry;
}
