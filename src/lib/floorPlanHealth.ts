import { isReservableFloorPlanItem, reservationsOverlap, type FloorPlanItemKind } from "@/lib/floorPlan";

export type FloorPlanHealthTable = {
  id: string;
  tableNumber: string;
  capacity: number;
  isActive: boolean;
  kind: FloorPlanItemKind;
};

export type FloorPlanHealthReservation = {
  id: string;
  partySize: number;
  assignedTableId: string | null | undefined;
  date?: string | null;
  time?: string | null;
};

export type FloorPlanHealthSummary = {
  status: "ready" | "warning" | "critical";
  unassignedReservations: number;
  invalidAssignments: number;
  overCapacityAssignments: number;
  overlappingAssignments: number;
  activeReservableTables: number;
  totalReservableCapacity: number;
  assignedCovers: number;
  headline: string;
  detail: string;
};

function formatProblemCount(count: number, singular: string, plural: string = `${singular}s`) {
  if (count <= 0) return null;
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatCriticalHealthDetail(input: {
  invalidAssignments: number;
  overCapacityAssignments: number;
  overlappingAssignments: number;
}) {
  return [
    formatProblemCount(input.invalidAssignments, "affectation invalide"),
    formatProblemCount(input.overCapacityAssignments, "table en sur-capacite", "tables en sur-capacite"),
    formatProblemCount(input.overlappingAssignments, "collision horaire sur une table", "collisions horaires sur une table"),
  ].filter(Boolean).join(", ");
}

export function getFloorPlanHealthSummary(input: {
  tables: readonly FloorPlanHealthTable[];
  reservations: readonly FloorPlanHealthReservation[];
}): FloorPlanHealthSummary {
  const tableById = new Map(input.tables.map((table) => [table.id, table]));
  const activeReservableTables = input.tables.filter((table) => (
    table.isActive && isReservableFloorPlanItem(table.kind)
  ));
  const totalReservableCapacity = activeReservableTables.reduce((sum, table) => (
    sum + Math.max(0, Math.round(table.capacity || 0))
  ), 0);
  let unassignedReservations = 0;
  let invalidAssignments = 0;
  let overCapacityAssignments = 0;
  let overlappingAssignments = 0;
  let assignedCovers = 0;
  const reservationsByAssignedTable = new Map<string, FloorPlanHealthReservation[]>();

  for (const reservation of input.reservations) {
    const partySize = Math.max(0, Math.round(reservation.partySize || 0));
    const assignedTableId = reservation.assignedTableId || null;

    if (!assignedTableId) {
      unassignedReservations += 1;
      continue;
    }

    const table = tableById.get(assignedTableId);
    if (!table || !table.isActive || !isReservableFloorPlanItem(table.kind)) {
      invalidAssignments += 1;
      continue;
    }

    assignedCovers += partySize;
    if (partySize > Math.max(0, Math.round(table.capacity || 0))) {
      overCapacityAssignments += 1;
    }

    const tableReservations = reservationsByAssignedTable.get(assignedTableId) || [];
    tableReservations.push(reservation);
    reservationsByAssignedTable.set(assignedTableId, tableReservations);
  }

  for (const tableReservations of reservationsByAssignedTable.values()) {
    for (let leftIndex = 0; leftIndex < tableReservations.length; leftIndex += 1) {
      const left = tableReservations[leftIndex];
      if (!left.date) continue;

      for (let rightIndex = leftIndex + 1; rightIndex < tableReservations.length; rightIndex += 1) {
        const right = tableReservations[rightIndex];
        if (!right.date) continue;

        if (reservationsOverlap(
          {
            id: left.id,
            date: left.date,
            time: left.time || null,
            partySize: Math.max(0, Math.round(left.partySize || 0)),
          },
          {
            id: right.id,
            date: right.date,
            time: right.time || null,
            partySize: Math.max(0, Math.round(right.partySize || 0)),
          },
        )) {
          overlappingAssignments += 1;
        }
      }
    }
  }

  if (activeReservableTables.length === 0 && input.reservations.length > 0) {
    return {
      status: "critical",
      unassignedReservations,
      invalidAssignments,
      overCapacityAssignments,
      overlappingAssignments,
      activeReservableTables: 0,
      totalReservableCapacity: 0,
      assignedCovers,
      headline: "Aucune table active",
      detail: "Activez ou creez des tables avant de placer les reservations.",
    };
  }

  if (invalidAssignments > 0 || overCapacityAssignments > 0 || overlappingAssignments > 0) {
    return {
      status: "critical",
      unassignedReservations,
      invalidAssignments,
      overCapacityAssignments,
      overlappingAssignments,
      activeReservableTables: activeReservableTables.length,
      totalReservableCapacity,
      assignedCovers,
      headline: "Conflits a corriger",
      detail: `${formatCriticalHealthDetail({
        invalidAssignments,
        overCapacityAssignments,
        overlappingAssignments,
      })}.`,
    };
  }

  if (unassignedReservations > 0) {
    return {
      status: "warning",
      unassignedReservations,
      invalidAssignments,
      overCapacityAssignments,
      overlappingAssignments,
      activeReservableTables: activeReservableTables.length,
      totalReservableCapacity,
      assignedCovers,
      headline: "Placement incomplet",
      detail: `${unassignedReservations} reservation(s) restent sans table.`,
    };
  }

  return {
    status: "ready",
    unassignedReservations,
    invalidAssignments,
    overCapacityAssignments,
    overlappingAssignments,
    activeReservableTables: activeReservableTables.length,
    totalReservableCapacity,
    assignedCovers,
    headline: "Service pret",
    detail: "Toutes les reservations visibles sont placees correctement.",
  };
}
