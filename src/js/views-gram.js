/* Грамматика блока: страница правила и лестница заданий к нему.
   Правило перестаёт быть текстом, который можно только прочитать: у блока есть задания
   четырёх форматов (выбор, поиск ошибки, ввод, сборка), и вердикт выносит только
   GRAMMAR.check — здесь нет ни своей проверки ответа, ни своего кэша.
   Экран принадлежит тестовой методике: в текущей книге учёта он показывает, где его включить. */
window.GramUI = (() => {
  const { state, views, actions, nav, esc, attr, uid, $, toast, confirm, render, saveAttempt, fmt, LABELS } = App;
  /* Журнал и разбор попытки берут название режима отсюда: без записи там стояло бы латинское «gram» */
  if (LABELS && LABELS.mode && !LABELS.mode.gram) LABELS.mode.gram = 'Грамматика';

  let run = null;    /* заход: { blockId, qs, i, sel, startedAt, qAt, right, wrong } */
  let last = null;   /* результат последнего захода — для экрана разбора */

  const v2 = () => !!(window.Ledger && Ledger.is2(state));
  const blockOf = id => (window.PROGRAM && id ? PROGRAM.byId(id) : null);
  const items = id => (window.GRAMMAR && id ? GRAMMAR.forBlock(id) : []);
  const hasItems = id => items(id).length > 0;
  const say = s => { if (window.Speech) Speech.say(s); };

  const FORMAT_RU = { choice: 'выбор', fix: 'найти ошибку', fill: 'вписать', order: 'собрать' };
  const PROMPT = {
    choice: 'Что встанет на место пропуска?',
    fill: 'Впишите пропущенное слово',
    fix: 'Одно слово здесь лишнее или стоит не на месте — нажмите на него',
    'fix-free': 'В этой фразе ошибка — перепишите её правильно',
    order: 'Соберите фразу из кусков',
  };
  /* fix бывает двух видов: ткнуть в слово (есть tokens) или переписать фразу целиком */
  const fixFree = it => it && it.format === 'fix' && !Array.isArray(it.tokens);

  /* ── общие куски разметки ── */
  const sayLine = (zh, cls = '') => `<button class="gr-say ${cls}" data-action="gram-say" data-s="${esc(zh)}" data-nosound><span class="gr-h">${esc(zh)}</span><span class="gr-ico">🔊</span></button>`;

  const inputForm = (label, ph) => `<form id="gr-form" class="inputs" autocomplete="off"><div class="field"><label>${esc(label)} <span class="muted">· клавиатура 中文</span></label>
    <input class="inp" name="answer" lang="zh-CN" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="${esc(ph)}"></div>
    <button class="btn btn-primary btn-block" type="submit">Готово</button></form>`;
  const givenLine = q => `<div class="gr-given">Вы написали: <b class="${q.ok ? 'ok' : 'bad'}">${esc(String(q.given == null ? '' : q.given))}</b></div>`;

  function stemHtml(it, filled) {
    const s = String(it.stem || '');
    if (!/_+/.test(s)) return `<div class="gr-stem gr-h">${esc(s)}</div>`;
    const parts = s.split(/_+/);
    const gap = filled ? `<b class="gr-gap full">${esc(filled)}</b>` : '<b class="gr-gap">▢</b>';
    return `<div class="gr-stem gr-h">${esc(parts[0])}${gap}${esc(parts.slice(1).join(''))}</div>`;
  }

  /* Панель для текущей методики: экран открыт, но проверять правила она не умеет */
  function stub(title) {
    return `<div class="vh"><button class="icon-btn" data-back>‹</button><div class="grow"><h1 class="title">${esc(title || 'Правило блока')}</h1><div class="sub">语法 · грамматика блока</div></div></div>
    <div class="panel"><div class="flabel">Это часть тестовой методики</div>
      <div class="hint" style="margin:0">Задания по грамматике считаются только в тестовой книге учёта. Её можно включить в настройках — текущая книга при этом сохранится и продолжит пополняться.</div>
      <div class="btns mt0"><button class="btn btn-primary btn-block" data-go="settings">В настройки</button></div></div>`;
  }

  /* ── экран правила ── */
  views.gram = {
    render(p) {
      const b = blockOf(p && p.id);
      if (!b || !b.g) return '<div class="empty">Блок не найден</div>';
      if (!v2()) return stub(b.g.t);
      const list = items(b.id);
      /* контраст с русским берём из заданий блока: одна и та же мысль повторяется в l1 */
      const l1 = [];
      for (const it of list) if (it.l1 && l1.indexOf(it.l1) < 0) l1.push(it.l1);
      const ex = (b.g.ex || []).map(e => `<button class="row tap gr-ex" data-action="gram-say" data-s="${esc(e[0])}" data-nosound>
        <div><div class="hanzi sm">${esc(e[0])}</div><div class="pinyin sm">${esc(e[1])}</div><div class="ru sm">${esc(e[2])}</div></div>
        <div class="row-r"><span class="gr-ico">🔊</span></div></button>`).join('');
      return `<div class="vh"><button class="icon-btn" data-back>‹</button><div class="grow"><h1 class="title">${esc(b.g.t)}</h1><div class="sub"><span class="zh">${esc(b.zh)}</span> · ${esc(b.ru)}</div></div></div>
      <div class="panel ornate"><div class="flabel">Правило</div><p class="gr-d">${esc(b.g.d)}</p></div>
      ${ex ? `<div class="panel"><div class="flabel">Примеры · нажмите, чтобы послушать</div>${ex}</div>` : ''}
      ${l1.length ? `<div class="panel"><div class="flabel">Не так, как в русском</div>${l1.slice(0, 2).map(t => `<p class="gr-l1">${esc(t)}</p>`).join('')}</div>` : ''}
      ${list.length
        ? `<div class="panel"><div class="hint" style="margin:0 0 8px">${fmt.plural(list.length, 'задание', 'задания', 'заданий')} по этому правилу: сначала выбор, потом поиск ошибки, ввод и сборка фразы.</div>
           <button class="btn btn-primary btn-block" data-action="gram-start" data-id="${esc(b.id)}">Проверить себя 检验</button></div>`
        : '<div class="panel"><div class="hint" style="margin:0">Заданий по этому правилу пока нет — банк заполняется по уровням.</div></div>'}`;
    },
  };
  actions['gram-say'] = el => say(el.dataset.s);

  /* ── заход ── */
  function build(b) {
    const pool = items(b.id);
    const n = Math.min(9, pool.length);
    const qs = GRAMMAR.pick(b.id, n).map(it => ({ it, ok: null, fraction: 0, ms: 0, given: null, res: null }));
    return { blockId: b.id, qs, i: 0, sel: [], startedAt: Date.now(), qAt: Date.now(), right: 0, wrong: 0 };
  }
  actions['gram-start'] = el => {
    const b = blockOf(el.dataset.id);
    if (!b || !v2()) return;
    if (!hasItems(b.id)) return toast('Заданий по этому правилу пока нет');
    run = build(b);
    if (!run.qs.length) { run = null; return toast('Заданий по этому правилу пока нет'); }
    nav('gram-run', { id: b.id });
  };

  /* Вердикт выносит только движок */
  function answer(given) {
    if (!run) return;
    const q = run.qs[run.i];
    if (!q || q.ok != null) return;
    const res = GRAMMAR.check(q.it, given);
    q.res = res;
    q.ok = !!res.ok;
    q.fraction = typeof res.fraction === 'number' && isFinite(res.fraction) ? res.fraction : (res.ok ? 1 : 0);
    q.given = given;
    q.ms = Math.max(0, Date.now() - run.qAt);
    if (q.ok) { run.right++; if (window.Sound) Sound.ok(); } else { run.wrong++; if (window.Sound) Sound.fail(); }
    render();
  }
  actions['gram-pick'] = el => { const q = run && run.qs[run.i]; if (q) answer((q.it.options || [])[+el.dataset.i]); };
  actions['gram-tok'] = el => answer(+el.dataset.i);
  actions['gram-chip'] = el => { if (!run) return; const i = +el.dataset.i; if (run.sel.indexOf(i) < 0) run.sel.push(i); render(); };
  actions['gram-unchip'] = el => { if (!run) return; run.sel.splice(+el.dataset.pos, 1); render(); };
  actions['gram-order'] = () => { const q = run && run.qs[run.i]; if (q && q.ok == null) answer(run.sel.slice()); };
  actions['gram-next'] = () => {
    if (!run) return;
    run.i++;
    run.sel = [];
    if (run.i >= run.qs.length) return finish();
    run.qAt = Date.now();
    render();
  };
  actions['gram-quit'] = async () => {
    if (!run) return;
    const id = run.blockId;
    const ok = await confirm('Бросить проверку? Ответы этого захода не сохранятся, очков за него не будет.', { ok: 'Бросить', danger: true, title: 'Проверка правила' });
    if (!ok || !run) return;
    run = null;
    nav('gram', { id }, { replace: true });
  };
  actions['gram-again'] = el => {
    const b = blockOf(el.dataset.id);
    if (!b) return;
    run = build(b);
    if (!run.qs.length) { run = null; return toast('Заданий по этому правилу пока нет'); }
    nav('gram-run', { id: b.id }, { replace: true });
  };

  /* Попытка пишется через App.saveAttempt — обе книги учёта пополняются сами */
  function finish() {
    const b = blockOf(run.blockId);
    const done = run.qs.filter(q => q.ok != null);
    const total = done.length;
    if (!total || !b) { run = null; return nav('gram', { id: b ? b.id : '' }, { replace: true }); }
    const correct = done.filter(q => q.ok).length;
    const partial = done.filter(q => !q.ok && q.fraction > 0).length;
    const wrong = total - correct - partial;
    const percent = Math.round(correct / total * 100);
    const a = {
      id: uid(), ts: run.startedAt, endedAt: Date.now(), durationMs: Date.now() - run.startedAt,
      mode: 'gram', difficulty: 'gram', blockId: b.id, block: b.id, level: b.lvl,
      deckIds: [], deckName: b.g.t, show: 'sentence', guess: ['answer'], order: 'ladder', timer: 0,
      total, planned: run.qs.length, aborted: false, correct, partial, wrong, percent,
      questions: done.map(q => ({
        hanzi: q.it.stem, ok: q.ok, fraction: q.fraction, ms: q.ms,
        show: 'sentence', guess: ['answer'],
        answer: answerOf(q), itemId: q.it.id, format: q.it.format, diff: q.it.diff,
        trap: (q.res && q.res.trap) || null,
      })),
    };
    last = { blockId: b.id, title: b.g.t, total, correct, partial, wrong, percent, points: null, qs: done.slice() };
    run = null;
    saveAttempt(a).then(r => {
      last.points = r && r.points != null ? r.points : a.points;
      if (window.Sound) Sound.finish(percent === 100);
      nav('gram-result', { id: b.id }, { replace: true });
    }).catch(() => {
      last.points = null;
      toast('Попытка не записалась — итог показан, очки появятся после перезапуска', 3500);
      nav('gram-result', { id: b.id }, { replace: true });
    });
  }
  /* Что именно ответил ученик — в том же виде, что у квиза: выбор, ввод или сборка */
  function answerOf(q) {
    const it = q.it, g = q.given;
    if (it.format === 'choice') {
      const i = (it.options || []).indexOf(g);
      return { choice: i, choiceText: g && g.text ? g.text : '' };
    }
    if (it.format === 'fix') {
      if (fixFree(it)) return { input: { answer: String(g == null ? '' : g) } };
      return { choice: g, choiceText: (it.tokens || [])[g] || '' };
    }
    if (it.format === 'fill') return { input: { answer: String(g == null ? '' : g) } };
    const pieces = (g || []).map(i => (it.tokens || [])[i] || '');
    return { given: pieces, input: { answer: pieces.join('') } };
  }

  /* ── разбор ответа ── */
  /* Привычку называет сам движок (trapWhy); каталог TRAPS — запасной источник */
  function trapOf(res) {
    if (!res || !res.trap) return null;
    if (res.trapWhy) return { ru: res.trapWhy };
    if (!window.TRAPS || !TRAPS.explain) return null;
    try { return TRAPS.explain(res.trap); } catch (e) { return null; }
  }
  function feedback(q, lastQ) {
    const it = q.it, res = q.res || {};
    const tr = trapOf(res);
    const verdict = q.ok ? 'Верно' : (q.fraction > 0 ? 'Почти: куски те, порядок не тот' : 'Неверно');
    return `<div class="panel gr-fb ${q.ok ? 'ok' : 'bad'}">
      <div class="gr-verdict">${verdict}</div>
      ${tr ? `<div class="gr-trap"><b>Привычка:</b> ${esc(tr.ru || '')}${tr.rule ? ' — ' + esc(tr.rule) : ''}${tr.contrast ? ' ' + esc(tr.contrast) : ''}</div>` : ''}
      <div class="gr-why"><b>Правило.</b> ${esc(it.why || '')}</div>
      ${it.l1 ? `<div class="gr-l1"><b>Не так, как в русском.</b> ${esc(it.l1)}</div>` : ''}
      ${it.tts ? `<div class="flabel gr-flab">Верно так</div>${sayLine(it.tts)}` : ''}
      <button class="btn btn-primary btn-block mt" data-action="gram-next">${lastQ ? 'Итог' : 'Дальше ›'}</button></div>`;
  }

  /* ── экран заданий ── */
  views['gram-run'] = {
    render(p) {
      if (!v2()) return stub('Проверка правила');
      if (!run) return `<div class="vh"><button class="icon-btn" data-back>‹</button><div class="grow"><h1 class="title">Проверка правила</h1><div class="sub">语法</div></div></div>
        <div class="panel"><div class="hint" style="margin:0">Заход не запущен.</div><div class="btns mt0"><button class="btn btn-primary btn-block" data-go="gram" data-params="${attr({ id: (p && p.id) || '' })}">К правилу</button></div></div>`;
      const q = run.qs[run.i];
      if (!q) return '<div class="empty">Задание не найдено</div>';
      const it = q.it;
      const answered = q.ok != null;
      const head = `<div class="qbar"><button class="icon-btn" data-action="gram-quit">✕</button><div class="progress"><i style="width:${Math.round(run.i / run.qs.length * 100)}%"></i></div><div class="qcount">${run.i + 1}/${run.qs.length}</div><span class="badge">${FORMAT_RU[it.format] || it.format}</span></div>`;
      let card = '', ui = '';

      if (it.format === 'choice') {
        const givenText = answered && q.given && q.given.text ? q.given.text : '';
        card = stemHtml(it, answered ? (q.ok ? givenText : ((q.res && q.res.correct) || '')) : '');
        ui = `<div class="opts">${(it.options || []).map((o, i) => {
          let cls = 'opt gr-opt';
          if (answered) {
            const isKey = GRAMMAR.check(it, o).ok;
            if (isKey) cls += ' correct';
            else if (q.given === o) cls += ' wrong';
          }
          return `<button class="${cls}" data-action="gram-pick" data-i="${i}" data-nosound ${answered ? 'disabled' : ''}><span class="opt-hanzi">${esc(o.text)}</span></button>`;
        }).join('')}</div>`;
      } else if (it.format === 'fill') {
        card = stemHtml(it, answered ? String(q.given == null ? '' : q.given) : '');
        ui = answered ? '' : inputForm('Впишите пропущенное', '汉字');
      } else if (fixFree(it)) {
        card = `<div class="gr-stem gr-h">${esc(it.stem)}</div>` + (answered ? givenLine(q) : '');
        ui = answered ? '' : inputForm('Перепишите фразу без ошибки', '正确的句子');
      } else if (it.format === 'fix') {
        const keyIdx = (it.tokens || []).map((t, i) => i).filter(i => GRAMMAR.check(it, i).ok);
        card = `<div class="gr-toks">${(it.tokens || []).map((t, i) => {
          let cls = 'gr-tok';
          if (answered) {
            if (keyIdx.indexOf(i) >= 0) cls += ' key';
            else if (q.given === i) cls += ' bad';
          }
          return `<button class="${cls}" data-action="gram-tok" data-i="${i}" data-nosound ${answered ? 'disabled' : ''}>${esc(t)}</button>`;
        }).join('')}</div>`;
      } else if (it.format === 'order') {
        const toks = it.tokens || [];
        const line = run.sel.length
          ? run.sel.map((i, pos) => `<button class="gr-tok sel" data-action="gram-unchip" data-pos="${pos}" data-nosound ${answered ? 'disabled' : ''}>${esc(toks[i])}</button>`).join('')
          : '<span class="muted">нажимайте на куски по порядку</span>';
        card = `<div class="gr-task">${esc(it.stem)}</div><div class="gr-line">${line}</div>`;
        ui = answered ? '' : `<div class="chips gr-chips">${toks.map((t, i) => `<button class="chip gr-chip ${run.sel.indexOf(i) >= 0 ? 'used' : ''}" data-action="gram-chip" data-i="${i}" data-nosound ${run.sel.indexOf(i) >= 0 ? 'disabled' : ''}>${esc(t)}</button>`).join('')}</div>
          <button class="btn btn-primary btn-block" data-action="gram-order" ${run.sel.length === toks.length && toks.length ? '' : 'disabled'}>Готово</button>`;
      }

      return head + `<div class="panel ornate gr-card">${it.format === 'order' ? '' : `<div class="gr-prompt">${PROMPT[fixFree(it) ? 'fix-free' : it.format] || ''}</div>`}${card}</div>`
        + ui + (answered ? feedback(q, run.i === run.qs.length - 1) : '');
    },
    mount() {
      if (!run) return;
      const q = run.qs[run.i];
      if (!q || q.ok != null) return;
      const f = $('#gr-form');
      if (f) f.addEventListener('submit', e => {
        e.preventDefault();
        const v = String(f.elements.answer.value || '').trim();
        if (!v) return toast('Впишите ответ');
        answer(v);
      });
    },
  };

  /* ── итог ── */
  views['gram-result'] = {
    render(p) {
      if (!v2()) return stub('Итог проверки');
      const r = last;
      if (!r) return `<div class="vh"><button class="icon-btn" data-back>‹</button><div class="grow"><h1 class="title">Итог проверки</h1><div class="sub">语法</div></div></div>
        <div class="panel"><div class="hint" style="margin:0">Результат не найден — он живёт только до перезапуска приложения.</div>
        <div class="btns mt0"><button class="btn btn-primary btn-block" data-go="gram" data-params="${attr({ id: (p && p.id) || '' })}">К правилу</button></div></div>`;
      const bad = r.qs.filter(q => !q.ok);
      const rows = bad.map(q => `<div class="gr-res-row">
        <div class="fb-row"><span class="fb-p">${FORMAT_RU[q.it.format] || q.it.format}</span><span class="fb-a wrong">${esc(answerText(q))}</span><span class="fb-v">${q.fraction > 0 ? 'почти' : 'мимо'}</span></div>
        ${q.it.tts ? sayLine(q.it.tts) : ''}
        <div class="gr-why">${esc(q.it.why || '')}</div>
        ${q.it.l1 ? `<div class="gr-l1">${esc(q.it.l1)}</div>` : ''}</div>`).join('');
      return `<div class="vh"><div class="seal">语</div><div class="grow"><h1 class="title">${esc(r.title)}</h1><div class="sub">верно ${r.correct} из ${r.total}${r.partial ? ' · почти ' + r.partial : ''}</div></div></div>
      <div class="panel ornate gr-total"><div class="grow"><b>${r.correct === r.total ? 'Правило держится' : r.percent >= 60 ? 'Правило почти собрано' : 'Правило пока не держится'}</b>
        <div class="hint" style="margin:4px 0 0">${r.correct === r.total ? 'Все задания блока взяты без ошибок.' : `Ошибок ${r.wrong + r.partial} — разбор ниже. Задания в следующем заходе будут другими.`}</div></div>
        <div class="big-score">${r.percent}%${r.points != null ? `<small>+${r.points} очк.</small>` : ''}</div></div>
      ${bad.length ? `<div class="panel"><div class="flabel">Разбор ошибок</div>${rows}</div>` : ''}
      <div class="btns"><button class="btn btn-primary btn-block" data-action="gram-again" data-id="${esc(r.blockId)}">Ещё раз</button>
        <button class="btn btn-secondary btn-block" data-go="gram" data-params="${attr({ id: r.blockId })}">К блоку</button></div>`;
    },
  };
  /* Что ученик ответил — одной строкой для разбора */
  function answerText(q) {
    const a = answerOf(q);
    if (a.choiceText) return a.choiceText;
    if (a.input && a.input.answer) return a.input.answer;
    return '—';
  }

  /* ── строка для экрана блока программы (вставляет views-program) ── */
  function blockRow(blockId) {
    const b = blockOf(blockId);
    if (!b || !b.g || !v2()) return '';
    const n = items(b.id).length;
    return `<div class="panel gr-row"><div class="grow"><b>Правило: ${esc(b.g.t)}</b>
      <div class="hint" style="margin:2px 0 0">${n ? fmt.plural(n, 'задание', 'задания', 'заданий') + ' на проверку' : 'заданий по нему пока нет'}</div></div>
      <button class="btn btn-secondary btn-sm" data-go="gram" data-params="${attr({ id: b.id })}">${n ? 'Разобрать' : 'Читать'}</button></div>`;
  }

  window.__gram = () => run;   /* отладка: состояние текущего захода */
  return { hasItems, blockRow };
})();
