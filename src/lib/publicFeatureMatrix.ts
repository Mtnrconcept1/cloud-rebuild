import { FEATURE_DEFINITIONS } from "@/lib/featureCatalog";

export type PublicFeatureMatrixRow = {
  audience: "Client" | "Restaurateur";
  feature: string;
  availability: string;
  routes: string[];
  helpSection: string;
  legalDocument: "/cgu" | "/conditions-restaurateurs";
};

const publicFlagRows: PublicFeatureMatrixRow[] = FEATURE_DEFINITIONS
  .filter((feature) => feature.routeTargets?.some((route) => !route.startsWith("/dashboard")))
  .map((feature) => ({
    audience: "Client" as const,
    feature: feature.label,
    availability: feature.defaultEnabled ? "Disponible selon le restaurant et la zone" : "Déploiement progressif — selon activation TOK",
    routes: feature.routeTargets || [],
    helpSection: feature.group === "journeys" ? "Commandes et réservations" : "Fonctionnalités",
    legalDocument: "/cgu" as const,
  }));

const restaurantCoreRows: PublicFeatureMatrixRow[] = [
  {
    audience: "Restaurateur",
    feature: "Packs Fair Growth (Starter, Business, Premium, Elite)",
    availability: "Souscription après approbation du dossier",
    routes: ["/packs-restaurateur", "/restaurateurs/geneve"],
    helpSection: "Restaurateurs",
    legalDocument: "/conditions-restaurateurs",
  },
  {
    audience: "Restaurateur",
    feature: "Google Business et acquisition directe",
    availability: "Audit et raccordement accompagnés",
    routes: ["/restaurateurs/google-business", "/restaurateurs/alternative-commission-couvert"],
    helpSection: "Restaurateurs",
    legalDocument: "/conditions-restaurateurs",
  },
];

export const PUBLIC_FEATURE_MATRIX: readonly PublicFeatureMatrixRow[] = [
  ...publicFlagRows,
  ...restaurantCoreRows,
];
