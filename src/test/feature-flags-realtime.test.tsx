import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type FeatureRow = {
  id: string;
  name: string;
  label: string;
  description: string;
  is_active: boolean;
};

const rowsState = vi.hoisted(() => ({
  rows: [] as FeatureRow[],
}));
const realtimeState = vi.hoisted(() => ({
  callback: null as null | (() => void),
}));
const removeChannelMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    from: () => ({
      select: () => ({
        order: async () => ({ data: rowsState.rows, error: null }),
      }),
    }),
    channel: () => ({
      on: (
        _type: string,
        _filter: Record<string, string>,
        callback: () => void,
      ) => {
        realtimeState.callback = callback;
        const subscribedChannel = { topic: "feature-flags-runtime" };
        return {
          subscribe: () => subscribedChannel,
        };
      },
    }),
    removeChannel: removeChannelMock,
  }),
}));

import {
  invalidateFeatureFlagsCache,
  useFeatureFlagSnapshot,
} from "@/lib/featureFlags";

function FeatureFlagRealtimeProbe() {
  const live = useFeatureFlagSnapshot({ live: true });
  const navigation = useFeatureFlagSnapshot();

  return (
    <>
      <span data-testid="live">
        {live.activeFeatures.has("dashboard-pack") ? "on" : "off"}
      </span>
      <span data-testid="navigation">
        {navigation.activeFeatures.has("dashboard-pack") ? "on" : "off"}
      </span>
    </>
  );
}

function featureRows(enabled: boolean): FeatureRow[] {
  return [
    {
      id: "dashboard-root-id",
      name: "dashboard-restaurateur",
      label: "Dashboard restaurateur",
      description: "Dashboard",
      is_active: true,
    },
    {
      id: "dashboard-pack-id",
      name: "dashboard-pack",
      label: "Mon pack",
      description: "Pack",
      is_active: enabled,
    },
  ];
}

describe("feature flag Realtime propagation", () => {
  beforeEach(() => {
    invalidateFeatureFlagsCache();
    rowsState.rows = featureRows(true);
    realtimeState.callback = null;
    removeChannelMock.mockReset();
  });

  it("refreshes both the app route snapshot and passive navigation consumers", async () => {
    render(<FeatureFlagRealtimeProbe />);

    await waitFor(() => {
      expect(screen.getByTestId("live")).toHaveTextContent("on");
      expect(screen.getByTestId("navigation")).toHaveTextContent("on");
    });
    expect(realtimeState.callback).not.toBeNull();

    rowsState.rows = featureRows(false);
    act(() => {
      realtimeState.callback?.();
    });

    await waitFor(() => {
      expect(screen.getByTestId("live")).toHaveTextContent("off");
      expect(screen.getByTestId("navigation")).toHaveTextContent("off");
    });
  });
});
