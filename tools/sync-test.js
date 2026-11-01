/* Test della sincronizzazione (sync.js): unione a tre vie, Dropbox e Google Drive simulati. */
const S = require('../web/sync.js'), C = require('../web/core.js'), nodeCrypto = require('crypto');
const assert = require('assert');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };

/* ---------- SHA-256 e PKCE ---------- */
for (const t of ['', 'abc', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'è€🙂'.repeat(50)]) {
  ok(Buffer.from(S.sha256(new TextEncoder().encode(t))).toString('hex') === nodeCrypto.createHash('sha256').update(t).digest('hex'), 'sha256 di ' + t.length + ' caratteri');
}
ok(S.b64url(S.sha256(new TextEncoder().encode('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'))) === 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', 'PKCE: esempio dell\'RFC 7636');

/* ---------- unione ---------- */
const D = (id, name, t, extra) => Object.assign({ id, name, kind: 'deck', status: 'active', active: true, commander: null, bracket: null, cards: [{ name: 'Sol Ring', qty: 1, set: '', cn: '' }], upgrades: [], createdAt: 1000 + (parseInt(id.slice(1), 10) || 0), updatedAt: t }, extra || {});
const SET = (o) => Object.assign({ theme: 'auto', basicsUnlimited: true, images: true }, o || {});
const NOW = 5e12;
const mg = (o) => S.merge(Object.assign({ now: NOW, settings: SET(), state: {}, remote: null }, o));
const ids = m => m.decks.map(d => d.id).join();

{ /* primo collegamento senza file: si carica tutto */
  const m = mg({ decks: [D('d1', 'A', 10), D('d2', 'B', 20)] });
  ok(ids(m) === 'd1,d2' && !m.localChanged && m.remoteChanged, 'primo collegamento: tutto verso il cloud');
  ok(m.snapshot.app === 'coglio-proxy-archive' && m.lastIds.length === 2, 'istantanea');
}
{ /* secondo dispositivo vuoto: scarica tutto */
  const remote = { decks: [D('d1', 'A', 10), D('d2', 'B', 20)], tombs: {}, settings: { basicsUnlimited: false, images: true }, settingsAt: 50 };
  const m = mg({ decks: [], remote });
  ok(ids(m) === 'd1,d2' && m.added.length === 2 && m.localChanged && !m.remoteChanged, 'telefono nuovo: scarica i due mazzi');
  ok(m.settings.basicsUnlimited === false && m.settingsFromRemote, 'e prende le impostazioni del file');
}
{ /* due dispositivi con mazzi diversi: unione */
  const remote = { decks: [D('d2', 'B', 20)], tombs: {}, settings: { basicsUnlimited: true, images: true }, settingsAt: 1 };
  const m = mg({ decks: [D('d1', 'A', 10)], remote });
  ok(ids(m) === 'd1,d2' && m.added.join() === 'd2' && m.remoteChanged, 'unione: ognuno ha quello che mancava');
}
{ /* lo stesso mazzo modificato: vince il piu' recente */
  const remote = { decks: [D('d1', 'A cloud', 30)], tombs: {}, settings: SET(), settingsAt: 1 };
  let m = mg({ decks: [D('d1', 'A locale', 20)], remote, state: { lastIds: ['d1'], setHash: S.canon(S.settingsPart(SET())), settingsAt: 1 } });
  ok(m.decks[0].name === 'A cloud' && m.updated.join() === 'd1' && !m.remoteChanged, 'vince il cloud, più recente');
  m = mg({ decks: [D('d1', 'A locale', 40)], remote, state: { lastIds: ['d1'], setHash: S.canon(S.settingsPart(SET())), settingsAt: 1 } });
  ok(m.decks[0].name === 'A locale' && m.updated.length === 0 && m.remoteChanged, 'vince il locale, più recente: da caricare');
}
{ /* cancellato qui: la lapide parte e il mazzo non torna */
  const remote = { decks: [D('d1', 'A', 10), D('d2', 'B', 20)], tombs: {}, settings: SET(), settingsAt: 1 };
  const m = mg({ decks: [D('d1', 'A', 10)], remote, state: { lastIds: ['d1', 'd2'], setHash: S.canon(S.settingsPart(SET())), settingsAt: 1 } });
  ok(ids(m) === 'd1' && m.tombs.d2 === NOW && m.remoteChanged, 'cancellato qui: via anche dal cloud, con lapide');
}
{ /* cancellato altrove: sparisce anche qui */
  const remote = { decks: [D('d1', 'A', 10)], tombs: { d2: 4e12 }, settings: SET(), settingsAt: 1 };
  const m = mg({ decks: [D('d1', 'A', 10), D('d2', 'B', 20)], remote, state: { lastIds: ['d1', 'd2'], setHash: S.canon(S.settingsPart(SET())), settingsAt: 1 } });
  ok(ids(m) === 'd1' && m.removed.join() === 'd2' && m.localChanged, 'cancellato altrove: sparisce anche qui');
}
{ /* cancellato altrove ma modificato qui dopo: resta */
  const remote = { decks: [D('d1', 'A', 10)], tombs: { d2: 100 }, settings: SET(), settingsAt: 1 };
  const m = mg({ decks: [D('d1', 'A', 10), D('d2', 'B', 200)], remote, state: { lastIds: ['d1', 'd2'], setHash: S.canon(S.settingsPart(SET())), settingsAt: 1 } });
  ok(ids(m) === 'd1,d2' && !m.tombs.d2, 'modifica più recente della cancellazione: il mazzo resta e la lapide cade');
}
{ /* mazzo nuovo su un dispositivo mai sincronizzato: non e' una cancellazione */
  const remote = { decks: [], tombs: { dX: 100 }, settings: SET(), settingsAt: 1 };
  const m = mg({ decks: [D('d5', 'Nuovo', 300)], remote, state: {} });
  ok(ids(m) === 'd5' && m.remoteChanged, 'mazzo nuovo: resta');
}
{ /* lapidi scadute */
  const old = NOW - S.TOMB_TTL - 1000;
  const m = mg({ decks: [], remote: { decks: [], tombs: { dOld: old, dNew: NOW - 1000 }, settings: SET(), settingsAt: 1 }, state: { lastIds: [] } });
  ok(!m.tombs.dOld && m.tombs.dNew, 'lapidi più vecchie di 90 giorni: via');
}
{ /* impostazioni: cambiate qui vincono; altrimenti la piu' recente */
  const h = S.canon(S.settingsPart(SET()));
  let m = mg({ decks: [], settings: SET({ images: false }), remote: { decks: [], tombs: {}, settings: { basicsUnlimited: true, images: true }, settingsAt: 100 }, state: { lastIds: [], setHash: h, settingsAt: 50 } });
  ok(m.settings.images === false && m.settingsAt === NOW && m.remoteChanged && !m.settingsFromRemote, 'impostazione cambiata qui: vince');
  m = mg({ decks: [], settings: SET(), remote: { decks: [], tombs: {}, settings: { basicsUnlimited: false, images: true }, settingsAt: 100 }, state: { lastIds: [], setHash: h, settingsAt: 50 } });
  ok(m.settings.basicsUnlimited === false && m.settingsFromRemote && m.localChanged, 'impostazione cambiata altrove e più recente: la prendo');
  m = mg({ decks: [], settings: SET({ theme: 'dark' }), remote: { decks: [], tombs: {}, settings: { basicsUnlimited: true, images: true }, settingsAt: 100 }, state: { lastIds: [], setHash: h, settingsAt: 100 } });
  ok(!m.localChanged && !m.remoteChanged, 'il tema non si sincronizza: resta del dispositivo');
  ok(!('theme' in m.settings), 'nel file non c\'è il tema');
}
{ /* nessun cambiamento: niente da caricare (l'ordine delle chiavi non conta) */
  const a = D('d1', 'A', 10), b = JSON.parse(JSON.stringify(a)), reordered = {}; Object.keys(b).reverse().forEach(k => reordered[k] = b[k]);
  const h = S.canon(S.settingsPart(SET()));
  const m = mg({ decks: [a], remote: { decks: [reordered], tombs: {}, settings: { images: true, basicsUnlimited: true }, settingsAt: 5 }, state: { lastIds: ['d1'], setHash: h, settingsAt: 5 } });
  ok(!m.localChanged && !m.remoteChanged, 'identici: nessun carico');
}

/* ---------- servizi simulati ---------- */
const { fakeDropbox, fakeGoogle } = require('./fake-clouds.js');

/* un "dispositivo": stato locale + magazzino dello stato di sincronizzazione */
function device(srv, provider, name, startDecks) {
  const dev = { decks: (startDecks || []).slice(), settings: SET(), clock: NOW, applied: 0 };
  const store = { s: {}, get() { return this.s; }, set(v) { this.s = v; } };
  dev.sync = S.create({ http: srv.http, now: () => dev.clock, store, config: provider === 'dropbox' ? { dropboxKey: 'KEY' } : { googleId: 'GID', googleSecret: 'GSEC' }, device: name, random: b => { for (let i = 0; i < b.length; i++) b[i] = (i * 37 + 11) & 255; } });
  dev.ctx = {
    local: () => ({ decks: dev.decks, settings: dev.settings }),
    signature: () => JSON.stringify([dev.decks.map(d => d.id + d.updatedAt), S.settingsPart(dev.settings)]),
    apply: m => { dev.decks = m.decks.slice(); dev.settings = Object.assign({}, dev.settings, m.settings); dev.applied++; }
  };
  dev.edit = (id, fn) => { dev.clock += 1000; const d = dev.decks.find(x => x.id === id); fn(d); d.updatedAt = dev.clock; };
  dev.add = d => { dev.clock += 1000; d.updatedAt = dev.clock; dev.decks.push(d); };
  dev.del = id => { dev.decks = dev.decks.filter(d => d.id !== id); };
  return dev;
}

(async () => {
  /* ---------- Dropbox: collegamento ---------- */
  const dbx = fakeDropbox();
  const A = device(dbx, 'dropbox', 'pc', [D('d1', 'Kaalia', 1000), D('d2', 'Atraxa', 1000)]);
  ok(A.sync.configured('dropbox') && !A.sync.configured('google'), 'chiavi presenti');
  const au = A.sync.dropboxStart();
  const q = new URL(au.url).searchParams;
  ok(au.url.startsWith('https://www.dropbox.com/oauth2/authorize?') && q.get('client_id') === 'KEY' && q.get('response_type') === 'code' && q.get('code_challenge_method') === 'S256' && q.get('token_access_type') === 'offline' && !q.get('redirect_uri'), 'indirizzo di collegamento: PKCE senza ritorno, con refresh');
  ok(q.get('code_challenge') === S.b64url(S.sha256(new TextEncoder().encode(A.sync.state().pending.verifier))), 'la sfida corrisponde al verificatore');
  let err = await A.sync.dropboxFinish('SBAGLIATO').then(() => null, e => e);
  ok(err && err.code === 'badcode' && !A.sync.linked(), 'codice sbagliato: non collega');
  ok(await A.sync.dropboxFinish(' GOODCODE\n') && A.sync.linked() === 'dropbox', 'codice giusto (con spazi): collegato');
  ok(!JSON.stringify(A.sync.state()).includes('verifier'), 'il verificatore non resta nello stato');

  /* ---------- prima sincronizzazione: carica ---------- */
  let r = await A.sync.sync(A.ctx);
  ok(r.uploaded && r.added.length === 0 && dbx.file, 'primo giro: carica il file');
  const file = JSON.parse(dbx.file);
  ok(file.app === 'coglio-proxy-archive' && file.decks.length === 2 && file.device === 'pc' && file.settings.images === true && !('theme' in file.settings), 'contenuto del file');
  ok(!dbx.file.includes('RT1') && !dbx.file.includes('AT1'), 'i token non finiscono nel file');
  r = await A.sync.sync(A.ctx);
  ok(!r.uploaded && r.added.length === 0, 'secondo giro senza modifiche: niente da caricare');

  /* ---------- telefono: scarica, modifica, cancella ---------- */
  const B = device(dbx, 'dropbox', 'telefono', []);
  B.sync.dropboxStart(); await B.sync.dropboxFinish('GOODCODE');
  r = await B.sync.sync(B.ctx);
  ok(r.added.length === 2 && B.decks.length === 2 && !r.uploaded && B.applied === 1, 'telefono: scarica i due mazzi');
  B.edit('d1', d => { d.name = 'Kaalia v2'; });
  B.add(D('d3', 'Nuovo dal telefono', 0));
  r = await B.sync.sync(B.ctx);
  ok(r.uploaded && B.applied === 1, 'telefono: carica le sue modifiche (nessuna applicazione in più)');
  A.clock = B.clock + 5000;
  r = await A.sync.sync(A.ctx);
  ok(A.decks.length === 3 && A.decks.find(d => d.id === 'd1').name === 'Kaalia v2' && r.added.join() === 'd3' && r.updated.join() === 'd1', 'PC: riceve modifica e mazzo nuovo');
  A.del('d2'); A.clock += 1000;
  r = await A.sync.sync(A.ctx);
  ok(r.uploaded && JSON.parse(dbx.file).decks.length === 2 && JSON.parse(dbx.file).tombs.d2, 'PC cancella Atraxa: il file ha la lapide');
  B.clock += 20000;
  r = await B.sync.sync(B.ctx);
  ok(r.removed.join() === 'd2' && B.decks.length === 2 && !B.decks.some(d => d.id === 'd2'), 'telefono: Atraxa sparisce anche qui');
  r = await B.sync.sync(B.ctx);
  ok(!r.uploaded && !r.removed.length, 'e poi è tutto fermo');

  /* modifiche in parallelo su mazzi diversi: si sommano */
  A.edit('d1', d => { d.commander = 'Kaalia of the Vast'; });
  B.edit('d3', d => { d.name = 'Nuovo v2'; });
  await A.sync.sync(A.ctx); await B.sync.sync(B.ctx); await A.sync.sync(A.ctx);
  ok(A.decks.find(d => d.id === 'd3').name === 'Nuovo v2' && A.decks.find(d => d.id === 'd1').commander === 'Kaalia of the Vast', 'modifiche su mazzi diversi si sommano');
  await B.sync.sync(B.ctx);
  ok(B.decks.find(d => d.id === 'd1').commander === 'Kaalia of the Vast' && A.decks.find(d => d.id === 'd3').name === 'Nuovo v2', 'entrambi i dispositivi si allineano');
  ok(JSON.stringify(A.decks.map(d => [d.id, d.name, d.commander])) === JSON.stringify(B.decks.map(d => [d.id, d.name, d.commander])), 'identici dopo la convergenza');

  /* impostazioni */
  A.settings.basicsUnlimited = false; A.clock += 1000;
  await A.sync.sync(A.ctx); B.clock += 60000; r = await B.sync.sync(B.ctx);
  ok(B.settings.basicsUnlimited === false && r.settings, 'impostazione passata al telefono');
  B.settings.theme = 'dark'; await B.sync.sync(B.ctx); A.clock += 60000; await A.sync.sync(A.ctx);
  ok(A.settings.theme === 'auto', 'il tema non viaggia');

  /* il file cambia mentre sincronizzo: si riprova */
  const dbx2 = fakeDropbox({ raceOnce: true });
  const C1 = device(dbx2, 'dropbox', 'pc2', [D('d9', 'Race', 1000)]); C1.sync.dropboxStart(); await C1.sync.dropboxFinish('GOODCODE');
  await C1.sync.sync(C1.ctx);
  C1.add(D('d8', 'Altro', 0));
  r = await C1.sync.sync(C1.ctx);
  ok(r.uploaded && JSON.parse(dbx2.file).decks.length === 2, 'conflitto sul file: riprova e riesce');

  /* token scaduto: si rinnova da solo */
  A.sync.state().tokens.exp = 0; A.clock += 1000; A.edit('d1', d => { d.name = 'dopo refresh'; });
  const t0 = dbx.tokens;
  r = await A.sync.sync(A.ctx);
  ok(dbx.tokens === t0 + 1 && r.uploaded, 'accesso scaduto: rinnovato e sincronizzato');
  /* collegamento revocato */
  A.sync.state().tokens.exp = 0; dbx.failAuth = true;
  err = await A.sync.sync(A.ctx).then(() => null, e => e);
  ok(err && err.code === 'auth' && !A.sync.state().tokens, 'collegamento revocato: errore chiaro');
  dbx.failAuth = false;
  /* rete assente */
  const off = device({ http: async () => { throw new TypeError('Failed to fetch'); }, log: [] }, 'dropbox', 'x', []);
  off.sync.state().provider = 'dropbox'; off.sync.state().tokens = { access: 'a', refresh: 'r', exp: NOW + 1e9 };
  err = await off.sync.sync(off.ctx).then(() => null, e => e);
  ok(err && err.code === 'net', 'senza rete: errore «net»');
  /* file rovinato */
  dbx.file = 'non è json'; A.sync.state().tokens = { access: dbx.accessOK, refresh: 'RT1', exp: NOW + 1e9 };
  err = await A.sync.sync(A.ctx).then(() => null, e => e);
  ok(err && err.code === 'format', 'file rovinato: non lo sovrascrive alla cieca');
  dbx.file = JSON.stringify({ app: 'altro', decks: [] });
  err = await A.sync.sync(A.ctx).then(() => null, e => e);
  ok(err && err.code === 'format' && /non è di Coglio/.test(err.message), 'file di un\'altra app: rifiutato');

  /* modifiche locali mentre sincronizzo: non si applica nulla sopra */
  const dbx3 = fakeDropbox();
  const P = device(dbx3, 'dropbox', 'p', [D('d1', 'A', 1000)]); P.sync.dropboxStart(); await P.sync.dropboxFinish('GOODCODE'); await P.sync.sync(P.ctx);
  const Q = device(dbx3, 'dropbox', 'q', []); Q.sync.dropboxStart(); await Q.sync.dropboxFinish('GOODCODE'); await Q.sync.sync(Q.ctx);
  Q.add(D('d2', 'Da Q', 0)); await Q.sync.sync(Q.ctx);
  const origLocal = P.ctx.local; let first = true;
  P.ctx.local = () => { const l = origLocal(); if (first) { first = false; P.add(D('d7', 'Scritto mentre sincronizzavo', 0)); } return l; };
  r = await P.sync.sync(P.ctx);
  ok(r.again && P.applied === 0 && P.decks.length === 2, 'se cambia qualcosa durante il giro: niente applicato, si riparte');
  P.ctx.local = origLocal;
  r = await P.sync.sync(P.ctx);
  ok(!r.again && P.decks.length === 3 && JSON.parse(dbx3.file).decks.length === 3, 'al giro dopo è tutto unito');

  /* ---------- Google Drive ---------- */
  const g = fakeGoogle();
  const G = device(g, 'google', 'pc', [D('d1', 'Kaalia', 1000)]);
  ok(G.sync.configured('google') && !G.sync.configured('dropbox'), 'chiavi di Google presenti');
  const dc = await G.sync.googleStart();
  ok(dc.userCode === 'ABCD-EFGH' && /google\.com\/device/.test(dc.url) && dc.interval >= 3, 'codice da digitare su google.com/device');
  ok(await G.sync.googlePoll() === 'pending' && await G.sync.googlePoll() === 'pending' && await G.sync.googlePoll() === 'done' && G.sync.linked() === 'google', 'attesa e poi collegato');
  r = await G.sync.sync(G.ctx);
  ok(r.uploaded && g.id === 'F1' && JSON.parse(g.file).decks.length === 1, 'Drive: crea il file nella cartella dei dati dell\'app');
  const H2 = device(g, 'google', 'telefono', []); await H2.sync.googleStart(); g.polls = 5; await H2.sync.googlePoll();
  r = await H2.sync.sync(H2.ctx);
  ok(r.added.length === 1 && H2.decks.length === 1, 'Drive: il telefono scarica');
  H2.edit('d1', d => { d.name = 'Da Drive'; }); r = await H2.sync.sync(H2.ctx);
  ok(r.uploaded && g.log.some(l => l.startsWith('PATCH ')), 'Drive: aggiorna il file esistente');
  G.clock += 60000; r = await G.sync.sync(G.ctx);
  ok(G.decks[0].name === 'Da Drive', 'Drive: il PC riceve');
  G.sync.state().tokens.exp = 0; G.edit('d1', d => { d.name = 'x'; });
  r = await G.sync.sync(G.ctx);
  ok(g.refreshes === 1 && r.uploaded, 'Drive: accesso rinnovato da solo');
  const G2 = device(g, 'google', 'altro', []); await G2.sync.googleStart();
  G2.sync.state().pending.until = NOW - 1;
  err = await G2.sync.googlePoll().then(() => null, e => e);
  ok(err && err.code === 'expired', 'codice scaduto');
  ok(await new Promise(res => { const x = S.create({ http: async () => ({ status: 200, text: '{}' }), now: () => NOW }); x.googleStart().then(() => res(false), e => res(e.code === 'config')); }), 'senza chiavi: errore di configurazione');
  G.sync.unlink();
  ok(!G.sync.linked() && !G.sync.state().tokens && !G.sync.state().lastIds, 'scollegare svuota lo stato di sincronizzazione');
  ok(G.sync.keys().googleId === 'GID', 'ma le chiavi restano');
  const NK = S.create({ http: async () => ({ status: 200, text: '{}' }), now: () => NOW });
  ok(!NK.configured('dropbox') && !NK.configured('google'), 'senza chiavi non è configurato');
  NK.setKeys({ dropbox: ' abc ', googleId: 'id1' }); ok(NK.keys().dropbox === 'abc' && NK.configured('dropbox') && !NK.configured('google'), 'chiavi impostabili a mano (e ripulite dagli spazi)');
  NK.setKeys({ googleSecret: 's1' }); ok(NK.configured('google') && NK.keys().dropbox === 'abc', 'le chiavi si completano senza perdere le altre');

  console.log('sync-test: ' + n + ' controlli ok');
})().catch(e => { console.error(e); process.exit(1); });
