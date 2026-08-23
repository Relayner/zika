/* Сокровищница: сундук за марш-бросок, предметы с редкостью, шансом и ценностью (в 文 вэнях). */
window.Treasures = (() => {
  const RARITY = {
    common: { ru: 'Обычное', zh: '凡品', w: 55, color: 'var(--ink-3)' },
    uncommon: { ru: 'Необычное', zh: '良品', w: 25, color: 'var(--jade)' },
    rare: { ru: 'Редкое', zh: '珍品', w: 13, color: '#4a6b8a' },
    epic: { ru: 'Эпическое', zh: '奇珍', w: 5.5, color: '#7b2d6e' },
    legendary: { ru: 'Легендарное', zh: '国宝', w: 1.5, color: 'var(--gold)' },
  };
  const ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const ITEMS = [
    { id: 'coin', zh: '铜钱', py: 'tóngqián', ru: 'Связка медных монет', rarity: 'common', value: 12, desc: 'Монеты с квадратной дыркой — чтобы нанизывать на шнур. Жалованье пехоты.' },
    { id: 'bamboo', zh: '竹简', py: 'zhújiǎn', ru: 'Бамбуковые дощечки', rarity: 'common', value: 18, desc: 'Книга до изобретения бумаги. Тяжёлая, зато не промокает.' },
    { id: 'bowl', zh: '陶碗', py: 'táowǎn', ru: 'Глиняная чаша', rarity: 'common', value: 10, desc: 'Из неё ели кашу у костра. Кашевар одобряет.' },
    { id: 'tea', zh: '茶饼', py: 'chábǐng', ru: 'Прессованный чайный блин', rarity: 'common', value: 20, desc: 'Чай, спрессованный в диск, — валюта караванов.' },
    { id: 'ink', zh: '墨锭', py: 'mòdìng', ru: 'Брусок туши', rarity: 'common', value: 15, desc: 'Растереть с водой на камне — и можно писать донесения.' },
    { id: 'brush', zh: '毛笔', py: 'máobǐ', ru: 'Кисть для каллиграфии', rarity: 'common', value: 16, desc: 'Оружие стратега. Иногда сильнее копья.' },
    { id: 'silk', zh: '丝绸', py: 'sīchóu', ru: 'Рулон шёлка', rarity: 'uncommon', value: 80, desc: 'За рулон шёлка в степи давали лошадь.' },
    { id: 'vase', zh: '青瓷瓶', py: 'qīngcí píng', ru: 'Селадоновая ваза', rarity: 'uncommon', value: 110, desc: 'Глазурь цвета нефрита. Бьётся — не ронять.' },
    { id: 'mirror', zh: '铜镜', py: 'tóngjìng', ru: 'Бронзовое зеркало', rarity: 'uncommon', value: 90, desc: 'Отполированная бронза: видно и лицо, и усы.' },
    { id: 'lacquer', zh: '漆盒', py: 'qīhé', ru: 'Лаковая шкатулка', rarity: 'uncommon', value: 100, desc: 'Сто слоёв лака и золотые журавли.' },
    { id: 'jade', zh: '玉佩', py: 'yùpèi', ru: 'Нефритовая подвеска', rarity: 'uncommon', value: 120, desc: 'Благородный муж не снимает нефрит без причины.' },
    { id: 'ding', zh: '青铜鼎', py: 'qīngtóng dǐng', ru: 'Бронзовый треножник дин', rarity: 'rare', value: 450, desc: 'Ритуальный котёл. Символ власти над землёй.' },
    { id: 'guqin', zh: '古琴', py: 'gǔqín', ru: 'Цитра гуцинь', rarity: 'rare', value: 400, desc: 'Семь струн. Чжугэ Лян играл на ней, пока враг отступал.' },
    { id: 'sunzi', zh: '孙子兵法', py: 'Sūnzǐ bīngfǎ', ru: 'Свиток «Искусство войны»', rarity: 'rare', value: 500, desc: 'Тринадцать глав. Лучшая победа — без битвы.' },
    { id: 'ingot', zh: '金元宝', py: 'jīn yuánbǎo', ru: 'Золотой слиток юаньбао', rarity: 'rare', value: 600, desc: 'Слиток в форме лодочки. Удача и богатство.' },
    { id: 'tally', zh: '虎符', py: 'hǔfú', ru: 'Тигровая бирка', rarity: 'rare', value: 550, desc: 'Две половины тигра: сложил — можешь двинуть войско.' },
    { id: 'blade', zh: '青龙偃月刀', py: 'qīnglóng yǎnyuè dāo', ru: 'Клинок Зелёного Дракона', rarity: 'epic', value: 2000, desc: 'Оружие Гуань Юя. Восемьдесят два цзиня стали.' },
    { id: 'horse', zh: '赤兔马', py: 'Chìtù mǎ', ru: 'Конь Красный Заяц', rarity: 'epic', value: 2500, desc: 'Тысяча ли в день. Принадлежал Люй Бу, потом Гуань Юю.' },
    { id: 'crossbow', zh: '诸葛连弩', py: 'Zhūgě liánnǔ', ru: 'Многозарядный арбалет Чжугэ', rarity: 'epic', value: 1800, desc: 'Десять стрел одним нажатием. Изобретение стратега.' },
    { id: 'pearl', zh: '夜明珠', py: 'yèmíngzhū', ru: 'Жемчужина, светящаяся в ночи', rarity: 'epic', value: 2200, desc: 'Освещает шатёр без свечи.' },
    { id: 'seal', zh: '传国玉玺', py: 'chuánguó yùxǐ', ru: 'Нефритовая печать императора', rarity: 'legendary', value: 9000, desc: 'Кто владеет печатью — владеет Поднебесной. Так считали все, и все ошибались.' },
    { id: 'heshibi', zh: '和氏璧', py: 'Héshìbì', ru: 'Нефритовый диск Хэ', rarity: 'legendary', value: 8000, desc: 'За него предлагали пятнадцать городов. Из него вырезали императорскую печать.' },
  ];
  const byId = Object.fromEntries(ITEMS.map(i => [i.id, i]));
  const PER_CHEST = 3;
  function rollRarity(rnd = Math.random) {
    const total = ORDER.reduce((s, k) => s + RARITY[k].w, 0);
    let x = rnd() * total;
    for (const k of ORDER) { x -= RARITY[k].w; if (x <= 0) return k; }
    return 'common';
  }
  function rollItem(rnd = Math.random) {
    const r = rollRarity(rnd), pool = ITEMS.filter(i => i.rarity === r);
    return pool[Math.floor(rnd() * pool.length)];
  }
  /* Открыть сундук: 3 предмета, первый — не ниже «необычного» */
  function openChest(rnd = Math.random) {
    const items = [];
    for (let i = 0; i < PER_CHEST; i++) {
      let it = rollItem(rnd);
      if (i === 0 && it.rarity === 'common') { const pool = ITEMS.filter(x => x.rarity === 'uncommon'); it = pool[Math.floor(rnd() * pool.length)]; }
      items.push(it.id);
    }
    return items;
  }
  const value = inv => Object.entries(inv || {}).reduce((s, [id, n]) => s + ((byId[id] ? byId[id].value : 0) * n), 0);
  const count = inv => Object.values(inv || {}).reduce((s, n) => s + n, 0);
  const fmtValue = v => v.toLocaleString('ru-RU') + ' 文';
  return { RARITY, ORDER, ITEMS, byId, PER_CHEST, rollRarity, rollItem, openChest, value, count, fmtValue };
})();
