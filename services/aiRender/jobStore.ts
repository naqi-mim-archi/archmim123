import { getAdminFirestore, getAdminStorageBucket, hasAdminCredentials } from '../firebase/adminApp';

// Render jobs are kept in memory, which is fine for one long-lived server. On Vercel every request
// can land on a different instance, so a job created by one is invisible to the poll that follows
// (the client then sees 404 forever). There, the job is also written to Firestore, with its images
// in Storage because they are far bigger than a Firestore document may be.
//
// Nothing changes locally: the in-memory copy answers every poll and none of this runs.

const COLLECTION = 'aiRenderJobs';
const JOB_TTL_MS = 6 * 60 * 60 * 1000;
const SWEEP_BATCH = 10;
const INLINE_DATA_URL_LIMIT = 512;

const DATA_URL = /^data:([^;,]+);base64,([\s\S]*)$/;

export const isDurableJobStoreEnabled = (): boolean => {
  if (!process.env.VERCEL && process.env.AI_RENDER_DURABLE_JOBS !== '1') return false;
  try {
    return hasAdminCredentials();
  } catch {
    return false;
  }
};

const extensionFor = (mimeType: string): string =>
  mimeType === 'video/mp4' ? 'mp4' : mimeType === 'model/gltf-binary' ? 'glb' : mimeType === 'image/jpeg' ? 'jpg' : 'png';

// The request that made the job carries the uploaded sketch as a data URL; it would blow the
// 1 MB document limit and nothing reads it back, so heavy strings are dropped.
const stripHeavyValues = (value: any, depth = 0): any => {
  if (typeof value === 'string') return value.length > INLINE_DATA_URL_LIMIT && value.startsWith('data:') ? '' : value;
  if (Array.isArray(value)) return depth > 6 ? [] : value.map(entry => stripHeavyValues(entry, depth + 1));
  if (value && typeof value === 'object') {
    if (depth > 6) return {};
    const out: Record<string, any> = {};
    for (const [key, entry] of Object.entries(value)) {
      const cleaned = stripHeavyValues(entry, depth + 1);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return out;
  }
  return value === undefined ? null : value;
};

// Saves the job so another instance can answer the next poll. Never throws: a failure here must
// not fail the render itself.
export const putJob = async (job: any): Promise<void> => {
  if (!isDurableJobStoreEnabled() || !job?.jobId) return;
  try {
    const bucket = getAdminStorageBucket();
    const outputs = [];
    for (const [index, output] of (job.outputs || []).entries()) {
      const match = typeof output?.signed_url === 'string' ? DATA_URL.exec(output.signed_url) : null;
      if (!match) {
        outputs.push({ ...output, storagePath: null });
        continue;
      }
      const [, mimeType, base64] = match;
      const path = `${COLLECTION}/${job.jobId}/out_${index}.${extensionFor(mimeType)}`;
      await bucket.file(path).save(Buffer.from(base64, 'base64'), { contentType: mimeType, resumable: false });
      outputs.push({ ...output, signed_url: '', storagePath: path, storageMimeType: mimeType });
    }
    await getAdminFirestore().collection(COLLECTION).doc(job.jobId).set({
      ...stripHeavyValues({ ...job, outputs: undefined }),
      outputs,
      storedAt: Date.now(),
    });
  } catch (error: any) {
    console.warn(`[AI-Render] Could not store job ${job.jobId}:`, error?.message || error);
  }
};

// Reads a job saved by another instance, putting the images back as data URLs so the client sees
// exactly what it sees locally.
export const getStoredJob = async (jobId: string): Promise<any | null> => {
  if (!isDurableJobStoreEnabled()) return null;
  try {
    const snap = await getAdminFirestore().collection(COLLECTION).doc(jobId).get();
    if (!snap.exists) return null;
    const job: any = snap.data();
    const bucket = getAdminStorageBucket();
    job.outputs = await Promise.all((job.outputs || []).map(async (output: any) => {
      if (!output?.storagePath) return output;
      try {
        const [buffer] = await bucket.file(output.storagePath).download();
        const mimeType = output.storageMimeType || 'image/png';
        return { ...output, signed_url: `data:${mimeType};base64,${buffer.toString('base64')}` };
      } catch {
        return output;
      }
    }));
    return job;
  } catch (error: any) {
    console.warn(`[AI-Render] Could not read stored job ${jobId}:`, error?.message || error);
    return null;
  }
};

// Old jobs would pile up in Storage; clear a few whenever a new job starts.
export const sweepExpiredJobs = async (): Promise<void> => {
  if (!isDurableJobStoreEnabled()) return;
  try {
    const cutoff = Date.now() - JOB_TTL_MS;
    const stale = await getAdminFirestore().collection(COLLECTION).where('storedAt', '<', cutoff).limit(SWEEP_BATCH).get();
    if (stale.empty) return;
    const bucket = getAdminStorageBucket();
    for (const doc of stale.docs) {
      await bucket.deleteFiles({ prefix: `${COLLECTION}/${doc.id}/` }).catch(() => undefined);
      await doc.ref.delete().catch(() => undefined);
    }
  } catch (error: any) {
    console.warn('[AI-Render] Could not clear old jobs:', error?.message || error);
  }
};
