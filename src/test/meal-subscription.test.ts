import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildMealSubscriptionCartItems,
  getMealSubscriptionSummary,
  normalizeMealSubscriptionSlots,
} from "@/lib/mealSubscription";

describe("mealSubscription", () => {
  it("normalizes duplicate day slots by keeping the latest slot", () => {
    const slots = normalizeMealSubscriptionSlots([
      { day: "Lundi", menuItemId: "old", meal: "Old", restaurant: "R1", restaurantId: "r1", price: 10, time: "12:00" },
      { day: "Lundi", menuItemId: "new", meal: "New", restaurant: "R2", restaurantId: "r2", price: 15, time: "13:00" },
    ]);

    expect(slots.find((slot) => slot.day === "Lundi")?.menuItemId).toBe("new");
    expect(slots).toHaveLength(7);
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
      { day: "Mercredi", menuItemId: "item-1", meal: "Plat", restaurant: "Tok", restaurantId: "res", price: 18, time: "12:00" },
      { day: "Jeudi", menuItemId: "", meal: "", restaurant: "", restaurantId: "", price: 0, time: "" },
    ]);

    expect(buildMealSubscriptionCartItems(slots)).toEqual([
      {
        menuItemId: "item-1",
        name: "[Mercredi] Plat",
        price: 18,
        restaurantId: "res",
        restaurantName: "Tok",
        metadata: { subscription_day: "Mercredi", preferred_time: "12:00" },
      },
    ]);
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
