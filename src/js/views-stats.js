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
    const dirLabel = a => a.show === 'mixed' ? 'Смешанно' : a.show === 'exam' ? 'Экзамен HSK' : (LABELS.part[a.show] || a.show) + ' → ' + (a.guess || []).map(p => LABELS.part[p] || p).join('+');
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
    const segBtn = (k, l) => `<button class="chip ${mode === k ? 'on' : ''}" data-go="stats" data-params="${attr({ tab: 'log', mode: k })}" data-replace>${l}</button>`;
    return `<div class="chips mb">${segBtn('all', 'Все')}${segBtn('quiz', 'Тесты')}${segBtn('flip', 'Карточки')}${segBtn('write', 'Письмо')}${segBtn('listen', 'Аудио')}${segBtn('sentence', 'Фразы')}${segBtn('hsk', 'HSK')}</div>
    <div class="hint" style="margin:0 0 6px">${fmt.plural(list.length, 'попытка', 'попытки', 'попыток')} · каждая сохранена с ответами на все вопросы</div>
    ${list.length ? list.slice(0, 300).map(attemptRow).join('') : '<div class="empty">Пусто.</div>'}`;
  }
  /* Боссы: сколько кого повержено и сколько без подсказок */
  function bossTab() {
    const fights = state.attempts.filter(a => a.mode === 'boss');
    const rows = Boss.LIST.map(b => {
      const r = Boss.bs(state, b.id);
      const mine = fights.filter(a => a.boss === b.id);
      const best = mine.filter(a => a.won).length;
      return `<div class="panel boss-card"><img class="boss-por" src="${IMG_URL(b.img)}" alt="">
        <div class="grow"><div class="boss-n"><span class="zh">${esc(b.zh)}</span> · ${esc(b.ru)}</div>
        <div class="fb-row"><span class="fb-p">Побед</span><span class="fb-v"><b>${r.wins}</b></span></div>
        <div class="fb-row"><span class="fb-p">Из них без подсказок</span><span class="fb-v"><b>${r.clean}</b></span></div>
        <div class="fb-row"><span class="fb-p">Вызовов</span><span class="fb-v">${r.tries}</span></div>
        <div class="fb-row"><span class="fb-p">Доля побед</span><span class="fb-v">${r.tries ? Math.round(best / r.tries * 100) + '%' : '—'}</span></div>
        </div></div>`;
    }).join('');
    const tot = Boss.LIST.reduce((s2, b) => { const r = Boss.bs(state, b.id); s2.w += r.wins; s2.c += r.clean; s2.t += r.tries; return s2; }, { w: 0, c: 0, t: 0 });
    return `<div class="tiles t3"><div class="tile"><div class="v">${tot.w}</div><div class="l">${fmt.plural(tot.w, 'победа', 'победы', 'побед').replace(/^\d+ /, '')} всего</div></div><div class="tile"><div class="v">${tot.c}</div><div class="l">без подсказок</div></div><div class="tile"><div class="v">${tot.t}</div><div class="l">${fmt.plural(tot.t, 'вызов', 'вызова', 'вызовов').replace(/^\d+ /, '')}</div></div></div>${rows}`;
  }
  views.stats = {
    render(p) {
      const tab = p.tab || 'overview';
      const tabs = `<div class="seg top-seg">${[['overview', 'Обзор'], ['cards', 'Карточки'], ['boss', 'Боссы'], ['log', 'Журнал']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-go="stats" data-params="${attr({ tab: k })}" data-replace>${l}</button>`).join('')}</div>`;
      return `<div class="vh"><div class="seal">计</div><div class="grow"><h1 class="title">Статистика</h1><div class="sub">统计 · всё сохраняется подробно</div></div></div>${tabs}${tab === 'overview' ? overview() : tab === 'cards' ? cardsTab(p) : tab === 'boss' ? bossTab() : logTab(p)}`;
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
      const dir = a.show === 'mixed' ? 'смешанное направление' : a.show === 'exam' ? 'экзаменационный формат' + (a.examMax ? ', балл из ' + a.examMax : '') : LABELS.part[a.show] ? LABELS.part[a.show] + ' → ' + (a.guess || []).map(x => LABELS.part[x] || x).join(' + ') : a.mode === 'phon' ? (a.difficulty === 'theory' ? 'разбор с примерами' : 'дрилл на слух') : '';
      return `<div class="vh"><button class="icon-btn" data-back>‹</button><div class="grow"><h1 class="title">${a.format === 'real' ? 'Экзамен HSK' : a.mode === 'phon' ? esc(a.deckName) : LABELS.mode[a.mode]}${a.level && (a.mode === 'hsk' || a.mode === 'boss') ? ' ' + a.level : ''}</h1><div class="sub">${fmt.date(a.ts)}${a.mode === 'hsk' || a.mode === 'phon' ? '' : ' · ' + esc(a.deckName)}</div></div><button class="icon-btn" data-action="attempt-delete" data-id="${a.id}" aria-label="Удалить">🗑</button></div>
      <div class="tiles t3">${tile(a.percent + '%', 'результат')}${a.score != null ? tile(a.score, 'балл') : tile('+' + Math.round(a.points != null ? a.points : Campaign.attemptPoints(a)), 'очков')}${tile(fmt.dur(a.durationMs), 'время')}</div>
      <div class="tiles t3">${tile(a.correct, 'верно')}${tile(a.partial, 'частично')}${tile(a.wrong, 'неверно')}</div>
      <div class="panel"><div class="hint" style="margin:0">${[a.mode !== 'flip' && LABELS.diff[a.difficulty] ? LABELS.diff[a.difficulty] : '', dir, a.mode === 'phon' ? '' : (LABELS.order[a.order] || ''), a.timer ? 'таймер ' + a.timer + ' с' : '', a.total > 1 || a.mode !== 'phon' ? fmt.secs(a.durationMs / a.total) + ' на вопрос' : '', a.passed != null ? (a.passed ? '<b>сдан</b>' : '<b>не сдан</b>') : '', a.aborted ? 'прервана на ' + a.total + ' из ' + a.planned : '', '<b>+' + Math.round(a.points != null ? a.points : Campaign.attemptPoints(a)) + ' очк. похода</b>'].filter(Boolean).join(' · ')}</div></div>
      <h2 class="h2">Вопросы</h2><div class="hint" style="margin:-4px 0 8px">Нажмите на вопрос — откроется разбор: что звучало, что было на картинке, какой ответ верный.</div>${a.questions.map((q, i) => questionRow(q, i, a.id)).join('')}
      <div class="btns">${a.format === 'real' ? `<button class="btn btn-secondary btn-block" data-go="exam-result" data-params="${attr({ id: a.id })}">Итог экзамена по этапам</button><button class="btn btn-secondary btn-block" data-action="hsk-real" data-level="${a.level || 1}">Ещё вариант HSK ${a.level || 1}</button>` : `<button class="btn btn-secondary btn-block" data-action="retry-mistakes" data-id="${a.id}" ${a.questions.some(q => !q.ok) ? '' : 'disabled'}>Повторить ошибки</button>`}</div>`;
    },
  };
  /* ── разбор одного вопроса ── */
  const SEC = { listening: ['听力', 'Аудирование'], reading: ['阅读', 'Чтение'], writing: ['书写', 'Письмо'] };
  const LET = 'ABCDEF';
  const picImg = id => `<img class="ex-pic" src="${IMG_URL('pic-' + id)}" alt="" draggable="false">`;
  const picOf = id => (window.HskReal && HskReal.picById(id)) || null;
  let glossMap = null;
  function gloss(h) {
    if (!h) return '';
    if (!glossMap) { glossMap = {}; Object.values(cardIndex || {}).forEach(c => { if (c && c.hanzi && !glossMap[c.hanzi]) glossMap[c.hanzi] = c; }); }
    const c = glossMap[String(h).trim()]; return c ? c.ru : '';
  }
  const withGloss = h => { const g = gloss(h); return `<span class="zh">${esc(h)}</span>${g ? ` <span class="muted">— ${esc(g)}</span>` : ''}`; };
  const mark = (isOk, isGiven) => (isOk ? ' rv-ok' : isGiven ? ' rv-bad' : '');
  const tag = (isOk, isGiven) => (isOk ? '<span class="rv-tag ok">верно</span>' : isGiven ? '<span class="rv-tag bad">ваш ответ</span>' : '');
  const sayBtn = lines => `<button class="btn btn-secondary btn-sm" data-action="q-say" data-t="${attr(lines)}" data-nosound>🔊 Прослушать</button>`;
  function examReview(q) {
    const x = q.ex || {};
    const lines = x.say != null ? (Array.isArray(x.say) ? x.say : [x.say]) : (q.sec === 'listening' && !x.type ? String(q.hanzi || '').split(' — ') : []);
    let h = `<div class="flabel">${SEC[q.sec] ? SEC[q.sec][0] + ' ' + SEC[q.sec][1] : esc(q.sec)} · часть ${q.part}</div>`;
    if (lines.length) h += `<div class="rv-say">${lines.map(l => `<div class="rv-line zh">${esc(l)}</div>`).join('')}<div class="mt">${sayBtn(lines)}</div></div>`;
    if (x.text) h += `<div class="rv-text"><span class="zh">${esc(x.text)}</span>${x.textPy ? ` <span class="pinyin sm">${esc(x.textPy)}</span>` : ''}${x.py ? ` <span class="pinyin sm">（${esc(x.py)}）</span>` : ''}${x.sub ? `<div class="rv-sub">${esc(x.sub)}</div>` : ''}</div>`;
    else if (!lines.length && !x.type) h += `<div class="rv-text zh">${esc(q.hanzi || '')}</div>`;   /* попытка до разбора: снимка нет, только текст */
    if (x.star) h += `<div class="ex-star">★ ${esc(x.star)}</div>`;
    if (x.type === 'tf') {
      const p = x.pic ? picOf(x.pic) : null;
      if (x.pic) h += `<div class="rv-pic">${picImg(x.pic)}${p ? `<div class="rv-cap">${withGloss(p.h)}${p.py ? ` <span class="pinyin sm">${esc(p.py)}</span>` : ''}</div>` : ''}</div>`;
      h += `<div class="rv-opts">${['对 · верно', '错 · неверно'].map((t, i) => `<div class="rv-opt${mark(i === x.correct, i === x.givenIdx)}">${t}${tag(i === x.correct, i === x.givenIdx)}</div>`).join('')}</div>`;
    } else if (x.type === 'pickpic' || x.type === 'poolpic') {
      const list = x.type === 'pickpic' ? (x.pics || []) : (x.pool || []);
      const okIdx = x.type === 'pickpic' ? x.correct : list.indexOf(x.answer);
      const gvIdx = x.type === 'pickpic' ? x.givenIdx : list.indexOf(x.given);
      h += `<div class="ex-pics rv-pics">${list.map((id, i) => { const p = picOf(id); return `<div class="ex-picbtn${mark(i === okIdx, i === gvIdx)}"><span class="ex-letter">${LET[i]}</span>${picImg(id)}${p ? `<div class="rv-cap sm">${withGloss(p.h)}</div>` : ''}${i === okIdx ? '<span class="rv-tag ok">верно</span>' : i === gvIdx ? '<span class="rv-tag bad">ваш</span>' : ''}</div>`; }).join('')}</div>`;
    } else if (x.type === 'opts') {
      h += `<div class="rv-opts">${(x.opts || []).map((o, i) => `<div class="rv-opt${mark(i === x.correct, i === x.givenIdx)}"><b>${LET[i]}</b> ${withGloss(o)}${tag(i === x.correct, i === x.givenIdx)}</div>`).join('')}</div>`;
    } else if (x.type === 'pool') {
      h += `<div class="rv-opts">${(x.pool || []).map((o, i) => `<div class="rv-opt${mark(o === x.answer, o === x.given)}"><b>${LET[i]}</b> ${withGloss(o)}${tag(o === x.answer, o === x.given)}</div>`).join('')}</div>`;
    } else if (x.type === 'arrange') {
      h += `<div class="chips rv-chips">${(x.chunks || []).map(c => `<span class="chip">${esc(c)}</span>`).join('')}</div>
        <div class="rv-opts"><div class="rv-opt rv-ok"><span class="zh">${esc((x.answers || [])[0] || q.co || '')}</span>${tag(true)}</div>${q.ok ? '' : `<div class="rv-opt rv-bad"><span class="zh">${esc(x.given || (q.answer && q.answer.given) || '—')}</span>${tag(false, true)}</div>`}</div>`;
    } else if (x.type === 'input') {
      h += `<div class="rv-opts"><div class="rv-opt rv-ok">${withGloss(x.answer)}${tag(true)}</div>${q.ok ? '' : `<div class="rv-opt rv-bad"><span class="zh">${esc(x.given || '—')}</span>${tag(false, true)}</div>`}</div>`;
    } else {
      h += `<div class="rv-opts"><div class="rv-opt rv-ok">${esc(q.co || '')}${tag(true)}</div>${q.ok ? '' : `<div class="rv-opt rv-bad">${esc((q.answer && q.answer.given) || '—')}${tag(false, true)}</div>`}</div>`;
    }
    return h;
  }
  function trainReview(q) {
    const c = q.cardId && cardIndex ? cardIndex[q.cardId] : null;
    const parts = q.parts || {};
    const partRow = (k, v) => `<div class="fb-row"><span class="fb-p">${LABELS.part[k] || esc(k)}</span><span class="fb-a ${v === 'exact' ? 'exact' : v === 'tones' ? 'tones' : 'wrong'}" style="text-decoration:none">${v === 'exact' ? 'верно' : v === 'tones' ? 'не те тоны' : v === 'wrong' ? 'ошибка' : esc(String(v))}</span></div>`;
    return `<div class="sh-card"><div class="hanzi mid">${esc(q.hanzi)}</div><div class="pinyin">${esc(q.pinyin || '')}</div><div class="ru">${esc(q.ru || '')}</div></div>
      <div class="fb-row"><span class="fb-p">Показано</span><span class="fb-v">${LABELS.part[q.show] || esc(q.show || '—')}</span></div>
      <div class="fb-row"><span class="fb-p">Спрошено</span><span class="fb-v">${(q.guess || []).map(p => LABELS.part[p] || esc(p)).join(' + ') || '—'}</span></div>
      <div class="fb-row"><span class="fb-p">Ваш ответ</span><span class="fb-v ${q.ok ? 'ok-t' : 'bad-t'}">${esc(App.answerText(q))}</span></div>
      ${Object.keys(parts).length ? `<div class="flabel">По частям</div>${Object.entries(parts).map(([k, v]) => partRow(k, v)).join('')}` : ''}
      <div class="btns mt">${sayBtn([q.hanzi])}${c ? `<button class="btn btn-secondary btn-block" data-action="stat-card" data-id="${esc(c.id)}">Карточка и история</button>` : ''}</div>`;
  }
  actions['q-review'] = el => {
    const a = state.attempts.find(x => x.id === el.dataset.id); if (!a) return;
    const i = +el.dataset.i, q = (a.questions || [])[i]; if (!q) return;
    const st = q.ok ? '<span class="rv-tag ok">верно</span>' : q.fraction > 0 ? '<span class="rv-tag half">частично</span>' : '<span class="rv-tag bad">ошибка</span>';
    const n = a.questions.length;
    const head = `<div class="rv-nav"><button class="icon-btn" data-action="q-review" data-id="${esc(a.id)}" data-i="${i - 1}" ${i > 0 ? '' : 'disabled'} data-nosound aria-label="Предыдущий">‹</button><span>Вопрос ${i + 1} из ${n}</span><button class="icon-btn" data-action="q-review" data-id="${esc(a.id)}" data-i="${i + 1}" ${i < n - 1 ? '' : 'disabled'} data-nosound aria-label="Следующий">›</button></div>`;
    sheet(`${head}<div class="rv-head">${st}${q.ms ? `<span class="muted">${fmt.secs(q.ms)}</span>` : ''}</div>${q.sec ? examReview(q) : trainReview(q)}<button class="btn btn-primary btn-block mt" data-close>Закрыть</button>`);
  };
  actions['q-say'] = async el => {
    let lines = []; try { lines = JSON.parse(el.dataset.t || '[]'); } catch (e) { return; }
    if (!Speech.available()) return toast('Нет китайского голоса — установите его в настройках телефона', 3000);
    for (const t of lines) await Speech.speak(String(t));
  };
  actions['attempt-delete'] = async el => {
    const a = state.attempts.find(x => x.id === el.dataset.id); if (!a) return;
    if (!await confirm('Удалить эту попытку из статистики?', { ok: 'Удалить', danger: true })) return;
    state.attempts = state.attempts.filter(x => x.id !== a.id); state.cardStats = Stats.cardStats(state.attempts);
    await Store.deleteAttempt(a.id); toast('Удалено'); nav('stats', { tab: 'log' }, { replace: true });
  };
})();
