import { describe, expect, it } from "vitest";

import { getCommercialDemoRealtimeUpdate } from "../lib/commercialDemoRealtime";

describe("commercial demo realtime connection status", () => {
  it.each([
    ["SUBSCRIBED", true, "connected", true],
    ["TIMED_OUT", true, "reconnecting", true],
    ["CHANNEL_ERROR", true, "reconnecting", true],
    ["CLOSED", true, "reconnecting", false],
    ["SUBSCRIBED", false, "offline", false],
    ["TIMED_OUT", false, "offline", true],
  ] as const)(
    "maps %s while online=%s to %s and resync=%s",
    (channelStatus, isOnline, expectedStatus, shouldResync) => {
      expect(getCommercialDemoRealtimeUpdate(channelStatus, isOnline)).toEqual({
        status: expectedStatus,
        shouldResync,
      });
    },
  );

  it("keeps an unknown channel state in the connecting phase", () => {
    expect(getCommercialDemoRealtimeUpdate("JOINING", true)).toEqual({
      status: "connecting",
      shouldResync: false,
    });
  });
});
