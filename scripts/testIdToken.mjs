import crypto from 'node:crypto';
import { importTs, check, finish } from './bundleForTest.mjs';

// Mints real RS256 tokens with a throwaway key + self-signed certificate and runs them through the
// node:crypto verifier, including forged variants. No network: certificates are injected.

const { verifyFirebaseIdToken, setCertFetcherForTests } = await importTs('services/firebase/verifyIdToken.ts');

// --- minimal DER encoder for a self-signed X.509 certificate -------------------------------------
const der = (tag, content) => {
  const len = content.length;
  const lenBytes = len < 0x80 ? Buffer.from([len]) : (() => {
    const hex = len.toString(16).padStart(len.toString(16).length + (len.toString(16).length % 2), '0');
    const bytes = Buffer.from(hex, 'hex');
    return Buffer.concat([Buffer.from([0x80 | bytes.length]), bytes]);
  })();
  return Buffer.concat([Buffer.from([tag]), lenBytes, content]);
};
const seq = (...items) => der(0x30, Buffer.concat(items));
const set = (...items) => der(0x31, Buffer.concat(items));
const int = (n) => der(0x02, Buffer.from([n]));
const oid = (dotted) => {
  const parts = dotted.split('.').map(Number);
  const bytes = [parts[0] * 40 + parts[1]];
  for (const part of parts.slice(2)) {
    const stack = [part & 0x7f];
    let value = part >> 7;
    while (value > 0) { stack.unshift((value & 0x7f) | 0x80); value >>= 7; }
    bytes.push(...stack);
  }
  return der(0x06, Buffer.from(bytes));
};
const utf8 = (s) => der(0x0c, Buffer.from(s, 'utf8'));
const utcTime = (date) => der(0x17, Buffer.from(date.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'));
const nul = Buffer.from([0x05, 0x00]);

const makeCert = (privateKey, publicKey, cn) => {
  const algId = seq(oid('1.2.840.113549.1.1.11'), nul);
  const name = seq(set(seq(oid('2.5.4.3'), utf8(cn))));
  const now = Date.now();
  const tbs = seq(
    der(0xa0, int(2)),
    int(1),
    algId,
    name,
    seq(utcTime(new Date(now - 86400000)), utcTime(new Date(now + 86400000))),
    name,
    publicKey.export({ type: 'spki', format: 'der' }),
  );
  const signature = crypto.sign('sha256', tbs, privateKey);
  const certDer = seq(tbs, algId, der(0x03, Buffer.concat([Buffer.from([0]), signature])));
  return `-----BEGIN CERTIFICATE-----\n${certDer.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
};

// --- token helpers --------------------------------------------------------------------------------
const b64url = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
const PROJECT = 'archai-test-project';
const now = () => Math.floor(Date.now() / 1000);

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const attacker = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const certs = { 'kid-1': makeCert(privateKey, publicKey, 'securetoken') };

const mint = (payloadOverrides = {}, headerOverrides = {}, key = privateKey) => {
  const header = { alg: 'RS256', kid: 'kid-1', typ: 'JWT', ...headerOverrides };
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT}`,
    aud: PROJECT,
    sub: 'user-123',
    email: 'someone@example.com',
    email_verified: true,
    iat: now() - 10,
    exp: now() + 3600,
    ...payloadOverrides,
  };
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const signature = header.alg === 'none' ? '' : crypto.sign('sha256', Buffer.from(signingInput), key).toString('base64url');
  return `${signingInput}.${signature}`;
};

let fetchCount = 0;
setCertFetcherForTests(async () => { fetchCount += 1; return { certs, maxAgeSeconds: 3600 }; });

const rejects = async (token, label) => {
  try {
    await verifyFirebaseIdToken(token, PROJECT);
    check(false, label);
  } catch {
    check(true, label);
  }
};

// Valid token
const verified = await verifyFirebaseIdToken(mint(), PROJECT);
check(verified.uid === 'user-123' && verified.email === 'someone@example.com' && verified.emailVerified === true, 'Valid token verifies and returns uid/email/emailVerified');

// Forgeries
const valid = mint();
const [h, p, s] = valid.split('.');
const swappedPayload = b64url({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), sub: 'someone-else' });
await rejects(`${h}.${swappedPayload}.${s}`, 'Rejects swapped subject (signature no longer matches)');
await rejects(mint({}, { alg: 'none' }), 'Rejects alg=none');
await rejects(mint({}, { alg: 'HS256' }), 'Rejects non-RS256 algorithm');
await rejects(mint({}, {}, attacker.privateKey), 'Rejects token signed with a different key');
await rejects(mint({ aud: 'other-project' }), 'Rejects wrong audience (other project)');
await rejects(mint({ iss: 'https://securetoken.google.com/other-project' }), 'Rejects wrong issuer');
await rejects(mint({ exp: now() - 3600 }), 'Rejects expired token');
await rejects(mint({ iat: now() + 3600 }), 'Rejects token issued in the future');
await rejects(mint({ sub: '' }), 'Rejects empty subject');
await rejects('not-a-jwt', 'Rejects malformed token');
await rejects('a.b.c', 'Rejects garbage segments');
await rejects(mint({}, { kid: undefined }), 'Rejects token without kid');

// Leeway: expired 30s ago still accepted (60s leeway)
const leeway = await verifyFirebaseIdToken(mint({ exp: now() - 30 }), PROJECT).then(() => true, () => false);
check(leeway, 'Accepts token within 60s clock leeway');

// Unknown kid triggers exactly one refetch (key rotation)
const before = fetchCount;
await rejects(mint({}, { kid: 'kid-unknown' }), 'Rejects unknown kid');
check(fetchCount === before + 1, 'Unknown kid refetches certificates once');

finish();
