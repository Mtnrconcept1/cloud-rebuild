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
.tok-booking{margin-top:14px}
.booking-fields{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0}
.booking-field{display:flex;flex:1 1 150px;flex-direction:column;gap:4px;font-size:12px;font-weight:700}
.booking-field input{width:100%;max-width:100%;padding:9px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text);font:inherit}
.booking-guarantee{display:flex;gap:9px;align-items:flex-start;font-size:12px;margin-top:10px}
.booking-guarantee input{margin-top:4px;accent-color:var(--tok-orange)}
.booking-message{font-size:12px;color:var(--text-2);line-height:1.5;margin:8px 0}
.booking-error{font-size:12px;color:#a82820;background:rgba(206,45,28,.1);border-radius:9px;padding:9px;line-height:1.45;margin:10px 0}
.tok-booking .btn{margin:5px 6px 4px 0}
.tok-booking .slot[aria-pressed="true"]{background:var(--tok-orange);color:white;border-color:var(--tok-orange)}
.tok-cart{margin-top:14px}.tok-cart .btn{margin:4px}
.tok-cart-list{max-height:320px;overflow:auto;margin:12px 0;border:1px solid var(--line);border-radius:12px;padding:8px}
.tok-cart-line{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 0;border-bottom:1px solid var(--line-2)}
.tok-cart-line:last-child{border-bottom:0}.tok-cart-line strong{font-size:13px}
.tok-cart-controls{display:flex;align-items:center;gap:4px;white-space:nowrap}
.tok-cart-controls .btn{min-width:30px;padding:3px 8px}
.tok-cart-select{width:100%;padding:9px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--text)}
.tok-cart-total{display:flex;justify-content:space-between;font-size:16px;font-weight:850;border-top:1px solid var(--line);padding-top:12px}
.tok-cart .booking-field input{width:100%}
.tok-cart-alert{font-size:12px;color:var(--muted);line-height:1.5;margin-top:8px}

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
    fullscreen: false,
    booking: null,
    historyItems: [],
    historyLoading: false,
    historyError: null,
    cancelTarget: null,
    cart: null,
    customerOrders: [],
    ordersLoading: false,
    ordersError: null
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
        if (key === 'onChange') { el.addEventListener('change', value); return; }
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
      var cart = state.cart;
      setWidgetState({ view: state.view, selectedId: state.selectedId, filter: state.filter,
        booking: state.booking && state.booking.idempotencyKey ? { restaurantId: state.booking.restaurantId, name: state.booking.name, date: state.booking.date, time: state.booking.time, partySize: state.booking.partySize, guaranteeAccepted: state.booking.guaranteeAccepted, idempotencyKey: state.booking.idempotencyKey } : null,
        cart: cart ? { restaurantId: cart.restaurantId, journey: cart.journey,
          date: cart.date, time: cart.time, partySize: cart.partySize,
          paymentMethod: cart.paymentMethod, items: cart.items,
          attemptId: cart.attemptId, stage: cart.stage } : null
      });
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
        h('button', { class: 'btn', type: 'button', onClick: loadCustomerHistory }, 'Mes tables'),
        h('button', { class: 'btn', type: 'button', onClick: loadMyOrders }, 'Mes commandes'),
        state.cart && state.cart.attemptId ? h('button', {
          class: 'btn', type: 'button',
          onClick: function () { state.view = 'detail'; state.selectedId = state.cart.restaurantId; render(); }
        }, 'Paiement à vérifier') : null,
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

  /* ---------- réservation cliente native (jamais de paiement non vérifié) ---------- */
  function tokToolPayload(raw) {
    var value = raw && raw.structuredContent ? raw.structuredContent
      : raw && raw.result && raw.result.structuredContent ? raw.result.structuredContent : raw;
    if (value && value.structuredContent) value = value.structuredContent;
    if (!value || typeof value !== 'object') throw new Error('Réponse TOK invalide.');
    if (raw && (raw.isError === true || raw.result && raw.result.isError === true) || value.ok === false || value.isError === true) {
      var err = value.error || {};
      var nested = value.data && value.data.error ? value.data.error : {};
      var failure = new Error(String(err.message || nested.message || value.data && value.data.error_message
        || value.data && value.data.error_code || 'Connexion requise ou action refusée par TOK.'));
      failure.retrySafe = value.retry_safe === true;
      throw failure;
    }
    if (value.data && typeof value.data === 'object') {
      if (value.data.ok === false || value.data.error_code) {
        throw new Error(String(value.data.error_message || value.data.error_code || 'Action TOK refusée.'));
      }
      return value.data;
    }
    return value;
  }

  function invokeTokTool(name, args) {
    var call = hostCall('callTool');
    if (!call) return Promise.reject(new Error('Ouvrez TOK Connect dans ChatGPT pour utiliser cette action.'));
    return Promise.resolve().then(function () { return call(name, args); }).then(tokToolPayload);
  }

  function tokIdempotencyKey() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return 'tok-widget-' + crypto.randomUUID();
    }
    return 'tok-widget-' + String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  }

  function startBooking(detail, slot) {
    if (!detail || !detail.id) return;
    var current = state.booking;
    if (current && ['processing', 'uncertain', 'guarantee'].indexOf(current.step) >= 0) {
      state.selectedId = current.restaurantId; state.view = 'detail'; render(); return;
    }
    var date = detail.availability && detail.availability.date || state.payload && state.payload.date || '';
    state.booking = {
      restaurantId: detail.id, name: detail.name,
      date: date, time: slot && slot.time || '',
      partySize: Math.max(1, Math.min(20, Number(state.payload && state.payload.party_size) || 2)),
      slots: detail.availability && Array.isArray(detail.availability.slots) ? detail.availability.slots : [],
      step: 'draft', quote: null, quoteLoading: false, loadingSlots: false,
      quoteError: null, guaranteeAccepted: false, error: null, result: null, idempotencyKey: null
    };
    if (current && current.restaurantId === detail.id && current.date === date && current.time === (slot && slot.time || '')) {
      state.booking.partySize = current.partySize;
    }
    render();
    loadBookingQuote();
    if (!state.booking.slots.length && date) loadBookingSlots(detail);
  }

  function loadBookingQuote() {
    var booking = state.booking;
    if (!booking || booking.quoteLoading) return;
    booking.quoteLoading = true; booking.quoteError = null; booking.quote = null;
    var capturedSize = booking.partySize;
    render();
    invokeTokTool('tok_quote_reservation', { party_size: capturedSize }).then(function (quote) {
      if (state.booking === booking && booking.partySize === capturedSize) booking.quote = quote;
    }).catch(function (error) {
      if (state.booking === booking && booking.partySize === capturedSize)
        booking.quoteError = String(error.message || error);
    }).finally(function () {
      if (state.booking === booking) { booking.quoteLoading = false; render(); }
    });
  }

  function loadBookingSlots(detail) {
    var booking = state.booking;
    if (!booking || booking.loadingSlots || !booking.date) return;
    booking.loadingSlots = true; booking.error = null;
    var date = booking.date;
    var size = booking.partySize;
    render();
    invokeTokTool('get_real_time_availability', {
      restaurant_id: detail.id, date: date, party_size: size
    }).then(function (response) {
      if (state.booking !== booking || booking.date !== date || booking.partySize !== size) return;
      var raw = Array.isArray(response.slots) ? response.slots : [];
      booking.slots = raw.map(function (slot) {
        return {
          time: String(slot.slot_time || slot.time || '').slice(0, 5),
          available: slot.available !== false && slot.remaining_tables !== 0 && slot.remaining !== 0,
          remaining: slot.remaining_tables != null ? slot.remaining_tables : slot.remaining
        };
      }).filter(function (slot) { return /^\\d{2}:\\d{2}$/.test(slot.time); });
    }).catch(function (error) {
      if (state.booking === booking) booking.error = String(error.message || error);
    }).finally(function () {
      if (state.booking === booking) { booking.loadingSlots = false; render(); }
    });
  }

  function safePaymentUrl(value) {
    try {
      var url = new URL(String(value || ''));
      if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
      if (['checkout.stripe.com', 'www.thetok.ch', 'thetok.ch'].indexOf(url.hostname) < 0) return null;
      return url.toString();
    } catch (error) { return null; }
  }

  function confirmBooking() {
    var booking = state.booking;
    if (!booking || ['draft', 'uncertain'].indexOf(booking.step) < 0 || !booking.quote || !booking.date || !booking.time
      || !/^\\d{4}-\\d{2}-\\d{2}$/.test(booking.date) || !/^\\d{2}:\\d{2}$/.test(booking.time)) return;
    if (booking.quote.required && !booking.guaranteeAccepted) {
      booking.error = 'Acceptez les conditions de garantie bancaire avant de continuer.';
      render(); return;
    }
    booking.error = null; booking.step = 'processing';
    if (!booking.idempotencyKey) booking.idempotencyKey = tokIdempotencyKey();
    persist(); render();
    invokeTokTool('tok_book_table', {
      restaurant_id: booking.restaurantId,
      date: booking.date, time: booking.time, party_size: booking.partySize,
      guarantee_accepted: booking.guaranteeAccepted === true,
      confirmed_by_user: true, idempotency_key: booking.idempotencyKey
    }).then(function (response) {
      if (state.booking !== booking) return;
      if (response.requires_card_guarantee && safePaymentUrl(response.checkout_url)) {
        booking.step = 'guarantee'; booking.result = { url: safePaymentUrl(response.checkout_url) };
      } else if (response.reservation_id || response.reservationId) {
        booking.step = 'confirmed';
        booking.result = { id: String(response.reservation_id || response.reservationId) };
      } else {
        throw new Error('TOK n’a pas confirmé la réservation : vérifiez votre historique avant de réessayer.');
      }
    }).catch(function (error) {
      if (state.booking === booking) {
        booking.step = error.retrySafe === true ? 'draft' : 'uncertain';
        if (error.retrySafe === true) { booking.idempotencyKey = null; booking.quote = null; }
        booking.error = String(error.message || error);
      }
    }).finally(function () { if (state.booking === booking) { persist(); render(); } });
  }

  function bookingPanel(detail) {
    var booking = state.booking;
    if (!booking || booking.restaurantId !== detail.id) return null;
    var inputs = [];
    if (booking.step === 'confirmed') {
      return h('section', { class: 'panel tok-booking' }, [
        h('h3', { text: 'Réservation confirmée par TOK' }),
        h('p', { class: 'booking-message', text: 'Votre réservation est enregistrée. Référence : ' + booking.result.id }),
        h('button', { class: 'btn', type: 'button', onClick: function () { loadCustomerHistory(); } }, 'Mes réservations')
      ]);
    }
    if (booking.step === 'processing' || booking.step === 'uncertain') {
      return h('section', { class: 'panel tok-booking' }, [
        h('h3', { text: 'Vérification de votre réservation' }),
        h('p', { class: 'booking-message', text: booking.partySize + ' personne(s) · ' + formatDate(booking.date) + ' · ' + booking.time }),
        h('p', { class: 'booking-message', text: 'La réponse est en attente ou a été interrompue. Les détails restent verrouillés pour éviter une seconde réservation.' }),
        booking.error ? h('p', { class: 'booking-error', role: 'alert', text: booking.error }) : null,
        h('button', { class: 'btn', type: 'button', disabled: booking.step === 'processing', onClick: confirmBooking }, 'Reprendre la même réservation'),
        h('button', { class: 'btn', type: 'button', onClick: loadCustomerHistory }, 'Vérifier mes réservations')
      ]);
    }
    if (booking.step === 'guarantee') {
      return h('section', { class: 'panel tok-booking' }, [
        h('h3', { text: 'Empreinte bancaire à finaliser' }),
        h('p', { class: 'booking-message', text: 'La table n’est pas encore confirmée. Terminez la garantie bancaire via le paiement sécurisé TOK, puis vérifiez le statut de votre réservation.' }),
        h('button', { class: 'btn primary', type: 'button',
          onClick: function () { openLink(booking.result.url); }
        }, 'Continuer sur Stripe'),
        h('button', { class: 'btn', type: 'button', onClick: loadCustomerHistory }, 'Vérifier mes réservations')
      ]);
    }
    inputs.push(h('div', { class: 'booking-fields' }, [
      h('label', { class: 'booking-field' }, [
        h('span', { text: 'Date de réservation' }),
        h('input', { type: 'date', value: booking.date, onChange: function (event) {
          booking.date = event.target.value; booking.time = ''; booking.slots = []; booking.idempotencyKey = null;
          render();
        } })
      ]),
      h('label', { class: 'booking-field' }, [
        h('span', { text: 'Convives' }),
        h('input', { type: 'number', min: '1', max: '20', step: '1', value: booking.partySize,
          onChange: function (event) {
            var next = Number(event.target.value);
            if (!Number.isInteger(next) || next < 1 || next > 20) return;
            booking.partySize = next; booking.slots = []; booking.time = ''; booking.quote = null;
            booking.idempotencyKey = null; booking.guaranteeAccepted = false;
            render(); loadBookingQuote();
          }
        })
      ])
    ]));
    inputs.push(h('button', { class: 'btn', type: 'button', disabled: booking.loadingSlots || !booking.date,
      onClick: function () { loadBookingSlots(detail); }
    }, booking.loadingSlots ? 'Vérification…' : 'Actualiser les créneaux'));
    var slots = Array.isArray(booking.slots) ? booking.slots : [];
    if (slots.length) inputs.push(h('div', { class: 'slots' }, slots.map(function (slot) {
      return h('button', {
        class: 'slot', type: 'button',
        disabled: slot.available === false,
        'aria-pressed': booking.time === slot.time ? 'true' : 'false',
        onClick: function () { booking.time = slot.time; booking.idempotencyKey = null; render(); }
      }, slot.time);
    })));
    else inputs.push(h('p', { class: 'booking-message', text: 'Choisissez une date, puis vérifiez les créneaux disponibles.' }));
    if (booking.date && booking.time) inputs.push(h('p', { class: 'booking-message',
      text: booking.partySize + ' personne(s) · ' + formatDate(booking.date) + ' · ' + booking.time
    }));
    if (booking.quoteLoading) inputs.push(h('p', { class: 'booking-message', text: 'Vérification de la garantie bancaire…' }));
    if (booking.quoteError) inputs.push(h('p', { class: 'booking-error', text: booking.quoteError }));
    if (booking.quote && booking.quote.required) {
      var fee = Number(booking.quote.fee_amount_cents || 0) / 100;
      inputs.push(h('label', { class: 'booking-guarantee' }, [
        h('input', { type: 'checkbox', checked: booking.guaranteeAccepted,
          onChange: function (event) {
            booking.guaranteeAccepted = event.target.checked; booking.idempotencyKey = null; render();
          }
        }),
        h('span', { text: 'J’accepte l’empreinte bancaire et les conditions d’annulation TOK (montant annoncé : ' + formatPrice(fee, 'CHF') + ').' })
      ]));
    }
    if (booking.error) inputs.push(h('p', { class: 'booking-error', role: 'alert', text: booking.error }));
    inputs.push(h('button', { class: 'btn primary', type: 'button',
      disabled: booking.step === 'processing' || !booking.quote || !booking.time || !booking.date
        || (booking.quote.required && !booking.guaranteeAccepted),
      onClick: confirmBooking
    }, booking.step === 'processing' ? 'Confirmation TOK en cours…' : 'Confirmer cette réservation'));
    inputs.push(h('p', { class: 'booking-message', text: 'Le serveur TOK revérifie la disponibilité. Une garantie bancaire éventuelle ne confirme la réservation qu’après sa finalisation.' }));
    return h('section', { class: 'panel tok-booking' }, [h('h3', { text: 'Réserver chez ' + booking.name })].concat(inputs));
  }

  function loadCustomerHistory() {
    state.view = 'history'; state.historyLoading = true; state.historyError = null;
    state.cancelTarget = null; render();
    invokeTokTool('tok_my_reservations', { limit: 10 }).then(function (response) {
      state.historyItems = Array.isArray(response.items) ? response.items : [];
    }).catch(function (error) {
      state.historyError = String(error.message || error);
    }).finally(function () { state.historyLoading = false; render(); });
  }

  function cancelCustomerBooking(item) {
    if (!item || state.cancelTarget !== item.id) return;
    state.historyLoading = true; state.historyError = null;
    render();
    invokeTokTool('tok_cancel_my_reservation', {
      reservation_id: item.id, confirmed_by_user: true,
      idempotency_key: tokIdempotencyKey()
    }).then(function () {
      loadCustomerHistory();
    }).catch(function (error) {
      state.historyError = String(error.message || error);
      state.cancelTarget = null;
      state.historyLoading = false; render();
    });
  }

  function renderHistory() {
    var children = [
      h('button', { class: 'back', type: 'button', onClick: closeDetail }, [svg(ICON_BACK, 14), h('span', { text: 'Retour aux restaurants' })]),
      h('h2', { text: 'Mes réservations TOK' })
    ];
    if (state.historyLoading) children.push(h('p', { class: 'booking-message', text: 'Chargement…' }));
    if (state.historyError) children.push(h('p', { class: 'booking-error', role: 'alert', text: state.historyError }));
    if (!state.historyLoading && !state.historyItems.length) {
      children.push(h('p', { class: 'booking-message', text: 'Aucune réservation visible sur votre compte TOK.' }));
    }
    state.historyItems.forEach(function (item) {
      var canCancel = String(item.feature || 'classique') === 'classique' && item.status !== 'cancelled';
      var rows = [
        h('h3', { text: formatDate(item.date) + ' · ' + String(item.time || '').slice(0,5) }),
        h('p', { class: 'booking-message', text: 'Statut : ' + item.status + ' · ' + item.party_size + ' convive(s)' }),
        h('p', { class: 'booking-message', text: 'Référence : ' + item.id })
      ];
      if (canCancel && state.cancelTarget !== item.id) rows.push(h('button', {
        class: 'btn', type: 'button', onClick: function () { state.cancelTarget = item.id; render(); }
      }, 'Demander l’annulation'));
      else if (canCancel) rows.push(h('div', { class: 'detail-actions' }, [
        h('button', { class: 'btn primary', type: 'button', onClick: function () { cancelCustomerBooking(item); } }, 'Confirmer l’annulation'),
        h('button', { class: 'btn', type: 'button', onClick: function () { state.cancelTarget = null; render(); } }, 'Conserver ma table')
      ]));
      children.push(h('section', { class: 'panel tok-booking' }, rows));
    });
    return h('div', { class: 'detail' }, children);
  }

  /* ---------- parcours panier et checkout authentifiés TOK ---------- */
  function tokTodayInZurich() {
    var parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    function value(type) { return (parts.find(function (p) { return p.type === type; }) || {}).value || ''; }
    return value('year') + '-' + value('month') + '-' + value('day');
  }

  function startCart(detail, mode) {
    if (!detail || !detail.id) return;
    if (state.cart && state.cart.restaurantId === detail.id && !state.cart.attemptId) {
      state.cart.journey = mode;
      cartChanged(state.cart);
      return;
    }
    // An ambiguous checkout may already be payable. Never overwrite its
    // idempotency key by opening a new cart, even at another restaurant.
    if (state.cart && state.cart.attemptId) {
      state.view = 'detail'; state.selectedId = state.cart.restaurantId;
      var existingCard = findCard(state.cart.restaurantId);
      if (existingCard && !state.details[existingCard.id]) {
        state.details[existingCard.id] = Object.assign({}, existingCard, { kind: 'restaurant_detail', partial: true });
      }
      state.cart.error = 'Terminez ou annulez votre tentative Stripe avant de commencer une autre commande.';
      render(); return;
    }
    state.cart = {
      restaurantId: detail.id, journey: mode, date: detail.availability && detail.availability.date
        || state.payload && state.payload.date || tokTodayInZurich(),
      time: detail.availability && detail.availability.slots && detail.availability.slots[0]
        ? String(detail.availability.slots[0].time || '') : '',
      partySize: Math.max(1, Math.min(20, Number(state.payload && state.payload.party_size) || 2)),
      paymentMethod: 'card', items: {}, menu: [], notes: '',
      quote: null, quoteLoading: false, menuLoading: true,
      stage: 'draft', attemptId: null, checkoutUrl: null, message: null, error: null
    };
    persist(); render();
    var cart = state.cart;
    invokeTokTool('get_restaurant_menu', { restaurant_id: detail.id, limit: 100 }).then(function (payload) {
      if (state.cart !== cart) return;
      var items = Array.isArray(payload.items) ? payload.items : [];
      cart.menu = items.filter(function (item) {
        return item && typeof item.id === 'string' && /^[0-9a-f-]{36}$/i.test(item.id)
          && item.is_available !== false && isFinite(Number(item.price));
      }).slice(0, 100);
      if (!cart.menu.length) cart.error = 'Aucun plat commandable pour le moment.';
    }).catch(function (error) {
      if (state.cart === cart) cart.error = String(error.message || error);
    }).finally(function () {
      if (state.cart === cart) { cart.menuLoading = false; render(); }
    });
  }

  function cartEditable(cart) {
    return !cart.attemptId && cart.stage !== 'processing' && cart.stage !== 'pending';
  }
  function cartChanged(cart) {
    if (!cartEditable(cart)) return;
    cart.quote = null; cart.attemptId = null; cart.checkoutUrl = null;
    cart.message = null; cart.error = null; cart.stage = 'draft';
    persist(); render();
  }
  function selectedCartItems(cart) {
    return Object.keys(cart.items).map(function (id) {
      return { menu_item_id: id, quantity: Number(cart.items[id]) };
    }).filter(function (item) { return Number.isInteger(item.quantity) && item.quantity > 0; });
  }
  function cartArguments(cart) {
    return { restaurant_id: cart.restaurantId, journey: cart.journey,
      items: selectedCartItems(cart), date: cart.date, time: cart.time,
      party_size: cart.journey === 'zero-attente' ? cart.partySize : 1,
      payment_method: cart.paymentMethod, notes: cart.notes || '' };
  }

  function quoteCart() {
    var cart = state.cart;
    if (!cart || !cartEditable(cart) || !selectedCartItems(cart).length || !cart.date || !cart.time) return;
    cart.quote = null; cart.error = null; cart.quoteLoading = true; render();
    invokeTokTool('tok_quote_customer_cart', cartArguments(cart)).then(function (response) {
      if (state.cart !== cart) return;
      if (!response.quote || !Number.isSafeInteger(response.quote.total_cents))
        throw new Error('Le devis du serveur TOK est invalide.');
      cart.quote = response.quote; cart.stage = 'quoted';
    }).catch(function (error) {
      if (state.cart === cart) cart.error = String(error.message || error);
    }).finally(function () {
      if (state.cart === cart) { cart.quoteLoading = false; render(); }
    });
  }

  function payCart() {
    var cart = state.cart;
    if (!cart || cart.stage !== 'quoted' || !cart.quote) return;
    var checkedAt = Date.parse(cart.quote.checked_at || '');
    if (!isFinite(checkedAt) || Math.abs(Date.now() - checkedAt) > 300000) {
      cart.quote = null; cart.stage = 'draft';
      cart.error = 'Devis expiré. Vérifiez de nouveau le prix.'; render(); return;
    }
    if (typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function') {
      cart.error = 'Cet appareil ne permet pas de sécuriser la tentative de paiement.'; render(); return;
    }
    if (!cart.attemptId) cart.attemptId = crypto.randomUUID();
    var args = Object.assign({}, cartArguments(cart), {
      expected_total_cents: cart.quote.total_cents, payment_attempt_id: cart.attemptId,
      idempotency_key: 'tok-cart:' + cart.attemptId, confirmed_by_user: true
    });
    cart.stage = 'processing'; cart.error = null; persist(); render();
    invokeTokTool('tok_checkout_customer_cart', args).then(function (response) {
      if (state.cart !== cart) return;
      var url = safePaymentUrl(response.checkout_url);
      if (!url || response.payment_status !== 'pending')
        throw new Error('TOK n’a pas fourni une session de paiement vérifiée.');
      cart.checkoutUrl = url; cart.stage = 'pending';
      cart.message = 'Paiement Stripe à finaliser. La commande ou la table n’est pas encore confirmée.';
      persist(); openLink(url);
    }).catch(function (error) {
      if (state.cart !== cart) return;
      cart.error = String(error.message || error);
      if (error.retrySafe === true) {
        cart.attemptId = null; cart.quote = null; cart.stage = 'draft';
        cart.message = 'Aucun paiement créé. Corrigez le panier et vérifiez de nouveau le prix.';
        persist(); return;
      }
      // Stripe may have created a session despite a lost response.
      // Keep the operation UUID frozen until status or cancellation proves
      // it safe to start a different payment.
      cart.stage = 'pending';
      cart.message = 'État de paiement incertain. Vérifiez ou annulez cette tentative avant toute nouvelle commande.';
      persist();
    }).finally(function () { if (state.cart === cart) render(); });
  }

  function checkCartPayment() {
    var cart = state.cart;
    if (!cart || !cart.attemptId || cart.statusLoading || cart.stage === 'processing') return;
    cart.statusLoading = true; cart.error = null; render();
    invokeTokTool('tok_customer_payment_status', { payment_attempt_id: cart.attemptId })
      .then(function (status) {
        if (state.cart !== cart) return;
        cart.checkoutUrl = status.paid ? null : safePaymentUrl(status.checkout_url);
        if (status.retry_safe === true && status.state === 'rejected' || status.state === 'cancelled') {
          cart.attemptId = null; cart.quote = null; cart.stage = 'draft';
          cart.message = 'Aucun paiement en cours. Vérifiez de nouveau le prix.'; persist(); return;
        }
        cart.paymentFinalized = status.paid === true && status.state === 'finalized';
        cart.message = cart.paymentFinalized
          ? 'Paiement traité par TOK. Vérifiez votre commande ou réservation avant de commander à nouveau.'
          : status.paid
            ? 'Paiement reçu. TOK finalise la commande ou réservation ; ne repassez pas de paiement.'
            : status.state === 'expired'
              ? 'Session Stripe expirée. Annulez cette tentative pour libérer le panier.'
              : status.state === 'indeterminate'
                ? 'Vérification temporairement indisponible. Aucun nouveau paiement ne sera lancé.'
                : 'Paiement non encore finalisé. Reprenez la session disponible ou vérifiez de nouveau.';
        persist();
      }).catch(function (error) {
        if (state.cart === cart) cart.error = String(error.message || error);
      }).finally(function () { if (state.cart === cart) { cart.statusLoading = false; render(); } });
  }

  function cancelCartPayment() {
    var cart = state.cart;
    if (!cart || !cart.attemptId) return;
    if (!cart.cancelConfirmed) {
      cart.cancelConfirmed = true; render(); return;
    }
    if (cart.cancelLoading) return;
    cart.cancelLoading = true; cart.error = null; render();
    invokeTokTool('tok_cancel_cart_payment_attempt', {
      payment_attempt_id: cart.attemptId,
      confirmed_by_user: true,
      idempotency_key: 'tok-cancel:' + cart.attemptId
    }).then(function (result) {
      if (state.cart !== cart) return;
      if (result.cancelled === true && result.state === 'cancelled') {
        cart.attemptId = null; cart.checkoutUrl = null; cart.quote = null;
        cart.stage = 'draft'; cart.message = 'Tentative annulée par TOK. Vous pouvez modifier le panier et demander un nouveau devis.';
        cart.cancelConfirmed = false;
      } else {
        cart.message = 'Annulation en cours de vérification : le panier reste verrouillé.';
      }
      persist();
    }).catch(function (error) {
      if (state.cart === cart) cart.error = String(error.message || error);
    }).finally(function () {
      if (state.cart === cart) { cart.cancelLoading = false; render(); }
    });
  }

  function loadMyOrders() {
    state.view = 'orders'; state.ordersLoading = true; state.ordersError = null; render();
    invokeTokTool('tok_my_orders', { limit: 10 }).then(function (response) {
      state.customerOrders = Array.isArray(response.items) ? response.items : [];
    }).catch(function (error) {
      state.ordersError = String(error.message || error);
    }).finally(function () { state.ordersLoading = false; render(); });
  }

  function renderMyOrders() {
    var rows = [
      h('button', { class: 'back', type: 'button', onClick: closeDetail }, 'Retour aux restaurants'),
      h('h2', { text: 'Mes commandes TOK' })
    ];
    if (state.ordersLoading) rows.push(h('p', { class: 'booking-message', text: 'Chargement…' }));
    if (state.ordersError) rows.push(h('p', { class: 'booking-error', text: state.ordersError }));
    if (!state.ordersLoading && !state.customerOrders.length)
      rows.push(h('p', { class: 'booking-message', text: 'Aucune commande sur ce compte TOK.' }));
    state.customerOrders.forEach(function (order) {
      rows.push(h('section', { class: 'panel' }, [
        h('h3', { text: 'Commande du ' + String(order.created_at || '').slice(0, 10) }),
        h('p', { class: 'booking-message',
          text: 'Statut : ' + String(order.status || '?') + ' · Paiement : ' + String(order.payment_status || '?') }),
        h('p', { class: 'booking-message', text: 'Référence : ' + String(order.id || '') })
      ]));
    });
    return h('div', { class: 'detail' }, rows);
  }

  function cartPanel(detail) {
    var cart = state.cart;
    if (!cart || cart.restaurantId !== detail.id) return null;
    var editable = cartEditable(cart);
    var nodes = [h('h3', { text: 'Commande TOK · ' + detail.name }),
      h('p', { class: 'booking-message', text: 'Prix et disponibilité vérifiés par TOK avant le paiement.' })];
    if (editable) nodes.push(h('div', { class: 'detail-actions' }, [
      h('button', { class: 'btn', type: 'button', onClick: function () {
        cart.journey = 'takeaway'; cartChanged(cart);
      } }, 'À emporter'),
      h('button', { class: 'btn', type: 'button', onClick: function () {
        cart.journey = 'zero-attente'; cartChanged(cart);
      } }, 'Zéro Attente')
    ]));
    if (cart.menuLoading) nodes.push(h('p', { class: 'booking-message', text: 'Chargement de la carte…' }));
    if (cart.menu.length) nodes.push(h('div', { class: 'tok-cart-list' }, cart.menu.map(function (item) {
      var count = Number(cart.items[item.id] || 0);
      return h('div', { class: 'tok-cart-line' }, [
        h('div', null, [
          h('strong', { text: item.name }),
          h('p', { class: 'booking-message', text: formatPrice(item.price, 'CHF') })
        ]),
        h('div', { class: 'tok-cart-controls' }, [
          h('button', { class: 'btn', type: 'button', disabled: !editable || count === 0,
            'aria-label': 'Retirer ' + item.name, onClick: function () {
              if (count <= 1) delete cart.items[item.id]; else cart.items[item.id] = count - 1;
              cartChanged(cart);
            } }, '−'),
          h('span', { text: String(count) }),
          h('button', { class: 'btn', type: 'button', disabled: !editable || count >= 20,
            'aria-label': 'Ajouter ' + item.name, onClick: function () {
              cart.items[item.id] = count + 1; cartChanged(cart);
            } }, '+')
        ])
      ]);
    })));
    if (editable) {
      nodes.push(h('div', { class: 'booking-fields' }, [
        h('label', { class: 'booking-field' }, [
          h('span', { text: cart.journey === 'zero-attente' ? 'Date d’arrivée' : 'Date de retrait' }),
          h('input', { type: 'date', value: cart.date, onChange: function (event) {
            cart.date = event.target.value; cartChanged(cart);
          } })
        ]),
        h('label', { class: 'booking-field' }, [
          h('span', { text: cart.journey === 'zero-attente' ? 'Heure d’arrivée' : 'Heure de retrait' }),
          h('input', { type: 'time', value: cart.time, onChange: function (event) {
            cart.time = event.target.value; cartChanged(cart);
          } })
        ]),
        cart.journey === 'zero-attente' ? h('label', { class: 'booking-field' }, [
          h('span', { text: 'Convives' }),
          h('input', { type: 'number', min: '1', max: '20', value: cart.partySize,
            onChange: function (event) {
              var next = Number(event.target.value);
              if (!Number.isInteger(next) || next < 1 || next > 20) return;
              cart.partySize = next; cartChanged(cart);
            } })
        ]) : null,
        h('label', { class: 'booking-field' }, [
          h('span', { text: 'Paiement' }),
          h('select', { class: 'tok-cart-select', onChange: function (event) {
            cart.paymentMethod = event.target.value; cartChanged(cart);
          } }, [
            h('option', { value: 'card', selected: cart.paymentMethod === 'card' }, 'Carte bancaire'),
            h('option', { value: 'twint', selected: cart.paymentMethod === 'twint' }, 'TWINT')
          ])
        ])
      ]));
      nodes.push(h('button', { class: 'btn', type: 'button',
        disabled: cart.quoteLoading || !selectedCartItems(cart).length || !cart.time || !cart.date,
        onClick: quoteCart
      }, cart.quoteLoading ? 'Vérification TOK…' : 'Vérifier le prix'));
      if (cart.quote) {
        nodes.push(h('div', { class: 'tok-cart-total' }, [
          h('span', { text: 'Total confirmé par TOK' }),
          h('span', { text: formatPrice(cart.quote.total_cents / 100, 'CHF') })
        ]));
        nodes.push(h('button', { class: 'btn primary', type: 'button',
          disabled: cart.stage !== 'quoted', onClick: payCart
        }, 'Confirmer et payer sur Stripe'));
      }
    }
    if (cart.message) nodes.push(h('p', { class: 'booking-message', text: cart.message }));
    if (cart.error) nodes.push(h('p', { class: 'booking-error', role: 'alert', text: cart.error }));
    if (cart.checkoutUrl) nodes.push(h('button', { class: 'btn primary', type: 'button',
      onClick: function () { openLink(cart.checkoutUrl); }
    }, 'Reprendre le paiement Stripe'));
    if (cart.attemptId) {
      nodes.push(h('button', { class: 'btn', type: 'button', disabled: cart.statusLoading || cart.stage === 'processing',
        onClick: checkCartPayment
      }, 'Vérifier le paiement'));
      if (cart.paymentFinalized) nodes.push(h('button', { class: 'btn', type: 'button',
        onClick: function () {
          if (!cart.paymentFinalized) return;
          state.cart = null; persist(); render();
        }
      }, 'Terminer ce paiement'));
      nodes.push(h('button', { class: 'btn', type: 'button', disabled: cart.cancelLoading || cart.stage === 'processing' || cart.paymentFinalized,
        onClick: cancelCartPayment
      }, cart.cancelConfirmed ? 'Confirmer l’annulation de Stripe' : 'Annuler cette tentative de paiement'));
    }
    nodes.push(h('button', { class: 'btn', type: 'button', onClick: loadMyOrders }, 'Mes commandes'));
    nodes.push(h('p', { class: 'tok-cart-alert',
      text: 'Seule la confirmation serveur TOK après paiement valide une commande ou une réservation. Aucune donnée bancaire ne transite par le widget.' }));
    return h('section', { class: 'panel tok-cart' }, nodes);
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
          onClick: function () { startBooking(detail, slot); }
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
          startBooking(detail, null);
        }
      }, 'Réserver une table'));
    }
    if (detail.supports_pickup) actions.push(h('button', {
      class: 'btn', type: 'button', onClick: function () { startCart(detail, 'takeaway'); }
    }, 'Commander à emporter'));
    if (detail.supports_reservation && detail.supports_dinein) actions.push(h('button', {
      class: 'btn', type: 'button', onClick: function () { startCart(detail, 'zero-attente'); }
    }, 'Zéro Attente'));
    if (detail.url) actions.push(h('button', { class: 'btn ghost', type: 'button',
      onClick: function () { openLink(detail.url); }
    }, 'Voir sur TOK'));
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
      bookingPanel(detail),
      cartPanel(detail),
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
    state.booking = null;
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

    if (state.view === 'history') {
      root.appendChild(renderHistory());
      return;
    }
    if (state.view === 'orders') {
      root.appendChild(renderMyOrders());
      return;
    }

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

  function restoreTokCart(snapshot) {
    if (state.cart || !snapshot || typeof snapshot !== 'object') return;
    var id = String(snapshot.restaurantId || '');
    if (!/^[0-9a-f-]{36}$/i.test(id)) return;
    var detail = findCard(id) || (state.payload && state.payload.detail && state.payload.detail.id === id
      ? state.payload.detail : null);
    // The latest restaurant selection can differ from the interrupted
    // payment's restaurant. Keep the attempt recoverable even in that case.
    if (!detail) detail = { id: id, name: 'Restaurant TOK' };
    var items = {};
    if (snapshot.items && typeof snapshot.items === 'object' && !Array.isArray(snapshot.items)) {
      Object.keys(snapshot.items).slice(0, 24).forEach(function (key) {
        var amount = snapshot.items[key];
        if (/^[0-9a-f-]{36}$/i.test(key) && Number.isInteger(amount) && amount > 0 && amount <= 20) {
          items[key] = amount;
        }
      });
    }
    var attemptId = typeof snapshot.attemptId === 'string'
      && /^[0-9a-f-]{36}$/i.test(snapshot.attemptId) ? snapshot.attemptId : null;
    state.cart = {
      restaurantId: id, journey: snapshot.journey === 'zero-attente' ? 'zero-attente' : 'takeaway',
      date: /^\\d{4}-\\d{2}-\\d{2}$/.test(snapshot.date || '') ? snapshot.date : tokTodayInZurich(),
      time: /^([01]\\d|2[0-3]):[0-5]\\d$/.test(snapshot.time || '') ? snapshot.time : '',
      partySize: Number.isInteger(snapshot.partySize) && snapshot.partySize >= 1 && snapshot.partySize <= 20
        ? snapshot.partySize : 2,
      paymentMethod: snapshot.paymentMethod === 'twint' ? 'twint' : 'card',
      items: items, menu: [], notes: '', quote: null, quoteLoading: false,
      menuLoading: true, stage: attemptId ? 'pending' : 'draft',
      attemptId: attemptId, checkoutUrl: null,
      message: attemptId
        ? 'Tentative de paiement restaurée. Vérifiez son statut ou annulez-la avant de modifier le panier.'
        : 'Panier restauré. Actualisez le devis avant de payer.',
      error: null
    };
    state.details[id] = Object.assign({}, detail, { kind: 'restaurant_detail' });
    state.selectedId = id;
    state.view = 'detail';
    var restored = state.cart;
    invokeTokTool('get_restaurant_menu', { restaurant_id: id, limit: 100 }).then(function (result) {
      if (state.cart !== restored) return;
      restored.menu = (Array.isArray(result.items) ? result.items : []).filter(function (item) {
        return item && typeof item.id === 'string' && /^[0-9a-f-]{36}$/i.test(item.id)
          && item.is_available !== false && isFinite(Number(item.price));
      }).slice(0, 100);
    }).catch(function (error) {
      if (state.cart === restored) restored.error = String(error.message || error);
    }).finally(function () {
      if (state.cart === restored) { restored.menuLoading = false; render(); }
    });
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
    if (widgetState && typeof widgetState === 'object') {
      if (widgetState.filter) state.filter = widgetState.filter;
      // A reload must never forget an existing payable Stripe attempt. Its
      // stable UUID is restored in a locked state; no implicit payment calls.
      if (!state.cart && widgetState.cart) restoreTokCart(widgetState.cart);
      var saved = widgetState.booking;
      if (!state.booking && saved && /^[0-9a-f-]{36}$/i.test(saved.restaurantId || '')
        && /^tok-widget-[A-Za-z0-9-]+$/.test(saved.idempotencyKey || '')
        && Number.isInteger(saved.partySize) && saved.partySize >= 1 && saved.partySize <= 20) {
        state.booking = Object.assign({}, saved, { step: 'uncertain', slots: [], quote: { required: saved.guaranteeAccepted === true }, error: null });
        state.details[saved.restaurantId] = state.details[saved.restaurantId] || { id: saved.restaurantId, name: String(saved.name || 'Restaurant TOK'), kind: 'restaurant_detail' };
        state.selectedId = saved.restaurantId; state.view = 'detail';
      }
      if (!state.cart && !next && widgetState.view === 'detail'
        && widgetState.selectedId && findCard(widgetState.selectedId)) {
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
