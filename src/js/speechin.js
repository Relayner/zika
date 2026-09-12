/* Длинная запись речи: человек говорит 30–90 секунд подряд, а не одну фразу боссу.

   Чем это отличается от bossgen.listen: там continuous = false, первая же финальная фраза
   заканчивает сессию, и всё укладывается в 8 секунд. Здесь наоборот: сессия непрерывная,
   финальные куски копятся, а браузер имеет право оборвать распознавание когда угодно —
   на iOS сессия живёт около минуты и закрывается сама. Поэтому запись переживает обрыв:
   пока не вышел общий срок, сессия поднимается заново (не больше трёх раз), а накопленные
   куски остаются. Возвращаем честно: сколько было перезапусков и что именно расслышано.

   Модуль ничего не решает за экран. Если распознавания нет или оно смолчало — вернётся
   пустой текст и причина; набор с клавиатуры вместо речи назначает вызывающий экран. */
window.SpeechIn = (() => {
  const MAX_RESTARTS = 3;          /* больше трёх подъёмов — это уже не обрыв, а отказ */
  const GAP_MS = 220;              /* пауза перед подъёмом: браузеру нужно отпустить микрофон */
  const DEFAULT_MS = 60000;

  const SR = () => (typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)) || null;
  const available = () => !!SR();

  let session = null;              /* текущая сессия — держим, чтобы гасить перед новой */
  let cancelled = false;
  let closeNow = null;             /* как закончить текущую запись: кнопка «Готово» не ждёт браузер */

  function kill(r) {
    if (!r) return;
    try { r.abort(); } catch (e) { try { r.stop(); } catch (e2) { /* ignore */ } }
  }
  /* Остановить запись снаружи (кнопка «Готово»): длинная запись обязана кончаться по желанию.
     Закрываем обещание сами, а не ждём onend: браузер может его и не прислать. */
  function stop() {
    cancelled = true;
    const r = session, close = closeNow;
    session = null; closeNow = null;
    kill(r);
    if (close) close(null);
  }

  const ERR = {
    'not-allowed': 'нет доступа к микрофону — разрешите его в настройках',
    'service-not-allowed': 'нет доступа к микрофону — разрешите его в настройках',
    'audio-capture': 'микрофон не найден',
    'network': 'распознаванию нужна сеть',
  };

  /* Никогда не бросает исключение: всегда отдаёт { text, segments, restarts, error, ms }.
     onPartial(interim, text) зовётся на каждом обновлении — экран показывает живую строку. */
  function listenLong(ms = DEFAULT_MS, onPartial) {
    const limit = Math.max(1000, Number(ms) || DEFAULT_MS);
    const startedAt = Date.now();
    return new Promise(resolve => {
      const Rec = SR();
      const segments = [];
      let restarts = 0, done = false, deadline = null, gap = null, current = null;

      const say = (interim) => {
        if (typeof onPartial !== 'function') return;
        try { onPartial(String(interim || ''), segments.join('')); } catch (e) { /* экран не должен ронять запись */ }
      };
      const finish = (error) => {
        if (done) return;
        done = true;
        clearTimeout(deadline); clearTimeout(gap);
        if (session === current) session = null;
        if (closeNow === finish) closeNow = null;
        kill(current);
        current = null;
        const text = segments.join('');
        /* Пустая запись без причины — всё равно причина: экран обязан знать, что предложить набор */
        resolve({ text, segments: segments.slice(), restarts, ms: Date.now() - startedAt,
          error: text ? null : (error || 'ничего не расслышано') });
      };
      closeNow = finish;

      if (!Rec) return finish('на этом устройстве нет распознавания речи');
      cancelled = false;
      kill(session); session = null;                         /* прошлая запись могла держать микрофон */
      deadline = setTimeout(() => finish('время вышло'), limit);

      const left = () => limit - (Date.now() - startedAt);

      function start() {
        if (done || cancelled) return finish(null);
        if (left() <= GAP_MS) return finish(null);
        let r;
        try { r = new Rec(); } catch (e) { return finish('микрофон занят, попробуйте ещё раз'); }
        current = r; session = r;
        r.lang = 'zh-CN';
        r.continuous = true;                                  /* главное отличие от короткого ответа боссу */
        r.interimResults = true;
        r.maxAlternatives = 1;
        r.onresult = e => {
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const res = e.results[i];
            const t = res[0] && res[0].transcript ? res[0].transcript : '';
            if (!t) continue;
            if (res.isFinal) segments.push(t.trim()); else interim += t;
          }
          say(interim);
        };
        r.onerror = e => {
          const code = (e && e.error) || '';
          if (ERR[code]) return finish(ERR[code]);             /* отказ в доступе не лечится подъёмом */
          r.__soft = true;                                     /* 'no-speech', 'aborted' — обрыв, а не отказ */
        };
        r.onend = () => {
          if (done || cancelled) return finish(null);
          if (restarts >= MAX_RESTARTS) return finish(segments.length ? null : 'распознавание обрывается');
          if (left() <= GAP_MS) return finish(null);
          restarts++;
          gap = setTimeout(start, GAP_MS);                     /* сессия кончилась сама — поднимаем заново */
        };
        try { r.start(); } catch (e) { finish('микрофон занят, попробуйте ещё раз'); }
      }
      start();
    });
  }

  return { MAX_RESTARTS, GAP_MS, DEFAULT_MS, available, listenLong, stop };
})();
