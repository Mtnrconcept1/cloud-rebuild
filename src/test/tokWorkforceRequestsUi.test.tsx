import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WorkforceRequestForm from "@/components/workforce/WorkforceRequestForm";
import WorkforceRequests from "@/components/workforce/WorkforceRequests";
import type { WorkforceEntry, WorkforceRequest } from "@/lib/tokWorkforce";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), refresh: vi.fn(), toast: vi.fn(), entries: vi.fn(), validations: vi.fn(), requests: vi.fn(), holidays: vi.fn() }));
const employees = [{ id: "alice", restaurant_id: "restaurant-a", first_name: "Alice", last_name: "Martin", is_active: true }];
const entry = (id: string, overrides: Partial<WorkforceEntry> = {}): WorkforceEntry => ({ id, restaurant_id: "restaurant-a", employee_id: "alice", entry_date: "2026-10-20", start_time: "09:00:00", end_time: "17:00:00", break_minutes: 30, notes: null, is_night_work: false, is_sunday_work: false, version: 4, ...overrides });
const pending: WorkforceRequest = { id: "request-a", restaurant_id: "restaurant-a", employee_id: "alice", request_type: "correction", description: "Mon service a fini plus tard.", status: "pending", requested_entry_id: "unsigned", requested_entry_version: 4, requested_start_time: "09:00:00", requested_end_time: "18:00:00", requested_break_minutes: 45 };
const loaded = <T,>(data: T[]) => ({ data, isPending: false, isError: false, refetch: vi.fn() });
vi.mock("@/hooks/useTokWorkforce", () => ({ workforceDb: () => ({ rpc: mocks.rpc, from: mocks.from }), useWorkforceRefresh: () => mocks.refresh, useWorkforceEmployees: () => loaded(employees), useWorkforceRequests: () => mocks.requests(), useWorkforceEntriesInRange: (...args: unknown[]) => mocks.entries(...args), useWorkforceValidations: (...args: unknown[]) => mocks.validations(...args), useWorkforceHolidays: () => mocks.holidays() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
const clients: QueryClient[] = [];
function open(manager = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  const content = manager ? <WorkforceRequests restaurantId="restaurant-a" /> : <WorkforceRequestForm restaurantId="restaurant-a" employees={employees} employeeId="alice" />;
  return render(<QueryClientProvider client={client}>{content}</QueryClientProvider>);
}
function chooseCorrection() {
  fireEvent.change(screen.getByLabelText("Motif"), { target: { value: "correction" } });
  fireEvent.change(screen.getByLabelText("Mois du relevé à corriger"), { target: { value: "2026-10" } });
  fireEvent.change(screen.getByLabelText("Relevé non signé"), { target: { value: "unsigned" } });
  fireEvent.change(screen.getByLabelText("Description de la demande"), { target: { value: "Mon service a fini plus tard." } });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.entries.mockReturnValue(loaded([entry("unsigned"), entry("signed", { start_time: "08:00:00" }), entry("foreign", { employee_id: "bob", start_time: "07:00:00" })]));
  mocks.validations.mockReturnValue(loaded([{ time_entry_id: "signed" }])); mocks.requests.mockReturnValue(loaded([pending])); mocks.holidays.mockReturnValue(loaded([]));
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

describe("demandes et corrections structurées TOK", () => {
  it("propose seulement les relevés non signés du collaborateur et soumet la correction avec sa version", async () => {
    const single = vi.fn(async () => ({ data: { id: "new-request" }, error: null }));
    const insert = vi.fn(() => ({ select: () => ({ single }) })); mocks.from.mockReturnValue({ insert }); open(); chooseCorrection();
    expect(screen.queryByRole("option", { name: /08:00/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /07:00/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Début corrigé")).toHaveValue("09:00");
    expect(screen.getByLabelText("Pause corrigée (min)")).toHaveValue(30);
    fireEvent.change(screen.getByLabelText("Fin corrigée"), { target: { value: "18:00" } });
    fireEvent.change(screen.getByLabelText("Pause corrigée (min)"), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer au responsable" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ restaurant_id: "restaurant-a", employee_id: "alice", request_type: "correction", requested_entry_id: "unsigned", requested_entry_version: 4, requested_start_time: "09:00", requested_end_time: "18:00", requested_break_minutes: 45, requested_start_date: null, requested_days: null, status: "pending" }));
    expect(mocks.entries).toHaveBeenCalledWith("restaurant-a", true, "2026-10-01", "2026-10-31", "alice");
    expect(mocks.validations).toHaveBeenCalledWith("restaurant-a", true, "2026-10-01", "2026-10-31", "alice");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("empêche une correction si le relevé a changé après sa sélection", async () => {
    open(); chooseCorrection();
    mocks.entries.mockReturnValue(loaded([entry("unsigned", { version: 5 })]));
    fireEvent.change(screen.getByLabelText("Fin corrigée"), { target: { value: "18:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer au responsable" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ce relevé a été modifié");
    expect(screen.getByLabelText("Description de la demande")).toHaveValue("Mon service a fini plus tard.");
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("conserve la correction et le commentaire si le backend refuse l’enregistrement", async () => {
    mocks.from.mockReturnValue({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "Ce relevé est maintenant signé." } }) }) }) });
    open(); chooseCorrection();
    fireEvent.change(screen.getByLabelText("Fin corrigée"), { target: { value: "18:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer au responsable" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("maintenant signé");
    expect(screen.getByLabelText("Fin corrigée")).toHaveValue("18:00");
    expect(screen.getByLabelText("Relevé non signé")).toHaveValue("unsigned");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("préserve la demande de congé et ses dates sans créer directement une absence", async () => {
    const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: "leave" }, error: null }) }) })); mocks.from.mockReturnValue({ insert }); open();
    fireEvent.change(screen.getByLabelText("Du"), { target: { value: "2026-11-09" } });
    fireEvent.change(screen.getByLabelText("Au"), { target: { value: "2026-11-13" } });
    fireEvent.change(screen.getByLabelText("Jours décomptés"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Description de la demande"), { target: { value: "Congé de novembre" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer au responsable" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.from).toHaveBeenCalledExactlyOnceWith("tok_workforce_requests");
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ request_type: "vacation", requested_start_date: "2026-11-09", requested_end_date: "2026-11-13", requested_days: 5, requested_entry_id: null }));
  });

  it("fait approuver la correction et le commentaire par la RPC de traitement", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null }); open(true);
    expect(screen.getByText(/Correction proposée/)).toHaveTextContent("09:00–18:00 · pause 45 min");
    fireEvent.click(screen.getByRole("button", { name: "Accepter", exact: true }));
    fireEvent.change(screen.getByLabelText("Commentaire pour le collaborateur (facultatif)"), { target: { value: "  Vérifié avec le service du soir.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la décision" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("tok_workforce_review_request", { p_request_id: "request-a", p_approve: true, p_review_note: "Vérifié avec le service du soir." });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("laisse le commentaire disponible quand la décision est refusée côté serveur", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "Le relevé a changé avant votre décision." } }); open(true);
    fireEvent.click(screen.getByRole("button", { name: "Accepter", exact: true }));
    fireEvent.change(screen.getByLabelText("Commentaire pour le collaborateur (facultatif)"), { target: { value: "À revérifier" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la décision" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("avant votre décision");
    expect(screen.getByLabelText("Commentaire pour le collaborateur (facultatif)")).toHaveValue("À revérifier");
    expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("préremplit les jours ouvrés hors fériés et conserve un décompte personnalisé par demi-journée", async () => {
    mocks.holidays.mockReturnValue(loaded([{ restaurant_id: "restaurant-a", holiday_date: "2026-11-11", name: "Férié local" }, { restaurant_id: "another-restaurant", holiday_date: "2026-11-12", name: "Autre calendrier" }]));
    const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: "leave" }, error: null }) }) })); mocks.from.mockReturnValue({ insert }); open();
    fireEvent.change(screen.getByLabelText("Du"), { target: { value: "2026-11-09" } });
    fireEvent.change(screen.getByLabelText("Au"), { target: { value: "2026-11-15" } });
    expect(screen.getByLabelText("Jours décomptés")).toHaveValue(4);
    fireEvent.change(screen.getByLabelText("Jours décomptés"), { target: { value: "2.5" } });
    fireEvent.change(screen.getByLabelText("Description de la demande"), { target: { value: "Planning à temps partiel" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer au responsable" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ requested_days: 2.5 }));
  });
});
