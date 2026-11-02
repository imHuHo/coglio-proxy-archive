/* Prova in Chromium vero delle stampe MPC Fill: ricerca, dpi, non ufficiali, scelta, anteprima e PDF alla qualità scelta. MPC Fill, Google e Scryfall sono simulati.
 * Uso: node tools/mpc-smoke.js   (SHOTS=cartella per salvare gli screenshot) */
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
  'Serra Angel': { t: 'Creature — Angel', mc: '{3}{W}{W}', v: 5, c: ['W'], r: 'uncommon', p: 0.8, o: 'Flying, vigilance', kw: ['Flying', 'Vigilance'], pw: '4', tg: '4' },
  'Time Warp': { t: 'Sorcery', mc: '{3}{U}{U}', v: 5, c: ['U'], r: 'mythic', p: 9, o: 'Target player takes an extra turn after this one.' },
  'Demonic Tutor': { t: 'Sorcery', mc: '{1}{B}', v: 2, c: ['B'], r: 'uncommon', p: 6, o: 'Search your library for a card, put that card into your hand, then shuffle.', gc: 1 }
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
    game_changer: !!sp.gc, legalities: { commander: sp.ban ? 'banned' : 'legal' },
    prices: { eur: String((eurOverride != null ? eurOverride : basePrice(name)).toFixed(2)), eur_foil: null },
    image_uris: { small: 'https://cards.scryfall.io/small/a.jpg', normal: 'https://cards.scryfall.io/normal/a.jpg', large: 'https://cards.scryfall.io/large/a.jpg' }
  };
}


const CARDS = [
  { identifier: 'ID_A1200', name: 'Sol Ring (2XM0354)', dpi: 1200, extension: 'png', size: 8400000, sourceName: 'Chilli_Axe', tags: [], language: 'EN', dateCreated: '2024-03-01' },
  { identifier: 'ID_B600', name: 'Sol Ring', dpi: 600, extension: 'png', size: 3100000, sourceName: 'Hathwellcrisping', tags: ['Borderless'], language: 'EN', dateCreated: '2023-01-05' },
  { identifier: 'ID_C1210', name: 'Sol Ring (Neon Remaster)', dpi: 1210, extension: 'png', size: 9900000, sourceName: 'NeonArtist', tags: ['Custom Art', 'AI Remaster'], language: 'EN', dateCreated: '2025-02-02' },
  { identifier: 'ID_D300', name: 'Sol Ring', dpi: 300, extension: 'jpg', size: 900000, sourceName: 'OldScans', tags: ['Upscaled Scan'], language: 'EN', dateCreated: '2020-02-02' },
  { identifier: 'ID_E800', name: 'Sol Ring', dpi: 800, extension: 'png', size: 2000000, sourceName: 'Untagged', tags: [], language: 'EN', dateCreated: '2022-02-02' }
];
(async () => {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(WEB, p);
    if (!f.startsWith(WEB) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
  }).listen(0);
  const base = 'http://localhost:' + srv.address().port + '/';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|CORS/.test(m.text())) errors.push(m.text()); });
  const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
  const log = { mpc: [], img: [] };
  /* ponte dell'app finta: solo le chiamate di MPC Fill e delle immagini */
  await page.exposeFunction('__mpc', async req => {
    log.mpc.push({ url: req.url, method: req.method, body: req.body ? JSON.parse(req.body) : null });
    const u = new URL(req.url);
    if (u.pathname === '/2/sources/') return { status: 200, text: JSON.stringify({ results: { '11': { pk: 11, name: 'A' }, '22': { pk: 22, name: 'B' } } }) };
    if (u.pathname === '/2/editorSearch/') {
      const min = req.body ? JSON.parse(req.body).searchSettings.filterSettings.minimumDPI : 0;
      const ids = CARDS.filter(c => c.dpi >= min).map(c => c.identifier);
      return { status: 200, text: JSON.stringify({ results: { 'sol ring': { CARD: ids } } }) };
    }
    if (u.pathname === '/2/cards/') {
      const ids = JSON.parse(req.body).cardIdentifiers, res = {};
      CARDS.forEach(c => { if (ids.includes(c.identifier)) res[c.identifier] = Object.assign({ smallThumbnailUrl: '', mediumThumbnailUrl: '', source: 'x', cardType: 'CARD' }, c); });
      return { status: 200, text: JSON.stringify({ results: res }) };
    }
    return { status: 404, text: '{}' };
  });
  await page.exposeFunction('__img', async url => { log.img.push(url); return { ok: true, type: 'image/jpeg', data: [...JPG] }; });
  await page.addInitScript(() => {
    window.CPA_IMG_DELAY = 30;
    window.cpaNet = { mpc: req => window.__mpc(req), image: url => window.__img(url).then(r => Object.assign(r, { data: new Uint8Array(r.data) })) };
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route('https://cards.scryfall.io/**', r => r.fulfill({ status: 200, contentType: 'image/jpeg', body: JPG, headers: { 'access-control-allow-origin': '*' } }));
  await ctx.route('https://lh4.googleusercontent.com/**', r => r.fulfill({ status: 200, contentType: 'image/jpeg', body: JPG, headers: { 'access-control-allow-origin': '*' } }));
  await ctx.route('https://api.scryfall.com/**', r => {
    const u = new URL(r.request().url()), h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    const json = (b, s) => r.fulfill({ status: s || 200, contentType: 'application/json', headers: h, body: JSON.stringify(b) });
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: h });
    if (u.pathname === '/cards/collection') {
      const ids = JSON.parse(r.request().postData()).identifiers;
      return json({ data: ids.map(i => i.name ? scry(i.name, i.set) : scry('Sol Ring', i.set, i.collector_number)), not_found: [] });
    }
    return json({}, 404);
  });
  const nav = v => page.locator('[data-a="nav"][data-v="' + v + '"]:visible').first().click();
  const settle = () => page.waitForFunction(() => !document.querySelector('#dstat .spin'));
  const solRow = () => page.locator('.dg:not([data-g="side"]) .dr', { hasText: 'Sol Ring' }).first();

  await page.goto(base); await page.waitForSelector('.shell');
  await nav('import');
  await page.fill('[data-c="draft-text"]', fs.readFileSync(FX + 'kaalia_old.txt', 'utf8'));
  await page.fill('[data-c="draft-name"]', 'Kaalia MPC');
  await page.click('[data-a="draft-next"]'); await page.click('[data-a="draft-create"]');
  await page.waitForSelector('.dk-hero'); await settle();
  await page.waitForFunction(() => document.querySelectorAll('.dg').length >= 3);

  /* dialogo «Cambia stampa» con la scheda MPC Fill */
  await solRow().locator('.pb').click();
  await page.waitForSelector('.lb-tabs');
  ok(await page.locator('.lb-tabs [data-t="mpc"]').count() === 1, 'scheda MPC Fill nel dialogo');
  await page.click('.lb-tabs [data-t="mpc"]');
  ok(await page.isVisible('#mpcbox') && !(await page.isVisible('#prgrid')), 'la scheda MPC sostituisce la griglia Scryfall');
  ok((await page.textContent('#mpcbox')).includes('non ufficiali'), 'spiegazione dei bollini');
  ok(await page.locator('[data-a="mpc-go"]').count() === 1 && log.mpc.length === 0, 'nessuna richiesta finché non si preme «Cerca»');
  await page.click('[data-a="mpc-go"]');
  await page.waitForSelector('.mpc-grid .pr.mp');
  ok(log.mpc[0].url === 'https://mpcfill.com/2/sources/' && log.mpc[1].url === 'https://mpcfill.com/2/editorSearch/' && log.mpc[2].url === 'https://mpcfill.com/2/cards/', 'sequenza: archivi, ricerca, carte');
  const es = log.mpc[1].body;
  ok(es.queries[0].query === 'sol ring' && es.queries[0].cardType === 'CARD' && es.searchSettings.sourceSettings.sources.length === 2 && es.searchSettings.sourceSettings.sources[0][0] === 11 && es.searchSettings.sourceSettings.sources[0][1] === true, 'ricerca in tutti gli archivi');
  let dpis = await page.$$eval('.mpc-grid .pr.mp .dpi', e => e.map(x => x.textContent));
  ok(dpis.join() === '1210 dpi,1200 dpi,800 dpi,600 dpi,300 dpi', 'ordinate per dpi: ' + dpis.join());
  const uo = await page.$$eval('.mpc-grid .pr.mp.uo', e => e.map(x => x.getAttribute('data-i')));
  ok(uo.length === 2 && (await page.$$eval('.mpc-grid .pr.mp .uob', e => e.length)) === 2, 'due stampe non ufficiali segnalate (Custom Art/AI e Upscaled Scan)');
  ok((await page.textContent('.mpc-grid .pr.mp:has(.uob)')).includes('non ufficiale'), 'bollino rosso «non ufficiale»');
  ok(await page.locator('.mpc-grid .pr.mp', { hasText: 'nessuna etichetta' }).count() === 2, 'le senza etichetta sono dichiarate tali, non «ufficiali»');
  ok((await page.getAttribute('.mpc-grid .pr.mp img', 'src')).startsWith('https://lh4.googleusercontent.com/d/ID_C1210=h400'), 'miniatura da Google');
  await page.fill('.mpc-ctl', '').catch(() => {});
  await page.check('[data-c="mpc-hide"]');
  ok(await page.locator('.mpc-grid .pr.mp').count() === 3, 'nascondi non ufficiali: ne restano 3');
  await page.uncheck('[data-c="mpc-hide"]');
  await page.selectOption('[data-c="mpc-sort"]', 'off');
  ok((await page.$$eval('.mpc-grid .pr.mp .dpi', e => e.map(x => x.textContent))).join() === '1200 dpi,800 dpi,600 dpi,1210 dpi,300 dpi', 'ordine «ufficiali prima»');
  await page.selectOption('[data-c="mpc-min"]', '1200');
  await page.waitForFunction(() => document.querySelectorAll('.mpc-grid .pr.mp').length === 2);
  ok(log.mpc[log.mpc.length - 3].body && log.mpc.some(m => m.body && m.body.searchSettings && m.body.searchSettings.filterSettings.minimumDPI === 1200), 'il filtro dpi parte dal server');
  const nReq = log.mpc.length;
  await page.selectOption('[data-c="mpc-min"]', '0');
  await page.waitForFunction(() => document.querySelectorAll('.mpc-grid .pr.mp').length === 5);
  ok(log.mpc.length === nReq, 'tornando a «Tutte» si usa la memoria: nessuna nuova richiesta');

  /* scegliere la stampa non ufficiale da 1210 dpi */
  await page.selectOption('[data-c="mpc-sort"]', 'dpi');
  await page.click('.mpc-grid .pr.mp:has(.uob)');
  await page.waitForFunction(() => !document.querySelector('#lb'));
  const row = page.locator('.dg .dr[data-mp="ID_C1210"]');
  ok(await row.count() === 1, 'la riga ora ha la stampa MPC');
  ok((await row.textContent()).includes('1210 dpi') && (await row.textContent()).includes('non ufficiale'), 'riga: dpi e «non ufficiale»');
  ok((await page.textContent('#toast')).includes('Stampa scelta') && await page.locator('#toast [data-a="undo"]').count() === 1, 'avviso con Annulla');
  const q0 = await row.locator('.q').textContent();
  await row.locator('.n').click();
  await page.waitForFunction(() => /ID_C1210=h900/.test((document.querySelector('#dprev img') || {}).src || ''));
  ok((await page.textContent('#dprev')).includes('1210 dpi') && (await page.textContent('#dprev')).includes('di NeonArtist'), 'anteprima: immagine MPC, dpi e autore');
  await page.waitForTimeout(400);
  const stored = await page.evaluate(() => new Promise(res => { const r = indexedDB.open('coglio-proxy-archive', 1); r.onsuccess = () => { const q = r.result.transaction('decks').objectStore('decks').getAll(); q.onsuccess = () => { const t = JSON.stringify(q.result); res(t.includes('"mpc":"ID_C1210"') && t.includes('"mdpi":1210') && t.includes('"muo":1')); }; }; r.onerror = () => res(false); }));
  ok(stored, 'la scelta è salvata nel mazzo');
  await page.click('#toast [data-a="undo"]');
  await page.waitForFunction(() => !document.querySelector('.dr[data-mp]'));
  ok(await page.locator('.dr[data-mp]').count() === 0, 'Annulla toglie la stampa MPC');

  /* una copia sola: la riga si divide */
  await page.evaluate(() => {});
  const copies = parseInt(await solRow().locator('.q').textContent(), 10);
  await page.evaluate(() => { document.querySelector('#toast [data-a="toast-close"]') && document.querySelector('#toast [data-a="toast-close"]').click(); });
  await solRow().locator('.dmb').click(); await page.click('.drm [data-a="dr-qty"][data-k="1"]');
  await page.waitForFunction(c => parseInt([...document.querySelectorAll('.dg:not([data-g="side"]) .dr')].find(r => /Sol Ring/.test(r.textContent)).querySelector('.q').textContent, 10) === c + 1, copies);
  await solRow().locator('.pb').click(); await page.waitForSelector('.lb-tabs'); await page.click('.lb-tabs [data-t="mpc"]');
  await page.waitForSelector('.mpc-grid .pr.mp');
  ok(log.mpc.length === nReq, 'riaprendo il dialogo per la stessa carta i risultati ci sono già');
  await page.check('[data-c="mpc-one"]');
  await page.click('.mpc-grid .pr.mp:has-text("1200 dpi") >> nth=0');
  await page.waitForFunction(() => document.querySelector('.dr[data-mp]'));
  ok(await page.locator('.dr[data-mp]').count() === 1 && (await page.locator('.dr[data-mp] .q').textContent()) === '1', 'solo una copia ha la stampa MPC');
  ok(parseInt(await page.locator('.dg:not([data-g="side"]) .dr:not([data-mp])', { hasText: 'Sol Ring' }).first().locator('.q').textContent(), 10) === copies, 'le altre copie restano con la stampa Scryfall');

  /* torna alla stampa Scryfall dal dialogo */
  await page.locator('.dr[data-mp] .pb').click(); await page.waitForSelector('.lb-tabs'); await page.click('.lb-tabs [data-t="mpc"]');
  ok(await page.locator('[data-a="mpc-clear"]').count() === 1 && (await page.textContent('.mpc-cur')).includes('1200 dpi'), 'dialogo: stampa MPC attuale con «Torna alla stampa Scryfall»');
  await page.click('[data-a="mpc-clear"]');
  await page.waitForFunction(() => !document.querySelector('.dr[data-mp]'));
  ok(parseInt(await solRow().locator('.q').textContent(), 10) === copies + 1, 'le copie si riuniscono in una sola riga');

  /* stampa: qualità e dimensione dell'immagine richiesta */
  await solRow().locator('.pb').click(); await page.waitForSelector('.lb-tabs'); await page.click('.lb-tabs [data-t="mpc"]');
  await page.waitForSelector('.mpc-grid .pr.mp');
  await page.click('.mpc-grid .pr.mp:has-text("1200 dpi") >> nth=0');
  await page.waitForFunction(() => document.querySelector('.dr[data-mp]'));
  await page.locator('[data-a="make-pdf"]').first().click();
  await page.waitForSelector('.bd-mpc');
  ok((await page.textContent('.bd-mpc')).includes('600 dpi') || await page.$eval('[data-c="bd-mpcq"]', e => e.value) === '600', 'qualità predefinita 600 dpi');
  await page.selectOption('[data-c="bd-mpcq"]', '1200');
  ok((await page.textContent('.bd-mpc')).includes('1200 dpi'), 'testo del pannello aggiornato');
  ok(await page.locator('.bd-row .bd-st', { hasText: 'MPC Fill · 1200 dpi' }).count() === 1, 'riga del builder: «MPC Fill · 1200 dpi»');
  const dl = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
  await page.click('[data-a="bd-go"]');
  await page.waitForFunction(() => /PDF creato|Non sono riuscito/.test(document.body.innerText), null, { timeout: 90000 });
  await dl;
  ok(log.img.length >= 1 && /=h4440$/.test(log.img[log.img.length - 1]) && /ID_A1200/.test(log.img[log.img.length - 1]), 'immagine richiesta a 1200 dpi (h4440): ' + log.img.join(' '));
  await page.selectOption('[data-c="bd-mpcq"]', '600');
  const before = log.img.length;
  await page.click('[data-a="bd-go"]');
  await page.waitForFunction(() => /PDF creato|Non sono riuscito/.test(document.body.innerText) && !/Scarico|Impagino/.test(document.getElementById('bd-prog') ? document.getElementById('bd-prog').textContent : ''), null, { timeout: 90000 });
  await page.waitForTimeout(500);
  ok(log.img.length === before + 1 && /=h2220$/.test(log.img[log.img.length - 1]), 'a 600 dpi si chiede h2220: ' + log.img[log.img.length - 1]);

  ok(errors.length === 0, 'nessun errore in pagina: ' + errors.join(' | '));
  await browser.close(); srv.close();
  console.log('mpc-smoke: ' + n + ' controlli ok');
})().catch(e => { console.error(e); process.exit(1); });
