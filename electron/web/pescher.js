/* Coglio Proxy Archive - The Pescher, il compagno di partita (nessun accesso al DOM).
 * Tiene la partita: vite, veleno, danno da comandante, annulla, registro, dadi, chi inizia, e due consigli che solo noi
 * possiamo dare perché conosciamo i mazzi: «che mazzo uso stasera?» e l'avviso quando al tavolo ci sono bracket molto diversi.
 * Stato semplice (JSON) così si salva e si ripristina; il caso entra come funzione `rng` per poterlo provare. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CPAPescher = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MIN = 2, MAX = 6, LIVES = [20, 30, 40], POISON_OUT = 10, CMD_OUT = 21, HIST = 60, LOG = 80;
  var DICE = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 };

  function clampInt(n, lo, hi, d) { n = parseInt(n, 10); return n === n ? Math.max(lo, Math.min(hi, n)) : d; }
  function rnd(rng, n) { var x = (typeof rng === 'function' ? rng() : Math.random()); return Math.min(n - 1, Math.floor(x * n)); }
  function plain(g) { return { players: g.players, turn: g.turn, first: g.first }; }

  /* ----- partita ----- */
  function newGame(o) {
    o = o || {};
    var n = clampInt(o.players, MIN, MAX, 4), life = clampInt(o.life, 1, 999, 40), players = [];
    for (var i = 0; i < n; i++) {
      var nm = o.names && o.names[i] ? String(o.names[i]).slice(0, 24) : (i === 0 ? 'Io' : 'Giocatore ' + (i + 1));
      players.push({ id: 'p' + (i + 1), name: nm, life: life, poison: 0, cmd: {}, deck: null, bracket: 0 });
    }
    return { v: 1, started: false, start: life, cmdLife: o.cmdLife !== false, players: players, turn: -1, first: -1, log: [], hist: [], t: Date.now() };
  }
  function player(g, id) { for (var i = 0; i < g.players.length; i++) if (g.players[i].id === id) return g.players[i]; return null; }
  function say(g, text) { g.log.unshift({ t: Date.now(), text: text }); if (g.log.length > LOG) g.log.length = LOG; }
  function push(g) { g.hist.push(JSON.stringify(plain(g))); if (g.hist.length > HIST) g.hist.shift(); }

  /* Chi è fuori, e perché: lo si ricava sempre dai numeri, quindi rialzando la vita si torna in gioco. */
  function status(g, p) {
    var why = [];
    if (p.life <= 0) why.push({ k: 'life', text: 'vita a ' + p.life });
    if (p.poison >= POISON_OUT) why.push({ k: 'poison', text: p.poison + ' segnalini veleno' });
    Object.keys(p.cmd || {}).forEach(function (from) {
      if (p.cmd[from] >= CMD_OUT) { var f = player(g, from); why.push({ k: 'cmd', from: from, text: p.cmd[from] + ' danni da comandante di ' + (f ? f.name : '?') }); }
    });
    return { out: why.length > 0, why: why };
  }
  function alive(g) { return g.players.filter(function (p) { return !status(g, p).out; }); }
  function winner(g) { var a = alive(g); return g.players.length > 1 && a.length === 1 ? a[0] : null; }

  /* ----- azioni (ognuna si può annullare) ----- */
  function life(g, id, d) {
    var p = player(g, id); if (!p || !d) return false;
    push(g); p.life += d; say(g, p.name + (d > 0 ? ' guadagna ' + d : ' perde ' + (-d)) + ' vita (' + p.life + ')'); return true;
  }
  function poison(g, id, d) {
    var p = player(g, id); if (!p || !d) return false;
    var to = Math.max(0, p.poison + d); if (to === p.poison) return false;
    push(g); p.poison = to; say(g, p.name + ': veleno a ' + to); return true;
  }
  /* Danno da comandante: per regola è danno da combattimento, quindi toglie anche vita (si può spegnere). */
  function cmd(g, id, from, d) {
    var p = player(g, id), f = player(g, from); if (!p || !f || id === from || !d) return false;
    var cur = p.cmd[from] || 0, to = Math.max(0, cur + d), real = to - cur; if (!real) return false;
    push(g); p.cmd[from] = to; if (g.cmdLife) p.life -= real;
    say(g, p.name + ' subisce ' + (real > 0 ? real : 'meno ' + (-real)) + ' da comandante di ' + f.name + ' (' + to + ')'); return true;
  }
  function setLife(g, id, v) { var p = player(g, id); v = parseInt(v, 10); if (!p || v !== v || v === p.life) return false; push(g); say(g, p.name + ': vita impostata a ' + v); p.life = v; return true; }
  function rename(g, id, name) { var p = player(g, id); name = String(name || '').trim().slice(0, 24); if (!p || !name) return false; p.name = name; return true; }
  function setDeck(g, id, deck) {
    var p = player(g, id); if (!p) return false;
    p.deck = deck ? { id: String(deck.id || ''), name: String(deck.name || ''), commander: String(deck.commander || ''), n: clampInt(deck.n, 0, 5, 0) } : null;
    if (p.deck && p.deck.n) p.bracket = p.deck.n; else if (!p.deck) p.bracket = 0;
    return true;
  }
  /* Prima di iniziare: quanti posti e con quanta vita. */
  function resize(g, n) {
    n = clampInt(n, MIN, MAX, g.players.length);
    while (g.players.length > n) g.players.pop();
    while (g.players.length < n) { var i = g.players.length; g.players.push({ id: 'p' + (i + 1), name: 'Giocatore ' + (i + 1), life: g.start, poison: 0, cmd: {}, deck: null, bracket: 0 }); }
    g.players.forEach(function (p) { Object.keys(p.cmd).forEach(function (k) { if (!player(g, k)) delete p.cmd[k]; }); });
    return g;
  }
  function setStart(g, v) { g.start = clampInt(v, 1, 999, 40); g.players.forEach(function (p) { p.life = g.start; }); return g; }
  function setBracket(g, id, n) { var p = player(g, id); if (!p) return false; p.bracket = clampInt(n, 0, 5, 0); return true; }
  function undo(g) {
    if (!g.hist.length) return false;
    var s = JSON.parse(g.hist.pop()); g.players = s.players; g.turn = s.turn; g.first = s.first; say(g, 'Annullato l’ultimo passaggio'); return true;
  }
  function reset(g) {
    g.players.forEach(function (p) { p.life = g.start; p.poison = 0; p.cmd = {}; });
    g.hist = []; g.log = []; g.turn = -1; g.first = -1; g.started = true; g.t = Date.now();
  }
  function begin(g, rng) { reset(g); var i = rnd(rng, g.players.length); g.first = i; g.turn = i; say(g, 'Inizia ' + g.players[i].name); return g.players[i]; }
  function nextTurn(g) {
    if (g.turn < 0) return null;
    var n = g.players.length, i = g.turn;
    for (var k = 0; k < n; k++) { i = (i + 1) % n; if (!status(g, g.players[i]).out) break; }
    push(g); g.turn = i; return g.players[i];
  }

  /* ----- dadi ----- */
  function roll(kind, rng) {
    if (kind === 'coin') { var h = rnd(rng, 2) === 0; return { kind: 'coin', value: h ? 'Testa' : 'Croce', text: 'Moneta: ' + (h ? 'testa' : 'croce') }; }
    var sides = DICE[kind]; if (!sides) return null;
    var v = rnd(rng, sides) + 1; return { kind: kind, value: v, sides: sides, text: kind.toUpperCase() + ': ' + v };
  }
  function pickFirst(g, rng) { var i = rnd(rng, g.players.length); return { index: i, player: g.players[i], text: 'Inizia ' + g.players[i].name }; }

  /* ----- bracket al tavolo ----- */
  /* 1–2 di distanza va bene (un 2 e un 3 si giocano), da 2 in su si avvisa, da 3 in su è uno squilibrio forte. */
  function balance(g) {
    var known = g.players.filter(function (p) { return p.bracket >= 1; }).map(function (p) { return { id: p.id, name: p.name, n: p.bracket }; });
    var unknown = g.players.filter(function (p) { return !(p.bracket >= 1); }).map(function (p) { return p.name; });
    var out = { known: known, unknown: unknown, level: 'unknown', spread: 0, min: 0, max: 0, lows: [], highs: [], text: '' };
    if (known.length < 2) { out.text = known.length ? 'Serve il bracket di almeno un altro mazzo per confrontarli.' : 'Scegli i mazzi o imposta i bracket per controllare il bilanciamento.'; return out; }
    var ns = known.map(function (k) { return k.n; }); out.min = Math.min.apply(null, ns); out.max = Math.max.apply(null, ns); out.spread = out.max - out.min;
    out.lows = known.filter(function (k) { return k.n === out.min; }); out.highs = known.filter(function (k) { return k.n === out.max; });
    var names = function (l) { return l.map(function (k) { return k.name; }).join(', '); };
    if (out.spread <= 1) { out.level = 'ok'; out.text = out.spread ? 'Tavolo equilibrato: bracket ' + out.min + ' e ' + out.max + '.' : 'Tavolo equilibrato: tutti al bracket ' + out.min + '.'; }
    else {
      out.level = out.spread >= 3 ? 'bad' : 'warn';
      out.text = (out.spread >= 3 ? 'Squilibrio forte' : 'Bracket diversi') + ': ' + names(out.highs) + ' (bracket ' + out.max + ') contro ' + names(out.lows) + ' (bracket ' + out.min + '). ' +
        (out.spread >= 3 ? 'Meglio parlarne prima di giocare o cambiare mazzo.' : 'Vale la pena dirselo prima di iniziare.');
    }
    return out;
  }

  /* ----- «che mazzo uso stasera?» ----- */
  /* decks: [{id,name,commander,n}] solo i mazzi attivi. others: bracket degli altri posti. taken: id già scelti al tavolo.
   * Con altri bracket noti si preferisce il più vicino alla mediana; senza, o a parità, decide il caso. */
  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function suggest(decks, o, rng) {
    o = o || {};
    var others = (o.others || []).filter(function (n) { return n >= 1; }), taken = o.taken || [], target = others.length ? median(others) : null;
    var list = decks.filter(function (d) { return taken.indexOf(d.id) < 0; }).map(function (d) {
      var s = 0, why;
      if (target == null) why = d.n ? 'bracket ' + d.n : 'bracket non calcolato';
      else if (!d.n) { s = -2.5; why = 'bracket non calcolato'; }
      else { s = -Math.abs(d.n - target); why = 'bracket ' + d.n + (s === 0 ? ', come il tavolo' : ' contro ' + (target % 1 ? String(target).replace('.', ',') : target) + ' del tavolo'); }
      return { deck: d, score: s, why: why, tie: typeof rng === 'function' ? rng() : Math.random() };
    });
    list.sort(function (a, b) { return (b.score - a.score) || (a.tie - b.tie); });
    return { ranked: list, pick: list.length ? list[0] : null, target: target };
  }

  /* ----- salvataggio ----- */
  function serialize(g) { return JSON.stringify(g); }
  function restore(raw) {
    var g; try { g = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return null; }
    if (!g || g.v !== 1 || !Array.isArray(g.players) || g.players.length < MIN || g.players.length > MAX) return null;
    var ids = {};
    g.players = g.players.map(function (p, i) {
      var id = 'p' + (i + 1); ids[p.id] = id;
      return { id: id, name: String(p.name || 'Giocatore ' + (i + 1)).slice(0, 24), life: clampInt(p.life, -999, 9999, 40), poison: clampInt(p.poison, 0, 99, 0), cmd: p.cmd && typeof p.cmd === 'object' ? p.cmd : {},
        deck: p.deck && typeof p.deck === 'object' ? { id: String(p.deck.id || ''), name: String(p.deck.name || ''), commander: String(p.deck.commander || ''), n: clampInt(p.deck.n, 0, 5, 0) } : null, bracket: clampInt(p.bracket, 0, 5, 0) };
    });
    g.players.forEach(function (p) { var c = {}; Object.keys(p.cmd).forEach(function (k) { if (ids[k]) c[ids[k]] = clampInt(p.cmd[k], 0, 999, 0); }); p.cmd = c; });
    g.start = clampInt(g.start, 1, 999, 40); g.cmdLife = g.cmdLife !== false; g.started = !!g.started;
    g.turn = clampInt(g.turn, -1, g.players.length - 1, -1); g.first = clampInt(g.first, -1, g.players.length - 1, -1);
    g.log = Array.isArray(g.log) ? g.log.slice(0, LOG).filter(function (l) { return l && typeof l.text === 'string'; }) : [];
    g.hist = Array.isArray(g.hist) ? g.hist.slice(-HIST).filter(function (h) { return typeof h === 'string'; }) : [];
    g.v = 1; g.t = Number(g.t) || Date.now();
    return g;
  }

  return {
    MIN: MIN, MAX: MAX, LIVES: LIVES, POISON_OUT: POISON_OUT, CMD_OUT: CMD_OUT, DICE: Object.keys(DICE),
    newGame: newGame, player: player, status: status, alive: alive, winner: winner,
    resize: resize, setStart: setStart, life: life, poison: poison, cmd: cmd, setLife: setLife, rename: rename, setDeck: setDeck, setBracket: setBracket, undo: undo, reset: reset, begin: begin, nextTurn: nextTurn,
    roll: roll, pickFirst: pickFirst, balance: balance, suggest: suggest, serialize: serialize, restore: restore
  };
});
