export type LaunchPackServiceSlug =
  | "mise_en_place"
  | "menu_creation"
  | "product_photography"
  | "social_media_setup"
  | "advertising_campaign"
  | "floor_plan_design"
  | "account_manager";

export const ALL_GATABLE_FEATURES = [
  "dashboard-overview",
  "dashboard-advisor",
  "dashboard-restaurant",
  "dashboard-menu",
  "dashboard-photos",
  "dashboard-commandes",
  "dashboard-reservations",
  "dashboard-recommandations",
  "dashboard-performances",
  "dashboard-comparaison",
  "dashboard-avis",
  "dashboard-campagne-overview",
  "dashboard-reseaux-sociaux",
  "dashboard-actualites",
  "dashboard-campagnes",
  "dashboard-factures",
  "dashboard-offres",
  "dashboard-ventes-flash",
  "dashboard-formules",
  "dashboard-service",
  "dashboard-plan-salle",
  "dashboard-support",
  "dashboard-pack",
] as const;

const SERVICE_TO_FEATURES: Record<LaunchPackServiceSlug, string[]> = {
  mise_en_place: [
    "dashboard-overview",
    "dashboard-restaurant",
    "dashboard-menu",
    "dashboard-commandes",
    "dashboard-reservations",
    "dashboard-service",
    "dashboard-formules",
    "dashboard-offres",
    "dashboard-ventes-flash",
    "dashboard-avis",
    "dashboard-factures",
    "dashboard-support",
    "dashboard-pack",
  ],
  menu_creation: ["dashboard-menu"],
  product_photography: ["dashboard-photos"],
  social_media_setup: ["dashboard-reseaux-sociaux", "dashboard-actualites"],
  advertising_campaign: ["dashboard-campagne-overview", "dashboard-campagnes"],
  floor_plan_design: ["dashboard-plan-salle"],
  account_manager: [
    "dashboard-advisor",
    "dashboard-recommandations",
    "dashboard-performances",
    "dashboard-comparaison",
  ],
};

const ALWAYS_ENABLED = ["dashboard-overview", "dashboard-support", "dashboard-pack"];

export function computeDisabledDashboardFeatures(services: Array<{ service?: string | null }>) {
  const enabled = new Set<string>(ALWAYS_ENABLED);

  for (const service of services) {
    const features = SERVICE_TO_FEATURES[service.service as LaunchPackServiceSlug] || [];
    for (const feature of features) enabled.add(feature);
  }

  return ALL_GATABLE_FEATURES.filter((feature) => !enabled.has(feature));
}
