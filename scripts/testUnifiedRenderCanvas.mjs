import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const panel = readFileSync(new URL('../components/generative-wizard/AiRenderingPanel.tsx', import.meta.url), 'utf8');
const node = readFileSync(new URL('../src/features/ai-rendering-canvas/components/CanvasNode.tsx', import.meta.url), 'utf8');
const configurator = readFileSync(new URL('../src/features/ai-rendering-canvas/components/NodeConfigurator.tsx', import.meta.url), 'utf8');
const registry = readFileSync(new URL('../services/aiRender/workflowRegistry.ts', import.meta.url), 'utf8');

assert.doesNotMatch(panel, />\s*Image Studio\s*</, 'The top-right Image Studio tag must be removed.');
assert.doesNotMatch(panel, />\s*Raster Canvas\s*</, 'The top-right Raster Canvas tag must be removed.');
assert.doesNotMatch(panel, />\s*Video - Coming Soon\s*</, 'The top-right Video tag must be removed.');
assert.doesNotMatch(node, /CATEGORY_TABS|Switch to \$\{tab\.label\}/, 'Nodes must not expose studio category tabs.');
assert.match(node, /currentHub === 'gen_3d' \? '3D Generator Node' : 'Render Node'/,
  'Nodes must use one holistic Render Node identity.');

const mappedVideoWorkflowIds = [...registry.matchAll(/(\d+): 'video_studio'/g)].map(match => Number(match[1]));
assert.deepEqual(mappedVideoWorkflowIds, [19, 27, 28], 'The video workflow registry coverage changed unexpectedly.');
assert.match(configurator, /videoWorkflows\.map\(w => \([\s\S]*<option key=\{w\.id\} value=\{w\.id\} disabled>/,
  'Every registered video workflow must render as a disabled selector option.');
assert.match(configurator, /Video Workflows - Coming Soon/, 'Video workflows must be grouped and marked Coming Soon.');
assert.match(panel, /wf\?\.hubCategory === 'video_studio'/, 'Video execution must remain guarded by workflow category.');

console.log('Unified Render Canvas regression checks passed.');
