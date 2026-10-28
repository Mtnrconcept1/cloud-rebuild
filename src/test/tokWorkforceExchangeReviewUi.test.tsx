import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WorkforceExchanges from "@/components/workforce/WorkforceExchanges";
import type { WorkforceExchange } from "@/lib/tokWorkforce";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), refresh: vi.fn(), toast: vi.fn(), exchanges: [] as WorkforceExchange[] }));
vi.mock("@/hooks/useTokWorkforce", () => ({
  workforceDb: () => ({ rpc: mocks.rpc, from: mocks.from }), useWorkforceRefresh: () => mocks.refresh,
  useWorkforceEmployees: () => ({ data: [{ id: "alice", first_name: "Alice", last_name: "Martin", is_active: true }, { id: "bob", first_name: "Bob", last_name: "Dupont", is_active: true }], isPending: false, isError: false }),
  useWorkforceShifts: () => ({ data: [{ id: "shift-a", employee_id: "alice", shift_date: "2026-11-03", start_time: "09:00", end_time: "17:00", status: "planned" }, { id: "shift-b", employee_id: "bob", shift_date: "2026-11-04", start_time: "18:00", end_time: "23:00", status: "confirmed" }], isPending: false, isError: false }),
  useWorkforceExchanges: () => ({ data: mocks.exchanges, isPending: false, isError: false }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
const clients: QueryClient[] = [];
function open() { const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } }); clients.push(client); render(<QueryClientProvider client={client}><WorkforceExchanges restaurantId="restaurant-a" /></QueryClientProvider>); }
beforeEach(() => {
  vi.clearAllMocks();
  mocks.exchanges = [{ id: "exchange-a", restaurant_id: "restaurant-a", requester_id: "alice", requester_shift_id: "shift-a", target_employee_id: "bob", target_shift_id: "shift-b", status: "pending", target_accepted_at: "2026-10-28T10:00:00Z", target_accepted_by: "user-bob" }];
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

describe("décision commentée d’échange TOK", () => {
  it("fait valider les deux services et le commentaire dans la même RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null }); open();
    fireEvent.click(screen.getByRole("button", { name: "Valider et déplacer" }));
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent("2026-11-03 09:00–17:00");
    expect(screen.getByRole("dialog")).toHaveTextContent("2026-11-04 18:00–23:00");
    fireEvent.change(screen.getByLabelText("Commentaire de décision (facultatif)"), { target: { value: "  Les deux disponibilités sont vérifiées.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la décision" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("tok_workforce_review_exchange", { p_exchange_id: "exchange-a", p_approve: true, p_manager_notes: "Les deux disponibilités sont vérifiées." });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(mocks.from).not.toHaveBeenCalled();
  });

  it("permet un refus commenté sans accord préalable du collègue", async () => {
    mocks.exchanges[0].target_accepted_at = null; mocks.rpc.mockResolvedValue({ data: null, error: null }); open();
    expect(screen.getByRole("button", { name: "Valider et déplacer" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Refuser", exact: true }));
    fireEvent.change(screen.getByLabelText("Commentaire de décision (facultatif)"), { target: { value: "Couverture insuffisante" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la décision" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("tok_workforce_review_exchange", { p_exchange_id: "exchange-a", p_approve: false, p_manager_notes: "Couverture insuffisante" }));
  });

  it("conserve le commentaire et la décision si les services ont changé", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "Le service a été modifié depuis la proposition." } }); open();
    fireEvent.click(screen.getByRole("button", { name: "Valider et déplacer" }));
    fireEvent.change(screen.getByLabelText("Commentaire de décision (facultatif)"), { target: { value: "Disponibilité vérifiée" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la décision" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("modifié depuis la proposition");
    expect(screen.getByLabelText("Commentaire de décision (facultatif)")).toHaveValue("Disponibilité vérifiée");
    expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("bloque l’approbation d’un ancien accord dépourvu d’acteur authentifié", () => {
    mocks.exchanges[0].target_accepted_by = null; open();
    expect(screen.getByText(/L’ancien accord doit être confirmé à nouveau/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Valider et déplacer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Refuser", exact: true })).toBeEnabled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
