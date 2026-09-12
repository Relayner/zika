/* Назначение сокровищ: экономика без стока не работает.
   До сих пор 22 предмета лежали мёртвым грузом («на что тратить — позже»). Здесь у части
   предметов появляется применение. Предметы тратятся; что потрачено — видно в сокровищнице.
   Это часть тестовой методики: щит живёт в книге v2, книга v1 о нём ничего не знает. */
window.Sinks = (() => {
  const { state, actions, esc, toast, sheet, closeSheet, confirm, persist, render } = App;

  /* Предмет → что он делает. Взято по смыслу самого предмета, а не наугад. */
  const USES = {
    tally: { kind: 'shield', ru: 'Выставить щит похода', zh: '虎符', cap: 1,
      d: 'Сложенная тигровая бирка двигает войско: один пропущенный день не откатит поход. Тратится сама, в запасе не больше одной.' },
    ingot: { kind: 'life', ru: 'Взять в бой запасную жизнь', zh: '金元宝', cap: 2,
      d: 'Слиток-лодочка: в следующем бою на одну жизнь больше. Очки боя за это идут с коэффициентом 0,85.' },
    jade: { kind: 'life', ru: 'Взять в бой запасную жизнь', zh: '玉佩', cap: 2,
      d: 'Нефрит благородного мужа: в следующем бою на одну жизнь больше. Очки боя идут с коэффициентом 0,85.' },
    sunzi: { kind: 'hint', ru: 'Подсказка стратега', zh: '孙子兵法', cap: 3,
      d: 'Тринадцать глав: одна дополнительная подсказка в бою сверх обычного набора.' },
    bamboo: { kind: 'hint', ru: 'Подсказка стратега', zh: '竹简', cap: 3,
      d: 'Дощечки с записями: одна дополнительная подсказка в бою сверх обычного набора.' },
    pearl: { kind: 'lantern', ru: 'Фонарь на знак', zh: '夜明珠', cap: 2,
      d: 'Светит без свечи: в письме от руки покажет бледный образец знака целиком, а не одну черту.' },
  };
  const KINDS = {
    shield: { ru: 'Щит похода', d: 'один пропущенный день не откатит поход' },
    life: { ru: 'Запасная жизнь', d: 'на одну жизнь больше в следующем бою' },
    hint: { ru: 'Подсказка', d: 'одна лишняя подсказка в бою' },
    lantern: { ru: 'Фонарь', d: 'образец знака целиком в письме от руки' },
  };

  const camp = () => Campaign.ensureChests(state.campaign);
  const armed = c => ((c || camp()).armed || ((c || camp()).armed = {}));
  const have = id => (camp().inventory || {})[id] || 0;
  const count = kind => armed()[kind] || 0;

  /* Применить предмет: он тратится, эффект кладётся в открытую книгу похода */
  function use(id) {
    const u = USES[id];
    if (!u || have(id) < 1) return false;
    const c = camp();
    if (count(u.kind) >= u.cap) return false;
    c.inventory[id]--;
    if (!c.inventory[id]) delete c.inventory[id];
    armed(c)[u.kind] = count(u.kind) + 1;
    (c.spent || (c.spent = {}))[id] = (c.spent[id] || 0) + 1;
    return true;
  }
  /* Щит тратится сам, когда день не набрал перехода (см. campaign.js) */
  function spendShield(c) {
    if (!c || !c.armed || !c.armed.shield) return false;
    c.armed.shield--;
    if (!c.armed.shield) delete c.armed.shield;
    c.shieldUsed = (c.shieldUsed || 0) + 1;
    return true;
  }
  /* Взять припасённое в бой: возвращает, сколько снято */
  function take(kind, n = 1) {
    const c = camp();
    const k = Math.min(n, count(kind));
    if (!k) return 0;
    c.armed[kind] -= k;
    if (!c.armed[kind]) delete c.armed[kind];
    return k;
  }

  /* Панель в сокровищнице */
  function panel() {
    if (!window.Ledger || !Ledger.is2(state)) return '';
    const c = camp();
    const rows = Object.keys(USES).filter(id => have(id) > 0).map(id => {
      const u = USES[id], full = count(u.kind) >= u.cap;
      return `<button class="row tap" data-action="sink-use" data-id="${id}" ${full ? 'disabled' : ''}>
        <div><div class="row-t"><span class="zh">${u.zh}</span> · ${esc(u.ru)}${have(id) > 1 ? ' ×' + have(id) : ''}</div><div class="row-s">${full ? 'уже припасено, больше не нужно' : esc(u.d)}</div></div>
        <div class="row-r"><span class="badge ${full ? '' : 'mid'}">${full ? 'есть' : 'применить'}</span></div></button>`;
    }).join('');
    const ready = Object.keys(KINDS).filter(k => count(k)).map(k => `<span class="chip on">${KINDS[k].ru}${count(k) > 1 ? ' ×' + count(k) : ''}</span>`).join('');
    const spent = Object.values(c.spent || {}).reduce((a, b) => a + b, 0);
    return `<div class="panel"><div class="flabel">Что можно применить</div>
      ${ready ? `<div class="chips" style="margin-bottom:8px">${ready}</div>` : ''}
      ${rows || '<div class="hint" style="margin:0">Пока нечего: применение есть у тигровой бирки, слитка, нефрита, свитка, дощечек и жемчужины.</div>'}
      ${c.shieldUsed ? `<div class="hint">Щит выручал ${c.shieldUsed} ${c.shieldUsed === 1 ? 'раз' : 'раза'}.</div>` : ''}
      ${spent ? `<div class="hint">Потрачено предметов: ${spent}.</div>` : ''}</div>`;
  }

  actions['sink-use'] = async el => {
    const id = el.dataset.id, u = USES[id];
    if (!u) return;
    const ok = await confirm(u.d + '\n\nПредмет будет потрачен.', { ok: 'Применить', title: u.zh + ' · ' + u.ru });
    if (!ok) return;
    if (!use(id)) return toast('Не получилось: предмета нет или уже припасено достаточно');
    persist();
    toast(KINDS[u.kind].ru + ' наготове', 2600);
    render();
  };

  return { USES, KINDS, use, take, count, spendShield, panel };
})();
