import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const toolbar = readFileSync(new URL('../components/Toolbar.tsx', import.meta.url), 'utf8');
const properties = readFileSync(new URL('../components/PropertiesPanel.tsx', import.meta.url), 'utf8');
const compass = readFileSync(new URL('../components/ViewportCompass.tsx', import.meta.url), 'utf8');
const renderCanvas = readFileSync(new URL('../src/features/ai-rendering-canvas/components/AiRenderingCanvas.tsx', import.meta.url), 'utf8');
const canvasNode = readFileSync(new URL('../src/features/ai-rendering-canvas/components/CanvasNode.tsx', import.meta.url), 'utf8');

assert.match(toolbar, /bottom-5 left-1\/2/, 'The lower toolbar must use the standard screen inset.');
assert.match(toolbar, /left-5 top-1\/2/, 'The side toolbar must use the standard screen inset.');
assert.match(toolbar, /top-\[56px\]/, 'The top toolbar must clear the app header consistently.');
assert.match(properties, /rounded-2xl p-4 w-72/, 'The properties panel must use the compact dimensions.');
assert.match(compass, /width: '116px'/, 'The compass must use the compact width.');
assert.match(app, /top-\[204px\] right-5 bottom-5/, 'The properties panel must remain separated from the compass and screen edges.');
assert.match(renderCanvas, /x: 64,\s*y: 64,\s*zoom: 0\.85/, 'New Render Canvas nodes must start at a readable laptop-safe scale.');
assert.match(canvasNode, /bg-blue-50 hover:bg-blue-600 text-blue-700/, 'The default node footer action must retain readable contrast.');

console.log('Canvas UI layout regression checks passed.');
