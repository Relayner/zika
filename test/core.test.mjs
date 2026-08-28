import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
global.window = global;
for (const f of ['hsk', 'pinyin', 'quiz', 'stats']) require('../src/js/' + f + '.js');
const { Pinyin, Quiz, Stats, HSK } = global;
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL', name, e.message); process.exitCode = 1; } };

t('marks basic', () => {
  assert.equal(Pinyin.toMarks('ni3 hao3'), 'nǐ hǎo');
  assert.equal(Pinyin.toMarks('nv3'), 'nǚ');
  assert.equal(Pinyin.toMarks('lu:4'), 'lǜ');
  assert.equal(Pinyin.toMarks('xue2xiao4'), 'xuéxiào');
  assert.equal(Pinyin.toMarks('Bei3jing1'), 'Běijīng');
  assert.equal(Pinyin.toMarks('dou1'), 'dōu');
  assert.equal(Pinyin.toMarks('liu4'), 'liù');
  assert.equal(Pinyin.toMarks('gui4'), 'guì');
  assert.equal(Pinyin.toMarks('ma5'), 'ma');
  assert.equal(Pinyin.toMarks('er2'), 'ér');
  assert.equal(Pinyin.toMarks('jiong3'), 'jiǒng');
  assert.equal(Pinyin.toMarks('lüe4'), 'lüè');
  assert.equal(Pinyin.toMarks('yi4dian3r'), 'yìdiǎnr');
  assert.equal(Pinyin.toMarks('nǐ hǎo'), 'nǐ hǎo');
});
t('compare', () => {
  assert.equal(Pinyin.compare('nǐ hǎo', 'ni3hao3'), 'exact');
  assert.equal(Pinyin.compare('nǐ hǎo', 'ni3 hao3'), 'exact');
  assert.equal(Pinyin.compare('nǐ hǎo', 'nihao'), 'tones');
  assert.equal(Pinyin.compare('nǐ hǎo', 'ni2hao3'), 'tones');
  assert.equal(Pinyin.compare('lǜ', 'lu4'), 'wrong');
  assert.equal(Pinyin.compare('lǜ', 'lv4'), 'exact');
  assert.equal(Pinyin.compare("nǚ'ér", 'nv3er2'), 'exact');
  assert.equal(Pinyin.compare('x', ''), 'empty');
  assert.equal(Pinyin.compare('Zhōngguó', 'ZHONG1GUO2'), 'exact');
  assert.equal(Pinyin.compare('ma', 'ma5'), 'exact');
});
t('syllables/initial', () => {
  assert.equal(Pinyin.syllables('nǐ hǎo'), 2);
  assert.equal(Pinyin.syllables('xuéxiào'), 2);
  assert.equal(Pinyin.syllables('Zhōngguó'), 2);
  assert.equal(Pinyin.syllables('diànzǐ yóujiàn'), 4);
  assert.equal(Pinyin.initial('zhōng'), 'zh');
  assert.equal(Pinyin.initial('chī'), 'ch');
  assert.equal(Pinyin.initial('ài'), '');
});
t('hsk data sane', () => {
  const all = [...HSK[1], ...HSK[2], ...HSK[3]];
  assert.equal(all.length, 600);
  for (const [h, p, r] of all) {
    assert.ok(h && p && r, 'empty field ' + h);
    assert.equal(Pinyin.toMarks(p), p, 'marks idempotent ' + p);
    const a = Pinyin.analyze(p);
    assert.ok(a.letters.length >= 1, 'letters ' + p);
    assert.ok(a.tones.length <= Pinyin.syllables(p), 'tones>syllables ' + p);
    assert.ok(/[一-鿿]/.test(h), 'hanzi ' + h);
  }
});
const cards = HSK[1].map((e, i) => ({ id: 'hsk1-' + i, hanzi: e[0], pinyin: e[1], ru: e[2], deckId: 'hsk1' }));
t('quiz easy', () => {
  const qs = Quiz.buildQuestions(cards, cards, { show: 'hanzi', guess: ['pinyin', 'ru'], difficulty: 'easy', count: 10, order: 'random' }, {});
  assert.equal(qs.length, 10);
  for (const q of qs) {
    assert.equal(q.options.length, 4);
    assert.deepEqual(q.guess, ['pinyin', 'ru']);
    assert.equal(q.options[q.answerIdx].cardId, q.cardId);
    const keys = new Set(q.options.map(o => o.pinyin + '|' + o.ru));
    assert.equal(keys.size, 4, 'distinct options');
  }
});
t('quiz medium/mixed', () => {
  const qs = Quiz.buildQuestions(cards, cards, { show: 'mixed', difficulty: 'medium', count: 'all', order: 'weak' }, {});
  assert.equal(qs.length, 150);
  for (const q of qs) { assert.equal(q.options.length, 8); assert.ok(!q.guess.includes(q.show)); assert.equal(q.guess.length, 2); }
  const shows = new Set(qs.map(q => q.show)); assert.equal(shows.size, 3);
});
t('quiz hard + checks', () => {
  const qs = Quiz.buildQuestions(cards, cards, { show: 'hanzi', guess: ['pinyin'], difficulty: 'hard', count: 5, order: 'new' }, {});
  assert.equal(qs.length, 5); assert.ok(!qs[0].options);
  const q = { card: { hanzi: '你好', pinyin: 'nǐ hǎo', ru: 'привет, здравствуй' }, guess: ['pinyin', 'ru'] };
  assert.deepEqual(Quiz.checkInput(q, { pinyin: 'ni3hao3', ru: 'Привет' }), { parts: { pinyin: 'exact', ru: 'exact' }, fraction: 1, ok: true });
  const r = Quiz.checkInput(q, { pinyin: 'nihao', ru: 'пока' });
  assert.equal(r.parts.pinyin, 'tones'); assert.equal(r.fraction, 0.25); assert.equal(r.ok, false);
  assert.equal(Quiz.ruMatch('хороший; хорошо', 'хорошо'), true);
  assert.equal(Quiz.ruMatch('большой', 'болшой'), true);
  assert.equal(Quiz.ruMatch('день рождения', 'день'), false);
  assert.equal(Quiz.ruMatch('ещё, всё ещё', 'еще'), true);
  assert.equal(Quiz.ruMatch('счётное слово для книг; тетрадь', 'тетрадь'), true);
  assert.equal(Quiz.hanziMatch('虽然…但是…', '虽然但是'), true);
  assert.equal(Quiz.hanziMatch('你好', '你'), false);
  assert.equal(Quiz.checkChoice({ answerIdx: 2, guess: ['ru'] }, 2).ok, true);
  assert.equal(Quiz.checkChoice({ answerIdx: 2, guess: ['ru'] }, -1).ok, false);
});
t('write mode', () => {
  const e = Quiz.buildQuestions(cards, cards, { mode: 'write', difficulty: 'easy', count: 3, order: 'random' }, {});
  assert.ok(e.every(q => q.show === 'both' && q.guess[0] === 'hanzi'), 'лёгкий: пиньинь и перевод даны');
  const m2 = Quiz.buildQuestions(cards, cards, { mode: 'write', difficulty: 'medium', count: 3, order: 'random' }, {});
  assert.ok(m2.every(q => q.show === 'ru'), 'средний: только перевод');
  const h = Quiz.buildQuestions(cards, cards, { mode: 'write', difficulty: 'hard', count: 3, order: 'random' }, {});
  assert.ok(h.every(q => q.show === 'audio'), 'сложный: только на слух');
});
t('exam format', () => {
  const e1 = Quiz.buildExam(1, cards, {});
  assert.equal(e1.length, 20);
  e1.forEach((q, i) => { assert.equal(q.options.length, 4); assert.equal(q.options[q.answerIdx].cardId, q.cardId); if (i % 2 === 0) { assert.equal(q.show, 'hp'); assert.deepEqual(q.guess, ['ru']); } else { assert.equal(q.show, 'ru'); assert.deepEqual(q.optionParts, ['hanzi', 'pinyin']); } });
  const c3 = HSK[3].map((e, i) => ({ id: 'hsk3-' + i, hanzi: e[0], pinyin: e[1], ru: e[2], deckId: 'hsk3' }));
  const e3 = Quiz.buildExam(3, c3, {});
  assert.equal(e3.length, 40);
  e3.slice(0, 30).forEach(q => { assert.ok(['hanzi', 'ru'].includes(q.show)); assert.equal(q.options.length, 4); assert.equal(q.section, 'read'); });
  e3.slice(30).forEach(q => { assert.equal(q.show, 'both'); assert.deepEqual(q.guess, ['hanzi']); assert.ok(!q.options); assert.equal(q.section, 'write'); });
  assert.deepEqual(Object.keys(Quiz.EXAM), ['1', '2', '3']);
});
t('score', () => {
  const qs = [{ result: { fraction: 1 } }, { result: { fraction: 0 } }, { result: { fraction: 0.5 } }, { result: null }];
  const s = Quiz.scoreAttempt(qs, 'hard');
  assert.equal(s.percent, 38); assert.equal(s.score, 95); assert.equal(s.correct, 1); assert.equal(s.partial, 1);
});
t('stats', () => {
  const day = 864e5, now = Date.now();
  const mk = (ts, pct, qs) => ({ id: 'a' + ts, ts, percent: pct, score: pct, total: qs.length, correct: qs.filter(q => q.ok).length, durationMs: 60000, mode: 'quiz', difficulty: 'easy', questions: qs });
  const attempts = [
    mk(now - 2 * day, 50, [{ cardId: 'c1', ok: true, fraction: 1, ms: 1000 }, { cardId: 'c2', ok: false, fraction: 0, ms: 1000 }]),
    mk(now - day, 100, [{ cardId: 'c1', ok: true, fraction: 1, ms: 1000 }, { cardId: 'c2', ok: true, fraction: 1, ms: 1000 }]),
    mk(now, 100, [{ cardId: 'c1', ok: true, fraction: 1, ms: 1000 }]),
  ];
  const cs = Stats.cardStats(attempts);
  assert.equal(cs.c1.asked, 3); assert.equal(cs.c1.streak, 3); assert.equal(cs.c1.mastered, true);
  assert.equal(cs.c2.asked, 2); assert.equal(cs.c2.correct, 1); assert.equal(cs.c2.streak, 1);
  const ov = Stats.overview(attempts);
  assert.equal(ov.attempts, 3); assert.equal(ov.avgPercent, 83); assert.equal(ov.streak, 3); assert.equal(ov.bestStreak, 3); assert.equal(ov.questions, 5);
  assert.equal(Stats.daily(attempts, 30).length, 30);
  assert.equal(Stats.daily(attempts, 30).at(-1).n, 1);
  const g = Stats.groupBy(attempts, a => a.difficulty);
  assert.equal(g[0].n, 3); assert.equal(g[0].avgPercent, 83);
});
console.log(process.exitCode ? 'SOME TESTS FAILED' : `all ${n} test groups passed`);

/* ── поход и сейф ── */
for (const f of ['cats', 'campaign', 'vault']) require('../src/js/' + f + '.js');
const { Campaign, Vault, Cats } = global;
const D = 864e5;
const mkA = (ts, mode, difficulty, qs, extra = {}) => ({ id: 'a' + ts + Math.random(), ts, mode, difficulty, total: qs.length, correct: qs.filter(q => q.fraction === 1).length, percent: Math.round(qs.reduce((s, q) => s + q.fraction, 0) / qs.length * 100), questions: qs, ...extra });
const qs = (n, frac = 1) => Array.from({ length: n }, (_, i) => ({ cardId: 'hsk1-' + String(i + 1).padStart(3, '0'), fraction: frac, ok: frac === 1 }));
t('campaign points', () => {
  assert.equal(Campaign.attemptPoints(mkA(0, 'quiz', 'easy', qs(10))), 10 * 1.5 + 3 + 6);
  assert.equal(Campaign.attemptPoints(mkA(0, 'quiz', 'hard', qs(10, 0.5))), 10 * 3.5 * 0.5 + 3);
  assert.equal(Campaign.attemptPoints(mkA(0, 'flip', 'flip', qs(5))), 5);
  assert.equal(Campaign.attemptPoints(mkA(0, 'write', 'medium', qs(3))), 24);
  /* словарный тест — обычная ставка, надбавки за сдачу нет */
  assert.equal(Campaign.attemptPoints(mkA(0, 'hsk', 'exam', qs(20), { passed: true })), 20 * 3 + 3 + 6);
  /* настоящий экзамен дороже и получает надбавку за сдачу */
  assert.equal(Campaign.attemptPoints(mkA(0, 'hsk', 'exam', qs(20), { passed: true, format: 'real' })), 20 * 6 + 3 + 6 + 30);
});
t('campaign days', () => {
  const now = new Date(2026, 7, 23, 12).getTime();
  const day = i => new Date(2026, 7, 23 - i, 10).getTime();
  const big = (ts, p) => mkA(ts, 'quiz', 'easy', qs(1), { points: p });
  const attempts = [big(day(5), 400), big(day(4), 2000), big(day(3), 100), big(day(1), 450), big(day(0), 120)];
  const c = Campaign.create();
  const added = Campaign.process(c, attempts, now);
  assert.equal(c.startedAt, '2026-08-18');
  assert.deepEqual(added.map(e => e.r), ['done', 'ultra', 'miss', 'miss', 'done']);
  assert.equal(c.days, 1 + 2 - 1 - 1 + 1);
  assert.equal(c.processedThrough, '2026-08-22');
  const t0 = Campaign.todayState(c, attempts, now);
  assert.equal(t0.points, 120); assert.equal(t0.done, false); assert.equal(t0.toCap, 280);
  assert.equal(Campaign.effectiveDays(c, attempts, now), 2);
  attempts.push(big(day(0), 300));
  assert.equal(Campaign.todayState(c, attempts, now).done, true);
  assert.equal(Campaign.effectiveDays(c, attempts, now), 3);
  assert.equal(Campaign.process(c, attempts, now).length, 0, 'today is never finalized');
  assert.equal(c.days, 2);
  /* прогрессивные ранги: 3,4,5,6,7,8,9,10,11 дней — до высшего 63 дня */
  assert.equal(Campaign.rankIndex(3), 1); assert.equal(Campaign.rankIndex(0), 0); assert.equal(Campaign.rankIndex(29), 5); assert.equal(Campaign.rankIndex(300), 9);
  assert.equal(Campaign.rankProgress(4).toNext, 3); assert.equal(Campaign.rankProgress(63).complete, true);
  assert.equal(Campaign.TOTAL_DAYS, 63);
  const rec = Campaign.recent(c, attempts, 7, now);
  assert.equal(rec.length, 7); assert.equal(rec.at(-1).r, 'today'); assert.equal(rec.at(-2).r, 'done'); assert.equal(rec[0].r, 'none');
  // back-dated clock: nothing breaks
  assert.equal(Campaign.process(c, attempts, now - 10 * D).length, 0);
});
t('campaign never punishes before start', () => {
  const c = Campaign.create();
  assert.equal(Campaign.process(c, [], Date.now()).length, 0);
  assert.equal(c.startedAt, null); assert.equal(c.days, 0);
});
t('vault migration v1→v2', async () => {
  const map = Vault.hskIdMap();
  assert.equal(map['hsk1-001'], 'hsk1:爱'); assert.equal(map['hsk3-300'], 'hsk3:作业');
  assert.equal(Object.keys(map).length, 600);
});
t('cats', () => {
  assert.equal(Cats.RANKS.length, 10);
  for (let i = 0; i < 10; i++) { const s = Cats.svg(i); assert.ok(s.startsWith('<svg') && s.endsWith('</svg>'), 'svg ' + i); assert.ok(s.length > 2000, 'art ' + i); assert.ok(Cats.RANKS[i].motto && Cats.RANKS[i].mru && Cats.RANKS[i].bio); }
  assert.ok(!Cats.svg(0, { plain: true }).includes('r="112"'));
});
console.log(process.exitCode ? 'SOME TESTS FAILED' : 'campaign/vault/cats groups passed');

/* ── сокровища и сундуки ── */
require('../src/js/treasures.js');
const { Treasures } = global;
t('treasures', () => {
  assert.equal(Treasures.ITEMS.length, 22);
  const ids = new Set(Treasures.ITEMS.map(i => i.id)); assert.equal(ids.size, 22);
  const seq = [0.01, 0.5, 0.7, 0.9, 0.995]; // детерминированный "random"
  let k = 0; const rnd = () => seq[k++ % seq.length];
  const cnt = {}; for (let i = 0; i < 5000; i++) { const r = Treasures.rollRarity(); cnt[r] = (cnt[r] || 0) + 1; }
  assert.ok(cnt.common > cnt.uncommon && cnt.uncommon > cnt.rare && cnt.rare > cnt.epic && (cnt.epic || 0) >= (cnt.legendary || 0), JSON.stringify(cnt));
  const items = Treasures.openChest(); assert.equal(items.length, 3); assert.notEqual(Treasures.byId[items[0]].rarity, 'common');
  assert.equal(Treasures.value({ coin: 2, seal: 1 }), 24 + 9000); assert.equal(Treasures.count({ coin: 2, seal: 1 }), 3);
});
t('chests', () => {
  const now = new Date(2026, 7, 23, 12).getTime(), day = i => new Date(2026, 7, 23 - i, 10).getTime();
  const big = (ts, p) => ({ id: 'b' + ts + Math.random(), ts, points: p, questions: [], total: 1, correct: 1, percent: 100 });
  const attempts = [big(day(2), 2000), big(day(1), 400), big(day(0), 2100)];
  const c = Campaign.create(); Campaign.process(c, attempts, now);
  assert.equal(Campaign.grantChests(c, attempts, now), 2, 'one for past ultra day, one for today');
  assert.equal(Campaign.grantChests(c, attempts, now), 0, 'idempotent');
  assert.equal(c.chests.pending, 2);
  const e = Campaign.openChest(c); assert.equal(e.items.length, 3); assert.equal(c.chests.pending, 1); assert.equal(Treasures.count(c.inventory), 3);
  Campaign.openChest(c); assert.equal(Campaign.openChest(c), null);
  assert.equal(c.chests.opened, 2);
});
console.log(process.exitCode ? 'SOME TESTS FAILED' : 'treasures/chests passed');

/* ── новые режимы, частотные слова, дракон ── */
for (const f of ['freq', 'sentences', 'speech', 'dragon']) require('../src/js/' + f + '.js');
const { FREQ, Sentences, Dragon } = global;
t('freq bank', () => {
  assert.ok(FREQ.length >= 400, 'at least 400: ' + FREQ.length);
  const hskSet = new Set([...HSK[1], ...HSK[2], ...HSK[3]].map(e => e[0]));
  for (const [h, p, r] of FREQ) { assert.ok(h && p && r); assert.ok(!hskSet.has(h), 'dup with HSK: ' + h); assert.equal(Pinyin.toMarks(p), p, 'marks ' + p); }
  assert.ok(FREQ.length + 600 >= 1000, 'bank >= 1000');
});
t('sentences bank', () => {
  assert.ok(Sentences.ITEMS.length >= 100, '>=100: ' + Sentences.ITEMS.length);
  for (const it of Sentences.ITEMS) { assert.ok(it.q && it.py && it.ru && it.a.length); assert.ok(it.q.length <= 40); }
});
const fcards = FREQ.slice(0, 60).map((e, i) => ({ id: 'freq1:' + e[0], hanzi: e[0], pinyin: e[1], ru: e[2], deckId: 'freq1' }));
t('listen mode', () => {
  const easy = Quiz.buildListen(fcards, { difficulty: 'easy', count: 10, order: 'random' }, {});
  assert.equal(easy.length, 10);
  easy.forEach(q => { assert.equal(q.show, 'audio'); assert.equal(q.kind, 'listen'); assert.equal(q.options.length, 4); assert.deepEqual(q.optionParts, ['hanzi', 'pinyin', 'ru']); assert.equal(q.options[q.answerIdx].cardId, q.cardId); });
  const med = Quiz.buildListen(fcards, { difficulty: 'medium', count: 5 }, {});
  med.forEach(q => { assert.equal(q.options.length, 8); assert.deepEqual(q.optionParts, ['hanzi']); });
  const hard = Quiz.buildListen(fcards, { difficulty: 'hard', count: 5 }, {});
  hard.forEach(q => assert.ok(!q.options));
  const q = hard[0];
  assert.equal(Quiz.checkListen(q, q.card.hanzi).ok, true);
  assert.equal(Quiz.checkListen(q, q.card.pinyin).ok, true);
  assert.equal(Quiz.checkListen(q, Pinyin.stripTones(q.card.pinyin)).parts.answer, 'tones');
  assert.equal(Quiz.checkListen(q, 'совсем не то').ok, false);
});
t('sentence mode', () => {
  const easy = Quiz.buildSentence(Sentences.ITEMS, { difficulty: 'easy', count: 10, order: 'random' }, {});
  assert.equal(easy.length, 10);
  easy.forEach(q => { assert.equal(q.kind, 'sentence'); assert.equal(q.options.length, 4); assert.equal(q.options[q.answerIdx].text, q.sent.a[0]); });
  const med = Quiz.buildSentence(Sentences.ITEMS, { difficulty: 'medium', count: 5 }, {});
  med.forEach(q => assert.equal(q.options.length, 8));
  const hard = Quiz.buildSentence(Sentences.ITEMS, { difficulty: 'hard', count: 5 }, {});
  hard.forEach(q => assert.ok(!q.options));
  const q = hard[0];
  assert.equal(Quiz.checkSentence(q, q.sent.a[0] + '。').ok, true);
  assert.equal(Quiz.checkSentence(q, ' ' + (q.sent.a[1] || q.sent.a[0]) + ' ').ok, true);
  assert.equal(Quiz.checkSentence(q, '不对的').ok, false);
});
t('points rebalance', () => {
  const mk = (mode, diff, n) => ({ mode, difficulty: diff, total: n, percent: 100, aborted: false, questions: Array.from({ length: n }, () => ({ fraction: 1, ok: true })) });
  assert.equal(Campaign.attemptPoints(mk('quiz', 'hard', 5)), 17.5);
  assert.equal(Campaign.attemptPoints(mk('listen', 'medium', 4)), 16);
  assert.equal(Campaign.attemptPoints(mk('sentence', 'hard', 3)), 39);
  assert.equal(Campaign.attemptPoints(mk('write', 'easy', 2)), 12);
  /* производство должно стоить дороже узнавания при равном числе заданий */
  assert.ok(Campaign.attemptPoints(mk('write', 'hard', 10)) > Campaign.attemptPoints(mk('quiz', 'hard', 10)));
  assert.ok(Campaign.attemptPoints(mk('sentence', 'hard', 10)) > Campaign.attemptPoints(mk('listen', 'hard', 10)));
  assert.ok(Campaign.BASE.quiz.hard > Campaign.BASE.quiz.medium && Campaign.BASE.quiz.medium > Campaign.BASE.quiz.easy);
});
t('dragon moods', () => {
  const t400 = { done: false, toCap: 400 };
  assert.equal(Dragon.urgency(t400, new Date(2026, 0, 1, 9, 0)), -1, 'morning: silent');
  assert.equal(Dragon.urgency({ done: true, toCap: 0 }, new Date(2026, 0, 1, 20, 0)), -1, 'done: silent');
  const noon = Dragon.urgency(t400, new Date(2026, 0, 1, 12, 30));
  const evening = Dragon.urgency(t400, new Date(2026, 0, 1, 19, 0));
  const night = Dragon.urgency(t400, new Date(2026, 0, 1, 22, 30));
  assert.ok(noon < evening && evening < night, 'escalates with time');
  const nightFew = Dragon.urgency({ done: false, toCap: 50 }, new Date(2026, 0, 1, 22, 30));
  assert.ok(nightFew < night, 'fewer remaining — softer');
  assert.equal(Dragon.moodIdx(-1), -1);
  assert.equal(Dragon.moodIdx(0.1), 0); assert.equal(Dragon.moodIdx(0.95), 3);
  assert.ok(Dragon.phrase(3, t400).includes('400'));
  assert.equal(Dragon.PHRASES.length, 4);
  Dragon.PHRASES.forEach(l => assert.ok(l.length >= 6));
});
console.log(process.exitCode ? 'SOME TESTS FAILED' : 'new modes groups passed');

/* ── настоящий экзамен HSK 1 ── */
global.window.PICS_AVAILABLE = ['p01','p02','p03','p04','p05','p06','p07','p08','p09','p10','p11','p12','p13','p14','p15','p16','p17','p18','p19','p20','p21','p22','p23','p24','p25','p26','p27','p28','p29'];
for (const f of ['hsk1exam', 'hskreal']) require('../src/js/' + f + '.js');
const { HskReal, HSK1EXAM } = global;
t('real exam build', () => {
  for (let iter = 0; iter < 5; iter++) {
    const qs = HskReal.buildExam1();
    assert.equal(qs.length, 40);
    assert.equal(qs.filter(q => q.sec === 'listening').length, 20);
    assert.equal(qs.filter(q => q.sec === 'reading').length, 20);
    for (let part = 1; part <= 4; part++) {
      assert.equal(qs.filter(q => q.sec === 'listening' && q.part === part).length, 5);
      assert.equal(qs.filter(q => q.sec === 'reading' && q.part === part).length, 5);
    }
    const avail = new Set(global.window.PICS_AVAILABLE);
    for (const q of qs) {
      if (q.pic) assert.ok(avail.has(q.pic), 'pic available ' + q.pic);
      if (q.pics) { assert.equal(q.pics.length, 3); q.pics.forEach(p => assert.ok(avail.has(p))); assert.ok(q.correct >= 0 && q.correct < 3); }
      if (q.type === 'opts') { assert.equal(q.opts.length, 3); assert.ok(q.correct >= 0 && q.correct < 3); }
      if (q.type === 'pool') { assert.equal(q.pool.length, 6); assert.ok(q.pool.includes(q.answer)); }
    }
    const l2pics = qs.filter(q => q.sec === 'listening' && q.part === 2).map(q => q.pics[q.correct]);
    const r2pics = qs.filter(q => q.sec === 'reading' && q.part === 2).map(q => q.pics[q.correct]);
    assert.ok(!l2pics.some(p => r2pics.includes(p)), 'L2 и R2 не пересекаются');
    const tf1 = qs.filter(q => q.type === 'tf');
    for (const q of tf1) if (q.correct === 1) { const pic = HSK1EXAM.PICS.find(p => p.id === q.pic); assert.notEqual(q.say || q.text, pic.h, 'ложное — слово не совпадает с картинкой'); }
  }
  const sc = HskReal.score([{ sec: 'listening', ok: true }, { sec: 'listening', ok: false }, { sec: 'reading', ok: true }]);
  assert.equal(sc.sections.listening.points, 50); assert.equal(sc.sections.reading.points, 100); assert.equal(sc.score, 150); assert.equal(sc.passed, true);
});
console.log(process.exitCode ? 'SOME TESTS FAILED' : 'real exam group passed');

/* ── настоящий экзамен HSK 2 ── */
global.window.PICS_AVAILABLE = Array.from({ length: 60 }, (_, i) => 'p' + String(i + 1).padStart(2, '0'));
require('../src/js/hsk2exam.js');
delete require.cache[require.resolve('../src/js/hskreal.js')];
require('../src/js/hskreal.js');
const HskReal2 = global.HskReal;
t('real exam 2 build', () => {
  for (let iter = 0; iter < 5; iter++) {
    const qs = HskReal2.buildExam2();
    assert.equal(qs.length, 60);
    assert.equal(qs.filter(q => q.sec === 'listening').length, 35);
    assert.equal(qs.filter(q => q.sec === 'reading').length, 25);
    assert.equal(qs.filter(q => q.sec === 'listening' && q.part === 1).length, 10);
    assert.equal(qs.filter(q => q.sec === 'listening' && q.part === 2).length, 10);
    assert.equal(qs.filter(q => q.sec === 'listening' && q.part === 3).length, 10);
    assert.equal(qs.filter(q => q.sec === 'listening' && q.part === 4).length, 5);
    for (let part = 1; part <= 4; part++) assert.equal(qs.filter(q => q.sec === 'reading' && q.part === part).length, 5 * (part === 4 ? 2 : 1));
    for (const q of qs) {
      if (q.type === 'poolpic') { assert.equal(q.pool.length, 6); assert.ok(q.pool.includes(q.answer)); }
      if (q.type === 'pool') { assert.equal(q.pool.length, q.part === 4 && q.sec === 'reading' ? 6 : 6); assert.ok(q.pool.includes(q.answer)); }
      if (q.type === 'opts') { assert.equal(q.opts.length, 3); assert.ok(q.correct >= 0 && q.correct < 3); }
      if (q.type === 'tf' && q.sec === 'reading') { assert.ok(q.star); assert.ok(q.correct === 0 || q.correct === 1); }
    }
    assert.ok(HskReal2.SPECS[2].sections.listening.total === 35);
  }
});
console.log(process.exitCode ? 'SOME TESTS FAILED' : 'real exam 2 group passed');

/* ── настоящий экзамен HSK 3 ── */
require('../src/js/hsk3exam.js');
delete require.cache[require.resolve('../src/js/hskreal.js')];
require('../src/js/hskreal.js');
const HskReal3 = global.HskReal;
t('real exam 3 build', () => {
  for (let iter = 0; iter < 5; iter++) {
    const qs = HskReal3.buildExam3();
    assert.equal(qs.length, 80);
    assert.equal(qs.filter(q => q.sec === 'listening').length, 40);
    assert.equal(qs.filter(q => q.sec === 'reading').length, 30);
    assert.equal(qs.filter(q => q.sec === 'writing').length, 10);
    for (const [sec, part, n] of [['listening',1,10],['listening',2,10],['listening',3,10],['listening',4,10],['reading',1,10],['reading',2,10],['reading',3,10],['writing',1,5],['writing',2,5]])
      assert.equal(qs.filter(q => q.sec === sec && q.part === part).length, n, sec + part);
    for (const q of qs) {
      if (q.type === 'poolpic') { assert.equal(q.pool.length, 6); assert.ok(q.pool.includes(q.answer)); }
      if (q.type === 'tf' && q.sec === 'listening') { assert.ok(q.star && q.say); }
      if (q.type === 'arrange') { assert.ok(q.chunks.length >= 3); assert.equal(q.answers[0].length, q.chunks.join('').length); }
      if (q.type === 'input') { assert.ok(q.py && q.answer.length === 1); }
      if (q.sec === 'reading' && q.part === 3) { assert.ok(q.sub); assert.equal(q.opts.length, 3); }
    }
  }
  const sc = HskReal3.score([{ sec: 'listening', ok: true }, { sec: 'reading', ok: true }, { sec: 'writing', ok: false }], HskReal3.SPEC3);
  assert.equal(sc.score, 200); assert.equal(sc.passed, true); assert.equal(Object.keys(sc.sections).length, 3);
  assert.equal(HskReal3.score([{ sec: 'listening', ok: true }, { sec: 'reading', ok: false }, { sec: 'writing', ok: false }], HskReal3.SPEC3).passed, false);
});
console.log(process.exitCode ? 'SOME TESTS FAILED' : 'real exam 3 group passed');

/* ── баланс 对/错, блоки, симуляция «всегда первый вариант» ── */
t('tf balance and blocks', () => {
  for (let iter = 0; iter < 8; iter++) {
    const q1 = HskReal3.buildExam1();
    const l1 = q1.filter(q => q.sec === 'listening' && q.part === 1).filter(q => q.correct === 0).length;
    const r1 = q1.filter(q => q.sec === 'reading' && q.part === 1).filter(q => q.correct === 0).length;
    assert.ok(l1 >= 2 && l1 <= 3, 'HSK1 L1 对 count ' + l1);
    assert.ok(r1 >= 2 && r1 <= 3, 'HSK1 R1 对 count ' + r1);
    assert.ok(q1.filter(q => q.block === 'e1r3').length === 5 && q1.filter(q => q.block === 'e1r4').length === 5);
    const q2 = HskReal3.buildExam2();
    const l21 = q2.filter(q => q.sec === 'listening' && q.part === 1 && q.correct === 0).length;
    assert.equal(l21, 5, 'HSK2 L1 balanced');
    assert.equal(new Set(q2.filter(q => q.block).map(q => q.block)).size, 6, 'HSK2 blocks');
    const q3 = HskReal3.buildExam3();
    const l32 = q3.filter(q => q.sec === 'listening' && q.part === 2 && q.correct === 0).length;
    assert.equal(l32, 5, 'HSK3 L2 balanced');
    assert.equal(new Set(q3.filter(q => q.block).map(q => q.block)).size, 6, 'HSK3 blocks');
  }
});
t('simulate always-first-answer', () => {
  for (const [n, build, spec] of [[1, HskReal3.buildExam1, HskReal3.SPEC1], [2, HskReal3.buildExam2, HskReal3.SPEC2], [3, HskReal3.buildExam3, HskReal3.SPEC3]]) {
    const qs = build();
    for (const q of qs) {
      if (q.type === 'pool' || q.type === 'poolpic') { q.given = q.pool[0]; q.ok = q.given === q.answer; }
      else if (q.type === 'arrange') { q.given = q.chunks.join(''); q.ok = q.answers.includes(q.given); }
      else if (q.type === 'input') { q.given = '错'; q.ok = q.given === q.answer; }
      else { q.ok = q.correct === 0; }
    }
    const sc = HskReal3.score(qs, spec);
    const pct = sc.score / spec.max;
    assert.ok(pct < 0.9, 'HSK' + n + ' not everything correct: ' + sc.score + '/' + spec.max);
    assert.ok(sc.score > 0, 'HSK' + n + ' scored something');
  }
});
console.log(process.exitCode ? 'SOME TESTS FAILED' : 'balance/simulation group passed');


/* ── деградация очков: считаем новизну, а не число заходов ── */
t('decay pays for new content', () => {
  const st = { settings: {}, cardStats: {} };
  const exam = n => ({ mode: 'hsk', format: 'real', level: 1, deckIds: ['hsk1'], points: 100,
    questions: Array.from({ length: 20 }, (_, i) => ({ hanzi: 'q' + (n * 20 + i) })) });
  const a1 = exam(0);
  assert.equal(Campaign.decay(st, a1).novelty, 100);
  assert.equal(Campaign.decay(st, a1).mult, 1, 'новый материал — без скидки');
  Campaign.noteUnit(st, a1);
  /* второй заход целиком из нового материала — скидки быть не должно */
  const a2 = exam(1);
  assert.equal(Campaign.decay(st, a2).novelty, 100);
  assert.equal(Campaign.decay(st, a2).mult, 1, 'другой материал того же экзамена платит полностью');
  Campaign.noteUnit(st, a2);
  /* повтор ровно того же — минимальная ставка */
  const rep = Campaign.decay(st, a1);
  assert.equal(rep.novelty, 0);
  assert.equal(rep.mult, 0.3, 'уже виденное платит 30%');
  /* половина нового — середина */
  const half = { mode: 'hsk', format: 'real', level: 1, deckIds: ['hsk1'], points: 100,
    questions: [...a1.questions.slice(0, 10), ...Array.from({ length: 10 }, (_, i) => ({ hanzi: 'new' + i }))] };
  assert.equal(Campaign.decay(st, half).novelty, 50);
  assert.equal(Campaign.decay(st, half).mult, 0.65);
});
t('decay units by mode', () => {
  const st = { settings: {}, cardStats: {} };
  const words = ['你', '我', '好'];
  const sprint = { mode: 'sprint', block: 'b1-01', points: 60, questions: [], words };
  assert.equal(Campaign.decay(st, sprint).mult, 1);
  Campaign.noteUnit(st, sprint);
  assert.equal(Campaign.decay(st, sprint).mult, 0.3, 'те же слова — сниженная ставка');
  /* другой блок не задет */
  const other = { mode: 'sprint', block: 'b1-05', points: 60, questions: [], words: ['吃', '喝', '茶'] };
  assert.equal(Campaign.decay(st, other).mult, 1);
  /* босс: свежие реплики платят полностью */
  const boss = n => ({ mode: 'boss', boss: 'b1', level: 1, points: 60, questions: [], lines: ['s' + n + 'a', 's' + n + 'b'] });
  assert.equal(Campaign.decay(st, boss(1)).mult, 1);
  Campaign.noteUnit(st, boss(1));
  assert.equal(Campaign.decay(st, boss(2)).mult, 1, 'новые реплики — без скидки');
  assert.equal(Campaign.decay(st, boss(1)).mult, 0.3, 'те же реплики — скидка');
  assert.equal(Campaign.unitKey(sprint), 'blk:b1-01');
  assert.equal(Campaign.contentLevel({ deckIds: ['hsk3'] }), 3);
  assert.equal(Campaign.contentLevel({ deckIds: ['freq1'] }), 4);
  assert.deepEqual(Campaign.contentKeys(sprint), ['w:你', 'w:我', 'w:好']);
});
t('decay by level gap', () => {
  if (!global.Boss) { require('../src/js/boss.js'); }
  const st = { settings: {}, cardStats: {} };
  for (let i = 0; i < 25; i++) st.cardStats['hsk3:x' + i] = { asked: 3, right: 2 };
  const low = Campaign.decay(st, { mode: 'hsk', format: 'real', level: 1, deckIds: ['hsk1'], points: 100, questions: [{ hanzi: 'z1' }] });
  assert.ok(low.mult < 0.7, 'контент на два уровня ниже сильно дешевле: ' + low.mult);
  const up = Campaign.decay(st, { mode: 'hsk', format: 'real', level: 4, deckIds: ['freq1'], points: 100, questions: [{ hanzi: 'z2' }] });
  assert.ok(up.mult > 1, 'контент выше уровня — надбавка: ' + up.mult);
});
console.log(process.exitCode ? 'SOME TESTS FAILED' : 'decay group passed');


/* ── интервальные повторения ── */
require('../src/js/srs.js');
t('srs ladder', () => {
  const st = { settings: {}, cards: [] };
  const D = 24 * 3600e3, now = Date.now();
  const r1 = SRS.grade(st, 'hsk1:爱', true, now);
  assert.equal(r1.step, 0); assert.equal(Math.round((r1.due - now) / D), 1, 'первая встреча — через день');
  const r2 = SRS.grade(st, 'hsk1:爱', true, now);
  assert.equal(Math.round((r2.due - now) / D), 3, 'верно — следующая ступень');
  SRS.grade(st, 'hsk1:爱', true, now);
  const r4 = SRS.grade(st, 'hsk1:爱', true, now);
  assert.equal(Math.round((r4.due - now) / D), 21);
  const bad = SRS.grade(st, 'hsk1:爱', false, now);
  assert.equal(Math.round((bad.due - now) / D), 7, 'ошибка откатывает на ступень назад, а не в начало');
  /* просроченное попадает в очередь */
  assert.equal(SRS.dueCount(st, now), 0);
  assert.equal(SRS.dueCount(st, now + 8 * D), 1);
});
t('srs from attempt', () => {
  const st = { settings: {}, cards: [] };
  const now = Date.now();
  const a = { percent: 100, questions: [{ cardId: 'hsk1:八', ok: true }, { cardId: 'hsk1:本', ok: false }, { cardId: 'hsk1:八', ok: false }] };
  assert.equal(SRS.noteAttempt(st, a, now), 2, 'две уникальные карточки');
  const s = st.settings.srs;
  assert.equal(s['hsk1:八'].step, 0, 'при разных ответах засчитываем худший');
  assert.equal(s['hsk1:本'].step, 0);
  /* живыми считаются те, кто прошёл дальше третьей ступени */
  assert.equal(SRS.alive(st, now).length, 0);
  SRS.grade(st, 'hsk1:八', true, now); SRS.grade(st, 'hsk1:八', true, now); SRS.grade(st, 'hsk1:八', true, now);
  assert.equal(SRS.alive(st, now).length, 1);
  /* прогноз на неделю */
  const f = SRS.forecast(st, 7, now);
  assert.equal(f.length, 7);
  assert.ok(f.reduce((x, y) => x + y, 0) >= 1);
});
console.log(process.exitCode ? 'SOME TESTS FAILED' : 'srs group passed');


/* ── оценка навыков и поток ── */
require('../src/js/skill.js');
require('../src/js/flow.js');
t('skill profile', () => {
  const now = Date.now();
  const mk = (mode, percent, total, ts, extra = {}) => ({ mode, percent, total, ts, aborted: false, deckIds: ['hsk1'], ...extra });
  const st = { attempts: [mk('listen', 90, 20, now), mk('quiz', 40, 20, now), mk('hand', 100, 8, now)], settings: {}, cardStats: {} };
  const p = Skill.profile(st, now);
  assert.equal(p.listen.score, 90);
  assert.equal(p.read.score, 40);
  assert.equal(p.hand.score, 100);
  assert.equal(p.speak.score, null, 'нет данных — нет оценки');
  assert.equal(Skill.weakest(p), 'read');
  /* затухание: старый успех весит меньше свежего провала */
  const st2 = { attempts: [mk('quiz', 100, 20, now - 60 * 864e5), mk('quiz', 40, 20, now)], settings: {}, cardStats: {} };
  const p2 = Skill.profile(st2, now);
  assert.ok(p2.read.score < 60, 'свежий провал перевешивает: ' + p2.read.score);
  /* настоящий экзамен раскладывается по секциям */
  const st3 = { attempts: [{ mode: 'hsk', format: 'real', level: 2, ts: now, aborted: false, total: 60,
    sections: { listening: { correct: 30, total: 35 }, reading: { correct: 10, total: 25 } } }], settings: {}, cardStats: {} };
  const p3 = Skill.profile(st3, now);
  assert.equal(p3.listen.score, 86);
  assert.equal(p3.read.score, 40);
});
t('flow plan and bonus', () => {
  const st = { attempts: [], settings: {}, cardStats: {}, campaign: { days: 0 } };
  const plan = Flow.localPlan(st);
  assert.ok(plan.mix.sprint >= 1 && plan.message);
  const q = Flow.buildQueue(st, plan);
  assert.ok(q.length >= 3, 'очередь собралась: ' + q.length);
  assert.ok(q.every(x => x.title));
  assert.equal(Flow.streakBonus(1), 2);
  assert.equal(Flow.streakBonus(5), 50);
  assert.equal(Flow.streakBonus(10), 60, 'потолок бонуса');
});
console.log(process.exitCode ? 'SOME TESTS FAILED' : 'skill/flow group passed');


/* ── точность колоды требует покрытия ── */
t('deck accuracy needs coverage', () => {
  /* поведение через движок views нельзя, проверяем логику напрямую тем же алгоритмом */
  const calc = (cards, statsMap) => {
    let asked = 0, correct = 0, seen = 0;
    for (const c of cards) { const s = statsMap[c.id]; if (s && s.asked) { asked += s.asked; correct += s.correct; seen++; } }
    if (!asked || (seen < 15 && seen < cards.length * 0.2)) return null;
    return Math.round(correct / asked * 100);
  };
  const deck = Array.from({ length: 100 }, (_, i) => ({ id: 'd:' + i }));
  const two = { 'd:0': { asked: 2, correct: 2 }, 'd:1': { asked: 1, correct: 1 } };
  assert.equal(calc(deck, two), null, 'две карточки из ста — процента нет');
  const many = {}; for (let i = 0; i < 25; i++) many['d:' + i] = { asked: 2, correct: 1 };
  assert.equal(calc(deck, many), 50, 'при покрытии процент честный');
});
console.log(process.exitCode ? 'SOME TESTS FAILED' : 'coverage group passed');
