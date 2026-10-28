import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import SimpleReservationQueue from "@/components/floor-plan/SimpleReservationQueue";
import type {
  ServiceDraftTable,
  ServiceReservation,
} from "@/components/floor-plan/serviceShared";

const table: ServiceDraftTable = {
  id: "table-4",
  table_number: "T04",
  capacity: 4,
  is_active: true,
  sector: "Salle",
  layout: {
    x: 80,
    y: 90,
    w: 180,
    h: 150,
    rotation: 0,
    shape: "rect",
    kind: "table",
    seatLabels: [],
  },
};

function reservation(
  id: string,
  status = "confirmed",
  savedTable: string | null = null,
): ServiceReservation {
  return {
    id,
    status,
    table_id: savedTable,
    date: "2026-10-28",
    time: "19:30:00",
    party_size: 4,
    customer: { full_name: `Client ${id}`, phone: null },
    metadata: {},
    notes: null,
  } as ServiceReservation;
}

function renderQueue(
  overrides: Partial<Parameters<typeof SimpleReservationQueue>[0]> = {},
) {
  const props: Parameters<typeof SimpleReservationQueue>[0] = {
    reservationQuery: "",
    reservationsLoading: false,
    selectedReservationId: null,
    selectedTable: null,
    draggedReservationId: null,
    unassignedReservations: [],
    assignedReservations: [],
    draftAssignments: {},
    tableMap: new Map([[table.id, table]]),
    onReservationQueryChange: vi.fn(),
    onReservationPress: vi.fn(),
    onReservationDragStart: vi.fn(),
    onReservationDragEnd: vi.fn(),
    onReservationHandlePointerDown: vi.fn(),
    onReleaseReservation: vi.fn(),
    getReservationDropState: () => ({
      ok: false,
      reason: "Capacité insuffisante",
    }),
    ...overrides,
  };
  return { ...render(<SimpleReservationQueue {...props} />), props };
}

describe("SimpleReservationQueue", () => {
  it("groups reservations by their actual service status, independently of assignment", () => {
    renderQueue({
      unassignedReservations: [
        reservation("arrived", "arrived"),
        reservation("done", "completed"),
      ],
      assignedReservations: [
        reservation("upcoming", "confirmed", table.id),
        reservation("seated", "seated", table.id),
      ],
      draftAssignments: { upcoming: table.id, seated: table.id },
    });

    expect(
      screen.getByRole("button", { name: /^Client upcoming,/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Client seated,/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "En salle · 2" }));
    expect(
      screen.getByRole("button", { name: /^Client arrived,/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^Client seated,/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Client done,/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Toutes · 4" }));
    expect(
      screen.getByRole("button", { name: /^Client done,/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Terminée")).toBeInTheDocument();
  });

  it("shows a draft release instead of falling back to its saved table", () => {
    renderQueue({
      unassignedReservations: [reservation("released", "confirmed", table.id)],
      draftAssignments: { released: null },
    });
    expect(
      screen.getByRole("button", {
        name: "Client released, 19:30, 4 personnes, À placer",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText("4 personnes · T04")).not.toBeInTheDocument();
  });

  it("assigns the suggested table without also selecting the reservation row", () => {
    const { props } = renderQueue({
      unassignedReservations: [reservation("suggested")],
      onAssignReservationToTable: vi.fn(),
      recommendedTablesByReservationId: new Map([
        [
          "suggested",
          { table, score: 95, wastedSeats: 0, reasons: ["Capacité adaptée"] },
        ],
      ]),
    });
    const action = screen.getByRole("button", {
      name: "Placer Client suggested à T04",
    });
    fireEvent.keyDown(action, { key: "Enter" });
    expect(props.onReservationPress).not.toHaveBeenCalled();
    fireEvent.click(action);
    expect(props.onAssignReservationToTable).toHaveBeenCalledExactlyOnceWith(
      "suggested",
      table.id,
    );
    expect(props.onReservationPress).not.toHaveBeenCalled();
  });

  it("keeps release and pointer dragging connected to their existing handlers", () => {
    const { props } = renderQueue({
      assignedReservations: [reservation("assigned", "confirmed", table.id)],
      selectedReservationId: "assigned",
      draftAssignments: { assigned: table.id },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Libérer T04 pour Client assigned" }),
    );
    expect(props.onReleaseReservation).toHaveBeenCalledExactlyOnceWith(
      "assigned",
    );
    expect(props.onReservationPress).not.toHaveBeenCalled();
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Déplacer Client assigned" }),
    );
    expect(props.onReservationHandlePointerDown).toHaveBeenCalledWith(
      expect.anything(),
      "assigned",
    );
  });

  it("supports keyboard selection without offering an incompatible selected table", () => {
    const { props } = renderQueue({
      unassignedReservations: [reservation("keyboard")],
      selectedTable: table,
      onAssignReservationToTable: vi.fn(),
    });
    fireEvent.keyDown(
      screen.getByRole("button", { name: /^Client keyboard,/ }),
      { key: " " },
    );
    expect(props.onReservationPress).toHaveBeenCalledExactlyOnceWith(
      "keyboard",
    );
    expect(
      screen.queryByRole("button", { name: "Placer à T04" }),
    ).not.toBeInTheDocument();
  });

  it("shows the actual selected reservation and delegates arrival and details actions", () => {
    const selected = { ...reservation("selected"), notes: "Allergie aux noix" };
    const { props } = renderQueue({
      unassignedReservations: [selected],
      selectedReservationId: selected.id,
      onReservationStatusChange: vi.fn(),
      onOpenReservationDetails: vi.fn(),
    });
    const panel = screen.getByRole("region", {
      name: "Réservation sélectionnée",
    });
    expect(within(panel).getByText("Allergie aux noix")).toBeInTheDocument();
    fireEvent.click(
      within(panel).getByRole("button", { name: "Marquer l’arrivée" }),
    );
    expect(props.onReservationStatusChange).toHaveBeenCalledExactlyOnceWith(
      "selected",
      "arrived",
    );
    fireEvent.click(
      within(panel).getByRole("button", { name: "Détails de la réservation" }),
    );
    expect(props.onOpenReservationDetails).toHaveBeenCalledExactlyOnceWith(
      "selected",
    );
  });

  it("prevents a second status mutation while the request is pending", () => {
    const { props } = renderQueue({
      unassignedReservations: [reservation("pending")],
      selectedReservationId: "pending",
      onReservationStatusChange: vi.fn(),
      reservationStatusPending: true,
    });
    const action = screen.getByRole("button", { name: "Mise à jour…" });
    expect(action).toBeDisabled();
    fireEvent.click(action);
    expect(props.onReservationStatusChange).not.toHaveBeenCalled();
  });

  it("keeps the search controlled and provides an accessible clear action", () => {
    const { props } = renderQueue({ reservationQuery: "Martin" });
    fireEvent.change(
      screen.getByRole("textbox", { name: "Rechercher une réservation" }),
      { target: { value: "Camille" } },
    );
    expect(props.onReservationQueryChange).toHaveBeenCalledWith("Camille");
    fireEvent.click(
      screen.getByRole("button", { name: "Effacer la recherche" }),
    );
    expect(props.onReservationQueryChange).toHaveBeenCalledWith("");
  });
});
