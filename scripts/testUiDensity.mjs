import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const densityCss = await readFile(new URL('../styles/ui-density.css', import.meta.url), 'utf8');
const indexHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');

assert.match(indexHtml, /<link href="\/styles\/ui-density\.css" rel="stylesheet">/,
  'The global UI density stylesheet must load for every app surface.');
assert.match(densityCss, /--app-ui-density:\s*0\.75\s*;/,
  'The shared UI density must remain at the requested 75% scale.');
assert.match(densityCss, /font-size:\s*calc\(16px \* var\(--app-ui-density\)\)\s*;/,
  'UI density must be applied through the root design unit.');
assert.match(densityCss, /html,\s*body,\s*#root\s*\{[^}]*height:\s*100%\s*;/s,
  'The app shell must continue to fill the viewport.');
assert.doesNotMatch(densityCss, /\b(?:zoom|transform)\s*:/,
  'UI density must not use browser-like zoom or rendered transform scaling.');

console.log('UI density regression checks passed.');
