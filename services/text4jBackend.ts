import { GoogleGenAI } from "@google/genai";
import { GoogleAuth } from "google-auth-library";
import path from "path";
import fs from "fs";
import {
  TEXT4J_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION,
  TEXT4J_LOW_LATENCY_GENERATION_CONFIG,
} from './text4jImageConfig';
import { MediaResolution, ThinkingLevel, Type } from "@google/genai";
import { validateText4jMasterFloorplanGraph } from './text4jMasterFloorplanData';
import { resolveDefaultVertexKeyPath } from './vertexKeyFile';

const STRUCTURED3D_BASE_URL = (process.env.STRUCTURED3D_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');

const decodeImagePayload = (value: unknown) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Text 4.0 J Structured3D conversion requires imageBase64.');
  }
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  return {
    mimeType: match?.[1] || 'image/png',
    bytes: Buffer.from(match?.[2] || value, 'base64'),
  };
};

const VERTEX_KEY_PATH = resolveDefaultVertexKeyPath(); // repo key file locally, else GOOGLE_VERTEX_*_SA_KEY_JSON (Vercel)
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

export const warmText4jVertexAuth = async () => {
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

export const routeText4jApiRequest = async (
  request: ApiRequest,
  response: ApiResponse
): Promise<boolean> => {
  const url = request.url || '';
  if (!url.startsWith('/api/text4j/generate') && !url.startsWith('/api/text4j/image') && !url.startsWith('/api/text4j/master-geometry') && !url.startsWith('/api/text4j/auth/warm') && !url.startsWith('/api/text4j/structured3d/convert')) {
    response.status(404).json({ error: 'Unknown Text4j endpoint.' });
    return true;
  }

  try {
    if (url.startsWith('/api/text4j/structured3d/convert')) {
      const { mimeType, bytes } = decodeImagePayload(request.body?.imageBase64);
      const form = new FormData();
      form.append('file', new Blob([bytes], { type: mimeType }), `text4j-source.${mimeType.split('/')[1] || 'png'}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      try {
        const structuredResponse = await fetch(`${STRUCTURED3D_BASE_URL}/api/convert/archai-candidates`, {
          method: 'POST',
          body: form,
          signal: controller.signal,
        });
        const contentType = structuredResponse.headers.get('content-type') || '';
        const payload = contentType.includes('application/json')
          ? await structuredResponse.json()
          : undefined;
        if (!structuredResponse.ok) {
          const routeHint = structuredResponse.status === 404
            ? ' The running Structured3D service has not loaded the Text 4.0 J candidate API; restart that service on port 5000.'
            : '';
          response.status(structuredResponse.status).json({
            success: false,
            error: payload?.error || `Structured3D candidate API returned HTTP ${structuredResponse.status}.${routeHint}`,
          });
          return true;
        }
        response.status(structuredResponse.status).json(payload);
      } finally {
        clearTimeout(timeout);
      }
      return true;
    }

    getVertexAuth();

    if (url.startsWith('/api/text4j/auth/warm')) {
      const result = await warmText4jVertexAuth();
      console.log(`[Text 4.0 J] Vertex auth ready in ${result.warmupMs}ms`);
      response.json(result);
      return true;
    }

    if (url.startsWith('/api/text4j/image')) {
      try {
        const imageRequestStartedAt = Date.now();
        const { prompt, imageModel } = request.body || {};

        const authStartedAt = Date.now();
        await getVertexClient();
        const authMs = Date.now() - authStartedAt;

        const vertexStartedAt = Date.now();
        const selectedModel = imageModel || 'gemini-3.1-flash-lite-image';
        let base64Data: string | undefined;

        if (selectedModel === 'imagen-3.0-generate-001' || selectedModel === 'imagen-3.0-fast-generate-001' || selectedModel === 'imagen-3.0-generate-002') {
          const candidateModels = selectedModel.startsWith('imagen-3.0-generate')
            ? ['imagen-3.0-generate-002', 'imagen-3.0-generate-001']
            : ['imagen-3.0-fast-generate-001', 'imagen-3.0-fast-generate-002'];
          const candidateLocations = ['us-central1', 'us', 'us-east4'];
          let lastErr: any;

          for (const loc of candidateLocations) {
            for (const mod of candidateModels) {
              try {
                console.log(`[Text 4.0 J] Attempting Imagen model ${mod} in location ${loc}...`);
                const imagenAi = new GoogleGenAI({
                  project: "mod-trg-1260712-01",
                  location: loc,
                  vertexai: true,
                });
                const imagenRes = await imagenAi.models.generateImages({
                  model: mod,
                  prompt: prompt,
                  config: {
                    numberOfImages: 1,
                    aspectRatio: '1:1',
                    outputMimeType: 'image/jpeg',
                  },
                });
                const img = imagenRes.generatedImages?.[0];
                base64Data = img?.image?.imageBytes;
                if (base64Data) {
                  console.log(`[Text 4.0 J] Successfully generated image with ${mod} in ${loc}`);
                  break;
                }
              } catch (e: any) {
                lastErr = e;
                console.warn(`[Text 4.0 J] Imagen model ${mod} in location ${loc} failed:`, e.message || e);
              }
            }
            if (base64Data) break;
          }
          if (!base64Data) {
            throw lastErr || new Error(`No image data returned from ${selectedModel}.`);
          }
        } else {
          const imageAi = new GoogleGenAI({
            project: "mod-trg-1260712-01",
            location: "global",
            vertexai: true,
          });

          const data = await imageAi.models.generateContent({
            model: 'gemini-3.1-flash-lite-image',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
              systemInstruction: TEXT4J_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION,
              ...TEXT4J_LOW_LATENCY_GENERATION_CONFIG,
              responseModalities: [...TEXT4J_LOW_LATENCY_GENERATION_CONFIG.responseModalities],
            } as any,
          });

          const imagePart = data.candidates
            ?.flatMap(candidate => candidate.content?.parts || [])
            .find((part: any) => part.inlineData?.data);
          base64Data = imagePart?.inlineData?.data;

          if (!base64Data) {
            throw new Error("No image data returned from Gemini.");
          }
        }

        const vertexMs = Date.now() - vertexStartedAt;
        const generationMs = Date.now() - imageRequestStartedAt;
        console.log(`[Text 4.0 J] Vertex image proxy completed in ${generationMs}ms (model: ${selectedModel}, auth ${authMs}ms, model ${vertexMs}ms)`);
        response.json({ imageBytes: base64Data, generationMs, authMs, vertexMs });
      } catch (err: any) {
        console.error('Proxy Image Error:', err);
        response.status(500).json({ error: err.message });
      }
      return true;
    }

    if (url.startsWith('/api/text4j/master-geometry')) {
      try {
        const transcriptionStartedAt = Date.now();
        const { imageBytes, mimeType = 'image/jpeg', prompt, thinkingLevel = 'minimal' } = request.body || {};
        if (!imageBytes || !prompt) {
          response.status(400).json({ error: 'Text 4.0 J master geometry requires imageBytes and prompt.' });
          return true;
        }

        const authStartedAt = Date.now();
        await getVertexClient();
        const authMs = Date.now() - authStartedAt;

        const ai = new GoogleGenAI({
          project: "mod-trg-1260712-01",
          location: "global",
          vertexai: true,
          httpOptions: { apiVersion: 'v1beta1' },
        });

        const coordinate = { type: Type.NUMBER, minimum: 0, maximum: 1000 };
        const MASTER_FLOORPLAN_SCHEMA = {
          type: Type.OBJECT,
          properties: {
            coordinateSpace: { type: Type.STRING, enum: ['normalized_0_1000'] },
            junctions: {
              type: Type.ARRAY,
              minItems: 3,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  x: coordinate,
                  y: coordinate,
                },
                required: ['id', 'x', 'y'],
              },
            },
            exteriorLoop: {
              type: Type.ARRAY,
              minItems: 3,
              items: { type: Type.STRING },
            },
            walls: {
              type: Type.ARRAY,
              minItems: 3,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  startJunctionId: { type: Type.STRING },
                  endJunctionId: { type: Type.STRING },
                  type: { type: Type.STRING, enum: ['exterior', 'interior', 'partition', 'glass'] },
                  curveType: { type: Type.STRING, enum: ['line', 'arc', 'circle', 'ellipse'] },
                  centerX: coordinate,
                  centerY: coordinate,
                  radius: { type: Type.NUMBER, minimum: 0.000001, maximum: 1000 },
                  radiusX: { type: Type.NUMBER, minimum: 0.000001, maximum: 1000 },
                  radiusY: { type: Type.NUMBER, minimum: 0.000001, maximum: 1000 },
                  rotation: { type: Type.NUMBER },
                  startAngle: { type: Type.NUMBER },
                  endAngle: { type: Type.NUMBER },
                  counterclockwise: { type: Type.BOOLEAN },
                  confidence: { type: Type.NUMBER, minimum: 0, maximum: 1 },
                },
                required: ['id', 'startJunctionId', 'endJunctionId', 'type', 'curveType'],
              },
            },
            apertures: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  hostWallId: { type: Type.STRING },
                  offset: { type: Type.NUMBER, minimum: 0, maximum: 1 },
                  widthRatio: { type: Type.NUMBER, minimum: 0.000001, maximum: 1 },
                  kind: { type: Type.STRING, enum: ['door', 'window', 'opening', 'unknown'] },
                  subtype: { type: Type.STRING, enum: ['single', 'double', 'sliding', 'folding', 'glass', 'standard', 'bay', 'full-height', 'unknown'] },
                  hingeSide: { type: Type.STRING, enum: ['left', 'right', 'unknown'] },
                  swingDirection: { type: Type.STRING, enum: ['inward', 'outward', 'unknown'] },
                  confidence: { type: Type.NUMBER, minimum: 0, maximum: 1 },
                },
                required: ['id', 'hostWallId', 'offset', 'widthRatio', 'kind'],
              },
            },
          },
          required: ['coordinateSpace', 'junctions', 'exteriorLoop', 'walls', 'apertures'],
        };

        const masterModel = 'gemini-3.5-flash-lite' as const;
        const normalizedThinkingLevel = String(thinkingLevel).toLowerCase();
        const masterThinkingLevel = ({
          minimal: ThinkingLevel.MINIMAL,
          low: ThinkingLevel.LOW,
          medium: ThinkingLevel.MEDIUM,
          high: ThinkingLevel.HIGH,
        } as const)[normalizedThinkingLevel as 'minimal' | 'low' | 'medium' | 'high'] || ThinkingLevel.MINIMAL;
        const appliedThinkingLevel = ['minimal', 'low', 'medium', 'high'].includes(normalizedThinkingLevel)
          ? normalizedThinkingLevel
          : 'minimal';
        const requestModel = async () => {
          const modelStartedAt = Date.now();
          const genResponse = await ai.models.generateContent({
            model: masterModel,
            contents: [{
              role: 'user',
              parts: [
                { text: prompt },
                { inlineData: { data: imageBytes, mimeType } },
              ],
            }],
            config: {
              mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
              thinkingConfig: {
                thinkingLevel: masterThinkingLevel,
                includeThoughts: false,
              },
              responseMimeType: 'application/json',
              responseSchema: MASTER_FLOORPLAN_SCHEMA as any,
            },
          });
          if (!genResponse.text) throw new Error(`No master floorplan data returned from ${masterModel}.`);
          return { geometry: JSON.parse(genResponse.text), modelMs: Date.now() - modelStartedAt, model: masterModel };
        };

        const result = await requestModel();
        const validation = validateText4jMasterFloorplanGraph(result.geometry);
        const totalModelMs = result.modelMs;

        const geometry = result.geometry;
        const transcriptionMs = Date.now() - transcriptionStartedAt;
        console.log(`[Text 4.0 J] Master geometry graph completed in ${transcriptionMs}ms (auth ${authMs}ms, model ${totalModelMs}ms, ${result.model}, valid ${validation.valid})`);
        response.json({ geometry, transcriptionMs, authMs, modelMs: totalModelMs, model: result.model, thinkingLevel: appliedThinkingLevel, validation });
      } catch (err: any) {
        console.error('[Text 4.0 J] Master floorplan data error:', err);
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

    console.log(`[Text4j] Sending generation request to Vertex AI model: ${modelName}...`);

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
    console.error('[Text4j] Error querying model:', err);
    response.status(500).json({
      error: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
};
