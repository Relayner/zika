/* Две книги учёта: текущая методика (v1) и тестовая (v2).

   Закон: журнал попыток (state.attempts) один на обе методики и только пополняется.
   Всё производное — повторения, блоки программы, поход, новизна — ведётся ОТДЕЛЬНО для
   каждой книги и пополняется на каждой попытке, какая бы книга ни была открыта. Поэтому
   переключение обратимо: поработали в тестовой, вернулись в текущую — там учтено всё,
   что произошло, но по её правилам.

   Книга v1 живёт в прежних местах (settings.srs, settings.program, settings.seenContent,
   ключ campaign): старый код читает её как раньше, и приложение без этого модуля работает.
   Книга v2 живёт в settings.v2 и в любой момент пересобирается из журнала — пересборка
   канонична, а пополнение по одной попытке даёт ровно тот же результат (проверяется тестом).

   Очки попытки лежат в ней самой: a.points — по текущей методике, a.p2 — по тестовой.
   Campaign спрашивает у книги, чьи очки считать, поэтому день, поход и ранги считаются
   по открытой книге без единой правки в местах показа. */
window.Ledger = (() => {
  const VERS = {
    v1: { id: 'v1', zh: '今', ru: 'Текущая', sub: 'как сейчас у всех' },
    v2: { id: 'v2', zh: '新', ru: 'Тестовая', sub: 'новая методика' },
  };
  const FAST_MS = 2500;                       /* быстрее — это тычок, а не ответ */
  let bound = null, forced = null;
  const bind = state => { bound = state; };
  const defaultVer = () => ((window.CHANNEL && window.CHANNEL.defaultVer) || 'v1');
  function active(state) {
    if (forced) return forced;
    const st = state || bound;
    const v = st && st.settings ? st.settings.ver : null;
    return VERS[v] ? v : defaultVer();
  }
  const is2 = state => active(state) === 'v2';
  /* Временно считать по указанной книге (пополнение неактивной книги) */
  function withVer(v, fn) { const prev = forced; forced = v; try { return fn(); } finally { forced = prev; } }

  const v2box = state => {
    const s = state.settings || (state.settings = {});
    return (s.v2 || (s.v2 = { srs: {}, program: {}, seen: {}, campaign: null, builtFrom: null }));
  };
  const books = state => (state.books || (state.books = {}));

  /* Подставное состояние книги v2: свои повторения, блоки и память новизны */
  function shim(state) {
    const b = v2box(state);
    if (!b.srs) b.srs = {}; if (!b.program) b.program = {}; if (!b.seen) b.seen = {};
    return { cards: state.cards, cardStats: state.cardStats, attempts: state.attempts, decks: state.decks,
      settings: { program: progStore(state), srs: b.srs, seenContent: b.seen }, campaign: b.campaign, __srs: b.srs };
  }

  /* ── доступ к книгам ── */
  function srsStore(state, ver) {
    const v = ver || active(state);
    if (v === 'v2') { const b = v2box(state); return (b.srs || (b.srs = {})); }
    const s = state.settings || (state.settings = {}); return (s.srs || (s.srs = {}));
  }
  /* Блоки программы ОБЩИЕ для обеих книг: «какие слова я смотрел и какой блок прошёл» —
     это факт, а не вопрос методики. Расхождение книг живёт там, где расходятся правила:
     очки, поход, повторения и оценка уровня. */
  function progStore(state) {
    const s = state.settings || (state.settings = {}); return (s.program || (s.program = {}));
  }
  function campaign(state, ver) {
    const v = ver || active(state), bk = books(state);
    if (v === 'v1') return (bk.v1 || (bk.v1 = state.campaignV1 || Campaign.create()));
    const b = v2box(state);
    if (!b.campaign) rebuild(state);
    return (bk.v2 = b.campaign);
  }

  /* ── очки тестовой методики ──
     Отличия от текущей: (1) верный тычок быстрее 2,5 с не оплачивается; (2) попытка,
     похожая на угадывание, стоит вдвое дешевле; (3) есть плата за потушенный огонь;
     (4) деградация считается только по новизне, без множителя «материал ниже вашего уровня»:
     иначе очки прошлых дней зависели бы от сегодняшнего уровня и пересборка книги
     перестала бы совпадать с пополнением. */
  function rawPoints(a) {
    const base = Campaign.attemptPoints(a);
    const fast = (a.questions || []).filter(q => q && q.answer && q.answer.choice != null && q.ms && q.ms < FAST_MS && q.ok);
    if (!fast.length) return base;
    let cut = 0;
    for (const q of fast) cut += Campaign.questionPoints(a, q);
    return Math.max(0, Math.round((base - cut) * 10) / 10);
  }
  function looksGuessed(a) {
    const qs = (a.questions || []).filter(q => q && q.answer && q.answer.choice != null);
    if (qs.length < 8) return false;
    return qs.filter(q => q.ms && q.ms < FAST_MS).length / qs.length >= 0.4 && (a.percent || 0) <= 35;
  }
  /* Очки попытки в книге v2 с деградацией на момент попытки */
  function computePoints(state, a, now) {
    /* Цена назначена самим режимом (съёмка, донесение): ни деградации, ни доплат */
    if (a.fixedPts) return Math.round((a.p2fix != null ? a.p2fix : (a.points || 0)) * 10) / 10;
    let p = rawPoints(a);
    if (looksGuessed(a)) p = Math.round(p * 0.5 * 10) / 10;
    if (!a.aborted && p > 0) {
      const nov = Campaign.novelty(shim(state), a, now);
      if (nov) p = p * (0.3 + 0.7 * nov.share);
    }
    if (a.bounty) p += a.bounty;
    return Math.round(p * 10) / 10;
  }
  /* Очки попытки по открытой (или принудительно заданной) книге — это спрашивает Campaign */
  function ptsOf(a) {
    if ((forced || active()) === 'v2') return a.p2 != null ? a.p2 : rawPoints(a);
    return a.points != null ? a.points : Campaign.attemptPoints(a);
  }

  /* ── пересборка книги v2 из журнала ──
     Возвращает список попыток, у которых изменилось p2 — их нужно записать в хранилище. */
  function rebuild(state, now = Date.now()) {
    const b = v2box(state);
    b.srs = {}; b.seen = {};
    b.campaign = Campaign.create();
    const sh = shim(state);
    sh.campaign = b.campaign;
    const list = (state.attempts || []).slice().sort((x, y) => x.ts - y.ts);
    const changed = [];
    for (const a of list) {
      const at = a.ts || now;
      const p = computePoints(state, a, at);
      if (a.p2 !== p) { a.p2 = p; changed.push(a); }
      if (!a.fixedPts) Campaign.noteUnit(sh, a, at);
      SRS.noteAttempt({ settings: { srs: b.srs }, cards: state.cards, __srs: b.srs }, a, a.endedAt || at);
    }
    withVer('v2', () => {
      Campaign.process(b.campaign, state.attempts, now);
      Campaign.grantChests(b.campaign, state.attempts, now);
      b.campaign.rankPeak = Math.max(b.campaign.rankPeak || 0, Campaign.rankIndex(Campaign.effectiveDays(b.campaign, state.attempts, now)));
    });
    b.builtAt = now;
    b.builtFrom = list.length;
    books(state).v2 = b.campaign;
    return changed;
  }
  const needsRebuild = state => {
    const b = (state.settings || {}).v2;
    return !b || !b.campaign || b.builtFrom == null || b.builtFrom !== (state.attempts || []).length;
  };

  /* ── пополнение книги v2 на каждой попытке ──
     Вызывается всегда, когда книга существует, даже если открыта книга v1.
     Попытка ДОЛЖНА быть уже в state.attempts. */
  /* Состояние дня книги v2 ДО попытки — снимается перед добавлением её в журнал */
  function todaySnapshot(state, now = Date.now()) {
    const b = (state.settings || {}).v2;
    if (!b || !b.campaign) return null;
    return withVer('v2', () => ({ t: Campaign.todayState(b.campaign, state.attempts, now), rank: Campaign.rankIndex(Campaign.effectiveDays(b.campaign, state.attempts, now)) }));
  }
  function noteAttempt(state, a, now = Date.now(), before = null) {
    const b = (state.settings || {}).v2;
    if (!b || !b.campaign) return null;                    /* книги ещё нет — соберётся при переключении */
    const sh = shim(state);
    sh.campaign = b.campaign;
    a.p2 = computePoints(state, a, now);
    if (!a.fixedPts) Campaign.noteUnit(sh, a, now);
    SRS.noteAttempt({ settings: { srs: b.srs }, cards: state.cards, __srs: b.srs }, a, now);
    b.builtFrom = (state.attempts || []).length;
    return withVer('v2', () => {
      const was = before || { t: Campaign.todayState(b.campaign, state.attempts, now), rank: 0 };
      Campaign.process(b.campaign, state.attempts, now);
      const chests = Campaign.grantChests(b.campaign, state.attempts, now);
      const after = Campaign.todayState(b.campaign, state.attempts, now);
      const rank = Campaign.rankIndex(Campaign.effectiveDays(b.campaign, state.attempts, now));
      b.campaign.rankPeak = Math.max(b.campaign.rankPeak || 0, rank);
      books(state).v2 = b.campaign;
      return { before: was.t, after, chests, rankBefore: was.rank, rank };
    });
  }

  /* ── переключение ── */
  function switchTo(state, ver, now = Date.now()) {
    if (!VERS[ver] || active(state) === ver) return null;
    let changed = [];
    if (ver === 'v2' && needsRebuild(state)) changed = rebuild(state, now);
    state.settings.ver = ver;
    state.settings.verAt = now;
    const log = (state.settings.verLog || (state.settings.verLog = []));
    log.push({ at: now, to: ver });
    if (log.length > 50) state.settings.verLog = log.slice(-50);
    state.campaign = campaign(state, ver);
    return changed;
  }
  /* Запуск: книга v1 остаётся на месте, книга v2 чинится при расхождении с журналом */
  function boot(state, now = Date.now()) {
    bind(state);
    const bk = books(state);
    bk.v1 = state.campaign || Campaign.create();
    state.campaignV1 = bk.v1;
    const has2 = state.settings && state.settings.v2 && state.settings.v2.campaign;
    let changed = [];
    if (active(state) === 'v2') {
      if (needsRebuild(state)) changed = rebuild(state, now); else bk.v2 = state.settings.v2.campaign;
      state.campaign = bk.v2;
    } else {
      if (has2) { bk.v2 = state.settings.v2.campaign; if (needsRebuild(state)) changed = rebuild(state, now); }
      state.campaign = bk.v1;
    }
    return changed;
  }
  /* Сводка для настроек: что в какой книге сегодня */
  function summary(state, now = Date.now()) {
    const out = { v1: null, v2: null };
    for (const v of ['v1', 'v2']) {
      const c = v === 'v1' ? (books(state).v1 || state.campaign) : ((state.settings.v2 || {}).campaign);
      if (!c) continue;
      out[v] = withVer(v, () => {
        const days = Campaign.effectiveDays(c, state.attempts, now);
        const t = Campaign.todayState(c, state.attempts, now);
        const srs = srsStore(state, v);
        return { days, rank: Campaign.rankIndex(days) + 1, today: Math.round(t.points), cap: t.cap, done: t.done,
          due: Object.keys(srs).filter(id => srs[id].due && srs[id].due <= now).length,
          words: Object.keys(srs).length, blocks: Object.values(progStore(state)).filter(x => x.seal === 'done' || x.seal === 'gold').length };
      });
    }
    return out;
  }

  return { VERS, FAST_MS, bind, active, is2, withVer, switchTo, boot, rebuild, needsRebuild, noteAttempt, todaySnapshot,
    srsStore, progStore, campaign, shim, ptsOf, rawPoints, computePoints, looksGuessed, summary };
})();
