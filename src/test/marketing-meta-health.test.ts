import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkMetaMarketingConnections } from "../../supabase/functions/_shared/meta-marketing-health";

const token = "test-token-never-return-this-value";
function fixture(options: { missing?: boolean; mismatch?: boolean; dbFailure?: boolean } = {}) {
  const updates: Record<string, unknown>[] = [];
  const client = { from: () => {
    let channel = "";
    const query = {
      select: () => query, eq: (_key: string, value: unknown) => { channel = String(value); return query; },
      order: () => query, limit: () => query,
      maybeSingle: async () => ({ error: null, data: options.missing ? null : {
        id: channel, status: "disconnected", public_configuration: {
          page_id: "123456", ig_user_id: options.mismatch ? "999999" : "654321", graph_version: "v23.0",
        },
      } }),
      update: (patch: Record<string, unknown>) => { updates.push(patch); return { eq: async () => ({ error: options.dbFailure ? new Error(token) : null }) }; },
    };
    return query;
  } };
  return { client: client as unknown as Parameters<typeof checkMetaMarketingConnections>[0], updates };
}

describe("Meta connection health", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("Deno", { env: { get: (name: string) => name === "META_SYSTEM_USER_TOKEN" ? token : "test-app-secret-value" } });
    vi.stubGlobal("fetch", vi.fn(async (url: URL) => new Response(JSON.stringify(
      url.pathname.endsWith("123456") ? { id: "123456", name: "TOK Page", instagram_business_account: { id: "654321" } }
        : { id: "654321", username: "tok" },
    ), { status: 200 })));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("checks both identities with bearer auth and never changes a disconnected integration status", async () => {
    const { client, updates } = fixture();
    const result = await checkMetaMarketingConnections(client);
    expect(result.accounts.map((account) => account.status)).toEqual(["connected", "connected"]);
    expect(result.accounts.map((account) => account.accountName)).toEqual(["TOK Page", "tok"]);
    expect(updates).toHaveLength(2);
    for (const patch of updates) expect(Object.keys(patch).sort()).toEqual(["last_checked_at", "last_error"]);
    for (const [url, init] of vi.mocked(fetch).mock.calls) {
      expect(String(url)).not.toContain(token);
      expect(String(url)).toContain("appsecret_proof=");
      expect(init).toMatchObject({ method: "GET", redirect: "error", headers: { Authorization: `Bearer ${token}` } });
    }
  });

  it("rejects an Instagram account not linked to the configured Page", async () => {
    const result = await checkMetaMarketingConnections(fixture({ mismatch: true }).client);
    expect(result.accounts[0].status).toBe("connected");
    expect(result.accounts[1]).toMatchObject({ status: "blocked_configuration", accountName: null, accountId: null });
    expect(result.accounts[1].reason).toContain("Page liée");
  });

  it("does not call Meta for a missing integration", async () => {
    const result = await checkMetaMarketingConnections(fixture({ missing: true }).client);
    expect(result.accounts.every((account) => account.status === "blocked_configuration")).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sanitizes provider errors and stores only a controlled reason", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error(`sensitive=${token}`));
    const { client, updates } = fixture();
    const result = await checkMetaMarketingConnections(client);
    expect(result.accounts.every((account) => account.status === "blocked_configuration")).toBe(true);
    expect(JSON.stringify({ result, updates })).not.toContain(token);
  });

  it("fails closed on malformed and oversized provider responses", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("x".repeat(65_000)));
    const result = await checkMetaMarketingConnections(fixture().client);
    expect(result.accounts.every((account) => account.status === "blocked_configuration")).toBe(true);
  });

  it("does not announce a persisted check when the database update fails", async () => {
    await expect(checkMetaMarketingConnections(fixture({ dbFailure: true }).client)).rejects.toThrow("meta_health_storage_unavailable");
  });

  it("rejects a response naming a different Facebook Page", async () => {
    vi.mocked(fetch).mockImplementation(async () => new Response(JSON.stringify({ id: "999999", name: "Wrong Page" })));
    const result = await checkMetaMarketingConnections(fixture().client);
    expect(result.accounts.every((account) => account.status === "blocked_configuration" && account.accountId === null)).toBe(true);
  });

  it("avoids network calls when server credentials are missing", async () => {
    vi.stubGlobal("Deno", { env: { get: () => undefined } });
    const result = await checkMetaMarketingConnections(fixture().client);
    expect(result.accounts.every((account) => account.status === "blocked_configuration")).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("aborts each stalled provider check after ten seconds", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    const resultPromise = checkMetaMarketingConnections(fixture().client);
    // Crypto is asynchronous outside the fake clock; allow its HMAC work to finish.
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await resultPromise;
    expect(result.accounts.every((account) => account.status === "blocked_configuration")).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
