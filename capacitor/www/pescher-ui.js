/* Coglio Proxy Archive - The Pescher: la schermata di gioco.
 * Logica in pescher.js; qui ci sono solo il tavolo, i pop-up e il salvataggio della partita (localStorage, sul dispositivo).
 * Ridisegna solo il proprio contenitore (#pe), così un tocco sulla vita non rifà tutta l'app e non perde il fuoco della tastiera. */
(function () {
  'use strict';
  var H = window.CPAHost, P = window.CPAPescher;
  if (!H || !P) return;
  var esc = H.esc, KEY = 'cpa:pescher:v1';
  var g = null, wake = null, clockT = 0, deltaT = 0;
  var ux = { open: {}, pop: '', rolls: [], confirm: '', setFor: '', delta: {} };
  var SEAT = ['var(--m-u)', 'var(--m-r)', 'var(--m-g)', 'var(--m-w)', 'var(--m-b)', 'var(--banana)'];

  /* ---------- salvataggio ---------- */
  function load() { try { var raw = localStorage.getItem(KEY); return raw ? P.restore(raw) : null; } catch (e) { return null; } }
  function save() { try { g.mirror = !!g.mirror; localStorage.setItem(KEY, P.serialize(g)); } catch (e) { /* il tavolo funziona anche senza salvataggio */ } }
  function ensure() { if (!g) g = load() || P.newGame({ players: 4, life: 40 }); return g; }
  function rng() { try { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; } catch (e) { return Math.random(); } }

  /* ---------- pezzi di interfaccia ---------- */
  var SV = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var ICON = {
    drop: SV + '<path d="M12 3c3 4 6 7 6 11a6 6 0 0 1-12 0c0-4 3-7 6-11z"/></svg>',
    shield: SV + '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/></svg>',
    crown: SV + '<path d="M3 18h18l-1.500-10-4.500 4-3-7-3 7-4.500-4z"/></svg>',
    more: SV + '<circle cx="5" cy="12" r="1.200"/><circle cx="12" cy="12" r="1.200"/><circle cx="19" cy="12" r="1.200"/></svg>',
    flag: SV + '<path d="M6 21V4M6 5h11l-2 4 2 4H6"/></svg>'
  };
  function seg(items, cur, act, label) {
    return '<div class="seg" role="group" aria-label="' + esc(label) + '">' + items.map(function (v) { return '<button type="button" data-a="' + act + '" data-v="' + v + '" aria-pressed="' + (v === cur) + '">' + v + '</button>'; }).join('') + '</div>';
  }
  function mmss(ms) { var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); s %= 60; return (h ? h + ':' + ('0' + m).slice(-2) : m) + ':' + ('0' + s).slice(-2); }

  /* ---------- preparazione del tavolo ---------- */
  function seatHtml(p, i) {
    return '<div class="pe-seat" style="--seat:' + SEAT[i] + '"><span class="pe-n" aria-hidden="true">' + (i + 1) + '</span>' +
      '<input class="pe-name" data-c="pe-name" data-p="' + p.id + '" value="' + esc(p.name) + '" maxlength="24" aria-label="Nome del posto ' + (i + 1) + '" autocomplete="off"></div>';
  }
  function setupHtml() {
    return '<header class="vh"><h1>The Pescher</h1><p class="sub">Il compagno di partita dal vivo: vite, veleno, danno da comandante, segnalini e dadi.</p></header>' +
      '<section class="pe-setup"><div class="pe-opts panel">' +
      '<div class="pe-opt"><b>Giocatori</b>' + seg([2, 3, 4, 5, 6], g.players.length, 'pe-count', 'Numero di giocatori') + '</div>' +
      '<div class="pe-opt"><b>Vita iniziale</b>' + seg(P.LIVES, g.start, 'pe-start', 'Vita iniziale') + '</div>' +
      '<label class="pe-chk"><input type="checkbox" data-c="pe-cmdlife"' + (g.cmdLife ? ' checked' : '') + '> Il danno da comandante toglie anche vita</label></div>' +
      '<div class="pe-opt"><b>Nomi (se vuoi)</b></div>' +
      '<div class="pe-seats">' + g.players.map(seatHtml).join('') + '</div>' +
      '<div class="pe-go"><button type="button" class="btn primary big" data-a="pe-begin">Inizia la partita</button><span class="hint">Il primo giocatore lo decide il caso.</span></div></section>';
  }

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
      '<button type="button" class="btn small" data-a="pe-log">Registro</button>' +
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

  function after() { document.body.classList.toggle('pe-play', !!(g && g.started)); document.body.classList.toggle('pe-focus', !!(g && g.focus && g.started)); syncWake(); syncClock(); }
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
        '<div class="pe-popbar"><button type="button" class="btn' + (c === 'again' ? ' danger' : '') + '" data-a="pe-again">' + (c === 'again' ? 'Sicuro? Tocca di nuovo' : 'Nuova partita (stesso tavolo)') + '</button>' +
        '<button type="button" class="btn' + (c === 'setup' ? ' danger' : '') + '" data-a="pe-setup">' + (c === 'setup' ? 'Sicuro? Tocca di nuovo' : 'Cambia tavolo') + '</button></div></div>';
    }
    return '';
  }
  function openPop(kind) {
    ux.pop = kind; ux.confirm = '';
    if (!pop) {
      pop = document.createElement('div'); pop.id = 'pe-pop'; pop.className = 'lb bk an pe-pop'; pop.setAttribute('data-a', 'pe-close'); pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true');
      pop.setAttribute('aria-label', { dice: 'Dadi', log: 'Registro', menu: 'Menu', set: 'Imposta la vita' }[kind] || 'The Pescher'); document.body.appendChild(pop);
    }
    paintPop(true);
  }
  function paintPop(focus) {
    if (!pop) return;
    pop.innerHTML = '<div class="an-box pe-box" data-a="pe-keep">' + popBody() + '</div>';
    if (focus) { var x = pop.querySelector('#pe-setv') || pop.querySelector('#pex'); if (x) { x.focus(); if (x.select) x.select(); } }
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
  function input(c, t) {
    ensure();
    if (c === 'pe-name') { P.rename(g, t.dataset.p, t.value); save(); }
  }
  function change(c, t) {
    ensure();
    switch (c) {
      case 'pe-cmdlife': g.cmdLife = t.checked; save(); break;
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
