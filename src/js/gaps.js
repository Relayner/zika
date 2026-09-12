/* «Где тонко»: одна зона слабости и до трёх шагов, у каждого — причина с числами.
   Всё считается заново из state.attempts и настроек: модуль ничего не хранит и ничего не пишет,
   поэтому методику учёта можно переключать туда-обратно без потери прогресса.

   Закон чистоты: результат зависит только от (state, now). Порядок попыток в журнале
   значения не имеет — история приводится к каноническому порядку (ts, затем id) на входе,
   и все сортировки внутри имеют полный порядок, без опоры на порядок массива. */
window.Gaps = (() => {
  const DAY = 24 * 3600e3;
  const WIN = 14 * DAY;        /* окно «свежей» истории */
  const HOT = 3 * DAY;         /* насколько свежей должна быть ошибка, чтобы слово «горело» */
  const SWITCH = 0.10;         /* гистерезис: зона меняется только при явном перевесе */
  const NEED = 30;             /* столько ответов даёт зоне полный голос (λ) */
  const FIRE_MIN = 5;          /* просрочка говорит в полный голос от пяти слов с повторениями */
  const CHAIN = 30;            /* на сколько дней назад восстанавливаем цепочку промеров */
  /* 听 读 写 手 说 词 — зоны-навыки; те же виды работы, что считает Skill */
  const SKILLS = ['listen', 'read', 'write', 'hand', 'speak', 'vocab'];
  const DECKS = ['hsk1', 'hsk2', 'hsk3', 'freq1'];
  const DECK_ORDER = { hsk1: 0, hsk2: 1, hsk3: 2, freq1: 3 };
  /* классы выбора слова в промер: четыре основных плюс добор */
  const CLASS = {
    hot: { ru: 'Горит', sub: 'свежая ошибка' },
    morning: { ru: 'На утро', sub: 'вчерашняя лента' },
    old: { ru: 'Давно', sub: 'свежесть упала' },
    ahead: { ru: 'Впереди', sub: 'следующие блоки' },
    mix: { ru: 'Добор', sub: 'чтобы промер был полным' },
  };
  const CLASSES = Object.keys(CLASS);
  /* виды заданий промера */
  const SUB = {
    recall: { ru: 'Вспомнить', zh: '认' },
    listen: { ru: 'На слух', zh: '听' },
    tone: { ru: 'Тон', zh: '声' },
  };

  /* ── чтение состояния: ни одной записи, ни одного побочного эффекта ── */
  /* канонический порядок: по времени, при равном времени — по id. Полный порядок,
     поэтому перестановка журнала ничего не меняет */
  const sid = a => String((a && a.id) != null ? a.id : '');
  const CMP = (x, y) => (x.ts - y.ts) || (sid(x) < sid(y) ? -1 : sid(x) > sid(y) ? 1 : 0);
  const attemptsOf = s => {
    const list = (s || {}).attempts;
    return (Array.isArray(list) ? list : []).filter(a => a && !a.aborted && a.ts).sort(CMP);
  };
  const settingsOf = s => (s || {}).settings || {};
  /* повторения берём из открытой книги учёта: у тестовой методики они свои (Ledger) */
  const srsOf = s => {
    const st = settingsOf(s);
    try { if (window.Ledger && Ledger.is2(s)) return (st.v2 || {}).srs || {}; } catch (e) { /* книг нет */ }
    return st.srs || {};
  };
  const r2 = x => Math.round(x * 100) / 100;
  const dayKey = ts => (window.Stats ? Stats.dayKey(ts) : new Date(ts).toISOString().slice(0, 10));
  /* копия для чужих модулей: Skill/SRS/Ledger лениво создают settings.srs и коробку v2 —
     пусть создают у копии. Коробку копируем отдельно: иначе запись уйдёт в настоящую. */
  const safe = s => {
    const st = settingsOf(s);
    const out = { ...(s || {}) };
    delete out.books; delete out.__srs;                       /* кэши Ledger пусть строит заново */
    out.attempts = ((s || {}).attempts) || [];
    out.settings = { ...st };
    if (st.v2 && typeof st.v2 === 'object') out.settings.v2 = { ...st.v2 };
    return out;
  };
  const pl = (n, one, few, many) => (n % 10 === 1 && n % 100 !== 11 ? one : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? few : many);

  /* ── словарь карточек: из живого индекса App, а под node — из встроенных банков ──
     Индекс пересобирается, когда банк изменился (импорт колоды), поэтому порядок вызовов
     на результат не влияет: кэш — это не состояние, а слепок текущего банка. */
  let idx = null, idxKey = '';
  function bankKey() {
    const live = (window.App && App.cardIndex && typeof App.cardIndex === 'object') ? App.cardIndex : null;
    if (live) return 'app:' + Object.keys(live).length;
    return 'node:' + [1, 2, 3].map(l => (((window.HSK || {})[l]) || []).length).join('.') + '/' + ((window.FREQ || []).length);
  }
  function cards() {
    const key = bankKey();
    if (idx && idxKey === key) return idx;
    const list = [];
    const live = (window.App && App.cardIndex && typeof App.cardIndex === 'object') ? App.cardIndex : null;
    if (live) Object.keys(live).forEach(k => list.push(live[k]));
    else {
      [1, 2, 3].forEach(l => ((window.HSK || {})[l] || []).forEach(e => list.push({ id: 'hsk' + l + ':' + e[0], deckId: 'hsk' + l, hanzi: e[0], pinyin: e[1], ru: e[2] })));
      (window.FREQ || []).forEach(e => list.push({ id: 'freq1:' + e[0], deckId: 'freq1', hanzi: e[0], pinyin: e[1], ru: e[2] }));
    }
    /* фразы (sent:…) и карточки без колоды в промер не идут: это не слово */
    const ok = list.filter(c => c && c.id && c.deckId && c.hanzi);
    /* порядок разбора задаёт, какая карточка отвечает за иероглиф: младшая колода важнее.
       Полный порядок — значит byHanzi не зависит от порядка обхода банка. */
    ok.sort((a, b) => (DECK_ORDER[a.deckId] != null ? DECK_ORDER[a.deckId] : 9) - (DECK_ORDER[b.deckId] != null ? DECK_ORDER[b.deckId] : 9)
      || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
    const built = { byId: {}, byHanzi: {} };
    for (const c of ok) { if (!built.byId[c.id]) built.byId[c.id] = c; if (!built.byHanzi[c.hanzi]) built.byHanzi[c.hanzi] = c; }
    idx = built; idxKey = key;
    return idx;
  }
  const cardById = id => cards().byId[id] || null;
  const cardOf = h => cards().byHanzi[h] || null;
  const hanziOfQ = q => q.hanzi || ((q.cardId && cardById(q.cardId)) ? cardById(q.cardId).hanzi : null);
  const idOfQ = q => (q.cardId && cardById(q.cardId) ? q.cardId : (q.hanzi && cardOf(q.hanzi) ? cardOf(q.hanzi).id : (q.cardId || null)));

  /* ── слово → блок программы (первый блок, где слово вводится) ── */
  let bmap = null, bmapKey = '';
  function blocks() { return (window.PROGRAM || {}).BLOCKS || []; }
  function blockOf(h) {
    const key = 'p:' + blocks().length;
    if (!bmap || bmapKey !== key) {
      bmap = {};
      blocks().forEach(b => (b.words || []).forEach(w => { if (!bmap[w]) bmap[w] = b.id; }));
      bmapKey = key;
    }
    return h ? (bmap[h] || null) : null;
  }
  const blockById = id => (window.PROGRAM && id ? PROGRAM.byId(id) : null);

  /* Вопросы попытки: у спринта и письма их может не быть — тогда разворачиваем words */
  function qsOf(a) {
    if (Array.isArray(a.questions) && a.questions.length) return a.questions.filter(q => q && typeof q === 'object');
    const ok = (a.percent || 0) >= 80;
    return (Array.isArray(a.words) ? a.words : []).map(w => ({ hanzi: w, ok, fraction: ok ? 1 : 0 }));
  }
  const isOk = q => (q.fraction != null ? q.fraction >= 1 : !!q.ok);

  /* ── накопители по зонам: один проход по истории ── */
  function zoneStats(state, now) {
    const zs = {};
    const z = (kind, key) => {
      const id = kind + ':' + key;
      return zs[id] || (zs[id] = { id, kind, key, n: 0, ok: 0, n14: 0, soft: 0, cards: {}, h: {}, last: 0 });
    };
    for (const a of attemptsOf(state)) {
      if (a.ts > now) continue;
      const fresh = (now - a.ts) <= WIN;
      const ks = (window.Skill ? (Skill.kindsOf(a) || []) : []).filter(k => SKILLS.indexOf(k) >= 0);
      const flip = a.mode === 'flip';
      for (const q of qsOf(a)) {
        const h = hanziOfQ(q), id = idOfQ(q);
        const okFrac = q.fraction != null ? q.fraction : (q.ok ? 1 : 0);
        /* «примерно так»: тон не тот или самопроверка на глаз */
        const soft = ((q.parts && q.parts.pinyin === 'tones') || flip) ? 1 : 0;
        const targets = ks.map(k => z('skill', k));
        if (id) targets.push(z('skill', 'vocab'));
        const b = blockOf(h);
        if (b) targets.push(z('block', b));
        for (const t of targets) {
          t.n++; t.ok += okFrac;
          if (fresh) { t.n14++; t.soft += soft; }
          if (id) t.cards[id] = 1;
          if (h) t.h[h] = 1;
          if (a.ts > t.last) t.last = a.ts;
        }
      }
    }
    return zs;
  }

  function profileOf(state, now) {
    try { return window.Skill ? Skill.profile(safe(state), now) : {}; } catch (e) { return {}; }
  }
  function levelOf(state, prof) {
    try {
      const s = safe(state);
      if (window.Skill && window.Boss) return Skill.recLevel(s, prof);
      if (window.Boss) return Boss.levelOf(s);
    } catch (e) { /* уровня нет — считаем начальным */ }
    return 1;
  }
  const deckFor = lvl => DECKS[Math.min(3, Math.max(1, lvl || 1) - 1)];

  function zoneLabel(kind, key) {
    if (kind === 'block') { const b = blockById(key); return b ? 'Блок «' + b.ru + '»' : 'Блок ' + key; }
    const k = (window.Skill && Skill.KINDS[key]) || null;
    return k ? k.ru + ' ' + k.zh : key;
  }

  /* Текущая зона: своя настройка, в любом из форматов — 'listen', 'skill:listen', 'b1-02', {kind,key}.
     Живёт в settings.gaps, а не в settings.v2: там коробка учёта Ledger, чужое место.
     Старая запись в settings.v2.zone ещё понимается — чтобы не терять выбор при обновлении. */
  function curZone(state) {
    const st = settingsOf(state);
    const z = (st.gaps || {}).zone || (st.v2 || {}).zone;
    if (!z) return null;
    if (typeof z === 'object') return z.key ? (z.kind || 'skill') + ':' + z.key : null;
    if (String(z).indexOf(':') > 0) return String(z);
    return (SKILLS.indexOf(String(z)) >= 0 ? 'skill:' : 'block:') + z;
  }

  /* ── причина зоны: одна фраза с числами ── */
  function zoneWhy(row, avgScore) {
    const b = row.kind === 'block' ? blockById(row.key) : null;
    if (b && row.never > 0) return row.never + ' ' + pl(row.never, 'слово', 'слова', 'слов') + ' из ' + b.words.length + ' ни разу не набирали';
    if (row.fire >= 0.34 && row.due > 0) return 'просрочено ' + row.due + ' ' + pl(row.due, 'слово', 'слова', 'слов') + ' из ' + row.seen;
    if (row.unsure >= 0.25 && row.n14 > 0) return row.soft + ' ' + pl(row.soft, 'ответ', 'ответа', 'ответов') + ' из ' + row.n14 + ' были наугад: тон не тот или проверка на глаз';
    if (row.score != null) {
      const d = avgScore != null ? Math.round(avgScore - row.score) : 0;
      return row.score + '% верных' + (d >= 5 ? ' — на ' + d + ' ниже остального' : ' на ' + row.n + ' ' + pl(row.n, 'ответе', 'ответах', 'ответах'));
    }
    return 'данных мало: ' + row.n + ' ' + pl(row.n, 'ответ', 'ответа', 'ответов');
  }

  /* ── зоны: где тонко ── */
  function thin(state, now = Date.now()) {
    const zs = zoneStats(state, now);
    const prof = profileOf(state, now);
    const srs = srsOf(state);
    const rows = [];
    for (const t of Object.values(zs)) {
      const b = t.kind === 'block' ? blockById(t.key) : null;
      const score = t.kind === 'skill'
        ? (prof[t.key] ? prof[t.key].score : null)
        : (t.n ? Math.round(t.ok / t.n * 100) : null);
      const weak = score == null ? 0.5 : Math.max(0, (100 - score) / 100);
      const unsure = t.n14 ? t.soft / t.n14 : 0;
      const ids = Object.keys(t.cards);
      const withRec = ids.filter(id => srs[id]);
      const over = withRec.filter(id => srs[id].due && srs[id].due <= now);
      /* одно просроченное слово из одного — это не пожар: голос просрочки растёт с числом слов */
      const fire = withRec.length ? (over.length / withRec.length) * Math.min(1, withRec.length / FIRE_MIN) : 0;
      /* данные зоны: у словаря это слова в обороте, у остальных — ответы */
      const dataN = (t.kind === 'skill' && t.key === 'vocab') ? withRec.length : t.n;
      const lam = Math.min(1, dataN / NEED);   /* мало данных — зона не кричит */
      rows.push({
        kind: t.kind, key: t.key, ru: zoneLabel(t.kind, t.key),
        thin: r2((weak + unsure + fire) * lam),
        weak: r2(weak), unsure: r2(unsure), fire: r2(fire), lam: r2(lam),
        n: t.n, data: dataN, n14: t.n14, soft: t.soft, score, seen: withRec.length, due: over.length,
        never: b ? b.words.filter(w => !t.h[w]).length : 0,
        last: t.last, why: '',
      });
    }
    const sk = rows.filter(r => r.kind === 'skill' && r.score != null);
    const avg = sk.length ? sk.reduce((a, r) => a + r.score, 0) / sk.length : null;
    rows.forEach(r => {
      /* среднее «остального» — без самой зоны, иначе сравнение врёт */
      const rest = sk.filter(x => x.key !== r.key || x.kind !== r.kind);
      const a = rest.length ? rest.reduce((s, x) => s + x.score, 0) / rest.length : avg;
      r.why = zoneWhy(r, a);
    });
    /* порядок устойчивый: по thin, потом по объёму данных, потом по ключу */
    rows.sort((a, b) => b.thin - a.thin || b.n - a.n || (a.kind + a.key < b.kind + b.key ? -1 : 1));
    const cur = curZone(state);
    if (cur && rows.length) {
      const i = rows.findIndex(r => r.kind + ':' + r.key === cur);
      if (i === 0) rows[0].current = true;
      else if (i > 0 && rows[0].thin - rows[i].thin < SWITCH) { const [c] = rows.splice(i, 1); c.current = true; rows.unshift(c); }
    }
    return rows;
  }

  /* ── просрочка по SRS ── */
  function dueOf(state, now) {
    const srs = srsOf(state);
    const ids = Object.keys(srs).filter(id => srs[id] && srs[id].due && srs[id].due <= now).sort();
    const long = ids.filter(id => now - srs[id].due > 3 * DAY);
    return { ids, long };
  }

  /* ── шаг по зоне ── */
  function stepFor(state, zone, ctx) {
    const { now, lvl, deck } = ctx;
    if (zone.kind === 'block') {
      const b = blockById(zone.key);
      if (!b) return null;
      return { t: 'sprint', ru: 'Урок · ' + b.ru, why: zone.why, go: { t: 'sprint', blockId: b.id } };
    }
    if (zone.key === 'vocab') {
      const d = dueOf(state, now);
      if (!d.ids.length) return null;
      return { t: 'review', ru: 'Повторение 复习', why: reviewWhy(d), go: { t: 'review' } };
    }
    if (zone.key === 'listen') {
      const done = settingsOf(state).phon || {};
      const next = ((window.PHON || {}).LESSONS || []).find(l => !done[l.id]);
      if (next && (zone.unsure >= 0.2 || zone.n < NEED)) return { t: 'phon', ru: 'Звучание · ' + next.ru, why: zone.why, go: { t: 'phon', lessonId: next.id } };
      return { t: 'drill', ru: 'Тренировка на слух 听', why: zone.why, go: { t: 'drill', mode: 'listen', deck } };
    }
    if (zone.key === 'hand') return { t: 'hand', ru: 'Письмо от руки 手写', why: zone.why + handTail(state, now), go: { t: 'hand', deck, lvl } };
    if (zone.key === 'speak') return { t: 'boss', ru: 'Бой с боссом 斗', why: zone.why, go: { t: 'boss', lvl } };
    if (zone.key === 'write') {
      const handAgo = lastHand(state, now);
      if (handAgo == null || handAgo >= 7)
        return { t: 'hand', ru: 'Письмо от руки 手写', why: zone.why + handTail(state, now), go: { t: 'hand', deck, lvl } };
      return { t: 'drill', ru: 'Набор иероглифов 写', why: zone.why, go: { t: 'drill', mode: 'write', deck } };
    }
    return { t: 'drill', ru: 'Тренировка по словам 读', why: zone.why, go: { t: 'drill', mode: 'quiz', deck } };
  }
  function reviewWhy(d) {
    const n = d.ids.length;
    return n + ' ' + pl(n, 'слово', 'слова', 'слов') + ' ' + pl(n, 'просрочено', 'просрочены', 'просрочены') + (d.long.length ? ', ' + d.long.length + ' — дольше трёх дней' : '');
  }
  function handTail(state, now) {
    const d = lastHand(state, now);
    return d == null ? '; от руки ещё не писали' : '; от руки не писали ' + d + ' ' + pl(d, 'день', 'дня', 'дней');
  }
  function lastHand(state, now) {
    let last = 0;
    for (const a of attemptsOf(state)) if (a.mode === 'hand' && a.ts <= now && a.ts > last) last = a.ts;
    return last ? Math.floor((now - last) / DAY) : null;
  }

  /* ── до трёх шагов: не больше одного на зону, у каждого причина с числами ── */
  function recommend(state, now = Date.now()) {
    const zones = thin(state, now);
    const prof = profileOf(state, now);
    const lvl = levelOf(state, prof);
    const ctx = { now, lvl, deck: deckFor(lvl) };
    const steps = [], used = {};
    const push = (zid, st) => { if (!st || steps.length >= 3 || used[zid]) return; used[zid] = 1; st.zone = zid; steps.push(st); };
    /* просроченное идёт вперёд: это не выбор зоны, а долг */
    const d = dueOf(state, now);
    if (d.ids.length) push('skill:vocab', { t: 'review', ru: 'Повторение 复习', why: reviewWhy(d), go: { t: 'review' } });
    /* истории нет вовсе — не «промер», а разумный старт (долг по повторению при этом остаётся) */
    if (!zones.some(z => z.n)) {
      for (const st of startSteps(state, ctx)) push(st.zone, st);
      return steps;
    }
    for (const z of zones) {
      if (steps.length >= 3) break;
      if (!z.n) continue;
      push(z.kind + ':' + z.key, stepFor(state, z, ctx));
    }
    if (steps.length < 3) {
      const n14 = zones.reduce((a, z) => Math.max(a, z.n14), 0);
      const p = probe(state, now);
      if (p.length) push('probe', { t: 'probe', ru: 'Промер дня', why: n14 + ' ' + pl(n14, 'ответ', 'ответа', 'ответов') + ' за две недели — ' + p.length + ' ' + pl(p.length, 'задание покажет', 'задания покажут', 'заданий покажут') + ', где тонко', go: { t: 'probe' } });
    }
    if (!steps.length) return startSteps(state, ctx);
    return steps;
  }
  /* Пустая история: разумный старт, причина тоже с числами */
  function startSteps(state, ctx) {
    const out = [];
    const done = settingsOf(state).phon || {};
    const next = ((window.PHON || {}).LESSONS || []).find(l => !done[l.id]);
    const n = attemptsOf(state).length;
    if (next) out.push({ zone: 'skill:listen', t: 'phon', ru: 'Звучание · ' + next.ru, why: n + ' ' + pl(n, 'попытка', 'попытки', 'попыток') + ' в истории — начинаем со звучания', go: { t: 'phon', lessonId: next.id } });
    const b = blocks()[0];
    if (b) out.push({ zone: 'block:' + b.id, t: 'sprint', ru: 'Урок · ' + b.ru, why: '0 слов из ' + b.words.length + ' в первом блоке набрано', go: { t: 'sprint', blockId: b.id } });
    const p = probe(state, ctx.now);
    if (p.length) out.push({ zone: 'probe', t: 'probe', ru: 'Промер дня', why: p.length + ' ' + pl(p.length, 'задание', 'задания', 'заданий') + ' на старте покажут, с чего начать', go: { t: 'probe' } });
    return out.slice(0, 3);
  }

  /* ── история по карточкам (свои счётчики: спринт и письмо вопросов не пишут) ── */
  function cardHistory(hist) {
    const m = {};
    const get = id => m[id] || (m[id] = { asked: 0, wrong: 0, lastAt: 0, lastWrongAt: 0, tones: 0, listen: 0 });
    for (const a of hist.slice().sort(CMP)) {
      const listen = a.mode === 'listen' || a.mode === 'phon' || a.mode === 'boss';
      for (const q of qsOf(a)) {
        const id = idOfQ(q);
        if (!id || !cardById(id)) continue;
        const s = get(id);
        s.asked++; s.lastAt = a.ts;
        if (!isOk(q)) { s.wrong++; s.lastWrongAt = a.ts; }
        if (q.parts && q.parts.pinyin === 'tones') s.tones++;
        if (listen) s.listen++;
      }
    }
    return m;
  }

  /* ── промер дня: 4 класса выбора + слух + тон ── */
  function probe(state, now = Date.now()) { return buildProbe(state, now, 0); }

  function buildProbe(state, now, depth) {
    const hist = attemptsOf(state).filter(a => a.ts <= now);
    /* вчерашний промер — та же функция на вчерашней истории: два дня подряд одно слово не берём */
    const excl = {};
    const prevDay = now - DAY;
    if (depth < CHAIN && hist.some(a => a.ts <= prevDay))
      for (const p of buildProbe(state, prevDay, depth + 1)) excl[p.cardId] = 1;

    const m = cardHistory(hist);
    const srs = srsOf(state);
    /* ключи берём в устойчивом порядке: иначе на равных числах выбор зависел бы от журнала */
    const ids = Object.keys(m).sort();
    const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    /* горит — свежая ошибка */
    const hot = ids.filter(id => m[id].lastWrongAt && now - m[id].lastWrongAt <= HOT).sort((a, b) => m[b].lastWrongAt - m[a].lastWrongAt || byId(a, b));
    /* на утро — слово вчерашней ленты (сперва спринт: это то, что вчера проходили) */
    const yKey = dayKey(prevDay);
    const yday = [];
    const ySort = (x, y) => ((y.mode === 'sprint' ? 1 : 0) - (x.mode === 'sprint' ? 1 : 0)) || CMP(x, y);
    for (const a of hist.filter(a => dayKey(a.ts) === yKey).sort(ySort))
      for (const q of qsOf(a)) { const id = idOfQ(q); if (id && cardById(id) && yday.indexOf(id) < 0) yday.push(id); }
    /* давно — свежесть упала: сперва просроченное, потом самое давнее */
    const old = ids.filter(id => srs[id] || m[id].lastAt)
      .map(id => ({ id, over: srs[id] && srs[id].due ? now - srs[id].due : now - m[id].lastAt - 7 * DAY }))
      .filter(x => x.over > 0).sort((a, b) => b.over - a.over || byId(a.id, b.id)).map(x => x.id);
    /* впереди — слова следующих блоков, ещё не набиравшиеся */
    const ahead = aheadIds(state, m, now);

    const picks = [], usedId = {}, perBlock = {};
    const take = (pool, cls, sub, why) => {
      for (const id of pool) {
        if (usedId[id] || excl[id]) continue;
        const c = cardById(id);
        if (!c) continue;
        const b = blockOf(c.hanzi) || '—';
        if ((perBlock[b] || 0) >= 2) continue;      /* не больше двух слов из одного блока */
        usedId[id] = 1; perBlock[b] = (perBlock[b] || 0) + 1;
        picks.push({ cardId: id, sub, cls, why: why(c, m[id] || {}) });
        return true;
      }
      return false;
    };
    const ago = ts => { const d = Math.floor((now - ts) / DAY); return d <= 0 ? 'сегодня' : d === 1 ? 'вчера' : d + ' ' + pl(d, 'день', 'дня', 'дней') + ' назад'; };
    take(hot, 'hot', 'recall', (c, s) => 'ошиблись ' + ago(s.lastWrongAt) + ' — слово ещё горит');
    take(yday, 'morning', 'recall', () => 'вчера было в ленте — проверим на утро');
    take(old, 'old', 'recall', (c, s) => (s.lastAt ? Math.max(1, Math.floor((now - s.lastAt) / DAY)) + ' ' + pl(Math.max(1, Math.floor((now - s.lastAt) / DAY)), 'день', 'дня', 'дней') + ' без встречи' : 'давно не встречалось') + ' — свежесть упала');
    take(ahead, 'ahead', 'recall', c => { const b = blockById(blockOf(c.hanzi)); return 'из блока «' + (b ? b.ru : '?') + '» — идёт следующим'; });
    const rest = [...hot, ...old, ...yday, ...ahead];
    /* классов на старте может не хватить — добираем из того, что есть, но четыре задания держим */
    while (picks.length < 4 && take(rest, 'mix', 'recall', (c, s) => (s.asked ? s.asked + ' ' + pl(s.asked, 'ответ', 'ответа', 'ответов') + ' по этому слову — посмотрим ещё раз' : 'слово ещё не спрашивали'))) ;
    /* слух и тон — из общего котла, с оглядкой на то, чего не хватало */
    const deaf = rest.filter(id => !(m[id] || {}).listen);
    take([...deaf, ...rest], 'mix', 'listen', (c, s) => (s.listen ? 'на слух ' + s.listen + ' ' + pl(s.listen, 'раз', 'раза', 'раз') + ' — проверим ещё' : 'на слух это слово ещё не ловили'));
    const toned = rest.filter(id => (m[id] || {}).tones);
    const many = rest.filter(id => window.Pinyin && Pinyin.syllables((cardById(id) || {}).pinyin || '') > 1);
    take([...toned, ...many, ...rest], 'mix', 'tone', (c, s) => (s.tones ? 'тон путался ' + s.tones + ' ' + pl(s.tones, 'раз', 'раза', 'раз') : 'слогов больше одного — тон легко смазать'));
    return picks;
  }

  /* Следующие блоки: те, что идут за последним тронутым; берём слова без набора */
  function aheadIds(state, m, now) {
    const bs = blocks();
    if (!bs.length) return [];
    const prog = settingsOf(state).program || {};
    let last = -1;
    for (const a of attemptsOf(state)) {
      if (a.ts > now) continue;
      const bid = a.block || a.blockId;
      const i = bid ? bs.findIndex(b => b.id === bid) : -1;
      if (i > last) last = i;
    }
    if (last < 0) last = bs.reduce((acc, b, i) => (prog[b.id] && prog[b.id].seal === 'done' ? i : acc), -1);
    const out = [];
    for (const b of bs.slice(last + 1, last + 4)) {
      for (const w of b.words) {
        const c = cardOf(w);
        if (c && !(m[c.id] && m[c.id].asked)) out.push(c.id);
      }
    }
    return out;
  }

  return { thin, recommend, probe, SKILLS, CLASSES, CLASS, SUB, SWITCH, NEED, FIRE_MIN, blockOf };
})();
