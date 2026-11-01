/* Test della ricerca avanzata (search.js): sintassi Scryfall valutata in locale. */
const S = require('../web/search.js');
const assert = require('assert');
let n = 0; const ok = (c, m) => { assert(c, m); n++; };

const R = {
  'Sol Ring': { t: 'Artifact', mc: '{1}', v: 1, c: '', ci: '', r: 'uncommon', o: 'T: Add {C}{C}.', pm: 'C', p: 1.5 },
  'Llanowar Elves': { t: 'Creature — Elf Druid', mc: '{G}', v: 1, c: 'G', ci: 'G', r: 'common', o: '{T}: Add {G}.', pw: '1', tg: '1', pm: 'G', p: 0.2 },
  'Counterspell': { t: 'Instant', mc: '{U}{U}', v: 2, c: 'U', ci: 'U', r: 'common', o: 'Counter target spell.', p: 1.1 },
  'Atraxa, Praetors\' Voice': { t: 'Legendary Creature — Phyrexian Angel Horror', mc: '{G}{W}{U}{B}', v: 4, c: 'WUBG', ci: 'WUBG', r: 'mythic', o: 'Flying, vigilance, deathtouch, lifelink\nAt the beginning of your end step, proliferate.', kw: ['Flying', 'Vigilance', 'Deathtouch', 'Lifelink'], pw: '4', tg: '4', p: 30 },
  'Sevinne\'s Reclamation': { t: 'Sorcery', mc: '{3}{W}', v: 4, c: 'W', ci: 'W', r: 'rare', o: 'Return target permanent card with mana value 3 or less from your graveyard to the battlefield. If ~ was cast from your graveyard...', p: 0.4 },
  'Divine Visitation': { t: 'Enchantment', mc: '{3}{W}{W}', v: 5, c: 'W', ci: 'W', r: 'mythic', o: 'If one or more creature tokens would be created...', p: 5 },
  'Kaalia of the Vast': { t: 'Legendary Creature — Human Cleric', mc: '{1}{R}{W}{B}', v: 4, c: 'WBR', ci: 'WBR', r: 'rare', o: 'Flying\nWhenever Kaalia of the Vast attacks...', kw: ['Flying'], pw: '2', tg: '2', p: 3 },
  'Forest': { t: 'Basic Land — Forest', mc: '', v: 0, c: '', ci: 'G', r: 'common', o: '({T}: Add {G}.)', pm: 'G', p: 0.05 },
  'Birds of Paradise': { t: 'Creature — Bird', mc: '{G}', v: 1, c: 'G', ci: 'G', r: 'rare', o: 'Flying\n{T}: Add one mana of any color.', kw: ['Flying'], pw: '0', tg: '1', pm: 'WUBRG', p: 6 },
  'Nessuna Info': null
};
const names = Object.keys(R);
function run(q) {
  const c = S.compile(q);
  assert(c.ok, 'query non valida: ' + q + ' ' + c.error);
  return names.filter(nm => c.test(nm, R[nm], null) === true);
}
const same = (q, want) => { const got = run(q).sort().join('|'), w = want.slice().sort().join('|'); ok(got === w, q + ' -> ' + got + ' (atteso ' + w + ')'); };

/* nome */
same('sol', ['Sol Ring']);
same('ring sol', ['Sol Ring']);                              // parole in qualsiasi ordine
same('"sol ring"', ['Sol Ring']);
same('atraxa praetors voice', ['Atraxa, Praetors\' Voice']);
same('!"forest"', ['Forest']);
same('name:elves', ['Llanowar Elves']);
same('/^bir/', ['Birds of Paradise']);
same('', names);

/* tipo */
same('t:creature', ['Llanowar Elves', 'Atraxa, Praetors\' Voice', 'Kaalia of the Vast', 'Birds of Paradise']);
same('t:legendary t:creature', ['Atraxa, Praetors\' Voice', 'Kaalia of the Vast']);
same('t:"basic land"', ['Forest']);
same('t:creatura', ['Llanowar Elves', 'Atraxa, Praetors\' Voice', 'Kaalia of the Vast', 'Birds of Paradise']);
same('t:elf', ['Llanowar Elves']);
same('-t:creature -t:land', ['Sol Ring', 'Counterspell', 'Sevinne\'s Reclamation', 'Divine Visitation']);

/* testo, parole chiave, tilde */
same('o:"counter target"', ['Counterspell']);
same('o:flying', ['Atraxa, Praetors\' Voice', 'Kaalia of the Vast', 'Birds of Paradise']);
same('kw:flying', ['Atraxa, Praetors\' Voice', 'Kaalia of the Vast', 'Birds of Paradise']);
same('kw:fly -t:legendary', ['Birds of Paradise']);
same('o:"whenever ~ attacks"', ['Kaalia of the Vast']);
same('o:/proliferat/', ['Atraxa, Praetors\' Voice']);
same('o:"mana value 3"', ['Sevinne\'s Reclamation']);

/* colori */
same('c:g', ['Llanowar Elves', 'Atraxa, Praetors\' Voice', 'Birds of Paradise']);        // contiene il verde
same('c=g', ['Llanowar Elves', 'Birds of Paradise']);
same('c>=wu', ['Atraxa, Praetors\' Voice']);
same('c<=wu', ['Sol Ring', 'Counterspell', 'Sevinne\'s Reclamation', 'Divine Visitation', 'Forest']);
same('c:c', ['Sol Ring', 'Forest']);
same('c:colorless', ['Sol Ring', 'Forest']);
same('c:m', ['Atraxa, Praetors\' Voice', 'Kaalia of the Vast']);
same('c:azorius', ['Atraxa, Praetors\' Voice']);
same('c:bianco', ['Atraxa, Praetors\' Voice', 'Sevinne\'s Reclamation', 'Divine Visitation', 'Kaalia of the Vast']);
same('c<wubg', ['Sol Ring', 'Counterspell', 'Sevinne\'s Reclamation', 'Divine Visitation', 'Forest', 'Llanowar Elves', 'Birds of Paradise']);
/* identita': «id:» entra nel mazzo di quel commander */
same('id:g', ['Sol Ring', 'Llanowar Elves', 'Forest', 'Birds of Paradise']);
same('id:wubg', ['Sol Ring', 'Llanowar Elves', 'Counterspell', 'Atraxa, Praetors\' Voice', 'Sevinne\'s Reclamation', 'Divine Visitation', 'Forest', 'Birds of Paradise']);
same('id>=r', ['Kaalia of the Vast']);
same('id=wbr', ['Kaalia of the Vast']);

/* costo, forza, rarita', prezzo */
same('mv=1', ['Sol Ring', 'Llanowar Elves', 'Birds of Paradise']);
same('mv>=4', ['Atraxa, Praetors\' Voice', 'Sevinne\'s Reclamation', 'Divine Visitation', 'Kaalia of the Vast']);
same('cmc<1', ['Forest']);
same('mv!=1 t:creature', ['Atraxa, Praetors\' Voice', 'Kaalia of the Vast']);
same('pow>=2', ['Atraxa, Praetors\' Voice', 'Kaalia of the Vast']);
same('tou=1', ['Llanowar Elves', 'Birds of Paradise']);
same('r:mythic', ['Atraxa, Praetors\' Voice', 'Divine Visitation']);
same('r>=rare', ['Atraxa, Praetors\' Voice', 'Sevinne\'s Reclamation', 'Divine Visitation', 'Kaalia of the Vast', 'Birds of Paradise']);
same('r<uncommon', ['Llanowar Elves', 'Counterspell', 'Forest']);
same('eur>=5', ['Atraxa, Praetors\' Voice', 'Divine Visitation', 'Birds of Paradise']);
same('eur>5', ['Atraxa, Praetors\' Voice', 'Birds of Paradise']);
same('eur<=0.2', ['Llanowar Elves', 'Forest']);
same('eur<0,5', ['Llanowar Elves', 'Sevinne\'s Reclamation', 'Forest']);   // la virgola va bene

/* mana, produce */
same('m:{G}', ['Llanowar Elves', 'Atraxa, Praetors\' Voice', 'Birds of Paradise']);
same('m:UU', ['Counterspell']);
same('m:{3}{W}', ['Sevinne\'s Reclamation', 'Divine Visitation']);
same('produces:g', ['Llanowar Elves', 'Forest', 'Birds of Paradise']);
same('produces:wubrg', ['Birds of Paradise']);
same('produces:c', ['Sol Ring']);
same('-t:land produces:g', ['Llanowar Elves', 'Birds of Paradise']);

/* insiemi */
same('set:c21', []);                                         // senza dati sulla stampa nessuna risposta certa
same('t:creature (c:g or c:w) mv<=1', ['Llanowar Elves', 'Birds of Paradise']);
same('r:common or r:mythic', ['Llanowar Elves', 'Counterspell', 'Atraxa, Praetors\' Voice', 'Divine Visitation', 'Forest']);
same('t:creature and c:g', ['Llanowar Elves', 'Atraxa, Praetors\' Voice', 'Birds of Paradise']);
same('-(c:g or c:w)', ['Sol Ring', 'Counterspell', 'Forest']);
same('is:commander', ['Atraxa, Praetors\' Voice', 'Kaalia of the Vast']);
same('is:multicolor', ['Atraxa, Praetors\' Voice', 'Kaalia of the Vast']);

/* dati mancanti: «non so» attraversa la logica a tre valori */
{
  const c = S.compile('-t:creature');
  ok(c.test('Nessuna Info', null, null) === null, 'senza dati: né sì né no');
  ok(c.needsData === true, 'le ricerche sul tipo hanno bisogno dei dati');
  ok(S.compile('sol').needsData === false, 'la ricerca per nome non ne ha bisogno');
  ok(S.compile('sol').test('Sol Ring', null, null) === true, 'per nome basta il nome');
  ok(S.compile('t:land or sol').test('Sol Ring', null, null) === true, 'OR: un vero basta');
  ok(S.compile('t:land sol').test('Counterspell', null, null) === false, 'AND: un falso basta');
  ok(S.compile('t:land sol').test('Sol Ring', null, null) === null, 'AND: vero + non so = non so');
}
/* prezzo e stampa della copia nel mazzo */
{
  const c = S.compile('eur>2 set:cmm');
  ok(c.test('Sol Ring', R['Sol Ring'], { set: 'cmm', cn: '400', p: 4 }) === true, 'prezzo e stampa della copia');
  ok(c.test('Sol Ring', R['Sol Ring'], { set: 'c21', cn: '263', p: 4 }) === false, 'stampa diversa');
}

/* errori */
['c:xyz', 'mv>>3', '(t:creature', 't:creature)', 'o:/(/', 'mv:tre', 'r:epica', 'eur>caro'].forEach(q => {
  const c = S.compile(q); ok(!c.ok && c.error, 'errore per «' + q + '»');
});
ok(S.compile('xyz:abc').ok, 'parola con due punti sconosciuta: è solo un nome');
ok(S.compile('-').ok, 'meno da solo non si rompe');
ok(S.compile('( )').ok === false || true, 'parentesi vuote non si rompono');

/* filtri a pulsanti -> testo */
const fq = S.filtersQuery;
ok(fq({}) === '', 'nessun filtro');
ok(fq({ colors: 'WU' }) === 'c>=wu', 'colori: includi');
ok(fq({ colors: 'WU', cmode: 'exact' }) === 'c=wu', 'colori: esattamente');
ok(fq({ colors: 'WU', cmode: 'max' }) === 'c<=wu', 'colori: al massimo');
ok(fq({ colors: 'C' }) === 'c:c', 'incolore');
ok(fq({ types: ['creature'] }) === 't:creature', 'un tipo');
ok(fq({ types: ['creature', 'instant'] }) === '(t:creature or t:instant)', 'più tipi sono alternativi');
ok(fq({ cost: ['2', '7+'] }) === '(mv=2 or mv>=7)', 'costo');
ok(fq({ rar: ['r', 'm'] }) === '(r:r or r:m)', 'rarità');
ok(fq({ text: 'draw a card' }) === 'o:"draw a card"', 'testo con spazi tra virgolette');
ok(fq({ text: 'draw' }) === 'o:draw', 'testo semplice');
ok(fq({ colors: 'G', types: ['creature'], cost: ['1'], rar: ['c'], text: 'mana' }) === 'c>=g t:creature mv=1 r:c o:mana', 'tutto insieme');
/* il testo dei filtri è davvero una ricerca valida e fa il suo dovere */
{
  const q = fq({ colors: 'G', types: ['creature'], cost: ['1'], text: 'add' });
  same(q, ['Llanowar Elves', 'Birds of Paradise']);
}
ok(S.EXAMPLES.every(e => S.compile(e[0]).ok), 'gli esempi dell\'aiuto sono tutti validi');

console.log('search-test: ' + n + ' controlli ok');
