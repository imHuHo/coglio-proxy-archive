/* Prova in Chromium vero di The Pescher (preparazione, partita, danno da comandante, dadi, avviso di squilibrio, salvataggio).
 * Uso: node tools/pescher-smoke.js   (SHOTS=cartella per gli screenshot, DARK=1, VP=390x800) */
const path = require('path'), fs = require('fs'), http = require('http'), assert = require('assert');
const { chromium } = require('playwright');
const WEB = path.join(__dirname, '..', 'web'), FX = path.join(__dirname, 'fixtures') + '/';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json', '.woff2': 'font/woff2', '.json': 'application/json' };
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); };
const SHOTS = process.env.SHOTS || '';
(async () => {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(WEB, p); if (!f.startsWith(WEB) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
  }).listen(0);
  const base = 'http://localhost:' + srv.address().port + '/';
  const browser = await chromium.launch();
  const vp = (process.env.VP || '1280x900').split('x').map(Number);
  const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, colorScheme: process.env.DARK ? 'dark' : 'light' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
  await ctx.route('https://**/*', r => r.abort());
  const shot = async name => { if (SHOTS) { await page.waitForTimeout(250); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
  const nav = v => page.locator('[data-a="nav"][data-v="' + v + '"]:visible').first().click();
  const life = id => page.$eval('.pe-tile[data-p="' + id + '"] .pe-lv', e => parseInt(e.textContent, 10));

  await page.goto(base); await page.waitForSelector('.shell');
  /* due mazzi attivi, uno con bracket */
  await nav('import');
  await page.fill('[data-c="draft-text"]', fs.readFileSync(FX + 'kaalia_old.txt', 'utf8')); await page.fill('[data-c="draft-name"]', 'Kaalia Upgrade');
  await page.click('[data-a="draft-next"]'); await page.click('[data-a="draft-create"]'); await page.waitForSelector('.dk-hero');
  await nav('decks');
  const act = page.locator('[data-a="toggle-active"]').first(); if (await act.count()) await act.click();

  /* la voce di menu esiste con la sua icona */
  ok(await page.locator('.nav[data-v="pescher"]:visible').count() >= 1, 'voce The Pescher nel menu');
  ok(await page.locator('.nav[data-v="pescher"] svg').count() >= 1, 'con la sua icona');
  await nav('pescher'); await page.waitForSelector('#pe .pe-setup');
  ok(/The Pescher/.test(await page.textContent('.vh h1')), 'titolo');
  ok(await page.locator('.pe-seat').count() === 4, 'quattro posti di default');
  ok(await page.locator('.pe-seat .pe-name').first().inputValue() === 'Io', 'il primo posto è «Io»');
  /* giocatori e vita */
  await page.click('[data-a="pe-count"][data-v="3"]'); ok(await page.locator('.pe-seat').count() === 3, 'tre posti');
  await page.click('[data-a="pe-count"][data-v="4"]');
  await page.click('[data-a="pe-start"][data-v="20"]'); ok(await page.getAttribute('[data-a="pe-start"][data-v="20"]', 'aria-pressed') === 'true', 'vita 20 scelta');
  await page.click('[data-a="pe-start"][data-v="40"]');
  /* nomi */
  await page.fill('.pe-seat[data-p="p2"] .pe-name', 'Luca'); await page.fill('.pe-seat[data-p="p3"] .pe-name', 'Marta'); await page.fill('.pe-seat[data-p="p4"] .pe-name', 'Giulia');
  /* avviso di squilibrio */
  ok(/bracket/i.test(await page.textContent('.pe-bal')) && await page.locator('.pe-bal.unknown').count() === 1, 'prima dei bracket: invito a sceglierli');
  await page.click('.pe-seat[data-p="p2"] [data-a="pe-bkt"][data-v="2"]'); await page.click('.pe-seat[data-p="p3"] [data-a="pe-bkt"][data-v="2"]');
  ok(await page.locator('.pe-bal.ok').count() === 1, 'due bracket 2: equilibrato');
  await page.click('.pe-seat[data-p="p4"] [data-a="pe-bkt"][data-v="5"]');
  ok(await page.locator('.pe-bal.bad').count() === 1, 'bracket 2 contro 5: squilibrio forte');
  ok(/Giulia/.test(await page.textContent('.pe-bal')) && /Luca|Marta/.test(await page.textContent('.pe-bal')), 'l\'avviso dice chi: ' + await page.textContent('.pe-bal'));
  await page.click('.pe-seat[data-p="p4"] [data-a="pe-bkt"][data-v="3"]'); ok(await page.locator('.pe-bal.ok').count() === 1, 'bracket 2, 2 e 3: distanza 1, va bene');
  await page.click('.pe-seat[data-p="p4"] [data-a="pe-bkt"][data-v="4"]'); ok(await page.locator('.pe-bal.warn').count() === 1, 'bracket 2 contro 4: avviso');
  /* che mazzo uso stasera */
  await page.click('[data-a="pe-sug"]'); await page.waitForSelector('.pe-sug');
  ok(/Kaalia/.test(await page.textContent('.pe-sug')) || /Non ho nessun mazzo/.test(await page.textContent('.pe-sug')), 'consiglio del mazzo: ' + (await page.textContent('.pe-sug')).replace(/\s+/g, ' '));
  const hadDeck = await page.locator('[data-a="pe-sug-use"]').count();
  if (hadDeck) { await page.click('[data-a="pe-sug-use"]'); ok(/Kaalia/.test(await page.$eval('.pe-seat[data-p="p1"] select', e => e.selectedOptions[0].textContent)), 'mazzo scelto nel selettore'); }
  await shot('pescher-setup');

  /* partita */
  await page.click('[data-a="pe-begin"]'); await page.waitForSelector('.pe-grid');
  ok(await page.locator('.pe-tile').count() === 4, 'quattro riquadri');
  ok(await page.locator('.pe-tile.turn').count() === 1, 'uno solo ha il turno');
  ok(await life('p1') === 40, 'vita 40');
  await page.click('.pe-tile[data-p="p2"] [data-a="pe-life"][data-d="-1"]'); await page.click('.pe-tile[data-p="p2"] [data-a="pe-life"][data-d="-5"]');
  ok(await life('p2') === 34, 'vita 34 dopo -1 e -5: ' + await life('p2'));
  await page.click('[data-a="pe-undo"]'); ok(await life('p2') === 39, 'annulla toglie solo l\'ultimo passaggio: ' + await life('p2'));
  /* veleno */
  await page.click('.pe-tile[data-p="p3"] [data-a="pe-tog"][data-k="poison"]');
  for (let i = 0; i < 3; i++) await page.click('.pe-tile[data-p="p3"] [data-a="pe-poison"][data-d="1"]');
  ok(/3/.test(await page.textContent('.pe-tile[data-p="p3"] .pe-chip[data-k="poison"]')), 'veleno a 3');
  /* danno da comandante: toglie vita e a 21 si è fuori */
  await page.click('.pe-tile[data-p="p4"] [data-a="pe-tog"][data-k="cmd"]');
  ok(await page.locator('.pe-tile[data-p="p4"] .pe-row').count() === 3, 'tre avversari');
  for (let i = 0; i < 7; i++) await page.click('.pe-tile[data-p="p4"] [data-a="pe-cmd"][data-from="p1"][data-d="1"]');
  ok(await life('p4') === 33, 'il danno da comandante toglie anche vita: ' + await life('p4'));
  for (let i = 0; i < 14; i++) await page.click('.pe-tile[data-p="p4"] [data-a="pe-cmd"][data-from="p1"][data-d="1"]');
  ok(await page.locator('.pe-tile[data-p="p4"].out').count() === 1, '21 danni da comandante: fuori');
  ok(/Io|comandante/.test(await page.textContent('.pe-tile[data-p="p4"] .pe-out')), 'dice perché: ' + await page.textContent('.pe-tile[data-p="p4"] .pe-out'));
  await shot('pescher-play');
  /* turno */
  const t0 = await page.$eval('.pe-tile.turn', e => e.dataset.p); await page.click('[data-a="pe-next"]');
  const t1 = await page.$eval('.pe-tile.turn', e => e.dataset.p); ok(t0 !== t1 && t1 !== 'p4', 'il turno passa e salta chi è fuori: ' + t0 + ' → ' + t1);
  /* dadi */
  await page.click('[data-a="pe-dice"]'); await page.waitForSelector('#pe-pop .pe-dice');
  await page.click('[data-a="pe-roll"][data-k="d20"]'); const v = parseInt(await page.textContent('#pe-pop .pe-res b'), 10); ok(v >= 1 && v <= 20, 'd20 tra 1 e 20: ' + v);
  await page.click('[data-a="pe-roll"][data-k="coin"]'); ok(/Testa|Croce/.test(await page.textContent('#pe-pop .pe-res b')), 'moneta');
  await page.click('[data-a="pe-first"]'); ok(/Io|Luca|Marta|Giulia/.test(await page.textContent('#pe-pop .pe-res b')), 'chi inizia');
  await shot('pescher-dice');
  await page.keyboard.press('Escape'); ok(await page.locator('#pe-pop').count() === 0, 'Esc chiude i dadi');
  /* registro */
  await page.click('[data-a="pe-log"]'); ok(await page.locator('#pe-pop .pe-log li').count() >= 5, 'il registro racconta la partita');
  await page.click('#pex'); ok(await page.locator('#pe-pop').count() === 0, 'Chiudi chiude');
  /* salvataggio: ricarico la pagina e la partita è ancora lì */
  const lifeBefore = await life('p2'); await page.reload(); await page.waitForSelector('.shell'); await nav('pescher'); await page.waitForSelector('.pe-grid');
  ok(await life('p2') === lifeBefore, 'la partita sopravvive al ricaricamento');
  ok(await page.locator('.pe-tile[data-p="p4"].out').count() === 1, 'anche chi era fuori');
  /* rientra rialzando la vita non basta: i danni da comandante restano → resta fuori; il veleno si può togliere */
  /* menu: specchio, focus e nuova partita con conferma */
  await page.click('[data-a="pe-menu"]'); await page.check('[data-c="pe-mirror"]'); await page.click('#pex');
  ok(await page.locator('.pe-tile.flip').count() === 2, 'due riquadri girati per chi siede di fronte');
  await shot('pescher-mirror');
  await page.click('[data-a="pe-menu"]'); await page.uncheck('[data-c="pe-mirror"]'); await page.check('[data-c="pe-focus"]');
  ok(await page.evaluate(() => document.body.classList.contains('pe-focus')), 'modalità focus'); ok(!(await page.locator('.side').isVisible()), 'la barra laterale sparisce in focus');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  ok(!(await page.evaluate(() => document.body.classList.contains('pe-focus'))), 'Esc esce dal focus');
  await page.click('[data-a="pe-menu"]'); await page.click('[data-a="pe-again"]'); ok(await page.locator('.pe-tile').count() === 4 && await life('p2') === lifeBefore, 'una sola pressione non azzera');
  await page.click('[data-a="pe-again"]'); await page.waitForSelector('.pe-grid'); ok(await life('p2') === 40 && await life('p4') === 40, 'nuova partita: tutti a 40');
  await page.click('[data-a="pe-menu"]'); await page.click('[data-a="pe-setup"]'); await page.click('[data-a="pe-setup"]'); await page.waitForSelector('.pe-setup'); ok(true, 'cambia tavolo');
  /* niente scorrimento orizzontale */
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'nessuno scorrimento orizzontale');
  ok(!errors.length, 'nessun errore in pagina: ' + errors.join(' | '));
  console.log('pescher-smoke: ' + n + ' controlli ok');
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
