/**
 * Website-only Metricool page views. No third-party script runs until the
 * visitor has consented AND a dedicated TOK Metricool brand is verified.
 *
 * Metricool brand 6954835 was historically used for Stoppin while the
 * Instagram connection pointed to tok_suisse. NEVER reuse that brand's
 * website hash or analytics for TOK: the two businesses need distinct brands.
 */
export const METRICOOL_TRACKER_SRC = "https://tracker.metricool.com/resources/be.js";
export const LEGACY_MIXED_BRAND_ID = "6954835";
export const LEGACY_MIXED_TRACKER_HASH = "8dd2fca1e84e3ac86c6d9d09fc0d05e9";

type MetricoolApi = { t: (input: { hash: string }) => void };
type MetricoolWindow = Window & { beTracker?: MetricoolApi };
export type TokMetricoolConfig = { brandId: string; trackerHash: string };

/**
 * Both new IDs are browser-public identifiers, not API credentials.
 * A flag alone must never activate the old mixed brand.
 * Verification happens administratively in the Metricool Connections panel.
 */
export function readTokMetricoolConfig(): TokMetricoolConfig | null {
  const verified = import.meta.env.VITE_METRICOOL_TOK_PROPERTY_VERIFIED === "true";
  const brandId = String(import.meta.env.VITE_METRICOOL_TOK_BRAND_ID || "").trim();
  const trackerHash = String(import.meta.env.VITE_METRICOOL_TOK_TRACKER_HASH || "").trim().toLowerCase();
  if (!verified || !/^\d{5,12}$/.test(brandId) || brandId === LEGACY_MIXED_BRAND_ID ||
    !/^[a-f0-9]{32}$/.test(trackerHash) || trackerHash === LEGACY_MIXED_TRACKER_HASH) return null;
  return { brandId, trackerHash };
}

export function isMetricoolTokPropertyVerified(): boolean {
  return readTokMetricoolConfig() !== null;
}

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
  // The provider may transmit the full URL; reject arbitrary query parameters.
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

/** Insert the official script only once. No inline script (TOK's CSP forbids it). */
export function ensureMetricoolLoaded(): Promise<boolean> {
  if (!isMetricoolTokPropertyVerified() || typeof document === "undefined" || typeof window === "undefined")
    return Promise.resolve(false);
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

/** Called only after consent, dedicated brand and public-route checks. */
export function sendMetricoolPageView(): boolean {
  const config = readTokMetricoolConfig();
  const tracker = getTracker();
  if (!config || !tracker) return false;
  try {
    tracker.t({ hash: config.trackerHash });
    return true;
  } catch {
    // Tracking must never interrupt navigation, sign-in or a payment.
    return false;
  }
}
