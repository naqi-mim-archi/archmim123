import { collection, doc, getDocs, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { getFirebaseDb } from '../firebase/firebaseConfig';
import type { TokenPack } from './pricing';

// Browser billing client. Never show a confident "0" unless status is 'ok'; show "—" instead.

export type BalanceStatus = 'loading' | 'ok' | 'missing' | 'unreadable';

export interface BalanceSnapshot {
  status: BalanceStatus;
  tokenBalance: number | null;
  storageBytesUsed: number | null;
  storageQuotaBytes: number | null;
}

export const watchAccountBalance = (uid: string, cb: (snapshot: BalanceSnapshot) => void) => {
  cb({ status: 'loading', tokenBalance: null, storageBytesUsed: null, storageQuotaBytes: null });
  return onSnapshot(
    doc(getFirebaseDb(), 'entitlements', uid),
    snap => {
      if (!snap.exists()) {
        cb({ status: 'missing', tokenBalance: null, storageBytesUsed: null, storageQuotaBytes: null });
        return;
      }
      const data = snap.data();
      cb({
        status: 'ok',
        tokenBalance: typeof data.tokenBalance === 'number' ? data.tokenBalance : null,
        storageBytesUsed: typeof data.storageBytesUsed === 'number' ? data.storageBytesUsed : null,
        storageQuotaBytes: typeof data.storageQuotaBytes === 'number' ? data.storageQuotaBytes : null,
      });
    },
    // Permission denied almost always means the Firestore rules aren't deployed.
    () => cb({ status: 'unreadable', tokenBalance: null, storageBytesUsed: null, storageQuotaBytes: null }),
  );
};

export interface LedgerEntry {
  id: string;
  type: 'grant' | 'spend' | 'refund' | 'purchase';
  amount: number;
  reason?: string;
  detail?: string;
  balanceAfter?: number;
  createdAt: Date | null;
}

const toDate = (value: any): Date | null => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const listRecentLedgerEntries = async (uid: string, count = 25): Promise<LedgerEntry[]> => {
  const snap = await getDocs(query(collection(getFirebaseDb(), 'entitlements', uid, 'ledger'), orderBy('createdAt', 'desc'), limit(count)));
  return snap.docs.map(entry => {
    const data = entry.data();
    return {
      id: entry.id,
      type: data.type,
      amount: Number(data.amount) || 0,
      reason: data.reason,
      detail: data.detail,
      balanceAfter: data.balanceAfter,
      createdAt: toDate(data.createdAt),
    };
  });
};

export interface AccountSummary {
  tokenBalance: number;
  tokensGrantedLifetime: number;
  tokensSpentLifetime: number;
  storage: { usedBytes: number; quotaBytes: number; metered: boolean };
  packs: TokenPack[];
  actionPrices: Record<string, number>;
  paymentsEnabled: boolean;
}

const readError = async (res: Response, fallback: string) => {
  try {
    const body = await res.json();
    return body?.error || fallback;
  } catch {
    return fallback;
  }
};

export const fetchAccountSummary = async (): Promise<AccountSummary> => {
  const res = await fetch('/api/billing/account');
  if (!res.ok) throw new Error(await readError(res, `Could not load your account (HTTP ${res.status}).`));
  return res.json();
};

export interface StorageAllowance {
  allowed: boolean;
  usedBytes?: number;
  quotaBytes?: number;
  metered?: boolean;
  message?: string;
}

// If the check itself fails, the save is allowed.
export const checkStorageAllowance = async (additionalBytes: number): Promise<StorageAllowance> => {
  try {
    const res = await fetch('/api/billing/storage/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ additionalBytes }),
    });
    if (!res.ok) return { allowed: true, metered: false };
    return await res.json();
  } catch {
    return { allowed: true, metered: false };
  }
};

export const startCheckout = async (packId: string, email?: string | null): Promise<string> => {
  const res = await fetch('/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packId, email }),
  });
  if (!res.ok) throw new Error(await readError(res, `Checkout could not be started (HTTP ${res.status}).`));
  const body = await res.json();
  if (!body?.url) throw new Error('Checkout could not be started.');
  return body.url;
};
