/* Режим «Босс»: пять персонажей, таймеры, уровень по изученному, особый сундук, недельная память вопросов. */
window.Boss = (() => {
  const TRY_COOLDOWN = 10 * 60 * 1000;      /* попытка раз в 10 минут */
  const RESPAWN = 30 * 60 * 1000;           /* побеждённый воскресает через 30 минут */
  const MEMORY_TTL = 7 * 24 * 3600 * 1000;  /* что уже спрашивали — помним неделю */
  const ROUNDS = 5;

  const LIST = [
    { id: 'b1', img: 'boss-1', zh: '书虫先生', py: 'Shūchóng xiānsheng', ru: 'Господин Книжный Червь',
      lore: 'Панда-начётчик из башни свитков. Тысячу лет он переписывает одни и те же строки и уверен, что помнит больше всех на свете. Говорит медленно и снисходительно, любит переспрашивать простое.',
      style: 'дотошный, снисходительный, говорит короткими простыми фразами, придирается к мелочам',
      topic: 'приветствия, имена, семья, числа, простые бытовые вопросы',
      voice: { rate: 0.75, pitch: 0.9 }, lvl: 1, note: 'A',
      offset: -1, rounds: 4, lives: 3, hints: ['tr', 'start', 'opts'], sec: 0 },
    { id: 'b2', img: 'boss-2', zh: '茶博士', py: 'Chá bóshì', ru: 'Чайный Доктор',
      lore: 'Барсук держит чайную у горной дороги. Наливает всем, но платы просит словами: пока не расскажешь о себе — чашка не опустеет. Хитрый и радушный одновременно.',
      style: 'радушный, хитрый, задаёт бытовые вопросы про еду, время и погоду, поддакивает',
      topic: 'еда и напитки, время суток, погода, дом, привычки',
      voice: { rate: 0.85, pitch: 1.05 }, lvl: 1, note: 'C',
      offset: 0, rounds: 5, lives: 3, hints: ['tr', 'start', 'opts'], sec: 0 },
    { id: 'b3', img: 'boss-3', zh: '市井狐', py: 'Shìjǐng hú', ru: 'Базарная Лиса',
      lore: 'Торгует всем и сразу, считает быстрее счётов. Если запнёшься — тут же поднимет цену. Говорит скороговоркой, обожает торговаться.',
      style: 'быстрый, напористый, торгуется, спрашивает про цены, количества, покупки',
      topic: 'покупки, деньги, цены, счёт, магазин, торг',
      voice: { rate: 1.15, pitch: 1.15 }, lvl: 2, note: 'E',
      offset: 0, rounds: 5, lives: 2, hints: ['tr', 'start', 'opts'], sec: 25 },
    { id: 'b4', img: 'boss-4', zh: '笔吏', py: 'Bǐ lì', ru: 'Писарь-Журавль',
      lore: 'Чиновник с кистью наперевес. Проверяет не тебя, а твою грамматику, и ставит красную печать при первой же ошибке в порядке слов. Сух, точен, безжалостен.',
      style: 'сухой, официальный, придирается к грамматике и порядку слов, требует полных ответов',
      topic: 'учёба, работа, документы, грамматические конструкции, объяснения причин',
      voice: { rate: 0.9, pitch: 0.8 }, lvl: 3, note: 'G',
      offset: 1, rounds: 6, lives: 2, hints: ['tr', 'start'], sec: 20 },
    { id: 'b5', img: 'boss-5', zh: '虎将军', py: 'Hǔ jiāngjūn', ru: 'Тигр-Генерал',
      lore: 'Последний страж заставы. Не спрашивает — требует. Отвечать надо быстро и по существу, иначе гуаньдао опускается, и разговор окончен.',
      style: 'громкий, властный, рубит фразы, требует быстрых чётких ответов, давит',
      topic: 'планы, решения, путь и дорога, здоровье, воля и характер',
      voice: { rate: 1.0, pitch: 0.7 }, lvl: 4, note: 'D',
      offset: 1, rounds: 7, lives: 1, hints: ['tr'], sec: 15 },
  ];
  const byId = id => LIST.find(b => b.id === id);

  const st = s => (s.settings.boss || (s.settings.boss = { by: {}, memory: [], lastTry: 0 }));
  const bs = (s, id) => { const b = st(s); return b.by[id] || (b.by[id] = { wins: 0, clean: 0, tries: 0, defeatedAt: 0 }); };

  /* ── таймеры ── */
  const tryLeft = (s, now = Date.now()) => Math.max(0, st(s).lastTry + TRY_COOLDOWN - now);
  const respawnLeft = (s, id, now = Date.now()) => { const r = bs(s, id); return r.defeatedAt ? Math.max(0, r.defeatedAt + RESPAWN - now) : 0; };
  const ready = (s, id, now = Date.now()) => tryLeft(s, now) === 0 && respawnLeft(s, id, now) === 0;
  function fmtLeft(ms) {
    const t = Math.ceil(ms / 1000);
    const m = Math.floor(t / 60), sec = t % 60;
    return m ? m + ' мин ' + (sec < 10 ? '0' : '') + sec + ' с' : sec + ' с';
  }

  /* ── уровень: по верхней грани изученного ── */
  function levelOf(state) {
    const decks = { hsk1: 1, hsk2: 2, hsk3: 3, freq1: 4 };
    const cs = state.cardStats || {};
    const studied = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const [id, v] of Object.entries(cs)) {
      if (!v || (!v.asked && !v.mastered)) continue;
      const pref = String(id).split(':')[0];
      const l = decks[pref];
      if (l) studied[l]++;
    }
    const prog = (state.settings && state.settings.program) || {};
    for (const [bid, v] of Object.entries(prog)) {
      const lv = +String(bid).slice(1, 2);
      if (studied[lv] != null && v && v.seen) studied[lv] += v.seen.length;
    }
    let lvl = 1;
    for (const l of [2, 3, 4]) if (studied[l] >= 20) lvl = l;   /* верхняя грань — где набралось хотя бы 20 слов */
    return lvl;
  }

  /* ── недельная память сгенерированного ── */
  function recall(state, now = Date.now()) {
    const b = st(state);
    b.memory = (b.memory || []).filter(m => now - m.ts < MEMORY_TTL);
    return b.memory;
  }
  function remember(state, lines, now = Date.now()) {
    const b = st(state);
    recall(state, now);
    lines.forEach(t => b.memory.push({ t: String(t).slice(0, 40), ts: now }));
    if (b.memory.length > 400) b.memory = b.memory.slice(-400);
  }

  /* ── сундук босса: скромнее ультра-дневного, но с разбросом ── */
  function chest(boss, noHints, rnd = Math.random) {
    const base = 1 + (rnd() < 0.45 ? 1 : 0) + (boss.lvl >= 3 && rnd() < 0.35 ? 1 : 0);   /* 1–3 предмета против 3 в ультра-сундуке */
    const n = noHints ? base + (rnd() < 0.42 ? 1 : 0) : base;
    const items = [];
    for (let i = 0; i < n; i++) {
      let it = Treasures.rollItem(rnd);
      /* без подсказок — шанс, что предмет окажется ступенью выше */
      if (noHints && rnd() < 0.42 && it.rarity === 'common') { const pool = Treasures.ITEMS.filter(x => x.rarity === 'uncommon'); it = pool[Math.floor(rnd() * pool.length)]; }
      items.push(it.id);
    }
    return items;
  }
  const chestBonusPct = 30;   /* «полнее на 30%», если не тронул ни одной подсказки */

  /* Параметры конкретного боя: уровень речи считается от вашего, но каждый босс держит свою планку */
  function setup(state, boss, now = Date.now()) {
    const my = levelOf(state);
    const lvl = Math.max(1, Math.min(4, my + (boss.offset || 0)));
    return {
      my, lvl,
      rounds: boss.rounds || ROUNDS,
      lives: boss.lives || 2,
      hints: boss.hints || ['tr', 'start', 'opts'],
      sec: boss.sec || 0,                                  /* 0 — без таймера на ответ */
      hard: (boss.offset || 0) > 0,
    };
  }
  /* Насколько бой тяжелее прогулки — на это же множится награда */
  function weight(sp) {
    let w = 1;
    w += (sp.rounds - 5) * 0.08;              /* больше реплик */
    w += (3 - sp.lives) * 0.12;               /* меньше права на ошибку */
    w += (3 - sp.hints.length) * 0.1;         /* меньше подсказок */
    if (sp.sec) w += (30 - sp.sec) / 100;     /* жёстче время */
    if (sp.hard) w += 0.15;                   /* речь выше вашего уровня */
    return Math.round(w * 100) / 100;
  }
  return { LIST, byId, ROUNDS, TRY_COOLDOWN, RESPAWN, MEMORY_TTL, chestBonusPct, st, bs, tryLeft, respawnLeft, ready, fmtLeft, levelOf, recall, remember, chest, setup, weight };
})();
