import {
  ensureFloorPlanLayoutFitsCapacity,
  isReservableFloorPlanItem,
  normalizeFloorPlanLayout,
  type FloorPlanTableLayout,
} from "@/lib/floorPlan";
import { buildFloorPlanAssignmentEntries, type FloorPlanPersistedSlot } from "@/lib/floorPlanPersistence";

type RawTable = {
  id: string;
  table_number: string;
  capacity: number;
  is_active: boolean | null;
  sector: string | null;
  layout: unknown;
};

type RawOverride = { reservation_table_id: string; layout: unknown };
type DraftTable = Omit<RawTable, "layout"> & { persisted: boolean; layout: FloorPlanTableLayout };
type JsonObject = Record<string, unknown>;

export type FloorPlanWorkspaceMode = "template" | "service";
export type FloorPlanWorkspaceSnapshot = {
  tables: RawTable[];
  overrides: RawOverride[];
  slots: FloorPlanPersistedSlot[];
};

export type FloorPlanWorkspaceSaveResult = {
  id_map: Record<string, string>;
  assignments: Record<string, string | null>;
  snapshot: FloorPlanWorkspaceSnapshot;
  request_id: string;
  replayed: boolean;
};

// JSONB equality ignores object key order. Preserve nulls and every raw layout
// property in the optimistic snapshot: normalized editor geometry is not a DB revision.
function canonicalClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(canonicalClone) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => [key, canonicalClone(item)])) as T;
  }
  return value;
}

function objectRecord(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

export function serializeFloorPlanWorkspaceLayout(layout: FloorPlanTableLayout, rawLayout?: unknown) {
  return canonicalClone({
    ...objectRecord(rawLayout),
    x: Math.round(layout.x), y: Math.round(layout.y),
    w: Math.round(layout.w), h: Math.round(layout.h),
    rotation: layout.rotation, shape: layout.shape, kind: layout.kind,
    seat_labels: layout.seatLabels,
    seat_type: layout.seatType || "chair",
    seat_placements: layout.seatPlacements || [],
    corner_bench_corners: layout.cornerBenchCorners || [],
    corner_bench_configs: layout.cornerBenchConfigs || [],
    table_width: layout.tableWidth ? Math.round(layout.tableWidth) : undefined,
    table_height: layout.tableHeight ? Math.round(layout.tableHeight) : undefined,
    corner_bench_horizontal: layout.cornerBenchHorizontal ? Math.round(layout.cornerBenchHorizontal) : undefined,
    corner_bench_vertical: layout.cornerBenchVertical ? Math.round(layout.cornerBenchVertical) : undefined,
    corner_bench_depth: layout.cornerBenchDepth ? Math.round(layout.cornerBenchDepth) : undefined,
  });
}

export function buildFloorPlanWorkspaceSnapshot(
  rawTables: readonly RawTable[],
  rawOverrides: readonly RawOverride[],
  persistedSlots: readonly FloorPlanPersistedSlot[],
  changedReservationIds: readonly string[],
): FloorPlanWorkspaceSnapshot {
  const changedIds = new Set(changedReservationIds);
  return canonicalClone({
    tables: rawTables.map(({ id, table_number, capacity, is_active, sector, layout }) => ({
      id, table_number, capacity, is_active, sector, layout,
    })).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    overrides: rawOverrides.map(({ reservation_table_id, layout }) => ({ reservation_table_id, layout }))
      .sort((left, right) => left.reservation_table_id < right.reservation_table_id ? -1 : left.reservation_table_id > right.reservation_table_id ? 1 : 0),
    slots: persistedSlots.filter((slot) => changedIds.has(slot.reservation_id))
      .map(({ reservation_id, table_id }) => ({ reservation_id, table_id }))
      .sort((left, right) => {
        const a = `${left.reservation_id}:${left.table_id || ""}`;
        const b = `${right.reservation_id}:${right.table_id || ""}`;
        return a < b ? -1 : a > b ? 1 : 0;
      }),
  });
}

export function buildFloorPlanWorkspaceRequest({
  branchId, mode, serviceDate, requestId, rawTables, rawOverrides,
  persistedSlots, draftTables, draftAssignments,
}: {
  branchId: string;
  mode: FloorPlanWorkspaceMode;
  serviceDate: string;
  requestId: string;
  rawTables: readonly RawTable[];
  rawOverrides: readonly RawOverride[];
  persistedSlots: readonly FloorPlanPersistedSlot[];
  draftTables: readonly DraftTable[];
  draftAssignments: Record<string, string | null | undefined>;
}) {
  if (mode === "service" && draftTables.some((table) => !table.persisted)) {
    throw new Error("Enregistrez la salle avant de placer des clients sur une nouvelle table.");
  }
  const assignments = Object.fromEntries(buildFloorPlanAssignmentEntries(draftAssignments, [...persistedSlots])
    .filter((entry) => entry.tableId !== entry.persistedTableId)
    .map((entry) => [entry.reservationId, entry.tableId]));
  const rawById = new Map(rawTables.map((table) => [table.id, table]));
  const overridesById = new Map(rawOverrides.map((override) => [override.reservation_table_id, override.layout]));
  const remainingIds = new Set(draftTables.filter((table) => table.persisted).map((table) => table.id));

  const upserts = mode === "template" ? draftTables.map((table) => ({
    client_id: table.id,
    id: table.persisted ? table.id : null,
    table_number: table.table_number.trim(),
    capacity: isReservableFloorPlanItem(table.layout.kind) ? Math.max(1, Math.round(table.capacity || 1)) : 0,
    is_active: table.is_active ?? true,
    sector: table.sector?.trim() || "Salle principale",
    layout: serializeFloorPlanWorkspaceLayout(table.layout, rawById.get(table.id)?.layout),
  })) : [];

  const layouts: { table_id: string; layout: JsonObject | null }[] = [];
  if (mode === "service") {
    for (const [index, rawTable] of rawTables.entries()) {
      const draft = draftTables.find((table) => table.id === rawTable.id);
      if (!draft) continue;
      const capacity = Number.isFinite(Number(rawTable.capacity)) ? Number(rawTable.capacity) : 2;
      const normalized = normalizeFloorPlanLayout(rawTable.layout, index, capacity);
      const template = ensureFloorPlanLayoutFitsCapacity(normalized, capacity, normalized.shape, normalized.kind);
      const templateRecord = serializeFloorPlanWorkspaceLayout(template, rawTable.layout);
      // A service can carry properties beyond geometry. Compare the complete
      // intended override, so resetting its geometry or saving placements alone
      // never silently deletes information specific to this service.
      const nextLayout = serializeFloorPlanWorkspaceLayout(draft.layout, {
        ...objectRecord(rawTable.layout), ...objectRecord(overridesById.get(rawTable.id)),
      });
      if (JSON.stringify(nextLayout) === JSON.stringify(templateRecord)) {
        if (overridesById.has(rawTable.id)) layouts.push({ table_id: rawTable.id, layout: null });
      } else {
        if (JSON.stringify(nextLayout) !== JSON.stringify(canonicalClone(overridesById.get(rawTable.id)))) {
          layouts.push({ table_id: rawTable.id, layout: nextLayout });
        }
      }
    }
  }

  return {
    p_branch_id: branchId,
    p_mode: mode,
    p_service_date: serviceDate,
    p_expected_snapshot: buildFloorPlanWorkspaceSnapshot(rawTables, mode === "service" ? rawOverrides : [], persistedSlots, Object.keys(assignments)),
    p_request_id: requestId,
    p_upserts: upserts,
    p_delete_ids: mode === "template" ? rawTables.filter((table) => !remainingIds.has(table.id)).map((table) => table.id).sort() : [],
    p_layouts: layouts,
    p_assignments: assignments,
    p_reason: mode === "template" ? "Sauvegarde salle et placements" : "Sauvegarde service et placements",
  };
}

export function getFloorPlanWorkspaceSaveError(error: unknown) {
  const record = objectRecord(error);
  const message = typeof record.message === "string" ? record.message : String(error || "");
  if (message.includes("FLOOR_PLAN_REVISION_CONFLICT")) {
    return "Le plan ou un placement a été modifié par un collègue. Vos changements sont conservés. Abandonnez le brouillon pour reprendre la version enregistrée, puis refaites vos ajustements.";
  }
  if (record.code === "PGRST202" || (message.includes("restaurant_save_floor_plan_workspace_v3") && /not find|does not exist|schema cache/i.test(message))) {
    return "La sauvegarde sécurisée du plan de table doit être activée sur le serveur. Vos changements sont conservés ; contactez l’assistance TOK.";
  }
  if (message.includes("FLOOR_PLAN_TABLE_IN_USE")) {
    return "Des réservations sont liées à cette table. Déplacez les clients encore actifs avant de modifier sa capacité ou de la masquer. Une table liée à l’historique doit être conservée ; vous pouvez la masquer pour la retirer du service.";
  }
  if (message.includes("FLOOR_PLAN_RESERVATION_INACTIVE")) {
    return "Cette réservation est terminée ou annulée. Actualisez le service avant de la placer.";
  }
  if (message.includes("FLOOR_PLAN_TABLE_OCCUPIED") || message.includes("Table already occupied")) {
    return "Cette table accueille déjà une réservation pendant ce créneau. Choisissez une table disponible.";
  }
  return message || "La sauvegarde n’a pas abouti. Vos changements sont conservés ; réessayez.";
}
