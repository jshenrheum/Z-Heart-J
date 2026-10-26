import type { Env } from './env.ts';

/**
 * AES-256-GCM for protected values. Each value gets 12 fresh random bytes of IV, and
 * the ciphertext is bound to its place (household, record, slot) as additional
 * authenticated data, so a stored value can't be copied onto another record.
 *
 * The key is the Worker secret PROTECTED_DATA_KEY (base64 of 32 bytes). It is never
 * generated, stored or logged by this code. `key_id` is a fingerprint (first 8 bytes
 * of its SHA-256), stored with each value so a wrong key is reported plainly instead
 * of as a decryption failure.
 */

export class KeyError extends Error {
  constructor(
    readonly code: 'not_configured' | 'key_mismatch',
    message: string,
  ) {
    super(message);
  }
}

const enc = new TextEncoder();
const dec = new TextDecoder();
let cached: { raw: string; key: CryptoKey; id: string } | null = null;

const toB64 = (b: Uint8Array) => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
};
const fromB64 = (s: string) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function dataKey(env: Env): Promise<{ key: CryptoKey; id: string }> {
  const raw = (env.PROTECTED_DATA_KEY ?? '').trim();
  if (cached && cached.raw === raw) return cached;
  if (!raw) throw new KeyError('not_configured', 'Server setup incomplete: PROTECTED_DATA_KEY is not set, so protected values can’t be saved or shown.');
  let bytes: Uint8Array;
  try {
    bytes = fromB64(raw);
  } catch {
    throw new KeyError('not_configured', 'Server setup incomplete: PROTECTED_DATA_KEY is not valid base64.');
  }
  if (bytes.length !== 32) throw new KeyError('not_configured', 'Server setup incomplete: PROTECTED_DATA_KEY must be 32 bytes (44 base64 characters).');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const id = Array.from(digest.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
  const key = await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  cached = { raw, key, id };
  return cached;
}

const aad = (household: string, recordId: string, slot: string) => enc.encode(`zhj:v1|${household}|${recordId}|${slot}`);

export async function encryptValue(env: Env, household: string, recordId: string, slot: string, value: string) {
  const { key, id } = await dataKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(household, recordId, slot) }, key, enc.encode(value)));
  return { keyId: id, iv: toB64(iv), ciphertext: toB64(ct) };
}

export async function decryptValue(env: Env, household: string, recordId: string, slot: string, stored: { keyId: string; iv: string; ciphertext: string }): Promise<string> {
  const { key, id } = await dataKey(env);
  if (stored.keyId !== id) throw new KeyError('key_mismatch', 'This value was saved with a different encryption key than the one the server has now.');
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(stored.iv), additionalData: aad(household, recordId, slot) }, key, fromB64(stored.ciphertext));
  return dec.decode(pt);
}

/** Throws KeyError if the key is missing or malformed (used before accepting a value). */
export async function checkKey(env: Env): Promise<void> {
  await dataKey(env);
}
