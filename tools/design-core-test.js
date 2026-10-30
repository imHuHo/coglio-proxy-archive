/* Il campo `design` delle carte nei mazzi: si conserva, non si sposta tra mazzi. node tools/design-core-test.js */
const assert = require('assert'), C = require('../web/core.js');
let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); };
const deck = (id, kind, status, cards) => ({ id, name: id, kind, status, active: status === 'active', commander: null, cards, upgrades: [], createdAt: 1, updatedAt: 1 });

const s = C.sanitizeDeck({ cards: [{ name: 'A', qty: 1, design: 'z1' }, { name: 'B', qty: 2, design: 5 }, { name: 'C', qty: 1, design: '' }] }).cards;
ok(s[0].design === 'z1' && !('design' in s[1]) && !('design' in s[2]), 'sanitizeCards conserva solo design testuali non vuoti');
const sd = C.sanitizeDeck({ id: 'd', name: 'D', cards: [{ name: 'A', qty: 1, design: 'z1' }] });
ok(sd.cards[0].design === 'z1', 'sanitizeDeck conserva il design');

/* le carte con design non entrano nel pool delle carte riusabili */
const binder = deck('b', 'binder', 'inactive', [{ name: 'Sol Ring', qty: 1, set: '', cn: '', design: 'z1' }, { name: 'Counterspell', qty: 1, set: '', cn: '' }]);
const r = C.findReusable([{ name: 'Sol Ring', qty: 1, set: '', cn: '' }, { name: 'Counterspell', qty: 1, set: '', cn: '' }], [binder], {});
ok(r.length === 1 && r[0].name === 'Counterspell', 'CODIGHEL ignora le carte con design');

/* upgrade: il design resta sulla carta che resta */
const d = deck('d1', 'deck', 'active', [{ name: 'Sol Ring', qty: 1, set: '', cn: '', design: 'z9' }, { name: 'Island', qty: 1, set: '', cn: '' }]);
d.upgrades = [{ id: 'u1', name: 'Up', cards: [{ name: 'Sol Ring', qty: 1, set: '', cn: '' }, { name: 'Forest', qty: 1, set: '', cn: '' }], commander: null, createdAt: 1 }];
const decks = [d];
C.applyUpgradeMoves(decks, 'd1', 'u1', {});
const sr = decks.find(x => x.id === 'd1').cards.find(c => c.name === 'Sol Ring');
ok(sr && sr.design === 'z9', 'applicando un upgrade il design resta');
ok(decks.every(x => x.kind !== 'binder' || x.cards.every(c => !c.design)), 'nessun design finisce tra le sciolte');

/* applyReuse non sposta carte con design */
const nd = deck('n', 'deck', 'active', [{ name: 'Counterspell', qty: 1, set: '', cn: '' }]);
const bnd = deck('b2', 'binder', 'inactive', [{ name: 'Counterspell', qty: 1, set: '', cn: '', design: 'zz' }]);
ok(C.findReusable(nd.cards, [bnd], {}).length === 0, 'carta con design non proposta');
console.log('DESIGN-CORE OK, ' + n + ' controlli passati');
