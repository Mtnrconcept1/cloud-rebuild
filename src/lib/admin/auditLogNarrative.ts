/**
 * Turns raw audit rows into plain-French explanations for the admin security
 * page. Operators should never have to decode `ops_control_secret_not_configured`
 * or `menu_items 4f3a-…` themselves.
 *
 * The vocabularies below were built from the actual production audit tables, so
 * the frequent cases are named explicitly and everything else still degrades to
 * a readable sentence instead of a raw identifier.
 */

export type AuditNarrativeSource = "edge" | "data";
export type AuditNarrativeStatus = "success" | "failure" | "info";
export type AuditNarrativeActor = "scheduler" | "service_role" | "user";

export type AuditNarrativeInput = {
  source: AuditNarrativeSource;
  action: string;
  functionName: string;
  status: AuditNarrativeStatus;
  actorLabel: string;
  actorType: AuditNarrativeActor;
  targetType: string;
  targetId: string;
  errorMessage?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type AuditNarrative = {
  /** One sentence answering "what happened", readable without context. */
  headline: string;
  /** What the operation does, in business terms. */
  what: string;
  /** How it ended. */
  outcome: string;
  /** Why the failure happened, when the cause is recognised. */
  cause: string | null;
  /** Concrete consequence for the platform or the users. */
  impact: string;
  /** What an operator should do next. */
  recommendation: string;
  /** True when the error code was recognised rather than generically phrased. */
  causeIdentified: boolean;
};

/** What each Edge Function is for, phrased as a noun group. */
const FUNCTION_PURPOSE: Record<string, string> = {
  "send-email": "l’envoi des e-mails transactionnels en file d’attente",
  "send-push": "l’envoi des notifications push en file d’attente",
  "notification-dispatch": "la distribution des notifications programmées",
  "stripe-worker": "le traitement différé des abonnements restaurateur",
  "stripe-subscription-reconcile": "la réconciliation des abonnements restaurateur avec Stripe",
  "stripe-webhook": "la réception des événements de paiement Stripe",
  "reconcile-paid-order-checkouts": "la réconciliation des commandes payées",
  "capture-due-match-groups": "l’encaissement des paiements autorisés des commandes groupées",
  "reconcile-match-group-authorizations": "le contrôle des autorisations de paiement des commandes groupées",
  "close-due-match-groups": "la clôture des commandes groupées arrivées à échéance",
  "authorize-match-group-order": "l’autorisation de paiement d’une commande groupée",
  "confirm-match-group-authorization": "la confirmation d’une autorisation de paiement groupée",
  "ops-incident-native-scan": "la détection automatique des incidents techniques",
  "ops-incident-control": "le pilotage des incidents et des réparations assistées",
  "daily-dish-ai": "la génération des plats du jour par IA",
  "aligro-catalog-sync": "la mise à jour hebdomadaire du catalogue de prix Aligro",
  "google-actions-center-sync": "l’envoi des mises à jour de disponibilité et de réservation à Google",
  "menu-image-import": "l’extraction d’une carte de restaurant depuis des photos",
  "ai-image-enhance": "la génération ou la retouche d’images par IA",
  "ai-client-support": "l’assistance IA côté client",
  "ai-client-chat": "la conversation IA côté client",
  "ai-restaurant-agent": "l’assistant IA du restaurateur",
  "ai-restaurant-tools": "les outils IA du restaurateur",
  "ai-admin-support": "l’assistance IA côté administration",
  "ai-admin-dashboard-chat": "l’assistant IA du tableau de bord admin",
  "ai-admin-monitor": "la surveillance IA de la plateforme",
  "ai-accounting-agent": "l’assistant IA de comptabilité",
  "ai-social-post-copy": "la rédaction IA des publications",
  "ai-campaign-studio": "la génération et l’orchestration des campagnes marketing par IA",
  "ai-guardian": "l’analyse IA de la santé, de la sécurité et des incidents de la plateforme",
  "ai-support-resolution": "l’assistance IA à l’analyse et à la résolution des incidents support",
  "customer-memory": "la gestion consentie des préférences et de la mémoire client",
  "validate-order": "la validation et la création d’une commande",
  "create-reservation": "la validation et la création d’une réservation",
  "create-zero-attente-reservation": "la création d’une réservation Zéro Attente",
  "create-chefs-table-reservation": "la création d’une réservation Table du Chef",
  "create-checkout": "l’ouverture d’une session de paiement",
  "complete-order-checkout": "la finalisation du paiement d’une commande",
  "cancel-pending-order-checkout": "l’annulation d’un paiement de commande en attente",
  "complete-restaurant-credit-pack-checkout": "l’achat d’un pack de crédits TOK",
  "process-refund": "le traitement d’un remboursement",
  "payment-attempt-status": "la consultation de l’état d’une tentative de paiement",
  "cancel-payment-attempt": "l’annulation d’une tentative de paiement",
  "stripe-connect-onboard": "l’inscription d’un restaurant à Stripe Connect",
  "stripe-connect-status": "la vérification du compte Stripe Connect d’un restaurant",
  "courier-portal": "le portail livreur",
  "dispatch-order": "l’attribution d’une commande à un livreur",
  "dispatch-timeout": "la relance des commandes sans livreur",
  "restaurant-order-status": "la mise à jour du statut d’une commande côté restaurant",
  "generate-invoices": "la génération des factures",
  "settle-developer-statement": "le règlement d’un relevé développeur",
  "campaign-portal": "la gestion des campagnes sponsorisées",
  "generate-campaign": "la génération d’une campagne marketing",
  "ai-marketing-agent": "la rédaction par IA d’un plan de campagne marketing soumis à approbation",
  "marketing-orchestrator": "l’exécution gouvernée des campagnes marketing planifiées",
  "marketing-unsubscribe": "le désabonnement en un clic demandé par un destinataire de campagne",
  "marketing-provider-webhook": "la réception sécurisée des événements des fournisseurs marketing",
  "create-social-post-boost": "la mise en avant payante d’une publication",
  "track-analytics": "la collecte des événements d’analyse",
  "track-sponsored-event": "la collecte des événements sponsorisés",
  "daily-slot-spin": "le tirage quotidien MIAMZ",
  "delete-account": "la suppression d’un compte utilisateur",
  "submit-signup-application": "le dépôt d’une demande d’inscription",
  "provision-commercial-accounts": "la création des comptes commerciaux",
  "provision-commercial-demo-logins": "la création des accès de démonstration commerciale",
  "provision-commercial-demo-project-session": "l’ouverture d’une session de démonstration isolée",
  "commercial-demo-checkout": "un paiement simulé de démonstration",
  "commercial-demo-ai": "les appels IA de la démonstration commerciale",
  "commercial-followup-reminder": "les relances de prospection commerciale",
  "admin-demo-entities": "la gestion des entités de démonstration",
  "admin-restaurant-adjustment": "un ajustement administratif sur un restaurant",
  "crm-mfa-recovery": "la récupération d’un accès CRM à double facteur",
  "contact-support": "l’envoi d’un message au support",
  "restaurant-media-governance": "la gouvernance des médias d’un restaurant",
  "analyze-restaurant-image": "l’analyse IA d’une image de restaurant",
  "floorplan-ai": "la génération IA d’un plan de salle",
  "restaurant-advisor": "les recommandations IA au restaurateur",
  "enrich-directory-images": "l’enrichissement automatique des images des restaurants de l’annuaire",
  "enrich-directory-cuisines": "l’enrichissement vérifié des cuisines des restaurants de l’annuaire",
  "enrich-directory-cuisines-osm": "la vérification géolocalisée des cuisines des restaurants de l’annuaire via OpenStreetMap",
  "verify-directory-commercial-names": "la vérification automatique des noms commerciaux des restaurants de l’annuaire",
  "enrich-restaurants": "l’enrichissement des fiches restaurant",
  "scrape-restaurants": "la collecte de fiches restaurant",
  "google-actions-center": "la synchronisation avec Google Actions Center",
  "manage-restaurant-subscription": "la gestion de l’abonnement d’un restaurant",
  "manage-tok-one-subscription": "la gestion d’un abonnement TOK One",
  "sync-apple-storekit": "la validation et la synchronisation d’un abonnement Tok One acheté via Apple",
  "apple-storekit-webhook": "la réception des renouvellements, résiliations et remboursements Tok One envoyés par Apple",
  "tok-connect-mcp": "le connecteur MCP TOK Connect pour ChatGPT",
  "tok-connect-api": "l’API partenaires TOK Connect",
  "tok-connect-oauth": "l’authentification OAuth de TOK Connect",
  "tok-connect-portal": "le portail partenaires TOK Connect",
  "tok-connect-webhook-dispatch": "l’envoi des webhooks aux partenaires TOK Connect",
  "tok-connect-full-app-mcp": "la surface MCP applicative TOK Connect",
  "tok-connect-chatgpt": "la passerelle MCP publique TOK Connect utilisée par ChatGPT",
  "tok-connect-remote-mcp": "la passerelle MCP distante universelle TOK Connect pour Claude, ChatGPT et les autres agents compatibles",
  "tok-connect-app-bridge": "la passerelle d’exécution authentifiée entre les agents MCP et les capacités métier TOK",
  "tok-connect-commercial-bridge": "la passerelle MCP authentifiée et isolée de l’espace commercial TOK",
  "tok-pulse-widget": "l’agrégation publique des signaux affichés par le widget TOK Pulse",
  "validate-order-preview": "la simulation du prix d’une commande",
};

/** Business meaning of the recurring `action` values. */
const ACTION_PURPOSE: Record<string, string> = {
  process_email_queue: "vider la file des e-mails à envoyer",
  process_push_queue: "vider la file des notifications push",
  flush_notification_queue: "vider la file des notifications",
  process_restaurant_subscription_activations: "activer les abonnements restaurateur payés",
  reconcile_restaurant_subscriptions: "rapprocher l’état des abonnements restaurateur avec Stripe",
  reconcile_paid_order_checkouts: "rapprocher les paiements Stripe des commandes",
  capture_authorized_payments: "encaisser les paiements précédemment autorisés",
  reconcile_authorizations: "vérifier les autorisations de paiement en cours",
  verify_signature: "vérifier la signature d’un webhook Stripe",
  scan_runtime_incidents: "rechercher les incidents techniques en cours",
  scan: "rechercher les incidents techniques en cours",
  validate_and_create_order: "valider puis créer une commande",
  preview_order_pricing: "calculer le prix d’une commande avant validation",
  validate_and_create_reservation: "valider puis créer une réservation",
  extract_menu_from_images: "lire une carte de restaurant depuis des photos",
  image_generate: "générer une image par IA",
  image_enhance: "retoucher une image par IA",
  ai_support_chat: "répondre à une demande d’assistance",
  admin_dashboard_ai_chat: "répondre à une question dans le tableau de bord admin",
  spin_awarded: "attribuer un gain du tirage quotidien",
  create_test_checkout: "simuler un paiement de démonstration",
  provision_demo_session: "ouvrir une session de démonstration isolée",
  reset_password: "réinitialiser un mot de passe",
  create: "créer un compte",
  request_crm_mfa_recovery: "demander la récupération d’un accès CRM",
  submit_privileged_signup_draft: "soumettre une demande d’inscription privilégiée",
  create_stripe_connect_onboarding_link: "générer un lien d’inscription Stripe Connect",
  issue_client_credentials_token: "délivrer un jeton d’accès partenaire",
  cancel_payment_attempt: "annuler une tentative de paiement",
  complete_restaurant_credit_pack_checkout: "finaliser l’achat d’un pack de crédits",
  reject_public_analytics_event: "rejeter un événement d’analyse non conforme",
  directory_cuisine_osm_enrichment_batch: "vérifier un lot de cuisines depuis des établissements OpenStreetMap recoupés",
  invoke: "exécuter la fonction",
};

/** Table names as an operator would name them. */
const ENTITY_LABELS: Record<string, string> = {
  restaurants: "la fiche d’un restaurant",
  orders: "une commande",
  reservations: "une réservation",
  menu_items: "un plat de la carte",
  feature_flag: "un indicateur de fonctionnalité",
  feature_flags: "un indicateur de fonctionnalité",
  user_roles: "les rôles d’un utilisateur",
  restaurant_branch: "un plan de salle",
  restaurant_invoices: "les factures d’un restaurant",
  anti_waste_offer: "une offre anti-gaspi",
  admin_user_account_states: "l’état d’un compte utilisateur",
  commercial_demo_account: "un compte de démonstration commerciale",
  profiles: "un profil utilisateur",
  social_posts: "une publication Actualités",
  ad_campaigns: "une campagne sponsorisée",
  payment_transactions: "une transaction de paiement",
};

/** Data-audit verbs. */
const DATA_ACTION_VERBS: Record<string, string> = {
  INSERT: "a créé",
  UPDATE: "a modifié",
  DELETE: "a supprimé",
};

type ErrorExplanation = {
  cause: string;
  impact: string;
  recommendation: string;
};

type ErrorRule = {
  match: RegExp;
  explain: ErrorExplanation;
};

const ERROR_RULES: ErrorRule[] = [
  {
    match: /^missing stripe-signature header$/i,
    explain: {
      cause: "La requête est arrivée sur l’URL du webhook Stripe sans l’en-tête de signature. C’est la signature d’un appel qui ne vient pas de Stripe : robot d’indexation, scanner de sécurité ou test manuel.",
      impact: "Aucun paiement n’est affecté : l’appel a été rejeté avant tout traitement, exactement comme prévu.",
      recommendation: "Aucune action si le volume reste stable. Une hausse brutale traduit un balayage automatisé : vérifier l’adresse IP source et, au besoin, la bloquer en amont.",
    },
  },
  {
    match: /no signatures found matching the expected signature/i,
    explain: {
      cause: "Stripe a bien signé l’événement mais la signature ne correspond pas au secret configuré, ou le corps de la requête a été modifié avant vérification.",
      impact: "L’événement de paiement n’a pas été traité : un encaissement, un remboursement ou une activation d’abonnement peut être resté en attente.",
      recommendation: "Vérifier que le secret de webhook Stripe correspond bien à l’environnement utilisé et qu’aucun proxy ne réécrit le corps de la requête. Rejouer ensuite l’événement depuis le tableau de bord Stripe.",
    },
  },
  {
    match: /^unauthorized$|^authentification requise$/i,
    explain: {
      cause: "L’appel a été refusé faute d’identité valide : jeton absent, expiré, ou clé de service non transmise. Sur les tâches planifiées, c’est le symptôme d’un secret d’ordonnanceur non synchronisé.",
      impact: "L’opération n’a pas été exécutée. Si elle est planifiée, le traitement correspondant a été sauté pour ce cycle.",
      recommendation: "Identifier l’appelant : s’il s’agit d’un cron TOK, vérifier le secret d’ordonnanceur ; s’il s’agit d’un utilisateur, contrôler sa session et ses rôles. Un volume élevé et répété depuis l’extérieur signale une tentative d’accès à surveiller.",
    },
  },
  {
    match: /ops_control_secret_not_configured|ops_control_credentials_not_configured/i,
    explain: {
      cause: "Le secret de contrôle des incidents n’est pas présent dans l’environnement des fonctions Edge, donc le scan n’a pas pu s’authentifier auprès du plan de contrôle.",
      impact: "La détection automatique des incidents ne tourne pas : les pannes ne sont ni enregistrées ni notifiées tant que le secret manque.",
      recommendation: "Provisionner les secrets d’incident dans l’environnement de production puis relancer la synchronisation. Voir le guide « incidents Telegram avec réparation Codex ».",
    },
  },
  {
    match: /ai_credits_exhausted/i,
    explain: {
      cause: "Le restaurant n’a plus assez de crédits TOK pour payer cette génération IA.",
      impact: "La génération a été refusée avant tout appel facturé au fournisseur : aucun coût n’a été engagé.",
      recommendation: "Vérifier le solde du restaurant et son abonnement. Proposer une recharge de crédits si l’usage est légitime.",
    },
  },
  {
    match: /ai_rate_limited|rate_limited|too many requests/i,
    explain: {
      cause: "Le nombre d’appels autorisés sur la période a été dépassé, côté TOK ou côté fournisseur IA.",
      impact: "La demande a été refusée temporairement. Aucune donnée n’est perdue, l’utilisateur peut réessayer.",
      recommendation: "Contrôler la fréquence d’appel de l’utilisateur ou du restaurant concerné. Une répétition anormale peut indiquer une boucle applicative.",
    },
  },
  {
    match: /ai_timeout/i,
    explain: {
      cause: "Le fournisseur IA n’a pas répondu dans le délai imparti.",
      impact: "La génération a été abandonnée. Aucun contenu n’a été produit et l’utilisateur a vu une erreur.",
      recommendation: "Réessayer : les dépassements ponctuels sont normaux. Des échecs répétés indiquent un délai trop court ou un modèle trop lent pour ce traitement.",
    },
  },
  {
    match: /ai_service_unavailable|ai_provider_billing_unavailable|ai_service_error/i,
    explain: {
      cause: "Le fournisseur IA est indisponible ou sa facturation est bloquée.",
      impact: "Toutes les générations IA concernées échouent tant que le fournisseur ne répond pas normalement.",
      recommendation: "Vérifier l’état du fournisseur et la validité de la clé API ainsi que le moyen de paiement associé.",
    },
  },
  {
    match: /domain is not verified/i,
    explain: {
      cause: "Le fournisseur d’e-mail refuse d’expédier car le domaine d’envoi n’est pas vérifié chez lui.",
      impact: "Les e-mails concernés ne partent pas : confirmations, factures ou réinitialisations de mot de passe n’arrivent pas aux destinataires.",
      recommendation: "Finaliser la vérification du domaine chez le fournisseur d’e-mail (enregistrements DNS), puis relancer la file d’envoi.",
    },
  },
  {
    match: /recovery_email_delivery_failed/i,
    explain: {
      cause: "L’e-mail de récupération n’a pas pu être remis au destinataire.",
      impact: "L’utilisateur reste bloqué hors de son accès sécurisé tant qu’il ne reçoit pas le message.",
      recommendation: "Vérifier l’état du fournisseur d’e-mail et la validité de l’adresse, puis relancer la procédure de récupération.",
    },
  },
  {
    match: /payment_attempt_session_mismatch|PAYMENT_ATTEMPT_ABANDON_FAILED/i,
    explain: {
      cause: "La tentative de paiement que l’on cherchait à abandonner ne correspond pas à la session de paiement fournie.",
      impact: "La tentative reste ouverte côté TOK. Elle peut bloquer une nouvelle tentative sur la même commande.",
      recommendation: "Ouvrir la commande concernée, comparer la tentative enregistrée à la session Stripe réelle, puis laisser la réconciliation automatique clore l’écart avant toute intervention manuelle.",
    },
  },
  {
    match: /original_payment_ledger_missing/i,
    explain: {
      cause: "L’écriture comptable d’origine du paiement est introuvable, alors qu’une opération dérivée (remboursement ou ajustement) la référence.",
      impact: "La comptabilité de cette opération est incomplète : le remboursement ne peut pas être rattaché à son encaissement.",
      recommendation: "Retrouver la transaction Stripe autoritaire et vérifier si l’encaissement initial a bien été journalisé. Ne pas créer d’écriture manuelle avant cette vérification.",
    },
  },
  {
    match: /payment_intent_id_required/i,
    explain: {
      cause: "L’opération de paiement a été demandée sans l’identifiant d’intention de paiement obligatoire.",
      impact: "L’opération a été refusée avant tout mouvement d’argent.",
      recommendation: "Vérifier le parcours qui a émis l’appel : un identifiant manquant traduit généralement une session expirée ou un appel hors séquence.",
    },
  },
  {
    match: /stripe test n'est pas configur|stripe test n’est pas configur/i,
    explain: {
      cause: "Le mode de paiement de test n’est pas configuré sur cet environnement.",
      impact: "Les paiements simulés de démonstration ne peuvent pas aboutir. Aucun paiement réel n’est concerné.",
      recommendation: "Renseigner les clés Stripe de test si la démonstration doit accepter des paiements simulés.",
    },
  },
  {
    match: /session stripe non pay|session stripe invalide/i,
    explain: {
      cause: "La session de paiement référencée n’est pas dans l’état attendu : elle n’a pas été réglée ou n’est pas valide pour cette opération.",
      impact: "La contrepartie n’a pas été délivrée : ni crédits, ni abonnement, ni commande validée.",
      recommendation: "Vérifier l’état réel de la session côté Stripe. Si elle est payée, laisser la réconciliation automatique rattraper l’écart avant toute action manuelle.",
    },
  },
  {
    match: /deferred_subscription_contract_snapshot_is_immutable/i,
    explain: {
      cause: "Une modification a été tentée sur un contrat d’abonnement déjà figé. Ces instantanés sont volontairement immuables pour garantir la traçabilité de la facturation.",
      impact: "La mise à jour a été refusée. La facturation existante reste intacte et cohérente.",
      recommendation: "Ne pas forcer la modification : créer un nouvel avenant ou un nouveau cycle d’abonnement plutôt que réécrire l’historique contractuel.",
    },
  },
  {
    match: /DEMO_SIDE_EFFECT_BLOCKED/i,
    explain: {
      cause: "Une action à effet externe a été tentée depuis l’environnement de démonstration, où elle est volontairement désactivée.",
      impact: "Aucun effet réel : le garde-fou a fonctionné et protège la production des manipulations de démonstration commerciale.",
      recommendation: "Aucune action. Ce message confirme que l’isolation de la démonstration commerciale tient.",
    },
  },
  {
    match: /violates not-null constraint|violates foreign key constraint|violates check constraint|duplicate key value/i,
    explain: {
      cause: "La base de données a refusé l’écriture parce qu’elle violait une règle d’intégrité (champ obligatoire manquant, référence inexistante ou doublon).",
      impact: "L’enregistrement n’a pas été créé ou modifié. C’est un défaut applicatif, pas une action malveillante.",
      recommendation: "Corriger le code qui construit l’enregistrement pour qu’il respecte la contrainte. Les données existantes ne sont pas altérées.",
    },
  },
  {
    match: /row-level security|permission denied|42501/i,
    explain: {
      cause: "La politique de sécurité au niveau des lignes a refusé l’accès : le compte appelant n’a pas le droit de lire ou d’écrire cette donnée.",
      impact: "L’opération a été bloquée. Les données restent protégées.",
      recommendation: "Vérifier les rôles du compte et la légitimité de la demande. Un refus répété sur des données sensibles mérite une investigation.",
    },
  },
  {
    match: /cannot read properties of|is not a function|undefined is not an object/i,
    explain: {
      cause: "Le code a rencontré une donnée d’une forme inattendue et s’est interrompu. C’est un défaut logiciel, pas un problème de droits.",
      impact: "L’opération a échoué et sera probablement rejouée à l’identique tant que le code n’est pas corrigé.",
      recommendation: "Traiter comme un bug : reproduire à partir des métadonnées enregistrées, puis corriger la lecture du champ concerné.",
    },
  },
  {
    match: /method_not_allowed/i,
    explain: {
      cause: "La méthode HTTP employée n’est pas acceptée par ce point d’entrée.",
      impact: "L’appel a été rejeté sans traitement.",
      recommendation: "Vérifier l’appelant : c’est souvent un test manuel ou un outil mal configuré.",
    },
  },
  {
    match: /response_type_code_required|redirect_uri_not_allowed|invalid_client/i,
    explain: {
      cause: "La demande d’authentification partenaire ne respecte pas le protocole OAuth attendu (type de réponse, URL de retour ou identifiant client invalide).",
      impact: "Le partenaire n’a pas pu obtenir d’accès. Aucune donnée n’a été exposée.",
      recommendation: "Comparer la configuration du client OAuth partenaire avec celle attendue par TOK Connect, en particulier l’URL de retour déclarée.",
    },
  },
  {
    match: /restaurant est ferm|ne prend pas de commandes/i,
    explain: {
      cause: "Le restaurant n’accepte pas de commande ou de réservation sur ce créneau.",
      impact: "Aucune anomalie technique : la règle métier a correctement refusé la demande du client.",
      recommendation: "Aucune action. Si le restaurateur conteste, vérifier ses horaires d’ouverture et sa disponibilité déclarée.",
    },
  },
  {
    match: /mot de passe doit contenir/i,
    explain: {
      cause: "Le mot de passe proposé ne respecte pas la politique de robustesse exigée.",
      impact: "Le compte n’a pas été créé ou modifié. La politique de sécurité a fonctionné.",
      recommendation: "Aucune action. Des échecs massifs sur ce contrôle peuvent en revanche signaler une tentative automatisée de création de comptes.",
    },
  },
  {
    match: /managing losses for connected accounts/i,
    explain: {
      cause: "Stripe exige que le profil de la plateforme précise la prise en charge des litiges avant d’autoriser cette opération sur les comptes connectés.",
      impact: "L’inscription ou la mise à jour du compte connecté du restaurant est bloquée.",
      recommendation: "Compléter le profil de plateforme dans le tableau de bord Stripe, puis relancer l’inscription du restaurant.",
    },
  },
  {
    match: /^erreur interne$|^\{\}$|^internal_error$/i,
    explain: {
      cause: "L’erreur a été renvoyée sans détail exploitable, volontairement masquée à l’appelant.",
      impact: "L’opération a échoué sans qu’on puisse en déduire la cause depuis cette seule ligne.",
      recommendation: "Ouvrir les métadonnées complètes ci-dessous et croiser avec les journaux de la fonction au même horodatage.",
    },
  },
];

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function stripTrailingDot(value: string) {
  return value.replace(/\s*\.\s*$/, "");
}

function extractActionKey(action: string, functionName: string) {
  const raw = normalizeText(action);
  if (!raw) return "";
  const prefix = `${functionName}:`;
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
}

export function humanizeIdentifier(value: string) {
  const normalized = normalizeText(value).replace(/[_-]+/g, " ").trim();
  if (!normalized) return "";
  return capitalizeFirst(normalized);
}

function capitalizeFirst(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) return "";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function describeAuditFunction(functionName: string) {
  const known = FUNCTION_PURPOSE[normalizeText(functionName)];
  if (known) return known;
  const humanized = humanizeIdentifier(functionName);
  return humanized ? `l’opération « ${humanized} »` : "une opération de la plateforme";
}

export function describeAuditAction(action: string, functionName: string) {
  const key = extractActionKey(action, functionName);
  const known = ACTION_PURPOSE[key];
  if (known) return known;
  const humanized = humanizeIdentifier(key);
  return humanized ? humanized.toLowerCase() : "";
}

export function describeAuditEntity(entityType: string) {
  const known = ENTITY_LABELS[normalizeText(entityType)];
  if (known) return known;
  const humanized = humanizeIdentifier(entityType);
  return humanized ? `un enregistrement « ${humanized} »` : "un enregistrement";
}

export function describeAuditActor(input: Pick<AuditNarrativeInput, "actorType" | "actorLabel">) {
  if (input.actorType === "scheduler") return "Le planificateur automatique TOK";
  if (input.actorType === "service_role") return "Un service interne TOK";
  const label = normalizeText(input.actorLabel);
  if (!label || label === "utilisateur") return "Un utilisateur connecté";
  return `L’utilisateur ${label}`;
}

export function explainAuditError(errorMessage: string): ErrorExplanation | null {
  const message = normalizeText(errorMessage);
  if (!message) return null;
  return ERROR_RULES.find((rule) => rule.match.test(message))?.explain ?? null;
}

function describeStripeEvent(action: string) {
  const event = normalizeText(action);
  if (!event.includes(".")) return null;
  const labels: Record<string, string> = {
    "checkout.session.expired": "une session de paiement a expiré sans être réglée",
    "checkout.session.completed": "une session de paiement a été réglée",
    "charge.refunded": "un paiement a été remboursé",
    "invoice.paid": "une facture d’abonnement a été payée",
    "invoice.payment_succeeded": "le paiement d’une facture d’abonnement a abouti",
    "invoice.payment_failed": "le paiement d’une facture d’abonnement a échoué",
    "customer.subscription.created": "un abonnement a été créé",
    "customer.subscription.updated": "un abonnement a été modifié",
    "customer.subscription.deleted": "un abonnement a été résilié",
    "customer.created": "un client Stripe a été créé",
    "payment_intent.succeeded": "une intention de paiement a abouti",
    "payment_intent.payment_failed": "une intention de paiement a échoué",
  };
  if (labels[event]) return labels[event];
  if (event.startsWith("v2.core.account")) return "un compte connecté Stripe a été mis à jour";
  return `l’événement Stripe « ${event} » a été reçu`;
}

function buildEdgeNarrative(input: AuditNarrativeInput): AuditNarrative {
  const actor = describeAuditActor(input);
  const purpose = describeAuditFunction(input.functionName);
  const actionText = describeAuditAction(input.action, input.functionName);
  const stripeEvent = input.functionName === "stripe-webhook"
    ? describeStripeEvent(extractActionKey(input.action, input.functionName))
    : null;

  const what = stripeEvent
    ? `Sur ${purpose}, ${stripeEvent}.`
    : actionText
      ? `${capitalizeFirst(purpose)} : ${actionText}.`
      : `${capitalizeFirst(purpose)}.`;

  const explanation = input.status === "failure"
    ? explainAuditError(normalizeText(input.errorMessage))
    : null;

  if (input.status === "failure") {
    const rawError = normalizeText(input.errorMessage);
    const headline = `${actor} n’a pas pu mener à bien ${purpose}.`;
    return {
      headline,
      what,
      outcome: "L’opération a échoué et n’a produit aucun effet.",
      cause: explanation
        ? explanation.cause
        : rawError
          ? `Le service a renvoyé « ${stripTrailingDot(rawError)} », un message technique qui n’est pas encore traduit dans ce guide.`
          : "Aucun message d’erreur n’a été enregistré, ce qui rend la cause indéterminable depuis cette seule ligne.",
      impact: explanation
        ? explanation.impact
        : "L’effet dépend de l’opération concernée : vérifier si un traitement en attente doit être rejoué.",
      recommendation: explanation
        ? explanation.recommendation
        : "Ouvrir les métadonnées complètes, croiser avec les journaux de la fonction au même horodatage, puis corriger la cause avant de relancer.",
      causeIdentified: Boolean(explanation),
    };
  }

  const succeeded = input.status === "success";
  return {
    headline: `${actor} a ${succeeded ? "exécuté avec succès" : "enregistré"} ${purpose}.`,
    what,
    outcome: succeeded
      ? "L’opération s’est terminée normalement."
      : "L’événement a été journalisé à titre informatif.",
    cause: null,
    impact: succeeded
      ? "Aucun impact négatif : cette ligne sert de preuve de bon fonctionnement."
      : "Aucun impact direct : cette ligne documente le déroulement de l’opération.",
    recommendation: "Aucune action requise. Vérifier uniquement que l’acteur et la cible correspondent à ce qui est attendu.",
    causeIdentified: false,
  };
}

function buildDataNarrative(input: AuditNarrativeInput): AuditNarrative {
  const actor = describeAuditActor(input);
  const entity = describeAuditEntity(input.targetType);
  const rawAction = normalizeText(input.action);
  const verb = DATA_ACTION_VERBS[rawAction.toUpperCase()];
  const targetId = normalizeText(input.targetId);
  const reference = targetId ? ` (référence ${targetId})` : "";

  if (verb) {
    const isDelete = rawAction.toUpperCase() === "DELETE";
    return {
      headline: `${actor} ${verb} ${entity}${reference}.`,
      what: `Modification directe en base de données sur ${entity}.`,
      outcome: "La modification a été enregistrée dans l’historique des données.",
      cause: null,
      impact: isDelete
        ? "Une suppression est difficilement réversible : vérifier qu’elle était bien intentionnelle."
        : "Les valeurs avant et après sont conservées ci-dessous, ce qui permet de contrôler exactement ce qui a changé.",
      recommendation: isDelete
        ? "Confirmer que l’auteur avait le droit de supprimer cet élément et que la suppression était demandée. Comparer les données d’origine ci-dessous avant toute restauration."
        : "Comparer les valeurs avant et après pour valider que le changement correspond à une demande légitime.",
      causeIdentified: false,
    };
  }

  const humanizedAction = humanizeIdentifier(rawAction);
  return {
    headline: `${actor} a déclenché l’opération « ${humanizedAction || "sans libellé"} » sur ${entity}${reference}.`,
    what: `Opération métier journalisée sur ${entity}.`,
    outcome: "L’opération a été enregistrée dans l’historique des données.",
    cause: null,
    impact: "Les valeurs avant et après sont conservées ci-dessous et permettent de reconstituer précisément le changement.",
    recommendation: "Vérifier que l’auteur disposait bien des droits nécessaires et que l’opération correspond à une demande légitime.",
    causeIdentified: false,
  };
}

export function describeAuditLog(input: AuditNarrativeInput): AuditNarrative {
  return input.source === "data" ? buildDataNarrative(input) : buildEdgeNarrative(input);
}

export function summarizeAuditLog(input: AuditNarrativeInput) {
  return describeAuditLog(input).headline;
}
