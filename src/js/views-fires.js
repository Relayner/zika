/* Реестр личных ошибок 错: какие привычки горят, что осталось до «потушен» и разбор ловушки.
   Экран сам ничего не выводит: статусы, сроки и прочность приходят из Fires, имена и правила —
   из TRAPS, а тренировка уходит обычной попыткой через saveAttempt и возвращается в реестр
   тем же путём, что и любое занятие. Ни одного значения в state мимо попытки не пишем. */
window.FiresUI = (() => {
  const { state, views, actions, nav, esc, uid, toast, sheet, closeSheet, render, saveAttempt, fmt, LABELS } = App;

  const DAY = 24 * 3600e3, MONTH = 30 * DAY;
  const DRILL_N = 6;      /* заданий в разборе */
  const DRILL_MIN = 4;    /* меньше четырёх разных заданий — разбор не собираем */
  const SCAN = 60;        /* сколько слов пересматриваем в поисках подходящих */
  let dr = null;          /* текущий разбор: { fireId, title, qs, i, shown, startedAt, qAt } */
  let last = null;        /* итог последнего разбора — только для экрана результата */

  const is2 = () => !!(window.Ledger && Ledger.is2 && Ledger.is2(state));
  const ready = () => !!window.Fires;
  const fires = now => (window.Fires ? Fires.compute(state, now) : []);
  const shuffle = a => (window.HskReal ? HskReal.shuffle(a) : a.slice());
  const HOT = { burning: 1, relit: 1 };
  const ST_CLS = { noticed: '', burning: 'bad', relit: 'bad', fading: 'mid', out: 'good' };
  const ORD = { burning: 0, relit: 0, fading: 1, noticed: 2, out: 3 };
  const LETTER_KINDS = { init: 1, fin: 1, glyph: 1, ru: 1, mw: 1 };   /* ловушки, где буквы слога расходятся */

  /* ── словарь, в котором ищем слова для разбора ── */
  let poolC = null, mapC = null;
  function pool() {
    if (!poolC) poolC = App.hskCards.concat(App.cardsOfDeck('freq1'));
    return poolC;
  }
  function hmap() {
    if (mapC) return mapC;
    mapC = new Map();
    for (const c of pool()) if (!mapC.has(c.hanzi)) mapC.set(c.hanzi, c);
    return mapC;
  }
  const cardsOf = hs => hs.map(h => hmap().get(h)).filter(Boolean);
  const letters = py => (window.Pinyin ? Pinyin.analyze(py).letters : String(py || '').toLowerCase());

  /* ── имя ловушки в каталоге: у реестра свои обозначения звуков ── */
  function trapIdOf(f) {
    if (!window.TRAPS || !f) return null;
    if (TRAPS.byId(f.id)) return f.id;
    let m = /^ini:(.+)\/(.+)$/.exec(f.id);
    if (m && TRAPS.byId('init:' + m[1] + '-' + m[2])) return 'init:' + m[1] + '-' + m[2];
    m = /^nasal:(.+)\/(.+)$/.exec(f.id);
    if (m && TRAPS.byId('fin:' + m[1] + '-' + m[2])) return 'fin:' + m[1] + '-' + m[2];
    return null;
  }
  function explainOf(f) {
    const id = trapIdOf(f);
    if (!id || !window.TRAPS) return null;
    try { return TRAPS.explain(id); } catch (e) { return null; }
  }
  const trapBox = ex => `<div class="trap-box"><div class="trap-t">${esc(ex.ru)}</div><div class="trap-r">${esc(ex.rule)}</div>${ex.contrast ? `<div class="trap-c">${esc(ex.contrast)}</div>` : ''}</div>`;

  /* ── случаи каждой ошибки с цитатами: один проход по журналу на все огни ── */
  let idxCache = null, idxLen = -1;
  function caseIndex() {
    const all = state.attempts || [];
    if (idxCache && idxLen === all.length) return idxCache;
    const m = new Map();
    for (const a of all) {
      if (!a || a.aborted) continue;
      for (const q of a.questions || []) {
        if (!q) continue;
        let hs = [];
        try { hs = Fires.trace(a, q) || []; } catch (e) { hs = []; }
        for (const h of hs) {
          if (!m.has(h.id)) m.set(h.id, []);
          m.get(h.id).push({ ts: a.ts, ok: h.ok, a, q });
        }
      }
    }
    for (const v of m.values()) v.sort((x, y) => x.ts - y.ts);
    idxCache = m; idxLen = all.length;
    return m;
  }
  const rowsOf = f => (window.Fires ? (caseIndex().get(f.id) || []) : []);

  /* Что именно ответил ученик — берём из самой попытки, ничего не достраивая */
  function given(q) {
    const an = (q && q.answer) || {};
    if (an.choiceText != null && String(an.choiceText).trim()) return String(an.choiceText).trim();
    if (an.input) {
      const v = Object.keys(an.input).map(k => an.input[k]).filter(x => x && String(x).trim());
      if (v.length) return v.join(' · ');
    }
    if (typeof an.given === 'string' && an.given.trim()) return an.given.trim();
    if (an.self != null) return an.self ? 'знал' : 'не знал';
    if (an.timeout) return 'время вышло';
    return null;
  }
  const wordOf = q => [q.hanzi, q.pinyin, q.ru].filter(Boolean).join(' · ');
  /* Цитата — только там, где из журнала видно, что именно ученик выбрал вместо чего.
     Если верный ответ в попытке не записан, цитируем лишь названную ловушку: додумывать нечего. */
  function quoteOf(r) {
    const q = r.q || {};
    const g = given(q);
    if (!g) return null;
    const gs = q.guess || [];
    const right = String((gs.indexOf('ru') >= 0 ? q.ru : gs.indexOf('pinyin') >= 0 ? q.pinyin : gs.indexOf('hanzi') >= 0 ? q.hanzi : '') || '').trim();
    const word = wordOf(q);
    if (right) return right === g ? null : '«' + g + '» вместо «' + right + '»' + (word ? ' · ' + word : '');
    return q.trap && word ? '«' + g + '» · ' + word : null;
  }
  /* Пример из собственных ответов: последний промах с цитатой, иначе — слово, на котором он вышел */
  function lastQuote(f) {
    const rows = rowsOf(f);
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].ok) continue;
      const t = quoteOf(rows[i]);
      if (t) return t;
    }
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].ok) continue;
      const w = wordOf(rows[i].q || {});
      if (w) return 'последний промах: ' + w;
    }
    return null;
  }
  function srcLabel(a) {
    if (!a) return 'занятие';
    if (a.mode === 'phon' || a.mode === 'sprint' || a.mode === 'probe') return a.deckName || (LABELS.mode[a.mode] || a.mode);
    const name = a.deckName ? ' · ' + a.deckName : '';
    return (LABELS.mode[a.mode] || a.mode || 'занятие') + name;
  }

  /* «4 промаха из 6 за месяц» — считаем по случаям самого огня, без запаса «примерно» */
  function missLine(f, now) {
    const from = (now || Date.now()) - MONTH;
    const m = f.cases.filter(c => c.ts >= from);
    const src = m.length ? m : f.cases;
    const miss = src.filter(c => !c.ok).length;
    return fmt.plural(miss, 'промах', 'промаха', 'промахов') + ' из ' + src.length + (m.length ? ' за месяц' : ' за всё время');
  }

  /* ── где эту ошибку можно поставить среди вариантов ── */
  function kindCards(kind) {
    const out = [];
    if (!window.TRAPS) return out;
    for (const t of TRAPS.byKind(kind)) for (const it of t.items || []) { const c = hmap().get(it.hanzi); if (c) out.push(c); }
    return out;
  }
  /* Разбор возможен там, где ловушка встаёт среди вариантов выбора.
     Слух и письмо так не проверяются — у них свои занятия. */
  function canDrill(f) {
    if (!f || !window.TRAPS) return false;
    if (f.id.indexOf('ear:') === 0 || f.id.indexOf('hand:') === 0) return false;
    if (trapIdOf(f)) return true;
    if (f.id === 'tone' || f.id === 'syll' || f.id === 'mean' || /^tone:[1-4]$/.test(f.id)) return true;
    if (f.id.indexOf('spell:') === 0) return !!(window.PHON && PHON.ruleOf);
    if (f.id.indexOf('node:') === 0) {
      const c = App.cardIndex[f.id.slice(5)];
      return !!(c && c.hanzi && hmap().has(c.hanzi));   /* вопрос экзамена или фраза — не слово словаря */
    }
    return false;
  }
  const tonesOf = py => { try { return window.Pinyin ? Pinyin.analyze(py).tones : []; } catch (e) { return []; } };
  function aimOf(f) {
    if (!canDrill(f)) return null;
    const id = trapIdOf(f);
    if (id) {
      const t = TRAPS.byId(id);
      let cands = [];
      if (t.items && t.items.length) cands = cardsOf(t.items.map(i => i.hanzi));
      else if (t.chars) cands = cardsOf(t.chars);
      else if (t.words) cands = cardsOf(t.words);
      else if (t.kind === 'mw') cands = cardsOf([t.mw]);
      else if (t.pair && t.kind === 'init') cands = pool().filter(c => { const l = letters(c.pinyin); return l.indexOf(t.pair[0]) === 0 || l.indexOf(t.pair[1]) === 0; });
      else if (t.pair && t.kind === 'fin') cands = pool().filter(c => { const l = letters(c.pinyin); return l.slice(-t.pair[0].length) === t.pair[0] || l.slice(-t.pair[1].length) === t.pair[1]; });
      return { dir: 'zh', cands, hit: d => d.trap === id, trap: id };
    }
    if (f.id === 'tone') return { dir: 'zh', cands: kindCards('tone'), hit: d => d.trapKind === 'tone', trap: null };
    const tn = /^tone:([1-4])$/.exec(f.id);
    if (tn) return { dir: 'zh', cands: kindCards('tone').filter(c => tonesOf(c.pinyin).indexOf(+tn[1]) >= 0), hit: d => d.trapKind === 'tone', trap: null };
    if (f.id === 'syll') return { dir: 'zh', cands: pool(), hit: d => d.trapKind === 'init' || d.trapKind === 'fin', trap: null };
    if (f.id === 'mean') return { dir: 'ru', cands: pool(), hit: () => true, trap: null };
    if (f.id.indexOf('spell:') === 0) {
      const key = f.id.slice(6);
      const fits = c => { try { return PHON.ruleOf(letters(c.pinyin)) === key; } catch (e) { return false; } };
      return { dir: 'zh', cands: pool().filter(fits), hit: d => LETTER_KINDS[d.trapKind] === 1, trap: null };
    }
    const card = App.cardIndex[f.id.slice(5)];
    const near = [];
    try { for (const d of TRAPS.forCard(card, pool(), 'ru', 6)) { const c = hmap().get(d.hanzi); if (c) near.push(c); } } catch (e) { /* соседей может не быть */ }
    return { dir: 'zh', cands: [card].concat(near), hit: () => true, trap: null };
  }

  /* ── сборка разбора: та же ловушка стоит среди вариантов, спрашиваем в обе стороны ── */
  function buildDrill(f) {
    const aim = aimOf(f);
    if (!aim || !aim.cands.length) return null;
    const p = pool();
    const seen = new Set(), picks = [];
    for (const card of shuffle(aim.cands).slice(0, SCAN)) {
      if (picks.length >= DRILL_N) break;
      if (!card || seen.has(card.id)) continue;
      let ds = [];
      try { ds = TRAPS.forCard(card, p, 'ru', 6) || []; } catch (e) { ds = []; }
      const hit = ds.filter(aim.hit);
      if (!hit.length) continue;
      seen.add(card.id);
      picks.push({ card, opts: [hit[0]].concat(ds.filter(d => d !== hit[0]).slice(0, 2)), trap: hit[0].trap || aim.trap || null });
    }
    if (!picks.length) return null;
    const qs = [];
    for (const dir of [aim.dir, aim.dir === 'zh' ? 'ru' : 'zh']) {
      for (const it of picks) {
        if (qs.length >= DRILL_N) break;
        const opts = shuffle([it.card].concat(it.opts));
        qs.push({ card: it.card, dir, opts, correct: opts.indexOf(it.card), trap: it.trap, ok: null, given: -1, ms: 0 });
      }
    }
    return qs.length >= DRILL_MIN ? qs : null;
  }

  /* ── экран реестра ── */
  const headHtml = sub => `<div class="vh"><button class="icon-btn" data-back>‹</button><div class="seal">错</div><div class="grow"><h1 class="title">Мои ошибки</h1><div class="sub">${esc(sub)}</div></div></div>`;
  const backBtns = '<div class="btns"><button class="btn btn-secondary btn-block" data-go="home">На главную</button></div>';
  const v1Panel = () => headHtml('错 · реестр привычек') + `<div class="panel"><div class="flabel">Это часть тестовой методики</div>
    <div class="hint">Ошибка называет привычку и ведётся отдельным реестром только в тестовой книге учёта. Сейчас открыта текущая.</div>
    <div class="btns mt0"><button class="btn btn-primary btn-block" data-go="settings">В настройки</button></div></div>` + backBtns;

  function top3Html(now) {
    let t3 = [];
    try { t3 = Fires.top3(state, now) || []; } catch (e) { t3 = []; }
    if (!t3.length) return '';
    return `<div class="flabel">Три главных</div><div class="tiles ${t3.length === 3 ? 't3' : ''} fire-top">${t3.map(f => `<div class="tile">
      <div class="v"><span class="fire-zh">${esc(f.statusZh)}</span><small>${esc(f.ru)}</small></div>
      <div class="l">${esc(f.statusRu)} · ${esc(missLine(f, now))}</div></div>`).join('')}</div>`;
  }

  function fireHtml(f, now) {
    const ex = explainOf(f);
    const quote = lastQuote(f);
    const tail = [missLine(f, now), f.toExtinguish].filter(Boolean).join(' · ');
    return `<div class="fire">
      <button class="row tap" data-action="fire-open" data-id="${esc(f.id)}">
        <div><div class="row-t"><span class="fire-zh">${esc(f.statusZh)}</span>${esc(f.ru)}</div>
        <div class="row-s">${esc(tail)}</div>
        ${quote ? `<div class="fire-q">${esc(quote)}</div>` : ''}</div>
        <div class="row-r"><span class="badge ${ST_CLS[f.status] || ''}">${esc(f.statusRu)}</span><span class="chev">›</span></div>
      </button>
      ${ex ? trapBox(ex) : ''}
      ${HOT[f.status] && canDrill(f) ? `<div class="btns mt0"><button class="btn btn-secondary btn-sm" data-action="fire-drill" data-id="${esc(f.id)}">Разобрать · ${DRILL_N} заданий</button></div>` : ''}
    </div>`;
  }

  views.fires = {
    render() {
      if (!ready()) return headHtml('错') + '<div class="panel"><div class="hint">Реестр ошибок пока не загружен.</div></div>' + backBtns;
      if (!is2()) return v1Panel();
      const now = Date.now();
      const all = fires(now);
      if (!all.length) {
        return headHtml('错 · привычки, которые стоит поправить') + `<div class="empty gold">Ошибок пока не набралось — это хорошо.</div>
          <div class="panel"><div class="hint">Реестр заполняется сам по ходу занятий: как только привычка подведёт, она появится здесь — с примером из ваших ответов, правилом и тем, сколько чистых ответов осталось до «потушен». Второй промах подряд зажигает огонь, чистые ответы в разные дни его гасят.</div></div>` + backBtns;
      }
      const hot = all.filter(f => HOT[f.status]);
      const out = all.filter(f => f.status === 'out');
      const sorted = all.slice().sort((a, b) => (ORD[a.status] || 0) - (ORD[b.status] || 0));
      return headHtml('错 · ' + fmt.plural(all.length, 'привычка', 'привычки', 'привычек') + ' в реестре') +
        top3Html(now) +
        `<div class="panel"><div class="flabel">${fmt.plural(hot.length, 'ошибка горит', 'ошибки горят', 'ошибок горит')}${out.length ? ' · потушено ' + out.length : ''}</div>
          <div class="hint mt0">Замечен 见 · горит 燃 · гаснет 弱 · потушен 灭 · вспыхнул снова 复燃. Огонь гаснет чистыми ответами в разные дни, а не одной удачной попыткой.</div></div>
        <div class="panel">${sorted.map(f => fireHtml(f, now)).join('')}</div>` + backBtns;
    },
  };

  /* ── история одной ошибки ── */
  actions['fire-open'] = el => {
    const now = Date.now();
    const f = fires(now).find(x => x.id === el.dataset.id);
    if (!f) return;
    const rows = rowsOf(f);
    const chain = rows.slice(-24).map(r => `<i class="${r.ok ? 'ok' : 'bad'}">${r.ok ? '○' : '●'}</i>`).join('');
    const items = rows.slice(-14).reverse().map(r => {
      const q = quoteOf(r) || wordOf(r.q || {});
      return `<div class="wn-it fh ${r.ok ? 'ok' : 'bad'}"><b>${r.ok ? '○ чисто' : '● промах'}</b>
        <span class="hint">${esc(fmt.date(r.ts))} · ${esc(srcLabel(r.a))}</span>
        ${q ? `<div class="fire-q">${esc(q)}</div>` : ''}</div>`;
    }).join('');
    const ex = explainOf(f);
    sheet(`<h3 class="sh-t"><span class="zh">${esc(f.statusZh)}</span> ${esc(f.ru)}</h3>
      <div class="hint">${esc(f.statusRu)} · ${esc(f.why)}</div>
      <div class="hint">${esc(missLine(f, now))} · ${esc(f.toExtinguish)}</div>
      ${chain ? `<div class="fh-line">${chain}</div>` : ''}
      ${ex ? trapBox(ex) : ''}
      <div class="wn">${items || '<div class="hint">Случаев в журнале не нашлось.</div>'}</div>
      ${canDrill(f) ? `<button class="btn btn-primary btn-block mt" data-action="fire-drill" data-id="${esc(f.id)}">Разобрать · ${DRILL_N} заданий</button>` : `<div class="hint mt">${f.id.indexOf('ear:') === 0 ? 'Эта ошибка проверяется на слух — в разборах звучания.' : f.id.indexOf('hand:') === 0 ? 'Эта ошибка видна только в письме от руки.' : 'Отдельной тренировки для неё пока нет — она встретится в обычных занятиях.'}</div>`}
      <button class="btn btn-secondary btn-block mt0" data-close>Закрыть</button>`);
  };

  /* ── разбор: шесть заданий, где ловушка стоит среди вариантов ── */
  function startDrill(id) {
    const f = fires().find(x => x.id === id);
    if (!f) return toast('Эта ошибка уже не в реестре');
    const qs = buildDrill(f);
    if (!qs) return toast('Для этой ошибки не набралось разных слов — она встретится в обычных занятиях', 3600);
    dr = { fireId: f.id, title: f.ru, qs, i: 0, shown: false, startedAt: Date.now(), qAt: Date.now() };
    nav('fires-run');
  }
  actions['fire-drill'] = el => { closeSheet(); startDrill(el.dataset.id); };
  actions['fire-quit'] = () => { dr = null; nav('fires', {}, { replace: true }); };
  actions['fire-answer'] = el => {
    if (!dr || dr.shown) return;
    const q = dr.qs[dr.i];
    const idx = +el.dataset.idx;
    q.given = idx;
    q.ok = idx === q.correct;
    q.ms = Math.max(0, Date.now() - dr.qAt);
    if (q.ok) Sound.ok(); else Sound.fail();
    dr.shown = true;
    render();
  };
  actions['fire-next'] = () => {
    if (!dr) return;
    dr.i++; dr.shown = false; dr.qAt = Date.now();
    if (dr.i >= dr.qs.length) return finish();
    render();
  };

  const optText = (o, dir) => (!o ? '—' : dir === 'zh' ? [o.hanzi, o.pinyin].filter(Boolean).join(' ') : String(o.ru || ''));

  /* Вопрос в журнал: разбор по частям выводим из самого ответа, как в обычной викторине —
     выбрали слово-близнеца по тону, значит буквы верны, а тон нет. */
  function questionOf(q) {
    const c = q.card, chosen = q.opts[q.given] || null;
    const parts = {};
    if (q.dir === 'zh') {
      parts.hanzi = q.ok ? 'exact' : 'wrong';
      let r = q.ok ? 'exact' : 'wrong';
      if (window.Pinyin && chosen) { r = Pinyin.compare(c.pinyin, chosen.pinyin || ''); if (r === 'empty') r = 'wrong'; }
      parts.pinyin = r;
    } else parts.ru = q.ok ? 'exact' : 'wrong';
    const o = {
      cardId: c.id, hanzi: c.hanzi, pinyin: c.pinyin, ru: c.ru,
      show: q.dir === 'zh' ? 'ru' : 'hp', guess: q.dir === 'zh' ? ['hanzi', 'pinyin'] : ['ru'],
      parts, fraction: q.ok ? 1 : 0, ok: !!q.ok, ms: q.ms || 0,
      answer: { choice: q.given, choiceText: optText(chosen, q.dir) },
    };
    /* имя привычки: при верном ответе — та, что стояла среди вариантов и была обойдена;
       при промахе — та, в которую ученик попал */
    const tid = q.ok ? q.trap : ((chosen && chosen.trap) || q.trap);
    if (tid) { o.trap = tid; o.answer.trap = tid; }
    return o;
  }
  function finish() {
    const d = dr;
    dr = null;
    const now = Date.now();
    const total = d.qs.length, right = d.qs.filter(q => q.ok).length;
    const first = d.qs[0];
    const a = {
      id: uid(), ts: d.startedAt, endedAt: now, durationMs: now - d.startedAt,
      mode: 'trap', difficulty: 'trap', deckIds: [], deckName: 'Разбор ошибки · ' + d.title,
      show: first.dir === 'zh' ? 'ru' : 'hp', guess: first.dir === 'zh' ? ['hanzi', 'pinyin'] : ['ru'],
      order: 'random', timer: 0, total, planned: total, aborted: false,
      correct: right, partial: 0, wrong: total - right, percent: Math.round(right / total * 100),
      questions: d.qs.map(questionOf),
    };
    last = { id: a.id, fireId: d.fireId, title: d.title, right, total };
    saveAttempt(a).then(() => { Sound.finish(right === total); nav('fires-result', {}, { replace: true }); });
  }

  function feedback(q) {
    const chosen = q.opts[q.given] || null;
    const tid = q.ok ? q.trap : ((chosen && chosen.trap) || q.trap);
    let ex = null;
    if (tid && window.TRAPS) { try { ex = TRAPS.explain(tid); } catch (e) { ex = null; } }
    return `<div class="panel fb">
      <div class="fb-row"><span class="fb-p">${q.ok ? '对 верно' : '错 мимо'}</span><span class="fb-v"><span class="zh">${esc(q.card.hanzi)}</span> ${esc(q.card.pinyin)} · ${esc(q.card.ru)}</span></div>
      ${!q.ok && chosen ? `<div class="hint mt0">Вы выбрали <span class="zh">${esc(chosen.hanzi)}</span> ${esc(chosen.pinyin)} — ${esc(chosen.ru)}.</div>` : ''}
      ${ex ? trapBox(ex) : ''}
      <button class="btn btn-primary btn-block" data-action="fire-next">${dr.i + 1 >= dr.qs.length ? 'Итог' : 'Дальше'}</button></div>`;
  }

  views['fires-run'] = {
    render() {
      if (!dr) return '<div class="empty">Разбор не запущен</div>' + backBtns;
      const q = dr.qs[dr.i];
      const head = `<div class="qbar"><button class="icon-btn" data-action="fire-quit">✕</button>
        <div class="progress"><i style="width:${Math.round(dr.i / dr.qs.length * 100)}%"></i></div>
        <div class="qcount">${dr.i + 1}/${dr.qs.length}</div></div>`;
      const prompt = q.dir === 'zh'
        ? `<div class="panel ornate qcard"><div class="qlabel">Какое слово значит</div><div class="fire-ask">${esc(q.card.ru)}</div></div>`
        : `<div class="panel ornate qcard"><div class="qlabel">Что это значит</div><div class="hanzi mid">${esc(q.card.hanzi)}</div><div class="pinyin">${esc(q.card.pinyin)}</div></div>`;
      const opts = `<div class="opts">${q.opts.map((o, i) => {
        let cls = 'opt' + (q.dir === 'ru' ? ' opt-txt' : '');
        if (dr.shown) { if (i === q.correct) cls += ' correct'; else if (i === q.given) cls += ' wrong'; }
        const body = q.dir === 'zh'
          ? `<span class="opt-hanzi">${esc(o.hanzi)}</span><span class="opt-sep">·</span><span class="opt-pinyin">${esc(o.pinyin)}</span>`
          : `<span class="opt-ru">${esc(o.ru)}</span>`;
        return `<button class="${cls}" data-action="fire-answer" data-idx="${i}" data-nosound ${dr.shown ? 'disabled' : ''}>${body}</button>`;
      }).join('')}</div>`;
      return head + prompt + opts + (dr.shown ? feedback(q) : '');
    },
  };

  views['fires-result'] = {
    render() {
      if (!last) return '<div class="empty">Итога разбора нет</div>' + backBtns;
      const now = Date.now();
      const f = fires(now).find(x => x.id === last.fireId) || null;
      const a = (state.attempts || []).find(x => x.id === last.id) || null;
      const pts = a ? (window.Ledger && Ledger.ptsOf ? Ledger.ptsOf(a) : a.points) : null;
      return `<div class="vh"><div class="seal">错</div><div class="grow"><h1 class="title">${esc(last.title)}</h1><div class="sub">разбор · ${last.right} из ${last.total}</div></div></div>
        <div class="panel ornate"><div class="res-meta"><div class="big-score">${last.right}<small>из ${last.total}</small></div>
          ${pts != null ? `<div class="fb-row"><span class="fb-p">Очков</span><span class="fb-v"><b>+${Math.round(pts)}</b></span></div>` : ''}
          <div class="hint mt0">${f
            ? esc(f.statusZh + ' ' + f.statusRu) + ' · ' + esc(f.toExtinguish)
            : 'Эта ошибка вышла из реестра: промахов по ней в журнале больше нет.'}</div></div></div>
        <div class="panel"><div class="hint mt0">Разбор записан как обычное занятие: чистые ответы идут в серию, но из одной попытки в неё засчитывается не больше ${Fires.PER_ATTEMPT}. Огонь гаснет только ответами в разные дни.</div></div>
        <div class="btns"><button class="btn btn-primary btn-block" data-go="fires">К реестру ошибок</button><button class="btn btn-secondary btn-block" data-go="home">На главную</button></div>`;
    },
  };

  /* ── строка для главной ── */
  function homePanel() {
    if (!ready() || !is2()) return '';
    const now = Date.now();
    const hot = fires(now).filter(f => HOT[f.status]);
    if (!hot.length) return '';
    const top = hot[0];
    return `<div class="panel fire-home">
      <div class="grow"><div class="flabel">Мои ошибки 错</div>
        <div class="row-t"><span class="fire-zh">${esc(top.statusZh)}</span>${esc(top.ru)}</div>
        <div class="hint mt0">${fmt.plural(hot.length, 'ошибка горит', 'ошибки горят', 'ошибок горит')} · ${esc(missLine(top, now))}</div></div>
      <div class="fire-home-b">${canDrill(top) ? `<button class="btn btn-primary btn-sm" data-action="fire-drill" data-id="${esc(top.id)}">Разобрать</button>` : ''}
        <button class="btn btn-secondary btn-sm" data-go="fires">Все</button></div></div>`;
  }

  return { homePanel };
})();
