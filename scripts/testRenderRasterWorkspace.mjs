import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relativePath => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const app = read('App.tsx');
const panel = read('components/generative-wizard/AiRenderingPanel.tsx');
const renderCanvas = read('src/features/ai-rendering-canvas/components/AiRenderingCanvas.tsx');
const canvasNode = read('src/features/ai-rendering-canvas/components/CanvasNode.tsx');
const rasterOverlay = read('src/features/ai-rendering-canvas/components/RasterCanvasOverlay.tsx');
const rasterCanvas = read('src/features/raster-canvas/components/RasterCanvasView.tsx');
const rasterSidebar = read('src/features/raster-canvas/components/RasterSidebar.tsx');

assert.match(rasterOverlay, /if \(!isOpen\) return null;/,
  'Closed Raster Canvas sessions must unmount instead of running behind Render Canvas.');
assert.match(rasterCanvas, /currentComposite !== initialCompositeRef\.current/,
  'Raster Canvas must compare its committed composite with the initial image before returning an edit.');
assert.match(panel, /if \(editedB64\) \{[\s\S]*addCompletedImageNode/,
  'A raster child node must only be added when an edited image is returned.');
assert.doesNotMatch(rasterSidebar, /Push Branch to Canvas|Fork Canvas/,
  'Raster Canvas must not expose the removed branch footer action.');

assert.doesNotMatch(renderCanvas, /absolute top-4 left-4[\s\S]*New Node/,
  'Render Canvas actions must not return to the old top-left toolbar.');
assert.match(renderCanvas, /absolute bottom-4 right-4[\s\S]*New Node[\s\S]*Undo[\s\S]*Redo/,
  'Render Canvas actions and viewport controls must share the bottom-right cluster.');
assert.match(rasterCanvas, /absolute bottom-4 right-4[\s\S]*Undo[\s\S]*Redo/,
  'Raster Canvas must retain the matching bottom-right control cluster.');

assert.match(renderCanvas, /incomingNodesByTarget = useMemo/,
  'Incoming graph nodes must be indexed once per graph change.');
assert.match(canvasNode, /React\.memo\(CanvasNodeComponent\)/,
  'Render nodes must not rerender for viewport-only updates.');
assert.match(canvasNode, /max-h-\[calc\(100vh-9rem\)\][\s\S]*min-h-0 flex-1 overflow-y-auto/,
  'Expanded fork nodes must keep their actions on-screen and scroll their configuration body.');
assert.match(app, /isGenerativeWizardOpen \? 'Back to Drawing Canvas' : 'Back to Home'/,
  'The app Back control must respect the current workspace depth.');
assert.match(app, /new CustomEvent\('archai:navigate-back', \{ cancelable: true \}\)/,
  'The app Back control must allow the active nested workspace to consume one navigation step.');
assert.match(rasterCanvas, /addEventListener\('archai:navigate-back'[\s\S]*handleBackToCanvas/,
  'Raster Canvas must consume the shared Back control before the parent workspace closes.');
assert.match(app, /title="Home"[\s\S]*<Home/,
  'The app bar must include a dedicated Home control.');

console.log('Render/Raster workspace regression checks passed.');
