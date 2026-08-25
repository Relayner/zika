/* Музыка боя: короткий пентатонный мотив на WebAudio, у каждого босса своя тоника и характер. */
window.BossMusic = (() => {
  const PENT = { A: 220, C: 261.63, D: 293.66, E: 329.63, G: 392 };
  let ctx = null, timer = null, gain = null, on = false;
  const nowCtx = () => { if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (C) ctx = new C(); } return ctx; };
  const enabled = () => Sound && Sound.enabled;

  function blip(f, t, dur, type, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(gain); o.start(t); o.stop(t + dur + 0.05);
  }
  function drum(t, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(gain); o.start(t); o.stop(t + 0.26);
  }
  function start(boss) {
    if (!enabled() || !nowCtx()) return;
    stop();
    on = true;
    gain = ctx.createGain(); gain.gain.value = 0.14; gain.connect(ctx.destination);
    const root = PENT[boss.note] || PENT.A;
    const scale = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3].map(x => root * x);
    const fast = boss.lvl >= 3;
    const step = fast ? 0.28 : 0.36;
    let k = 0;
    const loop = () => {
      if (!on || !ctx) return;
      const t = ctx.currentTime + 0.05;
      const bar = [0, 2, 4, 2, 3, 1, 2, 0];
      for (let i = 0; i < bar.length; i++) {
        blip(scale[bar[(i + k) % bar.length]], t + i * step, step * 0.9, fast ? 'square' : 'triangle', fast ? 0.16 : 0.2);
        if (i % 2 === 0) drum(t + i * step, fast ? 0.5 : 0.35);
      }
      k++;
      timer = setTimeout(loop, bar.length * step * 1000);
    };
    try { if (ctx.state === 'suspended') ctx.resume(); } catch (e) { /* ignore */ }
    loop();
  }
  function stop() { on = false; if (timer) { clearTimeout(timer); timer = null; } if (gain) { try { gain.gain.setTargetAtTime(0, ctx.currentTime, 0.05); } catch (e) { /* ignore */ } gain = null; } }
  function finish(won) {
    stop();
    if (!enabled() || !nowCtx()) return;
    gain = ctx.createGain(); gain.gain.value = 0.18; gain.connect(ctx.destination);
    const t = ctx.currentTime + 0.05;
    const seq = won ? [261.63, 329.63, 392, 523.25] : [392, 329.63, 261.63, 196];
    seq.forEach((f, i) => blip(f, t + i * 0.16, 0.3, 'triangle', 0.22));
    if (won) { drum(t, 0.5); drum(t + 0.5, 0.5); }
  }
  return { start, stop, finish };
})();
