/* «Спорный вопрос»: жалоба на задание уходит на воркер, разбирает владелец.
   Локально задание с жалобой помечается и больше не подсовывается этому ученику. */
window.Dispute = (() => {
  const { state, actions, esc, toast, sheet, closeSheet, persist } = App;
  const box = () => (state.settings.disputes || (state.settings.disputes = {}));
  const marked = key => !!box()[key];

  /* Ссылка в разборе ответа */
  function link(key, ctx) {
    if (!key) return '';
    if (marked(key)) return '<div class="disp-done">Жалоба отправлена — спасибо, задание проверят</div>';
    return `<button class="disp-link" data-action="disp-open" data-k="${esc(key)}" data-c="${esc(JSON.stringify(ctx || {}))}" data-nosound>Спорный вопрос</button>`;
  }

  actions['disp-open'] = el => {
    const key = el.dataset.k;
    let ctx = {};
    try { ctx = JSON.parse(el.dataset.c || '{}'); } catch (e) { /* ignore */ }
    sheet(`<h3 class="sh-t">Спорный вопрос</h3>
      <div class="install-note"><p>Если задание кажется неверным — перевод не тот, верных ответов два, опечатка в пиньине — отправьте жалобу. Она уйдёт владельцу приложения вместе с идентификатором задания.</p>
      <p class="muted">${esc(ctx.hanzi || '')} · ${esc(key)}</p></div>
      <div class="seg wrap" id="disp-why">${[['wrong', 'Неверный ответ'], ['two', 'Верных два'], ['typo', 'Опечатка'], ['other', 'Другое']].map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div>
      <div class="field mt"><label>Что не так <span class="muted">· по желанию</span></label><input class="inp" id="disp-note" maxlength="200" placeholder="одной фразой"></div>
      <div class="btns"><button class="btn btn-primary btn-block" id="disp-send">Отправить</button><button class="btn btn-secondary btn-block" data-close>Отмена</button></div>`,
    s => {
      let why = 'other';
      const seg = s.querySelector('#disp-why');
      seg.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; why = b.dataset.v; [...seg.children].forEach(x => x.classList.toggle('on', x === b)); });
      s.querySelector('#disp-send').onclick = async () => {
        const note = (s.querySelector('#disp-note').value || '').trim();
        closeSheet();
        box()[key] = { at: Date.now(), why, note };
        persist();
        toast('Жалоба отправлена — задание больше не встретится', 2600);
        send(key, why, note, ctx);
      };
    });
  };

  async function send(key, why, note, ctx) {
    const conf = window.PUSH_CONF || {};
    if (!conf.url) return;
    try {
      await fetch(conf.url + '/dispute', { method: 'POST', headers: { 'content-type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ item: key, note: (why ? why + ': ' : '') + (note || ''), ctx: JSON.stringify(ctx || {}).slice(0, 300) }) });
    } catch (e) { /* уйдёт в следующий раз — жалоба уже помечена локально */ }
  }
  /* Задания с жалобой не показываем этому ученику */
  const skip = key => marked(key);
  const count = () => Object.keys(box()).length;

  return { link, skip, marked, count, send };
})();
