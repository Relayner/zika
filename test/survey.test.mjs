/* Проверка «Съёмки местности»: сборка трёх частей, лестница, псевдослова, чистота и цена.
   Запуск: node test/survey.test.mjs — ноль строк FAIL обязателен. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
global.window = global;
for (const f of ['hsk', 'freq', 'pinyin', 'stats', 'srs', 'campaign', 'skill', 'program', 'phonetics', 'boss', 'ledger',
  'gram-b1', 'gram-b2', 'gram-b3', 'gram-b4', 'grammar', 'survey'])
  require('../src/js/' + f + '.js');
const { Survey, Campaign, PROGRAM, GRAMMAR } = global;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL', name, '—', e.message); } };

const NOW = new Date(2026, 8, 12, 12, 0, 0).getTime();
const EMPTY = { attempts: [], settings: {} };
const P = [1, 2, 3].map(n => Survey.build(EMPTY, n));

/* Ответ на задание: right — отвечать верно (для самооценки «знаю») */
function answer(task, right) {
  if (task.kind === 'know') return right ? (task.pseudo ? Survey.NO : Survey.YES) : (task.pseudo ? Survey.YES : Survey.NO);
  if (task.key == null) return Survey.YES;
  return right ? task.key : wrongFor(task);
}
function wrongFor(task) {
  if (Array.isArray(task.options)) { const o = task.options.find(x => Survey.norm(x) !== Survey.norm(task.key)); if (o) return o; }
  if (task.kind === 'set') return String(task.key).split('').reverse().join('') + '错';
  return 'не знаю такого';
}
const sheet = (tasks, fn) => tasks.map((task, i) => ({ task, given: answer(task, fn(task, i)) }));

/* Попытка съёмки из листа ответов — как её сохраняет экран */
let seq = 0;
function attemptOf(part, sheetRows, ts) {
  const qs = sheetRows.map(({ task, given }) => {
    const j = Survey.judge(task, given);
    return { kind: task.kind, sub: task.sub, band: task.band, group: task.group, part, id: task.id, cardId: task.self ? undefined : task.cardId,
      blockId: task.blockId, rung: task.rung, rate: task.rate, pseudo: !!task.pseudo, word: task.word,
      hanzi: task.self ? '' : (task.hanzi || ''), pinyin: task.pinyin || '', ru: task.ru || '', show: task.show || '',
      why: task.why || '', key: task.key, given: j.mine, ok: j.ok, fraction: j.fraction, scored: j.scored, yes: j.yes, ms: 5000 };
  });
  const scored = qs.filter(q => q.scored);
  const correct = scored.filter(q => q.ok).length;
  return { id: 'sv' + (++seq), ts, endedAt: ts + 6e5, durationMs: 6e5, mode: 'survey', part, difficulty: 'survey', level: 1,
    deckIds: ['hsk1'], deckName: 'съёмка местности', total: scored.length, planned: qs.length, aborted: false,
    correct, partial: 0, wrong: scored.length - correct, percent: scored.length ? Math.round(correct / scored.length * 100) : 0,
    fixedPts: true, points: 120, p2fix: 120, questions: qs };
}

/* ── объём и состав частей ── */
t('три части собираются, объём в заявленных рамках', () => {
  P.forEach((tasks, i) => {
    const part = Survey.PARTS[i];
    assert.ok(tasks.length >= part.count - 4 && tasks.length <= part.count, `часть ${i + 1}: заданий ${tasks.length}, в описании ${part.count}`);
    assert.ok(tasks.every(x => x.kind && x.prompt && x.sub && x.band != null && x.id), 'у каждого задания есть kind, prompt, sub, band, id');
    assert.ok(tasks.every(x => Survey.KINDS[x.kind] && Survey.SUBS[x.sub]), 'вид или раздел задания вне каталога');
  });
  const all = P.reduce((a, x) => a + x.length, 0);
  assert.ok(all >= 120 && all <= 140, 'всего заданий ' + all + ', ждали 120–140');
});

t('части не пересекаются заданиями', () => {
  const seen = {};
  P.forEach((tasks, i) => tasks.forEach(x => {
    const keys = [x.id, x.cardId ? 'c:' + x.cardId : null, x.itemId ? 'g:' + x.itemId : null, x.word ? 'w:' + x.word : null].filter(Boolean);
    for (const k of keys) {
      assert.ok(seen[k] == null || seen[k] === i + 1, 'задание ' + k + ' встречается в частях ' + seen[k] + ' и ' + (i + 1));
      seen[k] = i + 1;
    }
  }));
});

t('часть 1: скринер четырьмя группами по пять и проба полосы HSK 1 / HSK 2', () => {
  const s = P[0].filter(x => x.sub === 'screen');
  assert.equal(s.length, Survey.SCREEN * Survey.GROUPS.length, 'в скринере 20 заданий');
  Survey.GROUPS.forEach((g, i) => {
    const grp = s.filter(x => x.group === i);
    assert.equal(grp.length, Survey.SCREEN, 'в группе ' + g + ' пять заданий');
    assert.ok(grp.every(x => x.kind === g), 'группа ' + g + ' собрана из своих заданий');
  });
  const tones = s.filter(x => x.kind === 'tone').map(x => x.tone);
  assert.ok(new Set(tones).size >= 4, 'в тоновой группе представлены все четыре тона');
  const probe = P[0].filter(x => x.sub === 'probe');
  assert.equal(probe.filter(x => x.kind === 'know').length, Survey.KNOW, 'десять узнаваний');
  assert.equal(probe.filter(x => x.kind === 'set').length, Survey.SET * 2, 'по четыре набора на полосу');
  assert.ok(probe.every(x => x.band === 1 || x.band === 2), 'проба идёт по полосам HSK 1 и HSK 2');
});

t('часть 3: два темпа, проба HSK 3 / HSK 4 и десять заданий на конструкции', () => {
  const ear = P[2].filter(x => x.sub === 'ear');
  Survey.RATES.forEach(r => assert.equal(ear.filter(x => x.rate === r).length, Survey.LISTEN, 'по шесть заданий в темпе ' + r));
  const probe = P[2].filter(x => x.sub === 'probe');
  assert.ok(probe.every(x => x.band === 3 || x.band === 4), 'проба идёт по полосам HSK 3 и HSK 4');
  const gram = P[2].filter(x => x.sub === 'gram');
  assert.equal(gram.length, Survey.GRAM, 'десять грамматических заданий');
  assert.ok(gram.every(x => x.item && x.blockId && Array.isArray(x.options) && x.options.length >= 2), 'у грамматики есть задание из GRAMMAR и варианты');
  assert.equal(new Set(gram.map(x => x.blockId)).size, gram.length, 'блоки не повторяются');
});

t('сборка повторяема: два вызова дают те же задания', () => {
  for (const n of [1, 2, 3]) {
    const a = Survey.build(EMPTY, n).map(x => x.id).join('|');
    const b = Survey.build({ attempts: [attemptOf(1, sheet(P[0], () => true), NOW)], settings: {} }, n).map(x => x.id).join('|');
    assert.equal(a, b, 'часть ' + n + ' пересобирается одинаково');
  }
});

/* ── псевдослова ── */
t('псевдослова — сочетания реальных знаков, которых в банке нет', () => {
  const fake = P[0].filter(x => x.pseudo);
  assert.equal(fake.length, Survey.PSEUDO, 'три псевдослова среди узнаваний');
  for (const f of fake) {
    assert.ok(Survey.isPseudo(f.word), 'сочетание ' + f.word + ' не должно быть в банке');
    assert.equal(f.key, Survey.NO, 'верный ответ на псевдослово — «не знаю»');
    assert.ok(!f.cardId, 'у псевдослова нет карточки');
  }
  const bank = new Set([...[1, 2, 3].flatMap(l => global.HSK[l].map(e => e[0])), ...global.FREQ.map(e => e[0])]);
  for (const f of fake) assert.ok(!bank.has(f.word), 'псевдослово ' + f.word + ' найдено в банке');
});

t('самооценка не даёт свидетельств мастерства', () => {
  const know = P[0].filter(x => x.kind === 'know' && !x.pseudo);
  assert.ok(know.length > 0 && know.every(x => x.key == null), 'у самооценки настоящего слова нет верного ответа');
  const j = Survey.judge(know[0], Survey.YES);
  assert.equal(j.ok, null, 'самооценка не считается верным ответом');
  assert.equal(j.scored, false, 'самооценка не попадает в счёт');
  assert.equal(j.yes, true, 'но «знаю» фиксируется как данные');
});

/* ── лестница ── */
t('лестница ведёт себя по правилу', () => {
  assert.equal(Survey.rung(5, 6), 'up');
  assert.equal(Survey.rung(6, 6), 'up');
  assert.equal(Survey.rung(3, 6), 'down');
  assert.equal(Survey.rung(0, 6), 'down');
  assert.equal(Survey.rung(4, 6), 'more');
  assert.equal(Survey.rung(2, 4), 'wait');
  assert.equal(Survey.rung(8, 10), 'up');
  assert.equal(Survey.rung(5, 10), 'down');
  assert.equal(Survey.rung(6, 10), 'hold');
});

t('часть 2: ступени по блокам, шесть заданий на ступень', () => {
  const by = {};
  P[1].forEach(x => { assert.ok(x.blockId, 'у задания лестницы есть блок'); (by[x.blockId] || (by[x.blockId] = [])).push(x); });
  const blocks = Object.keys(by);
  assert.equal(blocks.length, Survey.LVLS.length * Survey.SLOTS, 'по два блока на уровень: основной и добор');
  blocks.forEach(r => assert.equal(by[r].length, Survey.RUNG, 'в блоке ' + r + ' шесть заданий'));
  assert.ok(blocks.every(r => PROGRAM.byId(r)), 'каждый блок — блок программы');
  /* ступень — уровень: добор из соседнего блока считается в ту же ступень */
  assert.ok(P[1].every(x => x.rung === 'L' + x.band), 'ступень подписана уровнем');
  assert.equal(new Set(P[1].map(x => x.rung)).size, Survey.LVLS.length, 'ступеней столько же, сколько уровней');
  assert.deepEqual([...new Set(P[1].map(x => x.band))].sort(), [1, 2, 3, 4], 'лестница идёт по уровням HSK 1→4');
});

t('разбор лестницы называет ступень, где посыпалось', () => {
  /* верно всё на уровне 1, дальше мимо */
  const g = Survey.grade(2, sheet(P[1], task => task.band === 1));
  assert.equal(g.rungs.length, Survey.LVLS.length, 'ступеней столько же, сколько уровней');
  assert.ok(g.rungs.every(r => PROGRAM.byId(r.blockId)), 'у ступени назван блок программы');
  assert.equal(g.top, 1, 'взят только первый уровень');
  assert.ok(g.start && g.start.lvl === 2, 'точка старта — вторая ступень, а не первая');
  assert.ok(g.rungs.filter(r => r.lvl === 1).every(r => r.right === r.asked), 'первый уровень взят целиком');
  assert.ok(g.rungs.filter(r => r.lvl > 1).every(r => r.verdict === 'down'), 'на проваленных ступенях вердикт «ниже»');
  /* добор из второго блока считается в ту же ступень: 4 из 6, потом 0 из 4 — это 4 из 10 */
  const one = P[1].filter(x => x.band === 4);
  const half = Survey.grade(2, one.map((task, i) => ({ task, given: answer(task, i < 4) })));
  assert.equal(half.rungs.length, 1, 'ступень одна, хотя блоков два');
  assert.equal(half.rungs[0].asked, 12, 'оба блока уровня в одной ступени');
});

/* ── разбор части 1 ── */
t('полоса скринера 0–4 считается по ведущим взятым группам', () => {
  const all = Survey.grade(1, sheet(P[0], () => true));
  assert.equal(all.band, 4, 'всё верно — полоса 4');
  const none = Survey.grade(1, sheet(P[0], () => false));
  assert.equal(none.band, 0, 'всё мимо — полоса 0');
  const two = Survey.grade(1, sheet(P[0], task => task.sub !== 'screen' || task.group < 2));
  assert.equal(two.band, 2, 'две первые группы — полоса 2');
});

t('ложные тревоги на псевдословах опускают оценку полосы', () => {
  const honest = Survey.grade(1, sheet(P[0], () => true));
  const braggart = Survey.grade(1, P[0].map(task => ({ task, given: task.kind === 'know' ? Survey.YES : answer(task, true) })));
  assert.ok(honest.probe[1] && braggart.probe[1], 'полоса HSK 1 оценена в обоих случаях');
  assert.ok(braggart.probe[1].fa > 0, 'у хвастуна есть ложные тревоги');
  assert.ok(braggart.probe[1].est < honest.probe[1].est, 'с ложными тревогами оценка ниже: ' + braggart.probe[1].est + ' против ' + honest.probe[1].est);
});

/* ── чистота ── */
t('Survey.state — чистая функция: перемешанный журнал даёт то же', () => {
  const a1 = attemptOf(1, sheet(P[0], () => true), NOW - 2 * 3600e3);
  const a2 = attemptOf(2, sheet(P[1], task => task.band <= 2), NOW - 3600e3);
  const st = { attempts: [a1, a2], settings: {} };
  const mixed = { attempts: [a2, a1], settings: {} };
  assert.deepEqual(Survey.state(mixed), Survey.state(st), 'порядок журнала ничего не меняет');
  assert.deepEqual(Survey.state(st).done, [1, 2]);
  assert.equal(Survey.state(st).next, 3);
  assert.equal(Survey.state(st).complete, false);
  /* совпадающее время — досортировка по id */
  const same1 = Object.assign({}, a1, { ts: NOW }), same2 = Object.assign({}, a2, { ts: NOW });
  assert.deepEqual(Survey.state({ attempts: [same2, same1] }), Survey.state({ attempts: [same1, same2] }), 'при равном ts порядок задаёт id');
});

t('result чист и не зависит от порядка попыток', () => {
  const a1 = attemptOf(1, sheet(P[0], () => true), NOW - 2 * 3600e3);
  const a2 = attemptOf(2, sheet(P[1], task => task.band <= 2), NOW - 3600e3);
  const a3 = attemptOf(3, sheet(P[2], task => task.kind !== 'gram'), NOW);
  const r1 = Survey.result({ attempts: [a1, a2, a3], settings: {} }, NOW);
  const r2 = Survey.result({ attempts: [a3, a1, a2], settings: {} }, NOW);
  assert.deepEqual(r2, r1, 'пересчёт с нуля в другом порядке даёт тот же итог');
});

t('пересдача части заменяет прошлую попытку, а не складывается с ней', () => {
  const bad = attemptOf(1, sheet(P[0], () => false), NOW - 2 * 3600e3);
  const good = attemptOf(1, sheet(P[0], () => true), NOW - 3600e3);
  const r = Survey.result({ attempts: [bad, good], settings: {} }, NOW);
  const only = Survey.result({ attempts: [good], settings: {} }, NOW);
  assert.equal(r.state.attempts, 2, 'в журнале обе попытки');
  assert.equal(r.screen.band, 4, 'итог считается по последней пересдаче');
  assert.deepEqual(r.bands, only.bands, 'полосы те же, что при одной удачной попытке');
  assert.deepEqual(r.blanks, only.blanks, 'белые пятна берутся из последней попытки');
});

t('result не падает на пустой истории и на частично пройденной съёмке', () => {
  const e = Survey.result({ attempts: [], settings: {} }, NOW);
  assert.equal(e.ok, false);
  assert.equal(e.vocab, null);
  assert.deepEqual(e.blanks, []);
  assert.equal(e.bands.length, 4);
  assert.ok(e.bands.every(b => b.est === null && b.text === '—'), 'без данных полоса не выдумывается');
  assert.equal(Survey.result({}, NOW).ok, false, 'пустой объект тоже переживается');
  assert.equal(Survey.result({ attempts: [{ id: 'x', ts: NOW, mode: 'quiz' }] }, NOW).ok, false, 'чужие попытки не считаются съёмкой');
  const half = Survey.result({ attempts: [attemptOf(1, sheet(P[0], () => true), NOW)], settings: {} }, NOW);
  assert.equal(half.ok, true);
  assert.equal(half.state.done.length, 1);
  assert.ok(half.bands[0].est != null, 'полоса HSK 1 уже оценена');
  assert.ok(half.bands[3].est === null, 'HSK 4 без данных остаётся пустым');
  assert.ok(half.vocab && half.vocab.of === Survey.totalWords(), 'объём словаря считается от банка, а не от выдуманного числа');
});

t('итог называет полосы, точки старта и белые пятна с цитатой ответа', () => {
  const a1 = attemptOf(1, sheet(P[0], task => task.band <= 1), NOW - 2 * 3600e3);
  const a2 = attemptOf(2, sheet(P[1], task => task.band === 1), NOW - 3600e3);
  const a3 = attemptOf(3, sheet(P[2], () => false), NOW);
  const r = Survey.result({ attempts: [a1, a2, a3], settings: {} }, NOW);
  assert.ok(r.bands.every(b => /^(≈ \d+%|—)$/.test(b.text)), 'полоса пишется как «≈ N%»');
  /* итог восстанавливает разбор из сохранённых попыток, а не из живых ответов */
  assert.equal(r.screen.band, Survey.grade(1, sheet(P[0], task => task.band <= 1)).band, 'полоса скринера в итоге та же, что в разборе части');
  assert.ok(r.screen.band > 0 && r.screen.band < 4, 'скринер пройден до середины: полоса ' + r.screen.band);
  assert.ok(r.vocab.text.includes('из ' + Survey.totalWords()), 'объём словаря — из банка: ' + r.vocab.text);
  assert.ok(r.starts.length >= 1 && r.start.lvl === 2, 'точка старта — первый блок, где посыпалось');
  assert.ok(PROGRAM.byId(r.start.blockId), 'точка старта указывает на блок программы');
  assert.equal(r.blanks.length, 5, 'пять белых пятен');
  assert.ok(r.blanks.every(b => b.what && b.mine && b.mine !== ''), 'у каждого пятна есть цитата собственного ответа');
  assert.ok(new Set(r.blanks.map(b => b.kind)).size >= 3, 'пятна разные по виду заданий');
});

/* ── экономика ── */
t('часть платит ровно один дневной переход', () => {
  const fresh = Campaign.create();
  assert.equal(Survey.payFor(fresh), Campaign.capFor(fresh), 'цена части — это capFor');
  assert.equal(Survey.payFor(fresh), Campaign.CAP_START, 'на разгоне новичка это 120');
  const vet = Campaign.create(); vet.log = [{ d: '2026-09-01', p: 400, r: 'done' }, { d: '2026-09-02', p: 400, r: 'done' }, { d: '2026-09-03', p: 400, r: 'done' }];
  assert.equal(Survey.payFor(vet), Campaign.CAP, 'дальше — обычные 400');
  for (const c of [fresh, vet]) assert.ok(Survey.payFor(c) <= Campaign.CAP, 'цена не выше дневной нормы');
  /* три части вместе — три дневных перехода, не больше */
  assert.ok(Survey.payFor(vet) * Survey.PARTS.length <= Campaign.CAP * 3, 'вся съёмка стоит не больше трёх дней');
});

t('попытка съёмки не проходит деградацию и не тратит новизну', () => {
  const a = attemptOf(1, sheet(P[0], () => true), NOW);
  assert.equal(a.fixedPts, true, 'цена назначена режимом');
  assert.equal(a.mode, 'survey');
  assert.equal(a.part, 1);
  assert.ok(a.questions.length >= Survey.COUNT[1] - 4, 'вопросы попытки непусты');
  assert.ok(a.questions.filter(q => q.kind === 'know' && !q.pseudo).every(q => !q.cardId), 'самооценка не заводит карточку: повторения по ней не сеются');
  /* Ledger платит по назначенной цене, без множителей */
  const st = { attempts: [a], settings: {}, cards: [], cardStats: {}, decks: [] };
  assert.equal(global.Ledger.computePoints(st, a, NOW), 120, 'в тестовой книге платится ровно назначенное');
});

/* ── модуль грузится и в браузере ── */
t('в модуле нет DOM, сети и модульного синтаксиса', () => {
  const src = readFileSync(new URL('../src/js/survey.js', import.meta.url), 'utf8');
  for (const bad of [/\bdocument\b/, /\blocalStorage\b/, /\bnavigator\b/, /\bfetch\s*\(/, /window\.location/, /^\s*import\s/m, /^\s*export\s/m, /\brequire\s*\(/, /\bMath\.random\b/])
    assert.ok(!bad.test(src), 'в модуле есть запрещённое: ' + bad);
  assert.ok(/^window\.Survey = \(\(\) => \{/m.test(src), 'модуль должен объявляться как window.Survey = (() => { … })()');
});

t('каталоги описаны словами', () => {
  assert.equal(Survey.PARTS.length, 3, 'три части');
  assert.ok(Survey.PARTS.every(p => p.ru && p.zh && p.about && p.min >= 12 && p.min <= 15), 'у части есть имя, иероглифы и время 12–15 минут');
  assert.ok(Object.values(Survey.KINDS).every(k => k.ru && k.zh && k.ask), 'у каждого вида задания русское имя и вопрос');
  assert.ok(Object.values(Survey.SUBS).every(s => s.ru && s.zh), 'у каждого раздела имя и иероглиф');
});

console.log(fail ? `SOME TESTS FAILED: ${fail} из ${pass + fail}` : `survey: все проверки пройдены (${pass})`);
if (fail) process.exitCode = 1;
