import { AiEditRequest, AiEditResult } from '../types/aiEdit';
import { RasterPromptBuilder } from './rasterPromptBuilder';

export class RasterAiService {
  /**
   * Dispatches an AI Edit task (Inpainting, Outpainting, Scribble-to-Render, Cutout).
   */
  static async executeAiEdit(request: AiEditRequest): Promise<AiEditResult> {
    const startTime = Date.now();
    const compiledPrompt = RasterPromptBuilder.buildPrompt(request.action, request.userPrompt);

    // Keep raster actions aligned with the current workflow registry. The old
    // numeric map pointed several actions at unrelated workflows after IDs moved.
    const workflowByAction: Record<AiEditRequest['action'], number> = {
      remove: 13,
      replace: 11,
      add: 9,
      material: 21,
      scribble: 2,
      outpaint: 9,
      cutout: 9,
    };
    const workflowId = workflowByAction[request.action];

    const scribbleInputs = request.action === 'scribble' && request.referenceImageBase64
      ? [
          {
            base64: request.referenceImageBase64,
            label: 'Authoritative Scribble Guide - preserve its exact silhouette and proportions',
            category: 'drawing',
            drawingType: 'Sketch / Line Drawing',
          },
          {
            base64: request.baseImageBase64,
            label: 'Original architectural scene to preserve outside the localized edit',
            category: 'reference',
            referenceAspects: ['All (Complete Theme & Mood)'],
          },
        ]
      : undefined;

    const payload = {
      workflow_id: workflowId,
      user_input: compiledPrompt,
      override_prompt: compiledPrompt,
      is_custom_edited: request.action === 'scribble',
      model: request.action === 'scribble'
        ? (request.model || 'flux-2-pro')
        : (request.model || 'gemini-3-pro-image'),
      image_style: 'realistic',
      uploaded_image: request.action === 'scribble' && request.referenceImageBase64
        ? request.referenceImageBase64
        : request.baseImageBase64,
      uploaded_images: scribbleInputs,
      mask_image: request.maskBase64,
      parameters: {
        resolution: '2K',
        aspect_ratio: request.aspectRatio,
        controlnet_enabled: true,
        controlnet_strength_percent: request.strength || 85,
        controlnet_conditioning_scale: (request.strength || 85) / 100,
      },
    };

    const res = await fetch('/api/ai-render/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`AI Edit API returned status ${res.status}`);
    }

    const jobData = await res.json();
    const jobId = jobData.jobId;

    // Poll until completion (up to 180s for complex 4K / inpainting renders)
    let attempts = 0;
    while (attempts < 180) {
      await new Promise(r => setTimeout(r, 1000));
      attempts++;

      const statusRes = await fetch(`/api/ai-render/jobs/${jobId}`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        if (statusData.status === 'completed' && statusData.outputs?.length > 0) {
          const outUrl = statusData.outputs[0].signed_url;
          return {
            imageUrl: outUrl,
            base64: outUrl,
            processingTimeMs: Date.now() - startTime,
            costEstimateUsd: statusData.actualCostUsdEstimate || 0.04,
          };
        } else if (statusData.status === 'failed') {
          throw new Error(statusData.error || 'AI generation failed');
        }
      }
    }

    throw new Error('AI Edit generation timed out. Please try again.');
  }
}
