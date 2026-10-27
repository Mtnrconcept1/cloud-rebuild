import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardHome from "@/pages/dashboard/DashboardHome";

type Request = {
  table: string;
  columns?: string;
  head?: boolean;
  limit?: number;
  filters: Array<[string, string, unknown]>;
};
type Response = { data: unknown; count?: number; error: unknown };

const boundary = vi.hoisted(() => ({
  dashboard: {
    selectedId: "restaurant-1" as string | null,
    loading: false,
    error: null as string | null,
    dashboardAccessLocked: false,
    isDemoMode: false,
  },
  respond: vi.fn<(request: Request) => Promise<Response>>(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    from: (table: string) => {
      const request: Request = { table, filters: [] };
      const query = {
        select: (columns: string, options?: { head?: boolean }) => {
          request.columns = columns;
          request.head = options?.head;
          return query;
        },
        eq: (column: string, value: unknown) => {
          request.filters.push(["eq", column, value]);
          return query;
        },
        in: (column: string, value: unknown) => {
          request.filters.push(["in", column, value]);
          return query;
        },
        not: () => query,
        gte: (column: string, value: unknown) => {
          request.filters.push(["gte", column, value]);
          return query;
        },
        gt: () => query,
        lt: (column: string, value: unknown) => {
          request.filters.push(["lt", column, value]);
          return query;
        },
        order: () => query,
        limit: (limit: number) => { request.limit = limit; return query; },
        single: () => query,
        then: (resolve: (response: Response) => unknown, reject: (error: unknown) => unknown) =>
          boundary.respond(request).then(resolve, reject),
      };
      return query;
    },
  }),
}));
vi.mock("@/pages/dashboard/useDashboardRestaurant", () => ({
  useDashboardRestaurant: () => boundary.dashboard,
}));
vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/components/commercial/CommercialDemoFrameProvider", () => ({ useCommercialDemoFrame: () => null }));
vi.mock("@/components/commercial/CommercialDemoRestaurantHome", () => ({ default: () => null }));
vi.mock("@/components/dashboard/CommercialDemoScenario", () => ({ CommercialDemoHome: () => null }));
vi.mock("@/components/dashboard/GoogleBusinessBookingCard", () => ({ default: () => null }));
vi.mock("@/components/signup/SignupApplicationStatusCard", () => ({ default: () => null }));
vi.mock("@/hooks/useSignupApplication", () => ({ useSignupApplication: () => ({ data: null }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/usePaymentAttemptBackCancellation", () => ({ usePaymentAttemptBackCancellation: () => {} }));
vi.mock("@/components/dashboard/RestaurantDashboardHomeView", () => ({
  default: ({ restaurantName, totalUpcomingOrders, upcomingOrders, leadingContent }: {
    restaurantName: string;
    totalUpcomingOrders: number;
    upcomingOrders: Array<{ id: string }>;
    leadingContent: ReactNode;
  }) => <section aria-label="Données opérationnelles">
    <h1>{restaurantName}</h1>
    <p>Commandes à venir : {totalUpcomingOrders}</p>
    {upcomingOrders.map((order) => <p key={order.id}>{order.id}</p>)}
    {leadingContent}
  </section>,
}));

const restaurant = { id: "restaurant-1", name: "Le restaurant" };
const isUpcomingOrders = (request: Request) => request.table === "orders" && request.limit === 5;
const hasFilter = (request: Request, operator: string, column: string, value?: unknown) =>
  request.filters.some(([op, key, expected]) => op === operator && key === column && (value === undefined || expected === value));

function successfulResponse(request: Request): Response {
  if (request.table === "restaurants") return { data: restaurant, error: null };
  if (request.head) return { data: null, count: 3, error: null };
  if (isUpcomingOrders(request)) return {
    data: [{ id: "order-1", created_at: "2026-10-27T12:00:00Z", total_amount: 25, status: "confirmed" }],
    error: null,
  };
  return { data: [], error: null };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const clients: QueryClient[] = [];
function showDashboard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(client);
  const tree = <QueryClientProvider client={client}><DashboardHome /></QueryClientProvider>;
  return { client, ...render(tree) };
}

beforeEach(() => {
  boundary.dashboard = { selectedId: "restaurant-1", loading: false, error: null, dashboardAccessLocked: false, isDemoMode: false };
  boundary.respond.mockReset();
  boundary.respond.mockImplementation(async (request) => successfulResponse(request));
});
afterEach(() => {
  cleanup();
  clients.forEach((client) => client.clear());
  clients.length = 0;
});

describe("dashboard home query recovery", () => {
  it("waits for the restaurant selection before reporting no restaurant", () => {
    boundary.dashboard.selectedId = null;
    boundary.dashboard.loading = true;
    showDashboard();
    expect(screen.getByRole("status")).toHaveTextContent("Chargement du restaurant");
    expect(screen.queryByText("Aucun restaurant")).not.toBeInTheDocument();
  });

  it("shows no restaurant after the owned selection successfully resolves empty", () => {
    boundary.dashboard.selectedId = null;
    showDashboard();
    expect(screen.getByText("Aucun restaurant")).toBeInTheDocument();
    expect(boundary.respond).not.toHaveBeenCalled();
  });

  it("renders genuine empty operational results after successful loading", async () => {
    boundary.respond.mockImplementation(async (request) => request.table === "restaurants"
      ? { data: restaurant, error: null }
      : { data: request.head ? null : [], count: 0, error: null });
    showDashboard();
    expect(await screen.findByText("Commandes à venir : 0", {}, { timeout: 5_000 })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("keeps operational reads disabled while restaurant access is locked", async () => {
    boundary.dashboard.dashboardAccessLocked = true;
    showDashboard();
    expect(await screen.findByRole("heading", { name: "Le restaurant" })).toBeInTheDocument();
    expect(boundary.respond.mock.calls.map(([request]) => request.table)).toEqual(["restaurants"]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("does not treat a selection failure as an empty restaurant list", () => {
    boundary.dashboard.selectedId = null;
    boundary.dashboard.error = "Network unavailable";
    const { client } = showDashboard();
    const invalidate = vi.spyOn(client, "invalidateQueries");
    expect(screen.getByRole("alert")).toHaveTextContent("Restaurant indisponible");
    expect(screen.queryByText("Aucun restaurant")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["owner-restaurants"] });
  });

  it("waits for a deferred restaurant profile before showing operational data", async () => {
    const pending = deferred<Response>();
    boundary.respond.mockImplementation((request) => request.table === "restaurants" ? pending.promise : Promise.resolve(successfulResponse(request)));
    showDashboard();
    expect(screen.getByRole("status")).toHaveTextContent("Chargement du restaurant");
    expect(screen.queryByText("Aucun restaurant")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Données opérationnelles" })).not.toBeInTheDocument();
    await act(async () => { pending.resolve({ data: restaurant, error: null }); });
    expect(await screen.findByText("order-1")).toBeInTheDocument();
  });

  it.each(["Supabase response", "rejected request"])("shows a retryable profile failure for a %s", async (failure) => {
    boundary.respond.mockImplementation(async (request) => {
      if (request.table !== "restaurants") return successfulResponse(request);
      if (failure === "rejected request") throw new Error("Offline");
      return { data: null, error: { message: "Unavailable" } };
    });
    showDashboard();
    expect(await screen.findByRole("alert")).toHaveTextContent("Restaurant indisponible");
    expect(screen.queryByText("Aucun restaurant")).not.toBeInTheDocument();
    boundary.respond.mockImplementation(async (request) => successfulResponse(request));
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("order-1")).toBeInTheDocument();
  });

  it("does not show empty orders or zero counters while orders are loading", async () => {
    const pending = deferred<Response>();
    boundary.respond.mockImplementation((request) => isUpcomingOrders(request) ? pending.promise : Promise.resolve(successfulResponse(request)));
    showDashboard();
    expect(await screen.findByText("Chargement du tableau de bord")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Données opérationnelles" })).not.toBeInTheDocument();
    await act(async () => { pending.resolve(successfulResponse({ table: "orders", limit: 5, filters: [] })); });
    expect(await screen.findByText("order-1")).toBeInTheDocument();
    expect(screen.getByText("Commandes à venir : 3")).toBeInTheDocument();
  });

  it.each(["Supabase response", "rejected request"])("retries an orders failure from a %s without displaying empty data", async (failure) => {
    boundary.respond.mockImplementation(async (request) => {
      if (!isUpcomingOrders(request)) return successfulResponse(request);
      if (failure === "rejected request") throw new Error("Offline");
      return { data: null, error: { message: "Unavailable" } };
    });
    showDashboard();
    expect(await screen.findByRole("alert")).toHaveTextContent("Données du tableau de bord indisponibles");
    expect(screen.queryByRole("region", { name: "Données opérationnelles" })).not.toBeInTheDocument();
    boundary.respond.mockImplementation(async (request) => successfulResponse(request));
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(await screen.findByText("order-1")).toBeInTheDocument();
  });

  const failedMetrics: Array<[string, (request: Request) => boolean]> = [
    ["reservations", (request) => request.table === "reservations" && request.limit === 5],
    ["order counter", (request) => request.table === "orders" && !!request.head && !hasFilter(request, "eq", "status", "ready")],
    ["reservation counter", (request) => request.table === "reservations" && !!request.head],
    ["campaign counter", (request) => request.table === "ad_campaigns"],
    ["today order revenue", (request) => request.table === "orders" && request.columns === "total_amount" && hasFilter(request, "lt", "created_at")],
    ["today reservation revenue", (request) => request.table === "reservations" && request.columns === "total_amount" && hasFilter(request, "eq", "date")],
    ["monthly order revenue", (request) => request.table === "orders" && request.columns === "total_amount" && !hasFilter(request, "lt", "created_at")],
    ["monthly reservation revenue", (request) => request.table === "reservations" && request.columns === "total_amount" && hasFilter(request, "gte", "date")],
  ];
  it.each(failedMetrics)("does not present a failed %s query as a valid empty or zero result", async (_name, matches) => {
    boundary.respond.mockImplementation(async (request) => matches(request) ? { data: null, error: { message: "Unavailable" } } : successfulResponse(request));
    const { client } = showDashboard();
    expect(await screen.findByRole("alert")).toHaveTextContent("Données du tableau de bord indisponibles");
    expect(screen.queryByRole("region", { name: "Données opérationnelles" })).not.toBeInTheDocument();
    expect(client.getQueryCache().getAll().some((query) => query.state.status === "error")).toBe(true);
  });

  it.each(["orders", "profile"])("keeps cached data with an explicit stale warning when the %s refresh fails", async (source) => {
    const { client } = showDashboard();
    expect(await screen.findByText("order-1")).toBeInTheDocument();
    boundary.respond.mockImplementation(async (request) => (source === "profile" ? request.table === "restaurants" : isUpcomingOrders(request))
      ? { data: null, error: { message: "Unavailable" } }
      : successfulResponse(request));
    await act(async () => {
      await client.invalidateQueries({ queryKey: [source === "profile" ? "my-restaurant-detail" : "dashboard-upcoming-orders"] });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Actualisation impossible");
    expect(screen.getByRole("alert")).toHaveTextContent("peuvent être obsolètes");
    expect(screen.getByText("order-1")).toBeInTheDocument();
    expect(screen.getByText("Commandes à venir : 3")).toBeInTheDocument();
    boundary.respond.mockImplementation(async (request) => successfulResponse(request));
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });
});
