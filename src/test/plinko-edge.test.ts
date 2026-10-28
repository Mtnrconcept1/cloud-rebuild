import { createHash, webcrypto } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  consume: vi.fn(),
  createAdminClient: vi.fn(),
  HttpError: class HttpError extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
}));

vi.mock("../../supabase/functions/_shared/auth.ts", () => ({
  HttpError: mocks.HttpError,
  createAdminClient: mocks.createAdminClient,
  jsonResponse: (payload: unknown, status: number, headers: Record<string, string> = {}) => new Response(JSON.stringify(payload), {
    status, headers: { "content-type": "application/json", ...headers },
  }),
}));
vi.mock("../../supabase/functions/_shared/cors.ts", () => ({
  buildCorsHeaders: () => ({ "Access-Control-Allow-Origin": "https://www.thetok.ch" }),
  handleCorsPreflight: () => null,
}));
vi.mock("../../supabase/functions/_shared/rate-limit.ts", () => ({
  createRateLimiter: () => ({ consume: mocks.consume }),
}));

let handleRequest: (request: Request) => Promise<Response>;
const token = "ab".repeat(32);
const tokenHash = createHash("sha256").update(token).digest("hex");
const requestId = "a5a90696-4ce1-47e8-8d95-ab369d6f73cd";

function request(payload: unknown, headers: Record<string, string> = {}) {
  return handleRequest(new Request("https://tok.test/functions/v1/plinko-play", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "192.0.2.10", ...headers },
    body: JSON.stringify(payload),
  }));
}

beforeAll(async () => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("Deno", { serve: (handler: typeof handleRequest) => { handleRequest = handler; } });
  await import("../../supabase/functions/plinko-play/index.ts");
});
beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ data: { ok: true, available: true, play: null }, error: null });
  mocks.consume.mockReset().mockResolvedValue(undefined);
  mocks.createAdminClient.mockReset().mockReturnValue({ rpc: mocks.rpc });
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => vi.unstubAllGlobals());

describe("actual anonymous Plinko HTTP handler", () => {
  it("starts without authentication and returns a bearer token while persisting only its hash", async () => {
    const response = await request({ action: "start" });
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("create_plinko_session", {
      p_token_hash: createHash("sha256").update(result.token).digest("hex"),
    });
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toContain(result.token);
    expect(JSON.stringify(mocks.consume.mock.calls)).not.toContain(result.token);
    expect(JSON.stringify(mocks.consume.mock.calls)).not.toContain("192.0.2.10");
  });

  it.each([undefined, "", "not-a-session", "A".repeat(64)])("rejects invalid status token %j before private data access", async (provided) => {
    const response = await request({ action: "status", token: provided });
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "invalid_plinko_session" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("uses the visitor token hash for status and never echoes the credential", async () => {
    const response = await request({ action: "status", token });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("get_plinko_status", { p_token_hash: tokenHash });
    expect(await response.json()).not.toHaveProperty("token");
    expect(mocks.consume).toHaveBeenCalledWith(`session:${tokenHash}:status`, expect.objectContaining({ maxRequests: 120 }));
  });

  it("ignores client outcomes and generates the draw with server crypto", async () => {
    const random = vi.spyOn(crypto, "getRandomValues").mockImplementation((buffer) => {
      (buffer as Uint32Array)[0] = 9999;
      return buffer;
    });
    const response = await request({ action: "play", token, outcome: "free_meal", landing: 0, reward: "jackpot" }, { "Idempotency-Key": requestId });

    expect(response.status).toBe(200);
    expect(random).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("record_plinko_play", {
      p_token_hash: tokenHash,
      p_request_id: requestId,
      p_outcome: "lost",
      p_rng_nonce: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it.each([undefined, "not-a-uuid"])("requires a valid UUID idempotency header for play (%j)", async (key) => {
    const response = await request({ action: "play", token }, key ? { "Idempotency-Key": key } : {});
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false, error: "A valid UUID Idempotency-Key is required" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("normalizes claim email and defaults marketing consent to false", async () => {
    const response = await request({ action: "claim", token, email: " Winner+TOK@Example.CH " });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("claim_plinko_reward", {
      p_token_hash: tokenHash, p_email: "winner+tok@example.ch", p_marketing_consent: false,
    });
    expect(JSON.stringify(mocks.consume.mock.calls)).not.toContain("winner");
    expect(await response.json()).not.toHaveProperty("email");
  });

  it("records explicit marketing opt-in only when boolean true", async () => {
    await request({ action: "claim", token, email: "winner@example.ch", marketingConsent: true });
    expect(mocks.rpc).toHaveBeenCalledWith("claim_plinko_reward", expect.objectContaining({ p_marketing_consent: true }));
  });

  it.each(["true", "false", 1, null])("rejects non-boolean marketing consent %j", async (marketingConsent) => {
    const response = await request({ action: "claim", token, email: "winner@example.ch", marketingConsent });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid_marketing_consent" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([undefined, "winner", "winner@example.ch\n"])("rejects invalid claim email %j", async (email) => {
    const response = await request({ action: "claim", token, email });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid_plinko_email" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(["start", "status", "play"])("does not collect email during %s", async (action) => {
    await request({ action, token, email: "invalid-email", marketingConsent: "invalid" }, { "Idempotency-Key": requestId });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty("p_email");
    expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty("p_marketing_consent");
  });

  it("fails closed when persistent rate limiting is unavailable", async () => {
    mocks.consume.mockRejectedValueOnce(new mocks.HttpError(503, "rate_limiter_unavailable"));
    const response = await request({ action: "start" });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "rate_limiter_unavailable" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects bodies larger than 4096 bytes before accessing the backend", async () => {
    const response = await request({ action: "start", padding: "x".repeat(4096) });
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ ok: false, error: "request_too_large" });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["plinko_email_already_used", 409], ["plinko_already_claimed", 409],
    ["plinko_no_prize", 409], ["invalid_plinko_session", 401],
  ])("maps database error %s to %s without exposing raw details", async (code, status) => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: `internal detail: ${code}; private@example.ch; ${token}` } });
    const response = await request({ action: "claim", token, email: "winner@example.ch" });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ ok: false, error: code });
  });

  it("returns a generic error when the database RPC fails", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: `private backend error user@example.ch ${token}`, code: "XX000" } });
    const response = await request({ action: "status", token });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "plinko_unavailable" });
  });

  it("returns a generic error when an unexpected dependency throws", async () => {
    mocks.rpc.mockRejectedValueOnce(new Error(`private backend detail ${token}`));
    const response = await request({ action: "status", token });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "plinko_unavailable" });
  });

  it("does not treat an incomplete RPC result as success", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    const response = await request({ action: "status", token });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "plinko_unavailable" });
  });
});
