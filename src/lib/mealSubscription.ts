export const MEAL_SUBSCRIPTION_DAYS = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
] as const;

export type MealSubscriptionDay = typeof MEAL_SUBSCRIPTION_DAYS[number];

export type MealSubscriptionSlot = {
  id?: string;
  day: string;
  menuItemId: string;
  meal: string;
  restaurant: string;
  restaurantId: string;
  price: number;
  time: string;
};

export type MealSubscriptionStatus = {
  status: "active" | "paused";
  resume_at?: string | null;
};

type BuildMealSubscriptionCartOptions = {
  weekOffset?: number;
  endDate?: string;
  now?: Date;
  deliveryTime?: string;
};

const DAY_TO_WEEK_INDEX: Record<MealSubscriptionDay, number> = {
  Lundi: 0,
  Mardi: 1,
  Mercredi: 2,
  Jeudi: 3,
  Vendredi: 4,
  Samedi: 5,
  Dimanche: 6,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;
const SCHEDULING_TIME_ZONE = "Europe/Zurich";

export function createEmptyMealSubscriptionSlot(day: MealSubscriptionDay): MealSubscriptionSlot {
  return {
    day,
    menuItemId: "",
    meal: "",
    restaurant: "",
    restaurantId: "",
    price: 0,
    time: "",
  };
}

export function normalizeMealSubscriptionSlots(input: MealSubscriptionSlot[]) {
  return input
    .filter((slot) => MEAL_SUBSCRIPTION_DAYS.includes(slot.day as MealSubscriptionDay))
    .map((slot) => ({
      ...createEmptyMealSubscriptionSlot(slot.day as MealSubscriptionDay),
      ...slot,
      price: Number(slot.price || 0),
    }));
}

export function getActiveMealSlots(slots: MealSubscriptionSlot[]) {
  return normalizeMealSubscriptionSlots(slots).filter((slot) =>
    Boolean(slot.menuItemId && slot.meal && slot.restaurantId),
  );
}

export function getMealSubscriptionSummary(slots: MealSubscriptionSlot[], status: MealSubscriptionStatus) {
  const activeSlots = getActiveMealSlots(slots);
  const weeklyTotal = activeSlots.reduce((sum, slot) => sum + Number(slot.price || 0), 0);
  const regularTotal = activeSlots.length * 18;

  return {
    activeMealsCount: activeSlots.length,
    weeklyTotal,
    regularTotal,
    savings: Math.max(0, regularTotal - weeklyTotal),
    isPaused: status.status === "paused",
    resumeAt: status.resume_at || null,
  };
}

export function getMealSubscriptionDeliveryDate(day: string, weekOffset = 0, now = new Date()) {
  if (!MEAL_SUBSCRIPTION_DAYS.includes(day as MealSubscriptionDay)) return "";

  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const mondayOffset = (base.getUTCDay() + 6) % 7;
  const todayTime = base.getTime();
  base.setUTCDate(base.getUTCDate() - mondayOffset + (weekOffset * 7) + DAY_TO_WEEK_INDEX[day as MealSubscriptionDay]);
  if (weekOffset === 0 && base.getTime() < todayTime) {
    base.setUTCDate(base.getUTCDate() + 7);
  }

  return base.toISOString().slice(0, 10);
}

function parseIsoDate(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTimeMinutes(value: string | undefined) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || "").trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function getZurichDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHEDULING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return {
    dateValue: `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`,
    minutes: Number(byType.get("hour") || 0) * 60 + Number(byType.get("minute") || 0),
  };
}

function isSameDayDeliveryTimePast(dateValue: string, deliveryTime: string | undefined, now: Date) {
  const deliveryMinutes = parseTimeMinutes(deliveryTime);
  if (deliveryMinutes === null) return false;

  const nowParts = getZurichDateParts(now);
  return dateValue === nowParts.dateValue && deliveryMinutes <= nowParts.minutes;
}

export function getDefaultMealSubscriptionEndDate(weekOffset = 0, now = new Date(), weeks = 4) {
  const start = parseIsoDate(getMealSubscriptionDeliveryDate("Lundi", weekOffset, now));
  if (!start) return "";
  start.setUTCDate(start.getUTCDate() + ((Math.max(1, weeks) * 7) - 1));
  return start.toISOString().slice(0, 10);
}

export function getMealSubscriptionOccurrenceDates(
  day: string,
  options: BuildMealSubscriptionCartOptions = {},
) {
  const firstDateValue = getMealSubscriptionDeliveryDate(day, options.weekOffset || 0, options.now);
  const firstDate = parseIsoDate(firstDateValue);
  if (!firstDate) return [];

  const endDate = options.endDate ? parseIsoDate(options.endDate) : firstDate;
  if (!endDate || endDate.getTime() < firstDate.getTime()) return [];

  const dates: string[] = [];
  const firstOccurrence = isSameDayDeliveryTimePast(firstDateValue, options.deliveryTime, options.now || new Date())
    ? new Date(firstDate.getTime() + MS_PER_WEEK)
    : firstDate;

  for (let cursor = new Date(firstOccurrence); cursor.getTime() <= endDate.getTime(); cursor = new Date(cursor.getTime() + MS_PER_WEEK)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }

  return dates;
}

export function buildMealSubscriptionCartItems(
  slots: MealSubscriptionSlot[],
  options: BuildMealSubscriptionCartOptions = {},
) {
  return getActiveMealSlots(slots).flatMap((slot) => {
    const deliveryDates = getMealSubscriptionOccurrenceDates(slot.day, { ...options, deliveryTime: slot.time || "12:00" });
    const subscriptionStartDate = deliveryDates[0] || "";

    return deliveryDates.map((deliveryDate, occurrenceIndex) => {
      const deliveryTime = slot.time || "12:00";

      return {
        menuItemId: slot.menuItemId,
        name: `[${slot.day}] ${slot.meal}`,
        price: Number(slot.price || 0),
        restaurantId: slot.restaurantId,
        restaurantName: slot.restaurant,
        metadata: {
          is_meal_subscription: true,
          ...(slot.id ? { subscription_slot_id: slot.id } : {}),
          subscription_day: slot.day,
          preferred_time: deliveryTime,
          delivery_date: deliveryDate,
          delivery_time: deliveryTime,
          subscription_delivery_key: `${slot.day}|${deliveryDate}|${deliveryTime}`,
          ...(options.endDate ? {
            subscription_start_date: subscriptionStartDate,
            subscription_end_date: options.endDate,
            subscription_occurrence_count: deliveryDates.length,
            subscription_occurrence_index: occurrenceIndex + 1,
          } : {}),
        },
      };
    });
  });
}

export function getMealSubscriptionBillingSummary(
  slots: MealSubscriptionSlot[],
  options: BuildMealSubscriptionCartOptions = {},
) {
  const cartItems = buildMealSubscriptionCartItems(slots, options);
  const subscriptionTotal = cartItems.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const uniqueDates = Array.from(new Set(cartItems.map((item) => String(item.metadata.delivery_date || "")).filter(Boolean)));

  return {
    occurrencesCount: cartItems.length,
    deliveryDatesCount: uniqueDates.length,
    subscriptionTotal,
    endDate: options.endDate || uniqueDates[uniqueDates.length - 1] || "",
  };
}
