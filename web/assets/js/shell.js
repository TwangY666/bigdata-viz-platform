(function () {
  'use strict';

  var root = document.documentElement;
  var railToggle = document.getElementById('rail-toggle');
  var gridToggle = document.getElementById('grid-toggle');
  var themeToggle = document.getElementById('theme-toggle');
  var rail = document.getElementById('rail');
  var scrim = document.getElementById('scrim');
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  var compact = window.matchMedia('(max-width: 899px)');

  var THEME_COLOR = { dark: '#070c12', light: '#efede6' };

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  function isCompact() { return compact.matches; }

  function railOpen() { return root.getAttribute('data-rail') === 'open'; }

  function syncRail() {
    var open = railOpen();
    railToggle.setAttribute('aria-expanded', String(open));
    railToggle.setAttribute('aria-label', open ? '收起数据集目录' : '打开数据集目录');
    rail.setAttribute('aria-hidden', String(!open));
    scrim.hidden = !open;
  }

  function setRail(open, persist) {
    var wasOpen = railOpen();
    root.setAttribute('data-rail', open ? 'open' : 'closed');
    if (persist !== false) store('console.rail', open ? 'open' : 'closed');
    syncRail();
    if (open && !wasOpen) {
      if (window.Catalog) window.Catalog.focusSearch();
    } else if (!open && wasOpen) {
      if (rail.contains(document.activeElement)) railToggle.focus();
    }
  }

  function syncTheme() {
    var light = root.getAttribute('data-theme') === 'light';
    themeToggle.setAttribute('aria-pressed', String(light));
    themeToggle.setAttribute('aria-label', light ? '切换深色主题' : '切换浅色主题');
    if (themeMeta) themeMeta.setAttribute('content', THEME_COLOR[light ? 'light' : 'dark']);
  }

  function setTheme(theme) {
    root.setAttribute('data-theme', theme);
    store('console.theme', theme);
    syncTheme();
    if (window.Dash) window.Dash.refreshColors();
  }

  function syncGrid() {
    gridToggle.setAttribute('aria-pressed', String(root.getAttribute('data-grid') !== 'off'));
  }

  function setGrid(on) {
    root.setAttribute('data-grid', on ? 'on' : 'off');
    store('console.grid', on ? 'on' : 'off');
    syncGrid();
  }

  railToggle.addEventListener('click', function () { setRail(!railOpen()); });
  themeToggle.addEventListener('click', function () {
    setTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
  });
  gridToggle.addEventListener('click', function () { setGrid(root.getAttribute('data-grid') === 'off'); });
  scrim.addEventListener('click', function () { setRail(false); });

  compact.addEventListener('change', function () {
    setRail(isCompact() ? false : railPreference() === 'open', false);
  });

  function railPreference() {
    var saved = null;
    try { saved = localStorage.getItem('console.rail'); } catch (e) {}
    return saved === 'open' ? 'open' : 'closed';
  }

  function trapTab(e) {
    var focusables = rail.querySelectorAll('button:not([hidden]), input, [tabindex="0"]');
    var items = Array.prototype.filter.call(focusables, function (el) {
      return el.offsetParent !== null && !el.disabled;
    });
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!rail.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && railOpen()) {
      setRail(false);
      return;
    }
    if (e.key === 'Tab' && railOpen()) { trapTab(e); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;

    if (e.key === '[') { e.preventDefault(); setRail(!railOpen()); }
    else if (e.key === '/') { e.preventDefault(); setRail(true); if (window.Catalog) window.Catalog.focusSearch(); }
    else if (e.key === 'g' || e.key === 'G') { e.preventDefault(); setGrid(root.getAttribute('data-grid') === 'off'); }
    else if (e.key === 't' || e.key === 'T') { e.preventDefault(); setTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light'); }
  });

  syncRail();
  syncTheme();
  syncGrid();

  window.Shell = { setRail: setRail, isCompact: isCompact, railOpen: railOpen };
})();