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

/* segnalini */
g = P.newGame({ players: 3 });
ok(P.counter(g, 'p1', 'exp', 2), 'esperienza'); eq(g.players[0].exp, 2, 'esperienza 2'); ok(P.counter(g, 'p1', 'eng', 3) && g.players[0].eng === 3, 'energia');
ok(!P.counter(g, 'p1', 'exp', -5) === false && g.players[0].exp === 0, 'non scende sotto zero'); ok(!P.counter(g, 'p1', 'exp', -1), 'a zero non cambia più');
ok(!P.counter(g, 'p1', 'boh', 1), 'segnalino sconosciuto'); ok(!P.counter(g, 'zz', 'exp', 1), 'giocatore sconosciuto');
P.counter(g, 'p2', 'tax', 1); P.counter(g, 'p2', 'tax', 1); eq(g.players[1].tax, 2, 'due lanci'); eq(P.taxOf(g.players[1]), 4, 'costo in più: 4'); ok(/\+4/.test(g.log[0].text), 'il registro dice +4: ' + g.log[0].text);
P.undo(g); eq(g.players[1].tax, 1, 'annulla un lancio');
for (let i = 0; i < 120; i++) P.counter(g, 'p3', 'eng', 1); eq(g.players[2].eng, 99, 'limite 99');

/* monarca e iniziativa */
g = P.newGame({ players: 3 }); eq(g.monarch, '', 'nessun monarca'); ok(P.holder(g, 'monarch', 'p2'), 'p2 monarca'); eq(g.monarch, 'p2', 'è p2');
P.holder(g, 'monarch', 'p3'); eq(g.monarch, 'p3', 'passa a p3'); P.holder(g, 'monarch', 'p3'); eq(g.monarch, '', 'toccato di nuovo, si toglie');
P.holder(g, 'initiative', 'p1'); eq([g.monarch, g.initiative], ['', 'p1'], 'iniziativa indipendente'); ok(/iniziativa/.test(g.log[0].text), 'registro: ' + g.log[0].text);
P.undo(g); eq(g.initiative, '', 'annulla l\'iniziativa'); ok(!P.holder(g, 'drago', 'p1'), 'titolo sconosciuto'); ok(!P.holder(g, 'monarch', 'zz'), 'giocatore sconosciuto');
P.holder(g, 'monarch', 'p3'); P.resize(g, 2); eq(g.monarch, '', 'se il posto sparisce, sparisce anche il monarca');

/* giri */
g = P.newGame({ players: 3 }); P.begin(g, seq(0.4)); eq(g.round, 1, 'giro 1'); eq(g.first, 1, 'inizia p2');
P.nextTurn(g); eq(g.round, 1, 'p3: ancora giro 1'); P.nextTurn(g); eq(g.round, 1, 'p1: ancora giro 1'); P.nextTurn(g); eq([g.turn, g.round], [1, 2], 'si torna a chi ha iniziato: giro 2');
P.undo(g); eq(g.round, 1, 'annulla anche il giro');
g = P.newGame({ players: 2, life: 5 }); P.begin(g, seq(0)); P.life(g, 'p2', -5); const before = g.round; P.nextTurn(g); eq(g.turn, 0, 'resta chi è ancora in gioco'); eq(g.round, before + 1, 'e il giro avanza');

/* salvataggio */
g = P.newGame({ players: 3, life: 40 }); P.begin(g, seq(0.5)); P.life(g, 'p2', -7); P.cmd(g, 'p3', 'p1', 4); P.counter(g, 'p1', 'exp', 2); P.holder(g, 'monarch', 'p2');
const back = P.restore(P.serialize(g)); eq(back.players, g.players, 'giocatori ripristinati'); eq(back.turn, g.turn, 'turno ripristinato'); eq([back.monarch, back.players[0].exp], ['p2', 2], 'monarca e segnalini ripristinati'); ok(P.undo(back), 'anche la cronologia');
eq(P.restore('non json'), null, 'testo rotto'); eq(P.restore({ v: 2, players: [] }), null, 'versione sconosciuta'); eq(P.restore(null), null, 'null');
const bad = JSON.parse(P.serialize(g)); bad.players[0].life = 'ciao'; bad.players[1].poison = -5; bad.players[2].cmd = { zzz: 5, p1: '9' }; bad.turn = 99;
const fixed = P.restore(bad); eq(fixed.players[0].life, 40, 'vita sporca ripulita'); eq(fixed.players[1].poison, 0, 'veleno negativo'); eq(fixed.players[2].cmd, { p1: 9 }, 'danni da giocatori inesistenti tolti'); eq(fixed.turn, 2, 'turno fuori scala riportato dentro');

/* nuova partita e rinomina */
P.reset(g); eq(g.players.map(p => p.life), [40, 40, 40], 'reset vite'); eq(g.players[2].cmd, {}, 'reset comandante'); eq(g.hist.length, 0, 'reset cronologia'); eq([g.players[0].exp, g.monarch, g.round], [0, '', 1], 'reset segnalini, monarca e giri');
ok(P.rename(g, 'p2', '  Luca  ') && g.players[1].name === 'Luca', 'rinomina'); ok(!P.rename(g, 'p2', '   '), 'nome vuoto rifiutato');
/* posti e vita prima di iniziare */
g = P.newGame({ players: 4, life: 40 }); P.rename(g, 'p2', 'Luca'); P.resize(g, 6); eq(g.players.length, 6, 'sei posti'); eq(g.players[1].name, 'Luca', 'i primi restano'); eq(g.players[5].name, 'Giocatore 6', 'nuovi posti');
eq(g.players[5].life, 40, 'con la vita iniziale'); P.cmd(g, 'p1', 'p6', 3); P.resize(g, 3); eq(g.players.length, 3, 'tre posti'); eq(g.players[0].cmd, {}, 'il danno da un posto tolto sparisce');
P.setStart(g, 20); eq(g.players.map(p => p.life), [20, 20, 20], 'vita iniziale cambiata per tutti'); eq(P.resize(g, 1).players.length, 2, 'minimo due');
/* fine partita, storico e classifica */
g = P.newGame({ players: 3, life: 40 }); P.rename(g, 'p1', 'Simone'); P.rename(g, 'p2', 'Luca'); P.rename(g, 'p3', 'Marta'); P.begin(g, seq(0)); P.life(g, 'p3', -40); P.nextTurn(g);
let rec = P.finish(g, 'p1', '  Kaalia   of the Vast ', g.t + 65000);
eq([rec.winner, rec.deck, rec.ms, rec.rounds, rec.start], ['Simone', 'Kaalia of the Vast', 65000, 1, 40], 'record: vincitore, mazzo ripulito, durata');
eq(rec.players.map(p => [p.name, p.life, p.out]), [['Simone', 40, false], ['Luca', 40, false], ['Marta', 0, true]], 'record: giocatori e chi era fuori');
rec = P.finish(g, '', 'ignorato', g.t + 1000); eq([rec.winner, rec.deck], ['', ''], 'senza vincitore niente mazzo');
ok(P.finish(g, 'zz', 'x').winner === '', 'vincitore sconosciuto = nessuno'); ok(P.finish(g, 'p1', 'x'.repeat(200)).deck.length === 60, 'mazzo troppo lungo tagliato');
const mk = (names, winner, deck, t) => ({ id: 'g' + t, t, ms: 1000, rounds: 3, start: 40, players: names.map(n => ({ name: n, life: 10, out: false })), winner, deck });
const hist = [mk(['Simone', 'Luca', 'Marta'], 'Luca', 'Kaalia', 3), mk(['Simone', 'Luca'], 'Luca', 'Kaalia', 2), mk(['simone', 'Luca', 'Marta'], 'Simone', 'Atraxa', 1), mk(['Simone', 'Marta'], '', '', 0)];
let tl = P.tally(hist); eq(tl.map(x => [x.name, x.games, x.wins]), [['Luca', 3, 2], ['Simone', 4, 1], ['Marta', 3, 0]], 'classifica per vittorie (maiuscole ignorate)');
eq(tl[0].deck, 'Kaalia', 'il mazzo con cui vince di più'); eq(tl[1].deck, 'Atraxa', 'anche per chi ha vinto una volta'); eq(tl[2].deck, '', 'nessun mazzo se non ha mai vinto'); ok(Math.abs(tl[0].rate - 2 / 3) < 1e-9, 'percentuale');
eq(P.tally([]), [], 'senza partite, classifica vuota');
const tie = P.tally([mk(['A', 'B'], 'A', '', 1), mk(['A', 'B'], 'B', '', 2)]); eq(tie.map(x => x.name), ['A', 'B'], 'a pari merito, ordine alfabetico');
eq(P.restoreHistory(JSON.stringify(hist)).length, 4, 'storico ripristinato'); eq(P.restoreHistory('rotto'), [], 'testo rotto'); eq(P.restoreHistory({}), [], 'non è una lista');
const dirty = P.restoreHistory([{ players: [{ name: 'A' }] }, { id: 'x', t: 'boh', ms: -5, rounds: 'x', players: [{ name: ' Ale ', life: 'ciao' }, { name: '' }], winner: 5, deck: null }]);
eq(dirty.length, 1, 'un record con un solo giocatore si scarta'); eq([dirty[0].t, dirty[0].ms, dirty[0].rounds, dirty[0].players[0].name, dirty[0].players[0].life, dirty[0].players[1].name, dirty[0].winner, dirty[0].deck], [0, 0, 1, 'Ale', 0, '?', '5', ''], 'record sporco ripulito');
eq(P.restoreHistory(Array.from({ length: 300 }, (_, i) => mk(['A', 'B'], 'A', '', i))).length, 200, 'al massimo 200 partite');

/* ----- tavoli salvati: la classifica è del tavolo ----- */
{
  const tg = P.newGame({ players: 3, life: 30, names: ['Simone', 'Luca', 'Marta'], cmdLife: false });
  eq(tg.table, '', 'una partita nuova è senza tavolo');
  const tb = P.makeTable(tg, '  Il   venerdì ', 1000);
  eq([tb.name, tb.players, tb.start, tb.cmdLife], ['Il venerdì', ['Simone', 'Luca', 'Marta'], 30, false], 'tavolo: nome ripulito, nomi, vita, regola');
  ok(/^Tavolo di Simone e Luca$/.test(P.makeTable(tg, '', 1).name), 'senza nome, un nome pensato da solo');
  ok(P.sameTable(tg, tb), 'il tavolo coincide con la preparazione'); tg.players[1].name = 'Luigi'; ok(!P.sameTable(tg, tb), 'un nome diverso lo fa risultare modificato');
  tg.players[1].name = 'Luca'; tg.cmdLife = true; ok(!P.sameTable(tg, tb), 'anche la regola del comandante conta'); tg.cmdLife = false;
  const other = P.newGame({ players: 5, life: 20 }); P.applyTable(other, tb);
  eq([other.players.map(p => p.name), other.start, other.cmdLife, other.table, other.players.map(p => p.life)], [['Simone', 'Luca', 'Marta'], 30, false, tb.id, [30, 30, 30]], 'carica un tavolo: posti, nomi, vita e regola');
  ok(P.applyTable(other, null) === other, 'applicare «niente» non rompe');
  /* una partita porta con sé il suo tavolo */
  other.table = tb.id; eq(P.finish(other, 'p1', 'Kaalia', 5).table, tb.id, 'il record ricorda il tavolo');
  eq(P.finish(P.newGame({}), '', '', 5).table, '', 'senza tavolo, id vuoto');
  const r2 = (names, w, t, tbl) => Object.assign(mk(names, w, '', t), { table: tbl });
  const mix = [r2(['A', 'B'], 'A', 1, 'tX'), r2(['A', 'C'], 'C', 2, 'tY'), r2(['A', 'B'], 'B', 3, 'tX'), r2(['A', 'B'], 'A', 4, ''), mk(['A', 'B'], 'A', '', 5)];
  eq(P.forTable(mix, 'tX').map(r => r.t), [1, 3], 'solo le partite di quel tavolo');
  eq(P.forTable(mix, '').map(r => r.t), [4, 5], 'tavolo vuoto = partite senza tavolo (anche quelle vecchie, senza campo)');
  eq(P.forTable(mix).length, 2, 'senza id come tavolo vuoto');
  eq(P.tally(P.forTable(mix, 'tX')).map(x => [x.name, x.wins, x.games]), [['A', 1, 2], ['B', 1, 2]], 'la classifica del tavolo conta solo il tavolo');
  eq(P.tally(P.forTable(mix, 'tY')).map(x => [x.name, x.wins, x.games]), [['C', 1, 1], ['A', 0, 1]], 'un altro tavolo ha un’altra classifica');
  eq(P.restoreHistory(JSON.stringify(mix)).map(r => r.table), ['tX', 'tY', 'tX', '', ''], 'il tavolo sopravvive al ripristino');
  /* salvataggio della partita in corso */
  const g3 = P.restore(P.serialize(Object.assign(P.newGame({}), { table: tb.id }))); eq(g3.table, tb.id, 'la partita in corso ricorda il tavolo');
  eq(P.restore(JSON.stringify(Object.assign(P.newGame({}), { table: 5 }))).table, '5', 'id strano ripulito'); eq(P.restore(JSON.stringify(Object.assign(P.newGame({}), { table: undefined }))).table, '', 'partita vecchia, nessun tavolo');
  /* ripristino dell'elenco */
  const ts = P.restoreTables(JSON.stringify([tb, tb, { id: 't2', name: '  ', players: ['A', ' B ', ''], start: 'boh', cmdLife: false }, { id: 't3', players: ['solo'] }, { name: 'senza id', players: ['A', 'B'] }, null, 7]));
  eq(ts.length, 2, 'doppioni, tavoli con un giocatore e senza id si scartano'); eq([ts[1].name, ts[1].players, ts[1].start, ts[1].cmdLife], ['Tavolo', ['A', 'B', '?'], 40, false], 'tavolo sporco ripulito');
  eq(P.restoreTables('rotto'), [], 'elenco rotto'); eq(P.restoreTables({}), [], 'non è una lista');
  eq(P.restoreTables(Array.from({ length: 40 }, (_, i) => ({ id: 't' + i, name: 'x', players: ['A', 'B'] }))).length, P.TABLES_MAX, 'al massimo 20 tavoli');
}

/* amici seduti al tavolo (id del server) e classifica condivisa */
{
  const U1 = '11111111-1111-1111-1111-111111111111', U2 = '22222222-2222-2222-2222-222222222222';
  const g = P.newGame({ players: 3 });
  eq([P.hasFriends(g), P.roster(g)], [false, [{ name: 'Io' }, { name: 'Giocatore 2' }, { name: 'Giocatore 3' }]], 'all\'inizio nessun amico: posti con il solo nome');
  eq(P.seatUser(g, 'p1', U1.toUpperCase(), '  Elena '), true, 'seduta Elena'); eq([g.players[0].name, g.players[0].u, P.hasFriends(g)], ['Elena', U1, true], 'nome e id');
  eq([P.seatUser(g, 'p2', U1, 'Elena'), P.seatUser(g, 'p2', 'xx', 'Bru'), P.seatUser(g, 'p2', U2, ''), P.seatUser(g, 'p9', U2, 'Bru')], [false, true, false, false], 'lo stesso amico due volte, id brutto (= nome libero), senza nome, posto inesistente');
  eq('u' in g.players[1], false, 'un id brutto toglie l\'amico'); P.seatUser(g, 'p2', U2, 'Fabio'); eq(P.roster(g), [{ name: 'Elena', u: U1 }, { name: 'Fabio', u: U2 }, { name: 'Giocatore 3' }], 'posti come li vuole il server');
  P.rename(g, 'p2', 'Fabio'); eq(g.players[1].u, U2, 'stesso nome: resta l\'amico'); P.rename(g, 'p2', 'Fab'); eq('u' in g.players[1], false, 'nome cambiato a mano: torna libero'); P.seatUser(g, 'p2', U2, 'Fabio');
  eq(P.seatUser(g, 'p2', '', ''), true, 'togliere l\'amico'); eq(g.players[1].name, 'Fabio', 'il nome resta'); P.seatUser(g, 'p2', U2, 'Fabio');
  const back = P.restore(P.serialize(g)); eq(back.players.map(p => p.u || ''), [U1, U2, ''], 'gli amici sopravvivono al salvataggio');
  eq(P.restore(JSON.stringify(Object.assign(JSON.parse(P.serialize(g)), { players: g.players.map((p, i) => Object.assign({}, p, { u: i ? 'boh' : U1 })) }))).players.map(p => 'u' in p), [true, false, false], 'id sporchi ripuliti');
  P.resize(g, 2); eq(g.players.map(p => p.u || ''), [U1, U2], 'togliere un posto non tocca gli altri'); P.resize(g, 3); eq('u' in g.players[2], false, 'il nuovo posto è libero');
  P.begin(g, () => 0); P.cmd(g, 'p2', 'p1', 21); const rec = P.finish(g, 'p1', 'Kaalia', 5000);
  eq([rec.players.map(p => p.u || ''), rec.wu, rec.winner], [[U1, U2, ''], U1, 'Elena'], 'la partita ricorda chi è chi'); eq(P.finish(g, '', '', 5000).wu, undefined, 'senza vincitore, niente id'); eq(P.finish(g, 'p3', '', 5000).wu, undefined, 'vincitore ospite: niente id');
  eq(P.restoreHistory([rec])[0].wu, U1, 'l\'id del vincitore sopravvive'); eq(P.restoreHistory([rec])[0].players.map(p => p.u || ''), [U1, U2, ''], 'e quello dei giocatori'); eq(P.restoreHistory([Object.assign({}, rec, { wu: 'x' })])[0].wu, '', 'id sporco');
  /* la classifica segue l'id: se un amico cambia nome resta la stessa persona */
  const mk = (names, w, wu) => ({ id: 'g' + Math.random(), t: 1, ms: 1, rounds: 1, start: 40, players: names.map(([n, u]) => ({ name: n, life: 1, out: false, u: u || undefined })), winner: w, wu: wu || '', deck: 'D', table: '' });
  const tl = P.tally([mk([['Elena', U1], ['Fab', U2]], 'Fab', U2), mk([['Elena', U1], ['Fab', U2]], 'Fab', U2), mk([['Elena', U1], ['Fabio', U2]], 'Elena', U1)]);
  eq(tl.map(x => [x.name, x.wins, x.games]), [['Fab', 2, 3], ['Elena', 1, 3]], 'stesso id = stessa persona, anche con nomi diversi (vale il nome della partita più recente, la prima dell\'elenco)');
  eq(P.tally([mk([['Ugo'], ['Elena', U1]], 'Ugo'), mk([['ugo'], ['Elena', U1]], 'ugo')]).map(x => [x.name, x.wins, x.games]), [['Ugo', 2, 2], ['Elena', 0, 2]], 'gli ospiti si riconoscono dal nome, senza badare alle maiuscole');
  eq(P.tally([mk([['Elena', U1], ['Ugo']], 'Ugo')]).map(x => [x.name, x.wins]), [['Ugo', 1], ['Elena', 0]], 'un ospite che si chiama come un amico non lo ruba');
  /* tavoli con amici */
  const tbl = { id: 't-uuid', name: 'Venerdì', players: ['Elena', 'Fabio', 'Marta'], users: [U1, U2, ''], start: 30, cmdLife: false };
  const g4 = P.newGame({ players: 4 }); P.applyTable(g4, tbl); eq([g4.players.map(p => p.name), g4.players.map(p => p.u || ''), g4.start, g4.cmdLife, g4.table], [['Elena', 'Fabio', 'Marta'], [U1, U2, ''], 30, false, 't-uuid'], 'tavolo condiviso applicato: posti, amici, vita');
  eq(P.sameTable(g4, tbl), true, 'uguale'); P.seatUser(g4, 'p3', U1, 'x'); eq(P.sameTable(g4, tbl), true, 'amico già seduto: non cambia'); P.rename(g4, 'p2', 'Fab'); eq(P.sameTable(g4, tbl), false, 'nome cambiato');
  P.applyTable(g4, tbl); P.seatUser(g4, 'p3', '', ''); P.seatUser(g4, 'p2', '', ''); eq(P.sameTable(g4, tbl), false, 'amico tolto: il tavolo condiviso non è più lo stesso');
  const loc = { id: 't1', name: 'L', players: ['Elena', 'Fabio', 'Marta'], start: 30, cmdLife: false }; P.applyTable(g4, loc); eq(g4.players.map(p => p.u || ''), ['', '', ''], 'un tavolo del dispositivo ha solo nomi: niente amici'); P.seatUser(g4, 'p1', U1, 'Elena'); eq(P.sameTable(g4, loc), true, 'e di amici non si accorge');
  eq(P.restoreTables([Object.assign({}, tbl)]).length, 1, 'ripristino tavoli locali: ok'); eq(P.restore(JSON.stringify(Object.assign(P.newGame({}), { table: 'x'.repeat(60) }))).table.length, 40, 'id tavolo lungo (uuid) non tagliato a 24');
}
console.log('pescher-test: ' + n + ' controlli ok');
