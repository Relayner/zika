/* «Съёмка местности» — входной тест вместо «начинай с HSK 1».

   Зачем. Уровень в приложении набирается работой (Boss.levelOf: «≥20 слов на уровень»),
   поэтому человек, который уже говорит по-китайски, начинает с первого блока HSK 1 и
   несколько недель доказывает то, что и так умеет. Съёмка даёт точку старта заранее:
   короткая проверка показывает полосу по каждому уровню, первый блок, где посыпалось,
   и пять белых пятен — с цитатой собственного ответа.

   Устройство. Три части примерно по двенадцать-пятнадцать минут, по одной за раз,
   с возобновлением: часть 1 «Обзор» (скринер и проба словаря), часть 2 «Лестницы»
   (по блокам программы), часть 3 «Слух и грамматика».

   Закон чистоты. Всё производное — чистая функция от истории (state.attempts) и явных
   аргументов. Модуль ничего не хранит и ничего не пишет: state() приводит журнал к
   каноническому порядку (ts, затем id), а сборка заданий опирается на постоянное зерно,
   а не на порядок вызовов. Пересчёт с нуля обязан давать тот же результат.

   Учёт. Часть платит фиксированно — ровно один дневной переход (Campaign.capFor), попытка
   идёт с fixedPts: true. Поэтому проверка на сто с лишним заданий не обесценивает неделю
   обычных занятий. Самооценка «знаю» и псевдослова свидетельствами мастерства не считаются:
   у таких заданий нет карточки, и повторения по ним не заводятся. */
window.Survey = (() => {
  const LVLS = [1, 2, 3, 4];
  const DECK = { 1: 'hsk1', 2: 'hsk2', 3: 'hsk3', 4: 'freq1' };
  const LVL_RU = { 1: 'HSK 1', 2: 'HSK 2', 3: 'HSK 3', 4: 'HSK 4' };

  /* ── раскладка частей ──
     Ставки времени: узнавание из вариантов ~6 с, самооценка ~3 с, набор слова ~20 с,
     задание на слух ~9 с, грамматика ~15 с. Отсюда и минуты в PARTS. */
  const SCREEN = 5;                                   /* заданий в каждой группе скринера */
  const GROUPS = ['tone', 'py2hz', 'hz2ru', 'ru2hz']; /* порядок групп скринера — он же лестница полосы 0–4 */
  const PASS = 4;                                     /* группа считается взятой от четырёх верных из пяти */
  const KNOW = 10, PSEUDO = 3, SET = 4;               /* проба полосы: узнаваний всего, из них псевдослов, наборов на полосу */
  const RUNG = 6, MORE = 4, UP = 5, DOWN = 3;         /* лестница: ступень, добор, порог вверх и вниз */
  const UP10 = 8, DOWN10 = 5;                         /* после добора решает счёт из десяти */
  const SLOTS = 2;                                    /* ступеней на уровень */
  const LISTEN = 6;                                   /* заданий на слух в каждом темпе */
  const RATES = [0.78, 1];                            /* два темпа речи (Speech.speak) */
  const GRAM = 10;                                    /* грамматических заданий */

  const COUNT = {
    1: SCREEN * GROUPS.length + KNOW + SET * 2,
    2: LVLS.length * SLOTS * RUNG,
    3: LISTEN * RATES.length + KNOW + SET * 2 + GRAM,
  };
  const PARTS = [
    { n: 1, zh: '概览', ru: 'Обзор', sub: 'скринер и проба словаря', count: COUNT[1], min: 12,
      about: 'Двадцать коротких вопросов на тон, запись и перевод, потом проба словаря HSK 1 и HSK 2: что знаете на глаз и что можете набрать.' },
    { n: 2, zh: '阶梯', ru: 'Лестницы', sub: 'по блокам программы', count: COUNT[2], min: 15,
      about: 'Ступени по блокам программы: шесть заданий на ступень. Пять верных — выше, три и меньше — ниже, четыре — ещё четыре задания.' },
    { n: 3, zh: '听与语法', ru: 'Слух и грамматика', sub: 'два темпа, словарь и конструкции', count: COUNT[3], min: 13,
      about: 'Слух в двух темпах, проба словаря HSK 3 и HSK 4 и десять заданий на конструкции из блоков программы.' },
  ];
  const partOf = n => PARTS.find(p => p.n === n) || null;

  /* виды заданий — каталог с русскими именами: по нему подписаны белые пятна */
  const KINDS = {
    tone: { ru: 'Тон', zh: '声', ask: 'Какой тон у этого слова?' },
    py2hz: { ru: 'Запись → слово', zh: '拼', ask: 'Какое слово записано так?' },
    hz2ru: { ru: 'Слово → значение', zh: '译', ask: 'Что это значит?' },
    ru2hz: { ru: 'Значение → слово', zh: '写', ask: 'Как это записывается?' },
    know: { ru: 'Самооценка', zh: '认', ask: 'Знаете это слово?' },
    set: { ru: 'Набор слова', zh: '打', ask: 'Наберите слово по переводу' },
    listen: { ru: 'На слух', zh: '听', ask: 'Что прозвучало?' },
    gram: { ru: 'Конструкция', zh: '语', ask: 'Что встанет на место пропуска?' },
  };
  const SUBS = {
    screen: { ru: 'Скринер', zh: '筛' },
    probe: { ru: 'Проба словаря', zh: '词' },
    ladder: { ru: 'Лестница', zh: '阶' },
    ear: { ru: 'Слух', zh: '听' },
    gram: { ru: 'Грамматика', zh: '语' },
  };
  const TONE_RU = ['первый ˉ ровный', 'второй ˊ восходящий', 'третий ˇ ныряющий', 'четвёртый ˋ падающий'];
  const YES = 'знаю', NO = 'не знаю';

  /* ── мелочи ── */
  const DROP = /[\s_·，。？！、；：（）《》「」“”‘’…—,.?!;:()[\]{}<>'"-]/g;
  const norm = v => String(v == null ? '' : v).replace(DROP, '').toLowerCase();
  const r2 = x => Math.round(x * 100) / 100;
  const pl = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);
  const pct = x => (x == null ? null : Math.round(x * 100));
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  /* Зерно постоянно: съёмку можно прервать и вернуться — задания те же.
     Явный seed в opts перекрывает его, если зовущему нужен другой набор. */
  const seedOf = (part, opts) => ((opts && opts.seed != null) ? (opts.seed >>> 0) : hash('survey:' + part));
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffled(list, rnd) {
    const a = (list || []).slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* ── банк слов: живой индекс приложения сюда не нужен, встроенных словарей достаточно ──
     Кэш подписан размерами словарей: словари подгрузились позже — банк пересоберётся,
     поэтому кэш это слепок, а не состояние. */
  let bank = null, bankSig = '';
  const sig = () => [1, 2, 3].map(l => (((window.HSK || {})[l]) || []).length).join('.') + '/' + ((window.FREQ || []).length);
  function banks() {
    const s = sig();
    if (bank && bankSig === s) return bank;
    const by = { 1: [], 2: [], 3: [], 4: [] };
    [1, 2, 3].forEach(l => (((window.HSK || {})[l]) || []).forEach(e => by[l].push({ id: 'hsk' + l + ':' + e[0], lvl: l, deck: 'hsk' + l, hanzi: e[0], pinyin: e[1], ru: e[2] })));
    ((window.FREQ) || []).forEach(e => by[4].push({ id: 'freq1:' + e[0], lvl: 4, deck: 'freq1', hanzi: e[0], pinyin: e[1], ru: e[2] }));
    const byId = {}, byHanzi = {}, words = {}, chars = {}, bigrams = {};
    for (const l of LVLS) {
      by[l].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      for (const c of by[l]) {
        if (!byId[c.id]) byId[c.id] = c;
        if (!byHanzi[c.hanzi]) byHanzi[c.hanzi] = c;
        words[c.hanzi] = 1;
        const h = c.hanzi;
        for (let i = 0; i < h.length; i++) {
          if (/[一-鿿]/.test(h[i]) && chars[h[i]] == null) chars[h[i]] = l;
          if (i + 1 < h.length) bigrams[h.slice(i, i + 2)] = 1;
        }
      }
    }
    const charList = Object.keys(chars).sort().map(c => ({ c, lvl: chars[c] }));
    bank = { by, byId, byHanzi, words, chars: charList, bigrams, size: LVLS.reduce((a, l) => a + by[l].length, 0) };
    bankSig = s;
    return bank;
  }
  const sizeOf = lvl => banks().by[lvl].length;
  const totalWords = () => banks().size;

  /* ── псевдослова: сочетания реальных знаков, которых в банке нет ──
     Проверяем по банку приложения (HSK 1–3 и HSK 4): отбрасываем и само сочетание,
     и обратный порядок, и любую пару знаков, встречающуюся внутри настоящих слов. */
  function pseudoWords(n, rnd) {
    const b = banks();
    const pool = b.chars.filter(x => x.lvl <= 2);
    const src = pool.length >= 20 ? pool : b.chars;
    const out = [], seen = {};
    let guard = 0;
    while (out.length < n && guard++ < 5000) {
      const a = src[Math.floor(rnd() * src.length)], c = src[Math.floor(rnd() * src.length)];
      if (!a || !c || a.c === c.c) continue;
      const w = a.c + c.c;
      if (seen[w] || b.words[w] || b.words[c.c + a.c] || b.bigrams[w] || b.bigrams[c.c + a.c]) continue;
      seen[w] = 1;
      out.push({ word: w, lvl: Math.max(a.lvl, c.lvl) });
    }
    return out;
  }
  /* Проверка для теста и для экрана: сочетание точно вне банка */
  const isPseudo = w => {
    const b = banks();
    const s = String(w || '');
    return s.length === 2 && !b.words[s] && !b.bigrams[s] && [...s].every(ch => b.chars.some(x => x.c === ch));
  };

  /* ── сборка заданий ── */
  const take = (lvl, n, rnd, used, minLen = 1) => {
    const pool = banks().by[lvl].filter(c => !used[c.id] && c.hanzi.length >= minLen && c.hanzi.length <= 4 && !/\s/.test(c.hanzi));
    const out = shuffled(pool, rnd).slice(0, n);
    out.forEach(c => { used[c.id] = 1; });
    return out;
  };
  /* Варианты по одному полю карточки: правильный внутри, повторов значения нет */
  function optsOf(card, field, lvl, rnd, n = 4) {
    const right = String(card[field] || '');
    const seen = { [right]: 1 };
    const picks = [];
    for (const c of shuffled(banks().by[lvl], rnd)) {
      if (c.id === card.id) continue;
      const v = String(c[field] || '');
      if (!v || seen[v]) continue;
      seen[v] = 1; picks.push(v);
      if (picks.length >= n - 1) break;
    }
    return shuffled([right, ...picks], rnd);
  }

  const cardTask = (card, kind, lvl, rnd, sub, extra) => {
    const show = kind === 'py2hz' ? card.pinyin : kind === 'ru2hz' ? card.ru : card.hanzi;
    const field = kind === 'hz2ru' ? 'ru' : 'hanzi';
    return Object.assign({
      kind, sub, band: card.lvl, cardId: card.id, hanzi: card.hanzi, pinyin: card.pinyin, ru: card.ru,
      prompt: KINDS[kind].ask, show, options: optsOf(card, field, lvl, rnd), key: String(card[field]),
    }, extra || {});
  };
  function toneTasks(rnd, used) {
    const b = banks();
    const syl = ((window.PHON && PHON.syllables) ? PHON.syllables() : [])
      .filter(s => !s.poly && s.tone >= 1 && s.tone <= 4 && s.lvl <= 2 && b.byHanzi[s.h])
      .sort((x, y) => (x.h < y.h ? -1 : x.h > y.h ? 1 : 0));
    const byTone = { 1: [], 2: [], 3: [], 4: [] };
    for (const s of syl) if (!used[b.byHanzi[s.h].id]) byTone[s.tone].push(s);
    const picks = [];
    for (const t of [1, 2, 3, 4]) { const list = shuffled(byTone[t], rnd); if (list.length) picks.push(list[0]); }
    const rest = shuffled(syl.filter(s => picks.indexOf(s) < 0), rnd);
    while (picks.length < SCREEN && rest.length) picks.push(rest.shift());
    return shuffled(picks, rnd).slice(0, SCREEN).map(s => {
      const card = b.byHanzi[s.h];
      used[card.id] = 1;
      return { kind: 'tone', sub: 'screen', group: 0, band: 0, cardId: card.id, hanzi: card.hanzi, pinyin: card.pinyin, ru: card.ru,
        prompt: KINDS.tone.ask, show: card.hanzi, options: TONE_RU.slice(), key: TONE_RU[s.tone - 1], tone: s.tone };
    });
  }
  const knowTask = card => ({
    kind: 'know', sub: 'probe', band: card.lvl, cardId: card.id, hanzi: card.hanzi, pinyin: card.pinyin, ru: card.ru,
    prompt: KINDS.know.ask, show: card.hanzi, options: [YES, NO], key: null, self: true,
  });
  /* полоса псевдослова — та же, что у пробы: сочетание не принадлежит ни одному уровню,
     а ложная тревога должна поправлять именно ту полосу, где её поймали */
  const pseudoTask = (p, band) => ({
    kind: 'know', sub: 'probe', band, word: p.word, hanzi: p.word, pinyin: '', ru: '',
    prompt: KINDS.know.ask, show: p.word, options: [YES, NO], key: NO, self: true, pseudo: true,
  });
  function setTask(card, rnd) {
    const chars = [...card.hanzi];
    const extra = [];
    for (const c of shuffled(banks().by[card.lvl], rnd)) {
      for (const ch of c.hanzi) if (chars.indexOf(ch) < 0 && extra.indexOf(ch) < 0 && /[一-鿿]/.test(ch)) extra.push(ch);
      if (extra.length >= 4) break;
    }
    return { kind: 'set', sub: 'probe', band: card.lvl, cardId: card.id, hanzi: card.hanzi, pinyin: card.pinyin, ru: card.ru,
      prompt: KINDS.set.ask, show: card.ru, tokens: shuffled([...chars, ...extra.slice(0, 3)], rnd), key: card.hanzi };
  }
  /* Проба полосы: узнавания (среди них псевдослова) и наборы — по полосе на уровень */
  function probeTasks(lvls, rnd, used) {
    const real = KNOW - PSEUDO;
    const per = lvls.map((l, i) => Math.floor(real / lvls.length) + (i < real % lvls.length ? 1 : 0));
    const know = [];
    lvls.forEach((l, i) => take(l, per[i], rnd, used).forEach(c => know.push(knowTask(c))));
    pseudoWords(PSEUDO, rnd).forEach((p, i) => know.push(pseudoTask(p, lvls[i % lvls.length])));
    const sets = [];
    lvls.forEach(l => take(l, SET, rnd, used, 2).forEach(c => sets.push(setTask(c, rnd))));
    return [...shuffled(know, rnd), ...sets];
  }

  /* ── ступени лестницы: по два блока на уровень ── */
  const blocksOf = lvl => ((window.PROGRAM && PROGRAM.byLevel) ? PROGRAM.byLevel(lvl) : []);
  function rungBlocks(lvl) {
    const list = blocksOf(lvl);
    if (!list.length) return [];
    const out = [list[0]];
    const mid = list[Math.floor(list.length / 2)];
    if (mid && mid.id !== list[0].id) out.push(mid);
    return out.slice(0, SLOTS);
  }
  /* Шесть заданий ступени: три на значение, два на запись, один набор */
  function rungTasks(block, lvl, slot, rnd, used) {
    const b = banks();
    const pool = (block.words || []).map(w => b.byHanzi[w]).filter(c => c && !used[c.id]);
    const spare = banks().by[lvl].filter(c => !used[c.id]);
    const src = shuffled(pool, rnd).concat(shuffled(spare, rnd));
    const plan = [['hz2ru', 3], ['ru2hz', 2], ['set', 1]];
    const out = [];
    let i = 0;
    for (const [kind, n] of plan) {
      for (let k = 0; k < n && i < src.length; k++) {
        const card = src[i++];
        if (!card || used[card.id]) { k--; continue; }
        used[card.id] = 1;
        const t = kind === 'set' ? setTask(card, rnd) : cardTask(card, kind, lvl, rnd, 'ladder');
        t.sub = 'ladder'; t.blockId = block.id; t.rung = block.id; t.slot = slot; t.band = lvl;
        out.push(t);
      }
    }
    return out;
  }

  /* ── слух: те же слова в двух темпах, но разные — темп сравниваем честно ── */
  function listenTasks(rate, n, rnd, used) {
    const out = [];
    const lvls = [2, 3];
    lvls.forEach((l, i) => {
      const want = Math.floor(n / lvls.length) + (i < n % lvls.length ? 1 : 0);
      take(l, want, rnd, used, 2).forEach(card => {
        const t = cardTask(card, 'listen', l, rnd, 'ear');
        t.kind = 'listen'; t.prompt = KINDS.listen.ask; t.show = ''; t.rate = rate;
        t.options = optsOf(card, 'hanzi', l, rnd); t.key = card.hanzi;
        out.push(t);
      });
    });
    return shuffled(out, rnd);
  }

  /* ── грамматика: ключевые блоки, по одному заданию на блок ── */
  function keyBlocks() {
    const want = { 1: 3, 2: 3, 3: 2, 4: 2 };
    const out = [];
    for (const lvl of LVLS) {
      const list = blocksOf(lvl);
      const n = want[lvl];
      for (let i = 0; i < n && list.length; i++) {
        const b = list[Math.min(list.length - 1, Math.round(i * (list.length - 1) / Math.max(1, n - 1)))];
        if (b && !out.some(x => x.id === b.id)) out.push(b);
      }
    }
    return out;
  }
  function gramTasks(rnd, used) {
    if (!window.GRAMMAR || !GRAMMAR.pick) return [];
    const out = [];
    const pool = keyBlocks().concat(LVLS.flatMap(l => blocksOf(l)));
    for (const b of pool) {
      if (out.length >= GRAM) break;
      if (out.some(t => t.blockId === b.id)) continue;
      let picked = [];
      try { picked = GRAMMAR.pick(b.id, 3, { seed: hash('survey:gram:' + b.id), formats: ['choice'] }) || []; } catch (e) { picked = []; }
      const it = picked.find(x => x && !used['g:' + x.id] && Array.isArray(x.options) && x.options.length >= 2);
      if (!it) continue;
      used['g:' + it.id] = 1;
      out.push({ kind: 'gram', sub: 'gram', band: it.lvl || b.lvl, blockId: b.id, itemId: it.id, item: it,
        prompt: KINDS.gram.ask, show: it.stem || '', options: it.options.map(o => o.text), key: String((Array.isArray(it.key) ? it.key[0] : it.key) || ''),
        why: it.why || '' });
    }
    return shuffled(out, rnd);
  }

  /* ── части ── */
  function part1(rnd, used) {
    const out = [];
    out.push(...toneTasks(rnd, used));
    out.push(...take(1, SCREEN, rnd, used).map(c => Object.assign(cardTask(c, 'py2hz', 1, rnd, 'screen'), { group: 1, band: 1 })));
    out.push(...take(2, SCREEN, rnd, used).map(c => Object.assign(cardTask(c, 'hz2ru', 2, rnd, 'screen'), { group: 2, band: 2 })));
    out.push(...take(3, SCREEN, rnd, used).map(c => Object.assign(cardTask(c, 'ru2hz', 3, rnd, 'screen'), { group: 3, band: 3 })));
    out.push(...probeTasks([1, 2], rnd, used));
    return out;
  }
  function part2(rnd, used) {
    const out = [];
    for (const lvl of LVLS) rungBlocks(lvl).forEach((b, i) => out.push(...rungTasks(b, lvl, i === 0 ? 'a' : 'b', rnd, used)));
    return out;
  }
  function part3(rnd, used) {
    const out = [];
    RATES.forEach(rate => out.push(...listenTasks(rate, LISTEN, rnd, used)));
    out.push(...probeTasks([3, 4], rnd, used));
    out.push(...gramTasks(rnd, used));
    return out;
  }

  /* План части: задания предыдущих частей заняты, поэтому части не пересекаются ни словом */
  function plan(state, partN, opts) {
    const n = Math.max(1, Math.min(PARTS.length, partN | 0));
    const prev = n > 1 ? plan(state, n - 1, opts) : { tasks: [], used: {} };
    const used = Object.assign({}, prev.used);
    const rnd = mulberry32(seedOf(n, opts));
    const tasks = n === 1 ? part1(rnd, used) : n === 2 ? part2(rnd, used) : part3(rnd, used);
    tasks.forEach((t, i) => {
      t.part = n;
      t.i = i;
      t.id = 'p' + n + '.' + (i + 1) + ':' + t.kind + ':' + (t.cardId || t.itemId || t.word || t.hanzi || i);
    });
    return { tasks, used };
  }
  const build = (state, partN, opts) => plan(state, partN, opts).tasks;

  /* ── судья: чистая функция от задания и ответа ── */
  function judge(task, given) {
    const t = task || {};
    const mine = given == null ? '' : (typeof given === 'object' ? String(given.text == null ? '' : given.text) : String(given));
    if (t.kind === 'gram') {
      let r = { ok: false, fraction: 0 };
      try { if (window.GRAMMAR && t.item) r = GRAMMAR.check(t.item, mine); } catch (e) { r = { ok: false, fraction: 0 }; }
      return { ok: !!r.ok, fraction: r.fraction || 0, mine, right: t.key, scored: true };
    }
    /* самооценка настоящего слова — это данные, а не верный или неверный ответ */
    if (t.key == null) return { ok: null, fraction: null, mine, right: null, scored: false, yes: norm(mine) === norm(YES) };
    const ok = !!norm(mine) && norm(mine) === norm(t.key);
    const out = { ok, fraction: ok ? 1 : 0, mine, right: t.key, scored: true };
    if (t.kind === 'know') out.yes = norm(mine) === norm(YES);
    return out;
  }

  /* ── лестница: правило ступени ──
     Шесть заданий: пять верных и больше — выше, три и меньше — ниже, ровно четыре — добор
     на четыре задания. После добора решает счёт из десяти. */
  function rung(right, asked) {
    if (asked < RUNG) return 'wait';
    if (asked < RUNG + MORE) {
      if (right >= UP) return 'up';
      if (right <= DOWN) return 'down';
      return 'more';
    }
    if (right >= UP10) return 'up';
    if (right <= DOWN10) return 'down';
    return 'hold';
  }

  /* ── разбор ответов части ──
     answers — массив { task, given } (или сами задания с полем given) в том порядке,
     в каком человек отвечал: порядок здесь явный аргумент, а не порядок журнала. */
  function rows(answers) {
    return (answers || []).map(a => {
      const task = (a && a.task) ? a.task : a;
      const given = (a && a.given !== undefined) ? a.given : (task ? task.given : undefined);
      const j = judge(task, given);
      return Object.assign({ task: task || {}, given: j.mine }, j);
    });
  }
  const scoreOf = list => {
    const s = list.filter(r => r.scored);
    const right = s.filter(r => r.ok).length;
    return { right, of: s.length, percent: s.length ? Math.round(right / s.length * 100) : 0 };
  };
  /* Оценка полосы: узнавание за вычетом ложных тревог, поправленное набором.
     Ложная тревога — «знаю» на псевдослово: без этой поправки полоса всегда завышена. */
  function estimate(know, sets) {
    const real = know.filter(r => !r.task.pseudo), fake = know.filter(r => r.task.pseudo);
    if (!real.length) return null;
    const raw = real.filter(r => r.yes).length / real.length;
    const fa = fake.length ? fake.filter(r => r.yes).length / fake.length : 0;
    let est = fa >= 1 ? 0 : Math.max(0, (raw - fa) / (1 - fa));
    const s = scoreOf(sets);
    if (s.of) est *= 0.6 + 0.4 * (s.right / s.of);
    return { est: r2(Math.max(0, Math.min(1, est))), raw: r2(raw), fa: r2(fa), yes: real.filter(r => r.yes).length, of: real.length,
      pseudoYes: fake.filter(r => r.yes).length, pseudo: fake.length, set: s };
  }
  function probeOf(list) {
    const out = {};
    for (const lvl of LVLS) {
      const know = list.filter(r => r.task.sub === 'probe' && r.task.kind === 'know' && r.task.band === lvl);
      const sets = list.filter(r => r.task.sub === 'probe' && r.task.kind === 'set' && r.task.band === lvl);
      if (!know.length && !sets.length) continue;
      const e = estimate(know, sets);
      if (e) out[lvl] = e;
    }
    return out;
  }
  function grade(part, answers) {
    const n = Math.max(1, Math.min(PARTS.length, part | 0));
    const list = rows(answers).filter(r => r.task && r.task.kind);
    const total = scoreOf(list);
    const out = { part: n, right: total.right, of: total.of, percent: total.percent, asked: list.length, blanks: blanksOf(list) };
    if (n === 1) {
      out.groups = GROUPS.map((g, i) => {
        const g1 = list.filter(r => r.task.sub === 'screen' && r.task.group === i);
        const s = scoreOf(g1);
        return { key: g, ru: KINDS[g].ru, zh: KINDS[g].zh, right: s.right, of: s.of, passed: s.of > 0 && s.right >= PASS };
      });
      let band = 0;
      for (const g of out.groups) { if (g.of && g.passed) band++; else break; }
      out.band = band;
      out.probe = probeOf(list);
    } else if (n === 2) {
      const seen = [], by = {};
      for (const r of list) {
        const id = r.task.rung || r.task.blockId;
        if (!id) continue;
        if (!by[id]) { by[id] = { blockId: id, lvl: r.task.band, right: 0, asked: 0 }; seen.push(by[id]); }
        by[id].asked++; if (r.ok) by[id].right++;
      }
      seen.forEach(x => {
        const b = (window.PROGRAM && PROGRAM.byId) ? PROGRAM.byId(x.blockId) : null;
        x.ru = b ? b.ru : x.blockId; x.zh = b ? b.zh : '';
        x.verdict = rung(x.right, x.asked);
        x.solid = x.asked >= RUNG && x.right / x.asked >= UP / RUNG;
      });
      out.rungs = seen;
      const solid = seen.filter(x => x.solid);
      out.top = solid.length ? Math.max(...solid.map(x => x.lvl)) : 0;
      const fell = seen.filter(x => x.asked >= RUNG && !x.solid).sort((a, b) => a.lvl - b.lvl || (a.blockId < b.blockId ? -1 : 1));
      out.start = fell.length ? fell[0] : null;
    } else {
      out.ear = RATES.map(rate => {
        const s = scoreOf(list.filter(r => r.task.sub === 'ear' && r.task.rate === rate));
        return { rate, right: s.right, of: s.of, percent: s.percent };
      });
      out.probe = probeOf(list);
      const g = scoreOf(list.filter(r => r.task.sub === 'gram'));
      out.gram = { right: g.right, of: g.of, percent: g.percent };
    }
    return out;
  }

  /* ── белые пятна: провал с цитатой собственного ответа ── */
  const whatOf = t => {
    if (t.kind === 'tone') return 'тон слова ' + t.hanzi;
    if (t.kind === 'py2hz') return 'запись ' + (t.pinyin || t.show);
    if (t.kind === 'hz2ru') return 'значение ' + t.hanzi;
    if (t.kind === 'ru2hz') return '«' + (t.ru || t.show) + '» иероглифами';
    if (t.kind === 'set') return 'набор слова «' + (t.ru || '') + '»';
    if (t.kind === 'listen') return 'на слух: ' + t.hanzi;
    if (t.kind === 'gram') return 'конструкция: ' + (t.show || t.blockId || '');
    if (t.kind === 'know') return 'сочетание ' + (t.word || t.hanzi) + ' — такого слова нет';
    return t.kind;
  };
  function blanksOf(list, n = 5) {
    const bad = list.filter(r => r.scored && r.ok === false);
    const order = ['gram', 'set', 'listen', 'ru2hz', 'hz2ru', 'py2hz', 'tone', 'know'];
    const by = {};
    for (const r of bad) (by[r.task.kind] || (by[r.task.kind] = [])).push(r);
    for (const k of Object.keys(by)) by[k].sort((a, b) => (b.task.band || 0) - (a.task.band || 0) || (String(a.task.id) < String(b.task.id) ? -1 : 1));
    const out = [];
    let guard = 0;
    while (out.length < n && guard++ < 50) {
      let moved = false;
      for (const k of order) {
        if (out.length >= n) break;
        const list2 = by[k];
        if (list2 && list2.length) { out.push(list2.shift()); moved = true; }
      }
      if (!moved) break;
    }
    return out.map(r => ({
      kind: r.task.kind, ru: (KINDS[r.task.kind] || {}).ru || r.task.kind, band: r.task.band || 0,
      what: whatOf(r.task), mine: r.mine || '—', right: r.right == null ? '' : String(r.right),
      why: r.task.why || (r.task.hanzi && r.task.ru ? r.task.hanzi + ' ' + (r.task.pinyin || '') + ' — ' + r.task.ru : ''),
    }));
  }

  /* ── что пройдено: чистая функция от истории ──
     Канон: (ts, затем id). Перемешанный журнал даёт тот же ответ. */
  const sid = a => String((a && a.id) != null ? a.id : '');
  const CMP = (x, y) => (x.ts - y.ts) || (sid(x) < sid(y) ? -1 : sid(x) > sid(y) ? 1 : 0);
  const attemptsOf = s => ((s || {}).attempts || [])
    .filter(a => a && a.mode === 'survey' && !a.aborted && a.ts && a.part >= 1 && a.part <= PARTS.length)
    .slice().sort(CMP);
  function stateOf(s) {
    const list = attemptsOf(s);
    const parts = {};
    for (const a of list) parts[a.part] = { part: a.part, at: a.ts, id: a.id, correct: a.correct || 0, total: a.total || 0, percent: a.percent || 0 };
    const done = PARTS.map(p => p.n).filter(n => parts[n]);
    const next = PARTS.map(p => p.n).find(n => !parts[n]) || null;
    return { parts, done, next, complete: done.length === PARTS.length, startedAt: list.length ? list[0].ts : null, attempts: list.length };
  }

  /* ── итог съёмки ── */
  /* Ответы восстанавливаем из сохранённых попыток: другого источника правды нет */
  const asRow = q => ({
    task: { kind: q.kind, sub: q.sub, band: q.band || 0, part: q.part, id: q.id || q.cardId || '', rung: q.rung || q.blockId, blockId: q.blockId,
      rate: q.rate, pseudo: !!q.pseudo, word: q.word, hanzi: q.hanzi || q.word || '', pinyin: q.pinyin || '', ru: q.ru || '', show: q.show || '', why: q.why || '', key: q.key == null ? null : q.key },
    given: q.given == null ? '' : String(q.given), mine: q.given == null ? '' : String(q.given),
    ok: q.scored === false ? null : (q.ok == null ? null : !!q.ok), fraction: q.fraction == null ? null : q.fraction,
    scored: q.scored !== false && q.key != null, right: q.key == null ? null : String(q.key),
    yes: q.yes != null ? !!q.yes : norm(q.given) === norm(YES),
  });
  function rowsOf(state, part) {
    const out = [];
    for (const a of attemptsOf(state)) {
      if (part && a.part !== part) continue;
      for (const q of (a.questions || [])) if (q && q.kind) out.push(asRow(q));
    }
    return out;
  }
  const bandText = est => (est == null ? '—' : '≈ ' + pct(est) + '%');

  function result(state, now = Date.now()) {
    const st = stateOf(state);
    const list = rowsOf(state);
    const out = { ok: !!st.done.length, state: st, at: now, bands: [], vocab: null, starts: [], start: null, blanks: [], parts: {}, screen: null, ear: null, gram: null };
    if (!st.done.length) { out.text = 'Съёмка ещё не проходилась'; out.bands = LVLS.map(l => ({ lvl: l, deck: DECK[l], ru: LVL_RU[l], est: null, text: '—', size: sizeOf(l), words: null, from: 'нет данных' })); return out; }
    for (const n of st.done) out.parts[n] = grade(n, rowsOf(state, n).map(r => ({ task: r.task, given: r.given })));

    const probe = probeOf(list);
    /* точность лестницы по уровням — ею закрываем полосы, где пробы не было */
    const lad = {};
    for (const r of list) {
      if (r.task.sub !== 'ladder' || !r.scored) continue;
      const l = r.task.band || 0;
      const c = lad[l] || (lad[l] = { right: 0, of: 0 });
      c.of++; if (r.ok) c.right++;
    }
    out.bands = LVLS.map(l => {
      const p = probe[l] || null;
      const la = lad[l] && lad[l].of ? lad[l].right / lad[l].of : null;
      let est = null, from = 'нет данных';
      if (p && la != null) { est = r2(0.6 * p.est + 0.4 * la); from = 'проба словаря и лестница'; }
      else if (p) { est = p.est; from = 'проба словаря'; }
      else if (la != null) { est = r2(la); from = 'лестница'; }
      const size = sizeOf(l);
      return { lvl: l, deck: DECK[l], ru: LVL_RU[l], est, text: bandText(est), size,
        words: est == null ? null : Math.round(est * size), from,
        probe: p, ladder: lad[l] ? Object.assign({}, lad[l], { percent: Math.round(la * 100) }) : null };
    });
    const known = out.bands.filter(b => b.est != null);
    const total = totalWords();
    out.vocab = known.length
      ? { words: known.reduce((a, b) => a + b.words, 0), of: total, covered: known.length,
          text: '≈ ' + known.reduce((a, b) => a + b.words, 0) + ' ' + pl(known.reduce((a, b) => a + b.words, 0), 'слово', 'слова', 'слов') + ' из ' + total }
      : null;

    /* точки старта: первый блок каждого уровня, где посыпалось */
    const p2 = out.parts[2];
    if (p2 && p2.rungs) {
      const fell = p2.rungs.filter(x => x.asked >= RUNG && !x.solid).sort((a, b) => a.lvl - b.lvl || (a.blockId < b.blockId ? -1 : 1));
      const seenLvl = {};
      for (const x of fell) {
        if (seenLvl[x.lvl]) continue;
        seenLvl[x.lvl] = 1;
        out.starts.push({ blockId: x.blockId, lvl: x.lvl, ru: x.ru, zh: x.zh, right: x.right, of: x.asked,
          why: 'верных ' + x.right + ' из ' + x.asked + ' — ниже порога ' + UP + ' из ' + RUNG });
      }
      out.start = out.starts.length ? out.starts[0] : null;
      out.top = p2.top || 0;
    }
    out.blanks = blanksOf(list);
    out.screen = out.parts[1] ? { band: out.parts[1].band, groups: out.parts[1].groups } : null;
    out.ear = out.parts[3] ? out.parts[3].ear : null;
    out.gram = out.parts[3] ? out.parts[3].gram : null;
    out.text = st.complete ? 'Съёмка пройдена целиком' : 'Пройдено частей: ' + st.done.length + ' из ' + PARTS.length;
    return out;
  }

  /* ── учёт: часть платит ровно один дневной переход ── */
  const payFor = campaign => (window.Campaign && Campaign.capFor ? Campaign.capFor(campaign) : 400);

  return { PARTS, KINDS, SUBS, GROUPS, LVLS, DECK, LVL_RU, TONE_RU, YES, NO,
    SCREEN, PASS, KNOW, PSEUDO, SET, RUNG, MORE, UP, DOWN, UP10, DOWN10, SLOTS, LISTEN, RATES, GRAM, COUNT,
    build, plan, judge, rung, grade, result, state: stateOf, payFor, partOf,
    isPseudo, pseudoWords, blanksOf, estimate, sizeOf, totalWords, norm, bandText };
})();
