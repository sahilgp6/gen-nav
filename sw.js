/* ATPL question banks — offline service worker
 *
 * Bump CACHE_VERSION whenever you upload new HTML. The old cache is deleted on
 * activate, so a version bump is what makes a new copy reach the phone.
 *
 * Strategy: network first, cache as fallback.
 *   - online  -> fetch the live file, store a copy, serve the live one
 *   - offline -> serve the stored copy
 * This way you always get the newest version when you have a signal, and the
 * app still opens with no signal at all. It never serves a stale copy while a
 * fresh one is reachable.
 */

const CACHE_VERSION = 'atpl-v1';

// The app is a single self-contained file, so this is the whole list.
// Put a copy of this sw.js in each repo, alongside that repo's index.html.
const PRECACHE = [
  './',
  './index.html',
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // addAll fails the whole install if any single file 404s, so add them
    // individually and tolerate the ones that are not in this repo.
    await Promise.all(PRECACHE.map(async url => {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch (e) { /* file not present in this repo; skip it */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(n => n !== CACHE_VERSION).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      const hit = await cache.match(req);
      if (hit) return hit;
      // a navigation with nothing cached: fall back to the app shell
      if (req.mode === 'navigate') {
        for (const url of PRECACHE) {
          const shell = await cache.match(url);
          if (shell) return shell;
        }
      }
      return new Response(
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<body style="font:16px system-ui;padding:28px;color:#1c1814;background:#f6f4f0">' +
        '<h2>Not cached yet</h2><p>Open this app once with a signal, then it will ' +
        'work offline.</p></body>',
        { headers: { 'Content-Type': 'text/html' }, status: 503 }
      );
    }
  })());
});

// Lets the page ask which version is running.
self.addEventListener('message', event => {
  if (event.data === 'version' && event.source) {
    event.source.postMessage({ version: CACHE_VERSION });
  }
});
