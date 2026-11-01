/* Prova in Chromium vero della sincronizzazione: due «dispositivi» (due contesti separati) con Dropbox e Google Drive simulati.
 * Uso: node tools/sync-smoke.js   (SHOTS=cartella per gli screenshot) */
const path = require('path'), fs = require('fs'), http = require('http'), assert = require('assert');
const { chromium } = require('playwright');
const { fakeDropbox, fakeGoogle } = require('./fake-clouds.js');
const WEB = path.join(__dirname, '..', 'web'), FX = path.join(__dirname, 'fixtures') + '/';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json', '.woff2': 'font/woff2', '.json': 'application/json' };
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); };
const SHOTS = process.env.SHOTS || '';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-expose-headers': 'dropbox-api-result' };

(async () => {
  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(WEB, p);
    if (!f.startsWith(WEB) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
  }).listen(0);
  const base = 'http://localhost:' + srv.address().port + '/';
  const browser = await chromium.launch();
  const dbx = fakeDropbox(), ggl = fakeGoogle();
  const errors = [];

  async function device(name, vp) {
    const ctx = await browser.newContext({ viewport: vp || { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(name + ': ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(name + ': ' + m.text()); });
    await page.addInitScript(() => { window.CPA_IMG_DELAY = 1e9; window.CPA_SYNC_DELAY = 400; window.CPA_POLL_SCALE = 0.02; });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx.route(/cards\.scryfall\.io|api\.scryfall\.com/, r => r.abort());
    const cloud = fake => async r => {
      const rq = r.request();
      if (rq.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS });
      const ct = rq.headers()['content-type'] || '', raw = rq.postData() || '';
      const req = { method: rq.method(), url: rq.url(), headers: {} };
      Object.entries(rq.headers()).forEach(([k, v]) => { req.headers[k.split('-').map(x => x[0].toUpperCase() + x.slice(1)).join('-')] = v; });
      req.headers['Dropbox-API-Arg'] = rq.headers()['dropbox-api-arg'];
      if (/x-www-form-urlencoded/.test(ct)) req.form = Object.fromEntries(new URLSearchParams(raw)); else req.body = raw;
      const res = await fake.http(req);
      r.fulfill({ status: res.status, body: res.text, headers: Object.assign({ 'content-type': 'application/json' }, CORS, res.headers || {}) });
    };
    await ctx.route(/(api|content)\.dropboxapi\.com/, cloud(dbx));
    await ctx.route(/(oauth2|www)\.googleapis\.com/, cloud(ggl));
    await page.goto(base); await page.waitForSelector('.shell');
    const d = { name, ctx, page, nav: v => page.locator('[data-a="nav"][data-v="' + v + '"]:visible').first().click() };
    d.shot = async f => { if (SHOTS) { await page.waitForTimeout(250); await page.screenshot({ path: path.join(SHOTS, f + '.png') }); } };
    d.importDeck = async (file, nm) => {
      await d.nav('import');
      await page.fill('[data-c="draft-text"]', fs.readFileSync(FX + file, 'utf8')); await page.fill('[data-c="draft-name"]', nm);
      await page.click('[data-a="draft-next"]'); await page.click('[data-a="draft-create"]'); await page.waitForSelector('#dlist');
    };
    d.decks = () => page.evaluate(() => JSON.parse(localStorage.getItem('cpa:state:v1') || 'null')); /* non usato: i mazzi stanno in IndexedDB */
    d.deckNames = async () => { await d.nav('decks'); return page.$$eval('.deckcard h2', els => els.map(e => e.textContent.trim())); };
    d.syncText = () => page.locator('#syncp').textContent();
    return d;
  }

  /* ----- PC: collegamento a Dropbox ----- */
  const A = await device('pc');
  await A.importDeck('kaalia_old.txt', 'Kaalia');
  await A.nav('data');
  ok(await A.page.locator('#syncp').isVisible() && /Sincronizzazione/.test(await A.syncText()), 'pannello di sincronizzazione');
  ok(await A.page.locator('[data-a="sync-dbx"]').isDisabled() && await A.page.locator('[data-a="sync-ggl"]').isDisabled(), 'senza chiavi i pulsanti sono spenti');
  ok(await A.page.locator('#syncp details.how[open]').count() === 1, 'la prima configurazione è aperta');
  await A.page.fill('[data-c="sync-key"][data-k="dropbox"]', 'KEY'); await A.page.press('[data-c="sync-key"][data-k="dropbox"]', 'Tab');
  await A.page.waitForSelector('[data-a="sync-dbx"]:not([disabled])');
  ok(await A.page.locator('[data-a="sync-ggl"]').isDisabled(), 'Google resta spento senza le sue chiavi');
  await A.shot('s1-dati-sync');
  await A.page.click('[data-a="sync-dbx"]');
  const href = await A.page.getAttribute('#syncp a.btn', 'href');
  const hq = new URL(href).searchParams;
  ok(/^https:\/\/www\.dropbox\.com\/oauth2\/authorize/.test(href) && hq.get('client_id') === 'KEY' && hq.get('code_challenge_method') === 'S256' && hq.get('token_access_type') === 'offline', 'link di Dropbox con PKCE');
  ok(await A.page.getAttribute('#syncp a.btn', 'target') === '_blank', 'si apre in una scheda a parte');
  await A.shot('s2-dropbox-codice');
  await A.page.fill('[data-c="sync-code"]', 'SBAGLIATO'); await A.page.click('[data-a="sync-dbx-ok"]');
  await A.page.waitForSelector('#syncp .err');
  ok(/Codice non valido/.test(await A.syncText()), 'codice sbagliato: messaggio');
  await A.page.fill('[data-c="sync-code"]', 'GOODCODE'); await A.page.click('[data-a="sync-dbx-ok"]');
  await A.page.waitForFunction(() => /Collegato a Dropbox/.test(document.querySelector('#syncp').textContent) && /ultima sincronizzazione: (oggi|\d)/.test(document.querySelector('#syncp').textContent), null, { timeout: 15000 });
  ok(dbx.file && JSON.parse(dbx.file).decks.length === 1 && JSON.parse(dbx.file).decks[0].name === 'Kaalia', 'Dropbox: il mazzo è stato caricato');
  ok(JSON.parse(dbx.file).decks[0].cards.length === 79, 'con tutte le sue carte');
  await A.shot('s3-collegato');

  /* i token non finiscono nel backup */
  await A.page.click('[data-a="copy-json"]').catch(() => {});
  const backup = await A.page.evaluate(() => { try { return window.CPAHost && JSON.stringify(window.CPAHost.decks()); } catch (e) { return ''; } });
  ok(backup && !/RT1|AT1|tokens/.test(backup), 'i token non sono nei dati dei mazzi');
  ok(!/RT1|AT1/.test(dbx.file), 'né nel file sul cloud');

  /* ----- telefono: stessa cosa, dispositivo nuovo ----- */
  const B = await device('telefono', { width: 390, height: 844 });
  await B.nav('data');
  await B.page.fill('[data-c="sync-key"][data-k="dropbox"]', 'KEY'); await B.page.press('[data-c="sync-key"][data-k="dropbox"]', 'Tab');
  await B.page.click('[data-a="sync-dbx"]'); await B.page.fill('[data-c="sync-code"]', 'GOODCODE'); await B.page.click('[data-a="sync-dbx-ok"]');
  await B.page.waitForFunction(() => /Collegato a Dropbox/.test(document.querySelector('#syncp').textContent), null, { timeout: 15000 });
  await B.page.waitForFunction(() => /1 mazzo nuovo/.test(document.body.textContent) || document.querySelector('#toast') && /Sincronizzato/.test(document.querySelector('#toast').textContent), null, { timeout: 15000 });
  ok((await B.deckNames()).join() === 'Kaalia', 'telefono: il mazzo è arrivato');
  await B.nav('archive');
  await B.page.waitForFunction(() => /79 carte diverse/.test(document.body.textContent));
  ok(true, 'e l\'archivio è lo stesso (79 carte diverse)');
  await B.nav('data'); await B.shot('s4-telefono');

  /* modifica sul telefono: parte da sola (sincronizzazione automatica) */
  await B.nav('decks');
  await B.page.click('[data-a="open-deck"]');
  await B.page.fill('[data-c="deck-name"]', 'Kaalia (telefono)'); await B.page.press('[data-c="deck-name"]', 'Tab');
  await B.page.waitForFunction(() => true);
  const t0 = Date.now();
  while (Date.now() - t0 < 8000 && JSON.parse(dbx.file).decks[0].name !== 'Kaalia (telefono)') await B.page.waitForTimeout(150);
  ok(JSON.parse(dbx.file).decks[0].name === 'Kaalia (telefono)', 'la modifica sul telefono è partita da sola verso Dropbox');

  /* il PC la riceve con «Sincronizza ora» */
  await A.nav('data');
  await A.page.click('[data-a="sync-now"]');
  await A.page.waitForFunction(() => document.querySelector('#toast') && /mazzo aggiornato/.test(document.querySelector('#toast').textContent), null, { timeout: 15000 });
  ok((await A.deckNames()).join() === 'Kaalia (telefono)', 'PC: nome aggiornato');

  /* nuovo mazzo sul PC e cancellazione sul telefono */
  await A.importDeck('moxfield.txt', 'Gemello');
  const t1 = Date.now();
  while (Date.now() - t1 < 8000 && JSON.parse(dbx.file).decks.length < 2) await A.page.waitForTimeout(150);
  ok(JSON.parse(dbx.file).decks.length === 2, 'mazzo nuovo caricato da solo');
  await B.nav('data'); await B.page.click('[data-a="sync-now"]');
  await B.page.waitForFunction(() => document.querySelector('#toast') && /mazzo nuovo/.test(document.querySelector('#toast').textContent), null, { timeout: 15000 });
  ok((await B.deckNames()).sort().join() === 'Gemello,Kaalia (telefono)', 'telefono: due mazzi');
  await B.page.locator('[data-a="open-deck"]').first().click();
  await B.page.click('[data-a="del-deck"]'); await B.page.click('[data-a="del-deck"]');
  await B.page.waitForFunction(() => /Mazzi/.test(document.querySelector('h1').textContent));
  const t2 = Date.now();
  while (Date.now() - t2 < 8000 && Object.keys(JSON.parse(dbx.file).tombs || {}).length === 0) await B.page.waitForTimeout(150);
  ok(Object.keys(JSON.parse(dbx.file).tombs).length === 1 && JSON.parse(dbx.file).decks.length === 1, 'cancellazione: lapide nel file');
  await A.nav('data'); await A.page.click('[data-a="sync-now"]');
  await A.page.waitForFunction(() => document.querySelector('#toast') && /eliminato/.test(document.querySelector('#toast').textContent), null, { timeout: 15000 });
  ok((await A.deckNames()).length === 1, 'PC: il mazzo cancellato sul telefono sparisce');

  /* scollegare: conferma, e i dati restano */
  await A.nav('data');
  await A.page.click('[data-a="sync-unlink"]');
  ok(/Conferma: scollega/.test(await A.page.locator('[data-a="sync-unlink"]').textContent()), 'scollegare chiede conferma');
  await A.page.click('[data-a="sync-unlink"]');
  await A.page.waitForSelector('[data-a="sync-dbx"]');
  ok((await A.deckNames()).length === 1, 'i mazzi restano dopo lo scollegamento');
  await A.nav('data');
  ok(await A.page.locator('[data-a="sync-dbx"]').isEnabled(), 'le chiavi restano: si può ricollegare');

  /* ----- Google Drive: codice sul sito di Google ----- */
  const G = await device('google');
  await G.importDeck('moxfield.txt', 'Gemello');
  await G.nav('data');
  await G.page.fill('[data-c="sync-key"][data-k="googleId"]', 'GID'); await G.page.press('[data-c="sync-key"][data-k="googleId"]', 'Tab');
  await G.page.fill('[data-c="sync-key"][data-k="googleSecret"]', 'GSEC'); await G.page.press('[data-c="sync-key"][data-k="googleSecret"]', 'Tab');
  await G.page.waitForSelector('[data-a="sync-ggl"]:not([disabled])');
  await G.page.click('[data-a="sync-ggl"]');
  await G.page.waitForSelector('.usercode');
  ok((await G.page.locator('.usercode').textContent()) === 'ABCD-EFGH', 'codice da digitare: ABCD-EFGH');
  ok(/google\.com\/device/.test(await G.syncText()), 'indirizzo su cui digitarlo');
  await G.shot('s5-google-codice');
  await G.page.waitForFunction(() => /Collegato a Google Drive/.test(document.querySelector('#syncp').textContent), null, { timeout: 20000 });
  await G.page.waitForFunction(() => /ultima sincronizzazione: (oggi|\d)/.test(document.querySelector('#syncp').textContent), null, { timeout: 15000 });
  ok(ggl.id === 'F1' && JSON.parse(ggl.file).decks[0].name === 'Gemello', 'Drive: file creato con il mazzo');

  ok(errors.length === 0, 'nessun errore in console: ' + errors.join(' | '));
  await browser.close(); srv.close();
  console.log('sync-smoke: ' + n + ' controlli ok');
})().catch(e => { console.error(e); process.exit(1); });
