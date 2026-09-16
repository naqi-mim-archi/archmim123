import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleStripeWebhook } from './billing/stripeWebhook';

// Separate Vercel function: Stripe signs the raw bytes (body parser off) and has no Firebase token for the auth gate.
// Source file: edit this, never the bundled api/stripe-webhook.js.

export const config = { api: { bodyParser: false } };

export default async function stripeWebhook(req: IncomingMessage, res: ServerResponse) {
  const send = (status: number, body: Record<string, unknown>) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'POST') {
    send(405, { error: 'Method Not Allowed' });
    return;
  }
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const result = await handleStripeWebhook(Buffer.concat(chunks), req.headers['stripe-signature']);
    send(result.status, result.body);
  } catch (error) {
    console.error('[Stripe webhook] Handler error:', error);
    send(500, { error: error instanceof Error ? error.message : String(error) });
  }
}
