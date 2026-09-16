import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = relativePath => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const app = read('App.tsx');
const wizard = read('components/generative-wizard/GenerativeWizardCore.tsx');
const renderPanel = read('components/generative-wizard/AiRenderingPanel.tsx');
const raster = read('src/features/raster-canvas/components/RasterCanvasView.tsx');
const fullscreenImage = read('src/features/ai-rendering-canvas/components/ImageFullscreenModal.tsx');

assert.match(app, /const navigateBackOneStep = useCallback/,
  'The app bar must use one centralized one-step Back action.');
assert.match(app, /detail: backDetail/,
  'Nested tools must be able to register the deepest Back action.');
assert.match(app, /if \(backDetail\.action\) \{[\s\S]*backDetail\.action\(\)/,
  'The app must execute exactly one registered Back action.');
assert.match(app, /event\.key !== 'Escape'[\s\S]*navigateBackOneStep\(\)/,
  'Escape must use the same one-step navigation path while a navigation layer is open.');

assert.doesNotMatch(wizard, /onClick=\{handleWizardBack\}/,
  'The full-screen wizard must rely on the universal app-bar Back control.');
assert.doesNotMatch(wizard, />Back<|Back to Design Brief|Back to Scale/,
  'Wizard steps must not duplicate the universal app-bar Back control.');
assert.doesNotMatch(renderPanel, /onClick=\{onClose\}/,
  'Render Canvas must not duplicate the app-bar Back control.');
assert.doesNotMatch(raster, /title="Back to Render Canvas"/,
  'Raster Canvas must not duplicate the app-bar Back control.');
assert.match(wizard, /detail\.priority < 10/,
  'The wizard must register an internal step-level Back action.');
assert.match(raster, /detail\.priority < 20/,
  'Raster Canvas must take priority over its parent wizard.');
assert.match(fullscreenImage, /detail\.priority < 30/,
  'Fullscreen image preview must take priority over Raster and Render Canvas.');

const popupFiles = [
  'components/ApsRevitImporterDialog.tsx',
  'components/BimExporterDialog.tsx',
  'components/BimImporterWizard.tsx',
  'components/BlockEditor.tsx',
  'components/PdfExportDialog.tsx',
  'components/RevitExporterDialog.tsx',
  'components/RevitImportWizard.tsx',
  'components/SiteMapPanel.tsx',
  'components/ProceduralWizard.tsx',
  'smart-procedural/SmartProceduralWizard.tsx',
  'components/UrbanWizard.tsx',
  'src/features/raster-canvas/components/AiEditModal.tsx',
  'src/features/raster-canvas/components/ExportModal.tsx',
  'src/features/raster-canvas/components/LayersPanel.tsx',
];

for (const popupFile of popupFiles) {
  assert.doesNotMatch(read(popupFile), /<X\s+size=/,
    `${popupFile} must use Back rather than a dismiss cross.`);
}

console.log('Universal Back navigation regression checks passed.');
