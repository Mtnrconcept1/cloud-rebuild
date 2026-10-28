import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WorkforcePersonal from "@/components/workforce/WorkforcePersonal";
import { workforceZurichClock, type WorkforceAbsence, type WorkforceEntry, type WorkforceRequest, type WorkforceShift, type WorkforceValidation } from "@/lib/tokWorkforce";

const mocks = vi.hoisted(() => ({
  entries: [] as WorkforceEntry[], absences: [] as WorkforceAbsence[], requests: [] as WorkforceRequest[],
  validations: [] as WorkforceValidation[], next: null as WorkforceShift | null, error: false, pending: false,
  nextHook: vi.fn(), entriesHook: vi.fn(), validationsHook: vi.fn(),
}));
const result = <T,>(data: T, isError = false) => ({ data, isPending: mocks.pending, isError, refetch: vi.fn() });
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/workforce/WorkforceClock", () => ({ default: () => <div>Badgeuse personnelle disponible</div> }));
vi.mock("@/components/workforce/WorkforcePersonalExchanges", () => ({ default: () => <div>Échanges personnels</div> }));
vi.mock("@/hooks/useTokWorkforce", () => ({
  workforceDb: vi.fn(),
  useWorkforceRefresh: () => vi.fn(),
  useWorkforceShifts: () => result([]),
  useWorkforceEntriesInRange: (...args: unknown[]) => { mocks.entriesHook(...args); return result(mocks.entries, mocks.error); },
  useWorkforceClockSessionsInRange: () => result([], mocks.error),
  useWorkforceValidations: (...args: unknown[]) => { mocks.validationsHook(...args); return result(mocks.validations, mocks.error); },
  useWorkforceHolidays: () => result([], mocks.error),
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
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-28T10:00:00Z"));
  const today = workforceZurichClock().date;
  mocks.error = false;
  mocks.pending = false;
  mocks.validations = [];
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
  vi.useRealTimers();
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

  it("calcule les historiques paginés au-delà des anciennes limites d’affichage", () => {
    mocks.entries = Array.from({ length: 1000 }, (_, index) => ({ ...mocks.entries[0], id: "entry-" + index }));
    mocks.requests = Array.from({ length: 200 }, (_, index) => ({ ...mocks.requests[0], id: "request-" + index }));
    renderPersonal();
    expect(screen.queryByText("À consulter")).not.toBeInTheDocument();
    expect(screen.getByText("7500.0 h")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
  });

  it("ouvre les heures depuis leur carte de synthèse", () => {
    renderPersonal();
    fireEvent.click(screen.getByRole("button", { name: "Consulter mes heures" }));
    expect(screen.getByRole("tab", { name: "Mes heures" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/7.5 h comptabilisées/)).toBeInTheDocument();
  });

  it("filtre les validations par version et permet de consulter une autre année", () => {
    mocks.entries[0].version = 2;
    mocks.validations = [{ id: "v1", restaurant_id: "restaurant-1", time_entry_id: "entry-1", signed_name: "Camille", signed_at: "2026-10-28T12:00:00Z", entry_version: 1 }];
    renderPersonal();
    fireEvent.click(screen.getByRole("button", { name: "Consulter mes heures" }));
    expect(screen.getByText("En attente de validation")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Relevés validés uniquement" }));
    expect(screen.getByText(/Aucune heure validée pour ce mois/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Mois des relevés"), { target: { value: "2025-12" } });
    expect(mocks.entriesHook).toHaveBeenCalledWith("restaurant-1", true, "2024-12-31", "2025-12-31", "employee-1");
    expect(mocks.validationsHook).toHaveBeenCalledWith("restaurant-1", true, "2024-12-31", "2025-12-31", "employee-1");
  });

  it("montre la réponse du responsable et les horaires proposés dans les demandes", () => {
    mocks.requests = [{ ...mocks.requests[0], request_type: "correction", requested_entry_id: "entry-1", requested_entry_version: 1,
      requested_start_time: "09:15:00", requested_end_time: "17:30:00", requested_break_minutes: 45,
      review_note: "Horaires corrigés après vérification.", status: "approved" }];
    renderPersonal();
    fireEvent.click(screen.getByRole("button", { name: "Suivre mes demandes" }));
    expect(screen.getByText(/09:15–17:30 · pause 45 min/)).toBeInTheDocument();
    expect(screen.getByText(/Horaires corrigés après vérification/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Collaborateur")).not.toBeInTheDocument();
  });
});
