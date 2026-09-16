import { GoogleAuth } from "google-auth-library";
import fs from "fs";
import path from "path";

// Client for the self-hosted Cloud Run GPU service (`unified-ai-renderer`).
// Disabled unless UNIFIED_RENDERER_URL is set, so existing behaviour is unchanged by default.
// Contract is documented in gpu-renderer/README.md.

export const UNIFIED_RENDERER_MODELS = ['flux-2-pro', 'stable-diffusion-xl'];

const DEFAULT_TIMEOUT_MS = 300000;
const VERTEX_KEY_PATH = path.resolve('ml/auto_plan/rendair_gcp_key.json');

export interface UnifiedRendererImage {
  mimeType: string;
  base64Data: string;
  category?: 'drawing' | 'reference';
  drawingType?: string;
  label?: string;
}

export interface UnifiedRendererRequest {
  jobId: string;
  variantIndex: number;
  model: string;
  prompt: string;
  images: UnifiedRendererImage[];
  mask?: UnifiedRendererImage;
  aspectRatio: string;
  resolution: string;
  controlnetType?: string;
  controlnetScale?: number;
  controlnetEnabled?: boolean;
  seed?: number;
}

export const getUnifiedRendererUrl = (): string => (process.env.UNIFIED_RENDERER_URL || '').trim().replace(/\/+$/, '');

export const isUnifiedRendererEnabledFor = (model: string, outputTypes: string[]): boolean =>
  !!getUnifiedRendererUrl() && UNIFIED_RENDERER_MODELS.includes(model) && outputTypes.includes('image/png');

let cachedIdTokenAuth: GoogleAuth | undefined;

const getAuthorizationHeader = async (audience: string): Promise<string | undefined> => {
  if (process.env.UNIFIED_RENDERER_REQUIRE_AUTH !== 'true') return undefined;
  cachedIdTokenAuth ||= fs.existsSync(VERTEX_KEY_PATH) ? new GoogleAuth({ keyFile: VERTEX_KEY_PATH }) : new GoogleAuth();
  const client = await cachedIdTokenAuth.getIdTokenClient(audience);
  const headers: any = await client.getRequestHeaders();
  return typeof headers?.get === 'function' ? headers.get('authorization') || undefined : headers?.Authorization;
};

const looksLikeImage = (base64: string): boolean =>
  base64.length > 100 && (base64.startsWith('iVBORw0KGgo') || base64.startsWith('/9j/') || base64.startsWith('UklGR'));

// Returns base64 image bytes, or null when the GPU service is unavailable / returned no image,
// so the caller can fall back to the existing Vertex AI path.
export async function renderWithUnifiedRenderer(request: UnifiedRendererRequest): Promise<string | null> {
  const baseUrl = getUnifiedRendererUrl();
  if (!baseUrl) return null;

  const timeoutMs = Number(process.env.UNIFIED_RENDERER_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const tag = `[AI-Render Job ${request.jobId} Variant ${request.variantIndex + 1}]`;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const authorization = await getAuthorizationHeader(baseUrl);
    if (authorization) headers['Authorization'] = authorization;

    console.log(`${tag} Sending ${request.model} request to unified GPU renderer (timeout ${timeoutMs}ms)`);
    const res = await fetch(`${baseUrl}/render`, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        model: request.model,
        prompt: request.prompt,
        images: request.images.map(img => ({
          mime_type: img.mimeType,
          base64: img.base64Data,
          category: img.category,
          drawing_type: img.drawingType,
          label: img.label,
        })),
        mask: request.mask ? { mime_type: request.mask.mimeType, base64: request.mask.base64Data } : undefined,
        aspect_ratio: request.aspectRatio,
        resolution: request.resolution,
        controlnet_enabled: request.controlnetEnabled,
        controlnet_type: request.controlnetType,
        controlnet_scale: request.controlnetScale,
        seed: request.seed,
      }),
    });

    if (!res.ok) {
      console.warn(`${tag} Unified GPU renderer returned status ${res.status}: ${await res.text()}`);
      return null;
    }

    const data: any = await res.json();
    const base64 = typeof data?.image_base64 === 'string' ? data.image_base64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '') : '';
    if (!looksLikeImage(base64)) {
      console.warn(`${tag} Unified GPU renderer responded without an image (${JSON.stringify(data).slice(0, 200)}); falling back.`);
      return null;
    }

    console.log(`${tag} Unified GPU renderer succeeded with ${data.model_used || request.model} in ${Date.now() - startedAt}ms`);
    return base64;
  } catch (err: any) {
    const reason = err?.name === 'AbortError' ? `timed out after ${timeoutMs}ms (GPU cold start?)` : err?.message || String(err);
    console.warn(`${tag} Unified GPU renderer call failed: ${reason}; falling back.`);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
