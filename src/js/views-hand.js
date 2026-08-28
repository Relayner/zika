/* Письмо от руки 手写: клетка 田字格, разбор по чертам, четыре ступени от обводки до диктанта. */
(() => {
  const { state, views, actions, nav, esc, attr, uid, $, toast, sheet, closeSheet, persist, render, saveAttempt, fmt, cardsOfDeck, builtinDecks } = App;
  const H = window.HANDWRITING;
  let hw = null;   /* { chars, i, strokeIdx, drawn, mistakes, mode, level, results, startedAt } */

  const MODES = [
    { k: 'trace', zh: '描', t: 'Обводка', d: 'Знак виден целиком, для каждой черты — точка начала и направление', pts: 5 },
    { k: 'hint', zh: '临', t: 'С подсказкой', d: 'Знак виден бледно, подсказка по черте появляется только после ошибки', pts: 8 },
    { k: 'memory', zh: '默', t: 'По памяти', d: 'Пустая клетка, дан только перевод и пиньинь', pts: 12 },
    { k: 'dictation', zh: '听', t: 'Диктант', d: 'Слово произносят вслух — пишете, не видя ни знака, ни перевода', pts: 15 },
  ];
  const modeOf = k => MODES.find(m => m.k === k) || MODES[0];

  /* ── выбор занятия ── */
  views.hand = {
    render() {
      const prof = Skill.profile(state);
      const hs = (prof.hand || {}).score;
      const recMode = hs == null || hs < 60 ? 'trace' : hs < 75 ? 'hint' : hs < 90 ? 'memory' : 'dictation';
      const cur = state.settings.handMode || 'trace';
      const decks = builtinDecks.filter(d => d.level);
      const cards = state.settings.handDeck || 'hsk1';
      return `<div class="vh"><div class="seal">手</div><div class="grow"><h1 class="title">Письмо от руки</h1><div class="sub">手写 · черта за чертой, в верном порядке</div></div><button class="icon-btn" data-action="hand-info" aria-label="Как это работает">i</button></div>
      <div class="panel"><div class="flabel">Как писать</div><div class="seg wrap">${MODES.map(m => `<button class="${cur === m.k ? 'on' : ''}" data-action="hand-mode" data-k="${m.k}"><span class="zh">${m.zh}</span> ${m.t}${m.k === recMode ? ' ·☆' : ''}</button>`).join('')}</div>
        <div class="hint" style="margin:10px 0 0">${esc(modeOf(cur).d)}${cur !== recMode ? ` · по вашей форме советуем «${modeOf(recMode).t}»` : ' · это ваша ступень по форме'}</div></div>
      <div class="panel"><div class="flabel">Откуда брать знаки</div><div class="seg wrap">${decks.map(d => `<button class="${cards === d.id ? 'on' : ''}" data-action="hand-deck" data-id="${d.id}">${esc(d.name)}</button>`).join('')}</div></div>
      <div class="panel"><div class="flabel">Уроки письма</div>
        ${H.COURSE.map(c => `<button class="row tap" data-action="hand-course" data-id="${c.id}"><div><div class="row-t"><span class="zh">${c.zh}</span> · ${esc(c.ru)}</div><div class="row-s">${esc(c.can)}</div></div><div class="row-r"><span class="chev">›</span></div></button>`).join('')}</div>
      <button class="btn btn-primary btn-block btn-lg" data-action="hand-start">Начать · 8 знаков</button>
      <div class="panel"><div class="flabel">Основа</div>
        <button class="row tap" data-action="hand-theory" data-k="strokes"><div><div class="row-t">Восемь черт 笔画</div><div class="row-s">как ведётся каждая</div></div><span class="chev">›</span></button>
        <button class="row tap" data-action="hand-theory" data-k="rules"><div><div class="row-t">Правила порядка 笔顺</div><div class="row-s">семь правил, по которым пишут все знаки</div></div><span class="chev">›</span></button>
        <button class="row tap" data-action="hand-theory" data-k="struct"><div><div class="row-t">Строение знака 结构</div><div class="row-s">из каких частей собирается иероглиф</div></div><span class="chev">›</span></button></div>`;
    },
  };
  actions['hand-mode'] = el => { state.settings.handMode = el.dataset.k; persist(); render(); };
  actions['hand-deck'] = el => { state.settings.handDeck = el.dataset.id; persist(); render(); };
  actions['hand-info'] = () => sheet(`<h3 class="sh-t">Как устроено письмо от руки</h3><div class="install-note">
    <p>Знак пишется <b>по чертам и в правильном порядке</b>. Приложение сверяет каждую черту: откуда начали, куда вели и совпал ли путь.</p>
    <p>Черта не засчитывается, если ведёте её в обратную сторону — в китайском направление черты часть нормы, а не мелочь.</p>
    <p>Клетка 田字格 с диагоналями — та же, по которой учатся в китайской школе: она держит пропорции.</p>
    <p>Ошиблись дважды на одной черте — появится подсказка. Очки за знак зависят от того, сколько подсказок понадобилось.</p></div>
    <button class="btn btn-primary btn-block mt" data-close>Понятно</button>`);
  actions['hand-theory'] = el => {
    const k = el.dataset.k;
    const body = (k === 'strokes'
      ? H.STROKES.map(s => `<div class="th-row"><span class="zh th-ex">${s.ex}</span><div><b><span class="zh">${s.zh}</span> ${s.py} — ${esc(s.ru)}</b><div class="hint" style="margin:2px 0 0">${esc(s.d)}</div></div></div>`).join('')
      : k === 'rules'
        ? H.RULES.map(r => `<div class="th-row"><span class="zh th-ex">${r.ex}</span><div><b>${esc(r.t)} · <span class="zh">${r.zh}</span></b><div class="hint" style="margin:2px 0 0">${esc(r.d)}</div></div></div>`).join('')
        : H.STRUCT.map(r => `<div class="th-row"><span class="zh th-ex">${r.ex.split(' ')[0]}</span><div><b>${esc(r.t)} · <span class="zh">${r.zh}</span></b><div class="hint" style="margin:2px 0 0">${esc(r.d)} Например: <span class="zh">${esc(r.ex)}</span></div></div></div>`).join(''));
    sheet(`<h3 class="sh-t">${k === 'strokes' ? 'Восемь черт 笔画' : k === 'rules' ? 'Правила порядка 笔顺' : 'Строение знака 结构'}</h3><div class="theory">${body}</div><button class="btn btn-primary btn-block mt" data-close>Понятно</button>`);
  };
  actions['hand-course'] = el => { const c = H.COURSE.find(x => x.id === el.dataset.id); if (c) startHand(c.chars.split(' ').filter(Boolean), c.lvl || 1, c.ru); };
  actions['hand-start'] = async () => {
    const deck = state.settings.handDeck || 'hsk1';
    try { await Strokes.load(); } catch (e) { return toast(e.message, 3000); }   /* без данных known() всем отказывал */
    const cards = cardsOfDeck(deck).filter(c => Strokes.known(c.hanzi) && c.hanzi.length <= 2);
    if (!cards.length) return toast('Для этой колоды нет данных о чертах');
    const pick = HskReal.shuffle(cards).slice(0, 8);
    startHand(pick.map(c => c.hanzi), (builtinDecks.find(d => d.id === deck) || {}).level || 1, (builtinDecks.find(d => d.id === deck) || {}).name);
  };

  async function startHand(words, level, title) {
    toast('Готовлю клетку…', 1200);
    try { await Strokes.load(); } catch (e) { return toast(e.message, 3000); }
    const chars = [];
    words.forEach(w => [...w].forEach(ch => { if (Strokes.has(ch) && !chars.includes(ch)) chars.push(ch); }));
    if (!chars.length) return toast('Нет знаков с данными о чертах');
    hw = { chars: chars.slice(0, 12), i: 0, strokeIdx: 0, drawn: [], tries: 0, results: [], mode: state.settings.handMode || 'trace',
      level, title: title || '', startedAt: Date.now(), hintShown: false, done: 0 };
    nav('hand-run');
  }

  /* ── холст ── */
  const cardOf = ch => {
    for (const d of builtinDecks) { const c = cardsOfDeck(d.id).find(x => x.hanzi === ch); if (c) return c; }
    return null;
  };
  views['hand-run'] = {
    render() {
      if (!hw) return '<div class="empty">Занятие не начато</div>';
      const ch = hw.chars[hw.i];
      const m = modeOf(hw.mode);
      const card = cardOf(ch);
      const total = Strokes.of(ch).length;
      const prompt = hw.mode === 'memory'
        ? `<div class="hw-prompt"><b>${esc(card ? card.pinyin : '')}</b><div>${esc(card ? card.ru : '')}</div></div>`
        : hw.mode === 'dictation'
          ? `<div class="hw-prompt"><button class="btn btn-secondary btn-sm" data-action="hand-say" data-nosound>🔊 Повторить</button></div>`
          : '';
      return `<div class="qbar"><button class="icon-btn" data-action="hand-quit">✕</button><div class="progress"><i style="width:${hw.i / hw.chars.length * 100}%"></i></div><div class="qcount">${hw.i + 1}/${hw.chars.length}</div><div class="qtimer"><span class="zh">${m.zh}</span></div></div>
      ${prompt}
      <div class="hw-wrap"><canvas id="hw-c" class="hw-canvas" width="640" height="640"></canvas></div>
      <div class="hw-info"><span>Черта <b>${hw.strokeIdx + 1}</b> из ${total}</span><span id="hw-msg" class="hw-msg"></span></div>
      <div class="btns row2"><button class="btn btn-secondary" data-action="hand-undo">Стереть черту</button><button class="btn btn-secondary" data-action="hand-hint">Подсказать</button></div>
      <button class="btn btn-secondary btn-block btn-sm" data-action="hand-skip">Пропустить знак</button>`;
    },
    mount() { if (hw) setupCanvas(); },
  };
  actions['hand-say'] = () => { if (hw) Speech.say(hw.chars[hw.i]); };
  actions['hand-quit'] = () => { hw = null; nav('hand', {}, { replace: true }); };
  actions['hand-undo'] = () => { if (hw && hw.strokeIdx > 0) { hw.strokeIdx--; hw.tries = 0; hw.hintShown = false; render(); } };
  actions['hand-hint'] = () => { if (hw) { hw.hintShown = true; hw.usedHint = (hw.usedHint || 0) + 1; render(); } };
  actions['hand-skip'] = () => { if (hw) { hw.results.push({ ch: hw.chars[hw.i], ok: false, tries: hw.tries, skipped: true }); nextChar(); } };

  function nextChar() {
    hw.i++; hw.strokeIdx = 0; hw.tries = 0; hw.hintShown = false;
    if (hw.i >= hw.chars.length) return finish();
    render();
    if (hw.mode === 'dictation') setTimeout(() => Speech.say(hw.chars[hw.i]), 400);
  }

  function setupCanvas() {
    const cv = $('#hw-c');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const S = cv.width;
    const ch = hw.chars[hw.i];
    const medians = Strokes.of(ch);
    const pt = p => Strokes.toScreen(p, S);
    let drawing = false, cur = [];

    function grid() {
      ctx.clearRect(0, 0, S, S);
      ctx.fillStyle = 'rgba(255,255,255,0.02)'; ctx.fillRect(0, 0, S, S);
      ctx.strokeStyle = 'rgba(180,140,60,0.45)'; ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, S - 2, S - 2);
      ctx.setLineDash([8, 10]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2);
      ctx.moveTo(0, 0); ctx.lineTo(S, S); ctx.moveTo(S, 0); ctx.lineTo(0, S); ctx.stroke();
      ctx.setLineDash([]);
    }
    function ghost() {
      /* образец знака: в обводке ярко, с подсказкой — бледно, по памяти и в диктанте не показываем */
      const a = hw.mode === 'trace' ? 0.3 : hw.mode === 'hint' ? 0.12 : 0;
      if (!a) return;
      ctx.save();
      ctx.font = Math.round(S * 0.82) + 'px "Noto Serif SC", serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(160,160,160,${a})`;
      ctx.fillText(ch, S / 2, S / 2 + S * 0.03);
      ctx.restore();
    }
    function doneStrokes() {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = S * 0.055;
      ctx.strokeStyle = 'rgba(230,225,215,0.92)';
      for (let i = 0; i < hw.strokeIdx; i++) {
        const m = medians[i];
        ctx.beginPath();
        m.forEach((p, k) => { const [x, y] = pt(p); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.stroke();
      }
    }
    function hint() {
      const show = hw.mode === 'trace' || hw.hintShown || hw.tries >= 2;
      if (!show || hw.strokeIdx >= medians.length) return;
      const m = medians[hw.strokeIdx];
      ctx.save();
      ctx.strokeStyle = 'rgba(201,162,39,0.85)'; ctx.lineWidth = S * 0.02; ctx.setLineDash([10, 8]);
      ctx.beginPath();
      m.forEach((p, k) => { const [x, y] = pt(p); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke(); ctx.setLineDash([]);
      const [sx, sy] = pt(m[0]);
      ctx.fillStyle = 'rgba(46,125,91,0.95)';
      ctx.beginPath(); ctx.arc(sx, sy, S * 0.028, 0, 7); ctx.fill();
      const [ex, ey] = pt(m[m.length - 1]);
      ctx.fillStyle = 'rgba(179,57,47,0.9)';
      ctx.beginPath(); ctx.arc(ex, ey, S * 0.018, 0, 7); ctx.fill();
      ctx.restore();
    }
    function live() {
      if (cur.length < 2) return;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = S * 0.055;
      ctx.strokeStyle = 'rgba(109,26,36,0.9)';
      ctx.beginPath();
      cur.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.stroke();
    }
    function paint() { grid(); ghost(); doneStrokes(); hint(); live(); }
    paint();

    const pos = e => {
      const r = cv.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return [(t.clientX - r.left) / r.width * S, (t.clientY - r.top) / r.height * S];
    };
    const start = e => { e.preventDefault(); drawing = true; cur = [pos(e)]; paint(); };
    const move = e => { if (!drawing) return; e.preventDefault(); cur.push(pos(e)); paint(); };
    const end = e => {
      if (!drawing) return;
      e.preventDefault(); drawing = false;
      const drawn = cur.map(p => [p[0] / S * Strokes.FIELD, p[1] / S * Strokes.FIELD]);
      cur = [];
      judge(drawn, medians, paint);
    };
    cv.addEventListener('pointerdown', start); cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end); cv.addEventListener('pointerleave', end);
    if (hw.mode === 'dictation' && !hw.said) { hw.said = true; setTimeout(() => Speech.say(ch), 350); }
  }

  function judge(drawn, medians, paint) {
    const msg = $('#hw-msg');
    const expected = medians[hw.strokeIdx];
    const tol = hw.mode === 'trace' ? { start: 30, mean: 26 } : { start: 26, mean: 22 };
    const res = Strokes.match(expected, drawn, tol);
    if (res.ok) {
      hw.strokeIdx++; hw.tries = 0; hw.hintShown = false;
      Sound.ok();
      if (hw.strokeIdx >= medians.length) {
        hw.results.push({ ch: hw.chars[hw.i], ok: true, tries: hw.totalTries || 0, hints: hw.usedHint || 0 });
        hw.done++;
        hw.totalTries = 0; hw.usedHint = 0;
        toast('Знак написан · ' + hw.chars[hw.i], 1200);
        setTimeout(nextChar, 500);
        return;
      }
      render();
      return;
    }
    hw.tries++; hw.totalTries = (hw.totalTries || 0) + 1;
    Sound.fail();
    if (msg) { msg.textContent = res.why; msg.classList.add('bad'); }
    paint();
    if (hw.tries >= 2) render();
  }

  function finish() {
    const ok = hw.results.filter(r => r.ok).length;
    const m = modeOf(hw.mode);
    const a = {
      id: uid(), ts: hw.startedAt, endedAt: Date.now(), durationMs: Date.now() - hw.startedAt,
      mode: 'hand', difficulty: hw.mode, level: hw.level, deckIds: [], deckName: 'Письмо от руки' + (hw.title ? ' · ' + hw.title : ''),
      show: 'hand', guess: ['stroke'], order: 'random', timer: 0,
      total: hw.results.length, planned: hw.chars.length, aborted: false,
      correct: ok, partial: 0, wrong: hw.results.length - ok,
      percent: Math.round(ok / Math.max(1, hw.results.length) * 100),
      words: hw.results.filter(r => r.ok).map(r => r.ch),
      questions: hw.results.map(r => ({ cardId: (cardOf(r.ch) || {}).id, hanzi: r.ch, ok: r.ok, fraction: r.ok ? 1 : 0, ms: 0, answer: {} })),
    };
    state.lastHand = { results: hw.results.slice(), mode: m, level: hw.level };
    hw = null;
    saveAttempt(a).then(() => { Sound.finish(ok === a.total); nav('hand-result', { id: a.id }, { replace: true }); });
  }
  window.__hw = () => hw;   /* отладка: состояние занятия по письму */
  views['hand-result'] = {
    render(p) {
      const a = state.attempts.find(x => x.id === p.id);
      const f = state.lastHand;
      if (!a || !f) return '<div class="empty">Результат не найден</div>';
      return `<div class="vh"><div class="seal">手</div><div class="grow"><h1 class="title">Написано</h1><div class="sub"><span class="zh">${f.mode.zh}</span> ${f.mode.t} · ${fmt.dur(a.durationMs)}</div></div></div>
      <div class="panel ornate result-top"><div class="res-meta"><div class="big-score">${a.correct}<small> из ${a.total} знаков</small></div>
        <div class="fb-row"><span class="fb-p">Очков</span><span class="fb-v"><b>+${a.points}</b></span></div>
        ${a.decay && a.decay.why.length ? `<div class="hint" style="margin:6px 0 0">${esc(a.decay.why.join(' · '))}</div>` : ''}</div></div>
      <div class="panel"><div class="flabel">Знаки</div><div class="hw-list">${f.results.map(r => `<div class="hw-it ${r.ok ? 'ok' : 'bad'}"><span class="zh">${esc(r.ch)}</span><small>${r.skipped ? 'пропущен' : r.ok ? (r.hints ? 'с подсказкой' : 'сам') : 'мимо'}</small></div>`).join('')}</div></div>
      <div class="btns"><button class="btn btn-primary btn-block" data-go="hand">Ещё</button><button class="btn btn-secondary btn-block" data-go="home">На главную</button></div>`;
    },
  };
})();
