import json,os,re,sys,io
from PIL import Image
from multiprocessing import Pool
ROOT='/home/claude/investigamer/cardconjurer'
OUT='/tmp/claude-0/cc2/out/packs'
W,H=745,1040
d=json.load(open('/tmp/claude-0/cc2/scan.json'));P=d['packs'];G=d['groups']
CATNAME={'Standard':'Standard','Accurate':'Accurate (M15 nuove)','Showcase':'Showcase','UniversesBeyond':'Universes Beyond','Promo':'Promo','Textless':'Senza testo / Full art','Token':'Token','DFC':'Bifronte (DFC)','Modal':'Modali','Saga':'Saghe','Planeswalker':'Planeswalker','Misc':'Varie','Custom':'Custom','Margin':'Margini','FleshAndBlood':'Flesh and Blood'}
meta={}
ORDER=['Standard','Accurate','UniversesBeyond','Token','Planeswalker','Saga','DFC','Modal','Textless','Promo','Showcase','Misc','Custom']
for g,lst in sorted(G.items(),key=lambda x:ORDER.index(x[0]) if x[0] in ORDER else 99):
    for e in lst:
        v=e['value']
        if v=='disabled' or v in meta: continue
        meta[v]=(CATNAME.get(g,g),e['name'])
SKIP=re.compile(r'^(FAB|Margin|CustomMargin|Battle|Vanguard|Pokemon|Planechase|Cardback|Dungeon|CustomDeckCover|J22Front|JMPFront|Class$|Case$|Tapped|MiscCustom|ModalHelper|Levelers|Attraction)')
COL=[('W','white'),('U','blue'),('B','black'),('R','red'),('G','green'),('M','multicolored|multicolor|gold'),('A','artifact'),('L','land'),('C','colorless')]
def key_of(name,suffix):
    n=re.sub(r'\s*\(.*?\)\s*','',name).strip().lower()
    for k,w in COL:
        if re.fullmatch(r'(%s)%s'%(w,suffix),n): return k
    return None
def box(t,padx,pady):
    if not t or 'x' not in t: return None
    return [round(t['x']*W-padx),round(t['y']*H-pady),round(t['width']*W+2*padx),round(t['height']*H+2*pady)]
DEF=P['M15Regular-1']
def color(t): 
    c=(t or {}).get('color')
    return c if isinstance(c,str) else None
jobs=[];catalog=[]
for pid,p in P.items():
    if SKIP.search(pid): continue
    text=p['text'] or (DEF['text'] if p['noVersion'] else None)
    art=p['art'] or (DEF['art'] if p['noVersion'] else None)
    if not text or not art or 'title' not in text: continue
    frames={};pts={}
    for f in p['frames']:
        if not f['src'] or f['erase']: continue
        src=ROOT+f['src']
        if not os.path.exists(src) or not src.lower().endswith(('.png','.jpg','.webp')): continue
        if not f['bounds']:
            k=key_of(f['name'],r'( frame)?')
            if k and k not in frames: frames[k]=src
        elif 'power/toughness' in f['name'].lower():
            k=key_of(f['name'],r' power/toughness')
            if k and k not in pts: pts[k]=(src,f['bounds'])
    if not frames: continue
    t=text
    layout=None
    geo={'art':[round(art['x']*W),round(art['y']*H),round(art['width']*W),round(min(art['height'],1-art['y'])*H)],
         'title':box(t.get('title'),20,0),'info':[46,980]}
    geo['type']=box(t.get('type'),20,0) or [0,0,0,0]
    if 'rules' in t: geo['box']=box(t['rules'],22,16)
    elif 'ability0' in t:
        a=t['ability0']; layout='planeswalker' if 'loyalty' in t else 'saga'
        bottom=(t['type']['y'] if layout=='saga' else 0.915)
        geo['box']=[round(a['x']*W-22),round(a['y']*H-16),round(a['width']*W+44),round((bottom-a['y'])*H+16)]
    else: geo['box']=[0,0,0,0]
    ptt=t.get('pt') or t.get('loyalty')
    geo['pt']=box(ptt,14,12) if ptt else None
    if not geo['pt']: geo.pop('pt')
    cols={z:color(t.get(src)) for z,src in [('title','title'),('type','type'),('rules','rules' if 'rules' in t else 'ability0'),('pt','pt' if 'pt' in t else 'loyalty')]}
    cols={k:v for k,v in cols.items() if v}
    if cols: geo['colors']=cols
    if layout: geo['layout']=layout
    if t.get('title',{}).get('align')=='center': geo['titleAlign']='center'
    cat,name=meta.get(pid,('Altro',pid))
    ink='light' if (cols.get('rules','') or '').lower() in ('white','#fff','#ffffff') else 'dark'
    catalog.append({'id':pid,'name':name,'category':cat,'ink':ink,'geo':geo,'frames':frames,'pts':pts})
print('packs',len(catalog),'frames',sum(len(c['frames']) for c in catalog))
def conv(job):
    kind,src,dst,extra=job
    if os.path.exists(dst): return dst,True
    try:
        im=Image.open(src).convert('RGBA')
        if kind=='frame':
            if abs(im.width/im.height-W/H)>0.03: return dst,False
            im=im.resize((W,H),Image.LANCZOS)
        else:
            b=extra; x,y,w,h=round(b['x']*W),round(b['y']*H),round(b['width']*W),round(b['height']*H)
            c=Image.new('RGBA',(W,H),(0,0,0,0)); c.alpha_composite(im.resize((max(1,w),max(1,h)),Image.LANCZOS),(max(0,x),max(0,y))) if x>=0 and y>=0 else None; im=c
        os.makedirs(os.path.dirname(dst),exist_ok=True)
        im.save(dst,'WEBP',quality=82,method=4)
        return dst,True
    except Exception as e:
        return dst,False
for c in catalog:
    for k,src in c['frames'].items(): jobs.append(('frame',src,f"{OUT}/{c['id']}/{k}.webp",None))
    for k,(src,b) in c['pts'].items(): jobs.append(('pt',src,f"{OUT}/{c['id']}/pt-{k}.webp",b))
if __name__=='__main__':
    with Pool(2) as pool:
        res=dict(pool.map(conv,jobs,chunksize=4))
    json.dump({'catalog':catalog,'res':res},open('/tmp/claude-0/cc2/built.json','w'))
    print('ok',sum(res.values()),'fail',sum(1 for v in res.values() if not v))
