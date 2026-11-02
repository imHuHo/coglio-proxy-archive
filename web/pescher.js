/* Coglio Proxy Archive - The Pescher, il compagno di partita dal vivo (nessun accesso al DOM).
 * Tiene la partita al tavolo: vite, veleno, danno da comandante, segnalini (esperienza, energia, lanci del comandante),
 * monarca e iniziativa, turni, annulla, registro, dadi e «chi inizia». Non sa nulla dei mazzi degli altri: si gioca con gli amici.
 * Stato semplice (JSON) così si salva e si ripristina; il caso entra come funzione `rng` per poterlo provare. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CPAPescher = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MIN = 2, MAX = 6, LIVES = [20, 30, 40], POISON_OUT = 10, CMD_OUT = 21, HIST = 60, LOG = 80;
  var DICE = { d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20 };
  var COUNTERS = { exp: 'Esperienza', eng: 'Energia', tax: 'Lanci del comandante' };
  var HOLDERS = { monarch: 'Monarca', initiative: 'Iniziativa' };

  function clampInt(n, lo, hi, d) { n = parseInt(n, 10); return n === n ? Math.max(lo, Math.min(hi, n)) : d; }
  function rnd(rng, n) { var x = (typeof rng === 'function' ? rng() : Math.random()); return Math.min(n - 1, Math.floor(x * n)); }
  function plain(g) { return { players: g.players, turn: g.turn, first: g.first, round: g.round, monarch: g.monarch, initiative: g.initiative }; }
  function seat(i, life) { return { id: 'p' + (i + 1), name: i === 0 ? 'Io' : 'Giocatore ' + (i + 1), life: life, poison: 0, exp: 0, eng: 0, tax: 0, cmd: {} }; }

  /* ----- partita ----- */
  function newGame(o) {
    o = o || {};
    var n = clampInt(o.players, MIN, MAX, 4), life = clampInt(o.life, 1, 999, 40), players = [];
    for (var i = 0; i < n; i++) {
      var p = seat(i, life); if (o.names && o.names[i]) p.name = String(o.names[i]).slice(0, 24);
      players.push(p);
    }
    return { v: 1, started: false, start: life, cmdLife: o.cmdLife !== false, players: players, turn: -1, first: -1, round: 1, monarch: '', initiative: '', log: [], hist: [], t: Date.now() };
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
  function setLife(g, id, v) {
    var p = player(g, id); v = parseInt(v, 10); if (!p || v !== v || v === p.life) return false;
    v = Math.max(-999, Math.min(9999, v)); push(g); say(g, p.name + ': vita impostata a ' + v); p.life = v; return true;
  }
  function poison(g, id, d) {
    var p = player(g, id); if (!p || !d) return false;
    var to = Math.max(0, Math.min(99, p.poison + d)); if (to === p.poison) return false;
    push(g); p.poison = to; say(g, p.name + ': veleno a ' + to); return true;
  }
  /* Danno da comandante: per regola è danno da combattimento, quindi toglie anche vita (si può spegnere). */
  function cmd(g, id, from, d) {
    var p = player(g, id), f = player(g, from); if (!p || !f || id === from || !d) return false;
    var cur = p.cmd[from] || 0, to = Math.max(0, Math.min(99, cur + d)), real = to - cur; if (!real) return false;
    push(g); p.cmd[from] = to; if (g.cmdLife) p.life -= real;
    say(g, p.name + ' subisce ' + (real > 0 ? real : 'meno ' + (-real)) + ' da comandante di ' + f.name + ' (' + to + ')'); return true;
  }
  /* Esperienza, energia, lanci del comandante (ogni lancio costa 2 in più). */
  function counter(g, id, key, d) {
    var p = player(g, id); if (!p || !COUNTERS[key] || !d) return false;
    var to = Math.max(0, Math.min(99, (p[key] || 0) + d)); if (to === (p[key] || 0)) return false;
    push(g); p[key] = to; say(g, p.name + ': ' + COUNTERS[key].toLowerCase() + ' a ' + to + (key === 'tax' ? ' (+' + 2 * to + ' di costo)' : '')); return true;
  }
  function taxOf(p) { return 2 * (p.tax || 0); }
  /* Monarca e iniziativa: li ha un giocatore solo; toccarlo di nuovo lo toglie. */
  function holder(g, kind, id) {
    var p = player(g, id); if (!p || !HOLDERS[kind]) return false;
    push(g);
    if (g[kind] === id) { g[kind] = ''; say(g, p.name + ' non è più ' + (kind === 'monarch' ? 'il monarca' : 'chi ha l’iniziativa')); }
    else { g[kind] = id; say(g, p.name + (kind === 'monarch' ? ' diventa il monarca' : ' prende l’iniziativa')); }
    return true;
  }
  function rename(g, id, name) { var p = player(g, id); name = String(name || '').trim().slice(0, 24); if (!p || !name) return false; p.name = name; return true; }
  function undo(g) {
    if (!g.hist.length) return false;
    var s = JSON.parse(g.hist.pop()); g.players = s.players; g.turn = s.turn; g.first = s.first; g.round = s.round || 1; g.monarch = s.monarch || ''; g.initiative = s.initiative || '';
    say(g, 'Annullato l’ultimo passaggio'); return true;
  }
  function reset(g) {
    g.players.forEach(function (p) { p.life = g.start; p.poison = 0; p.exp = 0; p.eng = 0; p.tax = 0; p.cmd = {}; });
    g.hist = []; g.log = []; g.turn = -1; g.first = -1; g.round = 1; g.monarch = ''; g.initiative = ''; g.started = true; g.t = Date.now();
  }
  function begin(g, rng) { reset(g); var i = rnd(rng, g.players.length); g.first = i; g.turn = i; say(g, 'Inizia ' + g.players[i].name); return g.players[i]; }
  /* Passa il turno a chi è ancora in gioco; quando si ripassa da chi ha iniziato si conta un nuovo giro. */
  function nextTurn(g) {
    if (g.turn < 0) return null;
    var n = g.players.length, i = g.turn, wrapped = false;
    for (var k = 0; k < n; k++) { i = (i + 1) % n; if (i === g.first) wrapped = true; if (!status(g, g.players[i]).out) break; }
    push(g); if (wrapped || i === g.turn) g.round++; g.turn = i; return g.players[i];
  }

  /* Prima di iniziare: quanti posti e con quanta vita. */
  function resize(g, n) {
    n = clampInt(n, MIN, MAX, g.players.length);
    while (g.players.length > n) g.players.pop();
    while (g.players.length < n) g.players.push(seat(g.players.length, g.start));
    g.players.forEach(function (p) { Object.keys(p.cmd).forEach(function (k) { if (!player(g, k)) delete p.cmd[k]; }); });
    if (!player(g, g.monarch)) g.monarch = ''; if (!player(g, g.initiative)) g.initiative = '';
    return g;
  }
  function setStart(g, v) { g.start = clampInt(v, 1, 999, 40); g.players.forEach(function (p) { p.life = g.start; }); return g; }

  /* ----- dadi ----- */
  function roll(kind, rng) {
    if (kind === 'coin') { var h = rnd(rng, 2) === 0; return { kind: 'coin', value: h ? 'Testa' : 'Croce', text: 'Moneta: ' + (h ? 'testa' : 'croce') }; }
    var sides = DICE[kind]; if (!sides) return null;
    var v = rnd(rng, sides) + 1; return { kind: kind, value: v, sides: sides, text: kind.toUpperCase() + ': ' + v };
  }
  function pickFirst(g, rng) { var i = rnd(rng, g.players.length); return { index: i, player: g.players[i], text: 'Inizia ' + g.players[i].name }; }

  /* ----- salvataggio ----- */
  function serialize(g) { return JSON.stringify(g); }
  function restore(raw) {
    var g; try { g = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return null; }
    if (!g || g.v !== 1 || !Array.isArray(g.players) || g.players.length < MIN || g.players.length > MAX) return null;
    var ids = {};
    g.players = g.players.map(function (p, i) {
      var id = 'p' + (i + 1); ids[p.id] = id;
      return { id: id, name: String(p.name || 'Giocatore ' + (i + 1)).slice(0, 24), life: clampInt(p.life, -999, 9999, 40), poison: clampInt(p.poison, 0, 99, 0),
        exp: clampInt(p.exp, 0, 99, 0), eng: clampInt(p.eng, 0, 99, 0), tax: clampInt(p.tax, 0, 99, 0), cmd: p.cmd && typeof p.cmd === 'object' ? p.cmd : {} };
    });
    g.players.forEach(function (p) { var c = {}; Object.keys(p.cmd).forEach(function (k) { if (ids[k]) c[ids[k]] = clampInt(p.cmd[k], 0, 999, 0); }); p.cmd = c; });
    g.start = clampInt(g.start, 1, 999, 40); g.cmdLife = g.cmdLife !== false; g.started = !!g.started;
    g.turn = clampInt(g.turn, -1, g.players.length - 1, -1); g.first = clampInt(g.first, -1, g.players.length - 1, -1); g.round = clampInt(g.round, 1, 9999, 1);
    g.monarch = ids[g.monarch] || ''; g.initiative = ids[g.initiative] || '';
    g.log = Array.isArray(g.log) ? g.log.slice(0, LOG).filter(function (l) { return l && typeof l.text === 'string'; }) : [];
    g.hist = Array.isArray(g.hist) ? g.hist.slice(-HIST).filter(function (h) { return typeof h === 'string'; }) : [];
    g.v = 1; g.t = Number(g.t) || Date.now();
    return g;
  }

  return {
    MIN: MIN, MAX: MAX, LIVES: LIVES, POISON_OUT: POISON_OUT, CMD_OUT: CMD_OUT, DICE: Object.keys(DICE), COUNTERS: COUNTERS, HOLDERS: HOLDERS,
    newGame: newGame, player: player, status: status, alive: alive, winner: winner, resize: resize, setStart: setStart,
    life: life, setLife: setLife, poison: poison, cmd: cmd, counter: counter, taxOf: taxOf, holder: holder, rename: rename, undo: undo, reset: reset, begin: begin, nextTurn: nextTurn,
    roll: roll, pickFirst: pickFirst, serialize: serialize, restore: restore
  };
});
