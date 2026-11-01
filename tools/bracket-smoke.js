/* Prova in Chromium vero del report del bracket in locale. Scryfall e Commander Spellbook sono simulati.
 * Uso: node tools/bracket-smoke.js   (SHOTS=cartella per salvare gli screenshot) */
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
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|CORS/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { window.CPA_IMG_DELAY = 30; });
  const calls = { collection: 0, spell: 0 };
  let spellMode = 'cors';
  const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route('https://cards.scryfall.io/**', r => r.fulfill({ status: 200, contentType: 'image/jpeg', body: JPG, headers: { 'access-control-allow-origin': '*' } }));
  await ctx.route('https://backend.commanderspellbook.com/**', r => {
    calls.spell++;
    const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: h });
    if (spellMode === 'cors') return r.abort();
    return r.fulfill({ status: 200, contentType: 'application/json', headers: h, body: JSON.stringify({ bracketTag: 'R', cards: [
      { card: { name: 'Time Warp', gameChanger: false, massLandDenial: false, extraTurn: true, legalities: { commander: true } } },
      { card: { name: 'Sol Ring', gameChanger: false, massLandDenial: false, extraTurn: false, legalities: { commander: true } } }], combos: [{ combo: { uses: [{ card: { name: 'Kaalia of the Vast' } }, { card: { name: 'Sol Ring' } }], produces: [{ feature: { name: 'Infinite mana' } }], bracketTag: 'R' } }] }) });
  });
  await ctx.route('https://api.scryfall.com/**', r => {
    const u = new URL(r.request().url()), h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    const json = (b, s) => r.fulfill({ status: s || 200, contentType: 'application/json', headers: h, body: JSON.stringify(b) });
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: h });
    if (u.pathname === '/cards/collection') {
      calls.collection++;
      const ids = JSON.parse(r.request().postData()).identifiers;
      return json({ data: ids.map(i => scry(i.name, i.set)), not_found: [] });
    }
    return json({ data: [] });
  });

  const nav = v => page.locator('[data-a="nav"][data-v="' + v + '"]:visible').first().click();
  const shot = async name => { if (SHOTS) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false }); } };
  const bkTxt = () => page.textContent('#bk');

  await page.goto(base); await page.waitForSelector('.shell');
  await nav('import');
  await page.fill('[data-c="draft-text"]', 'Time Warp\nDemonic Tutor\n' + fs.readFileSync(FX + 'kaalia_old.txt', 'utf8'));
  await page.fill('[data-c="draft-name"]', 'Kaalia of the Vast Upgrade');
  await page.click('[data-a="draft-next"]'); await page.click('[data-a="draft-create"]');
  await page.waitForSelector('.dk-hero');
  await page.waitForFunction(() => !document.querySelector('#dstat .spin'));

  /* 1) dal browser Spellbook non risponde (CORS): il report si fa lo stesso, in locale */
  await page.click('.dk-hact .bracket, [data-a="bracket"]');
  await page.waitForSelector('#bk .bkr-head');
  const t1 = await bkTxt();
  ok(await page.$('#bk .bk-num b') && ['3', '4'].includes(await page.textContent('#bk .bk-num b')), 'bracket stimato mostrato: ' + await page.textContent('#bk .bk-num b'));
  ok(await page.textContent('#bk .bk-num b') === '3', 'un Game Changer (Demonic Tutor) e nessun resto: bracket 3');
  ok(t1.includes('Cosa decide il bracket') && t1.includes('Game Changer') && t1.includes('Demonic Tutor'), 'sezione «Cosa decide il bracket» con il Game Changer');
  ok(t1.includes('Time Warp') && /Turni extra\s*1/.test(t1), 'turni extra riconosciuti dal testo');
  ok(t1.includes('Costanza di pescata') && /\d+%/.test(t1) && t1.includes('Mano di 7 da tenere'), 'costanza di pescata con percentuali');
  ok(t1.includes('Salute del mazzo') && t1.includes('Terre') && t1.includes('Accelerazione'), 'salute del mazzo');
  ok(/Commander Spellbook non è raggiungibile/.test(t1) && !t1.includes('Spellbook:'), 'combo: spiegato che da qui Spellbook non si raggiunge');
  ok(!/win turn|archenemy/i.test(t1), 'niente numeri inventati (turno di vittoria / archenemy)');
  ok(await page.$$eval('#bk .bkr-thumbs .th', e => e.length) >= 2, 'miniature delle carte che contano');
  ok(await page.$('#bk .bk-set [data-a="bk-set"][data-n="4"]') && await page.$('#bk [data-a="bk-web"]'), 'impostazione a mano e via di scampo verso il sito');
  await page.waitForFunction(() => document.querySelector('#bk .bkr-head').classList.contains('has-art'));
  ok((await page.getAttribute('#bk .bkr-head', 'style')).includes('art_crop'), 'artwork del commander nell\'intestazione');
  const w = await page.$eval('#bk .bk-box', e => e.getBoundingClientRect().width);
  ok(w > 700 || vp[0] < 800, 'pannello largo: ' + Math.round(w));
  ok(await page.$eval('.dk-hero h1 .bk-badge', e => e.textContent) === '3', 'badge 3 accanto al titolo');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'nessuno scorrimento orizzontale');
  await shot('bracket-1');
  await page.click('#bkx'); ok(!(await page.$('#bk')), 'chiusura');
  await page.waitForTimeout(800); const colls = calls.collection;

  /* 2) i dati sono già scaricati: niente nuove richieste a Scryfall, e il risultato non cambia */
  await page.click('[data-a="bracket"]'); await page.waitForSelector('#bk .bkr-head'); await page.waitForTimeout(800);
  ok(calls.collection === colls, 'seconda verifica: nessuna nuova richiesta a Scryfall');
  ok(await page.textContent('#bk .bk-num b') === '3', 'stesso risultato');
  const dr1 = await page.$$eval('#bk .bkr-draw b', e => e.map(x => x.textContent).join());
  await page.click('#bkx'); await page.click('[data-a="bracket"]'); await page.waitForSelector('#bk .bkr-draw');
  ok(dr1 === await page.$$eval('#bk .bkr-draw b', e => e.map(x => x.textContent).join()), 'la costanza di pescata non cambia da una verifica all\'altra');
  await page.click('#bkx');

  /* 3) con Spellbook raggiungibile: combo e turni extra si sommano, il bracket sale */
  spellMode = 'ok'; const sp0 = calls.spell;
  await page.click('[data-a="bracket"]'); await page.waitForSelector('#bk .bkr-head');
  await page.waitForFunction(() => /Spellbook:/.test(document.querySelector('#bk').textContent));
  const t3 = await bkTxt();
  ok(calls.spell - sp0 === 2 || calls.spell - sp0 === 1, 'una sola richiesta a Spellbook (più al massimo il preflight)');
  ok(await page.textContent('#bk .bk-num b') === '4' && t3.includes('Infinite mana'), 'combo da Spellbook mostrato e bracket 4: ' + await page.textContent('#bk .bk-num b'));
  ok(t3.includes('Demonic Tutor') && t3.includes('Time Warp'), 'Game Changer locali e turni extra restano');
  await shot('bracket-2');
  await page.click('#bk [data-a="bk-set"][data-n="2"]');
  ok(await page.$eval('.dk-hero h1 .bk-badge', e => e.textContent) === '2', 'bracket a mano');
  await page.keyboard.press('Escape');

  /* 4) dati cancellati: la verifica li riscarica con l'avanzamento e poi mostra il report */
  spellMode = 'cors';
  await nav('data'); await page.click('[data-a="cards-clear"]');
  await page.waitForFunction(() => !document.querySelector('[data-a="cards-clear"]'));
  await nav('decks'); await page.click('[data-a="open-deck"]'); await page.waitForSelector('.dk-hero');
  await page.click('[data-a="bracket"]');
  await page.waitForSelector('#bk .bkr-head', { timeout: 15000 });
  ok(await page.textContent('#bk .bk-num b') === '3', 'dopo aver cancellato i dati: stesso bracket');

  ok(errors.length === 0, 'nessun errore in console: ' + errors.join(' | '));
  await browser.close(); srv.close();
  console.log('bracket-smoke: ' + n + ' controlli ok');
})().catch(e => { console.error(e); process.exit(1); });
