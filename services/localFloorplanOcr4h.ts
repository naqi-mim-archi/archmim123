export interface FloorplanTextObservation {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

let workerPromise: Promise<import('tesseract.js').Worker> | undefined;
let recognitionInProgress = false;

const getWorker = async () => {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(async ({ createWorker, OEM, PSM }) => {
      const worker = await createWorker('eng', OEM.LSTM_ONLY, {
        logger: message => {
          if (message.status === 'recognizing text' && message.progress >= 0.99) {
            console.info('[Text 4.0 H] Local OCR complete.');
          }
        },
      });
      try {
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SPARSE_TEXT,
          preserve_interword_spaces: '1',
          user_defined_dpi: '220',
        });
        return worker;
      } catch (error) {
        await worker.terminate().catch(() => undefined);
        throw error;
      }
    }).catch(error => {
      workerPromise = undefined;
      throw error;
    });
  }
  return workerPromise;
};

/**
 * Begin loading the cached browser-local OCR worker without blocking image
 * generation. Warm-up is intentionally best-effort: callers can safely fire
 * and forget this promise because failures are reported and converted to a
 * false result. A later recognition attempt can retry because getWorker clears
 * a failed cached promise.
 */
export const warmLocalFloorplanOcr4h = async (): Promise<boolean> => {
  const startedAt = Date.now();
  try {
    await getWorker();
    console.info(`[Text 4.0 H] Local OCR ready in ${Date.now() - startedAt}ms.`);
    return true;
  } catch (error) {
    console.warn(`[Text 4.0 H] Local OCR warm-up failed after ${Date.now() - startedAt}ms; extraction will retry or continue without OCR.`, error);
    return false;
  }
};

/**
 * Browser-local OCR. The worker is retained between generations because its
 * WASM core and English language model are expensive to initialize repeatedly.
 */
export const recognizeFloorplanText4h = async (
  image: HTMLCanvasElement,
): Promise<FloorplanTextObservation[]> => {
  if (recognitionInProgress) throw new Error('The local OCR worker is still processing the previous floor plan.');
  recognitionInProgress = true;
  try {
    const worker = await getWorker();
    const result = await worker.recognize(image, {}, { text: true, blocks: true });
    const observations: FloorplanTextObservation[] = [];
    for (const block of result.data.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const line of paragraph.lines || []) {
          const text = line.text.replace(/\s+/g, ' ').trim();
          if (!text || line.confidence < 20) continue;
          observations.push({
            text,
            confidence: line.confidence,
            bbox: { ...line.bbox },
          });
        }
      }
    }
    return observations;
  } finally {
    recognitionInProgress = false;
  }
};
