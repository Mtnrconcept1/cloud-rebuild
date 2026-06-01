import type { ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ReservationQueue from "@/components/floor-plan/ReservationQueue";
import type { ServiceDraftTable, ServiceReservation } from "@/components/floor-plan/serviceShared";

function reservation(overrides: Partial<ServiceReservation>): ServiceReservation {
  return {
    id: "reservation",
    user_id: "user",
    restaurant_id: "restaurant",
    table_id: null,
    date: "2026-05-28",
    time: "19:00",
    party_size: 2,
    status: "confirmed",
    notes: null,
    special_requests: null,
    feature: null,
    metadata: {},
    created_at: "2026-05-28T10:00:00Z",
    updated_at: "2026-05-28T10:00:00Z",
    confirmed_at: null,
    customer: { full_name: "Client", phone: null },
    ...overrides,
  } as unknown as ServiceReservation;
}

function table(id: string, label: string, capacity = 4): ServiceDraftTable {
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
      seatLabels: [1, 1, 1, 1],
    },
  };
}

function renderReservationQueue(overrides: Partial<ComponentProps<typeof ReservationQueue>> = {}) {
  return render(
    <ReservationQueue
      reservationQuery=""
      reservationsLoading={false}
      selectedReservationId={null}
      selectedTable={null}
      draggedReservationId={null}
      unassignedReservations={[]}
      assignedReservations={[]}
      draftAssignments={{}}
      tableMap={new Map()}
      onReservationQueryChange={vi.fn()}
      onReservationPress={vi.fn()}
      onReservationDragStart={vi.fn()}
      onReservationDragEnd={vi.fn()}
      onReservationHandlePointerDown={vi.fn()}
      onReleaseReservation={vi.fn()}
      getReservationDropState={() => ({ ok: true, reason: null })}
      {...overrides}
    />,
  );
}

describe("ReservationQueue", () => {
  it("renders a sorted service timeline with assigned and unassigned reservations", () => {
    const onReservationPress = vi.fn();
    renderReservationQueue({
      onReservationPress,
      unassignedReservations: [
        reservation({
          id: "late-unassigned",
          time: "20:15",
          party_size: 2,
          customer: { full_name: "Dupont", phone: null },
        }),
      ],
      assignedReservations: [
        reservation({
          id: "early-assigned",
          time: "18:30",
          party_size: 4,
          customer: { full_name: "Favre", phone: null },
        }),
        reservation({
          id: "middle-assigned",
          time: "19:00",
          party_size: 3,
          customer: { full_name: "Martin", phone: null },
        }),
      ],
      draftAssignments: {
        "early-assigned": "t4",
        "middle-assigned": "t8",
      },
      tableMap: new Map([
        ["t4", table("t4", "T4")],
        ["t8", table("t8", "T8")],
      ]),
    });

    const timeline = screen.getByTestId("reservation-service-timeline");
    const rows = within(timeline).getAllByRole("button");

    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("18:30");
    expect(rows[0].textContent).toContain("Favre");
    expect(rows[0].textContent).toContain("T4");
    expect(rows[1].textContent).toContain("19:00");
    expect(rows[1].textContent).toContain("Martin");
    expect(rows[1].textContent).toContain("T8");
    expect(rows[2].textContent).toContain("20:15");
    expect(rows[2].textContent).toContain("Dupont");
    expect(rows[2].textContent).toContain("Sans table");

    fireEvent.click(rows[1]);

    expect(onReservationPress).toHaveBeenCalledWith("middle-assigned");
  });

  it("assigns an unassigned reservation to its recommended table from the queue", () => {
    const onAssignReservationToTable = vi.fn();
    renderReservationQueue({
      unassignedReservations: [
        reservation({
          id: "r1",
          party_size: 4,
          customer: { full_name: "Martin", phone: null },
        }),
      ],
      recommendedTablesByReservationId: new Map([
        ["r1", {
          table: table("t4", "T4"),
          score: 94,
          reasons: ["Capacité parfaite", "Rotation confortable"],
        }],
      ]),
      onAssignReservationToTable,
    });

    expect(screen.getByText("T4")).toBeInTheDocument();
    expect(screen.getByText("Score 94")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Affecter Martin a T4" }));

    expect(onAssignReservationToTable).toHaveBeenCalledWith("r1", "t4");
  });
});
