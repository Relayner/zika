/* Поток 流: система сама собирает день из повторений, уроков, тренировок, письма и боссов.
   Раз в день план пересчитывает Fable через воркер; без сети работает локальный алгоритм. */
window.Flow = (() => {
  const st = state => (state.settings.flow || (state.settings.flow = { steps: 0, day: '', doneToday: 0, streakBest: 0 }));

  /* компактная стата для тренера */
  function statsFor(state) {
    const prof = Skill.profile(state);
    const today = Stats.dayKey(Date.now());
    const yest = Campaign.addDays(today, -1);
    return {
      level: Boss.levelOf(state),
      recLevel: Skill.recLevel(state, prof),
      skills: Object.fromEntries(Object.entries(prof).map(([k, v]) => [k, v.score])),
      weakest: Skill.weakest(prof),
      due: SRS.dueCount(state),
      attemptsYesterday: (state.attempts || []).filter(a => Stats.dayKey(a.ts) === yest).length,
      attemptsToday: (state.attempts || []).filter(a => Stats.dayKey(a.ts) === today).length,
      daysStreak: (state.campaign || {}).days || 0,
      /* новичок: попыток «по делу» (не звучание и не поток) меньше пяти — или курс звучания начат и не закончен, а попыток меньше двадцати */
      beginner: (() => { const real = (state.attempts || []).filter(a => a.mode !== 'phon' && a.mode !== 'flow').length; const pd = Object.keys((state.settings || {}).phon || {}).length; const pn = window.PHON ? PHON.LESSONS.length : 11;
        return !(state.attempts || []).length || (Boss.levelOf(state) === 1 && (real < 5 || (pd > 0 && pd < pn && real < 20))); })(),
      phonDone: Object.keys((state.settings || {}).phon || {}).length,
      handBasicsDone: ['h0-01', 'h0-02', 'h0-03'].filter(id => ((((state.settings || {}).hand || {}).lessons || {})[id] || {}).runs).length,
    };
  }

  /* локальный план — фолбэк и основа */
  function localPlan(state) {
    const s = statsFor(state);
    /* новичок: сначала звучание и основы письма, один урок HSK 1 — и хватит на день */
    const phonN = window.PHON ? PHON.LESSONS.length : 11;
    if (s.beginner && (s.phonDone < phonN || s.handBasicsDone < 3)) {
      /* три шага звучания, один урок черт, с третьего урока — первый блок HSK 1: вместе это как раз разгонный переход */
      const mix = { phon: Math.min(3, phonN - s.phonDone), handBasics: s.handBasicsDone < 3 ? 1 : 0, sprint: s.phonDone >= 2 ? 1 : 0, review: s.due > 0 ? 1 : 0, drill: 0, hand: 0, boss: 0 };
      return { focus: 'listen', mix, message: s.phonDone === 0 ? 'Первый день. Разберёмся, как звучит китайский, и проведём первые черты.' : 'Продолжаем со звучания — потом первые слова.', src: 'local' };
    }
    const mix = { review: 0, sprint: 2, drill: 2, hand: 1, boss: 0 };
    if (s.due > 0) mix.review = s.due > 15 ? 2 : 1;
    if (s.weakest === 'hand') mix.hand = 2;
    if (s.attemptsYesterday > 0 && (state.attempts || []).length >= 10) mix.boss = 1;   /* босс — не раньше десятка попыток */
    const total = Object.values(mix).reduce((a, b) => a + b, 0);
    if (s.attemptsToday === 0 && total > 7) mix.drill = 1;
    return { focus: s.weakest || 'read', mix, message: s.due > 10 ? 'Сначала вернём то, что уплывает, — потом новое.' : 'Ровный день: немного повторений, немного нового.' , src: 'local' };
  }

  /* план дня: кэш на сутки, пересчёт через Fable */
  async function planFor(state, fresh) {
    const today = Stats.dayKey(Date.now());
    const cached = state.settings.flowPlan;
    /* план тренера живёт до конца дня; местный — час, потом снова пробуем тренера */
    if (!fresh && cached && cached.day === today && cached.plan && (!cached.until || cached.until > Date.now())) return cached.plan;
    let plan = null;
    const conf = window.PUSH_CONF || {};
    if (conf.url && navigator.onLine !== false) {
      try {
        const ctl = new AbortController();
        const to = setTimeout(() => ctl.abort(), 12000);
        const r = await fetch(conf.url + '/coach', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctl.signal,
          body: JSON.stringify({ stats: statsFor(state) }) });
        clearTimeout(to);
        const d = await r.json();
        if (d && d.ok && d.plan && d.plan.mix) { plan = d.plan; plan.src = 'fable'; }
      } catch (e) { /* сеть подвела — локальный план */ }
    }
    if (!plan) plan = localPlan(state);
    state.settings.flowPlan = { day: today, plan, until: plan.src === 'fable' ? null : Date.now() + 3600e3 };
    App.persist();
    return plan;
  }

  /* очередь шагов из плана */
  function buildQueue(state, plan) {
    const q = [];
    const lvl = Skill.recLevel(state, Skill.profile(state));
    /* ступень с нуля: непройденные уроки звучания по порядку */
    if (plan.mix.phon && window.PHON) {
      const done = (state.settings || {}).phon || {};
      PHON.LESSONS.filter(l => !done[l.id]).slice(0, plan.mix.phon).forEach(l => q.push({ t: 'phon', lessonId: l.id, title: 'Звучание · ' + l.ru, d: l.kind === 'drill' ? 'тренировка на слух' : 'разбор с примерами' }));
    }
    if (plan.mix.handBasics && window.HANDWRITING) {
      const ls = ((state.settings || {}).hand || {}).lessons || {};
      const next = HANDWRITING.COURSE.filter(c => c.lvl === 0).find(c => !(ls[c.id] || {}).runs);
      if (next) q.push({ t: 'handBasics', lessonId: next.id, title: 'Основы письма · ' + next.ru, d: 'черты в клетке, с обводкой' });
    }
    const deck = ['hsk1', 'hsk2', 'hsk3', 'freq1'][Math.min(3, lvl - 1)];
    /* повторений кладём не больше, чем реально есть чего повторять: тренер мог ошибиться */
    const due = SRS.dueCount(state);
    const revSteps = due > 0 ? Math.min(plan.mix.review || 0, Math.ceil(due / 15)) : 0;
    for (let i = 0; i < revSteps; i++) q.push({ t: 'review', title: 'Повторение 复习', d: 'слова, подошедшие по сроку' });
    /* уроки: недоосвоенные блоки рекомендованного уровня */
    const blocks = (window.PROGRAM ? PROGRAM.byLevel(lvl) : []).filter(b => {
      const bs = (state.settings.program || {})[b.id];
      return !bs || bs.seal === 'new' || bs.seal === 'work';
    });
    for (let i = 0; i < (plan.mix.sprint || 0); i++) {
      const b = blocks[i % Math.max(1, blocks.length)];
      if (b) q.push({ t: 'sprint', blockId: b.id, title: 'Урок · ' + b.ru, d: 'лента и проверка блока' });
    }
    const drillMode = { listen: 'listen', read: 'quiz', write: 'write', speak: null, hand: null }[plan.focus] || 'quiz';
    for (let i = 0; i < (plan.mix.drill || 0); i++)
      q.push({ t: 'drill', mode: drillMode || 'quiz', deck, title: 'Тренировка · ' + ((Skill.KINDS[plan.focus] || {}).ru || 'по словам уровня'), d: 'слабое место дня' });
    for (let i = 0; i < (plan.mix.hand || 0); i++) q.push({ t: 'hand', deck, lvl, title: 'Письмо от руки 手写', d: 'слова уровня, черта за чертой' });
    if (plan.mix.boss && (state.attempts || []).length >= 10) q.push({ t: 'boss', title: 'Босс', d: 'если готов — вызовите любого' });
    return q;
  }

  /* бонус за длину потока: каждый завершённый шаг добавляет к финальной награде */
  const streakBonus = n => Math.min(60, n * n * 2);   /* 2, 8, 18, 32, 50, 60 */
  return { st, statsFor, localPlan, planFor, buildQueue, streakBonus };
})();
