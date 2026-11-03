import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import DashboardCuisine from "@/pages/dashboard/DashboardCuisine";
import { getSupabase } from "@/integrations/supabase/client";
import {
  advanceKitchenTicket, listKitchenTickets, submitKitchenTicket,
  type KitchenTicket,
} from "@/lib/kitchenTickets";

vi.mock("@/integrations/supabase/client", () => ({ getSupabase: vi.fn() }));
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
    listKitchenTickets: vi.fn(),
    submitKitchenTicket: vi.fn(),
    advanceKitchenTicket: vi.fn(),
  };
});

const RESTAURANT = "1414667c-eac4-4f27-925d-43f2eb2c225c";
const BRANCH = "56b31120-54a5-4f46-8fe1-5bc940ec20d5";
const TABLE = "8e97ae5a-2221-4cda-9236-c42f0ce4438b";
const DISH = "29905a50-21a3-4cf8-9972-1b422cf30de9";
const TICKET = "64171c33-eae4-4adf-b18e-c2b76d9675bb";

const records: Record<string, unknown[]> = {
  restaurant_branches: [{ id: BRANCH, name: "Centre" }],
  reservation_tables: [{ id: TABLE, branch_id: BRANCH, table_number: "1", capacity: 4 }],
  menu_items: [{ id: DISH, name: "Pizza margherita", price: 18, category: "Pizzas" }],
};

function fakeQuery(table: string) {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: () => Promise.resolve({ data: records[table] || [], error: null }),
  };
  return query;
}

function mountDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <DashboardCuisine />
      </QueryClientProvider>
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
      from: vi.fn(fakeQuery),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof getSupabase>);
    vi.mocked(listKitchenTickets).mockResolvedValue([]);
    vi.mocked(submitKitchenTicket).mockResolvedValue(TICKET);
    vi.mocked(advanceKitchenTicket).mockResolvedValue(undefined);
  });

  it("choisit une table, augmente les quantités et transmet les lignes au backend", async () => {
    mountDashboard();
    const tableButton = await screen.findByRole("button", { name: /Table 1/ });
    fireEvent.click(tableButton);
    const add = await screen.findByRole("button", { name: "Ajouter un Pizza margherita" });
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
  });

  it("affiche la bonne table et avance un ticket de cuisine via RPC", async () => {
    const ticket: KitchenTicket = {
      id: TICKET,
      restaurant_id: RESTAURANT,
      branch_id: BRANCH,
      table_number: "1",
      status: "queued",
      note: "Sans arachides",
      created_at: "2026-11-03T10:00:00.000Z",
      started_at: null,
      ready_at: null,
      items: [{ id: DISH, name: "Pizza margherita", quantity: 2, unit_price: 18 }],
    };
    vi.mocked(listKitchenTickets).mockResolvedValue([ticket]);
    mountDashboard();
    const kitchenTab = screen.getByRole("tab", { name: /Écran cuisine/ });
    fireEvent.keyDown(kitchenTab, { key: "Enter", code: "Enter" });
    const action = await screen.findByRole("button", { name: "Commencer - table 1" });
    expect(screen.getByText("Sans arachides", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("2×")).toBeInTheDocument();
    fireEvent.click(action);
    await waitFor(() =>
      expect(advanceKitchenTicket).toHaveBeenCalledWith(ticket, "preparing"),
    );
  });
});
