/* GV-3901 / Homologacao: evitar cache de configuracao Supabase. */
const CACHE = 'gv3901-v1-1-homologacao-r2';
const SHELL = [
  './', './index.html', './assets/app.js', './assets/styles.css',
  './manifest.webmanifest', './assets/icon-192.png', './assets/icon-512.png',
  './assets/icon-maskable-192.png', './assets/icon-maskable-512.png',
  './assets/apple-touch-icon.png'
];
const CONFIG_PATH = new URL('./assets/cloud-config.js', self.registration.scope).pathname;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('gv3901-v1-1-') && key !== CACHE)
        .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  // Sempre buscar o arquivo de configuracao na rede, sem armazenar no Cache Storage.
  if (requestUrl.pathname === CONFIG_PATH) return;
  if (!SHELL.some(path => new URL(path, self.registration.scope).pathname === requestUrl.pathname)) return;
  event.respondWith(
    fetch(event.request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
