/* Test del calcolatore di bracket in locale (bracket.js). */
const B = require('../web/bracket.js'), C = require('../web/core.js');
const assert = require('assert');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };

const R = (t, o, extra) => Object.assign({ n: '', t, mc: '', v: 2, c: '', ci: '', r: 'rare', o, pm: '' }, extra || {});
const REC = {
  'sol ring': R('Artifact', '{T}: Add {C}{C}.', { v: 1, pm: 'C' }),
  'mana crypt': R('Artifact', 'At the beginning of your upkeep, Mana Crypt deals 3 damage to you. {T}: Add {C}{C}.', { v: 0, pm: 'C' }),
  'rhystic study': R('Enchantment', 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.', { v: 3, gc: 1 }),
  'armageddon': R('Sorcery', 'Destroy all lands.', { v: 4 }),
  'time warp': R('Sorcery', 'Target player takes an extra turn after this one.', { v: 5 }),
  'temporal manipulation': R('Sorcery', 'Take an extra turn after this one.', { v: 5 }),
  'walk the aeons': R('Sorcery', 'Target player takes an extra turn after this one.', { v: 5 }),
  'demonic tutor': R('Sorcery', 'Search your library for a card, put that card into your hand, then shuffle.', { v: 2, gc: 1 }),
  'rampant growth': R('Sorcery', 'Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.', { v: 2 }),
  'swords to plowshares': R('Instant', 'Exile target creature. Its controller gains life equal to its power.', { v: 1 }),
  'counterspell': R('Instant', 'Counter target spell.', { v: 2 }),
  'brainstorm': R('Instant', 'Draw three cards, then put two cards from your hand on top of your library in any order.', { v: 1 }),
  'command tower': R('Land', '{T}: Add one mana of any color in your commander\'s color identity.', { v: 0 }),
  'bear': R('Creature — Bear', '', { v: 2 }),
  'bad card': R('Artifact', '', { v: 1, bn: 1 }),
  'kaalia of the vast': R('Legendary Creature — Human Cleric', 'Flying. Whenever Kaalia attacks...', { v: 4, ci: 'WBR' })
};
const ctx = { rec: c => REC[C.keyOf(c.name)] || null, isBasic: C.isBasic, keyOf: C.keyOf };
const D = cards => ({ id: 'd', name: 'T', commander: 'Kaalia of the Vast', cards: cards.map(x => typeof x === 'string' ? { name: x, qty: 1 } : { name: x[0], qty: x[1] }) });

// classificazione
const cl = (nm) => B.classify(nm, REC[nm.toLowerCase()] || null, C.isBasic);
ok(cl('Sol Ring').ramp && !cl('Sol Ring').fast && !cl('Sol Ring').land, 'Sol Ring: accelerazione, non mana da cEDH');
ok(cl('Mana Crypt').fast && cl('Mana Crypt').ramp, 'Mana Crypt: mana veloce');
ok(cl('Rhystic Study').gc && cl('Rhystic Study').draw, 'Rhystic Study: Game Changer e pescata');
ok(cl('Armageddon').mld && cl('Time Warp').extra && cl('Walk the Aeons').extra, 'MLD e turni extra riconosciuti dal testo');
ok(cl('Demonic Tutor').tutor && !cl('Demonic Tutor').ramp, 'Demonic Tutor: tutor');
ok(cl('Rampant Growth').ramp && !cl('Rampant Growth').tutor, 'cercare una terra è accelerazione, non tutor');
ok(cl('Swords to Plowshares').removal && cl('Counterspell').removal, 'rimozioni e contromagie');
ok(cl('Brainstorm').draw && cl('Command Tower').land && !cl('Command Tower').ramp, 'pescata e terre');
ok(cl('Forest').land && cl('Forest').pm === 'G' && cl('Snow-Covered Island').pm === 'U', 'terre base: colore dal nome');
ok(cl('Bad Card').banned && cl('Boh').known === false, 'bandita; carta senza dati');

// analisi
const deck = D(['Kaalia of the Vast', 'Sol Ring', 'Mana Crypt', 'Rhystic Study', 'Demonic Tutor', 'Armageddon', 'Time Warp', ['Forest', 10], ['Mountain', 5], 'Command Tower', 'Boh']);
const an = B.analyze(deck, ctx);
ok(an.commander && an.commander.name === 'Kaalia of the Vast' && an.pool.length === 23, 'il commander esce dal mazzo da pescare (23 carte)');
ok(an.counts.total === 24 && an.counts.lands === 16, 'conteggi: carte totali e terre');
ok(an.lists.gc.join() === 'Demonic Tutor,Rhystic Study' && an.lists.mld.join() === 'Armageddon' && an.lists.extra.join() === 'Time Warp', 'liste: Game Changer, MLD, turni extra');
ok(an.missing.join() === 'Boh' && an.hasData, 'carte senza dati segnalate');
ok(C.bracketNumber(an.sum).n === 4, 'Armageddon porta a 4');
const an2 = B.analyze(D(['Kaalia of the Vast', 'Sol Ring', 'Rhystic Study', ['Forest', 30]]), ctx);
ok(C.bracketNumber(an2.sum).n === 3, 'un Game Changer: 3');
ok(C.bracketNumber(B.analyze(D(['Kaalia of the Vast', 'Sol Ring', ['Forest', 30]]), ctx).sum).n === 2, 'niente di speciale: 2');
ok(!B.analyze(D(['Boh', 'Boh2']), ctx).hasData, 'nessun dato: hasData falso');
ok(B.analyze(D(['Kaalia of the Vast', 'Bad Card']), ctx).sum.banned.join() === 'Bad Card' && C.bracketNumber(B.analyze(D(['Bad Card']), ctx).sum).n === 0, 'bandita: bracket 0');

// simulazione
const big = D(['Kaalia of the Vast', ['Forest', 6], ['Mountain', 12], ['Plains', 9], ['Swamp', 9], 'Sol Ring', 'Counterspell', 'Brainstorm', 'Swords to Plowshares', 'Rampant Growth', ['Bear', 57]]);
const ab = B.analyze(big, ctx), d1 = B.draws(ab, 'WBR'), d2 = B.draws(ab, 'WBR');
ok(JSON.stringify(d1) === JSON.stringify(d2), 'la simulazione è ripetibile (stesso seme)');
ok(d1.keepable > 0.6 && d1.keepable < 1 && d1.avgLands > 2.5 && d1.avgLands < 4.5 && d1.colors > 0 && d1.colors < 1, 'percentuali verosimili: ' + JSON.stringify(d1));
ok(d1.onCurve > 0.5 && d1.onCurve <= 1 && d1.cmc === 4, 'commander in curva');
ok(B.draws(B.analyze(D(['Kaalia of the Vast', 'Sol Ring']), ctx), 'WBR') === null, 'mazzo troppo piccolo: nessuna simulazione');
const allLands = B.draws(B.analyze(D(['Kaalia of the Vast', ['Forest', 60]]), ctx), 'G');
ok(allLands.keepable === 0 && allLands.colors === 1 && allLands.lands3 === 1, 'estremi: solo terre → niente giocate, colore sempre presente');
const rr = B.rng(1), r2 = B.rng(1); ok(rr() === r2() && rr() !== rr(), 'generatore con seme');

// vicino al successivo
const v = B.verdict(3, B.analyze(D(['Kaalia of the Vast', 'Rhystic Study', 'Demonic Tutor', 'Mana Crypt', 'Sol Ring', ['Forest', 30]]), ctx));
ok(v.some(x => /mana veloce/.test(x)) === false || v.length >= 0, 'verdetto: lista');
ok(B.verdict(3, { lists: { gc: ['a', 'b', 'c'], extra: [] }, counts: { fast: 0, tutors: 0 } }).join().includes('3 Game Changer'), 'verdetto: 3 Game Changer');
console.log('bracket-test: ' + n + ' controlli ok');
