import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../components/generative-wizard/AiRenderingPanel.tsx', import.meta.url), 'utf8');
const canvas = readFileSync(new URL('../src/features/ai-rendering-canvas/components/AiRenderingCanvas.tsx', import.meta.url), 'utf8');
const rasterCanvas = readFileSync(new URL('../src/features/raster-canvas/components/RasterCanvasView.tsx', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../styles/apple-glass-theme.css', import.meta.url), 'utf8');

assert.match(index, /apple-glass-theme\.css/, 'The global Apple glass theme must be loaded.');
assert.match(index, /class="apple-interface bg-slate-50"/, 'The app-wide palette scope must be active.');
assert.doesNotMatch(index, /fonts\.googleapis\.com/, 'The theme must not add a blocking web-font request.');
assert.match(app, /className="app-home min-h-screen/, 'Home must use the light product surface.');
assert.match(panel, /className="render-canvas-theme /, 'Render Canvas must opt into the light theme.');
assert.match(canvas, /rgba\(0, 113, 227, 0\.22\)/, 'Render Canvas must use the light blue grid.');
assert.match(rasterCanvas, /blank\.ctx\.fillStyle = '#ffffff'/, 'A new Raster Canvas must use a light artboard.');
assert.match(theme, /--apple-blue: #0071e3/, 'The palette must define a single professional blue.');
assert.match(theme, /\.render-canvas-theme/, 'The dark-to-light conversion must stay scoped to Render Canvas.');
assert.doesNotMatch(theme, /@keyframes|animation:/, 'The static theme must not add animation work.');

console.log('Apple glass theme regression checks passed.');
