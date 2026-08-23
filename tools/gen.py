#!/usr/bin/env python3
"""Генерация иллюстраций через Recraft (ключ — the-game-godot/.env, RECRAFT_API_KEY). Значения ключей не печатаются."""
import json, os, sys, time, urllib.request, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
ENV = pathlib.Path.home() / 'projects' / 'the-game-godot' / '.env'
OUT = ROOT / 'tools' / 'gen'
API = 'https://external.api.recraft.ai/v1'

def key(name='RECRAFT_API_KEY'):
    v = os.environ.get(name, '').strip()
    if not v and ENV.exists():
        for line in ENV.read_text().splitlines():
            if line.startswith(name + '='):
                v = line.split('=', 1)[1].strip().strip('"').strip("'")
    if not v:
        sys.exit('нет ключа ' + name)
    return v

def post(path, payload, k):
    req = urllib.request.Request(API + path, data=json.dumps(payload).encode(), headers={'Authorization': 'Bearer ' + k, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode())

def download(url, path):
    with urllib.request.urlopen(url, timeout=120) as r:
        path.write_bytes(r.read())

def recraft(prompt, out, style='digital_illustration', substyle=None, size='1024x1024', style_id=None, negative=None, n=1):
    k = key()
    payload = {'prompt': prompt, 'model': 'recraftv3', 'size': size, 'n': n}
    if style_id: payload['style_id'] = style_id
    else:
        payload['style'] = style
        if substyle: payload['substyle'] = substyle
    if negative: payload['negative_prompt'] = negative
    t = time.time()
    try:
        res = post('/images/generations', payload, k)
    except urllib.error.HTTPError as e:
        sys.exit('HTTP %s: %s' % (e.code, e.read().decode()[:400]))
    paths = []
    for i, d in enumerate(res.get('data', [])):
        p = OUT / (out + (f'_{i}' if n > 1 else '') + ('.svg' if d['url'].endswith('.svg') else '.png'))
        download(d['url'], p); paths.append(p)
    print(f'{out}: {", ".join(str(p.relative_to(ROOT)) + " " + str(p.stat().st_size // 1024) + "KB" for p in paths)} · {time.time() - t:.0f}s · credits={res.get("credits")}')
    return paths

if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('name'); ap.add_argument('prompt'); ap.add_argument('--style', default='digital_illustration'); ap.add_argument('--substyle'); ap.add_argument('--size', default='1024x1024'); ap.add_argument('--style-id'); ap.add_argument('--negative')
    a = ap.parse_args()
    recraft(a.prompt, a.name, a.style, a.substyle, a.size, a.style_id, a.negative)
