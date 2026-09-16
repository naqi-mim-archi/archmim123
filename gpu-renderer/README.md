# Unified AI Renderer (Cloud Run GPU)

Real inference server that replaces the mock `unified-inference:latest` image behind the
`unified-ai-renderer` Cloud Run service (project `rendair-competitor`, region `us-central1`, 1x L4).

| App model id (UI unchanged) | Runs on the GPU | License |
|---|---|---|
| `stable-diffusion-xl` | SDXL 1.0 base + ControlNet canny/depth, img2img, inpaint | CreativeML Open RAIL++-M |
| `flux-2-pro` | FLUX.1 [schnell], 4-bit transformer, img2img, inpaint | Apache-2.0 |

How the request is handled:
- mask supplied -> inpainting (white = edit, black = keep)
- source image + SDXL -> ControlNet (`depth` if `controlnet_type` is `depth`, otherwise canny edges of the drawing)
- source image + Flux -> img2img (higher `controlnet_scale` = closer to the source)
- no image -> text-to-image
- Output keeps the source image's aspect ratio (no stretching); otherwise uses `aspect_ratio`. ~1 MP output.

Only one family (SDXL or Flux) is in VRAM at a time. Switching costs a reload (~30-90 s).

## API

`GET /` -> `{ "status": "healthy", "models_ready": true, "loaded_family": "sdxl", ... }`

`POST /render`
```json
{
  "model": "stable-diffusion-xl",            // or "flux-2-pro"
  "prompt": "photorealistic brick facade ...",
  "negative_prompt": "optional",
  "images": [{ "base64": "<png/jpeg base64 or data URI>", "category": "drawing", "drawing_type": "Elevation" }],
  "mask": { "base64": "<optional mask>" },
  "aspect_ratio": "16:9",
  "resolution": "2K",
  "controlnet_enabled": true,
  "controlnet_type": "lineart",               // "depth" uses the depth ControlNet
  "controlnet_scale": 0.8,
  "seed": 123                                 // optional; steps, guidance_scale, strength also optional
}
```
Response:
```json
{ "status": "success", "image_base64": "<png>", "mime_type": "image/png",
  "model_used": "stabilityai/stable-diffusion-xl-base-1.0", "seed": 123, "width": 1024, "height": 768, "timing_ms": 8400 }
```
Errors return HTTP 4xx/5xx. The app falls back to Gemini on any error, timeout, or missing image.

## Deploy (needs gcloud access to `rendair-competitor`)

```bash
gcloud config set project rendair-competitor

# 1. One-time: bucket that caches model weights (~45 GB after first boot)
gcloud storage buckets create gs://rendair-competitor-models --location=us-central1

# 2. Build and push over the mock image (Cloud Build; run from the repo root)
gcloud builds submit gpu-renderer --machine-type=e2-highcpu-8 --timeout=3600 \
  --tag us-central1-docker.pkg.dev/rendair-competitor/rendair-models/unified-inference:latest

# 3. Redeploy with the bucket mounted at /models
gcloud run deploy unified-ai-renderer \
  --image us-central1-docker.pkg.dev/rendair-competitor/rendair-models/unified-inference:latest \
  --region us-central1 --gpu 1 --gpu-type nvidia-l4 --cpu 8 --memory 32Gi --no-cpu-throttling \
  --min-instances 0 --max-instances 3 --concurrency 4 --timeout 900 \
  --add-volume name=models,type=cloud-storage,bucket=rendair-competitor-models \
  --add-volume-mount volume=models,mount-path=/models \
  --set-env-vars PRELOAD_FAMILY=sdxl
```

The Cloud Run service account needs write access to the bucket (first boot downloads weights into it):
```bash
gcloud storage buckets add-iam-policy-binding gs://rendair-competitor-models \
  --member=serviceAccount:443322162816-compute@developer.gserviceaccount.com --role=roles/storage.objectAdmin
```
(Replace with the service's actual service account if it is not the default compute account.)

If Hugging Face asks for a token for any model, create one, store it in Secret Manager as `hf-token`,
and add `--set-secrets HF_TOKEN=hf-token:latest` to the deploy command.

## Verify

```bash
curl https://unified-ai-renderer-443322162816.us-central1.run.app/
curl -X POST https://unified-ai-renderer-443322162816.us-central1.run.app/render \
  -H "Content-Type: application/json" \
  -d '{"model":"stable-diffusion-xl","prompt":"modern concrete villa at sunset, photorealistic"}'
```
The very first request after deploy downloads the weights and can take 10+ minutes; watch the logs:
`gcloud run services logs read unified-ai-renderer --region us-central1`.

## Turn it on in the app

In `.env.local`:
```
UNIFIED_RENDERER_URL=https://unified-ai-renderer-443322162816.us-central1.run.app
# UNIFIED_RENDERER_TIMEOUT_MS=300000
# UNIFIED_RENDERER_REQUIRE_AUTH=true   # after switching Cloud Run to "Require authentication"
```
Leave `UNIFIED_RENDERER_URL` empty to keep the current Gemini behaviour.

## Local contract test (no GPU)

```bash
pip install fastapi uvicorn pillow
RENDERER_BACKEND=mock uvicorn main:app --port 8089
```
Then set `UNIFIED_RENDERER_URL=http://127.0.0.1:8089`; renders return a placeholder image.

## Known limits
- SDXL's text encoder reads only the first ~77 tokens of the prompt; the app's long enhanced prompts get truncated.
- Flux has no ControlNet here (the commercial-use Flux ControlNets are for FLUX.1 [dev]), so sketch/plan fidelity is weaker than SDXL.
- Reference images beyond the first drawing are ignored (could add IP-Adapter later).
- Written without access to the GPU: expect small fixes on the first real deploy (library versions, memory).
