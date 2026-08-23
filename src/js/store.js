/* Хранилище: IndexedDB → localStorage → память (превью). Всё локально на устройстве. */
window.Store = (() => {
  const DB_NAME = 'zika', VER = 1, LS = 'zika:';
  let mode = 'mem', db = null;
  const mem = { kv: {}, attempts: {} };

  function openDB() {
    return new Promise((res, rej) => {
      let req;
      try { req = indexedDB.open(DB_NAME, VER); } catch (e) { return rej(e); }
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv');
        if (!d.objectStoreNames.contains('attempts')) d.createObjectStore('attempts', { keyPath: 'id' });
      };
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error || new Error('idb error'));
      req.onblocked = () => rej(new Error('idb blocked'));
    });
  }
  function wrap(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  function lsOk() { try { localStorage.setItem(LS + 't', '1'); localStorage.removeItem(LS + 't'); return true; } catch (e) { return false; } }

  async function init() {
    try {
      if (!window.indexedDB) throw new Error('no idb');
      db = await Promise.race([openDB(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]);
      mode = 'idb';
    } catch (e) {
      mode = lsOk() ? 'ls' : 'mem';
    }
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignore */ }
    return mode;
  }

  async function get(key) {
    if (mode === 'idb') return wrap(db.transaction('kv').objectStore('kv').get(key));
    if (mode === 'ls') { const v = localStorage.getItem(LS + key); return v == null ? undefined : JSON.parse(v); }
    return mem.kv[key];
  }
  async function set(key, val) {
    if (mode === 'idb') return wrap(db.transaction('kv', 'readwrite').objectStore('kv').put(val, key));
    if (mode === 'ls') return localStorage.setItem(LS + key, JSON.stringify(val));
    mem.kv[key] = val;
  }
  function lsAttempts() { const v = localStorage.getItem(LS + 'attempts'); return v ? JSON.parse(v) : []; }
  function lsSaveAttempts(list) { localStorage.setItem(LS + 'attempts', JSON.stringify(list)); }

  async function allAttempts() {
    if (mode === 'idb') return wrap(db.transaction('attempts').objectStore('attempts').getAll());
    if (mode === 'ls') return lsAttempts();
    return Object.values(mem.attempts);
  }
  async function putAttempt(a) {
    if (mode === 'idb') return wrap(db.transaction('attempts', 'readwrite').objectStore('attempts').put(a));
    if (mode === 'ls') { const l = lsAttempts().filter(x => x.id !== a.id); l.push(a); return lsSaveAttempts(l); }
    mem.attempts[a.id] = a;
  }
  async function putAttempts(list) {
    if (mode === 'idb') {
      const tx = db.transaction('attempts', 'readwrite'), st = tx.objectStore('attempts');
      list.forEach(a => st.put(a));
      return new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    }
    if (mode === 'ls') { const ids = new Set(list.map(a => a.id)); return lsSaveAttempts([...lsAttempts().filter(x => !ids.has(x.id)), ...list]); }
    list.forEach(a => { mem.attempts[a.id] = a; });
  }
  async function deleteAttempt(id) {
    if (mode === 'idb') return wrap(db.transaction('attempts', 'readwrite').objectStore('attempts').delete(id));
    if (mode === 'ls') return lsSaveAttempts(lsAttempts().filter(x => x.id !== id));
    delete mem.attempts[id];
  }
  async function clearAttempts() {
    if (mode === 'idb') return wrap(db.transaction('attempts', 'readwrite').objectStore('attempts').clear());
    if (mode === 'ls') return lsSaveAttempts([]);
    for (const k in mem.attempts) delete mem.attempts[k];
  }

  return { init, get, set, allAttempts, putAttempt, putAttempts, deleteAttempt, clearAttempts, get mode() { return mode; } };
})();
