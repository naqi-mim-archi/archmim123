import { readFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { createWorker, OEM, PSM } from 'tesseract.js';

const specifications = {
  68: { depth: 10.921 },
  69: { width: 10.5, depth: 8.6 },
  70: { width: 7.3, depth: 8.5 },
  71: { width: 10, depth: 8.6 },
  72: { width: 7.7, depth: 5.2 },
  73: { width: 7.62, depth: 4.572 },
  74: { width: 9.144, depth: 15.24 },
  77: { width: 12.192, depth: 12.192 },
  79: { width: 15.24 },
};
const ids = process.argv.slice(2).map(Number).filter(id => specifications[id]);
if (!ids.length) throw new Error('Pass one or more DS 12 case ids.');

const buildResult = await build({
  entryPoints: ['services/localImageToJSON4g.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(buildResult.outputFiles[0].text).toString('base64')}`;
const { extractGeometryFromImageData } = await import(moduleUrl);
const fixtureRoot = path.join(process.env.TEMP, 'text4g-ds12-all');
const worker = await createWorker('eng', OEM.LSTM_ONLY, { logger: () => undefined });
await worker.setParameters({
  tessedit_pageseg_mode: PSM.SPARSE_TEXT,
  preserve_interword_spaces: '1',
  user_defined_dpi: '220',
});

for (const id of ids) {
  const pngPath = path.join(fixtureRoot, `${id}.png`);
  const rgbaPath = path.join(fixtureRoot, `${id}.rgba`);
  const result = await worker.recognize(pngPath, {}, { text: true, blocks: true });
  const textObservations = [];
  for (const block of result.data.blocks || []) {
    for (const paragraph of block.paragraphs || []) {
      for (const line of paragraph.lines || []) {
        const text = line.text.replace(/\s+/g, ' ').trim();
        if (!text || line.confidence < 20) continue;
        textObservations.push({ text, confidence: line.confidence, bbox: { ...line.bbox } });
      }
    }
  }
  const specification = specifications[id];
  const data = await extractGeometryFromImageData({
    width: 1024,
    height: 1024,
    data: readFileSync(rgbaPath),
  }, {
    requestedWidthMeters: specification.width,
    requestedDepthMeters: specification.depth,
    textObservations,
    ocrStatus: 'completed',
    enforceRequestedEnvelope: true,
    exteriorWallThicknessMeters: 0.23,
  });
  const compact = item => ({
    type: item.type,
    width: item.width,
    pos: item.pos,
    rotation: item.rotation,
    confidence: item.evidence?.confidence,
    notes: item.evidence?.notes,
    pb: item.evidence?.pixelBounds,
  });
  console.log(JSON.stringify({
    id,
    text: textObservations.map(item => item.text),
    geometryMode: data.diagnostics?.geometryMode,
    counts: {
      walls: data.walls?.length || 0,
      doors: data.doors?.length || 0,
      windows: data.windows?.length || 0,
      openings: data.openings?.length || 0,
      railings: data.railings?.length || 0,
      rooms: data.rooms?.length || 0,
    },
    doors: (data.doors || []).map(compact),
    windows: (data.windows || []).map(compact),
    openings: (data.openings || []).map(compact),
    railings: (data.railings || []).map(compact),
    walls: process.env.TEXT4G_COMPACT ? undefined : (data.walls || []).map(item => ({
      p1: item.p1,
      p2: item.p2,
      thickness: item.thickness,
      type: item.type,
      wallSource: item.wallSource,
      isCurved: item.isCurved,
      ellipseCenter: item.ellipseCenter,
      ellipseRadiusX: item.ellipseRadiusX,
      ellipseRadiusY: item.ellipseRadiusY,
      ellipseStartAngle: item.ellipseStartAngle,
      ellipseEndAngle: item.ellipseEndAngle,
      arcCenter: item.arcCenter,
      arcRadius: item.arcRadius,
      controlPoint: item.controlPoint,
      pb: item.evidence?.pixelBounds,
    })),
  }, null, 2));
}

await worker.terminate();
