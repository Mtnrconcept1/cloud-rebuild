export type FloorPlanPersistedSlot = {
  reservation_id: string;
  table_id: string | null;
};

function normalizeTableId(value: string | null | undefined) {
  const tableId = typeof value === "string" ? value.trim() : "";
  return tableId || null;
}

export function buildFloorPlanAssignmentEntries(
  draftAssignments: Record<string, string | null | undefined>,
  persistedSlots: FloorPlanPersistedSlot[],
) {
  const persistedByReservationId = new Map(
    persistedSlots.map((slot) => [slot.reservation_id, normalizeTableId(slot.table_id)]),
  );
  const reservationIds = new Set([
    ...Object.keys(draftAssignments),
    ...persistedByReservationId.keys(),
  ]);

  return Array.from(reservationIds)
    .sort((left, right) => left.localeCompare(right, "fr"))
    .map((reservationId) => ({
      reservationId,
      tableId: normalizeTableId(draftAssignments[reservationId]),
      persistedTableId: persistedByReservationId.get(reservationId) ?? null,
    }));
}

export function buildFloorPlanAssignmentSignature(
  draftAssignments: Record<string, string | null | undefined>,
  persistedSlots: FloorPlanPersistedSlot[],
) {
  return JSON.stringify(
    buildFloorPlanAssignmentEntries(draftAssignments, persistedSlots).map((entry) => ({
      reservationId: entry.reservationId,
      tableId: entry.tableId,
    })),
  );
}

export function hasFloorPlanAssignmentChanges(
  draftAssignments: Record<string, string | null | undefined>,
  persistedSlots: FloorPlanPersistedSlot[],
) {
  return buildFloorPlanAssignmentEntries(draftAssignments, persistedSlots).some((entry) => (
    entry.tableId !== entry.persistedTableId
  ));
}
