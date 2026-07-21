import {
  assertPaymentMethodAllowed,
  getEffectiveFeatureFlagSet,
} from "./feature-flags.ts";
import { isTokOneEntitledStatus } from "./tok-one.ts";

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

type PromoCodeRow = {
  id: string;
  code: string;
  type: string;
  value: number;
  min_order_amount: number | null;
  max_discount: number | null;
  max_uses: number | null;
  current_uses: number | null;
  per_user_limit: number | null;
  restaurant_id: string | null;
  is_first_order_only: boolean | null;
  is_stackable: boolean | null;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean | null;
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

export function isClientCheckoutRestaurantEligible(
  restaurant: {
    is_active?: boolean | null;
    status?: string | null;
    is_demo?: boolean | null;
  } | null | undefined,
): boolean {
  return restaurant?.is_active === true
    && restaurant.status === "active"
    && restaurant.is_demo === false;
}

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
  promoCodeId: string | null;
  promoCodeDiscount: number;
  promoCodeName: string | null;
  promotionSource: "restaurant_promotion" | "promo_code" | null;
  tokOneMember: boolean;
  tokOneDiscount: number;
  tokOneDiscountPercent: number;
  tokOneDeliveryDiscount: number;
  tokOneTotalSaved: number;
  miamzBenefitsApplied: string[];
  miamzPointsMultiplier: number;
  miamzDeliveryDiscount: number;
  miamzDeliveryDiscountPercent: number;
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

function toIsoDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function buildLocalDateTime(dateValue: unknown, timeValue: unknown) {
  const dateText = String(dateValue || "").trim();
  const timeText = String(timeValue || "").trim();
  if (!dateText || !timeText) return null;

  const parsed = new Date(`${dateText}T${timeText}`);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function sumQuantitiesByMetadata(items: Array<{ quantity: number; metadata: Record<string, unknown> }>, keys: string[]) {
  const totals = new Map<string, number>();

  for (const item of items) {
    const id = keys
      .map((key) => String(item.metadata?.[key] || ""))
      .find(Boolean);
    if (!id) continue;
    totals.set(id, (totals.get(id) || 0) + item.quantity);
  }

  return totals;
}

function validateAntiWasteOfferAvailability(input: {
  offer: any;
  requestedQuantity: number;
  now: Date;
}) {
  if (!input.offer || !input.offer.is_active) {
    throw new Error("Offre anti-gaspi invalide ou expiree.");
  }
  if (Number(input.offer.quantity_available || 0) < input.requestedQuantity) {
    throw new Error("Stock anti-gaspi insuffisant pour cette offre.");
  }
  if (!input.offer.available_date || !input.offer.pickup_start || !input.offer.pickup_end) {
    throw new Error("Fenetre de retrait anti-gaspi invalide.");
  }

  const today = toIsoDateKey(input.now);
  const availableDate = String(input.offer.available_date);
  if (availableDate < today) {
    throw new Error("Offre anti-gaspi expiree.");
  }

  const pickupStart = buildLocalDateTime(availableDate, input.offer.pickup_start);
  const pickupEnd = buildLocalDateTime(availableDate, input.offer.pickup_end);
  if (!pickupStart || !pickupEnd || pickupEnd <= pickupStart) {
    throw new Error("Fenetre de retrait anti-gaspi invalide.");
  }
  if (availableDate === today && pickupEnd <= input.now) {
    throw new Error("Offre anti-gaspi expiree.");
  }
}

function validateFlashSaleAvailability(input: {
  sale: any;
  requestedQuantity: number;
  now: Date;
  isDeliveryJourney: boolean;
}) {
  if (!input.sale || !input.sale.is_active) {
    throw new Error("Vente flash invalide ou expiree.");
  }
  if (Number(input.sale.quantity_available || 0) < input.requestedQuantity) {
    throw new Error("Stock vente flash insuffisant pour cette offre.");
  }
  if (input.isDeliveryJourney && input.sale.delivery_available === false) {
    throw new Error("Cette vente flash n'est pas disponible en livraison.");
  }
  if (!input.isDeliveryJourney && input.sale.takeaway_available === false) {
    throw new Error("Cette vente flash n'est pas disponible a l'emporter.");
  }
  if (!input.sale.sale_date || !input.sale.sale_start || !input.sale.sale_end) {
    throw new Error("Fenetre de vente flash invalide.");
  }

  const saleStart = buildLocalDateTime(input.sale.sale_date, input.sale.sale_start);
  const saleEnd = buildLocalDateTime(input.sale.sale_date, input.sale.sale_end);
  if (!saleStart || !saleEnd || saleEnd <= saleStart) {
    throw new Error("Fenetre de vente flash invalide.");
  }
  if (input.now < saleStart || input.now >= saleEnd) {
    throw new Error("Vente flash expiree ou pas encore active.");
  }
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

async function computePromoCodeDiscount(input: {
  adminClient: any;
  userId: string;
  restaurantId: string;
  promoCodeId: string | null;
  subtotal: number;
  deliveryFee: number;
}) {
  if (!input.promoCodeId) {
    return {
      id: null,
      amount: 0,
      name: null,
    };
  }

  const { data: promoRow, error: promoError } = await input.adminClient
    .from("promo_codes")
    .select("id, code, type, value, min_order_amount, max_discount, max_uses, current_uses, per_user_limit, restaurant_id, is_first_order_only, is_stackable, valid_from, valid_until, is_active")
    .eq("id", input.promoCodeId)
    .maybeSingle();

  if (promoError) throw new Error(promoError.message);

  const promo = promoRow as PromoCodeRow | null;
  if (!promo || promo.is_active === false) {
    throw new Error("Code promo invalide.");
  }

  const now = new Date().toISOString();
  if (promo.valid_from && promo.valid_from > now) {
    throw new Error("Ce code promo n'est pas encore actif.");
  }
  if (promo.valid_until && promo.valid_until < now) {
    throw new Error("Ce code promo a expire.");
  }
  if (promo.max_uses != null && Number(promo.current_uses || 0) >= promo.max_uses) {
    throw new Error("Ce code promo a atteint sa limite d'utilisation.");
  }
  if (promo.restaurant_id && promo.restaurant_id !== input.restaurantId) {
    throw new Error("Ce code promo n'est pas valable pour ce restaurant.");
  }
  if (promo.min_order_amount && input.subtotal < Number(promo.min_order_amount)) {
    throw new Error(`Commande minimum de ${Number(promo.min_order_amount).toFixed(2)} CHF requise.`);
  }

  if (promo.per_user_limit) {
    const { count, error: usesError } = await input.adminClient
      .from("promo_code_uses")
      .select("*", { count: "exact", head: true })
      .eq("promo_code_id", promo.id)
      .eq("user_id", input.userId);

    if (usesError) throw new Error(usesError.message);
    if (count != null && count >= promo.per_user_limit) {
      throw new Error("Vous avez deja utilise ce code.");
    }
  }

  if (promo.is_first_order_only) {
    const { count, error: ordersError } = await input.adminClient
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("user_id", input.userId)
      .not("status", "in", "(cancelled,refused,payment_failed,pending_payment)");

    if (ordersError) throw new Error(ordersError.message);
    if (count != null && count > 0) {
      throw new Error("Ce code est réservé à la première commande.");
    }
  }

  let discount = 0;
  if (promo.type === "percentage") {
    discount = roundCurrency((input.subtotal * Number(promo.value || 0)) / 100);
    if (promo.max_discount) {
      discount = Math.min(discount, Number(promo.max_discount));
    }
  } else if (promo.type === "fixed") {
    discount = Math.min(Number(promo.value || 0), input.subtotal);
  } else if (promo.type === "free_delivery") {
    discount = roundCurrency(input.deliveryFee);
  }

  return {
    id: promo.id,
    amount: roundCurrency(discount),
    name: `Code ${promo.code}`,
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

function parseOptionalConfigNumber(value: unknown, keys: string[]) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const record = asRecord(value);
  if (!record) return null;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    const parsed = Number(record[key]);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
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

async function resolveMiamzPricing(input: {
  adminClient: any;
  userId: string;
  isDeliveryJourney: boolean;
  deliveryFee: number;
}) {
  const defaults = {
    miamzBenefitsApplied: [] as string[],
    miamzPointsMultiplier: 1,
    miamzDeliveryDiscount: 0,
    miamzDeliveryDiscountPercent: 0,
  };

  try {
    const { data, error } = await input.adminClient.rpc("resolve_miamz_benefit_state", {
      p_user_id: input.userId,
    });

    if (error) throw error;

    const state = asRecord(data);
    const effects = asRecord(state?.effects);
    const miamzBenefitsApplied = normalizeBenefitList(state?.active_benefit_ids);
    const hasDeliveryFeeBoost = miamzBenefitsApplied.includes("delivery_fee_boost");
    const miamzPointsMultiplier = Math.max(1, toNumber(effects?.points_multiplier, 1));
    const deliveryPercent = hasDeliveryFeeBoost
      ? Math.max(0, toNumber(effects?.delivery_fee_discount_percent))
      : 0;
    const deliveryCap = Math.max(0, toNumber(effects?.delivery_fee_discount_cap));
    const rawDeliveryDiscount = input.isDeliveryJourney && input.deliveryFee > 0 && deliveryPercent > 0
      ? roundCurrency((input.deliveryFee * deliveryPercent) / 100)
      : 0;
    const miamzDeliveryDiscount = roundCurrency(
      deliveryCap > 0 ? Math.min(rawDeliveryDiscount, deliveryCap) : rawDeliveryDiscount,
    );

    return {
      miamzBenefitsApplied,
      miamzPointsMultiplier,
      miamzDeliveryDiscount,
      miamzDeliveryDiscountPercent: deliveryPercent,
    };
  } catch (error) {
    console.error("Miamz pricing resolution failed:", error);
    return defaults;
  }
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
  const applicableBenefits = freeDeliveryBenefits
    .filter((benefit) => isTokOneBenefitApplicable(benefit, restaurantId, journey));
  const configuredValues = applicableBenefits
    .map((benefit) => parseOptionalConfigNumber(benefit.value, ["min_order", "minimum_order", "free_delivery_min_order", "threshold", "value"]))
    .filter((value): value is number => value !== null);

  if (configuredValues.length > 0) return Math.max(...configuredValues);
  if (freeDeliveryBenefits.length > 0 && applicableBenefits.length === 0) return Number.POSITIVE_INFINITY;
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
        isTokOneEntitledStatus(activeSubscription.status) &&
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
  const requestedDeliveryFee = roundCurrency(Math.max(0, toNumber(input.deliveryFee)));
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
      .map((item) => String(item.metadata?.anti_waste_offer_id || item.metadata?.offer_id || ""))
      .filter(Boolean),
  ));
  const flashSaleIds = Array.from(new Set(
    items
      .map((item) => String(item.metadata?.flash_sale_id || ""))
      .filter(Boolean),
  ));
  const antiWasteQuantities = sumQuantitiesByMetadata(items, ["anti_waste_offer_id", "offer_id"]);
  const flashSaleQuantities = sumQuantitiesByMetadata(items, ["flash_sale_id"]);

  const [restaurantRes, activeFlags, menuItemsRes, antiWasteRes, flashSalesRes, formulasRes, promotionsRes, profileRes] = await Promise.all([
    input.adminClient
      .from("restaurants")
      .select("id, delivery_available, delivery_fee, supports_pickup, supports_reservation, supports_dinein, disabled_payment_methods")
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
        .select("id, restaurant_id, title, discounted_price, quantity_available, available_date, pickup_start, pickup_end, is_active")
        .in("id", antiWasteOfferIds)
      : Promise.resolve({ data: [], error: null }),
    flashSaleIds.length
      ? input.adminClient
        .from("flash_sales")
        .select("id, restaurant_id, title, discounted_price, quantity_available, sale_date, sale_start, sale_end, delivery_available, takeaway_available, is_active")
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

  const configuredDeliveryFee = roundCurrency(
    Math.max(0, toNumber(restaurantConfig.delivery_fee)),
  );
  const deliveryFee = isDeliveryJourney ? configuredDeliveryFee : 0;
  if (
    isDeliveryJourney
    && Math.abs(requestedDeliveryFee - configuredDeliveryFee) > 0.009
  ) {
    console.warn("ORDER_DELIVERY_FEE_REPRICED", {
      restaurant_id: input.restaurantId,
      requested_delivery_fee: requestedDeliveryFee,
      configured_delivery_fee: configuredDeliveryFee,
    });
  }

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
  const now = new Date();

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

    const antiWasteOfferId = String(item.metadata?.anti_waste_offer_id || item.metadata?.offer_id || "");
    if (antiWasteOfferId) {
      const offer = antiWasteMap.get(antiWasteOfferId);
      validateAntiWasteOfferAvailability({
        offer,
        requestedQuantity: antiWasteQuantities.get(antiWasteOfferId) || item.quantity,
        now,
      });
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
      validateFlashSaleAvailability({
        sale,
        requestedQuantity: flashSaleQuantities.get(flashSaleId) || item.quantity,
        now,
        isDeliveryJourney,
      });
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
  const miamzPricing = await resolveMiamzPricing({
    adminClient: input.adminClient,
    userId: input.userId,
    isDeliveryJourney,
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
  const promoCode = await computePromoCodeDiscount({
    adminClient: input.adminClient,
    userId: input.userId,
    restaurantId: input.restaurantId,
    promoCodeId: typeof metadata.promo_code_id === "string" ? metadata.promo_code_id : null,
    subtotal,
    deliveryFee,
  });
  const selectedPromo = promoCode.amount > 0 && promoCode.amount >= promotion.amount
    ? {
      amount: promoCode.amount,
      name: promoCode.name,
      source: "promo_code" as const,
    }
    : promotion.amount > 0
      ? {
        amount: promotion.amount,
        name: promotion.name,
        source: "restaurant_promotion" as const,
      }
      : {
        amount: 0,
        name: null,
        source: null,
      };

  const maxPointsDiscount = roundCurrency(Math.max(0, toNumber(profileRes.data?.loyalty_points) / 100));
  const requestedPointsToRedeem = Math.max(0, Math.floor(toNumber(metadata.points_to_redeem)));
  const requestedPointsDiscount = requestedPointsToRedeem > 0
    ? roundCurrency(
      Math.min(
        toNumber(metadata.points_discount_amount || metadata.points_discount),
        requestedPointsToRedeem / 100,
      ),
    )
    : 0;
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
      formula.amount
        + selectedPromo.amount
        + tokOnePricing.tokOneDiscount
        + tokOnePricing.tokOneDeliveryDiscount
        + miamzPricing.miamzDeliveryDiscount
        + pointsDiscount
        + flexDiscount,
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
    promoDiscount: selectedPromo.amount,
    promoName: selectedPromo.name,
    promoCodeId: selectedPromo.source === "promo_code" ? promoCode.id : null,
    promoCodeDiscount: selectedPromo.source === "promo_code" ? promoCode.amount : 0,
    promoCodeName: selectedPromo.source === "promo_code" ? promoCode.name : null,
    promotionSource: selectedPromo.source,
    tokOneMember: tokOnePricing.tokOneMember,
    tokOneDiscount: tokOnePricing.tokOneDiscount,
    tokOneDiscountPercent: tokOnePricing.tokOneDiscountPercent,
    tokOneDeliveryDiscount: tokOnePricing.tokOneDeliveryDiscount,
    tokOneTotalSaved: tokOnePricing.tokOneTotalSaved,
    miamzBenefitsApplied: miamzPricing.miamzBenefitsApplied,
    miamzPointsMultiplier: miamzPricing.miamzPointsMultiplier,
    miamzDeliveryDiscount: miamzPricing.miamzDeliveryDiscount,
    miamzDeliveryDiscountPercent: miamzPricing.miamzDeliveryDiscountPercent,
    pointsDiscount,
    flexDiscount,
    originalTotal,
    discountAmount,
    total: roundCurrency(Math.max(0, originalTotal - discountAmount)),
  };
}
