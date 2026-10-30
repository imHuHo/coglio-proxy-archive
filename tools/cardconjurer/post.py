import json,os
from PIL import Image
OUT='/tmp/claude-0/cc2/out/packs'
b=json.load(open('/tmp/claude-0/cc2/built.json'));cat=b['catalog'];res=b['res']
index=[]
import collections
namecount=collections.Counter(c['name'] for c in cat)
for c in cat:
    if namecount[c['name']]>1: c['name']=c['name']+' — '+c['category']
for c in cat:
    pid=c['id'];d=f'{OUT}/{pid}'
    frames=[]
    for k in ['W','U','B','R','G','M','A','L','C']:
        if k not in c['frames']: continue
        f=f'{d}/{k}.webp'
        if not res.get(f): continue
        pk=k if k in c['pts'] else ('C' if 'C' in c['pts'] and k in 'LA' else None)
        pt=f'pt-{pk}.webp' if pk and res.get(f'{d}/pt-{pk}.webp') else None
        frames.append({'key':k,'name':c['name']+' '+k,'group':'cc-'+pid,'ink':c['ink'],'geo':c['geo'],'png':f'{k}.webp','pt':pt})
    if not frames: continue
    # miniatura
    tk=next((f['key'] for f in frames if f['key']=='U'),frames[0]['key'])
    fr=Image.open(f'{d}/{tk}.webp').convert('RGBA')
    bg=Image.new('RGBA',fr.size,(0,0,0,0))
    from PIL import ImageDraw
    g=Image.linear_gradient('L').resize(fr.size).point(lambda v:60+v//3)
    art=Image.merge('RGBA',(g,g.point(lambda v:v+10),g.point(lambda v:min(255,v+40)),Image.new('L',fr.size,255)))
    a=c['geo']['art']; mask=Image.new('L',fr.size,0); ImageDraw.Draw(mask).rectangle([a[0],a[1],a[0]+a[2],a[1]+a[3]],fill=255)
    bg.paste(art,(0,0),mask); bg.alpha_composite(fr)
    th=bg.resize((160,223),Image.LANCZOS); th.save(f'{d}/thumb.webp','WEBP',quality=72)
    pack={'app':'coglio-frames','version':1,'groups':[{'id':'cc-'+pid,'name':c['name']}],'frames':frames}
    json.dump(pack,open(f'{d}/pack.json','w'),separators=(',',':'))
    used={'pack.json','thumb.webp'}|{f['png'] for f in frames}|{f['pt'] for f in frames if f['pt']}
    for fn in os.listdir(d):
        if fn not in used: os.remove(f'{d}/{fn}')
    size=sum(os.path.getsize(f'{d}/{fn}') for fn in used if fn!='thumb.webp')
    e={'id':pid,'name':c['name'],'category':c['category'],'n':len(frames),'bytes':size}
    if c['geo'].get('layout'): e['layout']=c['geo']['layout']
    index.append(e)
ORDER=['Standard','Accurate (M15 nuove)','Universes Beyond','Senza testo / Full art','Showcase','Promo','Token','Planeswalker','Saghe','Bifronte (DFC)','Modali','Varie','Custom','Altro']
index.sort(key=lambda e:(ORDER.index(e['category']) if e['category'] in ORDER else 99,e['name'].lower()))
json.dump({'app':'coglio-catalog','version':1,'source':'Card Conjurer','packs':index},open(f'{OUT}/index.json','w'),separators=(',',':'),ensure_ascii=False)
tot=sum(e['bytes'] for e in index)
print(len(index),'pacchetti',sum(e['n'] for e in index),'cornici',round(tot/1048576,1),'MB')
