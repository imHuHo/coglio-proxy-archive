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
  eq([seen[0].u, seen[0].o.method, seen[0].o.headers.apikey, seen[0].o.headers.Authorization, seen[0].o.headers['Content-Type'], JSON.parse(seen[0].o.body)], ['https://abc.supabase.co/rest/v1/rpc/cpa_handle_free', 'POST', 'anon-key-12345', undefined, 'application/json', { p_handle: 'Simone' }], 'indirizzo, intestazioni e corpo (chiave non JWT: solo apikey)');
  await C.create({ url: cfg.url, key: 'sb_publishable_AbCdEf123456' }, srv(200, true)).free('x'); eq([seen[seen.length - 1].o.headers.apikey, seen[seen.length - 1].o.headers.Authorization], ['sb_publishable_AbCdEf123456', undefined], 'chiave «publishable»: niente Bearer');
  await C.create({ url: cfg.url, key: 'eyJhbGciOiJIUzI1NiJ9.e30.abc' }, srv(200, true)).free('x'); eq(seen[seen.length - 1].o.headers.Authorization, 'Bearer eyJhbGciOiJIUzI1NiJ9.e30.abc', 'chiave «anon» storica (JWT): anche Bearer');
  seen.length = 1;
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


  /* amici */
  const art2 = 'https://cards.scryfall.io/art_crop/front/1/2/aaa.jpg?1';
  eq(C.cleanFriends({ friends: [{ handle: 'Anna', avatar_name: 'K', avatar_url: art2 }, { handle: 'no!' }, null, { handle: 'Bru', avatar_url: 'https://evil.example/x.jpg' }], incoming: 'boh' }), { friends: [{ id: '', handle: 'Anna', avatar_name: 'K', avatar_url: art2 }, { id: '', handle: 'Bru', avatar_name: '', avatar_url: '' }], incoming: [], outgoing: [] }, 'elenco ripulito: ID non validi e immagini esterne scartati');
  eq(C.cleanFriends(null), { friends: [], incoming: [], outgoing: [] }, 'senza risposta, elenco vuoto');
  const seen2 = []; const srv2 = (body) => (u, o) => { seen2.push({ u, o }); return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) }); };
  let fc = C.create(cfg, srv2({ friends: [{ handle: 'Anna' }], incoming: [], outgoing: [] }));
  eq((await fc.friends('Simone', 'S')).friends[0].handle, 'Anna', 'friends'); eq([seen2[0].u.split('/').pop(), JSON.parse(seen2[0].o.body)], ['cpa_friend_list', { p_handle: 'Simone', p_secret: 'S' }], 'friends: chiamata');
  fc = C.create(cfg, srv2('pending')); eq(await fc.friendRequest('Simone', 'S', 'Anna'), 'pending', 'friendRequest'); eq([seen2[1].u.split('/').pop(), JSON.parse(seen2[1].o.body)], ['cpa_friend_request', { p_handle: 'Simone', p_secret: 'S', p_to: 'Anna' }], 'friendRequest: chiamata');
  fc = C.create(cfg, srv2(true)); await fc.friendRespond('Simone', 'S', 'Anna', true); await fc.friendRespond('Simone', 'S', 'Anna', 0); await fc.friendRemove('Simone', 'S', 'Anna');
  eq(seen2.slice(2).map(x => [x.u.split('/').pop(), JSON.parse(x.o.body)]), [['cpa_friend_respond', { p_handle: 'Simone', p_secret: 'S', p_from: 'Anna', p_accept: true }], ['cpa_friend_respond', { p_handle: 'Simone', p_secret: 'S', p_from: 'Anna', p_accept: false }], ['cpa_friend_remove', { p_handle: 'Simone', p_secret: 'S', p_other: 'Anna' }]], 'respond (sì e no) e remove');
  for (const m of ['no_such_user', 'self', 'no_request', 'too_many']) await rej(C.create(cfg, srv(400, { message: m })).friendRequest('a', 'b', 'c'), m, 'errore amici: ' + m);
  ok(['no_such_user', 'self', 'no_request', 'too_many'].every(c => C.messageOf({ code: c }).length > 10), 'messaggi per gli errori degli amici');

  /* tavoli condivisi: pulizia dei dati e chiamate */
  const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222', T1 = '33333333-3333-3333-3333-333333333333', G1 = '44444444-4444-4444-4444-444444444444';
  eq([C.uid(U1), C.uid(U1.toUpperCase()), C.uid('x'), C.uid(null), C.uid(U1 + '0')], [U1, U1, '', '', ''], 'id: solo uuid validi');
  eq(C.cleanFriends({ friends: [{ id: U1, handle: 'Anna' }, { id: 'xx', handle: 'Bru' }] }).friends.map(x => x.id), [U1, ''], 'degli amici si tiene l\'id, se valido');
  const tsrv = { id: T1, name: '  Il   venerdì ', owner: 'Elena', mine: true, start: 30, cmd_life: false, players: [{ name: 'Elena', u: U1, avatar_url: art2 }, { name: 'Ospite', u: null, avatar_url: null }, { name: 'x'.repeat(40), u: 'brutto', avatar_url: 'https://evil.example/a.jpg' }] };
  const ct = C.cleanTable(tsrv);
  eq(ct, { id: T1, name: 'Il venerdì', owner: 'Elena', mine: true, start: 30, cmdLife: false, players: [{ name: 'Elena', u: U1, avatar: art2 }, { name: 'Ospite', u: '', avatar: '' }, { name: 'x'.repeat(24), u: '', avatar: '' }] }, 'tavolo ripulito (immagini esterne, id brutti e testi lunghi scartati)');
  eq([C.cleanTable(null), C.cleanTable({ id: 'x', players: [1, 2] }), C.cleanTable({ id: T1, players: [{ name: 'a' }] }), C.cleanTable({ id: T1, players: 'boh' })], [null, null, null, null], 'tavoli non validi scartati');
  eq(C.cleanTable(ct), ct, 'ripulire due volte non cambia nulla (copia sul dispositivo)'); eq(C.cleanTable({ ...tsrv, cmd_life: true }).cmdLife, true, 'regola del comandante');
  const gsrv = { gid: G1, t: 1000, ms: 5000, rounds: 3, start: 40, winner: ' Elena ', wu: U1, deck: 'Kaalia', players: [{ name: 'Elena', u: U1, life: 12, out: false }, { name: 'Ospite', u: null, life: -3, out: true }, { name: '', life: 'x', out: 1 }] };
  const cg = C.cleanGame(gsrv);
  eq(cg, { id: G1, t: 1000, ms: 5000, rounds: 3, start: 40, players: [{ name: 'Elena', u: U1, life: 12, out: false }, { name: 'Ospite', u: '', life: -3, out: true }, { name: '?', u: '', life: 0, out: true }], winner: 'Elena', wu: U1, deck: 'Kaalia', table: '' }, 'partita ripulita (id = id sul server)');
  eq([C.cleanGame(null), C.cleanGame({ gid: 'x', players: [1, 2] }), C.cleanGame({ gid: G1, players: [{}] })], [null, null, null], 'partite non valide scartate'); eq(C.cleanGame(cg), cg, 'anche le partite: due volte lo stesso');
  const old = { ...cg, players: [{ name: 'Vecchio', u: U1, life: 1, out: false }, { name: 'Ospite', u: '', life: 2, out: false }], winner: 'Vecchio' };
  const nn = C.namesNow(old, ct); eq([nn.players[0].name, nn.players[1].name, nn.winner, old.players[0].name], ['Elena', 'Ospite', 'Elena', 'Vecchio'], 'chi ha cambiato ID si vede col nome di oggi (senza toccare l\'originale)');
  eq(C.namesNow({ ...old, wu: '', winner: 'Ospite' }, ct).winner, 'Ospite', 'un vincitore senza id resta com\'era'); eq(C.namesNow(old, null).players[0].name, 'Vecchio', 'senza tavolo, nomi com\'erano');
  const sh0 = { acct: 'abc', handle: 'Simone', t: 5, tables: [tsrv, { id: 'no' }], games: { [T1]: [gsrv, null, { gid: 'x' }], 'no': [gsrv] }, gt: { [T1]: 9 } };
  const rs = C.restoreShared(JSON.stringify(sh0)); eq([rs.acct, rs.handle, rs.t, rs.tables.length, Object.keys(rs.games), rs.games[T1].length, rs.gt[T1]], ['abc', 'Simone', 5, 1, [T1], 1, 9], 'copia dei tavoli ripristinata e ripulita');
  eq([C.restoreShared('rotto'), C.restoreShared(null), C.restoreShared({ handle: 'a' })], [null, null, null], 'copia rotta: niente'); eq(C.restoreShared(JSON.stringify(rs)), rs, 'andata e ritorno della copia');
  const seen3 = []; const srv3 = (body) => (u, o) => { seen3.push({ f: u.split('/').pop(), b: JSON.parse(o.body) }); return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(JSON.stringify(body)) }); };
  let tc = C.create(cfg, srv3([tsrv, { id: 'no' }, null]));
  eq((await tc.tables('Simone', 'S')).map(t => t.id), [T1], 'tables: solo quelli validi'); eq(seen3[0], { f: 'cpa_table_list', b: { p_handle: 'Simone', p_secret: 'S' } }, 'tables: chiamata');
  tc = C.create(cfg, srv3({ id: T1, name: 'Nuovo', owner: 'Simone', mine: true, start: 40, cmd_life: true, players: [{ name: 'A', u: U1 }, { name: 'B' }] }));
  eq((await tc.tableSave('Simone', 'S', { name: 'Nuovo', players: [{ name: 'Ignorato', u: U1 }, { name: ' Ospite ', u: 'brutto' }], start: 40 })).name, 'Nuovo', 'tableSave');
  eq(seen3[1], { f: 'cpa_table_save', b: { p_handle: 'Simone', p_secret: 'S', p_id: null, p_name: 'Nuovo', p_players: JSON.stringify([{ u: U1 }, { name: 'Ospite' }]), p_start: 40, p_cmd_life: true } }, 'tableSave: amici per id (senza nome), ospiti per nome, nuovo = id nullo');
  await tc.tableSave('Simone', 'S', { id: T1, name: 'N', players: [{ name: 'a' }, { name: 'b' }], start: 20, cmdLife: false }); eq([seen3[2].b.p_id, seen3[2].b.p_start, seen3[2].b.p_cmd_life], [T1, 20, false], 'tableSave: aggiornamento');
  await rej(C.create(cfg, srv3({})).tableSave('S', 'S', { name: 'x', players: [] }), 'server', 'tableSave: risposta strana');
  tc = C.create(cfg, srv3([gsrv, { gid: 'x' }]));
  eq((await tc.tableGames('Simone', 'S', T1)).map(x => x.id), [G1], 'tableGames: solo partite valide'); eq(seen3[4], { f: 'cpa_table_games', b: { p_handle: 'Simone', p_secret: 'S', p_id: T1 } }, 'tableGames: chiamata');
  tc = C.create(cfg, srv3({ gid: G1 })); const rec = { t: 1, players: [{ name: 'a' }, { name: 'b' }] };
  eq((await tc.gameAdd('Simone', 'S', T1, rec)).gid, G1, 'gameAdd'); eq(seen3[5], { f: 'cpa_game_add', b: { p_handle: 'Simone', p_secret: 'S', p_table: T1, p_rec: JSON.stringify(rec) } }, 'gameAdd: chiamata');
  tc = C.create(cfg, srv3(true)); await tc.gameDelete('Simone', 'S', T1, G1); await tc.tableDelete('Simone', 'S', T1); await tc.tableLeave('Simone', 'S', T1);
  eq(seen3.slice(6).map(x => [x.f, x.b]), [['cpa_game_delete', { p_handle: 'Simone', p_secret: 'S', p_table: T1, p_game: G1 }], ['cpa_table_delete', { p_handle: 'Simone', p_secret: 'S', p_id: T1 }], ['cpa_table_leave', { p_handle: 'Simone', p_secret: 'S', p_id: T1 }]], 'gameDelete, tableDelete, tableLeave');
  for (const m of ['not_friend', 'bad_data', 'no_table', 'not_owner', 'is_owner']) { await rej(C.create(cfg, srv(400, { message: m })).tableSave('a', 'b', { name: 'x', players: [] }), m, 'errore tavoli: ' + m); ok(C.messageOf({ code: m }).length > 10, 'messaggio: ' + m); }
  /* link */
  eq(C.friendLink('Simone'), 'https://imHuHo.github.io/coglio-proxy-archive/#amico=Simone', 'link amicizia'); eq(C.friendLink('@Kaalia.99', 'http://localhost:8080/x/#vecchio'), 'http://localhost:8080/x/#amico=Kaalia.99', 'con un altro indirizzo, senza altri #');
  eq([C.parseFriendHash('#amico=Simone'), C.parseFriendHash('amico=Simone'), C.parseFriendHash('#amico=Simo%20ne'), C.parseFriendHash('#amico=%E0%A4%A'), C.parseFriendHash('#amico='), C.parseFriendHash('#altro=Simone'), C.parseFriendHash(''), C.parseFriendHash(null), C.parseFriendHash('#amico=<script>')], ['Simone', 'Simone', '', '', '', '', '', '', ''], 'il link si legge solo se contiene un ID valido');
  eq(C.parseFriendHash(C.friendLink('Kaalia-99_x').split('/').pop()), 'Kaalia-99_x', 'andata e ritorno'); eq(C.parseFriendHash('#amico=Simone&x=1'), 'Simone', 'ignora il resto');

  /* profilo sul dispositivo */
  const loc = { id: '', handle: 'Simone', secret: 'ABCDE12345FGHJK67890', avatar: { name: 'K', url: art } };
  eq(C.restoreLocal(JSON.stringify(loc)), loc, 'profilo locale ripristinato'); eq(C.restoreLocal('rotto'), null, 'testo rotto'); eq(C.restoreLocal({ handle: 'ok1', secret: 'corto' }), null, 'codice non valido'); eq(C.restoreLocal({ handle: 'a', secret: loc.secret }), null, 'ID non valido');
  eq(C.restoreLocal({ handle: 'Simone', secret: loc.secret, avatar: { name: 'x', url: 'https://evil.example/a.jpg' } }).avatar.url, '', 'immagine esterna scartata'); eq(C.restoreLocal({ handle: 'Simone', secret: loc.secret }).avatar, { name: '', url: '' }, 'senza immagine');
  console.log('community-test: ' + n + ' controlli ok');
})().catch(e => { console.error(e); process.exit(1); });
