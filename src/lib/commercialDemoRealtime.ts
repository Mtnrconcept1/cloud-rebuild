export type CommercialDemoRealtimeStatus = "connecting" | "connected" | "reconnecting" | "offline";

export type CommercialDemoRealtimeUpdate = {
  status: CommercialDemoRealtimeStatus;
  shouldResync: boolean;
};

export function getCommercialDemoRealtimeUpdate(
  channelStatus: string,
  isOnline: boolean,
): CommercialDemoRealtimeUpdate {
  if (!isOnline) {
    return {
      status: "offline",
      shouldResync: channelStatus === "TIMED_OUT" || channelStatus === "CHANNEL_ERROR",
    };
  }

  if (channelStatus === "SUBSCRIBED") {
    return { status: "connected", shouldResync: true };
  }

  if (channelStatus === "TIMED_OUT" || channelStatus === "CHANNEL_ERROR") {
    return { status: "reconnecting", shouldResync: true };
  }

  if (channelStatus === "CLOSED") {
    return { status: "reconnecting", shouldResync: false };
  }

  return { status: "connecting", shouldResync: false };
}
