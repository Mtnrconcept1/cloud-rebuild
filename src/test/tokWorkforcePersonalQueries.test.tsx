import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import {
  fetchWorkforceRows, workforceQueryMatchesRestaurant, useWorkforceAbsences, useWorkforceEmployees, useWorkforceEntriesInRange, useWorkforceRequests, useWorkforceShifts,
} from "@/hooks/useTokWorkforce";

const mocks = vi.hoisted(() => ({ from: vi.fn(), filters: [] as { table: string; column: string; value: unknown }[], orders: [] as string[] }));
vi.mock("@/integrations/supabase/client", () => ({ getSupabase: () => ({ from: mocks.from }) }));
const clients: QueryClient[] = [];
function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.filters = [];
  mocks.orders = [];
  mocks.from.mockImplementation((table: string) => {
    const filters = new Map<string, unknown>();
    let offset = 0;
    let limit = Infinity;
    const rows = Array.from({ length: 1001 }, (_, index) => ({
      id: "row-" + index, restaurant_id: "restaurant-1",
      employee_id: index === 1000 ? "employee-1" : "employee-other",
      first_name: "Employee", last_name: "Test", entry_date: "2026-10-18", shift_date: "2026-10-18",
    }));
    const query = {
      select: () => query,
      eq: (column: string, value: unknown) => { filters.set(column, value); mocks.filters.push({ table, column, value }); return query; },
      gte: () => query,
      lte: () => query,
      order: (column: string) => { mocks.orders.push(column); return query; },
      limit: (value: number) => { limit = value; return query; },
      range: (from: number, to: number) => { offset = from; limit = to - from + 1; return query; },
      abortSignal: () => query,
      then: (resolve: (value: { data: typeof rows; error: null; count: number }) => unknown) =>
        Promise.resolve({ data: rows.filter(row => [...filters].every(([key, value]) => row[key as keyof typeof row] === value)).slice(offset, offset + limit), count: rows.filter(row => [...filters].every(([key, value]) => row[key as keyof typeof row] === value)).length, error: null }).then(resolve),
    };
    return query;
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach(client => client.clear());
});

describe("TOK Équipe — requêtes personnelles", () => {
  it("charge les propres données même après 1000 relevés de collègues visibles par un responsable", async () => {
    const { result } = renderHook(() => ({
      entries: useWorkforceEntriesInRange("restaurant-1", true, "2026-01-01", "2026-12-31", "employee-1"),
      shifts: useWorkforceShifts("restaurant-1", true, "2026-10-12", "2026-10-18", "employee-1"),
      absences: useWorkforceAbsences("restaurant-1", true, "employee-1"),
      requests: useWorkforceRequests("restaurant-1", true, "employee-1"),
    }), { wrapper: wrapper() });
    await waitFor(() => expect(Object.values(result.current).every(query => query.isSuccess)).toBe(true));
    for (const query of Object.values(result.current)) {
      expect(query.data).toHaveLength(1);
      expect(query.data?.[0].employee_id).toBe("employee-1");
    }
    for (const table of ["tok_workforce_time_entries", "tok_workforce_shifts", "tok_workforce_absences", "tok_workforce_requests"]) {
      expect(mocks.filters).toContainEqual({ table, column: "employee_id", value: "employee-1" });
      expect(mocks.filters).toContainEqual({ table, column: "restaurant_id", value: "restaurant-1" });
    }
  });

  it("sépare les caches de deux employés pour le même restaurant et la même période", async () => {
    const { result } = renderHook(() => ({
      first: useWorkforceEntriesInRange("restaurant-1", true, "2026-01-01", "2026-12-31", "employee-1"),
      second: useWorkforceEntriesInRange("restaurant-1", true, "2026-01-01", "2026-12-31", "employee-other"),
    }), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.first.isSuccess && result.current.second.isSuccess).toBe(true));
    expect(result.current.first.data).toHaveLength(1);
    expect(result.current.second.data).toHaveLength(1000);
    expect(result.current.second.data?.every(row => row.employee_id === "employee-other")).toBe(true);
  });

  it("conserve la lecture de l’équipe et un ordre stable identique à celui des invitations", async () => {
    const { result } = renderHook(() => useWorkforceEmployees("restaurant-1", true), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1001);
    expect(mocks.orders).toEqual(["last_name", "id", "last_name", "id", "last_name", "id"]);
    expect(mocks.filters.some(filter => filter.column === "employee_id")).toBe(false);
  });
});


describe("TOK Équipe — données complètes et invalidation", () => {
  it("refuse un total tronqué lorsque le plafond explicite est dépassé", async () => {
    await expect(fetchWorkforceRows("restaurant-1", "tok_workforce_time_entries", {limit:500})).rejects.toThrow("trop de données");
  });
  it("refuse un total doublonné si une ligne change de position entre deux pages de même taille totale", async () => {
    mocks.from.mockImplementation(() => {
      const query = {
        select: () => query,
        eq: () => query,
        order: () => query,
        range: async (offset: number) => ({
          data: offset === 0
            ? Array.from({length:500}, (_, index) => ({id:"row-"+index}))
            : [{id:"row-499"}],
          count:501,
          error:null,
        }),
      };
      return query;
    });
    await expect(fetchWorkforceRows("restaurant-1", "tok_workforce_time_entries"))
      .rejects.toThrow("Les données ont changé pendant le chargement");
  });
  it("actualise tous les parcours du restaurant sans toucher un autre établissement", () => {
    expect(workforceQueryMatchesRestaurant(["tok-workforce","tok_workforce_shifts","restaurant-1"],"restaurant-1")).toBe(true);
    expect(workforceQueryMatchesRestaurant(["workforce-self-exchanges","restaurant-1","employee-1"],"restaurant-1")).toBe(true);
    expect(workforceQueryMatchesRestaurant(["workforce-clock-overview","restaurant-1"],"restaurant-1")).toBe(true);
    expect(workforceQueryMatchesRestaurant(["tok-workforce","tok_workforce_shifts","restaurant-2"],"restaurant-1")).toBe(false);
    expect(workforceQueryMatchesRestaurant(["workforce-self-exchanges","restaurant-2"],"restaurant-1")).toBe(false);
    expect(workforceQueryMatchesRestaurant(["orders","restaurant-1"],"restaurant-1")).toBe(false);
  });
});
