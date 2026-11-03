import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import MyRoomManagement from "@/pages/workforce/MyRoomManagement";
import { listKitchenTickets } from "@/lib/kitchenTickets";

const RESTAURANT = "1414667c-eac4-4f27-925d-43f2eb2c225c";
const OTHER = "202b187c-eac4-4f27-925d-43f2eb2c225c";
const EMPLOYEE = "3e1b1127-a5c2-458f-9f1b-33248f77bca1";
const USER = "f10c219a-fecb-43d0-a6b7-e55e282f574f";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn(),
  user: { id: "f10c219a-fecb-43d0-a6b7-e55e282f574f" },
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/hooks/useTokWorkforce", () => ({
  workforceDb: () => ({
    rpc: mocks.rpc, from: mocks.from, channel: mocks.channel, removeChannel: mocks.removeChannel,
  }),
}));
vi.mock("@/components/dashboard/DashboardPageHero", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/components/dashboard/KitchenOrderEntry", () => ({
  default: ({ restaurantId }: { restaurantId: string }) =>
    <section aria-label="Formulaire serveur">{restaurantId}</section>,
}));
vi.mock("@/lib/kitchenTickets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/kitchenTickets")>()),
  listKitchenTickets: vi.fn(),
}));

let linked = true;
let profile: {
  id: string; restaurant_id: string; user_id: string; role: string;
  is_active: boolean; started_on: string | null; ended_on: string | null;
};
const clients: QueryClient[] = [];

function view(route = "/equipe/gestion-salle?restaurant=" + RESTAURANT) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>
        <Routes><Route path="/equipe/gestion-salle" element={<MyRoomManagement />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  linked = true;
  profile = {
    id: EMPLOYEE, restaurant_id: RESTAURANT, user_id: USER, role: "employee",
    is_active: true, started_on: "2026-01-01", ended_on: null,
  };
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name !== "tok_workforce_my_restaurants") throw new Error("Unexpected RPC");
    return { data: [{
      restaurant_id: RESTAURANT, employee_id: EMPLOYEE, linked, restaurant_name: "Bistro TOK",
    }], error: null };
  });
  mocks.from.mockImplementation(() => {
    const q = {
      select: () => q, eq: () => q,
      single: async () => ({ data: profile, error: null }),
    };
    return q;
  });
  const c = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() };
  mocks.channel.mockReturnValue(c);
  mocks.removeChannel.mockResolvedValue(undefined);
  vi.mocked(listKitchenTickets).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  for (const c of clients.splice(0)) c.clear();
});

describe("gestion de salle avec les accès TOK Équipe", () => {
  it("ouvre le formulaire pour un employé actif et lié", async () => {
    view();
    expect(await screen.findByRole("region", { name: "Formulaire serveur" }))
      .toHaveTextContent(RESTAURANT);
    expect(screen.getByText("Bistro TOK")).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("tok_workforce_my_restaurants");
  });

  it("ne donne pas accès avec une invitation non acceptée", async () => {
    linked = false;
    view();
    expect(await screen.findByText("Gestion de salle non autorisée")).toBeInTheDocument();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(listKitchenTickets).not.toHaveBeenCalled();
  });

  it.each([
    ["désactivé", { is_active: false }],
    ["terminé", { ended_on: "2026-01-01" }],
    ["futur", { started_on: "2099-01-01" }],
    ["autre identité", { user_id: OTHER }],
    ["rôle non employé", { role: "visitor" }],
  ])("refuse un collaborateur %s", async (_label, override) => {
    profile = { ...profile, ...override };
    view();
    expect(await screen.findByText("Gestion de salle non autorisée")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Formulaire serveur" })).not.toBeInTheDocument();
  });

  it.each([
    "/equipe/gestion-salle",
    "/equipe/gestion-salle?restaurant=" + OTHER,
    "/equipe/gestion-salle?restaurant=" + RESTAURANT + "&restaurant=" + OTHER,
    "/equipe/gestion-salle?restaurant=" + RESTAURANT + "&next=/admin",
  ])("refuse les liens non autorisés : %s", async (route) => {
    view(route);
    expect(await screen.findByText("Gestion de salle non autorisée")).toBeInTheDocument();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
