/* Offline cache for Lift. App shell is precached; exercise photos are cached
   on first view. Stamped with a new VERSION on every publish. */
const VERSION = 'v-d60b65eb8d';
const SHELL = ['./', './index.html', './exercises.js', './engine.js', './fbconfig.js', './manifest.webmanifest', './icon-192.png', './icon-180.png'];

self.addEventListener('install', function (e) {
  e.waitUntil((async function () {
    const c = await caches.open(VERSION);
    // cache: 'reload' skips the browser's HTTP cache, so a new version never precaches old files
    await Promise.all(SHELL.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.map(function (k) { return k === VERSION ? null : caches.delete(k); }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  const font = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!same && !font) return;
  if (same && url.searchParams.has('fresh')) { e.respondWith(fetch(req.url, { cache: 'no-store' })); return; }   // explicit "get the live file"

  e.respondWith((async function () {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: same });
    const net = fetch(same && req.mode !== 'navigate' ? new Request(req.url, { cache: 'no-cache' }) : req).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone()).catch(function () {});
      return res;
    }).catch(function () { return null; });
    if (hit) { net; return hit; }
    const fresh = await net;
    if (fresh) return fresh;
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html', { ignoreSearch: true });
      if (shell) return shell;
    }
    return new Response('Offline, and this page has not been saved on this device yet.',
      { status: 503, headers: { 'Content-Type': 'text/plain' } });
  })());
});
