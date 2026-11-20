/**
 * Web Push, by hand with WebCrypto (no libraries): VAPID (RFC 8292) to say who is
 * sending, and the aes128gcm content encoding (RFC 8291 / RFC 8188) so only the
 * receiving phone can read the note. The notification service (Apple, Google,
 * Mozilla) sees an encrypted blob and where to deliver it, nothing more.
 *
 * Keys: VAPID_PUBLIC_KEY (base64url, the 65-byte uncompressed P-256 point) and
 * VAPID_PRIVATE_KEY (base64url, its 32-byte private number), both Worker secrets set
 * by the owner. This code never generates, stores or logs them.
 */

const enc = new TextEncoder();

export const b64urlEncode = (b: Uint8Array): string => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export const b64urlDecode = (s: string): Uint8Array => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
};

const buf = (b: Uint8Array) => b as unknown as BufferSource;

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', buf(ikm), 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(info) }, key, bytes * 8));
}

export class PushKeyError extends Error {}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/** Checks the pair's shape; the phone itself refuses a public key that isn't a P-256 point. */
export function vapidFrom(env: { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string }): VapidKeys | null {
  const pub = (env.VAPID_PUBLIC_KEY ?? '').trim();
  const priv = (env.VAPID_PRIVATE_KEY ?? '').trim();
  if (!pub || !priv) return null;
  try {
    const p = b64urlDecode(pub);
    const d = b64urlDecode(priv);
    if (p.length !== 65 || p[0] !== 4 || d.length !== 32) return null;
  } catch {
    return null;
  }
  return { publicKey: pub, privateKey: priv };
}

let signer: { pub: string; key: CryptoKey } | null = null;

async function signingKey(v: VapidKeys): Promise<CryptoKey> {
  if (signer?.pub === v.publicKey + v.privateKey) return signer.key;
  const p = b64urlDecode(v.publicKey);
  const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', d: v.privateKey, x: b64urlEncode(p.slice(1, 33)), y: b64urlEncode(p.slice(33, 65)), ext: false };
  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  } catch {
    throw new PushKeyError('The notification keys don’t make a pair.');
  }
  signer = { pub: v.publicKey + v.privateKey, key };
  return key;
}

/** `Authorization: vapid t=<JWT>, k=<public key>` for one push service origin. */
export async function vapidHeader(endpoint: string, v: VapidKeys, subject: string, now = Date.now()): Promise<string> {
  const aud = new URL(endpoint).origin;
  const head = b64urlEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64urlEncode(enc.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await signingKey(v), buf(enc.encode(`${head}.${body}`))));
  return `vapid t=${head}.${body}.${b64urlEncode(sig)}, k=${v.publicKey}`;
}

/** Encrypts one message to a phone's keys (aes128gcm, a single record). */
export async function encryptPayload(plain: Uint8Array, p256dh: string, auth: string): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(p256dh);
  const authSecret = b64urlDecode(auth);
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('bad subscription keys');
  const uaKey = await crypto.subtle.importKey('raw', buf(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const local = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', local.publicKey)) as ArrayBuffer);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey } as unknown as Parameters<typeof crypto.subtle.deriveBits>[0], local.privateKey, 256));
  const ikm = await hkdf(authSecret, ecdh, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', buf(cek), 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(nonce) }, key, buf(concat(plain, new Uint8Array([2])))));
  const rs = new Uint8Array([0, 0, 0x10, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, sealed);
}

export interface Subscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Sends one push. 'gone' means the phone has turned notifications off (or the app was removed). */
export async function sendPush(sub: Subscription, message: unknown, v: VapidKeys, subject: string): Promise<'ok' | 'gone' | 'failed'> {
  try {
    const body = await encryptPayload(enc.encode(JSON.stringify(message)), sub.p256dh, sub.auth);
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        authorization: await vapidHeader(sub.endpoint, v, subject),
        'content-encoding': 'aes128gcm',
        'content-type': 'application/octet-stream',
        ttl: String(24 * 3600),
        urgency: 'high',
      },
      body: buf(body),
    });
    if (res.status === 404 || res.status === 410) return 'gone';
    return res.ok ? 'ok' : 'failed';
  } catch (e) {
    if (e instanceof PushKeyError) throw e;
    return 'failed';
  }
}

// The notification services phones actually use; a subscription naming anything else is refused.
const PUSH_HOSTS = [/^web\.push\.apple\.com$/, /(^|\.)push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];

export function allowedEndpoint(endpoint: string, extraHosts = ''): boolean {
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (endpoint.length > 1000) return false;
  const extra = extraHosts.split(',').map((h) => h.trim()).filter(Boolean);
  // Extra hosts exist only for the local tests (a stand-in push service on this machine).
  if (extra.includes(u.host)) return u.protocol === 'https:' || u.protocol === 'http:';
  return u.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(u.hostname));
}
