/* Offline cache for Lift. App shell is precached; exercise photos are cached
   on first view. Stamped with a new VERSION on every publish. */
const VERSION = 'v-bde7dadfe2';
/* Other pages share this github.io origin (and its caches), so Lift's caches carry a lift- prefix
   and only those are ever cleaned up. */
const CACHE = 'lift-' + VERSION;
const SHELL = ['./', './index.html', './theme.js', './styles.css', './app.js', './exercises.js', './sync.js', './engine.js', './fbconfig.js', './manifest.webmanifest', './icon-192.png', './icon-180.png'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
/* Photos (exercises, thumbnails, your gym) live in their own cache that outlasts versions, so a
   publish doesn't download them again. tools/prepublish.js writes the list. */
const IMG_CACHE = 'lift-img';
const PHOTOS = ["./img/ex/Ab_Crunch_Machine/0.jpg","./img/ex/Ab_Crunch_Machine/1.jpg","./img/ex/Ab_Crunch_Machine/t.jpg","./img/ex/Arm_Circles/0.jpg","./img/ex/Arm_Circles/1.jpg","./img/ex/Arm_Circles/t.jpg","./img/ex/Bicycling_Stationary/0.jpg","./img/ex/Bicycling_Stationary/1.jpg","./img/ex/Bicycling_Stationary/t.jpg","./img/ex/Bodyweight_Squat/0.jpg","./img/ex/Bodyweight_Squat/1.jpg","./img/ex/Bodyweight_Squat/t.jpg","./img/ex/Cable_Crunch/0.jpg","./img/ex/Cable_Crunch/1.jpg","./img/ex/Cable_Crunch/t.jpg","./img/ex/Cable_Rear_Delt_Fly/0.jpg","./img/ex/Cable_Rear_Delt_Fly/1.jpg","./img/ex/Cable_Rear_Delt_Fly/t.jpg","./img/ex/Cable_Rope_Overhead_Triceps_Extension/0.jpg","./img/ex/Cable_Rope_Overhead_Triceps_Extension/1.jpg","./img/ex/Cable_Rope_Overhead_Triceps_Extension/t.jpg","./img/ex/Cable_Seated_Lateral_Raise/0.jpg","./img/ex/Cable_Seated_Lateral_Raise/1.jpg","./img/ex/Cable_Seated_Lateral_Raise/t.jpg","./img/ex/Calf_Press_On_The_Leg_Press_Machine/0.jpg","./img/ex/Calf_Press_On_The_Leg_Press_Machine/1.jpg","./img/ex/Calf_Press_On_The_Leg_Press_Machine/t.jpg","./img/ex/Cat_Stretch/0.jpg","./img/ex/Cat_Stretch/1.jpg","./img/ex/Cat_Stretch/t.jpg","./img/ex/Close-Grip_Front_Lat_Pulldown/0.jpg","./img/ex/Close-Grip_Front_Lat_Pulldown/1.jpg","./img/ex/Close-Grip_Front_Lat_Pulldown/t.jpg","./img/ex/Dumbbell_Bench_Press/0.jpg","./img/ex/Dumbbell_Bench_Press/1.jpg","./img/ex/Dumbbell_Bench_Press/t.jpg","./img/ex/Dumbbell_Bicep_Curl/0.jpg","./img/ex/Dumbbell_Bicep_Curl/1.jpg","./img/ex/Dumbbell_Bicep_Curl/t.jpg","./img/ex/Dumbbell_Incline_Row/0.jpg","./img/ex/Dumbbell_Incline_Row/1.jpg","./img/ex/Dumbbell_Incline_Row/t.jpg","./img/ex/Dumbbell_Shoulder_Press/0.jpg","./img/ex/Dumbbell_Shoulder_Press/1.jpg","./img/ex/Dumbbell_Shoulder_Press/t.jpg","./img/ex/External_Rotation/0.jpg","./img/ex/External_Rotation/1.jpg","./img/ex/External_Rotation/t.jpg","./img/ex/Face_Pull/0.jpg","./img/ex/Face_Pull/1.jpg","./img/ex/Face_Pull/t.jpg","./img/ex/Goblet_Squat/0.jpg","./img/ex/Goblet_Squat/1.jpg","./img/ex/Goblet_Squat/t.jpg","./img/ex/Hammer_Curls/0.jpg","./img/ex/Hammer_Curls/1.jpg","./img/ex/Hammer_Curls/t.jpg","./img/ex/Hyperextensions_Back_Extensions/0.jpg","./img/ex/Hyperextensions_Back_Extensions/1.jpg","./img/ex/Hyperextensions_Back_Extensions/t.jpg","./img/ex/Incline_Dumbbell_Curl/0.jpg","./img/ex/Incline_Dumbbell_Curl/1.jpg","./img/ex/Incline_Dumbbell_Curl/t.jpg","./img/ex/Incline_Dumbbell_Press/0.jpg","./img/ex/Incline_Dumbbell_Press/1.jpg","./img/ex/Incline_Dumbbell_Press/t.jpg","./img/ex/Leg_Extensions/0.jpg","./img/ex/Leg_Extensions/1.jpg","./img/ex/Leg_Extensions/t.jpg","./img/ex/Leg_Press/0.jpg","./img/ex/Leg_Press/1.jpg","./img/ex/Leg_Press/t.jpg","./img/ex/Leverage_Shoulder_Press/0.jpg","./img/ex/Leverage_Shoulder_Press/1.jpg","./img/ex/Leverage_Shoulder_Press/t.jpg","./img/ex/Machine_Bench_Press/0.jpg","./img/ex/Machine_Bench_Press/1.jpg","./img/ex/Machine_Bench_Press/t.jpg","./img/ex/One-Arm_Dumbbell_Row/0.jpg","./img/ex/One-Arm_Dumbbell_Row/1.jpg","./img/ex/One-Arm_Dumbbell_Row/t.jpg","./img/ex/Plank/0.jpg","./img/ex/Plank/1.jpg","./img/ex/Plank/t.jpg","./img/ex/Preacher_Curl/0.jpg","./img/ex/Preacher_Curl/1.jpg","./img/ex/Preacher_Curl/t.jpg","./img/ex/Reverse_Flyes/0.jpg","./img/ex/Reverse_Flyes/1.jpg","./img/ex/Reverse_Flyes/t.jpg","./img/ex/Rope_Straight-Arm_Pulldown/0.jpg","./img/ex/Rope_Straight-Arm_Pulldown/1.jpg","./img/ex/Rope_Straight-Arm_Pulldown/t.jpg","./img/ex/Rowing_Stationary/0.jpg","./img/ex/Rowing_Stationary/1.jpg","./img/ex/Rowing_Stationary/t.jpg","./img/ex/Seated_Cable_Rows/0.jpg","./img/ex/Seated_Cable_Rows/1.jpg","./img/ex/Seated_Cable_Rows/t.jpg","./img/ex/Seated_Leg_Curl/0.jpg","./img/ex/Seated_Leg_Curl/1.jpg","./img/ex/Seated_Leg_Curl/t.jpg","./img/ex/Seated_Side_Lateral_Raise/0.jpg","./img/ex/Seated_Side_Lateral_Raise/1.jpg","./img/ex/Seated_Side_Lateral_Raise/t.jpg","./img/ex/Side_Lateral_Raise/0.jpg","./img/ex/Side_Lateral_Raise/1.jpg","./img/ex/Side_Lateral_Raise/t.jpg","./img/ex/Single_Leg_Glute_Bridge/0.jpg","./img/ex/Single_Leg_Glute_Bridge/1.jpg","./img/ex/Single_Leg_Glute_Bridge/t.jpg","./img/ex/Smith_Machine_Bench_Press/0.jpg","./img/ex/Smith_Machine_Bench_Press/1.jpg","./img/ex/Smith_Machine_Bench_Press/t.jpg","./img/ex/Smith_Machine_Calf_Raise/0.jpg","./img/ex/Smith_Machine_Calf_Raise/1.jpg","./img/ex/Smith_Machine_Calf_Raise/t.jpg","./img/ex/Smith_Machine_Incline_Bench_Press/0.jpg","./img/ex/Smith_Machine_Incline_Bench_Press/1.jpg","./img/ex/Smith_Machine_Incline_Bench_Press/t.jpg","./img/ex/Smith_Machine_Overhead_Shoulder_Press/0.jpg","./img/ex/Smith_Machine_Overhead_Shoulder_Press/1.jpg","./img/ex/Smith_Machine_Overhead_Shoulder_Press/t.jpg","./img/ex/Smith_Machine_Squat/0.jpg","./img/ex/Smith_Machine_Squat/1.jpg","./img/ex/Smith_Machine_Squat/t.jpg","./img/ex/Smith_Machine_Stiff-Legged_Deadlift/0.jpg","./img/ex/Smith_Machine_Stiff-Legged_Deadlift/1.jpg","./img/ex/Smith_Machine_Stiff-Legged_Deadlift/t.jpg","./img/ex/Standing_Biceps_Cable_Curl/0.jpg","./img/ex/Standing_Biceps_Cable_Curl/1.jpg","./img/ex/Standing_Biceps_Cable_Curl/t.jpg","./img/ex/Standing_Dumbbell_Calf_Raise/0.jpg","./img/ex/Standing_Dumbbell_Calf_Raise/1.jpg","./img/ex/Standing_Dumbbell_Calf_Raise/t.jpg","./img/ex/Standing_Dumbbell_Triceps_Extension/0.jpg","./img/ex/Standing_Dumbbell_Triceps_Extension/1.jpg","./img/ex/Standing_Dumbbell_Triceps_Extension/t.jpg","./img/ex/Standing_Hip_Circles/0.jpg","./img/ex/Standing_Hip_Circles/1.jpg","./img/ex/Standing_Hip_Circles/t.jpg","./img/ex/Stiff-Legged_Dumbbell_Deadlift/0.jpg","./img/ex/Stiff-Legged_Dumbbell_Deadlift/1.jpg","./img/ex/Stiff-Legged_Dumbbell_Deadlift/t.jpg","./img/ex/Straight-Arm_Pulldown/0.jpg","./img/ex/Straight-Arm_Pulldown/1.jpg","./img/ex/Straight-Arm_Pulldown/t.jpg","./img/ex/Triceps_Pushdown/0.jpg","./img/ex/Triceps_Pushdown/1.jpg","./img/ex/Triceps_Pushdown/t.jpg","./img/ex/Triceps_Pushdown_-_Rope_Attachment/0.jpg","./img/ex/Triceps_Pushdown_-_Rope_Attachment/1.jpg","./img/ex/Triceps_Pushdown_-_Rope_Attachment/t.jpg","./img/ex/Wide-Grip_Lat_Pulldown/0.jpg","./img/ex/Wide-Grip_Lat_Pulldown/1.jpg","./img/ex/Wide-Grip_Lat_Pulldown/t.jpg","./img/gym/ab-crunch.jpg","./img/gym/back-extension.jpg","./img/gym/bench.jpg","./img/gym/bike.jpg","./img/gym/cable-row.jpg","./img/gym/cables.jpg","./img/gym/chest-press.jpg","./img/gym/leg-curl.jpg","./img/gym/leg-extension.jpg","./img/gym/leg-press.jpg","./img/gym/preacher.jpg","./img/gym/rower.jpg","./img/gym/shoulder-press.jpg","./img/gym/smith.jpg","./img/gym/treadmill.jpg"];
async function fillPhotos() {
  const c = await caches.open(IMG_CACHE), want = PHOTOS.map(function (u) { return new URL(u, self.registration.scope).href; });
  for (const r of await c.keys()) if (want.indexOf(r.url) < 0) await c.delete(r);   // left the program
  const missing = [];
  for (const u of want) if (!(await c.match(u))) missing.push(u);
  // a few at a time; a photo that fails now is fetched when it is first shown
  async function worker() { let u; while ((u = missing.shift())) { try { const res = await fetch(u, { cache: 'reload' }); if (res.ok) await c.put(u, res); } catch (e) {} } }
  await Promise.all([worker(), worker(), worker(), worker()]);
}

self.addEventListener('install', function (e) {
  e.waitUntil((async function () {
    const c = await caches.open(CACHE);
    // cache: 'reload' skips the browser's HTTP cache, so a new version never precaches old files
    await Promise.all(SHELL.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
    await fillPhotos().catch(function () {});   // only what is missing: usually nothing after the first install
    await self.skipWaiting();
  })());
});

/* An old unprefixed 'v-' cache is Lift's only if everything in it is under Lift's scope (or a font). */
async function legacyLift(name) {
  const scope = self.registration.scope;
  const reqs = await (await caches.open(name)).keys();
  let mine = 0;
  for (const r of reqs) {
    if (r.url.startsWith(scope)) mine++;
    else if (FONT_HOSTS.indexOf(new URL(r.url).hostname) < 0) return false;
  }
  return mine > 0;
}

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    const keys = await caches.keys();
    await Promise.all(keys.map(async function (k) {
      if (k === CACHE || k === IMG_CACHE) return;
      if (k.startsWith('lift-') || (k.startsWith('v-') && await legacyLift(k))) await caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  const font = FONT_HOSTS.indexOf(url.hostname) >= 0;
  if (!same && !font) return;
  if (same && url.searchParams.has('fresh')) { e.respondWith(fetch(req.url, { cache: 'no-store' })); return; }   // explicit "get the live file"
  if (same && /\/img\/.+\.(jpg|png)$/.test(url.pathname)) {   // photos: from the photo cache, else the network (and keep it)
    e.respondWith(caches.open(IMG_CACHE).then(function (c) {
      return c.match(req.url).then(function (hit) {
        return hit || fetch(req).then(function (res) { if (res.ok) e.waitUntil(c.put(req.url, res.clone()).catch(function () {})); return res; });
      });
    }));
    return;
  }

  // keeps the worker alive until the background refresh has been stored
  let settle; e.waitUntil(new Promise(function (r) { settle = r; }));
  let net = null, stored = null;
  e.respondWith((async function () {
    try {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req, { ignoreSearch: same });
      net = fetch(same && req.mode !== 'navigate' ? new Request(req.url, { cache: 'no-cache' }) : req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) stored = cache.put(req, res.clone()).catch(function () {});
        return res;
      }).catch(function () { return null; });
      if (hit) return hit;
      const fresh = await net;
      if (fresh) return fresh;
      if (req.mode === 'navigate') {
        const shell = await cache.match('./index.html', { ignoreSearch: true });
        if (shell) return shell;
      }
      return new Response('Offline, and this page has not been saved on this device yet.',
        { status: 503, headers: { 'Content-Type': 'text/plain' } });
    } finally { settle(net && net.then(function () { return stored; })); }
  })());
});
