const CACHE_NAME = 'fodmap-path-v21';
const FILES_TO_CACHE = [
  './', './index.html', './manifest.json', './icon-192.svg', './icon-512.svg',
  './src/infrastructure/storage/db.js', './src/infrastructure/storage/userProfile.js',
  './src/infrastructure/storage/backupService.js', './src/domain/backupCore.js',
  './src/infrastructure/export/csvExporter.js', './src/infrastructure/export/pdfExporter.js',
  './src/domain/insights/statisticsCore.js', './src/domain/insights/occasions.js',
  './src/domain/insights/associationCore.js', './src/domain/insights/trends.js',
  './src/domain/insights/observedAssociations.js', './src/domain/insights/reportStats.js',
  './src/domain/insights/dayFactors.js', './src/domain/insights/phaseTimer.js',
  './src/domain/foods/foodService.js', './src/domain/foods/cardModel.js', './src/domain/foods/cardService.js',
  './src/domain/challenge/challengeService.js', './src/ui/router.js', './src/ui/onboarding.js',
  './src/ui/pages/home.js', './src/ui/pages/alimenti.js', './src/ui/pages/challenge.js',
  './src/ui/pages/progressi.js', './src/ui/pages/backup.js'
];
self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.status === 200) { const copy = response.clone(); event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy))); }
    return response;
  }).catch(async () => (await caches.match(event.request)) || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
