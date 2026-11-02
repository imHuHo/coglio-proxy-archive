/* Coglio Proxy Archive - «Chat? Ma questa cosa è reale?»: gli annunci dei mazzi, dentro il Pescher (scheda separata dalle classifiche dei tavoli).
 * Quando cambi lo stato di un tuo mazzo (da stampare, stampato ma non pronto, attivo, smontato) l'app lo annuncia ai tuoi amici,
 * con il commander e il suo artwork; qui vedi gli annunci tuoi e dei tuoi amici. Logica dei messaggi e client del server: community.js.
 * Ridisegna solo il proprio contenitore (#ch). Gli annunci non partiti (niente rete) restano in coda sul dispositivo e riprovano da soli. */
(function () {
  'use strict';
  var H = window.CPAHost, C = window.CPACommunity;
  if (!H || !C) return;
  var esc = H.esc, FKEY = 'cpa:feed:v1', AKEY = 'cpa:feed:announce:v1', QKEY = 'cpa:feed:outbox:v1', SKEY = 'cpa:feed:seen:v1';
  var cache = null, outq = null, st = { busy: false, err: '', t: 0, baseline: 0, arm: '', sending: false };

  function cm() { var U = window.CPACommunityUI; try { return U && U.api ? U.api() : null; } catch (e) { return null; } }
  function hk(a) { return String(a.me.handle).toLowerCase(); }
  function on() { try { return C.configured(window.CPA_COMMUNITY); } catch (e) { return false; } }
  function annOn() { try { return localStorage.getItem(AKEY) !== '0'; } catch (e) { return true; } }
  function setAnn(v) { try { localStorage.setItem(AKEY, v ? '1' : '0'); } catch (e) { /* resta com'è */ } }

  /* ---------- copia sul dispositivo ---------- */
  function loadCache() {
    if (cache) return cache;
    try { var o = JSON.parse(localStorage.getItem(FKEY) || 'null'); cache = o && typeof o.h === 'string' ? { h: o.h, t: Number(o.t) || 0, list: C.cleanFeed(o.list) } : null; } catch (e) { cache = null; }
    return cache;
  }
  function saveCache() { try { if (cache) localStorage.setItem(FKEY, JSON.stringify(cache)); } catch (e) { /* resta in memoria */ } }
  function listOf(a) { var c = loadCache(); return a && c && c.h === hk(a) ? c.list : null; }
  function queue() {
    if (!outq) { try { var q = JSON.parse(localStorage.getItem(QKEY) || '[]'); outq = Array.isArray(q) ? q.filter(function (x) { return x && typeof x.h === 'string' && x.e && C.STATES[x.e.from] && C.STATES[x.e.to]; }).slice(0, 20) : []; } catch (e) { outq = []; } }
    return outq;
  }
  function saveQueue() { try { localStorage.setItem(QKEY, JSON.stringify(outq || [])); } catch (e) { /* resta in memoria */ } }
  function seen() { try { return Number(localStorage.getItem(SKEY)) || 0; } catch (e) { return 0; } }
  function markSeen(a) { var l = listOf(a); if (!l || !l.length) return; var m = 0; l.forEach(function (e) { if (e.t > m) m = e.t; }); try { if (m > seen()) localStorage.setItem(SKEY, String(m)); } catch (e) { /* pazienza */ } }
  /* novità non ancora viste: annunci degli amici più recenti dell'ultima volta che hai aperto la scheda */
  function unread(a) { var l = listOf(a), s = seen(); return l ? l.filter(function (e) { return !e.mine && e.t > s; }).length : 0; }

  /* ---------- annunci in uscita ---------- */
  function enqueue(a, e) {
    var q = queue(), h = hk(a), prev = q.filter(function (x) { return x.h === h && x.e.deck === e.deck; })[0];
    if (prev) { var f = prev.e.from; q.splice(q.indexOf(prev), 1); if (f === e.to) { saveQueue(); return; } e.from = f; }   /* stesso mazzo ancora in coda: si fonde, come sul server */
    q.push({ h: h, e: e }); if (q.length > 20) q.shift(); saveQueue();
  }
  function flush() {
    var a = cm(); if (!a || st.sending) return Promise.resolve();
    var h = hk(a); if (!queue().some(function (x) { return x.h === h; })) return Promise.resolve();
    st.sending = true;
    function drop(x) { var i = outq.indexOf(x); if (i >= 0) outq.splice(i, 1); }
    function next() {
      var x = queue().filter(function (y) { return y.h === h; })[0]; if (!x) return null;
      return a.cli.feedPost(a.me.handle, a.me.secret, x.e).then(function () { drop(x); return next(); }, function (err) {
        if (err && (err.code === 'offline' || err.code === 'server' || err.code === 'unconfigured')) throw err;
        drop(x); return next();         /* annuncio rifiutato dal server: inutile riprovare */
      });
    }
    return Promise.resolve(next()).then(null, function (e) { st.err = C.messageOf(e); }).then(function () { st.sending = false; saveQueue(); });
  }
  /* Il mazzo d è passato da `from` a `to`: si annuncia agli amici (se l'interruttore è acceso e c'è un Codighel ID). */
  function announce(d, from, to) {
    var a = cm(); if (!a || !annOn() || !d || d.kind !== 'deck' || from === to || !C.STATES[from] || !C.STATES[to]) return;
    var e = { deck: String(d.id || '').slice(0, 40), name: String(d.name || ''), cmd: String(d.commander || ''), img: '', from: from, to: to };
    var img = ''; try { img = H.cmdArt ? H.cmdArt(d) || '' : ''; } catch (x) { img = ''; }
    function go(u) { e.img = u || ''; enqueue(a, e); flush().then(function () { st.t = 0; }); }
    if (img && /^https:\/\/cards\.scryfall\.io\//.test(img)) { go(img); return; }
    if (e.cmd) C.artSearch('!"' + e.cmd.replace(/"/g, '') + '"', function (u) { return fetch(u); }).then(function (l) { go(l[0] && l[0].url); }, function () { go(''); });
    else go('');
  }

  /* ---------- aggiornamento ---------- */
  function refresh(force) {
    var a = cm(); if (!a || st.busy) return;
    if (!force && Date.now() - st.t < 60000) return;
    st.busy = true; st.err = ''; st.t = Date.now(); paint();
    flush().then(function () { return a.cli.feedList(a.me.handle, a.me.secret); }).then(function (l) { cache = { h: hk(a), t: Date.now(), list: l }; saveCache(); },
      function (e) { st.err = C.messageOf(e); }).then(function () { st.busy = false; paint(); });
  }

  /* ---------- interfaccia ---------- */
  function face(url, h) {
    return url ? '<img class="cm-av" src="' + esc(url) + '" alt="" referrerpolicy="no-referrer" loading="lazy">' : '<span class="cm-av ph" aria-hidden="true">' + esc(String(h || '?').charAt(0).toUpperCase()) + '</span>';
  }
  /* il testo dell'annuncio, con ID e commander in grassetto */
  function rich(text, ev) {
    var h = esc(text);
    [('@' + ev.author.handle), ev.commander, ev.deck].forEach(function (p) { if (p) { var e = esc(p); h = h.split(e).join('<b>' + e + '</b>'); } });
    return h;
  }
  function evHtml(ev, now) {
    var m = C.feedMessage(ev), armed = st.arm === ev.id, isNew = !ev.mine && ev.t > st.baseline;
    var art = ev.image ? '<div class="ch-art" style="background-image:url(' + esc(ev.image) + ')" role="img" aria-label="' + esc('Artwork di ' + (ev.commander || ev.deck)) + '"></div>' : '<div class="ch-art none" aria-hidden="true"><img src="mana/' + m.tone + '.svg" alt="" width="64" height="64"></div>';
    return '<li class="ch-ev tone-' + m.tone + (m.big ? ' big' : '') + (isNew ? ' new' : '') + '">' + art +
      '<div class="ch-body"><div class="ch-top">' + face(ev.author.avatar_url, ev.author.handle) + '<b class="ch-who">@' + esc(ev.author.handle) + '</b>' + (ev.mine ? '<span class="ch-me">tu</span>' : '') +
      '<time class="ch-time" datetime="' + esc(new Date(ev.t).toISOString()) + '">' + esc(C.ago(ev.t, now)) + '</time>' + (isNew ? '<span class="ch-new">Nuovo</span>' : '') +
      '<img class="ch-pip" src="mana/' + m.tone + '.svg" alt="" width="22" height="22"></div>' +
      '<strong class="ch-shout">' + esc(m.shout) + '</strong><p class="ch-text">' + rich(m.text, ev) + '</p>' +
      '<div class="ch-foot"><span class="ch-lab">' + esc(m.label) + '</span>' + (ev.mine ? '<button type="button" class="btn small' + (armed ? ' danger' : '') + '" data-a="ch-del" data-id="' + esc(ev.id) + '">' + (armed ? 'Sicuro? Sparisce per tutti' : 'Ritira') + '</button>' : '') + '</div></div></li>';
  }
  function inner() {
    var a = cm(), head = '<div class="ch-hero"><small>Annunci dei mazzi</small><h2>Chat? Ma questa cosa è reale?</h2><p>Quando un amico stampa, monta o smonta un mazzo, lo scopri qui. Niente messaggi da scrivere: parlano i mazzi.</p></div>';
    if (!on()) return head + '<p class="hint">Le funzioni community non sono ancora attive su questa copia dell’app.</p>';
    if (!a) return head + '<div class="ch-empty"><img src="mana/u.svg" alt="" width="46" height="46"><b>Serve un Codighel ID</b><p>Crea il tuo ID in Dati e aggiungi gli amici: i loro annunci compariranno qui.</p><button type="button" class="btn primary" data-a="ch-data">Vai a Dati</button></div>';
    var l = listOf(a), now = Date.now();
    var opts = '<div class="ch-opts panel"><label class="pe-chk"><input type="checkbox" data-c="ch-ann"' + (annOn() ? ' checked' : '') + '> Annuncia ai miei amici i cambi di stato dei miei mazzi</label>' +
      '<div class="ch-sync"><span class="ch-sst' + (st.err ? ' err' : '') + '" role="status" aria-live="polite">' + esc(st.busy ? 'Aggiorno…' : st.err ? st.err : queue().some(function (x) { return x.h === hk(a); }) ? 'Un tuo annuncio aspetta la rete…' : (loadCache() && loadCache().h === hk(a) && cache.t ? 'Aggiornato alle ' + ('0' + new Date(cache.t).getHours()).slice(-2) + ':' + ('0' + new Date(cache.t).getMinutes()).slice(-2) : 'Non ancora aggiornato')) + '</span>' +
      '<button type="button" class="btn small" data-a="ch-refresh"' + (st.busy ? ' disabled' : '') + '>Aggiorna</button></div></div>';
    var body;
    if (!l) body = '<p class="an-none">' + (st.busy ? 'Carico gli annunci…' : 'Non riesco a caricare gli annunci: tocca «Aggiorna».') + '</p>';
    else if (!l.length) body = '<div class="ch-empty"><img src="mana/r.svg" alt="" width="46" height="46"><b>Tutto tace…</b><p>Ancora nessun annuncio. Quando un amico passa un mazzo da «Da stampare» a «Stampato ma non pronto», lo vedi qui con il suo commander. Se vuoi, comincia tu: cambia lo stato di un mazzo nella pagina Mazzi.</p></div>';
    else body = '<ul class="ch-list">' + l.map(function (ev) { return evHtml(ev, now); }).join('') + '</ul>';
    return head + opts + body;
  }
  function html() { return '<section class="ch" id="ch" aria-label="Chat? Ma questa cosa è reale?">' + inner() + '</section>'; }
  function badgeHtml() { var a = cm(), n = a ? unread(a) : 0; return '<span class="pe-badge" id="ch-badge"' + (n ? '' : ' hidden') + '>' + (n > 9 ? '9+' : n) + '</span>'; }
  function updateBadge() {
    var b = document.getElementById('ch-badge'); if (!b) return; var a = cm(), n = a ? unread(a) : 0;
    b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n);
  }
  function paint() {
    var el = document.getElementById('ch');
    if (el) {
      var f = document.activeElement, key = f && el.contains(f) && f.getAttribute ? (f.getAttribute('data-a') ? '[data-a="' + f.getAttribute('data-a') + '"]' : f.getAttribute('data-c') ? '[data-c="' + f.getAttribute('data-c') + '"]' : '') : '';
      el.innerHTML = inner();
      if (key) { try { var n = el.querySelector(key); if (n && !n.disabled) n.focus({ preventScroll: true }); } catch (e) { /* pazienza */ } }
      var a = cm(); if (a && listOf(a)) { markSeen(a); }
    }
    updateBadge();
  }
  /* scheda aperta: ciò che era già visto non è «nuovo», il resto sì finché non si lascia la scheda */
  function opened() { st.baseline = seen(); refresh(Date.now() - st.t > 15000); var a = cm(); if (a && listOf(a)) markSeen(a); updateBadge(); }
  function after() { if (cm()) refresh(false); updateBadge(); }

  function click(a, el) {
    var u = cm();
    switch (a) {
      case 'ch-refresh': refresh(true); break;
      case 'ch-data': H.ui.view = 'data'; H.render(); break;
      case 'ch-del': {
        var id = el.dataset.id; if (!u) break;
        if (st.arm !== id) { st.arm = id; paint(); break; }
        st.arm = ''; u.cli.feedDelete(u.me.handle, u.me.secret, id).then(function () {
          var c = loadCache(); if (c) { c.list = c.list.filter(function (e) { return e.id !== id; }); saveCache(); } paint();
        }, function (e) { st.err = C.messageOf(e); paint(); }); break;
      }
    }
  }
  function change(c, t) { if (c === 'ch-ann') { setAnn(t.checked); H.toast(t.checked ? 'Annuncerò ai tuoi amici i cambi di stato dei tuoi mazzi.' : 'Non annuncerò più i cambi di stato dei tuoi mazzi.'); } }
  function input() { /* nessun campo di testo */ }

  window.CPAChatUI = { html: html, badgeHtml: badgeHtml, opened: opened, after: after, click: click, change: change, input: input, announce: announce, unread: function () { var a = cm(); return a ? unread(a) : 0; }, state: function () { return st; } };
})();
