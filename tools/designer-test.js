/* Test del Coglio Proxy Designer in Chromium vero (canvas, IndexedDB, caricamento file, PDF).
 * Scryfall è simulato. Uso: node tools/designer-test.js */
const path = require('path'), fs = require('fs'), http = require('http'), assert = require('assert');
const { chromium } = require('playwright');
const WEB = path.join(__dirname, '..', 'web');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json' };
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); };

const packFiles = {}; /* catalogo cornici simulato */
let bundleBody = null; /* risorse.json incluso nell'app: simulato per non dipendere dai file veri */
(async () => {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
    if (p.startsWith('/packs/')) { const b = packFiles[p]; if (!b) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': p.endsWith('.json') ? 'application/json' : 'image/png' }); return r.end(b); }
    if (p === '/risorse.json') { if (bundleBody) { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end(bundleBody); } r.writeHead(404); return r.end(); }
    const f = path.join(WEB, p);
    if (!f.startsWith(WEB) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
  }).listen(0);
  const base = 'http://localhost:' + srv.address().port + '/';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  /* le sezioni dell'editor sono a schede: prima di agire su un campo nascosto si apre la sua scheda */
  const ensureTab = sel => page.evaluate(q => { const el = document.querySelector(q), tp = el && el.closest('.dz-tp'); if (tp && tp.hidden) document.querySelector('.dz-tab[data-v="' + tp.dataset.tab + '"]').click(); }, sel).catch(() => {});
  for (const fn of ['click', 'fill', 'selectOption']) { const o = page[fn].bind(page); page[fn] = async (sel, ...a) => { if (typeof sel === 'string') await ensureTab(sel); return o(sel, ...a); }; }
  const ows = page.waitForSelector.bind(page);
  page.waitForSelector = async (sel, opts) => { if (typeof sel === 'string' && !(opts && opts.state)) { await ows(sel, { state: 'attached' }).catch(() => {}); await ensureTab(sel); } return ows(sel, opts); };
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });

  /* immagini finte generate dal browser stesso */
  const mkImg = (type, w, h, fn) => page.evaluate(([type, w, h, fn]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); new Function('x', 'w', 'h', fn)(x, w, h);
    return c.toDataURL(type).split(',')[1];
  }, [type, w, h, fn]);
  await page.goto('about:blank');
  const artPng = Buffer.from(await mkImg('image/png', 1200, 900, 'var g=x.createLinearGradient(0,0,w,h);g.addColorStop(0,"#e33");g.addColorStop(1,"#35c");x.fillStyle=g;x.fillRect(0,0,w,h);x.fillStyle="#fd3";x.beginPath();x.arc(w/2,h/2,200,0,7);x.fill();'), 'base64');
  const jpg = Buffer.from(await mkImg('image/jpeg', 488, 680, 'x.fillStyle="#777";x.fillRect(0,0,w,h);x.fillStyle="#fff";x.fillRect(40,40,w-80,h-80);'), 'base64');
  const framePng = Buffer.from(await mkImg('image/png', 745, 1040, 'x.fillStyle="#2a6";x.fillRect(0,0,w,h);x.clearRect(60,120,625,460);'), 'base64');

  const mkCard = (name) => ({ id: name, name, set: 'tst', collector_number: '1', border_color: 'black', layout: 'normal', image_status: 'highres_scan',
    image_uris: { small: 'https://cards.scryfall.io/small/a.jpg', normal: 'https://cards.scryfall.io/normal/a.jpg', large: 'https://cards.scryfall.io/large/a.jpg', art_crop: 'https://cards.scryfall.io/art_crop/a.png' },
    mana_cost: '{R}', type_line: 'Instant', oracle_text: 'Lightning Bolt deals 3 damage to any target.', flavor_text: 'The sparkmage shrieked.', rarity: 'common', colors: ['R'], artist: 'Christopher Moeller',
    set_name: 'Test Set', released_at: '2011-01-01', prints_search_uri: 'https://api.scryfall.com/cards/search?order=released&unique=prints&q=oracleid%3Aabc' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route('https://cards.scryfall.io/**', r => r.request().url().includes('art_crop') ? r.fulfill({ status: 200, contentType: 'image/png', body: artPng, headers: { 'access-control-allow-origin': '*' } }) : r.fulfill({ status: 200, contentType: 'image/jpeg', body: jpg, headers: { 'access-control-allow-origin': '*' } }));
  await ctx.route('https://api.scryfall.com/**', r => {
    const u = new URL(r.request().url()), h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: h });
    if (u.pathname === '/cards/named') {
      const q = u.searchParams.get('fuzzy') || u.searchParams.get('exact') || '';
      if (/nonexist/i.test(q)) return r.fulfill({ status: 404, contentType: 'application/json', headers: h, body: '{}' });
      if (/delver/i.test(q)) {
        const im = { small: 'https://cards.scryfall.io/small/a.jpg', normal: 'https://cards.scryfall.io/normal/a.jpg', art_crop: 'https://cards.scryfall.io/art_crop/a.png' };
        const dfc = Object.assign(mkCard('Delver of Secrets // Insectile Aberration'), { layout: 'transform', image_uris: undefined, mana_cost: undefined, type_line: undefined, oracle_text: undefined, card_faces: [
          { name: 'Delver of Secrets', mana_cost: '{U}', type_line: 'Creature \u2014 Human Wizard', oracle_text: 'Transform at upkeep.', colors: ['U'], power: '1', toughness: '1', artist: 'Front Artist', image_uris: im },
          { name: 'Insectile Aberration', mana_cost: '', type_line: 'Creature \u2014 Human Insect', oracle_text: 'Flying', colors: ['U'], power: '3', toughness: '2', artist: 'Back Artist', image_uris: im }] });
        return r.fulfill({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify(dfc) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify(mkCard('Lightning Bolt')) });
    }
    if (u.pathname === '/cards/search') {
      const a = mkCard('Lightning Bolt'), b = Object.assign(mkCard('Lightning Bolt'), { id: 'p2', set: 'xyz', set_name: 'Altra Edizione', collector_number: '99', released_at: '2015-01-01', rarity: 'rare', artist: 'Altro Artista', flavor_text: 'Altro testo.' });
      return r.fulfill({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify({ object: 'list', has_more: false, data: [a, b] }) });
    }
    if (u.pathname === '/cards/collection') {
      const ids = JSON.parse(r.request().postData()).identifiers;
      return r.fulfill({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify({ data: ids.map(i => mkCard(i.name)) }) });
    }
    return r.fulfill({ status: 404, contentType: 'application/json', headers: h, body: '{}' });
  });

  const go = async () => { await page.goto(base); await page.waitForSelector('.side .nav'); };
  const nav = v => page.click('.side [data-v="' + v + '"]');
  const text = () => page.innerText('body');
  const px = () => page.evaluate(() => { const c = document.getElementById('dz-cv'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0, t = 0; for (let i = 0; i < d.length; i += 4 * 97) { s += d[i] + d[i + 1] * 3 + d[i + 2] * 7; t += d[i + 3]; } return { s, t }; });

  await go();
  ok(await page.locator('.side .nav').count() === 6, 'sei voci di menu');
  ok(/Designer/.test(await page.innerText('.side')), 'voce Designer nel menu');

  /* mazzo di prova */
  await nav('import');
  await page.fill('[data-c="draft-text"]', '1 Sol Ring\n1 Lightning Bolt\n3 Forest'); await page.fill('[data-c="draft-name"]', 'Mazzo prova');
  await page.click('[data-a="draft-next"]'); await page.click('[data-a="draft-create"]');
  await page.waitForFunction(() => /Mazzo prova/.test(document.body.innerText));

  /* lista vuota */
  await nav('designer');
  await page.waitForFunction(() => /Nessun design ancora/.test(document.body.innerText));
  ok(true, 'schermata Designer vuota');

  /* nuova carta */
  await page.click('[data-a="dz-new"][data-k="card"]');
  await page.waitForSelector('#dz-cv');
  const blank = await px();
  await page.fill('[data-c="dz-f"][data-k="name"]', 'Mago di Prova');
  /* costo a pulsanti: incolore 1, blu 2 */
  ok(await page.evaluate(() => CPADesigner.state.cur.cost) === '{1}{U}', 'costo di partenza');
  await page.click('[data-a="dz-mana"][data-v="N"][data-k="+"].dz-mstep');
  await page.click('[data-a="dz-mana"][data-v="N"][data-k="-"]');
  await page.click('.dz-mana.on [data-a="dz-mana"][data-v="U"][data-k="+"].dz-mstep');
  await page.click('[data-a="dz-mana"][data-v="W"][data-k="+"]');
  await page.click('.dz-mana.on [data-a="dz-mana"][data-v="W"][data-k="-"]');
  ok(await page.evaluate(() => CPADesigner.state.cur.cost) === '{1}{U}{U}', 'costo composto con i pulsanti: ' + await page.evaluate(() => CPADesigner.state.cur.cost));
  ok(await page.evaluate(() => CPADesigner.state.cur.colors) === 'U', 'i colori seguono il costo');
  await page.click('[data-a="dz-costopen"]');
  await page.fill('[data-c="dz-f"][data-k="cost"]', '{1}{U}{U}');
  await page.fill('[data-c="dz-f"][data-k="type"]', 'Creature — Wizard');
  await page.fill('[data-c="dz-f"][data-k="rules"]', 'Flying\n{T}: Draw a card, then discard a card.');
  await page.fill('[data-c="dz-f"][data-k="pt"]', '2/3');
  await page.waitForTimeout(150);
  const filled = await px();
  ok(filled.s !== blank.s, 'il testo cambia l’anteprima');
  ok(await page.innerText('.vh h1') === 'Mago di Prova', 'titolo aggiornato');
  ok(await page.evaluate(() => CPADesigner.state.cur.cost) === '{1}{U}{U}' && await page.evaluate(() => CPADesigner.state.cur.rules.includes('Draw')), 'passare da un campo all\u2019altro non perde il testo');
  ok(filled.t > 0, 'canvas disegnato');

  /* simbolo inserito nel campo a fuoco */
  await page.focus('[data-c="dz-f"][data-k="rules"]');
  await page.click('[data-a="dz-sym"][data-v="{G}"]');
  ok((await page.inputValue('[data-c="dz-f"][data-k="rules"]')).includes('{G}'), 'simbolo inserito nel testo');

  /* colori e cornice */
  await page.click('[data-a="dz-col"][data-v="U"]');
  await page.selectOption('[data-c="dz-f"][data-k="frame"]', 'fullart');
  await page.waitForTimeout(100);
  const fa = await px(); ok(fa.s !== filled.s, 'cornice full art diversa');
  await page.selectOption('[data-c="dz-f"][data-k="frame"]', 'classic');

  /* arte */
  await page.setInputFiles('[data-c="dz-artfile"]', { name: 'arte.png', mimeType: 'image/png', buffer: artPng });
  await page.waitForSelector('[data-c="dz-art"][data-k="s"]');
  await page.waitForTimeout(250);
  const withArt = await px(); ok(withArt.s !== filled.s, 'arte caricata nell’anteprima');
  await page.evaluate(() => { const r = document.querySelector('[data-c="dz-art"][data-k="s"]'); r.value = '2'; r.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(100);
  const zoomed = await px(); ok(zoomed.s !== withArt.s, 'lo zoom cambia l’anteprima');
  /* trascinamento con il mouse */
  const box = await page.locator('#dz-cv').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.3); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height * 0.3 + 20, { steps: 4 }); await page.mouse.up();
  await page.waitForTimeout(100);
  ok(+(await page.inputValue('[data-c="dz-art"][data-k="x"]')) > 0, 'il trascinamento sposta l’arte');

  /* download PNG / JPG */
  let [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-a="dz-png"]')]);
  let buf = fs.readFileSync(await dl.path()); ok(buf.slice(1, 4).toString() === 'PNG' && buf.length > 5000, 'PNG scaricato (' + buf.length + ' byte)');
  [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-a="dz-jpg"]')]);
  buf = fs.readFileSync(await dl.path()); ok(buf[0] === 0xff && buf[1] === 0xd8, 'JPG scaricato');
  const dim = await page.evaluate(b => new Promise(res => { const im = new Image(); im.onload = () => res([im.width, im.height]); im.src = 'data:image/jpeg;base64,' + b; }), buf.toString('base64'));
  ok(dim[0] === 745 && dim[1] === 1040, 'JPG 745x1040');

  /* salvataggio: dopo il ricaricamento il design c'è ancora */
  await page.click('[data-a="dz-back"]');
  await page.waitForSelector('.dz-item');
  await go(); await nav('designer'); await page.waitForSelector('.dz-item');
  ok((await page.innerText('.dz-meta b')) === 'Mago di Prova', 'design salvato dopo il riavvio');
  await page.waitForTimeout(300);
  const thumbOk = await page.evaluate(() => { const c = document.querySelector('canvas.dz-th'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let t = 0; for (let i = 3; i < d.length; i += 4) t += d[i]; return t > 0; });
  ok(thumbOk, 'miniatura disegnata');

  /* aggiungere al mazzo come carta nuova */
  await page.click('[data-a="dz-open"]');
  await page.waitForSelector('[data-a="dz-add"]');
  await page.fill('[data-c="dz-bqty"]', '2');
  await page.click('[data-a="dz-add"]');
  await page.waitForFunction(() => /aggiunta a Mazzo prova/.test(document.body.innerText));
  ok(true, 'carta nuova aggiunta al mazzo');

  /* alter da Scryfall */
  await page.click('[data-a="dz-back"]');
  await page.click('[data-a="dz-new"][data-k="card"]');
  await page.waitForSelector('[data-c="dz-q"]');
  await page.fill('[data-c="dz-q"]', 'nonexistent card');
  await page.click('[data-a="dz-alter"]');
  await page.waitForFunction(() => /Non trovo una carta/.test(document.body.innerText));
  ok(true, 'carta inesistente segnalata');
  await page.fill('[data-c="dz-q"]', 'lightning bolt');
  await page.click('[data-a="dz-alter"]');
  await page.waitForFunction(() => /Importata: Lightning Bolt/.test(document.body.innerText));
  ok(await page.inputValue('[data-c="dz-f"][data-k="name"]') === 'Lightning Bolt', 'nome importato');
  ok((await page.inputValue('[data-c="dz-f"][data-k="rules"]')).includes('3 damage'), 'testo importato');
  await page.waitForSelector('[data-c="dz-art"][data-k="s"]');
  ok(await page.locator('[data-c="dz-art"][data-k="s"]').count() === 1, 'arte importata da Scryfall');
  /* scelta della stampa */
  await page.waitForSelector('[data-a="dz-prints-toggle"]', { state: 'attached' }); await page.waitForSelector('.bd-mbox button[data-a="dz-dlg-no"]');
  ok(await page.locator('[data-a="dz-dlg-yes"]').count() === 1, 'cornice mancante: dialogo di download');
  await page.click('.bd-mbox button[data-a="dz-dlg-no"]');
  ok(await page.locator('[data-a="dz-dlg-yes"]').count() === 0, 'il dialogo si chiude tenendo la cornice attuale');
  await page.click('[data-a="dz-prints-toggle"]');
  await page.waitForSelector('[data-a="dz-print-pick"]');
  ok(await page.locator('[data-a="dz-print-pick"]').count() === 2, 'due stampe disponibili');
  ok(await page.locator('[data-a="dz-print-pick"] img').count() === 2, 'le stampe sono mostrate come immagini');
  ok(await page.getAttribute('[data-a="dz-print-pick"][data-id="0"]', 'aria-pressed') === 'true', 'la stampa importata \u00e8 quella evidenziata');
  await page.click('[data-a="dz-print-pick"][data-id="1"]');
  await page.waitForFunction(() => /Stampa scelta: Altra Edizione/.test(document.body.innerText));
  ok(await page.evaluate(() => { const d = CPADesigner.state.cur; return d.set === 'XYZ' && d.num === '99' && d.rarity === 'rare' && d.artist === 'Altro Artista' && d.flavor === 'Altro testo.'; }), 'la stampa cambia collezione, numero, rarit\u00e0, artista e testo di colore');
  ok(await page.inputValue('[data-c="dz-f"][data-k="name"]') === 'Lightning Bolt', 'il testo della carta resta');
  await page.waitForTimeout(200);
  ok(await page.locator('[data-a="dz-dlg-yes"]').count() === 1, 'anche cambiando stampa la cornice mancante viene proposta');
  await page.click('.bd-mbox button[data-a="dz-dlg-no"]');

  /* sostituzione di una carta del mazzo */
  await page.selectOption('[data-c="dz-bcard"]', 'Lightning Bolt');
  await page.click('[data-a="dz-replace"]');
  await page.waitForFunction(() => /sostituisce Lightning Bolt/.test(document.body.innerText));
  ok(true, 'carta del mazzo sostituita');

  /* cornice importata */
  await page.click('[data-a="dz-back"]');
  await page.click('[data-a="dz-open"] >> nth=0');
  await page.waitForSelector('#dz-cv');
  const beforeF = await px();
  await page.setInputFiles('[data-c="dz-framefile"]', { name: 'cornice-verde.png', mimeType: 'image/png', buffer: framePng });
  await page.waitForFunction(() => /cornice-verde/.test(document.body.innerHTML));
  await page.waitForTimeout(300);
  const afterF = await px(); ok(afterF.s !== beforeF.s, 'cornice importata applicata');
  ok(await page.evaluate(() => CPADesigner.state.cur.frameImg) !== '', 'cornice selezionata');

  /* pacchetto di cornici: scelta automatica dai colori */
  const pack = { app: 'coglio-frames', version: 1, groups: [{ id: 'tst', name: 'Prova' }], frames: ['U', 'C'].map((k, i) => ({ key: k, name: 'Prova ' + k, group: 'tst', ink: 'dark', geo: { art: [56, 116, 631, 463], title: [45, 52, 654, 59], type: [45, 583, 654, 58], box: [55, 646, 634, 313], pt: [568, 920, 140, 81], info: [46, 984], panel: 'rgba(255,255,255,0.9)' },
    png: 'data:image/png;base64,' + [framePng, framePng][i].toString('base64'), pt: 'data:image/png;base64,' + framePng.toString('base64') })) };
  fs.writeFileSync('/tmp/claude-0/dz/pack-test.json', JSON.stringify(pack));
  await page.click('[data-a="dz-back"]'); await page.locator('[data-a="dz-open"]').first().click(); await page.waitForSelector('#dz-cv');
  await page.setInputFiles('[data-c="dz-framefile"]', '/tmp/claude-0/dz/pack-test.json');
  await page.waitForFunction(() => /Importati: 2 cornici/.test(document.body.innerText));
  ok(await page.evaluate(() => CPADesigner.state.cur.frameImg) === 'auto:tst', 'dopo il pacchetto la cornice è «automatica»');
  ok(await page.locator('[data-a="dz-frame-pick"][data-v="auto:tst"] img').count() === 1, 'anteprima del pacchetto nella griglia');
  ok(await page.locator('[data-a="dz-frame-pick"]').count() === 3, 'nella griglia solo le automatiche (più disegnata e PNG singola)');
  await page.waitForTimeout(300);
  const autoA = await px();
  await page.evaluate(() => { const d = CPADesigner.state.cur; d.colors = 'R'; });
  await page.evaluate(() => CPADesigner.state.cur.colors = '');
  await page.waitForTimeout(100);
  ok(await page.evaluate(() => CPADesigner.state.frames.filter(f => f.group === 'tst').length) === 2, 'due cornici del pacchetto salvate');
  await page.setInputFiles('[data-c="dz-framefile"]', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"altro"}') });
  await page.waitForFunction(() => /non è un pacchetto di cornici/.test(document.body.innerText));
  ok(true, 'pacchetto non valido rifiutato');
  await page.click('[data-a="dz-frame-del"]');
  await page.waitForFunction(() => CPADesigner.state.frames.every(f => f.group !== 'tst'));
  ok(await page.evaluate(() => CPADesigner.state.cur.frameImg) === '', 'pacchetto eliminato, torna la cornice disegnata');

  /* simboli e font importati (pacchetto solo-risorse) */
  const symPng = 'data:image/png;base64,' + framePng.toString('base64');
  fs.writeFileSync('/tmp/claude-0/dz/res-test.json', JSON.stringify({ app: 'coglio-frames', version: 1, symbols: { W: symPng, U: symPng, R: symPng, CIRCLE: symPng }, fonts: [{ role: 'title', family: 'CPA Title', style: 'normal', ttf: 'data:font/ttf;base64,AAAA' }], watermarks: [{ key: 'prova', name: 'Filigrana di prova', png: symPng }], walker: { plus: symPng, minus: symPng, neutral: symPng, lineOdd: symPng, lineEven: symPng, mask: symPng, maskTall: symPng, loyalty: symPng }, overlays: ['U', 'R', 'C'].map(k => ({ key: 'crown:' + k, png: symPng, b: [40, 20, 300, 120] })).concat(['U', 'R', 'C'].map(k => ({ key: 'pips:' + k, png: symPng, b: [57, 598, 35, 35] }))) }));
  await page.click('[data-a="dz-back"]'); await page.locator('[data-a="dz-open"]').first().click(); await page.waitForSelector('#dz-cv');
  const full = () => page.evaluate(() => document.getElementById('dz-cv').toDataURL().length + ':' + document.getElementById('dz-cv').toDataURL().slice(-400));
  const beforeS = await full();
  await page.setInputFiles('[data-c="dz-framefile"]', '/tmp/claude-0/dz/res-test.json');
  await page.waitForFunction(() => /simboli di mana/.test(document.body.innerText));
  ok(await page.evaluate(() => CPADesigner.state.res.some(r => r.kind === 'symbols' && Object.keys(r.map).length === 4)), 'simboli salvati');
  ok(await page.evaluate(() => CPACard.hasSymbols()), 'il motore usa i simboli importati');
  await page.waitForTimeout(300);
  ok((await full()) !== beforeS, 'i simboli cambiano l\u2019anteprima');
  ok(await page.evaluate(() => CPACard.hasWatermarks()), 'filigrane importate');
  ok(await page.evaluate(() => CPACard.hasWalker()), 'icone e fasce dei planeswalker importate');
  ok((await page.innerHTML('[data-k="watermark"]')).includes('Filigrana di prova'), 'menu filigrana nell\u2019editor');
  const beforeW = await full();
  await page.selectOption('[data-k="watermark"]', 'prova'); await page.waitForTimeout(400);
  ok((await full()) !== beforeW, 'la filigrana cambia l\u2019anteprima');
  ok(await page.evaluate(() => CPADesigner.state.cur.watermark) === 'prova', 'filigrana salvata nel design');
  await page.selectOption('[data-k="watermark"]', ''); await page.waitForTimeout(100);
  await go(); await nav('designer'); await page.waitForSelector('.dz-item');
  ok(await page.evaluate(() => CPADesigner.state.res.length) >= 1 && await page.evaluate(() => CPACard.hasSymbols()), 'simboli ancora attivi dopo il riavvio');
  await page.locator('[data-a="dz-open"]').first().click(); await page.waitForSelector('#dz-cv');
  await page.setInputFiles('[data-c="dz-framefile"]', { name: 'cornice-extra.png', mimeType: 'image/png', buffer: framePng });
  await page.waitForFunction(() => /cornice-extra/.test(document.body.innerHTML)); await page.waitForTimeout(300);
  ok(await page.evaluate(() => CPACard.hasOverlays()), 'extra delle cornici importati');
  ok(/extra della cornice/i.test(await page.evaluate(() => document.body.textContent)), 'sezione extra nell\u2019editor');
  const b4 = await full();
  await page.selectOption('[data-k="crown"]', 'legend'); await page.waitForTimeout(400);
  const b5 = await full(); ok(b5 !== b4, 'la corona cambia l\u2019anteprima');
  await page.selectOption('[data-k="pips"]', '1'); await page.waitForTimeout(400);
  ok((await full()) !== b5, 'i pips cambiano l\u2019anteprima');
  ok(await page.evaluate(() => CPADesigner.state.cur.crown === 'legend' && CPADesigner.state.cur.pips === '1'), 'extra salvati nel design');
  await page.selectOption('[data-k="crown"]', ''); await page.selectOption('[data-k="pips"]', '');
  await page.click('[data-a="dz-res-del"]');
  await page.waitForFunction(() => CPADesigner.state.res.length === 0);
  ok(await page.evaluate(() => !CPACard.hasSymbols() && !CPACard.hasWatermarks() && !CPACard.hasOverlays()), 'simboli, font e filigrane tolti');
  await page.click('[data-a="dz-back"]');

  /* vista mazzo: etichette Design */
  await nav('decks');
  await page.click('[data-a="open-deck"]');
  await page.waitForSelector('#dlist .crow');
  const rows = await page.locator('#dlist .crow').count();
  ok(rows === 4, 'righe del mazzo: ' + rows);
  ok(await page.locator('#dlist .tag.dzt').count() === 2, 'due carte con design nel mazzo');
  ok(await page.locator('#dlist [data-a="dz-unbind"]').count() === 2, 'pulsanti «Togli design»');
  ok(await page.locator('#dlist [data-a="dz-bind"]').count() === 2, 'pulsanti «Design» sulle altre');

  /* scegliere un design per una carta dal mazzo */
  await page.locator('#dlist .crow', { hasText: 'Sol Ring' }).locator('[data-a="dz-bind"]').click();
  await page.waitForSelector('.dz-pickit');
  await page.locator('.dz-pickit').first().click();
  await page.waitForFunction(() => /sostituisce Sol Ring/.test(document.body.innerText) || /Designer/.test(document.body.innerText));
  await nav('decks'); await page.click('[data-a="open-deck"]'); await page.waitForSelector('#dlist .crow');
  ok(await page.locator('#dlist .tag.dzt').count() === 3, 'terza carta con design');
  await page.locator('#dlist .crow', { hasText: 'Sol Ring' }).locator('[data-a="dz-unbind"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#dlist .tag.dzt').length === 2);
  ok(true, 'design tolto da una carta');

  /* PDF dal mazzo: le carte con design usano l'immagine disegnata */
  await page.click('[data-a="make-pdf"]');
  await page.waitForSelector('.bd-row');
  await page.waitForFunction(() => !document.getElementById('bd-prog') || !document.getElementById('bd-prog').textContent, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  const bdText = await page.innerText('body');
  ok((bdText.match(/design Coglio/g) || []).length === 2, 'nella stampa: 2 carte «design Coglio»');
  [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('[data-a="bd-go"]')]);
  const pdf = fs.readFileSync(await dl.path());
  ok(pdf.slice(0, 5).toString() === '%PDF-' && pdf.length > 20000, 'PDF generato (' + pdf.length + ' byte)');
  ok((pdf.toString('latin1').match(/\/Subtype ?\/Image/g) || []).length >= 2, 'immagini nel PDF');

  /* esporta e reimporta */
  await nav('designer'); await page.waitForSelector('.dz-item');
  [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-a="dz-export-all"]')]);
  const jsonPath = await dl.path(); const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  ok(data.app === 'coglio-designer' && data.items.length === 2 && /^data:image/.test(data.items[0].art), 'export con arte incorporata');
  await page.setInputFiles('[data-c="dz-import"]', jsonPath);
  await page.waitForFunction(() => /2 design importati/.test(document.body.innerText));
  ok(await page.locator('.dz-item').count() === 4, 'design reimportati');
  await page.setInputFiles('[data-c="dz-import"]', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"a":1}') });
  await page.waitForFunction(() => /non è un file di design/.test(document.body.innerText));
  ok(true, 'file non valido rifiutato');

  /* eliminazione: le carte tornano a Scryfall */
  await page.locator('[data-a="dz-open"]').first().click();
  await page.waitForSelector('[data-a="dz-del"]');
  await page.click('[data-a="dz-del"]');
  ok(/Conferma eliminazione/.test(await text()), 'serve una conferma');
  await page.click('[data-a="dz-del"]');
  await page.waitForSelector('.dz-item');
  ok(await page.locator('.dz-item').count() === 3, 'design eliminato');

  /* risorse incluse nell'app: si caricano da sole, una volta */
  const bpng = 'data:image/png;base64,' + framePng.toString('base64');
  bundleBody = JSON.stringify({ app: 'coglio-frames', version: 1, groups: [{ id: 'bnd', name: 'Inclusa' }], frames: [{ key: 'U', name: 'Inclusa U', group: 'bnd', ink: 'dark', geo: null, png: bpng }], symbols: { U: bpng } });
  await go(); await nav('designer'); await page.waitForSelector('.dz-item');
  ok(await page.evaluate(() => CPADesigner.state.frames.filter(f => f.group === 'bnd').length) === 1, 'cornici incluse caricate da sole');
  ok(await page.evaluate(() => CPACard.hasSymbols()), 'simboli inclusi attivi');
  ok(!/Importati/.test(await text()), 'caricamento incluso silenzioso');
  await page.locator('[data-a="dz-open"]').first().click(); await page.waitForSelector('#dz-cv');
  await page.click('[data-a="dz-frame-pick"][data-v="auto:bnd"]');
  await page.click('[data-a="dz-frame-del"]');
  await page.waitForFunction(() => CPADesigner.state.frames.every(f => f.group !== 'bnd'));
  await page.click('[data-a="dz-back"]');
  await go(); await nav('designer'); await page.waitForSelector('.dz-item');
  ok(await page.evaluate(() => CPADesigner.state.frames.filter(f => f.group === 'bnd').length) === 0, 'tolte dall\u2019utente, non tornano al riavvio');

  /* elimina dalla lista e cartelle */
  await page.waitForSelector('.dz-item');
  ok(await page.locator('[data-a="dz-new"][data-k="token"], [data-a="dz-new"][data-k="alter"]').count() === 0, 'tolti i pulsanti token e alter');
  const nAll = await page.locator('.dz-item').count();
  await page.click('[data-a="dz-f-new"]'); await page.fill('[data-c="dz-ftext"]', 'Cube'); await page.click('[data-a="dz-f-save"]');
  await page.waitForFunction(() => /Cube \(0\)/.test(document.body.innerText));
  ok(/Questa cartella \u00e8 vuota/.test(await text()), 'cartella vuota creata');
  await page.click('[data-a="dz-new"][data-k="card"]'); await page.waitForSelector('#dz-cv');
  ok(await page.evaluate(() => CPADesigner.state.cur.folder) === 'Cube', 'la nuova carta nasce nella cartella aperta');
  await page.click('[data-a="dz-back"]'); await page.waitForSelector('.dz-item');
  ok(await page.locator('.dz-item').count() === 1, 'nella cartella c\u2019\u00e8 solo la sua carta');
  await page.click('[data-a="dz-f-pick"][data-v="*"]');
  ok(await page.locator('.dz-item').count() === nAll + 1, 'Tutte mostra ogni design');
  await page.locator('select[data-c="dz-move"]').last().selectOption('Cube');
  await page.click('[data-a="dz-f-pick"][data-v="Cube"]');
  ok(await page.locator('.dz-item').count() === 2, 'spostato un design nella cartella dal menu');
  await go(); await nav('designer'); await page.waitForSelector('.dz-item');
  ok(/Cube \(2\)/.test(await text()), 'cartelle e assegnazioni restano dopo il riavvio');
  await page.click('[data-a="dz-f-pick"][data-v="Cube"]');
  await page.click('[data-a="dz-f-rename"]'); await page.fill('[data-c="dz-ftext"]', 'Cubo'); await page.click('[data-a="dz-f-save"]');
  await page.waitForFunction(() => /Cubo \(2\)/.test(document.body.innerText));
  ok(await page.evaluate(() => CPADesigner.list().filter(d => d.folder === 'Cubo').length) === 2, 'rinominata la cartella, i design la seguono');
  await page.locator('[data-a="dz-item-del"]').first().click();
  ok(/Conferma/.test(await page.innerText('[data-a="dz-item-del"]')), 'eliminazione dalla lista chiede conferma');
  await page.locator('[data-a="dz-item-del"]').first().click();
  await page.waitForFunction(() => document.querySelectorAll('.dz-item').length === 1);
  ok(true, 'design eliminato direttamente dalla lista');
  await page.click('[data-a="dz-f-del"]'); await page.click('[data-a="dz-f-del"]');
  await page.waitForFunction(() => !/Cubo \(/.test(document.body.innerText));
  ok(await page.evaluate(() => CPADesigner.list().every(d => !d.folder)), 'cartella eliminata: i design restano, senza cartella');
  await page.click('[data-a="dz-f-pick"][data-v="*"]');

  /* catalogo cornici */
  packFiles['/packs/index.json'] = JSON.stringify({ app: 'coglio-catalog', version: 1, packs: [{ id: 'M15BoxTopper', name: 'Extended Art di prova', category: 'Showcase', n: 1, bytes: 1000 }, { id: 'tst', name: 'Borderless di prova', category: 'Showcase', n: 2, bytes: 1000 }, { id: 'pw', name: 'Altro pacchetto', category: 'Planeswalker', n: 1, bytes: 1000, layout: 'planeswalker' }] });
  packFiles['/packs/tst/pack.json'] = JSON.stringify({ app: 'coglio-frames', version: 1, groups: [{ id: 'cc-tst', name: 'Borderless di prova' }], frames: ['U', 'C'].map(k => ({ key: k, name: 'Prova ' + k, group: 'cc-tst', ink: 'light', geo: { art: [0, 0, 745, 959], title: [44, 54, 654, 56], type: [44, 589, 654, 56], box: [42, 639, 661, 331], pt: [576, 926, 130, 63], info: [46, 980], colors: { title: 'white', type: 'white', rules: 'white', pt: 'white' } }, png: k + '.webp', pt: null })) });
  packFiles['/packs/pw/pack.json'] = JSON.stringify({ app: 'coglio-frames', version: 1, groups: [{ id: 'cc-pw', name: 'Altro pacchetto' }], frames: [{ key: 'C', name: 'PW', group: 'cc-pw', ink: 'dark', geo: { art: [50, 105, 645, 485], title: [44, 38, 655, 57], type: [44, 584, 655, 57], box: [112, 633, 600, 334], pt: [586, 926, 132, 63], info: [46, 980], layout: 'planeswalker', walker: { x: 0.18, w: 0.7467, top: 0.6239, tall: false, box: true } }, png: 'C.webp', pt: null }] });
  packFiles['/packs/pw/C.webp'] = framePng;
  packFiles['/packs/tst/U.webp'] = framePng; packFiles['/packs/tst/C.webp'] = framePng; packFiles['/packs/tst/thumb.webp'] = framePng;
  await page.click('[data-a="dz-catalog"]');
  await page.waitForSelector('.dz-catitem');
  ok(await page.locator('.dz-catitem').count() === 3, 'catalogo caricato');
  await page.fill('[data-c="dz-catq"]', 'borderless');
  ok(await page.locator('.dz-catitem:not([hidden])').count() === 1, 'la ricerca filtra il catalogo');
  await page.click('[data-a="dz-cat-add"][data-id="tst"]');
  await page.waitForFunction(() => CPADesigner.state.frames.filter(f => f.group === 'cc-tst').length === 2);
  await page.waitForSelector('[data-a="dz-cat-del"][data-id="tst"]');
  ok(true, 'pacchetto del catalogo aggiunto');
  await page.click('[data-a="dz-back"]'); await page.waitForSelector('.dz-item');
  await page.locator('[data-a="dz-open"]').first().click(); await page.waitForSelector('#dz-cv');
  ok(await page.locator('[data-a="dz-frame-pick"][data-v="auto:cc-tst"]').count() === 1, 'il pacchetto compare nella griglia delle cornici');
  const bc = await full();
  await page.click('[data-a="dz-frame-pick"][data-v="auto:cc-tst"]'); await page.waitForTimeout(400);
  ok((await full()) !== bc, 'la cornice del catalogo cambia l\u2019anteprima');
  ok(await page.evaluate(() => CPADesigner.state.cur.ink) === 'light', 'il colore del testo segue la cornice');
  /* pacchetto planeswalker: la carta passa da sola al tipo planeswalker */
  await page.click('[data-a="dz-back"]'); await page.click('[data-a="dz-catalog"]'); await page.waitForSelector('.dz-catitem:not([hidden])'); await page.fill('[data-c="dz-catq"]', ''); await page.waitForSelector('[data-a="dz-cat-add"][data-id="pw"]');
  await page.click('[data-a="dz-cat-add"][data-id="pw"]'); await page.waitForSelector('[data-a="dz-cat-del"][data-id="pw"]');
  await page.click('[data-a="dz-back"]'); await page.waitForSelector('.dz-item'); await page.locator('[data-a="dz-open"]').first().click(); await page.waitForSelector('#dz-cv');
  await page.click('[data-a="dz-frame-pick"][data-v="auto:cc-pw"]'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => CPADesigner.state.cur.frame) === 'planeswalker', 'cornice planeswalker: la carta diventa planeswalker');
  await page.click('[data-a="dz-frame-pick"][data-v="auto:cc-tst"]'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => CPADesigner.state.cur.frame) === 'classic', 'tornando a una cornice normale la carta torna classica');
  await page.click('[data-a="dz-back"]'); await page.click('[data-a="dz-catalog"]'); await page.waitForSelector('[data-a="dz-cat-del"][data-id="tst"]');
  await page.click('[data-a="dz-cat-del"][data-id="pw"]');
  await page.click('[data-a="dz-cat-del"][data-id="tst"]');
  await page.waitForFunction(() => CPADesigner.state.frames.every(f => f.group !== 'cc-tst'));
  ok(await page.evaluate(() => CPADesigner.list().every(d => d.frameImg !== 'auto:cc-tst')), 'pacchetto rimosso, i design tornano alla cornice disegnata');
  await page.click('[data-a="dz-back"]'); await page.waitForSelector('.dz-item');

  /* cornice dedotta dai dati Scryfall + scaricamento su richiesta */
  packFiles['/packs/M15BoxTopper/pack.json'] = JSON.stringify({ app: 'coglio-frames', version: 1, groups: [{ id: 'cc-M15BoxTopper', name: 'Extended Art di prova' }], frames: [{ key: 'C', name: 'Ext C', group: 'cc-M15BoxTopper', ink: 'dark', geo: null, png: 'C.webp', pt: null }] });
  packFiles['/packs/M15BoxTopper/C.webp'] = framePng;
  const w = await page.evaluate(() => {
    const W = CPADesigner.wantFrame, k = x => { const r = W(Object.assign({ frame: '2015', layout: 'normal', type_line: 'Creature', set: 'xxx', border_color: 'black' }, x)); return r && r.c.id || (r && r.c.b); };
    return { ext: k({ frame_effects: ['extendedart'] }), old: k({ frame: '1993', set: '4ed' }), abu: k({ frame: '1993', set: 'lea' }), m8: k({ frame: '2003' }), sta: k({ frame_effects: ['showcase'], set: 'sta' }), pw: k({ type_line: 'Legendary Planeswalker — Jace' }),
      reg: k({}), tok: k({ layout: 'token' }), borl: k({ border_color: 'borderless' }), crown: CPADesigner.wantFrame({ frame: '2015', frame_effects: ['legendary'], type_line: 'Legendary Creature' }).crown };
  });
  ok(w.ext === 'M15BoxTopper' && w.old === 'Fourth' && w.abu === 'ABU' && w.m8 === '8th' && w.sta === 'MysticalArchive' && w.pw === 'PlaneswalkerRegular' && w.reg === 'M15RegularNew' && w.tok === null && w.borl === 'Borderless' && w.crown === 'legend', 'la cornice dedotta dai dati della carta: ' + JSON.stringify(w));
  await page.locator('[data-a="dz-open"]').first().click(); await page.waitForSelector('#dz-cv');
  await page.evaluate(() => CPADesigner.applyFrameFor({ frame: '2015', layout: 'normal', type_line: 'Legendary Creature', set: 'xxx', border_color: 'black', frame_effects: ['extendedart', 'legendary'] }));
  await page.waitForSelector('.bd-mbox button[data-a="dz-dlg-yes"]');
  ok(/Extended Art/.test(await page.locator('.bd-mbox').innerText()), 'il dialogo nomina la cornice mancante');
  await page.click('.bd-mbox button[data-a="dz-dlg-yes"]');
  await page.waitForFunction(() => !document.querySelector('.bd-mbox') && CPADesigner.state.cur.frameImg === 'auto:cc-M15BoxTopper');
  ok(await page.evaluate(() => CPADesigner.state.cur.crown) === 'legend', 'la corona leggendaria segue la carta');
  ok(true, 'cornice scaricata e applicata dal dialogo');
  await page.evaluate(() => CPADesigner.applyFrameFor({ frame: '2015', layout: 'normal', type_line: 'Creature', set: 'xxx', border_color: 'black', frame_effects: ['extendedart'] }));
  ok(await page.evaluate(() => !document.querySelector('.bd-mbox') && CPADesigner.state.cur.frameImg === 'auto:cc-M15BoxTopper'), 'se la cornice c’è già si applica senza chiedere');
  await page.click('[data-a="dz-back"]'); await page.waitForSelector('.dz-item');

  /* carta bifronte: retro importato da Scryfall, tasto Trasforma, retro nell'esportazione */
  await page.click('[data-a="dz-new"][data-k="card"]'); await page.waitForSelector('[data-c="dz-q"]');
  ok(/aggiungi il retro/i.test(await page.locator('[data-a="dz-flip"]').innerText()), 'prima di importare il tasto propone di aggiungere il retro');
  await page.fill('[data-c="dz-q"]', 'delver'); await page.click('[data-a="dz-alter"]');
  await page.waitForFunction(() => /Importata: Delver/.test(document.body.innerText) && CPADesigner.state.root.back && CPADesigner.state.root.back.art.id);
  ok(await page.evaluate(() => { const b = CPADesigner.state.root.back; return b.name === 'Insectile Aberration' && b.pt === '3/2' && b.rules === 'Flying' && b.artist === 'Back Artist'; }), 'il retro prende la seconda faccia di Scryfall');
  const dlgBtn = await page.locator('.bd-mbox button[data-a="dz-dlg-no"]').count(); if (dlgBtn) await page.click('.bd-mbox button[data-a="dz-dlg-no"]');
  ok(/mostra il retro/i.test(await page.locator('[data-a="dz-flip"]').innerText()), 'tasto Trasforma: mostra il retro');
  await page.click('[data-a="dz-flip"]');
  ok(await page.inputValue('[data-c="dz-f"][data-k="name"]') === 'Insectile Aberration' && /mostra il fronte/i.test(await page.locator('[data-a="dz-flip"]').innerText()), 'Trasforma mostra e modifica il retro');
  ok(await page.locator('[data-a="dz-alter"]').count() === 0 && await page.locator('[data-a="dz-add"]').count() === 0, 'sul retro niente importazione e niente mazzo');
  await page.fill('[data-c="dz-f"][data-k="name"]', 'Retro modificato'); await page.waitForTimeout(450);
  await page.click('[data-a="dz-flip"]');
  ok(await page.inputValue('[data-c="dz-f"][data-k="name"]') === 'Delver of Secrets', 'di nuovo sul fronte');
  ok(await page.evaluate(async () => { const r = CPADesigner.state.root, f = await CPADesigner.renderBlob(r.id, {}), b = await CPADesigner.renderBlob(r.id, { face: 'back' }); return f.size > 1000 && b.size > 1000 && CPADesigner.hasBack(r.id) && r.back.name === 'Retro modificato'; }), 'fronte e retro si disegnano e il retro si salva');
  const idBd = await page.evaluate(() => CPADesigner.state.root.id);
  await page.click('[data-a="dz-dup"]'); await page.waitForFunction(id => CPADesigner.state.root.id !== id, idBd);
  ok(await page.evaluate(() => { const b = CPADesigner.state.root.back; return !!b && b.name === 'Retro modificato' && !!b.art.id; }), 'duplicare porta con sé anche il retro e la sua arte');
  await page.click('[data-a="dz-back-del"]');
  ok(await page.evaluate(() => !CPADesigner.state.root.back), 'tolto il retro');
  /* simbolo del set personalizzato */
  const setSymPng = Buffer.from(await mkImg('image/png', 120, 90, 'x.clearRect(0,0,w,h);x.fillStyle="#d22";x.beginPath();x.moveTo(60,5);x.lineTo(115,85);x.lineTo(5,85);x.closePath();x.fill();'), 'base64');
  const rb = () => page.evaluate(async () => { const b = await CPADesigner.renderBlob(CPADesigner.state.root.id, { type: 'image/png' }); return await new Promise(r => { const f = new FileReader(); f.onload = () => r(String(f.result).length + ':' + String(f.result).slice(-400)); f.readAsDataURL(b); }); });
  await page.waitForTimeout(300); const sym0 = await rb();
  await page.setInputFiles('[data-c="dz-setsym"]', { name: 'logo.png', mimeType: 'image/png', buffer: setSymPng });
  await page.waitForFunction(() => CPADesigner.state.cur.setImg);
  const sym1 = await rb(); ok(sym1 !== sym0, 'il simbolo personalizzato sostituisce la gemma');
  await page.selectOption('[data-c="dz-f"][data-k="setTint"]', 'rarity'); await page.waitForTimeout(100);
  const sym2 = await rb(); ok(sym2 !== sym1 && await page.evaluate(() => CPADesigner.state.cur.setTint) === 'rarity', 'colore della rarità sul simbolo');
  const symDup = await page.evaluate(() => CPADesigner.state.root.id);
  await page.click('[data-a="dz-dup"]'); await page.waitForFunction(id => CPADesigner.state.root.id !== id, symDup);
  ok(await page.evaluate(async () => { const d = CPADesigner.state.root; return !!d.setImg && d.setTint === 'rarity' && !!(await CPADesigner.renderBlob(d.id, {})); }), 'duplicare porta con sé il simbolo');
  await page.click('[data-a="dz-setsym-del"]');
  ok(await page.evaluate(() => CPADesigner.state.cur.setImg) === '', 'si torna alla gemma di rarità');

  /* due colori */
  await page.evaluate(() => { const d = CPADesigner.state.cur; d.mix = 'BR'; d.cmix = 'BR'; d.crown = 'legend'; });
  ok(await page.evaluate(() => CPACard.mixOf('BR') === 'BR' && CPACard.mixOf('BB') === null && CPACard.paletteKey({ mix: 'RG', colors: 'W' }) === 'R'), 'la cornice a due colori usa il colore di sinistra come base');
  await page.evaluate(() => { document.querySelector('.dz-adv').open = true; });
  await page.selectOption('[data-c="dz-mix"][data-k="mix"][data-side="0"]', 'W'); await page.selectOption('[data-c="dz-mix"][data-k="mix"][data-side="1"]', 'U');
  ok(await page.evaluate(() => CPADesigner.state.cur.mix) === 'WU', 'i selettori impostano la cornice a due colori');
  await page.selectOption('[data-c="dz-mix"][data-k="mix"][data-side="1"]', ''); ok(await page.evaluate(() => CPADesigner.state.cur.mix) === '', 'togliendo un colore la cornice torna normale');
  /* scelta: nessuna / solo corona / cornice e corona */
  await page.evaluate(() => { const d = CPADesigner.state.cur; d.colors = 'UR'; d.cost = '{R}{U}'; d.mix = ''; d.cmix = ''; d.type = 'Legendary Creature \u2014 Wizard'; });
  await page.selectOption('[data-c="dz-f"][data-k="palette"]', 'auto');
  ok(await page.locator('[data-a="dz-bi"]').count() === 3, 'carta a due colori: tre scelte');
  await page.click('[data-a="dz-bi"][data-v="crown"]');
  ok(await page.evaluate(() => { const d = CPADesigner.state.cur; return d.cmix === 'RU' && d.mix === '' && d.crown === 'legend'; }), 'solo corona: cornice normale, corona a due colori (ordine del costo)');
  await page.click('[data-a="dz-bi"][data-v="both"]');
  ok(await page.evaluate(() => { const d = CPADesigner.state.cur; return d.cmix === 'RU' && d.mix === 'RU'; }), 'cornice e corona a due colori');
  await page.click('[data-a="dz-bi"][data-v="none"]');
  ok(await page.evaluate(() => { const d = CPADesigner.state.cur; return d.cmix === '' && d.mix === ''; }), 'nessuno dei due: cornice dorata');
  const hy = await page.evaluate(() => CPADesigner.wantFrame({ frame: '2015', layout: 'normal', type_line: 'Creature', set: 'x', border_color: 'black', mana_cost: '{W/U}{W/U}', colors: ['W', 'U'] }).mix);
  ok(hy === 'WU', 'una carta ibrida prende la cornice a due colori');
  await page.click('[data-a="dz-back"]'); await page.waitForSelector('.dz-item');

  /* corona propria della cornice (bifronte): ritaglia la cornice fuori dal suo profilo e importa rev/corone dal pacchetto */
  const crownPng = (await mkImg('image/png', 704, 173, 'x.fillStyle="#caa";x.fillRect(0,0,w,40);x.clearRect(0,0,w,8);x.clearRect(300,0,100,12);x.fillRect(0,40,w,12);x.fillRect(0,40,10,100);x.fillRect(w-10,40,10,100);x.clearRect(30,16,w-60,24);x.fillRect(0,40,w,0);'));
  fs.writeFileSync('/tmp/claude-0/dz/pack-crown.json', JSON.stringify({ app: 'coglio-frames', version: 1, rev: 2, groups: [{ id: 'cc-crw', name: 'Con corona' }], frames: [{ key: 'C', name: 'Corona C', group: 'cc-crw', ink: 'dark', geo: { art: [57, 117, 631, 461], title: [99, 54, 602, 56], type: [44, 589, 658, 56], box: [42, 640, 661, 331], pt: [576, 926, 130, 63], info: [46, 980], crown: [20, 20, 704, 173] }, png: 'data:image/png;base64,' + framePng.toString('base64'), pt: null, crown: 'data:image/png;base64,' + crownPng }] }));
  await page.click('[data-a="dz-new"][data-k="card"]'); await page.waitForSelector('#dz-cv');
  await page.setInputFiles('[data-c="dz-framefile"]', '/tmp/claude-0/dz/pack-crown.json').catch(async () => { await page.click('.dz-tab[data-v="aspetto"]'); await page.setInputFiles('[data-c="dz-framefile"]', '/tmp/claude-0/dz/pack-crown.json'); });
  await page.waitForFunction(() => CPADesigner.state.frames.some(f => f.group === 'cc-crw'));
  ok(await page.evaluate(() => { const f = CPADesigner.state.frames.filter(x => x.group === 'cc-crw')[0]; return !!f.crownBlob && f.rev === 2; }), 'il pacchetto importato conserva corona e versione');
  const cut = await page.evaluate(async () => {
    const d = CPADesigner.state.cur; d.frameImg = 'auto:cc-crw'; d.crown = 'legend'; d.type = 'Legendary Creature';
    const c = document.createElement('canvas'); c.width = 745; c.height = 1040; const x = c.getContext('2d');
    const fa = await CPADesigner.assetsFor(d); CPACard.render(x, d, { art: null, frameImg: fa.frameImg, ptImg: fa.ptImg, frameGeo: fa.frameGeo, crownImg: fa.crownImg });
    const px = (a, b) => Array.from(x.getImageData(a, b, 1, 1).data);
    return { hasCrown: !!fa.crownImg, valley: px(350, 25), hole: px(320, 48) };
  });
  ok(cut.hasCrown, 'la cornice porta la sua corona');
  ok(cut.valley[0] < 40 && cut.valley[1] < 40 && cut.hole[1] > 100, 'corona leggendaria: fuori dal profilo la cornice è ritagliata, dentro la barra resta');

  /* mobile: sei voci nel menu in basso */
  await page.setViewportSize({ width: 390, height: 800 });
  const tabs = await page.evaluate(() => { const t = document.querySelector('.tabs'); return { n: t.querySelectorAll('.nav').length, w: t.scrollWidth, cw: t.clientWidth }; });
  ok(tabs.n === 6 && tabs.w <= tabs.cw + 1, 'menu mobile senza overflow');
  await page.screenshot({ path: '/tmp/claude-0/dz/mobile.png' });

  ok(errors.length === 0, 'nessun errore JS: ' + errors.join(' | '));
  console.log('DESIGNER OK, ' + n + ' controlli passati');
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
