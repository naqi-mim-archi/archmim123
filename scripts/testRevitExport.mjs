import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outdir = path.join(root, 'dist', 'revit-export-tests');
fs.mkdirSync(outdir, { recursive: true });

await esbuild.build({
  entryPoints: [path.join(root, 'services', 'revitExport', 'revitExportManifest.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(outdir, 'revitExportManifest.mjs'),
});

const {
  createRevitExportManifest,
  getDefaultRevitExportOptions,
  validateRevitExportManifest,
} = await import(pathToFileUrl(path.join(outdir, 'revitExportManifest.mjs')));

const samplePath = path.join(
  root,
  '..',
  '..',
  '..',
  '02. Docs',
  '04. Rvt Import',
  'Sample for Rvt',
  'Floorplan Sample JSON.json',
);

const fallbackProject = {
  name: 'Revit Export Test',
  mode: 'floorplan',
  levels: [{ id: 'level-1', name: 'Level 1', zElevation: 0, height: 3, order: 0 }],
  elements: [
    { id: 'wall-1', type: 'wall', p1: { x: 0, y: 0 }, p2: { x: 4, y: 0 }, thickness: 0.2, height: 3, levelId: 'level-1' },
    { id: 'door-1', type: 'door', pos: { x: 2, y: 0 }, width: 0.9, height: 2.1, hostWallId: 'wall-1', levelId: 'level-1' },
  ],
  viewBox: { width: 100, height: 100 },
};

const project = fs.existsSync(samplePath)
  ? JSON.parse(fs.readFileSync(samplePath, 'utf8'))
  : fallbackProject;

const options = getDefaultRevitExportOptions(project, 'metric', project.levels[0]?.id);
const manifest = createRevitExportManifest(project, options);
const validation = validateRevitExportManifest(manifest);

assert(manifest.manifestVersion === 'revit-export-v1', 'manifest version mismatch');
assert(validation.isValid, `manifest validation failed: ${validation.errors.join('; ')}`);
assert(manifest.levels.length > 0, 'manifest should include levels');
assert(manifest.elements.length > 0, 'manifest should include exportable elements');
assert(manifest.project.coordinateSystem === 'canvas-y-down', 'coordinate system must be canvas-y-down');
assert(!JSON.stringify(manifest).includes('ISO-10303-21'), 'manifest must not contain IFC STEP data');
assert(!JSON.stringify(manifest).includes('IFCWALL'), 'manifest must not contain IFC entity names');
assert(manifest.elements.some(element => element.type === 'wall'), 'manifest should include walls');
assert(manifest.elements.some(element => ['door', 'window'].includes(element.type)) || project.elements.length < 3, 'sample manifest should include hosted elements when present');

const revitExportSourceFiles = listFiles(path.join(root, 'services', 'revitExport'))
  .filter(file => /\.(ts|tsx)$/.test(file));
const forbiddenPatterns = [
  /bimExportService/,
  /exportProjectToIfc/,
  /downloadIfcFile/,
  /IfcWriter/,
  /BimExporterDialog/,
  /RevitImportWizard/,
  /bimService/,
  /BimService/,
  /revit_import/,
];
for (const file of revitExportSourceFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const pattern of forbiddenPatterns) {
    assert(!pattern.test(source), `${path.relative(root, file)} contains forbidden dependency/reference ${pattern}`);
  }
}

console.log(JSON.stringify({
  ok: true,
  manifestVersion: manifest.manifestVersion,
  levels: manifest.levels.length,
  elements: manifest.elements.length,
  classCounts: manifest.summary.classCounts,
}, null, 2));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...listFiles(fullPath));
    else results.push(fullPath);
  }
  return results;
}

function pathToFileUrl(filePath) {
  return `file:///${filePath.replace(/\\/g, '/')}`;
}
