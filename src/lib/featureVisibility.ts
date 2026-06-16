type FeatureSet = Pick<Set<string>, "has">;

export type PublicDiscoverLink = {
  label: string;
  to: string;
  feature: string;
};

export const PUBLIC_DISCOVER_LINKS: PublicDiscoverLink[] = [
  { label: "Anti-gaspi", to: "/anti-gaspi", feature: "anti-gaspi" },
  { label: "Ventes flash", to: "/ventes-flash", feature: "ventes-flash" },
  { label: "La Table du Chef", to: "/chefs-table", feature: "chefs-table" },
  { label: "Tok One", to: "/tok-one", feature: "tok-one" },
];

const HELP_CATEGORY_REQUIREMENTS: Record<string, string | string[]> = {
  orders: "commandes",
  delivery: ["livraison", "emporter"],
  reservations: "reservation",
  social: "actualites-sociales",
  antigaspi: "anti-gaspi",
  membership: "tok-one",
  loyalty: "points-cadeau",
};

const HELP_FEATURE_RULES: Array<{ feature: string; terms: string[] }> = [
  { feature: "commandes", terms: ["commande", "commander", "panier", "remboursement"] },
  { feature: "livraison", terms: ["livraison", "livreur", "livrer", "livre", "domicile"] },
  { feature: "emporter", terms: ["emporter", "retrait", "click & collect", "click collect"] },
  { feature: "reservation", terms: ["reservation", "reserver", "reserve", "table"] },
  { feature: "anti-gaspi", terms: ["anti gaspi", "anti-gaspi", "paniers surprise", "dons solidaires"] },
  { feature: "ventes-flash", terms: ["ventes flash", "vente flash", "flash"] },
  { feature: "actualites-sociales", terms: ["actualites", "posts", "publication", "sponsorise"] },
  { feature: "tok-one", terms: ["tok one", "livraison gratuite", "abonnement tok one"] },
  { feature: "points-cadeau", terms: ["points cadeau", "points de fidelite en cadeau", "offrir des points"] },
  { feature: "multi-restaurant", terms: ["multi restaurant", "multi-restaurant", "multi restos", "multi-restos"] },
  { feature: "match-groupes", terms: ["match groupes", "commande groupee", "commandes groupees"] },
  { feature: "multi-stop", terms: ["multi stop", "multi-stop", "plusieurs adresses"] },
  { feature: "garantie-qualite", terms: ["garantie qualite", "qualite chaud", "compensation automatique"] },
  { feature: "creneaux-garantis", terms: ["creneaux garantis", "creneau garanti", "ponctualite"] },
  { feature: "flex-prix-bas", terms: ["flex prix bas", "fenetre flexible"] },
  { feature: "zero-attente", terms: ["zero attente", "precommande synchronisee", "precommandes"] },
  { feature: "chefs-table", terms: ["la table du chef", "tables vip", "plats signature"] },
  { feature: "budget-auto", terms: ["budget auto"] },
  { feature: "abonnement", terms: ["abonnement repas", "repas recurrents"] },
  { feature: "dashboard-actualites", terms: ["outil marketing", "cockpit actualites"] },
  { feature: "dashboard-campagnes", terms: ["page campagnes", "budget d'une campagne"] },
  { feature: "dashboard-plan-salle", terms: ["plan de salle"] },
];

function normalizeForSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hasRequiredFeature(activeFeatures: FeatureSet, requirement: string | string[]) {
  return Array.isArray(requirement)
    ? requirement.some((feature) => activeFeatures.has(feature))
    : activeFeatures.has(requirement);
}

export function getVisiblePublicDiscoverLinks(activeFeatures: FeatureSet) {
  return PUBLIC_DISCOVER_LINKS.filter((link) => activeFeatures.has(link.feature));
}

export function isHelpCategoryVisible(categoryId: string, activeFeatures: FeatureSet) {
  const requirement = HELP_CATEGORY_REQUIREMENTS[categoryId];
  return requirement ? hasRequiredFeature(activeFeatures, requirement) : true;
}

export function isHelpQuestionVisible(
  categoryId: string,
  question: string,
  answer: string,
  activeFeatures: FeatureSet,
) {
  if (!isHelpCategoryVisible(categoryId, activeFeatures)) return false;

  const searchable = normalizeForSearch(`${categoryId} ${question} ${answer}`);
  return !HELP_FEATURE_RULES.some((rule) => {
    if (activeFeatures.has(rule.feature)) return false;
    return rule.terms.some((term) => searchable.includes(normalizeForSearch(term)));
  });
}
