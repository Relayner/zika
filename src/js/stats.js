/* Статистика: агрегаты по попыткам. Все расчёты — из сохранённых попыток, ничего не дублируется. */
window.Stats = (() => {
  const pad = n => String(n).padStart(2, '0');
  function dayKey(ts) { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  /* Карточки: сколько раз спрашивали, верно, частично, последняя, серия верных подряд */
  function cardStats(attempts) {
    const m = {};
    const sorted = attempts.slice().sort((a, b) => a.ts - b.ts);
    for (const a of sorted) for (const q of a.questions || []) {
      if (!q.cardId) continue;   /* дриллы звучания и черты карточек не имеют */
      const s = m[q.cardId] || (m[q.cardId] = { asked: 0, correct: 0, partial: 0, wrong: 0, lastAt: 0, lastOk: null, streak: 0, timeMs: 0 });
      s.asked++;
      if (q.ok) { s.correct++; s.streak++; } else { s.streak = 0; if (q.fraction > 0) s.partial++; else s.wrong++; }
      s.lastAt = a.ts; s.lastOk = q.ok; s.timeMs += q.ms || 0;
    }
    for (const s of Object.values(m)) { s.accuracy = s.asked ? s.correct / s.asked : 0; s.mastered = s.streak >= 3; }
    return m;
  }

  function streaks(attempts) {
    const days = [...new Set(attempts.map(a => dayKey(a.ts)))].sort();
    let best = 0, run = 0, prev = null;
    for (const k of days) {
      const d = new Date(k + 'T00:00:00');
      if (prev && (d - prev) / 864e5 === 1) run++; else run = 1;
      best = Math.max(best, run); prev = d;
    }
    const set = new Set(days);
    let cur = 0; const d = new Date(); d.setHours(0, 0, 0, 0);
    if (!set.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
    while (set.has(dayKey(d.getTime()))) { cur++; d.setDate(d.getDate() - 1); }
    return { current: cur, best, days: days.length };
  }

  function overview(attempts) {
    const n = attempts.length;
    const sum = f => attempts.reduce((a, x) => a + (f(x) || 0), 0);
    const st = streaks(attempts);
    const questions = sum(a => a.total), timeMs = sum(a => a.durationMs);
    return {
      attempts: n,
      avgPercent: n ? Math.round(sum(a => a.percent) / n) : 0,
      avgScore: n ? Math.round(sum(a => a.score) / n) : 0,
      best: n ? Math.max(...attempts.map(a => a.percent)) : 0,
      worst: n ? Math.min(...attempts.map(a => a.percent)) : 0,
      questions, correct: sum(a => a.correct), timeMs,
      avgQuestionMs: questions ? Math.round(timeMs / questions) : 0,
      days: st.days, streak: st.current, bestStreak: st.best,
      passed: attempts.filter(a => a.passed === true).length,
      hskTests: attempts.filter(a => a.mode === 'hsk').length,
    };
  }

  function groupBy(attempts, keyFn, labelFn) {
    const g = {};
    for (const a of attempts) {
      const k = keyFn(a);
      if (k == null) continue;
      const r = g[k] || (g[k] = { key: k, label: labelFn ? labelFn(a) : k, n: 0, sumP: 0, sumS: 0, best: 0, worst: 100, last: 0, questions: 0, correct: 0, timeMs: 0, passed: 0 });
      r.n++; r.sumP += a.percent; r.sumS += a.score;
      r.best = Math.max(r.best, a.percent); r.worst = Math.min(r.worst, a.percent);
      r.last = Math.max(r.last, a.ts); r.questions += a.total; r.correct += a.correct; r.timeMs += a.durationMs || 0;
      if (a.passed) r.passed++;
    }
    return Object.values(g).map(r => ({ ...r, avgPercent: Math.round(r.sumP / r.n), avgScore: Math.round(r.sumS / r.n) })).sort((a, b) => b.n - a.n);
  }

  function daily(attempts, days = 30) {
    const out = [], now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      out.push({ key: dayKey(d.getTime()), day: d.getDate(), n: 0, sumP: 0, questions: 0, timeMs: 0, avgPercent: null });
    }
    const idx = Object.fromEntries(out.map((o, i) => [o.key, i]));
    for (const a of attempts) {
      const i = idx[dayKey(a.ts)];
      if (i == null) continue;
      const o = out[i]; o.n++; o.sumP += a.percent; o.questions += a.total; o.timeMs += a.durationMs || 0;
    }
    out.forEach(o => { o.avgPercent = o.n ? Math.round(o.sumP / o.n) : null; });
    return out;
  }

  return { dayKey, cardStats, streaks, overview, groupBy, daily };
})();
