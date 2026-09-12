/* Проверка банка грамматики HSK 4 (src/js/gram-b4.js).
   Всё здесь — чистые проверки от данных банка: ничего не мутируем, порядок загрузки роли не играет. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
global.window = global;

/* Порядок загрузки намеренно «неудобный»: движок раньше банка — банк обязан доехать через reload(). */
for (const f of ['program', 'hsk', 'freq']) require('../src/js/' + f + '.js');
const hasEngine = fs.existsSync(new URL('../src/js/grammar.js', import.meta.url));
if (hasEngine) require('../src/js/grammar.js');
require('../src/js/gram-b4.js');

const { PROGRAM, HSK, FREQ, GRAM_BANKS } = global;
const GRAMMAR = global.GRAMMAR || null;
if (GRAMMAR) GRAMMAR.reload();   /* движок загрузился раньше банка — банк обязан доехать через reload() */

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL', name, e.message); process.exitCode = 1; } };
const fail = [];
const bad = (msg) => { fail.push(msg); };

/* ── банк ── */
const banks = Array.isArray(GRAM_BANKS) ? GRAM_BANKS : [];
const bank4 = banks.find(b => b && b.lvl === 4);
const items = bank4 && Array.isArray(bank4.items) ? bank4.items : [];
const blocks = PROGRAM.byLevel(4);

const CJK = /[一-鿿]/;
const LATIN = /[A-Za-z]/;
const DROP = /[\s_·，。？！、；：（）《》「」“”‘’…—,.?!;:()[\]{}<>'"-]/g;
const norm = v => String(v == null ? '' : v).replace(DROP, '').toLowerCase();
const list = v => (Array.isArray(v) ? v : [v]).filter(x => x !== undefined && x !== null && x !== '');
const FORMATS = ['choice', 'fix', 'fill', 'order'];

t('банк уровня 4 зарегистрирован', () => {
  assert.ok(bank4, 'в window.GRAM_BANKS нет записи с lvl: 4');
  assert.ok(items.length >= blocks.length * 8, 'заданий ' + items.length + ', нужно не меньше ' + blocks.length * 8);
});

/* ── лексикон уровня: строится независимо от движка, по HSK 1..3 + FREQ (HSK 4) + словам программы ── */
const LEX = (() => {
  const set = new Set();
  const add = s => { for (const ch of String(s)) if (CJK.test(ch)) set.add(ch); };
  for (const b of PROGRAM.BLOCKS) if (b.lvl <= 4) add(b.w);
  for (let i = 1; i <= 3; i++) for (const r of (HSK[i] || [])) add(r[0]);
  for (const r of (FREQ || [])) add(r[0]);
  return set;
})();
/* служебные знаки, которых нет в словарных списках, но без них предложения не строятся */
const WHITELIST = new Set(['们', '儿', '着', '过', '把', '被', '得', '地', '的', '了', '吗', '呢', '吧', '啊']);
const allowed = ch => LEX.has(ch) || WHITELIST.has(ch);

t('лексикон собрался', () => assert.ok(LEX.size > 800, 'лексикон подозрительно мал: ' + LEX.size));

/* китайские поля задания */
const zhFields = it => [it.stem, it.tts]
  .concat(Array.isArray(it.tokens) ? it.tokens : [])
  .concat((Array.isArray(it.options) ? it.options : []).map(o => o && o.text))
  .concat(list(it.key).filter(k => typeof k === 'string'))
  .filter(v => typeof v === 'string');

/* ── поштучная проверка ── */
const byBlock = {};
const ids = new Set();
for (const it of items) {
  const id = it && it.id;
  const at = 'задание ' + id;
  if (!it || typeof it !== 'object') { bad('в банке не объект'); continue; }
  if (!/^b4-\d\d\.g\.\d\d$/.test(String(id))) bad(at + ': id не по схеме <blockId>.g.<NN>');
  if (ids.has(id)) bad(at + ': повтор id'); else ids.add(id);
  if (it.lvl !== 4) bad(at + ': lvl должен быть 4');
  const block = PROGRAM.byId(it.blockId);
  if (!block || block.lvl !== 4) { bad(at + ': blockId не из уровня 4: ' + it.blockId); continue; }
  if (String(id).indexOf(it.blockId + '.g.') !== 0) bad(at + ': id не начинается с blockId');
  (byBlock[it.blockId] = byBlock[it.blockId] || []).push(it);

  if (FORMATS.indexOf(it.format) < 0) { bad(at + ': неизвестный формат ' + it.format); continue; }
  if (['easy', 'mid', 'hard'].indexOf(it.diff) < 0) bad(at + ': неизвестная сложность ' + it.diff);
  for (const f of ['stem', 'why', 'l1', 'tts']) {
    if (typeof it[f] !== 'string' || !it[f].trim()) bad(at + ': пустое поле ' + f);
  }

  /* пропуск в стеме */
  const gaps = (String(it.stem).match(/_+/g) || []).length;
  if (it.format === 'choice' || it.format === 'fill') {
    if (gaps !== 1) bad(at + ': пропусков в стеме ' + gaps + ', нужен ровно один');
  } else if (gaps) bad(at + ': в стеме формата ' + it.format + ' пропуска быть не должно');

  /* tts — готовое предложение */
  const tts = String(it.tts);
  if (/_/.test(tts)) bad(at + ': в tts остался пропуск');
  if (LATIN.test(tts)) bad(at + ': латиница в tts');
  if (!CJK.test(tts)) bad(at + ': в tts нет иероглифов');
  if (/[,.?!;:]/.test(tts)) bad(at + ': в tts латинская пунктуация');
  if (/\s/.test(tts)) bad(at + ': в tts пробелы между иероглифами');
  if (!/[。？！]$/.test(tts)) bad(at + ': tts не заканчивается китайским знаком конца предложения');

  /* лексика уровня */
  for (const f of zhFields(it)) {
    if (LATIN.test(f)) bad(at + ': латиница в китайском поле «' + f + '»');
    const out = [];
    for (const ch of f) if (CJK.test(ch) && !allowed(ch) && out.indexOf(ch) < 0) out.push(ch);
    if (out.length) bad(at + ': лексика выше уровня 4: ' + out.join('') + ' (в «' + f + '»)');
  }

  const keys = list(it.key);
  if (!keys.length) bad(at + ': пустой ключ');

  if (it.format === 'choice') {
    const opts = Array.isArray(it.options) ? it.options : [];
    if (opts.length < 3 || opts.length > 4) bad(at + ': вариантов ' + opts.length + ', нужно 3–4');
    let hits = 0;
    const seenText = new Set();
    for (const o of opts) {
      if (!o || typeof o.text !== 'string' || !o.text.trim()) { bad(at + ': пустой вариант'); continue; }
      if (seenText.has(norm(o.text))) bad(at + ': вариант «' + o.text + '» повторяется');
      seenText.add(norm(o.text));
      if (keys.some(k => norm(k) === norm(o.text))) hits++;
      else if (typeof o.trap !== 'string' || !o.trap.trim()) bad(at + ': у дистрактора «' + o.text + '» нет trap');
      else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(o.trap)) bad(at + ': странный идентификатор ловушки «' + o.trap + '»');
    }
    if (hits !== 1) bad(at + ': верный вариант встречается ' + hits + ' раз(а) среди options');
    if (!keys.some(k => norm(tts).indexOf(norm(k)) >= 0)) bad(at + ': tts не содержит верного ответа');
    /* подстановка ключа в пропуск должна давать ровно tts */
    const filled = norm(String(it.stem).replace(/_+/, keys[0]));
    if (filled !== norm(tts)) bad(at + ': стем с подставленным ключом не совпадает с tts');
  }

  if (it.format === 'fill') {
    if (!keys.every(k => typeof k === 'string' && k.trim())) bad(at + ': ключ fill должен быть строкой');
    if (!keys.some(k => norm(tts).indexOf(norm(k)) >= 0)) bad(at + ': tts не содержит ни одного варианта ключа');
    const filled = norm(String(it.stem).replace(/_+/, keys[0]));
    if (filled !== norm(tts)) bad(at + ': стем с подставленным ключом не совпадает с tts');
  }

  if (it.format === 'fix') {
    const toks = Array.isArray(it.tokens) ? it.tokens : [];
    if (toks.length < 2) bad(at + ': нужны токены предложения');
    if (norm(it.stem) !== norm(toks.join(''))) bad(at + ': стем не равен склейке токенов');
    const idx = keys.map(k => (typeof k === 'number' ? k : toks.findIndex(x => norm(x) === norm(k))));
    if (!idx.length || idx.some(i => !(i >= 0 && i < toks.length))) bad(at + ': ключ не указывает на токен');
    for (let i = 0; i < toks.length; i++) {
      if (idx.indexOf(i) < 0 && norm(tts).indexOf(norm(toks[i])) < 0) bad(at + ': tts потерял слово «' + toks[i] + '»');
    }
    if (norm(tts) === norm(it.stem)) bad(at + ': исправленное предложение совпадает с ошибочным');
    /* остальные слова обязаны остаться в исправленном предложении в том же относительном порядке:
       ошибочное слово либо заменяется, либо переезжает — всё прочее не шевелится */
    let pos = 0, brokenOrder = false;
    for (let i = 0; i < toks.length; i++) {
      if (idx.indexOf(i) >= 0) continue;
      const at2 = norm(tts).indexOf(norm(toks[i]), pos);
      if (at2 < 0) brokenOrder = true; else pos = at2 + norm(toks[i]).length;
    }
    if (brokenOrder) bad(at + ': слова кроме помеченного идут в tts в другом порядке — вероятно, указан не тот токен');
  }

  if (it.format === 'order') {
    const toks = Array.isArray(it.tokens) ? it.tokens : [];
    if (toks.length < 3) bad(at + ': кусков для сборки меньше трёх');
    if (CJK.test(it.stem)) bad(at + ': стем order должен быть заданием по-русски, без иероглифов');
    const base = toks.map(norm).sort().join('|');
    let ttsOk = false;
    for (const k of keys) {
      const pieces = Array.isArray(k) ? k : splitByTokens(k, toks);
      if (!pieces) { bad(at + ': допустимый порядок «' + k + '» не разбирается на куски'); continue; }
      if (pieces.map(norm).sort().join('|') !== base) bad(at + ': порядок «' + pieces.join('') + '» собран не из тех же кусков');
      if (norm(pieces.join('')) === norm(tts)) ttsOk = true;
    }
    if (!ttsOk) bad(at + ': tts не совпадает ни с одним допустимым порядком');
  }
}

function splitByTokens(s, tokens) {
  const src = norm(s);
  const toks = (tokens || []).map(x => ({ raw: x, n: norm(x) })).filter(x => x.n).sort((a, b) => b.n.length - a.n.length);
  const out = []; let i = 0;
  while (i < src.length) {
    const hit = toks.find(x => src.startsWith(x.n, i));
    if (!hit) return null;
    out.push(hit.raw); i += hit.n.length;
  }
  return out.length ? out : null;
}

t('поштучные проверки заданий', () => {
  for (const m of fail) console.error('FAIL', m);
  assert.equal(fail.length, 0, 'нарушений в заданиях: ' + fail.length);
});

/* ── покрытие блоков ── */
t('каждый блок уровня 4 закрыт по объёму и по форматам', () => {
  const problems = [];
  for (const b of blocks) {
    const got = byBlock[b.id] || [];
    if (got.length < 8) problems.push(b.id + ': заданий ' + got.length + ', нужно ≥8');
    const cnt = { choice: 0, fix: 0, fill: 0, order: 0 };
    for (const it of got) if (cnt[it.format] !== undefined) cnt[it.format]++;
    const need = { choice: 3, fix: 2, fill: 2, order: 1 };
    for (const f of FORMATS) if (cnt[f] < need[f]) problems.push(b.id + ': ' + f + ' ' + cnt[f] + ', нужно ≥' + need[f]);
  }
  for (const p of problems) console.error('FAIL покрытие', p);
  assert.equal(problems.length, 0, 'блоков с недобором: ' + problems.length);
});

/* ── скелеты предложений: один каркас с подстановкой слова — не больше двух раз на блок ── */
t('каркасы предложений не повторяются больше двух раз на блок', () => {
  const problems = [];
  for (const b of blocks) {
    const got = byBlock[b.id] || [];
    /* маскируем слова блока и ключевое слово правила — остаётся голый каркас */
    const rule = (b.g && b.g.t ? String(b.g.t) : '').match(/[一-鿿]+/g) || [];
    const mask = (b.words || []).concat(rule).filter(Boolean).sort((x, y) => y.length - x.length);
    const seen = {};
    for (const it of got) {
      let s = norm(it.tts);
      for (const w of mask) s = s.split(norm(w)).join('○');
      seen[s] = (seen[s] || 0) + 1;
      if (seen[s] === 3) problems.push(b.id + ': каркас «' + s + '» встречается больше двух раз');
    }
    const tts = got.map(it => norm(it.tts));
    if (new Set(tts).size !== tts.length) problems.push(b.id + ': два задания с одинаковым предложением');
  }
  for (const p of problems) console.error('FAIL каркас', p);
  assert.equal(problems.length, 0, 'повторов каркаса: ' + problems.length);
});

/* ── ловушки: у каждого дистрактора своя, осмысленная и не совпадает с ключом ── */
t('дистракторы помечены ловушками и не содержат ключа', () => {
  const problems = [];
  for (const it of items) {
    if (it.format !== 'choice') continue;
    const keys = list(it.key).map(norm);
    for (const o of it.options || []) {
      if (keys.indexOf(norm(o.text)) >= 0) continue;
      if (!o.trap) problems.push(it.id + ': дистрактор «' + o.text + '» без trap');
    }
  }
  for (const p of problems) console.error('FAIL ловушка', p);
  assert.equal(problems.length, 0, 'дистракторов без ловушки: ' + problems.length);
});

/* ── судья движка: ключ засчитывается, дистракторы — нет ── */
if (GRAMMAR) {
  t('GRAMMAR.check принимает ключ и отвергает дистракторы', () => {
    const problems = [];
    for (const it of items) {
      const keys = list(it.key);
      if (it.format === 'choice' || it.format === 'fill') {
        for (const k of keys) if (!GRAMMAR.check(it, k).ok) problems.push(it.id + ': ключ «' + k + '» не засчитан');
        for (const o of it.options || []) {
          if (keys.some(k => norm(k) === norm(o.text))) continue;
          const r = GRAMMAR.check(it, o.text);
          if (r.ok) problems.push(it.id + ': дистрактор «' + o.text + '» засчитан как верный');
          if (r.trap !== o.trap) problems.push(it.id + ': ловушка «' + o.text + '» не долетела до разбора');
        }
      } else if (it.format === 'fix') {
        for (const k of keys) if (!GRAMMAR.check(it, k).ok) problems.push(it.id + ': fix-ключ не засчитан');
        const wrong = (it.tokens || []).map((_, i) => i).filter(i => keys.indexOf(i) < 0);
        for (const i of wrong) if (GRAMMAR.check(it, i).ok) problems.push(it.id + ': лишний токен ' + i + ' засчитан');
      } else if (it.format === 'order') {
        for (const k of keys) if (!GRAMMAR.check(it, k).ok) problems.push(it.id + ': порядок «' + k + '» не засчитан');
        const rev = (it.tokens || []).slice().reverse().join('');
        const r = GRAMMAR.check(it, rev);
        if (r.ok && keys.every(k => norm(k) !== norm(rev))) problems.push(it.id + ': обратный порядок засчитан');
      }
    }
    for (const p of problems) console.error('FAIL судья', p);
    assert.equal(problems.length, 0, 'расхождений с движком: ' + problems.length);
  });

  t('GRAMMAR.validate не находит нарушений', () => {
    const rep = GRAMMAR.audit(items);
    for (const r of rep) console.error('FAIL validate', r.id, r.problems.join('; '));
    assert.equal(rep.length, 0, 'заданий с нарушениями: ' + rep.length);
  });

  t('банк доехал до движка независимо от порядка загрузки', () => {
    const lvl4 = GRAMMAR.forLevel(4);
    assert.ok(lvl4.length >= items.length, 'движок видит ' + lvl4.length + ' из ' + items.length);
    for (const b of blocks) assert.ok(GRAMMAR.forBlock(b.id).length >= 8, b.id + ': движок видит меньше восьми заданий');
  });
}

/* ── чистота: банк — данные, а не состояние ── */
t('разбор и выборка не трогают банк', () => {
  const before = JSON.stringify(items);
  if (GRAMMAR) {
    for (const it of items) GRAMMAR.check(it, list(it.key)[0]);
    for (const b of blocks) GRAMMAR.pick(b.id, 5, { seed: 7 });
    for (const it of items.slice(0, 20)) GRAMMAR.prepare(it, GRAMMAR.mulberry32(3));
  }
  assert.equal(JSON.stringify(items), before, 'банк изменился после работы движка');
});

t('результат не зависит от порядка перебора заданий', () => {
  if (!GRAMMAR) return;
  const straight = items.map(i => i.id + ':' + GRAMMAR.validate(i).length).sort().join('|');
  const rnd = GRAMMAR.mulberry32(42);
  const mixed = items.slice().sort(() => rnd() - 0.5).map(i => i.id + ':' + GRAMMAR.validate(i).length).sort().join('|');
  assert.equal(mixed, straight, 'перетасовка меняет вывод — где-то спрятано состояние');
  /* повторный разбор того же ответа даёт тот же результат */
  for (const it of items.slice(0, 30)) {
    const a = JSON.stringify(GRAMMAR.check(it, list(it.key)[0]));
    const bb = JSON.stringify(GRAMMAR.check(it, list(it.key)[0]));
    assert.equal(a, bb, it.id + ': разбор не воспроизводится');
  }
});

const perBlock = blocks.map(b => (byBlock[b.id] || []).length);
console.log('блоков: ' + blocks.length + ', заданий: ' + items.length +
  ' (мин/макс на блок: ' + Math.min(...perBlock) + '/' + Math.max(...perBlock) + ')');
console.log(process.exitCode ? 'SOME TESTS FAILED' : 'gram-b4: ' + n + ' групп проверок пройдено, 0 FAIL');
