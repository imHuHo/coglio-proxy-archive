/* Prova in Chromium vero della pagina del mazzo (banner, lista per tipo, anteprima, cambio stampa, barra e pop-up dei prezzi). Scryfall è simulato.
 * Uso: node tools/deck-smoke.js   (SHOTS=cartella per salvare gli screenshot) */
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
  const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, colorScheme: process.env.DARK ? 'dark' : 'light' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { window.CPA_IMG_DELAY = 30; });   /* le miniature usano lo stesso endpoint: qui le fermo per contare solo i dati delle carte */
  const calls = { collection: 0, search: 0, cheapQ: [], prints: [] };
  let netDown = false;
  const JPG = process.env.ART ? fs.readFileSync(process.env.ART) : Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
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
        if (i.set === 'cheap') data.push(scry('Sol Ring', 'cheap', '9', 0.5));
        else if (i.set && i.collector_number) data.push(scry(i.set === 'c21' ? 'Sol Ring' : 'Akroma, Angel of Fury', i.set, i.collector_number, i.set === 'c21' ? 1.5 : 20));
        else data.push(scry(i.name, i.set));
      });
      return json({ data, not_found: nf });
    }
    if (u.pathname === '/cards/search') {
      calls.search++;
      const q = u.searchParams.get('q'), m = /^!"(.+)" game:paper eur>0$/.exec(q);
      calls.cheapQ.push(q);
      const pm = /^!"(.+)"$/.exec(q);
      if (pm) { calls.prints.push(pm[1]); return json({ data: [scry(pm[1], 'tst', '1', 5), scry(pm[1], 'cheap', '9', 0.5), scry(pm[1], 'old', '33', 12)] }); }
      if (!m) return json({ data: [] });
      const nm = m[1], b = basePrice(nm);
      return json({ data: [scry(nm, 'cheap', '9', Math.max(0.05, b / 2)), scry(nm, 'tst', '1', b)] });
    }
    return json({}, 404);
  });

  const shot = async name => { if (SHOTS) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
  const nav = v => page.locator('[data-a="nav"][data-v="' + v + '"]:visible').first().click();
  const settled = () => page.waitForFunction(() => !document.querySelector('#dstat .spin') && !document.querySelector('#crazy .spin') && !document.querySelector('.dr .pv') ? true : !document.querySelector('#dstat .spin') && !document.querySelector('#crazy .spin') && ![...document.querySelectorAll('.dr .pv')].some(e => e.textContent === '(…)'), null, { timeout: 20000 });

  await page.goto(base); await page.waitForSelector('.shell');
  await nav('import');
  await page.fill('[data-c="draft-text"]', fs.readFileSync(FX + 'kaalia_old.txt', 'utf8'));
  await page.fill('[data-c="draft-name"]', 'Kaalia of the Vast Upgrade');
  await page.click('[data-a="draft-next"]'); await page.click('[data-a="draft-create"]');
  await page.waitForSelector('.dk-hero');

  /* elenco mazzi: niente banner del risparmio */
  await nav('decks');
  ok(await page.locator('#saving').count() === 0, 'l\'elenco dei mazzi non ha più il banner del risparmio');
  ok(!(await page.textContent('body')).includes('Ma questo risparmio'), 'nessun «risparmio» nell\'elenco');
  await page.click('[data-a="open-deck"]');
  await page.waitForSelector('.dk-hero');
  await settled();
  await page.waitForFunction(() => document.querySelectorAll('.dg').length >= 4);

  /* banner e titolo */
  ok((await page.textContent('.dk-hero h1')).includes('Kaalia of the Vast Upgrade'), 'titolo grande nel banner');
  await page.waitForFunction(() => document.querySelector('.dk-hero').classList.contains('has-art'));
  ok((await page.getAttribute('.dk-hero', 'style')).includes('art_crop'), 'artwork del commander nel banner');

  /* gruppi per tipo */
  const groups = await page.$$eval('.dg', gs => gs.map(g => g.dataset.g + ':' + g.querySelector('h3 i').textContent));
  console.log(groups.join(' '));
  ok(groups.some(g => g.startsWith('cmd:1')), 'commander a parte');
  ok(groups.some(g => g.startsWith('creature:')) && groups.some(g => g.startsWith('land:')), 'creature e terre');
  const order = await page.$$eval('.dg', gs => gs.map(g => g.dataset.g));
  ok(order.indexOf('creature') < order.indexOf('land'), 'le terre dopo le creature');
  const bar = await page.textContent('#dbar');
  ok(/\d+\s*carte/.test(bar) && /Calcola valore mazzo/.test(bar), 'barra banana: totale e pulsante: ' + bar.replace(/\s+/g, ' '));
  const barTotal = parseInt(await page.textContent('#dbar .tot b'), 10);
  const sumTypes = await page.$$eval('#dbar .ty b', bs => bs.reduce((t, b) => t + parseInt(b.textContent, 10), 0));
  ok(barTotal === sumTypes, 'i conteggi per tipo sommano al totale: ' + sumTypes + ' / ' + barTotal);
  const bg = await page.$eval('#dbar', e => getComputedStyle(e).backgroundColor);
  ok(bg === 'rgb(247, 197, 43)', 'barra giallo banana: ' + bg);

  /* righe: prezzo tra parentesi e icona cambia stampa */
  const sol = page.locator('.dr', { hasText: 'Sol Ring' }).first();
  ok(/\(1,50\s*€\)/.test(await sol.locator('.pb').textContent()), 'prezzo della stampa tra parentesi: ' + (await sol.locator('.pb').textContent()));
  ok(await sol.locator('.pb svg').count() === 1, 'icona accanto al nome');

  /* anteprima a lato */
  await sol.hover();
  await page.waitForFunction(() => /Sol Ring/.test(document.querySelector('#dprev .pv-name') ? document.querySelector('#dprev .pv-name').textContent : ''));
  await page.waitForSelector('#dprev .pv-img img');
  ok(await page.isVisible('#dprev'), 'anteprima visibile a lato');
  ok((await page.textContent('#dprev .pv-meta')).includes('1,50'), 'prezzo nell\'anteprima');
  await shot('deck-top');

  /* passando il mouse sulle righe l'impaginazione a colonne non si muove (prima il bottone Design strozzava il nome e le colonne si ribilanciavano) */
  await page.setViewportSize({ width: 1880, height: 915 });
  await page.waitForTimeout(200);
  const layout = () => page.$$eval('.dg', gs => JSON.stringify(gs.map(g => { const r = g.getBoundingClientRect(); return [g.dataset.g, Math.round(r.left), Math.round(r.top + scrollY), Math.round(r.height)]; })));
  const before = await layout(), rows = await page.$$('#dlist .dr');
  let moved = 0, narrow = 0;
  for (let i = 0; i < rows.length; i += 3) {
    await rows[i].hover(); await page.waitForTimeout(30);
    if ((await layout()) !== before) moved++;
    if (await rows[i].$eval('.n', e => e.getBoundingClientRect().width) < 40) narrow++;
  }
  ok(moved === 0, 'passando il mouse sulle righe i gruppi non si spostano (' + moved + ' spostamenti)');
  ok(narrow === 0, 'il nome della carta non si riduce a niente al passaggio del mouse (' + narrow + ')');
  ok(await page.locator('#dprev [data-a="dz-bind"]').count() === 1, 'il bottone Design resta nell\'anteprima');
  await page.setViewportSize({ width: vp[0], height: vp[1] });

  /* ordinamento */
  await page.selectOption('[data-c="dsort"]', 'price');
  const firstCreature = await page.$eval('.dg[data-g="creature"] .dr .n', e => e.textContent);
  ok(firstCreature === 'Akroma, Angel of Fury', 'ordine per prezzo: la più cara in cima, ' + firstCreature);
  await page.selectOption('[data-c="dsort"]', 'name');

  /* ricerca nel mazzo */
  await page.fill('[data-c="deckq"]', 'sol ri');
  ok(await page.locator('.dr').count() === 1, 'ricerca nel mazzo');
  await page.fill('[data-c="deckq"]', '');

  /* cambia stampa */
  await sol.locator('.pb').click();
  await page.waitForSelector('#lb .pr');
  const tiles = await page.$$eval('#lb .pr', ts => ts.map(t => t.textContent));
  ok(tiles.length === 3 && tiles.some(t => /0,50/.test(t) && /più economica/.test(t)), 'stampe con prezzo e la più economica evidenziata: ' + tiles.join(' | '));
  ok(await page.locator('#lb .pr.low').count() === 1, 'una sola evidenziata');
  await shot('deck-prints');
  await page.click('#lb .pr.low');
  await page.waitForFunction(() => !document.querySelector('#lb'));
  await page.waitForFunction(() => { const r = [...document.querySelectorAll('.dr')].find(e => e.textContent.includes('Sol Ring')); return r && /0,50/.test(r.querySelector('.pb').textContent); }, null, { timeout: 15000 });
  ok(/\(0,50\s*€\)/.test(await page.locator('.dr', { hasText: 'Sol Ring' }).first().locator('.pb').textContent()), 'dopo la scelta il prezzo è quello della nuova stampa');
  const saved = await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('cpa:v1') || 'null'); return d; });

  /* pop-up: Ma questo risparmio è crazy */
  await page.click('[data-a="crazy-open"]');
  await page.waitForSelector('#crazy .cz-box');
  ok((await page.textContent('#crazy h2')).includes('Ma questo risparmio è crazy!'), 'titolo del pop-up');
  await page.waitForFunction(() => document.querySelectorAll('#crazy .ptile b').length === 2 && ![...document.querySelectorAll('#crazy .ptile b')].some(b => b.textContent === '…'), null, { timeout: 30000 });
  const tv = await page.$$eval('#crazy .ptile b', bs => bs.map(b => b.textContent));
  ok(tv.length === 2 && tv.every(x => /\d/.test(x)), 'valore reale e con stampe economiche: ' + tv.join(' / '));
  const num = x => parseFloat(x.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  ok(num(tv[1]) <= num(tv[0]), 'con le stampe economiche non costa di più');
  ok(calls.cheapQ.length > 20, 'una richiesta per carta per la stampa economica: ' + calls.cheapQ.length);
  await shot('deck-crazy');
  await page.keyboard.press('Escape');
  ok(await page.locator('#crazy').count() === 0, 'Escape chiude il pop-up');
  await page.click('[data-a="crazy-open"]');
  await page.waitForSelector('#crazy .ptile');
  ok(calls.cheapQ.length > 20 && (await page.locator('#crazy .spin').count()) === 0, 'riaperto: dati già pronti');
  await page.click('#crazy [data-a="crazy-detail"]');
  await page.waitForSelector('#prices .ptiles');
  ok(await page.locator('#crazy').count() === 0, 'dal pop-up alla scheda dei prezzi');
  await page.click('[data-a="deck-tab"][data-v="cards"]');
  await page.waitForSelector('.dg');

  /* gestione: nome, commander, eliminazione */
  ok(await page.isHidden('#dman'), 'impostazioni chiuse');
  await page.click('[data-a="deck-man"]');
  ok(await page.isVisible('#dman [data-c="deck-name"]'), 'gestisci apre le impostazioni');
  await page.click('[data-a="deck-man"]');
  /* upgrade resta */
  await page.click('[data-a="deck-tab"][data-v="ups"]');
  ok(await page.locator('[data-a="new-up"]').count() === 1, 'scheda upgrade');
  await page.click('[data-a="deck-tab"][data-v="cards"]');

  /* telefono: la lista a una colonna, tap = anteprima grande */
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForSelector('.dg');
  ok(!(await page.isVisible('#dprev')), 'su telefono niente colonna di anteprima');
  const barBox = await page.$eval('#dbar', e => { const r = e.getBoundingClientRect(); return { b: r.bottom, h: innerHeight }; });
  ok(barBox.b <= barBox.h - 55, 'la barra sta sopra la barra delle schede: ' + JSON.stringify(barBox));
  await shot('deck-phone');
  await page.locator('.dr', { hasText: 'Sol Ring' }).first().locator('.n').click();
  await page.waitForSelector('#lb img');
  await shot('deck-phone-lb');
  await page.keyboard.press('Escape');
  const hs = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  ok(hs, 'nessuno scroll orizzontale su telefono');
  await page.setViewportSize({ width: 1280, height: 900 });

  ok(errors.length === 0, 'nessun errore in console: ' + errors.join(' | '));
  console.log('deck-smoke: ' + n + ' controlli ok');
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
