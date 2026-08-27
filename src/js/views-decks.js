/* Колоды и билдер карточек: список, колода, редактор, импорт текстом, экспорт. */
(() => {
  const { state, views, actions, nav, back, esc, attr, uid, $, toast, sheet, closeSheet, confirm, persist, reindex, builtinDecks, deckById, cardsOfDeck, deckAccuracy, accClass, render, downloadText, cardIndex, fmt } = App;

  function deckRow(d) {
    const cards = cardsOfDeck(d.id), acc = deckAccuracy(cards);
    return `<button class="row tap" data-go="deck" data-params="${attr({ id: d.id })}"><div><div class="row-t">${esc(d.name)}</div><div class="row-s">${fmt.plural(cards.length, 'карточка', 'карточки', 'карточек')}${d.desc ? ' · ' + esc(d.desc) : ''}${d.builtin && window.PROGRAM ? ' · ' + PROGRAM.byLevel(d.level).length + ' уроков' : ''}</div></div><div class="row-r">${acc == null ? '' : `<span class="badge ${accClass(acc)}">${acc}%</span>`}<span class="chev">›</span></div></button>`;
  }
  views.decks = {
    render() {
      return `<div class="vh"><div class="seal">卡</div><div class="grow"><h1 class="title">Колоды</h1><div class="sub">Свои наборы и встроенные HSK</div></div></div>
      <button class="btn btn-primary btn-block" data-action="deck-new">＋ Новая колода</button>
      <h2 class="h2">Мои колоды</h2>${state.decks.length ? state.decks.map(deckRow).join('') : '<div class="empty">Пока нет своих колод.</div>'}
      <h2 class="h2">Встроенные HSK</h2>${builtinDecks.map(deckRow).join('')}`;
    },
  };

  function cardList(cards, d) {
    if (!cards.length) return '<div class="empty">Пусто. Добавьте карточку или импортируйте список.</div>';
    const cs = state.cardStats;
    return cards.map(c => {
      const s = cs[c.id];
      const badge = s && s.asked ? `<span class="badge ${accClass(Math.round(s.accuracy * 100))}">${Math.round(s.accuracy * 100)}%</span>` : '';
      const go = d.builtin ? `data-action="card-info" data-id="${c.id}"` : `data-go="card" data-params="${attr({ deckId: d.id, id: c.id })}"`;
      return `<button class="row tap" ${go}><div class="row-card"><span class="hanzi sm">${esc(c.hanzi)}</span><span class="pinyin sm">${esc(c.pinyin)}</span><div class="ru sm">${esc(c.ru)}</div></div><div class="row-r">${badge}<span class="chev">›</span></div></button>`;
    }).join('');
  }
  function filterCards(cards, v) {
    v = v.trim().toLowerCase(); if (!v) return cards;
    const vs = Pinyin.stripTones(v).toLowerCase();
    return cards.filter(c => c.hanzi.includes(v) || Pinyin.stripTones(c.pinyin).toLowerCase().includes(vs) || c.ru.toLowerCase().includes(v) || (c.note || '').toLowerCase().includes(v));
  }
  views.deck = {
    render(p) {
      const d = deckById(p.id);
      if (!d) return '<div class="empty">Колода не найдена</div>';
      const cards = cardsOfDeck(d.id), cs = state.cardStats, acc = deckAccuracy(cards);
      const seen = cards.filter(c => cs[c.id] && cs[c.id].asked).length, mastered = cards.filter(c => cs[c.id] && cs[c.id].mastered).length;
      return `<div class="vh"><button class="icon-btn" data-back>‹</button><div class="grow"><h1 class="title">${esc(d.name)}</h1><div class="sub">${fmt.plural(cards.length, 'карточка', 'карточки', 'карточек')}${d.builtin ? ' · справочный список' : d.desc ? ' · ' + esc(d.desc) : ''}</div></div>${d.builtin ? '' : `<button class="icon-btn" data-action="deck-menu" data-id="${d.id}" aria-label="Меню">⋯</button>`}</div>
      <div class="tiles t3"><div class="tile"><div class="v">${seen}</div><div class="l">изучено</div></div><div class="tile"><div class="v">${mastered}</div><div class="l">освоено</div></div><div class="tile"><div class="v">${acc == null ? '—' : acc + '%'}</div><div class="l">точность</div></div></div>
      <div class="btns row2 mt0"><button class="btn btn-primary" data-action="learn-deck" data-id="${d.id}" ${cards.length ? '' : 'disabled'}>${d.builtin ? 'К урокам 学' : 'Учить'}</button>${d.builtin ? `<button class="btn btn-secondary" data-action="hsk-test" data-level="${d.level}">Словарный тест</button>` : `<button class="btn btn-secondary" data-go="card" data-params="${attr({ deckId: d.id })}">＋ Карточка</button>`}</div>
      ${d.builtin ? '' : `<div class="btns row2"><button class="btn btn-secondary btn-sm" data-go="import" data-params="${attr({ deckId: d.id })}">Импорт текстом</button><button class="btn btn-secondary btn-sm" data-action="deck-export" data-id="${d.id}" ${cards.length ? '' : 'disabled'}>Экспорт</button></div>`}
      ${d.builtin ? '<div class="hint" style="margin:0 0 10px">Это полный список слов уровня для поиска и повторения. Учиться — в уроках: они поделены на темы с грамматикой.</div>' : ''}
      <input class="inp search" id="q" placeholder="Поиск: иероглиф, пиньинь, перевод" autocomplete="off" autocorrect="off">
      <div id="cardlist">${cardList(cards, d)}</div>`;
    },
    mount(p) {
      const q = $('#q'), d = deckById(p.id);
      if (q && d) q.addEventListener('input', () => { $('#cardlist').innerHTML = cardList(filterCards(cardsOfDeck(d.id), q.value), d); });
    },
  };

  actions['deck-new'] = () => {
    sheet(`<h3 class="sh-t">Новая колода</h3><div class="field"><label>Название</label><input class="inp" id="dn" placeholder="Например: Урок 5" maxlength="60"></div><div class="field"><label>Описание <span class="muted">(не обязательно)</span></label><input class="inp" id="dd" placeholder="О чём колода" maxlength="120"></div><button class="btn btn-primary btn-block" id="dok">Создать</button>`, s => {
      const inp = $('#dn', s); setTimeout(() => inp.focus(), 80);
      const go = () => { const name = inp.value.trim(); if (!name) { toast('Введите название'); return; } const d = { id: 'd-' + uid(), name, desc: $('#dd', s).value.trim(), createdAt: Date.now() }; state.decks.push(d); persist(); closeSheet(); nav('deck', { id: d.id }); };
      $('#dok', s).onclick = go; inp.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    });
  };
  actions['deck-menu'] = el => {
    const d = deckById(el.dataset.id); if (!d) return;
    sheet(`<h3 class="sh-t">${esc(d.name)}</h3><div class="field"><label>Название</label><input class="inp" id="dn" value="${esc(d.name)}" maxlength="60"></div><div class="field"><label>Описание</label><input class="inp" id="dd" value="${esc(d.desc || '')}" maxlength="120"></div><div class="btns"><button class="btn btn-primary btn-block" id="dsave">Сохранить</button><button class="btn btn-danger btn-block" id="ddel">Удалить колоду</button></div>`, s => {
      $('#dsave', s).onclick = () => { const name = $('#dn', s).value.trim(); if (!name) return toast('Введите название'); d.name = name; d.desc = $('#dd', s).value.trim(); persist(); closeSheet(); render(); };
      $('#ddel', s).onclick = async () => { closeSheet(); const n = cardsOfDeck(d.id).length; if (!await confirm(`Удалить колоду «${d.name}» и ${fmt.plural(n, 'карточку', 'карточки', 'карточек')}? Статистика попыток сохранится.`, { ok: 'Удалить', danger: true })) return; state.decks = state.decks.filter(x => x.id !== d.id); state.cards = state.cards.filter(c => c.deckId !== d.id); reindex(); persist(); toast('Колода удалена'); nav('decks', {}, { replace: true }); };
    });
  };
  actions['deck-export'] = el => {
    const d = deckById(el.dataset.id); if (!d) return;
    const cards = cardsOfDeck(d.id);
    const text = cards.map(c => [c.hanzi, c.pinyin, c.ru, c.note || ''].join(';')).join('\n');
    sheet(`<h3 class="sh-t">Экспорт «${esc(d.name)}»</h3><div class="hint" style="margin:0 0 10px">Формат строк: <kbd>иероглиф;пиньинь;перевод;заметка</kbd> — такой же текст можно вставить в «Импорт текстом».</div><textarea class="inp" id="ex" readonly>${esc(text)}</textarea><div class="btns"><button class="btn btn-primary btn-block" id="excopy">Скопировать</button><button class="btn btn-secondary btn-block" id="exfile">Сохранить файлом</button></div>`, s => {
      $('#excopy', s).onclick = async () => { try { await navigator.clipboard.writeText(text); toast('Скопировано'); } catch (e) { $('#ex', s).select(); document.execCommand && document.execCommand('copy'); toast('Выделено — скопируйте'); } };
      $('#exfile', s).onclick = () => { downloadText(text, d.name.replace(/[^\wа-яё-]+/gi, '_') + '.txt'); closeSheet(); };
    });
  };
  actions['card-info'] = el => {
    const c = cardIndex[el.dataset.id]; if (!c) return;
    const s = state.cardStats[c.id];
    const st = s && s.asked ? `<div class="tiles t3"><div class="tile"><div class="v">${s.asked}</div><div class="l">спрошено</div></div><div class="tile"><div class="v">${Math.round(s.accuracy * 100)}%</div><div class="l">верно</div></div><div class="tile"><div class="v">${s.streak}</div><div class="l">подряд</div></div></div><div class="hint" style="margin-top:0">Последний раз: ${fmt.date(s.lastAt)} — ${s.lastOk ? 'верно' : 'ошибка'}${s.mastered ? ' · освоена' : ''}</div>` : '<div class="hint">Ещё не встречалась в тестах.</div>';
    const userDecks = state.decks.map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
    sheet(`<div class="sh-card"><div class="hanzi mid ${c.hanzi.length >= 5 ? 'len5' : ''}">${esc(c.hanzi)}</div><div class="pinyin">${esc(c.pinyin)}</div><div class="ru">${esc(c.ru)}</div></div>${st}<div class="field mt"><label>Скопировать в свою колоду</label><div style="display:flex;gap:8px"><select class="inp" id="cpdeck">${userDecks}</select><button class="btn btn-secondary" id="cpgo" style="flex:none">Копировать</button></div></div>`, sh => {
      $('#cpgo', sh).onclick = () => { const deckId = $('#cpdeck', sh).value; if (!deckId) return toast('Сначала создайте свою колоду'); if (state.cards.some(x => x.deckId === deckId && x.hanzi === c.hanzi)) { toast('Уже есть в этой колоде'); return; } state.cards.push({ id: 'c-' + uid(), hanzi: c.hanzi, pinyin: c.pinyin, ru: c.ru, note: '', deckId, createdAt: Date.now(), from: c.id }); reindex(); persist(); toast('Добавлено в «' + deckById(deckId).name + '»'); closeSheet(); };
    });
  };

  /* ── редактор карточки ── */
  views.card = {
    render(p) {
      const d = deckById(p.deckId); if (!d || d.builtin) return '<div class="empty">Колода не найдена</div>';
      const c = p.id ? state.cards.find(x => x.id === p.id) : null;
      if (p.id && !c) return '<div class="empty">Карточка не найдена</div>';
      const v = c || { hanzi: '', pinyin: '', ru: '', note: '' };
      return `<div class="vh"><button class="icon-btn" data-back>‹</button><div class="grow"><h1 class="title">${c ? 'Карточка' : 'Новая карточка'}</h1><div class="sub">${esc(d.name)}</div></div></div>
      <form id="cf" class="panel" autocomplete="off">
        <div class="field"><label>Иероглифы</label><input class="inp" name="hanzi" lang="zh-CN" value="${esc(v.hanzi)}" placeholder="你好" autocapitalize="off" autocorrect="off" spellcheck="false" style="font-family:var(--hanzi);font-size:24px"></div>
        <div class="field"><label>Пиньинь <span class="muted">· тоны цифрами: ni3 hao3, ü = v</span></label><input class="inp" name="pinyin" value="${esc(v.pinyin)}" placeholder="ni3 hao3" autocapitalize="off" autocorrect="off" spellcheck="false"><div class="pv" id="pv">${esc(v.pinyin)}</div></div>
        <div class="field"><label>Перевод <span class="muted">· варианты через запятую</span></label><input class="inp" name="ru" value="${esc(v.ru)}" placeholder="привет, здравствуй"></div>
        <div class="field"><label>Заметка <span class="muted">(не обязательно)</span></label><input class="inp" name="note" value="${esc(v.note || '')}" placeholder="пример, подсказка"></div>
        <div class="btns mt0"><button class="btn btn-primary btn-block" type="submit">${c ? 'Сохранить' : 'Добавить'}</button>${c ? '' : '<button class="btn btn-secondary btn-block" type="button" data-action="card-save-more">Добавить и ещё одну</button>'}${c ? `<button class="btn btn-danger btn-block" type="button" data-action="card-delete" data-id="${c.id}">Удалить карточку</button>` : ''}</div>
      </form>`;
    },
    mount(p) {
      const f = $('#cf'); if (!f) return;
      const pin = f.elements.pinyin, pv = $('#pv');
      pin.addEventListener('input', () => { pv.textContent = Pinyin.toMarks(pin.value); });
      f.addEventListener('submit', e => { e.preventDefault(); saveCard(p, f, false); });
      if (!p.id) setTimeout(() => f.elements.hanzi.focus(), 60);
    },
  };
  function saveCard(p, f, more) {
    const hanzi = f.elements.hanzi.value.trim(), pinyin = Pinyin.toMarks(f.elements.pinyin.value.trim()).replace(/\s+/g, ' '), ru = f.elements.ru.value.trim(), note = f.elements.note.value.trim();
    if (!hanzi || !pinyin || !ru) { toast('Нужны иероглифы, пиньинь и перевод'); return; }
    if (p.id) { const c = state.cards.find(x => x.id === p.id); Object.assign(c, { hanzi, pinyin, ru, note, updatedAt: Date.now() }); }
    else state.cards.push({ id: 'c-' + uid(), hanzi, pinyin, ru, note, deckId: p.deckId, createdAt: Date.now() });
    reindex(); persist(); toast(p.id ? 'Сохранено' : 'Добавлено: ' + hanzi);
    if (more) { f.reset(); $('#pv').textContent = ''; f.elements.hanzi.focus(); } else back();
  }
  actions['card-save-more'] = () => { const f = $('#cf'); if (f) saveCard(state.params, f, true); };
  actions['card-delete'] = async el => {
    const c = state.cards.find(x => x.id === el.dataset.id); if (!c) return;
    if (!await confirm(`Удалить карточку «${c.hanzi}»?`, { ok: 'Удалить', danger: true })) return;
    state.cards = state.cards.filter(x => x.id !== c.id); reindex(); persist(); toast('Удалено'); back();
  };

  /* ── импорт текстом ── */
  function parseImport(text) {
    const ok = [], bad = [];
    const PIN = /^[A-Za-z0-5üÜ'’\-\s…]+$/;
    text.split(/\r?\n/).forEach((line, i) => {
      const raw = line.trim(); if (!raw) return;
      let parts = raw.includes('\t') ? raw.split('\t') : raw.includes('|') ? raw.split('|') : raw.includes(';') ? raw.split(';') : [];
      parts = parts.map(x => x.trim());
      if (parts.length < 3) {
        const m = raw.match(/^(\S+)\s+([A-Za-z0-5üÜ'’\-]+(?:\s+[A-Za-z0-5üÜ'’\-]+)*)\s+(.+)$/);
        if (m && !/[а-яё]/i.test(m[2])) parts = [m[1], m[2], m[3]];
      }
      if (parts.length >= 3 && parts[0] && parts[1] && parts[2] && PIN.test(parts[1]) && /[一-鿿]/.test(parts[0])) ok.push({ hanzi: parts[0], pinyin: Pinyin.toMarks(parts[1]).replace(/\s+/g, ' '), ru: parts[2], note: parts[3] || '' });
      else bad.push({ n: i + 1, line: raw });
    });
    return { ok, bad };
  }
  views.import = {
    render(p) {
      const d = deckById(p.deckId); if (!d || d.builtin) return '<div class="empty">Колода не найдена</div>';
      return `<div class="vh"><button class="icon-btn" data-back>‹</button><div class="grow"><h1 class="title">Импорт текстом</h1><div class="sub">в «${esc(d.name)}»</div></div></div>
      <div class="panel"><div class="hint" style="margin:0 0 10px">По одной карточке в строке: <kbd>иероглиф;пиньинь;перевод</kbd> — разделитель «;», «|», табуляция или просто пробелы. Четвёртое поле — заметка. Тоны можно цифрами.</div>
      <textarea class="inp" id="imp" placeholder="你好;ni3 hao3;привет&#10;谢谢 xie4xie спасибо&#10;再见 | zai4jian4 | до свидания"></textarea>
      <div class="hint" id="imp-info">Вставьте текст — ниже покажу, что распозналось.</div>
      <div id="imp-bad"></div>
      <button class="btn btn-primary btn-block mt" id="imp-go" data-action="import-go" disabled>Импортировать</button></div>`;
    },
    mount() {
      const ta = $('#imp'), info = $('#imp-info'), go = $('#imp-go'), badEl = $('#imp-bad');
      ta.addEventListener('input', () => {
        const r = parseImport(ta.value);
        info.textContent = r.ok.length || r.bad.length ? `Распознано: ${r.ok.length}. Не распознано: ${r.bad.length}.` : 'Вставьте текст — ниже покажу, что распозналось.';
        badEl.innerHTML = r.bad.length ? `<div class="warn">${r.bad.slice(0, 5).map(b => `стр. ${b.n}: ${esc(b.line.slice(0, 60))}`).join('<br>')}${r.bad.length > 5 ? '<br>…' : ''}</div>` : '';
        go.disabled = !r.ok.length; go.textContent = r.ok.length ? `Импортировать ${fmt.plural(r.ok.length, 'карточку', 'карточки', 'карточек')}` : 'Импортировать';
      });
      setTimeout(() => ta.focus(), 60);
    },
  };
  actions['import-go'] = () => {
    const p = state.params, ta = $('#imp'); if (!ta) return;
    const r = parseImport(ta.value); if (!r.ok.length) return;
    const existing = new Set(state.cards.filter(c => c.deckId === p.deckId).map(c => c.hanzi + '|' + c.ru));
    let added = 0, skipped = 0;
    r.ok.forEach(c => { const k = c.hanzi + '|' + c.ru; if (existing.has(k)) { skipped++; return; } existing.add(k); state.cards.push({ id: 'c-' + uid(), ...c, deckId: p.deckId, createdAt: Date.now() }); added++; });
    reindex(); persist(); toast(`Добавлено ${added}${skipped ? ', пропущено дублей ' + skipped : ''}`); nav('deck', { id: p.deckId }, { replace: true });
  };
})();
