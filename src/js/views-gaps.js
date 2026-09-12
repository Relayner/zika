/* «Где тонко» на главной и «Промер дня» — экран короткой проверки.

   Обе части — только показ: считает всё gaps.js, здесь ни одной собственной оценки
   и ни одной записи в state мимо persist(). Промер — проверка, а не урок: шесть заданий,
   повторения SRS он не дублирует и очередь повторений не двигает сверх обычной попытки.

   Экран относится к тестовой методике: в текущей книге учёта он показывает объяснение
   и дорогу в настройки. */
window.GapsUI = (() => {
  const { state, views, actions, nav, esc, attr, uid, toast, persist, render, saveAttempt, fmt, LABELS } = App;

  /* Название режима для чужих экранов: список попыток и разбор берут подпись отсюда,
     и без неё промер выглядел как «probe», а заголовок разбора — как «undefined». */
  if (LABELS && LABELS.mode && !LABELS.mode.probe) LABELS.mode.probe = 'Промер дня';
  if (LABELS && LABELS.diff && !LABELS.diff.probe) LABELS.diff.probe = 'Проверка';

  const is2 = () => !!(window.Ledger && Ledger.is2(state));
  const speech = () => !!(window.Speech && Speech.available());
  const dayKey = ts => (window.Stats ? Stats.dayKey(ts) : new Date(ts).toISOString().slice(0, 10));

  /* ── тоны: таблицу знаков берём у самого Pinyin, чтобы не дублировать его правила ── */
  const BASES = ['a', 'e', 'i', 'o', 'u', 'ü'];
  const TONE_RU = ['первый ˉ ровный', 'второй ˊ восходящий', 'третий ˇ ныряющий', 'четвёртый ˋ падающий'];
  let TT = null;
  function toneTables() {
    if (TT) return TT;
    TT = { mark: {}, of: {} };
    for (const b of BASES) {
      TT.mark[b] = [b];
      for (let t = 1; t <= 4; t++) { const ch = Pinyin.toMarks(b + t); TT.mark[b].push(ch); TT.of[ch] = [b, t]; }
    }
    return TT;
  }
  /* Позиции размеченных тоном гласных в записи пиньиня */
  function toneSpots(py) {
    const T = toneTables(), s = String(py || ''), out = [];
    for (let i = 0; i < s.length; i++) if (T.of[s[i]]) out.push(i);
    return out;
  }

  /* ── панель главной ── */
  const ZH_OF = { review: '复', drill: '练', sprint: '学', phon: '音', hand: '手', boss: '斗', probe: '测' };

  function probeDone(st = state, now = Date.now()) {
    const key = dayKey(now);
    return ((st || {}).attempts || []).some(a => a && a.mode === 'probe' && !a.aborted && a.ts && dayKey(a.ts) === key);
  }

  /* Промер — первый шаг дня, пока он не сделан; сделан — из списка уходит */
  function daySteps() {
    let steps = [];
    try { steps = (Gaps.recommend(state) || []).slice(); } catch (e) { steps = []; }
    if (probeDone()) return steps.filter(s => s.t !== 'probe').slice(0, 3);
    const i = steps.findIndex(s => s.t === 'probe');
    if (i > 0) { const [p] = steps.splice(i, 1); steps.unshift(p); }
    else if (i < 0) {
      let picks = [];
      try { picks = Gaps.probe(state) || []; } catch (e) { picks = []; }
      if (picks.length) steps.unshift({ zone: 'probe', t: 'probe', ru: 'Промер дня',
        why: fmt.plural(picks.length, 'задание', 'задания', 'заданий') + ' на проверку, около четырёх минут', go: { t: 'probe' } });
    }
    return steps.slice(0, 3);
  }

  const stepRow = s => `<button class="row gp-step" data-action="gaps-step" data-step="${attr(s.go)}">
    <div><div class="row-t"><span class="zh">${ZH_OF[s.t] || '字'}</span> ${esc(s.ru)}</div><div class="row-s">${esc(s.why)}</div></div>
    <div class="row-r"><span class="chev">›</span></div></button>`;

  function homePanel() {
    if (!window.Gaps || !is2()) return '';
    let zones = [];
    try { zones = Gaps.thin(state) || []; } catch (e) { return ''; }
    const z = zones.find(r => r.n) || null;
    /* λ меньше половины — данных на зону ещё не набралось, и называть её нечестно */
    const solid = !!(z && z.lam >= 0.5);
    const head = solid
      ? `<div class="gp-zone">${esc(z.ru)}</div><div class="hint gp-why">${esc(z.why)}</div>`
      : `<div class="gp-zone gp-dim">Пока не видно</div><div class="hint gp-why">данных пока мало — позанимайтесь пару дней, и зона появится</div>`;
    const steps = daySteps();
    const rows = steps.map(stepRow).join('');
    return `<div class="panel ornate gaps-panel">
      <div class="flabel">Где тонко</div>
      ${head}
      ${rows ? `<div class="flabel mt">Что сделать сегодня</div><div class="gp-steps">${rows}</div>` : ''}
      ${probeDone() ? '<div class="hint gp-done">Промер дня сегодня сделан</div>' : ''}
    </div>`;
  }

  /* Переход по шагу: те же двери, что и у потока */
  function runStep(go) {
    if (!go || !go.t) return nav('setup');
    if (go.t === 'probe') return nav('probe');
    if (go.t === 'review') {
      if (window.SRS && !SRS.dueCount(state)) return toast('Повторять уже нечего — всё свежее');
      return App.startReview();
    }
    if (go.t === 'sprint' && actions['prog-open']) return actions['prog-open']({ dataset: { id: go.blockId } });
    if (go.t === 'phon' && actions['phon-open']) return actions['phon-open']({ dataset: { id: go.lessonId } });
    if (go.t === 'hand') { state.settings.handLevel = go.lvl || 1; persist(); return nav('hand'); }
    if (go.t === 'boss') return nav('boss');
    if (go.t === 'drill' && App.trainDeck) return App.trainDeck(go.deck, go.mode);
    return nav('setup');
  }
  actions['gaps-step'] = el => {
    let go = null;
    try { go = JSON.parse(el.dataset.step || 'null'); } catch (e) { go = null; }
    runStep(go);
  };

  /* ── промер дня ── */
  let pb = null;        /* { qs, i, shown, startedAt, qAt } */
  let again = false;    /* второй промер за день — только по прямой просьбе */

  function poolFor(card) {
    const deck = card.deckId || String(card.id || '').split(':')[0];
    let pool = [];
    try { pool = App.cardsOfDeck(deck) || []; } catch (e) { pool = []; }
    return pool.length >= 8 ? pool : App.hskCards;
  }
  /* Варианты по одной части карточки: без повторов значения, правильный внутри */
  function cardOpts(card, part, n) {
    const key = c => String(c[part] || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const seen = new Set([key(card)]);
    const picked = [];
    for (const c of Quiz.shuffle(poolFor(card).slice())) {
      if (c.id === card.id || !c[part]) continue;
      const k = key(c);
      if (seen.has(k)) continue;
      seen.add(k); picked.push(c);
      if (picked.length >= n - 1) break;
    }
    if (!picked.length) return null;
    const list = Quiz.shuffle([card, ...picked]);
    const correct = list.indexOf(card);
    return { opts: list.map(c => ({ hanzi: c.hanzi, pinyin: c.pinyin, ru: c.ru })), correct };
  }

  function qRecall(card) {
    const o = cardOpts(card, 'ru', 4);
    if (!o) return null;
    return { kind: 'recall', show: 'hanzi', guess: ['ru'], part: 'ru', prompt: 'Что это значит?', opts: o.opts, correct: o.correct };
  }
  function qListen(card) {
    const o = cardOpts(card, 'hanzi', 4);
    if (!o) return null;
    return { kind: 'listen', show: 'audio', guess: ['answer'], part: 'zh', prompt: 'Что прозвучало?', opts: o.opts, correct: o.correct };
  }
  function qTone(card) {
    const T = toneTables();
    const spots = toneSpots(card.pinyin);
    if (!spots.length) return null;
    const i = spots[0];
    const pair = T.of[card.pinyin[i]];
    const base = pair[0], tone = pair[1];
    const opts = [1, 2, 3, 4].map(t => ({ pinyin: card.pinyin.slice(0, i) + T.mark[base][t] + card.pinyin.slice(i + 1), tone: t }));
    return { kind: 'tone', show: 'hanzi', guess: ['pinyin'], part: 'tone',
      prompt: spots.length > 1 ? 'Какой тон у первого слога?' : 'Какой тон у этого слова?',
      opts, correct: tone - 1 };
  }

  /* Шесть заданий из Gaps.probe: если голоса нет или тон не размечен — задание честно
     становится обычным узнаванием, а не пропадает */
  function buildQuestions() {
    let picks = [];
    try { picks = (Gaps.probe(state) || []).slice(0, 6); } catch (e) { picks = []; }
    const out = [];
    for (const p of picks) {
      const card = App.cardIndex[p.cardId];
      if (!card || !card.hanzi) continue;
      let sub = p.sub;
      if (sub === 'listen' && !speech()) sub = 'recall';
      if (sub === 'tone' && !toneSpots(card.pinyin).length) sub = 'recall';
      const q = sub === 'listen' ? qListen(card) : sub === 'tone' ? qTone(card) : qRecall(card);
      if (!q) continue;
      q.cardId = card.id; q.card = card; q.sub = sub; q.cls = p.cls; q.why = p.why;
      out.push(q);
    }
    return out;
  }

  const optHtml = (q, o) => {
    if (q.kind === 'recall') return `<span class="opt-ru">${esc(o.ru)}</span>`;
    if (q.kind === 'listen') return `<span class="opt-hanzi">${esc(o.hanzi)}</span> <span class="opt-pinyin">${esc(o.pinyin)}</span>`;
    return `<span class="opt-pinyin">${esc(o.pinyin)}</span> <span class="opt-ru">${esc(TONE_RU[o.tone - 1])}</span>`;
  };

  /* Разбор: что было, что выбрали, и почему это слово вообще спросили */
  function review(q) {
    const c = q.card;
    const chosen = q.opts[q.given];
    const lines = [];
    if (q.kind === 'tone') {
      const right = TONE_RU[q.correct];
      const got = chosen && TONE_RU[chosen.tone - 1];
      lines.push(q.ok ? 'Тон здесь ' + right + '.' : 'Здесь ' + right + (got ? ', а выбран ' + got : '') + '.');
    } else if (q.kind === 'listen') {
      lines.push(q.ok ? 'Услышано верно.' : 'Прозвучало ' + c.hanzi + ' ' + c.pinyin + ', а выбрано ' + (chosen ? chosen.hanzi + ' ' + chosen.pinyin : '—') + '.');
    } else {
      lines.push(q.ok ? 'Верно.' : 'Это «' + c.ru + '», а выбрано «' + (chosen ? chosen.ru : '—') + '».');
    }
    return `<div class="panel pb-fb ${q.ok ? 'ok' : 'bad'}">
      <div class="row-t">${q.ok ? '对 верно' : '错 мимо'}</div>
      <div class="pb-card"><span class="zh">${esc(c.hanzi)}</span> <span class="pinyin">${esc(c.pinyin)}</span> — ${esc(c.ru)}</div>
      <div class="hint">${esc(lines.join(' '))}</div>
      <div class="hint">Почему спросили: ${esc(q.why || '—')}</div>
      <div class="btns mt0">
        ${speech() ? '<button class="btn btn-secondary btn-sm" data-action="probe-say" data-nosound>Послушать</button>' : ''}
        <button class="btn btn-primary btn-block" data-action="probe-next">${pb.i + 1 >= pb.qs.length ? 'Итог' : 'Дальше'}</button>
      </div></div>`;
  }

  const backBtns = '<div class="btns"><button class="btn btn-secondary btn-block" data-go="home">На главную</button></div>';

  const v1Panel = () => `<div class="vh"><button class="icon-btn" data-back>‹</button><div class="grow"><h1 class="title">Промер дня</h1><div class="sub">测 · короткая проверка</div></div></div>
    <div class="panel"><div class="flabel">Это часть тестовой методики</div>
      <div class="hint">Промер дня и «Где тонко» считаются по тестовой книге учёта. Сейчас открыта текущая.</div>
      <div class="btns mt0"><button class="btn btn-primary btn-block" data-go="settings">В настройки</button></div></div>`;

  function doneTodayPanel() {
    const key = dayKey(Date.now());
    const a = (state.attempts || []).filter(x => x && x.mode === 'probe' && !x.aborted && x.ts && dayKey(x.ts) === key).pop();
    return `<div class="vh"><button class="icon-btn" data-back>‹</button><div class="grow"><h1 class="title">Промер дня</h1><div class="sub">测 · сегодня уже сделан</div></div></div>
      <div class="panel"><div class="flabel">Сегодня промер пройден</div>
      <div class="hint">${a ? 'Верных ' + a.correct + ' из ' + a.total + '.' : ''} Промер — проверка, а не тренировка: второй раз за день он мало что покажет.</div>
      <div class="btns mt0">${a ? `<button class="btn btn-secondary btn-block" data-go="probe-result" data-params="${attr({ id: a.id })}">Посмотреть итог</button>` : ''}
        <button class="btn btn-primary btn-block" data-action="flow-open" data-nosound>В поток</button>
        <button class="btn btn-secondary btn-block" data-action="probe-again">Всё равно пройти ещё раз</button>
        <button class="btn btn-secondary btn-block" data-go="home">На главную</button></div></div>`;
  }

  views.probe = {
    render() {
      if (!window.Gaps || !window.Quiz) return '<div class="empty">Промер пока недоступен</div>' + backBtns;
      if (!is2()) return v1Panel();
      if (!pb) {
        if (probeDone() && !again) return doneTodayPanel();
        const qs = buildQuestions();
        if (!qs.length) return `<div class="vh"><button class="icon-btn" data-back>‹</button><div class="grow"><h1 class="title">Промер дня</h1><div class="sub">测</div></div></div>
          <div class="panel"><div class="flabel">Промер не собрался</div><div class="hint">Слов в обороте пока нет — начните со звучания и первого блока, промер появится сам.</div>
          <div class="btns mt0"><button class="btn btn-primary btn-block" data-go="phon">Звучание</button><button class="btn btn-secondary btn-block" data-go="home">На главную</button></div></div>`;
        pb = { qs, i: 0, shown: false, startedAt: Date.now(), qAt: Date.now() };
      }
      if (pb.i >= pb.qs.length) return '<div class="empty">Промер завершён</div>' + backBtns;
      const q = pb.qs[pb.i];
      const head = `<div class="qbar"><button class="btn btn-secondary btn-sm" data-action="probe-quit">✕</button>
        <div class="progress"><i style="width:${Math.round(pb.i / pb.qs.length * 100)}%"></i></div>
        <div class="qcount">${pb.i + 1}/${pb.qs.length}</div></div>`;
      const card = q.kind === 'listen'
        ? `<div class="panel ornate pb-q"><div class="flabel">${esc(q.prompt)}</div>
            <button class="say-btn" data-action="probe-say" data-nosound aria-label="Повторить">🔊</button>
            <div class="hint" style="text-align:center;margin-top:8px">нажмите, чтобы услышать ещё раз</div></div>`
        : `<div class="panel ornate pb-q"><div class="flabel">${esc(q.prompt)}</div>
            <div class="hanzi">${esc(q.card.hanzi)}</div>
            ${q.kind === 'tone' ? `<div class="muted pb-ru">${esc(q.card.ru)}</div>` : ''}</div>`;
      const opts = `<div class="opts">${q.opts.map((o, i) => {
        let cls = 'opt';
        if (pb.shown) { if (i === q.correct) cls += ' correct'; else if (i === q.given) cls += ' wrong'; }
        return `<button class="${cls}" data-action="probe-answer" data-idx="${i}" ${pb.shown ? 'disabled' : ''} data-nosound>${optHtml(q, o)}</button>`;
      }).join('')}</div>`;
      return head + card + opts + (pb.shown ? review(q) : '');
    },
    mount() {
      if (!pb || pb.shown) return;
      const q = pb.qs[pb.i];
      if (q && q.kind === 'listen' && !q.said && speech()) { q.said = true; setTimeout(() => Speech.say(q.card.hanzi), 350); }
    },
  };

  actions['probe-again'] = () => { again = true; pb = null; render(); };
  actions['probe-say'] = () => { const q = pb && pb.qs[pb.i]; if (q && speech()) Speech.say(q.card.hanzi); };
  actions['probe-quit'] = () => { pb = null; again = false; nav('home', {}, { replace: true }); };
  actions['probe-answer'] = el => {
    if (!pb || pb.shown) return;
    const q = pb.qs[pb.i];
    const idx = +el.dataset.idx;
    q.given = idx;
    q.ok = idx === q.correct;
    q.ms = Math.max(0, Date.now() - (pb.qAt || Date.now()));
    if (window.Sound) { if (q.ok) Sound.ok(); else Sound.fail(); }
    pb.shown = true;
    render();
  };
  actions['probe-next'] = () => {
    if (!pb || !pb.shown) return;
    pb.i++; pb.shown = false; pb.qAt = Date.now();
    if (pb.i >= pb.qs.length) return finish();
    render();
  };

  /* Части ответа — в том же словаре, что у квиза: тогда попытка читается всеми модулями.
     Промах по тону помечаем как 'wrong', а не 'tones': 'tones' у нас означает «ответили наугад»,
     а здесь тон спрашивали намеренно. */
  function partsOf(q) {
    const v = q.ok ? 'exact' : 'wrong';
    if (q.kind === 'listen') return { answer: v };
    if (q.kind === 'tone') return { pinyin: v };
    return { ru: v };
  }

  function finish() {
    const qs = (pb || {}).qs || [];
    if (!qs.length) { pb = null; again = false; return nav('home', {}, { replace: true }); }
    const now = Date.now();
    const correct = qs.filter(q => q.ok).length;
    const total = qs.length;
    const a = {
      id: uid(), ts: pb.startedAt, endedAt: now, durationMs: now - pb.startedAt,
      mode: 'probe', difficulty: 'probe', level: 1,
      deckIds: [...new Set(qs.map(q => q.card.deckId).filter(Boolean))],
      deckName: 'слова в обороте', show: 'mixed', guess: ['all'], order: 'random', timer: 0,
      total, planned: total, aborted: false,
      correct, partial: 0, wrong: total - correct,
      percent: Math.round(correct / total * 100),
      questions: qs.map(q => ({
        cardId: q.cardId, hanzi: q.card.hanzi, pinyin: q.card.pinyin, ru: q.card.ru,
        show: q.show, guess: q.guess, answer: { choice: q.given },
        parts: partsOf(q), fraction: q.ok ? 1 : 0, ok: !!q.ok, ms: q.ms || 0,
        sub: q.sub, cls: q.cls,
      })),
    };
    pb = null; again = false;
    saveAttempt(a).then(() => {
      if (window.Sound) Sound.finish(a.percent >= 60);
      nav('probe-result', { id: a.id }, { replace: true });
    });
  }

  /* ── итог ── */
  /* Очки считает открытая книга учёта: у тестовой это a.p2, и именно её число видит день похода */
  const pointsOf = a => (window.Ledger && Ledger.ptsOf ? Ledger.ptsOf(a) : (a.points != null ? a.points : 0));
  const SUB_RU = { recall: 'узнавание', listen: 'на слух', tone: 'тон' };

  views['probe-result'] = {
    render(p) {
      const a = (state.attempts || []).find(x => x.id === ((p || {}).id));
      if (!a) return '<div class="empty">Результата нет</div>' + backBtns;
      const qs = a.questions || [];
      const by = {};
      for (const q of qs) { const k = q.sub || 'recall'; const c = by[k] || (by[k] = { n: 0, ok: 0 }); c.n++; if (q.ok) c.ok++; }
      const weak = Object.keys(by).filter(k => by[k].ok < by[k].n).map(k => (SUB_RU[k] || k) + ' — верных ' + by[k].ok + ' из ' + by[k].n);
      const missed = qs.filter(q => !q.ok);
      return `<div class="vh"><div class="seal">测</div><div class="grow"><h1 class="title">Промер дня</h1><div class="sub">${a.correct} из ${a.total}</div></div></div>
      <div class="panel ornate">
        <div class="big-score">${a.percent}<small>%</small></div>
        <div class="fb-row"><span class="fb-p">Очков</span><span class="fb-v"><b>+${Math.round(pointsOf(a))}</b></span></div>
        <div class="hint" style="margin:6px 0 0">${weak.length ? 'Просело: ' + esc(weak.join(' · ')) : 'Всё верно — сегодня ничего не просело'}</div>
      </div>
      ${missed.length ? `<div class="panel"><div class="flabel">Слова, которые не дались</div>
        ${missed.map(q => `<div class="row pb-miss"><div><div class="row-t"><span class="zh">${esc(q.hanzi)}</span> <span class="pinyin">${esc(q.pinyin)}</span></div><div class="row-s">${esc(q.ru)}</div></div>
          <div class="row-r"><span class="badge bad">${esc(SUB_RU[q.sub] || 'вопрос')}</span></div></div>`).join('')}
        <div class="hint">Повторений это не заменяет — слова вернутся в свой срок.</div></div>` : ''}
      <div class="btns">
        <button class="btn btn-primary btn-block" data-action="flow-open" data-nosound>В поток</button>
        <button class="btn btn-secondary btn-block" data-go="home">На главную</button></div>`;
    },
  };

  return { homePanel, probeDone, daySteps, runStep };
})();
