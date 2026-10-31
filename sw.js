// Ağ öncelikli; bağlantı yoksa son kopyadan çalışır. Biletler önceden indirilir, internetsiz de açılır.
const CACHE = 'gezi-v1';
const SHELL = ['./', 'app.js', 'app.css', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png', 'vault/meta.json', 'vault/content.enc'];

async function refresh() {
  const cache = await caches.open(CACHE);
  await cache.addAll(SHELL);
  const meta = await (await cache.match('vault/meta.json')).json();
  await cache.addAll(meta.files);
}

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(refresh());
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(e.request);
      if (res.ok) {
        await cache.put(e.request, res.clone());
        if (e.request.url.endsWith('vault/meta.json')) e.waitUntil(res.clone().json().then((m) => cache.addAll(m.files)).catch(() => {}));
      }
      return res;
    } catch (err) {
      const hit = await cache.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
