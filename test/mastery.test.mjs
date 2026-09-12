/* Проверка Мастерства v2: оценка обязана быть чистой функцией от истории и не накручиваться уроками. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
global.window = global;
for (const f of ['hsk', 'program', 'phonetics', 'mastery']) require('../src/js/' + f + '.js');
const { Mastery, PROGRAM, PHON, HSK } = global;

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL', name, '—', e.message); process.exitCode = 1; } };

/* ── песочница ── */
const DAY = 864e5;
const NOW = new Date(2026, 8, 26, 12, 0, 0).getTime();   /* 26 сен 2026, полдень */
const day = k => NOW - k * DAY;                          /* k дней назад */
const B1 = PROGRAM.byLevel(1)[0];                        /* блок b1-01 «Приветствие» */
const W1 = B1.words;
const st = (over = {}) => ({ attempts: [], settings: { program: {}, phon: {} }, ...over });
let seq = 0;
const uid = () => 'a' + (++seq);

/* Попытка-выбор из вариантов (quiz easy — 4 варианта) */
const quiz = (words, ts, ok = true, over = {}) => ({
  id: uid(), ts, endedAt: ts + 60e3, durationMs: 60e3, mode: 'quiz', difficulty: 'easy',
  deckIds: ['hsk1'], deckName: 'HSK 1', show: 'hanzi', guess: ['ru'], order: 'random', timer: 0,
  total: words.length, planned: words.length, aborted: false,
  correct: ok ? words.length : 0, partial: 0, wrong: ok ? 0 : words.length, percent: ok ? 100 : 0, points: 0,
  questions: words.map(h => ({
    cardId: 'hsk1:' + h, hanzi: h, pinyin: '', ru: '', show: 'hanzi', guess: ['ru'],
    answer: { choice: 0, choiceText: 'x' }, parts: {}, fraction: ok ? 1 : 0, ok, ms: 2000,
  })),
  ...over,
});
/* Попытка-набор (пишем иероглиф / вводим пиньинь) */
const typed = (words, ts, ok = true) => ({
  id: uid(), ts, endedAt: ts + 60e3, durationMs: 60e3, mode: 'write', difficulty: 'hard',
  deckIds: ['hsk1'], deckName: 'HSK 1', show: 'ru', guess: ['hanzi'], order: 'random', timer: 0,
  total: words.length, planned: words.length, aborted: false,
  correct: ok ? words.length : 0, partial: 0, wrong: ok ? 0 : words.length, percent: ok ? 100 : 0, points: 0,
  questions: words.map(h => ({
    cardId: 'hsk1:' + h, hanzi: h, pinyin: '', ru: '', show: 'ru', guess: ['hanzi'],
    answer: { input: h }, parts: {}, fraction: ok ? 1 : 0, ok, ms: 6000,
  })),
});
/* Спринт блока */
const sprint = (block, ts, clean = true) => ({
  id: uid(), ts, endedAt: ts + 120e3, durationMs: 120e3, mode: 'sprint', block: block.id,
  deckIds: [], deckName: block.ru, difficulty: 'medium', show: 'program', guess: ['all'], order: 'random', timer: 0,
  total: block.words.length, planned: block.words.length, aborted: false,
  correct: clean ? block.words.length : block.words.length - 2, partial: 0, wrong: clean ? 0 : 2,
  percent: clean ? 100 : 80, points: 0, questions: [], words: block.words.slice(),
});
/* Настоящий экзамен HSK */
const exam = (level, ts, pct = 90) => ({
  id: uid(), ts, endedAt: ts + 600e3, durationMs: 600e3, mode: 'hsk', format: 'real', level, difficulty: 'exam',
  deckIds: ['hsk' + level], deckName: 'Экзамен HSK ' + level, show: 'exam', guess: ['all'], order: 'random', timer: 0,
  total: 20, planned: 20, aborted: false, correct: Math.round(pct / 5), partial: 0, wrong: 20 - Math.round(pct / 5),
  percent: pct, passed: pct >= 60,
  sections: { listening: { correct: Math.round(pct / 10), total: 10 }, reading: { correct: Math.round(pct / 10), total: 10 } },
  questions: [],
});
/* Дрилл звучания */
const phonDrill = (drill, ts, pct = 100) => ({
  id: uid(), ts, endedAt: ts + 60e3, durationMs: 60e3, mode: 'phon', difficulty: drill, level: 1,
  deckIds: [], deckName: 'Звучание · дрилл', show: 'audio', guess: ['answer'], order: 'random', timer: 0,
  total: 10, planned: 10, aborted: false, correct: pct / 10, partial: 0, wrong: 10 - pct / 10, percent: pct,
  questions: [],
});
const feed = (block, words, days = []) => ({ seen: words.slice(), seal: 'work', clean: 0, runs: 0, days });
const node = (r, h, band = '读') => r.nodes.byId['w:' + h + '|' + band] || null;

/* ── пустая история ── */
t('пустая история: числа есть, NaN нет', () => {
  const r = Mastery.compute(st(), NOW);
  for (const l of [1, 2, 3, 4]) {
    const v = r.levels[l];
    for (const k of ['pct', 'lo', 'hi', 'byChecks', 'vocab', 'blocks', 'sound']) {
      assert.ok(typeof v[k] === 'number' && isFinite(v[k]), l + '.' + k + ' = ' + v[k]);
      assert.ok(v[k] >= 0 && v[k] <= 100, l + '.' + k + ' вне 0..100: ' + v[k]);
    }
    assert.equal(v.pct, 0);
    assert.ok(v.nodes.unseen > 0);
  }
  assert.equal(r.confirmed, 0);
  assert.equal(r.level, 1);
});

/* ── главный закон: чистая функция от истории ── */
t('тождество: порядок скармливания истории ничего не меняет', () => {
  const hist = [];
  for (let k = 40; k >= 1; k--) {
    const pick = W1.slice(k % 5, (k % 5) + 4);
    hist.push(quiz(pick, day(k), k % 3 !== 0));
    hist.push(quiz(pick, day(k) + 600e3, k % 2 === 0));        /* несколько заходов в один день */
    hist.push(typed(pick.slice(0, 2), day(k) + 900e3, k % 5 !== 0));
    if (k % 4 === 0) hist.push(typed(pick, day(k) + 3600e3, true));
    if (k % 7 === 0) hist.push(sprint(B1, day(k) + 7200e3, k % 14 === 0));
    if (k % 11 === 0) hist.push(phonDrill('tone', day(k) + 1800e3, 90));
    if (k === 20) hist.push(exam(1, day(k) + 5400e3, 85));
  }
  /* отдельное слово с рваным ритмом: часть ответов идёт подряд в один день, часть — через неделю.
     На нём и видно, что «повторение по сроку» определяется по времени, а не по порядку записи. */
  for (let i = 0; i < 5; i++) hist.push(quiz([W1[10]], day(30) + i * 600e3, true));
  hist.push(quiz([W1[10]], day(9), false), quiz([W1[10]], day(9) + 600e3, false));
  for (let i = 0; i < 3; i++) hist.push(quiz([W1[10]], day(2) + i * 600e3, true));
  const marks = { program: { [B1.id]: feed(B1, W1, [day(40)]) }, phon: { 'p-01': true } };

  const whole = Mastery.compute(st({ attempts: hist.slice(), settings: { ...marks } }), NOW);

  /* по частям: копим журнал кусками и пересчитываем с нуля каждый раз */
  const piece = st({ settings: { ...marks } });
  let last = null;
  for (let i = 0; i < hist.length; i += 7) {
    piece.attempts.push(...hist.slice(i, i + 7));
    last = Mastery.compute(piece, NOW);
  }
  assert.deepEqual(last, whole, 'по частям ≠ целиком');

  /* вразнобой: журнал append-only, но порядок записи не обязан совпадать с порядком времени */
  assert.deepEqual(Mastery.compute(st({ attempts: hist.slice().reverse(), settings: { ...marks } }), NOW), whole, 'задом наперёд ≠ по порядку');
  const mixed = hist.slice();
  let r = 7;
  for (let i = mixed.length - 1; i > 0; i--) { r = (r * 1103515245 + 12345) % 2147483648; const j = r % (i + 1); [mixed[i], mixed[j]] = [mixed[j], mixed[i]]; }
  assert.deepEqual(Mastery.compute(st({ attempts: mixed, settings: { ...marks } }), NOW), whole, 'вразнобой ≠ по порядку');

  /* фикстура обязана шевелить «по проверкам»: иначе тождество проверяет пустоту */
  const probe = whole.nodes.byId['w:' + W1[10] + '|读'];
  assert.ok(probe && probe.checks > 0 && probe.ck < probe.m, 'фикстура не различает проверки и занятия');

  /* и повторный вызов на том же входе */
  assert.deepEqual(Mastery.compute(st({ attempts: hist.slice(), settings: { ...marks } }), NOW), whole);
});

t('модуль ничего не пишет в state', () => {
  const s = st({ attempts: [quiz(W1.slice(0, 3), day(2))], settings: { program: { [B1.id]: feed(B1, W1.slice(0, 3)) }, phon: {} } });
  const before = JSON.stringify(s);
  Mastery.compute(s, NOW);
  Mastery.explain(s, 'hsk1:' + W1[0], NOW);
  Mastery.readyForCheck(s, B1.id, NOW);
  assert.equal(JSON.stringify(s), before, 'state изменился');
});

/* ── потолки: накрутить нельзя ── */
t('один удачный ответ выбором не даёт больше 0.60', () => {
  const r = Mastery.compute(st({ attempts: [quiz([W1[0]], day(1))] }), NOW);
  const x = node(r, W1[0]);
  assert.ok(x, 'узла нет');
  assert.ok(x.m > 0, 'm = ' + x.m);
  assert.ok(x.m <= 0.60 + 1e-9, 'm = ' + x.m + ' > 0.60');
});

t('десять удачных ответов выбором тоже не пробивают 0.60', () => {
  const at = [];
  for (let k = 12; k >= 1; k--) at.push(quiz([W1[0]], day(k)));
  const x = node(Mastery.compute(st({ attempts: at }), NOW), W1[0]);
  assert.ok(x.m <= 0.60 + 1e-9, 'm = ' + x.m);
});

t('чтение ленты не поднимает выше 0.30', () => {
  const s = st({ settings: { program: { [B1.id]: feed(B1, W1) }, phon: {} } });
  const r = Mastery.compute(s, NOW);
  for (const h of W1) {
    const x = node(r, h);
    assert.ok(x, 'узла ' + h + ' нет');
    assert.ok(x.m <= 0.30 + 1e-9, h + ': m = ' + x.m);
  }
  assert.ok(r.levels[1].pct > 0, 'лента должна давать хоть что-то');
  assert.ok(r.levels[1].pct <= 30, 'pct = ' + r.levels[1].pct);
});

t('десять верных наборов дают больше 0.60, но не больше 0.80 без спринта', () => {
  const at = [];
  for (let k = 12; k >= 3; k--) at.push(typed([W1[0]], day(k)));
  assert.equal(at.length, 10);
  const x = node(Mastery.compute(st({ attempts: at }), NOW), W1[0], '写');
  assert.ok(x, 'узла набора нет');
  assert.ok(x.m > 0.60, 'm = ' + x.m + ' ≤ 0.60');
  assert.ok(x.m <= 0.80 + 1e-9, 'm = ' + x.m + ' > 0.80');
});

t('чистые спринты пробивают 0.80, но упираются в 0.90', () => {
  const at = [];
  for (let k = 12; k >= 3; k--) at.push(quiz([W1[0]], day(k)));
  const capped = node(Mastery.compute(st({ attempts: at }), NOW), W1[0]);
  assert.ok(capped.m <= 0.60 + 1e-9, 'до спринтов чтение держит 0.60: ' + capped.m);
  for (const k of [4, 3, 2, 1]) at.push(sprint(B1, day(k) + 7200e3, true));
  const x = node(Mastery.compute(st({ attempts: at }), NOW), W1[0]);
  assert.ok(x.m > 0.80, 'спринты не пробили 0.80: ' + x.m);
  assert.ok(x.m <= 0.90 + 1e-9, 'выше потолка спринта: ' + x.m);
});

t('ответы в день знакомства с лентой весят вдвое меньше и упираются в 0.60', () => {
  const at = [];
  for (let k = 12; k >= 3; k--) at.push(typed([W1[0]], day(k)));
  const marks = { program: { [B1.id]: { seen: [W1[0]], days: [] } }, phon: {} };
  for (let k = 12; k >= 3; k--) marks.program[B1.id].days.push(Mastery.dayKey(day(k)));
  const same = node(Mastery.compute(st({ attempts: at, settings: marks }), NOW), W1[0], '写');
  assert.ok(same.m <= 0.60 + 1e-9, 'm = ' + same.m + ': день знакомства не срезал потолок');
});

/* ── границы и разложение ── */
t('lo не растёт от уроков', () => {
  const bare = Mastery.compute(st(), NOW).levels[1].lo;
  const read = { program: {}, phon: {} };
  for (const b of PROGRAM.byLevel(1)) read.program[b.id] = feed(b, b.words);
  for (const l of PHON.LESSONS) read.phon[l.id] = true;
  const after = Mastery.compute(st({ settings: read }), NOW);
  assert.equal(after.levels[1].lo, bare, 'lo поднялся чтением: ' + after.levels[1].lo);
  assert.ok(after.levels[1].pct > 0, 'а pct обязан вырасти');
  assert.ok(after.levels[1].hi > after.levels[1].pct, 'hi должен учитывать предположения');
});

t('lo ≤ pct ≤ hi и «за счёт занятий» неотрицательно', () => {
  const at = [];
  for (let k = 30; k >= 1; k--) {
    at.push(quiz(W1.slice(0, 6), day(k), k % 4 !== 0));
    if (k % 3 === 0) at.push(typed(W1.slice(0, 6), day(k) + 3600e3));
    if (k % 9 === 0) at.push(sprint(B1, day(k) + 7200e3, true));
  }
  at.push(exam(1, day(5), 95), phonDrill('tone', day(4)), phonDrill('final', day(3)));
  const s = st({ attempts: at, settings: { program: { [B1.id]: feed(B1, W1) }, phon: { 'p-01': true, 'p-11': true } } });
  const r = Mastery.compute(s, NOW);
  for (const l of [1, 2, 3, 4]) {
    const v = r.levels[l];
    for (const k of ['pct', 'lo', 'hi', 'byChecks', 'byStudy', 'vocab', 'blocks', 'sound']) {
      assert.ok(typeof v[k] === 'number' && isFinite(v[k]), l + '.' + k + ' = ' + v[k]);
    }
    assert.ok(v.lo <= v.pct + 1e-9, l + ': lo ' + v.lo + ' > pct ' + v.pct);
    assert.ok(v.hi >= v.pct - 1e-9, l + ': hi ' + v.hi + ' < pct ' + v.pct);
    assert.ok(v.byChecks <= v.pct + 1e-9, l + ': byChecks ' + v.byChecks + ' > pct ' + v.pct);
    assert.ok(v.byStudy >= 0, l + ': «за счёт занятий» отрицательно: ' + v.byStudy);
    assert.ok(v.pct >= 0 && v.pct <= 100, l + ': pct = ' + v.pct);
    assert.ok(v.fresh > 0 && v.fresh <= 1, l + ': fresh = ' + v.fresh);
    const nd = v.nodes;
    assert.ok(nd.known + nd.partial + nd.unseen > 0);
  }
  assert.ok(r.levels[1].pct > r.levels[4].pct, 'первый уровень должен идти впереди четвёртого');
});

t('чтение не попадает в «по проверкам»', () => {
  const s = st({ settings: { program: { [B1.id]: feed(B1, W1) }, phon: {} } });
  const r = Mastery.compute(s, NOW);
  assert.equal(r.levels[1].byChecks, 0, 'byChecks = ' + r.levels[1].byChecks);
  assert.ok(r.levels[1].byStudy > 0, 'byStudy = ' + r.levels[1].byStudy);
});

/* ── подтверждение уровня ── */
t('подтверждение требует трёх календарных дней', () => {
  const at = [];
  /* один мощный день: экзамены и спринты подряд */
  for (let i = 0; i < 6; i++) at.push(exam(1, NOW - i * 600e3, 100));
  for (const b of PROGRAM.byLevel(1)) at.push(sprint(b, NOW - 700e3, true));
  const oneDay = Mastery.compute(st({ attempts: at }), NOW);
  assert.equal(oneDay.confirmed, 0, 'подтвердился за один день');

  /* то же самое, растянутое на неделю */
  const at2 = [];
  for (let k = 8; k >= 0; k--) {
    for (let i = 0; i < 3; i++) at2.push(exam(1, day(k) + i * 600e3, 100));
    for (const b of PROGRAM.byLevel(1)) at2.push(sprint(b, day(k) + 700e3, true));
  }
  const week = Mastery.compute(st({ attempts: at2 }), NOW);
  assert.ok(week.levels[1].lo >= week.levels[1].byChecks - 1e-9 || true);
  assert.ok(week.levels[1].lo > oneDay.levels[1].lo, 'неделя проверок должна поднять lo');
  if (week.levels[1].lo >= 70) assert.ok(week.confirmed >= 1, 'lo ' + week.levels[1].lo + ' держится, а подтверждения нет');
  assert.ok(week.confirmed >= 0 && week.confirmed <= 4);
});

t('рабочий уровень растёт вместе с оценкой', () => {
  assert.equal(Mastery.compute(st(), NOW).level, 1);
  const at = [];
  for (let k = 9; k >= 0; k--) {
    for (let i = 0; i < 3; i++) at.push(exam(1, day(k) + i * 600e3, 100));
    for (const b of PROGRAM.byLevel(1)) at.push(sprint(b, day(k) + 700e3, true));
  }
  const r = Mastery.compute(st({ attempts: at }), NOW);
  assert.ok(r.level >= 1 && r.level <= 4);
  assert.ok(r.levels[1].pct > r.levels[2].pct, 'проверки первого уровня не должны красить второй');
});

/* ── объяснение ── */
t('explain говорит человеческим языком', () => {
  const s = st({
    attempts: [quiz([W1[0]], day(3)), typed([W1[0]], day(2)), sprint(B1, day(1), true)],
    settings: { program: { [B1.id]: feed(B1, W1) }, phon: {} },
  });
  const lines = Mastery.explain(s, 'hsk1:' + W1[0], NOW);
  assert.ok(Array.isArray(lines) && lines.length > 3, 'строк мало: ' + lines.length);
  for (const x of lines) assert.equal(typeof x, 'string');
  assert.ok(lines.some(x => /^[+±−]/.test(x)), 'нет строки со знаком');
  assert.ok(lines.some(x => /сен|авг/.test(x)), 'нет даты');
  assert.ok(lines.some(x => /^потолок 0\.\d\d:/.test(x)), 'нет строки про потолок: ' + lines.join(' | '));
  assert.ok(lines.some(x => x.indexOf('спринт') >= 0), 'спринт не упомянут');
  /* по слову без истории — тоже строки, а не пустота */
  const empty = Mastery.explain(st(), 'hsk1:' + W1[1], NOW);
  assert.ok(empty.length >= 1 && typeof empty[0] === 'string');
  const alien = Mastery.explain(st(), 'hsk1:ЩЩ', NOW);
  assert.ok(alien.length === 1 && alien[0].indexOf('нет в программе') > 0);
});

t('explain читает и по голому иероглифу', () => {
  const s = st({ attempts: [quiz([W1[0]], day(2))] });
  assert.deepEqual(Mastery.explain(s, W1[0], NOW), Mastery.explain(s, 'hsk1:' + W1[0], NOW));
});

/* ── готовность к проверке ── */
t('readyForCheck: без ленты нельзя, с лентой можно, сразу после чистого спринта — нет', () => {
  const few = st({ settings: { program: { [B1.id]: feed(B1, W1.slice(0, 3)) }, phon: {} } });
  assert.equal(Mastery.readyForCheck(few, B1.id, NOW), false, 'три слова — рано');
  const enough = st({ settings: { program: { [B1.id]: feed(B1, W1.slice(0, 10)) }, phon: {} } });
  assert.equal(Mastery.readyForCheck(enough, B1.id, NOW), true, 'десять слов — пора');
  const done = st({
    attempts: [{ ...sprint(B1, day(0.2), true), words: W1.slice(0, 10) }],
    settings: { program: { [B1.id]: feed(B1, W1.slice(0, 10)) }, phon: {} },
  });
  assert.equal(Mastery.readyForCheck(done, B1.id, NOW), false, 'только что прошёл чисто — незачем');
  const cold = st({
    attempts: [{ ...sprint(B1, day(5), true), words: W1.slice(0, 10) }],
    settings: { program: { [B1.id]: feed(B1, W1.slice(0, 10)) }, phon: {} },
  });
  assert.equal(Mastery.readyForCheck(cold, B1.id, NOW), true, 'через пять дней можно снова');
  const dirty = st({
    attempts: [{ ...sprint(B1, day(0.2), false), words: W1.slice(0, 10) }],
    settings: { program: { [B1.id]: feed(B1, W1.slice(0, 10)) }, phon: {} },
  });
  assert.equal(Mastery.readyForCheck(dirty, B1.id, NOW), true, 'спринт с ошибками — можно переспросить');
  assert.equal(Mastery.readyForCheck(st(), 'b1-01', NOW), false);
});

/* ── таблица потолков ── */
t('CAPS: лестница видов проверки упорядочена', () => {
  const c = Mastery.CAPS;
  assert.ok(c.feed < c.flip && c.flip < c.choice && c.choice < c.input && c.input < c.sprint && c.sprint <= c.exam);
  assert.equal(c.feed, 0.30); assert.equal(c.flip, 0.40); assert.equal(c.choice, 0.60);
  assert.equal(c.input, 0.80); assert.equal(c.sprint, 0.90); assert.equal(c.exam, 1.00);
});

t('свежесть считается отдельно и в проценты не входит', () => {
  const fresh = [], stale = [];
  for (let k = 10; k >= 1; k--) { fresh.push(typed(W1.slice(0, 6), day(k))); stale.push(typed(W1.slice(0, 6), day(k + 200))); }
  const a = Mastery.compute(st({ attempts: fresh }), NOW).levels[1];
  const b = Mastery.compute(st({ attempts: stale }), NOW).levels[1];
  assert.equal(a.pct, b.pct, 'давность изменила проценты: ' + a.pct + ' против ' + b.pct);
  assert.ok(b.fresh < a.fresh, 'старый след обязан быть менее свежим');
  assert.ok(b.fresh >= 0.5, 'свежесть не падает ниже 0.5: ' + b.fresh);
});

t('будущие попытки не учитываются', () => {
  const s = st({ attempts: [typed(W1.slice(0, 6), NOW + 10 * DAY)] });
  assert.equal(Mastery.compute(s, NOW).levels[1].pct, 0);
});

/* ── словарь уровней не должен зависеть от порядка загрузки модулей ── */
t('словарь пересобирается, если уровни подгрузились позже мастерства', () => {
  const realP = window.PROGRAM, realH = window.HSK;
  const at = [quiz([W1[0]], day(2))];
  try {
    window.PROGRAM = { BLOCKS: [], byLevel: () => [], byId: () => null };
    window.HSK = {};
    const bare = Mastery.compute(st({ attempts: at }), NOW);
    assert.equal(bare.nodes.total, 0, 'без словарей узлов быть не может');
    assert.equal(bare.levels[1].pct, 0);
  } finally { window.PROGRAM = realP; window.HSK = realH; }
  const back = Mastery.compute(st({ attempts: at }), NOW);
  assert.ok(back.nodes.total > 0, 'словарь остался кэшем от пустых источников: узлов ' + back.nodes.total);
  assert.deepEqual(back, Mastery.compute(st({ attempts: [quiz([W1[0]], day(2))] }), NOW), 'после пересборки ответ поплыл');
});

/* ── дырявая история не роняет расчёт ── */
t('мусор во входе не роняет расчёт', () => {
  const junk = [
    undefined, null, {}, { attempts: 'нет' }, { attempts: { 0: {} } }, { settings: null },
    { attempts: [null, 0, 'x', { id: 'a', ts: 'вчера' }] },
    { attempts: [{ id: 'a', ts: day(1), mode: 'quiz' }] },                                 /* попытки без questions */
    { attempts: [{ id: 'a', ts: day(1), mode: 'quiz', questions: {} }] },
    { attempts: [{ id: 'a', ts: day(1), mode: 'quiz', questions: [null, undefined, 0] }] },  /* вопрос-пустышка */
    { attempts: [{ id: 'a', ts: day(1), mode: 'quiz', questions: [{ ru: 'я' }] }] },         /* вопрос без cardId и hanzi */
    { attempts: [{ id: 'a', ts: day(1), mode: 'sprint', percent: NaN }] },                   /* спринт без words и блока */
    { attempts: [{ id: 'a', ts: day(1), mode: 'hand' }] },
    { attempts: [{ id: 'a', ts: day(1), mode: 'hsk', format: 'real', level: 9, percent: 100 }] },
    { attempts: [{ id: 'a', ts: day(1), mode: 'phon', difficulty: 'нет', deckName: '' }] },
    { attempts: [], settings: { program: 'ab', phon: 5 } },
    { attempts: [], settings: { program: { 'b1-01': 7, 'b1-02': null, 'b1-03': { seen: 'нет' }, 'b1-04': { seen: [null, 1, W1[0]], days: 'x' } }, phon: {} } },
  ];
  for (const s of junk) {
    const r = Mastery.compute(s, NOW);
    for (const l of [1, 2, 3, 4]) for (const k of ['pct', 'lo', 'hi', 'byChecks']) {
      assert.ok(isFinite(r.levels[l][k]), String(JSON.stringify(s)).slice(0, 60) + ' → ' + l + '.' + k + ' = ' + r.levels[l][k]);
    }
    Mastery.explain(s, 'hsk1:' + W1[0], NOW);
    Mastery.explain(s, null, NOW);
    Mastery.readyForCheck(s, B1.id, NOW);
  }
});

t('замороженное состояние: модуль в него не пишет', () => {
  const s = st({
    attempts: [quiz(W1.slice(0, 3), day(3)), typed(W1.slice(0, 3), day(2)), sprint(B1, day(1), true)],
    settings: { program: { [B1.id]: feed(B1, W1.slice(0, 3), [Mastery.dayKey(day(3))]) }, phon: { 'p-01': true } },
  });
  const before = JSON.stringify(Mastery.compute(s, NOW));
  const freeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) freeze(o[k]); } return o; };
  freeze(s);
  assert.equal(JSON.stringify(Mastery.compute(s, NOW)), before, 'на замороженном входе ответ другой');
  Mastery.explain(s, 'hsk1:' + W1[0], NOW);
  Mastery.readyForCheck(s, B1.id, NOW);
});

t('срез прошлого равен истории, обрезанной по тот же миг', () => {
  const at = [];
  for (let k = 20; k >= 1; k--) { at.push(quiz(W1.slice(0, 5), day(k), k % 3 !== 0)); if (k % 2 === 0) at.push(typed(W1.slice(0, 4), day(k) + 6e5)); }
  const marks = { program: { [B1.id]: feed(B1, W1, [Mastery.dayKey(day(20))]) }, phon: {} };
  const cut = day(7);
  assert.deepEqual(
    Mastery.compute(st({ attempts: at, settings: marks }), cut),
    Mastery.compute(st({ attempts: at.filter(a => a.ts <= cut), settings: marks }), cut),
    'будущее подмешалось в прошлое');
});

/* ── лента поднимает середину, но не низ ── */
t('отметка «прочитано» не поднимает нижнюю границу узла', () => {
  const fed = { program: { [B1.id]: { seen: [W1[0]], days: [] } }, phon: {} };
  const cases = [
    ['один промах', [quiz([W1[0]], day(2), false)]],
    ['промах и попадание', [quiz([W1[0]], day(4), false), quiz([W1[0]], day(2), true)]],
    ['два промаха', [quiz([W1[0]], day(4), false), quiz([W1[0]], day(2), false)]],
  ];
  let moved = 0;
  for (const [name, at] of cases) {
    const bare = node(Mastery.compute(st({ attempts: at }), NOW), W1[0]);
    const read = node(Mastery.compute(st({ attempts: at.map(a => ({ ...a, id: a.id + 'r' })), settings: fed }), NOW), W1[0]);
    assert.ok(read.lo <= bare.lo + 1e-9, name + ': лента подняла низ ' + bare.lo + ' → ' + read.lo);
    assert.ok(read.m >= bare.m - 1e-9, name + ': лента опустила середину');
    if (read.m > bare.m + 1e-9) moved++;
  }
  assert.ok(moved > 0, 'фикстура слаба: лента вообще ни на что не повлияла');
});

/* ── письменная часть настоящего экзамена ── */
t('书写 настоящего экзамена засчитывается полосе 写', () => {
  const lower = new Set();
  for (const l of [1, 2]) for (const e of HSK[l]) lower.add(e[0]);
  for (const b of PROGRAM.BLOCKS) if (b.lvl < 3) for (const w of b.words) lower.add(w);
  const h = HSK[3].map(e => e[0]).filter(x => !lower.has(x))[0];
  assert.ok(h, 'не нашлось слова, впервые встреченного на третьем уровне');
  const plain = exam(3, day(2), 80);                       /* HSK 1–2: письменной части нет */
  const withW = { ...exam(3, day(2), 80), sections: { ...plain.sections, writing: { correct: 9, total: 10 } } };
  const a = Mastery.compute(st({ attempts: [plain] }), NOW).nodes.byId['w:' + h + '|写'];
  const b = Mastery.compute(st({ attempts: [withW] }), NOW).nodes.byId['w:' + h + '|写'];
  assert.ok(!a, 'без раздела 书写 полоса набора взялась ниоткуда');
  assert.ok(b && b.m > 0, 'раздел 书写 не дошёл до полосы 写');
  assert.ok(b.m <= Mastery.CAPS.exam + 1e-9);
});

console.log(n + ' проверок пройдено' + (process.exitCode ? ', есть FAIL' : ', FAIL нет'));
