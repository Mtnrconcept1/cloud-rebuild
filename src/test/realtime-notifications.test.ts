import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { createRealtimeNotificationManager } from "@/lib/realtimeNotifications";

function createMockRealtimeChannel() {
  const callbacks: Record<string, (payload: { new?: unknown }) => void> = {};
  const channel = {
    subscribed: false,
    on: vi.fn(function (
      this: typeof channel,
      _type: "postgres_changes",
      filter: { event: string },
      callback: (payload: { new?: unknown }) => void,
    ) {
      if (this.subscribed) {
        throw new Error("cannot add callbacks after subscribe()");
      }
      callbacks[filter.event] = callback;
      return this;
    }),
    subscribe: vi.fn(function (this: typeof channel) {
      this.subscribed = true;
      return this;
    }),
  };

  return { channel, callbacks };
}

function createQueryClientMock() {
  return {
    invalidateQueries: vi.fn(),
  } as unknown as QueryClient;
}

describe("realtime notification manager", () => {
  it("shares one subscribed channel per user and fans out inserts to subscribers", () => {
    const { channel, callbacks } = createMockRealtimeChannel();
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    };
    const queryClientA = createQueryClientMock();
    const queryClientB = createQueryClientMock();
    const onInsertA = vi.fn();
    const onInsertB = vi.fn();

    const manager = createRealtimeNotificationManager({
      client,
      topicPrefix: "test-realtime-notifications",
    });

    const releaseA = manager.retain("user-1", { queryClient: queryClientA, onInsert: onInsertA });
    const releaseB = manager.retain("user-1", { queryClient: queryClientB, onInsert: onInsertB });

    expect(client.channel).toHaveBeenCalledTimes(1);
    expect(channel.on).toHaveBeenCalledTimes(2);
    expect(channel.on).toHaveBeenCalledBefore(channel.subscribe);
    expect(channel.subscribe).toHaveBeenCalledTimes(1);

    const notification = { id: "notification-1", title: "Nouvelle alerte", body: "A traiter" };
    callbacks.INSERT({ new: notification });

    for (const queryClient of [queryClientA, queryClientB]) {
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["navbar-notifications", "user-1"] });
      expect(queryClient.invalidateQueries).toHaveBeenCalledWith({ queryKey: ["notifications", "user-1"] });
    }
    expect(onInsertA).toHaveBeenCalledWith(notification);
    expect(onInsertB).toHaveBeenCalledWith(notification);

    releaseA();
    expect(client.removeChannel).not.toHaveBeenCalled();

    releaseB();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });

  it("uses a fresh topic when a user subscription is recreated after release", () => {
    const first = createMockRealtimeChannel();
    const second = createMockRealtimeChannel();
    const client = {
      channel: vi.fn()
        .mockReturnValueOnce(first.channel)
        .mockReturnValueOnce(second.channel),
      removeChannel: vi.fn(),
    };
    const manager = createRealtimeNotificationManager({
      client,
      topicPrefix: "test-realtime-notifications",
    });

    const releaseFirst = manager.retain("user-1", { queryClient: createQueryClientMock() });
    releaseFirst();

    const releaseSecond = manager.retain("user-1", { queryClient: createQueryClientMock() });
    releaseSecond();

    expect(client.channel).toHaveBeenCalledTimes(2);
    expect(client.channel.mock.calls[0][0]).not.toBe(client.channel.mock.calls[1][0]);
  });
});
