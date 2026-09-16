// GENERATED from services/stripeWebhookHandler.ts by scripts/buildApiFunction.mjs. Do not edit.

// services/billing/stripeClient.ts
import Stripe from "stripe";

// services/billing/pricing.ts
var SIGNUP_GRANT_TOKENS = 100;
var TOKEN_PACKS = [
  { id: "pack-100", tokens: 100, priceUsd: 9.99, priceCents: 999 },
  { id: "pack-500", tokens: 500, priceUsd: 25.99, priceCents: 2599 },
  { id: "pack-1000", tokens: 1e3, priceUsd: 49.99, priceCents: 4999 }
];
var FREE_STORAGE_BYTES = 5 * 1024 * 1024 * 1024;
var findTokenPack = (packId) => TOKEN_PACKS.find((pack) => pack.id === packId);
var formatTokens = (n) => Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "\u2014";

// services/billing/stripeClient.ts
var cachedStripe = null;
var getStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  if (!cachedStripe || cachedStripe.key !== key) cachedStripe = { key, client: new Stripe(key) };
  return cachedStripe.client;
};

// services/firebase/adminApp.ts
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
var APP_NAME = "archai-admin";
var cached = null;
var getFirebaseProjectId = () => process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "";
var parseServiceAccount = () => {
  let raw = (process.env.FIREBASE_ADMIN_SA_KEY_JSON || "").trim();
  if (!raw) return { serviceAccount: null, error: null };
  if (raw.startsWith("'") && raw.endsWith("'") || raw.startsWith('"') && raw.endsWith('"') && !raw.startsWith("{")) {
    raw = raw.slice(1, -1);
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.client_email || !parsed.private_key) {
      return { serviceAccount: null, error: "FIREBASE_ADMIN_SA_KEY_JSON is missing client_email or private_key." };
    }
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    return { serviceAccount: parsed, error: null };
  } catch {
    return { serviceAccount: null, error: "FIREBASE_ADMIN_SA_KEY_JSON is not valid JSON." };
  }
};
var getAdmin = () => {
  if (cached) return cached;
  const { serviceAccount, error } = parseServiceAccount();
  if (!serviceAccount) {
    cached = { app: null, serviceAccount: null, error };
    return cached;
  }
  try {
    const projectId = getFirebaseProjectId() || serviceAccount.project_id;
    const existing = getApps().find((app2) => app2.name === APP_NAME);
    const app = existing || initializeApp({
      credential: cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key
      }),
      projectId,
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || (projectId ? `${projectId}.firebasestorage.app` : void 0)
    }, APP_NAME);
    cached = { app, serviceAccount, error: null };
  } catch (err) {
    cached = { app: null, serviceAccount, error: `firebase-admin failed to initialise: ${err?.message || err}` };
  }
  return cached;
};
var getAdminFirestore = () => {
  const { app, error } = getAdmin();
  if (!app) throw new Error(error || "FIREBASE_ADMIN_SA_KEY_JSON is not configured.");
  return getFirestore(app);
};

// services/billing/tokenLedger.ts
var dbOverride = null;
var getDb = () => dbOverride || getAdminFirestore();
var SIGNUP_GRANT_ID = "signup-grant";
var entitlementRef = (db, uid) => db.collection("entitlements").doc(uid);
var ledgerRef = (db, uid, entryId) => entitlementRef(db, uid).collection("ledger").doc(entryId);
var assertUid = (uid) => {
  if (!uid || typeof uid !== "string") throw new Error("A user id is required for billing.");
};
var newEntitlement = (now) => ({
  tokenBalance: SIGNUP_GRANT_TOKENS,
  tokensGrantedLifetime: SIGNUP_GRANT_TOKENS,
  tokensSpentLifetime: 0,
  storageBytesUsed: 0,
  storageQuotaBytes: FREE_STORAGE_BYTES,
  signupGrantedAt: now,
  createdAt: now,
  updatedAt: now
});
var readOrInitEntitlement = async (tx, db, uid, now) => {
  const snap = await tx.get(entitlementRef(db, uid));
  if (snap.exists) return { entitlement: snap.data(), isNew: false };
  return { entitlement: newEntitlement(now), isNew: true };
};
var writeSignupGrant = (tx, db, uid, now) => {
  tx.set(ledgerRef(db, uid, SIGNUP_GRANT_ID), {
    type: "grant",
    amount: SIGNUP_GRANT_TOKENS,
    reason: "signup",
    detail: `Welcome grant: ${SIGNUP_GRANT_TOKENS} tokens`,
    balanceAfter: SIGNUP_GRANT_TOKENS,
    createdAt: now
  });
};
var creditTokens = async (uid, input) => {
  assertUid(uid);
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("Credit amount must be a positive integer.");
  const db = getDb();
  return db.runTransaction(async (tx) => {
    const now = /* @__PURE__ */ new Date();
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
      updatedAt: now
    });
    if (isNew) writeSignupGrant(tx, db, uid, now);
    tx.set(ledgerRef(db, uid, input.requestId), {
      type: "purchase",
      amount: input.amount,
      reason: input.reason || "purchase",
      detail: input.detail,
      balanceAfter,
      createdAt: now
    });
    return { credited: input.amount, balance: balanceAfter, replayed: false };
  });
};

// services/billing/stripeWebhook.ts
var handleStripeWebhook = async (rawBody, signature, deps = {}) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!secret) return { status: 503, body: { error: "STRIPE_WEBHOOK_SECRET is not configured." } };
  const sig = Array.isArray(signature) ? signature[0] : signature;
  if (!sig) return { status: 400, body: { error: "Missing Stripe-Signature header." } };
  let event;
  try {
    const construct = deps.constructEvent || ((body, s, sec) => getStripe().webhooks.constructEvent(body, s, sec));
    event = construct(rawBody, sig, secret);
  } catch (err) {
    return { status: 400, body: { error: `Webhook signature verification failed: ${err?.message || err}` } };
  }
  if (event.type !== "checkout.session.completed") return { status: 200, body: { received: true, ignored: event.type } };
  const session = event.data?.object || {};
  if (session.payment_status !== "paid") return { status: 200, body: { received: true, ignored: `payment_status ${session.payment_status}` } };
  const uid = session.metadata?.uid || session.client_reference_id;
  const pack = findTokenPack(session.metadata?.packId);
  if (!uid || !pack) {
    console.error("[Stripe webhook] Paid session without a usable uid/packId", { eventId: event.id, sessionId: session.id });
    return { status: 200, body: { received: true, ignored: "missing uid or packId" } };
  }
  const result = await (deps.credit || creditTokens)(uid, {
    amount: pack.tokens,
    requestId: `stripe-${event.id}`,
    detail: `Purchased ${formatTokens(pack.tokens)} tokens ($${pack.priceUsd.toFixed(2)})`,
    reason: "purchase"
  });
  return { status: 200, body: { received: true, credited: result.credited, replayed: result.replayed } };
};

// services/stripeWebhookHandler.ts
var config = { api: { bodyParser: false } };
async function stripeWebhook(req, res) {
  const send = (status, body) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  };
  if (req.method !== "POST") {
    send(405, { error: "Method Not Allowed" });
    return;
  }
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const result = await handleStripeWebhook(Buffer.concat(chunks), req.headers["stripe-signature"]);
    send(result.status, result.body);
  } catch (error) {
    console.error("[Stripe webhook] Handler error:", error);
    send(500, { error: error instanceof Error ? error.message : String(error) });
  }
}
export {
  config,
  stripeWebhook as default
};
