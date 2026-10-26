/* Z Heart J service worker — app shell only.
 *
 * Offline support is deliberately small: a generic shell plus static assets so the
 * app can start and say "Connect to view or update your shared information."
 *
 * It NEVER caches: API responses, household data, credentials, search results,
 * exports, personalised HTML, or anything from authentication flows. Those requests
 * are not intercepted at all — they go straight to the network.
 */
const CACHE = 'zhj-shell-v1';
const PREFIX = 'zhj-';

// An explicit allowlist of static paths this worker may cache.
const PRECACHE = ['/offline.html', '/offline.css', '/manifest.webmanifest', '/favicon.svg', '/wordmark.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];
const STATIC_PREFIXES = ['/assets/', '/icons/'];
const SHELL_KEY = '/index.html';

// Never touched by this worker (login/logout flows and every data route).
const NEVER = [/^\/api(\/|$)/, /^\/cdn-cgi\//, /^\/login/, /^\/logout/, /^\/auth/, /^\/export/];

const cacheable = (res) => res && res.ok && res.type === 'basic' && !res.redirected;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE);
      // Cache the generic shell and the hashed assets it references, so a cold start
      // works offline after the first visit. The shell embeds no household data.
      try {
        const res = await fetch('/', { cache: 'reload', credentials: 'same-origin' });
        const type = res.headers.get('content-type') || '';
        if (cacheable(res) && type.includes('text/html')) {
          const html = await res.clone().text();
          await cache.put(SHELL_KEY, res);
          const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
          await Promise.all(assets.map((a) => cache.add(a).catch(() => undefined)));
        }
      } catch {
        /* offline during install: the shell is cached on a later visit */
      }
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  // Used by sign-out: remove every cache this app owns.
  if (event.data === 'CLEAR_CACHES') {
    event.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith(PREFIX)).map((k) => caches.delete(k)))));
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER.some((re) => re.test(url.pathname))) return; // network, untouched

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match(SHELL_KEY)) || (await cache.match('/offline.html')) || Response.error();
      }),
    );
    return;
  }

  if (STATIC_PREFIXES.some((p) => url.pathname.startsWith(p)) || PRECACHE.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (cacheable(res)) cache.put(req, res.clone());
        return res;
      })(),
    );
  }
});
