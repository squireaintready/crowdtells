/*!
 * Crowdtells embed widget — drop a live "Crowd vs. Coverage" card on any site.
 *
 *   <div data-crowdtells="<market-id>"></div>
 *   <script src="https://crowdtells.com/embed.js" async></script>
 *
 * data-crowdtells accepts a market id, "top" (highest-ranked story right now), or
 * is paired with data-category="Politics" to pin a category's top story. The widget
 * reads the slim /embed.json (a few KB, CDN-cached) — never the full feed — renders
 * into a Shadow DOM so host-page CSS can't bleak in or out, and links back to the
 * full briefing. Zero dependencies, ~3KB, self-contained.
 */
(function () {
  'use strict';
  var ORIGIN = 'https://crowdtells.com';
  var UTM = 'utm_source=embed&utm_medium=widget&utm_campaign=crowd-vs-coverage';
  var feedPromise = null;

  function loadFeed() {
    if (!feedPromise) {
      feedPromise = fetch(ORIGIN + '/embed.json', { mode: 'cors' }).then(function (r) {
        if (!r.ok) throw new Error('embed feed ' + r.status);
        return r.json();
      });
    }
    return feedPromise;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function pick(feed, key, category) {
    var list = feed.markets || [];
    if (category) {
      var c = category.toLowerCase();
      list = list.filter(function (m) {
        return (m.category || '').toLowerCase() === c;
      });
    }
    if (!key || key === 'top') return list[0] || null;
    var byId = (feed.markets || []).filter(function (m) {
      return m.id === key;
    })[0];
    return byId || (category ? list[0] : null);
  }

  function sourceLabel(s) {
    if (s === 'polymarket') return 'Polymarket';
    if (s === 'kalshi') return 'Kalshi';
    return 'the market';
  }

  function coverageNote(m) {
    if (m.crowdVsCoverage === 'ahead') return 'Crowd running ahead of the coverage';
    if (m.crowdVsCoverage === 'contested') return 'Coverage disputes the favored outcome';
    if (typeof m.divergence === 'number' && m.divergence >= 3)
      return m.divergence + 'pt gap across platforms';
    return 'Tracked across sources';
  }

  var CSS =
    ':host{all:initial}' +
    '*{box-sizing:border-box;margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}' +
    '.card{display:block;max-width:420px;border:1px solid #e7e2d8;border-radius:14px;padding:16px 18px;background:#fff;color:#1a1813;text-decoration:none;line-height:1.4;box-shadow:0 1px 2px rgba(0,0,0,.04)}' +
    '.card:hover{border-color:#27496d}' +
    '.eyebrow{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#27496d}' +
    '.title{font-size:1.06rem;font-weight:650;margin:6px 0 12px;color:#1a1813}' +
    '.row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 8px}' +
    '.fav{font-size:.9rem;color:#54504a}.fav b{color:#1a1813}' +
    '.pct{font-size:1.5rem;font-weight:800;color:#27496d;font-variant-numeric:tabular-nums}' +
    '.bar{height:6px;border-radius:999px;background:#f0ece3;overflow:hidden;margin:0 0 12px}' +
    '.bar>span{display:block;height:100%;background:#27496d;border-radius:999px}' +
    '.note{font-size:.82rem;color:#6f695e}' +
    '.foot{display:flex;align-items:center;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:1px solid #f0ece3;font-size:.78rem;color:#6f695e}' +
    '.brand{font-weight:700;color:#27496d}' +
    '.cta{color:#27496d;font-weight:600}' +
    '@media(prefers-color-scheme:dark){.card{background:#160a0c;border-color:#27392e;color:#eaf1ea}.title{color:#eaf1ea}.eyebrow,.pct,.brand,.cta{color:#cf9d63}.fav,.note,.foot{color:#aebdb2}.fav b{color:#eaf1ea}.bar{background:#22312a}.bar>span{background:#cf9d63}.foot,.card:hover{border-color:#365044}}';

  function render(host, m) {
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    var href = ORIGIN + '/s/' + encodeURIComponent(m.slug) + '?' + UTM;
    var pct = Math.max(0, Math.min(100, m.oddsPct));
    root.innerHTML =
      '<style>' +
      CSS +
      '</style>' +
      '<a class="card" href="' +
      esc(href) +
      '" target="_blank" rel="noopener">' +
      '<div class="eyebrow">' +
      esc(m.category) +
      '</div>' +
      '<div class="title">' +
      esc(m.title) +
      '</div>' +
      '<div class="row"><span class="fav">Crowd favors <b>' +
      esc(m.favored) +
      '</b></span><span class="pct">' +
      pct +
      '%</span></div>' +
      '<div class="bar"><span style="width:' +
      pct +
      '%"></span></div>' +
      '<div class="note">' +
      esc(coverageNote(m)) +
      ' · via ' +
      esc(sourceLabel(m.source)) +
      '</div>' +
      '<div class="foot"><span class="brand">Crowdtells</span><span class="cta">Read the briefing →</span></div>' +
      '</a>';
  }

  function fallback(host, key) {
    var root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    root.innerHTML =
      '<style>' +
      CSS +
      '</style>' +
      '<a class="card" href="' +
      ORIGIN +
      '/?' +
      UTM +
      '" target="_blank" rel="noopener">' +
      '<div class="eyebrow">Crowdtells</div>' +
      '<div class="title">See what the markets are saying right now</div>' +
      '<div class="foot"><span class="brand">Crowdtells</span><span class="cta">Open the live feed →</span></div>' +
      '</a>';
  }

  function mount(host) {
    if (host.__ctMounted) return;
    host.__ctMounted = true;
    var key = host.getAttribute('data-crowdtells') || 'top';
    var category = host.getAttribute('data-category') || '';
    loadFeed()
      .then(function (feed) {
        var m = pick(feed, key, category);
        if (m) render(host, m);
        else fallback(host, key);
      })
      .catch(function () {
        fallback(host, key);
      });
  }

  function init() {
    var nodes = document.querySelectorAll('[data-crowdtells]');
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
