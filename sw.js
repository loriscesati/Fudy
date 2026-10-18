// Service Worker per FODMAP Path PWA
// Incrementa CACHE_NAME ad ogni modifica per forzare il refresh
const CACHE_NAME = 'fodmap-path-v12';

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
  './src/domain/foods/cardModel.js',
  './src/domain/foods/cardService.js',
  './src/domain/challenge/challengeService.js',
  './src/ui/router.js',
  './src/ui/onboarding.js',
  './src/ui/pages/home.js',
  './src/ui/pages/alimenti.js',
  './src/ui/pages/challenge.js',
  './src/ui/pages/progressi.js'
];

// In ascolto del messaggio SKIP_WAITING inviato dal client o dalla UI di update
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('install', (event) => {
  // Pre-caching di tutti gli asset statici dell'applicazione
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
});

self.addEventListener('activate', (event) => {
  // Eliminazione di tutte le vecchie cache non corrispondenti alla versione corrente
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Gestione solo richieste GET
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);

  // Strategia Network-First con fallback su cache per documenti HTML e script locali
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // Se la risposta e' valida, aggiorna la cache asincronamente
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        // In caso di assenza di rete (offline), recupera dalla cache
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }
        // Fallback per navigazioni SPA
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      })
  );
});
