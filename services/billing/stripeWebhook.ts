import { getStripe } from './stripeClient';
import { findTokenPack, formatTokens } from './pricing';
import { creditTokens } from './tokenLedger';

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

// Tokens are credited here (not on the success redirect), keyed on the Stripe event id so retries can't double-credit.
export const handleStripeWebhook = async (
  rawBody: Buffer,
  signature: string | string[] | undefined,
  deps: { credit?: typeof creditTokens; constructEvent?: (body: Buffer, sig: string, secret: string) => any } = {},
): Promise<WebhookResult> => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET || '';
  if (!secret) return { status: 503, body: { error: 'STRIPE_WEBHOOK_SECRET is not configured.' } };
  const sig = Array.isArray(signature) ? signature[0] : signature;
  if (!sig) return { status: 400, body: { error: 'Missing Stripe-Signature header.' } };

  let event: any;
  try {
    const construct = deps.constructEvent || ((body, s, sec) => getStripe().webhooks.constructEvent(body, s, sec));
    event = construct(rawBody, sig, secret);
  } catch (err: any) {
    return { status: 400, body: { error: `Webhook signature verification failed: ${err?.message || err}` } };
  }

  if (event.type !== 'checkout.session.completed') return { status: 200, body: { received: true, ignored: event.type } };
  const session = event.data?.object || {};
  if (session.payment_status !== 'paid') return { status: 200, body: { received: true, ignored: `payment_status ${session.payment_status}` } };

  const uid = session.metadata?.uid || session.client_reference_id;
  const pack = findTokenPack(session.metadata?.packId);
  if (!uid || !pack) {
    console.error('[Stripe webhook] Paid session without a usable uid/packId', { eventId: event.id, sessionId: session.id });
    return { status: 200, body: { received: true, ignored: 'missing uid or packId' } };
  }

  // Token count comes from our own pack table, never from session metadata.
  const result = await (deps.credit || creditTokens)(uid, {
    amount: pack.tokens,
    requestId: `stripe-${event.id}`,
    detail: `Purchased ${formatTokens(pack.tokens)} tokens ($${pack.priceUsd.toFixed(2)})`,
    reason: 'purchase',
  });
  return { status: 200, body: { received: true, credited: result.credited, replayed: result.replayed } };
};
