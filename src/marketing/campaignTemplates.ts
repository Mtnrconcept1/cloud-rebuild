import type { MarketingChannelId, MarketingPostFormat } from "@/marketing/types";

export type { MarketingPostFormat } from "@/marketing/types";

export const MARKETING_POST_FORMATS = ["1:1", "9:16", "16:9"] as const;

export const MARKETING_CAMPAIGN_FREQUENCIES = [
  { id: "daily", label: "Tous les jours", intervalDays: 1 },
  { id: "twice_weekly", label: "2 fois par semaine", intervalDays: 3 },
  { id: "weekly", label: "1 fois par semaine", intervalDays: 7 },
  { id: "biweekly", label: "Toutes les 2 semaines", intervalDays: 14 },
] as const;

export type MarketingCampaignFrequency = (typeof MARKETING_CAMPAIGN_FREQUENCIES)[number]["id"];

export const MARKETING_CAMPAIGN_TEMPLATES = [
  {
    id: "zero_wait",
    label: "Zéro attente",
    summary: "Mettre en avant la réservation fluide et l'arrivée sans file.",
    objective: "Promouvoir l'expérience Zéro attente avec une réservation simple et un accueil sans file, sans inventer de disponibilité.",
  },
  {
    id: "anti_waste",
    label: "Anti-gaspi",
    summary: "Valoriser les surplus disponibles et le retrait responsable.",
    objective: "Promouvoir les offres anti-gaspi à partir des surplus réellement confirmés, avec quantité et retrait explicites.",
  },
  {
    id: "flash_sale",
    label: "Vente flash",
    summary: "Créer une campagne courte avec urgence mesurée.",
    objective: "Créer une vente flash limitée dans le temps et par le stock confirmé, sans fausse urgence ni prix inventé.",
  },
  {
    id: "last_minute",
    label: "Dernière minute",
    summary: "Remplir des créneaux encore disponibles aujourd'hui.",
    objective: "Mettre en avant les créneaux de dernière minute réellement disponibles avec un appel à réserver clair.",
  },
  {
    id: "loyalty",
    label: "Fidélisation",
    summary: "Faire revenir les clients avec une histoire et une raison utile.",
    objective: "Renforcer la fidélité et le retour en restaurant avec un message relationnel, concret et sans avantage inventé.",
  },
  {
    id: "discovery",
    label: "Découverte restaurant",
    summary: "Présenter l'identité, les plats et l'ambiance du lieu.",
    objective: "Faire découvrir le restaurant, sa cuisine et son identité avec une narration locale et authentique.",
  },
] as const;

export type MarketingCampaignTemplateId = (typeof MARKETING_CAMPAIGN_TEMPLATES)[number]["id"];

export const VISUAL_MARKETING_CHANNELS: readonly MarketingChannelId[] = [
  "tok_news",
  "email",
  "instagram",
  "facebook",
  "linkedin",
  "tiktok",
  "youtube",
  "google_business",
  "website",
];

export const DEFAULT_MARKETING_FORMATS: Partial<Record<MarketingChannelId, MarketingPostFormat>> = {
  tok_news: "16:9",
  email: "16:9",
  instagram: "1:1",
  facebook: "1:1",
  linkedin: "16:9",
  tiktok: "9:16",
  youtube: "16:9",
  google_business: "1:1",
  website: "16:9",
};

export function campaignEndDate(startDate: string, itemCount: number, frequency: MarketingCampaignFrequency) {
  const start = new Date(`${startDate}T12:00:00Z`);
  const cadence = MARKETING_CAMPAIGN_FREQUENCIES.find((item) => item.id === frequency);
  if (!startDate || Number.isNaN(start.getTime()) || !cadence) return "";
  start.setUTCDate(start.getUTCDate() + cadence.intervalDays * Math.max(0, itemCount - 1));
  return start.toISOString().slice(0, 10);
}

export function buildCampaignObjective(
  templateIds: readonly MarketingCampaignTemplateId[],
  customObjective: string,
) {
  const objectives = MARKETING_CAMPAIGN_TEMPLATES
    .filter((template) => templateIds.includes(template.id))
    .map((template) => `- ${template.label} : ${template.objective}`);
  const custom = customObjective.trim();
  if (custom) objectives.push(`- Précision de l'opérateur : ${custom}`);
  return [
    "Construire une campagne TOK en combinant les axes sélectionnés ci-dessous.",
    ...objectives,
    "Produire des textes distincts par publication, cohérents entre eux et prêts à être relus.",
  ].join("\n");
}
