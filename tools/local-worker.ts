// Local stand-in for Cloudflare, used by the Worker tests and the local preview.
//
// It bundles the real Worker (worker/index.ts), runs it in Miniflare (the same
// workerd runtime Cloudflare uses) with a real local D1 database and the built
// assets, and plays the part of Cloudflare Access: a local RSA key signs Access-style
// tokens, and its public half is served at the exact URL the Worker fetches keys
// from. The Worker runs its production sign-in check unchanged — there is no bypass.
//
// Everything here is local-only test scaffolding: the key pair is generated fresh
// on each start and never written to disk.
import { build } from 'esbuild';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
type D1Database = Awaited<ReturnType<Miniflare['getD1Database']>>;
export const LOCAL_TEAM = 'local-preview.cloudflareaccess.com';
export const LOCAL_AUD = 'local-preview-aud';

const b64url = (b: ArrayBuffer | Uint8Array) => Buffer.from(b instanceof Uint8Array ? b : new Uint8Array(b)).toString('base64url');

export interface AccessIssuer {
  team: string;
  aud: string;
  jwks: { keys: JsonWebKey[] };
  /** A signed Access-style token. Overrides let tests forge bad ones. */
  sign(email: string, over?: { aud?: string | string[]; iss?: string; exp?: number; nbf?: number; kid?: string; noEmail?: boolean }): Promise<string>;
}

export async function accessIssuer(team = LOCAL_TEAM, aud = LOCAL_AUD): Promise<AccessIssuer> {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const kid = `local-${Date.now().toString(36)}`;
  const pub = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey;
  const jwks = { keys: [{ kty: 'RSA', n: pub.n, e: pub.e, alg: 'RS256', kid, use: 'sig' } as JsonWebKey] };
  return {
    team,
    aud,
    jwks,
    async sign(email, over = {}) {
      const now = Math.floor(Date.now() / 1000);
      const header = { alg: 'RS256', kid: over.kid ?? kid, typ: 'JWT' };
      const payload: Record<string, unknown> = {
        aud: over.aud ?? [aud],
        iss: over.iss ?? `https://${team}`,
        iat: now,
        nbf: over.nbf ?? now,
        exp: over.exp ?? now + 3600,
        sub: `local-${email}`,
        type: 'app',
        ...(over.noEmail ? {} : { email }),
      };
      const head = `${b64url(new TextEncoder().encode(JSON.stringify(header)))}.${b64url(new TextEncoder().encode(JSON.stringify(payload)))}`;
      const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(head));
      return `${head}.${b64url(sig)}`;
    },
  };
}

let bundled: string | undefined;
export async function bundleWorker(): Promise<string> {
  if (bundled) return bundled;
  const out = await build({
    entryPoints: [join(ROOT, 'worker/index.ts')],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    conditions: ['workerd', 'worker', 'browser'],
    write: false,
    logLevel: 'warning',
  });
  bundled = out.outputFiles[0]!.text;
  return bundled;
}

/** Applies migrations/*.sql in order, recording them the way wrangler does (d1_migrations). */
export async function applyMigrations(db: D1Database): Promise<string[]> {
  await db.prepare('CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)').run();
  const done = new Set((await db.prepare('SELECT name FROM d1_migrations').all<{ name: string }>()).results.map((r) => r.name));
  const files = (await readdir(join(ROOT, 'migrations'))).filter((f) => f.endsWith('.sql')).sort();
  const applied: string[] = [];
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = (await readFile(join(ROOT, 'migrations', f), 'utf8')).replace(/--.*$/gm, '');
    const statements = sql.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
    await db.batch([...statements.map((s) => db.prepare(s)), db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').bind(f)]);
    applied.push(f);
  }
  return applied;
}

export interface LocalWorker {
  mf: Miniflare;
  issuer: AccessIssuer;
  db: D1Database;
  /** Sends a request to the Worker as `email` (or with no sign-in when email is null). */
  request(path: string, init?: RequestInit & { as?: string | null; token?: string; origin?: string }): Promise<Response>;
  close(): Promise<void>;
}

export interface LocalOptions {
  /** Directory of built assets the Worker serves (default: dist/). */
  assets?: string;
  /** Persist D1 here between runs (default: in memory). */
  persist?: string;
  /** Worker vars and secrets. Unset ones get local test values; pass undefined explicitly to leave one unset. */
  bindings?: Record<string, string | undefined>;
  issuer?: AccessIssuer;
  /** The origin the browser sees (used as the request URL's origin). */
  origin?: string;
}

export const LOCAL_MEMBERS = { jeffrey: 'jeffrey@local.test', zul: 'zul@local.test' } as const;

export async function startLocalWorker(opts: LocalOptions = {}): Promise<LocalWorker> {
  const issuer = opts.issuer ?? (await accessIssuer());
  const defaults: Record<string, string> = {
    ACCESS_TEAM_DOMAIN: issuer.team,
    ACCESS_AUD: issuer.aud,
    MEMBER_EMAILS: `jeffrey:${LOCAL_MEMBERS.jeffrey},zul:${LOCAL_MEMBERS.zul}`,
    HOUSEHOLD_ID: 'zj',
    // A throwaway key for local use only, made fresh on every start (the owner's
    // production key is generated and kept by them; see README).
    PROTECTED_DATA_KEY: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64'),
  };
  const bindings: Record<string, string> = {};
  for (const [k, v] of Object.entries({ ...defaults, ...(opts.bindings ?? {}) })) if (v !== undefined) bindings[k] = v;
  if (opts.bindings && 'PROTECTED_DATA_KEY' in opts.bindings && opts.bindings.PROTECTED_DATA_KEY === undefined) delete bindings.PROTECTED_DATA_KEY;

  const certsUrl = `https://${issuer.team}/cdn-cgi/access/certs`;
  // Miniflare 5 takes a per-worker options shape; its converter accepts the classic single-worker form.
  const mf = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: await bundleWorker(),
    compatibilityDate: '2026-10-01',
    bindings,
    d1Databases: { DB: 'z-heart-j-local' },
    ...(opts.persist ? { resourcePersistencePath: opts.persist } : {}),
    assets: {
      directory: opts.assets ?? join(ROOT, 'dist'),
      binding: 'ASSETS',
      run_worker_first: true,
      routerConfig: { has_user_worker: true, invoke_user_worker_ahead_of_assets: true },
      assetConfig: { not_found_handling: 'single-page-application' },
    },
    unsafeTriggerHandlers: true,
    // The Worker's only outbound call is for Access's public keys; anything else fails.
    outboundService: (req: Request) => {
      if (req.url === certsUrl) return new Response(JSON.stringify(issuer.jwks), { headers: { 'content-type': 'application/json' } });
      return new Response('Blocked by the local harness', { status: 502 });
    },
  } as Parameters<typeof convertV4MiniflareOptions>[0]));
  const db = await mf.getD1Database('DB');
  await applyMigrations(db);
  const origin = opts.origin ?? 'http://127.0.0.1:8788';

  return {
    mf,
    issuer,
    db,
    async request(path, init = {}) {
      const { as, token, origin: o, ...rest } = init;
      const headers = new Headers(rest.headers);
      const email = as === undefined ? LOCAL_MEMBERS.jeffrey : as;
      if (token) headers.set('cf-access-jwt-assertion', token);
      else if (email) headers.set('cf-access-jwt-assertion', await issuer.sign(email));
      if (rest.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
      if (rest.method && rest.method !== 'GET' && !headers.has('origin')) headers.set('origin', o ?? origin);
      const res = (await mf.dispatchFetch(`${origin}${path}`, { ...rest, headers } as never)) as unknown as Response;
      // Read the body here so no response stream is left open in the runtime.
      const body = res.status === 304 ? null : await res.arrayBuffer();
      return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
    },
    close: () => mf.dispose(),
  };
}
