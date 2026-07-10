/* GestRest service worker — instalação como app + shell offline.
   Nunca faz cache de /api ou /socket.io (sempre rede). */
const CACHE = 'gestrest-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Só GET, mesma origem; nunca API/websocket.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/socket.io')) return;

  // Assets com hash: cache-first (imutáveis).
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  // Navegações: rede primeiro, cai para o index.html em cache se offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          const cache = await caches.open(CACHE);
          cache.put('/index.html', res.clone());
          return res;
        } catch {
          const cache = await caches.open(CACHE);
          return (await cache.match('/index.html')) || Response.error();
        }
      })(),
    );
  }
});
