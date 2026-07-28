export type CampaignCustomerSegment = "all" | "new" | "returning" | "loyal" | "inactive";
export type CampaignJourneyType = "delivery" | "takeaway" | "reservation" | "zero_attente";
export type CampaignServiceMoment = "lunch" | "dinner" | "weekend";
export type CampaignGenderTarget = "all" | "female" | "male";

export interface AudienceCriteria {
  cuisines: string[];
  cities: string[];
  minOrders: number;
  maxDaysSinceOrder: number;
  minAvgBasket: number;
  favoritesOnly: boolean;
  genders: CampaignGenderTarget[];
  customerSegment: CampaignCustomerSegment;
  journeyTypes: CampaignJourneyType[];
  serviceMoments: CampaignServiceMoment[];
  restaurantId?: string;
}

export interface AudienceSnapshot {
  city: string | null;
  gender?: CampaignGenderTarget | "other" | "unspecified" | null;
  favoriteRestaurantIds: string[];
  interactionCount: number;
  avgBasket: number;
  daysSinceLastActivity: number | null;
  cuisineSignals: string[];
  journeyTypes: CampaignJourneyType[];
  serviceMoments: CampaignServiceMoment[];
}

export interface AudienceTargetingEvaluation {
  eligible: boolean;
  score: number;
  matchedCriteria: string[];
  failedCriteria: string[];
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

export const GENDER_TARGET_OPTIONS: { value: CampaignGenderTarget; label: string }[] = [
  { value: "all", label: "Tous" },
  { value: "female", label: "Femmes" },
  { value: "male", label: "Hommes" },
];

export const DEFAULT_AUDIENCE_CRITERIA: AudienceCriteria = {
  cuisines: [],
  cities: [],
  minOrders: 0,
  maxDaysSinceOrder: 365,
  minAvgBasket: 0,
  favoritesOnly: false,
  genders: ["all"],
  customerSegment: "all",
  journeyTypes: [],
  serviceMoments: [],
};

const DIACRITICS_REGEX = /\p{Diacritic}/gu;

export const AUDIENCE_TARGETING_WEIGHTS = {
  gender: 1,
  serviceMoment: 3,
  journeyType: 4,
  recentActivity: 5,
  minAvgBasket: 5,
  minOrders: 5,
  customerSegment: 6,
  city: 8,
  favoriteRestaurant: 8,
  cuisine: 10,
} as const;

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
  const normalizedGenders = uniqueNormalized(
    Array.isArray(raw?.genders) ? raw.genders : DEFAULT_AUDIENCE_CRITERIA.genders,
  ).filter((value): value is CampaignGenderTarget => GENDER_TARGET_OPTIONS.some((option) => option.value === value));

  return {
    cuisines: uniqueNormalized(Array.isArray(raw?.cuisines) ? raw.cuisines : []),
    cities: uniqueNormalized(Array.isArray(raw?.cities) ? raw.cities : []),
    minOrders: Math.max(0, Number(raw?.minOrders) || 0),
    maxDaysSinceOrder: Math.max(1, Number(raw?.maxDaysSinceOrder) || DEFAULT_AUDIENCE_CRITERIA.maxDaysSinceOrder),
    minAvgBasket: Math.max(0, Number(raw?.minAvgBasket) || 0),
    favoritesOnly: Boolean(raw?.favoritesOnly),
    genders: normalizedGenders.length > 0 ? normalizedGenders : DEFAULT_AUDIENCE_CRITERIA.genders,
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
    (normalized.genders.length === 0 || (normalized.genders.length === 1 && normalized.genders[0] === "all")) &&
    normalized.customerSegment === "all" &&
    normalized.journeyTypes.length === 0 &&
    normalized.serviceMoments.length === 0
  );
}

export function hasAudienceTargeting(criteria: Partial<AudienceCriteria> | null | undefined) {
  return !isDefaultAudienceCriteria(criteria);
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
  if (normalized.genders.length > 0 && !normalized.genders.includes("all")) {
    parts.push(normalized.genders.map((gender) => GENDER_TARGET_OPTIONS.find((option) => option.value === gender)?.label || gender).join(", "));
  }
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
  return scoreAudienceCriteria(criteria, snapshot, restaurantId).eligible;
}

export function scoreAudienceCriteria(
  criteria: Partial<AudienceCriteria> | null | undefined,
  snapshot: AudienceSnapshot | null,
  restaurantId?: string | null,
): AudienceTargetingEvaluation {
  const normalized = normalizeAudienceCriteria(criteria);
  if (isDefaultAudienceCriteria(normalized)) {
    return { eligible: true, score: 1, matchedCriteria: ["broad"], failedCriteria: [] };
  }
  if (!snapshot) {
    return { eligible: false, score: 0, matchedCriteria: [], failedCriteria: ["audienceSnapshot"] };
  }

  const favoriteRestaurantIds = new Set(snapshot.favoriteRestaurantIds.map(normalizeAudienceToken));
  const cuisineSignals = new Set(snapshot.cuisineSignals.map(normalizeAudienceToken));
  const journeyTypes = new Set(snapshot.journeyTypes.map(normalizeAudienceToken));
  const serviceMoments = new Set(snapshot.serviceMoments.map(normalizeAudienceToken));
  const city = normalizeAudienceToken(snapshot.city);
  const gender = normalizeAudienceToken(snapshot.gender);
  const interactionCount = Math.max(0, Number(snapshot.interactionCount) || 0);
  const avgBasket = Math.max(0, Number(snapshot.avgBasket) || 0);
  const daysSinceLastActivity = snapshot.daysSinceLastActivity;
  const normalizedRestaurantId = normalizeAudienceToken(restaurantId || normalized.restaurantId);
  const matchedCriteria: string[] = [];
  const failedCriteria: string[] = [];
  let score = 0;

  const evaluate = (active: boolean, matched: boolean, key: string, weight: number) => {
    if (!active) return;
    if (matched) {
      score += weight;
      matchedCriteria.push(key);
    } else {
      failedCriteria.push(key);
    }
  };

  const genderTargetingActive = normalized.genders.length > 0 && !normalized.genders.includes("all");
  evaluate(
    genderTargetingActive,
    Boolean(gender) && normalized.genders.includes(gender as CampaignGenderTarget),
    "gender",
    AUDIENCE_TARGETING_WEIGHTS.gender,
  );
  evaluate(
    normalized.cities.length > 0,
    Boolean(city) && normalized.cities.includes(city),
    "city",
    AUDIENCE_TARGETING_WEIGHTS.city,
  );
  evaluate(
    normalized.cuisines.length > 0,
    normalized.cuisines.some((cuisine) => cuisineSignals.has(cuisine)),
    "cuisine",
    AUDIENCE_TARGETING_WEIGHTS.cuisine,
  );
  evaluate(
    normalized.favoritesOnly,
    Boolean(normalizedRestaurantId) && favoriteRestaurantIds.has(normalizedRestaurantId),
    "favoriteRestaurant",
    AUDIENCE_TARGETING_WEIGHTS.favoriteRestaurant,
  );
  evaluate(
    normalized.minOrders > 0,
    interactionCount >= normalized.minOrders,
    "minOrders",
    AUDIENCE_TARGETING_WEIGHTS.minOrders,
  );
  evaluate(
    normalized.minAvgBasket > 0,
    avgBasket >= normalized.minAvgBasket,
    "minAvgBasket",
    AUDIENCE_TARGETING_WEIGHTS.minAvgBasket,
  );
  evaluate(
    normalized.journeyTypes.length > 0,
    normalized.journeyTypes.some((journeyType) => journeyTypes.has(journeyType)),
    "journeyType",
    AUDIENCE_TARGETING_WEIGHTS.journeyType,
  );
  evaluate(
    normalized.serviceMoments.length > 0,
    normalized.serviceMoments.some((serviceMoment) => serviceMoments.has(serviceMoment)),
    "serviceMoment",
    AUDIENCE_TARGETING_WEIGHTS.serviceMoment,
  );
  evaluate(
    normalized.maxDaysSinceOrder < DEFAULT_AUDIENCE_CRITERIA.maxDaysSinceOrder,
    daysSinceLastActivity != null && daysSinceLastActivity <= normalized.maxDaysSinceOrder,
    "recentActivity",
    AUDIENCE_TARGETING_WEIGHTS.recentActivity,
  );

  const customerSegmentTargetingActive = normalized.customerSegment !== "all";
  const matchesSegment =
    normalized.customerSegment === "new"
      ? interactionCount === 0
      : normalized.customerSegment === "returning"
        ? interactionCount > 0
        : normalized.customerSegment === "loyal"
          ? interactionCount >= 5 || Boolean(normalizedRestaurantId && favoriteRestaurantIds.has(normalizedRestaurantId))
          : normalized.customerSegment === "inactive"
            ? interactionCount > 0 && daysSinceLastActivity != null && daysSinceLastActivity >= 45
            : true;

  evaluate(
    customerSegmentTargetingActive,
    matchesSegment,
    "customerSegment",
    AUDIENCE_TARGETING_WEIGHTS.customerSegment,
  );

  return {
    eligible: failedCriteria.length === 0,
    score: failedCriteria.length === 0 ? score : 0,
    matchedCriteria,
    failedCriteria,
  };
}
