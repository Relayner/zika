/* Поход: очки за день, переход (кап), марш-бросок 兼程 (5× кап = день за два), пропуск = откат на день.
   30 дней похода, 10 рангов — ранг каждые 3 зачтённых дня. Состояние хранится как контрольная точка
   (days + processedThrough) и продвигается только вперёд по календарю; очки каждой попытки зафиксированы в ней самой. */
window.Campaign = (() => {
  const CAP = 400, ULTRA_MULT = 5, ULTRA = CAP * ULTRA_MULT, RANKS = 10;
  /* Дней на переход к следующему рангу: первые даются легко, дальше всё дороже */
  const RANK_DAYS = [3, 4, 5, 6, 7, 8, 9, 10, 11];
  const RANK_AT = RANK_DAYS.reduce((acc, d) => (acc.push(acc[acc.length - 1] + d), acc), [0]);   /* дней к началу каждого ранга */
  const TOTAL_DAYS = RANK_AT[RANK_AT.length - 1];   /* 63 дня до высшего ранга */
  const DAYS_PER_RANK = RANK_DAYS[0];
  /* Ставка за задание = работа головы × время на неё. Считана так, чтобы минута любого серьёзного
     занятия стоила примерно одинаково, а производство и полный экзамен были не дешевле узнавания. */
  const BASE = {
    quiz: { easy: 1.5, medium: 2.5, hard: 3.5 },        /* узнавание из вариантов, ~6 с */
    listen: { easy: 2.5, medium: 4, hard: 5.5 },        /* узнавание на слух, ~9 с */
    write: { easy: 6, medium: 8, hard: 10 },            /* производство иероглифа, ~16 с */
    sentence: { easy: 7, medium: 10, hard: 13 },        /* производство фразы, ~20 с */
    flip: 1,                                            /* самооценка без проверки — намеренно дёшево */
    hsk: 3,                                             /* словарный тест */
    exam: 6,                                            /* задание настоящего экзамена, ~11 с */
    hand: { trace: 5, hint: 8, memory: 11, dictation: 13 },   /* письмо от руки, знак ~12-20 с */
    phon: 4,                                            /* дрилл на слух, ~7 с */
  };
  const BONUS = { finish: 3, perfect: 6, pass: 30 };
  const NAMES = { cap: 'Переход', ultra: 'Марш-бросок', ultraZh: '兼程' };

  function questionPoints(a, q) {
    let base;
    if (a.mode === 'phon') base = BASE.phon;
    else if (a.mode === 'hand') base = BASE.hand[a.difficulty] || BASE.hand.trace;
    else if (a.mode === 'flip') base = BASE.flip;
    else if (a.mode === 'hsk') base = a.format === 'real' ? BASE.exam : BASE.hsk;
    else if (BASE[a.mode] && typeof BASE[a.mode] === 'object') base = BASE[a.mode][a.difficulty] || 3;
    else base = BASE.quiz[a.difficulty] || 2;
    return base * (q.fraction || 0);
  }
  function attemptPoints(a) {
    let p = 0;
    for (const q of a.questions || []) p += questionPoints(a, q);
    if (!a.aborted && a.total >= 10) p += BONUS.finish;
    if (a.percent === 100 && a.total >= 10) p += BONUS.perfect;
    if (a.mode === 'hsk' && a.format === 'real' && a.passed) p += BONUS.pass;   /* надбавка за сданный настоящий экзамен, не за словарный тест */
    return Math.round(p * 10) / 10;
  }
  const pts = a => (a.points != null ? a.points : attemptPoints(a));

  /* ── Деградация очков ──
     Платим за новое, а не за число заходов: если материал каждый раз другой, скидки нет.
     Уже виденное за неделю оплачивается по сниженной ставке. */
  const LVL_MULT = { 0: 1, 1: 0.6, 2: 0.35, 3: 0.2 };   /* насколько контент ниже рабочего уровня */
  const SEEN_WINDOW = 7 * 24 * 3600e3;
  const OLD_RATE = 0.3;                                  /* сколько платит повторённый материал */
  const SEEN_CAP = 4000;

  /* Единицы содержания попытки: то, что нужно было знать */
  function contentKeys(a) {
    if (Array.isArray(a.lines) && a.lines.length) return a.lines.map(x => 'l:' + String(x).slice(0, 40));         /* реплики босса */
    if (a.mode === 'hand') return (a.questions || []).map(q => 'h:' + (q.hanzi || q.cardId || '')).filter(x => x.length > 2);   /* письмо — своя новизна, не делит её со спринтом */
    if (Array.isArray(a.words) && a.words.length) return a.words.map(x => 'w:' + x);                              /* слова спринта */
    const qs = a.questions || [];
    const out = [];
    for (const q of qs) {
      if (q.cardId) out.push('c:' + q.cardId);
      else if (q.hanzi) out.push('q:' + String(q.hanzi).slice(0, 40));
    }
    return out;
  }
  function contentLevel(a) {
    if (a.level) return a.level;
    if (a.block) return +String(a.block).slice(1, 2) || null;
    const d = (a.deckIds || [])[0] || '';
    if (/^hsk([123])$/.test(d)) return +d.slice(3);
    if (/^freq/.test(d)) return 4;
    return null;
  }
  function unitKey(a) {
    if (a.block) return 'blk:' + a.block;
    if (a.mode === 'boss') return 'boss:' + a.boss;
    if (a.mode === 'hsk') return 'hsk:' + (a.format === 'real' ? 'exam' : 'test') + a.level;
    return 'deck:' + (a.deckIds || []).join('+') + ':' + a.mode;
  }
  const seenStore = state => (state.settings.seenContent || (state.settings.seenContent = {}));
  /* Доля материала, которого не было за последнюю неделю */
  function novelty(state, a, now = Date.now()) {
    const keys = [...new Set(contentKeys(a))];
    if (!keys.length) return null;
    const seen = seenStore(state);
    let fresh = 0;
    for (const k of keys) if (!seen[k] || now - seen[k] > SEEN_WINDOW) fresh++;
    return { share: fresh / keys.length, fresh, total: keys.length };
  }
  function decay(state, a, now = Date.now()) {
    const parts = [];
    let m = 1;
    const my = (window.Boss && Boss.levelOf) ? Boss.levelOf(state) : 1;
    const cl = contentLevel(a);
    if (cl) {
      const gap = my - cl;
      if (gap > 0) { const k = LVL_MULT[Math.min(3, gap)]; m *= k; parts.push(`уровень ниже вашего на ${gap} — ×${k}`); }
      else if (gap < 0) { m *= 1.25; parts.push('уровень выше вашего — ×1.25'); }
    }
    const nov = novelty(state, a, now);
    if (nov) {
      const k = Math.round((OLD_RATE + (1 - OLD_RATE) * nov.share) * 100) / 100;
      m *= k;
      const pct = Math.round(nov.share * 100);
      if (pct >= 95) parts.push(`материал новый (${pct}%) — без скидки`);
      else parts.push(`новизна ${pct}% — ×${k}: уже виденное платит ${Math.round(OLD_RATE * 100)}%`);
    }
    return { mult: Math.round(m * 100) / 100, why: parts, novelty: nov ? Math.round(nov.share * 100) : null, key: unitKey(a) };
  }
  /* Помечаем содержание как виденное — один раз при сохранении попытки */
  function noteUnit(state, a, now = Date.now()) {
    const seen = seenStore(state);
    for (const k of contentKeys(a)) seen[k] = now;
    const ks = Object.keys(seen);
    if (ks.length > SEEN_CAP) {
      ks.sort((x, y) => seen[x] - seen[y]).slice(0, ks.length - SEEN_CAP).forEach(k => delete seen[k]);
    }
  }

  const key = ts => Stats.dayKey(ts);
  function addDays(k, n) { const [y, m, d] = k.split('-').map(Number); return key(new Date(y, m - 1, d + n, 12).getTime()); }
  function dayPoints(attempts, k) { let p = 0; for (const a of attempts) if (key(a.ts) === k) p += pts(a); return Math.round(p * 10) / 10; }
const dayResult = (p, cap = CAP) => (p >= ULTRA ? 'ultra' : p >= cap ? 'done' : 'miss');

  function create() { return { schema: 1, days: 0, startedAt: null, processedThrough: null, log: [], rankPeak: 0, stats: { done: 0, ultra: 0, miss: 0 } }; }

  /* Финализирует все прошедшие календарные дни. Возвращает новые записи журнала. Сегодняшний день не трогает. */
  function process(c, attempts, now = Date.now()) {
    const today = key(now), added = [];
    if (!c.stats) c.stats = { done: 0, ultra: 0, miss: 0 };
    if (!c.log) c.log = [];
    if (!c.startedAt) {
      if (!attempts.length) return added;
      c.startedAt = key(Math.min(...attempts.map(a => a.ts)));
      c.processedThrough = addDays(c.startedAt, -1);
    }
    if (!c.processedThrough || c.processedThrough >= today) { c.rankPeak = Math.max(c.rankPeak || 0, rankIndex(effectiveDays(c, attempts, now))); return added; }
    let k = addDays(c.processedThrough, 1), guard = 0;
    while (k < today && guard++ < 5000) {
      const p = dayPoints(attempts, k), r = dayResult(p, capFor(c));
      if (r === 'ultra') c.days += 2; else if (r === 'done') c.days += 1; else c.days = Math.max(0, c.days - 1);
      c.stats[r] = (c.stats[r] || 0) + 1;
      const e = { d: k, p, r };
      c.log.push(e); added.push(e);
      c.processedThrough = k;
      k = addDays(k, 1);
    }
    if (c.log.length > 400) c.log = c.log.slice(-400);
    c.rankPeak = Math.max(c.rankPeak || 0, rankIndex(effectiveDays(c, attempts, now)));
    return added;
  }
  /* Разгон: первые три дня похода переход стоит 120 очков — столько даёт полный день новичка (звучание, черты, один урок).
     Дальше — обычные 400. Считаем по записанным дням, а не по счётчику похода: откат ветерана разгоном не станет. */
  const CAP_START = 120;
  const capFor = c => ((c && c.log ? c.log.length : 0) < 3 ? CAP_START : CAP);
  function todayState(c, attempts, now = Date.now()) {
    const k = key(now), p = dayPoints(attempts, k), cap = capFor(c);
    return { key: k, points: p, cap, done: p >= cap, ultra: p >= ULTRA, bonus: p >= ULTRA ? 2 : p >= cap ? 1 : 0, toCap: Math.max(0, cap - p), toUltra: Math.max(0, ULTRA - p) };
  }
  const effectiveDays = (c, attempts, now) => ((c && c.days) || 0) + todayState(c, attempts, now).bonus;
  function rankIndex(days) {
    const d = Math.max(0, days);
    let i = 0;
    while (i < RANKS - 1 && d >= RANK_AT[i + 1]) i++;
    return i;
  }
  function rankProgress(days) {
    days = Math.max(0, days);
    if (days >= TOTAL_DAYS) { const n = RANK_DAYS[RANKS - 2]; return { idx: RANKS - 1, inRank: n, need: n, complete: true, extra: days - TOTAL_DAYS, toNext: 0 }; }
    const idx = rankIndex(days);
    const need = RANK_DAYS[idx] || RANK_DAYS[RANK_DAYS.length - 1];
    return { idx, inRank: days - RANK_AT[idx], need, complete: false, extra: 0, toNext: RANK_AT[idx + 1] - days };
  }
  /* Последние n календарных дней: r = 'done' | 'ultra' | 'miss' | 'today' | 'none' */
  function recent(c, attempts, n = 30, now = Date.now()) {
    const today = key(now), byDay = {};
    for (const e of (c && c.log) || []) byDay[e.d] = e;
    const out = [];
    for (let i = n - 1; i >= 1; i--) { const k = addDays(today, -i); const e = byDay[k]; out.push(e ? { d: k, r: e.r, p: e.p } : { d: k, r: c && c.startedAt && k >= c.startedAt ? 'miss' : 'none', p: 0 }); }
    const t = todayState(c, attempts, now);
    out.push({ d: today, r: 'today', p: t.points, done: t.done, ultra: t.ultra });
    return out;
  }
  /* ── сундуки за марш-броски ── */
  function ensureChests(c) { if (!c.chests) c.chests = { pending: 0, opened: 0, granted: [] }; if (!c.inventory) c.inventory = {}; if (!c.chestLog) c.chestLog = []; return c; }
  /* По одному сундуку за каждый день-марш-бросок (прошедший или сегодняшний). Возвращает число новых. */
  function grantChests(c, attempts, now = Date.now()) {
    ensureChests(c); let n = 0;
    const grant = d => { if (!c.chests.granted.includes(d)) { c.chests.granted.push(d); c.chests.pending++; n++; } };
    for (const e of c.log || []) if (e.r === 'ultra') grant(e.d);
    const t = todayState(c, attempts, now); if (t.ultra) grant(t.key);
    /* сундук новобранца: первый переход в первые три дня похода */
    if (t.done && !t.ultra && c.chests.first == null && (c.log || []).length < 3) { c.chests.first = t.key; c.chests.pending++; n++; }   /* марш-бросок уже дал сундук */
    if (c.chests.granted.length > 500) c.chests.granted = c.chests.granted.slice(-500);
    return n;
  }
  function openChest(c, rnd) {
    ensureChests(c);
    if (c.chests.pending <= 0) return null;
    const items = Treasures.openChest(rnd);
    c.chests.pending--; c.chests.opened++;
    for (const id of items) c.inventory[id] = (c.inventory[id] || 0) + 1;
    const entry = { ts: Date.now(), items, value: items.reduce((s, id) => s + (Treasures.byId[id] ? Treasures.byId[id].value : 0), 0) };
    c.chestLog.push(entry); if (c.chestLog.length > 200) c.chestLog = c.chestLog.slice(-200);
    return entry;
  }
  return { ensureChests, grantChests, openChest, decay, noteUnit, unitKey, contentLevel, contentKeys, novelty, RANK_DAYS, RANK_AT, CAP, CAP_START, capFor, ULTRA, ULTRA_MULT, TOTAL_DAYS, RANKS, DAYS_PER_RANK, BASE, BONUS, NAMES, attemptPoints, questionPoints, dayPoints, addDays, create, process, todayState, effectiveDays, rankIndex, rankProgress, recent };
})();
