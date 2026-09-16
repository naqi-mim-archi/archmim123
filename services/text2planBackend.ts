import { GoogleGenAI } from "@google/genai";
import { GoogleAuth } from "google-auth-library";
import path from "path";
import fs from "fs";
import { TEXT4C_LOW_LATENCY_GENERATION_CONFIG } from './text4cImageConfig';

const VERTEX_KEY_PATH = path.resolve('ml/auto_plan/gcp_key.json');
const VERTEX_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
let cachedVertexAuth: GoogleAuth | undefined;
let cachedVertexClientPromise: ReturnType<GoogleAuth['getClient']> | undefined;

const configureVertexEnvironment = () => {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = VERTEX_KEY_PATH;
  process.env.GOOGLE_GENAI_USE_VERTEXAI = 'true';
  process.env.GOOGLE_CLOUD_PROJECT = 'mod-trg-1260712-01';
  process.env.GOOGLE_CLOUD_LOCATION = 'us';
};

const getVertexAuth = (): GoogleAuth => {
  if (!fs.existsSync(VERTEX_KEY_PATH)) {
    throw new Error(`Service account key not found at ${VERTEX_KEY_PATH}`);
  }
  configureVertexEnvironment();
  if (!cachedVertexAuth) {
    cachedVertexAuth = new GoogleAuth({ keyFile: VERTEX_KEY_PATH, scopes: VERTEX_SCOPE });
  }
  return cachedVertexAuth;
};

const getVertexClient = () => {
  if (!cachedVertexClientPromise) {
    cachedVertexClientPromise = getVertexAuth().getClient().catch(error => {
      cachedVertexClientPromise = undefined;
      throw error;
    });
  }
  return cachedVertexClientPromise;
};

export const warmText2PlanVertexAuth = async () => {
  const startedAt = Date.now();
  const client = await getVertexClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error('Failed to warm the Google Cloud access token.');
  return { ready: true, warmupMs: Date.now() - startedAt };
};

interface ApiRequest {
  method?: string;
  url?: string;
  body?: any;
}

interface ApiResponse {
  status: (code: number) => ApiResponse;
  json: (payload: any) => void;
}

export const routeText2PlanApiRequest = async (
  request: ApiRequest,
  response: ApiResponse
): Promise<boolean> => {
  const url = request.url || '';
  if (!url.startsWith('/api/text2plan/generate') && !url.startsWith('/api/text2plan/image') && !url.startsWith('/api/text2plan/auth/warm')) {
    response.status(404).json({ error: 'Unknown Text2Plan endpoint.' });
    return true;
  }

  try {
    getVertexAuth();

    if (url.startsWith('/api/text2plan/auth/warm')) {
      const result = await warmText2PlanVertexAuth();
      console.log(`[Text 4.0 C] Vertex auth ready in ${result.warmupMs}ms`);
      response.json(result);
      return true;
    }
    
    if (url.startsWith('/api/text2plan/image')) {
      try {
        const imageRequestStartedAt = Date.now();
        const { prompt } = request.body || {};
        
        const authStartedAt = Date.now();
        const client = await getVertexClient();
        const tokenResponse = await client.getAccessToken();
        const token = tokenResponse.token;
        const authMs = Date.now() - authStartedAt;
        
        if (!token) throw new Error("Failed to get Google Cloud access token");

        const vertexUrl = 'https://aiplatform.googleapis.com/v1/projects/mod-trg-1260712-01/locations/global/publishers/google/models/gemini-3.1-flash-lite-image:generateContent';
        
        const vertexStartedAt = Date.now();
        const fetch = (await import('node-fetch')).default || global.fetch;
        
        const imgRes = await fetch(vertexUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: TEXT4C_LOW_LATENCY_GENERATION_CONFIG,
          })
        });

        if (!imgRes.ok) {
           const errText = await imgRes.text();
           throw new Error(`Vertex AI API error: ${imgRes.status} ${errText}`);
        }
        
        const data = await imgRes.json();
        const imagePart = data.candidates
          ?.flatMap((candidate: any) => candidate.content?.parts || [])
          .find((part: any) => part.inlineData?.data);
        const base64Data = imagePart?.inlineData?.data;
        
        if (!base64Data) {
          throw new Error("No image data returned from Gemini.");
        }
        
        const vertexMs = Date.now() - vertexStartedAt;
        const generationMs = Date.now() - imageRequestStartedAt;
        console.log(`[Text 4.0 C] Vertex image proxy completed in ${generationMs}ms (auth ${authMs}ms, model ${vertexMs}ms)`);
        response.json({ imageBytes: base64Data, generationMs, authMs, vertexMs });
      } catch (err: any) {
        console.error('Proxy Image Error:', err);
        response.status(500).json({ error: err.message });
      }
      return true;
    }

    const ai = new GoogleGenAI({
      project: "mod-trg-1260712-01",
      location: "us",
      vertexai: true,
    });

    const { designSummary, boundaryPoints } = request.body || {};
    
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

    const modelName = "projects/738349838690/locations/us/endpoints/8469159836758573056";

    console.log(`[Text2Plan] Sending generation request to Vertex AI model: ${modelName}...`);
    
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
    console.error('[Text2Plan] Error querying model:', err);
    response.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
};
