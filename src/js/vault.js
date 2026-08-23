/* Хранилище-сейф: версия схемы данных, резервная копия перед миграцией, миграции только вперёд и без удаления.
   Правило: обновление приложения никогда не стирает прогресс; неизвестные поля сохраняются как есть. */
window.Vault = (() => {
  const SCHEMA = 2;
  const pad3 = n => String(n).padStart(3, '0');
  /* v2: стабильные ID карточек HSK (по иероглифу, а не по номеру в списке) + очки похода в каждой попытке */
  function hskIdMap() {
    const map = {};
    [1, 2, 3].forEach(l => window.HSK[l].forEach((e, i) => { map['hsk' + l + '-' + pad3(i + 1)] = 'hsk' + l + ':' + e[0]; }));
    return map;
  }
  const MIGRATIONS = {
    2: async ctx => {
      const map = hskIdMap(), changed = [];
      for (const a of ctx.attempts) {
        let ch = false;
        for (const q of a.questions || []) if (map[q.cardId]) { q.cardId = map[q.cardId]; ch = true; }
        if (a.points == null) { a.points = Campaign.attemptPoints(a); ch = true; }
        if (ch) changed.push(a);
      }
      for (const c of ctx.cards) if (c.from && map[c.from]) c.from = map[c.from];
      if (changed.length) await Store.putAttempts(changed);
      return { attempts: changed.length };
    },
  };
  async function backup(label, ctx) {
    const snap = { at: Date.now(), schema: (ctx.meta && ctx.meta.schema) || 1, settings: ctx.settings, decks: ctx.decks, cards: ctx.cards, campaign: ctx.campaign, attempts: ctx.attempts };
    await Store.set('backup:' + label, snap);
    return snap;
  }
  /* Лёгкая ежедневная копия (без попыток — они в своём хранилище и не перезаписываются) */
  async function autoBackup(ctx) {
    const prev = await Store.get('backup:auto');
    if (prev && Stats.dayKey(prev.at) === Stats.dayKey(Date.now())) return false;
    await Store.set('backup:auto', { at: Date.now(), schema: SCHEMA, settings: ctx.settings, decks: ctx.decks, cards: ctx.cards, campaign: ctx.campaign, attemptsCount: ctx.attempts.length });
    return true;
  }
  /* ctx: { meta, settings, decks, cards, attempts, campaign } — мутируется на месте */
  async function migrate(ctx) {
    const fresh = !ctx.meta && !ctx.attempts.length && !ctx.decks.length && !ctx.cards.length;
    if (!ctx.meta) ctx.meta = { schema: fresh ? SCHEMA : 1, installedAt: Date.now() };
    const from = ctx.meta.schema || 1, log = [];
    if (from >= SCHEMA) { ctx.meta.schema = SCHEMA; return log; }
    await backup('v' + from, ctx);
    for (let v = from + 1; v <= SCHEMA; v++) {
      const m = MIGRATIONS[v];
      if (m) { const r = await m(ctx); log.push({ v, ...r }); }
      ctx.meta.schema = v; ctx.meta.migratedAt = Date.now();
      await Store.set('meta', ctx.meta);
    }
    return log;
  }
  async function listBackups() {
    const out = [];
    for (const k of ['backup:v1', 'backup:auto']) { const b = await Store.get(k); if (b) out.push({ key: k, at: b.at, schema: b.schema, attempts: b.attempts ? b.attempts.length : b.attemptsCount }); }
    return out;
  }
  return { SCHEMA, MIGRATIONS, hskIdMap, migrate, backup, autoBackup, listBackups };
})();
