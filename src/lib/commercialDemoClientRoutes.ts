const COMMERCIAL_DEMO_CLIENT_EXACT_PATHS = new Set([
  "/mon-espace",
  "/recherche",
  "/panier",
  "/commandes",
  "/reservations",
  "/mes-avis",
  "/notifications",
  "/contact",
  "/profil",
  "/tok-one",
  "/points-cadeau",
  "/actualites",
  "/anti-gaspi",
  "/creneaux-garantis",
  "/flex-prix-bas",
  "/match-groupes",
  "/multi-stop",
  "/multi-restaurant",
  "/chefs-table",
  "/zero-attente",
  "/garantie-qualite",
  "/budget-auto",
  "/abonnement",
  "/tok-pulse",
  "/miamz-solidaires",
  "/ventes-flash",
]);

const COMMERCIAL_DEMO_CLIENT_PATH_PREFIXES = [
  "/restaurant/",
  "/commande/",
  "/actualites/",
] as const;

const PRODUCTION_DISCOVERY_PATH_PREFIXES = [
  "/restaurants/",
  "/r/",
] as const;

/**
 * Routes that may stay inside the embedded client browser.
 *
 * Every data-backed route in this list must resolve its restaurant and mutable
 * state from CommercialDemoFrameProvider. Keeping this policy in one place
 * prevents the dashboard navigation and iframe boundary from drifting apart.
 */
export function isCommercialDemoClientPathAllowed(pathname: string) {
  return COMMERCIAL_DEMO_CLIENT_EXACT_PATHS.has(pathname)
    || COMMERCIAL_DEMO_CLIENT_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Normalizes links emitted by the real client dashboard before they are sent
 * to the embedded browser history. Production discovery URLs are redirected
 * to their isolated demo equivalent; order details remain available because
 * SuiviCommande swaps to the shared commercial-demo snapshot inside the frame.
 */
export function getCommercialDemoClientTarget(target: string) {
  const url = new URL(target, "https://thetok.ch");

  if (PRODUCTION_DISCOVERY_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    return "/recherche";
  }
  if (!isCommercialDemoClientPathAllowed(url.pathname)) return "/mon-espace";

  return `${url.pathname}${url.search}${url.hash}`;
}
