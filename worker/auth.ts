import { MEMBER_IDS, type MemberId } from '../src/data/types.ts';
import type { Env } from './env.ts';

/**
 * Identity comes only from the Cloudflare Access token that Access adds to every
 * request it lets through (Cf-Access-Jwt-Assertion). The Worker checks its RS256
 * signature against the team's published keys, its audience, issuer and expiry,
 * then maps the email to one of the two members. Anything the browser says about
 * who it is (headers, cookies, bodies) is ignored. There is no bypass: the local
 * preview signs real tokens with a local key and serves that key the same way.
 */

export class AuthError extends Error {
  constructor(
    readonly status: 401 | 403 | 503,
    readonly code: 'unauthenticated' | 'not_a_member' | 'not_configured',
    message: string,
  ) {
    super(message);
  }
}

const TEAM_RE = /^[a-z0-9][a-z0-9-]{0,62}\.cloudflareaccess\.com$/;
const LEEWAY_S = 60;
const KEYS_TTL_MS = 60 * 60 * 1000;
const REFETCH_MIN_MS = 5 * 60 * 1000;

interface KeySet {
  keys: Map<string, CryptoKey>;
  fetchedAt: number;
}
const keyCache = new Map<string, KeySet>();

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const b64urlJson = (s: string): Record<string, unknown> => JSON.parse(dec.decode(b64urlBytes(s))) as Record<string, unknown>;

export function memberMap(env: Env): Map<string, MemberId> {
  const raw = (env.MEMBER_EMAILS ?? '').trim();
  if (!raw) throw new AuthError(503, 'not_configured', 'Server setup incomplete: MEMBER_EMAILS is not set.');
  const map = new Map<string, MemberId>();
  for (const part of raw.split(',')) {
    const m = /^\s*([a-z]+)\s*[:=]\s*(\S+@\S+)\s*$/i.exec(part);
    if (!m) throw new AuthError(503, 'not_configured', 'Server setup incomplete: MEMBER_EMAILS must look like "jeffrey:<email>,zul:<email>".');
    const member = m[1]!.toLowerCase();
    if (!(MEMBER_IDS as string[]).includes(member)) throw new AuthError(503, 'not_configured', 'Server setup incomplete: MEMBER_EMAILS names an unknown member.');
    map.set(m[2]!.toLowerCase(), member as MemberId);
  }
  const members = new Set(map.values());
  if (map.size !== 2 || members.size !== 2) throw new AuthError(503, 'not_configured', 'Server setup incomplete: MEMBER_EMAILS needs one email for each of the two members.');
  return map;
}

function settings(env: Env): { team: string; aud: string } {
  const team = (env.ACCESS_TEAM_DOMAIN ?? '').trim().toLowerCase();
  const aud = (env.ACCESS_AUD ?? '').trim();
  if (!team) throw new AuthError(503, 'not_configured', 'Server setup incomplete: ACCESS_TEAM_DOMAIN is not set.');
  // Only Cloudflare's own Access hosts, so a typo can never point key lookups elsewhere.
  if (!TEAM_RE.test(team)) throw new AuthError(503, 'not_configured', 'Server setup incomplete: ACCESS_TEAM_DOMAIN must be <team>.cloudflareaccess.com.');
  if (!aud) throw new AuthError(503, 'not_configured', 'Server setup incomplete: ACCESS_AUD is not set.');
  return { team, aud };
}

async function loadKeys(team: string): Promise<KeySet> {
  const res = await fetch(`https://${team}/cdn-cgi/access/certs`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new AuthError(503, 'not_configured', 'Couldn’t load the sign-in keys from Cloudflare Access.');
  const body = (await res.json()) as { keys?: Array<JsonWebKey & { kid?: string; alg?: string }> };
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (!jwk.kid || jwk.kty !== 'RSA') continue;
    try {
      keys.set(jwk.kid, await crypto.subtle.importKey('jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']));
    } catch {
      /* skip a key this runtime can't import */
    }
  }
  const set = { keys, fetchedAt: Date.now() };
  keyCache.set(team, set);
  return set;
}

async function keyFor(team: string, kid: string): Promise<CryptoKey | undefined> {
  let set = keyCache.get(team);
  if (!set || Date.now() - set.fetchedAt > KEYS_TTL_MS) set = await loadKeys(team);
  let key = set.keys.get(kid);
  // Access rotates keys; an unknown kid triggers one refresh (rate-limited).
  if (!key && Date.now() - set.fetchedAt > REFETCH_MIN_MS) key = (await loadKeys(team)).keys.get(kid);
  return key;
}

/** Verifies the Access token and returns its (lower-cased) email. */
export async function verifyAccessToken(token: string, env: Env, now = Date.now()): Promise<string> {
  const { team, aud } = settings(env);
  const bad = () => new AuthError(401, 'unauthenticated', 'Sign-in is missing or has expired.');
  const parts = token.split('.');
  if (parts.length !== 3) throw bad();
  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  try {
    header = b64urlJson(parts[0]!);
    payload = b64urlJson(parts[1]!);
  } catch {
    throw bad();
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw bad();
  const key = await keyFor(team, header.kid);
  if (!key) throw bad();
  let valid = false;
  try {
    valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]!), enc.encode(`${parts[0]}.${parts[1]}`));
  } catch {
    valid = false;
  }
  if (!valid) throw bad();

  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) throw bad();
  if (payload.iss !== `https://${team}`) throw bad();
  const t = now / 1000;
  if (typeof payload.exp !== 'number' || payload.exp + LEEWAY_S < t) throw bad();
  if (typeof payload.nbf === 'number' && payload.nbf - LEEWAY_S > t) throw bad();
  // Service tokens carry no email and are not people: refused.
  if (typeof payload.email !== 'string' || !payload.email.includes('@')) throw bad();
  return payload.email.toLowerCase();
}

/** The member making this request, from the verified Access token only. */
export async function identify(req: Request, env: Env): Promise<MemberId> {
  // Configuration is checked first so a half-set-up deployment says so plainly.
  settings(env);
  const members = memberMap(env);
  const token = req.headers.get('cf-access-jwt-assertion');
  if (!token) throw new AuthError(401, 'unauthenticated', 'Sign-in is missing or has expired.');
  const email = await verifyAccessToken(token, env);
  const member = members.get(email);
  if (!member) throw new AuthError(403, 'not_a_member', 'This account isn’t one of the two members of this household.');
  return member;
}

/** Test hook: forget cached signing keys. */
export function clearKeyCache() {
  keyCache.clear();
}
