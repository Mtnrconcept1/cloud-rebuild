import type { ComponentProps } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ReservationServiceActions from "@/components/floor-plan/ReservationServiceActions";
import SimpleReservationQueue from "@/components/floor-plan/SimpleReservationQueue";
import TableContextDrawer from "@/components/floor-plan/TableContextDrawer";
import {
  getPrimaryServiceReservation,
  getRecommendedTableByReservation,
  getServiceReservationActions,
  getServiceReservationDurationMinutes,
  getServiceReservationStatusLabel,
  getTableServiceState,
  isActiveServiceReservation,
  planAutomaticPlacement,
  scoreReservationPlacement,
  type ServiceDraftTable,
  type ServiceReservation,
} from "@/components/floor-plan/serviceShared";

function reservation(overrides: Partial<ServiceReservation> = {}): ServiceReservation {
  return {
    id: "r1", user_id: "u1", restaurant_id: "restaurant", table_id: null,
    date: "2026-05-27", time: "20:00", party_size: 2, status: "confirmed",
    notes: null, feature: null, metadata: {},
    created_at: "2026-05-27T10:00:00Z", updated_at: "2026-05-27T10:00:00Z", confirmed_at: null,
    customer: { full_name: "Alice Martin", phone: "+41 79 123 45 67" },
    ...overrides,
  } as ServiceReservation;
}

function table(overrides: Partial<ServiceDraftTable> = {}): ServiceDraftTable {
  return {
    id: "t1", table_number: "T1", capacity: 4, is_active: true, sector: "Salle",
    layout: { x: 0, y: 0, w: 220, h: 180, rotation: 0, shape: "rect", kind: "table", seatLabels: [1, 1, 1, 1] },
    ...overrides,
  };
}

function queueProps(overrides: Partial<ComponentProps<typeof SimpleReservationQueue>> = {}): ComponentProps<typeof SimpleReservationQueue> {
  const target = table();
  return {
    reservationQuery: "", reservationsLoading: false, selectedReservationId: null, selectedTable: null,
    draggedReservationId: null, unassignedReservations: [reservation()], assignedReservations: [],
    draftAssignments: {}, tableMap: new Map([[target.id, target]]),
    recommendedTablesByReservationId: new Map([["r1", { table: target, score: 90, wastedSeats: 2, reasons: ["Rotation simple"] }]]),
    onReservationQueryChange: vi.fn(), onReservationPress: vi.fn(), onReservationDragStart: vi.fn(),
    onReservationDragEnd: vi.fn(), onReservationHandlePointerDown: vi.fn(), onReleaseReservation: vi.fn(),
    onAssignReservationToTable: vi.fn(), onReservationStatusChange: vi.fn(),
    getReservationDropState: () => ({ ok: true, reason: null }),
    ...overrides,
  };
}

function drawerProps(overrides: Partial<ComponentProps<typeof TableContextDrawer>> = {}): ComponentProps<typeof TableContextDrawer> {
  return {
    open: true, selectedReservation: reservation(), selectedTable: null, selectedTableIsReservable: false,
    selectedReservationAssignedTable: null, selectedReservationAssignedTableId: null, selectedTableAssignments: [],
    selectedReservationPaymentDetails: null, selectedReservationPreorderItems: [], selectedReservationSpecialRequest: null,
    selectedPairDropState: null, compatibleTables: [{ table: table(), placement: { score: 90, wastedSeats: 2, reasons: ["Rotation simple"] } }],
    compatibleReservations: [], onOpenChange: vi.fn(), onClearSelection: vi.fn(), onAssignReservationToTable: vi.fn(),
    onReleaseReservation: vi.fn(), onSelectReservation: vi.fn(), onSelectTable: vi.fn(),
    onReservationStatusChange: vi.fn(), onOpenReservationDetails: vi.fn(),
    ...overrides,
  };
}

describe("service reservation rules", () => {
  it.each(["cancelled", "canceled", "completed", "no_show", "no-show", "archived", "expired", "declined", " CANCELLED ", " EXPIRED ", " DECLINED "])("makes %s read-only and frees its table", (status) => {
    const target = reservation({ status });
    expect(isActiveServiceReservation(target)).toBe(false);
    expect(getServiceReservationActions(target)).toEqual([]);
    expect(getTableServiceState({ isReservable: true, assignments: [target] }).key).toBe("free");
  });

  it("keeps an already billed client in service while respecting the general status RPC lock", () => {
    const target = reservation({ status: "seated", honored_at: "2026-05-27T22:30:00Z" });
    expect(isActiveServiceReservation(target)).toBe(true);
    expect(getServiceReservationActions(target)).toEqual([]);
    expect(getTableServiceState({ isReservable: true, assignments: [target] }).key).toBe("occupied");
    expect(getServiceReservationActions({ ...target, status: "arrived" })).toEqual([{ status: "seated", label: "Installer" }]);
  });

  it("offers only the next permitted service steps with French labels", () => {
    expect(getServiceReservationActions(reservation({ status: "pending" })).map((action) => action.status)).toEqual(["confirmed"]);
    expect(getServiceReservationActions(reservation()).map((action) => action.status)).toEqual(["arrived", "no_show"]);
    expect(getServiceReservationActions(reservation({ status: "arrived" })).map((action) => action.status)).toEqual(["seated"]);
    expect(getServiceReservationActions(reservation({ status: "seated" }))).toEqual([]);
    expect(getServiceReservationStatusLabel("canceled")).toBe("Annulée");
    expect(getServiceReservationStatusLabel("expired")).toBe("Expirée");
    expect(getServiceReservationStatusLabel("declined")).toBe("Refusée");
    expect(getServiceReservationStatusLabel("unknown")).toBe("Statut à vérifier");
  });

  it("selects the client in service before a later rotation, independent of input order", () => {
    const seated = reservation({ id: "seated", status: "seated", time: "19:00" });
    const arrived = reservation({ id: "arrived", status: "arrived", time: "20:30" });
    const next = reservation({ id: "next", time: "22:00" });
    const now = new Date("2026-05-27T20:30:00");
    expect(getPrimaryServiceReservation([next, arrived, seated], now)?.id).toBe("seated");
    expect(getPrimaryServiceReservation([next, arrived], now)?.id).toBe("arrived");
    expect(getPrimaryServiceReservation([
      reservation({ id: "past", time: "16:00" }), next,
      reservation({ id: "nearest", time: "21:00" }),
    ], now)?.id).toBe("nearest");
  });

  it("uses the declared duration consistently for release estimates and conflicts", () => {
    const target = reservation({ status: "seated", metadata: { duration_minutes: 90 } });
    const state = getTableServiceState({
      isReservable: true,
      assignments: [reservation({ id: "next", time: "21:45" }), target],
      now: new Date("2026-05-27T21:20:00"),
    });
    expect(state).toMatchObject({ key: "soon-free", detail: "lib. ~21:30" });
    expect(getServiceReservationDurationMinutes(reservation({ metadata: { duration_minutes: 0 } }))).toBe(30);
    expect(getServiceReservationDurationMinutes(reservation({ metadata: { duration_minutes: "90.5" } }))).toBe(120);
    expect(getServiceReservationDurationMinutes(reservation())).toBe(120);
  });

  it.each(["cancelled", "expired", "declined"])("never recommends or automatically places %s reservations or hidden furniture", (status) => {
    const active = reservation();
    const history = reservation({ id: "history", status });
    const hidden = table({ id: "hidden", is_active: false });
    const furniture = table({ id: "furniture", layout: { ...table().layout, kind: "plant" } });
    const getPlacementScore = (target: ServiceReservation, candidate: ServiceDraftTable) => scoreReservationPlacement({ reservation: target, table: candidate });
    const common = { reservations: [history, active], tables: [hidden, furniture, table()], getPlacementScore };
    const recommendations = getRecommendedTableByReservation({ ...common, getReservationDropState: () => ({ ok: true, reason: null }) });
    expect(Array.from(recommendations.keys())).toEqual([active.id]);
    expect(recommendations.get(active.id)?.table.id).toBe("t1");
    expect(planAutomaticPlacement({ ...common, assignments: {}, canPlace: () => true, preferredTableByUserId: new Map([[active.user_id, hidden.id]]) })).toEqual({ r1: "t1" });
  });
});

describe("SimpleReservationQueue", () => {
  it("separates history even when an old caller passes it in the active list", () => {
    const props = queueProps({ unassignedReservations: [reservation(), reservation({ id: "old", status: "cancelled", customer: { full_name: "Client annulé", phone: null } })] });
    render(<SimpleReservationQueue {...props} />);
    expect(screen.queryByRole("button", { name: "Ouvrir la réservation de Client annulé" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Historique 1/ }));
    const cardButton = screen.getByRole("button", { name: "Ouvrir la réservation de Client annulé" });
    expect(cardButton.closest('[draggable]')).toHaveAttribute("draggable", "false");
    expect(screen.queryByRole("button", { name: /^Placer / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Déplacer Client annulé/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Client arrivé" })).not.toBeInTheDocument();
    fireEvent.click(cardButton);
    expect(props.onReservationPress).toHaveBeenCalledWith("old");
    expect(props.onAssignReservationToTable).not.toHaveBeenCalled();
  });

  it("respects an explicit unassignment instead of reviving a stale persisted table", () => {
    const props = queueProps({ unassignedReservations: [reservation({ table_id: "t1" } as Partial<ServiceReservation>)], draftAssignments: { r1: null } });
    render(<SimpleReservationQueue {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Placer Alice Martin à T1" }));
    expect(props.onAssignReservationToTable).toHaveBeenCalledWith("r1", "t1");
    expect(props.onReservationPress).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Retirer / })).not.toBeInTheDocument();
  });

  it("offers the matching list when a search finds an already placed client", () => {
    render(<SimpleReservationQueue {...queueProps({ reservationQuery: "T1", unassignedReservations: [], assignedReservations: [reservation()], draftAssignments: { r1: "t1" } })} />);
    fireEvent.click(screen.getByRole("button", { name: "Voir les clients placés" }));
    expect(screen.getByRole("button", { name: "Ouvrir la réservation de Alice Martin" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retirer Alice Martin de T1" })).toBeInTheDocument();
  });

  it("sorts groups and filters status without mixing them with history", () => {
    render(<SimpleReservationQueue {...queueProps({ unassignedReservations: [
      reservation({ id: "small", party_size: 2, time: "19:00" }),
      reservation({ id: "large", party_size: 8, time: "20:00", status: "pending", customer: { full_name: "Grand groupe", phone: null } }),
    ] })} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Trier les clients" }), { target: { value: "party_size" } });
    expect(screen.getAllByRole("button", { name: /^Ouvrir la réservation de/ })[0]).toHaveAccessibleName("Ouvrir la réservation de Grand groupe");
    fireEvent.change(screen.getByRole("combobox", { name: "Filtrer les clients par statut" }), { target: { value: "pending" } });
    expect(screen.getAllByRole("button", { name: /^Ouvrir la réservation de/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Confirmer" })).toBeInTheDocument();
  });

  it("disables all service writes while preserving consultation during a mutation", () => {
    const props = queueProps({ pendingReservationStatusId: "another-reservation" });
    render(<SimpleReservationQueue {...props} />);
    expect(screen.getByRole("button", { name: "Placer Alice Martin à T1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Client arrivé" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Déplacer Alice Martin" })).toBeDisabled();
    const consult = screen.getByRole("button", { name: "Ouvrir la réservation de Alice Martin" });
    expect(consult).toBeEnabled();
    expect(consult.closest('[draggable]')).toHaveAttribute("draggable", "false");
    fireEvent.click(screen.getByRole("button", { name: "Client arrivé" }));
    expect(props.onReservationStatusChange).not.toHaveBeenCalled();
  });
});

describe("ReservationServiceActions", () => {
  it("requires confirmation for an absence and supports canceling it", () => {
    const onStatusChange = vi.fn();
    render(<ReservationServiceActions reservation={reservation()} onStatusChange={onStatusChange} />);
    expect(screen.queryByRole("button", { name: "Installer" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Signaler absent" }));
    expect(onStatusChange).not.toHaveBeenCalled();
    const confirmation = screen.getByRole("alertdialog");
    expect(confirmation).toHaveAccessibleName("Signaler l’absence de Alice Martin ?");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Garder la réservation" }));
    expect(onStatusChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Signaler absent" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer l’absence" }));
    expect(onStatusChange).toHaveBeenCalledExactlyOnceWith("r1", "no_show");
  });

  it("does not carry an absence confirmation over to another client", () => {
    const onStatusChange = vi.fn();
    const { rerender } = render(<ReservationServiceActions reservation={reservation()} onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Signaler absent" }));
    rerender(<ReservationServiceActions reservation={reservation({ id: "r2" })} onStatusChange={onStatusChange} />);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onStatusChange).not.toHaveBeenCalled();
  });
});

describe("TableContextDrawer service flow", () => {
  it("exposes full notes, the phone and reservation details with the next service action", () => {
    const notes = "Allergie aux noix.\nPrévoir une chaise enfant.\nAccès sans marche indispensable.";
    const props = drawerProps({ selectedReservationSpecialRequest: notes });
    render(<TableContextDrawer {...props} />);
    expect(screen.getByText(/Allergie aux noix\./)).toHaveTextContent("Accès sans marche indispensable.");
    expect(screen.getByRole("link", { name: "+41 79 123 45 67" })).toHaveAttribute("href", "tel:+41791234567");
    fireEvent.click(screen.getByRole("button", { name: "Client arrivé" }));
    expect(props.onReservationStatusChange).toHaveBeenCalledWith("r1", "arrived");
    fireEvent.click(screen.getByRole("button", { name: "Voir la réservation" }));
    expect(props.onOpenReservationDetails).toHaveBeenCalledWith("r1");
    expect(screen.queryByRole("button", { name: /^Garder T/ })).not.toBeInTheDocument();
  });

  it("keeps historical records consultable with no placement or service writes", () => {
    render(<TableContextDrawer {...drawerProps({
      selectedReservation: reservation({ status: "completed" }), selectedTable: table(), selectedTableIsReservable: true,
      selectedReservationAssignedTable: table(), selectedReservationAssignedTableId: "t1", selectedPairDropState: { ok: true, reason: null },
      onSetPreferredTable: vi.fn(),
    })} />);
    expect(screen.getByText("Terminée")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Placer / })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retirer de la table" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Client arrivé" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voir la réservation" })).toBeEnabled();
  });

  it("does not recommend reassigning the same table or install an unplaced arrival", () => {
    const props = drawerProps({ selectedReservation: reservation({ status: "arrived" }) });
    const { rerender } = render(<TableContextDrawer {...props} />);
    expect(screen.getByRole("button", { name: "Installer" })).toBeDisabled();
    expect(screen.getByText("Choisissez une table avant d’installer le client.")).toBeInTheDocument();
    rerender(<TableContextDrawer {...props} selectedReservationAssignedTableId="t1" selectedReservationAssignedTable={table()} />);
    expect(screen.getByRole("button", { name: "Installer" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Placer Alice Martin à T1" })).not.toBeInTheDocument();
  });

  it("disables assignment, removal and status changes while saving", () => {
    render(<TableContextDrawer {...drawerProps({
      selectedReservationAssignedTableId: "old", selectedReservationAssignedTable: table({ id: "old", table_number: "T2" }),
      mutationsDisabled: true, onSetPreferredTable: vi.fn(),
    })} />);
    expect(screen.getByRole("button", { name: "Placer Alice Martin à T1" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Client arrivé" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Retirer de la table" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Toujours T2 pour ce client" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Voir la réservation" })).toBeEnabled();
  });
});
