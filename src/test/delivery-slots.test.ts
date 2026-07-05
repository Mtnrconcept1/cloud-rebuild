import { describe, expect, it } from "vitest";

import {
  buildDeliverySlotGroups,
  findFirstAvailableDeliveryDate,
  formatScheduledDeliveryLabel,
} from "@/lib/deliverySlots";

const openingHours = {
  lundi: "11:30-22:30",
  mardi: "11:30-22:30",
  mercredi: "11:30-22:30",
  jeudi: "11:30-22:30",
  vendredi: "11:30-22:30",
  samedi: "11:30-22:30",
  dimanche: false,
  service_settings: {
    lunch: {
      start_time: "12:00",
      end_time: "14:00",
      online_booking_enabled: true,
      service_closed: false,
    },
    dinner: {
      start_time: "19:00",
      end_time: "21:00",
      online_booking_enabled: true,
      service_closed: false,
    },
  },
};

describe("delivery slots helpers", () => {
  it("builds delivery slots per lunch and dinner service", () => {
    const groups = buildDeliverySlotGroups({
      openingHours,
      dateValue: "2026-03-16",
      leadMinutes: 30,
      now: new Date("2026-03-15T10:00:00"),
    });

    expect(groups).toHaveLength(2);
    expect(groups[0].service).toBe("lunch");
    expect(groups[0].slots[0].time).toBe("12:00");
    expect(groups[1].service).toBe("dinner");
    expect(groups[1].slots[0].time).toBe("19:00");
  });

  it("removes already missed slots for same-day scheduling", () => {
    const groups = buildDeliverySlotGroups({
      openingHours,
      dateValue: "2026-03-16",
      leadMinutes: 45,
      now: new Date("2026-03-16T12:20:00"),
    });

    expect(groups[0].slots[0].time).toBe("13:15");
  });

  it("finds the next available open day", () => {
    const nextDate = findFirstAvailableDeliveryDate({
      openingHours,
      leadMinutes: 30,
      now: new Date("2026-03-15T10:00:00"),
    });

    expect(nextDate).toBe("2026-03-16");
  });

  it("returns no slots when the restaurant profile has no configured service hours", () => {
    const groups = buildDeliverySlotGroups({
      openingHours: null,
      dateValue: "2026-03-16",
      leadMinutes: 30,
      now: new Date("2026-03-16T10:00:00"),
    });

    expect(groups).toEqual([]);
  });

  it("uses order-specific service windows for takeaway and delivery slots", () => {
    const groups = buildDeliverySlotGroups({
      openingHours: {
        lundi: "11:30-22:30",
        service_settings: {
          lunch: {
            start_time: "11:30",
            end_time: "14:30",
            last_reservation_time: "14:00",
            order_start_time: "12:15",
            order_end_time: "13:00",
            online_booking_enabled: true,
            online_ordering_enabled: true,
            service_closed: false,
            orders_closed: false,
          },
        },
      },
      dateValue: "2026-03-16",
      leadMinutes: 0,
      now: new Date("2026-03-15T10:00:00"),
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].slots.map((slot) => slot.time)).toEqual(["12:15", "12:30", "12:45", "13:00"]);
  });

  it("hides order slots when the service is closed to online ordering", () => {
    const groups = buildDeliverySlotGroups({
      openingHours: {
        lundi: "11:30-22:30",
        service_settings: {
          lunch: {
            start_time: "11:30",
            end_time: "14:30",
            last_reservation_time: "14:00",
            order_start_time: "11:30",
            order_end_time: "14:30",
            online_booking_enabled: true,
            online_ordering_enabled: false,
            service_closed: false,
            orders_closed: false,
          },
          dinner: {
            start_time: "18:30",
            end_time: "22:30",
            last_reservation_time: "22:00",
            order_start_time: "18:30",
            order_end_time: "22:30",
            online_booking_enabled: true,
            online_ordering_enabled: true,
            service_closed: false,
            orders_closed: true,
          },
        },
      },
      dateValue: "2026-03-16",
      leadMinutes: 0,
      now: new Date("2026-03-15T10:00:00"),
    });

    expect(groups).toEqual([]);
  });

  it("formats the scheduled delivery label for display", () => {
    expect(formatScheduledDeliveryLabel("2026-03-16", "19:30")).toContain("19:30");
  });
});
