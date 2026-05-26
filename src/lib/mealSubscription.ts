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

function createEmptySlot(day: MealSubscriptionDay): MealSubscriptionSlot {
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
  const byDay = new Map<string, MealSubscriptionSlot>(
    MEAL_SUBSCRIPTION_DAYS.map((day) => [day, createEmptySlot(day)]),
  );

  for (const slot of input) {
    if (!MEAL_SUBSCRIPTION_DAYS.includes(slot.day as MealSubscriptionDay)) continue;

    byDay.set(slot.day, {
      ...createEmptySlot(slot.day as MealSubscriptionDay),
      ...slot,
      price: Number(slot.price || 0),
    });
  }

  return MEAL_SUBSCRIPTION_DAYS.map((day) => byDay.get(day)!);
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

export function buildMealSubscriptionCartItems(slots: MealSubscriptionSlot[]) {
  return getActiveMealSlots(slots).map((slot) => ({
    menuItemId: slot.menuItemId,
    name: `[${slot.day}] ${slot.meal}`,
    price: Number(slot.price || 0),
    restaurantId: slot.restaurantId,
    restaurantName: slot.restaurant,
    metadata: {
      subscription_day: slot.day,
      preferred_time: slot.time || "12:00",
    },
  }));
}
