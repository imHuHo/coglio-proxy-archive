/* Prova lo schema SQL del Codighel ID su un Postgres vero (PGlite, in memoria), chiamando le funzioni come farebbe la chiave «anon».
 * Uso: node tools/community-sql-test.js <cartella di @electric-sql/pglite>   (npm i @electric-sql/pglite in una cartella a parte) */
const path = require('path'), fs = require('fs'), assert = require('assert');
const dir = process.argv[2]; if (!dir) { console.error('serve la cartella di @electric-sql/pglite'); process.exit(2); }
const { PGlite } = require(path.resolve(dir));
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); }; const eq = (a, b, m) => { n++; assert.deepStrictEqual(a, b, m); };
const SECRET = 'ABCDE12345FGHJK67890', SECRET2 = 'ZZZZZ99999YYYYY88888';
const URL1 = 'https://cards.scryfall.io/art_crop/front/1/2/12345678-aaaa-bbbb-cccc-1234567890ab.jpg?1562903478';

(async () => {
  const db = new PGlite();
  await db.exec("create role anon nologin; create role authenticated nologin; grant usage on schema public to anon, authenticated;");
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
  await db.exec(sql); await db.exec(sql); ok(true, 'lo schema si può lanciare due volte');
  await db.exec('set role anon');
  const call = async (fn, args) => { const k = Object.keys(args || {}); const r = await db.query('select public.' + fn + '(' + k.map((x, i) => x + ' => $' + (i + 1)).join(', ') + ') as r', k.map(x => args[x])); return r.rows[0].r; };
  const fails = async (fn, args, msg, why) => { try { await call(fn, args); } catch (e) { n++; assert.ok(String(e.message).indexOf(msg) >= 0, why + ' (errore: ' + e.message + ')'); return; } assert.fail(why + ' (non ha dato errore)'); };

  /* l'anon non tocca la tabella */
  for (const q of ['select * from public.cpa_profiles', "insert into public.cpa_profiles (handle, handle_key, secret_hash) values ('abc','abc','x')", 'delete from public.cpa_profiles', 'select public.cpa_hash(\'x\')', 'select public.cpa_auth(\'abc\', \'ABCDE12345FGHJK67890\')']) {
    let denied = false; try { await db.query(q); } catch (e) { denied = /permission denied/i.test(e.message); } ok(denied, 'accesso negato: ' + q);
  }

  /* ID liberi, non validi, riservati */
  eq(await call('cpa_handle_free', { p_handle: 'Simone' }), true, 'Simone è libero');
  await fails('cpa_handle_free', { p_handle: 'a' }, 'bad_handle', 'troppo corto'); await fails('cpa_handle_free', { p_handle: 'ha spazi' }, 'bad_handle', 'con spazi');
  await fails('cpa_handle_free', { p_handle: 'x'.repeat(21) }, 'bad_handle', 'troppo lungo'); await fails('cpa_handle_free', { p_handle: 'è.accentata' }, 'bad_handle', 'accenti');
  await fails('cpa_handle_free', { p_handle: "a'; drop table x;--" }, 'bad_handle', 'iniezione SQL');
  eq(await call('cpa_handle_free', { p_handle: 'Admin' }), false, 'ID riservato (maiuscole comprese)'); eq(await call('cpa_handle_free', { p_handle: 'Pisciatore' }), false, 'riservato: Pisciatore');

  /* registrazione */
  const r = await call('cpa_register', { p_handle: 'Simone', p_secret: SECRET, p_name: 'Kaalia of the Vast', p_url: URL1 });
  ok(/^[0-9a-f-]{36}$/.test(r.id), 'registrato: restituisce il proprio id'); eq({ ...r, id: 0 }, { id: 0, handle: 'Simone', avatar_name: 'Kaalia of the Vast', avatar_url: URL1 }, 'registrato, con immagine');
  eq(await call('cpa_handle_free', { p_handle: 'simone' }), false, 'ora «simone» è preso (maiuscole ignorate)');
  await fails('cpa_register', { p_handle: 'SIMONE', p_secret: SECRET2 }, 'handle_taken', 'stesso ID con altre maiuscole');
  await fails('cpa_register', { p_handle: 'admin', p_secret: SECRET2 }, 'handle_taken', 'ID riservato');
  await fails('cpa_register', { p_handle: 'Luca', p_secret: 'corto' }, 'bad_secret', 'codice troppo corto'); await fails('cpa_register', { p_handle: 'Luca', p_secret: 'ABCDE-12345-FGHJK-67890' }, 'bad_secret', 'codice con trattini');
  await fails('cpa_register', { p_handle: 'Luca', p_secret: SECRET2, p_url: 'https://evil.example/x.jpg' }, 'bad_avatar', 'immagine fuori da Scryfall');
  await fails('cpa_register', { p_handle: 'Luca', p_secret: SECRET2, p_url: 'http://cards.scryfall.io/a.jpg' }, 'bad_avatar', 'immagine non https');
  await fails('cpa_register', { p_handle: 'Luca', p_secret: SECRET2, p_url: 'https://cards.scryfall.io.evil.com/a.jpg' }, 'bad_avatar', 'dominio che finge di essere Scryfall');
  await fails('cpa_register', { p_handle: 'Luca', p_secret: SECRET2, p_url: 'https://cards.scryfall.io/a.jpg"onerror="x' }, 'bad_avatar', 'virgolette nell\'indirizzo');
  eq({ ...(await call('cpa_register', { p_handle: 'Luca', p_secret: SECRET2 })), id: 0 }, { id: 0, handle: 'Luca', avatar_name: '', avatar_url: '' }, 'senza immagine va bene');

  /* il codice sul server è solo un'impronta */
  const su = await db.query('reset role; select secret_hash, handle_key from public.cpa_profiles order by handle_key').catch(async () => { await db.exec('reset role'); return db.query('select secret_hash, handle_key from public.cpa_profiles order by handle_key'); });
  const rows = (Array.isArray(su) ? su[su.length - 1] : su).rows;
  ok(rows.length === 2 && rows.every(x => /^[0-9a-f]{64}$/.test(x.secret_hash) && x.secret_hash.indexOf(SECRET) < 0), 'sul server resta un SHA-256, non il codice');
  eq(rows.map(x => x.handle_key), ['luca', 'simone'], 'chiave minuscola');
  ok(rows[0].secret_hash !== rows[1].secret_hash, 'codici diversi, impronte diverse');
  await db.exec('set role anon');

  /* accesso */
  eq((await call('cpa_login', { p_handle: 'simone', p_secret: SECRET })).handle, 'Simone', 'login con il codice giusto (ID senza badare alle maiuscole)');
  await fails('cpa_login', { p_handle: 'Simone', p_secret: SECRET2 }, 'bad_login', 'codice sbagliato'); await fails('cpa_login', { p_handle: 'Nessuno', p_secret: SECRET }, 'bad_login', 'ID che non esiste');
  await fails('cpa_login', { p_handle: 'Simone', p_secret: 'x' }, 'bad_login', 'codice malformato'); await fails('cpa_login', { p_handle: '', p_secret: SECRET }, 'bad_login', 'ID vuoto');
  await fails('cpa_login', { p_handle: 'Luca', p_secret: SECRET }, 'bad_login', 'il codice di un altro non apre il mio profilo');

  /* profilo pubblico */
  eq(await call('cpa_profile', { p_handle: 'SIMONE' }), { handle: 'Simone', avatar_name: 'Kaalia of the Vast', avatar_url: URL1 }, 'profilo pubblico: solo ID e immagine');
  eq(await call('cpa_profile', { p_handle: 'Nessuno' }), null, 'profilo che non esiste = nulla');
  ok(JSON.stringify(await call('cpa_profile', { p_handle: 'Simone' })).indexOf('hash') < 0, 'il profilo pubblico non espone l\'impronta');

  /* immagine */
  eq((await call('cpa_set_avatar', { p_handle: 'Luca', p_secret: SECRET2, p_name: 'Sol Ring', p_url: URL1 })).avatar_name, 'Sol Ring', 'cambio immagine');
  await fails('cpa_set_avatar', { p_handle: 'Luca', p_secret: SECRET, p_name: 'x', p_url: URL1 }, 'bad_login', 'cambio immagine con il codice di un altro');
  await fails('cpa_set_avatar', { p_handle: 'Luca', p_secret: SECRET2, p_name: 'x', p_url: 'https://evil.example/a.jpg' }, 'bad_avatar', 'immagine esterna rifiutata');
  eq((await call('cpa_set_avatar', { p_handle: 'Luca', p_secret: SECRET2, p_name: '', p_url: '' })).avatar_url, '', 'si può togliere l\'immagine');

  /* cambio ID */
  await fails('cpa_rename', { p_handle: 'Luca', p_secret: SECRET2, p_new: 'simone' }, 'handle_taken', 'ID già preso');
  await fails('cpa_rename', { p_handle: 'Luca', p_secret: SECRET2, p_new: 'admin' }, 'handle_taken', 'ID riservato');
  await fails('cpa_rename', { p_handle: 'Luca', p_secret: SECRET2, p_new: 'no!' }, 'bad_handle', 'ID non valido');
  await fails('cpa_rename', { p_handle: 'Luca', p_secret: SECRET, p_new: 'Marta' }, 'bad_login', 'rinominare con il codice di un altro');
  eq((await call('cpa_rename', { p_handle: 'Luca', p_secret: SECRET2, p_new: 'LUCA' })).handle, 'LUCA', 'si possono cambiare solo le maiuscole del proprio ID');
  eq((await call('cpa_rename', { p_handle: 'luca', p_secret: SECRET2, p_new: 'Luchino' })).handle, 'Luchino', 'rinominato');
  eq(await call('cpa_handle_free', { p_handle: 'Luca' }), true, 'il vecchio ID torna libero');
  eq((await call('cpa_login', { p_handle: 'Luchino', p_secret: SECRET2 })).handle, 'Luchino', 'il codice resta lo stesso dopo il cambio');

  /* eliminazione */
  await fails('cpa_delete', { p_handle: 'Luchino', p_secret: SECRET }, 'bad_login', 'eliminare con il codice di un altro');
  eq(await call('cpa_delete', { p_handle: 'Luchino', p_secret: SECRET2 }), true, 'profilo eliminato');
  await fails('cpa_login', { p_handle: 'Luchino', p_secret: SECRET2 }, 'bad_login', 'dopo l\'eliminazione non si entra'); eq(await call('cpa_handle_free', { p_handle: 'Luchino' }), true, 'e l\'ID si libera');
  eq((await call('cpa_login', { p_handle: 'Simone', p_secret: SECRET })).handle, 'Simone', 'gli altri profili non sono toccati');


  /* ----- amici ----- */
  const S3 = 'AAAAA11111BBBBB22222', S4 = 'CCCCC33333DDDDD44444', S5 = 'EEEEE55555FFFFF66666';
  for (const [h, sc] of [['Anna', S3], ['Bruno', S4], ['Carla', S5]]) await call('cpa_register', { p_handle: h, p_secret: sc });
  const fl = async (h, sc) => call('cpa_friend_list', { p_handle: h, p_secret: sc });
  const names = a => a.map(x => x.handle);
  const req = (h, sc, to) => call('cpa_friend_request', { p_handle: h, p_secret: sc, p_to: to });
  for (const q of ['select * from public.cpa_friends', 'delete from public.cpa_friends', "insert into public.cpa_friends (a, b) select a.id, b.id from public.cpa_profiles a, public.cpa_profiles b where a.id <> b.id limit 1"]) {
    let denied = false; try { await db.query(q); } catch (e) { denied = /permission denied/i.test(e.message); } ok(denied, 'amicizie: accesso negato: ' + q.slice(0, 40));
  }
  eq(await fl('Anna', S3), { friends: [], incoming: [], outgoing: [] }, 'all\'inizio niente amici');
  await fails('cpa_friend_list', { p_handle: 'Anna', p_secret: S4 }, 'bad_login', 'elenco con il codice di un altro');
  await fails('cpa_friend_request', { p_handle: 'Anna', p_secret: S4, p_to: 'Bruno' }, 'bad_login', 'richiesta con il codice di un altro');
  await fails('cpa_friend_request', { p_handle: 'Anna', p_secret: S3, p_to: 'Anna' }, 'self', 'non puoi chiedere l\'amicizia a te stesso'); await fails('cpa_friend_request', { p_handle: 'Anna', p_secret: S3, p_to: 'ANNA' }, 'self', '...nemmeno con le maiuscole');
  await fails('cpa_friend_request', { p_handle: 'Anna', p_secret: S3, p_to: 'Nessuno' }, 'no_such_user', 'ID che non esiste'); await fails('cpa_friend_request', { p_handle: 'Anna', p_secret: S3, p_to: 'no way' }, 'bad_handle', 'ID non valido');
  eq(await req('Anna', S3, 'bruno'), 'pending', 'richiesta inviata (ID senza badare alle maiuscole)');
  eq(await req('Anna', S3, 'Bruno'), 'pending', 'ripeterla non crea doppioni');
  eq([names((await fl('Anna', S3)).outgoing), names((await fl('Anna', S3)).friends)], [['Bruno'], []], 'Anna vede la richiesta inviata');
  eq([names((await fl('Bruno', S4)).incoming), names((await fl('Bruno', S4)).friends)], [['Anna'], []], 'Bruno vede la richiesta ricevuta'); eq((await fl('Carla', S5)).incoming, [], 'Carla non vede niente');
  await fails('cpa_friend_respond', { p_handle: 'Anna', p_secret: S3, p_from: 'Bruno', p_accept: true }, 'no_request', 'chi ha chiesto non può accettare da solo');
  await fails('cpa_friend_respond', { p_handle: 'Carla', p_secret: S5, p_from: 'Anna', p_accept: true }, 'no_request', 'un terzo non può accettare');
  await fails('cpa_friend_respond', { p_handle: 'Bruno', p_secret: S3, p_from: 'Anna', p_accept: true }, 'bad_login', 'accettare con il codice di un altro');
  eq(await call('cpa_friend_respond', { p_handle: 'Bruno', p_secret: S4, p_from: 'ANNA', p_accept: true }), true, 'Bruno accetta');
  const fa = await fl('Anna', S3), fb = await fl('Bruno', S4);
  eq([names(fa.friends), fa.outgoing, names(fb.friends), fb.incoming], [['Bruno'], [], ['Anna'], []], 'amici da tutte e due le parti, richieste chiuse');
  ok(/^[0-9a-f-]{36}$/.test(fa.friends[0].id), 'dell\'amico si vede l\'id interno (serve a sederlo al tavolo)'); eq({ ...fa.friends[0], id: 0 }, { id: 0, handle: 'Bruno', avatar_name: '', avatar_url: '' }, 'dell\'amico si vedono solo ID e immagine'); ok(JSON.stringify(fa).indexOf('hash') < 0 && JSON.stringify(fa).indexOf(S4) < 0, 'nessun segreto nell\'elenco');
  eq(await req('Bruno', S4, 'Anna'), 'accepted', 'chiedere a chi è già amico: già amici'); eq(await req('Anna', S3, 'Bruno'), 'accepted', '...da entrambe le parti');
  /* richieste incrociate: scatta subito */
  eq(await req('Anna', S3, 'Carla'), 'pending', 'Anna chiede a Carla'); eq(await req('Carla', S5, 'Anna'), 'accepted', 'Carla chiede ad Anna che le aveva già chiesto: amici subito');
  eq(names((await fl('Anna', S3)).friends), ['Bruno', 'Carla'], 'Anna ha due amici, in ordine alfabetico'); eq((await fl('Carla', S5)).incoming, [], 'e nessuna richiesta in sospeso');
  /* rifiuto */
  const S6 = 'GGGGG77777HHHHH88888'; await call('cpa_register', { p_handle: 'Dario', p_secret: S6 });
  eq(await req('Dario', S6, 'Bruno'), 'pending', 'Dario chiede a Bruno'); eq(await call('cpa_friend_respond', { p_handle: 'Bruno', p_secret: S4, p_from: 'Dario', p_accept: false }), false, 'Bruno rifiuta');
  eq([(await fl('Dario', S6)).outgoing, (await fl('Bruno', S4)).incoming], [[], []], 'la richiesta sparisce da entrambe le parti');
  eq(await req('Dario', S6, 'Bruno'), 'pending', 'dopo un rifiuto si può richiedere'); await fails('cpa_friend_respond', { p_handle: 'Bruno', p_secret: S4, p_from: 'Nessuno', p_accept: true }, 'no_request', 'rispondere a un ID che non esiste');
  /* annullare e togliere */
  eq(await call('cpa_friend_remove', { p_handle: 'Dario', p_secret: S6, p_other: 'Bruno' }), true, 'chi ha chiesto può annullare'); eq((await fl('Bruno', S4)).incoming, [], 'e Bruno non la vede più');
  eq(await call('cpa_friend_remove', { p_handle: 'Dario', p_secret: S6, p_other: 'Bruno' }), false, 'togliere qualcosa che non c\'è: false'); eq(await call('cpa_friend_remove', { p_handle: 'Dario', p_secret: S6, p_other: 'Nessuno' }), false, 'ID che non esiste: false');
  await fails('cpa_friend_remove', { p_handle: 'Anna', p_secret: S4, p_other: 'Bruno' }, 'bad_login', 'togliere un amico con il codice di un altro');
  eq(await call('cpa_friend_remove', { p_handle: 'Bruno', p_secret: S4, p_other: 'anna' }), true, 'Bruno toglie Anna'); eq([names((await fl('Anna', S3)).friends), (await fl('Bruno', S4)).friends], [['Carla'], []], 'non sono più amici, per nessuno dei due');
  eq(await req('Bruno', S4, 'Anna'), 'pending', 'e si può ricominciare (la richiesta va dal nuovo richiedente)'); eq(names((await fl('Anna', S3)).incoming), ['Bruno'], 'ora è Anna a riceverla');
  /* rinominare non rompe le amicizie, eliminare le porta via */
  await call('cpa_rename', { p_handle: 'Carla', p_secret: S5, p_new: 'Carlotta' }); eq(names((await fl('Anna', S3)).friends), ['Carlotta'], 'chi cambia ID resta amico, col nuovo nome');
  await call('cpa_delete', { p_handle: 'Carlotta', p_secret: S5 }); eq((await fl('Anna', S3)).friends, [], 'eliminando il profilo spariscono le sue amicizie'); await db.exec('reset role'); eq((await db.query("select count(*)::int c from public.cpa_friends where status = 'accepted'")).rows[0].c, 0, 'nessuna riga orfana'); await db.exec('set role anon');
  /* limiti */
  const bot = i => ['Bot' + String(i).padStart(2, '0'), 'BBBBB' + String(i).padStart(2, '0') + 'CCCCCDDDDDEEE'];
  for (let i = 0; i < 31; i++) await call('cpa_register', { p_handle: bot(i)[0], p_secret: bot(i)[1] });
  for (let i = 0; i < 30; i++) await req('Dario', S6, bot(i)[0]);
  await fails('cpa_friend_request', { p_handle: 'Dario', p_secret: S6, p_to: bot(30)[0] }, 'too_many', 'al massimo 30 richieste in attesa');
  eq((await fl('Dario', S6)).outgoing.length, 30, 'le prime 30 ci sono');


  /* ----- tavoli condivisi ----- */
  const SE = 'ELENA1111122222AAAAA', SF = 'FABIO1111122222BBBBB', SG = 'GINO11111222223CCCCC', SH = 'HUGO11111222224DDDDD';
  const id = {};
  for (const [h, sc] of [['Elena', SE], ['Fabio', SF], ['Gino', SG], ['Hugo', SH]]) { await call('cpa_register', { p_handle: h, p_secret: sc }); }
  await req('Elena', SE, 'Fabio'); await call('cpa_friend_respond', { p_handle: 'Fabio', p_secret: SF, p_from: 'Elena', p_accept: true });
  await req('Elena', SE, 'Gino'); await call('cpa_friend_respond', { p_handle: 'Gino', p_secret: SG, p_from: 'Elena', p_accept: true });
  for (const [h, sc, o] of [['Elena', SE, 'Fabio'], ['Fabio', SF, 'Elena']]) { const f = (await fl(h, sc)).friends.find(x => x.handle === o); id[o] = f.id; }
  id.Gino = (await fl('Elena', SE)).friends.find(x => x.handle === 'Gino').id; id.Elena = (await fl('Fabio', SF)).friends[0].id;
  const tsave = (h, sc, a) => call('cpa_table_save', { p_handle: h, p_secret: sc, p_id: a.id || null, p_name: a.name, p_players: JSON.stringify(a.players), p_start: a.start == null ? 40 : a.start, p_cmd_life: a.cmd == null ? true : a.cmd });
  const tlist = (h, sc) => call('cpa_table_list', { p_handle: h, p_secret: sc });
  const tgames = (h, sc, t) => call('cpa_table_games', { p_handle: h, p_secret: sc, p_id: t });
  const gadd = (h, sc, t, rec) => call('cpa_game_add', { p_handle: h, p_secret: sc, p_table: t, p_rec: JSON.stringify(rec) });
  for (const q of ['select * from public.cpa_tables', 'select * from public.cpa_games', 'select * from public.cpa_table_members', 'delete from public.cpa_tables', 'select public.cpa_roster(\'[]\'::json, null, \'{}\')', 'select public.cpa_table_doc(null, null)']) {
    let denied = false; try { await db.query(q); } catch (e) { denied = /permission denied/i.test(e.message); } ok(denied, 'tavoli: accesso negato: ' + q.slice(0, 40));
  }
  const P4 = [{ name: 'boh', u: id.Elena }, { name: 'x', u: id.Fabio }, { name: 'Ospite' }, { name: '  Marta  ' }];
  /* controlli sui posti */
  await fails('cpa_table_save', { p_handle: 'Elena', p_secret: SE, p_id: null, p_name: 'T', p_players: JSON.stringify([{ name: 'solo' }]), p_start: 40, p_cmd_life: true }, 'bad_data', 'un solo posto');
  await fails('cpa_table_save', { p_handle: 'Elena', p_secret: SE, p_id: null, p_name: 'T', p_players: JSON.stringify(Array.from({ length: 7 }, (_, i) => ({ name: 'g' + i }))), p_start: 40, p_cmd_life: true }, 'bad_data', 'sette posti');
  await fails('cpa_table_save', { p_handle: 'Elena', p_secret: SE, p_id: null, p_name: 'T', p_players: JSON.stringify([{ name: 'a' }, { name: ' ' }]), p_start: 40, p_cmd_life: true }, 'bad_data', 'nome libero vuoto');
  await fails('cpa_table_save', { p_handle: 'Elena', p_secret: SE, p_id: null, p_name: 'T', p_players: JSON.stringify([{ name: 'a' }, { name: 'b', u: 'non-un-uuid' }]), p_start: 40, p_cmd_life: true }, 'bad_data', 'id non valido');
  await fails('cpa_table_save', { p_handle: 'Elena', p_secret: SE, p_id: null, p_name: 'T', p_players: JSON.stringify([{ name: 'a' }, { name: 'b', u: '11111111-1111-1111-1111-111111111111' }]), p_start: 40, p_cmd_life: true }, 'bad_data', 'id che non esiste');
  await fails('cpa_table_save', { p_handle: 'Elena', p_secret: SE, p_id: null, p_name: 'T', p_players: JSON.stringify([{ u: id.Fabio }, { u: id.Fabio }]), p_start: 40, p_cmd_life: true }, 'bad_data', 'lo stesso amico due volte');
  const hugoId = (await db.exec('reset role').then(() => db.query("select id from public.cpa_profiles where handle_key = 'hugo'"))).rows[0].id; await db.exec('set role anon');
  await fails('cpa_table_save', { p_handle: 'Elena', p_secret: SE, p_id: null, p_name: 'T', p_players: JSON.stringify([{ name: 'a' }, { u: hugoId }]), p_start: 40, p_cmd_life: true }, 'not_friend', 'chi non è amico non si siede');
  await fails('cpa_table_save', { p_handle: 'Elena', p_secret: SE, p_id: null, p_name: '  ', p_players: JSON.stringify(P4), p_start: 40, p_cmd_life: true }, 'bad_data', 'tavolo senza nome');
  await fails('cpa_table_save', { p_handle: 'Elena', p_secret: SE, p_id: null, p_name: 'T', p_players: JSON.stringify(P4), p_start: 0, p_cmd_life: true }, 'bad_data', 'vita iniziale 0');
  await fails('cpa_table_save', { p_handle: 'Elena', p_secret: SF, p_id: null, p_name: 'T', p_players: JSON.stringify(P4), p_start: 40, p_cmd_life: true }, 'bad_login', 'creare con il codice di un altro');
  eq(await tlist('Elena', SE), [], 'nessun tavolo all\'inizio');
  const T = await tsave('Elena', SE, { name: '  Il venerdì  ', players: P4, start: 30, cmd: false });
  eq([T.name, T.owner, T.mine, T.start, T.cmd_life, T.players.map(p => p.name), T.players.map(p => !!p.u)], ['Il venerdì', 'Elena', true, 30, false, ['Elena', 'Fabio', 'Ospite', 'Marta'], [true, true, false, false]], 'tavolo creato: nomi degli amici presi dai loro ID, i liberi ripuliti');
  eq([T.players[0].u, T.players[1].u], [id.Elena, id.Fabio], 'gli amici hanno il loro id');
  /* chi lo vede */
  const tf = await tlist('Fabio', SF); eq([tf.length, tf[0].id, tf[0].mine, tf[0].owner], [1, T.id, false, 'Elena'], 'Fabio lo vede (non suo)');
  eq([await tlist('Gino', SG), await tlist('Hugo', SH)], [[], []], 'chi non è al tavolo non lo vede');
  await fails('cpa_table_games', { p_handle: 'Hugo', p_secret: SH, p_id: T.id }, 'no_table', 'Hugo non vede le partite'); await fails('cpa_table_games', { p_handle: 'Hugo', p_secret: SH, p_id: null }, 'no_table', 'tavolo nullo');
  await fails('cpa_table_save', { p_handle: 'Fabio', p_secret: SF, p_id: T.id, p_name: 'Mio', p_players: JSON.stringify(P4), p_start: 40, p_cmd_life: true }, 'not_owner', 'un invitato non cambia il tavolo');
  await fails('cpa_table_save', { p_handle: 'Hugo', p_secret: SH, p_id: T.id, p_name: 'Mio', p_players: JSON.stringify(P4), p_start: 40, p_cmd_life: true }, 'no_table', 'un estraneo non sa nemmeno che esiste');
  /* partite */
  eq(await tgames('Fabio', SF, T.id), [], 'nessuna partita all\'inizio');
  const rec = { t: 1000, ms: 65000, rounds: 7, start: 30, players: [{ name: 'Elena', u: id.Elena, life: 12, out: false }, { name: 'Fabio', u: id.Fabio, life: -4, out: true }, { name: 'Ospite', life: 3, out: false, extra: 'x' }, { name: 'Hugo', u: hugoId, life: 100000, out: false }], winner: 'Elena', wu: id.Elena, deck: '  Kaalia  ', inutile: 'boh' };
  const g1 = await gadd('Fabio', SF, T.id, rec); ok(/^[0-9a-f-]{36}$/.test(g1.gid), 'partita registrata da un invitato');
  const gl = await tgames('Elena', SE, T.id); eq(gl.length, 1, 'la vede anche il proprietario');
  eq([gl[0].gid, gl[0].winner, gl[0].wu, gl[0].deck, gl[0].rounds, gl[0].t, 'inutile' in gl[0]], [g1.gid, 'Elena', id.Elena, 'Kaalia', 7, 1000, false], 'partita ripulita');
  eq(gl[0].players.map(p => [p.name, p.u, p.life, p.out, 'extra' in p]), [['Elena', id.Elena, 12, false, false], ['Fabio', id.Fabio, -4, true, false], ['Ospite', null, 3, false, false], ['Hugo', null, 9999, false, false]], 'giocatori: id solo di chi è al tavolo, vita limitata');
  eq((await gadd('Elena', SE, T.id, { ...rec, t: 2000, winner: '', wu: hugoId, deck: '' })).gid.length, 36, 'seconda partita, senza vincitore'); eq((await tgames('Fabio', SF, T.id)).map(g => [g.t, g.wu]), [[2000, null], [1000, id.Elena]], 'ordine: la più recente per prima; vincitore estraneo scartato');
  await fails('cpa_game_add', { p_handle: 'Hugo', p_secret: SH, p_table: T.id, p_rec: JSON.stringify(rec) }, 'no_table', 'un estraneo non registra partite');
  await fails('cpa_game_add', { p_handle: 'Fabio', p_secret: SF, p_table: T.id, p_rec: JSON.stringify({ ...rec, players: [rec.players[0]] }) }, 'bad_data', 'un solo giocatore'); await fails('cpa_game_add', { p_handle: 'Fabio', p_secret: SF, p_table: T.id, p_rec: '"stringa"' }, 'bad_data', 'non è un oggetto');
  await fails('cpa_game_add', { p_handle: 'Fabio', p_secret: SF, p_table: T.id, p_rec: JSON.stringify({ ...rec, t: 'domani' }) }, 'bad_data', 'tempo non numerico'); await fails('cpa_game_add', { p_handle: 'Fabio', p_secret: SF, p_table: T.id, p_rec: JSON.stringify({ ...rec, deck: 'x'.repeat(9000) }) }, 'bad_data', 'troppo grande');
  await fails('cpa_game_add', { p_handle: 'Fabio', p_secret: SE, p_table: T.id, p_rec: JSON.stringify(rec) }, 'bad_login', 'partita con il codice di un altro');
  eq((await gadd('Fabio', SF, T.id, { ...rec, t: 3000, deck: 'x'.repeat(200), winner: 'y'.repeat(80), players: rec.players.slice(0, 2).map(p => ({ ...p, name: ' ' })) }))?.gid.length, 36, 'nomi vuoti: «?»'); const g3 = (await tgames('Fabio', SF, T.id))[0]; eq([g3.deck.length, g3.winner.length, g3.players.map(p => p.name)], [60, 24, ['?', '?']], 'testi tagliati');
  await fails('cpa_game_delete', { p_handle: 'Hugo', p_secret: SH, p_table: T.id, p_game: g1.gid }, 'no_table', 'un estraneo non elimina partite');
  eq(await call('cpa_game_delete', { p_handle: 'Fabio', p_secret: SF, p_table: T.id, p_game: g1.gid }), true, 'un invitato elimina una partita'); eq(await call('cpa_game_delete', { p_handle: 'Fabio', p_secret: SF, p_table: T.id, p_game: g1.gid }), false, 'già eliminata'); eq((await tgames('Elena', SE, T.id)).length, 2, 'ne restano due');
  /* chi cambia ID si vede col nuovo nome */
  await call('cpa_rename', { p_handle: 'Fabio', p_secret: SF, p_new: 'Fabione' }); eq((await tlist('Elena', SE))[0].players.map(p => p.name), ['Elena', 'Fabione', 'Ospite', 'Marta'], 'nel tavolo si vede il nuovo ID'); await call('cpa_rename', { p_handle: 'Fabione', p_secret: SF, p_new: 'Fabio' });
  /* il proprietario cambia i posti */
  const T2 = await tsave('Elena', SE, { id: T.id, name: 'Venerdì sera', players: [{ u: id.Elena }, { u: id.Fabio }, { u: id.Gino }, { name: 'Marta' }], start: 40 });
  eq([T2.id, T2.name, T2.start, T2.cmd_life, T2.players.map(p => p.name)], [T.id, 'Venerdì sera', 40, true, ['Elena', 'Fabio', 'Gino', 'Marta']], 'tavolo aggiornato, stesso id'); eq((await tlist('Gino', SG)).length, 1, 'Gino adesso lo vede'); eq((await tgames('Gino', SG, T.id)).length, 2, 'e vede le partite');
  await call('cpa_friend_remove', { p_handle: 'Elena', p_secret: SE, p_other: 'Gino' });
  eq((await tsave('Elena', SE, { id: T.id, name: 'Venerdì sera', players: [{ u: id.Elena }, { u: id.Fabio }, { u: id.Gino }, { name: 'Marta' }] })).players.length, 4, 'chi è già al tavolo resta anche se l\'amicizia finisce');
  await fails('cpa_table_save', { p_handle: 'Elena', p_secret: SE, p_id: null, p_name: 'Altro', p_players: JSON.stringify([{ u: id.Elena }, { u: id.Gino }]), p_start: 40, p_cmd_life: true }, 'not_friend', 'ma un tavolo nuovo non lo accetta');
  const T3 = await tsave('Elena', SE, { id: T.id, name: 'Venerdì sera', players: [{ u: id.Elena }, { u: id.Gino }, { name: 'Marta' }] }); eq([T3.players.length, (await tlist('Fabio', SF)).length], [3, 0], 'tolto Fabio dai posti: non vede più il tavolo');
  await fails('cpa_table_games', { p_handle: 'Fabio', p_secret: SF, p_id: T.id }, 'no_table', 'né le sue partite');
  /* lasciare il tavolo */
  await fails('cpa_table_leave', { p_handle: 'Elena', p_secret: SE, p_id: T.id }, 'is_owner', 'il proprietario non lo lascia, lo elimina'); await fails('cpa_table_leave', { p_handle: 'Hugo', p_secret: SH, p_id: T.id }, 'no_table', 'un estraneo non può lasciarlo');
  eq(await call('cpa_table_leave', { p_handle: 'Gino', p_secret: SG, p_id: T.id }), true, 'Gino lascia il tavolo'); eq([(await tlist('Gino', SG)).length, (await tlist('Elena', SE))[0].players.map(p => [p.name, !!p.u])], [0, [['Elena', true], ['Gino', false], ['Marta', false]]], 'il suo posto resta come nome libero');
  /* eliminare */
  await call('cpa_table_save', { p_handle: 'Elena', p_secret: SE, p_id: T.id, p_name: 'Venerdì sera', p_players: JSON.stringify([{ u: id.Elena }, { u: id.Fabio }, { name: 'Marta' }]), p_start: 40, p_cmd_life: true });
  await fails('cpa_table_delete', { p_handle: 'Fabio', p_secret: SF, p_id: T.id }, 'not_owner', 'un invitato non elimina il tavolo'); await fails('cpa_table_delete', { p_handle: 'Hugo', p_secret: SH, p_id: T.id }, 'no_table', 'un estraneo nemmeno');
  eq(await call('cpa_table_delete', { p_handle: 'Elena', p_secret: SE, p_id: T.id }), true, 'il proprietario elimina'); eq([await tlist('Elena', SE), await tlist('Fabio', SF)], [[], []], 'sparito per tutti');
  await db.exec('reset role'); eq([(await db.query('select count(*)::int c from public.cpa_games')).rows[0].c, (await db.query('select count(*)::int c from public.cpa_table_members')).rows[0].c], [0, 0], 'partite e membri portati via insieme al tavolo'); await db.exec('set role anon');
  /* eliminare il profilo del proprietario porta via i suoi tavoli */
  const T4 = await tsave('Gino', SG, { name: 'Di Gino', players: [{ u: id.Gino }, { name: 'Ospite' }] }); await call('cpa_delete', { p_handle: 'Gino', p_secret: SG }); await db.exec('reset role'); eq((await db.query('select count(*)::int c from public.cpa_tables where id = $1', [T4.id])).rows[0].c, 0, 'eliminato il profilo, spariscono i suoi tavoli'); await db.exec('set role anon');
  /* limiti: 20 tavoli, 500 partite */
  const tiny = n => ({ name: 'T' + n, players: [{ name: 'a' }, { name: 'b' }] }); let first;
  for (let i = 0; i < 20; i++) { const t = await tsave('Hugo', SH, tiny(i)); if (!i) first = t; }
  await fails('cpa_table_save', { p_handle: 'Hugo', p_secret: SH, p_id: null, p_name: 'T20', p_players: JSON.stringify(tiny(20).players), p_start: 40, p_cmd_life: true }, 'too_many', 'al massimo 20 tavoli propri'); eq((await tlist('Hugo', SH)).length, 20, 'i primi 20 ci sono');
  await db.exec('reset role'); await db.query("insert into public.cpa_games (table_id, t, rec) select $1, g, '{\"players\":[{},{}]}'::jsonb from generate_series(1, 499) g", [first.id]); await db.exec('set role anon');
  for (let i = 0; i < 3; i++) await gadd('Hugo', SH, first.id, { t: 10000 + i, players: [{ name: 'a' }, { name: 'b' }] });
  await db.exec('reset role'); eq((await db.query('select count(*)::int c from public.cpa_games where table_id = $1', [first.id])).rows[0].c, 500, 'al massimo 500 partite per tavolo'); eq((await db.query('select min(t)::int m from public.cpa_games where table_id = $1', [first.id])).rows[0].m, 3, 'si perdono le più vecchie'); await db.exec('set role anon');


  /* ----- Chat? Ma questa cosa è reale? ----- */
  const fpost = (h, sc, a) => call('cpa_feed_post', { p_handle: h, p_secret: sc, p_deck: a.deck == null ? 'd1' : a.deck, p_name: a.name || 'Mazzo Kaalia', p_cmd: a.cmd == null ? 'Kaalia of the Vast' : a.cmd, p_img: a.img == null ? URL1 : a.img, p_from: a.from, p_to: a.to });
  const flist = (h, sc) => call('cpa_feed_list', { p_handle: h, p_secret: sc });
  for (const q of ['select * from public.cpa_feed', 'insert into public.cpa_feed (author, from_st, to_st) values (null, \'active\', \'inactive\')', 'delete from public.cpa_feed']) {
    let denied = false; try { await db.query(q); } catch (e) { denied = /permission denied/i.test(e.message); } ok(denied, 'annunci: accesso negato: ' + q.slice(0, 40));
  }
  eq(await flist('Elena', SE), [], 'all\'inizio nessun annuncio');
  const f1 = await fpost('Elena', SE, { from: 'unprinted', to: 'printed' }); ok(/^[0-9a-f-]{36}$/.test(f1.id), 'annuncio pubblicato');
  const l1 = await flist('Fabio', SF); eq(l1.length, 1, 'lo vede l\'amico'); const e1 = l1[0];
  eq([e1.mine, e1.author.handle, e1.deck, e1.commander, e1.image, e1.from, e1.to, e1.id], [false, 'Elena', 'Mazzo Kaalia', 'Kaalia of the Vast', URL1, 'unprinted', 'printed', f1.id], 'con commander, immagine e stati');
  ok(typeof e1.t === 'number' && Math.abs(e1.t - Date.now()) < 3600e3 * 24, 'orario in millisecondi'); eq((await flist('Elena', SE))[0].mine, true, 'chi lo scrive lo vede come suo');
  eq(await flist('Hugo', SH), [], 'chi non è amico non lo vede');
  await fails('cpa_feed_list', { p_handle: 'Fabio', p_secret: SE }, 'bad_login', 'con il codice di un altro');
  for (const [a, m] of [[{ from: 'x', to: 'printed' }, 'stato non valido'], [{ from: 'printed', to: 'printed' }, 'stesso stato'], [{ from: 'active', to: 'binder' }, 'binder non è uno stato annunciabile']]) await fails('cpa_feed_post', { p_handle: 'Elena', p_secret: SE, p_deck: 'd9', p_name: 'x', p_cmd: 'y', p_img: '', p_from: a.from, p_to: a.to }, 'bad_data', m);
  await fails('cpa_feed_post', { p_handle: 'Elena', p_secret: SF, p_deck: 'd9', p_name: 'x', p_cmd: 'y', p_img: '', p_from: 'active', p_to: 'inactive' }, 'bad_login', 'annunciare con il codice di un altro');
  /* un'immagine che non è di Scryfall si scarta, i testi si accorciano */
  await fpost('Elena', SE, { deck: 'd2', name: 'N'.repeat(200), cmd: 'C'.repeat(200), img: 'https://evil.example/a.jpg', from: 'active', to: 'inactive' });
  const e2 = (await flist('Elena', SE))[0]; eq([e2.image, e2.deck.length, e2.commander.length, e2.from, e2.to], ['', 60, 80, 'active', 'inactive'], 'immagine esterna scartata, testi tagliati');
  /* cambi ravvicinati dello stesso mazzo si fondono */
  const e3 = await fpost('Elena', SE, { deck: 'd1', from: 'printed', to: 'active' }); const l3 = (await flist('Fabio', SF)).filter(x => x.deck === 'Mazzo Kaalia');
  eq([l3.length, l3[0].from, l3[0].to, l3[0].id === e3.id], [1, 'unprinted', 'active', true], 'da stampare→stampato→attivo in pochi minuti: un solo annuncio, da stampare→attivo');
  eq(await fpost('Elena', SE, { deck: 'd1', from: 'active', to: 'unprinted' }), null, 'tornare allo stato di partenza: niente annuncio'); eq((await flist('Fabio', SF)).filter(x => x.deck === 'Mazzo Kaalia').length, 0, 'e sparisce quello di prima');
  /* ritirare un annuncio */
  const e4 = await fpost('Elena', SE, { deck: 'd3', name: 'Terzo', from: 'inactive', to: 'active' });
  eq(await call('cpa_feed_delete', { p_handle: 'Fabio', p_secret: SF, p_id: e4.id }), false, 'non si ritira quello di un altro'); eq(await call('cpa_feed_delete', { p_handle: 'Elena', p_secret: SE, p_id: e4.id }), true, 'si ritira il proprio'); eq(await call('cpa_feed_delete', { p_handle: 'Elena', p_secret: SE, p_id: e4.id }), false, 'già ritirato');
  /* gli amici tolti non si leggono più */
  await call('cpa_friend_remove', { p_handle: 'Fabio', p_secret: SF, p_other: 'Elena' }); eq((await flist('Fabio', SF)).length, 0, 'tolta l\'amicizia, niente più annunci di Elena'); await req('Elena', SE, 'Fabio'); await call('cpa_friend_respond', { p_handle: 'Fabio', p_secret: SF, p_from: 'Elena', p_accept: true });
  eq((await flist('Fabio', SF)).length > 0, true, 'rifatta l\'amicizia tornano');
  /* limite: 40 all'ora */
  for (let i = 0; i < 40; i++) { try { await fpost('Hugo', SH, { deck: 'x' + i, from: 'unprinted', to: 'printed' }); } catch (e) { eq(i >= 40, false, 'troppo presto'); } }
  await fails('cpa_feed_post', { p_handle: 'Hugo', p_secret: SH, p_deck: 'x99', p_name: 'x', p_cmd: 'y', p_img: '', p_from: 'unprinted', p_to: 'printed' }, 'too_many', 'al massimo 40 annunci all\'ora');
  eq((await flist('Hugo', SH)).length, 40, 'e l\'elenco ne mostra al massimo 60');
  /* eliminare il profilo porta via gli annunci */
  await call('cpa_delete', { p_handle: 'Hugo', p_secret: SH }); await db.exec('reset role'); eq((await db.query('select count(*)::int c from public.cpa_feed where author not in (select id from public.cpa_profiles)')).rows[0].c, 0, 'eliminato il profilo, spariscono i suoi annunci'); await db.exec('set role anon');

  /* l'orologio: seen_at si aggiorna */
  await db.exec('reset role'); const t0 = (await db.query("select seen_at from public.cpa_profiles where handle_key = 'simone'")).rows[0].seen_at; await db.exec('select pg_sleep(0.05)'); await db.exec('set role anon');
  await call('cpa_login', { p_handle: 'Simone', p_secret: SECRET }); await db.exec('reset role');
  ok((await db.query("select seen_at from public.cpa_profiles where handle_key = 'simone'")).rows[0].seen_at > t0, 'seen_at si aggiorna all\'accesso');

  console.log('community-sql-test: ' + n + ' controlli ok');
  await db.close();
})().catch(e => { console.error(e); process.exit(1); });
