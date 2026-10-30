/* Coglio Proxy Builder - motore PDF e impaginazione (nessun accesso al DOM, nessuna dipendenza).
 * Scrive il PDF a mano: i JPEG vengono incorporati cosi' come sono (filtro DCTDecode, nessuna ricompressione),
 * guide, angoli e abbondanza sono vettoriali. Usato dall'app e dai test Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CPAPdf = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MM = 72 / 25.4;
  function pt(mm) { return mm * MM; }
  function n3(x) {
    if (!isFinite(x)) return '0';
    var s = (Math.round(x * 1000) / 1000).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
    return s === '-0' ? '0' : s;
  }

  var PAPERS = {
    a4: { label: 'A4', w: 210, h: 297 },
    letter: { label: 'Letter', w: 215.9, h: 279.4 },
    a3: { label: 'A3', w: 297, h: 420 },
    a5: { label: 'A5', w: 148, h: 210 },
    legal: { label: 'Legal', w: 215.9, h: 355.6 },
    tabloid: { label: 'Tabloid', w: 279.4, h: 431.8 },
    custom: { label: 'Personalizzata', w: 210, h: 297 }
  };
  var CARD_SIZES = {
    mtg: { label: 'Magic 63 × 88 mm', w: 63, h: 88 },
    poker: { label: 'Poker 63,5 × 88,9 mm', w: 63.5, h: 88.9 },
    bridge: { label: 'Bridge 57 × 89 mm', w: 57, h: 89 },
    mini: { label: 'Mini 41 × 63 mm', w: 41, h: 63 },
    tarot: { label: 'Tarocchi 70 × 120 mm', w: 70, h: 120 },
    custom: { label: 'Personalizzata', w: 63, h: 88 }
  };

  var DEFAULTS = {
    paper: 'a4', pageW: 210, pageH: 297, orientation: 'portrait',
    card: 'mtg', cardW: 63, cardH: 88, cornerR: 3,
    rotateCards: false,
    bleed: 0,            // mm di abbondanza attorno alla carta
    imageBleed: 0,       // mm di abbondanza gia' presenti nelle immagini (di norma 0; utile per file propri)
    fill: 'auto',        // colore dell'abbondanza: auto | black | white | #rrggbb
    corners: 'keep',     // angoli: keep (come l'immagine) | black | white (riempie) | crop (quadrati: ingrandisce ~3% e ritaglia)
    header: true,        // logo e nome dell'app nel margine in alto del foglio (solo se c'e' spazio)
    fit: 'auto',         // immagini non in proporzione: auto | cover | contain | stretch
    cols: 0, rows: 0,    // 0 = quante ne entrano
    gapX: 0, gapY: 0, margin: 3,
    offsetX: 0, offsetY: 0, // spostamento stampante (mm): + destra / + giu'
    backOffsetX: 0, backOffsetY: 0,
    guides: 'crop',      // none | crop | lines
    guideColor: '#000000', guideWidth: 0.1, guideLength: 3, guideDash: false,
    reg: 'none',         // segni di registrazione per plotter: none | silhouette | four
    duplex: 'none',      // none (i retro sono carte a se') | long | short
    interleave: true,    // fronte e retro alternati (stampa fronte-retro automatica)
    decklist: false,
    pageRange: ''
  };

  function num(v, d, lo, hi) {
    v = parseFloat(String(v).replace(',', '.'));
    if (!isFinite(v)) v = d;
    if (lo != null && v < lo) v = lo;
    if (hi != null && v > hi) v = hi;
    return v;
  }
  function pick(v, list, d) { return list.indexOf(v) >= 0 ? v : d; }
  function color(c, d) {
    c = String(c == null ? '' : c).trim().toLowerCase();
    if (c === 'black') return '#000000';
    if (c === 'white') return '#ffffff';
    var m = /^#([0-9a-f]{3})$/.exec(c);
    if (m) return '#' + m[1].split('').map(function (x) { return x + x; }).join('');
    return /^#[0-9a-f]{6}$/.test(c) ? c : d;
  }

  /* Valori di ingresso (anche stringhe del modulo) -> opzioni valide e limitate. */
  function normalize(opts) {
    var i = opts || {}, o = {}, k;
    for (k in DEFAULTS) o[k] = DEFAULTS[k];
    for (k in i) if (i[k] !== undefined && i[k] !== null) o[k] = i[k];
    o.paper = PAPERS[o.paper] ? o.paper : 'a4';
    if (o.paper !== 'custom') { o.pageW = PAPERS[o.paper].w; o.pageH = PAPERS[o.paper].h; }
    o.pageW = num(o.pageW, 210, 50, 1500); o.pageH = num(o.pageH, 297, 50, 1500);
    o.orientation = pick(o.orientation, ['portrait', 'landscape'], 'portrait');
    o.card = CARD_SIZES[o.card] ? o.card : 'mtg';
    if (o.card !== 'custom') { o.cardW = CARD_SIZES[o.card].w; o.cardH = CARD_SIZES[o.card].h; }
    o.cardW = num(o.cardW, 63, 10, 400); o.cardH = num(o.cardH, 88, 10, 400);
    o.cornerR = num(o.cornerR, 3, 0, Math.min(o.cardW, o.cardH) / 2);
    o.rotateCards = !!o.rotateCards;
    o.bleed = num(o.bleed, 0, 0, 20); o.imageBleed = num(o.imageBleed, 0, 0, 20);
    o.fill = (o.fill === 'auto') ? 'auto' : color(o.fill, 'auto');
    o.corners = pick(o.corners, ['keep', 'black', 'white', 'crop'], 'keep');
    o.header = o.header !== false;
    o.fit = pick(o.fit, ['auto', 'cover', 'contain', 'stretch'], 'auto');
    o.cols = Math.floor(num(o.cols, 0, 0, 50)); o.rows = Math.floor(num(o.rows, 0, 0, 50));
    o.gapX = num(o.gapX, 0, 0, 100); o.gapY = num(o.gapY, 0, 0, 100); o.margin = num(o.margin, 3, 0, 100);
    o.offsetX = num(o.offsetX, 0, -50, 50); o.offsetY = num(o.offsetY, 0, -50, 50);
    o.backOffsetX = num(o.backOffsetX, 0, -50, 50); o.backOffsetY = num(o.backOffsetY, 0, -50, 50);
    o.guides = pick(o.guides, ['none', 'crop', 'lines'], 'crop');
    o.guideColor = color(o.guideColor, '#000000');
    o.guideWidth = num(o.guideWidth, 0.1, 0.02, 2); o.guideLength = num(o.guideLength, 3, 0.5, 30);
    o.guideDash = !!o.guideDash;
    o.reg = pick(o.reg, ['none', 'silhouette', 'four'], 'none');
    o.duplex = pick(o.duplex, ['none', 'long', 'short'], 'none');
    o.interleave = o.interleave !== false;
    o.decklist = !!o.decklist;
    o.pageRange = String(o.pageRange || '');
    return o;
  }

  /* "1-3, 5" -> [1,2,3,5] entro n pagine; vuoto = tutte; pezzi non validi ignorati. */
  function parseRange(str, n) {
    var s = String(str == null ? '' : str).trim(), all = [], i;
    for (i = 1; i <= n; i++) all.push(i);
    if (!s) return all;
    var seen = {}, out = [];
    s.split(/[,;\s]+/).forEach(function (tok) {
      if (!tok) return;
      var m = /^(\d+)?\s*-\s*(\d+)?$/.exec(tok), a, b;
      if (m && (m[1] || m[2])) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : n; }
      else if (/^\d+$/.test(tok)) { a = b = +tok; }
      else return;
      if (a > b) { var t = a; a = b; b = t; }
      for (var p = Math.max(1, a); p <= Math.min(n, b); p++) if (!seen[p]) { seen[p] = 1; out.push(p); }
    });
    return out.sort(function (x, y) { return x - y; });
  }

  /* ---------- geometria della griglia (mm, y dall'alto) ---------- */
  function geometry(opts) {
    var o = normalize(opts);
    var landscape = o.orientation === 'landscape';
    var pageW = landscape ? Math.max(o.pageW, o.pageH) : Math.min(o.pageW, o.pageH);
    var pageH = landscape ? Math.min(o.pageW, o.pageH) : Math.max(o.pageW, o.pageH);
    var cellW = o.cardW + 2 * o.bleed, cellH = o.cardH + 2 * o.bleed;
    var pcw = o.rotateCards ? cellH : cellW, pch = o.rotateCards ? cellW : cellH;
    var cols = o.cols || Math.max(1, Math.floor((pageW - 2 * o.margin + o.gapX) / (pcw + o.gapX) + 1e-9));
    var rows = o.rows || Math.max(1, Math.floor((pageH - 2 * o.margin + o.gapY) / (pch + o.gapY) + 1e-9));
    var gridW = cols * pcw + (cols - 1) * o.gapX, gridH = rows * pch + (rows - 1) * o.gapY;
    var warnings = [];
    var x0 = (pageW - gridW) / 2 + o.offsetX, y0 = (pageH - gridH) / 2 + o.offsetY;
    if (gridW > pageW + 1e-6 || gridH > pageH + 1e-6) {
      warnings.push('La griglia (' + n3(gridW) + ' × ' + n3(gridH) + ' mm) è più grande della pagina (' + n3(pageW) + ' × ' + n3(pageH) + ' mm): riduci colonne, righe o spazi.');
    } else if (x0 < -1e-6 || y0 < -1e-6 || x0 + gridW > pageW + 1e-6 || y0 + gridH > pageH + 1e-6) {
      warnings.push('Con lo spostamento impostato alcune carte escono dal bordo della pagina.');
    }
    var regSpace = o.reg === 'none' ? null : regMarks(o, pageW, pageH);
    if (regSpace) {
      var clr = 5; // zona libera attorno ai segni, che il sensore del plotter deve vedere pulita
      var hit = regSpace.some(function (m) { return m.boxes.some(function (b) { return !(b.x + b.w + clr <= x0 || b.x - clr >= x0 + gridW || b.y + b.h + clr <= y0 || b.y - clr >= y0 + gridH); }); });
      if (hit) warnings.push('I segni di registrazione sono troppo vicini alle carte (serve ~5 mm liberi): riduci la griglia (ad esempio 3 × 2) o l’abbondanza, oppure aumenta il margine.');
    }
    return {
      pageW: pageW, pageH: pageH, landscape: landscape, cols: cols, rows: rows, perPage: cols * rows,
      cellW: cellW, cellH: cellH, pcw: pcw, pch: pch, gridW: gridW, gridH: gridH, x0: x0, y0: y0, warnings: warnings
    };
  }
  function slotAt(g, o, c, r, dx, dy) {
    var x = g.x0 + c * (g.pcw + o.gapX) + (dx || 0), y = g.y0 + r * (g.pch + o.gapY) + (dy || 0);
    return { c: c, r: r, x: x, y: y, w: g.pcw, h: g.pch, tx: x + o.bleed, ty: y + o.bleed, tw: g.pcw - 2 * o.bleed, th: g.pch - 2 * o.bleed };
  }
  /* Posizione del retro in stampa fronte-retro: specchiato rispetto al lato su cui si gira il foglio. */
  function mirror(c, r, g, o) {
    var flipCols = (o.duplex === 'long') !== g.landscape;
    return flipCols ? { c: g.cols - 1 - c, r: r } : { c: c, r: g.rows - 1 - r };
  }

  /* Segni di registrazione tipici dei plotter da taglio (Silhouette): angoli a L da 0,5 mm, bracci da 10 mm, a 10 mm dal bordo. */
  function regMarks(o, W, H) {
    var inset = 10, leg = 10, th = 0.5, pos = [['tl', inset, inset, 1, 1], ['tr', W - inset, inset, -1, 1], ['bl', inset, H - inset, 1, -1], ['br', W - inset, H - inset, -1, -1]];
    var list = o.reg === 'silhouette' ? pos.slice(0, 3) : pos;
    return list.map(function (p) {
      var x = p[1], y = p[2], sx = p[3], sy = p[4];
      return {
        id: p[0], x: x, y: y, sx: sx, sy: sy, leg: leg, th: th,
        boxes: [
          { x: Math.min(x, x + sx * leg), y: y - th / 2, w: leg, h: th },
          { x: x - th / 2, y: Math.min(y, y + sy * leg), w: th, h: leg }
        ]
      };
    });
  }

  /* ---------- elenco carte -> pagine ---------- */
  function expand(items, o) {
    var out = [];
    (items || []).forEach(function (it) {
      var q = Math.max(0, Math.floor(it.qty == null ? 1 : it.qty));
      for (var k = 0; k < q; k++) {
        out.push({ name: it.name, set: it.set, cn: it.cn, img: it.front || null, backImg: (o.duplex !== 'none' && it.back) ? it.back : null, face: 'front' });
        if (o.duplex === 'none' && it.back) out.push({ name: it.backName || it.name, set: it.set, cn: it.cn, img: it.back, backImg: null, face: 'back' });
      }
    });
    return out;
  }

  function listLines(items) {
    return (items || []).filter(function (it) { return (it.qty == null ? 1 : it.qty) > 0; }).map(function (it) {
      var q = it.qty == null ? 1 : it.qty;
      return q + 'x ' + it.name + (it.set ? '  (' + String(it.set).toUpperCase() + (it.cn ? ' ' + it.cn : '') + ')' : '');
    });
  }

  function makePlan(opts, items) {
    var o = normalize(opts), g = geometry(o), cards = expand(items, o), pages = [], i, j;
    var sheets = Math.ceil(cards.length / g.perPage);
    var fronts = [], backs = [];
    for (i = 0; i < sheets; i++) {
      var chunk = cards.slice(i * g.perPage, (i + 1) * g.perPage), fs = [], bs = [];
      for (j = 0; j < chunk.length; j++) {
        var c = j % g.cols, r = Math.floor(j / g.cols), s = slotAt(g, o, c, r, 0, 0);
        s.card = chunk[j]; fs.push(s);
        if (chunk[j].backImg) {
          var m = mirror(c, r, g, o), b = slotAt(g, o, m.c, m.r, o.backOffsetX, o.backOffsetY);
          b.card = { name: chunk[j].name, img: chunk[j].backImg, face: 'back' }; bs.push(b);
        }
      }
      fronts.push({ kind: 'front', sheet: i + 1, slots: fs });
      backs.push(bs.length ? { kind: 'back', sheet: i + 1, slots: bs } : null);
    }
    if (o.interleave) {
      for (i = 0; i < sheets; i++) { pages.push(fronts[i]); if (backs[i]) pages.push(backs[i]); }
    } else {
      fronts.forEach(function (p) { pages.push(p); });
      backs.forEach(function (p) { if (p) pages.push(p); });
    }
    if (o.decklist) {
      var lines = listLines(items), perCol = Math.max(1, Math.floor((g.pageH - 40) / 5)), perPage = perCol * 2;
      for (i = 0; i === 0 || i * perPage < lines.length; i++) pages.push({ kind: 'list', part: i + 1, lines: lines.slice(i * perPage, (i + 1) * perPage), perCol: perCol });
    }
    pages.forEach(function (p, k) { p.n = k + 1; });
    return {
      opts: o, geom: g, pages: pages, warnings: g.warnings.slice(),
      counts: { cards: cards.length, sheets: sheets, pages: pages.length, backs: backs.filter(Boolean).length }
    };
  }
  function selectPages(plan, range) {
    var idx = parseRange(range, plan.pages.length);
    return idx.map(function (n) { return plan.pages[n - 1]; });
  }

  /* ---------- JPEG ---------- */
  function parseJpeg(b) {
    if (!(b && b.length > 4 && b[0] === 0xFF && b[1] === 0xD8)) throw new Error('Non è un JPEG');
    var i = 2, adobe = false;
    while (i + 3 < b.length) {
      if (b[i] !== 0xFF) { i++; continue; }
      var m = b[i + 1];
      if (m === 0xFF) { i++; continue; }
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
      if (m === 0xD9) break;
      var len = (b[i + 2] << 8) | b[i + 3];
      if (m === 0xEE && len >= 14 && b[i + 4] === 0x41 && b[i + 5] === 0x64 && b[i + 6] === 0x6F && b[i + 7] === 0x62 && b[i + 8] === 0x65) adobe = true;
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
        if (m > 0xC2) throw new Error('JPEG non supportato (tipo ' + m.toString(16) + ')');
        var comps = b[i + 9];
        if ([1, 3, 4].indexOf(comps) < 0 || b[i + 4] !== 8) throw new Error('JPEG non supportato');
        return { bytes: b, height: (b[i + 5] << 8) | b[i + 6], width: (b[i + 7] << 8) | b[i + 8], comps: comps, adobe: adobe, progressive: m === 0xC2 };
      }
      i += 2 + len;
    }
    throw new Error('JPEG non valido');
  }

  /* ---------- testo (Helvetica, WinAnsi) ---------- */
  var HW = '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584'.split(' ');
  var CP1252 = { 8364: 128, 8218: 130, 402: 131, 8222: 132, 8230: 133, 8224: 134, 8225: 135, 710: 136, 8240: 137, 352: 138, 8249: 139, 338: 140, 381: 142, 8216: 145, 8217: 146, 8220: 147, 8221: 148, 8226: 149, 8211: 150, 8212: 151, 732: 152, 8482: 153, 353: 154, 8250: 155, 339: 156, 382: 158, 376: 159 };
  function encByte(code) {
    if (code >= 32 && code < 127) return code;
    if (code >= 160 && code <= 255) return code;
    if (CP1252[code]) return CP1252[code];
    return 63;
  }
  function pdfText(s) {
    var out = '';
    String(s).replace(/[\r\n\t]+/g, ' ').split('').forEach(function (ch) {
      var b = encByte(ch.charCodeAt(0));
      if (b === 40 || b === 41 || b === 92) out += '\\' + String.fromCharCode(b);
      else if (b > 126) out += '\\' + ('00' + b.toString(8)).slice(-3);
      else out += String.fromCharCode(b);
    });
    return out;
  }
  function textWidth(s, size) {
    var w = 0;
    String(s).split('').forEach(function (ch) {
      var c = ch.charCodeAt(0);
      if (c < 32 || c > 126) { c = ch.normalize ? ch.normalize('NFD').charCodeAt(0) : 63; }
      w += (c >= 32 && c <= 126) ? +HW[c - 32] : 556;
    });
    return w * size / 1000;
  }
  function fitText(s, size, maxPt) {
    s = String(s);
    if (textWidth(s, size) <= maxPt) return s;
    while (s.length > 1 && textWidth(s + '...', size) > maxPt) s = s.slice(0, -1);
    return s + '...';
  }

  /* ---------- scrittura PDF ---------- */
  function latin1(s) {
    var u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 255;
    return u;
  }
  function Writer() { this.objs = []; }
  Writer.prototype.alloc = function () { this.objs.push(null); return this.objs.length; };
  Writer.prototype.set = function (id, parts) { this.objs[id - 1] = Array.isArray(parts) ? parts : [parts]; };
  Writer.prototype.add = function (parts) { var id = this.alloc(); this.set(id, parts); return id; };
  Writer.prototype.bytes = function (rootId, infoId) {
    var chunks = [], len = 0, offs = [], self = this;
    function push(x) { var u = typeof x === 'string' ? latin1(x) : x; chunks.push(u); len += u.length; }
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    this.objs.forEach(function (parts, i) {
      offs[i] = len;
      push((i + 1) + ' 0 obj\n');
      (parts || ['null']).forEach(push);
      push('\nendobj\n');
    });
    var x = len, n = this.objs.length + 1, xr = 'xref\n0 ' + n + '\n0000000000 65535 f \n';
    offs.forEach(function (o) { xr += ('0000000000' + o).slice(-10) + ' 00000 n \n'; });
    xr += 'trailer\n<< /Size ' + n + ' /Root ' + rootId + ' 0 R' + (infoId ? ' /Info ' + infoId + ' 0 R' : '') + ' >>\nstartxref\n' + x + '\n%%EOF\n';
    push(xr);
    var out = new Uint8Array(len), p = 0;
    chunks.forEach(function (c) { out.set(c, p); p += c.length; });
    return out;
  };

  function rgb(hex) {
    var h = String(hex).replace('#', '');
    return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
  }
  function fillOp(hex) { var c = rgb(hex); return n3(c[0]) + ' ' + n3(c[1]) + ' ' + n3(c[2]) + ' rg'; }
  function strokeOp(hex) { var c = rgb(hex); return n3(c[0]) + ' ' + n3(c[1]) + ' ' + n3(c[2]) + ' RG'; }

  /* Costruttore di contenuti di pagina: coordinate in mm, y dall'alto, convertite in punti. */
  function Canvas(H) { this.H = H; this.ops = []; }
  Canvas.prototype.raw = function (s) { this.ops.push(s); };
  Canvas.prototype.Y = function (y) { return n3(pt(this.H - y)); };
  Canvas.prototype.line = function (x1, y1, x2, y2) { this.ops.push(n3(pt(x1)) + ' ' + this.Y(y1) + ' m ' + n3(pt(x2)) + ' ' + this.Y(y2) + ' l S'); };
  Canvas.prototype.rect = function (x, y, w, h, mode) { this.ops.push(n3(pt(x)) + ' ' + this.Y(y + h) + ' ' + n3(pt(w)) + ' ' + n3(pt(h)) + ' re ' + (mode || 'S')); };
  Canvas.prototype.style = function (hex, widthMm, dash) {
    this.ops.push(strokeOp(hex) + ' ' + n3(pt(widthMm)) + ' w' + (dash ? ' [' + n3(pt(1)) + ' ' + n3(pt(0.8)) + '] 0 d' : ' [] 0 d'));
  };
  Canvas.prototype.text = function (s, x, y, size, bold, hex, tc) {
    this.ops.push('BT ' + (hex ? fillOp(hex) + ' ' : '0 g ') + (tc ? n3(tc) + ' Tc ' : '') + '/' + (bold ? 'F2' : 'F1') + ' ' + n3(size) + ' Tf ' + n3(pt(x)) + ' ' + this.Y(y) + ' Td (' + pdfText(s) + ') Tj ET');
  };

  /* Un angolo "tra il quadrato e l'arco" (mm, coordinate locali con y verso l'alto). */
  function cornerPatch(x, y, r, sx, sy) {
    var k = 0.5523 * r, P = function (a, b) { return n3(pt(a)) + ' ' + n3(pt(b)); };
    var x1 = x + sx * r, y1 = y + sy * r;
    return P(x, y) + ' m ' + P(x1, y) + ' l ' +
      P(x1 - sx * k, y) + ' ' + P(x, y1 - sy * k) + ' ' + P(x, y1) + ' c h f';
  }

  function resolveFill(o, img) {
    if (o.fill !== 'auto') return o.fill;
    var b = img && img.border;
    if (b === 'white') return '#ffffff';
    if (b && /^#[0-9a-f]{6}$/i.test(b)) return b.toLowerCase();
    return '#000000';
  }

  function squareInset(o) { return Math.round(o.cornerR * 0.293 * 1.3 * 100) / 100; }

  /* Disegna una carta nella sua cella. */
  function drawCard(cv, o, g, s, imgName) {
    var card = s.card, img = card.img, lw = g.cellW, lh = g.cellH, rot = o.rotateCards;
    var X = pt(s.x), Y = pt(g.pageH - (s.y + s.h));
    cv.raw('q');
    if (rot) cv.raw('0 1 -1 0 ' + n3(X + pt(s.w)) + ' ' + n3(Y) + ' cm');
    else cv.raw('1 0 0 1 ' + n3(X) + ' ' + n3(Y) + ' cm');
    var fill = resolveFill(o, img);
    if (o.bleed > 0 || !img) { cv.raw(fillOp(img ? fill : '#f4f4f4')); cv.raw('0 0 ' + n3(pt(lw)) + ' ' + n3(pt(lh)) + ' re f'); }
    cv.raw('0 0 ' + n3(pt(lw)) + ' ' + n3(pt(lh)) + ' re W n');
    var square = o.corners === 'crop' && img && img.cornerPatch !== false && o.cornerR > 0;
    if (square) cv.raw(n3(pt(o.bleed)) + ' ' + n3(pt(o.bleed)) + ' ' + n3(pt(o.cardW)) + ' ' + n3(pt(o.cardH)) + ' re W n');
    if (img) {
      /* angoli quadrati: l'angolo del rettangolo deve cadere dentro l'arco, quindi si ingrandisce l'immagine di d per lato (d = 0,293 R, piu' un po' di margine) */
      var ib = img.bleed != null ? img.bleed : o.imageBleed, bw = o.cardW + 2 * ib, bh = o.cardH + 2 * ib, iw = bw, ih = bh;
      if (square) { var d = squareInset(o); bw += 2 * d; bh += 2 * d; iw = bw; ih = bh; }
      var ar = img.width / img.height, br = bw / bh, mode = o.fit;
      if (mode === 'auto') mode = Math.abs(ar / br - 1) < 0.01 ? 'stretch' : 'cover';
      if (mode === 'cover') { if (ar > br) iw = bh * ar; else ih = bw / ar; }
      else if (mode === 'contain') { if (ar > br) ih = bw / ar; else iw = bh * ar; }
      cv.raw(n3(pt(iw)) + ' 0 0 ' + n3(pt(ih)) + ' ' + n3(pt((lw - iw) / 2)) + ' ' + n3(pt((lh - ih) / 2)) + ' cm');
      cv.raw('/' + imgName(img) + ' Do');
    } else {
      var tx = pt(o.bleed) + 6, ty = pt(lh) / 2;
      cv.raw('BT 0.35 g /F2 9 Tf ' + n3(tx) + ' ' + n3(ty) + ' Td (' + pdfText(fitText(card.name || '', 9, pt(o.cardW) - 12)) + ') Tj ET');
      cv.raw('BT 0.5 g /F1 7 Tf ' + n3(tx) + ' ' + n3(ty - 11) + ' Td (' + pdfText('immagine non trovata') + ') Tj ET');
      cv.raw('0.6 G 0.5 w ' + n3(pt(o.bleed)) + ' ' + n3(pt(o.bleed)) + ' ' + n3(pt(o.cardW)) + ' ' + n3(pt(o.cardH)) + ' re S');
    }
    cv.raw('Q');
  }

  /* Angoli arrotondati ripassati sopra l'immagine (di solito neri su carte con bordo bianco). */
  function drawCornerPatches(cv, o, g, s) {
    var rot = o.rotateCards, X = pt(s.x), Y = pt(g.pageH - (s.y + s.h));
    cv.raw('q');
    if (rot) cv.raw('0 1 -1 0 ' + n3(X + pt(s.w)) + ' ' + n3(Y) + ' cm'); else cv.raw('1 0 0 1 ' + n3(X) + ' ' + n3(Y) + ' cm');
    var r = o.cornerR, b = o.bleed, w = o.cardW, h = o.cardH;
    cv.raw(fillOp(o.corners === 'white' ? '#ffffff' : '#000000'));
    cv.raw(cornerPatch(b, b, r, 1, 1)); cv.raw(cornerPatch(b + w, b, r, -1, 1));
    cv.raw(cornerPatch(b, b + h, r, 1, -1)); cv.raw(cornerPatch(b + w, b + h, r, -1, -1));
    cv.raw('Q');
  }

  /* Intervalli [a,b] di [0,len] non coperti dagli intervalli dati. */
  function freeIntervals(len, covered) {
    var cs = covered.slice().sort(function (p, q) { return p[0] - q[0]; }), out = [], cur = 0;
    cs.forEach(function (c) { if (c[0] > cur + 0.01) out.push([cur, c[0]]); cur = Math.max(cur, c[1]); });
    if (cur < len - 0.01) out.push([cur, len]);
    return out;
  }

  function drawGuides(cv, o, g, slots) {
    if (o.guides === 'none' || !slots.length) return;
    cv.raw('q');
    cv.style(o.guideColor, o.guideWidth, o.guideDash);
    var L = o.guideLength, b = o.bleed;
    if (o.guides === 'crop') {
      slots.forEach(function (s) {
        [[s.tx, s.ty, -1, -1], [s.tx + s.tw, s.ty, 1, -1], [s.tx, s.ty + s.th, -1, 1], [s.tx + s.tw, s.ty + s.th, 1, 1]].forEach(function (c) {
          cv.line(c[0] + c[2] * b, c[1], c[0] + c[2] * (b + L), c[1]);
          cv.line(c[0], c[1] + c[3] * b, c[0], c[1] + c[3] * (b + L));
        });
      });
    } else {
      var xs = {}, ys = {}, cellsY = [], cellsX = [];
      slots.forEach(function (s) {
        xs[n3(s.tx)] = s.tx; xs[n3(s.tx + s.tw)] = s.tx + s.tw; ys[n3(s.ty)] = s.ty; ys[n3(s.ty + s.th)] = s.ty + s.th;
        cellsY.push([s.y, s.y + s.h]); cellsX.push([s.x, s.x + s.w]);
      });
      Object.keys(xs).forEach(function (k) {
        freeIntervals(g.pageH, cellsY).forEach(function (iv) { cv.line(xs[k], iv[0], xs[k], iv[1]); });
      });
      Object.keys(ys).forEach(function (k) {
        freeIntervals(g.pageW, cellsX).forEach(function (iv) { cv.line(iv[0], ys[k], iv[1], ys[k]); });
      });
    }
    cv.raw('Q');
  }

  function drawReg(cv, o, g) {
    if (o.reg === 'none') return;
    cv.raw('q 0 G 0 g'); cv.style('#000000', 0.5, false);
    regMarks(o, g.pageW, g.pageH).forEach(function (m) {
      cv.line(m.x, m.y, m.x + m.sx * m.leg, m.y); cv.line(m.x, m.y, m.x, m.y + m.sy * m.leg);
    });
    cv.raw('Q');
  }


  /* Logo e nome dell'app nel margine in alto (versione vettoriale del logo dell'interfaccia). */
  function rrect(x, y, w, h, r) {
    var k = 0.5523 * r, N = n3;
    return N(x + r) + ' ' + N(y) + ' m ' + N(x + w - r) + ' ' + N(y) + ' l ' +
      N(x + w - r + k) + ' ' + N(y) + ' ' + N(x + w) + ' ' + N(y + r - k) + ' ' + N(x + w) + ' ' + N(y + r) + ' c ' + N(x + w) + ' ' + N(y + h - r) + ' l ' +
      N(x + w) + ' ' + N(y + h - r + k) + ' ' + N(x + w - r + k) + ' ' + N(y + h) + ' ' + N(x + w - r) + ' ' + N(y + h) + ' c ' + N(x + r) + ' ' + N(y + h) + ' l ' +
      N(x + r - k) + ' ' + N(y + h) + ' ' + N(x) + ' ' + N(y + h - r + k) + ' ' + N(x) + ' ' + N(y + h - r) + ' c ' + N(x) + ' ' + N(y + r) + ' l ' +
      N(x) + ' ' + N(y + r - k) + ' ' + N(x + r - k) + ' ' + N(y) + ' ' + N(x + r) + ' ' + N(y) + ' c h';
  }
  function rotAbout(a, cx, cy) {
    var r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return [c, s, -s, c, cx - cx * c + cy * s, cy - cx * s - cy * c].map(n3).join(' ') + ' cm';
  }
  function headerRoom(o, g) { return o.header && g.y0 >= 11 && g.x0 >= 0; }
  function drawHeader(cv, o, g) {
    if (!headerRoom(o, g)) return;
    var S = 7, x = g.x0, y = (g.y0 - S) / 2, k = pt(S / 40);
    var ACC = '#3347d6', c = function (hex) { return fillOp(hex) + ' ' + strokeOp(hex); };
    cv.raw('q ' + n3(k) + ' 0 0 ' + n3(-k) + ' ' + n3(pt(x)) + ' ' + n3(pt(g.pageH - y)) + ' cm');
    cv.raw('q ' + rotAbout(-14, 14, 20) + ' ' + fillOp('#e3e6fb') + ' ' + strokeOp(ACC) + ' 1.6 w ' + rrect(5, 7, 19, 26, 3.5) + ' B Q');
    cv.raw('q ' + fillOp('#ffffff') + ' ' + strokeOp(ACC) + ' 1.6 w ' + rrect(9, 5, 19, 26, 3.5) + ' B Q');
    cv.raw('q ' + rotAbout(12, 22, 20) + ' ' + fillOp(ACC) + ' ' + rrect(13, 7, 19, 26, 3.5) + ' f Q');
    var kk = 0.5523 * 8, cx = 29, cy = 29, r = 8;
    cv.raw('q ' + fillOp('#e4572e') + ' ' + n3(cx + r) + ' ' + n3(cy) + ' m ' + n3(cx + r) + ' ' + n3(cy + kk) + ' ' + n3(cx + kk) + ' ' + n3(cy + r) + ' ' + n3(cx) + ' ' + n3(cy + r) + ' c ' +
      n3(cx - kk) + ' ' + n3(cy + r) + ' ' + n3(cx - r) + ' ' + n3(cy + kk) + ' ' + n3(cx - r) + ' ' + n3(cy) + ' c ' + n3(cx - r) + ' ' + n3(cy - kk) + ' ' + n3(cx - kk) + ' ' + n3(cy - r) + ' ' + n3(cx) + ' ' + n3(cy - r) + ' c ' +
      n3(cx + kk) + ' ' + n3(cy - r) + ' ' + n3(cx + r) + ' ' + n3(cy - kk) + ' ' + n3(cx + r) + ' ' + n3(cy) + ' c h f Q');
    cv.raw('q ' + strokeOp('#ffffff') + ' 2.2 w 1 J 1 j 25.4 29.2 m 28 31.8 l 32.6 26.6 l S Q');
    cv.raw('Q');
    cv.text('Coglio', x + S + 2.2, y + 3.3, 12, true, '#14172b');
    cv.text('PROXY ARCHIVE', x + S + 2.2, y + 6.4, 5.5, false, '#586079', 1);
  }

  function drawList(cv, pg, g) {
    cv.text(pg.part === 1 ? 'Lista carte' : 'Lista carte (continua)', 15, 20, 16, true);
    var perCol = pg.perCol, colW = (g.pageW - 30) / 2;
    pg.lines.forEach(function (ln, i) {
      var col = Math.floor(i / perCol), row = i % perCol;
      cv.text(fitText(ln, 9, pt(colW - 4)), 15 + col * colW, 32 + row * 5, 9, false);
    });
  }

  function drawTestSheet(cv, o, g, plan, side) {
    var W = g.pageW, H = g.pageH, i;
    cv.raw('q'); cv.style('#000000', 0.2, false);
    cv.rect(0.1, 0.1, W - 0.2, H - 0.2, 'S');
    // righelli: tacche ogni mm, piu' lunghe ogni 5 e 10
    for (i = 1; i * 1 < W; i++) {
      var tl = i % 10 === 0 ? 5 : (i % 5 === 0 ? 3.5 : 1.8);
      cv.line(i, 0, i, tl); cv.line(i, H, i, H - tl);
    }
    for (i = 1; i * 1 < H; i++) {
      var tl2 = i % 10 === 0 ? 5 : (i % 5 === 0 ? 3.5 : 1.8);
      cv.line(0, i, tl2, i); cv.line(W, i, W - tl2, i);
    }
    for (i = 10; i < W - 6; i += 10) cv.text(String(i / 10), i - 0.8, 9, 6, false);
    for (i = 10; i < H - 6; i += 10) cv.text(String(i / 10), 7, i + 0.8, 6, false);
    // croce al centro e barra da 100 mm
    cv.style('#000000', 0.15, false);
    cv.line(W / 2 - 8, H / 2, W / 2 + 8, H / 2); cv.line(W / 2, H / 2 - 8, W / 2, H / 2 + 8);
    var by = Math.max(25, g.y0 / 2 + 8);
    if (W >= 130) { cv.style('#000000', 0.3, false); cv.line(W / 2 - 50, by, W / 2 + 50, by); cv.line(W / 2 - 50, by - 2, W / 2 - 50, by + 2); cv.line(W / 2 + 50, by - 2, W / 2 + 50, by + 2); cv.text('100 mm', W / 2 - 6, by - 3, 8, true); }
    // griglia: contorni delle carte (e della abbondanza)
    cv.style('#000000', 0.15, false);
    var slots = [], c, r;
    for (r = 0; r < g.rows; r++) for (c = 0; c < g.cols; c++) {
      var m = side === 'back' ? mirror(c, r, g, o) : { c: c, r: r };
      slots.push(slotAt(g, o, m.c, m.r, side === 'back' ? o.backOffsetX : 0, side === 'back' ? o.backOffsetY : 0));
    }
    slots.forEach(function (s, k) {
      cv.style('#000000', 0.15, true); if (o.bleed > 0) cv.rect(s.x, s.y, s.w, s.h, 'S');
      cv.style('#000000', 0.25, false); cv.rect(s.tx, s.ty, s.tw, s.th, 'S');
      cv.text(String(k + 1), s.tx + 2, s.ty + 6, 9, true);
    });
    drawGuides(cv, o, g, slots);
    drawReg(cv, o, g);
    var ty = Math.max(14, Math.min(g.y0 - 4, 20));
    cv.text((side === 'back' ? 'RETRO' : 'FRONTE') + ' - pagina di prova', 14, ty, 9, true);
    var info = 'Carta ' + n3(o.cardW) + ' x ' + n3(o.cardH) + ' mm - abbondanza ' + n3(o.bleed) + ' mm - ' + g.cols + ' x ' + g.rows + ' - ' + (g.landscape ? 'orizzontale' : 'verticale');
    cv.text(info, 14, H - 10, 7, false);
    cv.text('Stampa al 100% (non "adatta alla pagina"): la barra deve misurare 100 mm.', 14, H - 6.5, 7, false);
    cv.raw('Q');
  }

  /* ---------- costruzione del PDF ---------- */
  function renderDoc(plan, pagesToDraw, drawer) {
    var o = plan.opts, g = plan.geom, w = new Writer();
    var root = w.alloc(), pages = w.alloc(), f1 = w.alloc(), f2 = w.alloc(), info = w.alloc();
    w.set(f1, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    w.set(f2, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    w.set(info, '<< /Title (' + pdfText('Coglio Proxy Builder') + ') /Producer (Coglio Proxy Archive) >>');
    var imgIds = (typeof Map === 'function') ? new Map() : null, imgCount = 0, kids = [];
    function registerImage(img, used) {
      var rec = imgIds.get(img);
      if (!rec) {
        var cs = img.comps === 1 ? '/DeviceGray' : (img.comps === 4 ? '/DeviceCMYK' : '/DeviceRGB');
        var dec = (img.comps === 4 && img.adobe) ? ' /Decode [1 0 1 0 1 0 1 0]' : '';
        var id = w.add(['<< /Type /XObject /Subtype /Image /Width ' + img.width + ' /Height ' + img.height + ' /ColorSpace ' + cs + dec +
          ' /BitsPerComponent 8 /Filter /DCTDecode /Length ' + img.bytes.length + ' >>\nstream\n', img.bytes, '\nendstream']);
        rec = { id: id, name: 'Im' + (++imgCount) };
        imgIds.set(img, rec);
      }
      used[rec.name] = rec.id;
      return rec.name;
    }
    pagesToDraw.forEach(function (pg) {
      var H = g.pageH, cv = new Canvas(H), used = {};
      drawer(cv, pg, function (img) { return registerImage(img, used); });
      var content = cv.ops.join('\n'), cid = w.add(['<< /Length ' + content.length + ' >>\nstream\n', content, '\nendstream']);
      var xo = Object.keys(used).map(function (k) { return '/' + k + ' ' + used[k] + ' 0 R'; }).join(' ');
      var pid = w.add('<< /Type /Page /Parent ' + pages + ' 0 R /MediaBox [0 0 ' + n3(pt(g.pageW)) + ' ' + n3(pt(g.pageH)) + '] /Resources << /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 + ' 0 R >>' +
        (xo ? ' /XObject << ' + xo + ' >>' : '') + ' >> /Contents ' + cid + ' 0 R >>');
      kids.push(pid + ' 0 R');
    });
    w.set(pages, '<< /Type /Pages /Count ' + kids.length + ' /Kids [' + kids.join(' ') + '] >>');
    w.set(root, '<< /Type /Catalog /Pages ' + pages + ' 0 R >>');
    return w.bytes(root, info);
  }

  /* Una pagina del piano -> operazioni di disegno (le stesse del PDF). */
  function drawPage(cv, plan, pg, imgName) {
    var o = plan.opts, g = plan.geom;
    if (pg.kind === 'list') { drawList(cv, pg, g); return; }
    if (pg.kind === 'front') drawHeader(cv, o, g);
    drawGuides(cv, o, g, pg.slots);
    if (pg.kind === 'front') drawReg(cv, o, g);
    pg.slots.forEach(function (s) {
      drawCard(cv, o, g, s, imgName);
      if ((o.corners === 'black' || o.corners === 'white') && s.card.img && s.card.img.cornerPatch !== false && o.cornerR > 0) drawCornerPatches(cv, o, g, s);
    });
  }
  /* Per l'anteprima: stesse operazioni del PDF + elenco delle immagini usate (nome -> oggetto immagine). */
  function pageOps(plan, pg) {
    var cv = new Canvas(plan.geom.pageH), imgs = [];
    drawPage(cv, plan, pg, function (img) {
      var i = imgs.indexOf(img);
      if (i < 0) { imgs.push(img); i = imgs.length - 1; }
      return 'Im' + (i + 1);
    });
    return { ops: cv.ops.join('\n'), images: imgs, widthPt: pt(plan.geom.pageW), heightPt: pt(plan.geom.pageH) };
  }

  /* ---------- anteprima: esegue le operazioni del PDF su un canvas 2D ---------- */
  function tokenize(s) {
    var out = [], i = 0, n = s.length, j, c;
    while (i < n) {
      c = s.charAt(i);
      if (c <= ' ') { i++; continue; }
      if (c === '(') {
        var depth = 1, str = ''; j = i + 1;
        while (j < n && depth > 0) {
          var ch = s.charAt(j);
          if (ch === '\\') {
            var nx = s.charAt(j + 1);
            if (nx >= '0' && nx <= '7') { var oct = nx, k = j + 2; while (k < j + 4 && s.charAt(k) >= '0' && s.charAt(k) <= '7') { oct += s.charAt(k); k++; } str += String.fromCharCode(parseInt(oct, 8)); j = k; continue; }
            str += nx; j += 2; continue;
          }
          if (ch === '(') depth++;
          else if (ch === ')') { depth--; if (depth === 0) { j++; break; } }
          str += ch; j++;
        }
        out.push({ s: str }); i = j; continue;
      }
      if (c === '[' || c === ']') { out.push(c); i++; continue; }
      j = i; while (j < n && s.charAt(j) > ' ' && '()[]'.indexOf(s.charAt(j)) < 0) j++;
      out.push(s.slice(i, j)); i = j;
    }
    return out;
  }
  function css(r, g, b) { return 'rgb(' + Math.round(r * 255) + ',' + Math.round(g * 255) + ',' + Math.round(b * 255) + ')'; }
  /* ctx: CanvasRenderingContext2D; getImage(oggetto immagine) -> drawable oppure null. Restituisce quante immagini ha disegnato. */
  function paint(ctx, page, getImage, widthPx) {
    var k = widthPx / page.widthPt, hPx = page.heightPt * k, drawn = 0, stack = [], toks = tokenize(page.ops), i, ops = [];
    ctx.save();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, widthPx, hPx);
    ctx.setTransform(k, 0, 0, -k, 0, hPx);
    ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    var tx = 0, ty = 0, font = 'F1', size = 10, tc = 0, clipNext = false, args = [], arr = null;
    for (i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t === '[') { arr = []; continue; }
      if (t === ']') { args.push(arr); arr = null; continue; }
      if (typeof t === 'object') { (arr || args).push(t); continue; }
      if (/^[-+.0-9]/.test(t)) { (arr || args).push(parseFloat(t)); continue; }
      if (t.charAt(0) === '/') { args.push(t.slice(1)); continue; }
      var a = args; args = [];
      switch (t) {
        case 'q': ctx.save(); break;
        case 'Q': ctx.restore(); break;
        case 'cm': ctx.transform(a[0], a[1], a[2], a[3], a[4], a[5]); break;
        case 'w': ctx.lineWidth = a[0]; break;
        case 'J': ctx.lineCap = a[0] === 1 ? 'round' : 'butt'; break;
        case 'j': ctx.lineJoin = a[0] === 1 ? 'round' : 'miter'; break;
        case 'd': ctx.setLineDash((a[0] || []).map(Number)); break;
        case 'RG': ctx.strokeStyle = css(a[0], a[1], a[2]); break;
        case 'rg': ctx.fillStyle = css(a[0], a[1], a[2]); break;
        case 'G': ctx.strokeStyle = css(a[0], a[0], a[0]); break;
        case 'g': ctx.fillStyle = css(a[0], a[0], a[0]); break;
        case 'm': ctx.beginPath(); ctx.moveTo(a[0], a[1]); break;
        case 'l': ctx.lineTo(a[0], a[1]); break;
        case 'c': ctx.bezierCurveTo(a[0], a[1], a[2], a[3], a[4], a[5]); break;
        case 'h': ctx.closePath(); break;
        case 're': ctx.beginPath(); ctx.rect(a[0], a[1], a[2], a[3]); break;
        case 'W': clipNext = true; break;
        case 'n': if (clipNext) { ctx.clip(); clipNext = false; } ctx.beginPath(); break;
        case 'f': ctx.fill(); break;
        case 'S': ctx.stroke(); break;
        case 'B': ctx.fill(); ctx.stroke(); break;
        case 'BT': tx = 0; ty = 0; break;
        case 'ET': break;
        case 'Tc': tc = a[0]; break;
        case 'Tf': font = a[0]; size = a[1]; break;
        case 'Td': tx = a[0]; ty = a[1]; break;
        case 'Tj':
          ctx.save(); ctx.translate(tx, ty); ctx.scale(1, -1);
          ctx.font = (font === 'F2' ? 'bold ' : '') + size + 'px Helvetica, Arial, sans-serif';
          if ('letterSpacing' in ctx) ctx.letterSpacing = tc + 'px';
          ctx.fillText(a[0].s, 0, 0); ctx.restore(); break;
        case 'Do':
          var im = page.images[parseInt(String(a[0]).slice(2), 10) - 1], dr = im && getImage ? getImage(im) : null;
          ctx.save(); ctx.transform(1, 0, 0, -1, 0, 1);
          if (dr) { ctx.drawImage(dr, 0, 0, 1, 1); drawn++; } else { ctx.fillStyle = '#d9dbe3'; ctx.fillRect(0, 0, 1, 1); }
          ctx.restore(); break;
      }
    }
    ctx.restore();
    return drawn;
  }

  function build(opts, items) {
    var plan = makePlan(opts, items), o = plan.opts, g = plan.geom;
    var sel = selectPages(plan, o.pageRange);
    var bytes = renderDoc(plan, sel, function (cv, pg, imgName) { drawPage(cv, plan, pg, imgName); });
    return { bytes: bytes, pages: sel.length, totalPages: plan.pages.length, plan: plan };
  }

  /* Pagina di prova (fronte e, con la stampa fronte-retro, anche retro) con le stesse impostazioni. */
  function buildTest(opts) {
    var plan = makePlan(opts, []), o = plan.opts, g = plan.geom;
    var pgs = [{ kind: 'test', side: 'front' }];
    if (o.duplex !== 'none') pgs.push({ kind: 'test', side: 'back' });
    var bytes = renderDoc(plan, pgs, function (cv, pg) { drawTestSheet(cv, o, g, plan, pg.side); });
    return { bytes: bytes, pages: pgs.length, plan: plan };
  }

  return {
    PAPERS: PAPERS, CARD_SIZES: CARD_SIZES, DEFAULTS: DEFAULTS, pageOps: pageOps, paint: paint, tokenize: tokenize, squareInset: squareInset,
    normalize: normalize, parseRange: parseRange, geometry: geometry, makePlan: makePlan, selectPages: selectPages,
    parseJpeg: parseJpeg, build: build, buildTest: buildTest, textWidth: textWidth, pdfText: pdfText, mirror: mirror, regMarks: regMarks
  };
});
