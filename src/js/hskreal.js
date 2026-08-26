/* Движок настоящего экзамена HSK: собирает случайный вариант из банков по структуре реального экзамена. */
window.HskReal = (() => {
  const rnd = n => Math.floor(Math.random() * n);
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const PASS = 0.6;

  /* Полный список картинок: банк HSK1 (p01–p40) + новые p41–p60 (слова уровня HSK 2) */
  const PIC_WORDS2 = [
    ['p41', '咖啡', 'kāfēi'], ['p42', '牛奶', 'niúnǎi'], ['p43', '西瓜', 'xīguā'], ['p44', '鸡蛋', 'jīdàn'],
    ['p45', '鱼', 'yú'], ['p46', '面条', 'miàntiáo'], ['p47', '手机', 'shǒujī'], ['p48', '手表', 'shǒubiǎo'],
    ['p49', '报纸', 'bàozhǐ'], ['p50', '药', 'yào'], ['p51', '自行车', 'zìxíngchē'], ['p52', '公共汽车', 'gōnggòng qìchē'],
    ['p53', '火车', 'huǒchē'], ['p54', '跑步', 'pǎobù'], ['p55', '踢足球', 'tī zúqiú'], ['p56', '打篮球', 'dǎ lánqiú'],
    ['p57', '游泳', 'yóuyǒng'], ['p58', '跳舞', 'tiàowǔ'], ['p59', '唱歌', 'chànggē'], ['p60', '下雪', 'xià xuě'],
  ].map(([id, h, py]) => ({ id, h, py }));
  const ALL_PICS = () => [...window.HSK1EXAM.PICS, ...PIC_WORDS2];
  const availPics = () => {
    const av = new Set(window.PICS_AVAILABLE || []);
    return ALL_PICS().filter(p => av.has(p.id));
  };
  const picById = id => ALL_PICS().find(p => p.id === id);

  /* ── Глубокий рандомайзер ──
     Каждый банк помнит, какие задания уже выпадали, и следующий вариант собирается
     сначала из тех, что давно не встречались. Повтор возможен только когда банк исчерпан. */
  const SEEN_KEY = 'zika:examSeen';
  const loadSeen = () => { try { return JSON.parse(localStorage.getItem(SEEN_KEY)) || {}; } catch (e) { return {}; } };
  const saveSeen = s => { try { localStorage.setItem(SEEN_KEY, JSON.stringify(s)); } catch (e) { /* не критично */ } };
  const itemKey = it => [
    Array.isArray(it.say) ? it.say.join('|') : (it.say || ''),
    it.q || '', it.t || '', it.text || '', it.star || '',
    it.a || '', it.b || '', it.ans || '',                       /* диалоги {a,b} и пропуски {ans} тоже должны различаться */
    Array.isArray(it.parts) ? it.parts.join('') : '',
    Array.isArray(it.chunks) ? it.chunks.join('') : '',
  ].join('\u00a7');
  let pendingSeen = null;
  /* n заданий из банка: сначала не встречавшиеся, потом самые давние */
  function pick(bank, n, tag, uniqBy) {
    if (!bank || !bank.length) return [];
    const seen = pendingSeen || (pendingSeen = loadSeen());
    const used = seen[tag] || [];
    const age = new Map(used.map((k, i) => [k, i + 1])); /* больше — свежее, значит брать в последнюю очередь */
    const fresh = shuffle(bank.filter(it => !age.has(itemKey(it))));
    const stale = shuffle(bank.filter(it => age.has(itemKey(it)))).sort((a, b) => age.get(itemKey(a)) - age.get(itemKey(b)));
    const queue = [...fresh, ...stale];
    const out = [];
    const taken = new Set();
    for (const it of queue) {
      if (out.length >= n) break;
      /* для пулов: два задания с одинаковым ответом в один блок не пускаем */
      if (uniqBy) { const u = uniqBy(it); if (taken.has(u)) continue; taken.add(u); }
      out.push(it);
    }
    /* помним не больше 60% банка, иначе свежих не останется */
    const cap = Math.max(n, Math.floor(bank.length * 0.6));
    const keys = out.map(itemKey);
    seen[tag] = [...used.filter(k => keys.indexOf(k) < 0), ...keys].slice(-cap);
    return out;
  }
  /* Записываем память один раз в конце сборки варианта */
  function flushSeen() { if (pendingSeen) { saveSeen(pendingSeen); pendingSeen = null; } }

  /* Экзамен HSK 1: 听力 4×5 + 阅读 4×5. Вопросы без мгновенной проверки — разбор в конце, как на настоящем. */
  function buildExam1() {
    const B = window.HSK1EXAM;
    const pics = shuffle(availPics());
    if (pics.length < 16) throw new Error('Мало картинок для экзамена');
    const avail = new Set(pics.map(p => p.id));
    const sentPool = pick(B.SENT.filter(s => avail.has(s.pic)), 10, 'e1:SENT');
    const dlgPool = pick(B.DLG.filter(d => avail.has(d.pic)), 5, 'e1:DLG');
    let picCursor = 0;
    const takePics = n => pics.slice(picCursor, picCursor += n);
    const qs = [];
    /* Слушание ч.1: слово + картинка → 对/错 (смесь гарантирована) */
    const truths1 = shuffle([true, true, false, false, Math.random() < 0.5]);
    const l1pics = takePics(5);
    const l1others = shuffle(pics.filter(x => !l1pics.some(y => y.id === x.id)));   /* подмены не повторяются */
    let l1k = 0;
    l1pics.forEach((p, ti) => {
      const truth = truths1[ti];
      const other = truth ? null : (l1others[l1k++] || pics[0]);   /* подмену берём только для ложных */
      qs.push({ sec: 'listening', part: 1, type: 'tf', say: truth ? p.h : other.h, pic: p.id, correct: truth ? 0 : 1 });
    });
    /* Слушание ч.2: предложение → выбрать картинку из 3 */
    const l2 = sentPool.slice(0, 5);
    for (const it of l2) {
      const wrong = shuffle(pics.filter(p => p.id !== it.pic)).slice(0, 2);
      const opts = shuffle([it.pic, ...wrong.map(w => w.id)]);
      qs.push({ sec: 'listening', part: 2, type: 'pickpic', say: it.say, pics: opts, correct: opts.indexOf(it.pic) });
    }
    /* Слушание ч.3: диалог → картинка */
    for (const it of dlgPool.slice(0, 5)) {
      const wrong = shuffle(pics.filter(p => p.id !== it.pic)).slice(0, 2);
      const opts = shuffle([it.pic, ...wrong.map(w => w.id)]);
      qs.push({ sec: 'listening', part: 3, type: 'pickpic', say: [it.a, it.b], pics: opts, correct: opts.indexOf(it.pic) });
    }
    /* Слушание ч.4: вопрос → выбрать ответ (текст) */
    for (const it of pick(B.QA4, 5, 'e1:QA4')) {
      const order = shuffle([0, 1, 2]);
      qs.push({ sec: 'listening', part: 4, type: 'opts', say: it.say, opts: order.map(i => it.opts[i]), correct: order.indexOf(0) });
    }
    /* Чтение ч.1: картинка + слово → 对/错 (смесь гарантирована) */
    const truthsR = shuffle([true, true, false, false, Math.random() < 0.5]);
    const r1pics = takePics(5);
    const r1others = shuffle(pics.filter(x => !r1pics.some(y => y.id === x.id)));   /* подмены не повторяются */
    let r1k = 0;
    r1pics.forEach((p, ti) => {
      const truth = truthsR[ti];
      const w = truth ? p : (r1others[r1k++] || pics[0]);   /* подмену берём только для ложных */
      qs.push({ sec: 'reading', part: 1, type: 'tf', text: w.h, textPy: w.py, pic: p.id, correct: truth ? 0 : 1 });
    });
    /* Чтение ч.2: предложение (текстом) → картинка */
    const r2 = sentPool.slice(5, 10);
    for (const it of r2) {
      const wrong = shuffle(pics.filter(p => p.id !== it.pic)).slice(0, 2);
      const opts = shuffle([it.pic, ...wrong.map(w => w.id)]);
      qs.push({ sec: 'reading', part: 2, type: 'pickpic', text: it.say, pics: opts, correct: opts.indexOf(it.pic) });
    }
    /* Чтение ч.3: вопрос ↔ ответ, общий пул из 6 */
    const qa = pick(B.QA3, 6, 'e1:QA3', x => x.a);
    const pool3 = shuffle(qa.map(x => x.a));
    qa.slice(0, 5).forEach(it => qs.push({ sec: 'reading', part: 3, type: 'pool', block: 'e1r3', text: it.q, pool: pool3, answer: it.a }));
    /* Чтение ч.4: пропуск ↔ слово, общий пул из 6 */
    const fills = pick(B.FILL, 6, 'e1:FILL', x => x.ans);
    const pool4 = shuffle(fills.map(x => x.ans));
    fills.slice(0, 5).forEach(it => qs.push({ sec: 'reading', part: 4, type: 'pool', block: 'e1r4', text: it.t, pool: pool4, answer: it.ans }));
    flushSeen();
    return qs;
  }

  /* Экзамен HSK 2: 听力 35 (4 части) + 阅读 25 (4 части) */
  function buildExam2() {
    const B = window.HSK2EXAM;
    const av = new Set((window.PICS_AVAILABLE || []));
    const pics = shuffle(availPics());
    const sentPool = pick(B.SENT.filter(x => av.has(x.pic)), 15, 'e2:SENT');
    const dlgPool = pick(B.DLG.filter(x => av.has(x.pic)), 10, 'e2:DLG');
    if (sentPool.length < 15 || dlgPool.length < 10) throw new Error('Мало картинок для экзамена HSK 2');
    const qs = [];
    /* 听力 ч.1 (10): предложение + картинка → 对/错 (5 верных + 5 неверных) */
    const truths2 = shuffle([true, true, true, true, true, false, false, false, false, false]);
    const l1set = sentPool.slice(0, 10);
    const l1alt = pick(B.SENT.filter(x => !l1set.some(y => y.say === x.say) && !sentPool.slice(10, 15).some(y => y.say === x.say)), 5, 'e2:ALT');
    let l2k = 0;
    l1set.forEach((it, ti) => {
      const truth = truths2[ti];
      const other = truth ? null : (l1alt[l2k++] || l1alt[0]);   /* подмену берём только для ложных: без повторов и не из чтения */
      qs.push({ sec: 'listening', part: 1, type: 'tf', say: truth ? it.say : other.say, pic: it.pic, correct: truth ? 0 : 1 });
    });
    /* 听力 ч.2 (10 = 2 блока по 5): диалог → картинка из пула 6 */
    for (let b = 0; b < 2; b++) {
      const block = dlgPool.slice(b * 5, b * 5 + 5);
      const extra = shuffle(pics.filter(p => !block.some(x => x.pic === p.id)))[0];
      const pool = shuffle([...block.map(x => x.pic), extra.id]);
      for (const it of block) qs.push({ sec: 'listening', part: 2, type: 'poolpic', block: 'e2l2' + b, say: [it.a, it.b], pool, answer: it.pic });
    }
    /* 听力 ч.3 (10): диалог + вопрос → 3 варианта */
    for (const it of pick(B.Q3, 10, 'e2:Q3')) {
      const order = shuffle([0, 1, 2]);
      qs.push({ sec: 'listening', part: 3, type: 'opts', say: it.say, opts: order.map(i => it.opts[i]), correct: order.indexOf(0) });
    }
    /* 听力 ч.4 (5): длинный диалог + вопрос */
    for (const it of pick(B.Q4, 5, 'e2:Q4')) {
      const order = shuffle([0, 1, 2]);
      qs.push({ sec: 'listening', part: 4, type: 'opts', say: it.say, opts: order.map(i => it.opts[i]), correct: order.indexOf(0) });
    }
    /* 阅读 ч.1 (5): предложение (текст) → картинка из пула 6 */
    const r1 = sentPool.slice(10, 15);
    {
      const extra = shuffle(pics.filter(p => !r1.some(x => x.pic === p.id)))[0];
      const pool = shuffle([...r1.map(x => x.pic), extra.id]);
      for (const it of r1) qs.push({ sec: 'reading', part: 1, type: 'poolpic', block: 'e2r1', text: it.say, pool, answer: it.pic });
    }
    /* 阅读 ч.2 (5): пропуск ↔ слово из пула 6 */
    const fills = pick(B.FILL, 6, 'e2:FILL', x => x.ans);
    const pool2 = shuffle(fills.map(x => x.ans));
    fills.slice(0, 5).forEach(it => qs.push({ sec: 'reading', part: 2, type: 'pool', block: 'e2r2', text: it.t, pool: pool2, answer: it.ans }));
    /* 阅读 ч.3 (5): текст + суждение ★ → 对/错 */
    const tf5 = [...pick(B.TF.filter(x => x.truth), 3, 'e2:TFy'), ...pick(B.TF.filter(x => !x.truth), 2, 'e2:TFn')];
    for (const it of shuffle(tf5)) qs.push({ sec: 'reading', part: 3, type: 'tf', text: it.text, star: it.star, correct: it.truth ? 0 : 1 });
    /* 阅读 ч.4 (10 = 2 блока по 5): реплика ↔ ответ из пула 6 */
    const pairs = pick(B.PAIR, 12, 'e2:PAIR', x => x.a);
    for (let b = 0; b < 2; b++) {
      const block = pairs.slice(b * 6, b * 6 + 6);
      const pool = shuffle(block.map(x => x.a));
      block.slice(0, 5).forEach(it => qs.push({ sec: 'reading', part: 4, type: 'pool', block: 'e2r4' + b, text: it.q, pool, answer: it.a }));
    }
    flushSeen();
    return qs;
  }

  /* Экзамен HSK 3: 听力 40 + 阅读 30 + 书写 10 */
  function buildExam3() {
    const B = window.HSK3EXAM;
    const av = new Set(window.PICS_AVAILABLE || []);
    const pics = shuffle(availPics());
    const dlgPool = pick(B.DLG.filter(x => av.has(x.pic)), 10, 'e3:DLG');
    if (dlgPool.length < 10) throw new Error('Мало картинок для экзамена HSK 3');
    const qs = [];
    /* 听力 ч.1 (10 = 2 блока по 5): диалог → картинка из пула 6 */
    for (let b = 0; b < 2; b++) {
      const block = dlgPool.slice(b * 5, b * 5 + 5);
      const extra = shuffle(pics.filter(p => !block.some(x => x.pic === p.id)))[0];
      const pool = shuffle([...block.map(x => x.pic), extra.id]);
      for (const it of block) qs.push({ sec: 'listening', part: 1, type: 'poolpic', block: 'e3l1' + b, say: [it.a, it.b], pool, answer: it.pic });
    }
    /* 听力 ч.2 (10): высказывание на слух + суждение ★ (5 верных + 5 неверных) */
    const tfl = [...pick(B.TFL.filter(x => x.truth), 5, 'e3:TFLy'), ...pick(B.TFL.filter(x => !x.truth), 5, 'e3:TFLn')];
    for (const it of shuffle(tfl)) qs.push({ sec: 'listening', part: 2, type: 'tf', say: it.say, star: it.star, correct: it.truth ? 0 : 1 });
    /* 听力 ч.3 (10) и ч.4 (10): диалоги с вопросом */
    for (const it of pick(B.Q3, 10, 'e3:Q3')) { const o = shuffle([0, 1, 2]); qs.push({ sec: 'listening', part: 3, type: 'opts', say: it.say, opts: o.map(i => it.opts[i]), correct: o.indexOf(0) }); }
    for (const it of pick(B.Q4, 10, 'e3:Q4')) { const o = shuffle([0, 1, 2]); qs.push({ sec: 'listening', part: 4, type: 'opts', say: it.say, opts: o.map(i => it.opts[i]), correct: o.indexOf(0) }); }
    /* 阅读 ч.1 (10 = 2 блока по 5): реплика ↔ ответ */
    const pairs = pick(B.PAIR, 12, 'e3:PAIR', x => x.a);
    for (let b = 0; b < 2; b++) {
      const block = pairs.slice(b * 6, b * 6 + 6);
      const pool = shuffle(block.map(x => x.a));
      block.slice(0, 5).forEach(it => qs.push({ sec: 'reading', part: 1, type: 'pool', block: 'e3r1' + b, text: it.q, pool, answer: it.a }));
    }
    /* 阅读 ч.2 (10 = 2 блока по 5): пропуски */
    const fills = pick(B.FILL, 12, 'e3:FILL', x => x.ans);
    for (let b = 0; b < 2; b++) {
      const block = fills.slice(b * 6, b * 6 + 6);
      const pool = shuffle(block.map(x => x.ans));
      block.slice(0, 5).forEach(it => qs.push({ sec: 'reading', part: 2, type: 'pool', block: 'e3r2' + b, text: it.t, pool, answer: it.ans }));
    }
    /* 阅读 ч.3 (10): текст + вопрос */
    for (const it of pick(B.READ, 10, 'e3:READ')) { const o = shuffle([0, 1, 2]); qs.push({ sec: 'reading', part: 3, type: 'opts', text: it.t, sub: it.q, opts: o.map(i => it.opts[i]), correct: o.indexOf(0) }); }
    /* 书写 ч.1 (5): собрать предложение; ч.2 (5): написать иероглиф */
    for (const it of pick(B.ARRANGE, 5, 'e3:ARRANGE')) qs.push({ sec: 'writing', part: 1, type: 'arrange', chunks: shuffle(it.chunks), answers: it.a });
    for (const it of pick(B.WRITE, 5, 'e3:WRITE')) qs.push({ sec: 'writing', part: 2, type: 'input', text: it.t, py: it.py, answer: it.ans });
    flushSeen();
    return qs;
  }

  const SPEC1 = {
    level: 1, max: 200, pass: 120, readingSec: 17 * 60, answerSec: 12,
    sections: { listening: { zh: '听力', ru: 'Аудирование', total: 20 }, reading: { zh: '阅读', ru: 'Чтение', total: 20 } },
    partRules: {
      'listening-1': 'Вы услышите слово. Верна ли картинка? Аудио прозвучит два раза.',
      'listening-2': 'Вы услышите предложение. Выберите картинку, которая ему соответствует.',
      'listening-3': 'Вы услышите диалог. Выберите подходящую картинку.',
      'listening-4': 'Вы услышите вопрос. Выберите правильный ответ.',
      'reading-1': 'Соответствует ли слово картинке? Выберите 对 (верно) или 错 (неверно).',
      'reading-2': 'Прочитайте предложение и выберите картинку.',
      'reading-3': 'Слева — вопросы, ниже — ответы A–F, один лишний.' + ' Все вопросы части — на одном экране: выберите строку, затем букву; менять можно до кнопки «Готово».',
      'reading-4': 'В предложениях пропущено слово — подберите его из списка A–F, один лишний.' + ' Все вопросы части — на одном экране: выберите строку, затем букву; менять можно до кнопки «Готово».',
    },
  };
  /* Подсчёт: каждая секция из 100 */
  function score(questions, spec) {
    const out = { sections: {}, score: 0 };
    for (const sec of Object.keys((spec || SPEC1).sections)) {
      const qs = questions.filter(q => q.sec === sec);
      const correct = qs.filter(q => q.ok).length;
      const pts = qs.length ? Math.round(correct / qs.length * 100) : 0;
      out.sections[sec] = { correct, total: qs.length, points: pts };
      out.score += pts;
    }
    out.passed = out.score >= (spec || SPEC1).pass;
    return out;
  }
  const SPEC2 = {
    level: 2, max: 200, pass: 120, readingSec: 22 * 60, answerSec: 12,
    sections: { listening: { zh: '听力', ru: 'Аудирование', total: 35 }, reading: { zh: '阅读', ru: 'Чтение', total: 25 } },
    partRules: {
      'listening-1': 'Вы услышите предложение. Верна ли картинка? Аудио прозвучит два раза.',
      'listening-2': 'Прозвучат пять диалогов по очереди, каждый два раза. К каждому диалогу подберите картинку A–F, одна лишняя.' + ' Все вопросы части — на одном экране: выберите строку, затем букву; менять можно до кнопки «Готово».',
      'listening-3': 'Вы услышите диалог и вопрос. Выберите правильный ответ.',
      'listening-4': 'Вы услышите длинный диалог и вопрос. Выберите правильный ответ.',
      'reading-1': 'К каждому предложению подберите картинку A–F, одна лишняя.' + ' Все вопросы части — на одном экране: выберите строку, затем букву; менять можно до кнопки «Готово».',
      'reading-2': 'Выберите слово, которое подходит в пропуск.',
      'reading-3': 'Прочитайте текст и суждение со звездой ★. Верно оно или нет?',
      'reading-4': 'Слева — реплики, ниже — ответы на них A–F, один лишний.' + ' Все вопросы части — на одном экране: выберите строку, затем букву; менять можно до кнопки «Готово».',
    },
  };
  const SPEC3 = {
    level: 3, max: 300, pass: 180, readingSec: 30 * 60, answerSec: 12,
    sectionSec: { reading: 30 * 60, writing: 15 * 60 },
    sections: { listening: { zh: '听力', ru: 'Аудирование', total: 40 }, reading: { zh: '阅读', ru: 'Чтение', total: 30 }, writing: { zh: '书写', ru: 'Письмо', total: 10 } },
    partRules: {
      'listening-1': 'Прозвучат пять диалогов по очереди, каждый два раза. К каждому диалогу подберите картинку A–F, одна лишняя.' + ' Все вопросы части — на одном экране: выберите строку, затем букву; менять можно до кнопки «Готово».',
      'listening-2': 'Вы услышите высказывание. Верно ли суждение со звездой ★?',
      'listening-3': 'Вы услышите диалог и вопрос. Выберите правильный ответ.',
      'listening-4': 'Вы услышите длинный диалог и вопрос. Выберите правильный ответ.',
      'reading-1': 'Слева — реплики, ниже — ответы на них A–F, один лишний.' + ' Все вопросы части — на одном экране: выберите строку, затем букву; менять можно до кнопки «Готово».',
      'reading-2': 'В предложениях пропущено слово — подберите его из списка A–F, один лишний.' + ' Все вопросы части — на одном экране: выберите строку, затем букву; менять можно до кнопки «Готово».',
      'reading-3': 'Прочитайте текст и ответьте на вопрос — три варианта.',
      'writing-1': 'Составьте предложение из данных слов — нажимайте их в правильном порядке.',
      'writing-2': 'Впишите иероглиф по пиньиню (нужна китайская клавиатура 中文).',
    },
  };
  /* Экзамен HSK 4: 听力 45 + 阅读 40 + 书写 15, четыре варианта в выборе */
  function buildExam4() {
    const B = window.HSK4EXAM;
    const qs = [];
    /* 听力 ч.1 (10): высказывание + суждение ★ */
    const tfl = [...pick(B.TFL.filter(x => x.truth), 5, 'e4:TFLy'), ...pick(B.TFL.filter(x => !x.truth), 5, 'e4:TFLn')];
    for (const it of shuffle(tfl)) qs.push({ sec: 'listening', part: 1, type: 'tf', say: it.say, star: it.star, correct: it.truth ? 0 : 1 });
    /* 听力 ч.2 (15) и ч.3 (20): диалоги с вопросом */
    for (const it of pick(B.Q2, 15, 'e4:Q2')) { const o = shuffle([0, 1, 2, 3]); qs.push({ sec: 'listening', part: 2, type: 'opts', say: it.say, opts: o.map(i => it.opts[i]), correct: o.indexOf(0) }); }
    for (const it of pick(B.Q3, 20, 'e4:Q3')) { const o = shuffle([0, 1, 2, 3]); qs.push({ sec: 'listening', part: 3, type: 'opts', say: it.say, opts: o.map(i => it.opts[i]), correct: o.indexOf(0) }); }
    /* 阅读 ч.1 (10 = 2 блока по 5): пропуск ↔ слово из пула 6 */
    const fills = pick(B.FILL, 12, 'e4:FILL', x => x.ans);
    for (let b = 0; b < 2; b++) {
      const block = fills.slice(b * 6, b * 6 + 6);
      const pool = shuffle(block.map(x => x.ans));
      block.slice(0, 5).forEach(it => qs.push({ sec: 'reading', part: 1, type: 'pool', block: 'e4r1' + b, text: it.t, pool, answer: it.ans }));
    }
    /* 阅读 ч.2 (10): расставить три предложения по порядку */
    for (const it of pick(B.ORDER, 10, 'e4:ORDER')) qs.push({ sec: 'reading', part: 2, type: 'arrange', chunks: shuffle(it.parts.slice()), answers: [it.parts.join('')] });
    /* 阅读 ч.3 (20): текст + вопрос */
    for (const it of pick(B.READ, 20, 'e4:READ')) { const o = shuffle([0, 1, 2, 3]); qs.push({ sec: 'reading', part: 3, type: 'opts', text: it.t, sub: it.q, opts: o.map(i => it.opts[i]), correct: o.indexOf(0) }); }
    /* 书写 ч.1 (10): собрать предложение; ч.2 (5): вписать иероглиф */
    for (const it of pick(B.ARRANGE, 10, 'e4:ARRANGE')) qs.push({ sec: 'writing', part: 1, type: 'arrange', chunks: shuffle(it.chunks.slice()), answers: it.a });
    for (const it of pick(B.WRITE, 5, 'e4:WRITE')) qs.push({ sec: 'writing', part: 2, type: 'input', text: it.t, py: it.py, answer: it.ans });
    flushSeen();
    return qs;
  }
  const SPEC4 = {
    level: 4, max: 300, pass: 180, readingSec: 40 * 60, answerSec: 15,
    sectionSec: { reading: 40 * 60, writing: 25 * 60 },
    sections: { listening: { zh: '听力', ru: 'Аудирование', total: 45 }, reading: { zh: '阅读', ru: 'Чтение', total: 40 }, writing: { zh: '书写', ru: 'Письмо', total: 15 } },
    partRules: {
      'listening-1': 'Вы услышите высказывание. Верно ли суждение со звездой ★?',
      'listening-2': 'Вы услышите короткий диалог и вопрос. Выберите правильный ответ из четырёх.',
      'listening-3': 'Вы услышите длинный диалог и вопрос. Выберите правильный ответ из четырёх.',
      'reading-1': 'В предложениях пропущено слово — подберите его из списка A–F, один лишний.' + ' Все вопросы части — на одном экране: выберите строку, затем букву; менять можно до кнопки «Готово».',
      'reading-2': 'Три предложения перепутаны — расставьте их по порядку, нажимая по очереди.',
      'reading-3': 'Прочитайте текст и ответьте на вопрос — четыре варианта.',
      'writing-1': 'Составьте предложение из данных слов — нажимайте их в правильном порядке.',
      'writing-2': 'Впишите иероглиф по пиньиню (нужна китайская клавиатура 中文).',
    },
  };
  const SPECS = { 1: SPEC1, 2: SPEC2, 3: SPEC3, 4: SPEC4 };
  const BUILDERS = { 1: buildExam1, 2: buildExam2, 3: buildExam3, 4: buildExam4 };
  return { buildExam1, buildExam2, buildExam3, buildExam4, SPEC1, SPEC2, SPEC3, SPEC4, SPECS, BUILDERS, score, availPics, picById, shuffle };
})();
