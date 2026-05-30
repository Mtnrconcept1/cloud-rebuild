import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildMealSubscriptionCartItems,
  getMealSubscriptionDeliveryDate,
  getMealSubscriptionSummary,
  normalizeMealSubscriptionSlots,
} from "@/lib/mealSubscription";

describe("mealSubscription", () => {
  it("normalizes duplicate day slots without dropping meals from the same day", () => {
    const slots = normalizeMealSubscriptionSlots([
      { day: "Lundi", menuItemId: "old", meal: "Old", restaurant: "R1", restaurantId: "r1", price: 10, time: "12:00" },
      { day: "Lundi", menuItemId: "new", meal: "New", restaurant: "R2", restaurantId: "r2", price: 15, time: "13:00" },
    ]);

    expect(slots.filter((slot) => slot.day === "Lundi").map((slot) => slot.menuItemId)).toEqual(["old", "new"]);
    expect(slots).toHaveLength(2);
  });

  it("summarizes active meals and pause status", () => {
    const slots = normalizeMealSubscriptionSlots([
      { day: "Mardi", menuItemId: "item-1", meal: "Plat", restaurant: "Tok", restaurantId: "res", price: 18, time: "12:00" },
    ]);

    expect(getMealSubscriptionSummary(slots, { status: "paused" })).toMatchObject({
      activeMealsCount: 1,
      weeklyTotal: 18,
      isPaused: true,
    });
  });

  it("builds cart items from active slots only", () => {
    const slots = normalizeMealSubscriptionSlots([
      { id: "slot-1", day: "Mercredi", menuItemId: "item-1", meal: "Plat", restaurant: "Tok", restaurantId: "res", price: 18, time: "12:00" },
      { id: "slot-2", day: "Mercredi", menuItemId: "item-2", meal: "Dessert", restaurant: "Tok", restaurantId: "res", price: 8, time: "12:00" },
      { day: "Jeudi", menuItemId: "", meal: "", restaurant: "", restaurantId: "", price: 0, time: "" },
    ]);

    expect(buildMealSubscriptionCartItems(slots, { weekOffset: 0, now: new Date("2026-06-01T10:00:00Z") })).toEqual([
      {
        menuItemId: "item-1",
        name: "[Mercredi] Plat",
        price: 18,
        restaurantId: "res",
        restaurantName: "Tok",
        metadata: {
          is_meal_subscription: true,
          subscription_slot_id: "slot-1",
          subscription_day: "Mercredi",
          preferred_time: "12:00",
          delivery_date: "2026-06-03",
          delivery_time: "12:00",
          subscription_delivery_key: "Mercredi|2026-06-03|12:00",
        },
      },
      {
        menuItemId: "item-2",
        name: "[Mercredi] Dessert",
        price: 8,
        restaurantId: "res",
        restaurantName: "Tok",
        metadata: {
          is_meal_subscription: true,
          subscription_slot_id: "slot-2",
          subscription_day: "Mercredi",
          preferred_time: "12:00",
          delivery_date: "2026-06-03",
          delivery_time: "12:00",
          subscription_delivery_key: "Mercredi|2026-06-03|12:00",
        },
      },
    ]);
  });

  it("resolves delivery dates from the selected subscription week", () => {
    const monday = new Date("2026-06-01T10:00:00Z");

    expect(getMealSubscriptionDeliveryDate("Lundi", 0, monday)).toBe("2026-06-01");
    expect(getMealSubscriptionDeliveryDate("Dimanche", 0, monday)).toBe("2026-06-07");
    expect(getMealSubscriptionDeliveryDate("Lundi", 1, monday)).toBe("2026-06-08");
  });

  it("documents the migration that allows several meals on the same day", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase",
        "migrations",
        "20260530133000_allow_multiple_meal_subscription_slots.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("DROP CONSTRAINT IF EXISTS user_subscriptions_user_day_unique");
    expect(migration).toContain("idx_user_subscriptions_user_day");
  });

  it("documents the meal subscription persistence migration", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase",
        "migrations",
        "20260526162656_meal_subscription_status.sql",
      ),
      "utf8",
    );

    expect(migration).toContain("user_subscriptions_user_day_unique");
    expect(migration).toContain("user_meal_subscription_settings");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ranked_user_subscriptions");
  });
});
