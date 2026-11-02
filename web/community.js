/* Coglio Proxy Archive - le funzioni community (nessun accesso al DOM).
 * Codighel ID: un nome utente unico tra amici, senza email né password. Il «codice di recupero» (100 bit) si genera
 * sul dispositivo; al server arriva solo per dimostrare chi sei, e lì ne resta solo l'impronta (vedi supabase/schema.sql).
 * Qui: controlli sugli ID, generazione e normalizzazione del codice, ricerca degli artwork su Scryfall e il client
 * delle funzioni del server (fetch iniettabile per poterlo provare). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CPACommunity = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var HANDLE_RE = /^[A-Za-z0-9_.-]{3,20}$/, ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ', SECRET_LEN = 20;
  var ART_HOST = 'https://cards.scryfall.io/', ART_RE = /^https:\/\/cards\.scryfall\.io\/[A-Za-z0-9\/._-]+(\?[A-Za-z0-9=&._-]*)?$/;

  /* ----- ID ----- */
  function cleanHandle(h) { return String(h == null ? '' : h).trim().replace(/^@/, ''); }
  function validHandle(h) { return HANDLE_RE.test(String(h == null ? '' : h)); }
  /* Cosa dire a chi scrive un ID che non va (null se va bene). */
  function handleProblem(h) {
    h = String(h == null ? '' : h);
    if (h.length < 3) return 'Almeno 3 caratteri.';
    if (h.length > 20) return 'Al massimo 20 caratteri.';
    if (!HANDLE_RE.test(h)) return 'Solo lettere senza accento, numeri, punto, trattino e trattino basso.';
    return null;
  }

  /* ----- codice di recupero: 20 caratteri di un alfabeto senza I, L, O, U (si legge e si detta bene) ----- */
  function defaultBytes(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
  function newSecret(bytes) {
    var b = (bytes || defaultBytes)(SECRET_LEN), s = '';
    for (var i = 0; i < SECRET_LEN; i++) s += ALPHA.charAt(b[i] & 31);   /* 256 è multiplo di 32: nessuna distorsione */
    return s;
  }
  function formatSecret(s) { return String(s || '').replace(/(.{5})(?=.)/g, '$1-'); }
  /* Quel che si scrive a mano: maiuscole, niente trattini o spazi, O→0 e I/L→1 come nell'alfabeto Crockford. */
  function normSecret(t) { return String(t == null ? '' : t).toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-Z]/g, ''); }
  function validSecret(s) { return typeof s === 'string' && s.length === SECRET_LEN && s.split('').every(function (c) { return ALPHA.indexOf(c) >= 0; }); }

  /* ----- artwork da Scryfall ----- */
  /* Dall'oggetto carta di Scryfall all'artwork (art_crop, anche per le carte a due facce). */
  function artFromCard(c) {
    if (!c) return null;
    var im = c.image_uris || (c.card_faces && c.card_faces[0] && c.card_faces[0].image_uris) || null, url = im && im.art_crop;
    if (!url || !ART_RE.test(url)) return null;
    var face = c.card_faces && c.card_faces[0];
    return { name: String(c.name || (face && face.name) || '').slice(0, 160), artist: String((face && face.artist) || c.artist || ''), set: String(c.set || '').toUpperCase(), url: url };
  }
  /* Ogni artwork diverso della carta cercata (unique=art), dal più recente. */
  function artSearch(query, fetchFn) {
    var q = String(query || '').trim(); if (q.length < 2) return Promise.resolve([]);
    var url = 'https://api.scryfall.com/cards/search?unique=art&order=released&dir=desc&q=' + encodeURIComponent(q);
    return fetchFn(url).then(function (r) {
      if (r.status === 404) return { data: [] };
      if (!r.ok) throw fail('scryfall', 'Scryfall non risponde.');
      return r.json();
    }, function () { throw fail('offline', 'Niente rete.'); }).then(function (j) {
      return ((j && j.data) || []).map(artFromCard).filter(Boolean).slice(0, 24);
    });
  }

  /* ----- client delle funzioni del server ----- */
  var KNOWN = { bad_handle: 1, bad_secret: 1, bad_avatar: 1, bad_login: 1, handle_taken: 1 };
  function fail(code, message) { var e = new Error(message || code); e.code = code; return e; }
  /* Messaggi per le persone, per codice d'errore. */
  var TEXT = {
    bad_handle: 'Questo ID non va: usa 3-20 caratteri tra lettere (senza accenti), numeri, punto, trattino e trattino basso.',
    bad_secret: 'Il codice di recupero non è valido.',
    bad_avatar: 'Questa immagine non si può usare.',
    bad_login: 'ID o codice di recupero sbagliati.',
    handle_taken: 'Questo ID è già preso.',
    offline: 'Non riesco a raggiungere il server: controlla la connessione e riprova.',
    unconfigured: 'Le funzioni community non sono ancora attive.',
    server: 'Il server ha risposto in modo strano: riprova tra poco.',
    scryfall: 'Scryfall non risponde: riprova tra poco.'
  };
  function messageOf(e) { return TEXT[e && e.code] || TEXT.server; }

  function configured(cfg) { return !!(cfg && /^https:\/\/[^\s/]+/.test(String(cfg.url || '')) && String(cfg.key || '').length > 10); }
  function create(cfg, fetchFn) {
    var base = String((cfg && cfg.url) || '').replace(/\/+$/, ''), key = String((cfg && cfg.key) || '');
    function call(fn, body) {
      if (!configured(cfg)) return Promise.reject(fail('unconfigured'));
      return fetchFn(base + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) {
        return r.text().then(function (t) {
          var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) { j = null; }
          if (r.ok) return j;
          var m = j && typeof j.message === 'string' ? j.message : '';
          throw fail(KNOWN[m] ? m : 'server', m);
        });
      }, function () { throw fail('offline'); });
    }
    function av(a) { return { p_name: a && a.name ? String(a.name) : '', p_url: a && a.url ? String(a.url) : '' }; }
    return {
      free: function (h) { return call('cpa_handle_free', { p_handle: h }); },
      profile: function (h) { return call('cpa_profile', { p_handle: h }); },
      register: function (h, secret, a) { var b = av(a); return call('cpa_register', { p_handle: h, p_secret: secret, p_name: b.p_name, p_url: b.p_url }); },
      login: function (h, secret) { return call('cpa_login', { p_handle: h, p_secret: secret }); },
      setAvatar: function (h, secret, a) { var b = av(a); return call('cpa_set_avatar', { p_handle: h, p_secret: secret, p_name: b.p_name, p_url: b.p_url }); },
      rename: function (h, secret, nh) { return call('cpa_rename', { p_handle: h, p_secret: secret, p_new: nh }); },
      remove: function (h, secret) { return call('cpa_delete', { p_handle: h, p_secret: secret }); }
    };
  }

  /* ----- profilo salvato sul dispositivo ----- */
  function restoreLocal(raw) {
    var o; try { o = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return null; }
    if (!o || !validHandle(o.handle) || !validSecret(o.secret)) return null;
    var a = o.avatar && typeof o.avatar === 'object' ? o.avatar : {};
    return { handle: o.handle, secret: o.secret, avatar: { name: String(a.name || '').slice(0, 160), url: ART_RE.test(String(a.url || '')) ? String(a.url) : '' } };
  }

  return {
    HANDLE_RE: HANDLE_RE, SECRET_LEN: SECRET_LEN, ART_HOST: ART_HOST,
    cleanHandle: cleanHandle, validHandle: validHandle, handleProblem: handleProblem,
    newSecret: newSecret, formatSecret: formatSecret, normSecret: normSecret, validSecret: validSecret,
    artFromCard: artFromCard, artSearch: artSearch, configured: configured, create: create, messageOf: messageOf, TEXT: TEXT, restoreLocal: restoreLocal
  };
});
