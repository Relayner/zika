/* Порядок черт: траектории берутся из открытого набора Make Me a Hanzi (лицензия Arphic Public License).
   Координаты в поле 0…128, ось Y направлена вверх — на экран переводим через toScreen. */
window.Strokes = (() => {
  const FIELD = 128, BASE_Y = 112.5;
  let data = null, loading = null;

  function load() {
    if (data) return Promise.resolve(data);
    if (loading) return loading;
    loading = fetch('strokes.json').then(r => r.json()).then(d => { data = d; loading = null; return d; })
      .catch(e => { loading = null; throw new Error('не удалось загрузить траектории черт'); });
    return loading;
  }
  const ready = () => !!data;
  const of = ch => (data && data[ch]) || null;
  const has = ch => !!of(ch);
  const known = word => [...String(word)].every(has);
  /* поле знака → пиксели холста */
  const toScreen = (p, size) => [p[0] / FIELD * size, (BASE_Y - p[1]) / FIELD * size];

  /* ── сравнение нарисованной черты с образцом ── */
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  function resample(pts, n) {
    if (pts.length < 2) return Array.from({ length: n }, () => pts[0] || [0, 0]);
    const seg = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) { const d = dist(pts[i - 1], pts[i]); seg.push(d); total += d; }
    if (!total) return Array.from({ length: n }, () => pts[0]);
    const step = total / (n - 1), out = [pts[0]];
    let i = 1, acc = 0, need = step;
    while (out.length < n && i < pts.length) {
      const d = seg[i - 1];
      if (acc + d >= need) {
        const t = (need - acc) / d;
        out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]);
        need += step;
      } else { acc += d; i++; }
    }
    while (out.length < n) out.push(pts[pts.length - 1]);
    return out;
  }
  const len = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]); return s; };

  /* drawn — точки в том же поле 0…128 (ось Y вниз, как на экране); expected — медиана черты */
  function match(expected, drawn, opt = {}) {
    const tolStart = opt.start || 26, tolMean = opt.mean || 22;
    const exp = expected.map(p => [p[0], BASE_Y - p[1]]);          /* приводим образец к экранной оси */
    if (!drawn || drawn.length < 2) return { ok: false, why: 'слишком короткая черта' };
    const dLen = len(drawn), eLen = len(exp);
    if (dLen < Math.max(6, eLen * 0.35)) return { ok: false, why: 'черта короче, чем нужно' };
    const a = resample(exp, 16), b = resample(drawn, 16);
    const bRev = b.slice().reverse();
    const mean = arr => arr.reduce((s, p, i) => s + dist(a[i], p), 0) / arr.length;
    const mFwd = mean(b), mRev = mean(bRev);
    if (mRev < mFwd && mRev < tolMean) return { ok: false, why: 'черта ведётся в другую сторону' };
    if (dist(a[0], b[0]) > tolStart) return { ok: false, why: 'начало черты не там' };
    if (dist(a[15], b[15]) > tolStart) return { ok: false, why: 'конец черты не там' };
    if (mFwd > tolMean) return { ok: false, why: 'черта идёт мимо' };
    return { ok: true, score: Math.max(0, Math.round(100 - mFwd * 4)) };
  }
  return { FIELD, BASE_Y, load, ready, of, has, known, toScreen, match, resample };
})();
