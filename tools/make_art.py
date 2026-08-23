#!/usr/bin/env python3
"""Все иллюстрации приложения через Recraft: коты-ранги, сокровища, сундук.
Сырые PNG → tools/gen/raw/, готовые WebP 512px → src/img/. Повторный запуск генерирует только недостающее.
  python3 tools/make_art.py            # всё недостающее
  python3 tools/make_art.py --only cat-03 treasure-seal   # перегенерировать конкретные
"""
import sys, json, pathlib, argparse, io, urllib.request, concurrent.futures as cf
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import gen
from PIL import Image
ROOT = gen.ROOT; RAW = ROOT / 'tools' / 'gen' / 'raw'; IMG = ROOT / 'src' / 'img'; STYLE_FILE = ROOT / 'tools' / 'gen' / 'style.json'
RAW.mkdir(parents=True, exist_ok=True); IMG.mkdir(parents=True, exist_ok=True)

CAT = ('Always the SAME character: a chubby orange tabby cat with dark-brown tiger stripes, cream-colored muzzle, chest and belly, '
       'small black dot eyes, pink nose, round ears. Full body, standing upright, centered, facing the viewer. ')
STYLE = ('Stylized flat illustration in the manner of a Chinese woodblock print poster: bold shapes, limited palette of vermilion red, '
         'burgundy, antique gold, jade green, dark brown and warm rice-paper beige. Plain solid warm beige background, no text, no border, no frame.')
CATS = [
    'Rank: army cook of the ancient Chinese Three Kingdoms army. Red headband, white cook apron, holding a big wooden ladle, a steaming iron cauldron beside him, a wok lid as a shield. Comic and endearing.',
    'Rank: raw recruit of the Three Kingdoms army. Oversized conical straw hat, simple blue cloth tunic with a red sash, holding a bamboo pole with a small fish dangling from a string. Goofy and cheerful.',
    'Rank: foot soldier of the Three Kingdoms army. Brown leather cap, brown leather vest, short spear, round wooden shield. Determined.',
    'Rank: archer of the Three Kingdoms army. Red headband, leather vest, holding a recurve bow, quiver of arrows on the back. Focused.',
    'Rank: cavalryman of the Three Kingdoms army. Iron helmet with a tall red plume, grey lamellar armor, long lance with a small burgundy pennant. Proud.',
    'Rank: captain of the Three Kingdoms army. Iron helmet with a spike, lamellar armor with gold trim, straight Chinese sword (jian) held upright. Stern and disciplined.',
    'Rank: lieutenant general of the Three Kingdoms army. Horned helmet, gold scale armor, burgundy cape, Chinese halberd (ji). Commanding.',
    'Rank: grand general of the Three Kingdoms army. Big horned helmet with a red tassel, gold scale armor, vermilion cape, holding a tall guandao polearm with a huge curved crescent blade, a thick dark scar across the left eyebrow, three red war-paint stripes on each cheek, angry eyebrows. Fierce and imposing.',
    'Rank: military strategist of the Three Kingdoms like Zhuge Liang. Blue scholar robe, silk scarf cap, holding a feather fan, calm wise half-closed eyes, thin goatee. Serene.',
    'Rank: god of war, the cat version of Guan Yu. The most important feature: an enormous long black beard, a wide mass of flowing black hair hanging from the chin all the way down over the chest and belly like a bib. Also: deep red fur on the face, a green silk robe over gold armor, a gold helmet with a red tassel, and a huge polearm with a big curved crescent blade. Majestic and awe-inspiring.',
]
ITEM = 'One single clearly recognizable ancient Chinese object, drawn large and centered, three-quarter view, no decorative frame, no ornamental border, no pattern around it, simple readable silhouette: '
TREASURES = {
    'coin': 'a hanging string of round bronze Chinese cash coins with square holes, threaded on a red cord, coins overlapping in a vertical stack',
    'bamboo': 'a partly unrolled ancient Chinese book made of thin vertical bamboo strips bound with two cords, strips covered with columns of small ink marks',
    'bowl': 'a simple glazed brown clay bowl',
    'tea': 'a round flat dark-brown pressed pu-erh tea cake, one wedge broken off showing the dry tea leaves, resting on a piece of wrapping paper with a small red seal stamp',
    'ink': 'a black Chinese ink stick with a gold dragon relief',
    'brush': 'a single Chinese calligraphy brush with a long bamboo handle and a pointed black ink-soaked tip, lying diagonally next to a small black inkstone',
    'silk': 'a rolled bolt of shimmering burgundy silk with gold cloud pattern',
    'vase': 'an elegant pale jade-green celadon porcelain vase',
    'mirror': 'a round ancient bronze mirror with ornate patterned back and a tassel',
    'lacquer': 'a red lacquered wooden box with gold painted cranes',
    'jade': 'a carved green jade pendant with a red tassel',
    'ding': 'an ancient bronze ritual tripod cauldron (ding) with taotie patterns',
    'guqin': 'a guqin, an ancient Chinese seven-string zither, dark lacquered wood',
    'sunzi': 'an unrolled ancient scroll of The Art of War on bamboo slips with a red seal',
    'ingot': 'a single shiny gold yuanbao sycee ingot, the classic boat shape with upturned ends and a rounded bump in the middle, glowing gold, resting on a plain flat warm beige surface, beige background only',
    'tally': 'a bronze hufu tiger tally: a small crouching tiger figurine made of bronze, split lengthwise into two halves slightly apart, with gold inlaid inscription lines on its body',
    'blade': 'the Green Dragon Crescent Blade: a long polearm with a huge curved blade and a green dragon on the shaft, red tassel',
    'horse': 'a magnificent red stallion with flowing mane, the legendary Red Hare horse, standing proud',
    'crossbow': 'an ancient Chinese wooden repeating crossbow seen from the side: a stock with a trigger, a bow limb across the front, and a box magazine on top holding several bolts',
    'pearl': 'a large glowing white pearl that shines in the night, resting on a red silk cushion',
    'seal': 'the imperial jade seal of China: a square white-green jade seal topped with a carved coiling dragon, gold corner',
    'heshibi': 'the legendary He Shi Bi: a flawless white jade disc (bi) with a round hole, glowing softly, on dark silk',
}
CHESTS = {
    'chest-closed': 'An ancient Chinese lacquered wooden treasure chest with bronze fittings and a big bronze lock, closed, centered, slightly from above.',
    'chest-open': 'An ancient Chinese lacquered wooden treasure chest with bronze fittings, lid open, golden light and glowing treasures spilling out, centered, slightly from above.',
}
def jobs():
    out = []
    for i, d in enumerate(CATS): out.append((f'cat-{i + 1:02d}', CAT + d + ' ' + STYLE))
    for k, d in TREASURES.items(): out.append((f'treasure-{k}', ITEM + d + '. ' + STYLE))
    for k, d in CHESTS.items(): out.append((k, d + ' ' + STYLE))
    return out

def ensure_style():
    if STYLE_FILE.exists(): return json.loads(STYLE_FILE.read_text()).get('id')
    ref = ROOT / 'tools' / 'gen' / 'test_poster.png'
    if not ref.exists(): return None
    k = gen.key(); boundary = '----zika' + 'x' * 12
    body = b''
    body += f'--{boundary}\r\nContent-Disposition: form-data; name="style"\r\n\r\ndigital_illustration\r\n'.encode()
    body += f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="ref.png"\r\nContent-Type: image/png\r\n\r\n'.encode() + ref.read_bytes() + b'\r\n'
    body += f'--{boundary}--\r\n'.encode()
    req = urllib.request.Request(gen.API + '/styles', data=body, headers={'Authorization': 'Bearer ' + k, 'Content-Type': 'multipart/form-data; boundary=' + boundary})
    try:
        with urllib.request.urlopen(req, timeout=120) as r: res = json.loads(r.read().decode())
        STYLE_FILE.write_text(json.dumps(res)); print('style created:', res.get('id')); return res.get('id')
    except Exception as e:
        print('style creation failed, fallback to substyle:', str(e)[:200]); return None

def to_webp(src, dst, size=512):
    im = Image.open(src).convert('RGB')
    im = im.resize((size, size), Image.LANCZOS)
    im.save(dst, 'WEBP', quality=82, method=6)

def one(name, prompt, style_id):
    raw = RAW / (name + '.png')
    if not raw.exists():
        if style_id: paths = gen.recraft(prompt, 'raw/' + name, style_id=style_id)
        else: paths = gen.recraft(prompt, 'raw/' + name, substyle='2d_art_poster_2')
    to_webp(raw, IMG / (name + '.webp'))
    return name

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--only', nargs='*'); ap.add_argument('--no-style', action='store_true'); a = ap.parse_args()
    style_id = None if a.no_style else ensure_style()
    todo = [(n, p) for n, p in jobs() if not a.only or n in a.only]
    if a.only:
        for n in a.only: (RAW / (n + '.png')).unlink(missing_ok=True)
    with cf.ThreadPoolExecutor(4) as ex:
        for r in ex.map(lambda j: one(j[0], j[1], style_id), todo): pass
    total = sum(p.stat().st_size for p in IMG.glob('*.webp'))
    print(f'done: {len(list(IMG.glob("*.webp")))} webp, {total // 1024} KB total')
