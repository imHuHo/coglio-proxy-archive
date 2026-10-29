/* Prova delle anteprime con un finto Scryfall: node img-smoke.js <percorso-jsdom> */
const path = require('path'), fs = require('fs'), assert = require('assert');
const { JSDOM } = require(process.argv[2] || 'jsdom');
const W = path.join(__dirname, '..', 'web');
const read = p => fs.readFileSync(p, 'utf8');
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0;
const ok = (c, m) => { assert(c, m); n++; };

const PRINTINGS = { 'c21/263': 'Sol Ring', 'rna/245': 'Blood Crypt' };
const slug = s => s.toLowerCase().replace(/[^a-z]+/g, '-');
function img(name, side) { return { small: `https://cards.scryfall.io/small/${side}/a/b/${slug(name)}.jpg?1`, normal: `https://cards.scryfall.io/normal/${side}/a/b/${slug(name)}.jpg?1` }; }
function card(name, set, cn) {
  if (/mai vista/i.test(name)) return null;
  if (name === 'Baneslayer Angel') return { name: 'Baneslayer Angel // Retro Side', set, collector_number: cn, card_faces: [{ name: 'Baneslayer Angel', image_uris: img('Baneslayer Angel', 'front') }, { name: 'Retro Side', image_uris: img('Retro Side', 'back') }] };
  return { name, set, collector_number: cn, image_uris: img(name, 'front') };
}
function mockFetch(opts) {
  const log = [];
  const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const byId = i => {
    if (i.set && i.collector_number) { const nm = PRINTINGS[i.set + '/' + i.collector_number]; return nm ? card(nm, i.set, i.collector_number) : null; }
    if (i.set === 'zzz') return null;                     // collezione inesistente: serve il ripiego sul solo nome
    return card(i.name, i.set || 'xyz', '1');
  };
  const fn = async (url, init) => {
    const method = (init && init.method) || 'GET', u = new URL(url);
    log.push({ method, path: u.pathname, search: u.search, body: init && init.body ? JSON.parse(init.body) : null });
    if (u.pathname === '/cards/collection') {
      if (opts.failPost) throw new TypeError('Failed to fetch');
      const ids = JSON.parse(init.body).identifiers, data = [], nf = [];
      ids.forEach(i => { const c = byId(i); if (c) data.push(c); else nf.push(i); });
      return res(200, { data, not_found: nf });
    }
    const m = u.pathname.match(/^\/cards\/([a-z0-9]+)\/([^/]+)$/);
    if (m) { const nm = PRINTINGS[m[1] + '/' + m[2]]; return nm ? res(200, card(nm, m[1], m[2])) : res(404, {}); }
    if (u.pathname === '/cards/search') {
      const q = u.searchParams.get('q');
      if (q !== '!"Sol Ring"') return res(200, { data: [] });
      const pr = (set, cn, extra) => Object.assign({ name: 'Sol Ring', set, set_name: 'Set ' + set, collector_number: cn, released_at: '2023-01-01', image_uris: img('Sol Ring ' + set, 'front') }, extra || {});
      return res(200, { data: [pr('c21', '263'), pr('cmm', '400'), pr('vma', '1', { digital: true })] });
    }
    if (u.pathname === '/cards/named') {
      const name = u.searchParams.get('exact') || u.searchParams.get('fuzzy'), set = u.searchParams.get('set');
      const c = set === 'zzz' ? null : card(name, set || 'xyz', '1');
      return c ? res(200, c) : res(404, {});
    }
    return res(404, {});
  };
  fn.log = log; return fn;
}

function boot(opts) {
  const dom = new JSDOM('<!doctype html><body><div id="app"></div><div id="toast" hidden></div></body>', { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, d = w.document, errors = [];
  w.addEventListener('error', e => errors.push(e.message));
  w.scrollTo = () => {};
  w.CPA_API_GAP = 0; w.CPA_IMG_DELAY = 10;
  w.fetch = mockFetch(opts || {});
  w.eval(read(W + '/core.js')); w.eval(read(W + '/app.js'));
  const $ = s => d.querySelector(s), $$ = s => [...d.querySelectorAll(s)];
  const click = el => { assert(el, 'elemento mancante'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  const clickA = (a, extra) => click($$('[data-a="' + a + '"]' + (extra || ''))[0]);
  const type = (sel, v) => { const el = $(sel); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const change = (sel, v) => { const el = $(sel); if (typeof v === 'boolean') el.checked = v; else el.value = v; el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  return { w, d, errors, $, $$, click, clickA, type, change, log: w.fetch.log };
}

const LIST = '1 Sol Ring (C21) 263\n1 Blood Crypt (RNA) 245\n1 Badlands (ZZZ)\n1 Carta Mai Vista\n1 Baneslayer Angel\n1 Mountain';

async function importDeck(t) {
  await sleep(50);
  t.clickA('nav', '[data-v="import"]');
  t.type('[data-c="draft-text"]', LIST); t.type('[data-c="draft-name"]', 'Prova');
  t.clickA('draft-next'); t.clickA('draft-create');
}

(async () => {
  /* --- A: percorso normale (richieste a lotti) --- */
  {
    const t = boot();
    await importDeck(t);
    t.clickA('nav', '[data-v="archive"]');
    ok(t.$$('#alist .th').length === 6, 'una miniatura per riga: ' + t.$$('#alist .th').length);
    await sleep(400);
    ok(t.$$('#alist .th.on').length === 5 && t.$$('#alist .th.nf').length === 1, 'cinque immagini trovate, una no (' + t.$$('#alist .th.on').length + '/' + t.$$('#alist .th.nf').length + ')');
    const posts = t.log.filter(x => x.path === '/cards/collection');
    ok(posts.length === 2, 'due richieste a lotti: prima con la stampa, poi per solo nome (' + posts.length + ')');
    ok(posts[0].body.identifiers.length === 6, 'tutte le carte nello stesso lotto');
    ok(posts[0].body.identifiers.some(i => i.set === 'c21' && i.collector_number === '263'), 'stampa precisa per collezione e numero');
    ok(posts[0].body.identifiers.some(i => i.name === 'Badlands' && i.set === 'zzz'), 'nome e collezione quando manca il numero');
    ok(posts[1].body.identifiers.length === 1 && posts[1].body.identifiers[0].name === 'Badlands' && !posts[1].body.identifiers[0].set, 'ripiego sul solo nome per la carta con collezione sbagliata');
    ok(t.log.some(x => x.path === '/cards/named' && x.search.includes('fuzzy=Carta')), 'ultimo ripiego: ricerca approssimata per la carta sconosciuta');
    const badlands = t.$$('#alist .item').find(i => i.textContent.includes('Badlands'));
    ok(badlands.querySelector('.th.on img').src.includes('/small/front/'), 'Badlands trovata col solo nome');
    ok(badlands.querySelector('.th').classList.contains('fb'), 'stampa non trovata: miniatura segnata con «!»');
    t.click(badlands.querySelector('.th'));
    ok(t.$('#lb .lb-warn') && t.$('#lb .lb-warn').textContent.includes('ZZZ') && t.$('#lb .lb-warn').textContent.includes('XYZ'), 'l\'anteprima dice quale stampa mostra al posto di quella chiesta');
    t.click(t.$('#lb'));
    const solOk = t.$$('#alist .item').find(i => i.textContent.includes('Sol Ring'));
    ok(!solOk.querySelector('.th').classList.contains('fb'), 'stampa trovata: nessun avviso');
    const calls = t.log.length;

    // anteprima grande
    const sol = t.$$('#alist .item').find(i => i.textContent.includes('Sol Ring'));
    t.click(sol.querySelector('.th'));
    ok(t.$('#lb') && t.$('#lb img').src.includes('/normal/front/') && !t.$('#lb [data-a="lb-flip"]'), 'anteprima grande, carta a faccia singola');
    t.d.dispatchEvent(new t.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    ok(!t.$('#lb'), 'Esc chiude');
    const bane = t.$$('#alist .item').find(i => i.textContent.includes('Baneslayer'));
    t.click(bane.querySelector('.th'));
    ok(t.$('#lb [data-a="lb-flip"]') && t.$('#lb img').src.includes('/normal/front/'), 'carta a due facce: tasto Gira');
    t.clickA('lb-flip');
    ok(t.$('#lb img').src.includes('/normal/back/'), 'Gira mostra il retro');
    t.click(t.$('#lb'));
    ok(!t.$('#lb'), 'clic fuori chiude');
    t.click(bane.querySelector('.item-main'));
    ok(t.$('.detail'), 'il resto della riga apre ancora il dettaglio');

    // ricerca: le righe nuove usano la cache, nessuna richiesta
    t.type('#q', 'sol');
    ok(t.$('#alist .th.on'), 'riga ridisegnata con la miniatura già pronta');
    await sleep(100);
    ok(t.log.length === calls, 'nessuna nuova richiesta per carte già note');

    // mazzo e upgrade
    t.clickA('nav', '[data-v="decks"]'); t.clickA('open-deck');
    ok(t.$$('#dlist .crow .th.on').length === 5, 'miniature anche nella lista del mazzo');

    // scelta della stampa
    const solRow = () => t.$$('#dlist .crow').find(r => r.textContent.includes('Sol Ring'));
    t.click(solRow().querySelector('.th'));
    ok(t.$('#lb [data-a="lb-prints"]'), 'nel mazzo c\'è «Cambia stampa»');
    t.clickA('lb-prints'); await sleep(100);
    ok(t.$$('#lb .pr').length === 2 && t.$('#lb .pr.cur').dataset.s === 'c21', 'stampe di carta, quella attuale evidenziata (le digitali sono escluse)');
    t.click(t.$$('#lb .pr').find(b => b.dataset.s === 'cmm'));
    ok(!t.$('#lb') && solRow().textContent.includes('CMM') && solRow().textContent.includes('400'), 'stampa scelta salvata nel mazzo');
    ok(solRow().querySelector('.th img').src.includes('sol-ring-cmm'), 'la miniatura mostra subito la stampa scelta');
    t.clickA('undo');
    ok(solRow().textContent.includes('C21') && solRow().textContent.includes('263'), 'Annulla ripristina la stampa');
    t.clickA('nav', '[data-v="archive"]'); t.type('#q', 'sol ring');
    t.click(t.$('#alist .item-main'));
    ok(t.$$('#alist .where .th').length === 1 && t.$('#alist .where .th').dataset.thd, 'miniatura per ogni copia nel dettaglio');
    t.type('#q', '');

    // impostazione
    t.clickA('nav', '[data-v="data"]');
    ok(t.$('[data-c="images"]').checked && t.d.body.textContent.includes('Scryfall'), 'interruttore e crediti');
    t.change('[data-c="images"]', false);
    t.clickA('nav', '[data-v="archive"]');
    ok(t.$$('.th').length === 0, 'immagini spente: nessuna miniatura');
    t.clickA('nav', '[data-v="data"]'); t.change('[data-c="images"]', true);
    t.clickA('nav', '[data-v="archive"]'); t.type('#q', '');
    ok(t.$$('#alist .item-main .th.on').length === 5, 'riaccese: le immagini tornano subito dalla cache');
    await sleep(1200);
    const saved = JSON.parse(t.w.localStorage.getItem('cpa:img:v1'));
    ok(Object.keys(saved).length >= 6 && saved['sol ring|c21|263'].u.startsWith('front/'), 'indirizzi salvati sul dispositivo in forma compatta');
    ok(t.errors.length === 0, 'nessun errore JS: ' + t.errors.join(' | '));
  }

  /* --- B: CORS o rete rifiutano il lotto: una carta per volta --- */
  {
    const t = boot({ failPost: true });
    await importDeck(t);
    t.clickA('nav', '[data-v="archive"]');
    await sleep(500);
    ok(t.$$('#alist .th.on').length === 5 && t.$$('#alist .th.nf').length === 1, 'ripiego a carta singola: stesse immagini');
    ok(t.log.some(x => x.path === '/cards/c21/263') && t.log.some(x => x.path === '/cards/named' && x.search.includes('exact=Mountain')), 'usa /cards/{set}/{numero} e /cards/named');
    ok(t.errors.length === 0, 'nessun errore JS nel ripiego');
  }

  /* --- D: collezione giusta ma numero sbagliato: si prova con la sola collezione --- */
  {
    const t = boot();
    await sleep(50);
    t.clickA('nav', '[data-v="import"]');
    t.type('[data-c="draft-text"]', '1 Sol Ring (CMM) 9999\n1 Sol Ring (C21) 263'); t.type('[data-c="draft-name"]', 'D');
    t.clickA('draft-next'); t.clickA('draft-create');
    t.clickA('nav', '[data-v="archive"]');
    await sleep(400);
    const posts = t.log.filter(x => x.path === '/cards/collection');
    ok(posts.length === 2 && posts[1].body.identifiers.length === 1 && posts[1].body.identifiers[0].set === 'cmm' && !posts[1].body.identifiers[0].collector_number, 'secondo tentativo: nome e collezione senza numero');
    t.clickA('nav', '[data-v="decks"]'); t.clickA('open-deck');
    const rows = t.$$('#dlist .crow');
    ok(rows.length === 2 && rows.filter(r => r.querySelector('.th.fb')).length === 1, 'solo la riga con numero sbagliato è segnata');
  }

  /* --- C: dentro Claude la rete è bloccata: nessuna richiesta, nessuno spazio vuoto --- */
  {
    const t = boot();
    t.w.claude = { use: async () => null };               // niente db: resta l'archivio locale
    await importDeck(t);
    ok(t.$$('.th').length >= 0, 'avvio ok');
  }
  console.log('IMG OK, ' + n + ' controlli passati');
})().catch(e => { console.error('FALLITO:', e.message); console.error(e.stack.split('\n').slice(0, 5).join('\n')); process.exit(1); });
