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
  now?: Date;
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
  base.setUTCDate(base.getUTCDate() - mondayOffset + (weekOffset * 7) + DAY_TO_WEEK_INDEX[day as MealSubscriptionDay]);

  return base.toISOString().slice(0, 10);
}

export function buildMealSubscriptionCartItems(
  slots: MealSubscriptionSlot[],
  options: BuildMealSubscriptionCartOptions = {},
) {
  return getActiveMealSlots(slots).map((slot) => ({
    ...(() => {
      const deliveryDate = getMealSubscriptionDeliveryDate(slot.day, options.weekOffset || 0, options.now);
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
        },
      };
    })(),
  }));
}
