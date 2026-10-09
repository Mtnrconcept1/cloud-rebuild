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
});
