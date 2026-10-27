const enc = new TextEncoder();

export function randomId(bytes = 12): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, bytes * 2);
}

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: ArrayBuffer): string {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}

async function hmac(key: Uint8Array<ArrayBuffer>, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', k, enc.encode(data));
}

/** Verify an HMAC-SHA256 signature encoded as lowercase or uppercase hex. */
export async function verifyHmacSha256Hex(secret: string, message: string, signature: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const digest = await hmac(enc.encode(secret), message);
  const expected = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return safeEqual(expected, signature.toLowerCase());
}

export async function verifyStripeSignature(secret: string, header: string | null, body: string, now = Date.now()): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(',').map((part) => part.split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts.filter(([key]) => key === 'v1').map(([, value]) => value);
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > 5 * 60) return false;
  const digest = await hmac(enc.encode(secret), `${timestamp}.${body}`);
  const expected = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return signatures.some((signature) => safeEqual(signature.toLowerCase(), expected));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/**
 * Verify a Standard Webhooks signature (used by Dodo Payments).
 * Signed content is `${id}.${timestamp}.${body}`, HMAC-SHA256 with the base64 secret after `whsec_`.
 */
export async function verifyStandardWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  now = Date.now(),
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 5 * 60) return false;
  let key: Uint8Array<ArrayBuffer>;
  try {
    const encoded = secret.startsWith('whsec_') ? secret.slice(6) : secret.startsWith('polar_whs_') ? secret.slice(10) : secret;
    key = b64ToBytes(encoded.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return false;
  }
  const expected = bytesToB64(await hmac(key, `${id}.${timestamp}.${body}`));
  return signature
    .split(' ')
    .map((s) => s.split(',')[1] ?? '')
    .some((sig) => safeEqual(sig, expected));
}

/** Polar currently signs with the literal endpoint secret bytes, including its polar_whs_ prefix. */
export async function verifyPolarWebhook(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  now = Date.now(),
): Promise<boolean> {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 5 * 60) return false;
  const expected = bytesToB64(await hmac(enc.encode(secret), `${id}.${timestamp}.${body}`));
  return signature.split(' ').map((part) => part.split(',')[1] ?? '').some((candidate) => safeEqual(candidate, expected));
}

/** Sign a value for the dashboard login cookie. */
export async function signToken(secret: string, value: string): Promise<string> {
  const sig = bytesToB64(await hmac(enc.encode(secret), value)).replace(/=+$/, '');
  return `${value}.${sig}`;
}

export async function verifyToken(secret: string, token: string | undefined): Promise<string | null> {
  if (!token) return null;
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const value = token.slice(0, i);
  const expected = await signToken(secret, value);
  return safeEqual(expected, token) ? value : null;
}

export function passwordsMatch(a: string, b: string): boolean {
  return safeEqual(a, b);
}
