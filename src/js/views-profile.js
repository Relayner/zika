/* Профиль персонажа: кот-воин, ранг, поход по дням, прогресс дня, галерея рангов, повышение. */
(() => {
  const { state, views, actions, nav, esc, attr, $, toast, sheet, closeSheet, fmt, attemptRow, LABELS } = App;
  const R = () => Cats.RANKS;
  const pt = n => String(Math.round(n));
  function info() {
    const c = state.campaign || Campaign.create();
    const today = Campaign.todayState(c, state.attempts);
    const days = Campaign.effectiveDays(c, state.attempts);
    const rp = Campaign.rankProgress(days);
    return { c, today, days, rp, rank: R()[rp.idx], idx: rp.idx, peak: Math.max(c.rankPeak || 0, rp.idx) };
  }
  /* Полоса дня: линейная шкала 0…Марш-бросок; подписи стоят под своими рисками, остаток — отдельной строкой */
  function todayBar(t, compact) {
    const capPos = Campaign.CAP / Campaign.ULTRA * 100;
    const w = Math.min(100, t.points / Campaign.ULTRA * 100);
    const zh = Campaign.NAMES.ultraZh;
    const status = t.ultra ? `${zh} Марш-бросок! День зачтён за два` : t.done ? `Переход зачтён ✓ · до марш-броска ещё ${pt(t.toUltra)}` : `Ещё ${pt(t.toCap)} до перехода · ${pt(t.toUltra)} до марш-броска`;
    return `<div class="tbar ${t.ultra ? 'ultra' : t.done ? 'done' : ''}">
      <div class="tbar-track"><i style="width:${w}%"></i><b class="tbar-mark" style="left:${capPos}%"></b><b class="tbar-mark end"></b></div>
      <div class="tbar-ticks"><span class="cap" style="left:${capPos}%">${Campaign.CAP} · переход${t.done ? ' ✓' : ''}</span><span class="end">${Campaign.ULTRA} · ${zh}${t.ultra ? ' ✓' : ''}</span></div>
      <div class="tbar-status ${compact ? 'small' : ''}">${status}</div></div>`;
  }
  function dayBar(days, idx) {
    const n = Campaign.TOTAL_DAYS, per = Campaign.DAYS_PER_RANK;
    return `<div class="dbar">${Array.from({ length: n }, (_, i) => `<i class="${i < days ? 'on' : ''}${i === days ? ' cur' : ''}${i % per === 0 && i ? ' tick' : ''}${Math.floor(i / per) === idx ? ' rank' : ''}"></i>`).join('')}</div>`;
  }
  function dots(list) {
    return `<div class="dots">${list.map(d => `<i class="${d.r}${d.r === 'today' ? (d.ultra ? ' ultra' : d.done ? ' done' : '') : ''}" title="${d.d}"></i>`).join('')}</div>`;
  }
  function card(idx, opts = {}) {
    const r = R()[idx];
    return `<div class="cat-stage ${opts.small ? 'small' : ''}">${Cats.imgTag(idx)}</div>`;
  }
  views.profile = {
    render() {
      const { c, today, days, rp, rank, idx, peak } = info();
      const todayAttempts = state.attempts.filter(a => Stats.dayKey(a.ts) === today.key).slice().reverse();
      const recent = Campaign.recent(c, state.attempts, 30);
      const next = rp.complete ? null : R()[Math.min(idx + 1, R().length - 1)];
      const started = !!c.startedAt;
      return `<div class="vh"><button class="icon-btn" data-back>‹</button><div class="grow"><h1 class="title">Поход</h1><div class="sub">Ранг ${idx + 1} из ${Campaign.RANKS} · день ${Math.min(days, Campaign.TOTAL_DAYS)} из ${Campaign.TOTAL_DAYS}${rp.complete ? ' · поход завершён' : ''}</div></div></div>
      <div class="panel ornate hero-cat">
        ${card(idx)}
        <div class="rank-zh">${rank.zh}</div><div class="rank-py">${rank.py}</div><div class="rank-ru">${esc(rank.ru)}</div>
        <div class="motto"><div class="motto-zh">${rank.motto}</div><div class="motto-py">${rank.mpy}</div><div class="motto-ru">${esc(rank.mru)}</div></div>
        <div class="bio">${esc(rank.bio)}</div>
      </div>
      <div class="panel">
        <div class="flabel">Поход · ${Campaign.TOTAL_DAYS} дней</div>
        ${dayBar(days, idx)}
        <div class="hint" style="margin-top:8px">${rp.complete ? `Все ${Campaign.TOTAL_DAYS} дней пройдены${rp.extra ? ' · сверх похода: ' + rp.extra : ''}. Держите строй — пропуски по-прежнему откатывают.` : `До ранга «${esc(next.ru)}» — ${fmt.plural(rp.toNext, 'день', 'дня', 'дней')}. Каждые ${Campaign.DAYS_PER_RANK} зачтённых дня — новый ранг.`}</div>
        <div class="level-stats"><span>Зачтено: <b>${(c.stats && c.stats.done) || 0}</b></span><span>Марш-бросков: <b>${(c.stats && c.stats.ultra) || 0}</b></span><span>Пропусков: <b>${(c.stats && c.stats.miss) || 0}</b></span></div>
      </div>
      <div class="panel">
        <div class="flabel">Сегодня</div>
        ${todayBar(today)}
        <div class="flabel mt">Шаги дня</div>
        ${todayAttempts.length ? todayAttempts.map(a => `<div class="step"><span class="step-n">+${pt(a.points != null ? a.points : Campaign.attemptPoints(a))}</span><span class="step-t">${LABELS.mode[a.mode] || a.mode}${a.level ? ' ' + a.level : ''} · ${esc(a.deckName)} · ${a.percent}%</span><span class="step-time">${fmt.date(a.ts).split(', ')[1]}</span></div>`).join('') : '<div class="empty">Сегодня шагов ещё не было — любая тренировка добавит очки.</div>'}
      </div>
      <div class="panel">
        <div class="flabel">Последние 30 дней</div>
        ${dots(recent)}
        <div class="legend"><span><i class="done"></i>переход</span><span><i class="ultra"></i>марш-бросок</span><span><i class="miss"></i>пропуск</span><span><i class="today"></i>сегодня</span></div>
        ${started ? '' : '<div class="hint">Поход начнётся с первой тренировки: с этого дня пропуски считаются.</div>'}
      </div>
      ${treasuryPanel()}
      <h2 class="h2">Ранги</h2>
      <div class="gallery">${R().map((r, i) => `<button class="cell ${i > peak ? 'locked' : ''} ${i === idx ? 'cur' : ''}" data-action="rank-info" data-idx="${i}" data-nosound>${Cats.imgTag(i)}<div class="cell-n">${i + 1}</div><div class="cell-t">${i > peak ? '???' : esc(r.ru)}</div></button>`).join('')}</div>
      <div class="panel"><div class="flabel">Правила похода</div><div class="hint" style="margin:0">
        Очки даются за каждый верный ответ: тест ×${Campaign.BASE.quiz.easy}/${Campaign.BASE.quiz.medium}/${Campaign.BASE.quiz.hard} (лёгкий/средний/сложный), письмо ×${Campaign.BASE.write.easy}–${Campaign.BASE.write.hard}, карточки ×${Campaign.BASE.flip}, экзамен ×${Campaign.BASE.hsk}; частичный ответ — половина. Бонусы: законченная тренировка от 10 вопросов +${Campaign.BONUS.finish}, без ошибок +${Campaign.BONUS.perfect}, сданный экзамен +${Campaign.BONUS.pass}.<br>
        <b>${Campaign.NAMES.cap}</b> — ${Campaign.CAP} очков за день (≈ 20 минут): день зачтён. <b>${Campaign.NAMES.ultra} ${Campaign.NAMES.ultraZh}</b> — ${Campaign.ULTRA} очков: день зачтён за два. День без перехода откатывает поход на день. Ранг растёт только по дням — за один день выше не прыгнуть.</div></div>`;
    },
  };
  const rar = id => Treasures.RARITY[Treasures.byId[id].rarity];
  function itemCard(id, n) {
    const it = Treasures.byId[id];
    return `<button class="inv-cell r-${it.rarity}" data-action="item-info" data-id="${it.id}" data-nosound><img src="${IMG_URL('treasure-' + it.id)}" alt="" draggable="false"><div class="inv-n">${it.zh}</div><div class="inv-t">${esc(it.ru)}</div>${n > 1 ? `<div class="inv-c">×${n}</div>` : ''}</button>`;
  }
  function treasuryPanel() {
    const c = Campaign.ensureChests(state.campaign);
    const inv = c.inventory, total = Treasures.value(inv), n = Treasures.count(inv);
    const items = Treasures.ITEMS.filter(i => inv[i.id]).sort((a, b) => Treasures.ORDER.indexOf(b.rarity) - Treasures.ORDER.indexOf(a.rarity) || b.value - a.value);
    return `<div class="panel ornate"><div class="flabel">Сокровищница · <span class="camp-plus">${Treasures.fmtValue(total)}</span></div>
      <div class="chest-row"><img class="chest-img ${c.chests.pending ? 'waiting' : ''}" src="${IMG_URL(c.chests.pending ? 'chest-closed' : 'chest-open')}" alt="" draggable="false"><div class="grow"><div class="row-t">${c.chests.pending ? fmt.plural(c.chests.pending, 'сундук ждёт', 'сундука ждут', 'сундуков ждут') : 'Сундуков пока нет'}</div><div class="row-s">Сундук — за каждый марш-бросок ${Campaign.NAMES.ultraZh} (${Campaign.ULTRA} очков за день). Внутри ${Treasures.PER_CHEST} предмета разной редкости.</div></div></div>
      ${c.chests.pending ? '<button class="btn btn-primary btn-block" data-action="open-chest">Открыть сундук</button>' : ''}
      ${items.length ? `<div class="inv">${items.map(i => itemCard(i.id, inv[i.id])).join('')}</div>` : '<div class="empty" style="margin-top:10px">Пока пусто. Первый марш-бросок — первый сундук.</div>'}
      <div class="rar-legend">${Treasures.ORDER.map(k => `<span class="r-${k}"><i></i>${Treasures.RARITY[k].ru} · ${Treasures.RARITY[k].w}%</span>`).join('')}</div>
      <div class="hint">Открыто сундуков: ${c.chests.opened} · предметов: ${n}. На что тратить — появится позже.</div></div>`;
  }
  actions['open-chest'] = () => {
    const c = state.campaign, entry = Campaign.openChest(c);
    if (!entry) return toast('Сундуков нет');
    App.persist();
    const best = entry.items.map(id => Treasures.ORDER.indexOf(Treasures.byId[id].rarity)).reduce((a, b) => Math.max(a, b), 0);
    Sound.finish(true); if (best >= 3) setTimeout(() => Sound.finish(true), 600);
    sheet(`<div class="reveal"><div class="rankup-t">开箱 · Сундук открыт!</div><img class="reveal-chest" src="${IMG_URL('chest-open')}" alt="" draggable="false"><div class="reveal-items">${entry.items.map((id, i) => { const it = Treasures.byId[id]; return `<div class="reveal-card r-${it.rarity}" style="animation-delay:${.25 + i * .35}s"><img src="${IMG_URL('treasure-' + id)}" alt="" draggable="false"><div class="inv-n">${it.zh}</div><div class="inv-t">${esc(it.ru)}</div><div class="rar-tag">${rar(id).ru} · ${Treasures.fmtValue(it.value)}</div></div>`; }).join('')}</div><div class="hint" style="text-align:center">Итого ${Treasures.fmtValue(entry.value)}${c.chests.pending ? ' · ещё ' + fmt.plural(c.chests.pending, 'сундук', 'сундука', 'сундуков') : ''}</div></div><button class="btn btn-primary btn-block mt" data-close>В сокровищницу</button>`);
    const m = $('#modal'); const onClose = () => { m.removeEventListener('sheet-closed', onClose); };
    const prev = App.closeSheet; // после закрытия перерисовать профиль
    const obs = new MutationObserver(() => { if (!m.classList.contains('open')) { obs.disconnect(); if (state.view === 'profile') App.render(); } }); obs.observe(m, { attributes: true, attributeFilter: ['class'] });
  };
  actions['item-info'] = el => {
    const it = Treasures.byId[el.dataset.id]; if (!it) return;
    const n = (Campaign.ensureChests(state.campaign).inventory || {})[it.id] || 0;
    Sound.click();
    sheet(`<div class="reveal"><div class="reveal-card big r-${it.rarity}"><img src="${IMG_URL('treasure-' + it.id)}" alt="" draggable="false"><div class="inv-n">${it.zh}</div><div class="rank-py">${it.py}</div><div class="inv-t">${esc(it.ru)}</div><div class="rar-tag">${Treasures.RARITY[it.rarity].zh} ${Treasures.RARITY[it.rarity].ru} · шанс ${Treasures.RARITY[it.rarity].w}% · ${Treasures.fmtValue(it.value)}${n ? ' · у вас ×' + n : ''}</div><div class="bio">${esc(it.desc)}</div></div></div><button class="btn btn-secondary btn-block mt" data-close>Закрыть</button>`);
  };
  actions['rank-info'] = el => {
    const i = +el.dataset.idx, { peak, idx } = info(), r = R()[i];
    if (i > peak) { Sound.fail(); return toast('Этот ранг ещё впереди — продолжайте поход'); }
    Sound.click();
    sheet(`<div class="rankup-card">${Cats.imgTag(i)}<div class="rank-zh">${r.zh}</div><div class="rank-py">${r.py}</div><div class="rank-ru">${esc(r.ru)} · ранг ${i + 1}${i === idx ? ' · текущий' : ''}</div><div class="motto"><div class="motto-zh">${r.motto}</div><div class="motto-py">${r.mpy}</div><div class="motto-ru">${esc(r.mru)}</div></div><div class="bio">${esc(r.bio)}</div></div><button class="btn btn-secondary btn-block mt" data-close>Закрыть</button>`);
  };
  function showRankUp(i) {
    const r = R()[i];
    sheet(`<div class="rankup-card"><div class="rankup-t">晋升 · Новый ранг!</div>${Cats.imgTag(i)}<div class="rank-zh">${r.zh}</div><div class="rank-py">${r.py}</div><div class="rank-ru">${esc(r.ru)} · ранг ${i + 1} из ${Campaign.RANKS}</div><div class="motto"><div class="motto-zh">${r.motto}</div><div class="motto-py">${r.mpy}</div><div class="motto-ru">${esc(r.mru)}</div></div><div class="bio">${esc(r.bio)}</div></div><button class="btn btn-primary btn-block mt" data-close>В строй!</button>`);
  }
  /* Компактная панель похода для главной */
  function homePanel() {
    const { today, days, rp, rank, idx } = info();
    return `<button class="panel ornate camp tap" data-go="profile"><div class="camp-ava">${Cats.imgTag(idx)}</div><div class="camp-body"><div class="camp-rank">${rank.zh} · ${esc(rank.ru)}</div><div class="camp-sub">Ранг ${idx + 1} · день ${Math.min(days, Campaign.TOTAL_DAYS)} из ${Campaign.TOTAL_DAYS}${rp.complete ? ' ✓' : ' · до ранга ' + rp.toNext + ' дн.'}</div>${todayBar(today, true)}</div><span class="chev">›</span></button>`;
  }
  /* Панель на экране результата */
  function resultPanel(a, ev) {
    const { today } = info();
    const p = a.points != null ? a.points : Campaign.attemptPoints(a);
    const note = ev && ev.rankUp ? `Повышение: ${esc(R()[ev.rank].ru)}!` : ev && ev.chest ? `${Campaign.NAMES.ultraZh} Марш-бросок — сундук ждёт в профиле!` : ev && ev.ultra ? `${Campaign.NAMES.ultraZh} Марш-бросок — день зачтён за два!` : ev && ev.cap ? `${Campaign.NAMES.cap} зачтён — +1 день похода` : '';
    return `<div class="panel camp-res"><div class="flabel">Поход · <span class="camp-plus">+${pt(p)} очк.</span>${note ? ` · <b>${note}</b>` : ''}</div>${todayBar(today)}</div>`;
  }
  function avatarButton() {
    const { idx } = info();
    return `<button class="avatar-btn" data-go="profile" aria-label="Профиль"><span class="ava">${Cats.imgTag(idx)}</span><span class="ava-n">${idx + 1}</span></button>`;
  }
  App.Profile = { info, todayBar, dayBar, dots, showRankUp, homePanel, resultPanel, avatarButton };
})();
