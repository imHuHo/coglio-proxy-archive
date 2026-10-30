const C = require('../web/core.js');
const fs = require('fs');
const assert = require('assert');
const rd = f => fs.readFileSync(__dirname + '/fixtures/' + f, 'utf8');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };

// 1. parser sulle liste vere
const o = C.parseList(rd('kaalia_old.txt')), nw = C.parseList(rd('kaalia_new.txt'));
ok(o.total === 100 && nw.total === 100, 'totali 100/100: ' + o.total + '/' + nw.total);
ok(o.hints[0] === 'Kaalia of the Vast', 'hint commander (blocco finale): ' + o.hints);
ok(o.cards.find(c => c.name === 'Mountain').qty === 8, 'qty 8 Mountain');

// 2. formati Moxfield/Archidekt
const m = C.parseList(rd('moxfield.txt'));
const by = n => m.cards.find(c => C.keyOf(c.name) === C.keyOf(n));
ok(m.hints[0].startsWith('Atraxa'), 'hint da sezione Commander');
ok(by('Sol Ring').set === 'C21' && by('Sol Ring').cn === '263', 'set+numero');
ok(by('Lightning Greaves').set === 'CMM' && by('Lightning Greaves').cn === '400', 'parentesi quadre + foil');
ok(by('Fire').name === 'Fire // Ice' && by('Fire').set === 'MMA', 'carta doppia');
ok(by('Arcane Signet').qty === 2 && by('Arcane Signet').set === 'ELD', 'tag ^..^ ignorati');
ok(by('Seance Board') && by('Island').qty === 3, 'accenti e basic');
ok(m.excluded === 2 && !by('Counterspell') && !by('Mystic Snake'), 'sideboard escluso');
ok(m.total === 1 + 1 + 1 + 1 + 2 + 1 + 3, 'totale main: ' + m.total);
ok(C.keyOf('Fire // Ice') === C.keyOf('fire'), 'chiave faccia anteriore');

// 3. archivio
const mk = (id, name, kind, active, cards, extra) => Object.assign({ id, name, kind, active, commander: null, cards, upgrades: [], createdAt: 0, updatedAt: 0 }, extra || {});
const kaalia = mk('k', 'Kaalia', 'deck', true, o.cards, { commander: 'Kaalia of the Vast' });
const other = mk('x', 'Altro', 'deck', false, [{ name: 'Sol Ring', qty: 1, set: 'C21', cn: '1' }, { name: "Serra's Emissary", qty: 1, set: '', cn: '' }]);
const binder = mk('b', 'Raccolta', 'binder', false, [{ name: 'Blood Crypt', qty: 1, set: '', cn: '' }, { name: 'Badlands', qty: 1, set: '', cn: '' }]);
let A = C.buildArchive([kaalia, other, binder]);
const sol = A.map['sol ring'];
ok(sol.owned === 2 && sol.occupied === 1 && sol.free === 1 && sol.status === 'part', 'Sol Ring parziale');
ok(sol.rows.length === 2 && sol.sets.join() === 'C21', 'righe e collezioni');
ok(A.map['serra\'s emissary'].status === 'free', 'carta di mazzo non attivo = libera');
ok(A.map['blood crypt'].status === 'free', 'raccolta = libera');
ok(A.map['mountain'].occupied === 8, 'basic occupate');
other.active = true; A = C.buildArchive([kaalia, other, binder]);
ok(A.map['sol ring'].status === 'busy' && A.map['sol ring'].free === 0, 'Sol Ring tutte occupate');
other.active = false;

// 4. upgrade
const up = { id: 'u', name: 'Nuovo', cards: nw.cards, commander: 'Kaalia of the Vast', createdAt: 0 };
kaalia.upgrades = [up];
const D = C.diffUpgrade(kaalia, up, [kaalia, other, binder], { basicsUnlimited: true });
ok(D.outQty === 73 && D.inQty === 73, 'cambi 73/73 (con basic): ' + D.outQty + '/' + D.inQty);
const find = n => D.inn.find(x => x.name === n);
ok(find("Serra's Emissary").covered === 1 && find("Serra's Emissary").sources[0].deckName === 'Altro', 'carta libera in altro mazzo');
ok(find('Blood Crypt').covered === 1 && find('Blood Crypt').sources[0].kind === 'binder', 'carta nella raccolta');
ok(find('Baneslayer Angel').missing === 1, 'carta da procurare');
ok(D.inn.every(x => !x.basic), 'nessuna basic tra le entrate');
ok(D.covered === 3 && D.missing === 70, 'coperte/mancanti: ' + D.covered + '/' + D.missing);
other.active = true;
const D2 = C.diffUpgrade(kaalia, up, [kaalia, other, binder], {});
ok(D2.inn.find(x => x.name === "Serra's Emissary").missing === 1 && D2.inn.find(x => x.name === "Serra's Emissary").busyIn[0].deckName === 'Altro', 'carta occupata altrove');
// basic illimitate
const up2 = { id: 'u2', name: 'Più terre', cards: kaalia.cards.map(c => c.name === 'Swamp' ? { ...c, qty: 10 } : c), commander: null, createdAt: 0 };
const D3 = C.diffUpgrade(kaalia, up2, [kaalia], { basicsUnlimited: true });
ok(D3.inQty === 2 && D3.missing === 0 && D3.inn[0].basic, 'terre base illimitate');
const D4 = C.diffUpgrade(kaalia, up2, [kaalia], { basicsUnlimited: false });
ok(D4.missing === 2, 'terre base contate');

// 5. applica upgrade
other.active = false;
C.applyUpgrade(kaalia, up);
ok(kaalia.cards.length === nw.cards.length && kaalia.upgrades.length === 0, 'applicato');
ok(C.diffUpgrade(kaalia, up, [kaalia], {}).outQty === 0, 'diff vuoto dopo applicazione');
ok(C.exportText(kaalia).split('\n').length === nw.cards.length, 'export testo');
// 6. sanitize
ok(C.sanitizeDeck({ name: 'x', cards: [{ name: ' A ', qty: '3' }, { name: '' }] }).cards[0].qty === 3, 'sanitize');

// 7. upgrade applicato: le carte si spostano (escono -> sciolte, entrano <- sciolte / mazzi non attivi)
{
  const o2 = C.parseList(rd('kaalia_old.txt')), n2 = C.parseList(rd('kaalia_new.txt'));
  const kk = mk('k2', 'Kaalia', 'deck', true, o2.cards, { commander: 'Kaalia of the Vast' });
  const upg = { id: 'u', name: 'N', cards: n2.cards, commander: null, createdAt: 0 };
  kk.upgrades = [upg];
  const sciolte = mk('b2', 'Sciolte', 'binder', false, [{ name: 'Blood Crypt', qty: 1, set: '', cn: '' }, { name: 'Mountain', qty: 1, set: '', cn: '' }]);
  const altro = mk('x2', 'Altro', 'deck', false, [{ name: "Serra's Emissary", qty: 1, set: '', cn: '' }]);
  const decks = [kk, sciolte, altro];
  const snap = JSON.stringify(decks);
  const prev = C.applyUpgradeMoves(C.clone(decks), 'k2', 'u', { basicsUnlimited: true });
  ok(JSON.stringify(decks) === snap, 'anteprima su copia non modifica i dati');
  ok(prev.toLoose.reduce((t, x) => t + x.qty, 0) === 73, 'anteprima: 73 carte vanno nelle sciolte');
  const rep = C.applyUpgradeMoves(decks, 'k2', 'u', { basicsUnlimited: true });
  const q = (d, name) => (d.cards.find(c => C.keyOf(c.name) === C.keyOf(name)) || { qty: 0 }).qty;
  ok(rep.toLoose.reduce((t, x) => t + x.qty, 0) === 73 && !rep.createdBinder, 'resoconto: 73 nelle sciolte');
  ok(q(sciolte, 'Akroma, Angel of Fury') === 1 && q(sciolte, 'Mortify') === 1, 'carte tolte ora sciolte');
  ok(q(sciolte, 'Mountain') === 3 && q(sciolte, 'Swamp') === 2 && q(sciolte, 'Plains') === 2, 'anche le terre base tolte diventano sciolte');
  ok(q(sciolte, 'Blood Crypt') === 0 && rep.fromLoose.some(x => x.name === 'Blood Crypt'), 'Blood Crypt passa dalle sciolte al mazzo');
  ok(altro.cards.length === 0 && rep.fromDecks[0].deckName === 'Altro', "Serra's Emissary preso dal mazzo non attivo");
  ok(sum(kk.cards) === 100 && kk.upgrades.length === 0 && q(kk, 'Baneslayer Angel') === 1, 'mazzo aggiornato');
  const A2 = C.buildArchive(decks);
  ok(A2.map['akroma, angel of fury'].status === 'free' && A2.map['baneslayer angel'].status === 'busy', 'archivio coerente dopo upgrade');
  ok(A2.map["serra's emissary"].owned === 1, 'nessun doppione: Serra\'s Emissary resta 1 copia');
  // nessuna lista sciolte: viene creata
  const k3 = mk('k3', 'K', 'deck', true, o2.cards); k3.upgrades = [{ id: 'u3', name: 'N', cards: n2.cards, commander: null, createdAt: 0 }];
  const d3 = [k3]; const r3 = C.applyUpgradeMoves(d3, 'k3', 'u3', {});
  ok(r3.createdBinder && d3.length === 2 && d3[1].kind === 'binder' && d3[1].name === 'Carte sciolte' && sum(d3[1].cards) === 73, 'lista Carte sciolte creata');
}
function sum(cards) { return cards.reduce((t, c) => t + c.qty, 0); }

// 8. carte già stampate quando importi un nuovo mazzo
{
  const p = C.parseList('1 Akroma, Angel of Fury\n2 Swamp\n1 Brand New Card\n1 Altra Carta');
  const sc = mk('b', 'Sciolte', 'binder', false, [{ name: 'Akroma, Angel of Fury', qty: 1, set: '', cn: '' }, { name: 'Swamp', qty: 2, set: '', cn: '' }]);
  const off = mk('i', 'Smontato', 'deck', false, [{ name: 'Brand New Card', qty: 1, set: '', cn: '' }]);
  const at = mk('a', 'Montato', 'deck', true, [{ name: 'Altra Carta', qty: 1, set: '', cn: '' }]);
  const r = C.findReusable(p.cards, [sc, off, at], { basicsUnlimited: true });
  ok(r.length === 2 && r[0].name === 'Akroma, Angel of Fury' && r[0].looseCovered === 1, 'sciolte riconosciute');
  ok(r[1].name === 'Brand New Card' && r[1].loose === 0 && r[1].inactive[0].deckName === 'Smontato', 'libera in mazzo non attivo; carta in mazzo attivo ignorata');
  const r2 = C.findReusable(p.cards, [sc, off, at], { basicsUnlimited: false });
  ok(r2.some(x => x.name === 'Swamp' && x.looseCovered === 2), 'terre base contate se non illimitate');
}

// 9. dati per le anteprime: stampa di riferimento, set nel diff, impostazione
{
  const d1 = mk('d1', 'Uno', 'deck', true, [{ name: 'Sol Ring', qty: 1, set: 'C21', cn: '263' }, { name: 'Mountain', qty: 1, set: '', cn: '' }]);
  const d2 = mk('d2', 'Due', 'deck', false, [{ name: 'Mountain', qty: 1, set: 'M21', cn: '270' }]);
  const A = C.buildArchive([d1, d2]);
  ok(A.map['sol ring'].pset === 'C21' && A.map['sol ring'].pcn === '263', 'archivio: stampa di riferimento');
  ok(A.map['mountain'].pset === 'M21' && A.map['mountain'].pcn === '270', 'archivio: prima stampa con collezione');
  const up = { id: 'u', name: 'U', cards: [{ name: 'Sol Ring', qty: 1, set: 'C21', cn: '263' }, { name: 'Arcane Signet', qty: 1, set: 'ELD', cn: '331' }], commander: null, createdAt: 0 };
  d1.upgrades = [up];
  const df = C.diffUpgrade(d1, up, [d1, d2], {});
  ok(df.inn[0].name === 'Arcane Signet' && df.inn[0].set === 'ELD' && df.inn[0].cn === '331', 'diff: set e numero delle carte che entrano');
  ok(df.out[0].name === 'Mountain', 'diff: carta che esce');
  const off1 = mk('o1', 'Vecchio', 'deck', false, [{ name: 'Sol Ring', qty: 1, set: 'LEA', cn: '1' }]);
  const on1 = mk('o2', 'Attuale', 'deck', true, [{ name: 'Sol Ring', qty: 1, set: 'MIC', cn: '162' }]);
  const A3 = C.buildArchive([off1, on1]);
  ok(A3.map['sol ring'].pset === 'MIC' && A3.map['sol ring'].pcn === '162', 'archivio: preferisce la stampa del mazzo attivo');
  ok(C.sanitizeSettings({}).images === true && C.sanitizeSettings({ images: false }).images === false, 'impostazione immagini');
}

// 10. lista per il checker del bracket
{
  const d = mk('b1', 'Prova', 'deck', true, [{ name: 'Sol Ring', qty: 1, set: 'C21', cn: '263' }, { name: 'Kaalia of the Vast', qty: 1, set: 'SLD', cn: '1563' }, { name: 'Mountain', qty: 3, set: '', cn: '' }]);
  d.commander = 'Kaalia of the Vast';
  ok(C.bracketText(d) === 'Commander\n1 Kaalia of the Vast\n\nDeck\n3 Mountain\n1 Sol Ring', 'bracketText: commander a parte, solo quantità e nome');
  d.commander = null;
  ok(C.bracketText(d) === '1 Kaalia of the Vast\n3 Mountain\n1 Sol Ring', 'bracketText senza commander: lista semplice');
  d.commander = 'Mountain';
  ok(C.bracketText(d).startsWith('Commander\n1 Mountain\n\nDeck\n1 Kaalia') && C.bracketText(d).includes('2 Mountain'), 'bracketText: una sola copia va a commander');
}

// 11. richiesta e riepilogo del bracket (forma reale della risposta di Commander Spellbook)
{
  const d = mk('b2', 'Prova', 'deck', true, [{ name: 'Sol Ring', qty: 1, set: '', cn: '' }, { name: 'Kaalia of the Vast', qty: 1, set: '', cn: '' }, { name: 'Island', qty: 3, set: '', cn: '' }]);
  d.commander = 'Kaalia of the Vast';
  const pl = C.bracketPayload(d);
  ok(JSON.stringify(pl) === JSON.stringify({ commanders: [{ card: 'Kaalia of the Vast', quantity: 1 }], main: [{ card: 'Island', quantity: 3 }, { card: 'Sol Ring', quantity: 1 }] }), 'bracketPayload: commander a parte, resto con quantità');
  d.commander = null;
  ok(C.bracketPayload(d).commanders.length === 0 && C.bracketPayload(d).main.length === 3, 'bracketPayload senza commander');
  const card = (name, o) => Object.assign({ card: { id: 1, name }, quantity: 1, banned: false, gameChanger: false, massLandDenial: false, extraTurn: false }, o || {});
  const resp = {
    bracketTag: 'R',
    cards: [card('Sol Ring'), card('Demonic Tutor', { gameChanger: true }), card('Rhystic Study', { gameChanger: true }), card('Time Warp', { extraTurn: true }),
      card('Armageddon', { massLandDenial: true }), card('Island', { quantity: 3 }), card('Kaalia of the Vast')],
    combos: [{ combo: { uses: [{ card: { name: 'Kaalia of the Vast' } }, { card: { name: 'Master of Cruelties' } }], produces: [{ feature: { name: 'Target opponent loses the game' } }], bracketTag: 'S' }, definitelyTwoCard: true, speed: 5 },
      { combo: { uses: [{ card: { name: 'Master of Cruelties' } }, { card: { name: 'Kaalia of the Vast' } }], produces: [{ feature: { name: 'Target opponent loses the game' } }], bracketTag: 'S' }, definitelyTwoCard: true }]
  };
  const pl2 = { commanders: [{ card: 'Kaalia of the Vast', quantity: 1 }], main: [{ card: 'Sol Ring', quantity: 1 }, { card: 'Island', quantity: 3 }, { card: 'Nonexistent Cardzz', quantity: 1 }, { card: 'Fire // Ice', quantity: 1 }] };
  resp.cards.push(card('Fire // Ice'));
  const sm = C.bracketSummary(resp, pl2);
  ok(sm.tag === 'R' && sm.n === 4 && sm.name === 'Ruthless', 'bracketSummary: tag R → bracket 4');
  ok(sm.gameChangers.join() === 'Demonic Tutor,Rhystic Study' && sm.massLandDenial.join() === 'Armageddon' && sm.extraTurns.join() === 'Time Warp' && sm.banned.length === 0, 'bracketSummary: elenchi per categoria');
  ok(sm.combos.length === 1 && sm.combos[0].twoCard && sm.combos[0].result[0] === 'Target opponent loses the game', 'bracketSummary: combo deduplicate');
  ok(sm.unknown.join() === 'Nonexistent Cardzz', 'bracketSummary: carte non riconosciute (le doppie facce no)');
  ok(C.bracketSummary({ bracketTag: 'B', cards: [card('Mana Crypt', { banned: true })], combos: [] }).banned[0] === 'Mana Crypt', 'bracketSummary: bandite');
  ok(C.bracketSummary({}).range === '?' && C.bracketSummary(null).combos.length === 0, 'bracketSummary: risposta vuota senza errori');
}

// 12. numero del bracket dalle regole
{
  const base = { tag: 'E', gameChangers: [], massLandDenial: [], extraTurns: [], banned: [], combos: [] };
  const N = o => C.bracketNumber(Object.assign({}, base, o)).n;
  const cb = (tag, cards) => ({ cards: cards || ['A', 'B'], result: [], tag, twoCard: true });
  ok(N({}) === 2, 'bracket: nessun elemento → 2');
  ok(N({ gameChangers: ['x'] }) === 3 && N({ gameChangers: ['x', 'y', 'z'] }) === 3, 'bracket: 1–3 Game Changer → 3');
  ok(N({ gameChangers: ['a', 'b', 'c', 'd'] }) === 4, 'bracket: 4+ Game Changer → 4');
  ok(N({ massLandDenial: ['Armageddon'] }) === 4, 'bracket: distruzione di terre → 4');
  ok(N({ extraTurns: ['a', 'b'] }) === 2 && N({ extraTurns: ['a', 'b', 'c'] }) === 4, 'bracket: 3+ turni extra → 4');
  ok(N({ combos: [cb('S')] }) === 3 && N({ combos: [cb('R')] }) === 4 && N({ combos: [cb('C')] }) === 2, 'bracket: combo tardiva 3, rapida 4');
  ok(N({ tag: 'R' }) === 4 && N({ tag: 'P' }) === 3 && N({ tag: 'C' }) === 2, 'bracket: non scende sotto la stima di Spellbook');
  ok(N({ banned: ['Mana Crypt'], gameChangers: ['x'] }) === 0, 'bracket: carta bandita → 0');
  ok(C.bracketNumber(Object.assign({}, base, { massLandDenial: ['Armageddon'], gameChangers: ['x'] })).reasons[0].includes('Armageddon'), 'bracket: il motivo principale è il minimo più alto');
  const d = mk('b3', 'P', 'deck', true, [{ name: 'Sol Ring', qty: 1, set: '', cn: '' }, { name: 'Island', qty: 2, set: '', cn: '' }]);
  const s1 = C.deckSig(d); d.cards[0].qty = 2;
  ok(s1 !== C.deckSig(d) && C.deckSig(d) === C.deckSig(JSON.parse(JSON.stringify(d))), 'deckSig: cambia con le carte, stabile altrimenti');
  const sd = C.sanitizeDeck(Object.assign(JSON.parse(JSON.stringify(d)), { bracket: { n: 3, sig: 'abc', at: 5, manual: true } }));
  ok(sd.bracket.n === 3 && sd.bracket.manual === true && C.sanitizeDeck(Object.assign({}, d, { bracket: { n: 9 } })).bracket === null && C.sanitizeDeck(d).bracket === null, 'sanitizeDeck: bracket valido tenuto, non valido scartato');
}

// 13. stampe: cambia solo il printing / stessa stampa / stampa diversa
{
  const c = (name, qty, set, cn) => ({ name, qty, set: set || '', cn: cn || '' });
  const base = mk('pk', 'Mazzo', 'deck', true, [c('Sol Ring', 1, 'C21', '263'), c('Arcane Signet', 1, 'ELD', '331'), c('Lightning Greaves', 1), c('Terminate', 1, 'RTR', '1')]);
  const upg = { id: 'pu', name: 'U', cards: [c('Sol Ring', 1, 'CMM', '400'), c('Arcane Signet', 1, 'ELD', '331'), c('Lightning Greaves', 1, 'CMM', '400'), c('Swords to Plowshares', 1, 'STA', '1')], commander: null, createdAt: 0 };
  base.upgrades = [upg];
  const bind = mk('pb', 'Sciolte', 'binder', false, [c('Sol Ring', 1, 'CMM', '400')]);
  const alt = mk('pa', 'Altro', 'deck', false, [c('Swords to Plowshares', 1, 'STA', '2')]);
  const df = C.diffUpgrade(base, upg, [base, bind, alt], {});
  ok(df.reprints.length === 1 && df.reprints[0].name === 'Sol Ring' && df.reprints[0].from.set === 'C21' && df.reprints[0].to.set === 'CMM', 'stampa: Sol Ring cambia solo stampa');
  ok(df.out.length === 1 && df.out[0].name === 'Terminate' && df.inn.length === 1 && df.inn[0].name === 'Swords to Plowshares', 'stampa: carte cambiate del tutto restano out/in');
  ok(!df.out.concat(df.inn, df.reprints).some(x => x.name === 'Arcane Signet' || x.name === 'Lightning Greaves'), 'stampa: uguale o senza collezione = nessun cambio');
  ok(df.dropQty === 1 && df.newQty === 1 && df.reprintQty === 1 && df.outQty === 2 && df.inQty === 2, 'stampa: totali separati');
  ok(df.reprints[0].covered === 1 && df.reprints[0].sources[0].set === 'CMM' && df.reprints[0].missing === 0, 'stampa: la nuova stampa è già libera nelle sciolte');
  ok(df.inn[0].covered === 0 && df.inn[0].missing === 1 && df.inn[0].altCover === 1 && df.inn[0].altSources[0].cn === '2', 'stampa: stessa carta ma altra stampa non conta come coperta');
  ok(df.covered === 1 && df.missing === 1 && df.altCover === 1, 'stampa: riepilogo coperte/mancanti/altra stampa');
  ok(C.diffText(base, upg, df).includes('CAMBIA SOLO LA STAMPA (1):') && C.diffText(base, upg, df).includes('1 Sol Ring: (C21) 263 → (CMM) 400'), 'stampa: lista dei cambi');
  // stesse collezione, numero diverso = stampa diversa; due copie → una cambia e una esce
  const b2 = mk('p2', 'M', 'deck', true, [c('Sol Ring', 2, 'SLD', '1563')]);
  const u2 = { id: 'p2u', name: 'U', cards: [c('Sol Ring', 1, 'SLD', '1564')], commander: null, createdAt: 0 };
  const d2 = C.diffUpgrade(b2, u2, [b2], {});
  ok(d2.reprints.length === 1 && d2.reprints[0].qty === 1 && d2.out.length === 1 && d2.out[0].qty === 1 && d2.out[0].set === 'SLD' && d2.inn.length === 0, 'stampa: stesso set numero diverso, e copia in meno');
  // terre base: la stampa non conta se illimitate
  const b3 = mk('p3', 'T', 'deck', true, [c('Mountain', 1, 'M21', '270')]);
  const u3 = { id: 'p3u', name: 'U', cards: [c('Mountain', 1, 'ZNR', '380')], commander: null, createdAt: 0 };
  ok(C.diffUpgrade(b3, u3, [b3], { basicsUnlimited: true }).reprints.length === 0 && C.diffUpgrade(b3, u3, [b3], { basicsUnlimited: false }).reprints.length === 1, 'stampa: terre base illimitate ignorano la stampa');
  // applicazione: prende solo la stampa esatta e rimette nelle sciolte la vecchia
  const decks = [base, bind, alt];
  const rep = C.applyUpgradeMoves(decks, 'pk', 'pu', {});
  const has = (d, name, set, cn) => d.cards.some(x => x.name === name && x.set === set && x.cn === cn && x.qty > 0);
  ok(!has(bind, 'Sol Ring', 'CMM', '400') && has(bind, 'Sol Ring', 'C21', '263') && has(bind, 'Terminate', 'RTR', '1'), 'applica: la stampa esatta esce dalle sciolte, la vecchia ci entra');
  ok(has(alt, 'Swords to Plowshares', 'STA', '2') && rep.fromDecks.length === 0, 'applica: un\'altra stampa non viene presa da sola');
  ok(rep.reprints.length === 1 && rep.fromLoose.some(x => x.name === 'Sol Ring'), 'applica: resoconto con le stampe cambiate');
}

// 14. avviso «già stampata»: stessa stampa / altra stampa
{
  const c = (name, qty, set, cn) => ({ name, qty, set: set || '', cn: cn || '' });
  const bind = mk('rb', 'Sciolte', 'binder', false, [c('Sol Ring', 1, 'CMM', '400'), c('Arcane Signet', 2, 'ELD', '331')]);
  const alt = mk('ra', 'Smontato', 'deck', false, [c('Swords to Plowshares', 1, 'STA', '2')]);
  const act = mk('rc', 'Montato', 'deck', true, [c('Terminate', 1, 'RTR', '1')]);
  const p = C.parseList('1 Sol Ring (CMM) 400\n1 Swords to Plowshares (STA) 1\n1 Arcane Signet (ELD) 331\n1 Terminate (RTR) 1');
  const r = C.findReusable(p.cards, [bind, alt, act], {});
  const g = n => r.find(x => x.name === n);
  ok(r.length === 3 && !g('Terminate'), 'riuso: carta in mazzo attivo ignorata');
  ok(g('Sol Ring').exact === 1 && g('Sol Ring').other === 0 && g('Sol Ring').exactRows[0].deckName === 'Sciolte', 'riuso: stessa identica stampa');
  ok(g('Swords to Plowshares').exact === 0 && g('Swords to Plowshares').other === 1 && g('Swords to Plowshares').otherRows[0].cn === '2' && g('Swords to Plowshares').otherRows[0].deckName === 'Smontato', 'riuso: stessa carta, altro numero = stampa diversa');
  ok(g('Arcane Signet').exact === 1 && g('Arcane Signet').other === 0 && g('Arcane Signet').loose === 2, 'riuso: ne servono 1, ne hai 2 identiche');
  const r2 = C.findReusable(C.parseList('1 Swords to Plowshares').cards, [bind, alt], {});
  ok(r2[0].exact === 1 && r2[0].other === 0, 'riuso: lista senza collezione = qualsiasi stampa va bene');
  const r3 = C.findReusable(C.parseList('2 Sol Ring (CMM) 400\n1 Sol Ring (C21) 263').cards, [bind], {});
  ok(r3[0].need === 3 && r3[0].exact === 1 && r3[0].other === 0, 'riuso: righe con stampe diverse della stessa carta');
  const bind2 = mk('rb2', 'S2', 'binder', false, [c('Sol Ring', 1, 'C21', '263')]);
  const r4 = C.findReusable(C.parseList('1 Sol Ring (CMM) 400').cards, [bind2], {});
  ok(r4[0].exact === 0 && r4[0].other === 1, 'riuso: solo altra stampa');
}

console.log('OK, ' + n + ' controlli passati');
