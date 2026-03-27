import { describe, expect, it } from "vitest";

import {
  formatAvailabilityReason,
  normalizeReservationTime,
  sortReservationAvailability,
} from "@/lib/reservations";

describe("reservation helpers", () => {
  it("normalizes database time values to HH:MM", () => {
    expect(normalizeReservationTime("19:30:00")).toBe("19:30");
    expect(normalizeReservationTime("12:05")).toBe("12:05");
    expect(normalizeReservationTime(null)).toBe("");
  });

  it("sorts availability slots by normalized time", () => {
    const sorted = sortReservationAvailability([
      {
        slot_time: "20:15:00",
        shift_id: null,
        service_key: "dinner",
        available: true,
        reason: null,
        capacity_remaining: 4,
        requires_guarantee: false,
        requires_deposit: false,
        deposit_amount: 0,
        no_show_fee: 0,
        risk_level: "low",
      },
      {
        slot_time: "19:00:00",
        shift_id: null,
        service_key: "dinner",
        available: true,
        reason: null,
        capacity_remaining: 2,
        requires_guarantee: false,
        requires_deposit: false,
        deposit_amount: 0,
        no_show_fee: 0,
        risk_level: "low",
      },
    ]);

    expect(sorted.map((slot) => normalizeReservationTime(slot.slot_time))).toEqual(["19:00", "20:15"]);
  });

  it("formats availability reasons for disabled slots", () => {
    expect(formatAvailabilityReason("passed")).toBe("Créneau passé");
    expect(formatAvailabilityReason("capacity_reached")).toBe("Complet");
    expect(formatAvailabilityReason("unknown")).toBe("Indisponible");
  });
});
