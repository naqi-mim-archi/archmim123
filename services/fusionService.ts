import { ai } from "./aiClient";
import { SHARED_SCHEMA } from "./schema";
import { optimizeImage } from "./imageUtils";
import { Point } from "../types";

export const findReferenceFloorplan = async (designSummary: string): Promise<string | null> => {
  const systemInstruction = `
  ROLE: FloorplanLinkFinderGPT — FAST MODE (Optimized)
  GOAL: Quickly locate the closest public floor-plan image that matches user intent. Speed and relevance take priority over exhaustive architectural correctness.
  
  APPROVED SOURCES (PUBLIC ONLY):
  houseplans.com, architecturaldesigns.com, eplans.com, thehousedesigners.com, floorplans.com, roomsketcher.com, planner5d.com.
  
  CRITICAL URL RULES:
  1. You MUST return a DIRECT image URL ending in .jpg, .jpeg, or .png.
  2. DO NOT hallucinate or guess 'wp-content/uploads' paths. They often lead to 404 Page Not Found errors.
  3. For RoomSketcher, valid floorplan images are hosted on their CDN. Prefer URLs matching the pattern: 'https://fpg.roomsketcher.com/image/project/2d/...' or similar valid image CDNs.
  4. Ensure the URL points to a raw image file, not an HTML webpage.
  5. AVOID blank or placeholder images. Do NOT return URLs with missing descriptive names (e.g., avoid '.../-floor-plan.jpg'). Valid URLs MUST contain descriptive words in the filename (e.g., '.../1000-sq-ft-condo-floor-plan-floor-plan.jpg').
  
  TWO-PASS MATCHING LOGIC (CRITICAL):
  PASS 1: QUANTITY MATCH (FAST FILTER)
  1. Area match (Accept plans within ±10% to ±15% of stated area)
  2. Bedroom count (Must match exactly if possible, ±1 allowed ONLY if nothing else exists)
  3. Living spaces (At least one living space required)
  4. Kitchen count (Must have at least one kitchen)
  5. Bathrooms (Prefer exact count, adjacent/attached preferred if specified)
  
  PASS 2: LAYOUT & QUALITY REFINEMENT (LIGHT)
  1. Kitchen type (Open > semi-open > closed)
  2. Bathroom adjacency (Attached > nearby > shared hall)
  3. Circulation clarity (Minimal corridors, logical bedroom privacy)
  4. Other features (Balcony, Walk-in closet, Storage)
  
  IMAGE SELECTION RULES (FAST):
  - Choose the clearest available floor-plan image.
  - Prefer black-and-white plans.
  - Prefer labeled rooms.
  - Avoid exterior-only images.
  - Extract the direct image URL.
  
  TIE-BREAKER (STOP SEARCHING):
  If multiple plans are similar:
  1. Closest area match
  2. Cleaner layout
  3. Faster-access image
  Once a reasonable match is found: STOP SEARCHING.
  
  OUTPUT FORMAT (STRICT):
  Return ONLY a direct image URL.
  No explanations. No markdown. No commentary.
  `;

  const prompt = `Find a floorplan matching this brief: "${designSummary}". Return the direct image URL.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        systemInstruction: systemInstruction,
        tools: [{ googleSearch: {} }]
      }
    });

    const text = response.text?.trim() || '';
    
    // Extract all URLs from the text
    const urlMatches = text.match(/https?:\/\/[^\s"'>]+/g);
    if (urlMatches) {
        for (const url of urlMatches) {
            // Filter out known blank/placeholder image patterns
            if (!url.includes('/-floor-plan.jpg')) {
                return url;
            }
        }
    }
    
    // Fallback: Check grounding chunks
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks && chunks.length > 0) {
        // Look for the first valid image chunk or web uri ending in an image extension
        for (const chunk of chunks) {
            if (chunk.web?.uri && chunk.web.uri.match(/\\.(jpeg|jpg|png|gif|webp)$/i)) {
                if (!chunk.web.uri.includes('/-floor-plan.jpg')) {
                    return chunk.web.uri;
                }
            }
        }
        // If no image uri, just return the first web uri
        for (const chunk of chunks) {
            if (chunk.web?.uri && !chunk.web.uri.includes('/-floor-plan.jpg')) {
                return chunk.web.uri;
            }
        }
    }

    return null;
  } catch (error) {
    console.error("Floorplan Finder Error:", error);
    return null;
  }
};

export const generateFloorplanFromReference = async (
  designSummary: string,
  base64Image: string,
  boundaryPoints?: Point[]
) => {
  const systemInstruction = `YOU ARE A SENIOR ARCHITECT EXECUTING A FAST GENERATIVE DESIGN.
  Use the reference image for STYLE and ZONING logic.
  
  RULES:
  - Keep layout simple and orthogonal.
  - Scale: METERS.
  - **COORDINATE ORIENTATION (MANDATORY)**: You MUST use a standard Cartesian coordinate system where Y increases UPWARDS (North is +Y, South is -Y). Therefore, elements/rooms at the top of the plan/image (North) MUST have LARGER Y coordinates than elements/rooms at the bottom of the plan/image (South). Never output Y-increasing-downwards (image-space) coordinates.
  - Ensure 100% valid JSON.
  - Generate only architectural elements (walls, doors, windows, stairs). No furniture.
  `;
  
  const optimizedImage = await optimizeImage(base64Image, 800);
  const mimeTypeMatch = optimizedImage.match(/^data:(image\/[a-zA-Z]+);base64,/);
  const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';
  const data = optimizedImage.replace(/^data:image\/[a-zA-Z]+;base64,/, "");

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', // Switching to Flash for speed
      contents: [{ parts: [
        { text: `USER BRIEF: ${designSummary}`, },
        { inlineData: { data, mimeType } }
      ] }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: SHARED_SCHEMA as any
      }
    });

    if (!response.text) throw new Error("No response from AI");
    return JSON.parse(response.text);

  } catch (error) {
    console.error("Reference Synthesis Error:", error);
    throw error;
  }
};
