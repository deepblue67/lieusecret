// Service worker : le mode « un seul téléphone » marche sans connexion une fois le jeu
// ouvert une première fois. Réseau d'abord (dernière version), cache en secours.
// Pense à changer VERSION à chaque mise à jour.
const VERSION = 'lieu-v1.0.0';
const FILES = [
  './',
  './index.html',
  './host.html',
  './play.html',
  './tv.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/common.js',
  './js/config.js',
  './js/fx.js',
  './js/game.js',
  './js/home.js',
  './js/host.js',
  './js/places.js',
  './js/play.js',
  './js/roster.js',
  './js/secure.js',
  './js/transport.js',
  './js/tv.js',
  './js/ui.js',
  './js/vendor/qrcode.js',
  './js/vendor/supabase.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
