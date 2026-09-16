import { GoogleGenAI } from "@google/genai";
import { GoogleAuth } from "google-auth-library";
import path from "path";
import fs from "fs";
import { resolveDefaultVertexKeyPath } from './vertexKeyFile';

interface ApiRequest {
  method?: string;
  url?: string;
  body?: any;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (payload: any) => void;
}

export const routeSmartText2PlanApiRequest = async (
  request: ApiRequest,
  response: ApiResponse
): Promise<boolean> => {
  const url = request.url || '';
  if (!url.startsWith('/api/smart-text2plan/generate')) {
    response.status(404).json({ error: 'Unknown Smart Text2Plan endpoint.' });
    return true;
  }

  try {
    const { designSummary, boundaryPoints } = request.body || {};
    
    const keyPath = resolveDefaultVertexKeyPath(); // repo key file locally, else GOOGLE_VERTEX_*_SA_KEY_JSON (Vercel)
    if (!fs.existsSync(keyPath)) {
      throw new Error(`Service account key not found at ${keyPath}`);
    }
    
    process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
    process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
    process.env.GOOGLE_CLOUD_PROJECT = "mod-trg-1260712-01";
    
    // We match the location of the AI Gen > Text model setup (which uses "us")
    process.env.GOOGLE_CLOUD_LOCATION = "us";
    
    const auth = new GoogleAuth({
      keyFile: keyPath,
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });
    
    // We specify v1beta1 to ensure preview models like 3.1-flash-lite are accessible
    const ai = new GoogleGenAI({
      project: "mod-trg-1260712-01",
      location: "us",
      vertexai: true,
      httpOptions: { apiVersion: 'v1beta1' }
    });
    
    const systemInstruction = `
YOU ARE A FINE-TUNED ARCHITECTURAL DESIGN ENGINE.

YOUR TASK: Design a professional, scale-accurate floorplan with correct logic.

=============================
1. SCALE, UNITS, & COORDINATES
=============================
- **Output Coordinates in METERS**.
- **COORDINATE ORIENTATION (MANDATORY)**: You MUST use a standard Cartesian coordinate system where Y increases UPWARDS (North is +Y, South is -Y). Therefore, elements/rooms at the top of the plan (North) MUST have LARGER Y coordinates than elements/rooms at the bottom of the plan (South). Never output Y-increasing-downwards (image-space) coordinates.
- Standard Dimensions:
  * Door Width: 0.9m (Single), 1.6m (Double/Sliding).
  * Ext. Wall: 0.23m | Int. Wall: 0.15m.
  * Bedroom: ~3.5m x 4m.
- **DO NOT** create giant stadiums. A house is ~10-20m wide.

=============================
2. ARCHITECTURAL LOGIC
=============================
- **STAIRS**: 
  * **IF 1 FLOOR**: DO NOT GENERATE STAIRS.
  * **IF >1 FLOOR**: Place stairs in circulation zones (Hall/Foyer). NEVER inside a private room (Bed/Bath).
  * Use 'stairs' tool object.
- **DOORS**: 
  * Use VARIETY. Do not just use 'single'.
  * 'double' for Main Entry.
  * 'sliding' for Balconies/Closets.
  * 'single' for Bedrooms/Baths.
- **WINDOWS**: Place on exterior walls. Use 'bay' or 'full-height' for living areas.
- **WET AREAS**: Group Kitchen/Bath if possible (Wet-over-Wet for multi-floor).

=============================
3. MANDATORY ELEMENTS
=============================
- **Slabs**: Generate 'floor' slabs for each room/zone.
- **Strictly Architectural**: Do NOT place furniture (beds, sofas, tables) or fixtures (toilets, sinks). Only walls, doors, windows, stairs, and slabs.

=============================
4. OUTPUT
=============================
- Valid JSON matching schema.
- Use 'levelIndex' (0, 1..) for multi-story.
`;

    let boundaryContext = "Generate an optimal building footprint.";
    if (boundaryPoints && boundaryPoints.length > 2) {
      const coords = boundaryPoints.map((p: any) => `[${p.x.toFixed(2)}, ${p.y.toFixed(2)}]`).join(', ');
      boundaryContext = `FIXED BOUNDARY (Must stay strictly inside): [${coords}]`;
    }

    const prompt = `
Design Brief: "${designSummary}"
Boundary Context: ${boundaryContext}

Execute full architectural reasoning using the fine-tuned dataset parameters.
Follow strict scale (Meters).
If brief implies 1 floor, NO stairs.
Do NOT include furniture.
`;

    // As requested, using the base model
    const modelName = "gemini-3.1-flash-lite";

    console.log(`[Smart Text2Plan] Sending generation request to Vertex AI base model: ${modelName}...`);
    
    const { SHARED_SCHEMA } = await import("./schema");

    const genResponse = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: SHARED_SCHEMA as any
      }
    });

    if (!genResponse.text) {
      throw new Error("No response returned from Vertex AI model.");
    }

    const parsedData = JSON.parse(genResponse.text);
    response.json(parsedData);
    return true;

  } catch (err: any) {
    console.error('[Smart Text2Plan] Error querying model:', err);
    response.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
};
