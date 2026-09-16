import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const [app, properties, toolbar, modeSelector, renderingPanel, wizardCore, autoProceduralPanel] = await Promise.all([
  read('App.tsx'),
  read('components/PropertiesPanel.tsx'),
  read('components/Toolbar.tsx'),
  read('components/generative-wizard/ModeSelector.tsx'),
  read('components/generative-wizard/AiRenderingPanel.tsx'),
  read('components/generative-wizard/GenerativeWizardCore.tsx'),
  read('components/auto-procedural/AutoProceduralPanel.tsx'),
]);

const home = app.slice(app.indexOf('if (!project && !isProcessing)'), app.indexOf('if (isProcessing)'));
for (const label of ['Drawing Canvas', 'Render Canvas', 'AutoPlan', 'AutoScan']) {
  assert.ok(home.includes(label), `Home must show ${label}.`);
}
for (const hiddenLabel of ['Upload Floorplan Image', 'Load Project JSON', 'Import CAD DXF', 'Blank Masterplan', 'Blank Floorplan']) {
  assert.ok(!home.includes(hiddenLabel), `Home must hide ${hiddenLabel}.`);
}
assert.doesNotMatch(app, /useEffect\(\(\) => \{\s*createBlankProject\(\);\s*\}, \[\]\);/,
  'The app must remain on Home until the user chooses a destination.');

const importExportMenu = app.slice(app.indexOf('aria-haspopup="menu"'), app.indexOf('<button onClick={handleSave}'));
for (const label of ['Load Project', 'CAD Import', 'BIM Importer', 'Revit Import', 'Download Project', 'Export BIM (.IFC)', 'Export Revit', 'Export CAD', 'Export PDF']) {
  assert.ok(importExportMenu.includes(label), `Import / Export must show ${label}.`);
}
for (const hiddenLabel of ['Site Data</span>', 'Load JSON</span>', 'DXF Import</span>', 'APS Revit Importer</span>', 'Export JSON</span>', '<span>Vector DXF</span>', '<span>Vector PDF</span>']) {
  assert.ok(!importExportMenu.includes(hiddenLabel), `Import / Export must hide or rename ${hiddenLabel}.`);
}

assert.ok(!properties.includes('Urban Generation'), 'AI Gen must hide Urban Generation.');
assert.match(properties, /SHOW_AI_GEN_MENU = false/, 'The complete AI Gen entry must remain hidden without deleting its implementation.');
assert.ok(!toolbar.includes('Site Map Settings'), 'The bottom bar must hide Site Map Settings.');
assert.ok(toolbar.includes('3D Generator'), 'Interior Elements must expose 3D Generator.');
assert.match(modeSelector, /item\.mode !== 'ai-rendering' && item\.mode !== 'digitizer'/,
  'Render Canvas and Digitizer must be removed from the legacy AI Gen mode menu.');
assert.match(app, /openText4hFromHome\(false\)/, 'AutoPlan must open Text 4.0 H from Home.');
assert.match(app, /openText4hFromHome\(true\)/, 'AutoScan must open the Text 4.0 H image-test route from Home.');
assert.match(app, /initialText4hImageTest=\{generativeInitialText4hImageTest\}/,
  'Home must pass the requested Text 4.0 H entry point into the wizard.');
assert.match(wizardCore, /isAutoScanWorkspace && mode === 'digitizer'[\s\S]*setMode\('chat-v4h'\)[\s\S]*setStep\('text4d-image-test'\)/,
  'Back from Pro must return to the AutoScan simple-plan workflow.');
assert.match(wizardCore, /isAutoPlanWorkspace[\s\S]*Flash[\s\S]*setMode\('smart-procedural'\)[\s\S]*Instant/,
  'AutoPlan must provide Flash and the moved Instant Smart Procedural workflow.');
assert.match(wizardCore, /mode === 'smart-procedural'[\s\S]*workflow="smart"[\s\S]*AutoProceduralPanel/,
  'Instant must run in the native Design Copilot procedural canvas.');
assert.match(toolbar, /showLegacyProceduralButtons = false/,
  'Legacy Procedural Rect, Smart Procedural, and Auto Procedural toolbar buttons must remain hidden.');
assert.match(autoProceduralPanel, /isSmartWorkflow \? SmartProceduralLayoutEngine : AutoProceduralLayoutEngine/,
  'Instant must preserve the existing Smart Procedural layout engine inside Design Copilot.');
assert.match(autoProceduralPanel, /Furnish Floorplan[\s\S]*Import to Canvas/,
  'Instant must furnish and preview before an explicit main-canvas import.');
assert.match(autoProceduralPanel, /SmartProceduralFurnishEngine\.furnishFloor\(currentHost, project\.elements\)[\s\S]*autoProceduralFurniture: true/,
  'Instant must reuse the original Smart Procedural furniture logic with the complete Copilot floorplan context.');
assert.match(autoProceduralPanel, /delete detached\.isSmartProceduralHost[\s\S]*delete metadata\.autoProceduralNode/,
  'Instant imports must detach procedural controls before reaching the main canvas.');
assert.match(properties, /SHOW_MAIN_CANVAS_PROCEDURAL_ACTIONS = false/,
  'Procedural and furnishing actions must remain inside Design Copilot instead of the main canvas.');
assert.match(wizardCore, /isAutoScanWorkspace[\s\S]*Simple Plans - Flash[\s\S]*setMode\('digitizer'\)[\s\S]*Pro/,
  'AutoScan must contain Simple Plans - Flash and the moved Pro Digitizer subtool.');
assert.match(wizardCore, /openText4hImageTest \? 'text4d-image-test' : 'input'/,
  'AutoScan must reuse the existing Text 4.0 H image-test step.');
assert.match(wizardCore, /SHOW_LEGACY_AI_GEN_MODE_SELECTOR = false/,
  'Legacy AI Gen subsidiaries must remain implemented but inaccessible.');
assert.doesNotMatch(wizardCore, /Floorplan Image Model/,
  'AutoPlan must not expose backend image-model selection in its confirmation UI.');
assert.doesNotMatch(wizardCore, /â|Ã|Â|ï¿½|�/,
  'Visible wizard strings must not contain mojibake characters.');
assert.match(wizardCore, /border-blue-200 bg-white shadow-sm[\s\S]*Rectangular Boundary[\s\S]*text-slate-700/,
  'The rectangular-boundary card must retain readable dark text on a white surface.');
assert.doesNotMatch(app, /fixed bottom-5 left-5[\s\S]*BUILD:/,
  'Build metadata must not cover bottom workspace controls.');
assert.match(app, /<Hammer size=\{11\}[\s\S]*Version: \{buildVersion\}/,
  'The top app bar must expose subtle build metadata with hover detail.');
assert.doesNotMatch(renderingPanel, />\s*Image Studio\s*</, 'Render Canvas must not show an Image Studio navigation tag.');
assert.doesNotMatch(renderingPanel, />\s*Raster Canvas\s*</, 'Render Canvas must not show a Raster Canvas navigation tag.');
assert.match(renderingPanel, /node\.hubType === 'video_studio' \|\| wf\?\.hubCategory === 'video_studio'[\s\S]*Video generation is coming soon\./,
  'Video generation must be guarded, not only visually disabled.');
assert.match(app, /initialAiRenderingHub=\{generativeInitialHub\}/,
  'Home and Interior Elements must route to the requested rendering hub.');

console.log('Simplified UI regression checks passed.');
