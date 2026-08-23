/* Коты-воины эпохи Троецарствия: 10 рангов, данные и векторные иллюстрации (тушь на бумаге). */
window.IMG_URL = key => (window.IMG && window.IMG[key]) || ('img/' + key + '.webp');
window.Cats = (() => {
  const RANKS = [
    { zh: '伙夫猫', py: 'huǒfū māo', ru: 'Кот-кашевар', motto: '兵马未动，粮草先行', mpy: 'bīngmǎ wèi dòng, liángcǎo xiān xíng', mru: 'Войско ещё не выступило — провиант уже в пути', bio: 'Главный по котлу. Воюет половником, стратегически мыслит о рыбе.' },
    { zh: '新兵猫', py: 'xīnbīng māo', ru: 'Кот-новобранец', motto: '临阵磨枪，不快也光', mpy: 'lín zhèn mó qiāng, bú kuài yě guāng', mru: 'Точить копьё перед боем — пусть не остро, зато блестит', bio: 'Выдали бамбуковую палку и шляпу на два размера больше. Уже герой.' },
    { zh: '步卒猫', py: 'bùzú māo', ru: 'Кот-пехотинец', motto: '千里之行，始于足下', mpy: 'qiānlǐ zhī xíng, shǐ yú zú xià', mru: 'Путь в тысячу ли начинается с первого шага', bio: 'Топает в строю, копьё держит правильно. Иногда.' },
    { zh: '弓手猫', py: 'gōngshǒu māo', ru: 'Кот-лучник', motto: '百发百中', mpy: 'bǎi fā bǎi zhòng', mru: 'Сто выстрелов — сто попаданий', bio: 'Видит мышь за сто шагов. Стрелу — тоже, но уже после выстрела.' },
    { zh: '骑兵猫', py: 'qíbīng māo', ru: 'Кот-всадник', motto: '马到成功', mpy: 'mǎ dào chénggōng', mru: 'Конь прискакал — успех пришёл', bio: 'Первый в атаке, первый у миски. Коня уважает, но не понимает.' },
    { zh: '校尉猫', py: 'xiàowèi māo', ru: 'Кот-сотник', motto: '令行禁止', mpy: 'lìng xíng jìn zhǐ', mru: 'Приказано — исполнено, запрещено — не тронуто', bio: 'Командует сотней. Девяносто девять спят, но порядок есть.' },
    { zh: '偏将猫', py: 'piānjiàng māo', ru: 'Кот-воевода', motto: '知己知彼，百战不殆', mpy: 'zhī jǐ zhī bǐ, bǎi zhàn bú dài', mru: 'Знай себя и врага — и в ста битвах не будет беды', bio: 'Алебарда, плащ, взгляд. Мышей в лагере больше нет — ушли сами.' },
    { zh: '大将猫', py: 'dàjiàng māo', ru: 'Кот-полководец', motto: '一夫当关，万夫莫开', mpy: 'yì fū dāng guān, wàn fū mò kāi', mru: 'Один держит проход — и десять тысяч не пройдут', bio: 'Шрам через бровь, гуаньдао через плечо. Спит только на троне.' },
    { zh: '军师猫', py: 'jūnshī māo', ru: 'Кот-стратег', motto: '运筹帷幄，决胜千里', mpy: 'yùnchóu wéiwò, juéshèng qiānlǐ', mru: 'Строит планы в шатре — побеждает за тысячу ли', bio: 'Веер из перьев, взгляд сквозь века. Выиграл битву, не вставая с подушки.' },
    { zh: '武神猫', py: 'wǔshén māo', ru: 'Кот — бог войны', motto: '义薄云天', mpy: 'yì bó yún tiān', mru: 'Верность его выше облаков', bio: 'Алая морда, зелёный халат, Клинок Зелёного Дракона. Ему ставят храмы и миски.' },
  ];
  const ART = [
    { mood: 'silly', head: 'band', armor: 'apron', weapon: 'ladle', left: 'lid', extras: ['steam'] },
    { mood: 'happy', head: 'straw', armor: 'tunic', weapon: 'stick', extras: ['fish'] },
    { mood: 'focused', head: 'leather', armor: 'leather', weapon: 'spear', left: 'shield', banner: '卒' },
    { mood: 'focused', head: 'band', armor: 'leather', weapon: 'bow', extras: ['quiver'], banner: '弓' },
    { mood: 'focused', head: 'plume', armor: 'lamellar', weapon: 'lance', banner: '骑' },
    { mood: 'stern', head: 'iron', armor: 'lamellar', weapon: 'sword', banner: '校' },
    { mood: 'stern', head: 'horn', armor: 'scale', weapon: 'halberd', cape: '#6e1b2b', banner: '将' },
    { mood: 'fierce', head: 'horn', armor: 'scale', weapon: 'guandao', cape: '#c4371f', extras: ['scar', 'paint'], banner: '帅' },
    { mood: 'wise', head: 'scarf', armor: 'robe', weapon: 'fan', extras: ['goatee'], banner: '军师' },
    { mood: 'god', head: 'dragon', armor: 'general', weapon: 'dragonblade', cape: '#2f6b4f', extras: ['beard', 'paint'], banner: '義' },
  ];
  const C = { ink: '#2b1d18', fur: '#e9ae4b', furD: '#c4842b', cream: '#f8ead0', pink: '#e89b9b', wood: '#a97a45', steel: '#d3d7dc', steelD: '#8e939b', iron: '#70747c', ironD: '#4f535a', leather: '#8b5a36', leatherD: '#5f3b22', cloth: '#5b7896', bordeaux: '#6e1b2b', gold: '#d6b35a', goldD: '#a37a2c', verm: '#c4371f', jade: '#3f7f5f', jadeD: '#2c5c44', white: '#f7f0e3', straw: '#d9b85f', strawD: '#b6933f', blue: '#6b8fb0', red: '#b8322a' };
  const SW = 3;
  const P = (d, fill = 'none', stroke = C.ink, w = SW, extra = '') => `<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round" ${extra}/>`;
  const E = (cx, cy, rx, ry, fill, stroke = C.ink, w = SW) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/>`;
  const Ci = (cx, cy, r, fill, stroke = C.ink, w = SW) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/>`;
  const L = (x1, y1, x2, y2, stroke = C.ink, w = SW) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
  const T = (x, y, text, size, fill, extra = '') => `<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}" font-family="Songti SC, STSong, Kaiti SC, PingFang SC, Hiragino Sans GB, serif" font-weight="700" fill="${fill}" ${extra}>${text}</text>`;
  const mirror = d => d; // placeholder for readability

  /* ── тело ── */
  const shadow = () => E(122, 248, 64, 7, 'rgba(43,29,24,.18)', 'none', 0);
  function banner(ch) {
    const x = 26;
    return L(x, 22, x, 246, C.wood, 5) + Ci(x, 19, 5, C.goldD, C.ink, 2)
      + P(`M${x + 4} 30 H${x + 46} V152 L${x + 25} 166 L${x + 4} 152 Z`, C.bordeaux)
      + P(`M${x + 10} 36 H${x + 40} V147 L${x + 25} 157 L${x + 10} 147 Z`, 'none', C.gold, 1.5)
      + (ch.length > 1 ? T(x + 25, 82, ch[0], 26, C.white) + T(x + 25, 116, ch[1], 26, C.white) : T(x + 25, 104, ch, 32, C.white));
  }
  const cape = color => P('M72 152 C 40 190, 46 236, 58 242 L 186 242 C 198 236, 204 190, 170 152 Q 120 172 72 152 Z', color);
  function tail() {
    const d = 'M166 214 C 208 212, 216 164, 190 150 C 176 142, 166 158, 178 166';
    return P(d, 'none', C.ink, 16) + P(d, 'none', C.fur, 10) + P('M190 152 c 8 -2 12 4 11 8', 'none', C.furD, 3);
  }
  const body = () => E(120, 200, 52, 44, C.fur) + E(120, 212, 30, 26, C.cream, 'none', 0) + P('M78 180 q-6 10 0 20', 'none', C.furD, 3) + P('M162 180 q6 10 0 20', 'none', C.furD, 3);
  const paws = () => E(92, 233, 17, 11, C.fur) + E(150, 233, 17, 11, C.fur) + L(86, 240, 86, 243, C.ink, 2) + L(93, 241, 93, 244, C.ink, 2) + L(144, 240, 144, 243, C.ink, 2) + L(151, 241, 151, 244, C.ink, 2);
  const head = () => Ci(120, 108, 50, C.fur) + P('M102 64 q4 10 1 18', 'none', C.furD, 3) + P('M120 60 q1 10 0 20', 'none', C.furD, 3) + P('M138 64 q-4 10 -1 18', 'none', C.furD, 3);
  const ears = () => P('M82 78 L70 28 L112 60 Z', C.fur) + P('M158 78 L170 28 L128 60 Z', C.fur) + P('M87 70 L79 42 L104 60 Z', C.pink, 'none', 0) + P('M153 70 L161 42 L136 60 Z', C.pink, 'none', 0);
  const earCovers = (color, rim = C.goldD) => P('M82 76 L70 30 L112 60 Z', color) + P('M158 76 L170 30 L128 60 Z', color) + P('M86 68 L80 44 L102 58', 'none', rim, 2) + P('M154 68 L160 44 L138 58', 'none', rim, 2);
  const nose = () => P('M114 118 L126 118 L120 125 Z', C.pink) + L(120, 125, 120, 130, C.ink, 2);
  function whiskers() {
    const pts = [[98, 124, 58, 116], [98, 129, 56, 130], [98, 134, 62, 144]];
    return pts.map(([a, b, c, d]) => L(a, b, c, d, C.ink, 2) + L(240 - a, b, 240 - c, d, C.ink, 2)).join('');
  }
  const cheeks = () => Ci(96, 126, 5, 'rgba(232,155,155,.55)', 'none', 0) + Ci(144, 126, 5, 'rgba(232,155,155,.55)', 'none', 0);
  function face(mood) {
    let s = '';
    const round = (cx, r, pr, dx = 2, dy = 1) => Ci(cx, 104, r, C.white) + Ci(cx + dx, 104 + dy, pr, C.ink, 'none', 0) + Ci(cx + dx + 2, 101, 2, C.white, 'none', 0);
    const brow = (x1, y1, x2, y2, w = 4) => L(x1, y1, x2, y2, C.ink, w);
    switch (mood) {
      case 'silly': s += round(100, 11, 6, 3, 2) + round(140, 9, 5, -1, 2) + P('M110 130 q5 6 10 0 q5 6 10 0', 'none', C.ink, 3) + E(126, 137, 5, 4, C.pink, C.ink, 2) + cheeks(); break;
      case 'happy': s += P('M92 106 q8 -12 16 0', 'none', C.ink, 3.5) + P('M132 106 q8 -12 16 0', 'none', C.ink, 3.5) + P('M106 130 q14 12 28 0', 'none', C.ink, 3) + cheeks(); break;
      case 'focused': s += E(100, 104, 9, 8, C.white) + Ci(102, 105, 4.5, C.ink, 'none', 0) + E(140, 104, 9, 8, C.white) + Ci(142, 105, 4.5, C.ink, 'none', 0) + brow(88, 90, 108, 94) + brow(152, 90, 132, 94) + P('M110 130 q5 5 10 0 q5 5 10 0', 'none', C.ink, 3); break;
      case 'stern': s += E(100, 106, 10, 5, C.white) + Ci(102, 106, 3.5, C.ink, 'none', 0) + E(140, 106, 10, 5, C.white) + Ci(142, 106, 3.5, C.ink, 'none', 0) + brow(86, 90, 110, 98, 5) + brow(154, 90, 130, 98, 5) + L(111, 132, 129, 132, C.ink, 3); break;
      case 'fierce': s += E(100, 106, 10, 5, C.white) + Ci(102, 106, 3.5, C.ink, 'none', 0) + E(140, 106, 10, 5, C.white) + Ci(142, 106, 3.5, C.ink, 'none', 0) + brow(84, 88, 110, 98, 6) + brow(156, 88, 130, 98, 6) + P('M110 134 q10 -6 20 0', 'none', C.ink, 3); break;
      case 'wise': s += P('M92 104 q8 8 16 0', 'none', C.ink, 3.5) + P('M132 104 q8 8 16 0', 'none', C.ink, 3.5) + brow(90, 92, 108, 92, 3) + brow(150, 92, 132, 92, 3) + P('M108 130 q12 8 24 0', 'none', C.ink, 3); break;
      case 'god': s += E(100, 105, 11, 6, C.white) + Ci(103, 105, 4, C.ink, 'none', 0) + E(140, 105, 11, 6, C.white) + Ci(143, 105, 4, C.ink, 'none', 0) + brow(82, 86, 110, 98, 6) + brow(158, 86, 130, 98, 6) + L(110, 133, 130, 133, C.ink, 3); break;
      default: s += round(100, 9, 5) + round(140, 9, 5);
    }
    return s + nose();
  }

  /* ── головные уборы ── */
  function headgear(kind) {
    switch (kind) {
      case 'band': return P('M72 84 Q120 70 168 84 L168 94 Q120 80 72 94 Z', C.verm) + P('M166 86 l14 -8 l-2 14 l8 6 l-16 2', C.verm, C.ink, 2.5);
      case 'straw': return P('M46 92 L194 92 L120 30 Z', C.straw) + P('M60 86 Q120 70 180 86', 'none', C.strawD, 2) + P('M82 74 Q120 64 158 74', 'none', C.strawD, 2) + L(104, 92, 100, 110, C.ink, 2) + L(136, 92, 140, 110, C.ink, 2);
      case 'leather': return P('M72 96 Q120 28 168 96 Z', C.leather) + P('M72 96 Q120 78 168 96 L168 104 Q120 88 72 104 Z', C.leatherD) + earCovers(C.leather, C.leatherD);
      case 'iron': return P('M72 96 Q120 28 168 96 Z', C.iron) + P('M68 96 Q120 80 172 96 L172 106 Q120 90 68 106 Z', C.gold, C.ink, 2.5) + P('M116 38 L120 14 L124 38 Z', C.gold, C.ink, 2) + earCovers(C.iron);
      case 'plume': return P('M72 96 Q120 28 168 96 Z', C.iron) + P('M68 96 Q120 80 172 96 L172 106 Q120 90 68 106 Z', C.gold, C.ink, 2.5) + P('M114 34 C 108 22, 110 8, 120 2 C 130 8, 132 22, 126 34 Z', C.verm, C.ink, 2) + P('M120 6 v26', 'none', C.red, 1.5) + Ci(120, 36, 5, C.gold, C.ink, 2) + earCovers(C.iron);
      case 'horn': return P('M72 96 Q120 28 168 96 Z', C.iron) + P('M68 96 Q120 80 172 96 L172 106 Q120 90 68 106 Z', C.gold, C.ink, 2.5) + P('M84 60 C 64 52, 52 30, 60 14 C 66 34, 76 44, 92 52 Z', C.gold, C.ink, 2.5) + P('M156 60 C 176 52, 188 30, 180 14 C 174 34, 164 44, 148 52 Z', C.gold, C.ink, 2.5) + Ci(120, 44, 6, C.verm, C.ink, 2) + earCovers(C.iron);
      case 'scarf': return P('M70 98 Q120 34 170 98 Z', C.blue) + P('M66 98 Q120 84 174 98 L174 106 Q120 92 66 106 Z', C.jadeD, C.ink, 2.5) + P('M170 98 c 14 10, 14 34, 6 52 c 2 -20, -4 -34, -14 -44', C.blue, C.ink, 2.5) + P('M92 60 Q120 44 148 60', 'none', C.jadeD, 2) + earCovers(C.blue, C.jadeD);
      case 'dragon': return P('M70 98 Q120 26 170 98 Z', C.bordeaux) + P('M66 98 Q120 80 174 98 L174 108 Q120 92 66 108 Z', C.gold, C.ink, 2.5) + P('M98 60 C 104 40, 118 34, 120 20 C 122 34, 136 40, 142 60 C 134 52, 126 50, 120 56 C 114 50, 106 52, 98 60 Z', C.gold, C.ink, 2.5) + Ci(120, 20, 5, C.verm, C.ink, 2) + P('M120 24 c -6 -10, -2 -18, 4 -22 c -2 8, 2 14, -4 22', C.verm, C.ink, 2) + earCovers(C.bordeaux) + Ci(120, 92, 5, C.verm, C.ink, 2);
      default: return '';
    }
  }

  /* ── доспех ── */
  function armor(kind) {
    const vest = (fill) => P('M78 182 C 84 162, 156 162, 162 182 C 170 206, 166 232, 150 242 L 90 242 C 74 232, 70 206, 78 182 Z', fill);
    switch (kind) {
      case 'apron': return P('M96 184 H144 L150 242 H90 Z', C.white) + L(96, 184, 104, 168, C.ink, 2.5) + L(144, 184, 136, 168, C.ink, 2.5) + P('M104 204 h32', 'none', C.verm, 3);
      case 'tunic': return vest(C.cloth) + P('M76 212 Q120 222 164 212 L164 222 Q120 232 76 222 Z', C.verm, C.ink, 2.5) + Ci(120, 217, 4, C.gold, C.ink, 1.5);
      case 'leather': return vest(C.leather) + P('M76 212 Q120 222 164 212 L164 222 Q120 232 76 222 Z', C.leatherD, C.ink, 2.5) + P('M120 172 v40', 'none', C.leatherD, 2, 'stroke-dasharray="4 4"') + Ci(120, 217, 4, C.gold, C.ink, 1.5);
      case 'lamellar': {
        let rows = '';
        for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) rows += `<rect x="${84 + c * 12 + (r % 2) * 6}" y="${176 + r * 13}" width="10" height="11" rx="2" fill="${C.steelD}" stroke="${C.ink}" stroke-width="1.4"/>`;
        return `<clipPath id="cv"><path d="M78 182 C 84 162, 156 162, 162 182 C 170 206, 166 232, 150 242 L 90 242 C 74 232, 70 206, 78 182 Z"/></clipPath>` + vest(C.iron) + `<g clip-path="url(#cv)">${rows}</g>` + P('M76 214 Q120 224 164 214 L164 224 Q120 234 76 224 Z', C.gold, C.ink, 2.5);
      }
      case 'scale': {
        let rows = '';
        for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) { const x = 80 + c * 12 + (r % 2) * 6, y = 176 + r * 12; rows += P(`M${x} ${y} a6 6 0 0 0 12 0`, C.gold, C.ink, 1.3); }
        return `<clipPath id="cv2"><path d="M78 182 C 84 162, 156 162, 162 182 C 170 206, 166 232, 150 242 L 90 242 C 74 232, 70 206, 78 182 Z"/></clipPath>` + vest(C.bordeaux) + `<g clip-path="url(#cv2)">${rows}</g>` + E(80, 176, 16, 10, C.gold) + E(160, 176, 16, 10, C.gold) + P('M76 216 Q120 226 164 216 L164 226 Q120 236 76 226 Z', C.ironD, C.ink, 2.5) + Ci(120, 221, 5, C.gold, C.ink, 1.5);
      }
      case 'robe': return P('M72 184 C 80 160, 160 160, 168 184 C 178 214, 176 240, 166 246 L 74 246 C 64 240, 62 214, 72 184 Z', C.blue) + P('M120 168 L104 246', 'none', C.gold, 2) + P('M120 168 L136 246', 'none', C.gold, 2) + P('M72 214 Q120 222 168 214 L168 224 Q120 232 72 224 Z', C.jadeD, C.ink, 2.5) + Ci(120, 219, 4, C.gold, C.ink, 1.5);
      case 'general': {
        let rows = '';
        for (let r = 0; r < 5; r++) for (let c = 0; c < 7; c++) { const x = 80 + c * 12 + (r % 2) * 6, y = 176 + r * 12; rows += P(`M${x} ${y} a6 6 0 0 0 12 0`, C.gold, C.ink, 1.3); }
        return `<clipPath id="cv3"><path d="M78 182 C 84 162, 156 162, 162 182 C 170 206, 166 232, 150 242 L 90 242 C 74 232, 70 206, 78 182 Z"/></clipPath>` + P('M74 184 C 80 162, 160 162, 166 184 C 176 214, 174 240, 164 246 L 76 246 C 66 240, 64 214, 74 184 Z', C.jade) + P('M78 182 C 84 162, 156 162, 162 182 C 170 206, 166 232, 150 242 L 90 242 C 74 232, 70 206, 78 182 Z', C.bordeaux) + `<g clip-path="url(#cv3)">${rows}</g>` + Ci(120, 192, 11, C.gold, C.ink, 2.5) + Ci(120, 192, 5, C.goldD, 'none', 0) + E(78, 176, 17, 11, C.gold) + E(162, 176, 17, 11, C.gold) + P('M76 218 Q120 228 164 218 L164 228 Q120 238 76 228 Z', C.ironD, C.ink, 2.5) + Ci(120, 223, 5, C.gold, C.ink, 1.5);
      }
      default: return '';
    }
  }

  /* ── оружие в правой лапе (древко от лапы вверх-вправо) ── */
  function weapon(kind) {
    const pole = (x1 = 156, y1 = 240, x2 = 178, y2 = 42, w = 5, color = C.wood) => L(x1, y1, x2, y2, C.ink, w + 3) + L(x1, y1, x2, y2, color, w);
    const tassel = (x, y) => P(`M${x} ${y} l-4 16 M${x} ${y} l0 18 M${x} ${y} l4 16`, 'none', C.verm, 2.5);
    switch (kind) {
      case 'ladle': return pole(156, 240, 170, 120, 5) + P('M156 118 a14 9 0 0 0 28 0 z', C.steel) + P('M158 118 h24', 'none', C.ink, 2);
      case 'stick': return pole(156, 240, 182, 50, 5, C.straw) + L(170, 140, 172, 140, C.ink, 4) + L(176, 96, 178, 96, C.ink, 4) + P('M182 50 l10 -14', 'none', C.ink, 2) + fish(196, 42);
      case 'spear': return pole() + P('M178 42 C 170 30, 172 14, 180 4 C 188 14, 190 30, 182 42 Z', C.steel) + tassel(178, 44);
      case 'bow': return P('M166 238 C 214 186, 214 96, 166 44', 'none', C.ink, 7) + P('M166 238 C 214 186, 214 96, 166 44', 'none', C.wood, 4) + L(166, 44, 166, 238, C.ink, 1.5) + L(150, 150, 224, 136, C.ink, 2.5) + P('M224 136 l-12 -3 l5 8 z', C.steel, C.ink, 1.5) + P('M150 150 l-9 -3 l6 8', 'none', C.verm, 2);
      case 'lance': return pole(156, 240, 180, 30, 4) + P('M180 30 C 174 20, 176 8, 181 0 C 186 8, 188 20, 182 30 Z', C.steel) + P('M181 34 L216 52 L181 70 Z', C.bordeaux, C.ink, 2) + T(196, 58, '骑', 13, C.white) + tassel(180, 36);
      case 'sword': return L(152, 236, 152, 220, C.ink, 8) + L(152, 236, 152, 220, C.leatherD, 5) + P('M142 218 H162 V212 H142 Z', C.gold, C.ink, 2) + P('M146 212 L152 96 L158 212 Z', C.steel) + L(152, 110, 152, 206, C.steelD, 1.5) + P('M152 238 l-6 14 M152 238 l6 14', 'none', C.verm, 2.5);
      case 'halberd': return pole(156, 240, 180, 30, 5) + P('M180 30 C 174 20, 176 6, 181 -2 C 186 6, 188 20, 182 30 Z', C.steel) + P('M183 40 C 200 36, 210 56, 200 74 C 206 56, 196 46, 184 50 Z', C.steel) + tassel(180, 34);
      case 'guandao': return pole(156, 240, 176, 56, 6) + P('M176 56 C 168 40, 176 10, 200 0 C 186 20, 186 42, 198 60 C 190 66, 180 64, 176 56 Z', C.steel) + P('M176 56 c 8 -8, 14 -14, 22 -22', 'none', C.steelD, 1.5) + Ci(177, 60, 5, C.gold, C.ink, 2) + tassel(177, 66);
      case 'fan': return L(150, 236, 156, 186, C.ink, 7) + L(150, 236, 156, 186, C.leatherD, 4) + [[-3, 1], [-2, 1], [-1, 1], [0, 1], [1, 1], [2, 1], [3, 1]].map(([k]) => { const a = -90 + k * 14; const r = a * Math.PI / 180; const x = 156 + Math.cos(r) * 46, y = 186 + Math.sin(r) * 46; return E((156 + x) / 2, (186 + y) / 2, 9, 24, C.white, C.ink, 2).replace('<ellipse', `<ellipse transform="rotate(${a + 90} ${(156 + x) / 2} ${(186 + y) / 2})"`); }).join('') + Ci(156, 186, 6, C.gold, C.ink, 2);
      case 'dragonblade': return pole(156, 240, 176, 56, 7) + P('M176 56 C 166 36, 176 4, 206 -4 C 188 18, 188 44, 202 64 C 192 72, 180 68, 176 56 Z', C.steel) + P('M180 52 c 6 -14, 14 -24, 24 -30', 'none', C.jade, 2.5) + Ci(177, 60, 6, C.gold, C.ink, 2) + tassel(177, 67);
      default: return '';
    }
  }
  const fish = (x, y) => P(`M${x} ${y} c 8 -6, 18 -6, 24 0 c -6 6, -16 6, -24 0 z M${x + 24} ${y} l8 -6 v12 z`, C.steel) + Ci(x + 7, y - 1, 1.5, C.ink, 'none', 0);
  function leftItem(kind) {
    switch (kind) {
      case 'lid': return Ci(84, 222, 26, C.iron) + Ci(84, 222, 18, C.steelD, C.ink, 2) + Ci(84, 222, 5, C.gold, C.ink, 2);
      case 'shield': return Ci(84, 222, 26, C.leather) + Ci(84, 222, 18, 'none', C.gold, 2) + Ci(84, 222, 6, C.gold, C.ink, 2) + T(84, 216, '卒', 12, C.white);
      default: return '';
    }
  }
  function extras(list, idx) {
    let s = '';
    for (const e of list || []) {
      if (e === 'steam') s += P('M48 150 c -8 -10, 8 -16, 0 -26', 'none', 'rgba(43,29,24,.35)', 2.5) + P('M34 158 c -8 -10, 8 -16, 0 -26', 'none', 'rgba(43,29,24,.3)', 2.5) + P('M18 176 a24 12 0 0 0 48 0 v18 a24 10 0 0 1 -48 0 z', C.iron) + E(42, 176, 24, 12, C.ironD, C.ink, 2.5);
      if (e === 'fish') s += '';
      if (e === 'quiver') s += P('M62 160 L84 150 L96 182 L74 194 Z', C.leather) + L(70, 152, 60, 128, C.ink, 2.5) + L(78, 150, 72, 124, C.ink, 2.5) + P('M60 128 l-6 -4 l2 8 z M72 124 l-6 -4 l2 8 z', C.verm, C.ink, 1.5);
      if (e === 'scar') s += L(130, 82, 140, 100, C.red, 3) + L(131, 88, 137, 86, C.red, 2) + L(134, 94, 140, 92, C.red, 2);
      if (e === 'paint') s += L(84, 112, 96, 110, C.verm, 3) + L(84, 118, 96, 116, C.verm, 3) + L(156, 112, 144, 110, C.verm, 3) + L(156, 118, 144, 116, C.verm, 3);
      if (e === 'goatee') s += P('M114 140 q6 22 6 44 q0 -22 6 -44', C.ink, C.ink, 2);
      if (e === 'beard') s += P('M100 138 C 100 170, 106 200, 120 214 C 134 200, 140 170, 140 138 Q 120 150 100 138 Z', C.ink) + P('M108 150 c 2 20, 6 36, 12 48 M132 150 c -2 20, -6 36, -12 48', 'none', '#4a3a33', 2);
    }
    if (idx === 9) s += E(120, 112, 44, 40, 'rgba(196,55,31,.28)', 'none', 0);
    return s;
  }

  function svg(idx, opts = {}) {
    idx = Math.max(0, Math.min(RANKS.length - 1, idx | 0));
    const a = ART[idx];
    const hideEars = ['straw', 'leather', 'iron', 'plume', 'horn', 'scarf', 'dragon'].includes(a.head);
    const parts = [
      opts.plain ? '' : Ci(120, 132, 112, opts.bg || '#f4ead6', 'rgba(198,154,60,.7)', 2),
      shadow(),
      a.banner ? banner(a.banner) : '',
      a.cape ? cape(a.cape) : '',
      tail(), body(), armor(a.armor),
      hideEars ? '' : ears(),
      head(),
      idx === 9 ? E(120, 112, 44, 40, 'rgba(196,55,31,.28)', 'none', 0) : '',
      face(a.mood),
      extras((a.extras || []).filter(e => e !== 'beard' && e !== 'goatee'), -1),
      extras((a.extras || []).filter(e => e === 'beard' || e === 'goatee'), -1),
      whiskers(),
      headgear(a.head),
      paws(),
      weapon(a.weapon),
      a.left ? leftItem(a.left) : '',
    ];
    return `<svg viewBox="0 0 240 262" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${RANKS[idx].ru}"${opts.size ? ` width="${opts.size}" height="${opts.size * 262 / 240}"` : ''}>${parts.join('')}</svg>`;
  }
  const imgKey = idx => 'cat-' + String(Math.max(0, Math.min(RANKS.length - 1, idx | 0)) + 1).padStart(2, '0');
  /* <img> с запасным вариантом — векторный кот, если файл не загрузился */
  function imgTag(idx, cls = '') { return `<img class="cat-img ${cls}" src="${IMG_URL(imgKey(idx))}" alt="${RANKS[idx] ? RANKS[idx].ru : ''}" draggable="false" onerror="this.outerHTML=Cats.svg(${idx | 0},{plain:true})">`; }
  return { RANKS, ART, svg, imgKey, imgTag };
})();
