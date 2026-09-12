/* Экран донесения: тема, запись, сверка, встречный вопрос, разбор «На полях».

   Раз в день, около четырёх минут. Человек рассказывает по теме дня, сверяет
   распознанное слово за словом, отвечает на один встречный вопрос без подготовки
   и читает разбор.

   Экран относится к тестовой методике: в текущей книге учёта он показывает короткую
   панель и дорогу в настройки.

   Что здесь своё, а что чужое. Считает не этот файл: тему, разбор, случаи, переходы
   огней и цену считает Report; речь слушает SpeechIn. Оба модуля пишутся отдельно,
   поэтому обращение к ним мягкое: без Report экран честно говорит, что режим готовится,
   без SpeechIn остаётся честный набор с клавиатуры — и на экране сказано, почему.
   Своего здесь три вещи: сверка чипами, встречный вопрос и показ.

   Встречный вопрос берётся из примеров грамматики того же блока программы, а не
   придумывается: своих китайских фраз этот файл не сочиняет. Нет в блоке вопроса —
   шаг честно пропускается.

   Закон модуля: всё производное — чистая функция от журнала и явных аргументов.
   Разбор, правки и разбивка цены лежат в самой попытке как запись о том, что произошло;
   переходы огней НИГДЕ не хранятся как источник правды, а пересчитываются Report.moves
   из журнала — реестр без этой попытки и с ней. Fires.compute сортирует случаи по (ts, id),
   поэтому порядок чтения журнала ни на что не влияет и пересчёт с нуля даёт то же самое. */
window.ReportUI = (() => {
  const { state, views, actions, nav, esc, attr, uid, toast, persist, persistNow, render, saveAttempt, fmt, sheet, closeSheet, LABELS } = App;

  /* Подпись режима для чужих экранов: без неё в списке попыток была бы латиница */
  if (LABELS && LABELS.mode && !LABELS.mode.report) LABELS.mode.report = 'Донесение';
  /* Подписи «сложности» у донесения нет намеренно: difficulty здесь равен режиму,
     и строка попытки иначе читалась бы как «Донесение · Донесение». */

  const is2 = () => !!(window.Ledger && Ledger.is2(state));
  const R = () => window.Report || null;
  const has = () => !!window.Report;
  const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);
  const str = v => (v == null ? '' : String(v));
  const CJK = /[一-鿿㐀-䶿]/;

  const PREP_SEC = 30;                      /* подготовка — можно пропустить */
  const ASK_SEC = 20;                       /* встречный вопрос: 15–20 секунд без подготовки */
  const LONG_MS = 520;                      /* долгий тап по чипу — убрать слово */
  const EDIT_LIMIT = 0.1;                   /* правок больше десятой части — половинный вес разбора */

  /* ── распознавание ── */
  const SI = () => window.SpeechIn || null;
  function recAvailable() {
    const S = SI();
    if (!S || typeof S.available !== 'function') return false;
    try { return !!S.available(); } catch (e) { return false; }
  }
  const recWhy = () => (SI() ? 'Этот браузер не даёт приложению распознавание речи.' : 'Модуль распознавания в эту сборку ещё не вошёл.');
  /* Браузер отдаёт сетевые сбои по-английски («Failed to fetch»). В русском тексте им не место:
     что не по-русски — то и не причина, о которой можно сказать человеку. */
  const whyRu = e => { const t = str(e).trim(); return /[а-яё]/i.test(t) ? t : ''; };

  /* ── слова: иероглифы → карточка ──
     Словарь собирается заново на каждый разбор текста и не кэшируется: кэш по числу
     карточек врал бы после правки колоды с тем же их количеством. Ключи перебираются
     отсортированными — иначе при двух карточках с одним и тем же написанием побеждала бы
     та, что раньше легла в память, и разбивка зависела бы от порядка загрузки. */
  function hanIndex() {
    const idx = App.cardIndex || {};
    const out = Object.create(null);
    for (const id of Object.keys(idx).sort()) { const c = idx[id]; if (c && c.hanzi && !out[c.hanzi]) out[c.hanzi] = c; }
    return out;
  }
  const byHanzi = (h, han) => (han || hanIndex())[h] || null;

  /* ── разбивка на куски для сверки ──
     Жадно: самое длинное слово, которое есть в словаре приложения, дальше по одному знаку.
     Пунктуация и латиница остаются кусками-связками: чипами они не становятся, но и не
     пропадают — разбору важно, где кончилась фраза. */
  function segsFrom(text) {
    const han = hanIndex();                 /* один словарь на весь разбор: иначе это тысячи пересборок */
    const s = str(text), out = [];
    let i = 0, glue = '';
    const flush = () => { if (glue) { out.push({ t: glue, cjk: false }); glue = ''; } };
    while (i < s.length) {
      if (!CJK.test(s[i])) { glue += s[i]; i++; continue; }
      flush();
      let take = s[i], card = null;
      for (let n = Math.min(4, s.length - i); n >= 1; n--) {
        const part = s.slice(i, i + n);
        if (!/^[一-鿿㐀-䶿]+$/.test(part)) continue;
        const c = byHanzi(part, han);
        if (c) { take = part; card = c; break; }
        if (n === 1) { take = part; card = null; }
      }
      out.push({ t: take, cjk: true, card });
      i += take.length;
    }
    flush();
    return out.map((x, k) => ({
      i: k, t: x.t, orig: x.t, cjk: !!x.cjk, card: x.card || null,
      cardId: x.card ? x.card.id : null, py: x.card ? x.card.pinyin : '', ru: x.card ? x.card.ru : '',
      edited: false, removed: false,
    }));
  }
  const textOf = segs => segs.filter(s => !s.removed).map(s => s.t).join('');
  const chips = segs => segs.filter(s => s.cjk);
  function editShare(segs) {
    const c = chips(segs);
    if (!c.length) return 0;
    return c.filter(s => s.edited || s.removed).length / c.length;
  }
  const doubtfulOf = segs => chips(segs).filter(s => s.edited).map(s => s.t).filter(Boolean);

  /* ── тема и встречный вопрос ── */
  const topicOf = (now = Date.now()) => { try { return R().topic(state, now) || null; } catch (e) { return null; } };
  const canToday = (now = Date.now()) => { try { return R().canToday(state, now); } catch (e) { return true; } };
  const softOf = t => num((t.sec || [])[0]) || 45;
  const hardOf = t => num((t.sec || [])[1]) || 90;

  /* Вопрос наставника — настоящий пример из грамматики блока, а не сочинённая фраза.
     Нет вопросительного примера — шага не будет, и это сказано на экране. */
  function askOf(topic) {
    const q = (() => { const f = R() && R().question; return typeof f === 'function' ? f(state, topic) : null; })();
    if (q && (q.zh || q.ru)) return { zh: str(q.zh), py: str(q.py || q.pinyin), ru: str(q.ru), from: '' };
    const b = window.PROGRAM && PROGRAM.byId ? PROGRAM.byId(topic && topic.block) : null;
    const ex = (b && b.g && Array.isArray(b.g.ex)) ? b.g.ex : [];
    const hit = ex.find(e => Array.isArray(e) && /[？?]/.test(str(e[0])));
    return hit ? { zh: str(hit[0]), py: str(hit[1]), ru: str(hit[2]), from: str(b.ru) } : null;
  }

  /* ── попытки этого режима ──
     Журнал в память ложится как придётся, поэтому «последнее донесение за сегодня» берётся
     из отсортированного списка: сначала по времени, при совпадении — по id. Без этого один
     и тот же журнал давал бы разный ответ от запуска к запуску. */
  const byTsId = (x, y) => (num(x.ts) - num(y.ts)) || (str(x.id) < str(y.id) ? -1 : str(x.id) > str(y.id) ? 1 : 0);
  const reports = () => (state.attempts || []).filter(a => a && a.mode === 'report' && !a.aborted).slice().sort(byTsId);
  function doneToday(now = Date.now()) {
    const key = R() && R().dayKey ? R().dayKey(now) : new Date(now).toISOString().slice(0, 10);
    const k = a => (R() && R().dayKey ? R().dayKey(a.ts) : new Date(a.ts).toISOString().slice(0, 10));
    const day = reports().filter(a => a.ts && k(a) === key);
    return day.length ? day[day.length - 1] : null;
  }
  const pointsOf = a => (window.Ledger && Ledger.ptsOf ? Ledger.ptsOf(a) : num(a && a.points));

  /* ── ход экрана ──
     rp — черновик одного захода, только для показа. Источник правды — журнал. */
  let rp = null, again = false, tick = null;

  const stopTick = () => { if (tick) { clearInterval(tick); tick = null; } };
  function stopRec() { const S = SI(); if (S && typeof S.stop === 'function') try { S.stop(); } catch (e) { /* уже стоит */ } }
  function reset() { stopTick(); if (rp && rp.listening) stopRec(); rp = null; again = false; }
  const elapsed = () => Math.max(0, Math.floor((Date.now() - ((rp && rp.at) || Date.now())) / 1000));
  const secs = n => fmt.plural(Math.round(n), 'секунда', 'секунды', 'секунд');

  /* ── куски экрана ── */
  const head = sub => `<div class="vh"><button class="icon-btn" data-back>‹</button><div class="grow"><h1 class="title">Донесение</h1><div class="sub">报 · ${esc(sub)}</div></div></div>`;
  const backBtn = '<div class="btns"><button class="btn btn-secondary btn-block" data-go="home">На главную</button></div>';

  const privacy = () => {
    const miss = (() => { try { return R().whatVoiceMisses() || []; } catch (e) { return []; } })();
    return `<div class="panel rp-priv"><div class="flabel">Что уходит и что остаётся</div>
      <div class="hint" style="margin-top:0">Текст донесения уходит на сервер разбора — иначе разбирать его некому. Звук туда не уходит: в слова его превращает сам телефон.</div>
      <div class="hint">Запись, правки и разбор остаются на этом устройстве и никуда больше не копируются.</div>
      ${miss.length ? `<div class="flabel mt">Чего разбор не видит</div><ul class="rp-list">${miss.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}</div>`;
  };

  const notReady = () => head('режим готовится') + `<div class="panel"><div class="flabel">Режим готовится</div>
    <div class="hint" style="margin-top:0">Донесение собирают отдельно: тема, разбор и счёт случаев живут в своём модуле, и в эту сборку он ещё не вошёл. Экран открывается, но начинать нечего.</div></div>` + backBtn;

  const v1Panel = () => head('тестовая методика') + `<div class="panel"><div class="flabel">Это часть тестовой методики</div>
    <div class="hint" style="margin-top:0">Донесение считается по тестовой книге учёта. Сейчас открыта текущая — переключить можно в настройках, ничего при этом не теряется.</div>
    <div class="btns mt0"><button class="btn btn-primary btn-block" data-go="settings">В настройки</button></div></div>`;

  /* Одна строка про итог: без случаев «0 из 0» и «0 %» читались бы как «всё мимо» */
  function saidOf(a) {
    if (a.net === 'fail') return 'Разбор к нему не дошёл; очки за усилие +' + Math.round(pointsOf(a)) + '.';
    if (!a.total) return 'Разбор прошёл, но ни одна конструкция из мишеней в записи не понадобилась — считать было нечего. Очков +' + Math.round(pointsOf(a)) + '.';
    return 'Случаев вышло ' + a.correct + ' из ' + a.total + ', очков +' + Math.round(pointsOf(a)) + '.';
  }
  function doneTodayPanel(a) {
    return head('сегодня уже сделано') + `<div class="panel"><div class="flabel">Донесение за сегодня сдано</div>
      <div class="hint" style="margin-top:0">${esc(saidOf(a))} Между донесениями нужен день: второе за сутки мало что покажет.</div>
      <div class="btns mt0">
        <button class="btn btn-primary btn-block" data-go="report-result" data-params="${attr({ id: a.id })}">Посмотреть разбор</button>
        <button class="btn btn-secondary btn-block" data-action="rp-again">Всё равно сделать ещё одно</button>
        <button class="btn btn-secondary btn-block" data-go="home">На главную</button></div></div>`;
  }

  /* 1. Тема */
  function stTopic() {
    const t = rp.topic;
    const hints = (t.hints || []).map(zh => { const c = byHanzi(zh); return { zh, py: c ? c.pinyin : '', ru: c ? c.ru : '' }; });
    const rec = recAvailable();
    return head('тема дня') + `
      <div class="panel ornate rp-topic">
        <div class="flabel">Что рассказать</div>
        <div class="rp-task">${esc(t.ru)}</div>
        ${t.can ? `<div class="hint rp-can">Умение блока: ${esc(t.can)}</div>` : ''}
      </div>
      <div class="panel"><div class="flabel">Три опоры</div>
        ${hints.length ? `<div class="rp-props">${hints.map(w => `<div class="rp-prop"><span class="zh">${esc(w.zh)}</span><i>${esc(w.py)}</i><small>${esc(w.ru)}</small></div>`).join('')}</div>`
          : '<div class="hint">Опорных слов к этой теме нет.</div>'}
        <div class="hint">Опоры — подсказка, о чём говорить, а не список для вставки.</div></div>
      <div class="panel"><div class="flabel">Сколько говорить</div>
        <div class="hint" style="margin-top:0">Мягкий предел — ${esc(secs(softOf(t)))}: после него донесение можно закончить в любой момент. Жёсткий — ${esc(secs(hardOf(t)))}: на нём запись остановится сама.${t.minChars ? ' Оплата идёт за знаки, а не за секунды: минимум ' + t.minChars + '.' : ''}</div>
        ${rec ? '' : `<div class="rp-warn">Распознавания речи сейчас нет. ${esc(recWhy())} Поэтому донесение набирается с клавиатуры 中文 — это честный способ, он считается наравне с речью.</div>`}
        <div class="btns mt0">
          <button class="btn btn-secondary btn-block" data-action="rp-prep">Подготовиться ${PREP_SEC} секунд</button>
          ${rec ? '<button class="btn btn-primary btn-block" data-action="rp-go">Говорю</button><button class="btn btn-secondary btn-sm btn-block" data-action="rp-write">Лучше написать</button>'
            : '<button class="btn btn-primary btn-block" data-action="rp-write">Написать</button>'}
        </div></div>
      ${privacy()}`;
  }

  /* 2. Подготовка */
  const stPrep = () => head('подготовка') + `
    <div class="panel ornate rp-clockbox"><div class="flabel">Подготовка</div>
      <div class="rp-clock" id="rp-clock">${PREP_SEC}</div>
      <div class="hint">Подумайте, с чего начать. Записывать нечего — это и есть подготовка.</div></div>
    <div class="panel"><div class="rp-task">${esc(rp.topic.ru)}</div>
      ${(rp.topic.hints || []).length ? `<div class="rp-props sm">${rp.topic.hints.map(zh => `<div class="rp-prop"><span class="zh">${esc(zh)}</span></div>`).join('')}</div>` : ''}
      <div class="btns mt0"><button class="btn btn-primary btn-block" data-action="rp-go">Готов, начинаю</button></div></div>`;

  /* 3. Запись */
  function stRec() {
    const t = rp.topic, typed = rp.typed;
    const body = typed
      ? `<textarea class="rp-input" id="rp-text" rows="5" placeholder="中文…" spellcheck="false">${esc(rp.raw)}</textarea>
         <div class="hint">В наборе предела по времени нет: набирать иероглифы дольше, чем говорить.</div>`
      : `<div class="rp-live" id="rp-live">${esc(rp.live) || '<i>…</i>'}</div>
         <div class="hint">Живой транскрипт: телефон дописывает его по ходу речи. Ошибки узнавания поправим на следующем шаге.</div>`;
    return head(typed ? 'набор' : 'запись') + `
      <div class="panel ornate rp-clockbox">
        <div class="rp-clock" id="rp-clock">0:00</div>
        ${typed ? '<div class="hint">Время идёт, но ничего не обрывает.</div>'
          : `<div class="hint">Мягкий предел ${esc(secs(softOf(t)))}, жёсткий ${esc(secs(hardOf(t)))}.</div>
             <div class="rp-bar"><i id="rp-bar" style="width:0%"></i></div>`}
      </div>
      <div class="panel"><div class="flabel">${esc(t.ru)}</div>${body}
        ${rp.recErr ? `<div class="rp-warn">${esc(rp.recErr)} Наберите донесение с клавиатуры — это засчитывается наравне с речью.</div>` : ''}
        <div class="btns mt0"><button class="btn btn-primary btn-block" data-action="rp-done">Готово</button>
          <button class="btn btn-secondary btn-sm btn-block" data-action="rp-quit">Прервать</button></div></div>`;
  }

  /* 4. Сверка */
  const chipHtml = s => `<button class="rp-chip${s.removed ? ' rp-out' : ''}${s.edited ? ' rp-doubt' : ''}" data-action="rp-chip" data-i="${s.i}" data-nosound><span class="zh">${esc(s.t)}</span>${s.py ? `<i>${esc(s.py)}</i>` : ''}</button>`;
  function stCheck() {
    const cs = chips(rp.segs);
    const share = editShare(rp.segs);
    const half = share > EDIT_LIMIT;
    const kept = cs.filter(s => !s.removed);
    const size = (() => { try { return R().size(textOf(rp.segs)).chars; } catch (e) { return kept.length; } })();
    const min = num(rp.topic.minChars);
    return head('сверка') + `
      <div class="panel ornate">
        <div class="flabel">Что услышал телефон</div>
        ${cs.length ? `<div class="rp-chips" id="rp-chips">${cs.map(chipHtml).join('')}</div>`
          : '<div class="hint">Иероглифов в записи не нашлось — сверять нечего.</div>'}
        <div class="hint">Тап — поправить слово, долгий тап — убрать его совсем.</div>
      </div>
      <div class="panel"><div class="flabel">Правки</div>
        <div class="hint" style="margin-top:0">Правок ${cs.filter(s => s.edited || s.removed).length} из ${cs.length} · знаков ${size}${min ? ' из ' + min + ' нужных' : ''}</div>
        <div class="hint">Поправленное слово помечается «сомнительно»: неизвестно, вы так сказали или так услышал телефон. В счёт огней оно не идёт.</div>
        ${half ? '<div class="rp-warn">Правок больше десятой части. Разбор пойдёт с половинным весом: очки за него будут вдвое меньше.</div>' : ''}
        ${min && size < min ? `<div class="rp-warn">Знаков меньше нормы. Плата за монолог начисляется от ${min} знаков — сейчас её не будет.</div>` : ''}
        <div class="btns mt0">
          <button class="btn btn-primary btn-block" data-action="rp-ask"${kept.length ? '' : ' disabled'}>Дальше · встречный вопрос</button>
          <button class="btn btn-secondary btn-sm btn-block" data-action="rp-quit">Прервать</button></div></div>`;
  }

  /* 5. Встречный вопрос */
  function stAsk() {
    const q = rp.ask;
    if (!q) return head('встречный вопрос') + `<div class="panel"><div class="flabel">Встречного вопроса сегодня нет</div>
      <div class="hint" style="margin-top:0">Вопрос берётся из примеров грамматики блока, и вопросительного примера в нём нет. Своих китайских фраз экран не сочиняет, поэтому шаг пропускаем.</div>
      <div class="btns mt0"><button class="btn btn-primary btn-block" data-action="rp-send">К разбору</button></div></div>`;
    const typed = rp.typed || !recAvailable();
    return head('встречный вопрос') + `
      <div class="panel ornate rp-askbox"><div class="flabel">Наставник спрашивает</div>
        <div class="rp-q-zh">${esc(q.zh)}</div>
        ${q.py ? `<div class="rp-q-py">${esc(q.py)}</div>` : ''}
        ${q.ru ? `<div class="rp-q-ru">${esc(q.ru)}</div>` : ''}
        <button class="btn btn-secondary btn-sm" data-action="rp-say" data-nosound>Ещё раз</button>
        ${q.from ? `<div class="hint">Фраза из блока «${esc(q.from)}».</div>` : ''}</div>
      <div class="panel"><div class="flabel">Ответ${typed ? '' : ' · ' + esc(secs(ASK_SEC))}</div>
        <div class="rp-clock sm" id="rp-clock">0:00</div>
        ${typed ? '<div class="hint" style="margin-top:0">В наборе ответ ничем не обрывается: набирать иероглифы дольше, чем говорить. Голосом на него уходит ' + esc(secs(ASK_SEC)) + '.</div>' : ''}
        ${typed ? `<textarea class="rp-input" id="rp-ans" rows="2" placeholder="中文…" spellcheck="false">${esc(rp.ansRaw)}</textarea>`
          : `<div class="rp-live" id="rp-live">${esc(rp.ansLive) || '<i>…</i>'}</div>`}
        <div class="hint">Подготовки здесь нет: отвечать нужно сразу. Огни гасит только спонтанный ответ и честный набор — правленое в сверке в счёт не идёт.</div>
        <div class="btns mt0"><button class="btn btn-primary btn-block" data-action="rp-send">Готово</button></div></div>`;
  }

  const stSend = () => head('разбор') + `<div class="panel ornate"><div class="flabel">Разбор</div>
    <div class="hint" style="margin-top:0">Текст ушёл на сервер разбора. Это несколько секунд.</div>
    <div class="rp-bar indet"><i></i></div></div>`;

  views.report = {
    render() {
      if (!has()) return notReady();
      if (!is2()) return v1Panel();
      if (!rp) {
        if (!canToday() && !again) {
          const a = doneToday();
          if (a) return doneTodayPanel(a);
        }
        const t = topicOf();
        if (!t) return head('тема дня') + `<div class="panel"><div class="flabel">Темы пока нет</div>
          <div class="hint" style="margin-top:0">Тема донесения берётся из блоков программы вашего уровня, а их сейчас не видно. Начните со звучания и первого блока.</div>
          <div class="btns mt0"><button class="btn btn-primary btn-block" data-go="program">К программе</button></div></div>` + backBtn;
        rp = { stage: 'topic', topic: t, ask: null, startedAt: Date.now(), at: 0,
          typed: false, prepped: false, listening: false, live: '', raw: '', recErr: '',
          segs: [], ansRaw: '', ansLive: '', recMs: 0, ansMs: 0, swallow: false, said: false };
      }
      if (rp.stage === 'prep') return stPrep();
      if (rp.stage === 'rec') return stRec();
      if (rp.stage === 'check') return stCheck();
      if (rp.stage === 'ask') return stAsk();
      if (rp.stage === 'send') return stSend();
      return stTopic();
    },
    mount() {
      stopTick();
      if (!rp) return;
      if (rp.stage === 'prep') return tickPrep();
      if (rp.stage === 'rec') return tickRec();
      if (rp.stage === 'ask') return mountAsk();
      if (rp.stage === 'check') return mountChips();
    },
  };

  /* ── часы ──
     Отдельного «размонтирования» в приложении нет, поэтому тикер сам останавливается,
     когда его строки на экране больше нет. */
  const alive = id => App.state.view === 'report' && !!document.getElementById(id);
  function tickPrep() {
    tick = setInterval(() => {
      if (!rp || rp.stage !== 'prep' || !alive('rp-clock')) return stopTick();
      const left = Math.max(0, PREP_SEC - elapsed());
      document.getElementById('rp-clock').textContent = String(left);
      if (left <= 0) { stopTick(); goRec(); }
    }, 250);
  }
  function tickRec() {
    tick = setInterval(() => {
      if (!rp || rp.stage !== 'rec' || !alive('rp-clock')) return stopTick();
      const s = elapsed();
      document.getElementById('rp-clock').textContent = fmt.clock(s * 1000);
      const bar = document.getElementById('rp-bar');
      if (bar) {
        bar.style.width = Math.min(100, Math.round(s / hardOf(rp.topic) * 100)) + '%';
        bar.className = s >= softOf(rp.topic) ? 'over' : '';
      }
    }, 250);
  }
  function mountAsk() {
    const q = rp.ask;
    if (!q) return;
    if (!rp.said) { rp.said = true; if (window.Speech && Speech.available()) setTimeout(() => Speech.say(q.zh), 300); }
    if (!rp.typed && recAvailable() && !rp.listening) listen(ASK_SEC * 1000, true);
    tick = setInterval(() => {
      if (!rp || rp.stage !== 'ask' || !alive('rp-clock')) return stopTick();
      document.getElementById('rp-clock').textContent = fmt.clock(elapsed() * 1000);
    }, 250);
  }
  /* Долгий тап убирает слово; следующий за ним клик глотаем, чтобы не открыть правку */
  function mountChips() {
    const box = document.getElementById('rp-chips');
    if (!box) return;
    let t0 = null;
    const down = e => {
      const el = e.target.closest('.rp-chip');
      if (!el) return;
      const i = +el.dataset.i;
      t0 = setTimeout(() => {
        t0 = null;
        const s = rp && rp.segs[i];
        if (!s) return;
        s.removed = !s.removed;
        rp.swallow = true;
        setTimeout(() => { if (rp) rp.swallow = false; }, 500);
        render();
      }, LONG_MS);
    };
    const up = () => { if (t0) { clearTimeout(t0); t0 = null; } };
    box.addEventListener('pointerdown', down);
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
    box.addEventListener('pointerleave', up);
  }

  /* ── запись речи ──
     SpeechIn.listenLong сам переживает обрывы сессии и никогда не бросает исключение. */
  function listen(ms, forAnswer) {
    const S = SI();
    if (!S || typeof S.listenLong !== 'function') { rp.typed = true; return; }
    rp.listening = true;
    rp.at = Date.now();
    const box = () => document.getElementById('rp-live');
    S.listenLong(ms, (interim, text) => {
      if (!rp) return;
      const live = str(text) + str(interim);
      if (forAnswer) rp.ansLive = live; else rp.live = live;
      const el = box();
      if (el) el.textContent = live || '…';
    }).then(res => {
      if (!rp || !rp.listening) return;
      rp.listening = false;
      const txt = str(res && res.text);
      const err = res && res.error ? str(res.error) : '';
      if (forAnswer) {
        if (rp.stage !== 'ask') return;
        rp.ansRaw = txt;
        rp.ansMs = Math.max(0, num(res && res.ms));
        if (!txt) { rp.typed = true; rp.recErr = err ? 'Ответ не расслышан: ' + err + '.' : ''; }
        send();
      } else {
        if (rp.stage !== 'rec') return;
        rp.recMs = Math.max(0, num(res && res.ms));
        if (!txt) { rp.typed = true; rp.recErr = err ? 'Запись не удалась: ' + err + '.' : 'Речь не распозналась.'; rp.at = Date.now(); return render(); }
        toCheck(txt);
      }
    });
  }

  /* ── шаги ── */
  actions['rp-again'] = () => { again = true; rp = null; render(); };
  actions['rp-prep'] = () => { if (!rp) return; rp.prepped = true; rp.stage = 'prep'; rp.at = Date.now(); render(); };
  actions['rp-go'] = () => goRec(false);
  actions['rp-write'] = () => goRec(true);
  actions['rp-quit'] = () => { reset(); nav('home', {}, { replace: true }); };

  function goRec(typed) {
    if (!rp) return;
    stopTick();
    if (typed === true) rp.typed = true;
    if (!rp.typed && !recAvailable()) rp.typed = true;
    rp.stage = 'rec';
    rp.at = Date.now();
    rp.live = ''; rp.raw = ''; rp.recErr = '';
    render();
    if (!rp.typed) { listen(hardOf(rp.topic) * 1000, false); if (rp.typed) render(); }
  }

  actions['rp-done'] = () => {
    if (!rp || rp.stage !== 'rec') return;
    if (rp.typed) {
      const el = document.getElementById('rp-text');
      rp.recMs = Math.max(0, Date.now() - (rp.at || Date.now()));
      return toCheck(el ? el.value : rp.raw);
    }
    if (rp.listening) return stopRec();       /* запись кончится сама, и listen() доведёт до сверки */
    rp.recMs = Math.max(0, Date.now() - (rp.at || Date.now()));
    toCheck(rp.live);                         /* записи не было — сверяем то, что успело расслышаться */
  };

  function toCheck(text) {
    stopTick();
    rp.raw = str(text);
    rp.segs = segsFrom(rp.raw);
    rp.stage = 'check';
    render();
  }

  /* Правка: слово становится сомнительным от самой правки, а не от того, что в ней написано */
  actions['rp-chip'] = el => {
    if (!rp) return;
    if (rp.swallow) { rp.swallow = false; return; }
    const i = +el.dataset.i, s = rp.segs[i];
    if (!s) return;
    sheet(`<div class="sheet-h">Поправить слово</div>
      <div class="hint">Телефон услышал: <b class="zh">${esc(s.orig)}</b>. Исправьте, если это не то, что вы сказали.</div>
      <input class="rp-input one" id="rp-fix" value="${esc(s.t)}" spellcheck="false">
      <div class="btns">
        <button class="btn btn-primary btn-block" data-action="rp-fix" data-i="${i}">Поправить</button>
        <button class="btn btn-secondary btn-block" data-action="rp-drop" data-i="${i}">${s.removed ? 'Вернуть слово' : 'Убрать слово'}</button>
        <button class="btn btn-secondary btn-block" data-close>Отмена</button></div>`,
      box => { const f = box.querySelector('#rp-fix'); if (f) setTimeout(() => f.focus(), 60); });
  };
  actions['rp-fix'] = el => {
    const s = rp && rp.segs[+el.dataset.i];
    const f = document.getElementById('rp-fix');
    const v = f ? str(f.value).trim() : '';
    if (!s) return closeSheet();
    if (v && v !== s.t) {
      s.t = v; s.edited = true;
      const c = byHanzi(v);
      s.card = c; s.cardId = c ? c.id : null; s.py = c ? c.pinyin : ''; s.ru = c ? c.ru : '';
    } else if (v && v !== s.orig) s.edited = true;
    s.removed = false;
    closeSheet(); render();
  };
  actions['rp-drop'] = el => {
    const s = rp && rp.segs[+el.dataset.i];
    if (s) s.removed = !s.removed;
    closeSheet(); render();
  };

  actions['rp-ask'] = () => {
    if (!rp) return;
    stopTick();
    rp.ask = askOf(rp.topic);
    rp.ansRaw = ''; rp.ansLive = ''; rp.said = false;
    rp.stage = 'ask';
    rp.at = Date.now();
    render();
  };
  actions['rp-say'] = () => { const q = rp && rp.ask; if (q && window.Speech && Speech.available()) Speech.say(q.zh); };

  actions['rp-send'] = () => {
    if (!rp || rp.stage !== 'ask') return;
    stopTick();
    if (rp.listening) return stopRec();       /* запись ответа кончится сама и вызовет send() */
    if (rp.typed) { const el = document.getElementById('rp-ans'); if (el) rp.ansRaw = el.value; }
    rp.ansMs = rp.ansMs || Math.max(0, Date.now() - (rp.at || Date.now()));
    send();
  };

  /* ── разбор и запись попытки ── */
  /* Текст на разбор: сверенный монолог и ответ на встречный вопрос одной записью —
     разбирать их порознь нечестно, ответ это такая же речь. */
  function fullText() {
    const mono = textOf(rp.segs).trim();
    const ans = str(rp.ansRaw).trim();
    if (!mono) return ans;
    if (!ans) return mono;
    return mono + (/[。！？.!?]$/.test(mono) ? '' : '。') + ans;
  }

  async function send() {
    if (!rp || rp.stage === 'send') return;
    const v = rp;
    v.stage = 'send';
    render();
    const text = fullText();
    const half = editShare(v.segs) > EDIT_LIMIT;
    const source = v.typed ? 'typed' : 'voice';
    const pl = { text, targets: v.topic.targets || [], fires: v.topic.fires || [], level: v.topic.lvl, source };
    let res = null, err = '';
    try {
      res = await R().analyze(Object.assign({ state }, pl));
    } catch (e) { err = str(e && e.message) || 'разбор не дошёл'; }
    const now = Date.now();
    /* Разбора нет — свидетельств и плат тоже: пустой результат даёт ноль находок,
       ноль случаев и ни одного перехода огня. Плата за монолог при этом остаётся. */
    if (!res) {
      try { res = R().validate({}, { text, targets: pl.targets, fires: pl.fires, level: pl.level, source }); } catch (e) { res = null; }
    }
    if (!res) { reset(); toast('Донесение не записалось'); return nav('home', {}, { replace: true }); }
    const a = buildAttempt(v, res, { half, err, now, pl });
    reset();
    try { await saveAttempt(a); } catch (e) { toast('Попытку сохранить не вышло'); return nav('home', {}, { replace: true }); }
    if (window.Sound) Sound.finish(!err);
    nav('report-result', { id: a.id }, { replace: true });
  }

  /* Попытку собирает Report; экран только снимает след с сомнительных слов и,
     если правок было много, урезает цену вдвое — и пишет, за что. */
  function buildAttempt(v, res, o) {
    const a = R().attempt(state, res, { id: uid(), startedAt: v.startedAt, endedAt: o.now, now: o.now, topic: v.topic });
    const doubt = doubtfulOf(v.segs);
    let changed = false;
    for (const q of a.questions || []) {
      if (!q.trap) continue;
      if (doubt.some(d => str(q.hanzi).indexOf(d) >= 0)) { q.doubt = true; q.trap = null; changed = true; }
    }
    if (changed) {
      a.moves = R().moves(state, a, o.now);
      const pt = R().points(Object.assign({}, res, { moves: a.moves, lvl: a.level }));
      a.pointParts = pt.parts; a.points = pt.points; a.p2fix = pt.points;
      a.bounty = a.moves.filter(m => m.to === 'out').reduce((s, m) => s + (m.from === 'relit' ? R().PTS.relit : R().PTS.out), 0) || 0;
    }
    if (o.half && a.points > 0) {
      const cut = Math.round(a.points / 2 * 10) / 10;
      a.points = Math.round((a.points - cut) * 10) / 10;
      a.p2fix = a.points;
      a.pointParts = (a.pointParts || []).concat([{ ru: 'Правок в сверке больше десятой части — половинный вес', n: -cut }]);
    }
    a.report = {
      mono: textOf(v.segs), answer: str(v.ansRaw), ask: v.ask || null,
      corrected: str(res.corrected), findings: res.findings || [], cases: res.cases || [],
      good: res.good || [], rubric: res.rubric || null, targets: res.targets || [],
      segs: chips(v.segs).map(s => ({ t: s.t, orig: s.orig, edited: !!s.edited, removed: !!s.removed })),
      editShare: Math.round(editShare(v.segs) * 100) / 100, half: !!o.half,
      prepped: !!v.prepped, typed: !!v.typed, doubt,
    };
    a.net = o.err ? 'fail' : 'ok';
    if (o.err) { a.err = o.err; queuePush(a.id, o.pl); }
    return a;
  }

  /* ── очередь разбора ──
     Офлайн: запись уже в журнале, разбор ждёт сети. Поздний разбор возвращает находки
     и случаи, но очков не пересчитывает: заплачено было за то, что человек сделал тогда. */
  const queue = () => { const s = state.settings || (state.settings = {}); return (s.reportQueue || (s.reportQueue = [])); };
  function queuePush(id, pl) {
    const q = queue();
    q.push({ id, pl: { text: pl.text, targets: pl.targets, fires: pl.fires, level: pl.level, source: pl.source }, at: Date.now() });
    if (q.length > 3) state.settings.reportQueue = q.slice(-3);
    persist();
  }
  const queued = id => queue().find(x => x && x.id === id) || null;

  actions['rp-retry'] = async el => {
    const id = str(el.dataset.id);
    const a = (state.attempts || []).find(x => x && x.id === id);
    const q = queued(id);
    if (!a || !q) return toast('Донесения для повторного разбора нет');
    toast('Отправляю разбор…');
    let res = null;
    try { res = await R().analyze(Object.assign({ state }, q.pl)); } catch (e) { return toast('Разбор снова не дошёл: ' + (str(e && e.message) || 'сеть')); }
    const qs = R().questions(res, a.durationMs);
    const doubt = (a.report && a.report.doubt) || [];
    for (const x of qs) if (x.trap && doubt.some(d => str(x.hanzi).indexOf(d) >= 0)) { x.doubt = true; x.trap = null; }
    a.questions = qs;
    a.total = qs.length; a.planned = qs.length;
    a.correct = qs.filter(x => x.ok).length;
    a.wrong = qs.length - a.correct;
    a.percent = qs.length ? Math.round(a.correct / qs.length * 100) : 0;
    a.moves = R().moves(state, a, Date.now());
    a.report = Object.assign({}, a.report, { corrected: str(res.corrected), findings: res.findings || [],
      cases: res.cases || [], good: res.good || [], rubric: res.rubric || null, targets: res.targets || [] });
    a.net = 'late';
    a.err = '';
    try { if (window.Stats) state.cardStats = Stats.cardStats(state.attempts); } catch (e) { /* не критично */ }
    try { if (window.Store) await Store.putAttempt(a); } catch (e) { toast('Разбор показан, но записать его не вышло'); }
    state.settings.reportQueue = queue().filter(x => x && x.id !== id);
    await persistNow();
    render();
  };

  /* ── разбор «На полях» ── */
  /* Подсветка: в исправленном тексте отмечаем то, чем заменили найденное. Чего сервер
     не прислал, того и не подсвечиваем — выдумывать границы правок нечем. */
  function marked(rep) {
    const text = str(rep.corrected) || str(rep.mono);
    if (!text) return '<div class="hint">Текста донесения не осталось.</div>';
    let out = '', rest = text;
    for (const f of rep.findings || []) {
      /* В исправленном тексте подсвечиваем правку, в неисправленном — саму цитату.
         Чего в тексте нет, то и не подсвечиваем: границы правки выдумывать нечем. */
      const fx = str(f.fix), qt = str(f.quote);
      const needle = fx && rest.indexOf(fx) >= 0 ? fx : (qt && rest.indexOf(qt) >= 0 ? qt : '');
      if (!needle) continue;
      const i = rest.indexOf(needle);
      out += esc(rest.slice(0, i)) + '<mark>' + esc(needle) + '</mark>';
      rest = rest.slice(i + needle.length);
    }
    return `<div class="rp-marg">${out + esc(rest)}</div>`;
  }
  const findCard = f => `<div class="panel rp-find">
    <div class="rp-find-q">${esc(f.quote)}</div>
    ${f.fix ? `<div class="rp-find-r"><span>как верно:</span> ${esc(f.fix)}</div>` : ''}
    ${f.why ? `<div class="hint">${esc(f.why)}</div>` : ''}
    ${f.l1 ? `<div class="hint rp-ours">Как это у нас: ${esc(f.l1)}</div>` : ''}</div>`;
  const caseRu = (rep, node) => {
    const t = (rep.targets || []).find(x => x && x.node === node);
    return str((t && (t.ru || t.rule)) || node).slice(0, 60);
  };

  views['report-result'] = {
    render(p) {
      const a = (state.attempts || []).find(x => x && x.id === ((p || {}).id));
      if (!a || a.mode !== 'report') return '<div class="empty">Разбора нет</div>' + backBtn;
      const rep = a.report || {};
      const ok = a.net !== 'fail';
      const q = queued(a.id);
      const parts = a.pointParts || [];
      const MOVE = (R() && R().MOVE_RU) || {};
      return `<div class="vh"><div class="seal">报</div><div class="grow"><h1 class="title">На полях</h1><div class="sub">${esc(fmt.date(a.ts))}${a.total ? ' · случаев ' + a.correct + ' из ' + a.total : ''}</div></div></div>
      ${ok ? `<div class="panel ornate"><div class="big-score">${a.percent}<small>%</small></div>
          <div class="fb-row"><span class="fb-p">Очков</span><span class="fb-v"><b>+${Math.round(pointsOf(a))}</b></span></div>
          <div class="hint" style="margin:6px 0 0">Знаков ${num(a.chars)}${a.source === 'typed' ? ' · набрано с клавиатуры' : ' · сказано голосом'}${a.loose ? ' · разбор неточный' : ''}${rep.half ? ' · правок больше десятой части' : ''}</div>
          ${a.net === 'late' ? '<div class="hint">Разбор пришёл позже записи: находки и случаи здесь есть, а очки остались те, что были начислены сразу.</div>' : ''}</div>`
        : `<div class="panel ornate"><div class="flabel">Разбор не дошёл</div>
          <div class="hint" style="margin-top:0">${esc(a.err ? 'Причина: ' + a.err + '.' : '')} ${Math.round(pointsOf(a)) > 0 ? 'Очки за усилие остались: +' + Math.round(pointsOf(a)) + '.' : 'Очков нет, но не из-за сети: монолог вышел короче нормы — разбивка ниже.'} Свидетельств по случаям нет, платы за огни нет — разбирать было нечем.</div>
          ${q ? `<div class="hint">Запись сохранена и стоит в очереди. Разбор можно повторить, когда появится сеть: находки и случаи появятся, очки останутся прежними.</div>
            <div class="btns mt0"><button class="btn btn-primary btn-block" data-action="rp-retry" data-id="${esc(a.id)}">Повторить разбор</button></div>` : ''}</div>`}
      <div class="panel"><div class="flabel">Донесение</div>${marked(rep)}
        ${rep.editShare ? `<div class="hint">Правок в сверке ${Math.round(rep.editShare * 100)}% · помеченные «сомнительно» слова огней не касались.</div>` : '<div class="hint">Сверка прошла без правок.</div>'}
        ${rep.ask ? `<div class="rp-askback"><div class="flabel">Встречный вопрос</div>
          <div class="rp-q-zh sm">${esc(rep.ask.zh)}</div>${rep.ask.ru ? `<div class="rp-q-ru">${esc(rep.ask.ru)}</div>` : ''}
          <div class="rp-ansback">${esc(rep.answer) || '<i>без ответа</i>'}</div></div>` : ''}</div>
      ${(rep.findings || []).length ? `<div class="flabel rp-sec">Находки</div>${rep.findings.map(findCard).join('')}` : ''}
      ${(rep.good || []).length ? `<div class="panel"><div class="flabel">Что вышло верно</div>
        <ul class="rp-list">${rep.good.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div>` : ''}
      ${(rep.cases || []).length ? `<div class="panel"><div class="flabel">По конструкциям</div>
        ${rep.cases.map(c => `<div class="rp-case ${c.ok >= c.need ? 'ok' : c.ok ? '' : 'bad'}"><b>${esc(caseRu(rep, c.node))}</b><span>нужна была ${c.need}, вышла ${c.ok}</span></div>`).join('')}
        <div class="hint">Случай — это «конструкция потребовалась по смыслу», а не «ошибка на сто слов».</div></div>` : ''}
      ${rep.rubric && (rep.rubric.level || rep.rubric.note) ? `<div class="panel"><div class="flabel">Как это звучит</div>
        ${rep.rubric.level ? `<div class="row-t">${esc(rep.rubric.level)}</div>` : ''}
        ${rep.rubric.note ? `<div class="hint">${esc(rep.rubric.note)}</div>` : ''}</div>` : ''}
      <div class="panel"><div class="flabel">Очки: за что</div>
        ${parts.length ? parts.map(x => `<div class="fb-row"><span class="fb-p">${esc(x.ru)}</span><span class="fb-v">${x.n > 0 ? '+' : ''}${x.n}</span></div>`).join('') : '<div class="hint">Разбивка не сохранилась.</div>'}
        <div class="fb-row rp-total"><span class="fb-p">Всего</span><span class="fb-v"><b>${Math.round(pointsOf(a))}</b></span></div>
        <div class="hint">Цену назначает сам режим: донесение не проходит деградацию и не помечает материал виденным. Дневная норма — 400 очков.</div></div>
      ${(a.moves || []).length ? `<div class="panel"><div class="flabel">Огни, которые сдвинулись</div>
        ${a.moves.map(m => `<div class="rp-fire"><div class="row-t">${esc(m.ru || m.id)}</div>
          <div class="row-s">${esc((m.from ? m.from + ' → ' : '') + (MOVE[m.to] || m.to))}</div></div>`).join('')}
        <div class="hint">Переходы пересчитаны из журнала: реестр без этого донесения и с ним.</div></div>`
        : `<div class="panel"><div class="flabel">Огни</div><div class="hint" style="margin-top:0">${ok ? 'Ни один огонь от этого донесения не сдвинулся.' : 'Свидетельств нет — огни не трогались.'}</div></div>`}
      ${(a.questions || []).length ? `<div class="panel"><div class="flabel">Случаи</div>
        ${a.questions.map(x => `<div class="rp-word ${x.ok ? 'ok' : 'bad'}"><span class="zh">${esc(x.hanzi)}</span><small>${esc(x.ru || '')}</small>${x.doubt ? '<em>сомнительно</em>' : ''}</div>`).join('')}
        <div class="hint">Помеченные «сомнительно» в счёт огней не идут: это правленые в сверке слова.</div></div>` : ''}
      <div class="btns">
        <button class="btn btn-primary btn-block" data-go="home">На главную</button>
        <button class="btn btn-secondary btn-block" data-go="stats">В статистику</button></div>`;
    },
  };

  /* ── строка на главной ── */
  function homePanel() {
    if (!has() || !is2()) return '';
    const a = doneToday();
    if (a) {
      const ok = a.net !== 'fail';
      return `<div class="panel ornate rp-home"><div class="flabel">Донесение</div>
        <div class="rp-home-t">Сегодня уже сделано</div>
        <div class="hint">${ok ? 'Случаев ' + a.correct + ' из ' + a.total + ' · +' + Math.round(pointsOf(a)) + ' очков' : 'Разбор не дошёл · +' + Math.round(pointsOf(a)) + ' очков за усилие'}</div>
        <div class="btns mt0"><button class="btn btn-secondary btn-block" data-go="report-result" data-params="${attr({ id: a.id })}">Посмотреть разбор</button></div></div>`;
    }
    const t = topicOf();
    if (!t) return '';
    return `<div class="panel ornate rp-home"><div class="flabel">Донесение · тема дня</div>
      <div class="rp-home-t">${esc(t.ru)}</div>
      <div class="hint">Около четырёх минут: рассказать, сверить, ответить на встречный вопрос.</div>
      <div class="btns mt0"><button class="btn btn-primary btn-block" data-go="report">Начать</button></div></div>`;
  }

  return { homePanel, segsFrom, textOf, chips, editShare, doubtfulOf, askOf, buildAttempt, doneToday,
    PREP_SEC, ASK_SEC, EDIT_LIMIT, LONG_MS };
})();
