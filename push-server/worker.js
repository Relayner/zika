/* Сервер пушей 字卡: подписки в KV, отчёты о дневных очках, кроновая рассылка Наставника Луна с эскалацией. */
import { sendPush } from './webpush.js';

const TITLES = ['Наставник Лун 龙教头', 'Лун волнуется 龙教头', 'Лун сердится 龙教头', 'Лун теряет терпение 龙教头'];
const PHRASES = [
  ['Полдень миновал. До перехода {n} очков — минут двадцать, не больше.',
   'Лун потягивается: «Небольшая тренировка — и день зачтён». Осталось {n}.',
   'Свиток дня ещё пуст. {n} очков — и гуляй.',
   'Сундук сам себя не заработает. До перехода {n}.'],
  ['День короче, чем кажется: до перехода ещё {n}.',
   'Лун грызёт кисточку: «{n} очков… успеем?»',
   'Полдня прошло, а свиток почти пуст: {n} до перехода.',
   'Не откладывай на вечер двадцать минут дела. Осталось {n}.'],
  ['Лун постукивает когтем по черепице: {n} очков. Я жду.',
   'Солнце садится, а перехода нет. {n}!',
   'Лун свернулся у двери и не уйдёт, пока не увидит {n} очков.',
   'Поход не прощает пустых дней. {n} до перехода.'],
  ['В темноте светятся глаза Луна: «{n} очков — или на рассвете поход откатится».',
   'Дракон помнит все пропущенные дни. {n} до перехода.',
   'Гром над крышей — это не гроза, это Лун. {n} очков!',
   'Последние часы дня. {n} очков между тобой и откатом.'],
];

const CORS = {
  'Access-Control-Allow-Origin': 'https://relayner.github.io',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json', ...CORS } });
async function idOf(endpoint) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint));
  return btoa(String.fromCharCode(...new Uint8Array(h))).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
}
const localParts = tzMin => {
  const d = new Date(Date.now() + (tzMin || 0) * 60000);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours() + d.getUTCMinutes() / 60 };
};

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    if (req.method === 'GET') return json({ app: 'zika-push', ok: true });
    let body = {};
    try { body = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
    if (url.pathname === '/subscribe') {
      const sub = body.sub;
      if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return json({ error: 'bad sub' }, 400);
      const id = await idOf(sub.endpoint);
      const prev = JSON.parse((await env.SUBS.get('s:' + id)) || '{}');
      await env.SUBS.put('s:' + id, JSON.stringify({ ...prev, sub, tz: body.tz | 0, created: prev.created || Date.now() }));
      return json({ ok: true });
    }
    if (url.pathname === '/report') {
      if (!body.endpoint) return json({ error: 'no endpoint' }, 400);
      const id = await idOf(body.endpoint);
      const raw = await env.SUBS.get('s:' + id);
      if (!raw) return json({ ok: false, resubscribe: true });
      const rec = JSON.parse(raw);
      rec.report = { date: String(body.date || ''), points: +body.points || 0, done: !!body.done, toCap: Math.max(0, +body.toCap || 0), at: Date.now() };
      if (body.tz != null) rec.tz = body.tz | 0;
      await env.SUBS.put('s:' + id, JSON.stringify(rec));
      return json({ ok: true });
    }
    /* Диалоги босса: генерирует Claude Fable, ключ живёт секретом воркера и в приложение не попадает */
    if (url.pathname === '/boss') {
      if (!env.ANTHROPIC_API_KEY) return json({ error: 'no_key' }, 503);
      const b = body.boss || {};
      const lvl = Math.min(4, Math.max(1, body.level | 0 || 1));
      const rounds = Math.min(8, Math.max(1, body.rounds | 0 || 5));
      const avoid = (body.avoid || []).slice(0, 120);
      const sys = [
        'Ты пишешь диалоги для приложения, где человек учит китайский и голосом отвечает боссу.',
        'Персонаж: ' + (b.zh || '') + ' (' + (b.ru || '') + '). Характер: ' + (b.style || '') + '.',
        'Темы этого босса: ' + (b.topic || '') + '.',
        'Уровень ученика: HSK ' + lvl + '. Используй ТОЛЬКО лексику и грамматику HSK 1-' + lvl + '.',
        'Верни СТРОГО JSON без markdown: {"rounds":[{"say":"фраза босса по-китайски","py":"пиньинь с тонами","ru":"перевод фразы на русский","expect":["ключевые слова или обороты верного ответа, по-китайски"],"answer":"образцовый ответ по-китайски","answer_ru":"его перевод","opts":["верный ответ","неверный 1","неверный 2"]}]}',
        'Ровно ' + rounds + ' раундов. Каждый say — реплика босса, на которую человек отвечает голосом одной короткой фразой.',
        'expect: 2-5 вариантов ключевых слов, любое из которых означает, что человек ответил по существу. Пиши их иероглифами, без пунктуации.',
        'opts: первый элемент всегда верный ответ, два других правдоподобны, но неверны.',
        'Реплики короткие: 4-12 иероглифов. Держи характер персонажа.',
        avoid.length ? 'НЕ повторяй эти реплики, они уже были: ' + avoid.join(' / ') : '',
      ].filter(Boolean).join('\n');
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-fable-5', max_tokens: 2000, system: sys, messages: [{ role: 'user', content: 'Сгенерируй бой. Отвечай только JSON.' }] }),
      });
      if (!r.ok) return json({ error: 'upstream', status: r.status, detail: (await r.text()).slice(0, 300) }, 502);
      const data = await r.json();
      const text = (data.content || []).map(c => c.text || '').join('').trim();
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return json({ error: 'bad_json' }, 502);
      try { return json({ ok: true, ...JSON.parse(m[0]) }); } catch (e) { return json({ error: 'bad_json' }, 502); }
    }
    if (url.pathname === '/test') {
      if (!body.endpoint) return json({ error: 'no endpoint' }, 400);
      const raw = await env.SUBS.get('s:' + (await idOf(body.endpoint)));
      if (!raw) return json({ ok: false, resubscribe: true });
      const rec = JSON.parse(raw);
      const res = await sendPush(rec.sub, JSON.stringify({ title: 'Наставник Лун 龙教头', body: 'Связь работает! Лун вернётся после полудня, если день будет без перехода.' }), { subject: 'mailto:kellianar@gmail.com', publicKey: env.VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE });
      return json({ ok: res.ok || res.status === 201, status: res.status });
    }
    if (url.pathname === '/unsubscribe') {
      if (!body.endpoint) return json({ error: 'no endpoint' }, 400);
      await env.SUBS.delete('s:' + (await idOf(body.endpoint)));
      return json({ ok: true });
    }
    return json({ error: 'not found' }, 404);
  },
  async scheduled(ev, env, ctx) { ctx.waitUntil(runCron(env)); },
};

async function runCron(env) {
  const vapid = { subject: 'mailto:kellianar@gmail.com', publicKey: env.VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE };
  let cursor;
  do {
    const list = await env.SUBS.list({ prefix: 's:', cursor });
    cursor = list.list_complete ? null : list.cursor;
    for (const k of list.keys) {
      try {
        const raw = await env.SUBS.get(k.name);
        if (!raw) continue;
        const rec = JSON.parse(raw);
        const { day, hour } = localParts(rec.tz);
        if (hour < 12.5 || hour >= 22.8) continue;
        const reported = rec.report && rec.report.date === day;
        if (reported && rec.report.done) continue;
        const toCap = reported ? rec.report.toCap : null;
        if (!rec.push || rec.push.day !== day) rec.push = { day, count: 0, last: 0 };
        if (rec.push.count >= 4) continue;
        if (Date.now() - rec.push.last < 2.4 * 3600e3) continue;
        let mood = hour < 15 ? 0 : hour < 18 ? 1 : hour < 21 ? 2 : 3;
        if (toCap != null && toCap <= 120) mood = Math.max(0, mood - 1);
        const n = toCap != null ? toCap : 400;
        const bank = PHRASES[mood];
        const text = bank[(new Date().getDate() + rec.push.count) % bank.length].replace('{n}', String(n));
        const res = await sendPush(rec.sub, JSON.stringify({ title: TITLES[mood], body: text, mood }), vapid);
        if (res.status === 404 || res.status === 410) { await env.SUBS.delete(k.name); continue; }
        rec.push.count++; rec.push.last = Date.now();
        await env.SUBS.put(k.name, JSON.stringify(rec));
      } catch (e) { /* одна битая подписка не должна ломать рассылку */ }
    }
  } while (cursor);
}
