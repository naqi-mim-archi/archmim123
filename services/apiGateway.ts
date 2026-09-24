import { verifyApiRequest } from './firebase/adminAuth';
import { hasAdminCredentials } from './firebase/adminApp';
import type { VerifiedIdToken } from './firebase/verifyIdToken';
import { routeBillingApiRequest, BILLING_UNCONFIGURED_MESSAGE } from './billing/billingRoutes';
import { routeShareApiRequest } from './share/shareApiRoutes';
import { CHARGE_DETAILS, decideCharge, isEnvFlagOn, isPublicApiRoute, resolveRequestId } from './billing/routeCosts';
import { INSUFFICIENT_TOKENS_STATUS } from './billing/pricing';
import { refundTokens, spendTokens } from './billing/tokenLedger';

// Shared by the Vite dev middleware (vite.config.js) and the Vercel catch-all (services/vercelApiHandler.ts),
// so dev and prod gate, charge and refund identically. Route modules themselves are untouched.

export interface ApiResponseLike {
  status(code: number): ApiResponseLike;
  json(payload: any): void;
}

export interface GatedApiRequest {
  method?: string;
  url?: string;
  body?: any;
  user: VerifiedIdToken | null;
}

export type ApiDispatch = (request: GatedApiRequest, response: ApiResponseLike) => Promise<boolean>;

interface JobRecord {
  ownerId: string | null;
  chargeRequestId: string | null;
  kind: 'ai-render' | 'revit-export' | 'aps-revit-import';
  watching?: boolean;
}

// In-memory, like the job stores themselves.
const JOB_RECORDS = new Map<string, JobRecord>();
const JOB_WATCH_INTERVAL_MS = 10000;
const JOB_WATCH_MAX_MS = 60 * 60 * 1000;

const pathOf = (url?: string) => String(url || '').split(/[?#]/)[0];

// Test hooks (scripts/testBilling.mjs): inject auth + billing availability without real Firebase.
let verifyRequest = verifyApiRequest;
let isBillingConfigured = hasAdminCredentials;
export const setGatewayDepsForTests = (deps: { verify?: typeof verifyApiRequest; billingConfigured?: () => boolean } | null) => {
  verifyRequest = deps?.verify || verifyApiRequest;
  isBillingConfigured = deps?.billingConfigured || hasAdminCredentials;
};

const JOB_ROUTE_PATTERNS: Array<{ kind: JobRecord['kind']; pattern: RegExp }> = [
  { kind: 'ai-render', pattern: /^\/api\/ai-render\/jobs\/([^/]+)(?:\/(?:result|cancel|retry|rate))?\/?$/ },
  { kind: 'revit-export', pattern: /^\/api\/exports\/revit\/([^/]+)(?:\/download)?\/?$/ },
  { kind: 'aps-revit-import', pattern: /^\/api\/imports\/aps-revit\/([^/]+)(?:\/result)?\/?$/ },
];

const JOB_CREATE_PATTERNS: Array<{ kind: JobRecord['kind']; pattern: RegExp }> = [
  { kind: 'ai-render', pattern: /^\/api\/ai-render\/jobs\/?$/ },
  { kind: 'revit-export', pattern: /^\/api\/exports\/revit\/?$/ },
  { kind: 'aps-revit-import', pattern: /^\/api\/imports\/aps-revit\/?$/ },
];

const matchJobId = (path: string): { kind: JobRecord['kind']; jobId: string } | null => {
  for (const { kind, pattern } of JOB_ROUTE_PATTERNS) {
    const match = pattern.exec(path);
    if (match && !['engines', 'download'].includes(match[1])) return { kind, jobId: decodeURIComponent(match[1]) };
  }
  return null;
};

const refundQuietly = async (uid: string, requestId: string, detail?: string) => {
  try {
    const { refunded } = await refundTokens(uid, requestId, detail);
    if (refunded) console.log(`[Billing] Refunded ${refunded} tokens to ${uid} for ${requestId}`);
  } catch (err) {
    console.error(`[Billing] Refund failed for ${requestId}:`, err);
  }
};

const isTerminalFailure = (status: unknown) => status === 'failed' || status === 'cancelled';

// AI render jobs fail or get cancelled minutes after the charge; refund against the job's chargeRequestId.
const watchAiRenderJob = (jobId: string, dispatch: ApiDispatch) => {
  const record = JOB_RECORDS.get(jobId);
  if (!record || record.watching || !record.ownerId || !record.chargeRequestId) return;
  record.watching = true;
  const startedAt = Date.now();
  const tick = async () => {
    const current = JOB_RECORDS.get(jobId);
    if (!current?.ownerId || !current.chargeRequestId) return;
    let payload: any = null;
    let statusCode = 200;
    const probe: ApiResponseLike = {
      status(code) { statusCode = code; return probe; },
      json(body) { payload = body; },
    };
    try {
      await dispatch({ method: 'GET', url: `/api/ai-render/jobs/${encodeURIComponent(jobId)}`, user: null }, probe);
    } catch {
      payload = null;
    }
    if (statusCode === 404) { current.watching = false; return; }
    if (isTerminalFailure(payload?.status)) {
      await refundQuietly(current.ownerId, current.chargeRequestId, `Refund: AI render ${payload.status}`);
      current.watching = false;
      return;
    }
    if (payload?.status === 'completed' || Date.now() - startedAt > JOB_WATCH_MAX_MS) { current.watching = false; return; }
    setTimeout(tick, JOB_WATCH_INTERVAL_MS);
  };
  setTimeout(tick, JOB_WATCH_INTERVAL_MS);
};

export const runGatedApiRequest = async (
  incoming: { method?: string; url?: string; headers?: Record<string, string | string[] | undefined>; body?: any },
  response: ApiResponseLike,
  dispatch: ApiDispatch,
): Promise<boolean> => {
  const method = String(incoming.method || 'GET').toUpperCase();
  const url = String(incoming.url || '');
  const path = pathOf(url);

  const auth = await verifyRequest({ headers: incoming.headers });
  const user = auth.user;
  const allowAnonymous = isEnvFlagOn(process.env.ALLOW_ANONYMOUS_API);

  if (!user && !allowAnonymous && !isPublicApiRoute(url, method)) {
    if (auth.failure === 'server-unconfigured') {
      response.status(503).json({
        error: 'Sign-in cannot be verified on the server right now. Please try again shortly.',
        reason: 'server-unconfigured',
        detail: auth.message,
      });
    } else {
      response.status(401).json({
        error: auth.failure === 'invalid-token' ? 'Your session has expired. Please sign in again.' : 'Sign in to continue.',
        reason: auth.failure || 'no-token',
      });
    }
    return true;
  }

  if (path.startsWith('/api/billing/')) {
    return routeBillingApiRequest({ method, url, body: incoming.body, user }, response);
  }

  if (path.startsWith('/api/share/')) {
    return routeShareApiRequest({ method, url, body: incoming.body, user }, response);
  }

  // Someone else's job answers 404, not 403.
  const jobRef = matchJobId(path);
  if (jobRef) {
    const record = JOB_RECORDS.get(jobRef.jobId);
    if (record?.ownerId && record.ownerId !== user?.uid) {
      response.status(404).json({ error: 'Job not found' });
      return true;
    }
  }

  const decision = decideCharge({
    url,
    method,
    userId: user?.uid,
    billingConfigured: isBillingConfigured(),
    unmeteredAllowed: isEnvFlagOn(process.env.ALLOW_UNMETERED_API),
  });

  if (decision.kind === 'unconfigured') {
    response.status(503).json({ error: BILLING_UNCONFIGURED_MESSAGE, reason: 'billing-unconfigured' });
    return true;
  }

  let chargedRequestId: string | null = null;
  if (decision.kind === 'charge' && user) {
    const requestId = resolveRequestId(incoming.headers);
    try {
      const result = await spendTokens(user.uid, {
        amount: decision.amount,
        requestId,
        reason: decision.reason,
        detail: CHARGE_DETAILS[decision.reason],
      });
      if (!result.ok) {
        const shortfall = result as Extract<typeof result, { ok: false }>;
        response.status(INSUFFICIENT_TOKENS_STATUS).json({
          error: `That action needs ${shortfall.required} tokens and you have ${shortfall.balance}.`,
          required: shortfall.required,
          balance: shortfall.balance,
          reason: decision.reason,
        });
        return true;
      }
      // A replayed request id was already charged (and maybe refunded) earlier; don't refund it twice from here.
      chargedRequestId = (result as Extract<typeof result, { ok: true }>).replayed ? null : requestId;
    } catch (err: any) {
      console.error('[Billing] Token ledger error:', err);
      response.status(503).json({ error: 'Token balance could not be checked right now. Please try again shortly.', reason: 'ledger-error' });
      return true;
    }
  }

  let finalStatus = 200;
  let payload: any;
  const tracked: ApiResponseLike = {
    status(code) {
      finalStatus = code;
      response.status(code);
      return tracked;
    },
    json(body) {
      payload = body;
      response.json(body);
    },
  };

  let handled = false;
  try {
    handled = await dispatch({ method, url, body: incoming.body, user }, tracked);
    return handled;
  } catch (err) {
    finalStatus = 500;
    throw err;
  } finally {
    const failed = !handled || finalStatus >= 400;
    if (chargedRequestId && user && failed) {
      await refundQuietly(user.uid, chargedRequestId);
    }

    if (handled && !failed && payload?.jobId) {
      const created = JOB_CREATE_PATTERNS.find(entry => method === 'POST' && entry.pattern.test(path));
      if (created) {
        JOB_RECORDS.set(String(payload.jobId), { ownerId: user?.uid || null, chargeRequestId: chargedRequestId, kind: created.kind });
        // Serverless: the render already finished inside this request, and nothing of ours runs
        // after the response, so a failure is refunded here rather than by the watcher.
        if (created.kind === 'ai-render' && isTerminalFailure(payload?.status)) {
          if (user && chargedRequestId) await refundQuietly(user.uid, chargedRequestId, `Refund: AI render ${payload.status}`);
        } else if (created.kind === 'ai-render') {
          watchAiRenderJob(String(payload.jobId), dispatch);
        }
      }
    }

    if (handled && !failed && jobRef?.kind === 'ai-render') {
      const record = JOB_RECORDS.get(jobRef.jobId);
      if (record && /\/retry\/?$/.test(path) && method === 'POST' && user) {
        // The retry was charged on its own request id; a later failure refunds that charge.
        record.chargeRequestId = chargedRequestId;
        record.watching = false;
        if (isTerminalFailure(payload?.status)) {
          if (chargedRequestId) await refundQuietly(user.uid, chargedRequestId, `Refund: AI render ${payload.status}`);
        } else {
          watchAiRenderJob(jobRef.jobId, dispatch);
        }
      } else if (record?.ownerId && record.chargeRequestId && isTerminalFailure(payload?.status)) {
        void refundQuietly(record.ownerId, record.chargeRequestId, `Refund: AI render ${payload.status}`);
      }
    }
  }
};

export const __resetJobRecordsForTests = () => JOB_RECORDS.clear();
