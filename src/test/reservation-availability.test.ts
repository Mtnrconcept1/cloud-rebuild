import { describe, expect, it } from "vitest";
import { DEFAULT_SERVICE_SETTINGS, type ServiceSettingsMap } from "@/lib/serviceSettings";
import {
  buildReservationSlotGroups,
  selectRestaurantCardReservationSlots,
  getSlotCapacityForTime,
  isReservationCalendarDateDisabled,
} from "@/lib/reservationAvailability";

const withDinnerCapacity = (): ServiceSettingsMap => ({
  ...DEFAULT_SERVICE_SETTINGS,
  lunch: {
    ...DEFAULT_SERVICE_SETTINGS.lunch,
    service_closed: true,
  },
  dinner: {
    ...DEFAULT_SERVICE_SETTINGS.dinner,
    start_time: "19:00",
    end_time: "23:30",
    last_reservation_time: "23:00",
    slot_interval_minutes: 60,
    max_tables_per_slot: 8,
    slot_capacity_windows: [
      { start_time: "19:00", end_time: "23:00", max_tables: 10 },
    ],
  },
});

describe("reservation availability helpers", () => {
  it("allows same-day reservations while disabling past calendar days", () => {
    const now = new Date(2026, 4, 26, 15, 30);

    expect(isReservationCalendarDateDisabled(new Date(2026, 4, 26), now)).toBe(false);
    expect(isReservationCalendarDateDisabled(new Date(2026, 4, 25), now)).toBe(true);
    expect(isReservationCalendarDateDisabled(new Date(2026, 4, 27), now)).toBe(false);
  });

  it("builds selectable blocks only for open future times and greys out a full service", () => {
    const groups = buildReservationSlotGroups({
      serviceSettings: withDinnerCapacity(),
      selectedDate: new Date(2026, 4, 26),
      now: new Date(2026, 4, 26, 19, 10),
      reservedTablesByTime: {
        "20:00": 10,
      },
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].service).toBe("dinner");
    expect(groups[0].slots.map((slot) => slot.time)).toEqual(["20:00", "21:00", "22:00", "23:00"]);
    expect(groups[0].slots[0]).toMatchObject({
      time: "20:00",
      capacity: 10,
      reservedTables: 10,
      remainingTables: 0,
      available: false,
      disabledReason: "Complet",
    });
    expect(groups[0].slots[1]).toMatchObject({
      time: "21:00",
      capacity: 10,
      reservedTables: 10,
      remainingTables: 0,
      available: false,
      disabledReason: "Complet",
    });
  });

  it("uses the configured capacity window for a slot time", () => {
    const settings = withDinnerCapacity().dinner;

    expect(getSlotCapacityForTime("19:00", settings)).toBe(10);
    expect(getSlotCapacityForTime("22:00", settings)).toBe(10);
    expect(getSlotCapacityForTime("18:30", settings)).toBe(8);
  });

  it("shares the table capacity across every slot in a service", () => {
    const groups = buildReservationSlotGroups({
      serviceSettings: withDinnerCapacity(),
      selectedDate: new Date(2026, 4, 27),
      now: new Date(2026, 4, 26, 19, 10),
      reservedTablesByTime: {
        "19:00": 4,
        "21:00": 5,
      },
    });

    expect(groups).toHaveLength(1);
    expect(groups[0].slots.map((slot) => ({
      time: slot.time,
      capacity: slot.capacity,
      reservedTables: slot.reservedTables,
      remainingTables: slot.remainingTables,
      available: slot.available,
    }))).toEqual([
      { time: "19:00", capacity: 10, reservedTables: 9, remainingTables: 1, available: true },
      { time: "20:00", capacity: 10, reservedTables: 9, remainingTables: 1, available: true },
      { time: "21:00", capacity: 10, reservedTables: 9, remainingTables: 1, available: true },
      { time: "22:00", capacity: 10, reservedTables: 9, remainingTables: 1, available: true },
      { time: "23:00", capacity: 10, reservedTables: 9, remainingTables: 1, available: true },
    ]);
  });

  it("selects visible restaurant-card slots from configured reservation services only", () => {
    const slots = selectRestaurantCardReservationSlots({
      serviceSettings: {
        ...DEFAULT_SERVICE_SETTINGS,
        lunch: {
          ...DEFAULT_SERVICE_SETTINGS.lunch,
          start_time: "12:30",
          end_time: "14:30",
          last_reservation_time: "13:30",
          slot_interval_minutes: 30,
        },
        dinner: {
          ...DEFAULT_SERVICE_SETTINGS.dinner,
          start_time: "19:30",
          end_time: "22:00",
          last_reservation_time: "21:30",
          slot_interval_minutes: 30,
        },
      },
      selectedDate: new Date(2026, 5, 27),
      now: new Date(2026, 5, 27, 11, 0),
      reservedTablesByTime: {
        "12:30": 8,
      },
      limit: 2,
    });

    expect(slots.map((slot) => slot.time)).toEqual(["13:00", "13:30"]);
    expect(slots.some((slot) => slot.time === "12:00")).toBe(false);
    expect(slots.every((slot) => slot.available)).toBe(true);
  });
});
