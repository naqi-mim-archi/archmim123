import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const ASCII_EXTRACTION_PROMPT = `
You are an expert architectural interpreter. I am providing you with an image of an architectural floor plan.
Your task is to accurately extract the layout using native spatial bounding boxes [ymin, xmin, ymax, xmax] scaled 0-1000.

CRITICAL REQUIREMENTS:
1. For every room, read its exact dimensions from the text labels (e.g., 23' x 15' means width 23, depth 15).
2. For every room, provide its spatial bounding box exactly as it appears in the image using [ymin, xmin, ymax, xmax].

OUTPUT FORMAT:
Return ONLY valid JSON matching this schema:
\`\`\`json
{
  "rooms": [
    {
      "name": "Living Area",
      "width_ft": 23,
      "depth_ft": 15,
      "box": [200, 100, 500, 900]
    }
  ]
}
\`\`\`
Do not include markdown blocks, just the raw JSON object.
`;

export interface ExtractedZoningData {
  rooms: {
    name: string;
    width_ft: number;
    depth_ft: number;
    box: [number, number, number, number];
  }[];
}

export async function extractZoningFromImage4c(base64Image: string): Promise<ExtractedZoningData> {
  const base64Data = base64Image.replace(/^data:image\/(png|jpeg);base64,/, "");

  console.log('[Text 4.0 A] Extracting zoning via Gemini Vision using spatial boxes...');
  const startTime = Date.now();

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: ASCII_EXTRACTION_PROMPT },
            {
              inlineData: {
                data: base64Data,
                mimeType: 'image/jpeg'
              }
            }
          ]
        }
      ],
      config: {
        temperature: 0.1,
        responseMimeType: 'application/json'
      }
    });

    const elapsed = Date.now() - startTime;
    console.log(`[Text 4.0 A] Vision extraction completed in ${elapsed}ms`);

    const text = response.text;
    if (!text) throw new Error("Empty response from Gemini Vision");
    
    return JSON.parse(text) as ExtractedZoningData;
  } catch (error: any) {
    console.error('[Text 4.0 A] Vision Extraction Error:', error);
    throw new Error(`Failed to extract zoning from image: ${error.message || error}`);
  }
}
