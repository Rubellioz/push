// Cache-first service worker: PUSH works fully offline once installed.
const CACHE = 'push-v6';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/main.js',
  './js/ui/button.js',
  './js/ui/menus.js',
  './js/core/settings.js',
  './js/audio/sound.js',
  './js/core/haptics.js',
  './js/core/input.js',
  './js/core/timers.js',
  './js/game/commands.js',
  './js/game/rounds.js',
  './js/game/game.js',
  './js/game/score.js',
  './js/game/leaderboard.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './fonts/montserrat-latin-300-normal.woff2',
  './fonts/montserrat-latin-400-normal.woff2',
  './fonts/montserrat-latin-500-normal.woff2',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' skips the browser's HTTP cache, so we never store stale files.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first, so a new deploy shows up immediately; cache as offline fallback.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }) // always revalidate with the server
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
