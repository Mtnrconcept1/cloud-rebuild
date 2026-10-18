import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyWorkforce from "@/pages/workforce/MyWorkforce";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  toast: vi.fn(),
  signOut: vi.fn(),
  user: null as null | { id: string; email: string; email_confirmed_at?: string },
}));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: mocks.user, signOut: mocks.signOut }),
}));
vi.mock("@/hooks/useTokWorkforce", () => ({
  workforceDb: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/components/dashboard/DashboardPageHero", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/workforce/WorkforcePersonal", () => ({
  default: ({ restaurantId, employeeId }: { restaurantId: string; employeeId: string }) =>
    <section aria-label="Espace personnel">{restaurantId} / {employeeId}</section>,
}));

const restaurantOne = "10000000-0000-4000-8000-000000000001";
const restaurantTwo = "10000000-0000-4000-8000-000000000002";
const employeeOne = "20000000-0000-4000-8000-000000000001";
const employeeTwo = "20000000-0000-4000-8000-000000000002";
const invitationRoute = "/equipe/mon-espace?restaurant=" + restaurantOne;
type Member = { restaurant_id: string; employee_id: string; restaurant_name: string; linked: boolean };
let memberships: Member[];
let membershipError: Error | null;
let profileError: Error | null;
let claimError: Error | null;
let claimResponseOverride: unknown;
const clients: QueryClient[] = [];
const filtersRead: Record<string, string>[] = [];

const member = (restaurantId: string, linked = false): Member => ({
  restaurant_id: restaurantId,
  employee_id: restaurantId === restaurantOne ? employeeOne : employeeTwo,
  restaurant_name: restaurantId === restaurantOne ? "Restaurant invité" : "Autre restaurant",
  linked,
});

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Adresse actuelle">{location.pathname + location.search}</output>;
}

function renderPortal(route = invitationRoute) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  clients.push(client);
  const invalidation = vi.spyOn(client, "invalidateQueries");
  render(<QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[route]}>
      <LocationProbe />
      <Routes>
        <Route path="/equipe/mon-espace" element={<MyWorkforce />} />
        <Route path="/auth" element={<p>Connexion avec un autre compte</p>} />
      </Routes>
    </MemoryRouter>
  </QueryClientProvider>);
  return { client, invalidation };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: "current-user", email: "alice@example.test", email_confirmed_at: "2026-10-18T12:00:00Z" };
  mocks.signOut.mockResolvedValue(undefined);
  memberships = [];
  membershipError = null;
  profileError = null;
  claimError = null;
  claimResponseOverride = undefined;
  filtersRead.length = 0;
  mocks.rpc.mockImplementation(async (name: string, args?: { p_restaurant_id: string }) => {
    if (name === "tok_workforce_my_restaurants") {
      return { data: membershipError ? null : memberships.map((entry) => ({ ...entry })), error: membershipError };
    }
    if (name === "tok_workforce_claim_employee") {
      if (claimError) return { data: null, error: claimError };
      const invited = memberships.find((entry) => entry.restaurant_id === args?.p_restaurant_id);
      if (claimResponseOverride !== undefined) return { data: claimResponseOverride, error: null };
      if (!invited) return { data: null, error: new Error("Invitation indisponible") };
      invited.linked = true;
      return { data: invited.employee_id, error: null };
    }
    throw new Error("Unexpected RPC: " + name);
  });
  mocks.from.mockImplementation(() => {
    const filters: Record<string, string> = {};
    filtersRead.push(filters);
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((key: string, value: string) => { filters[key] = value; return query; }),
      single: vi.fn(async () => ({
        data: profileError ? null : {
          id: filters.id, restaurant_id: filters.restaurant_id, first_name: "Alice", last_name: "Test",
          role: "employee", contracted_hours_per_week: 40, vacation_days_per_year: 25,
        },
        error: profileError,
      })),
    };
    return query;
  });
});

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
});

describe("employee invitation portal", () => {
  it("accepts the restaurant named by the invitation and refreshes effective access", async () => {
    memberships = [member(restaurantTwo, true), member(restaurantOne)];
    const { invalidation } = renderPortal();
    expect(await screen.findByRole("heading", { name: "Accepter mon invitation" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Espace personnel" })).not.toBeInTheDocument();
    expect(screen.getByText("alice@example.test")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Associer mon compte TOK" }));
    const personal = await screen.findByRole("region", { name: "Espace personnel" });
    expect(personal).toHaveTextContent(restaurantOne);
    expect(personal).toHaveTextContent(employeeOne);
    expect(mocks.rpc).toHaveBeenCalledWith("tok_workforce_claim_employee", { p_restaurant_id: restaurantOne });
    expect(filtersRead).toContainEqual({ id: employeeOne, restaurant_id: restaurantOne, user_id: "current-user" });
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ["workforce-memberships", "current-user"] });
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ["workforce-self-profile", "current-user"] });
    expect(invalidation).toHaveBeenCalledWith({ queryKey: ["tok-workforce"] });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({ title: "Compte associé à votre établissement" }));
  });

  it("never falls back to another restaurant until the employee explicitly chooses it", async () => {
    memberships = [member(restaurantTwo, true)];
    renderPortal();
    expect(await screen.findByRole("heading", { name: "Invitation indisponible pour ce compte" })).toBeInTheDocument();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Associer mon compte TOK" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Espace personnel" })).not.toBeInTheDocument();
    const chooser = screen.getByRole("combobox", { name: "Choisir l’établissement" });
    expect(chooser).toHaveValue("");
    fireEvent.change(chooser, { target: { value: restaurantTwo } });
    expect(await screen.findByRole("region", { name: "Espace personnel" })).toHaveTextContent(restaurantTwo);
    expect(screen.getByLabelText("Adresse actuelle")).toHaveTextContent("?restaurant=" + restaurantTwo);
  });

  it.each([
    "?restaurant=invalid",
    "?restaurant=",
    "?restaurant=" + restaurantOne + "&restaurant=" + restaurantTwo,
    "?restaurant=" + restaurantOne + "&next=/admin",
  ])("refuses a malformed link without selecting an existing membership: %s", async (search) => {
    memberships = [member(restaurantTwo, true)];
    renderPortal("/equipe/mon-espace" + search);
    expect(await screen.findByRole("heading", { name: "Lien d’invitation invalide" })).toBeInTheDocument();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Espace personnel" })).not.toBeInTheDocument();
  });

  it("explains missing, expired, cancelled or differently addressed invitations", async () => {
    renderPortal();
    expect(await screen.findByRole("heading", { name: "Invitation indisponible pour ce compte" })).toBeInTheDocument();
    expect(screen.getByText(/inexistante, expirée, annulée ou envoyée à une autre adresse/)).toBeInTheDocument();
    expect(screen.getByText("alice@example.test")).toBeInTheDocument();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("allows a server-confirmed invitation even when the local confirmation field is stale", async () => {
    mocks.user = { id: "current-user", email: "alice@example.test" };
    memberships = [member(restaurantOne)];
    renderPortal();
    const accept = await screen.findByRole("button", { name: "Associer mon compte TOK" });
    expect(accept).toBeEnabled();
    fireEvent.click(accept);
    expect(await screen.findByRole("region", { name: "Espace personnel" })).toHaveTextContent(restaurantOne);
  });

  it.each([null, "", employeeTwo, { employee_id: employeeOne }])("never announces a successful claim for a malformed or wrong result: %j", async (result) => {
    memberships = [member(restaurantOne)];
    claimResponseOverride = result;
    renderPortal();
    fireEvent.click(await screen.findByRole("button", { name: "Associer mon compte TOK" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("L’invitation n’a pas été acceptée");
    expect(screen.queryByRole("region", { name: "Espace personnel" })).not.toBeInTheDocument();
    expect(mocks.toast).not.toHaveBeenCalledWith({ title: "Compte associé à votre établissement" });
  });

  it("does not expose the personal interface when the server rejects acceptance", async () => {
    memberships = [member(restaurantOne)];
    claimError = new Error("Adresse non confirmée ou invitation expirée");
    renderPortal();
    fireEvent.click(await screen.findByRole("button", { name: "Associer mon compte TOK" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("L’invitation n’a pas été acceptée");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("can recover from a rights lookup failure through the refresh button", async () => {
    membershipError = new Error("offline");
    renderPortal();
    expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de vérifier vos droits");
    membershipError = null;
    memberships = [member(restaurantOne)];
    fireEvent.click(screen.getByRole("button", { name: "Actualiser mes accès" }));
    expect(await screen.findByRole("heading", { name: "Accepter mon invitation" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Espace personnel" })).not.toBeInTheDocument();
  });

  it("hides cached personal access if profile revalidation fails", async () => {
    memberships = [member(restaurantOne, true)];
    const { client } = renderPortal();
    expect(await screen.findByRole("region", { name: "Espace personnel" })).toBeInTheDocument();
    profileError = new Error("Access revoked");
    await act(async () => { await client.invalidateQueries({ queryKey: ["workforce-self-profile"] }); });
    expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de charger votre profil employé");
    expect(screen.queryByRole("region", { name: "Espace personnel" })).not.toBeInTheDocument();
  });

  it("waits for sign-out and preserves the invitation when changing accounts", async () => {
    let finishSignOut: () => void = () => {};
    mocks.signOut.mockImplementation(() => new Promise<void>((resolve) => { finishSignOut = resolve; }));
    renderPortal();
    await screen.findByRole("heading", { name: "Invitation indisponible pour ce compte" });
    fireEvent.click(screen.getByRole("button", { name: "Changer de compte" }));
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Connexion avec un autre compte")).not.toBeInTheDocument();
    await act(async () => { mocks.user = null; finishSignOut(); });
    expect(await screen.findByText("Connexion avec un autre compte")).toBeInTheDocument();
    const destination = new URL(screen.getByLabelText("Adresse actuelle").textContent!, "https://www.thetok.ch");
    expect(destination.pathname).toBe("/auth");
    expect(destination.searchParams.get("redirect")).toBe(invitationRoute);
    expect(mocks.rpc).not.toHaveBeenCalledWith("tok_workforce_claim_employee", expect.anything());
  });

  it("preserves access for an already associated employee opening the portal directly", async () => {
    memberships = [member(restaurantOne, true)];
    renderPortal("/equipe/mon-espace");
    expect(await screen.findByRole("region", { name: "Espace personnel" })).toHaveTextContent(employeeOne);
    expect(screen.queryByRole("button", { name: "Associer mon compte TOK" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Gérer mon équipe" })).not.toBeInTheDocument();
  });

  it("does not request memberships or profiles without an authenticated account", () => {
    mocks.user = null;
    renderPortal();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Espace personnel" })).not.toBeInTheDocument();
  });
});
