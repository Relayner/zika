/* Мастерство v2: честная оценка «сколько у вас от HSK 1/2/3/4».
   Всё считается заново из state.attempts (+ settings.program/phon как отметки «лента открыта / урок прочитан»).
   Модуль ничего не пишет в state и не зависит от порядка вызовов: одинаковый вход — одинаковый выход. */
window.Mastery = (() => {
  const DAY = 864e5;
  const WINDOW = 24;            /* сколько последних ответов узла смотрим */
  const DECAY = 0.92;           /* вес i-го с конца ответа */
  const W_CHANCE = 1;           /* «ответ наугад» в запасе: одна удачная попытка не даёт 100% */
  const FEED_W = 0.5;           /* вес отметки «прочитано» в точности */
  const MIN_SPRINT = 10;        /* столько слов ленты нужно для проверки — как в программе */
  const KNOWN = 0.8;            /* с какого m узел считаем освоенным */
  const CONFIRM = 70;           /* lo, при котором уровень подтверждается */
  const CONFIRM_DAYS = 3;       /* сколько календарных дней он должен держаться */

  /* Полосы узла: карточка слова × вид работы */
  const BANDS = { read: '读', listen: '听', write: '写', hand: '手' };
  const BAND_RU = { '读': 'иероглиф→смысл', '听': 'на слух', '写': 'набор иероглифа', '手': 'от руки' };

  /* Потолок по виду проверки: выше него узел не поднимется, сколько ни отвечай */
  const CAPS = {
    feed: 0.30,     /* лента блока пролистана / урок прочитан */
    flip: 0.40,     /* самопроверка «знал» */
    choice: 0.60,   /* узнавание из вариантов */
    input: 0.80,    /* набор, письмо от руки, ответ голосом */
    sprint: 0.90,   /* чистый спринт блока */
    exam: 1.00,     /* настоящий экзамен HSK */
  };
  const KIND_RU = {
    feed: 'лента/урок', flip: 'самопроверка', choice: 'выбор из вариантов',
    input: 'набор', sprint: 'спринт', exam: 'экзамен HSK',
  };
  const SAME_DAY_CAP = 0.60;    /* ответ в день знакомства с материалом */
  const SAME_DAY_W = 0.5;
  const HALF = { guess: 30, pair: 60, check: 120 };   /* период полураспада свежести, дни */
  const W = { vocab: 0.65, blocks: 0.20, sound: 0.15 };
  const MON = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

  /* ── мелочи ── */
  const pad = n => String(n).padStart(2, '0');
  const dayKey = ts => { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const dateRu = ts => { const d = new Date(ts); return d.getDate() + ' ' + MON[d.getMonth()]; };
  const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const startOfDay = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const settings = s => (s && s.settings) || {};
  const attemptsOf = s => (s && Array.isArray(s.attempts) ? s.attempts : []);

  /* ── словарь уровней: слово приписано к уровню, где оно встречается впервые ──
     Кэш привязан к самим источникам, а не к первому вызову: если PROGRAM/HSK подгрузились
     позже мастерства, словарь пересобирается. Иначе ответ зависел бы от порядка загрузки. */
  let VOCAB = null, SRC_P = null, SRC_H = null;
  function vocab() {
    const P = window.PROGRAM, H = window.HSK;
    const bl = (P && P.BLOCKS) || null;
    if (VOCAB && SRC_P === bl && SRC_H === (H || null)) return VOCAB;
    const lvl = {};
    const put = (h, l) => { if (h && (lvl[h] == null || l < lvl[h])) lvl[h] = l; };
    if (bl) for (const b of bl) for (const w of (b && b.words) || []) put(w, b.lvl);
    if (H) for (const l of [1, 2, 3]) for (const e of H[l] || []) put(e[0], l);
    const byLevel = { 1: [], 2: [], 3: [], 4: [] };
    /* порядок слов фиксирован сортировкой: суммы не зависят от порядка разбора истории */
    for (const h of Object.keys(lvl).sort()) if (byLevel[lvl[h]]) byLevel[lvl[h]].push(h);
    VOCAB = { lvl, byLevel }; SRC_P = bl; SRC_H = H || null;
    return VOCAB;
  }
  const blocksOf = l => ((window.PROGRAM && window.PROGRAM.BLOCKS) || []).filter(b => b.lvl === l);
  const lessons = () => (window.PHON && window.PHON.LESSONS) || [];

  /* ── разбор попытки ── */
  const hanziOf = q => {
    if (!q) return '';
    const id = q.cardId ? String(q.cardId) : '';
    const fromId = id.indexOf(':') > 0 ? id.slice(id.indexOf(':') + 1) : '';
    const h = fromId || q.hanzi || '';
    return vocab().lvl[h] != null ? h : '';   /* в узлы попадают только слова программы/HSK */
  };
  /* Какая полоса: слух, набор, от руки или чтение */
  function bandOf(a, q) {
    q = q || {};
    if (a.mode === 'hand') return BANDS.hand;
    if (a.mode === 'listen' || a.mode === 'phon' || q.show === 'audio' || q.sec === 'listening') return BANDS.listen;
    if (a.mode === 'write' || q.sec === 'writing') return BANDS.write;
    return BANDS.read;
  }
  /* Вид проверки — от него и потолок */
  function kindOf(a, q) {
    q = q || {};
    if (a.mode === 'hsk' && a.format === 'real') return 'exam';
    if (a.mode === 'hand' || a.mode === 'write' || a.mode === 'boss') return 'input';
    if (a.mode === 'flip' || a.difficulty === 'flip') return 'flip';
    const ans = q.answer || {};
    if (ans.input != null && String(ans.input) !== '') return 'input';
    if (ans.self != null) return 'flip';
    if (ans.choice != null || ans.choiceText != null || ans.given != null) return 'choice';
    if (a.difficulty === 'hard') return 'input';
    return 'choice';
  }
  /* Вероятность угадать: 1/число вариантов, для набора — ноль */
  function chanceOf(a, q, kind) {
    if (kind === 'input' || kind === 'flip' || kind === 'feed') return 0;
    const ex = q && q.ex;
    if (ex && Array.isArray(ex.opts) && ex.opts.length) return 1 / ex.opts.length;
    if (a.difficulty === 'medium') return 1 / 8;
    return 1 / 4;
  }
  const fracOf = q => (typeof q.fraction === 'number' && isFinite(q.fraction) ? clamp(q.fraction, 0, 1) : (q.ok ? 1 : 0));
  const cleanSprint = a => a.mode === 'sprint' && !a.aborted && (a.wrong === 0 || a.percent === 100);
  const blockIdOf = a => a.blockId || a.block || null;

  /* ── дни знакомства с материалом (для правила «тот же день») ── */
  function markDays(v) {
    const out = [];
    const push = x => { if (x == null) return; const t = typeof x === 'number' ? x : Date.parse(x); if (isFinite(t)) out.push(dayKey(t)); else if (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)) out.push(x); };
    if (!v || v === true) return out;
    if (Array.isArray(v.days)) v.days.forEach(push);
    push(v.openedAt); push(v.at); push(v.ts); push(v.readAt);
    return out;
  }

  /* ── сбор свидетельств: node → [ev] ── */
  function evidence(state, now) {
    const V = vocab();
    const st = settings(state);
    const prog = st.program || {}, phon = st.phon || {};
    const map = Object.create(null);
    const add = e => { (map[e.node] || (map[e.node] = [])).push(e); };

    /* отметки «лента открыта / урок прочитан» — это предположение, не проверка */
    const wordDays = Object.create(null);   /* слово → дни, когда его подавали в ленте */
    for (const [bid, v] of Object.entries(prog)) {
      const days = markDays(v);
      const seen = (v && Array.isArray(v.seen)) ? v.seen : [];
      const ts = num(v && (v.openedAt || v.at || v.ts));
      add({ node: 'b:' + bid, kind: 'feed', feed: true, frac: 1, ts, chance: 0, sameDay: false, check: false });
      for (const h of seen) {
        if (V.lvl[h] == null) continue;
        for (const d of days) (wordDays[h] || (wordDays[h] = [])).push(d);
        add({ node: 'w:' + h + '|' + BANDS.read, kind: 'feed', feed: true, frac: 1, ts, chance: 0, sameDay: false, check: false });
      }
    }
    const lessonDays = Object.create(null);
    for (const [lid, v] of Object.entries(phon)) {
      if (!v) continue;
      lessonDays[lid] = markDays(v);
      add({ node: 'p:' + lid, kind: 'feed', feed: true, frac: 1, ts: num(v && (v.at || v.ts)), chance: 0, sameDay: false, check: false });
    }
    const sameDayWord = (h, d) => (wordDays[h] || []).indexOf(d) >= 0;

    /* ответы */
    const attempts = attemptsOf(state).filter(a => a && num(a.ts) <= now)
      .slice().sort((x, y) => (x.ts - y.ts) || String(x.id).localeCompare(String(y.id)));
    for (const a of attempts) {
      const ts = num(a.ts), d = dayKey(ts);
      const qs = Array.isArray(a.questions) ? a.questions : [];
      /* настоящий экзамен HSK свидетельствует об уровне целиком — так устроен сам экзамен */
      if (a.mode === 'hsk' && a.format === 'real' && V.byLevel[a.level]) {
        const secs = a.sections || null;
        const val = (k, band) => {
          const v = secs && secs[k];
          const frac = v && v.total ? v.correct / v.total : num(a.percent) / 100;
          for (const h of V.byLevel[a.level]) add({ node: 'w:' + h + '|' + band, kind: 'exam', feed: false, frac: clamp(frac, 0, 1), ts, chance: 1 / 4, sameDay: sameDayWord(h, d), check: true });
        };
        val('listening', BANDS.listen);
        val('reading', BANDS.read);
        if (secs && secs.writing) val('writing', BANDS.write);   /* 书写 есть только в HSK 3/4 */
        continue;
      }
      /* спринт блока: вопросов в попытке нет, есть список слов */
      if (a.mode === 'sprint') {
        const clean = cleanSprint(a);
        const bid = blockIdOf(a);
        if (bid) add({ node: 'b:' + bid, kind: clean ? 'sprint' : 'choice', feed: false, frac: num(a.percent) / 100, ts, chance: 1 / 4, sameDay: false, check: true });
        for (const h of (a.words || [])) {
          if (V.lvl[h] == null) continue;
          add({ node: 'w:' + h + '|' + BANDS.read, kind: clean ? 'sprint' : 'choice', feed: false, frac: clamp(num(a.percent) / 100, 0, 1), ts, chance: 1 / 4, sameDay: sameDayWord(h, d), check: true });
        }
        continue;
      }
      /* дриллы звучания: узел — урок, а не слово */
      if (a.mode === 'phon') {
        const lid = lessonIdOf(a);
        if (lid) add({ node: 'p:' + lid, kind: 'choice', feed: false, frac: clamp(num(a.percent) / 100, 0, 1), ts, chance: 1 / 4, sameDay: (lessonDays[lid] || []).indexOf(d) >= 0, check: false });
        continue;
      }
      for (const q of qs) {
        const h = hanziOf(q);
        if (!h) continue;   /* вопрос без карточки или не из программы — не узел */
        const kind = kindOf(a, q);
        add({
          node: 'w:' + h + '|' + bandOf(a, q), kind, feed: false, frac: fracOf(q), ts,
          chance: chanceOf(a, q, kind), sameDay: sameDayWord(h, d), check: false,
        });
      }
      /* слова, зачтённые попыткой целиком (письмо от руки) */
      if (a.mode === 'hand' && !qs.length) for (const h of (a.words || [])) {
        if (V.lvl[h] == null) continue;
        add({ node: 'w:' + h + '|' + BANDS.hand, kind: 'input', feed: false, frac: 1, ts, chance: 0, sameDay: sameDayWord(h, d), check: false });
      }
    }

    /* повторение по сроку: ответ, отделённый от прошлого по тому же узлу хотя бы сутками */
    for (const list of Object.values(map)) {
      list.sort(byTs);
      let prev = 0;
      for (const e of list) {
        if (e.feed) continue;
        if (prev && e.ts - prev >= DAY) e.check = true;
        prev = e.ts;
      }
    }
    return map;
  }
  /* Урок звучания по попытке: дрилл знает свой вид, теория — только по названию */
  function lessonIdOf(a) {
    const ls = lessons();
    if (!ls.length) return null;
    const byDrill = ls.find(l => l.drill && l.drill === a.difficulty);
    if (byDrill) return byDrill.id;
    const name = String(a.deckName || '');
    const byName = ls.find(l => l.ru && name.indexOf(l.ru) >= 0);
    return byName ? byName.id : null;
  }

  /* Полный порядок на свидетельствах: одинаковый вход даёт одинаковый расчёт при любом порядке разбора */
  const byTs = (x, y) => (x.ts - y.ts) || (x.feed === y.feed ? 0 : x.feed ? -1 : 1)
    || String(x.kind).localeCompare(String(y.kind)) || (x.frac - y.frac) || (x.chance - y.chance)
    || ((x.sameDay ? 1 : 0) - (y.sameDay ? 1 : 0));

  /* ── оценка одного узла ── */
  function score(evs, now, only) {
    const use = only ? evs.filter(only) : evs;
    const feed = use.some(e => e.feed);
    const ans = use.filter(e => !e.feed).slice().sort((x, y) => -byTs(x, y)).slice(0, WINDOW);
    let sw = 0, sf = 0, sc = 0;
    ans.forEach((e, i) => {
      const w = Math.pow(DECAY, i) * (e.sameDay ? SAME_DAY_W : 1);
      sw += w; sf += w * e.frac; sc += w * e.chance;
    });
    const chance = sw ? sc / sw : 0;
    const fw = feed ? FEED_W : 0;
    const P = (sf + fw + W_CHANCE * chance) / (sw + fw + W_CHANCE);
    /* потолок: вторая по силе проверка — одиночного свидетельства мало, чтобы поднять планку */
    const caps = ans.map(e => Math.min(CAPS[e.kind] != null ? CAPS[e.kind] : CAPS.choice, e.sameDay ? SAME_DAY_CAP : 1)).sort((a, b) => b - a);
    const Cans = caps.length >= 2 ? caps[1] : caps.length === 1 ? caps[0] : 0;
    const C = feed ? Math.max(Cans, CAPS.feed) : Cans;
    const m = clamp(Math.min(P, C), 0, 1);
    /* нижнюю границу считаем без отметки «прочитано»: предположение не вправе её поднимать.
       Plo ≤ P и Cans ≤ C, поэтому mlo ≤ m всегда. */
    const mlo = clamp(Math.min((sf + W_CHANCE * chance) / (sw + W_CHANCE), Cans), 0, 1);
    const n = ans.length;
    const hasCheck = ans.some(e => e.check);
    const last = use.reduce((t, e) => Math.max(t, num(e.ts)), 0);
    const H = hasCheck ? HALF.check : n >= 2 ? HALF.pair : HALF.guess;
    const F = last ? Math.max(0.5, Math.pow(0.5, Math.max(0, now - last) / DAY / H)) : 0.5;
    /* нижняя граница — только по проверкам; верхняя — предположения как 0.85 */
    const lo = n === 0 ? 0 : n === 1 ? Math.min(mlo, 0.50) : n === 2 ? Math.min(mlo, 0.60) : mlo;
    const hi = n === 0 ? (feed ? 0.85 : 0) : m;   /* верх растягивают только непроверенные предположения */
    return { m, lo, hi, P, C, F, n, feed, hasCheck, last, cap: caps[0] || (feed ? CAPS.feed : 0) };
  }
  const EMPTY = { m: 0, lo: 0, hi: 0, P: 0, C: 0, F: 0.5, n: 0, feed: false, hasCheck: false, last: 0, cap: 0 };
  const onlyChecks = e => !e.feed && e.check;

  /* ── свод по уровню ── */
  function levelStats(map, now, l) {
    const V = vocab();
    const words = V.byLevel[l] || [];
    const bl = blocksOf(l);
    const les = l === 1 ? lessons() : [];
    const at = id => map[id] || null;
    const sc = (id, only) => { const e = at(id); return e ? score(e, now, only) : EMPTY; };

    /* слово — по сильнейшей полосе: полосы это разные способы показать одно знание */
    const wordRow = (h, only) => {
      let best = EMPTY, freshW = 0, freshS = 0;
      for (const b of Object.keys(BANDS).map(k => BANDS[k])) {
        const s = sc('w:' + h + '|' + b, only);
        if (s.m > best.m || (s.m === best.m && s.n > best.n)) best = s;
        if (s.n || s.feed) { freshW += 1; freshS += s.F; }
      }
      return { s: best, freshW, freshS };
    };
    let vm = 0, vlo = 0, vhi = 0, vck = 0, known = 0, partial = 0, unseen = 0, fw = 0, fs = 0;
    for (const h of words) {
      const r = wordRow(h, null), c = wordRow(h, onlyChecks);
      vm += r.s.m; vlo += r.s.lo; vhi += r.s.hi;
      vck += Math.min(c.s.m, r.s.m);   /* «по проверкам» не может быть выше общей оценки */
      if (r.s.m >= KNOWN) known++; else if (r.s.m > 0) partial++; else unseen++;
      fw += r.freshW; fs += r.freshS;
    }
    const nW = words.length;

    /* блоки: доля блоков с чистым спринтом; непройденный, но прочитанный — только в верхнюю границу */
    let bm = 0, bhi = 0;
    for (const b of bl) {
      const s = sc('b:' + b.id, null);
      const clean = hasClean(map, b.id);
      bm += clean ? 1 : 0;
      bhi += clean ? 1 : (s.feed ? 0.85 : 0);
    }
    const nB = bl.length;

    /* звучание/слух: полоса 听 по словам уровня + уроки звучания (ступень 0 — только к первому уровню) */
    let sm = 0, slo = 0, shi = 0, sck = 0, nS = 0;
    for (const h of words) {
      const s = sc('w:' + h + '|' + BANDS.listen, null), c = sc('w:' + h + '|' + BANDS.listen, onlyChecks);
      sm += s.m; slo += s.lo; shi += s.hi; sck += Math.min(c.m, s.m); nS++;
    }
    for (const l2 of les) {
      const s = sc('p:' + l2.id, null), c = sc('p:' + l2.id, onlyChecks);
      sm += s.m; slo += s.lo; shi += s.hi; sck += Math.min(c.m, s.m); nS++;
      if (s.n || s.feed) { fw += 1; fs += s.F; }
    }

    const parts = [];
    if (nW) parts.push({ w: W.vocab, m: vm / nW, lo: vlo / nW, hi: vhi / nW, ck: vck / nW });
    if (nB) parts.push({ w: W.blocks, m: bm / nB, lo: bm / nB, hi: bhi / nB, ck: bm / nB });
    if (nS) parts.push({ w: W.sound, m: sm / nS, lo: slo / nS, hi: shi / nS, ck: sck / nS });
    const tot = parts.reduce((a, p) => a + p.w, 0);
    const mix = k => (tot ? parts.reduce((a, p) => a + p.w * p[k], 0) / tot : 0);
    const pct = round1(mix('m') * 100), lo = round1(mix('lo') * 100), hi = round1(mix('hi') * 100);
    const byChecks = Math.min(round1(mix('ck') * 100), pct);
    return {
      pct, lo: Math.min(lo, pct), hi: Math.max(hi, pct), byChecks, byStudy: round1(pct - byChecks),
      vocab: nW ? round1(vm / nW * 100) : 0,
      blocks: nB ? round1(bm / nB * 100) : 0,
      sound: nS ? round1(sm / nS * 100) : 0,
      fresh: fw ? round3(fs / fw) : 1,   /* нечему стареть — свежесть полная */
      nodes: { known, partial, unseen },
    };
  }
  const round1 = v => Math.round(clamp(num(v), 0, 100) * 10) / 10;
  function hasClean(map, bid) {
    const list = map['b:' + bid] || [];
    return list.some(e => e.kind === 'sprint');
  }

  /* ── снимок на момент времени ── */
  function snapshot(state, now) {
    const map = evidence(state, now);
    const levels = {};
    for (const l of [1, 2, 3, 4]) levels[l] = levelStats(map, now, l);
    const byId = {};
    let known = 0, partial = 0, unseen = 0;
    for (const id of Object.keys(map).sort()) {
      const s = score(map[id], now, null), c = score(map[id], now, onlyChecks);
      byId[id] = {
        m: round3(s.m), lo: round3(s.lo), hi: round3(s.hi), ck: round3(Math.min(c.m, s.m)),
        P: round3(s.P), C: round3(s.C), F: round3(s.F), n: s.n, checks: c.n, read: s.feed, check: s.hasCheck,
      };
      if (s.m >= KNOWN) known++; else if (s.m > 0) partial++; else unseen++;
    }
    let level = 1;
    for (const l of [2, 3, 4]) if (levels[l].pct >= 50) level = l;
    return { levels, level, nodes: { known, partial, unseen, total: known + partial + unseen, byId } };
  }
  const round3 = v => Math.round(num(v) * 1000) / 1000;

  /* ── публичный расчёт ── */
  function compute(state, now = Date.now()) {
    const cur = snapshot(state, now);
    /* подтверждение: lo ≥ 70 сегодня и на конец двух прошлых календарных дней */
    const marks = [cur];
    for (let k = 1; k < CONFIRM_DAYS; k++) marks.push(snapshot(state, startOfDay(now) - (k - 1) * DAY - 1));
    let confirmed = 0;
    for (const l of [4, 3, 2, 1]) {
      if (marks.every(s => s.levels[l].lo >= CONFIRM)) { confirmed = l; break; }
    }
    return { levels: cur.levels, level: cur.level, confirmed, nodes: cur.nodes };
  }

  /* ── «почему столько»: разбор узлов одного слова ── */
  function explain(state, cardId, now = Date.now()) {
    const id = String(cardId || '');
    const h0 = id.indexOf(':') > 0 ? id.slice(id.indexOf(':') + 1) : id;
    const V = vocab();
    const out = [];
    if (V.lvl[h0] == null) return ['Слова ' + (h0 || '—') + ' нет в программе — оценка не считается'];
    const map = evidence(state, now);
    out.push(h0 + ' · уровень ' + V.lvl[h0]);
    for (const key of Object.keys(BANDS)) {
      const band = BANDS[key], evs = map['w:' + h0 + '|' + band];
      if (!evs || !evs.length) continue;
      const s = score(evs, now, null);
      out.push(band + ' ' + BAND_RU[band] + ': ' + s.m.toFixed(2) + ' (точность ' + s.P.toFixed(2) + ', потолок ' + s.C.toFixed(2) + ', свежесть ' + s.F.toFixed(2) + ')');
      const sorted = evs.slice().sort((x, y) => -byTs(x, y)).slice(0, 12);
      for (const e of sorted) {
        if (e.feed) { out.push('· лента/урок прочитан' + (e.ts ? ' · ' + dateRu(e.ts) : '') + ' — это предположение, потолок ' + CAPS.feed.toFixed(2)); continue; }
        const sign = e.frac >= 1 ? '+' : e.frac > 0 ? '±' : '−';
        const word = e.frac >= 1 ? 'верно' : e.frac > 0 ? 'частично' : 'мимо';
        out.push(sign + ' ' + word + ', ' + KIND_RU[e.kind] + ' · ' + dateRu(e.ts)
          + (e.sameDay ? ' · в день знакомства: половинный вес' : '') + (e.check ? ' · проверка' : ''));
      }
      out.push('потолок ' + s.C.toFixed(2) + ': ' + capWhy(evs, s));
    }
    if (out.length === 1) out.push('Свидетельств нет: слово ещё не открывали');
    return out;
  }
  function capWhy(evs, s) {
    const ans = evs.filter(e => !e.feed);
    if (!ans.length) return 'только отметка «прочитано»';
    const cap = e => (CAPS[e.kind] != null ? CAPS[e.kind] : CAPS.choice);
    const eff = e => Math.min(cap(e), e.sameDay ? SAME_DAY_CAP : 1);
    const strong = ans.filter(e => eff(e) >= s.C - 1e-9).sort((x, y) => cap(y) - cap(x));
    const top = strong[0] || ans[0];
    if (cap(top) > s.C + 1e-9) return 'ответы шли в день знакомства с материалом — ' + KIND_RU[top.kind] + ' идёт вполсилы';
    if (strong.length < 2) return 'сильнее ничего нет, а ' + KIND_RU[top.kind] + ' подтверждён только раз';
    return 'только ' + KIND_RU[top.kind];
  }

  /* ── можно ли предлагать спринт по блоку ── */
  function readyForCheck(state, blockId, now = Date.now()) {
    const b = (window.PROGRAM && window.PROGRAM.byId) ? window.PROGRAM.byId(blockId) : null;
    const v = (settings(state).program || {})[blockId];
    const seen = (v && Array.isArray(v.seen)) ? v.seen : [];
    if (seen.length < Math.min(MIN_SPRINT, (b && b.words) ? b.words.length : MIN_SPRINT)) return false;
    const sprints = attemptsOf(state)
      .filter(a => a && a.mode === 'sprint' && blockIdOf(a) === blockId && num(a.ts) <= now);
    if (!sprints.length) return true;
    const last = sprints.reduce((t, a) => Math.max(t, num(a.ts)), 0);
    const covered = new Set();
    for (const a of sprints) for (const w of a.words || []) covered.add(w);
    if (seen.some(h => !covered.has(h))) return true;       /* в ленте появилось непроверенное */
    if (!sprints.some(cleanSprint)) return true;            /* чистого прохода ещё не было */
    return now - last >= 3 * DAY;                           /* иначе — когда успеет остыть */
  }

  return { CAPS, BANDS, compute, explain, readyForCheck, dayKey, MIN_SPRINT };
})();
