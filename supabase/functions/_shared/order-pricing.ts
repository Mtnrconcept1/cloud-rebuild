import {
  assertPaymentMethodAllowed,
  getEffectiveFeatureFlagSet,
} from "./feature-flags.ts";

const QUALITY_GUARANTEE_FEE = 1.5;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RawOrderItem = {
  menu_item_id?: string | null;
  name?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  price?: number | null;
  metadata?: Record<string, unknown> | null;
};

type ValidatedOrderItem = {
  menuItemId: string;
  source: "menu_item" | "anti_waste" | "flash_sale";
  name: string;
  quantity: number;
  unitPrice: number;
  category: string | null;
  metadata: Record<string, unknown>;
};

type MealFormulaServiceAvailability = {
  enabled?: boolean;
  startTime?: string;
  endTime?: string;
};

type MealFormulaAvailability = {
  days?: string[];
  startTime?: string;
  endTime?: string;
  servicePeriods?: Array<"lunch" | "dinner">;
  services?: Partial<Record<"lunch" | "dinner", MealFormulaServiceAvailability>>;
} | null;

type MealFormulaRow = {
  id: string;
  name: string;
  discount_percent: number;
  formula_key?: string | null;
  applies_to?: string | null;
  availability?: MealFormulaAvailability;
  meal_formula_categories?: Array<{ category: string; course_order: number }> | null;
};

type RestaurantPromotionRow = {
  name: string;
  promotion_type: string;
  promotion_value: number;
};

type TokOneSubscriptionRow = {
  id: string;
  plan_id: string | null;
  status: string;
  current_period_end: string | null;
};

type TokOnePaymentRecoveryRow = {
  id: string;
  created_at: string;
  status: string;
  metadata: Record<string, unknown> | null;
};

type TokOnePlanRow = {
  id: string;
  free_delivery_min_order: number | null;
};

type TokOneBenefitRow = {
  benefit_type: string;
  value: Record<string, unknown> | null;
};

type TokOneJourney = "delivery" | "takeaway" | "reservation" | "zero-attente";

export type VerifiedOrderPricing = {
  validatedItems: ValidatedOrderItem[];
  subtotal: number;
  deliveryFee: number;
  qualityFee: number;
  formulaDiscount: number;
  formulaDiscountPercent: number;
  formulaName: string | null;
  promoDiscount: number;
  promoName: string | null;
  tokOneMember: boolean;
  tokOneDiscount: number;
  tokOneDiscountPercent: number;
  tokOneDeliveryDiscount: number;
  tokOneTotalSaved: number;
  pointsDiscount: number;
  flexDiscount: number;
  originalTotal: number;
  discountAmount: number;
  total: number;
};

const TOK_ONE_DEFAULT_DISCOUNT_PERCENT = 20;

function roundCurrency(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toPositiveInteger(value: unknown, fallback = 1) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toCourse(raw: string | null | undefined) {
  const text = normalizeText(String(raw || ""));
  if (!text) return null;
  if (text.includes("entree") || text.includes("starter") || text.includes("appet")) return "entree";
  if (text.includes("plat") || text.includes("main")) return "plat";
  if (text.includes("dessert") || text.includes("sweet")) return "dessert";
  return null;
}

function detectServiceFromTime(timeValue: string) {
  const hour = Number(String(timeValue || "").split(":")[0]);
  if (!Number.isFinite(hour)) return "dinner" as const;
  return hour < 15 ? "lunch" as const : "dinner" as const;
}

function coursesFromFormulaKey(formulaKey: string | null | undefined) {
  if (formulaKey === "entree_plat") return ["entree", "plat"];
  if (formulaKey === "plat_dessert") return ["plat", "dessert"];
  if (formulaKey === "entree_plat_dessert") return ["entree", "plat", "dessert"];
  return [];
}

function uniqueCourses(courses: string[]) {
  const seen = new Set<string>();
  return courses.filter((course) => {
    if (seen.has(course)) return false;
    seen.add(course);
    return true;
  });
}

function resolveRequiredCourses(formula: MealFormulaRow) {
  const fromKey = coursesFromFormulaKey(formula.formula_key);
  if (fromKey.length > 0) return uniqueCourses(fromKey);
  return uniqueCourses(
    (formula.meal_formula_categories || [])
      .map((row) => toCourse(row.category))
      .filter((course): course is string => !!course),
  );
}

function parseTimeToMinutes(value: string) {
  if (!value || !/^\d{2}:\d{2}$/.test(value)) return null;
  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function isTimeInWindow(target: number, start: number, end: number) {
  if (start <= end) return target >= start && target <= end;
  return target >= start || target <= end;
}

function isFormulaAvailableForSlot(
  availability: MealFormulaAvailability,
  reservationDate?: string,
  reservationTime?: string,
) {
  if (!reservationDate || !reservationTime) return true;
  if (!availability || typeof availability !== "object") return true;

  const dateObj = new Date(`${reservationDate}T${reservationTime}`);
  if (Number.isNaN(dateObj.getTime())) return true;

  const dayCodes = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const days = Array.isArray(availability.days)
    ? availability.days.map((day) => normalizeText(day))
    : [];

  if (days.length > 0) {
    const dayCode = dayCodes[dateObj.getDay()];
    if (!days.includes(dayCode)) return false;
  }

  const servicePeriod = detectServiceFromTime(reservationTime);
  const targetMinutes = parseTimeToMinutes(reservationTime);
  const serviceConfig = availability.services?.[servicePeriod];
  if (serviceConfig?.enabled === false) return false;

  const serviceStart = parseTimeToMinutes(String(serviceConfig?.startTime || ""));
  const serviceEnd = parseTimeToMinutes(String(serviceConfig?.endTime || ""));
  if (targetMinutes !== null && serviceStart !== null && serviceEnd !== null) {
    return isTimeInWindow(targetMinutes, serviceStart, serviceEnd);
  }

  const servicePeriods = Array.isArray(availability.servicePeriods)
    ? availability.servicePeriods.filter((period): period is "lunch" | "dinner" => period === "lunch" || period === "dinner")
    : [];
  if (servicePeriods.length > 0 && !servicePeriods.includes(servicePeriod)) {
    return false;
  }

  const startMinutes = parseTimeToMinutes(String(availability.startTime || ""));
  const endMinutes = parseTimeToMinutes(String(availability.endTime || ""));
  if (targetMinutes === null || startMinutes === null || endMinutes === null) return true;
  return isTimeInWindow(targetMinutes, startMinutes, endMinutes);
}

function isFormulaContextCompatible(appliesTo: string | null | undefined, context: "cart" | "zero-attente") {
  const value = normalizeText(String(appliesTo || ""));
  if (!value || value === "both") return true;
  if (context === "cart") {
    return value !== "dine_in" && value !== "reservation";
  }
  return value !== "delivery" && value !== "takeaway";
}

function computeFormulaDiscount(
  formulas: MealFormulaRow[],
  items: ValidatedOrderItem[],
  subtotal: number,
  context: "cart" | "zero-attente",
  reservationDate?: string,
  reservationTime?: string,
) {
  const itemCourses = new Set(
    items
      .filter((item) => item.quantity > 0)
      .map((item) => toCourse(item.category))
      .filter((course): course is string => !!course),
  );

  let bestMatch: { name: string; discountPercent: number; discountAmount: number; courseCount: number } | null = null;

  for (const formula of formulas || []) {
    if (!isFormulaContextCompatible(formula.applies_to, context)) continue;
    if (!isFormulaAvailableForSlot(formula.availability || null, reservationDate, reservationTime)) continue;
    const requiredCourses = resolveRequiredCourses(formula);
    if (!requiredCourses.length) continue;
    if (!requiredCourses.every((course) => itemCourses.has(course))) continue;

    const discountPercent = toNumber(formula.discount_percent);
    const discountAmount = roundCurrency((subtotal * discountPercent) / 100);
    const candidate = {
      name: formula.name,
      discountPercent,
      discountAmount,
      courseCount: requiredCourses.length,
    };

    if (
      !bestMatch ||
      candidate.discountPercent > bestMatch.discountPercent ||
      (candidate.discountPercent === bestMatch.discountPercent && candidate.courseCount > bestMatch.courseCount)
    ) {
      bestMatch = candidate;
    }
  }

  return {
    amount: bestMatch?.discountAmount || 0,
    percent: bestMatch?.discountPercent || 0,
    name: bestMatch?.name || null,
  };
}

function computePromotionDiscount(
  promotions: RestaurantPromotionRow[],
  subtotal: number,
  deliveryFee: number,
) {
  let bestPromo: { name: string; discount: number } | null = null;

  for (const promo of promotions || []) {
    let discount = 0;
    if (promo.promotion_type === "percentage") {
      discount = roundCurrency((subtotal * toNumber(promo.promotion_value)) / 100);
    } else if (promo.promotion_type === "fixed") {
      discount = roundCurrency(Math.min(toNumber(promo.promotion_value), subtotal));
    } else if (promo.promotion_type === "free_delivery") {
      discount = roundCurrency(Math.max(0, deliveryFee));
    }

    if (!bestPromo || discount > bestPromo.discount) {
      bestPromo = { name: promo.name, discount };
    }
  }

  return {
    amount: bestPromo?.discount || 0,
    name: bestPromo?.name || null,
  };
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseConfigNumber(value: unknown, keys: string[]) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const record = asRecord(value);
  if (!record) return 0;
  for (const key of keys) {
    const parsed = Number(record[key]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function normalizeBenefitList(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

const TOK_ONE_CONTEXT_ALIASES: Record<TokOneJourney, string[]> = {
  delivery: ["delivery", "livraison"],
  takeaway: ["takeaway", "pickup", "pick up", "emporter", "a emporter"],
  reservation: ["reservation", "booking", "dine in", "dinein", "sur place", "surplace", "on site", "onsite"],
  "zero-attente": [
    "zero attente",
    "zeroattente",
    "zero-attente",
    "reservation",
    "booking",
    "dine in",
    "dinein",
    "sur place",
    "surplace",
    "on site",
    "onsite",
    "takeaway",
    "pickup",
    "pick up",
    "emporter",
    "a emporter",
  ],
};

function matchesTokOneJourneyContext(entry: string, journey: TokOneJourney) {
  const normalizedEntry = normalizeText(entry);
  if (!normalizedEntry) return false;
  if (normalizedEntry === "all" || normalizedEntry === "both" || normalizedEntry === "cart") {
    return true;
  }
  return TOK_ONE_CONTEXT_ALIASES[journey].includes(normalizedEntry);
}

function addBillingPeriod(start: Date, billingPeriod: string) {
  const periodEnd = new Date(start);
  if (billingPeriod === "yearly") {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }
  return periodEnd;
}

function isTokOneBenefitApplicable(
  benefit: TokOneBenefitRow,
  restaurantId: string,
  journey: TokOneJourney,
) {
  const value = asRecord(benefit.value);
  if (!value) return true;

  const restaurantIds = [
    ...normalizeBenefitList(value.restaurant_ids),
    ...normalizeBenefitList(value.restaurantIds),
    ...normalizeBenefitList(value.restaurants),
  ];
  if (restaurantIds.length > 0 && !restaurantIds.includes(restaurantId)) {
    return false;
  }

  const contexts = [
    ...normalizeBenefitList(value.contexts),
    ...normalizeBenefitList(value.journeys),
    ...normalizeBenefitList(value.order_modes),
    ...normalizeBenefitList(value.applies_to),
    ...normalizeBenefitList(value.apply_to),
  ].map((entry) => normalizeText(entry));

  if (contexts.length === 0) return true;
  return contexts.some((entry) => matchesTokOneJourneyContext(entry, journey));
}

function resolveTokOneDiscountPercent(
  benefits: TokOneBenefitRow[],
  restaurantId: string,
  journey: TokOneJourney,
) {
  const discountBenefits = benefits.filter((benefit) => benefit.benefit_type === "discount_percentage");
  const restaurantScopedBenefits = discountBenefits
    .filter((benefit) => {
      const value = asRecord(benefit.value);
      if (!value) return true;

      const restaurantIds = [
        ...normalizeBenefitList(value.restaurant_ids),
        ...normalizeBenefitList(value.restaurantIds),
        ...normalizeBenefitList(value.restaurants),
      ];
      return restaurantIds.length === 0 || restaurantIds.includes(restaurantId);
    });
  const configured = restaurantScopedBenefits
    .filter((benefit) => isTokOneBenefitApplicable(benefit, restaurantId, journey))
    .reduce((best, benefit) => {
      const value = parseConfigNumber(benefit.value, ["percentage", "discount_percent", "percent", "value"]);
      return value > best ? value : best;
    }, 0);

  if (configured > 0) return configured;
  if (journey === "takeaway" || journey === "reservation" || journey === "zero-attente") {
    const takeawayFallback = restaurantScopedBenefits
      .reduce((best, benefit) => {
        const value = parseConfigNumber(benefit.value, ["percentage", "discount_percent", "percent", "value"]);
        return value > best ? value : best;
      }, 0);
    if (takeawayFallback > 0) return takeawayFallback;
  }
  return discountBenefits.length === 0 ? TOK_ONE_DEFAULT_DISCOUNT_PERCENT : 0;
}

function resolveTokOneFreeDeliveryThreshold(
  plan: TokOnePlanRow | null,
  benefits: TokOneBenefitRow[],
  restaurantId: string,
  journey: TokOneJourney,
) {
  const freeDeliveryBenefits = benefits.filter((benefit) => benefit.benefit_type === "free_delivery");
  const configured = freeDeliveryBenefits
    .filter((benefit) => isTokOneBenefitApplicable(benefit, restaurantId, journey))
    .reduce((best, benefit) => {
      const value = parseConfigNumber(benefit.value, ["min_order", "minimum_order", "free_delivery_min_order", "threshold", "value"]);
      return value > best ? value : best;
    }, 0);

  if (configured > 0) return configured;
  if (freeDeliveryBenefits.length > 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, toNumber(plan?.free_delivery_min_order));
}

async function resolveTokOnePricing(input: {
  adminClient: any;
  userId: string;
  restaurantId: string;
  context: "cart" | "zero-attente";
  isDeliveryJourney: boolean;
  subtotal: number;
  deliveryFee: number;
}) {
  const defaults = {
    tokOneMember: false,
    tokOneDiscountPercent: 0,
    tokOneDiscount: 0,
    tokOneDeliveryDiscount: 0,
    tokOneTotalSaved: 0,
  };

  if (input.context !== "cart" && input.context !== "zero-attente") return defaults;

  try {
    const now = new Date();
    const { data: subscription, error: subscriptionError } = await input.adminClient
      .from("tok_one_subscriptions")
      .select("id, plan_id, status, current_period_end")
      .eq("user_id", input.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subscriptionError) throw subscriptionError;

    const activeSubscription = subscription as TokOneSubscriptionRow | null;
    let resolvedPlanId = activeSubscription?.plan_id || null;
    let hasActiveTokOne = Boolean(
      activeSubscription &&
      activeSubscription.status === "active" &&
      (!activeSubscription.current_period_end || new Date(activeSubscription.current_period_end) > now),
    );

    if (!hasActiveTokOne) {
      const { data: transactions, error: transactionsError } = await input.adminClient
        .from("payment_transactions")
        .select("id, created_at, metadata, status")
        .eq("user_id", input.userId)
        .order("created_at", { ascending: false })
        .limit(20);

      if (transactionsError) throw transactionsError;

      const latestTokOnePayment = ((transactions || []) as TokOnePaymentRecoveryRow[]).find((transaction) => {
        const metadata = transaction?.metadata;
        return (
          metadata &&
          typeof metadata === "object" &&
          !Array.isArray(metadata) &&
          metadata.checkout_kind === "tok-one" &&
          metadata.plan_id &&
          ["paid", "succeeded"].includes(String(transaction?.status || ""))
        );
      });

      if (!latestTokOnePayment) return defaults;

      const paymentMetadata = latestTokOnePayment.metadata as Record<string, unknown>;
      const billingPeriod = paymentMetadata.billing_period === "yearly" ? "yearly" : "monthly";
      const periodStart = new Date(latestTokOnePayment.created_at);
      const periodEnd = addBillingPeriod(periodStart, billingPeriod);

      if (periodEnd <= now) return defaults;

      resolvedPlanId = String(paymentMetadata.plan_id || "");
      hasActiveTokOne = Boolean(resolvedPlanId);
    }

    if (!hasActiveTokOne || !resolvedPlanId) return defaults;

    const [planRes, benefitsRes] = await Promise.all([
      resolvedPlanId
        ? input.adminClient
          .from("user_subscription_plans")
          .select("id, free_delivery_min_order")
          .eq("id", resolvedPlanId)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      resolvedPlanId
        ? input.adminClient
          .from("subscription_benefits")
          .select("benefit_type, value")
          .eq("plan_id", resolvedPlanId)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (planRes.error) throw planRes.error;
    if (benefitsRes.error) throw benefitsRes.error;

    const plan = (planRes.data || null) as TokOnePlanRow | null;
    const benefits = (benefitsRes.data || []) as TokOneBenefitRow[];
    const journey = input.context === "zero-attente"
      ? "zero-attente" as const
      : input.isDeliveryJourney
        ? "delivery" as const
        : "takeaway" as const;
    const tokOneDiscountPercent = resolveTokOneDiscountPercent(benefits, input.restaurantId, journey);
    const tokOneDiscount = roundCurrency((input.subtotal * tokOneDiscountPercent) / 100);
    const freeDeliveryThreshold = resolveTokOneFreeDeliveryThreshold(plan, benefits, input.restaurantId, journey);
    const tokOneDeliveryDiscount = input.isDeliveryJourney && input.deliveryFee > 0 && input.subtotal >= freeDeliveryThreshold
      ? roundCurrency(input.deliveryFee)
      : 0;

    return {
      tokOneMember: true,
      tokOneDiscountPercent,
      tokOneDiscount,
      tokOneDeliveryDiscount,
      tokOneTotalSaved: roundCurrency(tokOneDiscount + tokOneDeliveryDiscount),
    };
  } catch (error) {
    console.error("Tok One pricing resolution failed:", error);
    return defaults;
  }
}

export async function buildVerifiedOrderPricing(input: {
  adminClient: any;
  userId: string;
  restaurantId: string;
  items: RawOrderItem[];
  deliveryFee?: number;
  metadata?: Record<string, unknown> | null;
  context?: "cart" | "zero-attente";
  reservationDate?: string;
  reservationTime?: string;
}) : Promise<VerifiedOrderPricing> {
  const deliveryFee = roundCurrency(Math.max(0, toNumber(input.deliveryFee)));
  const metadata = (input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata))
    ? input.metadata
    : {};
  const context = input.context || "cart";
  const paymentMethod = String(metadata.payment_method || "card");
  const deliveryAddress = String(metadata.delivery_address || "").trim();
  const isDeliveryJourney = context === "cart" && deliveryAddress.length > 0;

  const items = (input.items || []).map((item) => ({
    menu_item_id: String(item?.menu_item_id || ""),
    name: String(item?.name || ""),
    quantity: toPositiveInteger(item?.quantity, 1),
    unit_price: toNumber(item?.unit_price ?? item?.price),
    metadata: item?.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
      ? item.metadata
      : {},
  }));

  const regularItemIds = Array.from(new Set(
    items
      .map((item) => item.menu_item_id)
      .filter((itemId) => UUID_REGEX.test(itemId)),
  ));
  const antiWasteOfferIds = Array.from(new Set(
    items
      .map((item) => String(item.metadata?.anti_waste_offer_id || ""))
      .filter(Boolean),
  ));
  const flashSaleIds = Array.from(new Set(
    items
      .map((item) => String(item.metadata?.flash_sale_id || ""))
      .filter(Boolean),
  ));

  const [restaurantRes, activeFlags, menuItemsRes, antiWasteRes, flashSalesRes, formulasRes, promotionsRes, profileRes] = await Promise.all([
    input.adminClient
      .from("restaurants")
      .select("id, delivery_available, supports_pickup, supports_reservation, supports_dinein, disabled_payment_methods")
      .eq("id", input.restaurantId)
      .maybeSingle(),
    getEffectiveFeatureFlagSet(input.adminClient),
    regularItemIds.length
      ? input.adminClient
        .from("menu_items")
        .select("id, restaurant_id, name, price, category, is_available")
        .in("id", regularItemIds)
      : Promise.resolve({ data: [], error: null }),
    antiWasteOfferIds.length
      ? input.adminClient
        .from("anti_waste_offers")
        .select("id, restaurant_id, title, discounted_price, is_active")
        .in("id", antiWasteOfferIds)
      : Promise.resolve({ data: [], error: null }),
    flashSaleIds.length
      ? input.adminClient
        .from("flash_sales")
        .select("id, restaurant_id, title, discounted_price, is_active")
        .in("id", flashSaleIds)
      : Promise.resolve({ data: [], error: null }),
    input.adminClient
      .from("meal_formulas")
      .select("id, name, discount_percent, formula_key, applies_to, availability, meal_formula_categories(category, course_order)")
      .eq("restaurant_id", input.restaurantId)
      .eq("is_active", true),
    input.adminClient
      .from("restaurant_promotions")
      .select("name, promotion_type, promotion_value")
      .eq("restaurant_id", input.restaurantId)
      .eq("active", true)
      .lte("start_at", new Date().toISOString())
      .gte("end_at", new Date().toISOString())
      .order("promotion_value", { ascending: false }),
    input.adminClient
      .from("profiles")
      .select("loyalty_points")
      .eq("user_id", input.userId)
      .maybeSingle(),
  ]);

  if (restaurantRes.error) throw new Error(restaurantRes.error.message);
  if (menuItemsRes.error) throw new Error(menuItemsRes.error.message);
  if (antiWasteRes.error) throw new Error(antiWasteRes.error.message);
  if (flashSalesRes.error) throw new Error(flashSalesRes.error.message);
  if (formulasRes.error) throw new Error(formulasRes.error.message);
  if (promotionsRes.error) throw new Error(promotionsRes.error.message);
  if (profileRes.error) throw new Error(profileRes.error.message);

  const restaurantConfig = restaurantRes.data;
  if (!restaurantConfig) throw new Error("Restaurant introuvable.");

  assertPaymentMethodAllowed({
    activeFlags,
    paymentMethod,
    disabledPaymentMethods: restaurantConfig.disabled_payment_methods,
    cashAllowed: context !== "zero-attente",
  });

  if (context === "zero-attente") {
    if (!activeFlags.has("zero-attente") || !activeFlags.has("reservation") || !activeFlags.has("sur-place")) {
      throw new Error("Zero Attente est desactive globalement.");
    }
    if (!restaurantConfig.supports_reservation || !restaurantConfig.supports_dinein) {
      throw new Error("Ce restaurant ne propose pas Zero Attente.");
    }
  } else if (isDeliveryJourney) {
    if (!activeFlags.has("livraison")) {
      throw new Error("La livraison est desactivee globalement.");
    }
    if (!restaurantConfig.delivery_available) {
      throw new Error("La livraison est indisponible pour ce restaurant.");
    }
  } else {
    if (!activeFlags.has("emporter")) {
      throw new Error("L'emporter est desactive globalement.");
    }
    if (!restaurantConfig.supports_pickup) {
      throw new Error("L'emporter est indisponible pour ce restaurant.");
    }
  }

  const menuMap = new Map((menuItemsRes.data || []).map((row: any) => [row.id, row]));
  const antiWasteMap = new Map((antiWasteRes.data || []).map((row: any) => [row.id, row]));
  const flashMap = new Map((flashSalesRes.data || []).map((row: any) => [row.id, row]));

  const validatedItems: ValidatedOrderItem[] = [];

  for (const item of items) {
    if (!item.menu_item_id || item.menu_item_id === "garantie-qualite-fee") continue;

    if (UUID_REGEX.test(item.menu_item_id)) {
      const menuItem = menuMap.get(item.menu_item_id);
      if (!menuItem) throw new Error(`Article introuvable : ${item.menu_item_id}`);
      if (menuItem.restaurant_id !== input.restaurantId) throw new Error("Article invalide pour ce restaurant.");
      if (!menuItem.is_available) throw new Error(`Article indisponible : ${menuItem.name}`);

      validatedItems.push({
        menuItemId: item.menu_item_id,
        source: "menu_item",
        name: menuItem.name,
        quantity: item.quantity,
        unitPrice: roundCurrency(toNumber(menuItem.price)),
        category: menuItem.category || null,
        metadata: item.metadata,
      });
      continue;
    }

    const antiWasteOfferId = String(item.metadata?.anti_waste_offer_id || "");
    if (antiWasteOfferId) {
      const offer = antiWasteMap.get(antiWasteOfferId);
      if (!offer || !offer.is_active) throw new Error("Offre anti-gaspi invalide ou expiree.");
      if (offer.restaurant_id !== input.restaurantId) throw new Error("Offre anti-gaspi invalide pour ce restaurant.");
      validatedItems.push({
        menuItemId: item.menu_item_id,
        source: "anti_waste",
        name: offer.title,
        quantity: item.quantity,
        unitPrice: roundCurrency(toNumber(offer.discounted_price)),
        category: String(item.metadata?.category || ""),
        metadata: item.metadata,
      });
      continue;
    }

    const flashSaleId = String(item.metadata?.flash_sale_id || "");
    if (flashSaleId) {
      const sale = flashMap.get(flashSaleId);
      if (!sale || !sale.is_active) throw new Error("Vente flash invalide ou expiree.");
      if (sale.restaurant_id !== input.restaurantId) throw new Error("Vente flash invalide pour ce restaurant.");
      validatedItems.push({
        menuItemId: item.menu_item_id,
        source: "flash_sale",
        name: sale.title,
        quantity: item.quantity,
        unitPrice: roundCurrency(toNumber(sale.discounted_price)),
        category: String(item.metadata?.category || ""),
        metadata: item.metadata,
      });
      continue;
    }

    throw new Error("Article invalide detecte.");
  }

  if (validatedItems.some((item) => item.source === "anti_waste")) {
    if (!activeFlags.has("anti-gaspi")) {
      throw new Error("L'anti-gaspi est desactive globalement.");
    }
    if (isDeliveryJourney) {
      throw new Error("Les offres anti-gaspi sont uniquement disponibles a l'emporter.");
    }
  }

  if (validatedItems.some((item) => item.source === "flash_sale") && !activeFlags.has("ventes-flash")) {
    throw new Error("Les ventes flash sont desactivees globalement.");
  }

  const subtotal = roundCurrency(
    validatedItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0),
  );

  const tokOnePricing = await resolveTokOnePricing({
    adminClient: input.adminClient,
    userId: input.userId,
    restaurantId: input.restaurantId,
    context,
    isDeliveryJourney,
    subtotal,
    deliveryFee,
  });

  const hasQualityGuarantee = Boolean(metadata.quality_guarantee) || items.some((item) => item.menu_item_id === "garantie-qualite-fee");
  const qualityFee = hasQualityGuarantee ? QUALITY_GUARANTEE_FEE : 0;

  const formula = computeFormulaDiscount(
    (formulasRes.data || []) as MealFormulaRow[],
    validatedItems,
    subtotal,
    context,
    String(metadata.arrival_date || metadata.delivery_date || metadata.pickup_date || input.reservationDate || ""),
    String(metadata.arrival_time || metadata.delivery_time || metadata.pickup_time || input.reservationTime || ""),
  );
  const promotion = computePromotionDiscount(
    (promotionsRes.data || []) as RestaurantPromotionRow[],
    subtotal,
    deliveryFee,
  );

  const maxPointsDiscount = roundCurrency(Math.max(0, toNumber(profileRes.data?.loyalty_points) / 100));
  const requestedPointsDiscount = roundCurrency(Math.max(0, toNumber(metadata.points_discount_amount || metadata.points_discount)));
  const pointsDiscount = Math.min(requestedPointsDiscount, maxPointsDiscount);

  const requestedFlexDiscount = roundCurrency(Math.max(0, toNumber(metadata.flex_discount_amount || metadata.flex_discount)));
  const maxFlexDiscount = String(metadata.flex_option || "") === "flex"
    ? roundCurrency(subtotal * 0.1)
    : 0;
  const flexDiscount = Math.min(requestedFlexDiscount, maxFlexDiscount);

  const originalTotal = roundCurrency(subtotal + deliveryFee + qualityFee);
  const discountAmount = roundCurrency(
    Math.min(
      originalTotal,
      formula.amount + promotion.amount + tokOnePricing.tokOneDiscount + tokOnePricing.tokOneDeliveryDiscount + pointsDiscount + flexDiscount,
    ),
  );

  return {
    validatedItems,
    subtotal,
    deliveryFee,
    qualityFee,
    formulaDiscount: formula.amount,
    formulaDiscountPercent: formula.percent,
    formulaName: formula.name,
    promoDiscount: promotion.amount,
    promoName: promotion.name,
    tokOneMember: tokOnePricing.tokOneMember,
    tokOneDiscount: tokOnePricing.tokOneDiscount,
    tokOneDiscountPercent: tokOnePricing.tokOneDiscountPercent,
    tokOneDeliveryDiscount: tokOnePricing.tokOneDeliveryDiscount,
    tokOneTotalSaved: tokOnePricing.tokOneTotalSaved,
    pointsDiscount,
    flexDiscount,
    originalTotal,
    discountAmount,
    total: roundCurrency(Math.max(0, originalTotal - discountAmount)),
  };
}
