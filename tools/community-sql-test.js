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

  /* l'orologio: seen_at si aggiorna */
  await db.exec('reset role'); const t0 = (await db.query("select seen_at from public.cpa_profiles where handle_key = 'simone'")).rows[0].seen_at; await db.exec('select pg_sleep(0.05)'); await db.exec('set role anon');
  await call('cpa_login', { p_handle: 'Simone', p_secret: SECRET }); await db.exec('reset role');
  ok((await db.query("select seen_at from public.cpa_profiles where handle_key = 'simone'")).rows[0].seen_at > t0, 'seen_at si aggiorna all\'accesso');

  console.log('community-sql-test: ' + n + ' controlli ok');
  await db.close();
})().catch(e => { console.error(e); process.exit(1); });
