/* Звуки: синтез через Web Audio, без файлов. Клик, переворот, удача, неудача, финал. */
window.Sound = (() => {
  let ctx = null, enabled = true, unlocked = false, noiseBuf = null;

  function getCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    return ctx;
  }
  function unlock() {
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    if (!unlocked) {
      try {
        const b = c.createBuffer(1, 1, 22050), s = c.createBufferSource();
        s.buffer = b; s.connect(c.destination); s.start(0);
      } catch (e) { /* ignore */ }
      unlocked = true;
    }
  }
  function env(g, t0, peak, attack, hold, release) {
    const p = g.gain;
    p.cancelScheduledValues(t0);
    p.setValueAtTime(0.0001, t0);
    p.linearRampToValueAtTime(peak, t0 + attack);
    p.setValueAtTime(peak, t0 + attack + hold);
    p.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  }
  function note({ freq, type = 'sine', at = 0, peak = 0.2, attack = 0.005, hold = 0.02, release = 0.15, sweepTo = null, detune = 0 }) {
    const c = getCtx();
    if (!c || !enabled) return;
    const t0 = c.currentTime + at, end = t0 + attack + hold + release;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, end);
    o.detune.value = detune;
    const g = c.createGain();
    env(g, t0, peak, attack, hold, release);
    o.connect(g).connect(c.destination);
    o.start(t0); o.stop(end + 0.05);
  }
  function noise({ at = 0, peak = 0.1, dur = 0.08, freq = 3000, type = 'bandpass', q = 1 }) {
    const c = getCtx();
    if (!c || !enabled) return;
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = c.currentTime + at;
    const s = c.createBufferSource(); s.buffer = noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    env(g, t0, peak, 0.003, dur * 0.2, dur * 0.8);
    s.connect(f).connect(g).connect(c.destination);
    s.start(t0); s.stop(t0 + dur + 0.05);
  }

  /* Короткий деревянный "ток" — кнопки */
  function click() {
    note({ freq: 1900, type: 'sine', peak: 0.07, hold: 0.004, release: 0.035 });
    noise({ peak: 0.035, dur: 0.03, freq: 4500, type: 'highpass' });
  }
  /* Шорох бумаги — переворот карточки */
  function flip() { noise({ peak: 0.07, dur: 0.2, freq: 1400, type: 'bandpass', q: 0.7 }); }
  /* Удача — щипок гучжэна, пентатоника вверх */
  function ok() {
    note({ freq: 659.25, type: 'triangle', peak: 0.17, release: 0.25 });
    note({ freq: 880, type: 'triangle', at: 0.09, peak: 0.17, release: 0.4 });
    note({ freq: 1760, type: 'sine', at: 0.09, peak: 0.045, release: 0.45 });
  }
  /* Неудача — глухой гонг вниз */
  function fail() {
    note({ freq: 220, type: 'triangle', peak: 0.2, hold: 0.05, release: 0.35, sweepTo: 140 });
    note({ freq: 110, type: 'sine', peak: 0.16, hold: 0.05, release: 0.45, sweepTo: 75 });
    noise({ peak: 0.05, dur: 0.12, freq: 380, type: 'lowpass' });
  }
  /* Финал теста: пройден — восходящая пентатоника, не пройден — нисходящая */
  function finish(good) {
    const seq = good ? [523.25, 587.33, 659.25, 783.99, 880, 1046.5] : [523.25, 493.88, 440, 392, 349.23];
    seq.forEach((f, i) => note({ freq: f, type: 'triangle', at: i * 0.09, peak: 0.15, release: 0.35 }));
    if (good) note({ freq: 2093, type: 'sine', at: seq.length * 0.09, peak: 0.05, release: 0.7 });
  }
  function setEnabled(v) { enabled = !!v; }
  function install() {
    const h = () => unlock();
    ['touchend', 'mousedown', 'keydown'].forEach(ev => document.addEventListener(ev, h, { passive: true }));
  }
  return { click, flip, ok, fail, finish, setEnabled, unlock, install, get enabled() { return enabled; } };
})();
