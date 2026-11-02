/* Coglio Proxy Archive - The Pescher: la schermata di gioco.
 * Logica in pescher.js; qui ci sono solo il tavolo, i pop-up e il salvataggio della partita (localStorage, sul dispositivo).
 * Ridisegna solo il proprio contenitore (#pe), così un tocco sulla vita non rifà tutta l'app e non perde il fuoco della tastiera. */
(function () {
  'use strict';
  var H = window.CPAHost, P = window.CPAPescher;
  if (!H || !P) return;
  var esc = H.esc, KEY = 'cpa:pescher:v1';
  var g = null, wake = null;
  var ux = { open: {}, pop: '', sug: null, rolls: [], confirm: '' };
  var SEAT = ['var(--m-u)', 'var(--m-r)', 'var(--m-g)', 'var(--m-w)', 'var(--m-b)', 'var(--banana)'];

  /* ---------- salvataggio ---------- */
  function load() { try { var raw = localStorage.getItem(KEY); return raw ? P.restore(raw) : null; } catch (e) { return null; } }
  function save() { try { g.mirror = !!g.mirror; localStorage.setItem(KEY, P.serialize(g)); } catch (e) { /* il tavolo funziona anche senza salvataggio */ } }
  function ensure() { if (!g) g = load() || P.newGame({ players: 4, life: 40 }); return g; }
  function rng() { try { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; } catch (e) { return Math.random(); } }

  /* ---------- mazzi attivi ---------- */
  function myDecks() {
    return H.decks().filter(function (d) { return d.kind === 'deck' && d.active; }).map(function (d) {
      return { id: d.id, name: d.name, commander: d.commander || '', n: d.bracket && d.bracket.n > 0 ? d.bracket.n : 0 };
    });
  }
  function bdg(n, extra) { return n > 0 ? '<span class="bk-badge b' + n + (extra ? ' ' + extra : '') + '" title="Bracket ' + n + '" aria-label="Bracket ' + n + '">' + n + '</span>' : ''; }

  /* ---------- pezzi di interfaccia ---------- */
  var ICON = {
    drop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/></svg>',
    crown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 18h18l-1.500-10-4.500 4-3-7-3 7-4.500-4z"/></svg>'
  };
  function seg(items, cur, act, label) {
    return '<div class="seg" role="group" aria-label="' + esc(label) + '">' + items.map(function (v) { return '<button type="button" data-a="' + act + '" data-v="' + v + '" aria-pressed="' + (v === cur) + '">' + v + '</button>'; }).join('') + '</div>';
  }
  function banner(b, cls) {
    if (b.level === 'unknown') return '<p class="pe-bal unknown' + (cls ? ' ' + cls : '') + '" role="status"><span class="ic" aria-hidden="true">i</span>' + esc(b.text) + '</p>';
    return '<p class="pe-bal ' + b.level + (cls ? ' ' + cls : '') + '" role="status"><span class="ic" aria-hidden="true">' + (b.level === 'ok' ? '✓' : '!') + '</span>' + esc(b.text) + '</p>';
  }

  /* ---------- preparazione del tavolo ---------- */
  function seatHtml(p, i, decks) {
    var d = p.deck, opts = '<option value="">Nessun mazzo (bracket a mano)</option>' + decks.map(function (x) {
      return '<option value="' + esc(x.id) + '"' + (d && d.id === x.id ? ' selected' : '') + '>' + esc(x.name) + (x.n ? ' · bracket ' + x.n : '') + '</option>';
    }).join('');
    var chips = [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" class="pe-bk b' + n + '" data-a="pe-bkt" data-p="' + p.id + '" data-v="' + n + '" aria-pressed="' + (p.bracket === n) + '" aria-label="Bracket ' + n + '">' + n + '</button>'; }).join('');
    var sug = '';
    if (i === 0) {
      sug = '<div class="pe-ask"><button type="button" class="btn small bracket" data-a="pe-sug">Che mazzo uso stasera?</button>' +
        (decks.length ? '' : '<span class="hint">Nessun mazzo attivo: attiva quelli che hai montato nella sezione Mazzi.</span>') + '</div>';
      if (ux.sug && ux.sug.list.length) {
        var cur = ux.sug.list[ux.sug.i % ux.sug.list.length];
        sug += '<div class="pe-sug" role="status"><div><small>Stasera ti consiglio</small><b>' + esc(cur.deck.name) + '</b><span>' + esc(cur.why) + (cur.deck.commander ? ' · ' + esc(cur.deck.commander) : '') + '</span></div>' +
          '<div class="pe-sug-b">' + bdg(cur.deck.n) + '<button type="button" class="btn small primary" data-a="pe-sug-use">Usa questo</button>' +
          (ux.sug.list.length > 1 ? '<button type="button" class="btn small" data-a="pe-sug-next">Un altro</button>' : '') + '</div></div>';
      } else if (ux.sug) sug += '<p class="pe-sug none" role="status">Non ho nessun mazzo attivo da proporti.</p>';
    }
    return '<div class="pe-seat" data-p="' + p.id + '" style="--seat:' + SEAT[i] + '"><div class="pe-seat-h"><span class="pe-n" aria-hidden="true">' + (i + 1) + '</span>' +
      '<input class="pe-name" data-c="pe-name" data-p="' + p.id + '" value="' + esc(p.name) + '" maxlength="24" aria-label="Nome del posto ' + (i + 1) + '" autocomplete="off"></div>' +
      '<label class="pe-deck"><span>Mazzo</span><select data-c="pe-deck" data-p="' + p.id + '">' + opts + '</select></label>' +
      '<div class="pe-bkr"><span>Bracket</span><div class="pe-bks" role="group" aria-label="Bracket del posto ' + (i + 1) + '">' + chips + '</div></div>' + sug + '</div>';
  }
  function setupHtml() {
    var decks = myDecks(), b = P.balance(g);
    return '<header class="vh"><h1>The Pescher</h1><p class="sub">Il compagno di partita: vite, veleno, danno da comandante e dadi. Conosce i tuoi mazzi e i loro bracket.</p></header>' +
      '<section class="pe-setup"><div class="pe-opts panel">' +
      '<div class="pe-opt"><b>Giocatori</b>' + seg([2, 3, 4, 5, 6], g.players.length, 'pe-count', 'Numero di giocatori') + '</div>' +
      '<div class="pe-opt"><b>Vita iniziale</b>' + seg(P.LIVES, g.start, 'pe-start', 'Vita iniziale') + '</div>' +
      '<label class="pe-chk"><input type="checkbox" data-c="pe-cmdlife"' + (g.cmdLife ? ' checked' : '') + '> Il danno da comandante toglie anche vita</label></div>' +
      '<div class="pe-seats">' + g.players.map(function (p, i) { return seatHtml(p, i, decks); }).join('') + '</div>' +
      banner(b) +
      '<div class="pe-go"><button type="button" class="btn primary big" data-a="pe-begin">Inizia la partita</button><span class="hint">Il primo giocatore lo decide il caso.</span></div></section>';
  }

  /* ---------- partita ---------- */
  function tileHtml(p, i) {
    var st = P.status(g, p), w = P.winner(g), isTurn = g.turn === i && !w;
    var maxC = 0; Object.keys(p.cmd).forEach(function (k) { if (p.cmd[k] > maxC) maxC = p.cmd[k]; });
    var open = ux.open[p.id] || '', flip = g.mirror && i < Math.floor(g.players.length / 2);
    var life = '<div class="pe-life"><button type="button" class="pe-lb" data-a="pe-life" data-p="' + p.id + '" data-d="-1" aria-label="Togli 1 vita a ' + esc(p.name) + '">−</button>' +
      '<output class="pe-lv' + (p.life <= 10 ? ' low' : '') + '" aria-live="polite" aria-label="Vita di ' + esc(p.name) + '">' + p.life + '</output>' +
      '<button type="button" class="pe-lb" data-a="pe-life" data-p="' + p.id + '" data-d="1" aria-label="Aggiungi 1 vita a ' + esc(p.name) + '">+</button></div>' +
      '<div class="pe-fast"><button type="button" data-a="pe-life" data-p="' + p.id + '" data-d="-5" aria-label="Togli 5 vita a ' + esc(p.name) + '">−5</button><button type="button" data-a="pe-life" data-p="' + p.id + '" data-d="5" aria-label="Aggiungi 5 vita a ' + esc(p.name) + '">+5</button></div>';
    var chips = '<div class="pe-chips"><button type="button" class="pe-chip' + (p.poison >= P.POISON_OUT ? ' bad' : p.poison ? ' on' : '') + '" data-a="pe-tog" data-p="' + p.id + '" data-k="poison" aria-expanded="' + (open === 'poison') + '" aria-label="Veleno: ' + p.poison + '">' + ICON.drop + '<span>Veleno</span><b>' + p.poison + '</b></button>' +
      '<button type="button" class="pe-chip' + (maxC >= P.CMD_OUT ? ' bad' : maxC ? ' on' : '') + '" data-a="pe-tog" data-p="' + p.id + '" data-k="cmd" aria-expanded="' + (open === 'cmd') + '" aria-label="Danno da comandante: ' + maxC + '">' + ICON.crown + '<span>Comandante</span><b>' + maxC + '</b></button></div>';
    var panel = '';
    if (open === 'poison') {
      panel = '<div class="pe-panel"><div class="pe-row"><span class="pe-from">Segnalini veleno <small>' + P.POISON_OUT + ' = fuori</small></span>' +
        step(p, 'pe-poison', '', p.poison, P.POISON_OUT) + '</div></div>';
    } else if (open === 'cmd') {
      panel = '<div class="pe-panel">' + g.players.filter(function (o) { return o.id !== p.id; }).map(function (o) {
        var oi = g.players.indexOf(o), n = p.cmd[o.id] || 0;
        return '<div class="pe-row"><span class="pe-from"><i style="background:' + SEAT[oi] + '"></i>da ' + esc(o.name) + '<small>' + P.CMD_OUT + ' = fuori</small></span>' + step(p, 'pe-cmd', o.id, n, P.CMD_OUT) + '</div>';
      }).join('') + '</div>';
    }
    var dk = p.deck && p.deck.name ? '<span class="pe-dk">' + esc(p.deck.name) + '</span>' : '';
    return '<article class="pe-tile' + (isTurn ? ' turn' : '') + (st.out ? ' out' : '') + (open ? ' open' : '') + (w && w.id === p.id ? ' won' : '') + (flip ? ' flip' : '') + '" data-p="' + p.id + '" style="--seat:' + SEAT[i] + '">' +
      '<header><b class="pe-nm">' + esc(p.name) + '</b>' + dk + bdg(p.bracket) + (isTurn ? '<span class="pe-t">Turno</span>' : '') + (w && w.id === p.id ? '<span class="pe-t win">Vince</span>' : '') + '</header>' +
      life + chips + panel +
      (st.out ? '<div class="pe-out" role="status"><b>Fuori</b><span>' + esc(st.why.map(function (x) { return x.text; }).join(' · ')) + '</span></div>' : '') + '</article>';
  }
  function step(p, act, from, n, max) {
    var a = ' data-a="' + act + '" data-p="' + p.id + '"' + (from ? ' data-from="' + from + '"' : '');
    return '<div class="pe-step"><button type="button"' + a + ' data-d="-1" aria-label="Meno">−</button><output class="' + (n >= max ? 'bad' : '') + '">' + n + '<small>/' + max + '</small></output><button type="button"' + a + ' data-d="1" aria-label="Più">+</button></div>';
  }
  function playHtml() {
    var w = P.winner(g), b = P.balance(g), cur = g.turn >= 0 ? g.players[g.turn] : null;
    var head = w ? '<div class="pe-turn won"><b>Ha vinto ' + esc(w.name) + '!</b></div>' : cur ? '<div class="pe-turn">Turno di <b>' + esc(cur.name) + '</b></div>' : '<div class="pe-turn"><b>Partita in corso</b></div>';
    var bar = '<div class="pe-bar">' + head + '<div class="pe-tools">' +
      (cur && !w ? '<button type="button" class="btn small primary" data-a="pe-next">Passa il turno</button>' : '') +
      '<button type="button" class="btn small" data-a="pe-dice">Dadi</button>' +
      '<button type="button" class="btn small" data-a="pe-undo"' + (g.hist.length ? '' : ' disabled') + '>Annulla</button>' +
      '<button type="button" class="btn small" data-a="pe-log">Registro</button>' +
      '<button type="button" class="btn small" data-a="pe-menu" aria-haspopup="dialog">Menu</button></div></div>';
    return bar + (b.level === 'warn' || b.level === 'bad' ? banner(b, 'slim') : '') +
      '<div class="pe-grid" data-n="' + g.players.length + '">' + g.players.map(tileHtml).join('') + '</div>';
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
    save(); syncWake();
  }

  /* schermo acceso mentre si gioca */
  function syncWake() {
    if (!(g && g.started) || !navigator.wakeLock || wake) return;
    try { navigator.wakeLock.request('screen').then(function (l) { wake = l; l.addEventListener('release', function () { wake = null; }); }, function () { /* non concesso */ }); } catch (e) { /* non supportato */ }
  }
  function unwake() { try { if (wake) wake.release(); } catch (e) { /* già rilasciato */ } wake = null; }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && document.getElementById('pe')) syncWake(); });

  function after() { document.body.classList.toggle('pe-play', !!(g && g.started)); document.body.classList.toggle('pe-focus', !!(g && g.focus && g.started)); syncWake(); }
  function idle() { closePop(); unwake(); document.body.classList.remove('pe-play', 'pe-focus'); }

  /* ---------- pop-up: dadi, registro, menu ---------- */
  var pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; } ux.pop = ''; ux.confirm = ''; }
  function popBody() {
    if (ux.pop === 'dice') {
      var last = ux.rolls[0];
      return '<div class="an-head"><div><small>Il caso decide</small><strong>Dadi</strong></div><button type="button" class="btn small" data-a="pe-close" id="pex">Chiudi</button></div>' +
        '<div class="pe-dice">' + P.DICE.map(function (d) { return '<button type="button" class="btn" data-a="pe-roll" data-k="' + d + '">' + d.toUpperCase() + '</button>'; }).join('') +
        '<button type="button" class="btn" data-a="pe-roll" data-k="coin">Moneta</button><button type="button" class="btn bracket" data-a="pe-first">Chi inizia?</button></div>' +
        '<div class="pe-res' + (last ? ' has' : '') + '" role="status" aria-live="polite">' + (last ? '<small>' + esc(last.label) + '</small><b>' + esc(String(last.value)) + '</b>' : '<span>Scegli un dado.</span>') + '</div>' +
        (ux.rolls.length > 1 ? '<ol class="pe-hist" aria-label="Lanci precedenti">' + ux.rolls.slice(1, 7).map(function (r) { return '<li>' + esc(r.label) + ': <b>' + esc(String(r.value)) + '</b></li>'; }).join('') + '</ol>' : '');
    }
    if (ux.pop === 'log') {
      return '<div class="an-head"><div><small>Cosa è successo</small><strong>Registro</strong></div><button type="button" class="btn small" data-a="pe-close" id="pex">Chiudi</button></div>' +
        (g.log.length ? '<ol class="pe-log">' + g.log.map(function (l) { var d = new Date(l.t); return '<li><time>' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2) + '</time><span>' + esc(l.text) + '</span></li>'; }).join('') + '</ol>' : '<p class="an-none">Ancora niente: tocca una vita per iniziare.</p>') +
        '<div class="pe-popbar"><button type="button" class="btn" data-a="pe-undo"' + (g.hist.length ? '' : ' disabled') + '>Annulla l’ultimo</button></div>';
    }
    if (ux.pop === 'menu') {
      var c = ux.confirm;
      return '<div class="an-head"><div><small>The Pescher</small><strong>Menu</strong></div><button type="button" class="btn small" data-a="pe-close" id="pex">Chiudi</button></div>' +
        '<div class="pe-menu"><label class="pe-chk"><input type="checkbox" data-c="pe-cmdlife"' + (g.cmdLife ? ' checked' : '') + '> Il danno da comandante toglie anche vita</label>' +
        '<label class="pe-chk"><input type="checkbox" data-c="pe-mirror"' + (g.mirror ? ' checked' : '') + '> Gira i giocatori in alto (telefono al centro del tavolo)</label>' +
        '<label class="pe-chk"><input type="checkbox" data-c="pe-focus"' + (g.focus ? ' checked' : '') + '> Modalità focus: nasconde il resto dell’app</label>' +
        '<div class="pe-popbar"><button type="button" class="btn' + (c === 'again' ? ' danger' : '') + '" data-a="pe-again">' + (c === 'again' ? 'Sicuro? Tocca di nuovo' : 'Nuova partita (stesso tavolo)') + '</button>' +
        '<button type="button" class="btn' + (c === 'setup' ? ' danger' : '') + '" data-a="pe-setup">' + (c === 'setup' ? 'Sicuro? Tocca di nuovo' : 'Cambia tavolo') + '</button></div></div>';
    }
    return '';
  }
  function openPop(kind) {
    ux.pop = kind; ux.confirm = '';
    if (!pop) {
      pop = document.createElement('div'); pop.id = 'pe-pop'; pop.className = 'lb bk an pe-pop'; pop.setAttribute('data-a', 'pe-close'); pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true');
      pop.setAttribute('aria-label', kind === 'dice' ? 'Dadi' : kind === 'log' ? 'Registro' : 'Menu'); document.body.appendChild(pop);
    }
    paintPop(true);
  }
  function paintPop(focus) {
    if (!pop) return;
    pop.innerHTML = '<div class="an-box pe-box" data-a="pe-keep">' + popBody() + '</div>';
    if (focus) { var x = pop.querySelector('#pex'); if (x) x.focus(); }
  }

  /* ---------- azioni ---------- */
  function others() { return g.players.slice(1).map(function (p) { return p.bracket; }); }
  function takenIds() { return g.players.slice(1).map(function (p) { return p.deck && p.deck.id; }).filter(Boolean); }
  function toast(m) { if (H.toast) H.toast(m); }

  function click(a, el) {
    var id = el.dataset.p, d = parseInt(el.dataset.d, 10), v = el.dataset.v;
    ensure();
    switch (a) {
      case 'pe-count': P.resize(g, parseInt(v, 10)); ux.sug = null; repaint(); break;
      case 'pe-start': P.setStart(g, parseInt(v, 10)); repaint(); break;
      case 'pe-bkt': P.setBracket(g, id, P.player(g, id).bracket === parseInt(v, 10) ? 0 : v); repaint(); break;
      case 'pe-sug': {
        var r = P.suggest(myDecks(), { others: others(), taken: takenIds() }, rng);
        ux.sug = { list: r.ranked, i: 0 }; repaint(); break;
      }
      case 'pe-sug-next': if (ux.sug) { ux.sug.i++; repaint(); } break;
      case 'pe-sug-use': if (ux.sug && ux.sug.list.length) { P.setDeck(g, 'p1', ux.sug.list[ux.sug.i % ux.sug.list.length].deck); ux.sug = null; repaint(); } break;
      case 'pe-begin': { var f = P.begin(g, rng); ux.open = {}; ux.rolls = []; repaint(); toast('Inizia ' + f.name + '.'); break; }
      case 'pe-life': P.life(g, id, d); repaint(); break;
      case 'pe-poison': P.poison(g, id, d); repaint(); break;
      case 'pe-cmd': P.cmd(g, id, el.dataset.from, d); repaint(); break;
      case 'pe-tog': ux.open[id] = ux.open[id] === el.dataset.k ? '' : el.dataset.k; repaint(); break;
      case 'pe-next': { var n = P.nextTurn(g); repaint(); if (n) toast('Tocca a ' + n.name + '.'); break; }
      case 'pe-undo': if (P.undo(g)) { repaint(); if (pop) paintPop(); } break;
      case 'pe-dice': openPop('dice'); break;
      case 'pe-log': openPop('log'); break;
      case 'pe-menu': openPop('menu'); break;
      case 'pe-roll': { var rr = P.roll(el.dataset.k, rng); if (rr) { ux.rolls.unshift({ label: rr.kind === 'coin' ? 'Moneta' : rr.kind.toUpperCase(), value: rr.value }); ux.rolls.length = Math.min(ux.rolls.length, 12); } paintPop(); var rs = pop && pop.querySelector('.pe-res'); if (rs) { rs.classList.remove('pop'); void rs.offsetWidth; rs.classList.add('pop'); } break; }
      case 'pe-first': { var pf = P.pickFirst(g, rng); ux.rolls.unshift({ label: 'Chi inizia', value: pf.player.name }); paintPop(); break; }
      case 'pe-close': closePop(); break;
      case 'pe-keep': break;
      case 'pe-again':
        if (ux.confirm !== 'again') { ux.confirm = 'again'; paintPop(); break; }
        closePop(); ux.open = {}; P.begin(g, rng); repaint(); toast('Nuova partita.'); break;
      case 'pe-setup':
        if (ux.confirm !== 'setup') { ux.confirm = 'setup'; paintPop(); break; }
        closePop(); g.started = false; g.focus = false; P.reset(g); g.started = false; ux.open = {}; ux.sug = null; after(); repaint(); break;
    }
  }
  function input(c, t) {
    ensure();
    if (c === 'pe-name') { P.rename(g, t.dataset.p, t.value); save(); }
  }
  function change(c, t) {
    ensure();
    switch (c) {
      case 'pe-deck': {
        var dk = myDecks().filter(function (x) { return x.id === t.value; })[0] || null;
        P.setDeck(g, t.dataset.p, dk); repaint(); break;
      }
      case 'pe-cmdlife': g.cmdLife = t.checked; save(); break;
      case 'pe-mirror': g.mirror = t.checked; repaint(); break;
      case 'pe-focus':
        g.focus = t.checked; after(); save();
        try { if (g.focus && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(function () { /* niente schermo intero */ }); else if (!g.focus && document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* idem */ }
        break;
    }
  }
  /* Esc: chiude il pop-up, poi esce dal focus. Restituisce true se ha fatto qualcosa. */
  function escape() {
    if (pop) { closePop(); return true; }
    if (g && g.focus && document.getElementById('pe')) { g.focus = false; after(); save(); try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) { /* idem */ } return true; }
    return false;
  }
  function isOpen() { return !!pop; }

  window.CPAPescherUI = { html: html, after: after, idle: idle, click: click, input: input, change: change, escape: escape, isOpen: isOpen, state: function () { return ensure(); } };
})();
