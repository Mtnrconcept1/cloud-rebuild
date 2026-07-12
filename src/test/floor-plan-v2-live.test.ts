import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  computeFloorPlanV2AutoAssignments,
  getFloorPlanV2AssignmentError,
  mapFloorPlanV2Table,
  type FloorPlanV2Reservation,
  type FloorPlanV2Table,
} from "@/lib/floorPlanV2";

const table = (overrides: Partial<FloorPlanV2Table> = {}): FloorPlanV2Table => ({
  id: "table-1",
  name: "T1",
  capacity: 4,
  zone: "Salle principale",
  shape: "square",
  x: 10,
  y: 10,
  blocked: false,
  ...overrides,
});

const reservation = (
  id: string,
  time: string,
  overrides: Partial<FloorPlanV2Reservation> = {},
): FloorPlanV2Reservation => ({
  id,
  name: `Client ${id}`,
  size: 2,
  time,
  date: "2026-07-12",
  period: "soir",
  preferredZone: "",
  note: "",
  durationMinutes: 120,
  tableId: null,
  status: "confirmed",
  ...overrides,
});

describe("floor plan v2 live assignments", () => {
  it("maps persisted floor plan tables into the lightweight canvas", () => {
    const mapped = mapFloorPlanV2Table({
      id: "table-1",
      table_number: "T1",
      capacity: 6,
      is_active: true,
      sector: "Terrasse",
      layout: { x: 520, y: 380, shape: "circle", kind: "table" },
    }, 0);

    expect(mapped).toMatchObject({
      id: "table-1",
      capacity: 6,
      zone: "Terrasse",
      shape: "round",
      x: 50,
      y: 50,
      blocked: false,
    });
  });

  it("rejects capacity errors and overlapping reservations", () => {
    const reservations = [
      reservation("r1", "19:00", { size: 5 }),
      reservation("r2", "20:00", { tableId: "table-1" }),
    ];

    expect(getFloorPlanV2AssignmentError({
      reservationId: "r1",
      tableId: "table-1",
      reservations,
      tables: [table()],
      assignments: { r1: null, r2: "table-1" },
    })).toContain("ne peut pas accueillir");

    expect(getFloorPlanV2AssignmentError({
      reservationId: "r1",
      tableId: "table-1",
      reservations: reservations.map((item) => ({ ...item, size: 2 })),
      tables: [table()],
      assignments: { r1: null, r2: "table-1" },
    })).toContain("déjà prise");
  });

  it("allows table rotations when reservations do not overlap", () => {
    const reservations = [
      reservation("r1", "19:00"),
      reservation("r2", "21:00", { tableId: "table-1" }),
    ];

    expect(getFloorPlanV2AssignmentError({
      reservationId: "r1",
      tableId: "table-1",
      reservations,
      tables: [table()],
      assignments: { r1: null, r2: "table-1" },
    })).toBeNull();
  });

  it("auto-places only unassigned clients and preserves existing placements", () => {
    const reservations = [
      reservation("r1", "19:00", { tableId: "table-1" }),
      reservation("r2", "21:00"),
    ];
    const result = computeFloorPlanV2AutoAssignments({
      visibleReservations: reservations,
      allReservations: reservations,
      tables: [table()],
      assignments: { r1: "table-1", r2: null },
    });

    expect(result.assignments).toEqual({ r1: "table-1", r2: "table-1" });
    expect(result.changedAssignments).toEqual({ r2: "table-1" });
  });
});

describe("floor plan v2 secure bridge and zoom", () => {
  const readSource = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("keeps Supabase access in the authenticated parent", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalleV2.tsx");
    const iframe = readSource("public/tok-table-v2/app.js");

    expect(page).toContain('from("reservations")');
    expect(page).toContain('from("reservation_tables")');
    expect(page).toContain('from("reservation_slots")');
    expect(page).toContain('"restaurant_save_floor_plan_assignments"');
    expect(page).toContain("event.origin !== window.location.origin");
    expect(page).toContain("event.source !== iframeRef.current?.contentWindow");
    expect(iframe).not.toContain("getSupabase");
    expect(iframe).not.toContain("service_role");
  });

  it("does not persist real client snapshots and provides complete zoom controls", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalleV2.tsx");
    const iframe = readSource("public/tok-table-v2/app.js");
    const html = readSource("public/tok-table-v2/index.html");

    expect(iframe).toContain("if (state.connected) return;");
    expect(iframe).toContain('postToDashboard("tok-table-v2:ready")');
    expect(html).toContain('id="zoom-out-button"');
    expect(html).toContain('id="zoom-in-button"');
    expect(html).toContain('id="zoom-fit-button"');
    expect(iframe).toContain("updateCanvasZoom");
    expect(iframe).toContain("pointerDistance");
    expect(page).toContain("requestFullscreen");
    expect(page).not.toContain('target="_blank"');
  });
});

