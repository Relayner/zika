/* Донесение: тема, строгая проверка разбора, очки и попытка.
   Сеть не трогаем — fetch инъектируется через Report.setFetch.
   Запуск: node test/report.test.mjs — ноль строк FAIL обязателен. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
global.window = global;
for (const f of ['hsk', 'freq', 'pinyin', 'phonetics', 'stats', 'srs', 'skill', 'campaign', 'boss', 'program', 'traps', 'fires', 'ledger', 'speechin', 'report'])
  require('../src/js/' + f + '.js');
const { Report, PROGRAM, Boss, Fires, Ledger, TRAPS, SpeechIn } = global;

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL', name, '—', e.message); process.exitCode = 1; } };
const ta = async (name, fn) => { try { await fn(); n++; } catch (e) { console.error('FAIL', name, '—', e.message); process.exitCode = 1; } };

const DAY = 24 * 3600e3;
const NOW = new Date(2026, 8, 12, 12, 0, 0).getTime();      /* полдень: сутки не съезжают */

/* ── подготовка состояния ── */
function blank(extra) {
  return Object.assign({ attempts: [], cards: [], decks: [], cardStats: {}, settings: {} }, extra || {});
}
/* Изученные слова уровня: Boss.levelOf смотрит именно сюда */
function studied(lvl, k) {
  const cs = {};
  const bank = global.HSK[lvl] || [];
  for (let i = 0; i < k && i < bank.length; i++) cs['hsk' + lvl + ':' + bank[i][0]] = { asked: 3, correct: 3, mastered: true, streak: 3 };
  return cs;
}
/* Прошлое донесение: в журнале от него важны mode, ts и block */
const past = (block, ts) => ({
  id: 'rp-' + ts, ts, endedAt: ts + 6e4, durationMs: 6e4, mode: 'report', difficulty: 'report', level: 1,
  deckIds: [], deckName: 'донесение', total: 0, planned: 0, aborted: false, correct: 0, partial: 0, wrong: 0,
  percent: 0, questions: [], block, fixedPts: true, points: 30,
});

/* Запись примерно на минуту: 72 знака — выше минимума HSK2 (60) */
const TEXT = '我昨天去了商店，买了两件衣服。衣服有点儿贵，可是很漂亮。我没吃饭就回家了。今天早上我七点起床，喝了一杯茶，然后去学校学习汉语。下午我和朋友一起看电影，晚上在家休息。';
const TARGETS = [
  { node: 'g:b1-09', ru: '了 — завершённость', rule: '了 после глагола показывает, что действие состоялось.' },
  { node: 'gram:bu-mei', ru: 'Какое «не»', rule: '不 отрицает привычку, 没 — состоявшийся факт.' },
];
const FIRES = [{ id: 'gram:bu-mei', ru: 'Какое «не»' }];
const ctx = { text: TEXT, targets: TARGETS, fires: FIRES, level: 2 };

/* ── тема ── */
t('тема берётся по рабочему уровню Boss.levelOf, а не по рекомендации Skill', () => {
  for (const lvl of [1, 2, 3]) {
    const st = blank({ cardStats: studied(lvl, 30) });
    assert.equal(Boss.levelOf(st), lvl, 'подготовка: уровень ' + lvl);
    const top = Report.topic(st, NOW);
    const block = PROGRAM.byId(top.block);
    assert.ok(block, 'блок найден');
    assert.equal(block.lvl, lvl, 'блок того же уровня');
    assert.equal(top.lvl, lvl);
  }
});

t('тема — чистая функция: тот же день и та же история дают тот же блок', () => {
  const st = blank({ cardStats: studied(2, 30) });
  const a = Report.topic(st, NOW), b = Report.topic(st, NOW + 3600e3);
  assert.equal(a.block, b.block);
  assert.deepEqual(a.hints, b.hints);
  assert.deepEqual(a.targets, b.targets);
});

t('тема не повторяется два дня подряд', () => {
  const st = blank({ cardStats: studied(2, 30) });
  const today = Report.topic(st, NOW);
  const withPast = blank({ cardStats: studied(2, 30), attempts: [past(today.block, NOW - 2 * 3600e3)] });
  assert.notEqual(Report.topic(withPast, NOW).block, today.block, 'сегодняшний блок не выдаётся снова');
  const yest = blank({ cardStats: studied(2, 30), attempts: [past(today.block, NOW - DAY)] });
  assert.notEqual(Report.topic(yest, NOW).block, today.block, 'вчерашний блок не выдаётся снова');
  const old = blank({ cardStats: studied(2, 30), attempts: [past(today.block, NOW - 3 * DAY)] });
  assert.equal(Report.topic(old, NOW).block, today.block, 'позавчерашний и раньше — снова можно');
});

t('тема: опоры из блока, мишени — правило блока и огни', () => {
  const st = blank({ cardStats: studied(2, 30) });
  const top = Report.topic(st, NOW);
  const block = PROGRAM.byId(top.block);
  assert.equal(top.hints.length, 3, 'три опоры');
  for (const w of top.hints) assert.ok(block.words.includes(w), 'опора из блока: ' + w);
  assert.equal(top.targets[0].node, 'g:' + block.id, 'первая мишень — правило блока');
  assert.ok(top.targets[0].rule, 'у мишени есть правило');
  assert.ok(top.can && top.ru.includes(block.ru), 'в задании названа тема блока');
  assert.deepEqual(top.sec, [45, 60], 'длина монолога для HSK2 — 45–60 секунд');
});

/* ── одно донесение в день ── */
t('canToday чист по истории', () => {
  assert.equal(Report.canToday(blank(), NOW), true, 'пустая история — можно');
  assert.equal(Report.canToday(blank({ attempts: [past('b1-01', NOW - 3600e3)] }), NOW), false, 'сегодня уже было');
  assert.equal(Report.canToday(blank({ attempts: [past('b1-01', NOW - DAY)] }), NOW), true, 'вчерашнее не мешает');
  const other = Object.assign(past('b1-01', NOW - 3600e3), { mode: 'quiz' });
  assert.equal(Report.canToday(blank({ attempts: [other] }), NOW), true, 'чужой режим не считается');
});

/* ── строгая проверка разбора ── */
t('выдуманные цитаты отбрасываются', () => {
  const raw = { findings: [
    { quote: '有点儿贵', fix: '有点儿贵', node: 'g:b1-09', trap: 'gram:bu-mei', why: 'верно', sev: 'оговорка' },
    { quote: '我是学生', fix: '我是学生', why: 'этого в записи не было' },
    { quote: '', why: 'пусто' },
  ] };
  const res = Report.validate(raw, ctx);
  assert.equal(res.findings.length, 1, 'осталась одна находка');
  assert.equal(res.dropped, 2);
  for (const f of res.findings) assert.ok(TEXT.includes(f.quote), 'цитата есть в записи');
});

t('находок не больше восьми, лишние отбрасываются', () => {
  const raw = { findings: Array.from({ length: 12 }, () => ({ quote: '衣服', fix: '衣服', node: 'g:b1-09' })) };
  const res = Report.validate(raw, ctx);
  assert.equal(res.findings.length, Report.MAX_FINDINGS);
  assert.equal(res.dropped, 12 - Report.MAX_FINDINGS);
});

t('несуществующие узлы и ловушки стираются, а не заводят огонь', () => {
  const raw = { findings: [{ quote: '两件衣服', fix: '两件衣服', node: 'g:придумано', trap: 'le-missing', why: 'ключей таких нет' }] };
  const res = Report.validate(raw, ctx);
  assert.equal(res.findings.length, 1, 'сама находка с верной цитатой остаётся');
  assert.equal(res.findings[0].node, null);
  assert.equal(res.findings[0].trap, null, 'ловушка не из каталога в попытку не попадёт');
  assert.equal(res.cleaned, 2);
});

t('узел, который сам является ловушкой, становится ловушкой находки', () => {
  const raw = { findings: [{ quote: '我没吃饭', fix: '我没吃饭', node: 'gram:bu-mei' }] };
  const res = Report.validate(raw, ctx);
  assert.equal(res.findings[0].trap, 'gram:bu-mei');
  assert.ok(TRAPS.byId('gram:bu-mei'), 'ловушка есть в каталоге');
});

t('отброшено больше трети — разбор неточный и вес вдвое меньше', () => {
  const good = { quote: '衣服', fix: '衣服', node: 'g:b1-09' };
  const bad = { quote: '完全没有的句子', fix: '—' };
  const clean = Report.validate({ findings: [good, good, good, bad] }, ctx);
  assert.equal(clean.loose, false, 'четверть отброшенного — разбор в силе');
  assert.equal(clean.weight, 1);
  const loose = Report.validate({ findings: [good, bad, bad] }, ctx);
  assert.equal(loose.loose, true);
  assert.equal(loose.weight, Report.LOOSE_WEIGHT);
});

t('случаи с несуществующим узлом не считаются', () => {
  const res = Report.validate({ findings: [], cases: [
    { node: 'g:b1-09', need: 4, ok: 3 },
    { node: 'выдумка', need: 5, ok: 5 },
    { node: 'gram:bu-mei', need: 2, ok: 9 },
  ] }, ctx);
  assert.equal(res.cases.length, 2);
  assert.equal(res.cases[1].ok, 2, 'удач не больше, чем случаев');
});

/* ── очки ── */
const базовый = { chars: 90, minChars: 60, lvl: 2, weight: 1 };
const pts = o => Report.points(Object.assign({}, базовый, o)).points;

t('база платится за монолог не короче минимума', () => {
  assert.equal(pts({ moves: [] }), Report.PTS.base);
  assert.equal(pts({ chars: 30, moves: [] }), 0, 'короткий монолог базы не даёт');
});

t('очки растут по правилам: гаснет < потушен < потушен после возврата', () => {
  const f = pts({ moves: [{ id: 'a', to: 'fading' }] });
  const o = pts({ moves: [{ id: 'a', to: 'out', from: 'burning' }] });
  const r = pts({ moves: [{ id: 'a', to: 'out', from: 'relit' }] });
  assert.equal(f, Report.PTS.base + Report.PTS.fading);
  assert.equal(o, Report.PTS.base + Report.PTS.out);
  assert.equal(r, Report.PTS.base + Report.PTS.relit);
  assert.ok(f < o && o < r, 'порядок платы');
  assert.ok(pts({ moves: [{ id: 'a', to: 'burning' }] }) === Report.PTS.base, 'разгоревшийся огонь не платит');
});

t('потолок дня не превышается, а части сходятся с суммой', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ id: 'f' + i, to: 'out', from: 'relit' }));
  const res = Report.points(Object.assign({}, базовый, { moves: many }));
  assert.equal(res.points, Report.PTS.cap, 'ровно потолок');
  assert.ok(res.points <= 150);
  const sum = res.parts.reduce((s, p) => s + p.n, 0);
  assert.ok(Math.abs(sum - res.points) < 1e-9, 'сумма частей равна очкам: ' + sum + ' против ' + res.points);
  assert.ok(res.parts.some(p => p.n < 0), 'срезание показано отдельной строкой');
});

t('неточный разбор режет плату за огни, но не за сам монолог', () => {
  const move = [{ id: 'a', to: 'out', from: 'burning' }];
  const full = pts({ moves: move });
  const half = pts({ moves: move, weight: Report.LOOSE_WEIGHT });
  assert.equal(full, Report.PTS.base + Report.PTS.out);
  assert.equal(half, Report.PTS.base + Report.PTS.out * Report.LOOSE_WEIGHT, 'база цела, огни вдвое дешевле');
  assert.ok(half < full && half > Report.PTS.base, 'скидка есть, но монолог оплачен полностью');
  /* Знаки считает сам телефон: выдумки разбора не делают монолог короче */
  assert.equal(pts({ moves: [], weight: Report.LOOSE_WEIGHT }), Report.PTS.base, 'без огней неточность не отнимает ничего');
  assert.equal(pts({ chars: 30, moves: [], weight: Report.LOOSE_WEIGHT }), 0, 'короткий монолог всё равно не оплачен');
  const parts = Report.points(Object.assign({}, базовый, { moves: move, weight: Report.LOOSE_WEIGHT })).parts;
  assert.ok(Math.abs(parts.reduce((s, p) => s + p.n, 0) - half) < 1e-9, 'части сходятся с суммой');
});

t('годные находки сверх восьми — не улика выдумки', () => {
  const good = i => ({ quote: '衣服', fix: '衣服', node: 'g:b1-09', why: 'n' + i });
  for (const n of [9, 13, 20]) {
    const r = Report.validate({ findings: Array.from({ length: n }, (_, i) => good(i)) }, ctx);
    assert.equal(r.findings.length, Report.MAX_FINDINGS, 'в попытку идут восемь: ' + n);
    assert.equal(r.over, n - Report.MAX_FINDINGS, 'лишние посчитаны отдельно: ' + n);
    assert.equal(r.loose, false, 'все цитаты настоящие — разбор в силе: ' + n);
    assert.equal(r.weight, 1);
  }
  /* А выдумки среди тех же двадцати разбор неточным делают */
  const bad = { quote: '完全没有的句子', fix: '—' };
  const mixed = Report.validate({ findings: Array.from({ length: 12 }, (_, i) => (i % 2 ? good(i) : bad)) }, ctx);
  assert.equal(mixed.loose, true, 'половина цитат выдумана — веры вполовину');
});

t('выдуманные случаи считаются уликой наравне с находками', () => {
  const good = { quote: '衣服', fix: '衣服', node: 'g:b1-09' };
  const r = Report.validate({ findings: [good, good], cases: [
    { node: 'выдумка-1', need: 3, ok: 3 }, { node: 'выдумка-2', need: 3, ok: 3 }, { node: 'g:b1-09', need: 2, ok: 2 },
  ] }, ctx);
  assert.equal(r.cases.length, 1);
  assert.equal(r.total, 5, 'меряем против всего, что прислал разбор');
  assert.equal(r.loose, false, 'две выдумки из пяти — ещё не большинство');
  const worse = Report.validate({ findings: [good], cases: [
    { node: 'выдумка-1', need: 3, ok: 3 }, { node: 'выдумка-2', need: 3, ok: 3 },
  ] }, ctx);
  assert.equal(worse.loose, true, 'две выдумки из трёх — разбор неточный');
});

t('донесение не выбивается из дневной нормы', () => {
  const CAP = global.Campaign.CAP;
  assert.ok(Report.PTS.cap <= CAP * 0.4, 'потолок донесения — меньше половины дневной нормы ' + CAP);
});

/* ── попытка ── */
function resOf(over) {
  return Object.assign(Report.validate({
    corrected: TEXT,
    findings: [{ quote: '我没吃饭', fix: '我没吃饭就回家了', node: 'gram:bu-mei', why: 'здесь верно', sev: 'оговорка' }],
    cases: [{ node: 'gram:bu-mei', need: 3, ok: 2 }, { node: 'g:b1-09', need: 4, ok: 4 }],
    good: ['порядок слов выдержан'],
    rubric: { level: 'A2', note: 'связная запись' },
  }, ctx), over || {});
}
const META = { startedAt: NOW - 75e3, endedAt: NOW, now: NOW, topic: { block: 'b2-06', blockRu: 'Время и планы', lvl: 2 } };

t('попытка: режим, назначенная цена и случаи', () => {
  const st = blank({ cardStats: studied(2, 30) });
  const a = Report.attempt(st, resOf(), META);
  assert.equal(a.mode, 'report');
  assert.equal(a.difficulty, 'report');
  assert.equal(a.fixedPts, true, 'цену назначает режим');
  assert.equal(a.points, Report.points(Object.assign({}, resOf(), { moves: a.moves })).points);
  assert.equal(a.p2fix, a.points);
  assert.ok(a.points > 0 && a.points <= Report.PTS.cap);
  assert.ok(a.questions.length > 0, 'случаи записаны');
  const miss = a.questions.filter(q => !q.ok);
  assert.equal(miss.length, 1);
  assert.equal(miss[0].hanzi, '我没吃饭', 'у промаха в hanzi — цитата');
  assert.ok(TEXT.includes(miss[0].hanzi));
  assert.equal(a.questions.filter(q => q.ok).length, 2 + 4, 'удачные случаи из cases');
  for (const q of a.questions) assert.ok(q.ms >= 0 && q.cardId == null, 'случай не карточка');
  assert.equal(a.block, 'b2-06');
  assert.equal(a.total, a.questions.length);
});

t('подпись режима по-русски', () => {
  global.App = { LABELS: { mode: {} } };
  delete require.cache[require.resolve('../src/js/report.js')];
  require('../src/js/report.js');
  assert.equal(global.App.LABELS.mode.report, 'Донесение');
  delete global.App;
  delete require.cache[require.resolve('../src/js/report.js')];
  require('../src/js/report.js');
});

t('попытка — чистая функция: порядок журнала ничего не меняет', () => {
  const hist = [past('b1-01', NOW - 5 * DAY), past('b1-02', NOW - 4 * DAY), past('b1-03', NOW - 3 * DAY)];
  const st1 = blank({ cardStats: studied(2, 30), attempts: hist.slice() });
  const st2 = blank({ cardStats: studied(2, 30), attempts: hist.slice().reverse() });
  const a1 = Report.attempt(st1, resOf(), META);
  const a2 = Report.attempt(st2, resOf(), META);
  assert.deepEqual(a1, a2, 'та же история в другом порядке — та же попытка');
  const again = Report.attempt(st1, resOf(), META);
  assert.deepEqual(a1, again, 'повторный расчёт даёт то же самое');
});

t('книга v2 берёт назначенную цену без деградации и доплат', () => {
  const st = blank({ cardStats: studied(2, 30), settings: {} });
  const a = Report.attempt(st, resOf(), META);
  st.attempts.push(a);
  assert.equal(Ledger.computePoints(st, a, NOW), a.points, 'пересчёт книги даёт ту же цену');
  Ledger.rebuild(st, NOW);
  assert.equal(a.p2, a.points);
  assert.equal(Ledger.needsRebuild(st), false, 'книга собрана');
});

t('случаи ложатся в реестр огней', () => {
  const st = blank({ cardStats: studied(2, 30) });
  const a = Report.attempt(st, resOf(), META);
  const reg = Fires.compute({ attempts: [a] }, NOW);
  const f = reg.find(x => x.id === 'gram:bu-mei');
  assert.ok(f, 'огонь по ловушке разбора появился');
  assert.equal(f.cases.length, 3, 'три случая: один промах и два чистых');
});

/* ── переходы огней ── */
/* Попытка-заход с одной ловушкой: столько случаев, сколько просили, и все верны или все мимо */
const trapRun = (ts, n, ok) => ({
  id: 'q' + ts, ts, endedAt: ts + 6e4, durationMs: 6e4, mode: 'quiz', difficulty: 'medium', level: 1,
  deckIds: ['hsk1'], deckName: 'Проверка', total: n, planned: n, aborted: false,
  correct: ok ? n : 0, partial: 0, wrong: ok ? 0 : n, percent: ok ? 100 : 0, points: 10,
  questions: Array.from({ length: n }, () => ({ cardId: null, hanzi: '想', pinyin: '', ru: '', trap: 'gram:xiang-yao', answer: {}, fraction: ok ? 1 : 0, ok, ms: 5000 })),
});

t('чистые случаи донесения двигают огонь и оплачиваются', () => {
  const hist = [trapRun(NOW - 6 * DAY, 1, false), trapRun(NOW - 5 * DAY, 1, false), trapRun(NOW - DAY, 3, true)];
  const st = blank({ cardStats: studied(2, 30), attempts: hist });
  const before = Fires.compute(st, NOW).find(f => f.id === 'gram:xiang-yao');
  assert.equal(before.status, 'burning', 'до донесения огонь горит');
  const res = Report.validate({ findings: [], cases: [{ node: 'gram:xiang-yao', need: 3, ok: 3 }] },
    { text: TEXT, targets: [{ node: 'gram:xiang-yao', ru: 'Хочу или собираюсь' }], fires: [], level: 2 });
  const a = Report.attempt(st, res, META);
  assert.equal(a.moves.length, 1, 'один переход');
  assert.equal(a.moves[0].to, 'fading');
  assert.equal(a.points, Report.PTS.base + Report.PTS.fading, 'база плюс плата за «гаснет»');
  assert.equal(a.bounty, undefined, 'огонь ещё не потушен — платы за тушение нет');
  assert.equal(Fires.compute(Object.assign({}, st, { attempts: st.attempts.concat([a]) }), NOW).find(f => f.id === 'gram:xiang-yao').status, 'fading');
});

t('одно донесение огонь не гасит: серия набирается в разные дни', () => {
  const hist = [trapRun(NOW - 6 * DAY, 1, false), trapRun(NOW - 5 * DAY, 1, false)];
  const st = blank({ cardStats: studied(2, 30), attempts: hist });
  const res = Report.validate({ findings: [], cases: [{ node: 'gram:xiang-yao', need: 4, ok: 4 }] },
    { text: TEXT, targets: [{ node: 'gram:xiang-yao', ru: 'Хочу или собираюсь' }], fires: [], level: 2 });
  const a = Report.attempt(st, res, META);
  assert.equal(a.moves.length, 0, 'без чистого дня до этого перехода нет');
  assert.equal(a.points, Report.PTS.base, 'платим только за монолог');
});

t('потушенный огонь платит больше и оставляет след в попытке', () => {
  const hist = [trapRun(NOW - 20 * DAY, 1, false), trapRun(NOW - 19 * DAY, 1, false),
    trapRun(NOW - 10 * DAY, 3, true), trapRun(NOW - 9 * DAY, 3, true)];
  const st = blank({ cardStats: studied(2, 30), attempts: hist });
  const res = Report.validate({ findings: [], cases: [{ node: 'gram:xiang-yao', need: 3, ok: 3 }] },
    { text: TEXT, targets: [{ node: 'gram:xiang-yao', ru: 'Хочу или собираюсь' }], fires: [], level: 2 });
  const a = Report.attempt(st, res, META);
  assert.equal(a.moves.length, 1);
  assert.equal(a.moves[0].to, 'out');
  assert.equal(a.points, Report.PTS.base + Report.PTS.out);
  assert.equal(a.bounty, Report.PTS.out, 'след платы за тушение');
  assert.ok(a.points > Report.PTS.base + Report.PTS.fading, 'тушение дороже, чем «гаснет»');
});

/* ── разбор по сети ── */
const okAnswer = () => ({
  ok: true, left: 3, corrected: TEXT,
  findings: [{ quote: '我没吃饭', fix: '我没吃饭就回家了', node: 'gram:bu-mei', why: 'верно', sev: 'оговорка' }],
  cases: [{ node: 'gram:bu-mei', need: 2, ok: 1 }],
  good: ['фразы связаны'], rubric: { level: 'A2', note: 'связно' },
});
const resp = obj => ({ ok: true, status: 200, json: async () => obj });

await ta('analyze шлёт то, что обещано, и проверяет ответ', async () => {
  const sent = [];
  Report.setFetch(async (url, opt) => { sent.push({ url, body: JSON.parse(opt.body) }); return resp(okAnswer()); });
  const st = blank({ cardStats: studied(2, 30), settings: {} });
  const res = await Report.analyze({ state: st, text: TEXT, targets: TARGETS, fires: FIRES, level: 2, tz: 'Europe/Moscow' }, { url: 'https://x.test' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://x.test/check');
  const b = sent[0].body;
  assert.equal(b.ver, 'v2');
  assert.equal(b.mode, 'report');
  assert.equal(b.level, 2);
  assert.equal(b.text, TEXT);
  assert.equal(b.tz, 'Europe/Moscow');
  assert.ok(b.did && b.did.length >= 8, 'идентификатор устройства ушёл');
  assert.equal(b.did, st.settings.did, 'и сохранён в настройках');
  assert.equal(b.targets.length, 2);
  assert.equal(res.findings.length, 1);
  assert.equal(res.chars, Report.size(TEXT).chars);
  const res2 = await Report.analyze({ state: st, text: TEXT, targets: TARGETS, fires: FIRES, level: 2 }, { url: 'https://x.test' });
  assert.equal(sent[1].body.did, b.did, 'идентификатор не меняется от раза к разу');
  assert.ok(res2.ok);
  Report.setFetch(null);
});

await ta('одна повторная попытка при сбое сети, потом честный отказ', async () => {
  let calls = 0;
  Report.setFetch(async () => { calls++; if (calls === 1) throw new Error('сеть'); return resp(okAnswer()); });
  const st = blank({ settings: {} });
  const res = await Report.analyze({ state: st, text: TEXT, targets: TARGETS, fires: FIRES, level: 2 }, { url: 'https://x.test' });
  assert.equal(calls, 2, 'один повтор');
  assert.ok(res.ok);
  calls = 0;
  Report.setFetch(async () => { calls++; throw new Error('сеть'); });
  await assert.rejects(() => Report.analyze({ state: st, text: TEXT, targets: TARGETS, fires: FIRES, level: 2 }, { url: 'https://x.test' }));
  assert.equal(calls, 2, 'больше двух заходов не делаем');
  Report.setFetch(null);
});

await ta('квота воркера доходит словами', async () => {
  Report.setFetch(async () => ({ ok: false, status: 429, json: async () => ({ error: 'quota' }) }));
  const st = blank({ settings: {} });
  await assert.rejects(
    () => Report.analyze({ state: st, text: TEXT, targets: TARGETS, fires: FIRES, level: 2 }, { url: 'https://x.test' }),
    e => /разбор/i.test(e.message) || /сегодня/i.test(e.message));
  Report.setFetch(null);
});

/* ── честность ── */
t('список того, чего разбор не видит', () => {
  const list = Report.whatVoiceMisses();
  assert.ok(Array.isArray(list) && list.length >= 3);
  const all = list.join(' ');
  for (const word of ['Тон', 'роизнош', 'нтонац', 'частиц']) assert.ok(all.includes(word), 'названо: ' + word);
});

t('объём считается знаками китайского, а не длиной строки', () => {
  assert.equal(Report.size('我去商店').chars, 4);
  assert.equal(Report.size('我去商店 hello привет').chars, 4, 'обрывки распознавания не считаются');
  assert.equal(Report.size('').chars, 0);
});

if (!process.exitCode) console.log('OK', n, 'проверок');
