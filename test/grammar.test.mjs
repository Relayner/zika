/* Движок грамматических заданий: судья, валидатор, сбор банков, выборка. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require = createRequire(import.meta.url);
global.window = global;
for (const f of ['hsk', 'freq', 'pinyin', 'program']) require('../src/js/' + f + '.js');

/* банки объявлены ДО загрузки движка — он обязан их подобрать */
window.GRAM_BANKS = [
  [
    { id: 'b1-02.g.01', blockId: 'b1-02', lvl: 1, format: 'choice', diff: 'easy',
      stem: '他___我朋友。', key: '是',
      options: [{ text: '是' }, { text: '的', trap: 'de-for-shi' }, { text: '很', trap: 'hen-for-shi' }],
      why: '是 связывает два существительных: «А есть Б».',
      l1: 'В русском связка «есть» опускается, поэтому её легко потерять и здесь.',
      tts: '他是我朋友。' },
  ],
  { block: 'b1-03', items: [
    { id: 'b1-03.g.01', blockId: 'b1-03', lvl: 1, format: 'fill', diff: 'mid',
      stem: '你有___个朋友？', key: ['几', '多少'],
      why: '几 — о малом количестве, 多少 — о любом; счётное слово 个 остаётся в обоих случаях.',
      l1: 'Русское «сколько» одно на все случаи, здесь выбор зависит от ожидаемого числа.',
      tts: '你有几个朋友？' },
  ] },
];
require('../src/js/grammar.js');
const { GRAMMAR } = global;

let ok = 0, bad = 0;
const t = (name, fn) => { try { fn(); ok++; } catch (e) { bad++; console.error('FAIL', name, e.message); process.exitCode = 1; } };
const byId = id => GRAMMAR.ITEMS.find(i => i.id === id);
const snapshot = () => JSON.stringify(GRAMMAR.ITEMS);
const before = snapshot();

/* ── сбор банка ── */
t('ITEMS собираются из GRAM_BANKS', () => {
  assert.ok(byId('b1-02.g.01'), 'массив-банк подобран');
  assert.ok(byId('b1-03.g.01'), 'банк вида {items:[…]} подобран');
  assert.ok(byId('b1-01.g.01'), 'демонстрационный набор на месте');
  assert.equal(new Set(GRAMMAR.ITEMS.map(i => i.id)).size, GRAMMAR.ITEMS.length, 'без дублей id');
});
t('forBlock отдаёт задания блока', () => {
  const l = GRAMMAR.forBlock('b1-05');
  assert.equal(l.length, GRAMMAR.ITEMS.filter(i => i.blockId === 'b1-05').length);
  assert.ok(l.length >= 4, 'блок не пустой: ' + l.length);
  assert.ok(l.every(i => i.blockId === 'b1-05'));
  assert.deepEqual(GRAMMAR.forBlock('нет-такого'), []);
});

/* ── судья: choice ── */
t('check choice', () => {
  const it = byId('b1-01.g.01');
  const iKey = it.options.findIndex(o => o.text === '吗');
  assert.equal(GRAMMAR.check(it, iKey).ok, true, 'верно по индексу');
  assert.equal(GRAMMAR.check(it, '吗').ok, true, 'верно по тексту');
  assert.equal(GRAMMAR.check(it, ' 吗 ').fraction, 1, 'пробелы не мешают');
  const wrong = GRAMMAR.check(it, '呢');
  assert.equal(wrong.ok, false);
  assert.equal(wrong.fraction, 0);
  assert.equal(wrong.trap, 'ne-for-ma', 'ловушка названа');
  assert.ok(wrong.why.length > 10, 'правило возвращается вместе с вердиктом');
  assert.equal(GRAMMAR.check(it, '').ok, false, 'пустой ответ не проходит');
  assert.equal(GRAMMAR.check(it, '吗').trap, undefined, 'у верного ответа ловушки нет');
});

/* ── судья: fill ── */
t('check fill', () => {
  const it = byId('b1-05.g.01');
  assert.equal(GRAMMAR.check(it, '想').ok, true);
  assert.equal(GRAMMAR.check(it, ' 想。').ok, true, 'пробел и точка не мешают');
  assert.equal(GRAMMAR.check(it, '想，').ok, true, 'запятая не мешает');
  assert.equal(GRAMMAR.check(it, '喜欢').ok, false);
  assert.equal(GRAMMAR.check(it, '').ok, false);
});
t('check fill принимает синонимичные ключи', () => {
  const it = byId('b1-03.g.01');
  assert.equal(GRAMMAR.check(it, '几').ok, true);
  assert.equal(GRAMMAR.check(it, ' 多少 ，').ok, true, 'второй ключ и мусорные знаки');
  assert.equal(GRAMMAR.check(it, '多').ok, false);
});

/* ── судья: fix ── */
t('check fix', () => {
  const it = byId('b1-04.g.02');
  assert.equal(GRAMMAR.check(it, 2).ok, true, 'индекс неверного слова');
  assert.equal(GRAMMAR.check(it, '2').ok, true, 'индекс строкой');
  assert.equal(GRAMMAR.check(it, '明天').ok, true, 'тап по самому слову');
  assert.equal(GRAMMAR.check(it, 0).ok, false);
  assert.equal(GRAMMAR.check(it, 0).fraction, 0);
  assert.equal(GRAMMAR.check(it, 99).ok, false, 'индекс за пределами');
  assert.equal(GRAMMAR.check(byId('b1-05.g.02'), 1).ok, true);
  assert.equal(GRAMMAR.check(byId('b1-05.g.02'), 2).ok, false);
});

/* ── судья: order ── */
t('check order', () => {
  const it = byId('b1-04.g.01');
  assert.equal(GRAMMAR.check(it, ['我', '明天', '去', '学校']).ok, true);
  assert.equal(GRAMMAR.check(it, ['明天', '我', '去', '学校']).ok, true, 'другой допустимый порядок засчитан');
  assert.equal(GRAMMAR.check(it, [1, 0, 2, 3]).ok, true, 'ответ индексами токенов');
  assert.equal(GRAMMAR.check(it, '我明天去学校。').ok, true, 'ответ строкой с точкой');
  assert.equal(GRAMMAR.check(it, '明天 我 去 学校').ok, true, 'пробелы не мешают');
  const partial = GRAMMAR.check(it, ['我', '去', '明天', '学校']);
  assert.equal(partial.ok, false, 'время после глагола — не засчитано');
  assert.ok(partial.fraction > 0 && partial.fraction < 1, 'частичный зачёт: ' + partial.fraction);
  assert.equal(GRAMMAR.check(it, ['学校', '去', '明天', '我']).fraction < 1, true);
});
t('check неизвестного формата не падает', () => {
  const r = GRAMMAR.check({ format: 'нет', why: 'п' }, 'что-то');
  assert.equal(r.ok, false); assert.equal(r.fraction, 0);
});

/* ── валидатор ── */
t('демонстрационные задания проходят validate', () => {
  for (const it of GRAMMAR.DEMO) assert.deepEqual(GRAMMAR.validate(it), [], it.id);
  assert.deepEqual(GRAMMAR.audit(), [], 'весь собранный банк чист');
});
const broken = (base, patch) => Object.assign({}, byId(base), patch);
const catches = (item, what) => {
  const v = GRAMMAR.validate(item);
  assert.ok(v.length, 'нарушение не поймано: ' + what);
  assert.ok(v.some(m => m.includes(what)), what + ' → ' + JSON.stringify(v));
};
t('validate ловит ключ среди дистракторов', () => {
  catches(broken('b1-01.g.01', { options: [{ text: '吗' }, { text: '吗', trap: 'x' }, { text: '呢', trap: 'y' }] }), 'ключ подсунут в дистракторы');
});
t('validate ловит два пропуска', () => {
  catches(broken('b1-01.g.01', { stem: '你___是学生___？' }), 'пропуск должен быть ровно один');
  catches(broken('b1-05.g.01', { stem: '我喝茶。' }), 'пропуск должен быть ровно один');
  catches(broken('b1-04.g.02', { stem: '我去___明天。' }), 'пропуска быть не должно');
});
t('validate ловит пустое why', () => {
  catches(broken('b1-01.g.02', { why: '' }), 'пустое why');
  catches(broken('b1-01.g.02', { why: '   ' }), 'пустое why');
  catches(broken('b1-01.g.02', { l1: '' }), 'пустое l1');
});
t('validate ловит латиницу в китайском тексте', () => {
  catches(broken('b1-01.g.01', { stem: '你是student___？' }), 'латиница');
  catches(broken('b1-05.g.01', { tts: 'wo xiang he cha' }), 'латиница');
});
t('validate ловит лексику выше уровня', () => {
  catches(broken('b1-05.g.01', { stem: '我___喝咖啡。', tts: '我想喝咖啡。' }), 'лексика выше уровня 1');
  assert.deepEqual(GRAMMAR.validate(broken('b1-05.g.01', { lvl: 3, blockId: 'b3-01', stem: '我___喝咖啡。', tts: '我想喝咖啡。' })).filter(m => m.includes('лексика')), [], 'на третьем уровне то же слово законно');
});
t('validate ловит остальную труху', () => {
  catches(broken('b1-01.g.01', { options: [{ text: '吗' }, { text: '呢' }, { text: '不', trap: 'z' }] }), 'нет метки ловушки');
  catches(broken('b1-01.g.01', { options: [{ text: '吗' }, { text: '呢', trap: 'a' }] }), 'вариантов должно быть 3–4');
  catches(broken('b1-01.g.01', { tts: '你是学生呢？' }), 'tts не содержит верного ответа');
  catches(broken('b1-01.g.02', { key: '' }), 'пустой ключ');
  catches(broken('b1-04.g.02', { key: 9 }), 'ключ не указывает на токен');
  catches(broken('b1-04.g.02', { tts: '他明天去。' }), 'tts не содержит слово');
  catches(broken('b1-04.g.01', { key: ['我明天去学校。', '我明天去。'] }), 'не из тех же кусков');
  catches(broken('b1-04.g.01', { tts: '我去学校明天。' }), 'tts не совпадает');
  catches(broken('b1-01.g.01', { blockId: 'b9-99' }), 'блока нет в PROGRAM');
  catches(broken('b1-01.g.01', { diff: 'жесть' }), 'неизвестная сложность');
  catches(broken('b1-01.g.01', { stem: '' }), 'пустой стем');
  assert.deepEqual(GRAMMAR.validate(null), ['задание не объект']);
});

/* ── выборка ── */
t('pick не мутирует банк и перемешивает варианты', () => {
  const src = byId('b1-01.g.01');
  const srcOrder = src.options.map(o => o.text).join('');
  let shuffledSeen = false;
  for (let s = 0; s < 30; s++) {
    const got = GRAMMAR.pick('b1-01', 5, { seed: s });
    const ch = got.find(i => i.id === 'b1-01.g.01');
    if (ch.options.map(o => o.text).join('') !== srcOrder) shuffledSeen = true;
    assert.equal(src.options.map(o => o.text).join(''), srcOrder, 'исходник не тронут');
    assert.notEqual(ch.options, src.options, 'варианты — копия');
  }
  assert.ok(shuffledSeen, 'варианты хоть раз перемешались');
});
t('pick детерминирован при одном seed', () => {
  const a = GRAMMAR.pick('b1-05', 3, { seed: 7 });
  const b = GRAMMAR.pick('b1-05', 3, { seed: 7 });
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  assert.deepEqual(GRAMMAR.pick('b1-05', 2, { seed: 7 }).length, 2, 'n соблюдается');
  assert.equal(GRAMMAR.pick('b1-05', 99, { seed: 7 }).length, GRAMMAR.forBlock('b1-05').length, 'больше, чем есть, не выдумывает');
});
t('pick фильтрует и строит лестницу усилия', () => {
  const easy = GRAMMAR.pick('b1-01', 5, { seed: 3, diff: 'easy' });
  assert.ok(easy.every(i => i.diff === 'easy'));
  const fills = GRAMMAR.pick('b1-05', 5, { seed: 3, formats: ['fill'] });
  assert.ok(fills.every(i => i.format === 'fill'));
  assert.ok(!GRAMMAR.pick('b1-05', 5, { seed: 3, exclude: ['b1-05.g.01'] }).some(i => i.id === 'b1-05.g.01'));
  const all = GRAMMAR.pick('b1-05', 5, { seed: 3 });
  const rank = { choice: 0, fix: 1, fill: 2, order: 3 };
  for (let i = 1; i < all.length; i++) assert.ok(rank[all[i - 1].format] <= rank[all[i].format], 'формат не убывает');
});
t('ответ по перемешанному заданию судится верно', () => {
  for (let s = 0; s < 20; s++) {
    const it = GRAMMAR.pick('b1-01', 5, { seed: s }).find(i => i.id === 'b1-01.g.01');
    const iKey = it.options.findIndex(o => o.text === '吗');
    assert.equal(GRAMMAR.check(it, iKey).ok, true, 'seed ' + s);
    const iBad = it.options.findIndex(o => o.text === '呢');
    assert.equal(GRAMMAR.check(it, iBad).trap, 'ne-for-ma');
  }
  for (let s = 0; s < 20; s++) {
    const it = GRAMMAR.pick('b1-04', 5, { seed: s }).find(i => i.id === 'b1-04.g.01');
    const idx = ['我', '明天', '去', '学校'].map(w => it.tokens.indexOf(w));
    assert.equal(GRAMMAR.check(it, idx).ok, true, 'перемешанные куски, seed ' + s);
  }
});

/* ── чистота: порядок вызовов ничего не меняет ── */
t('судья не зависит от порядка вызовов', () => {
  const pairs = [
    ['b1-01.g.01', '吗'], ['b1-01.g.01', '呢'], ['b1-01.g.02', '吗'],
    ['b1-03.g.01', '多少'], ['b1-04.g.01', ['明天', '我', '去', '学校']],
    ['b1-04.g.01', ['我', '去', '明天', '学校']], ['b1-04.g.02', 2], ['b1-04.g.02', '我'],
    ['b1-05.g.01', ' 想 '], ['b1-05.g.02', 1], ['b1-05.g.03', '没'],
  ];
  const run = arr => arr.map(([id, g]) => [id, JSON.stringify(GRAMMAR.check(byId(id), g))]);
  const forward = run(pairs);
  const backward = run(pairs.slice().reverse()).reverse();
  assert.deepEqual(backward, forward, 'обратный порядок даёт то же');
  assert.deepEqual(run(pairs), forward, 'повторный прогон даёт то же');
  /* вразнобой: каждый вердикт совпадает с тем, что дал прямой прогон */
  const want = new Map(pairs.map((p, i) => [i, forward[i][1]]));
  const mixed = pairs.map((p, i) => i).sort(() => 0.5 - Math.random());
  for (const i of mixed) {
    const [id, g] = pairs[i];
    assert.equal(JSON.stringify(GRAMMAR.check(byId(id), g)), want.get(i), id + ' вне очереди');
  }
});
t('пересчёт с нуля равен исходному', () => {
  const wasIds = GRAMMAR.ITEMS.map(i => i.id).join(',');
  const n = GRAMMAR.reload();
  assert.equal(n, GRAMMAR.ITEMS.length);
  assert.equal(GRAMMAR.ITEMS.map(i => i.id).join(','), wasIds, 'повторная сборка даёт тот же банк');
  assert.deepEqual(GRAMMAR.audit(), []);
});
t('банк не изменился за весь прогон', () => {
  assert.equal(snapshot(), before, 'ITEMS остались прежними');
});

/* ── содержание: матрица форматов и сложностей закрыта целиком ── */
t('демонстрационный набор закрывает все форматы × сложности', () => {
  const cells = new Set(GRAMMAR.DEMO.map(i => i.format + '/' + i.diff));
  const want = [];
  for (const f of GRAMMAR.FORMATS) for (const d of GRAMMAR.DIFFS) want.push(f + '/' + d);
  assert.deepEqual(want.filter(c => !cells.has(c)), [], 'пустые клетки матрицы');
  assert.ok(GRAMMAR.DEMO.some(i => i.format === 'fix' && !i.tokens), 'есть fix «перепиши фразу»');
  assert.ok(GRAMMAR.DEMO.some(i => i.format === 'fix' && i.tokens), 'есть fix «ткни в слово»');
  const ids = GRAMMAR.DEMO.map(i => i.id);
  assert.equal(new Set(ids).size, ids.length, 'id демонстрации уникальны');
});
t('у каждого задания единственный ключ среди вариантов', () => {
  for (const it of GRAMMAR.ITEMS.filter(i => i.format === 'choice')) {
    const keys = (Array.isArray(it.key) ? it.key : [it.key]).map(GRAMMAR.norm);
    const hits = it.options.filter(o => keys.includes(GRAMMAR.norm(o.text)));
    assert.equal(hits.length, 1, it.id + ': верных вариантов ' + hits.length);
    for (const o of it.options) {
      if (hits.includes(o)) continue;
      assert.equal(GRAMMAR.check(it, o.text).ok, false, it.id + ': дистрактор «' + o.text + '» засчитан');
    }
  }
});

/* ── fix «перепиши фразу»: банки пишут ключом исправленное предложение ── */
t('fix без токенов судится по тексту', () => {
  const it = byId('b1-09.g.02');
  assert.equal(GRAMMAR.check(it, '我没买电脑。').ok, true);
  assert.equal(GRAMMAR.check(it, ' 我没买电脑 ').ok, true, 'пробелы и точка не мешают');
  assert.equal(GRAMMAR.check(it, '我没买了电脑。').ok, false, 'не исправленная фраза не проходит');
  assert.equal(GRAMMAR.check(it, '').ok, false);
  assert.equal(GRAMMAR.check(it, 0).ok, false, 'индекс сюда не годится');
  assert.equal(GRAMMAR.check(it, '我没买电脑。').correct, '我没买电脑。');
  catches(Object.assign({}, it, { key: it.stem }), 'исправлять нечего');
  catches(Object.assign({}, it, { tts: '我买电脑。' }), 'tts не совпадает с исправленной');
});

/* ── сложность: банки пишут её и числом ── */
t('сложность 1–3 понимается наравне со словами', () => {
  assert.equal(GRAMMAR.diffOf(1), 'easy');
  assert.equal(GRAMMAR.diffOf(3), 'hard');
  assert.equal(GRAMMAR.diffOf('hard'), 'hard');
  assert.equal(GRAMMAR.diffOf('жесть'), null);
  const num = Object.assign({}, byId('b1-01.g.01'), { diff: 2 });
  assert.deepEqual(GRAMMAR.validate(num), [], 'числовая сложность не считается нарушением');
  catches(Object.assign({}, byId('b1-01.g.01'), { diff: 9 }), 'неизвестная сложность');
});
t('фильтр по сложности понимает обе записи', () => {
  window.GRAM_BANKS.push([Object.assign({}, byId('b1-05.g.03'), { id: 'b1-05.g.num', diff: 3 })]);
  GRAMMAR.reload();
  const hard = GRAMMAR.pick('b1-05', 9, { seed: 1, diff: 'hard' });
  assert.ok(hard.some(i => i.id === 'b1-05.g.num'), 'числовая hard попала в выборку hard');
  assert.ok(hard.every(i => GRAMMAR.diffOf(i.diff) === 'hard'));
  window.GRAM_BANKS.pop(); GRAMMAR.reload();
  assert.equal(byId('b1-05.g.num'), undefined, 'банк убран — задание ушло');
});

/* ── ловушки: своё пространство имён, чужой каталог TRAPS не при чём ── */
t('метка ловушки объясняется по-русски', () => {
  assert.equal(GRAMMAR.trapInfo('ne-for-ma').ru, '呢 вместо: 吗');
  assert.ok(GRAMMAR.trapInfo('mw-ben').ru.includes('本'));
  assert.ok(GRAMMAR.trapInfo('hen-misplaced').ru.includes('很'));
  assert.equal(GRAMMAR.trapInfo('нет такой метки'), null);
  assert.equal(GRAMMAR.trapInfo('Ne-For-Ma'), null, 'только строчные атомы');
  const r = GRAMMAR.check(byId('b1-01.g.01'), '呢');
  assert.equal(r.trap, 'ne-for-ma');
  assert.equal(r.trapWhy, '呢 вместо: 吗', 'вердикт несёт объяснение ловушки');
  assert.deepEqual(GRAMMAR.trapAudit(GRAMMAR.DEMO), [], 'все метки демонстрации каталог объясняет');
});
t('validate ловит метку не по форме, но не требует чужого каталога', () => {
  catches(broken('b1-01.g.01', { options: [{ text: '吗' }, { text: '呢', trap: 'НЕ ПО ФОРМЕ' }, { text: '的', trap: 'de-random' }] }), 'метка ловушки не по форме');
  window.TRAPS = { ALL: [{ id: 'gram:ma-ne', ru: 'Вопрос частицей', rule: '吗 в хвосте' }], byId: id => (id === 'gram:ma-ne' ? window.TRAPS.ALL[0] : null) };
  assert.deepEqual(GRAMMAR.audit(GRAMMAR.DEMO), [], 'загруженный TRAPS не делает kebab-метки «неизвестными»');
  const ns = broken('b1-01.g.01', { options: [{ text: '吗' }, { text: '呢', trap: 'gram:ma-ne' }, { text: '的', trap: 'de-random' }] });
  assert.deepEqual(GRAMMAR.validate(ns), [], 'метка из каталога TRAPS законна');
  assert.equal(GRAMMAR.trapInfo('gram:ma-ne').ru, 'Вопрос частицей', 'объяснение берётся из каталога');
  assert.equal(GRAMMAR.check(ns, '呢').trapWhy, 'Вопрос частицей', 'вердикт несёт объяснение из каталога');
  catches(broken('b1-01.g.01', { options: [{ text: '吗' }, { text: '呢', trap: 'gram:нет-такой' }, { text: '的', trap: 'de-random' }] }), 'неизвестная ловушка');
  delete window.TRAPS;
  assert.equal(GRAMMAR.trapInfo('gram:ma-ne'), null, 'без каталога namespace-метка не выдумывается');
});

/* ── чистота: банк и лексикон пересчитываются, а не запоминаются ── */
t('банк, добавленный после загрузки движка, виден без reload', () => {
  const add = { id: 'b1-07.g.90', blockId: 'b1-07', lvl: 1, format: 'fill', diff: 'easy',
    stem: '我___说汉语。', key: ['会'],
    why: '会 — умение, полученное учёбой; стоит перед глаголом.',
    l1: 'Русское «умею» тоже идёт перед вторым глаголом, но здесь без инфинитива.',
    tts: '我会说汉语。' };
  const n = GRAMMAR.ITEMS.length;
  window.GRAM_BANKS.push({ lvl: 1, items: [add] });
  assert.equal(GRAMMAR.ITEMS.length, n + 1, 'новый банк подхвачен сам');
  assert.ok(byId('b1-07.g.90'), 'задание доступно');
  assert.deepEqual(GRAMMAR.validate(add), [], 'и оно проходит валидатор');
  window.GRAM_BANKS.pop();
  assert.equal(GRAMMAR.ITEMS.length, n, 'банк убрали — движок вернулся к прежнему составу');
});

/* ── пустое и странное состояние: отдельные чистые процессы ── */
const node = (code) => execFileSync(process.execPath, ['-e', code], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' }).trim();
t('движок грузится без словарей, банков и DOM', () => {
  const out = node(`
    global.window = global;
    require('./src/js/grammar.js');
    const G = window.GRAMMAR;
    const r = [
      G.ITEMS.length > 0,
      JSON.stringify(G.validate(G.DEMO[0])) === '[]',
      G.lexicon(1).size === 0,
      G.check(undefined, undefined).ok === false,
      G.check({}, null).ok === false,
      G.check({ format: 'fill', key: ['x'] }, 'x').ok === true,
      JSON.stringify(G.pick('нет-такого', 5, { seed: 1 })) === '[]',
      G.validate(null).length === 1,
      G.validate({}).length > 5,
      G.audit([{ id: 'дрянь' }, null]).length === 2,
      typeof document === 'undefined',
    ];
    console.log(r.join(','));
  `);
  assert.equal(out, ['true'].concat(Array(10).fill('true')).join(','), 'пустое состояние: ' + out);
});
t('лексикон не протухает, если словари подгрузились позже', () => {
  const out = node(`
    global.window = global;
    require('./src/js/grammar.js');
    const G = window.GRAMMAR;
    const before = G.lexicon(1).size;                    /* словарей ещё нет */
    for (const f of ['hsk', 'freq', 'program']) require('./src/js/' + f + '.js');
    const after = G.lexicon(1).size;                     /* словари появились */
    const caught = G.validate(Object.assign({}, G.DEMO[0], { stem: '我___喝咖啡。', tts: '我想喝咖啡。', format: 'fill', key: ['想'], options: undefined }))
      .filter(m => m.includes('лексика')).length;
    console.log([before === 0, after > 50, caught === 1].join(','));
  `);
  assert.equal(out, 'true,true,true', 'лексикон: ' + out);
});
t('порядок загрузки банка и движка не меняет банк', () => {
  const item = JSON.stringify({ id: 'b1-06.g.90', blockId: 'b1-06', lvl: 1, format: 'fill', diff: 'easy',
    stem: '桌子上有一___书。', key: ['本'], why: 'Счётное слово для книг — 本.',
    l1: 'В русском счётного слова нет.', tts: '桌子上有一本书。' });
  const mk = (first) => `
    global.window = global;
    for (const f of ['hsk', 'freq', 'program']) require('./src/js/' + f + '.js');
    const bank = { lvl: 1, items: [${item}] };
    ${first === 'bank' ? '(window.GRAM_BANKS = window.GRAM_BANKS || []).push(bank);' : ''}
    require('./src/js/grammar.js');
    ${first === 'engine' ? '(window.GRAM_BANKS = window.GRAM_BANKS || []).push(bank);' : ''}
    const G = window.GRAMMAR;
    console.log(JSON.stringify([G.ITEMS.map(i => i.id).sort(), G.audit(), G.check(G.ITEMS.find(i => i.id === 'b1-06.g.90'), '本').ok]));
  `;
  assert.equal(node(mk('bank')), node(mk('engine')), 'банк до движка и после дают одно и то же');
});

console.log(bad ? `SOME TESTS FAILED: ${bad} провал(ов), ${ok} пройдено` : `grammar: ${ok} проверок пройдено, 0 FAIL`);
