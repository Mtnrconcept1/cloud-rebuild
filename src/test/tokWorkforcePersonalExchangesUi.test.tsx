import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WorkforcePersonalExchanges from "@/components/workforce/WorkforcePersonalExchanges";
import type { WorkforceExchange, WorkforceShift } from "@/lib/tokWorkforce";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), refresh: vi.fn(), toast: vi.fn(), rows: vi.fn() }));
const ownShift: WorkforceShift = { id: "my-service", restaurant_id: "restaurant-a", employee_id: "alice", shift_date: "2026-11-01", start_time: "09:00:00", end_time: "17:00:00", break_minutes: 30, status: "planned", notes: null };
const candidate = { shift_id: "bobs-service", employee_id: "bob", display_name: "Bob Dupont", shift_date: "2026-11-03", start_time: "18:00:00", end_time: "23:00:00", break_minutes: 15, status: "confirmed", updated_at: "2026-10-20T10:00:00Z" };
const exchange: WorkforceExchange = { id: "exchange-a", restaurant_id: "restaurant-a", requester_id: "alice", target_employee_id: "bob", requester_shift_id: "my-service", target_shift_id: null, status: "pending", target_accepted_at: null, requester_message: "Besoin d’un remplacement" };
const loaded = <T,>(data: T[]) => ({ data, isPending: false, isError: false, refetch: vi.fn() });
vi.mock("@/hooks/useTokWorkforce", () => ({ workforceDb: () => ({ rpc: mocks.rpc, from: mocks.from }), useWorkforceRefresh: () => mocks.refresh, useWorkforceShifts: () => loaded([ownShift]), useWorkforceRows: (...args: unknown[]) => mocks.rows(...args) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "user-alice" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
const clients: QueryClient[] = [];
function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  return render(<QueryClientProvider client={client}><WorkforcePersonalExchanges restaurantId="restaurant-a" employeeId="alice" /></QueryClientProvider>);
}
async function chooseProposal() {
  await screen.findByRole("option", { name: "Bob Dupont" });
  fireEvent.change(screen.getByLabelText("Mon service"), { target: { value: "my-service" } });
  fireEvent.change(screen.getByLabelText("Collègue sollicité"), { target: { value: "bob" } });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.rows.mockReturnValue(loaded([]));
  mocks.rpc.mockImplementation(async (name: string) => name === "tok_workforce_team_directory" ? { data: [{ employee_id: "alice", display_name: "Alice Martin" }, { employee_id: "bob", display_name: "Bob Dupont" }], error: null } : name === "tok_workforce_exchange_candidates" ? { data: [candidate], error: null } : { data: null, error: null });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); });

describe("échanges personnels TOK", () => {
  it("charge les seuls services du collègue sélectionné et soumet un échange réciproque", async () => {
    const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: "new-exchange" }, error: null }) }) })); mocks.from.mockReturnValue({ insert });
    open(); await chooseProposal();
    fireEvent.change(screen.getByLabelText("Type de proposition"), { target: { value: "swap" } });
    await screen.findByRole("option", { name: /2026-11-03.*18:00–23:00/ });
    expect(mocks.rpc).toHaveBeenCalledWith("tok_workforce_exchange_candidates", expect.objectContaining({ p_restaurant_id: "restaurant-a", p_employee_id: "bob", p_start_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), p_end_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }));
    fireEvent.change(screen.getByLabelText("Service du collègue en retour"), { target: { value: "bobs-service" } });
    fireEvent.change(screen.getByLabelText("Message au collègue (facultatif)"), { target: { value: "Peux-tu échanger avec moi ?" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer la proposition" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(insert).toHaveBeenCalledExactlyOnceWith({ restaurant_id: "restaurant-a", requester_id: "alice", requester_shift_id: "my-service", target_employee_id: "bob", target_shift_id: "bobs-service", status: "pending", requester_message: "Peux-tu échanger avec moi ?" });
    expect(mocks.rows).toHaveBeenCalledWith("restaurant-a", "tok_workforce_exchanges", true, { employeeField: "requester_id", employeeId: "alice" });
    expect(mocks.rows).toHaveBeenCalledWith("restaurant-a", "tok_workforce_exchanges", true, { employeeField: "target_employee_id", employeeId: "alice" });
  });

  it("retire le service réciproque lors du retour à une reprise simple", async () => {
    const insert = vi.fn(() => ({ select: () => ({ single: async () => ({ data: { id: "new-exchange" }, error: null }) }) })); mocks.from.mockReturnValue({ insert });
    open(); await chooseProposal();
    fireEvent.change(screen.getByLabelText("Type de proposition"), { target: { value: "swap" } });
    await screen.findByRole("option", { name: /2026-11-03/ });
    fireEvent.change(screen.getByLabelText("Service du collègue en retour"), { target: { value: "bobs-service" } });
    fireEvent.change(screen.getByLabelText("Type de proposition"), { target: { value: "cover" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer la proposition" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ target_shift_id: null }));
    expect(screen.queryByLabelText("Service du collègue en retour")).not.toBeInTheDocument();
  });

  it("préserve les choix lorsque le serveur détecte un conflit de service", async () => {
    mocks.from.mockReturnValue({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "Le service est déjà proposé dans un autre échange." } }) }) }) });
    open(); await chooseProposal();
    fireEvent.change(screen.getByLabelText("Message au collègue (facultatif)"), { target: { value: "Merci" } });
    fireEvent.click(screen.getByRole("button", { name: "Envoyer la proposition" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("déjà proposé");
    expect(screen.getByLabelText("Mon service")).toHaveValue("my-service");
    expect(screen.getByLabelText("Message au collègue (facultatif)")).toHaveValue("Merci");
    expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("annule une proposition personnelle par la RPC protégée après confirmation", async () => {
    mocks.rows.mockImplementation((_restaurant: string, _table: string, _enabled: boolean, opts: { employeeField: string }) => loaded(opts.employeeField === "requester_id" ? [exchange] : []));
    vi.spyOn(window, "confirm").mockReturnValue(true); open();
    fireEvent.click(screen.getByRole("button", { name: "Annuler ma proposition" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("tok_workforce_cancel_exchange", { p_exchange_id: "exchange-a" }));
    expect(window.confirm).toHaveBeenCalledOnce();
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.from).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Accepter", exact: true })).not.toBeInTheDocument();
  });

  it("montre l’horaire reçu avant de permettre l’accord du collègue", async () => {
    const received = { ...exchange, requester_id: "bob", target_employee_id: "alice", requester_shift_id: "bobs-service", target_shift_id: "my-service" };
    mocks.rows.mockImplementation((_restaurant: string, _table: string, _enabled: boolean, opts: { employeeField: string }) => loaded(opts.employeeField === "target_employee_id" ? [received] : []));
    open();
    expect(screen.getByRole("button", { name: "Accepter", exact: true })).toBeDisabled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Accepter", exact: true })).toBeEnabled());
    expect(screen.getByText(/Échange réciproque.*2026-11-03.*18:00–23:00/)).toBeInTheDocument();
    expect(screen.getByText(/En retour.*2026-11-01.*09:00–17:00/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Accepter", exact: true }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("tok_workforce_respond_exchange", { p_exchange_id: "exchange-a", p_accept: true }));
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("permet au collègue de confirmer à nouveau un accord historique sans acteur", async () => {
    const received = { ...exchange, requester_id: "bob", target_employee_id: "alice", requester_shift_id: "bobs-service", target_shift_id: "my-service", target_accepted_at: "2026-10-20T10:00:00Z", target_accepted_by: null };
    mocks.rows.mockImplementation((_restaurant: string, _table: string, _enabled: boolean, opts: { employeeField: string }) => loaded(opts.employeeField === "target_employee_id" ? [received] : []));
    open();
    expect(screen.getByText(/Accord historique : une nouvelle confirmation/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Accepter", exact: true })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Accepter", exact: true }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("tok_workforce_respond_exchange", { p_exchange_id: "exchange-a", p_accept: true }));
  });
});
