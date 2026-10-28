import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WorkforceEmployees from "@/components/workforce/WorkforceEmployees";
import type { WorkforceEmployee, WorkforceInvitation } from "@/lib/tokWorkforce";

const mocks = vi.hoisted(() => ({
  employees: [] as WorkforceEmployee[],
  invitations: [] as WorkforceInvitation[],
  invitationError: false,
  from: vi.fn(), rpc: vi.fn(), toast: vi.fn(), refresh: vi.fn(), refetch: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({ from: mocks.from, rpc: mocks.rpc }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/useTokWorkforce", async importOriginal => {
  const actual = await importOriginal<typeof import("@/hooks/useTokWorkforce")>();
  return {
    ...actual,
    useWorkforceEmployees: () => ({ data: mocks.employees, isPending: false, isError: false, isFetching: false, refetch: mocks.refetch }),
    useWorkforceInvitations: () => ({ data: mocks.invitations, isPending: false, isError: mocks.invitationError, isFetching: false, refetch: mocks.refetch }),
    useWorkforceRefresh: () => mocks.refresh,
  };
});

const baseEmployee: WorkforceEmployee = {
  id: "employee-1", restaurant_id: "restaurant-1", first_name: "Alice", last_name: "Martin",
  email: null, user_id: null, role: "employee", contracted_hours_per_week: 42,
  vacation_days_per_year: 20, hourly_cost_chf: 0, is_active: true,
};
const invitation = (changes: Partial<WorkforceInvitation> = {}): WorkforceInvitation => ({
  invitation_id: "invitation-1", employee_id: baseEmployee.id, email: "alice@example.ch",
  invited_at: new Date().toISOString(), expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
  accepted_at: null, revoked_at: null, delivery_status: "sent", provider_status: null, sent_at: new Date().toISOString(),
  ...changes,
});
const clients: QueryClient[] = [];
function renderEmployees() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  return render(<QueryClientProvider client={client}><WorkforceEmployees restaurantId="restaurant-1" /></QueryClientProvider>);
}
function fillNewEmployee() {
  fireEvent.change(screen.getByLabelText("Prénom"), { target: { value: "Alice" } });
  fireEvent.change(screen.getByLabelText("Nom"), { target: { value: "Martin" } });
  fireEvent.change(screen.getByLabelText(/E-mail/), { target: { value: "alice@example.ch" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  });
  mocks.employees = [{ ...baseEmployee }];
  mocks.invitations = [];
  mocks.invitationError = false;
  mocks.rpc.mockImplementation(async (name: string, args: { p_employee_id: string; p_email?: string }) => {
    if (name === "tok_workforce_invite_employee") {
      const queued = invitation({ employee_id: args.p_employee_id, email: args.p_email || "alice@example.ch", delivery_status: "queued", sent_at: null });
      mocks.invitations = [queued];
      return { data: { ...queued, reused: false }, error: null };
    }
    return { data: null, error: null };
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach(client => client.clear());
  vi.unstubAllGlobals();
});

describe("TOK Équipe — invitations depuis la fiche", () => {
  it("invite une fiche sans email avec l’adresse saisie et affiche le vrai état programmé", async () => {
    renderEmployees();
    fireEvent.click(screen.getByRole("button", { name: "Inviter Alice Martin" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Adresse e-mail de l’employé"), { target: { value: "Alice@Example.CH" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Envoyer l’invitation" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("tok_workforce_invite_employee", {
      p_restaurant_id: "restaurant-1", p_employee_id: "employee-1", p_email: "alice@example.ch",
    }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Invitation programmée" }));
    expect(screen.getByText("Invitation programmée")).toBeInTheDocument();
    expect(screen.queryByText("Invitation envoyée")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Renvoyer l’invitation à Alice Martin" })).toBeDisabled();
  });

  it("conserve l’adresse et le dialogue après un refus serveur pour permettre une reprise", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "Envoi indisponible. Réessayez." } });
    renderEmployees();
    fireEvent.click(screen.getByRole("button", { name: "Inviter Alice Martin" }));
    fireEvent.change(screen.getByLabelText("Adresse e-mail de l’employé"), { target: { value: "nouvelle@example.ch" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Envoyer l’invitation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Envoi indisponible");
    expect(screen.getByLabelText("Adresse e-mail de l’employé")).toHaveValue("nouvelle@example.ch");
    expect(mocks.toast).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Envoyer l’invitation" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("ne prend pas une réponse RPC incomplète pour une invitation envoyée", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: { error: "Livraison refusée" }, error: null });
    renderEmployees();
    fireEvent.click(screen.getByRole("button", { name: "Inviter Alice Martin" }));
    fireEvent.change(screen.getByLabelText("Adresse e-mail de l’employé"), { target: { value: "alice@example.ch" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Envoyer l’invitation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("n’a pas été confirmé");
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("réinitialise la création après une invitation échouée et permet un renvoi sans doublon", async () => {
    mocks.employees = [];
    const insert = vi.fn().mockImplementation(() => ({
      select: () => ({
        single: async () => {
          const employee = { ...baseEmployee, email: "alice@example.ch" };
          mocks.employees = [employee];
          return { data: employee, error: null };
        },
      }),
    }));
    mocks.from.mockReturnValue({ insert });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "File indisponible" } });
    renderEmployees();
    fillNewEmployee();
    fireEvent.click(screen.getByRole("checkbox", { name: "Envoyer une invitation après l’ajout" }));
    fireEvent.submit(screen.getByRole("form", { name: "Ajouter un collaborateur" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Collaborateur ajouté, invitation à renvoyer",
    })));
    expect(screen.getByLabelText("Prénom")).toHaveValue("");
    expect(screen.getByLabelText("Nom")).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: "Envoyer une invitation après l’ajout" })).not.toBeChecked();
    expect(insert).toHaveBeenCalledTimes(1);
    fireEvent.submit(screen.getByRole("form", { name: "Ajouter un collaborateur" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Enregistrement impossible" })));
    expect(insert).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Inviter Alice Martin" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Envoyer l’invitation" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(insert).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("préserve l’ajout sans invitation et n’appelle pas la fonction d’envoi", async () => {
    const insert = vi.fn().mockReturnValue({ select: () => ({ single: async () => ({ data: baseEmployee, error: null }) }) });
    mocks.from.mockReturnValue({ insert });
    renderEmployees();
    fillNewEmployee();
    fireEvent.submit(screen.getByRole("form", { name: "Ajouter un collaborateur" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({ title: "Collaborateur ajouté" }));
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ started_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), ended_on: null, vacation_days_per_year: 20 }));
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("refuse un début de contrat effacé avant tout enregistrement", async () => {
    renderEmployees(); fillNewEmployee();
    fireEvent.change(screen.getByLabelText("Début du contrat"), { target: { value: "" } });
    fireEvent.submit(screen.getByRole("form", { name: "Ajouter un collaborateur" }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Enregistrement impossible", description: expect.stringContaining("date de début est requise") })));
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("confirme la révocation d’une invitation en attente via la RPC du restaurant", async () => {
    mocks.invitations = [invitation()];
    renderEmployees();
    fireEvent.click(screen.getByRole("button", { name: "Annuler l’invitation de Alice Martin" }));
    expect(mocks.rpc).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Annuler l’invitation" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("tok_workforce_revoke_invitation", {
      p_restaurant_id: "restaurant-1", p_employee_id: "employee-1",
    }));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Invitation annulée" })));
  });

  it("bloque l’invitation pour les comptes liés ou les collaborateurs inactifs", () => {
    mocks.employees = [
      { ...baseEmployee, user_id: "user-1" },
      { ...baseEmployee, id: "employee-2", first_name: "Bob", is_active: false },
    ];
    renderEmployees();
    expect(screen.getByRole("button", { name: "Inviter Alice Martin" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Inviter Bob Martin" })).toBeDisabled();
    expect(screen.getByText("Accès suspendu")).toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("affiche les invitations annulées et expirées avec une action de renvoi", () => {
    mocks.employees = [{ ...baseEmployee }, { ...baseEmployee, id: "employee-2", first_name: "Bob" }];
    mocks.invitations = [
      invitation({ revoked_at: new Date().toISOString(), delivery_status: "cancelled" }),
      invitation({ invitation_id: "invitation-2", employee_id: "employee-2", expires_at: "2020-01-01T00:00:00Z" }),
    ];
    renderEmployees();
    expect(screen.getByText("Invitation annulée")).toBeInTheDocument();
    expect(screen.getByText("Invitation expirée")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Renvoyer l’invitation à Alice Martin" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Renvoyer l’invitation à Bob Martin" })).toBeEnabled();
  });

  it("affiche un état explicite pour une invitation dont le suivi d’envoi a été purgé", () => {
    mocks.invitations = [invitation({ delivery_status: "unknown", sent_at: null })];
    renderEmployees();
    expect(screen.getByText("Suivi indisponible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Renvoyer l’invitation à Alice Martin" })).toBeEnabled();
    expect(screen.queryByText("Invitation envoyée")).not.toBeInTheDocument();
  });

  it("n’assimile pas un suivi indisponible à une absence d’invitation", () => {
    mocks.invitationError = true;
    renderEmployees();
    expect(screen.getByRole("alert")).toHaveTextContent("suivi des invitations est indisponible");
    expect(screen.getByText("Suivi indisponible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Inviter Alice Martin" })).toBeDisabled();
    expect(screen.queryByText("Accès non activé")).not.toBeInTheDocument();
  });

  it("modifie une fiche et son contrat sans envoyer d’invitation ni changer son compte", async () => {
    mocks.employees = [{ ...baseEmployee, updated_at: "2026-10-01T10:00:00Z" }];
    const filters: unknown[][] = [];
    const query = { eq: vi.fn((...args: unknown[]) => { filters.push(args); return query; }), select: vi.fn(() => query), single: vi.fn(async () => ({ data: { id: baseEmployee.id }, error: null })) };
    const update = vi.fn(() => query);
    mocks.from.mockReturnValue({ update });
    renderEmployees();
    fireEvent.click(screen.getByRole("button", { name: "Modifier la fiche de Alice Martin" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("Prénom"), { target: { value: "Alicia" } });
    fireEvent.change(dialog.getByLabelText("Heures contractuelles par semaine"), { target: { value: "35" } });
    fireEvent.change(dialog.getByLabelText("Vacances annuelles (jours)"), { target: { value: "25" } });
    fireEvent.change(dialog.getByLabelText("Début du contrat"), { target: { value: "2026-01-01" } });
    fireEvent.change(dialog.getByLabelText("Fin du contrat"), { target: { value: "2026-12-31" } });
    fireEvent.submit(dialog.getByRole("form", { name: "Modifier le collaborateur" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ first_name: "Alicia", contracted_hours_per_week: 35, vacation_days_per_year: 25, started_on: "2026-01-01", ended_on: "2026-12-31" }));
    expect(update.mock.calls[0][0]).not.toHaveProperty("user_id");
    expect(filters).toEqual([["restaurant_id", "restaurant-1"], ["id", "employee-1"], ["updated_at", "2026-10-01T10:00:00Z"]]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("conserve la modification refusée et ne confirme aucun succès", async () => {
    const query = { eq: vi.fn(() => query), select: vi.fn(() => query), single: vi.fn(async () => ({ data: null, error: { message: "Version modifiée" } })) };
    mocks.from.mockReturnValue({ update: () => query });
    renderEmployees();
    fireEvent.click(screen.getByRole("button", { name: "Modifier la fiche de Alice Martin" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("Prénom"), { target: { value: "Alicia" } });
    fireEvent.submit(dialog.getByRole("form", { name: "Modifier le collaborateur" }));
    expect(await dialog.findByRole("alert")).toHaveTextContent("Version modifiée");
    expect(dialog.getByLabelText("Prénom")).toHaveValue("Alicia");
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});
