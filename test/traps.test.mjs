/* Каталог ловушек: проверка содержания и чистоты. node test/traps.test.mjs */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
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

console.log(process.exitCode ? 'SOME TESTS FAILED' : 'traps: ' + n + ' групп проверок пройдено, ловушек ' + TRAPS.ALL.length + ' (+' + TRAPS.DOUBLES.length + ' вне словаря)');
