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
  eq(r, { handle: 'Simone', avatar_name: 'Kaalia of the Vast', avatar_url: URL1 }, 'registrato, con immagine');
  eq(await call('cpa_handle_free', { p_handle: 'simone' }), false, 'ora «simone» è preso (maiuscole ignorate)');
  await fails('cpa_register', { p_handle: 'SIMONE', p_secret: SECRET2 }, 'handle_taken', 'stesso ID con altre maiuscole');
  await fails('cpa_register', { p_handle: 'admin', p_secret: SECRET2 }, 'handle_taken', 'ID riservato');
  await fails('cpa_register', { p_handle: 'Luca', p_secret: 'corto' }, 'bad_secret', 'codice troppo corto'); await fails('cpa_register', { p_handle: 'Luca', p_secret: 'ABCDE-12345-FGHJK-67890' }, 'bad_secret', 'codice con trattini');
  await fails('cpa_register', { p_handle: 'Luca', p_secret: SECRET2, p_url: 'https://evil.example/x.jpg' }, 'bad_avatar', 'immagine fuori da Scryfall');
  await fails('cpa_register', { p_handle: 'Luca', p_secret: SECRET2, p_url: 'http://cards.scryfall.io/a.jpg' }, 'bad_avatar', 'immagine non https');
  await fails('cpa_register', { p_handle: 'Luca', p_secret: SECRET2, p_url: 'https://cards.scryfall.io.evil.com/a.jpg' }, 'bad_avatar', 'dominio che finge di essere Scryfall');
  await fails('cpa_register', { p_handle: 'Luca', p_secret: SECRET2, p_url: 'https://cards.scryfall.io/a.jpg"onerror="x' }, 'bad_avatar', 'virgolette nell\'indirizzo');
  eq(await call('cpa_register', { p_handle: 'Luca', p_secret: SECRET2 }), { handle: 'Luca', avatar_name: '', avatar_url: '' }, 'senza immagine va bene');

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
  eq(fa.friends[0], { handle: 'Bruno', avatar_name: '', avatar_url: '' }, 'dell\'amico si vedono solo ID e immagine'); ok(JSON.stringify(fa).indexOf('hash') < 0 && JSON.stringify(fa).indexOf(S4) < 0, 'nessun segreto nell\'elenco');
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

  /* l'orologio: seen_at si aggiorna */
  await db.exec('reset role'); const t0 = (await db.query("select seen_at from public.cpa_profiles where handle_key = 'simone'")).rows[0].seen_at; await db.exec('select pg_sleep(0.05)'); await db.exec('set role anon');
  await call('cpa_login', { p_handle: 'Simone', p_secret: SECRET }); await db.exec('reset role');
  ok((await db.query("select seen_at from public.cpa_profiles where handle_key = 'simone'")).rows[0].seen_at > t0, 'seen_at si aggiorna all\'accesso');

  console.log('community-sql-test: ' + n + ' controlli ok');
  await db.close();
})().catch(e => { console.error(e); process.exit(1); });
