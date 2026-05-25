import { describe, expect, it } from "vitest";

import { summarizeReservationInventoryHealth } from "@/lib/reservationInventoryHealth";

describe("reservation inventory health", () => {
  it("detects duplicate confirmed reservations for the same table slot", () => {
    expect(summarizeReservationInventoryHealth([
      {
        id: "res-1",
        restaurant_id: "rest-1",
        date: "2026-05-25",
        time: "19:30:00",
        table_id: "table-4",
        status: "confirmed",
      },
      {
        id: "res-2",
        restaurant_id: "rest-1",
        date: "2026-05-25",
        time: "19:30",
        table_id: "table-4",
        status: "confirmed",
      },
      {
        id: "res-3",
        restaurant_id: "rest-1",
        date: "2026-05-25",
        time: "19:30",
        table_id: "table-5",
        status: "confirmed",
      },
    ])).toEqual({
      overbookedTables: 1,
      healthy: false,
      conflicts: [
        {
          key: "rest-1|2026-05-25|19:30|table-4",
          reservationIds: ["res-1", "res-2"],
        },
      ],
    });
  });

  it("ignores cancelled reservations and unassigned tables", () => {
    expect(summarizeReservationInventoryHealth([
      { id: "res-1", restaurant_id: "rest-1", date: "2026-05-25", time: "19:30", table_id: "table-4", status: "cancelled" },
      { id: "res-2", restaurant_id: "rest-1", date: "2026-05-25", time: "19:30", table_id: null, status: "confirmed" },
    ])).toMatchObject({
      overbookedTables: 0,
      healthy: true,
    });
  });
});
