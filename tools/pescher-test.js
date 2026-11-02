/* Prove della logica di The Pescher (web/pescher.js). Uso: node tools/pescher-test.js */
const assert = require('assert'), P = require('../web/pescher.js');
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); }, eq = (a, b, m) => { n++; assert.deepStrictEqual(a, b, m); };
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

/* partita nuova */
let g = P.newGame({ players: 4, life: 40 });
eq(g.players.length, 4, '4 giocatori'); eq(g.players.map(p => p.life), [40, 40, 40, 40], 'vita 40');
eq(g.players[0].name, 'Io', 'primo posto: Io'); eq(g.players.map(p => p.id), ['p1', 'p2', 'p3', 'p4'], 'id stabili');
eq(P.newGame({ players: 1 }).players.length, 2, 'minimo 2'); eq(P.newGame({ players: 99 }).players.length, 6, 'massimo 6');
eq(P.newGame({ players: 3, life: 20 }).players[2].life, 20, 'vita 20'); eq(P.newGame({ players: 2, life: 'x' }).players[0].life, 40, 'vita di default');
eq(P.newGame({ players: 2, names: ['Simone', 'Luca'] }).players.map(p => p.name), ['Simone', 'Luca'], 'nomi dati');

/* vita e annulla */
ok(P.life(g, 'p2', -5), 'vita cambia'); eq(g.players[1].life, 35, '40-5');
ok(!P.life(g, 'p2', 0), 'zero non fa nulla'); ok(!P.life(g, 'nope', 1), 'giocatore inesistente');
ok(P.undo(g), 'annulla'); eq(g.players[1].life, 40, 'annullato'); ok(!P.undo(g), 'niente altro da annullare');
P.life(g, 'p1', 3); P.life(g, 'p1', 3); P.undo(g); eq(g.players[0].life, 43, 'annulla solo l\'ultimo');
for (let i = 0; i < 80; i++) P.life(g, 'p3', -1);
ok(g.hist.length <= 60, 'la cronologia ha un limite'); ok(g.log.length <= 80, 'il registro ha un limite');
ok(/vita/.test(g.log[0].text), 'il registro dice cosa è successo');

/* fuori gioco: derivato dai numeri */
g = P.newGame({ players: 3, life: 10 });
ok(!P.status(g, g.players[0]).out, 'vivo'); P.life(g, 'p1', -10);
ok(P.status(g, g.players[0]).out && P.status(g, g.players[0]).why[0].k === 'life', 'fuori a 0 vita'); P.life(g, 'p1', 1);
ok(!P.status(g, g.players[0]).out, 'rialzando la vita si rientra');
P.poison(g, 'p2', 9); ok(!P.status(g, g.players[1]).out, '9 veleno vivo'); P.poison(g, 'p2', 1);
ok(P.status(g, g.players[1]).out && P.status(g, g.players[1]).why[0].k === 'poison', '10 veleno fuori');
ok(!P.poison(g, 'p3', -1), 'il veleno non va sotto zero'); eq(g.players[2].poison, 0, 'veleno resta 0');

/* danno da comandante: toglie anche vita */
g = P.newGame({ players: 3, life: 40 });
P.cmd(g, 'p2', 'p1', 7); eq(g.players[1].cmd.p1, 7, '7 da p1'); eq(g.players[1].life, 33, 'toglie anche vita');
P.cmd(g, 'p2', 'p1', 14); ok(P.status(g, g.players[1]).out, '21 da comandante è fuori'); ok(/p1|Io/.test(P.status(g, g.players[1]).why[0].text) && /Io/.test(P.status(g, g.players[1]).why[0].text), 'dice di chi');
eq(g.players[1].life, 19, '40-21');
P.cmd(g, 'p2', 'p1', -1); eq(g.players[1].cmd.p1, 20, 'si può togliere'); eq(g.players[1].life, 20, 'e restituisce la vita');
ok(!P.cmd(g, 'p2', 'p2', 1), 'non ci si colpisce da soli'); ok(!P.cmd(g, 'p2', 'p1', -99) || g.players[1].cmd.p1 === 0, 'non sotto zero');
g = P.newGame({ players: 2, life: 40 }); g.cmdLife = false; P.cmd(g, 'p2', 'p1', 5); eq(g.players[1].life, 40, 'con «solo comandante» la vita non cambia');
P.undo(g); eq(g.players[1].cmd.p1 || 0, 0, 'annulla anche il danno da comandante');

/* vincitore */
g = P.newGame({ players: 3, life: 5 }); eq(P.winner(g), null, 'nessun vincitore all\'inizio');
P.life(g, 'p2', -5); eq(P.winner(g), null, 'ne restano due'); P.life(g, 'p3', -5); eq(P.winner(g).id, 'p1', 'resta uno solo');

/* inizio e turni */
g = P.newGame({ players: 4 }); const f = P.begin(g, seq(0.6)); eq(f.id, 'p3', 'inizia chi dice il caso'); eq(g.turn, 2, 'turno'); ok(g.started, 'partita iniziata');
eq(P.nextTurn(g).id, 'p4', 'turno dopo'); eq(P.nextTurn(g).id, 'p1', 'e si riparte da capo');
P.life(g, 'p2', -99); eq(P.nextTurn(g).id, 'p3', 'chi è fuori viene saltato'); P.undo(g); eq(g.turn, 0, 'annulla anche il turno');
eq(P.pickFirst(g, seq(0.99)).index, 3, 'chi inizia, ultimo posto'); eq(P.pickFirst(g, seq(0)).index, 0, 'chi inizia, primo posto');

/* dadi */
eq(P.roll('d20', seq(0)).value, 1, 'd20 minimo'); eq(P.roll('d20', seq(0.9999)).value, 20, 'd20 massimo'); eq(P.roll('d6', seq(0.5)).value, 4, 'd6');
eq(P.roll('coin', seq(0.1)).value, 'Testa', 'testa'); eq(P.roll('coin', seq(0.9)).value, 'Croce', 'croce'); eq(P.roll('d7'), null, 'dado sconosciuto');
for (let i = 0; i < 200; i++) { const v = P.roll('d12').value; if (v < 1 || v > 12) throw new Error('d12 fuori scala ' + v); } n++;
eq(P.DICE, ['d4', 'd6', 'd8', 'd10', 'd12', 'd20'], 'dadi offerti');

/* bilanciamento dei bracket */
g = P.newGame({ players: 4 });
eq(P.balance(g).level, 'unknown', 'nessun bracket: sconosciuto');
P.setBracket(g, 'p1', 3); eq(P.balance(g).level, 'unknown', 'uno solo: sconosciuto');
P.setBracket(g, 'p2', 3); eq(P.balance(g).level, 'ok', 'tutti uguali');
P.setBracket(g, 'p3', 2); eq(P.balance(g).level, 'ok', 'distanza 1: va bene');
P.setBracket(g, 'p4', 4); let b = P.balance(g); eq(b.level, 'warn', 'distanza 2: avviso'); eq([b.min, b.max, b.spread], [2, 4, 2], 'minimo, massimo, distanza');
ok(/bracket 4/.test(b.text) && /bracket 2/.test(b.text) && /Giocatore 4/.test(b.text) && /Giocatore 3/.test(b.text), 'dice chi contro chi: ' + b.text);
P.setBracket(g, 'p3', 1); b = P.balance(g); eq(b.level, 'bad', 'distanza 3: squilibrio forte'); ok(/forte/.test(b.text), 'testo forte');
P.setBracket(g, 'p3', 0); P.setBracket(g, 'p4', 0); eq(P.balance(g).level, 'ok', 'chi non ha bracket non conta'); eq(P.balance(g).unknown, ['Giocatore 3', 'Giocatore 4'], 'e viene elencato');
ok(P.setDeck(g, 'p3', { id: 'd1', name: 'Kaalia', commander: 'Kaalia of the Vast', n: 5 }), 'scelgo un mazzo'); eq(g.players[2].bracket, 5, 'il bracket arriva dal mazzo'); eq(P.balance(g).level, 'warn', 'ora si vede lo squilibrio');
P.setDeck(g, 'p3', null); eq(g.players[2].bracket, 0, 'tolto il mazzo, tolto il bracket');
P.setDeck(g, 'p3', { id: 'd2', name: 'Senza', n: 0 }); eq(g.players[2].bracket, 0, 'mazzo senza bracket: resta quello impostato a mano'); P.setBracket(g, 'p3', 2); eq(g.players[2].bracket, 2, 'a mano');

/* che mazzo uso stasera? */
const decks = [{ id: 'a', name: 'A', n: 2 }, { id: 'b', name: 'B', n: 3 }, { id: 'c', name: 'C', n: 4 }, { id: 'd', name: 'D', n: 0 }];
let s = P.suggest(decks, { others: [4, 4, 3] }, seq(0.5)); eq(s.pick.deck.id, 'c', 'mediana 4: il bracket 4'); eq(s.target, 4, 'mediana');
eq(s.ranked.map(r => r.deck.id), ['c', 'b', 'a', 'd'], 'ordine per vicinanza, il senza bracket per ultimo');
s = P.suggest(decks, { others: [2, 2] }, seq(0.5)); eq(s.pick.deck.id, 'a', 'tavolo basso: il più basso');
s = P.suggest(decks, { others: [3, 4] }, seq(0.5)); eq(s.target, 3.5, 'mediana con due'); ok(['b', 'c'].includes(s.pick.deck.id), 'a pari merito uno dei due');
eq(P.suggest(decks, { others: [3, 4] }, seq(0.1, 0.9, 0.5, 0.5)).pick.deck.id !== undefined, true, 'a pari merito decide il caso');
s = P.suggest(decks, { others: [4], taken: ['c'] }, seq(0.5)); eq(s.pick.deck.id, 'b', 'un mazzo già al tavolo non si ripropone');
s = P.suggest(decks, {}, seq(0.5)); eq(s.target, null, 'senza altri: nessun bersaglio'); eq(s.ranked.length, 4, 'tutti in lista');
eq(P.suggest([], {}, seq(0.5)).pick, null, 'nessun mazzo attivo: nessun consiglio');
const r1 = P.suggest(decks, {}, seq(0.1, 0.2, 0.3, 0.4)).pick.deck.id, r2 = P.suggest(decks, {}, seq(0.9, 0.2, 0.3, 0.4)).pick.deck.id; ok(r1 !== r2, 'senza bracket il caso cambia la scelta');
ok(/come il tavolo/.test(P.suggest(decks, { others: [3] }, seq(0.5)).ranked[0].why), 'la ragione dice «come il tavolo»');

/* salvataggio */
g = P.newGame({ players: 3, life: 40 }); P.begin(g, seq(0.5)); P.life(g, 'p2', -7); P.cmd(g, 'p3', 'p1', 4); P.setDeck(g, 'p1', { id: 'x', name: 'Kaalia', commander: 'Kaalia', n: 3 });
const back = P.restore(P.serialize(g)); eq(back.players, g.players, 'giocatori ripristinati'); eq(back.turn, g.turn, 'turno ripristinato'); ok(P.undo(back), 'anche la cronologia');
eq(P.restore('non json'), null, 'testo rotto'); eq(P.restore({ v: 2, players: [] }), null, 'versione sconosciuta'); eq(P.restore(null), null, 'null');
const bad = JSON.parse(P.serialize(g)); bad.players[0].life = 'ciao'; bad.players[1].poison = -5; bad.players[2].cmd = { zzz: 5, p1: '9' }; bad.turn = 99;
const fixed = P.restore(bad); eq(fixed.players[0].life, 40, 'vita sporca ripulita'); eq(fixed.players[1].poison, 0, 'veleno negativo'); eq(fixed.players[2].cmd, { p1: 9 }, 'danni da giocatori inesistenti tolti'); eq(fixed.turn, 2, 'turno fuori scala riportato dentro');

/* nuova partita e rinomina */
P.reset(g); eq(g.players.map(p => p.life), [40, 40, 40], 'reset vite'); eq(g.players[2].cmd, {}, 'reset comandante'); eq(g.hist.length, 0, 'reset cronologia'); eq(g.players[0].deck.name, 'Kaalia', 'il mazzo scelto resta');
ok(P.rename(g, 'p2', '  Luca  ') && g.players[1].name === 'Luca', 'rinomina'); ok(!P.rename(g, 'p2', '   '), 'nome vuoto rifiutato');
/* posti e vita prima di iniziare */
g = P.newGame({ players: 4, life: 40 }); P.rename(g, 'p2', 'Luca'); P.resize(g, 6); eq(g.players.length, 6, 'sei posti'); eq(g.players[1].name, 'Luca', 'i primi restano'); eq(g.players[5].name, 'Giocatore 6', 'nuovi posti');
eq(g.players[5].life, 40, 'con la vita iniziale'); P.cmd(g, 'p1', 'p6', 3); P.resize(g, 3); eq(g.players.length, 3, 'tre posti'); eq(g.players[0].cmd, {}, 'il danno da un posto tolto sparisce');
P.setStart(g, 20); eq(g.players.map(p => p.life), [20, 20, 20], 'vita iniziale cambiata per tutti'); eq(P.resize(g, 1).players.length, 2, 'minimo due');
console.log('pescher-test: ' + n + ' controlli ok');
