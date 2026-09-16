"""Unified AI Renderer - Cloud Run GPU service (1x NVIDIA L4, 24 GB VRAM).

App model id          -> what actually runs here
  stable-diffusion-xl -> SDXL 1.0 base (+ ControlNet canny/depth, img2img, inpaint)
  flux-2-pro          -> FLUX.1 [schnell] (Apache-2.0), 4-bit transformer (+ img2img, inpaint)

Only one model family is kept in VRAM at a time; switching families unloads the other.
Set RENDERER_BACKEND=mock to run without a GPU (returns a placeholder PNG) for contract tests.
"""

import base64
import gc
import io
import logging
import os
import random
import threading
import time
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from PIL import Image, ImageDraw
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("unified-ai-renderer")

BACKEND = os.environ.get("RENDERER_BACKEND", "gpu")  # "gpu" | "mock"
SDXL_REPO = os.environ.get("SDXL_REPO", "stabilityai/stable-diffusion-xl-base-1.0")
SDXL_VAE_REPO = os.environ.get("SDXL_VAE_REPO", "madebyollin/sdxl-vae-fp16-fix")
CONTROLNET_CANNY_REPO = os.environ.get("CONTROLNET_CANNY_REPO", "diffusers/controlnet-canny-sdxl-1.0")
CONTROLNET_DEPTH_REPO = os.environ.get("CONTROLNET_DEPTH_REPO", "diffusers/controlnet-depth-sdxl-1.0")
FLUX_REPO = os.environ.get("FLUX_REPO", "black-forest-labs/FLUX.1-schnell")
PRELOAD_FAMILY = os.environ.get("PRELOAD_FAMILY", "sdxl")  # "sdxl" | "flux" | "none"

MODEL_FAMILIES = {"stable-diffusion-xl": "sdxl", "flux-2-pro": "flux"}
DEFAULT_NEGATIVE = (
    "blurry, low quality, distorted geometry, warped walls, bent lines, extra windows, "
    "floating objects, text, watermark, logo, cartoon, oversaturated"
)
TARGET_PIXELS = {"1K": 1024 * 1024, "2K": 1024 * 1024, "4K": 1280 * 1280}  # L4-friendly caps

app = FastAPI(title="Unified AI Renderer")


class ImageInput(BaseModel):
    base64: str
    mime_type: Optional[str] = None
    category: Optional[str] = None
    drawing_type: Optional[str] = None
    label: Optional[str] = None


class RenderRequest(BaseModel):
    model: str
    prompt: str
    negative_prompt: Optional[str] = None
    images: List[ImageInput] = []
    mask: Optional[ImageInput] = None
    aspect_ratio: Optional[str] = "16:9"
    resolution: Optional[str] = "2K"
    controlnet_enabled: Optional[bool] = None
    controlnet_type: Optional[str] = None
    controlnet_scale: Optional[float] = None
    seed: Optional[int] = None
    steps: Optional[int] = None
    guidance_scale: Optional[float] = None
    strength: Optional[float] = None


# ---------------------------------------------------------------- image helpers

def decode_image(entry: ImageInput, mode: str = "RGB") -> Image.Image:
    raw = entry.base64.split(",", 1)[1] if entry.base64.startswith("data:") else entry.base64
    try:
        return Image.open(io.BytesIO(base64.b64decode(raw))).convert(mode)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {exc}")


def encode_png(image: Image.Image) -> str:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def parse_ratio(ratio: Optional[str]) -> float:
    try:
        w, h = (float(part) for part in (ratio or "16:9").split(":"))
        return w / h if w > 0 and h > 0 else 16 / 9
    except ValueError:
        return 16 / 9


def target_size(ratio: float, resolution: Optional[str]) -> tuple:
    pixels = TARGET_PIXELS.get((resolution or "2K").upper(), 1024 * 1024)
    height = (pixels / ratio) ** 0.5
    width = height * ratio
    snap = lambda v: max(512, int(round(v / 16)) * 16)
    return snap(width), snap(height)


def pick_source_image(images: List[ImageInput]) -> Optional[ImageInput]:
    drawings = [img for img in images if img.category == "drawing"]
    return (drawings or images or [None])[0]


def canny_map(image: Image.Image) -> Image.Image:
    import cv2
    import numpy as np

    edges = cv2.Canny(np.array(image.convert("L")), 80, 180)
    return Image.fromarray(np.stack([edges] * 3, axis=-1))


# ---------------------------------------------------------------- model manager

class ModelManager:
    def __init__(self):
        self.family: Optional[str] = None
        self.pipes: dict = {}
        self.lock = threading.Lock()  # one inference at a time per GPU
        self.ready = threading.Event()

    def unload(self):
        import torch

        self.pipes.clear()
        self.family = None
        gc.collect()
        torch.cuda.empty_cache()

    def ensure(self, family: str):
        if self.family == family:
            return
        self.unload()
        started = time.time()
        log.info("Loading model family %s", family)
        if family == "sdxl":
            self._load_sdxl()
        else:
            self._load_flux()
        self.family = family
        log.info("Loaded %s in %.1fs", family, time.time() - started)

    def _load_sdxl(self):
        import torch
        from diffusers import (
            AutoencoderKL,
            ControlNetModel,
            StableDiffusionXLControlNetPipeline,
            StableDiffusionXLImg2ImgPipeline,
            StableDiffusionXLInpaintPipeline,
            StableDiffusionXLPipeline,
        )

        dtype = torch.float16
        vae = AutoencoderKL.from_pretrained(SDXL_VAE_REPO, torch_dtype=dtype)
        base = StableDiffusionXLPipeline.from_pretrained(
            SDXL_REPO, vae=vae, torch_dtype=dtype, variant="fp16", use_safetensors=True
        ).to("cuda")
        canny = ControlNetModel.from_pretrained(CONTROLNET_CANNY_REPO, torch_dtype=dtype).to("cuda")
        depth = ControlNetModel.from_pretrained(CONTROLNET_DEPTH_REPO, torch_dtype=dtype).to("cuda")
        self.pipes = {
            "txt2img": base,
            "img2img": StableDiffusionXLImg2ImgPipeline.from_pipe(base),
            "inpaint": StableDiffusionXLInpaintPipeline.from_pipe(base),
            "control_canny": StableDiffusionXLControlNetPipeline.from_pipe(base, controlnet=canny),
            "control_depth": StableDiffusionXLControlNetPipeline.from_pipe(base, controlnet=depth),
        }

    def _load_flux(self):
        import torch
        from diffusers import BitsAndBytesConfig as DiffusersBnbConfig
        from diffusers import FluxImg2ImgPipeline, FluxInpaintPipeline, FluxPipeline, FluxTransformer2DModel
        from transformers import BitsAndBytesConfig as TransformersBnbConfig
        from transformers import T5EncoderModel

        dtype = torch.bfloat16
        transformer = FluxTransformer2DModel.from_pretrained(
            FLUX_REPO,
            subfolder="transformer",
            torch_dtype=dtype,
            quantization_config=DiffusersBnbConfig(
                load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_compute_dtype=dtype
            ),
        )
        text_encoder_2 = T5EncoderModel.from_pretrained(
            FLUX_REPO,
            subfolder="text_encoder_2",
            torch_dtype=dtype,
            quantization_config=TransformersBnbConfig(load_in_8bit=True),
        )
        base = FluxPipeline.from_pretrained(
            FLUX_REPO, transformer=transformer, text_encoder_2=text_encoder_2, torch_dtype=dtype
        ).to("cuda")
        self.pipes = {
            "txt2img": base,
            "img2img": FluxImg2ImgPipeline.from_pipe(base),
            "inpaint": FluxInpaintPipeline.from_pipe(base),
        }


manager = ModelManager()


def preload():
    try:
        if BACKEND == "gpu" and PRELOAD_FAMILY in ("sdxl", "flux"):
            manager.ensure(PRELOAD_FAMILY)
    except Exception:
        log.exception("Model preload failed; models will load on first request")
    finally:
        manager.ready.set()


@app.on_event("startup")
def on_startup():
    threading.Thread(target=preload, daemon=True).start()


# ---------------------------------------------------------------- inference

def run_sdxl(req: RenderRequest, seed: int) -> Image.Image:
    import torch

    source = pick_source_image(req.images)
    source_image = decode_image(source) if source else None
    ratio = source_image.width / source_image.height if source_image else parse_ratio(req.aspect_ratio)
    width, height = target_size(ratio, req.resolution)
    common = dict(
        prompt=req.prompt,
        negative_prompt=req.negative_prompt or DEFAULT_NEGATIVE,
        num_inference_steps=req.steps or 30,
        guidance_scale=req.guidance_scale if req.guidance_scale is not None else 6.5,
        generator=torch.Generator("cuda").manual_seed(seed),
    )

    if source_image and req.mask:
        mask = decode_image(req.mask, "L").resize((width, height))
        return manager.pipes["inpaint"](
            image=source_image.resize((width, height)), mask_image=mask, width=width, height=height,
            strength=req.strength if req.strength is not None else 0.99, **common
        ).images[0]

    if source_image and req.controlnet_enabled is not False:
        use_depth = (req.controlnet_type or "").lower() == "depth"
        control = source_image.resize((width, height))
        if not use_depth:
            control = canny_map(control)
        pipe = manager.pipes["control_depth" if use_depth else "control_canny"]
        return pipe(
            image=control, width=width, height=height,
            controlnet_conditioning_scale=req.controlnet_scale if req.controlnet_scale is not None else 0.8,
            **common
        ).images[0]

    if source_image:
        return manager.pipes["img2img"](
            image=source_image.resize((width, height)),
            strength=req.strength if req.strength is not None else 0.6, **common
        ).images[0]

    return manager.pipes["txt2img"](width=width, height=height, **common).images[0]


def run_flux(req: RenderRequest, seed: int) -> Image.Image:
    import torch

    source = pick_source_image(req.images)
    source_image = decode_image(source) if source else None
    ratio = source_image.width / source_image.height if source_image else parse_ratio(req.aspect_ratio)
    width, height = target_size(ratio, req.resolution)
    common = dict(
        prompt=req.prompt,
        num_inference_steps=req.steps or 4,  # schnell is distilled for 1-4 steps
        guidance_scale=req.guidance_scale if req.guidance_scale is not None else 0.0,
        max_sequence_length=256,
        width=width,
        height=height,
        generator=torch.Generator("cuda").manual_seed(seed),
    )

    if source_image and req.mask:
        mask = decode_image(req.mask, "L").resize((width, height))
        return manager.pipes["inpaint"](
            image=source_image.resize((width, height)), mask_image=mask,
            strength=req.strength if req.strength is not None else 0.95, **common
        ).images[0]

    if source_image:
        # No commercially licensed Flux ControlNet for schnell: img2img keeps layout; lower strength = closer to source.
        default_strength = 1.0 - 0.6 * (req.controlnet_scale if req.controlnet_scale is not None else 0.8)
        return manager.pipes["img2img"](
            image=source_image.resize((width, height)),
            strength=req.strength if req.strength is not None else max(0.3, default_strength), **common
        ).images[0]

    return manager.pipes["txt2img"](**common).images[0]


def mock_render(req: RenderRequest, seed: int) -> Image.Image:
    width, height = target_size(parse_ratio(req.aspect_ratio), req.resolution)
    image = Image.new("RGB", (width // 4, height // 4), (random.Random(seed).randint(0, 255), 120, 160))
    ImageDraw.Draw(image).text((10, 10), f"MOCK {req.model}", fill=(255, 255, 255))
    return image


@app.get("/")
def read_root():
    return {
        "status": "healthy",
        "service": "unified-ai-renderer",
        "backend": BACKEND,
        "models_ready": manager.ready.is_set(),
        "loaded_family": manager.family,
    }


@app.post("/render")
def render(req: RenderRequest):
    family = MODEL_FAMILIES.get(req.model)
    if not family:
        raise HTTPException(status_code=400, detail=f"Unsupported model '{req.model}'. Use one of {list(MODEL_FAMILIES)}")
    if not req.prompt.strip():
        raise HTTPException(status_code=400, detail="prompt is required")

    seed = req.seed if req.seed is not None else random.randint(0, 2**31 - 1)
    started = time.time()
    if BACKEND == "mock":
        image = mock_render(req, seed)
    else:
        manager.ready.wait()
        with manager.lock:
            manager.ensure(family)
            image = run_sdxl(req, seed) if family == "sdxl" else run_flux(req, seed)

    elapsed_ms = int((time.time() - started) * 1000)
    log.info("Rendered %s (%sx%s) seed=%s in %sms", req.model, image.width, image.height, seed, elapsed_ms)
    return {
        "status": "success",
        "image_base64": encode_png(image),
        "mime_type": "image/png",
        "model_used": SDXL_REPO if family == "sdxl" else FLUX_REPO,
        "seed": seed,
        "width": image.width,
        "height": image.height,
        "timing_ms": elapsed_ms,
    }
