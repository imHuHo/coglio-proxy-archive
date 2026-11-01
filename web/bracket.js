/* Coglio Proxy Archive - calcolatore di bracket in locale (nessun accesso al DOM).
 * Parte dai dati delle carte già scaricati da Scryfall (cards.js): Game Changer e carte bandite arrivano da Scryfall,
 * turni extra, distruzione di terre di massa, tutor, accelerazione, rimozioni e pescate si riconoscono dal testo delle carte.
 * Le regole sono quelle pubbliche di Wizards (il minimo lo mette l'elemento più forte). È una stima: il bracket vero lo decide il tavolo.
 * La costanza di pescata è una simulazione sul mazzo (20.000 mani, sempre con lo stesso seme: stesso mazzo, stessi numeri). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CPABracket = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BASIC_COLOR = { plains: 'W', island: 'U', swamp: 'B', mountain: 'R', forest: 'G', wastes: 'C' };
  /* Mana veloce da cEDH (Sol Ring è in quasi ogni mazzo, quindi non conta). */
  var FAST = ['mana crypt', 'mana vault', 'grim monolith', 'basalt monolith', 'chrome mox', 'mox diamond', 'mox opal', 'mox amber', 'lotus petal', 'jeweled lotus',
    'black lotus', 'mox pearl', 'mox sapphire', 'mox jet', 'mox ruby', 'mox emerald', 'ancient tomb', 'dark ritual', 'cabal ritual', 'lion\'s eye diamond'];
  var MLD_NAMES = ['armageddon', 'ravages of war', 'catastrophe', 'devastation', 'ruination', 'jokulhaups', 'obliterate', 'decree of annihilation', 'apocalypse',
    'wake of destruction', 'impending disaster', 'boom // bust', 'boom', 'sunder', 'cataclysm', 'tectonic break', 'global ruin', 'balancing act'];
  var RE_MLD = /destroy all (?:nonbasic )?lands|exile all lands|each player sacrifices (?:all|\w+) lands|each player sacrifices all but one land/;
  var RE_EXTRA = /takes? (?:an )?extra turns?|extra turn after this one|additional turn after this one/;
  var RE_LANDSEARCH = '(?:(?:a|an|up to \\w+|\\w+) )?(?:basic )?(?:snow )?(?:land|plains|island|swamp|mountain|forest|wastes)s?\\b';
  var RE_TUTOR = new RegExp('search your library for (?!' + RE_LANDSEARCH + ')');
  var RE_RAMPSEARCH = new RegExp('search your library for ' + RE_LANDSEARCH);
  var RE_REMOVAL = /(?:destroy|exile) (?:up to \w+ )?(?:another )?target|counter target|destroy all|exile all|return target [^.]*to (?:its|their) owner's hand|deals? (?:x|\d+) damage to (?:any target|target (?:creature|planeswalker))|target creature gets -|all creatures get -|each creature gets -|sacrifices? (?:a|target) creature/;
  var RE_DRAW = /\bdraws? (?:a card|one card|two cards|three cards|four cards|x cards|\d+ cards|that many cards|cards equal)|you may draw (?:a|up to|two|x)|look at the top (?:\w+ )?cards? of your library[^.]*into your hand|reveal the top[^.]*into your hand/;
  var RE_TREASURE = /creates? (?:a|an|one|two|three|x|\d+) (?:tapped )?treasure/;

  function lc(s) { return String(s == null ? '' : s).toLowerCase(); }
  function front(t) { return lc(t).split('//')[0]; }
  function uniq(a) { var seen = {}, out = []; a.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } }); return out; }

  /* Che cosa è una carta, a partire dal suo riassunto Scryfall (rec) e dal nome. */
  function classify(name, rec, isBasic) {
    var k = lc(name), r = { name: name, land: false, pm: '', cmc: 0, known: !!rec };
    if (isBasic && isBasic(name)) {
      r.land = true; r.known = true;
      var b = k.replace('snow-covered ', ''); r.pm = BASIC_COLOR[b] || '';
      return r;
    }
    if (!rec) return r;
    var t = front(rec.t), o = lc(rec.o);
    r.land = /\bland\b/.test(t); r.cmc = rec.v || 0; r.pm = rec.pm || '';
    r.gc = !!rec.gc; r.banned = !!rec.bn;
    r.fast = FAST.indexOf(k) >= 0 || FAST.indexOf(lc(String(name).split(' // ')[0])) >= 0;
    r.mld = MLD_NAMES.indexOf(lc(String(name).split(' // ')[0])) >= 0 || RE_MLD.test(o);
    r.extra = RE_EXTRA.test(o);
    if (!r.land) {
      r.tutor = RE_TUTOR.test(o);
      r.ramp = !!r.pm || RE_RAMPSEARCH.test(o) || RE_TREASURE.test(o);
      r.removal = RE_REMOVAL.test(o);
      r.draw = RE_DRAW.test(o);
    }
    return r;
  }

  function cmdKey(d, keyOf) { return d.commander ? keyOf(d.commander) : ''; }

  /* Analisi di un mazzo. ctx: { rec(card) -> riassunto o null, isBasic(name), keyOf(name) } */
  function analyze(d, ctx) {
    var keyOf = ctx.keyOf, ck = cmdKey(d, keyOf), taken = !ck, pool = [], commander = null, missing = [];
    var lists = { gc: [], mld: [], extra: [], tutors: [], fast: [], banned: [], ramp: [], removal: [], draw: [] };
    var counts = { total: 0, lands: 0, ramp: 0, removal: 0, draw: 0, tutors: 0, fast: 0, extra: 0 };
    (d.cards || []).forEach(function (c) {
      var info = classify(c.name, c.design ? null : ctx.rec(c), ctx.isBasic), q = c.qty;
      info.design = !!c.design;
      if (!info.known && !c.design) missing.push(c.name);
      counts.total += q;
      if (!taken && keyOf(c.name) === ck) { taken = true; commander = info; q--; }
      if (info.gc) lists.gc.push(c.name);
      if (info.mld) lists.mld.push(c.name);
      if (info.extra) lists.extra.push(c.name);
      if (info.banned) lists.banned.push(c.name);
      if (info.tutor) { lists.tutors.push(c.name); counts.tutors += c.qty; }
      if (info.fast) { lists.fast.push(c.name); counts.fast += c.qty; }
      if (info.extra) counts.extra += c.qty;
      if (info.land) counts.lands += c.qty;
      if (info.ramp) { lists.ramp.push(c.name); counts.ramp += c.qty; }
      if (info.removal) { lists.removal.push(c.name); counts.removal += c.qty; }
      if (info.draw) { lists.draw.push(c.name); counts.draw += c.qty; }
      for (var i = 0; i < q; i++) pool.push(info);
    });
    Object.keys(lists).forEach(function (k) { lists[k] = uniq(lists[k]).sort(function (a, b) { return a.localeCompare(b, 'en'); }); });
    var sum = { tag: '', range: '', name: '', note: '', gameChangers: lists.gc, massLandDenial: lists.mld, extraTurns: lists.extra, banned: lists.banned, combos: [], unknown: [] };
    return { pool: pool, commander: commander, lists: lists, counts: counts, missing: uniq(missing), sum: sum, hasData: missing.length < Math.max(1, d.cards.length) };
  }

  /* ----- simulazione delle mani ----- */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function draws(an, ci, opt) {
    opt = opt || {};
    var pool = an.pool, n = pool.length, trials = opt.trials || 20000;
    if (n < 15) return null;
    var rand = rng(opt.seed || 0xC061), idx = []; for (var i = 0; i < n; i++) idx.push(i);
    var cmc = an.commander ? an.commander.cmc : 0, colors = String(ci || '').replace(/[^WUBRG]/g, '').split('').filter(Boolean);
    var keep = 0, l3 = 0, r3 = 0, onc = 0, col = 0, landsSum = 0, needN = Math.min(n, 7 + Math.max(cmc, 0));
    var seen = Math.max(needN, 10);
    for (var t = 0; t < trials; t++) {
      for (var j = 0; j < seen; j++) { var k = j + Math.floor(rand() * (n - j)), tmp = idx[j]; idx[j] = idx[k]; idx[k] = tmp; }
      var lands7 = 0, cheap = false, got = {}, lands10 = 0, ramp10 = 0, src = 0, c, p;
      for (var m = 0; m < seen; m++) {
        c = pool[idx[m]];
        if (m < 7) {
          if (c.land) lands7++; else if (c.cmc <= 3) cheap = true;
          for (var z = 0; z < colors.length; z++) if (c.pm.indexOf(colors[z]) >= 0) got[colors[z]] = 1;
        }
        if (m < 10) { if (c.land) lands10++; else if (c.ramp) ramp10++; }
        if (m < needN && (c.land || (c.ramp && c.cmc <= 2))) src++;
      }
      landsSum += lands7;
      if (lands7 >= 2 && lands7 <= 5 && cheap) keep++;
      if (lands10 >= 3) l3++;
      if (ramp10 >= 2) r3++;
      if (cmc > 0 && src >= cmc) onc++;
      if (colors.every(function (x) { return got[x]; })) col++;
    }
    return {
      keepable: keep / trials, lands3: l3 / trials, ramp3: r3 / trials, onCurve: cmc > 0 ? onc / trials : null,
      colors: colors.length ? col / trials : null, avgLands: landsSum / trials, trials: trials, cmc: cmc, colorCount: colors.length
    };
  }

  /* Rimando un giudizio breve: quanto manca al bracket successivo. */
  function verdict(n, an) {
    var gc = an.lists.gc.length, near = [];
    if (n === 3 && gc === 3) near.push('3 Game Changer: uno in più e sale a 4');
    if (n <= 3 && an.counts.fast >= 2) near.push(an.counts.fast + ' carte di mana veloce');
    if (n <= 3 && an.counts.tutors >= 6) near.push(an.counts.tutors + ' tutor');
    if (n === 2 && an.lists.extra.length >= 2) near.push(an.lists.extra.length + ' turni extra');
    return near;
  }

  var HEALTH_REF = { lands: [36, 38], ramp: 10, removal: 10, draw: 10 };

  return { analyze: analyze, classify: classify, draws: draws, verdict: verdict, HEALTH_REF: HEALTH_REF, FAST: FAST, rng: rng };
});
