import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInfiniteSocialFeed } from "@/hooks/useSocialFeed";

const state = vi.hoisted(() => ({
  allowed: false, userId: null as string | null, from: vi.fn(), rpc: vi.fn(),
  config: null as null | { queryKey: unknown[]; queryFn: (input: { pageParam: null }) => Promise<unknown> },
}));
vi.mock("@/lib/consent", () => ({ hasConsent: () => state.allowed }));
vi.mock("@/hooks/useConsentCategory", () => ({ useConsentCategory: () => state.allowed }));
vi.mock("@/lib/analytics", () => ({ createAnalyticsTrackingCallId: vi.fn(), getOrCreateAnalyticsViewerId: vi.fn(), recordSponsoredSocialFeedEvent: vi.fn() }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: state.userId ? { id: state.userId } : null }) }));
vi.mock("@/lib/socialRealtime", () => ({ createSocialRealtimeManager: () => ({ subscribeAll: () => () => undefined }) }));
vi.mock("@/components/commercial/CommercialDemoFrameProvider", () => ({ useCommercialDemoFrame: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ getSupabase: () => ({ from: state.from, rpc: state.rpc }) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
  useInfiniteQuery: (config: typeof state.config) => { state.config = config; return {}; },
}));

beforeEach(() => {
  vi.clearAllMocks(); window.localStorage.clear(); state.allowed = false; state.userId = null;
  state.rpc.mockResolvedValue({ data: [], error: null });
  state.from.mockImplementation(() => {
    const builder: Record<string, unknown> = {};
    for (const name of ["select", "eq", "neq", "or", "lte", "lt", "order", "limit", "range", "in"]) builder[name] = vi.fn(() => builder);
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
    return builder;
  });
});
afterEach(cleanup);

describe("social feed privacy", () => {
  it("uses a chronological public query without requesting inferred interests before consent", async () => {
    renderHook(() => useInfiniteSocialFeed());
    await state.config!.queryFn({ pageParam: null });
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.from).toHaveBeenCalledWith("social_posts");
    expect(state.from).not.toHaveBeenCalledWith("orders");
    expect(state.from).not.toHaveBeenCalledWith("reservations");
    expect(state.config!.queryKey.at(-1)).toBe(false);
  });
  it("preserves the explicit saved-list request without inferred personalization", async () => {
    state.userId = "client";
    renderHook(() => useInfiniteSocialFeed("saved"));
    await state.config!.queryFn({ pageParam: null });
    expect(state.from).toHaveBeenCalledWith("social_post_saves");
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("isolates personalized cached data behind the explicit choice", async () => {
    state.allowed = true;
    const view = renderHook(() => useInfiniteSocialFeed());
    await state.config!.queryFn({ pageParam: null });
    expect(state.rpc).toHaveBeenCalledWith("get_social_feed_v2", expect.anything());
    const grantedKey = state.config!.queryKey;
    state.allowed = false; view.rerender();
    expect(state.config!.queryKey).not.toEqual(grantedKey);
    state.rpc.mockClear();
    await state.config!.queryFn({ pageParam: null });
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
