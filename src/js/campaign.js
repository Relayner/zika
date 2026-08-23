/* Поход: очки за день, переход (кап), марш-бросок 兼程 (5× кап = день за два), пропуск = откат на день.
   30 дней похода, 10 рангов — ранг каждые 3 зачтённых дня. Состояние хранится как контрольная точка
   (days + processedThrough) и продвигается только вперёд по календарю; очки каждой попытки зафиксированы в ней самой. */
window.Campaign = (() => {
  const CAP = 400, ULTRA_MULT = 5, ULTRA = CAP * ULTRA_MULT, TOTAL_DAYS = 30, RANKS = 10, DAYS_PER_RANK = TOTAL_DAYS / RANKS;
  const BASE = { quiz: { easy: 2, medium: 4, hard: 8 }, write: { easy: 5, medium: 7, hard: 10 }, listen: { easy: 3, medium: 5, hard: 9 }, sentence: { easy: 4, medium: 7, hard: 12 }, flip: 1, hsk: 4 };
  const BONUS = { finish: 5, perfect: 10, pass: 30 };
  const NAMES = { cap: 'Переход', ultra: 'Марш-бросок', ultraZh: '兼程' };

  function questionPoints(a, q) {
    let base;
    if (a.mode === 'flip') base = BASE.flip;
    else if (a.mode === 'hsk') base = BASE.hsk;
    else if (BASE[a.mode] && typeof BASE[a.mode] === 'object') base = BASE[a.mode][a.difficulty] || 3;
    else base = BASE.quiz[a.difficulty] || 2;
    return base * (q.fraction || 0);
  }
  function attemptPoints(a) {
    let p = 0;
    for (const q of a.questions || []) p += questionPoints(a, q);
    if (!a.aborted && a.total >= 10) p += BONUS.finish;
    if (a.percent === 100 && a.total >= 10) p += BONUS.perfect;
    if (a.mode === 'hsk' && a.passed) p += BONUS.pass;
    return Math.round(p * 10) / 10;
  }
  const pts = a => (a.points != null ? a.points : attemptPoints(a));

  const key = ts => Stats.dayKey(ts);
  function addDays(k, n) { const [y, m, d] = k.split('-').map(Number); return key(new Date(y, m - 1, d + n, 12).getTime()); }
  function dayPoints(attempts, k) { let p = 0; for (const a of attempts) if (key(a.ts) === k) p += pts(a); return Math.round(p * 10) / 10; }
  const dayResult = p => (p >= ULTRA ? 'ultra' : p >= CAP ? 'done' : 'miss');

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
      const p = dayPoints(attempts, k), r = dayResult(p);
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
  function todayState(c, attempts, now = Date.now()) {
    const k = key(now), p = dayPoints(attempts, k);
    return { key: k, points: p, done: p >= CAP, ultra: p >= ULTRA, bonus: p >= ULTRA ? 2 : p >= CAP ? 1 : 0, toCap: Math.max(0, CAP - p), toUltra: Math.max(0, ULTRA - p) };
  }
  const effectiveDays = (c, attempts, now) => ((c && c.days) || 0) + todayState(c, attempts, now).bonus;
  const rankIndex = days => Math.min(RANKS - 1, Math.floor(Math.max(0, days) / DAYS_PER_RANK));
  function rankProgress(days) {
    days = Math.max(0, days);
    if (days >= TOTAL_DAYS) return { idx: RANKS - 1, inRank: DAYS_PER_RANK, need: DAYS_PER_RANK, complete: true, extra: days - TOTAL_DAYS, toNext: 0 };
    const idx = rankIndex(days);
    return { idx, inRank: days - idx * DAYS_PER_RANK, need: DAYS_PER_RANK, complete: false, extra: 0, toNext: (idx + 1) * DAYS_PER_RANK - days };
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
  return { ensureChests, grantChests, openChest, CAP, ULTRA, ULTRA_MULT, TOTAL_DAYS, RANKS, DAYS_PER_RANK, BASE, BONUS, NAMES, attemptPoints, questionPoints, dayPoints, addDays, create, process, todayState, effectiveDays, rankIndex, rankProgress, recent };
})();
