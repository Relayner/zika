/* Пиньинь: цифры тонов → диакритика, нормализация и сравнение. */
window.Pinyin = (() => {
  const VOWELS = {
    a: ['a', 'ā', 'á', 'ǎ', 'à'], e: ['e', 'ē', 'é', 'ě', 'è'], i: ['i', 'ī', 'í', 'ǐ', 'ì'],
    o: ['o', 'ō', 'ó', 'ǒ', 'ò'], u: ['u', 'ū', 'ú', 'ǔ', 'ù'], 'ü': ['ü', 'ǖ', 'ǘ', 'ǚ', 'ǜ'],
  };
  const MARK = {};
  for (const [base, arr] of Object.entries(VOWELS)) arr.forEach((ch, t) => {
    if (t) { MARK[ch] = [base, t]; MARK[ch.toUpperCase()] = [base, t]; }
  });

  function markSyllable(syl, tone) {
    if (tone < 1 || tone > 4) return syl;
    const low = syl.toLowerCase();
    let idx = -1;
    if (low.includes('a')) idx = low.indexOf('a');
    else if (low.includes('e')) idx = low.indexOf('e');
    else if (low.includes('ou')) idx = low.indexOf('o');
    else for (let i = low.length - 1; i >= 0; i--) if ('iouü'.includes(low[i])) { idx = i; break; }
    if (idx < 0) return syl;
    const ch = syl[idx], base = ch.toLowerCase();
    const arr = VOWELS[base];
    if (!arr) return syl;
    let m = arr[tone];
    if (ch !== base) m = m.toUpperCase();
    return syl.slice(0, idx) + m + syl.slice(idx + 1);
  }

  /* "ni3 hao3" → "nǐ hǎo"; "nv3"/"nu:3" → "nǚ"; уже размеченный текст не трогается */
  function toMarks(str) {
    return String(str || '').normalize('NFC')
      .replace(/u:/g, 'ü').replace(/U:/g, 'Ü')
      .replace(/v/g, 'ü').replace(/V/g, 'Ü')
      .replace(/([A-Za-zÜü]+)([0-5])/g, (m, s, t) => markSyllable(s, +t));
  }

  /* Разбор в сравнимую форму: буквы без тонов + последовательность тонов (1–4; нейтральный не учитывается) */
  function analyze(str) {
    const s = toMarks(str).normalize('NFC').toLowerCase();
    let letters = '';
    const tones = [];
    for (const ch of s) {
      if (MARK[ch]) { letters += MARK[ch][0]; tones.push(MARK[ch][1]); }
      else if (/[a-zü]/.test(ch)) letters += ch;
    }
    return { letters, tones };
  }

  /* 'exact' | 'tones' (буквы верны, тоны нет) | 'wrong' | 'empty' */
  function compare(expected, input) {
    const a = analyze(expected), b = analyze(input);
    if (!b.letters) return 'empty';
    if (a.letters !== b.letters) return 'wrong';
    return a.tones.join('') === b.tones.join('') ? 'exact' : 'tones';
  }

  function stripTones(str) {
    return toMarks(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC');
  }
  function syllables(str) {
    return toMarks(str).split(/[\s'’\-…]+/).reduce((n, chunk) => {
      const m = analyze(chunk).letters.match(/[aeiouü]+/g);
      return n + (m ? m.length : 0);
    }, 0);
  }
  function initial(str) {
    const m = analyze(str).letters.match(/^(zh|ch|sh|[bpmfdtnlgkhjqxzcsrwy])/);
    return m ? m[1] : '';
  }
  function tonePattern(str) { return analyze(str).tones.join(''); }

  return { toMarks, analyze, compare, stripTones, syllables, initial, tonePattern };
})();
