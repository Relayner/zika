/* «Съёмка местности»: экраны входного теста — обзор частей, прохождение и итог.

   Здесь только показ и ход: что спрашивать, как считать полосу и где точка старта —
   решает survey.js. Собственной оценки ответа на этом экране нет, вердикт выносит
   Survey.judge, а грамматику — GRAMMAR.check внутри него.

   Это замер, а не урок: разбора после ответа нет, верный ответ по ходу не показывается и
   звук на любой ответ один и тот же — иначе съёмка мерила бы уже подсказанное. Всё, что
   выяснилось, видно в итоге части и в общем итоге. Кнопка «Не знаю» отправляет пустой ответ:
   судья засчитает его незнанием, и это честнее угадывания; очков она не отнимает — цена части
   от верных ответов не зависит.

   Возобновление. Задания собираются по постоянному зерну, поэтому в settings живёт только
   незаконченный заход: номер части, сами ответы и время. Вернувшись в течение недели, экран
   пересобирает те же задания и проигрывает по ним сохранённые ответы — часть продолжается
   с того же места, включая пройденные ступени лестницы. Если план собрался иначе (сменились
   словари), часть честно начинается заново, а не приписывает ответы чужим заданиям.

   Цена. Попытка идёт с fixedPts: true — она не проходит деградацию и не помечает материал
   виденным. Платим меньшее из двух: потолок части у модуля (ровно один дневной переход,
   Survey.payFor → Campaign.capFor) и ставка по времени работы — 20 очков за минуту, столько же
   стоит минута обычного занятия (дневная норма 400 очков ≈ 20 минут). Так замер не обесценивает
   неделю занятий и не платит за них меньше.

   Время задания считаем в границах 4–60 секунд, но тычок быстрее порога Ledger.FAST_MS идёт
   по своему настоящему времени: иначе часть, прощёлканная вслепую за полминуты, стоила бы
   столько же, сколько пройденная честно.

   Экран принадлежит тестовой методике: в текущей книге учёта он показывает, где её включить. */
window.SurveyUI = (() => {
  const { state, views, actions, nav, esc, attr, uid, $, toast, confirm, persist, render, saveAttempt, fmt, LABELS } = App;

  /* Без этой подписи в списке попыток и в разборе стояло бы латинское «survey» */
  if (LABELS && LABELS.mode && !LABELS.mode.survey) LABELS.mode.survey = 'Съёмка местности';
  if (LABELS && LABELS.diff && !LABELS.diff.survey) LABELS.diff.survey = 'Съёмка';

  const is2 = () => !!(window.Ledger && Ledger.is2(state));
  const speech = () => !!(window.Speech && Speech.available());
  const SEAL = '测';
  const RESUME_MS = 7 * 24 * 3600e3;        /* сколько ждёт брошенная часть */
  const RATE = 20;                          /* очков за минуту работы: 400 за 20 минут */
  const MIN_Q_MS = 4000, MAX_Q_MS = 60000;  /* время задания считаем в этих границах */
  /* Тычок быстрее порога книги учёта нижней границы не получает: иначе прощёлкать часть
     вслепую стоило бы столько же, сколько её пройти. Порог тот же, что в Ledger. */
  const tapMs = () => ((window.Ledger && Ledger.FAST_MS) || 2500);
  const HOME_MAX = 30;                      /* панель на главной — пока попыток мало */
  const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
  const settings = () => (state.settings || (state.settings = {}));

  let run = null;     /* заход: { part, plan, qs, ans, i, draft, startedAt, qAt, lad } */

  /* ── общие куски ── */
  const head = (title, sub, back = true) => `<div class="vh">${back ? '<button class="icon-btn" data-back>‹</button>' : `<div class="seal">${SEAL}</div>`}
    <div class="grow"><h1 class="title">${esc(title)}</h1><div class="sub">${sub}</div></div></div>`;
  const backBtns = '<div class="btns"><button class="btn btn-secondary btn-block" data-go="home">На главную</button></div>';

  const stub = () => head('Съёмка местности', '测绘 · входной тест') + `<div class="panel">
    <div class="flabel">Это часть тестовой методики</div>
    <div class="hint">Входной тест считается по тестовой книге учёта. Сейчас открыта текущая — её можно переключить в настройках, прогресс при этом сохранится.</div>
    <div class="btns mt0"><button class="btn btn-primary btn-block" data-go="settings">В настройки</button></div></div>`;

  const notReady = () => head('Съёмка местности', '测绘 · входной тест') + `<div class="panel">
    <div class="flabel">Эта часть готовится</div>
    <div class="hint">Задания замера ещё не подключены. Начать можно и без них: программа стартует с HSK 1, а съёмка появится здесь же.</div>
    <div class="btns mt0"><button class="btn btn-primary btn-block" data-go="program">К программе</button>
      <button class="btn btn-secondary btn-block" data-go="home">На главную</button></div></div>`;

  /* ── незаконченный заход: в settings только ответы, задания собираются заново ── */
  function savedRun() {
    const r = settings().surveyRun;
    if (!r || !Array.isArray(r.ans) || !r.ans.length) return null;
    const n = num(r.part);
    if (!window.Survey || !(n >= 1 && n <= Survey.PARTS.length)) return null;
    if (Date.now() - num(r.at) > RESUME_MS) return null;
    if (Survey.state(state).parts[n]) return null;        /* часть уже сдана — заход устарел */
    return r;
  }
  function saveRun() {
    if (!run) return;
    settings().surveyRun = { part: run.part, at: Date.now(), startedAt: run.startedAt, ans: run.ans.slice() };
    persist();
  }
  function clearRun() { if (settings().surveyRun) { delete settings().surveyRun; persist(); } }

  /* ── обзор частей ── */
  /* Часть 2 — лестница: она останавливается, как только уровень найден, поэтому заданий
     в ней будет от одной ступени до четырёх с доборами, а не весь план. Обещать план целиком
     нечестно: в жизни вторая часть кончается раньше, чем в описании. */
  const ladMin = () => Survey.RUNG;
  const ladMax = () => Survey.LVLS.length * (Survey.RUNG + Survey.MORE);
  const sizeLine = p => (p.n === 2
    ? 'от ' + ladMin() + ' до ' + ladMax() + ' заданий · до ' + p.min + ' минут'
    : fmt.plural(p.count, 'задание', 'задания', 'заданий') + ' · около ' + p.min + ' минут');
  const minLo = () => Math.min(...Survey.PARTS.map(p => p.min));
  const minHi = () => Math.max(...Survey.PARTS.map(p => p.min));
  function partRow(p, st, sv) {
    const r = st.parts[p.n];
    const cls = r ? 'done' : (st.next === p.n ? 'next' : 'wait');
    const started = sv && num(sv.part) === p.n;
    const line = r
      ? 'верных ' + r.correct + ' из ' + r.total + ' · ' + fmt.date(r.at)
      : started
        /* у лестницы полного числа заданий нет заранее — «из 48» было бы обещанием, а не фактом */
        ? (p.n === 2 ? 'начата: ответов ' + sv.ans.length + ' · продолжится с того же места'
          : 'начата: ответов ' + sv.ans.length + ' из ' + p.count + ' · продолжится с того же места')
        : sizeLine(p);
    return `<div class="row sv-part ${cls}">
      <div><div class="row-t"><span class="zh">${esc(p.zh)}</span> ${esc(p.ru)}</div>
        <div class="row-s">${esc(p.sub)} — ${esc(line)}</div></div>
      <div class="row-r">${r
        ? `<span class="badge ${App.accClass(r.percent)}">${r.percent}%</span>`
        : `<button class="btn ${cls === 'next' ? 'btn-primary' : 'btn-secondary'} btn-sm" data-go="survey-run" data-params="${attr({ part: p.n })}">${started ? 'Продолжить' : 'Пройти'}</button>`}</div></div>`;
  }

  views.survey = {
    render() {
      if (!window.Survey) return notReady();
      if (!is2()) return stub();
      const st = Survey.state(state), sv = savedRun();
      const rows = Survey.PARTS.map(p => partRow(p, st, sv)).join('');
      const next = st.next ? Survey.partOf(st.next) : null;
      const skipped = !!settings().surveySkip;
      const goNext = next ? (sv && num(sv.part) === next.n ? 'Продолжить часть ' + next.n : 'Начать часть ' + next.n) : '';
      return head('Съёмка местности', '测绘 · входной тест') + `
      <div class="panel ornate">
        <div class="flabel">Зачем</div>
        <div class="hint">Уровень здесь набирается работой, поэтому тот, кто уже знает язык, начинает с первого блока HSK 1. Съёмка даёт точку старта заранее: полосу по каждому уровню, первый блок, где посыпалось, и пять белых пятен.</div>
        <div class="hint">Три части по очереди, каждая до ${minLo()}–${minHi()} минут. Вторая обычно короче: лестница останавливается, как только уровень найден, поэтому заданий в ней от ${ladMin()} до ${ladMax()}. Уйти можно на любом задании: часть подождёт неделю и продолжится с того же места.</div>
        <div class="hint">Разбора после ответов не будет — это замер, а не урок. Незнакомое отмечайте кнопкой «Не знаю»: пропуск честнее догадки и очков не отнимает.</div>
        <div class="flabel mt">Что будет на выходе</div>
        <div class="hint">Полоса по HSK 1–4 с оговоркой, что это оценка по короткому замеру; точки старта по программе; пять белых пятен с вашими ответами; объём словаря.</div>
      </div>
      <div class="panel"><div class="flabel">Части · пройдено ${st.done.length} из ${Survey.PARTS.length}</div>${rows}
        <div class="hint">Часть платит по времени работы и не больше одного дневного перехода. Быстрые тычки идут по своему настоящему времени, поэтому прощёлкать часть вслепую невыгодно. Съёмка не заменяет занятий и не двигает повторения по самооценке.</div>
        ${skipped && !st.complete ? '<div class="hint">Съёмку отложили — курс идёт с HSK 1. Пройти её можно в любой день.</div>' : ''}</div>
      ${next ? `<div class="panel"><div class="flabel">Дальше</div><div class="hint">${esc(next.about)}</div>
        <div class="btns mt0"><button class="btn btn-primary btn-block" data-go="survey-run" data-params="${attr({ part: next.n })}">${esc(goNext)} · ${esc(next.ru)}</button></div></div>` : ''}
      <div class="btns">
        ${st.done.length ? `<button class="btn ${st.complete ? 'btn-primary' : 'btn-secondary'} btn-block" data-go="survey-result">${st.complete ? 'Итог съёмки' : 'Что уже видно'}</button>` : ''}
        ${st.complete ? '' : '<button class="btn btn-secondary btn-block" data-action="sv-skip">Пропустить съёмку</button>'}
        <button class="btn btn-secondary btn-block" data-go="program">К программе</button>
        <button class="btn btn-secondary btn-block" data-go="home">На главную</button></div>`;
    },
  };

  /* Пропуск — решение ученика, а не вывод из истории: держим его в settings отдельной отметкой */
  actions['sv-skip'] = async () => {
    const ok = await confirm('Курс начнётся с HSK 1, как обычно. Съёмку можно пройти позже — она останется в разделе HSK.', { ok: 'Пропустить', title: 'Пропустить съёмку' });
    if (!ok) return;
    settings().surveySkip = Date.now();
    persist();
    toast('Старт с HSK 1');
    nav('home', {}, { replace: true });
  };

  /* ── ход части ──
     Части 1 и 3 идут подряд. Часть 2 — лестница: шесть заданий на ступень, дальше решает
     правило Survey.rung, а слот «б» того же уровня служит добором. */
  const rungTasks = (plan, lvl, slot) => plan.filter(t => t.band === lvl && t.slot === slot);

  function startRun(part) {
    const plan = Survey.build(state, part);
    const now = Date.now();
    run = { part, plan, qs: [], ans: [], i: 0, draft: '', startedAt: now, qAt: now, lad: null, done: false };
    if (part === 2) {
      run.lad = { lvl: startLevel(), visited: {}, base: 0 };
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

  /* Возвращение в часть: тот же план, те же ответы, тот же ход лестницы */
  function resumeRun(part) {
    const sv = savedRun();
    if (!sv || num(sv.part) !== part) return false;
    startRun(part);
    if (!run.qs.length) return false;
    run.startedAt = num(sv.startedAt) || run.startedAt;
    for (const a of sv.ans) {
      const q = run.qs[run.i];
      if (!q || String(q.id) !== String(a.id)) {          /* план собрался иначе — начинаем часть заново */
        startRun(part); clearRun();
        toast('Задания части пересобрались — часть начнётся заново', 3000);
        return true;
      }
      accept(String(a.given == null ? '' : a.given), num(a.ms), true);
      if (run.done) break;
    }
    if (run.done) run.finishOnMount = true;               /* часть была пройдена целиком, но не записалась */
    run.qAt = Date.now();
    return true;
  }

  /* ── разметка задания ── */
  const optText = (q, o) => (q.kind === 'hz2ru' ? `<span class="opt-ru">${esc(o)}</span>` : `<span class="opt-hanzi">${esc(o)}</span>`);
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
        <div class="sv-draft">${run.draft ? esc(run.draft) : '<i>соберите слово</i>'}</div></div>`;
    }
    const big = q.kind === 'py2hz' ? `<div class="pinyin big">${esc(q.show)}</div>`
      : q.kind === 'ru2hz' ? `<div class="sv-ask">${esc(q.show)}</div>`
        : `<div class="hanzi">${esc(q.show)}</div>`;
    return `<div class="panel ornate sv-q"><div class="flabel">${esc(q.prompt)}</div>${big}
      ${q.kind === 'know' ? '<div class="hint" style="text-align:center;margin:8px 0 0">честный ответ полезнее красивого: проверка идёт и по несуществующим словам</div>' : ''}</div>`;
  }
  function bodyHtml(q) {
    if (q.kind === 'set') {
      const toks = (q.tokens || []).map((c, i) => `<button class="opt sv-tok" data-action="sv-tok" data-c="${esc(c)}" data-i="${i}" data-nosound>${esc(c)}</button>`).join('');
      return `<div class="opts sv-toks">${toks}</div>
        <div class="btns row2 mt0"><button class="btn btn-secondary" data-action="sv-undo" data-nosound>Стереть</button>
        <button class="btn btn-primary" data-action="sv-done" data-nosound ${run.draft ? '' : 'disabled'}>Готово</button></div>`;
    }
    return `<div class="opts">${(q.options || []).map((o, i) =>
      `<button class="opt" data-action="sv-answer" data-idx="${i}" data-nosound>${optText(q, o)}</button>`).join('')}</div>`;
  }
  /* «Не знаю» — обычный пустой ответ. У самооценки своя пара «знаю / не знаю», там кнопка лишняя. */
  const idkBtn = q => (q.kind === 'know' ? '<div class="hint sv-note">Отвечайте как есть: «знаю» — значит вспомните значение без подсказки.</div>'
    : `<div class="btns mt0"><button class="btn btn-secondary btn-block" data-action="sv-idk" data-nosound>Не знаю</button></div>
      <div class="hint sv-note">Разбора не будет: это замер, а не урок. «Не знаю» считается незнанием и очков не отнимает.</div>`);

  views['survey-run'] = {
    render(p) {
      if (!window.Survey) return notReady();
      if (!is2()) return stub();
      const part = Math.max(1, Math.min(Survey.PARTS.length, +((p || {}).part) || 1));
      if (!run || run.part !== part) { if (!resumeRun(part)) startRun(part); }
      if (!run.qs.length) return head('Часть ' + part, '测绘') + '<div class="panel"><div class="flabel">Часть не собралась</div><div class="hint">Словари ещё не загрузились. Попробуйте открыть экран заново.</div></div>' + backBtns;
      if (run.done) return head('Часть ' + part, '测绘') + '<div class="panel"><div class="hint">Часть пройдена — записываю итог.</div></div>';
      const q = run.qs[run.i];
      const pi = Survey.partOf(part);
      const bar = `<div class="qbar"><button class="btn btn-secondary btn-sm" data-action="sv-quit">✕</button>
        <div class="progress"><i style="width:${Math.round(run.i / Math.max(1, run.qs.length) * 100)}%"></i></div>
        <div class="qcount">${run.i + 1}/${run.qs.length}</div></div>`;
      const tag = `<div class="hint sv-tag">${esc(pi.ru)} · ${esc((Survey.SUBS[q.sub] || {}).ru || q.sub)}${q.blockId && window.PROGRAM && PROGRAM.byId(q.blockId) ? ' · блок «' + esc(PROGRAM.byId(q.blockId).ru) + '»' : ''}</div>`;
      /* Счётчик части 2 растёт по ходу: в ней столько заданий, сколько понадобится лестнице,
         и обещать полное число заранее было бы неправдой */
      const grows = part === 2
        ? '<div class="hint sv-tag">счётчик — по текущей ступени: лестница останавливается, когда уровень найден</div>' : '';
      /* Ответ принят — сразу следующее задание: разбор здесь был бы уроком, а не замером */
      return bar + tag + grows + askHtml(q) + bodyHtml(q) + idkBtn(q);
    },
    mount() {
      if (!run) return;
      if (run.finishOnMount) { run.finishOnMount = false; return finish(); }
      const q = run.qs[run.i];
      if (q && q.kind === 'listen' && !q.said && speech()) { q.said = true; setTimeout(() => Speech.say(q.hanzi, { rate: q.rate, pitch: 1 }), 350); }
    },
  };

  actions['sv-say'] = () => {
    const q = run && run.qs[run.i];
    if (q && speech()) Speech.say(q.hanzi || q.word, { rate: q.rate || 0.85, pitch: 1 });
  };
  actions['sv-quit'] = async () => {
    if (!run) return;
    const ok = await confirm('Часть сохранится с этого места и подождёт неделю. Очки начисляются за пройденную часть целиком.', { ok: 'Выйти', title: 'Прервать съёмку' });
    if (!ok || !run) return;
    saveRun();
    run = null;
    nav('survey', {}, { replace: true });
  };
  actions['sv-tok'] = el => { if (!run) return; run.draft = (run.draft || '') + el.dataset.c; render(); };
  actions['sv-undo'] = () => { if (!run) return; run.draft = (run.draft || '').slice(0, -1); render(); };
  actions['sv-done'] = () => { if (run && run.draft) accept(run.draft); };
  actions['sv-idk'] = () => { if (run) accept(''); };      /* пустой ответ судья зачтёт незнанием */
  actions['sv-answer'] = el => {
    if (!run) return;
    const q = run.qs[run.i];
    const idx = +el.dataset.idx;
    q.given = idx;
    accept((q.options || [])[idx]);
  };
  /* Ответ принят: вердикт выносит Survey.judge, экран его не показывает — только записывает.
     silent — проигрывание сохранённых ответов при возвращении в часть. */
  function accept(given, ms, silent) {
    const q = run.qs[run.i];
    if (!q) return false;
    const j = Survey.judge(q, given);
    q.mine = j.mine; q.ok = j.ok; q.fraction = j.fraction; q.scored = j.scored; q.yes = j.yes;
    /* при возвращении в часть номер выбранного варианта восстанавливаем по самому ответу */
    if (q.given == null && Array.isArray(q.options)) q.given = q.options.indexOf(given);
    q.ms = ms != null ? ms : Math.max(0, Date.now() - (run.qAt || Date.now()));
    run.ans.push({ id: q.id, given: j.mine, ms: q.ms });
    run.draft = '';
    run.qAt = Date.now();
    if (!silent) {
      if (window.Sound) Sound.click();    /* один и тот же звук: по нему не догадаешься, верно ли */
      saveRun();
    }
    return step(silent);
  }
  function step(silent) {
    if (run.i + 1 < run.qs.length) { run.i++; return silent ? true : render(); }
    if (run.part === 2 && run.qs.length < Survey.COUNT[2] && ladderNext() && run.i + 1 < run.qs.length) { run.i++; return silent ? true : render(); }
    run.done = true;
    return silent ? false : finish();
  }

  /* ── сохранение части ── */
  /* Цена: не выше дневного перехода и не выше ставки за столько же минут обычной работы */
  function workMs(q) {
    const ms = Math.min(MAX_Q_MS, Math.max(0, num(q.ms)));
    return ms < tapMs() ? ms : Math.max(MIN_Q_MS, ms);
  }
  function payFor(campaign, qs) {
    const capPart = num(Survey.payFor(campaign), 400);
    const work = qs.reduce((s, q) => s + workMs(q), 0);
    return Math.max(0, Math.min(capPart, Math.round(work / 60000 * RATE)));
  }
  function finish() {
    const r = run;
    if (!r || !r.qs.length) { run = null; clearRun(); return nav('survey', {}, { replace: true }); }
    const now = Date.now();
    const qs = r.qs.filter(q => q.mine !== undefined);
    const questions = qs.map(q => ({
      kind: q.kind, sub: q.sub, band: q.band, part: r.part, id: q.id, group: q.group,
      /* самооценка карточку не трогает: без cardId повторения по ней не заводятся */
      cardId: q.self ? undefined : q.cardId,
      blockId: q.blockId, rung: q.rung, rate: q.rate, pseudo: !!q.pseudo, word: q.word,
      hanzi: q.self ? '' : (q.hanzi || ''), pinyin: q.self ? '' : (q.pinyin || ''),
      ru: q.self ? 'самооценка: ' + (q.word || q.hanzi || '') : (q.ru || ''),
      show: q.show || '',
      /* У псевдослова объяснение надо назвать словами: без него белое пятно собиралось бы из
         запасного «иероглифы — перевод» и читалось как «都长 — самооценка: 都长» */
      why: q.why || (q.pseudo ? 'Сочетание собрано из знакомых знаков, но такого слова в словаре нет.' : ''),
      key: q.key == null ? null : String(q.key),
      given: q.mine == null ? '' : String(q.mine), ok: q.ok == null ? null : !!q.ok,
      fraction: q.fraction, scored: !!q.scored, yes: !!q.yes, ms: q.ms || 0,
      answer: { choice: q.given == null ? -1 : q.given, choiceText: q.mine == null ? '' : String(q.mine) },
    }));
    const scored = questions.filter(q => q.scored);
    const correct = scored.filter(q => q.ok).length;
    const idk = scored.filter(q => !String(q.given)).length;
    const c1 = (state.books && state.books.v1) || state.campaignV1 || state.campaign;
    const c2 = window.Ledger ? Ledger.campaign(state, 'v2') : state.campaign;
    const a = {
      id: uid(), ts: r.startedAt, endedAt: now, durationMs: now - r.startedAt,
      mode: 'survey', part: r.part, difficulty: 'survey', level: 1,
      deckIds: [...new Set(qs.map(q => (q.cardId ? String(q.cardId).split(':')[0] : null)).filter(Boolean))],
      deckName: 'съёмка местности', show: 'mixed', guess: ['all'], order: 'fixed', timer: 0,
      total: scored.length, planned: questions.length, aborted: false,
      correct, partial: 0, wrong: scored.length - correct, idk,
      percent: scored.length ? Math.round(correct / scored.length * 100) : 0,
      /* цену назначает режим: ни деградации, ни траты новизны */
      fixedPts: true, points: payFor(c1, qs), p2fix: payFor(c2, qs),
      questions,
    };
    run = null;
    clearRun();
    saveAttempt(a).then(() => {
      if (window.Sound) Sound.finish(true);        /* финал части: она пройдена, оценка ответов — в итоге */
      nav('survey-result', { part: a.part }, { replace: true });
    }).catch(() => {
      toast('Попытка не записалась — итог покажу, очки появятся после перезапуска', 3500);
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
      <div class="fb-row"><span class="fb-p">Время</span><span class="fb-v">${fmt.dur(a.durationMs)}</span></div>
      ${rows.filter(Boolean).map(x => `<div class="hint">${esc(x)}</div>`).join('')}
      <div class="hint">Процент — доля верных ответов в части, самооценка «знаю» в него не входит${num(a.idk) ? '. Пропусков «не знаю» — ' + num(a.idk) : ''}.</div></div>`;
  }

  views['survey-result'] = {
    render(p) {
      if (!window.Survey) return notReady();
      if (!is2()) return stub();
      const r = Survey.result(state);
      if (!r.ok) return head('Итог съёмки', '测绘') + `<div class="panel"><div class="flabel">Съёмка ещё не проходилась</div>
        <div class="hint">Пройдите первую часть — она занимает около двенадцати минут.</div>
        <div class="btns mt0"><button class="btn btn-primary btn-block" data-go="survey">К частям</button></div></div>`;
      const part = +((p || {}).part) || 0;
      const bands = r.bands.map(b => `<div class="row sv-band"><div><div class="row-t">${esc(b.ru)}</div><div class="row-s">${esc(b.from)}${b.words != null ? ' · ' + fmt.plural(b.words, 'слово', 'слова', 'слов') + ' из ' + b.size : ''}</div></div>
        <div class="row-r"><span class="badge ${b.est == null ? '' : App.accClass(Math.round(b.est * 100))}">${esc(b.text)}</span></div></div>`).join('');
      const starts = r.starts.length
        ? r.starts.map(s => `<div class="row sv-start"><div><div class="row-t">${s.zh ? `<span class="zh">${esc(s.zh)}</span> ` : ''}${esc(s.ru)}</div><div class="row-s">HSK ${num(s.lvl, 1)} · ${esc(s.why)}</div></div>
            <div class="row-r"><button class="btn btn-secondary btn-sm" data-action="sv-block" data-id="${esc(s.blockId)}">Открыть</button></div></div>`).join('')
        /* Часть 2 пройдена, а списка нет — это не «лестница не проходилась», а «ничего не осыпалось».
           Говорить обратное значило бы отрицать только что показанный разбор ступеней. */
        : r.state.parts[2]
          ? `<div class="hint">Ни одна пройденная ступень не осыпалась, поэтому отдельной точки старта нет${r.top ? ': уверенно взят уровень HSK ' + r.top : ''}. Замер короткий — что именно брать первым, точнее покажут первые занятия.</div>`
          : '<div class="hint">Лестница пока не проходилась — точки старта появятся после второй части.</div>';
      const blanks = r.blanks.length
        ? r.blanks.map(b => `<div class="sv-blank"><div class="row-t">${esc(b.what)}</div>
            <div class="row-s">ваш ответ: <b class="bad">${!b.mine || b.mine === '—' ? 'не знаю' : esc(b.mine)}</b>${b.right ? ' · верно: ' + esc(b.right) : ''}</div>
            ${b.why ? `<div class="hint">${esc(b.why)}</div>` : ''}</div>`).join('')
        : '<div class="hint">Провалов не набралось — белых пятен нет.</div>';
      const st = r.state;
      const next = st.next ? Survey.partOf(st.next) : null;
      return head('Итог съёмки', '测绘 · ' + esc(r.text)) +
        (part ? partPanel(part) : '') + `
      <div class="panel"><div class="flabel">Полоса по уровням</div>${bands}
        <div class="hint">≈, это оценка по короткому замеру: она показывает, откуда начинать, а не сколько вы знаете на самом деле. Точнее станет после первых занятий и проверок.</div>
        ${st.complete ? '' : '<div class="hint">Съёмка пройдена не целиком: по непройденным частям данных нет, и полосы по ним пусты.</div>'}
        ${r.vocab ? `<div class="hint">Объём словаря: ${esc(r.vocab.text)}. Оценка считается по узнаванию за вычетом ложных тревог на несуществующих словах и поправляется набором.</div>` : ''}</div>
      <div class="panel"><div class="flabel">Точки старта по программе</div>${starts}</div>
      <div class="panel"><div class="flabel">Белые пятна</div>${blanks}</div>
      <div class="btns">
        ${next ? `<button class="btn btn-primary btn-block" data-go="survey-run" data-params="${attr({ part: next.n })}">Дальше · часть ${next.n} · ${esc(next.ru)}</button>` : ''}
        <button class="btn ${next ? 'btn-secondary' : 'btn-primary'} btn-block" data-go="program">К программе</button>
        <button class="btn btn-secondary btn-block" data-go="survey">К частям</button>
        <button class="btn btn-secondary btn-block" data-go="home">На главную</button></div>`;
    },
  };
  actions['sv-block'] = el => {
    if (actions['prog-open']) return actions['prog-open']({ dataset: { id: el.dataset.id } });
    nav('program');
  };

  /* ── панель на главной и строка для чужих экранов ── */
  /* Зовут снаружи: панель показываем, пока попыток мало и съёмка не пройдена и не отложена */
  function show() {
    if (!window.Survey || !is2()) return false;
    if (settings().surveySkip) return false;
    if (Survey.state(state).complete) return false;
    return ((state.attempts || []).length < HOME_MAX);
  }
  function homePanel() {
    if (!show()) return '';
    const st = Survey.state(state), sv = savedRun();
    const n = Survey.PARTS.length, done = st.done.length;
    const label = sv ? 'Продолжить часть ' + num(sv.part) : done ? 'Дальше · часть ' + st.next : 'Пройти замер';
    return `<div class="panel ornate sv-home">
      <div class="flabel">Съёмка местности · 测绘</div>
      <div class="sv-home-t">Уже учили китайский?</div>
      <div class="hint" style="margin:4px 0 0">Короткий замер — ${n} части, каждая до ${minLo()}–${minHi()} минут. Он ставит точку старта, чтобы не проходить заново то, что вы уже знаете.${done ? ' Пройдено частей: ' + done + ' из ' + n + '.' : ''}</div>
      <div class="btns mt0"><button class="btn btn-primary btn-sm" data-go="survey">${esc(label)}</button></div></div>`;
  }
  /* Строка для экрана HSK и «Начните отсюда» — вставляет главный разработчик */
  function entryRow() {
    if (!window.Survey || !is2()) return '';
    const st = Survey.state(state), sv = savedRun();
    const n = Survey.PARTS.length, done = st.done.length;
    const s = st.complete ? 'пройдена · полосы, точки старта и белые пятна'
      : sv ? 'начата часть ' + num(sv.part) + ' · продолжится с того же места'
      : done ? 'пройдено ' + done + ' из ' + n + ' · дальше часть ' + st.next
      : n + ' части, каждая до ' + minLo() + '–' + minHi() + ' минут · ставит точку старта';
    return `<button class="row tap" data-go="survey"><div><div class="row-t"><span class="zh">${SEAL}</span> Съёмка местности</div>
      <div class="row-s">${esc(s)}</div></div><div class="row-r"><span class="chev">›</span></div></button>`;
  }

  window.__survey = () => run;     /* отладка: состояние текущего захода */
  return { startLevel, homePanel, entryRow, show };
})();
