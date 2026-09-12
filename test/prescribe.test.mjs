/* Проверка предписания: программа на недели из собственной истории.
   Запуск: node test/prescribe.test.mjs — ноль строк FAIL обязателен. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
global.window = global;
for (const f of ['hsk', 'freq', 'sentences', 'pinyin', 'stats', 'srs', 'boss', 'campaign', 'skill', 'program',
  'phonetics', 'traps', 'gram-b1', 'gram-b2', 'gram-b3', 'gram-b4', 'grammar', 'fires', 'mastery', 'gaps',
  'ledger', 'prescribe'])
  require('../src/js/' + f + '.js');
const { Prescribe, PROGRAM, HSK, PHON, Campaign } = global;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, '—', e.message); } };

const DAY = 24 * 3600e3;
const NOW = new Date(2026, 8, 12, 12, 0, 0).getTime();   /* полдень: сутки не съезжают */
const clone = x => JSON.parse(JSON.stringify(x));
const J = x => JSON.stringify(x);

/* ── состояние и история ── */
const idOf = h => {
  for (const l of [1, 2, 3]) if ((HSK[l] || []).some(e => e[0] === h)) return 'hsk' + l + ':' + h;
  return null;
};
const blk = id => PROGRAM.byId(id);
function fresh() {
  return { cards: [], attempts: [], settings: { ver: 'v2', phon: {}, program: {}, srs: {}, v2: { srs: {}, program: {}, seen: {}, campaign: null, builtFrom: 0 } } };
}
let seq = 0;
/* попытка по словам: первые right отвечены верно */
function att(o) {
  const ws = o.words, right = o.right == null ? ws.length : o.right;
  const qs = ws.map((h, i) => {
    const ok = i < right;
    return {
      cardId: idOf(h), hanzi: h, pinyin: '', ru: '', show: 'hanzi', guess: ['ru'],
      answer: o.mode === 'write' ? { input: ok ? h : 'x' } : { choice: ok ? 0 : 1 },
      parts: { pinyin: ok ? 'exact' : 'wrong', ru: ok ? 'exact' : 'wrong' },
      fraction: ok ? 1 : 0, ok, ms: 6000,
    };
  });
  return {
    id: 'a' + (++seq), ts: o.ts, endedAt: o.ts + 6e4, durationMs: 6e4,
    mode: o.mode, difficulty: o.difficulty || 'hard', level: o.level || 1,
    deckIds: ['hsk1'], deckName: 'Проверка', show: 'hanzi', guess: ['ru'], order: 'fixed', timer: 0,
    total: ws.length, planned: ws.length, aborted: false,
    correct: right, partial: 0, wrong: ws.length - right,
    percent: Math.round(right / ws.length * 100), points: 30, questions: qs,
    blockId: o.blockId || null, block: o.blockId || null, words: o.sprint ? ws : undefined,
  };
}

/* Состояние «в работе»: блок b1-01 разобран набором семь дней подряд, b1-02 только начат */
function busy() {
  const s = fresh();
  const w1 = blk('b1-01').words, w2 = blk('b1-02').words;
  for (let d = 8; d >= 1; d--) {
    s.attempts.push(att({ mode: 'write', ts: NOW - d * DAY, words: w1, right: w1.length, blockId: 'b1-01' }));
    if (d <= 3) s.attempts.push(att({ mode: 'quiz', ts: NOW - d * DAY + 3600e3, words: w2.slice(0, 8), right: 4, blockId: 'b1-02' }));
  }
  s.settings.program['b1-01'] = { seen: w1.slice(), openedAt: NOW - 9 * DAY };
  s.settings.program['b1-02'] = { seen: w2.slice(0, 8), openedAt: NOW - 4 * DAY };
  s.settings.phon['p-01'] = { at: NOW - 9 * DAY };
  return s;
}

/* Состояние «просело»: блок закрыт печатью, а слова вернулись в ленту */
function broken() {
  const s = fresh();
  const w = blk('b1-01').words;
  s.settings.program['b1-01'] = { seal: 'done', seen: w.slice(), openedAt: NOW - 60 * DAY };
  s.attempts.push(att({ mode: 'sprint', ts: NOW - 55 * DAY, words: w, right: w.length, blockId: 'b1-01', sprint: true }));
  for (const h of w.slice(0, 6)) {
    const id = idOf(h);
    if (id) s.settings.v2.srs[id] = { step: 2, due: NOW - 9 * DAY, seen: 4, last: NOW - 30 * DAY };
  }
  return s;
}

/* ── чистота ── */
t('build — чистая функция: перемешанный журнал даёт тот же результат', () => {
  const a = busy(), b = clone(a);
  b.attempts.sort((x, y) => (x.id < y.id ? 1 : -1));            /* перевернули порядок */
  b.attempts.push(b.attempts.shift());
  assert.equal(J(Prescribe.build(a, NOW)), J(Prescribe.build(b, NOW)), 'порядок журнала изменил программу');
});

t('пересчёт с нуля даёт то же, что и повторный вызов', () => {
  const s = busy();
  const one = Prescribe.build(s, NOW);
  const again = Prescribe.build(clone(s), NOW);
  assert.equal(J(one), J(again), 'два расчёта разошлись');
});

t('build ничего не пишет в состояние', () => {
  const s = busy(), before = J(s);
  Prescribe.build(s, NOW);
  assert.equal(J(s), before, 'build изменил state');
});

t('одинаковые ts не ломают порядок: журнал сортируется и по id', () => {
  const s = busy();
  const ts = s.attempts[0].ts;
  for (const a of s.attempts) a.ts = ts;                          /* всё в одну миллисекунду */
  const one = Prescribe.build(s, NOW);
  const sh = clone(s); sh.attempts.reverse();
  assert.equal(J(one), J(Prescribe.build(sh, NOW)), 'при равном ts результат зависит от порядка');
});

/* ── зависимости ── */
t('таблица зависимостей экспертная, но проверяемая: id существуют и циклов нет', () => {
  const ids = new Set(PROGRAM.BLOCKS.map(b => b.id));
  for (const [k, ps] of Object.entries(Prescribe.DEPS)) {
    assert.ok(ids.has(k), 'нет такого блока: ' + k);
    for (const p of ps) {
      assert.ok(ids.has(p), 'нет предшественника: ' + p);
      assert.notEqual(p, k, 'блок зависит от себя: ' + k);
      const pb = PROGRAM.byId(p), kb = PROGRAM.byId(k);
      assert.ok(pb.lvl < kb.lvl || (pb.lvl === kb.lvl && pb.id < kb.id), 'предшественник идёт позже: ' + p + ' → ' + k);
    }
  }
  /* обход в глубину: цикла быть не может */
  const seen = {}, done = {};
  const walk = id => {
    if (done[id]) return;
    assert.ok(!seen[id], 'цикл в таблице зависимостей на ' + id);
    seen[id] = 1;
    for (const p of (Prescribe.DEPS[id] || [])) walk(p);
    seen[id] = 0; done[id] = 1;
  };
  Object.keys(Prescribe.DEPS).forEach(walk);
});

t('в программе блок не идёт раньше своего предшественника', () => {
  for (const st of [fresh(), busy(), broken()]) {
    const b = Prescribe.build(st, NOW);
    const at = {};
    b.stages.forEach((s, i) => { if (s.blockId && s.kind !== 'grammar') at[s.blockId] = i; });
    for (const s of b.stages) {
      if (!s.blockId || s.kind === 'grammar') continue;
      for (const p of (Prescribe.DEPS[s.blockId] || [])) {
        if (at[p] == null) continue;
        assert.ok(at[p] < at[s.blockId], p + ' стоит после ' + s.blockId);
      }
    }
  }
});

t('незакрытая зависимость помечена: blocked и список deps', () => {
  const b = Prescribe.build(fresh(), NOW);
  for (const s of b.stages) {
    if (!s.blockId || s.kind === 'grammar') continue;
    const open = (Prescribe.DEPS[s.blockId] || []);
    if (!open.length) { assert.equal(s.blocked, false, s.blockId + ' помечен заблокированным без зависимостей'); continue; }
    assert.equal(s.blocked, true, s.blockId + ' не помечен, хотя предшественник не закрыт');
    assert.deepEqual(s.deps, open, 'список deps не совпал у ' + s.blockId);
  }
});

/* ── виды этапов ── */
t('на пустой истории первый этап разумен: звучание, затем первый блок программы', () => {
  const b = Prescribe.build(fresh(), NOW);
  assert.ok(b.stages.length >= 3, 'программа пуста');
  assert.equal(b.stages[0].kind, 'sound', 'первым идёт не звучание, хотя уроки не пройдены');
  assert.ok(/язык|Как устроен слог|语音/.test(b.stages[0].ru), 'этап звучания без названия урока');
  const first = b.stages.find(s => s.blockId && s.kind !== 'grammar');
  assert.equal(first.blockId, 'b1-01', 'первым блоком идёт не начало программы, а ' + first.blockId);
  assert.equal(first.kind, 'regular', 'первый блок должен быть обычным');
  assert.ok(/12 слов из 12/.test(first.why), 'причина без чисел: ' + first.why);
});

t('звучание уходит, когда уроки пройдены', () => {
  const s = fresh();
  for (const l of PHON.LESSONS) s.settings.phon[l.id] = { at: NOW - 20 * DAY };
  const b = Prescribe.build(s, NOW);
  assert.ok(!b.stages.some(x => x.kind === 'sound'), 'звучание осталось, хотя уроков не осталось');
  assert.ok(/пройдены/.test(b.lines.find(l => l.t === 'sound').why), 'линия звучания не заметила, что уроки пройдены');
});

t('просевший блок идёт починкой, а не заново', () => {
  const b = Prescribe.build(broken(), NOW);
  const s = b.stages.find(x => x.blockId === 'b1-01' && x.kind !== 'grammar');
  assert.ok(s, 'просевший блок выпал из программы');
  assert.equal(s.kind, 'repair', 'просевший блок помечен как ' + s.kind);
  assert.ok(/вернулись в ленту/.test(s.why), 'причина починки без чисел: ' + s.why);
});

t('блок, который уже читается, идёт экспрессом и не тонет в очереди', () => {
  const b = Prescribe.build(busy(), NOW);
  const e = b.stages.find(x => x.kind === 'express');
  assert.ok(e, 'экспресса нет: блок, разобранный восемь дней подряд, снова учат с нуля');
  assert.equal(e.blockId, 'b1-01');
  assert.ok(/остаётся проверка/.test(e.why), 'причина экспресса невнятна: ' + e.why);
  const i = b.stages.findIndex(x => x.id === e.id);
  const firstOther = b.stages.findIndex(x => x.blockId && x.kind === 'regular');
  assert.ok(i < firstOther, 'экспресс стоит позже нового материала');
  assert.ok(e.cost < 200, 'экспресс стоит как полный блок: ' + e.cost);
});

t('промах съёмки поднимает свой блок и называется в причине', () => {
  const s = fresh();
  const w = blk('b1-06').words;
  s.attempts.push({
    id: 's1', ts: NOW - 2 * DAY, endedAt: NOW - 2 * DAY + 6e4, durationMs: 6e4,
    mode: 'survey', part: 2, difficulty: 'survey', level: 1, deckIds: [], deckName: 'Съёмка',
    total: 3, planned: 3, aborted: false, correct: 0, partial: 0, wrong: 3, percent: 0, points: 40,
    fixedPts: true, p2fix: 40,
    questions: w.slice(0, 3).map(h => ({ hanzi: h, blockId: 'b1-06', kind: 'hz2ru', key: 'x', given: 'y', scored: true, ok: false, fraction: 0 })),
  });
  const b = Prescribe.build(s, NOW);
  const st = b.stages.find(x => x.blockId === 'b1-06' && x.kind !== 'grammar');
  assert.ok(st, 'блок с белым пятном выпал из программы');
  assert.ok(/белое пятно съёмки: 3 промаха/.test(st.why), 'пятно не названо: ' + st.why);
  assert.equal(st.f.gapBoost, 1.35, 'вес пятна не применён');
  const plain = Prescribe.build(fresh(), NOW).stages.find(x => x.blockId === 'b1-06');
  assert.ok(!plain || st.priority > plain.priority, 'пятно не подняло блок');
});

t('закрытый и здоровый блок в горизонт не идёт', () => {
  const s = broken();
  for (const k of Object.keys(s.settings.v2.srs)) s.settings.v2.srs[k].due = NOW + 20 * DAY;   /* ничего не просрочено */
  const b = Prescribe.build(s, NOW);
  assert.ok(!b.stages.some(x => x.blockId === 'b1-01' && x.kind !== 'grammar'), 'закрытый блок снова в программе');
});

t('у каждого этапа вид из каталога и причина словами', () => {
  for (const st of [fresh(), busy(), broken()]) {
    for (const s of Prescribe.build(st, NOW).stages) {
      assert.ok(Prescribe.KINDS[s.kind], 'вид вне каталога: ' + s.kind);
      assert.ok(s.ru && s.ru.length > 3, 'этап без названия: ' + s.id);
      assert.ok(s.why && s.why.length > 5, 'этап без причины: ' + s.id);
      assert.ok(/[0-9]/.test(s.why), 'причина без чисел: ' + s.why);
    }
  }
});

/* ── сроки и экономика ── */
t('сроки — диапазоны, неотрицательные и растущие', () => {
  for (const st of [fresh(), busy(), broken()]) {
    const b = Prescribe.build(st, NOW);
    let prevTo = 0, prevFrom = 0;
    for (const s of b.stages) {
      assert.ok(Number.isInteger(s.from) && s.from > 0, 'начало срока не целое положительное: ' + s.from);
      assert.ok(Number.isInteger(s.to) && s.to > 0, 'конец срока не целый положительный: ' + s.to);
      assert.ok(s.to > s.from, 'срок не диапазон, а точка: ' + s.from + '–' + s.to);
      assert.ok(s.from >= prevFrom && s.to >= prevTo, 'сроки идут не по возрастанию');
      assert.ok(s.days >= Prescribe.MIN_LEG, 'этап короче двух дней: ' + s.days);
      prevFrom = s.from; prevTo = s.to;
    }
    assert.ok(b.horizon.to >= b.horizon.from && b.horizon.from > 0, 'горизонт не диапазон');
    assert.equal(b.horizon.to, b.stages[b.stages.length - 1].to, 'горизонт не совпал с последним этапом');
  }
});

t('пока шаг не измерен — так и написано; с двумя закрытыми этапами меряем по своему', () => {
  const a = Prescribe.build(fresh(), NOW);
  assert.equal(a.pace.measured, false);
  assert.ok(/не измерен/.test(a.pace.ru), 'подпись срока не предупреждает о расчёте: ' + a.pace.ru);
  assert.ok(a.stages.every(s => /не измерен/.test(s.when)), 'этап не подписан');

  const s = fresh();
  for (const [id, dayFrom] of [['b1-01', 20], ['b1-02', 12]]) {
    const w = blk(id).words;
    s.attempts.push(att({ mode: 'quiz', ts: NOW - dayFrom * DAY, words: w, right: w.length - 2, blockId: id }));
    s.attempts.push(att({ mode: 'sprint', ts: NOW - (dayFrom - 3) * DAY, words: w, right: w.length, blockId: id, sprint: true }));
  }
  const b = Prescribe.build(s, NOW);
  assert.equal(b.pace.measured, true, 'два закрытых этапа не дали измеренного шага');
  assert.equal(b.pace.legs, 2);
  assert.ok(/по вашему шагу/.test(b.pace.ru), 'подпись не сменилась: ' + b.pace.ru);
});

t('цена этапа не выбивается из дневной нормы', () => {
  for (const st of [fresh(), busy(), broken()]) {
    const b = Prescribe.build(st, NOW);
    for (const s of b.stages) {
      assert.ok(s.cost > 0, 'этап без цены: ' + s.id);
      const perDay = s.cost / s.days;
      assert.ok(perDay <= Campaign.CAP, 'этап просит ' + Math.round(perDay) + ' очков в день при норме ' + Campaign.CAP);
      assert.ok(perDay <= b.pace.perDay + 1e-9, 'этап просит больше, чем шаг ' + b.pace.perDay);
    }
  }
});

/* ── ежедневные линии ── */
t('ежедневные линии на месте и говорят числами', () => {
  const b = Prescribe.build(broken(), NOW);
  assert.deepEqual(b.lines.map(l => l.t), ['review', 'sound', 'speak']);
  for (const l of b.lines) assert.ok(l.ru && l.why && l.why.length > 5, 'линия без причины: ' + l.t);
  assert.ok(/6 слов просрочены/.test(b.lines[0].why), 'повторения не посчитаны: ' + b.lines[0].why);
});

/* ── гистерезис ── */
/* самый весомый из тройки, которую видно на экране: именно её стережёт гистерезис */
const heaviest = built => built.stages.slice(0, 3).sort((x, y) => y.priority - x.priority)[0].id;
/* выпуск-двойник: вес одного этапа изменён, при move — он ещё и уехал в конец очереди */
function tweak(built, id, k, move) {
  const c = clone(built);
  const i = c.stages.findIndex(x => x.id === id);
  c.stages[i].priority = Math.round(c.stages[i].priority * k * 10000) / 10000;
  if (move) c.stages.push(c.stages.splice(i, 1)[0]);
  return c;
}
t('гистерезис: мелкая перестановка не публикуется, крупная — публикуется', () => {
  const s = busy();
  const base = Prescribe.build(s, NOW);
  const top = heaviest(base);
  Prescribe.publish(s, base, NOW);                                    /* первый выпуск всегда публикуется */
  assert.ok(s.settings.v2.route, 'снимок выпуска не сохранён');

  const small = tweak(base, top, 1.02);
  const r1 = Prescribe.publish(s, small, NOW + DAY);
  assert.equal(r1.publish, false, 'мелкая перестановка вышла в свет: сдвиг ' + r1.drift);
  assert.equal(s.settings.v2.route.at, NOW, 'снимок перезаписан на мелочи');
  assert.ok(/меньше порога/.test(r1.why), 'нет объяснения, почему не публикуем');

  const big = tweak(base, top, 0.25, true);
  const r2 = Prescribe.publish(s, big, NOW + 2 * DAY);
  assert.ok(r2.publish, 'крупная перестановка не опубликована: сдвиг ' + r2.drift);
  assert.ok(r2.drift > Prescribe.HYST, 'сдвиг не превысил порог');
  assert.equal(s.settings.v2.route.at, NOW + 2 * DAY, 'снимок не обновлён');
});

t('первый выпуск публикуется всегда', () => {
  const s = busy();
  const r = Prescribe.publish(s, Prescribe.build(s, NOW), NOW);
  assert.ok(r.publish && /первый выпуск/.test(r.why), 'первый выпуск не опубликован');
});

t('снимок выпуска хранит всё, что нужно для сравнения', () => {
  const s = busy();
  const r = Prescribe.publish(s, Prescribe.build(s, NOW), NOW);
  for (const x of r.route.stages) {
    for (const k of ['id', 'kind', 'ru', 'why', 'cost', 'days', 'from', 'to', 'priority']) assert.ok(x[k] != null, 'в снимке нет поля ' + k);
  }
  assert.equal(J(Prescribe.route(s)), J(r.route), 'route(state) отдаёт не тот снимок');
});

/* ── что изменилось ── */
t('diff называет причину каждого изменения', () => {
  const s = busy();
  const a = Prescribe.build(s, NOW);
  const b = tweak(a, heaviest(a), 0.25, true);
  b.stages = b.stages.filter(x => x.id !== a.stages[2].id);          /* один этап ушёл */
  const d = Prescribe.diff(a, b);
  assert.ok(d.length, 'изменения не замечены');
  for (const x of d) {
    assert.ok('↑↓+−='.includes(x.sign), 'неизвестный знак: ' + x.sign);
    assert.ok(x.ru && x.ru.length > 3, 'изменение без названия');
    assert.ok(x.why && x.why.length > 5, 'изменение без причины: ' + J(x));
  }
  assert.ok(d.some(x => x.sign === '−'), 'ушедший этап не отмечен');
  assert.ok(d.some(x => x.sign === '↓' || x.sign === '↑'), 'перестановка не отмечена');
});

t('diff на одинаковых выпусках молчит', () => {
  const a = Prescribe.build(busy(), NOW);
  assert.deepEqual(Prescribe.diff(a, clone(a)), [], 'diff нашёл изменения там, где их нет');
});

t('diff видит смену вида этапа и называет её', () => {
  const a = Prescribe.build(broken(), NOW);
  const i = a.stages.findIndex(x => x.kind === 'repair');
  assert.ok(i >= 0, 'починки нет — нечего менять');
  const b = clone(a);
  b.stages[i].kind = 'regular';
  const d = Prescribe.diff(a, b).filter(x => x.id === a.stages[i].id);
  assert.equal(d.length, 1);
  assert.equal(d[0].sign, '=');
  assert.ok(/Починка → Учить блок/.test(d[0].ru), 'смена вида названа невнятно: ' + d[0].ru);
});

/* ── проверка проверяющего: чистота от глобальных привязок и кэшей ── */
const { Ledger } = global;

t('книга учёта берётся из переданного состояния, а не из глобальной привязки Ledger', () => {
  const s = fresh();
  for (const [id, dayFrom] of [['b1-01', 20], ['b1-02', 12]]) {
    const w = blk(id).words;
    const a1 = att({ mode: 'quiz', ts: NOW - dayFrom * DAY, words: w, right: w.length - 2, blockId: id });
    const a2 = att({ mode: 'sprint', ts: NOW - (dayFrom - 3) * DAY, words: w, right: w.length, blockId: id, sprint: true });
    /* очки книг расходятся в разы: если шаг считается не по той книге, сроки уедут */
    for (const a of [a1, a2]) { a.points = 900; a.p2 = 30; }
    s.attempts.push(a1, a2);
  }
  const plain = J(Prescribe.build(clone(s), NOW));
  Ledger.bind(fresh());                                      /* привязали чужое состояние */
  assert.equal(J(Prescribe.build(clone(s), NOW)), plain, 'привязка Ledger изменила программу');
  const forced = Ledger.withVer('v1', () => J(Prescribe.build(clone(s), NOW)));
  assert.equal(forced, plain, 'принудительная книга v1 изменила программу состояния v2');
  /* и наоборот: состояние в книге v1 считает по своим очкам */
  const v1 = clone(s); v1.settings.ver = 'v1';
  assert.notEqual(J(Prescribe.build(v1, NOW).pace), J(Prescribe.build(clone(s), NOW).pace), 'книги дают один и тот же шаг при разных очках');
  Ledger.bind(null);
});

t('кэш словаря помнит, откуда взят банк: подмена индекса тем же числом карточек не остаётся незамеченной', () => {
  const s = broken();
  const before = Prescribe.build(clone(s), NOW);
  assert.ok(before.stages.some(x => x.blockId === 'b1-01' && x.kind === 'repair'), 'починки нет — проверять нечего');
  /* живой индекс того же размера, что и встроенные банки, но с другими id карточек:
     повторения по старым id к нему не относятся, значит «просело» больше не читается */
  const n = [1, 2, 3].reduce((x, l) => x + (HSK[l] || []).length, 0) + (global.FREQ || []).length;
  const idx = {};
  for (const l of [1, 2, 3]) for (const e of (HSK[l] || [])) idx['my' + l + ':' + e[0]] = { id: 'my' + l + ':' + e[0], deckId: 'my', hanzi: e[0] };
  let i = 0;
  while (Object.keys(idx).length < n) { const k = 'my9:x' + (i++); idx[k] = { id: k, deckId: 'my', hanzi: 'x' + i }; }
  global.App = { cardIndex: idx };
  try {
    const after = Prescribe.build(clone(s), NOW);
    assert.ok(!after.stages.some(x => x.blockId === 'b1-01' && x.kind === 'repair'),
      'словарь остался прежним: кэш пережил подмену банка того же размера');
  } finally { delete global.App; }
  assert.equal(J(Prescribe.build(clone(s), NOW)), J(before), 'после возврата банка ответ не вернулся к прежнему');
});

/* ── экономика ── */
t('шаг не превышает дневную норму, как бы быстро ни шли прошлые этапы', () => {
  const s = fresh();
  for (const [id, dayFrom] of [['b1-01', 20], ['b1-02', 12]]) {
    const w = blk(id).words;
    const a1 = att({ mode: 'quiz', ts: NOW - dayFrom * DAY, words: w, right: w.length - 2, blockId: id });
    const a2 = att({ mode: 'sprint', ts: NOW - dayFrom * DAY + 3600e3, words: w, right: w.length, blockId: id, sprint: true });
    for (const a of [a1, a2]) a.p2 = 5000;                   /* день в десять норм */
    s.attempts.push(a1, a2);
  }
  const b = Prescribe.build(s, NOW);
  assert.equal(b.pace.measured, true, 'шаг не измерен — проверять нечего');
  assert.equal(b.pace.perDay, Campaign.CAP, 'шаг выше дневной нормы: ' + b.pace.perDay);
  assert.ok(/дневной нормы/.test(b.pace.ru), 'о срезе до нормы не сказано: ' + b.pace.ru);
  for (const st of b.stages) assert.ok(st.cost / st.days <= Campaign.CAP, 'этап просит больше нормы: ' + Math.round(st.cost / st.days));
});

t('на разгоне сказано, что норма первых дней меньше', () => {
  const b = Prescribe.build(fresh(), NOW);
  assert.ok(new RegExp('норма разгона — ' + Campaign.CAP_START).test(b.pace.ru), 'о разгоне не сказано: ' + b.pace.ru);
  const s = busy();
  assert.ok(!/разгона/.test(Prescribe.build(s, NOW).pace.ru), 'разгон обещан тому, кто занимается неделю');
});

/* ── прочитанное из журнала ── */
t('разбор грамматики, проваленный целиком, не считается пройденным', () => {
  const s = busy();
  const items = global.GRAMMAR.forBlock('b1-01') || [];
  if (!items.length) return;
  const base = Prescribe.build(clone(s), NOW).stages.find(x => x.kind === 'grammar' && x.blockId === 'b1-01');
  assert.ok(base, 'грамматики по b1-01 нет — проверять нечего');
  s.attempts.push({
    id: 'g0', ts: NOW - DAY, endedAt: NOW - DAY + 6e4, durationMs: 6e4, mode: 'gram', difficulty: 'gram',
    blockId: 'b1-01', block: 'b1-01', level: 1, deckIds: [], deckName: 'разбор', show: 'sentence', guess: ['answer'],
    order: 'ladder', timer: 0, total: 12, planned: 12, aborted: false, correct: 0, partial: 0, wrong: 12,
    percent: 0, points: 0, questions: [],
  });
  const after = Prescribe.build(s, NOW).stages.find(x => x.kind === 'grammar' && x.blockId === 'b1-01');
  assert.ok(after, 'проваленный разбор убрал этап грамматики из программы');
});

t('пустой спринт блок не закрывает', () => {
  const s = fresh();
  const w = blk('b1-01').words;
  s.attempts.push({
    id: 'e1', ts: NOW - 2 * DAY, endedAt: NOW - 2 * DAY + 1e4, durationMs: 1e4, mode: 'sprint', difficulty: 'hard',
    blockId: 'b1-01', block: 'b1-01', level: 1, deckIds: ['hsk1'], deckName: 'пусто', show: 'hanzi', guess: ['ru'],
    order: 'fixed', timer: 0, total: 0, planned: 0, aborted: false, correct: 0, partial: 0, wrong: 0,
    percent: 0, points: 0, questions: [], words: w.slice(0, 0),
  });
  const b = Prescribe.build(s, NOW);
  assert.ok(b.stages.some(x => x.blockId === 'b1-01' && x.kind !== 'grammar'), 'пустой спринт закрыл блок');
});

t('промахи старой съёмки не держат блок вечно', () => {
  const s = fresh();
  const w = blk('b1-06').words;
  const survey = (ts, ok) => ({
    id: 'sv' + ts, ts, endedAt: ts + 6e4, durationMs: 6e4, mode: 'survey', part: 2, difficulty: 'survey', level: 1,
    deckIds: [], deckName: 'Съёмка', total: 3, planned: 3, aborted: false, correct: ok ? 3 : 0, partial: 0,
    wrong: ok ? 0 : 3, percent: ok ? 100 : 0, points: 40, fixedPts: true, p2fix: 40,
    questions: w.slice(0, 3).map(h => ({ hanzi: h, blockId: 'b1-06', kind: 'hz2ru', key: 'x', given: 'y', scored: true, ok, fraction: ok ? 1 : 0 })),
  });
  const stageOf = x => Prescribe.build(x, NOW).stages.find(y => y.blockId === 'b1-06' && y.kind !== 'grammar');
  s.attempts.push(survey(NOW - 60 * DAY, false));
  const old = stageOf(clone(s));
  assert.ok(old && /белое пятно съёмки: 3 промаха/.test(old.why), 'промах съёмки не замечен: ' + (old && old.why));
  s.attempts.push(survey(NOW - 2 * DAY, true));                  /* новая съёмка прошла чисто */
  const now = stageOf(s);
  assert.ok(now, 'блок пропал из программы');
  assert.ok(!/белое пятно/.test(now.why), 'старое пятно живо после чистой съёмки: ' + now.why);
});

/* ── честность текста ── */
t('сроки названы диапазоном и сказано, чего счёт не видит', () => {
  for (const st of [fresh(), busy(), broken()]) {
    const b = Prescribe.build(st, NOW);
    assert.ok(/–/.test(b.horizon.ru), 'горизонт не диапазон: ' + b.horizon.ru);
    assert.ok(/без перерывов/.test(b.horizon.ru), 'о пропусках не сказано: ' + b.horizon.ru);
    assert.ok(/шаг/.test(b.horizon.ru) || /шагу/.test(b.horizon.ru) || /расчёту/.test(b.horizon.ru), 'не сказано, откуда срок: ' + b.horizon.ru);
    for (const s of b.stages) {
      assert.ok(!/[a-zA-Z]/.test(s.why.replace(/HSK/g, '')), 'латиница в причине: ' + s.why);
      assert.ok(!/undefined|NaN/.test(s.ru + s.why + s.when), 'дыра в тексте: ' + s.ru + ' / ' + s.why);
    }
  }
  const dep = Prescribe.build(fresh(), NOW).stages.find(s => s.deps && s.deps.length);
  if (dep) assert.ok(/не вывод из ваших ответов/.test(dep.why), 'порядок блоков выдан за вывод из истории: ' + dep.why);
});

/* ── модуль грузится и в браузере ── */
t('в модуле нет DOM, сети и модульного синтаксиса', () => {
  const src = readFileSync(new URL('../src/js/prescribe.js', import.meta.url), 'utf8');
  for (const bad of [/\bdocument\b/, /\blocalStorage\b/, /\bnavigator\b/, /\bfetch\s*\(/, /window\.location/, /^\s*import\s/m, /^\s*export\s/m, /\brequire\s*\(/, /\bMath\.random\b/, /\bDate\.now\(\)\s*[-+]/])
    assert.ok(!bad.test(src), 'в модуле есть запрещённое: ' + bad);
  assert.ok(/^window\.Prescribe = \(\(\) => \{/m.test(src), 'модуль должен объявляться как window.Prescribe = (() => { … })()');
});

t('модуль переживает отсутствие соседей', () => {
  const keep = { Mastery: global.Mastery, Gaps: global.Gaps, Fires: global.Fires, GRAMMAR: global.GRAMMAR, PHON: global.PHON };
  for (const k of Object.keys(keep)) delete global[k];
  try {
    const b = Prescribe.build(fresh(), NOW);
    assert.ok(b.stages.length, 'без соседних модулей программа пуста');
    assert.ok(b.lines.length === 3, 'линии пропали');
  } finally { Object.assign(global, keep); }
});

console.log(fail ? `SOME TESTS FAILED: ${fail} из ${pass + fail}` : `prescribe: все проверки пройдены (${pass})`);
if (fail) process.exitCode = 1;
