"""Aggiunge ai pacchetti bifronte (Transform / Modali) le corone leggendarie dedicate di Card Conjurer.
Le corone delle carte normali non calzano: queste hanno il vuoto per l'icona di trasformazione.
Uso: python3 crowns.py  (legge il repo di Card Conjurer, scrive in web/packs)"""
import json, os
from PIL import Image
CC = os.environ.get('CC', '/home/claude/investigamer/cardconjurer') + '/img/frames'
PACKS = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'web', 'packs')
W, H = 745, 1040
BOX = [round(0.0274 * W), round(0.0191 * H), round(0.9454 * W), round(0.1667 * H)]  # misure della corona in Card Conjurer
SRC = {
    'M15TransformFront': 'm15/transform/crowns/regular/%s.png',
    'M15TransformBack': 'm15/transform/crowns/regular/%s.png',
    'M15TransformBackNew': 'm15/transform/crowns/regular/new/%s.png',
    'ModalRegular': 'modal/crowns/regular/%s.png',
}
REV = 2
idx_path = os.path.join(PACKS, 'index.json')
idx = json.load(open(idx_path))
for pid, pat in SRC.items():
    d = os.path.join(PACKS, pid); pj = os.path.join(d, 'pack.json'); pk = json.load(open(pj)); n = 0
    for f in pk['frames']:
        src = os.path.join(CC, pat % f['key'].lower())
        if not os.path.exists(src): f.pop('crown', None); continue
        im = Image.open(src).convert('RGBA').resize((BOX[2], BOX[3]), Image.LANCZOS)
        name = 'crown-%s.webp' % f['key']; im.save(os.path.join(d, name), 'WEBP', quality=88, method=6)
        f['crown'] = name; f['geo'] = dict(f['geo'], crown=BOX); n += 1
    pk['rev'] = REV
    json.dump(pk, open(pj, 'w'), ensure_ascii=False, separators=(',', ':'))
    tot = sum(os.path.getsize(os.path.join(d, x)) for x in os.listdir(d) if x != 'thumb.webp' and x != 'pack.json') + os.path.getsize(pj)
    for e in idx['packs']:
        if e['id'] == pid: e['bytes'] = tot; e['rev'] = REV
    print(pid, n, 'corone', tot)
json.dump(idx, open(idx_path, 'w'), ensure_ascii=False, separators=(',', ':'))

# --- corone fluttuanti per le cornici a tutta larghezza (esteso / senza bordo) delle bifronte ---
BOXF = [round(0.0307 * W), round(0.0191 * H), round(0.9387 * W), round(0.1024 * H)]
FSRC = {
    'TransformExtendedFront': 'm15/transform/crowns/floating/%s.png', 'TransformExtendedBack': 'm15/transform/crowns/floating/%s.png',
    'TransformBorderlessFront': 'm15/transform/crowns/floating/%s.png', 'TransformBorderlessBack': 'm15/transform/crowns/floating/%s.png',
    'ModalExtended': 'modal/crowns/floating/%s.png', 'ModalBorderless': 'modal/crowns/floating/%s.png',
}
FREV = 3
idx = json.load(open(idx_path))
for pid, pat in FSRC.items():
    d = os.path.join(PACKS, pid); pj = os.path.join(d, 'pack.json'); pk = json.load(open(pj)); n = 0
    for f in pk['frames']:
        src = os.path.join(CC, pat % f['key'].lower())
        if not os.path.exists(src): f.pop('crown', None); continue
        im = Image.open(src).convert('RGBA').resize((BOXF[2], BOXF[3]), Image.LANCZOS)
        name = 'crown-%s.webp' % f['key']; im.save(os.path.join(d, name), 'WEBP', quality=88, method=6)
        f['crown'] = name; f['geo'] = dict(f['geo'], crown=BOXF, crownF=1); n += 1
    pk['rev'] = FREV
    json.dump(pk, open(pj, 'w'), ensure_ascii=False, separators=(',', ':'))
    tot = sum(os.path.getsize(os.path.join(d, x)) for x in os.listdir(d) if x != 'thumb.webp' and x != 'pack.json') + os.path.getsize(pj)
    for e in idx['packs']:
        if e['id'] == pid: e['bytes'] = tot; e['rev'] = FREV
    print(pid, n, 'corone fluttuanti', tot)
json.dump(idx, open(idx_path, 'w'), ensure_ascii=False, separators=(',', ':'))
