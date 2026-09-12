/* Сборка: склеивает src → dist/index.html (одним файлом), dist/artifact.html (без обёртки документа), sw.js, манифест, иконки. */
import fs from 'node:fs';
import path from 'node:path';
const root = path.dirname(new URL(import.meta.url).pathname);
const src = p => path.join(root, 'src', p), dist = p => path.join(root, 'docs', p);
const read = p => fs.readFileSync(p, 'utf8');
const now = new Date();
const VERSION = now.toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/(\d{8})(\d{4})/, '$1-$2');
const JS_ORDER = ['hsk.js', 'freq.js', 'sentences.js', 'pinyin.js', 'store.js', 'audio.js', 'speech.js', 'quiz.js', 'stats.js', 'srs.js', 'strokes.js', 'handwriting.js', 'skill.js', 'flow.js', 'phonetics.js', 'changelog.js', 'cats.js', 'treasures.js', 'campaign.js', 'ledger.js', 'dragon.js', 'hsk1exam.js', 'hsk2exam.js', 'hsk3exam.js', 'hsk4exam.js', 'hskreal.js', 'vault.js', 'push.js', 'app.js', 'views-decks.js', 'views-quiz.js', 'views-learn.js', 'program.js',
  /* тестовая методика: модули появляются по мере готовности, отсутствующие пропускаются */
  'gram-b1.js', 'gram-b2.js', 'gram-b3.js', 'gram-b4.js', 'grammar.js', 'traps.js', 'sampler.js', 'fires.js', 'mastery.js', 'gaps.js', 'cloudcopy.js', 'dispute.js', 'sinks.js',
  'boss.js', 'bossgen.js', 'bossmusic.js', 'views-program.js', 'views-boss.js', 'views-hand.js', 'views-flow.js', 'views-phon.js', 'views-hskexam.js', 'views-profile.js', 'views-stats.js',
  'views-ledger.js', 'views-mastery.js', 'views-gaps.js', 'views-fires.js', 'views-gram.js', 'views-copy.js'].filter(f => fs.existsSync(src('js/' + f)));
const imgsList = () => (fs.existsSync(src('img')) ? fs.readdirSync(src('img')).filter(f => f.endsWith('.webp')) : []);
const out0 = p => dist(p);
const css = read(src('css/style.css'));
const pushConf = JSON.parse(read(src('pushconf.json')));
const picsAvail = (fs.existsSync(src('img')) ? fs.readdirSync(src('img')) : []).filter(f => /^pic-p\d+\.webp$/.test(f)).map(f => f.replace('.webp', '').replace('pic-', ''));
const core = ('window.PUSH_CONF = ' + JSON.stringify(pushConf) + ';\nwindow.PICS_AVAILABLE = ' + JSON.stringify(picsAvail) + ';\n' + JS_ORDER.map(f => read(src('js/' + f))).join('\n;\n') + '\n;App.boot();\n').replace(/__VERSION__/g, VERSION);
const body = read(src('body.html'));
fs.mkdirSync(dist(''), { recursive: true });
/* Два канала на одном домене: рабочий и тестовый. У тестового своё хранилище (другое имя базы
   и префикс localStorage), свой service worker и свой манифест — статистика не смешивается,
   а установленные приложения не мешают друг другу. Картинки и черты общие, по «../». */
const CHANNELS = [
  { id: 'main', dir: '', db: 'zika', ls: 'zika:', base: '', defaultVer: 'v1', cache: 'zika',
    title: '字卡 — Карточки китайского', short: '字卡', name: '字卡 — Карточки китайского' },
  { id: 'beta', dir: 'beta', db: 'zika-beta', ls: 'zika-beta:', base: '../', defaultVer: 'v2', cache: 'zika-beta',
    title: '字卡 β — тестовая методика', short: '字卡 β', name: '字卡 β — тестовая методика' },
];
const tpl = read(src('index.html'));
const manifestSrc = JSON.parse(read(src('manifest.webmanifest')));
for (const ch of CHANNELS) {
  const out = p => dist(ch.dir ? path.join(ch.dir, p) : p);
  fs.mkdirSync(out(''), { recursive: true });
  const js = 'window.CHANNEL = ' + JSON.stringify({ id: ch.id, db: ch.db, ls: ch.ls, base: ch.base, defaultVer: ch.defaultVer }) + ';\n' + core;
  let html = tpl
    .replace('<!-- CSS -->', () => '<style>\n' + css + '\n</style>')
    .replace('<!-- BODY -->', () => body)
    .replace('<!-- JS -->', () => '<script>\n' + js + '\n</script>');
  if (ch.base) {
    html = html.replace(/="(apple-touch-icon\.png|icon-192\.png)"/g, (m, f) => '="' + ch.base + f + '"')
      .replace(/<title>[^<]*<\/title>/, '<title>' + ch.title + '</title>')
      .replace('content="字卡"', 'content="' + ch.short + '"');
  }
  fs.writeFileSync(out('index.html'), html);
  const assets = ['./', './index.html', './manifest.webmanifest', ch.base + 'icon-192.png', ch.base + 'icon-512.png', ch.base + 'apple-touch-icon.png', ch.base + 'strokes.json', ...imgsList().map(f => ch.base + 'img/' + f)];
  fs.writeFileSync(out('sw.js'), read(src('sw.js')).replace(/__VERSION__/g, VERSION).replace(/__CACHE_PREFIX__/g, ch.cache).replace('__ASSETS__', JSON.stringify(assets)));
  const mf = Object.assign({}, manifestSrc, { name: ch.name, short_name: ch.short, start_url: './', scope: './' });
  if (ch.base) mf.icons = manifestSrc.icons.map(i => Object.assign({}, i, { src: ch.base + i.src }));
  fs.writeFileSync(out('manifest.webmanifest'), JSON.stringify(mf, null, 2));
}
const html = read(out0('index.html'));
const imgDir = src('img');
const imgs = imgsList();
fs.mkdirSync(dist('img'), { recursive: true });
for (const f of imgs) fs.copyFileSync(path.join(imgDir, f), dist('img/' + f));
const inline = 'window.IMG = {' + imgs.map(f => JSON.stringify(f.replace(/\.webp$/, '')) + ':"data:image/webp;base64,' + fs.readFileSync(path.join(imgDir, f)).toString('base64') + '"').join(',') + '};\n';
const artifact = '<title>字卡</title>\n<style>\n' + css + '\n</style>\n' + body + '\n<script>\n' + inline + core + '\n</script>\n';
fs.writeFileSync(dist('artifact.html'), artifact);
fs.copyFileSync(src('strokes.json'), dist('strokes.json'));   /* траектории черт: грузятся по требованию */
for (const f of ['icon-192.png', 'icon-512.png', 'apple-touch-icon.png']) {
  const p = path.join(root, 'tools/icons', f);
  if (fs.existsSync(p)) fs.copyFileSync(p, dist(f));
}
fs.copyFileSync(src('icon.svg'), dist('icon.svg'));
fs.copyFileSync(src('help.html'), dist('help.html'));
console.log('built', VERSION, (html.length / 1024).toFixed(0) + ' KB', '· каналы: ' + CHANNELS.map(c => c.id + (c.dir ? '/' + c.dir : '')).join(', ') + ' · модулей ' + JS_ORDER.length);
/* Страница-превью всех рангов котов (для отладки рисунков) */
const catsPage = '<!DOCTYPE html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>cats</title>'
  + '<style>body{margin:0;background:#f4ead6;font-family:sans-serif}.g{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:8px;max-width:560px;margin:0 auto}.c{text-align:center;font-size:12px}.c svg{width:100%}</style>'
  + '<div class="g" id="g"></div><script>' + read(src('js/hsk.js')) + '\n' + read(src('js/cats.js'))
  + '\ndocument.getElementById("g").innerHTML = Cats.RANKS.map((r, i) => `<div class="c">${Cats.svg(i)}<div>${i + 1}. ${r.zh} · ${r.ru}</div></div>`).join("");</script>';
fs.writeFileSync(dist('cats.html'), catsPage);
