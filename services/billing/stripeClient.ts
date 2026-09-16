import Stripe from 'stripe';
import { findTokenPack, formatTokens } from './pricing';

let cachedStripe: { key: string; client: Stripe } | null = null;

export const isStripeConfigured = (): boolean => !!process.env.STRIPE_SECRET_KEY;

// apiVersion is intentionally not pinned: the SDK version controls the API shape.
export const getStripe = (): Stripe => {
  const key = process.env.STRIPE_SECRET_KEY || '';
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured.');
  if (!cachedStripe || cachedStripe.key !== key) cachedStripe = { key, client: new Stripe(key) };
  return cachedStripe.client;
};

// Only trusted configuration decides where the buyer is sent after paying (never the request's Origin header).
export const getAppBaseUrl = (): string => {
  const configured = (process.env.APP_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  throw new Error('APP_BASE_URL is not configured.');
};

export const createTokenCheckoutSession = async (input: { uid: string; packId: string; email?: string | null }) => {
  const pack = findTokenPack(input.packId);
  if (!pack) throw Object.assign(new Error('Unknown token pack.'), { statusCode: 400 });
  const baseUrl = getAppBaseUrl();
  const session = await getStripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: pack.priceCents,
        product_data: { name: `${formatTokens(pack.tokens)} ArchAI tokens` },
      },
    }],
    client_reference_id: input.uid,
    customer_email: input.email || undefined,
    metadata: { uid: input.uid, packId: pack.id, tokens: String(pack.tokens) },
    success_url: `${baseUrl}/?checkout=success&pack=${encodeURIComponent(pack.id)}`,
    cancel_url: `${baseUrl}/?checkout=cancelled`,
  });
  return { url: session.url, sessionId: session.id };
};
