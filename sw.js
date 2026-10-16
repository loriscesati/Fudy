// Service Worker per FODMAP Path PWA
// Per ogni release modifica APP_VERSION: cambia il file e forza il refresh
const APP_VERSION = '2.1';
const CACHE_PREFIX = 'fodmap-path-';
const CACHE_NAME = `${CACHE_PREFIX}v${APP_VERSION}`;

const FILES_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
  './src/infrastructure/storage/db.js',
  './src/infrastructure/storage/userProfile.js',
  './src/infrastructure/export/csvExporter.js',
  './src/infrastructure/export/pdfExporter.js',
  './src/domain/insights/associationEngine.js',
  './src/domain/foods/foodService.js',
  './src/domain/challenge/challengeService.js',
  './src/ui/router.js',
  './src/ui/onboarding.js',
  './src/ui/pages/home.js',
  './src/ui/pages/alimenti.js',
  './src/ui/pages/challenge.js',
  './src/ui/pages/progressi.js'
];

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(FILES_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  // Elimina solo le vecchie cache dell'app; IndexedDB non viene toccato
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  // Network-first con fallback su cache
  event.respondWith(
    fetch(event.request, {
      cache: event.request.mode === 'navigate' ? 'no-store' : 'default'
    })
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseToCache));
        }
        return networkResponse;
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;
        if (event.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      })
  );
});
