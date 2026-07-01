export type TokConnectIntentPlan = {
  actor: "client" | "restaurant";
  mode: "read_only" | "suggest" | "autopilot_bounded";
  primaryGoal:
    | "discovery"
    | "reservation"
    | "order"
    | "loyalty"
    | "support"
    | "campaign"
    | "restaurant_consent"
    | "restaurant_reservations"
    | "restaurant_orders"
    | "restaurant_menu"
    | "restaurant_marketing"
    | "restaurant_analytics"
    | "restaurant_customer_engagement"
    | "restaurant_account";
  requiredScopes: string[];
  steps: Array<{ title: string; detail: string }>;
  guardrails: string[];
  limits?: {
    maxPartySize: number;
    maxDailyReservations: number;
    humanApprovalRequired: boolean;
  };
};

export type TokConnectEndpoint = {
  method: "GET" | "POST";
  path: string;
  purpose: string;
  scopes: string[];
};

export type TokConnectWebhook = {
  event: string;
  path: string;
  purpose: string;
  delivery: string;
  scopes: string[];
};

export type TokConnectMcpTool = {
  name: string;
  scope: string;
  purpose: string;
  execution: TokConnectIntentPlan["mode"];
};

export type TokConnectMcpResource = {
  uri: string;
  scope: string;
  purpose: string;
};

export type TokConnectMcpPrompt = {
  name: string;
  purpose: string;
  mode: TokConnectIntentPlan["mode"];
  inputs: string[];
};

export type TokConnectAgent = {
  id: string;
  name: string;
  mode: TokConnectIntentPlan["mode"];
  promise: string;
  guardrail: string;
};

export type TokConnectAccessLevel = {
  name: "Discovery" | "Booking" | "Campaign Preview" | "Analytics" | "Autopilot" | "Enterprise MCP";
  description: string;
  scopes: string[];
};

export type TokConnectPricingTier = {
  name: "Free Developer" | "Partner" | "Booking Partner" | "Commerce Preview" | "Enterprise / Hotel / Concierge";
  price: string;
  audience: string;
  includes: string[];
  commercialModel: string;
};

export type TokConnectSecurityControl = {
  title: string;
  detail: string;
};

export type TokConnectRoadmapStep = {
  step: 1 | 2 | 3 | 4 | 5;
  title: string;
  outcome: string;
};

export const tokConnectCoreEndpoints: TokConnectEndpoint[] = [
  {
    method: "GET",
    path: "/v1/restaurants",
    purpose: "Recherche paginée de restaurants actifs avec curseur et filtres.",
    scopes: ["restaurants:read"],
  },
  {
    method: "GET",
    path: "/v1/restaurants/{id}",
    purpose: "Profil public d'un restaurant TOK autorisé.",
    scopes: ["restaurants:read"],
  },
  {
    method: "GET",
    path: "/v1/restaurants/{id}/menu",
    purpose: "Menus publics, prix et disponibilités d'articles.",
    scopes: ["restaurants:read"],
  },
  {
    method: "GET",
    path: "/v1/restaurants/{id}/availability",
    purpose: "Créneaux et capacité temps réel avant une réservation.",
    scopes: ["availability:read"],
  },
  {
    method: "POST",
    path: "/v1/reservations/preview",
    purpose: "Prévisualisation sans mutation avant confirmation client.",
    scopes: ["reservations:create"],
  },
  {
    method: "POST",
    path: "/v1/reservations",
    purpose: "Création réelle, confirmée, idempotente et auditée.",
    scopes: ["reservations:create"],
  },
  {
    method: "POST",
    path: "/v1/reservations/{id}/cancel/preview",
    purpose: "Prévisualisation d'annulation sans mutation.",
    scopes: ["reservations:cancel"],
  },
  {
    method: "POST",
    path: "/v1/reservations/{id}/cancel",
    purpose: "Annulation reelle, confirmee par le client, idempotente et auditee.",
    scopes: ["reservations:cancel"],
  },
  {
    method: "GET",
    path: "/v1/credits/balance",
    purpose: "Lecture du solde de crédits partenaire avant une preview.",
    scopes: ["credits:read"],
  },
  {
    method: "POST",
    path: "/v1/campaigns/preview",
    purpose: "Génération de campagne en suggestion validable par un humain.",
    scopes: ["campaigns:preview"],
  },
  {
    method: "POST",
    path: "/v1/autopilot/plan",
    purpose: "Plan Autopilot avancé, borné et bloqué avant approbation humaine.",
    scopes: ["autopilot:plan", "analytics:read", "campaigns:preview"],
  },
];

export const tokConnectPartnerWebhooks: TokConnectWebhook[] = [
  {
    event: "reservation.created",
    path: "/webhooks/tok",
    purpose: "Notifier un partenaire dès qu'une réservation TOK est confirmée.",
    delivery: "POST avec X-TOK-Event, X-TOK-Delivery, X-TOK-Timestamp et X-TOK-Signature.",
    scopes: ["reservations:create"],
  },
  {
    event: "reservation.cancelled",
    path: "/webhooks/tok",
    purpose: "Synchroniser une annulation validée et libérer le contexte côté partenaire.",
    delivery: "POST signé, horodaté et rejouable de façon idempotente.",
    scopes: ["reservations:cancel"],
  },
  {
    event: "webhook.test",
    path: "/webhooks/tok",
    purpose: "Tester la configuration avant une mise en production.",
    delivery: "POST signé avec payload déterministe.",
    scopes: ["restaurants:read"],
  },
  {
    event: "campaign.previewed",
    path: "/webhooks/tok",
    purpose: "Partager une preview de campagne sans diffusion automatique.",
    delivery: "POST signé; aucune dépense de crédits sans validation.",
    scopes: ["campaigns:preview"],
  },
];

export const tokConnectMcpTools: TokConnectMcpTool[] = [
  {
    name: "search_restaurants",
    scope: "restaurants:read",
    purpose: "Trouver des restaurants TOK selon lieu, cuisine, budget et intention.",
    execution: "read_only",
  },
  {
    name: "get_real_time_availability",
    scope: "availability:read",
    purpose: "Lire les créneaux avant de proposer une réservation.",
    execution: "read_only",
  },
  {
    name: "prepare_reservation",
    scope: "reservations:create",
    purpose: "Préparer une réservation confirmable, sans créer tant que l'utilisateur n'a pas validé.",
    execution: "suggest",
  },
  {
    name: "get_restaurant_performance",
    scope: "analytics:read",
    purpose: "Lire des signaux de performance utiles aux recommandations.",
    execution: "read_only",
  },
  {
    name: "estimate_campaign_credit_cost",
    scope: "credits:read",
    purpose: "Estimer les crédits avant une preview de campagne.",
    execution: "read_only",
  },
  {
    name: "generate_campaign_preview",
    scope: "campaigns:preview",
    purpose: "Générer une campagne en brouillon validable par le restaurant.",
    execution: "suggest",
  },
  {
    name: "build_autopilot_plan",
    scope: "autopilot:plan",
    purpose: "Composer un plan Autopilot avancé qui reste en attente d'approbation humaine.",
    execution: "autopilot_bounded",
  },
];

export const tokConnectMcpResources: TokConnectMcpResource[] = [
  {
    uri: "tok://restaurants",
    scope: "restaurants:read",
    purpose: "Catalogue paginé de restaurants TOK actifs.",
  },
  {
    uri: "tok://restaurants/{restaurant_id}",
    scope: "restaurants:read",
    purpose: "Profil public, cuisine, adresse, statut et options de réservation.",
  },
  {
    uri: "tok://availability/{restaurant_id}",
    scope: "availability:read",
    purpose: "Créneaux et capacité utilisables par un agent en lecture.",
  },
  {
    uri: "tok://campaign-preview/{restaurant_id}",
    scope: "campaigns:preview",
    purpose: "Contexte de preview marketing sans publication.",
  },
  {
    uri: "tok://autopilot-runs/{restaurant_id}",
    scope: "autopilot:plan",
    purpose: "Runs Autopilot bornés, statuts d'approbation et politiques d'exécution.",
  },
];

export const tokConnectMcpPrompts: TokConnectMcpPrompt[] = [
  {
    name: "prepare_guest_reservation",
    purpose: "Transformer une demande client en réservation TOK confirmable.",
    mode: "suggest",
    inputs: ["ville", "nombre de personnes", "date", "horaire", "cuisine", "budget"],
  },
  {
    name: "restaurant_campaign_preview",
    purpose: "Préparer une campagne restaurant à valider, avec coût estimé.",
    mode: "suggest",
    inputs: ["restaurant_id", "objectif", "budget", "audience"],
  },
  {
    name: "read_restaurant_performance",
    purpose: "Résumer les signaux de performance sans déclencher d'action.",
    mode: "read_only",
    inputs: ["restaurant_id", "période"],
  },
  {
    name: "build_bounded_autopilot_plan",
    purpose: "Transformer un objectif restaurant en plan Autopilot validable.",
    mode: "autopilot_bounded",
    inputs: ["restaurant_id", "objectif", "budget", "actions demandées"],
  },
];

export const tokConnectAgentCatalog: TokConnectAgent[] = [
  {
    id: "reservation",
    name: "Agent réservation",
    mode: "suggest",
    promise: "Convertit une intention client en table disponible et récapitulatif validable.",
    guardrail: "Aucune réservation créée sans confirmation client explicite.",
  },
  {
    id: "campaign_preview",
    name: "Agent campagne preview",
    mode: "suggest",
    promise: "Transforme un objectif business en campagne brouillon et coût estimé.",
    guardrail: "Aucune diffusion ni dépense de crédits sans validation humaine.",
  },
  {
    id: "performance_reader",
    name: "Agent performance",
    mode: "read_only",
    promise: "Lit remplissage, conversions et opportunités pour préparer une recommandation.",
    guardrail: "Lecture uniquement, sans modification d'offre ni campagne.",
  },
  {
    id: "bounded_autopilot",
    name: "Agent Autopilot contrôlé",
    mode: "autopilot_bounded",
    promise: "Assemble lecture, performance et preview campagne en plan d'action priorisé.",
    guardrail: "Le run reste en attente d'approbation et n'exécute aucune mutation autonome.",
  },
];

export const tokConnectAccessLevels: TokConnectAccessLevel[] = [
  {
    name: "Discovery",
    description: "Afficher restaurants, menus, photos, cuisines, prix et ambiance.",
    scopes: ["restaurants:read"],
  },
  {
    name: "Booking",
    description: "Créer une vraie réservation TOK après confirmation explicite.",
    scopes: ["restaurants:read", "availability:read", "reservations:create"],
  },
  {
    name: "Campaign Preview",
    description: "Préparer des campagnes sans diffusion automatique.",
    scopes: ["campaigns:preview", "credits:read"],
  },
  {
    name: "Analytics",
    description: "Lire les performances restaurant pour recommandations et reporting.",
    scopes: ["analytics:read"],
  },
  {
    name: "Autopilot",
    description: "Construire des plans avancés, bornés et validables avant exécution.",
    scopes: ["autopilot:plan", "analytics:read", "campaigns:preview"],
  },
  {
    name: "Enterprise MCP",
    description: "Exposer tools, resources et prompts à des assistants IA contrôlés.",
    scopes: ["restaurants:read", "availability:read", "campaigns:preview", "analytics:read"],
  },
];

export const tokConnectPricingTiers: TokConnectPricingTier[] = [
  {
    name: "Free Developer",
    price: "0 CHF",
    audience: "Développeurs, tests internes et prototypes partenaires.",
    includes: ["Sandbox", "1'000 appels/mois", "Fixtures déterministes", "Documentation OpenAPI"],
    commercialModel: "Accès gratuit limité, sans données réelles ni mutation production.",
  },
  {
    name: "Partner",
    price: "99 CHF/mois",
    audience: "Sites locaux, apps touristiques, annuaires et widgets restaurant.",
    includes: ["Restaurants publics", "Menus", "Recherche", "Disponibilité limitée"],
    commercialModel: "Abonnement API pour visibilité et découverte.",
  },
  {
    name: "Booking Partner",
    price: "299 CHF/mois",
    audience: "Hôtels, conciergeries, plateformes de réservation et assistants voyageurs.",
    includes: ["Réservations confirmées", "Webhooks réservation", "Quotas supérieurs", "Support partenaire"],
    commercialModel: "Abonnement plus commission par réservation confirmée.",
  },
  {
    name: "Commerce Preview",
    price: "499 CHF/mois",
    audience: "Agences marketing, CRM et partenaires commerce local.",
    includes: ["Preview campagnes", "Estimation crédits", "Webhooks preview", "Validation humaine"],
    commercialModel: "Abonnement avec previews; diffusion autonome reportée.",
  },
  {
    name: "Enterprise / Hotel / Concierge",
    price: "Sur devis",
    audience: "Chaînes hôtelières, conciergeries premium et intégrations marque blanche.",
    includes: ["MCP Server", "Webhooks avancés", "SLA", "Dashboard", "Quotas dédiés"],
    commercialModel: "Contrat dédié avec sécurité renforcée et quotas négociés.",
  },
];

export const tokConnectSecurityControls: TokConnectSecurityControl[] = [
  {
    title: "OAuth 2.0 avec scopes",
    detail: "Chaque client reçoit un token opaque court limité aux scopes approuvés.",
  },
  {
    title: "Secrets hashés et rotation",
    detail: "Les secrets sont créés par Edge Function, stockés hashés et rotatifs.",
  },
  {
    title: "Audit log complet",
    detail: "Tokens, réservations, previews, webhooks et révocations sont journalisés.",
  },
  {
    title: "Idempotence réservation",
    detail: "La création réelle impose Idempotency-Key et vérification serveur.",
  },
  {
    title: "Sandbox isolée",
    detail: "Les clients sandbox utilisent des fixtures et ne mutent pas la production.",
  },
  {
    title: "Autopilot contrôlé",
    detail: "Les plans avancés restent en attente d'approbation; aucune mutation autonome n'est lancée par défaut.",
  },
];

export const tokConnectDeveloperPortalModules = [
  "Documentation OpenAPI",
  "Clients OAuth sandbox",
  "Exemples MCP",
  "Logs et quotas",
  "Configuration webhooks",
  "Rotation de secrets",
  "Runs Autopilot",
] as const;

export const tokConnectRoadmap: TokConnectRoadmapStep[] = [
  {
    step: 1,
    title: "TOK Connect Core API",
    outcome: "Restaurants, menus, disponibilités, previews, réservations et crédits.",
  },
  {
    step: 2,
    title: "OAuth scoped",
    outcome: "Clients partenaires, secrets hashés, tokens courts, révocation et quotas.",
  },
  {
    step: 3,
    title: "Webhooks signés",
    outcome: "Réservation créée, annulation, test webhook et campagne prévisualisée.",
  },
  {
    step: 4,
    title: "TOK MCP Server",
    outcome: "Tools, resources et prompts pour agents IA prudents.",
  },
  {
    step: 5,
    title: "Autopilot contrôlé",
    outcome: "Actions autonomes reportées après validation sécurité, produit et restaurateurs.",
  },
];

function normalizeIntent(intent: string) {
  return intent
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function detectTokConnectActor(
  normalizedIntent: string,
  forcedActor?: TokConnectIntentPlan["actor"],
): TokConnectIntentPlan["actor"] {
  if (forcedActor) return forcedActor;
  return includesAny(normalizedIntent, [
    "mon restaurant",
    "mes tables",
    "ma salle",
    "mon menu",
    "mes commandes",
    "mes reservations",
    "ma campagne",
    "mes clients",
    "mes credits",
    "mon abonnement",
    "restaurateur",
    "restaurant",
    "campagne",
    "remplir",
    "tables vides",
    "heures creuses",
    "crm",
  ])
    ? "restaurant"
    : "client";
}

export function buildTokConnectIntentPlan(
  intent: string,
  forcedActor?: TokConnectIntentPlan["actor"],
): TokConnectIntentPlan {
  const normalizedIntent = normalizeIntent(intent);
  const actor = detectTokConnectActor(normalizedIntent, forcedActor);

  if (actor === "restaurant") {
    if (includesAny(normalizedIntent, ["campagne", "promotion", "sponsor", "remplir", "tables vides", "heures creuses", "offre", "flash"])) {
      return {
        actor: "restaurant",
        mode: "suggest",
        primaryGoal: "campaign",
        requiredScopes: ["restaurants:read", "analytics:read", "credits:read", "campaigns:preview"],
        steps: [
          { title: "Lire les signaux restaurant", detail: "Analyser disponibilite, performance et contraintes deja autorisees." },
          { title: "Estimer le cout", detail: "Calculer les credits previsionnels sans engager de depense." },
          { title: "Generer une preview", detail: "Preparer un brouillon de campagne avec audience, message et budget." },
          { title: "Attendre validation", detail: "Bloquer publication, offre et depense tant que le restaurant n'a pas valide." },
        ],
        guardrails: [
          "Aucune campagne diffusee sans validation humaine",
          "Aucune depense de credits en mode preview",
          "Autopilot contrôlé: plan autorisé, exécution autonome bloquée",
        ],
        limits: { maxPartySize: 0, maxDailyReservations: 0, humanApprovalRequired: true },
      };
    }

    if (includesAny(normalizedIntent, ["reservation", "table", "couverts", "planning", "no show", "annulation"])) {
      return {
        actor: "restaurant",
        mode: "suggest",
        primaryGoal: "restaurant_reservations",
        requiredScopes: ["restaurants:read", "availability:read", "reservations:create", "reservations:cancel"],
        steps: [
          { title: "Identifier le service concerné", detail: "Lire le restaurant, le jour, le service et les contraintes de capacité." },
          { title: "Verifier les reservations existantes", detail: "Comparer couverts, tables bloquees, annulations et disponibilite temps reel." },
          { title: "Preparer l'action proposee", detail: "Retourner une recommandation: confirmer, deplacer, annuler ou ouvrir des creneaux." },
          { title: "Demander validation restaurant", detail: "Ne modifier aucune réservation ni capacité sans confirmation explicite." },
        ],
        guardrails: [
          "Validation restaurateur requise avant toute mutation",
          "Capacite relue cote serveur avant modification",
          "Historique conserve avec request_id et idempotency key",
        ],
        limits: { maxPartySize: 20, maxDailyReservations: 0, humanApprovalRequired: true },
      };
    }

    if (includesAny(normalizedIntent, ["commande", "livraison", "emporter", "pickup", "panier", "retard", "remboursement"])) {
      return {
        actor: "restaurant",
        mode: "read_only",
        primaryGoal: "restaurant_orders",
        requiredScopes: ["restaurants:read", "analytics:read"],
        steps: [
          { title: "Lire la file commandes", detail: "Filtrer par jour, statut, canal et priorite operationnelle." },
          { title: "Reperer les commandes a risque", detail: "Detecter retard, paiement incomplet, preparation longue ou livraison bloquee." },
          { title: "Proposer l'action la plus sûre", detail: "Suggérer accepter, préparer, contacter le client ou escalader au support." },
          { title: "Garder la mutation hors MCP v1", detail: "Les changements de statut restent dans le dashboard restaurant securise." },
        ],
        guardrails: [
          "Lecture seule pour les commandes en v1",
          "Aucune action paiement ou remboursement depuis le sandbox",
          "Les statuts critiques restent controles par le dashboard authentifie",
        ],
        limits: { maxPartySize: 0, maxDailyReservations: 0, humanApprovalRequired: true },
      };
    }

    if (includesAny(normalizedIntent, ["menu", "plat", "prix", "ingredient", "allergene", "photo", "galerie", "carte"])) {
      return {
        actor: "restaurant",
        mode: "suggest",
        primaryGoal: "restaurant_menu",
        requiredScopes: ["restaurants:read"],
        steps: [
          { title: "Lire la fiche restaurant", detail: "Recuperer menus publics, categories, prix et informations visibles." },
          { title: "Identifier les elements a ameliorer", detail: "Isoler plats, descriptions, prix, photos ou categories concernes par la demande." },
          { title: "Generer une recommandation", detail: "Proposer corrections, enrichissements ou priorites sans publier automatiquement." },
          { title: "Renvoyer vers l'outil proprietaire", detail: "Les modifications menu/photo restent faites dans le dashboard restaurant." },
        ],
        guardrails: [
          "Aucune modification de prix depuis TOK Connect public",
          "Les assets et menus restent soumis aux droits restaurateur",
          "Le sandbox ne remplace pas les validations du dashboard",
        ],
        limits: { maxPartySize: 0, maxDailyReservations: 0, humanApprovalRequired: true },
      };
    }

    if (includesAny(normalizedIntent, ["visuel", "studio", "marketing", "affiche", "post", "reseaux sociaux", "story", "flyer"])) {
      return {
        actor: "restaurant",
        mode: "suggest",
        primaryGoal: "restaurant_marketing",
        requiredScopes: ["restaurants:read", "credits:read", "campaigns:preview"],
        steps: [
          { title: "Comprendre le support", detail: "Identifier format, audience, offre, ton et contraintes de marque restaurant." },
          { title: "Verifier les credits", detail: "Lire le solde disponible avant de proposer une generation ou une campagne." },
          { title: "Construire une preview", detail: "Preparer brief, message, creneau de diffusion et estimation credit." },
          { title: "Attendre validation humaine", detail: "Aucune creation couteuse ni publication sans confirmation restaurateur." },
        ],
        guardrails: [
          "Credits verifies avant generation payante",
          "Publication reseaux sociaux bloquee sans validation",
          "Preview uniquement tant que l'utilisateur n'a pas confirme",
        ],
        limits: { maxPartySize: 0, maxDailyReservations: 0, humanApprovalRequired: true },
      };
    }

    if (includesAny(normalizedIntent, ["stat", "performance", "chiffre", "conversion", "remplissage", "analytics", "rapport"])) {
      return {
        actor: "restaurant",
        mode: "read_only",
        primaryGoal: "restaurant_analytics",
        requiredScopes: ["restaurants:read", "analytics:read"],
        steps: [
          { title: "Definir la periode", detail: "Comprendre date, canal, service et indicateurs demandes." },
          { title: "Lire les metriques autorisees", detail: "Recuperer reservations, commandes, conversions et signaux de remplissage." },
          { title: "Comparer les tendances", detail: "Mettre en evidence ecarts, opportunites et jours a optimiser." },
          { title: "Proposer des actions non mutantes", detail: "Retourner recommandations, sans changer offres, prix ou campagnes." },
        ],
        guardrails: [
          "Lecture seule des performances",
          "Donnees limitees aux restaurants autorises",
          "Aucune action commerciale automatique",
        ],
        limits: { maxPartySize: 0, maxDailyReservations: 0, humanApprovalRequired: false },
      };
    }

    if (includesAny(normalizedIntent, ["crm", "client", "fidelite", "actualite", "fil", "newsletter", "avis", "commentaire"])) {
      return {
        actor: "restaurant",
        mode: "suggest",
        primaryGoal: "restaurant_customer_engagement",
        requiredScopes: ["restaurants:read", "analytics:read", "campaigns:preview"],
        steps: [
          { title: "Qualifier l'audience", detail: "Identifier clients proches, suivis, avis, actualites ou segment CRM vise." },
          { title: "Verifier les droits du restaurant", detail: "Controler scopes, abonnement et consentements avant d'exposer les donnees." },
          { title: "Preparer un message validable", detail: "Generer une reponse, publication ou action CRM sans envoi automatique." },
          { title: "Bloquer l'envoi", detail: "Demander validation dans le dashboard avant publication ou notification." },
        ],
        guardrails: [
          "CRM et fil d'actualite soumis aux droits d'abonnement",
          "Aucun message client envoye automatiquement",
          "Respect consentements et opt-out marketing",
        ],
        limits: { maxPartySize: 0, maxDailyReservations: 0, humanApprovalRequired: true },
      };
    }

    if (includesAny(normalizedIntent, ["credit", "abonnement", "facture", "solde", "paiement", "wallet", "resilier", "downgrade"])) {
      return {
        actor: "restaurant",
        mode: "read_only",
        primaryGoal: "restaurant_account",
        requiredScopes: ["credits:read"],
        steps: [
          { title: "Lire le contexte compte", detail: "Identifier abonnement, solde de credits ou facture visee par la demande." },
          { title: "Verifier ce qui est consultable", detail: "Limiter la reponse au solde, aux periodes et aux informations non sensibles." },
          { title: "Orienter vers le bon parcours", detail: "Proposer recharge, attente du renouvellement, upgrade, downgrade ou support." },
          { title: "Bloquer les mutations sensibles", detail: "Aucun paiement, remboursement ou changement d'abonnement depuis le sandbox." },
        ],
        guardrails: [
          "Paiement et abonnement restent traites par Stripe et Edge Functions",
          "Aucun secret ni moyen de paiement expose",
          "Operations sensibles confirmees dans le dashboard authentifie",
        ],
        limits: { maxPartySize: 0, maxDailyReservations: 0, humanApprovalRequired: true },
      };
    }

    return {
      actor: "restaurant",
      mode: "suggest",
      primaryGoal: "restaurant_consent",
      requiredScopes: ["restaurants:read"],
      steps: [
        { title: "Clarifier le besoin restaurateur", detail: "Identifier restaurant, module concerne, objectif et niveau d'acces attendu." },
        { title: "Verifier les consentements", detail: "Controler que le restaurant a accorde les scopes et limites necessaires." },
        { title: "Composer une reponse prudente", detail: "Proposer une lecture, une preview ou un plan sans execution autonome." },
        { title: "Demander validation", detail: "Renvoyer toute mutation sensible vers le dashboard restaurant." },
      ],
      guardrails: [
        "Consentement restaurant requis avant acces aux donnees",
        "Scopes limites a l'usage demande",
        "Aucune execution autonome en production v1",
      ],
      limits: { maxPartySize: 0, maxDailyReservations: 0, humanApprovalRequired: true },
    };
  }

  if (includesAny(normalizedIntent, ["aide", "support", "probleme", "bug", "remboursement", "annuler", "retard"])) {
    return {
      actor: "client",
      mode: "read_only",
      primaryGoal: "support",
      requiredScopes: ["restaurants:read"],
      steps: [
        { title: "Comprendre le probleme", detail: "Identifier commande, reservation, paiement, compte ou incident signale." },
        { title: "Recueillir les references utiles", detail: "Demander numero de commande/reservation uniquement si necessaire." },
        { title: "Proposer le canal adapte", detail: "Orienter vers suivi, support TOK ou restaurant selon responsabilite." },
        { title: "Proteger les actions sensibles", detail: "Remboursement, annulation et donnees personnelles restent hors sandbox." },
      ],
      guardrails: [
        "Pas de remboursement depuis TOK Connect public",
        "Pas d'exposition de donnees personnelles sans auth",
        "Escalade support conservee dans les outils TOK",
      ],
      limits: { maxPartySize: 0, maxDailyReservations: 0, humanApprovalRequired: true },
    };
  }

  if (includesAny(normalizedIntent, ["reservation", "reserver", "table", "couverts", "personnes"])) {
    return buildLegacyTokConnectIntentPlan(intent);
  }

  if (includesAny(normalizedIntent, ["commande", "commander", "livraison", "emporter", "panier", "plat", "menu", "repas"])) {
    return {
      actor: "client",
      mode: "suggest",
      primaryGoal: "order",
      requiredScopes: ["restaurants:read"],
      steps: [
        { title: "Comprendre l'envie repas", detail: "Extraire cuisine, adresse, budget, mode livraison/emporter et contraintes alimentaires." },
        { title: "Chercher les restaurants compatibles", detail: "Lire restaurants actifs, menus publics, horaires et disponibilite de commande." },
        { title: "Preparer une proposition de panier", detail: "Retourner plats et alternatives sans creer de commande ni paiement." },
        { title: "Rediriger vers checkout TOK", detail: "Le paiement et la creation de commande restent dans le tunnel TOK securise." },
      ],
      guardrails: [
        "Aucun paiement declenche depuis le sandbox",
        "Prix et frais verifies cote serveur au checkout",
        "Commande creee uniquement dans le tunnel TOK authentifie",
      ],
      limits: { maxPartySize: 0, maxDailyReservations: 0, humanApprovalRequired: true },
    };
  }

  if (includesAny(normalizedIntent, ["miamz", "point", "fidelite", "cadeau", "abonnement", "profil", "compte"])) {
    return {
      actor: "client",
      mode: "read_only",
      primaryGoal: "loyalty",
      requiredScopes: ["restaurants:read"],
      steps: [
        { title: "Qualifier la demande compte", detail: "Identifier points, cadeau, abonnement ou preference de profil." },
        { title: "Limiter aux donnees autorisees", detail: "Ne lire que les informations accessibles a l'utilisateur authentifie." },
        { title: "Expliquer le prochain geste", detail: "Orienter vers profil, recompenses, abonnement ou support selon le besoin." },
        { title: "Bloquer toute action sensible", detail: "Pas de modification de compte ni achat depuis le sandbox public." },
      ],
      guardrails: [
        "Donnees personnelles limitees au compte authentifie",
        "Aucun achat ou modification d'abonnement automatique",
        "Consentement marketing respecte",
      ],
      limits: { maxPartySize: 0, maxDailyReservations: 0, humanApprovalRequired: true },
    };
  }

  if (includesAny(normalizedIntent, ["aide", "support", "probleme", "bug", "remboursement", "annuler", "retard"])) {
    return {
      actor: "client",
      mode: "read_only",
      primaryGoal: "support",
      requiredScopes: ["restaurants:read"],
      steps: [
        { title: "Comprendre le probleme", detail: "Identifier commande, reservation, paiement, compte ou incident signale." },
        { title: "Recueillir les references utiles", detail: "Demander numero de commande/reservation uniquement si necessaire." },
        { title: "Proposer le canal adapte", detail: "Orienter vers suivi, support TOK ou restaurant selon responsabilite." },
        { title: "Proteger les actions sensibles", detail: "Remboursement, annulation et donnees personnelles restent hors sandbox." },
      ],
      guardrails: [
        "Pas de remboursement depuis TOK Connect public",
        "Pas d'exposition de donnees personnelles sans auth",
        "Escalade support conservee dans les outils TOK",
      ],
      limits: { maxPartySize: 0, maxDailyReservations: 0, humanApprovalRequired: true },
    };
  }

  if (includesAny(normalizedIntent, ["decouvrir", "cherche", "trouve", "restaurant", "proche", "geneve", "italien", "burger", "halal", "vegetarien"])) {
    return {
      actor: "client",
      mode: "read_only",
      primaryGoal: "discovery",
      requiredScopes: ["restaurants:read"],
      steps: [
        { title: "Comprendre les criteres", detail: "Extraire ville, cuisine, budget, distance, ambiance et contraintes alimentaires." },
        { title: "Lire le catalogue autorise", detail: "Chercher restaurants actifs, menus publics et signaux utiles a la recommandation." },
        { title: "Classer les options", detail: "Prioriser pertinence, proximite, disponibilite et qualite des informations." },
        { title: "Proposer sans mutation", detail: "Retourner des restaurants et liens TOK sans reservation ni commande automatique." },
      ],
      guardrails: [
        "Lecture seule du catalogue public",
        "Aucune reservation ni commande sans action client",
        "Resultats bornes par les restaurants autorises",
      ],
      limits: { maxPartySize: 0, maxDailyReservations: 0, humanApprovalRequired: false },
    };
  }

  return buildLegacyTokConnectIntentPlan(intent);
}

function buildLegacyTokConnectIntentPlan(intent: string): TokConnectIntentPlan {
  const normalizedIntent = normalizeIntent(intent);
  const isRestaurantIntent = includesAny(normalizedIntent, [
    "mon restaurant",
    "campagne",
    "remplir",
    "tables vides",
    "heures creuses",
    "credits",
  ]);

  if (isRestaurantIntent) {
    return {
      actor: "restaurant",
      mode: "suggest",
      primaryGoal: "campaign",
      requiredScopes: ["restaurants:read", "analytics:read", "credits:read", "campaigns:preview"],
      steps: [
        {
          title: "Lire les signaux restaurant",
          detail: "Analyser disponibilité, performance et contraintes déjà autorisées.",
        },
        {
          title: "Estimer le coût",
          detail: "Calculer les crédits prévisionnels sans engager de dépense.",
        },
        {
          title: "Générer une preview",
          detail: "Préparer un brouillon de campagne avec audience, message et budget.",
        },
        {
          title: "Attendre validation",
          detail: "Bloquer publication, offre et dépense tant que le restaurant n'a pas validé.",
        },
      ],
      guardrails: [
        "Aucune campagne diffusée sans validation humaine",
        "Aucune dépense de crédits en mode preview",
        "Autopilot contrôlé: plan autorisé, exécution autonome bloquée",
      ],
      limits: {
        maxPartySize: 0,
        maxDailyReservations: 0,
        humanApprovalRequired: true,
      },
    };
  }

  return {
    actor: "client",
    mode: "suggest",
    primaryGoal: "reservation",
    requiredScopes: ["restaurants:read", "availability:read", "reservations:create"],
    steps: [
      {
        title: "Comprendre l'intention",
        detail: "Extraire cuisine, ville, budget, nombre de personnes, date et horaire.",
      },
      {
        title: "Comparer les tables compatibles",
        detail: "Croiser restaurants actifs, menus et disponibilité temps réel.",
      },
      {
        title: "Préparer la réservation",
        detail: "Retourner un récapitulatif confirmable sans mutation initiale.",
      },
      {
        title: "Créer après confirmation",
        detail: "Appeler l'API avec Idempotency-Key et preuve de confirmation utilisateur.",
      },
    ],
    guardrails: [
      "Confirmation client requise avant création de réservation",
      "Capacité revérifiée par l'API serveur avant mutation",
      "Webhook signé après réservation confirmée",
    ],
    limits: {
      maxPartySize: 20,
      maxDailyReservations: 0,
      humanApprovalRequired: true,
    },
  };
}
