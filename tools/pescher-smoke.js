/* Prova in Chromium vero di The Pescher (preparazione, partita, danno da comandante, segnalini, monarca, dadi, salvataggio).
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
  /* la voce di menu esiste con la sua icona */
  ok(await page.locator('.nav[data-v="pescher"]:visible').count() >= 1, 'voce The Pescher nel menu');
  ok(await page.locator('.nav[data-v="pescher"] svg path').count() >= 3 && await page.locator('.nav[data-v="pescher"] svg polygon').count() === 0, 'con la sua icona a goccia (niente stellina)');
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
  await page.fill('.pe-name[data-p="p2"]', 'Luca'); await page.fill('.pe-name[data-p="p3"]', 'Marta'); await page.fill('.pe-name[data-p="p4"]', 'Giulia');
  /* niente mazzi né bracket: si gioca con gli amici */
  ok(await page.locator('.pe-seat select, [data-a="pe-bkt"], [data-a="pe-sug"], .pe-bal').count() === 0, 'nessun mazzo, bracket o consiglio nella preparazione');
  ok(!/bracket|mazzo uso/i.test(await page.textContent('#pe')), 'nessuna parola su bracket o mazzi');
  await shot('pescher-setup');

  /* partita */
  await page.click('[data-a="pe-begin"]'); await page.waitForSelector('.pe-grid');
  ok(await page.locator('.pe-tile').count() === 4, 'quattro riquadri');
  ok(await page.locator('.pe-tile.turn').count() === 1, 'uno solo ha il turno');
  ok(await life('p1') === 40, 'vita 40');
  await page.click('.pe-tile[data-p="p2"] [data-a="pe-life"][data-d="-1"]', { position: { x: 12, y: 12 } }); await page.click('.pe-tile[data-p="p2"] [data-a="pe-life"][data-d="-5"]');
  ok(await life('p2') === 34, 'vita 34 dopo -1 e -5: ' + await life('p2'));
  await page.click('[data-a="pe-undo"]'); ok(await life('p2') === 39, 'annulla toglie solo l\'ultimo passaggio: ' + await life('p2'));
  /* veleno */
  await page.click('.pe-tile[data-p="p3"] [data-a="pe-tog"][data-k="poison"]');
  for (let i = 0; i < 3; i++) await page.click('.pe-tile[data-p="p3"] [data-a="pe-poison"][data-d="1"]');
  ok(/3/.test(await page.textContent('.pe-tile[data-p="p3"] .pe-chip[data-k="poison"]')), 'veleno a 3');
  /* altri segnalini, monarca, iniziativa */
  await page.click('.pe-tile[data-p="p2"] [data-a="pe-tog"][data-k="more"]');
  await page.click('.pe-tile[data-p="p2"] [data-a="pe-ctr"][data-k="exp"][data-d="1"]'); await page.click('.pe-tile[data-p="p2"] [data-a="pe-ctr"][data-k="exp"][data-d="1"]');
  await page.click('.pe-tile[data-p="p2"] [data-a="pe-ctr"][data-k="tax"][data-d="1"]');
  ok(/\+2/.test(await page.textContent('.pe-tile[data-p="p2"] .pe-panel')), 'un lancio: costa +2');
  ok(/Esp 2/.test(await page.textContent('.pe-tile[data-p="p2"] header')), 'l\'esperienza si vede nell\'intestazione');
  await page.click('.pe-tile[data-p="p2"] [data-a="pe-hold"][data-k="monarch"]');
  ok(await page.locator('.pe-tile[data-p="p2"] .pe-tk', { hasText: 'Monarca' }).count() === 1, 'p2 è il monarca');
  await page.click('.pe-tile[data-p="p3"] [data-a="pe-tog"][data-k="more"]'); await page.click('.pe-tile[data-p="p3"] [data-a="pe-hold"][data-k="monarch"]');
  ok(await page.locator('.pe-tk', { hasText: 'Monarca' }).count() === 1 && await page.locator('.pe-tile[data-p="p3"] .pe-tk', { hasText: 'Monarca' }).count() === 1, 'il monarca è uno solo e passa a p3');
  await page.click('.pe-tile[data-p="p3"] [data-a="pe-hold"][data-k="initiative"]'); ok(await page.locator('.pe-tile[data-p="p3"] .pe-tk', { hasText: 'Iniziativa' }).count() === 1, 'iniziativa a p3');
  await page.click('.pe-tile[data-p="p2"] [data-a="pe-tog"][data-k="more"]'); await page.click('.pe-tile[data-p="p3"] [data-a="pe-tog"][data-k="more"]');
  /* la bolla del cambio di vita e il valore esatto */
  await page.click('.pe-tile[data-p="p1"] [data-a="pe-life"][data-d="-5"]'); await page.click('.pe-tile[data-p="p1"] [data-a="pe-life"][data-d="-1"]', { position: { x: 12, y: 12 } });
  ok((await page.textContent('.pe-tile[data-p="p1"] .pe-delta')).replace(/\s/g, '') === '\u22126', 'la bolla somma i tocchi ravvicinati: ' + await page.textContent('.pe-tile[data-p="p1"] .pe-delta'));
  await page.click('.pe-tile[data-p="p1"] [data-a="pe-set"]'); await page.waitForSelector('#pe-setv'); await page.fill('#pe-setv', '25'); await page.keyboard.press('Enter');
  ok(await life('p1') === 25 && await page.locator('#pe-pop').count() === 0, 'vita impostata a 25 con Invio');
  await page.click('[data-a="pe-undo"]'); ok(await life('p1') === 34, 'e si annulla: ' + await life('p1')); await page.click('.pe-tile[data-p="p1"] [data-a="pe-life"][data-d="5"]'); await page.click('.pe-tile[data-p="p1"] [data-a="pe-life"][data-d="1"]', { position: { x: 12, y: 12 } }); ok(await life('p1') === 40, 'di nuovo 40');
  ok(/Giro 1/.test(await page.textContent('.pe-turn')) && /\d+:\d\d/.test(await page.textContent('.pe-clock')), 'giro e cronometro in barra');
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
  ok(await page.locator('#pe .pe-tools [data-a="pe-log"]').count() === 0, 'il registro non affolla la barra'); await page.click('[data-a="pe-menu"]'); await page.click('#pe-pop [data-a="pe-log"]'); ok(await page.locator('#pe-pop .pe-log li').count() >= 5, 'il registro racconta la partita');
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
  /* fine partita: vincitore, mazzo; senza tavolo non c'è classifica */
  ok(await page.locator('.pe-hsec').count() === 0, 'senza partite, niente storico');
  ok(await page.locator('.pe-tc').count() === 1 && await page.getAttribute('.pe-tc', 'aria-pressed') === 'true', 'all\'inizio c\'è solo «Tavolo libero», scelto');
  await page.click('[data-a="pe-begin"]'); await page.waitForSelector('.pe-grid');
  await page.click('[data-a="pe-end"]'); await page.waitForSelector('#pe-pop .pe-win');
  ok(await page.locator('#pe-pop .pe-wb').count() === 5, 'quattro giocatori più «Nessuno»');
  ok(await page.getAttribute('#pe-pop .pe-wb.none', 'aria-checked') === 'true' && await page.locator('#pe-wdeck').count() === 0, 'nessun vincitore scelto: niente campo del mazzo');
  ok(await page.locator('#pe-pop [data-c="pe-esave"]').count() === 1 && await page.locator('#pe-esname').count() === 0, 'si può salvare il tavolo, ma il nome compare solo se lo vuoi');
  await page.click('#pe-pop .pe-wb[data-p="p2"]'); await page.waitForSelector('#pe-wdeck'); ok(await page.getAttribute('#pe-pop .pe-wb[data-p="p2"]', 'aria-checked') === 'true', 'Luca selezionato');
  await page.fill('#pe-wdeck', '  Kaalia  of the Vast '); await page.click('#pe-pop .pe-wb[data-p="p3"]'); ok(await page.inputValue('#pe-wdeck') === '  Kaalia  of the Vast ', 'il mazzo scritto resta se cambio vincitore');
  await page.click('#pe-pop .pe-wb[data-p="p2"]');
  await page.click('[data-a="pe-endok"]'); await page.waitForSelector('.pe-hsec');
  ok(await page.locator('.pe-setup').count() === 1 && await page.locator('#pe-pop').count() === 0, 'si torna alla preparazione del tavolo');
  ok(await page.locator('.pe-name[data-p="p2"]').inputValue() === 'Luca', 'il tavolo resta com\'è');
  ok(/senza tavolo/i.test(await page.textContent('.pe-hsec h2')) && await page.locator('.pe-board').count() === 0, 'una partita libera non fa classifica');
  ok(/Vince Luca/.test(await page.textContent('.pe-games li')) && /Kaalia of the Vast/.test(await page.textContent('.pe-games li')), 'ma resta tra le partite senza tavolo, con il mazzo ripulito');

  /* salvare il tavolo alla fine di una partita: da lì parte la classifica */
  await page.click('[data-a="pe-begin"]'); await page.click('[data-a="pe-end"]'); await page.waitForSelector('#pe-pop .pe-win'); await page.click('#pe-pop .pe-wb[data-p="p1"]');
  await page.check('#pe-pop [data-c="pe-esave"]'); await page.waitForSelector('#pe-esname'); await page.fill('#pe-esname', '  Il   venerdì '); await page.click('#pe-pop .pe-wb[data-p="p1"]'); ok(await page.inputValue('#pe-esname') === '  Il   venerdì ', 'il nome del tavolo resta se cambio vincitore');
  await shot('pescher-end');
  await page.click('[data-a="pe-endok"]'); await page.waitForSelector('.pe-board');
  ok(await page.locator('.pe-tc').count() === 2 && await page.getAttribute('.pe-tc[aria-pressed="true"]', 'data-id') !== '' && /Il venerdì/.test(await page.textContent('.pe-tc[aria-pressed="true"]')), 'il tavolo è salvato e scelto: ' + (await page.textContent('.pe-tbl')).replace(/\s+/g, ' '));
  ok(/Classifica · Il venerdì/.test(await page.textContent('.pe-hsec h2')), 'la classifica porta il nome del tavolo');
  ok(await page.locator('.pe-board li').count() === 4 && /Io/.test(await page.textContent('.pe-board li:first-child')) && /1 vittoria su 1/.test(await page.textContent('.pe-board li:first-child')), 'in testa Io, 1 su 1');
  ok(!/Vince Luca/.test(await page.textContent('.pe-hsec')), 'la partita libera di Luca non c\'entra con questo tavolo');
  ok(await page.locator('.pe-games li').count() === 1, 'solo le partite del tavolo');
  /* due partite sul tavolo: Luca vince la seconda con un mazzo */
  await page.click('[data-a="pe-begin"]'); await page.click('[data-a="pe-end"]'); await page.waitForSelector('#pe-pop .pe-win');
  ok(await page.locator('#pe-pop [data-c="pe-esave"]').count() === 0 && /Il venerdì/.test(await page.textContent('#pe-pop .pe-tnote')), 'a un tavolo salvato non si chiede di salvarlo, si dice a quale classifica va');
  await page.click('#pe-pop .pe-wb[data-p="p2"]'); await page.fill('#pe-wdeck', 'Atraxa'); await page.click('[data-a="pe-endok"]'); await page.waitForSelector('.pe-board');
  ok(await page.locator('.pe-games li').count() === 2 && /Luca/.test(await page.textContent('.pe-board li:nth-child(2)')) && /1 vittoria su 2/.test(await page.textContent('.pe-board li:nth-child(2)')) && /Atraxa/.test(await page.textContent('.pe-board li:nth-child(2)')), 'Luca 1 su 2 con Atraxa');
  await shot('pescher-board');
  /* tavolo libero: la classifica sparisce, le partite libere restano */
  const savedId = await page.getAttribute('.pe-tc[aria-pressed="true"]', 'data-id');
  await page.click('.pe-tc[data-id=""]'); ok(await page.locator('.pe-board').count() === 0 && await page.locator('.pe-games li').count() === 1 && await page.locator('.pe-tedit [data-a="pe-tsave"]').count() === 1, 'tornando libero, niente classifica e si può salvare un altro tavolo');
  await page.click('.pe-tc[data-id="' + savedId + '"]'); ok(await page.locator('.pe-board li').count() === 4, 'e il tavolo ritrova la sua classifica: ' + (await page.textContent('.pe-setup')).replace(/\s+/g, ' '));
  /* nomi diversi dal tavolo: compare «aggiorna» */
  ok(!(await page.isVisible('#pe-tup')), 'nomi uguali al tavolo: niente «aggiorna»');
  await page.fill('.pe-name[data-p="p3"]', 'Ospite'); ok(await page.isVisible('#pe-tup'), 'cambio un nome: compare «aggiorna»');
  await page.fill('.pe-name[data-p="p3"]', 'Marta'); ok(!(await page.isVisible('#pe-tup')), 'torno al nome di prima: sparisce');
  await page.fill('.pe-name[data-p="p3"]', 'Ospite'); await page.click('#pe-tup'); ok(!(await page.isVisible('#pe-tup')), 'aggiornato');
  await page.click('.pe-tc[data-id=""]'); await page.fill('.pe-name[data-p="p3"]', 'Boh'); await page.click('.pe-tc[data-id="' + savedId + '"]');
  ok(await page.inputValue('.pe-name[data-p="p3"]') === 'Ospite', 'scegliendo il tavolo tornano i suoi nomi aggiornati');
  /* un secondo tavolo, vuoto; rinominare */
  await page.click('.pe-tc[data-id=""]'); await page.fill('[data-c="pe-tnew"]', 'Domenica'); await page.click('[data-a="pe-tsave"]'); await page.waitForSelector('.pe-tc[aria-pressed="true"]:has-text("Domenica")');
  ok(await page.locator('.pe-tc').count() === 3 && /Ancora nessuna partita/.test(await page.textContent('.pe-hsec')), 'tavolo nuovo: classifica vuota');
  await page.fill('[data-c="pe-tname"]', 'Domenica sera'); ok(/Domenica sera/.test(await page.textContent('.pe-tc[aria-pressed="true"]')), 'rinominato');
  /* persistenza */
  await page.reload(); await page.waitForSelector('.shell'); await nav('pescher'); await page.waitForSelector('.pe-hsec');
  ok(/Domenica sera/.test(await page.textContent('.pe-tc[aria-pressed="true"]')) && await page.locator('.pe-tc').count() === 3, 'tavoli e scelta sopravvivono al ricaricamento');
  await page.click('.pe-tc[data-id="' + savedId + '"]'); ok(await page.locator('.pe-games li').count() === 2, 'lo storico del tavolo sopravvive');
  /* eliminare una partita aggiorna la classifica */
  await page.click('.pe-games li:first-child [data-a="pe-delgame"]'); ok(await page.locator('.pe-games li').count() === 2, 'una sola pressione non elimina');
  await page.click('.pe-games li:first-child [data-a="pe-delgame"]'); ok(await page.locator('.pe-games li').count() === 1, 'la seconda elimina');
  ok(/Io/.test(await page.textContent('.pe-board li:first-child')) && /1 vittoria su 1/.test(await page.textContent('.pe-board li:first-child')), 'la classifica si aggiorna');
  await shot('pescher-table');
  /* eliminare un tavolo porta via le sue partite, non quelle libere */
  await page.click('[data-a="pe-tdel"]'); ok(await page.locator('.pe-tc').count() === 3, 'una sola pressione non elimina il tavolo');
  await page.click('[data-a="pe-tdel"]'); await page.waitForSelector('.pe-tc[aria-pressed="true"][data-id=""]');
  ok(await page.locator('.pe-tc').count() === 2 && await page.locator('.pe-games li').count() === 1 && /Luca/.test(await page.textContent('.pe-games li')), 'tavolo eliminato con le sue partite; resta la partita libera');

  /* niente scorrimento orizzontale */
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'nessuno scorrimento orizzontale');
  ok(!errors.length, 'nessun errore in pagina: ' + errors.join(' | '));
  console.log('pescher-smoke: ' + n + ' controlli ok');
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
