/* Test del Coglio Proxy Designer in Chromium vero (canvas, IndexedDB, caricamento file, PDF).
 * Scryfall è simulato. Uso: node tools/designer-test.js */
const path = require('path'), fs = require('fs'), http = require('http'), assert = require('assert');
const { chromium } = require('playwright');
const WEB = path.join(__dirname, '..', 'web');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json' };
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); };

let bundleBody = null; /* risorse.json incluso nell'app: simulato per non dipendere dai file veri */
(async () => {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
    if (p === '/risorse.json') { if (bundleBody) { r.writeHead(200, { 'Content-Type': 'application/json' }); return r.end(bundleBody); } r.writeHead(404); return r.end(); }
    const f = path.join(WEB, p);
    if (!f.startsWith(WEB) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
  }).listen(0);
  const base = 'http://localhost:' + srv.address().port + '/';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
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
    mana_cost: '{R}', type_line: 'Instant', oracle_text: 'Lightning Bolt deals 3 damage to any target.', flavor_text: 'The sparkmage shrieked.', rarity: 'common', colors: ['R'], artist: 'Christopher Moeller' });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route('https://cards.scryfall.io/**', r => r.request().url().includes('art_crop') ? r.fulfill({ status: 200, contentType: 'image/png', body: artPng, headers: { 'access-control-allow-origin': '*' } }) : r.fulfill({ status: 200, contentType: 'image/jpeg', body: jpg, headers: { 'access-control-allow-origin': '*' } }));
  await ctx.route('https://api.scryfall.com/**', r => {
    const u = new URL(r.request().url()), h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: h });
    if (u.pathname === '/cards/named') {
      const q = u.searchParams.get('fuzzy') || u.searchParams.get('exact') || '';
      if (/nonexist/i.test(q)) return r.fulfill({ status: 404, contentType: 'application/json', headers: h, body: '{}' });
      return r.fulfill({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify(mkCard('Lightning Bolt')) });
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
  await page.click('[data-a="dz-set"][data-k="frame"][data-v="fullart"]');
  await page.waitForTimeout(100);
  const fa = await px(); ok(fa.s !== filled.s, 'cornice full art diversa');
  await page.click('[data-a="dz-set"][data-k="frame"][data-v="classic"]');

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
  await page.click('[data-a="dz-new"][data-k="alter"]');
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
  ok(await page.locator('[data-c="dz-art"][data-k="s"]').count() === 1, 'arte importata da Scryfall');
  await page.waitForTimeout(200);

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
  ok(await page.locator('[data-c="dz-frameimg"]').inputValue() !== '', 'cornice selezionata');

  /* pacchetto di cornici: scelta automatica dai colori */
  const pack = { app: 'coglio-frames', version: 1, groups: [{ id: 'tst', name: 'Prova' }], frames: ['U', 'C'].map((k, i) => ({ key: k, name: 'Prova ' + k, group: 'tst', ink: 'dark', geo: { art: [56, 116, 631, 463], title: [45, 52, 654, 59], type: [45, 583, 654, 58], box: [55, 646, 634, 313], pt: [568, 920, 140, 81], info: [46, 984], panel: 'rgba(255,255,255,0.9)' },
    png: 'data:image/png;base64,' + [framePng, framePng][i].toString('base64'), pt: 'data:image/png;base64,' + framePng.toString('base64') })) };
  fs.writeFileSync('/tmp/claude-0/dz/pack-test.json', JSON.stringify(pack));
  await page.click('[data-a="dz-back"]'); await page.locator('[data-a="dz-open"]').first().click(); await page.waitForSelector('#dz-cv');
  await page.setInputFiles('[data-c="dz-framefile"]', '/tmp/claude-0/dz/pack-test.json');
  await page.waitForFunction(() => /Importati: 2 cornici/.test(document.body.innerText));
  ok(await page.inputValue('[data-c="dz-frameimg"]') === 'auto:tst', 'dopo il pacchetto la cornice è «automatica»');
  ok(/Prova — automatica/.test(await page.innerHTML('[data-c="dz-frameimg"]')), 'opzione automatica nel menu');
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
  ok(await page.inputValue('[data-c="dz-frameimg"]') === '', 'pacchetto eliminato, torna la cornice disegnata');

  /* simboli e font importati (pacchetto solo-risorse) */
  const symPng = 'data:image/png;base64,' + framePng.toString('base64');
  fs.writeFileSync('/tmp/claude-0/dz/res-test.json', JSON.stringify({ app: 'coglio-frames', version: 1, symbols: { W: symPng, U: symPng, R: symPng, CIRCLE: symPng }, fonts: [{ role: 'title', family: 'CPA Title', style: 'normal', ttf: 'data:font/ttf;base64,AAAA' }], watermarks: [{ key: 'prova', name: 'Filigrana di prova', png: symPng }] }));
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
  ok((await page.innerHTML('[data-k="watermark"]')).includes('Filigrana di prova'), 'menu filigrana nell\u2019editor');
  const beforeW = await full();
  await page.selectOption('[data-k="watermark"]', 'prova'); await page.waitForTimeout(400);
  ok((await full()) !== beforeW, 'la filigrana cambia l\u2019anteprima');
  ok(await page.evaluate(() => CPADesigner.state.cur.watermark) === 'prova', 'filigrana salvata nel design');
  await page.selectOption('[data-k="watermark"]', ''); await page.waitForTimeout(100);
  await go(); await nav('designer'); await page.waitForSelector('.dz-item');
  ok(await page.evaluate(() => CPADesigner.state.res.length) >= 1 && await page.evaluate(() => CPACard.hasSymbols()), 'simboli ancora attivi dopo il riavvio');
  await page.locator('[data-a="dz-open"]').first().click(); await page.waitForSelector('#dz-cv');
  await page.click('[data-a="dz-res-del"]');
  await page.waitForFunction(() => CPADesigner.state.res.length === 0);
  ok(await page.evaluate(() => !CPACard.hasSymbols() && !CPACard.hasWatermarks()), 'simboli, font e filigrane tolti');
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
  await page.selectOption('[data-c="dz-frameimg"]', 'auto:bnd');
  await page.click('[data-a="dz-frame-del"]');
  await page.waitForFunction(() => CPADesigner.state.frames.every(f => f.group !== 'bnd'));
  await page.click('[data-a="dz-back"]');
  await go(); await nav('designer'); await page.waitForSelector('.dz-item');
  ok(await page.evaluate(() => CPADesigner.state.frames.filter(f => f.group === 'bnd').length) === 0, 'tolte dall\u2019utente, non tornano al riavvio');

  /* mobile: sei voci nel menu in basso */
  await page.setViewportSize({ width: 390, height: 800 });
  const tabs = await page.evaluate(() => { const t = document.querySelector('.tabs'); return { n: t.querySelectorAll('.nav').length, w: t.scrollWidth, cw: t.clientWidth }; });
  ok(tabs.n === 6 && tabs.w <= tabs.cw + 1, 'menu mobile senza overflow');
  await page.screenshot({ path: '/tmp/claude-0/dz/mobile.png' });

  ok(errors.length === 0, 'nessun errore JS: ' + errors.join(' | '));
  console.log('DESIGNER OK, ' + n + ' controlli passati');
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
