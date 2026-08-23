/* Пуши Наставника Луна: подписка, отчёт о дневных очках на сервер. Всё анонимно — только подписка и числа. */
window.Push = (() => {
  const CONF = window.PUSH_CONF || { url: '', key: '' };
  const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const standalone = () => window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  function b64ToU8(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : '';
    const bin = atob(s + pad);
    return new Uint8Array([...bin].map(c => c.charCodeAt(0)));
  }
  async function getSub() {
    try { const reg = await navigator.serviceWorker.getRegistration(); return reg ? await reg.pushManager.getSubscription() : null; } catch (e) { return null; }
  }
  async function status() {
    if (!CONF.url) return 'unconfigured';
    if (!supported()) return 'unsupported';
    if (Notification.permission === 'denied') return 'denied';
    return (await getSub()) ? 'on' : 'off';
  }
  async function enable() {
    const reg = await navigator.serviceWorker.ready;
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('разрешение не дано');
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(CONF.key) });
    const r = await fetch(CONF.url + '/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sub: sub.toJSON(), tz: -new Date().getTimezoneOffset() }) });
    if (!r.ok) throw new Error('сервер не принял подписку');
    return true;
  }
  async function disable() {
    const sub = await getSub();
    if (sub) {
      try { await fetch(CONF.url + '/unsubscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }); } catch (e) { /* ignore */ }
      await sub.unsubscribe();
    }
  }
  /* Отчёт: сколько очков сегодня — чтобы сервер знал, ругаться ли и как сильно */
  async function report(t) {
    try {
      if (!CONF.url) return;
      const sub = await getSub();
      if (!sub) return;
      fetch(CONF.url + '/report', { method: 'POST', headers: { 'content-type': 'application/json' }, keepalive: true, body: JSON.stringify({ endpoint: sub.endpoint, date: t.key, points: Math.round(t.points), done: t.done, toCap: Math.round(t.toCap), tz: -new Date().getTimezoneOffset() }) }).catch(() => {});
    } catch (e) { /* ignore */ }
  }
  return { CONF, supported, standalone, status, enable, disable, report };
})();
