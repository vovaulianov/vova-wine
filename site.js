/* site.js — the page itself: picks the language, builds the story, handles the ending and the footer video.
   The text lives in content.js; write it with the editor (double-click edit.command). */
(function () {
  'use strict';
  var C = window.CONTENT || {}, S = window.Story;
  var langs = Object.keys(C.languages || {});
  var fromUrl = (location.search.match(/[?&]lang=([\w-]+)/) || [])[1];
  var lang = fromUrl || safeGet('lang') || C.default || langs[0];
  if (!C.story || !C.story[lang] || langs.indexOf(lang) < 0) lang = C.default || langs[0];

  var root = document.getElementById('story');
  var nothing = document.getElementById('nothing');
  var switcher = document.getElementById('lang');
  var opened = [];

  var MISSING = {
    uk: { photo: 'фото {src} ще немає в папці', video: 'відео {src} ще немає в папці' },
    en: { photo: 'photo {src} is not in the folder yet', video: 'video {src} is not in the folder yet' }
  };
  function missing(kind, src) { return '[' + (MISSING[lang] || MISSING.en)[kind].replace('{src}', src) + ']'; }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
  function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function render() {
    var s = (C.settings && C.settings[lang]) || {};
    document.documentElement.lang = lang;
    if (s.titles && s.titles.length) document.title = pick(s.titles);

    /* The language switch: one word at the top, the name of the other language. Hidden when there is only one. */
    switcher.textContent = '';
    langs.filter(function (l) { return l !== lang; }).forEach(function (l, i) {
      if (i) switcher.appendChild(document.createTextNode(' · '));
      var a = document.createElement('a');
      a.setAttribute('href', '?lang=' + l);
      a.textContent = C.languages[l];
      a.addEventListener('click', function (e) {
        e.preventDefault();
        lang = l; safeSet('lang', l);
        try { history.replaceState(null, '', '?lang=' + l); } catch (x) {}
        render();
      });
      switcher.appendChild(a);
    });
    switcher.hidden = langs.length < 2;

    /* The story. Whatever was already opened stays open in the other language too. */
    S.build(root, S.parse(C.story[lang]), { missing: missing });
    opened.forEach(function (k) { S.open(root, k); });

    /* The last line, for when nothing is left to click. */
    nothing.textContent = '';
    S.appendNodes(nothing, S.parseInline(s.ending || ''), { missing: missing });
    nothing.hidden = !s.ending || S.doorsLeft(root) > 0;

    /* "Write to me" gets a random subject line. */
    if (s.emailSubjects && s.emailSubjects.length) {
      document.querySelectorAll('a[href^="mailto:"]').forEach(function (a) {
        a.setAttribute('href', a.getAttribute('href').split('?')[0] + '?subject=' + encodeURIComponent(pick(s.emailSubjects)));
      });
    }
  }

  S.activate(root, function (key) {
    if (opened.indexOf(key) < 0) opened.push(key);
    if (S.doorsLeft(root) === 0) setTimeout(function () { if (S.doorsLeft(root) === 0 && nothing.hasChildNodes()) nothing.hidden = false; }, 1500);
  });

  /* The footer video: silent, looping, on its own. Only if a file is set in content.js ("footerVideo"),
     and only if it actually loads; otherwise nothing is shown there. */
  var vibe = document.getElementById('vibe');
  if (vibe) {
    if (C.footerVideo) {
      var v = document.createElement('video');
      v.muted = true; v.autoplay = true; v.loop = true; v.playsInline = true;
      v.setAttribute('muted', ''); v.setAttribute('autoplay', ''); v.setAttribute('loop', ''); v.setAttribute('playsinline', '');
      var src = document.createElement('source');
      src.addEventListener('error', function () { vibe.remove(); });
      src.setAttribute('src', C.footerVideo); src.setAttribute('type', 'video/mp4');
      v.appendChild(src);
      vibe.appendChild(v);
    } else {
      vibe.remove();
    }
  }

  /* index.html?grid shows the thirds the layout is built on. */
  if (/[?&]grid(=|&|$)/.test(location.search)) { var g = document.getElementById('guides'); if (g) g.hidden = false; }

  render();
})();
