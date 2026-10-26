// Tiny static server for dist/ with SPA fallback. It stands in for the Stage 2 Worker's
// static-assets binding: every unknown GET that looks like a page gets the generic
// shell; /api/* is a JSON 404 because Stage 1 has no backend (it never returns HTML).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist');
const port = Number(process.argv[2] || process.env.PORT || 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

const fileExists = async (p) => { try { return (await stat(p)).isFile(); } catch { return false; } };

createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const headers = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
  const send = (status, type, body, extra = {}) => { res.writeHead(status, { ...headers, 'Content-Type': type, ...extra }); res.end(body); };

  if (url.pathname.startsWith('/api/')) return send(404, 'application/json', JSON.stringify({ error: 'not_found', note: 'Stage 1 has no API.' }), { 'Cache-Control': 'no-store' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'Method not allowed');

  let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (rel.includes('..')) return send(400, 'text/plain', 'Bad request');
  let file = join(root, rel);
  let spa = false;
  if (!(await fileExists(file))) {
    if (extname(rel)) return send(404, 'text/plain', 'Not found');
    file = join(root, 'index.html');
    spa = true;
  }
  const ext = extname(file);
  const cache = file.includes(`${join(root, 'assets')}`) ? 'public, max-age=31536000, immutable'
    : (spa || ext === '.html' || file.endsWith('sw.js') || ext === '.webmanifest') ? 'no-cache' : 'public, max-age=3600';
  send(200, TYPES[ext] || 'application/octet-stream', req.method === 'HEAD' ? undefined : await readFile(file), { 'Cache-Control': cache });
}).listen(port, '127.0.0.1', () => console.log(`Z Heart J preview on http://127.0.0.1:${port}`));
