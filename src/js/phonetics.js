/* Фонетика 语音: слог, инициали, финали, тоны. Ступень «с нуля» — до HSK 1. */
window.PHON = (() => {
  /* Инициали по способу произнесения — так их и подают в институтском курсе.
     Четвёртое поле — реальное слово-пример: его и озвучиваем, а не голые буквы. */
  const INITIALS = [
    { g: 'Губные', ru: 'знакомы русскому уху', list: [['b', 'как «б», но без голоса', '八', 'bā'], ['p', '«п» с сильным придыханием', '爬', 'pá'], ['m', 'как «м»', '妈', 'mā'], ['f', 'как «ф»', '飞', 'fēi']] },
    { g: 'Переднеязычные', ru: 'кончик языка у зубов', list: [['d', 'как «д» без голоса', '大', 'dà'], ['t', '«т» с придыханием', '他', 'tā'], ['n', 'как «н»', '你', 'nǐ'], ['l', 'как «л»', '来', 'lái']] },
    { g: 'Заднеязычные', ru: 'спинка языка у нёба', list: [['g', 'как «г» без голоса', '高', 'gāo'], ['k', '«к» с придыханием', '看', 'kàn'], ['h', 'как «х», глубже', '好', 'hǎo']] },
    { g: 'Мягкие', ru: 'язык плоско, губы растянуты', list: [['j', 'как «цзь», мягко', '家', 'jiā'], ['q', 'как «ць» с придыханием', '七', 'qī'], ['x', 'как «сь», мягко', '西', 'xī']] },
    { g: 'Загнутые', ru: 'кончик языка загнут к нёбу', list: [['zh', 'как «чж» с загнутым языком', '中', 'zhōng'], ['ch', '«ч» твёрдое с придыханием', '吃', 'chī'], ['sh', '«ш» твёрдое', '是', 'shì'], ['r', 'между «р» и «ж»', '日', 'rì']] },
    { g: 'Свистящие', ru: 'язык у нижних зубов', list: [['z', 'как «цз»', '字', 'zì'], ['c', '«ц» с придыханием', '菜', 'cài'], ['s', 'как «с»', '三', 'sān']] },
  ];
  /* Финали — все, кроме носовых (они в NASALS): 7 простых, 4 составных, группы на i-, u-, ü-. */
  const FINALS = [
    { g: 'Простые', ru: 'один гласный', list: [['a', 'как «а»', '妈', 'mā'], ['o', 'как «о»', '波', 'bō'], ['e', 'между «э» и «ы»', '饿', 'è'], ['i', 'как «и»', '一', 'yī'], ['u', 'как «у»', '五', 'wǔ'], ['ü', 'как «ю» в «тюль»', '鱼', 'yú'], ['er', '«ар» с загнутым языком', '二', 'èr']] },
    { g: 'Составные', ru: 'скольжение от первого гласного ко второму', list: [['ai', '«ай»', '爱', 'ài'], ['ei', '«эй»', '北', 'běi'], ['ao', '«ао»', '好', 'hǎo'], ['ou', '«оу»', '走', 'zǒu']] },
    { g: 'На i-', ru: 'начинаются с короткого «и»', list: [['ia', '«я»', '家', 'jiā'], ['ie', '«е»', '谢', 'xiè'], ['iao', '«яо»', '小', 'xiǎo'], ['iu', '«ёу» — полная форма iou', '六', 'liù']] },
    { g: 'На u-', ru: 'начинаются с короткого «у»', list: [['ua', '«уа»', '花', 'huā'], ['uo', '«уо»', '多', 'duō'], ['uai', '«уай»', '快', 'kuài'], ['ui', '«уэй» — полная форма uei', '水', 'shuǐ']] },
    { g: 'На ü-', ru: 'после j, q, x, y точки не пишут', list: [['üe', '«юэ»', '月', 'yuè']] },
  ];
  /* Носовые финали: -n против -ng — главная ловушка для русского уха */
  const NASALS = [
    { g: 'На -n', ru: 'кончик языка у зубов, как мягкое «нь»', list: [['an', '«ань»', '三', 'sān'], ['en', '«энь»', '很', 'hěn'], ['in', '«инь»', '新', 'xīn'], ['ian', '«ень»', '天', 'tiān'], ['uan', '«уань»', '短', 'duǎn'], ['un', '«унь» — полная форма uen', '春', 'chūn'], ['üan', '«юань»', '远', 'yuǎn'], ['ün', '«юнь»', '云', 'yún']] },
    { g: 'На -ng', ru: 'спинка языка к нёбу, звук уходит в нос', list: [['ang', '«ан» в нос', '上', 'shàng'], ['eng', '«эн» в нос', '冷', 'lěng'], ['ing', '«ин» в нос', '星', 'xīng'], ['ong', '«ун» в нос', '东', 'dōng'], ['iang', '«ян» в нос', '想', 'xiǎng'], ['iong', '«юн» в нос', '用', 'yòng'], ['uang', '«уан» в нос', '双', 'shuāng'], ['ueng', '«уэн» в нос — редкая', '翁', 'wēng']] },
  ];
  /* Правила записи — то, обо что спотыкаются на письме */
  const SPELLING = [
    { t: 'ü теряет точки после j, q, x', d: 'После j, q, x пишут ju, qu, xu — но читают всегда «ü». После n и l точки остаются: nü, lü.', ok: 'jú 橘', bad: 'jǘ', key: 'jqx' },
    { t: 'i в начале слога становится y', d: 'Слог без инициали, начинающийся на i, пишется через y: i → yi, ia → ya, ie → ye, iou → you.', ok: 'yī 一', bad: 'ī', key: 'y' },
    { t: 'u в начале слога становится w', d: 'То же с u: u → wu, ua → wa, uo → wo, uei → wei.', ok: 'wǔ 五', bad: 'ǔ', key: 'w' },
    { t: 'ü в начале слога пишется yu', d: 'ü → yu, üe → yue, üan → yuan. Точки исчезают, чтение сохраняется.', ok: 'yǔ 语', bad: 'ǚ', key: 'yu' },
    { t: 'После n и l точки остаются', d: 'nü и lü — единственные места, где ü пишется с точками: 女 nǚ, 绿 lǜ. Без точек это другие слоги: nu, lu.', ok: 'nǚ 女', bad: 'nǔ', key: 'nl' },
  ];
  /* Четыре тона + нейтральный */
  const TONES = [
    { n: 1, mark: 'ˉ', zh: '阴平', t: 'Ровный высокий', d: 'Держите ноту ровно и высоко, как гудок.', ex: ['妈', 'mā', 'мама'] },
    { n: 2, mark: 'ˊ', zh: '阳平', t: 'Восходящий', d: 'Голос идёт вверх, как в переспросе «да?».', ex: ['麻', 'má', 'конопля'] },
    { n: 3, mark: 'ˇ', zh: '上声', t: 'Ныряющий', d: 'Вниз и снова вверх. В речи чаще звучит только низкая часть.', ex: ['马', 'mǎ', 'лошадь'] },
    { n: 4, mark: 'ˋ', zh: '去声', t: 'Падающий', d: 'Резко вниз, как приказ «стой!».', ex: ['骂', 'mà', 'ругать'] },
    { n: 5, mark: '·', zh: '轻声', t: 'Нейтральный', d: 'Короткий и безударный, высота зависит от предыдущего слога.', ex: ['吗', 'ma', 'вопросительная частица'] },
  ];
  /* Изменение тонов — правила, которые не видны в записи */
  const CHANGES = [
    { t: 'Два третьих подряд', d: 'Первый третий читается вторым: 你好 записывается nǐ hǎo, а звучит ní hǎo.', ex: ['你好', 'ní hǎo', 'здравствуй'] },
    { t: '不 перед четвёртым тоном', d: 'bù становится bú: 不是 → bú shì. Перед остальными тонами остаётся bù.', ex: ['不是', 'bú shì', 'не является'] },
    { t: '一 в счёте и перед тонами', d: 'В счёте yī. Перед четвёртым тоном — yí (一样 yíyàng), перед остальными — yì (一起 yìqǐ).', ex: ['一起', 'yìqǐ', 'вместе'] },
  ];
  /* Уроки ступени 0 — в порядке прохождения. Идентификаторы старых уроков сохранены: прогресс не теряется. */
  const LESSONS = [
    { id: 'p-01', zh: '音节', ru: 'Как устроен слог', can: 'Понимаю, из чего собран китайский слог', kind: 'theory', part: 'syllable' },
    { id: 'p-11', zh: '四声', ru: 'Четыре тона', can: 'Знаю, как звучит каждый тон', kind: 'theory', part: 'tones' },
    { id: 'p-06', zh: '听声', ru: 'Слышу тон', can: 'Слышу и называю тон', kind: 'drill', drill: 'tone' },
    { id: 'p-02', zh: '声母', ru: 'Начала слога', can: 'Узнаю инициали на слух', kind: 'theory', part: 'initials' },
    { id: 'p-03', zh: '难音', ru: 'Трудные для русского уха', can: 'Различаю j/q/x, zh/ch/sh, z/c/s и придыхание', kind: 'drill', drill: 'initial' },
    { id: 'p-04', zh: '韵母', ru: 'Концы слога', can: 'Узнаю финали на слух', kind: 'theory', part: 'finals' },
    { id: 'p-09', zh: '鼻音', ru: 'Носовые концы', can: 'Различаю -n и -ng', kind: 'theory', part: 'nasals' },
    { id: 'p-10', zh: '辨韵', ru: 'Слышу конец слога', can: 'Отличаю an от ang, in от ing на слух', kind: 'drill', drill: 'final' },
    { id: 'p-05', zh: '拼写', ru: 'Правила записи', can: 'Пишу пиньинь без ошибок', kind: 'drill', drill: 'spelling', theory: 'spelling' },
    { id: 'p-07', zh: '辨音', ru: 'Тон меняет смысл', can: 'Различаю слова, которые отличаются только тоном', kind: 'drill', drill: 'pair' },
    { id: 'p-08', zh: '变调', ru: 'Тон плывёт', can: 'Знаю, где тон меняется в речи', kind: 'theory', part: 'changes' },
  ];

  /* ── разбор пиньиня ── */
  const MARK = { 'ā': ['a', 1], 'á': ['a', 2], 'ǎ': ['a', 3], 'à': ['a', 4], 'ē': ['e', 1], 'é': ['e', 2], 'ě': ['e', 3], 'è': ['e', 4],
    'ī': ['i', 1], 'í': ['i', 2], 'ǐ': ['i', 3], 'ì': ['i', 4], 'ō': ['o', 1], 'ó': ['o', 2], 'ǒ': ['o', 3], 'ò': ['o', 4],
    'ū': ['u', 1], 'ú': ['u', 2], 'ǔ': ['u', 3], 'ù': ['u', 4], 'ǖ': ['ü', 1], 'ǘ': ['ü', 2], 'ǚ': ['ü', 3], 'ǜ': ['ü', 4] };
  const TONED = { a: 'aāáǎà', e: 'eēéěè', i: 'iīíǐì', o: 'oōóǒò', u: 'uūúǔù', 'ü': 'üǖǘǚǜ' };
  function split(py) {
    let bare = '', tone = 0;
    for (const ch of String(py)) { const m = MARK[ch]; if (m) { bare += m[0]; tone = m[1]; } else bare += ch; }
    return { bare: bare.toLowerCase(), tone: tone || 5 };
  }
  /* обратно: голый слог + номер тона → пиньинь со знаком по правилу (a, e, o в ou, иначе последний гласный) */
  function retone(bare, tone) {
    if (!tone || tone === 5) return bare;
    let idx = -1;
    if (bare.includes('a')) idx = bare.indexOf('a');
    else if (bare.includes('e')) idx = bare.indexOf('e');
    else if (bare.includes('ou')) idx = bare.indexOf('o');
    else for (let i = bare.length - 1; i >= 0; i--) if (TONED[bare[i]]) { idx = i; break; }
    if (idx < 0) return bare;
    return bare.slice(0, idx) + TONED[bare[idx]][tone] + bare.slice(idx + 1);
  }
  const INI = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's'];
  function parts(bare) { const ini = INI.find(i => bare.indexOf(i) === 0) || ''; return { ini, fin: bare.slice(ini.length) }; }
  /* как слог записали бы «по звуку», нарушив правило; null — правило не задето */
  function misspell(bare) {
    if (/^(j|q|x)u/.test(bare)) return bare.replace('u', 'ü');
    if (/^yu/.test(bare)) return 'ü' + bare.slice(2);
    if (/^yi/.test(bare)) return bare.slice(1);
    if (/^y/.test(bare)) return 'i' + bare.slice(1);
    if (/^wu/.test(bare)) return bare.slice(1);
    if (/^w/.test(bare)) return 'u' + bare.slice(1);
    if (/^(n|l)ü/.test(bare)) return bare.replace('ü', 'u');
    return null;
  }
  function ruleOf(bare) {
    if (/^(j|q|x)u/.test(bare)) return 'jqx';
    if (/^yu/.test(bare)) return 'yu';
    if (/^y/.test(bare)) return 'y';
    if (/^w/.test(bare)) return 'w';
    if (/^(n|l)ü/.test(bare)) return 'nl';
    return null;
  }

  /* ── материал для дриллов берём из словаря приложения ── */
  let cacheOne = null;
  /* односложные слова с чистым слогом; многочтения (好 hǎo/hào) помечены — озвучка выберет одно, в дрилл им нельзя */
  function syllables() {
    if (cacheOne) return cacheOne;
    const seen = new Map(), out = [];
    const push = (h, py, ru, lvl) => {
      if (!h || h.length !== 1 || /\s/.test(py) || !/^[a-zü]+$/i.test(split(py).bare)) return;
      const s = split(py), k = h + ':' + s.bare + ':' + s.tone;
      if (seen.has(k)) return;
      const p = parts(s.bare);
      const it = { h, py, ru, lvl, bare: s.bare, tone: s.tone, ini: p.ini, fin: p.fin, poly: false };
      seen.set(k, it); out.push(it);
    };
    ['1', '2', '3'].forEach(l => (window.HSK[l] || []).forEach(c => push(c[0], c[1], c[2], +l)));
    (window.FREQ || []).forEach(c => push(c[0], c[1], c[2], 4));
    const byH = {};
    out.forEach(s => (byH[s.h] = byH[s.h] || []).push(s));
    Object.values(byH).forEach(list => { if (list.length > 1) list.forEach(s => { s.poly = true; }); });
    return (cacheOne = out);
  }
  const clean = s => !s.poly && s.tone < 5;
  /* пары, различающиеся только тоном; сначала те, что целиком из HSK 1–2 */
  let cachePairs = null;
  function minimalPairs() {
    if (cachePairs) return cachePairs;
    const g = {};
    syllables().forEach(s => { if (clean(s)) (g[s.bare] = g[s.bare] || []).push(s); });
    const out = [];
    Object.entries(g).forEach(([bare, list]) => {
      const byTone = {};
      list.slice().sort((a, b) => a.lvl - b.lvl).forEach(s => { if (!byTone[s.tone]) byTone[s.tone] = s; });
      const tones = Object.keys(byTone);
      if (tones.length >= 2) { const items = tones.map(t => byTone[t]); out.push({ bare, items, lvl: Math.max(...items.map(i => i.lvl)) }); }
    });
    out.sort((a, b) => a.lvl - b.lvl);
    return (cachePairs = out);
  }
  /* слоги с нужной инициалью / финалью — для дриллов на различение; z/c/s не захватывают zh/ch/sh */
  const RETRO = { z: 'zh', c: 'ch', s: 'sh' };
  function startsWith(s, ini) {
    if (s.bare.indexOf(ini) !== 0) return false;
    const r = RETRO[ini];
    return r ? s.bare.indexOf(r) !== 0 : true;
  }
  const prefer = (list, maxLvl, min) => { const lo = list.filter(s => s.lvl <= maxLvl); return lo.length >= min ? lo : list; };
  function byInitial(ini, maxLvl = 2) { return prefer(syllables().filter(s => clean(s) && startsWith(s, ini)), maxLvl, 3); }
  function byFinal(fin, maxLvl = 2) { return prefer(syllables().filter(s => clean(s) && s.ini && s.fin === fin), maxLvl, 3); }
  const CONFUSE = [['j', 'zh'], ['q', 'ch'], ['x', 'sh'], ['z', 'zh'], ['c', 'ch'], ['s', 'sh'], ['b', 'p'], ['d', 't'], ['g', 'k'], ['r', 'l']];
  const NG_PAIRS = [['an', 'ang'], ['en', 'eng'], ['in', 'ing'], ['ian', 'iang'], ['uan', 'uang']];

  return { INITIALS, FINALS, NASALS, SPELLING, TONES, CHANGES, LESSONS, CONFUSE, NG_PAIRS, split, retone, parts, misspell, ruleOf, syllables, minimalPairs, byInitial, byFinal };
})();
