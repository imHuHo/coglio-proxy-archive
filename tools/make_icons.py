"""Disegna le icone dell'app a partire da web/icon.svg (serve playwright per python).
   Uso: python3 make_icons.py  ->  web/icons/*.png e capacitor/assets/icon.png"""
import os, re
from playwright.sync_api import sync_playwright
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
svg = open(os.path.join(root, 'web', 'icon.svg'), encoding='utf-8').read()
def variant(kind):
    body = re.sub(r'<svg[^>]*>|</svg>', '', svg)
    if kind == 'rounded': return body
    defs = re.search(r'<defs>.*?</defs>', body, re.S).group(0)
    inner = body.replace(defs, '').replace('<rect width="512" height="512" rx="112" fill="url(#bg)"/>', '')
    if kind == 'maskable': inner = '<g transform="translate(256 256) scale(.74) translate(-256 -256)">' + inner + '</g>'
    return defs + '<rect width="512" height="512" fill="url(#bg)"/>' + inner

JOBS = [('web/icons/icon-192.png', 192, 'rounded'), ('web/icons/icon-256.png', 256, 'rounded'), ('web/icons/icon-512.png', 512, 'rounded'),
        ('web/icons/icon-maskable-512.png', 512, 'maskable'), ('web/icons/apple-touch-icon.png', 180, 'full'), ('capacitor/assets/icon.png', 1024, 'rounded')]
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page()
    for path, px, kind in JOBS:
        s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="%d" height="%d">%s</svg>' % (px, px, variant(kind))
        pg.set_viewport_size({'width': px, 'height': px})
        pg.set_content('<body style="margin:0;background:transparent">' + s + '</body>')
        out = os.path.join(root, path); os.makedirs(os.path.dirname(out), exist_ok=True)
        pg.screenshot(path=out, omit_background=True, clip={'x': 0, 'y': 0, 'width': px, 'height': px})
    b.close()
print('icone ok')
