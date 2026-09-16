import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_ROOT = 'C:\\Users\\Muhammad Naqi Ejaz\\Documents\\Temp 23\\Archi26\\02. Docs\\05. Auto Plan\\Data set 01\\DS 12';
const root = path.resolve(process.argv[2] || process.env.TEXT4G_DS12_ROOT || DEFAULT_ROOT);

// Step 1 is deliberately fixture-only. It never calls the extractor and never
// rewrites the saved JSONs. It provides a stable before/after report for the
// later small production changes.
if (!existsSync(root)) {
  console.log(`[Text 4.0 G DS12] Fixture folder not available; skipped: ${root}`);
  process.exit(0);
}

const caseDirectories = readdirSync(root, { withFileTypes: true })
  .filter(entry => entry.isDirectory() && /^(6[2-9]|7[0-4])\b/.test(entry.name))
  .map(entry => entry.name)
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

assert.equal(caseDirectories.length, 13, 'DS 12 orthogonal fixture set must contain folders 62 through 74.');

const readJson = filePath => JSON.parse(readFileSync(filePath, 'utf8'));
const findFile = (directory, pattern) => readdirSync(directory).find(name => pattern.test(name));
const arrayOrEmpty = (value) => Array.isArray(value) ? value : [];
const typeCounts = items => items.reduce((counts, item) => {
  const type = item.type || item.subType || 'unknown';
  counts[type] = (counts[type] || 0) + 1;
  return counts;
}, {});

const boundsFromItem = item => {
  const bounds = item?.evidence?.pixelBounds || item?.digitizationEvidence?.pixelBounds;
  if (!bounds) return undefined;
  const values = ['x0', 'y0', 'x1', 'y1'].map(key => Number(bounds[key]));
  return values.every(Number.isFinite)
    ? { x0: values[0], y0: values[1], x1: values[2], y1: values[3] }
    : undefined;
};

const itemFamily = item => {
  if (item.type === 'door' || item.subType === 'single' || item.subType === 'double' || item.subType === 'sliding' || item.subType === 'folding') return 'door';
  if (item.type === 'window' || item.type === 'standard' || item.subType === 'window') return 'window';
  if (item.type === 'wall-opening' || item.type === 'opening') return 'wall-opening';
  if (item.type === 'wall' || item.type === 'exterior' || item.type === 'interior') return 'wall';
  if (item.type === 'railing') return 'railing';
  return item.type || item.subType || 'unknown';
};

const familyItems = (data, family, side) => {
  if (side === 'local') {
    if (family === 'door') return arrayOrEmpty(data.doors);
    if (family === 'window') return arrayOrEmpty(data.windows);
    if (family === 'wall-opening') return arrayOrEmpty(data.openings);
    if (family === 'wall') return arrayOrEmpty(data.walls);
    if (family === 'railing') return arrayOrEmpty(data.railings);
    return [];
  }
  return arrayOrEmpty(data.elements).filter(item => itemFamily(item) === family);
};

const center = bounds => ({ x: (bounds.x0 + bounds.x1) / 2, y: (bounds.y0 + bounds.y1) / 2 });
const overlapRatio = (first, second) => {
  const overlapX = Math.max(0, Math.min(first.x1, second.x1) - Math.max(first.x0, second.x0));
  const overlapY = Math.max(0, Math.min(first.y1, second.y1) - Math.max(first.y0, second.y0));
  const overlap = overlapX * overlapY;
  const areaFirst = Math.max(1, (first.x1 - first.x0) * (first.y1 - first.y0));
  const areaSecond = Math.max(1, (second.x1 - second.x0) * (second.y1 - second.y0));
  return overlap / Math.max(areaFirst, areaSecond);
};

const evidenceMatchRate = (localData, correctData) => {
  const families = ['wall', 'door', 'window', 'wall-opening', 'railing'];
  const allCorrect = families.flatMap(family => familyItems(correctData, family, 'correct')
    .map(item => ({ family, bounds: boundsFromItem(item) }))
    .filter(item => item.bounds));
  const allLocal = families.flatMap(family => familyItems(localData, family, 'local')
    .map(item => ({ family, bounds: boundsFromItem(item) }))
    .filter(item => item.bounds));
  const matched = allCorrect.filter(correct => {
    const c = center(correct.bounds);
    return allLocal.some(local => {
      if (local.family !== correct.family) return false;
      const l = center(local.bounds);
      const centerDistance = Math.hypot(c.x - l.x, c.y - l.y);
      const scale = Math.max(
        1,
        correct.bounds.x1 - correct.bounds.x0,
        correct.bounds.y1 - correct.bounds.y0,
        local.bounds.x1 - local.bounds.x0,
        local.bounds.y1 - local.bounds.y0,
      );
      return overlapRatio(correct.bounds, local.bounds) >= 0.35 || centerDistance <= Math.max(12, scale * 0.65);
    });
  }).length;
  return { correctEvidenceItems: allCorrect.length, matchedEvidenceItems: matched, rate: allCorrect.length ? matched / allCorrect.length : 1 };
};

const baselineMinimums = {
  // These are deliberately permissive lower bounds from the current known-good
  // 62–67 set. They catch accidental deletion without freezing future fixes.
  '62': { walls: 6, doors: 5, windows: 2 },
  '63': { walls: 5, doors: 8, windows: 3 },
  '64': { walls: 9, doors: 9, windows: 6 },
  '65': { walls: 9, doors: 6, windows: 2 },
  '66': { walls: 9, doors: 5, windows: 2 },
  '67': { walls: 20, doors: 8, windows: 12 },
};

const reports = caseDirectories.map(directoryName => {
  const directory = path.join(root, directoryName);
  const localName = findFile(directory, /local-fallback-json/i);
  const correctName = findFile(directory, /^Correct_JSON\.json$/i);
  const inputName = findFile(directory, /_01_input-image_/i);
  assert.ok(localName, `${directoryName}: local-fallback JSON is required.`);
  assert.ok(correctName, `${directoryName}: Correct_JSON.json is required.`);
  assert.ok(inputName, `${directoryName}: input image is required.`);
  if (Number(directoryName.match(/^\d+/)[0]) >= 68) {
    assert.ok(findFile(directory, /^Comments\.txt$/i), `${directoryName}: Comments.txt is required.`);
  }

  const localData = readJson(path.join(directory, localName));
  const correctData = readJson(path.join(directory, correctName));
  const localCounts = {
    walls: arrayOrEmpty(localData.walls).length,
    doors: arrayOrEmpty(localData.doors).length,
    windows: arrayOrEmpty(localData.windows).length,
    openings: arrayOrEmpty(localData.openings).length,
    rooms: arrayOrEmpty(localData.rooms).length,
    railings: arrayOrEmpty(localData.railings).length,
  };
  const correctCounts = {
    walls: arrayOrEmpty(correctData.elements).filter(item => item.type === 'wall').length,
    doors: arrayOrEmpty(correctData.elements).filter(item => item.type === 'door').length,
    windows: arrayOrEmpty(correctData.elements).filter(item => item.type === 'window').length,
    openings: arrayOrEmpty(correctData.elements).filter(item => item.type === 'wall-opening').length,
    rooms: arrayOrEmpty(correctData.elements).filter(item => item.type === 'room').length,
    railings: arrayOrEmpty(correctData.elements).filter(item => item.type === 'railing').length,
  };
  const id = directoryName.match(/^\d+/)[0];
  const minimum = baselineMinimums[id];
  if (minimum) {
    for (const [key, value] of Object.entries(minimum)) {
      assert.ok(localCounts[key] >= value, `${directoryName}: ${key} regressed below baseline (${localCounts[key]} < ${value}).`);
    }
  }
  const logsName = findFile(directory, /comparison-logs/i);
  const logs = logsName ? readJson(path.join(directory, logsName)) : undefined;
  const commentsName = findFile(directory, /^Comments\.txt$/i);
  return {
    id,
    directory: directoryName,
    comments: commentsName ? readFileSync(path.join(directory, commentsName), 'utf8').trim().split(/\r?\n/).filter(Boolean) : [],
    input: inputName,
    localCounts,
    correctCounts,
    localTypes: {
      doors: typeCounts(arrayOrEmpty(localData.doors)),
      windows: typeCounts(arrayOrEmpty(localData.windows)),
      openings: typeCounts(arrayOrEmpty(localData.openings)),
    },
    evidence: evidenceMatchRate(localData, correctData),
    durationSeconds: logs?.results?.local?.durationSeconds ?? null,
    diagnostics: logs?.results?.local?.diagnostics ? {
      confidence: logs.results.local.diagnostics.confidence,
      topologyRepairMode: logs.results.local.diagnostics.topologyRepairMode,
      warnings: logs.results.local.diagnostics.warnings || [],
    } : null,
  };
});

console.log(JSON.stringify({
  fixtureRoot: root,
  scope: 'Text 4.0 G local-fallback orthogonal conversion',
  behaviorChanged: false,
  cases: reports,
}, null, 2));
console.log(`[Text 4.0 G DS12] Baseline harness passed for ${reports.length} orthogonal fixtures.`);
