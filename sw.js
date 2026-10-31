/* Cache restrito aos arquivos estáticos da aplicação; dados são mantidos fora do SW. */
const V='gv3901-v1-1-multiusuario-icons-20261031';
const SHELL=['./','./index.html','./assets/app.js','./assets/styles.css','./manifest.webmanifest','./assets/cloud-config.js','./assets/icon-192.png','./assets/icon-512.png','./assets/icon-maskable-192.png','./assets/icon-maskable-512.png','./assets/apple-touch-icon.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('gv3901-')&&k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const url=new URL(e.request.url);if(url.origin!==location.origin||!SHELL.some(p=>new URL(p,self.registration.scope).pathname===url.pathname))return;e.respondWith(fetch(e.request).then(r=>{if(r.ok){const copy=r.clone();caches.open(V).then(c=>c.put(e.request,copy));}return r;}).catch(()=>caches.match(e.request)))});
