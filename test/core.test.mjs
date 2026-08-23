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
  assert.equal(e.length, 3); e.forEach(q => { assert.equal(q.show, 'both'); assert.deepEqual(q.guess, ['hanzi']); assert.ok(!q.options); });
  assert.equal(Quiz.buildQuestions(cards, cards, { mode: 'write', difficulty: 'medium', count: 1 }, {})[0].show, 'pinyin');
  const h = Quiz.buildQuestions(cards, cards, { mode: 'write', difficulty: 'hard', count: 1 }, {})[0];
  assert.equal(h.show, 'ru');
  assert.equal(Quiz.checkInput(h, { hanzi: h.card.hanzi }).ok, true);
  assert.equal(Quiz.checkInput(h, { hanzi: '错' }).ok, false);
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
  assert.equal(Campaign.attemptPoints(mkA(0, 'quiz', 'easy', qs(10))), 10 * 2 + 5 + 10);
  assert.equal(Campaign.attemptPoints(mkA(0, 'quiz', 'hard', qs(10, 0.5))), 10 * 8 * 0.5 + 5);
  assert.equal(Campaign.attemptPoints(mkA(0, 'flip', 'flip', qs(5))), 5);
  assert.equal(Campaign.attemptPoints(mkA(0, 'hsk', 'exam', qs(20), { passed: true })), 20 * 4 + 5 + 10 + 30);
  assert.equal(Campaign.attemptPoints(mkA(0, 'write', 'medium', qs(3))), 21);
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
  assert.equal(Campaign.rankIndex(3), 1); assert.equal(Campaign.rankIndex(0), 0); assert.equal(Campaign.rankIndex(29), 9); assert.equal(Campaign.rankIndex(300), 9);
  assert.equal(Campaign.rankProgress(4).toNext, 2); assert.equal(Campaign.rankProgress(30).complete, true);
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
  assert.equal(Campaign.attemptPoints(mk('quiz', 'hard', 5)), 40);
  assert.equal(Campaign.attemptPoints(mk('listen', 'medium', 4)), 20);
  assert.equal(Campaign.attemptPoints(mk('sentence', 'hard', 3)), 36);
  assert.equal(Campaign.attemptPoints(mk('write', 'easy', 2)), 10);
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
