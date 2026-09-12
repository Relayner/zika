/* Реестр личных ошибок: огонь проходит статусы, серия не набирается одной попыткой,
   возврат считается только после тушения, порядок пересчёта ничего не меняет. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
global.window = global;
for (const f of ['pinyin', 'phonetics', 'hsk', 'fires']) require('../src/js/' + f + '.js');
const { Fires } = global;

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL', name, e.message); process.exitCode = 1; } };

const DAY = 24 * 3600e3, HOUR = 3600e3;
const NOW = Date.UTC(2026, 8, 12, 12, 0, 0);
const T = d => NOW - d * DAY;          /* момент попыток, случившихся d дней назад */
const after = d => T(d) + 12 * HOUR;   /* спустя полдня после них — момент расчёта */

let seq = 0;
/* Попытка-викторина: 'exact' — ответ верен, 'tones' — слоги верны, тон мимо (промах ловушки «тон») */
function quiz(d, parts, card = 'hsk1:爱') {
  return {
    id: 'a' + (++seq), ts: T(d), endedAt: T(d) + 60e3, durationMs: 60e3,
    mode: 'quiz', difficulty: 'medium', level: 1, deckIds: ['hsk1'], deckName: 'HSK 1',
    show: 'hanzi', guess: ['pinyin'], order: 'random', timer: 0,
    total: parts.length, planned: parts.length, aborted: false,
    correct: parts.filter(p => p === 'exact').length, partial: 0, wrong: parts.filter(p => p !== 'exact').length,
    percent: 0, points: 0,
    questions: parts.map(p => ({
      cardId: card, hanzi: '爱', pinyin: 'ài', ru: 'любить', show: 'hanzi', guess: ['pinyin'],
      answer: { input: 'ai' }, parts: { pinyin: p }, fraction: p === 'exact' ? 1 : 0.5, ok: p === 'exact', ms: 4000,
    })),
  };
}
/* Выбор из вариантов: разбора по частям нет, поэтому задет только узел-карточка */
function choice(d, cards, ok) {
  return {
    id: 'c' + (++seq), ts: T(d), mode: 'quiz', difficulty: 'easy', level: 1, deckIds: ['hsk1'], deckName: 'HSK 1',
    aborted: false, total: cards.length, planned: cards.length, percent: ok ? 100 : 0,
    questions: cards.map(c => ({ cardId: c, hanzi: '字', pinyin: 'zì', ru: 'знак', answer: { choice: 1 }, fraction: ok ? 1 : 0, ok, ms: 3000 })),
  };
}
/* Дрилл звучания: различение конца слога */
function phon(d, oks) {
  return {
    id: 'p' + (++seq), ts: T(d), mode: 'phon', difficulty: 'final', level: 1, deckIds: [], deckName: 'Звучание',
    aborted: false, total: oks.length, planned: oks.length, percent: 0,
    questions: oks.map(ok => ({ hanzi: 'shàng', ok, fraction: ok ? 1 : 0, ms: 0, answer: {} })),
  };
}
const fire = (list, id = 'tone') => list.find(f => f.id === id);

/* ── сквозной сценарий: замечен → горит → гаснет → потушен → вспыхнул → потушен снова ── */
const story = {
  attempts: [
    quiz(60, ['tones']),                      /* первый промах — замечен */
    quiz(55, ['tones']),                      /* второй за 5 дней — горит */
    quiz(50, ['exact', 'exact', 'exact']),
    quiz(49, ['exact']),                      /* 4 чистых в 2 дня — гаснет */
    quiz(48, ['exact', 'exact', 'exact']),
    quiz(47, ['exact', 'exact', 'exact']),    /* 8 засчитанных, 3 дня, 7 дней тишины — потушен */
    quiz(40, ['tones']),                      /* один промах после тушения — снова замечен */
    quiz(39, ['tones']),                      /* второй — вспыхнул снова */
    quiz(30, ['exact', 'exact', 'exact']),
    quiz(29, ['exact', 'exact', 'exact']),
    quiz(28, ['exact', 'exact']),             /* потушен во второй раз */
  ],
};

t('огонь проходит все статусы', () => {
  const at = d => fire(Fires.compute(story, after(d)));
  assert.equal(at(60).status, 'noticed', 'первый промах — замечен');
  assert.equal(at(60).why, '1 промах сегодня');
  assert.equal(at(55).status, 'burning', 'два промаха за 30 дней — горит');
  assert.equal(at(55).why, '2 промаха за 5 дней');
  const fad = at(49);
  assert.equal(fad.status, 'fading', 'четыре чистых в два дня — гаснет');
  assert.equal(fad.credit, 4); assert.equal(fad.streakDays, 2);
  const out1 = at(47);
  assert.equal(out1.status, 'out', 'восемь чистых, три дня, неделя тишины — потушен');
  assert.equal(out1.outs, 1);
  assert.equal(out1.toExtinguish, 'потушен');
  assert.ok(out1.outAt > 0 && out1.outAt <= after(47), 'момент тушения выведен из истории');
});

t('промахи, открывшие огонь, не считаются возвратом', () => {
  const one = fire(Fires.compute(story, after(40)));
  assert.equal(one.misses, 3, 'всего промахов три');
  assert.equal(one.epochMisses, 1, 'после тушения счёт возвратов начат с нуля');
  assert.equal(one.status, 'noticed', 'один промах после тушения — снова замечен, не вспышка');
  const re = fire(Fires.compute(story, after(39)));
  assert.equal(re.status, 'relit', 'два промаха после тушения — вспыхнул снова');
  assert.equal(re.why, '2 промаха после тушения');
});

t('повторное тушение платит вдвое меньше', () => {
  const f1 = fire(Fires.compute(story, after(47)));
  const f2 = fire(Fires.compute(story, after(28)));
  assert.equal(f2.status, 'out'); assert.equal(f2.outs, 2, 'потушен дважды');
  const b1 = Fires.bounty(f1), b2 = Fires.bounty(f2);
  assert.ok(b1 >= Fires.BOUNTY_MIN && b1 <= Fires.BOUNTY_MAX, 'плата в рамках 22…112, а не ' + b1);
  assert.equal(b2, Math.round(b1 * 0.5), 'второе тушение — половина');
  assert.equal(b1, f1.bounty, 'плата лежит и в самом огне');
  assert.equal(Fires.bounty({ outs: 3, sev: f1.sev, lambda: f1.lambda }), Math.round(b1 * 0.25));
  assert.equal(Fires.bounty({ outs: 4, sev: f1.sev, lambda: f1.lambda }), 0, 'четвёртое тушение не платит');
  assert.equal(Fires.bounty({ outs: 0, sev: 1, lambda: 1 }), 0, 'непотушенный не платит');
});

t('восемь чистых нельзя набрать одной попыткой', () => {
  const st = { attempts: [quiz(10, ['tones']), quiz(9, ['tones']), quiz(8, Array(8).fill('exact'))] };
  const f = fire(Fires.compute(st, NOW));
  assert.equal(f.streak, 8, 'подряд действительно восемь');
  assert.equal(f.credit, 3, 'засчитано не больше трёх из одной попытки');
  assert.equal(f.status, 'burning', 'одной попыткой огонь не тушится');
  assert.equal(f.outs, 0);
  assert.equal(f.toExtinguish, 'ещё 5 чистых, 2 дня, камень 0.57 → 0.81');
  /* добавили второй и третий день — тогда тушится */
  const st2 = { attempts: st.attempts.concat([quiz(7, ['exact', 'exact', 'exact']), quiz(6, ['exact', 'exact'])]) };
  assert.equal(fire(Fires.compute(st2, NOW)).status, 'out', 'три дня и тишина — потушен');
});

t('чистые одного дня не гасят огонь', () => {
  const second = quiz(10, ['exact']);
  second.ts += 3 * HOUR;                       /* вторая попытка того же дня */
  const st = { attempts: [quiz(25, ['tones']), quiz(20, ['tones']), quiz(10, ['exact', 'exact', 'exact']), second] };
  const f = fire(Fires.compute(st, after(10)));
  assert.equal(f.credit, 4, 'четыре чистых засчитано');
  assert.equal(f.streakDays, 1, 'но день один');
  assert.equal(f.status, 'burning', 'за один день огонь не гаснет');
  const st2 = { attempts: st.attempts.concat([quiz(9, ['exact'])]) };
  assert.equal(fire(Fires.compute(st2, after(9))).status, 'fading', 'второй день — гаснет');
});

t('без семи дней тишины огонь не потушен', () => {
  const st = { attempts: [quiz(25, ['tones']), quiz(20, ['tones']),
    quiz(19, ['exact', 'exact', 'exact']), quiz(18, ['exact', 'exact', 'exact']), quiz(17, ['exact', 'exact'])] };
  const ready = fire(Fires.compute(st, after(17)));
  assert.equal(ready.credit, 8); assert.equal(ready.streakDays, 3);
  assert.equal(ready.status, 'fading', 'серия набрана, но тишины ещё нет');
  assert.equal(ready.quiet, 3);
  assert.equal(ready.outs, 0);
  const almost = fire(Fires.compute(st, after(14)));
  assert.equal(almost.status, 'fading', 'на шестой день тишины ещё горит');
  assert.equal(almost.toExtinguish, 'ещё 1 день тишины, камень 0.95 → 1.00');
  const done = fire(Fires.compute(st, T(13) + HOUR));
  assert.equal(done.status, 'out', 'седьмой день тишины тушит огонь');
  assert.equal(done.outAt, T(20) + 7 * DAY, 'момент тушения — ровно неделя после последнего промаха');
});

t('два промаха в одной попытке зажигают сразу', () => {
  const st = { attempts: [quiz(3, ['tones', 'exact', 'tones'])] };
  const f = fire(Fires.compute(st, NOW));
  assert.equal(f.status, 'burning');
  assert.equal(f.why, '2 промаха в одной попытке');
});

t('шестьдесят дней без случая убирают замеченного', () => {
  const st = { attempts: [quiz(61, ['tones'])] };
  const still = fire(Fires.compute(st, T(61) + 59 * DAY));
  assert.equal(still.status, 'noticed', 'на 59-й день ещё в реестре');
  assert.equal(fire(Fires.compute(st, NOW)), undefined, 'на 61-й день замеченный пропал');
  /* а горящий не пропадает: он про привычку, а не про случайность */
  const hot = { attempts: [quiz(70, ['tones']), quiz(65, ['tones'])] };
  assert.equal(fire(Fires.compute(hot, NOW)).status, 'burning', 'горящий остаётся');
});

t('пересчёт не зависит от порядка', () => {
  const base = Fires.compute(story, NOW);
  const rev = Fires.compute({ attempts: story.attempts.slice().reverse() }, NOW);
  assert.deepEqual(rev, base, 'обратный порядок даёт то же');
  /* устойчивая перетасовка без случайности */
  const mixed = story.attempts.map((a, i) => [((i * 7) % story.attempts.length), a]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
  assert.deepEqual(Fires.compute({ attempts: mixed }, NOW), base, 'перемешанный порядок даёт то же');
  /* и по кускам: история, дописанная позже, равна истории, посчитанной разом */
  const half = story.attempts.slice(0, 6), rest = story.attempts.slice(6);
  assert.deepEqual(Fires.compute({ attempts: rest.concat(half) }, NOW), base, 'дописанное с конца ничего не меняет');
  assert.ok(base.length > 1 && base.every((f, i) => i === 0 || base[i - 1].weight >= f.weight), 'реестр отсортирован по весу');
});

t('расчёт не трогает состояние', () => {
  const st = { attempts: story.attempts, settings: {} };
  const before = JSON.stringify(st);
  Fires.compute(st, NOW); Fires.top3(st, NOW);
  assert.equal(JSON.stringify(st), before, 'state не изменился');
});

t('три главных: не больше двух из одной категории', () => {
  /* четыре узла-слова горят ярче всех, но третьим местом обязан стать огонь другой природы */
  const cards = ['hsk1:爱', 'hsk1:八', 'hsk1:不', 'hsk1:菜'];
  const attempts = [];
  for (const c of cards) for (const d of [12, 8, 4]) attempts.push(choice(d, [c], false));
  attempts.push(phon(20, [false]), phon(15, [false]), phon(10, [true, true, true, true, true, true]));
  const list = Fires.compute({ attempts }, NOW);
  const words = list.filter(f => f.kind === 'word');
  assert.equal(words.length, 4, 'узлов горит четыре');
  assert.ok(words.every(f => f.weight > fire(list, 'ear:final').weight), 'узлы тяжелее звучания — сами бы заняли все три места');
  const top = Fires.top3({ attempts }, NOW);
  assert.equal(top.length, 3);
  assert.equal(top.filter(f => f.kind === 'word').length, 2, 'узлов в тройке не больше двух');
  assert.equal(top[2].id, 'ear:final', 'третье место уходит другой категории');
  assert.ok(top.every(f => f.status !== 'out'), 'потушенные в главные не идут');
  /* в сквозном сценарии всё потушено — главных нет, хотя вес у потухшего ненулевой */
  assert.ok(Fires.compute(story, NOW).every(f => f.status === 'out' && f.weight > 0), 'потухшие огни с весом остались в реестре');
  assert.deepEqual(Fires.top3(story, NOW), [], 'тушить нечего');
  /* при равной частоте тон весит больше узла */
  const both = Fires.top3({ attempts: [quiz(12, ['tones', 'tones']), quiz(6, ['tones', 'tones'])] }, NOW);
  assert.equal(both[0].id, 'tone', 'тон тяжелее узла при той же частоте');
});

t('вес: доля промахов × тяжесть × уровень', () => {
  const st = { attempts: [quiz(12, ['tones']), quiz(8, ['tones']), quiz(4, ['exact', 'exact'])], level: 1 };
  const f = fire(Fires.compute(st, NOW));
  assert.equal(f.n10, 4); assert.equal(f.miss10, 2); assert.equal(f.rate, 0.5);
  assert.equal(f.lambda, 1, 'ловушка на моём уровне');
  assert.equal(f.weight, Math.round(0.5 * f.sev * 1 * 1000) / 1000);
  /* тот же огонь у ученика выше уровнем тушить важнее */
  const up = fire(Fires.compute({ ...st, level: 3 }, NOW));
  assert.equal(up.lambda, 1.3, 'ниже моего уровня — дороже');
  assert.ok(up.weight > f.weight);
  assert.ok(Fires.bounty({ outs: 1, sev: up.sev, lambda: up.lambda }) > Fires.bounty({ outs: 1, sev: f.sev, lambda: f.lambda }));
});

t('разбор пиньиня находит ловушки слога', () => {
  assert.deepEqual(Fires.segment('nǐ hǎo').map(s => s.ini + '|' + s.fin), ['n|i', 'h|ao']);
  assert.deepEqual(Fires.segment('xiǎng').map(s => s.ini + '|' + s.fin), ['x|iang']);
  assert.deepEqual(Fires.segment('èr').map(s => s.ini + '|' + s.fin), ['|er']);
  assert.deepEqual(Fires.segment('yìdiǎnr').map(s => s.ini + '|' + s.fin), ['y|i', 'd|ian']);
  const q = { cardId: 'hsk2:想', hanzi: '想', pinyin: 'xiǎng', ru: 'хотеть', parts: { pinyin: 'wrong' }, ok: false };
  const ids = Fires.trace({ mode: 'quiz', deckIds: ['hsk2'] }, q).map(x => x.id);
  assert.ok(ids.includes('nasal:ian/iang'), 'носовой конец слога задет: ' + ids.join(', '));
  assert.ok(ids.includes('ini:x/sh'), 'спорное начало слога задето');
  assert.ok(ids.includes('syll') && !ids.includes('tone'), 'слоги мимо — тон не разбираем');
  const q2 = { cardId: 'hsk1:女', hanzi: '女', pinyin: 'nǚ', ru: 'женщина', parts: { pinyin: 'tones', ru: 'wrong' }, ok: false };
  const m = new Map(Fires.trace({ mode: 'quiz' }, q2).map(x => [x.id, x.ok]));
  assert.equal(m.get('tone'), false, 'тон мимо');
  assert.equal(m.get('syll'), true, 'слоги верны');
  assert.equal(m.get('spell:nl'), true, 'правило nü задето и выполнено');
  assert.equal(m.get('mean'), false, 'значение мимо');
});

t('дриллы звучания и письмо от руки дают свои огни', () => {
  const ph = d => ({ id: 'p' + d, ts: T(d), mode: 'phon', difficulty: 'final', level: 1, aborted: false, deckIds: [],
    questions: [{ hanzi: 'shàng', ok: false, fraction: 0, ms: 0, answer: {} }, { hanzi: 'sān', ok: true, fraction: 1, ms: 0, answer: {} }] });
  const hd = d => ({ id: 'h' + d, ts: T(d), mode: 'hand', difficulty: 'memory', level: 1, aborted: false, deckIds: [],
    questions: [{ cardId: 'hsk1:爱', hanzi: '爱', ok: false, fraction: 0, ms: 0, answer: {} }] });
  const list = Fires.compute({ attempts: [ph(9), ph(5), hd(9), hd(5)] }, NOW);
  const ear = fire(list, 'ear:final'), hand = fire(list, 'hand:爱');
  assert.equal(ear.status, 'burning'); assert.equal(ear.kind, 'sound');
  assert.equal(ear.n10, 4); assert.equal(ear.miss10, 2);
  assert.equal(hand.status, 'burning'); assert.equal(hand.kind, 'hand');
  assert.equal(fire(list, 'node:hsk1:爱'), undefined, 'письмо не подменяет собой узел карточки');
});

t('каталог ловушек подключается мягко', () => {
  const plain = fire(Fires.compute(story, after(55)));
  assert.equal(plain.ru, 'Тон в записи', 'без каталога работают свои описания');
  global.TRAPS = { byId: { tone: { ru: 'Тон 声调', kind: 'tone', sev: 2 } } };
  const named = fire(Fires.compute(story, after(55)));
  assert.equal(named.ru, 'Тон 声调', 'название пришло из каталога');
  assert.equal(named.sev, 2);
  assert.equal(named.weight, Math.round(named.rate * 2 * named.lambda * 1000) / 1000);
  global.TRAPS = { detect() { throw new Error('каталог сломан'); } };
  assert.equal(fire(Fires.compute(story, after(55))).status, 'burning', 'падение каталога не ломает расчёт');
  global.TRAPS = { detect: (a, q) => (q.parts && q.parts.pinyin === 'tones' ? ['t:свой'] : []) };
  assert.equal(fire(Fires.compute(story, after(55)), 't:свой').status, 'burning', 'находки каталога попадают в реестр');
  delete global.TRAPS;
  assert.equal(fire(Fires.compute(story, after(55))).ru, 'Тон в записи', 'каталог убрали — вернулись свои');
});

t('пустая и битая история не роняют расчёт', () => {
  assert.deepEqual(Fires.compute(null, NOW), []);
  assert.deepEqual(Fires.compute({}, NOW), []);
  assert.deepEqual(Fires.compute({ attempts: [{ ts: T(1), aborted: true, questions: [{ parts: { pinyin: 'tones' } }] }] }, NOW), [], 'брошенные попытки не считаются');
  assert.deepEqual(Fires.compute({ attempts: [{ ts: T(1) }, null, { ts: T(1), questions: [null] }] }, NOW), []);
  assert.deepEqual(Fires.compute({ attempts: story.attempts }, T(70)), [], 'до первой попытки реестр пуст');
  assert.equal(Fires.toExtinguish(null), '');
  assert.deepEqual(Fires.top3({ attempts: [] }, NOW), []);
});


/* ── содержание: китайский должен быть верным, а не просто присутствовать ── */

t('слоги режутся по границам, а не по буквам', () => {
  /* Апостроф и пробел — единственный знак границы там, где второй слог начинается с гласной.
     Потеряв его, 西安 xī'ān превращается в один слог xian (先/现), а 可爱 — в несуществующее «keai». */
  const say = py => Fires.segment(py).map(s => s.bare).join('-');
  assert.equal(say("kě'ài"), 'ke-ai', '可爱 — два слога');
  assert.equal(say("nǚ'ér"), 'nü-er', '女儿 — два слога, а не nüe');
  assert.equal(say('xī’ān'), 'xi-an', '西安 — два слога и при типографском апострофе');
  assert.equal(say('kě ài'), 'ke-ai', 'пробел разделяет так же, как апостроф');
  /* а вот -ng трогать нельзя: 办公 — ban+gong, 中国 — zhong+guo */
  assert.equal(say('bàngōngshì'), 'ban-gong-shi', '办公室: -n отходит к первому слогу');
  assert.equal(say('zhōngguó'), 'zhong-guo', '中国: -ng остаётся целым');
  assert.equal(say('péngyou'), 'peng-you');
  assert.equal(say('shàngkè'), 'shang-ke');
  /* эризация 儿 слога не добавляет */
  assert.equal(say('nǎr'), 'na', '哪儿 — один слог');
  assert.equal(say('yìdiǎnr'), 'yi-dian', '一点儿 — два слога');
  assert.equal(say('èr'), 'er', '二 — сам по себе слог er');
});

t('весь словарь HSK 1–4 режется на верное число слогов', () => {
  let checked = 0;
  const bad = [];
  for (const lvl of ['1', '2', '3', '4']) for (const c of (global.HSK[lvl] || [])) {
    const py = c[1];
    if (!py) continue;
    checked++;
    const got = Fires.segment(py).length, want = Pinyin.syllables(py);
    if (got !== want) bad.push(c[0] + ' ' + py + ' → ' + got + ' вместо ' + want);
  }
  assert.ok(checked > 500, 'словарь загружен: проверено ' + checked);
  assert.deepEqual(bad, [], 'расхождения: ' + bad.slice(0, 5).join('; '));
});

t('огонь заводится на конкретный тон, а не на «тоны вообще»', () => {
  /* 中国 zhōngguó: первый тон взят, второй услышан четвёртым — виноват только второй */
  const q = { cardId: 'hsk1:中国', hanzi: '中国', pinyin: 'zhōngguó', ru: 'Китай',
    parts: { pinyin: 'tones' }, ok: false, answer: { input: 'zhōngguò' } };
  const m = new Map(Fires.trace({ mode: 'quiz' }, q).map(x => [x.id, x.ok]));
  assert.equal(m.get('tone:1'), true, 'первый тон вышел');
  assert.equal(m.get('tone:2'), false, 'второй тон мимо');
  assert.equal(m.get('tone'), false, 'и общий огонь тона тоже горит');
  assert.equal(m.has('tone:3'), false, 'тонов, которых в слове нет, в реестре не заводим');
  /* один и тот же тон дважды в слове — один случай: 你好 nǐ hǎo */
  const two = { hanzi: '你好', pinyin: 'nǐ hǎo', parts: { pinyin: 'tones' }, ok: false, answer: { input: 'nǐ hào' } };
  const t3 = Fires.trace({ mode: 'quiz' }, two).filter(x => x.id === 'tone:3');
  assert.equal(t3.length, 1, 'два третьих тона — один случай');
  assert.equal(t3[0].ok, false, 'и он промах, раз хоть один не вышел');
  /* выравнять нельзя — метку не поставили вовсе — значит виноваты все тоны слова */
  const none = { hanzi: '中国', pinyin: 'zhōngguó', parts: { pinyin: 'tones' }, ok: false, answer: { input: 'zhongguo' } };
  const nm = new Map(Fires.trace({ mode: 'quiz' }, none).map(x => [x.id, x.ok]));
  assert.equal(nm.get('tone:1'), false); assert.equal(nm.get('tone:2'), false);
  /* верный ответ не заводит огня ни на одном тоне */
  const okq = { hanzi: '中国', pinyin: 'zhōngguó', parts: { pinyin: 'exact' }, ok: true, answer: { input: 'zhōngguó' } };
  assert.ok(Fires.trace({ mode: 'quiz' }, okq).filter(x => /^tone/.test(x.id)).every(x => x.ok), 'всё верно — всё чисто');
  /* имена тонов — институтские, с иероглифами */
  for (const [id, zh] of [['tone:1', '阴平'], ['tone:2', '阳平'], ['tone:3', '上声'], ['tone:4', '去声']]) {
    const info = Fires.meta(id, {});
    assert.ok(info.ru.includes(zh), id + ' назван как ' + zh + ', а не «' + info.ru + '»');
    assert.equal(info.kind, 'tone');
  }
});

t('вопрос экзамена — это раздел бланка, а не отдельное слово', () => {
  /* Карточка у всех вопросов одной части общая, поэтому и огонь один — на часть, а не на текст задания */
  const ex = (d, ok) => ({ id: 'e' + d, ts: T(d), mode: 'hsk', format: 'real', level: 3, difficulty: 'exam',
    deckIds: ['hsk3'], deckName: 'Экзамен HSK 3', aborted: false,
    questions: [{ cardId: 'ex3:listening2', sec: 'listening', part: 2, hanzi: 'длинный текст задания',
      ru: 'Верно: 对', parts: {}, fraction: ok ? 1 : 0, ok, ms: 0, answer: {} }] });
  const f = fire(Fires.compute({ attempts: [ex(9, false), ex(5, false)] }, NOW), 'node:ex3:listening2');
  assert.ok(f, 'огонь на части экзамена завёлся');
  assert.equal(f.ru, 'Экзамен HSK 3 · 听力 аудирование, часть 2', 'назван разделом, а не текстом задания');
  assert.equal(f.kind, 'exam'); assert.equal(f.lvl, 3);
  assert.equal(f.status, 'burning');
  const rd = Fires.meta('node:ex1:reading4', {}), wr = Fires.meta('node:ex3:writing1', {});
  assert.ok(rd.ru.includes('阅读') && rd.ru.includes('часть 4'), 'чтение 阅读: ' + rd.ru);
  assert.ok(wr.ru.includes('书写'), 'письмо 书写: ' + wr.ru);
});

t('прочитанный разбор звучания не считается проверкой', () => {
  /* Теория отмечается попыткой с одним «верным» вопросом — это отметка о прочтении, а не случай */
  const th = { id: 'th1', ts: T(3), mode: 'phon', difficulty: 'theory', level: 1, aborted: false, deckIds: [],
    questions: [{ hanzi: 'theory:p-01', ok: true, fraction: 1, ms: 0, answer: {} }] };
  assert.deepEqual(Fires.trace(th, th.questions[0]), [], 'случаев из разбора не возникает');
  assert.deepEqual(Fires.compute({ attempts: [th] }, NOW), [], 'и реестр остаётся пуст');
});

/* ── закон чистоты: ни своего состояния, ни следов в чужом ── */

t('разбор слогов ничего не запоминает между вызовами', () => {
  const a = Fires.segment('zhōngguó').map(s => s.bare).join('-');
  Fires.segment("kě'ài"); Fires.segment('nǐ hǎo'); Fires.compute(story, NOW);
  assert.equal(Fires.segment('zhōngguó').map(s => s.bare).join('-'), a, 'ответ не зависит от того, что спрашивали раньше');
  const segs = Fires.segment('zhōngguó');
  assert.ok(Object.isFrozen(segs) && segs.every(Object.isFrozen), 'разбор отдан замороженным — испортить нельзя');
  assert.throws(() => { 'use strict'; segs.push({}); }, 'дописать в чужой разбор нельзя');
});

t('реестр не держит производных значений', () => {
  /* Дважды посчитанное на одной истории совпадает до последнего поля, а объекты — разные */
  const one = Fires.compute(story, NOW), two = Fires.compute(story, NOW);
  assert.deepEqual(two, one, 'второй расчёт равен первому');
  assert.notEqual(two[0], one[0], 'но это новые объекты, а не сохранённые');
  /* правка выданного огня не влияет на следующий расчёт */
  one[0].weight = 999; one[0].cases.push({ ts: 0, ok: false, src: 'подделка' });
  assert.deepEqual(Fires.compute(story, NOW), two, 'испорченная выдача не отравила расчёт');
});

t('модуль живёт без окна браузера', () => {
  const src = readFileSync(new URL('../src/js/fires.js', import.meta.url), 'utf8');
  for (const bad of ['document.', 'window.location', 'localStorage', 'fetch(', 'require(']) {
    assert.ok(!src.includes(bad), 'в модуле не должно быть ' + bad);
  }
  assert.ok(!/^\s*(import|export)\s/m.test(src), 'ни import, ни export — только window.Fires');
  assert.ok(/^window\.Fires = \(\(\) => \{/m.test(src), 'модуль объявлен как у соседей');
});

t('странности в журнале не роняют расчёт', () => {
  const odd = { attempts: [
    { id: 'x1', ts: T(9), mode: 'quiz', aborted: false },                                   /* попытка без вопросов */
    { id: 'x2', ts: T(8), mode: 'quiz', aborted: false, questions: [{ ok: false }] },        /* вопрос без всего */
    { id: 'x3', ts: T(7), mode: 'quiz', aborted: false, questions: [{ hanzi: '爱', ok: false, parts: { pinyin: 'tones' } }] }, /* без cardId и без пиньиня */
    { id: 'x4', ts: T(6), mode: 'quiz', aborted: false, questions: [{ cardId: '', pinyin: '', parts: { pinyin: 'wrong', ru: 'exact' }, ok: false }] },
    { id: 'x5', ts: T(5), mode: 'hand', aborted: false, questions: [{ cardId: 'hsk1:爱', ok: false }] },  /* письмо без иероглифа */
    { id: 'x6', ts: 'вчера', questions: [] },                                                /* время не число */
    { id: 'x7', ts: T(4), aborted: false, questions: 'не массив' },
  ] };
  const list = Fires.compute(odd, NOW);
  assert.ok(Array.isArray(list), 'расчёт дошёл до конца');
  assert.ok(list.every(f => f.id && f.ru && f.status && f.sev > 0), 'у каждого огня есть имя, статус и тяжесть');
  assert.equal(fire(list, 'node:hsk1:爱'), undefined, 'письмо без иероглифа узла не подменяет');
  /* сломанное «сейчас» откатывается к настоящему времени, а не рушит расчёт */
  assert.ok(Array.isArray(Fires.compute(odd, NaN)));
  assert.ok(Array.isArray(Fires.compute(odd, 'скоро')));
  assert.deepEqual(Fires.compute({ attempts: null }, NOW), []);
  assert.deepEqual(Fires.top3(null, NOW), []);
  assert.equal(Fires.bounty(null), 0);
  assert.deepEqual(Fires.trace({}, {}), [], 'пустой вопрос не даёт случаев');
  assert.deepEqual(Fires.segment(null), [], 'пустой пиньинь разбирается в ничто');
  assert.deepEqual(Fires.segment('爱'), [], 'иероглиф без пиньиня — не слог');
});

t('каждое встроенное описание достижимо и назван по-русски', () => {
  const ids = ['tone', 'tone:1', 'tone:2', 'tone:3', 'tone:4', 'syll', 'mean',
    'ear:tone', 'ear:pair', 'ear:initial', 'ear:final', 'ear:spelling',
    'nasal:in/ing', 'ini:j/zh', 'spell:jqx', 'spell:nl', 'hand:爱', 'node:hsk1:爱'];
  for (const id of ids) {
    const m = Fires.meta(id, { q: { hanzi: '爱', ru: 'любить', cardId: 'hsk1:爱' }, a: { deckIds: ['hsk1'] } });
    assert.ok(m && typeof m.ru === 'string' && m.ru.length > 2, id + ' без названия');
    assert.ok(m.sev > 0, id + ' без тяжести');
    assert.ok(/[А-Яа-я]/.test(m.ru), id + ' назван не по-русски: ' + m.ru);
    assert.ok(Fires.KIND_SEV[m.kind] != null, id + ' с неизвестной категорией ' + m.kind);
  }
  /* правила записи пиньиня берутся из каталога звучания слово в слово */
  assert.equal(Fires.meta('spell:nl', {}).ru, 'После n и l точки остаются');
  assert.equal(Fires.meta('spell:jqx', {}).ru, 'ü теряет точки после j, q, x');
});

t('у каждого статуса есть иероглиф и чтение', () => {
  for (const [k, v] of Object.entries(Fires.STATUS)) {
    assert.ok(/^[一-鿿]+$/.test(v.zh), k + ': иероглиф ожидается, получено ' + v.zh);
    assert.ok(/^[a-zàáǎèéěìíǐòóǒùúǔüǖǘǚǜāēīōū]+$/.test(v.py), k + ': чтение с тонами ожидается, получено ' + v.py);
    assert.ok(/^[А-Яа-я ]+$/.test(v.ru), k + ': название по-русски');
  }
});

console.log(process.exitCode ? 'SOME TESTS FAILED' : 'fires: ' + n + ' групп пройдено, 0 FAIL');
