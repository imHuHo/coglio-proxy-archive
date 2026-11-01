/* Coglio Proxy Archive - ricerca avanzata nell'archivio.
 * Un sottoinsieme della sintassi di Scryfall, valutato in locale sui dati delle carte gia' scaricati (vedi cards.js).
 * Nessun accesso al DOM e nessuna rete: si prova in Node.
 *
 * Ogni test restituisce true, false oppure null: null vuol dire «non lo so» (i dati della carta non ci sono ancora).
 * Il null attraversa AND / OR / NOT come in una logica a tre valori, cosi' «-t:creature» non fa passare per errore
 * le carte di cui ancora non conosciamo il tipo. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CPASearch = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function strip(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function low(s) { return strip(s).toLowerCase(); }
  /* come C.searchNorm: solo lettere, cifre e spazi */
  function norm(s) { return low(s).replace(/[^a-z0-9 ]+/g, '').replace(/\s+/g, ' ').trim(); }

  /* ----- colori ----- */
  var ORDER = 'WUBRG';
  var NAMED = {
    white: 'w', bianco: 'w', blue: 'u', blu: 'u', black: 'b', nero: 'b', red: 'r', rosso: 'r', green: 'g', verde: 'g',
    azorius: 'wu', dimir: 'ub', rakdos: 'br', gruul: 'rg', selesnya: 'gw', orzhov: 'wb', izzet: 'ur', golgari: 'bg', boros: 'rw', simic: 'gu',
    bant: 'gwu', esper: 'wub', grixis: 'ubr', jund: 'brg', naya: 'rgw', abzan: 'wbg', jeskai: 'urw', sultai: 'bgu', mardu: 'rwb', temur: 'gur',
    chaos: 'ubrg', aggression: 'brgw', altruism: 'rgwu', growth: 'gwub', artifice: 'wubr'
  };
  function sortColors(set) { return ORDER.split('').filter(function (c) { return set.indexOf(c) >= 0; }).join(''); }
  /* «wu», «azorius», «c» (incolore), «m» (multicolore) -> {set:'WU'} oppure {special:'c'|'m'} */
  function parseColors(v) {
    var s = low(v).replace(/\s+/g, '');
    if (!s) return null;
    if (s === 'c' || s === 'colorless' || s === 'incolore') return { set: '', special: 'c' };
    if (s === 'm' || s === 'multicolor' || s === 'multicolore') return { set: '', special: 'm' };
    if (NAMED[s]) return { set: sortColors(NAMED[s].toUpperCase()) };
    if (/^[wubrg]+$/.test(s)) return { set: sortColors(s.toUpperCase()) };
    return null;
  }
  function subset(a, b) { for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) < 0) return false; return true; }
  function cmpSets(a, b, op) {
    var sa = subset(a, b), sb = subset(b, a);
    switch (op) {
      case ':': case '>=': return sb;
      case '=': return sa && sb;
      case '!=': return !(sa && sb);
      case '<=': return sa;
      case '<': return sa && !sb;
      case '>': return sb && !sa;
    }
    return false;
  }

  /* ----- numeri e rarita' ----- */
  function cmpNum(a, b, op) {
    switch (op) {
      case ':': case '=': return a === b;
      case '!=': return a !== b;
      case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b;
    }
    return false;
  }
  var RAR = { common: 1, c: 1, comune: 1, uncommon: 2, u: 2, non_comune: 2, rare: 3, r: 3, rara: 3, mythic: 4, m: 4, mitica: 4, special: 5, s: 5, bonus: 6, b: 6 };
  var RAR_CODE = { common: 1, uncommon: 2, rare: 3, mythic: 4, special: 5, bonus: 6, c: 1, u: 2, r: 3, m: 4, s: 5, b: 6 };

  /* parole italiane per i tipi, cosi' «t:creatura» funziona */
  var TYPE_IT = {
    creatura: 'creature', istantaneo: 'instant', stregoneria: 'sorcery', artefatto: 'artifact', incantesimo: 'enchantment',
    terra: 'land', leggendaria: 'legendary', leggendario: 'legendary', planeswalker: 'planeswalker', battaglia: 'battle', tribale: 'kindred',
    base: 'basic', veicolo: 'vehicle', equipaggiamento: 'equipment', aura: 'aura', saga: 'saga'
  };

  /* ----- lettura della query ----- */
  var KEYS = {
    n: 'name', name: 'name', t: 'type', type: 'type', o: 'oracle', oracle: 'oracle', c: 'color', color: 'color', colour: 'color',
    id: 'identity', identity: 'identity', ci: 'identity', cmc: 'mv', mv: 'mv', manavalue: 'mv', r: 'rarity', rarity: 'rarity',
    pow: 'pow', power: 'pow', tou: 'tou', toughness: 'tou', eur: 'eur', kw: 'keyword', keyword: 'keyword',
    m: 'mana', mana: 'mana', s: 'set', set: 'set', e: 'set', cn: 'cn', number: 'cn', produces: 'produces', is: 'is'
  };
  var DATA_FIELDS = { type: 1, oracle: 1, color: 1, identity: 1, mv: 1, rarity: 1, pow: 1, tou: 1, eur: 1, keyword: 1, mana: 1, produces: 1, is: 1 };

  function tokenize(src) {
    var out = [], i = 0, n = src.length, c;
    function readValue() {
      var v = '', quoted = false, rx = false;
      if (src[i] === '"') {
        quoted = true; i++;
        while (i < n && src[i] !== '"') v += src[i++];
        if (i < n) i++;
      } else if (src[i] === '/') {
        rx = true; i++;
        while (i < n && src[i] !== '/') { if (src[i] === '\\' && i + 1 < n) v += src[i++]; v += src[i++]; }
        if (i < n) i++;
      } else {
        while (i < n && !/[\s()]/.test(src[i])) v += src[i++];
      }
      return { v: v, quoted: quoted, rx: rx };
    }
    while (i < n) {
      c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '(') { out.push({ t: '(' }); i++; continue; }
      if (c === ')') { out.push({ t: ')' }); i++; continue; }
      if (c === '-' && i + 1 < n && !/\s/.test(src[i + 1])) { out.push({ t: '-' }); i++; continue; }
      if (c === '!' && src[i + 1] === '"') {
        i++; var ex = readValue(); out.push({ t: 'exact', v: ex.v }); continue;
      }
      var m = /^([A-Za-z]+)(>=|<=|!=|:|=|<|>)/.exec(src.slice(i, i + 24));
      if (m && KEYS[m[1].toLowerCase()]) {
        i += m[0].length;
        var val = readValue();
        out.push({ t: 'term', key: KEYS[m[1].toLowerCase()], op: m[2], v: val.v, quoted: val.quoted, rx: val.rx });
        continue;
      }
      var w = readValue();
      if (!w.quoted && !w.rx && /^(or|and)$/i.test(w.v)) { out.push({ t: w.v.toLowerCase() }); continue; }
      out.push({ t: 'word', v: w.v, quoted: w.quoted, rx: w.rx });
    }
    return out;
  }

  function parse(src) {
    var toks = tokenize(String(src || '')), p = 0;
    function peek() { return toks[p]; }
    function orExpr() {
      var parts = [andExpr()];
      while (peek() && peek().t === 'or') { p++; parts.push(andExpr()); }
      return parts.length === 1 ? parts[0] : { op: 'or', a: parts };
    }
    function andExpr() {
      var parts = [];
      while (peek() && peek().t !== 'or' && peek().t !== ')') {
        if (peek().t === 'and') { p++; continue; }
        parts.push(unary());
      }
      if (!parts.length) return { op: 'true' };
      return parts.length === 1 ? parts[0] : { op: 'and', a: parts };
    }
    function unary() {
      var t = peek();
      if (t.t === '-') { p++; if (!peek() || peek().t === ')' || peek().t === 'or') return { op: 'true' }; return { op: 'not', a: unary() }; }
      if (t.t === '(') {
        p++; var e = orExpr();
        if (peek() && peek().t === ')') p++; else throw new Error('Manca una parentesi chiusa.');
        return e;
      }
      p++;
      if (t.t === 'exact') return { op: 'term', key: 'exact', v: t.v };
      if (t.t === 'word') return { op: 'term', key: 'name', cmp: ':', v: t.v, quoted: t.quoted, rx: t.rx };
      if (t.t === 'term') return { op: 'term', key: t.key, cmp: t.op, v: t.v, quoted: t.quoted, rx: t.rx };
      throw new Error('Non capisco «' + (t.t || '?') + '».');
    }
    var ast = orExpr();
    if (p < toks.length) {
      if (toks[p].t === ')') throw new Error('Parentesi chiusa senza apertura.');
      throw new Error('Non capisco la ricerca.');
    }
    return ast;
  }

  /* ----- valutazione ----- */
  function and3(vals) {
    var unk = false;
    for (var i = 0; i < vals.length; i++) { if (vals[i] === false) return false; if (vals[i] === null) unk = true; }
    return unk ? null : true;
  }
  function or3(vals) {
    var unk = false;
    for (var i = 0; i < vals.length; i++) { if (vals[i] === true) return true; if (vals[i] === null) unk = true; }
    return unk ? null : false;
  }
  function regex(v) { try { return new RegExp(v, 'i'); } catch (e) { return null; } }

  /* Prepara un test per un singolo termine: restituisce function(name, rec) -> true|false|null. */
  function termFn(t) {
    var v = t.v, op = t.cmp || ':';
    if (t.key === 'exact') { var ek = norm(v); return function (name) { return norm(name) === ek; }; }
    if (t.key === 'name') {
      if (t.rx) { var rn = regex(v); if (!rn) throw new Error('Espressione regolare non valida: ' + v); return function (name) { return rn.test(strip(name)); }; }
      var nk = norm(v);
      return function (name) { return !nk || norm(name).indexOf(nk) >= 0; };
    }
    if (t.key === 'set') { var sk = low(v); return function (name, rec, pr) { var s = (pr && pr.set) || (rec && rec.s) || ''; return s ? low(s) === sk : null; }; }
    if (t.key === 'cn') { var ck = low(v); return function (name, rec, pr) { var s = (pr && pr.cn) || (rec && rec.cn) || ''; return s ? low(s) === ck : null; }; }
    var need = function (fn) { return function (name, rec, pr) { return rec ? fn(rec, name, pr) : null; }; };
    switch (t.key) {
      case 'type': {
        var parts = low(v).split(/\s+/).filter(Boolean).map(function (w) { return TYPE_IT[w] || w; });
        var tk = parts.join(' ');
        var rt = t.rx ? regex(v) : null;
        if (t.rx && !rt) throw new Error('Espressione regolare non valida: ' + v);
        return need(function (rec) {
          var tl = low(rec.t || '');
          return rt ? rt.test(tl) : tl.indexOf(tk) >= 0;
        });
      }
      case 'oracle': {
        var ro = t.rx ? regex(v) : null;
        if (t.rx && !ro) throw new Error('Espressione regolare non valida: ' + v);
        var ok = low(v);
        return need(function (rec, name) {
          var o = low(rec.o || '');
          if (ro) return ro.test(strip(rec.o || ''));
          return o.indexOf(ok.split('~').join(low(name))) >= 0;
        });
      }
      case 'keyword': { var kk = low(v); return need(function (rec) { return (rec.kw || []).some(function (k) { return low(k).indexOf(kk) === 0; }); }); }
      case 'mana': {
        var want = (String(v).match(/\{[^}]+\}|[0-9]+|[A-Za-z]/g) || []).map(function (x) { return x.replace(/[{}]/g, '').toUpperCase(); });
        return need(function (rec) {
          var have = (String(rec.mc || '').match(/\{[^}]+\}/g) || []).map(function (x) { return x.replace(/[{}]/g, '').toUpperCase(); });
          var pool = have.slice();
          return want.every(function (w) { var ix = pool.indexOf(w); if (ix < 0) return false; pool.splice(ix, 1); return true; });
        });
      }
      case 'produces': {
        var pc = parseColors(v);
        if (!pc) throw new Error('Colore non valido: ' + v);
        return need(function (rec) { var p = String(rec.pm || ''); return pc.special === 'c' ? p.indexOf('C') >= 0 : cmpSets(p, pc.set, op === ':' ? '>=' : op) && pc.set.length > 0; });
      }
      case 'color': case 'identity': {
        var pcv = parseColors(v);
        if (!pcv) throw new Error('Colore non valido: ' + v);
        var field = t.key === 'color' ? 'c' : 'ci';
        var o2 = op === ':' && t.key === 'identity' ? '<=' : op;
        return need(function (rec) {
          var have = String(rec[field] || '');
          if (pcv.special === 'c') return o2 === '!=' ? have.length > 0 : have.length === 0;
          if (pcv.special === 'm') return o2 === '!=' ? have.length < 2 : cmpNum(have.length, 2, o2 === ':' ? '>=' : o2);
          return cmpSets(have, pcv.set, o2);
        });
      }
      case 'mv': {
        var nv = parseFloat(v);
        if (isNaN(nv)) throw new Error('«' + v + '» non è un numero.');
        return need(function (rec) { return cmpNum(rec.v || 0, nv, op); });
      }
      case 'pow': case 'tou': {
        var nn = parseFloat(v);
        if (isNaN(nn)) throw new Error('«' + v + '» non è un numero.');
        var f = t.key === 'pow' ? 'pw' : 'tg';
        return need(function (rec) { var x = parseFloat(rec[f]); return isNaN(x) ? false : cmpNum(x, nn, op); });
      }
      case 'eur': {
        var ne = parseFloat(String(v).replace(',', '.'));
        if (isNaN(ne)) throw new Error('«' + v + '» non è un prezzo.');
        return function (name, rec, pr) {
          var p = pr && pr.p != null ? pr.p : rec ? rec.p : undefined;
          if (!rec && !pr) return null;
          return p == null ? false : cmpNum(p, ne, op);
        };
      }
      case 'rarity': {
        var rv = RAR[low(v)];
        if (!rv) throw new Error('Rarità non valida: ' + v);
        return need(function (rec) { var x = RAR_CODE[rec.r]; return x ? cmpNum(x, rv, op) : false; });
      }
      case 'is': {
        var iv = low(v);
        return need(function (rec) {
          var tl = low(rec.t || '');
          if (iv === 'dfc') return !!rec.dfc;
          if (iv === 'legendary') return tl.indexOf('legendary') >= 0;
          if (iv === 'commander') return tl.indexOf('legendary') >= 0 && (tl.indexOf('creature') >= 0 || /can be your commander/i.test(rec.o || ''));
          if (iv === 'multicolor') return String(rec.c || '').length >= 2;
          if (iv === 'mono' || iv === 'monocolor') return String(rec.c || '').length === 1;
          if (iv === 'colorless') return String(rec.c || '').length === 0;
          if (iv === 'land') return tl.indexOf('land') >= 0;
          return false;
        });
      }
    }
    throw new Error('Non conosco «' + t.key + '».');
  }
  function build(ast) {
    switch (ast.op) {
      case 'true': return { fn: function () { return true; }, data: false };
      case 'term': return { fn: termFn(ast), data: !!DATA_FIELDS[ast.key] };
      case 'not': { var a = build(ast.a); return { fn: function (n, r, p) { var x = a.fn(n, r, p); return x === null ? null : !x; }, data: a.data }; }
      case 'and': case 'or': {
        var kids = ast.a.map(build), comb = ast.op === 'and' ? and3 : or3;
        return { fn: function (n, r, p) { return comb(kids.map(function (k) { return k.fn(n, r, p); })); }, data: kids.some(function (k) { return k.data; }) };
      }
    }
    throw new Error('?');
  }

  /* compile('t:creature mv<=3') -> {ok, error, needsData, test(name, rec, print)} */
  function compile(src) {
    src = String(src == null ? '' : src);
    if (!src.trim()) return { ok: true, empty: true, needsData: false, test: function () { return true; } };
    try {
      var b = build(parse(src));
      return { ok: true, empty: false, needsData: b.data, test: b.fn };
    } catch (e) {
      return { ok: false, error: e.message || String(e), needsData: false, test: function () { return true; } };
    }
  }

  /* ----- filtri a pulsanti -> testo di ricerca -----
   * f = {colors:'WU', cmode:'any'|'exact'|'max', types:['creature',...], cost:['0','1',...,'7+'], rar:['c','u','r','m'], text:'draw a card'} */
  function q(v) { return /[\s()"]/.test(v) ? '"' + String(v).replace(/"/g, '') + '"' : v; }
  function filtersQuery(f) {
    f = f || {};
    var out = [];
    var colors = String(f.colors || '').toLowerCase().replace(/[^wubrgc]/g, '');
    if (colors) {
      if (colors === 'c') out.push('c:c');
      else {
        var cs = colors.replace(/c/g, '');
        out.push((f.cmode === 'exact' ? 'c=' : f.cmode === 'max' ? 'c<=' : 'c>=') + cs);
      }
    }
    function group(list, make) {
      list = (list || []).filter(Boolean);
      if (!list.length) return;
      var items = list.map(make);
      out.push(items.length === 1 ? items[0] : '(' + items.join(' or ') + ')');
    }
    group(f.types, function (t) { return 't:' + q(t); });
    group(f.cost, function (c) { return /\+$/.test(c) ? 'mv>=' + parseInt(c, 10) : 'mv=' + parseInt(c, 10); });
    group(f.rar, function (r) { return 'r:' + r; });
    if (f.text && String(f.text).trim()) out.push('o:' + q(String(f.text).trim()));
    return out.join(' ');
  }

  /* Esempi per l'aiuto: [testo, spiegazione] */
  var EXAMPLES = [
    ['t:creature c:g mv<=3', 'creature verdi che costano al massimo 3'],
    ['o:"draw a card"', 'carte con quel testo'],
    ['t:legendary id<=wub', 'leggendarie che entrano in un commander W/U/B'],
    ['r:mythic or r:rare', 'rare e mitiche'],
    ['eur>10', 'carte da più di 10 €'],
    ['-t:land produces:g', 'fonti di mana verde che non sono terre'],
    ['kw:flying c>=u', 'volanti con almeno il blu']
  ];

  return { compile: compile, parse: parse, filtersQuery: filtersQuery, norm: norm, parseColors: parseColors, EXAMPLES: EXAMPLES, TYPE_IT: TYPE_IT };
});
