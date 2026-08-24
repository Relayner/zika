/* Плеер настоящего экзамена HSK: секции, автопроигрывание аудио дважды, таймеры, разбор в конце. */
(() => {
  const { state, views, actions, nav, esc, attr, uid, $, toast, sheet, closeSheet, LABELS, fmt, saveAttempt, render } = App;
  let ex = null; /* { qs, i, phase: 'intro'|'part'|'q'|'done', level, spec, startedAt, secDeadline, answerTimer, audioRun } */

  const picImg = id => `<img class="ex-pic" src="${IMG_URL('pic-' + id)}" alt="" draggable="false">`;

  function startRealExam(level) {
    if (!Speech.available()) return toast('Для секции 听力 нужен китайский голос: Настройки iPhone → Универсальный доступ → Устный контент → Голоса', 5000);
    let qs;
    try { qs = HskReal.BUILDERS[level](); } catch (e) { return toast(e.message, 4000); }
    ex = { qs, i: -1, phase: 'intro', level, spec: HskReal.SPECS[level], startedAt: Date.now(), qStart: 0, deadlines: {}, qRunFor: -1, answerTimer: null, audioRun: 0 };
    nav('exam');
  }
  actions['hsk-real'] = el => { closeSheet(); startRealExam(+el.dataset.level); };

  function stopTimers() { if (ex && ex.answerTimer) { clearInterval(ex.answerTimer); ex.answerTimer = null; } try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
  function partKey(q) { return q.sec + '-' + q.part; }

  views.exam = {
    render() {
      if (!ex) return '<div class="empty">Экзамен не запущен.</div><div class="btns"><button class="btn btn-primary btn-block" data-go="hsk" data-replace>К HSK</button></div>';
      const spec = ex.spec;
      if (ex.phase === 'intro') {
        return `<div class="vh"><button class="icon-btn" data-action="exam-quit">✕</button><div class="grow"><h1 class="title">Экзамен HSK ${ex.level}</h1><div class="sub">настоящий формат</div></div></div>
        <div class="panel ornate"><div class="flabel">Структура</div><div class="install-note">
        <p><b>听力 Аудирование</b> — ${spec.sections.listening.total} вопросов, 4 части. Каждое аудио звучит <b>два раза</b>, на ответ ${spec.answerSec} секунд, назад вернуться нельзя.</p>
        <p><b>阅读 Чтение</b> — ${spec.sections.reading.total} вопросов, 4 части, общее время ${Math.round(spec.readingSec / 60)} минут.</p>
        <p>Проверка — только в конце, как на настоящем экзамене. Каждая секция даёт до 100 баллов; сдано от ${spec.pass} из ${spec.max}.</p>
        <p>Вариант собирается заново из банка заданий — повторы от попытки к попытке маловероятны.</p></div></div>
        <button class="btn btn-primary btn-block btn-lg" data-action="exam-next" data-nosound>开始 · Начать</button>`;
      }
      if (ex.phase === 'part') {
        const q = ex.qs[ex.i + 1];
        const sec = spec.sections[q.sec];
        return `<div class="vh"><button class="icon-btn" data-action="exam-quit">✕</button><div class="grow"><h1 class="title">${sec.zh} · часть ${q.part}</h1><div class="sub">${sec.ru}</div></div></div>
        <div class="panel ornate"><div class="install-note"><p>${spec.partRules[partKey(q)]}</p></div></div>
        ${q.sec === 'reading' && ex.qs[ex.i] && ex.qs[ex.i].sec === 'listening' ? `<div class="hint" style="text-align:center;margin-bottom:10px">Секция 听力 закончена. На чтение — ${Math.round(spec.readingSec / 60)} минут, таймер пойдёт сейчас.</div>` : ''}
        <button class="btn btn-primary btn-block btn-lg" data-action="exam-next" data-nosound>继续 · Дальше</button>`;
      }
      if (ex.phase === 'q') {
        const q = ex.qs[ex.i];
        const n = ex.i + 1, total = ex.qs.length;
        const isL = q.sec === 'listening';
        const head = `<div class="qbar"><button class="icon-btn" data-action="exam-quit">✕</button><div class="progress"><i style="width:${ex.i / total * 100}%"></i></div><div class="qcount">${n}/${total}</div><div class="qtimer" id="extimer">·</div></div>`;
        let prompt = '';
        if (isL) prompt = `<div class="ex-audio"><span class="say-ico" id="say-ico">🔊</span><div class="hint">${q.part === 3 ? 'Диалог' : 'Аудио'} прозвучит два раза</div></div>`;
        else if (q.type === 'tf') prompt = `<div class="ex-word"><span class="hanzi" style="font-size:44px">${esc(q.text)}</span><div class="pinyin">${esc(q.textPy || '')}</div></div>`;
        else if (q.type === 'input') prompt = `<div class="hanzi sent-q" style="font-size:24px">${esc(q.text)}</div><div class="pinyin" style="margin-top:6px">（${esc(q.py)}）</div>`;
        else if (q.type === 'arrange') prompt = `<div class="hint" style="text-align:center;margin:0">Составьте предложение</div>`;
        else prompt = `<div class="hanzi sent-q" style="font-size:${q.text && q.text.length > 26 ? 20 : 26}px">${esc(q.text)}</div>${q.sub ? `<div class="ru" style="margin-top:8px;font-weight:600">${esc(q.sub)}</div>` : ''}`;
        let answerUi = '';
        if (q.type === 'tf') answerUi = `${q.pic ? picImg(q.pic) : ''}${q.star ? `<div class="ex-star">★ ${esc(q.star)}</div>` : ''}<div class="btns row2 mt"><button class="btn btn-jade ex-opt" data-action="exam-answer" data-idx="0" data-nosound>对 · верно</button><button class="btn btn-danger ex-opt" data-action="exam-answer" data-idx="1" data-nosound>错 · неверно</button></div>`;
        else if (q.type === 'pickpic') answerUi = `<div class="ex-pics">${q.pics.map((p, i) => `<button class="ex-picbtn" data-action="exam-answer" data-idx="${i}" data-nosound><span class="ex-letter">${'ABC'[i]}</span>${picImg(p)}</button>`).join('')}</div>`;
        else if (q.type === 'opts') answerUi = `<div class="opts">${q.opts.map((o, i) => `<button class="opt opt-txt" data-action="exam-answer" data-idx="${i}" data-nosound><span class="opt-hanzi">${esc(o)}</span></button>`).join('')}</div>`;
        else if (q.type === 'pool') {
          const used = new Set(ex.qs.filter(x => x !== q && x.type === 'pool' && x.pool === q.pool && x.given != null).map(x => x.given));
          answerUi = `<div class="opts">${q.pool.map((o, i) => `<button class="opt opt-txt" data-action="exam-answer" data-idx="${i}" ${used.has(o) ? 'disabled' : ''} data-nosound><span class="ex-letter">${'ABCDEF'[i]}</span><span class="opt-hanzi">${esc(o)}</span></button>`).join('')}</div>`;
        }
        else if (q.type === 'arrange') {
          const sel = q.sel || [];
          answerUi = `<div class="arr-line panel" style="margin-bottom:10px">${sel.length ? sel.map((ci, i) => `<button class="chip on" data-action="arr-del" data-i="${i}" data-nosound>${esc(q.chunks[ci])}</button>`).join('') : '<span class="hint">Нажимайте слова по порядку</span>'}</div>
          <div class="chips">${q.chunks.map((c, i) => sel.includes(i) ? '' : `<button class="chip" data-action="arr-add" data-i="${i}" data-nosound>${esc(c)}</button>`).join('')}</div>
          <button class="btn btn-primary btn-block mt" data-action="arr-ok" ${sel.length === q.chunks.length ? '' : 'disabled'}>Готово</button>`;
        }
        else if (q.type === 'input') {
          answerUi = `<form id="ex-inputs" class="inputs" autocomplete="off"><div class="field"><label>Иероглиф <span class="muted">· пиньинь: ${esc(q.py)} · клавиатура 中文</span></label><input class="inp" name="answer" lang="zh-CN" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="汉字"></div><button class="btn btn-primary btn-block" type="submit">Готово</button></form>`;
        }
        else if (q.type === 'poolpic') {
          const used = new Set(ex.qs.filter(x => x !== q && x.type === 'poolpic' && x.pool === q.pool && x.given != null).map(x => x.given));
          answerUi = `<div class="ex-pics pool6">${q.pool.map((p, i) => `<button class="ex-picbtn ${used.has(p) ? 'used' : ''}" data-action="exam-answer" data-idx="${i}" ${used.has(p) ? 'disabled' : ''} data-nosound><span class="ex-letter">${'ABCDEF'[i]}</span>${picImg(p)}</button>`).join('')}</div>`;
        }
        return head + `<div class="panel ornate qcard" style="min-height:auto">${prompt}</div>` + answerUi;
      }
      return '';
    },
    mount() {
      if (!ex) return;
      if (ex.phase === 'q') {
        runQuestion();
        const f = $('#ex-inputs');
        if (f) f.addEventListener('submit', e => {
          e.preventDefault();
          const q = ex.qs[ex.i];
          if (!ex || q.ok != null) return;
          const val = Quiz.normZh(f.elements.answer.value);
          if (!val) { toast('Введите иероглиф'); return; }
          stopTimers();
          q.given = val; q.ok = val === q.answer; q.ms = Date.now() - ex.qStart;
          Sound.click();
          advance();
        });
      }
    },
  };

  async function playAudio(q, run) {
    const texts = Array.isArray(q.say) ? q.say : [q.say];
    for (let r = 0; r < 2; r++) {
      if (!ex || ex.qs[ex.i] !== q || ex.audioRun !== run) return;
      const ico = $('#say-ico'); if (ico) ico.classList.add('talking');
      for (const t of texts) {
        if (!ex || ex.audioRun !== run) return;
        await Speech.speak(t);
        await new Promise(rs => setTimeout(rs, 500));
      }
      if (ico) ico.classList.remove('talking');
      if (r === 0) await new Promise(rs => setTimeout(rs, 1400));
    }
  }
  function runQuestion() {
    const q = ex.qs[ex.i];
    if (ex.qRunFor === ex.i) { return; }
    ex.qRunFor = ex.i;
    ex.qStart = Date.now();
    const el = $('#extimer');
    if (q.sec === 'listening') {
      ex.audioRun++;
      const run = ex.audioRun;
      const deadline = Date.now() + 1000 * (ex.spec.answerSec + (Array.isArray(q.say) ? 8 + q.say.length * 7 : 8));
      playAudio(q, run);
      ex.answerTimer = setInterval(() => {
        const left = Math.ceil((deadline - Date.now()) / 1000);
        if (el) el.textContent = left;
        if (left <= 0) { answer(q, -1, true); }
      }, 250);
    } else {
      ex.answerTimer = setInterval(() => {
        const dl = ex.deadlines[q.sec] || 0;
        const left = Math.ceil((dl - Date.now()) / 1000);
        const tm = $('#extimer');
        if (tm) tm.textContent = left > 60 ? Math.ceil(left / 60) + ' мин' : left;
        if (left <= 0) expireSection(q.sec);
      }, 250);
    }
  }
  /* Время секции вышло: оставшиеся вопросы секции — мимо, дальше следующая секция или итог */
  function expireSection(sec) {
    stopTimers();
    toast('Время секции вышло');
    let last = ex.i;
    for (let i = ex.i; i < ex.qs.length; i++) if (ex.qs[i].sec === sec) { if (ex.qs[i].ok == null) { ex.qs[i].ok = false; ex.qs[i].given = null; } last = i; }
    ex.i = last;
    ex.phase = 'q';
    advance();
  }
  function answer(q, idx, timeout) {
    if (!ex || q.given != null || q.ok != null) return;
    stopTimers();
    if (q.type === 'pool' || q.type === 'poolpic') { const val = idx < 0 ? null : q.pool[idx]; q.given = val; q.ok = val === q.answer; }
    else { q.givenIdx = idx; q.ok = idx === q.correct; q.given = idx < 0 ? null : String(idx); }
    q.ms = Date.now() - ex.qStart;
    if (timeout) toast('Время вышло');
    Sound.click();
    advance();
  }
  actions['exam-answer'] = el => { if (ex && ex.phase === 'q') answer(ex.qs[ex.i], +el.dataset.idx, false); };
  actions['arr-add'] = el => { if (!ex) return; const q = ex.qs[ex.i]; q.sel = q.sel || []; q.sel.push(+el.dataset.i); render(); };
  actions['arr-del'] = el => { if (!ex) return; const q = ex.qs[ex.i]; q.sel.splice(+el.dataset.i, 1); render(); };
  actions['arr-ok'] = () => {
    if (!ex) return;
    const q = ex.qs[ex.i];
    if (!q.sel || q.sel.length !== q.chunks.length || q.ok != null) return;
    stopTimers();
    const joined = q.sel.map(i => q.chunks[i]).join('');
    q.given = joined; q.ok = q.answers.includes(joined); q.ms = Date.now() - ex.qStart;
    Sound.click();
    advance();
  };
  actions['exam-next'] = () => { if (ex) advance(); };
  function advance() {
    stopTimers();
    const prev = ex.i >= 0 ? ex.qs[ex.i] : null;
    const next = ex.qs[ex.i + 1];
    if (!next) return finishExam(false);
    if (ex.phase === 'intro' || ex.phase === 'q') {
      const newPart = !prev || prev.sec !== next.sec || prev.part !== next.part;
      if (ex.phase === 'q' && !newPart) { ex.i++; render(); return; }
      if (ex.phase === 'intro' || newPart) { ex.phase = 'part'; render(); return; }
    }
    if (ex.phase === 'part') {
      if (next.sec !== 'listening' && !ex.deadlines[next.sec]) {
        const secs = (ex.spec.sectionSec && ex.spec.sectionSec[next.sec]) || ex.spec.readingSec;
        ex.deadlines[next.sec] = Date.now() + secs * 1000;
      }
      ex.i++; ex.phase = 'q'; render(); return;
    }
  }
  actions['exam-quit'] = () => {
    if (!ex) return;
    stopTimers();
    sheet(`<h3 class="sh-t">Прервать экзамен?</h3><p style="color:var(--ink-2)">Результат не будет сохранён — на настоящем экзамене выйти и вернуться нельзя.</p><div class="btns"><button class="btn btn-danger btn-block" id="eq">Прервать</button><button class="btn btn-secondary btn-block" id="ec">Продолжить</button></div>`, s => {
      $('#eq', s).onclick = () => { closeSheet(); ex = null; nav('hsk', {}, { replace: true }); };
      $('#ec', s).onclick = () => { closeSheet(); if (ex.phase === 'q') { App.render(); } };
    });
  };
  function finishExam(timeUp) {
    stopTimers();
    for (const q of ex.qs) if (q.ok == null) { q.ok = false; q.given = null; }
    const res = HskReal.score(ex.qs, ex.spec);
    const spec = ex.spec;
    const a = {
      id: uid(), ts: ex.startedAt, endedAt: Date.now(), durationMs: Date.now() - ex.startedAt,
      mode: 'hsk', format: 'real', level: ex.level, difficulty: 'exam',
      deckIds: ['hsk' + ex.level], deckName: 'Экзамен HSK ' + ex.level, show: 'exam', guess: ['all'], order: 'random', timer: 0,
      total: ex.qs.length, planned: ex.qs.length, aborted: false,
      correct: ex.qs.filter(q => q.ok).length, partial: 0, wrong: ex.qs.filter(q => !q.ok).length,
      percent: Math.round(ex.qs.filter(q => q.ok).length / ex.qs.length * 100),
      score: res.score, examMax: spec.max, passed: res.passed, sections: res.sections,
      questions: ex.qs.map(q => ({ cardId: 'ex' + ex.level + ':' + q.sec + q.part, hanzi: q.type === 'tf' ? (q.say || q.text) : (Array.isArray(q.say) ? q.say.join(' ') : (q.say || q.text)), pinyin: '', ru: LABELS.part.answer + ': ' + (q.type === 'pool' ? q.answer : q.type === 'opts' ? q.opts[q.correct] : q.correct === 0 ? '对' : '错'), show: q.sec, guess: [String(q.part)], answer: { given: q.given }, parts: {}, fraction: q.ok ? 1 : 0, ok: q.ok, ms: q.ms || 0 })),
    };
    a.points = Campaign.attemptPoints(a);
    const finished = ex; ex = null;
    saveAttempt(a).then(() => { Sound.finish(a.passed); nav('exam-result', { id: a.id }, { replace: true }); });
  }
  views['exam-result'] = {
    render(p) {
      const a = state.attempts.find(x => x.id === p.id);
      if (!a || !a.sections) return '<div class="empty">Результат не найден</div>';
      const stamp = `<div class="stamp ${a.passed ? 'pass' : 'fail'}">${a.passed ? '合格' : '不合格'}<small>${a.passed ? 'сдан' : 'не сдан'}</small></div>`;
      const lvl = a.level || 1;
      const SEC_LABELS = { listening: ['听力', 'Аудирование'], reading: ['阅读', 'Чтение'], writing: ['书写', 'Письмо'] };
      const secRow = (id, zh, ru) => { const s = a.sections[id]; return `<div class="fb-row"><span class="fb-p" style="min-width:110px">${zh} ${ru}</span><span class="fb-a">${s.correct} из ${s.total}</span><span class="fb-v"><b>${s.points}</b> / 100</span></div>`; };
      return `<div class="vh"><div class="seal">考</div><div class="grow"><h1 class="title">Экзамен HSK ${a.level}</h1><div class="sub">настоящий формат · ${fmt.dur(a.durationMs)}</div></div></div>
      <div class="panel ornate result-top has-stamp"><div class="res-meta"><div class="big-score">${a.score}<small> из ${a.examMax} · порог ${Math.round(a.examMax * 0.6)}</small></div>${Object.keys(a.sections).map(k => secRow(k, SEC_LABELS[k][0], SEC_LABELS[k][1])).join('')}</div>${stamp}</div>
      ${App.Profile.resultPanel(a, null)}
      <div class="btns"><button class="btn btn-primary btn-block" data-action="hsk-real" data-level="${lvl}">Ещё вариант</button><button class="btn btn-secondary btn-block" data-go="attempt" data-params="${attr({ id: a.id })}">Разбор ответов</button><button class="btn btn-secondary btn-block" data-go="hsk">К HSK</button></div>`;
    },
  };
})();
