/* Программа изучения: карта уровней → лента блока → спринт «Проверить себя». */
(() => {
  const { state, views, actions, nav, esc, attr, uid, $, toast, sheet, closeSheet, persist, render, cardsOfDeck, saveAttempt, fmt } = App;
  const P = window.PROGRAM;
  const MIN_SPRINT = 10;                       /* с какого числа просмотренных слов доступна проверка */
  const SEALS = { new: ['生', 'новый'], work: ['学', 'в работе'], done: ['熟', 'освоен'], gold: ['精', 'закреплён'] };
  let feed = null;   /* лента: { blockId, order, i, seen:Set } */
  let sp = null;     /* спринт: { blockId, qs, i, right, wrong, size } */

  const prog = () => (state.settings.program || (state.settings.program = {}));
  const BL_TTL = 30 * 60 * 1000;   /* задание не повторяется 30 минут */
  const bstate = id => {
    const st = prog()[id] || (prog()[id] = { seen: [], seal: 'new', clean: 0, revised: 0, firstDone: false });
    if (!st.bl) st.bl = {};        /* чёрный список: «слово|тип» → до какого времени занято */
    if (st.runs == null) st.runs = 0;
    return st;
  };
  let hmap = null;   /* иероглиф → карточка, по всем встроенным колодам уровней */
  const hanziMap = () => hmap || (hmap = P.LEVELS.reduce((m, l) => { cardsOfDeck(l.deck).forEach(c => { if (!m[c.hanzi]) m[c.hanzi] = c; }); return m; }, {}));
  const cardOf = h => hanziMap()[h] || null;
  const wordsOf = b => b.words.map(cardOf).filter(Boolean);

  /* ── карта уровней ── */
  views.program = {
    render(p) {
      const only = p && p.lvl ? +p.lvl : null;
      const lv = P.LEVELS.filter(l => !only || l.n === only).map(l => {
        const bs = P.byLevel(l.n);
        if (!bs.length) return `<div class="panel lvl-row muted"><div class="lvl-badge zh">${l.n}</div><div class="grow"><b>${l.zh} · ${l.ru}</b><div class="hint" style="margin:0">HSK ${l.hsk} · ${l.cefr} — блоки готовятся</div></div></div>`;
        const done = bs.filter(b => bstate(b.id).seal === 'done' || bstate(b.id).seal === 'gold').length;
        return `<div class="panel"><div class="lvl-head"><div class="lvl-badge zh">${l.n}</div><div class="grow"><b>${l.zh} · ${l.ru}</b><div class="hint" style="margin:0">HSK ${l.hsk} · ${l.cefr} · ${bs.length} блоков · освоено ${done}</div></div></div>
        <div class="blk-grid">${bs.map(b => {
          const st = bstate(b.id);
          const seen = st.seen.length, tot = b.words.length;
          const s = SEALS[st.seal];
          return `<button class="blk-card s-${st.seal}" data-action="prog-open" data-id="${b.id}">
            <span class="blk-seal zh">${s[0]}</span>
            <span class="blk-zh zh">${esc(b.zh)}</span>
            <span class="blk-ru">${esc(b.ru)}</span>
            <span class="blk-bar"><i style="width:${Math.round(seen / tot * 100)}%"></i></span>
            <span class="blk-n">${seen} / ${tot}${st.runs ? ` <b class="blk-runs">×${st.runs}</b>` : ''}</span></button>`;
        }).join('')}</div></div>`;
      }).join('');
      return `<div class="vh">${only ? '<button class="icon-btn" data-back>‹</button>' : '<div class="seal">学</div>'}<div class="grow"><h1 class="title">${only ? 'Уроки HSK ' + only : 'Программа'}</h1><div class="sub">${only ? 'учите по одному блоку — проверка идёт по пройденному' : 'блоки по темам и грамматике · заходите в любой'}</div></div><button class="icon-btn" data-action="prog-info" aria-label="О программе">i</button></div>${lv}${only ? '<button class="btn btn-secondary btn-block" data-go="program">Все уровни</button>' : ''}`;
    },
  };
  actions['prog-info'] = () => sheet(`<h3 class="sh-t">Как устроена программа</h3><div class="install-note">
    <p>Блоки взяты из государственного стандарта <b>国际中文教育中文水平等级标准 (2021)</b> — того же, на котором построен HSK. Порядок подачи — как в базовом курсе Пекинского университета языка и культуры: сначала конструкция, потом лексика вокруг неё.</p>
    <p><b>Свободный порядок.</b> Любой блок открыт с самого начала — заходите в тот, который нужен сейчас.</p>
    <p><b>Печати:</b> 生 новый · 学 в работе · 熟 освоен · 精 закреплён повторениями.</p>
    <p>Листание карточек очков не даёт. Очки платят за «Проверить себя» — от ${MIN_SPRINT} слов.</p></div>
    <button class="btn btn-primary btn-block mt" data-close>Понятно</button>`);

  /* ── лента блока ── */
  actions['prog-open'] = el => { const b = P.byId(el.dataset.id); if (!b) return; const ws = wordsOf(b); if (!ws.length) return toast('Слова блока не найдены'); feed = { blockId: b.id, i: 0, list: ws }; nav('feed', { id: b.id }); };
  actions['feed-next'] = () => { if (!feed) return; markSeen(); feed.i = Math.min(feed.list.length - 1, feed.i + 1); render(); };
  actions['feed-prev'] = () => { if (!feed) return; feed.i = Math.max(0, feed.i - 1); render(); };
  actions['feed-say'] = () => { if (feed) Speech.say(feed.list[feed.i].hanzi); };
  actions['feed-grammar'] = () => {
    const b = P.byId(feed.blockId);
    sheet(`<h3 class="sh-t">${esc(b.g.t)}</h3><div class="install-note"><p>${esc(b.g.d)}</p>${b.g.ex.map(e => `<p class="gex"><span class="hanzi sm">${esc(e[0])}</span><span class="pinyin sm">${esc(e[1])}</span><span class="ru sm">${esc(e[2])}</span></p>`).join('')}</div><button class="btn btn-primary btn-block mt" data-close>Понятно</button>`);
  };
  function markSeen() {
    const b = P.byId(feed.blockId), st = bstate(b.id), h = feed.list[feed.i].hanzi;
    if (st.seen.indexOf(h) < 0) { st.seen.push(h); if (st.seal === 'new') st.seal = 'work'; persist(); }
  }
  views.feed = {
    render(p) {
      const b = P.byId(p.id) || (feed && P.byId(feed.blockId));
      if (!b) return '<div class="empty">Блок не найден</div>';
      if (!feed || feed.blockId !== b.id) { const ws = wordsOf(b); if (!ws.length) return '<div class="empty">Слова блока не найдены</div>'; feed = { blockId: b.id, i: 0, list: ws }; }
      const st = bstate(b.id);
      const c = feed.list[feed.i];
      const seen = st.seen.length;
      const ready = seen >= MIN_SPRINT;
      const long = c.hanzi.replace(/[…\s]/g, '').length >= 5;
      return `<div class="vh"><button class="icon-btn" data-back>‹</button><div class="grow"><h1 class="title">${esc(b.ru)}</h1><div class="sub"><span class="zh">${esc(b.zh)}</span> · ${esc(b.can)}</div></div></div>
      <div class="panel feed-top"><div class="grow"><b>Изучено ${seen} из ${b.words.length}${st.runs ? ` · пройден ${st.runs} ${st.runs === 1 ? 'раз' : 'раза'}` : ''}</b><div class="hint" style="margin:2px 0 0">${ready ? 'Проверка доступна' : `Ещё ${MIN_SPRINT - seen} до проверки`}</div></div><button class="btn btn-secondary btn-sm" data-action="feed-grammar">${esc(b.g.t)}</button></div>
      <div class="panel ornate learn-card">
        <div class="learn-count">${feed.i + 1} / ${feed.list.length}${st.seen.indexOf(c.hanzi) >= 0 ? ' · <b class="lm">изучено</b>' : ''}</div>
        <div class="hanzi mid ${long ? 'len5' : ''}">${esc(c.hanzi)}</div>
        <div class="pinyin">${esc(c.pinyin)}</div>
        <div class="ru">${esc(c.ru)}</div>
        <button class="btn btn-secondary btn-sm learn-say" data-action="feed-say" data-nosound>🔊 Произнести</button>
      </div>
      <div class="learn-nav"><button class="btn btn-secondary" data-action="feed-prev" data-nosound>‹ Назад</button><button class="btn btn-primary" data-action="feed-next" data-nosound>Дальше ›</button></div>
      <button class="btn ${ready ? 'btn-jade' : 'btn-secondary'} btn-block" data-action="sprint-start" ${ready ? '' : 'disabled'}>Проверить себя 检验${ready ? ` · ${Math.min(20, Math.round(seen * 1.5))} заданий` : ''}</button>`;
    },
    mount() { if (feed) markSeen(); },
  };

  /* ── спринт ── */
  const SIZE_MULT = n => (n >= 30 ? 2 : n >= 20 ? 1.5 : n >= 15 ? 1.25 : 1);
  function buildSprint(b) {
    const st = bstate(b.id);
    const pool = st.seen.map(cardOf).filter(Boolean);
    const n = Math.min(20, Math.round(pool.length * 1.5));
    const types = b.lvl >= 2 ? ['audio', 'ru', 'zh', 'type'] : ['audio', 'ru', 'zh'];
    const now = Date.now();
    for (const k in st.bl) if (st.bl[k] <= now) delete st.bl[k];   /* просроченное освобождаем */
    /* всё, что вообще можно спросить: слово × тип задания */
    const combos = [];
    pool.forEach(c => types.forEach(t => combos.push({ c, t, key: c.hanzi + '|' + t })));
    let free = combos.filter(x => !st.bl[x.key]);
    let reset = false;
    if (free.length < n) {
      /* весь контент выбран — обнуляем список, но прошлый заход переносим: он не должен вернуться сразу */
      reset = true;
      const last = st.last || [];
      st.bl = {};
      last.forEach(k => { st.bl[k] = Date.now() + BL_TTL; });
      free = combos.filter(x => !st.bl[x.key]);
      if (free.length < n) {
        /* если и так не хватает — добираем из прошлого захода, но не больше 5% спринта */
        const cap = Math.max(1, Math.floor(n * 0.05));
        free = free.concat(HskReal.shuffle(combos.filter(x => st.bl[x.key])).slice(0, Math.min(cap, n - free.length)));
      }
    }
    /* раскладываем кругами: пока не пройдены все слова, второй раз слово не берём */
    const byWord = {};
    HskReal.shuffle(free).forEach(x => (byWord[x.c.hanzi] || (byWord[x.c.hanzi] = [])).push(x));
    const picked = [];
    while (picked.length < n) {
      const words = HskReal.shuffle(Object.keys(byWord).filter(h => byWord[h].length));
      if (!words.length) break;
      for (const h of words) { if (picked.length >= n) break; picked.push(byWord[h].shift()); }
    }
    const others = wordsOf(b);
    const qs = picked.map(x => {
      st.bl[x.key] = Date.now() + BL_TTL;
      const wrong = HskReal.shuffle(others.filter(y => y.hanzi !== x.c.hanzi)).slice(0, 3);
      if (x.t === 'type') return { t: x.t, key: x.key, card: x.c, points: 6 };
      const opts = HskReal.shuffle([x.c, ...wrong]);
      return { t: x.t, key: x.key, card: x.c, opts, correct: opts.indexOf(x.c), points: x.t === 'ru' ? 2 : 3 };
    });
    st.last = qs.map(x => x.key);
    persist();
    return { blockId: b.id, qs: HskReal.shuffle(qs), i: 0, right: 0, wrong: 0, size: pool.length, startedAt: Date.now(), bad: [], reset };
  }
  actions['sprint-start'] = () => {
    const b = P.byId(feed.blockId);
    if (bstate(b.id).seen.length < MIN_SPRINT) return;
    sp = buildSprint(b);
    nav('sprint');
  };
  actions['sprint-answer'] = el => {
    if (!sp) return;
    const q = sp.qs[sp.i];
    if (q.ok != null) return;
    const idx = +el.dataset.idx;
    q.ok = idx === q.correct;
    finishQ(q);
  };
  function finishQ(q) {
    if (q.ok) { sp.right++; Sound.ok(); } else { sp.wrong++; sp.bad.push(q.card.hanzi); Sound.fail(); }
    setTimeout(() => { sp.i++; if (sp.i >= sp.qs.length) endSprint(); else render(); }, 550);
    render();
  }
  actions['sprint-quit'] = () => {
    sheet(`<h3 class="sh-t">Бросить спринт?</h3><p style="color:var(--ink-2)">Очков за брошенную проверку не будет — так устроено, чтобы нельзя было набирать очки на лёгком начале.</p><div class="btns"><button class="btn btn-danger btn-block" id="sq">Бросить</button><button class="btn btn-secondary btn-block" id="sc">Продолжить</button></div>`, s => {
      $('#sq', s).onclick = () => { closeSheet(); sp = null; nav('feed', { id: feed.blockId }, { replace: true }); };
      $('#sc', s).onclick = () => closeSheet();
    });
  };
  function endSprint() {
    const b = P.byId(sp.blockId), st = bstate(b.id);
    const total = sp.qs.length;
    const errRate = sp.wrong / total;
    const clean = sp.wrong === 0;
    const half = !clean && sp.wrong <= Math.floor(total / 10);
    let base = sp.qs.filter(q => q.ok).reduce((s, q) => s + q.points, 0);
    let mult = SIZE_MULT(sp.size);
    if (clean) mult *= 1.25;
    const streakMult = clean ? Math.min(1.5, 1 + 0.1 * (st.clean || 0)) : 1;
    let points = clean ? base * mult * streakMult : half ? base * mult * 0.5 : 0;
    let bonus = 0;
    if (clean && !st.firstDone && st.seen.length >= b.words.length) { bonus = 50; st.firstDone = true; }
    points = Math.round(points + bonus);
    /* ошибочные слова возвращаются в ленту */
    st.seen = st.seen.filter(h => sp.bad.indexOf(h) < 0);
    st.clean = clean ? (st.clean || 0) + 1 : 0;
    st.runs = (st.runs || 0) + 1;
    if (clean && st.seen.length >= b.words.length) st.seal = 'done';
    const res = { clean, half, zero: !clean && !half, points, bonus, right: sp.right, wrong: sp.wrong, total, mult: mult * streakMult, back: sp.bad.length };
    const a = {
      id: uid(), ts: sp.startedAt, endedAt: Date.now(), durationMs: Date.now() - sp.startedAt,
      mode: 'sprint', block: b.id, deckIds: [], deckName: b.ru, difficulty: 'medium', show: 'program', guess: ['all'], order: 'random', timer: 0,
      total, planned: total, aborted: false, correct: sp.right, partial: 0, wrong: sp.wrong,
      percent: Math.round(sp.right / total * 100), points, questions: [],
      words: [...new Set(sp.qs.map(q => q.card.hanzi))],   /* для расчёта новизны */
    };
    persist();
    sp = null;
    state.lastSprint = res;
    saveAttempt(a).then(() => { state.lastSprint.points = a.points; state.lastSprint.decay = a.decay; Sound.finish(clean); nav('sprint-result', {}, { replace: true }); });
  }
  views.sprint = {
    render() {
      if (!sp) return '<div class="empty">Спринт не запущен</div>';
      const q = sp.qs[sp.i];
      if (!q) return '';
      const head = `<div class="qbar"><button class="icon-btn" data-action="sprint-quit">✕</button><div class="progress"><i style="width:${sp.i / sp.qs.length * 100}%"></i></div><div class="qcount">${sp.i + 1}/${sp.qs.length}</div><div class="qtimer" id="sprerr">${sp.wrong} ✕</div></div>`;
      let prompt, ui = '';
      if (q.t === 'audio') prompt = `<div class="ex-audio"><span class="say-ico" id="say-ico">🔊</span><div class="hint">Нажмите, чтобы повторить</div></div>`;
      else if (q.t === 'ru') prompt = `<div class="hanzi mid">${esc(q.card.hanzi)}</div>`;
      else if (q.t === 'zh') prompt = `<div class="ru" style="font-size:20px;font-weight:600">${esc(q.card.ru)}</div>`;
      else prompt = `<div class="pinyin" style="font-size:26px">${esc(q.card.pinyin)}</div><div class="ru" style="margin-top:6px">${esc(q.card.ru)}</div>`;
      if (q.t === 'type') {
        ui = `<form id="sp-input" class="inputs" autocomplete="off"><div class="field"><label>Напишите иероглиф <span class="muted">· клавиатура 中文</span></label><input class="inp" name="answer" lang="zh-CN" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="汉字"></div><button class="btn btn-primary btn-block" type="submit">Готово</button></form>`;
      } else {
        const label = o => (q.t === 'ru' ? o.ru : o.hanzi);
        ui = `<div class="opts">${q.opts.map((o, i) => {
          let cls = 'opt opt-txt';
          if (q.ok != null) { if (i === q.correct) cls += ' ok'; else if (!q.ok && i === q.givenIdx) cls += ' bad'; }
          return `<button class="${cls}" data-action="sprint-answer" data-idx="${i}" data-nosound ${q.ok != null ? 'disabled' : ''}><span class="${q.t === 'ru' ? '' : 'opt-hanzi'}">${esc(label(o))}</span></button>`;
        }).join('')}</div>`;
      }
      return head + `<div class="panel ornate qcard" style="min-height:auto">${prompt}</div>` + ui;
    },
    mount() {
      if (!sp) return;
      const q = sp.qs[sp.i];
      if (!q) return;
      if (q.t === 'audio' && q.ok == null) { Speech.say(q.card.hanzi); const ico = $('#say-ico'); if (ico) ico.onclick = () => Speech.say(q.card.hanzi); }
      const f = $('#sp-input');
      if (f) f.addEventListener('submit', e => {
        e.preventDefault();
        if (q.ok != null) return;
        const v = Quiz.normZh(f.elements.answer.value);
        if (!v) return toast('Введите иероглиф');
        q.ok = v === q.card.hanzi;
        finishQ(q);
      });
    },
  };
  window.__sprint = () => sp;   /* отладка: состояние текущего спринта */
  window.__buildSprint = id => buildSprint(P.byId(id));   /* отладка: собрать спринт без запуска */
  views['sprint-result'] = {
    render() {
      const r = state.lastSprint;
      if (!r) return '<div class="empty">Результат не найден</div>';
      const verdict = r.clean ? ['净', 'Чистый спринт', 'jade'] : r.half ? ['半', 'Половина очков', 'gold'] : ['零', 'Спринт не засчитан', 'danger'];
      return `<div class="vh"><div class="seal">检</div><div class="grow"><h1 class="title">Проверка себя</h1><div class="sub">${r.right} из ${r.total} · ошибок ${r.wrong}</div></div></div>
      <div class="panel ornate sprint-res v-${verdict[2]}"><div class="sr-seal zh">${verdict[0]}</div><div class="grow"><b>${verdict[1]}</b>
      <div class="hint" style="margin:4px 0 0">${r.clean ? `Множитель ×${r.mult.toFixed(2)} за длину и чистоту` : r.half ? 'До одной ошибки на десять — половина очков' : 'Больше одной ошибки на десять — очки не начисляются'}</div></div>
      <div class="sr-pts">${r.points > 0 ? '+' + r.points : '0'}<small>очк.</small></div></div>
      ${r.decay && r.decay.why && r.decay.why.length ? `<div class="panel"><div class="flabel">Множитель очков ×${r.decay.mult}</div><div class="hint" style="margin:0">${r.decay.why.map(esc).join(' · ')}</div></div>` : ''}
      ${r.bonus ? '<div class="panel"><b>+50</b> разовый бонус за первое чистое взятие блока</div>' : ''}
      ${r.back ? `<div class="panel"><div class="hint" style="margin:0">${fmt.plural(r.back, 'слово вернулось', 'слова вернулись', 'слов вернулось')} в ленту — повторите и проверьтесь снова.</div></div>` : ''}
      <div class="btns"><button class="btn btn-primary btn-block" data-go="feed" data-params="${attr({ id: feed ? feed.blockId : '' })}">Вернуться в ленту</button><button class="btn btn-secondary btn-block" data-go="program">К программе</button></div>`;
    },
  };
})();
