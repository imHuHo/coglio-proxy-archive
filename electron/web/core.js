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
  function inUse(deck) { return deck.kind === 'deck' && !!deck.active; }

  function buildArchive(decks) {
    var map = {}, list = [];
    decks.forEach(function (d) {
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
  function qtyMap(cards) {
    var m = {}, order = [];
    cards.forEach(function (c) {
      var k = keyOf(c.name);
      if (m[k]) m[k].qty += c.qty;
      else { m[k] = { key: k, name: c.name, qty: c.qty, set: c.set || '', cn: c.cn || '' }; order.push(k); }
    });
    return { m: m, order: order };
  }

  function diffUpgrade(deck, upgrade, decks, settings) {
    var base = qtyMap(deck.cards), up = qtyMap(upgrade.cards);
    var out = [], inn = [];
    base.order.forEach(function (k) {
      var b = base.m[k], u = up.m[k], d = b.qty - (u ? u.qty : 0);
      if (d > 0) out.push({ key: k, name: b.name, qty: d, set: b.set, cn: b.cn });
    });
    up.order.forEach(function (k) {
      var u = up.m[k], b = base.m[k], d = u.qty - (b ? b.qty : 0);
      if (d > 0) inn.push({ key: k, name: u.name, qty: d, set: u.set, cn: u.cn });
    });
    var unlimited = !settings || settings.basicsUnlimited !== false;
    var others = decks.filter(function (x) { return x.id !== deck.id; });
    inn.forEach(function (it) {
      var basic = isBasic(it.name) && unlimited;
      var avail = 0, sources = [], busyIn = [];
      others.forEach(function (d) {
        var q = 0;
        d.cards.forEach(function (c) { if (keyOf(c.name) === it.key) q += c.qty; });
        if (!q) return;
        if (inUse(d)) busyIn.push({ deckId: d.id, deckName: d.name, qty: q });
        else { avail += q; sources.push({ deckId: d.id, deckName: d.name, qty: q, kind: d.kind }); }
      });
      it.basic = basic;
      it.covered = basic ? it.qty : Math.min(it.qty, avail);
      it.missing = it.qty - it.covered;
      it.sources = sources;
      it.busyIn = busyIn;
    });
    var sum = function (a, f) { return a.reduce(function (t, x) { return t + f(x); }, 0); };
    return {
      out: out, inn: inn,
      outQty: sum(out, function (x) { return x.qty; }),
      inQty: sum(inn, function (x) { return x.qty; }),
      covered: sum(inn, function (x) { return x.covered; }),
      missing: sum(inn, function (x) { return x.missing; }),
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
    return {
      tag: tag, range: info.range, name: info.name, note: info.note,
      gameChangers: names('gameChanger'), massLandDenial: names('massLandDenial'), extraTurns: names('extraTurn'), banned: names('banned'),
      combos: combos, unknown: unknown
    };
  }

  function diffText(deck, upgrade, diff) {
    var l = ['Upgrade "' + upgrade.name + '" per ' + deck.name, '', 'ESCE (' + diff.outQty + '):'];
    diff.out.forEach(function (x) { l.push(x.qty + ' ' + x.name); });
    l.push('', 'ENTRA (' + diff.inQty + '):');
    diff.inn.forEach(function (x) {
      l.push(x.qty + ' ' + x.name + (x.missing ? '  [da procurare: ' + x.missing + ']' : '  [in archivio]'));
    });
    return l.join('\n');
  }


  /* ---------- Upgrade applicato: le carte si spostano davvero ---------- */
  function cloneJ(o) { return JSON.parse(JSON.stringify(o)); }

  function removeCopies(deck, key, qty) {
    var left = qty;
    deck.cards.forEach(function (c) {
      if (left > 0 && keyOf(c.name) === key) { var t = Math.min(c.qty, left); c.qty -= t; left -= t; }
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
    var rep = { toLoose: [], fromLoose: [], fromDecks: [], createdBinder: false, binderName: '', diff: diff };
    var now = Date.now();

    diff.inn.forEach(function (it) {
      var need = it.qty;
      decks.filter(function (d) { return d.kind === 'binder'; }).forEach(function (b) {
        if (need <= 0) return;
        var t = removeCopies(b, it.key, need);
        if (t) { need -= t; b.updatedAt = now; rep.fromLoose.push({ name: it.name, qty: t, deckId: b.id, deckName: b.name }); }
      });
      decks.filter(function (d) { return d.kind === 'deck' && !d.active && d.id !== deck.id; }).forEach(function (d) {
        if (need <= 0) return;
        var t = removeCopies(d, it.key, need);
        if (t) { need -= t; d.updatedAt = now; rep.fromDecks.push({ name: it.name, qty: t, deckId: d.id, deckName: d.name }); }
      });
    });

    var binder = decks.filter(function (d) { return d.kind === 'binder'; })[0] || null;
    if (diff.out.length) {
      if (!binder) {
        binder = { id: uid('d'), name: 'Carte sciolte', kind: 'binder', active: false, commander: null, cards: [], upgrades: [], createdAt: now, updatedAt: now };
        decks.push(binder); rep.createdBinder = true;
      }
      diff.out.forEach(function (x) {
        var src = deck.cards.filter(function (c) { return keyOf(c.name) === x.key; })[0] || { name: x.name };
        addCopies(binder, src, x.qty);
        rep.toLoose.push({ name: x.name, qty: x.qty });
      });
      binder.updatedAt = now;
    }
    if (binder) rep.binderName = binder.name;

    deck.cards = cloneJ(up.cards);
    if (up.commander) deck.commander = up.commander;
    deck.upgrades = deck.upgrades.filter(function (u) { return u.id !== upgradeId; });
    deck.updatedAt = now;
    return rep;
  }

  /* Carte di una lista da stampare che hai già: sciolte (stampate e libere) o libere in mazzi non attivi. */
  function findReusable(cards, decks, settings) {
    var unlimited = !settings || settings.basicsUnlimited !== false;
    var need = qtyMap(cards), out = [];
    need.order.forEach(function (k) {
      var it = need.m[k];
      if (unlimited && isBasic(it.name)) return;
      var loose = 0, inactive = [];
      decks.forEach(function (d) {
        var q = 0;
        d.cards.forEach(function (c) { if (keyOf(c.name) === k) q += c.qty; });
        if (!q) return;
        if (d.kind === 'binder') loose += q;
        else if (!d.active) inactive.push({ deckId: d.id, deckName: d.name, qty: q });
      });
      if (loose || inactive.length) {
        out.push({ key: k, name: it.name, need: it.qty, loose: loose, looseCovered: Math.min(it.qty, loose), inactive: inactive });
      }
    });
    return out;
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
      active: d.kind === 'binder' ? false : !!d.active,
      commander: d.commander ? String(d.commander) : null,
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
    applyUpgrade: applyUpgrade, applyUpgradeMoves: applyUpgradeMoves, findReusable: findReusable, clone: cloneJ, exportText: exportText, bracketText: bracketText, bracketPayload: bracketPayload, bracketSummary: bracketSummary, diffText: diffText,
    sanitizeDeck: sanitizeDeck, sanitizeSettings: sanitizeSettings, inUse: inUse
  };
});
