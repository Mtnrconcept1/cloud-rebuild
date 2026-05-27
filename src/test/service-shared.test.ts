import { describe, expect, it } from "vitest";

import {
  getTableServiceState,
  scoreReservationPlacement,
  type ServiceDraftTable,
  type ServiceReservation,
} from "@/components/floor-plan/serviceShared";

function reservation(overrides: Partial<ServiceReservation>): ServiceReservation {
  return {
    id: "reservation",
    user_id: "user",
    restaurant_id: "restaurant",
    table_id: null,
    date: "2026-05-27",
    time: "20:00",
    party_size: 2,
    status: "confirmed",
    notes: null,
    special_requests: null,
    feature: null,
    metadata: {},
    created_at: "2026-05-27T10:00:00Z",
    updated_at: "2026-05-27T10:00:00Z",
    confirmed_at: null,
    customer: { full_name: "Client Test", phone: null },
    ...overrides,
  } as ServiceReservation;
}

function table(overrides: Partial<ServiceDraftTable>): ServiceDraftTable {
  return {
    id: "table",
    table_number: "T1",
    capacity: 4,
    is_active: true,
    sector: "Salle",
    layout: {
      x: 0,
      y: 0,
      w: 180,
      h: 120,
      rotation: 0,
      shape: "rect",
      kind: "table",
      seatLabels: [1, 1, 1, 1],
    },
    ...overrides,
  };
}

describe("service shared table state", () => {
  it("marks empty reservable tables as free", () => {
    expect(getTableServiceState({
      isReservable: true,
      assignments: [],
      now: new Date("2026-05-27T19:00:00"),
    })).toMatchObject({
      key: "free",
      label: "Libre",
    });
  });

  it("highlights late reservations before generic upcoming reservations", () => {
    const state = getTableServiceState({
      isReservable: true,
      assignments: [reservation({ time: "19:30", status: "confirmed" })],
      now: new Date("2026-05-27T19:47:00"),
    });

    expect(state.key).toBe("late");
    expect(state.label).toBe("Retard");
    expect(state.detail).toContain("17 min");
  });

  it("marks arrived and seated reservations as active service states", () => {
    expect(getTableServiceState({
      isReservable: true,
      assignments: [reservation({ status: "arrived" })],
      now: new Date("2026-05-27T20:05:00"),
    }).key).toBe("arrived");

    const seated = getTableServiceState({
      isReservable: true,
      assignments: [reservation({ status: "seated" })],
      now: new Date("2026-05-27T20:05:00"),
    });

    expect(seated.key).toBe("occupied");
    expect(seated.detail).toBe("lib. ~21:30");
  });

  it("marks occupied tables as soon free near their estimated release time", () => {
    const state = getTableServiceState({
      isReservable: true,
      assignments: [reservation({ status: "seated", time: "20:00" })],
      now: new Date("2026-05-27T21:20:00"),
    });

    expect(state.key).toBe("soon-free");
    expect(state.label).toBe("Bientot libre");
    expect(state.detail).toBe("lib. ~21:30");
  });

  it("does not mark another service date as late", () => {
    const state = getTableServiceState({
      isReservable: true,
      assignments: [reservation({ date: "2026-05-28", time: "19:30", status: "confirmed" })],
      now: new Date("2026-05-27T19:47:00"),
    });

    expect(state.key).toBe("upcoming");
    expect(state.label).toBe("Reservee");
  });

  it("prioritizes Zero Attente when the primary reservation is preordered", () => {
    const state = getTableServiceState({
      isReservable: true,
      assignments: [reservation({ feature: "zero-attente", status: "confirmed" })],
      now: new Date("2026-05-27T19:55:00"),
    });

    expect(state.key).toBe("zero-attente");
    expect(state.label).toBe("Zero Attente");
  });

  it("marks furniture separately from reservable table states", () => {
    expect(getTableServiceState({
      isReservable: false,
      assignments: [],
      now: new Date("2026-05-27T19:00:00"),
    })).toMatchObject({
      key: "furniture",
      label: "Mobilier",
    });
  });

  it("scores exact capacity above oversized tables", () => {
    const candidate = reservation({ party_size: 4 });
    const exact = scoreReservationPlacement({
      reservation: candidate,
      table: table({ capacity: 4 }),
    });
    const oversized = scoreReservationPlacement({
      reservation: candidate,
      table: table({ capacity: 8 }),
    });

    expect(exact.score).toBeGreaterThan(oversized.score);
    expect(exact.reasons).toContain("Capacite parfaite");
    expect(oversized.reasons).toContain("4 place(s) libres");
  });

  it("penalizes small parties on large tables to preserve group capacity", () => {
    const score = scoreReservationPlacement({
      reservation: reservation({ party_size: 2 }),
      table: table({ capacity: 6 }),
    });

    expect(score.score).toBeLessThan(60);
    expect(score.reasons).toContain("Preserve les grandes tables");
  });
});
