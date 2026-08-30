// GameDeck service worker
// - HTML navigations: NETWORK-FIRST, so a new deploy shows on a normal reload
//   (the fresh index.html points at the new hashed assets). Falls back to cache offline.
// - Vite's /assets/* bundles: cache-first (the filename carries a content hash, so a
//   changed file is a different URL and can never be served stale).
// - Icons and the manifest: NOT HANDLED AT ALL. They are fetched by iOS outside the
//   page context, and a worker in that path can only serve something stale.
// - Every OTHER same-origin file: network-first, since a stable url may change bytes.
// - Game art and news art: cache-first in a capped image cache,
//   so covers, screenshots and story thumbnails load instantly on
//   repeat views and work offline. Cross-origin art reaches this branch because it
//   goes through wsrv.nl or images.igdb.com; a press CDN hotlinked directly would
//   fall through the cross-origin bail below and never be cached at all, which is
//   what News did.
// - Supabase / API calls: network-first, falling back to cache when offline.

// Bumped to v4 to evict the v3 cache, which is holding stale icons and an old
// manifest on every device that has already visited. `activate` deletes any cache
// not in KEEP, so the rename is what actually clears them.
const SHELL_CACHE = 'gamedeck-shell-v4';
const IMG_CACHE = 'gamedeck-img-v1';
// Raised from 300 when News article art started coming through wsrv.nl too. A
// week of stories is ~12 thumbnails and the tab keeps several weeks, so on the
// old cap a scroll through News could evict a whole library's worth of covers.
// These are downscaled WebP - a 128px thumbnail is a few kB - so 500 is still a
// small cache.
const IMG_CACHE_LIMIT = 500; // covers, screenshots and news art; oldest evicted first (FIFO).
const KEEP = [SHELL_CACHE, IMG_CACHE];
// The manifest is deliberately NOT precached. See the bypass in the fetch handler.
const APP_SHELL = ['/', '/index.html'];

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

  // Art: cache-first with a capped cache. Covers/screenshots are served via the
  // wsrv.nl image CDN (resized WebP); raw images.igdb.com is the fallback path.
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

  // Icons and the manifest are deliberately left alone: no respondWith, so the
  // request goes to the network exactly as the browser would have sent it.
  //
  // iOS fetches these when adding to the home screen, outside the page's control, and
  // a service worker sitting in that path has only ever been a way for a stale copy to
  // outlive a deploy. There is nothing to gain by caching them - the phone keeps its
  // own copy of the installed icon - and a whole class of bug to lose.
  if (url.pathname.startsWith('/icons/') || url.pathname.endsWith('.webmanifest')) return;

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

  // Vite's hashed bundles: cache-first. The hash is in the filename, so the content
  // behind a given URL can never change and a stale hit is impossible.
  if (url.pathname.startsWith('/assets/')) {
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
    return;
  }

  // Everything else same-origin - icons, the manifest, anything in public/ - keeps a
  // STABLE url while its bytes change between deploys. Network-first, falling back to
  // cache offline: still instant offline, but a redrawn icon actually arrives.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
