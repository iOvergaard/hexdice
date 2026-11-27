// Hexdice service worker: after one visit, the game plays offline.
// The build prepends CACHE (a name unique to this build) and FILES (the files the game needs,
// relative to this script). See scripts/offline.ts.
//
// Pages come from the network while there is one, so online players always get the deployed build.
// Offline, or on a stalled connection, the page and its assets come from the newest complete build
// this worker holds. A new deploy changes this file, so the browser installs the new worker on the
// next visit; it takes over at once and deletes older caches.

const INDEX = new URL('index.html', self.location).href;
// Music outlives builds: a track is kept the first time it plays, and a changed track gets a new file name.
const MUSIC = 'hexdice-music';
const MUSIC_DIR = new URL('music/', self.location).href;
const PRECACHE = new Set(FILES.map((file) => new URL(file, self.location).href));
// On a signal that connects but carries nothing, serve the offline copy rather than wait.
const PAGE_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Revalidate everything: an HTTP-cached page from an older build must never land in this cache.
      await cache.addAll([...PRECACHE].map((url) => new Request(url, { cache: 'no-cache' })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('hexdice-') && key !== CACHE && key !== MUSIC).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.mode === 'navigate') event.respondWith(page(request));
  else if (PRECACHE.has(request.url)) event.respondWith(asset(request));
  else if (request.url.startsWith(MUSIC_DIR)) event.respondWith(music(request));
});

async function page(request) {
  // Revalidated, so the page never names assets the server no longer has. Manual redirects keep the
  // response valid for a navigation.
  const network = fetch(request.url, { cache: 'no-cache', redirect: 'manual' });
  network.catch(() => undefined);
  const cached = caches.open(CACHE).then((cache) => cache.match(INDEX));
  const stalled = new Promise((resolve) => setTimeout(resolve, PAGE_TIMEOUT_MS)).then(() => cached);
  try {
    return (await Promise.race([network, stalled])) ?? (await network);
  } catch {
    return (await cached) ?? Response.error();
  }
}

async function asset(request) {
  const cache = await caches.open(CACHE);
  return (await cache.match(request.url)) ?? fetch(request);
}

async function music(request) {
  const cache = await caches.open(MUSIC);
  const cached = await cache.match(request.url);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok && response.status === 200) await cache.put(request.url, response.clone());
  return response;
}
