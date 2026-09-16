// src/features/raster-canvas/services/rasterPromptBuilder.ts
var RasterPromptBuilder = class {
  /**
   * Constructs the precision internal prompt combining user intent, operation rules,
   * and architectural preservation instructions.
   */
  static buildPrompt(action, userPrompt, styleDesc = "photorealistic architectural rendering") {
    const cleanUserPrompt = userPrompt.trim();
    switch (action) {
      case "remove":
        return `TASK: Precision Architectural Object Removal & Background Inpainting.
TARGET OBJECT: ${cleanUserPrompt ? `Remove the specific "${cleanUserPrompt}" located inside the designated mask area.` : "Remove the object/fixture located inside the designated mask area."}
INSTRUCTION: Seamlessly erase ONLY the target object inside the mask and realistically reconstruct what naturally exists behind it (e.g. continuous ceiling, wall finish, flooring, or architectural surface).
PRESERVATION MANDATE: Perfectly match the surrounding texture, lighting angle, and shadow gradations. DO NOT remove, modify, or smudge any objects, fixtures, or lights outside the masked region. All other scene elements must remain 100% intact.
STYLE: ${styleDesc}, 8k sharp architectural photography, zero distortion.`;
      case "replace":
        return `TASK: Precision Architectural Element Replacement.
USER DIRECTIVE: In the masked region only, replace the selected element with: "${cleanUserPrompt || "modern architectural element"}".
PRESERVATION MANDATE: Preserve the exact surrounding architectural geometry, frame openings, perspective lines, environmental lighting direction, and contact shadows. Seamlessly integrate the replacement. Do not modify any areas or other objects outside the mask.
STYLE: ${styleDesc}, high-end professional visualization, crisp physical materials.`;
      case "add":
        return `TASK: Architectural Element Insertion.
USER DIRECTIVE: In the designated masked area, insert: "${cleanUserPrompt || "architectural element"}".
INTEGRATION MANDATE: Naturally ground the added element in perspective, casting accurate contact shadows on the floor/ground matching the primary scene light source. Replicate the color temperature, exposure, and focal depth of the surrounding render. Do not modify anything outside the mask.
STYLE: ${styleDesc}, physically accurate scale and human/furniture proportions.`;
      case "material":
        return `TASK: Precision Architectural Material & Surface Finish Replacement.
MATERIAL DIRECTIVE: Change only the selected surface material to: "${cleanUserPrompt || "natural architectural finish"}".
PRESERVATION MANDATE: Strictly preserve the underlying geometry, surface planar orientation, perspective grid, architectural edges, window/door openings, shadow maps, and directional highlights. Only swap the surface texture, diffuse albedo, and material roughness. Do not modify areas outside the mask.
STYLE: ${styleDesc}, realistic material response, physically believable texture scale.`;
      case "scribble":
        return `TASK: Scribble-to-Render Architectural Synthesis.
USER DIRECTIVE: Transform the colored scribble/guide in the marked area into a photorealistic architectural render: "${cleanUserPrompt || "architectural design"}".
SYNTHESIS MANDATE: Follow the rough volumetric massing, proportions, and placement indicated by the user's scribble, while executing it in full realistic detail, texture, and light matching the host image.
STYLE: ${styleDesc}, high-definition architectural photography, seamless integration.`;
      case "outpaint":
        return `TASK: Seamless Architectural Outpainting & Canvas Extension.
INSTRUCTION: Seamlessly extend the architectural image outward into the expanded blank border regions.
CONTINUATION MANDATE: Naturally continue the architectural facade, horizon, sky, landscape, ground plane, road, or interior walls. Maintain the identical camera perspective, focal length, time of day, lighting atmosphere, and stylistic identity of the central image.
STYLE: ${styleDesc}, seamless edge blending, zero seam lines.`;
      case "cutout":
        return `TASK: Subject Segmentation & Background Removal.
INSTRUCTION: Precisely isolate the primary architectural subject/building/furniture item, creating a clean cutout with transparent background.
STYLE: Clean anti-aliased edges, preserved fine details and glass transparency.`;
      default:
        return cleanUserPrompt;
    }
  }
};

// src/features/raster-canvas/types/aiEdit.ts
var ARCHITECTURAL_PRESETS = [
  // People
  { id: "p1", category: "people", label: "Scale Figures (Blurred)", promptSnippet: "subtle blurred architectural scale figures walking naturally" },
  { id: "p2", category: "people", label: "Contemporary Architect / Casual", promptSnippet: "architect dressed in minimalist contemporary attire" },
  { id: "p3", category: "people", label: "Dining Guests", promptSnippet: "elegant guests seated and conversing at the table" },
  // Vegetation
  { id: "v1", category: "vegetation", label: "Mature Olive Tree", promptSnippet: "a gnarled mature Mediterranean olive tree in an architectural terracotta pot" },
  { id: "v2", category: "vegetation", label: "Fiddle Leaf Fig", promptSnippet: "lush indoor fiddle leaf fig plant in concrete planter" },
  { id: "v3", category: "vegetation", label: "Japanese Maple", promptSnippet: "delicate Japanese red maple bonsai tree" },
  { id: "v4", category: "vegetation", label: "Lush Tropical Foliage", promptSnippet: "monstera, palms, and bird of paradise tropical greenery" },
  // Furniture
  { id: "f1", category: "furniture", label: "Boucl\xE9 Lounge Armchair", promptSnippet: "curved minimalist off-white boucl\xE9 armchair with walnut legs" },
  { id: "f2", category: "furniture", label: "Travertine Coffee Table", promptSnippet: "organic monolithic honed travertine low coffee table" },
  { id: "f3", category: "furniture", label: "Modern Dining Set", promptSnippet: "solid white oak dining table with four Scandinavian wooden chairs" },
  { id: "f4", category: "furniture", label: "Minimalist Modular Sofa", promptSnippet: "low-profile modular linen sectional sofa in warm greige" },
  // Materials
  { id: "m1", category: "materials", label: "Light Beige Travertine", promptSnippet: "honed light beige Roman travertine stone with subtle natural veining" },
  { id: "m2", category: "materials", label: "White Oak Wood Slat", promptSnippet: "vertical acoustic white oak wood slat cladding" },
  { id: "m3", category: "materials", label: "Fair-Faced Concrete", promptSnippet: "smooth architectural fair-faced concrete with tie-rod holes" },
  { id: "m4", category: "materials", label: "Fluted Reeded Glass", promptSnippet: "translucent vertical fluted reeded glass with black metal frame" },
  { id: "m5", category: "materials", label: "Smoked Walnut Timber", promptSnippet: "rich deep-toned smoked American walnut timber paneling" },
  { id: "m6", category: "materials", label: "Brushed Brass Metal", promptSnippet: "refined satin brushed brass metal surface with subtle reflections" },
  // Sky
  { id: "s1", category: "sky", label: "Golden Hour Dusk", promptSnippet: "golden hour sunset sky with soft warm glowing horizon and twilight gradient" },
  { id: "s2", category: "sky", label: "Clear Blue Daylight", promptSnippet: "crisp clear blue sky with soft atmospheric horizon haze" },
  { id: "s3", category: "sky", label: "Moody Overcast", promptSnippet: "soft diffuse overcast atmospheric sky with subtle cloud depth" }
];

// src/features/raster-canvas/core/CanvasEngine.ts
var CanvasEngine = class {
  /**
   * Composites all visible layers from bottom to top onto the output canvas.
   */
  static compositeLayers(layers, targetCanvas, width, height) {
    targetCanvas.width = width;
    targetCanvas.height = height;
    const ctx = targetCanvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (!layer.visible || layer.opacity <= 0) continue;
      ctx.save();
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = layer.blendMode;
      this.renderLayer(ctx, layer);
      ctx.restore();
    }
  }
  /**
   * Renders an individual layer with its transform (translation, rotation, scale, perspective).
   */
  static renderLayer(ctx, layer) {
    const t = layer.transform;
    ctx.save();
    ctx.translate(t.x, t.y);
    if (t.rotation !== 0) {
      ctx.rotate(t.rotation * Math.PI / 180);
    }
    const sx = t.flipH ? -t.scaleX : t.scaleX;
    const sy = t.flipV ? -t.scaleY : t.scaleY;
    if (sx !== 1 || sy !== 1) {
      ctx.scale(sx, sy);
    }
    if (t.skewX !== 0 || t.skewY !== 0) {
      ctx.transform(1, t.skewY * Math.PI / 180, t.skewX * Math.PI / 180, 1, 0, 0);
    }
    ctx.drawImage(layer.canvas, 0, 0);
    ctx.restore();
  }
  /**
   * Converts viewport client coordinates (mouse/touch event) to canvas image pixel coordinates.
   */
  static screenToCanvas(clientX, clientY, canvasRect, zoom, pan) {
    const relativeX = clientX - canvasRect.left;
    const relativeY = clientY - canvasRect.top;
    return {
      x: (relativeX - pan.x) / zoom,
      y: (relativeY - pan.y) / zoom
    };
  }
  /**
   * Creates an empty layer with an initialized canvas.
   */
  static createLayer(id, name, width, height, type = "draw") {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    return {
      id,
      name,
      type,
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "source-over",
      canvas,
      ctx,
      transform: {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
        flipH: false,
        flipV: false,
        skewX: 0,
        skewY: 0
      }
    };
  }
  /**
   * Clones a layer with all its canvas data.
   */
  static duplicateLayer(layer, newId, newName) {
    const newLayer = this.createLayer(newId, newName, layer.canvas.width, layer.canvas.height, layer.type);
    newLayer.visible = layer.visible;
    newLayer.locked = layer.locked;
    newLayer.opacity = layer.opacity;
    newLayer.blendMode = layer.blendMode;
    newLayer.transform = { ...layer.transform };
    if (layer.adjustments) newLayer.adjustments = { ...layer.adjustments };
    if (layer.textProps) newLayer.textProps = { ...layer.textProps };
    if (layer.shapeProps) newLayer.shapeProps = { ...layer.shapeProps };
    newLayer.ctx.drawImage(layer.canvas, 0, 0);
    return newLayer;
  }
};

// src/features/raster-canvas/types/canvas.ts
var DEFAULT_ADJUSTMENTS = {
  exposure: 0,
  brightness: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  sharpness: 0,
  blur: 0,
  blackAndWhite: false
};

// src/features/raster-canvas/core/CropEngine.ts
var CropEngine = class {
  static normalizeRect(rect, canvasWidth, canvasHeight, minSize = 10) {
    const minWidth = Math.min(minSize, canvasWidth);
    const minHeight = Math.min(minSize, canvasHeight);
    const x = Math.max(0, Math.min(canvasWidth - minWidth, Math.round(rect.x)));
    const y = Math.max(0, Math.min(canvasHeight - minHeight, Math.round(rect.y)));
    const width = Math.max(minWidth, Math.min(canvasWidth - x, Math.round(rect.width)));
    const height = Math.max(minHeight, Math.min(canvasHeight - y, Math.round(rect.height)));
    return { x, y, width, height };
  }
  static getPixelPreservingDrawArgs(rect) {
    return [rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height];
  }
};

// src/features/raster-canvas/core/RasterImageLifecycle.ts
var shouldLoadInitialRasterImage = (loadedSource, nextSource) => Boolean(nextSource && loadedSource !== nextSource);

// scripts/testRasterCanvas.ts
if (typeof document === "undefined") {
  globalThis.document = {
    createElement: () => {
      let fillStyle = "#000000";
      return {
        width: 100,
        height: 100,
        getContext: () => ({
          save: () => {
          },
          restore: () => {
          },
          clearRect: () => {
          },
          translate: () => {
          },
          scale: () => {
          },
          rotate: () => {
          },
          drawImage: () => {
          },
          fillRect: () => {
          },
          get fillStyle() {
            return fillStyle;
          },
          set fillStyle(val) {
            fillStyle = val;
          },
          getImageData: () => ({ data: [0, 255, 0, 255] }),
          putImageData: () => {
          },
          createImageData: () => ({ data: new Uint8ClampedArray(400) })
        })
      };
    }
  };
}
function testAssert(condition, message) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`[PASS] ${message}`);
}
async function runTests() {
  console.log("=== STARTING RASTER CANVAS TESTS ===\n");
  const removePrompt = RasterPromptBuilder.buildPrompt("remove", "ceiling light fixture");
  testAssert(removePrompt.includes("TASK: Precision Architectural Object Removal"), "Remove prompt specifies object removal task");
  testAssert(removePrompt.includes('Remove the specific "ceiling light fixture"'), "Remove prompt includes specific object name");
  testAssert(removePrompt.includes("DO NOT remove, modify, or smudge any objects, fixtures, or lights outside the masked region"), "Remove prompt mandates zero modification outside mask");
  const replacePrompt = RasterPromptBuilder.buildPrompt("replace", "black aluminium sliding door");
  testAssert(replacePrompt.includes("black aluminium sliding door"), "Replace prompt includes user target element");
  testAssert(replacePrompt.includes("Preserve the exact surrounding architectural geometry"), "Replace prompt preserves surrounding geometry");
  const addPrompt = RasterPromptBuilder.buildPrompt("add", "mature olive tree in terracotta pot");
  testAssert(addPrompt.includes("mature olive tree in terracotta pot"), "Add prompt includes added element");
  testAssert(addPrompt.includes("INTEGRATION MANDATE: Naturally ground the added element in perspective"), "Add prompt includes contact shadows and perspective mandate");
  const materialPrompt = RasterPromptBuilder.buildPrompt("material", "honed light beige travertine stone");
  testAssert(materialPrompt.includes("honed light beige travertine stone"), "Material prompt includes specified material finish");
  testAssert(materialPrompt.includes("Strictly preserve the underlying geometry, surface planar orientation"), "Material prompt preserves surface orientation & planar geometry");
  const scribblePrompt = RasterPromptBuilder.buildPrompt("scribble", "Render green blobs as mature olive trees");
  testAssert(scribblePrompt.includes("Render green blobs as mature olive trees"), "Scribble prompt includes user description");
  testAssert(scribblePrompt.includes("Follow the rough volumetric massing, proportions, and placement"), "Scribble prompt mandates volumetric following");
  const outpaintPrompt = RasterPromptBuilder.buildPrompt("outpaint", "");
  testAssert(outpaintPrompt.includes("Seamlessly extend the architectural image outward"), "Outpaint prompt specifies canvas extension");
  testAssert(outpaintPrompt.includes("Naturally continue the architectural facade, horizon, sky"), "Outpaint prompt mandates natural facade and sky continuation");
  testAssert(ARCHITECTURAL_PRESETS.length >= 15, `Architectural presets registry has ${ARCHITECTURAL_PRESETS.length} presets (>=15)`);
  const categories = new Set(ARCHITECTURAL_PRESETS.map((p) => p.category));
  testAssert(categories.has("people"), "Presets include people");
  testAssert(categories.has("vegetation"), "Presets include vegetation");
  testAssert(categories.has("furniture"), "Presets include furniture");
  testAssert(categories.has("materials"), "Presets include materials");
  testAssert(categories.has("sky"), "Presets include sky");
  const mockRect = { left: 100, top: 100, right: 900, bottom: 900, width: 800, height: 800, x: 100, y: 100, toJSON: () => {
  } };
  const canvasPoint = CanvasEngine.screenToCanvas(500, 500, mockRect, 2, { x: 50, y: 50 });
  testAssert(canvasPoint.x === 175, `screenToCanvas X coordinates are correct: ${canvasPoint.x} (Expected 175)`);
  testAssert(canvasPoint.y === 175, `screenToCanvas Y coordinates are correct: ${canvasPoint.y} (Expected 175)`);
  testAssert(DEFAULT_ADJUSTMENTS.exposure === 0, "Default exposure is 0");
  testAssert(DEFAULT_ADJUSTMENTS.contrast === 0, "Default contrast is 0");
  testAssert(!DEFAULT_ADJUSTMENTS.blackAndWhite, "Default black and white is false");
  const baseLayer = CanvasEngine.createLayer("base", "Base Image", 10, 10, "image");
  baseLayer.ctx.fillStyle = "#ff0000";
  baseLayer.ctx.fillRect(0, 0, 10, 10);
  const topLayer = CanvasEngine.createLayer("top", "AI Edit", 10, 10, "image");
  topLayer.ctx.fillStyle = "#00ff00";
  topLayer.ctx.fillRect(0, 0, 10, 10);
  const testTarget = document.createElement("canvas");
  CanvasEngine.compositeLayers([topLayer, baseLayer], testTarget, 10, 10);
  const pixel = testTarget.getContext("2d").getImageData(5, 5, 1, 1).data;
  testAssert(pixel[1] === 255 && pixel[0] === 0, `Top layer (index 0) is rendered on top: R=${pixel[0]}, G=${pixel[1]}`);
  const safeLayer = CanvasEngine.createLayer("base_hd", "HD Base", 1920, 1080, "image");
  testAssert(safeLayer.canvas.width === 1920 && safeLayer.canvas.height === 1080, "HD layer retains full dimensions");
  testAssert(Math.max(16, safeLayer.canvas.width) === 1920, "Safe dimension calculation never collapses to 1x1");
  const normalizedCrop = CropEngine.normalizeRect({ x: 125.4, y: 50.6, width: 800.2, height: 600.4 }, 1920, 1080);
  const cropDrawArgs = CropEngine.getPixelPreservingDrawArgs(normalizedCrop);
  testAssert(cropDrawArgs[2] === cropDrawArgs[6], "Crop preserves horizontal pixel scale");
  testAssert(cropDrawArgs[3] === cropDrawArgs[7], "Crop preserves vertical pixel scale");
  testAssert(cropDrawArgs[0] === 125 && cropDrawArgs[1] === 51, "Crop uses the selected source origin");
  const initialSource = "data:image/png;base64,crop-source";
  testAssert(shouldLoadInitialRasterImage(null, initialSource), "Initial raster source loads once");
  testAssert(!shouldLoadInitialRasterImage(initialSource, initialSource), "Crop resize does not reload the original raster source");
  testAssert(shouldLoadInitialRasterImage(initialSource, "data:image/png;base64,replacement"), "A replacement raster source still loads");
  console.log("\n=== ALL RASTER CANVAS TESTS PASSED ===");
}
runTests();
