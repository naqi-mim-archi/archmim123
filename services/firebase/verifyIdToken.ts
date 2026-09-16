import crypto from 'node:crypto';

// Verifies Firebase ID tokens with node:crypto only.
// Do not switch to firebase-admin's verifyIdToken: on Vercel it loads jose@6 (ESM) via require() in jwks-rsa and crashes.

export const GOOGLE_SECURETOKEN_CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

const CLOCK_LEEWAY_SECONDS = 60;

export interface VerifiedIdToken {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

export class IdTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdTokenError';
  }
}

export type CertFetcher = () => Promise<{ certs: Record<string, string>; maxAgeSeconds: number }>;

const defaultCertFetcher: CertFetcher = async () => {
  const res = await fetch(GOOGLE_SECURETOKEN_CERTS_URL);
  if (!res.ok) throw new Error(`Could not fetch Google signing certificates (HTTP ${res.status}).`);
  const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') || '');
  return { certs: await res.json() as Record<string, string>, maxAgeSeconds: maxAge ? Number(maxAge[1]) : 3600 };
};

let certFetcher: CertFetcher = defaultCertFetcher;
let certCache: { certs: Record<string, string>; expiresAt: number } | null = null;

// Test hook: inject certificates instead of calling Google.
export const setCertFetcherForTests = (fetcher: CertFetcher | null) => {
  certFetcher = fetcher || defaultCertFetcher;
  certCache = null;
};

const getCerts = async (forceRefresh: boolean): Promise<Record<string, string>> => {
  if (!forceRefresh && certCache && certCache.expiresAt > Date.now()) return certCache.certs;
  const { certs, maxAgeSeconds } = await certFetcher();
  certCache = { certs, expiresAt: Date.now() + maxAgeSeconds * 1000 };
  return certs;
};

const decodeSegment = (segment: string): any => {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  } catch {
    throw new IdTokenError('Malformed token.');
  }
};

export const verifyFirebaseIdToken = async (token: string, projectId: string): Promise<VerifiedIdToken> => {
  if (!projectId) throw new IdTokenError('Firebase project id is not configured.');
  const parts = String(token || '').split('.');
  if (parts.length !== 3 || parts.some(part => !part)) throw new IdTokenError('Malformed token.');
  const [headerSegment, payloadSegment, signatureSegment] = parts;

  const header = decodeSegment(headerSegment);
  if (header?.alg !== 'RS256') throw new IdTokenError('Unsupported token algorithm.');
  if (typeof header.kid !== 'string' || !header.kid) throw new IdTokenError('Token has no key id.');

  let certs = await getCerts(false);
  if (!certs[header.kid]) certs = await getCerts(true); // key rotation
  const cert = certs[header.kid];
  if (!cert) throw new IdTokenError('Token was signed with an unknown key.');

  const verifier = crypto.createVerify('RSA-SHA256');
  verifier.update(`${headerSegment}.${payloadSegment}`);
  const publicKey = new crypto.X509Certificate(cert).publicKey;
  if (!verifier.verify(publicKey, Buffer.from(signatureSegment, 'base64url'))) {
    throw new IdTokenError('Invalid token signature.');
  }

  const payload = decodeSegment(payloadSegment);
  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== projectId) throw new IdTokenError('Token audience does not match this project.');
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new IdTokenError('Token issuer does not match this project.');
  if (typeof payload.exp !== 'number' || payload.exp + CLOCK_LEEWAY_SECONDS < now) throw new IdTokenError('Token has expired.');
  if (typeof payload.iat !== 'number' || payload.iat - CLOCK_LEEWAY_SECONDS > now) throw new IdTokenError('Token issued in the future.');
  if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 128) throw new IdTokenError('Token has no subject.');

  return {
    uid: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : null,
    emailVerified: payload.email_verified === true,
  };
};
