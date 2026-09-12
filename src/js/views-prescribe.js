/* Экран предписания: «Программа на недели» и «Что изменилось».

   Здесь только показ. Программу целиком считает prescribe.js: Prescribe.build(state, now) —
   чистая функция от истории, и этот экран ни одного её числа не пересчитывает и не хранит.

   Что экран пишет в state — ровно две вещи, обе по прямому действию:
     • Prescribe.publish(state, built, now) при открытии программы. Публикация сама решает,
       выпускать ли новую программу (гистерезис по топ-3): между выпусками «Что изменилось»
       копит строки, после выпуска обнуляется и меняет дату.
     • settings.v2.route.pinned — закрепление этапа из «трёх выходов». Это выбор владельца,
       а не оценка: этап встаёт первым в списке, на очки и на порядок расчёта не влияет.
       publish() кладёт в settings.v2.route новый снимок целиком, поэтому закрепление
       переносится в него руками — иначе выпуск стирал бы выбор.

   Договор с prescribe.js (всё необязательное: чего нет — того экран не показывает):
     Prescribe.build(state, now) → { at, level, pace: {perDay, ru, measured},
       horizon: { from, to, weeks:{from,to}, ru },
       stages: [{ id, blockId, kind: 'regular'|'express'|'repair'|'sound'|'grammar',
                  ru, why, cost, days, from, to, when, priority,
                  deps:[id], blocked, unknown, total, lessons:[id] }],
       lines:  [{ t: 'review'|'sound'|'speak', ru, why }] }
     Prescribe.diff(prev, next) → [{ sign: '↑'|'↓'|'+'|'−'|'=', id, ru, why }]
     Prescribe.publish(state, built, now) → { publish, changes, route }
     Prescribe.route(state) → снимок прошлого выпуска | null
   Модуля нет — экран честно говорит, что программа готовится, и ничего не додумывает. */
window.RouteUI = (() => {
  const { state, views, actions, nav, esc, toast, persist, render, fmt } = App;

  const P = () => window.Prescribe;
  const is2 = () => !!(window.Ledger && Ledger.is2(state));
  const num = v => (typeof v === 'number' && isFinite(v) ? v : null);
  const s2 = v => (v == null ? '' : String(v));
  const pick = (o, keys) => { for (const k of keys) if (o && o[k] != null && o[k] !== '') return o[k]; return null; };
  /* «5 сен» — без часов: выпуск программы датируется днём, а не минутой */
  const dayOf = ts => (num(ts) ? fmt.date(ts).replace(/,.*$/, '') : '');
  const pl = (n, a, b, c) => fmt.plural(n, a, b, c);
  const noun = (n, a, b, c) => fmt.plural(n, a, b, c).replace(/^\d+\s/, '');
  /* дневная норма и минимальная длина этапа берутся у своих модулей, а не переписываются числом:
     иначе экран однажды начнёт обещать норму, которой в походе уже нет */
  const dayCap = () => { try { return num(window.Campaign && Campaign.CAP) || 400; } catch (e) { return 400; } };
  const minLeg = () => { const m = P(); return num(m && m.MIN_LEG) || 2; };
  /* выпуск считается состоявшимся только когда в снимке есть этапы: пустой объект — не выпуск */
  const hasStages = r => !!(r && Array.isArray(r.stages) && r.stages.length);

  /* ── закрепление этапа ── */
  function routeBox() {
    const s = state.settings || (state.settings = {});
    const v2 = s.v2 || (s.v2 = {});
    return (v2.route || (v2.route = {}));
  }
  const pinned = () => ((((state.settings || {}).v2 || {}).route || {}).pinned || null);

  /* ── вид этапа ── */
  const KIND_HINT = {
    regular: 'полный проход блока', express: 'короткий проход по знакомому',
    repair: 'возврат к тому, что просело', sound: 'уроки звучания до первого блока',
    grammar: 'разбор правила блока',
  };
  const KIND_RU = { regular: 'обычный', express: 'экспресс', repair: 'починка', sound: 'звучание', grammar: 'грамматика' };
  const KIND_ALIAS = { regular: 'regular', normal: 'regular', full: 'regular', express: 'express', fast: 'express',
    repair: 'repair', fix: 'repair', sound: 'sound', phon: 'sound', grammar: 'grammar', gram: 'grammar' };
  function kindOf(v) {
    const id = KIND_ALIAS[String(v || '').toLowerCase()] || 'regular';
    const K = (P() && P().KINDS) || null;
    return { id, ru: KIND_RU[id], zh: s2(K && K[id] ? K[id].zh : ''), hint: KIND_HINT[id] };
  }

  /* ── разбор этапа: только то, что положил prescribe.js ── */
  const blockRu = id => { const b = id && window.PROGRAM ? PROGRAM.byId(id) : null; return b ? b.ru : s2(id); };
  /* Название этапа у prescribe.js начинается с вида («Учить блок · …»), а вид мы показываем
     отдельной строкой — снимаем повтор, оставляя сам предмет этапа */
  function titleOf(ru, kind) {
    const K = (P() && P().KINDS && P().KINDS[kind.id]) || null;
    const pre = K && K.ru ? s2(K.ru) : '';
    const t = s2(ru), i = t.indexOf(' · ');
    if (pre && i > 0 && t.slice(0, i).indexOf(pre) === 0) return t.slice(i + 3) || t;
    return t;
  }

  /* Срок — диапазон и подпись, откуда он взялся: цена этапа и шаг за день */
  function termOf(st, plan) {
    const p = plan && plan.pace ? plan.pace : null;
    const from = num(st.from), to = num(st.to), d = num(st.days), cost = num(st.cost);
    const src = [];
    if (cost != null) src.push('цена этапа ' + cost + ' ' + noun(cost, 'очко', 'очка', 'очков'));
    if (p && p.perDay != null) src.push('шаг ' + p.perDay + ' в день' + (p.measured ? '' : ', расчётный — ваш ещё не измерен'));
    let why = src.length ? 'посчитан: ' + src.join(', ') : s2(st.when);
    /* цену делим на шаг, но короче минимума этап не ставится — тогда деление не объясняет срок,
       и об этом надо сказать, иначе числа в подписи не сходятся с числом дней */
    const per = p && p.perDay != null ? num(p.perDay) : null;
    const leg = minLeg();
    if (src.length && cost != null && per > 0 && d === leg && cost / per < leg) {
      why += '; работы тут меньше чем на ' + pl(leg, 'день', 'дня', 'дней')
        + ', но короче этап не ставим — между заходами нужен ночной перерыв';
    }
    /* from/to у prescribe.js — день окончания этапа от начала программы (быстрый и медленный счёт) */
    if (from != null && to != null) return { ru: from === to ? 'к ' + from + '-му дню программы' : 'к ' + from + '–' + to + '-му дню программы', why, work: d };
    if (d != null) return { ru: pl(d, 'день', 'дня', 'дней'), why, work: null };
    if (st.when) return { ru: s2(st.when), why: '', work: null };
    return null;
  }
  /* Вехи: чем этап закрывается. Правило закрытия — из самого prescribe.js (чистый спринт),
     числа — из полей этапа; ничего не придумываем. */
  function marksOf(st, kind) {
    const out = [];
    const unknown = num(st.unknown), total = num(st.total);
    if (kind.id === 'sound') {
      const n = Array.isArray(st.lessons) ? st.lessons.length : 0;
      if (n) out.push('пройти ' + pl(n, 'урок', 'урока', 'уроков') + ' звучания');
      return out;
    }
    if (kind.id === 'grammar') { out.push('пройти разбор правила до конца'); return out; }
    if (unknown != null && total != null && unknown > 0) out.push('взять ещё ' + pl(unknown, 'слово', 'слова', 'слов') + ' из ' + total);
    out.push('закрыть блок спринтом без ошибок — этим этап и считается пройденным');
    return out;
  }

  function stageOf(st, i, plan) {
    const kind = kindOf(pick(st, ['kind', 'type']));
    const deps = Array.isArray(st.deps) ? st.deps : [];
    return {
      id: s2(pick(st, ['id', 'stageId']) || ('st' + (i + 1))),
      n: i + 1,
      kind,
      title: titleOf(pick(st, ['ru', 'title', 'name']) || 'Этап ' + (i + 1), kind),
      why: s2(pick(st, ['why', 'reason'])),
      term: termOf(st, plan),
      marks: marksOf(st, kind),
      cost: num(st.cost),
      priority: num(st.priority),
      to: num(st.to), from: num(st.from),
      locked: !!pick(st, ['blocked', 'locked']),
      wait: deps.length ? deps.map(blockRu).map(x => '«' + x + '»').join(', ') : s2(pick(st, ['waitFor', 'wait'])),
      blockId: s2(pick(st, ['blockId']) || ''),
      lessons: Array.isArray(st.lessons) ? st.lessons : [],
    };
  }
  /* русское имя линии на случай, если модуль назвал её только ключом: латиницы на экране быть не должно */
  const LINE_RU = { review: 'Повторения', sound: 'Звучание', phon: 'Звучание', speak: 'Речь', speech: 'Речь' };
  function lineOf(l, i) {
    const t = s2(pick(l, ['t', 'id', 'key']) || i);
    const ZH = { review: '复', sound: '音', phon: '音', speak: '说', speech: '说' };
    return { t, zh: ZH[t] || '日', ru: s2(pick(l, ['ru', 'title'])) || LINE_RU[t] || 'Ежедневная линия', why: s2(pick(l, ['why', 'reason'])) };
  }

  /* Построение программы — чистый вызов prescribe.js, без кэша: одно и то же состояние
     и один и тот же момент дают один и тот же ответ */
  function built(now) {
    const M = P();
    if (!M || typeof M.build !== 'function') return null;
    try { return M.build(state, now) || null; } catch (e) { return null; }
  }
  function planFrom(raw) {
    if (!raw) return null;
    const plan = {
      at: num(raw.at), level: num(raw.level),
      pace: raw.pace && typeof raw.pace === 'object' ? raw.pace : null,
      horizon: raw.horizon && typeof raw.horizon === 'object' ? raw.horizon : null,
      stages: [], lines: (Array.isArray(raw.lines) ? raw.lines : []).map(lineOf),
    };
    plan.stages = (Array.isArray(raw.stages) ? raw.stages : []).map((st, i) => stageOf(st || {}, i, plan));
    return plan.stages.length || plan.lines.length ? plan : null;
  }
  const planOf = now => planFrom(built(now));

  /* Закрепление меняет только порядок показа, не расчёт */
  function ordered(plan) {
    const p = pinned();
    const list = (plan.stages || []).slice();
    if (!p || !p.stageId) return list;
    const i = list.findIndex(s => s.id === p.stageId);
    if (i <= 0) return list;
    const [s] = list.splice(i, 1);
    return [s].concat(list);
  }
  const isPinned = s => { const p = pinned(); return !!(p && p.stageId === s.id); };

  /* ── три выхода ── */
  const EXITS = [
    { key: 'hot', ru: 'Самое горящее', why: 'наибольший вес в расчёте: просевшее, огни и тонкие места' },
    { key: 'edge', ru: 'Первый по программе', why: 'сроки идут подряд, поэтому раньше прочих заканчивается тот, кто стоит первым' },
    { key: 'cheap', ru: 'Самая дешёвая проверка', why: 'самый дешёвый этап по очкам' },
  ];
  function candidate(key, plan) {
    const open = (plan.stages || []).filter(s => !s.locked);
    if (!open.length) return null;
    /* полный порядок: при равном значении — по месту в программе, чтобы выбор не плавал */
    const by = (f, desc) => open.slice().sort((a, b) => {
      const x = f(a), y = f(b);
      if (x == null && y == null) return a.n - b.n;
      if (x == null) return 1;
      if (y == null) return -1;
      return x === y ? a.n - b.n : (desc ? y - x : x - y);
    })[0];
    if (key === 'hot') return by(s => s.priority, true);
    if (key === 'cheap') return by(s => s.cost, false);
    return by(s => s.to, false);
  }

  /* ── переходы ── */
  function runStage(st) {
    if (!st) return nav('program');
    if (st.kind.id === 'grammar' && st.blockId) return nav('gram', { id: st.blockId });
    if (st.kind.id === 'sound') {
      if (st.lessons.length && actions['phon-open']) return actions['phon-open']({ dataset: { id: st.lessons[0] } });
      return nav('phon');
    }
    if (st.blockId && actions['prog-open']) return actions['prog-open']({ dataset: { id: st.blockId } });
    return nav('program');
  }
  const opensRu = st => (st.kind.id === 'grammar' ? 'откроется правило блока'
    : st.kind.id === 'sound' ? 'откроется урок звучания' : 'откроется лента блока');

  /* ── выпуск: публикуем при открытии программы, решает сам prescribe.js ── */
  function publishIfDue(raw, now) {
    const M = P();
    if (!M || typeof M.publish !== 'function' || !raw) return;
    const keep = pinned();
    /* прошлый выпуск кладём рядом целиком (только at и stages, без вложенности): разницу
       «Что изменилось» пересчитывает из двух снимков каждый раз, а не хранит готовой */
    let before = null;
    try { before = typeof M.route === 'function' ? M.route(state) : null; } catch (e) { before = null; }
    const was = hasStages(before) ? { at: num(before.at), stages: before.stages } : null;
    let res = null;
    try { res = M.publish(state, raw, now); } catch (e) { return; }
    if (!res || !res.publish) return;
    const box = routeBox();                  /* снимок встал на место прежнего — возвращаем выбор владельца */
    if (keep) box.pinned = keep;
    if (was) box.prev = was;
    persist();
  }

  /* ── разметка ── */
  const head = (title, sub) => `<div class="vh"><button class="icon-btn" data-back aria-label="Назад">‹</button><div class="seal">程</div>
    <div class="grow"><h1 class="title">${esc(title)}</h1><div class="sub">${esc(sub)}</div></div></div>`;

  const offPanel = () => `${head('Программа на недели', '处方 · предписание')}
    <div class="panel"><div class="flabel">Это часть тестовой методики</div>
      <div class="hint" style="margin-top:0">Программа собирается по тестовой книге учёта: она считает очки, шаг за день и то, что просело. Сейчас открыта текущая книга — переключить можно в настройках, прогресс при этом сохраняется.</div>
      <div class="btns mt0"><button class="btn btn-primary btn-block" data-go="settings">В настройки</button></div></div>`;

  const waitPanel = why => `${head('Программа на недели', '处方 · предписание')}
    <div class="panel"><div class="flabel">Программа готовится</div>
      <div class="hint" style="margin-top:0">${esc(why)}</div>
      <div class="btns mt0"><button class="btn btn-primary btn-block" data-action="flow-open" data-nosound>В поток</button>
      <button class="btn btn-secondary btn-block" data-go="home">На главную</button></div></div>`;

  function topPanel(plan) {
    const h = plan.horizon;
    const n = (plan.stages || []).length;
    /* горизонт подписан тем же шагом, что и строка «Темп» ниже: хвост снимаем, чтобы одна и та
       же оговорка не стояла дважды подряд */
    const tail = plan.pace && plan.pace.ru ? ' · ' + s2(plan.pace.ru) : '';
    let hru = s2(h && h.ru);
    if (tail && hru.length > tail.length && hru.slice(-tail.length) === tail) hru = hru.slice(0, -tail.length);
    const goal = `<div class="rt-goal">${esc(pl(n, 'этап', 'этапа', 'этапов'))}${hru ? ' — ' + esc(hru) : ' в горизонте'}</div>`;
    const empty = !((state.attempts || []).length);
    const lvl = plan.level != null
      ? `<div class="hint">Рабочий уровень — HSK ${plan.level}: блоки ниже него догоняем, выше — откладываем.${empty ? ' Занятий в журнале пока нет, поэтому уровень взят начальным, а не измерен.' : ''} Дальше горизонта программа не загадывает: он пересобирается после каждого закрытого этапа.</div>` : '';
    const cap = dayCap();
    const over = plan.pace && plan.pace.measured && num(plan.pace.perDay) > cap
      ? `<div class="rt-src">Это выше дневной нормы ${cap} — столько выходило в те дни, когда вы закрывали блоки. Сроки посчитаны по этому шагу, и держать его каждый день не обязательно.</div>` : '';
    const pace = plan.pace && plan.pace.perDay != null
      ? `<div class="rt-pace">Темп: <b>${plan.pace.perDay} ${esc(noun(plan.pace.perDay, 'очко', 'очка', 'очков'))} в день</b> <span class="rt-src">— ${esc(s2(plan.pace.ru) || (plan.pace.measured ? 'по вашему шагу' : 'по расчёту'))}</span>${over}</div>` : '';
    /* чего разбор не видит — говорим сразу, а не оставляем гадать */
    const blind = `<div class="hint rt-src rt-blind">Программа считает только по журналу занятий. Она не видит, что вы читали, слушали или говорили вне приложения, и не знает вашего расписания — поэтому срок каждого этапа стоит диапазоном, а не датой.</div>`;
    return `<div class="panel ornate rt-top"><div class="flabel">Цель и темп</div>${goal}${lvl}${pace}${blind}
      <div class="btns mt0"><button class="btn btn-secondary btn-block" data-go="route-diff">Что изменилось</button></div></div>`;
  }

  function exitsPanel(plan) {
    const p = pinned();
    const btns = EXITS.map(e => {
      const c = candidate(e.key, plan);
      const on = p && p.exit === e.key && c && p.stageId === c.id ? ' on' : '';
      return `<button class="rt-exit${on}" data-action="route-exit" data-exit="${esc(e.key)}" ${c ? '' : 'disabled'}>
        <b>${esc(e.ru)}</b><small>${esc(c ? c.title : 'подходящего этапа нет')}</small><small class="rt-src">${esc(e.why)}</small></button>`;
    }).join('');
    const cur = p && p.stageId ? (plan.stages || []).find(s => s.id === p.stageId) : null;
    const gone = !!(p && p.stageId && !cur);
    return `<div class="panel rt-exits"><div class="flabel">Три выхода</div>
      <div class="hint" style="margin-top:0">Выбор ставит этап первым в списке и ведёт в него завтра. На очки, цену и порядок расчёта это не влияет. Выходы считаются по разным меркам и нередко сходятся на одном этапе — тогда выбор просто подтверждает его.</div>
      <div class="rt-exit-row">${btns}</div>
      ${cur || gone ? `<div class="hint rt-pinned">${cur
        ? 'Закреплён этап ' + cur.n + ' · ' + esc(cur.title) + (p.at ? ' · с ' + esc(dayOf(p.at)) : '')
        : 'Закреплённого этапа в программе больше нет — он закрыт или вытеснен.'}
        <button class="btn btn-secondary btn-sm" data-action="route-unpin">Снять закрепление</button></div>` : ''}</div>`;
  }

  function stageRow(st, first) {
    const cls = 'panel rt-stage k-' + st.kind.id + (st.locked ? ' rt-locked' : '') + (isPinned(st) ? ' rt-pin' : '');
    const term = st.term
      ? `<div class="rt-term">Срок: <b>${esc(st.term.ru)}</b>${st.term.work != null ? ' · работы на ' + esc(pl(st.term.work, 'день', 'дня', 'дней')) : ''}
         ${st.term.why ? `<div class="rt-src">${esc(st.term.why)}</div>` : ''}</div>`
      : '<div class="rt-term rt-src">Срок программа не назвала</div>';
    const marks = st.marks.length
      ? `<div class="rt-marks">${st.marks.map(m => `<div class="rt-mark">${esc(m)}</div>`).join('')}</div>` : '';
    const act = st.locked
      ? `<div class="rt-wait">ждёт: ${esc(st.wait || 'причина не названа')}</div>`
      : first
        ? `<div class="btns mt0"><button class="btn btn-primary btn-block" data-action="route-start" data-id="${esc(st.id)}">Начать</button></div>
           <div class="hint rt-opens">${esc(opensRu(st))}</div>`
        : `<button class="btn btn-secondary btn-sm" data-action="route-start" data-id="${esc(st.id)}">Открыть</button>`;
    return `<div class="${cls}">
      <div class="rt-head"><span class="rt-n">${st.n}</span>
        <div class="grow"><div class="rt-t">${st.kind.zh ? `<span class="zh">${esc(st.kind.zh)}</span> ` : ''}${esc(st.title)}</div>
        <div class="rt-sub">${esc(st.kind.ru)} — ${esc(st.kind.hint)}</div></div>
        ${isPinned(st) ? '<span class="badge rt-badge">закреплён первым</span>' : ''}</div>
      ${st.why ? `<div class="rt-why">${esc(st.why)}</div>` : ''}
      ${term}${marks}${act}</div>`;
  }

  function linesPanel(plan) {
    if (!plan.lines.length) {
      return `<div class="panel"><div class="flabel">Ежедневные линии</div>
        <div class="hint" style="margin-top:0">Ежедневных линий программа не назвала.</div></div>`;
    }
    return `<div class="panel rt-daily"><div class="flabel">Ежедневные линии</div>
      <div class="hint" style="margin-top:0">Идут каждый день рядом с этапом и съедают часть дневной нормы (${dayCap()} очков) — поэтому срок этапа считается не по всей норме, а по остатку.</div>
      ${plan.lines.map(l => `<div class="row rt-day"><div><div class="row-t"><span class="zh">${esc(l.zh)}</span> ${esc(l.ru)}</div>
        ${l.why ? `<div class="row-s">${esc(l.why)}</div>` : ''}</div></div>`).join('')}</div>`;
  }

  /* одноразовая передача из render в mount: выпускаем ровно тот расчёт, который человек увидел,
     а не второй такой же на миллисекунду позже. Значение съедается в mount и показ не переживает,
     поэтому это передача, а не кэш: от порядка вызовов результат не зависит */
  let handoff = null;

  views['route'] = {
    render() {
      handoff = null;
      if (!is2()) return offPanel();
      const now = Date.now();
      const raw = built(now);
      handoff = { now, raw };
      const plan = planFrom(raw);
      if (!plan) {
        return waitPanel(P()
          ? 'Открытых блоков в программе не осталось или истории пока слишком мало. Позанимайтесь несколько дней — этапы появятся сами.'
          : 'Модуль программы ещё не собран. Экран покажет этапы, как только он появится.');
      }
      const list = ordered(plan);
      return `${head('Программа на недели', '处方 · предписание')}
      ${topPanel(plan)}
      ${exitsPanel(plan)}
      ${list.length ? `<h2 class="h2">Этапы</h2>${list.map((s, i) => stageRow(s, i === 0 && !s.locked)).join('')}` : ''}
      ${linesPanel(plan)}`;
    },
    /* Выпуск программы — после показа: publish() сам решит, менять ли снимок */
    mount() {
      if (!is2()) return;
      const h = handoff; handoff = null;
      const now = h ? h.now : Date.now();
      publishIfDue(h ? h.raw : built(now), now);
    },
  };

  /* ── что изменилось ── */
  const SIGN = { '↑': 'up', '↓': 'down', '+': 'add', '−': 'out', '-': 'out', '=': 'same' };
  const SIGN_RU = { up: 'поднялось', down: 'опустилось', add: 'добавлено', out: 'убрано', same: 'без изменений' };
  /* Две разные правды, и обе нужны:
       • что сменил последний выпуск — разница прошлого снимка и нынешнего;
       • что накопилось после него — разница нынешнего снимка и того, что считается прямо сейчас.
     Раньше показывали только вторую, а её сразу после выпуска нет по определению: экран отвечал
     «ни одна строка не поменялась» в тот самый день, когда программа сменилась целиком.
     Обе считаются заново из двух снимков — ничего производного не хранится. */
  function rowsOf(M, a, b) {
    let rows = null;
    try { rows = M.diff(a, b); } catch (e) { return []; }
    return (Array.isArray(rows) ? rows : []).map(r => {
      const sign = s2(pick(r, ['sign', 'dir'])).trim();
      return { sg: SIGN[sign] || 'same', sign: sign || '=', ru: s2(pick(r, ['ru', 'title'])), why: s2(pick(r, ['why', 'reason'])) };
    }).filter(r => r.ru);
  }
  function diffOf(now) {
    const M = P();
    if (!M || typeof M.diff !== 'function' || typeof M.route !== 'function') return null;
    let cur = null, next = null;
    try { cur = M.route(state); next = built(now); } catch (e) { return null; }
    if (!next) return null;
    const live = hasStages(cur);
    const prev = (live && cur.prev && hasStages(cur.prev)) ? cur.prev : null;
    return {
      first: !live,
      at: live ? num(cur.at) : null,
      prevAt: prev ? num(prev.at) : null,
      released: live && prev ? rowsOf(M, prev, cur) : null,
      since: live ? rowsOf(M, cur, next) : [],
      hyst: num(M.HYST) != null ? Math.round(num(M.HYST) * 100) : null,
    };
  }

  const diffRows = rows => rows.map(r => `<div class="rt-diff d-${r.sg}">
    <span class="rt-dir" title="${esc(SIGN_RU[r.sg])}">${esc(r.sign)}</span>
    <div><div class="rt-diff-t">${esc(r.ru)}</div>${r.why ? `<div class="rt-diff-w">${esc(r.why)}</div>` : ''}</div></div>`).join('');

  views['route-diff'] = {
    render() {
      if (!is2()) return offPanel();
      const d = diffOf(Date.now());
      const back = '<div class="btns"><button class="btn btn-primary btn-block" data-go="route">К программе</button></div>';
      if (!d) {
        return `${head('Что изменилось', '处方 · сравнение выпусков')}
        <div class="panel"><div class="flabel">Сравнивать пока не с чем</div>
          <div class="hint" style="margin-top:0">Программа ещё не собрана — сравнивать нечего.</div></div>${back}`;
      }
      if (d.first) {
        return `${head('Что изменилось', '处方 · сравнение выпусков')}
        <div class="panel"><div class="flabel">Выпусков ещё не было</div>
          <div class="hint" style="margin-top:0">Программа выпускается сама, когда вы открываете её экран. С первого выпуска здесь будет видно, что и почему поменялось.</div></div>${back}`;
      }
      const legend = 'Знак слева говорит, что случилось со строкой: ↑ выше, ↓ ниже, + появилось, − ушло, = осталось на месте.';
      const relDate = d.at ? dayOf(d.at) : '';
      const relHead = relDate ? 'Последний выпуск — ' + relDate + '.' : 'Дату последнего выпуска программа не назвала.';
      const rel = d.released == null
        ? `<div class="hint" style="margin-top:0">${esc(relHead)} Он был первым — сравнивать было не с чем.</div>`
        : `<div class="hint" style="margin-top:0">${esc(relHead + (d.prevAt ? ' Предыдущий — ' + dayOf(d.prevAt) + '.' : '') + ' ' + legend)}</div>
           ${d.released.length ? diffRows(d.released) : '<div class="hint">Порядок и сроки этапов выпуск не сдвинул.</div>'}`;
      const hyst = d.hyst != null
        ? ' Программа меняется не каждый день: пока накопленный сдвиг меньше ' + d.hyst + '%, выпуск остаётся прежним.'
        : ' Программа меняется не каждый день: мелкие сдвиги выпуск не трогают.';
      const since = d.since.length
        ? diffRows(d.since)
        : `<div class="hint">С выпуска расчёт не сдвинулся.</div>`;
      return `${head('Что изменилось', '处方 · сравнение выпусков')}
      <div class="panel"><div class="flabel">Что сменил последний выпуск</div>${rel}</div>
      <div class="panel"><div class="flabel">Что накопилось после него</div>
        <div class="hint" style="margin-top:0">Это ещё не выпущено: так программа выглядела бы, собери её прямо сейчас.${esc(hyst)}</div>
        ${since}</div>${back}`;
    },
  };

  /* ── действия ── */
  actions['route-start'] = el => {
    const plan = planOf(Date.now());
    const st = plan ? (plan.stages || []).find(s => s.id === el.dataset.id) : null;
    if (!st) return toast('Этап не найден');
    if (st.locked) return toast('Этап ждёт: ' + (st.wait || 'причина не названа'));
    runStage(st);
  };
  actions['route-exit'] = el => {
    if (!is2()) return nav('settings');
    const key = el.dataset.exit;
    const plan = planOf(Date.now());
    const st = plan ? candidate(key, plan) : null;
    if (!st) return toast('Для этого выхода этап не нашёлся');
    routeBox().pinned = { exit: key, stageId: st.id, at: Date.now() };
    persist();
    render();
    toast('Закреплён этап ' + st.n + ' · ' + st.title);
  };
  actions['route-unpin'] = () => {
    /* читаем, а не создаём: routeBox() завёл бы пустой снимок, и «Что изменилось» приняло бы его за выпуск */
    const b = (((state.settings || {}).v2 || {}).route) || null;
    if (!b || !b.pinned) return;
    delete b.pinned;
    persist();
    render();
  };

  /* ── панель на главной ── */
  function homePanel() {
    if (!is2()) return '';
    const plan = planOf(Date.now());
    if (!plan) return '';
    const st = ordered(plan)[0];
    if (!st) return '';
    const term = st.term ? 'Срок: ' + st.term.ru + (st.term.why ? ' · ' + st.term.why : '') : 'Срок программа не назвала';
    return `<div class="panel rt-home k-${st.kind.id}">
      <div class="flabel">Программа · 处方</div>
      <div class="rt-t">${st.kind.zh ? `<span class="zh">${esc(st.kind.zh)}</span> ` : ''}${esc(st.title)}</div>
      <div class="rt-sub">этап ${st.n} из ${(plan.stages || []).length} · ${esc(st.kind.ru)}${isPinned(st) ? ' · закреплён' : ''}</div>
      ${st.why ? `<div class="rt-why">${esc(st.why)}</div>` : ''}
      <div class="hint rt-term">${esc(term)}</div>
      ${st.locked
        ? `<div class="rt-wait">ждёт: ${esc(st.wait || 'причина не названа')}</div>
           <div class="btns mt0"><button class="btn btn-secondary btn-block" data-go="route">Вся программа</button></div>`
        : `<div class="btns mt0"><button class="btn btn-primary btn-block" data-action="route-start" data-id="${esc(st.id)}">Начать</button>
           <button class="btn btn-secondary btn-block" data-go="route">Вся программа</button></div>
           <div class="hint rt-opens">${esc(opensRu(st))}</div>`}</div>`;
  }

  return { homePanel, planOf, diffOf, ordered, candidate, EXITS };
})();
