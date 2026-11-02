/* Prova in Chromium vero dei tavoli condivisi del Pescher: due dispositivi (Elena e Fabio), amicizia, tavolo con amici, partite e classifica sincronizzate,
 * coda offline, cambio ID, lasciare/eliminare il tavolo, condividere un tavolo locale. Il server è un Postgres vero (PGlite) con supabase/schema.sql.
 * Uso: node tools/shared-smoke.js <cartella di @electric-sql/pglite>   (SHOTS=cartella, DARK=1, VP=390x844) */
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


  const createId = async (pg, handle) => { await pg.fill('#cm-handle', handle); await pg.click('#cm [data-a="cm-create"]'); await pg.waitForSelector('#cm-pop #cm-code'); const c = await pg.textContent('#cm-code'); await pg.keyboard.press('Escape'); await pg.waitForSelector('#cm .cm-me'); return c; };
  const nav = (pg, v) => pg.locator('[data-a="nav"][data-v="' + v + '"]:visible').first().click();
  const sc = async (pg, name) => { if (SHOTS) { await pg.waitForTimeout(300); await pg.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
  const A = await device(true), pa = A.page, B = await device(true), pb = B.page;
  await createId(pa, 'Elena'); await createId(pb, 'Fabio');

  /* senza amici: il Pescher funziona come prima, con l'icona per sedere un amico */
  await nav(pa, 'pescher'); await pa.waitForSelector('#pe .pe-setup');
  ok(await pa.locator('.pe-seat .pe-pick').count() === 4, 'con un ID, ogni posto ha l\'icona amici');
  await pa.click('.pe-seat:nth-child(2) .pe-pick'); await pa.waitForSelector('#pe-pop .pe-pf'); ok(/Non hai ancora amici/.test(await pa.textContent('#pe-pop')), 'senza amici: lo dice'); ok(await pa.locator('#pe-pop .pe-pf').count() === 1 && /@Elena/.test(await pa.textContent('#pe-pop .pe-pf')), 'ma ci sono io');
  await pa.keyboard.press('Escape'); ok(await pa.locator('#pe-pop').count() === 0, 'Esc chiude');
  /* amicizia */
  await nav(pa, 'data'); await pa.waitForSelector('#cm .cm-me'); await pa.fill('#cm-add', 'Fabio'); await pa.click('#cm [data-a="cm-fadd"]'); await pa.waitForFunction(() => /Richiesta inviata a @Fabio/.test((document.querySelector('#cm .cm-st.ok') || {}).textContent || ''));
  await pb.click('#cm [data-a="cm-frefresh"]'); await pb.waitForSelector('#cm [data-a="cm-facc"][data-h="Elena"]'); await pb.click('#cm [data-a="cm-facc"][data-h="Elena"]'); await pb.waitForFunction(() => /siete amici/.test(document.getElementById('cm').textContent));
  await pa.click('#cm [data-a="cm-frefresh"]'); await pa.waitForFunction(() => /I tuoi amici \(1\)/.test(document.getElementById('cm').textContent));

  /* Elena siede se stessa e Fabio, poi salva e condivide il tavolo */
  await nav(pa, 'pescher'); await pa.waitForSelector('#pe .pe-setup');
  await pa.click('.pe-seat:nth-child(1) .pe-pick'); await pa.waitForSelector('#pe-pop .pe-pf[data-h="Fabio"]'); eq(await pa.locator('#pe-pop .pe-pf').count(), 2, 'io e un amico'); await sc(pa, 'shared-pick');
  await pa.click('#pe-pop .pe-pf[data-h="Elena"]'); ok(await pa.locator('#pe-pop').count() === 0 && await pa.inputValue('.pe-seat:nth-child(1) .pe-name') === 'Elena' && await pa.locator('.pe-seat:nth-child(1).fr').count() === 1, 'seduta Elena');
  await pa.click('.pe-seat:nth-child(2) .pe-pick'); await pa.waitForSelector('#pe-pop .pe-pf[data-h="Fabio"]'); ok(await pa.locator('#pe-pop .pe-pf[data-h="Elena"][disabled]').count() === 1, 'chi è già seduto non si può sedere due volte');
  await pa.click('#pe-pop .pe-pf[data-h="Fabio"]'); ok(await pa.inputValue('.pe-seat:nth-child(2) .pe-name') === 'Fabio' && await pa.locator('.pe-seat.fr').count() === 2, 'seduto Fabio');
  await pa.fill('.pe-seat:nth-child(3) .pe-name', 'Marta'); await pa.fill('.pe-seat:nth-child(4) .pe-name', 'Gino'); ok(await pa.locator('.pe-seat.fr').count() === 2, 'gli ospiti restano nomi liberi');
  await pa.fill('.pe-seat:nth-child(2) .pe-name', 'Fab'); ok(await pa.locator('.pe-seat:nth-child(2).fr').count() === 0, 'cambiare il nome a mano toglie l\'amico'); await pa.click('.pe-seat:nth-child(2) .pe-pick'); await pa.click('#pe-pop .pe-pf[data-h="Fabio"]'); ok(await pa.locator('.pe-seat.fr').count() === 2, 'rimesso');
  ok(await pa.locator('[data-a="pe-tcreate"]').count() === 1 && await pa.locator('[data-a="pe-tsave"]').count() === 1, 'con amici seduti: salva e condividi, oppure solo sul dispositivo');
  await pa.click('[data-a="pe-tcreate"]'); await pa.waitForSelector('.pe-tc.sh[aria-pressed="true"]'); ok(/Tavolo di Elena e Fabio/.test(await pa.textContent('.pe-tc.sh')) && await pa.locator('.err').count() === 0, 'senza nome scritto: il tavolo condiviso prende il nome di default ed è scelto');
  ok(await pa.locator('[data-a="pe-tdel"]').count() === 1 && await pa.locator('[data-a="pe-tleave"]').count() === 0 && /condiviso/.test(await pa.textContent('.pe-tnote')), 'è mio: posso eliminarlo'); await pa.waitForFunction(() => /Aggiornato alle/.test(document.querySelector('.pe-sst').textContent)); await sc(pa, 'shared-table-mine');
  eq(await pa.evaluate(() => JSON.parse(localStorage.getItem('cpa:pescher:v1')).players.map(p => !!p.u)), [true, true, false, false], 'i posti ricordano chi è amico');
  await db.exec('reset role'); eq((await db.query('select count(*)::int c from public.cpa_table_members')).rows[0].c, 2, 'sul server: due membri (io e Fabio)'); await db.exec('set role anon');

  /* Fabio lo vede da solo aprendo il Pescher */
  await nav(pb, 'pescher'); await pb.waitForSelector('#pe .pe-setup'); await pb.waitForSelector('.pe-tc.sh'); ok(/Tavolo di Elena e Fabio/.test(await pb.textContent('.pe-tc.sh')), 'Fabio vede il tavolo');
  await pb.click('.pe-tc.sh'); await pb.waitForFunction(() => /Tavolo di/.test(document.querySelector('.pe-towner') ? document.querySelector('.pe-towner').textContent : ''));
  eq(await pb.$$eval('.pe-seat .pe-name', e => e.map(x => x.value)), ['Elena', 'Fabio', 'Marta', 'Gino'], 'con i nomi e i posti di Elena'); ok(/@Elena/.test(await pb.textContent('.pe-towner')) && await pb.locator('[data-a="pe-tleave"]').count() === 1 && await pb.locator('[data-a="pe-tdel"]').count() === 0 && await pb.locator('[data-c="pe-tname"]').count() === 0, 'non è suo: può solo lasciarlo'); await sc(pb, 'shared-table-member');
  ok(await pb.locator('.pe-hsec .an-none').count() === 1, 'ancora nessuna partita');

  /* partite: Elena vince, poi Fabio */
  const play = async (pg, winner, deck, local) => { await pg.click('[data-a="pe-begin"]'); await pg.waitForSelector('.pe-grid'); await pg.click('[data-a="pe-end"]'); await pg.waitForSelector('#pe-pop .pe-wb'); await pg.click('#pe-pop .pe-wb[data-p="' + winner + '"]'); if (deck) await pg.fill('#pe-wdeck', deck); ok(/condivisa con gli amici/.test(await pg.textContent('#pe-pop .pe-tnote')) !== !!local, local ? 'tavolo del dispositivo: non condivisa' : 'si conta nella classifica condivisa'); await pg.click('[data-a="pe-endok"]'); await pg.waitForSelector('.pe-setup'); };
  await play(pa, 'p1', 'Kaalia'); await pa.waitForFunction(() => document.querySelectorAll('.pe-board li').length > 0 && !document.querySelector('.pe-pend'));
  eq(await pa.$$eval('.pe-board li', l => l.map(x => x.querySelector('b').textContent + ': ' + x.querySelector('.sc').textContent)), ['Elena: 1 vittoria su 1', 'Fabio: 0 vittorie su 1', 'Gino: 0 vittorie su 1', 'Marta: 0 vittorie su 1'], 'classifica di Elena'); ok(/Kaalia/.test(await pa.textContent('.pe-board li')), 'con il mazzo'); await sc(pa, 'shared-board');
  await pb.click('[data-a="pe-sync"]'); await pb.waitForFunction(() => document.querySelectorAll('.pe-board li').length === 4);
  eq(await pb.$$eval('.pe-board li b', l => l[0].textContent), 'Elena', 'Fabio vede la stessa classifica'); ok(/Vince Elena/.test(await pb.textContent('.pe-games li')), 'e la partita');
  await play(pb, 'p2', 'Atraxa'); await pb.waitForFunction(() => !document.querySelector('.pe-pend') && document.querySelectorAll('.pe-games li').length === 2);
  await pa.click('[data-a="pe-sync"]'); await pa.waitForFunction(() => document.querySelectorAll('.pe-games li').length === 2);
  eq(await pa.$$eval('.pe-board li', l => l.map(x => x.querySelector('b').textContent + ': ' + x.querySelector('.sc').textContent)), ['Elena: 1 vittoria su 2', 'Fabio: 1 vittoria su 2', 'Gino: 0 vittorie su 2', 'Marta: 0 vittorie su 2'], 'Elena vede anche la partita di Fabio');

  /* senza rete la partita aspetta in coda e parte da sola */
  const cut = r => r.abort(); await B.ctx.route('https://test.supabase.co/**', cut);
  await play(pb, 'p2', 'Atraxa'); ok(await pb.locator('.pe-pend').count() === 1, 'offline: la partita è «in invio»'); ok(await pb.evaluate(() => JSON.parse(localStorage.getItem('cpa:pescher:outbox:v1')).length) === 1, 'sta in coda sul dispositivo');
  eq(await pb.$$eval('.pe-board li', l => l[0].querySelector('.sc').textContent), '2 vittorie su 3', 'e conta già nella classifica di Fabio'); eq(await pb.$$eval('.pe-board li b', l => l[0].textContent), 'Fabio', 'primo');
  await pb.click('[data-a="pe-sync"]'); await pb.waitForFunction(() => /Non riesco a raggiungere il server/.test(document.querySelector('.pe-sst').textContent)); ok(await pb.locator('.pe-pend').count() === 1, 'finché non c\'è rete resta in coda');
  await B.ctx.unroute('https://test.supabase.co/**', cut); await pb.click('[data-a="pe-sync"]'); await pb.waitForFunction(() => !document.querySelector('.pe-pend') && /Aggiornato alle/.test(document.querySelector('.pe-sst').textContent));
  ok(await pb.evaluate(() => JSON.parse(localStorage.getItem('cpa:pescher:outbox:v1')).length) === 0, 'tornata la rete: coda svuotata'); ok(await pb.locator('.pe-games li').count() === 3, 'tre partite');
  await pa.click('[data-a="pe-sync"]'); await pa.waitForFunction(() => document.querySelectorAll('.pe-games li').length === 3); ok(true, 'Elena le riceve');

  /* chi cambia ID si vede col nuovo nome, anche nelle partite vecchie */
  await nav(pb, 'data'); await pb.waitForSelector('#cm .cm-me'); await pb.click('#cm [data-a="cm-rename-open"]'); await pb.fill('#cm-nh', 'Fabione'); await pb.keyboard.press('Enter'); await pb.waitForSelector('#cm-pop', { state: 'detached' });
  await pa.click('[data-a="pe-sync"]'); await pa.waitForFunction(() => [...document.querySelectorAll('.pe-board li b')].some(b => b.textContent === 'Fabione'));
  eq(await pa.$$eval('.pe-board li b', l => l.map(b => b.textContent).sort()), ['Elena', 'Fabione', 'Gino', 'Marta'], 'in classifica c\'è il nuovo ID'); ok(/Fabione/.test(await pa.textContent('.pe-games')), 'e nelle partite'); eq(await pa.inputValue('.pe-seat:nth-child(2) .pe-name'), 'Fabione', 'e al suo posto');

  /* eliminare una partita: per tutti, con conferma */
  await pa.click('.pe-games li:first-child [data-a="pe-delgame"]'); ok(/Sicuro/.test(await pa.textContent('.pe-games li:first-child [data-a="pe-delgame"]')) && await pa.locator('.pe-games li').count() === 3, 'chiede conferma');
  await pa.click('.pe-games li:first-child [data-a="pe-delgame"]'); await pa.waitForFunction(() => document.querySelectorAll('.pe-games li').length === 2);
  await nav(pb, 'pescher'); await pb.waitForSelector('.pe-setup'); await pb.click('[data-a="pe-sync"]'); await pb.waitForFunction(() => document.querySelectorAll('.pe-games li').length === 2); ok(true, 'sparita anche per Fabione');

  /* il proprietario cambia il tavolo: sedie e nome */
  await pa.fill('[data-c="pe-tname"]', 'Venerdì sera'); ok(await pa.locator('#pe-tup:not([hidden])').count() === 1, 'il nome cambiato fa comparire «Aggiorna il tavolo»'); await pa.click('#pe-tup'); await pa.waitForFunction(() => /Venerdì sera/.test(document.querySelector('.pe-tc.sh[aria-pressed="true"]').textContent) && document.querySelector('#pe-tup').hidden);
  await pb.click('[data-a="pe-sync"]'); await pb.waitForFunction(() => /Venerdì sera/.test(document.querySelector('.pe-tc.sh').textContent)); ok(true, 'Fabione vede il nuovo nome');

  /* lasciare il tavolo */
  await pb.click('[data-a="pe-tleave"]'); ok(/Sicuro/.test(await pb.textContent('[data-a="pe-tleave"]')) && await pb.locator('.pe-tc.sh').count() === 1, 'lasciare chiede conferma'); await pb.click('[data-a="pe-tleave"]'); await pb.waitForFunction(() => document.querySelectorAll('.pe-tc.sh').length === 0);
  ok(await pb.locator('.pe-tc[data-id=""][aria-pressed="true"]').count() === 1, 'Fabione torna al tavolo libero');
  await pa.click('[data-a="pe-sync"]'); await pa.waitForFunction(() => { const t = JSON.parse(localStorage.getItem('cpa:pescher:shared:v1')).tables[0]; return t.players[1].u === '' && t.players[1].name === 'Fabione'; }); ok(true, 'per il server il posto di Fabione resta come nome libero'); await pa.waitForSelector('#pe-tup:not([hidden])'); ok(true, 'e a Elena si propone di aggiornare il tavolo (nel suo tavolo Fabione è ancora seduto)');
  /* eliminare il tavolo */
  await pa.click('[data-a="pe-tdel"]'); ok(/Sicuro/.test(await pa.textContent('[data-a="pe-tdel"]')), 'eliminare chiede conferma'); await pa.click('[data-a="pe-tdel"]'); await pa.waitForFunction(() => document.querySelectorAll('.pe-tc.sh').length === 0);
  await db.exec('reset role'); eq([(await db.query('select count(*)::int c from public.cpa_tables')).rows[0].c, (await db.query('select count(*)::int c from public.cpa_games')).rows[0].c], [0, 0], 'sul server non resta niente'); await db.exec('set role anon');

  /* un tavolo del dispositivo si condivide portando con sé le sue partite */
  await pa.click('.pe-seat:nth-child(1) .pe-pick'); await pa.click('#pe-pop .pe-pf[data-h="Elena"]'); await pa.fill('[data-c="pe-tnew"]', 'Locale'); await pa.click('[data-a="pe-tsave"]'); await pa.waitForSelector('.pe-tc[aria-pressed="true"]:has-text("Locale")');
  ok(await pa.locator('.pe-tc.sh').count() === 0, 'salvato solo sul dispositivo'); await play(pa, 'p1', 'Kaalia', true); await pa.waitForSelector('.pe-board'); ok(await pa.locator('[data-a="pe-tshare"]').count() === 1, 'un tavolo con amici seduti si può condividere');
  await pa.click('[data-a="pe-tshare"]'); await pa.waitForSelector('.pe-tc.sh[aria-pressed="true"]'); await pa.waitForFunction(() => document.querySelectorAll('.pe-games li').length === 1 && !document.querySelector('.pe-pend'));
  eq(await pa.$$eval('.pe-board li b', l => l[0].textContent), 'Elena', 'la partita di prima è nella classifica condivisa'); ok(await pa.locator('.pe-tc:not(.sh)').length === undefined || await pa.locator('.pe-tc:not(.sh)').count() === 1, 'del tavolo locale resta solo «Tavolo libero»');
  eq(await pa.evaluate(() => JSON.parse(localStorage.getItem('cpa:pescher:tables:v1') || '[]').length), 0, 'e non è più sul dispositivo');

  /* esco: il Pescher torna come prima */
  await nav(pa, 'data'); await pa.waitForSelector('#cm .cm-me'); await pa.click('#cm [data-a="cm-logout"]'); await pa.click('#cm [data-a="cm-logout"]'); await pa.waitForSelector('#cm #cm-handle');
  await nav(pa, 'pescher'); await pa.waitForSelector('#pe .pe-setup'); ok(await pa.locator('.pe-pick').count() === 0 && await pa.locator('.pe-tc.sh').count() === 0, 'senza ID: niente icone amici né tavoli condivisi');
  ok(await pa.locator('.pe-tc').count() === 1, 'solo il tavolo libero');

  ok(rpcLog.every(f => /^cpa_/.test(f)), 'tutte le chiamate sono funzioni cpa_*');
  ok(await pa.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && await pb.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'nessuno scorrimento orizzontale');
  ok(!errors.length, 'nessun errore in pagina: ' + errors.join(' | '));
  console.log('shared-smoke: ' + n + ' controlli ok');
  await browser.close(); srv.close(); await db.close();
})().catch(e => { console.error(e); process.exit(1); });
