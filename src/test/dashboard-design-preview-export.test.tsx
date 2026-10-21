/* Export-only harness: no imports from application entrypoints reference this file. */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DashboardContext, type DashboardContextValue } from "@/pages/dashboard/useDashboardRestaurant";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PREVIEW_DATE, PREVIEW_RESTAURANT_ID, PREVIEW_USER_ID, previewProfile, previewRestaurant, previewMutationLog } from "../../scripts/dashboard-design-preview.fixtures";

const state = vi.hoisted(() => ({ surface: "restaurant", noop: vi.fn(), toast: vi.fn(), empty: [], networkAttempts: [] as string[] }));
vi.mock("@/integrations/supabase/client", async () => {
  const fixture = await import("../../scripts/dashboard-design-preview.fixtures");
  return { getSupabase: () => fixture.previewSupabase, getProductionSupabase: () => fixture.previewSupabase, getActiveSupabasePublicConfig: () => ({ url: "https://visual-preview.invalid", publishableKey: "visual-preview-public-fixture" }) };
});
vi.mock("@/lib/session", async (original) => ({
  ...await original<Record<string, unknown>>(),
  fetchWithFreshAccessToken: async (url: string, options?: RequestInit) => {
    const body = typeof options?.body === "string" ? JSON.parse(options.body) : {};
    if (url.endsWith("/functions/v1/tok-connect-portal") && body.action === "mcp-connection-status" && body.restaurant_id === PREVIEW_RESTAURANT_ID) {
      return new Response(JSON.stringify({ ok: true, data: { restaurant_id: PREVIEW_RESTAURANT_ID, log_limit: 200, connections: [] }, error: null }), { status: 200 });
    }
    state.networkAttempts.push("unexpected session transport");
    throw new Error("Unexpected session transport in visual export");
  },
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({
  user: { id: PREVIEW_USER_ID, email: previewProfile.email, user_metadata: { full_name: previewProfile.full_name } },
  session: { access_token: "visual-preview-fixture" }, role: state.surface === "restaurant" ? "restaurateur" : "client",
  roles: [state.surface === "restaurant" ? "restaurateur" : "client"], loading: false, canSwitchRole: false, isSuperAdmin: false,
  signOut: state.noop, switchRole: state.noop, refreshRoles: state.noop,
}) }));
vi.mock("@/lib/cart-context", () => ({ useCart: () => ({ itemCount: 2, items: state.empty, total: 0, clearCart: state.noop, addItem: state.noop }) }));
vi.mock("@/lib/featureFlags", async (original) => {
  const actual = await original<Record<string, unknown>>();
  const features = new Set([
    "reservation", "commandes", "emporter", "zero-attente", "anti-gaspi", "ventes-flash", "chefs-table", "actualites-sociales", "tok-one", "gift-points",
    "dashboard-overview", "dashboard-restaurant", "dashboard-advisor", "dashboard-menu", "dashboard-reservations", "dashboard-commandes",
    "dashboard-performances", "dashboard-comparaison", "dashboard-avis", "dashboard-factures", "dashboard-factures-parametres", "dashboard-billing",
    "dashboard-offres", "dashboard-ventes-flash", "dashboard-formules", "dashboard-photos", "dashboard-promotions", "dashboard-reseaux-sociaux",
    "dashboard-actualites", "dashboard-campagnes", "dashboard-campaign-studio", "dashboard-crm", "dashboard-support", "dashboard-service", "dashboard-plan-salle", "dashboard-tok-connect",
  ]);
  return { ...actual, useActiveFeatures: () => features, useFeatureFlagSnapshot: () => ({ activeFeatures: features, loading: false, error: null }), useFeatureFlag: () => true, isFeatureEnabled: () => true };
});
vi.mock("@/components/commercial/CommercialDemoFrameProvider", async (original) => ({ ...await original<Record<string, unknown>>(), useCommercialDemoFrame: () => null }));
vi.mock("@/hooks/useNotificationCenter", () => ({ useNotificationCenter: () => ({
  notifications: state.empty, unreadNotifications: state.empty, unreadCount: 0, inAppEnabled: true, isLoading: false,
  markNotificationRead: state.noop, markAllRead: state.noop, dismissNotification: state.noop,
}) }));
vi.mock("@/hooks/useRealtimeNotifications", () => ({ useRealtimeNotifications: vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: state.toast }), toast: state.toast }));
vi.mock("@/lib/ai/aiCreationJobs", async (original) => ({ ...await original<Record<string, unknown>>(), useAiCreationRecovery: vi.fn(), setActiveAiCreationContext: vi.fn() }));

type Page = { id: string; label: string; route: string; module: string; surface: "restaurant" | "client" };
const restaurantPages = [
  ["accueil", "Vue d’ensemble", "", "DashboardHome"], ["restaurant", "Mon restaurant", "/restaurant", "DashboardRestaurant"],
  ["menu", "Menu", "/menu", "DashboardMenu"], ["reservations", "Réservations", "/reservations", "DashboardReservations"],
  ["commandes", "Commandes et retraits", "/commandes", "DashboardCommandes"], ["offres", "Offres anti-gaspi", "/offres", "DashboardOffres"],
  ["ventes-flash", "Ventes flash", "/ventes-flash", "DashboardVentesFlash"], ["formules", "Formules", "/formules", "DashboardFormules"],
  ["campagnes", "Campagnes", "/campagnes", "DashboardCampagnes"], ["studio", "Studio marketing", "/campaign-studio", "DashboardCampaignStudio"],
  ["performances", "Performances", "/performances", "DashboardPerformances"], ["comparaison", "Comparaison", "/comparaison", "DashboardComparaison"],
  ["avis", "Avis clients", "/avis", "DashboardAvis"], ["promotions", "Promotions", "/promotions", "DashboardPromotions"],
  ["reseaux", "Réseaux sociaux", "/reseaux-sociaux", "DashboardReseauxSociaux"], ["actualites", "Actualités", "/actualites", "DashboardActualites"],
  ["factures", "Comptabilité", "/factures", "DashboardFactures"], ["entrees", "Entrées", "/factures/entrees", "DashboardFacturesInflow"],
  ["sorties", "Sorties", "/factures/sorties", "DashboardFacturesOutflow"], ["facturation", "Paramètres de facturation", "/factures/parametres", "DashboardInvoiceSettings"],
  ["compte", "Mon compte et facturation", "/mon-compte-facturation", "DashboardAccountBilling"], ["photos", "Photos", "/photos", "DashboardPhotos"],
  ["support", "Support", "/support", "DashboardSupport"], ["service", "Pilotage de service", "/service", "DashboardService"],
  ["plan", "Plan de salle", "/plan-salle", "DashboardPlanSalle"], ["equipe", "TOK Équipe", "/equipe", "DashboardWorkforce"],
  ["advisor", "Assistant IA", "/advisor", "DashboardAdvisor"], ["crm", "Clients", "/crm", "DashboardCrm"],
  ["notifications", "Notifications", "/notifications", "DashboardNotifications"], ["tok-connect", "TOK Connect", "/tok-connect", "DashboardTokConnect"],
  ["guide", "Guide d’utilisation", "/guide", "../GuideUtilisateur"],
].map(([id, label, route, module]) => ({ id: `restaurant-${id}`, label, route: `/dashboard${route}`, module: `dashboard/${module}`, surface: "restaurant" as const }));
const clientPages = [
  ["accueil", "Mon espace", "/mon-espace", "ClientDashboardHome"], ["reservations", "Mes réservations", "/reservations", "Reservations"],
  ["achats", "Mes achats", "/commandes", "Commandes"], ["avis", "Mes avis", "/mes-avis", "ClientReviews"],
  ["profil", "Mon profil", "/profil?tab=infos", "Profil"], ["favoris", "Mes favoris", "/profil?tab=favoris", "Profil"],
  ["abonnement", "Mon abonnement", "/profil?tab=abonnement", "Profil"], ["fidelite", "Ma fidélité", "/profil?tab=fidelite", "Profil"],
  ["notifications", "Notifications", "/notifications", "Notifications"], ["memoire", "Ma mémoire TOK", "/memoire-tok", "CustomerMemory"],
  ["confirmation", "Confirmation de commande", "/commande/confirmation?status=success&session_id=cs_test_visual_preview", "OrderConfirmation"],
].map(([id, label, route, module]) => ({ id: `client-${id}`, label, route, module, surface: "client" as const }));
const pages: Page[] = [...restaurantPages, ...clientPages];
const enabled = process.env.TOK_DASHBOARD_PREVIEW_EXPORT === "1";
const staticRoot = path.resolve(process.env.TOK_DASHBOARD_PREVIEW_STATIC_ROOT || ".vercel/output/static");
const outputRoot = path.join(staticRoot, "dashboard-design-preview");
const baseUrl = "/dashboard-design-preview/";
const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));
const clients: QueryClient[] = [];

function previewHref(route: string) {
  const exact = pages.find(page => page.route === route);
  const withoutQuery = route.split("?")[0].replace(/\/$/, "");
  const match = exact || pages.find(page => page.route.split("?")[0].replace(/\/$/, "") === withoutQuery);
  return match ? `${baseUrl}${match.id}.html` : null;
}

function validateStaticCharts(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(".recharts-responsive-container")).map(chart => {
    const svg = chart.querySelector<SVGSVGElement>("svg.recharts-surface");
    const width = Number(svg?.getAttribute("width"));
    const height = Number(svg?.getAttribute("height"));
    const viewBox = svg?.getAttribute("viewBox")?.trim().split(/\s+/).map(Number) || [];
    if (!svg || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 ||
        viewBox.length !== 4 || viewBox.some(value => !Number.isFinite(value)) || viewBox[2] <= 0 || viewBox[3] <= 0) {
      throw new Error("Visual export contains a chart without a dimensioned SVG surface.");
    }
    // Count only real data geometry, never grid lines, axes, or clipping rectangles.
    const dataMarks = Array.from(svg.querySelectorAll<SVGElement>(".recharts-bar-rectangle path, .recharts-line-curve, .recharts-area-area, .recharts-area-curve, .recharts-pie-sector path, .recharts-radial-bar-sector path, .recharts-scatter-symbol")).filter(mark => {
      if (mark.getAttribute("display") === "none" || mark.getAttribute("visibility") === "hidden" || mark.style.display === "none" || mark.style.visibility === "hidden" || mark.style.opacity === "0") return false;
      const geometry = mark.getAttribute("d") || "";
      if (!geometry || /NaN|Infinity/.test(geometry) || !/[LlHhVvCcSsQqTtAaZz]/.test(geometry)) return false;
      if (mark.closest(".recharts-bar-rectangle")) {
        return Number(mark.getAttribute("width")) > 0 && Number(mark.getAttribute("height")) > 0;
      }
      return true;
    });
    if (!dataMarks.length) throw new Error("Visual export contains a chart without visible data geometry.");
    chart.dataset.previewChart = "true";
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    return { width, height, dataMarks: dataMarks.length };
  });
}

function sanitizeMarkup(container: HTMLElement) {
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("script, iframe, object, embed").forEach(node => node.remove());
  clone.querySelectorAll("*").forEach(element => {
    for (const attribute of Array.from(element.attributes)) {
      if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
    }
    for (const attribute of ["src", "poster", "srcset"]) {
      const value = element.getAttribute(attribute);
      if (!value) continue;
      const sources = attribute === "srcset" ? value.split(",").map(item => item.trim().split(/\s+/)[0]) : [value];
      for (const source of sources) {
        if (!source.startsWith("/") || source.startsWith("//") || !existsSync(path.join(staticRoot, source))) {
          throw new Error(`Visual preview requires an existing local asset: ${source}`);
        }
      }
    }
  });
  clone.querySelectorAll("[style]").forEach(node => {
    const element = node as HTMLElement;
    if (/opacity:\s*0(?:;|$)/.test(element.style.cssText)) element.style.opacity = "1";
  });
  clone.querySelectorAll("a").forEach(link => {
    const original = link.getAttribute("href") || "";
    const target = previewHref(original);
    link.removeAttribute("target");
    if (target) link.setAttribute("href", target);
    else { link.removeAttribute("href"); link.setAttribute("aria-disabled", "true"); link.setAttribute("title", "Action disponible dans l’application TOK"); }
  });
  clone.querySelectorAll("button, input, textarea, select").forEach(node => {
    node.setAttribute("tabindex", "-1"); node.setAttribute("aria-disabled", "true");
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) node.readOnly = true;
    if (node instanceof HTMLButtonElement) node.type = "button";
    if (!(node as HTMLButtonElement).disabled) node.setAttribute("data-preview-frozen-control", "true");
    (node as HTMLButtonElement).disabled = true;
  });
  clone.querySelectorAll<HTMLButtonElement>('button[role="tab"]').forEach(button => {
    const tab = button.id.split("trigger-")[1];
    const href = tab ? previewHref(`/profil?tab=${tab}`) : null;
    if (state.surface !== "client" || !href || !pages.some(page => page.route === `/profil?tab=${tab}`)) return;
    const link = document.createElement("a");
    link.href = href; link.className = button.className; link.innerHTML = button.innerHTML;
    link.dataset.state = button.dataset.state || "inactive";
    link.setAttribute("role", "tab"); link.setAttribute("aria-selected", button.getAttribute("aria-selected") || "false");
    button.replaceWith(link);
  });
  clone.querySelectorAll("form").forEach(form => {
    const replacement = document.createElement("div");
    replacement.className = form.className;
    replacement.setAttribute("role", "presentation");
    replacement.append(...Array.from(form.childNodes));
    form.replaceWith(replacement);
  });
  const charts = validateStaticCharts(clone);
  return { markup: clone.innerHTML, charts };
}

function html(title: string, body: string, cssFiles: string[]) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(title)} — TOK · revue visuelle</title>${cssFiles.map(file => `<link rel="stylesheet" href="/assets/${escape(file)}">`).join("")}<style>
body{margin:0}.preview-notice{position:relative;z-index:1000;background:#2c211b;color:#fff5e8;padding:12px 22px;font:13px/1.5 system-ui;display:flex;align-items:center;gap:12px;flex-wrap:wrap}.preview-notice a{color:#ffd4ab;text-decoration:underline}.preview-notice small{opacity:.8}.preview-index{max-width:1180px;margin:auto;padding:50px 24px 80px;background:#fcf8f2;color:#32261e;min-height:100vh;font:15px/1.5 system-ui}.preview-index h1{font:54px/1.1 Georgia,serif;margin:12px 0 20px}.preview-index h2{font:30px/1.3 Georgia,serif;margin:42px 0 18px}.preview-index p{max-width:780px}.preview-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:13px}.preview-card{display:block;border:1px solid #e9ddce;border-radius:16px;padding:18px 20px;background:#fff;color:inherit;text-decoration:none;transition:transform .15s,border-color .15s}.preview-card:hover{transform:translateY(-2px);border-color:#f97316}.preview-card small{display:block;color:#7d6f62;font-size:11px;margin-top:8px}.preview-card strong{display:block}.preview-badge{display:inline-block;background:#ffeddc;color:#a24d19;border-radius:99px;padding:6px 11px;font-size:12px;font-weight:600}.preview-content form{pointer-events:none}.preview-content button,.preview-content input,.preview-content textarea,.preview-content select{pointer-events:none}.preview-content [data-preview-frozen-control]{opacity:1!important}.preview-content img{opacity:1!important}.preview-content .tok-workspace-sidebar{top:0}.preview-content [data-preview-surface]{min-height:100vh}@media(max-width:600px){.preview-index h1{font-size:38px}.preview-notice{font-size:11px;padding:10px 14px}}
.preview-content [data-preview-chart]{max-width:100%;min-width:0}.preview-content [data-preview-chart]>div,.preview-content [data-preview-chart] .recharts-wrapper{width:100%!important;height:100%!important;max-width:100%;min-width:0}.preview-content [data-preview-chart] .recharts-surface{display:block;width:100%;height:100%;max-width:100%}
@media(max-width:767px){.preview-notice[data-preview-surface="restaurant"]{position:sticky;top:calc(env(safe-area-inset-top,0px) + 80px);margin-top:calc(env(safe-area-inset-top,0px) + 80px)}.preview-content[data-preview-surface="restaurant"] .tok-dashboard-shell .tok-workspace-content{padding-top:16px!important}}
</style></head><body>${body}</body></html>`;
}

describe.skipIf(!enabled)("isolated dashboard visual export", () => {
  beforeAll(() => {
    mkdirSync(outputRoot, { recursive: true });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(PREVIEW_DATE));
    const blockNetwork = (kind: string) => { state.networkAttempts.push(kind); throw new Error(`Network forbidden in visual export: ${kind}`); };
    vi.stubGlobal("fetch", vi.fn(async () => blockNetwork("fetch")));
    vi.stubGlobal("XMLHttpRequest", class { constructor() { blockNetwork("XMLHttpRequest"); } });
    vi.stubGlobal("WebSocket", class { constructor() { blockNetwork("WebSocket"); } });
    vi.stubGlobal("EventSource", class { constructor() { blockNetwork("EventSource"); } });
    // jsdom has no layout engine. Supply only chart measurements; the real
    // Recharts components still calculate axes, scales, and SVG data geometry.
    vi.stubGlobal("ResizeObserver", class {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        if (!target.classList.contains("recharts-responsive-container")) return;
        const width = 675;
        const height = target.closest(".tok-overview-chart") ? 215 : target.closest(".h-80") ? 320 : target.closest(".h-64") ? 256 : 280;
        const size = { inlineSize: width, blockSize: height };
        this.callback([{ target, contentRect: new DOMRect(0, 0, width, height), borderBoxSize: [size], contentBoxSize: [size], devicePixelContentBoxSize: [size] }], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    });
    const matchMedia = window.matchMedia.bind(window);
    vi.stubGlobal("matchMedia", (query: string) => ({ ...matchMedia(query), matches: query === "(prefers-reduced-motion: reduce)" || matchMedia(query).matches }));
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
    Object.defineProperty(Element.prototype, "scrollTo", { configurable: true, value: vi.fn() });
  });
  afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });
  afterAll(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("rejects empty chart containers and SVGs containing only axes", () => {
    const container = document.createElement("div");
    container.innerHTML = '<div class="recharts-responsive-container"><div style="width:0px;height:0px"></div></div>';
    expect(() => validateStaticCharts(container)).toThrow("without a dimensioned SVG");
    container.innerHTML = '<div class="recharts-responsive-container"><svg class="recharts-surface" width="675" height="215" viewBox="0 0 675 215"><path class="recharts-cartesian-axis-line" d="M0,0L675,0" /></svg></div>';
    expect(() => validateStaticCharts(container)).toThrow("without visible data geometry");
  });

  it("renders each real page to static, non-transactional HTML", async () => {
    const cssFiles = readdirSync(path.join(staticRoot, "assets")).filter(file => file.endsWith(".css")).sort((a, b) => Number(b.startsWith("index-")) - Number(a.startsWith("index-")) || a.localeCompare(b));
    const results: Array<{ id: string; route: string; source: string; title: string; status: string; characters: number; charts: Array<{ width: number; height: number; dataMarks: number }> }> = [];
    const errors: string[] = [];
    expect(cssFiles.length).toBeGreaterThan(0);
    for (const page of pages) {
      console.log(`Exporting visual page: ${page.id}`);
      state.surface = page.surface;
      state.toast.mockClear();
      localStorage.clear(); sessionStorage.clear();
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity, refetchOnWindowFocus: false }, mutations: { retry: false } } });
      clients.push(client);
      const context = { restaurants: [previewRestaurant], selectedId: PREVIEW_RESTAURANT_ID, setSelectedId: vi.fn(), loading: false, error: null, disabledFeatures: new Set(), dashboardAccessLocked: false, onboardingConfigurationUnlocked: true, dashboardAccessLockReason: null, isDemoMode: false } as unknown as DashboardContextValue;
      const module = await import(/* @vite-ignore */ `../pages/${page.module}.tsx`);
      const PageComponent = module.default;
      const mounted = render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[page.route]}><TooltipProvider><DashboardContext.Provider value={context}><PageComponent /></DashboardContext.Provider></TooltipProvider></MemoryRouter></QueryClientProvider>);
      for (let attempt = 0; attempt < 8; attempt += 1) {
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 35)); });
        if (client.isFetching() === 0 && attempt >= 2) break;
      }
      const { markup, charts } = sanitizeMarkup(mounted.container);
      const queryErrors = client.getQueryCache().getAll().filter(query => query.state.status === "error").map(query => `${query.queryHash}: ${String(query.state.error)}`);
      const errorToasts = state.toast.mock.calls.filter(([toast]) => toast?.variant === "destructive");
      if (client.isFetching() || queryErrors.length || state.networkAttempts.length || errorToasts.length) {
        errors.push(`${page.id}: fetching=${client.isFetching()}; queryErrors=${queryErrors.join(" | ")}; network=${state.networkAttempts.join(", ")}; toasts=${JSON.stringify(errorToasts)}`);
        state.networkAttempts.length = 0;
        cleanup(); client.clear();
        continue;
      }
      expect(markup.length, page.id).toBeGreaterThan(1000);
      expect(markup, page.id).not.toMatch(/visual-preview-fixture|access_token|service_role/);
      expect(markup, page.id).not.toMatch(/Cannot read properties|Network forbidden|>NaN</);
      const banner = `<aside class="preview-notice" data-preview-surface="${page.surface}"><a href="${baseUrl}">← Toutes les pages</a><strong>Aperçu visuel — données de démonstration</strong><small>${escape(page.label)} · navigation de revue uniquement, actions métier inactives</small></aside>`;
      writeFileSync(path.join(outputRoot, `${page.id}.html`), html(page.label, `${banner}<div class="preview-content" data-preview-surface="${page.surface}">${markup}</div>`, cssFiles));
      results.push({ id: page.id, route: page.route, source: `src/pages/${page.module}.tsx`, title: page.label, status: "rendered", characters: markup.length, charts });
      cleanup(); client.clear();
    }
    expect(errors, "Every page must finish its mocked data loading successfully").toEqual([]);
    expect(previewMutationLog).toEqual([]);
    expect(results).toHaveLength(42);
    expect(results.find(page => page.id === "restaurant-accueil")?.charts.length, "The activity chart must be exported").toBeGreaterThan(0);
    const sections = (["restaurant", "client"] as const).map(surface => `<section><h2>${surface === "restaurant" ? "Espace restaurateur · 31 vues" : "Espace client · 11 vues"}</h2><div class="preview-grid">${pages.filter(page => page.surface === surface).map(page => `<a class="preview-card" href="${baseUrl}${page.id}.html"><strong>${escape(page.label)}</strong><small>${escape(page.route)}</small></a>`).join("")}</div></section>`).join("");
    writeFileSync(path.join(outputRoot, "index.html"), html("Dashboards", `<main class="preview-index"><span class="preview-badge">TOK · Revue de design</span><h1>Vos nouveaux espaces,<br>page par page.</h1><p><strong>Aperçu visuel — données de démonstration.</strong> Ces pages statiques sont rendues avec les composants réels de la branche de refonte et ses feuilles de style. Camille Martin, La Table d’Octobre et tous les chiffres présentés sont fictifs.</p><p>Parcourez les 42 vues pour examiner le design sur ordinateur et mobile. Les listes non renseignées montrent les états vides de l’application. Les actions métier, formulaires, paiements et liens externes sont inactifs dans cette galerie.</p>${sections}<p style="margin-top:40px;font-size:12px;color:#7d6f62">Version ${escape(process.env.GITHUB_SHA || "locale")}. Cette galerie est générée uniquement pour la preview ; elle ne fait pas partie du build de production.</p></main>`, cssFiles));
    writeFileSync(path.join(outputRoot, "manifest.json"), JSON.stringify({ commit: process.env.GITHUB_SHA || "local", generatedFromRealComponents: true, fixtureDate: PREVIEW_DATE, pages: results }, null, 2));
    console.log(`Dashboard visual review: ${results.length} real pages exported to ${outputRoot}`);
  }, 180_000);
});
