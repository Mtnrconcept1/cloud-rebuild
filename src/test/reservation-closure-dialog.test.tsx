import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ReservationClosureDialog from "@/components/dashboard/ReservationClosureDialog";
import { canCloseServiceReservation, type ServiceReservation } from "@/components/floor-plan/serviceShared";
import { markReservationHonored } from "@/lib/reservationMutations";

vi.mock("@/lib/reservationMutations", () => ({ markReservationHonored: vi.fn() }));

function reservation(overrides: Partial<ServiceReservation> = {}): ServiceReservation {
  return {
    id: "r1", user_id: "u1", restaurant_id: "restaurant", date: "2026-05-27", time: "20:00", party_size: 4,
    status: "seated", total_amount: 120, metadata: {}, notes: null,
    customer: { full_name: "Alice Martin", phone: null },
    ...overrides,
  } as ServiceReservation;
}

function renderClosure(target = reservation()) {
  const onCompleted = vi.fn();
  const onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ReservationClosureDialog reservation={target} onCompleted={onCompleted} onClose={onClose} /></QueryClientProvider>);
  return { onCompleted, onClose };
}

beforeEach(() => { vi.mocked(markReservationHonored).mockReset(); });

describe("ReservationClosureDialog", () => {
  it("requires an explicit collected amount instead of inferring it from a preorder", () => {
    const { onCompleted } = renderClosure();
    expect(screen.getByRole("textbox", { name: /Montant réellement encaissé/ })).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la clôture" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Saisissez un montant en CHF");
    expect(markReservationHonored).not.toHaveBeenCalled();
    expect(onCompleted).not.toHaveBeenCalled();
  });

  it.each(["-1", "12.345", "Infinity", "2e3", "21474836.48"])("rejects an invalid monetary amount %s before calling the server", (amount) => {
    renderClosure();
    fireEvent.change(screen.getByRole("textbox", { name: /Montant réellement encaissé/ }), { target: { value: amount } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la clôture" }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(markReservationHonored).not.toHaveBeenCalled();
  });

  it("submits localized decimals through the dedicated honored RPC wrapper and returns the confirmed fee", async () => {
    vi.mocked(markReservationHonored).mockResolvedValue({ ok: true, feeChf: 5 });
    const { onCompleted } = renderClosure();
    fireEvent.change(screen.getByRole("textbox", { name: /Montant réellement encaissé/ }), { target: { value: "126,50" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la clôture" }));
    await waitFor(() => expect(onCompleted).toHaveBeenCalledExactlyOnceWith({ reservationId: "r1", revenueChf: 126.5, feeChf: 5 }));
    expect(markReservationHonored).toHaveBeenCalledExactlyOnceWith("r1", 126.5);
  });

  it("preserves the amount and displays a server refusal without marking the service completed", async () => {
    vi.mocked(markReservationHonored).mockResolvedValue({ ok: false, errorCode: "refunded", errorMessage: "Une réservation remboursée ne peut pas être facturée." });
    const { onCompleted, onClose } = renderClosure();
    fireEvent.change(screen.getByRole("textbox", { name: /Montant réellement encaissé/ }), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la clôture" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Une réservation remboursée ne peut pas être facturée.");
    expect(screen.getByRole("textbox", { name: /Montant réellement encaissé/ })).toHaveValue("0");
    expect(onCompleted).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("prevents duplicate submissions and closure dismissal while the request is pending", async () => {
    let resolve!: (value: Awaited<ReturnType<typeof markReservationHonored>>) => void;
    vi.mocked(markReservationHonored).mockReturnValue(new Promise((done) => { resolve = done; }));
    const { onCompleted, onClose } = renderClosure();
    fireEvent.change(screen.getByRole("textbox", { name: /Montant réellement encaissé/ }), { target: { value: "89.90" } });
    const confirm = screen.getByRole("button", { name: "Confirmer la clôture" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(screen.getByRole("button", { name: "Clôture en cours…" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Revenir au service" })).toBeDisabled();
    expect(markReservationHonored).toHaveBeenCalledExactlyOnceWith("r1", 89.9);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => { resolve({ ok: true, feeChf: 0 }); });
    await waitFor(() => expect(onCompleted).toHaveBeenCalledOnce());
  });

  it("closes an already accounted arrival without requesting or pretending to replace its locked revenue", async () => {
    vi.mocked(markReservationHonored).mockResolvedValue({ ok: true, feeChf: 5 });
    const { onCompleted } = renderClosure(reservation({ status: "arrived", honored_at: "2026-05-27T20:05:00Z" }));
    expect(screen.queryByRole("textbox", { name: /Montant réellement encaissé/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Les montants déjà enregistrés seront conservés/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la clôture" }));
    await waitFor(() => expect(onCompleted).toHaveBeenCalledExactlyOnceWith({ reservationId: "r1", revenueChf: null, feeChf: 5 }));
    expect(markReservationHonored).toHaveBeenCalledExactlyOnceWith("r1", 0);
  });

  it("offers closure only to arrivals and seated clients whose service is not completed", () => {
    expect(canCloseServiceReservation(reservation({ status: "arrived" }))).toBe(true);
    expect(canCloseServiceReservation(reservation({ status: "confirmed" }))).toBe(false);
    expect(canCloseServiceReservation(reservation({ status: "completed" }))).toBe(false);
    expect(canCloseServiceReservation(reservation({ honored_at: "2026-05-27T22:00:00Z" }))).toBe(true);
    renderClosure(reservation({ status: "completed" }));
    expect(screen.getByRole("button", { name: "Confirmer la clôture" })).toBeDisabled();
  });
});
