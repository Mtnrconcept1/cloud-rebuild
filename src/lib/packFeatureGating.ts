import type { LaunchPackServiceSlug } from "./launchPacks";

/** All dashboard features that can be gated */
export const ALL_GATABLE_FEATURES = [
  { key: "dashboard-overview", label: "Vue d'ensemble" },
  { key: "dashboard-advisor", label: "Assistant IA" },
  { key: "dashboard-restaurant", label: "Mon restaurant" },
  { key: "dashboard-menu", label: "Menu" },
  { key: "dashboard-photos", label: "Studio Marketing" },
  { key: "dashboard-commandes", label: "Commandes" },
  { key: "dashboard-reservations", label: "Reservations" },
  { key: "dashboard-performances", label: "Performances" },
  { key: "dashboard-comparaison", label: "Comparaison" },
  { key: "dashboard-avis", label: "Avis clients" },
  { key: "dashboard-crm", label: "CRM clients" },
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
  { key: "dashboard-pack", label: "Abonnement restaurateur" },
] as const;

export type GatableFeatureKey = typeof ALL_GATABLE_FEATURES[number]["key"];

export type RestaurantSubscriptionFeatureAccess = {
  plan?: string | null;
  slug?: string | null;
  status?: string | null;
  features?: unknown;
  current_period_end?: string | null;
  currentPeriodEnd?: string | null;
};

export type DashboardFeatureAccessOptions = {
  subscription?: RestaurantSubscriptionFeatureAccess | null;
};

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
  ai_review_replies: ["dashboard-avis", "dashboard-advisor"],
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

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);

const BASE_RESTAURANT_DASHBOARD_FEATURES: GatableFeatureKey[] = [
  "dashboard-overview",
  "dashboard-advisor",
  "dashboard-restaurant",
  "dashboard-menu",
  "dashboard-photos",
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
  "dashboard-campagne-overview",
  "dashboard-campagnes",
  "dashboard-performances",
  "dashboard-comparaison",
  "dashboard-reseaux-sociaux",
  "dashboard-plan-salle",
];

const SUBSCRIPTION_PLAN_TO_FEATURES: Record<string, GatableFeatureKey[]> = {
  starter: BASE_RESTAURANT_DASHBOARD_FEATURES,
  pro: BASE_RESTAURANT_DASHBOARD_FEATURES,
  premium: [
    ...BASE_RESTAURANT_DASHBOARD_FEATURES,
    "dashboard-crm",
    "dashboard-actualites",
  ],
  elite: ALL_GATABLE_FEATURES.map((feature) => feature.key),
};

const SUBSCRIPTION_FEATURE_LABEL_MAP: Array<{ match: string[]; features: GatableFeatureKey[] }> = [
  { match: ["dashboard restaurateur"], features: BASE_RESTAURANT_DASHBOARD_FEATURES },
  { match: ["campagnes simples"], features: ["dashboard-campagne-overview"] },
  { match: ["campagnes locales"], features: ["dashboard-campagne-overview", "dashboard-campagnes"] },
  { match: ["campagnes sponsorisées"], features: ["dashboard-campagne-overview", "dashboard-campagnes"] },
  { match: ["campagnes haute visibilité"], features: ["dashboard-campagne-overview", "dashboard-campagnes"] },
  { match: ["assistant ia"], features: ["dashboard-advisor", "dashboard-avis"] },
  { match: ["retouches photo"], features: ["dashboard-photos"] },
  { match: ["studio photo"], features: ["dashboard-photos"] },
  { match: ["optimisation menu"], features: ["dashboard-menu", "dashboard-performances"] },
  { match: ["insights compta", "performance"], features: ["dashboard-performances", "dashboard-comparaison", "dashboard-factures"] },
  { match: ["operations center"], features: ["dashboard-service", "dashboard-plan-salle", "dashboard-performances"] },
  { match: ["support prioritaire"], features: ["dashboard-support"] },
];

export function getPackServiceFeatureMap() {
  return SERVICE_TO_FEATURES;
}

function normalizePlanSlug(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeFeatureLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSubscriptionFeatureLabels(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((feature) => {
        if (typeof feature === "string") return feature;
        if (feature && typeof feature === "object" && "label" in feature) {
          return String((feature as { label?: unknown }).label || "");
        }
        return "";
      })
      .map(normalizeFeatureLabel)
      .filter(Boolean);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return normalizeSubscriptionFeatureLabels(parsed);
    } catch {
      return normalizeFeatureLabel(value) ? [normalizeFeatureLabel(value)] : [];
    }
  }

  return [];
}

export function isActiveRestaurantSubscription(subscription: RestaurantSubscriptionFeatureAccess | null | undefined) {
  const status = normalizePlanSlug(subscription?.status);
  return ACTIVE_SUBSCRIPTION_STATUSES.has(status);
}

export function isEliteRestaurantSubscription(subscription: RestaurantSubscriptionFeatureAccess | null | undefined) {
  if (!isActiveRestaurantSubscription(subscription)) return false;
  return normalizePlanSlug(subscription?.slug || subscription?.plan) === "elite";
}

export function isPremiumOrEliteRestaurantSubscription(subscription: RestaurantSubscriptionFeatureAccess | null | undefined) {
  if (!isActiveRestaurantSubscription(subscription)) return false;
  const planSlug = normalizePlanSlug(subscription?.slug || subscription?.plan);
  return planSlug === "premium" || planSlug === "elite";
}

export function computeSubscriptionEnabledFeatures(
  subscription: RestaurantSubscriptionFeatureAccess | null | undefined,
): GatableFeatureKey[] {
  if (!isActiveRestaurantSubscription(subscription)) return [];

  const enabled = new Set<GatableFeatureKey>();
  const planSlug = normalizePlanSlug(subscription?.slug || subscription?.plan);
  const planFeatures = SUBSCRIPTION_PLAN_TO_FEATURES[planSlug] || [];

  for (const feature of planFeatures) enabled.add(feature);

  const labels = normalizeSubscriptionFeatureLabels(subscription?.features);
  for (const label of labels) {
    for (const mapping of SUBSCRIPTION_FEATURE_LABEL_MAP) {
      if (mapping.match.map(normalizeFeatureLabel).every((part) => label.includes(part))) {
        for (const feature of mapping.features) enabled.add(feature);
      }
    }
  }

  return ALL_GATABLE_FEATURES
    .map((feature) => feature.key)
    .filter((feature) => enabled.has(feature));
}

/**
 * Given a list of pack service slugs, compute which dashboard features
 * should be ENABLED by always-on defaults and the pack services.
 */
export function computeEnabledFeatures(
  servicesSlugs: LaunchPackServiceSlug[],
  options: DashboardFeatureAccessOptions = {},
): GatableFeatureKey[] {
  const enabled = new Set<GatableFeatureKey>(ALWAYS_ENABLED);

  for (const slug of servicesSlugs) {
    const features = SERVICE_TO_FEATURES[slug];
    if (features) {
      for (const feature of features) enabled.add(feature);
    }
  }

  for (const feature of computeSubscriptionEnabledFeatures(options.subscription)) {
    enabled.add(feature);
  }

  return ALL_GATABLE_FEATURES
    .map((feature) => feature.key)
    .filter((feature) => enabled.has(feature));
}

/**
 * Given a list of pack service slugs, compute which dashboard features
 * should be DISABLED (all features minus those unlocked by the services).
 */
export function computeDisabledFeatures(
  servicesSlugs: LaunchPackServiceSlug[],
  options: DashboardFeatureAccessOptions = {},
): GatableFeatureKey[] {
  const enabled = new Set(computeEnabledFeatures(servicesSlugs, options));

  return ALL_GATABLE_FEATURES
    .filter((feature) => !enabled.has(feature.key))
    .map((feature) => feature.key);
}
