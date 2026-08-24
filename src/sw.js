/* Service worker: офлайн-кэш оболочки. Версия подставляется сборкой. */
const CACHE = 'zika-__VERSION__';
const ASSETS = __ASSETS__;
const CORE = ASSETS.filter(a => !a.startsWith('./img/'));
const IMGS = ASSETS.filter(a => a.startsWith('./img/'));
/* Установка лёгкая: только оболочка. Картинки переезжают из старого кэша и дообновляются фоном. */
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const nc = await caches.open(CACHE);
    const keys = await caches.keys();
    for (const k of keys) {
      if (k === CACHE) continue;
      try {
        const oc = await caches.open(k);
        for (const req of await oc.keys()) {
          if (req.url.includes('/img/') && !(await nc.match(req, { ignoreSearch: true }))) {
            const res = await oc.match(req);
            if (res) await nc.put(req, res);
          }
        }
      } catch (err) { /* ignore */ }
      await caches.delete(k);
    }
    await self.clients.claim();
    (async () => { for (const u of IMGS) { try { await nc.add(u); } catch (err) { /* офлайн — обновятся позже */ } } })();
  })());
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
