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
    };
  }

  /* локальный план — фолбэк и основа */
  function localPlan(state) {
    const s = statsFor(state);
    const mix = { review: 0, sprint: 2, drill: 2, hand: 1, boss: 0 };
    if (s.due > 0) mix.review = s.due > 15 ? 2 : 1;
    if (s.weakest === 'hand') mix.hand = 2;
    if (s.attemptsYesterday > 0) mix.boss = 1;
    const total = Object.values(mix).reduce((a, b) => a + b, 0);
    if (s.attemptsToday === 0 && total > 7) mix.drill = 1;
    return { focus: s.weakest || 'read', mix, message: s.due > 10 ? 'Сначала вернём то, что уплывает, — потом новое.' : 'Ровный день: немного повторений, немного нового.' , src: 'local' };
  }

  /* план дня: кэш на сутки, пересчёт через Fable */
  async function planFor(state) {
    const today = Stats.dayKey(Date.now());
    const cached = state.settings.flowPlan;
    if (cached && cached.day === today && cached.plan) return cached.plan;
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
    state.settings.flowPlan = { day: today, plan };
    App.persist();
    return plan;
  }

  /* очередь шагов из плана */
  function buildQueue(state, plan) {
    const q = [];
    const lvl = Skill.recLevel(state, Skill.profile(state));
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
      q.push({ t: 'drill', mode: drillMode || 'quiz', deck, title: 'Тренировка · ' + (Skill.KINDS[plan.focus] || {}).ru, d: 'слабое место дня' });
    for (let i = 0; i < (plan.mix.hand || 0); i++) q.push({ t: 'hand', deck, title: 'Письмо от руки 手写', d: 'знаки уровня, черта за чертой' });
    if (plan.mix.boss) q.push({ t: 'boss', title: 'Босс', d: 'если готов — вызовите любого' });
    return q;
  }

  /* бонус за длину потока: каждый завершённый шаг добавляет к финальной награде */
  const streakBonus = n => Math.min(60, n * n * 2);   /* 2, 8, 18, 32, 50, 60 */
  return { st, statsFor, localPlan, planFor, buildQueue, streakBonus };
})();
