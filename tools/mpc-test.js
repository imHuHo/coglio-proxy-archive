/* Prove del modulo MPC Fill (web/mpc.js) e delle righe con stampa della comunità (core.js). Uso: node tools/mpc-test.js */
const assert = require('assert'), path = require('path');
const M = require(path.join(__dirname, '..', 'web', 'mpc.js')), C = require(path.join(__dirname, '..', 'web', 'core.js'));
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); }; const eq = (a, b, m) => { n++; assert.deepStrictEqual(a, b, m); };

/* dpi -> pixel richiesti a Google */
eq([300, 600, 1200].map(M.pxForDpi), [1110, 2220, 4440], 'altezza in pixel per 300/600/1200 dpi');
ok(M.imageUrl('abc_DEF-1', 2220) === 'https://lh4.googleusercontent.com/d/abc_DEF-1=h2220', 'indirizzo immagine');
ok(M.imageUrl('x', 99999).endsWith('=h5000') && M.imageUrl('x', 1).endsWith('=h64'), 'altezza limitata');
ok(M.thumbUrl('x').endsWith('=h400'), 'miniatura');
eq(M.queryName('Delver of Secrets // Insectile Aberration'), 'delver of secrets', 'carta a due facce: prima faccia');
eq(M.queryName('  Sol Ring '), 'sol ring', 'minuscole e spazi');

/* non ufficiale */
const un = t => M.classify(t).unofficial;
ok(un(['Custom Art']) && un(['AI Art', 'AI Remaster']) && un(['Altered Art']) && un(['Upscaled Scan']) && un(['Custom-Made Frame']) && un(['Artist Art']) && un(['Switched Art']) && un(['Pixel Art']) && un(['Sketch']), 'tag non ufficiali riconosciuti');
ok(!un([]) && !un(['Borderless']) && !un(['Extended-Art']) && !un(['Showcase']) && !un(['FNM Promo']) && !un(['Foil-Etched']) && !un(['Retro Frame']), 'bordo pieno, esteso, showcase, promo non sono «non ufficiali»');
ok(M.classify(['Borderless', 'Custom Art']).unofficial, 'tag misti: basta un tag custom per essere non ufficiale');
eq(M.classify(['Borderless']).variant, ['Borderless'], 'trattamento ufficiale riconosciuto');
ok(M.classify([]).tagged === false && M.classify(['x']).tagged === true, 'senza tag = non etichettata');
eq([M.setHint('Sol Ring (2XM0354)'), M.setHint('Sol Ring [CMD 263]'), M.setHint('Sol Ring')], ['2XM 0354', 'CMD 263', ''], 'suggerimento di collezione dal nome (best effort)');

/* carta restituita dal server */
const raw = { identifier: 'ID1', name: 'Sol Ring', dpi: 1199.6, extension: 'PNG', size: 8400000, sourceName: 'Chilli', tags: ['Custom Art'], language: 'EN', dateCreated: '2024-03-01T10:00:00Z' };
const pc = M.parseCard(raw);
ok(pc.id === 'ID1' && pc.dpi === 1200 && pc.ext === 'png' && pc.unofficial && pc.src === 'Chilli' && pc.lang === 'en' && pc.date === '2024-03-01', 'parseCard');
ok(M.parseCard(null) === null && M.parseCard({}) === null && M.parseCard({ identifier: '' }) === null, 'parseCard scarta il resto');
eq([M.mb(8400000), M.mb(1500000), M.mb(0)], ['8 MB', '1.4 MB', ''], 'dimensione leggibile');

/* client con rete finta */
const mk = (handler, extra) => { const calls = []; const store = {}; const cl = M.create(Object.assign({ http: req => { calls.push(req); return Promise.resolve(handler(req)); }, cache: { get: k => store[k] || null, set: (k, v) => { store[k] = v; } }, gap: 0 }, extra || {})); return { cl, calls, store }; };
const ids = Array.from({ length: 160 }, (_, i) => 'C' + i);
const good = req => {
  const u = new URL(req.url);
  if (u.pathname === '/2/sources/') return { status: 200, text: JSON.stringify({ results: { '5': { pk: 5 }, '9': { pk: 9 } } }) };
  if (u.pathname === '/2/editorSearch/') return { status: 200, text: JSON.stringify({ results: { 'sol ring': { CARD: ids } } }) };
  if (u.pathname === '/2/cards/') { const r = {}; JSON.parse(req.body).cardIdentifiers.forEach((id, i) => { r[id] = { identifier: id, name: 'Sol Ring', dpi: 300 + i, tags: [] }; }); return { status: 200, text: JSON.stringify({ results: r }) }; }
  return { status: 404, text: '{}' };
};
(async () => {
  const none = M.create({});
  ok(!none.available(), 'senza rete nativa non è disponibile');
  await none.search('Sol Ring').then(() => ok(false), e => ok(e.code === 'app' && /app/i.test(e.message), 'sul web: messaggio «solo nell’app»'));

  const t = mk(good);
  ok(t.cl.available(), 'disponibile con rete');
  const s = await t.cl.search('Sol Ring');
  ok(s.total === 160 && s.ids.length === 160 && s.cards.length === 0, 'ricerca: 160 id, nessuna carta ancora');
  eq(t.calls.map(c => new URL(c.url).pathname), ['/2/sources/', '/2/editorSearch/'], 'prima archivi, poi ricerca');
  ok(t.calls.every(c => c.url.startsWith('https://mpcfill.com/')), 'solo mpcfill.com');
  const body = JSON.parse(t.calls[1].body);
  eq(body.queries, [{ query: 'sol ring', cardType: 'CARD' }], 'query minuscola, tipo CARD');
  eq(body.searchSettings.sourceSettings.sources, [[5, true], [9, true]], 'tutti gli archivi');
  ok(body.searchSettings.filterSettings.minimumDPI === 0 && body.searchSettings.searchTypeSettings.fuzzySearch === false, 'filtri di base');
  await t.cl.more(s, 75);
  ok(s.cards.length === 75 && s.next === 75, 'prime 75 carte');
  ok(JSON.parse(t.calls[2].body).cardIdentifiers.length === 75, 'una richiesta da 75');
  await t.cl.more(s, 500);
  ok(s.cards.length === 150 && s.next === 150, 'al massimo 75 per volta anche se ne chiedo di più');
  await t.cl.more(s, 75); await t.cl.more(s, 75);
  ok(s.cards.length === 160 && s.next === 160, 'fine elenco');
  const callsAfter = t.calls.length; await t.cl.more(s, 75);
  ok(t.calls.length === callsAfter, 'a fine elenco nessuna richiesta');
  /* memoria */
  const t2n = t.calls.length;
  const s2 = await t.cl.search('sol ring'); ok(t.calls.length === t2n && s2.ids.length === 160, 'stessa ricerca: dalla memoria');
  await t.cl.more(s2, 75); ok(t.calls.length === t2n, 'le carte già viste non si richiedono');
  const s3 = await t.cl.search('Sol Ring', { minDpi: 1200 }); ok(t.calls.length === t2n + 1, 'con un altro filtro dpi si richiede');
  ok(JSON.parse(t.calls[t.calls.length - 1].body).searchSettings.filterSettings.minimumDPI === 1200, 'filtro dpi mandato al server');

  /* errori */
  for (const [label, resp, code] of [['403', { status: 403, text: '<html>cf</html>' }, 'guard'], ['html', { status: 200, text: '<html>challenge' }, 'guard'], ['429', { status: 429, text: '' }, 'rate'], ['500', { status: 500, text: '' }, 'http'], ['json', { status: 200, text: 'non json' }, 'json'], ['rete', { status: 0, error: 'rete' }, 'net']]) {
    const e = mk(() => resp);
    await e.cl.search('Sol Ring').then(() => ok(false, label), err => ok(err.code === code && err.message.length > 5, 'errore ' + label + ' -> ' + code));
  }
  const empty = mk(req => /sources/.test(req.url) ? { status: 200, text: JSON.stringify({ results: {} }) } : good(req));
  await empty.cl.search('Sol Ring').then(() => ok(false), e => ok(e.code === 'json', 'nessun archivio: errore chiaro'));
  const zero = mk(req => /editorSearch/.test(req.url) ? { status: 200, text: JSON.stringify({ results: { 'sol ring': { CARD: [] } } }) } : good(req));
  const zs = await zero.cl.search('Sol Ring'); ok(zs.total === 0, 'nessun risultato: totale 0');

  /* righe di mazzo con stampa MPC */
  const d = { cards: [{ name: 'Sol Ring', qty: 3, set: 'C21', cn: '263' }, { name: 'Mountain', qty: 4, set: '', cn: '' }], side: [] };
  const base = { name: 'Sol Ring', set: 'C21', cn: '263' };
  const info = { mpc: 'ID1', mdpi: 1200, muo: 1, msrc: 'Chilli', mnm: 'Sol Ring (Neon)' };
  C.setMpc(d, base, info, false, true);
  ok(d.cards.length === 3 && d.cards[0].qty === 2 && !d.cards[0].mpc && d.cards[2].qty === 1 && d.cards[2].mpc === 'ID1' && d.cards[2].mdpi === 1200 && d.cards[2].muo === 1, 'una copia: la riga si divide');
  eq(C.countOf(d.cards), 7, 'le copie totali non cambiano');
  C.addCard(d, Object.assign({}, base, { mpc: 'ID1' }), 1);
  ok(d.cards.length === 3 && d.cards[2].qty === 2, 'si fonde solo con la riga dello stesso id MPC');
  C.addCard(d, Object.assign({}, base, { mpc: 'ID2' }), 1);
  ok(d.cards.length === 4, 'un altro id MPC è un’altra riga');
  C.moveCard(d, Object.assign({}, base, { mpc: 'ID1' }), 1, true);
  const sb = d.side[0]; ok(sb && sb.mpc === 'ID1' && sb.mdpi === 1200 && sb.muo === 1 && sb.msrc === 'Chilli', 'spostando nel sideboard la stampa MPC e i suoi dati restano');
  C.setMpc(d, Object.assign({}, base, { mpc: 'ID1' }), null, false, false);
  ok(!d.cards.some(c => c.mpc === 'ID1') && d.cards.filter(c => !c.mpc && c.name === 'Sol Ring')[0].qty === 3, 'tolta la stampa MPC le copie tornano insieme');
  C.removeCard(d, Object.assign({}, base, { mpc: 'ID2' }), 1);
  ok(!d.cards.some(c => c.mpc === 'ID2'), 'si toglie la riga giusta');
  /* salvataggio e pulizia */
  const dirty = C.sanitizeDeck({ id: 'x', name: 'T', cards: [{ name: 'Sol Ring', qty: 1, mpc: 'ID1', mdpi: 1199.7, muo: 1, msrc: 'Chilli', extra: 'no' }, { name: 'A', qty: 1, mpc: 5, mdpi: -3 }], commander: null });
  ok(dirty.cards[0].mpc === 'ID1' && dirty.cards[0].mdpi === 1200 && dirty.cards[0].muo === 1 && dirty.cards[0].msrc === 'Chilli' && !('extra' in dirty.cards[0]), 'sanitizeDeck tiene i dati MPC e scarta il resto');
  ok(!('mpc' in dirty.cards[1]) && !('mdpi' in dirty.cards[1]), 'id non valido scartato');
  /* le stampe della comunità non si usano per "riutilizzare" copie libere */
  const donor = { id: 'b', name: 'Raccoglitore', kind: 'binder', status: 'inactive', cards: [{ name: 'Sol Ring', qty: 1, set: '', cn: '', mpc: 'ID9' }], side: [], upgrades: [] };
  const re = C.findReusable([{ name: 'Sol Ring', qty: 1 }], [donor], {});
  ok(!re.length || re.every(x => !x.exactRows.length && !x.otherRows.length), 'una stampa MPC non conta come copia reale da riusare');

  console.log('mpc-test: ' + n + ' controlli ok');
})().catch(e => { console.error(e); process.exit(1); });
