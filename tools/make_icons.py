from PIL import Image, ImageDraw
import math, os
S = 4  # supersampling
def card(size, x, y, w, h, r, angle, fill):
    layer = Image.new('RGBA', (size, size), (0,0,0,0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle([x, y, x+w, y+h], r, fill=fill)
    return layer.rotate(-angle, center=(x+w/2, y+h/2), resample=Image.BICUBIC)
def make(px, maskable=False, opaque=False):
    size = px*S
    k = size/512
    scale = 0.78 if maskable else 1.0
    img = Image.new('RGBA', (size, size), (0,0,0,0))
    d = ImageDraw.Draw(img)
    bg = (51,71,214,255)
    if maskable or opaque:
        d.rectangle([0,0,size,size], fill=bg)
    else:
        d.rounded_rectangle([0,0,size,size], 112*k, fill=bg)
    def T(v): return (256 + (v-256)*scale)*k   # scale around centre
    def L(v): return v*scale*k
    layers = [
      card(size, T(96), T(96), L(190), L(260), L(30), -14, (143,156,240,255)),
      card(size, T(136), T(82), L(190), L(260), L(30), 0, (227,230,251,255)),
      card(size, T(176), T(96), L(190), L(260), L(30), 12, (255,255,255,255)),
    ]
    for l in layers: img = Image.alpha_composite(img, l)
    d = ImageDraw.Draw(img)
    cx, cy, r = T(352), T(352), L(82)
    d.ellipse([cx-r, cy-r, cx+r, cy+r], fill=(228,87,46,255))
    pts = [(T(316),T(354)),(T(342),T(380)),(T(388),T(328))]
    w = int(L(22))
    d.line(pts, fill=(255,255,255,255), width=w, joint='curve')
    for p in (pts[0], pts[2]):
        d.ellipse([p[0]-w/2, p[1]-w/2, p[0]+w/2, p[1]+w/2], fill=(255,255,255,255))
    out = img.resize((px, px), Image.LANCZOS)
    if opaque:
        bgimg = Image.new('RGB', (px, px), (51,71,214)); bgimg.paste(out, mask=out.split()[3]); return bgimg
    return out
os.makedirs('../web/icons', exist_ok=True)
make(192).save('../web/icons/icon-192.png')
make(512).save('../web/icons/icon-512.png')
make(512, maskable=True).save('../web/icons/icon-maskable-512.png')
make(180, opaque=True).save('../web/icons/apple-touch-icon.png')
make(256).save('../web/icons/icon-256.png')
print('icone ok')
os.makedirs('../capacitor/assets', exist_ok=True)
make(1024).save('../capacitor/assets/icon.png')
