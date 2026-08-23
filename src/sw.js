/* Service worker: офлайн-кэш оболочки. Версия подставляется сборкой. */
const CACHE = 'zika-__VERSION__';
const ASSETS = __ASSETS__;
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
