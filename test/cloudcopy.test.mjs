/* Тест копии по коду: node test/cloudcopy.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
global.window = global;
for (const f of ['hsk', 'pinyin', 'cloudcopy']) require('../src/js/' + f + '.js');
const { CloudCopy, HSK, Pinyin } = global;

let ok = 0, bad = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

/* Генератор «случайности» с заданной лентой — код обязан быть воспроизводимым */
const tape = arr => { let i = 0; return () => arr[i++ % arr.length]; };
/* Тот же источник, но в виде объекта getRandomValues */
const bytesTape = nums => {
  let i = 0;
  return { getRandomValues: a => { for (let k = 0; k < a.length; k++) a[k] = nums[i++ % nums.length]; return a; } };
};

/* ── слова кода ───────────────────────────────────────────────────────── */
t('WORDS: не меньше 300 и все голые пиньини уникальны', () => {
  assert.ok(CloudCopy.WORDS.length >= 300, 'слов всего ' + CloudCopy.WORDS.length);
  const seen = new Set();
  for (const w of CloudCopy.WORDS) {
    assert.ok(w.hanzi && w.pinyin && w.ru, 'пустое поле у ' + w.hanzi);
    assert.equal(w.key, CloudCopy.normKey(w.pinyin), 'ключ не из пиньиня: ' + w.pinyin);
    assert.ok(/^[a-z]+$/.test(w.key), 'ключ не латиница: ' + w.key);
    assert.ok(!seen.has(w.key), 'повтор голого пиньиня: ' + w.key);
    seen.add(w.key);
    assert.equal(CloudCopy.find(w.key), w, 'слово не находится по ключу: ' + w.key);
  }
});

t('WORDS: неоднозначные слова банка исключены', () => {
  const all = [...HSK[1], ...HSK[2], ...HSK[3]];
  const count = {};
  for (const [, p] of all) { const k = CloudCopy.normKey(p); count[k] = (count[k] || 0) + 1; }
  for (const w of CloudCopy.WORDS) assert.equal(count[w.key], 1, 'взято неоднозначное: ' + w.key);
  /* 好 hǎo и 号 hào дают один голый пиньинь — такого слова в коде быть не должно */
  assert.equal(CloudCopy.find('hao'), null);
  assert.equal(CloudCopy.find('ba'), null);
  /* а однозначные — на месте */
  assert.equal(CloudCopy.find('mao').hanzi, '猫');
  assert.equal(CloudCopy.label(CloudCopy.find('mao')), '猫 māo кошка');
});

/* ── составление кода ─────────────────────────────────────────────────── */
t('makeCode: с подставленным rnd детерминирован', () => {
  const seq = [0.01, 0.5, 0.77, 0.12, 0.93, 0.34];
  const a = CloudCopy.makeCode(tape(seq));
  const b = CloudCopy.makeCode(tape(seq));
  assert.equal(a.length, 6);
  assert.deepEqual(a.map(w => w.key), b.map(w => w.key), 'один rnd — разные коды');
  const n = CloudCopy.WORDS.length;
  assert.deepEqual(a.map(w => w.key), seq.map(x => CloudCopy.WORDS[Math.floor(x * n)].key));
  assert.equal(new Set(a.map(w => w.key)).size, 6, 'слова повторились');
  a.forEach(w => assert.ok(CloudCopy.find(w.key), 'слово вне списка: ' + w.key));
});

t('makeCode: повторы из rnd пропускаются, источник-объект тоже годится', () => {
  const dup = CloudCopy.makeCode(tape([0.2, 0.2, 0.2, 0.4, 0.6, 0.8, 0.1, 0.3]));
  assert.equal(new Set(dup.map(w => w.key)).size, 6);
  const c1 = CloudCopy.makeCode(bytesTape([7, 1000003, 55, 900, 12345, 6, 42, 99]));
  const c2 = CloudCopy.makeCode(bytesTape([7, 1000003, 55, 900, 12345, 6, 42, 99]));
  assert.deepEqual(c1.map(w => w.key), c2.map(w => w.key));
  /* без источника случайности — честная ошибка, а не тихий мусор */
  assert.throws(() => CloudCopy.makeCode({}), /случайност/i);
});

/* ── разбор введённого кода ───────────────────────────────────────────── */
const CODE = ['mao', 'shui', 'tian', 'ren', 'nuer', 'luyou'];   /* 猫 水 甜 人 女儿 旅游 */

t('parse: принимает обычный ввод из реальных слов', () => {
  const w = CloudCopy.parse(CODE.join(' '));
  assert.ok(w, 'код не разобран');
  assert.deepEqual(w.map(x => x.key), CODE);
  assert.deepEqual(w.map(x => x.hanzi), ['猫', '水', '甜', '人', '女儿', '旅游']);
});

t('parse: терпит лишние пробелы, регистр, разделители и v вместо ü', () => {
  const variants = [
    '  mao   shui\ntian\tren  nuer   luyou  ',
    'MAO Shui TIAN ren NUER LuYou',
    'mao, shui, tian, ren, nver, lvyou',
    'mao-shui/tian.ren;nüer_lüyou',
    'mao1 shui3 tian2 ren2 nv3er2 lv3you2',
  ];
  for (const v of variants) {
    const w = CloudCopy.parse(v);
    assert.ok(w, 'не разобрано: ' + v);
    assert.deepEqual(w.map(x => x.key), CODE, 'разошлось на: ' + v);
  }
});

t('parse: отвергает мусор и говорит, какое слово не узнало', () => {
  assert.equal(CloudCopy.parse(''), null);
  assert.equal(CloudCopy.parse('qwerty zzz xyzzy foo bar baz'), null);
  assert.equal(CloudCopy.parse('mao shui tian ren nuer'), null, 'пять слов прошли');
  assert.equal(CloudCopy.parse('mao shui tian ren nuer luyou mao'), null, 'семь слов прошли');
  assert.equal(CloudCopy.parse('mao shui tian ren hao luyou'), null, 'неоднозначное слово прошло');

  const d = CloudCopy.parseDetail('mao shui zzzz ren nuer luyou');
  assert.equal(d.ok, false);
  assert.equal(d.words, null);
  assert.equal(d.bad.length, 1);
  assert.equal(d.bad[0].token, 'zzzz');
  assert.match(d.error, /zzzz/, 'в подсказке нет слова: ' + d.error);
  assert.match(d.error, /3-е/, 'в подсказке нет номера: ' + d.error);

  const few = CloudCopyDetail('mao shui tian');
  assert.equal(few.ok, false);
  assert.match(few.error, /6/, few.error);
  assert.equal(CloudCopy.parseDetail(CODE.join(' ')).ok, true);
});
function CloudCopyDetail(s) { return CloudCopy.parseDetail(s); }

/* ── ключ из кода ─────────────────────────────────────────────────────── */
t('deriveKey: id устойчив, зависит только от слов и записан base64url', async () => {
  const a = await CloudCopy.deriveKey(CloudCopy.parse(CODE.join(' ')));
  const b = await CloudCopy.deriveKey(CODE);                        /* строками — тот же код */
  const c = await CloudCopy.deriveKey('MAO,  shui, tian, ren, nver, lvyou');
  assert.equal(a.id.length, 22);
  assert.match(a.id, /^[A-Za-z0-9_-]{22}$/, 'id не base64url: ' + a.id);
  assert.equal(b.id, a.id, 'объекты и строки дали разные id');
  assert.equal(c.id, a.id, 'нормализация не сработала на id');
  const other = await CloudCopy.deriveKey(['mao', 'shui', 'tian', 'ren', 'nuer', 'diannao']);
  assert.notEqual(other.id, a.id, 'разные коды дали один id');
  await assert.rejects(() => CloudCopy.deriveKey(['mao', 'shui']), /6 слов/);
});

/* ── слепок ───────────────────────────────────────────────────────────── */
const attempt = (id, ts, hanzi) => ({
  id, ts, endedAt: ts + 1000, durationMs: 1000, mode: 'quiz', difficulty: 'easy',
  deckIds: ['hsk1'], deckName: 'HSK 1', show: 'hanzi', guess: ['pinyin'], order: 'random',
  timer: 0, total: 1, planned: 1, aborted: false, correct: 1, partial: 0, wrong: 0,
  percent: 100, points: 10,
  questions: [{ cardId: 'hsk1:' + hanzi, hanzi, pinyin: 'māo', ru: 'кошка', show: 'hanzi', guess: 'pinyin', answer: { choice: 0 }, parts: { pinyin: 'exact' }, fraction: 1, ok: true, ms: 900 }],
});
const stateOf = attempts => ({
  settings: { srs: { 'hsk1:猫': { step: 2, due: 111, seen: 3 } }, theme: 'night' },
  decks: [{ id: 'my1', name: 'Моя колода' }],
  cards: [{ id: 'my1:猫', deckId: 'my1', hanzi: '猫', pinyin: 'māo', ru: 'кошка' }],
  campaign: { days: 4, processedThrough: '2026-09-10' },
  meta: { schema: 2, installedAt: 1 },
  attempts,
});
const A = [attempt('a1', 1000, '猫'), attempt('a2', 2000, '水'), attempt('a3', 3000, '人')];

t('pack: чистая функция от истории — порядок попыток ничего не меняет', () => {
  const straight = CloudCopy.pack(stateOf(A.slice()), 777);
  const shuffled = CloudCopy.pack(stateOf([A[2], A[0], A[1]]), 777);
  const reversed = CloudCopy.pack(stateOf(A.slice().reverse()), 777);
  assert.equal(JSON.stringify(shuffled), JSON.stringify(straight), 'перемешанный журнал дал другой слепок');
  assert.equal(JSON.stringify(reversed), JSON.stringify(straight), 'обратный порядок дал другой слепок');
  assert.deepEqual(straight.attempts.map(x => x.id), ['a1', 'a2', 'a3']);
  assert.equal(straight.app, 'zika');
  assert.equal(straight.schema, 2);
  assert.equal(straight.at, 777);
  for (const k of ['settings', 'decks', 'cards', 'campaign', 'attempts', 'at', 'schema', 'app']) {
    assert.ok(k in straight, 'в слепке нет ' + k);
  }
});

t('pack: состояние не мутируется', () => {
  const st = stateOf([A[2], A[0], A[1]]);
  const before = JSON.stringify(st);
  CloudCopy.pack(st, 1);
  CloudCopy.pack(st, 2);
  assert.equal(JSON.stringify(st), before, 'pack изменил состояние');
});

t('unpack: проверяет форму', () => {
  const p = CloudCopy.pack(stateOf(A), 5);
  const u = CloudCopy.unpack(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(u.attempts.map(x => x.id), ['a1', 'a2', 'a3']);
  assert.equal(u.schema, 2);
  assert.throws(() => CloudCopy.unpack(null), /Пуст/);
  assert.throws(() => CloudCopy.unpack({ app: 'other', decks: [], cards: [], attempts: [] }), /字卡/);
  assert.throws(() => CloudCopy.unpack({ app: 'zika', decks: [], cards: [] }), /attempts/);
});

/* ── шифрование ───────────────────────────────────────────────────────── */
t('encrypt/decrypt: возвращается исходный объект', async () => {
  const { key } = await CloudCopy.deriveKey(CODE);
  const snap = CloudCopy.pack(stateOf(A), 12345);
  const blob = await CloudCopy.encrypt(key, snap);
  assert.match(blob, /^[A-Za-z0-9_-]+$/, 'блоб не base64url');
  const back = await CloudCopy.decrypt(key, blob);
  assert.deepEqual(back, snap);
  assert.deepEqual(CloudCopy.unpack(back).attempts.map(x => x.id), ['a1', 'a2', 'a3']);
  /* случайный iv: одно и то же шифруется по-разному */
  const twice = await CloudCopy.encrypt(key, snap);
  assert.notEqual(twice, blob, 'iv не случаен');
  assert.deepEqual(await CloudCopy.decrypt(key, twice), snap);
  /* в шифротексте нет ни иероглифов, ни русских слов исходника */
  assert.ok(!/[一-鿿]/.test(blob), 'иероглифы в шифротексте');
  assert.ok(!blob.includes('hsk1'), 'исходные строки в шифротексте');
});

t('encrypt: сжатие включается, когда есть CompressionStream', async () => {
  const { key } = await CloudCopy.deriveKey(CODE);
  const many = Array.from({ length: 200 }, (_, i) => attempt('a' + i, 1000 + i, '猫'));
  const snap = CloudCopy.pack(stateOf(many), 1);
  const blob = await CloudCopy.encrypt(key, snap);
  const plain = JSON.stringify(snap).length;
  if (typeof CompressionStream === 'function') {
    assert.ok(blob.length < plain / 2, `сжатия нет: ${blob.length} против ${plain}`);
  }
  assert.deepEqual(await CloudCopy.decrypt(key, blob), snap);
});

t('decrypt: неверный код даёт ошибку, а не мусор', async () => {
  const { key } = await CloudCopy.deriveKey(CODE);
  const wrong = await CloudCopy.deriveKey(['mao', 'shui', 'tian', 'ren', 'nuer', 'diannao']);
  const blob = await CloudCopy.encrypt(key, CloudCopy.pack(stateOf(A), 9));
  await assert.rejects(() => CloudCopy.decrypt(wrong.key, blob), /Код не подходит/);
  await assert.rejects(() => CloudCopy.decrypt(key, 'AAAA'), /повреждена/i);
  /* подпорченный шифротекст тоже отвергается целиком */
  const raw = CloudCopy.unb64u(blob);
  raw[raw.length - 1] ^= 0xff;
  await assert.rejects(() => CloudCopy.decrypt(key, CloudCopy.b64u(raw)), /Код не подходит/);
});

/* ── сеть ─────────────────────────────────────────────────────────────── */
const fakeNet = () => {
  const calls = [], cell = {};
  const fn = async (url, opts) => {
    const body = JSON.parse(opts.body);
    calls.push({ url, opts, body });
    if (body.op === 'put') { cell[body.id] = body.blob; return { ok: true, status: 200, json: async () => ({ ok: true }) }; }
    if (body.op === 'get') return { ok: true, status: 200, json: async () => ({ blob: cell[body.id] || null }) };
    return { ok: false, status: 400, json: async () => ({}) };
  };
  return { fn, calls, cell };
};

t('put/get: наружу уходят только id и шифротекст', async () => {
  const net = fakeNet();
  CloudCopy.setFetch(net.fn);
  const { id, key } = await CloudCopy.deriveKey(CODE);
  const snap = CloudCopy.pack(stateOf(A), 42);
  const blob = await CloudCopy.encrypt(key, snap);

  await CloudCopy.put({ url: 'https://worker.example/api/' }, id, blob);
  const got = await CloudCopy.get({ url: 'https://worker.example/api' }, id);
  assert.equal(got, blob);
  assert.deepEqual(await CloudCopy.decrypt(key, got), snap);

  assert.equal(net.calls.length, 2);
  for (const c of net.calls) {
    assert.equal(c.url, 'https://worker.example/api/copy', 'не тот адрес: ' + c.url);
    assert.equal(c.opts.method, 'POST');
    const keys = Object.keys(c.body).sort();
    assert.ok(keys.every(k => ['op', 'id', 'blob'].includes(k)), 'лишние поля: ' + keys.join(','));
    /* в теле запроса нет ни иероглифов, ни слов кода, ни русских строк исходника */
    assert.ok(!/[一-鿿]/.test(c.opts.body), 'иероглифы ушли на сервер: ' + c.opts.body.slice(0, 120));
    assert.ok(!/[А-Яа-я]/.test(c.opts.body), 'русские строки ушли на сервер');
    for (const w of CODE) assert.ok(!c.opts.body.includes('"' + w), 'слово кода ушло на сервер: ' + w);
    assert.ok(!c.opts.body.includes('Моя колода') && !c.opts.body.includes('hsk1'), 'данные ушли открытым текстом');
  }
  assert.deepEqual(Object.keys(net.calls[0].body).sort(), ['blob', 'id', 'op']);
  assert.deepEqual(Object.keys(net.calls[1].body).sort(), ['id', 'op']);
  assert.equal(net.calls[0].body.id, id);
  assert.equal(net.calls[0].body.blob, blob);
});

t('save/load: круг целиком через подставленную сеть', async () => {
  const net = fakeNet();
  CloudCopy.setFetch(net.fn);
  const conf = { url: 'https://worker.example' };
  const st = stateOf([A[1], A[2], A[0]]);
  const res = await CloudCopy.save(conf, CODE, st, 100);
  assert.ok(res.id && res.bytes > 0);
  const back = await CloudCopy.load(conf, 'MAO shui, tian ren nver lvyou');
  assert.deepEqual(back.attempts.map(x => x.id), ['a1', 'a2', 'a3']);
  assert.deepEqual(back.cards, st.cards);
  assert.equal(back.at, 100);
  /* в самом хранилище лежит только шифротекст */
  const stored = Object.values(net.cell)[0];
  assert.match(stored, /^[A-Za-z0-9_-]+$/);
  assert.ok(!/[一-鿿]/.test(stored));
  /* чужой код к этой ячейке не подходит */
  await assert.rejects(() => CloudCopy.load(conf, ['mao', 'shui', 'tian', 'ren', 'nuer', 'diannao']), /копии нет|не подходит/);
  CloudCopy.setFetch(null);
});

t('put: отказ сервера — это ошибка, а не тихая потеря копии', async () => {
  CloudCopy.setFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }));
  await assert.rejects(() => CloudCopy.put({ url: 'https://x' }, 'id', 'blob'), /не ответило/);
  CloudCopy.setFetch(async () => ({ ok: true, status: 200, json: async () => ({ blob: null }) }));
  await assert.rejects(() => CloudCopy.get({ url: 'https://x' }, 'id'), /копии нет/);
  CloudCopy.setFetch(net => { throw new Error('не должно вызываться'); });
  await assert.rejects(() => CloudCopy.put({}, 'id', 'blob'), /адрес/);
  CloudCopy.setFetch(null);
});

/* ── содержание каталога ──────────────────────────────────────────────── */
t('каталог: только словарные статьи, у каждой читаемая подпись', () => {
  for (const w of CloudCopy.KNOWN) {
    assert.match(w.hanzi, /^[一-鿿]+$/, 'не иероглифы: ' + w.hanzi);
    assert.ok(!/…/.test(w.pinyin), 'грамматический шаблон в каталоге: ' + w.hanzi);
    const g = CloudCopy.gloss(w.ru);
    assert.ok(g, 'пустое значение у ' + w.hanzi + ' (' + w.ru + ')');
    assert.equal(CloudCopy.label(w), `${w.hanzi} ${w.pinyin} ${g}`, 'подпись не собирается: ' + w.hanzi);
    assert.ok(/[а-яё]/i.test(g), 'значение без русских букв: ' + w.hanzi + ' → ' + g);
  }
  /* скобки не режем: «(школьная) доска» раньше давала пустую подпись */
  assert.equal(CloudCopy.label(CloudCopy.find('heiban')), '黑板 hēibǎn (школьная) доска');
  assert.equal(CloudCopy.gloss('частица восклицания (ах, а)'), 'частица восклицания (ах, а)');
  assert.equal(CloudCopy.gloss('горячий; жарко'), 'горячий');
  assert.equal(CloudCopy.gloss('не, нет'), 'не');
  assert.equal(CloudCopy.gloss(null), '');
  /* шаблонов вроде 虽然…但是… в каталоге нет ни под каким ключом */
  for (const k of ['suirandanshi', 'yinweisuoyi', 'budanerqie', 'zhiyoucai']) {
    assert.equal(CloudCopy.find(k), null, 'шаблон остался словом кода: ' + k);
  }
});

t('каталог: в новые коды не попадают частицы и односимвольные ключи', () => {
  assert.ok(CloudCopy.WORDS.length >= 300, 'слов для кода ' + CloudCopy.WORDS.length);
  for (const w of CloudCopy.WORDS) {
    assert.ok(w.key.length >= 2, 'ключ в одну букву: ' + w.key + ' ' + w.hanzi);
    assert.ok(!/частиц/i.test(CloudCopy.gloss(w.ru)), 'частица в коде: ' + w.hanzi);
    assert.ok(CloudCopy.KNOWN.includes(w), 'слово кода вне узнаваемых: ' + w.key);
  }
  /* но узнать их на входе модуль обязан: код из прежнего каталога должен открываться */
  for (const k of ['le', 'ne', 'a', 'e']) assert.ok(CloudCopy.find(k), 'перестал узнаваться: ' + k);
  assert.ok(!CloudCopy.WORDS.some(w => w.key === 'a'), '啊 предлагается в коде');
  /* уровень лексики — только HSK 1–3 */
  for (const w of CloudCopy.KNOWN) assert.ok([1, 2, 3].includes(w.lvl), 'слово вне HSK 1–3: ' + w.hanzi);
});

t('каталог: неизменяем, ключ ведёт ровно к одному слову', () => {
  const n = CloudCopy.WORDS.length, first = CloudCopy.WORDS[0];
  assert.throws(() => { CloudCopy.WORDS.push({ key: 'zzz' }); }, /.*/);
  assert.throws(() => { CloudCopy.WORDS[0].hanzi = '龙'; }, /.*/);
  assert.equal(CloudCopy.WORDS.length, n, 'каталог изменился');
  assert.equal(CloudCopy.WORDS[0], first);
  assert.equal(CloudCopy.WORDS[0].hanzi, first.hanzi);
  /* обратная однозначность: у каждого слова ровно один ключ и наоборот */
  const byHanzi = new Map();
  for (const w of CloudCopy.KNOWN) {
    assert.equal(CloudCopy.find(w.key), w);
    assert.ok(!byHanzi.has(w.hanzi), 'один иероглиф под двумя ключами: ' + w.hanzi);
    byHanzi.set(w.hanzi, w);
  }
});

/* ── пустое и кривое состояние ────────────────────────────────────────── */
t('pack: не падает на пустом и странном состоянии', () => {
  for (const st of [undefined, null, {}, 0, 'нет', [], { attempts: 'нет' }, { settings: null }]) {
    const p = CloudCopy.pack(st, 5);
    assert.deepEqual(p.attempts, []);
    assert.deepEqual(p.decks, []);
    assert.deepEqual(p.cards, []);
    assert.equal(p.app, 'zika');
    assert.equal(p.at, 5);
  }
  /* попытка без questions, вопрос без cardId, попытка без ts — слепок всё равно собирается */
  const weird = {
    attempts: [{ id: 'b2' }, null, { id: 'b1', ts: 0, questions: [{ hanzi: '猫' }] }, { ts: 7, questions: null }],
    settings: {}, decks: [], cards: [],
  };
  const p = CloudCopy.pack(weird, 1);
  assert.equal(p.attempts.length, 4);
  assert.equal(JSON.stringify(p), JSON.stringify(CloudCopy.pack({
    attempts: [{ ts: 7, questions: null }, { id: 'b1', ts: 0, questions: [{ hanzi: '猫' }] }, null, { id: 'b2' }],
    settings: {}, decks: [], cards: [],
  }, 1)), 'порядок кривых попыток изменил слепок');
  /* нечисловая метка времени не протекает в слепок */
  assert.equal(CloudCopy.pack({}, NaN).at, 0);
  assert.equal(CloudCopy.pack({}, undefined).at > 0, true);
});

t('парсер и ключ: не падают на пустом вводе и мусоре', async () => {
  for (const v of [undefined, null, '', '   ', 123, '!!!', '一二三']) {
    const d = CloudCopy.parseDetail(v);
    assert.equal(d.ok, false);
    assert.ok(d.error, 'нет объяснения для ' + JSON.stringify(v));
    assert.equal(d.words, null);
  }
  assert.equal(CloudCopy.find(undefined), null);
  assert.equal(CloudCopy.find(''), null);
  assert.equal(CloudCopy.find('!!'), null);
  assert.equal(CloudCopy.normKey(null), '');
  await assert.rejects(() => CloudCopy.deriveKey([{}, {}, {}, {}, {}, {}]), /Пустое слово/);
});

t('unpack: массив вместо настроек — повреждение', () => {
  assert.throws(() => CloudCopy.unpack({ app: 'zika', decks: [], cards: [], attempts: [], settings: [] }), /настройк/i);
  const u = CloudCopy.unpack({ app: 'zika', decks: [], cards: [], attempts: [] });
  assert.deepEqual(u.settings, {});
  assert.equal(u.campaign, null);
  assert.equal(u.at, 0);
});

/* ── чистота ──────────────────────────────────────────────────────────── */
t('makeCode: вырожденный источник обрывается ошибкой, а не виснет', () => {
  assert.throws(() => CloudCopy.makeCode(() => 0.5), /разных слов/);
  assert.throws(() => CloudCopy.makeCode(() => NaN), /не число/);
  assert.throws(() => CloudCopy.makeCode(tape([0.1, 0.2]), 6), /разных слов/);
  /* размер кода — аргумент, состояние модуля от этого не меняется */
  assert.equal(CloudCopy.makeCode(tape([0.1, 0.5]), 2).length, 2);
  assert.equal(CloudCopy.makeCode(tape([0.01, 0.5, 0.77, 0.12, 0.93, 0.34])).length, 6);
});

t('чистота: порядок вызовов ни на что не влияет', async () => {
  const words = CloudCopy.WORDS.length, known = CloudCopy.KNOWN.length;
  const st = stateOf([A[1], A[0], A[2]]);
  const snapBefore = JSON.stringify(CloudCopy.pack(st, 3));
  const idBefore = (await CloudCopy.deriveKey(CODE)).id;

  /* между двумя одинаковыми вопросами делаем всё остальное, что модуль умеет */
  CloudCopy.makeCode(tape([0.3, 0.6, 0.9, 0.1, 0.4, 0.7]));
  CloudCopy.parse('mao shui tian ren nuer luyou');
  CloudCopy.parseDetail('чепуха');
  const { key } = await CloudCopy.deriveKey(['mao', 'shui', 'tian', 'ren', 'nuer', 'diannao']);
  await CloudCopy.encrypt(key, CloudCopy.pack(st, 3));
  const net = fakeNet();
  await CloudCopy.save({ url: 'https://x', fetch: net.fn }, CODE, st, 3);

  assert.equal(JSON.stringify(CloudCopy.pack(st, 3)), snapBefore, 'слепок поплыл от вызовов между');
  assert.equal((await CloudCopy.deriveKey(CODE)).id, idBefore, 'id поплыл');
  assert.equal(CloudCopy.WORDS.length, words, 'каталог поплыл');
  assert.equal(CloudCopy.KNOWN.length, known, 'узнаваемые поплыли');
  assert.equal(JSON.stringify(st), JSON.stringify(stateOf([A[1], A[0], A[2]])), 'состояние изменено');
});

t('сеть: fetch берётся из аргумента, без скрытого состояния модуля', async () => {
  CloudCopy.setFetch(null);
  const net = fakeNet();
  const conf = { url: 'https://worker.example', fetch: net.fn };
  await CloudCopy.save(conf, CODE, stateOf(A), 55);
  const back = await CloudCopy.load(conf, CODE);
  assert.equal(back.at, 55);
  assert.deepEqual(back.attempts.map(x => x.id), ['a1', 'a2', 'a3']);
  assert.equal(net.calls.length, 2);
  /* адрес хранилища обязателен: без него запрос не уходит никуда */
  await assert.rejects(() => CloudCopy.put({ fetch: net.fn }, 'id', 'blob'), /адрес/);
  assert.equal(net.calls.length, 2, 'запрос ушёл без адреса');
});

/* ── прогон ───────────────────────────────────────────────────────────── */
for (const [name, fn] of tests) {
  try { await fn(); ok++; }
  catch (e) { bad++; console.error('FAIL', name, '—', e.message); }
}
console.log(`\ncloudcopy: ${ok} прошло, ${bad} FAIL, слов в коде — ${CloudCopy.WORDS.length}`);
if (bad) process.exitCode = 1;
