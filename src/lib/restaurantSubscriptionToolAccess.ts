export type RestaurantSubscriptionToolAccessRow = {
  label: string;
  isEnabled: (planSlug: string) => boolean;
  note?: (planSlug: string) => string;
};

const NEWS_ENABLED_PLANS = new Set(["pro", "premium", "elite", "custom"]);
const NEWS_UNLIMITED_PLANS = new Set(["premium", "elite", "custom"]);
const CRM_ENABLED_PLANS = new Set(["premium", "elite", "custom"]);
const DAILY_DISH_ENABLED_PLANS = new Set(["premium", "elite", "custom"]);

export const RESTAURANT_SUBSCRIPTION_TOOL_ACCESS_ROWS: RestaurantSubscriptionToolAccessRow[] = [
  { label: "Vue d'ensemble", isEnabled: () => true },
  { label: "Assistant IA", isEnabled: () => true },
  { label: "Commandes", isEnabled: () => true },
  { label: "Réservations", isEnabled: () => true },
  { label: "Performances", isEnabled: () => true },
  { label: "Comparaison", isEnabled: () => true },
  { label: "Avis clients", isEnabled: () => true },
  { label: "Campagnes", isEnabled: () => true },
  { label: "Promotions", isEnabled: () => true },
  { label: "Réseaux sociaux", isEnabled: () => true },
  { label: "Studio Marketing", isEnabled: () => true },
  {
    label: "Actualités",
    isEnabled: (planSlug) => NEWS_ENABLED_PLANS.has(planSlug),
    note: (planSlug) => {
      if (!NEWS_ENABLED_PLANS.has(planSlug)) return "Dès Business";
      if (NEWS_UNLIMITED_PLANS.has(planSlug)) return "Illimité";
      return "1 post/semaine";
    },
  },
  {
    label: "CRM clients",
    isEnabled: (planSlug) => CRM_ENABLED_PLANS.has(planSlug),
    note: (planSlug) => (CRM_ENABLED_PLANS.has(planSlug) ? "Inclus" : "Premium/Élite"),
  },
  { label: "Mon compte/Facturation", isEnabled: () => true },
  { label: "Factures", isEnabled: () => true },
  { label: "Mon restaurant", isEnabled: () => true },
  { label: "Menu", isEnabled: () => true },
  {
    label: "Plat du jour IA",
    isEnabled: (planSlug) => DAILY_DISH_ENABLED_PLANS.has(planSlug),
    note: (planSlug) => DAILY_DISH_ENABLED_PLANS.has(planSlug) ? "3 propositions/jour" : "Premium/Élite",
  },
  { label: "Anti-gaspi", isEnabled: () => true },
  { label: "Ventes flash", isEnabled: () => true },
  { label: "Formules", isEnabled: () => true },
  { label: "Pilotage de service", isEnabled: () => true },
  { label: "Plan de salle", isEnabled: () => true },
  { label: "Aide et support", isEnabled: () => true },
];

export function normalizeRestaurantSubscriptionPlanSlug(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

export function getRestaurantSubscriptionToolAccessState(
  row: RestaurantSubscriptionToolAccessRow,
  planSlug: string,
) {
  const enabled = row.isEnabled(planSlug);
  return {
    enabled,
    note: row.note?.(planSlug) ?? (enabled ? "Inclus" : "Non inclus"),
  };
}
