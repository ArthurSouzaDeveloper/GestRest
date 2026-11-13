// Service worker mínimo: cache de arquivos estáticos do painel (PWA instalável).
const CACHE = 'inspiralle-painel-v1';
const ASSETS = ['/static/css/painel.css', '/static/js/painel.js', '/static/icons/icon.svg'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS))));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.includes('/static/')) return;
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
