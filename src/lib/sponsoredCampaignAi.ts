import type {
  CampaignCustomerSegment,
  CampaignGenderTarget,
  CampaignJourneyType,
  CampaignServiceMoment,
} from "@/lib/campaignTargeting";
import type { CampaignPricingStrategy } from "@/lib/campaignPricing";
import type { SocialMarketingGoal, SocialPostCtaType, SocialPostType } from "@/lib/socialFeed";

export type SponsoredCampaignAiRestaurant = {
  name?: string | null;
  city?: string | null;
  cuisineType?: string | null;
};

export type SponsoredCampaignAiInput = {
  body: string;
  restaurant?: SponsoredCampaignAiRestaurant | null;
  postType?: SocialPostType | null;
  ctaType?: SocialPostCtaType | null;
  campaignGoal?: SocialMarketingGoal | null;
  hasMedia?: boolean;
};

export type SponsoredCampaignAiPreset = {
  totalBudget: string;
  durationDays: number;
  strategy: CampaignPricingStrategy;
  customerSegment: CampaignCustomerSegment;
  genders: CampaignGenderTarget[];
  cities: string[];
  cuisines: string[];
  favoritesOnly: boolean;
  minAvgBasket: string;
  maxDaysSinceOrder: number;
  journeyTypes: CampaignJourneyType[];
  serviceMoments: CampaignServiceMoment[];
  summary: string;
  reasons: string[];
};

const ORDER_KEYWORDS = [
  "commande",
  "commandez",
  "livraison",
  "emporter",
  "retrait",
  "plat",
  "menu",
  "burger",
  "pizza",
  "sushi",
  "pasta",
];

const BOOKING_KEYWORDS = [
  "reservation",
  "reservez",
  "table",
  "places",
  "ce soir",
  "soir",
  "service du soir",
];

const OFFER_KEYWORDS = [
  "offre",
  "promo",
  "promotion",
  "reduction",
  "limite",
  "aujourd'hui",
  "flash",
];

const LUNCH_KEYWORDS = ["midi", "dejeuner", "lunch", "pause"];
const DINNER_KEYWORDS = ["soir", "diner", "dinner", "ce soir"];
const WEEKEND_KEYWORDS = ["week-end", "weekend", "samedi", "dimanche"];

function normalizeMarketingText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("fr-CH")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ");
}

function containsAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function uniqueLabels(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const labels: string[] = [];

  for (const rawValue of values) {
    const value = String(rawValue || "").trim();
    if (!value) continue;

    const key = normalizeMarketingText(value);
    if (seen.has(key)) continue;

    seen.add(key);
    labels.push(value);
  }

  return labels;
}

function splitLabels(value?: string | null) {
  return uniqueLabels(String(value || "").split(","));
}

function getServiceMoments(text: string): CampaignServiceMoment[] {
  const moments: CampaignServiceMoment[] = [];

  if (containsAny(text, LUNCH_KEYWORDS)) moments.push("lunch");
  if (containsAny(text, DINNER_KEYWORDS)) moments.push("dinner");
  if (containsAny(text, WEEKEND_KEYWORDS)) moments.push("weekend");

  return moments;
}

export function buildSponsoredCampaignAiPreset(input: SponsoredCampaignAiInput): SponsoredCampaignAiPreset {
  const text = normalizeMarketingText(`${input.body} ${input.restaurant?.name || ""}`);
  const isOrderIntent =
    input.campaignGoal === "orders" ||
    input.ctaType === "order" ||
    input.postType === "plat" ||
    containsAny(text, ORDER_KEYWORDS);
  const isBookingIntent =
    input.campaignGoal === "bookings" ||
    input.ctaType === "reserve" ||
    input.postType === "evenement" ||
    containsAny(text, BOOKING_KEYWORDS);
  const isOfferIntent =
    input.campaignGoal === "offer" ||
    input.ctaType === "offer" ||
    input.postType === "promo" ||
    containsAny(text, OFFER_KEYWORDS);
  const isLoyaltyIntent = input.campaignGoal === "loyalty" || /fidele|abonnes?|retour|revenez/.test(text);
  const isConversionIntent = isOrderIntent || isBookingIntent || isOfferIntent;
  const strategy: CampaignPricingStrategy = isConversionIntent ? "conversion" : input.hasMedia ? "traffic" : "visibility";
  const customerSegment: CampaignCustomerSegment = isLoyaltyIntent ? "returning" : isConversionIntent ? "new" : "all";
  const journeyTypes: CampaignJourneyType[] = isBookingIntent && !isOrderIntent
    ? ["reservation"]
    : isOrderIntent || isOfferIntent
      ? ["delivery", "takeaway"]
      : ["delivery", "takeaway", "reservation"];
  const serviceMoments = getServiceMoments(text);
  const budget = strategy === "conversion" ? "45" : strategy === "traffic" ? "35" : "25";
  const durationDays = strategy === "conversion" ? 5 : strategy === "traffic" ? 6 : 7;
  const cities = splitLabels(input.restaurant?.city);
  const cuisines = splitLabels(input.restaurant?.cuisineType);
  const reasons = [
    strategy === "conversion"
      ? "Objectif conversion choisi pour transformer le post en commandes, retraits ou reservations."
      : strategy === "traffic"
        ? "Objectif trafic choisi pour envoyer plus de visiteurs vers la fiche restaurant."
        : "Objectif visibilite choisi pour maximiser la portee locale.",
    customerSegment === "new"
      ? "Ciblage nouveaux clients pour agrandir l'audience du restaurant."
      : customerSegment === "returning"
        ? "Ciblage clients deja actifs pour favoriser le retour."
        : "Audience large pour tester le potentiel local.",
    serviceMoments.length > 0
      ? "Moment de service detecte dans le texte et pousse en priorite."
      : "Aucun moment trop restrictif: le plan reste ouvert sur les meilleurs creneaux.",
  ];

  if (cities.length > 0) reasons.push("Ville du restaurant reprise automatiquement.");
  if (cuisines.length > 0) reasons.push("Type de cuisine repris pour toucher les profils les plus affinitaires.");

  return {
    totalBudget: budget,
    durationDays,
    strategy,
    customerSegment,
    genders: ["all"],
    cities,
    cuisines,
    favoritesOnly: customerSegment === "returning",
    minAvgBasket: "",
    maxDaysSinceOrder: 365,
    journeyTypes,
    serviceMoments,
    summary: `TOK IA recommande ${budget} CHF sur ${durationDays} jours avec l'objectif ${strategy}.`,
    reasons,
  };
}
