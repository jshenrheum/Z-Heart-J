// Local preview of the signed-in app: the real Worker (in workerd, via Miniflare)
// serving dist/ and /api, with a local D1 database, behind a small stand-in for
// Cloudflare Access.
//
//   npm run build && npm run preview:local            → http://127.0.0.1:8788
//   npm run preview:local -- --port 9000
//
// The stand-in plays Access's part only: a sign-in page where you pick Jeffrey or
// Zul (local placeholder emails), a signed token added to every request (checked by
// the Worker's production code, unchanged), a redirect to sign-in when there's no
// session, and /cdn-cgi/access/logout. Everything — database and the throwaway
// encryption key — lives in memory and is gone when you stop it.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { LOCAL_MEMBERS, ROOT, startLocalWorker } from '../tools/local-worker.ts';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const port = Number(arg('port') ?? process.env.PORT ?? 8788);
const origin = `http://127.0.0.1:${port}`;
const COOKIE = 'zhj_local_member';

if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
  console.error('No production build found. Run `npm run build` first.');
  process.exit(1);
}

const worker = await startLocalWorker({ origin });

const memberOf = (req: IncomingMessage): keyof typeof LOCAL_MEMBERS | undefined => {
  const m = /(?:^|;\s*)zhj_local_member=(jeffrey|zul)(?:;|$)/.exec(req.headers.cookie ?? '');
  return m?.[1] as keyof typeof LOCAL_MEMBERS | undefined;
};

const SIGN_IN = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sign in — local preview</title></head>
<body><main><h1>Sign in (local preview)</h1>
<p>This page stands in for Cloudflare Access on your computer. Pick who you are; the app then receives a signed sign-in token, exactly as it will from Access.</p>
<form method="post" action="/__local/sign-in"><button name="member" value="jeffrey">Sign in as Jeffrey</button> <button name="member" value="zul">Sign in as Zul</button></form>
<p>Local data lives in memory and is gone when the preview stops.</p></main></body></html>`;

async function body(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', origin);

  if (url.pathname === '/__local/sign-in') {
    if (req.method === 'POST') {
      const member = new URLSearchParams((await body(req)).toString()).get('member');
      if (member !== 'jeffrey' && member !== 'zul') return void res.writeHead(400).end('Pick a member.');
      res.writeHead(303, { location: '/', 'set-cookie': `${COOKIE}=${member}; Path=/; HttpOnly; SameSite=Lax` });
      return void res.end();
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    return void res.end(SIGN_IN);
  }
  if (url.pathname === '/cdn-cgi/access/logout') {
    res.writeHead(303, { location: '/__local/sign-in', 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
    return void res.end();
  }

  const member = memberOf(req);
  if (!member) {
    // Like Access: no session, so off to the sign-in page (fetches see a redirect too).
    res.writeHead(302, { location: '/__local/sign-in', 'cache-control': 'no-store' });
    return void res.end();
  }

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined || k === 'host' || k === 'cookie' || k === 'connection' || k.startsWith('cf-')) continue;
    headers.set(k, Array.isArray(v) ? v.join(', ') : v);
  }
  headers.set('cf-access-jwt-assertion', await worker.issuer.sign(LOCAL_MEMBERS[member]));
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const out = await worker.mf.dispatchFetch(`${origin}${url.pathname}${url.search}`, {
    method: req.method,
    headers,
    ...(hasBody ? { body: await body(req) } : {}),
    redirect: 'manual',
  } as never);
  const outHeaders: Record<string, string> = {};
  out.headers.forEach((v: string, k: string) => {
    if (k !== 'content-length' && k !== 'content-encoding' && k !== 'transfer-encoding') outHeaders[k] = v;
  });
  const buf = out.status === 304 || req.method === 'HEAD' ? undefined : Buffer.from(await out.arrayBuffer());
  res.writeHead(out.status, outHeaders);
  res.end(buf);
}

createServer((req, res) => {
  handle(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Local preview error.');
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`Z Heart J — local preview of the signed-in app on ${origin}`);
  console.log('Sign in as Jeffrey or Zul on the local stand-in for Cloudflare Access. Data is in memory and resets when you stop this (Ctrl+C).');
});

const stop = async () => {
  await worker.close();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
