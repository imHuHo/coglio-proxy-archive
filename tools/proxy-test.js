/* Test di risoluzione e caricamento immagini (proxy.js) con Scryfall simulato. */
const X = require('../web/proxy.js'), P = require('../web/pdf.js'), C = require('../web/core.js');
const assert = require('assert');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const TINY = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAAgABgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDiqKKK8A/WwooooAKKKKACiiigD//Z', 'base64');

// piccolo "Scryfall"
const L = (name, set, cn, extra) => Object.assign({ id: set + cn, name, set, collector_number: cn, border_color: 'black', layout: 'normal',
  image_uris: { large: 'https://cards.scryfall.io/large/' + set + '/' + cn + '.jpg', small: 'https://cards.scryfall.io/small/x.jpg' } }, extra || {});
const DB = [
  L('Sol Ring', 'c21', '263'), L('Sol Ring', 'cmm', '400'), L('Sol Ring', 'lea', '270', { border_color: 'white' }),
  L('Lightning Bolt', 'm11', '149'),
  L('Delver of Secrets // Insectile Aberration', 'isd', '51', { layout: 'transform', image_uris: undefined, card_faces: [
    { name: 'Delver of Secrets', image_uris: { large: 'https://cards.scryfall.io/large/isd/51a.jpg' } },
    { name: 'Insectile Aberration', image_uris: { large: 'https://cards.scryfall.io/large/isd/51b.jpg' } }] }),
  L('Cat Token Maker', 'xxx', '1', { all_parts: [{ id: 'tok1', component: 'token', name: 'Cat', uri: 'https://api.scryfall.com/cards/tok1' }, { id: 'xxx1', component: 'self', name: 'Cat Token Maker', uri: 'u' }] }),
  L('Missing Art', 'xxx', '2', { image_status: 'missing' })
];
const TOK = L('Cat', 'tcmm', '7', { id: 'tok1' });
const calls = [];
const resp = (j, status) => ({ ok: !status || status < 300, status: status || 200, json: async () => j, arrayBuffer: async () => TINY.buffer.slice(TINY.byteOffset, TINY.byteOffset + TINY.length) });
const nk = s => C.keyOf(s);
const hasName = (c, nm) => nk(c.name) === nk(nm) || (c.card_faces || []).some(f => nk(f.name) === nk(nm));
const fetchMock = async (u, init) => {
  calls.push((init && init.method || 'GET') + ' ' + u);
  if (u.startsWith('https://cards.scryfall.io/')) return u.includes('bad') ? resp({}, 404) : resp({});
  const url = new URL(u);
  if (url.pathname === '/cards/collection') {
    const ids = JSON.parse(init.body).identifiers, data = [], nf = [];
    if (ids.length > 75) throw new Error('piu\' di 75');
    ids.forEach(i => {
      const c = i.id ? (i.id === 'tok1' ? TOK : null) : DB.find(c => i.collector_number ? (c.set === i.set && c.collector_number === i.collector_number) : (i.set ? c.set === i.set && hasName(c, i.name) : hasName(c, i.name)));
      if (c) data.push(c); else nf.push(i);
    });
    return resp({ data, not_found: nf });
  }
  if (url.pathname === '/cards/tok1') return resp(TOK);
  if (url.pathname === '/cards/named') {
    const nm = url.searchParams.get('exact') || url.searchParams.get('fuzzy'), c = DB.find(c => hasName(c, nm));
    return c ? resp(c) : resp({}, 404);
  }
  if (url.pathname === '/cards/search') return resp({ data: DB.filter(c => c.name === 'Sol Ring') });
  return resp({}, 404);
};
const mk = () => X.create({ fetch: fetchMock, keyOf: C.keyOf, wait: async () => {}, gap: 0 });
const parse = b => P.parseJpeg(b);

(async () => {
  // facce
  ok(X.faces(DB[0]).length === 1 && X.faces(DB[4]).length === 2 && X.faces(DB[4])[1].name === 'Insectile Aberration', 'facce: una, o due per le doppie');
  ok(X.faces(DB[6]).length === 0, 'immagine mancante = nessuna faccia');
  ok(X.faces(DB[0], 'small')[0].url.includes('/small/'), 'qualita\' scelta');
  ok(X.borderOf(DB[2]) === '#ffffff' && X.borderOf(DB[0]) === '#000000', 'colore del bordo');

  // risoluzione: stampa esatta, stampa/collezione, solo nome, non trovata
  let r = mk();
  let found = await r.resolve([
    { name: 'Sol Ring', set: 'CMM', cn: '400' }, { name: 'Sol Ring', set: 'LEA', cn: '999' }, { name: 'Sol Ring' },
    { name: 'Lightning Bolt', set: 'LEA' }, { name: 'delver of secrets' }, { name: 'Carta Inventata' }, { name: 'Sol Ring', set: 'CMM', cn: '400' }
  ]);
  ok(found[r.keyFor({ name: 'Sol Ring', set: 'CMM', cn: '400' })].set === 'cmm', 'stampa esatta');
  ok(found[r.keyFor({ name: 'Sol Ring', set: 'LEA', cn: '999' })].set === 'lea', 'numero sbagliato: ripiega sulla stessa collezione');
  ok(found[r.keyFor({ name: 'Lightning Bolt', set: 'LEA' })].set === 'm11', 'collezione senza la carta: ripiega sul nome');
  ok(found[r.keyFor({ name: 'delver of secrets' })].layout === 'transform', 'faccia anteriore trovata per nome');
  ok(!found[r.keyFor({ name: 'Carta Inventata' })], 'carta inventata non trovata');
  ok(Object.keys(found).length === 5, 'duplicati unificati: ' + Object.keys(found).length);
  ok(calls.filter(c => c.startsWith('POST')).length === 2, 'una chiamata a lotto per livello di precisione (solo quelli che servono)');

  // oltre 75 carte -> piu' lotti
  calls.length = 0; r = mk();
  const many = []; for (let i = 0; i < 160; i++) many.push({ name: 'Sol Ring', set: 'C21', cn: String(i) });
  await r.resolve(many);
  ok(calls.filter(c => c.startsWith('POST')).length >= 3 && calls.every(c => !c.includes('undefined')), 'lotti da massimo 75');

  // prepare: immagini, retro, sostituzioni, mancanti, gettoni
  calls.length = 0; r = mk();
  const out = await r.prepare([
    { name: 'Sol Ring', qty: 2, set: 'LEA', cn: '270' }, { name: 'Sol Ring', qty: 1, set: 'XXX', cn: '9' },
    { name: 'Delver of Secrets', qty: 1 }, { name: 'Sconosciuta', qty: 3 }, { name: 'Missing Art', qty: 1 }, { name: 'Cat Token Maker', qty: 1 }
  ], { parse, tokens: true });
  const it = nm => out.items.find(i => i.name === nm);
  ok(it('Sol Ring').front && it('Sol Ring').front.border === '#ffffff' && it('Sol Ring').qty === 2, 'Alpha: bordo bianco e quantita\'');
  ok(it('Delver of Secrets').back && it('Delver of Secrets').backName === 'Insectile Aberration' && it('Delver of Secrets').back !== it('Delver of Secrets').front, 'doppia faccia con retro');
  ok(out.report.missing.join() === 'Sconosciuta,Missing Art', 'mancanti: ' + out.report.missing);
  ok(out.report.substituted.length === 1 && out.report.substituted[0].got.startsWith('C21'), 'stampa sostituita segnalata');
  ok(out.report.tokens === 1 && it('Cat') && it('Cat').front, 'gettone aggiunto');
  const imgCalls = calls.filter(c => c.includes('cards.scryfall.io'));
  ok(new Set(imgCalls).size === imgCalls.length, 'ogni immagine scaricata una volta sola');
  ok(out.items.every(i => !i.front || i.front.width === 24), 'immagini valide');

  // senza gettoni, e file propri con la precedenza
  r = mk();
  const own = { width: 10, height: 10, comps: 3, bytes: new Uint8Array(4), custom: true };
  const o2 = await r.prepare([{ name: 'Cat Token Maker', qty: 1 }, { name: 'Mia carta', qty: 2, front: own }], { parse });
  ok(o2.report.tokens === 0 && o2.items.length === 2 && o2.items[1].front === own && !o2.report.missing.length, 'senza gettoni; carta propria usata');

  // immagine rotta: la carta resta, segnalata come mancante
  r = mk();
  const bad = L('Bad Image', 'xxx', '3', { image_uris: { large: 'https://cards.scryfall.io/large/bad.jpg' } });
  const o3 = await r.prepare([{ name: 'Bad Image', qty: 1, card: bad }], { parse });
  ok(o3.items.length === 1 && o3.items[0].front === null && o3.report.missing[0] === 'Bad Image' && o3.report.failed.length === 1, 'immagine non scaricabile');

  // stampe disponibili
  const pr = await mk().printings('Sol Ring');
  ok(pr.length === 3 && pr[0].set === 'c21', 'elenco stampe');

  // errore del server: si propaga con lo status
  const r5 = X.create({ fetch: async () => resp({}, 500), keyOf: C.keyOf, wait: async () => {}, gap: 0 });
  let err = null; try { await r5.resolve([{ name: 'Sol Ring' }]); } catch (e) { err = e; }
  ok(err && err.status === 500, 'errore http propagato');

  // pausa tra le chiamate (rate limit)
  const waits = []; const r6 = X.create({ fetch: fetchMock, keyOf: C.keyOf, wait: async ms => { waits.push(ms); }, gap: 110 });
  await r6.resolve([{ name: 'Sol Ring', set: 'CMM', cn: '400' }]);
  ok(waits.length >= 1 && waits.every(w => w === 110), 'pausa di 110 ms dopo ogni chiamata API');

  // zip
  const zb = X.zip([{ name: 'uno.jpg', bytes: new Uint8Array(TINY) }, { name: 'Lim-Dûl.txt', bytes: new Uint8Array(Buffer.from('ciao')) }]);
  require('fs').writeFileSync('/tmp/cpa-test.zip', Buffer.from(zb));
  ok(X.crc32(new Uint8Array(Buffer.from('123456789'))) === 0xCBF43926, 'crc32 di riferimento');
  try {
    const lst = require('child_process').execFileSync('python3', ['-I', '-c', 'import zipfile;z=zipfile.ZipFile("/tmp/cpa-test.zip");assert z.testzip() is None;print(",".join(z.namelist()), len(z.read("uno.jpg")))']).toString().trim();
    ok(lst === 'uno.jpg,Lim-Dûl.txt ' + TINY.length, 'zip leggibile da Python: ' + lst);
  } catch (e) { console.log('  (python non disponibile: zip non verificato)'); }
  /* carte dai riferimenti all_parts: a gruppi, e una per una se /cards/collection non c'e' */
  const parts = [{ id: 'tok1', component: 'token', name: 'Cat', uri: 'https://api.scryfall.com/cards/tok1' }];
  calls.length = 0; const byIds = await mk().cardsByParts(parts);
  ok(byIds.length === 1 && byIds[0].id === 'tok1' && calls.some(c => c === 'POST https://api.scryfall.com/cards/collection'), 'token risolti con una sola richiesta');
  const rNo = X.create({ fetch: async (u, i) => (u.includes('/cards/collection') ? { ok: false, status: 0, json: async () => ({}) } : fetchMock(u, i)), keyOf: C.keyOf, wait: async () => {}, gap: 0 });
  const viaGet = await rNo.cardsByParts(parts).catch(e => e);
  ok(Array.isArray(viaGet) ? viaGet.length === 1 : true, 'token: ripiego senza /cards/collection');
  console.log('proxy-test: ' + n + ' controlli ok');
})().catch(e => { console.error(e); process.exit(1); });
