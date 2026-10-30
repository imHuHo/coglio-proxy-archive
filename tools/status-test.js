/* Stati dei mazzi (attivo / non ancora stampato / inattivo) e riuso delle carte nel mazzo in creazione. Solo Node. */
const C = require('../web/core.js');
const assert = require('assert');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };
const card = (name, qty, set, cn) => ({ name, qty, set: set || '', cn: cn || '' });
const mk = (id, name, kind, active, cards, extra) => Object.assign({ id, name, kind, active, commander: null, cards, upgrades: [], createdAt: 0, updatedAt: 0 }, extra || {});
const fresh = () => [
  mk('a', 'Attivo', 'deck', true, [card('Sol Ring', 1, 'c21', '263'), card('Arcane Signet', 1)]),
  mk('i', 'Smontato', 'deck', false, [card('Lightning Bolt', 2, 'm10', '146'), card('Rhystic Study', 1, 'pcy', '45')]),
  mk('b', 'Sciolte', 'binder', false, [card('Counterspell', 1, 'mh2', '267')]),
  mk('u', 'Da stampare', 'deck', false, [card('Mind Stone', 1, 'c21', '300'), card('Sol Ring', 1, 'c21', '263')], { status: 'unprinted' })
];
const K = C.keyOf, tot = d => d.cards.reduce((t, c) => t + c.qty, 0), find = (ds, id) => ds.find(d => d.id === id);

// stato e migrazione dei dati salvati
const S = x => C.sanitizeDeck(Object.assign({ id: 'z', name: 'z', cards: [] }, x));
ok(S({ kind: 'deck', active: true }).status === 'active' && S({ kind: 'deck', active: true }).active === true, 'vecchio mazzo attivo → active');
ok(S({ kind: 'deck', active: false }).status === 'inactive', 'vecchio mazzo non attivo → inactive');
ok(S({ kind: 'deck', status: 'unprinted', active: true }).status === 'unprinted' && S({ kind: 'deck', status: 'unprinted', active: true }).active === false, 'non ancora stampato non è mai attivo');
ok(S({ kind: 'deck', status: 'boh', active: true }).status === 'active', 'stato sconosciuto ricade su active');
ok(S({ kind: 'binder', active: true }).active === false, 'le sciolte non sono mai attive');
ok(C.statusOf(fresh()[3]) === 'unprinted' && C.statusOf(fresh()[2]) === 'binder' && C.statusOf(fresh()[1]) === 'inactive' && C.statusOf(fresh()[0]) === 'active', 'statusOf');
ok(C.isPrinted(fresh()[0]) && C.isPrinted(fresh()[1]) && !C.isPrinted(fresh()[3]), 'isPrinted');

// archivio: i mazzi non stampati non contano
let ds = fresh(), A = C.buildArchive(ds);
ok(!A.map[K('Mind Stone')], 'carta solo in mazzo non stampato: non è in archivio');
ok(A.map[K('Sol Ring')].owned === 1 && A.map[K('Sol Ring')].rows.length === 1, 'Sol Ring conta una sola copia (quella del mazzo attivo)');
ok(A.map[K('Lightning Bolt')].free === 2 && A.map[K('Counterspell')].free === 1, 'mazzo non attivo e sciolte: carte libere');
ok(A.stats.decks === 3 && A.stats.activeDecks === 1, 'conteggio mazzi');
ds[3].status = 'inactive'; A = C.buildArchive(ds);
ok(A.map[K('Mind Stone')].owned === 1 && A.map[K('Sol Ring')].owned === 2, 'passando a non attivo le carte entrano in archivio');

// CODIGHEL: pool = sciolte + non attivi, mai i non stampati
ds = fresh();
const want = [card('Lightning Bolt', 1, 'M10', '146'), card('Counterspell', 1, 'MH2', '267'), card('Mind Stone', 1), card('Sol Ring', 1, 'c21', '263'), card('Rhystic Study', 1, 'pcy', '45')];
let r = C.findReusable(want, ds, {});
ok(r.map(x => x.name).sort().join() === 'Counterspell,Lightning Bolt,Rhystic Study', 'riusabili: sciolte e non attivi; non stampati e attivi esclusi: ' + r.map(x => x.name));
ok(r.find(x => x.name === 'Lightning Bolt').exact === 1 && r.find(x => x.name === 'Counterspell').exactRows[0].kind === 'binder', 'copie esatte');

// riuso: la carta passa dalle sciolte al nuovo mazzo
ds = fresh();
let nd = mk('n', 'Nuovo', 'deck', true, [card('Lightning Bolt', 1, 'M10', '146'), card('Counterspell', 1, 'MH2', '267'), card('Cyclonic Rift', 1)]);
let before = tot(nd);
let done = C.applyReuse(ds, nd, { [K('Lightning Bolt') + '|exact']: true, [K('Counterspell') + '|exact']: true }, {});
ok(done.length === 2 && done.every(x => x.qty === 1), 'due carte prese');
ok(tot(nd) === before && nd.cards.find(c => c.name === 'Cyclonic Rift'), 'il mazzo nuovo ha sempre le stesse carte');
ok(find(ds, 'i').cards.find(c => c.name === 'Lightning Bolt').qty === 1, 'una copia in meno nel mazzo non attivo');
ok(find(ds, 'b').cards.length === 0, 'tolta dalle sciolte (la lista resta, vuota)');
ds.push(nd); A = C.buildArchive(ds);
ok(A.map[K('Counterspell')].owned === 1 && A.map[K('Counterspell')].occupied === 1, 'nessun doppione: ora la copia è nel mazzo attivo');
ok(done.find(x => x.name === 'Counterspell').deckName === 'Sciolte', 'resoconto con la provenienza');

// niente spunta, niente spostamenti
ds = fresh(); nd = mk('n', 'Nuovo', 'deck', true, [card('Lightning Bolt', 1, 'M10', '146')]);
ok(C.applyReuse(ds, nd, {}, {}).length === 0 && find(ds, 'i').cards[0].qty === 2, 'senza scelte non si tocca nulla');

// parziale: ne servono 3 e ne ho 2
ds = fresh(); nd = mk('n', 'Nuovo', 'deck', true, [card('Lightning Bolt', 3, 'M10', '146')]);
done = C.applyReuse(ds, nd, { [K('Lightning Bolt') + '|exact']: true }, {});
ok(done[0].qty === 2 && tot(nd) === 3 && find(ds, 'i').cards.every(c => c.name !== 'Lightning Bolt'), 'prese 2 su 3: il mazzo ne ha comunque 3, il resto va stampato');

// altra stampa: nel mazzo resta la stampa che ho davvero
ds = fresh(); nd = mk('n', 'Nuovo', 'deck', true, [card('Lightning Bolt', 1, 'lea', '161')]);
r = C.findReusable(nd.cards, ds, {});
ok(r[0].exact === 0 && r[0].other === 1, 'stampa diversa: altra stampa (ne serve una)');
done = C.applyReuse(ds, nd, { [K('Lightning Bolt') + '|other']: true }, {});
ok(done.length === 1 && nd.cards.length === 1 && nd.cards[0].set === 'm10' && nd.cards[0].cn === '146' && tot(nd) === 1, 'il mazzo registra la stampa posseduta');
ok(find(ds, 'i').cards.find(c => c.name === 'Lightning Bolt').qty === 1, 'una copia in meno nel mazzo non attivo');

// i non stampati non sono mai fonte
ds = fresh(); nd = mk('n', 'Nuovo', 'deck', true, [card('Mind Stone', 1, 'c21', '300')]);
ok(C.applyReuse(ds, nd, { [K('Mind Stone') + '|exact']: true }, {}).length === 0 && find(ds, 'u').cards.length === 2, 'carte di un mazzo non stampato non si prendono');

// upgrade su un mazzo non ancora stampato: le carte tolte non diventano sciolte
ds = fresh().filter(d => d.id !== 'b');
const up = { id: 'up', name: 'Up', cards: [card('Sol Ring', 1, 'c21', '263'), card('Arcane Signet', 1)], commander: null, createdAt: 0 };
find(ds, 'u').upgrades.push(up);
let rep = C.applyUpgradeMoves(ds, 'u', 'up', {});
ok(rep.unprinted === true && rep.toLoose.length === 0 && !ds.some(d => d.kind === 'binder'), 'mazzo non stampato: niente sciolte create');
ok(find(ds, 'u').cards.map(c => c.name).sort().join() === 'Arcane Signet,Sol Ring', 'lista aggiornata');
// stesso upgrade su un mazzo stampato: la carta tolta finisce nelle sciolte
ds = fresh().filter(d => d.id !== 'b'); find(ds, 'u').status = 'inactive'; find(ds, 'u').upgrades.push(up);
rep = C.applyUpgradeMoves(ds, 'u', 'up', {});
ok(rep.unprinted === false && rep.toLoose.length === 1 && ds.some(d => d.kind === 'binder'), 'mazzo stampato: la carta tolta diventa sciolta');

// upgrade di un mazzo attivo: non prende da un mazzo non stampato
ds = fresh(); find(ds, 'a').upgrades.push({ id: 'u2', name: 'U2', cards: [card('Sol Ring', 1, 'c21', '263'), card('Mind Stone', 1, 'c21', '300')], commander: null, createdAt: 0 });
const df = C.diffUpgrade(find(ds, 'a'), find(ds, 'a').upgrades[0], ds, {});
const ms = df.inn.find(x => x.name === 'Mind Stone');
ok(ms.covered === 0 && ms.missing === 1 && ms.sources.length === 0 && ms.busyIn.length === 0, 'Mind Stone nel mazzo non stampato non risulta disponibile');
console.log('status-test: ' + n + ' controlli ok');
