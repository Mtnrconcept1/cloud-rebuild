import type {
  MarketingChannel,
  MarketingIntegration,
  MarketingSnapshot,
} from "@/marketing/types";

function checkedNow() {
  return new Date().toISOString();
}

/**
 * Fail-closed snapshot used only when the privileged backend cannot confirm
 * operational data. It deliberately contains no synthetic business records or
 * performance numbers that an administrator could mistake for real activity.
 */
export function createFallbackMarketingSnapshot(): MarketingSnapshot {
  const lastCheckedAt = checkedNow();
  const channels: MarketingChannel[] = [
    {
      id: "tok_news",
      label: "Actualités TOK",
      availability: "blocked_configuration",
      reason: "Disponibilité native non confirmée par le backend marketing.",
      costModel: "free",
      lastCheckedAt,
    },
    {
      id: "in_app",
      label: "Notification interne",
      availability: "blocked_configuration",
      reason: "Disponibilité native non confirmée par le backend marketing.",
      costModel: "free",
      lastCheckedAt,
    },
    {
      id: "email",
      label: "E-mail automatisé",
      availability: "blocked_configuration",
      reason: "Domaine d'expédition Resend non vérifié. Aucun envoi autorisé.",
      costModel: "provider_free_tier",
      lastCheckedAt,
    },
    {
      id: "push",
      label: "Push",
      availability: "blocked_configuration",
      reason: "Configuration Firebase serveur non confirmée. Aucun push autorisé.",
      costModel: "provider_free_tier",
      lastCheckedAt,
    },
    ...(["instagram", "facebook", "tiktok", "linkedin", "youtube", "google_business", "telegram", "website"] as const)
      .map((id) => ({
        id,
        label: ({
          instagram: "Instagram",
          facebook: "Facebook",
          tiktok: "TikTok",
          linkedin: "LinkedIn",
          youtube: "YouTube",
          google_business: "Google Business Profile",
          telegram: "Telegram",
          website: "Site web",
        })[id],
        availability: "disconnected" as const,
        reason: "Connecteur OAuth/API non connecté. Publication externe indisponible.",
        costModel: "provider_free_tier" as const,
        lastCheckedAt,
      })),
    ...(["manual_call", "manual_email"] as const).map((id) => ({
      id,
      label: ({
        manual_call: "Appel manuel",
        manual_email: "E-mail individuel manuel",
      })[id],
      availability: "manual" as const,
      reason: "Action humaine disponible ; aucune exécution automatique n'est déclenchée.",
      costModel: "manual" as const,
      lastCheckedAt,
    })),
    {
      id: "manual_visit",
      label: "Visite terrain",
      availability: "blocked_configuration",
      reason: "Adresse structurée et vérifiée absente ; aucune tâche de visite n'est autorisée.",
      costModel: "manual",
      lastCheckedAt,
    },
  ];

  const integrations: MarketingIntegration[] = channels.map((channel) => ({
    id: `integration-${channel.id}`,
    name: channel.label,
    channel: channel.id,
    status: channel.availability,
    description: channel.reason,
    configuredAt: null,
    lastCheckedAt,
    actionLabel: channel.availability === "manual"
      ? "Voir le mode opératoire"
      : channel.availability === "disconnected"
        ? "Configurer le connecteur"
        : "Vérifier la configuration",
  }));

  return {
    overview: {
      globalPaused: true,
      globalPauseReason: "Backend marketing indisponible",
      freeOnly: true,
      approvalRequired: true,
      schedulerReady: false,
      scheduledCount: 0,
      eligibleContacts: 0,
      sent: 0,
      delivered: 0,
      clicked: 0,
      conversions: 0,
      deliveryRate: 0,
      clickRate: 0,
      conversionRate: 0,
      updatedAt: lastCheckedAt,
    },
    channels,
    campaigns: [],
    calendar: [],
    audiences: [],
    prospects: [],
    automations: [],
    deliveries: [],
    results: [],
    integrations,
    source: "fallback",
    warnings: [
      "Backend marketing indisponible : toutes les opérations automatiques restent en pause.",
      "Aucune donnée métier ni statistique n'est simulée dans ce mode.",
    ],
  };
}
