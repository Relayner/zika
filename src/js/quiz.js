/* Движок тестов: отбор карточек, генерация вопросов и вариантов, проверка ответов, подсчёт. */
window.Quiz = (() => {
  const PARTS = ['hanzi', 'pinyin', 'ru'];
  const MULT = { easy: 1, medium: 1.5, hard: 2.5, flip: 1 };
  const OPTIONS = { easy: 4, medium: 8 };
  const rnd = n => Math.floor(Math.random() * n);
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function normRu(s) {
    return String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/\([^)]*\)/g, ' ')
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
  }
  function norm(v, part) {
    if (part === 'pinyin') { const a = Pinyin.analyze(v); return a.letters + '/' + a.tones.join(''); }
    if (part === 'hanzi') return String(v || '').replace(/[\s…]/g, '');
    return normRu(v);
  }
  const keyOf = (card, parts) => parts.map(p => norm(card[p], p)).join('|');

  /* Похожесть кандидата на правильный ответ (для среднего уровня) */
  function similarity(card, cand, parts) {
    let s = 0;
    for (const p of parts) {
      if (p === 'pinyin') {
        const a = Pinyin.analyze(card.pinyin), b = Pinyin.analyze(cand.pinyin);
        if (Pinyin.syllables(card.pinyin) === Pinyin.syllables(cand.pinyin)) s += 2;
        if (a.tones.join('') === b.tones.join('')) s += 2;
        if (Pinyin.initial(card.pinyin) === Pinyin.initial(cand.pinyin)) s += 2;
        if (a.letters.slice(-2) === b.letters.slice(-2)) s += 1;
        if (a.letters[0] === b.letters[0]) s += 1;
      } else if (p === 'hanzi') {
        if (card.hanzi.length === cand.hanzi.length) s += 3;
        for (const ch of card.hanzi) if (cand.hanzi.includes(ch)) { s += 3; break; }
      } else {
        if (Math.abs(card.ru.length - cand.ru.length) <= 5) s += 1;
        const words = normRu(card.ru).split(' ').filter(w => w.length > 3);
        const cr = normRu(cand.ru);
        for (const w of words) if (cr.includes(w.slice(0, 4))) { s += 2; break; }
      }
    }
    return s + Math.random();
  }

  function weakScore(card, stats) {
    const s = stats && stats[card.id];
    if (!s || !s.asked) return 0.45 + Math.random() * 0.05;
    return s.correct / s.asked + Math.random() * 0.05;
  }
  function pickCards(cards, cfg, cardStats) {
    let list = cards.slice();
    const n = (cfg.count === 'all' || !cfg.count) ? list.length : Math.min(+cfg.count, list.length);
    if (cfg.order === 'weak') list.sort((a, b) => weakScore(a, cardStats) - weakScore(b, cardStats));
    else if (cfg.order === 'new') list.sort((a, b) => ((cardStats[a.id] || {}).asked || 0) - ((cardStats[b.id] || {}).asked || 0) + Math.random() * 0.5 - 0.25);
    else shuffle(list);
    list = list.slice(0, n);
    if (cfg.order !== 'random') shuffle(list);
    return list;
  }

  /* cfg: {show:'hanzi'|'pinyin'|'ru'|'mixed', guess:[parts], difficulty, count, order}
     pool: карточки для вариантов ответа */
  function buildQuestions(cards, pool, cfg, cardStats) {
    const picked = pickCards(cards, cfg, cardStats || {});
    return picked.map(card => {
      if (cfg.mode === 'write') {
        /* лёгкий — с пиньинем (учимся выбирать среди омофонов), средний — по переводу, сложный — на слух */
        const show = cfg.difficulty === 'medium' ? 'ru' : cfg.difficulty === 'hard' ? (cfg.noVoice ? 'ru' : 'audio') : 'both';
        return { cardId: card.id, show, guess: ['hanzi'], card };
      }
      const show = cfg.show === 'mixed' ? PARTS[rnd(3)] : cfg.show;
      let guess = (cfg.show === 'mixed' || !cfg.guess || !cfg.guess.length)
        ? PARTS.filter(p => p !== show) : cfg.guess.filter(p => p !== show);
      if (!guess.length) guess = PARTS.filter(p => p !== show);
      const q = { cardId: card.id, show, guess, card };
      if (cfg.difficulty === 'easy' || cfg.difficulty === 'medium') Object.assign(q, makeOptions(card, pool, guess, OPTIONS[cfg.difficulty], cfg.difficulty === 'medium'));
      return q;
    });
  }
  function makeOptions(card, pool, guess, n, similar) {
    const seen = new Set([keyOf(card, guess)]);
    const uniq = [];
    for (const c of pool) {
      if (c.id === card.id) continue;
      const k = keyOf(c, guess);
      if (seen.has(k)) continue;
      seen.add(k); uniq.push(c);
    }
    let chosen;
    if (similar) {
      const scored = uniq.map(c => [similarity(card, c, guess), c]).sort((a, b) => b[0] - a[0]);
      chosen = scored.slice(0, n - 1).map(x => x[1]);
    } else chosen = shuffle(uniq).slice(0, n - 1);
    const options = shuffle([card, ...chosen]).map(c => ({ cardId: c.id, hanzi: c.hanzi, pinyin: c.pinyin, ru: c.ru }));
    return { options, answerIdx: options.findIndex(o => o.cardId === card.id) };
  }

  /* ── аудирование ── */
  function buildListen(cards, cfg, cardStats) {
    const picked = pickCards(cards, cfg, cardStats || {});
    return picked.map(card => {
      const q = { cardId: card.id, show: 'audio', guess: ['answer'], kind: 'listen', card };
      if (cfg.difficulty === 'easy') { Object.assign(q, makeOptions(card, cards, ['pinyin'], 4, false)); q.optionParts = ['hanzi', 'pinyin', 'ru']; }
      else if (cfg.difficulty === 'medium') { Object.assign(q, makeOptions(card, cards, ['pinyin'], 8, true)); q.optionParts = ['hanzi']; }
      return q;
    });
  }
  function checkListen(q, input) {
    const v = String(input || '').trim();
    if (!v) return { parts: { answer: 'wrong' }, fraction: 0, ok: false };
    if (hanziMatch(q.card.hanzi, v)) return { parts: { answer: 'exact' }, fraction: 1, ok: true };
    const r = Pinyin.compare(q.card.pinyin, v);
    if (r === 'exact') return { parts: { answer: 'exact' }, fraction: 1, ok: true };
    if (r === 'tones') return { parts: { answer: 'tones' }, fraction: 0.5, ok: false };
    return { parts: { answer: 'wrong' }, fraction: 0, ok: false };
  }

  /* ── фразы ── */
  const normZh = s2 => String(s2 || '').replace(/[\s。，、？！?!.,:;·…“”"'’‘（）()]/g, '');
  function makeTextOptions(correct, poolTexts, n, similar) {
    const seen = new Set([correct]), uniq = [];
    for (const t of poolTexts) { if (seen.has(t)) continue; seen.add(t); uniq.push(t); }
    let chosen;
    if (similar) chosen = uniq.map(t => [-Math.abs(t.length - correct.length) + ([...t].some(ch => correct.includes(ch)) ? 1.5 : 0) + Math.random(), t]).sort((a, b) => b[0] - a[0]).slice(0, n - 1).map(x => x[1]);
    else chosen = shuffle(uniq.slice()).slice(0, n - 1);
    const options = shuffle([correct, ...chosen]).map(t => ({ text: t }));
    return { options, answerIdx: options.findIndex(o => o.text === correct) };
  }
  function buildSentence(items, cfg, cardStats) {
    const wrapped = items.map(it => ({ id: 'sent:' + it.id, it }));
    const picked = pickCards(wrapped, cfg, cardStats || {});
    const poolTexts = items.map(it => it.a[0]);
    return picked.map(w => {
      const it = w.it;
      const q = { cardId: w.id, show: 'sentence', guess: ['answer'], kind: 'sentence', sent: it, card: { hanzi: it.q, pinyin: it.a[0], ru: it.ru } };
      if (cfg.difficulty === 'easy') Object.assign(q, makeTextOptions(it.a[0], poolTexts, 4, false));
      else if (cfg.difficulty === 'medium') Object.assign(q, makeTextOptions(it.a[0], poolTexts, 8, true));
      return q;
    });
  }
  function checkSentence(q, input) {
    const inp = normZh(input);
    const ok = !!inp && q.sent.a.some(v => normZh(v) === inp);
    return { parts: { answer: ok ? 'exact' : 'wrong' }, fraction: ok ? 1 : 0, ok };
  }

  /* Экзаменационный формат HSK — фиксированный, по духу HSK 2.0:
     1–2: пиньинь подписан, выбор из 4; 3: без пиньиня + часть «написание иероглифов». Порог 60 %. */
  const EXAM = {
    1: { count: 20, timer: 20, similar: false, pinyin: true, write: 0, max: 200 },
    2: { count: 30, timer: 20, similar: true, pinyin: true, write: 0, max: 200 },
    3: { count: 40, timer: 25, similar: true, pinyin: false, write: 10, max: 300 },
  };
  function buildExam(level, cards, cardStats) {
    const spec = EXAM[level];
    const picked = pickCards(cards, { count: spec.count, order: 'random' }, cardStats || {});
    const reading = picked.length - spec.write;
    return picked.map((card, i) => {
      if (i >= reading) return { cardId: card.id, show: 'both', guess: ['hanzi'], card, section: 'write' };
      const typeA = i % 2 === 0;
      const show = typeA ? (spec.pinyin ? 'hp' : 'hanzi') : 'ru';
      const guess = typeA ? ['ru'] : ['hanzi'];
      const optionParts = (!typeA && spec.pinyin) ? ['hanzi', 'pinyin'] : guess;
      return { cardId: card.id, show, guess, optionParts, card, section: 'read', ...makeOptions(card, cards, guess, 4, spec.similar) };
    });
  }

  function lev(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  function ruMatch(ru, input) {
    const inp = normRu(input);
    if (!inp) return false;
    const variants = new Set(String(ru).split(/[,;/]/).map(normRu).filter(Boolean));
    variants.add(normRu(ru));
    for (const v of variants) {
      if (v === inp) return true;
      const tol = v.length >= 9 ? 2 : v.length >= 5 ? 1 : 0;
      if (tol && lev(v, inp) <= tol) return true;
    }
    return false;
  }
  function hanziMatch(h, input) {
    const clean = s => String(s || '').replace(/[\s…。，,.·・、]/g, '');
    return clean(h) === clean(input) && clean(input).length > 0;
  }

  function checkChoice(q, idx) {
    const ok = idx === q.answerIdx;
    const parts = {};
    q.guess.forEach(p => { parts[p] = ok ? 'exact' : 'wrong'; });
    return { parts, fraction: ok ? 1 : 0, ok };
  }
  function checkInput(q, answers) {
    const parts = {};
    let sum = 0;
    for (const p of q.guess) {
      const inp = (answers[p] || '').trim();
      let r;
      if (p === 'pinyin') { r = Pinyin.compare(q.card.pinyin, inp); if (r === 'empty') r = 'wrong'; }
      else if (p === 'ru') r = ruMatch(q.card.ru, inp) ? 'exact' : 'wrong';
      else r = hanziMatch(q.card.hanzi, inp) ? 'exact' : 'wrong';
      parts[p] = r;
      sum += r === 'exact' ? 1 : r === 'tones' ? 0.5 : 0;
    }
    const fraction = sum / q.guess.length;
    return { parts, fraction, ok: fraction === 1 };
  }
  function scoreAttempt(questions, difficulty) {
    const n = questions.length || 1;
    const sum = questions.reduce((a, q) => a + (q.result ? q.result.fraction : 0), 0);
    const percent = Math.round(sum / n * 100);
    return {
      percent,
      score: Math.round(percent * (MULT[difficulty] || 1)),
      correct: questions.filter(q => q.result && q.result.fraction === 1).length,
      partial: questions.filter(q => q.result && q.result.fraction > 0 && q.result.fraction < 1).length,
    };
  }

  return { PARTS, MULT, OPTIONS, EXAM, buildQuestions, buildExam, buildListen, buildSentence, checkListen, checkSentence, normZh, checkChoice, checkInput, scoreAttempt, ruMatch, hanziMatch, shuffle, similarity };
})();
