/**
 * Five editorial treatments derived from the approved TOK dashboard hero references.
 * Assignment is stable per route; it never changes at random on re-render.
 */
export const HERO_SUBTITLE_STYLES = [
  "brosse-orange",
  "surligneur-abricot",
  "ticket-de-brigade",
  "soulignement-au-pinceau",
  "ruban-de-menu",
] as const;

export type HeroSubtitleStyle = (typeof HERO_SUBTITLE_STYLES)[number];

const featuredRoutes: Record<string, HeroSubtitleStyle> = {
  "/dashboard": "brosse-orange",
  "/dashboard/restaurant": "brosse-orange",
  "/dashboard/menu": "surligneur-abricot",
  "/dashboard/commandes": "ticket-de-brigade",
  "/dashboard/reservations": "soulignement-au-pinceau",
  "/dashboard/ventes-flash": "ruban-de-menu",
  "/mon-espace": "brosse-orange",
  "/reservations": "surligneur-abricot",
  "/commandes": "ticket-de-brigade",
  "/mes-avis": "soulignement-au-pinceau",
  "/ventes-flash": "ruban-de-menu",
  "/admin": "brosse-orange",
  "/commercial": "ticket-de-brigade",
  "/courier": "ruban-de-menu",
};

export function getHeroSubtitleStyle(pathname: string, search = ""): HeroSubtitleStyle {
  const path = pathname.replace(/\/+$/, "") || "/";
  const featured = featuredRoutes[path];
  if (featured) return featured;

  // The profile is a single URL with multiple visually distinct tabs.
  const stableKey = path === "/profil"
    ? `${path}?tab=${new URLSearchParams(search).get("tab") || "infos"}`
    : path;
  let hash = 0;
  for (const char of stableKey) {
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  }
  return HERO_SUBTITLE_STYLES[hash % HERO_SUBTITLE_STYLES.length];
}
