import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useInfiniteSocialFeed, useSearchActualitesPosts, useToggleRestaurantFollow } from "@/hooks/useSocialFeed";

const fixture = vi.hoisted(() => ({
  surface: "restaurant",
  rpc: vi.fn(),
  from: vi.fn(),
  channel: vi.fn(),
  snapshot: {
    session: { id: "editorial-demo", demo_restaurant_id: "demo-table" },
    demo_restaurant: { id: "demo-table", name: "Table Démo", city: "Genève", supports_reservation: true },
    catalog_items: [{ id: "demo-dish", name: "Houmous", is_available: true }],
    events: [],
    order: null,
  },
}));
vi.mock("@/integrations/supabase/client", () => ({ getSupabase: () => ({ rpc: fixture.rpc, from: fixture.from, channel: fixture.channel, auth: { getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) } }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "demo-owner" } }) }));
vi.mock("@/components/commercial/CommercialDemoFrameProvider", () => ({
  useCommercialDemoFrame: () => ({ surface: fixture.surface, config: { sessionId: "editorial-demo" }, snapshot: fixture.snapshot }),
}));

beforeEach(() => { vi.clearAllMocks(); });

describe.each(["client", "restaurant"])("editorial feed isolation in the %s demo", (surface) => {
  it("loads and searches the simulated feed and follows locally without contacting production", async () => {
    fixture.surface = surface;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, unmount } = renderHook(() => ({
      feed: useInfiniteSocialFeed("for_you", 12),
      search: useSearchActualitesPosts("Houmous", 20),
      follow: useToggleRestaurantFollow(),
    }), { wrapper });
    await waitFor(() => expect(result.current.feed.isSuccess).toBe(true));
    await waitFor(() => expect(result.current.search.isSuccess).toBe(true));
    const posts = result.current.feed.data!.pages[0].posts;
    expect(posts.length).toBeGreaterThan(0);
    expect(posts.every((post) => post.restaurantId === "demo-table")).toBe(true);
    expect(result.current.search.data!.pages[0].posts.length).toBeGreaterThan(0);
    await act(async () => { await result.current.follow.mutateAsync(posts[0]); });
    await waitFor(() => expect(result.current.feed.data!.pages[0].posts[0].followedByMe).toBe(true));
    expect(fixture.rpc).not.toHaveBeenCalled();
    expect(fixture.from).not.toHaveBeenCalled();
    expect(fixture.channel).not.toHaveBeenCalled();
    unmount();
    client.clear();
  });
});
