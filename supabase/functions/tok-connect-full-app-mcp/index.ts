import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { HttpError, jsonResponse } from "../_shared/auth.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import {
  buildTokConnectEnvelope,
  makeTokConnectRequestId,
} from "../_shared/tok-connect.ts";
import {
  assertTokConnectFeatureEnabled,
  assertTokConnectRestaurantGrant,
  authenticateTokConnectToken,
  recordTokConnectApiRequest,
  type TokConnectTokenContext,
} from "../_shared/tok-connect-auth.ts";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

type McpHandleResult = {
  payload: Record<string, unknown>;
  context: TokConnectTokenContext | null;
  route: string;
  scopes: string[];
};

type TokConnectMcpTool = {
  name: string;
  title: string;
  description: string;
  requiredScopes: string[];
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};

type TokConnectActor = "client" | "restaurateur" | "admin" | "commercial" | "courier" | "support" | "chatgpt";

type TokConnectAppModule = {
  id: string;
  title: string;
  actor: TokConnectActor | "platform";
  category: "discovery" | "reservation" | "commerce" | "loyalty" | "marketing" | "ai" | "operations" | "billing" | "sales" | "admin" | "support";
  route: string;
  entrypoints: string[];
  keywords: string[];
  requiredScopes: string[];
  readModels: string[];
  previewActions: string[];
  blockedActions: string[];
  guardrails: string[];
};

const FULL_APP_WIDGET_URI = "ui://tok-connect/full-app-console-v1.html";

const FULL_APP_WIDGET_HTML = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: light;
        --tok-orange: #ff6a1a;
        --tok-gold: #ffb000;
        --tok-ink: #111827;
        --tok-muted: #64748b;
        --tok-line: rgba(226, 232, 240, 0.95);
        --tok-bg: #fff7ed;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        color: var(--tok-ink);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background:
          radial-gradient(circle at 10% 0%, rgba(255, 106, 26, 0.18), transparent 22rem),
          radial-gradient(circle at 94% 4%, rgba(255, 176, 0, 0.16), transparent 24rem),
          linear-gradient(180deg, #fffaf4 0%, #f8fafc 48%, #fff 100%);
      }
      .topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        min-height: 74px;
        padding: 12px 22px;
        background: rgba(255, 255, 255, 0.94);
        border-bottom: 1px solid var(--tok-line);
        box-shadow: 0 16px 42px rgba(15, 23, 42, 0.08);
        backdrop-filter: blur(18px);
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }
      .brand img {
        width: 54px;
        height: 54px;
        object-fit: contain;
        filter: drop-shadow(0 10px 18px rgba(255, 106, 26, 0.24));
      }
      .brand small {
        display: block;
        color: var(--tok-orange);
        font-weight: 900;
        letter-spacing: .18em;
        text-transform: uppercase;
      }
      .brand strong {
        display: block;
        font-size: 18px;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        padding: 9px 13px;
        color: #065f46;
        background: #ecfdf5;
        border: 1px solid rgba(16, 185, 129, .18);
        font-weight: 900;
        font-size: 12px;
      }
      .dot {
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: #22c55e;
        box-shadow: 0 0 16px rgba(34, 197, 94, .42);
      }
      .shell {
        width: min(1180px, 100%);
        margin: 0 auto;
        padding: 28px 20px 34px;
      }
      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(280px, .9fr);
        gap: 18px;
        align-items: stretch;
        margin-bottom: 18px;
        border: 1px solid rgba(255, 106, 26, .24);
        border-radius: 30px;
        padding: 24px;
        background: linear-gradient(135deg, rgba(255,255,255,.98), rgba(255,247,237,.96));
        box-shadow: 0 22px 64px rgba(15, 23, 42, .10);
      }
      h1 {
        margin: 0 0 10px;
        font-family: Georgia, "Times New Roman", serif;
        font-size: clamp(34px, 5vw, 58px);
        line-height: 1.02;
      }
      p { margin: 0; color: var(--tok-muted); line-height: 1.45; }
      .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
      button {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 11px 15px;
        color: #fff;
        background: linear-gradient(135deg, #ff5a14, #ff8f00);
        box-shadow: 0 14px 30px rgba(255, 106, 26, .28);
        font: inherit;
        font-weight: 900;
        cursor: pointer;
      }
      button.secondary { color: var(--tok-ink); background: #fff; border: 1px solid var(--tok-line); box-shadow: none; }
      .metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      .metric { border: 1px solid var(--tok-line); border-radius: 20px; padding: 16px; background: #fff; box-shadow: 0 12px 30px rgba(15,23,42,.06); }
      .metric b { display: block; font-size: 28px; }
      .metric span { color: var(--tok-muted); font-size: 12px; font-weight: 800; }
      .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, .52fr); gap: 16px; }
      .card { border: 1px solid var(--tok-line); border-radius: 28px; padding: 18px; background: rgba(255,255,255,.96); box-shadow: 0 20px 60px rgba(15,23,42,.08); }
      .card h2 { margin: 0 0 12px; font-size: 22px; }
      .module-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .module { border: 1px solid rgba(255,106,26,.14); border-radius: 22px; padding: 15px; background: #fff; box-shadow: 0 14px 30px rgba(15,23,42,.06); }
      .module-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
      .icon { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 15px; color: #fff; background: linear-gradient(135deg, #ff5a14, #ffb000); font-weight: 950; }
      .tag { border-radius: 999px; padding: 7px 10px; color: #c2410c; background: #fff7ed; font-size: 11px; font-weight: 900; }
      .module strong { display: block; font-size: 17px; }
      .module small { display: block; color: var(--tok-muted); margin-top: 4px; }
      .step-list { display: grid; gap: 9px; }
      .step { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 10px; border: 1px solid var(--tok-line); border-radius: 16px; padding: 11px; background: #fff; }
      .step-index { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 12px; color: #fff; background: linear-gradient(135deg, #ff5a14, #ffb000); font-weight: 900; }
      .step strong { display: block; }
      .step span { color: var(--tok-muted); font-size: 12px; }
      .guardrail { margin-top: 8px; border-radius: 14px; padding: 10px; color: #7c2d12; border: 1px solid rgba(255,106,26,.18); background: #fff7ed; font-size: 13px; }
      pre { max-height: 220px; overflow: auto; white-space: pre-wrap; word-break: break-word; border-radius: 16px; margin: 10px 0 0; padding: 12px; color: #334155; background: #f8fafc; border: 1px solid var(--tok-line); font-size: 12px; }
      @media (max-width: 760px) { .hero, .grid { grid-template-columns: 1fr; } .module-grid { grid-template-columns: 1fr; } .topbar { padding: 10px 14px; } .brand p { display: none; } }
    </style>
  </head>
  <body>
    <nav class="topbar">
      <div class="brand">
        <img src="https://www.thetok.ch/logo.png" alt="TOK" />
        <p><small>TOK Connect</small><strong>Application complète dans ChatGPT</strong></p>
      </div>
      <span class="pill"><span class="dot"></span><span id="status">Console active</span></span>
    </nav>
    <main class="shell">
      <section class="hero">
        <div>
          <h1>ChatGPT pilote TOK en mode sécurisé</h1>
          <p id="summary">Demandez une réservation, une campagne, une action restaurateur, une lecture admin ou un parcours client. La console affiche les modules, les étapes et les blocages avant toute mutation réelle.</p>
          <div class="actions">
            <button id="ask-next" type="button">Prochaine action utile</button>
            <button id="fullscreen" class="secondary" type="button">Plein écran</button>
          </div>
        </div>
        <aside class="metrics">
          <div class="metric"><b id="module-count">0</b><span>modules TOK</span></div>
          <div class="metric"><b id="tool-count">0</b><span>outils MCP</span></div>
          <div class="metric"><b id="risk-level">safe</b><span>niveau de risque</span></div>
          <div class="metric"><b id="mutation">non</b><span>mutation autorisée</span></div>
        </aside>
      </section>
      <section class="grid">
        <article class="card">
          <h2>Modules et parcours</h2>
          <div id="main-content"></div>
        </article>
        <aside class="card">
          <h2>Contrôles</h2>
          <div id="steps" class="step-list"></div>
          <div class="guardrail">Les réservations, paiements, publications, remboursements, générations IA payantes et mutations admin restent bloqués jusqu'à confirmation humaine dans TOK.</div>
          <details>
            <summary>Journal technique</summary>
            <pre id="payload">{}</pre>
          </details>
        </aside>
      </section>
    </main>
    <script>
      const mainContent = document.getElementById("main-content");
      const stepsEl = document.getElementById("steps");
      const payloadEl = document.getElementById("payload");
      const moduleCountEl = document.getElementById("module-count");
      const toolCountEl = document.getElementById("tool-count");
      const riskLevelEl = document.getElementById("risk-level");
      const mutationEl = document.getElementById("mutation");
      const summaryEl = document.getElementById("summary");

      function escapeHtml(value) {
        return String(value || "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      }

      function compactId(value) {
        return String(value || "TOK").split("_").map((part) => part.slice(0, 2).toUpperCase()).join("").slice(0, 4) || "TOK";
      }

      function findStructured(output) {
        if (output && typeof output === "object") {
          if (output.structuredContent) return output.structuredContent;
          return output;
        }
        return {};
      }

      function renderModules(modules) {
        if (!Array.isArray(modules) || !modules.length) {
          return '<p>Aucun module sélectionné. Utilisez discover_tok_application ou plan_tok_application_route.</p>';
        }
        return '<div class="module-grid">' + modules.slice(0, 12).map((module) => (
          '<article class="module">' +
          '<div class="module-head"><span class="icon">' + escapeHtml(compactId(module.id)) + '</span><span class="tag">' + escapeHtml(module.actor || module.category || "TOK") + '</span></div>' +
          '<strong>' + escapeHtml(module.title || module.id) + '</strong>' +
          '<small>' + escapeHtml(module.route || "") + '</small>' +
          '</article>'
        )).join("") + '</div>';
      }

      function renderSteps(steps) {
        const safeSteps = Array.isArray(steps) && steps.length ? steps : [
          { title: "Découvrir les modules", detail: "ChatGPT attend une action TOK Connect.", status: "ready" },
          { title: "Préparer le parcours", detail: "Aucune mutation n'est exécutée depuis la console.", status: "guarded" },
        ];
        stepsEl.innerHTML = safeSteps.slice(0, 10).map((step, index) => (
          '<div class="step"><span class="step-index">' + (index + 1) + '</span><div><strong>' + escapeHtml(step.title) + '</strong><span>' + escapeHtml(step.detail || step.status || "") + '</span></div></div>'
        )).join("");
      }

      function render(output) {
        const structured = findStructured(output || (window.openai && window.openai.toolOutput));
        const modules = structured.modules || (structured.plan && structured.plan.modules) || (structured.console && structured.console.modules) || [];
        const steps = structured.steps || (structured.plan && structured.plan.steps) || (structured.confirmation_packet && structured.confirmation_packet.steps) || [];
        const tools = structured.available_tools || structured.tools || [];
        const risk = structured.risk || structured.risk_audit || {};
        const mutationAllowed = structured.mutation_allowed === true || risk.mutation_allowed === true;

        moduleCountEl.textContent = String(Array.isArray(modules) ? modules.length : 0);
        toolCountEl.textContent = String(Array.isArray(tools) ? tools.length : 0);
        riskLevelEl.textContent = String(risk.level || structured.risk_level || "safe");
        mutationEl.textContent = mutationAllowed ? "oui" : "non";
        summaryEl.textContent = structured.answer || structured.summary || "Application TOK disponible dans ChatGPT en lecture, simulation et préparation confirmable.";
        mainContent.innerHTML = renderModules(modules);
        renderSteps(steps);
        payloadEl.textContent = JSON.stringify(structured, null, 2);
      }

      document.getElementById("ask-next").addEventListener("click", () => {
        if (window.openai && typeof window.openai.sendFollowUpMessage === "function") {
          window.openai.sendFollowUpMessage({ prompt: "Indique la prochaine action utile dans TOK Connect et précise si elle est en lecture, preview ou bloquée jusqu'à confirmation.", scrollToBottom: true });
        }
      });

      document.getElementById("fullscreen").addEventListener("click", () => {
        if (window.openai && typeof window.openai.requestDisplayMode === "function") {
          window.openai.requestDisplayMode({ mode: "fullscreen" });
        }
      });

      render(window.openai && window.openai.toolOutput);
      window.addEventListener("openai:set_globals", (event) => {
        const globals = event.detail && event.detail.globals ? event.detail.globals : {};
        render(globals.toolOutput || (window.openai && window.openai.toolOutput));
      }, { passive: true });
    </script>
  </body>
</html>`;

const TOK_APP_MODULES: TokConnectAppModule[] = [
  {
    id: "home_discovery",
    title: "Accueil, recherche et découverte",
    actor: "client",
    category: "discovery",
    route: "/",
    entrypoints: ["Accueil", "Recherche", "Filtres", "Restaurants autour de moi"],
    keywords: ["accueil", "recherche", "decouverte", "restaurant", "autour", "ville", "cuisine"],
    requiredScopes: ["restaurants:read"],
    readModels: ["restaurants", "featured_restaurants", "sponsored_slots"],
    previewActions: ["chercher restaurants", "filtrer cuisine", "expliquer classement", "ouvrir fiche restaurant"],
    blockedActions: ["aucune mutation client directe"],
    guardrails: ["Les résultats publics peuvent être simulés sans OAuth, les données réelles nécessitent le scope restaurants:read."],
  },
  {
    id: "restaurant_profile",
    title: "Fiche restaurant",
    actor: "client",
    category: "discovery",
    route: "/restaurant/:id",
    entrypoints: ["Photo", "Menu", "Horaires", "Avis", "Bouton réserver", "Bouton commander"],
    keywords: ["fiche", "restaurant", "menu", "horaires", "avis", "photo"],
    requiredScopes: ["restaurants:read", "availability:read"],
    readModels: ["restaurants", "restaurant_media", "menus", "service_windows"],
    previewActions: ["résumer l'offre", "lire les horaires", "préparer réservation", "préparer panier"],
    blockedActions: ["réservation définitive", "commande définitive", "paiement"],
    guardrails: ["Les horaires et disponibilités doivent toujours venir du pilotage de service côté serveur."],
  },
  {
    id: "reservation",
    title: "Réservation classique",
    actor: "client",
    category: "reservation",
    route: "/restaurant/:id/reserver",
    entrypoints: ["Choix date", "Choix heure", "Nombre de convives", "Confirmation"],
    keywords: ["reservation", "reserver", "table", "convive", "creneau", "disponibilite"],
    requiredScopes: ["restaurants:read", "availability:read", "reservations:create"],
    readModels: ["reservation_slots", "restaurant_service_settings"],
    previewActions: ["lire disponibilités", "préparer récapitulatif", "générer paquet de confirmation"],
    blockedActions: ["reservation_blocked: création finale uniquement après confirmation client"],
    guardrails: ["Aucune réservation n'est créée sans confirmation humaine et idempotence serveur."],
  },
  {
    id: "zero_attente",
    title: "Zéro Attente",
    actor: "client",
    category: "commerce",
    route: "/zero-attente",
    entrypoints: ["Restaurants ouverts", "Créneau retrait", "Panier", "Paiement"],
    keywords: ["zero attente", "sans attente", "retrait", "commande rapide", "pret"],
    requiredScopes: ["restaurants:read", "availability:read"],
    readModels: ["restaurants", "service_windows", "orders"],
    previewActions: ["vérifier service", "préparer retrait", "préparer paiement si total positif"],
    blockedActions: ["payment_required", "commande définitive"],
    guardrails: ["Stripe ne doit être appelé que si le total recalculé serveur est strictement positif."],
  },
  {
    id: "chefs_table",
    title: "Table du Chef",
    actor: "client",
    category: "reservation",
    route: "/chefs-table",
    entrypoints: ["Drops", "Offre spéciale", "Convives", "Paiement"],
    keywords: ["table du chef", "chef", "drop", "menu special", "gastronomique"],
    requiredScopes: ["restaurants:read", "reservations:create"],
    readModels: ["chef_table_offers", "restaurants"],
    previewActions: ["lire drops", "préparer réservation premium", "calculer blocage paiement"],
    blockedActions: ["reservation_blocked", "payment_required"],
    guardrails: ["Une Table du Chef payante n'est définitive qu'après paiement valide et confirmation."],
  },
  {
    id: "orders_checkout",
    title: "Commande, panier et checkout",
    actor: "client",
    category: "commerce",
    route: "/panier",
    entrypoints: ["Menu", "Panier", "Coupons", "Miamz", "Stripe", "Confirmation"],
    keywords: ["commande", "panier", "checkout", "stripe", "payer", "livraison", "emporter"],
    requiredScopes: ["restaurants:read"],
    readModels: ["menus", "order_pricing", "miamz_balance"],
    previewActions: ["simuler panier", "expliquer total", "préparer confirmation"],
    blockedActions: ["payment_required", "commande définitive", "capture paiement"],
    guardrails: ["Le montant final, frais, réductions et Miamz sont toujours recalculés côté serveur."],
  },
  {
    id: "multi_restaurant",
    title: "Multi-resto",
    actor: "client",
    category: "commerce",
    route: "/multi-restaurant",
    entrypoints: ["Restaurants multiples", "Panier groupé", "Compatibilité horaires", "Checkout"],
    keywords: ["multi", "plusieurs restaurants", "groupe", "panier groupe"],
    requiredScopes: ["restaurants:read", "availability:read"],
    readModels: ["restaurants", "service_windows", "cart_groups"],
    previewActions: ["comparer restaurants", "vérifier horaires compatibles", "préparer panier multi-resto"],
    blockedActions: ["payment_required", "commande multi-resto définitive"],
    guardrails: ["Chaque restaurant garde son propre contrôle d'ouverture et de capacité."],
  },
  {
    id: "miamz_loyalty",
    title: "MIAMZ fidélité solidaire",
    actor: "client",
    category: "loyalty",
    route: "/miamz",
    entrypoints: ["Solde", "Historique", "Avantages", "Utilisation panier"],
    keywords: ["miamz", "fidelite", "points", "solde", "reduction"],
    requiredScopes: [],
    readModels: ["loyalty_balance", "loyalty_ledger"],
    previewActions: ["expliquer solde", "simuler avantage", "préparer utilisation"],
    blockedActions: ["débit de solde", "crédit de solde"],
    guardrails: ["Le ledger fidélité ne peut jamais être modifié par une preview MCP."],
  },
  {
    id: "tok_one",
    title: "TOK One abonnement client",
    actor: "client",
    category: "billing",
    route: "/tok-one",
    entrypoints: ["Avantages", "Abonnement", "Gestion Stripe"],
    keywords: ["tok one", "abonnement client", "premium", "subscription"],
    requiredScopes: [],
    readModels: ["subscription_status", "stripe_customer"],
    previewActions: ["expliquer avantages", "préparer checkout", "préparer portail client"],
    blockedActions: ["payment_required", "création abonnement", "annulation abonnement"],
    guardrails: ["Tout changement d'abonnement passe par les flux Stripe existants."],
  },
  {
    id: "client_account",
    title: "Compte client",
    actor: "client",
    category: "support",
    route: "/compte",
    entrypoints: ["Profil", "Réservations", "Commandes", "Notifications", "Support"],
    keywords: ["compte", "profil", "historique", "mes reservations", "mes commandes"],
    requiredScopes: [],
    readModels: ["profiles", "reservations", "orders", "notifications"],
    previewActions: ["résumer historique", "préparer demande support", "préparer annulation confirmable"],
    blockedActions: ["suppression compte", "annulation réelle", "remboursement"],
    guardrails: ["Les données personnelles doivent rester limitées au compte authentifié."],
  },
  {
    id: "restaurant_dashboard",
    title: "Dashboard restaurateur",
    actor: "restaurateur",
    category: "operations",
    route: "/dashboard",
    entrypoints: ["Vue d'ensemble", "Commandes", "Réservations", "Marketing", "Crédits"],
    keywords: ["dashboard", "restaurateur", "restaurant admin", "vue d'ensemble"],
    requiredScopes: ["restaurants:read", "analytics:read"],
    readModels: ["restaurants", "orders", "reservations", "campaigns", "credit_usage"],
    previewActions: ["résumer activité", "proposer prochaine action", "préparer checklist"],
    blockedActions: ["mutation paramètres", "publication", "paiement"],
    guardrails: ["Les actions restaurateur réelles exigent l'utilisateur restaurateur authentifié."],
  },
  {
    id: "service_pilotage",
    title: "Pilotage de service et disponibilités",
    actor: "restaurateur",
    category: "operations",
    route: "/dashboard/service",
    entrypoints: ["Horaires", "Capacité", "Créneaux", "Fermetures"],
    keywords: ["service", "horaires", "capacite", "creneaux", "fermeture"],
    requiredScopes: ["availability:read"],
    readModels: ["service_windows", "capacity_rules", "reservation_slots"],
    previewActions: ["auditer horaires", "préparer modification", "simuler impact capacité"],
    blockedActions: ["mise à jour horaires", "fermeture réelle"],
    guardrails: ["Les disponibilités client sont dérivées de ce module, pas d'une estimation libre."],
  },
  {
    id: "floorplan_ai",
    title: "Plan de salle IA",
    actor: "restaurateur",
    category: "ai",
    route: "/dashboard/plan-de-salle",
    entrypoints: ["Tables", "Zones", "Placement", "Optimisation"],
    keywords: ["plan de salle", "floorplan", "table", "placement", "salle"],
    requiredScopes: ["availability:read"],
    readModels: ["floorplans", "tables", "reservations"],
    previewActions: ["simuler placement", "détecter conflit", "préparer optimisation"],
    blockedActions: ["modification plan", "assignation définitive"],
    guardrails: ["Un placement final doit rester validé dans le dashboard restaurateur."],
  },
  {
    id: "menus_catalogue",
    title: "Menus, produits et catalogue",
    actor: "restaurateur",
    category: "commerce",
    route: "/dashboard/menu",
    entrypoints: ["Produits", "Prix", "Photos", "Disponibilité"],
    keywords: ["menu", "produit", "prix", "catalogue", "plat"],
    requiredScopes: ["restaurants:read"],
    readModels: ["menus", "menu_items", "media"],
    previewActions: ["analyser menu", "préparer description", "proposer SEO", "préparer tags"],
    blockedActions: ["changement prix", "publication produit"],
    guardrails: ["Les prix et stocks ne sont jamais modifiés par une preview."],
  },
  {
    id: "orders_management",
    title: "Gestion commandes restaurant",
    actor: "restaurateur",
    category: "operations",
    route: "/dashboard/commandes",
    entrypoints: ["Commandes reçues", "Statuts", "Préparation", "Dispatch"],
    keywords: ["commandes", "statut commande", "preparation", "dispatch"],
    requiredScopes: [],
    readModels: ["orders", "order_events"],
    previewActions: ["résumer files d'attente", "préparer réponse client", "proposer priorisation"],
    blockedActions: ["changement statut réel", "annulation", "remboursement"],
    guardrails: ["Les changements de statut doivent rester auditables et idempotents."],
  },
  {
    id: "reservation_management",
    title: "Gestion réservations restaurant",
    actor: "restaurateur",
    category: "reservation",
    route: "/dashboard/reservations",
    entrypoints: ["Liste", "Confirmation", "Annulation", "No-show"],
    keywords: ["gestion reservation", "no show", "annuler reservation", "liste reservations"],
    requiredScopes: ["availability:read", "reservations:create"],
    readModels: ["reservations", "reservation_events"],
    previewActions: ["résumer réservations", "préparer message client", "préparer annulation confirmable"],
    blockedActions: ["annulation réelle", "modification réelle"],
    guardrails: ["Toute annulation ou modification doit identifier l'acteur et conserver une trace."],
  },
  {
    id: "credits_wallet",
    title: "Crédits TOK restaurateur",
    actor: "restaurateur",
    category: "billing",
    route: "/dashboard/credits",
    entrypoints: ["Solde", "Packs", "Historique", "Recharge"],
    keywords: ["credits", "recharge", "pack credits", "solde credits"],
    requiredScopes: ["credits:read"],
    readModels: ["restaurant_credit_wallet", "credit_ledger"],
    previewActions: ["lire solde", "estimer coût", "préparer recharge"],
    blockedActions: ["débit crédit", "achat pack", "paiement"],
    guardrails: ["Les outils IA et campagnes payantes doivent vérifier le solde avant exécution."],
  },
  {
    id: "studio_marketing",
    title: "Studio Marketing",
    actor: "restaurateur",
    category: "ai",
    route: "/dashboard/photos",
    entrypoints: ["Brief", "Visuels", "Campagnes", "Preview"],
    keywords: ["studio", "marketing", "visuel", "affiche", "flyer", "banniere", "campagne image"],
    requiredScopes: ["credits:read", "campaigns:preview"],
    readModels: ["campaigns", "credit_usage", "media_assets"],
    previewActions: ["préparer brief", "estimer crédits", "préparer preview", "proposer formats"],
    blockedActions: ["génération IA payante", "publication", "sponsorisation"],
    guardrails: ["Aucune génération ou publication payante sans validation restaurateur et solde suffisant."],
  },
  {
    id: "photopro",
    title: "PhotoPro",
    actor: "restaurateur",
    category: "ai",
    route: "/dashboard/photos",
    entrypoints: ["Upload", "Retouche", "Style food photo", "Export"],
    keywords: ["photopro", "photo", "retouche", "image", "food photographie", "produit"],
    requiredScopes: ["credits:read"],
    readModels: ["media_assets", "credit_usage"],
    previewActions: ["analyser intention image", "préparer style", "estimer crédit", "préparer consignes"],
    blockedActions: ["retouche IA payante", "publication média"],
    guardrails: ["La photo source et l'export final restent sous validation du restaurateur."],
  },
  {
    id: "campaigns_sponsored",
    title: "Campagnes sponsorisées",
    actor: "restaurateur",
    category: "marketing",
    route: "/dashboard/campagnes",
    entrypoints: ["Objectif", "Audience", "Budget", "Preview", "Validation"],
    keywords: ["campagne", "sponsorise", "budget", "audience", "ads", "mise en avant"],
    requiredScopes: ["credits:read", "campaigns:preview", "analytics:read"],
    readModels: ["campaigns", "analytics", "credit_usage"],
    previewActions: ["estimer coût", "proposer audience", "générer plan", "préparer validation"],
    blockedActions: ["publication_blocked", "débit crédits", "lancement campagne"],
    guardrails: ["Les campagnes se paient en crédits TOK et restent bloquées avant validation humaine."],
  },
  {
    id: "flash_sales",
    title: "Ventes flash",
    actor: "restaurateur",
    category: "marketing",
    route: "/dashboard/ventes-flash",
    entrypoints: ["Offre", "Stock", "Durée", "Preview"],
    keywords: ["vente flash", "flash", "promo", "stock", "offre limitee"],
    requiredScopes: ["campaigns:preview", "credits:read"],
    readModels: ["flash_sales", "inventory", "campaigns"],
    previewActions: ["simuler offre", "vérifier stock", "préparer preview"],
    blockedActions: ["publication_blocked", "débit crédits", "activation offre"],
    guardrails: ["Le stock, la période et le prix sont contrôlés côté serveur avant publication."],
  },
  {
    id: "news_feed",
    title: "Actualités et fil restaurant",
    actor: "restaurateur",
    category: "marketing",
    route: "/dashboard/actualites",
    entrypoints: ["Post", "Image", "Tags", "Sponsorisation"],
    keywords: ["actualite", "post", "news", "fil", "hashtags", "metadata", "seo"],
    requiredScopes: ["campaigns:preview"],
    readModels: ["posts", "media_assets", "campaigns"],
    previewActions: ["générer légende", "proposer tags", "préparer sponsorisation"],
    blockedActions: ["publication_blocked", "sponsorisation"],
    guardrails: ["Les droits d'image, textes et modération restent contrôlés avant publication."],
  },
  {
    id: "crm_clients",
    title: "CRM clients",
    actor: "restaurateur",
    category: "marketing",
    route: "/dashboard/crm-clients",
    entrypoints: ["Segments", "Relances", "Historique", "Consentement"],
    keywords: ["crm", "client", "segmentation", "relance", "newsletter"],
    requiredScopes: ["analytics:read"],
    readModels: ["customer_segments", "consents", "analytics"],
    previewActions: ["lire segment", "préparer relance", "vérifier consentement"],
    blockedActions: ["envoi message", "export données personnelles"],
    guardrails: ["Aucun message client n'est envoyé sans consentement et validation restaurateur."],
  },
  {
    id: "analytics",
    title: "Statistiques et performance",
    actor: "restaurateur",
    category: "operations",
    route: "/dashboard/statistiques",
    entrypoints: ["Réservations", "Commandes", "Campagnes", "ROI"],
    keywords: ["analytics", "statistiques", "performance", "roi", "rapport"],
    requiredScopes: ["analytics:read"],
    readModels: ["analytics", "campaign_performance", "reservation_stats"],
    previewActions: ["résumer performance", "détecter signaux", "proposer actions"],
    blockedActions: ["aucune mutation analytique"],
    guardrails: ["Les recommandations ne doivent pas masquer les limites des données disponibles."],
  },
  {
    id: "accounting_invoices",
    title: "Facturation et comptabilité",
    actor: "restaurateur",
    category: "billing",
    route: "/dashboard/facturation",
    entrypoints: ["Factures", "Commissions", "Abonnement", "Export"],
    keywords: ["facture", "facturation", "comptabilite", "commission", "export"],
    requiredScopes: ["analytics:read"],
    readModels: ["invoices", "commission_lines", "subscriptions"],
    previewActions: ["résumer facture", "expliquer commission", "préparer export"],
    blockedActions: ["remboursement", "paiement", "modification facture"],
    guardrails: ["Les remboursements et paiements restent dans les flux Stripe et admin auditables."],
  },
  {
    id: "subscription_billing",
    title: "Abonnement restaurateur",
    actor: "restaurateur",
    category: "billing",
    route: "/dashboard/abonnement",
    entrypoints: ["Plan", "Upgrade", "Crédits", "Stripe"],
    keywords: ["abonnement restaurant", "upgrade", "plan", "premium", "elite"],
    requiredScopes: ["credits:read"],
    readModels: ["restaurant_subscriptions", "credit_wallet"],
    previewActions: ["comparer plans", "préparer upgrade", "expliquer crédits"],
    blockedActions: ["payment_required", "changement abonnement"],
    guardrails: ["Tout upgrade/downgrade doit passer par le flux d'abonnement sécurisé."],
  },
  {
    id: "commercial_workspace",
    title: "Espace commercial",
    actor: "commercial",
    category: "sales",
    route: "/commercial",
    entrypoints: ["Prospects", "Suivi", "Signatures", "Commissions"],
    keywords: ["commercial", "prospection", "signature", "commission", "relance"],
    requiredScopes: ["restaurants:read", "analytics:read"],
    readModels: ["commercial_leads", "restaurant_applications", "commission_lines"],
    previewActions: ["préparer relance", "résumer prospect", "estimer commission"],
    blockedActions: ["validation contrat", "paiement commission"],
    guardrails: ["Les commissions doivent rester traçables et liées aux restaurants réellement signés."],
  },
  {
    id: "courier_portal",
    title: "Portail livreur",
    actor: "courier",
    category: "operations",
    route: "/courier",
    entrypoints: ["Courses", "Statuts", "Preuves", "Support"],
    keywords: ["livreur", "courier", "course", "livraison", "preuve"],
    requiredScopes: [],
    readModels: ["deliveries", "delivery_events"],
    previewActions: ["résumer course", "préparer preuve", "préparer support"],
    blockedActions: ["changement statut réel", "paiement livreur"],
    guardrails: ["Les statuts de livraison doivent rester horodatés et auditables."],
  },
  {
    id: "admin_supervision",
    title: "Supervision admin",
    actor: "admin",
    category: "admin",
    route: "/admin",
    entrypoints: ["Utilisateurs", "Restaurants", "Commandes", "Paiements", "Logs"],
    keywords: ["admin", "supervision", "audit", "remboursement", "comptabilite", "logs"],
    requiredScopes: ["analytics:read"],
    readModels: ["audit_logs", "orders", "reservations", "payments", "feature_flags"],
    previewActions: ["préparer audit", "résumer incident", "proposer contrôle"],
    blockedActions: ["remboursement", "suppression", "modification droits", "mutation admin"],
    guardrails: ["Les mutations admin restent réservées aux comptes autorisés et journalisées."],
  },
  {
    id: "support",
    title: "Support et litiges",
    actor: "support",
    category: "support",
    route: "/support",
    entrypoints: ["Ticket", "Commande", "Réservation", "Restaurant", "Client"],
    keywords: ["support", "litige", "ticket", "probleme", "non servi", "non reçu"],
    requiredScopes: ["analytics:read"],
    readModels: ["support_tickets", "orders", "reservations", "audit_logs"],
    previewActions: ["résumer dossier", "préparer réponse", "lister preuves"],
    blockedActions: ["remboursement", "compensation", "annulation réelle"],
    guardrails: ["Les décisions financières exigent une validation humaine et une preuve suffisante."],
  },
];

const FULL_APP_MCP_TOOLS: TokConnectMcpTool[] = [
  {
    name: "discover_tok_application",
    title: "Découvrir toute l'application TOK",
    description: "List every TOK application surface that ChatGPT can use through TOK Connect, including client, restaurant, admin, commercial, courier and support modules.",
    requiredScopes: [],
    inputSchema: {
      type: "object",
      properties: {
        actor: { type: "string", enum: ["client", "restaurateur", "admin", "commercial", "courier", "support", "chatgpt"] },
        query: { type: "string" },
        category: { type: "string" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "open_tok_application_console",
    title: "Ouvrir la console TOK complète",
    description: "Open a ChatGPT Apps widget that displays TOK modules, tools, route plans and confirmation blockers.",
    requiredScopes: [],
    inputSchema: {
      type: "object",
      properties: {
        focus: { type: "string", enum: ["overview", "client", "restaurateur", "admin", "commercial", "support"], default: "overview" },
      },
      additionalProperties: false,
    },
    outputSchema: { type: "object", properties: { console: { type: "object" }, modules: { type: "array" }, available_tools: { type: "array" } } },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    _meta: {
      ui: { resourceUri: FULL_APP_WIDGET_URI, visibility: ["model", "app"] },
      "openai/outputTemplate": FULL_APP_WIDGET_URI,
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "Ouverture de TOK Connect...",
      "openai/toolInvocation/invoked": "Console TOK ouverte",
    },
  },
  {
    name: "plan_tok_application_route",
    title: "Planifier un parcours TOK",
    description: "Turn a natural-language request into a safe TOK application route plan before any real booking, payment, publication or admin mutation.",
    requiredScopes: [],
    inputSchema: {
      type: "object",
      required: ["request"],
      properties: {
        request: { type: "string" },
        actor: { type: "string", enum: ["client", "restaurateur", "admin", "commercial", "courier", "support", "chatgpt"], default: "chatgpt" },
        modules: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "preview_tok_client_journey",
    title: "Prévisualiser parcours client TOK",
    description: "Prepare a client journey for discovery, reservation, Zero Attente, Table du Chef, order checkout, Miamz or TOK One without executing the final action.",
    requiredScopes: [],
    inputSchema: { type: "object", properties: { request: { type: "string" }, restaurant_id: { type: "string" }, date: { type: "string" }, party_size: { type: "integer" } }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "preview_tok_restaurant_journey",
    title: "Prévisualiser parcours restaurateur TOK",
    description: "Prepare a restaurant dashboard journey for service, menus, orders, reservations, credits, marketing, PhotoPro, campaigns, CRM, analytics or billing.",
    requiredScopes: [],
    inputSchema: { type: "object", properties: { request: { type: "string" }, restaurant_id: { type: "string" }, objective: { type: "string" } }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "preview_tok_admin_journey",
    title: "Prévisualiser parcours admin/support TOK",
    description: "Prepare an admin or support investigation path with audit controls and no mutation.",
    requiredScopes: [],
    inputSchema: { type: "object", properties: { request: { type: "string" }, actor: { type: "string", enum: ["admin", "support"], default: "admin" }, target_id: { type: "string" } }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "read_tok_restaurant_snapshot",
    title: "Lire snapshot restaurant TOK",
    description: "Read restaurant discovery data for ChatGPT recommendations; sandbox data is returned without OAuth.",
    requiredScopes: ["restaurants:read"],
    inputSchema: {
      type: "object",
      properties: {
        restaurant_id: { type: "string", format: "uuid" },
        city: { type: "string" },
        query: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 25 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "read_tok_availability_snapshot",
    title: "Lire disponibilités TOK",
    description: "Read reservation slot availability for a restaurant; sandbox data is returned without OAuth.",
    requiredScopes: ["availability:read"],
    inputSchema: {
      type: "object",
      required: ["restaurant_id", "date"],
      properties: {
        restaurant_id: { type: "string", format: "uuid" },
        date: { type: "string", format: "date" },
        party_size: { type: "integer", minimum: 1, maximum: 20 },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "prepare_tok_human_confirmation_packet",
    title: "Préparer paquet de confirmation TOK",
    description: "Prepare the exact confirmation packet that a user must approve before booking, paying, publishing, debiting credits or changing admin data.",
    requiredScopes: [],
    inputSchema: {
      type: "object",
      required: ["action_type", "summary"],
      properties: {
        action_type: { type: "string", enum: ["reservation", "order", "payment", "campaign", "image_generation", "admin_change", "refund", "support_resolution", "other"] },
        summary: { type: "string" },
        restaurant_id: { type: "string" },
        amount_chf: { type: "number" },
        credit_cost: { type: "integer" },
        payload: { type: "object" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "audit_tok_action_risk",
    title: "Auditer le risque d'une action TOK",
    description: "Classify a requested TOK action as read, preview, payment, publication, reservation, credit debit or admin mutation and explain the required blockers.",
    requiredScopes: [],
    inputSchema: { type: "object", required: ["request"], properties: { request: { type: "string" }, actor: { type: "string" } }, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
];

const FULL_APP_RESOURCES = [
  {
    uri: FULL_APP_WIDGET_URI,
    name: "TOK full application console",
    title: "TOK Connect Full App",
    description: "ChatGPT Apps widget for navigating TOK modules and safe action blockers.",
    mimeType: "text/html;profile=mcp-app",
    _meta: widgetMeta("Console visuelle de toute l'application TOK utilisable depuis ChatGPT."),
  },
  { uri: "tok://full-app/modules", name: "TOK app modules", description: "Complete TOK application module catalog.", mimeType: "application/json" },
  { uri: "tok://full-app/routes", name: "TOK app routes", description: "Routes and entrypoints exposed through TOK Connect.", mimeType: "application/json" },
  { uri: "tok://full-app/guardrails", name: "TOK app guardrails", description: "Human-confirmation and mutation guardrails.", mimeType: "application/json" },
];

const FULL_APP_PROMPTS = [
  {
    name: "operate_tok_from_chatgpt",
    description: "Use TOK Connect to plan the safest route through the TOK application before taking any real action.",
    arguments: [{ name: "request", required: true }, { name: "actor", required: false }],
  },
  {
    name: "prepare_restaurant_workspace",
    description: "Prepare a restaurant dashboard task in TOK with the required confirmation and credit checks.",
    arguments: [{ name: "restaurant_id", required: true }, { name: "objective", required: true }],
  },
  {
    name: "prepare_client_booking",
    description: "Prepare a client booking or order path with availability, pricing and confirmation blockers.",
    arguments: [{ name: "restaurant_id", required: false }, { name: "party_size", required: false }, { name: "date", required: false }],
  },
  {
    name: "audit_tok_action",
    description: "Audit whether a requested TOK action is read-only, preview-only, payment-related or mutation-related.",
    arguments: [{ name: "request", required: true }],
  },
];

function widgetMeta(description: string) {
  return {
    ui: {
      prefersBorder: true,
      csp: {
        connectDomains: [],
        resourceDomains: ["https://www.thetok.ch", "https://cloud-rebuild-recovered.vercel.app"],
      },
    },
    "openai/widgetDescription": description,
    "openai/widgetPrefersBorder": true,
    "openai/widgetCSP": {
      connect_domains: [],
      resource_domains: ["https://www.thetok.ch", "https://cloud-rebuild-recovered.vercel.app"],
    },
  };
}

function rpcResult(id: JsonRpcRequest["id"], result: Record<string, unknown>) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function hasBearerToken(req: Request) {
  return (req.headers.get("Authorization") || "").startsWith("Bearer ");
}

async function authorizeFullAppMcp(req: Request, requiredScopes: string[] = []) {
  const context = await authenticateTokConnectToken(req, requiredScopes);
  await assertTokConnectFeatureEnabled(context.adminClient, "tok-connect");
  await assertTokConnectFeatureEnabled(context.adminClient, "tok-connect-mcp");
  const limiter = createRateLimiter(context.adminClient, "tok-connect-full-app-mcp");
  await limiter.consume(`partner:${context.partnerId}`, { maxRequests: Math.min(context.partnerQuotaPerMinute || 300, 600), windowSeconds: 60 });
  await limiter.consume(`client:${context.clientUuid}`, { maxRequests: Math.min(context.clientQuotaPerMinute || 240, 600), windowSeconds: 60 });
  return context;
}

function toolDefinition(tool: TokConnectMcpTool) {
  const securitySchemes = [{ type: "noauth" }, { type: "oauth2", scopes: tool.requiredScopes }];
  const toolMeta = tool._meta || {};
  const toolUiMeta = toolMeta.ui && typeof toolMeta.ui === "object" && !Array.isArray(toolMeta.ui)
    ? toolMeta.ui as Record<string, unknown>
    : {};

  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
    securitySchemes,
    ...(tool.annotations ? { annotations: tool.annotations } : {}),
    _meta: {
      securitySchemes,
      ui: { resourceUri: FULL_APP_WIDGET_URI, visibility: ["model", "app"], ...toolUiMeta },
      "openai/outputTemplate": FULL_APP_WIDGET_URI,
      "openai/widgetAccessible": true,
      ...toolMeta,
    },
  };
}

function normalizeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toActor(value: unknown): TokConnectActor {
  const normalized = normalizeText(value);
  if (["client", "restaurateur", "admin", "commercial", "courier", "support", "chatgpt"].includes(normalized)) {
    return normalized as TokConnectActor;
  }
  return "chatgpt";
}

function mapModule(module: TokConnectAppModule) {
  return {
    id: module.id,
    title: module.title,
    actor: module.actor,
    category: module.category,
    route: module.route,
    entrypoints: module.entrypoints,
    required_scopes: module.requiredScopes,
    read_models: module.readModels,
    preview_actions: module.previewActions,
    blocked_actions: module.blockedActions,
    guardrails: module.guardrails,
    mutation_allowed: false,
    requires_human_confirmation: module.blockedActions.length > 0,
  };
}

function selectModules(args: Record<string, unknown> = {}) {
  const actor = toActor(args.actor);
  const query = [args.request, args.query, args.objective, args.category, args.action_type].map(normalizeText).join(" ");
  const requestedIds = Array.isArray(args.modules)
    ? args.modules.map((id) => normalizeText(id).replace(/[^a-z0-9_]/g, "_"))
    : [];

  if (requestedIds.length) {
    const explicit = TOK_APP_MODULES.filter((module) => requestedIds.includes(module.id));
    if (explicit.length) return explicit;
  }

  const ranked = TOK_APP_MODULES
    .map((module) => {
      const actorScore = actor === "chatgpt" || module.actor === actor ? 2 : 0;
      const categoryScore = query.includes(module.category) ? 2 : 0;
      const keywordScore = module.keywords.reduce((score, keyword) => score + (query.includes(normalizeText(keyword)) ? 5 : 0), 0);
      const titleScore = query.includes(normalizeText(module.title)) ? 4 : 0;
      return { module, score: actorScore + categoryScore + keywordScore + titleScore };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.module);

  if (ranked.length) return ranked.slice(0, 8);
  if (actor !== "chatgpt") return TOK_APP_MODULES.filter((module) => module.actor === actor).slice(0, 10);
  return TOK_APP_MODULES;
}

function collectGuardrails(modules: TokConnectAppModule[]) {
  return Array.from(new Set([
    "Aucune réservation, commande, paiement, publication, génération IA payante, débit de crédits, remboursement ou mutation admin n'est exécuté directement par cette console MCP.",
    "Les actions réelles doivent passer par les Edge Functions TOK existantes, l'authentification, les droits restaurant, la RLS, l'idempotence et une confirmation humaine.",
    "Sans OAuth TOK Connect, ChatGPT reçoit uniquement des données sandbox ou des plans de parcours.",
    ...modules.flatMap((module) => module.guardrails),
  ])).slice(0, 16);
}

function buildRouteSteps(request: string, actor: TokConnectActor, modules: TokConnectAppModule[]) {
  const steps: Array<Record<string, unknown>> = [
    { status: "done", title: "Comprendre la demande", detail: `Intention: ${request || "demande TOK"}. Acteur: ${actor}.` },
    { status: "done", title: "Sélectionner les modules", detail: modules.map((module) => module.title).join(" → ") || "Catalogue complet" },
    { status: "safe_preview", title: "Construire le parcours", detail: "ChatGPT prépare une route, une lecture ou une preview sans mutation." },
  ];

  modules.slice(0, 8).forEach((module) => {
    steps.push({
      status: "preview",
      title: `Ouvrir ${module.title}`,
      detail: `${module.route} · ${module.previewActions.slice(0, 3).join(", ")}`,
      module_id: module.id,
    });
  });

  if (modules.some((module) => module.requiredScopes.includes("credits:read"))) {
    steps.push({ status: "blocked_until_confirmed", title: "Vérifier crédits TOK", detail: "Les outils IA et campagnes payantes restent bloqués si le solde restaurateur est insuffisant." });
  }
  if (modules.some((module) => module.blockedActions.some((action) => normalizeText(action).includes("payment") || normalizeText(action).includes("paiement")))) {
    steps.push({ status: "blocked_until_confirmed", title: "Contrôler paiement", detail: "Stripe ne doit être appelé que par le flux serveur autorisé et seulement si le total est positif." });
  }
  if (modules.some((module) => module.category === "reservation")) {
    steps.push({ status: "blocked_until_confirmed", title: "Confirmer réservation", detail: "La réservation finale exige disponibilité temps réel, confirmation client et idempotence." });
  }
  if (modules.some((module) => module.category === "admin" || module.category === "support")) {
    steps.push({ status: "guarded", title: "Journaliser l'action", detail: "Toute action admin/support doit être traçable et associée à un compte autorisé." });
  }

  steps.push({ status: "waiting_for_user", title: "Demander confirmation humaine", detail: "La console s'arrête avant toute action réelle." });
  return steps;
}

function availableToolSummaries() {
  return FULL_APP_MCP_TOOLS.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    required_scopes: tool.requiredScopes,
  }));
}

function makeStructuredResponse(input: {
  answer: string;
  modules?: TokConnectAppModule[];
  steps?: Array<Record<string, unknown>>;
  extra?: Record<string, unknown>;
}) {
  const modules = input.modules || [];
  return {
    structuredContent: {
      answer: input.answer,
      modules: modules.map(mapModule),
      steps: input.steps || [],
      guardrails: collectGuardrails(modules),
      available_tools: availableToolSummaries(),
      mutation_allowed: false,
      requires_human_confirmation: true,
      ...input.extra,
    },
    content: [{ type: "text", text: input.answer }],
    _meta: { ui: { resourceUri: FULL_APP_WIDGET_URI }, "openai/outputTemplate": FULL_APP_WIDGET_URI },
  };
}

function buildDiscovery(args: Record<string, unknown>) {
  const modules = selectModules(args);
  const actor = toActor(args.actor);
  return makeStructuredResponse({
    answer: `TOK Connect expose ${modules.length} module(s) pour ${actor}. ChatGPT peut lire, planifier, simuler et préparer des confirmations, mais les mutations restent bloquées.`,
    modules,
    steps: buildRouteSteps("Découverte de l'application TOK", actor, modules.slice(0, 8)),
    extra: { total_module_count: TOK_APP_MODULES.length },
  });
}

function buildConsole(args: Record<string, unknown>) {
  const focus = typeof args.focus === "string" ? args.focus : "overview";
  const actor = focus === "overview" ? "chatgpt" : toActor(focus);
  const modules = actor === "chatgpt" ? TOK_APP_MODULES : TOK_APP_MODULES.filter((module) => module.actor === actor);
  return makeStructuredResponse({
    answer: `Console TOK Connect ouverte: ${modules.length} module(s) visibles.`,
    modules,
    steps: buildRouteSteps("Console application complète", actor, modules.slice(0, 8)),
    extra: { console: { focus, opened_at: new Date().toISOString(), widget_uri: FULL_APP_WIDGET_URI } },
  });
}

function buildPlan(args: Record<string, unknown>) {
  const request = typeof args.request === "string" && args.request.trim() ? args.request.trim() : "Parcours TOK";
  const actor = toActor(args.actor);
  const modules = selectModules({ ...args, request });
  const steps = buildRouteSteps(request, actor, modules);
  return makeStructuredResponse({
    answer: `Parcours TOK préparé pour: ${request}. Modules: ${modules.map((module) => module.title).join(", ")}.`,
    modules,
    steps,
    extra: { plan: { request, actor, modules: modules.map(mapModule), steps, mutation_allowed: false } },
  });
}

function buildJourney(args: Record<string, unknown>, actor: TokConnectActor, fallbackRequest: string) {
  const request = typeof args.request === "string" && args.request.trim() ? args.request.trim() : fallbackRequest;
  const modules = selectModules({ ...args, request, actor });
  const steps = buildRouteSteps(request, actor, modules);
  return makeStructuredResponse({
    answer: `Preview ${actor} prête: ${request}. Aucune action réelle n'a été exécutée.`,
    modules,
    steps,
    extra: {
      preview: {
        actor,
        request,
        restaurant_id: args.restaurant_id || null,
        date: args.date || null,
        party_size: args.party_size || null,
        requires_human_confirmation: true,
      },
    },
  });
}

function sandboxRestaurants(city: unknown) {
  return [
    { id: "00000000-0000-4000-8000-000000000101", name: "TOK Sandbox Brasserie", city: city || "Genève", cuisine_type: "Bistronomie", rating: 4.8, supports_reservation: true, is_active: true },
    { id: "00000000-0000-4000-8000-000000000102", name: "TOK Demo Sushi", city: city || "Genève", cuisine_type: "Japonais", rating: 4.7, supports_reservation: true, is_active: true },
    { id: "00000000-0000-4000-8000-000000000103", name: "TOK Pizza Lab", city: city || "Genève", cuisine_type: "Italien", rating: 4.6, supports_reservation: false, is_active: true },
  ];
}

async function readRestaurantSnapshot(context: TokConnectTokenContext | null, args: Record<string, unknown>) {
  const restaurantId = typeof args.restaurant_id === "string" ? args.restaurant_id : "";
  const limit = Math.max(1, Math.min(Number(args.limit || 10), 25));

  if (!context || context.environment === "sandbox") {
    return makeStructuredResponse({
      answer: "Snapshot restaurant sandbox chargé. OAuth TOK Connect est requis pour lire les données réelles.",
      modules: selectModules({ actor: "client", request: "restaurant profile discovery" }),
      steps: buildRouteSteps("Lire snapshot restaurant", "client", selectModules({ actor: "client", request: "restaurant profile discovery" })),
      extra: { restaurants: sandboxRestaurants(args.city).slice(0, limit), sandbox: true },
    });
  }

  if (restaurantId) {
    await assertTokConnectRestaurantGrant(context, restaurantId, "restaurants:read", { requireMcp: true });
  }

  let query = context.adminClient
    .from("restaurants")
    .select("id, name, city, cuisine_type, rating, supports_reservation, is_active")
    .eq("is_active", true)
    .limit(limit);

  if (restaurantId) query = query.eq("id", restaurantId);
  if (typeof args.city === "string" && args.city.trim()) query = query.ilike("city", `%${args.city.trim()}%`);
  if (typeof args.query === "string" && args.query.trim()) query = query.ilike("name", `%${args.query.trim()}%`);

  const { data, error } = await query.order("rating", { ascending: false });
  if (error) throw new HttpError(500, error.message);

  return makeStructuredResponse({
    answer: `Snapshot restaurant réel chargé (${(data || []).length} résultat(s)).`,
    modules: selectModules({ actor: "client", request: "restaurant profile discovery" }),
    steps: buildRouteSteps("Lire snapshot restaurant", "client", selectModules({ actor: "client", request: "restaurant profile discovery" })),
    extra: { restaurants: data || [], sandbox: false },
  });
}

async function readAvailabilitySnapshot(context: TokConnectTokenContext | null, args: Record<string, unknown>) {
  const restaurantId = typeof args.restaurant_id === "string" ? args.restaurant_id : "";
  const date = typeof args.date === "string" ? args.date : new Date().toISOString().slice(0, 10);

  if (!context || context.environment === "sandbox") {
    return makeStructuredResponse({
      answer: "Disponibilités sandbox chargées. OAuth TOK Connect est requis pour lire les vrais créneaux.",
      modules: selectModules({ actor: "client", request: "reservation availability" }),
      steps: buildRouteSteps("Lire disponibilités", "client", selectModules({ actor: "client", request: "reservation availability" })),
      extra: {
        slots: ["12:00", "12:30", "13:00", "19:00", "19:30", "20:00"].map((time) => ({ time, available: true, restaurant_id: restaurantId || "sandbox", date })),
        sandbox: true,
      },
    });
  }

  await assertTokConnectRestaurantGrant(context, restaurantId, "availability:read", {
    requireMcp: true,
    partySize: Number(args.party_size || 0) || null,
  });
  const { data, error } = await context.adminClient.rpc("get_restaurant_reservation_slot_availability", {
    p_restaurant_id: restaurantId,
    p_date: date,
  });
  if (error) throw new HttpError(500, error.message);

  return makeStructuredResponse({
    answer: `Disponibilités réelles chargées pour ${date}.`,
    modules: selectModules({ actor: "client", request: "reservation availability" }),
    steps: buildRouteSteps("Lire disponibilités", "client", selectModules({ actor: "client", request: "reservation availability" })),
    extra: { slots: data || [], sandbox: false },
  });
}

function riskForRequest(request: string) {
  const normalized = normalizeText(request);
  const reasons: string[] = [];
  let level: "safe" | "medium" | "high" = "safe";

  const highMarkers = ["payer", "paiement", "stripe", "rembour", "supprimer", "admin", "publier", "publication", "debit", "credit", "capture"];
  const mediumMarkers = ["reservation", "commande", "annuler", "modifier", "campagne", "retouche", "generation", "email", "message"];

  for (const marker of highMarkers) {
    if (normalized.includes(marker)) {
      level = "high";
      reasons.push(`Action sensible détectée: ${marker}`);
    }
  }
  if (level !== "high") {
    for (const marker of mediumMarkers) {
      if (normalized.includes(marker)) {
        level = "medium";
        reasons.push(`Action à confirmer détectée: ${marker}`);
      }
    }
  }

  if (!reasons.length) reasons.push("Lecture, recherche ou preview sans mutation détectée.");

  return {
    level,
    reasons,
    mutation_allowed: false,
    requires_human_confirmation: level !== "safe",
    blockers: level === "safe"
      ? ["lecture seule ou preview"]
      : ["confirmation humaine", "authentification TOK", "droits restaurant/admin", "idempotence serveur", "audit log"],
  };
}

function buildConfirmationPacket(args: Record<string, unknown>) {
  const actionType = String(args.action_type || "other");
  const summary = String(args.summary || "Action TOK à confirmer");
  const modules = selectModules({ request: `${actionType} ${summary}`, actor: "chatgpt" });
  const risk = riskForRequest(`${actionType} ${summary}`);
  const steps = [
    { status: "blocked_until_confirmed", title: "Présenter le récapitulatif", detail: summary },
    { status: "blocked_until_confirmed", title: "Vérifier les droits", detail: "OAuth, restaurant grant, RLS et rôle utilisateur requis avant action réelle." },
    { status: "blocked_until_confirmed", title: "Confirmer explicitement", detail: "L'utilisateur doit valider dans TOK avant exécution." },
    { status: "not_executed", title: "Exécution réelle non faite", detail: "Ce paquet ne réserve, ne paie, ne publie et ne modifie rien." },
  ];

  return makeStructuredResponse({
    answer: `Paquet de confirmation préparé pour ${actionType}. Mutation non exécutée.`,
    modules,
    steps,
    extra: {
      risk,
      confirmation_packet: {
        action_type: actionType,
        summary,
        restaurant_id: args.restaurant_id || null,
        amount_chf: args.amount_chf || null,
        credit_cost: args.credit_cost || null,
        payload: args.payload || {},
        mutation_allowed: false,
        requires_human_confirmation: true,
        created_at: new Date().toISOString(),
        steps,
      },
    },
  });
}

function buildRiskAudit(args: Record<string, unknown>) {
  const request = String(args.request || "");
  const actor = toActor(args.actor);
  const modules = selectModules({ request, actor });
  const risk = riskForRequest(request);
  return makeStructuredResponse({
    answer: `Audit risque TOK: ${risk.level}. ${risk.reasons.join(" ")}`,
    modules,
    steps: buildRouteSteps(request || "Audit risque", actor, modules),
    extra: { risk, risk_audit: risk },
  });
}

async function callFullAppTool(context: TokConnectTokenContext | null, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "discover_tok_application":
      return buildDiscovery(args);
    case "open_tok_application_console":
      return buildConsole(args);
    case "plan_tok_application_route":
      return buildPlan(args);
    case "preview_tok_client_journey":
      return buildJourney(args, "client", "Prévisualiser un parcours client TOK.");
    case "preview_tok_restaurant_journey":
      return buildJourney(args, "restaurateur", "Prévisualiser un parcours restaurateur TOK.");
    case "preview_tok_admin_journey":
      return buildJourney(args, toActor(args.actor) === "support" ? "support" : "admin", "Prévisualiser un audit admin/support TOK.");
    case "read_tok_restaurant_snapshot":
      return await readRestaurantSnapshot(context, args);
    case "read_tok_availability_snapshot":
      return await readAvailabilitySnapshot(context, args);
    case "prepare_tok_human_confirmation_packet":
      return buildConfirmationPacket(args);
    case "audit_tok_action_risk":
      return buildRiskAudit(args);
    default:
      throw new HttpError(404, "mcp_tool_not_found");
  }
}

function resourceContents(uri: string) {
  if (uri === FULL_APP_WIDGET_URI) {
    return {
      uri,
      mimeType: "text/html;profile=mcp-app",
      text: FULL_APP_WIDGET_HTML,
      _meta: widgetMeta("Console interactive de toute l'application TOK dans ChatGPT."),
    };
  }
  if (uri === "tok://full-app/modules") {
    return { uri, mimeType: "application/json", text: JSON.stringify({ modules: TOK_APP_MODULES.map(mapModule), mutation_allowed: false }) };
  }
  if (uri === "tok://full-app/routes") {
    return { uri, mimeType: "application/json", text: JSON.stringify({ routes: TOK_APP_MODULES.map((module) => ({ id: module.id, title: module.title, route: module.route, entrypoints: module.entrypoints })) }) };
  }
  if (uri === "tok://full-app/guardrails") {
    return { uri, mimeType: "application/json", text: JSON.stringify({ guardrails: collectGuardrails(TOK_APP_MODULES), mutation_allowed: false }) };
  }
  return { uri, mimeType: "application/json", text: JSON.stringify({ status: "not_found", mutation_allowed: false }) };
}

async function handleMcp(req: Request, rpc: JsonRpcRequest): Promise<McpHandleResult> {
  switch (rpc.method) {
    case "initialize": {
      const context = hasBearerToken(req) ? await authorizeFullAppMcp(req) : null;
      return {
        payload: rpcResult(rpc.id, {
          protocolVersion: "2025-03-26",
          serverInfo: { name: "tok-connect-full-app-mcp", version: "1.0.0" },
          capabilities: { tools: {}, resources: {}, prompts: {} },
        }),
        context,
        route: context ? "Full App MCP initialize" : "Full App MCP initialize noauth",
        scopes: [],
      };
    }

    case "tools/list": {
      const context = hasBearerToken(req) ? await authorizeFullAppMcp(req) : null;
      return {
        payload: rpcResult(rpc.id, { tools: FULL_APP_MCP_TOOLS.map(toolDefinition) }),
        context,
        route: context ? "Full App MCP tools/list" : "Full App MCP tools/list noauth",
        scopes: [],
      };
    }

    case "tools/call": {
      const toolName = String(rpc.params?.name || "");
      const tool = FULL_APP_MCP_TOOLS.find((entry) => entry.name === toolName);
      if (!tool) throw new HttpError(404, "mcp_tool_not_found");
      const args = (rpc.params?.arguments || {}) as Record<string, unknown>;
      const context = hasBearerToken(req) ? await authorizeFullAppMcp(req, tool.requiredScopes) : null;
      const result = await callFullAppTool(context, toolName, args);
      return {
        payload: rpcResult(rpc.id, result),
        context,
        route: context ? `Full App MCP tools/call ${toolName}` : `Full App MCP tools/call ${toolName} noauth`,
        scopes: tool.requiredScopes,
      };
    }

    case "resources/list": {
      const context = hasBearerToken(req) ? await authorizeFullAppMcp(req) : null;
      return {
        payload: rpcResult(rpc.id, { resources: FULL_APP_RESOURCES }),
        context,
        route: context ? "Full App MCP resources/list" : "Full App MCP resources/list noauth",
        scopes: [],
      };
    }

    case "resources/read": {
      const uri = String(rpc.params?.uri || "tok://full-app/modules");
      const context = hasBearerToken(req) ? await authorizeFullAppMcp(req) : null;
      return {
        payload: rpcResult(rpc.id, { contents: [resourceContents(uri)] }),
        context,
        route: context ? "Full App MCP resources/read" : "Full App MCP resources/read noauth",
        scopes: [],
      };
    }

    case "prompts/list": {
      const context = hasBearerToken(req) ? await authorizeFullAppMcp(req) : null;
      return {
        payload: rpcResult(rpc.id, { prompts: FULL_APP_PROMPTS }),
        context,
        route: context ? "Full App MCP prompts/list" : "Full App MCP prompts/list noauth",
        scopes: [],
      };
    }

    case "prompts/get": {
      const context = hasBearerToken(req) ? await authorizeFullAppMcp(req) : null;
      const name = String(rpc.params?.name || "");
      const prompt = FULL_APP_PROMPTS.find((entry) => entry.name === name);
      if (!prompt) throw new HttpError(404, "mcp_prompt_not_found");
      return {
        payload: rpcResult(rpc.id, {
          description: prompt.description,
          messages: [{ role: "user", content: { type: "text", text: `${prompt.description} Use TOK Connect Full App MCP. Return a preview and confirmation blockers before any real mutation.` } }],
        }),
        context,
        route: context ? `Full App MCP prompts/get ${name}` : `Full App MCP prompts/get ${name} noauth`,
        scopes: [],
      };
    }

    default:
      throw new HttpError(404, "mcp_method_not_found");
  }
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const requestId = makeTokConnectRequestId();
  const startedAt = Date.now();
  let context: TokConnectTokenContext | null = null;
  let statusCode = 200;
  let errorCode: string | null = null;
  let route = "tok-connect-full-app-mcp";
  let scopes: string[] = [];
  let rpc: JsonRpcRequest = {};

  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    rpc = await req.json().catch(() => ({})) as JsonRpcRequest;
    const result = await handleMcp(req, rpc);
    context = result.context;
    route = result.route;
    scopes = result.scopes;
    return jsonResponse(result.payload, 200, corsHeaders);
  } catch (error) {
    statusCode = error instanceof HttpError ? error.status : 500;
    errorCode = error instanceof Error ? error.message : "tok_connect_full_app_mcp_error";
    return jsonResponse(
      rpcError(rpc.id ?? null, statusCode === 404 ? -32601 : -32000, errorCode),
      statusCode,
      corsHeaders,
    );
  } finally {
    await recordTokConnectApiRequest({
      context,
      request: req,
      requestId,
      route,
      statusCode,
      startedAt,
      scopes,
      errorCode,
    });
  }
});

export const tokConnectFullAppMcpHealthEnvelope = buildTokConnectEnvelope({
  requestId: "tok_full_app_mcp_static",
  data: { server: "tok-connect-full-app-mcp", modules: TOK_APP_MODULES.length, mutation_allowed: false },
});
