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
DRAGON = 'A small cute Chinese dragon mascot: long serpentine body coiled, jade-green scales, golden antler horns, vermilion mane and whiskers, little clawed paws, full body, centered, facing the viewer. '
DRAGONS = {
    'dragon-1': DRAGON + 'Warm friendly smile, waving one paw in greeting, holding a small scroll, kind encouraging mood.',
    'dragon-2': DRAGON + 'Anxious worried expression, big concerned eyes, paws clasped together, glancing at a small hourglass beside him.',
    'dragon-3': DRAGON + 'Stern angry expression, brows knitted, arms crossed, small puffs of smoke from the nostrils.',
    'dragon-4': DRAGON + 'Ominous menacing look, narrowed glowing eyes, looming pose with raised claws, dark storm cloud and a small lightning bolt behind, twilight mood.',
}
BOSS = ('A single imposing character of the ancient Chinese Three Kingdoms era, portrait from the chest up, facing the viewer, '
        'large expressive face, theatrical and memorable like a Peking opera character, slightly comic but formidable. ')
BOSSES = {
    'boss-1': BOSS + 'A plump grey bookworm-scholar mouse in a scholar cap and blue robe, round spectacles on the nose, ink brush tucked behind the ear, a tall stack of bamboo scrolls beside him, smug know-it-all smirk.',
    'boss-2': BOSS + 'An old tea-master badger with a long white beard, brown teahouse apron, holding a steaming clay teapot high, one eyebrow raised, sly welcoming grin, tea cups floating in steam around him.',
    'boss-3': BOSS + 'A cunning market fox merchant in a red silk vest, gold coins in one paw and an abacus in the other, narrow gleaming eyes, wide toothy bargaining grin, market lanterns behind.',
    'boss-4': BOSS + 'A stern imperial clerk crane in a tall black official hat and dark green robe, holding a huge writing brush like a spear and an unrolled scroll, long beak, disapproving squint, red seal stamp glowing beside him.',
    'boss-5': BOSS + 'A fierce tiger general in heavy gold lamellar armor and a horned helmet with a red plume, huge crescent-blade guandao over the shoulder, war paint stripes, roaring open mouth showing fangs, storm clouds behind.',
}
PIC = 'Simple flat illustration for a language exam card: '
PIC_STYLE = ' Single clear subject, centered, large in frame, no decorative frame, no ornament, no text. Stylized flat poster style, limited palette of vermilion red, burgundy, antique gold, jade green, warm beige; plain solid warm beige background.'
CAT_PIC = 'the same chubby orange tabby cat character with cream muzzle, '
PICS = {
    'pic-p01': 'a red apple',
    'pic-p02': 'a cup of hot tea with steam',
    'pic-p03': 'a bowl of white rice with chopsticks',
    'pic-p04': 'a chrome water tap at the top pouring a continuous stream of PALE BLUE water down into a tall transparent drinking glass. The liquid filling the glass is PALE LIGHT BLUE, the same blue as the falling stream. Do not use red, burgundy, brown or dark colors for the liquid. Blue droplets around',
    'pic-p05': 'one simple ceramic mug with a single handle, side view, plain solid color, steam above, nothing else',
    'pic-p06': 'a simple rectangular wooden dining table with four straight legs, three-quarter view, empty tabletop, plain empty background, nothing else in the picture, no frames, no ornaments',
    'pic-p07': 'a wooden chair',
    'pic-p08': 'one closed hardcover book lying on a plain background, view from above at a slight angle, dark-red cover with a small gold rectangular label, white page edges visible along one side, nothing else',
    'pic-p09': 'an open laptop computer, three-quarter view, glowing bright screen and clearly visible keyboard keys',
    'pic-p10': 'a television set',
    'pic-p11': 'a passenger airplane in the sky',
    'pic-p12': 'a taxi car, side view',
    'pic-p13': 'a neat stack of chinese yuan banknotes and a clearly visible pile of round golden coins in front of it',
    'pic-p14': 'clothes on hangers: a shirt and a pair of trousers hanging on clothes hangers on a rail, no people, no faces, no bodies',
    'pic-p15': 'a happy dog standing on all four legs, side view, wagging tail, natural paws on the ground',
    'pic-p16': 'a grey cat sitting, side view',
    'pic-p17': 'a hospital building with a red cross',
    'pic-p18': 'a school building with a flag',
    'pic-p19': 'a small shop storefront',
    'pic-p20': 'a cozy house',
    'pic-p21': CAT_PIC + 'as a doctor in a white coat with a stethoscope',
    'pic-p22': CAT_PIC + 'as a teacher pointing at a blackboard',
    'pic-p23': CAT_PIC + 'as a student with a backpack and books',
    'pic-p24': 'a basket of fruits: apples, bananas, grapes',
    'pic-p25': CAT_PIC + 'eating a bowl of rice with chopsticks',
    'pic-p26': CAT_PIC + 'drinking tea from a cup',
    'pic-p27': CAT_PIC + 'reading an open book',
    'pic-p28': CAT_PIC + 'PLAIN SOLID WARM BEIGE BACKGROUND (no orange, no red background). Strict side view: the cat kneels at a low dark-red wooden table. A large white paper sheet lies flat on the table, and three thick BLACK ink strokes are already painted on that paper. The cat holds a long thin brush with a black tip pointing straight down, the tip pressed onto the paper. The act of putting ink on paper must be obvious',
    'pic-p29': CAT_PIC + 'sleeping in a bed with a blanket',
    'pic-p30': CAT_PIC + 'pressing a red retro telephone handset with a curly cord to its ear with one paw, mouth open talking, three small sound arcs coming from the handset',
    'pic-p31': CAT_PIC + 'watching television on a sofa',
    'pic-p32': CAT_PIC + 'studying at a desk with books and a lamp',
    'pic-p33': CAT_PIC + 'sitting at a rectangular office desk with an open laptop on it, the laptop screen glowing and facing the cat, cat paws on the keyboard, wearing a necktie',
    'pic-p34': CAT_PIC + 'carrying shopping bags',
    'pic-p35': CAT_PIC + 'driving a car, visible through the car window',
    'pic-p36': 'rainy weather: dark cloud, falling rain and an umbrella',
    'pic-p37': CAT_PIC + 'chef in a white apron and tall chef hat standing beside a stove, stirring food in a wok with a long wooden spatula, steam rising from the wok, the whole cat clearly standing on the floor next to the stove',
    'pic-p38': CAT_PIC + 'father: a big adult cat in a brown vest gently holding the paw of a small kitten standing beside him, both smiling, walking together',
    'pic-p39': CAT_PIC + 'as a mother cat in an apron holding a teapot',
    'pic-p40': 'two happy cats standing together as friends',
}
PICS2 = {
    'pic-p41': 'a cup of hot coffee with steam and visible dark coffee, scattered roasted coffee beans around the cup',
    'pic-p42': 'a glass bottle of milk with a label showing a small black-and-white spotted cow, next to a full glass of white milk',
    'pic-p43': 'a watermelon with one cut slice',
    'pic-p44': 'a basket of chicken eggs',
    'pic-p45': 'a whole cooked fish on a plate',
    'pic-p46': 'a bowl of noodles with chopsticks lifting noodles',
    'pic-p47': 'a modern smartphone',
    'pic-p48': 'a wristwatch',
    'pic-p49': 'a folded newspaper',
    'pic-p50': 'a medicine bottle and some pills',
    'pic-p51': 'a bicycle, side view',
    'pic-p52': 'a city bus, side view',
    'pic-p53': 'a green train at a station platform',
    'pic-p54': CAT_PIC + 'running, jogging in a tracksuit',
    'pic-p55': CAT_PIC + 'side view on green grass, a goal net with white mesh behind. A white ball with black pentagon patches (soccer ball) is on the grass at the left. The cat stands on one hind leg and swings the other hind leg forward so that the foot touches the ball. Both hind legs clearly visible and separated, front paws raised. The cat does NOT hold or hug the ball',
    'pic-p56': CAT_PIC + 'playing with a basketball',
    'pic-p57': CAT_PIC + 'swimming: the lower half of the body hidden behind wavy jade-green water lines, head and shoulders above the wavy waterline, front paws splashing, small drops in the air, happy open eyes',
    'pic-p58': CAT_PIC + 'dancing joyfully with raised paws',
    'pic-p59': CAT_PIC + 'singing into a microphone with music notes',
    'pic-p60': 'snowy weather: a snowman and falling snowflakes',
}
PICS.update(PICS2)
CHESTS = {
    'chest-closed': 'An ancient Chinese lacquered wooden treasure chest with bronze fittings and a big bronze lock, closed, centered, slightly from above.',
    'chest-open': 'An ancient Chinese lacquered wooden treasure chest with bronze fittings, lid open, golden light and glowing treasures spilling out, centered, slightly from above.',
}
def jobs():
    out = []
    for i, d in enumerate(CATS): out.append((f'cat-{i + 1:02d}', CAT + d + ' ' + STYLE))
    for k, d in TREASURES.items(): out.append((f'treasure-{k}', ITEM + d + '. ' + STYLE))
    for k, d in CHESTS.items(): out.append((k, d + ' ' + STYLE))
    for k, d in DRAGONS.items(): out.append((k, d + ' ' + STYLE))
    for k, d in BOSSES.items(): out.append((k, d + ' ' + STYLE))
    for k, d in PICS.items(): out.append((k, PIC + d + '.' + PIC_STYLE))
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
