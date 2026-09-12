/* Проверка модуля «Где тонко»: зона, шаги и промер дня.
   Запуск: node test/gaps.test.mjs — ноль строк FAIL обязателен. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
global.window = global;
for (const f of ['hsk', 'freq', 'pinyin', 'stats', 'srs', 'boss', 'campaign', 'skill', 'program', 'phonetics', 'ledger', 'gaps'])
  require('../src/js/' + f + '.js');
const { Gaps, HSK, PROGRAM, PHON } = global;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, '—', e.message); } };

const DAY = 24 * 3600e3;
const NOW = new Date(2026, 8, 12, 12, 0, 0).getTime();   /* полдень: сутки не съезжают */

/* ── подготовка истории ── */
/* весь словарь HSK 1–3: слова идут широкой полосой, поэтому ни один блок не набирает веса */
const FREE = [...HSK[1], ...HSK[2], ...HSK[3]].map(e => e[0]);
const idOf = h => {
  for (const l of [1, 2, 3]) if (HSK[l].some(e => e[0] === h)) return 'hsk' + l + ':' + h;
  return null;
};
let seq = 0;
/* попытка: первые right слов отвечены верно, остальные — нет */
function att(o) {
  const words = o.words, right = o.right;
  const qs = words.map((h, i) => {
    const ok = i < right;
    const parts = ok ? { pinyin: 'exact', ru: 'exact' } : { pinyin: o.tones ? 'tones' : 'wrong', ru: 'wrong' };
    return { cardId: idOf(h), hanzi: h, pinyin: '', ru: '', show: 'hanzi', guess: ['ru'], answer: {}, parts, fraction: ok ? 1 : 0, ok, ms: 4000 };
  });
  return {
    id: 'a' + (++seq), ts: o.ts, endedAt: o.ts + 1e4, durationMs: 1e4,
    mode: o.mode, difficulty: o.difficulty || 'medium', level: 1,
    deckIds: o.deckIds || ['hsk1'], deckName: 'Проверка', show: 'hanzi', guess: ['ru'], order: 'random', timer: 0,
    total: words.length, planned: words.length, aborted: false,
    correct: right, partial: 0, wrong: words.length - right,
    percent: Math.round(right / words.length * 100), points: 10, questions: qs,
  };
}
/* пять дней подряд: слух, чтение, набор — каждый на своей порции слов */
function history({ listen, read, write, tones }) {
  const out = [];
  for (let d = 5; d >= 1; d--) {
    const w = n => FREE.slice((5 - d) * 48 + n, (5 - d) * 48 + n + 16);
    out.push(att({ mode: 'listen', ts: NOW - d * DAY, words: w(0), right: listen, tones }));
    out.push(att({ mode: 'quiz', ts: NOW - d * DAY + 3600e3, words: w(16), right: read }));
    out.push(att({ mode: 'write', ts: NOW - d * DAY + 7200e3, words: w(32), right: write }));
  }
  return out;
}
const clone = x => JSON.parse(JSON.stringify(x));
/* узкий банк для проверки кэша словаря: слова из разных блоков программы */
const NARROW = {};
[['我', 'wǒ', 'я'], ['你', 'nǐ', 'ты'], ['他', 'tā', 'он'], ['爸爸', 'bàba', 'папа'], ['米饭', 'mǐfàn', 'варёный рис'], ['星期', 'xīngqī', 'неделя']]
  .forEach(([h, p, ru]) => { NARROW['hsk1:' + h] = { id: 'hsk1:' + h, deckId: 'hsk1', hanzi: h, pinyin: p, ru }; });
const zid = z => z.kind + ':' + z.key;

/* ── зона ── */
t('слабейшая зона — слух, и она предсказуема', () => {
  const state = { attempts: history({ listen: 4, read: 14, write: 15 }), settings: {} };
  const rows = Gaps.thin(state, NOW);
  assert.ok(rows.length >= 3, 'зон должно быть несколько');
  assert.equal(zid(rows[0]), 'skill:listen', 'ведёт слух, а не ' + zid(rows[0]));
  assert.ok(rows[0].thin > rows[1].thin, 'лидер должен быть выше следующего');
  assert.ok(rows.every(r => r.why && r.why.length > 3), 'у каждой зоны своя причина');
  assert.ok(/\d/.test(rows[0].why), 'в причине есть число: ' + rows[0].why);
  assert.ok(rows.every(r => r.thin >= 0 && r.thin <= 3), 'thin вне диапазона');
});

t('мало данных — зона не кричит (λ)', () => {
  const few = { attempts: [att({ mode: 'listen', ts: NOW - DAY, words: FREE.slice(0, 6), right: 0 })], settings: {} };
  const many = { attempts: history({ listen: 0, read: 14, write: 15 }), settings: {} };
  const a = Gaps.thin(few, NOW).find(r => zid(r) === 'skill:listen');
  const b = Gaps.thin(many, NOW).find(r => zid(r) === 'skill:listen');
  assert.ok(a && b, 'зона слуха есть в обоих случаях');
  assert.ok(a.thin < b.thin, 'шесть ответов не должны весить как восемьдесят');
  assert.ok(a.lam < 0.3 && b.lam === 1, 'λ считается от объёма данных');
});

t('гистерезис держит зону при разнице меньше 0.10', () => {
  /* слух 50%, чтение 56% — разрыв мал */
  const attempts = history({ listen: 8, read: 9, write: 15 });
  const free = { attempts, settings: {} };
  const rows = Gaps.thin(free, NOW);
  assert.equal(zid(rows[0]), 'skill:listen');
  const read = rows.find(r => zid(r) === 'skill:read');
  const gap = rows[0].thin - read.thin;
  assert.ok(gap > 0 && gap < Gaps.SWITCH, 'разрыв должен быть меньше порога, а он ' + gap);
  const held = Gaps.thin({ attempts, settings: { v2: { zone: 'read' } } }, NOW);
  assert.equal(zid(held[0]), 'skill:read', 'зона не должна скакать при малом перевесе');
  assert.equal(held[0].current, true, 'удержанная зона помечена как текущая');
  /* запись зоны понимается в любом виде */
  for (const z of ['read', 'skill:read', { kind: 'skill', key: 'read' }])
    assert.equal(zid(Gaps.thin({ attempts, settings: { v2: { zone: z } } }, NOW)[0]), 'skill:read', 'не понята запись зоны ' + JSON.stringify(z));
  /* зона, по которой данных больше нет, порядок не ломает */
  assert.equal(zid(Gaps.thin({ attempts, settings: { v2: { zone: 'b4-20' } } }, NOW)[0]), 'skill:listen');
});

t('при явном перевесе зона меняется', () => {
  const attempts = history({ listen: 4, read: 15, write: 15 });
  const rows = Gaps.thin({ attempts, settings: {} }, NOW);
  const read = rows.find(r => zid(r) === 'skill:read');
  assert.ok(rows[0].thin - read.thin >= Gaps.SWITCH, 'перевес должен быть не меньше порога');
  const moved = Gaps.thin({ attempts, settings: { v2: { zone: 'read' } } }, NOW);
  assert.equal(zid(moved[0]), 'skill:listen', 'явно более тонкая зона забирает первое место');
});

t('зона-блок появляется и объясняется словами блока', () => {
  const b = PROGRAM.byId('b1-02');
  const attempts = [];
  for (let d = 4; d >= 1; d--)
    attempts.push(att({ mode: 'quiz', ts: NOW - d * DAY, words: b.words.slice(0, 10), right: 3 }));
  const rows = Gaps.thin({ attempts, settings: {} }, NOW);
  const row = rows.find(r => r.kind === 'block' && r.key === 'b1-02');
  assert.ok(row, 'блок должен стать зоной');
  assert.ok(row.ru.includes(b.ru), 'название зоны — по-русски: ' + row.ru);
  assert.ok(/\d/.test(row.why), 'причина с числом: ' + row.why);
});

/* ── шаги ── */
t('не больше трёх шагов, по одному на зону, у каждого причина', () => {
  const state = { attempts: history({ listen: 4, read: 8, write: 10 }), settings: {} };
  const steps = Gaps.recommend(state, NOW);
  assert.ok(steps.length >= 1 && steps.length <= 3, 'шагов от одного до трёх, а их ' + steps.length);
  const zones = steps.map(s => s.zone);
  assert.equal(new Set(zones).size, zones.length, 'две рекомендации на одну зону: ' + zones.join(', '));
  for (const s of steps) {
    assert.ok(['review', 'drill', 'sprint', 'phon', 'hand', 'boss', 'probe'].includes(s.t), 'неизвестный тип шага ' + s.t);
    assert.ok(s.why && s.why.trim().length > 5, 'пустая причина у шага ' + s.t);
    assert.ok(/\d/.test(s.why), 'причина без чисел: ' + s.why);
    assert.ok(s.go && s.go.t, 'шагу нужен переход');
    assert.ok(s.ru && s.ru.length > 2, 'шагу нужно название');
  }
});

t('просроченное идёт первым и считается точно', () => {
  const attempts = history({ listen: 10, read: 10, write: 10 });
  const srs = {};
  const ids = FREE.slice(0, 12).map(idOf);
  ids.forEach((id, i) => { srs[id] = { step: 2, due: NOW - (i < 4 ? 5 : 1) * DAY, seen: 3, last: NOW - 9 * DAY }; });
  const steps = Gaps.recommend({ attempts, settings: { srs } }, NOW);
  assert.equal(steps[0].t, 'review', 'первым — долг по повторению');
  assert.ok(steps[0].why.includes('12'), 'в причине число просроченных: ' + steps[0].why);
  assert.ok(steps[0].why.includes('4'), 'и сколько из них давние: ' + steps[0].why);
});

t('шаг по блоку ведёт в спринт этого блока', () => {
  const b = PROGRAM.byId('b1-03');
  const attempts = [];
  for (let d = 5; d >= 1; d--)
    attempts.push(att({ mode: 'sprint', ts: NOW - d * DAY, words: b.words.slice(0, 8), right: 2 }));
  attempts.forEach(a => { a.block = b.id; });
  const steps = Gaps.recommend({ attempts, settings: {} }, NOW);
  const sp = steps.find(s => s.t === 'sprint');
  assert.ok(sp, 'спринт должен попасть в шаги: ' + steps.map(s => s.t).join(', '));
  assert.equal(sp.go.blockId, b.id);
  assert.ok(sp.why.includes(String(b.words.length)) || /\d+%/.test(sp.why), 'причина опирается на числа блока: ' + sp.why);
});

/* ── промер дня ── */
function probeState() {
  const attempts = history({ listen: 6, read: 10, write: 12 });
  /* вчерашняя лента и свежие ошибки */
  attempts.push(att({ mode: 'sprint', ts: NOW - DAY + 3e6, words: PROGRAM.byId('b1-01').words.slice(0, 8), right: 5 }));
  attempts.push(att({ mode: 'quiz', ts: NOW - 2 * 3600e3, words: FREE.slice(200, 206), right: 1 }));
  const srs = {};
  FREE.slice(0, 20).forEach((h, i) => { srs[idOf(h)] = { step: 2, due: NOW - (i + 1) * DAY, seen: 4, last: NOW - 20 * DAY }; });
  return { attempts, settings: { srs } };
}
t('промер: шесть заданий, классы, слух и тон', () => {
  const p = Gaps.probe(probeState(), NOW);
  assert.ok(p.length > 0 && p.length <= 6, 'от одного до шести заданий, а их ' + p.length);
  assert.equal(new Set(p.map(x => x.cardId)).size, p.length, 'слова в промере не повторяются');
  assert.ok(p.every(x => x.cardId && x.sub && x.cls && x.why && /\S/.test(x.why)), 'у задания должны быть слово, вид, класс и причина');
  assert.ok(p.some(x => x.sub === 'listen'), 'одно задание — на слух');
  assert.ok(p.some(x => x.sub === 'tone'), 'одно задание — на тон');
  assert.ok(p.some(x => x.cls === 'hot'), 'горящее слово должно попасть в промер');
  assert.ok(p.some(x => x.cls === 'morning'), 'слово вчерашней ленты должно попасть в промер');
  assert.equal(p.filter(x => x.sub === 'recall').length, 4, 'четыре задания по классам выбора');
});

t('промер не берёт вчерашние слова и не грузит один блок', () => {
  const st = probeState();
  const yest = Gaps.probe(st, NOW - DAY);
  const today = Gaps.probe(st, NOW);
  const same = today.filter(x => yest.some(y => y.cardId === x.cardId));
  assert.equal(same.length, 0, 'два дня подряд одно слово: ' + same.map(x => x.cardId).join(', '));
  const byBlock = {};
  today.forEach(x => {
    const h = x.cardId.split(':')[1], b = Gaps.blockOf(h);
    if (b) byBlock[b] = (byBlock[b] || 0) + 1;
  });
  assert.ok(Object.values(byBlock).every(n => n <= 2), 'больше двух слов из одного блока: ' + JSON.stringify(byBlock));
});

/* ── чистота: порядок и неизменность ── */
t('результат не зависит от порядка попыток', () => {
  const base = probeState();
  const shuffled = { attempts: base.attempts.slice().reverse(), settings: base.settings };
  const mixed = { attempts: base.attempts.slice().sort((a, b) => (a.id < b.id ? 1 : -1)), settings: base.settings };
  for (const s of [shuffled, mixed]) {
    assert.deepEqual(Gaps.thin(s, NOW), Gaps.thin(base, NOW), 'зоны поехали от порядка');
    assert.deepEqual(Gaps.recommend(s, NOW), Gaps.recommend(base, NOW), 'шаги поехали от порядка');
    assert.deepEqual(Gaps.probe(s, NOW), Gaps.probe(base, NOW), 'промер поехал от порядка');
  }
});

t('пересчёт с нуля повторяем и состояние не трогается', () => {
  const st = probeState();
  const before = clone(st);
  const a1 = Gaps.thin(st, NOW), b1 = Gaps.recommend(st, NOW), c1 = Gaps.probe(st, NOW);
  const a2 = Gaps.thin(st, NOW), b2 = Gaps.recommend(st, NOW), c2 = Gaps.probe(st, NOW);
  assert.deepEqual(a2, a1); assert.deepEqual(b2, b1); assert.deepEqual(c2, c1);
  assert.deepEqual(clone(st), before, 'модуль изменил состояние');
});

/* ── пустая история ── */
t('на пустой истории — разумный старт, без падений', () => {
  for (const st of [{ attempts: [], settings: {} }, {}, { attempts: [] }]) {
    assert.deepEqual(Gaps.thin(st, NOW), [], 'зон без истории нет');
    const steps = Gaps.recommend(st, NOW);
    assert.ok(steps.length >= 1 && steps.length <= 3, 'старт из одного-трёх шагов');
    assert.ok(steps.every(s => s.why && s.why.length > 3), 'причина нужна и на старте');
    assert.equal(steps[0].t, 'phon', 'начинаем со звучания, а не с ' + steps[0].t);
    assert.equal(steps[0].go.lessonId, PHON.LESSONS[0].id);
    const p = Gaps.probe(st, NOW);
    assert.ok(p.length <= 6 && p.every(x => x.cardId), 'промер на старте собирается из первых блоков');
  }
});

t('пройденное звучание не предлагается снова', () => {
  const done = {};
  PHON.LESSONS.forEach(l => { done[l.id] = true; });
  const steps = Gaps.recommend({ attempts: [], settings: { phon: done } }, NOW);
  assert.ok(!steps.some(s => s.t === 'phon'), 'все уроки пройдены — шага звучания быть не должно');
  assert.ok(steps.length >= 1, 'старт всё равно есть');
});

/* ── чистота: порядок не значит ничего даже при совпадающем времени ── */
t('одинаковый ts: перестановка журнала ничего не меняет', () => {
  /* две попытки в одну и ту же миллисекунду — так бывает после импорта и пересборки книги */
  const T = NOW - DAY + 3600e3;
  const A = { ...att({ mode: 'quiz', ts: T, words: ['我', '你', '他'], right: 0 }), id: 'A' };
  const B = { ...att({ mode: 'quiz', ts: T, words: ['好', '是', '不'], right: 0 }), id: 'B' };
  const C = { ...att({ mode: 'quiz', ts: NOW - 5 * DAY, words: ['人', '大'], right: 0 }), id: 'C' };
  const one = { attempts: [C, A, B], settings: {} };
  const two = { attempts: [B, C, A], settings: {} };
  assert.deepEqual(Gaps.probe(two, NOW), Gaps.probe(one, NOW), 'промер поехал от порядка при равном ts');
  assert.deepEqual(Gaps.thin(two, NOW), Gaps.thin(one, NOW), 'зоны поехали от порядка при равном ts');
  assert.deepEqual(Gaps.recommend(two, NOW), Gaps.recommend(one, NOW), 'шаги поехали от порядка при равном ts');
});

t('кэш словаря не зависит от порядка вызовов', () => {
  /* под node банк один, в браузере — живой индекс App: модуль обязан заметить подмену,
     иначе первый вызов навсегда решал бы, какими карточками мы считаем */
  const st = { attempts: [att({ mode: 'quiz', ts: NOW - DAY, words: FREE.slice(0, 12), right: 4 })], settings: {} };
  const plain = Gaps.probe(st, NOW);
  assert.ok(plain.length >= 4, 'без App промер собирается: ' + plain.length);
  assert.ok(plain.some(x => !NARROW[x.cardId]), 'полный банк шире узкого — иначе проверка ничего не значит');
  global.App = { cardIndex: NARROW };
  const narrow = Gaps.probe(st, NOW);
  assert.ok(narrow.length > 0, 'узкий банк тоже даёт задания');
  assert.ok(narrow.every(x => NARROW[x.cardId]), 'с узким банком берём только его слова: ' + narrow.map(x => x.cardId).join(', '));
  delete global.App;
  assert.deepEqual(Gaps.probe(st, NOW), plain, 'банк вернулся — и промер вернулся, кэш не залип');
});

/* ── странности состояния ── */
t('странное состояние не роняет модуль', () => {
  const cases = {
    'нет questions': { attempts: [{ id: 'x', ts: NOW - DAY, mode: 'quiz', percent: 50, total: 5 }], settings: {} },
    'вопрос без cardId': { attempts: [{ id: 'x', ts: NOW - DAY, mode: 'quiz', questions: [{ hanzi: '你好', ok: true }, { hanzi: 'ЖЖЖ', ok: false }] }], settings: {} },
    'вопрос пустой': { attempts: [{ id: 'x', ts: NOW - DAY, mode: 'listen', questions: [{}, null, { ok: false }] }], settings: {} },
    'мусор в журнале': { attempts: [null, undefined, {}, { ts: null }, { id: 'z', ts: NOW, aborted: true, questions: [{ hanzi: '你' }] }], settings: {} },
    'мусор в повторениях': { attempts: [], settings: { srs: { 'hsk1:你': null, 'нет-такой-карточки': { due: NOW - DAY }, 'hsk1:好': {} } } },
    'попытка из будущего': { attempts: [{ id: 'x', ts: NOW + 10 * DAY, mode: 'quiz', questions: [{ cardId: 'hsk1:你', ok: false }] }], settings: {} },
    'attempts не массив': { attempts: 'нет', settings: {} },
    'настроек нет': { attempts: [] },
    'настройки null': { attempts: [], settings: null },
    'состояния нет': null,
    'состояние undefined': undefined,
    'зона-мусор': { attempts: [att({ mode: 'quiz', ts: NOW - DAY, words: ['我'], right: 0 })], settings: { gaps: { zone: {} } } },
  };
  for (const [name, st] of Object.entries(cases)) {
    const rows = Gaps.thin(st, NOW);
    const steps = Gaps.recommend(st, NOW);
    const p = Gaps.probe(st, NOW);
    assert.ok(Array.isArray(rows) && Array.isArray(steps) && Array.isArray(p), name + ': ожидались массивы');
    assert.ok(steps.length <= 3 && p.length <= 6, name + ': переполнение выдачи');
    assert.ok(steps.every(s => s.t && s.go && s.go.t && s.why), name + ': шаг без сути');
    assert.ok(p.every(x => x.cardId && Gaps.CLASSES.includes(x.cls) && Gaps.SUB[x.sub]), name + ': задание вне каталога');
  }
});

t('пустой словарь: промер пуст, а модуль жив', () => {
  const hsk = global.HSK, freq = global.FREQ;
  const st = { attempts: [att({ mode: 'quiz', ts: NOW - DAY, words: ['我', '你'], right: 0 })], settings: {} };
  global.HSK = { 1: [], 2: [], 3: [] }; global.FREQ = [];
  try {
    assert.deepEqual(Gaps.probe(st, NOW), [], 'без банка спрашивать нечего');
    const steps = Gaps.recommend(st, NOW);
    assert.ok(Array.isArray(steps) && steps.every(s => s.why), 'шаги живы и без банка');
  } finally { global.HSK = hsk; global.FREQ = freq; }
  assert.ok(Gaps.probe(st, NOW).length > 0, 'банк вернулся — промер снова собирается');
});

/* ── каталог зон: считаем все виды работы, какие считает Skill ── */
t('письмо от руки — своя зона и свой шаг', () => {
  const attempts = [];
  for (let d = 6; d >= 1; d--) attempts.push({ ...att({ mode: 'hand', ts: NOW - d * DAY, words: FREE.slice(0, 12), right: 3 }), mode: 'hand' });
  const row = Gaps.thin({ attempts, settings: {} }, NOW).find(r => zid(r) === 'skill:hand');
  assert.ok(row, 'шесть занятий от руки — зона обязана появиться');
  assert.ok(row.ru.includes('手'), 'название с иероглифом навыка: ' + row.ru);
  const step = Gaps.recommend({ attempts, settings: {} }, NOW).find(s => s.zone === 'skill:hand');
  assert.ok(step && step.t === 'hand' && step.go.t === 'hand', 'зоне письма — шаг письма');
  assert.ok(/\d/.test(step.why), 'причина с числом: ' + step.why);
});

t('речь — своя зона и бой с боссом', () => {
  const attempts = [];
  for (let d = 6; d >= 1; d--) attempts.push({ ...att({ mode: 'boss', ts: NOW - d * DAY, words: FREE.slice(0, 12), right: 2 }), mode: 'boss' });
  const step = Gaps.recommend({ attempts, settings: {} }, NOW).find(s => s.zone === 'skill:speak');
  assert.ok(step && step.t === 'boss' && step.go.t === 'boss', 'зоне речи — бой с боссом');
  assert.ok(Gaps.SKILLS.includes('hand') && Gaps.SKILLS.includes('speak'), 'каталог зон покрывает все виды работы Skill');
  for (const k of Gaps.SKILLS) assert.ok(k === 'vocab' || global.Skill.KINDS[k], 'зона ' + k + ' незнакома Skill');
});

/* ── просрочка ── */
t('одно просроченное слово из одного — не пожар', () => {
  const words = PROGRAM.byId('b1-02').words.slice(0, 10);
  const attempts = [];
  for (let d = 4; d >= 1; d--) attempts.push(att({ mode: 'quiz', ts: NOW - d * DAY, words, right: 7 }));
  const srs = { [idOf(words[0])]: { step: 2, due: NOW - 4 * DAY, seen: 3, last: NOW - 9 * DAY } };
  const row = Gaps.thin({ attempts, settings: { srs } }, NOW).find(r => r.kind === 'block' && r.key === 'b1-02');
  assert.ok(row, 'блок должен быть зоной');
  assert.equal(row.seen, 1, 'в обороте одно слово блока');
  assert.ok(row.fire <= 1 / Gaps.FIRE_MIN + 1e-9, 'голос просрочки на одном слове должен быть придавлен, а он ' + row.fire);
  assert.ok(!/просрочено/.test(row.why), 'причина не должна кричать о пожаре из одного слова: ' + row.why);
});

t('по-русски: «просрочено N слов из M», без «слова просрочено»', () => {
  const words = FREE.slice(300, 310);
  const attempts = [];
  for (let d = 4; d >= 1; d--) attempts.push(att({ mode: 'listen', ts: NOW - d * DAY, words, right: 5 }));
  const srs = {};
  words.slice(0, 5).forEach((h, i) => { srs[idOf(h)] = { step: 2, due: NOW - (i < 2 ? 2 : -5) * DAY, seen: 3, last: NOW - 9 * DAY }; });
  const row = Gaps.thin({ attempts, settings: { srs } }, NOW).find(r => zid(r) === 'skill:listen');
  assert.ok(row, 'зона слуха есть');
  assert.equal(row.why, 'просрочено 2 слова из 5', 'причина: ' + row.why);
  /* старая формулировка была неграмотной — её быть не должно нигде */
  const all = [...Gaps.thin(probeState(), NOW), ...Gaps.thin({ attempts, settings: { srs } }, NOW)];
  assert.ok(all.every(r => !/слова просрочено|слов просрочено\b/.test(r.why)), 'неграмотная причина: ' + all.map(r => r.why).join(' / '));
});

/* ── две книги учёта ── */
t('повторения берутся из открытой книги', () => {
  const attempts = [att({ mode: 'quiz', ts: NOW - 2 * DAY, words: FREE.slice(0, 3), right: 0 })];
  const v1 = {}; FREE.slice(0, 5).forEach((h, i) => { v1[idOf(h)] = { step: 2, due: NOW - (i + 1) * DAY, seen: 3, last: NOW - 9 * DAY }; });
  const v2 = { [idOf(FREE[0])]: { step: 2, due: NOW + 5 * DAY, seen: 3, last: NOW - DAY } };
  const mk = ver => ({ attempts, cards: [], cardStats: {}, decks: [], settings: { ver, srs: clone(v1), v2: { srs: clone(v2), program: {}, seen: {}, campaign: null, builtFrom: 1 } } });
  const inV1 = Gaps.recommend(mk('v1'), NOW).find(s => s.t === 'review');
  const inV2 = Gaps.recommend(mk('v2'), NOW).find(s => s.t === 'review');
  assert.ok(inV1 && inV1.why.includes('5'), 'в текущей книге пять просроченных: ' + (inV1 && inV1.why));
  assert.ok(!inV2, 'в тестовой книге сроки не подошли — долга быть не должно');
  /* и ни одна из книг при этом не тронута */
  const st = mk('v2'), before = clone(st);
  Gaps.thin(st, NOW); Gaps.recommend(st, NOW); Gaps.probe(st, NOW);
  assert.deepEqual(clone(st), before, 'модуль записал что-то в книгу учёта');
});

t('зона живёт в своём месте настроек, старая запись ещё понимается', () => {
  const attempts = history({ listen: 8, read: 9, write: 15 });
  assert.equal(zid(Gaps.thin({ attempts, settings: { gaps: { zone: 'read' } } }, NOW)[0]), 'skill:read', 'settings.gaps.zone — основное место');
  assert.equal(zid(Gaps.thin({ attempts, settings: { v2: { zone: 'read' } } }, NOW)[0]), 'skill:read', 'старая запись settings.v2.zone ещё читается');
  /* коробка книги v2 без зоны не должна сбивать выбор */
  const box = { attempts, settings: { v2: { srs: {}, program: {}, seen: {}, campaign: null } } };
  assert.equal(zid(Gaps.thin(box, NOW)[0]), 'skill:listen', 'коробка учёта не зона');
});

/* ── модуль грузится и в браузере ── */
t('в модуле нет DOM, сети и модульного синтаксиса', () => {
  const src = readFileSync(new URL('../src/js/gaps.js', import.meta.url), 'utf8');
  for (const bad of [/\bdocument\b/, /\blocalStorage\b/, /\bnavigator\b/, /\bfetch\s*\(/, /window\.location/, /^\s*import\s/m, /^\s*export\s/m, /\brequire\s*\(/, /\bMath\.random\b/])
    assert.ok(!bad.test(src), 'в модуле есть запрещённое: ' + bad);
  assert.ok(/^window\.Gaps = \(\(\) => \{/m.test(src), 'модуль должен объявляться как window.Gaps = (() => { … })()');
});

t('каталоги описаны словами и совпадают с тем, что выдаётся', () => {
  const p = Gaps.probe(probeState(), NOW);
  assert.ok(Gaps.CLASSES.length >= 5 && Gaps.CLASSES.every(c => Gaps.CLASS[c] && Gaps.CLASS[c].ru), 'у каждого класса своё русское имя');
  assert.ok(Object.keys(Gaps.SUB).length === 3 && Object.values(Gaps.SUB).every(s => s.ru && s.zh), 'у каждого вида задания имя и иероглиф');
  assert.ok(p.every(x => Gaps.CLASSES.includes(x.cls)), 'класс задания вне каталога: ' + p.map(x => x.cls).join(', '));
  assert.ok(p.every(x => Gaps.SUB[x.sub]), 'вид задания вне каталога');
});

console.log(fail ? `SOME TESTS FAILED: ${fail} из ${pass + fail}` : `gaps: все проверки пройдены (${pass})`);
if (fail) process.exitCode = 1;
