/* Prova in Chromium vero delle funzioni della 4.0: ricerca avanzata, filtri e prezzi. Scryfall è simulato.
 * Uso: node tools/feat-smoke.js   (SHOTS=cartella per salvare gli screenshot) */
const path = require('path'), fs = require('fs'), http = require('http'), assert = require('assert');
const { chromium } = require('playwright');
const WEB = path.join(__dirname, '..', 'web'), FX = path.join(__dirname, 'fixtures') + '/';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json', '.woff2': 'font/woff2', '.json': 'application/json' };
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); };
const SHOTS = process.env.SHOTS || '';

/* ----- Scryfall finto ----- */
const LANDS = new Set(['Akoum Refuge', 'Barren Moor', 'Bojuka Bog', 'Boros Garrison', 'Command Tower', 'Evolving Wilds', 'Forgotten Cave', 'Molten Slagheap', 'Orzhov Basilica', 'Rakdos Carnarium', 'Rupture Spire', 'Secluded Steppe', 'Vivid Meadow', 'Zoetic Cavern', 'Mountain', 'Plains', 'Swamp']);
const SPEC = {
  'Sol Ring': { t: 'Artifact', mc: '{1}', v: 1, c: [], r: 'uncommon', p: 1.5, o: '{T}: Add {C}{C}.' },
  'Akroma, Angel of Fury': { t: 'Legendary Creature — Angel', mc: '{5}{R}{R}{R}', v: 8, c: ['R'], r: 'rare', p: 12.5, o: 'Flying, trample, protection from white', kw: ['Flying', 'Trample'], pw: '6', tg: '6' },
  'Kaalia of the Vast': { t: 'Legendary Creature — Human Cleric', mc: '{1}{R}{W}{B}', v: 4, c: ['W', 'B', 'R'], r: 'rare', p: 3, o: 'Flying\nWhenever Kaalia of the Vast attacks, ...', kw: ['Flying'], pw: '2', tg: '2' },
  'Comet Storm': { t: 'Instant', mc: '{X}{R}{R}', v: 2, c: ['R'], r: 'mythic', p: 2, o: 'Choose any target. Comet Storm deals X damage to it.' },
  'Path to Exile': { t: 'Instant', mc: '{W}', v: 1, c: ['W'], r: 'uncommon', p: 4, o: 'Exile target creature.' },
  'Serra Angel': { t: 'Creature — Angel', mc: '{3}{W}{W}', v: 5, c: ['W'], r: 'uncommon', p: 0.8, o: 'Flying, vigilance', kw: ['Flying', 'Vigilance'], pw: '4', tg: '4' }
};
const hash = s => [...s].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
const basePrice = name => SPEC[name] ? SPEC[name].p : LANDS.has(name) ? 0.1 : 0.2 + (hash(name) % 5) * 0.1;
function scry(name, set, cn, eurOverride) {
  const sp = SPEC[name] || {}, land = LANDS.has(name);
  const basic = /^(Mountain|Plains|Swamp)$/.test(name);
  return {
    id: name + '/' + (set || 'tst') + (cn || '1'), name, set: set || 'tst', collector_number: cn || '1', border_color: 'black', layout: 'normal',
    cmc: land ? 0 : sp.v != null ? sp.v : 3, type_line: land ? (basic ? 'Basic Land — ' + name : 'Land') : sp.t || 'Sorcery', mana_cost: land ? '' : sp.mc || '{2}{R}',
    colors: land ? [] : sp.c || ['R'], color_identity: land ? [] : sp.c || ['R'], rarity: sp.r || 'common', oracle_text: sp.o || (land ? '{T}: Add one mana.' : 'Does something.'),
    keywords: sp.kw || [], power: sp.pw, toughness: sp.tg, produced_mana: land ? ['R'] : undefined,
    prices: { eur: String((eurOverride != null ? eurOverride : basePrice(name)).toFixed(2)), eur_foil: null },
    image_uris: { small: 'https://cards.scryfall.io/small/a.jpg', normal: 'https://cards.scryfall.io/normal/a.jpg', large: 'https://cards.scryfall.io/large/a.jpg' }
  };
}

(async () => {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(WEB, p);
    if (!f.startsWith(WEB) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
  }).listen(0);
  const base = 'http://localhost:' + srv.address().port + '/';
  const browser = await chromium.launch();
  const vp = (process.env.VP || '1280x900').split('x').map(Number);
  const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { window.CPA_IMG_DELAY = 1e9; });   /* le miniature usano lo stesso endpoint: qui le fermo per contare solo i dati delle carte */
  const calls = { collection: 0, search: 0, cheapQ: [] };
  let netDown = false;
  const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route('https://cards.scryfall.io/**', r => r.fulfill({ status: 200, contentType: 'image/jpeg', body: JPG, headers: { 'access-control-allow-origin': '*' } }));
  await ctx.route('https://api.scryfall.com/**', r => {
    const u = new URL(r.request().url()), h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    const json = (b, s) => r.fulfill({ status: s || 200, contentType: 'application/json', headers: h, body: JSON.stringify(b) });
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: h });
    if (netDown) return r.abort();
    if (u.pathname === '/cards/collection') {
      calls.collection++;
      const ids = JSON.parse(r.request().postData()).identifiers, data = [], nf = [];
      ids.forEach(i => {
        if (i.name && /mai vista/i.test(i.name)) return nf.push(i);
        if (i.set && i.collector_number) data.push(scry(i.set === 'c21' ? 'Sol Ring' : 'Akroma, Angel of Fury', i.set, i.collector_number, i.set === 'c21' ? 1.5 : 20));
        else data.push(scry(i.name, i.set));
      });
      return json({ data, not_found: nf });
    }
    if (u.pathname === '/cards/search') {
      calls.search++;
      const q = u.searchParams.get('q'), m = /^!"(.+)" game:paper eur>0$/.exec(q);
      calls.cheapQ.push(q);
      if (!m) return json({ data: [] });
      const nm = m[1], b = basePrice(nm);
      return json({ data: [scry(nm, 'cheap', '9', Math.max(0.05, b / 2)), scry(nm, 'tst', '1', b)] });
    }
    return json({}, 404);
  });

  const shot = async name => { if (SHOTS) { await page.waitForTimeout(250); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
  const nav = v => page.locator('[data-a="nav"][data-v="' + v + '"]:visible').first().click();
  const items = () => page.locator('#alist .item');
  const names = () => page.$$eval('#alist .item .nm', els => els.map(e => e.textContent));
  const typeQ = async t => { await page.fill('#q', t); await page.waitForTimeout(120); };
  const waitIdle = () => page.waitForFunction(() => !document.querySelector('#adata .spin') && !document.querySelector('#prices .spin') && !document.querySelector('#saving .spin'), null, { timeout: 15000 });

  await page.goto(base); await page.waitForSelector('.shell');
  await nav('import');
  await page.fill('[data-c="draft-text"]', fs.readFileSync(FX + 'kaalia_old.txt', 'utf8'));
  await page.fill('[data-c="draft-name"]', 'Kaalia');
  await page.click('[data-a="draft-next"]'); await page.click('[data-a="draft-create"]');
  await page.waitForSelector('#dlist');
  /* aprendo il mazzo i dati si scaricano da soli: aspetto, poi li cancello per provare l'archivio da zero */
  await page.waitForFunction(() => document.querySelectorAll('.dr .pv').length > 0 && ![...document.querySelectorAll('.dr .pv')].some(e => e.textContent === '(…)'), null, { timeout: 15000 });
  ok(calls.collection >= 1, 'aprendo il mazzo scarica da solo tipo e prezzi: ' + calls.collection);
  await nav('data'); await page.click('[data-a="cards-clear"]');
  await page.waitForFunction(() => !document.querySelector('[data-a="cards-clear"]'));
  calls.collection = 0; calls.search = 0; calls.cheapQ.length = 0;
  await nav('archive');
  const total = await items().count();
  ok(total >= 70, 'archivio con le carte del mazzo: ' + total);

  /* senza filtri avanzati non si scarica nulla */
  ok(calls.collection === 0, 'nessuna richiesta finché non serve');
  ok(await page.locator('#advf').isHidden(), 'pannello filtri chiuso');
  await typeQ('sol ring');
  ok(await items().count() === 1 && calls.collection === 0, 'ricerca per nome: nessuna rete');
  await typeQ('ring sol');
  ok(await items().count() === 1, 'parole in qualsiasi ordine');

  /* sintassi di Scryfall: scarica i dati la prima volta */
  await typeQ('t:land');
  await waitIdle();
  await page.waitForFunction(() => document.querySelectorAll('#alist .item').length > 0 && document.querySelectorAll('#alist .item').length < 40);
  const lands = await names();
  const expectLands = [...LANDS].filter(x => !/^(Mountain|Plains|Swamp)$/.test(x));
  ok(expectLands.every(x => lands.includes(x)), 'tutte le terre del mazzo: ' + lands.join(', '));
  ok(lands.length === expectLands.length + 3, 'e anche le tre terre base: ' + lands.length);
  ok(calls.collection >= 1 && calls.collection <= 3, 'a lotti: ' + calls.collection + ' richieste');
  const collAfter = calls.collection;
  await typeQ('t:creature c:r mv>=8');
  await page.waitForFunction(() => document.querySelectorAll('#alist .item').length === 1);
  ok((await names())[0] === 'Akroma, Angel of Fury', 'creature rosse di costo 8+');
  ok(calls.collection === collAfter, 'dati già in memoria: nessuna nuova richiesta');
  await typeQ('o:flying -t:legendary');
  await page.waitForFunction(() => document.querySelectorAll('#alist .item').length === 1);
  ok((await names())[0] === 'Serra Angel', 'testo e negazione');
  await typeQ('r:mythic or kw:vigilance');
  await page.waitForFunction(() => document.querySelectorAll('#alist .item').length === 2);
  ok((await names()).sort().join('|') === 'Comet Storm|Serra Angel', 'or tra rarità e abilità');
  await typeQ('id<=wbr t:legendary');
  ok((await names()).sort().join('|') === 'Akroma, Angel of Fury|Kaalia of the Vast', 'identità del commander');

  /* errore di sintassi: avviso e ripiego sul nome */
  await typeQ('c:xyz');
  ok(await page.locator('#qmsg').isVisible() && /Colore non valido/.test(await page.locator('#qmsg').textContent()), 'messaggio di errore');
  ok(await items().count() === 0, 'ripiego sul nome: nessuna carta si chiama «c:xyz»');
  await typeQ('');
  ok(await page.locator('#qmsg').isHidden(), 'messaggio sparito');

  /* tipo e costo sotto il nome */
  const firstTy = await page.locator('#alist .item .ty').first().textContent();
  ok(firstTy && firstTy.length > 3, 'tipo mostrato sotto il nome: ' + firstTy);
  ok(await page.locator('#alist .item .ty .ms').count() > 5, 'simboli di mana nei costi');

  /* pannello filtri a pulsanti */
  await page.click('[data-a="adv"]');
  ok(await page.locator('#advf').isVisible(), 'pannello aperto');
  await page.click('.cp[data-v="W"]');
  await page.waitForFunction(() => document.querySelectorAll('#alist .item').length < 30);
  let wn = await names();
  ok(wn.includes('Path to Exile') && wn.includes('Kaalia of the Vast') && !wn.includes('Sol Ring'), 'colore bianco, include: ' + wn.length);
  ok(await page.locator('#fcount').textContent() === '1', 'contatore filtri');
  await page.click('[data-a="f-cm"][data-v="exact"]');
  wn = await names();
  ok(wn.includes('Path to Exile') && !wn.includes('Kaalia of the Vast'), 'colore bianco, esattamente');
  await page.click('[data-a="f-type"][data-v="instant"]');
  wn = await names();
  ok(wn.length === 1 && wn[0] === 'Path to Exile', 'bianco + istantaneo: ' + wn);
  await page.click('[data-a="f-clear"]');
  ok(await items().count() === total, 'azzera i filtri');
  await page.click('.cp[data-v="C"]');
  wn = await names();
  ok(wn.includes('Sol Ring') && wn.includes('Command Tower') && !wn.includes('Serra Angel'), 'incolore');
  await page.click('[data-a="f-clear"]');
  await page.click('[data-a="f-cost"][data-v="1"]'); await page.click('[data-a="f-cost"][data-v="7+"]');
  wn = await names();
  ok(wn.includes('Sol Ring') && wn.includes('Akroma, Angel of Fury') && !wn.includes('Serra Angel'), 'costo 1 oppure 7+: ' + wn.length);
  await page.click('[data-a="f-clear"]');
  await page.click('[data-a="f-rar"][data-v="m"]');
  ok((await names()).join() === 'Comet Storm', 'rarità mitica');
  await page.click('[data-a="f-clear"]');
  await page.fill('[data-c="f-text"]', 'exile target');
  await page.waitForTimeout(150);
  ok((await names()).join() === 'Path to Exile', 'testo della carta');
  await page.click('[data-a="f-clear"]');
  await page.selectOption('[data-c="sort"]', 'price');
  ok((await names())[0] === 'Akroma, Angel of Fury', 'ordine per prezzo: la più cara per prima');
  await page.selectOption('[data-c="sort"]', 'cmc');
  ok((await names())[0] !== 'Akroma, Angel of Fury' && (await names()).slice(-1)[0] === 'Akroma, Angel of Fury', 'ordine per costo: la più costosa per ultima');
  await page.selectOption('[data-c="sort"]', 'name');
  await page.click('[data-a="f-help"]');
  ok(await page.locator('.syn code').count() >= 7, 'aiuto con gli esempi');
  await page.click('.syn [data-a="f-ex"]');
  ok((await page.inputValue('#q')) === 't:creature c:g mv<=3', 'un esempio riempie la ricerca');
  await typeQ('');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('1-archivio-filtri');
  await page.click('[data-a="adv"]'); await page.evaluate(() => window.scrollTo(0, 0));
  await typeQ('t:creature'); await shot('1b-archivio-lista');
  await typeQ(''); await page.click('[data-a="adv"]');

  /* i dati restano sul dispositivo: dopo il ricaricamento niente nuove richieste */
  await page.reload(); await page.waitForSelector('.shell');
  await nav('archive');
  const c0 = calls.collection;
  await typeQ('t:land');
  await page.waitForFunction(() => document.querySelectorAll('#alist .item').length > 0 && document.querySelectorAll('#alist .item').length < 40);
  await page.waitForTimeout(300);
  ok(calls.collection === c0, 'dopo il ricaricamento i dati vengono dal dispositivo (' + c0 + ' → ' + calls.collection + ')');
  await typeQ('');

  /* ----- prezzi ----- */
  /* se i dati sono già arrivati per la ricerca, i prezzi si vedono subito: lo verifico, poi parto da zero */
  await nav('decks');
  ok(await page.locator('#saving').count() === 0, 'nessun banner del risparmio nell\'elenco dei mazzi');
  await page.click('[data-a="open-deck"]'); await page.waitForSelector('.dg');
  ok(/\(.*€\)/.test(await page.locator('.dr .pb .pv').first().textContent()), 'i dati scaricati per la ricerca servono anche ai prezzi nel mazzo');
  await nav('data'); await page.click('[data-a="cards-clear"]');
  await page.waitForFunction(() => !document.querySelector('[data-a="cards-clear"]'));
  await nav('decks');
  await shot('2-mazzi-prima');
  const kaalia = fs.readFileSync(FX + 'kaalia_old.txt', 'utf8').split('\n').map(l => l.trim()).filter(Boolean).map(l => { const m = /^(\d+)\s+(.+)$/.exec(l); return m ? { qty: +m[1], name: m[2] } : { qty: 1, name: l }; });
  const isBasic = nm => /^(Mountain|Plains|Swamp)$/.test(nm);
  const want = kaalia.filter(c => !isBasic(c.name)).reduce((t, c) => t + c.qty * +basePrice(c.name).toFixed(2), 0);
  await page.click('[data-a="open-deck"]'); await page.waitForSelector('.dg');
  await page.waitForFunction(() => document.querySelectorAll('.dr .pv').length > 0 && ![...document.querySelectorAll('.dr .pv')].some(e => e.textContent === '(…)'), null, { timeout: 15000 });
  ok(true, 'aprendo il mazzo i dati si riscaricano da soli');
  await nav('decks');
  ok(await page.locator('.deckcard .worth').count() === 1, 'prezzo sulla scheda del mazzo');
  await shot('3-mazzi-risparmio');

  /* scheda Prezzi del mazzo */
  await page.click('[data-a="open-deck"]');
  await page.click('[data-a="deck-tab"][data-v="prices"]');
  await page.waitForSelector('.ptiles');
  const real = parseFloat((await page.locator('.ptile.real b').textContent()).replace(/[^\d,]/g, '').replace(',', '.'));
  ok(Math.abs(real - want) < 0.005, 'costo se fosse reale: ' + real);
  ok(await page.locator('.ptile.cheap [data-a="p-cheap"]').count() === 1, 'le stampe economiche vanno calcolate');
  ok(await page.locator('.prow').count() === 12, 'le prime 12 carte più care');
  ok(/Akroma/.test(await page.locator('.prow .nm').first().textContent()), 'la più cara per prima');
  const sq0 = calls.search;
  await page.click('[data-a="p-cheap"]');
  await page.waitForSelector('.ptile.cheap b:not(:has-text("—")):not(:has-text("…"))', { timeout: 20000 });
  await page.waitForFunction(() => !document.querySelector('#prices .spin'));
  const cheapShown = parseFloat((await page.locator('.ptile.cheap b').textContent()).replace(/[^\d,]/g, '').replace(',', '.'));
  const wantCheap = kaalia.filter(c => !isBasic(c.name)).reduce((t, c) => t + c.qty * Math.min(+basePrice(c.name).toFixed(2), +Math.max(0.05, basePrice(c.name) / 2).toFixed(2)), 0);
  ok(Math.abs(cheapShown - wantCheap) < 0.005 && cheapShown < real, 'con le stampe più economiche: ' + cheapShown + ' (atteso ' + wantCheap.toFixed(2) + ')');
  ok(calls.search - sq0 === kaalia.filter(c => !isBasic(c.name)).length, 'una richiesta per carta diversa: ' + (calls.search - sq0));
  ok(calls.cheapQ.every(q => /game:paper eur>0$/.test(q)), 'solo stampe in carta con un prezzo');
  ok(await page.locator('.prow .pa').count() > 0, 'la stampa più economica è indicata riga per riga');
  ok(/Codighel/.test(await page.locator('.psave').textContent()) && /hai risparmiato/.test(await page.locator('.psave').textContent()), 'frase del risparmio');
  await page.click('[data-a="p-all"]');
  ok(await page.locator('.prow').count() === kaalia.filter(c => !isBasic(c.name)).length, 'mostra tutte le carte con prezzo');
  ok(/terre base escluse/.test(await page.locator('.pnote').textContent()), 'terre base escluse dal conto');
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('4-prezzi-mazzo');

  /* dopo il calcolo il banner mostra anche il totale economico */
  await page.click('[data-a="crazy-open"]');
  await page.waitForSelector('#crazy .ptile.cheap');
  ok(/meno|già le stampe/.test(await page.locator('#crazy .ptile.cheap').textContent()) && (await page.locator('#crazy .spin').count()) === 0, 'il pop-up conosce il totale economico');
  await page.keyboard.press('Escape');

  /* mazzo con stampe precise + mazzo non ancora stampato */
  await nav('import');
  await page.fill('[data-c="draft-text"]', '1 Sol Ring (C21) 263\n2 Anger\n1 Akroma, Angel of Fury (PLS) 90\n1 Mai Vista');
  await page.fill('[data-c="draft-name"]', 'Stampe');
  await page.selectOption('[data-c="draft-status"]', 'unprinted').catch(() => {});
  await page.click('[data-a="draft-next"]'); await page.click('[data-a="draft-create"]');
  await page.waitForSelector('#dlist');
  await page.click('[data-a="deck-tab"][data-v="prices"]');
  await page.waitForSelector('.ptiles', { timeout: 15000 });
  const real2 = parseFloat((await page.locator('.ptile.real b').textContent()).replace(/[^\d,]/g, '').replace(',', '.'));
  ok(Math.abs(real2 - (1.5 + 2 * 0.2 + 20 + 0)) < 0.2, 'stampe precise: Sol Ring C21 e Akroma PLS (' + real2 + ')');
  ok(/senza prezzo/.test(await page.locator('.pnote').textContent()) || /senza prezzo/.test(await page.locator('.prow').last().textContent()), 'carta sconosciuta segnalata');

  /* senza rete: messaggio, niente blocchi */
  ok(await page.locator('[data-a="p-cheap"]').count() === 0, 'le stampe economiche già note non si richiedono di nuovo');
  netDown = true;
  await page.click('[data-a="p-fresh"]');
  await page.waitForSelector('#prices .err', { timeout: 15000 });
  ok(/Scryfall/.test(await page.locator('#prices .err').textContent()), 'errore di rete spiegato');
  netDown = false;

  /* Dati: dati delle carte */
  await nav('data');
  ok(/dati di \d+ carte/.test(await page.locator('main').textContent()), 'sezione dati delle carte');
  await page.click('[data-a="cards-clear"]');
  await page.waitForFunction(() => !document.querySelector('[data-a="cards-clear"]'));
  ok(true, 'dati cancellati');

  ok(errors.length === 0, 'nessun errore in console: ' + errors.join(' | '));
  await browser.close(); srv.close();
  console.log('feat-smoke: ' + n + ' controlli ok');
})().catch(e => { console.error(e); process.exit(1); });
