/* Личный реестр ошибок: замечен 见 · горит 燃 · гаснет 弱 · потушен 灭.
   Считаем не «ошибок на сто слов», а СЛУЧАИ: сколько раз структура или различение требовались
   и сколько раз получились. Всё выводится из журнала попыток state.attempts заново при каждом
   расчёте — ни одного производного значения не храним и state не трогаем. Момент тушения тоже
   выводится из истории: пересчёт с нуля обязан дать то же, что и любой другой порядок.
   Каталог ловушек window.TRAPS (его пишет соседний модуль) — только источник названий и тяжести;
   если его нет, работают собственные встроенные описания. */
window.Fires = (() => {
  const DAY = 24 * 3600e3;

  /* ── пороги переходов ── */
  const BURN_WINDOW = 30 * DAY;   /* два промаха ближе этого друг к другу — огонь горит */
  const NOTICED_IDLE = 60 * DAY;  /* «замечен» без единого случая столько — забываем */
  const FADE_CLEAN = 4, FADE_DAYS = 2;              /* гаснет: 4 чистых подряд в 2 разных дня */
  const OUT_CLEAN = 8, OUT_DAYS = 3, OUT_QUIET = 7; /* потушен: 8 чистых, 3 разных дня, 7 дней без промаха */
  const PER_ATTEMPT = 3;          /* из одной попытки в серию идёт не больше трёх чистых */
  const RECENT = 10;              /* окно «как сейчас»: последние десять случаев */
  const BOUNTY_BASE = 60, BOUNTY_MIN = 22, BOUNTY_MAX = 112;
  const REPEAT = [1, 0.5, 0.25];  /* повторное тушение платит вдвое меньше, потом вчетверо, потом никак */

  const STATUS = {
    noticed: { ru: 'замечен', zh: '见', py: 'jiàn' },
    burning: { ru: 'горит', zh: '燃', py: 'rán' },
    fading: { ru: 'гаснет', zh: '弱', py: 'ruò' },
    out: { ru: 'потушен', zh: '灭', py: 'miè' },
    relit: { ru: 'вспыхнул снова', zh: '复燃', py: 'fùrán' },
  };

  /* ── мелочи ── */
  const pad = n => String(n).padStart(2, '0');
  const dayKey = ts => { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const r2 = x => Math.round(x * 100) / 100;
  const r3 = x => Math.round(x * 1000) / 1000;
  function plur(n, one, few, many) {
    const a = Math.abs(n) % 10, b = Math.abs(n) % 100;
    if (a === 1 && b !== 11) return one;
    if (a >= 2 && a <= 4 && (b < 10 || b >= 20)) return few;
    return many;
  }
  const days = n => n + ' ' + plur(n, 'день', 'дня', 'дней');

  /* ── мягкая связь с каталогом ловушек ── */
  const traps = () => (typeof window !== 'undefined' && window.TRAPS) || null;
  /* Название, категория и тяжесть из каталога, если он загружен и знает эту ловушку */
  function trapMeta(id) {
    const T = traps();
    if (!T) return null;
    try {
      let t = null;
      if (T.byId && T.byId[id]) t = T.byId[id];
      else if (typeof T.get === 'function') t = T.get(id);
      else if (Array.isArray(T)) t = T.find(x => x && x.id === id);
      else if (Array.isArray(T.ALL)) t = T.ALL.find(x => x && x.id === id);
      else if (Array.isArray(T.LIST)) t = T.LIST.find(x => x && x.id === id);
      if (!t || typeof t !== 'object') return null;
      const m = {};
      const ru = typeof t.ru === 'string' ? t.ru : (typeof t.name === 'string' ? t.name : null);
      if (ru) m.ru = ru;
      if (typeof t.kind === 'string') m.kind = t.kind;
      const sev = t.sev != null ? t.sev : (t.severity != null ? t.severity : t.weight);
      if (typeof sev === 'number' && isFinite(sev) && sev > 0) m.sev = sev;
      if (typeof t.lvl === 'number' && t.lvl > 0) m.lvl = t.lvl;
      return Object.keys(m).length ? m : null;
    } catch (e) { return null; }
  }
  /* Каталог может сам распознавать свои ловушки в вопросе — берём его находки как есть */
  function trapHits(a, q) {
    const T = traps();
    if (!T || typeof T.detect !== 'function') return [];
    try {
      const r = T.detect(a, q);
      const arr = Array.isArray(r) ? r : (r ? [r] : []);
      const out = [];
      for (const x of arr) {
        if (typeof x === 'string') out.push({ id: x, ok: !!q.ok });
        else if (x && typeof x.id === 'string') out.push({ id: x.id, ok: x.ok == null ? !!q.ok : !!x.ok });
      }
      return out;
    } catch (e) { return []; }
  }

  /* ── разбор пиньиня на слоги: нужны инициаль и финаль каждого слога ── */
  const INI = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];
  const isV = ch => !!ch && 'aeiouü'.indexOf(ch) >= 0;
  /* Буква пиньиня — с диакритикой или без. Всё остальное (пробел, апостроф, дефис, цифра, иероглиф)
     разрывает слог: без этого 可爱 kě'ài склеивалось в «keai», а 西安 xī'ān — в «xian». */
  const PY_LETTER = /[a-zA-ZüÜāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/;
  function pieces(raw) {
    const out = [];
    let cur = '';
    for (const ch of raw) { if (PY_LETTER.test(ch)) cur += ch; else { if (cur) out.push(cur); cur = ''; } }
    if (cur) out.push(cur);
    return out;
  }
  const segCache = new Map();
  /* Разбор одного куска без разделителей — дописывает слоги в out */
  function segPiece(piece, out) {
    const bare = window.Pinyin ? Pinyin.analyze(piece).letters : piece.toLowerCase().replace(/[^a-zü]/g, '');
    let i = 0;
    while (i < bare.length) {
      let ini = '';
      for (const c of INI) if (bare.startsWith(c, i)) { ini = c; break; }
      let j = i + ini.length, v = '';
      while (isV(bare[j])) { v += bare[j]; j++; }
      if (!v) { i++; continue; }                     /* буква без гласной — не слог */
      let coda = '';
      if (bare.startsWith('ng', j) && !isV(bare[j + 2])) coda = 'ng';
      else if (bare[j] === 'n' && !isV(bare[j + 1])) coda = 'n';
      else if (bare[j] === 'r' && v === 'e' && !ini && !isV(bare[j + 1])) coda = 'r';
      j += coda.length;
      if (bare[j] === 'r' && !isV(bare[j + 1]) && coda !== 'r') j++;   /* эризация 儿 к слогу не добавляет финали */
      out.push({ ini, fin: v + coda, bare: ini + v + coda });
      i = j;
    }
  }
  /* Чистая память на разбор: ключ учитывает, загружен ли Pinyin, результат заморожен —
     кто бы и в каком порядке ни спросил, ответ один и тот же. */
  function segment(py) {
    const raw = String(py || '');
    const key = (window.Pinyin ? '1' : '0') + raw;
    const hit = segCache.get(key);
    if (hit) return hit;
    const out = [];
    for (const piece of pieces(raw)) segPiece(piece, out);
    for (const s of out) Object.freeze(s);
    Object.freeze(out);
    if (segCache.size > 2000) segCache.clear();
    segCache.set(key, out);
    return out;
  }
  const CONFUSE = () => (window.PHON && PHON.CONFUSE) || [['j', 'zh'], ['q', 'ch'], ['x', 'sh'], ['z', 'zh'], ['c', 'ch'], ['s', 'sh'], ['b', 'p'], ['d', 't'], ['g', 'k'], ['r', 'l']];
  const NG = () => (window.PHON && PHON.NG_PAIRS) || [['an', 'ang'], ['en', 'eng'], ['in', 'ing'], ['ian', 'iang'], ['uan', 'uang']];
  function spellRule(bare) {
    if (window.PHON && PHON.ruleOf) { try { return PHON.ruleOf(bare); } catch (e) { /* каталог правил не обязателен */ } }
    if (/^(j|q|x)u/.test(bare)) return 'jqx';
    if (/^yu/.test(bare)) return 'yu';
    if (/^y/.test(bare)) return 'y';
    if (/^w/.test(bare)) return 'w';
    if (/^(n|l)ü/.test(bare)) return 'nl';
    return null;
  }

  /* Какой именно тон не дался. Если введённое выравнивается с ожидаемым послогово — виноват
     конкретный тон; если выравнять нельзя (слогов с меткой разное число), промах пишем всем тонам
     слова. Чистая функция от вопроса, ничего не запоминает. */
  function toneCases(q, p) {
    if (!window.Pinyin) return [];
    let exp, got = null;
    try {
      exp = Pinyin.analyze(q.pinyin || '');
      const inp = q.answer && typeof q.answer.input === 'string' ? Pinyin.analyze(q.answer.input) : null;
      if (inp && inp.letters === exp.letters && inp.tones.length === exp.tones.length) got = inp.tones;
    } catch (e) { return []; }
    const out = [];
    for (let i = 0; i < exp.tones.length; i++) {
      const t = exp.tones[i];
      if (!(t >= 1 && t <= 4)) continue;
      out.push({ id: 'tone:' + t, ok: got ? got[i] === t : p === 'exact' });
    }
    return out;
  }

  /* ── что требовалось в этом вопросе ── */
  /* Возвращает [{id, ok}] — по одному случаю на каждую задетую ловушку или узел. */
  function trace(a, q) {
    const out = [];
    const add = (id, ok) => out.push({ id, ok: !!ok });
    const parts = q.parts || {};
    const py = q.pinyin || '';
    if (parts.pinyin) {
      const p = parts.pinyin;
      const letters = p !== 'wrong';                 /* буквы слога вышли */
      if (p === 'exact' || p === 'tones') {                            /* тон разбираем только там, где слоги верны */
        add('tone', p === 'exact');
        for (const c of toneCases(q, p)) add(c.id, c.ok);              /* и отдельно — каждый тон слова */
      }
      add('syll', letters);
      for (const s of segment(py)) {
        for (const pair of NG()) if (pair.indexOf(s.fin) >= 0) add('nasal:' + pair.join('/'), letters);
        for (const pair of CONFUSE()) if (s.ini && pair.indexOf(s.ini) >= 0) add('ini:' + pair.join('/'), letters);
        const rule = spellRule(s.bare);
        if (rule) add('spell:' + rule, letters);
      }
    }
    if (parts.ru) add('mean', parts.ru === 'exact');
    if (a.mode === 'phon' && a.difficulty !== 'theory') add('ear:' + (a.difficulty || 'tone'), q.ok);
    /* Письмо от руки — всегда огонь письма: не вышедшая черта не значит, что слово незнакомо.
       Даже если иероглиф в записи потерялся, случай уходит в письмо, а не в узел словаря. */
    if (a.mode === 'hand') { const key = q.hanzi || q.cardId; if (key) add('hand:' + key, q.ok); }
    else if (q.cardId) add('node:' + q.cardId, q.ok);
    for (const h of trapHits(a, q)) out.push(h);
    /* одна ловушка — один случай на вопрос: задели дважды, а промах засчитываем один раз */
    const seen = new Map();
    for (const h of out) {
      if (!h || typeof h.id !== 'string' || !h.id) continue;
      if (seen.has(h.id)) seen.set(h.id, seen.get(h.id) && h.ok);
      else seen.set(h.id, h.ok);
    }
    return [...seen.entries()].map(([id, ok]) => ({ id, ok }));
  }

  /* ── описание ловушки: каталог, если есть, иначе собственное ── */
  const KIND_SEV = { tone: 1.3, sound: 1.2, spell: 0.9, mean: 1, word: 0.8, hand: 1, exam: 1 };
  /* Разделы настоящего экзамена HSK — как они названы в бланке */
  const EXAM_SEC = {
    listening: { zh: '听力', ru: 'аудирование' },
    reading: { zh: '阅读', ru: 'чтение' },
    writing: { zh: '书写', ru: 'письмо' },
  };
  const BUILTIN = {
    tone: { ru: 'Тон в записи', kind: 'tone', lvl: 1 },
    'tone:1': { ru: 'Первый тон 阴平 — ровный высокий', kind: 'tone', lvl: 1 },
    'tone:2': { ru: 'Второй тон 阳平 — восходящий', kind: 'tone', lvl: 1 },
    'tone:3': { ru: 'Третий тон 上声 — ныряющий', kind: 'tone', lvl: 1 },
    'tone:4': { ru: 'Четвёртый тон 去声 — падающий', kind: 'tone', lvl: 1 },
    syll: { ru: 'Слоги пиньиня', kind: 'sound', lvl: 1 },
    mean: { ru: 'Значение слова', kind: 'mean', lvl: 1 },
    'ear:tone': { ru: 'Тон на слух', kind: 'tone', lvl: 1 },
    'ear:pair': { ru: 'Слова, различимые только тоном', kind: 'tone', lvl: 1 },
    'ear:initial': { ru: 'Начало слога на слух', kind: 'sound', lvl: 1 },
    'ear:final': { ru: 'Конец слога на слух', kind: 'sound', lvl: 1 },
    'ear:spelling': { ru: 'Правила записи пиньиня', kind: 'spell', lvl: 1 },
  };
  const deckLvl = id => { const m = /(?:^|:)hsk([1-4])\b/.exec(String(id || '')); if (m) return +m[1]; return /freq/.test(String(id || '')) ? 4 : null; };
  function meta(id, seed) {
    let m = BUILTIN[id] ? { ...BUILTIN[id] } : null;
    if (!m) {
      const q = (seed && seed.q) || {}, a = (seed && seed.a) || {};
      if (id.indexOf('nasal:') === 0) m = { ru: 'Конец слога: ' + id.slice(6).replace('/', ' против '), kind: 'sound', lvl: 1 };
      else if (id.indexOf('ini:') === 0) m = { ru: 'Начало слога: ' + id.slice(4).replace('/', ' против '), kind: 'sound', lvl: 1 };
      else if (id.indexOf('spell:') === 0) {
        const key = id.slice(6);
        const rule = ((window.PHON && PHON.SPELLING) || []).find(s => s.key === key);
        m = { ru: rule ? rule.t : 'Правило записи ' + key, kind: 'spell', lvl: 1 };
      } else if (id.indexOf('hand:') === 0) m = { ru: 'Письмо ' + id.slice(5), kind: 'hand', lvl: a.level || 1 };
      else if (id.indexOf('node:') === 0) {
        /* Вопрос экзамена — это не слово, а раздел бланка: карточка у всех вопросов части одна */
        const ex = /^node:ex(\d+):([a-z]+)(\d+)$/.exec(id);
        if (ex) {
          const sec = EXAM_SEC[ex[2]];
          m = { ru: 'Экзамен HSK ' + ex[1] + ' · ' + (sec ? sec.zh + ' ' + sec.ru : ex[2]) + ', часть ' + ex[3], kind: 'exam', lvl: +ex[1] };
        } else {
          const label = [q.hanzi, q.ru].filter(Boolean).join(' · ');
          m = { ru: label || id.slice(5), kind: 'word', lvl: deckLvl(q.cardId) || deckLvl((a.deckIds || [])[0]) || a.level || null };
        }
      } else m = { ru: id, kind: 'word', lvl: null };
    }
    if (m.sev == null) m.sev = KIND_SEV[m.kind] != null ? KIND_SEV[m.kind] : 1;
    const cat = trapMeta(id);
    if (cat) Object.assign(m, cat);
    if (!(m.sev > 0)) m.sev = 1;
    return m;
  }

  /* Уровень ученика: рабочий уровень похода, если модуль загружен */
  function myLevel(state) {
    try { if (window.Boss && Boss.levelOf) { const l = Boss.levelOf(state); if (l > 0) return l; } } catch (e) { /* уровня нет — считаем первый */ }
    const l = state && state.level;
    return l > 0 ? l : 1;
  }
  /* λ: ломаться на пройденном дороже, чем на том, куда только тянешься */
  function lambda(lvl, my) {
    if (!lvl) return 1;
    if (lvl < my) return 1.3;
    if (lvl > my) return 0.5;
    return 1;
  }

  /* ── серия чистых: засчитываем не больше трёх из одной попытки ── */
  function runMetrics(run) {
    const bySrc = {}, dayset = {};
    for (const c of run) { bySrc[c.src] = (bySrc[c.src] || 0) + 1; dayset[dayKey(c.ts)] = 1; }
    let credit = 0;
    for (const k of Object.keys(bySrc)) credit += Math.min(PER_ATTEMPT, bySrc[k]);
    return { credit, days: Object.keys(dayset).length, n: run.length };
  }

  /* ── проход по случаям: эпохи между тушениями ──
     Промахи, открывшие огонь, остаются в своей эпохе: после тушения счёт возвратов начинается с нуля. */
  function scan(cases, now) {
    let outs = 0, outAt = 0, lastMiss = 0;
    let misses = [], perSrc = {}, burning = false, sameSrc = false, run = [], pending = 0;
    const close = at => { outs++; outAt = at; misses = []; perSrc = {}; burning = false; sameSrc = false; run = []; pending = 0; };
    for (const c of cases) {
      if (pending && c.ts >= pending) close(pending);   /* огонь потух раньше, чем случился этот случай */
      if (!c.ok) {
        lastMiss = c.ts;
        misses.push(c.ts);
        perSrc[c.src] = (perSrc[c.src] || 0) + 1;
        run = []; pending = 0;
        if (perSrc[c.src] >= 2) { burning = true; sameSrc = true; }
        if (misses.length >= 2 && c.ts - misses[misses.length - 2] <= BURN_WINDOW) burning = true;
      } else {
        if (!misses.length && !outs) continue;          /* до первого промаха копить нечего */
        run.push(c);
        if (!pending && misses.length) {
          const m = runMetrics(run);
          /* момент тушения — когда созрели обе части: и серия, и тишина */
          if (m.credit >= OUT_CLEAN && m.days >= OUT_DAYS) pending = Math.max(c.ts, misses[misses.length - 1] + OUT_QUIET * DAY);
        }
      }
    }
    if (pending && pending <= now) close(pending);
    return { outs, outAt, misses, burning, sameSrc, run, lastMiss, pending };
  }

  /* ── прочность: «капля камень точит» ──
     0…1 — насколько выполнены все три условия тушения разом. */
  function stone(credit, dayN, quiet) {
    const p = (Math.min(1, credit / OUT_CLEAN) + Math.min(1, dayN / OUT_DAYS) + Math.min(1, quiet / OUT_QUIET)) / 3;
    return Math.round(p * 100) / 100;
  }
  /* «ещё 4 чистых, 1 день, камень 0.62 → 0.75»: что осталось и куда сдвинется камень за одно чистое занятие */
  function toExtinguishLine(f) {
    if (!f) return '';
    if (f.status === 'out') return 'потушен';
    const need = [];
    const c = Math.max(0, OUT_CLEAN - f.credit);
    const d = Math.max(0, OUT_DAYS - f.streakDays);
    const q = Math.max(0, OUT_QUIET - (f.quiet || 0));
    if (c) need.push(c + ' ' + plur(c, 'чистый', 'чистых', 'чистых'));
    if (d) need.push(days(d));
    if (q) need.push(days(q) + ' тишины');
    const nowS = stone(f.credit, f.streakDays, f.quiet || 0);
    const nextS = stone(f.credit + PER_ATTEMPT, f.streakDays + 1, (f.quiet || 0) + 1);
    const tail = 'камень ' + nowS.toFixed(2) + ' → ' + nextS.toFixed(2);
    return (need.length ? 'ещё ' + need.join(', ') + ', ' : '') + tail;
  }

  /* ── почему такой статус ── */
  function whyOf(status, sc, m, quiet) {
    const n = sc.misses.length;
    if (status === 'out') return 'потушен: ' + OUT_CLEAN + ' чистых, ' + days(OUT_DAYS) + ', ' + days(OUT_QUIET) + ' тишины';
    if (status === 'fading') return m.credit + ' ' + plur(m.credit, 'чистый', 'чистых', 'чистых') + ' подряд в ' + days(m.days);
    if (status === 'relit') return n + ' ' + plur(n, 'промах', 'промаха', 'промахов') + ' после тушения';
    if (status === 'burning') {
      if (sc.sameSrc) return '2 промаха в одной попытке';
      const span = Math.round((sc.misses[n - 1] - sc.misses[0]) / DAY);
      return n + ' ' + plur(n, 'промах', 'промаха', 'промахов') + ' за ' + days(Math.max(1, span));
    }
    return '1 промах ' + (quiet > 0 ? quiet + ' ' + plur(quiet, 'день', 'дня', 'дней') + ' назад' : 'сегодня');
  }

  /* ── сам реестр ── */
  function compute(state, now = Date.now()) {
    if (typeof now !== 'number' || !isFinite(now)) now = Date.now();
    const attempts = ((state && state.attempts) || [])
      .filter(a => a && !a.aborted && typeof a.ts === 'number' && a.ts <= now)
      .slice()
      .sort((x, y) => (x.ts - y.ts) || String(x.id || '').localeCompare(String(y.id || '')));
    const reg = new Map();
    for (const a of attempts) {
      const src = a.id != null ? String(a.id) : 't' + a.ts;
      for (const q of a.questions || []) {
        if (!q) continue;
        for (const h of trace(a, q)) {
          let rec = reg.get(h.id);
          if (!rec) { rec = { id: h.id, cases: [], seed: { a, q } }; reg.set(h.id, rec); }
          rec.cases.push({ ts: a.ts, ok: h.ok, src });
        }
      }
    }
    const my = myLevel(state);
    const out = [];
    for (const rec of reg.values()) {
      const f = build(rec, my, now);
      if (f) out.push(f);
    }
    out.sort((a, b) => b.weight - a.weight || b.miss10 - a.miss10 || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return out;
  }

  function build(rec, my, now) {
    const cases = rec.cases;
    if (!cases.some(c => !c.ok)) return null;         /* без промаха огня нет */
    const sc = scan(cases, now);
    const m = runMetrics(sc.run);
    const last = cases[cases.length - 1];
    const idle = now - last.ts;
    const quiet = sc.lastMiss ? Math.floor((now - sc.lastMiss) / DAY) : null;
    let status;
    if (!sc.misses.length) status = sc.outs ? 'out' : null;
    else if (m.credit >= FADE_CLEAN && m.days >= FADE_DAYS) status = 'fading';
    else if (sc.outs && sc.misses.length >= 2) status = 'relit';
    else if (sc.burning) status = 'burning';
    else if (idle > NOTICED_IDLE) status = null;      /* замечен и с тех пор ни разу не потребовался */
    else status = 'noticed';
    if (!status) return null;

    const info = meta(rec.id, rec.seed);
    const recent = cases.slice(-RECENT);
    const n10 = recent.length, miss10 = recent.filter(c => !c.ok).length;
    const rate = n10 ? r2(miss10 / n10) : 0;
    const lam = lambda(info.lvl, my);
    const f = {
      id: rec.id, ru: info.ru, kind: info.kind, lvl: info.lvl || null,
      cases,
      n10, miss10, rate,
      streak: sc.run.length, credit: m.credit, streakDays: m.days,
      quiet, idle: Math.floor(idle / DAY),
      misses: cases.filter(c => !c.ok).length, epochMisses: sc.misses.length,
      status, statusRu: STATUS[status].ru, statusZh: STATUS[status].zh,
      outs: sc.outs, outAt: sc.outAt || null,
      sev: info.sev, lambda: lam,
      weight: r3(rate * info.sev * lam),
      why: whyOf(status, sc, m, quiet),
    };
    f.toExtinguish = toExtinguishLine(f);
    f.bounty = bounty(f);
    return f;
  }

  /* Три главных: самые тяжёлые, но не больше двух из одной категории — чтобы не давать три тона подряд */
  function top3(state, now = Date.now()) {
    const all = compute(state, now).filter(f => f.status !== 'out');
    const out = [], perKind = {};
    for (const f of all) {
      if ((perKind[f.kind] || 0) >= 2) continue;
      out.push(f);
      perKind[f.kind] = (perKind[f.kind] || 0) + 1;
      if (out.length === 3) break;
    }
    return out;
  }

  /* Плата за потушенный огонь. Повторное тушение того же — вдвое, вчетверо, дальше даром. */
  function bounty(fire) {
    if (!fire || !fire.outs) return 0;
    const sev = fire.sev > 0 ? fire.sev : 1;
    const lam = fire.lambda > 0 ? fire.lambda : 1;
    const base = Math.min(BOUNTY_MAX, Math.max(BOUNTY_MIN, Math.round(BOUNTY_BASE * sev * lam)));
    const mult = fire.outs <= REPEAT.length ? REPEAT[fire.outs - 1] : 0;
    return Math.round(base * mult);
  }

  const toExtinguish = fire => toExtinguishLine(fire);

  return {
    STATUS, DAY, BURN_WINDOW, NOTICED_IDLE, FADE_CLEAN, FADE_DAYS, OUT_CLEAN, OUT_DAYS, OUT_QUIET,
    PER_ATTEMPT, RECENT, BOUNTY_BASE, BOUNTY_MIN, BOUNTY_MAX, REPEAT, KIND_SEV,
    compute, top3, bounty, toExtinguish, stone, trace, segment, meta, lambda, dayKey,
  };
})();
