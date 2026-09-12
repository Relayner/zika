/* Каталог ловушек: проверка содержания и чистоты. node test/traps.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
global.window = global;
for (const f of ['hsk', 'freq', 'pinyin', 'phonetics', 'traps']) require('../src/js/' + f + '.js');
const { TRAPS, Pinyin, HSK, FREQ, PHON } = global;

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL', name, e.message); process.exitCode = 1; } };

/* Банк собираем сами из источника — проверяем модуль против словаря, а не против его же выводов */
const bank = new Map();
[1, 2, 3].forEach(l => HSK[l].forEach(e => { if (!bank.has(e[0])) bank.set(e[0], { hanzi: e[0], pinyin: e[1], ru: e[2], lvl: l }); }));
FREQ.forEach(e => { if (!bank.has(e[0])) bank.set(e[0], { hanzi: e[0], pinyin: e[1], ru: e[2], lvl: 4 }); });
const cards = Array.from(bank.values()).map(b => ({ id: 'hsk' + b.lvl + ':' + b.hanzi, hanzi: b.hanzi, pinyin: b.pinyin, ru: b.ru, deckId: 'hsk' + b.lvl }));
const card = h => cards.find(c => c.hanzi === h);
const letters = s => Pinyin.analyze(s).letters;
const sig = s => Pinyin.analyze(s).tones.join('');

/* ── каталог ── */
t('каталог непустой и разнообразный', () => {
  assert.ok(TRAPS.ALL.length > 100, 'ловушек всего ' + TRAPS.ALL.length);
  const kinds = new Set(TRAPS.ALL.map(x => x.kind));
  for (const k of ['tone', 'homo', 'glyph', 'init', 'fin', 'mw', 'gram', 'ru']) assert.ok(kinds.has(k), 'нет категории ' + k);
});
t('id уникальны во всём каталоге', () => {
  const seen = new Set();
  for (const x of TRAPS.ALL.concat(TRAPS.DOUBLES)) {
    assert.ok(!seen.has(x.id), 'дубль id ' + x.id);
    seen.add(x.id);
  }
});
t('у каждой ловушки есть имя, правило и сопоставление', () => {
  for (const x of TRAPS.ALL.concat(TRAPS.DOUBLES)) {
    assert.ok(x.id && x.kind && x.zh, 'пустые поля у ' + x.id);
    assert.ok(typeof x.ru === 'string' && x.ru.length >= 4, 'короткое имя у ' + x.id);
    assert.ok(typeof x.rule === 'string' && x.rule.length >= 20, 'нет правила у ' + x.id);
    assert.ok(typeof x.contrast === 'string' && x.contrast.length >= 30, 'нет contrast у ' + x.id);
    assert.ok(x.rule !== x.contrast, 'правило и contrast совпали у ' + x.id);
  }
});

/* ── тоны и омофоны выведены из словаря ── */
t('tone-пары различаются только тоном', () => {
  const list = TRAPS.byKind('tone').filter(x => x.items.length);
  assert.ok(list.length >= 40, 'тон-гнёзд мало: ' + list.length);
  for (const x of list) {
    assert.ok(x.items.length >= 2, 'одиночное гнездо ' + x.id);
    const ls = new Set(x.items.map(i => letters(i.pinyin)));
    assert.equal(ls.size, 1, 'разные буквы в ' + x.id + ': ' + Array.from(ls).join(','));
    assert.equal(Array.from(ls)[0], x.letters, 'letters не совпал с items у ' + x.id);
    const sigs = new Set(x.items.map(i => sig(i.pinyin)));
    assert.ok(sigs.size >= 2, 'одинаковые тоны в ' + x.id);
    const hs = new Set(x.items.map(i => i.hanzi));
    assert.equal(hs.size, x.items.length, 'повтор знака в ' + x.id);
    for (const i of x.items) {
      assert.ok(bank.has(i.hanzi), 'знака нет в банке: ' + i.hanzi + ' (' + x.id + ')');
      assert.equal(bank.get(i.hanzi).pinyin, i.pinyin, 'пиньинь разошёлся со словарём: ' + i.hanzi);
    }
  }
  const mai = TRAPS.byId('tone:mai');
  assert.ok(mai, 'нет гнезда mai');
  assert.deepEqual(mai.items.map(i => i.hanzi).sort(), ['买', '卖']);
});
t('омофоны совпадают и буквами, и тонами', () => {
  const list = TRAPS.byKind('homo').filter(x => x.items.length);
  assert.ok(list.length >= 20, 'омофонов мало: ' + list.length);
  for (const x of list) {
    const keys = new Set(x.items.map(i => letters(i.pinyin) + '|' + sig(i.pinyin)));
    assert.equal(keys.size, 1, 'звучание разошлось в ' + x.id);
    assert.ok(x.items.length >= 2, 'одиночный омофон ' + x.id);
    for (const i of x.items) assert.ok(bank.has(i.hanzi), 'знака нет в банке: ' + i.hanzi);
  }
  const zai = TRAPS.byId('homo:zai4');
  assert.ok(zai && zai.items.map(i => i.hanzi).includes('在') && zai.items.map(i => i.hanzi).includes('再'), 'нет пары 在/再');
});

/* ── похожие знаки ── */
t('glyph-пары целиком есть в банке карточек', () => {
  const list = TRAPS.byKind('glyph');
  assert.ok(list.length >= 25, 'пар мало: ' + list.length);
  for (const x of list) {
    assert.ok(x.chars.length >= 2, 'одиночная пара ' + x.id);
    assert.equal(new Set(x.chars).size, x.chars.length, 'повтор знака в ' + x.id);
    for (const h of x.chars) assert.ok(bank.has(h), 'в банке нет ' + h + ' (' + x.id + ')');
    for (const it of x.items) assert.equal(it.pinyin, bank.get(it.hanzi).pinyin, 'пиньинь разошёлся: ' + it.hanzi);
  }
  assert.ok(TRAPS.byId('glyph:买卖'), 'нет пары 买/卖');
  assert.ok(TRAPS.byId('glyph:他她它'), 'нет тройки 他/她/它');
});
t('doubles — это именно пары вне словаря', () => {
  assert.ok(TRAPS.DOUBLES.length >= 5, 'doubles мало: ' + TRAPS.DOUBLES.length);
  const ids = new Set(TRAPS.ALL.map(x => x.id));
  for (const x of TRAPS.DOUBLES) {
    assert.equal(x.outside, true, 'doubles без пометки: ' + x.id);
    assert.ok(!ids.has(x.id), 'double попал в ALL: ' + x.id);
    assert.ok(x.chars.some(h => !bank.has(h)), 'все знаки в банке, место не там: ' + x.id);
  }
});

/* ── инициали и финали ── */
t('инициали и финали взяты из PHON', () => {
  for (const [a, b] of PHON.CONFUSE) assert.ok(TRAPS.byId('init:' + a + '-' + b), 'нет ловушки init ' + a + '/' + b);
  for (const [a, b] of PHON.NG_PAIRS) assert.ok(TRAPS.byId('fin:' + a + '-' + b), 'нет ловушки fin ' + a + '/' + b);
});

/* ── счётные слова ── */
t('таблица счётных: не меньше 40 существительных, все из словаря', () => {
  const nouns = Object.keys(TRAPS.MW_OF);
  assert.ok(nouns.length >= 40, 'существительных мало: ' + nouns.length);
  for (const h of nouns) assert.ok(bank.has(h), 'существительного нет в банке: ' + h);
  const nonGe = nouns.filter(h => TRAPS.MW_OF[h] !== '个');
  assert.ok(nonGe.length >= 40, 'слов с не-个 счётным мало: ' + nonGe.length);
  assert.ok(new Set(nonGe.map(h => TRAPS.MW_OF[h])).size >= 10, 'счётных слов мало');
});
t('mwOf отвечает по таблице', () => {
  assert.equal(TRAPS.mwOf('书'), '本');
  assert.equal(TRAPS.mwOf('猫'), '只');
  assert.equal(TRAPS.mwOf('自行车'), '辆');
  assert.equal(TRAPS.mwOf('筷子'), '双');
  assert.equal(TRAPS.mwOf('裤子'), '条');
  assert.equal(TRAPS.mwOf('老师'), '位');
  assert.equal(TRAPS.mwOf('苹果'), '个');
  assert.equal(TRAPS.mwOf('нет такого'), null);
  assert.equal(TRAPS.mwOf('toString'), null, 'не отвечать полями прототипа');
});
t('у счётного есть свои существительные', () => {
  const list = TRAPS.byKind('mw');
  assert.ok(list.length >= 20, 'счётных ловушек мало: ' + list.length);
  for (const x of list) for (const h of x.nouns) assert.equal(TRAPS.MW_OF[h], x.mw, 'существительное не от того счётного: ' + h);
  assert.ok(TRAPS.byId('mw:本').nouns.includes('书'));
});

/* ── грамматика и ложные друзья ── */
t('грамматических ловушек не меньше 25', () => {
  const g = TRAPS.byKind('gram');
  assert.ok(g.length >= 25, 'грамматики мало: ' + g.length);
  for (const key of ['gram:bu-mei', 'gram:mei-le', 'gram:le-guo', 'gram:er-liang', 'gram:bi-hen', 'gram:de3', 'gram:ba', 'gram:bei', 'gram:dou', 'gram:ye', 'gram:ma-ne', 'gram:ji-duoshao', 'gram:haishi-huozhe', 'gram:duo-adj', 'gram:verb-double'])
    assert.ok(TRAPS.byId(key), 'нет ловушки ' + key);
});
t('ложные друзья названы словами из словаря', () => {
  const list = TRAPS.byKind('ru');
  assert.ok(list.length >= 7, 'ложных друзей мало: ' + list.length);
  for (const x of list) assert.ok(x.words.some(w => bank.has(w)), 'ни одного слова из банка в ' + x.id);
  assert.ok(TRAPS.byId('ru:kan').words.includes('看见'));
});

/* ── дистракторы ── */
t('forCard не даёт саму карточку, дубли и вторую правду', () => {
  for (const h of ['买', '在', '他', '是', '喝', '书', '找']) {
    const c = card(h);
    for (const part of ['ru', 'pinyin', 'hanzi']) {
      const got = TRAPS.forCard(c, cards, part, 6);
      assert.ok(got.length <= 6, 'больше запрошенного у ' + h);
      const ids = got.map(x => x.id), hs = got.map(x => x.hanzi);
      assert.ok(!ids.includes(c.id) && !hs.includes(c.hanzi), 'сама карточка в дистракторах: ' + h + '/' + part);
      assert.equal(new Set(ids).size, ids.length, 'дубли id у ' + h);
      assert.equal(new Set(hs).size, hs.length, 'дубли знаков у ' + h);
      for (const x of got) {
        assert.ok(TRAPS.byId(x.trap), 'неизвестная ловушка ' + x.trap);
        assert.equal(x.trapKind, TRAPS.byId(x.trap).kind);
        if (part === 'ru') assert.notEqual(x.ru, c.ru, 'вариант верен по переводу');
        if (part === 'hanzi') assert.notEqual(x.hanzi, c.hanzi);
      }
    }
  }
});
t('forCard называет ожидаемые ловушки', () => {
  const mai = TRAPS.forCard(card('买'), cards, 'ru', 8);
  const sell = mai.find(x => x.hanzi === '卖');
  assert.ok(sell, 'нет 卖 среди дистракторов к 买');
  assert.ok(sell.trap === 'tone:mai' || sell.trap === 'glyph:买卖', 'странная ловушка: ' + sell.trap);
  const ta = TRAPS.forCard(card('他'), cards, 'ru', 8).map(x => x.hanzi);
  assert.ok(ta.includes('她') && ta.includes('它'), 'нет 她/它 к 他');
  const he = TRAPS.forCard(card('喝'), cards, 'ru', 8).find(x => x.hanzi === '渴');
  assert.ok(he && he.trap === 'glyph:喝渴', 'нет пары 喝/渴');
  assert.equal(TRAPS.forCard(card('买'), cards, 'ru', 0).length, 0, 'нулевой лимит');
  assert.deepEqual(TRAPS.forCard(null, cards, 'ru'), [], 'без карточки — пусто');
  assert.deepEqual(TRAPS.forCard(card('买'), null, 'ru'), [], 'без пула — пусто');
});

/* ── разбор ответа ── */
t('detect на наборе: тон, инициаль, финаль', () => {
  assert.equal(TRAPS.detect(card('买'), 'mai4', 'pinyin'), 'tone:mai');
  assert.equal(TRAPS.detect(card('买'), 'mai', 'pinyin'), 'tone:mai', 'тон не проставлен вовсе');
  assert.equal(TRAPS.detect(card('买'), 'mǎi', 'pinyin'), null, 'верный ответ — не ловушка');
  assert.equal(TRAPS.detect(card('买'), 'mai4', 'pinyin', { pinyin: 'tones' }), 'tone:mai', 'разбор Quiz учитывается');
  assert.equal(TRAPS.detect(card('是'), 'xi4', 'pinyin'), 'init:x-sh');
  assert.equal(TRAPS.detect(card('三'), 'sang1', 'pinyin'), 'fin:an-ang');
  assert.equal(TRAPS.detect(card('中国'), 'zhong1guo2', 'pinyin'), null, 'верный многосложный');
  assert.equal(TRAPS.detect(card('买'), '', 'pinyin'), null, 'пустой ответ');
  assert.equal(TRAPS.detect(null, 'mai4', 'pinyin'), null);
});
t('detect на наборе иероглифа', () => {
  assert.equal(TRAPS.detect(card('买'), '卖', 'hanzi'), 'glyph:买卖');
  assert.equal(TRAPS.detect(card('在'), '再', 'hanzi'), 'glyph:在再');
  assert.equal(TRAPS.detect(card('买'), '买', 'hanzi'), null, 'верный знак');
  assert.equal(TRAPS.detect(card('买'), '狗', 'hanzi'), null, 'случайный знак — не ловушка');
});
t('detect на выборе варианта', () => {
  assert.equal(TRAPS.detect(card('买'), card('卖'), 'ru'), 'glyph:买卖', 'при выборе виноват знак');
  assert.equal(TRAPS.detect(card('买'), card('卖'), 'pinyin'), 'tone:mai', 'при наборе пиньиня виноват тон');
  assert.equal(TRAPS.detect(card('在'), card('再'), 'pinyin'), 'homo:zai4', 'одинаковое звучание — омофон');
  assert.equal(TRAPS.detect(card('看'), card('看见'), 'ru'), 'ru:kan', 'ложный друг');
  assert.equal(TRAPS.detect(card('本'), card('件'), 'ru'), 'mw:本', 'счётные слова между собой');
  assert.equal(TRAPS.detect(card('买'), card('买'), 'ru'), null, 'тот же знак — не ошибка');
  assert.equal(TRAPS.detect(card('买'), { hanzi: '狗', pinyin: 'gǒu', ru: 'собака' }, 'ru'), null, 'непохожий вариант');
  const tagged = Object.assign({}, card('卖'), { trap: 'tone:mai' });
  assert.equal(TRAPS.detect(card('买'), tagged, 'ru'), 'tone:mai', 'вариант из forCard называет себя сам');
  assert.equal(TRAPS.detect(card('买'), Object.assign({}, card('卖'), { trap: 'нет такой' }), 'pinyin'), 'tone:mai', 'выдуманная метка игнорируется');
});
t('detect согласуется с forCard', () => {
  for (const h of ['买', '在', '他', '喝', '看', '本']) {
    for (const x of TRAPS.forCard(card(h), cards, 'ru', 6)) {
      assert.equal(TRAPS.detect(card(h), x, 'ru'), x.trap, 'метка forCard и detect разошлись: ' + h + ' → ' + x.hanzi);
    }
  }
});

/* ── объяснение и ключ повторений ── */
t('explain и cardKey', () => {
  const e = TRAPS.explain('gram:bu-mei');
  assert.deepEqual(Object.keys(e).sort(), ['contrast', 'ru', 'rule']);
  assert.ok(e.rule.includes('没') && e.contrast.length > 30);
  assert.equal(TRAPS.explain('нет такой'), null);
  assert.equal(TRAPS.cardKey('tone:mai'), 'trap:tone:mai');
  assert.equal(TRAPS.cardKey('glyph:买卖'), 'trap:glyph:买卖');
  assert.equal(TRAPS.cardKey('нет такой'), null, 'ключ только у существующей ловушки');
  for (const x of TRAPS.ALL) assert.equal(TRAPS.cardKey(x.id), 'trap:' + x.id);
});

/* ── чистота ── */
t('два вызова подряд дают одно и то же', () => {
  const a1 = JSON.stringify(TRAPS.ALL), a2 = JSON.stringify(TRAPS.ALL);
  assert.equal(a1, a2, 'каталог не воспроизводится');
  const c = card('买');
  for (const part of ['ru', 'pinyin', 'hanzi']) {
    assert.deepEqual(TRAPS.forCard(c, cards, part, 6), TRAPS.forCard(c, cards, part, 6), 'forCard не воспроизводится: ' + part);
  }
  assert.equal(TRAPS.detect(c, 'mai4', 'pinyin'), TRAPS.detect(c, 'mai4', 'pinyin'));
  /* порядок вызовов не влияет: сначала спросили другое — ответ на 买 не изменился */
  const first = TRAPS.forCard(c, cards, 'ru', 6);
  TRAPS.forCard(card('在'), cards, 'hanzi', 6);
  TRAPS.detect(card('三'), 'sang1', 'pinyin');
  assert.deepEqual(TRAPS.forCard(c, cards, 'ru', 6), first, 'ответ зависит от порядка вызовов');
});
t('модуль не трогает входные данные', () => {
  const c = card('买');
  const snapCard = JSON.stringify(c), snapPool = JSON.stringify(cards);
  const got = TRAPS.forCard(c, cards, 'ru', 6);
  TRAPS.detect(c, got[0], 'ru');
  TRAPS.detect(c, 'mai4', 'pinyin', { pinyin: 'tones' });
  assert.equal(JSON.stringify(c), snapCard, 'карточка изменена');
  assert.equal(JSON.stringify(cards), snapPool, 'пул изменён');
  for (const x of got) assert.ok(!cards.some(p => p === x), 'вернули саму карточку пула, а не копию');
});
t('каталог не зависит от состояния и не мутируется снаружи', () => {
  const before = TRAPS.ALL.length;
  const stolen = TRAPS.ALL;
  /* каталог заморожен: попытка порчи снаружи должна отскочить, а не изменить содержимое */
  let threw = false;
  try { stolen.__probe = 1; } catch (e) { threw = true; }
  assert.ok(threw || stolen.__probe === undefined, 'каталог не защищён от порчи снаружи');
  assert.equal(TRAPS.ALL.length, before);
  assert.equal(TRAPS.byId('tone:mai').id, 'tone:mai');
});

/* ── закон чистоты: порядок загрузки и порядок разбора ── */
t('каталог не зависит от порядка загрузки модулей', () => {
  /* Главная проверка закона: справочник обязан быть функцией словаря, а не того, кто позвал
     первым. Гоняем отдельные процессы с разным порядком require и сверяем отпечаток. */
  const dir = fileURLToPath(new URL('../src/js/', import.meta.url));
  const digest = order => {
    const code = 'global.window=global;'
      + 'const L=n=>require(' + JSON.stringify(dir) + '+n+".js");'
      + order
      + 'const T=global.TRAPS;'
      + 'const d=T.ALL.map(x=>x.id+"|"+x.rule).join("\\n")+"\\n##\\n"+T.DOUBLES.map(x=>x.id).join(",");'
      + 'process.stdout.write(T.ALL.length+" "+T.DOUBLES.length+" "+require("crypto").createHash("sha1").update(d).digest("hex"));';
    return execFileSync(process.execPath, ['-e', code], { encoding: 'utf8' });
  };
  const normal = digest('["hsk","freq","pinyin","phonetics","traps"].forEach(L);');
  /* тот же словарь, но traps загружен первым */
  const first = digest('["traps","hsk","freq","pinyin","phonetics"].forEach(L);');
  /* traps загружен первым И опрошен до словаря — самый злой случай для кэша */
  const poisoned = digest('L("traps");global.TRAPS.ALL.length;global.TRAPS.forCard({id:"x",hanzi:"买",pinyin:"mǎi"},[],"ru");'
    + '["hsk","freq","pinyin","phonetics"].forEach(L);');
  assert.equal(first, normal, 'порядок загрузки изменил каталог');
  assert.equal(poisoned, normal, 'ранний вызов заморозил неполный каталог');
  assert.ok(/^\d+ \d+ [0-9a-f]{40}$/.test(normal.trim()), 'отпечаток не собрался: ' + normal);
});
t('разбор журнала попыток не зависит от порядка', () => {
  /* Разбираем один и тот же append-only журнал в разном порядке: набор названных
     ловушек обязан совпасть. Производных значений модуль не хранит — проверяем это снаружи. */
  const q = (h, input) => ({ cardId: 'hsk1:' + h, hanzi: h, pinyin: bank.get(h).pinyin, ru: bank.get(h).ru, answer: { input }, ok: false });
  const attempts = [
    { id: 'a1', ts: 1, mode: 'quiz', questions: [q('买', 'mai4'), q('是', 'xi4'), q('三', 'sang1')] },
    { id: 'a2', ts: 2, mode: 'write', questions: [q('在', 'zai4'), q('买', 'mai1')] },
    { id: 'a3', ts: 3, mode: 'flip', questions: [q('三', 'san1'), q('是', 'shi4')] },
  ];
  const tally = list => {
    const m = new Map();
    for (const a of list) for (const qq of (a.questions || [])) {
      const id = TRAPS.detect({ id: qq.cardId, hanzi: qq.hanzi, pinyin: qq.pinyin, ru: qq.ru }, qq.answer.input, 'pinyin');
      if (id) m.set(id, (m.get(id) || 0) + 1);
    }
    return JSON.stringify(Array.from(m.entries()).sort());
  };
  const forward = tally(attempts);
  assert.equal(tally(attempts.slice().reverse()), forward, 'обратный порядок дал другой итог');
  assert.equal(tally([attempts[1], attempts[2], attempts[0]]), forward, 'перестановка дала другой итог');
  assert.equal(tally(attempts.concat(attempts)), JSON.stringify(JSON.parse(forward).map(([k, v]) => [k, v * 2])), 'пересчёт вдвое не удвоился');
  assert.ok(JSON.parse(forward).length >= 3, 'журнал не дал ловушек: ' + forward);
});
t('не падает на пустом и на кривом состоянии', () => {
  const bad = [
    { id: 'e1', ts: 1, mode: 'quiz' },                                  /* попытка без questions */
    { id: 'e2', ts: 2, mode: 'quiz', questions: [] },                   /* пустой список */
    { id: 'e3', ts: 3, mode: 'quiz', questions: [{ hanzi: '买' }] },     /* вопрос без cardId и без ответа */
    { id: 'e4', ts: 4, mode: 'quiz', questions: [{ cardId: null, hanzi: '', pinyin: '', ru: '', answer: {} }] },
  ];
  for (const a of bad) for (const qq of (a.questions || [])) {
    const c = { id: qq.cardId, hanzi: qq.hanzi, pinyin: qq.pinyin, ru: qq.ru };
    assert.doesNotThrow(() => TRAPS.detect(c, (qq.answer || {}).input, 'pinyin'));
    assert.doesNotThrow(() => TRAPS.detect(c, (qq.answer || {}).choice, 'ru'));
    assert.doesNotThrow(() => TRAPS.forCard(c, cards, 'ru', 6));
    assert.doesNotThrow(() => TRAPS.forCard(c, [], 'ru', 6));
  }
  /* пустые и мусорные аргументы открытого API */
  assert.deepEqual(TRAPS.forCard(undefined, undefined, undefined), []);
  assert.deepEqual(TRAPS.forCard({ id: 'x', hanzi: '买', pinyin: 'mǎi' }, [null, {}, { hanzi: '' }], 'ru'), []);
  assert.equal(TRAPS.detect({ hanzi: '买', pinyin: 'mǎi' }, undefined, 'pinyin'), null);
  assert.equal(TRAPS.detect({ hanzi: '买', pinyin: 'mǎi' }, {}, 'ru'), null);
  assert.equal(TRAPS.byId(undefined), null);
  assert.equal(TRAPS.explain(null), null);
  assert.deepEqual(TRAPS.byKind('нет такого вида'), []);
});
t('модуль живёт без словаря и без DOM', () => {
  const dir = fileURLToPath(new URL('../src/js/', import.meta.url));
  const code = 'global.window=global;'
    + 'require(' + JSON.stringify(dir) + '+"traps.js");'
    + 'const T=global.TRAPS;'
    + 'if(typeof document!=="undefined")throw new Error("модуль ждёт DOM");'
    + 'T.ALL.length;T.DOUBLES.length;T.byKind("gram").length;'
    + 'T.detect({hanzi:"买",pinyin:"mǎi"},"mai4","pinyin");'
    + 'T.forCard({id:"x",hanzi:"买",pinyin:"mǎi"},[],"ru");'
    + 'T.mwOf("书");T.mwAll("书");T.explain("gram:bu-mei");'
    + 'process.stdout.write("ok "+T.byKind("gram").length+" "+T.byKind("mw").length);';
  const out = execFileSync(process.execPath, ['-e', code], { encoding: 'utf8' });
  assert.ok(out.startsWith('ok '), 'без словаря модуль упал: ' + out);
  /* рукописные разделы от словаря не зависят и обязаны быть на месте и без него */
  const [, g, m] = out.split(' ');
  assert.ok(+g >= 25 && +m >= 20, 'рукописные разделы пропали без словаря: gram ' + g + ', mw ' + m);
});
t('исходники модуля без DOM, import/export и сети', () => {
  const src = readFileSync(new URL('../src/js/traps.js', import.meta.url), 'utf8');
  for (const bad of ['document.', 'window.location', 'localStorage', 'fetch(', 'XMLHttpRequest', 'import ', 'export ', 'require('])
    assert.ok(!src.includes(bad), 'в модуле есть ' + bad);
  assert.ok(/^window\.TRAPS = \(\(\) => \{/m.test(src), 'не тот стиль модуля');
});

/* ── содержание: счётные слова ── */
t('счётные: ключ один, а где их два — оба названы', () => {
  for (const h of Object.keys(TRAPS.MW_ALSO)) {
    assert.ok(TRAPS.mwOf(h), 'второе счётное у слова вне таблицы: ' + h);
    assert.ok(bank.has(h), 'слова нет в банке: ' + h);
    for (const mw of TRAPS.MW_ALSO[h]) {
      assert.notEqual(mw, TRAPS.mwOf(h), 'второе счётное совпало с первым: ' + h);
      assert.equal(mw.length, 1, 'счётное не в один знак: ' + mw);
    }
    assert.equal(new Set(TRAPS.MW_ALSO[h]).size, TRAPS.MW_ALSO[h].length, 'дубль второго счётного: ' + h);
  }
  assert.deepEqual(TRAPS.mwAll('手机'), ['部', '个'], 'у 手机 два верных счётных');
  assert.deepEqual(TRAPS.mwAll('书'), ['本'], 'у 书 счётное одно');
  assert.deepEqual(TRAPS.mwAll('нет такого'), []);
  assert.deepEqual(TRAPS.mwAll('toString'), [], 'не отвечать полями прототипа');
});
t('句子 считается через 个, а 句 — сказанное вслух', () => {
  /* 一个句子 — предложение как единица письма; 句 меряет реплику: 说一句 */
  assert.equal(TRAPS.mwOf('句子'), '个', 'счётное 句子 не 个');
  const ju = TRAPS.byId('mw:句');
  assert.ok(ju, 'нет ловушки mw:句');
  assert.ok(!ju.nouns.includes('句子'), '句子 приписано счётному 句');
  assert.ok(!/句句子/.test(ju.rule + ju.contrast), 'в правиле осталось 两句句子');
});
t('у каждого счётного своё правило и свой пиньинь', () => {
  const list = TRAPS.byKind('mw');
  assert.ok(list.length >= 30, 'счётных мало: ' + list.length);
  const mws = list.map(x => x.mw), rules = list.map(x => x.rule);
  assert.equal(new Set(mws).size, mws.length, 'счётное повторилось');
  assert.equal(new Set(rules).size, rules.length, 'правило повторилось у разных счётных');
  for (const x of list) {
    const [mw, py] = x.zh.split(' ');
    assert.equal(mw, x.mw, 'zh не совпал со счётным: ' + x.id);
    assert.ok(py && Pinyin.analyze(py).letters, 'у счётного нет пиньиня: ' + x.id);
    assert.ok(x.rule.includes(x.mw) || x.nouns.length, 'правило не показывает счётное: ' + x.id);
    for (const h of x.also) assert.ok(TRAPS.MW_ALSO[h].includes(x.mw), 'also собран неверно: ' + x.id + '/' + h);
  }
  /* каждое счётное из таблицы существительных должно быть объяснено */
  for (const mw of new Set(Object.values(TRAPS.MW_OF)))
    assert.ok(TRAPS.byId('mw:' + mw), 'счётное без объяснения: ' + mw);
});

/* ── содержание: объём и китайский ── */
t('рукописные разделы набраны по максимуму', () => {
  assert.ok(TRAPS.byKind('gram').length >= 40, 'грамматики мало: ' + TRAPS.byKind('gram').length);
  assert.ok(TRAPS.byKind('ru').length >= 24, 'ложных друзей мало: ' + TRAPS.byKind('ru').length);
  assert.ok(TRAPS.byKind('glyph').length + TRAPS.DOUBLES.length >= 60, 'пар знаков мало');
  assert.ok(Object.keys(TRAPS.MW_OF).length >= 140, 'существительных мало: ' + Object.keys(TRAPS.MW_OF).length);
});
t('в текстах ловушек нет латиницы вместо иероглифов и нет пустых примеров', () => {
  const hanzi = /[一-鿿]/;
  for (const x of TRAPS.ALL.concat(TRAPS.DOUBLES)) {
    /* разделы про знаки, слова и грамматику обязаны показывать сам китайский */
    if (['glyph', 'mw', 'gram', 'ru', 'tone', 'homo'].includes(x.kind))
      assert.ok(hanzi.test(x.rule) || hanzi.test(x.contrast), 'нет иероглифов в примере: ' + x.id);
    assert.ok(!/\s,|\s\./.test(x.rule), 'висячая пунктуация в ' + x.id);
  }
});
t('ложные друзья: слова записаны иероглифами и не повторяются между гнёздами', () => {
  const list = TRAPS.byKind('ru');
  for (const x of list) {
    assert.ok(x.words.length >= 1, 'пустое гнездо ' + x.id);
    for (const w of x.words) assert.ok(/^[一-鿿]+$/.test(w), 'не иероглифы в ' + x.id + ': ' + w);
  }
  /* одно слово — одно гнездо, иначе указатель ruOf уводит не туда */
  const seen = new Map();
  for (const x of list) for (const w of x.words) {
    assert.ok(!seen.has(w), 'слово ' + w + ' в двух гнёздах: ' + seen.get(w) + ' и ' + x.id);
    seen.set(w, x.id);
  }
});
t('грамматика: ключи уникальны, тексты не повторяются', () => {
  const g = TRAPS.byKind('gram');
  const rules = g.map(x => x.rule), names = g.map(x => x.ru);
  assert.equal(new Set(rules).size, rules.length, 'правило повторилось');
  assert.equal(new Set(names).size, names.length, 'название повторилось');
  for (const key of ['gram:hen-obligatory', 'gram:number-mw', 'gram:bu-tone', 'gram:yi-tone', 'gram:a-not-a', 'gram:existential-you'])
    assert.ok(TRAPS.byId(key), 'нет ловушки ' + key);
});

console.log(process.exitCode ? 'SOME TESTS FAILED' : 'traps: ' + n + ' групп проверок пройдено, ловушек ' + TRAPS.ALL.length + ' (+' + TRAPS.DOUBLES.length + ' вне словаря)');
