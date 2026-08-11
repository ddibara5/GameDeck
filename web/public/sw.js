// GameDeck service worker
// - HTML navigations: NETWORK-FIRST, so a new deploy shows on a normal reload
//   (the fresh index.html points at the new hashed assets). Falls back to cache offline.
// - Hashed assets (JS/CSS/icons): cache-first (they are content-addressed / immutable).
// - IGDB game art (cross-origin): cache-first in a capped image cache, so covers and
//   screenshots load instantly on repeat views and work offline. This class of request
//   was previously skipped entirely (cross-origin bail), which is why images felt slow.
// - Supabase / API calls: network-first, falling back to cache when offline.

const SHELL_CACHE = 'gamedeck-shell-v3';
const IMG_CACHE = 'gamedeck-img-v1';
const IMG_CACHE_LIMIT = 300; // ~300 covers/screenshots; oldest evicted first (FIFO).
const KEEP = [SHELL_CACHE, IMG_CACHE];
const APP_SHELL = ['/', '/index.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !KEEP.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isApiOrSupabase(url) {
  return url.pathname.startsWith('/api/') || url.hostname.endsWith('.supabase.co');
}

// Keep the image cache from growing without bound. cache.keys() returns entries in
// insertion order, so slicing from the front drops the oldest (FIFO).
function trimCache(name, max) {
  return caches.open(name).then((cache) =>
    cache.keys().then((keys) => {
      if (keys.length <= max) return undefined;
      return Promise.all(keys.slice(0, keys.length - max).map((key) => cache.delete(key)));
    })
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Game art: cache-first with a capped cache. Covers/screenshots are served via
  // the wsrv.nl image CDN (resized WebP); raw images.igdb.com is the fallback path.
  // Opaque responses (no-CORS <img> loads) are still storable and replayable from
  // the Cache API, so this works without any CORS changes.
  if (url.hostname === 'images.igdb.com' || url.hostname === 'wsrv.nl') {
    event.respondWith(
      caches.open(IMG_CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request).then((response) => {
            if (response && (response.ok || response.type === 'opaque')) {
              cache
                .put(request, response.clone())
                .then(() => trimCache(IMG_CACHE, IMG_CACHE_LIMIT))
                .catch(() => {});
            }
            return response;
          });
        })
      )
    );
    return;
  }

  // Live data: always try the network first.
  if (isApiOrSupabase(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // HTML document / navigations: network-first so updates are picked up on reload.
  const isNavigation =
    request.mode === 'navigate' ||
    request.destination === 'document' ||
    url.pathname === '/' ||
    url.pathname.endsWith('.html');

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  // Everything else same-origin (hashed JS/CSS, icons): cache-first.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
    )
  );
});
