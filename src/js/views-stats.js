/* Статистика: обзор с графиками и разрезами, карточки, журнал попыток, разбор попытки. */
(() => {
  const { state, views, actions, nav, esc, attr, $, toast, sheet, closeSheet, confirm, LABELS, fmt, allDecks, deckById, cardIndex, hskCards, accClass, attemptRow, questionRow, render } = App;

  function tile(v, l, small) { return `<div class="tile"><div class="v">${v}${small ? `<small> ${small}</small>` : ''}</div><div class="l">${l}</div></div>`; }
  function barChart(data, valueFn, { max = 100, suffix = '', labelEvery = 5 } = {}) {
    const W = 320, H = 110, pad = 4, bw = (W - pad * 2) / data.length;
    const bars = data.map((d, i) => {
      const v = valueFn(d); if (v == null) return `<rect x="${pad + i * bw + 1}" y="${H - 22}" width="${Math.max(1, bw - 2)}" height="2" fill="var(--line-2)"/>`;
      const h = Math.max(2, (H - 26) * Math.min(1, v / max)), y = H - 22 - h;
      const col = suffix === '%' ? (v >= 80 ? 'var(--jade)' : v >= 60 ? 'var(--gold)' : 'var(--vermilion)') : 'var(--bordeaux)';
      return `<rect x="${pad + i * bw + 1}" y="${y}" width="${Math.max(1, bw - 2)}" height="${h}" rx="1.5" fill="${col}"/>`;
    }).join('');
    const labels = data.map((d, i) => (i % labelEvery === data.length % labelEvery || i === data.length - 1) ? `<text x="${pad + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle" font-size="9" fill="var(--ink-3)">${d.day}</text>` : '').join('');
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">${bars}${labels}</svg>`;
  }
  function table(rows, cols) {
    if (!rows.length) return '<div class="empty">Нет данных</div>';
    return `<div style="overflow-x:auto"><table class="table"><thead><tr>${cols.map(c => `<th class="${c.num ? 'num' : ''}">${c.h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td class="${c.num ? 'num' : ''}">${c.f(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  const pctCell = v => `<span class="badge ${accClass(v)}">${v}%</span>`;
  const GROUP_COLS = [{ h: '', f: r => esc(r.label) }, { h: 'Попыток', num: true, f: r => r.n }, { h: 'Средний', num: true, f: r => pctCell(r.avgPercent) }, { h: 'Балл', num: true, f: r => r.avgScore }, { h: 'Лучший', num: true, f: r => r.best + '%' }, { h: 'Время', num: true, f: r => fmt.clock(r.timeMs) }];

  function overview() {
    const A = state.attempts, ov = Stats.overview(A);
    if (!A.length) return '<div class="empty">Пока нет попыток — статистика появится после первой тренировки или теста.</div>';
    const cs = state.cardStats, seen = Object.keys(cs).length, mastered = Object.values(cs).filter(s => s.mastered).length;
    const problem = Object.entries(cs).filter(([id, s]) => s.asked >= 2 && s.accuracy < 0.6 && cardIndex[id]).sort((a, b) => a[1].accuracy - b[1].accuracy || b[1].asked - a[1].asked).slice(0, 8);
    const daily = Stats.daily(A, 30);
    const week = A.filter(a => Date.now() - a.ts < 7 * 864e5), wk = Stats.overview(week);
    const dirLabel = a => a.show === 'mixed' ? 'Смешанно' : a.show === 'exam' ? 'Экзамен HSK' : LABELS.part[a.show] + ' → ' + (a.guess || []).map(p => LABELS.part[p]).join('+');
    const hskRows = [1, 2, 3].map(l => { const t = A.filter(a => a.mode === 'hsk' && a.level === l); if (!t.length) return null; const g = Stats.groupBy(t, () => l, () => 'HSK ' + l)[0]; return g; }).filter(Boolean);
    return `
    <div class="tiles">
      ${tile(ov.attempts, 'попыток всего')}${tile(ov.avgPercent + '%', 'средний результат')}
      ${tile(ov.avgScore, 'средний балл')}${tile(ov.best + '%', 'лучший результат', 'мин. ' + ov.worst + '%')}
      ${tile(ov.streak, 'дней подряд', 'рекорд ' + ov.bestStreak)}${tile(ov.days, 'дней с занятиями')}
      ${tile(ov.questions, 'вопросов', 'верно ' + ov.correct)}${tile(fmt.dur(ov.timeMs), 'общее время', fmt.secs(ov.avgQuestionMs) + '/вопрос')}
      ${tile(seen, 'карточек встречалось', 'из ' + (hskCards.length + state.cards.length))}${tile(mastered, 'освоено', '3+ верных подряд')}
      ${tile(wk.attempts, 'попыток за 7 дней', wk.attempts ? wk.avgPercent + '%' : '')}${tile(ov.passed + '/' + ov.hskTests, 'HSK сдано / тестов')}
    </div>
    <div class="panel"><div class="chart"><div class="chart-t"><span>Результат по дням</span><span>30 дней</span></div>${barChart(daily, d => d.avgPercent, { max: 100, suffix: '%' })}</div>
      <div class="chart mt"><div class="chart-t"><span>Вопросов по дням</span><span>макс. ${Math.max(...daily.map(d => d.questions))}</span></div>${barChart(daily, d => d.questions || null, { max: Math.max(10, ...daily.map(d => d.questions)) })}</div></div>
    <h2 class="h2">По колодам</h2>${table(Stats.groupBy(A, a => a.deckName, a => a.deckName), GROUP_COLS)}
    <h2 class="h2">По сложности</h2>${table(Stats.groupBy(A, a => a.difficulty, a => LABELS.diff[a.difficulty] || a.difficulty), GROUP_COLS)}
    <h2 class="h2">По режиму</h2>${table(Stats.groupBy(A, a => a.mode, a => LABELS.mode[a.mode] || a.mode), GROUP_COLS)}
    <h2 class="h2">По направлению</h2>${table(Stats.groupBy(A, dirLabel, dirLabel), GROUP_COLS)}
    ${hskRows.length ? `<h2 class="h2">HSK-тесты</h2>${table(hskRows, [{ h: '', f: r => r.label }, { h: 'Тестов', num: true, f: r => r.n }, { h: 'Сдано', num: true, f: r => r.passed }, { h: 'Средний', num: true, f: r => pctCell(r.avgPercent) }, { h: 'Лучший', num: true, f: r => r.best + '%' }, { h: 'Последний', num: true, f: r => fmt.date(r.last) }])}` : ''}
    <h2 class="h2">Проблемные карточки</h2>
    ${problem.length ? problem.map(([id, s]) => cardRow(cardIndex[id], s)).join('') + `<div class="btns"><button class="btn btn-secondary btn-block" data-go="stats" data-params="${attr({ tab: 'cards', filter: 'problem' })}" data-replace>Все проблемные</button></div>` : '<div class="empty">Нет карточек с точностью ниже 60% (минимум 2 вопроса).</div>'}`;
  }
  function cardRow(c, s) {
    const acc = Math.round(s.accuracy * 100);
    return `<button class="row tap" data-action="stat-card" data-id="${c.id}"><div class="row-card"><span class="hanzi sm">${esc(c.hanzi)}</span><span class="pinyin sm">${esc(c.pinyin)}</span><div class="ru sm">${esc(c.ru)}</div></div><div class="row-r"><div style="text-align:right"><span class="badge ${accClass(acc)}">${acc}%</span><div class="row-s">${s.correct}/${s.asked} · серия ${s.streak}</div></div></div></button>`;
  }
  function cardsTab(p) {
    const filter = p.filter || 'all', deck = p.deck || 'all', q = (p.q || '').toLowerCase();
    const cs = state.cardStats;
    let list = Object.entries(cs).map(([id, s]) => [cardIndex[id], s]).filter(([c]) => c);
    if (deck !== 'all') list = list.filter(([c]) => c.deckId === deck);
    if (filter === 'problem') list = list.filter(([, s]) => s.accuracy < 0.6);
    else if (filter === 'mastered') list = list.filter(([, s]) => s.mastered);
    if (q) { const qs = Pinyin.stripTones(q); list = list.filter(([c]) => c.hanzi.includes(q) || Pinyin.stripTones(c.pinyin).toLowerCase().includes(qs) || c.ru.toLowerCase().includes(q)); }
    list.sort((a, b) => filter === 'mastered' ? b[1].streak - a[1].streak : a[1].accuracy - b[1].accuracy || b[1].asked - a[1].asked);
    const segBtn = (k, l) => `<button class="${filter === k ? 'on' : ''}" data-go="stats" data-params="${attr({ ...p, tab: 'cards', filter: k })}" data-replace>${l}</button>`;
    return `<div class="seg mb">${segBtn('all', 'Все')}${segBtn('problem', 'Проблемные')}${segBtn('mastered', 'Освоенные')}</div>
    <select class="inp mb" id="deck-filter"><option value="all">Все колоды</option>${allDecks().map(d => `<option value="${d.id}" ${deck === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>
    <input class="inp search" id="card-q" placeholder="Поиск" value="${esc(p.q || '')}" autocomplete="off">
    <div class="hint" style="margin:8px 0">${fmt.plural(list.length, 'карточка', 'карточки', 'карточек')} · сортировка: ${filter === 'mastered' ? 'по серии' : 'сначала слабые'}</div>
    ${list.length ? list.slice(0, 200).map(([c, s]) => cardRow(c, s)).join('') : '<div class="empty">Ничего не найдено.</div>'}${list.length > 200 ? '<div class="hint">Показаны первые 200.</div>' : ''}`;
  }
  function logTab(p) {
    const mode = p.mode || 'all';
    let list = state.attempts.slice().reverse();
    if (mode !== 'all') list = list.filter(a => a.mode === mode);
    const segBtn = (k, l) => `<button class="${mode === k ? 'on' : ''}" data-go="stats" data-params="${attr({ tab: 'log', mode: k })}" data-replace>${l}</button>`;
    return `<div class="seg mb">${segBtn('all', 'Все')}${segBtn('quiz', 'Тесты')}${segBtn('flip', 'Карточки')}${segBtn('write', 'Письмо')}${segBtn('hsk', 'HSK')}</div>
    <div class="hint" style="margin:0 0 6px">${fmt.plural(list.length, 'попытка', 'попытки', 'попыток')} · каждая сохранена с ответами на все вопросы</div>
    ${list.length ? list.slice(0, 300).map(attemptRow).join('') : '<div class="empty">Пусто.</div>'}`;
  }
  views.stats = {
    render(p) {
      const tab = p.tab || 'overview';
      const tabs = `<div class="seg top-seg">${[['overview', 'Обзор'], ['cards', 'Карточки'], ['log', 'Журнал']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-go="stats" data-params="${attr({ tab: k })}" data-replace>${l}</button>`).join('')}</div>`;
      return `<div class="vh"><div class="seal">计</div><div class="grow"><h1 class="title">Статистика</h1><div class="sub">统计 · всё сохраняется подробно</div></div></div>${tabs}${tab === 'overview' ? overview() : tab === 'cards' ? cardsTab(p) : logTab(p)}`;
    },
    mount(p) {
      const df = $('#deck-filter'); if (df) df.addEventListener('change', () => nav('stats', { ...p, tab: 'cards', deck: df.value }, { replace: true }));
      const cq = $('#card-q'); if (cq) { let t; cq.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.params = { ...p, tab: 'cards', q: cq.value }; try { history.replaceState({ view: 'stats', params: state.params }, ''); } catch (e) { /* ignore */ } const pos = cq.selectionStart; render(); const n = $('#card-q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }, 250); }); }
    },
  };
  actions['stat-card'] = el => {
    const c = cardIndex[el.dataset.id], s = state.cardStats[c && c.id]; if (!c || !s) return;
    const hist = state.attempts.flatMap(a => (a.questions || []).filter(q => q.cardId === c.id).map(q => ({ ts: a.ts, q, mode: a.mode }))).reverse().slice(0, 12);
    sheet(`<div class="sh-card"><div class="hanzi mid ${c.hanzi.replace(/[…\s]/g, '').length >= 5 ? 'len5' : ''}">${esc(c.hanzi)}</div><div class="pinyin">${esc(c.pinyin)}</div><div class="ru">${esc(c.ru)}</div><div class="hint">${esc((deckById(c.deckId) || {}).name || '')}</div></div>
    <div class="tiles t3">${tile(s.asked, 'спрошено')}${tile(Math.round(s.accuracy * 100) + '%', 'точность')}${tile(s.streak, 'подряд верно')}</div>
    <div class="tiles t3">${tile(s.correct, 'верно')}${tile(s.partial, 'частично')}${tile(s.wrong, 'неверно')}</div>
    <div class="flabel">История</div>${hist.map(h => `<div class="fb-row"><span class="fb-p" style="min-width:96px">${fmt.date(h.ts)}</span><span class="fb-a ${h.q.ok ? 'exact' : h.q.fraction > 0 ? 'tones' : 'wrong'}" style="text-decoration:none">${h.q.ok ? 'верно' : h.q.fraction > 0 ? 'частично' : 'ошибка'}</span><span class="fb-v">${LABELS.part[h.q.show]} → ${(h.q.guess || []).map(x => LABELS.part[x]).join('+')}${h.q.ok ? '' : ' · ' + esc(App.answerText(h.q))}</span></div>`).join('')}`);
  };

  views.attempt = {
    render(p) {
      const a = state.attempts.find(x => x.id === p.id);
      if (!a) return '<div class="empty">Попытка не найдена</div>';
      const dir = a.show === 'mixed' ? 'смешанное направление' : a.show === 'exam' ? 'экзаменационный формат' + (a.examMax ? ', балл из ' + a.examMax : '') : LABELS.part[a.show] + ' → ' + (a.guess || []).map(x => LABELS.part[x]).join(' + ');
      return `<div class="vh"><button class="icon-btn" data-back>‹</button><div class="grow"><h1 class="title">${LABELS.mode[a.mode]}${a.level ? ' ' + a.level : ''}</h1><div class="sub">${fmt.date(a.ts)}${a.mode === 'hsk' ? '' : ' · ' + esc(a.deckName)}</div></div><button class="icon-btn" data-action="attempt-delete" data-id="${a.id}" aria-label="Удалить">🗑</button></div>
      <div class="tiles t3">${tile(a.percent + '%', 'результат')}${tile(a.score, 'балл')}${tile(fmt.dur(a.durationMs), 'время')}</div>
      <div class="tiles t3">${tile(a.correct, 'верно')}${tile(a.partial, 'частично')}${tile(a.wrong, 'неверно')}</div>
      <div class="panel"><div class="hint" style="margin:0">${a.mode !== 'flip' ? LABELS.diff[a.difficulty] + ' · ' : ''}${dir} · ${LABELS.order[a.order] || ''}${a.timer ? ' · таймер ' + a.timer + ' с' : ''} · ${fmt.secs(a.durationMs / a.total)} на вопрос${a.passed != null ? (a.passed ? ' · <b>сдан</b>' : ' · <b>не сдан</b>') : ''}${a.aborted ? ' · прервана на ' + a.total + ' из ' + a.planned : ''} · <b>+${Math.round(a.points != null ? a.points : Campaign.attemptPoints(a))} очк. похода</b></div></div>
      <h2 class="h2">Вопросы</h2>${a.questions.map(questionRow).join('')}
      <div class="btns"><button class="btn btn-secondary btn-block" data-action="retry-mistakes" data-id="${a.id}" ${a.questions.some(q => !q.ok) ? '' : 'disabled'}>Повторить ошибки</button></div>`;
    },
  };
  actions['attempt-delete'] = async el => {
    const a = state.attempts.find(x => x.id === el.dataset.id); if (!a) return;
    if (!await confirm('Удалить эту попытку из статистики?', { ok: 'Удалить', danger: true })) return;
    state.attempts = state.attempts.filter(x => x.id !== a.id); state.cardStats = Stats.cardStats(state.attempts);
    await Store.deleteAttempt(a.id); toast('Удалено'); nav('stats', { tab: 'log' }, { replace: true });
  };
})();
