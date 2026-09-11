const CACHE_NAME = 'paisatrack-cache-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/css/style.css',
  '/js/app.js',
  '/js/charts.js',
  '/manifest.json',
  '/favicon.svg',
  '/static/css/style.css',
  '/static/js/app.js',
  '/static/js/charts.js',
  '/static/manifest.json',
  '/static/favicon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Let API calls bypass cache completely
  if (event.request.url.includes('/api/')) {
    return;
  }

  // Network-first for HTML pages so authentication and sessions are always fresh
  if (event.request.mode === 'navigate' || event.request.url.endsWith('/') || event.request.url.includes('index.html')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});
