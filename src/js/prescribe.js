/* Предписание 处方: программа на недели вперёд, собранная на телефоне из собственной истории.

   Шестьдесят блоков лежат плоским списком, и любой из них открыт. Горизонта нет: непонятно,
   что идёт следующим, что ждёт своей очереди и когда это кончится. Модуль выстраивает из них
   очередь этапов, у каждого — одна фраза «почему именно это» и срок диапазоном.

   Закон чистоты: build(state, now) зависит только от состояния и момента. Журнал приводится к
   каноническому порядку (ts, при равном — id), все сортировки имеют полный порядок, ни одного
   производного значения модуль не хранит и в state сам не пишет. Пишет только publish() — и
   только снимок последнего выпуска, который нужен для гистерезиса и экрана «Что изменилось».

   Место в методиках: это часть ТЕСТОВОЙ книги учёта. Показывать экран только при Ledger.is2. */
window.Prescribe = (() => {
  const DAY = 24 * 3600e3;

  /* ── экономика ──
     Дневная норма — 400 очков ≈ 20 минут. На новый материал уходит не весь день: часть съедают
     повторения, звучание и речь, они идут ежедневными линиями. Поэтому этап считаем по 160
     очкам в день, а не по 400. Ставка подобрана так, чтобы слово с нуля до 0.85 мастерства
     стоило около тридцати очков — примерно полторы минуты серьёзной работы. */
  const KNOW = 0.85;          /* мастерство, с которого слово считается взятым */
  const RATE = 36;            /* очков за единицу мастерства одного слова */
  const CHECK = 40;           /* проверка блока: спринт и разбор промахов */
  const GRAM_PTS = 9;         /* очков за одно задание GRAMMAR */
  const GRAM_MAX = 12;        /* сколько заданий по блоку берём в этап */
  const PHON_PTS = 55;        /* очков за один урок звучания */
  const PLAN_RATE = 160;      /* очков в день на новый материал при 20 минутах */
  const MIN_LEG = 2;          /* короче двух дней этап не бывает: нужен хотя бы один ночной перерыв */
  const SLOW = 1.5;           /* верх диапазона сроков: половина сверху */
  const PACE_LEGS = 2;        /* с двух закрытых этапов меряем реальный шаг */
  const PACE_MIN = 40, PACE_MAX = 600;
  const MAX_BLOCKS = 6;       /* блоков в горизонте */
  const MAX_STAGES = 10;      /* этапов всего, вместе с грамматикой и звучанием */
  const HYST = 0.15;          /* перевыпуск: топ-3 должен измениться больше чем на это */

  const WEAK = 0.60;          /* точность ниже — блок просел */
  const WEAK_MIN = 6;         /* столько ответов нужно, чтобы говорить о точности */
  const DUE_SHARE = 0.34;     /* столько слов вернулось в ленту — блок просел */
  const DUE_MIN = 3;
  const READS = 0.30;         /* need не выше — блок уже читается, остаётся проверка */
  const ACC_WIN = 21 * DAY;   /* окно, по которому смотрим точность блока */

  const KINDS = {
    regular: { ru: 'Учить блок', zh: '学' },
    express: { ru: 'Экспресс', zh: '快' },
    repair: { ru: 'Починка', zh: '修' },
    sound: { ru: 'Звучание', zh: '语音' },
    grammar: { ru: 'Грамматика', zh: '语法' },
  };
  const FACTOR_RU = {
    need: 'сколько блока не знаем',
    coreW: 'вес ядра уровня',
    levelFit: 'соответствие рабочему уровню',
    gapBoost: 'белые пятна и тонкие места',
    fireBoost: 'личные ошибки',
    depPen: 'незакрытые зависимости',
  };

  /* ── экспертная таблица зависимостей ──
     Это суждение о грамматике, а не вывод из данных: ребро стоит там, где следующая
     конструкция буквально собирается из предыдущей. Где связь только тематическая, ребра нет —
     лишнее ребро запрёт блок без причины. Ключ — блок, значение — блоки, которые идут раньше. */
  const DEPS = {
    'b1-04': ['b1-03'],           /* время и даты — это счёт: 三点, 五月 */
    'b2-05': ['b1-03'],           /* 两/二 и счётное 件 — продолжение 个 и чисел */
    'b2-06': ['b1-04', 'b1-09'],  /* 正在 и 已经…了 стоят на 了 и на месте времени во фразе */
    'b3-04': ['b1-09'],           /* результативные 完/好/到 — это завершённость, то есть 了 */
    'b2-04': ['b1-06'],           /* 离 меряет расстояние между точками, которые задаёт 有/在…里 */
    'b2-07': ['b1-08'],           /* 从…到… — развёртка 去/来 + место */
    'b3-06': ['b1-08', 'b2-07'],  /* направительные 来/去 при глаголе — тот же 来/去, но при действии */
    'b3-05': ['b2-02'],           /* 比较/更/最 — степени сравнения после самого 比 */
    'b3-09': ['b3-03'],           /* 被 — зеркало 把: та же перестановка дополнения */
    'b3-10': ['b1-02'],           /* 是…的 собирается из связки 是 и 的 */
    'b4-17': ['b2-10'],           /* возможность 得/不 — то же 得, что в оценке действия */
  };

  /* ── мелочи ── */
  const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r2 = v => Math.round(num(v) * 100) / 100;
  const r4 = v => Math.round(num(v) * 10000) / 10000;
  function plur(n, one, few, many) {
    const a = Math.abs(n) % 10, b = Math.abs(n) % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return few;
    return many;
  }
  const words = n => n + ' ' + plur(n, 'слово', 'слова', 'слов');
  const daysRu = n => n + ' ' + plur(n, 'день', 'дня', 'дней');
  const lessonsRu = n => n + ' ' + plur(n, 'урок', 'урока', 'уроков');
  const tasksRu = n => n + ' ' + plur(n, 'задание', 'задания', 'заданий');

  const settingsOf = s => (s && s.settings) || {};
  const sid = a => String((a && a.id) != null ? a.id : '');
  /* канонический порядок журнала: по времени, при равном времени — по id. Полный порядок,
     поэтому перестановка массива попыток ничего не меняет */
  const CMP = (x, y) => (num(x.ts) - num(y.ts)) || (sid(x) < sid(y) ? -1 : sid(x) > sid(y) ? 1 : 0);
  const attemptsOf = (s, now) => ((s && Array.isArray(s.attempts)) ? s.attempts : [])
    .filter(a => a && num(a.ts) <= now).slice().sort(CMP);
  /* повторения берём из открытой книги учёта: у тестовой методики они свои */
  function srsOf(s) {
    const st = settingsOf(s);
    try { if (window.Ledger && Ledger.is2(s)) return (st.v2 || {}).srs || {}; } catch (e) { /* книг нет */ }
    return st.srs || {};
  }
  const blocks = () => ((window.PROGRAM && PROGRAM.BLOCKS) || []);
  const blockById = id => blocks().find(b => b.id === id) || null;

  /* ── словарь: иероглиф → карточка и иероглиф → блок ──
     Кэш привязан к отпечатку банка, а не к первому вызову: подгрузился словарь позже —
     карта пересобирается, и ответ остаётся функцией текущего входа. */
  let wcache = null, wkey = '';
  function bankKey() {
    const live = (window.App && App.cardIndex && typeof App.cardIndex === 'object') ? App.cardIndex : null;
    const n = live ? Object.keys(live).length : [1, 2, 3].reduce((a, l) => a + (((window.HSK || {})[l]) || []).length, 0) + ((window.FREQ || []).length);
    return n + '/' + blocks().length;
  }
  function bank() {
    const key = bankKey();
    if (wcache && wkey === key) return wcache;
    const card = Object.create(null);
    const live = (window.App && App.cardIndex && typeof App.cardIndex === 'object') ? App.cardIndex : null;
    if (live) for (const k of Object.keys(live).sort()) { const c = live[k]; if (c && c.hanzi && !card[c.hanzi]) card[c.hanzi] = c.id; }
    else {
      for (const l of [1, 2, 3]) for (const e of ((window.HSK || {})[l] || [])) if (!card[e[0]]) card[e[0]] = 'hsk' + l + ':' + e[0];
      for (const e of (window.FREQ || [])) if (!card[e[0]]) card[e[0]] = 'freq1:' + e[0];
    }
    const blk = Object.create(null);
    for (const b of blocks()) for (const w of (b.words || [])) if (!blk[w]) blk[w] = b.id;
    wcache = { card, blk }; wkey = key;
    return wcache;
  }

  /* ── мастерство слов: берём сильнейшую полосу узла ── */
  function masteryOf(state, now) {
    const out = Object.create(null);
    let snap = null;
    try { snap = (window.Mastery && Mastery.compute) ? Mastery.compute(state, now) : null; } catch (e) { snap = null; }
    const byId = (snap && snap.nodes && snap.nodes.byId) || {};
    for (const k of Object.keys(byId).sort()) {
      if (k.indexOf('w:') !== 0) continue;
      const bar = k.indexOf('|');
      const h = bar > 2 ? k.slice(2, bar) : k.slice(2);
      const m = num(byId[k].m);
      if (!(h in out) || m > out[h]) out[h] = m;
    }
    return { m: out, level: snap ? (snap.level || 1) : 1 };
  }

  /* ── что уже закрыто: чистый спринт по блоку или печать в программе ── */
  const cleanSprint = a => a.mode === 'sprint' && !a.aborted && (a.wrong === 0 || a.percent === 100);
  const blockOfAttempt = a => a.blockId || a.block || null;
  function closedMap(state, now) {
    const prog = settingsOf(state).program || {};
    const closed = Object.create(null), tried = Object.create(null);
    for (const id of Object.keys(prog).sort()) {
      const seal = prog[id] && prog[id].seal;
      if (seal === 'done' || seal === 'gold') { closed[id] = 'печать блока'; tried[id] = 1; }
    }
    for (const a of attemptsOf(state, now)) {
      const b = blockOfAttempt(a);
      if (!b) continue;
      if (a.mode === 'sprint') tried[b] = 1;
      if (cleanSprint(a)) closed[b] = 'чистый спринт';
    }
    return { closed, tried };
  }

  /* ── точность и просрочка по блоку ── */
  function blockHealth(state, now, wordBlock) {
    const srs = srsOf(state);
    const bk = bank();
    const acc = Object.create(null);   /* blockId → {n, ok} за окно */
    const touch = id => acc[id] || (acc[id] = { n: 0, ok: 0 });
    for (const a of attemptsOf(state, now)) {
      if (a.aborted || now - num(a.ts) > ACC_WIN) continue;
      const qs = (Array.isArray(a.questions) && a.questions.length)
        ? a.questions
        : (Array.isArray(a.words) ? a.words.map(w => ({ hanzi: w, fraction: num(a.percent) >= 80 ? 1 : 0 })) : []);
      for (const q of qs) {
        if (!q) continue;
        const id = q.cardId ? String(q.cardId) : '';
        const h = q.hanzi || (id.indexOf(':') > 0 ? id.slice(id.indexOf(':') + 1) : '');
        const b = wordBlock[h];
        if (!b) continue;
        const t = touch(b);
        t.n++; t.ok += (q.fraction != null ? clamp(num(q.fraction), 0, 1) : (q.ok ? 1 : 0));
      }
    }
    const out = Object.create(null);
    for (const b of blocks()) {
      const a = acc[b.id] || { n: 0, ok: 0 };
      let seen = 0, due = 0;
      for (const w of (b.words || [])) {
        const cid = bk.card[w];
        const r = cid ? srs[cid] : null;
        if (!r) continue;
        seen++;
        if (r.due && r.due <= now) due++;
      }
      out[b.id] = {
        n: a.n, pct: a.n ? Math.round(a.ok / a.n * 100) : null,
        seen, due, dueShare: seen ? due / seen : 0,
      };
    }
    return out;
  }

  /* ── огни: какие блоки задеты личными ошибками ── */
  function fireHanzi(f) {
    const out = [];
    const id = String((f && f.id) || '');
    const m = /^(?:node|hand):(.*)$/.exec(id);
    if (m) { const s = m[1]; out.push(s.indexOf(':') > 0 ? s.slice(s.indexOf(':') + 1) : s); }
    let t = null;
    try { t = (window.TRAPS && typeof TRAPS.byId === 'function') ? TRAPS.byId(id) : null; } catch (e) { t = null; }
    if (t) {
      for (const it of (t.items || [])) if (it && it.hanzi) out.push(it.hanzi);
      for (const w of (t.words || [])) if (typeof w === 'string') out.push(w);
    }
    return out.filter(Boolean);
  }
  function firesByBlock(state, now, wordBlock) {
    const out = Object.create(null);
    let top = [];
    try { top = (window.Fires && Fires.top3) ? Fires.top3(state, now) : []; } catch (e) { top = []; }
    for (const f of top) for (const h of fireHanzi(f)) {
      const b = wordBlock[h];
      if (b && !out[b]) out[b] = f;
    }
    return out;
  }

  /* ── белые пятна: тонкие места промера и, если модуль съёмки есть, её пятна ── */
  function gapBlocks(state, now) {
    const out = Object.create(null);
    try {
      const rows = (window.Gaps && Gaps.thin) ? Gaps.thin(state, now) : [];
      for (const r of rows.slice(0, 5)) if (r && r.kind === 'block' && r.thin > 0) out[r.key] = 'блок среди тонких мест';
    } catch (e) { /* промера нет */ }
    /* съёмка (window.Survey) появляется отдельным модулем; берём её пятна, если она уже есть */
    try {
      const S = window.Survey;
      const raw = S ? (typeof S.blanks === 'function' ? S.blanks(state, now) : (typeof S.white === 'function' ? S.white(state, now) : null)) : null;
      for (const x of (Array.isArray(raw) ? raw : [])) {
        const id = typeof x === 'string' ? x : (x && (x.blockId || x.id));
        if (id && blockById(id)) out[id] = 'белое пятно съёмки';
      }
    } catch (e) { /* съёмки нет */ }
    return out;
  }

  /* ── реальный шаг: очки за день на закрытых этапах ──
     Закрытый этап — блок, доведённый до чистого спринта. Считаем очки попыток по этому блоку
     от первого касания до спринта и календарные дни между ними. Всё из журнала, ничего не храним. */
  function ptsOf(a) {
    try { if (window.Ledger && Ledger.ptsOf) return num(Ledger.ptsOf(a)); } catch (e) { /* книг нет */ }
    if (a.points != null) return num(a.points);
    try { return num(Campaign.attemptPoints(a)); } catch (e) { return 0; }
  }
  function pace(state, now) {
    const by = Object.create(null);
    for (const a of attemptsOf(state, now)) {
      const b = blockOfAttempt(a);
      if (!b) continue;
      (by[b] || (by[b] = [])).push(a);
    }
    let pts = 0, days = 0, legs = 0;
    for (const id of Object.keys(by).sort()) {
      const list = by[id];
      const end = list.find(cleanSprint);
      if (!end) continue;
      const from = num(list[0].ts), to = num(end.ts);
      const span = Math.max(1, Math.round((to - from) / DAY) + 1);
      let p = 0;
      for (const a of list) { if (num(a.ts) <= to) p += ptsOf(a); }
      if (p <= 0) continue;
      legs++; pts += p; days += span;
    }
    const measured = legs >= PACE_LEGS && days > 0;
    const raw = measured ? pts / days : PLAN_RATE;
    return {
      perDay: Math.round(clamp(raw, PACE_MIN, PACE_MAX)),
      measured, legs,
      ru: measured ? 'по вашему шагу' : 'по расчёту, ваш шаг ещё не измерен',
    };
  }

  /* ── звучание: уроки PHON идут до первого блока с аудио ── */
  function soundStage(state) {
    const all = ((window.PHON && PHON.LESSONS) || []);
    if (!all.length) return null;
    const done = settingsOf(state).phon || {};
    const left = all.filter(l => !done[l.id]);
    if (!left.length) return null;
    return {
      id: 'sound', blockId: null, kind: 'sound',
      lessons: left.map(l => l.id),
      ru: 'Звучание 语音 · ' + left[0].ru,
      why: lessonsRu(left.length) + ' из ' + all.length + ' не пройдено — они идут до первого блока',
      cost: Math.round(left.length * PHON_PTS),
      /* вес считаем как у блока: доля непройденного × вес основы. Вперёд звучание ставит
         правило (оно идёт до первого блока), а не раздутый приоритет — иначе им нельзя было бы
         мерить перестановки в выпуске. */
      priority: r4(left.length / all.length * 1.3), f: null, deps: [], blocked: false,
    };
  }

  /* ── этап блока ── */
  function blockStage(b, ctx) {
    const ws = b.words || [];
    if (!ws.length) return null;
    let rest = 0, unknown = 0;
    for (const w of ws) {
      const m = num(ctx.m[w]);
      const gap = Math.max(0, KNOW - m);
      rest += gap;
      if (m < KNOW) unknown++;
    }
    /* сколько блока не знаем по мастерству: доля недобранного до 0.85 */
    const needM = r2(rest / (ws.length * KNOW));
    const h = ctx.health[b.id] || { n: 0, pct: null, seen: 0, due: 0, dueShare: 0 };
    const closed = !!ctx.closed[b.id];
    /* «просел» говорят только о том, что уже проходили: у блока в работе низкая точность —
       это не поломка, а обычная середина пути */
    const done = closed || !!ctx.tried[b.id];
    const weakAcc = done && h.pct != null && h.n >= WEAK_MIN && h.pct < WEAK * 100;
    const backInFeed = done && h.due >= DUE_MIN && h.dueShare >= DUE_SHARE;

    let kind = null;
    if (weakAcc || backInFeed) kind = 'repair';
    else if (closed) kind = null;                         /* закрыт и держится — в горизонт не идёт */
    else if (needM <= READS) kind = 'express';
    else kind = 'regular';
    if (!kind) return null;

    /* потеря: слова вернулись в ленту или точность просела. Блок, чьи слова снова просрочены,
       мы знаем хуже, чем говорит мастерство, — потому потеря складывается с needM, а не заменяет.
       Иначе просевшая основа стояла бы в очереди позади свежих блоков. */
    const lostDue = r2(h.dueShare);
    const lostAcc = (h.pct != null && h.n >= WEAK_MIN) ? r2(Math.max(0, (WEAK * 100 - h.pct) / (WEAK * 100))) : 0;
    const lost = Math.max(lostDue, lostAcc);
    const need = r2(clamp(needM + lost, 0, 1.6));

    /* вес ядра: первые блоки уровня несут его основу, хвост можно догнать позже */
    const sameLvl = blocks().filter(x => x.lvl === b.lvl);
    const i = sameLvl.findIndex(x => x.id === b.id);
    const coreW = r2(1.3 - 0.5 * (sameLvl.length > 1 ? i / (sameLvl.length - 1) : 0));
    const d = b.lvl - ctx.level;
    const levelFit = d < 0 ? 1.3 : d === 0 ? 1 : d === 1 ? 0.5 : 0;
    const gapRu = ctx.gaps[b.id] || null;
    const gapBoost = gapRu ? 1.35 : 1;
    const fire = ctx.fires[b.id] || null;
    const fireBoost = fire ? 1.5 : 1;
    const parents = DEPS[b.id] || [];
    const open = parents.filter(p => !ctx.closed[p]);
    const depPen = open.length ? 0.7 : 1;
    const f = { need, coreW, levelFit, gapBoost, fireBoost, depPen };
    const priority = r4(need * coreW * levelFit * gapBoost * fireBoost * depPen);

    const cost = Math.round(rest * RATE + CHECK);
    const why = [];
    if (kind === 'repair') {
      if (weakAcc) why.push('точность ' + h.pct + '% на ' + h.n + ' ' + plur(h.n, 'ответе', 'ответах', 'ответах') + ' за три недели');
      if (backInFeed) why.push(words(h.due) + ' из ' + h.seen + ' вернулись в ленту');
    } else if (kind === 'express') {
      /* считаем не «взятые слова», а насколько блок разобран: у экспресса слова стоят у самого
         порога, и счёт «0 из 12 взято» сказал бы неправду о том, что видно в ленте */
      why.push('блок уже читается: разобран на ' + Math.round((1 - needM) * 100) + '% — остаётся проверка');
    } else {
      why.push(words(unknown) + ' из ' + ws.length + ' ещё не взяты');
    }
    if (levelFit === 1.3) why.push('уровень ' + b.lvl + ' ниже рабочего — догоняем основу');
    else if (levelFit === 0.5) why.push('уровень ' + b.lvl + ' выше рабочего — идёт после своего');
    if (gapRu) why.push(gapRu);
    if (fire) why.push('в блоке горит: ' + (fire.ru || fire.id));
    if (open.length) why.push('раньше идёт ' + open.map(p => { const x = blockById(p); return x ? '«' + x.ru + '»' : p; }).join(', '));

    return {
      id: b.id, blockId: b.id, kind,
      ru: KINDS[kind].ru + ' · «' + b.ru + '» ' + b.zh,
      why: why.join('; '),
      cost, priority, f,
      parents, deps: open, blocked: open.length > 0,
      need, needM, lost, unknown, total: ws.length,
    };
  }

  /* ── этап грамматики блока ── */
  function gramStage(b, parent, ctx) {
    let items = [];
    try { items = (window.GRAMMAR && GRAMMAR.forBlock) ? GRAMMAR.forBlock(b.id) : []; } catch (e) { items = []; }
    if (!items.length) return null;
    const n = Math.min(items.length, GRAM_MAX);
    const done = ctx.gramDone[b.id] || 0;
    if (done >= n) return null;                          /* разбор уже проходили */
    return {
      id: 'g:' + b.id, blockId: b.id, kind: 'grammar',
      ru: KINDS.grammar.ru + ' · ' + (b.g ? b.g.t : b.ru),
      why: tasksRu(n) + ' по блоку' + (done ? ', пройдено ' + done : ', разбор ещё не проходили'),
      cost: Math.round((n - done) * GRAM_PTS),
      priority: r4(parent.priority * 0.6), f: null,
      parents: [b.id], deps: [], blocked: false,
    };
  }
  function gramDoneMap(state, now) {
    const out = Object.create(null);
    for (const a of attemptsOf(state, now)) {
      if (a.mode !== 'gram') continue;
      const b = blockOfAttempt(a);
      if (!b) continue;
      out[b] = (out[b] || 0) + (num(a.correct) || num(a.total) || 0);
    }
    return out;
  }

  /* ── ежедневные линии: они идут параллельно этапам и съедают часть дня ── */
  function lines(state, now) {
    const out = [];
    const srs = srsOf(state);
    const ids = Object.keys(srs).sort();
    const due = ids.filter(id => srs[id] && srs[id].due && srs[id].due <= now);
    const week = ids.filter(id => srs[id] && srs[id].due && srs[id].due > now && srs[id].due <= now + 7 * DAY);
    out.push({
      t: 'review', ru: 'Повторения 复习',
      why: due.length
        ? words(due.length) + ' ' + plur(due.length, 'просрочено', 'просрочены', 'просрочены') + ', ещё ' + week.length + ' подойдёт за неделю'
        : (ids.length ? 'просроченного нет, ' + words(week.length) + ' подойдёт за неделю' : 'слов в обороте пока нет'),
    });
    const all = ((window.PHON && PHON.LESSONS) || []);
    const done = settingsOf(state).phon || {};
    const left = all.filter(l => !done[l.id]).length;
    out.push({
      t: 'sound', ru: 'Звучание 语音',
      why: left ? lessonsRu(left) + ' из ' + all.length + ' не пройдено' : 'все ' + lessonsRu(all.length) + ' пройдены — держим на слух',
    });
    let last = 0;
    for (const a of attemptsOf(state, now)) if (a.mode === 'boss' || a.mode === 'speak') last = Math.max(last, num(a.ts));
    const ago = last ? Math.floor((now - last) / DAY) : null;
    out.push({
      t: 'speak', ru: 'Речь 说',
      why: ago == null ? 'вслух ещё не работали' : (ago <= 0 ? 'вслух работали сегодня' : 'вслух не работали ' + daysRu(ago)),
    });
    return out;
  }

  /* ── сборка ── */
  function build(state, now = Date.now()) {
    if (typeof now !== 'number' || !isFinite(now)) now = Date.now();
    const st = state || {};
    const bk = bank();
    const mast = masteryOf(st, now);
    const cl = closedMap(st, now);
    const ctx = {
      m: mast.m, level: mast.level,
      closed: cl.closed, tried: cl.tried,
      health: blockHealth(st, now, bk.blk),
      fires: firesByBlock(st, now, bk.blk),
      gaps: gapBlocks(st, now),
      gramDone: gramDoneMap(st, now),
    };

    /* кандидаты: у каждого своя цена и свой приоритет */
    const cand = [];
    for (const b of blocks()) {
      const s = blockStage(b, ctx);
      if (s && s.priority > 0) cand.push(s);
    }
    /* полный порядок: по приоритету, при равном — по цене, затем по id */
    cand.sort((x, y) => y.priority - x.priority || x.cost - y.cost || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    /* Начатое закрывают раньше, чем начинают новое. Экспресс — блок, который уже читается:
       его цена это одна проверка, а она снимает предположение «наверное, знаю» и закрывает блок.
       По приоритету такой блок всегда внизу (не знаем-то мало), поэтому его вперёд ставит правило,
       а не подкрученное need. Больше двух подряд не выносим: программа не должна стать хвостом. */
    const exp = cand.filter(c => c.kind === 'express');
    const pool = [...exp.slice(0, 2), ...cand.filter(c => exp.slice(0, 2).indexOf(c) < 0)];

    /* выбор с оглядкой на зависимости: предшественник либо закрыт, либо уже поставлен раньше */
    const picked = [], placed = Object.create(null);
    while (picked.length < MAX_BLOCKS) {
      let i = -1;
      for (let k = 0; k < pool.length; k++) {
        const c = pool[k];
        if (c.taken) continue;
        if (c.parents.every(p => ctx.closed[p] || placed[p])) { i = k; break; }
      }
      if (i < 0) break;
      const c = pool[i];
      c.taken = true; placed[c.blockId] = 1; picked.push(c);
    }

    const stages = [];
    const snd = soundStage(st);
    if (snd) stages.push(snd);
    for (const c of picked) {
      const b = blockById(c.blockId);
      delete c.taken;
      stages.push(c);
      const g = b ? gramStage(b, c, ctx) : null;
      if (g) stages.push(g);
    }
    const cut = stages.slice(0, MAX_STAGES);

    /* сроки: диапазоном, потому что шаг у всех разный */
    const p = pace(st, now);
    let lo = 0, hi = 0;
    for (const s of cut) {
      s.days = Math.max(MIN_LEG, Math.ceil(s.cost / p.perDay));
      lo += s.days;
      hi += Math.max(s.days + 1, Math.ceil(s.days * SLOW));
      s.from = lo; s.to = hi;
      s.when = 'дни ' + s.from + '–' + s.to + ' · ' + p.ru;
    }
    const horizon = {
      from: lo, to: hi,
      weeks: { from: Math.max(1, Math.ceil(lo / 7)), to: Math.max(1, Math.ceil(hi / 7)) },
      ru: cut.length
        ? 'примерно ' + Math.max(1, Math.ceil(lo / 7)) + '–' + Math.max(1, Math.ceil(hi / 7)) + ' ' + plur(Math.max(1, Math.ceil(hi / 7)), 'неделя', 'недели', 'недель') + ' · ' + p.ru
        : 'горизонт пуст: в программе не осталось открытых блоков',
      note: p.ru,
    };
    return { at: now, level: mast.level, stages: cut, lines: lines(st, now), horizon, pace: p };
  }

  /* ── что изменилось между выпусками ── */
  const listOf = r => ((r && Array.isArray(r.stages)) ? r.stages : []);
  function indexOfList(list) {
    const m = Object.create(null);
    list.forEach((s, i) => { m[s.id] = { s, i }; });
    return m;
  }
  function factorWhy(a, b) {
    const fa = (a && a.f) || null, fb = (b && b.f) || null;
    if (!fa || !fb) return null;
    let key = null, d = 0;
    for (const k of Object.keys(FACTOR_RU)) {
      const v = Math.abs(num(fb[k]) - num(fa[k]));
      if (v > d + 1e-9) { d = v; key = k; }
    }
    if (!key || d < 0.01) return null;
    const up = num(fb[key]) > num(fa[key]);
    return FACTOR_RU[key] + ': ' + r2(fa[key]) + ' → ' + r2(fb[key]) + (up ? ' (выросло)' : ' (упало)');
  }
  function diff(prev, next) {
    const A = listOf(prev), B = listOf(next);
    const ai = indexOfList(A), bi = indexOfList(B);
    const out = [];
    for (const s of B) {
      const a = ai[s.id];
      if (!a) { out.push({ sign: '+', id: s.id, ru: 'Появился: ' + s.ru, why: s.why || 'этап вошёл в горизонт' }); continue; }
      const moved = a.i - bi[s.id].i;
      const fw = factorWhy(a.s, s);
      if (moved > 0) out.push({ sign: '↑', id: s.id, ru: 'Выше: ' + s.ru + ' (был ' + (a.i + 1) + ', стал ' + (bi[s.id].i + 1) + ')', why: fw || s.why || 'освободилось место впереди' });
      else if (moved < 0) out.push({ sign: '↓', id: s.id, ru: 'Ниже: ' + s.ru + ' (был ' + (a.i + 1) + ', стал ' + (bi[s.id].i + 1) + ')', why: fw || s.why || 'вперёд встало более срочное' });
      else if (a.s.kind !== s.kind) out.push({ sign: '=', id: s.id, ru: 'Сменился вид: ' + (KINDS[a.s.kind] ? KINDS[a.s.kind].ru : a.s.kind) + ' → ' + (KINDS[s.kind] ? KINDS[s.kind].ru : s.kind), why: s.why || 'вид этапа пересчитан' });
      else if (num(a.s.days) !== num(s.days)) out.push({ sign: '=', id: s.id, ru: 'Срок: ' + s.ru + ', ' + daysRu(num(a.s.days)) + ' → ' + daysRu(num(s.days)), why: fw || 'цена этапа пересчитана: ' + num(a.s.cost) + ' → ' + num(s.cost) + ' очков' });
    }
    for (const s of A) {
      if (bi[s.id]) continue;
      out.push({ sign: '−', id: s.id, ru: 'Ушёл: ' + s.ru, why: 'блока нет в новом выпуске: закрыт или вытеснен более срочным' });
    }
    return out;
  }

  /* ── перевыпуск: считаем каждый раз, публикуем редко ──
     Топ-3 сравниваем не по местам, а по весу: перестановка двух почти равных этапов
     программу не меняет, а вот новый огонь или просевший блок — меняет. */
  /* Доли веса внутри топ-3: мера не зависит от общего масштаба приоритетов, поэтому
     перестановка двух почти равных этапов даёт почти ноль, а замена этапа в тройке — много. */
  function shares(rel) {
    const top = listOf(rel).slice(0, 3);
    const sum = top.reduce((a, s) => a + Math.max(0, num(s.priority)), 0) || 1;
    const m = Object.create(null);
    for (const s of top) m[s.id] = Math.max(0, num(s.priority)) / sum;
    return m;
  }
  function drift(prev, next) {
    const A = listOf(prev), B = listOf(next);
    if (!A.length) return { v: 1, publish: true, ru: 'первый выпуск программы', id: null };
    if (!B.length) return { v: 1, publish: true, ru: 'горизонт опустел', id: null };
    const a = shares(prev), b = shares(next);
    const top = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    let v = 0, id = null, worst = 0;
    for (const k of top) {
      const d = Math.abs((a[k] || 0) - (b[k] || 0));
      v += d;
      if (d > worst) { worst = d; id = k; }
    }
    v = r2(v / 2);
    const pct = Math.round(v * 100);
    return {
      v, id, publish: v > HYST,
      ru: v > HYST
        ? 'топ-3 изменился на ' + pct + '% — больше порога ' + Math.round(HYST * 100) + '%'
        : 'топ-3 изменился на ' + pct + '% — меньше порога ' + Math.round(HYST * 100) + '%, программа остаётся прежней',
    };
  }
  function snapshot(built, now) {
    return {
      at: now,
      pace: built.pace, horizon: built.horizon,
      stages: listOf(built).map(s => ({
        id: s.id, blockId: s.blockId, kind: s.kind, ru: s.ru, why: s.why,
        cost: s.cost, days: s.days, from: s.from, to: s.to,
        priority: s.priority, f: s.f ? { ...s.f } : null,
      })),
    };
  }
  const routeOf = state => ((settingsOf(state).v2 || {}).route || null);
  function publish(state, built, now = Date.now()) {
    const prev = routeOf(state);
    const d = drift(prev, built);
    const changes = diff(prev, built);
    if (!d.publish) return { publish: false, drift: d.v, why: d.ru, changes, route: prev };
    const s = state.settings || (state.settings = {});
    const box = s.v2 || (s.v2 = { srs: {}, program: {}, seen: {}, campaign: null, builtFrom: null });
    box.route = snapshot(built, now);
    return { publish: true, drift: d.v, why: d.ru, changes, route: box.route };
  }

  return {
    KINDS, DEPS, FACTOR_RU, KNOW, RATE, CHECK, PLAN_RATE, MIN_LEG, MAX_BLOCKS, MAX_STAGES, HYST,
    build, diff, publish, drift, snapshot, route: routeOf, pace,
  };
})();
