import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import TableContextDrawer from "@/components/floor-plan/TableContextDrawer";
import type { ServiceDraftTable, ServiceReservation } from "@/components/floor-plan/serviceShared";

function reservation(overrides: Partial<ServiceReservation> = {}): ServiceReservation {
  return {
    id: "r1",
    user_id: "u1",
    restaurant_id: "restaurant",
    table_id: null,
    date: "2026-05-29",
    time: "20:00",
    party_size: 4,
    status: "confirmed",
    notes: null,
    special_requests: null,
    feature: null,
    metadata: {},
    created_at: "2026-05-29T10:00:00Z",
    updated_at: "2026-05-29T10:00:00Z",
    confirmed_at: null,
    customer: { full_name: "Martin", phone: null },
    ...overrides,
  } as ServiceReservation;
}

function table(overrides: Partial<ServiceDraftTable> = {}): ServiceDraftTable {
  return {
    id: "t4",
    table_number: "T4",
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

describe("TableContextDrawer", () => {
  it("surfaces the best compatible table as a direct recommendation", () => {
    const onAssignReservationToTable = vi.fn();
    const bestTable = table({ id: "t4", table_number: "T4", capacity: 4 });
    const fallbackTable = table({ id: "t8", table_number: "T8", capacity: 8 });

    render(
      <TableContextDrawer
        open
        selectedReservation={reservation()}
        selectedTable={null}
        selectedTableIsReservable={false}
        selectedReservationAssignedTable={null}
        selectedReservationAssignedTableId={null}
        selectedTableAssignments={[]}
        selectedReservationPaymentDetails={null}
        selectedReservationPreorderItems={[]}
        selectedReservationSpecialRequest={null}
        selectedPairDropState={null}
        compatibleTables={[
          { table: bestTable, placement: { score: 96, wastedSeats: 0, reasons: ["Capacite parfaite", "Rotation confortable"] } },
          { table: fallbackTable, placement: { score: 68, wastedSeats: 4, reasons: ["4 place(s) libres"] } },
        ]}
        compatibleReservations={[]}
        onOpenChange={vi.fn()}
        onClearSelection={vi.fn()}
        onAssignReservationToTable={onAssignReservationToTable}
        onReleaseReservation={vi.fn()}
        onSelectReservation={vi.fn()}
        onSelectTable={vi.fn()}
      />,
    );

    expect(screen.getByText("Table recommandee")).toBeInTheDocument();
    expect(screen.getByText("T4")).toBeInTheDocument();
    expect(screen.getByText("Score 96/100")).toBeInTheDocument();
    expect(screen.getByText("Capacite parfaite")).toBeInTheDocument();
    expect(screen.getByText("Rotation confortable")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Affecter table recommandee T4" }));

    expect(onAssignReservationToTable).toHaveBeenCalledWith("r1", "t4");
  });
});
