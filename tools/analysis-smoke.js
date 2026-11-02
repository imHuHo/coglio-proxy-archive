/* Prova in Chromium vero del popup «Analisi del piscio». Scryfall è simulato.
 * Uso: node tools/analysis-smoke.js   (SHOTS=cartella per gli screenshot, DARK=1, VP=390x800) */
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
    keywords: sp.kw || [], power: sp.pw, toughness: sp.tg,
    legalities: { commander: name === 'Comet Storm' ? 'banned' : 'legal' }, produced_mana: land ? ['R'] : (name === 'Sol Ring' ? ['C'] : undefined),
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
  await page.click('[data-a="nav"][data-v="import"]:visible');
  await page.fill('[data-c="draft-text"]', fs.readFileSync(FX + 'kaalia_old.txt', 'utf8'));
  await page.fill('[data-c="draft-name"]', 'Kaalia of the Vast Upgrade');
  await page.click('[data-a="draft-next"]'); await page.click('[data-a="draft-create"]');
  await page.waitForSelector('.dk-hero');
  await page.waitForFunction(() => !document.querySelector('#dstat .spin'), null, { timeout: 20000 });

  ok(await page.locator('[data-a="analysis"]').count() === 1, 'tasto Analisi del piscio nel mazzo');
  await page.click('[data-a="analysis"]');
  await page.waitForSelector('#an .an-grid', { timeout: 20000 });
  const txt = (await page.textContent('#an')).replace(/\s+/g, ' ');
  for (const w of ['Analisi del piscio', 'Curva di mana', 'Colori', 'Tipi', 'Fonti di mana', 'Identità di colore', 'Legalità', 'costo medio', 'terre'])
    ok(txt.includes(w), 'il popup contiene «' + w + '»: ' + txt.slice(0, 200));
  ok(await page.locator('#an .an-svg').count() >= 2, 'curva e torta sono grafici SVG');
  ok(await page.locator('#an svg[role="img"]').count() >= 2 && (await page.getAttribute('#an svg[role="img"]', 'aria-label')).length > 10, 'i grafici hanno una descrizione per chi non li vede');
  ok(await page.locator('#an .an-bar').count() === 8, 'otto colonne nella curva');
  ok(await page.locator('#an .an-bar.peak').count() === 1, 'una sola colonna evidenziata (il picco)');
  ok(/Comet Storm/.test(txt) ? /band/i.test(txt) : true, 'carta bandita segnalata se presente');
  ok(await page.locator('#an .an-v').count() === 1, 'un solo verdetto in cima');
  const box = await page.$eval('#an .an-box', e => { const r = e.getBoundingClientRect(); return [r.width, r.left, r.right, innerWidth]; });
  ok(box[1] >= 0 && box[2] <= box[3] + 1, 'il popup sta nella finestra: ' + box.join(','));
  const hscroll = await page.evaluate(() => document.querySelector('#an').scrollWidth <= document.querySelector('#an').clientWidth + 1);
  ok(hscroll, 'nessuno scorrimento orizzontale nel popup');
  await shot('analysis');
  /* click dentro non chiude, Esc chiude */
  await page.click('#an .an-head strong');
  ok(await page.locator('#an').count() === 1, 'un clic dentro non chiude');
  await page.keyboard.press('Escape');
  ok(await page.locator('#an').count() === 0, 'Esc chiude');
  await page.click('[data-a="analysis"]'); await page.waitForSelector('#an .an-grid');
  await page.click('#anx'); ok(await page.locator('#an').count() === 0, 'Chiudi chiude');
  await page.click('[data-a="analysis"]'); await page.waitForSelector('#an .an-grid');
  await page.mouse.click(5, 5); ok(await page.locator('#an').count() === 0, 'clic fuori chiude');
  ok(!errors.length, 'nessun errore in pagina: ' + errors.join(' | '));
  console.log('analysis-smoke: ' + n + ' controlli ok');
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
