import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { createRealtimeNotificationManager } from "@/lib/realtimeNotifications";

describe("Realtime notification recovery", () => {
  it("refreshes on reconnection and polls only while the channel is unavailable", () => {
    vi.useFakeTimers();
    try {
      const invalidate = vi.fn();
      const queries = { invalidateQueries: invalidate } as unknown as QueryClient;
      let onStatus: ((status: string) => void) | undefined;
      const handlers = new Map<string, (payload: { new?: unknown }) => void>();
      const channel = {
        on: vi.fn((_: string, filter: { event: string }, callback: (payload: { new?: unknown }) => void) => {
          handlers.set(filter.event, callback);
          return channel;
        }),
        subscribe: vi.fn((callback?: (status: string) => void) => {
          onStatus = callback;
          return channel;
        }),
      };
      const client = { channel: vi.fn(() => channel), removeChannel: vi.fn() };
      const onInsert = vi.fn();
      const manager = createRealtimeNotificationManager({ client });
      const release = manager.retain("user-1", { queryClient: queries, onInsert });

      expect(onStatus).toBeTypeOf("function");
      onStatus?.("CHANNEL_ERROR");
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["notifications", "user-1"] });
      invalidate.mockClear();
      vi.advanceTimersByTime(60_000);
      expect(invalidate).toHaveBeenCalled();

      invalidate.mockClear();
      onStatus?.("SUBSCRIBED");
      expect(invalidate).toHaveBeenCalled();
      invalidate.mockClear();
      vi.advanceTimersByTime(120_000);
      expect(invalidate).not.toHaveBeenCalled();

      handlers.get("INSERT")?.({ new: null });
      handlers.get("INSERT")?.({ new: { title: "Invalid" } });
      expect(onInsert).not.toHaveBeenCalled();
      handlers.get("INSERT")?.({ new: { id: "notification-1", title: "Mission", body: "Disponible" } });
      expect(onInsert).toHaveBeenCalledTimes(1);

      release();
      invalidate.mockClear();
      onStatus?.("CHANNEL_ERROR");
      vi.advanceTimersByTime(120_000);
      expect(invalidate).not.toHaveBeenCalled();
      expect(client.removeChannel).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
