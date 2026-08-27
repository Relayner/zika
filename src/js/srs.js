/* Интервальные повторения: у каждой карточки свой срок следующей встречи. */
window.SRS = (() => {
  const STEPS = [1, 3, 7, 21, 60];            /* дни между повторениями */
  const DAY = 24 * 3600e3;
  const store = state => (state.settings.srs || (state.settings.srs = {}));
  const rec = (state, id) => { const s = store(state); return s[id] || (s[id] = { step: -1, due: 0, seen: 0 }); };

  /* Ответ на карточку двигает её по лесенке: верно — дальше, ошибка — на ступень назад */
  function grade(state, cardId, ok, now = Date.now()) {
    const r = rec(state, cardId);
    r.seen++;
    r.last = now;
    if (ok) r.step = Math.min(STEPS.length - 1, r.step + 1);
    else r.step = Math.max(0, r.step - 1);
    r.due = now + STEPS[Math.max(0, r.step)] * DAY;
    return r;
  }
  /* Разбор ответов попытки — вызывается один раз при сохранении */
  function noteAttempt(state, a, now = Date.now()) {
    const seen = {};
    for (const q of a.questions || []) {
      if (!q.cardId) continue;
      /* если слово встретилось несколько раз, засчитываем худший ответ */
      seen[q.cardId] = seen[q.cardId] === false ? false : !!q.ok;
    }
    if (Array.isArray(a.words)) {
      const ok = a.percent >= 80;
      for (const w of a.words) { const id = idByHanzi(state, w); if (id && seen[id] === undefined) seen[id] = ok; }
    }
    for (const [id, ok] of Object.entries(seen)) grade(state, id, ok, now);
    return Object.keys(seen).length;
  }
  let hmap = null;
  function idByHanzi(state, h) {
    if (!hmap) {
      hmap = {};
      (App.builtinDecks || []).forEach(d => App.cardsOfDeck(d.id).forEach(c => { if (!hmap[c.hanzi]) hmap[c.hanzi] = c.id; }));
      (state.cards || []).forEach(c => { if (!hmap[c.hanzi]) hmap[c.hanzi] = c.id; });
    }
    return hmap[h];
  }
  /* Что подошло по сроку */
  function due(state, now = Date.now()) {
    const s = store(state);
    return Object.keys(s).filter(id => s[id].due && s[id].due <= now);
  }
  const dueCount = (state, now = Date.now()) => due(state, now).length;
  /* Живо освоенные: прошли хотя бы три ступени и срок не вышел */
  function alive(state, now = Date.now()) {
    const s = store(state);
    return Object.keys(s).filter(id => s[id].step >= 2 && s[id].due > now);
  }
  /* Сколько слов ждёт своей очереди в ближайшие дни — для графика */
  function forecast(state, days = 7, now = Date.now()) {
    const s = store(state), out = Array.from({ length: days }, () => 0);
    for (const id of Object.keys(s)) {
      const d = Math.floor((s[id].due - now) / DAY);
      if (d >= 0 && d < days) out[d]++;
    }
    return out;
  }
  const nextDue = (state, id) => (store(state)[id] || {}).due || 0;
  return { STEPS, grade, noteAttempt, due, dueCount, alive, forecast, nextDue, rec };
})();
