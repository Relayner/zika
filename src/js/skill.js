/* Внутренняя оценка ученика: скользящая точность по видам работы с затуханием по времени. */
window.Skill = (() => {
  const HALF_LIFE = 14 * 24 * 3600e3;   /* вклад попытки тает вдвое каждые две недели */
  const KINDS = {
    listen: { zh: '听', ru: 'Слух' },
    read: { zh: '读', ru: 'Чтение' },
    write: { zh: '写', ru: 'Набор' },
    hand: { zh: '手', ru: 'От руки' },
    speak: { zh: '说', ru: 'Речь' },
    vocab: { zh: '词', ru: 'Словарь' },
  };
  /* Какому навыку принадлежит попытка (или вопрос экзамена) */
  function kindsOf(a) {
    if (a.mode === 'hand') return ['hand'];
    if (a.mode === 'boss') return ['speak', 'listen'];
    if (a.mode === 'listen') return ['listen'];
    if (a.mode === 'write') return ['write'];
    if (a.mode === 'sentence') return ['write', 'read'];
    if (a.mode === 'quiz' || a.mode === 'flip' || a.mode === 'sprint') return ['read'];
    if (a.mode === 'hsk') return a.format === 'real' ? null : ['read'];   /* настоящий экзамен разбираем по секциям */
    return ['read'];
  }
  const secKind = { listening: 'listen', reading: 'read', writing: 'write' };

  /* Профиль: 0…100 на навык + уровень материала, на котором это заработано */
  function profile(state, now = Date.now()) {
    const acc = {};
    for (const k of Object.keys(KINDS)) acc[k] = { w: 0, ok: 0, lvl: 0 };
    for (const a of state.attempts || []) {
      if (a.aborted) continue;
      const age = Math.pow(0.5, (now - (a.ts || now)) / HALF_LIFE);
      const lvl = Campaign.contentLevel(a) || 1;
      const push = (k, okFrac, weight) => { const c = acc[k]; if (!c) return; const w = weight * age; c.w += w; c.ok += okFrac * w; c.lvl += lvl * w; };
      if (a.mode === 'hsk' && a.format === 'real' && a.sections) {
        for (const [sec, v] of Object.entries(a.sections)) push(secKind[sec] || 'read', v.total ? v.correct / v.total : 0, v.total);
      } else {
        const ks = kindsOf(a);
        if (ks) for (const k of ks) push(k, (a.percent || 0) / 100, a.total || 1);
      }
    }
    const out = {};
    for (const [k, c] of Object.entries(acc)) {
      out[k] = c.w > 2
        ? { score: Math.round(c.ok / c.w * 100), lvl: Math.round(c.lvl / c.w * 10) / 10, data: Math.round(c.w) }
        : { score: null, lvl: null, data: Math.round(c.w) };
    }
    /* словарь — охват: доля живых слов от изученного объёма */
    const aliveN = (window.SRS ? SRS.alive(state, now).length : 0);
    const seenN = Object.keys((state.settings || {}).srs || {}).length;
    out.vocab = { score: seenN ? Math.round(aliveN / seenN * 100) : null, alive: aliveN, seen: seenN, data: seenN };
    return out;
  }
  /* Слабейший навык с данными — кандидат на тренировку */
  function weakest(prof) {
    const rows = Object.entries(prof).filter(([k, v]) => v.score != null && k !== 'vocab');
    if (!rows.length) return null;
    rows.sort((a, b) => a[1].score - b[1].score);
    return rows[0][0];
  }
  /* Рекомендованный уровень материала: рабочий уровень Boss.levelOf, но не ниже уровня, где точность просела */
  function recLevel(state, prof) {
    const base = Boss.levelOf(state);
    const scores = Object.values(prof).filter(v => v.score != null && v.score !== undefined).map(v => v.score);
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    if (avg == null) return base;
    if (avg >= 85 && base < 4) return base + 1;   /* уверенно — можно тянуться выше */
    return base;
  }
  return { KINDS, kindsOf, profile, weakest, recLevel, HALF_LIFE };
})();
