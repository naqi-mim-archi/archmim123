import { importTs, check, finish } from './bundleForTest.mjs';

// Asserts each real flow's API routes still add up to the advertised price. Run after changing any route path.

const { getRouteCharge, decideCharge, isPublicApiRoute, resolveRequestId } = await importTs('services/billing/routeCosts.ts');
const { ACTION_PRICES, STEP_COSTS, TOKEN_PACKS, SIGNUP_GRANT_TOKENS, formatBytes, formatTokens } = await importTs('services/billing/pricing.ts');

const cost = (calls) => calls.reduce((sum, [method, url]) => sum + (getRouteCharge(url, method)?.amount || 0), 0);

// Flows
for (const variant of ['d', 'e', 'f', 'g', 'h', 'j']) {
  check(cost([['POST', `/api/text4${variant}/image`], ['POST', `/api/text4${variant}/master-geometry`]]) === ACTION_PRICES.generateAndConvert,
    `text4${variant}: generate + convert = ${ACTION_PRICES.generateAndConvert}`);
}
check(cost([['POST', '/api/text4h/master-geometry']]) === ACTION_PRICES.convertOnly, 'Convert only (master-geometry) = 25');
check(cost([['POST', '/api/text4h/image-redraw']]) === ACTION_PRICES.convertOnly, 'Convert only (image-redraw) = 25');
check(cost([['POST', '/api/text4j/structured3d/convert']]) === ACTION_PRICES.convertOnly, 'Convert only (structured3d) = 25');
check(cost([['POST', '/api/text4j/roboflow/convert']]) === ACTION_PRICES.convertOnly, 'Convert only (roboflow) = 25');
check(cost([['POST', '/api/text2plan/image']]) === STEP_COSTS.floorplanGeneration, 'text2plan image = 25');
check(cost([['POST', '/api/smart-text2plan/image']]) === STEP_COSTS.floorplanGeneration, 'smart-text2plan image = 25');
check(cost([['POST', '/api/ai-render/jobs'], ['GET', '/api/ai-render/jobs/job_1'], ['GET', '/api/ai-render/jobs/job_1']]) === ACTION_PRICES.render,
  'AI render: create job + polling = 50');
check(cost([['POST', '/api/ai-render/jobs/job_1/retry']]) === ACTION_PRICES.render, 'AI render retry = 50');
check(cost([['POST', '/api/exports/revit'], ['GET', '/api/exports/revit/abc'], ['GET', '/api/exports/revit/abc/download']]) === ACTION_PRICES.revitJob,
  'Revit export: start + status + download = 25');
check(cost([['POST', '/api/imports/aps-revit'], ['GET', '/api/imports/aps-revit/abc/result']]) === ACTION_PRICES.revitJob, 'APS Revit import = 25');

// Free routes
const freeRoutes = [
  ['GET', '/api/text4h/image'],
  ['POST', '/api/text4h/generate'],
  ['POST', '/api/text2plan/generate'],
  ['POST', '/api/smart-text2plan/generate'],
  ['POST', '/api/text4h/auth/warm'],
  ['POST', '/api/ai-render/auth/warm'],
  ['POST', '/api/ai-render/enhance-prompt'],
  ['POST', '/api/ai-render/uploads'],
  ['POST', '/api/ai-render/jobs/job_1/cancel'],
  ['POST', '/api/ai-render/jobs/job_1/rate'],
  ['GET', '/api/ai-render/workflows'],
  ['GET', '/api/auto-plan/health'],
  ['GET', '/api/exports/revit/engines'],
  ['GET', '/api/billing/pricing'],
  ['POST', '/api/billing/checkout'],
  ['POST', '/api/billing/storage/check'],
];
for (const [method, url] of freeRoutes) check(!getRouteCharge(url, method), `Free: ${method} ${url}`);
check(cost([['POST', '/api/text4h/image?x=1']]) === 25, 'Query strings do not dodge charging');
check(!getRouteCharge('/api/text4h/image-extra', 'POST'), 'Prefix look-alikes are not charged');

// Public route
check(isPublicApiRoute('/api/billing/pricing', 'GET'), 'GET /api/billing/pricing is public');
check(!isPublicApiRoute('/api/billing/account', 'GET'), '/api/billing/account is not public');
check(!isPublicApiRoute('/api/billing/pricing', 'POST'), 'POST pricing is not public');

// decideCharge
const base = { url: '/api/ai-render/jobs', method: 'POST', userId: 'u1', billingConfigured: true, unmeteredAllowed: false };
check(decideCharge({ ...base, method: 'GET' }).kind === 'free', 'decideCharge: GET is free');
check(decideCharge(base).kind === 'charge' && decideCharge(base).amount === 50, 'decideCharge: signed-in POST is charged 50');
check(decideCharge({ ...base, unmeteredAllowed: true }).kind === 'unmetered', 'decideCharge: ALLOW_UNMETERED_API skips charging');
check(decideCharge({ ...base, userId: null }).kind === 'unmetered', 'decideCharge: anonymous (when allowed) is unmetered');
check(decideCharge({ ...base, billingConfigured: false }).kind === 'unconfigured', 'decideCharge: missing ledger fails closed');

// Request ids
check(resolveRequestId({ 'x-request-id': 'req-abc123-xyz' }) === 'req-abc123-xyz', 'resolveRequestId keeps a valid X-Request-Id');
check(resolveRequestId({ 'x-request-id': '__x__' }) !== '__x__', 'resolveRequestId rejects Firestore-reserved ids');
check(resolveRequestId({ 'x-request-id': 'bad id/with slash' }) !== 'bad id/with slash', 'resolveRequestId rejects invalid characters');
check(/^[A-Za-z0-9_-]{8,120}$/.test(resolveRequestId({})), 'resolveRequestId generates a valid id when missing');

// Pricing table sanity
check(TOKEN_PACKS.every(pack => Math.round(pack.priceUsd * 100) === pack.priceCents), 'Pack priceUsd and priceCents agree');
check(SIGNUP_GRANT_TOKENS === 100, 'Signup grant is 100 tokens');
check(formatTokens(1000) === '1,000' && formatBytes(5 * 1024 ** 3) === '5 GB' && formatBytes(1.2 * 1024 ** 3) === '1.2 GB', 'formatTokens / formatBytes');

finish();
