// Service Worker — cache do "app shell" para abrir offline.
// Não intercepta os downloads do modelo (CDN); o transformers.js usa o próprio cache.
const CACHE = 'transcritor-shell-v1';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './worker.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Só trata mesmo-origem; deixa CDN (modelos) passar direto pela rede.
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return resp;
      }).catch(() => cached);
    })
  );
});
