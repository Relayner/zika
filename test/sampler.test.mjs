/* Проверка сэмплера: подслучаи, точность узлов, независимость от порядка чтения журнала, отбор. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
global.window = global;
for (const f of ['pinyin', 'sampler']) require('../src/js/' + f + '.js');
const { Sampler } = global;

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL', name, e.message); process.exitCode = 1; } };

const DAY = 24 * 3600e3;
const NOW = Date.UTC(2026, 8, 12, 12, 0, 0);
/* попытка: qs — [cardId, fraction, доп. поля вопроса] */
const att = (id, ts, mode, show, guess, qs) => ({
  id, ts, endedAt: ts + 60e3, mode, show, guess, deckIds: ['hsk1'], total: qs.length, aborted: false,
  questions: qs.map(([cardId, f, extra]) => Object.assign({ cardId, hanzi: '爱', pinyin: 'ài', ru: 'любить', show, guess, answer: {}, fraction: f, ok: f === 1 }, extra || {})),
});
const card = id => ({ id, deckId: 'hsk1', hanzi: '字' + id, pinyin: 'zì', ru: 'знак ' + id });
const keys = list => list.map(x => x.card.id + '|' + x.sub);
const snap = v => JSON.stringify(v);

/* ── подслучай выводится из вопроса ── */
t('подслучаи quiz/listen/write/hand', () => {
  const S = Sampler.subOf;
  assert.equal(S({ mode: 'quiz' }, { show: 'hanzi', guess: ['ru'] }), 'read');
  assert.equal(S({ mode: 'quiz' }, { show: 'hanzi', guess: ['pinyin'] }), 'say');
  assert.equal(S({ mode: 'quiz' }, { show: 'hanzi', guess: ['pinyin', 'ru'] }), 'read');
  assert.equal(S({ mode: 'quiz' }, { show: 'ru', guess: ['hanzi'] }), 'ru2zh');
  assert.equal(S({ mode: 'flip' }, { show: 'ru', guess: ['hanzi', 'pinyin'] }), 'ru2zh');
  assert.equal(S({ mode: 'listen' }, { show: 'audio', guess: ['answer'] }), 'listen');
  assert.equal(S({ mode: 'quiz' }, { show: 'audio', guess: ['ru'] }), 'listen', 'звук важнее того, что спрашивают');
  assert.equal(S({ mode: 'write' }, { show: 'both', guess: ['hanzi'] }), 'type');
  assert.equal(S({ mode: 'write' }, { show: 'ru', guess: ['hanzi'] }), 'type');
  assert.equal(S({ mode: 'write' }, { show: 'audio', guess: ['hanzi'] }), 'type', 'диктант — всё равно набор');
  assert.equal(S({ mode: 'hand' }, { show: 'hand', guess: ['stroke'] }), 'hand');
  assert.equal(S({ mode: 'hsk', show: 'exam' }, { show: 'hp', guess: ['ru'] }), 'read');
  assert.equal(S({ mode: 'hsk', show: 'exam' }, { show: 'both', guess: ['hanzi'] }), 'type');
  assert.equal(S({ mode: 'phon' }, { show: 'audio', guess: ['answer'] }), 'listen');
  /* поля вопроса перекрывают поля попытки, но при их отсутствии берём попытку */
  assert.equal(S({ mode: 'quiz', show: 'ru', guess: ['hanzi'] }, { cardId: 'x' }), 'ru2zh');
});

/* ── журнал для остальных проверок ── */
const log = [
  att('a1', NOW - 9 * DAY, 'quiz', 'hanzi', ['ru'], [['hsk1:爱', 1], ['hsk1:八', 0]]),
  att('a2', NOW - 6 * DAY, 'listen', 'audio', ['answer'], [['hsk1:爱', 0, { parts: { answer: 'wrong' } }], ['hsk1:爱', 0.5, { parts: { answer: 'tones' } }]]),
  att('a3', NOW - 3 * DAY, 'quiz', 'hanzi', ['ru'], [['hsk1:爱', 0], ['hsk1:八', 1]]),
  att('a4', NOW - 1 * DAY, 'write', 'ru', ['hanzi'], [['hsk1:八', 1], ['hsk1:不', 0, { parts: { hanzi: 'wrong' } }]]),
  att('a5', NOW - 2 * 3600e3, 'listen', 'audio', ['answer'], [['hsk1:爱', 0, { parts: { answer: 'wrong' } }]]),
];

t('nodeStats не зависит от порядка чтения журнала', () => {
  const base = Sampler.nodeStats(log, NOW);
  const orders = [
    log.slice().reverse(),
    [log[2], log[0], log[4], log[1], log[3]],
    [log[4], log[3], log[2], log[1], log[0]],
    [log[1], log[4], log[0], log[3], log[2]],
  ];
  for (const o of orders) assert.deepStrictEqual(Sampler.nodeStats(o, NOW), base, 'перемешанный журнал даёт тот же результат');
  /* и пересчёт с нуля дважды тоже */
  assert.deepStrictEqual(Sampler.nodeStats(log, NOW), base);
});

t('nodeStats не трогает входные данные', () => {
  const before = snap(log);
  Sampler.nodeStats(log, NOW);
  Sampler.recentKeys(log, DAY, NOW);
  assert.equal(snap(log), before, 'журнал остался прежним');
});

t('точность, серии и ловушки узла', () => {
  const st = Sampler.nodeStats(log, NOW);
  const ai = st['hsk1:爱'];
  assert.equal(ai.n, 5);
  assert.equal(ai.by.read.n, 2);
  assert.equal(ai.by.read.ok, 1);
  assert.equal(ai.by.read.wrong, 1);
  /* read: [1, 0] по времени, веса 1 (последний) и 0.92 */
  assert.ok(Math.abs(ai.by.read.acc - (0 * 1 + 1 * 0.92) / 1.92) < 1e-12, 'скользящая точность с весами 0.92^i');
  assert.equal(ai.by.read.streak, -1, 'последний ответ мимо');
  /* listen: [0, 0.5, 0] */
  assert.equal(ai.by.listen.n, 3);
  assert.ok(Math.abs(ai.by.listen.acc - (0 + 0.5 * 0.92 + 0 * 0.8464) / (1 + 0.92 + 0.8464)) < 1e-12);
  assert.equal(ai.by.listen.streak, -3, 'три ответа подряд не в полную силу — серия со знаком минус');
  assert.equal(ai.last, NOW - 2 * 3600e3);
  assert.equal(ai.traps.tone, 1, 'тоны не те — отдельная ловушка');
  assert.equal(ai.traps.listen, 2, 'на слух мимо дважды');
  const ba = st['hsk1:八'];
  assert.equal(ba.by.read.streak, 1, 'подряд верные считаются со знаком плюс');
  assert.equal(ba.by.type.n, 1);
  assert.equal(st['hsk1:不'].traps.hanzi, 1);
  /* вопросы без cardId в статистику не попадают */
  const noCard = Sampler.nodeStats([{ id: 'x', ts: NOW - DAY, mode: 'phon', questions: [{ hanzi: 'ā', ok: true }] }], NOW);
  assert.deepStrictEqual(noCard, {});
  /* записи позже now не учитываются — пересчёт «как было» честный */
  const past = Sampler.nodeStats(log, NOW - 5 * DAY);
  assert.equal(past['hsk1:爱'].n, 3);
  assert.equal(past['hsk1:八'].n, 1);
});

t('recentKeys — окно по ключам пар', () => {
  const day = Sampler.recentKeys(log, DAY, NOW);
  assert.ok(day.has('hsk1:爱|listen'));
  assert.ok(day.has('hsk1:八|type'));
  assert.ok(!day.has('hsk1:爱|read'), 'read был три дня назад');
  assert.equal(day.size, 3);
  const wide = Sampler.recentKeys(log, 10 * DAY, NOW);
  assert.deepEqual([...wide].sort(), ['hsk1:不|type', 'hsk1:八|read', 'hsk1:八|type', 'hsk1:爱|listen', 'hsk1:爱|read'].sort());
  assert.equal(Sampler.recentKeys(log, DAY, NOW - 30 * DAY).size, 0, 'будущее в окно не попадает');
});

/* ── отбор ── */
t('провал поднимает узел, успех опускает', () => {
  const cards = [card('A'), card('B')];
  const hist = [
    att('h1', NOW - 5 * DAY, 'quiz', 'hanzi', ['pinyin'], [['A', 1], ['B', 1]]),          /* say обоим одинаково */
    att('h2', NOW - 4 * DAY, 'quiz', 'hanzi', ['ru'], [['A', 0], ['B', 1]]),              /* read: A мимо, B верно */
  ];
  const st = Sampler.nodeStats(hist, NOW);
  assert.ok(st.A.by.read.acc < st.B.by.read.acc);
  const got = keys(Sampler.pick(cards, st, { count: 4, subs: ['read', 'say'], now: NOW, cooldownMs: 0 }));
  assert.equal(got.length, 4);
  assert.equal(got[0], 'A|read', 'проваленный узел идёт первым');
  assert.ok(got.indexOf('A|read') < got.indexOf('B|read'), 'тот же узел у B ниже');
  assert.equal(got[got.length - 1], 'B|read', 'успешный узел — в самом хвосте');
});

t('успех отпускает узел ниже нетронутых слов', () => {
  /* поле: один проваленный узел и пять слов, которых не спрашивали вовсе */
  const cards = [card('A')].concat(Array.from({ length: 5 }, (_, i) => card('f' + i)));
  const fail = [att('h1', NOW - 4 * DAY, 'quiz', 'hanzi', ['ru'], [['A', 0]])];
  const opts = { count: 6, subs: ['read'], now: NOW, cooldownMs: 0 };
  assert.equal(keys(Sampler.pick(cards, Sampler.nodeStats(fail, NOW), opts))[0], 'A|read', 'проваленное слово впереди новых');
  const one = fail.concat([att('h2', NOW - 3 * DAY, 'quiz', 'hanzi', ['ru'], [['A', 1]])]);
  assert.ok(keys(Sampler.pick(cards, Sampler.nodeStats(one, NOW), opts)).indexOf('A|read') > 0, 'после успеха уже не первое');
  const two = one.concat([att('h3', NOW - 2 * DAY, 'quiz', 'hanzi', ['ru'], [['A', 1]])]);
  assert.equal(keys(Sampler.pick(cards, Sampler.nodeStats(two, NOW), opts)).pop(), 'A|read', 'два успеха подряд — узел отпущен в самый хвост');
});

t('слово возвращается другим заданием', () => {
  const cards = [card('A')];
  const st = Sampler.nodeStats([att('h1', NOW - 4 * DAY, 'quiz', 'hanzi', ['ru'], [['A', 0]])], NOW);
  const first = Sampler.pick(cards, st, { count: 1, subs: ['read', 'say'], now: NOW, cooldownMs: 0 })[0];
  assert.equal(first.sub, 'say', 'после провала в read сперва спросим иначе');
});

t('внутри сессии пара cardId|sub не повторяется', () => {
  const cards = Array.from({ length: 12 }, (_, i) => card('c' + i));
  const st = Sampler.nodeStats(log, NOW);
  const got = keys(Sampler.pick(cards, st, { count: 20, now: NOW }));
  assert.equal(got.length, 20);
  assert.equal(new Set(got).size, 20, 'дублей нет');
  const ids = new Set(got.map(k => k.split('|')[0]));
  assert.ok(ids.size >= 8, 'сессия не залипает на двух словах: ' + ids.size);
});

t('маленький пул: 3 слова и 20 вопросов — ровно 20, без зацикливания', () => {
  const cards = [card('A'), card('B'), card('C')];
  const st = Sampler.nodeStats([att('h1', NOW - 30 * 60e3, 'quiz', 'hanzi', ['ru'], [['A', 0], ['B', 1], ['C', 0]])], NOW);
  const got = keys(Sampler.pick(cards, st, { count: 20, now: NOW }));
  assert.equal(got.length, 20, 'вернулось ровно столько, сколько просили');
  assert.equal(new Set(got.slice(0, 18)).size, 18, 'сначала выбраны все 18 уникальных пар');
  assert.equal(new Set(got).size, 18, 'повторы начинаются только после исчерпания пар');
  /* просьба на 200 вопросов тоже не вешает функцию */
  assert.equal(Sampler.pick(cards, st, { count: 200, now: NOW }).length, 200);
  assert.deepEqual(Sampler.pick([], st, { count: 5, now: NOW }), [], 'пустой пул — пустой список');
});

t('порог недавнего ослабляется, а не ломается', () => {
  const cards = Array.from({ length: 12 }, (_, i) => card('c' + i));
  /* десять из двенадцати спрошены час назад */
  const hist = [att('h1', NOW - 3600e3, 'quiz', 'hanzi', ['ru'], Array.from({ length: 10 }, (_, i) => ['c' + i, 0]))];
  const st = Sampler.nodeStats(hist, NOW);
  const free = Sampler.pick(cards, st, { count: 2, subs: ['read'], now: NOW });
  assert.deepEqual(new Set(keys(free)), new Set(['c10|read', 'c11|read']), 'пока есть нетронутые — берём их');
  const all = keys(Sampler.pick(cards, st, { count: 12, subs: ['read'], now: NOW }));
  assert.equal(all.length, 12, 'пул исчерпан — порог ослаблен, а не отказ');
  assert.equal(new Set(all).size, 12);
  assert.deepEqual(new Set(all.slice(0, 2)), new Set(['c10|read', 'c11|read']), 'недавние всё равно уходят в конец');
  /* явный список недавних ключей учитывается так же */
  const banned = Sampler.recentKeys(hist, DAY, NOW);
  const withBan = keys(Sampler.pick(cards, st, { count: 1, subs: ['read'], now: NOW, cooldownMs: 0, recent: banned }));
  assert.equal(withBan.length, 1);
});

t('pick — чистая функция: тот же вход, тот же выход', () => {
  const cards = Array.from({ length: 8 }, (_, i) => card('c' + i));
  const st = Sampler.nodeStats(log, NOW);
  const before = snap(st);
  const a = keys(Sampler.pick(cards, st, { count: 10, now: NOW }));
  const b = keys(Sampler.pick(cards, st, { count: 10, now: NOW }));
  assert.deepEqual(a, b, 'повтор даёт тот же порядок');
  assert.equal(snap(st), before, 'статистика не мутирована');
  /* статистика, пересчитанная из перемешанного журнала, даёт тот же отбор */
  const st2 = Sampler.nodeStats(log.slice().reverse(), NOW);
  assert.deepEqual(keys(Sampler.pick(cards, st2, { count: 10, now: NOW })), a);
  /* seed меняет только дрожание, но остаётся детерминированным */
  const s1 = keys(Sampler.pick(cards, st, { count: 10, now: NOW, seed: 7 }));
  assert.deepEqual(s1, keys(Sampler.pick(cards, st, { count: 10, now: NOW, seed: 7 })));
});

t('explain — короткая справка по-русски', () => {
  const hist = [
    att('e1', NOW - 6 * DAY, 'quiz', 'hanzi', ['ru'], [['A', 1], ['A', 1], ['A', 1]]),
    att('e2', NOW - 5 * DAY, 'listen', 'audio', ['answer'], [['A', 0], ['A', 1], ['A', 0], ['A', 1], ['A', 0]]),
  ];
  const st = Sampler.nodeStats(hist, NOW);
  const s = Sampler.explain(st, 'A');
  assert.equal(s, 'читаете уверенно, на слух мимо 3 из 5');
  assert.equal(Sampler.explain(st, 'нет-такой'), 'ещё не спрашивали');
  assert.equal(Sampler.explain({}, 'A'), 'ещё не спрашивали');
  const mid = Sampler.nodeStats([att('e3', NOW - DAY, 'quiz', 'hanzi', ['ru'], [['B', 1], ['B', 1], ['B', 0], ['B', 1]])], NOW);
  assert.equal(Sampler.explain(mid, 'B'), 'читаете с запинкой');
});

t('пустой и кривой вход не валят сэмплер', () => {
  assert.deepStrictEqual(Sampler.nodeStats(undefined, NOW), {});
  assert.deepStrictEqual(Sampler.nodeStats([{ id: 'x' }, null], NOW), {});
  assert.equal(Sampler.recentKeys(null, DAY, NOW).size, 0);
  assert.deepEqual(Sampler.pick(null, null, { count: 3, now: NOW }), []);
  assert.deepEqual(Sampler.pick([card('A')], null, { count: 0, now: NOW }), []);
  /* карточка может уметь не все подслучаи */
  const only = Sampler.pick([Object.assign(card('A'), { subs: ['listen'] })], {}, { count: 3, now: NOW });
  assert.deepEqual(keys(only), ['A|listen', 'A|listen', 'A|listen']);
});

/* ── подслучай на реальных записях приложения ── */
t('подслучай по тому, что кладут views-*', () => {
  const S = Sampler.subOf;
  /* письмо от руки: у вопроса нет ни show, ни guess — берём поля попытки (views-hand.js) */
  assert.equal(S({ mode: 'hand', show: 'hand', guess: ['stroke'] }, { cardId: 'x', hanzi: '爱', ok: true }), 'hand');
  /* слово в предложение (quiz.js buildSentence) — это чтение, а не набор */
  assert.equal(S({ mode: 'quiz' }, { show: 'sentence', guess: ['answer'] }), 'read');
  /* раздел «письмо» экзамена HSK: показывают иероглиф с пиньинем, просят вписать знак */
  assert.equal(S({ mode: 'hsk', show: 'exam', guess: [] }, { show: 'both', guess: ['hanzi'] }), 'type');
  /* пустой guess вопроса — отсутствие данных, а не ответ: не должен затирать guess попытки */
  assert.equal(S({ mode: 'quiz', show: 'ru', guess: ['hanzi'] }, { guess: [] }), 'ru2zh');
  assert.equal(S({ mode: 'quiz', show: 'audio', guess: ['answer'] }, { show: '', guess: [] }), 'listen');
  /* спринт, бой и поток кладут questions: [] — до subOf дело не доходит, но падать нельзя */
  assert.equal(S({ mode: 'sprint', show: 'program', guess: ['all'] }, null), 'read');
  assert.equal(S(null, null), 'read');
});

t('подписи подслучаев: иероглифы и русский, без повторов', () => {
  const seen = new Set();
  for (const sub of Sampler.SUBS) {
    const L = Sampler.LABELS[sub];
    assert.ok(L, 'нет подписи для ' + sub);
    assert.match(L.zh, /^[一-鿿]{1,2}$/, 'подпись должна быть иероглифами: ' + sub + ' → ' + L.zh);
    assert.match(L.ru, /^[а-яё ]+$/i, 'русская подпись: ' + sub + ' → ' + L.ru);
    assert.ok(!seen.has(L.zh), 'подписи не повторяются: ' + L.zh);
    seen.add(L.zh);
  }
  assert.equal(Sampler.LABELS.type.zh, '输入', 'набор с клавиатуры — 输入, не 写');
  assert.equal(Sampler.LABELS.hand.zh, '手写', 'от руки — 手写, одного 手 мало');
  assert.equal(Object.keys(Sampler.LABELS).length, Sampler.SUBS.length, 'лишних подписей нет');
});

t('одинаковый ts и попытки без id: порядок чтения всё равно не влияет', () => {
  const q = (cardId, f) => ({ cardId, fraction: f, ok: f === 1 });
  const a = { ts: NOW - DAY, mode: 'quiz', show: 'hanzi', guess: ['ru'], questions: [q('A', 1), q('A', 0)] };
  const b = { ts: NOW - DAY, mode: 'quiz', show: 'hanzi', guess: ['ru'], questions: [q('A', 0.5)] };
  assert.deepStrictEqual(Sampler.nodeStats([a, b], NOW), Sampler.nodeStats([b, a], NOW), 'без id и с равным ts — тот же результат');
});

t('порядок карточек на входе не влияет на отбор', () => {
  const cards = Array.from({ length: 9 }, (_, i) => card('c' + i));
  const st = Sampler.nodeStats(log, NOW);
  const a = keys(Sampler.pick(cards, st, { count: 12, now: NOW }));
  assert.deepEqual(keys(Sampler.pick(cards.slice().reverse(), st, { count: 12, now: NOW })), a);
});

t('явный список recent действует и при cooldownMs: 0', () => {
  const cards = [card('A'), card('B')];
  const opts = { subs: ['read'], now: NOW, cooldownMs: 0, recent: new Set(['A|read']) };
  assert.deepEqual(keys(Sampler.pick(cards, {}, Object.assign({ count: 1 }, opts))), ['B|read'], 'запрещённую пару не берём, пока есть свободные');
  assert.deepEqual(keys(Sampler.pick(cards, {}, Object.assign({ count: 2 }, opts))), ['B|read', 'A|read'], 'запрет уступает, только когда свободных пар нет');
  /* список можно передать и массивом */
  assert.deepEqual(keys(Sampler.pick(cards, {}, { count: 1, subs: ['read'], now: NOW, cooldownMs: 0, recent: ['A|read'] })), ['B|read']);
});

t('кривой count не вешает отбор', () => {
  const cards = [card('A'), card('B')];
  assert.equal(Sampler.pick(cards, {}, { count: Infinity, now: NOW }).length, Sampler.MAX_PICK, 'бесконечность упирается в потолок');
  assert.deepEqual(Sampler.pick(cards, {}, { count: NaN, now: NOW }), [], 'NaN — пустой список, а не вечный цикл');
  assert.deepEqual(Sampler.pick(cards, {}, { count: -5, now: NOW }), []);
  assert.equal(Sampler.pick(cards, {}, { count: '4', now: NOW }).length, 4, 'число строкой тоже понимаем');
  assert.equal(Sampler.pick(cards, {}, undefined).length, 20, 'без настроек — 20 вопросов по умолчанию');
  assert.equal(new Set(keys(Sampler.pick(cards, {}, undefined))).size, 12, 'уникальных пар всего 12, дальше по кругу');
});

t('кривые записи журнала не роняют и не искажают статистику', () => {
  const base = { mode: 'quiz', show: 'hanzi', guess: ['ru'], ts: NOW - DAY };
  const weird = [
    Object.assign({ id: 'w1', questions: {} }, base),                                             /* questions не массив */
    Object.assign({ id: 'w2', questions: [{ cardId: 'A', fraction: 'мимо' }] }, base),            /* мусор вместо доли */
    Object.assign({ id: 'w3', questions: [{ cardId: 'A', fraction: 7, parts: 'wrong' }] }, base), /* доля вне диапазона, parts строкой */
    Object.assign({ id: 'w4', questions: [{ hanzi: '爱', ok: true }] }, base),                     /* вопрос без cardId */
    { id: 'w5', questions: [{ cardId: 'A', fraction: 1 }] },                                       /* попытка без времени */
    null, 'мусор', 42,
  ];
  const st = Sampler.nodeStats(weird, NOW);
  assert.deepEqual(Object.keys(st), ['A']);
  assert.equal(st.A.by.read.n, 2, 'учтены только два разборчивых вопроса');
  assert.equal(st.A.by.read.ok, 1, 'доля 7 обрезана до единицы');
  assert.equal(st.A.by.read.wrong, 1, 'мусор вместо доли — как ноль');
  assert.ok(st.A.by.read.acc >= 0 && st.A.by.read.acc <= 1, 'точность остаётся в пределах 0..1');
  assert.equal(Sampler.recentKeys(weird, DAY, NOW).size, 1);
  assert.equal(Sampler.nodeStats({ }, NOW) && Object.keys(Sampler.nodeStats({}, NOW)).length, 0, 'не массив — пустая статистика');
  assert.deepEqual(Sampler.pick('не массив', 'не объект', { count: 2, now: NOW }), []);
  assert.equal(Sampler.explain('не объект', 'A'), 'ещё не спрашивали');
});

t('модуль грузится и в браузере, и под node', () => {
  const src = readFileSync(new URL('../src/js/sampler.js', import.meta.url), 'utf8');
  assert.match(src, /window\.Sampler = \(\(\) => \{/, 'стиль соседей: window.X = (() => { ... })()');
  assert.deepEqual(src.match(/window\.[A-Za-z_$]+/g), ['window.Sampler'], 'в window пишем ровно одно имя');
  assert.ok(!/^\s*(import|export)\s/m.test(src), 'без import/export — модуль склеивается сборкой');
  assert.ok(!/\bdocument\b|\blocalStorage\b|\bfetch\s*\(|location\./.test(src), 'без DOM, хранилища и сети');
  assert.ok(!/Math\.random\s*\(/.test(src), 'случайность сделала бы отбор нечистым');
  assert.ok(!/\bnew Date\(\)/.test(src), 'время приходит аргументом now, а не берётся само');
});

console.log(process.exitCode ? 'SOME TESTS FAILED' : 'sampler: ' + n + ' групп пройдено, 0 FAIL');
