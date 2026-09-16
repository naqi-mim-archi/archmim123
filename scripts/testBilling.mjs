import { importTs, check, finish } from './bundleForTest.mjs';

// Token ledger, API gateway and Stripe webhook against an in-memory Firestore fake. No network, no real Firebase.

const billing = await importTs('scripts/testBillingEntry.ts');
const { ensureEntitlement, spendTokens, refundTokens, creditTokens, setLedgerDbForTests, runGatedApiRequest, setGatewayDepsForTests, handleStripeWebhook } = billing;

// --- in-memory Firestore fake (collection/doc/runTransaction with reads-before-writes enforced) ---------
const createFakeDb = () => {
  const store = new Map();
  const docRef = (path) => ({
    path,
    collection: (name) => ({ doc: (id) => docRef(`${path}/${name}/${id}`) }),
    set: async (data, options) => { store.set(path, options?.merge ? { ...(store.get(path) || {}), ...data } : { ...data }); },
  });
  return {
    store,
    collection: (name) => ({ doc: (id) => docRef(`${name}/${id}`) }),
    runTransaction: async (fn) => {
      const writes = [];
      let wrote = false;
      const tx = {
        get: async (ref) => {
          if (wrote) throw new Error('Firestore transactions require all reads before writes.');
          const data = store.get(ref.path);
          return { exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
        },
        set: (ref, data) => { wrote = true; writes.push([ref.path, { ...data }]); },
      };
      const result = await fn(tx);
      for (const [path, data] of writes) store.set(path, data);
      return result;
    },
  };
};

const db = createFakeDb();
setLedgerDbForTests(db);
const balanceOf = (uid) => db.store.get(`entitlements/${uid}`)?.tokenBalance;

// --- ledger ------------------------------------------------------------------------------------------
const ent = await ensureEntitlement('alice');
check(ent.tokenBalance === 100 && balanceOf('alice') === 100, 'First sight grants 100 tokens');
check(db.store.get('entitlements/alice/ledger/signup-grant')?.amount === 100, 'Signup grant ledger entry written');
await ensureEntitlement('alice');
check(balanceOf('alice') === 100, 'Second ensureEntitlement does not grant again');

let spend = await spendTokens('alice', { amount: 50, requestId: 'req-spend-0001', reason: 'aiRender' });
check(spend.ok && spend.balance === 50 && !spend.replayed, 'Spend 50 leaves 50');
spend = await spendTokens('alice', { amount: 50, requestId: 'req-spend-0001', reason: 'aiRender' });
check(spend.ok && spend.replayed && balanceOf('alice') === 50, 'Replayed request id is not charged twice');

spend = await spendTokens('alice', { amount: 75, requestId: 'req-spend-0002', reason: 'aiRender' });
check(!spend.ok && spend.required === 75 && spend.balance === 50 && balanceOf('alice') === 50, 'Short balance charges nothing and reports required/balance');
check(!db.store.has('entitlements/alice/ledger/req-spend-0002'), 'No ledger entry for a refused spend');

let refund = await refundTokens('alice', 'req-spend-0001');
check(refund.refunded === 50 && balanceOf('alice') === 100, 'Refund returns the amount actually charged');
refund = await refundTokens('alice', 'req-spend-0001');
check(refund.refunded === 0 && balanceOf('alice') === 100, 'Refund happens only once');
refund = await refundTokens('alice', 'req-never-charged');
check(refund.refunded === 0 && balanceOf('alice') === 100, 'Refund without a spend does nothing');

spend = await spendTokens('bob', { amount: 25, requestId: 'req-bob-00001', reason: 'revitJob' });
check(spend.ok && balanceOf('bob') === 75, 'Spend on a never-seen user grants first, then charges');

let credit = await creditTokens('alice', { amount: 500, requestId: 'stripe-evt_1', detail: 'Purchased 500 tokens ($25.99)' });
check(credit.credited === 500 && balanceOf('alice') === 600, 'Purchase credits tokens');
credit = await creditTokens('alice', { amount: 500, requestId: 'stripe-evt_1', detail: 'Purchased 500 tokens ($25.99)' });
check(credit.replayed && balanceOf('alice') === 600, 'Same Stripe event cannot double-credit');

// --- gateway -------------------------------------------------------------------------------------------
const users = { 'token-alice': { uid: 'alice', email: 'a@example.com', emailVerified: true }, 'token-carol': { uid: 'carol', email: null, emailVerified: false } };
setGatewayDepsForTests({
  verify: async ({ headers }) => {
    const token = String(headers?.authorization || '').replace(/^Bearer /, '');
    if (!token) return { user: null, failure: 'no-token' };
    return users[token] ? { user: users[token], failure: null } : { user: null, failure: 'invalid-token' };
  },
  billingConfigured: () => true,
});

const call = async ({ method = 'POST', url, token, requestId, dispatch }) => {
  const res = { statusCode: 200, body: undefined };
  const response = { status(code) { res.statusCode = code; return response; }, json(body) { res.body = body; } };
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (requestId) headers['x-request-id'] = requestId;
  let dispatched = false;
  const handled = await runGatedApiRequest({ method, url, headers }, response, async (req, resp) => {
    dispatched = true;
    return dispatch ? dispatch(req, resp) : (resp.json({ ok: true }), true);
  });
  return { ...res, handled, dispatched };
};

let r = await call({ url: '/api/text4h/image' });
check(r.statusCode === 401 && !r.dispatched, 'Signed-out POST gets 401 and never reaches the route');
r = await call({ method: 'GET', url: '/api/ai-render/workflows', token: 'bad' });
check(r.statusCode === 401 && r.body.reason === 'invalid-token', 'Invalid token gets 401 with reason');

const aliceBefore = balanceOf('alice');
r = await call({ url: '/api/text4h/image', token: 'token-alice', requestId: 'req-gw-000001' });
check(r.statusCode === 200 && r.dispatched && balanceOf('alice') === aliceBefore - 25, 'Chargeable route charges 25 before dispatch');

r = await call({ url: '/api/text4h/master-geometry', token: 'token-alice', requestId: 'req-gw-000002', dispatch: async (_req, resp) => { resp.status(500).json({ error: 'boom' }); return true; } });
check(r.statusCode === 500 && balanceOf('alice') === aliceBefore - 25, 'Route answering >= 400 is refunded automatically');

await call({ url: '/api/text4h/master-geometry', token: 'token-alice', requestId: 'req-gw-000003', dispatch: async () => { throw new Error('crash'); } }).catch(() => undefined);
check(balanceOf('alice') === aliceBefore - 25, 'Route that throws is refunded');

r = await call({ method: 'GET', url: '/api/text4h/image', token: 'token-alice' });
check(r.statusCode === 200 && balanceOf('alice') === aliceBefore - 25, 'GET is free');

await ensureEntitlement('carol');
await spendTokens('carol', { amount: 75, requestId: 'req-carol-drain', reason: 'test' });
r = await call({ url: '/api/ai-render/jobs', token: 'token-carol', requestId: 'req-gw-000004' });
check(r.statusCode === 402 && r.body.required === 50 && r.body.balance === 25 && !r.dispatched, 'Short balance gets 402 {required, balance} and the route never runs');

// Job ownership: someone else's job is 404
r = await call({ url: '/api/ai-render/jobs', token: 'token-alice', requestId: 'req-gw-000005', dispatch: async (_req, resp) => { resp.json({ jobId: 'job_owned', status: 'queued' }); return true; } });
check(r.statusCode === 200 && r.body.jobId === 'job_owned', 'Alice creates an AI render job');
r = await call({ method: 'GET', url: '/api/ai-render/jobs/job_owned', token: 'token-carol' });
check(r.statusCode === 404 && !r.dispatched, "Another user's job answers 404");
r = await call({ method: 'GET', url: '/api/ai-render/jobs/job_owned', token: 'token-alice' });
check(r.statusCode === 200 && r.dispatched, 'Owner can read the job');

// Failed job observed on poll refunds its charge (once)
const beforeFail = balanceOf('alice');
await call({ method: 'GET', url: '/api/ai-render/jobs/job_owned', token: 'token-alice', dispatch: async (_req, resp) => { resp.json({ jobId: 'job_owned', status: 'failed' }); return true; } });
await new Promise(resolve => setTimeout(resolve, 50));
check(balanceOf('alice') === beforeFail + 50, 'Failed AI render job refunds 50');
await call({ method: 'GET', url: '/api/ai-render/jobs/job_owned', token: 'token-alice', dispatch: async (_req, resp) => { resp.json({ jobId: 'job_owned', status: 'failed' }); return true; } });
await new Promise(resolve => setTimeout(resolve, 50));
check(balanceOf('alice') === beforeFail + 50, 'Failed job is refunded only once');

// Fail closed when the ledger is not configured
setGatewayDepsForTests({ verify: async () => ({ user: users['token-alice'], failure: null }), billingConfigured: () => false });
r = await call({ url: '/api/ai-render/jobs', token: 'token-alice' });
check(r.statusCode === 503 && !r.dispatched, 'Unconfigured billing fails closed with 503');
setGatewayDepsForTests({ verify: async () => ({ user: null, failure: 'server-unconfigured', message: 'x' }), billingConfigured: () => true });
r = await call({ method: 'GET', url: '/api/ai-render/workflows', token: 'whatever' });
check(r.statusCode === 503 && r.body.reason === 'server-unconfigured', 'Server that cannot verify tokens answers 503, not 401');
r = await call({ method: 'GET', url: '/api/billing/pricing' });
check(r.statusCode === 200 && Array.isArray(r.body.packs), 'Public pricing route works signed out');

// --- Stripe webhook ------------------------------------------------------------------------------------
process.env.STRIPE_WEBHOOK_SECRET = '';
let hook = await handleStripeWebhook(Buffer.from('{}'), 'sig');
check(hook.status === 503, 'Webhook without secret answers 503');
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
hook = await handleStripeWebhook(Buffer.from('{}'), undefined);
check(hook.status === 400, 'Webhook without signature answers 400');
hook = await handleStripeWebhook(Buffer.from('{}'), 'sig', { constructEvent: () => { throw new Error('bad signature'); } });
check(hook.status === 400, 'Webhook with a bad signature answers 400');

const paidEvent = (overrides = {}) => ({
  id: 'evt_paid_1',
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_1', payment_status: 'paid', client_reference_id: 'dave', metadata: { uid: 'dave', packId: 'pack-500', tokens: '999999' }, ...overrides } },
});
hook = await handleStripeWebhook(Buffer.from('{}'), 'sig', { constructEvent: () => paidEvent() });
check(hook.status === 200 && hook.body.credited === 500 && balanceOf('dave') === 600, 'Paid session credits pack tokens from server data (not metadata)');
hook = await handleStripeWebhook(Buffer.from('{}'), 'sig', { constructEvent: () => paidEvent() });
check(hook.body.replayed === true && balanceOf('dave') === 600, 'Stripe retry of the same event does not double-credit');
hook = await handleStripeWebhook(Buffer.from('{}'), 'sig', { constructEvent: () => ({ ...paidEvent({ payment_status: 'unpaid' }), id: 'evt_unpaid' }) });
check(hook.status === 200 && hook.body.ignored && balanceOf('dave') === 600, 'Unpaid session is ignored');
hook = await handleStripeWebhook(Buffer.from('{}'), 'sig', { constructEvent: () => ({ id: 'evt_other', type: 'payment_intent.created', data: { object: {} } }) });
check(hook.status === 200 && hook.body.ignored === 'payment_intent.created', 'Other event types are ignored with 200');

setGatewayDepsForTests(null);
setLedgerDbForTests(null);
finish();
