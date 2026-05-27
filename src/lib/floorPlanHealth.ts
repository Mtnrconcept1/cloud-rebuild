import { isReservableFloorPlanItem, type FloorPlanItemKind } from "@/lib/floorPlan";

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
};

export type FloorPlanHealthSummary = {
  status: "ready" | "warning" | "critical";
  unassignedReservations: number;
  invalidAssignments: number;
  overCapacityAssignments: number;
  activeReservableTables: number;
  totalReservableCapacity: number;
  assignedCovers: number;
  headline: string;
  detail: string;
};

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
  let assignedCovers = 0;

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
  }

  if (activeReservableTables.length === 0 && input.reservations.length > 0) {
    return {
      status: "critical",
      unassignedReservations,
      invalidAssignments,
      overCapacityAssignments,
      activeReservableTables: 0,
      totalReservableCapacity: 0,
      assignedCovers,
      headline: "Aucune table active",
      detail: "Activez ou creez des tables avant de placer les reservations.",
    };
  }

  if (invalidAssignments > 0 || overCapacityAssignments > 0) {
    return {
      status: "critical",
      unassignedReservations,
      invalidAssignments,
      overCapacityAssignments,
      activeReservableTables: activeReservableTables.length,
      totalReservableCapacity,
      assignedCovers,
      headline: "Conflits a corriger",
      detail: `${invalidAssignments + overCapacityAssignments} affectation(s) posent probleme.`,
    };
  }

  if (unassignedReservations > 0) {
    return {
      status: "warning",
      unassignedReservations,
      invalidAssignments,
      overCapacityAssignments,
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
    activeReservableTables: activeReservableTables.length,
    totalReservableCapacity,
    assignedCovers,
    headline: "Service pret",
    detail: "Toutes les reservations visibles sont placees correctement.",
  };
}
