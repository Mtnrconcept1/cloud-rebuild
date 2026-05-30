import { describe, expect, it } from "vitest";

import {
  getMealSubscriptionRestaurantAvailability,
  isRestaurantOpenForMealSubscription,
} from "@/lib/mealSubscriptionAvailability";

describe("meal subscription restaurant availability", () => {
  it("marks restaurants closed when the selected day is closed", () => {
    expect(isRestaurantOpenForMealSubscription({
      lundi: { closed: true },
    }, "Lundi", "12:00")).toBe(false);
  });

  it("marks restaurants closed when the selected time is outside opening windows", () => {
    expect(isRestaurantOpenForMealSubscription({
      lundi: [
        { open: "11:30", close: "14:00" },
        { open: "18:30", close: "22:00" },
      ],
    }, "Lundi", "15:00")).toBe(false);
  });

  it("returns a UI label for grayed restaurants", () => {
    expect(getMealSubscriptionRestaurantAvailability({
      name: "Cafe ferme",
      opening_hours: { lundi: [{ open: "11:30", close: "14:00" }] },
    }, "Lundi", "15:00")).toEqual({
      isOpen: false,
      label: "Ferme a 15:00",
    });
  });
});
