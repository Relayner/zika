/* Service worker: офлайн-кэш оболочки. Версия подставляется сборкой. */
const CACHE = 'zika-20260823-0027';
const ASSETS = ["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png","./apple-touch-icon.png","./img/cat-01.webp","./img/cat-02.webp","./img/cat-03.webp","./img/cat-04.webp","./img/cat-05.webp","./img/cat-06.webp","./img/cat-07.webp","./img/cat-08.webp","./img/cat-09.webp","./img/cat-10.webp","./img/chest-closed.webp","./img/chest-open.webp","./img/treasure-bamboo.webp","./img/treasure-blade.webp","./img/treasure-bowl.webp","./img/treasure-brush.webp","./img/treasure-coin.webp","./img/treasure-crossbow.webp","./img/treasure-ding.webp","./img/treasure-guqin.webp","./img/treasure-heshibi.webp","./img/treasure-horse.webp","./img/treasure-ingot.webp","./img/treasure-ink.webp","./img/treasure-jade.webp","./img/treasure-lacquer.webp","./img/treasure-mirror.webp","./img/treasure-pearl.webp","./img/treasure-seal.webp","./img/treasure-silk.webp","./img/treasure-sunzi.webp","./img/treasure-tally.webp","./img/treasure-tea.webp","./img/treasure-vase.webp"];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(cached => {
    const net = fetch(e.request).then(resp => {
      if (resp && resp.ok) caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
      return resp;
    }).catch(() => cached);
    return cached || net;
  }));
});
