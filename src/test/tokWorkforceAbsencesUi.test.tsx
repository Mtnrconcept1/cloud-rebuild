import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WorkforceAbsences from "@/components/workforce/WorkforceAbsences";
import type { WorkforceAbsence } from "@/lib/tokWorkforce";

const mocks = vi.hoisted(() => ({ from: vi.fn(), refresh: vi.fn(), toast: vi.fn(), holidays: vi.fn() }));
const absences: WorkforceAbsence[] = [
  { id: "leave", restaurant_id: "restaurant-a", employee_id: "alice", absence_type: "vacation", start_date: "2026-11-09", end_date: "2026-11-13", days_count: 5, notes: "Repos prévu", source_request_id: "request-a" },
  { id: "manual", restaurant_id: "restaurant-a", employee_id: "alice", absence_type: "sick", start_date: "2026-11-02", end_date: "2026-11-02", days_count: 1, notes: "Absence annoncée", source_request_id: null },
];
vi.mock("@/hooks/useTokWorkforce", () => ({ workforceDb: () => ({ from: mocks.from }), useWorkforceRefresh: () => mocks.refresh, useWorkforceEmployees: () => ({ data: [{ id: "alice", first_name: "Alice", last_name: "Martin", is_active: true }], isError: false, isPending: false }), useWorkforceAbsences: () => ({ data: absences, isError: false, isPending: false }), useWorkforceHolidays: () => mocks.holidays() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
const clients: QueryClient[] = [];
function open() { const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } }); clients.push(client); render(<QueryClientProvider client={client}><WorkforceAbsences restaurantId="restaurant-a" /></QueryClientProvider>); }
beforeEach(() => { vi.clearAllMocks(); mocks.holidays.mockReturnValue({ data: [], isPending: false, isError: false }); });
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); });

describe("absences et congés approuvés TOK", () => {
  it("conserve le lien du congé approuvé et permet seulement la suppression de l’absence manuelle", async () => {
    const query = { eq: vi.fn(() => query), select: vi.fn(() => query), single: vi.fn(async () => ({ data: { id: "manual" }, error: null })) };
    mocks.from.mockReturnValue({ delete: () => query }); vi.spyOn(window, "confirm").mockReturnValue(true); open();
    expect(screen.getByText(/Congé approuvé : cette absence reste liée/)).toBeInTheDocument();
    expect(screen.getByText("Repos prévu")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Supprimer l'absence" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Supprimer l'absence" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(query.eq.mock.calls).toEqual([["restaurant_id", "restaurant-a"], ["id", "manual"]]);
  });

  it("garde le type, les dates et la note si le serveur signale un service pendant l’absence", async () => {
    mocks.from.mockReturnValue({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "Un service est planifié pendant cette absence. Ajustez le planning." } }) }) }) }); open();
    fireEvent.change(screen.getByLabelText("Collaborateur"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("Nature"), { target: { value: "sick" } });
    fireEvent.change(screen.getByLabelText("Du"), { target: { value: "2026-11-03" } });
    fireEvent.change(screen.getByLabelText("Au"), { target: { value: "2026-11-03" } });
    fireEvent.change(screen.getByLabelText("Note facultative"), { target: { value: "Justificatif reçu" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer", exact: true }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ajustez le planning");
    expect(screen.getByLabelText("Nature")).toHaveValue("sick");
    expect(screen.getByLabelText("Note facultative")).toHaveValue("Justificatif reçu");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("préremplit les jours ouvrés et traite le jour férié lui-même quand ce type d’absence est choisi", () => {
    mocks.holidays.mockReturnValue({ data: [{ restaurant_id: "restaurant-a", holiday_date: "2026-11-11", name: "Férié local" }], isPending: false, isError: false }); open();
    fireEvent.change(screen.getByLabelText("Du"), { target: { value: "2026-11-09" } });
    fireEvent.change(screen.getByLabelText("Au"), { target: { value: "2026-11-15" } });
    expect(screen.getByLabelText("Nombre de jours décomptés")).toHaveValue(4);
    fireEvent.change(screen.getByLabelText("Nombre de jours décomptés"), { target: { value: "2.5" } });
    fireEvent.change(screen.getByLabelText("Note facultative"), { target: { value: "Contrat adapté" } });
    expect(screen.getByLabelText("Nombre de jours décomptés")).toHaveValue(2.5);
    fireEvent.change(screen.getByLabelText("Nature"), { target: { value: "holiday" } });
    fireEvent.change(screen.getByLabelText("Du"), { target: { value: "2026-11-11" } });
    fireEvent.change(screen.getByLabelText("Au"), { target: { value: "2026-11-11" } });
    expect(screen.getByLabelText("Nombre de jours décomptés")).toHaveValue(1);
  });
});
