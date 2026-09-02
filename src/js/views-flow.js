/* Экран потока: план дня, очередь шагов, бонус за серию. Прогресс живёт в настройках — переживает перезапуск и повторный тап. */
(() => {
  const { state, views, actions, nav, esc, attr, uid, $, toast, persist, render, saveAttempt, fmt } = App;
  let fl = null;   /* { plan, queue, i, done, skipped, baseline, startedAt, day } */
  let loading = false;
  const today = () => Stats.dayKey(Date.now());
  const save = () => { state.settings.flowState = fl; persist(); };
  const stepsDone = () => (fl ? Math.max(0, fl.i - (fl.skipped || 0)) : 0);   /* пропущенные шаги бонуса не дают */

  /* сегодняшний недоигранный поток восстанавливаем, а не собираем заново */
  function restore() {
    if (fl && fl.day === today()) return true;
    const s = state.settings.flowState;
    if (s && s.day === today() && Array.isArray(s.queue) && s.i < s.queue.length) { fl = s; return true; }
    return false;
  }
  async function openFlow(fresh) {
    if (loading) return;
    if (!fresh && restore()) { nav('flow'); return; }
    loading = true; fl = null;
    nav('flow');
    let plan = null, queue = [];
    try {
      plan = await Flow.planFor(state, fresh);
      queue = Flow.buildQueue(state, plan);
      /* тренер прислал пустой или неисполнимый план — собираем сами */
      if (!queue.length && plan.src !== 'local') { plan = Flow.localPlan(state); queue = Flow.buildQueue(state, plan); }
    } catch (e) { plan = Flow.localPlan(state); queue = Flow.buildQueue(state, plan); }
    loading = false;
    if (!queue.length) { toast('На сегодня всё сделано — загляните позже'); nav('home', {}, { replace: true }); return; }
    fl = { plan, queue, i: 0, done: 0, skipped: 0, baseline: state.attempts.length, startedAt: Date.now(), day: today() };
    save();
    render();
  }
  actions['flow-open'] = () => { openFlow(false); };
  actions['flow-rebuild'] = () => { state.settings.flowState = null; state.settings.flowPlan = null; persist(); openFlow(true); };

  /* завершённые попытки двигают поток вперёд */
  function sync() {
    if (!fl) return;
    const before = fl.i + ':' + fl.done;
    const fresh = state.attempts.length - fl.baseline;
    if (fresh > fl.done) fl.done = fresh;
    /* разбор звучания попытки не пишет — засчитываем по отметке урока */
    const cur = fl.queue[fl.i];
    if (cur && cur.t === 'phon' && cur.lessonId && ((state.settings.phon || {})[cur.lessonId]) && fl.i === fl.done) { fl.done++; fl.baseline--; }
    if (fl.done > fl.i) fl.i = Math.min(fl.queue.length, fl.done);
    if (before !== fl.i + ':' + fl.done) save();
  }

  views.flow = {
    render() {
      if (loading) return `<div class="vh"><div class="seal">流</div><div class="grow"><h1 class="title">Поток</h1><div class="sub">собираю день…</div></div></div>
        <div class="panel ornate fl-wait"><div class="fl-msg">Тренер смотрит на вашу форму и подбирает шаги.</div><div class="hint" style="margin:8px 0 0">Обычно несколько секунд. Без сети план соберётся на месте.</div></div>`;
      if (!fl && !restore()) return '<div class="empty">Поток не собран.</div><div class="btns"><button class="btn btn-primary btn-block" data-action="flow-open">Собрать день</button></div>';
      sync();
      const p = fl.plan;
      const finished = fl.i >= fl.queue.length;
      const bonus = Flow.streakBonus(stepsDone());
      const steps = fl.queue.map((s, k) => `<div class="fl-step ${k < fl.i ? 'done' : k === fl.i ? 'cur' : ''}">
        <span class="fl-n">${k < fl.i ? '✓' : k + 1}</span>
        <div class="grow"><b>${esc(s.title)}</b><div class="hint" style="margin:0">${esc(s.d)}</div></div>
        ${k === fl.i && !finished ? `<button class="btn btn-primary btn-sm" data-action="flow-go">Начать</button><button class="btn btn-secondary btn-sm" data-action="flow-skip" data-nosound>Пропустить</button>` : ''}</div>`).join('');
      return `<div class="vh"><div class="seal">流</div><div class="grow"><h1 class="title">Поток</h1><div class="sub">${p.src === 'fable' ? 'план на день составил тренер' : 'план на день'} · фокус: ${(Skill.KINDS[p.focus] || {}).ru || p.focus}</div></div><button class="icon-btn" data-action="flow-rebuild" aria-label="Собрать заново" title="Собрать заново">↻</button></div>
      <div class="panel ornate"><div class="fl-msg">${esc(p.message || '')}</div>
        <div class="hint" style="margin:8px 0 0">Шагов: ${fl.queue.length} · пройдено: ${stepsDone()}${fl.skipped ? ' · пропущено: ' + fl.skipped : ''} · бонус за серию: +${bonus} очк.</div></div>
      <div class="fl-steps">${steps}</div>
      ${finished ? `<button class="btn btn-jade btn-block btn-lg" data-action="flow-finish">Забрать бонус · +${bonus}</button>` : `<button class="btn btn-secondary btn-block btn-sm" data-action="flow-finish" ${stepsDone() ? '' : 'disabled'}>Завершить досрочно${stepsDone() ? ' · +' + bonus : ''}</button>`}`;
    },
  };
  actions['flow-skip'] = () => { if (!fl) return; sync(); fl.i++; fl.baseline--; fl.skipped = (fl.skipped || 0) + 1; fl.done = Math.max(fl.done, fl.i); save(); render(); };
  actions['flow-go'] = () => {
    if (!fl) return;
    sync();
    const s = fl.queue[fl.i];
    if (!s) return;
    if (s.t === 'phon') { App.actions['phon-open']({ dataset: { id: s.lessonId } }); if (!s.lessonId) nav('phon'); return; }
    if (s.t === 'handBasics') { state.settings.handLevel = 0; state.settings.handMode = 'trace'; persist(); App.actions['hand-lesson']({ dataset: { id: s.lessonId } }); return; }
    if (s.t === 'review') {
      if (!SRS.dueCount(state)) { toast('Повторять уже нечего — шаг пропущен'); fl.i++; fl.baseline--; save(); render(); return; }
      return App.startReview();
    }
    if (s.t === 'sprint') { const b = PROGRAM.byId(s.blockId); if (b) { App.actions['prog-open']({ dataset: { id: s.blockId } }); return; } }
    if (s.t === 'drill') { App.trainDeck(s.deck, s.mode); return; }
    if (s.t === 'hand') { state.settings.handLevel = s.lvl || 1; persist(); nav('hand'); return; }
    if (s.t === 'boss') { nav('boss'); return; }
  };
  actions['flow-finish'] = () => {
    const n = stepsDone();
    if (!fl || !n) { fl = null; state.settings.flowState = null; persist(); nav('home', {}, { replace: true }); return; }
    const bonus = Flow.streakBonus(n);
    const f = Flow.st(state);
    f.doneToday = n; f.day = today();
    if (n > (f.streakBest || 0)) f.streakBest = n;
    const a = { id: uid(), ts: fl.startedAt, endedAt: Date.now(), durationMs: Date.now() - fl.startedAt,
      mode: 'flow', difficulty: 'flow', deckIds: [], deckName: 'Поток · ' + n + ' шагов', show: 'flow', guess: ['flow'],
      order: 'random', timer: 0, total: n, planned: fl.queue.length, aborted: false, correct: n, partial: 0, wrong: 0,
      percent: 100, points: bonus, questions: [] };
    fl = null; state.settings.flowState = null;
    saveAttempt(a).then(() => { Sound.finish(true); toast('Бонус за поток: +' + bonus, 2500); nav('home', {}, { replace: true }); });
  };
})();
