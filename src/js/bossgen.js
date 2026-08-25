/* Диалоги босса: сначала Claude Fable через воркер, при недоступности — встроенный банк. Плюс голосовой ввод. */
window.BossGen = (() => {
  /* Запасной банк: работает без сети и без ключа. Каждый бой берёт случайные раунды. */
  const BANK = {
    b1: [
      { say: '你好，你叫什么名字？', py: 'nǐ hǎo, nǐ jiào shénme míngzi?', ru: 'Здравствуй, как тебя зовут?', expect: ['我叫', '我是'], answer: '我叫小明。', answer_ru: 'Меня зовут Сяомин.', opts: ['我叫小明。', '我很好，谢谢。', '这是我的书。'] },
      { say: '你家有几个人？', py: 'nǐ jiā yǒu jǐ ge rén?', ru: 'Сколько человек в твоей семье?', expect: ['个人', '四个', '三个', '五个'], answer: '我家有四个人。', answer_ru: 'В моей семье четыре человека.', opts: ['我家有四个人。', '我家在北京。', '我有一个老师。'] },
      { say: '今天几号？', py: 'jīntiān jǐ hào?', ru: 'Какое сегодня число?', expect: ['号', '日'], answer: '今天八号。', answer_ru: 'Сегодня восьмое.', opts: ['今天八号。', '今天很热。', '我今天不去。'] },
      { say: '这是什么书？', py: 'zhè shì shénme shū?', ru: 'Что это за книга?', expect: ['汉语', '书', '这是'], answer: '这是汉语书。', answer_ru: 'Это учебник китайского.', opts: ['这是汉语书。', '我会写字。', '他是我朋友。'] },
      { say: '你是学生吗？', py: 'nǐ shì xuéshēng ma?', ru: 'Ты студент?', expect: ['我是', '不是', '学生'], answer: '我是学生。', answer_ru: 'Я студент.', opts: ['我是学生。', '我在家里。', '这个很大。'] },
      { say: '你会写汉字吗？', py: 'nǐ huì xiě hànzì ma?', ru: 'Ты умеешь писать иероглифы?', expect: ['会', '不会', '写'], answer: '我会写一点儿。', answer_ru: 'Немного умею.', opts: ['我会写一点儿。', '我很高兴。', '他去商店。'] },
      { say: '老师在哪儿？', py: 'lǎoshī zài nǎr?', ru: 'Где учитель?', expect: ['在', '学校', '家'], answer: '老师在学校。', answer_ru: 'Учитель в школе.', opts: ['老师在学校。', '老师很好。', '我不认识。'] },
      { say: '你有几本书？', py: 'nǐ yǒu jǐ běn shū?', ru: 'Сколько у тебя книг?', expect: ['本', '有'], answer: '我有三本书。', answer_ru: 'У меня три книги.', opts: ['我有三本书。', '我买了苹果。', '书在桌子上。'] },
    ],
    b2: [
      { say: '客人，喝茶还是喝水？', py: 'kèrén, hē chá háishi hē shuǐ?', ru: 'Гость, чай или воду?', expect: ['喝茶', '喝水', '茶', '水'], answer: '我喝茶，谢谢。', answer_ru: 'Я выпью чаю, спасибо.', opts: ['我喝茶，谢谢。', '我不认识他。', '这里很远。'] },
      { say: '你吃饭了吗？', py: 'nǐ chī fàn le ma?', ru: 'Ты поел?', expect: ['吃了', '没吃', '还没'], answer: '我吃了，谢谢。', answer_ru: 'Поел, спасибо.', opts: ['我吃了，谢谢。', '我会说汉语。', '天气很冷。'] },
      { say: '今天天气怎么样？', py: 'jīntiān tiānqì zěnmeyàng?', ru: 'Какая сегодня погода?', expect: ['很热', '很冷', '下雨', '很好'], answer: '今天很热。', answer_ru: 'Сегодня жарко.', opts: ['今天很热。', '我有两个杯子。', '他在医院。'] },
      { say: '你喜欢什么水果？', py: 'nǐ xǐhuan shénme shuǐguǒ?', ru: 'Какие фрукты ты любишь?', expect: ['喜欢', '苹果', '西瓜'], answer: '我喜欢苹果。', answer_ru: 'Я люблю яблоки.', opts: ['我喜欢苹果。', '我在学习。', '这是我的椅子。'] },
      { say: '现在几点了？', py: 'xiànzài jǐ diǎn le?', ru: 'Который сейчас час?', expect: ['点', '现在'], answer: '现在三点。', answer_ru: 'Сейчас три часа.', opts: ['现在三点。', '我很喜欢。', '他不在家。'] },
      { say: '你住在哪儿？', py: 'nǐ zhù zài nǎr?', ru: 'Где ты живёшь?', expect: ['住在', '北京', '家'], answer: '我住在北京。', answer_ru: 'Я живу в Пекине.', opts: ['我住在北京。', '我喝了茶。', '这个太贵了。'] },
      { say: '要不要再来一杯？', py: 'yào bu yào zài lái yì bēi?', ru: 'Ещё чашечку?', expect: ['要', '不要', '谢谢'], answer: '要，谢谢。', answer_ru: 'Да, спасибо.', opts: ['要，谢谢。', '我去学校。', '他很高兴。'] },
      { say: '你几点睡觉？', py: 'nǐ jǐ diǎn shuìjiào?', ru: 'Во сколько ты ложишься спать?', expect: ['点', '睡觉'], answer: '我十点睡觉。', answer_ru: 'Я ложусь в десять.', opts: ['我十点睡觉。', '我吃米饭。', '这是他的。'] },
    ],
    b3: [
      { say: '这个多少钱？', py: 'zhège duōshao qián?', ru: 'Сколько это стоит?', expect: ['块', '钱', '太贵'], answer: '太贵了，便宜一点儿吧。', answer_ru: 'Дорого, давай подешевле.', opts: ['太贵了，便宜一点儿吧。', '我是学生。', '今天下雨。'] },
      { say: '你要买几个？', py: 'nǐ yào mǎi jǐ ge?', ru: 'Сколько штук берёшь?', expect: ['个', '要', '买'], answer: '我要买两个。', answer_ru: 'Возьму две штуки.', opts: ['我要买两个。', '我在医院工作。', '他会开车。'] },
      { say: '你有钱吗？', py: 'nǐ yǒu qián ma?', ru: 'Деньги-то есть?', expect: ['有', '没有', '钱'], answer: '有一点儿。', answer_ru: 'Немного есть.', opts: ['有一点儿。', '我很累。', '这是茶。'] },
      { say: '苹果和西瓜，你买哪个？', py: 'píngguǒ hé xīguā, nǐ mǎi nǎge?', ru: 'Яблоки или арбуз — что берёшь?', expect: ['买', '苹果', '西瓜'], answer: '我买苹果。', answer_ru: 'Возьму яблоки.', opts: ['我买苹果。', '我不知道路。', '他是医生。'] },
      { say: '便宜卖你，三十块，怎么样？', py: 'piányi mài nǐ, sānshí kuài, zěnmeyàng?', ru: 'Отдам дёшево, тридцать юаней — идёт?', expect: ['太贵', '好', '二十', '可以'], answer: '二十块吧。', answer_ru: 'Давай за двадцать.', opts: ['二十块吧。', '我喜欢猫。', '现在很晚。'] },
      { say: '你从哪儿来？', py: 'nǐ cóng nǎr lái?', ru: 'Ты откуда?', expect: ['从', '来', '俄罗斯', '中国'], answer: '我从俄罗斯来。', answer_ru: 'Я из России.', opts: ['我从俄罗斯来。', '我买了三个。', '他很忙。'] },
      { say: '还要别的吗？', py: 'hái yào biéde ma?', ru: 'Ещё что-нибудь?', expect: ['不要', '要', '谢谢'], answer: '不要了，谢谢。', answer_ru: 'Больше не нужно, спасибо.', opts: ['不要了，谢谢。', '我去睡觉。', '天气不错。'] },
      { say: '你怎么来的？', py: 'nǐ zěnme lái de?', ru: 'Ты как добрался?', expect: ['坐', '来的', '走'], answer: '我坐公共汽车来的。', answer_ru: 'Приехал на автобусе.', opts: ['我坐公共汽车来的。', '我有很多钱。', '这个很小。'] },
    ],
    b4: [
      { say: '请说明，你为什么学汉语？', py: 'qǐng shuōmíng, nǐ wèishénme xué hànyǔ?', ru: 'Изложите: почему вы учите китайский?', expect: ['因为', '喜欢', '工作'], answer: '因为我喜欢中国文化。', answer_ru: 'Потому что мне нравится китайская культура.', opts: ['因为我喜欢中国文化。', '我今天很累。', '这本书很贵。'] },
      { say: '你学了多长时间了？', py: 'nǐ xué le duō cháng shíjiān le?', ru: 'Сколько времени вы уже учите?', expect: ['年', '个月', '学了'], answer: '我学了一年了。', answer_ru: 'Учу уже год.', opts: ['我学了一年了。', '我坐地铁上班。', '他在门口等我。'] },
      { say: '把这句话说完整。', py: 'bǎ zhè jù huà shuō wánzhěng.', ru: 'Скажите фразу полностью.', expect: ['把', '完'], answer: '我把作业写完了。', answer_ru: 'Я дописал домашнее задание.', opts: ['我把作业写完了。', '我喝一杯茶。', '外面很冷。'] },
      { say: '你的工作是什么？', py: 'nǐ de gōngzuò shì shénme?', ru: 'Кем вы работаете?', expect: ['工作', '是', '老师', '学生'], answer: '我是老师。', answer_ru: 'Я учитель.', opts: ['我是老师。', '我买了报纸。', '他很喜欢猫。'] },
      { say: '虽然很难，但是你还学吗？', py: 'suīrán hěn nán, dànshì nǐ hái xué ma?', ru: 'Хоть и трудно, вы продолжаете учить?', expect: ['虽然', '但是', '还', '学'], answer: '虽然很难，但是我还想学。', answer_ru: 'Хотя трудно, я всё же хочу учить.', opts: ['虽然很难，但是我还想学。', '我不认识这个人。', '今天是星期一。'] },
      { say: '请问，你是什么时候来的？', py: 'qǐngwèn, nǐ shì shénme shíhou lái de?', ru: 'Позвольте узнать, когда вы прибыли?', expect: ['是', '来的', '年', '月'], answer: '我是去年来的。', answer_ru: 'Я приехал в прошлом году.', opts: ['我是去年来的。', '我在写字。', '他比我高。'] },
      { say: '你能用汉语介绍你的城市吗？', py: 'nǐ néng yòng hànyǔ jièshào nǐ de chéngshì ma?', ru: 'Можете представить свой город по-китайски?', expect: ['我的城市', '城市', '很'], answer: '我的城市不大，但是很漂亮。', answer_ru: 'Мой город небольшой, но красивый.', opts: ['我的城市不大，但是很漂亮。', '我要买两个。', '请给我茶。'] },
      { say: '如果考试很难，你怎么办？', py: 'rúguǒ kǎoshì hěn nán, nǐ zěnme bàn?', ru: 'Если экзамен окажется трудным, что будете делать?', expect: ['如果', '就', '努力', '复习'], answer: '如果很难，我就多复习。', answer_ru: 'Если трудно, буду больше повторять.', opts: ['如果很难，我就多复习。', '我住在学校。', '他没有钱。'] },
    ],
    b5: [
      { say: '站住！你要去哪里？', py: 'zhànzhù! nǐ yào qù nǎlǐ?', ru: 'Стой! Куда направляешься?', expect: ['去', '我要'], answer: '我要去北京。', answer_ru: 'Я иду в Пекин.', opts: ['我要去北京。', '我很喜欢茶。', '这个字很难。'] },
      { say: '为什么现在才来？', py: 'wèishénme xiànzài cái lái?', ru: 'Почему только сейчас явился?', expect: ['因为', '所以', '路上'], answer: '因为路上堵车了。', answer_ru: 'Потому что на дороге пробка.', opts: ['因为路上堵车了。', '我买了衣服。', '他是我哥哥。'] },
      { say: '你怕不怕？', py: 'nǐ pà bu pà?', ru: 'Боишься?', expect: ['不怕', '怕'], answer: '我不怕。', answer_ru: 'Не боюсь.', opts: ['我不怕。', '我要喝水。', '天气很好。'] },
      { say: '说，你准备好了没有？', py: 'shuō, nǐ zhǔnbèi hǎo le méiyǒu?', ru: 'Говори: готов или нет?', expect: ['准备', '好了', '没有'], answer: '我准备好了。', answer_ru: 'Я готов.', opts: ['我准备好了。', '我不知道他。', '这里有茶。'] },
      { say: '你的身体怎么样？', py: 'nǐ de shēntǐ zěnmeyàng?', ru: 'Как твоё здоровье?', expect: ['身体', '很好', '不舒服'], answer: '我身体很好。', answer_ru: 'Я здоров.', opts: ['我身体很好。', '我有三本书。', '他去商店了。'] },
      { say: '一句话，说说你的计划。', py: 'yí jù huà, shuōshuo nǐ de jìhuà.', ru: 'Одной фразой — твой план.', expect: ['我打算', '我想', '计划'], answer: '我打算明年去中国。', answer_ru: 'Собираюсь в следующем году поехать в Китай.', opts: ['我打算明年去中国。', '这个太贵了。', '我在喝茶。'] },
      { say: '这条路很危险，你还走吗？', py: 'zhè tiáo lù hěn wēixiǎn, nǐ hái zǒu ma?', ru: 'Дорога опасна. Всё равно пойдёшь?', expect: ['还', '走', '不怕', '要'], answer: '我还是要走。', answer_ru: 'Всё равно пойду.', opts: ['我还是要走。', '我吃了饭。', '他很累。'] },
      { say: '记住我的名字！我是谁？', py: 'jìzhù wǒ de míngzi! wǒ shì shéi?', ru: 'Запомни моё имя! Кто я?', expect: ['将军', '虎'], answer: '你是虎将军。', answer_ru: 'Ты Тигр-Генерал.', opts: ['你是虎将军。', '你是我朋友。', '你是老师。'] },
    ],
  };

  function fromBank(bossId, n, avoid) {
    const bank = BANK[bossId] || BANK.b1;
    const key = r => r.say.slice(0, 40);
    const seen = new Set(avoid || []);
    const fresh = HskReal.shuffle(bank.filter(r => !seen.has(key(r))));
    const rest = HskReal.shuffle(bank.filter(r => seen.has(key(r))));
    return [...fresh, ...rest].slice(0, n).map(r => Object.assign({}, r));
  }

  /* Бой: пробуем Claude Fable, иначе банк */
  async function rounds(boss, level, n, avoid) {
    const conf = window.PUSH_CONF || {};
    if (conf.url) {
      try {
        const ctl = new AbortController();
        const to = setTimeout(() => ctl.abort(), 20000);
        const r = await fetch(conf.url + '/boss', {
          method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctl.signal,
          body: JSON.stringify({ boss: { zh: boss.zh, ru: boss.ru, style: boss.style, topic: boss.topic }, level, rounds: n, avoid }),
        });
        clearTimeout(to);
        const d = await r.json();
        if (d && d.ok && Array.isArray(d.rounds) && d.rounds.length) {
          const ok = d.rounds.filter(x => x && x.say && Array.isArray(x.expect) && x.expect.length);
          if (ok.length >= n) return { src: 'fable', list: ok.slice(0, n) };
        }
      } catch (e) { /* сеть или ключ — уходим в банк */ }
    }
    return { src: 'bank', list: fromBank(boss.id, n, avoid) };
  }

  /* ── голос ── */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const canListen = () => !!SR;
  function listen(ms = 7000) {
    return new Promise((resolve, reject) => {
      if (!SR) return reject(new Error('нет распознавания речи'));
      const r = new SR();
      r.lang = 'zh-CN'; r.interimResults = false; r.maxAlternatives = 3;
      let done = false;
      const finish = (v, err) => { if (done) return; done = true; try { r.stop(); } catch (e) { /* ignore */ } err ? reject(err) : resolve(v); };
      r.onresult = e => { const alts = []; for (let i = 0; i < e.results[0].length; i++) alts.push(e.results[0][i].transcript); finish(alts); };
      r.onerror = e => finish(null, new Error(e.error === 'not-allowed' ? 'нет доступа к микрофону' : 'не расслышал'));
      r.onend = () => finish([]);
      setTimeout(() => finish([]), ms);
      try { r.start(); } catch (e) { finish(null, e); }
    });
  }
  const norm = t => String(t || '').replace(/[\s，。！？、,.!?;:'"·]/g, '');
  function judge(round, said) {
    const alts = (Array.isArray(said) ? said : [said]).map(norm).filter(Boolean);
    if (!alts.length) return false;
    const keys = (round.expect || []).map(norm).filter(Boolean);
    const ans = norm(round.answer);
    return alts.some(a => keys.some(k => a.includes(k)) || (ans && (a === ans || (a.length > 2 && ans.includes(a)))));
  }

  return { BANK, rounds, fromBank, canListen, listen, judge, norm };
})();
