/* Ядро приложения: состояние, навигация, общие помощники, главная, настройки, экспорт/импорт. */
window.App = (() => {
  const VERSION = '__VERSION__';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const attr = o => esc(JSON.stringify(o));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const state = {
    settings: { sound: true, theme: 'auto', lastSetup: null },
    decks: [], cards: [], attempts: [], cardStats: {}, campaign: null, meta: null,
    view: 'home', params: {}, storeMode: 'mem', ready: false,
  };
  const views = {}, actions = {};
  const LABELS = {
    part: { hanzi: 'Иероглиф', pinyin: 'Пиньинь', ru: 'Перевод', both: 'Пиньинь + перевод', hp: 'Иероглиф + пиньинь', audio: 'На слух', sentence: 'Фраза', answer: 'Ответ', all: 'Всё остальное' },
    diff: { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный', flip: 'Самопроверка', exam: 'Экзамен' },
    mode: { boss: 'Бой с боссом', sprint: 'Проверка себя', quiz: 'Выбор ответа', flip: 'Карточки', write: 'Письмо', listen: 'Аудирование', sentence: 'Фразы', hsk: 'Словарный тест HSK' },
    order: { random: 'Случайно', weak: 'Слабые', new: 'Новые' },
  };
  const TAB_OF = { home: 'home', settings: 'home', profile: 'home', decks: 'decks', deck: 'decks', card: 'decks', import: 'decks', learn: 'decks', program: 'decks', feed: 'decks', sprint: 'decks', 'sprint-result': 'decks', boss: 'hsk', fight: 'hsk', 'fight-result': 'hsk', setup: 'setup', quiz: 'setup', result: 'setup', hsk: 'hsk', stats: 'stats', attempt: 'stats' };

  /* ── встроенные HSK ── */
  const builtinDecks = [1, 2, 3].map(l => ({ id: 'hsk' + l, name: 'HSK ' + l, builtin: true, level: l, desc: ['базовая лексика', 'повседневная лексика', 'расширенная лексика'][l - 1] }));
  builtinDecks.push({ id: 'freq1', name: 'HSK 4', builtin: true, level: 4, desc: 'средний уровень · 中级' });
  const hskCards = [];
  [1, 2, 3].forEach(l => window.HSK[l].forEach(e => hskCards.push({ id: 'hsk' + l + ':' + e[0], hanzi: e[0], pinyin: e[1], ru: e[2], note: '', deckId: 'hsk' + l, builtin: true })));
  const freqCards = window.FREQ.map(e => ({ id: 'freq1:' + e[0], hanzi: e[0], pinyin: e[1], ru: e[2], note: '', deckId: 'freq1', builtin: true }));
  const builtinCards = [...hskCards, ...freqCards];
  const sentCards = window.Sentences.ITEMS.map(it => ({ id: 'sent:' + it.id, hanzi: it.q, pinyin: it.a[0], ru: it.ru, note: '', deckId: null, builtin: true }));
  const cardIndex = {};
  function reindex() { for (const k in cardIndex) delete cardIndex[k]; builtinCards.forEach(c => { cardIndex[c.id] = c; }); sentCards.forEach(c => { cardIndex[c.id] = c; }); state.cards.forEach(c => { cardIndex[c.id] = c; }); }
  const allDecks = () => [...state.decks, ...builtinDecks];
  const deckById = id => allDecks().find(d => d.id === id);
  const cardsOfDeck = id => (String(id).startsWith('hsk') || String(id).startsWith('freq') ? builtinCards : state.cards).filter(c => c.deckId === id);
  const cardsOfDecks = ids => ids.flatMap(cardsOfDeck);
  function deckAccuracy(cards) {
    let asked = 0, correct = 0;
    for (const c of cards) { const s = state.cardStats[c.id]; if (s) { asked += s.asked; correct += s.correct; } }
    return asked ? Math.round(correct / asked * 100) : null;
  }
  const accClass = acc => acc >= 80 ? 'good' : acc >= 50 ? 'mid' : 'bad';

  /* ── сохранение ── */
  let saveTimer = null;
  async function persistNow() {
    clearTimeout(saveTimer); saveTimer = null;
    try { await Store.set('settings', state.settings); await Store.set('decks', state.decks); await Store.set('cards', state.cards); if (state.campaign) await Store.set('campaign', state.campaign); if (state.meta) await Store.set('meta', state.meta); }
    catch (e) { toast('Не удалось сохранить: ' + e.message); }
  }
  function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(persistNow, 120); }
  /* При сворачивании или закрытии — записать немедленно, не дожидаясь дебаунса */
  window.addEventListener('pagehide', () => { persistNow(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persistNow(); });
  const PENDING_KEY = 'zika:pendingAttempts';
  function stashPending(a) {
    try { const l = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); l.push(a); localStorage.setItem(PENDING_KEY, JSON.stringify(l)); } catch (e) { /* ignore */ }
  }
  async function flushPending() {
    let l = [];
    try { l = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]'); } catch (e) { return; }
    if (!l.length) return;
    try {
      await Store.putAttempts(l);
      const have = new Set(state.attempts.map(a => a.id));
      for (const a of l) if (!have.has(a.id)) state.attempts.push(a);
      state.attempts.sort((x, y) => x.ts - y.ts);
      localStorage.removeItem(PENDING_KEY);
      toast('Восстановлено несохранённых попыток: ' + l.length, 3000);
    } catch (e) { /* останутся до следующего запуска */ }
  }
  async function saveAttempt(a) {
    if (a.points == null) a.points = Campaign.attemptPoints(a);
    /* Деградация: низкоуровневый и уже отработанный за неделю материал платит меньше */
    if (!a.aborted && a.points > 0) {
      const d = Campaign.decay(state, a);
      a.decay = d;
      a.pointsRaw = a.points;
      a.points = Math.round(a.points * d.mult);
    }
    Campaign.noteUnit(state, a);
    if (!state.campaign) state.campaign = Campaign.create();
    const c = state.campaign;
    const before = Campaign.todayState(c, state.attempts), rb = Campaign.rankIndex(Campaign.effectiveDays(c, state.attempts));
    state.attempts.push(a);
    state.cardStats = Stats.cardStats(state.attempts);
    try { await Store.putAttempt(a); } catch (e) {
      try { await Store.putAttempt(a); } catch (e2) { stashPending(a); toast('Попытка сохранена в резервную очередь — запишется при следующем запуске', 3500); }
    }
    Campaign.process(c, state.attempts);
    const after = Campaign.todayState(c, state.attempts), ra = Campaign.rankIndex(Campaign.effectiveDays(c, state.attempts));
    c.rankPeak = Math.max(c.rankPeak || 0, ra);
    const chests = Campaign.grantChests(c, state.attempts);
    await persistNow();
    updateBadge();
    Push.report(after);
    return { cap: !before.done && after.done, ultra: !before.ultra && after.ultra, rankUp: ra > rb, rank: ra, points: a.points, chest: chests > 0 };
  }

  /* ── форматирование ── */
  const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const fmt = {
    date(ts) { const d = new Date(ts); const now = new Date(); const y = d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : ''; return d.getDate() + ' ' + MONTHS[d.getMonth()] + y + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); },
    dur(ms) { ms = Math.max(0, ms || 0); const s = Math.round(ms / 1000); if (s < 60) return s + ' с'; const m = Math.floor(s / 60); if (m < 60) return m + ' мин' + (s % 60 ? ' ' + (s % 60) + ' с' : ''); const h = Math.floor(m / 60); return h + ' ч ' + (m % 60) + ' мин'; },
    clock(ms) { const s = Math.round(Math.max(0, ms || 0) / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(sec).padStart(2, '0'); },
    secs(ms) { return (Math.round((ms || 0) / 100) / 10).toFixed(1) + ' с'; },
    plural(n, one, few, many) { const m10 = n % 10, m100 = n % 100; return n + ' ' + (m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many); },
  };
  const lenClass = s => { const n = String(s).replace(/[…\s]/g, '').length; return n >= 5 ? 'len5' : n === 4 ? 'len4' : n === 3 ? 'len3' : ''; };
  function renderPart(card, part, size) {
    if (part === 'hanzi') return `<div class="hanzi ${size === 'big' ? 'big-hanzi' : 'mid'} ${lenClass(card.hanzi)}">${esc(card.hanzi)}</div>`;
    if (part === 'pinyin') return `<div class="pinyin ${size === 'big' ? 'big' : ''}">${esc(card.pinyin)}</div>`;
    return `<div class="ru ${size === 'big' ? 'big' : ''}">${esc(card.ru)}</div>`;
  }
  function attemptRow(a) {
    const diff = a.mode === 'flip' ? '' : ' · ' + LABELS.diff[a.difficulty];
    const tag = a.mode === 'hsk' ? (a.passed ? ' · сдан' : ' · не сдан') : '';
    return `<button class="row tap" data-go="attempt" data-params="${attr({ id: a.id })}"><div><div class="row-t">${LABELS.mode[a.mode] || a.mode}${a.level ? ' ' + a.level : ''}${a.mode === 'hsk' ? '' : ' · ' + esc(a.deckName)}</div><div class="row-s">${fmt.date(a.ts)}${diff} · ${fmt.plural(a.total, 'вопрос', 'вопроса', 'вопросов')} · ${fmt.dur(a.durationMs)}${tag}${a.aborted ? ' · прервана' : ''}</div></div><div class="row-r"><span class="badge ${accClass(a.percent)}">${a.percent}%</span><span class="chev">›</span></div></button>`;
  }
  function answerText(q) {
    const a = q.answer || {};
    if (a.self != null) return a.self ? 'знал' : 'не знал';
    if (a.timeout && (a.choice === -1 || (a.input && !Object.values(a.input).some(v => v && String(v).trim())))) return 'время вышло';
    if (a.choiceText != null) return a.choiceText;
    if (a.input) return q.guess.map(p => (a.input[p] || '—')).join(' · ');
    return '—';
  }
  function questionRow(q) {
    const cls = q.ok ? 'ok' : q.fraction > 0 ? 'half' : 'bad';
    const mark = q.ok ? '✓' : q.fraction > 0 ? '½' : '✗';
    const ans = esc(answerText(q));
    return `<div class="qrow ${cls}"><div class="qrow-main"><span class="hanzi sm">${esc(q.hanzi)}</span><span class="pinyin sm">${esc(q.pinyin)}</span><div class="ru sm">${esc(q.ru)}</div></div><div class="qrow-ans">${q.ok ? '' : '<b>' + ans + '</b><br>'}${LABELS.part[q.show]} → ${q.guess.map(p => LABELS.part[p]).join('+')}${q.ms ? '<br>' + fmt.secs(q.ms) : ''}</div><div class="qrow-mark">${mark}</div></div>`;
  }

  /* ── UI-помощники ── */
  let toastT = null;
  function toast(msg, ms = 2200) { const el = $('#toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), ms); }
  function flash(kind) { const el = $('#flash'); el.className = ''; void el.offsetWidth; el.className = kind; }
  function sheet(html, mount) { const m = $('#modal'), s = $('#sheet'); s.innerHTML = html; m.classList.add('open'); if (mount) mount(s); }
  function closeSheet() { $('#modal').classList.remove('open'); $('#sheet').innerHTML = ''; }
  function confirm(msg, { ok = 'Да', danger = false, cancel = 'Отмена', title = '' } = {}) {
    return new Promise(res => {
      sheet(`${title ? `<h3 class="sh-t">${esc(title)}</h3>` : ''}<p style="margin:4px 0 16px;color:var(--ink-2)">${esc(msg)}</p><div class="btns row2 mt0"><button class="btn btn-secondary" id="c-no">${esc(cancel)}</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="c-ok">${esc(ok)}</button></div>`, s => {
        $('#c-no', s).onclick = () => { closeSheet(); res(false); };
        $('#c-ok', s).onclick = () => { closeSheet(); res(true); };
      });
    });
  }
  function applyTheme() {
    const t = state.settings.theme;
    if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    const meta = $('meta[name=theme-color]');
    if (meta) meta.content = '#6e1b2b';
  }

  /* ── навигация ── */
  const stack = [];
  let historyOk = true;
  function nav(view, params = {}, opts = {}) {
    state.view = view; state.params = params;
    const st = { view, params };
    if (opts.replace && stack.length) stack[stack.length - 1] = st; else stack.push(st);
    if (stack.length > 60) stack.shift();
    try { if (opts.replace) history.replaceState(st, ''); else history.pushState(st, ''); } catch (e) { historyOk = false; }
    render();
  }
  function back() {
    if (historyOk && history.state && history.state.view && history.state.view !== 'home' && history.length > 1) { history.back(); return; }
    if (stack.length > 1) { stack.pop(); const st = stack[stack.length - 1]; state.view = st.view; state.params = st.params || {}; render(); return; }
    nav('home', {}, { replace: true });
  }
  let lastRoute = null;
  function render() {
    const v = views[state.view] || views.home;
    const root = $('#view');
    const route = state.view + '|' + JSON.stringify(state.params || {});
    const moved = route !== lastRoute;           /* наверх прокручиваем только при переходе на другой экран */
    const keep = moved ? 0 : (window.scrollY || document.documentElement.scrollTop || 0);
    root.innerHTML = v.render(state.params) || '';
    lastRoute = route;
    if (moved) window.scrollTo(0, 0);
    else if (keep) window.scrollTo(0, keep);
    document.body.classList.toggle('no-tabs', state.view === 'quiz' || state.view === 'exam');
    if (pendingReload && state.view !== 'quiz' && state.view !== 'exam') { pendingReload = false; toast('Применяю обновление…', 2500); setTimeout(() => location.reload(), 700); }
    const tab = TAB_OF[state.view];
    $$('#tabbar .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    if (v.mount) v.mount(state.params);
  }
  window.addEventListener('popstate', e => {
    const st = e.state || { view: 'home', params: {} };
    state.view = st.view || 'home'; state.params = st.params || {};
    if (stack.length > 1) stack.pop();
    closeSheet();
    render();
  });

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-go],[data-action],[data-back],[data-close]');
    if (!el || el.disabled) return;
    if (!el.hasAttribute('data-nosound')) Sound.click();
    if (el.hasAttribute('data-close')) { e.preventDefault(); closeSheet(); return; }
    if (el.hasAttribute('data-back')) { e.preventDefault(); back(); return; }
    if (el.dataset.go) {
      e.preventDefault();
      let p = {};
      try { p = el.dataset.params ? JSON.parse(el.dataset.params) : {}; } catch (err) { p = {}; }
      closeSheet();
      nav(el.dataset.go, p, { replace: el.hasAttribute('data-replace') });
      return;
    }
    const fn = actions[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeSheet(); });

  /* ── экспорт / импорт ── */
  function exportData() {
    return { app: 'zika', version: VERSION, schema: Vault.SCHEMA, exportedAt: new Date().toISOString(), settings: state.settings, decks: state.decks, cards: state.cards, attempts: state.attempts, campaign: state.campaign, meta: state.meta };
  }
  async function shareJSON(obj, name) {
    const text = JSON.stringify(obj, null, 1);
    try {
      const file = new File([text], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return true; }
    } catch (e) { if (e && e.name === 'AbortError') return false; }
    return downloadText(text, name, 'application/json');
  }
  function downloadText(text, name, type = 'text/plain') {
    try {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
      return true;
    } catch (e) { toast('Не удалось сохранить файл'); return false; }
  }
  async function importData(obj, mode) {
    if (!obj || obj.app !== 'zika') throw new Error('Это не файл резервной копии 字卡');
    const decks = Array.isArray(obj.decks) ? obj.decks : [], cards = Array.isArray(obj.cards) ? obj.cards : [], attempts = Array.isArray(obj.attempts) ? obj.attempts : [];
    if (mode === 'replace') {
      state.decks = decks; state.cards = cards; state.attempts = attempts.slice().sort((a, b) => a.ts - b.ts);
      await Store.clearAttempts(); await Store.putAttempts(state.attempts);
    } else {
      const dIds = new Set(state.decks.map(d => d.id)), cIds = new Set(state.cards.map(c => c.id)), aIds = new Set(state.attempts.map(a => a.id));
      decks.forEach(d => { if (!dIds.has(d.id)) state.decks.push(d); });
      cards.forEach(c => { if (!cIds.has(c.id)) state.cards.push(c); });
      const newA = attempts.filter(a => !aIds.has(a.id));
      state.attempts.push(...newA); state.attempts.sort((a, b) => a.ts - b.ts);
      await Store.putAttempts(newA);
    }
    if (obj.settings) Object.assign(state.settings, obj.settings);
    if (obj.campaign && (mode === 'replace' || !state.campaign || (obj.campaign.days || 0) > (state.campaign.days || 0))) state.campaign = obj.campaign;
    if ((obj.schema || 1) < Vault.SCHEMA) { const ctx = { meta: { schema: obj.schema || 1 }, settings: state.settings, decks: state.decks, cards: state.cards, attempts: state.attempts, campaign: state.campaign }; await Vault.migrate(ctx); }
    if (!state.campaign) state.campaign = Campaign.create();
    Campaign.process(state.campaign, state.attempts);
    reindex(); state.cardStats = Stats.cardStats(state.attempts); applyTheme(); Sound.setEnabled(state.settings.sound); persist();
    return { decks: decks.length, cards: cards.length, attempts: attempts.length };
  }

  /* Бейдж на иконке: после полудня, пока переход не набран */
  function updateBadge() {
    try {
      if (!('setAppBadge' in navigator)) return;
      const t = Campaign.todayState(state.campaign || Campaign.create(), state.attempts);
      if (!t.done && new Date().getHours() >= 12 && state.campaign && state.campaign.startedAt) navigator.setAppBadge(1);
      else navigator.clearAppBadge && navigator.clearAppBadge();
    } catch (e) { /* ignore */ }
  }
  /* Панель Наставника Луна на главной */
  function dragonPanel() {
    const ds = Dragon.state(state.campaign, state.attempts);
    if (!ds) return '';
    const btn = ds.quiet && ds.kind !== 'morning'
      ? `<button class="btn btn-secondary btn-sm" data-go="setup">Ещё позаниматься</button>`
      : `<button class="btn ${ds.mood >= 2 ? 'btn-danger' : 'btn-primary'} btn-sm" data-go="setup">Тренироваться · ещё ${Math.round(ds.t.toCap)}</button>`;
    return `<div class="panel dragon m-${ds.quiet ? 0 : ds.mood}"><img class="dragon-img" src="${IMG_URL(ds.img)}" alt="" draggable="false"><div class="grow"><div class="dragon-t">${esc(ds.title)}</div><div class="dragon-x">${esc(ds.text)}</div>${btn}</div></div>`;
  }
  /* Приглашение включить пуши — прямо на главной, пока они выключены */
  let pushSt = null;
  function pushInvite() {
    if (pushSt === null || pushSt === 'on' || pushSt === 'unconfigured') return '';
    if (pushSt === 'denied') {
      return `<div class="panel push-invite"><div class="pi-t"><span class="pi-ico">🔕</span>Лун не может достучаться</div><div class="pi-x">Уведомления для 字卡 запрещены. Включить: Настройки iPhone → Уведомления → 字卡 → «Допуск уведомлений».</div></div>`;
    }
    if (pushSt === 'unsupported') {
      if (Push.standalone()) return '';
      return `<div class="panel push-invite"><div class="pi-t"><span class="pi-ico">🔔</span>Лун живёт только в установленном приложении</div><div class="pi-x">В браузере напоминания не работают. Нажмите «Поделиться» → «На экран «Домой», откройте 字卡 с домашнего экрана — и Лун сможет писать.</div></div>`;
    }
    return `<div class="panel push-invite"><div class="pi-t"><span class="pi-ico">🔔</span>Лун хочет напоминать о тренировке</div><div class="pi-x">Он пишет с полудня, если очков за день не хватает, и тем настойчивее, чем ближе вечер. Не больше четырёх раз в день.</div><button class="btn btn-primary btn-sm" data-action="push-on">Разрешить напоминания</button></div>`;
  }
  function refreshPushState() {
    if (!window.Push) return;
    Push.status().then(st => { if (st !== pushSt) { pushSt = st; render(); } }).catch(() => {});
  }
  function maybeNag() {
    const ds = Dragon.state(state.campaign, state.attempts);
    if (!ds || ds.quiet || ds.mood < 2) return;
    const today = Stats.dayKey(Date.now());
    if (state.settings.dragonDay === today) return;
    state.settings.dragonDay = today; persist();
    Sound.fail();
    sheet(`<div class="rankup-card"><img class="dragon-big" src="${IMG_URL(ds.img)}" alt=""><div class="rank-ru">${esc(ds.title)}</div><div class="bio" style="font-size:15px;margin-top:8px">${esc(ds.text)}</div></div><div class="btns"><button class="btn btn-primary btn-block" data-go="setup">Тренироваться</button><button class="btn btn-secondary btn-block" data-close>Позже</button></div>`);
  }

  /* ── главная ── */
  const PROVERBS = [
    ['学而时习之，不亦说乎', 'xué ér shí xí zhī, bú yì yuè hū', 'Учиться и вовремя повторять — разве это не радость?'],
    ['千里之行，始于足下', 'qiān lǐ zhī xíng, shǐ yú zú xià', 'Путь в тысячу ли начинается с первого шага'],
    ['温故而知新', 'wēn gù ér zhī xīn', 'Повторяя старое, узнаёшь новое'],
    ['熟能生巧', 'shú néng shēng qiǎo', 'Мастерство приходит с практикой'],
    ['活到老，学到老', 'huó dào lǎo, xué dào lǎo', 'Век живи — век учись'],
    ['有志者事竟成', 'yǒu zhì zhě shì jìng chéng', 'Кто имеет волю — добьётся своего'],
    ['一日之计在于晨', 'yí rì zhī jì zài yú chén', 'День планируют с утра'],
    ['滴水穿石', 'dī shuǐ chuān shí', 'Капля камень точит'],
    ['不怕慢，就怕站', 'bú pà màn, jiù pà zhàn', 'Не бойся идти медленно — бойся остановиться'],
    ['读书百遍，其义自见', 'dú shū bǎi biàn, qí yì zì xiàn', 'Прочти сто раз — смысл откроется сам'],
    ['三人行，必有我师', 'sān rén xíng, bì yǒu wǒ shī', 'Среди троих идущих всегда найдётся мой учитель'],
    ['失败是成功之母', 'shībài shì chénggōng zhī mǔ', 'Неудача — мать успеха'],
    ['冰冻三尺，非一日之寒', 'bīng dòng sān chǐ, fēi yí rì zhī hán', 'Лёд в три чи не в один день намерзает'],
    ['学如逆水行舟，不进则退', 'xué rú nì shuǐ xíng zhōu, bú jìn zé tuì', 'Учёба — как лодка против течения: не идёшь вперёд — сносит назад'],
  ];
  views.home = {
    render() {
      const ov = Stats.overview(state.attempts);
      const todayKey = Stats.dayKey(Date.now());
      const today = state.attempts.filter(a => Stats.dayKey(a.ts) === todayKey);
      const tOv = Stats.overview(today);
      const hour = new Date().getHours();
      const greet = hour < 5 ? '夜安 · Доброй ночи' : hour < 12 ? '早安 · Доброе утро' : hour < 18 ? '午安 · Добрый день' : '晚安 · Добрый вечер';
      const recent = state.attempts.slice(-4).reverse();
      const doy = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 864e5);
      const pv = PROVERBS[doy % PROVERBS.length];
      const mastered = Object.values(state.cardStats).filter(s => s.mastered).length;
      return `
      <div class="vh"><div class="seal">字</div><div class="grow"><h1 class="title">字卡</h1><div class="sub">Карточки китайского · HSK 1–3</div></div>${App.Profile.avatarButton()}<button class="icon-btn" data-go="settings" aria-label="Настройки">⚙</button></div>
      ${App.Profile.homePanel()}
      ${dragonPanel()}
      ${pushInvite()}
      <div class="panel ornate hero">
        <div class="hero-greet">${greet}</div>
        <div class="hero-row">
          <div><div class="v">${ov.streak}</div><div class="l">${fmt.plural(ov.streak, 'день', 'дня', 'дней').replace(/^\d+ /, '')} подряд</div></div>
          <div><div class="v">${tOv.attempts}</div><div class="l">попыток сегодня</div></div>
          <div><div class="v">${tOv.attempts ? tOv.avgPercent + '%' : '—'}</div><div class="l">средний сегодня</div></div>
        </div>
        <div class="proverb"><div class="hanzi">${pv[0]}</div><div class="pinyin" style="text-align:left">${pv[1]}</div><div class="ru">${pv[2]}</div></div>
      </div>
      <div class="grid2">
        <button class="big-btn t-boss" data-go="boss"><svg class="deco" viewBox="0 0 100 100"><path d="M50 8 L62 34 L90 38 L69 58 L75 88 L50 74 L25 88 L31 58 L10 38 L38 34 Z" fill="currentColor"/></svg><span class="bi">斗</span><span>Боссы</span><small>голосом · раз в 10 минут</small></button>
        <button class="big-btn t-prog" data-go="program"><svg class="deco" viewBox="0 0 100 100"><path d="M14 16 h72 v14 h-72 z M14 42 h50 v12 h-50 z M14 66 h64 v12 h-64 z" fill="currentColor"/></svg><span class="bi">学</span><span>Программа</span><small>блоки · грамматика · спринты</small></button>
        <button class="big-btn t-brush" data-go="setup"><svg class="deco" viewBox="0 0 100 100"><path d="M8 78 C 30 40, 46 46, 60 30 C 70 18, 86 12, 96 10 C 84 22, 76 36, 64 48 C 50 62, 36 74, 12 84 Z" fill="currentColor"/></svg><span class="bi">练</span><span>Тренировка</span><small>выбор · карточки · письмо · аудио</small></button>
        <button class="big-btn t-seal" data-go="hsk"><svg class="deco" viewBox="0 0 100 100"><rect x="18" y="18" width="64" height="64" rx="8" fill="none" stroke="currentColor" stroke-width="7"/><rect x="34" y="34" width="32" height="32" rx="3" fill="currentColor"/></svg><span class="bi">考</span><span>HSK-тест</span><small>уровни 1–3</small></button>
        <button class="big-btn t-cards" data-go="decks"><svg class="deco" viewBox="0 0 100 100"><rect x="30" y="10" width="46" height="64" rx="7" fill="none" stroke="currentColor" stroke-width="6" transform="rotate(12 53 42)"/><rect x="18" y="22" width="46" height="64" rx="7" fill="currentColor" transform="rotate(-6 41 54)"/></svg><span class="bi">卡</span><span>Колоды</span><small>${fmt.plural(state.cards.length, 'своя карточка', 'свои карточки', 'своих карточек')}</small></button>
        <button class="big-btn t-bars" data-go="stats"><svg class="deco" viewBox="0 0 100 100"><rect x="12" y="58" width="16" height="32" rx="3" fill="currentColor"/><rect x="36" y="40" width="16" height="50" rx="3" fill="currentColor"/><rect x="60" y="22" width="16" height="68" rx="3" fill="currentColor"/><path d="M14 50 L44 30 L68 12 L90 6" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg><span class="bi">计</span><span>Статистика</span><small>${fmt.plural(ov.attempts, 'попытка', 'попытки', 'попыток')} · освоено ${mastered}</small></button>
      </div>
      <h2 class="h2">Недавние попытки</h2>
      ${recent.length ? recent.map(attemptRow).join('') : '<div class="empty">Ещё не было ни одной попытки. Начните с тренировки или HSK-теста.</div>'}`;
    },
  };

  /* ── настройки ── */
  views.settings = {
    render() {
      const s = state.settings;
      const modeName = { idb: 'IndexedDB (надёжно)', ls: 'localStorage', mem: 'только память — данные НЕ сохраняются между запусками (режим превью)' }[state.storeMode];
      const standalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
      return `
      <div class="vh"><button class="icon-btn" data-back>‹</button><div class="grow"><h1 class="title">Настройки</h1><div class="sub">设置</div></div></div>
      <div class="panel">
        <div class="switch"><div><div class="row-t">Звуки</div><div class="row-s">Кнопки, удача, неудача, финал</div></div><button class="toggle ${s.sound ? 'on' : ''}" data-action="set-sound" data-nosound aria-label="Звуки"></button></div>
        <div class="flabel mt">Тема</div>
        <div class="seg">${[['auto', 'Как в системе'], ['light', 'Светлая'], ['dark', 'Тёмная']].map(([v, l]) => `<button class="${s.theme === v ? 'on' : ''}" data-action="set-theme" data-val="${v}">${l}</button>`).join('')}</div>
      </div>
      <div class="panel">
        <div class="flabel">Данные</div>
        <div class="btns mt0"><button class="btn btn-secondary btn-block" data-action="export-all">Экспорт резервной копии (JSON)</button><button class="btn btn-secondary btn-block" data-action="import-all">Импорт из резервной копии</button></div>
        <div class="hint">Копия включает свои колоды, карточки, все попытки и настройки. Сохраните её в «Файлы» или iCloud.</div>
        <input type="file" id="import-file" accept="application/json,.json" style="display:none">
      </div>
      <div class="panel">
        <div class="flabel">Уведомления Наставника Луна</div>
        <div class="hint" id="push-box" style="margin-top:0">Проверяю…</div>
        <div class="btns mt0" id="push-btns"></div>
        <div class="hint">Пуши приходят с полудня, пока не набран Переход, и мрачнеют к вечеру (не чаще 4 в день, до 23:00). Работают только у приложения с экрана «Домой», iOS 16.4+. На сервер уходят только анонимная подписка и число очков за день.</div>
      </div>
      <div class="panel">
        <div class="flabel">Опасная зона</div>
        <div class="btns mt0"><button class="btn btn-danger btn-block" data-action="clear-stats">Очистить всю статистику</button><button class="btn btn-danger btn-block" data-action="clear-decks">Удалить все свои колоды</button></div>
      </div>
      <div class="panel">
        <div class="flabel">Установка на iPhone</div>
        <div class="install-note">${standalone ? 'Приложение запущено с экрана «Домой» ✓' : 'В Safari нажмите <b>Поделиться</b> → <b>На экран «Домой»</b>. Откроется на весь экран и будет работать без сети.'}</div>
        <a class="btn btn-secondary btn-block mt" href="help.html" target="_blank" rel="noopener" data-nosound>Инструкция и правила похода</a>
        <button class="btn btn-secondary btn-sm btn-block" data-action="check-update">Проверить обновления</button>
        <div class="hint">Версия ${VERSION} · схема данных ${state.meta ? state.meta.schema : '—'} · Хранилище: ${modeName} · Карточек: ${hskCards.length + state.cards.length} · Попыток: ${state.attempts.length}</div>
        <div class="hint" id="backup-info">Резервные копии: …</div>
      </div>`;
    },
    mount() {
      (async () => {
        const box = $('#push-box'), btns = $('#push-btns');
        if (!box) return;
        const st = await Push.status();
        const msg = { unconfigured: 'Сервер уведомлений готовится — кнопка появится после его запуска.', unsupported: Push.standalone() ? 'Это устройство не поддерживает веб-пуши.' : 'Откройте приложение с иконки на экране «Домой» — в Safari пуши не работают.', denied: 'Уведомления запрещены. Разрешите их: Настройки iPhone → 字卡 → Уведомления.', off: 'Выключены.', on: 'Включены ✓ — Лун напомнит о переходе.' }[st];
        box.textContent = msg;
        btns.innerHTML = st === 'off' ? '<button class="btn btn-primary btn-block" data-action="push-on">Включить напоминания</button>' : st === 'on' ? '<button class="btn btn-secondary btn-block" data-action="push-test">Проверить пуш</button><button class="btn btn-secondary btn-block" data-action="push-off">Выключить</button>' : '';
      })();
      Vault.listBackups().then(list => { const el = $('#backup-info'); if (el) el.textContent = list.length ? 'Резервные копии в хранилище: ' + list.map(b => (b.key === 'backup:auto' ? 'ежедневная' : 'перед обновлением схемы ' + b.schema) + ' (' + fmt.date(b.at) + ', попыток ' + b.attempts + ')').join('; ') + '. Обновления приложения прогресс не трогают.' : 'Резервные копии появятся после первого дня использования. Обновления приложения прогресс не трогают.'; });
      const inp = $('#import-file');
      if (inp) inp.addEventListener('change', async () => {
        const f = inp.files && inp.files[0]; if (!f) return;
        try {
          const obj = JSON.parse(await f.text());
          const n = { d: (obj.decks || []).length, c: (obj.cards || []).length, a: (obj.attempts || []).length };
          sheet(`<h3 class="sh-t">Импорт копии</h3><p style="color:var(--ink-2)">В файле: колод ${n.d}, карточек ${n.c}, попыток ${n.a}.</p><div class="btns"><button class="btn btn-primary btn-block" id="imp-merge">Объединить с текущими</button><button class="btn btn-danger btn-block" id="imp-replace">Заменить всё</button><button class="btn btn-secondary btn-block" data-close>Отмена</button></div>`, s => {
            $('#imp-merge', s).onclick = async () => { closeSheet(); await importData(obj, 'merge'); toast('Импортировано'); render(); };
            $('#imp-replace', s).onclick = async () => { closeSheet(); if (await confirm('Текущие колоды и вся статистика будут заменены содержимым файла.', { ok: 'Заменить', danger: true })) { await importData(obj, 'replace'); toast('Заменено'); render(); } };
          });
        } catch (e) { toast('Не удалось прочитать файл: ' + e.message, 3500); }
        inp.value = '';
      });
    },
  };
  actions['set-sound'] = el => { state.settings.sound = !state.settings.sound; Sound.setEnabled(state.settings.sound); el.classList.toggle('on', state.settings.sound); if (state.settings.sound) Sound.ok(); persist(); };
  actions['set-theme'] = el => { state.settings.theme = el.dataset.val; applyTheme(); persist(); render(); };
  actions['export-all'] = async () => { const ok = await shareJSON(exportData(), 'zika-backup-' + Stats.dayKey(Date.now()) + '.json'); if (ok) toast('Копия подготовлена'); };
  actions['import-all'] = () => { const i = $('#import-file'); if (i) i.click(); };
  actions['check-update'] = async el => {
    el.disabled = true;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) { toast('Обновления работают только у установленного приложения с сетью'); el.disabled = false; return; }
      toast('Проверяю…', 1500);
      await reg.update();
      setTimeout(() => { if (!pendingReload) toast('У вас последняя версия · ' + VERSION, 3000); }, 3000);
    } catch (e) { toast('Не удалось проверить: ' + e.message, 3000); }
    el.disabled = false;
  };
  actions['push-on'] = async el => {
    el.disabled = true;
    try { await Push.enable(); pushSt = 'on'; toast('Напоминания включены — Лун на связи'); } catch (e) { toast('Не получилось: ' + e.message, 3500); }
    render();
  };
  actions['push-off'] = async () => { await Push.disable(); pushSt = 'off'; toast('Напоминания выключены'); render(); };
  actions['push-test'] = async el => { el.disabled = true; try { await Push.test(); toast('Отправлено — пуш придёт в течение пары секунд'); } catch (e) { toast('Не получилось: ' + e.message, 3500); } el.disabled = false; };
  actions['clear-stats'] = async () => {
    if (!await confirm('Удалить все ' + fmt.plural(state.attempts.length, 'попытку', 'попытки', 'попыток') + ' и статистику по карточкам? Это необратимо.', { ok: 'Удалить', danger: true, title: 'Очистить статистику' })) return;
    await Store.clearAttempts(); state.attempts = []; state.cardStats = {}; toast('Статистика очищена'); render();
  };
  actions['clear-decks'] = async () => {
    if (!await confirm('Удалить все свои колоды и ' + fmt.plural(state.cards.length, 'карточку', 'карточки', 'карточек') + '? Встроенные HSK останутся.', { ok: 'Удалить', danger: true, title: 'Удалить колоды' })) return;
    state.decks = []; state.cards = []; reindex(); persist(); toast('Колоды удалены'); render();
  };

  /* ── запуск ── */
  let pendingReload = false;
  function registerSW() {
    if (!('serviceWorker' in navigator) || location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') return;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').then(reg => { reg.update().catch(() => {}); }).catch(() => {});
    let reloaded = false;
    /* Новая версия активировалась — применяем сами: перезагрузка, когда это безопасно */
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded) return;
      reloaded = true;
      if (state.view === 'quiz' || state.view === 'exam') { pendingReload = true; toast('Обновление готово — применится после тренировки', 4000); }
      else { toast('Применяю обновление…', 2500); setTimeout(() => location.reload(), 700); }
    });
  }
  async function init() {
    try {
      state.storeMode = await Store.init();
      const s = await Store.get('settings'); if (s) Object.assign(state.settings, s);
      state.decks = (await Store.get('decks')) || [];
      state.cards = (await Store.get('cards')) || [];
      state.attempts = ((await Store.allAttempts()) || []).sort((a, b) => a.ts - b.ts);
      state.campaign = (await Store.get('campaign')) || null;
      state.meta = (await Store.get('meta')) || null;
      const ctx = { meta: state.meta, settings: state.settings, decks: state.decks, cards: state.cards, attempts: state.attempts, campaign: state.campaign };
      const mlog = await Vault.migrate(ctx);
      state.meta = ctx.meta;
      if (mlog.length) toast('Данные бережно перенесены в новую версию (схема ' + state.meta.schema + ')', 4000);
      if (!state.campaign) state.campaign = Campaign.create();
      const added = Campaign.process(state.campaign, state.attempts);
      const newChests = Campaign.grantChests(state.campaign, state.attempts);
      if (newChests) setTimeout(() => toast('За марш-бросок вас ждёт ' + fmt.plural(newChests, 'сундук', 'сундука', 'сундуков') + ' — в профиле', 4000), 1600);
      const missed = added.filter(e => e.r === 'miss').length, gainedDays = added.filter(e => e.r === 'done').length + 2 * added.filter(e => e.r === 'ultra').length;
      if (missed && !gainedDays) setTimeout(() => toast('Пропущено дней: ' + missed + ' — поход откатился на ' + fmt.plural(missed, 'день', 'дня', 'дней'), 4000), 800);
      else if (added.length) setTimeout(() => toast('Поход: +' + fmt.plural(gainedDays, 'день', 'дня', 'дней') + (missed ? ', пропусков ' + missed : ''), 3500), 800);
      state.meta.lastOpen = Date.now();
      Vault.autoBackup(ctx).catch(() => {});
    } catch (e) { toast('Ошибка хранилища: ' + e.message, 4000); }
    if (!state.campaign) state.campaign = Campaign.create();
    if (!state.meta) state.meta = { schema: Vault.SCHEMA, installedAt: Date.now() };
    if (!state.decks.length) { state.decks.push({ id: 'd-' + uid(), name: 'Мои слова', desc: '', createdAt: Date.now() }); persist(); }
    reindex();
    state.cardStats = Stats.cardStats(state.attempts);
    applyTheme(); Sound.setEnabled(state.settings.sound !== false); Sound.install();
    try { history.replaceState({ view: 'home', params: {} }, ''); } catch (e) { /* ignore */ }
    await flushPending();
    state.cardStats = Stats.cardStats(state.attempts);
    state.ready = true;
    render();
    updateBadge();
    setTimeout(maybeNag, 1200);
    refreshPushState();
    Push.report(Campaign.todayState(state.campaign, state.attempts));
    registerSW();
    const sp = $('#splash'); if (sp) { sp.classList.add('hide'); setTimeout(() => sp.remove(), 400); }
    if (state.storeMode === 'mem') toast('Режим превью: данные не сохраняются между запусками', 4000);
  }
  function boot() { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init(); }

  return {
    VERSION, state, views, actions, LABELS, fmt, esc, attr, uid, $, $$,
    builtinDecks, hskCards, cardIndex, reindex, allDecks, deckById, cardsOfDeck, cardsOfDecks, deckAccuracy, accClass,
    persist, saveAttempt, nav, back, render, toast, flash, sheet, closeSheet, confirm, renderPart, attemptRow, questionRow, answerText,
    exportData, importData, shareJSON, downloadText, boot, updateBadge, persistNow,
  };
})();
