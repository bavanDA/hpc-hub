// The phone menu and a small search over every page of the wiki. Pages are read once, the first time you search.
(function () {
  var root = document.documentElement;
  root.classList.remove('no-js');

  // menu on narrow screens
  var btn = document.querySelector('.menu-btn');
  var scrim = document.querySelector('.scrim');
  function setOpen(on) {
    root.classList.toggle('open', on);
    if (btn) btn.setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  if (btn) btn.addEventListener('click', function () { setOpen(!root.classList.contains('open')); });
  if (scrim) scrim.addEventListener('click', function () { setOpen(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && root.classList.contains('open')) setOpen(false);
  });

  // search
  var input = document.getElementById('search');
  var box = document.getElementById('results');
  if (!input || !box) return;
  var pages = Array.prototype.map.call(document.querySelectorAll('.nav a[href]'), function (a) {
    return { href: a.getAttribute('href'), title: a.textContent.trim() };
  });
  var index = null;
  var loading = null;
  var picked = -1;

  function clean(s) { return s.replace(/\s+/g, ' ').trim(); }

  function sectionsOf(page, doc) {
    var main = doc.querySelector('.content');
    if (!main) return [];
    var out = [];
    var cur = { page: page, title: page.title, id: '', text: '' };
    Array.prototype.forEach.call(main.children, function (el) {
      if (el.matches('.pager, .foot')) return;
      if (el.tagName === 'H2' || el.tagName === 'H3') {
        out.push(cur);
        cur = { page: page, title: clean(el.textContent.replace('#', '')), id: el.id, text: '' };
      } else if (el.tagName !== 'H1') {
        var parts = el.querySelectorAll('li, td, th, dt, dd, p');
        var text = parts.length ? Array.prototype.map.call(parts, function (x) {
          return x.querySelector('li, p') ? '' : clean(x.textContent);
        }).filter(Boolean).join(' · ') : clean(el.textContent);
        cur.text += ' ' + text;
      }
    });
    out.push(cur);
    return out.filter(function (s) { return s.text.trim() || s.id; });
  }

  function load() {
    if (loading) return loading;
    loading = Promise.all(pages.map(function (p) {
      return fetch(p.href).then(function (r) { return r.ok ? r.text() : ''; }).then(function (html) {
        return html ? sectionsOf(p, new DOMParser().parseFromString(html, 'text/html')) : [];
      }).catch(function () { return []; });
    })).then(function (all) { index = [].concat.apply([], all); });
    return loading;
  }

  function esc(s) {
    return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function highlight(text, words) {
    var out = esc(text);
    words.forEach(function (w) {
      var re = new RegExp('(' + esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      out = out.replace(re, '<mark>$1</mark>');
    });
    return out;
  }
  function snippet(text, words) {
    var low = text.toLowerCase();
    var at = -1;
    words.forEach(function (w) { var i = low.indexOf(w); if (i >= 0 && (at < 0 || i < at)) at = i; });
    var start = Math.max(0, at - 50);
    if (start > 0) { var sp = text.indexOf(' ', start); if (sp >= 0 && sp < at) start = sp + 1; }
    var s = text.slice(start, start + 150).trim();
    return (start > 0 ? '... ' : '') + s + (start + 150 < text.length ? ' ...' : '');
  }

  function search(q) {
    var words = q.toLowerCase().split(/\s+/).filter(function (w) { return w.length > 1; });
    if (!words.length) return [];
    var hits = [];
    index.forEach(function (s) {
      var title = s.title.toLowerCase();
      var text = s.text.toLowerCase();
      var page = s.page.title.toLowerCase();
      var score = 0;
      for (var i = 0; i < words.length; i++) {
        var w = words[i];
        var inTitle = title.indexOf(w) >= 0, inPage = page.indexOf(w) >= 0, inText = text.indexOf(w) >= 0;
        if (!inTitle && !inText && !inPage) return;
        score += (inTitle ? 6 : 0) + (inPage ? 2 : 0) + (inText ? 1 : 0);
      }
      hits.push({ s: s, score: score });
    });
    hits.sort(function (a, b) { return b.score - a.score; });
    return hits.slice(0, 12).map(function (h) { return h.s; }).map(function (s) {
      return { s: s, words: words };
    });
  }

  function show() {
    var q = input.value.trim();
    if (!q) { box.hidden = true; box.innerHTML = ''; return; }
    if (!index) {
      box.hidden = false;
      box.innerHTML = '<div class="none">Searching...</div>';
      load().then(show);
      return;
    }
    var found = search(q);
    picked = -1;
    box.hidden = false;
    if (!found.length) { box.innerHTML = '<div class="none">Nothing found. Try another word.</div>'; return; }
    box.innerHTML = found.map(function (f) {
      var s = f.s;
      var href = s.page.href + (s.id ? '#' + s.id : '');
      var where = s.id ? esc(s.page.title) : 'Page';
      return '<a href="' + esc(href) + '"><div class="where">' + where + '</div><div class="what">' +
        highlight(s.title, f.words) + '</div><div class="snip">' + highlight(snippet(s.text, f.words), f.words) +
        '</div></a>';
    }).join('');
  }

  function move(step) {
    var links = box.querySelectorAll('a');
    if (!links.length) return;
    picked = (picked + step + links.length) % links.length;
    Array.prototype.forEach.call(links, function (a, i) { a.classList.toggle('on', i === picked); });
    links[picked].scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', show);
  input.addEventListener('focus', function () { load(); if (input.value.trim()) show(); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') {
      var links = box.querySelectorAll('a');
      var a = links[picked] || links[0];
      if (a) { e.preventDefault(); location.href = a.getAttribute('href'); }
    } else if (e.key === 'Escape') { input.value = ''; show(); input.blur(); }
  });
  box.addEventListener('click', function (e) {
    if (e.target.closest('a')) { setOpen(false); box.hidden = true; }
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.search')) box.hidden = true;
  });
  document.addEventListener('keydown', function (e) {
    var t = e.target;
    var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (e.key === '/' && !typing) {
      e.preventDefault();
      if (window.matchMedia('(max-width: 860px)').matches) setOpen(true);
      input.focus();
    }
  });
})();
