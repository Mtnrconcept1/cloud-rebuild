import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { triggerNotificationDispatch } from "../../supabase/functions/_shared/notifications";

const state = vi.hoisted(() => ({
  env: {} as Record<string, string>,
  fetch: vi.fn(),
}));
vi.mock("../../supabase/functions/_shared/auth.ts", () => ({
  getEnv: (name: string) => state.env[name] || "",
}));

function workerResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => "private-provider-detail" };
}

beforeEach(() => {
  state.env = { SUPABASE_URL: "https://fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "fixture-not-a-secret" };
  state.fetch.mockReset();
  vi.stubGlobal("fetch", state.fetch);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("business notification dispatch acknowledgement", () => {
  it("reports missing configuration rather than claiming a successful dispatch", async () => {
    state.env = {};
    const result = await triggerNotificationDispatch({ push: false, email: true });
    expect(result.failedChannels).toHaveLength(1);
    expect(result.failedChannels[0].channel).toBe("email");
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it("reports partial delivery failures returned with HTTP 200", async () => {
    state.fetch.mockResolvedValue(workerResponse({ processed: 3, sent: 1, failed: 2 }));
    const result = await triggerNotificationDispatch({ push: false, email: true });
    expect(result.failedChannels).toHaveLength(1);
    expect(result.failedChannels[0].message).toContain("2");
  });

  it("accepts an empty queue and skipped push tokens without inventing a delivery", async () => {
    state.fetch.mockResolvedValueOnce(workerResponse({ processed: 0 }))
      .mockResolvedValueOnce(workerResponse({ processed: 2, sent: 0, failed: 0, skipped: 2 }));
    expect((await triggerNotificationDispatch({ push: true })).failedChannels).toEqual([]);
    expect((await triggerNotificationDispatch({ push: true })).failedChannels).toEqual([]);
  });

  it("isolates failed channels from successful channels", async () => {
    state.fetch.mockResolvedValueOnce(workerResponse({ processed: 1, failed: 1 }))
      .mockResolvedValueOnce(workerResponse({ processed: 1, sent: 1, failed: 0 }));
    const result = await triggerNotificationDispatch({ push: true, email: true, userId: "user-1" });
    expect(result.attemptedChannels).toEqual(["push", "email"]);
    expect(result.failedChannels.map((failure) => failure.channel)).toEqual(["push"]);
  });

  it("bounds the request and preserves the user-scoped dispatch", async () => {
    state.fetch.mockResolvedValue(workerResponse({ processed: 0 }));
    await triggerNotificationDispatch({ push: false, email: true, userId: "user-1", source: "fixture" });
    const [url, options] = state.fetch.mock.calls[0];
    expect(url).toBe("https://fixture.invalid/functions/v1/send-email");
    expect(JSON.parse(options.body)).toEqual({ source: "fixture", user_id: "user-1" });
    expect(options.signal).toBeDefined();
    expect(options.signal.aborted).toBe(false);
  });

  it("does not expose provider response content in errors", async () => {
    state.fetch.mockResolvedValue(workerResponse({ error: "private-provider-detail" }, 503));
    const result = await triggerNotificationDispatch({ push: false, email: true });
    expect(result.failedChannels).toHaveLength(1);
    expect(result.failedChannels[0].message).toContain("503");
    expect(result.failedChannels[0].message).not.toContain("private-provider-detail");
  });

  it("reports explicit application errors and invalid acknowledgements", async () => {
    for (const body of [{ ok: false }, null, [], { processed: 1, error: "private-detail" }]) {
      state.fetch.mockResolvedValue(workerResponse(body));
      const result = await triggerNotificationDispatch({ push: false, email: true });
      expect(result.failedChannels).toHaveLength(1);
      expect(result.failedChannels[0].message).not.toContain("private-detail");
    }
  });

  it("keeps a timeout observable without throwing into the business operation", async () => {
    state.fetch.mockRejectedValue(new Error("Request timed out"));
    const result = await triggerNotificationDispatch({ push: false, email: true });
    expect(result.failedChannels).toEqual([{ channel: "email", message: "Request timed out" }]);
  });
});
