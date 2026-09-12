/* Копия по коду: шесть китайских слов вместо аккаунта.
   Прогресс живёт только на телефоне (README), поэтому потеря телефона = потеря всего.
   Здесь — копия, которую можно положить на сервер: код из шести слов разворачивается
   в идентификатор хранилища и ключ шифрования, сервер видит только шифротекст.

   Закон модуля: всё считается чистыми функциями от аргументов. Состояние приложения
   не мутируется (pack только читает), порядок вызовов ни на что не влияет. */
window.CloudCopy = (() => {
  const APP = 'zika';
  const SIZE = 6;                                     /* слов в коде */
  const ITER = 200000;                                /* итераций PBKDF2-SHA256 */
  const SALT = 'zika-cloudcopy-v1:';                  /* постоянная соль приложения + id-часть */
  const ID_LEN = 22;                                  /* символов base64url от SHA-256 */
  const IV_LEN = 12;                                  /* байт случайного iv для AES-GCM */

  /* ── слова кода ──────────────────────────────────────────────────────────
     Берём только те слова HSK 1–3, чей голый пиньинь однозначен во всём банке:
     на новом телефоне китайской клавиатуры нет, слово вводится латиницей без тонов,
     и по этой латинице оно обязано опознаваться единственным образом. */

  /* Ключ ввода: без тонов, нижний регистр, только буквы. Pinyin.stripTones сводит
     ü и v к u, поэтому «nü», «nv» и «nu» дают один ключ — так и задумано.
     Запасной путь нужен, если модуль грузят без pinyin.js: тогда та же нормализация
     делается здесь, и порядок загрузки ни на что не влияет. */
  function bareTones(s) {
    const P = window.Pinyin;
    if (P && typeof P.stripTones === 'function') return P.stripTones(s);
    return String(s).replace(/[vV]/g, 'ü').replace(/u:/g, 'ü')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
  }
  function normKey(s) {
    return bareTones(String(s == null ? '' : s)).toLowerCase().replace(/[^a-z]/g, '');
  }

  /* Короткое значение для показа. Режем по «;» и «,» только вне скобок:
     «(школьная) доска» и «частица восклицания (ах, а)» обязаны остаться целыми,
     а не превратиться в пустую строку. */
  function gloss(ru) {
    const s = String(ru == null ? '' : ru).trim();
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '(') depth++;
      else if (c === ')') depth = Math.max(0, depth - 1);
      else if (!depth && (c === ';' || c === ',')) return s.slice(0, i).trim() || s;
    }
    return s;
  }

  /* Словарная статья, а не грамматический шаблон: «虽然…但是…» иероглифами не записать
     и латиницей не набрать, значит в коде ему не место. */
  const isEntry = (hanzi, pinyin, ru) => /^[\u4e00-\u9fff]+$/.test(String(hanzi == null ? '' : hanzi))
    && !/[…]/.test(String(pinyin == null ? '' : pinyin))
    && !!gloss(ru);

  /* Годится ли слово в НОВЫЙ код. Частицы (了, 呢, 啊) и ключи в одну букву формально
     однозначны, но записанный от руки код из них не прочесть, поэтому их не выдаём. */
  const isCodeWord = w => w.key.length >= 2 && !/^(?:[a-zа-яё]+ )?частиц/i.test(gloss(w.ru));

  function buildWords() {
    const seen = Object.create(null);                 /* ключ → счётчик и первая запись */
    for (const lvl of [1, 2, 3]) {
      for (const [hanzi, pinyin, ru] of (window.HSK && HSK[lvl]) || []) {
        const key = normKey(pinyin);
        if (!key || !isEntry(hanzi, pinyin, ru)) continue;
        const hit = seen[key];
        if (hit) hit.n++;
        else seen[key] = { n: 1, w: Object.freeze({ hanzi, pinyin, ru, key, lvl }) };
      }
    }
    return Object.keys(seen).filter(k => seen[k].n === 1).map(k => seen[k].w);
  }

  /* KNOWN — всё, что модуль готов узнать на входе; WORDS — из чего собираются новые коды.
     Набор для узнавания шире курируемого нарочно: код, выданный другой версией каталога,
     обязан открываться и после того, как слово перестали предлагать. */
  const KNOWN = Object.freeze(buildWords());
  const WORDS = Object.freeze(KNOWN.filter(isCodeWord));
  const BY_KEY = Object.create(null);
  KNOWN.forEach(w => { BY_KEY[w.key] = w; });

  const find = s => BY_KEY[normKey(s)] || null;
  /* Как слово показывается в коде: 猫 māo кошка — а вводится латиницей «mao» */
  const label = w => `${w.hanzi} ${w.pinyin} ${gloss(w && w.ru)}`.trim();

  /* ── составление кода ────────────────────────────────────────────────────
     rnd — инъекция случайности: функция → число из [0,1), либо объект
     с getRandomValues. По умолчанию crypto. */
  /* Источник байтов: либо переданный (тест), либо ничего — молча подменять его нельзя */
  function source(rnd) {
    if (rnd && typeof rnd.getRandomValues === 'function') return rnd;
    throw new Error('Нет источника случайности');
  }
  function randInt(rnd, n) {
    if (typeof rnd === 'function') {
      const v = Number(rnd());
      if (!Number.isFinite(v)) throw new Error('Источник случайности вернул не число');
      return Math.min(n - 1, Math.max(0, Math.floor(v * n)));
    }
    const g = source(rnd);
    const buf = new Uint32Array(1);
    const lim = Math.floor(0x100000000 / n) * n;      /* отсечка против перекоса остатка */
    let v;
    do { g.getRandomValues(buf); v = buf[0]; } while (v >= lim);
    return v % n;
  }

  function makeCode(rnd = globalThis.crypto, size = SIZE) {
    if (WORDS.length < size) throw new Error('Слов не хватает на код');
    const out = [], used = Object.create(null);
    let tries = 0;
    while (out.length < size) {
      /* вырожденный источник (всегда одно и то же число) обязан оборваться ошибкой, а не висеть */
      if (++tries > 200 * size) throw new Error('Источник случайности не даёт разных слов');
      const w = WORDS[randInt(rnd, WORDS.length)];
      if (used[w.key]) continue;                      /* слова в коде не повторяются */
      used[w.key] = 1;
      out.push(w);
    }
    return out;
  }

  /* ── разбор введённого кода ──────────────────────────────────────────────
     Терпим любые разделители, лишние пробелы, регистр, v вместо ü и цифры тонов. */
  function parseDetail(text) {
    const tokens = String(text == null ? '' : text).split(/[^0-9A-Za-zÀ-ɏ]+/).filter(Boolean);
    const items = tokens.map((token, i) => {
      const key = normKey(token);
      return { i, token, key, word: key ? BY_KEY[key] || null : null };
    });
    const words = items.map(x => x.word);
    const bad = items.filter(x => !x.word);
    let error = '';
    if (!items.length) error = `Введите ${SIZE} слов кода латиницей`;
    else if (bad.length) error = `Не узнаю слово «${bad[0].token}» (${bad[0].i + 1}-е)`;
    else if (items.length !== SIZE) error = `Нужно ровно ${SIZE} слов, а введено ${items.length}`;
    return { ok: !error, error, items, bad, words: error ? null : words };
  }

  function parse(text) { return parseDetail(text).words; }

  /* ── ключ из кода ────────────────────────────────────────────────────────
     id — публичная часть (адрес ячейки на сервере), key — секрет, на сервер не уходит. */
  const enc = s => new TextEncoder().encode(s);
  const subtle = () => {
    const c = globalThis.crypto && globalThis.crypto.subtle;
    if (!c) throw new Error('Криптография недоступна');
    return c;
  };

  function passphrase(words) {
    const list = Array.isArray(words) ? words : parse(words);
    if (!Array.isArray(list) || list.length !== SIZE) throw new Error(`Код — это ${SIZE} слов`);
    return list.map(w => {
      const raw = w && typeof w === 'object' ? (w.key || w.pinyin || '') : w;
      const k = normKey(raw);
      if (!k) throw new Error('Пустое слово в коде');
      return k;
    }).join(' ');
  }

  async function idOf(pass) {
    const h = new Uint8Array(await subtle().digest('SHA-256', enc(pass + ':id')));
    return b64u(h).slice(0, ID_LEN);
  }

  async function deriveKey(words) {
    const pass = passphrase(words);
    const id = await idOf(pass);
    const base = await subtle().importKey('raw', enc(pass), 'PBKDF2', false, ['deriveKey']);
    const key = await subtle().deriveKey(
      { name: 'PBKDF2', salt: enc(SALT + id), iterations: ITER, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    return { id, key };
  }

  /* ── слепок состояния ────────────────────────────────────────────────────
     Тот же состав, что у экспорта в app.js, плюс журнал попыток. Состояние не мутируем. */
  function pack(state, at = Date.now()) {
    const s = state && typeof state === 'object' ? state : {};
    const when = Number.isFinite(at) ? at : 0;
    const attempts = (Array.isArray(s.attempts) ? s.attempts : []).slice()
      .sort((a, b) => ((a && a.ts) || 0) - ((b && b.ts) || 0) || cmpId(a, b));
    return {
      app: APP,
      schema: (s.meta && s.meta.schema) || (window.Vault && Vault.SCHEMA) || 1,
      settings: s.settings || {},
      decks: Array.isArray(s.decks) ? s.decks : [],
      cards: Array.isArray(s.cards) ? s.cards : [],
      campaign: s.campaign || null,
      attempts,
      at: when,
    };
  }
  /* Тай-брейк по id: пересчёт с нуля в любом порядке даёт один и тот же слепок */
  function cmpId(a, b) {
    const x = String((a && a.id) || ''), y = String((b && b.id) || '');
    return x < y ? -1 : x > y ? 1 : 0;
  }

  function unpack(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Пустая копия');
    if (obj.app !== APP) throw new Error('Это не копия 字卡');
    for (const k of ['decks', 'cards', 'attempts']) {
      if (!Array.isArray(obj[k])) throw new Error(`Повреждён раздел «${k}»`);
    }
    if (obj.settings && (typeof obj.settings !== 'object' || Array.isArray(obj.settings))) {
      throw new Error('Повреждены настройки');
    }
    return {
      app: APP, schema: obj.schema || 1, settings: obj.settings || {},
      decks: obj.decks, cards: obj.cards, campaign: obj.campaign || null,
      attempts: obj.attempts, at: obj.at || 0,
    };
  }

  /* ── шифрование ──────────────────────────────────────────────────────────
     Наружу уходит base64url(iv + шифротекст). Флаг сжатия — первый байт
     открытого текста, то есть внутри конверта: серверу не видно даже того,
     сжаты данные или нет. */
  function b64u(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    const b64 = typeof btoa === 'function' ? btoa(s) : Buffer.from(bytes).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(str) {
    const b64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
    const pad = b64 + '='.repeat((4 - b64.length % 4) % 4);
    if (typeof atob === 'function') {
      const s = atob(pad), out = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(pad, 'base64'));
  }

  async function drain(readable) {
    const rd = readable.getReader(), parts = [];
    let n = 0;
    for (;;) {
      const { value, done } = await rd.read();
      if (done) break;
      parts.push(value); n += value.length;
    }
    const out = new Uint8Array(n);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  async function through(bytes, stream) {
    const w = stream.writable.getWriter();
    const push = (async () => { await w.write(bytes); await w.close(); })();
    const out = await drain(stream.readable);
    await push;
    return out;
  }
  async function gzip(bytes) {
    if (typeof CompressionStream !== 'function') return null;   /* нет — шлём как есть */
    try { return await through(bytes, new CompressionStream('gzip')); } catch (e) { return null; }
  }
  async function gunzip(bytes) {
    if (typeof DecompressionStream !== 'function') throw new Error('Копия сжата, а распаковка недоступна');
    return await through(bytes, new DecompressionStream('gzip'));
  }

  async function encrypt(key, obj, rnd = globalThis.crypto) {
    const json = enc(JSON.stringify(obj));
    const gz = await gzip(json);
    const body = gz || json;
    const plain = new Uint8Array(1 + body.length);
    plain[0] = gz ? 1 : 0;                            /* флаг сжатия — внутри конверта */
    plain.set(body, 1);
    const iv = new Uint8Array(IV_LEN);
    source(rnd).getRandomValues(iv);
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, plain));
    const out = new Uint8Array(IV_LEN + ct.length);
    out.set(iv, 0); out.set(ct, IV_LEN);
    return b64u(out);
  }

  async function decrypt(key, blob) {
    const raw = unb64u(blob);
    if (raw.length <= IV_LEN + 16) throw new Error('Копия повреждена');
    const iv = raw.slice(0, IV_LEN), ct = raw.slice(IV_LEN);
    let plain;
    try {
      plain = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv }, key, ct));
    } catch (e) {
      /* AES-GCM проверяет целостность: неверный код даёт отказ, а не мусор */
      throw new Error('Код не подходит к этой копии');
    }
    const body = plain.slice(1);
    const json = plain[0] === 1 ? await gunzip(body) : body;
    return JSON.parse(new TextDecoder().decode(json));
  }

  /* ── сеть ────────────────────────────────────────────────────────────────
     Воркер получает только id ячейки и шифротекст — ни слов кода, ни ключа,
     ни единого иероглифа исходных данных. Fetch инъектируется для тестов. */
  /* Первый источник — conf.fetch: тогда вызов зависит только от аргументов.
     setFetch оставлен как общая настройка приложения и стоит ниже по старшинству. */
  let _fetch = null;
  function setFetch(fn) { _fetch = typeof fn === 'function' ? fn : null; return CloudCopyAPI; }
  function theFetch(conf) {
    const given = conf && typeof conf.fetch === 'function' ? conf.fetch : null;
    const f = given || _fetch || (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
    if (!f) throw new Error('Сеть недоступна');
    return f;
  }
  function endpoint(conf) {
    const url = String((conf && conf.url) || '').replace(/\/+$/, '');
    if (!url) throw new Error('Не задан адрес хранилища копий');
    return url + '/copy';
  }
  async function call(conf, body) {
    const res = await theFetch(conf)(endpoint(conf), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res || !res.ok) throw new Error('Хранилище не ответило' + (res && res.status ? ` (${res.status})` : ''));
    return await res.json();
  }

  async function put(conf, id, blob) {
    const r = await call(conf, { op: 'put', id: String(id), blob: String(blob) });
    if (r && r.ok === false) throw new Error(r.error || 'Копия не сохранена');
    return r || { ok: true };
  }
  async function get(conf, id) {
    const r = await call(conf, { op: 'get', id: String(id) });
    if (!r || !r.blob) throw new Error('По этому коду копии нет');
    return String(r.blob);
  }

  /* Удобная обёртка целиком: код + состояние → в хранилище, и обратно */
  async function save(conf, words, state, at = Date.now()) {
    const { id, key } = await deriveKey(words);
    const blob = await encrypt(key, pack(state, at));
    await put(conf, id, blob);
    return { id, at, bytes: blob.length };
  }
  async function load(conf, words) {
    const { id, key } = await deriveKey(words);
    return unpack(await decrypt(key, await get(conf, id)));
  }

  const CloudCopyAPI = {
    APP, SIZE, ITER, SALT, ID_LEN, WORDS, KNOWN,
    normKey, gloss, find, label, makeCode, parse, parseDetail,
    deriveKey, pack, unpack, encrypt, decrypt,
    setFetch, put, get, save, load, b64u, unb64u,
  };
  return CloudCopyAPI;
})();
