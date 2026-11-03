import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import DashboardCuisine from "@/pages/dashboard/DashboardCuisine";
import { getSupabase } from "@/integrations/supabase/client";
import {
  advanceKitchenTicket, getKitchenSetup, listKitchenTickets, submitKitchenTicket,
  type KitchenTicket, type KitchenSetup,
} from "@/lib/kitchenTickets";

const RESTAURANT = "1414667c-eac4-4f27-925d-43f2eb2c225c";
const BRANCH = "56b31120-54a5-4f46-8fe1-5bc940ec20d5";
const TABLE = "8e97ae5a-2221-4cda-9236-c42f0ce4438b";
const DISH = "29905a50-21a3-4cf8-9972-1b422cf30de9";
const TICKET = "64171c33-eae4-4adf-b18e-c2b76d9675bb";

vi.mock("@/integrations/supabase/client", () => ({ getSupabase: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "9a52ed26-2845-4a20-a45b-9f7c60d9e0f8" } }),
}));
vi.mock("@/pages/dashboard/useDashboardRestaurant", () => ({
  useDashboardRestaurant: () => ({
    selectedId: RESTAURANT,
    restaurants: [{ id: RESTAURANT, name: "Test restaurant" }],
    loading: false,
    isDemoMode: false,
  }),
}));
vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/dashboard/DashboardPageHero", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/lib/kitchenTickets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kitchenTickets")>();
  return {
    ...actual,
    getKitchenSetup: vi.fn(),
    listKitchenTickets: vi.fn(),
    submitKitchenTicket: vi.fn(),
    advanceKitchenTicket: vi.fn(),
  };
});

const setup: KitchenSetup = {
  branches: [{ id: BRANCH, name: "Centre" }],
  tables: [{ id: TABLE, branch_id: BRANCH, table_number: "1", capacity: 4 }],
  menu: [{ id: DISH, name: "Pizza margherita", price: 18, category: "Pizzas" }],
};

function mountDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}><DashboardCuisine /></QueryClientProvider>
    </MemoryRouter>,
  );
}

describe("écran cuisine restaurateur", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const channel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    };
    vi.mocked(getSupabase).mockReturnValue({
      channel: vi.fn(() => channel),
      removeChannel: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof getSupabase>);
    vi.mocked(getKitchenSetup).mockResolvedValue(setup);
    vi.mocked(listKitchenTickets).mockResolvedValue([]);
    vi.mocked(submitKitchenTicket).mockResolvedValue(TICKET);
    vi.mocked(advanceKitchenTicket).mockResolvedValue(undefined);
  });

  it("choisit la table, augmente les quantités et transmet au backend", async () => {
    mountDashboard();
    fireEvent.click(await screen.findByRole("button", { name: /Table 1/ }));
    const add = screen.getByRole("button", { name: "Ajouter un Pizza margherita" });
    fireEvent.click(add);
    fireEvent.click(add);
    expect(screen.getByText("2 portions")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Valider et envoyer/ }));
    await waitFor(() => expect(submitKitchenTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        restaurantId: RESTAURANT,
        tableId: TABLE,
        basket: { [DISH]: 2 },
      }),
    ));
    expect(getKitchenSetup).toHaveBeenCalledWith(RESTAURANT);
  });

  it("affiche les tickets reçus des serveurs et permet de lancer la préparation", async () => {
    const ticket: KitchenTicket = {
      id: TICKET, restaurant_id: RESTAURANT, branch_id: BRANCH,
      table_number: "1", status: "queued", note: "Sans arachides",
      created_at: "2026-11-03T10:00:00.000Z",
      started_at: null, ready_at: null,
      items: [{ id: DISH, name: "Pizza margherita", quantity: 2, unit_price: 18 }],
    };
    vi.mocked(listKitchenTickets).mockResolvedValue([ticket]);
    mountDashboard();
    fireEvent.keyDown(screen.getByRole("tab", { name: /Écran cuisine/ }), {
      key: "Enter", code: "Enter",
    });
    const start = await screen.findByRole("button", { name: "Commencer - table 1" });
    expect(screen.getByText("Sans arachides", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("2×")).toBeInTheDocument();
    fireEvent.click(start);
    await waitFor(() => expect(advanceKitchenTicket).toHaveBeenCalledWith(ticket, "preparing"));
  });
});
