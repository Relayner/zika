/* Арена боссов: выбор, бой на пять реплик голосом, три вида подсказок, особый сундук. */
(() => {
  const { state, views, actions, nav, esc, attr, uid, $, toast, sheet, closeSheet, persist, render, saveAttempt, fmt } = App;
  let fight = null;   /* { boss, sp, rounds, i, hints, used, wrong, heard } */
  /* Снимок незаконченного боя хранится вместе с прогрессом: переживает выход, перезагрузку и вылет */
  const pending = () => Boss.st(state).pending || null;
  function savePending() {
    if (!fight) return;
    Boss.st(state).pending = { id: fight.boss.id, rounds: fight.rounds, i: fight.i, wrong: fight.wrong, right: fight.right || 0,
      used: fight.used, hints: fight.hints, raged: !!fight.raged, src: fight.src, lvl: fight.lvl, startedAt: fight.startedAt };
    persist();
  }
  function clearPending() { const b = Boss.st(state); if (b.pending) { delete b.pending; persist(); } }
  let tick = null;

  const HINTS = [
    { k: 'tr', ico: '译', t: 'Перевод', d: 'Что сказал босс' },
    { k: 'start', ico: '首', t: 'Начало', d: 'Первые иероглифы ответа' },
    { k: 'opts', ico: '三', t: 'Три варианта', d: 'Выбрать из трёх' },
  ];

  /* ── арена ── */
  views.boss = {
    render() {
      const now = Date.now();
      const lvl = Boss.levelOf(state);
      const cd = Boss.tryLeft(state, now);
      const cards = Boss.LIST.map(b => {
        const r = Boss.bs(state, b.id);
        const sp = Boss.setup(state, b);
        const p0 = pending();
        const resume = p0 && p0.id === b.id ? p0 : null;
        const rs = Boss.respawnLeft(state, b.id, now);
        const locked = rs > 0 || cd > 0;
        const why = resume ? 'Бой не окончен — можно продолжить' : rs > 0 ? `Повержен · встанет через <b>${Boss.fmtLeft(rs)}</b>` : cd > 0 ? `Следующий вызов через <b>${Boss.fmtLeft(cd)}</b>` : 'Готов к бою';
        return `<div class="panel boss-card ${locked ? 'locked' : 'ready'}" data-boss="${b.id}">
          <img class="boss-por" src="${IMG_URL(b.img)}" alt="" draggable="false">
          <div class="grow">
            <div class="boss-n"><span class="zh">${esc(b.zh)}</span> · ${esc(b.ru)}</div>
            <div class="boss-lore">${esc(b.lore)}</div>
            <div class="boss-terms">речь <b>HSK ${sp.lvl}</b> · ${fmt.plural(sp.rounds, 'реплика', 'реплики', 'реплик')} · ${fmt.plural(sp.lives, 'ошибка', 'ошибки', 'ошибок')} · ${fmt.plural(sp.hints.length, 'подсказка', 'подсказки', 'подсказок')}${sp.sec ? ' · ' + sp.sec + ' с на ответ' : ''}${sp.rage ? ` · <b>звереет после ${sp.rage.at} верных</b>` : ''}</div>
            <div class="boss-meta">Побед: <b>${r.wins}</b> · без подсказок: <b>${r.clean}</b> · награда ×${Boss.weight(sp)}</div>
            <div class="boss-when">${why}</div>
            <button class="btn ${resume ? 'btn-jade' : locked ? 'btn-secondary' : 'btn-danger'} btn-sm" data-action="boss-go" data-id="${b.id}" ${locked && !resume ? 'disabled' : ''}>${resume ? `Продолжить бой · реплика ${resume.i + 1}` : 'Вызвать на бой'}</button>
          </div></div>`;
      }).join('');
      return `<div class="vh"><div class="seal">斗</div><div class="grow"><h1 class="title">Боссы</h1><div class="sub">пять реплик голосом · уровень HSK ${lvl}</div></div><button class="icon-btn" data-action="boss-info" aria-label="Правила">i</button></div>
      <div class="panel" id="boss-cd" style="${cd > 0 ? '' : 'display:none'}"><div class="hint" style="margin:0">Вызов доступен раз в 10 минут. Осталось <b>${Boss.fmtLeft(cd)}</b>.</div></div>
      ${cards}`;
    },
    /* Таймеры обновляем точечно: полная перерисовка каждую секунду сбрасывала прокрутку и мигала */
    mount() {
      clearInterval(tick);
      const step = () => {
        if (state.view !== 'boss') { clearInterval(tick); tick = null; return; }
        const now = Date.now();
        const cd = Boss.tryLeft(state, now);
        const cdBox = $('#boss-cd');
        if (cdBox) {
          cdBox.style.display = cd > 0 ? '' : 'none';
          if (cd > 0) { const b = cdBox.querySelector('b'); if (b) b.textContent = Boss.fmtLeft(cd); }
        }
        for (const b of Boss.LIST) {
          const card = document.querySelector(`.boss-card[data-boss="${b.id}"]`);
          if (!card) continue;
          const rs = Boss.respawnLeft(state, b.id, now);
          const locked = rs > 0 || cd > 0;
          const p0 = pending();
          const resume = !!(p0 && p0.id === b.id);
          const when = card.querySelector('.boss-when');
          if (when) {
            const html = resume ? 'Бой не окончен — можно продолжить' : rs > 0 ? `Повержен · встанет через <b>${Boss.fmtLeft(rs)}</b>` : cd > 0 ? `Следующий вызов через <b>${Boss.fmtLeft(cd)}</b>` : 'Готов к бою';
            if (when.innerHTML !== html) when.innerHTML = html;
          }
          const btn = card.querySelector('[data-action=boss-go]');
          const block = locked && !resume;
          if (btn && btn.disabled !== block) {
            btn.disabled = block;
            btn.className = 'btn ' + (resume ? 'btn-jade' : block ? 'btn-secondary' : 'btn-danger') + ' btn-sm';
          }
          card.classList.toggle('locked', locked);
          card.classList.toggle('ready', !locked);
        }
      };
      tick = setInterval(step, 1000);
      step();
    },
  };
  actions['boss-info'] = () => sheet(`<h3 class="sh-t">Как устроен бой</h3><div class="install-note">
    <p><b>Пять реплик.</b> Босс говорит — вы отвечаете голосом по-китайски. Ошиблись дважды — бой проигран.</p>
    <p><b>Три подсказки, по одной каждого вида:</b> 译 перевод реплики, 首 начало ответа, 三 выбор из трёх. Не тронули ни одной — сундук полнее на ${Boss.chestBonusPct}%.</p>
    <p><b>Таймеры.</b> Вызвать любого босса можно раз в 10 минут. Побеждённый воскресает через 30 минут.</p>
    <p><b>Уровень</b> подбирается по тому, что вы уже изучили: пока ничего — HSK 1.</p>
    <p>Вопросы каждый раз сочиняются заново, а то, что уже спрашивали, помнится неделю и не повторяется.</p></div>
    <button class="btn btn-primary btn-block mt" data-close>Понятно</button>`);

  actions['boss-go'] = async el => {
    const b = Boss.byId(el.dataset.id);
    if (!b || !Boss.ready(state, b.id)) return;
    el.disabled = true;
    toast('Босс готовится…', 1500);
    const sp = Boss.setup(state, b);
    const p = pending();
    if (p && p.id === b.id) {
      /* возвращаемся ровно туда, где прервались */
      fight = { boss: b, sp, rounds: p.rounds, i: p.i, src: p.src, hints: p.hints, used: p.used, wrong: p.wrong, right: p.right,
        raged: p.raged, rageSeen: p.raged, lvl: p.lvl, shown: null, startedAt: p.startedAt, heard: null };
      BossMusic.start(b);
      if (p.raged) BossMusic.rage(b);
      nav('fight');
      return;
    }
    const avoid = Boss.recall(state).map(m => m.t);
    const res = await BossGen.rounds(b, sp.lvl, sp.rounds, avoid);
    Boss.remember(state, res.list.map(r => r.say.slice(0, 40)));
    Boss.bs(state, b.id).tries++;
    persist();
    fight = { boss: b, sp, rounds: res.list, i: 0, src: res.src, hints: { tr: 0, start: 0, opts: 0 }, used: 0, wrong: 0, right: 0, lvl: sp.lvl, shown: null, startedAt: Date.now(), heard: null };
    savePending();
    BossMusic.start(b);
    nav('fight');
  };

  /* ── бой ── */
  let clock = null;
  function stopClock() { if (clock) { clearInterval(clock); clock = null; } }
  function startClock() {
    stopClock();
    const sec = curSec();
    if (!fight || !sec) return;
    const deadline = Date.now() + sec * 1000;
    const tick = () => {
      if (!fight || fight.shown) return;                      /* во время подсказки и разбора не тикаем */
      const left = Math.ceil((deadline - Date.now()) / 1000);
      const el = $('#fclock');
      if (el) { el.textContent = left + ' с'; el.classList.toggle('urgent', left <= 5); }
      if (left <= 0) { stopClock(); BossGen.stopListening(); answer([], fight.i); }   /* не успел — мимо */
    };
    clock = setInterval(tick, 250);
    tick();
  }
  const curSec = () => (fight.raged ? Boss.ragedSec(fight.sp) : fight.sp.sec);
  const speak = () => { const r = fight.rounds[fight.i]; Speech.say(r.say, fight.raged ? Boss.ragedVoice(fight.boss) : fight.boss.voice); };
  actions['fight-say'] = () => speak();
  actions['fight-quit'] = () => {
    sheet(`<h3 class="sh-t">Отступить?</h3><p style="color:var(--ink-2)">Время не сгорит, а бой сохранится: вернётесь — продолжите с этой же реплики, с теми же жизнями и подсказками.</p><div class="btns"><button class="btn btn-danger btn-block" id="fq">Отступить</button><button class="btn btn-secondary btn-block" id="fc">Драться</button></div>`, s => {
      $('#fq', s).onclick = () => {
        closeSheet(); stopClock(); BossGen.stopListening(); BossMusic.stop();
        savePending();
        fight = null;
        toast('Бой сохранён — вернётесь и продолжите с этого места', 2800);
        nav('boss', {}, { replace: true });
      };
      $('#fc', s).onclick = () => closeSheet();
    });
  };
  actions['fight-hint'] = el => {
    const k = el.dataset.k;
    if (!fight || fight.hints[k]) return;
    fight.hints[k] = 1; fight.used++;
    fight.shown = k === 'opts' ? { k, opts: HskReal.shuffle(fight.rounds[fight.i].opts || []) } : { k };
    savePending();
    Sound.click();
    render();
  };
  actions['fight-pick'] = el => { if (fight) answer([el.dataset.v]); };
  actions['fight-listen'] = async el => {
    if (!fight || fight.busy) return;
    const round = fight.i;
    fight.busy = true; fight.heard = null;
    el.classList.add('rec'); el.textContent = '● Слушаю…';
    const res = await BossGen.listen(8000);
    if (!fight || fight.i !== round) return;                 /* раунд успел смениться — молча выходим */
    fight.busy = false;
    fight.heard = { text: (res.alts && res.alts[0]) || '', error: res.error };
    if (!res.alts || !res.alts.length) { render(); return; } /* показываем, что услышано (или что не услышано) */
    answer(res.alts, round);
  };
  actions['fight-text'] = () => {
    sheet(`<h3 class="sh-t">Ответ текстом</h3><div class="field"><label>По-китайски <span class="muted">· клавиатура 中文</span></label><input class="inp" id="fta" lang="zh-CN" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="汉字"></div><button class="btn btn-primary btn-block" id="ftok">Ответить</button>`, s => {
      const inp = $('#fta', s); setTimeout(() => inp.focus(), 80);
      const go = () => { const v = inp.value.trim(); if (!v) return; closeSheet(); answer([v]); };
      $('#ftok', s).onclick = go;
      inp.onkeydown = e => { if (e.key === 'Enter') go(); };
    });
  };
  function answer(said, forRound) {
    if (!fight || fight.shown) return;                       /* бой окончен или уже показываем разбор */
    if (forRound != null && forRound !== fight.i) return;    /* ответ опоздал и относится к прошлой реплике */
    stopClock();
    const r = fight.rounds[fight.i];
    const ok = BossGen.judge(r, said);
    r.said = Array.isArray(said) ? said[0] : said;
    r.ok = ok;
    if (ok) { fight.right = (fight.right || 0) + 1; Sound.ok(); } else { fight.wrong++; Sound.fail(); }
    /* вторая фаза: босс звереет */
    if (!fight.raged && fight.sp.rage && fight.right >= fight.sp.rage.at && fight.i < fight.rounds.length - 1) {
      fight.raged = true; fight.rageShown = false;
      BossMusic.rage(fight.boss);
    }
    fight.shown = { k: 'fb', ok };
    render();
    setTimeout(() => {
      if (!fight) return;
      if (fight.wrong >= fight.sp.lives) return endFight(false);
      fight.i++;
      fight.shown = null;
      if (fight.i >= fight.rounds.length) return endFight(true);
      savePending();                     /* снимок делаем уже на новой реплике */
      render();
      setTimeout(speak, 350);
    }, 1600);
  }
  views.fight = {
    render() {
      if (!fight) return '<div class="empty">Бой не начат</div>';
      const b = fight.boss, r = fight.rounds[fight.i];
      const sh = fight.shown || {};
      const hearts = '❤'.repeat(Math.max(0, fight.sp.lives - fight.wrong)) + '·'.repeat(Math.min(fight.sp.lives, fight.wrong));
      return `<div class="qbar"><button class="icon-btn" data-action="fight-quit">✕</button><div class="progress"><i style="width:${fight.i / fight.rounds.length * 100}%"></i></div><div class="qcount">${fight.i + 1}/${fight.rounds.length}</div><div class="qtimer">${hearts}</div></div>${curSec() ? `<div class="fight-clock ${fight.raged ? 'urgent' : ''}" id="fclock">${curSec()} с</div>` : ''}
      <div class="panel ornate fight-card">
        <img class="boss-por big ${fight.raged ? 'rage' : ''} ${sh.k === 'fb' ? (sh.ok ? 'hit' : 'laugh') : ''}" src="${IMG_URL(b.img)}" alt="" draggable="false">
        <div class="boss-n"><span class="zh">${esc(b.zh)}</span>${fight.raged ? ' <span class="rage-tag">怒 в ярости</span>' : ''}</div>
        ${fight.raged && !fight.rageSeen ? `<div class="rage-cry"><span class="zh">${esc(fight.sp.rage.zh)}</span><small>${esc(fight.sp.rage.ru)}</small></div>` : ''}
        <div class="fight-say zh" data-action="fight-say">${esc(r.say)}</div>
        ${sh.k === 'tr' ? `<div class="fight-tr">${esc(r.py || '')}<br>${esc(r.ru || '')}</div>` : ''}
        ${sh.k === 'start' ? `<div class="fight-tr">Начните так: <b class="zh">${esc((r.answer || '').slice(0, 3))}…</b></div>` : ''}
        ${fight.heard && sh.k !== 'fb' ? `<div class="heard ${fight.heard.text ? '' : 'none'}">${fight.heard.text ? 'Услышано: <b class="zh">' + esc(fight.heard.text) + '</b>' : esc(fight.heard.error || 'ничего не услышал')}</div>` : ''}
        ${sh.k === 'fb' ? `<div class="fight-fb ${sh.ok ? 'ok' : 'bad'}">${sh.ok ? '对！' : '错！'} <span>${esc(r.said || '—')}</span>${sh.ok ? '' : `<div class="fight-tr">Верно: <b class="zh">${esc(r.answer)}</b> — ${esc(r.answer_ru || '')}</div>`}</div>` : ''}
      </div>
      ${sh.k === 'opts' ? `<div class="opts">${(sh.opts || []).map(o => `<button class="opt opt-txt" data-action="fight-pick" data-v="${attr(o)}" data-nosound><span class="opt-hanzi">${esc(o)}</span></button>`).join('')}</div>` : ''}
      ${sh.k === 'fb' ? '' : `<div class="fight-acts">
        <button class="btn btn-danger btn-block btn-lg" data-action="fight-listen" data-nosound>🎙 Ответить голосом</button>
        <button class="btn btn-secondary btn-block btn-sm" data-action="fight-text">Ответить текстом</button>
        <div class="hint-row">${HINTS.filter(h => fight.sp.hints.indexOf(h.k) >= 0).map(h => `<button class="hint-btn ${fight.hints[h.k] ? 'used' : ''}" data-action="fight-hint" data-k="${h.k}" ${fight.hints[h.k] ? 'disabled' : ''} data-nosound><span class="zh">${h.ico}</span><small>${h.t}</small></button>`).join('')}</div>
        <div class="hint" style="text-align:center">${fight.used ? `Подсказок использовано: ${fight.used}` : `Без подсказок сундук полнее на ${Boss.chestBonusPct}%`}</div>
      </div>`}`;
    },
    mount() {
      if (!fight) return;
      if (!fight.spoke) { fight.spoke = true; setTimeout(speak, 400); }
      if (fight.raged && !fight.rageSeen && !fight.shown) { setTimeout(() => { if (fight) { fight.rageSeen = true; } }, 2600); }
      if (fight.shown && fight.shown.k === 'fb') stopClock();
      else if (curSec() && fight.clockFor !== fight.i) { fight.clockFor = fight.i; startClock(); }
    },
  };

  function endFight(won) {
    stopClock();
    BossGen.stopListening();
    Boss.st(state).lastTry = Date.now();   /* время между вызовами считается от завершённого боя */
    clearPending();
    const b = fight.boss, r = Boss.bs(state, b.id);
    const noHints = fight.used === 0;
    let chest = null;
    if (won) {
      r.wins++; if (noHints) r.clean++;
      r.defeatedAt = Date.now();
      Campaign.ensureChests(state.campaign);
      chest = Boss.chest(b, noHints);
      for (const id of chest) state.campaign.inventory[id] = (state.campaign.inventory[id] || 0) + 1;
      const entry = { ts: Date.now(), items: chest, boss: b.id, value: chest.reduce((s, id) => s + (Treasures.byId[id] ? Treasures.byId[id].value : 0), 0) };
      state.campaign.chestLog.push(entry);
      state.campaign.chests.opened++;
    }
    const pts = won ? Math.round((25 + fight.sp.lvl * 12) * Boss.weight(fight.sp) * (noHints ? 1.5 : 1)) : 0;
    const a = {
      id: uid(), ts: fight.startedAt, endedAt: Date.now(), durationMs: Date.now() - fight.startedAt,
      mode: 'boss', boss: b.id, bossName: b.ru, level: fight.lvl, difficulty: 'boss', deckIds: [], deckName: b.ru,
      show: 'boss', guess: ['voice'], order: 'random', timer: 0,
      total: fight.rounds.length, planned: fight.rounds.length, aborted: false,
      correct: fight.rounds.filter(x => x.ok).length, partial: 0, wrong: fight.wrong,
      percent: Math.round(fight.rounds.filter(x => x.ok).length / fight.rounds.length * 100),
      points: pts, won, noHints, src: fight.src, questions: [],
      lines: fight.rounds.map(r => r.say),   /* для расчёта новизны */
    };
    persist();
    BossMusic.finish(won);
    state.lastFight = { boss: b, won, noHints, chest, pts, rounds: fight.rounds.slice(), src: fight.src, raged: !!fight.raged };
    fight = null;
    saveAttempt(a).then(() => { state.lastFight.pts = a.points; state.lastFight.decay = a.decay; nav('fight-result', {}, { replace: true }); });
  }
  views['fight-result'] = {
    render() {
      const f = state.lastFight;
      if (!f) return '<div class="empty">Результата нет</div>';
      const b = f.boss;
      return `<div class="vh"><div class="seal">${f.won ? '胜' : '败'}</div><div class="grow"><h1 class="title">${f.won ? 'Победа' : 'Поражение'}</h1><div class="sub"><span class="zh">${esc(b.zh)}</span> · ${esc(b.ru)}</div></div></div>
      <div class="panel ornate fight-res ${f.won ? 'win' : 'lose'}"><img class="boss-por big" src="${IMG_URL(b.img)}" alt="">
        <div class="grow"><b>${f.won ? (f.noHints ? 'Повержен без единой подсказки' : 'Повержен') : 'Босс устоял'}</b>
        <div class="hint" style="margin:4px 0 0">${f.raged ? 'Дошло до ярости 怒 · ' : ''}${f.won ? `Встанет через ${Boss.fmtLeft(Boss.RESPAWN)}` : 'Следующий вызов через 10 минут'}</div></div>
        ${f.pts ? `<div class="sr-pts">+${f.pts}<small>очк.</small></div>` : ''}</div>
      ${f.decay && f.decay.why && f.decay.why.length ? `<div class="panel"><div class="flabel">Множитель очков ×${f.decay.mult}</div><div class="hint" style="margin:0">${f.decay.why.map(esc).join(' · ')}</div></div>` : ''}
      ${f.chest && f.chest.length ? `<div class="panel"><div class="flabel">Сундук босса${f.noHints ? ' · полнее на ' + Boss.chestBonusPct + '%' : ''}</div>
        <div class="loot">${f.chest.map(id => { const t = Treasures.byId[id]; return `<div class="loot-it r-${t.rarity}"><img src="${IMG_URL('treasure-' + id)}" alt=""><span>${esc(t.ru)}</span><small>${Treasures.fmtValue(t.value)}</small></div>`; }).join('')}</div></div>` : ''}
      <div class="panel"><div class="flabel">Как отвечали</div>${f.rounds.map((r, i) => `<div class="fb-row"><span class="fb-p zh">${esc(r.say)}</span><span class="fb-v">${r.ok == null ? '—' : r.ok ? '<b class="ok-t">верно</b>' : '<b class="bad-t">мимо</b>'}</span></div>`).join('')}
        <div class="hint" style="margin:8px 0 0">Реплики: ${f.src === 'fable' ? 'сочинил Claude Fable' : 'из встроенного банка'}</div></div>
      <div class="btns"><button class="btn btn-primary btn-block" data-go="boss">К боссам</button><button class="btn btn-secondary btn-block" data-go="home">На главную</button></div>`;
    },
  };
})();
