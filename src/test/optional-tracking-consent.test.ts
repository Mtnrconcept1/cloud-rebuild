import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  invoke: vi.fn(), rpc: vi.fn(), insert: vi.fn(),
  session: vi.fn(), authChange: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ getSupabase: () => ({
  auth: { getSession: api.session, onAuthStateChange: api.authChange },
  functions: { invoke: api.invoke }, rpc: api.rpc,
  from: () => ({ insert: api.insert }),
}) }));

let consent: typeof import("@/lib/consent");
let analytics: typeof import("@/lib/analytics");
let listeners: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers();
  window.localStorage.clear();
  vi.stubGlobal("navigator", { onLine: true, userAgent: "test" });
  api.session.mockResolvedValue({ data: { session: null } });
  api.authChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
  api.insert.mockResolvedValue({ error: null });
  api.invoke.mockResolvedValue({ data: { recorded: true, touchToken: "touch" }, error: null });
  api.rpc.mockResolvedValue({ data: { recorded: true }, error: null });
  listeners = vi.spyOn(window, "addEventListener");
  consent = await import("@/lib/consent");
});
afterEach(() => {
  for (const [event, listener] of listeners.mock.calls) window.removeEventListener(event, listener);
  vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals();
});
async function boot() {
  analytics = await import("@/lib/analytics");
  await Promise.resolve(); await Promise.resolve();
}
async function grant(preferences: Partial<import("@/lib/consent").ConsentPreferences>) {
  await consent.saveConsent(preferences);
}

describe("optional tracking consent boundaries", () => {
  it("sends no audience or advertising events and creates no viewer before a choice", async () => {
    await boot();
    await analytics.queueAnalyticsEvent({ kind: "search" });
    expect(await analytics.trackSponsoredClick("campaign", "restaurant")).toBe(false);
    expect(await analytics.trackSponsoredImpression("campaign", "restaurant")).toBe(false);
    await analytics.recordSponsoredSocialFeedEvent({ postId: "post", eventType: "click" });
    await analytics.trackSponsoredConversion("restaurant", { entityId: "order" });
    analytics.getOrCreateAnalyticsViewerId();
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.invoke).not.toHaveBeenCalled();
    expect(api.rpc).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("miamz-analytics-viewer-v1")).toBeNull();
  });

  it("permits audience measurement only after its own opt-in", async () => {
    await grant({ analytics: true }); await boot();
    const event = analytics.queueAnalyticsEvent({ kind: "search" });
    await analytics.flushAnalyticsQueue(); await event;
    await analytics.trackSponsoredClick("campaign", "restaurant");
    expect(api.invoke).toHaveBeenCalledExactlyOnceWith("track-analytics", expect.anything());
  });

  it("permits advertising without implicitly enabling audience measurement", async () => {
    await grant({ marketing: true }); await boot();
    expect(await analytics.trackSponsoredClick("campaign", "restaurant")).toBe(true);
    await analytics.flushAnalyticsQueue();
    expect(api.invoke).toHaveBeenCalledExactlyOnceWith("track-sponsored-event", expect.anything());
  });

  it("drops queued audience events synchronously when consent is withdrawn", async () => {
    await grant({ analytics: true }); await boot();
    const pending = analytics.queueAnalyticsEvent({ kind: "search" });
    await grant({ analytics: false });
    await expect(pending).resolves.toBeNull();
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.invoke).not.toHaveBeenCalled();
  });

  it("removes offline advertising queues and never replays them after reacceptance", async () => {
    await grant({ marketing: true }); await boot();
    vi.stubGlobal("navigator", { onLine: false });
    await analytics.trackSponsoredClick("campaign", "restaurant");
    expect(window.localStorage.getItem("miamz-sponsored-event-queue-v1")).not.toBeNull();
    await grant({ marketing: false });
    expect(window.localStorage.getItem("miamz-sponsored-event-queue-v1")).toBeNull();
    expect(window.localStorage.getItem("miamz-sponsored-attribution-v1")).toBeNull();
    vi.stubGlobal("navigator", { onLine: true });
    await grant({ marketing: true });
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(5000);
    expect(api.invoke).not.toHaveBeenCalled();
  });

  it("ignores a late advertising response after withdrawal and reacceptance", async () => {
    await grant({ marketing: true }); await boot();
    let finish!: (value: unknown) => void;
    api.invoke.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const click = analytics.trackSponsoredClick("campaign", "restaurant");
    await Promise.resolve(); await Promise.resolve();
    await grant({ marketing: false }); await grant({ marketing: true });
    finish({ data: { recorded: true, touchToken: "late-touch" }, error: null });
    await click;
    expect(window.localStorage.getItem("miamz-sponsored-attribution-v1")).toBeNull();
  });

  it("respects a withdrawal from another tab", async () => {
    await grant({ analytics: true, marketing: true }); await boot();
    analytics.getOrCreateAnalyticsViewerId();
    const pending = analytics.queueAnalyticsEvent({ kind: "search" });
    window.localStorage.removeItem(consent.CONSENT_STORAGE_KEY);
    window.dispatchEvent(new StorageEvent("storage", { key: consent.CONSENT_STORAGE_KEY }));
    await expect(pending).resolves.toBeNull();
    expect(window.localStorage.getItem("miamz-analytics-viewer-v1")).toBeNull();
    expect(api.invoke).not.toHaveBeenCalled();
  });

  it("preserves the necessary order audit when optional categories are refused", async () => {
    await boot();
    await analytics.trackCheckoutEvent("order", "payment_started", {});
    expect(api.rpc).toHaveBeenCalledWith("track_order_event", expect.objectContaining({ p_order_id: "order" }));
  });
});
