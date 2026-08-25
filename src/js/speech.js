/* Озвучка: китайский голос через speechSynthesis (работает офлайн со встроенными голосами iOS). */
window.Speech = (() => {
  const ok = typeof window !== 'undefined' && 'speechSynthesis' in window;
  if (ok) try { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices(); } catch (e) { /* ignore */ }
  function zhVoice() {
    if (!ok) return null;
    const vs = speechSynthesis.getVoices();
    return vs.find(v => /zh[-_](CN|Hans)/i.test(v.lang)) || vs.find(v => /^zh/i.test(v.lang)) || null;
  }
  const available = () => ok && !!zhVoice();
  /* rate числом — как раньше; объектом {rate, pitch} — голос персонажа */
  function say(text, opt = 0.8) {
    if (!ok) return false;
    const o = typeof opt === 'object' && opt ? opt : { rate: opt, pitch: 1 };
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      const v = zhVoice();
      if (v) u.voice = v;
      u.lang = 'zh-CN';
      u.rate = o.rate == null ? 0.8 : o.rate;
      u.pitch = o.pitch == null ? 1 : o.pitch;
      speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }
  /* Проговорить и дождаться конца (для экзамена): resolve по onend, страховка по таймауту */
  function speak(text, rate = 0.78) {
    return new Promise(res => {
      if (!ok) return res(false);
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(String(text));
        const v = zhVoice();
        if (v) u.voice = v;
        u.lang = 'zh-CN'; u.rate = rate;
        let done = false;
        const fin = () => { if (!done) { done = true; res(true); } };
        u.onend = fin; u.onerror = fin;
        setTimeout(fin, 1500 + String(text).length * 450);
        speechSynthesis.speak(u);
      } catch (e) { res(false); }
    });
  }
  return { say, speak, available, zhVoice };
})();
