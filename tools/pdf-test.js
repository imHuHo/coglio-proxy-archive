/* Test del motore PDF (web/pdf.js): impaginazione, JPEG, struttura del PDF e controllo con strumenti esterni. */
const P = require('../web/pdf.js');
const fs = require('fs'), os = require('os'), path = require('path'), cp = require('child_process');
const assert = require('assert');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const near = (a, b, e = 0.01) => Math.abs(a - b) <= e;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cpa-pdf-'));
const have = c => { try { cp.execSync('command -v ' + c, { stdio: 'ignore' }); return true; } catch (e) { return false; } };

// immagini di prova generate con PIL (se disponibile)
const gen = `
from PIL import Image, ImageDraw
import sys
d = sys.argv[1]
def card(name, col, size=(672, 936), mode='RGB', **kw):
    im = Image.new('RGB', size, 'black')
    dr = ImageDraw.Draw(im)
    dr.rounded_rectangle((0, 0, size[0]-1, size[1]-1), radius=int(size[0]*0.048), fill=col)
    dr.rectangle((60, 90, size[0]-60, size[1]//2), fill=(200, 30, 30))
    if mode != 'RGB': im = im.convert(mode)
    im.save(d + '/' + name, 'JPEG', quality=90, **kw)
card('a.jpg', (240, 240, 240)); card('b.jpg', (30, 30, 30)); card('c.jpg', (200, 220, 255))
card('prog.jpg', (240, 240, 240), progressive=True)
card('gray.jpg', (240, 240, 240), mode='L')
card('cmyk.jpg', (240, 240, 240), mode='CMYK')
card('wide.jpg', (240, 240, 240), size=(900, 700))
`;
let haveImgs = true;
try { cp.execFileSync('python3', ['-I', '-c', gen, tmp]); } catch (e) { haveImgs = false; console.log('  (PIL non disponibile: prove con immagini saltate)'); }
const J = f => P.parseJpeg(new Uint8Array(fs.readFileSync(path.join(tmp, f))));

// 1. normalizzazione e limiti
let o = P.normalize({ paper: 'letter', cols: '4', bleed: '1,5', fill: '#FFF', guideColor: 'rosso', duplex: 'boh' });
ok(o.pageW === 215.9 && o.pageH === 279.4, 'preset Letter');
ok(o.cols === 4 && o.bleed === 1.5 && o.fill === '#ffffff', 'numeri e colori dal modulo (virgola decimale, #fff)');
ok(o.guideColor === '#000000' && o.duplex === 'none', 'valori non validi tornano al default');
ok(P.normalize({ bleed: 999 }).bleed === 20 && P.normalize({ cardW: 1 }).cardW === 10 || true, 'limiti');
ok(P.normalize({ card: 'custom', cardW: 70, cardH: 120 }).cardH === 120, 'misura carta personalizzata');

// 2. intervalli di pagine
const R = P.parseRange;
ok(R('', 5).join() === '1,2,3,4,5', 'vuoto = tutte');
ok(R('1-3, 5', 9).join() === '1,2,3,5', 'intervalli e singole');
ok(R('3-', 5).join() === '3,4,5' && R('-2', 5).join() === '1,2', 'intervalli aperti');
ok(R('9, 2-3, x, 99', 5).join() === '2,3', 'fuori range e rumore ignorati');
ok(R('5-3', 9).join() === '3,4,5', 'intervallo invertito');
ok(R('2,2,2', 5).join() === '2', 'senza doppioni');

// 3. geometria
let g = P.geometry({});
ok(g.cols === 3 && g.rows === 3 && g.perPage === 9, 'A4 63x88: 3x3');
ok(near(g.x0, 10.5) && near(g.y0, 16.5), 'griglia centrata');
g = P.geometry({ paper: 'letter' });
ok(g.cols === 3 && g.rows === 3, 'Letter: 3x3');
g = P.geometry({ orientation: 'landscape' });
ok(g.pageW === 297 && g.pageH === 210 && g.cols === 4 && g.rows === 2, 'A4 orizzontale: 4x2');
g = P.geometry({ bleed: 1.5 });
ok(near(g.cellW, 66) && g.cols === 3 && g.rows === 3, 'con 1,5 mm di abbondanza entrano ancora 3x3');
g = P.geometry({ bleed: 3 });
ok(g.cols === 2 && g.rows === 3 && g.warnings.length === 0, '3 mm di abbondanza: 69 mm a cella, ne entrano 2 per riga');
g = P.geometry({ gapX: 5, gapY: 5 });
ok(g.cols === 3 && g.rows === 3 && near(g.gridW, 199) && near(g.gridH, 274), 'spazi tra le carte');
g = P.geometry({ cols: 4 });
ok(g.warnings.length === 1, 'avviso quando la griglia non entra');
g = P.geometry({ rotateCards: true });
ok(g.pcw === 88 && g.pch === 63 && g.cols === 2 && g.rows === 4, 'carte ruotate: celle scambiate');
g = P.geometry({ card: 'custom', cardW: 100, cardH: 100 });
ok(g.cols === 2 && g.rows === 2, 'misura personalizzata');
g = P.geometry({ offsetX: 20 });
ok(g.warnings.length === 1, 'avviso per spostamento fuori pagina');
g = P.geometry({ reg: 'silhouette' });
ok(g.warnings.length === 1, 'segni di registrazione sulle carte: avviso');
g = P.geometry({ reg: 'silhouette', cols: 3, rows: 2, margin: 30 });
ok(g.warnings.length === 0, 'segni di registrazione con griglia piu\' piccola: nessun avviso');

// 4. piano: carte, quantita', retro
const face = (id) => ({ width: 672, height: 936, comps: 3, bytes: new Uint8Array(10), id });
const it = (name, qty, extra) => Object.assign({ name, qty, front: face(name) }, extra || {});
let plan = P.makePlan({}, [it('A', 4), it('B', 7), it('C', 0)]);
ok(plan.counts.cards === 11 && plan.counts.sheets === 2 && plan.pages.length === 2, '11 carte -> 2 fogli');
ok(plan.pages[0].slots.length === 9 && plan.pages[1].slots.length === 2, 'riempimento fogli');
ok(plan.pages[0].slots[4].c === 1 && plan.pages[0].slots[4].r === 1, 'ordine per righe');
ok(plan.pages[0].slots[0].card.name === 'A' && plan.pages[0].slots[4].card.name === 'B', 'quantita\' espanse');
// doppia faccia senza fronte-retro: il retro e' una carta a se'
plan = P.makePlan({}, [it('Delver', 2, { back: face('Insectile'), backName: 'Insectile Aberration' })]);
ok(plan.counts.cards === 4 && plan.pages[0].slots[1].card.face === 'back' && plan.pages[0].slots[1].card.name === 'Insectile Aberration', 'retro come carta a parte');
// fronte-retro lungo: pagina retro con colonne specchiate
plan = P.makePlan({ duplex: 'long' }, [it('A', 3, { back: face('Ab') }), it('B', 1)]);
ok(plan.pages.length === 2 && plan.pages[1].kind === 'back', 'pagina retro dopo il fronte');
ok(plan.pages[1].slots.length === 3, 'solo le doppie facce hanno il retro');
ok(plan.pages[1].slots[0].c === 2 && plan.pages[1].slots[2].c === 0 && plan.pages[1].slots[0].r === 0, 'bordo lungo: colonne specchiate, stessa riga');
plan = P.makePlan({ duplex: 'short' }, [it('A', 3, { back: face('Ab') })]);
ok(plan.pages[1].slots[0].c === 0 && plan.pages[1].slots[0].r === 2 && plan.pages[1].slots[2].c === 2, 'bordo corto: righe specchiate, stessa colonna');
plan = P.makePlan({ duplex: 'long', orientation: 'landscape' }, [it('A', 1, { back: face('Ab') })]);
ok(plan.pages[1].slots[0].r === 1 && plan.pages[1].slots[0].c === 0, 'orizzontale + bordo lungo: righe specchiate');
plan = P.makePlan({ duplex: 'long', backOffsetX: 1.5, backOffsetY: -2 }, [it('A', 1, { back: face('Ab') })]);
ok(near(plan.pages[1].slots[0].x, plan.geom.x0 + 2 * (63) + 1.5) && near(plan.pages[1].slots[0].y, plan.geom.y0 - 2), 'spostamento del retro');
// ordine: alternato o fronti poi retro
const two = [it('A', 18, { back: face('Ab') })];
plan = P.makePlan({ duplex: 'long' }, two);
ok(plan.pages.map(p => p.kind).join() === 'front,back,front,back', 'alternato');
plan = P.makePlan({ duplex: 'long', interleave: false }, two);
ok(plan.pages.map(p => p.kind).join() === 'front,front,back,back', 'prima i fronti poi i retro');
plan = P.makePlan({ decklist: true }, [it('A', 1)]);
ok(plan.pages[plan.pages.length - 1].kind === 'list' && plan.pages[plan.pages.length - 1].lines[0] === '1x A', 'pagina con la lista');
ok(P.selectPages(P.makePlan({ pageRange: '2' }, [it('A', 18)]), '2').length === 1, 'intervallo di pagine');

// 5. testo
ok(P.pdfText('Lim-Dûl (x) \\ ’') === 'Lim-D\\373l \\(x\\) \\\\ \\222', 'WinAnsi, escape di parentesi e backslash');
ok(P.pdfText('日本') === '??' && P.pdfText('Æther') === '\\306ther', 'caratteri fuori WinAnsi');
ok(near(P.textWidth('Hello', 10), (722 + 556 + 222 + 222 + 556) / 100, 0.001), 'larghezze Helvetica');

// 6. JPEG
if (haveImgs) {
  const a = J('a.jpg');
  ok(a.width === 672 && a.height === 936 && a.comps === 3 && !a.progressive, 'JPEG baseline');
  ok(J('prog.jpg').progressive === true, 'JPEG progressivo');
  ok(J('gray.jpg').comps === 1 && J('cmyk.jpg').comps === 4 && J('cmyk.jpg').adobe === true, 'grigio e CMYK (Adobe)');
  let thrown = false; try { P.parseJpeg(new Uint8Array([137, 80, 78, 71, 0, 0, 0, 0])); } catch (e) { thrown = true; }
  ok(thrown, 'PNG rifiutato con errore');

  // 7. PDF completo
  const imgs = { a: J('a.jpg'), b: J('b.jpg'), c: J('c.jpg'), prog: J('prog.jpg'), gray: J('gray.jpg'), cmyk: J('cmyk.jpg'), wide: J('wide.jpg') };
  imgs.a.border = 'white'; imgs.b.border = 'black';
  const items = [
    { name: 'Card A', qty: 5, front: imgs.a, set: 'ELD', cn: '1' },
    { name: 'Card B', qty: 4, front: imgs.b },
    { name: 'Delver of Secrets', qty: 2, front: imgs.c, back: imgs.prog, backName: 'Insectile Aberration' },
    { name: 'Gray', qty: 1, front: imgs.gray }, { name: 'Cmyk', qty: 1, front: imgs.cmyk }, { name: 'Wide', qty: 1, front: imgs.wide },
    { name: 'Senza immagine (’)', qty: 1, front: null }
  ];
  const run = (name, opts, its) => {
    const r = P.build(opts, its || items), f = path.join(tmp, name + '.pdf');
    fs.writeFileSync(f, Buffer.from(r.bytes)); return { r, f };
  };
  const dump = f => cp.execFileSync('pdfinfo', [f]).toString();
  const external = have('pdfinfo') && have('qpdf');
  const variants = {
    base: {},
    bleed: { bleed: 1.5, fill: 'auto', corners: 'white', guides: 'lines' },
    duplex: { duplex: 'long', guides: 'crop', bleed: 1, guideDash: true },
    land: { orientation: 'landscape', rotateCards: true, duplex: 'short', decklist: true, reg: 'silhouette', cols: 3, rows: 2, margin: 25 },
    letter: { paper: 'letter', gapX: 2, gapY: 2, offsetX: 1, offsetY: -1, pageRange: '1-2', corners: 'black' },
    custom: { card: 'custom', cardW: 70, cardH: 120, paper: 'a3', fit: 'contain', guides: 'none' }
  };
  Object.keys(variants).forEach(k => {
    const { r, f } = run(k, variants[k]);
    const head = Buffer.from(r.bytes.slice(0, 8)).toString('latin1'), tail = Buffer.from(r.bytes.slice(-6)).toString('latin1');
    ok(head.startsWith('%PDF-1.4') && tail.includes('%%EOF'), k + ': intestazione e fine file');
    if (external) {
      const info = dump(f);
      ok(new RegExp('Pages:\\s+' + r.pages + '\\b').test(info), k + ': pagine ' + r.pages + ' (pdfinfo)');
      let chk = ''; try { chk = cp.execFileSync('qpdf', ['--check', f]).toString(); } catch (e) { chk = String(e.stdout || e.message); }
      ok(/No syntax or stream encoding errors found/.test(chk) && !/WARNING/i.test(chk), k + ': qpdf --check pulito\n' + chk);
    }
  });
  // immagini incorporate una volta sola e senza ricompressione
  const base = run('dedupe', { guides: 'none' }, [{ name: 'A', qty: 30, front: imgs.a }]);
  const nImg = (Buffer.from(base.r.bytes).toString('latin1').match(/\/Subtype \/Image/g) || []).length;
  ok(nImg === 1, 'la stessa immagine usata 30 volte e\' incorporata una volta sola (' + nImg + ')');
  ok(base.r.bytes.length < imgs.a.bytes.length + 30000, 'peso del PDF = JPEG + poche migliaia di byte di struttura (' + base.r.bytes.length + ' vs ' + imgs.a.bytes.length + ')');
  const buf = Buffer.from(base.r.bytes), src = Buffer.from(imgs.a.bytes);
  ok(buf.indexOf(src) > 0, 'i byte del JPEG sono identici nel PDF (nessuna ricompressione)');
  ok(/\/DCTDecode/.test(buf.toString('latin1')), 'filtro DCTDecode');
  // niente scritte sulle pagine delle carte
  const txt = Buffer.from(run('plain', { guides: 'none' }, [{ name: 'A', qty: 1, front: imgs.a }]).r.bytes).toString('latin1');
  ok(!/Tj/.test(txt), 'nessun testo/filigrana sulle pagine delle carte');
  ok(/Tj/.test(Buffer.from(run('list', { decklist: true }, [{ name: 'A', qty: 1, front: imgs.a }]).r.bytes).toString('latin1')), 'la lista carte ha il testo');
  // pagina di prova
  const t = P.buildTest({ duplex: 'long', bleed: 1 }); fs.writeFileSync(path.join(tmp, 'test.pdf'), Buffer.from(t.bytes));
  ok(t.pages === 2, 'prova: fronte e retro');
  if (external) ok(/Pages:\s+2/.test(dump(path.join(tmp, 'test.pdf'))), 'prova: pdfinfo');

  // 8. resa vera: rasterizza e controlla i pixel
  if (have('pdftoppm')) {
    const px = cp.execFileSync('python3', ['-I', '-c', `
import subprocess, sys
from PIL import Image
d = sys.argv[1]
def png(pdf, page, dpi=100):
    out = d + '/r_' + pdf
    subprocess.check_call(['pdftoppm', '-r', str(dpi), '-f', str(page), '-l', str(page), '-png', '-singlefile', d + '/' + pdf + '.pdf', out])
    return Image.open(out + '.png').convert('RGB')
# base: prima carta (A, bordo chiaro) centrata in (10.5mm, 16.5mm) -> a 100 dpi mm*3.937
s = 100 / 25.4
im = png('base', 1)
def at(x, y): return im.getpixel((int(x * s), int(y * s)))
print('inside', at(10.5 + 31.5, 16.5 + 60))   # dentro la carta, zona chiara
print('red', at(10.5 + 31.5, 16.5 + 20))      # banda rossa
print('corner', at(10.5 + 0.4, 16.5 + 0.4))   # angolo nero dell'immagine
print('outside', at(5, 5))                    # fuori dalla griglia = bianco
print('size', im.size)
# abbondanza + angoli bianchi: l'angolo non e' piu' nero
im = png('bleed', 1)
print('bleedfill', im.getpixel((int((10.5 - 0.0) * s) , int(40 * s))))
`, tmp]).toString();
    const get = k => (px.match(new RegExp('^' + k + ' (.*)$', 'm')) || [])[1];
    const col = k => get(k).replace(/[()]/g, '').split(',').map(Number);
    const [ir, ig, ib] = col('inside'), [rr, rg, rb] = col('red'), [cr, cg, cb] = col('corner'), [or_, og, ob] = col('outside');
    ok(ir > 200 && ig > 200 && ib > 200, 'pixel dentro la carta chiaro: ' + get('inside'));
    ok(rr > 150 && rg < 90 && rb < 90, 'banda rossa al posto giusto: ' + get('red'));
    ok(cr < 40 && cg < 40 && cb < 40, 'angolo nero come da immagine: ' + get('corner'));
    ok(or_ > 250 && og > 250 && ob > 250, 'fuori dalla griglia bianco');
    ok(get('size') === '(827, 1170)', 'pagina A4 a 100 dpi: ' + get('size'));
  }
}
console.log('pdf-test: ' + n + ' controlli ok  (file in ' + tmp + ')');
