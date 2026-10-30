import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: { id: "customer-coming-soon" } as { id: string } | null,
  useQuery: vi.fn(),
  realtime: vi.fn(),
  queryClient: {
    setQueriesData: vi.fn(),
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => mocks.useQuery(options),
  useQueryClient: () => mocks.queryClient,
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock("@/components/commercial/CommercialDemoFrameProvider", () => ({
  commercialDemoEventToNotification: vi.fn(),
  useCommercialDemoFrame: () => null,
}));

vi.mock("@/hooks/useRealtimeNotifications", () => ({
  useRealtimeNotifications: (options: unknown) => mocks.realtime(options),
}));

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    from: vi.fn(() => {
      throw new Error("Supabase reads must stay disabled in this test");
    }),
  }),
}));

import { useNotificationCenter } from "@/hooks/useNotificationCenter";

describe("coming-soon private data isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { id: "customer-coming-soon" };
    mocks.useQuery.mockImplementation(() => ({
      data: undefined,
      error: null,
      isLoading: false,
    }));
  });

  it("disables notification queries and realtime on /coming-soon", () => {
    window.history.replaceState({}, "", "/coming-soon");

    renderHook(() => useNotificationCenter(50, { realtime: true }));

    expect(mocks.useQuery).toHaveBeenCalledTimes(2);
    expect(mocks.useQuery.mock.calls.every(([options]) => (options as { enabled?: boolean }).enabled === false)).toBe(true);
    expect(mocks.realtime).toHaveBeenCalledWith({ enabled: false });
  });

  it("keeps normal authenticated notification reads enabled outside the launch screen", () => {
    window.history.replaceState({}, "", "/");

    renderHook(() => useNotificationCenter(50, { realtime: true }));

    expect(mocks.useQuery).toHaveBeenCalledTimes(2);
    expect(mocks.useQuery.mock.calls.every(([options]) => (options as { enabled?: boolean }).enabled === true)).toBe(true);
    expect(mocks.realtime).toHaveBeenCalledWith({ enabled: true });
  });
});
