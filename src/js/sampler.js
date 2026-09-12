/* Сэмплер: что и как спрашивать по локальной статистике.
   Узел = карточка × подслучай (read/say/ru2zh/listen/type/hand). Подслучай выводится из вопроса,
   отдельно нигде не хранится. Всё здесь — чистые функции от state.attempts: ничего не пишем,
   ничего не мутируем, порядок чтения журнала на результат не влияет. Поэтому методику учёта
   можно переключать туда-обратно, пересчитывая с нуля. */
window.Sampler = (() => {
  const HOUR = 3600e3, DAY = 24 * HOUR;
  const SUBS = ['read', 'say', 'ru2zh', 'listen', 'type', 'hand'];
  const LABELS = {
    read: { zh: '读', ru: 'читаете' },
    say: { zh: '说', ru: 'произносите' },
    ru2zh: { zh: '译', ru: 'с перевода' },
    listen: { zh: '听', ru: 'на слух' },
    type: { zh: '输入', ru: 'набираете' },   /* набор с клавиатуры — 输入, не 写 */
    hand: { zh: '手写', ru: 'от руки' },     /* письмо от руки — 手写, одного 手 мало */
  };
  const DECAY = 0.92;              /* вес i-го с конца ответа узла */
  const WINDOW = 24;               /* сколько последних ответов узла держим в точности */
  const COOLDOWN = 48 * HOUR;      /* окно, в которое ту же пару карточка|подслучай не повторяем */
  const FRESH = 3 * DAY;           /* за столько «давность» узла дорастает до полной */
  const MAX_PICK = 2000;           /* потолок длины выборки: кривой count не должен вешать вкладку */

  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const arr = v => (Array.isArray(v) ? v : []);
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

  /* ── подслучай по самому вопросу ── */
  /* Поля берём те, что кладут views-quiz.js (show/guess попытки и вопроса) и views-hand.js (show:'hand'). */
  function subOf(a, q) {
    const mode = String((q && q.mode) || (a && a.mode) || '');
    const show = String((q && q.show) || (a && a.show) || '');
    /* пустой guess вопроса — не ответ, а отсутствие данных: тогда смотрим на попытку */
    const qg = arr(q && q.guess), ag = arr(a && a.guess);
    const guess = (qg.length ? qg : ag).map(String);
    const has = p => guess.indexOf(p) >= 0;
    if (mode === 'hand' || show === 'hand' || has('stroke')) return 'hand';
    if (mode === 'write') return 'type';                          /* набор иероглифа — суть режима, чем бы ни показали */
    if (mode === 'listen' || mode === 'phon' || show === 'audio') return 'listen';
    if (show === 'sentence') return 'read';                       /* слово в предложение — чтение, а не набор */
    if (has('hanzi') && !has('ru')) return show === 'ru' ? 'ru2zh' : 'type';
    if (has('ru')) return 'read';
    if (has('pinyin')) return 'say';
    if (show === 'ru') return 'ru2zh';
    /* сюда попадают смешанные и служебные пометки ('all', 'flow', 'program'): по ним подслучай
       не восстановить, считаем чтением — самый частый и самый безобидный случай. */
    return 'read';
  }

  const tsOf = a => (a && (a.ts || a.endedAt)) || 0;
  const fracOf = q => {
    const f = typeof q.fraction === 'number' ? q.fraction : (q.ok ? 1 : 0);
    return f > 0 ? Math.min(1, f) : 0;                            /* NaN и мусор — как ноль */
  };
  /* На чём именно посыпались — для подсказок и для будущих ловушек */
  function trapsOf(q, sub) {
    const out = [];
    const parts = obj(q && q.parts);
    for (const p of Object.keys(parts)) {
      const v = parts[p];
      if (v === 'tones') out.push('tone');
      else if (v === 'wrong') out.push(p === 'answer' ? sub : p);
    }
    if (fracOf(q) < 1 && !out.length) out.push(sub);
    if (q && q.answer && q.answer.timeout) out.push('timeout');   /* views-quiz.js ставит timeout на истёкшем таймере */
    return out;
  }

  /* ── статистика узлов ── */
  /* { [cardId]: { by: { [sub]: { n, ok, wrong, acc, last, streak } }, traps: {..}, last, n } }
     acc — скользящая точность по последним 24 ответам узла с весами 0.92^i, fraction как есть
     (0.5 за «тоны не те»). Записи позже now игнорируем — так пересчёт «как было» тоже честный. */
  function nodeStats(attempts, now = Date.now()) {
    const rows = [];
    arr(attempts).forEach(a => {
      const ts = tsOf(a);
      if (!ts || ts > now) return;
      arr(a && a.questions).forEach((q, i) => {
        if (!q || !q.cardId) return;
        const sub = subOf(a, q);
        rows.push({ id: String(q.cardId), sub, f: fracOf(q), ts, aid: String((a && a.id) || ''), i, traps: trapsOf(q, sub) });
      });
    });
    /* Порядок восстанавливаем из самих данных, а не из порядка чтения журнала. Последние два
       ключа нужны на случай попыток без id с одинаковым ts: без них сортировка стабильна по
       входу, то есть результат зависел бы от порядка — а он обязан не зависеть. */
    rows.sort((x, y) => x.ts - y.ts || cmp(x.aid, y.aid) || x.i - y.i || cmp(x.id, y.id) || cmp(x.sub, y.sub) || x.f - y.f);

    const out = {};
    for (const r of rows) {
      const node = out[r.id] || (out[r.id] = { by: {}, traps: {}, last: 0, n: 0 });
      const b = node.by[r.sub] || (node.by[r.sub] = { n: 0, ok: 0, wrong: 0, acc: 0, last: 0, streak: 0, _h: [] });
      b._h.push(r.f);
      b.n++; if (r.f === 1) b.ok++; else b.wrong++;
      b.last = r.ts;
      node.n++; node.last = r.ts;
      for (const t of r.traps) node.traps[t] = (node.traps[t] || 0) + 1;
    }
    for (const id of Object.keys(out)) {
      for (const sub of Object.keys(out[id].by)) {
        const b = out[id].by[sub];
        const h = b._h.slice(-WINDOW);
        let w = 0, s = 0;
        for (let i = h.length - 1, k = 0; i >= 0; i--, k++) { const ww = Math.pow(DECAY, k); w += ww; s += h[i] * ww; }
        b.acc = w ? s / w : 0;
        /* подряд верных с конца; если последний мимо — столько же со знаком минус */
        const good = h[h.length - 1] === 1;
        let run = 0;
        for (let i = h.length - 1; i >= 0; i--) { if ((h[i] === 1) !== good) break; run++; }
        b.streak = good ? run : -run;
        delete b._h;
      }
    }
    return out;
  }

  /* Ключи пар карточка|подслучай за окно ms */
  function recentKeys(attempts, ms = COOLDOWN, now = Date.now()) {
    const out = new Set();
    for (const a of arr(attempts)) {
      const ts = tsOf(a);
      if (!ts || ts > now || now - ts > ms) continue;
      for (const q of arr(a && a.questions)) if (q && q.cardId) out.add(q.cardId + '|' + subOf(a, q));
    }
    return out;
  }

  /* Подслучай последнего ответа по карточке — чтобы вернуть слово ДРУГИМ заданием */
  function lastSubOf(node) {
    let best = null, bt = -1;
    for (const sub of Object.keys((node && node.by) || {})) {
      const b = node.by[sub];
      if (b.last > bt) { bt = b.last; best = sub; }
    }
    return best;
  }
  /* Крошечное детерминированное дрожание вместо Math.random — иначе функция перестала бы быть чистой */
  function hash01(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 100000) / 100000;
  }

  /* приоритет = слабость узла × давность × (не тот подслучай, что в прошлый раз) × новизна
     alt — есть ли у карточки другой разрешённый подслучай: если выбора нет, штрафовать не за что */
  function scoreOf(node, sub, now, alt) {
    const b = node && node.by ? node.by[sub] : null;
    let weak;
    if (!b || !b.n) weak = 0.5;                                  /* про узел ничего не знаем — умеренно интересен */
    else {
      weak = 1 - b.acc;
      if (b.streak < 0) weak += 0.15 * Math.min(2, -b.streak);   /* сыплется подряд — тем более */
      weak = Math.max(0.05, Math.min(1.4, weak));
    }
    const last = b && b.last ? b.last : 0;
    const rec = last ? 0.35 + 0.65 * Math.min(1, Math.max(0, now - last) / FRESH) : 1;
    const vary = (alt && lastSubOf(node) === sub) ? 0.35 : 1;   /* только что спрашивали так же — вернём иначе */
    const nov = !node || !node.n ? 1.2 : node.n < 3 ? 1.05 : 1;
    return weak * rec * vary * nov;
  }

  /* Список { card, sub } на сессию. Пара cardId|sub внутри сессии не повторяется, пока есть
     непотраченные пары; порог «не спрашивать недавнее» при исчерпании пула слабеет 48 ч → 24 ч →
     без ограничения, и только когда уникальных пар меньше, чем вопросов, идём по кругу. */
  function pick(cards, stats, opts = {}) {
    const o = obj(opts);
    const now = o.now || Date.now();
    const n0 = o.count == null ? 20 : Math.floor(Number(o.count));
    const want = n0 > 0 ? Math.min(n0, MAX_PICK) : 0;             /* NaN → 0, Infinity → потолок, без зависаний */
    const subs = (Array.isArray(o.subs) && o.subs.length) ? o.subs : SUBS;
    const cool = o.cooldownMs == null ? COOLDOWN : Number(o.cooldownMs) || 0;
    const seed = String(o.seed == null ? '' : o.seed);
    const banned = o.recent instanceof Set ? o.recent : new Set(arr(o.recent));
    const st = obj(stats);
    const cand = [];
    for (const card of arr(cards)) {
      if (!card || !card.id) continue;
      const allowed = (Array.isArray(card.subs) && card.subs.length) ? card.subs.filter(s => subs.indexOf(s) >= 0) : subs;
      const node = st[card.id];
      for (const sub of allowed) {
        const key = card.id + '|' + sub;
        const b = node && node.by ? node.by[sub] : null;
        cand.push({ card, sub, key, last: (b && b.last) || 0, score: scoreOf(node, sub, now, allowed.length > 1) * (0.9 + 0.2 * hash01(key + '#' + seed)) });
      }
    }
    cand.sort((a, b) => b.score - a.score || cmp(a.key, b.key));

    const out = [], used = new Set();
    /* Проходы: сперва не трогаем недавнее, потом порог слабеет вдвое, потом остаётся только
       явный список recent, и лишь в последнем проходе (-1) не запрещено ничего. Список recent
       обязан работать и при cooldownMs: 0 — иначе явный запрет молча терялся бы. */
    const tiers = cool > 0 ? [cool, cool / 2, 0, -1] : [0, -1];
    for (const tier of tiers) {
      for (const c of cand) {
        if (out.length >= want) break;
        if (used.has(c.key)) continue;
        if (tier >= 0) {
          if (banned.has(c.key)) continue;
          if (tier > 0 && c.last && now - c.last < tier) continue;
        }
        used.add(c.key);
        out.push({ card: c.card, sub: c.sub });
      }
      if (out.length >= want) break;
    }
    /* банк маленький (HSK 1 — 150 слов): «никогда не повторять» невозможно, поэтому добираем по кругу */
    for (let i = 0; out.length < want && cand.length; i++) out.push({ card: cand[i % cand.length].card, sub: cand[i % cand.length].sub });
    return out;
  }

  /* Короткая человеческая справка по карточке: «читаете уверенно, на слух мимо 3 из 5» */
  function explain(stats, cardId) {
    const node = obj(stats)[cardId];
    if (!node || !node.n) return 'ещё не спрашивали';
    const rows = Object.keys(node.by).map(sub => [sub, node.by[sub]]).filter(r => r[1].n > 0)
      .sort((a, b) => b[1].acc - a[1].acc || cmp(a[0], b[0]));
    return rows.slice(0, 3).map(([sub, b]) => {
      const L = (LABELS[sub] || { ru: sub }).ru;
      if (b.acc >= 0.85) return L + ' уверенно';
      if (b.acc >= 0.65) return L + ' с запинкой';
      return L + ' мимо ' + b.wrong + ' из ' + b.n;
    }).join(', ');
  }

  return { SUBS, LABELS, DECAY, WINDOW, COOLDOWN, FRESH, MAX_PICK, subOf, nodeStats, recentKeys, pick, explain, lastSubOf };
})();
