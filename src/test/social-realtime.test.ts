import { describe, expect, it, vi } from "vitest";

import { createSocialRealtimeManager } from "@/lib/socialRealtime";

describe("social realtime manager", () => {
  it("shares one subscribed channel per user and removes it after the last consumer", () => {
    const channel = {
      subscribed: false,
      on: vi.fn(function (this: typeof channel) {
        if (this.subscribed) {
          throw new Error("cannot add callbacks after subscribe()");
        }
        return this;
      }),
      subscribe: vi.fn(function (this: typeof channel) {
        this.subscribed = true;
        return "SUBSCRIBED";
      }),
    };

    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    };
    const queryClient = { invalidateQueries: vi.fn() };

    const manager = createSocialRealtimeManager({
      client,
      onInvalidate: (clientRef) => clientRef.invalidateQueries({ queryKey: ["social-feed"] }),
      topicPrefix: "test-social-feed",
    });

    const releaseA = manager.retain("user-1", queryClient);
    const releaseB = manager.retain("user-1", queryClient);

    expect(client.channel).toHaveBeenCalledTimes(1);
    expect(channel.on).toHaveBeenCalledBefore(channel.subscribe);
    expect(channel.subscribe).toHaveBeenCalledTimes(1);

    releaseA();
    expect(client.removeChannel).not.toHaveBeenCalled();

    releaseB();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});
