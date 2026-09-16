import { ai } from "./aiClient";
import { SHARED_SCHEMA } from "./schema";
import { Type } from "@google/genai";

export const importInteriorFromImage = async (
  base64Image: string,
  generatedData: any
) => {
  const systemInstruction = `
YOU ARE AN INTERIOR PLACEMENT ENGINE.
YOUR TASK: Identify furniture and fixtures in the image and place them using allowed inventory items.

1. Analyze furniture (beds, sofas, tables) and fixtures (toilets, sinks, appliances).
2. For EVERY element detected, provide its precise position (x, y as normalized 0-1 values), SUBTYPE (from inventory), WIDTH (in meters), DEPTH (in meters), and ROTATION (in degrees, 0-360).
3. Output JSON mapping detected items to closest matches from the predefined furniture/fixtures list.
4. Return ONLY: { "furniture": [...], "fixtures": [...] }.
`;

  const prompt = `Identify interior elements in this floorplan image. 

Compare this image with the existing architectural floorplan data provided below to ensure 100% accurate placement, alignment, and orientation of furniture and fixtures.

Existing Architectural Data (JSON): ${JSON.stringify(generatedData)}

Output their positions (x, y as normalized 0-1 values), SUBTYPE (from inventory), WIDTH (in meters), DEPTH (in meters), and ROTATION (in degrees, 0-360).
Return ONLY: { "furniture": [...], "fixtures": [...] }.`;

  // Strip prefix if present
  const mimeTypeMatch = base64Image.match(/^data:(image\/[a-zA-Z]+);base64,/);
  const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/png';
  const data = base64Image.replace(/^data:image\/[a-zA-Z]+;base64,/, "");

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: [
        { parts: [{ text: prompt }] },
        { parts: [{ inlineData: { mimeType, data } }] }
      ],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            furniture: SHARED_SCHEMA.properties.furniture,
            fixtures: SHARED_SCHEMA.properties.fixtures,
          },
          required: ["furniture", "fixtures"]
        } as any
      }
    });

    if (!response.text) throw new Error("No response from Generative AI");
    
    return JSON.parse(response.text);

  } catch (error) {
    console.error("Interior Import Error:", error);
    throw error;
  }
};
