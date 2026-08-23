/* Service worker: офлайн-кэш оболочки. Версия подставляется сборкой. */
const CACHE = 'zika-20260823-2301';
const ASSETS = ["./","./index.html","./manifest.webmanifest","./icon-192.png","./icon-512.png","./apple-touch-icon.png","./img/cat-01.webp","./img/cat-02.webp","./img/cat-03.webp","./img/cat-04.webp","./img/cat-05.webp","./img/cat-06.webp","./img/cat-07.webp","./img/cat-08.webp","./img/cat-09.webp","./img/cat-10.webp","./img/chest-closed.webp","./img/chest-open.webp","./img/dragon-1.webp","./img/dragon-2.webp","./img/dragon-3.webp","./img/dragon-4.webp","./img/pic-p01.webp","./img/pic-p02.webp","./img/pic-p03.webp","./img/pic-p04.webp","./img/pic-p05.webp","./img/pic-p06.webp","./img/pic-p07.webp","./img/pic-p08.webp","./img/pic-p09.webp","./img/pic-p10.webp","./img/pic-p11.webp","./img/pic-p12.webp","./img/pic-p13.webp","./img/pic-p14.webp","./img/pic-p15.webp","./img/pic-p16.webp","./img/pic-p17.webp","./img/pic-p18.webp","./img/pic-p19.webp","./img/pic-p20.webp","./img/pic-p21.webp","./img/pic-p22.webp","./img/pic-p23.webp","./img/pic-p24.webp","./img/pic-p25.webp","./img/pic-p26.webp","./img/pic-p27.webp","./img/pic-p28.webp","./img/pic-p29.webp","./img/treasure-bamboo.webp","./img/treasure-blade.webp","./img/treasure-bowl.webp","./img/treasure-brush.webp","./img/treasure-coin.webp","./img/treasure-crossbow.webp","./img/treasure-ding.webp","./img/treasure-guqin.webp","./img/treasure-heshibi.webp","./img/treasure-horse.webp","./img/treasure-ingot.webp","./img/treasure-ink.webp","./img/treasure-jade.webp","./img/treasure-lacquer.webp","./img/treasure-mirror.webp","./img/treasure-pearl.webp","./img/treasure-seal.webp","./img/treasure-silk.webp","./img/treasure-sunzi.webp","./img/treasure-tally.webp","./img/treasure-tea.webp","./img/treasure-vase.webp"];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch (err) { /* ignore */ }
  e.waitUntil(self.registration.showNotification(d.title || '字卡 · Наставник Лун', {
    body: d.body || 'День ждёт перехода — загляните на двадцать минут.',
    icon: './icon-192.png', badge: './icon-192.png', tag: 'zika-lun', data: { url: './' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) return c.focus();
    return clients.openWindow('./');
  }));
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
