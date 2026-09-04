/* Плеер настоящего экзамена HSK: этапы с заставками, сопоставления одним экраном, аудио дважды, разбор по этапам. */
(() => {
  const { state, views, actions, nav, esc, attr, uid, $, toast, sheet, closeSheet, LABELS, fmt, saveAttempt, render } = App;
  let ex = null; /* { qs, stages, i, phase: 'intro'|'part'|'q', level, spec, deadlines, qRunFor, active, answerTimer, audioRun } */
  const LET = 'ABCDEF';
  const pause = ms => new Promise(r => setTimeout(r, ms));
  const picImg = id => `<img class="ex-pic" src="${IMG_URL('pic-' + id)}" alt="" draggable="false">`;
  const picWord = id => { const p = HskReal.picById(id); return p ? p.h : ''; };
  const SEC = { listening: ['听力', 'Аудирование'], reading: ['阅读', 'Чтение'], writing: ['书写', 'Письмо'] };
  const plural = n => n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'вопрос' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'вопроса' : 'вопросов');

  function stagesOf(qs) {
    const list = [];
    for (const q of qs) {
      const key = q.sec + '-' + q.part;
      if (!list.length || list[list.length - 1].key !== key) list.push({ key, sec: q.sec, part: q.part, n: 0 });
      list[list.length - 1].n++;
    }
    return list;
  }

  function startRealExam(level) {
    if (!Speech.available()) return toast('Для секции 听力 нужен китайский голос: Настройки iPhone → Универсальный доступ → Устный контент → Голоса', 5000);
    let qs;
    try { qs = HskReal.BUILDERS[level](); } catch (e) { return toast(e.message, 4000); }
    ex = { qs, stages: stagesOf(qs), i: -1, phase: 'intro', level, spec: HskReal.SPECS[level], startedAt: Date.now(), qStart: 0, deadlines: {}, qRunFor: -1, active: 0, answerTimer: null, audioRun: 0 };
    nav('exam');
  }
  actions['hsk-real'] = el => { closeSheet(); startRealExam(+el.dataset.level); };

  /* Гасим и таймер, и озвучку: audioRun++ прерывает любой доигрывающий цикл аудио */
  function stopTimers() {
    if (ex) { if (ex.answerTimer) { clearInterval(ex.answerTimer); ex.answerTimer = null; } ex.audioRun++; }
    try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  }

  function blockOf(q) {
    const start = ex.qs.findIndex(x => x.block === q.block);
    let end = start;
    while (end + 1 < ex.qs.length && ex.qs[end + 1].block === q.block) end++;
    return { start, end, items: ex.qs.slice(start, end + 1) };
  }

  views.exam = {
    render() {
      if (!ex) return '<div class="empty">Экзамен не запущен.</div><div class="btns"><button class="btn btn-primary btn-block" data-go="hsk" data-replace>К HSK</button></div>';
      const spec = ex.spec;
      if (ex.phase === 'intro') {
        return `<div class="vh"><button class="icon-btn" data-action="exam-quit">✕</button><div class="grow"><h1 class="title">Экзамен HSK ${ex.level}</h1><div class="sub">настоящий формат · ${ex.stages.length} этапов</div></div></div>
        <div class="panel ornate"><div class="flabel">Структура</div><div class="install-note">
        <p><b>听力 Аудирование</b> — ${spec.sections.listening.total} вопросов. Каждое аудио звучит <b>два раза</b>, на ответ ${spec.answerSec} секунд, назад вернуться нельзя.</p>
        <p><b>阅读 Чтение</b> — ${spec.sections.reading.total} вопросов, общее время ${Math.round(((spec.sectionSec && spec.sectionSec.reading) || spec.readingSec) / 60)} минут.</p>
        ${spec.sections.writing ? `<p><b>书写 Письмо</b> — ${spec.sections.writing.total} заданий, ${Math.round(spec.sectionSec.writing / 60)} минут.</p>` : ''}
        <p>Перед каждым этапом — что будет и что делать. Проверка — только в конце: балл, разбор по этапам и все ошибки. Сдано от ${spec.pass} из ${spec.max}.</p></div></div>
        <button class="btn btn-primary btn-block btn-lg" data-action="exam-next" data-nosound>开始 · Начать</button>`;
      }
      if (ex.phase === 'part') {
        const next = ex.qs[ex.i + 1];
        const prev = ex.i >= 0 ? ex.qs[ex.i] : null;
        const sec = spec.sections[next.sec];
        const stIdx = ex.stages.findIndex(s => s.key === next.sec + '-' + next.part);
        const st = ex.stages[stIdx];
        const newSec = !prev || prev.sec !== next.sec;
        const secTime = next.sec === 'listening' ? 'аудио — два раза, назад нельзя' : `время секции — ${Math.round(((spec.sectionSec && spec.sectionSec[next.sec]) || spec.readingSec) / 60)} мин, таймер пойдёт сейчас`;
        return `<div class="vh"><button class="icon-btn" data-action="exam-quit">✕</button><div class="grow"><h1 class="title">Экзамен HSK ${ex.level}</h1><div class="sub">этап ${stIdx + 1} из ${ex.stages.length}</div></div></div>
        ${newSec ? `<div class="sec-banner"><span class="sec-zh">${sec.zh}</span><div><b>Секция · ${sec.ru}</b><div class="sec-note">${sec.total} вопросов · ${secTime}</div></div></div>` : ''}
        <div class="panel ornate stage-card"><div class="stage-wm">${sec.zh}</div>
          <div class="stage-chip">Этап ${stIdx + 1} из ${ex.stages.length}</div>
          <h2 class="stage-t">${sec.ru} · часть ${next.part}</h2>
          <div class="stage-n">${plural(st.n)}</div>
          <p class="stage-rule">${spec.partRules[next.sec + '-' + next.part]}</p>
        </div>
        <button class="btn btn-primary btn-block btn-lg" data-action="exam-next" data-nosound>继续 · Начать этап</button>`;
      }
      if (ex.phase === 'q') {
        const q = ex.qs[ex.i];
        if (q.block) return renderBlock(q);
        const n = ex.i + 1, total = ex.qs.length;
        const isL = q.sec === 'listening';
        const head = `<div class="qbar"><button class="icon-btn" data-action="exam-quit">✕</button><div class="progress"><i style="width:${ex.i / total * 100}%"></i></div><div class="qcount">${n}/${total}</div><div class="qtimer" id="extimer">·</div></div>`;
        let prompt = '';
        if (isL) prompt = `<div class="ex-audio"><span class="say-ico" id="say-ico">🔊</span><div class="hint">${q.part >= 3 ? 'Диалог' : 'Аудио'} прозвучит два раза</div></div>`;
        else if (q.type === 'tf') prompt = `<div class="ex-word"><span class="hanzi" style="font-size:44px">${esc(q.text)}</span><div class="pinyin">${esc(q.textPy || '')}</div></div>`;
        else if (q.type === 'input') prompt = `<div class="hanzi sent-q" style="font-size:24px">${esc(q.text)}</div><div class="pinyin" style="margin-top:6px">（${esc(q.py)}）</div>`;
        else if (q.type === 'arrange') prompt = `<div class="hint" style="text-align:center;margin:0">Составьте предложение</div>`;
        else prompt = `<div class="hanzi sent-q" style="font-size:${q.text && q.text.length > 26 ? 20 : 26}px">${esc(q.text)}</div>${q.sub ? `<div class="ru" style="margin-top:8px;font-weight:600">${esc(q.sub)}</div>` : ''}`;
        let answerUi = '';
        if (q.type === 'tf') answerUi = `${q.pic ? picImg(q.pic) : ''}${q.star ? `<div class="ex-star">★ ${esc(q.star)}</div>` : ''}<div class="btns row2 mt"><button class="btn btn-jade ex-opt" data-action="exam-answer" data-idx="0" data-nosound>对 · верно</button><button class="btn btn-danger ex-opt" data-action="exam-answer" data-idx="1" data-nosound>错 · неверно</button></div>`;
        else if (q.type === 'pickpic') answerUi = `<div class="ex-pics">${q.pics.map((p, i) => `<button class="ex-picbtn" data-action="exam-answer" data-idx="${i}" data-nosound><span class="ex-letter">${'ABC'[i]}</span>${picImg(p)}</button>`).join('')}</div>`;
        else if (q.type === 'opts') answerUi = `<div class="opts">${q.opts.map((o, i) => `<button class="opt opt-txt" data-action="exam-answer" data-idx="${i}" data-nosound><span class="opt-hanzi">${esc(o)}</span></button>`).join('')}</div>`;
        else if (q.type === 'arrange') {
          const sel = q.sel || [];
          answerUi = `<div class="arr-line panel" style="margin-bottom:10px">${sel.length ? sel.map((ci, i) => `<button class="chip on" data-action="arr-del" data-i="${i}" data-nosound>${esc(q.chunks[ci])}</button>`).join('') : '<span class="hint">Нажимайте слова по порядку</span>'}</div>
          <div class="chips">${q.chunks.map((c, i) => sel.includes(i) ? '' : `<button class="chip" data-action="arr-add" data-i="${i}" data-nosound>${esc(c)}</button>`).join('')}</div>
          <button class="btn btn-primary btn-block mt" data-action="arr-ok" ${sel.length === q.chunks.length ? '' : 'disabled'}>Готово</button>`;
        }
        else if (q.type === 'input') {
          answerUi = `<form id="ex-inputs" class="inputs" autocomplete="off"><div class="field"><label>Иероглиф <span class="muted">· пиньинь: ${esc(q.py)} · клавиатура 中文</span></label><input class="inp" name="answer" lang="zh-CN" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="汉字"></div><button class="btn btn-primary btn-block" type="submit">Готово</button></form>`;
        }
        return head + `<div class="panel ornate qcard" style="min-height:auto">${prompt}</div>` + answerUi;
      }
      return '';
    },
    mount() {
      if (!ex || ex.phase !== 'q') return;
      const q = ex.qs[ex.i];
      if (q.block) { runBlock(); return; }
      runQuestion();
      const f = $('#ex-inputs');
      if (f) f.addEventListener('submit', e => {
        e.preventDefault();
        if (!ex || q.ok != null) return;
        const val = Quiz.normZh(f.elements.answer.value);
        if (!val) { toast('Введите иероглиф'); return; }
        stopTimers();
        q.given = val; q.ok = val === q.answer; q.ms = Date.now() - ex.qStart;
        Sound.click();
        advance();
      });
    },
  };

  /* ── Блок сопоставления: все вопросы части на одном экране ── */
  function renderBlock(q) {
    const { start, items } = blockOf(q);
    const total = ex.qs.length;
    const isL = q.sec === 'listening';
    const head = `<div class="qbar"><button class="icon-btn" data-action="exam-quit">✕</button><div class="progress"><i style="width:${start / total * 100}%"></i></div><div class="qcount">${start + 1}–${start + items.length}/${total}</div><div class="qtimer" id="extimer">·</div></div>`;
    const rows = items.map((it, k) => `<button class="blk-row${k === ex.active ? ' on' : ''}${it.tmpSel != null ? ' done' : ''}" data-action="blk-row" data-i="${k}" data-nosound><span class="blk-num">${start + k + 1}</span><span class="blk-txt">${isL ? `Диалог ${k + 1} <span class="blk-spk">🔊</span>` : esc(it.text)}</span><span class="blk-badge">${it.tmpSel != null ? LET[it.tmpSel] : '·'}</span></button>`).join('');
    const usedBy = {};
    items.forEach((it, k) => { if (it.tmpSel != null) usedBy[it.tmpSel] = start + k + 1; });
    let poolUi;
    if (q.type === 'poolpic') poolUi = `<div class="ex-pics pool6">${q.pool.map((p, i) => `<button class="ex-picbtn${usedBy[i] != null ? ' used' : ''}" data-action="blk-opt" data-i="${i}" data-nosound><span class="ex-letter">${LET[i]}</span>${usedBy[i] != null ? `<span class="blk-tag">→ ${usedBy[i]}</span>` : ''}${picImg(p)}</button>`).join('')}</div>`;
    else poolUi = `<div class="opts">${q.pool.map((o, i) => `<button class="opt opt-txt${usedBy[i] != null ? ' used' : ''}" data-action="blk-opt" data-i="${i}" data-nosound><span class="ex-letter">${LET[i]}</span><span class="opt-hanzi">${esc(o)}</span>${usedBy[i] != null ? `<span class="blk-tag">→ ${usedBy[i]}</span>` : ''}</button>`).join('')}</div>`;
    const full = items.every(it => it.tmpSel != null);
    return head
      + (isL ? '<div class="hint" style="text-align:center;margin:0 0 8px">Диалоги звучат по очереди, каждый два раза</div>' : '')
      + `<div class="blk-rows">${rows}</div>` + poolUi
      + `<div class="hint" style="text-align:center;margin:8px 0 6px">Менять ответы можно до кнопки «Готово»</div>
      <button class="btn btn-primary btn-block" data-action="blk-ok" ${full ? '' : 'disabled'}>Готово</button>`;
  }
  actions['blk-row'] = el => { if (!ex || ex.phase !== 'q') return; ex.active = +el.dataset.i; render(); };
  actions['blk-opt'] = el => {
    if (!ex || ex.phase !== 'q') return;
    const q = ex.qs[ex.i];
    if (!q.block) return;
    const { items } = blockOf(q);
    const idx = +el.dataset.i;
    const cur = items[ex.active];
    if (!cur || cur.ok != null) return;
    if (cur.tmpSel === idx) cur.tmpSel = null; /* повторный тап — снять */
    else {
      for (const it of items) if (it.tmpSel === idx) it.tmpSel = null; /* буква — только одной строке */
      cur.tmpSel = idx;
      let nxt = items.findIndex((it, k) => it.tmpSel == null && k > ex.active);
      if (nxt < 0) nxt = items.findIndex(it => it.tmpSel == null);
      if (nxt >= 0) ex.active = nxt;
    }
    Sound.click();
    render();
  };
  actions['blk-ok'] = () => commitBlock(false);
  function commitBlock(force) {
    if (!ex || ex.phase !== 'q') return;
    const q = ex.qs[ex.i];
    if (!q.block) return;
    const { end, items } = blockOf(q);
    if (!force && !items.every(it => it.tmpSel != null)) return;
    stopTimers();
    for (const it of items) {
      if (it.ok != null) continue;
      const val = it.tmpSel != null ? it.pool[it.tmpSel] : null;
      it.given = val; it.ok = val === it.answer; it.ms = Date.now() - ex.qStart;
    }
    ex.i = end;
    if (force) toast('Время вышло');
    Sound.click();
    advance();
  }
  function markSpeaking(k, on) { document.querySelectorAll('.blk-row').forEach((el, i) => el.classList.toggle('speaking', on && i === k)); }
  async function playBlock(items, run) {
    for (let k = 0; k < items.length; k++) {
      if (!ex || ex.audioRun !== run) return;
      markSpeaking(k, true);
      const texts = Array.isArray(items[k].say) ? items[k].say : [items[k].say];
      for (let r = 0; r < 2; r++) {
        for (const t of texts) {
          if (!ex || ex.audioRun !== run) { markSpeaking(k, false); return; }
          await Speech.speak(t);
          await pause(400);
        }
        if (r === 0) await pause(1200);
      }
      markSpeaking(k, false);
      await pause(800);
    }
  }
  function runBlock() {
    const q = ex.qs[ex.i];
    const { start, items } = blockOf(q);
    if (ex.qRunFor === start) return;
    ex.qRunFor = start;
    ex.qStart = Date.now();
    ex.active = Math.max(0, items.findIndex(it => it.tmpSel == null));
    if (q.sec === 'listening') {
      ex.audioRun++;
      const run = ex.audioRun;
      const est = items.reduce((s, it) => s + ((Array.isArray(it.say) ? it.say.length : 1) * 7 + 8) * 2 + ex.spec.answerSec, 0);
      const deadline = Date.now() + est * 1000;
      playBlock(items, run);
      ex.answerTimer = setInterval(() => {
        const left = Math.ceil((deadline - Date.now()) / 1000);
        const tm = $('#extimer');
        if (tm) tm.textContent = left > 60 ? Math.ceil(left / 60) + ' мин' : left;
        if (left <= 0) commitBlock(true);
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

  /* ── Одиночные вопросы ── */
  async function playAudio(q, run) {
    const texts = Array.isArray(q.say) ? q.say : [q.say];
    for (let r = 0; r < 2; r++) {
      if (!ex || ex.qs[ex.i] !== q || ex.audioRun !== run) return;
      const ico = $('#say-ico'); if (ico) ico.classList.add('talking');
      for (const t of texts) {
        if (!ex || ex.audioRun !== run) return;
        await Speech.speak(t);
        await pause(500);
      }
      if (ico) ico.classList.remove('talking');
      if (r === 0) await pause(1400);
    }
  }
  function runQuestion() {
    const q = ex.qs[ex.i];
    if (ex.qRunFor === ex.i) return;
    ex.qRunFor = ex.i;
    ex.qStart = Date.now();
    if (q.sec === 'listening') {
      ex.audioRun++;
      const run = ex.audioRun;
      const deadline = Date.now() + 1000 * (ex.spec.answerSec + (Array.isArray(q.say) ? 8 + q.say.length * 7 : 8));
      playAudio(q, run);
      ex.answerTimer = setInterval(() => {
        const left = Math.ceil((deadline - Date.now()) / 1000);
        const tm = $('#extimer');
        if (tm) tm.textContent = left;
        if (left <= 0) answer(q, -1, true);
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
  /* Время секции вышло: отмеченное в блоках засчитываем, остальное — мимо */
  function expireSection(sec) {
    stopTimers();
    toast('Время секции вышло');
    let last = ex.i;
    for (let i = ex.i; i < ex.qs.length; i++) {
      const q = ex.qs[i];
      if (q.sec !== sec) continue;
      if (q.ok == null) {
        if (q.tmpSel != null && q.pool) { q.given = q.pool[q.tmpSel]; q.ok = q.given === q.answer; }
        else { q.ok = false; q.given = null; }
      }
      last = i;
    }
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
    if (!next) return finishExam();
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
      $('#ec', s).onclick = () => { closeSheet(); if (ex.phase === 'q') App.render(); };
    });
  };

  /* ── Итог: балл, разбор по этапам, все ошибки ── */
  const promptOf = q => {
    if (q.type === 'arrange') return 'Собрать: ' + q.chunks.join(' · ');
    if (q.type === 'input') return q.text + '（' + q.py + '）';
    let p = Array.isArray(q.say) ? q.say.join(' — ') : (q.say || q.text || '');
    if (q.star) p += ' ★ ' + q.star;
    if (q.sub) p += ' — ' + q.sub;
    return p;
  };
  const correctTextOf = q => {
    if (q.type === 'pool') return q.answer;
    if (q.type === 'poolpic') return LET[q.pool.indexOf(q.answer)] + ' · ' + picWord(q.answer);
    if (q.type === 'opts') return q.opts[q.correct];
    if (q.type === 'pickpic') return 'ABC'[q.correct] + ' · ' + picWord(q.pics[q.correct]);
    if (q.type === 'arrange') return q.answers[0];
    if (q.type === 'input') return q.answer;
    return q.correct === 0 ? '对' : '错';
  };
  const givenTextOf = q => {
    if (q.given == null) return '—';
    if (q.type === 'pool' || q.type === 'arrange' || q.type === 'input') return q.given;
    if (q.type === 'poolpic') return LET[q.pool.indexOf(q.given)] + ' · ' + picWord(q.given);
    if (q.type === 'opts') return q.opts[q.givenIdx] != null ? q.opts[q.givenIdx] : q.given;
    if (q.type === 'pickpic') return 'ABC'[q.givenIdx] + ' · ' + picWord(q.pics[q.givenIdx]);
    return q.givenIdx === 0 ? '对' : '错';
  };
  /* снимок вопроса для разбора: что звучало, что было написано, какие были картинки и варианты, что выбрали */
  const SNAP_KEYS = ['say', 'text', 'textPy', 'sub', 'star', 'pic', 'pics', 'pool', 'opts', 'chunks', 'py', 'correct', 'answer', 'answers', 'given', 'givenIdx'];
  function snapOf(q) { const s = { type: q.type }; for (const k of SNAP_KEYS) if (q[k] != null) s[k] = q[k]; return s; }
  function buildAttempt(qs, level, spec, startedAt) {
    for (const q of qs) if (q.ok == null) { q.ok = false; q.given = null; }
    const res = HskReal.score(qs, spec);
    const a = {
      id: uid(), ts: startedAt, endedAt: Date.now(), durationMs: Date.now() - startedAt,
      mode: 'hsk', format: 'real', level, difficulty: 'exam',
      deckIds: ['hsk' + level], deckName: 'Экзамен HSK ' + level, show: 'exam', guess: ['all'], order: 'random', timer: 0,
      total: qs.length, planned: qs.length, aborted: false,
      correct: qs.filter(q => q.ok).length, partial: 0, wrong: qs.filter(q => !q.ok).length,
      percent: Math.round(qs.filter(q => q.ok).length / qs.length * 100),
      score: res.score, examMax: spec.max, passed: res.passed, sections: res.sections,
      questions: qs.map(q => ({ cardId: 'ex' + level + ':' + q.sec + q.part, sec: q.sec, part: q.part, hanzi: promptOf(q), pinyin: '', co: correctTextOf(q), ru: 'Верно: ' + correctTextOf(q), show: q.sec, guess: [String(q.part)], answer: { given: givenTextOf(q) }, parts: {}, fraction: q.ok ? 1 : 0, ok: q.ok, ms: q.ms || 0, ex: snapOf(q) })),
    };
    a.points = Campaign.attemptPoints(a);
    return a;
  }
  App.examAttempt = buildAttempt;
  function finishExam() {
    stopTimers();
    const a = buildAttempt(ex.qs, ex.level, ex.spec, ex.startedAt);
    ex = null;
    saveAttempt(a).then(() => { Sound.finish(a.passed); nav('exam-result', { id: a.id }, { replace: true }); });
  }
  views['exam-result'] = {
    render(p) {
      const a = state.attempts.find(x => x.id === p.id);
      if (!a || !a.sections) return '<div class="empty">Результат не найден</div>';
      const stamp = `<div class="stamp ${a.passed ? 'pass' : 'fail'}">${a.passed ? '合格' : '不合格'}<small>${a.passed ? 'сдан' : 'не сдан'}</small></div>`;
      const lvl = a.level || 1;
      const secRow = (id, zh, ru) => { const s = a.sections[id]; return `<div class="fb-row res-sec"><span class="fb-p">${zh} ${ru}</span><span class="fb-a">${s.correct} из ${s.total}</span><span class="fb-v"><b>${s.points}</b> / 100</span></div>`; };
      let stagesUi = '', errsUi = '';
      if (a.questions && a.questions.length && a.questions[0].sec) {
        const sts = [];
        a.questions.forEach(qq => {
          const k = qq.sec + '-' + qq.part;
          let st = sts.find(x => x.k === k);
          if (!st) { st = { k, sec: qq.sec, part: qq.part, ok: 0, n: 0, errs: [] }; sts.push(st); }
          st.n++;
          if (qq.ok) st.ok++; else st.errs.push(qq);
        });
        stagesUi = `<div class="panel"><div class="flabel">По этапам</div>${sts.map((st, i) => `<div class="fb-row"><span class="fb-p">${i + 1} · ${SEC[st.sec][0]} ${SEC[st.sec][1]} ч.${st.part}</span><span class="fb-v" style="color:${st.ok === st.n ? 'var(--jade)' : st.ok === 0 ? 'var(--danger)' : 'var(--ink)'}"><b>${st.ok}</b> из ${st.n}</span></div>`).join('')}</div>`;
        const bad = sts.filter(st => st.errs.length);
        if (bad.length) errsUi = `<div class="panel"><div class="flabel">Разбор ошибок</div>${bad.map(st => `<div class="err-stage">Этап ${sts.indexOf(st) + 1} · ${SEC[st.sec][1]} · часть ${st.part}</div>${st.errs.map(qq => `<button class="err-item tap" data-action="q-review" data-id="${esc(a.id)}" data-i="${a.questions.indexOf(qq)}" data-nosound><div class="err-q">${esc(qq.hanzi)}</div><div class="err-a"><span class="ok-t">верно: ${esc(qq.co || '')}</span><span class="bad-t">ваш ответ: ${esc((qq.answer && qq.answer.given) || '—')}</span><span class="chev">›</span></div></button>`).join('')}`).join('')}</div>`;
      }
      return `<div class="vh"><div class="seal">考</div><div class="grow"><h1 class="title">Экзамен HSK ${a.level}</h1><div class="sub">настоящий формат · ${fmt.dur(a.durationMs)}</div></div></div>
      <div class="panel ornate result-top has-stamp"><div class="res-meta"><div class="big-score">${a.score}<small> из ${a.examMax} · порог ${Math.round(a.examMax * 0.6)}</small></div>${Object.keys(a.sections).map(k => secRow(k, SEC[k][0], SEC[k][1])).join('')}</div>${stamp}</div>
      ${stagesUi}
      ${App.Profile.resultPanel(a, null)}
      ${errsUi}
      <div class="btns"><button class="btn btn-primary btn-block" data-action="hsk-real" data-level="${lvl}">Ещё вариант</button><button class="btn btn-secondary btn-block" data-go="attempt" data-params="${attr({ id: a.id })}">Разбор ответов</button><button class="btn btn-secondary btn-block" data-go="hsk">К HSK</button></div>`;
    },
  };
})();
