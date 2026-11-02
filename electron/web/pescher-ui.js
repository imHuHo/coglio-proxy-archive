/* Coglio Proxy Archive - The Pescher: la schermata di gioco.
 * Logica in pescher.js; qui ci sono solo il tavolo, i pop-up e il salvataggio della partita (localStorage, sul dispositivo).
 * Ridisegna solo il proprio contenitore (#pe), così un tocco sulla vita non rifà tutta l'app e non perde il fuoco della tastiera. */
(function () {
  'use strict';
  var H = window.CPAHost, P = window.CPAPescher, C = window.CPACommunity;
  if (!H || !P) return;
  var esc = H.esc, KEY = 'cpa:pescher:v1', HKEY = 'cpa:pescher:hist:v1', TKEY = 'cpa:pescher:tables:v1', SKEY = 'cpa:pescher:shared:v1', OKEY = 'cpa:pescher:outbox:v1';
  var g = null, hist = null, tbls = null, wake = null, clockT = 0, deltaT = 0, sh = null, ob = null, net = { busy: false, err: '', t: 0, flush: false, work: '' };
  var ux = { open: {}, pop: '', rolls: [], confirm: '', setFor: '', delta: {}, end: null, delGame: '', delTable: '', tnew: '', pick: '', perr: '', tname: '', leave: '' };
  var SEAT = ['var(--m-u)', 'var(--m-r)', 'var(--m-g)', 'var(--m-w)', 'var(--m-b)', 'var(--banana)'];

  /* ---------- salvataggio ---------- */
  function load() { try { var raw = localStorage.getItem(KEY); return raw ? P.restore(raw) : null; } catch (e) { return null; } }
  function save() { try { g.mirror = !!g.mirror; localStorage.setItem(KEY, P.serialize(g)); } catch (e) { /* il tavolo funziona anche senza salvataggio */ } }
  function ensure() { if (!g) g = load() || P.newGame({ players: 4, life: 40 }); return g; }
  function history() { if (!hist) { try { hist = P.restoreHistory(localStorage.getItem(HKEY)); } catch (e) { hist = []; } } return hist; }
  function saveHistory() { try { localStorage.setItem(HKEY, JSON.stringify(hist)); } catch (e) { /* la classifica resta in memoria finché la pagina è aperta */ } }
  function tables() { if (!tbls) { try { tbls = P.restoreTables(localStorage.getItem(TKEY)); } catch (e) { tbls = []; } } return tbls; }
  function saveTables() { try { localStorage.setItem(TKEY, JSON.stringify(tbls)); } catch (e) { /* i tavoli restano in memoria finché la pagina è aperta */ } }
  /* il tavolo scelto; se è stato eliminato (o l'id è sporco) si torna al tavolo libero */
  function curTable() {
    if (!g || !g.table) return null;
    var t = allTables().filter(function (x) { return x.id === g.table; })[0];
    if (!t) g.table = '';
    return t || null;
  }

  /* ---------- tavoli condivisi (sul server): copia sul dispositivo, partite in coda, aggiornamento ---------- */
  function cm() { var A = window.CPACommunityUI; try { return C && A && A.api ? A.api() : null; } catch (e) { return null; } }
  function acct(a) { return a.me.id || a.me.handle; }
  function cache(a) {
    if (!sh) { try { sh = C.restoreShared(localStorage.getItem(SKEY)); } catch (e) { sh = null; } }
    if (!sh || sh.acct !== acct(a)) sh = { acct: acct(a), handle: a.me.handle, t: 0, tables: [], games: {}, gt: {} };
    return sh;
  }
  function saveShared() { try { if (sh) localStorage.setItem(SKEY, JSON.stringify(sh)); } catch (e) { /* resta in memoria */ } }
  function outbox() {
    if (!ob) { try { var a = JSON.parse(localStorage.getItem(OKEY) || '[]'); ob = Array.isArray(a) ? a.filter(function (e) { return e && C.uid(e.table) && e.rec && Array.isArray(e.rec.players); }).slice(0, 500) : []; } catch (e) { ob = []; } }
    return ob;
  }
  function saveOutbox() { try { localStorage.setItem(OKEY, JSON.stringify(ob || [])); } catch (e) { /* resta in memoria */ } }
  /* tavolo del server -> forma comune ai tavoli del dispositivo */
  function toLocal(t) { return { id: t.id, name: t.name, shared: true, mine: t.mine, owner: t.owner, players: t.players.map(function (p) { return p.name; }), users: t.players.map(function (p) { return p.u; }), start: t.start, cmdLife: t.cmdLife, t: 0 }; }
  function sharedTables() { var a = cm(); if (!a || !sh || sh.acct !== acct(a)) return []; return sh.tables.map(toLocal); }
  function allTables() { return tables().concat(sharedTables()); }
  function rawShared(id) { return sh ? sh.tables.filter(function (t) { return t.id === id; })[0] || null : null; }
  /* le partite del tavolo condiviso: quelle del server più quelle ancora da inviare, con i nomi di oggi */
  function sharedGames(t) {
    var a = cm(), raw = rawShared(t.id), list = [];
    if (a && sh && sh.acct === acct(a)) {
      list = (sh.games[t.id] || []).slice();
      outbox().forEach(function (e) { if (e.table === t.id && e.acct === acct(a)) { var r = JSON.parse(JSON.stringify(e.rec)); r.pending = true; list.push(r); } });
    }
    return list.map(function (r) { var n = C.namesNow(r, raw); n.pending = r.pending; return n; }).sort(function (x, y) { return y.t - x.t; });
  }
  function hhmm(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function visible() { var el = document.getElementById('pe'), a = document.activeElement; return !!el && !(g && g.started) && !pop && !(a && a.tagName === 'INPUT' && el.contains(a)); }
  function paintSoon() { if (visible()) repaint(); }
  function neterr(e) { net.err = C.messageOf(e); return net.err; }
  /* manda al server le partite in coda; chi è offline le riprova al prossimo aggiornamento */
  function flush() {
    var a = cm(); if (!a || net.flush) return Promise.resolve();
    var k = acct(a), todo = outbox().filter(function (e) { return e.acct === k; }), lost = 0; if (!todo.length) return Promise.resolve();
    net.flush = true; var s = cache(a);
    function drop(e) { var i = ob.indexOf(e); if (i >= 0) ob.splice(i, 1); }
    function next() {
      var e = todo.shift(); if (!e) return null;
      return a.cli.gameAdd(a.me.handle, a.me.secret, e.table, e.rec).then(function (r) {
        drop(e); var gr = C.cleanGame(Object.assign({}, e.rec, { gid: r && r.gid })); if (gr) { (s.games[e.table] = s.games[e.table] || []).unshift(gr); }
        return next();
      }, function (err) { if (err && (err.code === 'no_table' || err.code === 'bad_data')) { drop(e); lost++; return next(); } throw err; });
    }
    return Promise.resolve(next()).then(function () { if (lost) net.err = lost === 1 ? 'Una partita non è stata inviata: il tavolo non c’è più.' : lost + ' partite non sono state inviate: il tavolo non c’è più.'; },
      function (err) { neterr(err); }).then(function () { net.flush = false; saveOutbox(); saveShared(); });
  }
  function loadGames(id, force) {
    var a = cm(); if (!a) return Promise.resolve();
    var s = cache(a); if (!force && s.gt[id] && Date.now() - s.gt[id] < 30000) return Promise.resolve();
    return a.cli.tableGames(a.me.handle, a.me.secret, id).then(function (list) { s.games[id] = list; s.gt[id] = Date.now(); saveShared(); },
      function (e) { if (e && e.code === 'no_table') { s.tables = s.tables.filter(function (t) { return t.id !== id; }); delete s.games[id]; saveShared(); } neterr(e); });
  }
  /* aggiorna i tavoli, manda le partite in coda e scarica quelle del tavolo scelto */
  function refresh(force) {
    var a = cm(); if (!a || net.busy) return;
    if (!force && Date.now() - net.t < 60000) return;
    net.busy = true; net.err = ''; net.t = Date.now(); if (force) paintSoon();
    a.ready().then(function () {
      a = cm(); if (!a) return;
      var s = cache(a);
      return a.cli.tables(a.me.handle, a.me.secret).then(function (ts) { s.tables = ts; s.t = Date.now(); saveShared(); return flush(); }).then(function () { var c = curTable(); return c && c.shared ? loadGames(c.id, true) : null; });
    }).then(null, function (e) { neterr(e); }).then(function () { net.busy = false; syncNames(); paintSoon(); });
  }
  /* chi si è seduto per ID tiene sempre il nome di oggi: se un amico cambia ID, il suo posto si aggiorna da solo (prima di iniziare) */
  function syncNames() {
    var c = curTable(), raw = c && c.shared ? rawShared(c.id) : null; if (!raw || !g || g.started) return;
    g.players.forEach(function (p) { if (!p.u) return; var m = raw.players.filter(function (x) { return x.u === p.u; })[0]; if (m && m.name !== p.name) p.name = m.name; });
    save();
  }
  function kick() { if (g && !g.started && document.getElementById('pe') && cm()) refresh(false); }
  /* salva (crea o aggiorna) un tavolo sul server con i posti di adesso */
  function serverSave(id, name, then) {
    var a = cm(); if (!a || net.work) return; net.work = 'save'; net.err = ''; paintSoon();
    a.ready().then(function () { a = cm(); return a.cli.tableSave(a.me.handle, a.me.secret, { id: id || null, name: name, players: P.roster(g), start: g.start, cmdLife: g.cmdLife }); }).then(function (t) {
      var s = cache(a), i = -1; s.tables.forEach(function (x, k) { if (x.id === t.id) i = k; }); if (i >= 0) s.tables[i] = t; else s.tables.unshift(t); saveShared();
      var l = toLocal(t); P.applyTable(g, l); ux.tname = ''; ux.tnew = ''; ux.delTable = ''; net.work = ''; if (then) then(l); repaint();
    }, function (e) { net.work = ''; neterr(e); toast(net.err); repaint(); });
  }
  function shareLocal(tb) {
    /* sposta il tavolo del dispositivo sul server, con le sue partite (finiscono in coda e partono da sole) */
    serverSave(null, tb ? tb.name : ux.tnew, function (l) {
      var a = cm(), k = a ? acct(a) : '';
      if (tb) { outbox(); P.forTable(history(), tb.id).forEach(function (r) { var c = JSON.parse(JSON.stringify(r)); c.table = ''; ob.push({ table: l.id, acct: k, rec: c }); });
        hist = history().filter(function (x) { return x.table !== tb.id; }); saveHistory(); tbls = tables().filter(function (x) { return x.id !== tb.id; }); saveTables(); saveOutbox(); flush().then(paintSoon); }
      toast('Tavolo «' + l.name + '» condiviso con gli amici.');
    });
  }
  function rng() { try { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; } catch (e) { return Math.random(); } }

  /* ---------- pezzi di interfaccia ---------- */
  var SV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var ICON = {
    drop: SV + '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/></svg>',
    shield: SV + '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/></svg>',
    crown: SV + '<path d="M3 18h18l-1.500-10-4.500 4-3-7-3 7-4.500-4z"/></svg>',
    more: SV + '<circle cx="5" cy="12" r="1.200"/><circle cx="12" cy="12" r="1.200"/><circle cx="19" cy="12" r="1.200"/></svg>',
    flag: SV + '<path d="M6 21V4M6 5h11l-2 4 2 4H6"/></svg>',
    people: SV + '<circle cx="9" cy="8" r="3.200"/><path d="M3 20c0-3.500 2.700-6 6-6s6 2.500 6 6"/><path d="M16 5.200a3 3 0 0 1 0 5.600M18 14.300c2 .8 3 2.700 3 5.700"/></svg>'
  };
  function seg(items, cur, act, label) {
    return '<div class="seg" role="group" aria-label="' + esc(label) + '">' + items.map(function (v) { return '<button type="button" data-a="' + act + '" data-v="' + v + '" aria-pressed="' + (v === cur) + '">' + v + '</button>'; }).join('') + '</div>';
  }
  function mmss(ms) { var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); s %= 60; return (h ? h + ':' + ('0' + m).slice(-2) : m) + ':' + ('0' + s).slice(-2); }

  /* ---------- preparazione del tavolo ---------- */
  function seatHtml(p, i) {
    var A = cm(), f = !!p.u;
    return '<div class="pe-seat' + (f ? ' fr' : '') + '" style="--seat:' + SEAT[i] + '"><span class="pe-n" aria-hidden="true">' + (i + 1) + '</span>' +
      '<input class="pe-name" data-c="pe-name" data-p="' + p.id + '" value="' + esc(p.name) + '" maxlength="24" aria-label="Nome del posto ' + (i + 1) + (f ? ' (amico)' : '') + '" autocomplete="off">' +
      (A ? '<button type="button" class="pe-pick" data-a="pe-pick" data-p="' + p.id + '" aria-haspopup="dialog" aria-pressed="' + f + '" aria-label="' + (f ? 'Cambia l’amico del posto ' : 'Siedi un amico al posto ') + (i + 1) + '">' + ICON.people + '</button>' : '') + '</div>';
  }
  function setupHtml() {
    return '<header class="vh"><h1>The Pescher</h1><p class="sub">Il compagno di partita dal vivo: vite, veleno, danno da comandante, segnalini e dadi.</p></header>' +
      '<section class="pe-setup">' + tableHtml() + '<div class="pe-opts panel">' +
      '<div class="pe-opt"><b>Giocatori</b>' + seg([2, 3, 4, 5, 6], g.players.length, 'pe-count', 'Numero di giocatori') + '</div>' +
      '<div class="pe-opt"><b>Vita iniziale</b>' + seg(P.LIVES, g.start, 'pe-start', 'Vita iniziale') + '</div>' +
      '<label class="pe-chk"><input type="checkbox" data-c="pe-cmdlife"' + (g.cmdLife ? ' checked' : '') + '> Il danno da comandante toglie anche vita</label></div>' +
      '<div class="pe-opt"><b>Nomi' + (curTable() ? ' del tavolo' : ' (se vuoi)') + '</b></div>' + (cm() ? '<p class="hint pe-fhint">Tocca l’icona amici per sedere un amico: resta lui anche se cambia ID, e un tavolo con amici si condivide.</p>' : '') +
      '<div class="pe-seats">' + g.players.map(seatHtml).join('') + '</div>' +
      '<div class="pe-go"><button type="button" class="btn primary big" data-a="pe-begin">Inizia la partita</button><span class="hint">Il primo giocatore lo decide il caso.</span></div>' + historyHtml() + '</section>';
  }
  function fmtDate(t) { var d = new Date(t); return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  /* Il tavolo: «libero» oppure uno salvato. Un tavolo salvato ricorda i nomi e tiene la sua classifica. */
  function tableHtml() {
    var ts = tables(), cur = curTable(), full = ts.length >= P.TABLES_MAX, A = cm(), all = allTables(), canShare = !!A && P.hasFriends(g);
    var chips = '<div class="pe-tchips" role="group" aria-label="Tavolo"><button type="button" class="pe-tc" data-a="pe-table" data-id="" aria-pressed="' + !cur + '">Tavolo libero</button>' +
      all.map(function (t) { return '<button type="button" class="pe-tc' + (t.shared ? ' sh' : '') + '" data-a="pe-table" data-id="' + esc(t.id) + '" aria-pressed="' + !!(cur && cur.id === t.id) + '">' + (t.shared ? ICON.people : '') + '<span>' + esc(t.name) + '</span></button>'; }).join('') + '</div>';
    var body;
    if (cur && cur.shared) {
      var armed = ux.delTable === cur.id, st = net.busy || net.work ? 'Aggiorno…' : net.err ? net.err : (sh && sh.t ? 'Aggiornato alle ' + hhmm(sh.t) : 'Non ancora aggiornato');
      var sync = '<div class="pe-sync"><span class="pe-sst' + (net.err ? ' err' : '') + '" role="status" aria-live="polite">' + esc(st) + '</span><button type="button" class="btn small" data-a="pe-sync"' + (net.busy || net.work ? ' disabled' : '') + '>Aggiorna</button></div>';
      if (cur.mine) {
        body = '<div class="pe-tedit"><input class="pe-name" data-c="pe-tname" value="' + esc(ux.tname || cur.name) + '" maxlength="30" aria-label="Nome del tavolo" autocomplete="off">' +
          '<button type="button" class="btn small" id="pe-tup" data-a="pe-tupdate"' + (sharedDirty(cur) ? '' : ' hidden') + (net.work ? ' disabled' : '') + '>Aggiorna il tavolo con questi nomi</button>' +
          '<button type="button" class="btn small' + (armed ? ' danger' : '') + '" data-a="pe-tdel"' + (net.work ? ' disabled' : '') + '>' + (armed ? 'Sicuro? Sparisce per tutti, con le partite' : 'Elimina il tavolo') + '</button></div>' +
          '<p class="pe-tnote">Tavolo <b>condiviso</b>: lo vedono gli amici seduti, con le partite e la classifica.</p>' + sync;
      } else {
        var al = ux.leave === cur.id;
        body = '<div class="pe-tedit"><span class="pe-towner">Tavolo di <b>@' + esc(cur.owner) + '</b></span><button type="button" class="btn small' + (al ? ' danger' : '') + '" data-a="pe-tleave"' + (net.work ? ' disabled' : '') + '>' + (al ? 'Sicuro? Il tuo posto resta un nome libero' : 'Lascia il tavolo') + '</button></div>' +
          '<p class="pe-tnote">Tavolo <b>condiviso</b> da @' + esc(cur.owner) + ': solo lui lo modifica, ma tutti registrano le partite.</p>' + sync;
      }
    } else if (cur) {
      var armedL = ux.delTable === cur.id;
      body = '<div class="pe-tedit"><input class="pe-name" data-c="pe-tname" value="' + esc(cur.name) + '" maxlength="30" aria-label="Nome del tavolo" autocomplete="off">' +
        '<button type="button" class="btn small" id="pe-tup" data-a="pe-tupdate"' + (P.sameTable(g, cur) ? ' hidden' : '') + '>Aggiorna il tavolo con questi nomi</button>' +
        (canShare ? '<button type="button" class="btn small primary" data-a="pe-tshare"' + (net.work ? ' disabled' : '') + '>Condividi con gli amici</button>' : '') +
        '<button type="button" class="btn small' + (armedL ? ' danger' : '') + '" data-a="pe-tdel">' + (armedL ? 'Sicuro? Sparisce con le sue partite' : 'Elimina il tavolo') + '</button></div>' +
        (net.err ? '<p class="err" role="alert">' + esc(net.err) + '</p>' : '') + (canShare ? '<p class="pe-tnote">Hai seduto degli amici: condividi il tavolo e lo vedranno anche loro, con le partite già giocate.</p>' : '');
    } else if (full && !canShare) {
      body = '<p class="hint">Hai già ' + P.TABLES_MAX + ' tavoli salvati: eliminane uno per salvarne un altro.</p>';
    } else {
      body = '<div class="pe-tedit"><input class="pe-name" data-c="pe-tnew" value="' + esc(ux.tnew) + '" maxlength="30" placeholder="Nome del tavolo (es. Il venerdì)" aria-label="Nome del nuovo tavolo" autocomplete="off">' +
        (canShare ? '<button type="button" class="btn small primary" data-a="pe-tcreate"' + (net.work ? ' disabled' : '') + '>' + (net.work ? 'Salvo…' : 'Salva e condividi con gli amici') + '</button>' : '') +
        (full ? '' : '<button type="button" class="btn small' + (canShare ? '' : ' primary') + '" data-a="pe-tsave">' + (canShare ? 'Solo su questo dispositivo' : 'Salva questo tavolo') + '</button>') + '</div>' +
        (net.err ? '<p class="err" role="alert">' + esc(net.err) + '</p>' : '') +
        '<p class="hint">Giochi spesso con le stesse persone? Salva il tavolo: avrà la sua classifica, con le vittorie di ognuno e il mazzo con cui vincono.' + (A && !canShare ? ' Con un amico seduto (icona amici accanto al nome) puoi anche condividerlo.' : '') + '</p>';
    }
    return '<div class="pe-tbl panel"><b class="pe-tt">Tavolo</b>' + chips + body + '</div>';
  }
  /* il tavolo condiviso ha modifiche non ancora mandate al server? */
  function sharedDirty(cur) { return !P.sameTable(g, cur) || (!!ux.tname && ux.tname !== cur.name); }
  function fmtDate(t) { var d = new Date(t); return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function gamesHtml(h, n) {
    return '<ol class="pe-games">' + h.slice(0, n).map(function (r) {
      var armed = ux.delGame === r.id;
      return '<li><div><b>' + (r.winner ? 'Vince ' + esc(r.winner) : 'Nessun vincitore') + '</b>' + (r.deck ? '<span class="dk">' + esc(r.deck) + '</span>' : '') + (r.pending ? '<span class="pe-pend">in invio</span>' : '') + '<small>' + fmtDate(r.t) + ' · ' + r.players.map(function (p) { return esc(p.name); }).join(', ') + ' · ' + r.rounds + (r.rounds === 1 ? ' giro' : ' giri') + ' · ' + mmss(r.ms) + '</small></div>' +
        '<button type="button" class="btn small' + (armed ? ' danger' : '') + '" data-a="pe-delgame" data-id="' + esc(r.id) + '" aria-label="Elimina la partita del ' + fmtDate(r.t) + '">' + (armed ? 'Sicuro?' : 'Elimina') + '</button></li>';
    }).join('') + '</ol>' + (h.length > n ? '<p class="hint">Mostro le ultime ' + n + ' di ' + h.length + '.</p>' : '');
  }
  function historyHtml() {
    var cur = curTable(), sharedT = !!(cur && cur.shared), h = sharedT ? sharedGames(cur) : P.forTable(history(), cur ? cur.id : '');
    if (!cur) {
      if (!h.length) return '';
      return '<section class="pe-hsec"><h2 class="sect">Partite senza tavolo</h2>' + gamesHtml(h, 5) + '<p class="hint">Queste non fanno classifica: salva il tavolo per contare le vittorie di chi gioca sempre insieme. Sta tutto su questo dispositivo.</p></section>';
    }
    if (!h.length) return '<section class="pe-hsec"><h2 class="sect">Classifica · ' + esc(cur.name) + '</h2><p class="an-none">Ancora nessuna partita: la classifica parte quando finisci la prima.</p></section>';
    var tl = P.tally(h);
    var board = '<ol class="pe-board">' + tl.slice(0, 10).map(function (x, i) {
      return '<li><span class="rk">' + (i + 1) + '</span><b>' + esc(x.name) + '</b><span class="sc">' + plural(x.wins, 'vittoria', 'vittorie') + ' su ' + x.games + '</span>' + (x.deck ? '<small>vince di più con ' + esc(x.deck) + '</small>' : '') + '</li>';
    }).join('') + '</ol>';
    return '<section class="pe-hsec"><h2 class="sect">Classifica · ' + esc(cur.name) + '</h2>' + board + '<h2 class="sect">Ultime partite del tavolo</h2>' + gamesHtml(h, 8) + '<p class="hint">' + (sharedT ? 'Partite e classifica sono condivise con chi siede al tavolo: chi gioca le aggiunge, chiunque può eliminarle.' : 'Sta tutta su questo dispositivo.') + '</p></section>';
  }
  function plural(n, a, b) { return n + ' ' + (n === 1 ? a : b); }

  /* ---------- partita ---------- */
  function deltaOf(id) { var d = ux.delta[id]; return d && Date.now() - d.t < 2400 && d.v ? d.v : 0; }
  function tileHtml(p, i) {
    var st = P.status(g, p), w = P.winner(g), isTurn = g.turn === i && !w;
    var maxC = 0; Object.keys(p.cmd).forEach(function (k) { if (p.cmd[k] > maxC) maxC = p.cmd[k]; });
    var open = ux.open[p.id] || '', flip = g.mirror && i < Math.floor(g.players.length / 2), dl = deltaOf(p.id);
    var extras = (p.exp ? 1 : 0) + (p.eng ? 1 : 0) + (p.tax ? 1 : 0) + (g.monarch === p.id ? 1 : 0) + (g.initiative === p.id ? 1 : 0);
    var life = '<div class="pe-life"><button type="button" class="pe-lb minus" data-a="pe-life" data-p="' + p.id + '" data-d="-1" aria-label="Togli 1 vita a ' + esc(p.name) + '">−</button>' +
      '<button type="button" class="pe-lv' + (p.life <= 10 ? ' low' : '') + '" data-a="pe-set" data-p="' + p.id + '" aria-label="Vita di ' + esc(p.name) + ': ' + p.life + '. Tocca per impostare un valore.">' + p.life + '</button>' +
      '<button type="button" class="pe-lb plus" data-a="pe-life" data-p="' + p.id + '" data-d="1" aria-label="Aggiungi 1 vita a ' + esc(p.name) + '">+</button>' +
      (dl ? '<span class="pe-delta ' + (dl > 0 ? 'up' : 'down') + '" aria-hidden="true">' + (dl > 0 ? '+' : '−') + Math.abs(dl) + '</span>' : '') + '</div>' +
      '<div class="pe-fast"><button type="button" data-a="pe-life" data-p="' + p.id + '" data-d="-5" aria-label="Togli 5 vita a ' + esc(p.name) + '">−5</button><button type="button" data-a="pe-life" data-p="' + p.id + '" data-d="5" aria-label="Aggiungi 5 vita a ' + esc(p.name) + '">+5</button></div>';
    var chips = '<div class="pe-chips">' +
      chip(p, 'poison', ICON.drop, 'Veleno', p.poison, p.poison >= P.POISON_OUT ? 'bad' : p.poison ? 'on' : '', open) +
      chip(p, 'cmd', ICON.shield, 'Comandante', maxC, maxC >= P.CMD_OUT ? 'bad' : maxC ? 'on' : '', open) +
      chip(p, 'more', ICON.more, 'Altro', extras || '', extras ? 'on' : '', open) + '</div>';
    var panel = '';
    if (open === 'poison') {
      panel = '<div class="pe-panel"><div class="pe-row"><span class="pe-from">Segnalini veleno <small>' + P.POISON_OUT + ' = fuori</small></span>' + step(p, 'pe-poison', '', p.poison, P.POISON_OUT) + '</div></div>';
    } else if (open === 'cmd') {
      panel = '<div class="pe-panel">' + g.players.filter(function (o) { return o.id !== p.id; }).map(function (o) {
        var oi = g.players.indexOf(o), n = p.cmd[o.id] || 0;
        return '<div class="pe-row"><span class="pe-from"><i style="background:' + SEAT[oi] + '"></i>da ' + esc(o.name) + '<small>' + P.CMD_OUT + ' = fuori</small></span>' + step(p, 'pe-cmd', o.id, n, P.CMD_OUT) + '</div>';
      }).join('') + '</div>';
    } else if (open === 'more') {
      panel = '<div class="pe-panel">' +
        '<div class="pe-row"><span class="pe-from">Esperienza</span>' + step(p, 'pe-ctr', 'exp', p.exp, 0) + '</div>' +
        '<div class="pe-row"><span class="pe-from">Energia</span>' + step(p, 'pe-ctr', 'eng', p.eng, 0) + '</div>' +
        '<div class="pe-row"><span class="pe-from">Lanci del comandante<small>' + (p.tax ? 'costa +' + P.taxOf(p) : 'ogni lancio costa 2 in più') + '</small></span>' + step(p, 'pe-ctr', 'tax', p.tax, 0) + '</div>' +
        '<div class="pe-holds"><button type="button" class="pe-hold" data-a="pe-hold" data-p="' + p.id + '" data-k="monarch" aria-pressed="' + (g.monarch === p.id) + '">' + ICON.crown + 'Monarca</button>' +
        '<button type="button" class="pe-hold" data-a="pe-hold" data-p="' + p.id + '" data-k="initiative" aria-pressed="' + (g.initiative === p.id) + '">' + ICON.flag + 'Iniziativa</button></div></div>';
    }
    var tags = '';
    if (g.monarch === p.id) tags += '<span class="pe-tk" title="Monarca">' + ICON.crown + '<span>Monarca</span></span>';
    if (g.initiative === p.id) tags += '<span class="pe-tk" title="Iniziativa">' + ICON.flag + '<span>Iniziativa</span></span>';
    var ctrs = (p.exp ? '<span class="pe-mini" title="Esperienza">Esp ' + p.exp + '</span>' : '') + (p.eng ? '<span class="pe-mini" title="Energia">En ' + p.eng + '</span>' : '') + (p.tax ? '<span class="pe-mini" title="Lanci del comandante">+' + P.taxOf(p) + '</span>' : '');
    return '<article class="pe-tile' + (isTurn ? ' turn' : '') + (st.out ? ' out' : '') + (open ? ' open' : '') + (w && w.id === p.id ? ' won' : '') + (flip ? ' flip' : '') + '" data-p="' + p.id + '" style="--seat:' + SEAT[i] + '">' +
      '<header><b class="pe-nm">' + esc(p.name) + '</b>' + tags + ctrs + (isTurn ? '<span class="pe-t">Turno</span>' : '') + (w && w.id === p.id ? '<span class="pe-t win">Vince</span>' : '') + '</header>' +
      life + chips + panel +
      (st.out ? '<div class="pe-out" role="status"><b>Fuori</b><span>' + esc(st.why.map(function (x) { return x.text; }).join(' · ')) + '</span></div>' : '') + '</article>';
  }
  function chip(p, k, icon, label, val, cls, open) {
    return '<button type="button" class="pe-chip' + (cls ? ' ' + cls : '') + '" data-a="pe-tog" data-p="' + p.id + '" data-k="' + k + '" aria-expanded="' + (open === k) + '" aria-label="' + label + (val !== '' ? ': ' + val : '') + '">' + icon + '<span>' + label + '</span>' + (val !== '' ? '<b>' + val + '</b>' : '') + '</button>';
  }
  function step(p, act, from, n, max) {
    var a = ' data-a="' + act + '" data-p="' + p.id + '"' + (from ? ' data-from="' + from + '" data-k="' + from + '"' : '');
    return '<div class="pe-step"><button type="button"' + a + ' data-d="-1" aria-label="Meno">−</button><output class="' + (max && n >= max ? 'bad' : '') + '">' + n + (max ? '<small>/' + max + '</small>' : '') + '</output><button type="button"' + a + ' data-d="1" aria-label="Più">+</button></div>';
  }
  function playHtml() {
    var w = P.winner(g), cur = g.turn >= 0 ? g.players[g.turn] : null;
    var head = w ? '<div class="pe-turn won"><b>Ha vinto ' + esc(w.name) + '!</b></div>' :
      '<div class="pe-turn">' + (cur ? 'Turno di <b>' + esc(cur.name) + '</b>' : '<b>Partita in corso</b>') + '<span class="pe-meta"><span>Giro ' + g.round + '</span><time class="pe-clock">' + mmss(Date.now() - g.t) + '</time></span></div>';
    var bar = '<div class="pe-bar">' + head + '<div class="pe-tools">' +
      (cur && !w ? '<button type="button" class="btn small primary" data-a="pe-next">Passa il turno</button>' : '') +
      '<button type="button" class="btn small" data-a="pe-dice">Dadi</button>' +
      '<button type="button" class="btn small" data-a="pe-undo"' + (g.hist.length ? '' : ' disabled') + '>Annulla</button>' +
      '<button type="button" class="btn small' + (w ? ' primary' : '') + '" data-a="pe-end" aria-haspopup="dialog">Fine partita</button>' +
      '<button type="button" class="btn small" data-a="pe-menu" aria-haspopup="dialog">Menu</button></div></div>';
    return bar + '<div class="pe-grid" data-n="' + g.players.length + '">' + g.players.map(tileHtml).join('') + '</div>';
  }
  function inner() { ensure(); return g.started ? playHtml() : setupHtml(); }
  function html() { return '<div class="pe" id="pe">' + inner() + '</div>'; }

  /* ---------- ridisegno mirato ---------- */
  function focusKey() {
    var a = document.activeElement; if (!a || !a.closest || !a.closest('#pe')) return null;
    var attrs = ['data-a', 'data-c', 'data-p', 'data-d', 'data-k', 'data-v', 'data-from'], sel = a.tagName.toLowerCase();
    attrs.forEach(function (n) { if (a.hasAttribute(n)) sel += '[' + n + '="' + a.getAttribute(n) + '"]'; });
    return sel;
  }
  function repaint() {
    var el = document.getElementById('pe'); if (!el) return;
    var k = focusKey(); el.innerHTML = inner(); document.body.classList.toggle('pe-play', !!g.started);
    if (k) { try { var n = el.querySelector(k); if (n && !n.disabled) n.focus({ preventScroll: true }); } catch (e) { /* selettore non valido: pazienza */ } }
    save(); syncWake(); syncClock();
  }
  /* il cronometro e le bolle del «+3» si aggiornano da soli, senza ridisegnare tutto il tavolo */
  function syncClock() {
    if (g && g.started && document.getElementById('pe')) {
      if (!clockT) clockT = setInterval(function () { var c = document.querySelector('#pe .pe-clock'); if (c) c.textContent = mmss(Date.now() - g.t); else { clearInterval(clockT); clockT = 0; } }, 1000);
    } else if (clockT) { clearInterval(clockT); clockT = 0; }
  }
  function bubbleLater() { clearTimeout(deltaT); deltaT = setTimeout(function () { if (document.getElementById('pe') && g.started) repaint(); }, 2500); }
  /* ogni cambio di vita mostra per un attimo di quanto è cambiata (somma dei tocchi ravvicinati) */
  function track(id, fn) {
    var p = P.player(g, id); if (!p) return false;
    var before = p.life, done = fn(); if (!done) return false;
    var d = p.life - before, cur = ux.delta[id];
    ux.delta[id] = { v: (cur && Date.now() - cur.t < 2400 ? cur.v : 0) + d, t: Date.now() }; bubbleLater(); return true;
  }

  /* schermo acceso mentre si gioca */
  function syncWake() {
    if (!(g && g.started) || !navigator.wakeLock || wake) return;
    try { navigator.wakeLock.request('screen').then(function (l) { wake = l; l.addEventListener('release', function () { wake = null; }); }, function () { /* non concesso */ }); } catch (e) { /* non supportato */ }
  }
  function unwake() { try { if (wake) wake.release(); } catch (e) { /* già rilasciato */ } wake = null; }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && document.getElementById('pe')) syncWake(); });

  function after() { kick(); document.body.classList.toggle('pe-play', !!(g && g.started)); document.body.classList.toggle('pe-focus', !!(g && g.focus && g.started)); syncWake(); syncClock(); }
  function idle() { closePop(); unwake(); if (clockT) { clearInterval(clockT); clockT = 0; } clearTimeout(deltaT); document.body.classList.remove('pe-play', 'pe-focus'); }

  /* ---------- pop-up: dadi, registro, menu, valore esatto ---------- */
  var pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; } ux.pop = ''; ux.confirm = ''; ux.setFor = ''; }
  function head(small, title) { return '<div class="an-head"><div><small>' + small + '</small><strong>' + title + '</strong></div><button type="button" class="btn small" data-a="pe-close" id="pex">Chiudi</button></div>'; }
  function popBody() {
    if (ux.pop === 'dice') {
      var last = ux.rolls[0];
      return head('Il caso decide', 'Dadi') +
        '<div class="pe-dice">' + P.DICE.map(function (d) { return '<button type="button" class="btn" data-a="pe-roll" data-k="' + d + '">' + d.toUpperCase() + '</button>'; }).join('') +
        '<button type="button" class="btn" data-a="pe-roll" data-k="coin">Moneta</button><button type="button" class="btn pe-first" data-a="pe-first">Chi inizia?</button></div>' +
        '<div class="pe-res' + (last ? ' has' : '') + '" role="status" aria-live="polite">' + (last ? '<small>' + esc(last.label) + '</small><b>' + esc(String(last.value)) + '</b>' : '<span>Scegli un dado.</span>') + '</div>' +
        (ux.rolls.length > 1 ? '<ol class="pe-hist" aria-label="Lanci precedenti">' + ux.rolls.slice(1, 7).map(function (r) { return '<li>' + esc(r.label) + ': <b>' + esc(String(r.value)) + '</b></li>'; }).join('') + '</ol>' : '');
    }
    if (ux.pop === 'log') {
      return head('Cosa è successo', 'Registro') +
        (g.log.length ? '<ol class="pe-log">' + g.log.map(function (l) { var d = new Date(l.t); return '<li><time>' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2) + '</time><span>' + esc(l.text) + '</span></li>'; }).join('') + '</ol>' : '<p class="an-none">Ancora niente: tocca una vita per iniziare.</p>') +
        '<div class="pe-popbar"><button type="button" class="btn" data-a="pe-undo"' + (g.hist.length ? '' : ' disabled') + '>Annulla l’ultimo</button></div>';
    }
    if (ux.pop === 'end') {
      var e = ux.end, ct = curTable(), decks = {}; H.decks().forEach(function (d) { if (d.kind === 'deck' && d.active) decks[d.name] = 1; }); history().forEach(function (x) { if (x.deck) decks[x.deck] = 1; });
      return head('Fine partita', 'Chi ha vinto?') +
        '<div class="pe-win" role="radiogroup" aria-label="Vincitore">' + g.players.map(function (p, i) {
          var out = P.status(g, p).out;
          return '<button type="button" class="pe-wb" role="radio" aria-checked="' + (e.winner === p.id) + '" data-a="pe-winner" data-p="' + p.id + '" style="--seat:' + SEAT[i] + '"><i></i><b>' + esc(p.name) + '</b><small>' + (out ? 'fuori' : 'vita ' + p.life) + '</small></button>';
        }).join('') + '<button type="button" class="pe-wb none" role="radio" aria-checked="' + (e.winner === '') + '" data-a="pe-winner" data-p=""><b>Nessuno</b><small>pareggio o partita interrotta</small></button></div>' +
        (e.winner ? '<label class="pe-wd"><span>Mazzo giocato da ' + esc(P.player(g, e.winner).name) + ' <small>(se vuoi)</small></span><input id="pe-wdeck" class="pe-name" type="text" list="pe-decks" maxlength="60" value="' + esc(e.deck) + '" placeholder="Es. Kaalia, Atraxa…" autocomplete="off"></label>' +
          '<datalist id="pe-decks">' + Object.keys(decks).map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>' : '') +
        (ct ? '<p class="pe-tnote">Si conta nella classifica di <b>' + esc(ct.name) + '</b>' + (ct.shared ? ' (condivisa con gli amici)' : '') + '.</p>' :
          (tables().length < P.TABLES_MAX ? '<div class="pe-esave"><label class="pe-chk"><input type="checkbox" data-c="pe-esave"' + (e.save ? ' checked' : '') + '> Salva questo tavolo per tenere la classifica</label>' +
            (e.save ? '<input id="pe-esname" class="pe-name" type="text" maxlength="30" value="' + esc(e.tname) + '" placeholder="Nome del tavolo (es. Il venerdì)" aria-label="Nome del tavolo" autocomplete="off">' : '') + '</div>' :
            '<p class="hint">Hai già ' + P.TABLES_MAX + ' tavoli salvati: la partita resta tra quelle senza tavolo.</p>')) +
        '<div class="pe-popbar"><button type="button" class="btn primary" data-a="pe-endok">Salva la partita</button></div>' +
        '<p class="hint">La partita finisce e si salva su questo dispositivo. Il tavolo resta com\u2019è per la prossima.</p>';
    }
    if (ux.pop === 'pick') {
      var A = cm(), cs = P.player(g, ux.pick), si = g.players.indexOf(cs);
      var taken = function (u) { return !!u && g.players.some(function (o) { return o !== cs && o.u === u; }); };
      var row = function (u, h, url, mark) {
        return '<button type="button" class="pe-pf" data-a="pe-pickf" data-u="' + esc(u) + '" data-h="' + esc(h) + '" aria-pressed="' + !!(cs && u && cs.u === u) + '"' + (taken(u) ? ' disabled' : '') + '>' +
          (url ? '<img class="cm-av" src="' + esc(url) + '" alt="" referrerpolicy="no-referrer" loading="lazy">' : '<span class="cm-av ph" aria-hidden="true">' + esc(h.charAt(0).toUpperCase()) + '</span>') +
          '<b>@' + esc(h) + '</b><small>' + (taken(u) ? 'già seduto' : mark) + '</small></button>';
      };
      var lst;
      if (!A) lst = '<p class="an-none">Serve il tuo Codighel ID (pagina Dati).</p>';
      else if (ux.perr) lst = '<p class="err" role="alert">' + esc(ux.perr) + '</p>';
      else if (!A.friends || !A.me.id) lst = '<p class="an-none">Carico gli amici…</p>';
      else lst = '<div class="pe-pfs">' + row(A.me.id, A.me.handle, A.me.avatar && A.me.avatar.url, 'io') + A.friends.map(function (f) { return row(f.id, f.handle, f.avatar_url, 'amico'); }).join('') + '</div>' +
        (A.friends.length ? '' : '<p class="hint">Non hai ancora amici: aggiungili dalla pagina Dati, con il loro ID o con il tuo link.</p>');
      return head('Posto ' + (si + 1), 'Chi si siede qui?') + lst + '<div class="pe-popbar"><button type="button" class="btn" data-a="pe-pickf" data-u="" data-h="">Nome libero' + (cs && cs.u ? ' (togli l’amico)' : '') + '</button></div>';
    }
    if (ux.pop === 'set') {
      var p = P.player(g, ux.setFor);
      return head('Vita di ' + esc(p ? p.name : ''), 'Imposta un valore') +
        '<div class="pe-setrow"><input id="pe-setv" class="pe-name pe-setin" type="text" inputmode="numeric" pattern="-?[0-9]*" value="' + (p ? p.life : '') + '" aria-label="Nuova vita" autocomplete="off"><button type="button" class="btn primary" data-a="pe-setok">Imposta</button></div>' +
        '<p class="hint">Per correggere un errore o ripartire da un numero diverso. Si può annullare.</p>';
    }
    if (ux.pop === 'menu') {
      var c = ux.confirm;
      return head('The Pescher', 'Menu') +
        '<div class="pe-menu"><label class="pe-chk"><input type="checkbox" data-c="pe-cmdlife"' + (g.cmdLife ? ' checked' : '') + '> Il danno da comandante toglie anche vita</label>' +
        '<label class="pe-chk"><input type="checkbox" data-c="pe-mirror"' + (g.mirror ? ' checked' : '') + '> Gira i giocatori in alto (telefono al centro del tavolo)</label>' +
        '<label class="pe-chk"><input type="checkbox" data-c="pe-focus"' + (g.focus ? ' checked' : '') + '> Modalità focus: nasconde il resto dell’app</label>' +
        '<div class="pe-popbar"><button type="button" class="btn" data-a="pe-log">Apri il registro</button></div>' +
        '<div class="pe-popbar"><button type="button" class="btn' + (c === 'again' ? ' danger' : '') + '" data-a="pe-again">' + (c === 'again' ? 'Sicuro? Tocca di nuovo' : 'Nuova partita (stesso tavolo)') + '</button>' +
        '<button type="button" class="btn' + (c === 'setup' ? ' danger' : '') + '" data-a="pe-setup">' + (c === 'setup' ? 'Sicuro? Tocca di nuovo' : 'Cambia tavolo') + '</button></div></div>';
    }
    return '';
  }
  function openPop(kind) {
    ux.pop = kind; ux.confirm = '';
    if (!pop) {
      pop = document.createElement('div'); pop.id = 'pe-pop'; pop.className = 'lb bk an pe-pop'; pop.setAttribute('data-a', 'pe-close'); pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true');
      pop.setAttribute('aria-label', { dice: 'Dadi', log: 'Registro', menu: 'Menu', set: 'Imposta la vita', pick: 'Scegli un amico', end: 'Fine partita' }[kind] || 'The Pescher'); document.body.appendChild(pop);
    }
    paintPop(true);
  }
  function paintPop(focus) {
    if (!pop) return;
    pop.innerHTML = '<div class="an-box pe-box" data-a="pe-keep">' + popBody() + '</div>';
    if (focus) { var x = pop.querySelector('#pe-setv') || pop.querySelector('.pe-wb[aria-checked="true"]') || pop.querySelector('#pex'); if (x) { x.focus(); if (x.select) x.select(); } }
  }

  /* prima di ridisegnare il pop-up di fine partita si tiene quel che è stato scritto */
  function grabEnd() {
    if (!pop || !ux.end) return;
    var d = pop.querySelector('#pe-wdeck'), n = pop.querySelector('#pe-esname'); if (d) ux.end.deck = d.value; if (n) ux.end.tname = n.value;
  }

  /* ---------- azioni ---------- */
  function toast(m) { if (H.toast) H.toast(m); }

  function click(a, el) {
    var id = el.dataset.p, d = parseInt(el.dataset.d, 10), v = el.dataset.v;
    ensure();
    switch (a) {
      case 'pe-count': P.resize(g, parseInt(v, 10)); repaint(); break;
      case 'pe-start': P.setStart(g, parseInt(v, 10)); repaint(); break;
      case 'pe-begin': { var f = P.begin(g, rng); ux.open = {}; ux.rolls = []; ux.delta = {}; repaint(); toast('Inizia ' + f.name + '.'); break; }
      case 'pe-life': track(id, function () { return P.life(g, id, d); }); repaint(); break;
      case 'pe-poison': P.poison(g, id, d); repaint(); break;
      case 'pe-cmd': track(id, function () { return P.cmd(g, id, el.dataset.from, d); }); repaint(); break;
      case 'pe-ctr': P.counter(g, id, el.dataset.k, d); repaint(); break;
      case 'pe-hold': P.holder(g, el.dataset.k, id); repaint(); break;
      case 'pe-tog': ux.open[id] = ux.open[id] === el.dataset.k ? '' : el.dataset.k; repaint(); break;
      case 'pe-set': ux.setFor = id; openPop('set'); break;
      case 'pe-end': { var aw = P.winner(g); ux.end = { winner: aw ? aw.id : '', deck: '', save: false, tname: '' }; openPop('end'); break; }
      case 'pe-winner': { grabEnd(); ux.end.winner = id || ''; if (!ux.end.winner) ux.end.deck = ''; paintPop(); var sel = pop && pop.querySelector('.pe-wb[aria-checked="true"]'); if (sel) sel.focus(); break; }
      case 'pe-endok': {
        grabEnd();
        var made = null, ctn = curTable();
        if (ctn && ctn.shared) {
          var srec = P.finish(g, ux.end.winner, ux.end.deck); srec.table = ''; var sa = cm();
          if (sa) { outbox().push({ table: ctn.id, acct: acct(sa), rec: srec }); saveOutbox(); flush().then(paintSoon); }
          closePop(); g.started = false; g.focus = false; P.reset(g); g.started = false; ux.open = {}; ux.delta = {}; ux.end = null; after(); repaint();
          toast((srec.winner ? 'Partita salvata: ha vinto ' + srec.winner + '. ' : 'Partita salvata. ') + 'La mando agli amici del tavolo.'); break;
        }
        if (!curTable() && ux.end.save && tables().length < P.TABLES_MAX) { made = P.makeTable(g, ux.end.tname); tables().unshift(made); saveTables(); g.table = made.id; }
        var rec = P.finish(g, ux.end.winner, ux.end.deck);
        history().unshift(rec); if (hist.length > P.HISTORY_MAX) hist.length = P.HISTORY_MAX; saveHistory();
        closePop(); g.started = false; g.focus = false; P.reset(g); g.started = false; ux.open = {}; ux.delta = {}; ux.end = null; after(); repaint();
        toast((made ? 'Tavolo «' + made.name + '» salvato. ' : '') + (rec.winner ? 'Partita salvata: ha vinto ' + rec.winner + '.' : 'Partita salvata.')); break;
      }
      case 'pe-table': { var tb = !el.dataset.id ? null : allTables().filter(function (x) { return x.id === el.dataset.id; })[0]; ux.delTable = ''; ux.leave = ''; ux.tname = ''; ux.delGame = ''; net.err = ''; if (tb) P.applyTable(g, tb); else g.table = ''; repaint(); if (tb && tb.shared) loadGames(tb.id).then(paintSoon); break; }
      case 'pe-tsave': {
        if (curTable() || tables().length >= P.TABLES_MAX) break;
        var nt = P.makeTable(g, ux.tnew); tables().unshift(nt); saveTables(); g.table = nt.id; ux.tnew = ''; repaint(); toast('Tavolo «' + nt.name + '» salvato.'); break;
      }
      case 'pe-tcreate': { if (!cm() || !P.hasFriends(g)) break; serverSave(null, ux.tnew, function (l) { toast('Tavolo «' + l.name + '» condiviso con gli amici.'); }); break; }
      case 'pe-tshare': { var lt = curTable(); if (!lt || lt.shared || !cm() || !P.hasFriends(g)) break; shareLocal(lt); break; }
      case 'pe-sync': refresh(true); break;
      case 'pe-pick': { if (!cm()) break; ux.pick = id; ux.perr = ''; openPop('pick'); var pa = cm(); if (pa && (!pa.friends || !pa.me.id)) pa.ready().then(function () { if (ux.pop === 'pick') paintPop(); }, function (e) { ux.perr = C.messageOf(e); if (ux.pop === 'pick') paintPop(); }); break; }
      case 'pe-pickf': { var su = el.dataset.u || '', okp = P.seatUser(g, ux.pick, su, el.dataset.h || ''); closePop(); repaint(); if (!okp) toast('Questo amico è già seduto.'); break; }
      case 'pe-tleave': {
        var lv = curTable(); if (!lv || !lv.shared || lv.mine || net.work) break;
        if (ux.leave !== lv.id) { ux.leave = lv.id; repaint(); break; }
        ux.leave = ''; var la = cm(); if (!la) break; net.work = 'leave'; la.cli.tableLeave(la.me.handle, la.me.secret, lv.id).then(function () {
          var ls = cache(la); ls.tables = ls.tables.filter(function (x) { return x.id !== lv.id; }); delete ls.games[lv.id]; saveShared(); ob = outbox().filter(function (e) { return e.table !== lv.id; }); saveOutbox(); g.table = ''; net.work = ''; repaint(); toast('Hai lasciato il tavolo.');
        }, function (e) { net.work = ''; neterr(e); toast(net.err); repaint(); }); break;
      }
      case 'pe-tupdate': { var ut = curTable(); if (!ut) break; if (ut.shared) { if (ut.mine) serverSave(ut.id, ux.tname || ut.name, function () { toast('Tavolo aggiornato per tutti.'); }); break; } var nn = P.makeTable(g, ut.name); ut.players = nn.players; ut.start = nn.start; ut.cmdLife = nn.cmdLife; saveTables(); repaint(); toast('Tavolo aggiornato.'); break; }
      case 'pe-tdel': {
        var dt = curTable(); if (!dt) break;
        if (ux.delTable !== dt.id) { ux.delTable = dt.id; repaint(); break; }
        if (dt.shared) {
          var da = cm(); if (!da || !dt.mine || net.work) break; ux.delTable = ''; net.work = 'del';
          da.cli.tableDelete(da.me.handle, da.me.secret, dt.id).then(function () {
            var ds = cache(da); ds.tables = ds.tables.filter(function (x) { return x.id !== dt.id; }); delete ds.games[dt.id]; saveShared(); ob = outbox().filter(function (e) { return e.table !== dt.id; }); saveOutbox(); g.table = ''; net.work = ''; repaint(); toast('Tavolo eliminato per tutti.');
          }, function (e) { net.work = ''; neterr(e); toast(net.err); repaint(); }); break;
        }
        ux.delTable = ''; tbls = tables().filter(function (x) { return x.id !== dt.id; }); saveTables();
        hist = history().filter(function (x) { return x.table !== dt.id; }); saveHistory(); g.table = ''; repaint(); toast('Tavolo eliminato.'); break;
      }
      case 'pe-delgame': {
        var gid = el.dataset.id; if (ux.delGame !== gid) { ux.delGame = gid; repaint(); break; }
        ux.delGame = '';
        var sc = curTable();
        if (sc && sc.shared) {
          var dga = cm(); if (!dga) break;
          if (outbox().some(function (e) { return e.rec.id === gid; })) { ob = outbox().filter(function (e) { return e.rec.id !== gid; }); saveOutbox(); repaint(); toast('Partita eliminata.'); break; }
          dga.cli.gameDelete(dga.me.handle, dga.me.secret, sc.id, gid).then(function () { var gs = cache(dga); gs.games[sc.id] = (gs.games[sc.id] || []).filter(function (x) { return x.id !== gid; }); saveShared(); paintSoon(); toast('Partita eliminata per tutti.'); },
            function (e) { neterr(e); toast(net.err); paintSoon(); }); break;
        }
        hist = history().filter(function (x) { return x.id !== gid; }); saveHistory(); repaint(); toast('Partita eliminata.'); break;
      }
      case 'pe-setok': { var inp = pop && pop.querySelector('#pe-setv'), n = inp ? parseInt(inp.value, 10) : NaN, sid = ux.setFor; closePop(); if (n === n) { track(sid, function () { return P.setLife(g, sid, n); }); repaint(); } break; }
      case 'pe-next': { var nx = P.nextTurn(g); repaint(); if (nx) toast('Tocca a ' + nx.name + '.'); break; }
      case 'pe-undo': if (P.undo(g)) { ux.delta = {}; repaint(); if (pop) paintPop(); } break;
      case 'pe-dice': openPop('dice'); break;
      case 'pe-log': openPop('log'); break;
      case 'pe-menu': openPop('menu'); break;
      case 'pe-roll': { var rr = P.roll(el.dataset.k, rng); if (rr) { ux.rolls.unshift({ label: rr.kind === 'coin' ? 'Moneta' : rr.kind.toUpperCase(), value: rr.value }); ux.rolls.length = Math.min(ux.rolls.length, 12); } paintPop(); var rs = pop && pop.querySelector('.pe-res'); if (rs) { rs.classList.remove('pop'); void rs.offsetWidth; rs.classList.add('pop'); } break; }
      case 'pe-first': { var pf = P.pickFirst(g, rng); ux.rolls.unshift({ label: 'Chi inizia', value: pf.player.name }); paintPop(); break; }
      case 'pe-close': closePop(); break;
      case 'pe-keep': break;
      case 'pe-again':
        if (ux.confirm !== 'again') { ux.confirm = 'again'; paintPop(); break; }
        closePop(); ux.open = {}; ux.delta = {}; P.begin(g, rng); repaint(); toast('Nuova partita.'); break;
      case 'pe-setup':
        if (ux.confirm !== 'setup') { ux.confirm = 'setup'; paintPop(); break; }
        closePop(); g.started = false; g.focus = false; P.reset(g); g.started = false; ux.open = {}; ux.delta = {}; after(); repaint(); break;
    }
  }
  /* il pulsante «Aggiorna il tavolo» compare solo se i posti (o il nome) sono cambiati */
  function syncUp() {
    var ct = curTable(), up = document.getElementById('pe-tup'); if (!ct || !up) return;
    up.hidden = ct.shared ? !sharedDirty(ct) : P.sameTable(g, ct);
  }
  function input(c, t) {
    ensure();
    if (c === 'pe-name') {
      P.rename(g, t.dataset.p, t.value); save();
      syncUp();
      var sb = document.querySelector('#pe .pe-seat input[data-p="' + t.dataset.p + '"]'); if (sb && sb.parentNode) sb.parentNode.classList.toggle('fr', !!(P.player(g, t.dataset.p) || {}).u);
    } else if (c === 'pe-tnew') ux.tnew = t.value;
    else if (c === 'pe-tname') {
      var tb = curTable(), nm = String(t.value || '').replace(/\s+/g, ' ').trim().slice(0, 30);
      if (tb && tb.shared) { ux.tname = nm; syncUp(); }
      else if (tb && nm) { tb.name = nm; saveTables(); var chip = document.querySelector('#pe .pe-tc[data-id="' + tb.id + '"]'); if (chip) { var cs = chip.querySelector('span'); (cs || chip).textContent = nm; } }
    }
  }
  function change(c, t) {
    ensure();
    switch (c) {
      case 'pe-cmdlife': g.cmdLife = t.checked; save(); syncUp(); break;
      case 'pe-esave': grabEnd(); if (ux.end) ux.end.save = t.checked; paintPop(); { var ni = pop && pop.querySelector('#pe-esname'); if (ni) ni.focus(); else { var cb = pop && pop.querySelector('[data-c="pe-esave"]'); if (cb) cb.focus(); } } break;
      case 'pe-mirror': g.mirror = t.checked; repaint(); break;
      case 'pe-focus':
        g.focus = t.checked; after(); save();
        try { if (g.focus && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(function () { /* niente schermo intero */ }); else if (!g.focus && document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* idem */ }
        break;
    }
  }
  /* Invio nel campo «imposta vita» */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'pe-setv') { e.preventDefault(); var b = pop && pop.querySelector('[data-a="pe-setok"]'); if (b) click('pe-setok', b); }
  });
  /* Esc: chiude il pop-up, poi esce dal focus. Restituisce true se ha fatto qualcosa. */
  function escape() {
    if (pop) { closePop(); return true; }
    if (g && g.focus && document.getElementById('pe')) { g.focus = false; after(); save(); try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* idem */ } return true; }
    return false;
  }
  function isOpen() { return !!pop; }

  window.CPAPescherUI = { html: html, after: after, idle: idle, click: click, input: input, change: change, escape: escape, isOpen: isOpen, state: function () { return ensure(); } };
})();
