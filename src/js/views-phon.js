/* Фонетика: уроки-разборы и дриллы на слух. Ступень «с нуля». */
(() => {
  const { state, views, actions, nav, esc, attr, uid, $, toast, sheet, closeSheet, persist, render, saveAttempt, fmt } = App;
  const P = window.PHON;
  let dr = null;   /* дрилл: { kind, qs, i, right, wrong, startedAt } */

  const prog = () => (state.settings.phon || (state.settings.phon = {}));
  const done = id => !!prog()[id];
  const nextLesson = () => P.LESSONS.find(l => !done(l.id));
  const EAR = { tone: 1, pair: 1, initial: 1, final: 1 };   /* дриллы, где стимул только звук */
  const VOICE_WARN = '<div class="panel warn"><b>Нет китайского голоса</b> — дриллы на слух будут немыми. iPhone: Настройки → Универсальный доступ → Устный контент → Голоса → Китайский — скачайте голос и перезапустите приложение. Разборы можно читать и без него.</div>';

  /* ── список уроков ── */
  views.phon = {
    render() {
      const rows = P.LESSONS.map(l => `<button class="row tap ${done(l.id) ? 'ph-done' : ''}" data-action="phon-open" data-id="${l.id}">
        <div><div class="row-t"><span class="zh">${l.zh}</span> · ${esc(l.ru)}${done(l.id) ? ' <span class="ph-tick">✓</span>' : ''}</div><div class="row-s">${esc(l.can)}</div></div>
        <div class="row-r"><span class="badge ${l.kind === 'drill' ? 'mid' : ''}">${l.kind === 'drill' ? (EAR[l.drill] ? 'на слух' : 'дрилл') : 'разбор'}</span><span class="chev">›</span></div></button>`).join('');
      const n = P.LESSONS.filter(l => done(l.id)).length, all = n >= P.LESSONS.length;
      const nx = nextLesson();
      return `<div class="vh"><div class="seal">音</div><div class="grow"><h1 class="title">Звучание</h1><div class="sub">语音 · с нуля: слог, тоны, запись</div></div><button class="icon-btn" data-action="phon-info" aria-label="Зачем это">i</button></div>
      <div class="panel"><div class="flabel">Пройдено ${n} из ${P.LESSONS.length}</div><div class="blk-bar"><i style="width:${Math.round(n / P.LESSONS.length * 100)}%"></i></div>
        <div class="hint" style="margin:8px 0 0">${all ? 'Ступень пройдена. Дальше — черты и первые слова.' : 'Начните отсюда, если китайский для вас новый: сначала звук, потом знаки.'}</div>
        ${all ? '<div class="btns" style="margin-top:10px"><button class="btn btn-primary btn-block" data-action="phon-next-hand">Дальше: письмо с нуля 笔画</button><button class="btn btn-secondary btn-block" data-go="program">Программа · HSK 1</button></div>'
          : nx ? `<div class="btns" style="margin-top:10px"><button class="btn btn-primary btn-block" data-action="phon-open" data-id="${nx.id}">Следующий: ${esc(nx.ru)}</button></div>` : ''}</div>
      ${Speech.available() ? '' : VOICE_WARN}
      <div class="panel">${rows}</div>`;
    },
  };
  actions['phon-info'] = () => sheet(`<h3 class="sh-t">Зачем это нужно</h3><div class="install-note">
    <p>В китайском <b>тон — часть слова</b>, а не интонация. <span class="zh">妈 mā</span> мама и <span class="zh">马 mǎ</span> лошадь различаются только им.</p>
    <p>Слог всегда собран одинаково: <b>инициаль + финаль + тон</b>. Разобравшись с этой схемой один раз, вы сможете прочитать любой пиньинь.</p>
    <p>Разборы можно читать в любом порядке, дриллы — тренировать сколько угодно раз. За первый прочитанный разбор — 10 очков, за дрилл — по ответам.</p></div>
    <button class="btn btn-primary btn-block mt" data-close>Понятно</button>`);
  actions['phon-next-hand'] = () => { state.settings.handLevel = 0; state.settings.handMode = 'trace'; persist(); nav('hand'); };

  actions['phon-open'] = el => {
    const l = P.LESSONS.find(x => x.id === el.dataset.id);
    if (!l) return;
    if (l.kind === 'theory' || l.theory) return openTheory(l);
    startDrill(l);
  };

  /* ── разборы ── */
  const say = (h, label) => `<b class="ph-s" data-action="phon-say" data-s="${attr(h)}">${esc(label)}</b>`;
  const exRow = ([s, d, h, py]) => `<div class="ph-row">${say(h, s)}<div>${esc(d)}<span class="ph-ex" data-action="phon-say" data-s="${attr(h)}"> · <span class="zh">${esc(h)}</span> ${esc(py)} 🔊</span></div></div>`;
  const groups = list => list.map(g => `<div class="ph-grp"><div class="flabel">${esc(g.g)}${g.ru ? ' · ' + esc(g.ru) : ''}</div>${g.list.map(exRow).join('')}</div>`).join('');
  function openTheory(l) {
    let body = '', btn = `<button class="btn btn-primary btn-block mt" data-action="phon-done" data-id="${l.id}">Понятно</button>`;
    const part = l.part || l.theory;
    if (part === 'syllable') {
      body = `<div class="ph-formula"><span class="zh">m</span> + <span class="zh">ā</span> = <span class="zh big" data-action="phon-say" data-s="妈">mā 妈 🔊</span></div>
      <p>Китайский слог собирается из трёх частей, и порядок всегда один:</p>
      <div class="ph-row"><b>Инициаль</b><div>согласный в начале. Бывает и пустой: ${say('爱', 'ài 爱')}</div></div>
      <div class="ph-row"><b>Финаль</b><div>гласная часть, иногда с носовым концом: ${say('三', 'an 三')}, ${say('上', 'ang 上')}</div></div>
      <div class="ph-row"><b>Тон</b><div>знак над гласной. Их четыре плюс нейтральный</div></div>
      <p class="muted">Всего сочетаний около четырёхсот — меньше, чем кажется. Выучив части, вы прочитаете любое слово.</p>`;
    } else if (part === 'tones') {
      body = `<p>Один и тот же слог <span class="zh">ma</span> — пять разных слов. Нажмите на каждый и послушайте, как ходит голос:</p>
      ${P.TONES.map(t => `<div class="ph-row ph-tone">${say(t.ex[0], t.n === 5 ? '· ma' : t.mark + ' ' + t.ex[1])}<div><b>${esc(t.t)}</b> <span class="muted">${t.zh}</span><br>${esc(t.d)}<span class="ph-ex" data-action="phon-say" data-s="${t.ex[0]}"> · <span class="zh">${t.ex[0]}</span> ${esc(t.ex[1])} — ${esc(t.ex[2])} 🔊</span></div></div>`).join('')}
      <p class="muted">Знак тона ставят над гласной: над a или e, если они есть; в ou — над o; иначе над последней гласной. Следующий урок — на слух.</p>`;
    } else if (part === 'initials') {
      body = '<p>Нажмите на букву — прозвучит слово с этой инициалью. Обратите внимание на придыхание: p, t, k, q, ch, c выдыхаются сильно, как со вздохом.</p>' + groups(P.INITIALS);
    } else if (part === 'finals') {
      body = '<p>Финаль — всё, что после инициали. Здесь гласные финали; носовые (-n, -ng) — в следующем разборе.</p>' + groups(P.FINALS);
    } else if (part === 'nasals') {
      body = `<p>Разница между <b>-n</b> и <b>-ng</b> смыслоразличительна: ${say('山', 'shān 山')} гора и ${say('商', 'shāng 商')} торговля; ${say('新', 'xīn 新')} новый и ${say('星', 'xīng 星')} звезда.</p>
      <p>Проверка: на <b>-n</b> кончик языка в конце касается зубов, на <b>-ng</b> — нет, рот остаётся открытым, а звук уходит в нос.</p>` + groups(P.NASALS);
    } else if (part === 'spelling') {
      body = '<p>Пиньинь пишут не всегда так, как слышат. Пять правил, которые объясняют почти все «странности»:</p>' + P.SPELLING.map(r => `<div class="ph-row"><b>${esc(r.t)}</b><div>${esc(r.d)}<div class="ph-ex"><span class="zh">${esc(r.ok)}</span> — верно · <s>${esc(r.bad)}</s> — так не пишут</div></div></div>`).join('');
      btn = `<button class="btn btn-primary btn-block mt" data-action="phon-drill" data-id="${l.id}">К дриллу · проверить себя</button>`;
    } else if (part === 'changes') {
      body = P.CHANGES.map(c => `<div class="ph-row"><b>${esc(c.t)}</b><div>${esc(c.d)}<div class="ph-ex" data-action="phon-say" data-s="${esc(c.ex[0])}"><span class="zh">${esc(c.ex[0])}</span> ${esc(c.ex[1])} — ${esc(c.ex[2])} 🔊</div></div></div>`).join('');
    }
    sheet(`<h3 class="sh-t"><span class="zh">${l.zh}</span> · ${esc(l.ru)}</h3><div class="theory">${body}</div>${btn}`);
  }
  actions['phon-say'] = el => Speech.say(el.dataset.s);
  actions['phon-drill'] = el => { const l = P.LESSONS.find(x => x.id === el.dataset.id); closeSheet(); if (l) startDrill(l); };
  /* разбор засчитывается один раз и даёт 10 очков — как несколько минут чтения */
  actions['phon-done'] = el => {
    const id = el.dataset.id, l = P.LESSONS.find(x => x.id === id);
    closeSheet();
    if (prog()[id]) { render(); return; }
    prog()[id] = true; persist();
    const now = Date.now();
    const a = { id: uid(), ts: now - 60e3, endedAt: now, durationMs: 60e3, mode: 'phon', difficulty: 'theory', level: 1, deckIds: [], deckName: 'Звучание · ' + (l ? l.ru : id),
      show: 'text', guess: ['read'], order: 'random', timer: 0, total: 1, planned: 1, aborted: false, correct: 1, partial: 0, wrong: 0, percent: 100, points: 10,
      questions: [{ hanzi: 'theory:' + id, ok: true, fraction: 1, ms: 0, answer: {} }] };
    saveAttempt(a).then(() => { toast('Разбор засчитан · +' + a.points, 2000); render(); });
  };

  /* ── дриллы ── */
  const shuffle = a => HskReal.shuffle(a);
  const pick = (list, n) => shuffle(list).slice(0, n);
  const note = s => s.h + ' ' + s.py + ' — ' + s.ru;
  const prefer = (list, min) => { const lo = list.filter(s => s.lvl <= 2); return lo.length >= min ? lo : list; };
  function buildDrill(kind) {
    const qs = [];
    const all = P.syllables().filter(s => !s.poly && s.tone < 5);
    if (kind === 'tone') {
      /* поровну на каждый тон — иначе четвёртый забивает остальные */
      for (let t = 1; t <= 4; t++) pick(prefer(all.filter(s => s.tone === t), 6), 3).forEach(s => qs.push({ kind, say: s.h, prompt: 'Какой тон вы слышите?',
        opts: ['1 ˉ ровный', '2 ˊ восходящий', '3 ˇ ныряющий', '4 ˋ падающий'], correct: s.tone - 1, note: note(s) }));
    } else if (kind === 'pair') {
      const pairs = P.minimalPairs();
      const easy = pairs.filter(p => p.lvl <= 2);
      pick(easy.length >= 8 ? easy : pairs, 10).forEach(p => {
        const items = pick(p.items, Math.min(4, p.items.length));
        const right = items[Math.floor(Math.random() * items.length)];
        const opts = shuffle(items);
        qs.push({ kind, say: right.h, prompt: 'Одинаковый слог, разные тоны — что прозвучало?',
          opts: opts.map(i => i.h + ' ' + i.py), correct: opts.indexOf(right), note: note(right) });
      });
    } else if (kind === 'initial') {
      shuffle(P.CONFUSE).forEach(([a, b], k) => {
        const listA = P.byInitial(a), listB = P.byInitial(b);
        if (!listA.length || !listB.length) return;
        const fromA = k % 2 === 0;
        const s = pick(fromA ? listA : listB, 1)[0];
        const opts = shuffle([a, b]);
        qs.push({ kind, say: s.h, prompt: 'С какого звука начинается слог?', opts, correct: opts.indexOf(fromA ? a : b), note: note(s) });
      });
      /* добираем до дюжины самыми коварными парами */
      shuffle(P.CONFUSE.slice(0, 6)).slice(0, 12 - qs.length).forEach(([a, b]) => {
        const fromA = Math.random() < 0.5, s = pick(P.byInitial(fromA ? a : b), 1)[0];
        if (!s) return;
        const opts = shuffle([a, b]);
        qs.push({ kind, say: s.h, prompt: 'С какого звука начинается слог?', opts, correct: opts.indexOf(fromA ? a : b), note: note(s) });
      });
    } else if (kind === 'final') {
      /* -n против -ng */
      shuffle(P.NG_PAIRS).forEach(([a, b]) => {
        for (let k = 0; k < 2 && qs.length < 8; k++) {
          const fin = k === 0 ? a : b, s = pick(P.byFinal(fin), 1)[0];
          if (!s) continue;
          const opts = shuffle([a, b]);
          qs.push({ kind, say: s.h, prompt: 'Как заканчивается слог: -n или -ng?', opts: opts.map(o => '-' + o), correct: opts.indexOf(fin), note: note(s) });
        }
      });
      /* какая финаль из группы */
      const grps = [...P.FINALS, ...P.NASALS].filter(g => g.list.length >= 4);
      let guard = 0;
      while (qs.length < 12 && guard++ < 40) {
        const g = pick(grps, 1)[0], fins = g.list.map(x => x[0]);
        const fin = pick(fins, 1)[0], s = pick(P.byFinal(fin), 1)[0];
        if (!s) continue;
        const opts = shuffle([fin, ...pick(fins.filter(f => f !== fin), 3)]);
        qs.push({ kind, say: s.h, prompt: 'Какой конец слога вы слышите?', opts, correct: opts.indexOf(fin), note: note(s) });
      }
    } else if (kind === 'spelling') {
      shuffle(P.SPELLING).slice(0, 4).forEach(r => {
        const opts = shuffle([r.ok, r.bad]);
        qs.push({ kind, prompt: r.t + ' — как записать верно?', opts, correct: opts.indexOf(r.ok), note: r.d });
      });
      /* практика на реальных словах: неверный вариант — запись «по звуку» с нарушенным правилом */
      const seen = new Set();
      const cands = prefer(all.filter(s => P.misspell(s.bare) && !seen.has(s.bare) && seen.add(s.bare)), 8);
      pick(cands, 8).forEach(s => {
        const ok = P.retone(s.bare, s.tone), bad = P.retone(P.misspell(s.bare), s.tone);
        if (ok === bad) return;
        const rule = P.SPELLING.find(r => r.key === P.ruleOf(s.bare));
        const opts = shuffle([ok, bad]);
        qs.push({ kind, prompt: 'Как записать слог для ' + s.h + ' (' + s.ru + ')?', opts, correct: opts.indexOf(ok), note: rule ? rule.t : s.h + ' — ' + s.ru });
      });
    }
    return shuffle(qs).slice(0, 12);
  }
  function startDrill(l) {
    if (EAR[l.drill] && !Speech.available()) return toast('Нет китайского голоса — этот дрилл на слух. Установите голос в настройках телефона.', 4000);
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
    state.lastPhon = { title: dr.title, kind: dr.kind, right: ok, total, pct, lessonId: dr.lessonId };
    dr = null;
    persist();
    saveAttempt(a).then(() => { Sound.finish(pct >= 70); nav('phon-result', { id: a.id }, { replace: true }); });
  }
  views['phon-result'] = {
    render(p) {
      const a = state.attempts.find(x => x.id === p.id), f = state.lastPhon;
      if (!a || !f) return '<div class="empty">Результата нет</div>';
      const nx = nextLesson(), all = !nx;
      const cur = P.LESSONS.find(l => l.id === f.lessonId);
      const next = f.pct < 70 && cur ? `<button class="btn btn-primary btn-block" data-action="phon-open" data-id="${cur.id}">Ещё раз · ${esc(cur.ru)}</button>`
        : all ? '<button class="btn btn-primary btn-block" data-action="phon-next-hand">Дальше: письмо с нуля 笔画</button>'
        : `<button class="btn btn-primary btn-block" data-action="phon-open" data-id="${nx.id}">Дальше: ${esc(nx.ru)}</button>`;
      return `<div class="vh"><div class="seal">音</div><div class="grow"><h1 class="title">${esc(f.title)}</h1><div class="sub">${f.right} из ${f.total} · ${f.pct}%</div></div></div>
      <div class="panel ornate result-top"><div class="res-meta"><div class="big-score">${f.pct}<small>%</small></div>
        <div class="fb-row"><span class="fb-p">Очков</span><span class="fb-v"><b>+${a.points}</b></span></div>
        <div class="hint" style="margin:6px 0 0">${f.pct >= 70 ? (all ? 'Ступень «Звучание» пройдена целиком' : 'Урок засчитан — можно идти дальше') : 'Ниже 70% — стоит повторить'}</div></div></div>
      <div class="btns">${next}<button class="btn btn-secondary btn-block" data-go="phon">К урокам звучания</button><button class="btn btn-secondary btn-block" data-go="home">На главную</button></div>`;
    },
  };
})();
