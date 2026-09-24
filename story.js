/* story.js — turns the story text into the page. Shared by index.html (the site) and editor.html (the editor).
   The notation it understands is explained in README.md. You should not need to edit this file. */
(function (global) {
  'use strict';

  var KEY = '[\\p{L}\\p{N}_-]+';
  var BLOCK_KEY = new RegExp('^@(' + KEY + ')(?:[ \\t]*\\n|[ \\t]+|$)', 'u');
  var REVEAL_HEAD = new RegExp('^\\{(' + KEY + '):', 'u');
  var URL = /^(https?:\/\/|mailto:|tel:|www\.)/i;

  /* ---------- parsing: text -> tree ---------- */

  function parse(text) {
    text = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
    var blocks = [], problems = [], ranges = [], re = /\n[ \t]*\n/g, pos = 0, m;
    while ((m = re.exec(text))) { ranges.push([pos, m.index]); pos = m.index + m[0].length; }
    ranges.push([pos, text.length]);
    ranges.forEach(function (r) {
      var raw = text.slice(r[0], r[1]);
      var lead = raw.match(/^\s*/)[0].length;
      var start = r[0] + lead;
      raw = raw.slice(lead).replace(/\s+$/, '');
      if (!raw) return;
      var key = null, bodyStart = start, keyEnd = start, km = raw.match(BLOCK_KEY);
      if (km) { key = km[1]; keyEnd = start + 1 + km[1].length; bodyStart = start + km[0].length; raw = raw.slice(km[0].length); }
      blocks.push({ key: key, keyStart: start, keyEnd: keyEnd, nodes: parseInline(raw, bodyStart, problems), start: start, end: bodyStart + raw.length });
    });
    return { blocks: blocks, problems: problems, text: text };
  }

  function parseInline(src, base, problems) {
    src = String(src == null ? '' : src); base = base || 0; problems = problems || [];
    var nodes = [], i = 0, n = src.length, buf = '', bufStart = 0;
    function flush() { if (buf) { nodes.push({ type: 'text', text: buf, start: base + bufStart, end: base + i }); buf = ''; } }
    function push(node) { flush(); nodes.push(node); i = node.end - base; bufStart = i; }
    while (i < n) {
      var ch = src[i], r, c, node;
      if (ch === '\\' && i + 1 < n && '[]{}!\\'.indexOf(src[i + 1]) >= 0) { if (!buf) bufStart = i; buf += src[i + 1]; i += 2; continue; }
      if (ch === '\n') { push({ type: 'br', start: base + i, end: base + i + 1 }); continue; }
      if (ch === '!' && src[i + 1] === '[' && (r = matchBracket(src, i + 1))) {
        var files = r.target.split('|');
        push({ type: 'image', alt: r.label, src: files[0].trim(), hover: (files[1] || '').trim(), start: base + i, end: base + r.end }); continue;
      }
      if (ch === '!' && src.substr(i, 7) === '!video(') {
        c = src.indexOf(')', i + 7);
        if (c > 0) { push({ type: 'video', src: src.slice(i + 7, c).trim(), start: base + i, end: base + c + 1 }); continue; }
      }
      if (ch === '[' && (r = matchBracket(src, i))) {
        node = URL.test(r.target)
          ? { type: 'link', href: /^www\./i.test(r.target) ? 'http://' + r.target : r.target }
          : { type: 'door', key: r.target.replace(/!$/, ''), vanish: /!$/.test(r.target) };
        node.start = base + i; node.end = base + r.end;
        node.labelStart = base + r.labelStart; node.labelEnd = base + r.labelStart + r.label.length;
        node.children = parseInline(r.label, node.labelStart, problems);
        push(node); continue;
      }
      if (ch === '{' && (r = matchReveal(src, i))) {
        if (r.unclosed) {
          problems.push({ message: 'The hidden text "' + r.key + '" is never closed with }', start: base + i, end: base + i + r.headLength });
        } else {
          push({ type: 'reveal', key: r.key, start: base + i, end: base + r.end, bodyStart: base + r.bodyStart,
                 children: parseInline(r.body, base + r.bodyStart, problems) });
          continue;
        }
      }
      if (!buf) bufStart = i;
      buf += ch; i++;
    }
    flush();
    return nodes;
  }

  /* "[label](target)" starting at src[i] === '['. Brackets inside the label may nest. */
  function matchBracket(src, i) {
    var depth = 0, j = i;
    for (; j < src.length; j++) {
      var c = src[j];
      if (c === '\\') { j++; continue; }
      if (c === '\n') return null;
      if (c === '[') depth++;
      else if (c === ']') { depth--; if (depth === 0) break; }
    }
    if (j >= src.length || src[j + 1] !== '(') return null;
    var close = src.indexOf(')', j + 2);
    if (close < 0) return null;
    var target = src.slice(j + 2, close).trim();
    if (!target || /\s/.test(target)) return null;
    return { label: src.slice(i + 1, j), labelStart: i + 1, target: target, end: close + 1 };
  }

  /* "{key: body}" starting at src[i] === '{'. Braces inside the body may nest. */
  function matchReveal(src, i) {
    var m = src.slice(i, i + 120).match(REVEAL_HEAD);
    if (!m) return null;
    var depth = 0, j = i;
    for (; j < src.length; j++) {
      var c = src[j];
      if (c === '\\') { j++; continue; }
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) break; }
    }
    if (j >= src.length) return { unclosed: true, key: m[1], headLength: m[0].length };
    var bodyStart = i + m[0].length;
    return { key: m[1], body: src.slice(bodyStart, j), bodyStart: bodyStart, end: j + 1 };
  }

  /* ---------- building: tree -> elements ---------- */

  function missing(opts, kind, src) {
    return opts && opts.missing ? opts.missing(kind, src) : '[' + kind + ' ' + src + ' is not in the folder yet]';
  }

  function build(container, tree, opts) {
    opts = opts || {};
    container.textContent = '';
    tree.blocks.forEach(function (block) {
      var p = document.createElement('p');
      if (block.key) { p.setAttribute('data-ob', block.key); if (!opts.preview) p.hidden = true; }
      var first = block.nodes[0];
      if (first && first.type === 'text' && /^[\u00B9\u00B2\u00B3\u2070-\u2079]/.test(first.text)) p.className = 'footnote';
      appendNodes(p, block.nodes, opts);
      if (opts.onBlock) opts.onBlock(p, block);
      container.appendChild(p);
    });
    return container;
  }

  /* No hanging prepositions: a word of one or two letters never ends a line, because the space after it
     becomes a non-breaking one. Also across the edges of clickable words ("я [люблю](love)"). */
  var SHORT = '(^|[\\s(\u00AB\u201E"\'\\[])(\\p{L}{1,2})';
  var SHORT_INSIDE = new RegExp(SHORT + '[ \\t]+(?=\\S)', 'gu');
  var SHORT_AT_END = new RegExp(SHORT + '[ \\t]+$', 'u');
  function isShortWord(node) {
    return (node.type === 'door' || node.type === 'link') && /^\p{L}{1,2}$/u.test(textOf(node.children).trim());
  }
  function tidy(text, prev, next) {
    text = text.replace(SHORT_INSIDE, '$1$2\u00A0');
    if (next && SHORT_AT_END.test(text)) text = text.replace(/[ \t]+$/, '\u00A0');
    if (prev && isShortWord(prev) && /^[ \t]/.test(text)) text = text.replace(/^[ \t]+/, '\u00A0');
    return text;
  }

  function appendNodes(parent, nodes, opts) {
    opts = opts || {};
    nodes.forEach(function (node, i) {
      var el;
      switch (node.type) {
        case 'text': parent.appendChild(document.createTextNode(tidy(node.text, nodes[i - 1], nodes[i + 1]))); return;
        case 'br': el = document.createElement('br'); break;
        case 'door':
          el = document.createElement('a');
          el.setAttribute('href', '#');
          el.setAttribute('data-o', node.key);
          if (node.vanish) el.setAttribute('data-vanish', '');
          appendNodes(el, node.children, opts);
          break;
        case 'link':
          el = document.createElement('a');
          el.setAttribute('href', node.href);
          if (/^https?:/i.test(node.href)) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener'); }
          appendNodes(el, node.children, opts);
          break;
        case 'reveal':
          el = document.createElement('span');
          el.setAttribute('data-ob', node.key);
          if (!opts.preview) el.hidden = true;
          appendNodes(el, node.children, opts);
          break;
        case 'image':
          el = photo(node, opts);
          break;
        case 'video':
          el = videoElement(node.src, opts);
          break;
        default: return;
      }
      if (opts.onNode) opts.onNode(el, node);
      parent.appendChild(el);
    });
  }

  /* A photo sits in the line, one line tall; a tap makes it big, with the text flowing around it, and another tap
     makes it small again. In the line it is a tiny copy made by tools/photos.py (images/NAME.thumb.jpg), and nothing
     is downloaded until the photo is on screen. Then the big one is fetched quietly, so a tap shows it at once.
     The second photo, for the mouse, is fetched only on screens that have a mouse, once the photo is big. */
  var HOVER = !!(global.matchMedia && global.matchMedia('(hover: hover)').matches);
  function thumbOf(src) { return /^images\/[^\/?#]+\.(jpe?g|png|webp)$/i.test(src) ? src.replace(/(\.\w+)$/, '.thumb$1') : src; }
  function warm(src) { if (src) { var i = new Image(); i.decoding = 'async'; i.src = src; } }

  function photo(node, opts) {
    var img = document.createElement('img'), big = node.src, small = opts.preview ? big : thumbOf(big);
    img.setAttribute('alt', node.alt);
    img.setAttribute('loading', 'lazy');
    img.setAttribute('decoding', 'async');
    img.addEventListener('load', function () {
      if (!img.ratio && img.naturalWidth) img.ratio = img.naturalHeight / img.naturalWidth;
      if (img.getAttribute('src') === small && small !== big && img.getClientRects().length) warm(big);
    });
    img.addEventListener('error', function () {
      var src = img.getAttribute('src');
      if (src === big) img.replaceWith(missing(opts, 'photo', big));
      else if (src === small) { small = big; img.setAttribute('src', big); }    /* no tiny copy yet: use the photo itself */
      else img.setAttribute('src', big);                                     /* the second photo is missing: stay on the first */
    });
    img.addEventListener('click', function () {
      var on = img.classList.toggle('big');
      img.setAttribute('src', on ? big : small);
      if (on && HOVER) warm(node.hover);
      snapPhoto(img);
    });
    if (node.hover && HOVER) {
      img.addEventListener('mouseenter', function () { if (img.classList.contains('big')) img.setAttribute('src', node.hover); });
      img.addEventListener('mouseleave', function () { if (img.classList.contains('big')) img.setAttribute('src', big); });
    }
    img.setAttribute('src', small);
    return img;
  }

  /* A big photo gets a height that is a whole number of text lines, so the text comes back to full width
     exactly at its bottom edge, with no gap. (object-fit: cover trims the few leftover pixels.) The shape is
     taken from whichever copy loaded first; the tiny one and the big one have the same shape. */
  function snapPhoto(img) {
    img.style.height = '';
    if (!img.classList.contains('big')) return;
    if (!img.ratio) {                                    /* nothing loaded yet: snap once it is */
      img.addEventListener('load', function () { snapPhoto(img); }, { once: true });
      return;
    }
    var lh = parseFloat(getComputedStyle(img.parentNode).lineHeight);
    if (!lh) return;
    var h = img.getBoundingClientRect().width * img.ratio;
    img.style.height = Math.max(lh, Math.floor(h / lh) * lh) + 'px';
  }
  var snapTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(function () { document.querySelectorAll('img.big').forEach(snapPhoto); }, 100);
  });

  function videoElement(src, opts) {
    var yt = src.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
    if (yt) {
      var f = document.createElement('iframe');
      f.setAttribute('src', 'https://www.youtube-nocookie.com/embed/' + yt[1]);
      f.setAttribute('width', '560'); f.setAttribute('height', '315'); f.setAttribute('frameborder', '0');
      f.setAttribute('allow', 'autoplay; encrypted-media; picture-in-picture'); f.setAttribute('allowfullscreen', '');
      return f;
    }
    var v = document.createElement('video');
    v.setAttribute('controls', ''); v.setAttribute('playsinline', ''); v.setAttribute('preload', 'metadata');
    var s = document.createElement('source');
    s.addEventListener('error', function () { v.replaceWith(missing(opts, 'video', src)); });
    s.setAttribute('src', src);
    v.appendChild(s);
    return v;
  }

  /* ---------- the clicking ---------- */

  function cssEscape(s) { return (global.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'); }

  /* Opens a key: shows everything marked with it and turns its doors into plain text. */
  function open(root, key) {
    root.querySelectorAll('[data-ob="' + cssEscape(key) + '"]').forEach(function (el) { el.hidden = false; });
    root.querySelectorAll('a[data-o="' + cssEscape(key) + '"]').forEach(function (a) {
      if (a.hasAttribute('data-vanish')) { a.remove(); return; }
      var parent = a.parentNode;
      while (a.firstChild) parent.insertBefore(a.firstChild, a);
      parent.removeChild(a);
    });
  }

  function activate(root, onOpen) {
    root.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[data-o]') : null;
      if (!a || !root.contains(a)) return;
      e.preventDefault();
      var key = a.getAttribute('data-o');
      open(root, key);
      if (onOpen) onOpen(key);
    });
  }

  function doorsLeft(root) {
    var n = 0;
    root.querySelectorAll('a[data-o]').forEach(function (a) { if (!a.closest('[hidden]')) n++; });
    return n;
  }

  /* ---------- helpers for the editor ---------- */

  function collect(tree) {
    var doors = {}, reveals = {}, media = [];
    function add(map, key, node) { (map[key] = map[key] || []).push(node); }
    function walk(nodes) {
      nodes.forEach(function (n) {
        if (n.type === 'door') add(doors, n.key, n);
        if (n.type === 'reveal') add(reveals, n.key, n);
        if (n.type === 'image' || n.type === 'video') media.push(n);
        if (n.children) walk(n.children);
      });
    }
    tree.blocks.forEach(function (b) { if (b.key) add(reveals, b.key, b); walk(b.nodes); });
    return { doors: doors, reveals: reveals, media: media };
  }

  function textOf(nodes) {
    return nodes.map(function (n) { return n.type === 'text' ? n.text : n.children ? textOf(n.children) : ''; }).join('');
  }

  function doorLabel(tree, key) {
    var d = collect(tree).doors[key];
    return d ? textOf(d[0].children) : '';
  }

  global.Story = { parse: parse, parseInline: parseInline, build: build, appendNodes: appendNodes,
                   open: open, activate: activate, doorsLeft: doorsLeft, collect: collect, doorLabel: doorLabel, textOf: textOf };
})(window);
