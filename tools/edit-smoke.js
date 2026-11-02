/* Prova in Chromium vero della modifica del mazzo a mano: aggiungere, togliere e spostare carte, sideboard ed export .txt. Scryfall è simulato.
 * Uso: node tools/edit-smoke.js   (SHOTS=cartella per salvare gli screenshot) */
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
  const calls = { collection: 0, spell: 0, auto: [] };
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
      const nf = ids.filter(i => i.name && /mai vista/i.test(i.name));
      return json({ data: ids.filter(i => !nf.includes(i)).map(i => i.name ? scry(i.name, i.set) : scry('Sol Ring', i.set, i.collector_number)), not_found: nf });
    }
    if (u.pathname === '/cards/autocomplete') { calls.auto.push(u.searchParams.get('q')); return json({ object: 'catalog', data: /^sol/i.test(u.searchParams.get('q')) ? ['Sol Ring', 'Solemn Simulacrum'] : [] }); }
    return json({}, 404);
  });

  const nav = v => page.locator('[data-a="nav"][data-v="' + v + '"]:visible').first().click();
  const shot = async name => { if (SHOTS) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
  const qtyOf = async (name, grp) => { const r = page.locator((grp ? '.dg[data-g="' + grp + '"] ' : '.dg:not([data-g="side"]) ') + '.dr', { hasText: name }).first(); return (await r.count()) ? parseInt(await r.locator('.q').textContent(), 10) : 0; };
  const bar = async () => ({ tot: parseInt(await page.textContent('#dbar .tot b'), 10), side: (await page.locator('#dbar .ty.sb b').count()) ? parseInt(await page.textContent('#dbar .ty.sb b'), 10) : 0 });
  const menu = async (name, grp) => { const r = page.locator((grp ? '.dg[data-g="side"] ' : '.dg:not([data-g="side"]) ') + '.dr', { hasText: name }).first(); await r.hover(); await r.locator('.dmb').click(); await page.waitForSelector('.drm'); };
  const settle = () => page.waitForFunction(() => !document.querySelector('#dstat .spin'));

  /* import con sideboard */
  await page.goto(base); await page.waitForSelector('.shell');
  await nav('import');
  await page.fill('[data-c="draft-text"]', fs.readFileSync(FX + 'kaalia_old.txt', 'utf8').replace(/\s*$/, '') + '\n\nSideboard\n1 Comet Storm\n2 Path to Exile\n');
  await page.fill('[data-c="draft-name"]', 'Kaalia of the Vast Upgrade');
  await page.click('[data-a="draft-next"]');
  ok((await page.textContent('.vh .sub')).includes('3 in sideboard'), 'import: «3 in sideboard» invece di «escluse»');
  await page.click('[data-a="draft-create"]');
  await page.waitForSelector('.dk-hero'); await settle();
  await page.waitForFunction(() => document.querySelectorAll('.dg').length >= 4);
  ok(await page.locator('.dg[data-g="side"]').count() === 1, 'gruppo Sideboard nella lista');
  ok(await qtyOf('Comet Storm', 'side') === 1 && await qtyOf('Path to Exile', 'side') === 2, 'carte del sideboard con le loro quantità');
  let b = await bar(); const tot0 = b.tot;
  ok(b.side === 3 && tot0 === 100, 'barra: 100 nel mazzo e 3 in sideboard (' + JSON.stringify(b) + ')');
  ok(await page.$eval('.dg[data-g="side"]', e => e === e.parentElement.lastElementChild), 'il sideboard è l\'ultimo gruppo');
  await shot('edit-1');

  /* aggiungere una carta: suggerimenti, quantità, conferma */
  await page.click('[data-a="dadd-toggle"]');
  ok(await page.isVisible('#dadd'), 'pannello «Aggiungi carta»');
  await page.fill('#dadd-q', 'sol');
  await page.waitForSelector('#dadd-sug .link');
  ok((await page.$$eval('#dadd-sug .link', e => e.map(x => x.textContent))).join() === 'Sol Ring,Solemn Simulacrum' && calls.auto.includes('sol'), 'suggerimenti da Scryfall');
  await page.click('#dadd-sug [data-v="Sol Ring"]');
  ok(await page.inputValue('#dadd-q') === 'Sol Ring', 'scegliere un suggerimento riempie il campo');
  const sol0 = await qtyOf('Sol Ring'); await page.fill('#dadd-n', '2'); await page.press('#dadd-q', 'Enter');
  await page.waitForFunction(n => [...document.querySelectorAll('.dg:not([data-g="side"]) .dr')].some(r => /Sol Ring/.test(r.textContent) && parseInt(r.querySelector('.q').textContent, 10) === n), sol0 + 2);
  ok((await bar()).tot === tot0 + 2, 'Invio aggiunge 2 copie: totale ' + (tot0 + 2));
  ok(await page.inputValue('#dadd-q') === '' && await page.isVisible('#dadd'), 'campo svuotato e pannello aperto per la prossima');
  ok((await page.textContent('#toast')).includes('Sol Ring') && await page.locator('#toast [data-a="undo"]').count() === 1, 'avviso con Annulla');
  await page.click('#toast [data-a="undo"]');
  await page.waitForFunction(n => [...document.querySelectorAll('.dr')].some(r => /Sol Ring/.test(r.textContent) && parseInt(r.querySelector('.q').textContent, 10) === n), sol0);
  ok((await bar()).tot === tot0, 'Annulla toglie le copie aggiunte');

  /* nome sconosciuto: avviso e «Aggiungi comunque» */
  await page.click('[data-a="dadd-toggle"]'); await page.click('[data-a="dadd-toggle"]');
  await page.fill('#dadd-q', 'Carta mai vista'); await page.click('#dadd-go');
  await page.waitForSelector('#dadd-msg [data-a="dadd-force"]');
  ok((await page.textContent('#dadd-msg')).includes('Carta mai vista') && await qtyOf('Carta mai vista') === 0, 'nome non trovato: avviso, nulla aggiunto');
  await page.click('[data-a="dadd-force"]');
  await page.waitForFunction(() => [...document.querySelectorAll('.dr')].some(r => /Carta mai vista/.test(r.textContent)));
  ok(await qtyOf('Carta mai vista') === 1, '«Aggiungi comunque» la aggiunge');

  /* set e numero nel testo, e destinazione sideboard */
  await page.selectOption('[data-c="dadd-to"]', 'side');
  await page.fill('#dadd-q', '3 Serra Angel (C21) 7'); await page.click('#dadd-go');
  await page.waitForFunction(() => [...document.querySelectorAll('.dg[data-g="side"] .dr')].some(r => /Serra Angel/.test(r.textContent)));
  ok(await qtyOf('Serra Angel', 'side') === 3 && (await bar()).side === 6, 'aggiunta al sideboard: 3 copie');
  ok(await page.locator('.dg[data-g="side"] .dr', { hasText: 'Serra Angel' }).getAttribute('data-s') === 'C21', 'la collezione scritta nel testo resta');
  ok(await page.$eval('[data-c="dadd-to"]', e => e.value) === 'side', 'la destinazione scelta resta');
  await page.selectOption('[data-c="dadd-to"]', 'main');

  /* menu di riga: copie, spostamento, rimozione */
  await menu('Sol Ring'); await shot('edit-menu');
  ok(await page.locator('.drm [data-a="dr-move"]').count() >= 1, 'il menu offre lo spostamento in sideboard');
  await page.click('.drm [data-a="dr-qty"][data-k="1"]');
  await page.waitForFunction(() => [...document.querySelectorAll('.dr')].some(r => /Sol Ring/.test(r.textContent) && parseInt(r.querySelector('.q').textContent, 10) === 2));
  ok(await page.locator('.drm').count() === 1, 'il menu resta aperto dopo +1');
  await page.click('.drm [data-a="dr-qty"][data-k="-1"]');
  await page.waitForFunction(() => [...document.querySelectorAll('.dr')].some(r => /Sol Ring/.test(r.textContent) && parseInt(r.querySelector('.q').textContent, 10) === 1));
  ok(await qtyOf('Sol Ring') === 1, '− una copia');
  await page.click('.drm [data-a="dr-move"][data-k="1"]');
  await page.waitForFunction(() => [...document.querySelectorAll('.dg[data-g="side"] .dr')].some(r => /Sol Ring/.test(r.textContent)));
  ok(await qtyOf('Sol Ring') === 0 && await qtyOf('Sol Ring', 'side') === 1, 'sposta l\'unica copia in sideboard');
  ok(await page.locator('.drm').count() === 0, 'riga spostata: menu chiuso');
  await menu('Sol Ring', true);
  ok(await page.locator('.drm [data-a="dr-move"]').first().textContent().then(t => /Rimetti nel mazzo/.test(t)), 'dal sideboard: «Rimetti nel mazzo»');
  await page.click('.drm [data-a="dr-move"]');
  await page.waitForFunction(() => ![...document.querySelectorAll('.dg[data-g="side"] .dr')].some(r => /Sol Ring/.test(r.textContent)));
  ok(await qtyOf('Sol Ring') === 1 && await qtyOf('Sol Ring', 'side') === 0, 'rimessa nel mazzo');
  const path0 = await qtyOf('Path to Exile'); await menu('Path to Exile', true);
  await page.click('.drm [data-a="dr-move"][data-k=""]');
  await page.waitForFunction(() => ![...document.querySelectorAll('.dg[data-g="side"] .dr')].some(r => /Path to Exile/.test(r.textContent)));
  ok(await qtyOf('Path to Exile') === path0 + 2, '«Rimetti tutte»: le due copie tornano nel mazzo e si fondono con quella già nel mazzo');
  await menu('Carta mai vista');
  await page.click('.drm [data-a="dr-del"]');
  await page.waitForFunction(() => ![...document.querySelectorAll('.dr')].some(r => /Carta mai vista/.test(r.textContent)));
  ok(await qtyOf('Carta mai vista') === 0, 'Rimuovi toglie la carta dal mazzo');
  ok((await page.textContent('#toast')).startsWith('Codighel! Ma è sparita') && await page.locator('#toast [data-a="undo"]').count() === 1, 'rimuovendo una carta: «Codighel! Ma è sparita…» (con Annulla)');
  await shot('edit-2');

  /* il commander non va in sideboard; toglierlo lo svuota (con Annulla) */
  await menu('Kaalia of the Vast', false);
  ok(await page.locator('.drm [data-a="dr-move"]').count() === 0, 'il commander non si sposta in sideboard');
  await page.click('.drm [data-a="dr-del"]');
  await page.waitForFunction(() => /Nessun commander/.test(document.querySelector('.dk-meta').textContent));
  ok(await page.locator('.dg[data-g="cmd"]').count() === 0, 'tolto il commander: il mazzo resta senza');
  await page.click('#toast [data-a="undo"]').catch(async () => { await page.waitForSelector('#toast [data-a="undo"]'); await page.click('#toast [data-a="undo"]'); });
  await page.waitForFunction(() => !/Nessun commander/.test(document.querySelector('.dk-meta').textContent));
  ok(await page.locator('.dg[data-g="cmd"]').count() === 1, 'Annulla rimette il commander');

  /* persistenza */
  await page.waitForTimeout(700);
  await page.reload(); await page.waitForSelector('.shell'); await nav('decks'); await page.click('[data-a="open-deck"]'); await page.waitForSelector('.dk-hero');
  await page.waitForFunction(() => document.querySelectorAll('.dg').length >= 4);
  ok(await qtyOf('Serra Angel', 'side') === 3 && await qtyOf('Comet Storm', 'side') === 1, 'dopo il riavvio il sideboard c\'è ancora');
  ok(await page.locator('.deckcard, .dk-hero').first().count() === 1, 'pagina del mazzo');

  /* export .txt */
  await page.click('[data-a="deck-man"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-a="export-deck"]')]);
  ok(dl.suggestedFilename() === 'Kaalia-of-the-Vast-Upgrade.txt', 'nome del file: ' + dl.suggestedFilename());
  const txt = fs.readFileSync(await dl.path(), 'utf8');
  ok(/^Commander\n1 Kaalia of the Vast/.test(txt) && /\n\nDeck\n/.test(txt) && /\n\nSideboard\n/.test(txt), 'file: Commander, Deck e Sideboard');
  ok(/^3 Serra Angel \(C21\) 7$/m.test(txt) && /^1 Comet Storm/m.test(txt) && /^3 Path to Exile/m.test(txt), 'file: quantità, nomi e set');
  const lines = txt.split('\n').filter(l => /^\d+ /.test(l)), nMain = lines.length;
  ok(nMain > 40, 'file: tutte le carte (' + nMain + ' righe)');
  const side = txt.split('\n\nSideboard\n')[1].trim().split('\n').reduce((t, l) => t + parseInt(l, 10), 0);
  ok(side === 4, 'file: 4 carte in sideboard (Comet Storm, Serra Angel x3), ha ' + side);
  /* stampa: il sideboard c'è nell'elenco, a 0 copie */
  await page.click('[data-a="make-pdf"]'); await page.waitForSelector('.bd-row');
  const sbRows = await page.$$eval('.bd-row.off', rs => rs.filter(r => /sideboard/.test(r.textContent)).map(r => r.querySelector('.bd-nm b').textContent + ':' + r.querySelector('.bd-q').value));
  ok(sbRows.includes('Serra Angel:0') && sbRows.includes('Comet Storm:0'), 'Stampa: sideboard nell\'elenco con 0 copie (' + sbRows.join(', ') + ')');
  await page.fill('.bd-row.off:has-text("Serra Angel") .bd-q', '3'); await page.press('.bd-row.off:has-text("Serra Angel") .bd-q', 'Tab');
  ok(await page.locator('.bd-row.off:has-text("Serra Angel")').count() === 0, 'alzando la quantità la carta entra nella stampa');

  ok(errors.length === 0, 'nessun errore in console: ' + errors.join(' | '));
  await browser.close(); srv.close();
  console.log('edit-smoke: ' + n + ' controlli ok');
})().catch(e => { console.error(e); process.exit(1); });
