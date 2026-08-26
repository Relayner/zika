/* Изучение 学: карточка целиком — иероглиф, пиньинь, перевод. Без оценок и без проверки себя. */
(() => {
  const { state, views, actions, nav, esc, attr, $, toast, persist, deckById, cardsOfDeck, builtinDecks, render, fmt } = App;
  let ln = null; /* { deckId, order, list, i } */

  const orderList = (cards, order) => {
    const cs = state.cardStats;
    if (order === 'new') return cards.filter(c => !cs[c.id] || !cs[c.id].asked).concat(cards.filter(c => cs[c.id] && cs[c.id].asked));
    if (order === 'weak') return cards.slice().sort((a, b) => {
      const sa = cs[a.id], sb = cs[b.id];
      const ra = sa && sa.asked ? sa.right / sa.asked : 2, rb = sb && sb.asked ? sb.right / sb.asked : 2;
      return ra - rb;
    });
    return cards;
  };

  function open(deckId, order) {
    const cards = cardsOfDeck(deckId);
    if (!cards.length) return toast('В колоде нет карточек');
    const ord = order || (ln && ln.deckId === deckId ? ln.order : 'seq') || 'seq';
    ln = { deckId, order: ord, list: orderList(cards, ord), i: 0 };
    nav('learn', { id: deckId });
  }
  /* «Учить» ведёт в программу, если для этой колоды есть блоки: занимаемся уроками, а не всей сотней слов сразу */
  actions['learn-deck'] = el => {
    App.closeSheet();
    const id = el.dataset.id;
    const lvl = window.PROGRAM && (PROGRAM.LEVELS.find(l => l.deck === id) || {}).n;
    if (lvl && PROGRAM.byLevel(lvl).length) return nav('program', { lvl });
    open(id);
  };
  actions['learn-order'] = el => { if (!ln) return; ln.order = el.dataset.v; ln.list = orderList(cardsOfDeck(ln.deckId), ln.order); ln.i = 0; render(); };
  actions['learn-prev'] = () => { if (!ln) return; ln.i = (ln.i - 1 + ln.list.length) % ln.list.length; render(); };
  actions['learn-next'] = () => { if (!ln) return; ln.i = (ln.i + 1) % ln.list.length; render(); };
  actions['learn-say'] = () => { if (ln) Speech.say(ln.list[ln.i].hanzi); };
  actions['learn-mastered'] = () => {
    if (!ln) return;
    const c = ln.list[ln.i];
    const s = state.cardStats[c.id] || (state.cardStats[c.id] = { asked: 0, right: 0, streak: 0, mastered: false });
    s.mastered = !s.mastered;
    persist();
    toast(s.mastered ? 'Отмечено: выучено' : 'Отметка снята');
    render();
  };

  views.learn = {
    render(p) {
      const d = deckById(p.id) || (ln && deckById(ln.deckId));
      if (!d) return '<div class="empty">Колода не найдена</div>';
      if (!ln || ln.deckId !== d.id) { const cards = cardsOfDeck(d.id); if (!cards.length) return '<div class="empty">В колоде нет карточек</div>'; ln = { deckId: d.id, order: 'seq', list: cards, i: 0 }; }
      const c = ln.list[ln.i];
      const st = state.cardStats[c.id] || {};
      const long = c.hanzi.replace(/[…\s]/g, '').length >= 5;
      const ORD = [['seq', 'По порядку'], ['new', 'Сначала новые'], ['weak', 'Сначала слабые']];
      return `<div class="vh"><button class="icon-btn" data-back>‹</button><div class="grow"><h1 class="title">Изучение 学</h1><div class="sub">${esc(d.name)} · смотрите и запоминайте</div></div></div>
      <div class="panel ornate learn-card">
        <div class="learn-count">${ln.i + 1} / ${ln.list.length}${st.mastered ? ' · <b class="lm">выучено</b>' : ''}</div>
        <div class="hanzi mid ${long ? 'len5' : ''}">${esc(c.hanzi)}</div>
        <div class="pinyin">${esc(c.pinyin)}</div>
        <div class="ru">${esc(c.ru)}</div>
        ${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}
        <button class="btn btn-secondary btn-sm learn-say" data-action="learn-say" data-nosound>🔊 Произнести</button>
      </div>
      <div class="learn-nav"><button class="btn btn-secondary" data-action="learn-prev" data-nosound>‹ Назад</button><button class="btn btn-primary" data-action="learn-next" data-nosound>Дальше ›</button></div>
      <button class="btn ${st.mastered ? 'btn-jade' : 'btn-secondary'} btn-block btn-sm" data-action="learn-mastered">${st.mastered ? '✓ Выучено — снять отметку' : 'Отметить «выучено»'}</button>
      <div class="panel"><div class="flabel">Порядок</div><div class="seg">${ORD.map(([v, t]) => `<button class="${ln.order === v ? 'on' : ''}" data-action="learn-order" data-v="${v}">${t}</button>`).join('')}</div>
        <div class="hint" style="margin:10px 0 0">Здесь только просмотр: ни очков, ни ошибок. Проверить себя — «Словарный тест» или режимы тренировки.</div></div>
      <button class="btn btn-secondary btn-block" data-action="learn-to-train" data-id="${d.id}">Перейти к тренировке</button>`;
    },
  };
  actions['learn-to-train'] = el => { App.trainDeck(el.dataset.id); };
})();
