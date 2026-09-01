/* Сборка: склеивает src → dist/index.html (одним файлом), dist/artifact.html (без обёртки документа), sw.js, манифест, иконки. */
import fs from 'node:fs';
import path from 'node:path';
const root = path.dirname(new URL(import.meta.url).pathname);
const src = p => path.join(root, 'src', p), dist = p => path.join(root, 'docs', p);
const read = p => fs.readFileSync(p, 'utf8');
const now = new Date();
const VERSION = now.toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/(\d{8})(\d{4})/, '$1-$2');
const JS_ORDER = ['hsk.js', 'freq.js', 'sentences.js', 'pinyin.js', 'store.js', 'audio.js', 'speech.js', 'quiz.js', 'stats.js', 'srs.js', 'strokes.js', 'handwriting.js', 'skill.js', 'flow.js', 'phonetics.js', 'changelog.js', 'cats.js', 'treasures.js', 'campaign.js', 'dragon.js', 'hsk1exam.js', 'hsk2exam.js', 'hsk3exam.js', 'hsk4exam.js', 'hskreal.js', 'vault.js', 'push.js', 'app.js', 'views-decks.js', 'views-quiz.js', 'views-learn.js', 'program.js', 'boss.js', 'bossgen.js', 'bossmusic.js', 'views-program.js', 'views-boss.js', 'views-hand.js', 'views-flow.js', 'views-phon.js', 'views-hskexam.js', 'views-profile.js', 'views-stats.js'];
const css = read(src('css/style.css'));
const pushConf = JSON.parse(read(src('pushconf.json')));
const picsAvail = (fs.existsSync(src('img')) ? fs.readdirSync(src('img')) : []).filter(f => /^pic-p\d+\.webp$/.test(f)).map(f => f.replace('.webp', '').replace('pic-', ''));
const js = ('window.PUSH_CONF = ' + JSON.stringify(pushConf) + ';\nwindow.PICS_AVAILABLE = ' + JSON.stringify(picsAvail) + ';\n' + JS_ORDER.map(f => read(src('js/' + f))).join('\n;\n') + '\n;App.boot();\n').replace(/__VERSION__/g, VERSION);
const body = read(src('body.html'));
fs.mkdirSync(dist(''), { recursive: true });
const html = read(src('index.html'))
  .replace('<!-- CSS -->', () => '<style>\n' + css + '\n</style>')
  .replace('<!-- BODY -->', () => body)
  .replace('<!-- JS -->', () => '<script>\n' + js + '\n</script>');
fs.writeFileSync(dist('index.html'), html);
const imgDir = src('img');
const imgs = fs.existsSync(imgDir) ? fs.readdirSync(imgDir).filter(f => f.endsWith('.webp')) : [];
fs.mkdirSync(dist('img'), { recursive: true });
for (const f of imgs) fs.copyFileSync(path.join(imgDir, f), dist('img/' + f));
const inline = 'window.IMG = {' + imgs.map(f => JSON.stringify(f.replace(/\.webp$/, '')) + ':"data:image/webp;base64,' + fs.readFileSync(path.join(imgDir, f)).toString('base64') + '"').join(',') + '};\n';
const artifact = '<title>字卡</title>\n<style>\n' + css + '\n</style>\n' + body + '\n<script>\n' + inline + js + '\n</script>\n';
fs.writeFileSync(dist('artifact.html'), artifact);
fs.writeFileSync(dist('sw.js'), read(src('sw.js')).replace(/__VERSION__/g, VERSION).replace('__ASSETS__', JSON.stringify(['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './strokes.json', ...imgs.map(f => './img/' + f)])));
fs.copyFileSync(src('manifest.webmanifest'), dist('manifest.webmanifest'));
fs.copyFileSync(src('strokes.json'), dist('strokes.json'));   /* траектории черт: грузятся по требованию */
for (const f of ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) {
  const p = path.join(root, 'tools/icons', f);
  if (fs.existsSync(p)) fs.copyFileSync(p, dist(f));
}
fs.copyFileSync(src('icon.svg'), dist('icon.svg'));
fs.copyFileSync(src('help.html'), dist('help.html'));
console.log('built', VERSION, (html.length / 1024).toFixed(0) + ' KB');
/* Страница-превью всех рангов котов (для отладки рисунков) */
const catsPage = '<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>cats</title>'
  + '<style>body{margin:0;background:#f4ead6;font-family:sans-serif}.g{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:8px;max-width:560px;margin:0 auto}.c{text-align:center;font-size:12px}.c svg{width:100%}</style>'
  + '<div class="g" id="g"></div><script>' + read(src('js/hsk.js')) + '\n' + read(src('js/cats.js'))
  + '\ndocument.getElementById("g").innerHTML = Cats.RANKS.map((r, i) => `<div class="c">${Cats.svg(i)}<div>${i + 1}. ${r.zh} · ${r.ru}</div></div>`).join("");</script>';
fs.writeFileSync(dist('cats.html'), catsPage);
