export interface ModelConfig {
  callingName: string;
  displayName: string;
  label: string;
  description: string;
  costProfile: 'Lowest' | 'Medium' | 'Highest' | 'Custom' | 'Video' | '3D';
  speedProfile: 'Fastest' | 'Fast' | 'Slowest' | 'Medium' | 'Slow';
  resolutions: string[];
  supportsControlNet?: boolean;
}

export const CONTROLNET_MODELS: string[] = ['flux-2-pro', 'stable-diffusion-xl'];

export function isControlNetSupported(modelId: string): boolean {
  if (!modelId) return false;
  return CONTROLNET_MODELS.includes(modelId) || Boolean(MODELS[modelId]?.supportsControlNet);
}

export const MODELS: Record<string, ModelConfig> = {
  'gemini-3-pro-image': {
    callingName: 'gemini-3-pro-image',
    displayName: 'Nano Banana Pro',
    label: 'Best Result',
    description: 'Highest-quality option for demanding professional generation and editing.',
    costProfile: 'Highest',
    speedProfile: 'Slowest',
    resolutions: ['1K', '2K', '4K'],
    supportsControlNet: false
  },
  'gemini-3.1-flash-image': {
    callingName: 'gemini-3.1-flash-image',
    displayName: 'Nano Banana 2',
    label: 'Balanced / Recommended',
    description: 'High quality with substantially lower cost and faster processing than Pro.',
    costProfile: 'Medium',
    speedProfile: 'Fast',
    resolutions: ['512', '1K', '2K', '4K'],
    supportsControlNet: false
  },
  'gemini-3.1-flash-lite-image': {
    callingName: 'gemini-3.1-flash-lite-image',
    displayName: 'Nano Banana 2 Lite',
    label: 'Fastest / Most Economical',
    description: 'Optimized for quick previews, experimentation, and low-cost drafts.',
    costProfile: 'Lowest',
    speedProfile: 'Fastest',
    resolutions: ['1K'],
    supportsControlNet: false
  },
  'gemini-2.5-flash': {
    callingName: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    label: 'Analysis Model',
    description: 'Used internally for moodboard extraction and image annotations.',
    costProfile: 'Lowest',
    speedProfile: 'Fastest',
    resolutions: ['N/A'],
    supportsControlNet: false
  },
  'gemini-2.5-pro': {
    callingName: 'gemini-2.5-pro',
    displayName: 'Gemini 2.5 Pro',
    label: 'High-Reasoning Analysis',
    description: 'Used internally for localized bounding-box conversational analysis.',
    costProfile: 'Medium',
    speedProfile: 'Slow',
    resolutions: ['N/A'],
    supportsControlNet: false
  },
  'flux-2-pro': {
    callingName: 'flux-2-pro',
    displayName: 'FLUX.2 Pro',
    label: 'Ultra-fidelity GPU Pro',
    description: 'Next-generation FLUX.2 Pro custom-hosted image rendering engine.',
    costProfile: 'Custom',
    speedProfile: 'Medium',
    resolutions: ['1K', '2K', '4K'],
    supportsControlNet: true
  },
  'stable-diffusion-xl': {
    callingName: 'stable-diffusion-xl',
    displayName: 'Stable Diffusion XL',
    label: 'Standard ControlNet GPU',
    description: 'Stability AI SDXL model for sketch/elevation rendering.',
    costProfile: 'Custom',
    speedProfile: 'Medium',
    resolutions: ['1K'],
    supportsControlNet: true
  },
  'veo-3.1-lite': {
    callingName: 'veo-3.1-lite',
    displayName: 'Veo 3.1 Lite',
    label: 'Cinematic Video',
    description: 'Google Veo 3.1 Lite video generation and upscaling model.',
    costProfile: 'Video',
    speedProfile: 'Slow',
    resolutions: ['720p', '1080p']
  },
  'TRELLIS.2-4B': {
    callingName: 'TRELLIS.2-4B',
    displayName: 'TRELLIS 2 (4B)',
    label: '3D Asset Generator',
    description: 'Microsoft TRELLIS 2 engine for high-quality textured 3D assets.',
    costProfile: '3D',
    speedProfile: 'Slow',
    resolutions: ['N/A']
  },
  'GSplat': {
    callingName: 'GSplat',
    displayName: 'GSplat Scene',
    label: '3D Scene Splatting',
    description: 'Gaussian Splatting scene reconstruction engine.',
    costProfile: '3D',
    speedProfile: 'Slow',
    resolutions: ['N/A']
  }
};

export const PRICING_METADATA = {
  pricing_version: '2026-08-08',
  effective_date: '2026-08-08',
  currency: 'USD',
  gpu_zonal_redundancy: false, // Set to true if zonal redundancy is verified
  video_upscale_price_config: 'pending project SKU'
};

// Rates
const GOOGLE_IMAGE_PRO_INPUT_1M = 2.00;
const GOOGLE_IMAGE_PRO_IMAGE_TOKENS = 560; // cost = tokens * rate
const GOOGLE_IMAGE_FLASH_INPUT_1M = 0.50;
const GOOGLE_IMAGE_FLASH_IMAGE_TOKENS = 1120;
const GOOGLE_IMAGE_LITE_INPUT_1M = 0.25;
const GOOGLE_IMAGE_LITE_IMAGE_TOKENS = 1120;

// GPU rates per second
const GPU_NON_ZONAL_RATE = 0.0003947; // CPU + Mem + L4 GPU
const GPU_ZONAL_RATE = 0.0004989;

export class WorkflowCostEstimator {
  static calculate(
    workflowId: number,
    modelName: string,
    options: {
      resolution?: string;
      duration_seconds?: number;
      audio?: boolean;
      input_images_count?: number;
      prompt_tokens_estimate?: number;
    } = {}
  ): { estimateUsd: number; durationText: string; isPendingSku?: boolean } {
    const inputImages = options.input_images_count ?? 1;
    const promptTokens = options.prompt_tokens_estimate ?? 1000;
    const resolution = options.resolution ?? '2K';

    // 1. Google Native Image Models
    if (modelName === 'gemini-3-pro-image') {
      const inputCost = (promptTokens / 1_000_000) * GOOGLE_IMAGE_PRO_INPUT_1M +
                        inputImages * (GOOGLE_IMAGE_PRO_IMAGE_TOKENS / 1_000_000) * GOOGLE_IMAGE_PRO_INPUT_1M;
      let outputCost = 0.1344; // Default for 1K/2K
      if (resolution === '4K') outputCost = 0.2400;
      
      const timeText = resolution === '4K' ? '15–50 seconds' : '10–35 seconds';
      return { estimateUsd: parseFloat((inputCost + outputCost).toFixed(4)), durationText: timeText };
    }

    if (modelName === 'gemini-3.1-flash-image') {
      const inputCost = (promptTokens / 1_000_000) * GOOGLE_IMAGE_FLASH_INPUT_1M +
                        inputImages * (GOOGLE_IMAGE_FLASH_IMAGE_TOKENS / 1_000_000) * GOOGLE_IMAGE_FLASH_INPUT_1M;
      let outputCost = 0.10080; // 2K default
      if (resolution === '512') outputCost = 0.04482;
      else if (resolution === '1K') outputCost = 0.06720;
      else if (resolution === '4K') outputCost = 0.15120;

      let timeText = '6–18 seconds';
      if (resolution === '512' || resolution === '1K') timeText = '4–12 seconds';
      else if (resolution === '4K') timeText = '10–30 seconds';

      return { estimateUsd: parseFloat((inputCost + outputCost).toFixed(4)), durationText: timeText };
    }

    if (modelName === 'gemini-3.1-flash-lite-image') {
      const inputCost = (promptTokens / 1_000_000) * GOOGLE_IMAGE_LITE_INPUT_1M +
                        inputImages * (GOOGLE_IMAGE_LITE_IMAGE_TOKENS / 1_000_000) * GOOGLE_IMAGE_LITE_INPUT_1M;
      const outputCost = 0.03360;
      return { estimateUsd: parseFloat((inputCost + outputCost).toFixed(4)), durationText: '2–8 seconds' };
    }

    // 2. Custom GPU (Cloud Run us-central1 NVIDIA L4)
    if (modelName === 'flux-2-pro' || modelName === 'stable-diffusion-xl' || modelName === 'TRELLIS.2-4B' || modelName === 'GSplat') {
      const isZonal = PRICING_METADATA.gpu_zonal_redundancy;
      const secRate = isZonal ? GPU_ZONAL_RATE : GPU_NON_ZONAL_RATE;
      
      let warmSec = 30;
      let coldSec = 90;
      let durationText = '15–45 seconds';

      if (workflowId === 29) { // 3D asset
        warmSec = 120;
        coldSec = 300;
        durationText = '2–6 minutes';
      } else if (workflowId === 30) { // Scene
        warmSec = 180;
        coldSec = 450;
        durationText = '3–10 minutes';
      }

      // Cost ranges based on warm/cold bounds
      const minCost = secRate * warmSec;
      const maxCost = secRate * coldSec;
      // Return mid-point estimate or warm estimate
      return { estimateUsd: parseFloat(minCost.toFixed(4)), durationText: `${durationText} (Est. cost range: $${minCost.toFixed(3)}-$${maxCost.toFixed(3)})` };
    }

    // 3. Veo 3.1 Lite Video Models
    if (modelName === 'veo-3.1-lite') {
      if (workflowId === 27) {
        // Upscale
        return { estimateUsd: 0, durationText: '1–10 minutes', isPendingSku: true };
      }

      const duration = options.duration_seconds ?? 4;
      const hasAudio = options.audio ?? false;
      const res = options.resolution ?? '720p';

      let ratePerSec = 0.03; // 720p no audio
      if (res === '1080p') {
        ratePerSec = hasAudio ? 0.08 : 0.05;
      } else {
        ratePerSec = hasAudio ? 0.05 : 0.03;
      }

      return { estimateUsd: parseFloat((duration * ratePerSec).toFixed(2)), durationText: '1–5 minutes' };
    }

    // 4. Gemini Internal Text / Multimodal Analysis (moodboard swatches etc)
    if (modelName === 'gemini-2.5-flash') {
      return { estimateUsd: 0.005, durationText: '2–8 seconds' };
    }
    if (modelName === 'gemini-2.5-pro') {
      return { estimateUsd: 0.012, durationText: '3–12 seconds' };
    }

    return { estimateUsd: 0, durationText: 'unknown' };
  }
}

export class ActualUsageCostCalculator {
  static calculate(
    modelName: string,
    elapsedSec: number,
    options: {
      inputTokens?: number;
      outputTokens?: number;
      resolution?: string;
      duration_seconds?: number;
      audio?: boolean;
      input_images_count?: number;
    } = {}
  ): number {
    const inputImages = options.input_images_count ?? 1;
    const inputTokens = options.inputTokens ?? 1000;
    const resolution = options.resolution ?? '2K';

    if (modelName === 'gemini-3-pro-image') {
      const inputCost = (inputTokens / 1_000_000) * GOOGLE_IMAGE_PRO_INPUT_1M +
                        inputImages * (GOOGLE_IMAGE_PRO_IMAGE_TOKENS / 1_000_000) * GOOGLE_IMAGE_PRO_INPUT_1M;
      const outputCost = resolution === '4K' ? 0.2400 : 0.1344;
      return parseFloat((inputCost + outputCost).toFixed(5));
    }

    if (modelName === 'gemini-3.1-flash-image') {
      const inputCost = (inputTokens / 1_000_000) * GOOGLE_IMAGE_FLASH_INPUT_1M +
                        inputImages * (GOOGLE_IMAGE_FLASH_IMAGE_TOKENS / 1_000_000) * GOOGLE_IMAGE_FLASH_INPUT_1M;
      let outputCost = 0.10080;
      if (resolution === '512') outputCost = 0.04482;
      else if (resolution === '1K') outputCost = 0.06720;
      else if (resolution === '4K') outputCost = 0.15120;
      return parseFloat((inputCost + outputCost).toFixed(5));
    }

    if (modelName === 'gemini-3.1-flash-lite-image') {
      const inputCost = (inputTokens / 1_000_000) * GOOGLE_IMAGE_LITE_INPUT_1M +
                        inputImages * (GOOGLE_IMAGE_LITE_IMAGE_TOKENS / 1_000_000) * GOOGLE_IMAGE_LITE_INPUT_1M;
      return parseFloat((inputCost + 0.03360).toFixed(5));
    }

    if (modelName === 'flux-2-pro' || modelName === 'stable-diffusion-xl' || modelName === 'TRELLIS.2-4B' || modelName === 'GSplat') {
      // Cloud Run serverless GPU billing (billed per-second for request latency + 30-second idle self-termination window)
      const isZonal = PRICING_METADATA.gpu_zonal_redundancy;
      const rate = isZonal ? GPU_ZONAL_RATE : GPU_NON_ZONAL_RATE;
      return parseFloat(((elapsedSec + 30) * rate).toFixed(5));
    }

    if (modelName === 'veo-3.1-lite') {
      const duration = options.duration_seconds ?? 4;
      const hasAudio = options.audio ?? false;
      const res = options.resolution ?? '720p';

      let ratePerSec = 0.03;
      if (res === '1080p') {
        ratePerSec = hasAudio ? 0.08 : 0.05;
      } else {
        ratePerSec = hasAudio ? 0.05 : 0.03;
      }
      return parseFloat((duration * ratePerSec).toFixed(5));
    }

    return 0;
  }
}
