/* Prova le funzioni community (ID, codice di recupero, artwork Scryfall, client del server con fetch finto). */
const assert = require('assert'), C = require('../web/community.js');
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); }; const eq = (a, b, m) => { n++; assert.deepStrictEqual(a, b, m); };
const rej = async (p, code, m) => { try { await p; } catch (e) { n++; assert.strictEqual(e.code, code, m + ' (codice ' + e.code + ')'); return; } assert.fail(m + ': nessun errore'); };

/* ID */
for (const h of ['Simone', 'abc', 'a_b.c-d', 'X'.repeat(20), 'Kaalia99']) ok(C.validHandle(h) && C.handleProblem(h) === null, 'ID valido: ' + h);
for (const h of ['', 'ab', 'X'.repeat(21), 'con spazio', 'è', 'a@b', 'ciao!', null, undefined, '😀😀😀']) ok(!C.validHandle(h) && !!C.handleProblem(h), 'ID non valido: ' + h);
eq([C.handleProblem('ab'), C.handleProblem('X'.repeat(21)), /accento/.test(C.handleProblem('è..'))], ['Almeno 3 caratteri.', 'Al massimo 20 caratteri.', true], 'messaggi giusti');
eq([C.cleanHandle('  @Simone '), C.cleanHandle(null)], ['Simone', ''], '«@» e spazi tolti');

/* codice di recupero */
const seq = (start) => (k) => Array.from({ length: k }, (_, i) => (start + i * 7) & 255);
const s1 = C.newSecret(seq(0)); eq([s1.length, C.validSecret(s1)], [20, true], 'codice di 20 caratteri validi');
eq(C.newSecret(seq(0)), s1, 'stessi byte, stesso codice'); ok(C.newSecret(seq(3)) !== s1, 'byte diversi, codice diverso');
ok(!/[ILOU]/.test(C.newSecret(k => Array.from({ length: k }, (_, i) => i * 13))), 'niente I, L, O, U');
const cnt = {}; for (let b = 0; b < 256; b++) { const c = C.newSecret(k => Array(k).fill(b))[0]; cnt[c] = (cnt[c] || 0) + 1; } ok(Object.values(cnt).every(v => v === 8) && Object.keys(cnt).length === 32, 'ogni carattere esce con la stessa frequenza (nessuna distorsione)');
const real = C.newSecret(); ok(C.validSecret(real) && real !== C.newSecret(), 'con il caso vero, codici sempre diversi');
eq(C.formatSecret('ABCDE12345FGHJK67890'), 'ABCDE-12345-FGHJK-67890', 'in gruppi da 5'); eq(C.formatSecret(''), '', 'vuoto');
eq(C.normSecret(' abcde-12345 fghjk-67890 '), 'ABCDE12345FGHJK67890', 'si scrive come capita'); eq(C.normSecret('abcdO-l2345-Ighjk-67890'), 'ABCD0123451GHJK67890', 'O→0, I e L→1');
for (const t of [null, 5, '', 'abc', 'ABCDE12345FGHJK6789', 'ABCDE12345FGHJK678901', 'ABCDE12345FGHJK6789U']) ok(!C.validSecret(C.normSecret(t)), 'codice non valido: ' + t);

/* artwork */
const art = 'https://cards.scryfall.io/art_crop/front/1/2/aaa.jpg?1562903478';
eq(C.artFromCard({ name: 'Kaalia of the Vast', set: 'cmd', artist: 'Jason Chan', image_uris: { art_crop: art } }), { name: 'Kaalia of the Vast', artist: 'Jason Chan', set: 'CMD', url: art }, 'carta normale');
eq(C.artFromCard({ name: 'Delver // Insectile', card_faces: [{ name: 'Delver', artist: 'Nils', image_uris: { art_crop: art } }, {}] }).url, art, 'carta a due facce: la prima');
eq([C.artFromCard(null), C.artFromCard({ name: 'x' }), C.artFromCard({ image_uris: { art_crop: 'https://evil.example/a.jpg' } }), C.artFromCard({ image_uris: { art_crop: 'http://cards.scryfall.io/a.jpg' } })], [null, null, null, null], 'senza artwork o fuori da Scryfall: niente');
const calls = []; const sf = (body, status) => (u) => { calls.push(u); return Promise.resolve({ ok: (status || 200) < 300, status: status || 200, json: () => Promise.resolve(body) }); };
(async () => {
  eq(await C.artSearch('kaalia', sf({ data: [{ name: 'A', image_uris: { art_crop: art } }, { name: 'senza' }, { name: 'B', image_uris: { art_crop: art } }] })), [{ name: 'A', artist: '', set: '', url: art }, { name: 'B', artist: '', set: '', url: art }], 'ricerca: scarta chi non ha artwork');
  ok(/unique=art/.test(calls[0]) && /q=kaalia$/.test(calls[0]) && calls[0].indexOf('https://api.scryfall.com/cards/search') === 0, 'ricerca: un artwork per volta, dal più recente');
  await C.artSearch('"Sol Ring" set:c21', sf({ data: [] })); ok(/q=%22Sol%20Ring%22%20set%3Ac21$/.test(calls[1]), 'la ricerca è codificata bene');
  eq(await C.artSearch('x', sf({ data: [] })), [], 'meno di due lettere: niente chiamata'); eq(calls.length, 2, 'e non si chiama Scryfall');
  eq(await C.artSearch('zzzz', sf({}, 404)), [], 'nessun risultato (404 di Scryfall)');
  eq((await C.artSearch('a'.repeat(5), sf({ data: Array.from({ length: 50 }, (_, i) => ({ name: 'c' + i, image_uris: { art_crop: art } })) }))).length, 24, 'al massimo 24 artwork');
  await rej(C.artSearch('abc', sf({}, 500)), 'scryfall', 'errore di Scryfall'); await rej(C.artSearch('abc', () => Promise.reject(new Error('x'))), 'offline', 'senza rete');

  /* client */
  const cfg = { url: 'https://abc.supabase.co/', key: 'anon-key-12345' };
  ok(C.configured(cfg) && !C.configured({}) && !C.configured({ url: '', key: '' }) && !C.configured({ url: 'http://abc.supabase.co', key: 'anon-key-12345' }) && !C.configured({ url: 'https://abc.supabase.co', key: 'corta' }) && !C.configured(null), 'configurato solo con https e chiave');
  const seen = []; const srv = (status, body) => (u, o) => { seen.push({ u, o }); return Promise.resolve({ ok: status < 300, status, text: () => Promise.resolve(body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body)) }); };
  let cl = C.create(cfg, srv(200, true));
  eq(await cl.free('Simone'), true, 'free');
  eq([seen[0].u, seen[0].o.method, seen[0].o.headers.apikey, seen[0].o.headers.Authorization, seen[0].o.headers['Content-Type'], JSON.parse(seen[0].o.body)], ['https://abc.supabase.co/rest/v1/rpc/cpa_handle_free', 'POST', 'anon-key-12345', 'Bearer anon-key-12345', 'application/json', { p_handle: 'Simone' }], 'indirizzo, intestazioni e corpo');
  cl = C.create(cfg, srv(200, { handle: 'Simone', avatar_name: 'K', avatar_url: art }));
  eq((await cl.register('Simone', 'ABCDE12345FGHJK67890', { name: 'K', url: art })).handle, 'Simone', 'register'); eq(JSON.parse(seen[1].o.body), { p_handle: 'Simone', p_secret: 'ABCDE12345FGHJK67890', p_name: 'K', p_url: art }, 'register: corpo');
  await cl.register('Luca', 'ABCDE12345FGHJK67890'); eq([JSON.parse(seen[2].o.body).p_name, JSON.parse(seen[2].o.body).p_url], ['', ''], 'senza immagine: campi vuoti');
  await cl.login('Simone', 'S'); await cl.profile('Simone'); await cl.setAvatar('Simone', 'S', { name: 'N', url: art }); await cl.rename('Simone', 'S', 'Simo'); await cl.remove('Simone', 'S');
  eq(seen.slice(3).map(x => x.u.split('/').pop()), ['cpa_login', 'cpa_profile', 'cpa_set_avatar', 'cpa_rename', 'cpa_delete'], 'funzioni chiamate');
  eq(JSON.parse(seen[5].o.body), { p_handle: 'Simone', p_secret: 'S', p_name: 'N', p_url: art }, 'set_avatar: corpo'); eq(JSON.parse(seen[6].o.body), { p_handle: 'Simone', p_secret: 'S', p_new: 'Simo' }, 'rename: corpo');
  eq(await C.create(cfg, srv(200, 'null')).profile('x'), null, 'profilo inesistente = null'); eq(await C.create(cfg, srv(200, '')).profile('x'), null, 'risposta vuota = null');
  for (const m of ['handle_taken', 'bad_login', 'bad_handle', 'bad_secret', 'bad_avatar']) await rej(C.create(cfg, srv(400, { code: 'P0001', message: m })).login('a', 'b'), m, 'errore del server: ' + m);
  await rej(C.create(cfg, srv(400, { message: 'duplicate key value violates...' })).login('a', 'b'), 'server', 'errore sconosciuto'); await rej(C.create(cfg, srv(502, '<html>bad gateway</html>')).login('a', 'b'), 'server', 'risposta non JSON');
  await rej(C.create(cfg, () => Promise.reject(new TypeError('Failed to fetch'))).login('a', 'b'), 'offline', 'senza rete'); await rej(C.create({}, srv(200, true)).login('a', 'b'), 'unconfigured', 'non configurato');
  ok(['handle_taken', 'bad_login', 'offline', 'unconfigured', 'server', 'scryfall', 'bad_handle', 'bad_secret', 'bad_avatar'].every(c => C.messageOf({ code: c }).length > 10) && C.messageOf(null) === C.TEXT.server, 'ogni errore ha il suo messaggio');

  /* profilo sul dispositivo */
  const loc = { handle: 'Simone', secret: 'ABCDE12345FGHJK67890', avatar: { name: 'K', url: art } };
  eq(C.restoreLocal(JSON.stringify(loc)), loc, 'profilo locale ripristinato'); eq(C.restoreLocal('rotto'), null, 'testo rotto'); eq(C.restoreLocal({ handle: 'ok1', secret: 'corto' }), null, 'codice non valido'); eq(C.restoreLocal({ handle: 'a', secret: loc.secret }), null, 'ID non valido');
  eq(C.restoreLocal({ handle: 'Simone', secret: loc.secret, avatar: { name: 'x', url: 'https://evil.example/a.jpg' } }).avatar.url, '', 'immagine esterna scartata'); eq(C.restoreLocal({ handle: 'Simone', secret: loc.secret }).avatar, { name: '', url: '' }, 'senza immagine');
  console.log('community-test: ' + n + ' controlli ok');
})().catch(e => { console.error(e); process.exit(1); });
