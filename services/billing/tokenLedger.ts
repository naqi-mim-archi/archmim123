import { getAdminFirestore } from '../firebase/adminApp';
import { FREE_STORAGE_BYTES, SIGNUP_GRANT_TOKENS } from './pricing';

// Server-only. Every balance change runs in a Firestore transaction (all reads before writes).
// The ledger doc id is the idempotency key: spend = requestId, refund = `${requestId}:refund`,
// purchase = `stripe-${eventId}`, grant = `signup-grant`.
//
// entitlements/{uid}: tokenBalance, tokensGrantedLifetime, tokensSpentLifetime,
//                     storageBytesUsed, storageQuotaBytes, signupGrantedAt, createdAt, updatedAt
// entitlements/{uid}/ledger/{entryId}: type, amount (±), reason, detail, balanceAfter, createdAt

export type LedgerEntryType = 'grant' | 'spend' | 'refund' | 'purchase';

export interface Entitlement {
  tokenBalance: number;
  tokensGrantedLifetime: number;
  tokensSpentLifetime: number;
  storageBytesUsed: number;
  storageQuotaBytes: number;
  signupGrantedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

type Db = any; // firebase-admin Firestore (or a structurally compatible fake in tests)

let dbOverride: Db | null = null;
export const setLedgerDbForTests = (db: Db | null) => { dbOverride = db; };
const getDb = (): Db => dbOverride || getAdminFirestore();

const SIGNUP_GRANT_ID = 'signup-grant';

const entitlementRef = (db: Db, uid: string) => db.collection('entitlements').doc(uid);
const ledgerRef = (db: Db, uid: string, entryId: string) => entitlementRef(db, uid).collection('ledger').doc(entryId);

const assertUid = (uid: string) => {
  if (!uid || typeof uid !== 'string') throw new Error('A user id is required for billing.');
};

const newEntitlement = (now: Date): Entitlement => ({
  tokenBalance: SIGNUP_GRANT_TOKENS,
  tokensGrantedLifetime: SIGNUP_GRANT_TOKENS,
  tokensSpentLifetime: 0,
  storageBytesUsed: 0,
  storageQuotaBytes: FREE_STORAGE_BYTES,
  signupGrantedAt: now,
  createdAt: now,
  updatedAt: now,
});

// Reads the entitlement inside a transaction; if it does not exist, returns the first-sight grant to write.
const readOrInitEntitlement = async (tx: any, db: Db, uid: string, now: Date) => {
  const snap = await tx.get(entitlementRef(db, uid));
  if (snap.exists) return { entitlement: snap.data() as Entitlement, isNew: false };
  return { entitlement: newEntitlement(now), isNew: true };
};

const writeSignupGrant = (tx: any, db: Db, uid: string, now: Date) => {
  tx.set(ledgerRef(db, uid, SIGNUP_GRANT_ID), {
    type: 'grant',
    amount: SIGNUP_GRANT_TOKENS,
    reason: 'signup',
    detail: `Welcome grant: ${SIGNUP_GRANT_TOKENS} tokens`,
    balanceAfter: SIGNUP_GRANT_TOKENS,
    createdAt: now,
  });
};

// Grants the signup tokens on first sight (not at sign-up), so accounts created before billing aren't stuck at 0.
export const ensureEntitlement = async (uid: string): Promise<Entitlement> => {
  assertUid(uid);
  const db = getDb();
  return db.runTransaction(async (tx: any) => {
    const now = new Date();
    const { entitlement, isNew } = await readOrInitEntitlement(tx, db, uid, now);
    if (isNew) {
      tx.set(entitlementRef(db, uid), entitlement);
      writeSignupGrant(tx, db, uid, now);
    }
    return entitlement;
  });
};

export type SpendResult =
  | { ok: true; balance: number; charged: number; replayed: boolean }
  | { ok: false; balance: number; required: number };

export const spendTokens = async (
  uid: string,
  input: { amount: number; requestId: string; reason: string; detail?: string },
): Promise<SpendResult> => {
  assertUid(uid);
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error('Spend amount must be a positive integer.');
  const db = getDb();
  return db.runTransaction(async (tx: any) => {
    const now = new Date();
    const { entitlement, isNew } = await readOrInitEntitlement(tx, db, uid, now);
    const entrySnap = await tx.get(ledgerRef(db, uid, input.requestId));

    if (entrySnap.exists) {
      const existing = entrySnap.data();
      if (isNew) {
        tx.set(entitlementRef(db, uid), entitlement);
        writeSignupGrant(tx, db, uid, now);
      }
      return { ok: true, balance: entitlement.tokenBalance, charged: Math.abs(existing.amount || 0), replayed: true } as SpendResult;
    }

    if (entitlement.tokenBalance < input.amount) {
      if (isNew) {
        tx.set(entitlementRef(db, uid), entitlement);
        writeSignupGrant(tx, db, uid, now);
      }
      return { ok: false, balance: entitlement.tokenBalance, required: input.amount } as SpendResult;
    }

    const balanceAfter = entitlement.tokenBalance - input.amount;
    tx.set(entitlementRef(db, uid), {
      ...entitlement,
      tokenBalance: balanceAfter,
      tokensSpentLifetime: (entitlement.tokensSpentLifetime || 0) + input.amount,
      updatedAt: now,
    });
    if (isNew) writeSignupGrant(tx, db, uid, now);
    tx.set(ledgerRef(db, uid, input.requestId), {
      type: 'spend',
      amount: -input.amount,
      reason: input.reason,
      detail: input.detail || input.reason,
      balanceAfter,
      createdAt: now,
    });
    return { ok: true, balance: balanceAfter, charged: input.amount, replayed: false } as SpendResult;
  });
};

// Refunds only when the spend exists and no refund exists yet, and refunds what was actually charged.
export const refundTokens = async (
  uid: string,
  requestId: string,
  detail?: string,
): Promise<{ refunded: number; balance: number | null }> => {
  assertUid(uid);
  const db = getDb();
  return db.runTransaction(async (tx: any) => {
    const now = new Date();
    const entSnap = await tx.get(entitlementRef(db, uid));
    const spendSnap = await tx.get(ledgerRef(db, uid, requestId));
    const refundSnap = await tx.get(ledgerRef(db, uid, `${requestId}:refund`));
    if (!entSnap.exists || !spendSnap.exists || refundSnap.exists) {
      return { refunded: 0, balance: entSnap.exists ? entSnap.data().tokenBalance : null };
    }
    const spend = spendSnap.data();
    if (spend.type !== 'spend' || !(spend.amount < 0)) {
      return { refunded: 0, balance: entSnap.data().tokenBalance };
    }
    const entitlement = entSnap.data() as Entitlement;
    const amount = Math.abs(spend.amount);
    const balanceAfter = entitlement.tokenBalance + amount;
    tx.set(entitlementRef(db, uid), {
      ...entitlement,
      tokenBalance: balanceAfter,
      tokensSpentLifetime: Math.max(0, (entitlement.tokensSpentLifetime || 0) - amount),
      updatedAt: now,
    });
    tx.set(ledgerRef(db, uid, `${requestId}:refund`), {
      type: 'refund',
      amount,
      reason: spend.reason || 'refund',
      detail: detail || `Refund: ${spend.detail || spend.reason || 'failed request'}`,
      balanceAfter,
      createdAt: now,
    });
    return { refunded: amount, balance: balanceAfter };
  });
};

// Used for purchases. Idempotent on requestId (e.g. `stripe-${event.id}`).
export const creditTokens = async (
  uid: string,
  input: { amount: number; requestId: string; detail: string; reason?: string },
): Promise<{ credited: number; balance: number; replayed: boolean }> => {
  assertUid(uid);
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error('Credit amount must be a positive integer.');
  const db = getDb();
  return db.runTransaction(async (tx: any) => {
    const now = new Date();
    const { entitlement, isNew } = await readOrInitEntitlement(tx, db, uid, now);
    const entrySnap = await tx.get(ledgerRef(db, uid, input.requestId));
    if (entrySnap.exists) {
      if (isNew) {
        tx.set(entitlementRef(db, uid), entitlement);
        writeSignupGrant(tx, db, uid, now);
      }
      return { credited: 0, balance: entitlement.tokenBalance, replayed: true };
    }
    const balanceAfter = entitlement.tokenBalance + input.amount;
    tx.set(entitlementRef(db, uid), {
      ...entitlement,
      tokenBalance: balanceAfter,
      tokensGrantedLifetime: (entitlement.tokensGrantedLifetime || 0) + input.amount,
      updatedAt: now,
    });
    if (isNew) writeSignupGrant(tx, db, uid, now);
    tx.set(ledgerRef(db, uid, input.requestId), {
      type: 'purchase',
      amount: input.amount,
      reason: input.reason || 'purchase',
      detail: input.detail,
      balanceAfter,
      createdAt: now,
    });
    return { credited: input.amount, balance: balanceAfter, replayed: false };
  });
};

export const recordStorageUsage = async (uid: string, bytes: number): Promise<void> => {
  assertUid(uid);
  const db = getDb();
  await entitlementRef(db, uid).set({ storageBytesUsed: Math.max(0, Math.round(bytes)), updatedAt: new Date() }, { merge: true });
};
