/* Test dei dati delle carte e dei prezzi (cards.js) con un Scryfall simulato. */
const K = require('../web/cards.js'), X = require('../web/proxy.js'), C = require('../web/core.js');
const assert = require('assert');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };

const P = (name, set, cn, eur, extra) => Object.assign({ id: set + cn, name, set, collector_number: cn, cmc: 1, type_line: 'Artifact', mana_cost: '{1}', colors: [], color_identity: [], rarity: 'uncommon', oracle_text: 'T: Add {C}{C}.', prices: { eur: eur == null ? null : String(eur), eur_foil: null }, image_uris: { small: 'x', large: 'y' } }, extra || {});
const DB = [
  P('Sol Ring', 'c21', '263', '1.50'), P('Sol Ring', 'cmm', '400', '1.20'), P('Sol Ring', 'lea', '270', '900.00', { rarity: 'rare' }), P('Sol Ring', 'vma', '1', '0.80', { digital: false }),
  P('Llanowar Elves', 'm19', '314', '0.20', { type_line: 'Creature — Elf Druid', mana_cost: '{G}', colors: ['G'], color_identity: ['G'], rarity: 'common', power: '1', toughness: '1', keywords: [], produced_mana: ['G'], oracle_text: '{T}: Add {G}.' }),
  P('Llanowar Elves', 'dom', '168', '0.35', { type_line: 'Creature — Elf Druid', mana_cost: '{G}', colors: ['G'], color_identity: ['G'], rarity: 'common', power: '1', toughness: '1' }),
  P('Atraxa, Praetors\' Voice', 'c16', '28', '25.00', { cmc: 4, type_line: 'Legendary Creature — Phyrexian Angel Horror', mana_cost: '{G}{W}{U}{B}', colors: ['G', 'W', 'U', 'B'], color_identity: ['G', 'W', 'U', 'B'], rarity: 'mythic', keywords: ['Flying'], power: '4', toughness: '4' }),
  P('Foil Only', 'abc', '1', null, { prices: { eur: null, eur_foil: '3.00' } }),
  P('Senza Prezzo', 'abc', '2', null),
  P('Delver of Secrets // Insectile Aberration', 'isd', '51', '0.10', { image_uris: undefined, colors: undefined, color_identity: ['U'], oracle_text: undefined, mana_cost: undefined, type_line: 'Creature — Human Wizard // Creature — Human Insect', card_faces: [
    { name: 'Delver of Secrets', mana_cost: '{U}', colors: ['U'], type_line: 'Creature — Human Wizard', oracle_text: 'At the beginning of your upkeep...', power: '1', toughness: '1', image_uris: { small: 'a', large: 'b' } },
    { name: 'Insectile Aberration', colors: ['U'], type_line: 'Creature — Human Insect', oracle_text: 'Flying', power: '3', toughness: '2', image_uris: { small: 'c', large: 'd' } }] })
];
const log = [];
const res = (j, status) => ({ ok: !status || status < 300, status: status || 200, json: async () => j });
const nk = s => C.keyOf(s);
const hasName = (c, nm) => nk(c.name) === nk(nm) || (c.card_faces || []).some(f => nk(f.name) === nk(nm));
let calls = 0;
const fetchMock = async (u, init) => {
  calls++;
  const url = new URL(u), body = init && init.body ? JSON.parse(init.body) : null;
  log.push((init && init.method || 'GET') + ' ' + url.pathname + url.search);
  if (url.pathname === '/cards/collection') {
    const data = [], nf = [];
    body.identifiers.forEach(i => {
      let c;
      if (i.set && i.collector_number) c = DB.find(x => x.set === i.set && x.collector_number === i.collector_number);
      else if (i.set) c = DB.find(x => x.set === i.set && hasName(x, i.name));
      else c = DB.find(x => hasName(x, i.name));
      if (c) data.push(c); else nf.push(i);
    });
    return res({ data, not_found: nf });
  }
  if (url.pathname === '/cards/search') {
    const q = url.searchParams.get('q'), m = /^!"(.+)" game:paper eur>0$/.exec(q);
    assert(m, 'query dei prezzi bassi: ' + q);
    assert(url.searchParams.get('unique') === 'prints' && url.searchParams.get('order') === 'eur' && url.searchParams.get('dir') === 'asc', 'ordinata per prezzo crescente');
    const list = DB.filter(x => hasName(x, m[1]) && x.prices.eur != null).sort((a, b) => parseFloat(a.prices.eur) - parseFloat(b.prices.eur));
    return list.length ? res({ data: list }) : res({ object: 'error' }, 404);
  }
  return res({}, 404);
};

(async () => {
  /* riassunto */
  const r1 = K.compact(DB[4]);
  ok(r1.n === 'Llanowar Elves' && r1.c === 'G' && r1.ci === 'G' && r1.r === 'common' && r1.p === 0.2 && r1.pw === '1' && r1.pm === 'G' && r1.v === 1, 'compact: campi base');
  const rA = K.compact(DB[6]);
  ok(rA.c === 'WUBG' && rA.ci === 'WUBG', 'colori nell\'ordine WUBRG, non in quello di Scryfall');
  const rD = K.compact(DB[9]);
  ok(rD.dfc === 1 && rD.mc === '{U}' && rD.c === 'U' && rD.pw === '1' && /\/\/\s*Creature/.test(rD.t) && /Flying/.test(rD.o), 'compact: carta a due facce');
  ok(r1.gc === 0 && r1.bn === 0 && K.compact(Object.assign({}, DB[4], { game_changer: true })).gc === 1, 'compact: Game Changer da Scryfall');
  ok(K.compact(Object.assign({}, DB[4], { legalities: { commander: 'banned' } })).bn === 1 && K.compact(Object.assign({}, DB[4], { legalities: { commander: 'legal' } })).bn === 0, 'compact: carta bandita in Commander');
  ok(K.compact(DB[7]).p === null && K.compact(DB[7]).pf === 3 && K.unitPrice(K.compact(DB[7])) === 3, 'solo foil: vale il prezzo foil');
  ok(K.unitPrice(K.compact(DB[8])) === null, 'senza prezzo');
  ok(JSON.stringify(K.compact(DB[4])).length < 400, 'il riassunto è piccolo');
  ok(/^1\.?234,50\s€$/.test(K.eur(1234.5)) && /^0,80\s€$/.test(K.eur(0.8)) && K.eur(null) === '—', 'formato euro');

  /* scarico a lotti e memoria */
  const proxy = X.create({ fetch: fetchMock, keyOf: C.keyOf, wait: async () => {}, gap: 0 });
  const store = K.memoryStorage();
  let t = 1000;
  const cards = K.create({ proxy, keyOf: C.keyOf, storage: store, now: () => t });
  let changed = 0; cards.onChange(() => changed++);
  const prog = [];
  const total = await cards.ensure([{ name: 'Sol Ring', set: 'cmm', cn: '400' }, { name: 'Llanowar Elves' }, { name: 'Atraxa, Praetors\' Voice', set: 'c16', cn: '28' }, { name: 'Mai Vista' }], {}, p => prog.push(p));
  ok(total === 4, 'quattro carte da chiedere');
  ok(prog[0].done === 0 && prog[prog.length - 1].done === 4, 'avanzamento');
  ok(cards.rec('Sol Ring', 'cmm', '400').p === 1.2, 'prezzo della stampa giusta');
  ok(cards.rec('Sol Ring', 'c21', '263') === null, 'le altre stampe non sono state chieste');
  ok(cards.any('Llanowar Elves').n === 'Llanowar Elves', 'riassunto per nome');
  ok(cards.any('Sol Ring').s === 'cmm', 'anche una stampa precisa serve per cercare per nome');
  ok(cards.rec('Mai Vista') === null && cards.any('Mai Vista') === null, 'carta sconosciuta: nessun riassunto');
  ok(changed >= 1, 'avvisa quando arrivano dati');
  const before = calls;
  ok(await cards.ensure([{ name: 'Sol Ring', set: 'cmm', cn: '400' }, { name: 'Mai Vista' }], {}) === 0, 'già note: niente richieste');
  ok(calls === before, 'nessuna chiamata a Scryfall per ciò che si sa già (nemmeno per la carta inesistente)');

  /* prezzi vecchi: si rinnovano solo con fresh */
  t += K.PRICE_TTL + 5000;
  ok(await cards.ensure([{ name: 'Sol Ring', set: 'cmm', cn: '400' }], {}) === 0, 'senza fresh restano quelli che ho');
  ok(await cards.ensure([{ name: 'Sol Ring', set: 'cmm', cn: '400' }], { fresh: true }) === 1, 'con fresh si rinnovano');
  ok(await cards.ensure([{ name: 'Sol Ring', set: 'cmm', cn: '400' }], { fresh: true }) === 0, 'appena rinnovato: con fresh non si ripete');
  ok(await cards.ensure([{ name: 'Sol Ring', set: 'cmm', cn: '400' }], { force: true }) === 1, 'con force si rinnova comunque');
  ok(await cards.ensure([{ name: 'Mai Vista' }], {}) === 0, 'la carta sconosciuta si riprova solo dopo una settimana');
  t += 7 * 864e5;
  ok(await cards.ensure([{ name: 'Mai Vista' }], {}) === 1, 'dopo una settimana si riprova');

  /* ricordo su disco */
  const again = K.create({ proxy, keyOf: C.keyOf, storage: store, now: () => t });
  await again.load();
  ok(again.rec('Atraxa, Praetors\' Voice', 'c16', '28').c === 'WUBG', 'i dati tornano dal magazzino');

  /* più di 75 carte: lotti */
  const many = []; for (let i = 0; i < 160; i++) many.push({ name: 'Carta Finta ' + i });
  const lc = log.filter(l => /collection/.test(l)).length;
  await cards.ensure(many, {});
  ok(log.filter(l => /collection/.test(l)).length - lc >= 3, 'a gruppi di 75');

  /* la più economica */
  const prog2 = [];
  await cards.ensureCheapest(['Sol Ring', 'Llanowar Elves', 'Senza Prezzo'], {}, p => prog2.push(p));
  const ch = cards.cheapest('Sol Ring');
  ok(ch && ch.s === 'vma' && ch.p === 0.8, 'Sol Ring: la più economica è la vma a 0,80');
  ok(cards.cheapest('Llanowar Elves').s === 'm19' && cards.cheapest('Llanowar Elves').p === 0.2, 'Llanowar: m19');
  ok(cards.cheapest('Senza Prezzo') === null && cards.hasCheapest('Senza Prezzo'), 'nessuna stampa con prezzo: ricordato');
  ok(prog2[prog2.length - 1].done === 3, 'avanzamento delle economiche');
  const c2 = calls;
  await cards.ensureCheapest(['Sol Ring'], {});
  ok(calls === c2, 'economica già nota: niente richieste');

  /* valore di un mazzo */
  const deck = { cards: [
    { name: 'Sol Ring', qty: 1, set: 'lea', cn: '270' },
    { name: 'Llanowar Elves', qty: 2, set: 'dom', cn: '168' },
    { name: 'Forest', qty: 30, set: '', cn: '' },
    { name: 'Atraxa, Praetors\' Voice', qty: 1, set: 'c16', cn: '28' },
    { name: 'Carta Mia', qty: 1, set: '', cn: '', design: 'dz1' },
    { name: 'Foil Only', qty: 1, set: 'abc', cn: '1' },
    { name: 'Senza Prezzo', qty: 1, set: 'abc', cn: '2' }
  ] };
  let v = cards.valueDeck(deck, C.isBasic);
  ok(v.pending > 0 && !v.ready, 'prima di scaricare le stampe del mazzo: in attesa');
  await cards.ensure(cards.pricedCards(deck, C.isBasic), {});
  v = cards.valueDeck(deck, C.isBasic);
  ok(v.ready && v.pending === 0, 'dopo lo scarico è pronto');
  ok(Math.abs(v.total - (900 + 0.35 * 2 + 25 + 3)) < 1e-9, 'totale con le stampe scelte: ' + v.total);
  ok(v.skipped.basic === 30 && v.skipped.design === 1, 'terre base e carte del Designer escluse');
  ok(v.qty === 6 && v.priced === 5, 'conta le carte');
  ok(v.missing.join() === 'Senza Prezzo', 'quelle senza prezzo sono segnalate: ' + v.missing);
  ok(!v.cheapComplete, 'senza le stampe economiche di tutte non si può dire');
  await cards.ensureCheapest(cards.pricedCards(deck, C.isBasic).map(c => c.name), {});
  v = cards.valueDeck(deck, C.isBasic);
  ok(v.cheapComplete, 'ora si può');
  ok(Math.abs(v.cheapTotal - (0.8 + 0.2 * 2 + 25 + 3)) < 1e-9, 'totale con le stampe più economiche: ' + v.cheapTotal);
  const sol = v.cards.find(c => c.name === 'Sol Ring');
  ok(sol.unit === 900 && sol.cheapUnit === 0.8 && sol.cheapSet === 'vma' && Math.abs(sol.save - 899.2) < 1e-9, 'riga Sol Ring');
  const atx = v.cards.find(c => /Atraxa/.test(c.name));
  ok(atx.save === 0 && atx.cheapSet === '', 'se la stampa scelta è già la più economica non si cambia nulla');
  ok(v.total >= v.cheapTotal, 'la versione economica non costa mai di più');
  const ll = v.cards.find(c => c.name === 'Llanowar Elves');
  ok(Math.abs(ll.save - 0.3) < 1e-9, 'Llanowar: 2 × (0,35 − 0,20)');

  /* carte senza stampa: vale quella predefinita */
  const v2 = cards.valueDeck({ cards: [{ name: 'Llanowar Elves', qty: 3, set: '', cn: '' }] }, C.isBasic);
  ok(v2.ready && Math.abs(v2.total - 0.6) < 1e-9, 'senza collezione: prezzo della stampa predefinita');

  /* nome sbagliato non rompe nulla */
  const v3 = cards.valueDeck({ cards: [] }, C.isBasic);
  ok(v3.total === 0 && !v3.cheapComplete && v3.ready, 'mazzo vuoto');

  await cards.clear();
  ok(cards.count() === 0 && cards.any('Sol Ring') === null && !cards.hasCheapest('Sol Ring'), 'svuota tutto');

  console.log('cards-test: ' + n + ' controlli ok');
})().catch(e => { console.error(e); process.exit(1); });
