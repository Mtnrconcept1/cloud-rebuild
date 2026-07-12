import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  computeFloorPlanV2AutoAssignments,
  floorPlanV2ReservationsOverlap,
  getFloorPlanV2AssignmentError,
  mapFloorPlanV2Table,
  parseFloorPlanV2ObjectDrafts,
  parseFloorPlanV2TableDrafts,
  serializeFloorPlanV2Layout,
  serializeFloorPlanV2Object,
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
  editable: true,
  kind: "table",
  ...overrides,
});

const furniture = (overrides: Partial<FloorPlanV2Table> = {}): FloorPlanV2Table => ({
  id: "tmp_object_1",
  name: "Porte d’entrée",
  capacity: 0,
  zone: "Salle principale",
  shape: "rectangle",
  x: 20,
  y: 30,
  blocked: false,
  editable: false,
  kind: "door",
  width: 84,
  height: 18,
  rotation: -90,
  locked: true,
  zIndex: 3,
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
      editable: true,
      kind: "table",
    });
  });

  it("maps shared reservation_tables furniture without making it reservable", () => {
    const mapped = mapFloorPlanV2Table({
      id: "object-1",
      table_number: "Entrée",
      capacity: 0,
      is_active: true,
      sector: "Salle principale",
      layout: {
        x: 260,
        y: 190,
        w: 84,
        h: 18,
        rotation: -90,
        kind: "divider",
        v2_object_type: "door",
        v2_locked: true,
        v2_z_index: 3,
      },
    }, 0);

    expect(mapped).toMatchObject({
      id: "object-1",
      name: "Entrée",
      capacity: 0,
      x: 25,
      y: 25,
      editable: false,
      blocked: false,
      kind: "door",
      width: 84,
      height: 18,
      rotation: 270,
      locked: true,
      zIndex: 3,
    });
  });

  it("validates furniture geometry and identifiers before persistence", () => {
    const valid = furniture();
    expect(parseFloorPlanV2ObjectDrafts([valid])).toEqual([
      expect.objectContaining({
        id: valid.id,
        capacity: 0,
        editable: false,
        kind: "door",
        width: 84,
        height: 18,
        rotation: 270,
        locked: true,
      }),
    ]);
    expect(() => parseFloorPlanV2ObjectDrafts([valid, valid]))
      .toThrow("Objet de mobilier invalide");
    expect(() => parseFloorPlanV2ObjectDrafts([{ ...valid, kind: "table" }]))
      .toThrow("Type de mobilier invalide");
    expect(() => parseFloorPlanV2ObjectDrafts([{ ...valid, width: 12 }]))
      .toThrow("dimensions");
    expect(() => parseFloorPlanV2ObjectDrafts([
      valid,
      { ...valid, id: "tmp_object_2", name: valid.name.toLocaleUpperCase("fr") },
    ])).toThrow("utilisé deux fois");
    expect(() => parseFloorPlanV2ObjectDrafts([{ ...valid, x: 94, width: 100 }]))
      .toThrow("dépasse les limites");
  });

  it.each([
    ["door", "divider"],
    ["buffet", "service-station"],
    ["host_stand", "host-stand"],
    ["sofa", "banquette"],
    ["bar", "bar"],
    ["plant", "plant"],
  ] as const)("serializes %s into the shared %s reservation_tables kind", (kind, persistedKind) => {
    const layout = serializeFloorPlanV2Object(furniture({ kind }), {
      custom_safe_field: "preserved",
    });

    expect(layout).toMatchObject({
      x: 208,
      y: 228,
      w: 84,
      h: 18,
      rotation: 270,
      shape: "rect",
      kind: persistedKind,
      v2_object_type: kind,
      v2_locked: true,
      v2_z_index: 3,
      custom_safe_field: "preserved",
      seat_labels: [],
      seat_placements: [],
    });
  });

  it("preserves rich V1 layout data while updating seats and the V2 shape", () => {
    const layout = serializeFloorPlanV2Layout(table({
      capacity: 6,
      shape: "square",
      x: 25,
      y: 50,
    }), {
      x: 10,
      y: 20,
      w: 176,
      h: 112,
      rotation: 45,
      shape: "rect",
      kind: "table",
      custom_safe_field: "preserved",
    }, 0);

    expect(layout).toMatchObject({
      x: 260,
      y: 380,
      rotation: 45,
      shape: "rect",
      v2_shape: "square",
      custom_safe_field: "preserved",
    });
    expect((layout.seat_labels as number[]).reduce((sum, value) => sum + value, 0)).toBeGreaterThanOrEqual(6);
  });

  it("rejects malformed or duplicate table drafts before persistence", () => {
    const valid = table({ id: "tmp_table_1", name: "T1" });
    expect(parseFloorPlanV2TableDrafts([valid])).toHaveLength(1);
    expect(() => parseFloorPlanV2TableDrafts([valid, { ...valid, id: "tmp_table_2" }]))
      .toThrow("utilisé deux fois");
    expect(() => parseFloorPlanV2TableDrafts([{ ...valid, capacity: 31 }]))
      .toThrow("entre 1 et 30");
  });

  it("never allows a client assignment to a furniture object", () => {
    const client = reservation("r1", "19:00");
    const object = furniture({ id: "object-1", name: "Bar", kind: "bar" });

    expect(getFloorPlanV2AssignmentError({
      reservationId: client.id,
      tableId: object.id,
      reservations: [client],
      tables: [table(), object],
      assignments: { [client.id]: null },
    })).toContain("indisponible");
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

  it("uses each reservation duration instead of a fixed two-hour window", () => {
    const first = reservation("r1", "19:00", { durationMinutes: 60 });
    const next = reservation("r2", "20:00", { durationMinutes: 90 });
    const overlapping = reservation("r3", "19:30", { durationMinutes: 60 });

    expect(floorPlanV2ReservationsOverlap(first, next)).toBe(false);
    expect(floorPlanV2ReservationsOverlap(first, overlapping)).toBe(true);
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
    expect(page).toContain('"restaurant_save_floor_plan_workspace"');
    expect(page).toContain('"restaurant_save_floor_plan_layouts"');
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
    expect(iframe).toContain('"tok-table-v2:save-template"');
    expect(iframe).toContain('"tok-table-v2:save-service-layout"');
    expect(iframe).not.toMatch(/\bprompt\s*\(/);
    expect(iframe).not.toMatch(/\bconfirm\s*\(/);
    expect(html).toContain('id="mode-template-button"');
    expect(html).toContain('id="save-plan-button"');
    expect(page).toContain("requestFullscreen");
    expect(page).not.toContain('target="_blank"');
  });

  it("persists tables and furniture atomically in the shared reservation_tables model", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalleV2.tsx");
    const iframe = readSource("public/tok-table-v2/app.js");
    const migration = readSource(
      "supabase/migrations/20260712190000_floor_plan_v2_furniture.sql",
    );

    expect(page).toContain('.from("reservation_tables")');
    expect(page).not.toContain('.from("floor_plan_objects")');
    expect(page).toContain('"restaurant_save_floor_plan_workspace"');
    expect(page).toContain("parseFloorPlanV2ObjectDrafts");
    expect(page).toContain("serializeFloorPlanV2Object");
    expect(page).toContain("p_objects: objectUpserts");
    expect(page).toContain("p_object_delete_ids: objectDeleteIds");
    expect(iframe).toMatch(/tok-table-v2:save-template[\s\S]{0,500}objects/);

    expect(migration).toContain("restaurant_save_floor_plan_workspace");
    expect(migration).toContain("restaurant_save_floor_plan_furniture");
    expect(migration).toContain("public.restaurant_save_floor_plan_template");
    expect(migration).toContain("public.reservation_tables");
    expect(migration).toContain("capacity, is_active");
    expect(migration).toContain("p_branch_id, v_name, 0, true, v_zone, v_layout");
    expect(migration).toContain("is_active = true");
    expect(migration).toContain("p_object_delete_ids uuid[]");
    expect(migration).toContain("Tables and furniture must be explicit JSON arrays");
    expect(migration).toContain("Duplicate floor plan client identifier");
    expect(migration).toContain("Furniture names must be unique");
    expect(migration).toContain("ux_reservation_tables_branch_item_name_ci");
    expect(migration).toContain("COALESCE(rt.layout->>'kind', 'table') <> 'table'");
    expect(migration).not.toContain("NOT (rt.id = ANY(v_ids))");
    expect(migration).not.toContain("CREATE TABLE public.floor_plan_objects");
  });

  it("ships atomic template, daily layout and overlap validation RPCs", () => {
    const migration = readSource(
      "supabase/migrations/20260712090000_floor_plan_v2_editor_rpc.sql",
    );

    expect(migration).toContain("restaurant_save_floor_plan_template");
    expect(migration).toContain("restaurant_save_floor_plan_layouts");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("Table already occupied around");
    expect(migration).toContain("Retirez d''abord les clients");
    expect(migration).toContain("COALESCE(rt.layout->>'kind', 'table') = 'table'");
  });
});
