/* Две книги учёта: проверка обратимости переключения методики.
   Главное, что здесь доказывается: пересборка книги v2 из журнала совпадает с её
   пополнением по одной попытке, а книга v1 от работы в v2 не страдает и наоборот. */
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
global.window = global;
global.App = { builtinDecks: [], cardsOfDeck: () => [] };
for (const f of ['hsk.js', 'freq.js', 'sentences.js', 'pinyin.js', 'stats.js', 'srs.js', 'skill.js', 'program.js', 'treasures.js', 'campaign.js', 'boss.js', 'ledger.js']) require('../src/js/' + f);

let fails = 0;
const t = (name, fn) => { try { fn(); console.log('ok  ' + name); } catch (e) { fails++; console.log('FAIL ' + name + ' ' + (e && e.message)); } };
const clone = o => JSON.parse(JSON.stringify(o));

const DAY = 24 * 3600e3;
let seq = 0;
const uid = () => 'a' + (++seq);
/* Попытка-квиз: n вопросов, k верных, по словам HSK 1 */
function quiz(ts, n, ok, opts = {}) {
  const words = HSK[1].slice(opts.from || 0, (opts.from || 0) + n);
  const qs = words.map((w, i) => ({
    cardId: 'hsk1:' + w[0], hanzi: w[0], pinyin: w[1], ru: w[2], show: 'hanzi', guess: ['ru'],
    answer: { choice: 0, choiceText: w[2] }, parts: {}, fraction: i < ok ? 1 : 0, ok: i < ok, ms: opts.ms || 4000,
  }));
  return { id: uid(), ts, endedAt: ts + 60e3, durationMs: 60e3, mode: 'quiz', difficulty: opts.diff || 'easy',
    deckIds: ['hsk1'], deckName: 'HSK 1', show: 'hanzi', guess: ['ru'], order: 'random', timer: 0,
    total: n, planned: n, aborted: false, correct: ok, partial: 0, wrong: n - ok, percent: Math.round(ok / n * 100), questions: qs };
}
function sprint(ts, blockId, pct) {
  const b = PROGRAM.byId(blockId);
  return { id: uid(), ts, endedAt: ts + 120e3, durationMs: 120e3, mode: 'sprint', difficulty: 'medium', blockId,
    words: b.words.slice(), deckIds: [], deckName: b.ru, show: 'mixed', guess: ['all'], order: 'random', timer: 0,
    total: 15, planned: 15, aborted: false, correct: Math.round(15 * pct / 100), partial: 0, wrong: 15 - Math.round(15 * pct / 100),
    percent: pct, questions: [] };
}
function freshState() {
  const st = { settings: {}, decks: [], cards: [], attempts: [], cardStats: {}, campaign: Campaign.create(), meta: {} };
  Ledger.bind(st);
  return st;
}
/* Мини-копия App.saveAttempt: пополняет обе книги */
function save(state, a, now) {
  now = now || a.endedAt || a.ts;
  const bk = state.books || (state.books = {});
  if (!bk.v1) { bk.v1 = state.campaignV1 || state.campaign; state.campaignV1 = bk.v1; }
  const c1 = bk.v1;
  const s1 = { cards: state.cards, cardStats: state.cardStats, attempts: state.attempts, decks: state.decks,
    settings: state.settings, campaign: c1, __srs: (state.settings.srs || (state.settings.srs = {})) };
  Ledger.withVer('v1', () => {
    if (a.points == null) a.points = Campaign.attemptPoints(a);
    if (!a.aborted && a.points > 0) { const d = Campaign.decay(s1, a, now); a.decay = d; a.pointsRaw = a.points; a.points = Math.round(a.points * d.mult); }
    Campaign.noteUnit(s1, a, now);
    SRS.noteAttempt(s1, a, now);
  });
  const snap = Ledger.todaySnapshot(state, now);
  state.attempts.push(a);
  state.cardStats = Stats.cardStats(state.attempts);
  Ledger.noteAttempt(state, a, now, snap);
  Ledger.withVer('v1', () => { Campaign.process(c1, state.attempts, now); Campaign.grantChests(c1, state.attempts, now); });
  return a;
}

t('книга v2 собирается из журнала и совпадает с пополнением по одной попытке', () => {
  const base = Date.now() - 5 * DAY;
  /* А: пополняем по одной попытке, работая в тестовой книге */
  const A = freshState();
  A.settings.ver = 'v2';
  Ledger.boot(A, base);
  seq = 0;
  const list = [quiz(base, 10, 8), quiz(base + 3600e3, 10, 5, { from: 10 }), sprint(base + DAY, 'b1-01', 100), quiz(base + 2 * DAY, 12, 12, { from: 20 })];
  for (const a of list) save(A, a, a.endedAt);
  const incremental = { srs: clone(A.settings.v2.srs), seen: clone(A.settings.v2.seen), pts: A.attempts.map(x => x.p2) };

  /* Б: тот же журнал, но книга собирается с нуля */
  const B = freshState();
  B.settings.ver = 'v2';
  B.attempts = A.attempts.map(clone);
  B.cardStats = Stats.cardStats(B.attempts);
  Ledger.bind(B);
  Ledger.rebuild(B, base + 2 * DAY);
  const rebuilt = { srs: clone(B.settings.v2.srs), seen: clone(B.settings.v2.seen), pts: B.attempts.map(x => x.p2) };

  assert.deepEqual(rebuilt.pts, incremental.pts, 'очки попыток совпадают');
  assert.deepEqual(Object.keys(rebuilt.srs).sort(), Object.keys(incremental.srs).sort(), 'состав повторений совпадает');
  for (const id of Object.keys(rebuilt.srs)) assert.equal(rebuilt.srs[id].step, incremental.srs[id].step, 'ступень ' + id);
  assert.deepEqual(Object.keys(rebuilt.seen).sort(), Object.keys(incremental.seen).sort(), 'память новизны совпадает');
  Ledger.bind(A);
});

t('переключение туда-обратно не меняет книгу v1', () => {
  const base = Date.now() - 4 * DAY;
  const st = freshState();
  Ledger.boot(st, base);
  seq = 100;
  save(st, quiz(base, 10, 9), base);
  save(st, quiz(base + DAY, 10, 7, { from: 10 }), base + DAY);
  const before = { srs: clone(st.settings.srs), program: clone(st.settings.program), campaign: clone(st.books.v1), points: st.attempts.map(a => a.points) };

  Ledger.switchTo(st, 'v2', base + DAY + 3600e3);
  assert.equal(Ledger.active(st), 'v2');
  Ledger.switchTo(st, 'v1', base + DAY + 7200e3);
  assert.equal(Ledger.active(st), 'v1');

  assert.deepEqual(clone(st.settings.srs), before.srs, 'повторения книги v1 целы');
  assert.deepEqual(clone(st.settings.program), before.program, 'блоки книги v1 целы');
  assert.deepEqual(st.attempts.map(a => a.points), before.points, 'очки книги v1 целы');
  assert.equal(st.books.v1.days, before.campaign.days, 'дни похода книги v1 целы');
  assert.equal(st.campaign, st.books.v1, 'открыта книга v1');
});

t('работа в тестовой книге отражается в текущей по её правилам', () => {
  const base = Date.now() - 3 * DAY;
  const st = freshState();
  Ledger.boot(st, base);
  seq = 200;
  Ledger.switchTo(st, 'v2', base);
  const a1 = save(st, quiz(base, 12, 12), base);
  const a2 = save(st, sprint(base + 3600e3, 'b1-02', 100), base + 3600e3);
  /* обе книги получили попытки */
  assert.ok(a1.points > 0 && a1.p2 > 0, 'очки проставлены в обеих книгах');
  assert.ok(Object.keys(st.settings.srs).length > 0, 'повторения книги v1 пополнились во время работы в v2');
  assert.ok(Object.keys(st.settings.v2.srs).length > 0, 'повторения книги v2 пополнились');
  assert.equal(Ledger.progStore(st), st.settings.program, 'блоки программы общие для обеих книг');
  /* возвращаемся — прогресс на месте и посчитан по правилам v1 */
  Ledger.switchTo(st, 'v1', base + 2 * 3600e3);
  const day1 = Campaign.todayState(st.books.v1, st.attempts, base + 2 * 3600e3);
  assert.ok(day1.points > 0, 'день книги v1 учёл работу, сделанную в v2: ' + day1.points);
  assert.equal(Math.round(day1.points), Math.round(a1.points + a2.points), 'день v1 считается по очкам v1');
  Ledger.switchTo(st, 'v2', base + 3 * 3600e3);
  const day2 = Campaign.todayState(st.settings.v2.campaign, st.attempts, base + 3 * 3600e3);
  assert.equal(Math.round(day2.points), Math.round(a1.p2 + a2.p2), 'день v2 считается по очкам v2');
});

t('очки двух книг различаются там, где различаются правила', () => {
  const base = Date.now() - DAY;
  const st = freshState();
  st.settings.ver = 'v2';
  Ledger.boot(st, base);
  seq = 300;
  /* быстрые верные тычки: текущая методика платит, тестовая — нет */
  const fast = quiz(base, 12, 12, { ms: 900 });
  save(st, fast, base);
  assert.ok(fast.p2 < fast.points, 'тычки быстрее 2,5 с в тестовой книге не оплачиваются: ' + fast.p2 + ' < ' + fast.points);
  /* похоже на угадывание */
  const guess = quiz(base + 3600e3, 12, 3, { ms: 800, from: 20 });
  assert.ok(Ledger.looksGuessed(guess), 'угадывание распознано');
  /* обычная попытка: очки близки (отличие только в деградации по уровню) */
  const normal = quiz(base + 7200e3, 10, 8, { from: 40, ms: 5000 });
  save(st, normal, base + 7200e3);
  assert.ok(normal.p2 > 0 && normal.points > 0, 'обычная попытка оплачена в обеих книгах');
});

t('книга v2 чинится сама, если журнал ушёл вперёд', () => {
  const base = Date.now() - 2 * DAY;
  const st = freshState();
  st.settings.ver = 'v2';
  Ledger.boot(st, base);
  seq = 400;
  save(st, quiz(base, 10, 10), base);
  /* имитируем потерю: попытка попала в журнал мимо книги */
  const orphan = quiz(base + 3600e3, 10, 6, { from: 10 });
  orphan.points = Campaign.attemptPoints(orphan);
  st.attempts.push(orphan);
  assert.ok(Ledger.needsRebuild(st), 'расхождение замечено');
  Ledger.boot(st, base + 3600e3);
  assert.ok(!Ledger.needsRebuild(st), 'книга пересобрана');
  assert.ok(orphan.p2 != null, 'потерянная попытка учтена в книге v2');
});

t('пустое состояние и переключение без истории', () => {
  const st = freshState();
  Ledger.boot(st);
  assert.equal(Ledger.active(st), 'v1');
  Ledger.switchTo(st, 'v2');
  assert.equal(Ledger.active(st), 'v2');
  assert.ok(st.settings.v2.campaign, 'книга создана');
  const s = Ledger.summary(st);
  assert.ok(s.v1 && s.v2, 'сводка по обеим книгам считается');
  Ledger.switchTo(st, 'v1');
  assert.equal(Ledger.active(st), 'v1');
});

t('канал по умолчанию задаёт книгу, но выбор пользователя сильнее', () => {
  const st = freshState();
  global.window.CHANNEL = { id: 'beta', defaultVer: 'v2' };
  assert.equal(Ledger.active(st), 'v2', 'в тестовом канале по умолчанию тестовая книга');
  st.settings.ver = 'v1';
  assert.equal(Ledger.active(st), 'v1', 'выбор пользователя сильнее умолчания канала');
  delete global.window.CHANNEL;
  const st2 = freshState();
  assert.equal(Ledger.active(st2), 'v1', 'в рабочем канале по умолчанию текущая методика');
});

console.log(fails ? '\nSOME TESTS FAILED: ' + fails : '\nledger: все проверки прошли');
if (fails) process.exitCode = 1;
