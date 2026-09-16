import { STEP_COSTS } from './pricing';

// Charging is decided by route, never by anything the client declares.
// Only POSTs are charged; polling, GETs, chat/text generation, the canvas and health checks are free.

export type ChargeReason = 'floorplanGeneration' | 'floorplanConversion' | 'aiRender' | 'revitJob';

interface ChargeRule {
  reason: ChargeReason;
  pattern: RegExp;
}

const CHARGE_RULES: ChargeRule[] = [
  // Generation (25): text -> floorplan image
  { reason: 'floorplanGeneration', pattern: /^\/api\/text2plan\/image\/?$/ },
  { reason: 'floorplanGeneration', pattern: /^\/api\/smart-text2plan\/image\/?$/ },
  { reason: 'floorplanGeneration', pattern: /^\/api\/text4[a-j]\/image\/?$/ },
  { reason: 'floorplanGeneration', pattern: /^\/api\/auto-plan\/(image|generate)\/?$/ },
  // Conversion (25): floorplan image -> geometry
  { reason: 'floorplanConversion', pattern: /^\/api\/text4[a-j]\/(master-geometry|image-redraw|roboflow\/convert|structured3d\/convert)\/?$/ },
  // AI render (50)
  { reason: 'aiRender', pattern: /^\/api\/ai-render\/jobs\/?$/ },
  { reason: 'aiRender', pattern: /^\/api\/ai-render\/jobs\/[^/]+\/retry\/?$/ },
  // Revit jobs (25)
  { reason: 'revitJob', pattern: /^\/api\/exports\/revit\/?$/ },
  { reason: 'revitJob', pattern: /^\/api\/imports\/aps-revit\/?$/ },
];

export const CHARGE_DETAILS: Record<ChargeReason, string> = {
  floorplanGeneration: 'Floorplan generation',
  floorplanConversion: 'Floorplan conversion',
  aiRender: 'AI render',
  revitJob: 'Revit job',
};

const pathOf = (url: string | undefined): string => {
  const raw = String(url || '');
  const queryIndex = raw.search(/[?#]/);
  return queryIndex === -1 ? raw : raw.slice(0, queryIndex);
};

export const getRouteCharge = (url: string | undefined, method: string | undefined): { reason: ChargeReason; amount: number } | null => {
  if (String(method || 'GET').toUpperCase() !== 'POST') return null;
  const path = pathOf(url);
  const rule = CHARGE_RULES.find(candidate => candidate.pattern.test(path));
  return rule ? { reason: rule.reason, amount: STEP_COSTS[rule.reason] } : null;
};

export const isPublicApiRoute = (url: string | undefined, method: string | undefined): boolean =>
  String(method || 'GET').toUpperCase() === 'GET' && /^\/api\/billing\/pricing\/?$/.test(pathOf(url));

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,120}$/;

export const generateRequestId = (): string =>
  `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export const resolveRequestId = (headers: Record<string, string | string[] | undefined> | undefined): string => {
  const raw = headers?.['x-request-id'] ?? headers?.['X-Request-Id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && REQUEST_ID_PATTERN.test(value) && !/^__.*__$/.test(value)) return value;
  return generateRequestId();
};

export type ChargeDecision =
  | { kind: 'free' }
  | { kind: 'unmetered'; why: 'disabled' | 'anonymous'; reason: ChargeReason; amount: number }
  | { kind: 'unconfigured'; reason: ChargeReason; amount: number }
  | { kind: 'charge'; reason: ChargeReason; amount: number };

export const decideCharge = (input: {
  url: string | undefined;
  method: string | undefined;
  userId: string | null | undefined;
  billingConfigured: boolean;
  unmeteredAllowed: boolean;
}): ChargeDecision => {
  const charge = getRouteCharge(input.url, input.method);
  if (!charge) return { kind: 'free' };
  if (input.unmeteredAllowed) return { kind: 'unmetered', why: 'disabled', ...charge };
  // Only reachable when ALLOW_ANONYMOUS_API lets a signed-out caller through (local dev).
  if (!input.userId) return { kind: 'unmetered', why: 'anonymous', ...charge };
  // Fail closed: paid AI work is never given away because the ledger is unreachable.
  if (!input.billingConfigured) return { kind: 'unconfigured', ...charge };
  return { kind: 'charge', ...charge };
};

export const isEnvFlagOn = (value: string | undefined): boolean =>
  value === '1' || String(value || '').toLowerCase() === 'true';
