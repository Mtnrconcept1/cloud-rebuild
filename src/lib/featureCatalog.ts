export type FeatureFlagGroup =
  | "payments"
  | "journeys"
  | "client_features"
  | "restaurant_dashboard"
  | "courier"
  | "admin_tools"
  | "custom";

export type FeatureFlagDefinition = {
  name: string;
  label: string;
  description: string;
  defaultEnabled: boolean;
  group: Exclude<FeatureFlagGroup, "custom">;
  dependsOn?: string[];
  requiresAnyOf?: string[];
  routeTargets?: string[];
  overrideNote?: string;
  critical?: boolean;
};

export type FeatureFlag = FeatureFlagDefinition & {
  id: string;
  isActive: boolean;
  explicitEnabled: boolean;
  effectiveEnabled: boolean;
  blockedBy: string[];
};

export type FeatureFlagRow = {
  id?: string | null;
  name?: string | null;
  label?: string | null;
  description?: string | null;
  is_active?: boolean | null;
};

type FeatureResolution = {
  effectiveEnabled: boolean;
  blockedBy: string[];
};

export const FEATURE_FLAG_GROUP_LABELS: Record<FeatureFlagGroup, string> = {
  payments: "Paiements",
  journeys: "Parcours coeur",
  client_features: "Fonctionnalites client",
  restaurant_dashboard: "Dashboard restaurateur",
  courier: "Dashboard coursier",
  admin_tools: "Outils admin",
  custom: "Autres flags",
};

export const FEATURE_FLAG_GROUP_DESCRIPTIONS: Record<FeatureFlagGroup, string> = {
  payments: "Controle les moyens de paiement acceptes par la plateforme.",
  journeys: "Pilote les modes de commande et de reservation exposes a l'echelle globale.",
  client_features: "Active ou coupe les experiences client et modules exclusifs.",
  restaurant_dashboard: "Controle le dashboard restaurateur, ses routes et ses sections metier.",
  courier: "Controle le dashboard livreur et ses routes internes.",
  admin_tools: "Controle les modules accessibles depuis l'administration.",
  custom: "Flags trouves en base mais non catalogues dans le frontend.",
};

export const FEATURE_FLAG_GROUP_ORDER: FeatureFlagGroup[] = [
  "payments",
  "journeys",
  "client_features",
  "restaurant_dashboard",
  "courier",
  "admin_tools",
  "custom",
];

export const FEATURE_DEFINITIONS: FeatureFlagDefinition[] = [
  {
    name: "payment-card",
    label: "Paiement carte",
    description: "Active les paiements carte bancaire dans les parcours checkout et campagnes.",
    defaultEnabled: true,
    group: "payments",
    critical: true,
  },
  {
    name: "payment-twint",
    label: "Paiement TWINT",
    description: "Active TWINT dans les parcours checkout et campagnes.",
    defaultEnabled: true,
    group: "payments",
  },
  {
    name: "payment-postfinance-card",
    label: "Paiement PostFinance Card",
    description: "Active PostFinance Card dans les parcours checkout et campagnes.",
    defaultEnabled: true,
    group: "payments",
  },
  {
    name: "payment-postfinance-efinance",
    label: "Paiement PostFinance E-Finance",
    description: "Active PostFinance E-Finance dans les parcours checkout et campagnes.",
    defaultEnabled: true,
    group: "payments",
  },
  {
    name: "payment-cash",
    label: "Paiement especes",
    description: "Autorise le reglement manuel ou sur place quand le parcours le permet.",
    defaultEnabled: true,
    group: "payments",
  },
  {
    name: "livraison",
    label: "Livraison",
    description: "Expose les parcours de livraison cote client, restaurateur et livreur.",
    defaultEnabled: true,
    group: "journeys",
    critical: true,
  },
  {
    name: "emporter",
    label: "Emporter",
    description: "Active le retrait click & collect et les flux relies.",
    defaultEnabled: true,
    group: "journeys",
    critical: true,
  },
  {
    name: "sur-place",
    label: "Sur place",
    description: "Active les experiences dine-in et les parcours associes.",
    defaultEnabled: true,
    group: "journeys",
  },
  {
    name: "reservation",
    label: "Reservation",
    description: "Active les reservations cote client, restaurateur et leurs routes dediees.",
    defaultEnabled: true,
    group: "journeys",
    routeTargets: ["/reservations"],
    critical: true,
  },
  {
    name: "commandes",
    label: "Commandes",
    description: "Expose l'historique client et le suivi des commandes du dashboard restaurateur.",
    defaultEnabled: true,
    group: "journeys",
    requiresAnyOf: ["livraison", "emporter"],
    routeTargets: ["/commandes", "/commande/confirmation", "/commande/:id"],
  },
  {
    name: "anti-gaspi",
    label: "Anti-gaspi",
    description: "Active les offres anti-gaspi cote client et restaurateur.",
    defaultEnabled: true,
    group: "client_features",
    dependsOn: ["emporter"],
    routeTargets: ["/anti-gaspi"],
  },
  {
    name: "ventes-flash",
    label: "Ventes flash",
    description: "Active les drops time-boxes et les ecrans associes.",
    defaultEnabled: true,
    group: "client_features",
    routeTargets: ["/ventes-flash"],
  },
  {
    name: "actualites-sociales",
    label: "Actualites sociales",
    description: "Active le fil social client dedie aux restaurants.",
    defaultEnabled: true,
    group: "client_features",
    routeTargets: ["/actualites"],
  },
  {
    name: "creneaux-garantis",
    label: "Creneaux garantis",
    description: "Active la promesse de livraison ponctuelle ou remboursee.",
    defaultEnabled: true,
    group: "client_features",
    dependsOn: ["livraison"],
    routeTargets: ["/creneaux-garantis"],
  },
  {
    name: "flex-prix-bas",
    label: "Offres",
    description: "Active l'experience de fenetre flexible a prix reduit.",
    defaultEnabled: true,
    group: "client_features",
    dependsOn: ["livraison"],
    routeTargets: ["/flex-prix-bas"],
  },
  {
    name: "match-groupes",
    label: "Match groupes",
    description: "Active la commande groupee mutualisee.",
    defaultEnabled: true,
    group: "client_features",
    dependsOn: ["livraison"],
    routeTargets: ["/match-groupes"],
  },
  {
    name: "multi-stop",
    label: "Multi-stop",
    description: "Active un trajet unique vers plusieurs adresses.",
    defaultEnabled: true,
    group: "client_features",
    dependsOn: ["livraison"],
    routeTargets: ["/multi-stop"],
  },
  {
    name: "multi-restaurant",
    label: "Multi-restos",
    description: "Active les paniers composes de plusieurs restaurants.",
    defaultEnabled: true,
    group: "client_features",
    requiresAnyOf: ["livraison", "emporter"],
    routeTargets: ["/multi-restaurant"],
  },
  {
    name: "chefs-table",
    label: "La Table du Chef",
    description: "Active les experiences exclusives et leurs pages associees.",
    defaultEnabled: true,
    group: "client_features",
    routeTargets: ["/chefs-table"],
  },
  {
    name: "zero-attente",
    label: "Zero attente",
    description: "Active la precommande synchronisee sur reservation payee.",
    defaultEnabled: true,
    group: "client_features",
    dependsOn: ["reservation", "sur-place"],
    routeTargets: ["/zero-attente"],
  },
  {
    name: "garantie-qualite",
    label: "Garantie qualite",
    description: "Active la garantie chaud ou rembourse.",
    defaultEnabled: true,
    group: "client_features",
    dependsOn: ["livraison"],
    routeTargets: ["/garantie-qualite"],
  },
  {
    name: "budget-auto",
    label: "Budget auto",
    description: "Active les menus optimises par objectifs.",
    defaultEnabled: true,
    group: "client_features",
    routeTargets: ["/budget-auto"],
  },
  {
    name: "abonnement",
    label: "Abonnement",
    description: "Active les repas recurrents planifies.",
    defaultEnabled: true,
    group: "client_features",
    dependsOn: ["livraison"],
    routeTargets: ["/abonnement"],
  },
  {
    name: "tok-one",
    label: "Tok One",
    description: "Active la page d'abonnement premium Tok One.",
    defaultEnabled: true,
    group: "client_features",
    routeTargets: ["/tok-one"],
  },
  {
    name: "points-cadeau",
    label: "Points cadeau",
    description: "Active la page de fidelite et d'utilisation des points cadeau.",
    defaultEnabled: true,
    group: "client_features",
    routeTargets: ["/points-cadeau"],
  },
  {
    name: "campagnes-pub",
    label: "Campagnes pub",
    description: "Active les mises en avant sponsorisees et la gestion des campagnes.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
  },
  {
    name: "performances",
    label: "Performances",
    description: "Active les vues de performance et comparaison restaurateur.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
  },
  {
    name: "dashboard-restaurateur",
    label: "Dashboard restaurateur",
    description: "Expose l'entree du dashboard restaurateur et ses sections internes.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    critical: true,
  },
  {
    name: "dashboard-overview",
    label: "Dashboard: Vue d'ensemble",
    description: "Affiche la page d'accueil du dashboard restaurateur.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur"],
    routeTargets: ["/dashboard"],
  },
  {
    name: "dashboard-advisor",
    label: "Dashboard: Assistant IA",
    description: "Expose l'assistant IA du dashboard restaurateur.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur"],
    routeTargets: ["/dashboard/advisor"],
  },
  {
    name: "dashboard-restaurant",
    label: "Dashboard: Mon restaurant",
    description: "Expose l'edition de la fiche restaurant et des capacites locales.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur"],
    routeTargets: ["/dashboard/restaurant"],
  },
  {
    name: "dashboard-menu",
    label: "Dashboard: Menu",
    description: "Expose la gestion du menu restaurateur.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur"],
    routeTargets: ["/dashboard/menu"],
  },
  {
    name: "dashboard-photos",
    label: "Dashboard: Photos",
    description: "Expose la gestion des photos du restaurant.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur"],
    routeTargets: ["/dashboard/photos"],
  },
  {
    name: "dashboard-commandes",
    label: "Dashboard: Commandes",
    description: "Expose la vue commandes du dashboard restaurateur.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur", "commandes"],
    routeTargets: ["/dashboard/commandes"],
  },
  {
    name: "dashboard-reservations",
    label: "Dashboard: Reservations",
    description: "Expose la vue reservations du dashboard restaurateur.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur", "reservation"],
    routeTargets: ["/dashboard/reservations"],
  },
  {
    name: "dashboard-recommandations",
    label: "Dashboard: Recommandations",
    description: "Expose les recommandations operationnelles cote restaurateur.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur"],
    routeTargets: ["/dashboard/recommandations"],
  },
  {
    name: "dashboard-performances",
    label: "Dashboard: Performances",
    description: "Expose la page performances du dashboard restaurateur.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur", "performances"],
    routeTargets: ["/dashboard/performances", "/dashboard/compta"],
  },
  {
    name: "dashboard-comparaison",
    label: "Dashboard: Comparaison",
    description: "Expose la page comparaison du dashboard restaurateur.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur", "performances"],
    routeTargets: ["/dashboard/comparaison"],
  },
  {
    name: "dashboard-avis",
    label: "Dashboard: Avis",
    description: "Expose la vue d'avis clients du dashboard restaurateur.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur"],
    routeTargets: ["/dashboard/avis"],
  },
  {
    name: "dashboard-campagne-overview",
    label: "Dashboard: Campagnes",
    description: "Expose la vue synthese des campagnes publicitaires.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur", "campagnes-pub"],
    routeTargets: ["/dashboard/campagne-overview"],
  },
  {
    name: "dashboard-reseaux-sociaux",
    label: "Dashboard: Reseaux sociaux",
    description: "Expose les activations reseaux sociaux cote restaurateur.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur", "campagnes-pub"],
    routeTargets: ["/dashboard/reseaux-sociaux"],
  },
  {
    name: "dashboard-actualites",
    label: "Dashboard: Actualites",
    description: "Expose la publication et le suivi des posts du fil social.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur"],
    routeTargets: ["/dashboard/actualites"],
  },
  {
    name: "dashboard-campagnes",
    label: "Dashboard: Campagnes avancees",
    description: "Expose l'edition complete des campagnes sponsorisees.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur", "campagnes-pub"],
    routeTargets: ["/dashboard/campagnes"],
  },
  {
    name: "dashboard-factures",
    label: "Dashboard: Factures",
    description: "Expose la vue factures et paiements restaurateur.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur"],
    routeTargets: ["/dashboard/factures", "/dashboard/factures/entrees", "/dashboard/factures/sorties"],
  },
  {
    name: "dashboard-factures-parametres",
    label: "Dashboard: Parametres de facturation",
    description: "Expose les parametres de facturation restaurateur.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur"],
    routeTargets: ["/dashboard/factures/parametres"],
  },
  {
    name: "dashboard-offres",
    label: "Dashboard: Anti-gaspi",
    description: "Expose la gestion anti-gaspi cote restaurateur.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur", "anti-gaspi"],
    routeTargets: ["/dashboard/offres"],
  },
  {
    name: "dashboard-ventes-flash",
    label: "Dashboard: Ventes flash",
    description: "Expose la gestion des ventes flash cote restaurateur.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur", "ventes-flash"],
    routeTargets: ["/dashboard/ventes-flash"],
  },
  {
    name: "dashboard-formules",
    label: "Dashboard: Formules",
    description: "Expose la gestion des formules et menus.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur"],
    routeTargets: ["/dashboard/formules"],
  },
  {
    name: "dashboard-service",
    label: "Dashboard: Pilotage de service",
    description: "Expose le pilotage reservations et livraison du restaurant.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur"],
    routeTargets: ["/dashboard/service"],
  },
  {
    name: "dashboard-plan-salle",
    label: "Dashboard: Plan de salle",
    description: "Expose le plan de salle, l'edition des tables et l'affectation des reservations.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur", "reservation"],
    routeTargets: ["/dashboard/plan-salle"],
  },
  {
    name: "dashboard-pack",
    label: "Dashboard: Pack de lancement",
    description: "Expose la page de gestion du pack de lancement restaurant.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur"],
    routeTargets: ["/dashboard/pack"],
  },
  {
    name: "dashboard-support",
    label: "Dashboard: Support",
    description: "Expose l'aide et le support restaurateur.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur"],
    routeTargets: ["/dashboard/support"],
  },
  {
    name: "dashboard-promotions",
    label: "Dashboard: Promotions",
    description: "Expose la page promotions restaurateur.",
    defaultEnabled: true,
    group: "restaurant_dashboard",
    dependsOn: ["dashboard-restaurateur"],
    routeTargets: ["/dashboard/promotions"],
  },
  {
    name: "espace-livreur",
    label: "Dashboard coursier",
    description: "Expose l'entree du dashboard coursier et ses routes dediees.",
    defaultEnabled: true,
    group: "courier",
    critical: true,
  },
  {
    name: "courier-home",
    label: "Coursier: Vue d'ensemble",
    description: "Expose la page d'accueil du dashboard livreur.",
    defaultEnabled: true,
    group: "courier",
    dependsOn: ["espace-livreur"],
    routeTargets: ["/courier"],
  },
  {
    name: "courier-jobs",
    label: "Coursier: Missions",
    description: "Expose la gestion des missions coursier.",
    defaultEnabled: true,
    group: "courier",
    dependsOn: ["espace-livreur"],
    routeTargets: ["/courier/jobs"],
  },
  {
    name: "courier-earnings",
    label: "Coursier: Gains",
    description: "Expose le suivi des gains coursier.",
    defaultEnabled: true,
    group: "courier",
    dependsOn: ["espace-livreur"],
    routeTargets: ["/courier/earnings"],
  },
  {
    name: "courier-profile",
    label: "Coursier: Profil",
    description: "Expose le profil coursier et ses validations.",
    defaultEnabled: true,
    group: "courier",
    dependsOn: ["espace-livreur"],
    routeTargets: ["/courier/profile"],
  },
  {
    name: "admin-restaurants",
    label: "Admin: Restaurants",
    description: "Expose la gestion admin des restaurants.",
    defaultEnabled: true,
    group: "admin_tools",
    routeTargets: ["/admin/restaurants"],
  },
  {
    name: "admin-utilisateurs",
    label: "Admin: Utilisateurs",
    description: "Expose la gestion admin des utilisateurs et des roles.",
    defaultEnabled: true,
    group: "admin_tools",
    routeTargets: ["/admin/utilisateurs"],
  },
  {
    name: "admin-avis",
    label: "Admin: Avis",
    description: "Expose la moderation des avis.",
    defaultEnabled: true,
    group: "admin_tools",
    routeTargets: ["/admin/avis"],
  },
  {
    name: "admin-catalog",
    label: "Admin: Catalogue",
    description: "Expose le catalogue central et ses taxonomies.",
    defaultEnabled: true,
    group: "admin_tools",
    routeTargets: ["/admin/catalog"],
  },
  {
    name: "admin-loyalty",
    label: "Admin: Fidelite",
    description: "Expose la configuration fidelite et abonnement.",
    defaultEnabled: true,
    group: "admin_tools",
    routeTargets: ["/admin/loyalty"],
  },
  {
    name: "admin-drops",
    label: "Admin: Drops",
    description: "Expose la gestion des drops et ventes flash admin.",
    defaultEnabled: true,
    group: "admin_tools",
    routeTargets: ["/admin/drops"],
  },
  {
    name: "admin-notifications",
    label: "Admin: Notifications",
    description: "Expose la gestion des notifications et campagnes.",
    defaultEnabled: true,
    group: "admin_tools",
    routeTargets: ["/admin/notifications"],
  },
  {
    name: "admin-actualites",
    label: "Admin: Actualites sociales",
    description: "Expose la moderation du fil social.",
    defaultEnabled: true,
    group: "admin_tools",
    routeTargets: ["/admin/actualites"],
  },
  {
    name: "admin-audit",
    label: "Admin: Audit",
    description: "Expose les journaux d'audit et les executions edge.",
    defaultEnabled: true,
    group: "admin_tools",
    routeTargets: ["/admin/audit"],
  },
  {
    name: "admin-packs",
    label: "Admin: Packs de lancement",
    description: "Expose la gestion admin des packs de lancement restaurateurs et le suivi des services.",
    defaultEnabled: true,
    group: "admin_tools",
    routeTargets: ["/admin/packs"],
  },
  {
    name: "admin-compta",
    label: "Admin: Comptabilite",
    description: "Expose l'outil de rapprochement financier et le suivi des commissions 10% / reversements 90%.",
    defaultEnabled: true,
    group: "admin_tools",
    routeTargets: ["/admin/compta", "/admin/compta/entrees", "/admin/compta/sorties"],
  },
];

const FEATURE_DEFINITION_MAP = new Map(FEATURE_DEFINITIONS.map((definition) => [definition.name, definition]));
const DEFAULT_FLAG_MAP = new Map(FEATURE_DEFINITIONS.map((definition) => [definition.name, definition]));

export const FEATURE_ROUTE_DEFINITIONS = FEATURE_DEFINITIONS.flatMap((definition) =>
  (definition.routeTargets || []).map((routeTarget) => ({
    routeTarget,
    featureName: definition.name,
  })),
);

function toRouteRegex(routeTarget: string) {
  const escaped = routeTarget
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/:([^/]+)/g, "[^/]+");
  return new RegExp(`^${escaped}$`);
}

export function getFeatureDefinition(featureName: string): FeatureFlagDefinition | null {
  return FEATURE_DEFINITION_MAP.get(featureName) || null;
}

export function getFeatureNameForRoute(pathname: string): string | null {
  const normalizedPath = pathname === "/" ? pathname : pathname.replace(/\/+$/, "");
  const match = FEATURE_ROUTE_DEFINITIONS.find(({ routeTarget }) => toRouteRegex(routeTarget).test(normalizedPath));
  return match?.featureName || null;
}

function resolveFeatureState(
  definition: Pick<FeatureFlagDefinition, "name" | "dependsOn" | "requiresAnyOf">,
  explicitEnabledByName: Map<string, boolean>,
  resolutionByName: Map<string, FeatureResolution>,
  visiting: Set<string>,
): FeatureResolution {
  if (resolutionByName.has(definition.name)) {
    return resolutionByName.get(definition.name)!;
  }

  if (visiting.has(definition.name)) {
    return { effectiveEnabled: false, blockedBy: [definition.name] };
  }

  visiting.add(definition.name);

  const explicitEnabled = explicitEnabledByName.get(definition.name) ?? false;
  const blockedBy = new Set<string>();

  if (!explicitEnabled) {
    blockedBy.add(definition.name);
  }

  for (const dependency of definition.dependsOn || []) {
    const dependencyDefinition = FEATURE_DEFINITION_MAP.get(dependency);
    if (!dependencyDefinition) {
      blockedBy.add(dependency);
      continue;
    }

    const dependencyState = resolveFeatureState(dependencyDefinition, explicitEnabledByName, resolutionByName, visiting);
    if (!dependencyState.effectiveEnabled) {
      blockedBy.add(dependency);
    }
  }

  const anyDependencies = definition.requiresAnyOf || [];
  if (anyDependencies.length > 0) {
    const hasEnabledDependency = anyDependencies.some((dependency) => {
      const dependencyDefinition = FEATURE_DEFINITION_MAP.get(dependency);
      if (!dependencyDefinition) return false;
      return resolveFeatureState(dependencyDefinition, explicitEnabledByName, resolutionByName, visiting).effectiveEnabled;
    });

    if (!hasEnabledDependency) {
      anyDependencies.forEach((dependency) => blockedBy.add(dependency));
    }
  }

  const result = {
    effectiveEnabled: explicitEnabled && blockedBy.size === 0,
    blockedBy: Array.from(blockedBy),
  };

  visiting.delete(definition.name);
  resolutionByName.set(definition.name, result);
  return result;
}

export function resolveFlags(rows: FeatureFlagRow[]): FeatureFlag[] {
  const rowsByName = new Map((rows || []).map((row) => [String(row.name || ""), row]));
  const explicitEnabledByName = new Map<string, boolean>();

  for (const definition of FEATURE_DEFINITIONS) {
    const row = rowsByName.get(definition.name);
    explicitEnabledByName.set(definition.name, row?.is_active ?? definition.defaultEnabled);
  }

  const resolutionByName = new Map<string, FeatureResolution>();

  const defaultFlags = FEATURE_DEFINITIONS.map((definition) => {
    const row = rowsByName.get(definition.name);
    const resolution = resolveFeatureState(definition, explicitEnabledByName, resolutionByName, new Set<string>());
    const explicitEnabled = explicitEnabledByName.get(definition.name) ?? definition.defaultEnabled;

    return {
      ...definition,
      id: row?.id || definition.name,
      label: row?.label || definition.label,
      description: row?.description || definition.description,
      isActive: explicitEnabled,
      explicitEnabled,
      effectiveEnabled: resolution.effectiveEnabled,
      blockedBy: resolution.blockedBy,
    } satisfies FeatureFlag;
  });

  const customFlags = (rows || [])
    .filter((row) => !DEFAULT_FLAG_MAP.has(String(row.name || "")))
    .map((row) => {
      const explicitEnabled = !!row.is_active;
      return {
        id: row.id || String(row.name || ""),
        name: String(row.name || ""),
        label: row.label || String(row.name || ""),
        description: row.description || "",
        defaultEnabled: false,
        group: "custom" as const,
        isActive: explicitEnabled,
        explicitEnabled,
        effectiveEnabled: explicitEnabled,
        blockedBy: explicitEnabled ? [] : [String(row.name || "")],
      } satisfies FeatureFlag;
    });

  return [...defaultFlags, ...customFlags];
}

export function rehydrateFlagRows(flags: FeatureFlag[], overrides?: Map<string, boolean>): FeatureFlagRow[] {
  return flags.map((flag) => ({
    id: flag.id,
    name: flag.name,
    label: flag.label,
    description: flag.description,
    is_active: overrides?.has(flag.name) ? overrides.get(flag.name)! : flag.explicitEnabled,
  }));
}

export function buildSafeFallbackFlags() {
  return resolveFlags(
    FEATURE_DEFINITIONS.map((definition) => ({
      id: definition.name,
      name: definition.name,
      label: definition.label,
      description: definition.description,
      is_active: false,
    })),
  );
}

export function buildFeatureMap(flags: FeatureFlag[]) {
  return new Map(flags.map((flag) => [flag.name, flag]));
}

export function isFeatureEnabled(featureMap: Map<string, FeatureFlag>, featureName: string) {
  return featureMap.get(featureName)?.effectiveEnabled ?? false;
}

export function isFeatureExplicitlyEnabled(featureMap: Map<string, FeatureFlag>, featureName: string) {
  return featureMap.get(featureName)?.explicitEnabled ?? false;
}

export const FEATURE_ROUTE_MAP: Record<string, string> = Object.fromEntries(
  FEATURE_DEFINITIONS.flatMap((definition) =>
    (definition.routeTargets || []).map((routeTarget) => [definition.name, routeTarget]),
  ),
);
