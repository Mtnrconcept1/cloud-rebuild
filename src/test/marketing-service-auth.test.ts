import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fallback, adminClient, createAdmin } = vi.hoisted(() => ({
  fallback: vi.fn(), adminClient: { marker: "admin-client" }, createAdmin: vi.fn(),
}));
vi.mock("../../supabase/functions/_shared/auth.ts", () => ({
  authenticateRequest: fallback,
  createAdminClient: createAdmin,
}));

import { authenticateMarketingRequest } from "../../supabase/functions/_shared/marketing-service-auth";

describe("marketing service API key authentication", () => {
  let configured: string | undefined;
  const known = "sb_secret_configured-test-key";
  const request = (headers: Record<string, string> = {}) => new Request("https://example.test", { headers });

  beforeEach(() => {
    configured = JSON.stringify({ default: known, worker: "sb_secret_other-test-key" });
    vi.stubGlobal("Deno", { env: { get: (name: string) => name === "SUPABASE_SECRET_KEYS" ? configured : undefined } });
    fallback.mockReset().mockRejectedValue(Object.assign(new Error("Unauthorized"), { status: 401 }));
    createAdmin.mockReset().mockReturnValue(adminClient);
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(["sb_secret_configured-test-key", "sb_secret_other-test-key"])("accepts only an exact configured key: %s", async (apikey) => {
    const actor = await authenticateMarketingRequest(request({ apikey }));
    expect(actor).toMatchObject({ adminClient, authMode: "service_role", isServiceRole: true, userId: null });
    expect(fallback).not.toHaveBeenCalled();
    expect(createAdmin).toHaveBeenCalledOnce();
  });

  it.each(["sb_secret_unknown-test-key", "sb_secret_configured-test-kez", "sb_secret_", "sb_publishable_public-key", "x".repeat(4_097), ""])("does not grant service privilege from an unconfigured apikey: %s", async (apikey) => {
    await expect(authenticateMarketingRequest(request({ apikey }))).rejects.toMatchObject({ status: 401 });
    expect(createAdmin).not.toHaveBeenCalled();
    expect(fallback).toHaveBeenCalledOnce();
  });

  it.each([undefined, "not-json", "null", "[]", JSON.stringify([known]), JSON.stringify(known), '{"default":123}', '{"default":"sb_publishable_public-key"}'])("fails closed on malformed new-key configuration: %s", async (value) => {
    configured = value;
    await expect(authenticateMarketingRequest(request({ apikey: known }))).rejects.toMatchObject({ status: 401 });
    expect(createAdmin).not.toHaveBeenCalled();
  });

  it("delegates the legacy bearer unchanged to existing service authentication", async () => {
    const req = request({ Authorization: "Bearer legacy-service-jwt" });
    const actor = { authMode: "service_role" };
    fallback.mockResolvedValueOnce(actor);
    await expect(authenticateMarketingRequest(req)).resolves.toBe(actor);
    expect(fallback).toHaveBeenCalledWith(req, { allowServiceRole: true, allowSchedulerSecret: false });
  });

  it.each([false, true])("enables scheduler authentication only on explicit opt-in: %s", async (allowSchedulerSecret) => {
    const req = request({ "x-internal-cron-secret": "scheduler-test-value" });
    if (allowSchedulerSecret) fallback.mockResolvedValueOnce({ authMode: "scheduler_secret" });
    if (allowSchedulerSecret) {
      await expect(authenticateMarketingRequest(req, { allowSchedulerSecret })).resolves.toMatchObject({ authMode: "scheduler_secret" });
    } else {
      await expect(authenticateMarketingRequest(req)).rejects.toMatchObject({ status: 401 });
    }
    expect(fallback).toHaveBeenCalledWith(req, { allowServiceRole: true, allowSchedulerSecret });
  });

  it("does not promote an authenticated user JWT to a service actor", async () => {
    const actor = { authMode: "user_jwt", isServiceRole: false };
    fallback.mockResolvedValueOnce(actor);
    await expect(authenticateMarketingRequest(request({ Authorization: "Bearer user-jwt" }))).resolves.toBe(actor);
    expect(createAdmin).not.toHaveBeenCalled();
  });

  it("never accepts the secret key solely from an Authorization header", async () => {
    await expect(authenticateMarketingRequest(request({ Authorization: `Bearer ${known}` }))).rejects.toMatchObject({ status: 401 });
    expect(createAdmin).not.toHaveBeenCalled();
  });
  it("authenticates an active rotated project key despite a stale Edge key snapshot", async () => {
    const rotated = "sb_secret_rotated-real-project-key";
    configured = JSON.stringify({ default: "sb_secret_previous-project-key" });
    vi.stubGlobal("Deno", { env: { get: (name: string) =>
      name === "SUPABASE_SECRET_KEYS" ? configured
      : name === "SUPABASE_URL" ? "https://wwcrtyoueexyxkkikaos.supabase.co" : undefined,
    } });
    const probe = vi.fn().mockResolvedValue(new Response("null", {
      status: 200, headers: { "content-type": "application/json; charset=utf-8" },
    }));
    vi.stubGlobal("fetch", probe);

    await expect(authenticateMarketingRequest(request({ apikey: rotated }))).resolves.toMatchObject({
      adminClient, authMode: "service_role", isServiceRole: true, userId: null,
    });
    expect(createAdmin).toHaveBeenCalledOnce();
    expect(fallback).not.toHaveBeenCalled();
    expect(probe).toHaveBeenCalledOnce();
    const [url, init] = probe.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://wwcrtyoueexyxkkikaos.supabase.co/rest/v1/rpc/service_get_marketing_web_session");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ apikey: rotated, "Content-Type": "application/json" });
    expect(init.headers).not.toHaveProperty("Authorization");
    expect(JSON.parse(String(init.body))).toEqual({
      p_sid_hash: "0".repeat(64), p_csrf_hash: null, p_touch: false,
    });
  });

  it.each([
    { status: 401, contentType: "application/json", body: '{"message":"Unauthorized"}' },
    { status: 403, contentType: "application/json", body: '{"message":"Forbidden"}' },
    { status: 500, contentType: "application/json", body: '{"message":"Unavailable"}' },
    { status: 200, contentType: "text/html", body: "null" },
    { status: 200, contentType: "application/json", body: '{"session":"unexpected"}' },
  ])("rejects a rotated key when the service privilege probe replies $status $contentType", async ({ status, contentType, body }) => {
    vi.stubGlobal("Deno", { env: { get: (name: string) =>
      name === "SUPABASE_SECRET_KEYS" ? configured
      : name === "SUPABASE_URL" ? "https://wwcrtyoueexyxkkikaos.supabase.co" : undefined,
    } });
    const probe = vi.fn().mockResolvedValue(new Response(body, {
      status, headers: { "content-type": contentType },
    }));
    vi.stubGlobal("fetch", probe);
    await expect(authenticateMarketingRequest(request({ apikey: "sb_secret_unrecognized-project-key" })))
      .rejects.toMatchObject({ status: 401 });
    expect(createAdmin).not.toHaveBeenCalled();
    expect(probe).toHaveBeenCalledOnce();
  });

  it("fails closed on network errors and refuses to probe non-Supabase hosts", async () => {
    const probe = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", probe);
    vi.stubGlobal("Deno", { env: { get: (name: string) =>
      name === "SUPABASE_SECRET_KEYS" ? configured
      : name === "SUPABASE_URL" ? "https://wwcrtyoueexyxkkikaos.supabase.co" : undefined,
    } });
    await expect(authenticateMarketingRequest(request({ apikey: "sb_secret_rotated-project-key" })))
      .rejects.toMatchObject({ status: 401 });
    expect(createAdmin).not.toHaveBeenCalled();
    expect(probe).toHaveBeenCalledOnce();

    probe.mockClear();
    vi.stubGlobal("Deno", { env: { get: (name: string) =>
      name === "SUPABASE_SECRET_KEYS" ? configured
      : name === "SUPABASE_URL" ? "https://attacker.example.com" : undefined,
    } });
    await expect(authenticateMarketingRequest(request({ apikey: "sb_secret_rotated-project-key" })))
      .rejects.toMatchObject({ status: 401 });
    expect(probe).not.toHaveBeenCalled();
  });

});
