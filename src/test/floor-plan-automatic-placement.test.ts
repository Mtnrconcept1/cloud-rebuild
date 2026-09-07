import { describe, expect, it } from "vitest";

import {
  planAutomaticPlacement,
  scoreReservationPlacement,
  type ServiceDraftTable,
  type ServiceReservation,
} from "@/components/floor-plan/serviceShared";

function reservation(overrides: Partial<ServiceReservation>): ServiceReservation {
  return {
    id: "reservation",
    user_id: "user",
    restaurant_id: "restaurant",
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

function table(id: string, capacity: number, label = id.toUpperCase()): ServiceDraftTable {
  return {
    id,
    table_number: label,
    capacity,
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
      seatLabels: Array.from({ length: capacity }, () => 1),
    },
  };
}

/**
 * Reproduit la règle réelle du plan : capacité suffisante et table encore
 * libre dans la carte en cours de construction.
 */
function makeCanPlace(tables: ServiceDraftTable[], reservations: ServiceReservation[]) {
  return (reservationId: string, tableId: string, working: Record<string, string | null>) => {
    const target = reservations.find((item) => item.id === reservationId);
    const candidate = tables.find((item) => item.id === tableId);
    if (!target || !candidate) return false;
    if (target.party_size > candidate.capacity) return false;
    return !Object.entries(working).some(([id, assigned]) => id !== reservationId && assigned === tableId);
  };
}

const getPlacementScore = (
  target: ServiceReservation,
  candidate: ServiceDraftTable,
) => scoreReservationPlacement({ reservation: target, table: candidate });

describe("planAutomaticPlacement", () => {
  it("ne donne jamais la même table à deux réservations", () => {
    const tables = [table("t1", 2), table("t2", 2)];
    const reservations = [
      reservation({ id: "r1", party_size: 2, user_id: "u1" }),
      reservation({ id: "r2", party_size: 2, user_id: "u2" }),
    ];

    const placed = planAutomaticPlacement({
      reservations,
      tables,
      assignments: {},
      canPlace: makeCanPlace(tables, reservations),
      getPlacementScore,
    });

    expect(Object.keys(placed)).toHaveLength(2);
    expect(new Set(Object.values(placed)).size).toBe(2);
  });

  it("sert les grands groupes en premier pour ne pas gaspiller les grandes tables", () => {
    // Servi dans l'ordre d'arrivée, le duo prendrait la table de 6 et le
    // groupe de 6 resterait sans table.
    const tables = [table("t6", 6), table("t2", 2)];
    const reservations = [
      reservation({ id: "duo", party_size: 2, time: "19:00", user_id: "u1" }),
      reservation({ id: "groupe", party_size: 6, time: "20:00", user_id: "u2" }),
    ];

    const placed = planAutomaticPlacement({
      reservations,
      tables,
      assignments: {},
      canPlace: makeCanPlace(tables, reservations),
      getPlacementScore,
    });

    expect(placed.groupe).toBe("t6");
    expect(placed.duo).toBe("t2");
  });

  it("donne sa table attitrée à un habitué avant d'appliquer le score", () => {
    const tables = [table("t2", 2), table("t8", 8)];
    const reservations = [reservation({ id: "r1", party_size: 2, user_id: "habitue" })];

    const placed = planAutomaticPlacement({
      reservations,
      tables,
      assignments: {},
      preferredTableByUserId: new Map([["habitue", "t8"]]),
      canPlace: makeCanPlace(tables, reservations),
      getPlacementScore,
    });

    // Le score seul aurait choisi t2 : la table de 8 gaspille six couverts.
    expect(placed.r1).toBe("t8");
  });

  it("bascule sur une autre table quand la table attitrée est déjà prise", () => {
    const tables = [table("t4", 4), table("t8", 8)];
    const reservations = [
      reservation({ id: "autre", party_size: 4, user_id: "u2" }),
      reservation({ id: "habitue", party_size: 4, user_id: "habitue" }),
    ];

    const placed = planAutomaticPlacement({
      reservations,
      tables,
      assignments: { autre: "t8" },
      preferredTableByUserId: new Map([["habitue", "t8"]]),
      canPlace: makeCanPlace(tables, reservations),
      getPlacementScore,
    });

    expect(placed.habitue).toBe("t4");
  });

  it("ignore les réservations déjà placées et ne les déplace pas", () => {
    const tables = [table("t4", 4), table("t2", 2)];
    const reservations = [
      reservation({ id: "deja", party_size: 2, user_id: "u1" }),
      reservation({ id: "nouvelle", party_size: 2, user_id: "u2" }),
    ];

    const placed = planAutomaticPlacement({
      reservations,
      tables,
      assignments: { deja: "t4" },
      canPlace: makeCanPlace(tables, reservations),
      getPlacementScore,
    });

    expect(placed).not.toHaveProperty("deja");
    expect(placed.nouvelle).toBe("t2");
  });

  it("laisse sans table ce qui ne rentre nulle part, sans bloquer le reste", () => {
    const tables = [table("t2", 2)];
    const reservations = [
      reservation({ id: "trop-grand", party_size: 10, user_id: "u1" }),
      reservation({ id: "duo", party_size: 2, user_id: "u2" }),
    ];

    const placed = planAutomaticPlacement({
      reservations,
      tables,
      assignments: {},
      canPlace: makeCanPlace(tables, reservations),
      getPlacementScore,
    });

    expect(placed).not.toHaveProperty("trop-grand");
    expect(placed.duo).toBe("t2");
  });

  it("ne renvoie rien quand il n'y a aucune table", () => {
    const reservations = [reservation({ id: "r1", party_size: 2 })];

    expect(planAutomaticPlacement({
      reservations,
      tables: [],
      assignments: {},
      canPlace: makeCanPlace([], reservations),
      getPlacementScore,
    })).toEqual({});
  });
});
