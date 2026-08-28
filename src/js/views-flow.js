/* Экран потока: план дня, очередь шагов, бонус за серию. */
(() => {
  const { state, views, actions, nav, esc, attr, uid, $, toast, persist, render, saveAttempt, fmt } = App;
  let fl = null;   /* { plan, queue, i, doneAttempts, baseline } */

  async function openFlow() {
    toast('Собираю день…', 1500);
    const plan = await Flow.planFor(state);
    const queue = Flow.buildQueue(state, plan);
    if (!queue.length) return toast('На сегодня всё сделано — загляните позже');
    fl = { plan, queue, i: 0, done: 0, baseline: state.attempts.length, startedAt: Date.now() };
    nav('flow');
  }
  actions['flow-open'] = () => { openFlow(); };

  /* завершённые попытки двигают поток вперёд */
  function sync() {
    if (!fl) return;
    const fresh = state.attempts.length - fl.baseline;
    if (fresh > fl.done) fl.done = fresh;
    if (fl.done > fl.i) fl.i = Math.min(fl.queue.length, fl.done);
  }

  views.flow = {
    render() {
      if (!fl) return '<div class="empty">Поток не собран.</div><div class="btns"><button class="btn btn-primary btn-block" data-action="flow-open">Собрать день</button></div>';
      sync();
      const p = fl.plan;
      const finished = fl.i >= fl.queue.length;
      const steps = fl.queue.map((s, k) => `<div class="fl-step ${k < fl.i ? 'done' : k === fl.i ? 'cur' : ''}">
        <span class="fl-n">${k < fl.i ? '✓' : k + 1}</span>
        <div class="grow"><b>${esc(s.title)}</b><div class="hint" style="margin:0">${esc(s.d)}</div></div>
        ${k === fl.i && !finished ? `<button class="btn btn-primary btn-sm" data-action="flow-go">Начать</button><button class="btn btn-secondary btn-sm" data-action="flow-skip" data-nosound>Пропустить</button>` : ''}</div>`).join('');
      return `<div class="vh"><div class="seal">流</div><div class="grow"><h1 class="title">Поток</h1><div class="sub">${p.src === 'fable' ? 'план на день составил тренер' : 'план на день'} · фокус: ${(Skill.KINDS[p.focus] || {}).ru || p.focus}</div></div></div>
      <div class="panel ornate"><div class="fl-msg">${esc(p.message || '')}</div>
        <div class="hint" style="margin:8px 0 0">Шагов: ${fl.queue.length} · пройдено: ${fl.i} · бонус за серию: +${Flow.streakBonus(fl.i)} очк.</div></div>
      <div class="fl-steps">${steps}</div>
      ${finished ? `<button class="btn btn-jade btn-block btn-lg" data-action="flow-finish">Забрать бонус · +${Flow.streakBonus(fl.i)}</button>` : `<button class="btn btn-secondary btn-block btn-sm" data-action="flow-finish" ${fl.i ? '' : 'disabled'}>Завершить досрочно${fl.i ? ' · +' + Flow.streakBonus(fl.i) : ''}</button>`}`;
    },
  };
  actions['flow-skip'] = () => { if (!fl) return; sync(); fl.i++; fl.baseline--; fl.done = Math.max(fl.done, fl.i); render(); };
  actions['flow-go'] = () => {
    if (!fl) return;
    sync();
    const s = fl.queue[fl.i];
    if (!s) return;
    if (s.t === 'review') {
      if (!SRS.dueCount(state)) { toast('Повторять уже нечего — шаг пропущен'); fl.i++; fl.baseline--; render(); return; }
      return App.startReview();
    }
    if (s.t === 'sprint') { const b = PROGRAM.byId(s.blockId); if (b) { App.actions['prog-open']({ dataset: { id: s.blockId } }); return; } }
    if (s.t === 'drill') { App.trainDeck(s.deck); return; }
    if (s.t === 'hand') { state.settings.handDeck = s.deck; persist(); nav('hand'); return; }
    if (s.t === 'boss') { nav('boss'); return; }
  };
  actions['flow-finish'] = () => {
    if (!fl || !fl.i) { fl = null; nav('home', {}, { replace: true }); return; }
    const bonus = Flow.streakBonus(fl.i);
    const f = Flow.st(state);
    f.doneToday = fl.i; f.day = Stats.dayKey(Date.now());
    if (fl.i > (f.streakBest || 0)) f.streakBest = fl.i;
    const a = { id: uid(), ts: fl.startedAt, endedAt: Date.now(), durationMs: Date.now() - fl.startedAt,
      mode: 'flow', difficulty: 'flow', deckIds: [], deckName: 'Поток · ' + fl.i + ' шагов', show: 'flow', guess: ['flow'],
      order: 'random', timer: 0, total: fl.i, planned: fl.queue.length, aborted: false, correct: fl.i, partial: 0, wrong: 0,
      percent: 100, points: bonus, questions: [] };
    fl = null;
    saveAttempt(a).then(() => { Sound.finish(true); toast('Бонус за поток: +' + bonus, 2500); nav('home', {}, { replace: true }); });
  };
})();
