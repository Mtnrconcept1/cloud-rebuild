// TOK Connect - ressource UI du module ChatGPT (MCP Apps / Apps SDK).
//
// Le HTML ci-dessous est servi tel quel comme ressource MCP
// "text/html;profile=mcp-app". ChatGPT l'ouvre dans une iframe et l'alimente
// via window.openai (toolOutput, widgetState, callTool, sendFollowUpMessage,
// requestDisplayMode). Le widget affiche la sélection de restaurants sous
// forme de cartes cliquables, puis la fiche complète d'une adresse.
//
// Contraintes volontaires :
//   - aucune dépendance externe ni fetch : tout passe par window.openai ;
//   - construction DOM sans innerHTML (pas d'injection possible depuis les
//     données restaurant) ;
//   - thème clair/sombre suivant l'hôte ChatGPT.

/** URI de la ressource UI branchée sur les outils de découverte. */
export const TOK_DISCOVERY_RESOURCE_URI = "ui://tok-connect/restaurant-discovery-v1.html";

/** Domaines autorisés par la CSP du widget (images restaurant + application). */
export const TOK_DISCOVERY_RESOURCE_DOMAINS = [
  "https://www.thetok.ch",
  "https://thetok.ch",
  "https://cloud-rebuild-recovered.vercel.app",
  "https://wwcrtyoueexyxkkikaos.supabase.co",
  "https://images.unsplash.com",
  "https://lh3.googleusercontent.com",
  "https://maps.googleapis.com",
];

export const TOK_DISCOVERY_WIDGET_HTML = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
<title>TOK · Sélection de restaurants</title>
<style>
:root{
  color-scheme:light dark;
  --tok-orange:#f56a12; --tok-orange-soft:rgba(245,106,18,.12); --tok-gold:#f2b748;
  --tok-green:#16a06a; --tok-green-soft:rgba(22,160,106,.12);
  --bg:#fbf8f4; --bg-veil:rgba(255,255,255,.72);
  --card:#ffffff; --card-2:#fffaf4;
  --text:#171310; --text-2:#544a41; --muted:#8a7f74;
  --line:#ecdfd0; --line-2:#f5ece1;
  --shadow:0 1px 2px rgba(60,32,8,.05),0 14px 34px -18px rgba(60,32,8,.35);
  --shadow-lg:0 24px 60px -28px rgba(60,32,8,.5);
  --radius:18px; --radius-sm:12px;
  --skeleton:linear-gradient(100deg,rgba(0,0,0,.045) 30%,rgba(0,0,0,.09) 50%,rgba(0,0,0,.045) 70%);
}
@media (prefers-color-scheme:dark){
  :root{
    --bg:#0d0b09; --bg-veil:rgba(24,19,15,.72);
    --card:#181410; --card-2:#1f1913;
    --text:#fbf4ea; --text-2:#d3c6b7; --muted:#9e9184;
    --line:#332a21; --line-2:#2a221b;
    --shadow:0 1px 2px rgba(0,0,0,.5),0 16px 38px -20px rgba(0,0,0,.9);
    --shadow-lg:0 28px 70px -30px rgba(0,0,0,.95);
    --skeleton:linear-gradient(100deg,rgba(255,255,255,.05) 30%,rgba(255,255,255,.1) 50%,rgba(255,255,255,.05) 70%);
  }
}
html[data-theme="dark"]{
  --bg:#0d0b09; --bg-veil:rgba(24,19,15,.72); --card:#181410; --card-2:#1f1913;
  --text:#fbf4ea; --text-2:#d3c6b7; --muted:#9e9184; --line:#332a21; --line-2:#2a221b;
  --skeleton:linear-gradient(100deg,rgba(255,255,255,.05) 30%,rgba(255,255,255,.1) 50%,rgba(255,255,255,.05) 70%);
}
html[data-theme="light"]{
  --bg:#fbf8f4; --bg-veil:rgba(255,255,255,.72); --card:#ffffff; --card-2:#fffaf4;
  --text:#171310; --text-2:#544a41; --muted:#8a7f74; --line:#ecdfd0; --line-2:#f5ece1;
}
*{box-sizing:border-box}
body{
  margin:0;background:var(--bg);color:var(--text);
  font:15px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,"Helvetica Neue",sans-serif;
  -webkit-font-smoothing:antialiased;
}
button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
img{display:block;max-width:100%}
#root{padding:16px 16px 20px}
.hidden{display:none!important}

/* ---------- en-tête ---------- */
.hero{display:flex;align-items:flex-start;gap:12px;margin-bottom:14px}
.mark{
  flex:0 0 auto;width:42px;height:42px;border-radius:14px;display:grid;place-items:center;
  background:linear-gradient(140deg,var(--tok-gold),var(--tok-orange));color:#22140a;
  font-weight:900;font-size:13px;letter-spacing:.02em;box-shadow:0 10px 24px -10px rgba(245,106,18,.9);
}
.hero-text{min-width:0;flex:1}
.hero h1{margin:0;font-size:19px;line-height:1.25;font-weight:800;letter-spacing:-.015em}
.hero p{margin:3px 0 0;font-size:12.5px;color:var(--muted)}
.hero-side{display:flex;align-items:center;gap:6px;flex:0 0 auto;padding-top:2px}
.pill{
  display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:5px 10px;
  font-size:11.5px;font-weight:700;border:1px solid var(--line);background:var(--card);white-space:nowrap
}
.pill.live{color:var(--tok-green);border-color:transparent;background:var(--tok-green-soft)}
.dot{width:6px;height:6px;border-radius:50%;background:currentColor}
.icon-btn{
  width:32px;height:32px;border-radius:10px;border:1px solid var(--line);background:var(--card);
  display:grid;place-items:center;color:var(--text-2);transition:background .15s,color .15s
}
.icon-btn:hover{background:var(--card-2);color:var(--tok-orange)}

/* ---------- filtres ---------- */
.chips{display:flex;gap:7px;overflow-x:auto;padding-bottom:10px;margin-bottom:4px;scrollbar-width:none}
.chips::-webkit-scrollbar{display:none}
.chip{
  flex:0 0 auto;border-radius:999px;padding:7px 13px;font-size:12.5px;font-weight:700;
  border:1px solid var(--line);background:var(--card);color:var(--text-2);
  transition:border-color .15s,background .15s,color .15s;white-space:nowrap
}
.chip[aria-pressed="true"]{background:var(--tok-orange);border-color:var(--tok-orange);color:#fff}
.chip .count{opacity:.65;font-weight:600;margin-left:2px}

/* ---------- grille ---------- */
.grid{display:grid;gap:12px;grid-template-columns:1fr}
@media (min-width:560px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (min-width:900px){.grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
.card{
  position:relative;display:flex;flex-direction:column;text-align:left;width:100%;
  border:1px solid var(--line);border-radius:var(--radius);background:var(--card);
  overflow:hidden;box-shadow:var(--shadow);transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease
}
.card:hover{transform:translateY(-2px);box-shadow:var(--shadow-lg);border-color:rgba(245,106,18,.45)}
.card:focus-visible{outline:2px solid var(--tok-orange);outline-offset:2px}
.thumb{position:relative;aspect-ratio:16/10;background:var(--card-2);overflow:hidden}
.thumb img{width:100%;height:100%;object-fit:cover}
.thumb-fallback{
  width:100%;height:100%;display:grid;place-items:center;font-size:34px;
  background:radial-gradient(120% 120% at 20% 0%,rgba(242,183,72,.35),transparent 60%),var(--card-2)
}
.rank{
  position:absolute;top:9px;left:9px;min-width:26px;height:26px;padding:0 7px;border-radius:9px;
  display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;
  background:rgba(15,11,8,.72);color:#fff;backdrop-filter:blur(6px)
}
.rank.gold{background:linear-gradient(140deg,var(--tok-gold),var(--tok-orange));color:#22140a}
.score{
  position:absolute;top:9px;right:9px;display:inline-flex;align-items:center;gap:4px;
  padding:5px 9px;border-radius:999px;font-size:12px;font-weight:800;
  background:rgba(255,255,255,.94);color:#171310;box-shadow:0 6px 16px -8px rgba(0,0,0,.6)
}
.score .star{color:var(--tok-orange)}
.score small{font-weight:600;opacity:.6;font-size:10.5px}
.card-body{padding:12px 13px 13px;display:flex;flex-direction:column;gap:7px;flex:1}
.card-title{margin:0;font-size:15.5px;font-weight:800;line-height:1.25;letter-spacing:-.01em}
.meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px;color:var(--muted)}
.meta .sep{opacity:.45}
.addr{font-size:12px;color:var(--text-2);display:flex;gap:5px;align-items:flex-start;line-height:1.35}
.badges{display:flex;flex-wrap:wrap;gap:5px;margin-top:auto;padding-top:3px}
.badge{border-radius:7px;padding:3px 7px;font-size:10.5px;font-weight:800;letter-spacing:.01em;
  background:var(--line-2);color:var(--text-2);border:1px solid transparent}
.badge.gold{background:rgba(242,183,72,.2);color:#8a5c05;border-color:rgba(242,183,72,.4)}
.badge.orange{background:var(--tok-orange-soft);color:#b8480a;border-color:rgba(245,106,18,.28)}
.badge.green{background:var(--tok-green-soft);color:#0d6a47;border-color:rgba(22,160,106,.28)}
@media (prefers-color-scheme:dark){
  .badge.gold{color:#f2c46a}.badge.orange{color:#ff9a54}.badge.green{color:#4fd7a1}
  .score{background:rgba(28,22,17,.94);color:#fbf4ea}
}
html[data-theme="dark"] .badge.gold{color:#f2c46a}
html[data-theme="dark"] .badge.orange{color:#ff9a54}
html[data-theme="dark"] .badge.green{color:#4fd7a1}
html[data-theme="dark"] .score{background:rgba(28,22,17,.94);color:#fbf4ea}
.reason{font-size:11.5px;color:var(--tok-orange);font-weight:700}
.card-cta{
  display:flex;align-items:center;gap:4px;font-size:12px;font-weight:800;color:var(--tok-orange);
  padding-top:2px
}

/* ---------- notes / pied ---------- */
.notes{margin-top:12px;display:flex;flex-direction:column;gap:6px}
.note{
  font-size:12px;color:var(--text-2);background:var(--card-2);border:1px solid var(--line-2);
  border-radius:var(--radius-sm);padding:8px 11px;line-height:1.4
}
.foot{margin-top:14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
.foot small{color:var(--muted);font-size:11.5px}

/* ---------- boutons ---------- */
.btn{
  display:inline-flex;align-items:center;justify-content:center;gap:6px;border-radius:12px;
  padding:10px 15px;font-size:13px;font-weight:800;border:1px solid var(--line);background:var(--card);
  color:var(--text);transition:transform .12s,background .15s,border-color .15s
}
.btn:hover{transform:translateY(-1px)}
.btn.primary{background:var(--tok-orange);border-color:var(--tok-orange);color:#fff;
  box-shadow:0 12px 26px -14px rgba(245,106,18,.95)}
.btn.ghost{background:transparent}
.btn:disabled{opacity:.5;cursor:not-allowed;transform:none}

/* ---------- fiche détaillée ---------- */
.detail{display:flex;flex-direction:column;gap:14px}
.detail-top{display:flex;align-items:center;gap:10px}
.back{
  display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);background:var(--card);
  border-radius:11px;padding:7px 12px;font-size:12.5px;font-weight:800;color:var(--text-2)
}
.back:hover{color:var(--tok-orange);border-color:rgba(245,106,18,.45)}
.hero-img{
  position:relative;border-radius:var(--radius);overflow:hidden;aspect-ratio:16/7;max-height:320px;
  border:1px solid var(--line);background:var(--card-2);box-shadow:var(--shadow)
}
.detail-head{display:flex;gap:13px;align-items:center;border:1px solid var(--line);
  border-radius:var(--radius);background:var(--card);padding:14px;box-shadow:var(--shadow)}
.detail-head .em{flex:0 0 auto;width:58px;height:58px;border-radius:16px;display:grid;place-items:center;
  font-size:29px;background:radial-gradient(120% 120% at 20% 0%,rgba(242,183,72,.35),transparent 62%),var(--card-2)}
.detail-head h2{margin:0;font-size:19px;font-weight:850;line-height:1.2;letter-spacing:-.015em}
.detail-head .sub{color:var(--muted);font-size:12.5px;margin-top:3px}
.hero-img img{width:100%;height:100%;object-fit:cover}
.hero-overlay{
  position:absolute;inset:auto 0 0 0;padding:16px 14px 13px;display:flex;align-items:flex-end;
  justify-content:space-between;gap:10px;
  background:linear-gradient(to top,rgba(10,7,4,.86),rgba(10,7,4,.25) 60%,transparent)
}
.hero-overlay h2{margin:0;color:#fff;font-size:20px;font-weight:850;line-height:1.2;letter-spacing:-.015em}
.hero-overlay .sub{color:rgba(255,255,255,.82);font-size:12.5px;margin-top:3px}
.detail-grid{display:grid;gap:10px;grid-template-columns:1fr;align-items:start}
@media (min-width:640px){.detail-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.panel{border:1px solid var(--line);border-radius:var(--radius);background:var(--card);padding:13px 14px}
.panel h3{margin:0 0 9px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
.kv{display:flex;gap:9px;align-items:flex-start;font-size:13px;padding:5px 0;line-height:1.4}
.kv .k{flex:0 0 auto;width:18px;text-align:center;opacity:.75}
.kv .v{color:var(--text-2);min-width:0;word-break:break-word}
.kv a{color:var(--tok-orange);text-decoration:none;font-weight:700}
.kv a:hover{text-decoration:underline}
.hours{display:flex;flex-direction:column;gap:1px}
.hours .row{display:flex;justify-content:space-between;gap:10px;font-size:12.5px;padding:4px 0;border-bottom:1px solid var(--line-2)}
.hours .row:last-child{border-bottom:0}
.hours .row.today{color:var(--tok-orange);font-weight:800}
.hours .day{color:var(--text-2)}
.slots{display:flex;flex-wrap:wrap;gap:6px}
.slot{
  border:1px solid var(--line);border-radius:9px;padding:7px 11px;font-size:12.5px;font-weight:800;
  background:var(--card-2);color:var(--text-2);transition:background .15s,border-color .15s,color .15s
}
.slot:hover{background:var(--tok-orange);border-color:var(--tok-orange);color:#fff}
.slot[data-available="false"]{opacity:.4;text-decoration:line-through;pointer-events:none}
.menu-list{display:flex;flex-direction:column;gap:2px}
.menu-item{display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--line-2)}
.menu-item:last-child{border-bottom:0}
.menu-item .m-body{flex:1;min-width:0}
.menu-item .m-name{font-size:13px;font-weight:750;line-height:1.3}
.menu-item .m-desc{font-size:11.5px;color:var(--muted);margin-top:2px;line-height:1.35;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.menu-item .m-price{flex:0 0 auto;font-size:12.5px;font-weight:850;color:var(--tok-orange)}
.tags{display:flex;flex-wrap:wrap;gap:5px}
.detail-actions{display:flex;flex-wrap:wrap;gap:8px}
.detail-actions .btn{flex:1 1 auto;min-width:150px}

/* ---------- états ---------- */
.skeleton{border-radius:var(--radius);background:var(--skeleton);background-size:220% 100%;
  animation:shimmer 1.3s linear infinite}
@keyframes shimmer{to{background-position:-220% 0}}
.sk-hero{height:170px}
.sk-line{height:13px;border-radius:7px;margin-top:9px}
.empty{
  border:1px dashed var(--line);border-radius:var(--radius);background:var(--card-2);
  padding:28px 20px;text-align:center
}
.empty .em{font-size:30px}
.empty h2{margin:9px 0 5px;font-size:16px;font-weight:800}
.empty p{margin:0 auto;max-width:380px;font-size:13px;color:var(--muted);line-height:1.5}
.empty .btn{margin-top:14px}
@media (prefers-reduced-motion:reduce){
  *{animation-duration:.01ms!important;transition-duration:.01ms!important}
  .card:hover,.btn:hover{transform:none}
}
</style>
</head>
<body><div id="root"></div>
<script>
(function () {
  'use strict';

  var root = document.getElementById('root');

  /* ---------- accès à l'hôte ChatGPT (Apps SDK) ---------- */
  function host() { return window.openai || window.oai || {}; }
  function hostCall(method) {
    var api = host();
    var fn = api[method];
    return typeof fn === 'function' ? fn.bind(api) : null;
  }

  var state = {
    view: 'list',
    selectedId: null,
    filter: 'all',
    payload: null,
    details: {},
    loadingId: null,
    errorId: null,
    fullscreen: false
  };

  /* ---------- petit constructeur DOM (aucune injection HTML) ---------- */
  function h(tag, props, children) {
    var el = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'text') { el.textContent = String(value); return; }
        if (key === 'class') { el.className = String(value); return; }
        if (key === 'onClick') { el.addEventListener('click', value); return; }
        if (key === 'onError') { el.addEventListener('error', value); return; }
        el.setAttribute(key, value === true ? '' : String(value));
      });
    }
    (Array.isArray(children) ? children : children ? [children] : []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      el.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
    });
    return el;
  }

  function safeHttpUrl(value) {
    if (typeof value !== 'string') return null;
    return /^https?:\\/\\//i.test(value.trim()) ? value.trim() : null;
  }

  function openLink(url) {
    var safe = safeHttpUrl(url);
    if (!safe) return;
    var openExternal = hostCall('openExternal');
    if (openExternal) { try { openExternal({ href: safe }); return; } catch (error) { /* repli */ } }
    window.open(safe, '_blank', 'noopener,noreferrer');
  }

  function askModel(prompt) {
    var send = hostCall('sendFollowUpMessage') || hostCall('sendFollowupMessage');
    if (!send) return false;
    try { send({ prompt: prompt }); return true; } catch (error) { return false; }
  }

  function persist() {
    var setWidgetState = hostCall('setWidgetState');
    if (!setWidgetState) return;
    try {
      setWidgetState({ view: state.view, selectedId: state.selectedId, filter: state.filter });
    } catch (error) { /* l'état local suffit */ }
  }

  function requestDisplay(mode) {
    var request = hostCall('requestDisplayMode');
    if (!request) return;
    try { request({ mode: mode }); } catch (error) { /* mode inline conservé */ }
  }

  /* ---------- normalisation des données reçues ---------- */
  function unwrap(value) {
    if (!value || typeof value !== 'object') return null;
    if (Array.isArray(value)) return null;
    if (value.structuredContent && typeof value.structuredContent === 'object') return unwrap(value.structuredContent) || value.structuredContent;
    if (value.result && typeof value.result === 'object' && (value.result.structuredContent || value.result.restaurants)) {
      return unwrap(value.result) || value.result;
    }
    if (value.selection && typeof value.selection === 'object') return value.selection;
    if (value.data && typeof value.data === 'object' && (value.data.restaurants || value.data.detail || value.data.kind)) return value.data;
    return value;
  }

  function toPayload(raw) {
    var value = unwrap(raw);
    if (!value) return null;
    if (Array.isArray(value.restaurants)) return value;
    if (value.detail && typeof value.detail === 'object') {
      return { kind: 'restaurant_selection', title: value.detail.name || 'Fiche TOK', restaurants: [], detail: value.detail, groups: [], notes: [] };
    }
    if (value.kind === 'restaurant_detail' && value.id) {
      return { kind: 'restaurant_selection', title: value.name || 'Fiche TOK', restaurants: [], detail: value, groups: [], notes: [] };
    }
    return null;
  }

  function toDetail(raw) {
    var value = unwrap(raw);
    if (!value) return null;
    if (value.detail && typeof value.detail === 'object' && value.detail.id) return value.detail;
    if (value.restaurant && typeof value.restaurant === 'object' && value.restaurant.id) return value.restaurant;
    if (value.id && (value.kind === 'restaurant_detail' || value.name)) return value;
    return null;
  }

  /* ---------- fragments d'interface ---------- */
  function svg(pathData, size) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    node.setAttribute('viewBox', '0 0 24 24');
    node.setAttribute('width', String(size || 15));
    node.setAttribute('height', String(size || 15));
    node.setAttribute('fill', 'none');
    node.setAttribute('stroke', 'currentColor');
    node.setAttribute('stroke-width', '2');
    node.setAttribute('stroke-linecap', 'round');
    node.setAttribute('stroke-linejoin', 'round');
    node.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    node.appendChild(path);
    return node;
  }

  var ICON_BACK = 'M19 12H5M12 19l-7-7 7-7';
  var ICON_ARROW = 'M5 12h14M12 5l7 7-7 7';
  var ICON_EXPAND = 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3';
  var ICON_PIN = 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z';

  function thumbnail(card, height) {
    var wrap = h('div', { class: height ? 'hero-img' : 'thumb' });
    var url = safeHttpUrl(card.image_url);
    if (url) {
      var img = h('img', {
        src: url,
        alt: card.name || 'Restaurant',
        loading: 'lazy',
        decoding: 'async',
        referrerpolicy: 'no-referrer',
        onError: function () {
          if (img.parentNode) img.parentNode.replaceChild(fallbackTile(card), img);
        }
      });
      wrap.appendChild(img);
    } else {
      wrap.appendChild(fallbackTile(card));
    }
    return wrap;
  }

  function fallbackTile(card) {
    return h('div', { class: 'thumb-fallback', text: card.emoji || '🍽️' });
  }

  function ratingPill(card) {
    if (!card.rating && card.rating !== 0) return null;
    var children = [h('span', { class: 'star', text: '★' }), h('span', { text: card.rating_display || String(card.rating) })];
    if (card.review_count) children.push(h('small', { text: '(' + card.review_count + ')' }));
    return h('div', { class: 'score' }, children);
  }

  function metaLine(card) {
    var bits = [];
    if (card.cuisine) bits.push(card.cuisine);
    if (card.price_display) bits.push(card.price_display);
    if (card.city) bits.push(card.city);
    var children = [];
    bits.forEach(function (bit, index) {
      if (index) children.push(h('span', { class: 'sep', text: '·' }));
      children.push(h('span', { text: bit }));
    });
    return children.length ? h('div', { class: 'meta' }, children) : null;
  }

  function badgeRow(card) {
    var badges = Array.isArray(card.badges) ? card.badges.slice(0, 4) : [];
    if (!badges.length) return null;
    return h('div', { class: 'badges' }, badges.map(function (badge) {
      return h('span', { class: 'badge ' + (badge.tone || 'neutral'), text: badge.label });
    }));
  }

  function restaurantCard(card) {
    var rank = card.rank
      ? h('span', { class: 'rank' + (card.rank === 1 ? ' gold' : ''), text: '#' + card.rank })
      : null;
    var thumb = thumbnail(card);
    if (rank) thumb.appendChild(rank);
    var pill = ratingPill(card);
    if (pill) thumb.appendChild(pill);

    var body = h('div', { class: 'card-body' }, [
      h('h2', { class: 'card-title', text: card.name }),
      metaLine(card),
      card.address ? h('div', { class: 'addr' }, [svg(ICON_PIN, 13), h('span', { text: card.address })]) : null,
      card.match_reason ? h('div', { class: 'reason', text: card.match_reason }) : null,
      badgeRow(card),
      h('div', { class: 'card-cta' }, [h('span', { text: 'Voir la fiche' }), svg(ICON_ARROW, 13)])
    ]);

    return h('button', {
      class: 'card',
      type: 'button',
      'aria-label': 'Ouvrir la fiche de ' + card.name,
      onClick: function () { openDetail(card); }
    }, [thumb, body]);
  }

  function filterChips(payload) {
    var groups = Array.isArray(payload.groups) ? payload.groups.filter(function (g) { return g.delivered > 0; }) : [];
    if (groups.length < 2) return null;
    var chips = [chip('all', 'Tout', payload.restaurants.length)];
    groups.forEach(function (group) {
      chips.push(chip(group.key, (group.emoji ? group.emoji + ' ' : '') + group.label, group.delivered));
    });
    return h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrer la sélection' }, chips);
  }

  function chip(key, label, count) {
    return h('button', {
      class: 'chip',
      type: 'button',
      'aria-pressed': state.filter === key ? 'true' : 'false',
      onClick: function () { state.filter = key; persist(); render(); }
    }, [h('span', { text: label }), h('span', { class: 'count', text: String(count) })]);
  }

  function emptyState(payload) {
    return h('div', { class: 'empty' }, [
      h('div', { class: 'em', text: '🔍' }),
      h('h2', { text: 'Aucune table TOK ne correspond encore' }),
      h('p', { text: (payload && payload.notes && payload.notes[0]) || 'Élargissez la ville ou le type de cuisine, et TOK proposera les adresses actives les mieux notées.' }),
      h('button', {
        class: 'btn primary', type: 'button',
        onClick: function () { askModel('Élargis la recherche TOK aux villes voisines et propose-moi les meilleures tables disponibles.'); }
      }, 'Élargir la recherche')
    ]);
  }

  function renderList(payload) {
    var cards = Array.isArray(payload.restaurants) ? payload.restaurants : [];
    var visible = state.filter === 'all'
      ? cards
      : cards.filter(function (card) { return card.group_key === state.filter; });

    var head = h('header', { class: 'hero' }, [
      h('div', { class: 'mark', text: 'TOK' }),
      h('div', { class: 'hero-text' }, [
        h('h1', { text: payload.title || 'Sélection TOK' }),
        h('p', { text: payload.subtitle || 'Restaurants TOK classés par note' })
      ]),
      h('div', { class: 'hero-side' }, [
        h('span', { class: 'pill live' }, [h('span', { class: 'dot' }), h('span', { text: cards.length + (cards.length > 1 ? ' tables' : ' table') })]),
        h('button', {
          class: 'icon-btn', type: 'button', title: 'Agrandir', 'aria-label': 'Agrandir la sélection',
          onClick: function () { state.fullscreen = !state.fullscreen; requestDisplay(state.fullscreen ? 'fullscreen' : 'inline'); }
        }, svg(ICON_EXPAND, 15))
      ])
    ]);

    var children = [head, filterChips(payload)];

    if (!visible.length) {
      children.push(emptyState(payload));
    } else {
      children.push(h('div', { class: 'grid' }, visible.map(restaurantCard)));
    }

    var notes = Array.isArray(payload.notes) ? payload.notes.filter(Boolean) : [];
    if (notes.length) {
      children.push(h('div', { class: 'notes' }, notes.slice(0, 3).map(function (note) {
        return h('div', { class: 'note', text: note });
      })));
    }

    if (visible.length) {
      children.push(h('div', { class: 'foot' }, [
        h('small', { text: payload.city ? 'Données TOK en direct · ' + payload.city : 'Données TOK en direct' }),
        payload.deep_link ? h('button', {
          class: 'btn ghost', type: 'button',
          onClick: function () { openLink(payload.deep_link); }
        }, [h('span', { text: 'Ouvrir dans TOK' }), svg(ICON_ARROW, 13)]) : null
      ]));
    }

    return h('div', null, children);
  }

  function detailSkeleton() {
    return h('div', { class: 'detail' }, [
      h('div', { class: 'detail-top' }, [
        h('button', { class: 'back', type: 'button', onClick: closeDetail }, [svg(ICON_BACK, 14), h('span', { text: 'Retour' })])
      ]),
      h('div', { class: 'skeleton sk-hero' }),
      h('div', { class: 'panel' }, [
        h('div', { class: 'skeleton sk-line', style: 'width:55%' }),
        h('div', { class: 'skeleton sk-line', style: 'width:80%' }),
        h('div', { class: 'skeleton sk-line', style: 'width:40%' })
      ])
    ]);
  }

  function infoPanel(detail) {
    var rows = [];
    if (detail.address || detail.city) {
      var addressText = [detail.address, detail.city].filter(Boolean).join(', ');
      rows.push(h('div', { class: 'kv' }, [
        h('span', { class: 'k', text: '📍' }),
        h('span', { class: 'v' }, detail.map_url
          ? h('a', { href: '#', text: addressText, onClick: function (event) { event.preventDefault(); openLink(detail.map_url); } })
          : h('span', { text: addressText }))
      ]));
    }
    if (detail.phone) {
      rows.push(h('div', { class: 'kv' }, [
        h('span', { class: 'k', text: '📞' }),
        h('span', { class: 'v' }, h('a', { href: 'tel:' + detail.phone, text: detail.phone }))
      ]));
    }
    if (detail.today_hours) {
      rows.push(h('div', { class: 'kv' }, [
        h('span', { class: 'k', text: '🕒' }),
        h('span', { class: 'v', text: detail.today_hours.day + ' · ' + detail.today_hours.hours })
      ]));
    }
    if (detail.price_display) {
      rows.push(h('div', { class: 'kv' }, [
        h('span', { class: 'k', text: '💳' }),
        h('span', { class: 'v', text: 'Gamme de prix ' + detail.price_display + ' · CHF' })
      ]));
    }
    if (detail.reservation_hint) {
      rows.push(h('div', { class: 'kv' }, [
        h('span', { class: 'k', text: '✅' }),
        h('span', { class: 'v', text: detail.reservation_hint })
      ]));
    }
    if (!rows.length) return null;
    return h('section', { class: 'panel' }, [h('h3', { text: 'Informations' })].concat(rows));
  }

  function hoursPanel(detail) {
    var hours = Array.isArray(detail.opening_hours) ? detail.opening_hours : [];
    if (!hours.length) return null;
    var todayLabel = detail.today_hours ? detail.today_hours.day : null;
    return h('section', { class: 'panel' }, [
      h('h3', { text: 'Horaires' }),
      h('div', { class: 'hours' }, hours.map(function (row) {
        return h('div', { class: 'row' + (row.day === todayLabel ? ' today' : '') }, [
          h('span', { class: 'day', text: row.day }),
          h('span', { text: row.hours })
        ]);
      }))
    ]);
  }

  function menuPanel(detail) {
    var items = Array.isArray(detail.menu_highlights) ? detail.menu_highlights : [];
    if (!items.length) return null;
    return h('section', { class: 'panel' }, [
      h('h3', { text: 'À la carte' }),
      h('div', { class: 'menu-list' }, items.map(function (item) {
        return h('div', { class: 'menu-item' }, [
          h('div', { class: 'm-body' }, [
            h('div', { class: 'm-name', text: item.name }),
            item.description ? h('div', { class: 'm-desc', text: item.description }) : null
          ]),
          item.price !== null && item.price !== undefined
            ? h('div', { class: 'm-price', text: formatPrice(item.price, item.currency) })
            : null
        ]);
      }))
    ]);
  }

  function formatDate(value) {
    if (typeof value !== 'string' || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) return value || '';
    var parsed = new Date(value + 'T12:00:00Z');
    if (isNaN(parsed.getTime())) return value;
    try {
      var locale = (host().locale || 'fr-CH');
      return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(parsed);
    } catch (error) {
      return value;
    }
  }

  function formatPrice(price, currency) {
    var value = Number(price);
    if (!isFinite(value)) return '';
    var rounded = Math.round(value * 100) / 100;
    var text = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(2);
    return text + ' ' + (currency || 'CHF');
  }

  function availabilityPanel(detail) {
    var availability = detail.availability || {};
    var slots = Array.isArray(availability.slots) ? availability.slots : [];
    if (!slots.length) return null;
    return h('section', { class: 'panel' }, [
      h('h3', { text: availability.date ? 'Créneaux du ' + formatDate(availability.date) : 'Créneaux' }),
      h('div', { class: 'slots' }, slots.map(function (slot) {
        return h('button', {
          class: 'slot',
          type: 'button',
          'data-available': slot.available === false ? 'false' : 'true',
          title: slot.remaining !== null && slot.remaining !== undefined ? slot.remaining + ' table(s) restante(s)' : undefined,
          onClick: function () {
            askModel('Prépare une réservation TOK chez ' + detail.name + ' le ' + (formatDate(availability.date) || 'prochain service disponible') + ' à ' + slot.time + '. Demande-moi confirmation avant de réserver.');
          }
        }, slot.time);
      }))
    ]);
  }

  function tagsPanel(detail) {
    var amenities = Array.isArray(detail.amenities) ? detail.amenities.filter(Boolean) : [];
    if (!amenities.length) return null;
    return h('section', { class: 'panel' }, [
      h('h3', { text: 'Services' }),
      h('div', { class: 'tags' }, amenities.slice(0, 12).map(function (item) {
        return h('span', { class: 'badge', text: String(item) });
      }))
    ]);
  }

  function renderDetail(detail) {
    var subtitleBits = [];
    if (detail.cuisine) subtitleBits.push(detail.cuisine);
    if (detail.rating) subtitleBits.push('★ ' + (detail.rating_display || detail.rating) + (detail.review_count ? ' · ' + detail.review_count + ' avis' : ''));
    if (detail.price_display) subtitleBits.push(detail.price_display);
    var subtitle = subtitleBits.join(' · ');

    // Sans photo exploitable, un grand visuel vide dessert la fiche : on
    // bascule alors sur un en-tête compact.
    var hero;
    if (safeHttpUrl(detail.image_url)) {
      hero = thumbnail(detail, true);
      hero.appendChild(h('div', { class: 'hero-overlay' }, [
        h('div', null, [
          h('h2', { text: detail.name }),
          subtitle ? h('div', { class: 'sub', text: subtitle }) : null
        ])
      ]));
    } else {
      hero = h('div', { class: 'detail-head' }, [
        h('div', { class: 'em', text: detail.emoji || '🍽️' }),
        h('div', null, [
          h('h2', { text: detail.name }),
          subtitle ? h('div', { class: 'sub', text: subtitle }) : null
        ])
      ]);
    }

    var actions = [];
    if (detail.supports_reservation) {
      actions.push(h('button', {
        class: 'btn primary', type: 'button',
        onClick: function () {
          askModel('Réserve une table chez ' + detail.name + (detail.city ? ' à ' + detail.city : '') + ' via TOK. Propose-moi les créneaux puis demande ma confirmation explicite avant de valider.');
        }
      }, 'Réserver une table'));
    }
    if (detail.url) {
      actions.push(h('button', { class: 'btn', type: 'button', onClick: function () { openLink(detail.url); } }, 'Ouvrir la fiche TOK'));
    }
    if (detail.map_url) {
      actions.push(h('button', { class: 'btn ghost', type: 'button', onClick: function () { openLink(detail.map_url); } }, 'Itinéraire'));
    }

    return h('div', { class: 'detail' }, [
      h('div', { class: 'detail-top' }, [
        h('button', { class: 'back', type: 'button', onClick: closeDetail }, [svg(ICON_BACK, 14), h('span', { text: 'Retour à la sélection' })]),
        detail.rank ? h('span', { class: 'pill', text: 'Classé #' + detail.rank }) : null
      ]),
      hero,
      detail.description ? h('section', { class: 'panel' }, [
        h('h3', { text: 'Le lieu' }),
        h('div', { class: 'kv' }, h('span', { class: 'v', text: detail.description }))
      ]) : null,
      h('div', { class: 'detail-grid' }, [infoPanel(detail), hoursPanel(detail), availabilityPanel(detail), menuPanel(detail), tagsPanel(detail)].filter(Boolean)),
      actions.length ? h('div', { class: 'detail-actions' }, actions) : null
    ]);
  }

  function errorPanel(message) {
    return h('div', { class: 'detail' }, [
      h('div', { class: 'detail-top' }, [
        h('button', { class: 'back', type: 'button', onClick: closeDetail }, [svg(ICON_BACK, 14), h('span', { text: 'Retour' })])
      ]),
      h('div', { class: 'empty' }, [
        h('div', { class: 'em', text: '⚠️' }),
        h('h2', { text: 'Fiche indisponible' }),
        h('p', { text: message || 'TOK n’a pas pu charger cette fiche. Réessayez dans un instant.' })
      ])
    ]);
  }

  /* ---------- navigation ---------- */
  function findCard(id) {
    var cards = state.payload && Array.isArray(state.payload.restaurants) ? state.payload.restaurants : [];
    for (var index = 0; index < cards.length; index += 1) {
      if (cards[index].id === id) return cards[index];
    }
    return null;
  }

  function openDetail(card) {
    if (!card || !card.id) return;
    state.view = 'detail';
    state.selectedId = card.id;
    state.errorId = null;
    persist();
    requestDisplay('fullscreen');

    if (state.details[card.id]) { render(); return; }

    var callTool = hostCall('callTool');
    if (!callTool) {
      state.details[card.id] = Object.assign({}, card, { kind: 'restaurant_detail', partial: true });
      render();
      return;
    }

    state.loadingId = card.id;
    render();

    Promise.resolve()
      .then(function () {
        return callTool('get_restaurant_details', {
          restaurant_id: card.id,
          include_menu: true,
          include_availability: true
        });
      })
      .then(function (result) {
        var detail = toDetail(result);
        state.details[card.id] = detail
          ? Object.assign({}, card, detail)
          : Object.assign({}, card, { kind: 'restaurant_detail', partial: true });
      })
      .catch(function (error) {
        state.details[card.id] = Object.assign({}, card, { kind: 'restaurant_detail', partial: true });
        state.errorId = error && error.message ? String(error.message) : null;
      })
      .then(function () {
        if (state.loadingId === card.id) state.loadingId = null;
        render();
      });
  }

  function closeDetail() {
    state.view = 'list';
    state.selectedId = null;
    state.errorId = null;
    state.fullscreen = false;
    persist();
    requestDisplay('inline');
    render();
  }

  /* ---------- rendu ---------- */
  function render() {
    var payload = state.payload;
    root.textContent = '';

    if (!payload) {
      root.appendChild(h('div', { class: 'empty' }, [
        h('div', { class: 'em', text: '🍽️' }),
        h('h2', { text: 'TOK Connect est prêt' }),
        h('p', { text: 'Demandez par exemple « 3 pizzerias et 2 restaurants de sushi à Genève » : la sélection TOK s’affichera ici.' })
      ]));
      return;
    }

    if (state.view === 'detail' && state.selectedId) {
      if (state.loadingId === state.selectedId) { root.appendChild(detailSkeleton()); return; }
      var detail = state.details[state.selectedId] || payload.detail;
      if (!detail) { root.appendChild(errorPanel(state.errorId)); return; }
      root.appendChild(renderDetail(detail));
      return;
    }

    root.appendChild(renderList(payload));
  }

  /* ---------- synchronisation avec l'hôte ---------- */
  function applyTheme(theme) {
    if (theme === 'dark' || theme === 'light') document.documentElement.setAttribute('data-theme', theme);
  }

  function applyMaxHeight(value) {
    var height = Number(value);
    if (isFinite(height) && height > 0) root.style.minHeight = Math.max(180, height - 32) + 'px';
  }

  function ingest(globals) {
    if (!globals || typeof globals !== 'object') return;
    if (globals.theme) applyTheme(globals.theme);
    if (globals.maxHeight) applyMaxHeight(globals.maxHeight);

    var next = toPayload(globals.toolOutput);
    if (next) {
      var previousId = state.payload && state.payload.query;
      state.payload = next;
      if (next.detail && next.detail.id) {
        state.details[next.detail.id] = next.detail;
        state.view = 'detail';
        state.selectedId = next.detail.id;
      } else if (previousId !== next.query) {
        state.view = 'list';
        state.selectedId = null;
        state.filter = 'all';
      }
    }

    var widgetState = globals.widgetState;
    if (widgetState && typeof widgetState === 'object' && !next) {
      if (widgetState.filter) state.filter = widgetState.filter;
      if (widgetState.view === 'detail' && widgetState.selectedId && findCard(widgetState.selectedId)) {
        state.view = 'detail';
        state.selectedId = widgetState.selectedId;
      }
    }

    render();
  }

  function bootstrap() {
    var api = host();
    ingest({
      theme: api.theme,
      maxHeight: api.maxHeight,
      toolOutput: api.toolOutput,
      widgetState: api.widgetState
    });

    window.addEventListener('openai:set_globals', function (event) {
      var detail = event && event.detail ? event.detail : {};
      ingest(detail.globals || detail);
    });

    // Prévisualisation hors ChatGPT (page /tok-connect/mcp-widget).
    window.addEventListener('message', function (event) {
      var data = event && event.data;
      if (!data || data.type !== 'tok_connect_preview') return;
      ingest({ toolOutput: data.payload, theme: data.theme });
    });

    if (window.parent && window.parent !== window) {
      try { window.parent.postMessage({ type: 'tok_connect_widget_ready' }, '*'); } catch (error) { /* iframe isolée */ }
    }
  }

  bootstrap();
})();
</script>
</body>
</html>`;

/** Descripteur de ressource MCP, partagé par la passerelle et le MCP canonique. */
export function buildTokDiscoveryResourceDescriptor(publicOrigin: string) {
  const origin = (publicOrigin || "https://www.thetok.ch").replace(/\/$/, "");
  const resourceDomains = Array.from(new Set([origin, ...TOK_DISCOVERY_RESOURCE_DOMAINS]));
  return {
    uri: TOK_DISCOVERY_RESOURCE_URI,
    name: "TOK restaurant discovery",
    title: "Sélection de restaurants TOK",
    description: "Module visuel TOK : cartes de restaurants classées par note, avec fiche détaillée cliquable.",
    mimeType: "text/html;profile=mcp-app",
    _meta: {
      ui: {
        domain: origin,
        prefersBorder: true,
        preferredSize: { width: 720, height: 640 },
        csp: { connectDomains: [], resourceDomains },
      },
      "openai/widgetDescription":
        "Sélection TOK de restaurants : cartes classées par note, filtres par cuisine et fiche complète (horaires, carte, créneaux, réservation).",
      "openai/widgetPrefersBorder": true,
      "openai/widgetDomain": origin,
      "openai/widgetCSP": {
        connect_domains: [],
        resource_domains: resourceDomains,
      },
    },
  };
}

/** Contenu renvoyé par resources/read pour cette ressource. */
export function buildTokDiscoveryResourceContents(publicOrigin: string) {
  const descriptor = buildTokDiscoveryResourceDescriptor(publicOrigin);
  return {
    uri: TOK_DISCOVERY_RESOURCE_URI,
    mimeType: descriptor.mimeType,
    text: TOK_DISCOVERY_WIDGET_HTML,
    _meta: descriptor._meta,
  };
}

/** _meta à poser sur chaque outil qui doit ouvrir ce module dans ChatGPT. */
export function buildTokDiscoveryToolMeta(options: { invoking?: string; invoked?: string } = {}) {
  return {
    ui: { resourceUri: TOK_DISCOVERY_RESOURCE_URI, visibility: ["model", "app"] },
    "openai/outputTemplate": TOK_DISCOVERY_RESOURCE_URI,
    "openai/widgetAccessible": true,
    "openai/resultCanProduceWidget": true,
    "openai/toolInvocation/invoking": options.invoking || "Sélection TOK en cours…",
    "openai/toolInvocation/invoked": options.invoked || "Sélection TOK prête",
  };
}
