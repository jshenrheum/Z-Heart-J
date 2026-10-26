import { ApiError, json, routeApi } from './api.ts';
import { AuthError, identify } from './auth.ts';
import { CSP_HEADER } from './csp.ts';
import { householdIds, purgeTrash } from './db.ts';
import type { Env } from './env.ts';

/**
 * Z ♥ J Worker: serves the built app (static assets) and the same-origin /api.
 *
 * Every request — page, asset or API — is checked against Cloudflare Access first
 * (see auth.ts), and every response leaves with the security headers below. Errors
 * never echo request bodies, and nothing is logged.
 */

const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': CSP_HEADER,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'strict-transport-security': 'max-age=31536000',
};

function withHeaders(res: Response, extra: Record<string, string> = {}): Response {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries({ ...SECURITY_HEADERS, ...extra })) out.headers.set(k, v);
  return out;
}

function cacheFor(path: string, res: Response): Record<string, string> {
  if (path.startsWith('/api/')) return { 'cache-control': 'no-store' };
  if (path.startsWith('/assets/') && res.ok) return { 'cache-control': 'public, max-age=31536000, immutable' };
  // The shell, the service worker and the manifest are always revalidated.
  return { 'cache-control': 'no-cache' };
}

// Plain on purpose: its stylesheet and logo would need the same sign-in that just failed.
const PAGE = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Z Heart J — ${title}</title></head><body><main><h1>${title}</h1><p>${body}</p><p><a href="/">Try again</a></p></main></body></html>`;

function authFailure(e: AuthError, req: Request, isApi: boolean): Response {
  if (isApi || !(req.headers.get('accept') ?? '').includes('text/html')) return json(e.status, { error: e.code, message: e.message });
  const title = e.code === 'not_a_member' ? 'Not one of the two members' : e.code === 'not_configured' ? 'Not set up yet' : 'Sign in to continue';
  return new Response(PAGE(title, e.message), { status: e.status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

/** Unsafe methods must come from this app's own pages (no cross-site form posts or fetches). */
function sameOrigin(req: Request, url: URL): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  const origin = req.headers.get('origin');
  if (origin && origin !== url.origin) return false;
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin') return false;
  return true;
}

async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/');

  let me;
  try {
    me = await identify(req, env);
  } catch (e) {
    if (e instanceof AuthError) return authFailure(e, req, isApi);
    throw e;
  }

  if (!isApi) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
    return env.ASSETS.fetch(req);
  }
  if (!sameOrigin(req, url)) return json(403, { error: 'cross_site', message: 'Requests must come from the app itself.' });
  try {
    return await routeApi(req, env, url, me);
  } catch (e) {
    if (e instanceof ApiError) return json(e.status, { error: e.code, message: e.message, ...e.extra });
    // Deliberately no details: an error message could contain household data.
    return json(500, { error: 'server_error', message: 'Something went wrong on the server. Nothing was changed.' });
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const path = new URL(req.url).pathname;
    let res: Response;
    try {
      res = await handle(req, env);
    } catch {
      res = json(500, { error: 'server_error', message: 'Something went wrong on the server.' });
    }
    return withHeaders(res, cacheFor(path, res));
  },

  /** Daily: permanently remove anything that has been in the trash for more than 30 days. */
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    for (const hh of await householdIds(env.DB)) await purgeTrash(env.DB, hh);
  },
} satisfies ExportedHandler<Env>;
