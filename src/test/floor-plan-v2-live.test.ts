import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  computeFloorPlanV2AutoAssignments,
  floorPlanV2ReservationsOverlap,
  getFloorPlanV2AssignmentError,
  getFloorPlanV2ReservationRecommendation,
  mapFloorPlanV2Table,
  parseFloorPlanV2ObjectDrafts,
  parseFloorPlanV2TableDrafts,
  serializeFloorPlanV2Layout,
  serializeFloorPlanV2Object,
  scoreFloorPlanV2ReservationPlacement,
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

  it("uses the V1 placement priorities for recommendations", () => {
    const client = reservation("r1", "19:00", {
      size: 2,
      feature: "zero-attente",
      miamzPriority: 40,
    });
    const exact = table({ id: "table-2", name: "T2", capacity: 2 });
    const oversized = table({ id: "table-8", name: "T8", capacity: 8 });

    const exactScore = scoreFloorPlanV2ReservationPlacement({ reservation: client, table: exact });
    const oversizedScore = scoreFloorPlanV2ReservationPlacement({ reservation: client, table: oversized });
    expect(exactScore.score).toBeGreaterThan(oversizedScore.score);
    expect(exactScore.reasons).toContain("Zéro Attente priorisé");
    expect(exactScore.reasons).toContain("Priorité Miamz");

    expect(getFloorPlanV2ReservationRecommendation({
      reservation: client,
      allReservations: [client],
      tables: [oversized, exact],
      assignments: { r1: null },
    })).toMatchObject({ tableId: "table-2", tableName: "T2" });
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
    expect(page).toContain('"restaurant_save_floor_plan_workspace_v2"');
    expect(page).toContain('"restaurant_save_floor_plan_layouts_v2"');
    expect(page).toContain('"restaurant_save_floor_plan_variant_v2"');
    expect(page).toContain("updateRestaurantReservationStatus");
    expect(page).toContain('"tok-table-v2:update-reservation-status"');
    expect(page).toContain('from("floor_plan_variants" as any)');
    expect(page).toContain('"tok-table-v2:save-variant"');
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
    expect(iframe).toContain("startReservationPointerDrag");
    expect(iframe).toContain("finishReservationPointerDrag");
    expect(iframe).toContain("scheduleServiceAutosave");
    expect(iframe).toContain("renderServiceTableModal");
    expect(html).toContain('id="service-table-modal"');
    expect(html).toContain('id="variant-select"');
    expect(html).toContain('id="save-variant-button"');
    expect(iframe).toContain("loadVariant");
    expect(iframe).toContain("saveVariantFromForm");
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
      "supabase/migrations/20260712210714_floor_plan_v2_furniture.sql",
    );

    expect(page).toContain('.from("reservation_tables")');
    expect(page).not.toContain('.from("floor_plan_objects")');
    expect(page).toContain('"restaurant_save_floor_plan_workspace_v2"');
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

  it("rejects stale saves and safely replays duplicate persistence requests", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalleV2.tsx");
    const iframe = readSource("public/tok-table-v2/app.js");
    const migration = readSource(
      "supabase/migrations/20260715031622_floor_plan_v2_reliability.sql",
    );
    const types = readSource("src/integrations/supabase/types.ts");

    expect(page).toContain("BRIDGE_PROTOCOL_VERSION = 2");
    expect(page).toContain("withPersistenceTimeout");
    expect(page).toContain(".abortSignal(signal)");
    expect(page).toContain("p_expected_snapshot: JSON.parse(baseRevision)");
    expect(page).toContain("p_request_id: getOperationId(requestId)");
    expect(page).toContain("baselineTableIds");
    expect(page).toContain("baselineObjectIds");
    expect(page).toContain("!Array.isArray(rawObjects)");
    expect(page).toContain("workspaceMounted ? (");
    expect(page).toContain('.in("reservation_id", reservationIdChunk)');

    expect(iframe).toContain("SERVICE_AUTOSAVE_MAX_FAILURES = 3");
    expect(iframe).toContain("OPERATION_TIMEOUT_MS = 60_000");
    expect(iframe).toContain("payload.requestId !== pendingOperation.requestId");
    expect(iframe).toContain("payload.kind !== pendingOperation.kind");
    expect(iframe).toContain("baselineTableIds");
    expect(iframe).toContain("baselineObjectIds");

    expect(migration).toContain("private.floor_plan_save_operations");
    expect(migration).toContain("request_payload jsonb NOT NULL");
    expect(migration).toContain("v_existing_payload IS DISTINCT FROM v_request_payload");
    expect(migration).toContain("FLOOR_PLAN_REVISION_CONFLICT");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("ORDER BY rt.id");
    expect(migration).toContain("created_at < now() - interval '30 days'");
    expect(migration).toContain("restaurant_save_floor_plan_variant_v2");
    expect(migration).toContain("v_operation_kind constant text := 'variant'");
    expect(migration).toContain("'variant', to_jsonb(v_variant)");
    expect(migration).toContain("lower(btrim(variant.name)) = lower(v_name)");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain("TO authenticated");
    expect(migration).toContain("FROM PUBLIC, anon");
    expect(types).toContain("restaurant_save_floor_plan_workspace_v2");
    expect(types).toContain("restaurant_save_floor_plan_layouts_v2");
    expect(types).toContain("restaurant_save_floor_plan_variant_v2");
  });

  it("keeps an already hydrated workspace mounted through transient refetch failures", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalleV2.tsx");

    expect(page).toContain("isRefetchError: tablesRefetchError");
    expect(page).toContain("const hasBlockingError = Boolean(");
    expect(page).toContain("const hasRefetchError = Boolean(");
    expect(page).toContain("const workspaceMounted = Boolean(");
    expect(page).toContain("const workspaceReady = workspaceMounted && !hasRefetchError");
    expect(page).toContain("if (!selectedBranchId || !workspaceReady) return;");
    expect(page).toContain("{workspaceMounted ? (");
    expect(page).toContain("La dernière version chargée reste affichée.");
    expect(page).toContain("La synchronisation est temporairement indisponible. Le brouillon est conservé.");
  });

  it("narrows nullable table snapshot fields before building the typed revision", () => {
    const page = readSource("src/pages/dashboard/DashboardPlanSalleV2.tsx");

    expect(page).toContain("function getNullableBoolean(value: unknown, message: string): boolean | null");
    expect(page).toContain("function getNullableString(value: unknown, message: string): string | null");
    expect(page).toContain("const isActive = getNullableBoolean(row.is_active, invalidSnapshotMessage);");
    expect(page).toContain("const sector = getNullableString(row.sector, invalidSnapshotMessage);");
    expect(page).toContain("is_active: isActive,");
  });
});
