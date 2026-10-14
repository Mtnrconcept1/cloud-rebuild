export type GuideChapter = {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  steps: readonly string[];
  routes: readonly string[];
  screenshots?: readonly GuideScreenshot[];
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
    id: "reussite-et-performances",
    eyebrow: "01 · Le quotidien",
    title: "Reussite et performances",
    summary: "Retrouvez ce qui demande votre attention et suivez l’évolution de votre établissement.",
    steps: [
      "Depuis « Vue d'ensemble », consultez les informations importantes de la journée et les dernières activités.",
      "Ouvrez « Commandes et retraits » pour suivre les demandes reçues et leur préparation.",
      "Dans « Reservations », vérifiez les demandes et les créneaux avant chaque service.",
      "Avec « Performances » et « Comparaison », suivez l’évolution de votre activité sur des périodes comparables.",
      "Consultez « Avis clients » pour lire les retours et répondre avec attention. « Assistant IA » peut vous aider à réfléchir aux prochaines actions.",
    ],
    routes: ["/dashboard", "/dashboard/commandes", "/dashboard/reservations", "/dashboard/performances", "/dashboard/comparaison", "/dashboard/avis", "/dashboard/advisor"],
    screenshots: [
      {
        src: "/images/user-guide/dashboard-restaurateur.png",
        alt: "Vue d’ensemble du tableau de bord restaurateur TOK",
        title: "Vue d'ensemble",
        caption: "Capture du véritable tableau de bord restaurateur, réalisée avec des données de démonstration.",
        audiences: ["restaurant"],
      },
    ],
  },
  {
    id: "marketing",
    eyebrow: "02 · Faire connaître votre restaurant",
    title: "Marketing",
    summary: "Présentez vos nouveautés et préparez vos communications directement dans TOK.",
    steps: [
      "Dans « Campagnes », préparez une communication et vérifiez son texte, son visuel et sa période avant de la diffuser.",
      "Ouvrez « Campaign Studio IA » ou « Studio Marketing » pour préparer des visuels lorsque ces outils sont disponibles sur votre abonnement.",
      "Avec « Actualités », partagez une nouveauté, un événement ou une information utile à vos clients.",
      "Utilisez « Promotions » pour mettre en avant une offre et « CRM clients » pour retrouver les informations clients auxquelles vous avez droit.",
      "Si vos comptes sont reliés, contrôlez le résultat dans « Reseaux sociaux » avant et après publication.",
    ],
    routes: ["/dashboard/campagnes", "/dashboard/campaign-studio", "/dashboard/photos", "/dashboard/actualites", "/dashboard/promotions", "/dashboard/crm", "/dashboard/reseaux-sociaux"],
    screenshots: [
      {
        src: "/images/user-guide/routes/actualites.png",
        alt: "Fil d’actualités TOK tel qu’il apparaît aux clients",
        title: "Actualités",
        caption: "Exemple réel du fil que vos clients peuvent consulter après la publication d’une actualité.",
        audiences: ["restaurant"],
      },
    ],
  },
  {
    id: "paiements",
    eyebrow: "03 · Votre abonnement et vos factures",
    title: "Paiements",
    summary: "Gardez une vue claire sur votre abonnement et les documents comptables disponibles.",
    steps: [
      "Ouvrez « Mon compte/Facturation » pour retrouver les informations de votre abonnement et vos moyens de paiement.",
      "Dans « Comptabilité & factures », consultez vos factures et choisissez la période qui vous intéresse.",
      "Avant de signaler un écart, comparez les montants et les dates indiqués avec vos relevés.",
      "Si vous ne retrouvez pas une facture ou un règlement, contactez « Aide et support » avec sa référence.",
    ],
    routes: ["/dashboard/mon-compte-facturation", "/dashboard/factures", "/dashboard/support"],
    screenshots: [
      {
        src: "/images/user-guide/features/packs-restaurateur.png",
        alt: "Présentation des packs destinés aux restaurateurs TOK",
        title: "Offres restaurateur",
        caption: "Capture de la présentation des offres TOK. Pour vos factures personnelles, utilisez « Mon compte/Facturation » dans votre espace.",
        audiences: ["restaurant"],
      },
    ],
  },
  {
    id: "mon-offre",
    eyebrow: "04 · Vos services partenaires",
    title: "Mon offre",
    summary: "Retrouvez les services complémentaires proposés à votre établissement.",
    steps: [
      "Ouvrez « Tok Connect » pour consulter les possibilités de connexion proposées à votre restaurant.",
      "Vérifiez les informations affichées avant d’autoriser un service partenaire.",
      "Conservez uniquement les connexions dont votre établissement a réellement besoin.",
      "Si un outil n’apparaît pas, vérifiez les services compris dans votre offre ou contactez le support.",
    ],
    routes: ["/dashboard/tok-connect"],
    screenshots: [
      {
        src: "/images/user-guide/features/tok-connect.png",
        alt: "Présentation du service TOK Connect",
        title: "Tok Connect",
        caption: "Capture de la présentation de TOK Connect. Les connexions propres à votre établissement se gèrent depuis votre espace.",
        audiences: ["restaurant"],
      },
    ],
  },
  {
    id: "page-du-restaurant",
    eyebrow: "05 · Votre vitrine et vos offres",
    title: "Page du restaurant",
    summary: "Mettez à jour les informations et les offres que vos clients découvrent sur TOK.",
    steps: [
      "Dans « Mon restaurant », vérifiez votre nom, votre adresse, vos horaires et vos informations de contact.",
      "Ouvrez « Menu » pour ajouter ou modifier vos plats, leurs prix et leur disponibilité.",
      "Avec « Anti-gaspi », « Ventes flash » et « Formules », préparez les offres qui correspondent à votre activité.",
      "Organisez l’accueil des clients grâce à « Pilotage de service » et « Plan de salle ».",
      "Avant de terminer, consultez le rendu visible par vos clients et relisez les conditions de chaque offre.",
    ],
    routes: ["/dashboard/restaurant", "/dashboard/menu", "/dashboard/offres", "/dashboard/ventes-flash", "/dashboard/formules", "/dashboard/service", "/dashboard/plan-salle"],
    screenshots: [
      {
        src: "/images/user-guide/routes/ventes-flash.png",
        alt: "Page des ventes flash visible par les clients TOK",
        title: "Ventes flash",
        caption: "Capture de la présentation des ventes flash côté client, utile pour vérifier la visibilité d’une offre.",
        audiences: ["restaurant"],
      },
      {
        src: "/images/user-guide/routes/anti-gaspi.png",
        alt: "Page des offres anti-gaspi visible par les clients TOK",
        title: "Anti-gaspi",
        caption: "Capture de la page anti-gaspi côté client. Les offres se préparent dans votre espace restaurateur.",
        audiences: ["restaurant"],
      },
    ],
  },
  {
    id: "support",
    eyebrow: "06 · Rester informé et demander de l’aide",
    title: "Support",
    summary: "Retrouvez les messages importants et une aide adaptée à votre situation.",
    steps: [
      "Consultez régulièrement « Notifications » pour ne pas manquer une information concernant votre restaurant.",
      "Dans « Aide et support », expliquez votre demande et indiquez le restaurant concerné.",
      "Pour une réservation, une commande ou une facture, ajoutez sa référence afin de faciliter la recherche.",
      "Vérifiez les réponses reçues et conservez les informations utiles pour la suite.",
    ],
    routes: ["/dashboard/notifications", "/dashboard/support", "/dashboard/guide"],
    screenshots: [
      {
        src: "/images/user-guide/features/centre-aide.png",
        alt: "Centre d’aide TOK affiché sur mobile",
        title: "Aide et support",
        caption: "Capture du centre d’aide TOK. L’assistance liée à votre restaurant reste accessible dans votre tableau de bord.",
        audiences: ["restaurant"],
      },
    ],
  },
] as const;

export const RESTAURANT_GUIDE_ROUTE_LABELS: Record<string, string> = {
  "/dashboard": "Vue d'ensemble",
  "/dashboard/advisor": "Assistant IA",
  "/dashboard/commandes": "Commandes et retraits",
  "/dashboard/reservations": "Reservations",
  "/dashboard/performances": "Performances",
  "/dashboard/comparaison": "Comparaison",
  "/dashboard/avis": "Avis clients",
  "/dashboard/campagnes": "Campagnes",
  "/dashboard/campaign-studio": "Campaign Studio IA",
  "/dashboard/crm": "CRM clients",
  "/dashboard/promotions": "Promotions",
  "/dashboard/reseaux-sociaux": "Reseaux sociaux",
  "/dashboard/photos": "Studio Marketing",
  "/dashboard/actualites": "Actualités",
  "/dashboard/mon-compte-facturation": "Mon compte/Facturation",
  "/dashboard/factures": "Comptabilité & factures",
  "/dashboard/tok-connect": "Tok Connect",
  "/dashboard/restaurant": "Mon restaurant",
  "/dashboard/menu": "Menu",
  "/dashboard/offres": "Anti-gaspi",
  "/dashboard/ventes-flash": "Ventes flash",
  "/dashboard/formules": "Formules",
  "/dashboard/service": "Pilotage de service",
  "/dashboard/plan-salle": "Plan de salle",
  "/dashboard/notifications": "Notifications",
  "/dashboard/support": "Aide et support",
  "/dashboard/guide": "Guide d’utilisation",
};

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
    screenshots: [{
      src: "/images/user-guide/accueil-mobile.png",
      alt: "Accueil public de TOK sur mobile",
      title: "Accueil public",
      caption: "Capture réelle de l’accueil client TOK, point de départ des parcours publics.",
      audiences: ["buyer"],
    }],
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
    screenshots: [{
      src: "/images/user-guide/recherche-mobile.png",
      alt: "Recherche de restaurants dans TOK sur mobile",
      title: "Recherche de restaurants",
      caption: "Capture réelle des filtres et des résultats du parcours client TOK.",
      audiences: ["buyer"],
    }],
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
    screenshots: [{
      src: "/images/user-guide/dashboard-restaurateur.png",
      alt: "Tableau de bord restaurateur TOK",
      title: "Espace restaurateur",
      caption: "Vue réelle de l’espace restaurateur avec un établissement de démonstration.",
      audiences: ["buyer"],
    }],
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
    screenshots: [
      {
        src: "/images/user-guide/features/courier-dashboard.png",
        alt: "Espace livreur TOK",
        title: "Espace livreur",
        caption: "Capture réelle du tableau de bord coursier avec un état de démonstration.",
        audiences: ["buyer"],
      },
      {
        src: "/images/user-guide/features/commercial-prospection.png",
        alt: "Espace de prospection commerciale TOK",
        title: "Espace commercial",
        caption: "Capture réelle de la prospection commerciale TOK avec des données de démonstration.",
        audiences: ["buyer"],
      },
    ],
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
    screenshots: [
      {
        src: "/images/user-guide/features/admin-overview.png",
        alt: "Vue d’ensemble du back-office TOK",
        title: "Administration",
        caption: "Capture de la console administrateur avec un état vide contrôlé.",
        audiences: ["buyer"],
      },
      {
        src: "/images/user-guide/features/admin-operations.png",
        alt: "Suivi des opérations TOK dans l’administration",
        title: "Operations Center",
        caption: "Capture des outils de supervision des commandes et réservations sans donnée personnelle.",
        audiences: ["buyer"],
      },
    ],
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
    screenshots: [{
      src: "/images/user-guide/features/marketing-login.png",
      alt: "Connexion à l’espace marketing TOK",
      title: "Espace marketing",
      caption: "Capture du point d’accès à l’espace marketing isolé de TOK.",
      audiences: ["buyer"],
    }],
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
    screenshots: [{
      src: "/images/user-guide/features/tok-connect.png",
      alt: "Page d’information TOK Connect",
      title: "TOK Connect",
      caption: "Capture réelle de la présentation de TOK Connect, reliée aux outils partenaires.",
      audiences: ["buyer"],
    }],
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
