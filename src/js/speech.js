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
  function say(text, rate = 0.8) {
    if (!ok) return false;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(text));
      const v = zhVoice();
      if (v) u.voice = v;
      u.lang = 'zh-CN'; u.rate = rate; u.pitch = 1;
      speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }
  return { say, available, zhVoice };
})();
