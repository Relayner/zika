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

  /* Экзамен HSK 1: 听力 4×5 + 阅读 4×5. Вопросы без мгновенной проверки — разбор в конце, как на настоящем. */
  function buildExam1() {
    const B = window.HSK1EXAM;
    const pics = shuffle(availPics());
    if (pics.length < 16) throw new Error('Мало картинок для экзамена');
    const avail = new Set(pics.map(p => p.id));
    const sentPool = shuffle(B.SENT.filter(s => avail.has(s.pic)));
    const dlgPool = shuffle(B.DLG.filter(d => avail.has(d.pic)));
    let picCursor = 0;
    const takePics = n => pics.slice(picCursor, picCursor += n);
    const qs = [];
    /* Слушание ч.1: слово + картинка → 对/错 */
    for (const p of takePics(5)) {
      const truth = Math.random() < 0.5;
      const other = pics[picCursor + rnd(pics.length - picCursor - 1)] || pics[0];
      qs.push({ sec: 'listening', part: 1, type: 'tf', say: truth ? p.h : other.h, pic: p.id, correct: truth ? 0 : 1 });
    }
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
    for (const it of shuffle(B.QA4).slice(0, 5)) {
      const order = shuffle([0, 1, 2]);
      qs.push({ sec: 'listening', part: 4, type: 'opts', say: it.say, opts: order.map(i => it.opts[i]), correct: order.indexOf(0) });
    }
    /* Чтение ч.1: картинка + слово → 对/错 */
    for (const p of takePics(5)) {
      const truth = Math.random() < 0.5;
      const other = pics[rnd(picCursor - 5)] || pics[0];
      const w = truth ? p : (other.id === p.id ? pics[(pics.indexOf(p) + 1) % pics.length] : other);
      qs.push({ sec: 'reading', part: 1, type: 'tf', text: w.h, textPy: w.py, pic: p.id, correct: truth ? 0 : 1 });
    }
    /* Чтение ч.2: предложение (текстом) → картинка */
    const r2 = sentPool.slice(5, 10);
    for (const it of r2) {
      const wrong = shuffle(pics.filter(p => p.id !== it.pic)).slice(0, 2);
      const opts = shuffle([it.pic, ...wrong.map(w => w.id)]);
      qs.push({ sec: 'reading', part: 2, type: 'pickpic', text: it.say, pics: opts, correct: opts.indexOf(it.pic) });
    }
    /* Чтение ч.3: вопрос ↔ ответ, общий пул из 6 */
    const qa = shuffle(B.QA3).slice(0, 6);
    const pool3 = shuffle(qa.map(x => x.a));
    qa.slice(0, 5).forEach(it => qs.push({ sec: 'reading', part: 3, type: 'pool', text: it.q, pool: pool3, answer: it.a }));
    /* Чтение ч.4: пропуск ↔ слово, общий пул из 6 */
    const fills = shuffle(B.FILL).slice(0, 6);
    const pool4 = shuffle(fills.map(x => x.ans));
    fills.slice(0, 5).forEach(it => qs.push({ sec: 'reading', part: 4, type: 'pool', text: it.t, pool: pool4, answer: it.ans }));
    return qs;
  }

  /* Экзамен HSK 2: 听力 35 (4 части) + 阅读 25 (4 части) */
  function buildExam2() {
    const B = window.HSK2EXAM;
    const av = new Set((window.PICS_AVAILABLE || []));
    const pics = shuffle(availPics());
    const sentPool = shuffle(B.SENT.filter(x => av.has(x.pic)));
    const dlgPool = shuffle(B.DLG.filter(x => av.has(x.pic)));
    if (sentPool.length < 15 || dlgPool.length < 10) throw new Error('Мало картинок для экзамена HSK 2');
    const qs = [];
    /* 听力 ч.1 (10): предложение + картинка → 对/错 */
    for (const it of sentPool.slice(0, 10)) {
      const truth = Math.random() < 0.5;
      const other = sentPool[10 + rnd(Math.max(1, sentPool.length - 10))] || sentPool[0];
      qs.push({ sec: 'listening', part: 1, type: 'tf', say: truth ? it.say : other.say, pic: it.pic, correct: truth ? 0 : 1 });
    }
    /* 听力 ч.2 (10 = 2 блока по 5): диалог → картинка из пула 6 */
    for (let b = 0; b < 2; b++) {
      const block = dlgPool.slice(b * 5, b * 5 + 5);
      const extra = shuffle(pics.filter(p => !block.some(x => x.pic === p.id)))[0];
      const pool = shuffle([...block.map(x => x.pic), extra.id]);
      for (const it of block) qs.push({ sec: 'listening', part: 2, type: 'poolpic', say: [it.a, it.b], pool, answer: it.pic });
    }
    /* 听力 ч.3 (10): диалог + вопрос → 3 варианта */
    for (const it of shuffle(B.Q3).slice(0, 10)) {
      const order = shuffle([0, 1, 2]);
      qs.push({ sec: 'listening', part: 3, type: 'opts', say: it.say, opts: order.map(i => it.opts[i]), correct: order.indexOf(0) });
    }
    /* 听力 ч.4 (5): длинный диалог + вопрос */
    for (const it of shuffle(B.Q4).slice(0, 5)) {
      const order = shuffle([0, 1, 2]);
      qs.push({ sec: 'listening', part: 4, type: 'opts', say: it.say, opts: order.map(i => it.opts[i]), correct: order.indexOf(0) });
    }
    /* 阅读 ч.1 (5): предложение (текст) → картинка из пула 6 */
    const r1 = sentPool.slice(10, 15);
    {
      const extra = shuffle(pics.filter(p => !r1.some(x => x.pic === p.id)))[0];
      const pool = shuffle([...r1.map(x => x.pic), extra.id]);
      for (const it of r1) qs.push({ sec: 'reading', part: 1, type: 'poolpic', text: it.say, pool, answer: it.pic });
    }
    /* 阅读 ч.2 (5): пропуск ↔ слово из пула 6 */
    const fills = shuffle(B.FILL).slice(0, 6);
    const pool2 = shuffle(fills.map(x => x.ans));
    fills.slice(0, 5).forEach(it => qs.push({ sec: 'reading', part: 2, type: 'pool', text: it.t, pool: pool2, answer: it.ans }));
    /* 阅读 ч.3 (5): текст + суждение ★ → 对/错 */
    for (const it of shuffle(B.TF).slice(0, 5)) qs.push({ sec: 'reading', part: 3, type: 'tf', text: it.text, star: it.star, correct: it.truth ? 0 : 1 });
    /* 阅读 ч.4 (10 = 2 блока по 5): реплика ↔ ответ из пула 6 */
    const pairs = shuffle(B.PAIR);
    for (let b = 0; b < 2; b++) {
      const block = pairs.slice(b * 6, b * 6 + 6);
      const pool = shuffle(block.map(x => x.a));
      block.slice(0, 5).forEach(it => qs.push({ sec: 'reading', part: 4, type: 'pool', text: it.q, pool, answer: it.a }));
    }
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
      'reading-3': 'Подберите ответ к вопросу из общего списка.',
      'reading-4': 'Выберите слово, которое подходит в пропуск.',
    },
  };
  /* Подсчёт: каждая секция из 100, итог из 200 */
  function score(questions) {
    const out = { sections: {}, score: 0 };
    for (const sec of ['listening', 'reading']) {
      const qs = questions.filter(q => q.sec === sec);
      const correct = qs.filter(q => q.ok).length;
      const pts = qs.length ? Math.round(correct / qs.length * 100) : 0;
      out.sections[sec] = { correct, total: qs.length, points: pts };
      out.score += pts;
    }
    out.passed = out.score >= SPEC1.pass;
    return out;
  }
  const SPEC2 = {
    level: 2, max: 200, pass: 120, readingSec: 22 * 60, answerSec: 12,
    sections: { listening: { zh: '听力', ru: 'Аудирование', total: 35 }, reading: { zh: '阅读', ru: 'Чтение', total: 25 } },
    partRules: {
      'listening-1': 'Вы услышите предложение. Верна ли картинка? Аудио прозвучит два раза.',
      'listening-2': 'Вы услышите диалог. Выберите картинку из общего набора — каждая используется один раз.',
      'listening-3': 'Вы услышите диалог и вопрос. Выберите правильный ответ.',
      'listening-4': 'Вы услышите длинный диалог и вопрос. Выберите правильный ответ.',
      'reading-1': 'Прочитайте предложение и выберите картинку из общего набора.',
      'reading-2': 'Выберите слово, которое подходит в пропуск.',
      'reading-3': 'Прочитайте текст и суждение со звездой ★. Верно оно или нет?',
      'reading-4': 'Подберите ответ к реплике из общего списка.',
    },
  };
  const SPECS = { 1: SPEC1, 2: SPEC2 };
  const BUILDERS = { 1: buildExam1, 2: buildExam2 };
  return { buildExam1, buildExam2, SPEC1, SPEC2, SPECS, BUILDERS, score, availPics, picById, shuffle };
})();
