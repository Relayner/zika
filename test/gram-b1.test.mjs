/* Проверка банка грамматических заданий уровня 1: покрытие блоков, форматы, лексика, ловушки,
   согласие со схемой grammar.js. Запуск: node test/gram-b1.test.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
global.window = global;
const SRC = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'src', 'js');
const has = f => fs.existsSync(path.join(SRC, f));
const load = f => require(path.join(SRC, f));

for (const f of ['hsk.js', 'pinyin.js', 'program.js']) load(f);
load('gram-b1.js');
/* grammar.js пишется параллельно: если он уже есть, прогоняем его валидатор.
   Порядок как в build.mjs — банки загружаются до движка. */
if (has('grammar.js')) load('grammar.js');
const { HSK, PROGRAM, GRAM_BANKS, GRAMMAR } = global;

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL', name, e.message); process.exitCode = 1; } };

const bank = (GRAM_BANKS || []).filter(b => b.lvl === 1);
const items = bank.flatMap(b => b.items || []);
const blocks = PROGRAM.BLOCKS.filter(b => b.lvl === 1);
const byBlock = id => items.filter(i => i.blockId === id);

/* ── словарь уровня: HSK 1 + слова блоков + служебные морфемы ─────────────── */
const VOCAB = new Set();
for (const [h] of HSK[1]) VOCAB.add(h);
for (const b of blocks) for (const w of b.words || []) VOCAB.add(w);
/* 没 — отрицательная частица, отдельная от словарной статьи 没有 */
const SERVICE = ['没'];
for (const w of SERVICE) VOCAB.add(w);
const MAXLEN = Math.max(...[...VOCAB].map(w => w.length));
const isHan = c => /[一-鿿]/.test(c);
/* самое длинное совпадение со словарём уровня, начиная с позиции i */
function longest(s, i) {
  for (let L = Math.min(MAXLEN, s.length - i); L >= 1; L--) if (VOCAB.has(s.slice(i, i + L))) return s.slice(i, i + L);
  return '';
}
/* Жадная сегментация: возвращает иероглифы, не покрытые словарём уровня */
function outOfLevel(s) {
  const bad = [];
  for (let i = 0; i < s.length;) {
    if (!isHan(s[i])) { i++; continue; }
    const w = longest(s, i);
    if (w) i += w.length; else { bad.push(s[i]); i++; }
  }
  return bad;
}

/* Каркас предложения: содержательные слова стираются, служебные остаются.
   Два задания с одним каркасом — это одна и та же рамка с подстановкой слова. */
const FUNC = new Set(['我', '你', '他', '她', '我们', '的', '是', '不', '没', '没有', '了', '吗', '呢', '很', '太',
  '都', '和', '在', '有', '个', '本', '块', '些', '一点儿', '想', '会', '能', '去', '来', '回', '这', '那', '哪',
  '哪儿', '什么', '谁', '几', '多少', '怎么', '怎么样', '上', '下', '里', '请',
  '一', '二', '三', '四', '五', '六', '七', '八', '九', '十']);
function skeleton(s) {
  let out = '';
  for (let i = 0; i < s.length;) {
    if (!isHan(s[i])) { out += s[i]; i++; continue; }
    const w = longest(s, i) || s[i];
    out += FUNC.has(w) ? w : '□';
    i += w.length;
  }
  return out;
}

const FORMATS = ['choice', 'fix', 'fill', 'order'];
const DIFFS = ['easy', 'mid', 'hard'];
const MIN = { choice: 3, fix: 2, fill: 2, order: 1 };
const dropPunct = s => s.replace(/[^一-鿿]/g, '');
/* Метки ловушек движок разбирает на атомы и объясняет по-русски. Исключение — формулы
   вежливости: атомов 不客气 / 没关系 / 对不起 в каталоге нет, метка остаётся говорящей для человека. */
const TRAP_FREE = new Set(['meiguanxi-for-bukeqi', 'duibuqi-for-bukeqi', 'zaijian-for-bukeqi',
  'bukeqi-for-meiguanxi', 'xiexie-for-meiguanxi', 'wei-for-meiguanxi']);

t('банк зарегистрирован', () => {
  assert.ok(Array.isArray(GRAM_BANKS), 'GRAM_BANKS не массив');
  assert.equal(bank.length, 1, 'ожидается ровно один банк уровня 1');
  assert.ok(items.length >= 80, 'мало заданий: ' + items.length);
});

t('все блоки уровня 1 покрыты', () => {
  assert.equal(blocks.length, 10, 'блоков уровня 1 должно быть 10');
  for (const b of blocks) assert.ok(byBlock(b.id).length >= 8, b.id + ': заданий ' + byBlock(b.id).length);
  const known = new Set(blocks.map(b => b.id));
  for (const i of items) assert.ok(known.has(i.blockId), 'чужой blockId ' + i.blockId);
});

t('в каждом блоке есть все форматы', () => {
  for (const b of blocks) {
    const list = byBlock(b.id);
    for (const f of FORMATS) {
      const k = list.filter(i => i.format === f).length;
      assert.ok(k >= MIN[f], b.id + ': ' + f + ' = ' + k + ', нужно ' + MIN[f]);
    }
  }
});

t('id уникальны и согласованы', () => {
  const seen = new Set();
  for (const i of items) {
    assert.ok(!seen.has(i.id), 'дубль id ' + i.id);
    seen.add(i.id);
    assert.match(i.id, /^b1-\d\d\.g\.\d\d$/, 'форма id ' + i.id);
    assert.equal(i.id.slice(0, 5), i.blockId, 'id не совпадает с blockId ' + i.id);
    assert.equal(i.lvl, 1, 'lvl ' + i.id);
  }
});

/* Демонстрационный набор grammar.js занимает часть номеров: совпадение id молча
   выкинуло бы наше задание из GRAMMAR.ITEMS */
t('id не конфликтуют с демонстрационным набором grammar.js', () => {
  if (!GRAMMAR || !Array.isArray(GRAMMAR.DEMO)) return;
  const demo = new Set(GRAMMAR.DEMO.map(i => i.id));
  for (const i of items) assert.ok(!demo.has(i.id), 'id занят демонстрацией grammar.js: ' + i.id);
  const inEngine = new Set((GRAMMAR.ITEMS || []).map(i => i.id));
  for (const i of items) assert.ok(inEngine.has(i.id), 'задание не попало в GRAMMAR.ITEMS: ' + i.id);
});

t('обязательные поля на месте', () => {
  for (const i of items) {
    assert.ok(FORMATS.includes(i.format), 'формат ' + i.id);
    assert.ok(DIFFS.includes(i.diff), i.id + ': сложность ' + i.diff);
    for (const f of ['stem', 'why', 'l1', 'tts']) {
      assert.ok(typeof i[f] === 'string' && i[f].trim(), i.id + ': пустое поле ' + f);
    }
    assert.ok(i.key !== undefined && i.key !== null && i.key !== '', i.id + ': пустой ключ');
    for (const f of ['why', 'l1']) assert.match(i[f], /[а-яё]/i, i.id + ': ' + f + ' без русского текста');
  }
});

t('пропуск стоит там, где нужен', () => {
  for (const i of items) {
    const gaps = (i.stem.match(/_+/g) || []).length;
    if (i.format === 'choice' || i.format === 'fill') {
      assert.equal(gaps, 1, i.id + ': пропусков ' + gaps + ', нужен один');
      assert.equal(i.stem.replace('___', i.key), i.tts, i.id + ': подстановка ключа не даёт tts');
    } else {
      assert.equal(gaps, 0, i.id + ': в этом формате пропуска быть не должно');
    }
  }
});

t('fix: стем разобран на куски, ключ указывает на неверный', () => {
  for (const i of items.filter(x => x.format === 'fix')) {
    assert.ok(Array.isArray(i.tokens) && i.tokens.length >= 2, i.id + ': нужны токены');
    assert.equal(dropPunct(i.stem), i.tokens.join(''), i.id + ': стем не совпадает со склейкой токенов');
    assert.ok(Number.isInteger(i.key) && i.key >= 0 && i.key < i.tokens.length, i.id + ': ключ вне токенов');
    assert.notEqual(dropPunct(i.stem), dropPunct(i.tts), i.id + ': исправлять нечего');
    i.tokens.forEach((tok, k) => {
      if (k === i.key) return;
      assert.ok(i.tts.includes(tok), i.id + ': tts потерял верный кусок «' + tok + '»');
    });
  }
});

t('варианты: ключ единственный, у ловушек есть trap', () => {
  for (const i of items) {
    if (i.format !== 'choice') { assert.equal(i.options, undefined, i.id + ': options не нужны'); continue; }
    assert.ok(Array.isArray(i.options) && i.options.length >= 3 && i.options.length <= 4, i.id + ': вариантов должно быть 3–4');
    const keys = i.options.filter(o => o.text === i.key);
    assert.equal(keys.length, 1, i.id + ': ключ встречается ' + keys.length + ' раз(а) среди вариантов');
    const texts = i.options.map(o => o.text);
    assert.equal(new Set(texts).size, texts.length, i.id + ': повторяющиеся варианты');
    for (const o of i.options) {
      if (o.text === i.key) { assert.equal(o.trap, undefined, i.id + ': у ключа не должно быть trap'); continue; }
      assert.ok(typeof o.trap === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(o.trap),
        i.id + ': метка ловушки не kebab-именем из атомов: «' + o.trap + '»');
    }
  }
});

t('tts — чистое китайское предложение', () => {
  for (const i of items) {
    assert.ok(!i.tts.includes('_'), i.id + ': пропуск в tts');
    assert.ok(!/[A-Za-z]/.test(i.tts), i.id + ': латиница в tts');
    assert.ok(!/[а-яё]/i.test(i.tts), i.id + ': кириллица в tts');
    assert.ok(!/\s/.test(i.tts), i.id + ': пробелы в tts');
    assert.ok(!/[,.?!;:]/.test(i.tts), i.id + ': латинская пунктуация в tts');
    assert.match(i.tts, /[。？！]$/, i.id + ': tts без китайской точки в конце');
    assert.ok(/^[一-鿿。？！，]+$/.test(i.tts), i.id + ': посторонние знаки в tts');
  }
});

t('лексика не выше уровня блока', () => {
  for (const i of items) {
    const parts = [i.tts, i.stem.replace(/_+/g, ''), ...(i.tokens || []), ...(i.options || []).map(o => o.text)];
    if (typeof i.key === 'string') parts.push(i.key);
    for (const p of parts) {
      const bad = outOfLevel(p);
      assert.equal(bad.length, 0, i.id + ': вне HSK 1 — ' + bad.join('') + ' в «' + p + '»');
    }
  }
});

t('куски для сборки складываются в ключ', () => {
  for (const i of items.filter(x => x.format === 'order')) {
    assert.ok(Array.isArray(i.tokens) && i.tokens.length >= 3, i.id + ': нужно не меньше трёх кусков');
    const plain = dropPunct(i.key);
    const joined = i.tokens.join('');
    assert.equal(joined.length, plain.length, i.id + ': длина кусков не совпадает с предложением');
    assert.equal([...joined].sort().join(''), [...plain].sort().join(''), i.id + ': куски не складываются в ключ');
    for (const tok of i.tokens) assert.ok(plain.includes(tok), i.id + ': кусок «' + tok + '» не из предложения');
    assert.equal(new Set(i.tokens).size, i.tokens.length, i.id + ': повторяющиеся куски');
    assert.notEqual(joined, plain, i.id + ': куски даны в готовом порядке');
    assert.equal(i.tts, i.key, i.id + ': tts должен быть собранным предложением');
  }
});

t('каркасы предложений не повторяются больше двух раз на блок', () => {
  for (const b of blocks) {
    const cnt = {};
    for (const i of byBlock(b.id)) {
      const s = skeleton(i.tts);
      cnt[s] = (cnt[s] || 0) + 1;
      assert.ok(cnt[s] <= 2, b.id + ': каркас «' + s + '» встречается ' + cnt[s] + ' раз');
    }
  }
});

t('предложения не дублируются', () => {
  const seen = new Map();
  for (const i of items) {
    assert.ok(!seen.has(i.tts), 'повтор предложения ' + i.tts + ' (' + seen.get(i.tts) + ' и ' + i.id + ')');
    seen.set(i.tts, i.id);
  }
});

t('судья grammar.js принимает верный ответ и ловит ловушку', () => {
  if (!GRAMMAR || typeof GRAMMAR.check !== 'function') return;
  for (const i of items) {
    const right = i.format === 'order' ? i.key : i.key;
    assert.equal(GRAMMAR.check(i, right).ok, true, i.id + ': верный ответ не засчитан');
    if (i.format === 'choice') {
      const wrong = i.options.find(o => o.text !== i.key);
      const r = GRAMMAR.check(i, wrong.text);
      assert.equal(r.ok, false, i.id + ': ловушка засчитана как верный ответ');
      assert.equal(r.trap, wrong.trap, i.id + ': судья не вернул метку ловушки');
      if (!TRAP_FREE.has(wrong.trap)) assert.ok(r.trapWhy, i.id + ': судья не объяснил ловушку ' + wrong.trap);
    }
  }
});

/* Банк — чистые данные: результат не зависит от порядка и числа загрузок */
t('повторная загрузка даёт тот же банк', () => {
  const before = JSON.stringify(items);
  const file = path.join(SRC, 'gram-b1.js');
  delete require.cache[require.resolve(file)];
  const saved = global.GRAM_BANKS;
  global.GRAM_BANKS = undefined;
  const keysBefore = new Set(Object.keys(global));
  require(file);
  const again = (global.GRAM_BANKS || []).filter(b => b.lvl === 1).flatMap(b => b.items || []);
  assert.equal(JSON.stringify(again), before, 'банк изменился при повторной загрузке');
  const extra = Object.keys(global).filter(k => !keysBefore.has(k) && k !== 'GRAM_BANKS');
  assert.deepEqual(extra, [], 'модуль создал лишние глобальные имена: ' + extra.join(', '));
  global.GRAM_BANKS = saved;
});

t('GRAMMAR.validate: ноль нарушений', () => {
  if (!GRAMMAR || typeof GRAMMAR.validate !== 'function') return;
  const bad = [];
  for (const i of items) {
    const problems = GRAMMAR.validate(i);
    if (problems && problems.length) bad.push(i.id + ': ' + problems.join('; '));
  }
  assert.deepEqual(bad, [], 'нарушения схемы:\n  ' + bad.slice(0, 8).join('\n  '));
});

t('движок объясняет каждую метку ловушки', () => {
  if (!GRAMMAR || typeof GRAMMAR.trapInfo !== 'function') return;
  const dumb = [];
  for (const i of items) for (const o of i.options || []) {
    if (!o.trap || TRAP_FREE.has(o.trap)) continue;
    const info = GRAMMAR.trapInfo(o.trap);
    if (!info || !info.ru) dumb.push(i.id + ': ' + o.trap);
  }
  assert.deepEqual(dumb, [], 'метки, которые движок не читает: ' + dumb.join(', '));
});

const perBlock = blocks.map(b => b.id + ':' + byBlock(b.id).length).join(' ');
const fmt = FORMATS.map(f => f + ' ' + items.filter(i => i.format === f).length).join(', ');
console.log('заданий ' + items.length + ' — ' + perBlock);
console.log('форматы: ' + fmt);
console.log('проверок пройдено: ' + n + (process.exitCode ? ' (есть FAIL)' : ', FAIL: 0'));
