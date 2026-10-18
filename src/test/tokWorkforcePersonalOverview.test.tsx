import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WorkforcePersonal from "@/components/workforce/WorkforcePersonal";
import { workforceZurichClock, type WorkforceAbsence, type WorkforceEntry, type WorkforceRequest, type WorkforceShift } from "@/lib/tokWorkforce";

const mocks = vi.hoisted(() => ({
  entries: [] as WorkforceEntry[], absences: [] as WorkforceAbsence[], requests: [] as WorkforceRequest[],
  next: null as WorkforceShift | null, error: false, pending: false, nextHook: vi.fn(),
}));
const result = <T,>(data: T, isError = false) => ({ data, isPending: mocks.pending, isError, refetch: vi.fn() });
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/workforce/WorkforceClock", () => ({ default: () => <div>Badgeuse personnelle disponible</div> }));
vi.mock("@/components/workforce/WorkforcePersonalExchanges", () => ({ default: () => <div>Échanges personnels</div> }));
vi.mock("@/hooks/useTokWorkforce", () => ({
  workforceDb: vi.fn(),
  useWorkforceShifts: () => result([]),
  useWorkforceEntriesInRange: () => result(mocks.entries, mocks.error),
  useWorkforceAbsences: () => result(mocks.absences, mocks.error),
  useWorkforceRequests: () => result(mocks.requests, mocks.error),
  useWorkforceNextShift: (...args: unknown[]) => { mocks.nextHook(...args); return result(mocks.next, mocks.error); },
}));
const clients: QueryClient[] = [];
function renderPersonal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><WorkforcePersonal restaurantId="restaurant-1" employeeId="employee-1" contractHours={42} vacationDays={20} /></QueryClientProvider>);
}
beforeEach(() => {
  vi.clearAllMocks();
  const today = workforceZurichClock().date;
  mocks.error = false;
  mocks.pending = false;
  mocks.entries = [{
    id: "entry-1", restaurant_id: "restaurant-1", employee_id: "employee-1", entry_date: today,
    start_time: "09:00", end_time: "17:00", break_minutes: 30, notes: null, is_night_work: false, is_sunday_work: false,
  }, {
    id: "entry-other", restaurant_id: "restaurant-1", employee_id: "employee-other", entry_date: today,
    start_time: "09:00", end_time: "18:00", break_minutes: 0, notes: null, is_night_work: false, is_sunday_work: false,
  }];
  mocks.absences = [{
    id: "absence-1", restaurant_id: "restaurant-1", employee_id: "employee-1",
    absence_type: "vacation", start_date: today, end_date: today, days_count: 2, notes: null,
  }];
  mocks.requests = [
    { id: "request-1", restaurant_id: "restaurant-1", employee_id: "employee-1", request_type: "vacation", description: "Mes congés de fin de mois", status: "pending" },
    { id: "request-other", restaurant_id: "restaurant-1", employee_id: "employee-other", request_type: "other", description: "Demande d’un autre employé", status: "pending" },
  ];
  mocks.next = {
    id: "shift-1", restaurant_id: "restaurant-1", employee_id: "employee-1",
    shift_date: "2030-10-21", start_time: "10:00", end_time: "18:00", break_minutes: 30, status: "confirmed", notes: null,
  };
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach(client => client.clear());
});

describe("TOK Équipe — vue d’ensemble personnelle", () => {
  it("ouvre une synthèse de l’employé et mène aux demandes sans mélanger les collaborateurs", () => {
    renderPersonal();
    expect(screen.getByRole("tab", { name: "Vue d’ensemble" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("7.5 h")).toBeInTheDocument();
    expect(screen.getByText("18.0 jours")).toBeInTheDocument();
    expect(screen.getByText("Badgeuse personnelle disponible")).toBeInTheDocument();
    expect(screen.getByText(/10:00 – 18:00/)).toBeInTheDocument();
    expect(screen.getByText("Mes congés de fin de mois")).toBeInTheDocument();
    expect(screen.queryByText("Demande d’un autre employé")).not.toBeInTheDocument();
    expect(mocks.nextHook).toHaveBeenCalledWith("restaurant-1", "employee-1");
    fireEvent.click(screen.getByRole("button", { name: "Faire une demande" }));
    expect(screen.getByRole("tab", { name: "Demandes" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: "Envoyer au responsable" })).toBeInTheDocument();
  });

  it("présente les données indisponibles sans faux compteurs à zéro ni faux planning vide", () => {
    mocks.error = true;
    mocks.entries = [];
    mocks.next = null;
    renderPersonal();
    expect(screen.getAllByText("Indisponibles").length).toBe(3);
    expect(screen.getByText(/Le prochain service est indisponible/)).toBeInTheDocument();
    expect(screen.queryByText("0.0 h")).not.toBeInTheDocument();
    expect(screen.queryByText("Aucun service à venir n’est encore planifié.")).not.toBeInTheDocument();
  });

  it("affiche le chargement avant de calculer les compteurs ou de conclure à un planning vide", () => {
    mocks.pending = true;
    mocks.entries = [];
    mocks.absences = [];
    mocks.requests = [];
    mocks.next = null;
    renderPersonal();
    expect(screen.getAllByText("Chargement…")).toHaveLength(3);
    expect(screen.getByText("Recherche du prochain service…")).toBeInTheDocument();
    expect(screen.queryByText("0.0 h")).not.toBeInTheDocument();
    expect(screen.queryByText("Aucun service à venir n’est encore planifié.")).not.toBeInTheDocument();
  });

  it("signale les historiques limités et ne présente pas de compteurs incomplets comme des totaux", () => {
    mocks.entries = Array.from({ length: 1000 }, (_, index) => ({ ...mocks.entries[0], id: "entry-" + index }));
    mocks.absences = Array.from({ length: 200 }, (_, index) => ({ ...mocks.absences[0], id: "absence-" + index }));
    mocks.requests = Array.from({ length: 200 }, (_, index) => ({ ...mocks.requests[0], id: "request-" + index }));
    renderPersonal();
    expect(screen.getAllByText("À consulter")).toHaveLength(3);
    expect(screen.getByText(/Certains historiques ont atteint la limite/)).toBeInTheDocument();
    expect(screen.queryByText("7500.0 h")).not.toBeInTheDocument();
  });

  it("ouvre les heures depuis leur carte de synthèse", () => {
    renderPersonal();
    fireEvent.click(screen.getByRole("button", { name: "Consulter mes heures" }));
    expect(screen.getByRole("tab", { name: "Mes heures" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/7.5 h comptabilisées/)).toBeInTheDocument();
  });
});
