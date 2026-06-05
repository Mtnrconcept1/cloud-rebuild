import type { LaunchPackServiceSlug } from "./launchPacks";

/** All dashboard features that can be gated */
export const ALL_GATABLE_FEATURES = [
  { key: "dashboard-overview", label: "Vue d'ensemble" },
  { key: "dashboard-advisor", label: "Assistant IA" },
  { key: "dashboard-restaurant", label: "Mon restaurant" },
  { key: "dashboard-menu", label: "Menu" },
  { key: "dashboard-photos", label: "Photos" },
  { key: "dashboard-commandes", label: "Commandes" },
  { key: "dashboard-reservations", label: "Reservations" },
  { key: "dashboard-performances", label: "Performances" },
  { key: "dashboard-comparaison", label: "Comparaison" },
  { key: "dashboard-avis", label: "Avis clients" },
  { key: "dashboard-campagne-overview", label: "Campagnes" },
  { key: "dashboard-reseaux-sociaux", label: "Reseaux sociaux" },
  { key: "dashboard-actualites", label: "Actualités" },
  { key: "dashboard-campagnes", label: "Campagnes avancees" },
  { key: "dashboard-factures", label: "Factures" },
  { key: "dashboard-offres", label: "Anti-gaspi" },
  { key: "dashboard-ventes-flash", label: "Ventes flash" },
  { key: "dashboard-formules", label: "Formules" },
  { key: "dashboard-service", label: "Pilotage de service" },
  { key: "dashboard-plan-salle", label: "Plan de salle" },
  { key: "dashboard-support", label: "Aide et support" },
  { key: "dashboard-pack", label: "Pack de lancement" },
] as const;

export type GatableFeatureKey = typeof ALL_GATABLE_FEATURES[number]["key"];

/**
 * Maps pack service slugs to the dashboard features they unlock.
 * Features NOT listed here remain gated by default when a pack is active.
 */
const SERVICE_TO_FEATURES: Record<LaunchPackServiceSlug, GatableFeatureKey[]> = {
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
    "dashboard-performances",
    "dashboard-comparaison",
  ],
};

/** Features always accessible regardless of pack */
const ALWAYS_ENABLED: GatableFeatureKey[] = [
  "dashboard-overview",
  "dashboard-support",
  "dashboard-pack",
];

export function getPackServiceFeatureMap() {
  return SERVICE_TO_FEATURES;
}

/**
 * Given a list of pack service slugs, compute which dashboard features
 * should be ENABLED by always-on defaults and the pack services.
 */
export function computeEnabledFeatures(servicesSlugs: LaunchPackServiceSlug[]): GatableFeatureKey[] {
  const enabled = new Set<GatableFeatureKey>(ALWAYS_ENABLED);

  for (const slug of servicesSlugs) {
    const features = SERVICE_TO_FEATURES[slug];
    if (features) {
      for (const feature of features) enabled.add(feature);
    }
  }

  return ALL_GATABLE_FEATURES
    .map((feature) => feature.key)
    .filter((feature) => enabled.has(feature));
}

/**
 * Given a list of pack service slugs, compute which dashboard features
 * should be DISABLED (all features minus those unlocked by the services).
 */
export function computeDisabledFeatures(servicesSlugs: LaunchPackServiceSlug[]): GatableFeatureKey[] {
  const enabled = new Set(computeEnabledFeatures(servicesSlugs));

  return ALL_GATABLE_FEATURES
    .filter((feature) => !enabled.has(feature.key))
    .map((feature) => feature.key);
}
