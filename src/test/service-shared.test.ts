import { describe, expect, it } from "vitest";

import {
  getRecommendedTableByReservation,
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

  it("prioritizes overlapping reservations as a table conflict", () => {
    const state = getTableServiceState({
      isReservable: true,
      assignments: [
        reservation({ id: "r1", time: "19:00", status: "confirmed" }),
        reservation({ id: "r2", time: "20:00", status: "confirmed" }),
      ],
      now: new Date("2026-05-27T18:30:00"),
    });

    expect(state.key).toBe("conflict");
    expect(state.label).toBe("Conflit horaire");
    expect(state.detail).toBe("2 réservations");
  });

  it("ignores released reservations when detecting table conflicts", () => {
    const state = getTableServiceState({
      isReservable: true,
      assignments: [
        reservation({ id: "r1", time: "19:00", status: "no_show" }),
        reservation({ id: "r2", time: "20:00", status: "confirmed" }),
      ],
      now: new Date("2026-05-27T18:30:00"),
    });

    expect(state.key).toBe("upcoming");
    expect(state.label).toBe("Reservee");
  });

  it("still shows a released reservation state when it is the only table assignment", () => {
    const state = getTableServiceState({
      isReservable: true,
      assignments: [
        reservation({ id: "r1", time: "19:00", status: "no_show" }),
      ],
      now: new Date("2026-05-27T18:30:00"),
    });

    expect(state.key).toBe("no-show");
    expect(state.label).toBe("No-show");
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
    expect(state.label).toBe("Zéro Attente");
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
    expect(exact.reasons).toContain("Capacité parfaite");
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

  it("penalizes tight rotations and explains the service risk", () => {
    const candidate = reservation({ id: "candidate", date: "2026-05-27", time: "20:40", party_size: 4 });
    const comfortable = scoreReservationPlacement({
      reservation: candidate,
      table: table({ capacity: 4 }),
      currentTableReservations: [
        reservation({ id: "early", date: "2026-05-27", time: "17:30", party_size: 4 }),
      ],
    });
    const tight = scoreReservationPlacement({
      reservation: candidate,
      table: table({ capacity: 4 }),
      currentTableReservations: [
        reservation({ id: "tight", date: "2026-05-27", time: "19:00", party_size: 4 }),
      ],
    });

    expect(comfortable.score).toBeGreaterThan(tight.score);
    expect(comfortable.reasons).toContain("Rotation confortable");
    expect(tight.reasons).toContain("Rotation serree");
  });

  it("builds one best compatible table recommendation per reservation", () => {
    const reservations = [
      reservation({ id: "r1", party_size: 4 }),
      reservation({ id: "r2", party_size: 2 }),
    ];
    const recommendations = getRecommendedTableByReservation({
      reservations,
      tables: [
        table({ id: "t8", table_number: "T8", capacity: 8 }),
        table({ id: "t4", table_number: "T4", capacity: 4 }),
        table({ id: "blocked", table_number: "Blocked", capacity: 4 }),
      ],
      getReservationDropState: (reservationId, tableId) => ({
        ok: tableId !== "blocked",
        reason: null,
      }),
      getPlacementScore: (candidate, candidateTable) => scoreReservationPlacement({
        reservation: candidate,
        table: candidateTable,
      }),
    });

    expect(recommendations.get("r1")?.table.id).toBe("t4");
    expect(recommendations.get("r1")?.score).toBeGreaterThan(90);
    expect(recommendations.get("r2")?.table.id).not.toBe("blocked");
  });
});
