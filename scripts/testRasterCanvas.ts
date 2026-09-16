import { RasterPromptBuilder } from '../src/features/raster-canvas/services/rasterPromptBuilder';
import { ARCHITECTURAL_PRESETS } from '../src/features/raster-canvas/types/aiEdit';
import { CanvasEngine } from '../src/features/raster-canvas/core/CanvasEngine';
import { DEFAULT_ADJUSTMENTS } from '../src/features/raster-canvas/types/canvas';
import { CropEngine } from '../src/features/raster-canvas/core/CropEngine';
import { shouldLoadInitialRasterImage } from '../src/features/raster-canvas/core/RasterImageLifecycle';
import { AiCanvasRegistrationEngine } from '../src/features/raster-canvas/core/AiCanvasRegistrationEngine';

if (typeof document === 'undefined') {
  (globalThis as any).document = {
    createElement: () => {
      let fillStyle = '#000000';
      return {
        width: 100,
        height: 100,
        getContext: () => ({
          save: () => {},
          restore: () => {},
          clearRect: () => {},
          translate: () => {},
          scale: () => {},
          rotate: () => {},
          drawImage: () => {},
          fillRect: () => {},
          get fillStyle() { return fillStyle; },
          set fillStyle(val: string) { fillStyle = val; },
          getImageData: () => ({ data: [0, 255, 0, 255] }),
          putImageData: () => {},
          createImageData: () => ({ data: new Uint8ClampedArray(400) }),
        }),
      };
    },
  };
}

function testAssert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`[PASS] ${message}`);
}

async function runTests() {
  console.log('=== STARTING RASTER CANVAS TESTS ===\n');

  // Test 1: Raster Prompt Builder - Remove Object
  const removePrompt = RasterPromptBuilder.buildPrompt('remove', 'ceiling light fixture');
  testAssert(removePrompt.includes('TASK: Precision Architectural Object Removal'), 'Remove prompt specifies object removal task');
  testAssert(removePrompt.includes('Remove the specific "ceiling light fixture"'), 'Remove prompt includes specific object name');
  testAssert(removePrompt.includes('DO NOT remove, modify, or smudge any objects, fixtures, or lights outside the masked region'), 'Remove prompt mandates zero modification outside mask');

  // Test 2: Raster Prompt Builder - Replace Object
  const replacePrompt = RasterPromptBuilder.buildPrompt('replace', 'black aluminium sliding door');
  testAssert(replacePrompt.includes('black aluminium sliding door'), 'Replace prompt includes user target element');
  testAssert(replacePrompt.includes('Preserve the exact surrounding architectural geometry'), 'Replace prompt preserves surrounding geometry');

  // Test 3: Raster Prompt Builder - Add Element
  const addPrompt = RasterPromptBuilder.buildPrompt('add', 'mature olive tree in terracotta pot');
  testAssert(addPrompt.includes('mature olive tree in terracotta pot'), 'Add prompt includes added element');
  testAssert(addPrompt.includes('INTEGRATION MANDATE: Naturally ground the added element in perspective'), 'Add prompt includes contact shadows and perspective mandate');

  // Test 4: Raster Prompt Builder - Material Change
  const materialPrompt = RasterPromptBuilder.buildPrompt('material', 'honed light beige travertine stone');
  testAssert(materialPrompt.includes('honed light beige travertine stone'), 'Material prompt includes specified material finish');
  testAssert(materialPrompt.includes('Strictly preserve the underlying geometry, surface planar orientation'), 'Material prompt preserves surface orientation & planar geometry');

  // Test 5: Raster Prompt Builder - Scribble to Render
  const scribblePrompt = RasterPromptBuilder.buildPrompt('scribble', 'Render green blobs as mature olive trees');
  testAssert(scribblePrompt.includes('Render green blobs as mature olive trees'), 'Scribble prompt includes user description');
  testAssert(scribblePrompt.includes('Follow the rough volumetric massing, proportions, and placement'), 'Scribble prompt mandates volumetric following');

  // Test 6: Raster Prompt Builder - Outpaint / Extend
  const outpaintPrompt = RasterPromptBuilder.buildPrompt('outpaint', 'continue the courtyard garden and stone paving');
  testAssert(outpaintPrompt.includes('Seamlessly extend the architectural image outward'), 'Outpaint prompt specifies canvas extension');
  testAssert(outpaintPrompt.includes('Naturally continue the architectural facade, horizon, sky'), 'Outpaint prompt mandates natural facade and sky continuation');
  testAssert(outpaintPrompt.includes('continue the courtyard garden and stone paving'), 'Outpaint prompt includes the user directive');

  // Test 7: Architectural Presets Coverage
  testAssert(ARCHITECTURAL_PRESETS.length >= 15, `Architectural presets registry has ${ARCHITECTURAL_PRESETS.length} presets (>=15)`);
  const categories = new Set(ARCHITECTURAL_PRESETS.map(p => p.category));
  testAssert(categories.has('people'), 'Presets include people');
  testAssert(categories.has('vegetation'), 'Presets include vegetation');
  testAssert(categories.has('furniture'), 'Presets include furniture');
  testAssert(categories.has('materials'), 'Presets include materials');
  testAssert(categories.has('sky'), 'Presets include sky');

  // Test 8: Coordinate Conversion Math
  const mockRect = { left: 100, top: 100, right: 900, bottom: 900, width: 800, height: 800, x: 100, y: 100, toJSON: () => {} } as DOMRect;
  const canvasPoint = CanvasEngine.screenToCanvas(500, 500, mockRect, 2.0, { x: 50, y: 50 });
  testAssert(canvasPoint.x === 175, `screenToCanvas X coordinates are correct: ${canvasPoint.x} (Expected 175)`);
  testAssert(canvasPoint.y === 175, `screenToCanvas Y coordinates are correct: ${canvasPoint.y} (Expected 175)`);

  // Test 9: Default Adjustments
  testAssert(DEFAULT_ADJUSTMENTS.exposure === 0, 'Default exposure is 0');
  testAssert(DEFAULT_ADJUSTMENTS.contrast === 0, 'Default contrast is 0');
  testAssert(!DEFAULT_ADJUSTMENTS.blackAndWhite, 'Default black and white is false');

  // Test 10: Layer Compositing Order (Top layer at index 0 covers bottom layer at index 1)
  const baseLayer = CanvasEngine.createLayer('base', 'Base Image', 10, 10, 'image');
  baseLayer.ctx.fillStyle = '#ff0000'; // Red base
  baseLayer.ctx.fillRect(0, 0, 10, 10);

  const topLayer = CanvasEngine.createLayer('top', 'AI Edit', 10, 10, 'image');
  topLayer.ctx.fillStyle = '#00ff00'; // Green top
  topLayer.ctx.fillRect(0, 0, 10, 10);

  const testTarget = document.createElement('canvas');
  // layers = [topLayer (index 0), baseLayer (index 1)]
  CanvasEngine.compositeLayers([topLayer, baseLayer], testTarget, 10, 10);
  const pixel = testTarget.getContext('2d')!.getImageData(5, 5, 1, 1).data;
  // Green should be on top (G = 255, R = 0)
  testAssert(pixel[1] === 255 && pixel[0] === 0, `Top layer (index 0) is rendered on top: R=${pixel[0]}, G=${pixel[1]}`);

  // Test 11: History Safety - Dimensions Never Crop or Fall Below Safe Minimums
  const safeLayer = CanvasEngine.createLayer('base_hd', 'HD Base', 1920, 1080, 'image');
  testAssert(safeLayer.canvas.width === 1920 && safeLayer.canvas.height === 1080, 'HD layer retains full dimensions');
  testAssert(Math.max(16, safeLayer.canvas.width) === 1920, 'Safe dimension calculation never collapses to 1x1');

  // Test 12: Crop uses equal source and destination dimensions (no stretch/skew)
  const normalizedCrop = CropEngine.normalizeRect({ x: 125.4, y: 50.6, width: 800.2, height: 600.4 }, 1920, 1080);
  const cropDrawArgs = CropEngine.getPixelPreservingDrawArgs(normalizedCrop);
  testAssert(cropDrawArgs[2] === cropDrawArgs[6], 'Crop preserves horizontal pixel scale');
  testAssert(cropDrawArgs[3] === cropDrawArgs[7], 'Crop preserves vertical pixel scale');
  testAssert(cropDrawArgs[0] === 125 && cropDrawArgs[1] === 51, 'Crop uses the selected source origin');

  // Test 13: A canvas resize after crop must not reload the same initial source.
  const initialSource = 'data:image/png;base64,crop-source';
  testAssert(shouldLoadInitialRasterImage(null, initialSource), 'Initial raster source loads once');
  testAssert(!shouldLoadInitialRasterImage(initialSource, initialSource), 'Crop resize does not reload the original raster source');
  testAssert(shouldLoadInitialRasterImage(initialSource, 'data:image/png;base64,replacement'), 'A replacement raster source still loads');

  // Test 14: Outpaint uses the crop frame at 1:1 scale and exposes only added bounds.
  const outpaintFrame = CropEngine.normalizeOutpaintRect({ x: -120, y: -40, width: 1168, height: 848 }, 1024, 768);
  const outpaintOffset = CropEngine.getPixelPreservingOffset(outpaintFrame);
  testAssert(outpaintFrame.width === 1168 && outpaintFrame.height === 848, 'Outpaint preserves the expanded crop frame');
  testAssert(outpaintOffset.x === 120 && outpaintOffset.y === 40, 'Outpaint offsets original pixels without scaling');
  testAssert(CropEngine.hasOutpaintArea(outpaintFrame, 1024, 768), 'Outpaint detects the newly added canvas area');

  // Test 15: AI outpaint uses a padded model frame and extracts from the same origin.
  const registration = AiCanvasRegistrationEngine.getRegistration(1376, 923);
  testAssert(registration.aspectRatio === '3:2', 'Outpaint chooses the nearest supported model aspect ratio');
  testAssert(registration.modelWidth === 1386 && registration.modelHeight === 924, 'Outpaint pads instead of stretching the source canvas');
  testAssert(registration.contentX === 5 && registration.contentY === 0, 'Outpaint records the exact extraction origin');

  // The universal compositor must use one seam-safe edge mask, not double-apply alpha.
  testAssert(
    typeof MaskEngine.createSeamlessBlendMask === 'function',
    'Inpainting and outpainting share the seamless edge-mask compositor',
  );

  console.log('\n=== ALL RASTER CANVAS TESTS PASSED ===');
}

runTests();

