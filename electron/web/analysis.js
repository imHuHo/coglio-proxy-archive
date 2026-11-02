/* Coglio Proxy Archive - analisi di un mazzo Commander (nessun accesso al DOM).
 * Parte dai dati delle carte già scaricati da Scryfall (cards.js): curva di mana, simboli di mana per colore, conteggio per tipo,
 * costo medio, fonti di mana, identità di colore del commander e legalità. Quello che non si può sapere senza dati
 * (carte non ancora scaricate) viene dichiarato, mai inventato. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CPAAnalysis = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var COLORS = ['W', 'U', 'B', 'R', 'G'];
  var BASIC = { plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G', wastes: '' };
  /* Carte che possono stare in qualunque numero di copie in un mazzo Commander. */
  var ANY_NUMBER = ['relentless rats', 'rat colony', 'shadowborn apostle', 'persistent petitioners', 'dragon\'s approach', 'slime against humanity', 'hare apparent', 'tempest hawk', 'templar knight'];
  var LIMIT = { 'seven dwarves': 7 };
  var TYPES = [['creature', 'Creature'], ['planeswalker', 'Planeswalker'], ['battle', 'Battaglie'], ['sorcery', 'Stregonerie'], ['instant', 'Istantanei'],
    ['artifact', 'Artefatti'], ['enchantment', 'Incantesimi'], ['land', 'Terre'], ['other', 'Altre carte']];

  function lc(s) { return String(s == null ? '' : s).toLowerCase(); }
  function front(t) { return lc(t).split('//')[0]; }
  function baseName(name) { return lc(String(name).replace(/^snow-covered /i, '')); }

  /* Tipo con la stessa precedenza della pagina del mazzo: una creatura artefatto è una creatura. */
  function typeOf(t) {
    t = front(t);
    return /creature/.test(t) ? 'creature' : /land/.test(t) ? 'land' : /planeswalker/.test(t) ? 'planeswalker' : /battle/.test(t) ? 'battle' :
      /artifact/.test(t) ? 'artifact' : /enchantment/.test(t) ? 'enchantment' : /sorcery/.test(t) ? 'sorcery' : /instant/.test(t) ? 'instant' : 'other';
  }

  /* Simboli di mana colorati di un costo come «{2}{W}{W/U}{G/P}». Un simbolo ibrido conta per entrambi i colori. */
  function pips(cost) {
    var out = { W: 0, U: 0, B: 0, R: 0, G: 0 };
    (String(cost || '').match(/\{[^}]+\}/g) || []).forEach(function (s) {
      var seen = {};
      s.slice(1, -1).split('/').forEach(function (p) { p = p.toUpperCase(); if (out[p] !== undefined && !seen[p]) { seen[p] = 1; out[p]++; } });
    });
    return out;
  }

  /* Che cosa è una riga del mazzo: dati Scryfall (rec) o, per le terre base, il nome. */
  function info(card, rec, isBasic) {
    var r = { name: card.name, qty: card.qty, known: false, basic: false, type: 'other', cmc: 0, mc: '', c: [], ci: [], pm: '', land: false, legendary: false, creature: false, search: false, bn: false, nl: false, text: '' };
    if (isBasic && isBasic(card.name)) {
      var col = BASIC[baseName(card.name)];
      r.basic = true; r.known = true; r.land = true; r.type = 'land'; r.pm = col || 'C'; r.ci = col ? [col] : [];
      return r;
    }
    if (!rec) return r;
    var t = front(rec.t);
    r.known = true; r.type = typeOf(rec.t); r.cmc = rec.v || 0; r.mc = rec.mc || ''; r.c = String(rec.c || '').split('').filter(Boolean); r.ci = String(rec.ci || '').split('').filter(Boolean);
    r.pm = rec.pm || ''; r.land = r.type === 'land'; r.legendary = /legendary/.test(t); r.creature = /creature/.test(t);
    r.bn = !!rec.bn; r.nl = !!rec.nl; r.text = lc(rec.o);
    r.search = r.land && /search your library for (?:a|an|up to \w+) (?:basic )?(?:snow )?(?:land|plains|island|swamp|mountain|forest)/.test(r.text);
    return r;
  }

  function analyze(deck, ctx) {
    var keyOf = ctx.keyOf, cmdKey = deck.commander ? keyOf(deck.commander) : '', rows = [], cmd = null, missing = [];
    (deck.cards || []).forEach(function (c) {
      var r = info(c, ctx.rec(c), ctx.isBasic);
      r.isCmd = !!cmdKey && keyOf(c.name) === cmdKey;
      if (r.isCmd) cmd = r; else rows.push(r);
      if (!r.known) missing.push(c.name);
    });
    var out = { commander: cmd ? cmd.name : (deck.commander || ''), hasData: rows.some(function (r) { return r.known; }) || !!(cmd && cmd.known), missing: missing, total: 0, rows: rows.length };

    var spells = rows.filter(function (r) { return r.known && !r.land; });
    var nSpells = spells.reduce(function (t, r) { return t + r.qty; }, 0);

    /* curva: carte non terra senza il commander, per costo convertito (7 = «7 o più») */
    var curve = [0, 0, 0, 0, 0, 0, 0, 0], cmcSum = 0;
    spells.forEach(function (r) { var b = Math.min(7, Math.max(0, Math.floor(r.cmc))); curve[b] += r.qty; cmcSum += r.cmc * r.qty; });
    out.curve = curve; out.spells = nSpells; out.avgCmc = nSpells ? cmcSum / nSpells : 0;
    out.cmdCmc = cmd && cmd.known ? cmd.cmc : null;
    out.peak = curve.indexOf(Math.max.apply(null, curve));

    /* colori: simboli di mana nei costi, e carte per colore */
    var pp = { W: 0, U: 0, B: 0, R: 0, G: 0 }, byColor = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, multi: 0 };
    spells.forEach(function (r) {
      var p = pips(r.mc); COLORS.forEach(function (k) { pp[k] += p[k] * r.qty; });
      if (!r.c.length) byColor.C += r.qty; else { r.c.forEach(function (k) { if (byColor[k] !== undefined) byColor[k] += r.qty; }); if (r.c.length > 1) byColor.multi += r.qty; }
    });
    out.pips = pp; out.pipTotal = COLORS.reduce(function (t, k) { return t + pp[k]; }, 0); out.byColor = byColor;
    out.cmdPips = cmd && cmd.known ? pips(cmd.mc) : null;

    /* tipi (il commander a parte) */
    var types = {}; TYPES.forEach(function (t) { types[t[0]] = 0; });
    rows.forEach(function (r) { if (r.known) types[r.type] += r.qty; });
    out.types = TYPES.map(function (t) { return { k: t[0], label: t[1], n: types[t[0]] }; }).filter(function (t) { return t.n > 0; });
    out.lands = types.land;
    out.total = rows.reduce(function (t, r) { return t + r.qty; }, 0) + (cmd ? cmd.qty : 0);

    /* fonti di mana: terre e altre carte che producono mana, per colore */
    var src = {}; COLORS.concat(['C']).forEach(function (k) { src[k] = { land: 0, other: 0 }; });
    var other = 0, searchers = 0;
    rows.forEach(function (r) {
      if (!r.known) return;
      if (r.search) searchers += r.qty;
      var seen = {}; r.pm.split('').forEach(function (k) { if (src[k] && !seen[k]) { seen[k] = 1; src[k][r.land ? 'land' : 'other'] += r.qty; } });
      if (!r.land && r.pm) other += r.qty;
    });
    out.sources = COLORS.concat(['C']).map(function (k) { return { k: k, land: src[k].land, other: src[k].other, n: src[k].land + src[k].other, pips: pp[k] === undefined ? 0 : pp[k] }; });
    out.rocks = other; out.searchers = searchers;
    var tot = out.pipTotal;
    out.sources.forEach(function (s) {
      s.share = tot && s.pips ? s.pips / tot : 0;
      s.flag = '';
      if (s.k !== 'C' && s.pips) {
        var main = s.share >= 0.2;
        if (s.n < (main ? 12 : 8)) s.flag = 'low';
      }
    });

    /* identità di colore del commander */
    var id = { applies: !!(cmd && cmd.known), colors: cmd && cmd.known ? cmd.ci.slice() : [], bad: [] };
    if (id.applies) {
      rows.forEach(function (r) {
        if (!r.known) return;
        var extra = r.ci.filter(function (k) { return id.colors.indexOf(k) < 0; });
        if (extra.length) id.bad.push({ name: r.name, qty: r.qty, extra: extra });
      });
    }
    out.identity = id;

    /* legalità Commander (secondo Scryfall) */
    var issues = [], names = {};
    rows.concat(cmd ? [cmd] : []).forEach(function (r) { var k = keyOf(r.name); names[k] = names[k] || { name: r.name, qty: 0, basic: r.basic }; names[k].qty += r.qty; });
    var dup = Object.keys(names).map(function (k) { return { k: k, n: names[k] }; }).filter(function (x) {
      if (x.n.basic) return false;
      var lim = LIMIT[lc(x.n.name)] || (ANY_NUMBER.indexOf(lc(x.n.name)) >= 0 ? 0 : 1);
      return lim > 0 && x.n.qty > lim;
    }).map(function (x) { return x.n.name + ' ×' + x.n.qty; });
    var banned = rows.concat(cmd ? [cmd] : []).filter(function (r) { return r.bn; }).map(function (r) { return r.name; });
    var notLegal = rows.concat(cmd ? [cmd] : []).filter(function (r) { return r.nl; }).map(function (r) { return r.name; });
    var cmdOk = null;
    if (cmd && cmd.known) cmdOk = (cmd.legendary && (cmd.creature || /vehicle|spacecraft/.test(cmd.text || ''))) || /can be your commander|partner|choose a background/.test(cmd.text);
    function add(sev, k, text, list) { issues.push({ sev: sev, k: k, text: text, names: list || [] }); }
    if (!deck.commander) add('warn', 'cmd', 'Nessun commander scelto: non posso controllare l’identità di colore.');
    else if (cmdOk === false) add('error', 'cmd', 'Il commander non risulta una creatura leggendaria (né dice di poter essere commander).', [out.commander]);
    if (out.total !== 100) add('warn', 'size', 'Il mazzo ha ' + out.total + ' carte: in Commander ne servono 100, commander compreso.');
    if (dup.length) add('error', 'single', 'Copie doppie (si può averne una sola, tranne le terre base e poche carte speciali).', dup);
    if (banned.length) add('error', 'ban', 'Carte bandite in Commander.', banned);
    if (notLegal.length) add('error', 'nl', 'Carte non legali in Commander.', notLegal);
    if (id.bad.length) add('error', 'id', 'Fuori dall’identità di colore del commander (' + (id.colors.join('') || 'incolore') + ').', id.bad.map(function (b) { return b.name + ' (' + b.extra.join('') + ')'; }));
    if (missing.length) add('warn', 'data', 'Per ' + missing.length + (missing.length === 1 ? ' carta' : ' carte') + ' non ho ancora i dati: il controllo è parziale.', missing.slice(0, 10));
    out.legality = { issues: issues, ok: !issues.some(function (i) { return i.sev === 'error'; }), clean: issues.length === 0 };
    return out;
  }

  return { analyze: analyze, pips: pips, typeOf: typeOf, COLORS: COLORS, TYPES: TYPES };
});
