/* Тренировка: настройка, тест (варианты / ввод / переворот), таймер, результат, HSK-тесты. */
(() => {
  const { state, views, actions, nav, esc, attr, uid, $, toast, sheet, closeSheet, confirm, persist, LABELS, fmt, renderPart, cardsOfDeck, cardsOfDecks, allDecks, deckById, hskCards, cardIndex, saveAttempt, flash, questionRow, render, builtinDecks } = App;
  const DEF = { deckIds: ['hsk1'], mode: 'quiz', show: 'hanzi', guess: ['pinyin', 'ru'], difficulty: 'easy', count: 20, order: 'random', timer: 0 };
  const DIFF_HINT = { easy: '4 варианта ответа.', medium: '8 вариантов, и они похожи на правильный: те же тоны, слоги, близкие переводы.', hard: 'Ввод с клавиатуры. Пиньинь проверяется с тонами (можно цифрами: ni3 hao3), для иероглифов нужна китайская клавиатура iOS.' };
  const EXAM_FORMAT = {
    1: '20 вопросов · выбор из 4 · пиньинь подписан · 20 с на вопрос · порог 120 из 200',
    2: '30 вопросов · выбор из 4 похожих · пиньинь подписан · 20 с на вопрос · порог 120 из 200',
    3: '30 вопросов без пиньиня + 10 на написание иероглифов · 25 с на вопрос · порог 180 из 300',
  };
  let setup = null, quiz = null, lastEvents = null;

  function getSetup() {
    if (!setup) setup = Object.assign({}, DEF, state.settings.lastSetup || {});
    setup.deckIds = (setup.deckIds || []).filter(id => deckById(id));
    if (!setup.deckIds.length) setup.deckIds = ['hsk1'];
    if (!Array.isArray(setup.guess) || !setup.guess.length) setup.guess = ['pinyin', 'ru'];
    return setup;
  }
  const seg = (s, key, opts) => `<div class="seg">${opts.map(([v, l]) => `<button class="${String(s[key]) === String(v) ? 'on' : ''}" data-action="setup-set" data-key="${key}" data-val="${v}">${l}</button>`).join('')}</div>`;
  const chip = (on, label, act, arg) => `<button class="chip ${on ? 'on' : ''}" data-action="${act}" data-arg="${esc(arg)}">${label}</button>`;

  const WRITE_HINT = { easy: 'Показываем перевод и пиньинь — вы набираете иероглифы.', medium: 'Только пиньинь — нужно вспомнить, какие иероглифы так читаются.', hard: 'Только перевод — нужно вспомнить и чтение, и написание.' };
  views.setup = {
    render() {
      const s = getSetup(), n = cardsOfDecks(s.deckIds).length, isQuiz = s.mode === 'quiz', isWrite = s.mode === 'write';
      const planned = s.count === 'all' ? n : Math.min(n, +s.count);
      const modeHint = isQuiz ? 'Вопрос — ответ: варианты или ввод с клавиатуры, с оценкой.' : isWrite ? 'Набираете иероглифы с китайской клавиатуры iPhone — по переводу и/или пиньиню.' : 'Смотрите, переворачивайте, отмечайте «знал / не знал».';
      return `<div class="vh"><div class="seal">练</div><div class="grow"><h1 class="title">Тренировка</h1><div class="sub">Настройте и начните</div></div></div>
      <div class="panel"><div class="flabel">Колоды <span class="muted">· карточек: ${n}</span></div><div class="chips">${allDecks().map(d => chip(s.deckIds.includes(d.id), esc(d.name) + ` <small>${cardsOfDeck(d.id).length}</small>`, 'setup-deck', d.id)).join('')}</div></div>
      <div class="panel"><div class="flabel">Режим</div>${seg(s, 'mode', [['quiz', 'Тест'], ['flip', 'Карточки'], ['write', 'Письмо 写']])}<div class="hint">${modeHint}</div>${isWrite ? '<button class="btn btn-secondary btn-sm btn-block mt" data-action="kbd-tip">Как включить китайскую клавиатуру</button>' : ''}</div>
      ${isWrite ? '' : `<div class="panel"><div class="flabel">Показывать</div>${seg(s, 'show', [['hanzi', 'Иероглиф'], ['pinyin', 'Пиньинь'], ['ru', 'Перевод'], ['mixed', 'Смешанно']])}
        ${s.show !== 'mixed' ? `<div class="flabel mt">Угадывать</div><div class="chips">${Quiz.PARTS.filter(p => p !== s.show).map(p => chip(s.guess.includes(p), LABELS.part[p], 'setup-guess', p)).join('')}</div>${isQuiz && s.guess.includes('hanzi') ? '<div class="hint">Иероглифы на сложном уровне вводятся с китайской клавиатуры; на лёгком и среднем — выбор из вариантов.</div>' : ''}` : '<div class="hint">Направление меняется от вопроса к вопросу; угадываются обе остальные части.</div>'}</div>`}
      ${isQuiz ? `<div class="panel"><div class="flabel">Сложность</div>${seg(s, 'difficulty', [['easy', 'Лёгкий'], ['medium', 'Средний'], ['hard', 'Сложный']])}<div class="hint">${DIFF_HINT[s.difficulty]} Балл: ${LABELS.diff[s.difficulty].toLowerCase()} ×${Quiz.MULT[s.difficulty]}.</div></div>` : ''}
      ${isWrite ? `<div class="panel"><div class="flabel">Сложность</div>${seg(s, 'difficulty', [['easy', 'Лёгкий'], ['medium', 'Средний'], ['hard', 'Сложный']])}<div class="hint">${WRITE_HINT[s.difficulty]} Балл ×${Quiz.MULT[s.difficulty]}.</div></div>` : ''}
      <div class="panel"><div class="flabel">Сколько карточек</div>${seg(s, 'count', [[10, '10'], [20, '20'], [30, '30'], [50, '50'], ['all', 'Все']])}
        <div class="flabel mt">Порядок</div>${seg(s, 'order', [['random', 'Случайно'], ['weak', 'Сначала слабые'], ['new', 'Сначала новые']])}
        ${isQuiz || isWrite ? `<div class="flabel mt">Таймер на вопрос</div>${seg(s, 'timer', [[0, 'Нет'], [10, '10 с'], [20, '20 с'], [30, '30 с']])}` : ''}</div>
      <button class="btn btn-primary btn-block btn-lg" data-action="setup-start" ${n < 1 ? 'disabled' : ''}>Начать${n ? ' · ' + fmt.plural(planned, 'карточка', 'карточки', 'карточек') : ''}</button>
      ${n < 1 ? '<div class="hint" style="text-align:center">В выбранных колодах нет карточек.</div>' : ''}`;
    },
  };
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
  actions['setup-deck'] = el => { const s = getSetup(), id = el.dataset.arg; if (s.deckIds.includes(id)) { if (s.deckIds.length > 1) s.deckIds = s.deckIds.filter(x => x !== id); } else s.deckIds.push(id); render(); };
  actions['setup-guess'] = el => { const s = getSetup(), p = el.dataset.arg; if (s.guess.includes(p)) { if (s.guess.length > 1) s.guess = s.guess.filter(x => x !== p); } else s.guess.push(p); render(); };
  actions['setup-set'] = el => { const s = getSetup(), k = el.dataset.key; let v = el.dataset.val; if ((k === 'count' && v !== 'all') || k === 'timer') v = +v; s[k] = v; if (k === 'show' && v !== 'mixed') s.guess = s.guess.filter(p => p !== v); if (!s.guess.length) s.guess = Quiz.PARTS.filter(p => p !== s.show); render(); };
  actions['setup-start'] = () => { const s = getSetup(); state.settings.lastSetup = { ...s }; persist(); startQuiz({ ...s }, { kind: s.mode }); };
  actions['learn-deck'] = el => { const s = getSetup(); s.deckIds = [el.dataset.id]; closeSheet(); nav('setup'); };

  function startQuiz(cfg, extra = {}) {
    const cards = extra.cards || cardsOfDecks(cfg.deckIds);
    if (!cards.length) return toast('Нет карточек для тренировки');
    const pool = cards.length >= 12 ? cards : [...cards, ...hskCards];
    const questions = Quiz.buildQuestions(cards, pool, cfg, state.cardStats);
    quiz = { cfg: { ...cfg }, kind: extra.kind || cfg.mode, level: extra.level || null, deckIds: cfg.deckIds.slice(), questions, i: 0, startedAt: Date.now(), qStart: Date.now(), answered: false, flipped: false, timerId: null, timeLeft: 0 };
    nav('quiz');
  }

  /* ── экран вопроса ── */
  views.quiz = {
    render() {
      if (!quiz) return '<div class="empty">Нет активной тренировки.</div><div class="btns"><button class="btn btn-primary btn-block" data-go="setup" data-replace>К настройке</button></div>';
      const q = quiz.questions[quiz.i], total = quiz.questions.length, card = q.card, isFlip = quiz.cfg.mode === 'flip';
      const head = `<div class="qbar"><button class="icon-btn" data-action="quiz-quit" aria-label="Выйти">✕</button><div class="progress"><i style="width:${quiz.i / total * 100}%"></i></div><div class="qcount">${quiz.i + 1}/${total}</div>${quiz.cfg.timer && !isFlip ? `<div class="qtimer" id="qtimer">${quiz.cfg.timer}</div>` : ''}</div>`;
      if (isFlip) return head + renderFlip(q);
      const promptBody = q.show === 'both' ? renderPart(card, 'pinyin', 'big') + renderPart(card, 'ru', '') : q.show === 'hp' ? renderPart(card, 'hanzi', 'big') + renderPart(card, 'pinyin', '') : renderPart(card, q.show, 'big');
      const prompt = `<div class="panel ornate qcard"><div class="qlabel">${LABELS.part[q.show]} → ${q.guess.map(p => LABELS.part[p]).join(' + ')}</div>${promptBody}</div>`;
      let answer;
      if (q.options) answer = `<div class="opts" id="opts">${q.options.map((o, i) => `<button class="opt" data-action="answer" data-idx="${i}" data-nosound>${(q.optionParts || q.guess).map(p => `<span class="opt-${p}">${esc(o[p])}</span>`).join('<span class="opt-sep">·</span>')}</button>`).join('')}</div>`;
      else answer = `<form id="inputs" class="inputs" autocomplete="off">${q.guess.map(p => `<div class="field"><label>${LABELS.part[p]}${p === 'pinyin' ? ' <span class="muted">· тоны цифрами, ü = v</span>' : p === 'hanzi' ? ' <span class="muted">· клавиатура 中文 через 🌐</span>' : ''}</label><input class="inp" name="${p}" ${p === 'hanzi' ? 'lang="zh-CN"' : ''} autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="${p === 'pinyin' ? 'ni3 hao3' : p === 'ru' ? 'перевод' : '汉字'}">${p === 'pinyin' ? '<div class="pv" id="pv"></div>' : ''}</div>`).join('')}<button class="btn btn-primary btn-block" type="submit">Проверить</button></form>`;
      return head + prompt + answer + '<div id="feedback"></div>';
    },
    mount() {
      if (!quiz) return;
      startTimer();
      const f = $('#inputs');
      if (f) {
        f.addEventListener('submit', e => { e.preventDefault(); submitInput(); });
        const pin = f.querySelector('input[name=pinyin]');
        if (pin) pin.addEventListener('input', () => { $('#pv').textContent = Pinyin.toMarks(pin.value); });
        const first = f.querySelector('input'); if (first) setTimeout(() => first.focus(), 80);
      }
    },
  };
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
  actions.answer = el => { if (!quiz || quiz.answered) return; const q = quiz.questions[quiz.i]; const idx = +el.dataset.idx; finishQuestion(q, Quiz.checkChoice(q, idx), { choice: idx, choiceText: q.guess.map(p => q.options[idx][p]).join(' · ') }); };
  function submitInput(timeout) {
    if (!quiz || quiz.answered) return;
    const q = quiz.questions[quiz.i], f = $('#inputs'), answers = {};
    q.guess.forEach(p => { answers[p] = f && f.elements[p] ? f.elements[p].value : ''; });
    if (!timeout && !Object.values(answers).some(v => v.trim())) { toast('Введите ответ'); return; }
    finishQuestion(q, Quiz.checkInput(q, answers), { input: answers, timeout: !!timeout });
  }
  function finishQuestion(q, result, answer) {
    stopTimer(); quiz.answered = true;
    const tm = $('#qtimer'); if (tm) tm.classList.add('hidden');
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
    const rows = result.ok ? '' : q.guess.map(p => {
      const r = result.parts[p], lbl = r === 'exact' ? 'верно' : r === 'tones' ? 'буквы верны, тоны нет' : 'неверно';
      let given = answer.input ? answer.input[p] : (answer.choice >= 0 ? q.options[answer.choice][p] : '');
      if (p === 'pinyin' && given) given = Pinyin.toMarks(given);
      return `<div class="fb-row"><span class="fb-p">${LABELS.part[p]}</span><span class="fb-a ${r}">${esc(given) || '—'}</span><span class="fb-v">${lbl}</span></div>`;
    }).join('');
    return `<div class="panel fb">${verdict}<div class="fb-card"><div class="hanzi mid ${c.hanzi.replace(/[…\s]/g, '').length >= 5 ? 'len5' : ''}">${esc(c.hanzi)}</div><div class="pinyin">${esc(c.pinyin)}</div><div class="ru">${esc(c.ru)}</div>${c.note ? `<div class="note">${esc(c.note)}</div>` : ''}</div>${rows}<button class="btn btn-primary btn-block" data-action="quiz-next">${last ? 'Результат' : 'Дальше'}</button></div>`;
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

  actions['quiz-quit'] = async () => {
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
      mode: quiz.kind === 'hsk' ? 'hsk' : quiz.cfg.mode, level: quiz.level, difficulty: diff,
      deckIds: quiz.deckIds, deckName: quiz.deckIds.map(id => (deckById(id) || {}).name || id).join(', '),
      show: quiz.cfg.show, guess: quiz.cfg.show === 'mixed' ? ['all'] : quiz.cfg.guess, order: quiz.cfg.order, timer: quiz.cfg.timer || 0,
      total: qs.length, planned: quiz.questions.length, aborted: !!aborted,
      correct: sc.correct, partial: sc.partial, wrong: qs.length - sc.correct - sc.partial, percent: sc.percent, score: sc.score,
      passed: quiz.kind === 'hsk' ? sc.percent >= 60 : null, examMax: spec ? spec.max : null,
      questions: qs.map(q => ({ cardId: q.cardId, hanzi: q.card.hanzi, pinyin: q.card.pinyin, ru: q.card.ru, show: q.show, guess: q.guess, answer: q.answer, parts: q.result.parts, fraction: q.result.fraction, ok: q.result.ok, ms: q.ms })),
    };
    a.points = Campaign.attemptPoints(a);
    const finished = quiz; quiz = null;
    saveAttempt(a).then(ev => { lastEvents = { id: a.id, ...ev }; Sound.finish(a.percent >= 60); nav('result', { id: a.id }, { replace: true }); });
    return finished;
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
  function cfgFromAttempt(a) { return { deckIds: a.deckIds, mode: a.mode === 'hsk' ? 'quiz' : a.mode, show: a.show === 'exam' ? 'mixed' : a.show, guess: a.guess && a.guess[0] !== 'all' ? a.guess : [], difficulty: ['easy', 'medium', 'hard'].includes(a.difficulty) ? a.difficulty : a.difficulty === 'exam' ? 'medium' : 'easy', count: 'all', order: 'random', timer: a.timer || 0 }; }
  actions['retry-mistakes'] = el => {
    const a = state.attempts.find(x => x.id === el.dataset.id); if (!a) return;
    const cards = a.questions.filter(q => !q.ok).map(q => cardIndex[q.cardId]).filter(Boolean);
    if (!cards.length) return toast('Карточки не найдены');
    startQuiz(cfgFromAttempt(a), { cards, kind: a.mode === 'hsk' ? 'quiz' : a.mode });
  };
  actions['retry-same'] = el => {
    const a = state.attempts.find(x => x.id === el.dataset.id); if (!a) return;
    if (a.mode === 'hsk') return startExam(a.level);
    const cfg = cfgFromAttempt(a); cfg.count = a.planned || a.total;
    startQuiz(cfg, { kind: a.mode, level: a.level });
  };

  /* ── HSK ── */
  function levelCard(d) {
    const cards = cardsOfDeck(d.id), cs = state.cardStats;
    const seen = cards.filter(c => cs[c.id] && cs[c.id].asked).length, mastered = cards.filter(c => cs[c.id] && cs[c.id].mastered).length;
    const tests = state.attempts.filter(a => a.mode === 'hsk' && a.level === d.level);
    const best = tests.length ? Math.max(...tests.map(a => a.percent)) : null, passed = tests.filter(a => a.passed).length;
    const last = tests.length ? tests[tests.length - 1] : null;
    return `<div class="panel ornate level"><div class="level-h"><div class="level-n">HSK ${d.level}</div><div class="level-d">${cards.length} слов · ${esc(d.desc)}</div></div>
      <div class="bars"><div class="bar-l">Изучено <b>${seen}</b></div><div class="progress"><i style="width:${seen / cards.length * 100}%"></i></div><div class="bar-l">Освоено <b>${mastered}</b></div><div class="progress gold"><i style="width:${mastered / cards.length * 100}%"></i></div></div>
      <div class="hint">Формат экзамена: ${EXAM_FORMAT[d.level]}</div>
      <div class="level-stats"><span>Тестов: <b>${tests.length}</b></span><span>Сдано: <b>${passed}</b></span><span>Лучший: <b>${best == null ? '—' : best + '%'}</b></span>${last ? `<span>Последний: <b>${last.percent}%</b></span>` : ''}</div>
      <div class="btns row2 mb"><button class="btn btn-secondary" data-action="learn-deck" data-id="${d.id}">Учить</button><button class="btn btn-primary" data-action="hsk-test" data-level="${d.level}">Тест HSK ${d.level}</button></div>
      <button class="btn btn-secondary btn-sm btn-block" data-go="deck" data-params="${attr({ id: d.id })}">Список слов</button></div>`;
  }
  views.hsk = {
    render() {
      return `<div class="vh"><div class="seal">考</div><div class="grow"><h1 class="title">HSK 1–3</h1><div class="sub">Встроенные словари и тесты · стандарт HSK 2.0</div></div></div>
      ${builtinDecks.map(levelCard).join('')}
      <div class="panel"><div class="hint" style="margin:0">Порог сдачи — 60%, как на реальном экзамене. Тест смешивает направления: иероглиф → пиньинь + перевод, пиньинь → иероглиф + перевод, перевод → иероглиф + пиньинь. «Освоено» — три верных ответа подряд.</div></div>`;
    },
  };
  function startExam(level) {
    const cards = cardsOfDeck('hsk' + level), spec = Quiz.EXAM[level];
    const questions = Quiz.buildExam(level, cards, state.cardStats);
    quiz = { cfg: { deckIds: ['hsk' + level], mode: 'quiz', show: 'exam', guess: [], difficulty: 'exam', count: spec.count, order: 'random', timer: spec.timer }, kind: 'hsk', level, deckIds: ['hsk' + level], questions, i: 0, startedAt: Date.now(), qStart: Date.now(), answered: false, flipped: false, timerId: null, timeLeft: 0 };
    nav('quiz');
  }
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
