import {
  TOK_USER_GUIDE_ROUTES,
  TOK_USER_GUIDE_TOOLS,
} from "@/data/tok-user-guide-catalog.generated";

export type GuideRouteEntry = (typeof TOK_USER_GUIDE_ROUTES)[number];
export type GuideToolEntry = (typeof TOK_USER_GUIDE_TOOLS)[number];

export type GuideFeatureScreenshot = {
  src: string;
  alt: string;
  caption: string;
  provenance: string;
};

export type GuideFeatureDetail = {
  id: string;
  kind: "route" | "tool";
  title: string;
  reference: string;
  category: string;
  access: string;
  purpose: string;
  explanation: string;
  prerequisites: readonly string[];
  steps: readonly string[];
  expectedResults: readonly string[];
  safeguards: readonly string[];
  technicalNotes: readonly string[];
  screenshot: GuideFeatureScreenshot;
};

const IGNORED_COMPONENTS = new Set([
  "AdminProtectedRoute",
  "ClientSurfaceRoute",
  "CommercialDemoSafeEffectsBoundary",
  "DashboardRoute",
  "FeatureSwitch",
  "MarketingProtectedRoute",
  "Navigate",
  "ProtectedRoute",
  "div",
]);

const SCREENSHOTS = {
  home: {
    src: "/images/user-guide/accueil-mobile.png",
    alt: "Accueil réel de l’application TOK sur mobile",
    caption: "Écran public réel de TOK utilisé comme point d’entrée du parcours client.",
    provenance: "Capture directe de l’interface publique TOK.",
  },
  search: {
    src: "/images/user-guide/features/recherche-desktop.png",
    alt: "Recherche réelle de restaurants dans TOK",
    caption: "Recherche, catégories et filtres tels qu’ils apparaissent dans l’application.",
    provenance: "Capture directe de la route publique de recherche.",
  },
  directory: {
    src: "/images/user-guide/features/restaurateurs-geneve.png",
    alt: "Annuaire réel des restaurateurs genevois dans TOK",
    caption: "Annuaire public et critères de découverte d’un établissement.",
    provenance: "Capture directe de l’annuaire public TOK.",
  },
  auth: {
    src: "/images/user-guide/features/authentification.png",
    alt: "Écran réel de connexion et d’inscription TOK",
    caption: "Point de contrôle réel avant l’accès aux espaces protégés.",
    provenance: "Capture directe de l’écran d’authentification TOK.",
  },
  help: {
    src: "/images/user-guide/features/centre-aide.png",
    alt: "Centre d’aide réel de TOK",
    caption: "Centre d’aide public avec accès aux réponses et aux parcours d’assistance.",
    provenance: "Capture directe de la route d’aide TOK.",
  },
  contact: {
    src: "/images/user-guide/features/contact.png",
    alt: "Écran réel de contact TOK",
    caption: "Formulaire et moyens de contact proposés par l’application.",
    provenance: "Capture directe de la route de contact TOK.",
  },
  packs: {
    src: "/images/user-guide/features/packs-restaurateur.png",
    alt: "Présentation réelle des packs restaurateur TOK",
    caption: "Écran public de comparaison des offres destinées aux restaurateurs.",
    provenance: "Capture directe de la page des packs restaurateur.",
  },
  subscription: {
    src: "/images/user-guide/abonnement-mobile.png",
    alt: "Parcours réel de planification d’un abonnement repas TOK",
    caption: "Parcours client guidé pour paramétrer une formule récurrente.",
    provenance: "Capture directe du parcours abonnement de l’application.",
  },
  zeroWait: {
    src: "/images/user-guide/features/zero-attente.png",
    alt: "Parcours réel Zéro attente de TOK",
    caption: "Écran de réservation et précommande associé au service Zéro attente.",
    provenance: "Capture directe de la fonctionnalité Zéro attente.",
  },
  restaurant: {
    src: "/images/user-guide/dashboard-restaurateur.png",
    alt: "Tableau de bord restaurateur réel de TOK en mode démonstration",
    caption: "Surface restaurateur réelle, alimentée par des données isolées de démonstration.",
    provenance: "Capture directe du composant de tableau de bord restaurateur TOK.",
  },
  connect: {
    src: "/images/user-guide/features/tok-connect.png",
    alt: "Présentation réelle de TOK Connect",
    caption: "Point d’entrée de TOK Connect et de ses parcours partenaires.",
    provenance: "Capture directe de la route TOK Connect.",
  },
  admin: {
    src: "/images/user-guide/features/admin-overview.png",
    alt: "Vue d’ensemble réelle du back-office TOK",
    caption: "Console d’administration réelle rendue avec un état vide contrôlé.",
    provenance: "Capture directe du composant Administration de TOK, sans données personnelles.",
  },
  adminRestaurants: {
    src: "/images/user-guide/features/admin-restaurants.png",
    alt: "Écran réel de gestion des restaurants dans l’administration TOK",
    caption: "Surface de gestion des établissements, de leur visibilité et de leurs services.",
    provenance: "Capture directe du composant Gestion des restaurants.",
  },
  adminUsers: {
    src: "/images/user-guide/features/admin-utilisateurs.png",
    alt: "Écran réel de gestion des utilisateurs TOK",
    caption: "Surface d’administration des identités, rôles et dossiers d’inscription.",
    provenance: "Capture directe du composant Gestion des utilisateurs.",
  },
  adminOperations: {
    src: "/images/user-guide/features/admin-operations.png",
    alt: "Operations Center réel de l’administration TOK",
    caption: "Cockpit de suivi des commandes, réservations, paiements, remboursements et incidents.",
    provenance: "Capture directe du composant Operations Center avec état vide.",
  },
  adminGuardian: {
    src: "/images/user-guide/features/admin-guardian.png",
    alt: "Écran réel TOK Guardian",
    caption: "Surface de supervision des preuves, signaux de santé et incidents.",
    provenance: "Capture directe du composant TOK Guardian avec état vide.",
  },
  adminAccounting: {
    src: "/images/user-guide/features/admin-comptabilite.png",
    alt: "Vue comptable réelle de l’administration TOK",
    caption: "Surface comptable réservée aux utilisateurs autorisés.",
    provenance: "Capture directe du composant de comptabilité administrateur.",
  },
  commercial: {
    src: "/images/user-guide/features/commercial-prospection.png",
    alt: "Carte de prospection commerciale réelle de TOK",
    caption: "Espace commercial et filtres de suivi des établissements genevois.",
    provenance: "Capture directe du composant de prospection avec données de démonstration.",
  },
  courier: {
    src: "/images/user-guide/features/courier-dashboard.png",
    alt: "Tableau de bord coursier réel de TOK",
    caption: "Vue d’ensemble d’un profil coursier en attente de validation.",
    provenance: "Capture directe du composant Espace Livreur avec état de démonstration.",
  },
  marketing: {
    src: "/images/user-guide/features/marketing-login.png",
    alt: "Point d’accès réel à l’espace marketing TOK",
    caption: "Point de contrôle de la surface marketing isolée.",
    provenance: "Capture directe de l’accès marketing TOK.",
  },
} satisfies Record<string, GuideFeatureScreenshot>;

const TOOL_CATEGORY_RULES: readonly [string, RegExp][] = [
  ["Paiements & revenus", /(stripe|checkout|payment|invoice|billing|refund|subscription|payout|adjustment)/i],
  ["Commandes & réservations", /(order|reservation|dispatch|courier|zero-attente|match-group)/i],
  ["IA & création", /(^ai-|advisor|image|photo|floorplan|daily-dish|analyze)/i],
  ["Marketing & CRM", /(marketing|campaign|sponsored|crm|newsletter|prospect)/i],
  ["TOK Connect & partenaires", /(tok-connect|oauth|webhook|google-actions|aligro|supplier)/i],
  ["Messages & support", /(email|push|notification|support|contact)/i],
  ["Données & annuaire", /(directory|restaurant|catalog|scrape|enrich|import|export|geo)/i],
  ["Sécurité & opérations", /(admin|guardian|incident|audit|monitor|security|mfa|delete-account)/i],
];

export function humanizeGuideLabel(value: string) {
  return value
    .replace(/^\//, "")
    .replace(/[:*]/g, "")
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/([a-zà-ÿ])([A-Z])/g, "$1 $2")
    .replace(/\b(ai|crm|mcp|oauth|tok)\b/gi, (token) => token.toUpperCase())
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (character) => character.toUpperCase());
}

export function getGuideRouteTitle(route: GuideRouteEntry) {
  const component = [...route.components].reverse().find((name) => !IGNORED_COMPONENTS.has(name));
  if (component) return humanizeGuideLabel(component);
  if (route.redirectTo) return `Redirection vers ${humanizeGuideLabel(route.redirectTo)}`;
  if (route.path === "*") return "Page introuvable";
  return humanizeGuideLabel(route.path) || "Accueil";
}

export function getGuideRouteAccess(route: GuideRouteEntry) {
  if (route.surface === "admin") return "Accès administrateur authentifié";
  if (route.surface === "restaurant") return "Compte restaurateur et établissement sélectionné";
  if (route.surface === "courier") return "Compte coursier autorisé";
  if (route.surface === "commercial") return "Compte commercial ou administrateur";
  if (route.surface === "marketing") return "Session marketing dédiée";
  if (route.requiredRoles.length > 0) return `Compte authentifié avec le rôle ${route.requiredRoles.join(", ")}`;
  return "Accès public, sauf action nécessitant une connexion";
}

export function getGuideToolCategory(tool: GuideToolEntry) {
  return TOOL_CATEGORY_RULES.find(([, pattern]) => pattern.test(tool.name))?.[0] || "Services de plateforme";
}

function screenshotForRoute(route: GuideRouteEntry): GuideFeatureScreenshot {
  const path = route.path.toLowerCase();
  if (route.surface === "restaurant") return SCREENSHOTS.restaurant;
  if (route.surface === "courier") return SCREENSHOTS.courier;
  if (route.surface === "commercial") return SCREENSHOTS.commercial;
  if (route.surface === "marketing") return SCREENSHOTS.marketing;
  if (route.surface === "admin") {
    if (/(restaurants|google-business)/.test(path)) return SCREENSHOTS.adminRestaurants;
    if (/(utilisateurs|packs)/.test(path)) return SCREENSHOTS.adminUsers;
    if (/(commandes-reservations|sinistres|support-resolution)/.test(path)) return SCREENSHOTS.adminOperations;
    if (/(guardian|audit|ai-operations)/.test(path)) return SCREENSHOTS.adminGuardian;
    if (/compta/.test(path)) return SCREENSHOTS.adminAccounting;
    if (/tok-connect/.test(path)) return SCREENSHOTS.connect;
    return SCREENSHOTS.admin;
  }
  if (/(auth|oauth|espaces|profil|parametres\/securite)/.test(path)) return SCREENSHOTS.auth;
  if (/(recherche|restaurants\/:city|restaurant\/:id)/.test(path)) return SCREENSHOTS.search;
  if (/restaurateurs/.test(path)) return SCREENSHOTS.directory;
  if (/(aide|cgu|confidentialite|cookies|mentions|conditions)/.test(path)) return SCREENSHOTS.help;
  if (/contact/.test(path)) return SCREENSHOTS.contact;
  if (/packs-restaurateur/.test(path)) return SCREENSHOTS.packs;
  if (/(abonnement|tok-one|points-cadeau)/.test(path)) return SCREENSHOTS.subscription;
  if (/(zero-attente|creneaux|flex-prix|match-groupes|multi-stop|multi-restaurant)/.test(path)) return SCREENSHOTS.zeroWait;
  if (/tok-connect/.test(path)) return SCREENSHOTS.connect;
  return SCREENSHOTS.home;
}

type RouteWorkflow = Pick<GuideFeatureDetail, "purpose" | "explanation" | "prerequisites" | "steps" | "expectedResults" | "safeguards">;

function routeWorkflow(route: GuideRouteEntry, title: string): RouteWorkflow {
  const path = route.path.toLowerCase();
  const gate = route.featureGate
    ? [`La fonctionnalité « ${humanizeGuideLabel(route.featureGate)} » doit être activée dans l’environnement concerné.`]
    : [];

  if (route.redirectTo) {
    return {
      purpose: `Conserver un ancien accès vers ${route.redirectTo} sans dupliquer l’écran cible.`,
      explanation: "Cette route ne porte pas une interface autonome. Elle maintient la compatibilité des favoris et redirige vers la route de référence.",
      prerequisites: ["Disposer de l’accès requis par la destination.", ...gate],
      steps: [
        `Ouvrir ${route.path}.`,
        `L’application remplace l’adresse par ${route.redirectTo}.`,
        "Poursuivre le parcours sur l’écran de destination et vérifier que le contexte a été conservé.",
      ],
      expectedResults: [`La route finale affichée est ${route.redirectTo}.`, "Aucun écran obsolète ou en double n’est présenté."],
      safeguards: ["Les contrôles d’accès de la destination restent applicables.", "Une redirection ne contourne jamais un rôle ou une fonctionnalité désactivée."],
    };
  }

  if (/(auth|oauth\/consent|espaces|parametres\/securite)/.test(path)) {
    return {
      purpose: `Sécuriser l’identité, le consentement ou le choix d’espace associé à « ${title} ».`,
      explanation: "Ce parcours établit la session et le rôle actif avant d’ouvrir une surface protégée. Les retours d’authentification ramènent l’utilisateur vers son parcours initial lorsque cela est autorisé.",
      prerequisites: ["Utiliser une adresse e-mail ou un fournisseur de connexion valide.", "Avoir reçu le rôle nécessaire pour l’espace demandé.", ...gate],
      steps: [
        `Ouvrir ${route.path} et choisir l’action proposée.`,
        "Renseigner uniquement les informations demandées, puis valider la connexion ou le consentement.",
        "Contrôler l’espace et le rôle affichés après redirection.",
        "Pour la sécurité du compte, vérifier les méthodes actives et fermer les sessions devenues inutiles.",
      ],
      expectedResults: ["La session est créée ou mise à jour.", "L’utilisateur accède uniquement aux espaces correspondant à ses rôles."],
      safeguards: ["Ne jamais partager un code de connexion, un lien magique ou un secret OAuth.", "En cas de rôle absent, contacter le support au lieu de créer un second compte."],
    };
  }

  if (/(recherche|restaurants|restaurant\/:id|\/r\/:slug)/.test(path)) {
    return {
      purpose: `Permettre la découverte et la consultation d’un établissement depuis « ${title} ».`,
      explanation: "La surface combine critères de recherche, zone, catégories et fiche établissement. Les possibilités de commander ou réserver dépendent des services réellement activés par le restaurant.",
      prerequisites: ["Définir une ville ou autoriser une localisation approximative si elle est demandée.", "Vérifier la date et le mode de service recherchés.", ...gate],
      steps: [
        `Ouvrir ${route.path}.`,
        "Saisir un nom, une cuisine ou une zone, puis appliquer les filtres utiles.",
        "Ouvrir une fiche et vérifier horaires, adresse, prix et services disponibles.",
        "Choisir ensuite réservation, retrait ou livraison lorsqu’ils sont proposés.",
      ],
      expectedResults: ["La liste reflète les critères actifs.", "La fiche sélectionnée présente les informations et actions disponibles pour cet établissement."],
      safeguards: ["Un résultat absent peut dépendre de la zone, des horaires ou d’un service désactivé.", "Toujours vérifier l’établissement et la date avant de confirmer une action."],
    };
  }

  if (/(panier|commande|reservation|zero-attente)/.test(path) && route.surface !== "admin" && route.surface !== "restaurant") {
    return {
      purpose: `Préparer, confirmer ou suivre l’opération client « ${title} ».`,
      explanation: "Ce parcours rassemble les éléments choisis, les coordonnées utiles, le créneau, le mode de service et l’état de traitement. Une opération n’est confirmée qu’après le retour explicite affiché par TOK.",
      prerequisites: ["Avoir sélectionné un restaurant et une offre disponible.", "Vérifier le créneau, les quantités, l’adresse et le moyen de paiement.", ...gate],
      steps: [
        `Ouvrir ${route.path} depuis le restaurant ou l’espace client.`,
        "Relire le détail, modifier les quantités ou le créneau si nécessaire.",
        "Valider les coordonnées et les conditions affichées.",
        "Confirmer l’opération puis conserver la référence et suivre son statut.",
      ],
      expectedResults: ["Une confirmation explicite et une référence sont affichées.", "Le statut devient consultable depuis l’espace client lorsque la connexion est requise."],
      safeguards: ["Ne pas considérer un simple clic ou une page de paiement ouverte comme une confirmation.", "En cas de doute, vérifier la référence avant de recommencer afin d’éviter un doublon."],
    };
  }

  if (route.surface === "restaurant") {
    const subject = path.includes("menu") ? "la carte, les catégories, les prix et la disponibilité"
      : path.includes("commandes") ? "les commandes et leur progression opérationnelle"
        : path.includes("reservations") ? "les réservations, services et statuts de présence"
          : /(factures|facturation|compta)/.test(path) ? "les écritures, factures et réglages de facturation"
            : /(campagn|crm|actualites|reseaux-sociaux)/.test(path) ? "les contenus, audiences et actions de relation client"
              : /(performances|comparaison|avis|advisor)/.test(path) ? "les indicateurs, comparaisons et recommandations"
                : /(photos|restaurant)/.test(path) ? "la présentation publique et les médias de l’établissement"
                  : /(service|plan-salle)/.test(path) ? "l’organisation du service et de la salle"
                    : /(support|notifications|tok-connect)/.test(path) ? "les alertes, demandes d’aide et connexions autorisées"
                      : "les priorités et réglages de l’établissement";
    return {
      purpose: `Gérer ${subject} depuis « ${title} ».`,
      explanation: `Cette page appartient à l’espace du restaurant sélectionné. Toute modification concerne cet établissement et doit être vérifiée dans l’aperçu ou l’état récapitulatif avant de quitter l’écran.`,
      prerequisites: ["Être connecté avec un rôle restaurateur autorisé.", "Vérifier le nom de l’établissement actif dans la navigation.", ...gate],
      steps: [
        `Depuis le tableau de bord, ouvrir ${route.path}.`,
        `Contrôler l’état actuel de ${subject} avant toute modification.`,
        "Utiliser la recherche, les filtres ou l’action principale pour cibler l’élément concerné.",
        "Renseigner les champs obligatoires, relire les valeurs sensibles puis enregistrer.",
        "Vérifier le message de confirmation et l’état final dans la liste ou l’aperçu.",
      ],
      expectedResults: [`La page affiche un état cohérent de ${subject}.`, "Toute modification validée est visible dans le récapitulatif ou dans l’écran public correspondant."],
      safeguards: ["Ne jamais changer d’établissement pendant une saisie non enregistrée.", "Pour une publication, un paiement ou une connexion partenaire, distinguer la préparation de la confirmation externe."],
    };
  }

  if (route.surface === "admin") {
    const subject = /(restaurants|google-business)/.test(path) ? "les établissements et leur visibilité"
      : /(utilisateurs|packs)/.test(path) ? "les identités, rôles, dossiers et droits"
        : /(commandes-reservations|sinistres|support-resolution)/.test(path) ? "les opérations, paiements, remboursements et incidents"
          : /(guardian|audit|ai-operations)/.test(path) ? "les preuves, journaux, signaux de santé et opérations IA"
            : /compta/.test(path) ? "les flux financiers, reversements et analyses comptables"
              : /tok-connect/.test(path) ? "les partenaires, autorisations, quotas et webhooks TOK Connect"
                : "la configuration et les modules de la plateforme";
    return {
      purpose: `Superviser ${subject} dans « ${title} ».`,
      explanation: "Cette fonction appartient au back-office. Elle donne une vue globale et peut exposer des actions sensibles : la consultation, la préparation d’une décision et sa validation doivent rester distinctes.",
      prerequisites: ["Être connecté avec un rôle administrateur.", "Identifier l’environnement, l’entité et la période concernés.", ...gate],
      steps: [
        `Ouvrir ${route.path} depuis la console d’administration.`,
        `Filtrer ${subject} avec les critères les plus précis disponibles.`,
        "Ouvrir le détail et vérifier les identifiants, les horodatages et les preuves associées.",
        "Préparer l’action, lire son impact et demander la confirmation lorsque l’interface l’exige.",
        "Après exécution, contrôler le nouvel état et la trace d’audit.",
      ],
      expectedResults: [`Une vue vérifiable de ${subject} est disponible.`, "Toute action autorisée produit un état final explicite et, lorsqu’applicable, une trace d’audit."],
      safeguards: ["Ne jamais utiliser le back-office pour contourner un contrôle de rôle, un verrou financier ou une règle de production.", "Ne pas exposer de données personnelles dans une capture, un export ou un rapport de diligence."],
    };
  }

  if (route.surface === "courier") {
    return {
      purpose: `Permettre au coursier d’utiliser « ${title} » pour ses missions, alertes, gains ou informations de profil.`,
      explanation: "L’espace coursier sépare la validation du profil, la disponibilité opérationnelle, les propositions de mission et le suivi des gains.",
      prerequisites: ["Être connecté avec un compte coursier.", "Avoir complété les informations et justificatifs demandés.", ...gate],
      steps: [`Ouvrir ${route.path}.`, "Vérifier l’état du profil et la disponibilité affichée.", "Consulter l’élément proposé, puis ouvrir son détail avant d’agir.", "Confirmer l’action et vérifier le nouvel état."],
      expectedResults: ["Le coursier voit uniquement ses informations et missions.", "Les changements de statut sont reflétés dans la vue d’ensemble."],
      safeguards: ["Ne pas accepter une mission sans vérifier le retrait, la destination et le statut du profil.", "Les gains affichés doivent être rapprochés de la période sélectionnée."],
    };
  }

  if (route.surface === "commercial") {
    return {
      purpose: `Aider l’équipe commerciale à exploiter « ${title} » pour la prospection et la démonstration.`,
      explanation: "La surface commerciale suit les établissements, leur statut de prospection et les démonstrations isolées. Elle ne remplace ni l’administration ni les données de production d’un restaurant.",
      prerequisites: ["Être connecté avec un rôle commercial ou administrateur.", "Sélectionner la zone ou le portefeuille concerné.", ...gate],
      steps: [`Ouvrir ${route.path}.`, "Rechercher l’établissement ou la période avec les filtres disponibles.", "Consulter la fiche et noter uniquement un statut vérifiable.", "Pour une démonstration, créer une session isolée puis revenir au suivi commercial."],
      expectedResults: ["Le pipeline et les états de prospection sont lisibles.", "Les démonstrations restent séparées des comptes et paiements réels."],
      safeguards: ["Ne pas présenter une démonstration comme une donnée de production.", "Ne pas enregistrer d’engagement commercial non confirmé."],
    };
  }

  if (route.surface === "marketing") {
    return {
      purpose: `Préparer ou contrôler l’activité marketing « ${title} ».`,
      explanation: "L’espace marketing isole la préparation des campagnes, les approbations, les créations et les diagnostics de connexion aux fournisseurs externes.",
      prerequisites: ["Disposer d’une session marketing valide.", "Avoir identifié la campagne, le canal, l’audience et le budget concernés.", ...gate],
      steps: [`Ouvrir ${route.path}.`, "Sélectionner l’opération ou la campagne concernée.", "Examiner le contenu, l’audience, le canal et les prérequis fournisseur.", "Prévisualiser puis demander l’approbation ou l’exécution autorisée.", "Contrôler séparément le retour du fournisseur et l’état enregistré dans TOK."],
      expectedResults: ["La campagne possède un état explicite et traçable.", "Une publication n’est marquée réussie qu’après confirmation du fournisseur."],
      safeguards: ["Aucune dépense ni publication ne doit être déduite d’une simple prévisualisation.", "Les jetons, codes OAuth et secrets fournisseurs ne doivent jamais apparaître dans le guide."],
    };
  }

  return {
    purpose: `Consulter et utiliser la fonctionnalité publique « ${title} ».`,
    explanation: "Cette route présente une information, un service public ou un parcours spécialisé de TOK. Son contenu peut varier selon la ville, l’activation d’une fonctionnalité et l’état de connexion.",
    prerequisites: ["Disposer d’une connexion internet et d’un navigateur récent.", ...gate],
    steps: [`Ouvrir ${route.path}.`, "Lire le contexte et les conditions affichées en tête de page.", "Utiliser l’action principale ou les filtres disponibles.", "Vérifier le résultat affiché avant de poursuivre vers une autre étape."],
    expectedResults: ["La page présente le contenu attendu ou une explication de disponibilité.", "Les actions protégées demandent une connexion avant de continuer."],
    safeguards: ["Une fonctionnalité désactivée peut rediriger vers une page de repli.", "Toujours vérifier l’URL et le contexte avant de transmettre une information."],
  };
}

export function getRouteGuideDetail(route: GuideRouteEntry): GuideFeatureDetail {
  const title = getGuideRouteTitle(route);
  const workflow = routeWorkflow(route, title);
  return {
    id: `route:${route.surface}:${route.path}`,
    kind: "route",
    title,
    reference: route.path,
    category: route.surface,
    access: getGuideRouteAccess(route),
    ...workflow,
    technicalNotes: [
      `Composant(s) détecté(s) : ${route.components.join(", ") || "aucun composant nommé"}.`,
      route.featureGate ? `Activation conditionnelle : ${route.featureGate}.` : "Aucun drapeau d’activation explicite détecté sur la route.",
      route.redirectTo ? `Destination de redirection : ${route.redirectTo}.` : "La route rend directement son écran de référence.",
    ],
    screenshot: screenshotForRoute(route),
  };
}

function screenshotForTool(tool: GuideToolEntry): GuideFeatureScreenshot {
  const name = tool.name.toLowerCase();
  if (/(admin-demo|admin-restaurant|restaurant)/.test(name)) return SCREENSHOTS.adminRestaurants;
  if (/(user|role|account|application|courier-profile)/.test(name)) return SCREENSHOTS.adminUsers;
  if (/(order|reservation|dispatch|refund|incident|support)/.test(name)) return SCREENSHOTS.adminOperations;
  if (/(guardian|audit|monitor|security|ai-admin)/.test(name)) return SCREENSHOTS.adminGuardian;
  if (/(stripe|payment|invoice|billing|payout|accounting|adjustment)/.test(name)) return SCREENSHOTS.adminAccounting;
  if (/(marketing|campaign|sponsored|newsletter)/.test(name)) return SCREENSHOTS.marketing;
  if (/(tok-connect|oauth|webhook|google-actions|supplier|aligro)/.test(name)) return SCREENSHOTS.connect;
  if (/(courier|mission)/.test(name)) return SCREENSHOTS.courier;
  if (/(prospect|commercial)/.test(name)) return SCREENSHOTS.commercial;
  if (/(menu|photo|floorplan|advisor|daily-dish|crm)/.test(name)) return SCREENSHOTS.restaurant;
  return SCREENSHOTS.admin;
}

export function getToolGuideDetail(tool: GuideToolEntry): GuideFeatureDetail {
  const title = humanizeGuideLabel(tool.name);
  const category = getGuideToolCategory(tool);
  const actions = tool.actions.length > 0
    ? tool.actions.map(humanizeGuideLabel)
    : ["Traitement principal défini par la requête"];
  const integrations = tool.integrations.length > 0
    ? tool.integrations.map(humanizeGuideLabel)
    : ["Services internes TOK"];
  const isReadOnly = tool.methods.length > 0 && tool.methods.every((method) => method === "GET");

  return {
    id: `tool:${tool.name}`,
    kind: "tool",
    title,
    reference: tool.endpoint,
    category,
    access: "Appel serveur authentifié selon le rôle et la ressource concernés",
    purpose: `${isReadOnly ? "Lire" : "Traiter"} la capacité serveur « ${title} » depuis les écrans autorisés de TOK.`,
    explanation: `Cet outil n’est pas une page autonome. Il expose ${tool.methods.join(" / ") || "un traitement interne"} sur ${tool.endpoint}. L’interface associée prépare la demande, le serveur revalide l’identité et les droits, puis renvoie un résultat structuré.`,
    prerequisites: [
      "Déclencher l’action depuis l’écran TOK prévu, sauf intégration technique explicitement documentée.",
      "Disposer d’une session, d’un rôle et d’un accès à la ressource compatibles.",
      `Vérifier la disponibilité des connexions nécessaires : ${integrations.join(", ")}.`,
    ],
    steps: [
      `Depuis l’interface associée, choisir l’action : ${actions.join(", ")}.`,
      "Vérifier les données saisies, l’entité ciblée et l’impact annoncé.",
      `L’interface envoie une requête ${tool.methods.join(" / ") || "interne"} vers ${tool.endpoint}.`,
      "Le service contrôle l’authentification, les autorisations, la validité des entrées et les limites applicables.",
      "Lire le résultat affiché dans TOK et, pour une action externe, vérifier aussi la confirmation du fournisseur.",
    ],
    expectedResults: [
      `Le service renvoie un succès ou une erreur explicite pour ${actions.join(", ")}.`,
      isReadOnly ? "Aucune donnée métier n’est modifiée par une lecture réussie." : "L’état modifié devient visible dans l’écran de suivi correspondant.",
    ],
    safeguards: [
      "Ne jamais appeler l’endpoint en copiant un jeton ou une clé dans un navigateur, un document ou un outil non approuvé.",
      "Une réponse reçue ne prouve pas à elle seule qu’une action tierce a abouti : contrôler son identifiant et son état fournisseur.",
      "En cas d’échec, conserver le code d’erreur et la référence métier, sans exposer de secret ni de donnée personnelle inutile.",
    ],
    technicalNotes: [
      `Méthodes détectées : ${tool.methods.join(", ") || "interne"}.`,
      `Actions détectées : ${actions.join(", ")}.`,
      `Intégrations détectées : ${integrations.join(", ")}.`,
      "La capture montre la surface réelle qui déclenche ou supervise le service ; l’endpoint serveur ne possède pas d’écran propre.",
    ],
    screenshot: screenshotForTool(tool),
  };
}
