/**
 * Website-only Metricool page views.
 *
 * TOK's consent banner defaults analytics to off. Never load the third-party
 * script until that category has been accepted by the visitor.
 */
export const METRICOOL_TRACKER_SRC = "https://tracker.metricool.com/resources/be.js";
export const METRICOOL_TRACKER_HASH = "8dd2fca1e84e3ac86c6d9d09fc0d05e9";

/** The connected brand currently mixes Stoppin publications and TOK Instagram.
 * Stay off until the operator verifies ownership of the TOK website property. */
export function isMetricoolTokPropertyVerified(): boolean {
  return import.meta.env.VITE_METRICOOL_TOK_PROPERTY_VERIFIED === "true";
}

type MetricoolApi = { t: (input: { hash: string }) => void };
type MetricoolWindow = Window & { beTracker?: MetricoolApi };

const TRACKING_HOSTS = new Set(["thetok.ch", "www.thetok.ch"]);
const PUBLIC_PAGES = new Set([
  "/", "/recherche", "/anti-gaspi", "/ventes-flash", "/actualites",
  "/contact", "/aide", "/zero-attente", "/chefs-table", "/tok-one",
  "/abonnement", "/creneaux-garantis", "/garantie-qualite",
  "/flex-prix-bas", "/match-groupes", "/multi-stop", "/multi-restaurant",
  "/budget-auto", "/miamz-solidaires", "/restaurateurs/geneve",
  "/restaurateurs/google-business",
  "/restaurateurs/alternative-commission-couvert",
]);
const PUBLIC_DETAILS = [
  /^\/restaurant\/[a-z0-9-]+$/i,
  /^\/restaurants\/[a-z0-9-]{1,100}(?:\/[a-z0-9-]{1,100}){0,2}$/i,
  /^\/restaurants-pres\/[a-z0-9-]{1,100}$/i,
  /^\/restaurateurs\/[a-z0-9-]{1,100}$/i,
  /^\/actualites\/[a-z0-9-]+$/i,
];
const SAFE_SEARCH_KEYS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "utm_id", "gclid", "fbclid",
]);

export type MetricoolLocation = {
  hostname: string;
  pathname: string;
  search?: string;
  hash?: string;
  native?: boolean;
};

/** Explicit public-route allowlist: never send authenticated, admin, payment or OAuth URLs. */
export function isMetricoolTrackablePage(input: MetricoolLocation): boolean {
  if (input.native || !TRACKING_HOSTS.has(input.hostname.toLowerCase())) return false;
  if (input.hash || !input.pathname.startsWith("/") || input.pathname.includes("//")) return false;

  // The tracker may send the current URL, including query parameters. Reject
  // arbitrary parameters and values that could contain tokens or personal data.
  const params = new URLSearchParams(input.search ?? "");
  for (const [key, value] of params) {
    if (!SAFE_SEARCH_KEYS.has(key) || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) return false;
  }

  const path = input.pathname === "/" ? "/" : input.pathname.replace(/\/$/, "");
  return PUBLIC_PAGES.has(path) || PUBLIC_DETAILS.some((pattern) => pattern.test(path));
}

let loadPromise: Promise<boolean> | null = null;

function getTracker(): MetricoolApi | null {
  if (typeof window === "undefined") return null;
  const tracker = (window as MetricoolWindow).beTracker;
  return typeof tracker?.t === "function" ? tracker : null;
}

/** Insert the official script only once; no inline JavaScript (TOK CSP forbids it). */
export function ensureMetricoolLoaded(): Promise<boolean> {
  if (!isMetricoolTokPropertyVerified() || typeof document === "undefined" || typeof window === "undefined") return Promise.resolve(false);
  if (getTracker()) return Promise.resolve(true);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<boolean>((resolve) => {
    const script = document.createElement("script");
    script.src = METRICOOL_TRACKER_SRC;
    script.async = true;
    script.dataset.tokMetricool = "true";
    script.addEventListener("load", () => {
      const ready = getTracker() !== null;
      if (!ready) {
        script.remove();
        loadPromise = null;
      }
      resolve(ready);
    }, { once: true });
    script.addEventListener("error", () => {
      script.remove();
      loadPromise = null;
      resolve(false);
    }, { once: true });
    document.head.appendChild(script);
  });
  return loadPromise;
}

/** Called only after consent and route checks by MetricoolPageTracker. */
export function sendMetricoolPageView(): boolean {
  if (!isMetricoolTokPropertyVerified()) return false;
  const tracker = getTracker();
  if (!tracker) return false;
  try {
    tracker.t({ hash: METRICOOL_TRACKER_HASH });
    return true;
  } catch {
    // Tracking must never block browsing, sign-in or the purchase funnel.
    return false;
  }
}
