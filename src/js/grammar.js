/* Грамматика как проверяемый узел: движок заданий на конструкцию блока программы.
   Всё — чистые функции от задания и ответа: ничего не мутирует, порядок вызовов не важен.
   Банки заданий пишут отдельные файлы (gram-b1.js …) в window.GRAM_BANKS; здесь только движок,
   каталог грамматических ловушек и демонстрационный набор — он же запасной банк, если банков нет. */
window.GRAMMAR = (() => {
  const FORMATS = ['choice', 'fix', 'fill', 'order'];
  const DIFFS = ['easy', 'mid', 'hard'];
  const LADDER = { choice: 0, fix: 1, fill: 2, order: 3 };   /* лестница по нарастанию усилия */
  const DIFF_RANK = { easy: 0, mid: 1, hard: 2 };
  /* банки пишут сложность и словом, и числом 1–3 — движок понимает обе записи */
  const DIFF_ALIAS = { 1: 'easy', 2: 'mid', 3: 'hard', easy: 'easy', mid: 'mid', hard: 'hard', medium: 'mid' };
  const CJK = /[一-鿿]/;
  const LATIN = /[A-Za-z]/;
  /* при сверке ответа пробелы и пунктуация обеих систем не считаются */
  const DROP = /[\s_·，。？！、；：（）《》「」“”‘’…—,.?!;:()[\]{}<>'"-]/g;
  const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;                 /* метка-описание: «ne-for-ma» */
  const TRAP_NS = /^[a-z]+:[^\s]{1,24}$/;                   /* метка из каталога TRAPS: «gram:ma-ne», «mw:本» */
  const trapShape = v => str(v) && (KEBAB.test(v) || TRAP_NS.test(v));

  const str = v => typeof v === 'string';
  const norm = v => String(v == null ? '' : v).replace(DROP, '').toLowerCase();
  const list = v => (Array.isArray(v) ? v : [v]).filter(x => x !== undefined && x !== null && x !== '');
  const diffOf = v => DIFF_ALIAS[typeof v === 'number' ? v : String(v == null ? '' : v).toLowerCase()] || null;
  /* fix бывает двух видов: ткнуть в лишнее слово (есть tokens) или переписать фразу целиком */
  const fixFree = item => item && item.format === 'fix' && !Array.isArray(item.tokens);

  /* ── каталог грамматических ловушек ────────────────────────────────────────
     Метка ловушки — это kebab-имя из атомов: «ne-for-ma», «de-misplaced», «mw-ben».
     Каталог не запрещает новые метки, а объясняет по-русски те, что разбираются;
     trapAudit() показывает банкам, какие метки движок пока объяснить не может. */
  const ATOM = {
    ma: '吗', ne: '呢', de: '的', le: '了', ba: '吧', bu: '不', mei: '没', meiyou: '没有',
    shi: '是', you: '有', zai: '在', hen: '很', tai: '太', dou: '都', ye: '也', jiu: '就',
    cai: '才', hai: '还', xiang: '想', yao: '要', xihuan: '喜欢', hui: '会', neng: '能',
    ji: '几', duoshao: '多少', shenme: '什么', shui: '谁', shei: '谁', na: '哪 / 那', nar: '哪儿',
    zenme: '怎么', zenmeyang: '怎么样', ge: '个', ben: '本', kuai: '块', sui: '岁', xie: '些',
    zhe: '这 / 着', nei: '那', li: '里 / 离', shang: '上', xia: '下', qian: '前', hou: '后',
    qu: '去', lai: '来', zuo: '坐 / 做', zuoshi: '做', zhu: '住', mai: '买', kan: '看',
    buguan: '不管', suiran: '虽然', jishi: '即使', jiran: '既然', yinwei: '因为', yinci: '因此',
    suoyi: '所以', youyu: '由于', danshi: '但是', buguo: '不过', raner: '然而', yushi: '于是',
    feichang: '非常', xiexie: '谢谢', zaijian: '再见', wei: '喂', zuotian: '昨天', mingtian: '明天',
    qw: 'вопросительное слово', mw: 'счётное слово', verb: 'глагол', adj: 'прилагательное',
    time: 'обстоятельство времени', noun: 'существительное', transport: 'транспорт',
    tail: 'хвост фразы', mid: 'середина фразы', sentence: 'фраза', desire: 'желание',
    number: 'число', word: 'слово', order: 'порядок слов', collocation: 'сочетаемость',
    bare: 'без предлога', random: 'лишнее слово',
    'time-noun': 'существительное времени', 'mid-sentence': 'середина фразы',
    'bu-desire': '不 при желании', 'word-order': 'порядок слов',
    /* служебные слова из меток банков 2–4 уровня */
    bi: '比', cong: '从', wang: '往', dao: '到', zui: '最', yijing: '已经', bie: '别',
    zhengzai: '正在', keneng: '可能', keyi: '可以', liang: '两', er: '二', yi: '一',
    yixia: '一下', yidianr: '一点儿', youdianr: '有点儿', jin: '近', chang: '长 / 常', gao: '高',
    bukeqi: '不客气', meiguanxi: '没关系', duibuqi: '对不起', xiexie2: '谢谢',
    jieshao: '介绍', weishenme: '为什么', mingzi: '名字', ming: '名', xing: '姓',
    renshi: '认识', zhidao: '知道', gaosu: '告诉', zhen: '真', yisi: '意思',
    yuan: '元', jian: '件', dian: '点', ci: '次', pang: '旁', bian: '边', he: '和 / 喝',
    ta: '他 / 她 / 它', ninmen: '你们 (вежливое 您)', hai: '还', haimei: '还没',
    /* признаки, а не слова */
    not: 'отсутствие нужного слова', first: 'первое место во фразе', reason: 'причина',
    origin: 'точка отсчёта', needs: 'обязательная пара', copy: 'повтор слова',
    degree: 'степень', future: 'будущее время', now: 'настоящий момент',
    progressive: 'длящееся действие', incomplete: 'незавершённость', distance: 'расстояние',
    clock: 'время на часах', date: 'дата', month: 'месяц', ordinal: 'порядковое число',
    quantity: 'количество', books: 'книги', clothes: 'одежда', liquid: 'жидкость',
    locative: 'место', singular: 'единственное число', plural: 'множественное число',
    inanimate: 'неодушевлённое', elder: 'старший', younger: 'младший',
    sister: 'сестра', brother: 'брат', pair: 'пара', alone: 'слово в одиночку',
    doubled: 'удвоение', double: 'удвоение', twice: 'двойной счёт', only: 'ограничение',
    modal: 'модальный глагол', liangci: 'счётное слово', message: 'сообщение',
    nonexistent: 'несуществующее слово', why: 'вопрос «почему»',
    /* связки и обороты книжной речи (уровни 3–4) */
    tongguo: '通过', anzhao: '按照', genju: '根据', wulun: '无论', laishuo: '来说',
    buru: '不如', bujin: '不仅', budan: '不但', erqie: '而且', fouze: '否则',
    suizhe: '随着', chufei: '除非', chule: '除了', yuqi: '与其', duiyu: '对于',
    dui: '对', gen: '跟', gei: '给', keshi: '可是', gangcai: '刚才',
    weile: '为了', tuichi: '推迟', jieshu: '结束', shuo: '说', shuolai: '说来',
    shiji: '实际', shijian: '时间', nianling: 'возраст 年龄', buyong: '不用',
    nage: '那个', zhege: '这个', yige: '一个', liangdian: '两点',
    duiwoshuo: '对我说', bunengkaishi: 'начало с 不能',
  };
  /* правила чтения метки: сначала длинные шаблоны */
  const TRAP_RULES = [
    [/^(.+)-instead-of-(.+)$/, (a, b) => `${a} вместо: ${b}`],
    [/^(.+)-for-(.+)$/, (a, b) => `${a} вместо: ${b}`],
    [/^(.+)-vs-(.+)$/, (a, b) => `путают: ${a} и ${b}`],
    [/^(.+)-before-(.+)$/, (a, b) => `${a} встал перед ${b}`],
    [/^(.+)-after-(.+)$/, (a, b) => `${a} встал после ${b}`],
    [/^(.+)-with-(.+)$/, (a, b) => `${a} приставили к ${b}`],
    [/^(.+)-as-(.+)$/, (a, b) => `${a} принят за ${b}`],
    [/^(.+)-in-(.+)$/, (a, b) => `${a} в паре: ${b}`],
    [/^mw-(.+)$/, a => `счётное слово ${a} взято не к тому существительному`],
    [/^(.+)-misplaced$/, a => `${a} стоит не на своём месте`],
    [/^(.+)-random$/, a => `${a} здесь вообще не нужен`],
    [/^(.+)-word-order$/, a => `${a} нарушает порядок слов`],
    [/^bare-(.+)$/, a => `${a} без нужного служебного слова`],
    [/^(.+)-collocation$/, a => `${a} не сочетается с этим словом`],
    [/^(.+)$/, a => a],                                    /* последний шанс: просто перечислить атомы */
  ];
  /* «verb-copy» → «глагол · повтор слова»: часть метки может быть цепочкой атомов */
  const named = p => (ATOM[p] || (p.indexOf('-') > 0 && p.split('-').every(a => ATOM[a])
    ? p.split('-').map(a => ATOM[a]).join(' · ') : null));
  /* Разбор метки ловушки: { id, ru, rule? } или null, если объяснить нечем.
     Метка из каталога TRAPS («gram:ma-ne») читается оттуда, kebab-метка — по атомам. */
  function trapInfo(label) {
    if (!trapShape(label)) return null;
    if (TRAP_NS.test(label)) {
      const e = (window.TRAPS && typeof TRAPS.byId === 'function') ? TRAPS.byId(label) : null;
      return e ? { id: label, ru: e.ru || label, rule: e.rule || '' } : null;
    }
    if (!KEBAB.test(label)) return null;
    for (const [re, make] of TRAP_RULES) {
      const m = label.match(re);
      if (!m) continue;
      const parts = m.slice(1).map(named);
      if (parts.some(p => !p)) continue;
      return { id: label, ru: make.apply(null, parts) };
    }
    return null;
  }
  /* Метки, которые движок не смог объяснить — подсказка авторам банков, не запрет */
  const trapAudit = items => {
    const out = [];
    for (const it of (items || all())) {
      for (const o of (Array.isArray(it && it.options) ? it.options : [])) {
        if (o && str(o.trap) && !trapInfo(o.trap) && out.indexOf(o.trap) < 0) out.push(o.trap);
      }
    }
    return out.sort();
  };

  /* ── демонстрационный набор: все четыре формата × три сложности, оба вида fix ── */
  const DEMO = [
    { id: 'b1-01.g.01', blockId: 'b1-01', lvl: 1, format: 'choice', diff: 'easy',
      stem: '你是学生___？', key: '吗',
      options: [{ text: '吗' }, { text: '呢', trap: 'ne-for-ma' }, { text: '的', trap: 'de-random' }, { text: '很', trap: 'hen-random' }],
      why: 'Утверждение становится вопросом от частицы 吗 в самом конце; порядок слов не меняется.',
      l1: 'У нас вопрос делает интонация и перестановка («ты студент?»). Здесь перестановки нет — работу берёт на себя отдельное слово в хвосте.',
      tts: '你是学生吗？' },
    { id: 'b1-01.g.02', blockId: 'b1-01', lvl: 1, format: 'fill', diff: 'easy',
      stem: '你们都好___？', key: ['吗'],
      why: '吗 ставится после всего предложения, а не рядом с тем словом, о котором спрашивают.',
      l1: 'Русское «а вы как?» разрешает вопрос в середине. Здесь частица всегда последняя.',
      tts: '你们都好吗？' },
    { id: 'b1-01.g.03', blockId: 'b1-01', lvl: 1, format: 'fix', diff: 'easy',
      stem: '吗你好？', tokens: ['吗', '你', '好'], key: 0,
      why: '吗 живёт только в самом конце вопроса; в начале фразы для неё места нет.',
      l1: 'Русское «ли» тоже не ставят первым словом, но соблазн начать с вопросительной частицы велик.',
      tts: '你好吗？' },
    { id: 'b1-01.g.04', blockId: 'b1-01', lvl: 1, format: 'fill', diff: 'mid',
      stem: '我很好，你___？', key: ['呢'],
      why: '呢 подхватывает уже заданный вопрос: «а ты?» — повторять всю фразу не нужно.',
      l1: 'По-русски достаточно «а ты?», и здесь работает та же короткая форма, но держится она на 呢, а не на интонации.',
      tts: '我很好，你呢？' },
    { id: 'b1-02.g.02', blockId: 'b1-02', lvl: 1, format: 'order', diff: 'easy',
      stem: 'Соберите фразу: «Он мой друг».',
      tokens: ['他', '是', '我', '朋友'],
      key: ['他是我朋友。'],
      why: '是 стоит между двумя существительными и не опускается.',
      l1: 'В русском «он мой друг» связки нет вовсе, поэтому 是 чаще всего просто теряют.',
      tts: '他是我朋友。' },
    { id: 'b1-02.g.03', blockId: 'b1-02', lvl: 1, format: 'fix', diff: 'easy',
      stem: '他很是老师。', tokens: ['他', '很', '是', '老师'], key: 1,
      why: '很 усиливает прилагательное, а не связку: перед 是 ему места нет.',
      l1: 'Русское «он очень учитель» тоже звучит дико — ошибка приходит из привычки усиливать всё подряд.',
      tts: '他是老师。' },
    { id: 'b1-03.g.03', blockId: 'b1-03', lvl: 1, format: 'fill', diff: 'mid',
      stem: '我有三___书。', key: ['本'],
      why: 'Между числом и существительным обязательно счётное слово; книги считают на 本.',
      l1: 'В русском «три книги» обходится без счётного слова, поэтому его забывают чаще всего.',
      tts: '我有三本书。' },
    { id: 'b1-04.g.01', blockId: 'b1-04', lvl: 1, format: 'order', diff: 'mid',
      stem: 'Соберите фразу: «Я завтра иду в школу».',
      tokens: ['我', '明天', '去', '学校'],
      key: ['我明天去学校。', '明天我去学校。'],
      why: 'Обстоятельство времени стоит перед глаголом: до подлежащего или сразу после него.',
      l1: 'По-русски «я иду завтра» — нормальный порядок. Здесь время после глагола не ставят никогда.',
      tts: '我明天去学校。' },
    { id: 'b1-04.g.02', blockId: 'b1-04', lvl: 1, format: 'fix', diff: 'mid',
      stem: '我去明天。', tokens: ['我', '去', '明天'], key: 2,
      why: 'Время не может стоять после глагола — 明天 уходит вперёд, к 我.',
      l1: 'Калька с русского «я пойду завтра» — самая частая ошибка на этом месте.',
      tts: '我明天去。' },
    { id: 'b1-05.g.01', blockId: 'b1-05', lvl: 1, format: 'fill', diff: 'easy',
      stem: '«Я хочу выпить чаю»: 我___喝茶。', key: ['想'],
      why: 'Желание стоит перед глаголом: 我想喝茶. После 喝 слово желания не ставят, и без него фраза просто сообщает о питье.',
      l1: 'В русском «хочу» требует инфинитива («хочу выпить»), здесь второй глагол идёт в обычной форме.',
      tts: '我想喝茶。' },
    { id: 'b1-05.g.02', blockId: 'b1-05', lvl: 1, format: 'fix', diff: 'hard',
      stem: '我没想吃菜。', tokens: ['我', '没', '想', '吃', '菜'], key: 1,
      why: 'Желание отрицается через 不想: 没 отрицает случившееся действие, а не намерение.',
      l1: 'Русское «не» одно на все случаи, поэтому выбор между 不 и 没 приходится делать заново.',
      tts: '我不想吃菜。' },
    { id: 'b1-05.g.03', blockId: 'b1-05', lvl: 1, format: 'choice', diff: 'mid',
      stem: '他___想吃饭。', key: '不',
      options: [{ text: '不' }, { text: '没', trap: 'mei-for-bu' }, { text: '的', trap: 'de-random' }, { text: '吗', trap: 'ma-misplaced' }],
      why: 'Намерение отрицается через 不想. 没 отрицает то, что не случилось, а 的 и 吗 в середину фразы не ставят.',
      l1: 'Русское «не хочет» переводится одним словом, поэтому выбор между 不 и 没 приходится делать заново.',
      tts: '他不想吃饭。' },
    { id: 'b1-05.g.04', blockId: 'b1-05', lvl: 1, format: 'order', diff: 'hard',
      stem: 'Соберите фразу: «Я не хочу пить чай».',
      tokens: ['我', '不', '想', '喝', '茶'],
      key: ['我不想喝茶。'],
      why: '不 отрицает именно 想, поэтому встаёт перед ним, а не перед 喝.',
      l1: 'По-русски «не» цепляется к «хочу» так же, но соблазн сказать «хочу не пить» здесь даёт другую фразу.',
      tts: '我不想喝茶。' },
    { id: 'b1-06.g.01', blockId: 'b1-06', lvl: 1, format: 'choice', diff: 'hard',
      stem: '桌子上___一本书。', key: '有',
      options: [{ text: '有' }, { text: '在', trap: 'zai-for-you' }, { text: '很', trap: 'hen-random' }, { text: '都', trap: 'dou-random' }],
      why: 'Наличие предмета в месте — 有: «место 有 предмет». 在 строит обратное: «предмет 在 место».',
      l1: 'Русское «на столе книга» не различает эти два случая, поэтому 有 и 在 путают постоянно.',
      tts: '桌子上有一本书。' },
    { id: 'b1-09.g.01', blockId: 'b1-09', lvl: 1, format: 'fill', diff: 'hard',
      stem: '我昨天___去学校，我在家。', key: ['没'],
      why: 'То, что не случилось вчера, отрицают через 没: 不 говорило бы о нежелании, а не о факте.',
      l1: 'Русское «не ходил» и «не хожу» различаются формой глагола — здесь различие уходит в выбор отрицания.',
      tts: '我昨天没去学校，我在家。' },
    { id: 'b1-09.g.02', blockId: 'b1-09', lvl: 1, format: 'fix', diff: 'mid',
      stem: '我没买了电脑。', key: '我没买电脑。',
      why: 'После 没 частица 了 не нужна: отрицание уже говорит, что действия не было.',
      l1: 'Русское «не купил» несёт завершённость в самом глаголе, поэтому 了 тянет за собой по привычке.',
      tts: '我没买电脑。' },
  ];

  /* ── сбор банка: чистая функция от window.GRAM_BANKS ── */
  function collect() {
    const out = DEMO.slice();
    const seen = {};
    out.forEach(i => { seen[i.id] = 1; });
    const banks = (window.GRAM_BANKS || []);
    for (const bank of banks) {
      const part = Array.isArray(bank) ? bank
        : (bank && Array.isArray(bank.items) ? bank.items
          : (bank && bank.format ? [bank] : []));
      for (const it of part) {
        if (!it || !it.id || seen[it.id]) continue;
        seen[it.id] = 1; out.push(it);
      }
    }
    return out;
  }
  /* Банк — не хранимое значение, а пересчёт: подпись меняется, как только банки другие.
     Память здесь только ради скорости и от порядка вызовов не зависит. */
  let memoSig = null, memoItems = null;
  function sig() {
    const banks = (window.GRAM_BANKS || []);
    let s = banks.length + '';
    for (const b of banks) {
      const n = Array.isArray(b) ? b.length : (b && Array.isArray(b.items) ? b.items.length : (b && b.format ? 1 : 0));
      s += ':' + n;
    }
    return s;
  }
  function all() {
    const s = sig();
    if (s !== memoSig) { memoItems = collect(); memoSig = s; }
    return memoItems;
  }
  /* Совместимость: пересобрать банк явно. Возвращает размер. */
  function reload() { memoSig = null; return all().length; }

  const forBlock = blockId => all().filter(i => i.blockId === blockId);
  const forLevel = lvl => all().filter(i => (i.lvl || 0) === lvl);

  /* ── разбор ответов ── */
  /* жадно режем строку на известные куски (длинные вперёд) */
  function splitByTokens(s, tokens) {
    const src = norm(s);
    const toks = (tokens || []).map(t => ({ raw: t, n: norm(t) })).filter(t => t.n).sort((a, b) => b.n.length - a.n.length);
    const out = []; let i = 0;
    while (i < src.length) {
      const hit = toks.find(t => src.startsWith(t.n, i));
      if (!hit) return null;
      out.push(hit.raw); i += hit.n.length;
    }
    return out.length ? out : null;
  }
  /* допустимые порядки: строка предложения или массив кусков */
  function orderVariants(item) {
    const raw = Array.isArray(item.key) ? item.key : [item.key];
    return raw.map(v => (Array.isArray(v) ? v : (splitByTokens(v, item.tokens) || String(v == null ? '' : v))));
  }
  function givenPieces(item, given) {
    const toks = item.tokens || [];
    if (Array.isArray(given)) return given.map(g => (typeof g === 'number' ? (toks[g] == null ? '' : toks[g]) : String(g)));
    return splitByTokens(given, toks);
  }
  /* доля совпадения с лучшим из допустимых порядков; единица — только при точном совпадении */
  function orderScore(item, given) {
    const gp = givenPieces(item, given);
    const gs = gp ? norm(gp.join('')) : norm(Array.isArray(given) ? given.join('') : given);
    let best = 0;
    for (const v of orderVariants(item)) {
      const vp = Array.isArray(v) ? v : null;
      const vs = norm(vp ? vp.join('') : v);
      if (gs && gs === vs) return 1;
      if (vp && gp && gp.length === vp.length) {
        let m = 0;
        for (let i = 0; i < vp.length; i++) if (norm(gp[i]) === norm(vp[i])) m++;
        best = Math.max(best, m / vp.length);
      }
    }
    return best >= 1 ? 0.99 : best;   /* полное совпадение по позициям без совпадения строки не бывает верным */
  }
  /* индекс токена по ответу: число, «число» строкой или сам текст слова */
  function tokenIndex(item, given) {
    const toks = item.tokens || [];
    if (typeof given === 'number') return given;
    const s = String(given == null ? '' : given).trim();
    if (/^\d+$/.test(s)) return +s;
    return toks.findIndex(t => norm(t) === norm(s));
  }
  function chosen(item, given) {
    const opts = item.options || [];
    if (typeof given === 'number') return opts[given] || null;
    const text = (given && typeof given === 'object') ? given.text : given;
    return opts.find(o => o && norm(o.text) === norm(text)) || null;
  }
  function keyText(item) {
    if (item.format === 'fix' && !fixFree(item)) {
      const i = tokenIndex(item, list(item.key)[0]);
      return (item.tokens || [])[i] || '';
    }
    const k = list(item.key)[0];
    if (item.format === 'order') return Array.isArray(k) ? k.join('') : String(k == null ? '' : k);
    return String(k == null ? '' : k);
  }

  /* Судья: { ok, fraction, trap?, trapWhy?, why, correct } — чистая функция от задания и ответа */
  function check(item, given) {
    const why = (item && item.why) || '';
    const res = { ok: false, fraction: 0, why, correct: item ? keyText(item) : '' };
    if (!item || FORMATS.indexOf(item.format) < 0) return res;
    if (item.format === 'choice') {
      const opt = chosen(item, given);
      const text = opt ? opt.text : ((given && typeof given === 'object') ? given.text : given);
      res.ok = list(item.key).some(k => norm(k) === norm(text)) && norm(text) !== '';
      if (!res.ok && opt && opt.trap != null) {
        res.trap = opt.trap;
        const info = trapInfo(opt.trap);
        if (info) res.trapWhy = info.ru;
      }
    } else if (item.format === 'fill') {
      const g = norm(given);
      res.ok = !!g && list(item.key).some(k => norm(k) === g);
    } else if (item.format === 'fix') {
      if (fixFree(item)) {           /* переписать фразу целиком */
        const g = norm(given);
        res.ok = !!g && list(item.key).some(k => norm(k) === g);
      } else {                        /* ткнуть в лишнее слово */
        const idx = tokenIndex(item, given);
        const keys = list(item.key).map(k => tokenIndex(item, k));
        res.ok = idx >= 0 && idx < (item.tokens || []).length && keys.indexOf(idx) >= 0;
      }
    } else if (item.format === 'order') {
      const f = orderScore(item, given);
      res.fraction = f;
      res.ok = f === 1;
    }
    if (item.format !== 'order') res.fraction = res.ok ? 1 : 0;
    return res;
  }

  /* ── лексикон уровня: всё, что ученик уже встречал к этому блоку ──
     Память подписана состоянием словарей: словари подгрузились позже — лексикон пересоберётся. */
  const lexCache = {};
  function lexSig() {
    const p = window.PROGRAM && Array.isArray(PROGRAM.BLOCKS) ? PROGRAM.BLOCKS.length : 0;
    const h = window.HSK ? [1, 2, 3].map(i => (HSK[i] || []).length).join('.') : '0';
    const f = Array.isArray(window.FREQ) ? FREQ.length : 0;
    return p + '/' + h + '/' + f;
  }
  function lexicon(lvl) {
    const L = Math.max(1, Math.min(4, lvl | 0));
    const k = L + '@' + lexSig();
    if (lexCache[k]) return lexCache[k];
    const set = new Set();
    const add = s => { for (const ch of String(s)) if (CJK.test(ch)) set.add(ch); };
    if (window.PROGRAM) for (const b of PROGRAM.BLOCKS) if (b.lvl <= L) add(b.w);
    if (window.HSK) for (let i = 1; i <= Math.min(L, 3); i++) for (const r of (HSK[i] || [])) add(r[0]);
    if (L >= 4 && Array.isArray(window.FREQ)) for (const r of FREQ) add(r[0]);
    lexCache[k] = set;
    return set;
  }

  /* Валидатор сборки: список нарушений, пустой — задание годно */
  function validate(item) {
    if (!item || typeof item !== 'object') return ['задание не объект'];
    const bad = [];
    const F = item.format;
    if (!str(item.id) || !item.id.trim()) bad.push('пустой id');
    if (!str(item.blockId) || !item.blockId.trim()) bad.push('не указан blockId');
    if (FORMATS.indexOf(F) < 0) bad.push('неизвестный формат: ' + F);
    if (!diffOf(item.diff)) bad.push('неизвестная сложность: ' + item.diff);
    const block = window.PROGRAM ? PROGRAM.byId(item.blockId) : null;
    if (window.PROGRAM && !block) bad.push('блока нет в PROGRAM: ' + item.blockId);
    const lvl = item.lvl || (block ? block.lvl : 0);
    if (!lvl) bad.push('не указан уровень');
    else if (block && item.lvl && item.lvl !== block.lvl) bad.push('уровень не совпадает с уровнем блока');
    if (!str(item.stem) || !item.stem.trim()) bad.push('пустой стем');
    if (!str(item.why) || !item.why.trim()) bad.push('пустое why');
    if (!str(item.l1) || !item.l1.trim()) bad.push('пустое l1');
    if (!str(item.tts) || !item.tts.trim()) bad.push('пустой tts');
    const gaps = (str(item.stem) ? (item.stem.match(/_+/g) || []) : []).length;
    if (F === 'fill' || F === 'choice') { if (gaps !== 1) bad.push('пропуск должен быть ровно один, найдено: ' + gaps); }
    else if (gaps) bad.push('в стеме этого формата пропуска быть не должно');
    const keys = list(item.key);
    if (!keys.length) bad.push('пустой ключ');

    if (F === 'choice') {
      const opts = Array.isArray(item.options) ? item.options : [];
      if (opts.length < 3 || opts.length > 4) bad.push('вариантов должно быть 3–4, есть: ' + opts.length);
      let hits = 0;
      opts.forEach((o, i) => {
        if (!o || !str(o.text) || !o.text.trim()) { bad.push('пустой вариант №' + i); return; }
        if (keys.some(k => norm(k) === norm(o.text))) {
          hits++;
          if (hits > 1) bad.push('ключ подсунут в дистракторы: ' + o.text);
        } else if (o.trap == null || o.trap === '') {
          bad.push('у дистрактора «' + o.text + '» нет метки ловушки');
        } else if (!trapShape(o.trap)) {
          bad.push('метка ловушки не по форме («ne-for-ma» или «gram:ma-ne»): ' + o.trap);
        } else if (TRAP_NS.test(o.trap) && window.TRAPS && typeof TRAPS.byId === 'function' && !TRAPS.byId(o.trap)) {
          bad.push('неизвестная ловушка: ' + o.trap);
        }
      });
      if (!hits) bad.push('верного варианта нет среди options');
    }
    if (F === 'fix' && !fixFree(item)) {
      const toks = Array.isArray(item.tokens) ? item.tokens : [];
      if (toks.length < 2) bad.push('нужны токены предложения');
      const idx = keys.map(k => tokenIndex(item, k));
      if (!idx.length || idx.some(i => !(i >= 0 && i < toks.length))) bad.push('ключ не указывает на токен');
      if (str(item.stem) && toks.length && norm(item.stem) !== norm(toks.join(''))) bad.push('стем не совпадает со склейкой токенов');
      if (str(item.tts)) for (let i = 0; i < toks.length; i++) {
        if (idx.indexOf(i) < 0 && norm(item.tts).indexOf(norm(toks[i])) < 0) bad.push('tts не содержит слово «' + toks[i] + '»');
      }
    }
    if (F === 'fix' && fixFree(item)) {
      if (!keys.every(str)) bad.push('ключ переписанной фразы должен быть строкой');
      else {
        if (!keys.some(k => CJK.test(k))) bad.push('в ключе нет китайского текста');
        if (str(item.stem) && keys.some(k => norm(k) === norm(item.stem))) bad.push('исправлять нечего: ключ совпадает со стемом');
        if (str(item.tts) && !keys.some(k => norm(k) === norm(item.tts))) bad.push('tts не совпадает с исправленной фразой');
      }
    }
    if (F === 'order') {
      const toks = Array.isArray(item.tokens) ? item.tokens : [];
      if (toks.length < 3) bad.push('нужно не меньше трёх кусков');
      const base = toks.map(norm).sort().join('|');
      const vars = orderVariants(item);
      for (const v of vars) {
        if (!Array.isArray(v)) { bad.push('допустимый порядок не разбирается на куски: ' + v); continue; }
        if (v.map(norm).sort().join('|') !== base) bad.push('допустимый порядок собран не из тех же кусков: ' + v.join(''));
      }
      if (str(item.tts) && !vars.some(v => norm(Array.isArray(v) ? v.join('') : v) === norm(item.tts))) bad.push('tts не совпадает ни с одним допустимым порядком');
    }
    if ((F === 'choice' || F === 'fill') && str(item.tts) && !keys.some(k => str(k) && norm(item.tts).indexOf(norm(k)) >= 0)) bad.push('tts не содержит верного ответа');

    /* китайские поля: без латиницы и без лексики выше уровня блока */
    const zh = [item.tts]
      .concat(Array.isArray(item.tokens) ? item.tokens : [])
      .concat((Array.isArray(item.options) ? item.options : []).map(o => o && o.text))
      .concat(keys.filter(str))
      .filter(str);
    /* в стеме допускается русская подсказка: латиницу ловим, но кириллицу — нет */
    const zhStem = str(item.stem) ? [item.stem] : [];
    for (const f of zh.concat(zhStem)) if (LATIN.test(f)) bad.push('латиница в китайском тексте: ' + f);
    const lex = lexicon(lvl);
    if (lvl && lex.size > 50) {
      const out = [];
      for (const f of zh.concat(zhStem)) for (const ch of f) if (CJK.test(ch) && !lex.has(ch) && out.indexOf(ch) < 0) out.push(ch);
      if (out.length) bad.push('лексика выше уровня ' + lvl + ': ' + out.join(''));
    }
    return bad;
  }
  /* Прогон всего банка — для валидатора сборки */
  const audit = items => (items || all()).map(i => ({ id: i && i.id, problems: validate(i) })).filter(r => r.problems.length);

  /* ── выборка ── */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffled(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  /* копия задания с перемешанными вариантами; банк не трогаем */
  function prepare(item, rnd) {
    const out = Object.assign({}, item);
    if (Array.isArray(item.options)) out.options = shuffled(item.options.map(o => Object.assign({}, o)), rnd);
    if (Array.isArray(item.tokens)) out.tokens = item.format === 'order' ? shuffled(item.tokens, rnd) : item.tokens.slice();
    return out;
  }
  /* opts: { seed | rnd, diff, formats, exclude, ladder:false } */
  function pick(blockId, n = 5, opts = {}) {
    const o = opts || {};
    const rnd = typeof o.rnd === 'function' ? o.rnd : (o.seed != null ? mulberry32(o.seed) : Math.random);
    let pool = forBlock(blockId);
    if (o.diff) { const want = list(o.diff).map(diffOf); pool = pool.filter(i => want.indexOf(diffOf(i.diff)) >= 0); }
    if (o.formats) pool = pool.filter(i => list(o.formats).indexOf(i.format) >= 0);
    if (o.exclude) pool = pool.filter(i => list(o.exclude).indexOf(i.id) < 0);
    const take = shuffled(pool, rnd).slice(0, Math.max(0, n | 0)).map(i => prepare(i, rnd));
    if (o.ladder === false) return take;
    return take.sort((a, b) => ((LADDER[a.format] || 0) - (LADDER[b.format] || 0))
      || ((DIFF_RANK[diffOf(a.diff)] || 0) - (DIFF_RANK[diffOf(b.diff)] || 0)));
  }

  const api = {
    DEMO, FORMATS, DIFFS, forBlock, forLevel, check, validate, audit, pick, prepare, reload,
    norm, lexicon, mulberry32, diffOf, trapInfo, trapAudit, ATOM,
  };
  /* ITEMS — не хранимое поле, а взгляд на текущее состояние банков */
  Object.defineProperty(api, 'ITEMS', { enumerable: true, get: all });
  return api;
})();
