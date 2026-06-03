import { describe, expect, it } from "vitest";

import {
  buildZeroAttenteReservationUrl,
  readZeroAttenteReservationContext,
} from "@/lib/zeroAttenteReservationContext";

describe("Zero Attente reservation context", () => {
  it("keeps restaurant, date, time and party size when switching from reservation", () => {
    expect(buildZeroAttenteReservationUrl({
      restaurantId: "restaurant-123",
      date: "2026-06-20",
      time: "20:15",
      partySize: 4,
    })).toBe("/zero-attente?restaurant=restaurant-123&date=2026-06-20&time=20%3A15&party_size=4");
  });

  it("reads valid reservation context from the Zero Attente URL", () => {
    const params = new URLSearchParams("restaurant=restaurant-123&date=2026-06-20&time=20%3A15&party_size=4");

    expect(readZeroAttenteReservationContext(params, new Date("2026-06-03T12:00:00.000Z"))).toEqual({
      arrivalDate: "2026-06-20",
      arrivalTime: "20:15",
      partySize: 4,
    });
  });

  it("falls back to safe defaults for stale or invalid URL context", () => {
    const params = new URLSearchParams("date=2026-06-01&time=28:99&party_size=0");

    expect(readZeroAttenteReservationContext(params, new Date("2026-06-03T12:00:00.000Z"))).toEqual({
      arrivalDate: "2026-06-03",
      arrivalTime: "19:30",
      partySize: 2,
    });
  });
});
