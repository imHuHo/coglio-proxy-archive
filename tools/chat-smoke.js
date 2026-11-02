/* Prova in Chromium vero degli stati dei mazzi e di «Chat? Ma questa cosa è reale?»: due dispositivi (Elena e Fabio), amicizia, annunci dei cambi di stato,
 * messaggio con artwork, fusione dei cambi ravvicinati, interruttore, coda offline, ritiro. Il server è un Postgres vero (PGlite) con supabase/schema.sql.
 * Uso: node tools/chat-smoke.js <cartella di @electric-sql/pglite>   (SHOTS=cartella, DARK=1, VP=390x844) */
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


  const createId = async (pg, handle) => { await pg.fill('#cm-handle', handle); await pg.click('#cm [data-a="cm-create"]'); await pg.waitForSelector('#cm-pop #cm-code'); await pg.keyboard.press('Escape'); await pg.waitForSelector('#cm .cm-me'); };
  const nav = (pg, v) => pg.locator('[data-a="nav"][data-v="' + v + '"]:visible').first().click();
  const sc = async (pg, name) => { if (SHOTS) { await pg.evaluate(() => { document.querySelectorAll('.toast').forEach(t => t.remove()); const e = document.querySelector('.ch-ev'); if (e) e.scrollIntoView({ block: 'center' }); }); await pg.waitForTimeout(400); await pg.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
  const seed = (pg, decks) => pg.evaluate(ds => new Promise((res, rej) => { const r = indexedDB.open('coglio-proxy-archive', 1); r.onsuccess = () => { const t = r.result.transaction('decks', 'readwrite'); ds.forEach(d => t.objectStore('decks').put(d)); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }; r.onerror = () => rej(r.error); }), decks);
  const dk = (id, name, cmd, status) => ({ id, name, kind: 'deck', status, active: status === 'active', commander: cmd, cards: [{ name: cmd, qty: 1, set: 'cmd', cn: '1' }, { name: 'Sol Ring', qty: 1, set: 'c21', cn: '263' }], side: [], upgrades: [], createdAt: 1, updatedAt: 1 });
  const setStatus = async (pg, id, v) => { await pg.selectOption('select[data-c="status"][data-id="' + id + '"]', v); };
  const feed = pg => pg.$$eval('.ch-ev', l => l.map(e => ({ shout: e.querySelector('.ch-shout').textContent, text: e.querySelector('.ch-text').textContent, who: e.querySelector('.ch-who').textContent, big: e.classList.contains('big'), isNew: !!e.querySelector('.ch-new'), art: (e.querySelector('.ch-art').getAttribute('style') || ''), lab: e.querySelector('.ch-lab').textContent, mine: !!e.querySelector('.ch-me') })));
  const A = await device(true), pa = A.page, B = await device(true), pb = B.page;
  await createId(pa, 'Elena'); await createId(pb, 'Fabio');
  await nav(pa, 'data'); await pa.fill('#cm-add', 'Fabio'); await pa.click('#cm [data-a="cm-fadd"]'); await pa.waitForFunction(() => /Richiesta inviata a @Fabio/.test((document.querySelector('#cm .cm-st.ok') || {}).textContent || ''));
  await pb.click('#cm [data-a="cm-frefresh"]'); await pb.waitForSelector('#cm [data-a="cm-facc"][data-h="Elena"]'); await pb.click('#cm [data-a="cm-facc"][data-h="Elena"]'); await pb.waitForFunction(() => /siete amici/.test(document.getElementById('cm').textContent));

  /* i quattro stati nella pagina Mazzi */
  await seed(pa, [dk('d-kaalia', 'Kaalia', 'Kaalia of the Vast', 'unprinted'), dk('d-atraxa', 'Atraxa', 'Atraxa, Grand Unifier', 'active'), dk('d-yawgmoth', 'Yawgmoth', 'Yawgmoth, Thran Physician', 'printed'), dk('d-old', 'Vecchio', 'Edgar Markov', 'inactive')]);
  await pa.reload(); await pa.waitForSelector('.shell'); await nav(pa, 'decks'); await pa.waitForSelector('.deckcard');
  eq(await pa.$$eval('select[data-c="status"][data-id="d-kaalia"] option', o => o.map(x => x.value + '=' + x.textContent)), ['active=Attivo', 'unprinted=Da stampare', 'printed=Stampato ma non pronto', 'inactive=Smontato'], 'quattro stati, con i nomi nuovi');
  eq(await pa.$$eval('.deckcard', l => l.map(c => [c.querySelector('h2').textContent, c.className.replace('deckcard', '').trim()]).sort()), [['Atraxa', 'is-on'], ['Kaalia', 'is-np'], ['Vecchio', ''], ['Yawgmoth', 'is-pp']], 'ogni stato ha il suo aspetto (stampato ma non pronto: is-pp)');
  const sub = await pa.textContent('.vh .sub'); ok(/1 attivi su 4/.test(sub) && /1 da stampare/.test(sub) && /1 stampati ma non pronti/.test(sub) && /1 smontati/.test(sub), 'riepilogo: ' + sub); await sc(pa, 'chat-decks');

  /* senza ID e senza configurazione */
  { const d = await device(false); await nav(d.page, 'pescher'); await d.page.waitForSelector('#pe .pe-setup'); ok(await d.page.locator('.pe-tabs').count() === 0, 'community non attiva: niente schede'); await d.ctx.close(); }
  { const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] } }); const pg = await ctx.newPage(); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.abort()); await ctx.route('**/community-config.js', r => r.fulfill({ status: 200, headers: { 'content-type': 'text/javascript' }, body: "window.CPA_COMMUNITY = { url: 'https://test.supabase.co', key: 'anon-key-for-tests-0123456789' };" })); await ctx.route('https://test.supabase.co/**', rpc); await ctx.route(url => url.protocol === 'https:' && !/test\.supabase\.co/.test(url.href), r => r.abort());
    await pg.goto(base); await pg.waitForSelector('.shell'); await nav(pg, 'pescher'); await pg.waitForSelector('#pe .pe-tab'); await pg.click('#pe-tab-chat'); await pg.waitForSelector('#ch .ch-empty');
    ok(/Serve un Codighel ID/.test(await pg.textContent('#ch')) && await pg.locator('#ch [data-a="ch-data"]').count() === 1, 'senza ID: invito a crearlo'); await pg.click('#ch [data-a="ch-data"]'); await pg.waitForSelector('#cm #cm-handle'); ok(true, 'porta in Dati'); await ctx.close(); }

  /* Fabio apre la chat: ancora niente */
  await nav(pb, 'pescher'); await pb.waitForSelector('#pe .pe-tab'); eq(await pb.$$eval('.pe-tab', l => l.map(t => t.getAttribute('aria-selected'))), ['true', 'false'], 'due schede, i tavoli per prima');
  await pb.click('#pe-tab-chat'); await pb.waitForSelector('#ch .ch-empty:has-text("Tutto tace")'); ok(/Chat\? Ma questa cosa è reale\?/.test(await pb.textContent('#ch .ch-hero h2')), 'titolo della scheda'); ok(await pb.locator('#ch [data-c="ch-ann"]:checked').count() === 1, 'annunci accesi di default');
  await pb.click('#pe-tab-tables'); ok(await pb.locator('#pe .pe-setup').count() === 1 && await pb.locator('#ch').count() === 0, 'le classifiche stanno nell\'altra scheda');

  /* Elena stampa il deck di Kaalia: da stampare → stampato ma non pronto */
  await setStatus(pa, 'd-kaalia', 'printed'); await pa.waitForFunction(() => /stampato ma non pronto/.test(document.body.textContent));
  ok(await pa.$eval('.deckcard:has(select[data-id="d-kaalia"])', c => c.classList.contains('is-pp')), 'il mazzo diventa «stampato ma non pronto»');
  await pa.waitForFunction(() => { const q = JSON.parse(localStorage.getItem('cpa:feed:outbox:v1') || '[]'); return q.length === 0; }); await db.exec('reset role'); eq((await db.query('select count(*)::int c from public.cpa_feed')).rows[0].c, 1, 'sul server c\'è l\'annuncio'); const row = (await db.query('select commander, image_url, from_st, to_st from public.cpa_feed')).rows[0]; await db.exec('set role anon');
  eq([row.commander, row.from_st, row.to_st, /^https:\/\/cards\.scryfall\.io\//.test(row.image_url)], ['Kaalia of the Vast', 'unprinted', 'printed', true], 'con il commander e l\'artwork');
  await pb.evaluate(() => { window.CPAChatUI.state().t = 0; });
  await nav(pb, 'decks'); await nav(pb, 'pescher'); await pb.waitForSelector('#pe .pe-tab'); await pb.waitForFunction(() => { const b = document.getElementById('ch-badge'); return b && !b.hidden && b.textContent === '1'; }); ok(true, 'il badge sulla scheda dice 1 novità');
  await pb.click('#pe-tab-chat'); await pb.waitForSelector('#ch .ch-ev');
  let f = await feed(pb); eq(f.length, 1, 'un annuncio'); eq([f[0].shout, f[0].text, f[0].who, f[0].big, f[0].isNew, f[0].mine, f[0].lab], ['QUESTO È FREAKIN CRAAZY!', '@Elena ha stampato il deck di Kaalia of the Vast.', '@Elena', true, true, false, 'Da stampare → Stampato ma non pronto'], 'il messaggio, con «Nuovo»');
  ok(/cards\.scryfall\.io/.test(f[0].art), 'con l\'immagine del commander accanto'); await pb.waitForFunction(() => { const b = document.getElementById('ch-badge'); return !b || b.hidden; }); ok(true, 'aperta la scheda, il badge sparisce'); await sc(pb, 'chat-feed-big');
  ok(await pb.locator('#ch .ch-ev .ch-pip[src="mana/u.svg"]').count() === 1, 'pip blu per «stampato»');
  /* Elena lo vede come suo */
  await nav(pa, 'pescher'); await pa.waitForSelector('#pe .pe-tab'); await pa.click('#pe-tab-chat'); await pa.waitForSelector('#ch .ch-ev'); f = await feed(pa);
  eq([f[0].text, f[0].mine, f[0].isNew], ['Hai stampato il deck di Kaalia of the Vast.', true, false], 'per chi ha stampato: «Hai stampato…», e non è «nuovo»'); ok(await pa.locator('#ch [data-a="ch-del"]').count() === 1 && await pb.locator('#ch [data-a="ch-del"]').count() === 0, 'solo il proprietario può ritirarlo');

  /* altri cambi di stato: tono diverso per ognuno */
  await nav(pa, 'decks'); await setStatus(pa, 'd-atraxa', 'inactive'); await setStatus(pa, 'd-old', 'active'); await setStatus(pa, 'd-yawgmoth', 'active');
  await pa.waitForFunction(() => JSON.parse(localStorage.getItem('cpa:feed:outbox:v1') || '[]').length === 0);
  await nav(pb, 'decks'); await nav(pb, 'pescher'); await pb.waitForSelector('#pe .pe-tab'); await pb.click('#pe-tab-chat'); await pb.click('#ch [data-a="ch-refresh"]'); await pb.waitForFunction(() => document.querySelectorAll('.ch-ev').length === 4); f = await feed(pb);
  eq(f.map(x => x.shout).sort(), ['PRONTO AL COMBATTIMENTO!', 'QUESTO È FREAKIN CRAAZY!', 'RIMONTATO!', 'SMONTATO!'], 'smontato, rimontato e pronto al combattimento hanno il loro messaggio');
  eq(f.filter(x => x.big).length, 1, 'solo la stampa è «grande»'); ok(f.some(x => x.text === '@Elena ha smontato il deck di Atraxa, Grand Unifier: le carte tornano libere.') && f.some(x => x.text === '@Elena ha rimontato il deck di Edgar Markov: di nuovo in campo.'), 'testi giusti'); await sc(pb, 'chat-feed');
  ok(await pb.$$eval('.ch-ev', l => ['tone-b', 'tone-g'].every(c => l.some(e => e.classList.contains(c)))), 'colori Magic: nero per lo smontato, verde per l\'attivo');

  /* cambi ravvicinati dello stesso mazzo: un annuncio solo; tornare indietro li cancella */
  await nav(pa, 'decks'); await setStatus(pa, 'd-kaalia', 'active'); await pa.waitForFunction(() => JSON.parse(localStorage.getItem('cpa:feed:outbox:v1') || '[]').length === 0);
  await nav(pb, 'decks'); await nav(pb, 'pescher'); await pb.click('#pe-tab-chat'); await pb.click('#ch [data-a="ch-refresh"]'); await pb.waitForFunction(() => [...document.querySelectorAll('.ch-shout')].some(e => /STAMPATO E GIÀ IN CAMPO/.test(e.textContent))); f = await feed(pb);
  eq([f.length, f.filter(x => /Kaalia/.test(x.text)).length, f.find(x => /Kaalia/.test(x.text)).lab], [4, 1, 'Da stampare → Attivo'], 'da stampare→stampato→attivo: un annuncio solo, «stampato e già in campo»');
  await nav(pa, 'decks'); await setStatus(pa, 'd-kaalia', 'unprinted'); await pa.waitForFunction(() => JSON.parse(localStorage.getItem('cpa:feed:outbox:v1') || '[]').length === 0);
  await nav(pb, 'decks'); await nav(pb, 'pescher'); await pb.click('#pe-tab-chat'); await pb.click('#ch [data-a="ch-refresh"]'); await pb.waitForFunction(() => document.querySelectorAll('.ch-ev').length === 3); ok(true, 'tornato a «da stampare»: l\'annuncio sparisce');

  /* l'interruttore */
  await nav(pa, 'pescher'); await pa.click('#pe-tab-chat'); await pa.uncheck('#ch [data-c="ch-ann"]'); await nav(pa, 'decks'); await setStatus(pa, 'd-atraxa', 'active'); await pa.waitForTimeout(600);
  await db.exec('reset role'); eq((await db.query("select count(*)::int c from public.cpa_feed where deck_key = 'd-atraxa'")).rows[0].c, 1, 'con l\'interruttore spento non parte nulla (resta solo il vecchio annuncio)'); await db.exec('set role anon');
  await nav(pa, 'pescher'); await pa.click('#pe-tab-chat'); await pa.check('#ch [data-c="ch-ann"]');

  /* senza rete l'annuncio aspetta e parte da solo */
  const cut = r => r.abort(); await A.ctx.route('https://test.supabase.co/**', cut);
  await nav(pa, 'decks'); await setStatus(pa, 'd-kaalia', 'printed'); await pa.waitForFunction(() => JSON.parse(localStorage.getItem('cpa:feed:outbox:v1') || '[]').length === 1); ok(true, 'offline: l\'annuncio è in coda');
  await nav(pa, 'pescher'); await pa.click('#pe-tab-chat'); await pa.click('#ch [data-a="ch-refresh"]'); await pa.waitForFunction(() => /Non riesco a raggiungere il server/.test(document.querySelector('.ch-sst').textContent)); ok(true, 'finché non c\'è rete lo dice');
  await A.ctx.unroute('https://test.supabase.co/**', cut); await pa.click('#ch [data-a="ch-refresh"]'); await pa.waitForFunction(() => JSON.parse(localStorage.getItem('cpa:feed:outbox:v1') || '[]').length === 0 && !/Non riesco/.test(document.querySelector('.ch-sst').textContent)); ok(true, 'tornata la rete: parte da solo');
  await pb.click('#ch [data-a="ch-refresh"]'); await pb.waitForFunction(() => [...document.querySelectorAll('.ch-ev')].some(e => /Kaalia/.test(e.querySelector('.ch-text').textContent) && /FREAKIN/.test(e.querySelector('.ch-shout').textContent))); ok(true, 'e Fabio lo riceve');

  /* ritirare un annuncio */
  const n0 = await pa.locator('#ch .ch-ev').count(); await pa.click('#ch .ch-ev [data-a="ch-del"]'); ok(/Sicuro/.test(await pa.textContent('#ch .ch-ev [data-a="ch-del"]')) && await pa.locator('#ch .ch-ev').count() === n0, 'ritirare chiede conferma'); await pa.click('#ch .ch-ev [data-a="ch-del"]'); await pa.waitForFunction(n => document.querySelectorAll('#ch .ch-ev').length === n - 1, n0); ok(true, 'ritirato');
  await pb.click('#ch [data-a="ch-refresh"]'); await pb.waitForFunction(n => document.querySelectorAll('#ch .ch-ev').length === n - 1, n0); ok(true, 'sparisce anche per Fabio');

  ok(rpcLog.every(f => /^cpa_/.test(f)), 'tutte le chiamate sono funzioni cpa_*');
  ok(await pa.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && await pb.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'nessuno scorrimento orizzontale');
  ok(!errors.length, 'nessun errore in pagina: ' + errors.join(' | '));
  console.log('chat-smoke: ' + n + ' controlli ok');
  await browser.close(); srv.close(); await db.close();
})().catch(e => { console.error(e); process.exit(1); });
