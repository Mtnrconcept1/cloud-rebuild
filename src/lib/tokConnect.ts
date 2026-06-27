export type TokConnectIntentPlan = {
  actor: "client" | "restaurant";
  mode: "read_only" | "suggest" | "autopilot_bounded";
  primaryGoal: "discovery" | "reservation" | "campaign" | "restaurant_consent";
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

export function buildTokConnectIntentPlan(intent: string): TokConnectIntentPlan {
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
