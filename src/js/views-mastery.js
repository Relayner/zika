/* Экран «Уровень»: оценка квалификации по тестовой методике.

   Всё показанное берётся из Mastery.compute/explain — экран ничего не считает сам и ничего
   не пишет в state. Единственное, что он повторяет за mastery.js, — приписка слова к уровню
   (уровень, где слово вводится впервые): она нужна, чтобы разложить узлы по полосам HSK. */
window.MasteryUI = (() => {
  const { state, views, actions, esc, sheet, fmt } = App;

  const STALE = 0.8;        /* ниже этой свежести узла слово считаем давно не встречавшимся */
  const WEAK_CHIPS = 8;     /* сколько слабых слов показываем полосой у уровня */
  const STALE_CHIPS = 12;
  const LV = [1, 2, 3, 4];

  const M = () => window.Mastery;
  const on = () => (window.Ledger ? Ledger.is2(state) : true);
  const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pc = v => Math.round(clamp(num(v), 0, 100));            /* проценты уровня — целыми */
  const pc1 = v => Math.round(clamp(num(v), 0, 1) * 100);       /* доли (свежесть, мастерство узла) */
  const accClass = p => (p >= 80 ? 'good' : p >= 50 ? 'mid' : 'bad');
  /* «21 слово встречалось», но «22 слова встречались» — сказуемое идёт за числительным, а не за счётом */
  const one = n => n % 10 === 1 && n % 100 !== 11;
  const prog = () => (state.settings && state.settings.program) || {};
  const phon = () => (state.settings && state.settings.phon) || {};

  /* ── слово → уровень: тот же закон, что в mastery.js (первое появление в программе/HSK) ── */
  let VL = null;
  function wordLevels() {
    if (VL) return VL;
    const lvl = {};
    const put = (h, l) => { if (h && (lvl[h] == null || l < lvl[h])) lvl[h] = l; };
    const P = window.PROGRAM;
    if (P) for (const b of P.BLOCKS || []) for (const w of b.words || []) put(w, b.lvl);
    const H = window.HSK;
    if (H) for (const l of [1, 2, 3]) for (const e of H[l] || []) put(e[0], l);
    VL = lvl;
    return VL;
  }
  /* Узел: w:слово|полоса — по слову, b:блок — по блоку, p:урок — уроки звучания идут к первому уровню */
  function nodeLevel(id) {
    const k = id.charAt(0);
    if (k === 'w') { const bar = id.indexOf('|'); return bar > 0 ? (wordLevels()[id.slice(2, bar)] || 0) : 0; }
    if (k === 'b') { const b = window.PROGRAM ? PROGRAM.byId(id.slice(2)) : null; return b ? b.lvl : 0; }
    return 1;
  }

  /* ── разбор снимка: узлы по уровням и слова с лучшей полосой ── */
  function nodeCounts(r) {
    const out = { 1: { ck: 0, gs: 0 }, 2: { ck: 0, gs: 0 }, 3: { ck: 0, gs: 0 }, 4: { ck: 0, gs: 0 } };
    for (const id of Object.keys(r.nodes.byId)) {
      const l = nodeLevel(id), box = out[l];
      if (!box) continue;
      if (num(r.nodes.byId[id].checks) > 0) box.ck++; else box.gs++;
    }
    return out;
  }
  /* Слово показывает сильнейшая полоса — так же, как считает уровень сам mastery.js */
  function wordIndex(r) {
    const out = Object.create(null);
    for (const id of Object.keys(r.nodes.byId)) {
      if (id.charAt(0) !== 'w') continue;
      const bar = id.indexOf('|');
      if (bar < 0) continue;
      const h = id.slice(2, bar), l = wordLevels()[h] || 0;
      if (!l) continue;
      const x = r.nodes.byId[id];
      const cur = out[h] || (out[h] = { h, l, m: 0, F: 0, checks: 0 });
      if (num(x.m) > cur.m) cur.m = num(x.m);
      if (num(x.F) > cur.F) cur.F = num(x.F);
      cur.checks += num(x.checks);
    }
    return out;
  }
  const byLevel = (wi, l) => Object.keys(wi).map(h => wi[h]).filter(w => w.l === l);

  /* ── уверенность: словами по ширине коридора, а не по ощущению ── */
  function trust(v) {
    const spread = Math.max(0, num(v.hi) - num(v.lo));
    if (!num(v.byChecks)) return { w: 'низкая', why: 'проверок ещё не было — оценка держится на занятиях' };
    if (spread <= 12) return { w: 'высокая', why: 'коридор узкий: почти всё, что учтено, проверено' };
    if (spread <= 30) return { w: 'средняя', why: 'часть узлов взята по предположению — отсюда ширина коридора' };
    return { w: 'низкая', why: 'коридор широкий: проверено мало, остальное — предположения' };
  }

  /* ── что поднимет процент: только то, что видно в истории ── */
  const seenOf = id => { const v = prog()[id]; return v && Array.isArray(v.seen) ? v.seen.length : 0; };
  const cleanSprints = id => (state.attempts || []).filter(a => a && a.mode === 'sprint' && (a.block || a.blockId) === id
    && !a.aborted && (a.wrong === 0 || a.percent === 100)).length;
  const examsAt = l => (state.attempts || []).filter(a => a && a.mode === 'hsk' && a.format === 'real' && a.level === l).length;

  function suggestions(r) {
    const Ms = M();
    if (!Ms || !window.PROGRAM) return [];
    const L = r.level, v = r.levels[L] || {};
    const CAPS = Ms.CAPS, MIN = Ms.MIN_SPRINT;
    /* блоки рабочего уровня идут первыми: там прибавка ближе всего */
    const blocks = PROGRAM.BLOCKS.filter(b => b.lvl === L).concat(PROGRAM.BLOCKS.filter(b => b.lvl !== L));
    const out = [];
    const add = (t, s, go) => { if (out.length < 3 && !out.some(x => x.t === t)) out.push({ t, s, go }); };

    /* 1. блок, готовый к проверке, но без чистого прохода — спринт снимает потолок выбора */
    for (const b of blocks) {
      if (out.length >= 3) break;
      if (!seenOf(b.id) || cleanSprints(b.id)) continue;
      if (!Ms.readyForCheck(state, b.id)) continue;
      add('Спринт блока «' + b.ru + '»',
        'в ленте ' + seenOf(b.id) + ' из ' + b.words.length + ' слов, чистого прохода ещё не было: выбор из вариантов держит потолок '
        + CAPS.choice.toFixed(2) + ', спринт поднимает до ' + CAPS.sprint.toFixed(2),
        'data-action="prog-open" data-id="' + esc(b.id) + '"');
    }
    /* 2. экзамен: единственная проверка без потолка */
    if (!examsAt(L)) {
      add('Экзамен HSK ' + L,
        'настоящего экзамена ' + L + '-го уровня в журнале нет, а это единственная проверка с потолком '
        + CAPS.exam.toFixed(2) + '; по проверкам сейчас ' + pc(v.byChecks) + '%',
        'data-go="hsk"');
    }
    /* 3. лента начата, но до проверки не хватает слов */
    for (const b of blocks) {
      if (out.length >= 3) break;
      const s = seenOf(b.id);
      if (!s || s >= MIN || cleanSprints(b.id)) continue;
      add('Ещё ' + fmt.plural(MIN - s, 'слово', 'слова', 'слов') + ' в блоке «' + b.ru + '»',
        'открыто ' + s + ' из ' + b.words.length + '; проверка блока открывается с ' + MIN,
        'data-action="prog-open" data-id="' + esc(b.id) + '"');
    }
    /* 4. следующий неоткрытый блок — ровно один: двумя одинаковыми советами список не забиваем */
    const fresh = blocks.find(b => !seenOf(b.id));
    if (out.length < 3 && fresh) {
      add('Откройте блок «' + fresh.ru + '»',
        'блок ещё не открывали: ' + fmt.plural(fresh.words.length, 'слово', 'слова', 'слов') + ' уровня HSK ' + fresh.lvl + ' без единого следа',
        'data-action="prog-open" data-id="' + esc(fresh.id) + '"');
    }
    /* 5. звучание: уроки считаются к первому уровню */
    const les = ((window.PHON && PHON.LESSONS) || []).filter(l => !phon()[l.id]);
    if (out.length < 3 && les.length) {
      add('Урок звучания «' + les[0].ru + '»',
        'не пройдено уроков: ' + les.length + '; звучание HSK 1 сейчас ' + pc((r.levels[1] || {}).sound) + '%',
        'data-go="phon"');
    }
    return out;
  }

  /* ── куски экрана ── */
  function hero(r) {
    const L = r.level, v = r.levels[L] || {}, p = pc(v.pct);
    const ck = pc(v.byChecks), st = Math.max(0, p - ck);
    const t = trust(v);
    return `<div class="panel ornate ms-hero">
      <button class="info-btn" data-action="mastery-info" data-nosound aria-label="Как считается оценка">i</button>
      <div class="ms-big">Работаете на <b>HSK ${L}</b> · <b>${p}%</b></div>
      <div class="blk-bar"><i style="width:${p}%"></i></div>
      <div class="ms-row"><span>коридор <b>${pc(v.lo)}–${pc(v.hi)}</b></span><span>уверенность ${t.w}</span></div>
      <div class="ms-checks">по проверкам <b>${ck}%</b> · за счёт занятий <b>+${st}</b></div>
      <div class="hint">Проверка — спринт, экзамен или ответ с перерывом хотя бы в сутки; всё прочее (лента, разбор, ответы в день знакомства) — занятия: они поднимают оценку, но не подтверждают её.</div>
      <div class="hint">${esc(t.why)}${r.confirmed ? ' · подтверждён HSK ' + r.confirmed + ': нижняя граница держалась не ниже 70% три дня подряд' : ''}</div>
    </div>`;
  }

  function chips(list) {
    if (!list.length) return '';
    return `<div class="chips ms-chips">${list.map(w => `<button class="chip" data-action="mastery-why" data-h="${esc(w.h)}" data-nosound><span class="zh">${esc(w.h)}</span> <small>${pc1(w.m)}%</small></button>`).join('')}</div>`;
  }

  function levelPanel(r, wi, counts, l) {
    const v = r.levels[l] || {}, p = pc(v.pct), c = counts[l] || { ck: 0, gs: 0 };
    const nd = v.nodes || { known: 0, partial: 0, unseen: 0 };
    const weak = byLevel(wi, l).filter(w => w.m < 0.8).sort((a, b) => a.m - b.m || (a.h < b.h ? -1 : 1)).slice(0, WEAK_CHIPS);
    return `<div class="panel ms-lvl">
      <div class="ms-lvl-t"><b>HSK ${l}</b><span class="badge ${accClass(p)}">${p}%</span></div>
      <div class="blk-bar"><i style="width:${p}%"></i></div>
      <div class="hint ms-parts">словарь ${pc(v.vocab)}% · блоки ${pc(v.blocks)}% · звучание ${pc(v.sound)}%</div>
      <div class="hint">узлов проверено ${c.ck} · по предположению ${c.gs} · слов освоено ${nd.known}, частично ${nd.partial}, без следа ${nd.unseen}</div>
      ${weak.length ? `<div class="hint ms-tapnote">Нажмите слово — покажу, из чего сложилась его оценка.</div>${chips(weak)}` : ''}
    </div>`;
  }

  function freshPanel(r, wi) {
    const L = r.level, v = r.levels[L] || {};
    const stale = byLevel(wi, L).filter(w => w.F < STALE).sort((a, b) => a.F - b.F || (a.h < b.h ? -1 : 1));
    return `<div class="panel">
      <div class="flabel">Свежесть · по HSK ${L}</div>
      <div class="ms-big sm">свежесть <b>${pc1(v.fresh)}%</b> · ${stale.length
        ? fmt.plural(stale.length, 'слово', 'слова', 'слов') + ' давно не ' + (one(stale.length) ? 'встречалось' : 'встречались')
        : 'давно не встречавшихся слов нет'}</div>
      ${stale.length ? chips(stale.slice(0, STALE_CHIPS).map(w => ({ h: w.h, m: w.F }))) : ''}
      ${stale.length > STALE_CHIPS ? `<div class="hint">Показаны первые ${STALE_CHIPS} — сначала самые давние.</div>` : ''}
      <div class="hint">Свежесть в проценты не входит: давность не отменяет проверенного, она только подсказывает, что пора повторить. Процент у слова здесь — свежесть, а не оценка.</div>
    </div>`;
  }

  function stepsPanel(r) {
    const list = suggestions(r);
    if (!list.length) return `<h2 class="h2">Что поднимет процент</h2><div class="empty">Открытые блоки пройдены чисто, экзамены сданы, уроки звучания закончены. Следующий шаг появится, когда откроете новый блок.</div>`;
    return `<h2 class="h2">Что поднимет процент</h2>${list.map(s => `<button class="row tap" ${s.go}>
      <div><div class="row-t">${esc(s.t)}</div><div class="row-s">${esc(s.s)}</div></div>
      <div class="row-r"><span class="chev">›</span></div></button>`).join('')}`;
  }

  /* Экран открывается с главной и своей вкладки не имеет — назад уводит кнопка, как на прочих таких экранах */
  const head = () => `<div class="vh"><button class="icon-btn" data-back aria-label="Назад">‹</button><div class="seal">级</div><div class="grow"><h1 class="title">Уровень</h1><div class="sub">水平 · оценка по тестовой методике</div></div></div>`;

  const offPanel = () => `${head()}<div class="panel"><div class="flabel">Это часть тестовой методики</div>
    <div class="hint" style="margin-top:0">Сейчас открыта текущая книга учёта: в ней уровень — это набранные слова, без потолков по виду проверки и без разделения «по проверкам / за счёт занятий». Включить тестовую можно в настройках, прогресс при этом не теряется.</div>
    <div class="btns"><button class="btn btn-primary btn-block" data-go="settings">В настройки</button></div></div>`;

  function emptyPanel() {
    const opened = Object.keys(prog()).length, read = Object.keys(phon()).length;
    return `${head()}<div class="empty">Оценка появится после первых заданий: она считается только из ваших ответов.</div>
    <div class="panel"><div class="hint" style="margin-top:0">Каждый ответ поднимает слово до потолка своего вида проверки: узнали из вариантов — не выше ${M().CAPS.choice.toFixed(2)}, набрали сами — ${M().CAPS.input.toFixed(2)}, прошли спринт блока чисто — ${M().CAPS.sprint.toFixed(2)}, сдали экзамен — ${M().CAPS.exam.toFixed(2)}.</div>
    ${opened || read ? `<div class="hint">${opened ? 'Блоков ленты открыто: ' + opened + '. ' : ''}${read ? 'Уроков звучания отмечено: ' + read + '. ' : ''}Это учтётся, но как предположение — выше ${M().CAPS.feed.toFixed(2)} прочитанное не поднимает.</div>` : ''}
    <div class="btns"><button class="btn btn-primary btn-block" data-go="setup">К тренировке</button></div></div>`;
  }

  /* ── экран ── */
  views['mastery'] = {
    render() {
      if (!on()) return offPanel();
      if (!M()) return `${head()}<div class="empty">Модуль оценки не загружен.</div>`;
      if (!(state.attempts || []).length) return emptyPanel();
      const r = M().compute(state);
      const wi = wordIndex(r), counts = nodeCounts(r);
      return `${head()}${hero(r)}
      <h2 class="h2">По уровням</h2>${LV.map(l => levelPanel(r, wi, counts, l)).join('')}
      ${freshPanel(r, wi)}
      ${stepsPanel(r)}`;
    },
  };

  /* ── «почему столько» по слову ── */
  actions['mastery-why'] = el => {
    const h = el.dataset.h;
    if (!h || !M()) return;
    const lines = M().explain(state, h) || [];
    const title = lines[0] || h;
    const body = lines.slice(1).map(x => {
      const cls = /^[+±−]/.test(x) ? 'ms-ev ' + (x.charAt(0) === '+' ? 'ok' : x.charAt(0) === '±' ? 'half' : 'bad')
        : /^·/.test(x) ? 'ms-ev feed' : /^потолок/.test(x) ? 'ms-cap' : 'ms-band';
      return `<div class="${cls}">${esc(x)}</div>`;
    }).join('');
    sheet(`<h3 class="sh-t"><span class="zh">${esc(String(title).split(' ')[0])}</span> ${esc(String(title).split(' ').slice(1).join(' '))}</h3>
      <div class="wn">${body || '<div class="hint">Свидетельств нет.</div>'}</div>
      <div class="hint">Строка «потолок» говорит, выше чего оценка не поднимется, пока не появится проверка посильнее.</div>
      <button class="btn btn-primary btn-block mt" data-close>Понятно</button>`);
  };

  actions['mastery-info'] = () => {
    const C = M() ? M().CAPS : null;
    sheet(`<h3 class="sh-t">Откуда берётся процент</h3>
      <div class="install-note">
        <p>Процент уровня — это среднее по всем его узлам: слово × вид работы (чтение, слух, набор, от руки), блоки программы и звучание. Части входят с разным весом: больше всего значит словарь, затем пройденные блоки, затем звучание.</p>
        <p>Каждый узел упирается в потолок вида проверки${C ? ': лента и разбор — ' + C.feed.toFixed(2) + ', самопроверка — ' + C.flip.toFixed(2) + ', выбор из вариантов — ' + C.choice.toFixed(2) + ', набор и ответ голосом — ' + C.input.toFixed(2) + ', чистый спринт — ' + C.sprint.toFixed(2) + ', настоящий экзамен — ' + C.exam.toFixed(2) : ''}. Сколько ни отвечай одним и тем же способом, выше потолка узел не поднимется.</p>
        <p><b>По проверкам</b> — часть процента, которую подтвердили спринты, экзамены и ответы с перерывом хотя бы в сутки. <b>За счёт занятий</b> — остальное: прочитанная лента, пройденные уроки, ответы в день знакомства с материалом.</p>
        <p><b>Коридор</b> — нижняя и верхняя границы: снизу только проверенное, сверху непроверенные предположения засчитаны почти полностью.</p>
        <p><b>Свежесть</b> считается отдельно и в процент не входит.</p>
      </div>
      <button class="btn btn-primary btn-block mt" data-close>Понятно</button>`);
  };

  /* ── компактная панель для главной ── */
  function homePanel() {
    if (!on() || !M()) return '';
    if (!(state.attempts || []).length) {
      return `<div class="panel ms-home tap" data-go="mastery" role="button" tabindex="0">
        <div class="flabel">Уровень · 水平</div>
        <div class="ms-big sm">оценка появится после первых заданий</div>
        <div class="hint" style="margin-top:4px">Считается только из ответов: прочитанное идёт как предположение.</div>
        <span class="chev ms-chev">›</span></div>`;
    }
    const r = M().compute(state);
    const v = r.levels[r.level] || {}, p = pc(v.pct);
    const s = suggestions(r)[0];
    return `<div class="panel ms-home tap" data-go="mastery" role="button" tabindex="0">
      <div class="flabel">Уровень · 水平</div>
      <div class="ms-big sm">HSK ${r.level} · <b>${p}%</b> <span class="muted">по проверкам ${pc(v.byChecks)}%</span></div>
      <div class="blk-bar"><i style="width:${p}%"></i></div>
      <div class="hint" style="margin-top:6px">${s ? esc(s.t) : 'Открытые блоки пройдены чисто — следующий шаг после нового блока.'}</div>
      <span class="chev ms-chev">›</span></div>`;
  }

  return { homePanel, suggestions, wordLevels };
})();
