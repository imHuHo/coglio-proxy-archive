/* Prova in Chromium vero del Codighel ID, con il server di Supabase sostituito da un Postgres vero (PGlite) che esegue supabase/schema.sql.
 * Uso: node tools/community-smoke.js <cartella di @electric-sql/pglite>   (SHOTS=cartella, DARK=1, VP=390x844) */
const path = require('path'), fs = require('fs'), http = require('http'), assert = require('assert');
const { chromium } = require('playwright');
const dir = process.argv[2]; if (!dir) { console.error('serve la cartella di @electric-sql/pglite'); process.exit(2); }
const { PGlite } = require(path.resolve(dir));
const WEB = path.join(__dirname, '..', 'web');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/json', '.woff2': 'font/woff2', '.json': 'application/json' };
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); }; const eq = (a, b, m) => { n++; assert.deepStrictEqual(a, b, m); };
const SHOTS = process.env.SHOTS || '';
const ART = i => 'https://cards.scryfall.io/art_crop/front/' + i + '/' + i + '/0000000' + i + '-aaaa-bbbb-cccc-1234567890ab.jpg?15629034' + i + i;
const CARDS = { data: [{ name: 'Kaalia of the Vast', set: 'cmd', artist: 'Jason Chan', image_uris: { art_crop: ART(1) } }, { name: 'Kaalia of the Vast', set: 'cm2', artist: 'Aleksi Briclot', image_uris: { art_crop: ART(2) } }, { name: 'Kaalia, Zenith Seeker', set: 'cmr', artist: 'Magali Villeneuve', card_faces: [{ name: 'Kaalia, Zenith Seeker', image_uris: { art_crop: ART(3) } }, {}] }] };
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 626 457"><rect width="626" height="457" fill="#2d5fae"/><circle cx="313" cy="228" r="120" fill="#f7c52d"/></svg>';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, GET, OPTIONS' };

(async () => {
  /* il «Supabase» di prova: le stesse funzioni, lo stesso SQL, gli stessi permessi dell'anon */
  const db = new PGlite();
  await db.exec("create role anon nologin; create role authenticated nologin; grant usage on schema public to anon, authenticated;");
  await db.exec(fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8')); await db.exec('set role anon');
  const count = async () => { await db.exec('reset role'); const c = (await db.query('select count(*)::int c from public.cpa_profiles')).rows[0].c; await db.exec('set role anon'); return c; };
  const rpcLog = [];
  const rpc = async route => {
    const rq = route.request();
    if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const fn = rq.url().split('/rpc/')[1], body = JSON.parse(rq.postData() || '{}'), k = Object.keys(body); rpcLog.push(fn);
    if (!/^cpa_[a-z_]+$/.test(fn)) return route.fulfill({ status: 404, headers: CORS, body: '{}' });
    try {
      const r = await db.query('select public.' + fn + '(' + k.map((x, i) => x + ' => $' + (i + 1)).join(', ') + ') as r', k.map(x => body[x]));
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(r.rows[0].r) });
    } catch (e) { return route.fulfill({ status: 400, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ code: e.code || 'P0001', message: e.message }) }); }
  };

  const srv = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/index.html';
    const f = path.join(WEB, p); if (!f.startsWith(WEB) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
  }).listen(0);
  const base = 'http://localhost:' + srv.address().port + '/';
  const browser = await chromium.launch();
  const vp = (process.env.VP || '1280x900').split('x').map(Number);
  const errors = [];
  async function device(configured) {
    const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, colorScheme: process.env.DARK ? 'dark' : 'light', permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) errors.push(m.text()); });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort());
    await ctx.route('https://api.scryfall.com/cards/search**', r => r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(CARDS) }));
    await ctx.route('https://cards.scryfall.io/**', r => r.fulfill({ status: 200, headers: { 'content-type': 'image/svg+xml' }, body: SVG }));
    if (!configured) await ctx.route('**/community-config.js', r => r.fulfill({ status: 200, headers: { 'content-type': 'text/javascript' }, body: "window.CPA_COMMUNITY = { url: '', key: '' };" }));
    if (configured) {
      await ctx.route('**/community-config.js', r => r.fulfill({ status: 200, headers: { 'content-type': 'text/javascript' }, body: "window.CPA_COMMUNITY = { url: 'https://test.supabase.co', key: 'anon-key-for-tests-0123456789' };" }));
      await ctx.route('https://test.supabase.co/**', rpc);
    }
    await ctx.route(url => !/localhost|test\.supabase\.co|scryfall|cards\.scryfall/.test(url.href) && url.protocol === 'https:', r => r.abort());
    await page.goto(base); await page.waitForSelector('.shell');
    await page.locator('[data-a="nav"][data-v="data"]:visible').first().click(); await page.waitForSelector('#cm');
    return { ctx, page };
  }
  const shotOf = page => async name => { if (SHOTS) { await page.waitForTimeout(300); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };

  /* senza configurazione: il pannello lo dice e non chiama nessuno */
  { const d = await device(false); ok(/non sono ancora attive/.test(await d.page.textContent('#cm')) && await d.page.locator('#cm [data-a="cm-create"]').count() === 0, 'non configurato: solo un avviso'); await d.ctx.close(); }

  /* primo dispositivo: creo il mio ID */
  const A = await device(true), pa = A.page, shotA = shotOf(pa);
  ok(await pa.locator('#cm #cm-handle').count() === 1 && await pa.locator('#cm [data-a="cm-login-open"]').count() === 1, 'pannello di creazione');
  await shotA('community-join');
  await pa.fill('#cm-handle', 'ab'); ok(/Almeno 3/.test(await pa.textContent('#cm-st')) && await pa.getAttribute('#cm-st', 'class') === 'hint cm-st bad', 'ID troppo corto');
  await pa.fill('#cm-handle', 'ha spazi'); ok(/Solo lettere/.test(await pa.textContent('#cm-st')), 'ID con spazi');
  await pa.fill('#cm-handle', 'admin'); await pa.waitForFunction(() => /già preso/.test(document.getElementById('cm-st').textContent)); ok(true, 'ID riservato: già preso');
  await pa.fill('#cm-handle', 'Simone'); await pa.waitForFunction(() => /» è libero\./.test(document.getElementById('cm-st').textContent)); ok(await pa.getAttribute('#cm-st', 'class') === 'hint cm-st ok', 'ID libero: ' + await pa.getAttribute('#cm-st', 'class'));
  /* immagine */
  await pa.click('#cm .cm-pick'); await pa.waitForSelector('#cm-pop #cm-q'); ok(await pa.evaluate(() => document.activeElement.id) === 'cm-q', 'il campo di ricerca ha il fuoco');
  await pa.fill('#cm-q', 'k'); await pa.click('#cm-pop [data-a="cm-search"]'); ok(/almeno due lettere/.test(await pa.textContent('#cm-pop .an-none')), 'ricerca troppo corta');
  await pa.fill('#cm-q', 'kaalia'); await pa.keyboard.press('Enter'); await pa.waitForSelector('#cm-pop .cm-art');
  ok(await pa.locator('#cm-pop .cm-art').count() === 3, 'tre artwork (anche la carta a due facce)'); ok(/CMR/.test(await pa.textContent('#cm-pop .cm-art:nth-child(3) small')), 'set e artista indicati');
  await pa.waitForFunction(() => [...document.querySelectorAll('#cm-pop .cm-art img')].every(i => i.complete && i.naturalWidth > 0)); await shotA('community-art');
  await pa.click('#cm-pop .cm-art:nth-child(2)'); ok(await pa.locator('#cm-pop').count() === 0, 'scelto: il pop-up si chiude');
  ok(/Kaalia of the Vast/.test(await pa.textContent('#cm .cm-pick')) && await pa.locator('#cm .cm-pick img').count() === 1, 'l\'immagine scelta è nel pannello');
  ok(await pa.inputValue('#cm-handle') === 'Simone', 'l\'ID scritto non si perde scegliendo l\'immagine');
  /* creo */
  await pa.click('#cm [data-a="cm-create"]'); await pa.waitForSelector('#cm-pop #cm-code');
  const code = await pa.textContent('#cm-code'); ok(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/.test(code), 'codice di recupero in gruppi da 5: ' + code);
  ok(/Non c’è modo di recuperarlo/.test(await pa.textContent('#cm-pop .cm-warn')), 'avviso chiaro'); await shotA('community-code');
  await pa.click('#cm-pop [data-a="cm-copy"]'); ok((await pa.evaluate(() => navigator.clipboard.readText())) === code, 'copia negli appunti');
  const dl = pa.waitForEvent('download'); await pa.click('#cm-pop [data-a="cm-dl"]'); const dlf = await dl; const txt = fs.readFileSync(await dlf.path(), 'utf8');
  ok(/ID: Simone/.test(txt) && txt.indexOf(code) >= 0 && /codighel-id-Simone\.txt/.test(dlf.suggestedFilename()), 'file scaricato con ID e codice');
  await pa.keyboard.press('Escape'); ok(await pa.locator('#cm-pop').count() === 0, 'Esc chiude il pop-up');
  ok(/@Simone/.test(await pa.textContent('#cm .cm-h')) && await pa.locator('#cm .cm-me img.cm-av').count() === 1, 'profilo con ID e immagine'); ok(await count() === 1, 'una riga sul server');
  await shotA('community-me');
  ok(await pa.evaluate(() => { const o = JSON.parse(localStorage.getItem('cpa:community:v1')); return o.handle === 'Simone' && o.secret.length === 20; }), 'il profilo sta sul dispositivo');
  /* il codice non finisce nei backup */
  await pa.click('[data-a="copy-json"]'); await pa.waitForFunction(() => /Backup copiato/.test(document.body.textContent)); const bk = await pa.evaluate(() => navigator.clipboard.readText()); ok(bk.length > 10 && bk.indexOf(code.replace(/-/g, '')) < 0 && bk.indexOf('Simone') < 0 && bk.indexOf('community') < 0, 'il backup non contiene né il codice né il profilo');
  /* lo stesso ID non si può creare due volte; il codice si rivede */
  await pa.click('#cm [data-a="cm-code"]'); await pa.waitForSelector('#cm-code'); ok(await pa.textContent('#cm-code') === code, 'il codice si può rivedere'); ok(/Da conservare/.test(await pa.textContent('#cm-pop .an-head small')), 'senza il «profilo creato» di prima'); await pa.keyboard.press('Escape');

  /* secondo dispositivo: entro con ID e codice scritti come capita */
  const B = await device(true), pb = B.page, shotB = shotOf(pb);
  ok(await pb.locator('#cm #cm-handle').count() === 1, 'dispositivo nuovo: nessun profilo');
  await pb.click('#cm [data-a="cm-login-open"]'); await pb.waitForSelector('#cm-lh');
  await pb.fill('#cm-lh', 'simone'); await pb.fill('#cm-lc', 'abc'); await pb.click('#cm-pop [data-a="cm-login"]'); ok(/20 caratteri/.test(await pb.textContent('#cm-pop .err')), 'codice troppo corto');
  const wrong = code.replace(/^./, c => c === 'A' ? 'B' : 'A'); await pb.fill('#cm-lc', wrong); await pb.click('#cm-pop [data-a="cm-login"]'); await pb.waitForFunction(() => /sbagliati/.test((document.querySelector('#cm-pop .err') || {}).textContent || ''));
  ok(await pb.inputValue('#cm-lh') === 'simone' && await pb.inputValue('#cm-lc') === wrong, 'dopo l\'errore i campi restano compilati'); await shotB('community-login');
  await pb.fill('#cm-lc', ' ' + code.toLowerCase().replace(/-/g, ' ') + ' '); await pb.keyboard.press('Enter'); await pb.waitForSelector('#cm .cm-me');
  ok(/@Simone/.test(await pb.textContent('#cm .cm-h')) && await pb.locator('#cm .cm-me img.cm-av').count() === 1 && await pb.locator('#cm-pop').count() === 0, 'entrato: ID con le maiuscole giuste e la sua immagine');
  /* cambio immagine e ID dal secondo dispositivo */
  await pb.click('#cm [data-a="cm-art"]'); await pb.fill('#cm-q', 'kaalia'); await pb.click('#cm-pop [data-a="cm-search"]'); await pb.waitForSelector('#cm-pop .cm-art'); await pb.click('#cm-pop .cm-art:nth-child(1)'); await pb.waitForSelector('#cm-pop', { state: 'detached' }); ok(true, 'immagine cambiata');
  await pb.click('#cm [data-a="cm-rename-open"]'); await pb.waitForSelector('#cm-nh'); ok(await pb.inputValue('#cm-nh') === 'Simone', 'il campo parte dall\'ID attuale');
  await pb.fill('#cm-nh', 'admin'); await pb.click('#cm-pop [data-a="cm-rename"]'); await pb.waitForFunction(() => /già preso/.test((document.querySelector('#cm-pop .err') || {}).textContent || '')); ok(true, 'ID riservato rifiutato');
  await pb.fill('#cm-nh', 'no!'); await pb.click('#cm-pop [data-a="cm-rename"]'); ok(/Solo lettere/.test(await pb.textContent('#cm-pop .err')), 'ID non valido rifiutato');
  await pb.fill('#cm-nh', 'Simo'); await pb.keyboard.press('Enter'); await pb.waitForSelector('#cm-pop', { state: 'detached' }); ok(/@Simo$/.test(await pb.textContent('#cm .cm-h')), 'ID cambiato');
  /* il primo dispositivo, riaprendo Dati, scopre che il suo ID è cambiato altrove */
  await pa.reload(); await pa.waitForSelector('.shell'); await pa.locator('[data-a="nav"][data-v="data"]:visible').first().click(); await pa.waitForSelector('#cm .cm-me');
  await pa.waitForSelector('#cm .err'); ok(/non risulta più sul server/.test(await pa.textContent('#cm .err')), 'avviso: profilo non trovato (ID cambiato altrove)');
  /* esco e rientro con il nuovo ID: l'immagine nuova arriva */
  await pa.click('#cm [data-a="cm-logout"]'); ok(/Sicuro/.test(await pa.textContent('#cm [data-a="cm-logout"]')) && await pa.locator('#cm .cm-me').count() === 1, 'uscire chiede conferma');
  await pa.click('#cm [data-a="cm-logout"]'); ok(await pa.locator('#cm #cm-handle').count() === 1 && await pa.evaluate(() => localStorage.getItem('cpa:community:v1') === null), 'uscito: sul dispositivo non resta niente');
  ok(await count() === 1, 'ma il profilo resta sul server');
  await pa.click('#cm [data-a="cm-login-open"]'); await pa.fill('#cm-lh', 'SIMO'); await pa.fill('#cm-lc', code); await pa.click('#cm-pop [data-a="cm-login"]'); await pa.waitForSelector('#cm .cm-me'); ok(/@Simo$/.test(await pa.textContent('#cm .cm-h')), 'rientro con il nuovo ID e lo stesso codice');
  /* non ci si può prendere l'ID di un altro */
  const C2 = await device(true), pc = C2.page; await pc.fill('#cm-handle', 'SIMO'); await pc.waitForFunction(() => /già preso/.test(document.getElementById('cm-st').textContent)); await pc.click('#cm [data-a="cm-create"]'); await pc.waitForFunction(() => /già preso/.test(document.getElementById('cm-st').textContent) && !document.getElementById('cm-pop')); ok(await count() === 1, 'doppione rifiutato dal server, nessuna riga in più');
  /* eliminare il profilo */
  await pb.reload(); await pb.waitForSelector('.shell'); await pb.locator('[data-a="nav"][data-v="data"]:visible').first().click(); await pb.waitForSelector('#cm .cm-me');
  await pb.click('#cm [data-a="cm-del"]'); ok(await count() === 1, 'una pressione sola non elimina'); await pb.click('#cm [data-a="cm-del"]'); await pb.waitForSelector('#cm #cm-handle'); ok(await count() === 0, 'profilo eliminato dal server'); ok(await pb.evaluate(() => localStorage.getItem('cpa:community:v1') === null), 'e dal dispositivo');
  await pc.fill('#cm-handle', 'Simo'); await pc.waitForFunction(() => /» è libero\./.test(document.getElementById('cm-st').textContent)); ok(true, 'l\'ID eliminato torna libero');
  ok(rpcLog.every(f => /^cpa_/.test(f)) && rpcLog.length > 10, 'tutte le chiamate sono funzioni cpa_*: ' + rpcLog.length);


  /* ----- amici ----- */
  const createId = async (pg, handle) => { await pg.fill('#cm-handle', handle); await pg.click('#cm [data-a="cm-create"]'); await pg.waitForSelector('#cm-pop #cm-code'); const c = await pg.textContent('#cm-code'); await pg.keyboard.press('Escape'); await pg.waitForSelector('#cm .cm-me'); return c; };
  const openLink = async (ctx, hash) => { const pg = await ctx.newPage(); pg.on('pageerror', e => errors.push(e.message)); await pg.goto(base + hash); await pg.waitForSelector('.shell'); return pg; };
  const lis = (pg, sec) => pg.evaluate(k => { const h = [...document.querySelectorAll('#cm .cm-sub2')].find(x => x.textContent.indexOf(k) === 0); const u = h && h.nextElementSibling; return u && u.tagName === 'UL' ? [...u.querySelectorAll('li b')].map(b => b.textContent) : []; }, sec);
  const refresh = async pg => { await pg.click('#cm [data-a="cm-frefresh"]'); await pg.waitForFunction(() => !document.querySelector('#cm [data-a="cm-frefresh"][disabled]')); };
  const D1 = await device(true), p1 = D1.page, D2 = await device(true), p2 = D2.page;
  const codeAnna = await createId(p1, 'Anna'); await createId(p2, 'Bruno');
  await p1.waitForSelector('#cm .cm-sub:has-text("Amici")'); ok(/Ancora nessun amico/.test(await p1.textContent('#cm')), 'all\'inizio nessun amico');
  await shotOf(p1)('community-friends-empty');
  /* chiedere l'amicizia per ID */
  await p2.fill('#cm-add', 'x'); await p2.click('#cm [data-a="cm-fadd"]'); ok(/Almeno 3/.test(await p2.textContent('#cm .err')), 'ID troppo corto');
  await p2.fill('#cm-add', 'Nessuno'); await p2.keyboard.press('Enter'); await p2.waitForFunction(() => /Non esiste nessun Codighel ID/.test((document.querySelector('#cm .err') || {}).textContent || '')); ok(true, 'ID che non esiste');
  await p2.fill('#cm-add', 'bruno'); await p2.click('#cm [data-a="cm-fadd"]'); await p2.waitForFunction(() => /Questo è il tuo ID/.test((document.querySelector('#cm .err') || {}).textContent || '')); ok(true, 'non puoi aggiungere te stesso');
  await p2.fill('#cm-add', 'anna'); await p2.click('#cm [data-a="cm-fadd"]'); await p2.waitForFunction(() => /Richiesta inviata a @anna/.test((document.querySelector('#cm .cm-st.ok') || {}).textContent || ''));
  ok(await p2.inputValue('#cm-add') === '', 'il campo si svuota'); await p2.waitForFunction(() => /Richieste inviate/.test(document.getElementById('cm').textContent)); eq(await lis(p2, 'Richieste inviate'), ['@Anna'], 'Bruno vede la richiesta inviata (con l\'ID scritto bene)');
  /* ...e Anna la riceve */
  await refresh(p1); eq(await lis(p1, 'Richieste ricevute'), ['@Bruno'], 'Anna vede la richiesta di Bruno'); await shotOf(p1)('community-friends-incoming');
  await p1.click('#cm [data-a="cm-facc"][data-h="Bruno"]'); await p1.waitForFunction(() => /siete amici/.test((document.querySelector('#cm .cm-st.ok') || {}).textContent || ''));
  await p1.waitForFunction(() => /I tuoi amici \(1\)/.test(document.getElementById('cm').textContent)); eq([await lis(p1, 'I tuoi amici'), await lis(p1, 'Richieste ricevute')], [['@Bruno'], []], 'Anna: Bruno è amico, la richiesta è chiusa');
  await refresh(p2); eq([await lis(p2, 'I tuoi amici'), await lis(p2, 'Richieste inviate')], [['@Anna'], []], 'Bruno: Anna è amica'); await shotOf(p2)('community-friends');
  /* togliere un amico chiede conferma */
  await p2.click('#cm [data-a="cm-frm"][data-h="Anna"]'); ok(/Sicuro/.test(await p2.textContent('#cm [data-a="cm-frm"]')) && (await lis(p2, 'I tuoi amici')).length === 1, 'togliere chiede conferma');
  await p2.click('#cm [data-a="cm-frm"][data-h="Anna"]'); await p2.waitForFunction(() => /non è più tra i tuoi amici/.test(document.getElementById('cm').textContent)); eq(await lis(p2, 'I tuoi amici'), [], 'tolto'); await refresh(p1); eq(await lis(p1, 'I tuoi amici'), [], 'e non lo è più nemmeno per Anna');
  /* il link */
  const LINK = 'https://imHuHo.github.io/coglio-proxy-archive/#amico=Anna';
  ok(await p1.locator('#cm [data-a="cm-link"]').count() === 0 && /Copia il mio link/.test(await p1.textContent('#cm [data-a="cm-share"]')), 'un solo pulsante: senza menu di condivisione del sistema dice «Copia il mio link»'); await p1.click('#cm [data-a="cm-share"]'); await p1.waitForFunction(() => /Link copiato/.test(document.body.textContent)); ok((await p1.evaluate(() => navigator.clipboard.readText())) === LINK, 'il link copiato porta al mio ID');
  await p1.evaluate(() => navigator.clipboard.writeText('x')); await p1.click('#cm [data-a="cm-share"]'); await p1.waitForFunction(() => navigator.clipboard.readText().then(t => t.indexOf('#amico=Anna') > 0)); ok(true, 'ripremuto: copia di nuovo il link');
  /* chi apre il link con un profilo: gli propongo di aggiungere Anna */
  const l2 = await openLink(D2.ctx, '#amico=Anna'); await l2.waitForSelector('#cm-pop .cm-me');
  ok(/@Anna/.test(await l2.textContent('#cm-pop .cm-h')) && /Vuoi aggiungere/.test(await l2.textContent('#cm-pop')), 'invito: «Vuoi aggiungere @Anna»'); ok(await l2.evaluate(() => location.hash === '' && document.querySelector('.nav.on, [data-a="nav"][aria-current], [data-a="nav"].on') !== null), 'il link porta in Dati e si pulisce l\'indirizzo'); await shotOf(l2)('community-invite');
  await l2.click('#cm-pop [data-a="cm-iadd"]'); await l2.waitForFunction(() => /Richiesta inviata a @Anna/.test((document.querySelector('#cm-pop .cm-st') || {}).textContent || '')); await l2.click('#cm-pop [data-a="cm-close"]');
  await refresh(p1); eq(await lis(p1, 'Richieste ricevute'), ['@Bruno'], 'Anna ha di nuovo la richiesta di Bruno'); await l2.close();
  /* link al proprio ID, a un ID che non esiste, rotto */
  const l3 = await openLink(D1.ctx, '#amico=anna'); await l3.waitForSelector('#cm-pop'); ok(/stesso link/.test(await l3.textContent('#cm-pop')), 'il proprio link: «è il tuo stesso link»'); await l3.close();
  const l4 = await openLink(D1.ctx, '#amico=Nessuno'); await l4.waitForSelector('#cm-pop .an-none'); ok(/Non esiste nessun Codighel ID/.test(await l4.textContent('#cm-pop')), 'link a un ID che non esiste'); await l4.close();
  const l5 = await openLink(D1.ctx, '#amico=%3Cx%3E'); await l5.waitForTimeout(800); ok(await l5.locator('#cm-pop').count() === 0, 'link con un ID non valido: niente invito'); await l5.close();
  /* chi non ha ancora un ID: lo crea e la richiesta parte da sola */
  const D3 = await (async () => { const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, colorScheme: process.env.DARK ? 'dark' : 'light' }); const pg = await ctx.newPage(); pg.on('pageerror', e => errors.push(e.message)); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort()); await ctx.route('https://api.scryfall.com/**', r => r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(CARDS) })); await ctx.route('https://cards.scryfall.io/**', r => r.fulfill({ status: 200, headers: { 'content-type': 'image/svg+xml' }, body: SVG }));
    await ctx.route('**/community-config.js', r => r.fulfill({ status: 200, headers: { 'content-type': 'text/javascript' }, body: "window.CPA_COMMUNITY = { url: 'https://test.supabase.co', key: 'sb_publishable_testkey0123456789' };" })); await ctx.route('https://test.supabase.co/**', rpc); await ctx.route(url => url.protocol === 'https:' && !/test\.supabase\.co|scryfall/.test(url.href), r => r.abort());
    await pg.goto(base + '#amico=Anna'); await pg.waitForSelector('#cm-pop'); return { ctx, pg }; })();
  const p3 = D3.pg; ok(/ti serve un Codighel ID/.test(await p3.textContent('#cm-pop')) && await p3.locator('#cm-pop [data-a="cm-icreate"]').count() === 1, 'senza ID: «ti serve un Codighel ID»'); await shotOf(p3)('community-invite-new');
  await p3.click('#cm-pop [data-a="cm-icreate"]'); ok(await p3.locator('#cm-pop').count() === 0 && await p3.evaluate(() => document.activeElement.id) === 'cm-handle', 'si va al campo dell\'ID');
  await createId(p3, 'Carla'); await p3.waitForFunction(() => /Richiesta inviata a @Anna/.test(document.body.textContent)); await p3.waitForFunction(() => /Richieste inviate/.test(document.getElementById('cm').textContent)); eq(await lis(p3, 'Richieste inviate'), ['@Anna'], 'creato l\'ID, la richiesta ad Anna è partita da sola');
  await refresh(p1); eq(await lis(p1, 'Richieste ricevute'), ['@Bruno', '@Carla'], 'Anna ha due richieste'); await p1.click('#cm [data-a="cm-frej"][data-h="Bruno"]'); await p1.waitForFunction(() => /rifiutata/.test(document.getElementById('cm').textContent)); eq(await lis(p1, 'Richieste ricevute'), ['@Carla'], 'rifiutata quella di Bruno');
  await refresh(p2); eq(await lis(p2, 'Richieste inviate'), [], 'Bruno non la vede più tra le inviate (rifiutata)');
  /* annullare una richiesta inviata */
  await p2.fill('#cm-add', 'Carla'); await p2.click('#cm [data-a="cm-fadd"]'); await p2.waitForFunction(() => /Richiesta inviata/.test((document.querySelector('#cm .cm-st.ok') || {}).textContent || '')); await p2.waitForFunction(() => document.querySelector('#cm [data-a="cm-fcancel"]'));
  await p2.click('#cm [data-a="cm-fcancel"]'); await p2.waitForFunction(() => /annullata/.test(document.getElementById('cm').textContent)); eq(await lis(p2, 'Richieste inviate'), [], 'richiesta annullata');
  /* esco e rientro: l'elenco amici si ricarica */
  await p1.click('#cm [data-a="cm-facc"][data-h="Carla"]'); await p1.waitForFunction(() => /siete amici/.test(document.getElementById('cm').textContent));
  await p1.click('#cm [data-a="cm-logout"]'); await p1.click('#cm [data-a="cm-logout"]'); await p1.waitForSelector('#cm #cm-handle'); ok(!/Amici/.test(await p1.textContent('#cm')), 'uscito: niente elenco amici');
  await p1.click('#cm [data-a="cm-login-open"]'); await p1.fill('#cm-lh', 'anna'); await p1.fill('#cm-lc', codeAnna); await p1.click('#cm-pop [data-a="cm-login"]'); await p1.waitForSelector('#cm .cm-me'); await p1.waitForFunction(() => /I tuoi amici \(1\)/.test(document.getElementById('cm').textContent)); eq(await lis(p1, 'I tuoi amici'), ['@Carla'], 'rientrata, ritrovo Carla tra gli amici');
  /* eliminare il profilo porta via le amicizie */
  await p3.click('#cm [data-a="cm-frefresh"]'); await p3.waitForFunction(() => /I tuoi amici \(1\)/.test(document.getElementById('cm').textContent)); await p1.click('#cm [data-a="cm-del"]'); await p1.click('#cm [data-a="cm-del"]'); await p1.waitForSelector('#cm #cm-handle');
  await refresh(p3); eq(await lis(p3, 'I tuoi amici'), [], 'Anna eliminata: sparisce anche dagli amici di Carla');

  /* senza rete: errore comprensibile, niente blocchi */
  const D = await device(true), pd = D.page; await D.ctx.route('https://test.supabase.co/**', r => r.abort());
  await pd.fill('#cm-handle', 'Offline1'); await pd.click('#cm [data-a="cm-create"]'); await pd.waitForSelector('#cm .err'); ok(/Non riesco a raggiungere il server/.test(await pd.textContent('#cm .err')) && await pd.locator('#cm [data-a="cm-create"]:not([disabled])').count() === 1, 'senza rete: messaggio e si può riprovare');

  ok(await pa.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'nessuno scorrimento orizzontale');
  ok(!errors.length, 'nessun errore in pagina: ' + errors.join(' | '));
  console.log('community-smoke: ' + n + ' controlli ok');
  await browser.close(); srv.close(); await db.close();
})().catch(e => { console.error(e); process.exit(1); });
