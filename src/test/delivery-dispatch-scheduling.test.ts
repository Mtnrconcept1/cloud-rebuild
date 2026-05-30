import { describe, expect, it } from "vitest";

import { resolveScheduledDelivery } from "../../supabase/functions/_shared/delivery-dispatch";

function createAdminClient(openingHours: unknown) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({
            data: { opening_hours: openingHours },
            error: null,
          }),
        }),
      }),
    }),
  };
}

describe("delivery dispatch scheduling", () => {
  it("accepts scheduled delivery times inside explicit day opening windows", async () => {
    const result = await resolveScheduledDelivery(
      createAdminClient({ lundi: [{ open: "11:30", close: "16:00" }] }),
      "restaurant-1",
      {
        delivery_schedule_mode: "scheduled",
        delivery_date: "2026-06-01",
        delivery_time: "15:00",
      },
    );

    expect(result).toMatchObject({
      service: "opening_hours",
      dateValue: "2026-06-01",
      timeValue: "15:00",
    });
  });
});
