export type GuideChapter = {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  steps: readonly string[];
  routes: readonly string[];
};

export type GuideScreenshot = {
  src: string;
  alt: string;
  title: string;
  caption: string;
  audiences: readonly ("restaurant" | "buyer")[];
};

export const RESTAURANT_GUIDE_CHAPTERS: readonly GuideChapter[] = [
  {
    id: "demarrage",
    eyebrow: "01 · Premiers pas",
    title: "Prendre en main l’espace restaurateur",
    summary: "Configurez l’établissement, contrôlez les informations publiques et retrouvez les priorités du jour depuis le tableau de bord.",
    steps: [
      "Vérifiez le nom, les coordonnées, les horaires, les services et les moyens de paiement de l’établissement.",
      "Ajoutez une image principale et contrôlez l’aperçu public avant publication.",
      "Utilisez l’accueil comme poste de pilotage pour les commandes, réservations, alertes et indicateurs utiles.",
    ],
    routes: ["/dashboard", "/dashboard/restaurant"],
  },
  {
    id: "carte-medias",
    eyebrow: "02 · Carte & médias",
    title: "Gérer la carte, les plats et les photos",
    summary: "Structurez les catégories, les prix, la disponibilité et les visuels qui alimentent la fiche du restaurant.",
    steps: [
      "Créez les catégories dans l’ordre de lecture souhaité, puis ajoutez les plats et leurs options.",
      "Indiquez les allergènes, la disponibilité et les informations utiles avant d’activer un produit.",
      "Prévisualisez les photos et contrôlez leur cadrage sur mobile comme sur ordinateur.",
    ],
    routes: ["/dashboard/menu", "/dashboard/photos"],
  },
  {
    id: "operations",
    eyebrow: "03 · Opérations",
    title: "Piloter commandes, réservations et service",
    summary: "Traitez les flux du jour avec des statuts explicites et une organisation de salle cohérente.",
    steps: [
      "Acceptez ou refusez rapidement les nouvelles commandes, puis faites progresser leur statut jusqu’à la remise.",
      "Confirmez les réservations, attribuez les tables et surveillez les périodes de service.",
      "Configurez le plan de salle et les paramètres de service avant les heures de pointe.",
    ],
    routes: ["/dashboard/commandes", "/dashboard/reservations", "/dashboard/service", "/dashboard/plan-salle"],
  },
  {
    id: "offres",
    eyebrow: "04 · Vente",
    title: "Créer offres, promotions et formules",
    summary: "Animez les ventes sans perdre la maîtrise des dates, quantités, conditions et marges.",
    steps: [
      "Définissez une offre avec une période, un stock et des conditions faciles à comprendre.",
      "Utilisez les ventes flash pour un besoin court et les formules pour une proposition récurrente.",
      "Relisez toujours l’aperçu client et la date de fin avant activation.",
    ],
    routes: ["/dashboard/offres", "/dashboard/ventes-flash", "/dashboard/formules", "/dashboard/promotions"],
  },
  {
    id: "communication",
    eyebrow: "05 · Relation client",
    title: "Campagnes, actualités, réseaux sociaux et CRM",
    summary: "Préparez les contenus, choisissez les audiences et gardez une validation humaine avant toute diffusion externe.",
    steps: [
      "Créez une campagne à partir d’un objectif concret et contrôlez le visuel, le texte et le canal.",
      "Centralisez les contacts et segments utiles dans le CRM sans exporter de données inutiles.",
      "Publiez une actualité ou un contenu social uniquement après vérification de l’aperçu et des droits média.",
    ],
    routes: ["/dashboard/campagnes", "/dashboard/campaign-studio", "/dashboard/actualites", "/dashboard/reseaux-sociaux", "/dashboard/crm"],
  },
  {
    id: "performance",
    eyebrow: "06 · Progression",
    title: "Lire les performances et agir",
    summary: "Transformez les indicateurs, avis et recommandations en actions concrètes pour l’établissement.",
    steps: [
      "Commencez par la période et le volume observé avant d’interpréter une évolution.",
      "Comparez des périodes équivalentes et distinguez chiffre d’affaires, panier moyen, commandes et réservations.",
      "Répondez aux avis avec des faits et utilisez le conseiller comme aide à la décision, pas comme validation automatique.",
    ],
    routes: ["/dashboard/performances", "/dashboard/comparaison", "/dashboard/avis", "/dashboard/advisor"],
  },
  {
    id: "gestion",
    eyebrow: "07 · Gestion",
    title: "Facturation, notifications, support et connexions",
    summary: "Suivez les flux financiers du restaurant, les alertes opérationnelles et les accès partenaires autorisés.",
    steps: [
      "Contrôlez entrées, sorties, factures et paramètres de facturation à partir des périodes concernées.",
      "Traitez les notifications importantes et joignez les références utiles quand vous contactez le support.",
      "Dans TOK Connect, n’accordez à un partenaire que les droits nécessaires et révoquez l’accès devenu inutile.",
    ],
    routes: [
      "/dashboard/factures",
      "/dashboard/factures/entrees",
      "/dashboard/factures/sorties",
      "/dashboard/factures/parametres",
      "/dashboard/mon-compte-facturation",
      "/dashboard/notifications",
      "/dashboard/support",
      "/dashboard/tok-connect",
    ],
  },
] as const;

export const BUYER_GUIDE_CHAPTERS: readonly GuideChapter[] = [
  {
    id: "vision",
    eyebrow: "01 · Vue d’ensemble",
    title: "Comprendre les surfaces de la plateforme",
    summary: "TOK réunit découverte client, exploitation restaurant, livraison, prospection commerciale, marketing et administration dans une même application segmentée par rôle.",
    steps: [
      "Commencez par la carte des surfaces et leurs contrôles d’accès.",
      "Utilisez l’inventaire des routes pour vérifier la couverture de chaque parcours.",
      "Consultez ensuite les outils serveur et intégrations pour relier interface et capacités opérationnelles.",
    ],
    routes: ["/", "/espaces", "/a-propos"],
  },
  {
    id: "client",
    eyebrow: "02 · Expérience client",
    title: "Découverte, réservation, commande et fidélité",
    summary: "Le parcours client va de la recherche d’un restaurant au suivi d’une commande, avec compte, avis, actualités, offres et avantages.",
    steps: [
      "Recherchez un établissement, ouvrez sa fiche puis choisissez réservation ou commande.",
      "Contrôlez le panier, le paiement, la confirmation et le suivi après achat.",
      "Parcourez les fonctions de fidélité, abonnements, mémoire et notifications.",
    ],
    routes: ["/recherche", "/restaurant/:id", "/panier", "/commandes", "/reservations", "/mon-espace"],
  },
  {
    id: "restaurant",
    eyebrow: "03 · Exploitation restaurant",
    title: "Du menu à la comptabilité",
    summary: "L’espace restaurateur couvre le quotidien opérationnel, la relation client, la croissance et le suivi financier.",
    steps: [
      "Vérifiez la couverture des outils de carte, réservation, commande et service.",
      "Examinez les parcours marketing, CRM, performance, avis et médias.",
      "Contrôlez enfin facturation, support, paramètres et connexions partenaires.",
    ],
    routes: ["/dashboard", "/dashboard/menu", "/dashboard/commandes", "/dashboard/campagnes", "/dashboard/factures"],
  },
  {
    id: "livraison-commercial",
    eyebrow: "04 · Opérations terrain",
    title: "Livraison et prospection commerciale",
    summary: "Les espaces coursier et commercial disposent de parcours séparés pour les missions, gains, prospects, démonstrations et suivi d’activité.",
    steps: [
      "Le coursier retrouve les missions, alertes, gains et paramètres de profil.",
      "Le commercial suit la prospection, les démonstrations et la comptabilité de son activité.",
      "Les rôles restent séparés et les routes protégées selon le contexte actif.",
    ],
    routes: ["/courier", "/courier/jobs", "/courier/earnings", "/commercial", "/commercial/demo-live"],
  },
  {
    id: "admin",
    eyebrow: "05 · Administration",
    title: "Superviser la plateforme et ses risques",
    summary: "Le back-office couvre les utilisateurs, restaurants, catalogue, fidélité, opérations, comptabilité, incidents, audit, IA et intégrations.",
    steps: [
      "Utilisez les pages de supervision pour examiner l’état global avant toute action sensible.",
      "Traitez commandes, réservations et incidents avec une trace d’audit exploitable.",
      "Réservez les changements de plateforme, finance et automatisation aux rôles autorisés.",
    ],
    routes: ["/admin", "/admin/platform", "/admin/commandes-reservations", "/admin/audit", "/admin/guardian"],
  },
  {
    id: "marketing",
    eyebrow: "06 · Marketing",
    title: "Planifier, approuver et mesurer les campagnes",
    summary: "L’espace marketing est isolé et organise préparation, approbation, création visuelle, diffusion contrôlée et mesure.",
    steps: [
      "Préparez les éléments d’une campagne et leurs variantes avant approbation.",
      "Vérifiez les droits, canaux et budgets avant une action externe.",
      "Distinguez toujours une prévisualisation, une publication demandée et une publication réellement confirmée.",
    ],
    routes: ["/marketing/login", "/marketing"],
  },
  {
    id: "architecture",
    eyebrow: "07 · Architecture & diligence",
    title: "Relier routes, outils serveur et intégrations",
    summary: "L’annexe exhaustive permet de rechercher chaque route frontend et chaque outil serveur indexé depuis le dépôt.",
    steps: [
      "Filtrez par surface pour examiner le périmètre fonctionnel.",
      "Passez en mode Outils serveur pour voir les fonctions, actions et intégrations associées.",
      "Considérez cet inventaire comme une preuve statique du code, distincte de l’état réellement déployé.",
    ],
    routes: ["/tok-connect", "/tok-connect/developer"],
  },
] as const;

export const GUIDE_SCREENSHOTS: readonly GuideScreenshot[] = [
  {
    src: "/images/user-guide/accueil-mobile.png",
    alt: "Accueil mobile TOK avec recherche de restaurants",
    title: "Accueil et recherche rapide",
    caption: "Le point de départ public : localisation, recherche et accès aux restaurants.",
    audiences: ["restaurant", "buyer"],
  },
  {
    src: "/images/user-guide/recherche-mobile.png",
    alt: "Écran de recherche TOK avec filtres de catégories",
    title: "Recherche et filtres client",
    caption: "Les filtres rendent visibles les cuisines, budgets, zones et modes de service.",
    audiences: ["buyer"],
  },
  {
    src: "/images/user-guide/dashboard-restaurateur.png",
    alt: "Tableau de bord restaurateur TOK en mode démonstration",
    title: "Tableau de bord restaurateur",
    caption: "Une vue opérationnelle sur commandes, réservations, indicateurs et actions rapides.",
    audiences: ["restaurant", "buyer"],
  },
  {
    src: "/images/user-guide/abonnement-mobile.png",
    alt: "Planification d’un abonnement repas dans TOK",
    title: "Planification d’abonnement",
    caption: "Exemple d’outil client spécialisé avec progression et actions par étape.",
    audiences: ["buyer"],
  },
  {
    src: "/images/user-guide/zero-attente-mobile.png",
    alt: "Parcours Zéro attente dans TOK",
    title: "Réservation Zéro attente",
    caption: "Un parcours guidé qui associe réservation, précommande et service.",
    audiences: ["buyer"],
  },
] as const;

export const SURFACE_LABELS: Record<string, string> = {
  public: "Public",
  "client-account": "Compte client",
  restaurant: "Restaurateur",
  courier: "Coursier",
  commercial: "Commercial",
  marketing: "Marketing",
  admin: "Administration",
  system: "Système",
};

export const RESTAURANT_PUBLIC_ROUTES = new Set([
  "/auth",
  "/auth/demo",
  "/espaces",
  "/packs-restaurateur",
  "/conditions-restaurateurs",
  "/restaurateurs/geneve",
  "/restaurateurs/:city",
  "/restaurateurs/google-business",
  "/restaurateurs/alternative-commission-couvert",
  "/contact",
  "/aide",
]);

export function isRestaurantGuideRoute(route: { surface: string; path: string }) {
  return route.surface === "restaurant" || RESTAURANT_PUBLIC_ROUTES.has(route.path);
}
