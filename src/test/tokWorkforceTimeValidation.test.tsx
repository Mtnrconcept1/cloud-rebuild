import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import WorkforceTime from "@/components/workforce/WorkforceTime";
import type { WorkforceEmployee, WorkforceEntry, WorkforceValidation } from "@/lib/tokWorkforce";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), refresh: vi.fn(), toast: vi.fn(), entries: vi.fn(), validations: vi.fn(), clock: vi.fn() }));
const employees: WorkforceEmployee[] = [{ id: "alice", restaurant_id: "restaurant-a", first_name: "Alice", last_name: "Martin", email: null, user_id: "user-a", role: "employee", contracted_hours_per_week: 42, vacation_days_per_year: 20, hourly_cost_chf: 30, is_active: true }];
const entry = (id: string, version: number, overrides: Partial<WorkforceEntry> = {}): WorkforceEntry => ({ id, restaurant_id: "restaurant-a", employee_id: "alice", entry_date: "2026-10-20", start_time: "09:00:00", end_time: "17:00:00", break_minutes: 30, notes: null, is_night_work: false, is_sunday_work: false, version, ...overrides });
const entries = [entry("first", 3), entry("second", 7, { entry_date: "2026-10-21", start_time: "10:00:00", end_time: "18:00:00", break_minutes: 60 }), entry("already-signed", 2)];
const validation: WorkforceValidation = { id: "validation-a", restaurant_id: "restaurant-a", time_entry_id: "already-signed", signed_name: "Responsable précédent", signed_at: "2026-10-22T10:00:00Z", signature_data: "data:image/png;base64,aGlzdG9yeQ==", entry_version: 2, entry_snapshot: { entry_date: "2026-10-20", start_time: "08:30:00", end_time: "17:15:00", break_minutes: 45 }, entry_hash: "a".repeat(64) };
const loaded = <T,>(data: T[]) => ({ data, isPending: false, isError: false, refetch: vi.fn() });
vi.mock("@/hooks/useTokWorkforce", () => ({ workforceDb: () => ({ rpc: mocks.rpc, from: mocks.from }), useWorkforceRefresh: () => mocks.refresh, useWorkforceEmployees: () => loaded(employees), useWorkforceEntriesInRange: (...args: unknown[]) => mocks.entries(...args), useWorkforceValidations: (...args: unknown[]) => mocks.validations(...args), useWorkforceClockSessionsInRange: (...args: unknown[]) => mocks.clock(...args) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "manager-a" } }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
// Canvas rendering is unavailable in jsdom; keep the signing workflow and RPC real.
vi.mock("@/components/workforce/WorkforceSignaturePad", () => ({ default: ({ onChange, disabled }: { onChange: (signature: string) => void; disabled: boolean }) => <button disabled={disabled} type="button" onClick={() => onChange("data:image/png;base64,c2lnbmF0dXJl")}>Dessiner une signature</button> }));
const clients: QueryClient[] = [];
function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  return render(<QueryClientProvider client={client}><WorkforceTime restaurantId="restaurant-a" /></QueryClientProvider>);
}
function signSelection() {
  fireEvent.click(screen.getByRole("checkbox", { name: "Sélectionner les relevés en attente" }));
  fireEvent.click(screen.getByRole("button", { name: "Signer la sélection (2)" }));
  fireEvent.change(screen.getByLabelText("Nom complet du responsable"), { target: { value: "  Marie Responsable  " } });
  fireEvent.click(screen.getByRole("button", { name: "Dessiner une signature" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmer la validation" }));
}
beforeEach(() => { vi.clearAllMocks(); mocks.entries.mockReturnValue(loaded(entries)); mocks.validations.mockReturnValue(loaded([validation])); mocks.clock.mockReturnValue(loaded([])); });
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); });

describe("validation groupée des relevés TOK", () => {
  it("associe la même signature aux deux relevés non signés et transmet leur version sélectionnée", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ time_entry_id: "first" }, { time_entry_id: "second" }], error: null });
    open();
    expect(screen.queryByRole("button", { name: "Voir la signature" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Sélectionner les relevés en attente" }));
    fireEvent.click(screen.getByRole("button", { name: "Signer la sélection (2)" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Total : 14.50 h")).toBeInTheDocument();
    expect(within(dialog).getAllByRole("row")).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("Nom complet du responsable"), { target: { value: "Marie Responsable" } });
    fireEvent.click(screen.getByRole("button", { name: "Dessiner une signature" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmer la validation" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.rpc).toHaveBeenCalledWith("tok_workforce_validate_entries", { p_restaurant_id: "restaurant-a", p_entry_ids: ["first", "second"], p_signed_name: "Marie Responsable", p_signature_data: "data:image/png;base64,c2lnbmF0dXJl", p_expected_versions: { first: 3, second: 7 } });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each([
    { data: null, error: { message: "Le relevé a été modifié. Actualisez avant de signer." }, expected: "Le relevé a été modifié" },
    { data: [{ time_entry_id: "first" }], error: null, expected: "La validation n’a pas pu être confirmée" },
  ])("conserve la saisie si le serveur refuse ou ne confirme pas toute la sélection ($expected)", async ({ data, error, expected }) => {
    mocks.rpc.mockResolvedValue({ data, error }); open(); signSelection();
    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
    expect(screen.getByLabelText("Nom complet du responsable")).toHaveValue("  Marie Responsable  ");
    expect(screen.getByRole("dialog")).toHaveTextContent("Total : 14.50 h");
    expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("affiche le contenu historique signé, sa version et la signature enregistrée", () => {
    open(); fireEvent.change(screen.getByLabelText("État des relevés"), { target: { value: "validated" } });
    fireEvent.click(screen.getByRole("button", { name: "Voir la signature" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("img", { name: "Signature manuscrite de Responsable précédent" })).toHaveAttribute("src", validation.signature_data);
    expect(dialog).toHaveTextContent("08:30–17:15 · pause 45 min");
    expect(dialog).toHaveTextContent("Version 2");
    expect(dialog).toHaveTextContent(validation.entry_hash!);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("réinitialise la sélection et borne les deux lectures au mois et au collaborateur", () => {
    open(); fireEvent.click(screen.getByRole("checkbox", { name: "Sélectionner les relevés en attente" }));
    fireEvent.change(screen.getByLabelText("Mois des relevés"), { target: { value: "2026-02" } });
    fireEvent.change(screen.getByLabelText("Filtrer par collaborateur"), { target: { value: "alice" } });
    expect(mocks.entries).toHaveBeenLastCalledWith("restaurant-a", true, "2026-02-01", "2026-02-28", "alice");
    expect(mocks.validations).toHaveBeenLastCalledWith("restaurant-a", true, "2026-02-01", "2026-02-28", "alice");
    expect(mocks.clock).toHaveBeenLastCalledWith("restaurant-a", true, "2026-02-01", "2026-02-28", "alice");
    expect(screen.getByRole("button", { name: "Signer la sélection (0)" })).toBeDisabled();
  });

  it("supprime seulement un relevé non signé après confirmation avec son restaurant et sa version", async () => {
    const query = { eq: vi.fn(() => query), select: vi.fn(() => query), single: vi.fn(async () => ({ data: { id: "first" }, error: null })) };
    const remove = vi.fn(() => query); mocks.from.mockReturnValue({ delete: remove });
    const confirmation = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    open(); fireEvent.change(screen.getByLabelText("État des relevés"), { target: { value: "all" } });
    expect(screen.getAllByRole("button", { name: /^Supprimer le relevé/ })).toHaveLength(2);
    const button = screen.getByRole("button", { name: "Supprimer le relevé de Alice Martin du 2026-10-20 à 09:00" });
    fireEvent.click(button); expect(mocks.from).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(confirmation).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledOnce();
    expect(query.eq.mock.calls).toEqual([["restaurant_id", "restaurant-a"], ["id", "first"], ["version", 3]]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { data: null, error: null, message: "suppression n’a pas pu être confirmée" },
    { data: null, error: { code: "55000", message: "Ce relevé est signé." }, message: "Ce relevé est signé" },
  ])("ne confirme pas une suppression sans résultat ou refusée par le verrou de signature ($message)", async ({ data, error, message }) => {
    const query = { eq: vi.fn(() => query), select: vi.fn(() => query), single: vi.fn(async () => ({ data, error })) };
    mocks.from.mockReturnValue({ delete: () => query }); vi.spyOn(window, "confirm").mockReturnValue(true); open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Sélectionner Alice Martin le 2026-10-20 à 09:00" }));
    fireEvent.click(screen.getByRole("button", { name: "Supprimer le relevé de Alice Martin du 2026-10-20 à 09:00" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByRole("button", { name: "Signer la sélection (1)" })).toBeEnabled();
    expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.toast).not.toHaveBeenCalled();
  });

  it("utilise la durée réelle de la nuit de changement d’heure dans le total à signer", () => {
    mocks.entries.mockReturnValue(loaded([entry("dst", 1, { entry_date: "2026-10-25", start_time: "01:00:00", end_time: "04:00:00" })]));
    mocks.validations.mockReturnValue(loaded([])); open();
    expect(screen.getByText(/2026-10-25.*3,5 h/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Sélectionner les relevés en attente" }));
    fireEvent.click(screen.getByRole("button", { name: "Signer la sélection (1)" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Total : 3.50 h");
  });

  it("bloque la signature d’un horaire local ambigu et demande une régularisation", () => {
    mocks.entries.mockReturnValue(loaded([entry("ambiguous", 1, { entry_date: "2026-10-25", start_time: "02:30:00", end_time: "04:30:00" })]));
    mocks.validations.mockReturnValue(loaded([])); open();
    expect(screen.getByRole("alert")).toHaveTextContent("Heure locale ambiguë");
    expect(screen.getByRole("checkbox", { name: "Sélectionner les relevés en attente" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Sélectionner Alice Martin le 2026-10-25 à 02:30" })).toBeDisabled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("résout l’heure répétée grâce aux horodatages de badgeuse correspondants", () => {
    mocks.entries.mockReturnValue(loaded([entry("clock-dst", 1, { entry_date: "2026-10-25", start_time: "02:30:00", end_time: "04:30:00" })]));
    mocks.validations.mockReturnValue(loaded([]));
    mocks.clock.mockReturnValue(loaded([{ restaurant_id: "restaurant-a", employee_id: "alice", entry_id: "clock-dst", clock_in_at: "2026-10-25T00:30:00Z", clock_out_at: "2026-10-25T03:30:00Z", break_seconds: 1800 }]));
    open();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Sélectionner les relevés en attente" }));
    fireEvent.click(screen.getByRole("button", { name: "Signer la sélection (1)" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Total : 2.50 h");
  });

  it("ne marque pas une ancienne preuve invérifiable comme validée et garde le relevé verrouillé", () => {
    mocks.entries.mockReturnValue(loaded([entry("legacy", 1, { updated_at: "2026-10-23T09:00:00Z" })]));
    mocks.validations.mockReturnValue(loaded([{ ...validation, time_entry_id: "legacy", entry_version: null, entry_snapshot: null, entry_hash: null }]));
    open();
    expect(screen.getByRole("alert")).toHaveTextContent("sa correspondance avec la version actuelle du relevé n’est pas vérifiable");
    expect(screen.getByText("Preuve historique à vérifier")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Sélectionner les relevés en attente" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /^Supprimer le relevé/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Voir la signature" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("État des relevés"), { target: { value: "validated" } });
    expect(screen.getByText("Aucun relevé pour ces filtres.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("État des relevés"), { target: { value: "all" } });
    fireEvent.click(screen.getByRole("button", { name: "Consulter la preuve historique" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Cette ancienne validation ne contient pas de copie des horaires signés");
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
