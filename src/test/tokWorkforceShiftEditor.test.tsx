import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WorkforceShiftDialog from "@/components/workforce/WorkforceShiftDialog";
import type { WorkforceAbsence, WorkforceEmployee, WorkforceShift } from "@/lib/tokWorkforce";

const mocks = vi.hoisted(() => ({ from: vi.fn(), toast: vi.fn(), refresh: vi.fn() }));
vi.mock("@/hooks/useTokWorkforce", () => ({ workforceDb: () => ({ from: mocks.from }), useWorkforceRefresh: () => mocks.refresh }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
const employees: WorkforceEmployee[] = [
  { id: "employee-a", restaurant_id: "restaurant-a", first_name: "Alice", last_name: "Martin", email: null, user_id: null, role: "employee", contracted_hours_per_week: 42, vacation_days_per_year: 20, hourly_cost_chf: 30, is_active: true, started_on: "2026-01-01", ended_on: null },
  { id: "employee-b", restaurant_id: "restaurant-a", first_name: "Bob", last_name: "Dupont", email: null, user_id: null, role: "employee", contracted_hours_per_week: 35, vacation_days_per_year: 25, hourly_cost_chf: 35, is_active: true, started_on: "2026-01-01", ended_on: null },
];
const shift: WorkforceShift = { id: "shift-a", restaurant_id: "restaurant-a", employee_id: "employee-a", shift_date: "2026-10-19", start_time: "09:00", end_time: "17:00", break_minutes: 30, notes: "Cuisine", status: "planned", updated_at: "2026-10-10T08:00:00Z" };
const clients: QueryClient[] = [];
function open(absences: WorkforceAbsence[] = []) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  const onClose = vi.fn();
  render(<QueryClientProvider client={client}><WorkforceShiftDialog restaurantId="restaurant-a" employees={employees} absences={absences} shift={shift} initialDate={shift.shift_date} onClose={onClose} /></QueryClientProvider>);
  return onClose;
}
beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

describe("éditeur de service TOK", () => {
  it("modifie l’affectation et un service de nuit au clavier avec sa version", async () => {
    const query = { eq: vi.fn(() => query), select: vi.fn(() => query), single: vi.fn(async () => ({ data: { id: shift.id }, error: null })) };
    const update = vi.fn(() => query); mocks.from.mockReturnValue({ update });
    const close = open();
    fireEvent.change(screen.getByLabelText("Collaborateur"), { target: { value: "employee-b" } });
    fireEvent.change(screen.getByLabelText("Début"), { target: { value: "22:00" } });
    fireEvent.change(screen.getByLabelText("Fin"), { target: { value: "02:00" } });
    fireEvent.change(screen.getByLabelText("Statut"), { target: { value: "confirmed" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le service" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ employee_id: "employee-b", start_time: "22:00", end_time: "02:00", break_minutes: 30, status: "confirmed", notes: "Cuisine" }));
    expect(query.eq.mock.calls).toEqual([["restaurant_id", "restaurant-a"], ["id", "shift-a"], ["updated_at", "2026-10-10T08:00:00Z"]]);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("refuse une absence chevauchant la semaine et conserve les champs", async () => {
    const close = open([{ id: "absence", restaurant_id: "restaurant-a", employee_id: "employee-b", absence_type: "vacation", start_date: "2026-10-17", end_date: "2026-10-20", days_count: 2, notes: null }]);
    fireEvent.change(screen.getByLabelText("Collaborateur"), { target: { value: "employee-b" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le service" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Une absence recoupe ce service");
    expect(screen.getByLabelText("Collaborateur")).toHaveValue("employee-b");
    expect(mocks.from).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
  });

  it("ne ferme pas le formulaire après un conflit apparu côté serveur", async () => {
    const query = { eq: vi.fn(() => query), select: vi.fn(() => query), single: vi.fn(async () => ({ data: null, error: { message: "Le service chevauche un autre horaire." } })) };
    mocks.from.mockReturnValue({ update: () => query });
    const close = open();
    fireEvent.change(screen.getByLabelText("Notes du service"), { target: { value: "Service du soir" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le service" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("chevauche");
    expect(screen.getByLabelText("Notes du service")).toHaveValue("Service du soir");
    expect(close).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("permet un service finissant à minuit avant une absence du lendemain", async () => {
    const query = { eq: vi.fn(() => query), select: vi.fn(() => query), single: vi.fn(async () => ({ data: { id: shift.id }, error: null })) };
    mocks.from.mockReturnValue({ update: () => query });
    const close = open([{ id: "tomorrow", restaurant_id: "restaurant-a", employee_id: "employee-a", absence_type: "vacation", start_date: "2026-10-20", end_date: "2026-10-21", days_count: 2, notes: null }]);
    fireEvent.change(screen.getByLabelText("Début"), { target: { value: "18:00" } });
    fireEvent.change(screen.getByLabelText("Fin"), { target: { value: "00:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le service" }));
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
