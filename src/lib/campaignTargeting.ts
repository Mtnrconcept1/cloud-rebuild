export type CampaignCustomerSegment = "all" | "new" | "returning" | "loyal" | "inactive";
export type CampaignJourneyType = "delivery" | "takeaway" | "reservation" | "zero_attente";
export type CampaignServiceMoment = "lunch" | "dinner" | "weekend";

export interface AudienceCriteria {
  cuisines: string[];
  cities: string[];
  minOrders: number;
  maxDaysSinceOrder: number;
  minAvgBasket: number;
  favoritesOnly: boolean;
  customerSegment: CampaignCustomerSegment;
  journeyTypes: CampaignJourneyType[];
  serviceMoments: CampaignServiceMoment[];
  restaurantId?: string;
}

export interface AudienceSnapshot {
  city: string | null;
  favoriteRestaurantIds: string[];
  interactionCount: number;
  avgBasket: number;
  daysSinceLastActivity: number | null;
  cuisineSignals: string[];
  journeyTypes: CampaignJourneyType[];
  serviceMoments: CampaignServiceMoment[];
}

export const CUSTOMER_SEGMENT_OPTIONS: { value: CampaignCustomerSegment; label: string }[] = [
  { value: "all", label: "Tous les clients" },
  { value: "new", label: "Nouveaux clients" },
  { value: "returning", label: "Clients déjà actifs" },
  { value: "loyal", label: "Clients fideles" },
  { value: "inactive", label: "Clients a réactiver" },
];

export const JOURNEY_TYPE_OPTIONS: { value: CampaignJourneyType; label: string }[] = [
  { value: "delivery", label: "Livraison" },
  { value: "takeaway", label: "Retrait" },
  { value: "reservation", label: "Reservation" },
  { value: "zero_attente", label: "Zéro Attente" },
];

export const SERVICE_MOMENT_OPTIONS: { value: CampaignServiceMoment; label: string }[] = [
  { value: "lunch", label: "Midi" },
  { value: "dinner", label: "Soir" },
  { value: "weekend", label: "Week-end" },
];

export const DEFAULT_AUDIENCE_CRITERIA: AudienceCriteria = {
  cuisines: [],
  cities: [],
  minOrders: 0,
  maxDaysSinceOrder: 365,
  minAvgBasket: 0,
  favoritesOnly: false,
  customerSegment: "all",
  journeyTypes: [],
  serviceMoments: [],
};

const DIACRITICS_REGEX = /\p{Diacritic}/gu;

export function normalizeAudienceToken(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "")
    .toLowerCase();
}

function uniqueNormalized(values: unknown[]) {
  return Array.from(new Set((values || []).map(normalizeAudienceToken).filter(Boolean)));
}

export function normalizeAudienceCriteria(raw: Partial<AudienceCriteria> | null | undefined): AudienceCriteria {
  return {
    cuisines: uniqueNormalized(Array.isArray(raw?.cuisines) ? raw.cuisines : []),
    cities: uniqueNormalized(Array.isArray(raw?.cities) ? raw.cities : []),
    minOrders: Math.max(0, Number(raw?.minOrders) || 0),
    maxDaysSinceOrder: Math.max(1, Number(raw?.maxDaysSinceOrder) || DEFAULT_AUDIENCE_CRITERIA.maxDaysSinceOrder),
    minAvgBasket: Math.max(0, Number(raw?.minAvgBasket) || 0),
    favoritesOnly: Boolean(raw?.favoritesOnly),
    customerSegment: CUSTOMER_SEGMENT_OPTIONS.some((option) => option.value === raw?.customerSegment)
      ? (raw!.customerSegment as CampaignCustomerSegment)
      : DEFAULT_AUDIENCE_CRITERIA.customerSegment,
    journeyTypes: uniqueNormalized(Array.isArray(raw?.journeyTypes) ? raw.journeyTypes : [])
      .filter((value): value is CampaignJourneyType => JOURNEY_TYPE_OPTIONS.some((option) => option.value === value)),
    serviceMoments: uniqueNormalized(Array.isArray(raw?.serviceMoments) ? raw.serviceMoments : [])
      .filter((value): value is CampaignServiceMoment => SERVICE_MOMENT_OPTIONS.some((option) => option.value === value)),
    restaurantId: raw?.restaurantId,
  };
}

export function isDefaultAudienceCriteria(criteria: Partial<AudienceCriteria> | null | undefined) {
  const normalized = normalizeAudienceCriteria(criteria);
  return (
    normalized.cuisines.length === 0 &&
    normalized.cities.length === 0 &&
    normalized.minOrders === 0 &&
    normalized.maxDaysSinceOrder === DEFAULT_AUDIENCE_CRITERIA.maxDaysSinceOrder &&
    normalized.minAvgBasket === 0 &&
    normalized.favoritesOnly === false &&
    normalized.customerSegment === "all" &&
    normalized.journeyTypes.length === 0 &&
    normalized.serviceMoments.length === 0
  );
}

export function summarizeAudienceCriteria(criteria: Partial<AudienceCriteria> | null | undefined) {
  const normalized = normalizeAudienceCriteria(criteria);
  const parts: string[] = [];

  if (normalized.customerSegment !== "all") {
    const label = CUSTOMER_SEGMENT_OPTIONS.find((option) => option.value === normalized.customerSegment)?.label;
    if (label) parts.push(label);
  }
  if (normalized.cities.length > 0) {
    parts.push(normalized.cities.length === 1 ? normalized.cities[0] : `${normalized.cities.length} villes`);
  }
  if (normalized.cuisines.length > 0) {
    parts.push(normalized.cuisines.length === 1 ? normalized.cuisines[0] : `${normalized.cuisines.length} cuisines`);
  }
  if (normalized.favoritesOnly) parts.push("Fans du restaurant");
  if (normalized.minOrders > 0) parts.push(`${normalized.minOrders}+ commandes`);
  if (normalized.minAvgBasket > 0) parts.push(`Panier ${normalized.minAvgBasket}+ CHF`);
  if (normalized.journeyTypes.length > 0) parts.push(`${normalized.journeyTypes.length} parcours`);
  if (normalized.serviceMoments.length > 0) parts.push(`${normalized.serviceMoments.length} moments`);
  if (normalized.maxDaysSinceOrder < DEFAULT_AUDIENCE_CRITERIA.maxDaysSinceOrder) {
    parts.push(`Actifs ${normalized.maxDaysSinceOrder}j`);
  }

  return parts;
}

export function matchesAudienceCriteria(
  criteria: Partial<AudienceCriteria> | null | undefined,
  snapshot: AudienceSnapshot | null,
  restaurantId?: string | null,
) {
  const normalized = normalizeAudienceCriteria(criteria);
  if (isDefaultAudienceCriteria(normalized)) return true;
  if (!snapshot) return false;

  const favoriteRestaurantIds = new Set(snapshot.favoriteRestaurantIds.map(normalizeAudienceToken));
  const cuisineSignals = new Set(snapshot.cuisineSignals.map(normalizeAudienceToken));
  const journeyTypes = new Set(snapshot.journeyTypes.map(normalizeAudienceToken));
  const serviceMoments = new Set(snapshot.serviceMoments.map(normalizeAudienceToken));
  const city = normalizeAudienceToken(snapshot.city);
  const interactionCount = Math.max(0, Number(snapshot.interactionCount) || 0);
  const avgBasket = Math.max(0, Number(snapshot.avgBasket) || 0);
  const daysSinceLastActivity = snapshot.daysSinceLastActivity;
  const normalizedRestaurantId = normalizeAudienceToken(restaurantId);

  if (normalized.cities.length > 0 && (!city || !normalized.cities.includes(city))) return false;
  if (normalized.cuisines.length > 0 && !normalized.cuisines.some((cuisine) => cuisineSignals.has(cuisine))) return false;
  if (normalized.favoritesOnly && (!normalizedRestaurantId || !favoriteRestaurantIds.has(normalizedRestaurantId))) return false;
  if (interactionCount < normalized.minOrders) return false;
  if (normalized.minAvgBasket > 0 && avgBasket < normalized.minAvgBasket) return false;
  if (normalized.journeyTypes.length > 0 && !normalized.journeyTypes.some((journeyType) => journeyTypes.has(journeyType))) return false;
  if (normalized.serviceMoments.length > 0 && !normalized.serviceMoments.some((serviceMoment) => serviceMoments.has(serviceMoment))) return false;

  if (normalized.customerSegment === "new") return interactionCount === 0;
  if (daysSinceLastActivity == null || daysSinceLastActivity > normalized.maxDaysSinceOrder) return false;
  if (normalized.customerSegment === "returning" && interactionCount === 0) return false;
  if (normalized.customerSegment === "loyal" && interactionCount < 5 && !favoriteRestaurantIds.has(normalizedRestaurantId)) return false;
  if (normalized.customerSegment === "inactive" && (interactionCount === 0 || daysSinceLastActivity < 45)) return false;

  return true;
}
