/* Банк грамматики HSK 3 (b3-01…b3-16): покрытие блоков, форматы, лексика уровня,
   единственность ключа, метки ловушек, разнообразие каркасов и чистота пересчёта. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src', 'js');

global.window = global;
for (const f of ['program', 'hsk', 'freq']) require('../src/js/' + f + '.js');
/* банк объявлен ДО движка — движок обязан его подобрать сам */
require('../src/js/gram-b3.js');
require('../src/js/grammar.js');
const { PROGRAM, HSK, GRAMMAR, GRAM_BANKS } = global;

let ok = 0, bad = 0;
const t = (name, fn) => { try { fn(); ok++; } catch (e) { bad++; console.error('FAIL', name, e.message); process.exitCode = 1; } };

const CJK = /[一-鿿]/;
const LATIN = /[A-Za-z]/;
const BLOCKS = PROGRAM.byLevel(3);
const BANK = (GRAM_BANKS || []).find(b => b && b.lvl === 3 && Array.isArray(b.items));
const ITEMS = BANK ? BANK.items : [];
const byBlock = id => ITEMS.filter(i => i.blockId === id);
/* снимок банка: любая мутация за прогон будет видна */
const snapshot = () => JSON.stringify(ITEMS);
const before = snapshot();

/* китайские поля задания — всё, что ученик увидит или услышит */
function zhFields(it) {
  const keys = (Array.isArray(it.key) ? it.key : [it.key]).filter(k => typeof k === 'string');
  return [it.stem, it.tts]
    .concat(Array.isArray(it.tokens) ? it.tokens : [])
    .concat((it.options || []).map(o => o && o.text))
    .concat(keys)
    .filter(s => typeof s === 'string');
}

t('банк зарегистрирован как уровень 3', () => {
  assert.ok(Array.isArray(GRAM_BANKS), 'window.GRAM_BANKS не массив');
  assert.ok(BANK, 'банк уровня 3 не найден в GRAM_BANKS');
  assert.ok(ITEMS.length >= 8 * BLOCKS.length, 'заданий меньше, чем 8 на блок: ' + ITEMS.length);
  assert.equal(typeof window.GRAM_B3, 'undefined', 'банк не должен заводить своё глобальное имя');
});

t('движок подобрал банк целиком', () => {
  const mine = new Set(ITEMS.map(i => i.id));
  const seen = GRAMMAR.forLevel(3).filter(i => mine.has(i.id));
  assert.equal(seen.length, ITEMS.length, 'движок видит не все задания банка');
});

t('каждый блок HSK 3 покрыт и все форматы на месте', () => {
  assert.equal(BLOCKS.length, 16, 'в программе не 16 блоков третьего уровня');
  for (const b of BLOCKS) {
    const mine = byBlock(b.id);
    assert.ok(mine.length >= 8, b.id + ': заданий ' + mine.length + ', нужно не меньше 8');
    const c = {};
    for (const i of mine) c[i.format] = (c[i.format] || 0) + 1;
    for (const f of GRAMMAR.FORMATS) assert.ok(c[f] > 0, b.id + ': нет формата ' + f);
    assert.ok(c.choice >= 3, b.id + ': choice ' + c.choice + ', нужно 3');
    assert.ok(c.fix >= 2, b.id + ': fix ' + c.fix + ', нужно 2');
    assert.ok(c.fill >= 2, b.id + ': fill ' + c.fill + ', нужно 2');
    assert.ok(c.order >= 1, b.id + ': order ' + c.order + ', нужно 1');
  }
});

t('блоков чужого уровня в банке нет', () => {
  const own = new Set(BLOCKS.map(b => b.id));
  for (const i of ITEMS) {
    assert.ok(own.has(i.blockId), i.id + ': блок не из третьего уровня — ' + i.blockId);
    assert.equal(i.lvl, 3, i.id + ': уровень не 3');
  }
});

t('id уникальны и привязаны к своему блоку', () => {
  const seen = new Set();
  for (const i of ITEMS) {
    assert.ok(/^b3-\d\d\.g\.\d\d$/.test(i.id), 'id не по форме <blockId>.g.<NN>: ' + i.id);
    assert.equal(i.id.split('.')[0], i.blockId, i.id + ': id не совпадает с blockId');
    assert.ok(!seen.has(i.id), 'повтор id: ' + i.id);
    seen.add(i.id);
  }
});

t('лексика не выше третьего уровня', () => {
  /* независимый от движка банк знаков: слова программы до третьего уровня + HSK 1–3 */
  const allow = new Set();
  const add = s => { for (const ch of String(s)) if (CJK.test(ch)) allow.add(ch); };
  for (const b of PROGRAM.BLOCKS) if (b.lvl <= 3) add(b.w);
  for (let i = 1; i <= 3; i++) for (const r of (HSK[i] || [])) add(r[0]);
  /* служебного белого списка не требуется: всё нужное уже есть в словарях уровня */
  const WHITE = new Set();
  assert.ok(allow.size > 500, 'словарь уровня собрался подозрительно маленьким: ' + allow.size);
  const over = [];
  for (const it of ITEMS) {
    for (const f of zhFields(it)) {
      for (const ch of f) if (CJK.test(ch) && !allow.has(ch) && !WHITE.has(ch)) over.push(it.id + ':' + ch);
    }
  }
  assert.deepEqual(over, [], 'знаки выше уровня 3');
});

t('в китайских полях нет латиницы, в tts нет пропусков', () => {
  for (const it of ITEMS) {
    for (const f of zhFields(it).filter(s => s !== it.stem)) {
      assert.ok(!LATIN.test(f), it.id + ': латиница в «' + f + '»');
    }
    assert.ok(!LATIN.test(it.stem), it.id + ': латиница в стеме');
    assert.ok(!/_/.test(it.tts), it.id + ': пропуск остался в tts');
    assert.ok(CJK.test(it.tts), it.id + ': в tts нет иероглифов');
    assert.ok(/[。？！]$/.test(it.tts), it.id + ': tts без китайского знака конца фразы');
    assert.ok(!/ /.test(it.tts), it.id + ': пробел между иероглифами в tts');
  }
});

t('ключ единственный: среди дистракторов его нет, у каждого есть ловушка', () => {
  const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  for (const it of ITEMS.filter(i => i.format === 'choice')) {
    const keys = (Array.isArray(it.key) ? it.key : [it.key]).map(GRAMMAR.norm);
    const opts = it.options || [];
    assert.ok(opts.length >= 3 && opts.length <= 4, it.id + ': вариантов ' + opts.length);
    const hits = opts.filter(o => keys.indexOf(GRAMMAR.norm(o.text)) >= 0);
    assert.equal(hits.length, 1, it.id + ': верный вариант должен быть ровно один');
    const texts = opts.map(o => GRAMMAR.norm(o.text));
    assert.equal(new Set(texts).size, texts.length, it.id + ': варианты повторяются');
    for (const o of opts.filter(o => keys.indexOf(GRAMMAR.norm(o.text)) < 0)) {
      assert.ok(typeof o.trap === 'string' && KEBAB.test(o.trap), it.id + ': плохая метка ловушки у «' + o.text + '»: ' + o.trap);
    }
  }
});

t('каталог ловушек не читает наши метки наизнанку', () => {
  /* метку, которую движок умеет разбирать, он обязан разобрать верно:
     сверяем, что в разборе стоят те же иероглифы, что и в самом задании */
  for (const it of ITEMS.filter(i => i.format === 'choice')) {
    for (const o of (it.options || [])) {
      if (!o.trap) continue;
      const info = GRAMMAR.trapInfo(o.trap);
      if (!info) continue;                       /* каталог метку не знает — это не ошибка */
      const zh = (info.ru.match(/[一-鿿]+/g) || []);
      if (!zh.length) continue;                  /* разбор без иероглифов (глагол, счётное слово…) */
      assert.ok(zh.some(w => GRAMMAR.norm(o.text).indexOf(GRAMMAR.norm(w)) >= 0),
        it.id + ': ловушка «' + o.trap + '» читается как «' + info.ru + '», а вариант — «' + o.text + '»');
    }
  }
});

t('why и l1 по-русски и по делу', () => {
  const CYR = /[А-Яа-яЁё]/;
  for (const it of ITEMS) {
    for (const f of ['why', 'l1']) {
      assert.ok(typeof it[f] === 'string' && it[f].trim().length >= 20, it.id + ': ' + f + ' слишком короткое');
      assert.ok(CYR.test(it[f]), it.id + ': ' + f + ' не по-русски');
    }
    assert.notEqual(it.why.trim(), it.l1.trim(), it.id + ': why и l1 совпадают');
  }
});

t('каркасы предложений не повторяются больше двух раз на блок', () => {
  /* каркас: фраза без слов самого блока — если два задания отличаются только
     подставленным словом, каркас у них совпадёт */
  const skeleton = (it, block) => {
    let f = GRAMMAR.norm(it.format === 'choice' || it.format === 'fill' ? it.stem : it.tts);
    const ws = block.words.filter(w => CJK.test(w)).slice().sort((a, b) => b.length - a.length);
    for (const w of ws) f = f.split(GRAMMAR.norm(w)).join('*');
    return f.replace(/\*+/g, '*');
  };
  for (const b of BLOCKS) {
    const count = {};
    for (const it of byBlock(b.id)) {
      const s = skeleton(it, b);
      count[s] = (count[s] || 0) + 1;
      assert.ok(count[s] <= 2, b.id + ': каркас «' + s + '» встречается ' + count[s] + ' раз');
    }
  }
});

t('длины предложений в блоке разные', () => {
  for (const b of BLOCKS) {
    const len = byBlock(b.id).map(i => [...i.tts].filter(c => CJK.test(c)).length);
    assert.ok(new Set(len).size >= 3, b.id + ': всего ' + new Set(len).size + ' разных длин');
    assert.ok(Math.max(...len) - Math.min(...len) >= 3, b.id + ': предложения одинаковой длины');
  }
});

t('сложности разведены: в каждом блоке есть и лёгкое, и трудное', () => {
  for (const b of BLOCKS) {
    const d = byBlock(b.id).map(i => GRAMMAR.diffOf(i.diff));
    assert.ok(d.every(Boolean), b.id + ': неизвестная сложность');
    assert.ok(new Set(d).size >= 2, b.id + ': все задания одной сложности');
  }
});

t('GRAMMAR.validate: ноль нарушений по всему банку', () => {
  const problems = GRAMMAR.audit(ITEMS);
  assert.deepEqual(problems, [], JSON.stringify(problems, null, 1));
});

t('судья принимает ключ и отвергает дистракторы', () => {
  for (const it of ITEMS) {
    const keys = Array.isArray(it.key) ? it.key : [it.key];
    if (it.format === 'choice' || it.format === 'fill') {
      for (const k of keys) assert.ok(GRAMMAR.check(it, k).ok, it.id + ': ключ «' + k + '» не принят');
      for (const o of (it.options || [])) {
        if (keys.map(GRAMMAR.norm).indexOf(GRAMMAR.norm(o.text)) >= 0) continue;
        const r = GRAMMAR.check(it, o.text);
        assert.equal(r.ok, false, it.id + ': дистрактор «' + o.text + '» принят за верный');
        assert.equal(r.trap, o.trap, it.id + ': судья потерял метку ловушки');
      }
    } else if (it.format === 'fix') {
      for (const k of keys) assert.ok(GRAMMAR.check(it, k).ok, it.id + ': ключ не принят');
      const wrong = it.tokens.map((_, i) => i).filter(i => keys.indexOf(i) < 0);
      for (const i of wrong) assert.equal(GRAMMAR.check(it, i).ok, false, it.id + ': токен ' + i + ' принят за ошибочный');
    } else if (it.format === 'order') {
      for (const k of keys) assert.ok(GRAMMAR.check(it, k).ok, it.id + ': порядок «' + k + '» не принят');
      const rev = it.tokens.slice().reverse();
      if (GRAMMAR.norm(rev.join('')) !== GRAMMAR.norm(keys[0])) {
        assert.equal(GRAMMAR.check(it, rev).ok, false, it.id + ': обратный порядок принят');
      }
    }
  }
});

t('вердикт не зависит от порядка проверок', () => {
  const pairs = [];
  for (const it of ITEMS) {
    const keys = Array.isArray(it.key) ? it.key : [it.key];
    pairs.push([it, keys[0]]);
    for (const o of (it.options || [])) pairs.push([it, o.text]);
  }
  const straight = pairs.map(([it, g]) => JSON.stringify(GRAMMAR.check(it, g)));
  const order = pairs.map((_, i) => i).sort((a, b) => ((a * 7919) % 101) - ((b * 7919) % 101));
  for (const i of order) {
    const [it, g] = pairs[i];
    assert.equal(JSON.stringify(GRAMMAR.check(it, g)), straight[i], pairs[i][0].id + ' вне очереди');
  }
});

t('пересчёт с нуля даёт тот же банк', () => {
  const was = GRAMMAR.forLevel(3).map(i => i.id).join(',');
  GRAMMAR.reload();
  assert.equal(GRAMMAR.forLevel(3).map(i => i.id).join(','), was, 'повторная сборка дала другой банк');
  assert.deepEqual(GRAMMAR.audit(ITEMS), [], 'после пересборки появились нарушения');
});

t('порядок загрузки не важен: движок первым, банк вторым', () => {
  const code = [
    'global.window = global;',
    "for (const f of ['program','hsk','freq','grammar','gram-b3']) require(" + JSON.stringify(SRC) + " + '/' + f + '.js');",
    'GRAMMAR.reload();',
    "process.stdout.write(String(GRAMMAR.forLevel(3).filter(i => /^b3-/.test(i.blockId)).length) + ' ' + GRAMMAR.audit().length);",
  ].join('\n');
  const out = execFileSync(process.execPath, ['-e', code], { encoding: 'utf8' }).trim().split(' ');
  assert.equal(+out[0], ITEMS.length, 'при обратном порядке загрузки банк подобран не целиком');
  assert.equal(+out[1], 0, 'при обратном порядке загрузки появились нарушения');
});

t('банк не изменился за весь прогон', () => {
  assert.equal(snapshot(), before, 'задания мутировали');
});

console.log(bad
  ? `SOME TESTS FAILED: ${bad} провал(ов), ${ok} пройдено`
  : `gram-b3: ${ok} проверок пройдено, 0 FAIL (${ITEMS.length} заданий, ${BLOCKS.length} блоков)`);
