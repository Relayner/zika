/* «Съёмка местности»: экраны входного теста — обзор частей, прохождение и итог.

   Здесь только показ и ход: что спрашивать, как считать полосу и где точка старта —
   решает survey.js. Собственной оценки ответа на этом экране нет, вердикт выносит
   Survey.judge, а грамматику — GRAMMAR.check внутри него.

   Часть платит фиксированно, ровно один дневной переход (Survey.payFor → Campaign.capFor),
   попытка идёт с fixedPts: true: она не проходит деградацию и не помечает материал виденным.

   Экран принадлежит тестовой методике: в текущей книге учёта он показывает, где её включить. */
window.SurveyUI = (() => {
  const { state, views, actions, nav, esc, attr, uid, $, toast, render, saveAttempt, fmt, LABELS } = App;

  /* Без этой подписи в списке попыток и в разборе стояло бы латинское «survey» */
  if (LABELS && LABELS.mode && !LABELS.mode.survey) LABELS.mode.survey = 'Съёмка местности';
  if (LABELS && LABELS.diff && !LABELS.diff.survey) LABELS.diff.survey = 'Съёмка';

  const is2 = () => !!(window.Ledger && Ledger.is2(state));
  const speech = () => !!(window.Speech && Speech.available());
  const SEAL = '测';

  let run = null;     /* заход: { part, plan, qs, i, shown, draft, startedAt, qAt, lad } */

  /* ── общие куски ── */
  const head = (title, sub, back = true) => `<div class="vh">${back ? '<button class="icon-btn" data-back>‹</button>' : `<div class="seal">${SEAL}</div>`}
    <div class="grow"><h1 class="title">${esc(title)}</h1><div class="sub">${sub}</div></div></div>`;
  const backBtns = '<div class="btns"><button class="btn btn-secondary btn-block" data-go="home">На главную</button></div>';

  const stub = () => head('Съёмка местности', '测绘 · входной тест') + `<div class="panel">
    <div class="flabel">Это часть тестовой методики</div>
    <div class="hint">Входной тест считается по тестовой книге учёта. Сейчас открыта текущая — её можно переключить в настройках, прогресс при этом сохранится.</div>
    <div class="btns mt0"><button class="btn btn-primary btn-block" data-go="settings">В настройки</button></div></div>`;

  /* ── обзор частей ── */
  const STATUS = { done: 'пройдена', next: 'следующая', wait: 'ждёт' };
  function partRow(p, st) {
    const r = st.parts[p.n];
    const cls = r ? 'done' : (st.next === p.n ? 'next' : 'wait');
    const line = r
      ? 'верных ' + r.correct + ' из ' + r.total + ' · ' + fmt.date(r.at)
      : fmt.plural(p.count, 'задание', 'задания', 'заданий') + ' · около ' + p.min + ' минут';
    return `<div class="row sv-part ${cls}">
      <div><div class="row-t"><span class="zh">${esc(p.zh)}</span> ${esc(p.ru)}</div>
        <div class="row-s">${esc(p.sub)} — ${esc(line)}</div></div>
      <div class="row-r">${r
        ? `<span class="badge ${App.accClass(r.percent)}">${r.percent}%</span>`
        : `<button class="btn ${cls === 'next' ? 'btn-primary' : 'btn-secondary'} btn-sm" data-go="survey-run" data-params="${attr({ part: p.n })}">Пройти</button>`}</div></div>`;
  }

  views.survey = {
    render() {
      if (!window.Survey) return '<div class="empty">Съёмка пока недоступна</div>' + backBtns;
      if (!is2()) return stub();
      const st = Survey.state(state);
      const rows = Survey.PARTS.map(p => partRow(p, st)).join('');
      const next = st.next ? Survey.partOf(st.next) : null;
      const pay = Survey.payFor(window.Ledger ? Ledger.campaign(state) : state.campaign);
      return head('Съёмка местности', '测绘 · входной тест') + `
      <div class="panel ornate">
        <div class="flabel">Зачем</div>
        <div class="hint">Уровень здесь набирается работой, поэтому тот, кто уже знает язык, начинает с первого блока HSK 1. Съёмка даёт точку старта заранее: полосу по каждому уровню, первый блок, где посыпалось, и пять белых пятен.</div>
        <div class="hint">Три части по очереди, ${Survey.PARTS.map(p => p.min).join('–')} минут каждая. Между частями можно уйти и вернуться: пройденное не пропадает.</div>
      </div>
      <div class="panel"><div class="flabel">Части</div>${rows}
        <div class="hint">Часть платит фиксированно — ${fmt.plural(Math.round(pay), 'очко', 'очка', 'очков')}, ровно один дневной переход. Съёмка не заменяет занятий и не двигает повторения по самооценке.</div></div>
      ${next ? `<div class="panel"><div class="flabel">Дальше</div><div class="hint">${esc(next.about)}</div>
        <div class="btns mt0"><button class="btn btn-primary btn-block" data-go="survey-run" data-params="${attr({ part: next.n })}">Часть ${next.n} · ${esc(next.ru)}</button></div></div>` : ''}
      ${st.done.length ? `<div class="btns"><button class="btn ${st.complete ? 'btn-primary' : 'btn-secondary'} btn-block" data-go="survey-result">${st.complete ? 'Итог съёмки' : 'Что уже видно'}</button>
        <button class="btn btn-secondary btn-block" data-go="home">На главную</button></div>` : backBtns}`;
    },
  };

  /* ── ход части ──
     Части 1 и 3 идут подряд. Часть 2 — лестница: шесть заданий на ступень, дальше решает
     правило Survey.rung, а слот «б» того же уровня служит добором. */
  const rungTasks = (plan, lvl, slot) => plan.filter(t => t.band === lvl && t.slot === slot);

  function startRun(part) {
    const plan = Survey.build(state, part);
    const now = Date.now();
    run = { part, plan, qs: [], i: 0, shown: false, draft: '', startedAt: now, qAt: now, lad: null };
    if (part === 2) {
      run.lad = { lvl: startLevel(), visited: {}, base: 0, stage: 6 };
      pushRung(run.lad.lvl, 'a');
    } else run.qs = plan.slice();
    return run;
  }
  /* С какой ступени начинать: полоса скринера, иначе рабочий уровень */
  function startLevel() {
    const st = Survey.state(state);
    const p1 = st.parts[1];
    if (p1) {
      const a = (state.attempts || []).find(x => x.id === p1.id);
      if (a) {
        const g = Survey.grade(1, (a.questions || []).map(q => ({ task: { kind: q.kind, sub: q.sub, group: q.group, band: q.band, pseudo: q.pseudo, key: q.key }, given: q.given })));
        if (g.band) return Math.max(1, Math.min(4, g.band));
      }
    }
    try { return Math.max(1, Math.min(4, Boss.levelOf(state))); } catch (e) { return 1; }
  }
  function pushRung(lvl, slot, n) {
    const list = rungTasks(run.plan, lvl, slot).filter(t => run.qs.indexOf(t) < 0);
    const take = n ? list.slice(0, n) : list;
    if (!take.length) return false;
    run.qs.push(...take);
    run.lad.lvl = lvl;
    run.lad.visited[lvl] = (run.lad.visited[lvl] || 0) + 1;
    return true;
  }
  /* Ступень пройдена — куда дальше. Возвращает false, если лестница кончилась. */
  function ladderNext() {
    const l = run.lad;
    const asked = run.qs.slice(l.base);
    const right = asked.filter(q => q.ok).length;
    const verdict = Survey.rung(right, asked.length);
    if (verdict === 'wait') return true;
    if (verdict === 'more') {
      if (pushRung(l.lvl, 'b', Survey.MORE)) return true;
    } else if (verdict === 'up') {
      const n = l.lvl + 1;
      if (n <= 4 && !l.visited[n] && pushRung(n, 'a')) { l.base = run.qs.length - Survey.RUNG; return true; }
    } else if (verdict === 'down') {
      const n = l.lvl - 1;
      if (n >= 1 && !l.visited[n] && pushRung(n, 'a')) { l.base = run.qs.length - Survey.RUNG; return true; }
    }
    return false;
  }

  /* ── разметка задания ── */
  const RU_OPTS = { hz2ru: 1, tone: 1, know: 1 };   /* варианты словами, а не иероглифами */
  const optText = (q, o) => (RU_OPTS[q.kind] ? `<span class="opt-ru">${esc(o)}</span>` : `<span class="opt-hanzi">${esc(o)}</span>`);
  function askHtml(q) {
    if (q.kind === 'listen') {
      return `<div class="panel ornate sv-q"><div class="flabel">${esc(q.prompt)}</div>
        <button class="say-btn" data-action="sv-say" data-nosound aria-label="Повторить">🔊</button>
        <div class="hint" style="text-align:center;margin-top:8px">${q.rate < 1 ? 'замедленный темп' : 'обычный темп'}${speech() ? ' · нажмите, чтобы услышать ещё раз' : ' · голоса нет, показана запись'}</div>
        ${speech() ? '' : `<div class="pinyin big">${esc(q.pinyin)}</div>`}</div>`;
    }
    if (q.kind === 'gram') {
      const s = String(q.show || '');
      const parts = s.split(/_+/);
      return `<div class="panel ornate sv-q"><div class="flabel">${esc(q.prompt)}</div>
        <div class="sv-stem">${esc(parts[0])}${parts.length > 1 ? '<b class="sv-gap">▢</b>' : ''}${esc(parts.slice(1).join(''))}</div></div>`;
    }
    if (q.kind === 'set') {
      return `<div class="panel ornate sv-q"><div class="flabel">${esc(q.prompt)}</div>
        <div class="sv-ask">${esc(q.ru)}</div><div class="pinyin">${esc(q.pinyin)}</div>
        <div class="sv-draft">${run.shown ? esc(q.mine || '') : (run.draft ? esc(run.draft) : '<i>соберите слово</i>')}</div></div>`;
    }
    const big = q.kind === 'py2hz' ? `<div class="pinyin big">${esc(q.show)}</div>`
      : q.kind === 'ru2hz' ? `<div class="sv-ask">${esc(q.show)}</div>`
        : `<div class="hanzi">${esc(q.show)}</div>`;
    return `<div class="panel ornate sv-q"><div class="flabel">${esc(q.prompt)}</div>${big}
      ${q.kind === 'know' ? '<div class="hint" style="text-align:center;margin:8px 0 0">честный ответ полезнее красивого: проверка идёт и по несуществующим словам</div>' : ''}</div>`;
  }
  function bodyHtml(q) {
    if (q.kind === 'set') {
      const d = run.shown ? ' disabled' : '';
      const toks = (q.tokens || []).map((c, i) => `<button class="opt sv-tok" data-action="sv-tok" data-c="${esc(c)}" data-i="${i}" data-nosound${d}>${esc(c)}</button>`).join('');
      return `<div class="opts sv-toks">${toks}</div>
        <div class="btns row2 mt0"><button class="btn btn-secondary" data-action="sv-undo" data-nosound${d}>Стереть</button>
        <button class="btn btn-primary" data-action="sv-done" data-nosound${d}>Готово</button></div>`;
    }
    return `<div class="opts">${(q.options || []).map((o, i) => {
      let cls = 'opt';
      if (run.shown) { if (Survey.norm(o) === Survey.norm(q.key)) cls += ' correct'; else if (i === q.given) cls += ' wrong'; }
      return `<button class="${cls}" data-action="sv-answer" data-idx="${i}" ${run.shown ? 'disabled' : ''} data-nosound>${optText(q, o)}</button>`;
    }).join('')}</div>`;
  }
  function feedback(q) {
    const lines = [];
    if (q.kind === 'gram') lines.push(q.ok ? 'Верно.' : 'Здесь нужно ' + q.key + '.' + (q.why ? ' ' + q.why : ''));
    else if (q.kind === 'tone') lines.push(q.ok ? 'Тон верный.' : 'Здесь ' + q.key + ', а выбран ' + (q.mine || '—') + '.');
    else if (q.kind === 'know') lines.push('Такого слова нет — это сочетание знаков, которого нет в банке.');
    else lines.push(q.ok ? 'Верно.' : 'Верный ответ: ' + q.key + (q.mine ? ', а дан «' + q.mine + '»' : '') + '.');
    const card = q.hanzi && !q.pseudo ? `<div class="sv-card"><span class="zh">${esc(q.hanzi)}</span> <span class="pinyin">${esc(q.pinyin)}</span> — ${esc(q.ru)}</div>` : '';
    return `<div class="panel sv-fb ${q.ok ? 'ok' : 'bad'}"><div class="row-t">${q.ok ? '对 верно' : '错 мимо'}</div>
      ${card}<div class="hint">${esc(lines.join(' '))}</div>
      <div class="btns mt0">${speech() && q.hanzi && !q.pseudo ? '<button class="btn btn-secondary btn-sm" data-action="sv-say" data-nosound>Послушать</button>' : ''}
        <button class="btn btn-primary btn-block" data-action="sv-next">${run.i + 1 >= run.qs.length && !more() ? 'Итог части' : 'Дальше'}</button></div></div>`;
  }
  const more = () => !!(run && run.part === 2 && run.i + 1 >= run.qs.length && run.qs.length < Survey.COUNT[2]);

  views['survey-run'] = {
    render(p) {
      if (!window.Survey) return '<div class="empty">Съёмка пока недоступна</div>' + backBtns;
      if (!is2()) return stub();
      const part = Math.max(1, Math.min(3, +((p || {}).part) || 1));
      if (!run || run.part !== part) startRun(part);
      if (!run.qs.length) return head('Часть ' + part, '测绘') + '<div class="panel"><div class="flabel">Часть не собралась</div><div class="hint">Словари ещё не загрузились. Попробуйте открыть экран заново.</div></div>' + backBtns;
      const q = run.qs[run.i];
      const pi = Survey.partOf(part);
      const bar = `<div class="qbar"><button class="btn btn-secondary btn-sm" data-action="sv-quit">✕</button>
        <div class="progress"><i style="width:${Math.round(run.i / Math.max(1, run.qs.length) * 100)}%"></i></div>
        <div class="qcount">${run.i + 1}/${run.qs.length}</div></div>`;
      const tag = `<div class="hint sv-tag">${esc(pi.ru)} · ${esc((Survey.SUBS[q.sub] || {}).ru || q.sub)}${q.blockId && window.PROGRAM && PROGRAM.byId(q.blockId) ? ' · блок «' + esc(PROGRAM.byId(q.blockId).ru) + '»' : ''}</div>`;
      /* Варианты остаются на экране и после ответа: видно, что выбрано и что было верно */
      return bar + tag + askHtml(q) + bodyHtml(q) + (run.shown ? feedback(q) : '');
    },
    mount() {
      if (!run || run.shown) return;
      const q = run.qs[run.i];
      if (q && q.kind === 'listen' && !q.said && speech()) { q.said = true; setTimeout(() => Speech.say(q.hanzi, { rate: q.rate, pitch: 1 }), 350); }
    },
  };

  actions['sv-say'] = () => {
    const q = run && run.qs[run.i];
    if (q && speech()) Speech.say(q.hanzi || q.word, { rate: q.rate || 0.85, pitch: 1 });
  };
  actions['sv-quit'] = () => { run = null; nav('survey', {}, { replace: true }); };
  actions['sv-tok'] = el => { if (!run || run.shown) return; run.draft = (run.draft || '') + el.dataset.c; render(); };
  actions['sv-undo'] = () => { if (!run || run.shown) return; run.draft = (run.draft || '').slice(0, -1); render(); };
  actions['sv-done'] = () => { if (run && !run.shown) accept(run.draft || ''); };
  actions['sv-answer'] = el => {
    if (!run || run.shown) return;
    const q = run.qs[run.i];
    const idx = +el.dataset.idx;
    q.given = idx;
    accept((q.options || [])[idx]);
  };
  /* Ответ принят: вердикт выносит Survey.judge, экран его только показывает */
  function accept(given) {
    const q = run.qs[run.i];
    const j = Survey.judge(q, given);
    q.mine = j.mine; q.ok = j.ok; q.fraction = j.fraction; q.scored = j.scored; q.yes = j.yes;
    q.ms = Math.max(0, Date.now() - (run.qAt || Date.now()));
    run.draft = '';
    if (window.Sound) { if (j.ok) Sound.ok(); else if (j.ok === false) Sound.fail(); else Sound.click(); }
    /* самооценка настоящего слова — не верно и не мимо: разбирать нечего, идём дальше */
    if (!j.scored) return step();
    run.shown = true;
    render();
  }
  function step() {
    run.shown = false;
    run.draft = '';
    run.qAt = Date.now();
    if (run.i + 1 < run.qs.length) { run.i++; return render(); }
    if (run.part === 2 && run.qs.length < Survey.COUNT[2] && ladderNext() && run.i + 1 < run.qs.length) { run.i++; return render(); }
    return finish();
  }
  actions['sv-next'] = () => { if (run && run.shown) step(); };

  /* ── сохранение части ── */
  function finish() {
    const r = run;
    if (!r || !r.qs.length) { run = null; return nav('survey', {}, { replace: true }); }
    const now = Date.now();
    const qs = r.qs.filter(q => q.mine !== undefined);
    const questions = qs.map(q => ({
      kind: q.kind, sub: q.sub, band: q.band, part: r.part, id: q.id, group: q.group,
      /* самооценка карточку не трогает: без cardId повторения по ней не заводятся */
      cardId: q.self ? undefined : q.cardId,
      blockId: q.blockId, rung: q.rung, rate: q.rate, pseudo: !!q.pseudo, word: q.word,
      hanzi: q.self ? '' : (q.hanzi || ''), pinyin: q.self ? '' : (q.pinyin || ''),
      ru: q.self ? 'самооценка: ' + (q.word || q.hanzi || '') : (q.ru || ''),
      show: q.show || '', why: q.why || '', key: q.key == null ? null : String(q.key),
      given: q.mine == null ? '' : String(q.mine), ok: q.ok == null ? null : !!q.ok,
      fraction: q.fraction, scored: !!q.scored, yes: !!q.yes, ms: q.ms || 0,
      answer: { choice: q.given == null ? -1 : q.given, choiceText: q.mine == null ? '' : String(q.mine) },
    }));
    const scored = questions.filter(q => q.scored);
    const correct = scored.filter(q => q.ok).length;
    const c1 = (state.books && state.books.v1) || state.campaignV1 || state.campaign;
    const c2 = window.Ledger ? Ledger.campaign(state, 'v2') : state.campaign;
    const a = {
      id: uid(), ts: r.startedAt, endedAt: now, durationMs: now - r.startedAt,
      mode: 'survey', part: r.part, difficulty: 'survey', level: 1,
      deckIds: [...new Set(qs.map(q => (q.cardId ? String(q.cardId).split(':')[0] : null)).filter(Boolean))],
      deckName: 'съёмка местности', show: 'mixed', guess: ['all'], order: 'fixed', timer: 0,
      total: scored.length, planned: questions.length, aborted: false,
      correct, partial: 0, wrong: scored.length - correct,
      percent: scored.length ? Math.round(correct / scored.length * 100) : 0,
      /* цену назначает режим: ровно один дневной переход в каждой книге учёта */
      fixedPts: true, points: Survey.payFor(c1), p2fix: Survey.payFor(c2),
      questions,
    };
    run = null;
    saveAttempt(a).then(() => {
      if (window.Sound) Sound.finish(a.percent >= 50);
      nav('survey-result', { part: a.part }, { replace: true });
    });
  }

  /* ── итог ── */
  const pointsOf = a => (window.Ledger && Ledger.ptsOf ? Ledger.ptsOf(a) : (a.points != null ? a.points : 0));

  function partPanel(part) {
    const st = Survey.state(state);
    const rec = st.parts[part];
    if (!rec) return '';
    const a = (state.attempts || []).find(x => x.id === rec.id);
    if (!a) return '';
    const g = Survey.grade(part, (a.questions || []).map(q => ({
      task: { kind: q.kind, sub: q.sub, group: q.group, band: q.band, pseudo: q.pseudo, key: q.key, rung: q.rung, blockId: q.blockId, rate: q.rate,
        hanzi: q.hanzi, pinyin: q.pinyin, ru: q.ru, show: q.show, why: q.why, id: q.id },
      given: q.given,
    })));
    const rows = [];
    if (part === 1) {
      rows.push('Полоса скринера: ' + g.band + ' из 4');
      rows.push(g.groups.map(x => x.ru + ' ' + x.right + '/' + x.of).join(' · '));
    } else if (part === 2) {
      rows.push('Ступени: ' + g.rungs.map(x => 'HSK ' + x.lvl + ' ' + x.right + '/' + x.asked).join(' · '));
      rows.push(g.top ? 'Уверенно взят уровень HSK ' + g.top : 'Ни одна ступень не взята целиком');
    } else if (part === 3) {
      rows.push((g.ear || []).map(e => (e.rate < 1 ? 'замедленный' : 'обычный') + ' темп ' + e.right + '/' + e.of).join(' · '));
      if (g.gram) rows.push('Конструкции: ' + g.gram.right + ' из ' + g.gram.of);
    }
    const p = Survey.partOf(part);
    return `<div class="panel ornate"><div class="flabel">Часть ${part} · ${esc(p.ru)}</div>
      <div class="big-score">${a.percent}<small>%</small></div>
      <div class="fb-row"><span class="fb-p">Очков</span><span class="fb-v"><b>+${Math.round(pointsOf(a))}</b></span></div>
      ${rows.filter(Boolean).map(x => `<div class="hint">${esc(x)}</div>`).join('')}</div>`;
  }

  views['survey-result'] = {
    render(p) {
      if (!window.Survey) return '<div class="empty">Съёмка пока недоступна</div>' + backBtns;
      if (!is2()) return stub();
      const r = Survey.result(state);
      if (!r.ok) return head('Итог съёмки', '测绘') + `<div class="panel"><div class="flabel">Съёмка ещё не проходилась</div>
        <div class="hint">Пройдите первую часть — она занимает около двенадцати минут.</div>
        <div class="btns mt0"><button class="btn btn-primary btn-block" data-go="survey">К частям</button></div></div>`;
      const part = +((p || {}).part) || 0;
      const bands = r.bands.map(b => `<div class="row sv-band"><div><div class="row-t">${esc(b.ru)}</div><div class="row-s">${esc(b.from)}${b.words != null ? ' · ' + fmt.plural(b.words, 'слово', 'слова', 'слов') + ' из ' + b.size : ''}</div></div>
        <div class="row-r"><span class="badge ${b.est == null ? '' : App.accClass(Math.round(b.est * 100))}">${esc(b.text)}</span></div></div>`).join('');
      const starts = r.starts.length
        ? r.starts.map(s => `<div class="row sv-start"><div><div class="row-t">${esc(s.ru)} <span class="muted">${esc(s.blockId)}</span></div><div class="row-s">${esc(s.why)}</div></div>
            <div class="row-r"><button class="btn btn-secondary btn-sm" data-action="sv-block" data-id="${esc(s.blockId)}">Открыть</button></div></div>`).join('')
        : '<div class="hint">Лестница пока не проходилась — точки старта появятся после второй части.</div>';
      const blanks = r.blanks.length
        ? r.blanks.map(b => `<div class="sv-blank"><div class="row-t">${esc(b.what)}</div>
            <div class="row-s">ваш ответ: <b class="bad">${esc(b.mine)}</b>${b.right ? ' · верно: ' + esc(b.right) : ''}</div>
            ${b.why ? `<div class="hint">${esc(b.why)}</div>` : ''}</div>`).join('')
        : '<div class="hint">Провалов не набралось — белых пятен нет.</div>';
      const st = r.state;
      const next = st.next ? Survey.partOf(st.next) : null;
      return head('Итог съёмки', '测绘 · ' + esc(r.text)) +
        (part ? partPanel(part) : '') + `
      <div class="panel"><div class="flabel">Полоса по уровням</div>${bands}
        ${r.vocab ? `<div class="hint">Объём словаря: ${esc(r.vocab.text)}. Оценка считается по узнаванию за вычетом ложных тревог на несуществующих словах и поправляется набором.</div>` : ''}</div>
      <div class="panel"><div class="flabel">Точки старта по программе</div>${starts}</div>
      <div class="panel"><div class="flabel">Белые пятна</div>${blanks}</div>
      <div class="btns">
        ${next ? `<button class="btn btn-primary btn-block" data-go="survey-run" data-params="${attr({ part: next.n })}">Часть ${next.n} · ${esc(next.ru)}</button>` : ''}
        <button class="btn btn-secondary btn-block" data-go="survey">К частям</button>
        <button class="btn btn-secondary btn-block" data-go="home">На главную</button></div>`;
    },
  };
  actions['sv-block'] = el => {
    if (actions['prog-open']) return actions['prog-open']({ dataset: { id: el.dataset.id } });
    nav('program');
  };

  return { startLevel };
})();
