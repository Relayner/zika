/* Фонетика: уроки-разборы и дриллы на слух. Ступень «с нуля». */
(() => {
  const { state, views, actions, nav, esc, attr, uid, $, toast, sheet, closeSheet, persist, render, saveAttempt, fmt } = App;
  const P = window.PHON;
  let dr = null;   /* дрилл: { kind, qs, i, right, wrong, startedAt } */

  const prog = () => (state.settings.phon || (state.settings.phon = {}));
  const done = id => !!prog()[id];

  /* ── список уроков ── */
  views.phon = {
    render() {
      const rows = P.LESSONS.map(l => `<button class="row tap ${done(l.id) ? 'ph-done' : ''}" data-action="phon-open" data-id="${l.id}">
        <div><div class="row-t"><span class="zh">${l.zh}</span> · ${esc(l.ru)}${done(l.id) ? ' <span class="ph-tick">✓</span>' : ''}</div><div class="row-s">${esc(l.can)}</div></div>
        <div class="row-r"><span class="badge ${l.kind === 'drill' ? 'mid' : ''}">${l.kind === 'drill' ? 'на слух' : 'разбор'}</span><span class="chev">›</span></div></button>`).join('');
      const n = P.LESSONS.filter(l => done(l.id)).length;
      return `<div class="vh"><div class="seal">音</div><div class="grow"><h1 class="title">Звучание</h1><div class="sub">语音 · с нуля: слог, тоны, запись</div></div><button class="icon-btn" data-action="phon-info" aria-label="Зачем это">i</button></div>
      <div class="panel"><div class="flabel">Пройдено ${n} из ${P.LESSONS.length}</div><div class="blk-bar"><i style="width:${Math.round(n / P.LESSONS.length * 100)}%"></i></div>
        <div class="hint" style="margin:8px 0 0">Начните отсюда, если китайский для вас новый: сначала звук, потом знаки.</div></div>
      <div class="panel">${rows}</div>`;
    },
  };
  actions['phon-info'] = () => sheet(`<h3 class="sh-t">Зачем это нужно</h3><div class="install-note">
    <p>В китайском <b>тон — часть слова</b>, а не интонация. <span class="zh">妈 mā</span> мама и <span class="zh">马 mǎ</span> лошадь различаются только им.</p>
    <p>Слог всегда собран одинаково: <b>инициаль + финаль + тон</b>. Разобравшись с этой схемой один раз, вы сможете прочитать любой пиньинь.</p>
    <p>Разборы можно читать в любом порядке, дриллы — тренировать сколько угодно раз.</p></div>
    <button class="btn btn-primary btn-block mt" data-close>Понятно</button>`);

  actions['phon-open'] = el => {
    const l = P.LESSONS.find(x => x.id === el.dataset.id);
    if (!l) return;
    if (l.kind === 'theory') return openTheory(l);
    startDrill(l);
  };

  /* ── разборы ── */
  function openTheory(l) {
    let body = '';
    if (l.part === 'syllable') {
      body = `<div class="ph-formula"><span class="zh">m</span> + <span class="zh">ā</span> = <span class="zh big">mā 妈</span></div>
      <p>Китайский слог собирается из трёх частей, и порядок всегда один:</p>
      <div class="ph-row"><b>Инициаль</b><div>согласный в начале. Бывает и пустой: <span class="zh">ài 爱</span></div></div>
      <div class="ph-row"><b>Финаль</b><div>гласная часть, иногда с носовым концом: <span class="zh">an</span>, <span class="zh">ang</span></div></div>
      <div class="ph-row"><b>Тон</b><div>знак над гласной. Их четыре плюс нейтральный</div></div>
      <p class="muted">Всего сочетаний около четырёхсот — меньше, чем кажется. Выучив части, вы прочитаете любое слово.</p>`;
    } else if (l.part === 'initials') {
      body = P.INITIALS.map(g => `<div class="ph-grp"><div class="flabel">${esc(g.g)} · ${esc(g.ru)}</div>${g.list.map(([s, d]) =>
        `<div class="ph-row"><b class="ph-s" data-action="phon-say" data-s="${s}a">${s}</b><div>${esc(d)}</div></div>`).join('')}</div>`).join('');
    } else if (l.part === 'finals') {
      body = P.FINALS.map(g => `<div class="ph-grp"><div class="flabel">${esc(g.g)}</div>${g.list.map(([s, d]) =>
        `<div class="ph-row"><b class="ph-s" data-action="phon-say" data-s="${s}">${s}</b><div>${esc(d)}</div></div>`).join('')}</div>`).join('')
        + '<p class="muted">Разница между <b>-n</b> и <b>-ng</b> смыслоразличительна: <span class="zh">shān 山</span> гора и <span class="zh">shāng 商</span> торговля.</p>';
    } else if (l.part === 'changes') {
      body = P.CHANGES.map(c => `<div class="ph-row"><b>${esc(c.t)}</b><div>${esc(c.d)}<div class="ph-ex" data-action="phon-say" data-s="${esc(c.ex[0])}"><span class="zh">${esc(c.ex[0])}</span> ${esc(c.ex[1])} — ${esc(c.ex[2])} 🔊</div></div></div>`).join('');
    }
    sheet(`<h3 class="sh-t"><span class="zh">${l.zh}</span> · ${esc(l.ru)}</h3><div class="theory">${body}</div>
      <button class="btn btn-primary btn-block mt" data-action="phon-done" data-id="${l.id}">Понятно</button>`);
  }
  actions['phon-say'] = el => Speech.say(el.dataset.s);
  actions['phon-done'] = el => { prog()[el.dataset.id] = true; persist(); closeSheet(); render(); };

  /* ── дриллы ── */
  const shuffle = a => HskReal.shuffle(a);
  function buildDrill(kind) {
    const qs = [];
    if (kind === 'tone') {
      const pool = shuffle(P.syllables().filter(s => s.tone < 5 && s.lvl <= 2));
      pool.slice(0, 12).forEach(s => qs.push({ kind, say: s.h, prompt: 'Какой тон вы слышите?',
        opts: ['1 ˉ ровный', '2 ˊ восходящий', '3 ˇ ныряющий', '4 ˋ падающий'], correct: s.tone - 1, note: s.h + ' ' + s.py + ' — ' + s.ru }));
    } else if (kind === 'pair') {
      shuffle(P.minimalPairs()).slice(0, 10).forEach(p => {
        const items = shuffle(p.items).slice(0, Math.min(4, p.items.length));
        const right = items[Math.floor(Math.random() * items.length)];
        const opts = shuffle(items);
        qs.push({ kind, say: right.h, prompt: 'Одинаковый слог, разные тоны — что прозвучало?',
          opts: opts.map(i => i.h + ' ' + i.py), correct: opts.indexOf(right), note: right.h + ' ' + right.py + ' — ' + right.ru });
      });
    } else if (kind === 'initial') {
      shuffle(P.CONFUSE).forEach(([a, b]) => {
        const listA = P.byInitial(a), listB = P.byInitial(b);
        if (!listA.length || !listB.length) return;
        for (let k = 0; k < 2; k++) {
          const fromA = Math.random() < 0.5;
          const s = shuffle(fromA ? listA : listB)[0];
          if (!s) continue;
          const opts = shuffle([a, b]);
          qs.push({ kind, say: s.h, prompt: 'С какого звука начинается слог?', opts,
            correct: opts.indexOf(fromA ? a : b), note: s.h + ' ' + s.py + ' — ' + s.ru });
        }
      });
    } else if (kind === 'spelling') {
      shuffle(P.SPELLING).forEach(r => {
        const opts = shuffle([r.ok, r.bad]);
        qs.push({ kind, prompt: r.t + ' — как записать верно?', opts, correct: opts.indexOf(r.ok), note: r.d });
      });
      /* добираем практикой на реальных словах */
      shuffle(P.syllables().filter(s => /^(j|q|x|y|w)/.test(s.bare) && s.tone < 5)).slice(0, 6).forEach(s => {
        const wrong = s.py.replace(/u/g, 'ü');
        const opts = shuffle([s.py, wrong === s.py ? s.py + 'i' : wrong]);
        qs.push({ kind, prompt: 'Как правильно записан слог для ' + s.h + '?', opts, correct: opts.indexOf(s.py), note: s.h + ' — ' + s.ru });
      });
    }
    return shuffle(qs).slice(0, 12);
  }
  function startDrill(l) {
    const qs = buildDrill(l.drill);
    if (!qs.length) return toast('Не хватает материала для этого дрилла');
    dr = { kind: l.drill, lessonId: l.id, title: l.ru, qs, i: 0, right: 0, wrong: 0, startedAt: Date.now(), shown: null };
    nav('phon-run');
  }
  actions['phon-answer'] = el => {
    if (!dr || dr.shown) return;
    const q = dr.qs[dr.i];
    const idx = +el.dataset.idx;
    const ok = idx === q.correct;
    q.given = idx; q.ok = ok;
    if (ok) { dr.right++; Sound.ok(); } else { dr.wrong++; Sound.fail(); }
    dr.shown = true;
    render();
    setTimeout(() => {
      if (!dr) return;
      dr.i++; dr.shown = null;
      if (dr.i >= dr.qs.length) return finishDrill();
      render();
      const nx = dr.qs[dr.i];
      if (nx.say) setTimeout(() => Speech.say(nx.say), 250);
    }, 1500);
  };
  actions['phon-repeat'] = () => { if (dr && dr.qs[dr.i].say) Speech.say(dr.qs[dr.i].say); };
  actions['phon-quit'] = () => { dr = null; nav('phon', {}, { replace: true }); };

  views['phon-run'] = {
    render() {
      if (!dr) return '<div class="empty">Дрилл не запущен</div>';
      const q = dr.qs[dr.i];
      const head = `<div class="qbar"><button class="icon-btn" data-action="phon-quit">✕</button><div class="progress"><i style="width:${dr.i / dr.qs.length * 100}%"></i></div><div class="qcount">${dr.i + 1}/${dr.qs.length}</div><div class="qtimer">${dr.wrong} ✕</div></div>`;
      const prompt = q.say
        ? `<div class="panel ornate qcard"><div class="qlabel">${esc(q.prompt)}</div><button class="say-btn" data-action="phon-repeat" data-nosound aria-label="Повторить">🔊</button><div class="hint" style="text-align:center;margin-top:8px">нажмите, чтобы услышать ещё раз</div></div>`
        : `<div class="panel ornate qcard"><div class="qlabel">Запись пиньинем</div><div class="ph-q">${esc(q.prompt)}</div></div>`;
      const opts = `<div class="opts">${q.opts.map((o, i) => {
        let cls = 'opt opt-txt';
        if (dr.shown) { if (i === q.correct) cls += ' ok'; else if (i === q.given) cls += ' bad'; }
        return `<button class="${cls}" data-action="phon-answer" data-idx="${i}" ${dr.shown ? 'disabled' : ''} data-nosound><span class="${/[一-鿿]/.test(o) ? 'opt-hanzi' : 'ph-opt'}">${esc(o)}</span></button>`;
      }).join('')}</div>`;
      const fb = dr.shown ? `<div class="panel ph-fb ${q.ok ? 'ok' : 'bad'}">${q.ok ? '对 верно' : '错 мимо'} · ${esc(q.note || '')}</div>` : '';
      return head + prompt + opts + fb;
    },
    mount() { if (dr && !dr.said) { dr.said = true; const q = dr.qs[dr.i]; if (q.say) setTimeout(() => Speech.say(q.say), 350); } },
  };

  function finishDrill() {
    const total = dr.qs.length, ok = dr.right;
    const pct = Math.round(ok / total * 100);
    if (pct >= 70) { prog()[dr.lessonId] = true; }
    const a = { id: uid(), ts: dr.startedAt, endedAt: Date.now(), durationMs: Date.now() - dr.startedAt,
      mode: 'phon', difficulty: dr.kind, level: 1, deckIds: [], deckName: 'Звучание · ' + dr.title,
      show: 'audio', guess: ['answer'], order: 'random', timer: 0,
      total, planned: total, aborted: false, correct: ok, partial: 0, wrong: total - ok, percent: pct,
      questions: dr.qs.map(q => ({ hanzi: q.say || q.prompt, ok: !!q.ok, fraction: q.ok ? 1 : 0, ms: 0, answer: {} })) };
    state.lastPhon = { title: dr.title, kind: dr.kind, right: ok, total, pct };
    dr = null;
    persist();
    saveAttempt(a).then(() => { Sound.finish(pct >= 70); nav('phon-result', { id: a.id }, { replace: true }); });
  }
  views['phon-result'] = {
    render(p) {
      const a = state.attempts.find(x => x.id === p.id), f = state.lastPhon;
      if (!a || !f) return '<div class="empty">Результата нет</div>';
      return `<div class="vh"><div class="seal">音</div><div class="grow"><h1 class="title">${esc(f.title)}</h1><div class="sub">${f.right} из ${f.total} · ${f.pct}%</div></div></div>
      <div class="panel ornate result-top"><div class="res-meta"><div class="big-score">${f.pct}<small>%</small></div>
        <div class="fb-row"><span class="fb-p">Очков</span><span class="fb-v"><b>+${a.points}</b></span></div>
        <div class="hint" style="margin:6px 0 0">${f.pct >= 70 ? 'Урок засчитан — можно идти дальше' : 'Ниже 70% — стоит повторить'}</div></div></div>
      <div class="btns"><button class="btn btn-primary btn-block" data-go="phon">К урокам звучания</button><button class="btn btn-secondary btn-block" data-go="home">На главную</button></div>`;
    },
  };
})();
