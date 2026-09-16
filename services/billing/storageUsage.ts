import { getAdminStorageBucket, hasAdminCredentials } from '../firebase/adminApp';
import { FREE_STORAGE_BYTES, formatBytes } from './pricing';
import { ensureEntitlement, recordStorageUsage } from './tokenLedger';

export interface StorageCheckResult {
  allowed: boolean;
  usedBytes: number;
  quotaBytes: number;
  metered: boolean;
  message?: string;
}

// Usage is recomputed from the bucket (users/{uid}/) with the Admin SDK; client-reported deltas are never trusted.
export const computeStorageUsage = async (uid: string): Promise<number> => {
  const [files] = await getAdminStorageBucket().getFiles({ prefix: `users/${uid}/` });
  return files.reduce((total: number, file: any) => total + Number(file.metadata?.size || 0), 0);
};

export const getStorageUsage = async (uid: string): Promise<{ usedBytes: number; quotaBytes: number; metered: boolean }> => {
  if (!hasAdminCredentials()) return { usedBytes: 0, quotaBytes: FREE_STORAGE_BYTES, metered: false };
  try {
    const usedBytes = await computeStorageUsage(uid);
    const entitlement = await ensureEntitlement(uid);
    await recordStorageUsage(uid, usedBytes).catch(() => undefined);
    return { usedBytes, quotaBytes: entitlement.storageQuotaBytes || FREE_STORAGE_BYTES, metered: true };
  } catch (err) {
    console.warn('[Billing] Storage usage could not be computed:', err);
    return { usedBytes: 0, quotaBytes: FREE_STORAGE_BYTES, metered: false };
  }
};

// A metering outage never blocks a save.
export const checkStorageAllowance = async (uid: string, additionalBytes: number): Promise<StorageCheckResult> => {
  const extra = Math.max(0, Number(additionalBytes) || 0);
  const usage = await getStorageUsage(uid);
  if (!usage.metered) return { allowed: true, ...usage };
  if (usage.usedBytes + extra > usage.quotaBytes) {
    return {
      allowed: false,
      ...usage,
      message: `This save would take you past your storage limit (${formatBytes(usage.usedBytes)} of ${formatBytes(usage.quotaBytes)} used). Delete some saved projects to free up space.`,
    };
  }
  return { allowed: true, ...usage };
};
