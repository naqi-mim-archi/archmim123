import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outdir = path.join(root, 'dist', 'aps-revit-import-tests');
fs.mkdirSync(outdir, { recursive: true });

const METER_TO_REVIT_FOOT = 1 / 0.3048;
const fromAppPoint = (point) => ({
  x: point.x * METER_TO_REVIT_FOOT,
  y: -point.y * METER_TO_REVIT_FOOT,
  z: (point.z || 0) * METER_TO_REVIT_FOOT,
});
const fromAppLength = (meters) => meters * METER_TO_REVIT_FOOT;
const denseSplinePoints = Array.from({ length: 641 }, (_, index) => {
  const t = index / 640;
  return fromAppPoint({
    x: 18 + t * 16,
    y: -18 + Math.sin(t * Math.PI * 3) * 4 + t * 3,
  });
});

await esbuild.build({
  entryPoints: [path.join(root, 'services', 'apsRevitImport', 'apsRevitImportConverter.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(outdir, 'apsRevitImportConverter.mjs'),
});

const {
  convertApsRevitExtractionToNative,
  getDefaultApsRevitImportOptions,
} = await import(pathToFileUrl(path.join(outdir, 'apsRevitImportConverter.mjs')));

const manifest = {
  manifestVersion: 'aps-revit-import-v1',
  extractedAt: '2026-07-06T00:00:00.000Z',
  source: {
    fileName: 'UnitTest.rvt',
    revitVersion: '2026',
    projectName: 'Unit Test RVT',
    units: 'feet',
    coordinateSystem: 'revit-internal',
  },
  levels: [
    { elementId: '10', uniqueId: 'level-uid-10', name: 'Level 1', elevation: 0, order: 0 },
    { elementId: '11', uniqueId: 'level-uid-11', name: 'Level 2', elevation: 10, order: 1 },
  ],
  views: [
    { elementId: '20', uniqueId: 'view-20', name: 'Level 1', viewType: 'FloorPlan', levelElementId: '10', selectedForAnnotations: true },
    { elementId: '21', uniqueId: 'view-21', name: 'Level 2 Copy', viewType: 'FloorPlan', levelElementId: '11', selectedForAnnotations: false, ignoredReason: 'Duplicate' },
  ],
  linkedModels: [{ elementId: '30', uniqueId: 'link-30', name: 'Linked Model.rvt', loaded: true }],
  elements: [
    {
      elementId: '100',
      uniqueId: 'wall-uid-100',
      category: 'Walls',
      builtInCategory: 'OST_Walls',
      className: 'Wall',
      typeName: 'Basic Wall 9in',
      levelElementId: '10',
      parameters: { Width: 0.75, UnconnectedHeight: 10 },
      ourAppParameters: { OurApp_ElementId: 'roundtrip-wall-1', OurApp_NativeElementType: 'wall', OurApp_Thickness: 0.75, OurApp_Height: 10 },
      geometry: {
        locationCurve: { kind: 'line', start: { x: 0, y: 0, z: 0 }, end: { x: 10, y: 0, z: 0 } },
        thickness: 0.75,
        height: 10,
      },
    },
    {
      elementId: '101',
      uniqueId: 'door-uid-101',
      category: 'Doors',
      builtInCategory: 'OST_Doors',
      className: 'FamilyInstance',
      familyName: 'Single Flush',
      typeName: '36 x 84',
      levelElementId: '10',
      hostElementId: '100',
      geometry: {
        locationPoint: { x: 5, y: 0.05, z: 0 },
        width: 3,
        height: 7,
      },
    },
    {
      elementId: '102',
      uniqueId: 'floor-uid-102',
      category: 'Floors',
      builtInCategory: 'OST_Floors',
      className: 'Floor',
      levelElementId: '10',
      geometry: {
        boundaryLoops: [[
          { x: 0, y: 0, z: 0 },
          { x: 10, y: 0, z: 0 },
          { x: 10, y: 8, z: 0 },
          { x: 0, y: 8, z: 0 },
          { x: 0, y: 0, z: 0 },
        ]],
        thickness: 0.5,
      },
    },
    {
      elementId: '103',
      uniqueId: 'text-uid-103',
      category: 'Text Notes',
      className: 'TextNote',
      levelElementId: '10',
      sourceViewId: '20',
      isAnnotation: true,
      geometry: {
        locationPoint: { x: 2, y: -3, z: 0 },
        text: 'Room Label',
        rotation: 0,
        sourceViewId: '20',
        sourceViewName: 'Level 1',
      },
    },
    {
      elementId: '104',
      uniqueId: 'generic-uid-104',
      category: 'Generic Models',
      className: 'FamilyInstance',
      familyName: 'Custom Form',
      typeName: 'Complex',
      levelElementId: '10',
      geometry: {
        locationPoint: { x: 12, y: 4, z: 0 },
        boundingBox: { min: { x: 11, y: 3, z: 0 }, max: { x: 13, y: 5, z: 3 } },
      },
    },
    {
      elementId: '105',
      uniqueId: 'curved-wall-uid-105',
      category: 'Walls',
      builtInCategory: 'OST_Walls',
      className: 'Wall',
      typeName: 'Curved Wall',
      levelElementId: '10',
      geometry: {
        locationCurve: {
          kind: 'circle',
          isBound: true,
          start: { x: 0, y: 6, z: 0 },
          end: { x: 4, y: 6, z: 0 },
          center: { x: 2, y: 6, z: 0 },
          mid: { x: 2, y: 8, z: 0 },
          radius: 2,
          startAngle: Math.PI,
          endAngle: 0,
        },
        thickness: 0.5,
        height: 10,
      },
    },
    {
      elementId: '106',
      uniqueId: 'stair-uid-106',
      category: 'Stairs',
      builtInCategory: 'OST_Stairs',
      className: 'Stairs',
      familyName: 'Assembled Stair',
      typeName: 'Test Stair',
      levelElementId: '10',
      geometry: {
        path: [{ kind: 'line', start: { x: 0, y: -10, z: 0 }, end: { x: 6, y: -10, z: 0 } }],
        boundingBox: { min: { x: 0, y: -11.5, z: 0 }, max: { x: 6, y: -8.5, z: 10 } },
        width: 6,
        depth: 3,
        height: 10,
      },
    },
    {
      elementId: '109',
      uniqueId: 'issue-1717-ccw-true',
      category: 'Walls',
      builtInCategory: 'OST_Walls',
      className: 'Wall',
      typeName: 'Issue 1717 Arc True',
      levelElementId: '10',
      geometry: {
        locationCurve: {
          kind: 'arc',
          isBound: true,
          start: fromAppPoint({ x: -1.9204000962110859, y: -4.773809972453675 }),
          end: fromAppPoint({ x: -2.801485446991348, y: -0.40586360214231343 }),
          center: fromAppPoint({ x: -1.985266720915272, y: -2.5140568585085354 }),
          mid: fromAppPoint({ x: -4.201315314366696, y: -2.9610696619574184 }),
          radius: fromAppLength(2.2606839263783134),
          startAngle: 0,
          endAngle: 2.8008969295856634,
        },
        thickness: 0.75,
        height: 10,
      },
    },
    {
      elementId: '110',
      uniqueId: 'issue-1717-ccw-false',
      category: 'Walls',
      builtInCategory: 'OST_Walls',
      className: 'Wall',
      typeName: 'Issue 1717 Arc False',
      levelElementId: '10',
      geometry: {
        locationCurve: {
          kind: 'arc',
          isBound: true,
          start: fromAppPoint({ x: 5.356156055007304, y: -5.622040067145699 }),
          end: fromAppPoint({ x: 9.551200223313677, y: -10.804915417695472 }),
          center: fromAppPoint({ x: 10.13161624881806, y: -6.045941791780228 }),
          mid: fromAppPoint({ x: 6.405102899319569, y: -9.06219957102071 }),
          radius: fromAppLength(4.7942374508173025),
          startAngle: 0,
          endAngle: 1.5379678972913757,
        },
        thickness: 0.75,
        height: 10,
      },
    },
    {
      elementId: '107',
      uniqueId: 'ceiling-uid-107',
      category: 'Ceilings',
      builtInCategory: 'OST_Ceilings',
      className: 'Ceiling',
      levelElementId: '11',
      levelName: 'Level 2',
      geometry: {
        boundaryLoops: [[
          { x: 0, y: 0, z: 10 },
          { x: 10, y: 0, z: 10 },
          { x: 10, y: 8, z: 10 },
          { x: 0, y: 8, z: 10 },
          { x: 0, y: 0, z: 10 },
        ]],
        boundingBox: { min: { x: 0, y: 0, z: 9 }, max: { x: 10, y: 8, z: 10 } },
        thickness: 1,
      },
    },
    {
      elementId: '108',
      uniqueId: 'spline-uid-108',
      category: 'Lines',
      builtInCategory: 'OST_Lines',
      className: 'CurveElement',
      levelElementId: '10',
      isAnnotation: true,
      geometry: {
        curves: [{
          kind: 'spline',
          points: [
            { x: 0, y: -14, z: 0 },
            { x: 1, y: -15, z: 0 },
            { x: 2, y: -14, z: 0 },
          ],
        }],
      },
    },
    {
      elementId: '111',
      uniqueId: 'dense-spline-uid-111',
      category: 'Lines',
      builtInCategory: 'OST_Lines',
      className: 'ModelNurbSpline',
      levelElementId: '10',
      isAnnotation: true,
      parameters: {
        'Detail Line': 0,
      },
      geometry: {
        curves: [{
          kind: 'spline',
          points: denseSplinePoints,
        }],
      },
    },
    {
      elementId: '112',
      uniqueId: 'detail-line-uid-112',
      category: 'Lines',
      builtInCategory: 'OST_Lines',
      className: 'DetailLine',
      levelElementId: '10',
      isAnnotation: true,
      parameters: {
        'Detail Line': 1,
      },
      geometry: {
        curves: [{
          kind: 'line',
          start: { x: 0, y: -18, z: 0 },
          end: { x: 10, y: -18, z: 0 },
        }],
      },
    },
    {
      elementId: '113',
      uniqueId: 'generic-detail-curve-uid-113',
      category: 'Lines',
      builtInCategory: 'OST_Lines',
      className: 'CurveElement',
      levelElementId: '10',
      isAnnotation: true,
      parameters: {
        'Detail Line': 1,
      },
      geometry: {
        curves: [{
          kind: 'arc',
          start: { x: 0, y: -20, z: 0 },
          end: { x: 2, y: -20, z: 0 },
          center: { x: 1, y: -20, z: 0 },
          radius: 1,
        }],
      },
    },
  ],
  warnings: [],
};

const result = convertApsRevitExtractionToNative(manifest, 'UnitTest.rvt', getDefaultApsRevitImportOptions('Autodesk.Revit+2026'));

assert(result.canConvert, 'conversion should be usable');
assert(result.project.metadata?.apsRevitImport, 'project should use metadata.apsRevitImport');
assert(!result.project.metadata?.bimExport, 'importer must not write metadata.bimExport');
assert(!result.project.metadata?.revitExport, 'importer must not write metadata.revitExport');
assert(result.levels.length === 2, 'levels should be converted');

const wall = result.elements.find((element) => element.id === 'roundtrip-wall-1');
assert(wall?.type === 'wall', 'round-trip wall id/type should be restored');
assert(Math.abs(wall.p2.x - 3.048) < 0.000001, 'Revit feet should convert to meters on X');
assert(Math.abs(wall.p2.y - 0) < 0.000001, 'wall Y should stay inverted correctly');
assert(Math.abs((wall.thickness || 0) - 0.2286) < 0.000001, 'wall thickness should convert from feet');

const door = result.elements.find((element) => element.type === 'door');
assert(door?.hostWallId === wall.id, 'door should resolve host wall');
assert(door.hostT !== undefined && door.hostT > 0.45 && door.hostT < 0.55, 'door should land near middle of host wall');

const label = result.elements.find((element) => element.type === 'label');
assert(label?.pos?.y && label.pos.y > 0, 'Revit Y should invert to app Y');

const curvedWall = result.elements.find((element) => element.id.includes('curved-wall-uid-105'));
assert(curvedWall?.wallSource === 'arc', 'bounded circular Revit wall curves should import as arcs, not full circles');
assert(Math.abs(curvedWall.arcStartAngle - Math.PI) < 0.000001, 'arc start angle should be derived from center/start point, not raw Revit parameter');
assert(Math.abs(curvedWall.arcEndAngle - 0) < 0.000001, 'arc end angle should be derived from center/end point, not raw Revit parameter');
assert(curvedWall.arcCounterclockwise === false, 'arc direction should account for Revit Y inversion and midpoint side');

const issue1717True = result.elements.find((element) => element.id.includes('issue-1717-ccw-true'));
assert(issue1717True?.wallSource === 'arc', 'issue 1717 true-side wall should import as an analytical arc');
assert(Math.abs(issue1717True.arcStartAngle - 4.741086282173202) < 0.000001, 'issue 1717 true-side arc start should match endpoint/center geometry');
assert(Math.abs(issue1717True.arcEndAngle - 1.9401893525875387) < 0.000001, 'issue 1717 true-side arc end should match endpoint/center geometry');
assert(issue1717True.arcCounterclockwise === true, 'issue 1717 true-side arc should choose the midpoint-matching span');

const issue1717False = result.elements.find((element) => element.id.includes('issue-1717-ccw-false'));
assert(issue1717False?.wallSource === 'arc', 'issue 1717 false-side wall should import as an analytical arc');
assert(Math.abs(issue1717False.arcStartAngle - 3.0530580285072144) < 0.000001, 'issue 1717 false-side arc start should match endpoint/center geometry');
assert(Math.abs(issue1717False.arcEndAngle - 4.591025925798592) < 0.000001, 'issue 1717 false-side arc end should match endpoint/center geometry');
assert(issue1717False.arcCounterclockwise === false, 'issue 1717 false-side arc should choose the midpoint-matching span');

const stair = result.elements.find((element) => element.id.includes('stair-uid-106'));
assert(stair?.type === 'stair', 'stair should become native stair');
assert(Math.abs((stair.width || 0) - 0.9144) < 0.000001, 'stair width should use the short horizontal bbox span, not run length');

const ceiling = result.elements.find((element) => element.id.includes('ceiling-uid-107'));
assert(ceiling?.type === 'ceiling', 'ceiling should become native ceiling');
assert(ceiling.levelId === result.levels[0].id, 'ceiling at the upper plane should attach to the level below');
assert(ceiling.elevation === 0, 'ceiling elevation should follow the app level-top convention');

const splineSegments = result.elements.filter((element) => element.id.includes('spline-uid-108'));
assert(splineSegments.length === 2 && splineSegments.every((element) => element.type === 'line'), 'spline curves should preserve their tessellated shape as line segments');

const denseSplineSegments = result.elements.filter((element) => element.id.includes('dense-spline-uid-111'));
assert(denseSplineSegments.length > 10, 'dense splines should retain enough segments to stay visibly curved');
assert(denseSplineSegments.length <= 128, 'dense splines should be simplified instead of importing hundreds of tiny line elements');

const detailLineSegments = result.elements.filter((element) => element.id.includes('detail-line-uid-112'));
const detailLineMapping = result.report.elementMappings.find((row) => row.sourceRevitElementId === '112');
const genericDetailCurveSegments = result.elements.filter((element) => element.id.includes('generic-detail-curve-uid-113'));
const genericDetailCurveMapping = result.report.elementMappings.find((row) => row.sourceRevitElementId === '113');
assert(detailLineSegments.length === 0, 'Revit detail/drafting curves should not import as plan model geometry');
assert(detailLineMapping?.result === 'skipped', 'skipped Revit detail/drafting curves should be reported explicitly');
assert(genericDetailCurveSegments.length === 0, 'Revit detail/drafting parameter should skip generic curve elements too');
assert(genericDetailCurveMapping?.result === 'skipped', 'generic detail/drafting curves should be reported explicitly');

assert(result.report.linkedModels.length === 1, 'linked models should be reported');
assert(result.report.fallbackElementCount === 1, 'generic model should become one fallback');
assert(result.report.skippedElementCount === 2, 'only the detail drafting curve fixtures should be skipped in this manifest');
assert(result.report.elementMappings.length >= manifest.elements.length, 'each source element should be reported');
assert(JSON.stringify(result.project).includes('apsRevitImport'), 'element metadata namespace should be apsRevitImport');
assert(!JSON.stringify(result.project).includes('ISO-10303-21'), 'project must not contain STEP syntax');

const importerFiles = listFiles(path.join(root, 'services', 'apsRevitImport'))
  .concat(listFiles(path.join(root, 'components')).filter((file) => path.basename(file) === 'ApsRevitImporterDialog.tsx'))
  .concat(listFiles(path.join(root, 'aps-revit-import')).filter((file) => !file.includes(`${path.sep}build${path.sep}`)));
const forbiddenPatterns = [
  /RevitImportWizard/,
  /components[\\/]RevitImportWizard/,
  /services[\\/]bimService/,
  /exportProjectToIfc/,
  /downloadIfcFile/,
  /IfcWriter/,
  /ISO-10303-21/,
  /DWG/i,
  /DXF/i,
];
for (const file of importerFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const pattern of forbiddenPatterns) {
    assert(!pattern.test(source), `${path.relative(root, file)} contains forbidden dependency/reference ${pattern}`);
  }
}

console.log(JSON.stringify({
  ok: true,
  projectName: result.project.name,
  levels: result.levels.length,
  elements: result.elements.length,
  report: {
    native: result.report.nativeElementCount,
    fallback: result.report.fallbackElementCount,
    skipped: result.report.skippedElementCount,
  },
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
