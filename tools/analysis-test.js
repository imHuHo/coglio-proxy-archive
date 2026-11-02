/* Test dell'analisi del mazzo (analysis.js). Uso: node tools/analysis-test.js */
const A = require('../web/analysis.js'), C = require('../web/core.js');
const assert = require('assert');
let n = 0; const ok = (c, m) => { assert(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

const R = (t, mc, v, c, ci, extra) => Object.assign({ n: '', t, mc, v, c, ci, r: 'rare', o: '', pm: '' }, extra || {});
const REC = {
  'kaalia of the vast': R('Legendary Creature — Human Cleric', '{1}{R}{W}{B}', 4, 'WBR', 'WBR', { o: 'Flying' }),
  'sol ring': R('Artifact', '{1}', 1, '', '', { pm: 'C' }),
  'arcane signet': R('Artifact', '{2}', 2, '', '', { pm: 'WUBRG' }),
  'swords to plowshares': R('Instant', '{W}', 1, 'W', 'W'),
  'lightning bolt': R('Instant', '{R}', 1, 'R', 'R'),
  'doom blade': R('Instant', '{1}{B}', 2, 'B', 'B'),
  'akroma, angel of fury': R('Legendary Creature — Angel', '{5}{R}{R}{R}', 8, 'R', 'R'),
  'serra angel': R('Creature — Angel', '{3}{W}{W}', 5, 'W', 'W'),
  'wrath of god': R('Sorcery', '{2}{W}{W}', 4, 'W', 'W'),
  'electrolyze': R('Instant', '{1}{U/R}{U/R}', 3, 'UR', 'UR'),
  'counterspell': R('Instant', '{U}{U}', 2, 'U', 'U'),
  'birds of paradise': R('Creature — Bird', '{G}', 1, 'G', 'G', { pm: 'WUBRG' }),
  'command tower': R('Land', '', 0, '', '', { pm: 'WUBRG' }),
  'godless shrine': R('Land — Plains Swamp', '', 0, '', 'WB', { pm: 'WB' }),
  'evolving wilds': R('Land', '', 0, '', '', { o: 'Evolving Wilds enters tapped. {T}, Sacrifice: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle.' }),
  'bad card': R('Artifact', '{1}', 1, '', '', { bn: 1 }),
  'unset card': R('Artifact', '{1}', 1, '', '', { nl: 1 }),
  'relentless rats': R('Creature — Rat', '{1}{B}', 2, 'B', 'B'),
  'mdfc': R('Sorcery // Land', '{1}{R}', 2, 'R', 'R'),
  'bear': R('Creature — Bear', '{1}{G}', 2, 'G', 'G'),
  'mountain': R('Basic Land — Mountain', '', 0, '', 'R', { pm: 'R' })
};
const ctx = { rec: c => REC[C.keyOf(c.name)] || null, isBasic: C.isBasic, keyOf: C.keyOf };
const D = (cards, o) => Object.assign({ id: 'd', name: 'T', kind: 'deck', commander: 'Kaalia of the Vast', cards: cards.map(x => typeof x === 'string' ? { name: x, qty: 1 } : { name: x[0], qty: x[1] }), side: [] }, o || {});

/* simboli di mana */
eq(A.pips('{2}{W}{W}{U/R}{G/P}{X}'), { W: 2, U: 1, B: 0, R: 1, G: 1 }, 'simboli: ibridi su entrambi i colori, phyrexian sul suo colore, generici ignorati');
eq(A.pips('{W/W}'), { W: 1, U: 0, B: 0, R: 0, G: 0 }, 'un simbolo non conta due volte lo stesso colore');
eq(A.pips(''), { W: 0, U: 0, B: 0, R: 0, G: 0 }, 'costo vuoto');
ok(A.typeOf('Artifact Creature — Golem') === 'creature' && A.typeOf('Legendary Land') === 'land' && A.typeOf('Sorcery // Land') === 'sorcery' && A.typeOf('Enchantment — Aura') === 'enchantment', 'tipi con la stessa precedenza della pagina del mazzo');

/* mazzo di prova */
const d = D([['Kaalia of the Vast', 1], ['Sol Ring', 1], ['Arcane Signet', 1], ['Swords to Plowshares', 2], ['Lightning Bolt', 1], ['Doom Blade', 1], ['Akroma, Angel of Fury', 1], ['Serra Angel', 1], ['Wrath of God', 1],
  ['Command Tower', 1], ['Godless Shrine', 1], ['Evolving Wilds', 1], ['Mountain', 8], ['Plains', 6], ['Swamp', 5], ['Boh', 1]]);
const a = A.analyze(d, ctx);
ok(a.hasData && a.commander === 'Kaalia of the Vast', 'commander riconosciuto');
eq(a.missing, ['Boh'], 'carta senza dati dichiarata');
eq(a.total, 33, 'totale carte (commander compreso)');
/* curva: non terra senza commander: Sol 1, Signet 2, Swords×2 (1), Bolt 1, Doom 2, Akroma 8→7+, Serra 5, Wrath 4 */
eq(a.curve, [0, 4, 2, 0, 1, 1, 0, 1], 'curva di mana per costo (7 = 7 o più)');
ok(a.spells === 9 && Math.abs(a.avgCmc - (1 + 2 + 2 + 1 + 2 + 8 + 5 + 4) / 9) < 1e-9, 'costo medio: ' + a.avgCmc);
ok(a.cmdCmc === 4 && a.peak === 1, 'costo del commander e picco della curva');
eq(a.pips, { W: 6, U: 0, B: 1, R: 4, G: 0 }, 'simboli per colore (senza il commander)');
ok(a.pipTotal === 11, 'totale simboli');
eq(a.cmdPips, { W: 1, U: 0, B: 1, R: 1, G: 0 }, 'simboli del commander a parte');
ok(a.byColor.W === 4 && a.byColor.R === 2 && a.byColor.B === 1 && a.byColor.C === 2 && a.byColor.multi === 0, 'carte per colore e incolori: ' + JSON.stringify(a.byColor));

/* tipi: il commander è a parte */
const T = Object.fromEntries(a.types.map(t => [t.k, t.n]));
eq(T, { creature: 2, instant: 4, sorcery: 1, artifact: 2, land: 22 }, 'conteggio per tipo');
ok(a.lands === 22, 'terre');

/* fonti di mana */
const S = Object.fromEntries(a.sources.map(s => [s.k, s]));
ok(S.R.land === 8 + 1 && S.W.land === 6 + 1 + 1 && S.B.land === 5 + 1 + 1, 'fonti da terre: basi + Command Tower + Godless Shrine');
ok(S.W.other === 1 && S.R.other === 1 && S.C.other === 1 && S.C.land === 0, 'altre fonti: Arcane Signet su tutti i colori, Sol Ring incolore');
ok(a.rocks === 2 && a.searchers === 1, 'acceleratori e terre che cercano');
ok(S.U.n === 2 && S.U.pips === 0 && S.U.flag === '', 'un colore senza simboli non viene segnalato');
ok(S.B.pips === 1 && S.B.flag === 'low' === (S.B.n < 8), 'segnalazione «poche fonti» coerente con la soglia');
const poor = A.analyze(D([['Kaalia of the Vast', 1], ['Serra Angel', 4], ['Wrath of God', 4], ['Plains', 3], ['Mountain', 2]]), ctx);
ok(poor.sources.find(s => s.k === 'W').flag === 'low', 'colore principale con 3 fonti: segnalato');

/* identità di colore */
ok(a.identity.applies && a.identity.colors.join('') === 'WBR', 'identità del commander');
eq(a.identity.bad.map(b => b.name), [], 'nessuna carta fuori identità');
const off = A.analyze(D([['Kaalia of the Vast', 1], ['Counterspell', 1], ['Electrolyze', 1], ['Birds of Paradise', 1], ['Swords to Plowshares', 1], ['Forest', 2], ['Island', 1]]), ctx);
eq(off.identity.bad.map(b => b.name).sort(), ['Birds of Paradise', 'Counterspell', 'Electrolyze', 'Forest', 'Island'].sort(), 'carte e terre base fuori identità');
ok(off.identity.bad.find(b => b.name === 'Electrolyze').extra.join('') === 'U', 'di Electrolyze (UR) fuori solo il blu');

/* legalità */
const L = a.legality;
ok(!L.clean && !L.ok && L.issues.find(i => i.k === 'single').names.join() === 'Swords to Plowshares ×2', 'mazzo di prova: due Swords sono un errore (carta singola)');
ok(L.issues.some(i => i.k === 'size' && /33/.test(i.text)) && L.issues.some(i => i.k === 'data' && i.names[0] === 'Boh'), 'avviso sul numero di carte e sui dati mancanti');
const bad = A.analyze(D([['Kaalia of the Vast', 1], ['Bad Card', 1], ['Unset Card', 1], ['Sol Ring', 2], ['Relentless Rats', 5], ['Mountain', 40]]), ctx);
ok(!bad.legality.ok, 'con carte bandite, non legali e doppie non è legale');
eq(bad.legality.issues.find(i => i.k === 'ban').names, ['Bad Card'], 'bandita');
eq(bad.legality.issues.find(i => i.k === 'nl').names, ['Unset Card'], 'non legale');
eq(bad.legality.issues.find(i => i.k === 'single').names, ['Sol Ring ×2'], 'doppie: Sol Ring sì, Relentless Rats e terre base no');
const ok100 = A.analyze(D([['Kaalia of the Vast', 1], ['Sol Ring', 1], ['Mountain', 98]]), ctx);
ok(ok100.total === 100 && ok100.legality.clean, 'cento carte, tutto in regola: pulito');
const notLeg = A.analyze(D([['Bear', 1], ['Mountain', 99]], { commander: 'Bear' }), ctx);
ok(notLeg.legality.issues.some(i => i.k === 'cmd' && i.sev === 'error'), 'commander non leggendario: errore');
const noCmd = A.analyze(D([['Sol Ring', 1], ['Mountain', 99]], { commander: null }), ctx);
ok(!noCmd.identity.applies && noCmd.legality.issues.some(i => i.k === 'cmd' && i.sev === 'warn'), 'senza commander: avviso, niente controllo dell\'identità');
const side = A.analyze(Object.assign(D([['Kaalia of the Vast', 1], ['Mountain', 99]]), { side: [{ name: 'Bad Card', qty: 3 }] }), ctx);
ok(side.total === 100 && side.legality.clean, 'il sideboard non conta nell\'analisi');
ok(!A.analyze(D([['Boh', 3]]), ctx).hasData, 'senza nessun dato: hasData falso');

console.log('analysis-test: ' + n + ' controlli ok');
