/* Донесение: человек говорит 30–90 секунд на заданную тему, и запись разбирают по СЛУЧАЯМ.

   Что здесь считается. Не «ошибок на сто слов», а случаи: сколько раз конструкция была нужна
   по смыслу и сколько раз получилась. Случаи ложатся в реестр личных ошибок (Fires) ровно так же,
   как случаи из обычных заданий, поэтому донесение может гасить и тушить огни — и платит именно
   за это, а не за объём сказанного.

   Закон модуля: всё производное — чистая функция от журнала попыток и явных аргументов.
   Тема считается от истории и даты, переходы огней — сравнением реестра до и после попытки,
   очки — от переходов. Ничего не кэшируется; пересчёт с нуля обязан дать то же самое.
   Единственное, что модуль пишет в настройки, — идентификатор устройства: это не производное
   значение, а постоянная метка телефона для воркера.

   Цена назначается самим режимом (fixedPts), поэтому попытка не проходит деградацию и не
   помечает материал «виденным»: разовая проверка на 400 знаков не должна обесценивать неделю
   обычных занятий. Потолок донесения — 150 очков при дневной норме 400.

   Чего разбор не видит — Report.whatVoiceMisses(): тоны, произношение, интонацию. Распознавание
   их не передаёт и вдобавок само дописывает частицы, поэтому такие ошибки считаются только там,
   где человек набрал текст руками. */
window.Report = (() => {
  const MODE = 'report';
  const DAY = 24 * 3600e3;
  const MAX_FINDINGS = 8;                 /* столько же требует и воркер — проверяем на телефоне заново */
  const MAX_TARGETS = 6, MAX_FIRES = 3;
  const TIMEOUT_MS = 45000;
  const TRIES = 2;                        /* один повтор: сеть на телефоне отваливается чаще, чем воркер */
  const MAX_QUESTIONS = 24;

  /* Длина монолога по уровню: секунды — для экрана, знаки — для оплаты.
     Знаки, а не секунды: молчание в запись не считается. */
  const LEN = {
    1: { sec: [30, 45], min: 40 },
    2: { sec: [45, 60], min: 60 },
    3: { sec: [60, 90], min: 85 },
    4: { sec: [60, 90], min: 110 },
  };
  /* Плата. База — за сам монолог не короче минимума; остальное — за движение огней. */
  const PTS = { base: 30, fading: 10, out: 25, relit: 40, cap: 150 };
  const LOOSE_SHARE = 1 / 3;              /* отброшено больше трети — разбору веры вполовину */
  const LOOSE_WEIGHT = 0.5;

  const MOVE_RU = { fading: 'гаснет', out: 'потушен', relit: 'потушен после возврата' };

  /* Подпись режима в журнале и статистике — иначе там стояло бы латинское «report» */
  const LABELS = (typeof window !== 'undefined' && window.App && App.LABELS) || null;
  if (LABELS && LABELS.mode && !LABELS.mode[MODE]) LABELS.mode[MODE] = 'Донесение';

  /* ── мелочи ── */
  const r1 = x => Math.round(x * 10) / 10;
  const clampLvl = l => Math.max(1, Math.min(4, Math.round(Number(l) || 1)));
  const pad = n => String(n).padStart(2, '0');
  const dayKey = ts => { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  /* Номер суток по местному календарю: тема двигается день за днём и не зависит от часа */
  function dayNum(ts) { const d = new Date(ts); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); }
  const CJK = /[\u4e00-\u9fff\u3400-\u4dbf]/;
  /* Объём сказанного: знаки китайского. Латиницу и кириллицу не считаем — это обрывки распознавания. */
  function size(text) {
    const s = String(text == null ? '' : text);
    let chars = 0;
    for (const ch of s) if (CJK.test(ch)) chars++;
    return { chars, len: s.length };
  }
  /* Сравнение цитаты с текстом: пробелы и знаки препинания распознавание ставит как хочет */
  const bare = t => String(t == null ? '' : t).replace(/[\s，。！？、,.!?;:；：'"“”‘’·…—-]/g, '');
  const lower = s => (s ? s.charAt(0).toLowerCase() + s.slice(1) : '');

  /* ── идентификатор устройства ──
     Постоянная метка телефона: воркер по ней держит дневную квоту. Генерируется один раз. */
  function newId() {
    const g = typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues ? globalThis.crypto : null;
    if (g) { const b = new Uint8Array(12); g.getRandomValues(b); return [...b].map(x => x.toString(16).padStart(2, '0')).join(''); }
    return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function deviceId(state) {
    const s = state && state.settings ? state.settings : null;
    if (!s) return '';
    if (typeof s.did === 'string' && /^[A-Za-z0-9_-]{8,40}$/.test(s.did)) return s.did;
    s.did = newId();
    return s.did;
  }
  function tzName() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; }
  }

  /* ── тема ──
     Уровень — рабочий (Boss.levelOf: верхняя грань изученного), а не рекомендованный Skill:
     говорить человек должен о том, чем уже владеет, иначе монолог не из чего построить. */
  const trapsRule = id => {
    try {
      const e = window.TRAPS && TRAPS.explain ? TRAPS.explain(id) : null;
      return e && e.rule ? e.rule : null;
    } catch (e) { return null; }
  };
  const knownTrap = id => {
    try { return !!(id && window.TRAPS && TRAPS.byId && TRAPS.byId(id)); } catch (e) { return false; }
  };
  /* Иероглифы, которыми огонь называет себя: по ним видно, задевает ли он слова блока */
  function fireHanzi(f) {
    const out = [];
    for (const ch of String((f && f.id) || '') + ' ' + String((f && f.ru) || '')) if (CJK.test(ch)) out.push(ch);
    return out;
  }
  /* Какие огни вообще видны в разборе записи. Тон, звук и запись пиньиня в тексте не видны
     (об этом же говорит whatVoiceMisses), и посылать их воркеру как «привычки, которые ломаются»
     значит просить разбор о том, чего в записи нет. Поэтому берём только те, что живут в тексте. */
  const VISIBLE_KINDS = ['gram', 'mw', 'ru', 'word', 'mean'];
  function speakableFires(state, now) {
    const all = (window.Fires && Fires.compute ? Fires.compute(state, now) : []) || [];
    const out = [], perKind = {};
    for (const f of all) {
      if (f.status === 'out' || VISIBLE_KINDS.indexOf(f.kind) < 0) continue;
      if ((perKind[f.kind] || 0) >= 2) continue;          /* как в Fires.top3: не три штуки одного рода */
      out.push(f);
      perKind[f.kind] = (perKind[f.kind] || 0) + 1;
      if (out.length === MAX_FIRES) break;
    }
    return out;
  }
  function relevance(block, fires) {
    const w = new Set((block.words || []).join('').split(''));
    let n = 0;
    for (const f of fires) if (fireHanzi(f).some(ch => w.has(ch))) n++;
    return n;
  }
  /* Блоки, о которых уже рассказывали сегодня и вчера: тема не повторяется два дня подряд */
  function recentBlocks(state, now) {
    const out = new Set();
    const today = dayNum(now);
    for (const a of (state && state.attempts) || []) {
      if (!a || a.mode !== MODE || !a.block) continue;
      if (today - dayNum(a.ts) <= 1) out.add(a.block);
    }
    return out;
  }

  function topic(state, now = Date.now()) {
    const lvl = clampLvl(window.Boss && Boss.levelOf ? Boss.levelOf(state) : 1);
    const list = (window.PROGRAM ? PROGRAM.byLevel(lvl) : []) || [];
    if (!list.length) return null;
    const fires = speakableFires(state, now);
    const avoid = recentBlocks(state, now);
    const start = dayNum(now) % list.length;
    const scored = list.map((b, i) => ({ b, rel: relevance(b, fires), dist: (i - start + list.length) % list.length }));
    const free = scored.filter(x => !avoid.has(x.b.id));
    const pool = free.length ? free : scored;                 /* все блоки под запретом — берём как есть */
    pool.sort((x, y) => y.rel - x.rel || x.dist - y.dist || (x.b.id < y.b.id ? -1 : x.b.id > y.b.id ? 1 : 0));
    const b = pool[0].b;

    const words = b.words || [];
    const hints = [];
    for (let k = 0; k < Math.min(3, words.length); k++) hints.push(words[(start + k) % words.length]);

    const g = b.g || {};
    const targets = [{ node: 'g:' + b.id, ru: g.t || b.ru, rule: g.d || b.can }];
    for (const f of fires) {
      targets.push({ node: f.id, ru: f.ru, rule: trapsRule(f.id) || f.ru });
      if (targets.length >= MAX_TARGETS) break;
    }
    const len = LEN[lvl] || LEN[1];
    return {
      ru: 'Расскажите о себе по теме «' + b.ru + '» (' + b.zh + '). Опора: ' + lower(b.can) + '.',
      can: b.can,
      hints,
      targets,
      lvl,
      block: b.id,
      blockRu: b.ru,
      sec: len.sec.slice(),
      minChars: len.min,
      fires: fires.map(f => ({ id: f.id, ru: f.ru, status: f.status })),
    };
  }

  /* ── одно донесение в день ── */
  function canToday(state, now = Date.now()) {
    const k = dayKey(now);
    for (const a of (state && state.attempts) || []) if (a && a.mode === MODE && dayKey(a.ts) === k) return false;
    return true;
  }

  /* ── сеть ── */
  let _fetch = null;
  function setFetch(fn) { _fetch = typeof fn === 'function' ? fn : null; return API; }
  function theFetch(conf) {
    const given = conf && typeof conf.fetch === 'function' ? conf.fetch : null;
    const f = given || _fetch || (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);
    if (!f) throw new Error('Сеть недоступна');
    return f;
  }
  function endpoint(conf) {
    const url = String((conf && conf.url) || '').replace(/\/+$/, '');
    if (!url) throw new Error('Не задан адрес разбора');
    return url + '/check';
  }
  /* Один заход: срок жёсткий, потому что человек ждёт с телефона в руках */
  function once(conf, body) {
    const f = theFetch(conf);
    const url = endpoint(conf);
    let ctl = null;
    try { if (typeof AbortController === 'function') ctl = new AbortController(); } catch (e) { ctl = null; }
    const opts = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
    if (ctl) opts.signal = ctl.signal;
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        if (ctl) try { ctl.abort(); } catch (e) { /* ignore */ }
        reject(new Error('Разбор не ответил за 45 секунд'));
      }, TIMEOUT_MS);
      Promise.resolve().then(() => f(url, opts)).then(async res => {
        if (done) return;
        if (!res || !res.ok) {
          let why = '';
          try { const j = await res.json(); why = j && j.error ? String(j.error) : ''; } catch (e) { /* тело могло быть не json */ }
          throw new Error(why === 'quota' ? 'На сегодня разборов больше нет' : 'Разбор не удался' + (res && res.status ? ' (' + res.status + ')' : ''));
        }
        return await res.json();
      }).then(j => {
        if (done) return;
        done = true; clearTimeout(timer); resolve(j);
      }).catch(e => {
        if (done) return;
        done = true; clearTimeout(timer); reject(e);
      });
    });
  }
  async function post(conf, body) {
    let last = null;
    for (let i = 0; i < TRIES; i++) {
      try { return await once(conf, body); } catch (e) { last = e; }
    }
    throw last || new Error('Разбор не удался');
  }

  /* ── строгая проверка ответа на телефоне ──
     Воркер отвечает текстом модели, а модель умеет придумывать. Поэтому:
     цитата обязана встречаться в записи, находок не больше восьми, узлы и ловушки
     обязаны существовать. Придуманная цитата или несуществующий узел — находку вон;
     незнакомую ловушку стираем, чтобы она не завела в реестре огонь, которого нет.
     Отброшено больше трети — разбор помечается неточным, и вес его вдвое меньше. */
  function validate(raw, ctx) {
    const text = bare(ctx.text);
    const nodes = new Set((ctx.targets || []).map(t => t && t.node).filter(Boolean));
    const fires = new Set((ctx.fires || []).map(f => f && f.id).filter(Boolean));
    const src = Array.isArray(raw && raw.findings) ? raw.findings : [];
    const findings = [];
    let dropped = 0, cleaned = 0;
    for (const f of src) {
      if (!f || typeof f !== 'object') { dropped++; continue; }
      const quote = String(f.quote || '').trim();
      if (!quote || !bare(quote) || text.indexOf(bare(quote)) < 0) { dropped++; continue; }   /* цитаты нет в записи */
      if (findings.length >= MAX_FINDINGS) { dropped++; continue; }                            /* находок сверх восьми */
      let node = String(f.node || '').trim();
      if (node && !nodes.has(node)) { node = ''; cleaned++; }                                  /* узел, которого не давали */
      let trap = String(f.trap || '').trim();
      if (trap && !(fires.has(trap) || knownTrap(trap))) { trap = ''; cleaned++; }             /* ловушки нет в каталоге */
      if (!trap && node && (fires.has(node) || knownTrap(node))) trap = node;                  /* узел сам оказался ловушкой */
      findings.push({
        quote, fix: String(f.fix || '').trim(), node: node || null, trap: trap || null,
        sev: String(f.sev || '').trim(), why: String(f.why || '').trim(), l1: String(f.l1 || '').trim(),
      });
    }
    const cases = [];
    for (const c of Array.isArray(raw && raw.cases) ? raw.cases : []) {
      const node = String((c && c.node) || '').trim();
      if (!node || !(nodes.has(node) || fires.has(node) || knownTrap(node))) { cleaned++; continue; }
      const need = Math.max(0, Math.round(Number(c.need) || 0));
      const ok = Math.max(0, Math.min(need, Math.round(Number(c.ok) || 0)));
      if (!need) continue;
      cases.push({ node, need, ok, trap: fires.has(node) || knownTrap(node) ? node : null });
    }
    const total = src.length;
    const bad = dropped + cleaned;
    const loose = total > 0 && bad > total * LOOSE_SHARE;
    const sz = size(ctx.text);
    return {
      ok: true,
      text: String(ctx.text || ''),
      chars: sz.chars,
      lvl: clampLvl(ctx.level),
      minChars: (LEN[clampLvl(ctx.level)] || LEN[1]).min,
      corrected: String((raw && raw.corrected) || '').trim(),
      findings, cases,
      good: (Array.isArray(raw && raw.good) ? raw.good : []).slice(0, 3).map(s => String(s).trim()).filter(Boolean),
      rubric: raw && raw.rubric && typeof raw.rubric === 'object'
        ? { level: String(raw.rubric.level || '').trim(), note: String(raw.rubric.note || '').trim() } : null,
      left: raw && raw.left != null ? +raw.left : null,
      total, dropped, cleaned, loose,
      weight: loose ? LOOSE_WEIGHT : 1,
      targets: (ctx.targets || []).slice(0, MAX_TARGETS),
      source: ctx.source === 'typed' ? 'typed' : 'voice',
    };
  }

  /* payload: { state|did, text, targets, fires, level, tz, source } */
  async function analyze(payload, conf) {
    const p = payload || {};
    const c = conf || (typeof window !== 'undefined' && window.PUSH_CONF) || {};
    const text = String(p.text || '').trim();
    if (!text) throw new Error('Записи нет');
    const did = p.did || deviceId(p.state);
    if (!did) throw new Error('Нет идентификатора устройства');
    const level = clampLvl(p.level);
    /* Наружу уходят только узел и правило; имя мишени по-русски остаётся на телефоне —
       им подписываются случаи в попытке. */
    const targets = (p.targets || []).slice(0, MAX_TARGETS)
      .map(t => ({ node: String((t && t.node) || ''), ru: String((t && t.ru) || ''), rule: String((t && (t.rule || t.ru)) || '') }))
      .filter(t => t.node);
    const sent = targets.map(t => ({ node: t.node, rule: t.rule }));
    const fires = (p.fires || []).slice(0, MAX_FIRES)
      .map(f => ({ id: String((f && f.id) || ''), ru: String((f && f.ru) || '') }))
      .filter(f => f.id);
    const raw = await post(c, { ver: 'v2', did, tz: p.tz || tzName(), level, text, targets: sent, fires, mode: MODE });
    if (raw && raw.error) throw new Error(raw.error === 'quota' ? 'На сегодня разборов больше нет' : 'Разбор не удался');
    return validate(raw, { text, targets, fires, level, source: p.source });
  }

  /* ── очки ──
     Платим за монолог и за движение огней, а не за объём найденных ошибок: иначе выгодно
     говорить плохо. Потолок — 150 при дневной норме 400. */
  function points(res) {
    const r = res || {};
    const lvl = clampLvl(r.lvl);
    const min = r.minChars != null ? r.minChars : (LEN[lvl] || LEN[1]).min;
    const chars = r.chars != null ? r.chars : size(r.text).chars;
    const parts = [];
    let p = 0;
    if (chars >= min) { p += PTS.base; parts.push({ ru: 'Монолог, знаков — ' + chars, n: PTS.base }); }
    else parts.push({ ru: 'Монолог короче нормы: ' + chars + ' знаков из ' + min, n: 0 });
    for (const m of r.moves || []) {
      if (!m || !m.to) continue;
      let n = 0, ru = '';
      if (m.to === 'fading') { n = PTS.fading; ru = 'Гаснет: ' + (m.ru || m.id); }
      else if (m.to === 'out') {
        const back = m.from === 'relit';
        n = back ? PTS.relit : PTS.out;
        ru = (back ? 'Потушен после возврата: ' : 'Потушен: ') + (m.ru || m.id);
      } else continue;
      p += n;
      parts.push({ ru, n });
    }
    const w = r.weight == null ? 1 : Number(r.weight);
    if (w !== 1 && p > 0) {
      const cut = r1(p - p * w);
      p = r1(p * w);
      parts.push({ ru: 'Разбор неточный — вес вдвое меньше', n: -cut });
    }
    if (p > PTS.cap) { parts.push({ ru: 'Потолок донесения', n: -r1(p - PTS.cap) }); p = PTS.cap; }
    return { points: r1(p), parts };
  }

  /* ── попытка ── */
  /* Случаи в вопросах. Цитата есть только у промаха: удачный случай — это «конструкция
     потребовалась и вышла», цитировать там нечего, поэтому в hanzi идёт имя узла. */
  function questions(res, durationMs) {
    const r = res || {};
    const byNode = {};
    const qs = [];
    for (const f of r.findings || []) {
      const key = f.trap || f.node || '';
      if (key) byNode[key] = (byNode[key] || 0) + 1;
      qs.push({
        cardId: null, hanzi: f.quote, pinyin: '', ru: f.fix || f.why || '',
        node: f.node || null, trap: f.trap || null,
        answer: {}, fraction: 0, ok: false, ms: 0, why: f.why || '', l1: f.l1 || '', sev: f.sev || '',
      });
    }
    for (const c of r.cases || []) {
      const label = nodeRu(r, c.node);
      const miss = byNode[c.trap || c.node] || 0;
      const clean = Math.max(0, Math.min(c.ok, c.need - miss));
      for (let i = 0; i < clean && qs.length < MAX_QUESTIONS; i++) {
        qs.push({
          cardId: null, hanzi: label, pinyin: '', ru: 'случай вышел',
          node: c.node, trap: c.trap || null,
          answer: {}, fraction: 1, ok: true, ms: 0,
        });
      }
    }
    const cut = qs.slice(0, MAX_QUESTIONS);
    const ms = cut.length ? Math.round((durationMs || 0) / cut.length) : 0;
    for (const q of cut) q.ms = ms;
    return cut;
  }
  /* Имя случая: короткое название мишени. Правило целиком в подпись не годится — это абзац. */
  function nodeRu(res, node) {
    const t = (res.targets || []).find(x => x && x.node === node);
    if (t && t.ru) return String(t.ru).slice(0, 40);
    const rule = trapsRule(node);
    if (rule) return String(rule).split(/[.:;]/)[0].slice(0, 40);
    if (t && t.rule) return String(t.rule).split(/[.:;]/)[0].slice(0, 40);
    return String(node || '').replace(/^g:/, '');
  }

  /* Переходы огней: реестр до попытки и после неё, посчитанные на один и тот же момент.
     Разница — только вклад самой попытки, а не то, что прошло время. */
  function moves(state, a, now = Date.now()) {
    if (!window.Fires || !Fires.compute) return [];
    const before = new Map(), after = new Map();
    for (const f of Fires.compute(state, now)) before.set(f.id, f);
    const next = Object.assign({}, state, { attempts: ((state && state.attempts) || []).concat([a]) });
    for (const f of Fires.compute(next, now)) after.set(f.id, f);
    const touched = new Set();
    for (const q of a.questions || []) if (q && q.trap) touched.add(q.trap);
    const out = [];
    for (const id of touched) {
      const b = before.get(id), f = after.get(id);
      if (!f) continue;
      const from = b ? b.status : null;
      if (f.status === from) continue;
      if (f.status !== 'fading' && f.status !== 'out') continue;
      out.push({ id, ru: f.ru, from, to: f.status, outs: f.outs || 0 });
    }
    out.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    return out;
  }

  /* meta: { startedAt, endedAt, now, source, topic } */
  function attempt(state, res, meta = {}) {
    const r = res || {};
    const now = meta.now || meta.endedAt || Date.now();
    const startedAt = meta.startedAt || now;
    const durationMs = Math.max(0, (meta.endedAt || now) - startedAt);
    const top = meta.topic || null;
    const lvl = clampLvl(r.lvl || (top && top.lvl));
    const qs = questions(r, durationMs);
    const correct = qs.filter(q => q.ok).length;
    const a = {
      id: meta.id || 'rp-' + startedAt,
      ts: startedAt, endedAt: meta.endedAt || now, durationMs,
      mode: MODE, difficulty: MODE, level: lvl,
      deckIds: [], deckName: (top && top.blockRu) || 'донесение', show: 'zh', guess: ['speak'], order: 'topic', timer: 0,
      total: qs.length, planned: qs.length, aborted: false,
      correct, partial: 0, wrong: qs.length - correct,
      percent: qs.length ? Math.round(correct / qs.length * 100) : 0,
      questions: qs,
      block: (top && top.block) || null,
      source: r.source === 'typed' ? 'typed' : 'voice',
      chars: r.chars != null ? r.chars : size(r.text).chars,
      text: String(r.text || ''),
      loose: !!r.loose,
      fixedPts: true,                       /* цену назначает режим: ни деградации, ни отметки «виден» */
    };
    const mv = moves(state, a, now);
    const pt = points(Object.assign({}, r, { moves: mv, lvl }));
    a.moves = mv;
    a.pointParts = pt.parts;
    a.points = pt.points;
    a.p2fix = pt.points;                    /* режим живёт только в тестовой книге — цена там та же */
    const bounty = mv.filter(m => m.to === 'out').reduce((s, m) => s + (m.from === 'relit' ? PTS.relit : PTS.out), 0);
    if (bounty) a.bounty = bounty;          /* при fixedPts книга её не доплачивает: это след, за что заплачено */
    return a;
  }

  /* ── чего разбор не видит ── */
  function whatVoiceMisses() {
    return [
      'Тоны. В записи их нет: распознавание отдаёт иероглифы, а не звук.',
      'Произношение и разборчивость. Слово, сказанное неверно, чаще всего просто не распознаётся и в текст не попадает.',
      'Интонацию и темп: паузы, самоперебивы, скорость речи здесь не оцениваются.',
      'Распознавание само дописывает частицы и правит порядок слов, поэтому ошибки в 了, 吗 и 的 считаются только при наборе с клавиатуры.',
    ];
  }

  const API = {
    MODE, PTS, LEN, MAX_FINDINGS, TIMEOUT_MS, LOOSE_SHARE, LOOSE_WEIGHT, MOVE_RU,
    VISIBLE_KINDS, topic, canToday, analyze, validate, points, attempt, questions, moves, speakableFires,
    size, deviceId, setFetch, whatVoiceMisses, dayKey,
  };
  return API;
})();
