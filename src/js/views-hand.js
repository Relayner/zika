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

  /* ── выбор занятия ──
     Уровень — настоящий фильтр: он задаёт и уроки, и случайный набор. Уроки письма — те же блоки, что в программе,
     поэтому написать можно каждое слово уровня, а не сорок знаков из курса. */
  const LEVELS = [
    { n: 0, t: 'С нуля', d: 'черты, порядок, строение знака' },
    { n: 1, t: 'HSK 1' }, { n: 2, t: 'HSK 2' }, { n: 3, t: 'HSK 3' }, { n: 4, t: 'HSK 4' },
  ];
  const DECK_OF = { 1: 'hsk1', 2: 'hsk2', 3: 'hsk3', 4: 'freq1' };
  const hstate = () => (state.settings.hand || (state.settings.hand = { lessons: {} }));
  const lessonState = id => (hstate().lessons[id] || (hstate().lessons[id] = { written: [], runs: 0 }));
  const writable = w => w && !/[…\s]/.test(w) && (!Strokes.ready() || [...w].every(ch => Strokes.has(ch)));
  const curLevel = () => { const n = +state.settings.handLevel; return LEVELS.some(l => l.n === n) ? n : 1; };

  /* уроки уровня: 0 — курс черт, 1–4 — блоки программы */
  function lessonsOf(lvl) {
    if (lvl === 0) return H.COURSE.filter(c => c.lvl === 0).map(c => ({ id: c.id, zh: c.zh, ru: c.ru, can: c.can, lvl: 0, words: c.chars.split(' ').filter(Boolean), course: true }));
    return (window.PROGRAM ? PROGRAM.byLevel(lvl) : []).map(b => ({ id: 'w-' + b.id, zh: b.zh, ru: b.ru, can: b.can, lvl, words: b.words.filter(writable) }));
  }
  const cardsOfLevel = lvl => (DECK_OF[lvl] ? cardsOfDeck(DECK_OF[lvl]) : []);

  views.hand = {
    render() {
      const prof = Skill.profile(state);
      const hs = (prof.hand || {}).score;
      const voice = Speech.available();
      const hd = (prof.hand || {}).data || 0;   /* одна обводка 8/8 — ещё не форма: до 30 знаков выше «с подсказкой» не советуем */
      const recMode = hs == null || hs < 60 ? 'trace' : (hs < 75 || hd < 30) ? 'hint' : (hs < 90 || !voice) ? 'memory' : 'dictation';
      const cur = modeOf(state.settings.handMode).k;
      const lvl = curLevel();
      const lessons = lessonsOf(lvl);
      const total = lessons.reduce((n, l) => n + l.words.length, 0);
      const written = lessons.reduce((n, l) => n + lessonState(l.id).written.filter(w => l.words.includes(w)).length, 0);
      const rows = lessons.map(l => {
        const st = lessonState(l.id);
        const done = l.words.filter(w => st.written.includes(w)).length;
        const full = l.words.length && done >= l.words.length;
        return `<button class="row tap ${full ? 'ph-done' : ''}" data-action="hand-lesson" data-id="${l.id}">
          <div><div class="row-t"><span class="zh">${l.zh}</span> · ${esc(l.ru)}${full ? ' <span class="ph-tick">✓</span>' : ''}${st.runs ? ` <b class="blk-runs">×${st.runs}</b>` : ''}</div><div class="row-s">${esc(l.can)}</div></div>
          <div class="row-r"><span class="badge ${full ? 'good' : done ? 'mid' : ''}">${done}/${l.words.length}</span><span class="chev">›</span></div></button>`;
      }).join('');
      return `<div class="vh"><div class="seal">手</div><div class="grow"><h1 class="title">Письмо от руки</h1><div class="sub">手写 · черта за чертой, в верном порядке</div></div><button class="icon-btn" data-action="hand-info" aria-label="Как это работает">i</button></div>
      <div class="panel"><div class="flabel">Уровень</div><div class="seg wrap">${LEVELS.map(l => `<button class="${lvl === l.n ? 'on' : ''}" data-action="hand-level" data-n="${l.n}">${l.t}</button>`).join('')}</div>
        <div class="hint" style="margin:8px 0 0">${lvl === 0 ? 'Основы письма: ' + LEVELS[0].d : `${total} ${fmt.plural(total, 'слово', 'слова', 'слов').replace(/^\d+ /, '')} уровня · написано ${written}`}${!Strokes.ready() ? ' · загружаю траектории…' : ''}</div></div>
      <div class="panel"><div class="flabel">Как писать</div><div class="seg wrap">${MODES.map(m => `<button class="${cur === m.k ? 'on' : ''}" data-action="hand-mode" data-k="${m.k}"><span class="zh">${m.zh}</span> ${m.t}${m.k === recMode ? ' ·☆' : ''}</button>`).join('')}</div>
        <div class="hint" style="margin:10px 0 0">${esc(modeOf(cur).d)}${cur !== recMode ? ` · по вашей форме советуем «${modeOf(recMode).t}»` : ' · это ваша ступень по форме'}</div>
        ${!voice ? '<div class="warn mt">Китайский голос не найден — диктант недоступен. iPhone: Настройки → Универсальный доступ → Устный контент → Голоса → Китайский.</div>' : ''}</div>
      ${lvl > 0 ? `<button class="btn btn-primary btn-block btn-lg" data-action="hand-start">Начать · 8 случайных слов HSK ${lvl}</button>` : ''}
      <div class="panel"><div class="flabel">${lvl === 0 ? 'Уроки основ' : 'Уроки письма HSK ' + lvl + ' · по темам программы'}</div>${rows || '<div class="hint">Уроков нет</div>'}</div>
      <div class="panel"><div class="flabel">Справочник</div>
        <button class="row tap" data-action="hand-theory" data-k="strokes"><div><div class="row-t">Восемь черт 笔画</div><div class="row-s">как ведётся каждая</div></div><span class="chev">›</span></button>
        <button class="row tap" data-action="hand-theory" data-k="rules"><div><div class="row-t">Правила порядка 笔顺</div><div class="row-s">семь правил, по которым пишут все знаки</div></div><span class="chev">›</span></button>
        <button class="row tap" data-action="hand-theory" data-k="struct"><div><div class="row-t">Строение знака 结构</div><div class="row-s">из каких частей собирается иероглиф</div></div><span class="chev">›</span></button></div>`;
    },
    mount() { if (!Strokes.ready()) Strokes.load().then(() => { if (state.view === 'hand') render(); }).catch(() => {}); },
  };
  actions['hand-level'] = el => { state.settings.handLevel = +el.dataset.n; persist(); render(); };
  actions['hand-mode'] = el => { state.settings.handMode = el.dataset.k; persist(); render(); };
  actions['hand-info'] = () => sheet(`<h3 class="sh-t">Как устроено письмо от руки</h3><div class="install-note">
    <p>Знак пишется <b>по чертам и в правильном порядке</b>. Приложение сверяет каждую черту: откуда начали, куда вели и совпал ли путь.</p>
    <p>Черта не засчитывается, если ведёте её в обратную сторону — в китайском направление черты часть нормы, а не мелочь.</p>
    <p>Уровень наверху задаёт всё: и уроки, и случайный набор. Уроки повторяют темы программы, так что написать можно каждое слово уровня.</p>
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
  /* урок: сначала ещё не написанные слова, потом остальные — так за несколько заходов покрывается весь блок */
  actions['hand-lesson'] = el => {
    const lvl = curLevel();
    const l = lessonsOf(lvl).find(x => x.id === el.dataset.id);
    if (!l) return;
    const st = lessonState(l.id);
    const fresh = l.words.filter(w => !st.written.includes(w)), old = l.words.filter(w => st.written.includes(w));
    const order = [...HskReal.shuffle(fresh), ...HskReal.shuffle(old)];
    const items = l.course ? order : order.map(w => { const c = cardsOfLevel(lvl).find(x => x.hanzi === w); return c ? { hanzi: c.hanzi, pinyin: c.pinyin, ru: c.ru, id: c.id } : w; });
    startHand(items, lvl || 1, l.ru, l.id);
  };
  actions['hand-start'] = async () => {
    const lvl = curLevel();
    try { await Strokes.load(); } catch (e) { return toast(e.message, 3000); }
    const cards = cardsOfLevel(lvl).filter(c => writable(c.hanzi));
    if (!cards.length) return toast('Для этого уровня нет данных о чертах');
    const pick = HskReal.shuffle(cards).slice(0, 8);
    startHand(pick.map(c => ({ hanzi: c.hanzi, pinyin: c.pinyin, ru: c.ru, id: c.id })), lvl, 'HSK ' + lvl);
  };

  /* Единица занятия — слово с подписью: иначе в режимах «по памяти» и «диктант» писать нечего */
  async function startHand(items, level, title, lessonId) {
    toast('Готовлю клетку…', 1200);
    try { await Strokes.load(); } catch (e) { return toast(e.message, 3000); }
    const list = items
      .map(it => (typeof it === 'string' ? charItem(it) : it))
      .filter(it => it && it.hanzi && [...it.hanzi].every(ch => Strokes.has(ch)));
    if (!list.length) return toast('Нет знаков с данными о чертах');
    let mode = modeOf(state.settings.handMode).k;
    if (mode === 'dictation' && !Speech.available()) { toast('Нет китайского голоса — пишем по памяти, с подписью', 3000); mode = 'memory'; }
    hw = { items: list.slice(0, 12), i: 0, ci: 0, strokeIdx: 0, tries: 0, results: [], mode, lessonId: lessonId || null,
      level, title: title || '', startedAt: Date.now(), hintShown: false, done: 0, msg: '', finishing: false, timer: null };
    nav('hand-run');
  }
  /* Знак курса: подпись берём из словаря, иначе из карточки-слова */
  function charItem(ch) {
    const d = (H.CHARS || {})[ch];
    if (d) return { hanzi: ch, pinyin: d[0], ru: d[1] };
    const c = cardOf(ch);
    return c ? { hanzi: ch, pinyin: c.pinyin, ru: c.ru, id: c.id } : null;
  }

  /* ── холст ── */
  const cardOf = ch => {
    for (const d of builtinDecks) { const c = cardsOfDeck(d.id).find(x => x.hanzi === ch); if (c) return c; }
    return null;
  };
  views['hand-run'] = {
    render() {
      if (!hw) return '<div class="empty">Занятие не начато</div>';
      const it = hw.items[hw.i];
      const word = [...it.hanzi];
      const ch = word[hw.ci];
      const m = modeOf(hw.mode);
      const total = Strokes.of(ch).length;
      const label = hw.mode === 'dictation'
        ? `<button class="btn btn-secondary btn-sm" data-action="hand-say" data-nosound>🔊 Повторить</button>`
        : hw.mode === 'memory'
          ? `<b>${esc(it.pinyin || '')}</b><div>${esc(it.ru || '')}</div>`
          : `<b>${esc(it.pinyin || '')}</b><div>${esc(it.ru || '')}</div>`;
      const prompt = `<div class="hw-prompt">${label}</div>`;
      return `<div class="qbar"><button class="icon-btn" data-action="hand-quit">✕</button><div class="progress"><i style="width:${hw.i / hw.items.length * 100}%"></i></div><div class="qcount">${hw.i + 1}/${hw.items.length}</div><div class="qtimer"><span class="zh">${m.zh}</span></div></div>
      ${prompt}
      <div class="hw-wrap"><canvas id="hw-c" class="hw-canvas" width="640" height="640"></canvas></div>
      <div class="hw-info"><span>${word.length > 1 ? `Знак <b>${hw.ci + 1}</b> из ${word.length} · ` : ''}черта <b>${hw.strokeIdx + 1}</b> из ${total}</span><span id="hw-msg" class="hw-msg ${hw.msg ? 'bad' : ''}">${esc(hw.msg || '')}</span></div>
      <div class="btns row2"><button class="btn btn-secondary" data-action="hand-undo">Стереть черту</button><button class="btn btn-secondary" data-action="hand-hint">Подсказать</button></div>
      <button class="btn btn-secondary btn-block btn-sm" data-action="hand-skip">Пропустить знак</button>`;
    },
    mount() { if (hw) setupCanvas(); },
  };
  actions['hand-say'] = () => { if (hw) Speech.say(hw.items[hw.i].hanzi); };
  /* пока идёт пауза после дописанного слова, действия не принимаем — иначе дубли и обращение к пустому состоянию */
  const busy = () => !hw || hw.finishing;
  actions['hand-quit'] = () => { if (hw && hw.timer) clearTimeout(hw.timer); hw = null; nav('hand', {}, { replace: true }); };
  actions['hand-undo'] = () => { if (!busy() && hw.strokeIdx > 0) { hw.strokeIdx--; hw.tries = 0; hw.hintShown = false; hw.msg = ''; render(); } };
  actions['hand-hint'] = () => { if (!busy()) { hw.hintShown = true; hw.usedHint = (hw.usedHint || 0) + 1; render(); } };
  /* пропускаем именно знак: в двусложном слове второй знак остаётся */
  actions['hand-skip'] = () => {
    if (busy()) return;
    const word = [...hw.items[hw.i].hanzi];
    if (hw.ci < word.length - 1) { hw.ci++; hw.strokeIdx = 0; hw.tries = 0; hw.hintShown = false; hw.msg = ''; hw.partial = true; render(); return; }
    hw.results.push({ ch: hw.items[hw.i].hanzi, ok: false, tries: hw.tries, skipped: true });
    nextItem();
  };

  function nextItem() {
    if (!hw) return;
    hw.finishing = false; hw.timer = null; hw.partial = false;
    hw.i++; hw.ci = 0; hw.strokeIdx = 0; hw.tries = 0; hw.hintShown = false; hw.said = false; hw.msg = '';
    if (hw.i >= hw.items.length) return finish();
    render();   /* озвучка диктанта — один раз, из setupCanvas */
  }

  /* Цвета холста берём из темы: захардкоженные под тёмный фон черты на светлой теме были невидимы */
  function hwColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
    return { done: v('--hw-done', '#2b1d18'), live: v('--hw-live', '#6e1b2b'), ghost: v('--hw-ghost', '90,70,60'), grid: v('--hw-grid', 'rgba(180,140,60,0.45)') };
  }

  function setupCanvas() {
    const cv = $('#hw-c');
    if (!cv) return;
    /* буфер под плотность экрана — иначе на iPhone черты мыльные */
    /* размер от разметки ненадёжен (экран ещё не выложен, панель скрыта) — берём не меньше номинала */
    const css = Math.max(cv.getBoundingClientRect().width, 320), dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = cv.height = Math.round(css * dpr);
    const ctx = cv.getContext('2d');
    const S = cv.width;
    const C = hwColors();
    const ch = [...hw.items[hw.i].hanzi][hw.ci];
    const medians = Strokes.of(ch);
    const pt = p => Strokes.toScreen(p, S);
    let drawing = false, cur = [];

    function grid() {
      ctx.clearRect(0, 0, S, S);
      ctx.fillStyle = 'rgba(255,255,255,0.02)'; ctx.fillRect(0, 0, S, S);
      ctx.strokeStyle = C.grid; ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, S - 2, S - 2);
      ctx.setLineDash([8, 10]); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2);
      ctx.moveTo(0, 0); ctx.lineTo(S, S); ctx.moveTo(S, 0); ctx.lineTo(0, S); ctx.stroke();
      ctx.setLineDash([]);
    }
    function ghost() {
      /* образец знака: в обводке ярко, с подсказкой — бледно, по памяти и в диктанте не показываем */
      const a = hw.mode === 'trace' ? 0.38 : hw.mode === 'hint' ? 0.24 : 0;
      if (!a) return;
      ctx.save();
      ctx.font = Math.round(S * 0.82) + 'px "Noto Serif SC", "PingFang SC", "Hiragino Sans GB", serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(${C.ghost},${a})`;
      ctx.fillText(ch, S / 2, S / 2 + S * 0.03);
      ctx.restore();
    }
    function doneStrokes() {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = S * 0.055;
      ctx.strokeStyle = C.done;
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
      ctx.strokeStyle = C.live;
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
    const start = e => { e.preventDefault(); if (busy()) return; drawing = true; cur = [pos(e)]; paint(); };
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
    if (hw.mode === 'dictation' && !hw.said) { hw.said = true; setTimeout(() => Speech.say(hw.items[hw.i].hanzi), 350); }
  }

  function judge(drawn, medians, paint) {
    if (busy() || hw.strokeIdx >= medians.length) return;
    const expected = medians[hw.strokeIdx];
    const tol = hw.mode === 'trace' ? { start: 30, mean: 26 } : { start: 26, mean: 22 };
    const res = Strokes.match(expected, drawn, tol);
    if (res.ok) {
      hw.strokeIdx++; hw.tries = 0; hw.hintShown = false; hw.msg = '';
      Sound.ok();
      if (hw.strokeIdx >= medians.length) {
        const word = [...hw.items[hw.i].hanzi];
        if (hw.ci < word.length - 1) { hw.ci++; hw.strokeIdx = 0; toast('Знак написан · ' + word[hw.ci - 1], 900); render(); return; }
        hw.results.push({ ch: hw.items[hw.i].hanzi, ok: true, tries: hw.totalTries || 0, hints: hw.usedHint || 0 });
        hw.done++;
        /* прогресс урока пишем сразу — выход посреди занятия его не теряет */
        if (hw.lessonId) { const ls = lessonState(hw.lessonId); if (!ls.written.includes(hw.items[hw.i].hanzi)) { ls.written.push(hw.items[hw.i].hanzi); persist(); } }
        hw.totalTries = 0; hw.usedHint = 0;
        toast('Написано · ' + hw.items[hw.i].hanzi, 1200);
        hw.finishing = true;
        hw.timer = setTimeout(nextItem, 500);
        return;
      }
      render();
      return;
    }
    hw.tries++; hw.totalTries = (hw.totalTries || 0) + 1;
    Sound.fail();
    hw.msg = res.why;
    const msg = $('#hw-msg'); if (msg) { msg.textContent = res.why; msg.classList.add('bad'); }
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
      total: hw.results.length, planned: hw.items.length, aborted: false,
      correct: ok, partial: 0, wrong: hw.results.length - ok,
      percent: Math.round(ok / Math.max(1, hw.results.length) * 100),
      words: hw.results.filter(r => r.ok).map(r => r.ch),
      questions: hw.results.map(r => ({ cardId: (cardOf(r.ch) || {}).id, hanzi: r.ch, ok: r.ok, fraction: r.ok ? 1 : 0, ms: 0, answer: {} })),
    };
    if (hw.lessonId) lessonState(hw.lessonId).runs++;
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
