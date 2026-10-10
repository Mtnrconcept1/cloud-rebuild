import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ErrorEvent } from "@sentry/react";

type Options = Parameters<typeof import("@sentry/react")["init"]>[0];

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    from: () => ({ insert: vi.fn().mockResolvedValue({ error: null }) }),
  }),
}));

let monitoring: typeof import("@/lib/monitoring");
let consent: typeof import("@/lib/consent");
let cleanup: (() => void) | undefined;
let listeners: ReturnType<typeof vi.spyOn>;
let loadGate: Promise<void> | undefined;
const sdk = {
  loaded: vi.fn(),
  init: vi.fn((options: Options) => ({ getOptions: () => options })),
  setUser: vi.fn(),
  clearCurrent: vi.fn(),
  clearIsolation: vi.fn(),
  setTag: vi.fn(),
  setExtra: vi.fn(),
  captureException: vi.fn(),
  send: vi.fn().mockResolvedValue({ statusCode: 200 }),
  flush: vi.fn().mockResolvedValue(true),
};

async function settle() {
  await vi.dynamicImportSettled();
  await Promise.resolve();
}

async function boot() {
  consent = await import("@/lib/consent");
  monitoring = await import("@/lib/monitoring");
  cleanup = monitoring.initMonitoring();
}

function options() {
  return sdk.init.mock.calls.at(-1)![0];
}

function storeChoice(analytics: boolean) {
  window.localStorage.setItem(consent.CONSENT_STORAGE_KEY, JSON.stringify({
    version: consent.CONSENT_VERSION,
    preferences: { ...consent.DEFAULT_CONSENT, analytics },
    recordedAt: "2026-10-10T10:00:00.000Z",
    source: "settings",
  }));
}

function storageChange(key: string | null = consent.CONSENT_STORAGE_KEY) {
  window.dispatchEvent(new StorageEvent("storage", { key }));
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("VITE_SENTRY_DSN", "https://publicKey@o0.ingest.sentry.io/123");
  window.localStorage.clear();
  loadGate = undefined;
  cleanup = undefined;
  listeners = vi.spyOn(window, "addEventListener");
  vi.doMock("@sentry/react", async () => {
    sdk.loaded();
    if (loadGate) await loadGate;
    return {
      init: sdk.init,
      setUser: sdk.setUser,
      getCurrentScope: () => ({ clear: sdk.clearCurrent }),
      getIsolationScope: () => ({ clear: sdk.clearIsolation }),
      withScope: (callback: (scope: unknown) => void) => callback({ setTag: sdk.setTag, setExtra: sdk.setExtra }),
      captureException: sdk.captureException,
      makeFetchTransport: () => ({ send: sdk.send, flush: sdk.flush }),
    };
  });
});

afterEach(() => {
  cleanup?.();
  for (const [name, listener] of listeners.mock.calls) {
    window.removeEventListener(name, listener);
  }
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("browser monitoring consent lifecycle", () => {
  it("does not import or capture before consent, on refusal or for unrelated categories", async () => {
    await boot();
    monitoring.captureException(new Error("before consent"));
    monitoring.setMonitoringUser({ id: "account-a", email: "private@example.test" });
    await consent.saveConsent({ analytics: false, marketing: true, personalization: true });
    monitoring.captureException(new Error("refused"));
    await settle();
    expect(sdk.loaded).not.toHaveBeenCalled();
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it.each(["", "https://REPLACE_PUBLIC_KEY@o0.ingest.sentry.io/0", "invalid"])("does not load the SDK for missing/invalid DSN %s", async (dsn) => {
    vi.stubEnv("VITE_SENTRY_DSN", dsn);
    await boot();
    await consent.saveConsent({ analytics: true });
    monitoring.captureException(new Error("configured consent, no DSN"));
    await settle();
    expect(sdk.loaded).not.toHaveBeenCalled();
  });

  it("initializes once after acceptance and never replays errors captured before it", async () => {
    await boot();
    monitoring.captureException(new Error("before"));
    await consent.saveConsent({ analytics: true });
    monitoring.initMonitoring();
    await settle();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.captureException).not.toHaveBeenCalled();
    const error = new Error("after");
    monitoring.captureException(error, { tags: { boundary: "root", email: "private@example.test" }, extra: { payload: "secret" } });
    await settle();
    expect(sdk.captureException).toHaveBeenCalledExactlyOnceWith(error);
    expect(sdk.setTag).toHaveBeenCalledExactlyOnceWith("boundary", "root");
    expect(sdk.setExtra).not.toHaveBeenCalled();
  });

  it("honors an already saved choice at startup", async () => {
    consent = await import("@/lib/consent");
    storeChoice(true);
    await boot();
    await settle();
    expect(sdk.init).toHaveBeenCalledTimes(1);
  });

  it.each(["{", JSON.stringify({ version: "old", preferences: { analytics: true } }), JSON.stringify({ version: "cookies-2026-07-v3", preferences: { analytics: true }, recordedAt: "today" })])("rejects corrupt, outdated or incomplete consent", async (receipt) => {
    consent = await import("@/lib/consent");
    window.localStorage.setItem(consent.CONSENT_STORAGE_KEY, receipt);
    await boot();
    await settle();
    expect(sdk.loaded).not.toHaveBeenCalled();
  });

  it("fails closed when browser storage cannot be read", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    await boot();
    monitoring.captureException(new Error("private"));
    await settle();
    expect(sdk.loaded).not.toHaveBeenCalled();
  });

  it("blocks old callbacks and transport on withdrawal, including after reacceptance", async () => {
    await boot();
    await consent.saveConsent({ analytics: true });
    await settle();
    const old = options();
    const transport = old.transport!({ url: "https://o0.ingest.sentry.io/envelope/", recordDroppedEvent: vi.fn() });
    await transport.send([{}, [[{ type: "event" }, {}]]]);
    expect(sdk.send).toHaveBeenCalledTimes(1);
    await consent.saveConsent({ analytics: false });
    monitoring.captureException(new Error("withdrawn"));
    expect(old.enabled).toBe(false);
    expect(old.beforeSend!({ message: "queued" }, {})).toBeNull();
    expect(old.beforeBreadcrumb!({ category: "navigation" }, {})).toBeNull();
    await transport.send([{}, [[{ type: "event" }, {}]]]);
    await settle();
    expect(sdk.send).toHaveBeenCalledTimes(1);
    expect(sdk.captureException).not.toHaveBeenCalled();
    await consent.saveConsent({ analytics: true });
    await settle();
    expect(sdk.init).toHaveBeenCalledTimes(2);
    expect(old.beforeSend!({ message: "stale" }, {})).toBeNull();
    await transport.send([{}, [[{ type: "event" }, {}]]]);
    expect(sdk.send).toHaveBeenCalledTimes(1);
    expect(options().beforeSend!({ message: "current" }, {})).toMatchObject({ message: "current" });
  });

  it("cancels initialization when consent is withdrawn during SDK import", async () => {
    let release!: () => void;
    loadGate = new Promise<void>((resolve) => { release = resolve; });
    await boot();
    await consent.saveConsent({ analytics: true });
    monitoring.captureException(new Error("queued"));
    await consent.saveConsent({ analytics: false });
    release();
    await settle();
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
  });

  it("clears scopes on account changes/logout and discards pending errors without transmitting identity", async () => {
    await boot();
    monitoring.setMonitoringUser({ id: "account-a", email: "first@example.test" });
    await consent.saveConsent({ analytics: true });
    await settle();
    const first = options();
    monitoring.captureException(new Error("previous account, queued"));
    monitoring.setMonitoringUser({ id: "account-b", email: "second@example.test" });
    await settle();
    expect(sdk.captureException).not.toHaveBeenCalled();
    expect(first.enabled).toBe(false);
    expect(sdk.init).toHaveBeenCalledTimes(2);
    const second = options();
    const clearCount = sdk.clearCurrent.mock.calls.length;
    monitoring.setMonitoringUser(null);
    await settle();
    expect(second.enabled).toBe(false);
    expect(sdk.clearCurrent.mock.calls.length).toBeGreaterThan(clearCount);
    expect(sdk.clearIsolation.mock.calls.length).toBeGreaterThan(clearCount);
    expect(sdk.setUser.mock.calls.every(([user]) => user === null)).toBe(true);
    expect(sdk.init).toHaveBeenCalledTimes(3);
  });

  it("follows cross-tab acceptance, withdrawal and storage clearing", async () => {
    await boot();
    storeChoice(true);
    storageChange();
    await settle();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    const first = options();
    storeChoice(false);
    expect(first.beforeSend!({ type: undefined, message: "storage already revoked" }, {})).toBeNull();
    storageChange();
    expect(first.enabled).toBe(false);
    storeChoice(true);
    storageChange();
    await settle();
    const second = options();
    window.localStorage.clear();
    storageChange(null);
    expect(second.enabled).toBe(false);
  });

  it("applies withdrawal even when storage writes fail, then honors a later cross-tab choice", async () => {
    await boot();
    await consent.saveConsent({ analytics: true });
    await settle();
    const first = options();
    const storage = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    await expect(consent.saveConsent({ analytics: false })).resolves.toMatchObject({ preferences: { analytics: false } });
    expect(consent.hasConsent("analytics")).toBe(false);
    expect(window.localStorage.getItem(consent.CONSENT_STORAGE_KEY)).toBeNull();
    expect(first.enabled).toBe(false);
    expect(first.beforeSend!({ message: "no" }, {})).toBeNull();
    storage.mockRestore();
    storeChoice(true);
    storageChange();
    await settle();
    expect(consent.hasConsent("analytics")).toBe(true);
    expect(sdk.init).toHaveBeenCalledTimes(2);
  });

  it("keeps withdrawal effective in memory when both writing and removing storage are blocked", async () => {
    await boot();
    await consent.saveConsent({ analytics: true });
    await settle();
    const previous = options();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new Error("blocked"); });
    await consent.saveConsent({ analytics: false });
    expect(consent.hasConsent("analytics")).toBe(false);
    expect(previous.enabled).toBe(false);
    expect(previous.beforeSend!({ type: undefined, message: "blocked storage" }, {})).toBeNull();
  });
});

describe("outgoing browser telemetry minimization", () => {
  beforeEach(async () => {
    await boot();
    await consent.saveConsent({ analytics: true });
    await settle();
  });

  it("keeps diagnostic stacks/source maps while removing identity, arbitrary payloads and secrets", () => {
    const email = "private@example.test";
    const token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJwcml2YXRlIn0.signature";
    const id = "11111111-2222-4333-8444-555555555555";
    const event: ErrorEvent = {
      type: undefined,
      message: `Failure ${email} Bearer sensitive-bearer password=private-password ${token} ${id}`,
      user: { id, email, ip_address: "192.0.2.1" },
      contexts: { account: { token } },
      tags: { boundary: "root", account: email },
      extra: { componentStack: `at Root https://thetok.ch/assets/index.js?token=${token}`, payload: { token } },
      request: { url: `https://name:private-password@thetok.ch/auth?access_token=${token}#${email}`, headers: { Authorization: token }, data: { email } },
      exception: { values: [{ type: "Error", value: `Cannot load ${email} {"access_token":"private-access"}`, stacktrace: { frames: [{ filename: `https://thetok.ch/assets/index.js?key=${token}`, function: "render", lineno: 42, colno: 7, vars: { email } }] } }] },
      debug_meta: { images: [{ type: "sourcemap", code_file: `https://thetok.ch/assets/index.js?key=${token}`, debug_id: "build-debug-id" }] },
      breadcrumbs: [{ category: "console", message: token }, { category: "fetch", data: { url: `https://thetok.ch/api?token=${token}`, method: "POST", status_code: 500, request_body: email } }],
    };
    const hint = { attachments: [{ filename: "private.txt", data: email }] };
    const result = options().beforeSend!(event, hint);
    const serialized = JSON.stringify(result);
    for (const privateValue of [email, token, id, "private-password", "private-access", "sensitive-bearer", "192.0.2.1"]) {
      expect(serialized).not.toContain(privateValue);
    }
    expect(result).toMatchObject({
      tags: { boundary: "root" },
      request: { url: "https://thetok.ch/auth" },
      exception: { values: [{ type: "Error", stacktrace: { frames: [{ filename: "https://thetok.ch/assets/index.js", function: "render", lineno: 42, colno: 7 }] } }] },
      debug_meta: { images: [{ type: "sourcemap", code_file: "https://thetok.ch/assets/index.js", debug_id: "build-debug-id" }] },
    });
    expect(hint.attachments).toEqual([]);
    expect(result).not.toHaveProperty("user");
    expect(result).not.toHaveProperty("contexts");
  });

  it("keeps bounded navigation/network breadcrumbs only", () => {
    const filter = options().beforeBreadcrumb!;
    for (const category of ["console", "ui.click", "ui.input", "custom"]) {
      expect(filter({ category, message: "private@example.test", data: { arguments: ["token"] } }, {})).toBeNull();
    }
    expect(filter({ category: "navigation", data: { from: "/auth?code=secret", to: "/users/private%40example.test#token", other: "private" } }, {})).toMatchObject({ data: { from: "/auth", to: "/users/[email]" } });
    expect(filter({ category: "fetch", message: "private", data: { url: "https://name:password@example.test/api?token=secret", method: "POST", status_code: 403, headers: { token: "secret" } } }, {})).toMatchObject({ data: { url: "https://example.test/api", method: "POST", status_code: 403 } });
    expect(filter({ category: "navigation", data: { to: "capacitor://localhost/dashboard?code=secret" } }, {})).toMatchObject({ data: { to: "capacitor://localhost/dashboard" } });
  });

  it("disables independent session/log/report envelopes and preserves injected-script filtering", () => {
    const config = options();
    expect(config).toMatchObject({ sendDefaultPii: false, sendClientReports: false, enableLogs: false });
    expect(typeof config.integrations).toBe("function");
    if (typeof config.integrations === "function") {
      expect(config.integrations(["BrowserSession", "HttpContext", "ConversationId", "GlobalHandlers"].map((name) => ({ name })))).toEqual([{ name: "GlobalHandlers" }]);
    }
    expect(config.beforeSendTransaction!({ type: "transaction" }, {})).toBeNull();
    expect(config.beforeSend!({ exception: { values: [{ stacktrace: { frames: [{ filename: "webkit-masked-url://hidden/" }] } }] } }, {})).toBeNull();
  });
});
