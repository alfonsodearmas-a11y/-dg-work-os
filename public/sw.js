const CACHE_VERSION = 'v1';
const STATIC_CACHE = `dg-static-${CACHE_VERSION}`;
const PAGE_CACHE = `dg-pages-${CACHE_VERSION}`;
const API_CACHE = `dg-api-${CACHE_VERSION}`;

const APP_SHELL = [
  '/',
  '/intel',
  '/intel/gpl',
  '/intel/gwi',
  '/intel/cjia',
  '/intel/gcaa',
  '/projects',
  '/offline.html',
  '/manifest.json',
  '/ministry-logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== PAGE_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // STRATEGY 1: API calls — Network first, cache fallback
  if (url.pathname.startsWith('/api/')) {
    if (event.request.method !== 'GET') return;
    if (url.pathname.startsWith('/api/ai/')) return;
    if (url.pathname.startsWith('/api/auth/')) return;

    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(API_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then(
            (r) =>
              r ||
              new Response('{"error":"offline"}', {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
              })
          )
        )
    );
    return;
  }

  // STRATEGY 2: Page navigations — Network first, cache fallback, offline page last resort
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(event.request)
            .then((cached) => cached || caches.match('/offline.html'))
        )
    );
    return;
  }

  // STRATEGY 3: Static assets — Cache first, network fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        if (
          response.ok &&
          (url.pathname.match(/\.(js|css|png|jpg|svg|woff2?)$/) ||
            url.pathname.startsWith('/_next/'))
        ) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
