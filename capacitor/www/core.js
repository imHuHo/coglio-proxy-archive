/* Coglio Proxy Archive - logica pura (nessun accesso al DOM).
 * Usata dall'app e dai test Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BASIC_NAMES = [
    'plains', 'island', 'swamp', 'mountain', 'forest', 'wastes',
    'snow-covered plains', 'snow-covered island', 'snow-covered swamp',
    'snow-covered mountain', 'snow-covered forest'
  ];
  var IGNORED_TAGS = /^(foil|etched|promo|prerelease|extended|showcase|borderless)$/i;

  function strip(s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  /* Chiave canonica di una carta: minuscolo, senza accenti, solo la faccia anteriore. */
  function keyOf(name) {
    return strip(name).toLowerCase().replace(/[’‘`´]/g, "'")
      .split(/\s*\/\/\s*/)[0].replace(/\s+/g, ' ').trim();
  }
  /* Normalizzazione per la ricerca: solo lettere, cifre e spazi. */
  function searchNorm(s) {
    return strip(s).toLowerCase().replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim();
  }
  function isBasic(name) { return BASIC_NAMES.indexOf(keyOf(name)) >= 0; }
  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /* ---------- Parser delle liste txt ---------- */
  var SECTION_RE = /^(commanders?|deck|mainboard|main|sideboard|side|maybeboard|maybe|companion|considering)\s*:?\s*$/i;

  function parseList(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n');
    var raw = [], warnings = [], excluded = 0;
    var section = 'main', block = 0, blockHasCards = false;

    lines.forEach(function (line0) {
      var line = line0.trim();
      if (!line) { if (blockHasCards) { block++; blockHasCards = false; } return; }
      if (/^(\/\/|#)/.test(line)) return;

      var sh = line.match(SECTION_RE);
      if (sh) {
        var s = sh[1].toLowerCase();
        section = /^commander/.test(s) ? 'commander' : /^(side|maybe|considering|companion)/.test(s) ? 'side' : 'main';
        if (blockHasCards) { block++; blockHasCards = false; }
        return;
      }

      var sec = section, body = line;
      var sb = body.match(/^SB:\s*(.*)$/i);
      if (sb) { sec = 'side'; body = sb[1]; }

      var qty = 1, rest = body;
      var m = body.match(/^(\d+)\s*[xX]?\s+(.+)$/);
      if (m) { qty = parseInt(m[1], 10); rest = m[2]; }
      else if (!/^[A-Za-zÀ-ɏ"']/.test(body)) { warnings.push(line0); return; }

      rest = rest.replace(/\s+\*[A-Za-z]+\*/g, '').replace(/\s*\^[^^]*\^/g, '').trim();
      var name = rest, set = '', cn = '';
      var sm = rest.match(/^(.*?)\s+[(\[]([A-Za-z0-9]{2,6})[)\]](?:\s+([A-Za-z0-9★†\-]+))?(?:\s+.*)?$/);
      if (sm) {
        name = sm[1].trim();
        if (IGNORED_TAGS.test(sm[2])) { set = ''; cn = ''; }
        else { set = sm[2].toUpperCase(); cn = sm[3] || ''; }
      } else {
        name = rest.replace(/\s*\[[^\]]*\]\s*$/, '').trim();
      }
      if (!name || !(qty > 0)) { warnings.push(line0); return; }
      if (sec === 'side') { excluded += qty; return; }
      raw.push({ name: name, qty: qty, set: set, cn: cn, commander: sec === 'commander', block: block });
      blockHasCards = true;
    });

    var map = {}, cards = [];
    raw.forEach(function (r) {
      var k = keyOf(r.name) + '|' + r.set + '|' + r.cn;
      if (map[k]) map[k].qty += r.qty;
      else { map[k] = { name: r.name, qty: r.qty, set: r.set, cn: r.cn }; cards.push(map[k]); }
    });

    var hints = [];
    function addHint(n) {
      if (!hints.some(function (h) { return keyOf(h) === keyOf(n); })) hints.push(n);
    }
    raw.filter(function (r) { return r.commander; }).forEach(function (r) { addHint(r.name); });
    if (!hints.length) {
      var blocks = [];
      raw.forEach(function (r) { (blocks[r.block] = blocks[r.block] || []).push(r); });
      blocks = blocks.filter(Boolean);
      if (blocks.length >= 2) {
        var last = blocks[blocks.length - 1], first = blocks[0];
        if (last.length === 1 && last[0].qty === 1) addHint(last[0].name);
        if (first.length === 1 && first[0].qty === 1) addHint(first[0].name);
      }
    }
    var total = cards.reduce(function (a, c) { return a + c.qty; }, 0);
    return { cards: cards, hints: hints, warnings: warnings, excluded: excluded, total: total, unique: cards.length };
  }

  /* ---------- Archivio ---------- */
  /* Stato di un mazzo: 'active' (montato: carte in uso), 'unprinted' (non ancora stampato: le sue carte non esistono ancora
   * e non entrano nell'archivio), 'inactive' (smontato: carte libere), 'binder' (carte sciolte, sempre libere). */
  function statusOf(d) { return d.kind === 'binder' ? 'binder' : d.status === 'unprinted' ? 'unprinted' : d.active ? 'active' : 'inactive'; }
  function inUse(deck) { return statusOf(deck) === 'active'; }
  function isPrinted(d) { return statusOf(d) !== 'unprinted'; }
  function isFreeDeck(d) { return statusOf(d) === 'inactive'; }

  function buildArchive(decks) {
    var map = {}, list = [];
    decks.forEach(function (d) {
      if (!isPrinted(d)) return;
      d.cards.forEach(function (c) {
        var k = keyOf(c.name), e = map[k];
        if (!e) {
          e = map[k] = { key: k, name: c.name, basic: isBasic(c.name), owned: 0, occupied: 0, rows: [], sets: [] };
          list.push(e);
        }
        var used = inUse(d);
        e.owned += c.qty;
        if (used) e.occupied += c.qty;
        var set = c.set || '', cn = c.cn || '';
        if (set && e.sets.indexOf(set) < 0) e.sets.push(set);
        var ex = null;
        for (var i = 0; i < e.rows.length; i++) {
          var r = e.rows[i];
          if (r.deckId === d.id && r.set === set && r.cn === cn) { ex = r; break; }
        }
        if (ex) ex.qty += c.qty;
        else e.rows.push({ deckId: d.id, deckName: d.name, kind: d.kind, active: used, qty: c.qty, set: set, cn: cn });
      });
    });
    var stats = { unique: list.length, owned: 0, occupied: 0, free: 0, activeDecks: 0, decks: 0, busy: 0, part: 0, avail: 0 };
    list.forEach(function (e) {
      /* stampa mostrata nell'archivio: quella dei mazzi attivi, poi quella con più copie */
      var pr = e.rows.filter(function (r) { return r.set; }).sort(function (a, b) { return (b.active - a.active) || (b.qty - a.qty); })[0];
      e.pset = pr ? pr.set : ''; e.pcn = pr ? pr.cn : '';
      e.free = e.owned - e.occupied;
      e.status = e.occupied === 0 ? 'free' : (e.free === 0 ? 'busy' : 'part');
      e.sets.sort();
      stats.owned += e.owned; stats.occupied += e.occupied; stats.free += e.free;
      if (e.free === 0) stats.busy++; else stats.avail++;
      if (e.status === 'part') stats.part++;
    });
    decks.forEach(function (d) {
      if (d.kind === 'deck') { stats.decks++; if (d.active) stats.activeDecks++; }
    });
    list.sort(function (a, b) { return a.name.localeCompare(b.name, 'en'); });
    return { list: list, map: map, stats: stats };
  }

  /* ---------- Upgrade ---------- */
  /* Stampe: due copie sono «la stessa stampa» se coincidono collezione e numero. Se una delle due non indica
     la collezione (o il numero) non si può dire che siano diverse, quindi vale come uguale. */
  function pk(c) { return (c.set || '').toLowerCase() + '|' + (c.cn || '').toLowerCase(); }
  function samePrint(a, b) {
    if (!a.set || !b.set) return true;
    if (String(a.set).toLowerCase() !== String(b.set).toLowerCase()) return false;
    return !a.cn || !b.cn || String(a.cn).toLowerCase() === String(b.cn).toLowerCase();
  }
  function qtyMap(cards) {
    var m = {}, order = [];
    cards.forEach(function (c) {
      var k = keyOf(c.name), e = m[k];
      if (!e) { e = m[k] = { key: k, name: c.name, qty: 0, set: c.set || '', cn: c.cn || '', rows: [] }; order.push(k); }
      e.qty += c.qty;
      for (var i = 0; i < e.rows.length; i++) {
        if (pk(e.rows[i]) === pk(c)) { e.rows[i].qty += c.qty; return; }
      }
      e.rows.push({ set: c.set || '', cn: c.cn || '', qty: c.qty });
    });
    return { m: m, order: order };
  }
  function rowsOf(e, collapse) {
    if (!e) return [];
    if (collapse) return [{ set: '', cn: '', qty: e.qty }];
    return e.rows.map(function (r) { return { set: r.set, cn: r.cn, qty: r.qty }; });
  }
  function pairOff(L, R, eq) {
    L.forEach(function (l) {
      R.forEach(function (r) {
        if (l.qty > 0 && r.qty > 0 && eq(l, r)) { var t = Math.min(l.qty, r.qty); l.qty -= t; r.qty -= t; }
      });
    });
  }

  /* Confronto fra il mazzo e un upgrade. Ogni differenza è di uno di tre tipi:
   *  - out:      la carta esce (stesso nome non c'è più nell'upgrade, o ne servono meno copie);
   *  - inn:      la carta entra (nome nuovo, o copie in più);
   *  - reprints: lo stesso nome resta ma cambia la stampa (collezione/numero): la vecchia esce, la nuova va stampata.
   * Per le carte che entrano si distingue tra copie libere con ESATTAMENTE la stampa voluta (covered) e copie libere
   * della stessa carta ma in un'altra stampa (altCover): per l'archivio sono carte diverse. */
  function diffUpgrade(deck, upgrade, decks, settings) {
    var unlimited = !settings || settings.basicsUnlimited !== false;
    var base = qtyMap(deck.cards), up = qtyMap(upgrade.cards);
    var keys = base.order.concat(up.order.filter(function (k) { return !base.m[k]; }));
    var out = [], inn = [], reprints = [];
    keys.forEach(function (k) {
      var bm = base.m[k], um = up.m[k], name = (um || bm).name;
      var collapse = isBasic(name) && unlimited;
      var L = rowsOf(bm, collapse), R = rowsOf(um, collapse);
      pairOff(L, R, function (x, y) { return pk(x) === pk(y); });
      pairOff(L, R, samePrint);
      L.forEach(function (l) {
        R.forEach(function (r) {
          if (l.qty > 0 && r.qty > 0) {
            var t = Math.min(l.qty, r.qty); l.qty -= t; r.qty -= t;
            reprints.push({ key: k, name: um.name, qty: t, from: { set: l.set, cn: l.cn }, to: { set: r.set, cn: r.cn }, set: r.set, cn: r.cn });
          }
        });
      });
      L.forEach(function (l) { if (l.qty > 0) out.push({ key: k, name: bm.name, qty: l.qty, set: l.set, cn: l.cn }); });
      R.forEach(function (r) { if (r.qty > 0) inn.push({ key: k, name: um.name, qty: r.qty, set: r.set, cn: r.cn }); });
    });
    var others = decks.filter(function (x) { return x.id !== deck.id; });
    var avail = function (it) {
      var ex = 0, alt = 0, sources = [], altSources = [], busy = {}, busyIn = [];
      others.forEach(function (d) {
        if (!isPrinted(d)) return;
        d.cards.forEach(function (c) {
          if (keyOf(c.name) !== it.key) return;
          if (inUse(d)) {
            if (!busy[d.id]) { busy[d.id] = { deckId: d.id, deckName: d.name, qty: 0 }; busyIn.push(busy[d.id]); }
            busy[d.id].qty += c.qty;
          } else if (samePrint(it, c)) { ex += c.qty; sources.push({ deckId: d.id, deckName: d.name, qty: c.qty, kind: d.kind, set: c.set || '', cn: c.cn || '' }); }
          else { alt += c.qty; altSources.push({ deckId: d.id, deckName: d.name, qty: c.qty, kind: d.kind, set: c.set || '', cn: c.cn || '' }); }
        });
      });
      it.basic = isBasic(it.name) && unlimited;
      it.covered = it.basic ? it.qty : Math.min(it.qty, ex);
      it.missing = it.qty - it.covered;
      it.altCover = it.basic ? 0 : Math.min(it.missing, alt);
      it.sources = sources; it.altSources = altSources; it.busyIn = busyIn;
    };
    inn.forEach(avail); reprints.forEach(avail);
    var sum = function (a, f) { return a.reduce(function (t, x) { return t + f(x); }, 0); };
    var q = function (x) { return x.qty; };
    return {
      out: out, inn: inn, reprints: reprints,
      dropQty: sum(out, q), newQty: sum(inn, q), reprintQty: sum(reprints, q),
      outQty: sum(out, q) + sum(reprints, q),
      inQty: sum(inn, q) + sum(reprints, q),
      covered: sum(inn, function (x) { return x.covered; }) + sum(reprints, function (x) { return x.covered; }),
      missing: sum(inn, function (x) { return x.missing; }) + sum(reprints, function (x) { return x.missing; }),
      altCover: sum(inn, function (x) { return x.altCover; }) + sum(reprints, function (x) { return x.altCover; }),
      commanderChange: !!(upgrade.commander && upgrade.commander !== deck.commander)
    };
  }

  function applyUpgrade(deck, upgrade) {
    deck.cards = JSON.parse(JSON.stringify(upgrade.cards));
    if (upgrade.commander) deck.commander = upgrade.commander;
    deck.upgrades = deck.upgrades.filter(function (u) { return u.id !== upgrade.id; });
    deck.updatedAt = Date.now();
    return deck;
  }

  function exportText(deck) {
    return deck.cards.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'en'); })
      .map(function (c) {
        return c.qty + ' ' + c.name + (c.set ? ' (' + c.set + ')' + (c.cn ? ' ' + c.cn : '') : '');
      }).join('\n');
  }

  /* Lista per i checker online: sezione Commander e sezione Deck, solo quantità e nome. */
  function bracketText(deck) {
    var cmd = deck.commander ? keyOf(deck.commander) : '', taken = !cmd;
    var main = [], name = '';
    deck.cards.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'en'); }).forEach(function (c) {
      var q = c.qty;
      if (!taken && keyOf(c.name) === cmd) { taken = true; name = c.name; q--; }
      if (q > 0) main.push(q + ' ' + c.name);
    });
    return (cmd && name ? 'Commander\n1 ' + name + '\n\nDeck\n' : '') + main.join('\n');
  }

  /* Richiesta per l'API di Commander Spellbook: comandante a parte, il resto del mazzo con le quantità. */
  function bracketPayload(deck) {
    var cmd = deck.commander ? keyOf(deck.commander) : '', taken = !cmd, commanders = [], main = [];
    deck.cards.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'en'); }).forEach(function (c) {
      var q = c.qty;
      if (!taken && keyOf(c.name) === cmd) { taken = true; commanders.push({ card: c.name, quantity: 1 }); q--; }
      if (q > 0) main.push({ card: c.name, quantity: q });
    });
    return { commanders: commanders, main: main };
  }

  /* Sigla di Commander Spellbook → bracket Wizards. È una stima: E/C/P/S/R sono fasce di potenza, non il bracket deciso al tavolo. */
  var BRACKET_TAGS = {
    E: { range: '1–2', name: 'Exhibition', note: 'Nessuna carta che alza il bracket.' },
    C: { range: '2', name: 'Core', note: 'Al massimo qualche turno extra.' },
    P: { range: '3', name: 'Powerful', note: 'Qualche Game Changer.' },
    O: { range: '3', name: 'Oddball', note: 'Combo particolari: valuta a mano.' },
    S: { range: '3–4', name: 'Spicy', note: 'C\'è una combo a due carte, ma non rapida.' },
    R: { range: '4+', name: 'Ruthless', note: 'Almeno uno fra: 4+ Game Changer, distruzione di terre di massa, molti turni extra, combo a due carte rapida.' },
    B: { range: 'non legale', name: 'Banned', note: 'Contiene carte bandite in Commander.' }
  };
  function bracketSummary(resp, payload) {
    var tag = resp && typeof resp.bracketTag === 'string' ? resp.bracketTag.toUpperCase() : '';
    var info = BRACKET_TAGS[tag] || { range: '?', name: tag || 'n/d', note: 'Risposta non riconosciuta.' };
    var cards = Array.isArray(resp && resp.cards) ? resp.cards : [];
    var names = function (flag) {
      var out = [], seen = {};
      cards.forEach(function (c) {
        var n = c && c.card && c.card.name;
        if (n && c[flag] && !seen[n]) { seen[n] = 1; out.push(n); }
      });
      return out.sort(function (a, b) { return a.localeCompare(b, 'en'); });
    };
    var known = {};
    cards.forEach(function (c) {
      var n = c && c.card && c.card.name; if (!n) return;
      known[keyOf(n)] = 1; known[keyOf(n.split(' // ')[0])] = 1;
    });
    var unknown = [];
    (payload ? payload.commanders.concat(payload.main) : []).forEach(function (x) {
      var k = keyOf(x.card), f = keyOf(x.card.split(' // ')[0]);
      if (!known[k] && !known[f] && unknown.indexOf(x.card) < 0) unknown.push(x.card);
    });
    var combos = [], seenC = {};
    (Array.isArray(resp && resp.combos) ? resp.combos : []).forEach(function (r) {
      var cb = r && r.combo; if (!cb) return;
      var cs = (cb.uses || []).map(function (u) { return u && u.card && u.card.name; }).filter(Boolean);
      var res = (cb.produces || []).map(function (p) { return p && p.feature && p.feature.name; }).filter(Boolean);
      var key = cs.slice().sort().join('|') + '>' + res.join('|');
      if (!cs.length || seenC[key]) return; seenC[key] = 1;
      combos.push({ cards: cs, result: res, tag: cb.bracketTag || '', twoCard: !!r.definitelyTwoCard, fast: typeof r.speed === 'number' ? r.speed : null });
    });
    var out = {
      tag: tag, range: info.range, name: info.name, note: info.note,
      gameChangers: names('gameChanger'), massLandDenial: names('massLandDenial'), extraTurns: names('extraTurn'), banned: names('banned'),
      combos: combos, unknown: unknown
    };
    var b = bracketNumber(out); out.n = b.n; out.reasons = b.reasons;
    return out;
  }

  /* Bracket secondo le regole pubbliche di Wizards: ogni elemento mette un minimo, vale il più alto.
     Game Changer 1–3 → 3, 4 o più → 4; distruzione di terre di massa → 4; 3 o più turni extra → 4;
     combo a due carte rapida → 4, tardiva → 3. 1 e 5 (cEDH) dipendono dalla velocità di gioco e non si calcolano:
     il minimo è 2. n = 0 se nel mazzo c'è una carta bandita. */
  function bracketNumber(sum) {
    var n = 2, why = [];
    var up = function (v, msg) { if (v > n) { n = v; why = [msg]; } else if (v === n && v > 2) why.push(msg); };
    var gc = sum.gameChangers.length;
    if (gc >= 4) up(4, gc + ' Game Changer (da 4 in su il minimo è 4)');
    else if (gc >= 1) up(3, plural1(gc, 'Game Changer', 'Game Changer') + ' (il minimo è 3)');
    if (sum.massLandDenial.length) up(4, 'distruzione di terre di massa: ' + sum.massLandDenial.join(', '));
    if (sum.extraTurns.length >= 3) up(4, sum.extraTurns.length + ' turni extra');
    sum.combos.forEach(function (c) {
      if (c.tag === 'R') up(4, 'combo rapida: ' + c.cards.join(' + '));
      else if (c.tag === 'S' || c.tag === 'P') up(3, 'combo: ' + c.cards.join(' + '));
    });
    if (sum.tag === 'R') up(4, 'stima di Commander Spellbook: Ruthless');
    else if (sum.tag === 'S' || sum.tag === 'P') up(3, 'stima di Commander Spellbook: ' + (sum.tag === 'S' ? 'Spicy' : 'Powerful'));
    if (sum.banned.length) return { n: 0, reasons: ['carte bandite: ' + sum.banned.join(', ')] };
    if (!why.length) why.push('nessun elemento che alzi il bracket');
    return { n: n, reasons: why };
  }
  function plural1(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  /* Impronta della lista: serve a capire se il bracket salvato è stato calcolato su un mazzo poi cambiato. */
  function deckSig(deck) {
    var t = (deck.commander || '') + '\n' + deck.cards.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'en'); })
      .map(function (c) { return c.qty + ' ' + c.name; }).join('\n'), h = 5381;
    for (var i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  function sanitizeBracket(b) {
    if (!b || typeof b !== 'object') return null;
    var n = parseInt(b.n, 10);
    if (!(n >= 0 && n <= 5)) return null;
    return { n: n, sig: String(b.sig || ''), at: +b.at || 0, manual: !!b.manual };
  }

  function printTag(x) { return x && x.set ? ' (' + String(x.set).toUpperCase() + ')' + (x.cn ? ' ' + x.cn : '') : ''; }
  function diffText(deck, upgrade, diff) {
    var l = ['Upgrade "' + upgrade.name + '" per ' + deck.name, '', 'ESCE (' + diff.dropQty + '):'];
    diff.out.forEach(function (x) { l.push(x.qty + ' ' + x.name + printTag(x)); });
    l.push('', 'ENTRA (' + diff.newQty + '):');
    diff.inn.forEach(function (x) {
      l.push(x.qty + ' ' + x.name + printTag(x) + (x.missing ? '  [da procurare: ' + x.missing + (x.altCover ? ', ne hai ' + x.altCover + ' in altra stampa' : '') + ']' : '  [in archivio]'));
    });
    if (diff.reprints.length) {
      l.push('', 'CAMBIA SOLO LA STAMPA (' + diff.reprintQty + '):');
      diff.reprints.forEach(function (x) {
        l.push(x.qty + ' ' + x.name + ':' + (printTag(x.from) || ' stampa non indicata') + ' →' + (printTag(x.to) || ' stampa non indicata') +
          (x.missing ? '  [da procurare: ' + x.missing + (x.altCover ? ', ne hai ' + x.altCover + ' in altra stampa' : '') + ']' : '  [in archivio]'));
      });
    }
    return l.join('\n');
  }


  /* ---------- Upgrade applicato: le carte si spostano davvero ---------- */
  function cloneJ(o) { return JSON.parse(JSON.stringify(o)); }

  function removeCopies(deck, key, qty, target) {
    var left = qty;
    deck.cards.forEach(function (c) {
      if (left > 0 && keyOf(c.name) === key && (!target || samePrint(target, c))) { var t = Math.min(c.qty, left); c.qty -= t; left -= t; }
    });
    deck.cards = deck.cards.filter(function (c) { return c.qty > 0; });
    return qty - left;
  }
  function addCopies(deck, card, qty) {
    var k = keyOf(card.name), set = card.set || '', cn = card.cn || '';
    for (var i = 0; i < deck.cards.length; i++) {
      var c = deck.cards[i];
      if (keyOf(c.name) === k && c.set === set && c.cn === cn) { c.qty += qty; return; }
    }
    deck.cards.push({ name: card.name, qty: qty, set: set, cn: cn });
  }

  /* Applica l'upgrade a `decks` (modificandolo):
   *  - le carte che escono dal mazzo finiscono nelle carte sciolte (si crea la lista se manca);
   *  - le carte che entrano vengono tolte prima dalle sciolte, poi dai mazzi non attivi;
   *  - la lista del mazzo diventa quella dell'upgrade.
   * Per l'anteprima si chiama su una copia. Restituisce il resoconto degli spostamenti. */
  function applyUpgradeMoves(decks, deckId, upgradeId, settings) {
    var deck = decks.filter(function (d) { return d.id === deckId; })[0];
    var up = deck.upgrades.filter(function (u) { return u.id === upgradeId; })[0];
    var diff = diffUpgrade(deck, up, decks, settings);
    var rep = { toLoose: [], fromLoose: [], fromDecks: [], reprints: [], createdBinder: false, binderName: '', diff: diff };
    var now = Date.now();

    /* entrano (carte nuove e nuove stampe): si prendono solo copie con ESATTAMENTE quella stampa */
    diff.inn.concat(diff.reprints).forEach(function (it) {
      var need = it.qty;
      decks.filter(function (d) { return d.kind === 'binder'; }).forEach(function (b) {
        if (need <= 0) return;
        var t = removeCopies(b, it.key, need, it);
        if (t) { need -= t; b.updatedAt = now; rep.fromLoose.push({ name: it.name, qty: t, deckId: b.id, deckName: b.name }); }
      });
      decks.filter(function (d) { return isFreeDeck(d) && d.id !== deck.id; }).forEach(function (d) {
        if (need <= 0) return;
        var t = removeCopies(d, it.key, need, it);
        if (t) { need -= t; d.updatedAt = now; rep.fromDecks.push({ name: it.name, qty: t, deckId: d.id, deckName: d.name }); }
      });
    });

    /* escono (carte tolte e vecchie stampe): finiscono nelle sciolte con la stampa che avevano */
    var gone = diff.out.concat(diff.reprints.map(function (r) { return { key: r.key, name: r.name, qty: r.qty, set: r.from.set, cn: r.from.cn }; }));
    var binder = decks.filter(function (d) { return d.kind === 'binder'; })[0] || null;
    /* un mazzo non ancora stampato non ha carte vere: quelle che escono non diventano sciolte */
    rep.unprinted = !isPrinted(deck);
    if (gone.length && isPrinted(deck)) {
      if (!binder) {
        binder = { id: uid('d'), name: 'Carte sciolte', kind: 'binder', active: false, commander: null, cards: [], upgrades: [], createdAt: now, updatedAt: now };
        decks.push(binder); rep.createdBinder = true;
      }
      gone.forEach(function (x) {
        var src = x.set ? { name: x.name, set: x.set, cn: x.cn } : (deck.cards.filter(function (c) { return keyOf(c.name) === x.key; })[0] || { name: x.name });
        addCopies(binder, src, x.qty);
        rep.toLoose.push({ name: x.name, qty: x.qty });
      });
      binder.updatedAt = now;
    }
    diff.reprints.forEach(function (r) { rep.reprints.push({ name: r.name, qty: r.qty, from: r.from, to: r.to }); });
    if (binder) rep.binderName = binder.name;

    deck.cards = cloneJ(up.cards);
    if (up.commander) deck.commander = up.commander;
    deck.upgrades = deck.upgrades.filter(function (u) { return u.id !== upgradeId; });
    deck.updatedAt = now;
    return rep;
  }

  /* Carte di una lista da stampare che hai già: sciolte (stampate e libere) o libere in mazzi non attivi.
   * Per ogni carta si distingue:
   *  - exact: copie libere con ESATTAMENTE la stampa richiesta (se la lista non indica la collezione, vale qualsiasi);
   *  - other: copie libere della stessa carta ma in un'altra stampa (per l'archivio sono carte diverse).
   * loose/looseCovered/inactive restano per compatibilità: contano per nome, senza guardare la stampa. */
  function findReusable(cards, decks, settings) {
    var unlimited = !settings || settings.basicsUnlimited !== false;
    var need = qtyMap(cards), out = [];
    need.order.forEach(function (k) {
      var it = need.m[k];
      if (unlimited && isBasic(it.name)) return;
      var loose = 0, inactive = [], pool = [];
      decks.forEach(function (d) {
        var q = 0;
        d.cards.forEach(function (c) {
          if (keyOf(c.name) !== k) return;
          q += c.qty;
          if (d.kind === 'binder' || isFreeDeck(d)) pool.push({ deckId: d.id, deckName: d.name, kind: d.kind, set: c.set || '', cn: c.cn || '', left: c.qty });
        });
        if (!q) return;
        if (d.kind === 'binder') loose += q;
        else if (isFreeDeck(d)) inactive.push({ deckId: d.id, deckName: d.name, qty: q });
      });
      if (!loose && !inactive.length) return;
      var exactRows = [], otherRows = [], exact = 0, other = 0;
      var rows = it.rows.map(function (r) { return { set: r.set, cn: r.cn, left: r.qty }; });
      rows.forEach(function (r) {
        pool.forEach(function (p) {
          if (r.left > 0 && p.left > 0 && samePrint(r, p)) {
            var t = Math.min(r.left, p.left); r.left -= t; p.left -= t; exact += t;
            exactRows.push({ deckId: p.deckId, deckName: p.deckName, kind: p.kind, qty: t, set: p.set, cn: p.cn });
          }
        });
      });
      rows.forEach(function (r) {
        pool.forEach(function (p) {
          if (r.left > 0 && p.left > 0) {
            var t = Math.min(r.left, p.left); r.left -= t; p.left -= t; other += t;
            otherRows.push({ deckId: p.deckId, deckName: p.deckName, kind: p.kind, qty: t, set: p.set, cn: p.cn });
          }
        });
      });
      out.push({
        key: k, name: it.name, need: it.qty, wanted: it.rows.map(function (r) { return { set: r.set, cn: r.cn, qty: r.qty }; }),
        exact: exact, other: other, exactRows: exactRows, otherRows: otherRows,
        loose: loose, looseCovered: Math.min(it.qty, loose), inactive: inactive
      });
    });
    return out;
  }

  /* Mazzo in creazione: prende dalle sciolte e dai mazzi non attivi le copie scelte.
   * picks: { 'chiave|exact': true, 'chiave|other': true } (le chiavi sono quelle di findReusable).
   * Le copie scelte escono dalla loro lista e restano nel nuovo mazzo; se prese in un'altra stampa, il mazzo registra la stampa che hai davvero. */
  function applyReuse(decks, deck, picks, settings) {
    var done = [], now = Date.now();
    var others = decks.filter(function (d) { return d.id !== deck.id; });
    findReusable(deck.cards, others, settings).forEach(function (it) {
      ['exact', 'other'].forEach(function (kind) {
        if (!picks || !picks[it.key + '|' + kind]) return;
        (kind === 'exact' ? it.exactRows : it.otherRows).forEach(function (row) {
          var src = others.filter(function (d) { return d.id === row.deckId; })[0];
          if (!src) return;
          var got = removeCopies(src, it.key, row.qty, { set: row.set, cn: row.cn });
          if (!got) return;
          src.updatedAt = now;
          var left = got, moved = [];
          deck.cards.forEach(function (c) {
            if (left > 0 && keyOf(c.name) === it.key && (kind === 'other' || samePrint(row, c))) {
              var t = Math.min(c.qty, left); c.qty -= t; left -= t; moved.push({ name: c.name, set: c.set, cn: c.cn, qty: t });
            }
          });
          deck.cards = deck.cards.filter(function (c) { return c.qty > 0; });
          moved.forEach(function (m) { addCopies(deck, { name: m.name, set: row.set || m.set, cn: row.set ? row.cn : m.cn }, m.qty); });
          done.push({ name: it.name, qty: got, deckId: src.id, deckName: src.name, kind: src.kind, from: kind, set: row.set, cn: row.cn });
        });
      });
    });
    return done;
  }

  /* ---------- Stato ---------- */
  function sanitizeCards(arr) {
    return (Array.isArray(arr) ? arr : []).map(function (c) {
      return {
        name: String(c && c.name || '').trim(), qty: Math.max(1, parseInt(c && c.qty, 10) || 1),
        set: String(c && c.set || ''), cn: String(c && c.cn || '')
      };
    }).filter(function (c) { return c.name; });
  }
  function sanitizeDeck(d) {
    return {
      id: String(d.id || uid('d')), name: String(d.name || 'Mazzo'),
      kind: d.kind === 'binder' ? 'binder' : 'deck',
      status: d.kind === 'binder' ? 'inactive' : d.status === 'unprinted' ? 'unprinted' : d.active ? 'active' : 'inactive',
      active: d.kind === 'binder' || d.status === 'unprinted' ? false : !!d.active,
      commander: d.commander ? String(d.commander) : null,
      bracket: sanitizeBracket(d.bracket),
      cards: sanitizeCards(d.cards),
      upgrades: (Array.isArray(d.upgrades) ? d.upgrades : []).map(function (u) {
        return {
          id: String(u.id || uid('u')), name: String(u.name || 'Upgrade'),
          cards: sanitizeCards(u.cards), commander: u.commander ? String(u.commander) : null,
          createdAt: u.createdAt || Date.now()
        };
      }),
      createdAt: d.createdAt || Date.now(), updatedAt: d.updatedAt || Date.now()
    };
  }
  function sanitizeSettings(s) {
    s = s || {};
    return { theme: ['light', 'dark'].indexOf(s.theme) >= 0 ? s.theme : 'auto', basicsUnlimited: s.basicsUnlimited !== false, images: s.images !== false };
  }

  return {
    keyOf: keyOf, searchNorm: searchNorm, isBasic: isBasic, uid: uid,
    parseList: parseList, buildArchive: buildArchive, diffUpgrade: diffUpgrade,
    applyUpgrade: applyUpgrade, applyUpgradeMoves: applyUpgradeMoves, findReusable: findReusable, applyReuse: applyReuse, statusOf: statusOf, isPrinted: isPrinted, samePrint: samePrint, clone: cloneJ, exportText: exportText, bracketText: bracketText, bracketPayload: bracketPayload, bracketSummary: bracketSummary, bracketNumber: bracketNumber, deckSig: deckSig, diffText: diffText,
    sanitizeDeck: sanitizeDeck, sanitizeSettings: sanitizeSettings, inUse: inUse
  };
});
