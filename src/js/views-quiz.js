/* Тренировка: пять режимов с раздельными настройками (тест, карточки, письмо, аудирование, фразы),
   экраны вопросов, результат, HSK-экзамены фиксированного формата. */
(() => {
  const { state, views, actions, nav, esc, attr, uid, $, toast, sheet, closeSheet, confirm, persist, LABELS, fmt, renderPart, cardsOfDeck, cardsOfDecks, allDecks, deckById, hskCards, cardIndex, saveAttempt, flash, questionRow, render, builtinDecks } = App;

  const MODES = ['quiz', 'flip', 'write', 'listen', 'sentence'];
  const MODE_TITLES = { quiz: 'Выбор 选', flip: 'Самопроверка 卡', write: 'Письмо 写', listen: 'Аудио 听', sentence: 'Фразы 句' };
  const MODE_HINTS = {
    quiz: 'Вопрос — ответ: варианты или ввод, с оценкой.',
    flip: 'Смотрите, переворачивайте, отмечайте «знал / не знал».',
    write: 'Набираете иероглифы с китайской клавиатуры iPhone.',
    listen: 'Слово произносится вслух — определите, что сказали.',
    sentence: 'Вопрос по-китайски — дайте ответ иероглифами.',
  };
  const DEF_BY = {
    quiz: { deckIds: ['hsk1'], show: 'hanzi', guess: ['pinyin', 'ru'], difficulty: 'easy', count: 20, order: 'random', timer: 0 },
    flip: { deckIds: ['hsk1'], show: 'hanzi', count: 20, order: 'random', timer: 0 },
    write: { deckIds: ['hsk1'], difficulty: 'easy', count: 10, order: 'random', timer: 0 },
    listen: { deckIds: ['hsk1'], difficulty: 'easy', count: 20, order: 'random', timer: 0 },
    sentence: { difficulty: 'easy', count: 10, order: 'random', timer: 0 },
  };
  const DIFF_HINT = { easy: '4 варианта ответа.', medium: '8 вариантов, похожих на правильный.', hard: 'Ввод с клавиатуры: пиньинь с тонами (можно цифрами), для иероглифов — китайская клавиатура.' };
  const WRITE_HINT = { easy: 'Перевод и пиньинь даны — учимся выбирать верный знак среди омофонов на клавиатуре.', medium: 'Только перевод — вспоминаете и чтение, и написание сами.', hard: 'Только звук — услышали слово и набрали его, ни текста, ни перевода.' };
  const LISTEN_HINT = { easy: 'Выбор из 4: иероглиф, пиньинь и перевод.', medium: '8 похожих по звучанию, только иероглифы.', hard: 'Ввод: иероглифы или пиньинь с тонами.' };
  const SENT_HINT = { easy: 'Вопрос с пиньинем и переводом, выбор из 4 ответов.', medium: 'Только вопрос по-китайски, 8 похожих ответов.', hard: 'Ответ набирается иероглифами.' };
  const EXAM_FORMAT = {
    1: '20 вопросов · выбор из 4 · пиньинь подписан · 20 с на вопрос · порог 120 из 200',
    2: '30 вопросов · выбор из 4 похожих · пиньинь подписан · 20 с на вопрос · порог 120 из 200',
    3: '30 вопросов без пиньиня + 10 на написание иероглифов · 25 с на вопрос · порог 180 из 300',
  };
  let setup = null, quiz = null, lastEvents = null;

  /* ── настройки: свой блок на каждый режим ── */
  function migrateFlat(ls) { const m = {}; for (const k of ['deckIds', 'show', 'guess', 'difficulty', 'count', 'order', 'timer']) if (ls[k] != null) m[k] = ls[k]; return m; }
  function getSetup() {
    if (!setup) {
      const ls = state.settings.lastSetup || {};
      const by = ls.byMode || {};
      setup = { mode: MODES.includes(ls.mode) ? ls.mode : 'quiz', byMode: {} };
      for (const m of MODES) setup.byMode[m] = Object.assign({}, DEF_BY[m], by[m] || (!ls.byMode && (ls.mode === m || (m === 'quiz' && !MODES.includes(ls.mode))) ? migrateFlat(ls) : {}));
    }
    for (const m of MODES) {
      const c = setup.byMode[m];
      if (c.deckIds) { c.deckIds = c.deckIds.filter(id => deckById(id)); if (!c.deckIds.length) c.deckIds = DEF_BY[m].deckIds.slice(); }
      if (c.guess) { c.guess = c.guess.filter(p => Quiz.PARTS.includes(p)); if (!c.guess.length) c.guess = ['pinyin', 'ru']; }
    }
    return setup;
  }
  const cur = () => getSetup().byMode[getSetup().mode];
  function saveSetup() { state.settings.lastSetup = JSON.parse(JSON.stringify(getSetup())); persist(); }

  const seg = (c, key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(c[key]) === String(v) ? 'on' : ''}" data-action="setup-set" data-key="${key}" data-val="${v}">${l}</button>`).join('')}</div>`;
  const chip = (on, label, act, arg) => `<button class="chip ${on ? 'on' : ''}" data-action="${act}" data-arg="${esc(arg)}">${label}</button>`;
  function pointsLine(mode, diff) {
    const b = Campaign.BASE;
    const v = mode === 'flip' ? b.flip : (b[mode] || b.quiz)[diff];
    return `Очки похода: ×${v} за верный ответ.`;
  }
  views.setup = {
    render() {
      const s = getSetup(), m = s.mode, c = s.byMode[m];
      const isQuiz = m === 'quiz', hasDecks = !!c.deckIds, hasDiff = m !== 'flip';
      const n = m === 'sentence' ? Sentences.ITEMS.length : cardsOfDecks(c.deckIds || []).length;
      const planned = c.count === 'all' ? n : Math.min(n, +c.count);
      const counts = m === 'sentence' ? [[5, '5'], [10, '10'], [20, '20'], ['all', 'Все']] : [[10, '10'], [20, '20'], [30, '30'], [50, '50'], ['all', 'Все']];
      const diffHint = m === 'write' ? WRITE_HINT[c.difficulty] : m === 'listen' ? LISTEN_HINT[c.difficulty] : m === 'sentence' ? SENT_HINT[c.difficulty] : DIFF_HINT[c.difficulty];
      return `<div class="vh"><div class="seal">练</div><div class="grow"><h1 class="title">Тренировка</h1><div class="sub">У каждого режима — свои настройки</div></div></div>
      <div class="panel"><div class="flabel">Режим</div><div class="chips">${MODES.map(x => chip(x === m, MODE_TITLES[x], 'setup-mode', x)).join('')}</div><div class="hint">${MODE_HINTS[m]}</div>
        ${m === 'write' ? '<button class="btn btn-secondary btn-sm btn-block mt" data-action="kbd-tip">Как включить китайскую клавиатуру</button>' : ''}
        ${((m === 'listen') || (m === 'write' && c.difficulty === 'hard')) && !Speech.available() ? '<div class="warn mt">Китайский голос не найден. iPhone: Настройки → Универсальный доступ → Устный контент → Голоса → Китайский, затем перезапустите приложение.</div>' : ''}
        ${m === 'sentence' ? `<div class="hint">В банке ${Sentences.ITEMS.length} фраз — вопросы с однозначным ответом.</div>` : ''}</div>
      ${hasDecks ? `<div class="panel"><div class="flabel">Колоды <span class="muted">· карточек: ${n}</span></div><div class="chips">${allDecks().map(d => chip(c.deckIds.includes(d.id), esc(d.name) + ` <small>${cardsOfDeck(d.id).length}</small>`, 'setup-deck', d.id)).join('')}</div></div>` : ''}
      ${isQuiz ? `<div class="panel"><div class="flabel">Показывать</div>${seg(c, 'show', [['hanzi', 'Иероглиф'], ['pinyin', 'Пиньинь'], ['ru', 'Перевод'], ['mixed', 'Смешанно']])}
        ${c.show !== 'mixed' ? `<div class="flabel mt">Угадывать</div><div class="chips">${Quiz.PARTS.filter(p => p !== c.show).map(p => chip(c.guess.includes(p), LABELS.part[p], 'setup-guess', p)).join('')}</div>` : '<div class="hint">Направление меняется от вопроса к вопросу.</div>'}</div>` : ''}
      ${m === 'flip' ? `<div class="panel"><div class="flabel">Показывать сначала</div>${seg(c, 'show', [['hanzi', 'Иероглиф'], ['pinyin', 'Пиньинь'], ['ru', 'Перевод']])}</div>` : ''}
      ${hasDiff ? `<div class="panel"><div class="flabel">Сложность</div>${seg(c, 'difficulty', [['easy', 'Лёгкий'], ['medium', 'Средний'], ['hard', 'Сложный']])}<div class="hint">${diffHint} ${pointsLine(m, c.difficulty)}</div></div>` : ''}
      <div class="panel"><div class="flabel">Сколько за подход</div>${seg(c, 'count', counts)}
        <div class="flabel mt">Порядок</div>${seg(c, 'order', [['random', 'Случайно'], ['weak', 'Сначала слабые'], ['new', 'Сначала новые']])}
        ${m !== 'flip' ? `<div class="flabel mt">Таймер на вопрос</div>${seg(c, 'timer', [[0, 'Нет'], [10, '10 с'], [20, '20 с'], [30, '30 с']])}` : ''}</div>
      <button class="btn btn-primary btn-block btn-lg" data-action="setup-start" ${n < 1 ? 'disabled' : ''}>Начать${n ? ' · ' + fmt.plural(planned, m === 'sentence' ? 'фраза' : 'карточка', m === 'sentence' ? 'фразы' : 'карточки', m === 'sentence' ? 'фраз' : 'карточек') : ''}</button>
      <div class="hint" style="text-align:center">Экзамены HSK эти настройки не трогают — у них фиксированный формат.</div>`;
    },
  };
  actions['setup-mode'] = el => { getSetup().mode = el.dataset.arg; saveSetup(); render(); };
  actions['setup-deck'] = el => { const c = cur(), id = el.dataset.arg; if (!c.deckIds) return; if (c.deckIds.includes(id)) { if (c.deckIds.length > 1) c.deckIds = c.deckIds.filter(x => x !== id); } else c.deckIds.push(id); saveSetup(); render(); };
  actions['setup-guess'] = el => { const c = cur(), p = el.dataset.arg; if (!c.guess) return; if (c.guess.includes(p)) { if (c.guess.length > 1) c.guess = c.guess.filter(x => x !== p); } else c.guess.push(p); saveSetup(); render(); };
  actions['setup-set'] = el => {
    const c = cur(), k = el.dataset.key;
    let v = el.dataset.val;
    if ((k === 'count' && v !== 'all') || k === 'timer') v = +v;
    c[k] = v;
    if (k === 'show' && getSetup().mode === 'quiz' && v !== 'mixed') { c.guess = (c.guess || []).filter(p => p !== v); if (!c.guess.length) c.guess = Quiz.PARTS.filter(p => p !== v); }
    saveSetup(); render();
  };
  actions['setup-start'] = () => { const s = getSetup(); startSession(s.mode, JSON.parse(JSON.stringify(s.byMode[s.mode]))); };
  /* Открыть тренировку на конкретной колоде (из режима изучения) */
  /* Повторение по срокам: только то, что подошло, вперемешку из всех колод */
  App.startReview = () => {
    const ids = SRS.due(state);
    if (!ids.length) return toast('Пока нечего повторять — всё свежее');
    const byId = {};
    App.builtinDecks.forEach(d => cardsOfDeck(d.id).forEach(c => { byId[c.id] = c; }));
    (state.cards || []).forEach(c => { byId[c.id] = c; });
    const cards = ids.map(id => byId[id]).filter(Boolean);
    if (!cards.length) return toast('Карточки повторения не найдены');
    closeSheet();
    startSession('quiz', { deckIds: [], difficulty: 'medium', count: Math.min(30, cards.length), order: 'random', timer: 0, show: 'mixed', guess: [], review: true },
      { cards, deckName: 'Повторение 复习' });
  };
  App.trainDeck = (id, mode) => { const s = getSetup(); if (mode && DEF_BY[mode]) s.mode = mode; if (!s.byMode[s.mode].deckIds) s.mode = 'quiz'; s.byMode[s.mode].deckIds = [id]; saveSetup(); closeSheet(); nav('setup'); };
  actions['kbd-tip'] = () => {
    sheet(`<h3 class="sh-t">Китайская клавиатура на iPhone</h3>
    <div class="install-note">
      <p><b>1.</b> Настройки → Основные → Клавиатура → Клавиатуры → <b>Новые клавиатуры…</b></p>
      <p><b>2.</b> Выберите <b>Китайский (упрощённый)</b> → <b>Пиньинь — QWERTY</b>. Там же можно добавить <b>Рукописный ввод</b> — рисовать иероглиф пальцем.</p>
      <p><b>3.</b> В поле ввода нажмите <kbd>🌐</kbd> на клавиатуре и выберите <b>简体拼音</b>. Набираете латиницей <kbd>nihao</kbd> — сверху появляются иероглифы, выбираете <b>你好</b>.</p>
      <p>В рукописном режиме (<b>简体手写</b>) — рисуете иероглиф в поле, выбираете распознанный вариант.</p>
    </div>
    <button class="btn btn-primary btn-block mt" data-close>Понятно</button>`);
  };

  /* ── запуск ── */
  function startSession(mode, cfg, extra = {}) {
    cfg = cfg || {};
    cfg.mode = mode;
    if (mode === 'listen') { cfg.show = 'audio'; cfg.guess = ['answer']; }
    if (mode === 'sentence') { cfg.show = 'sentence'; cfg.guess = ['answer']; }
    if (mode === 'write') {
      cfg.guess = ['hanzi']; if (!cfg.show) cfg.show = 'write';
      if (cfg.difficulty === 'hard' && !Speech.available()) { toast('Нет китайского голоса — сложный уровень идёт по переводу', 3000); cfg.noVoice = true; }
    }
    if (mode === 'quiz') { if (!cfg.show) cfg.show = 'mixed'; if (!cfg.guess) cfg.guess = []; }
    let questions;
    if (mode === 'sentence') {
      questions = Quiz.buildSentence(extra.items || Sentences.ITEMS, cfg, state.cardStats);
      if (!questions.length) return toast('Нет фраз для тренировки');
    } else {
      const cards = extra.cards || cardsOfDecks(cfg.deckIds || []);
      if (extra.deckName) cfg.deckName = extra.deckName;
      if (!cards.length) return toast('Нет карточек для тренировки');
      if (mode === 'listen') {
        if (!Speech.available()) return toast('Нет китайского голоса — включите его в настройках iPhone и перезапустите', 4000);
        questions = Quiz.buildListen(cards, cfg, state.cardStats);
      } else {
        const pool = cards.length >= 12 ? cards : [...cards, ...hskCards];
        questions = Quiz.buildQuestions(cards, pool, cfg, state.cardStats);
      }
    }
    quiz = { cfg, kind: extra.kind || mode, level: extra.level || null, deckIds: (cfg.deckIds || []).slice(), questions, i: 0, startedAt: Date.now(), qStart: Date.now(), answered: false, flipped: false, timerId: null, timeLeft: 0 };
    nav('quiz');
  }

  /* ── экран вопроса ── */
  views.quiz = {
    render() {
      if (!quiz) return '<div class="empty">Нет активной тренировки.</div><div class="btns"><button class="btn btn-primary btn-block" data-go="setup" data-replace>К настройке</button></div>';
      const q = quiz.questions[quiz.i], total = quiz.questions.length, card = q.card, isFlip = quiz.cfg.mode === 'flip';
      const head = `<div class="qbar"><button class="icon-btn" data-action="quiz-quit" aria-label="Выйти">✕</button><div class="progress"><i style="width:${quiz.i / total * 100}%"></i></div><div class="qcount">${quiz.i + 1}/${total}</div>${quiz.cfg.timer && !isFlip ? `<div class="qtimer" id="qtimer">${quiz.cfg.timer}</div>` : ''}</div>`;
      if (isFlip) return head + renderFlip(q);
      let promptBody;
      if (q.show === 'audio') promptBody = `<button class="say-btn" data-action="say" data-nosound aria-label="Прослушать">🔊</button><div class="hint" style="text-align:center;margin-top:10px">Нажмите, чтобы прослушать ещё раз</div>`;
      else if (q.show === 'sentence') promptBody = `<div class="hanzi sent-q">${esc(q.sent.q)}</div>${quiz.cfg.difficulty === 'easy' ? `<div class="pinyin" style="font-size:16px">${esc(q.sent.py)}</div><div class="ru" style="font-size:15px">${esc(q.sent.ru)}</div>` : ''}`;
      else if (q.show === 'both') promptBody = renderPart(card, 'pinyin', 'big') + renderPart(card, 'ru', '');
      else if (q.show === 'hp') promptBody = renderPart(card, 'hanzi', 'big') + renderPart(card, 'pinyin', '');
      else promptBody = renderPart(card, q.show, 'big');
      const dirLabel = `${LABELS.part[q.show] || ''} → ${q.guess.map(p => LABELS.part[p] || p).join(' + ')}`;
      const prompt = `<div class="panel ornate qcard"><div class="qlabel">${dirLabel}</div>${promptBody}</div>`;
      let answer;
      if (q.options) {
        answer = `<div class="opts" id="opts">${q.options.map((o, i) => `<button class="opt ${o.text != null ? 'opt-txt' : ''}" data-action="answer" data-idx="${i}" data-nosound>${o.text != null ? `<span class="opt-hanzi">${esc(o.text)}</span>` : (q.optionParts || q.guess).map(p => `<span class="opt-${p}">${esc(o[p])}</span>`).join('<span class="opt-sep">·</span>')}</button>`).join('')}</div>`;
      } else {
        const fields = q.kind === 'listen' ? [['answer', 'Ответ <span class="muted">· иероглифы или пиньинь с тонами</span>', '汉字 / pinyin']]
          : q.kind === 'sentence' ? [['answer', 'Ответ иероглифами <span class="muted">· клавиатура 中文 через 🌐</span>', '汉字']]
          : q.guess.map(p => [p, LABELS.part[p] + (p === 'pinyin' ? ' <span class="muted">· тоны цифрами, ü = v</span>' : p === 'hanzi' ? ' <span class="muted">· клавиатура 中文 через 🌐</span>' : ''), p === 'pinyin' ? 'ni3 hao3' : p === 'ru' ? 'перевод' : '汉字']);
        answer = `<form id="inputs" class="inputs" autocomplete="off">${fields.map(([nm, lbl, ph]) => `<div class="field"><label>${lbl}</label><input class="inp" name="${nm}" lang="zh-CN" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="${ph}">${nm === 'pinyin' ? '<div class="pv" id="pv"></div>' : ''}</div>`).join('')}<button class="btn btn-primary btn-block" type="submit">Проверить</button></form>`;
        /* ответ иероглифом можно дать от руки — если для всех знаков слова есть траектории */
        if (quiz.cfg.mode === 'write' && q.guess.length === 1 && q.guess[0] === 'hanzi' && window.Strokes) {
          const drawOn = state.settings.writeDraw === true;
          const sw = `<div class="seg draw-sw"><button class="${drawOn ? '' : 'on'}" data-action="write-input" data-v="kbd" data-nosound>⌨ Клавиатура</button><button class="${drawOn ? 'on' : ''}" data-action="write-input" data-v="draw" data-nosound>✍ От руки</button></div>`;
          if (drawOn) {
            answer = sw + `<div id="draw-pad"><div class="hw-wrap"><canvas id="qw-c" class="hw-canvas qw" width="560" height="560"></canvas></div>
            <div class="hw-info"><span id="qw-progress">…</span><span id="qw-msg" class="hw-msg"></span></div>
            <div class="btns row2 mt0"><button class="btn btn-secondary btn-sm" data-action="qw-hint" data-nosound>Подсказать черту</button><button class="btn btn-secondary btn-sm" data-action="qw-give" data-nosound>Не выходит — показать</button></div></div>`;
          } else answer = sw + answer;
        }
      }
      return head + prompt + answer + '<div id="feedback"></div>';
    },
    mount() {
      setupDrawPad();
      if (!quiz) return;
      startTimer();
      const q = quiz.questions[quiz.i];
      if (q && q.show === 'audio' && !quiz.answered) setTimeout(() => Speech.say(q.card.hanzi), 250);
      const f = $('#inputs');
      if (f) {
        f.addEventListener('submit', e => { e.preventDefault(); submitInput(); });
        const pin = f.querySelector('input[name=pinyin]');
        if (pin) pin.addEventListener('input', () => { $('#pv').textContent = Pinyin.toMarks(pin.value); });
        const first = f.querySelector('input');
        if (first && q.show !== 'audio') setTimeout(() => first.focus(), 80);
      }
    },
  };
  actions.say = () => { const q = quiz && quiz.questions[quiz.i]; if (q && q.card) { Sound.click(); Speech.say(q.card.hanzi); } };

  function renderFlip(q) {
    const c = q.card;
    const back = `<div class="hanzi mid ${c.hanzi.replace(/[…\s]/g, '').length >= 5 ? 'len5' : ''}">${esc(c.hanzi)}</div><div class="pinyin">${esc(c.pinyin)}</div><div class="ru">${esc(c.ru)}</div>${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}`;
    return `<div class="flashcard ${quiz.flipped ? 'flipped' : ''}" id="fc" data-action="flip" data-nosound><div class="fc-inner"><div class="fc-face fc-front"><div class="qlabel">${LABELS.part[q.show]}</div>${renderPart(c, q.show, 'big')}<div class="fc-hint">нажмите, чтобы перевернуть</div></div><div class="fc-face fc-back">${back}</div></div></div>
    <div class="flip-btns ${quiz.flipped ? '' : 'hidden'}" id="flipbtns"><button class="btn btn-danger" data-action="flip-answer" data-ok="0" data-nosound>Не знал</button><button class="btn btn-jade" data-action="flip-answer" data-ok="1" data-nosound>Знал</button></div>`;
  }
  actions.flip = () => { if (!quiz || quiz.flipped) return; quiz.flipped = true; Sound.flip(); $('#fc').classList.add('flipped'); $('#flipbtns').classList.remove('hidden'); };
  actions['flip-answer'] = el => {
    if (!quiz || !quiz.flipped || quiz.answered) return;
    const ok = el.dataset.ok === '1', q = quiz.questions[quiz.i], parts = {};
    q.guess.forEach(p => { parts[p] = ok ? 'exact' : 'wrong'; });
    q.result = { parts, fraction: ok ? 1 : 0, ok }; q.answer = { self: ok }; q.ms = Date.now() - quiz.qStart; quiz.answered = true;
    if (ok) { Sound.ok(); flash('ok'); } else { Sound.fail(); flash('bad'); }
    setTimeout(next, 220);
  };
  actions.answer = el => {
    if (!quiz || quiz.answered) return;
    const q = quiz.questions[quiz.i], idx = +el.dataset.idx;
    const txt = q.options[idx] ? (q.options[idx].text != null ? q.options[idx].text : q.guess.map(p => q.options[idx][p]).join(' · ')) : '';
    finishQuestion(q, Quiz.checkChoice(q, idx), { choice: idx, choiceText: txt });
  };
  actions['write-input'] = el => { state.settings.writeDraw = el.dataset.v === 'draw'; persist(); render(); };
  actions['qw-hint'] = () => { if (quiz && quiz.qw) { quiz.qw.hint = true; quiz.qw.hints++; quiz.qw.paint(); } };
  actions['qw-give'] = () => {
    if (!quiz || quiz.answered) return;
    const q = quiz.questions[quiz.i];
    finishQuestion(q, { parts: { hanzi: 'wrong' }, fraction: 0, ok: false }, { input: { hanzi: quiz.qw ? quiz.qw.written : '' }, gaveUp: true });
  };
  /* Рукописный ответ: знак за знаком, черта за чертой — теми же правилами, что в разделе «Письмо от руки» */
  async function setupDrawPad() {
    const cv = $('#qw-c');
    if (!cv || !quiz || quiz.answered) return;
    const q = quiz.questions[quiz.i];
    const css = Math.max(cv.getBoundingClientRect().width, 280), dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = cv.height = Math.round(css * dpr);
    const S = cv.width, ctx = cv.getContext('2d');
    const cs = getComputedStyle(document.documentElement), cvar = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
    const C = { done: cvar('--hw-done', '#2b1d18'), live: cvar('--hw-live', '#6e1b2b'), grid: cvar('--hw-grid', 'rgba(180,140,60,0.4)') };
    const gridOnly = () => { ctx.clearRect(0, 0, S, S); ctx.strokeStyle = C.grid; ctx.lineWidth = 2; ctx.strokeRect(1, 1, S - 2, S - 2);
      ctx.setLineDash([7, 9]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(S / 2, 0); ctx.lineTo(S / 2, S); ctx.moveTo(0, S / 2); ctx.lineTo(S, S / 2);
      ctx.moveTo(0, 0); ctx.lineTo(S, S); ctx.moveTo(S, 0); ctx.lineTo(0, S); ctx.stroke(); ctx.setLineDash([]); };
    gridOnly();   /* клетка видна сразу, пока грузятся траектории */
    const pr0 = $('#qw-progress'); if (pr0 && !Strokes.ready()) pr0.textContent = 'Загружаю траектории…';
    try { await Strokes.load(); } catch (e) { toast(e.message, 2500); state.settings.writeDraw = false; persist(); render(); return; }
    /* пока грузилось, вопрос мог смениться — не пишем в чужой холст */
    if (!quiz || quiz.questions[quiz.i] !== q || !cv.isConnected || quiz.answered) return;
    const word = [...q.card.hanzi.replace(/[…\s]/g, '')];
    if (!word.length || !word.every(ch => Strokes.has(ch))) { toast('Для этого слова нет траекторий — отвечайте клавиатурой', 2500); state.settings.writeDraw = false; persist(); render(); return; }
    const qw = quiz.qw = { ci: 0, si: 0, errs: 0, hints: 0, hint: false, written: '', paint: null };
    const pt = p => Strokes.toScreen(p, S);
    let drawing = false, cur = [];
    function paint() {
      const ch = word[qw.ci], med = Strokes.of(ch);
      gridOnly();
      ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = S * 0.055; ctx.strokeStyle = C.done;
      for (let i = 0; i < qw.si; i++) { ctx.beginPath(); med[i].forEach((p, k) => { const [x, y] = pt(p); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); }
      if (qw.hint && qw.si < med.length) {
        const m = med[qw.si];
        ctx.save(); ctx.strokeStyle = 'rgba(201,162,39,0.85)'; ctx.lineWidth = S * 0.018; ctx.setLineDash([9, 7]);
        ctx.beginPath(); m.forEach((p, k) => { const [x, y] = pt(p); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.stroke(); ctx.setLineDash([]);
        const [sx, sy] = pt(m[0]); ctx.fillStyle = 'rgba(46,125,91,0.95)'; ctx.beginPath(); ctx.arc(sx, sy, S * 0.026, 0, 7); ctx.fill(); ctx.restore();
      }
      if (cur.length > 1) { ctx.lineWidth = S * 0.055; ctx.strokeStyle = C.live; ctx.beginPath(); cur.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); }
      const pr = $('#qw-progress');
      if (pr) pr.innerHTML = (word.length > 1 ? `Знак <b>${qw.ci + 1}</b> из ${word.length} · ` : '') + `черта <b>${qw.si + 1}</b> из ${med.length}`;
    }
    qw.paint = paint;
    paint();
    const pos = e => { const r = cv.getBoundingClientRect(); const t = e.touches ? e.touches[0] : e; return [(t.clientX - r.left) / r.width * S, (t.clientY - r.top) / r.height * S]; };
    const up = () => {
      if (!drawing) return;
      drawing = false;
      const ch = word[qw.ci], med = Strokes.of(ch);
      const drawn = cur.map(p => [p[0] / S * Strokes.FIELD, p[1] / S * Strokes.FIELD]);
      cur = [];
      const res = Strokes.match(med[qw.si], drawn);
      const msg = $('#qw-msg');
      if (res.ok) {
        qw.si++; qw.hint = false; if (msg) msg.textContent = '';
        Sound.ok();
        if (qw.si >= med.length) {
          qw.written += ch; qw.ci++; qw.si = 0;
          if (qw.ci >= word.length) {
            const clean = qw.hints === 0;
            finishQuestion(q, { parts: { hanzi: clean ? 'exact' : 'tones' }, fraction: clean ? 1 : 0.5, ok: clean }, { input: { hanzi: qw.written }, drawn: true, hints: qw.hints });
            return;
          }
        }
        paint();
      } else {
        qw.errs++; Sound.fail();
        if (msg) { msg.textContent = res.why; msg.classList.add('bad'); }
        if (qw.errs >= 2 && !qw.hint) { qw.hint = true; qw.hints++; qw.errs = 0; }
        paint();
      }
    };
    cv.addEventListener('pointerdown', e => { e.preventDefault(); if (quiz.answered) return; drawing = true; cur = [pos(e)]; paint(); });
    cv.addEventListener('pointermove', e => { if (!drawing) return; e.preventDefault(); cur.push(pos(e)); paint(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => cv.addEventListener(t, e => { e.preventDefault(); up(); }));
  }

  function submitInput(timeout) {
    if (!quiz || quiz.answered) return;
    const q = quiz.questions[quiz.i], f = $('#inputs'), answers = {};
    const names = q.kind === 'listen' || q.kind === 'sentence' ? ['answer'] : q.guess;
    names.forEach(nm => { answers[nm] = f && f.elements[nm] ? f.elements[nm].value : ''; });
    if (!timeout && !Object.values(answers).some(v => v.trim())) { toast('Введите ответ'); return; }
    const res = q.kind === 'listen' ? Quiz.checkListen(q, answers.answer) : q.kind === 'sentence' ? Quiz.checkSentence(q, answers.answer) : Quiz.checkInput(q, answers);
    finishQuestion(q, res, { input: answers, timeout: !!timeout });
  }
  function finishQuestion(q, result, answer) {
    stopTimer(); quiz.answered = true;
    const tm = $('#qtimer'); if (tm) tm.classList.add('hidden');
    if (q.show === 'audio') { try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
    q.result = result; q.answer = answer; q.ms = Date.now() - quiz.qStart;
    if (result.ok) { Sound.ok(); flash('ok'); } else { Sound.fail(); flash('bad'); }
    const opts = $('#opts');
    if (opts) Array.from(opts.children).forEach((b, i) => { b.disabled = true; if (i === q.answerIdx) b.classList.add('correct'); else if (answer.choice === i) b.classList.add('wrong', 'shake'); });
    const f = $('#inputs');
    if (f) { f.querySelectorAll('input').forEach(inp => { inp.disabled = true; inp.blur(); const r = result.parts[inp.name]; inp.classList.add(r === 'exact' ? 'ok' : r === 'tones' ? 'half' : 'bad'); }); const sb = f.querySelector('button[type=submit]'); if (sb) sb.style.display = 'none'; }
    const fb = $('#feedback'); fb.innerHTML = feedbackHtml(q, result, answer);
    setTimeout(() => fb.scrollIntoView({ behavior: 'smooth', block: 'end' }), 60);
  }
  function feedbackHtml(q, result, answer) {
    const c = q.card, last = quiz.i === quiz.questions.length - 1;
    const verdict = result.ok ? '<div class="verdict ok">Верно · 对</div>' : result.fraction > 0 ? '<div class="verdict half">Частично</div>' : `<div class="verdict bad">${answer.timeout ? 'Время вышло' : 'Неверно · 错'}</div>`;
    const nextBtn = `<button class="btn btn-primary btn-block" data-action="quiz-next">${last ? 'Результат' : 'Дальше'}</button>`;
    const givenRows = result.ok ? '' : (q.guess || []).map(p => {
      const r = result.parts[p];
      if (!r) return '';
      const lbl = r === 'exact' ? 'верно' : r === 'tones' ? 'буквы верны, тоны нет' : 'неверно';
      let given = answer.input ? answer.input[p] : (answer.choice >= 0 && q.options && q.options[answer.choice] ? (q.options[answer.choice].text != null ? q.options[answer.choice].text : (q.options[answer.choice][p] != null ? q.options[answer.choice][p] : answer.choiceText)) : '');
      if (p === 'pinyin' && given) given = Pinyin.toMarks(given);
      return `<div class="fb-row"><span class="fb-p">${LABELS.part[p] || p}</span><span class="fb-a ${r}">${esc(given) || '—'}</span><span class="fb-v">${lbl}</span></div>`;
    }).join('');
    if (q.kind === 'sentence') {
      const it = q.sent;
      return `<div class="panel fb">${verdict}<div class="fb-card"><div class="hint" style="margin:0 0 6px">${esc(it.q)}</div><div class="hanzi mid">${esc(it.a[0])}</div><div class="pinyin" style="font-size:15px">${esc(it.py)}</div><div class="ru">${esc(it.ru)}</div>${it.a.length > 1 ? `<div class="note">Также верно: ${it.a.slice(1).map(esc).join('、')}</div>` : ''}</div>${givenRows}${nextBtn}</div>`;
    }
    return `<div class="panel fb">${verdict}<div class="fb-card"><div class="hanzi mid ${c.hanzi.replace(/[…\s]/g, '').length >= 5 ? 'len5' : ''}">${esc(c.hanzi)}</div><div class="pinyin">${esc(c.pinyin)}</div><div class="ru">${esc(c.ru)}</div>${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}</div>${givenRows}${nextBtn}</div>`;
  }
  function next() {
    if (!quiz || !quiz.answered) return;
    if (quiz.i >= quiz.questions.length - 1) return finishQuiz(false);
    quiz.i++; quiz.answered = false; quiz.flipped = false; quiz.qStart = Date.now(); render();
  }
  actions['quiz-next'] = next;
  function startTimer() {
    stopTimer();
    if (!quiz || !quiz.cfg.timer || quiz.cfg.mode === 'flip' || quiz.answered) return;
    quiz.timeLeft = quiz.cfg.timer;
    const el = $('#qtimer');
    quiz.timerId = setInterval(() => {
      quiz.timeLeft--;
      if (el) { el.textContent = quiz.timeLeft; el.classList.toggle('urgent', quiz.timeLeft <= 3); }
      if (quiz.timeLeft <= 0) { stopTimer(); const q = quiz.questions[quiz.i]; if (q.options) finishQuestion(q, Quiz.checkChoice(q, -1), { choice: -1, timeout: true }); else submitInput(true); }
    }, 1000);
  }
  function stopTimer() { if (quiz && quiz.timerId) { clearInterval(quiz.timerId); quiz.timerId = null; } }
  actions['quiz-quit'] = () => {
    if (!quiz) return;
    const done = quiz.questions.filter(q => q.result).length;
    stopTimer();
    sheet(`<h3 class="sh-t">Выйти из тренировки?</h3><p style="color:var(--ink-2);margin:0 0 14px">Отвечено ${done} из ${quiz.questions.length}.</p><div class="btns mt0">${done ? '<button class="btn btn-primary btn-block" id="qs">Сохранить ответы и выйти</button>' : ''}<button class="btn btn-danger btn-block" id="qd">Выйти без сохранения</button><button class="btn btn-secondary btn-block" id="qc">Продолжить</button></div>`, s => {
      const qs = $('#qs', s); if (qs) qs.onclick = () => { closeSheet(); finishQuiz(true); };
      $('#qd', s).onclick = () => { closeSheet(); quiz = null; nav('setup', {}, { replace: true }); };
      $('#qc', s).onclick = () => { closeSheet(); if (!quiz.answered) startTimer(); };
    });
  };
  function finishQuiz(aborted) {
    stopTimer();
    const qs = quiz.questions.filter(q => q.result);
    if (!qs.length) { quiz = null; return nav('setup', {}, { replace: true }); }
    const diff = quiz.cfg.mode === 'flip' ? 'flip' : quiz.cfg.difficulty;
    const sc = Quiz.scoreAttempt(qs, diff);
    const spec = quiz.kind === 'hsk' ? Quiz.EXAM[quiz.level] : null;
    if (spec) sc.score = Math.round(sc.percent / 100 * spec.max);
    const a = {
      id: uid(), ts: quiz.startedAt, endedAt: Date.now(), durationMs: Date.now() - quiz.startedAt,
      mode: quiz.kind === 'hsk' ? 'hsk' : quiz.cfg.mode, level: quiz.level, difficulty: quiz.kind === 'hsk' ? 'exam' : diff,
      deckIds: quiz.deckIds, deckName: quiz.cfg.deckName || (quiz.cfg.mode === 'sentence' ? 'Фразы' : quiz.deckIds.map(id => (deckById(id) || {}).name || id).join(', ')),
      show: quiz.kind === 'hsk' ? 'exam' : quiz.cfg.show, guess: quiz.cfg.show === 'mixed' ? ['all'] : (quiz.cfg.guess || []), order: quiz.cfg.order, timer: quiz.cfg.timer || 0,
      total: qs.length, planned: quiz.questions.length, aborted: !!aborted,
      correct: sc.correct, partial: sc.partial, wrong: qs.length - sc.correct - sc.partial, percent: sc.percent, score: sc.score,
      passed: quiz.kind === 'hsk' ? sc.percent >= 60 : null, examMax: spec ? spec.max : null,
      questions: qs.map(q => ({ cardId: q.cardId, hanzi: q.card.hanzi, pinyin: q.card.pinyin, ru: q.card.ru, show: q.show, guess: q.guess, answer: q.answer, parts: q.result.parts, fraction: q.result.fraction, ok: q.result.ok, ms: q.ms })),
    };
    a.points = Campaign.attemptPoints(a);
    quiz = null;
    saveAttempt(a).then(ev => { lastEvents = { id: a.id, ...ev }; Sound.finish(a.percent >= 60); nav('result', { id: a.id }, { replace: true }); });
  }

  /* ── результат ── */
  function ring(pct) {
    const r = 48, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
    const col = pct >= 80 ? 'var(--jade)' : pct >= 60 ? 'var(--gold)' : 'var(--vermilion)';
    return `<svg class="ring" viewBox="0 0 116 116"><circle cx="58" cy="58" r="${r}" fill="none" stroke="var(--paper-3)" stroke-width="10"/><circle cx="58" cy="58" r="${r}" fill="none" stroke="${col}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 58 58)" style="transition:stroke-dashoffset .8s"/><text x="58" y="66" text-anchor="middle" font-size="26">${pct}%</text></svg>`;
  }
  views.result = {
    render(p) {
      const a = state.attempts.find(x => x.id === p.id);
      if (!a) return '<div class="empty">Попытка не найдена</div>';
      const mistakes = a.questions.filter(q => !q.ok);
      const stamp = a.mode === 'hsk' ? `<div class="stamp ${a.passed ? 'pass' : 'fail'}">${a.passed ? '合格' : '不合格'}<small>${a.passed ? 'сдан' : 'не сдан'}</small></div>` : (a.percent === 100 ? '<div class="stamp pass">满分<small>без ошибок</small></div>' : '');
      return `<div class="vh"><div class="seal">果</div><div class="grow"><h1 class="title">Результат</h1><div class="sub">${LABELS.mode[a.mode]}${a.level ? ' ' + a.level : ''}${a.mode === 'hsk' ? '' : ' · ' + esc(a.deckName)}${a.mode !== 'flip' ? ' · ' + LABELS.diff[a.difficulty] : ''}${a.aborted ? ' · прервана' : ''}</div></div></div>
      <div class="panel ornate result-top ${stamp ? 'has-stamp' : ''}">${ring(a.percent)}<div class="res-meta"><div class="big-score">${a.score}<small> ${a.examMax ? 'из ' + a.examMax + ' · порог ' + Math.round(a.examMax * 0.6) : 'балл ×' + (Quiz.MULT[a.difficulty] || 1)}</small></div><div class="res-line">${a.correct} верно · ${a.partial} частично · ${a.wrong} неверно</div><div class="res-line muted">${fmt.dur(a.durationMs)} · ${fmt.secs(a.durationMs / a.total)} на вопрос</div></div>${stamp}</div>
      ${App.Profile.resultPanel(a, lastEvents && lastEvents.id === a.id ? lastEvents : null)}
      <div class="btns"><button class="btn btn-primary btn-block" data-action="retry-mistakes" data-id="${a.id}" ${mistakes.length ? '' : 'disabled'}>Повторить ошибки${mistakes.length ? ' (' + mistakes.length + ')' : ''}</button><button class="btn btn-secondary btn-block" data-action="retry-same" data-id="${a.id}">Ещё раз</button></div>
      ${mistakes.length ? `<h2 class="h2">Ошибки</h2>${mistakes.map(questionRow).join('')}` : '<div class="empty gold">Без единой ошибки — 太棒了!</div>'}
      <div class="btns"><button class="btn btn-secondary btn-block" data-go="attempt" data-params="${attr({ id: a.id })}">Разбор всех вопросов</button><button class="btn btn-secondary btn-block" data-go="home">На главную</button></div>`;
    },
    mount(p) {
      const ev = lastEvents && lastEvents.id === p.id ? lastEvents : null;
      if (!ev) return;
      lastEvents = null;
      if (ev.rankUp) setTimeout(() => { Sound.finish(true); App.Profile.showRankUp(ev.rank); }, 500);
      else if (ev.chest) toast(Campaign.NAMES.ultraZh + ' Марш-бросок! День за два и сундук с сокровищами — в профиле', 4000);
      else if (ev.ultra) toast(Campaign.NAMES.ultraZh + ' Марш-бросок! День зачтён за два', 3500);
      else if (ev.cap) toast(Campaign.NAMES.cap + ' зачтён — +1 день похода', 3000);
    },
  };
  function cfgFromAttempt(a) {
    const special = ['exam', 'write', 'audio', 'sentence'];
    return {
      deckIds: (a.deckIds || []).slice(),
      show: special.includes(a.show) ? undefined : a.show,
      guess: a.guess && a.guess.length && a.guess[0] !== 'all' && a.guess[0] !== 'answer' && a.guess[0] !== 'hanzi' ? a.guess.slice() : undefined,
      difficulty: ['easy', 'medium', 'hard'].includes(a.difficulty) ? a.difficulty : a.difficulty === 'exam' ? 'medium' : 'easy',
      count: 'all', order: 'random', timer: a.timer || 0,
    };
  }
  actions['retry-mistakes'] = el => {
    const a = state.attempts.find(x => x.id === el.dataset.id); if (!a) return;
    const wrongQ = a.questions.filter(q => !q.ok);
    if (a.mode === 'sentence') {
      const ids = new Set(wrongQ.map(q => q.cardId));
      const items = Sentences.ITEMS.filter(it => ids.has('sent:' + it.id));
      if (!items.length) return toast('Фразы не найдены');
      return startSession('sentence', cfgFromAttempt(a), { items });
    }
    const cards = wrongQ.map(q => cardIndex[q.cardId]).filter(Boolean);
    if (!cards.length) return toast('Карточки не найдены');
    startSession(a.mode === 'hsk' ? 'quiz' : a.mode, cfgFromAttempt(a), { cards });
  };
  actions['retry-same'] = el => {
    const a = state.attempts.find(x => x.id === el.dataset.id); if (!a) return;
    if (a.mode === 'hsk') return startExam(a.level);
    const cfg = cfgFromAttempt(a); cfg.count = a.planned || a.total;
    startSession(a.mode, cfg);
  };

  /* ── HSK: фиксированные экзамены ── */
  function levelCard(d) {
    const rec = window.Skill && Skill.recLevel(state, Skill.profile(state)) === d.level;
    const cards = cardsOfDeck(d.id), cs = state.cardStats;
    const seen = cards.filter(c => cs[c.id] && cs[c.id].asked).length, mastered = cards.filter(c => cs[c.id] && cs[c.id].mastered).length;
    const tests = state.attempts.filter(a => a.mode === 'hsk' && a.level === d.level);
    const best = tests.length ? Math.max(...tests.map(a => a.percent)) : null, passed = tests.filter(a => a.passed).length;
    const last = tests.length ? tests[tests.length - 1] : null;
    return `<div class="panel ornate level"><div class="level-h"><div class="level-n">HSK ${d.level}${rec ? ' <span class="rec-chip">рекомендуем</span>' : ''}</div><div class="level-d">${cards.length} слов · ${esc(d.desc)}</div></div>
      <div class="bars"><div class="bar-l">Изучено <b>${seen}</b></div><div class="progress"><i style="width:${seen / cards.length * 100}%"></i></div><div class="bar-l">Освоено <b>${mastered}</b></div><div class="progress gold"><i style="width:${mastered / cards.length * 100}%"></i></div></div>
      <div class="hint">Формат экзамена: ${EXAM_FORMAT[d.level]}</div>
      <div class="level-stats"><span>Тестов: <b>${tests.length}</b></span><span>Сдано: <b>${passed}</b></span><span>Лучший: <b>${best == null ? '—' : best + '%'}</b></span>${last ? `<span>Последний: <b>${last.percent}%</b></span>` : ''}</div>
      <div class="btns row2 mb"><button class="btn btn-secondary" data-action="learn-deck" data-id="${d.id}">Учить</button><button class="btn btn-primary" data-action="hsk-real-info" data-level="${d.level}">Экзамен HSK ${d.level}</button></div>
      ${true ? `<div class="btns row2 mt0 mb"><button class="btn btn-secondary btn-sm" data-action="hsk-test" data-level="${d.level}">Словарный тест</button><button class="btn btn-secondary btn-sm" data-go="deck" data-params="${attr({ id: d.id })}">Список слов</button></div>` : ''}
      </div>`;
  }
  views.hsk = {
    render() {
      return `<div class="vh"><div class="seal">考</div><div class="grow"><h1 class="title">HSK 1–4</h1><div class="sub">Встроенные словари и настоящие экзамены</div></div></div>
      ${builtinDecks.filter(d => d.level).map(levelCard).join('')}
      <div class="panel ornate level"><div class="level-h"><div class="level-n">HSKK</div><div class="level-d">говорение · устный экзамен</div></div>
        <div class="hint" style="margin:0 0 12px">Повторяете за диктором, описываете картинку и отвечаете голосом — приложение распознаёт вашу речь и оценивает.</div>
        <button class="btn btn-secondary btn-block" disabled>В разработке · 即将推出</button></div>
      <div class="panel"><div class="hint" style="margin:0">Формат экзаменов фиксированный и не зависит от настроек тренировки. Порог сдачи — 60 %, как на реальном экзамене. «Освоено» — три верных ответа подряд.</div></div>`;
    },
  };
  function startExam(level) {
    const cards = cardsOfDeck('hsk' + level), spec = Quiz.EXAM[level];
    const questions = Quiz.buildExam(level, cards, state.cardStats);
    quiz = { cfg: { deckIds: ['hsk' + level], mode: 'quiz', show: 'exam', guess: [], difficulty: 'exam', count: spec.count, order: 'random', timer: spec.timer }, kind: 'hsk', level, deckIds: ['hsk' + level], questions, i: 0, startedAt: Date.now(), qStart: Date.now(), answered: false, flipped: false, timerId: null, timeLeft: 0 };
    nav('quiz');
  }
  const REAL_DESC = {
    1: ['<b>听力 Аудирование</b> — 20 вопросов, 4 части: слово и картинка (对/错), предложение → картинка, диалог → картинка, вопрос → ответ.',
        '<b>阅读 Чтение</b> — 20 вопросов, 4 части: слово и картинка, предложение → картинка, подбор ответов, слово в пропуск.'],
    2: ['<b>听力 Аудирование</b> — 35 вопросов, 4 части: предложение и картинка (对/错), диалог → картинка из общего набора, диалог с вопросом, длинный диалог с вопросом.',
        '<b>阅读 Чтение</b> — 25 вопросов, 4 части: предложение → картинка, слово в пропуск, суждение ★ (对/错), подбор ответа к реплике.'],
    3: ['<b>听力 Аудирование</b> — 40 вопросов, 4 части: диалог → картинка из общего набора, суждение ★ на слух (对/错), диалог с вопросом, длинный диалог с вопросом.',
        '<b>阅读 Чтение</b> — 30 вопросов, 3 части: подбор ответа к реплике, слово в пропуск, текст с вопросом. Плюс <b>书写 Письмо</b> — 10 заданий: составить предложение из слов и вписать иероглиф по пиньиню (15 минут).'],
    4: ['<b>听力 Аудирование</b> — 45 вопросов, 3 части: суждение ★ на слух (对/错), короткий диалог с вопросом, длинный диалог с вопросом. Варианты — четыре.',
        '<b>阅读 Чтение</b> — 40 вопросов, 40 минут, 3 части: слово в пропуск из общего списка, расставить три предложения по порядку, текст с вопросом.',
        '<b>书写 Письмо</b> — 15 заданий, 25 минут: собрать предложение из слов и вписать иероглиф по пиньиню.'],
  };
  actions['hsk-real-info'] = el => {
    const level = +el.dataset.level || 1;
    const spec = HskReal.SPECS[level];
    sheet(`<h3 class="sh-t">Экзамен HSK ${level} · настоящий формат</h3><div class="install-note">
      <p>${REAL_DESC[level][0]} Каждое аудио звучит два раза, на ответ ${spec.answerSec} с.</p>
      <p>${REAL_DESC[level][1]} Время секции — ${Math.round(spec.readingSec / 60)} минут.</p>
      <p>Проверка только в конце. Секции по 100 баллов, сдано от ${spec.pass} из ${spec.max}. Вариант каждый раз собирается заново.</p>
      </div>
      <button class="btn btn-primary btn-block mt" data-action="hsk-real" data-level="${level}">Начать экзамен</button>`);
  };
  actions['hsk-test'] = el => {
    const level = +el.dataset.level, spec = Quiz.EXAM[level];
    const parts = [`${spec.count - spec.write} ${spec.write ? 'вопросов на чтение' : 'вопросов'}: иероглиф${spec.pinyin ? ' с пиньинем' : ' без пиньиня'} → перевод и перевод → иероглиф, выбор из 4${spec.similar ? ' похожих' : ''}`];
    if (spec.write) parts.push(`${spec.write} вопросов на написание: пиньинь + перевод → набрать иероглифы (нужна китайская клавиатура)`);
    parts.push(`${spec.timer} с на вопрос, без пауз`, `Балл из ${spec.max}, сдан при ${Math.round(spec.max * 0.6)} (60 %)`);
    sheet(`<h3 class="sh-t">Экзамен HSK ${level}</h3><div class="install-note">${parts.map(t => `<p>${esc(t)}.</p>`).join('')}<p class="muted">Формат фиксированный, как на экзамене. Потренироваться с выбором сложности — кнопка «Учить».</p></div><button class="btn btn-primary btn-block mt" id="hgo">Начать экзамен</button>`, s => {
      $('#hgo', s).onclick = () => { closeSheet(); startExam(level); };
    });
  };
})();
