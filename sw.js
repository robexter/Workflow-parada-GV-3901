/* GV-3901 / PARADA REAL R28: arquivos estáticos em cache, SEM conteúdo Supabase.
 * Em falha de rede durante navegação, abrir offline.html (consulta somente leitura).
 * Não armazenar credenciais, respostas REST, tokens ou dados operacionais em CacheStorage.
 */
const CACHE = 'gv3901-v1-1-parada-real-r29-premium';
const SHELL = [
  './', './index.html', './assets/app.js', './assets/username-login.js',
  './assets/membros-acesso.js', './assets/ambiente-real-r22.js',
  './assets/cadastro-atividades-r22.js', './assets/boot-real-r22.js',
  './assets/codigos-disciplinas-r25.js', './assets/cabecalho-responsivo-r26.css',
  './assets/instalacao-pwa-r27.js',
  './assets/offline-consulta-r28.js', './offline.html',
  './assets/layout-premium-r29.css', './assets/layout-premium-r29.js',
  './assets/premium-refinaria-r29.svg',
  './assets/styles.css', './assets/cadastro-mobile.css', './manifest.webmanifest',
  './assets/icon-192.png', './assets/icon-512.png',
  './assets/icon-maskable-192.png', './assets/icon-maskable-512.png',
  './assets/apple-touch-icon.png'
];
const CONFIG_PATH = new URL('./assets/cloud-config.js', self.registration.scope).pathname;
const MEMBERS_CONFIG_PATH = new URL('./assets/membros-config.js', self.registration.scope).pathname;
const OFFLINE_PATH = new URL('./offline.html', self.registration.scope).pathname;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('gv3901-v1-1-parada-real-') && key !== CACHE)
        .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === CONFIG_PATH || url.pathname === MEMBERS_CONFIG_PATH) return;
  if (event.request.mode === 'navigate') {
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      if(url.pathname===OFFLINE_PATH){
        try {const res=await fetch(event.request); if(res.ok)return res;}catch(_){}
        return (await cache.match('./offline.html')) || Response.error();
      }
      try { const res=await fetch(event.request); if(res.ok)return res; }catch(_){}
      return (await cache.match('./offline.html')) || Response.error();
    })());
    return;
  }
  if(!SHELL.some(path=>new URL(path,self.registration.scope).pathname===url.pathname)) return;
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}
    return response;
  }).catch(()=>caches.match(event.request,{ignoreSearch:true})));
});
