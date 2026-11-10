/* Prova in Chromium vero: ricerca e filtro nelle stampe, «Set suggerito» del mazzo (creazione, modifica, ordine) sia nel dialogo «Cambia stampa» che nel Builder.
 * Scryfall è simulato. Uso: node tools/prints-smoke.js */
const path = require('path'), fs = require('fs'), http = require('http'), assert = require('assert');
const { chromium } = require('playwright');
const WEB = path.join(__dirname, '..', 'web'), FX = path.join(__dirname, 'fixtures') + '/';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json', '.woff2': 'font/woff2', '.json': 'application/json' };
const SHOTS = process.env.SHOTS || '', MOB = !!process.env.MOB, DARK = !!process.env.DARK;
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); };
const eq = (a, b, m) => { n++; assert.deepStrictEqual(a, b, m); };
const SETS = [['2xm', 'Double Masters', '2020-08-07', 'masters'], ['c21', 'Commander 2021', '2021-04-23', 'commander'], ['cmm', 'Commander Masters', '2023-08-04', 'masters'], ['mh3', 'Modern Horizons 3', '2024-06-14', 'draft_innovation'], ['tmh3', 'Modern Horizons 3 Tokens', '2024-06-14', 'token'], ['mtgo', 'Magic Online', '2020-01-01', 'masters']];
const PRINTS = [['mh3', '302'], ['cmm', '400'], ['c21', '263'], ['2xm', '354']];
const card = (name, set, cn) => {
  const s = SETS.find(x => x[0] === set) || ['tst', 'Test', '2000-01-01'];
  return { id: name + '/' + set + cn, name, set, set_name: s[1], collector_number: cn, released_at: s[2], border_color: 'black', layout: 'normal', cmc: 1, type_line: 'Artifact', mana_cost: '{1}', colors: [], color_identity: [], rarity: 'uncommon', oracle_text: '{T}: Add {C}{C}.', keywords: [], legalities: { commander: 'legal' },
    prices: { eur: String((1 + Number(cn) / 1000).toFixed(2)), eur_foil: null },
    image_uris: { small: 'https://cards.scryfall.io/small/a.jpg', normal: 'https://cards.scryfall.io/normal/a.jpg', large: 'https://cards.scryfall.io/large/a.jpg' } };
};
(async () => {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(WEB, p);
    if (!f.startsWith(WEB) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
  }).listen(0);
  const base = 'http://localhost:' + srv.address().port + '/';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: MOB ? { width: 390, height: 844 } : { width: 1280, height: 900 }, colorScheme: DARK ? 'dark' : 'light' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|CORS/.test(m.text())) errors.push(m.text()); });
  const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
  let setsCalls = 0; const setQueries = [];
  const BY_SET = { c21: [['Sol Ring', '263'], ['Command Tower', '350'], ['Command Tower', '351', { border_color: 'borderless' }], ['Mountain', '400'], ['Mountain', '401'], ['Mountain', '402']] };
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route('https://cards.scryfall.io/**', r => r.fulfill({ status: 200, contentType: 'image/jpeg', body: JPG, headers: { 'access-control-allow-origin': '*' } }));
  await ctx.route('https://api.scryfall.com/**', r => {
    const u = new URL(r.request().url()), h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    const json = (b, s) => r.fulfill({ status: s || 200, contentType: 'application/json', headers: h, body: JSON.stringify(b) });
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: h });
    if (u.pathname === '/sets') { setsCalls++; return json({ data: SETS.map(s => ({ code: s[0], name: s[1], released_at: s[2], set_type: s[3], digital: s[0] === 'mtgo' })) }); }
    if (u.pathname === '/cards/collection') {
      const ids = JSON.parse(r.request().postData()).identifiers;
      return json({ data: ids.map(i => i.name ? card(i.name, i.set || 'tst', '1') : card('Sol Ring', i.set, i.collector_number)), not_found: [] });
    }
    if (u.pathname === '/cards/search') {
      const q = u.searchParams.get('q') || '', m = q.match(/^set:(\w+) \((.*)\)$/);
      if (m) {
        setQueries.push(q);
        const names = [...m[2].matchAll(/!"([^"]+)"/g)].map(x => x[1]), out = [];
        (BY_SET[m[1]] || []).forEach(([nm, cn, extra]) => { if (names.includes(nm)) out.push(Object.assign(card(nm, m[1], cn), extra || {})); });
        return out.length ? json({ data: out }) : json({ object: 'error', code: 'not_found' }, 404);
      }
      return json({ data: PRINTS.map(p => card('Sol Ring', p[0], p[1])) });
    }
    return json({}, 404);
  });
  const nav = v => page.locator('[data-a="nav"][data-v="' + v + '"]:visible').first().click();
  const settle = () => page.waitForFunction(() => !document.querySelector('#dstat .spin'));
  const solRow = () => page.locator('.dg:not([data-g="side"]) .dr', { hasText: 'Sol Ring' }).first();
  const firstPr = () => page.evaluate(() => { const b = document.querySelector('#prgrid .pr'); return b ? b.dataset.s : null; });
  const prSets = () => page.$$eval('#prgrid .pr', l => l.map(b => b.dataset.s));

  const shot = async nm => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, nm + (MOB ? '-m' : '') + (DARK ? '-d' : '') + '.png') }); };
  await page.goto(base); await page.waitForSelector('.shell');
  /* --- creazione del mazzo: «Set suggerito» nel passo 2 --- */
  await nav('import');
  await page.fill('[data-c="draft-text"]', fs.readFileSync(FX + 'kaalia_old.txt', 'utf8'));
  await page.fill('[data-c="draft-name"]', 'Kaalia set');
  await page.click('[data-a="draft-next"]'); await page.waitForSelector('[data-c="draft-pset"]'); await page.locator('[data-c="draft-pset"]').scrollIntoViewIfNeeded(); await shot('1-crea');
  ok(await page.locator('[data-c="draft-pset"]').count() === 1, 'la creazione del mazzo ha il campo «Set suggerito»');
  await page.fill('[data-c="draft-pset"]', 'zzzz'); await page.dispatchEvent('[data-c="draft-pset"]', 'change');
  await page.waitForSelector('.toast, #toast, [role="status"]'); ok(/Non conosco il set/.test(await page.evaluate(() => document.body.innerText)), 'un set sconosciuto viene rifiutato con un messaggio');
  await page.fill('[data-c="draft-pset"]', 'commander 2021'); await page.dispatchEvent('[data-c="draft-pset"]', 'change');
  await page.waitForFunction(() => /C21/.test(document.querySelector('[data-c="draft-pset"]').value));
  eq(await page.inputValue('[data-c="draft-pset"]'), 'C21 · Commander 2021', 'il nome del set viene riconosciuto e mostrato con la sigla');
  ok(setsCalls === 1, 'l’elenco dei set si scarica una volta sola');
  ok(await page.locator('#setlist option').count() === 4, 'i set digitali e i token non sono nell’elenco');
  await page.click('[data-a="draft-create"]'); await page.waitForSelector('.dk-hero'); await settle();
  await page.waitForFunction(() => document.querySelectorAll('.dg').length >= 3);

  /* --- «Cambia stampa»: il set suggerito va per primo --- */
  await solRow().locator('.pb').click(); await page.waitForSelector('#prgrid .pr');
  eq(await prSets(), ['c21', 'mh3', 'cmm', '2xm'], 'le stampe del set suggerito sono per prime, poi le altre dalla più recente');
  ok(await page.locator('#prgrid .pr.sug').count() === 1 && /Commander 2021/.test(await page.textContent('.pr-hint')), 'stampa evidenziata e promemoria del set suggerito');
  eq((await page.textContent('#prcount')).trim(), '4 stampe', 'contatore delle stampe'); await shot('2-stampe');
  await page.fill('[data-c="pr-q"]', 'commander'); eq(await prSets(), ['c21', 'cmm'], 'la ricerca trova per nome del set');
  eq((await page.textContent('#prcount')).trim(), '2 di 4 stampe', 'contatore con filtro');
  await page.fill('[data-c="pr-q"]', '263'); eq(await prSets(), ['c21'], 'per numero di collezione');
  await page.fill('[data-c="pr-q"]', 'mh3 302'); eq(await prSets(), ['mh3'], 'più parole insieme: sigla e numero');
  await page.fill('[data-c="pr-q"]', '2023'); eq(await prSets(), ['cmm'], 'per anno');
  await page.fill('[data-c="pr-q"]', 'qqqq'); ok(/Nessuna stampa corrisponde/.test(await page.textContent('#prgrid')), 'nessun risultato: lo dice');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.c === 'pr-q'), 'scrivendo la tastiera resta nella ricerca');
  await page.fill('[data-c="pr-q"]', ''); eq((await prSets()).length, 4, 'ricerca vuota: tutte');
  await page.click('[data-a="pr-only"]'); eq(await prSets(), ['c21'], '«Solo C21» mostra solo il set suggerito');
  ok(await page.getAttribute('[data-a="pr-only"]', 'aria-pressed') === 'true', 'il filtro risulta attivo');
  await page.click('[data-a="pr-only"]'); eq((await prSets()).length, 4, 'e si toglie');
  await page.click('#prgrid .pr[data-s="mh3"]'); await page.waitForTimeout(150);
  ok(!await page.locator('#prgrid').count(), 'scegliere una stampa chiude la finestra');
  ok(await page.locator('.dr[data-n="Sol Ring"][data-s="MH3"][data-c="302"]').count() === 1, 'la stampa scelta dal filtro viene applicata alla carta');

  /* --- modifica dal mazzo --- */
  await page.click('[data-a="dman-toggle"], [data-a="deck-man"], [data-a="man-toggle"]').catch(() => null);
  if (!await page.isVisible('[data-c="deck-pset"]')) { await page.evaluate(() => { const p = document.getElementById('dman'); p.hidden = false; }); }
  eq(await page.inputValue('[data-c="deck-pset"]'), 'C21 · Commander 2021', 'nella gestione del mazzo il set suggerito è già impostato');
  await page.fill('[data-c="deck-pset"]', 'MH3'); await page.dispatchEvent('[data-c="deck-pset"]', 'change');
  await page.waitForFunction(() => document.querySelector('[data-c="deck-pset"]').value.indexOf('MH3') === 0);
  await page.evaluate(() => { const p = document.getElementById('dman'); if (p) p.hidden = false; });
  await solRow().locator('.pb').click(); await page.waitForSelector('#prgrid .pr');
  eq((await prSets())[0], 'mh3', 'cambiando il set suggerito cambia l’ordine');
  await page.click('#lbx');
  await page.evaluate(() => { const p = document.getElementById('dman'); if (p) p.hidden = false; });
  await page.fill('[data-c="deck-pset"]', ''); await page.dispatchEvent('[data-c="deck-pset"]', 'change'); await page.waitForTimeout(250);
  await solRow().locator('.pb').click(); await page.waitForSelector('#prgrid .pr');
  eq(await prSets(), ['mh3', 'cmm', 'c21', '2xm'], 'senza set suggerito: ordine di Scryfall (dalla più recente)');
  ok(await page.locator('.pr-hint, [data-a="pr-only"]').count() === 0 && await page.locator('[data-c="pr-q"]').count() === 1, 'senza set suggerito niente filtro «Solo», la ricerca resta');
  await page.click('#lbx');
  await page.evaluate(() => { const p = document.getElementById('dman'); if (p) p.hidden = false; });
  await page.fill('[data-c="deck-pset"]', 'cmm'); await page.dispatchEvent('[data-c="deck-pset"]', 'change'); await page.waitForTimeout(250);

  /* --- «Applica il set suggerito alle carte del mazzo» --- */
  await page.evaluate(() => { const p = document.getElementById('dman'); if (p) p.hidden = false; });
  ok(await page.locator('[data-a="pset-apply"]').count() === 1 && await page.isEnabled('[data-a="pset-apply"]'), 'il pulsante «Applica il set suggerito» c\u2019è ed è attivo con un set impostato');
  await page.fill('[data-c="deck-pset"]', 'c21'); await page.dispatchEvent('[data-c="deck-pset"]', 'change');
  await page.waitForFunction(() => document.querySelector('[data-c="deck-pset"]').value.indexOf('C21') === 0);
  await page.evaluate(() => { const p = document.getElementById('dman'); if (p) p.hidden = false; });
  const rowOf = nm => page.evaluate(nm => { const r = [...document.querySelectorAll('.dg:not([data-g="side"]) .dr')].find(x => x.dataset.n === nm); return r ? r.dataset.s + '/' + r.dataset.c : null; }, nm);
  const before = [await rowOf('Sol Ring'), await rowOf('Command Tower'), await rowOf('Mountain')];
  const doApply = async () => {
    await page.evaluate(() => { const p = document.getElementById('dman'); if (p) p.hidden = false; });
    await page.click('[data-a="pset-apply"]'); await page.waitForSelector('#lb .lb-name');
    const seen = [];
    for (let i = 0; i < 4 && await page.locator('#lb .lb-name').count(); i++) {
      const nm = await page.textContent('#lb .lb-name'); seen.push(nm);
      if (/Command Tower/.test(nm)) await page.click('#lb .pr[data-i="1"]'); else await page.click('[data-a="ps-skip"]');
      await page.waitForTimeout(100);
    }
    return seen;
  };
  await shot('4-gestisci'); await page.click('[data-a="pset-apply"]');
  await page.waitForSelector('#lb .lb-name'); await shot('5-scelta');
  const seen = [];
  for (let i = 0; i < 4 && await page.locator('#lb .lb-name').count(); i++) {
    const nm = await page.textContent('#lb .lb-name'); seen.push(nm);
    ok(/ di 2: /.test(nm), 'il dialogo dice a che carta siamo: ' + nm);
    if (/Command Tower/.test(nm)) { eq(await page.locator('#lb .pr[data-a="ps-pick"]').count(), 2, 'Command Tower: due stampe da scegliere'); ok(/senza bordo/.test(await page.textContent('#lb')), 'le stampe speciali sono etichettate (senza bordo)'); await page.click('#lb .pr[data-i="1"]'); }
    else { eq(await page.locator('#lb .pr[data-a="ps-pick"]').count(), 3, 'Mountain: tre stampe'); ok(/8×/.test(nm), 'la quantità è indicata'); await page.click('[data-a="ps-skip"]'); }
    await page.waitForTimeout(100);
  }
  eq(seen.length, 2, 'la finestra chiede solo le due carte con più stampe (Sol Ring ha una sola stampa nel set e va da sola)');
  await page.waitForFunction(() => /impostato su 2 carte/.test(document.body.innerText));
  const t = await page.evaluate(() => document.body.innerText); ok(/2 diverse/.test(t) && /8 lasciate/.test(t), 'il riepilogo dice cosa è successo');
  eq([await rowOf('Sol Ring'), await rowOf('Command Tower'), await rowOf('Mountain')], ['C21/263', 'C21/351', before[2]], 'Sol Ring automatica, Command Tower scelta, Mountain lasciata com\u2019era');
  ok(setQueries.length >= 1 && setQueries.every(q => q.startsWith('set:c21 (')), 'si chiede a Scryfall solo il set suggerito, per nome');
  /* annulla: un solo tocco rimette tutto */
  await page.click('[data-a="undo"]'); await page.waitForTimeout(200);
  eq([await rowOf('Sol Ring'), await rowOf('Command Tower'), await rowOf('Mountain')], before, 'Annulla rimette le stampe di prima');
  eq((await doApply()).length, 2, 'applicandolo di nuovo si rifà lo stesso percorso');
  await page.waitForFunction(() => /impostato su 2 carte/.test(document.body.innerText));
  /* chiudere a metà con «Fine»: si applica quel che c'è (la stampa unica) e il resto resta com'era */
  await page.click('[data-a="undo"]'); await page.waitForTimeout(200);
  eq([await rowOf('Sol Ring'), await rowOf('Command Tower'), await rowOf('Mountain')], before, 'secondo annulla');
  await page.evaluate(() => { const p = document.getElementById('dman'); if (p) p.hidden = false; });
  await page.click('[data-a="pset-apply"]'); await page.waitForSelector('#lb .lb-name'); await page.click('#lbx');
  await page.waitForFunction(() => /impostato su 1 carta /.test(document.body.innerText));
  ok(/9 lasciate/.test(await page.evaluate(() => document.body.innerText)), 'le carte non decise risultano lasciate com\u2019erano');
  eq([await rowOf('Sol Ring'), await rowOf('Command Tower'), await rowOf('Mountain')], ['C21/263', before[1], before[2]], 'solo la stampa unica è stata applicata');
  await page.click('[data-a="undo"]'); await page.waitForTimeout(200);
  eq(await rowOf('Sol Ring'), before[0], 'annulla anche in questo caso');
  eq((await doApply()).length, 2, 'e si può rifare');
  await page.waitForFunction(() => /impostato su 2 carte/.test(document.body.innerText));
  /* ancora: restano da decidere solo le carte non ancora nel set */
  await page.evaluate(() => { const p = document.getElementById('dman'); if (p) p.hidden = false; });
  await page.click('[data-a="pset-apply"]'); await page.waitForSelector('#lb .lb-name');
  ok(/ di 1: Mountain/.test(await page.textContent('#lb .lb-name')), 'rilanciandolo, le carte già nel set non vengono richieste');
  await page.click('#lbx'); await page.waitForTimeout(150);
  ok(!await page.locator('#lb').count() && await rowOf('Mountain') === before[2], 'chiudere con «Fine» senza scegliere non cambia nulla');
  await page.evaluate(() => { const p = document.getElementById('dman'); if (p) p.hidden = false; });
  await page.fill('[data-c="deck-pset"]', 'cmm'); await page.dispatchEvent('[data-c="deck-pset"]', 'change');
  await page.waitForFunction(() => document.querySelector('[data-c="deck-pset"]').value.indexOf('CMM') === 0);

  /* --- Builder (Crea PDF del mazzo) --- */
  await page.click('[data-a="make-pdf"]'); await page.waitForSelector('[data-a="bd-prints"]');
  await page.locator('[data-a="bd-prints"]').first().click(); await page.waitForSelector('.bd-mp');
  const bdSets = () => page.$$eval('.bd-mp', l => l.map(b => b.getAttribute('aria-label').split(' ')[ b.getAttribute('aria-label').split(' ').length - 2 ].toLowerCase()));
  await shot('3-builder');
  eq((await bdSets())[0], 'cmm', 'anche nel Builder le stampe del set suggerito vengono per prime');
  ok(await page.locator('.bd-mp.sug').count() === 1 && /CMM/.test(await page.textContent('.bd-phint')), 'e sono evidenziate');
  await page.fill('[data-c="bd-pq"]', '263'); await page.waitForTimeout(100);
  eq((await page.$$('.bd-mp')).length, 1, 'ricerca nel Builder');
  ok(/1 di 4 stampe/.test(await page.textContent('#bd-mcount')), 'contatore nel Builder');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.dataset.c === 'bd-pq'), 'la tastiera resta nella ricerca');
  await page.fill('[data-c="bd-pq"]', ''); await page.click('[data-a="bd-ponly"]'); eq((await page.$$('.bd-mp')).length, 1, '«Solo CMM» nel Builder');
  await page.click('[data-a="bd-ponly"]'); await page.click('.bd-mp[data-n="3"]'); await page.waitForTimeout(150);
  ok(!await page.locator('.bd-modal').count(), 'scegliere una stampa (dalla lista ordinata) chiude la finestra');
  ok(await page.evaluate(() => /2XM/i.test(document.body.innerText) && /354/.test(document.body.innerText)), 'la stampa scelta è quella giusta anche con la lista riordinata');

  ok(errors.length === 0, 'nessun errore in console: ' + errors.join(' | '));
  await browser.close(); srv.close();
  console.log('prints-smoke: ' + n + ' controlli ok');
})().catch(e => { console.error(e); process.exit(1); });
