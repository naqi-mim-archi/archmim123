import { getAdminConfigStatus, getFirebaseProjectId, hasAdminCredentials } from '../firebase/adminApp';
import type { VerifiedIdToken } from '../firebase/verifyIdToken';
import { ACTION_PRICES, SIGNUP_GRANT_TOKENS, TOKEN_PACKS } from './pricing';
import { ensureEntitlement } from './tokenLedger';
import { checkStorageAllowance, getStorageUsage } from './storageUsage';
import { createTokenCheckoutSession, isStripeConfigured } from './stripeClient';

export const BILLING_UNCONFIGURED_MESSAGE =
  'Billing is not configured on the server (FIREBASE_ADMIN_SA_KEY_JSON is missing), so token balances cannot be read right now.';

interface BillingRequest {
  method?: string;
  url?: string;
  body?: any;
  user: VerifiedIdToken | null;
}

interface BillingResponse {
  status(code: number): BillingResponse;
  json(payload: any): void;
}

const pathOf = (url?: string) => String(url || '').split(/[?#]/)[0];

// All billing routes are free (never charged).
export const routeBillingApiRequest = async (request: BillingRequest, response: BillingResponse): Promise<boolean> => {
  const path = pathOf(request.url);
  if (!path.startsWith('/api/billing/')) return false;
  const method = String(request.method || 'GET').toUpperCase();

  if (method === 'GET' && path === '/api/billing/pricing') {
    const admin = getAdminConfigStatus();
    response.status(200).json({
      packs: TOKEN_PACKS,
      actionPrices: ACTION_PRICES,
      signupGrant: SIGNUP_GRANT_TOKENS,
      paymentsEnabled: isStripeConfigured(),
      server: {
        projectId: getFirebaseProjectId() || null,
        canVerifySignIn: !!getFirebaseProjectId(),
        canMeterTokens: admin.hasServiceAccount,
        serviceAccount: admin.serviceAccountEmail,
        serviceAccountProjectId: admin.serviceAccountProjectId,
        configError: admin.error,
        nodeVersion: process.version,
      },
    });
    return true;
  }

  const isUserRoute =
    (method === 'GET' && path === '/api/billing/account') ||
    (method === 'POST' && path === '/api/billing/storage/check') ||
    (method === 'POST' && path === '/api/billing/checkout');
  if (!isUserRoute) {
    response.status(404).json({ error: 'Not Found' });
    return true;
  }

  const user = request.user;
  if (!user) {
    response.status(401).json({ error: 'Sign in to continue.', reason: 'no-token' });
    return true;
  }

  if (path === '/api/billing/storage/check') {
    response.status(200).json(await checkStorageAllowance(user.uid, request.body?.additionalBytes));
    return true;
  }

  if (!hasAdminCredentials()) {
    response.status(503).json({ error: BILLING_UNCONFIGURED_MESSAGE });
    return true;
  }

  if (path === '/api/billing/account') {
    const [entitlement, storage] = await Promise.all([ensureEntitlement(user.uid), getStorageUsage(user.uid)]);
    response.status(200).json({
      tokenBalance: entitlement.tokenBalance,
      tokensGrantedLifetime: entitlement.tokensGrantedLifetime,
      tokensSpentLifetime: entitlement.tokensSpentLifetime,
      storage,
      packs: TOKEN_PACKS,
      actionPrices: ACTION_PRICES,
      paymentsEnabled: isStripeConfigured(),
    });
    return true;
  }

  // POST /api/billing/checkout
  if (!isStripeConfigured()) {
    response.status(503).json({ error: "Card payments aren't switched on for this deployment yet." });
    return true;
  }
  try {
    await ensureEntitlement(user.uid);
    const session = await createTokenCheckoutSession({
      uid: user.uid,
      packId: request.body?.packId,
      email: user.email || request.body?.email || null,
    });
    response.status(200).json(session);
  } catch (err: any) {
    // Never forward an upstream status: the browser treats 401 as a dead session (and 402 as a token shortfall),
    // so a Stripe auth failure here would surface as an unescapable sign-in prompt instead of the real error.
    response.status(err?.statusCode === 400 ? 400 : 502).json({ error: err?.message || 'Checkout could not be started.' });
  }
  return true;
};
