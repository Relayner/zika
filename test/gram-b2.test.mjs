/* Проверка банка грамматики уровня 2 (src/js/gram-b2.js).
   Запуск: node test/gram-b2.test.mjs — ноль строк FAIL обязателен. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
global.window = global;
/* порядок как в браузере: данные → движок → банк, затем перечитывание банков */
for (const f of ['hsk', 'freq', 'pinyin', 'program', 'grammar', 'gram-b2']) require('../src/js/' + f + '.js');
const { HSK, PROGRAM, GRAMMAR, GRAM_BANKS } = global;
GRAMMAR.reload();

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL', name, '—', e.message); process.exitCode = 1; } };

const CJK = /[一-鿿]/;
const LATIN = /[A-Za-z]/;
const LVL = 2;
const BLOCKS = PROGRAM.BLOCKS.filter(b => b.lvl === LVL).map(b => b.id);
const items = GRAMMAR.forLevel(LVL).filter(i => /^b2-/.test(i.blockId));
const byBlock = id => items.filter(i => i.blockId === id);

/* ── 1. банк зарегистрирован и подхвачен движком ── */
t('банк зарегистрирован в GRAM_BANKS', () => {
  assert.ok(Array.isArray(GRAM_BANKS), 'GRAM_BANKS не массив');
  const bank = GRAM_BANKS.find(b => b && b.lvl === LVL && Array.isArray(b.items));
  assert.ok(bank, 'нет банка с lvl:2');
  assert.ok(bank.items.length >= 120, 'заданий в банке: ' + bank.items.length);
  for (const it of bank.items) assert.ok(GRAMMAR.ITEMS.indexOf(it) >= 0 || GRAMMAR.ITEMS.some(x => x.id === it.id), 'движок не видит ' + it.id);
});
t('блоки уровня 2 найдены в PROGRAM', () => {
  assert.equal(BLOCKS.length, 10, 'блоков уровня 2: ' + BLOCKS.length);
});

/* ── 2. покрытие блоков и форматов ── */
t('каждый блок покрыт ≥12 заданиями', () => {
  for (const id of BLOCKS) assert.ok(byBlock(id).length >= 12, id + ': заданий ' + byBlock(id).length);
});
t('в каждом блоке есть все четыре формата с квотами', () => {
  const MIN = { choice: 5, fix: 3, fill: 3, order: 2 };
  for (const id of BLOCKS) {
    const got = byBlock(id);
    for (const f of GRAMMAR.FORMATS) {
      const c = got.filter(i => i.format === f).length;
      assert.ok(c >= MIN[f], id + ': формат ' + f + ' встречается ' + c + ' раз, нужно ' + MIN[f]);
    }
  }
});
t('id уникальны по всему банку', () => {
  const seen = new Map();
  for (const i of GRAMMAR.ITEMS) {
    assert.ok(!seen.has(i.id), 'повтор id: ' + i.id);
    seen.set(i.id, 1);
  }
  for (const i of items) assert.ok(/^b2-\d\d\.g\.\d\d$/.test(i.id), 'формат id: ' + i.id);
});
t('каждое задание привязано к своему блоку и уровню', () => {
  for (const i of items) {
    assert.ok(BLOCKS.indexOf(i.blockId) >= 0, i.id + ': чужой блок ' + i.blockId);
    assert.equal(i.lvl, LVL, i.id + ': уровень ' + i.lvl);
    assert.equal(i.id.slice(0, i.blockId.length), i.blockId, i.id + ': id не начинается с blockId');
  }
});

/* ── 3. лексика: только HSK 1–2 плюс слова блоков уровней 1–2 ── */
const LEX = (() => {
  const set = new Set();
  const add = s => { for (const ch of String(s)) if (CJK.test(ch)) set.add(ch); };
  for (const lvl of [1, 2]) for (const row of (HSK[lvl] || [])) add(row[0]);
  for (const b of PROGRAM.BLOCKS) if (b.lvl <= LVL) add(b.w);
  return set;
})();
/* служебных знаков вне банка слов не потребовалось — белый список пуст и должен таким остаться */
const WHITELIST = new Set([]);
const zhFields = i => [i.stem, i.tts]
  .concat(Array.isArray(i.tokens) ? i.tokens : [])
  .concat((Array.isArray(i.options) ? i.options : []).map(o => o && o.text))
  .concat((Array.isArray(i.key) ? i.key : [i.key]).filter(v => typeof v === 'string'))
  .filter(v => typeof v === 'string');

t('лексика не выше HSK 2', () => {
  assert.ok(LEX.size > 300, 'банк слов подозрительно мал: ' + LEX.size);
  const bad = [];
  for (const i of items) for (const f of zhFields(i)) for (const ch of f) {
    if (CJK.test(ch) && !LEX.has(ch) && !WHITELIST.has(ch)) bad.push(i.id + ':' + ch);
  }
  assert.equal(bad.length, 0, 'вне HSK 1–2: ' + [...new Set(bad)].join(', '));
});
t('белый список пуст и не прикрывает ошибки', () => {
  assert.equal(WHITELIST.size, 0, 'в белом списке появились знаки: ' + [...WHITELIST].join(''));
});

/* ── 4. ключи, ловушки, тексты ── */
t('ключ не встречается среди дистракторов', () => {
  for (const i of items.filter(x => x.format === 'choice')) {
    const keys = (Array.isArray(i.key) ? i.key : [i.key]).map(GRAMMAR.norm);
    const hits = i.options.filter(o => keys.indexOf(GRAMMAR.norm(o.text)) >= 0);
    assert.equal(hits.length, 1, i.id + ': верных вариантов ' + hits.length);
    assert.ok(i.options.length >= 3 && i.options.length <= 4, i.id + ': вариантов ' + i.options.length);
    const texts = i.options.map(o => GRAMMAR.norm(o.text));
    assert.equal(new Set(texts).size, texts.length, i.id + ': повторяющиеся варианты');
  }
});
t('у каждого дистрактора есть осмысленная ловушка', () => {
  const traps = new Set();
  for (const i of items.filter(x => x.format === 'choice')) {
    const keys = (Array.isArray(i.key) ? i.key : [i.key]).map(GRAMMAR.norm);
    for (const o of i.options) {
      if (keys.indexOf(GRAMMAR.norm(o.text)) >= 0) { assert.equal(o.trap, undefined, i.id + ': у ключа стоит trap'); continue; }
      assert.ok(typeof o.trap === 'string' && /^[a-z][a-z0-9-]{3,}$/.test(o.trap), i.id + ': плохая метка ловушки ' + o.trap);
      traps.add(o.trap);
    }
  }
  assert.ok(traps.size >= 40, 'разных ловушек всего ' + traps.size);
});
t('tts — целое китайское предложение без пропусков и латиницы', () => {
  for (const i of items) {
    assert.ok(!/_/.test(i.tts), i.id + ': пропуск в tts');
    assert.ok(!LATIN.test(i.tts), i.id + ': латиница в tts');
    assert.ok(CJK.test(i.tts), i.id + ': в tts нет иероглифов');
    assert.ok(/[。？！]$/.test(i.tts), i.id + ': tts без конечного знака — ' + i.tts);
    assert.ok(!/[a-zA-Z0-9 ]/.test(i.tts.replace(/[，。？！]/g, '')), i.id + ': посторонние знаки в tts');
  }
});
t('пояснения заполнены по-русски', () => {
  for (const i of items) {
    for (const f of ['why', 'l1']) {
      assert.ok(typeof i[f] === 'string' && i[f].trim().length >= 20, i.id + ': короткое ' + f);
      assert.ok(/[а-яА-ЯёЁ]/.test(i[f]), i.id + ': ' + f + ' не по-русски');
    }
    assert.ok(['easy', 'mid', 'hard'].indexOf(i.diff) >= 0, i.id + ': сложность ' + i.diff);
  }
});
t('пропуск ровно один там, где он нужен', () => {
  for (const i of items) {
    const gaps = (i.stem.match(/_+/g) || []).length;
    if (i.format === 'choice' || i.format === 'fill') assert.equal(gaps, 1, i.id + ': пропусков ' + gaps);
    else assert.equal(gaps, 0, i.id + ': лишний пропуск в стеме');
  }
});

/* ── 5. скелеты предложений не повторяются больше двух раз на блок ── */
/* каркас: служебные знаки сохраняются, всё знаменательное схлопывается в одну точку */
const STRUCT = new Set([...'不没了的得吗呢吧很太都也还就再别在是有比离从到往给让因为所以虽然但正已经最非常可会想要两一点儿每过着第下上里旁边左右近远和请谁什么哪怎样能']);
const frame = s => GRAMMAR.norm(s).split('').map(ch => (STRUCT.has(ch) ? ch : '·')).join('').replace(/·+/g, '·');
t('скелеты предложений не повторяются больше двух раз на блок', () => {
  const bad = [];
  for (const id of BLOCKS) {
    const count = new Map();
    for (const i of byBlock(id)) {
      const f = frame(i.tts);
      count.set(f, (count.get(f) || 0) + 1);
    }
    for (const [f, c] of count) if (c > 2) bad.push(id + ' «' + f + '» ×' + c);
  }
  assert.equal(bad.length, 0, 'перегруженные каркасы: ' + bad.join(', '));
});
t('стемы не дублируются', () => {
  const seen = new Map(); const bad = [];
  for (const i of items) {
    const k = i.blockId + '|' + GRAMMAR.norm(i.stem);
    if (seen.has(k)) bad.push(i.id + '=' + seen.get(k)); else seen.set(k, i.id);
  }
  assert.equal(bad.length, 0, 'повторы стемов: ' + bad.join(', '));
});
t('китайские предложения не дублируются внутри блока', () => {
  const seen = new Map(); const bad = [];
  for (const i of items) {
    const k = i.blockId + '|' + GRAMMAR.norm(i.tts);
    if (seen.has(k)) bad.push(i.id + '=' + seen.get(k)); else seen.set(k, i.id);
  }
  assert.equal(bad.length, 0, 'повторы tts: ' + bad.join(', '));
});

/* ── 6. движок: сборка валидна, судья отвечает верно ── */
t('GRAMMAR.validate не находит нарушений', () => {
  const bad = GRAMMAR.audit(items);
  assert.equal(bad.length, 0, 'нарушения: ' + bad.map(r => r.id + ' → ' + r.problems.join('; ')).join(' | '));
});
t('ключ каждого задания признаётся верным', () => {
  for (const i of items) {
    const given = i.format === 'fix' ? i.key : (Array.isArray(i.key) ? i.key[0] : i.key);
    const r = GRAMMAR.check(i, given);
    assert.ok(r.ok, i.id + ': ключ не принят судьёй');
    assert.equal(r.fraction, 1, i.id + ': доля ' + r.fraction);
  }
});
t('каждый дистрактор отвергается и возвращает свою ловушку', () => {
  for (const i of items.filter(x => x.format === 'choice')) {
    const keys = (Array.isArray(i.key) ? i.key : [i.key]).map(GRAMMAR.norm);
    for (const o of i.options) {
      if (keys.indexOf(GRAMMAR.norm(o.text)) >= 0) continue;
      const r = GRAMMAR.check(i, o.text);
      assert.equal(r.ok, false, i.id + ': дистрактор «' + o.text + '» принят как верный');
      assert.equal(r.trap, o.trap, i.id + ': судья не вернул ловушку ' + o.trap);
    }
  }
});
t('перестановка кусков в order не проходит как верный ответ', () => {
  for (const i of items.filter(x => x.format === 'order')) {
    const swapped = i.tokens.slice();
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    assert.equal(GRAMMAR.check(i, swapped).ok, false, i.id + ': неверный порядок принят');
  }
});

/* ── 6b. связь fix со своей исправленной фразой ── */
t('в fix все уцелевшие куски стоят в tts в том же порядке', () => {
  for (const i of items.filter(x => x.format === 'fix' && Array.isArray(x.tokens))) {
    const rest = i.tokens.filter((_, k) => k !== i.key);
    const tts = GRAMMAR.norm(i.tts);
    let at = 0;
    for (const tok of rest) {
      const k = tts.indexOf(GRAMMAR.norm(tok), at);
      assert.ok(k >= 0, i.id + ': в исправленной фразе нет куска «' + tok + '»');
      at = k + GRAMMAR.norm(tok).length;
    }
    assert.notEqual(GRAMMAR.norm(i.stem), tts, i.id + ': исправлять нечего');
  }
});

/* ── 7. чистота: банк — данные, движок — чистая функция ── */
t('банк — чистые данные: ни функций, ни скрытого состояния', () => {
  const walk = (v, path) => {
    assert.notEqual(typeof v, 'function', 'функция в банке: ' + path);
    if (Array.isArray(v)) v.forEach((x, k) => walk(x, path + '[' + k + ']'));
    else if (v && typeof v === 'object') {
      assert.equal(Object.getPrototypeOf(v), Object.prototype, 'не простой объект: ' + path);
      for (const k of Object.keys(v)) walk(v[k], path + '.' + k);
    }
  };
  const bank = GRAM_BANKS.find(b => b && b.lvl === LVL);
  walk(bank, 'bank');
  assert.deepEqual(JSON.parse(JSON.stringify(bank)), bank, 'банк не переживает JSON-оборот');
});
t('файл грузится под node в одиночку: ни DOM, ни соседних модулей', () => {
  const file = fileURLToPath(new URL('../src/js/gram-b2.js', import.meta.url));
  const out = execFileSync(process.execPath, ['-e',
    'global.window = {};' +
    'require(' + JSON.stringify(file) + ');' +
    'const b = window.GRAM_BANKS;' +
    'if (!Array.isArray(b) || b.length !== 1) throw new Error("банк не зарегистрирован");' +
    'if (b[0].lvl !== 2 || !Array.isArray(b[0].items)) throw new Error("не тот банк");' +
    'process.stdout.write(String(b[0].items.length));'], { encoding: 'utf8' });
  assert.equal(+out, items.length, 'в одиночку загрузилось ' + out + ' заданий');
});
t('в исходнике нет DOM, модульных форм и обращений к окружению', () => {
  const src = readFileSync(fileURLToPath(new URL('../src/js/gram-b2.js', import.meta.url)), 'utf8');
  for (const re of [/\bdocument\b/, /\blocalStorage\b/, /\bfetch\s*\(/, /window\.location/, /^\s*import\s/m, /^\s*export\s/m, /\brequire\s*\(/, /\bDate\.now\b/, /\bMath\.random\b/]) {
    assert.equal(re.test(src), false, 'в банке встретилось ' + re);
  }
});
t('пустой и странный ответ судья переживает без падения', () => {
  /* числа — законный ответ (номер варианта, номер куска), поэтому берём заведомо несуществующие */
  const junk = [undefined, null, '', ' ', -1, 999, NaN, [], {}, { text: '' }, 'мимо', '，。'];
  for (const i of items) for (const g of junk) {
    const r = GRAMMAR.check(i, g);
    assert.ok(r && typeof r === 'object', i.id + ': судья ничего не вернул');
    assert.equal(typeof r.fraction, 'number', i.id + ': доля не число');
    assert.ok(r.fraction >= 0 && r.fraction <= 1, i.id + ': доля вне отрезка — ' + r.fraction);
    if (r.ok) assert.ok(false, i.id + ': мусор «' + String(g) + '» принят как верный ответ');
  }
});
t('пустое и битое состояние банка ничего не ломает', () => {
  for (const junk of [null, undefined, {}, { format: 'choice' }, { format: 'нет', key: 1 }, []]) {
    assert.ok(Array.isArray(GRAMMAR.validate(junk)), 'validate упал на ' + JSON.stringify(junk));
    assert.equal(GRAMMAR.check(junk, 'что-нибудь').ok, false, 'check принял мусорное задание');
  }
  assert.deepEqual(GRAMMAR.forBlock('b2-99'), [], 'нашёлся несуществующий блок');
  assert.deepEqual(GRAMMAR.pick('b2-99', 5, { seed: 1 }), [], 'выборка из пустого блока не пуста');
  assert.deepEqual(GRAMMAR.pick('b2-01', 0, { seed: 1 }), [], 'нулевая выборка не пуста');
  assert.equal(GRAMMAR.pick('b2-01', 999, { seed: 1 }).length, byBlock('b2-01').length, 'выборка больше блока');
  assert.deepEqual(GRAMMAR.forLevel(9), [], 'нашёлся несуществующий уровень');
});
t('повторная регистрация того же банка не удваивает задания', () => {
  const before = JSON.stringify(GRAMMAR.forLevel(LVL).map(i => i.id));
  const bank = GRAM_BANKS.find(b => b && b.lvl === LVL);
  GRAM_BANKS.push(bank);
  try {
    GRAMMAR.reload();
    assert.equal(JSON.stringify(GRAMMAR.forLevel(LVL).map(i => i.id)), before, 'банк подхватился дважды');
  } finally { GRAM_BANKS.pop(); GRAMMAR.reload(); }
  assert.equal(JSON.stringify(GRAMMAR.forLevel(LVL).map(i => i.id)), before, 'банк не вернулся к исходному виду');
});
t('пересчёт с нуля даёт тот же банк', () => {
  const once = JSON.stringify(GRAMMAR.forLevel(LVL));
  GRAMMAR.reload(); GRAMMAR.reload();
  assert.equal(JSON.stringify(GRAMMAR.forLevel(LVL)), once, 'пересчёт дал другой банк');
});

/* ── 8. чистота: результат не зависит от порядка вызовов и ничего не мутирует ── */
t('проверка — чистая функция: порядок и повторы ничего не меняют', () => {
  const answers = items.map(i => (i.format === 'fix' ? i.key : (Array.isArray(i.key) ? i.key[0] : i.key)));
  const once = items.map((i, k) => JSON.stringify(GRAMMAR.check(i, answers[k])));
  const idx = items.map((_, k) => k).sort((a, b) => (a * 7919 % 101) - (b * 7919 % 101));
  const shuffledAgain = new Array(items.length);
  for (const k of idx) shuffledAgain[k] = JSON.stringify(GRAMMAR.check(items[k], answers[k]));
  for (const k of idx) shuffledAgain[k] = JSON.stringify(GRAMMAR.check(items[k], answers[k]));
  assert.deepEqual(shuffledAgain, once, 'результат зависит от порядка вызовов');
});
t('банк не мутируется ни разбором, ни выборкой', () => {
  const snapshot = JSON.stringify(items);
  for (const i of items) { GRAMMAR.check(i, 'мимо'); GRAMMAR.validate(i); }
  for (const id of BLOCKS) { GRAMMAR.pick(id, 5, { seed: 1 }); GRAMMAR.pick(id, 5, { seed: 2 }); }
  assert.equal(JSON.stringify(items), snapshot, 'банк изменился после работы движка');
});
t('выборка по seed воспроизводима и берёт только свой блок', () => {
  for (const id of BLOCKS) {
    const a = GRAMMAR.pick(id, 6, { seed: 42 }).map(i => i.id);
    const b = GRAMMAR.pick(id, 6, { seed: 42 }).map(i => i.id);
    assert.deepEqual(a, b, id + ': выборка не воспроизводится');
    assert.equal(a.length, 6, id + ': выбрано ' + a.length);
    for (const x of a) assert.equal(x.slice(0, id.length), id, id + ': в выборку попало ' + x);
  }
});

console.log('gram-b2: пройдено проверок ' + n + ', заданий ' + items.length + ', блоков ' + BLOCKS.length +
  ', по форматам ' + GRAMMAR.FORMATS.map(f => f + '=' + items.filter(i => i.format === f).length).join(' '));
if (process.exitCode) console.log('есть FAIL — банк не готов');
