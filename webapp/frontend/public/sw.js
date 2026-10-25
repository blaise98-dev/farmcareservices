// FarmCare Service Worker: offline support + asset caching
const CACHE_NAME = 'farmcare-v2';   // bump to drop every older cache
const STATIC_ASSETS = ['/', '/manifest.json', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only cache GET requests; skip API and WebSocket calls, and videos, which
  // the browser streams itself (range requests let viewers seek)
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/ws') || url.pathname.startsWith('/videos/')) return;

  // Pages: network first, so a new deploy is picked up at once (an old cached
  // page would ask for script files the deploy has removed). Cache when offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/', clone));
        }
        return response;
      }).catch(() => caches.match('/'))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((response) => {
        // Cache successful HTML/CSS/JS responses
        if (response.ok && (
          response.headers.get('content-type')?.includes('html') ||
          response.headers.get('content-type')?.includes('javascript') ||
          response.headers.get('content-type')?.includes('css')
        )) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);  // Return cache on network failure

      return cached || networkFetch;
    })
  );
});

// Push notification handler (for future use)
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'FarmCare Alert', {
      body: data.body || '',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: data.tag || 'farmcare-alert',
    })
  );
});
