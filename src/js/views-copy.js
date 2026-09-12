/* Копия по коду: панель в настройках и отдельный экран «Копия по коду».

   Прогресс живёт только на телефоне, поэтому потеря телефона равна потере всего.
   Код из шести китайских слов заменяет аккаунт: из него выводится адрес ячейки
   и ключ шифрования, а наружу уходит только шифротекст. Вся работа с кодом,
   шифрованием и сетью — в CloudCopy; здесь только показ и разговор с человеком.

   Экран относится к тестовой методике: в текущей он показывает короткую заглушку.
   Ничего не считается «в кэш»: состояние копии берётся из settings.cloudCopy,
   а числа — из state и из констант CloudCopy на месте показа. */
window.CopyUI = (() => {
  const { state, views, actions, esc, $, toast, sheet, closeSheet, confirm, render, fmt, persistNow } = App;

  const conf = () => window.PUSH_CONF || {};
  const has = () => !!window.CloudCopy;
  const ready = () => has() && !!conf().url;
  const is2 = () => !!(window.Ledger && Ledger.is2(state));
  const saved = () => (state.settings && state.settings.cloudCopy) || null;

  /* Слова кода лежат на этом телефоне: без них нельзя ни обновить копию, ни показать код.
     Читаем их только через словарь CloudCopy — чужой или устаревший ключ честно даёт null. */
  function savedWords() {
    const c = saved();
    if (!has() || !c || !Array.isArray(c.words) || c.words.length !== CloudCopy.SIZE) return null;
    const w = c.words.map(k => CloudCopy.find(k));
    return w.every(Boolean) ? w : null;
  }

  /* Сколько всего бывает кодов: C(словарь, 6). Считаем в логарифме, показываем порядок. */
  function variantsPow() {
    let log = 0;
    for (let i = 0; i < CloudCopy.SIZE; i++) log += Math.log10(CloudCopy.WORDS.length - i) - Math.log10(i + 1);
    return Math.floor(log);
  }
  const spaced = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const attemptsWord = n => fmt.plural(n, 'попытка', 'попытки', 'попыток');
  const firstSense = ru => String(ru == null ? '' : ru).split(/[;,(]/)[0].trim();

  /* ── состояние копии ─────────────────────────────────────────────────── */
  function stateLine() {
    const c = saved();
    if (!c || !c.at) {
      return `<div class="row-t">Копии нет</div>
        <div class="row-s">Код ещё не создан — в облаке ничего не лежит.</div>`;
    }
    const grown = state.attempts.length - (c.attempts || 0);
    return `<div class="row-t">Копия в облаке: ${esc(fmt.date(c.at))} · ${esc(attemptsWord(c.attempts || 0))}</div>
      <div class="row-s">${grown > 0
        ? `С тех пор добавилось ${esc(attemptsWord(grown))} — копию стоит обновить.`
        : 'Совпадает с тем, что сейчас на телефоне.'}${c.bytes ? ` · ${Math.max(1, Math.round(c.bytes / 1024))} КБ шифротекста` : ''}</div>`;
  }

  function btnsHtml() {
    const w = savedWords(), c = saved(), off = ready() ? '' : ' disabled';
    const rows = [];
    if (w) {
      rows.push(`<button class="btn btn-primary btn-block" data-action="copy-put"${off}>Обновить копию</button>`);
      rows.push('<button class="btn btn-secondary btn-block" data-action="copy-show">Показать код</button>');
    } else {
      rows.push(`<button class="btn btn-primary btn-block" data-action="copy-new"${off}>Создать код</button>`);
    }
    rows.push(`<button class="btn btn-secondary btn-block" data-action="copy-restore"${off}>Восстановить по коду</button>`);
    const note = !ready() ? 'Адрес хранилища копий не задан в этой сборке — кнопки заработают, когда он появится.'
      : (c && !w) ? 'Слова кода не читаются на этом телефоне. Создайте новый код: старая копия останется в облаке, но открыть её можно только тем кодом, который вы записали.'
        : '';
    return `<div class="btns mt0">${rows.join('')}</div>${note ? `<div class="hint">${esc(note)}</div>` : ''}`;
  }

  /* Панель для экрана настроек */
  function panel() {
    if (!has() || !is2()) return '';
    return `<div class="panel">
      <div class="flabel">Копия по коду</div>
      <div class="cp-state">${stateLine()}</div>
      ${btnsHtml()}
      <div class="hint">Шесть китайских слов вместо аккаунта. На сервер уходит только шифротекст и адрес ячейки; без кода копию не прочитать — ни серверу, ни вам.</div>
      <button class="btn btn-secondary btn-sm btn-block" data-go="copy">Подробно о копии по коду</button>
    </div>`;
  }

  /* ── экран ───────────────────────────────────────────────────────────── */
  const head = `<div class="vh"><button class="icon-btn" data-back>‹</button><div class="grow"><h1 class="title">Копия по коду</h1><div class="sub">备份</div></div></div>`;

  views.copy = {
    render() {
      if (!has()) {
        return head + `<div class="panel"><div class="row-t">Копия по коду недоступна</div>
          <div class="hint">Модуль копии не загружен в этой сборке приложения.</div></div>`;
      }
      if (!is2()) {
        return head + `<div class="panel"><div class="row-t">Это часть тестовой методики</div>
          <div class="hint">Копия по коду доступна, когда открыта тестовая книга учёта. Переключить методику можно в настройках — прогресс при этом не теряется.</div>
          <div class="btns mt0"><button class="btn btn-primary btn-block" data-go="settings">В настройки</button></div></div>`;
      }
      return head + `
      <div class="panel ornate">
        <div class="flabel">Состояние</div>
        <div class="cp-state">${stateLine()}</div>
        ${btnsHtml()}
      </div>
      <div class="panel">
        <div class="flabel">Зачем это</div>
        <div class="hint" style="margin-top:0">Всё, что вы сделали, лежит только на этом телефоне: попытки, колоды, свои карточки, обе книги учёта. Телефон утонул или потерялся — вместе с ним ушёл и поход. Копия по коду чинит это без аккаунта, почты и пароля: ${CloudCopy.SIZE} китайских слов и есть весь вход.</div>
        <div class="hint">Слова берутся из HSK 1–3 и только те, чей пиньинь без тонов опознаётся однозначно, — сейчас таких ${CloudCopy.WORDS.length}. На новом телефоне китайской клавиатуры нет, поэтому код вводится латиницей.</div>
      </div>
      <div class="panel">
        <div class="flabel">Что уходит на сервер</div>
        <div class="hint" style="margin-top:0">Ровно два поля: адрес ячейки (${CloudCopy.ID_LEN} символа, односторонняя свёртка кода) и шифротекст. Ни иероглифов, ни попыток, ни самих слов кода в запросе нет.</div>
        <div class="hint">Ключ шифрования выводится из шести слов прямо на телефоне (PBKDF2, ${spaced(CloudCopy.ITER)} итераций, затем AES-GCM) и никуда не передаётся. Поэтому сервер не может прочитать данные: ящик у него есть, ключа нет. Неверный код не даёт мусора — расшифровка просто отказывается.</div>
      </div>
      <div class="panel">
        <div class="flabel">Забытый код</div>
        <div class="hint" style="margin-top:0">Кода нет ни у сервера, ни у автора приложения, и восстановить его неоткуда. Если код забыт, а телефон потерян, копия останется в облаке нечитаемым набором байтов — это потеря всего, что в ней лежало.</div>
        <div class="hint">Разных кодов больше 10<sup>${variantsPow()}</sup>, так что перебрать чужой не выйдет. Обратная сторона та же: подсказать его тоже некому.</div>
      </div>
      <div class="panel">
        <div class="flabel">Две книги учёта</div>
        <div class="hint" style="margin-top:0">В копию входят настройки целиком, а в них лежит книга тестовой методики, — после восстановления обе книги и выбранная методика вернутся такими, какими были.</div>
      </div>
      <div class="panel">
        <div class="flabel">Рядом с этим</div>
        <div class="hint" style="margin-top:0">Перед заменой данных приложение само сохраняет резервную копию нынешнего состояния на телефоне. Экспорт в файл из настроек никуда не делся: копия по коду его не заменяет, а дополняет — файл переживает и потерю интернета, и хранилище.</div>
      </div>`;
    },
  };

  /* ── показ кода ──────────────────────────────────────────────────────── */
  function showCode(words, fresh) {
    const latin = words.map(w => w.key).join(' ');
    const list = words.map((w, i) => `<div class="cp-w"><i class="cp-n">${i + 1}</i><b class="hanzi">${esc(w.hanzi)}</b><span class="cp-p">${esc(w.pinyin)}</span><span class="cp-ru">${esc(firstSense(w.ru))}</span></div>`).join('');
    sheet(`<h3 class="sh-t">${fresh ? 'Ваш код копии' : 'Код этой копии'}</h3>
      ${fresh
        ? '<div class="cp-warn">Код показывается один раз — при создании. Запишите его сейчас: без кода копию не открыть, и взять его больше неоткуда. На этом телефоне код можно посмотреть снова, но телефон и есть то, что копия страхует.</div>'
        : '<div class="hint" style="margin-top:0">Код хранится на этом телефоне. Если телефон пропадёт, останется только то, что вы записали сами.</div>'}
      <div class="cp-words">${list}</div>
      <div class="flabel">Как вводить</div>
      <div class="cp-lat" id="cp-lat">${esc(latin)}</div>
      <div class="hint" style="margin-top:6px">Латиницей, без тонов, через пробел. Порядок слов важен.</div>
      <div class="btns"><button class="btn btn-secondary btn-block" id="cp-copy">Скопировать</button>
      ${fresh
        ? '<button class="btn btn-primary btn-block" id="cp-ok">Я записал</button>'
        : '<button class="btn btn-primary btn-block" data-close>Закрыть</button>'}</div>`, s => {
      $('#cp-copy', s).onclick = async () => {
        try { await navigator.clipboard.writeText(latin); toast('Код скопирован'); }
        catch (e) {
          try {
            const r = document.createRange(); r.selectNode($('#cp-lat', s));
            const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
            toast('Выделено — скопируйте вручную', 3200);
          } catch (e2) { toast('Не вышло скопировать — перепишите код с экрана', 3200); }
        }
      };
      if (fresh) $('#cp-ok', s).onclick = () => send(words, $('#cp-ok', s), 'Копия создана');
    });
  }

  /* ── отправка копии ──────────────────────────────────────────────────── */
  async function send(words, btn, done) {
    if (!ready()) { toast('Адрес хранилища копий не задан'); return false; }
    const was = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Отправляю…'; }
    try {
      const at = Date.now();
      const res = await CloudCopy.save(conf(), words, state, at);
      state.settings.cloudCopy = { words: words.map(w => w.key), id: res.id, at: res.at || at, attempts: state.attempts.length, bytes: res.bytes };
      await persistNow();
      closeSheet();
      toast(`${done} · ${attemptsWord(state.attempts.length)}`, 3200);
      render();
      return true;
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = was; }
      toast('Копия не отправилась: ' + e.message, 4200);
      return false;
    }
  }

  actions['copy-new'] = () => {
    if (!ready()) return toast('Адрес хранилища копий не задан');
    let words = null;
    try { words = CloudCopy.makeCode(); } catch (e) { return toast('Код не составился: ' + e.message, 3600); }
    showCode(words, true);
  };

  actions['copy-put'] = el => {
    const w = savedWords();
    if (!w) return toast('Кода нет на этом телефоне — создайте новый');
    send(w, el, 'Копия обновлена');
  };

  actions['copy-show'] = () => {
    const w = savedWords();
    if (!w) return toast('Кода нет на этом телефоне');
    showCode(w, false);
  };

  /* ── восстановление ──────────────────────────────────────────────────── */
  actions['copy-restore'] = () => {
    if (!ready()) return toast('Адрес хранилища копий не задан');
    sheet(`<h3 class="sh-t">Восстановить по коду</h3>
      <div class="hint" style="margin-top:0">Шесть слов латиницей без тонов, через пробел — например <kbd>mao shui tian ren nuer luyou</kbd>. Регистр, запятые и цифры тонов не мешают, порядок слов важен.</div>
      <div class="field mt"><label>Код копии</label><input class="inp" id="cp-in" type="text" inputmode="latin" autocapitalize="off" autocorrect="off" autocomplete="off" spellcheck="false" placeholder="слово слово слово слово слово слово"></div>
      <div class="cp-err" id="cp-err"></div>
      <div class="btns mt0"><button class="btn btn-primary btn-block" id="cp-go">Найти копию</button><button class="btn btn-secondary btn-block" data-close>Отмена</button></div>`, s => {
      const inp = $('#cp-in', s), err = $('#cp-err', s), go = $('#cp-go', s);
      try { inp.focus(); } catch (e) { /* без фокуса тоже работает */ }
      inp.oninput = () => { err.textContent = ''; inp.classList.remove('bad'); };
      inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go.click(); } };
      go.onclick = async () => {
        const d = CloudCopy.parseDetail(inp.value);
        if (!d.ok) { err.textContent = d.error; inp.classList.add('bad'); return; }   /* мягкий разбор: называем слово, а не «неверный код» */
        go.disabled = true; go.textContent = 'Ищу копию…';
        let snap = null;
        try { snap = await CloudCopy.load(conf(), d.words); }
        catch (e) { err.textContent = e.message; go.disabled = false; go.textContent = 'Найти копию'; return; }
        closeSheet();
        await restore(snap, d.words);
      };
    });
  };

  async function restore(snap, words) {
    const what = `${attemptsWord(snap.attempts.length)}, ${fmt.plural(snap.decks.length, 'колода', 'колоды', 'колод')}, `
      + `${fmt.plural(snap.cards.length, 'своя карточка', 'свои карточки', 'своих карточек')}`;
    const mine = `${attemptsWord(state.attempts.length)}, ${fmt.plural(state.decks.length, 'колода', 'колоды', 'колод')}, `
      + `${fmt.plural(state.cards.length, 'своя карточка', 'свои карточки', 'своих карточек')}`;
    const ok = await confirm(
      `В копии от ${fmt.date(snap.at)}: ${what}. Сейчас на телефоне: ${mine}. Заменится всё это целиком — попытки, колоды, свои карточки и настройки вместе с обеими книгами учёта и выбранной методикой. `
      + 'Перед заменой сохраню резервную копию нынешних данных на этом телефоне.',
      { ok: 'Заменить', danger: true, title: 'Восстановление из копии' });
    if (!ok) return;
    try {
      await Vault.backup('before-restore', { meta: state.meta, settings: state.settings, decks: state.decks, cards: state.cards, campaign: state.campaign, attempts: state.attempts });
    } catch (e) { return toast('Резервная копия не сделалась, замена отменена: ' + e.message, 4600); }
    try {
      /* Настройки заменяются, а не сливаются: лишние ключи этого телефона убираем до импорта */
      const src = snap.settings || {};
      for (const k of Object.keys(state.settings)) if (!(k in src)) delete state.settings[k];
      await App.importData({ app: 'zika', schema: snap.schema, settings: src, decks: snap.decks, cards: snap.cards, attempts: snap.attempts, campaign: snap.campaign }, 'replace');
      state.books = {}; state.campaignV1 = null;   /* кэш книг больше не отвечает данным — соберётся заново при запуске */
      state.settings.cloudCopy = { words: words.map(w => w.key), at: snap.at, attempts: snap.attempts.length };
      await persistNow();
    } catch (e) { return toast('Восстановление не удалось: ' + e.message, 4600); }
    sheet(`<h3 class="sh-t">Копия восстановлена</h3>
      <div class="install-note">Вернулись ${esc(what)}. Сейчас перезапущу приложение, чтобы обе книги учёта пересобрались из журнала.</div>
      <button class="btn btn-primary btn-block mt" id="cp-rl">Перезапустить</button>`, s => {
      $('#cp-rl', s).onclick = () => location.reload();
    });
    setTimeout(() => location.reload(), 1600);
  }

  return { panel, stateLine, savedWords, variantsPow };
})();
