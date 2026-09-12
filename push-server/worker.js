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
const localParts = tz => {
  const tzMin = Number.isFinite(+tz) ? +tz : 0;   /* пояс может прийти строкой — тогда считаем по UTC */
  const d = new Date(Date.now() + tzMin * 60000);
  return { day: d.toISOString().slice(0, 10), hour: d.getUTCHours() + d.getUTCMinutes() / 60 };
};

/* Модель: тестовая методика идёт на fable-5-1, текущая остаётся на прежней — у существующих
   пользователей поведение не меняется, пока они не включат тестовую книгу. */
const modelFor = body => (body && body.ver === 'v2' ? 'claude-fable-5-1' : 'claude-fable-5');
const MAX_BLOB = 2 * 1024 * 1024;

export default {
  async fetch(req, env, ctx) {
    /* Любая ошибка обязана вернуться с заголовками доступа: иначе на телефоне
       она неотличима от пропавшей сети и чинить её вслепую. */
    try { return await handle(req, env, ctx); }
    catch (e) { return json({ error: 'crash', detail: String((e && e.message) || e).slice(0, 200) }, 500); }
  },
  async scheduled(ev, env, ctx) { ctx.waitUntil(runCron(env)); },
};

async function handle(req, env) {
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
      rec.report = { date: String(body.date || ''), points: +body.points || 0, done: !!body.done, toCap: Math.max(0, +body.toCap || 0), cap: +body.cap || 400, at: Date.now() };
      if (body.days != null) rec.days = Math.max(0, body.days | 0);
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
        body: JSON.stringify({ model: modelFor(body), max_tokens: 4000, system: sys, messages: [{ role: 'user', content: 'Сгенерируй бой. Отвечай только JSON, без пояснений и без markdown.' }] }),
      });
      if (!r.ok) return json({ error: 'upstream', status: r.status, detail: (await r.text()).slice(0, 300) }, 502);
      const data = await r.json();
      const text = (data.content || []).map(c => c.text || '').join('').trim();
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return json({ error: 'bad_json', stop: data.stop_reason }, 502);
      try { return json({ ok: true, ...JSON.parse(m[0]) }); } catch (e) { return json({ error: 'bad_json', stop: data.stop_reason, len: text.length }, 502); }
    }
    /* Тренер: раз в день Fable смотрит стату ученика и советует, из чего собрать день */
    if (url.pathname === '/coach') {
      if (!env.ANTHROPIC_API_KEY) return json({ error: 'no_key' }, 503);
      const st = body.stats || {};
      const sys = [
        'Ты методист китайского в учебном приложении. По статистике ученика составь план на день.',
        'Верни СТРОГО JSON без markdown: {"focus":"навык из списка listen/read/write/hand/speak","mix":{"phon":N,"handBasics":N,"review":N,"sprint":N,"drill":N,"hand":N,"boss":N},"message":"1-2 фразы ученику по-русски, тёплые и конкретные, без воды"}',
        'mix — сколько шагов каждого типа положить в поток (всего 4-9): phon — урок раздела «Звучание» (слог, тоны, пиньинь; всего 11 уроков, до 3 в день), handBasics — урок основ письма (черты, порядок; всего 3), review — повторение слов по срокам, sprint — урок программы HSK, drill — тренировка слабого навыка, hand — письмо слов от руки, boss — бой с боссом (0 или 1).',
        'Правила: если beginner=true и phonDone<11 — сначала phon (2-3 шага) и handBasics (1, пока handBasicsDone<3), sprint не больше 1 и только при phonDone>=2, drill 0, boss 0, всего 3-5 шагов; если просрочено много слов (due больше 15) — review не меньше 2; слабый навык получает больше drill; boss только если ученик занимался вчера и не новичок.',
      ].join('\n');
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-fable-5', max_tokens: 600, system: sys, messages: [{ role: 'user', content: 'Статистика ученика: ' + JSON.stringify(st) + '\nСоставь план. Только JSON.' }] }),
      });
      if (!r.ok) return json({ error: 'upstream', status: r.status }, 502);
      const data = await r.json();
      const text = (data.content || []).map(c => c.text || '').join('');
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return json({ error: 'bad_json' }, 502);
      try { return json({ ok: true, plan: JSON.parse(m[0]) }); } catch (e) { return json({ error: 'bad_json' }, 502); }
    }
    /* Копия по коду: сервер видит только шифротекст, ключ и слова остаются на телефоне */
    if (url.pathname === '/copy') {
      const id = String(body.id || '');
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) return json({ error: 'bad id' }, 400);
      if (body.op === 'get') {
        const raw = await env.SUBS.get('c:' + id);
        if (!raw) return json({ ok: false, missing: true });
        const rec = JSON.parse(raw);
        return json({ ok: true, blob: rec.blob, at: rec.at, size: rec.size });
      }
      if (body.op === 'put') {
        const blob = String(body.blob || '');
        if (!blob || blob.length > MAX_BLOB) return json({ error: 'bad blob' }, 400);
        await env.SUBS.put('c:' + id, JSON.stringify({ blob, at: Date.now(), size: blob.length }));
        return json({ ok: true, at: Date.now(), size: blob.length });
      }
      return json({ error: 'bad op' }, 400);
    }
    /* Спорное задание: жалоба копится, разбирает владелец */
    if (url.pathname === '/dispute') {
      const item = String(body.item || '').slice(0, 120);
      if (!item) return json({ error: 'bad item' }, 400);
      const key = 'd:' + item;
      const prev = JSON.parse((await env.SUBS.get(key)) || '{"n":0,"notes":[]}');
      prev.n++;
      prev.at = Date.now();
      if (body.note) prev.notes = [...(prev.notes || []), String(body.note).slice(0, 300)].slice(-20);
      if (body.ctx) prev.ctx = String(body.ctx).slice(0, 400);
      await env.SUBS.put(key, JSON.stringify(prev));
      return json({ ok: true, n: prev.n });
    }
    /* Разбор речи и письма: считаем СЛУЧАИ — сколько раз конструкция была нужна
       и сколько раз получилась, а не «ошибок на сто слов». */
    if (url.pathname === '/check') {
      if (!env.ANTHROPIC_API_KEY) return json({ error: 'no_key' }, 503);
      const text = String(body.text || '').slice(0, 1200);
      if (text.length < 8) return json({ error: 'short' }, 400);
      const did = String(body.did || '').slice(0, 40).replace(/[^A-Za-z0-9_-]/g, '');
      if (!did) return json({ error: 'no_device' }, 400);
      const day = localParts(body.tz).day;
      const ck = 'k:' + did;
      const quota = JSON.parse((await env.SUBS.get(ck)) || '{}');
      if (quota.day !== day) { quota.day = day; quota.n = 0; }
      if (quota.n >= 4) return json({ error: 'quota', n: quota.n }, 429);
      const lvl = Math.min(4, Math.max(1, +body.level || 1));
      const targets = (body.targets || []).slice(0, 6).map(t => '- ' + String(t.node || '').slice(0, 40) + ': ' + String(t.rule || '').slice(0, 160));
      const fires = (body.fires || []).slice(0, 3).map(f => '- ' + String(f.ru || '').slice(0, 80));
      const sys = [
        'Ты — Э. Крэйн, архивариус: разбираешь запись ученика, который учит китайский как иностранный (родной русский), уровень HSK ' + lvl + '.',
        'Текст пришёл от распознавания речи или набран с клавиатуры. Разбирай только китайский текст; латиницу и русские слова считай обрывками распознавания и не считай ошибками.',
        'ГЛАВНОЕ: считай СЛУЧАИ — сколько раз конструкция была НУЖНА по смыслу (obligatory context) и сколько раз получилась. Не считай «ошибок на сто слов».',
        targets.length ? 'Конструкции-мишени этого задания:\n' + targets.join('\n') : '',
        fires.length ? 'Привычки, которые у ученика ломаются раз за разом:\n' + fires.join('\n') : '',
        'Чего НЕ ищешь: произношение, тоны, интонацию, пунктуацию, разнобой упрощённых и традиционных знаков. Распознавание речи их не передаёт — молчи о них.',
        'Верни СТРОГО JSON без markdown и пояснений:',
        '{"corrected":"исправленный китайский текст целиком","cases":[{"node":"ключ конструкции","need":N,"ok":M}],"findings":[{"quote":"цитата до 12 знаков","fix":"как верно","node":"ключ или пусто","trap":"краткий ключ привычки латиницей, напр. le-missing, mw-ge, bu-vs-mei, word-order","sev":"ломает смысл|заметна|оговорка","why":"объяснение по-русски одной фразой","l1":"как это у нас и почему здесь иначе"}],"good":["что вышло верно, по-русски, до 3 пунктов"],"rubric":{"level":"A1|A2|B1|B2","note":"одна фраза по-русски"}}',
        'Не больше 8 находок. Если текст короткий или бессвязный — верни пустые findings и честную rubric. Объяснения только по-русски.',
      ].filter(Boolean).join('\n');
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: modelFor(body), max_tokens: 3000, system: sys, messages: [{ role: 'user', content: 'Запись ученика:\n' + text }] }),
      });
      if (!r.ok) return json({ error: 'upstream', status: r.status, detail: (await r.text()).slice(0, 300) }, 502);
      const data = await r.json();
      const out = (data.content || []).map(c => c.text || '').join('').trim();
      const m = out.match(/\{[\s\S]*\}/);
      if (!m) return json({ error: 'bad_json', stop: data.stop_reason }, 502);
      let parsed;
      try { parsed = JSON.parse(m[0]); } catch (e) { return json({ error: 'bad_json', stop: data.stop_reason }, 502); }
      quota.n++; quota.at = Date.now();
      await env.SUBS.put(ck, JSON.stringify(quota), { expirationTtl: 172800 });
      return json({ ok: true, left: Math.max(0, 4 - quota.n), ...parsed });
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
}

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
        /* новичок (меньше трёх записанных дней): один спокойный пуш вечером, без угроз; старые подписки без отчёта — ветераны */
        const newbie = rec.days != null && rec.days < 3;
        if (newbie && (rec.push.count >= 1 || hour < 18)) continue;
        if (rec.push.count >= 4) continue;
        if (Date.now() - rec.push.last < 2.4 * 3600e3) continue;
        let mood = newbie ? 0 : hour < 15 ? 0 : hour < 18 ? 1 : hour < 21 ? 2 : 3;
        if (toCap != null && toCap <= 120) mood = Math.max(0, mood - 1);
        const n = toCap != null ? toCap : (newbie ? 150 : 400);
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
