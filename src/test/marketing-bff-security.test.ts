import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MARKETING_CSRF_COOKIE,
  MARKETING_OPERATION_NAMES,
  marketingLoginHandler,
  marketingMfaEnrollHandler,
  marketingMfaVerifyHandler,
  marketingRpcHandler,
  marketingSessionHandler,
  parseCookies,
  sha256Hex,
  validateMarketingRequestContext,
  type MarketingApiRequest,
  type MarketingApiResponse,
} from "../../server/marketingBff";

function request(headers: Record<string, string> = {}): MarketingApiRequest {
  return {
    method: "GET",
    headers: {
      host: "marketing.thetok.ch",
      "sec-fetch-site": "same-origin",
      ...headers,
    },
  };
}

function responseRecorder() {
  const headers = new Map<string, string | readonly string[]>();
  let body = "";
  const response: MarketingApiResponse = {
    statusCode: 0,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    end(value) {
      body = value ?? "";
    },
  };
  return { response, headers, get body() { return body; } };
}

function mutationRequest(body: Record<string, unknown>, cookieHeader: string): MarketingApiRequest {
  return {
    method: "POST",
    headers: {
      host: "marketing.thetok.ch",
      origin: "https://marketing.thetok.ch",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
      "content-type": "application/json",
      cookie: cookieHeader,
      "x-tok-marketing-csrf": "c".repeat(43),
      "x-forwarded-for": "192.0.2.1",
    },
    body,
  };
}

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function configureServerEnvironment() {
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_PUBLISHABLE_KEY = "publishable-key-longer-than-twenty";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-longer-than-twenty";
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("marketing server-only BFF", () => {
  it("uses the exact closed set of 24 marketing operations", () => {
    expect(MARKETING_OPERATION_NAMES).toHaveLength(24);
    expect(new Set(MARKETING_OPERATION_NAMES).size).toBe(24);
    expect(MARKETING_OPERATION_NAMES.every((name) => name.startsWith("admin_"))).toBe(true);
    expect(MARKETING_OPERATION_NAMES).toEqual(expect.arrayContaining([
      "admin_upsert_marketing_contact",
      "admin_suppress_marketing_contact",
      "admin_reveal_manual_delivery_target",
    ]));
  });

  it("rejects a non-allowlisted RPC before any session or database call", async () => {
    configureServerEnvironment();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const recorder = responseRecorder();
    await marketingRpcHandler(
      mutationRequest(
        { operation: "admin_execute_sql", args: {} },
        `${MARKETING_CSRF_COOKIE}=${"c".repeat(43)}`,
      ),
      recorder.response,
    );

    expect(recorder.response.statusCode).toBe(400);
    expect(JSON.parse(recorder.body)).toEqual({
      error: { code: "operation_rejected", message: "Opération refusée." },
    });
    expect(recorder.headers.get("cache-control")).toContain("no-store");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("hashes every opaque database handle", () => {
    const digest = sha256Hex("opaque-browser-handle");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain("opaque-browser-handle");
  });

  it("rejects non-marketing hosts and cross-site mutation metadata", () => {
    expect(() => validateMarketingRequestContext(request(), false)).not.toThrow();
    expect(() => validateMarketingRequestContext(request({ host: "www.thetok.ch" }), false)).toThrow();
    expect(() => validateMarketingRequestContext(request({
      origin: "https://marketing.thetok.ch",
      "sec-fetch-site": "cross-site",
    }), true)).toThrow();
    expect(() => validateMarketingRequestContext(request({
      origin: "https://marketing.thetok.ch",
      "sec-fetch-site": "same-origin",
      "sec-fetch-mode": "cors",
      "sec-fetch-dest": "empty",
    }), true)).not.toThrow();
  });

  it("returns the deployment smoke contract without consulting Supabase", async () => {
    const recorder = responseRecorder();
    await marketingSessionHandler(request(), recorder.response);

    expect(recorder.response.statusCode).toBe(401);
    expect(JSON.parse(recorder.body)).toEqual({ authenticated: false });
    expect(recorder.headers.get("cache-control")).toContain("no-store");
    const setCookie = recorder.headers.get("set-cookie");
    expect(Array.isArray(setCookie)).toBe(true);
    const csrf = (setCookie as readonly string[]).find((value) => (
      value.startsWith(`${MARKETING_CSRF_COOKIE}=`)
    ));
    expect(csrf).toContain("Secure");
    expect(csrf).toContain("SameSite=Strict");
    expect(csrf).toContain("Path=/");
    expect(csrf).not.toContain("HttpOnly");
    expect(recorder.body).not.toMatch(/access_token|refresh_token|service_role/i);
  });

  it("parses opaque cookies without decoding attacker-controlled values", () => {
    expect(parseCookies("a=one; b=two=three; broken")).toEqual({ a: "one", b: "two=three" });
  });

  it("matches the hardened SQL RPC contract and never sets token cookies", () => {
    const source = readFileSync(resolve(process.cwd(), "server/marketingBff.ts"), "utf8");
    expect(source).toContain("p_pending_sid_hash");
    expect(source).toContain("p_sid_hash");
    expect(source).toContain("p_csrf_hash");
    expect(source).toContain("p_touch");
    expect(source).toContain("p_expires_at");
    expect(source).not.toMatch(/p_pending_token|p_session_token|p_csrf_token|p_require_csrf/);
    expect(source).not.toMatch(/cookie\([^\n]*(accessToken|refreshToken|serviceRoleKey)/);
    expect(source).not.toMatch(/console\.(log|info|warn|error)/);
    expect(source).toContain('"x-marketing-actor-user-id": session.userId');
  });

  it("exposes only the intended Vercel routes", () => {
    for (const path of [
      "api/marketing/session.ts",
      "api/marketing/login.ts",
      "api/marketing/logout.ts",
      "api/marketing/mfa/enroll.ts",
      "api/marketing/mfa/verify.ts",
      "api/marketing/rpc.ts",
      "api/marketing/orchestrator.ts",
    ]) {
      expect(readFileSync(resolve(process.cwd(), path), "utf8")).toContain("export default");
    }
  });

  it("keeps password-login Supabase tokens server-side", async () => {
    configureServerEnvironment();
    const userId = "11111111-1111-4111-8111-111111111111";
    const factorId = "22222222-2222-4222-8222-222222222222";
    const challengeId = "33333333-3333-4333-8333-333333333333";
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/rpc/service_consume_marketing_auth_attempt")) {
        return json({ allowed: true, retry_after_seconds: 0 });
      }
      if (url.endsWith("/auth/v1/token?grant_type=password")) {
        return json({
          access_token: "supabase-access-token",
          refresh_token: "supabase-refresh-token",
          user: { id: userId, email: "admin@thetok.ch" },
        });
      }
      if (url.endsWith(`/auth/v1/admin/users/${userId}`)) {
        return json({ id: userId, email: "admin@thetok.ch" });
      }
      if (url.includes("/rest/v1/user_roles?")) return json([{ user_id: userId }]);
      if (url.endsWith("/auth/v1/user")) {
        return json({
          id: userId,
          email: "admin@thetok.ch",
          factors: [{
            id: factorId,
            factor_type: "totp",
            status: "verified",
            created_at: "2026-08-01T00:00:00.000Z",
          }],
        });
      }
      if (url.endsWith(`/auth/v1/factors/${factorId}/challenge`)) return json({ id: challengeId });
      if (url.endsWith("/rpc/service_store_marketing_auth_challenge")) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body.p_pending_sid_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(body.p_access_token).toBe("supabase-access-token");
        return json({ user_id: userId, expires_at: new Date(Date.now() + 600_000).toISOString() });
      }
      throw new Error(`Unexpected test request: ${url}`);
    }));

    const recorder = responseRecorder();
    await marketingLoginHandler(
      mutationRequest(
        { email: "admin@thetok.ch", password: "correct-password" },
        `${MARKETING_CSRF_COOKIE}=${"c".repeat(43)}`,
      ),
      recorder.response,
    );

    expect(recorder.response.statusCode).toBe(200);
    expect(JSON.parse(recorder.body)).toEqual({ status: "mfa_required" });
    expect(recorder.body).not.toMatch(/supabase-access-token|supabase-refresh-token/);
    const cookies = recorder.headers.get("set-cookie") as readonly string[];
    expect(cookies.some((value) => value.startsWith("__Host-tok_marketing_pending=") && value.includes("HttpOnly"))).toBe(true);
    expect(cookies.join(";")).not.toMatch(/supabase-access-token|supabase-refresh-token/);
  });

  it("refuses AAL1 TOTP bootstrap when another verified factor exists", async () => {
    configureServerEnvironment();
    const userId = "11111111-1111-4111-8111-111111111111";
    const phoneFactorId = "44444444-4444-4444-8444-444444444444";
    const requestedUrls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith("/rpc/service_consume_marketing_auth_attempt")) {
        return json({ allowed: true, retry_after_seconds: 0 });
      }
      if (url.endsWith("/auth/v1/token?grant_type=password")) {
        return json({
          access_token: "supabase-access-token",
          refresh_token: "supabase-refresh-token",
          user: { id: userId, email: "admin@thetok.ch" },
        });
      }
      if (url.endsWith(`/auth/v1/admin/users/${userId}`)) {
        return json({ id: userId, email: "admin@thetok.ch" });
      }
      if (url.includes("/rest/v1/user_roles?")) return json([{ user_id: userId }]);
      if (url.endsWith("/auth/v1/user")) {
        return json({
          id: userId,
          email: "admin@thetok.ch",
          factors: [{
            id: phoneFactorId,
            factor_type: "phone",
            status: "verified",
            created_at: "2026-08-01T00:00:00.000Z",
          }],
        });
      }
      if (url.endsWith("/auth/v1/logout?scope=local")) return new Response(null, { status: 204 });
      throw new Error(`Unexpected test request: ${url}`);
    }));

    const recorder = responseRecorder();
    await marketingLoginHandler(
      mutationRequest(
        { email: "admin@thetok.ch", password: "correct-password" },
        `${MARKETING_CSRF_COOKIE}=${"c".repeat(43)}`,
      ),
      recorder.response,
    );

    expect(recorder.response.statusCode).toBe(401);
    expect(JSON.parse(recorder.body)).toEqual({
      error: { code: "authentication_failed", message: "Authentification impossible." },
    });
    expect(requestedUrls.some((url) => url.endsWith("/auth/v1/factors"))).toBe(false);
    expect(requestedUrls.some((url) => url.endsWith("/rpc/service_store_marketing_auth_challenge"))).toBe(false);
    expect(requestedUrls.some((url) => url.endsWith("/auth/v1/logout?scope=local"))).toBe(true);
  });

  it("refuses the enrollment route if a non-TOTP factor became verified", async () => {
    configureServerEnvironment();
    const userId = "11111111-1111-4111-8111-111111111111";
    const factorId = "22222222-2222-4222-8222-222222222222";
    const challengeId = "33333333-3333-4333-8333-333333333333";
    const phoneFactorId = "44444444-4444-4444-8444-444444444444";
    const requestedUrls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.endsWith("/rpc/service_get_marketing_auth_challenge")) {
        return json({
          user_id: userId,
          access_token: "aal1-access-token",
          refresh_token: "aal1-refresh-token",
          factor_id: factorId,
          challenge_id: challengeId,
          expires_at: new Date(Date.now() + 300_000).toISOString(),
        });
      }
      if (url.endsWith("/rpc/service_consume_marketing_auth_attempt")) {
        return json({ allowed: true, retry_after_seconds: 0 });
      }
      if (url.endsWith(`/auth/v1/admin/users/${userId}`)) {
        return json({ id: userId, email: "admin@thetok.ch" });
      }
      if (url.includes("/rest/v1/user_roles?")) return json([{ user_id: userId }]);
      if (url.endsWith("/auth/v1/user")) {
        return json({
          id: userId,
          email: "admin@thetok.ch",
          factors: [{
            id: phoneFactorId,
            factor_type: "phone",
            status: "verified",
            created_at: "2026-08-01T00:00:00.000Z",
          }],
        });
      }
      if (url.endsWith("/auth/v1/logout?scope=local")) return new Response(null, { status: 204 });
      throw new Error(`Unexpected test request: ${url}`);
    }));

    const recorder = responseRecorder();
    await marketingMfaEnrollHandler(
      mutationRequest(
        {},
        `${MARKETING_CSRF_COOKIE}=${"c".repeat(43)}; __Host-tok_marketing_pending=${"p".repeat(43)}`,
      ),
      recorder.response,
    );

    expect(recorder.response.statusCode).toBe(403);
    expect(JSON.parse(recorder.body)).toEqual({
      error: { code: "enrollment_forbidden", message: "Enrôlement refusé." },
    });
    expect(requestedUrls.some((url) => url.endsWith("/auth/v1/factors"))).toBe(false);
    expect(requestedUrls.some((url) => url.endsWith("/rpc/service_store_marketing_auth_challenge"))).toBe(false);
    expect(requestedUrls.some((url) => url.endsWith("/auth/v1/logout?scope=local"))).toBe(true);
    const cookies = recorder.headers.get("set-cookie") as readonly string[];
    expect(cookies.some((value) => (
      value.startsWith("__Host-tok_marketing_pending=;") && value.includes("Max-Age=0")
    ))).toBe(true);
  });

  it("finalizes only a fresh AAL2 result into opaque cookies", async () => {
    configureServerEnvironment();
    const userId = "11111111-1111-4111-8111-111111111111";
    const factorId = "22222222-2222-4222-8222-222222222222";
    const challengeId = "33333333-3333-4333-8333-333333333333";
    const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1_000).toISOString();
    const claims = Buffer.from(JSON.stringify({
      aal: "aal2",
      sub: userId,
      iss: "https://project.supabase.co/auth/v1",
      iat: Math.floor(Date.now() / 1_000),
      exp: Math.floor(Date.now() / 1_000) + 3_600,
      amr: [{ method: "totp" }],
    })).toString("base64url");
    const aal2Token = `header.${claims}.signature`;
    const consumedRateKeys = new Set<string>();
    const clearedRateKeys = new Set<string>();

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/rpc/service_get_marketing_auth_challenge")) {
        return json({
          user_id: userId,
          access_token: "aal1-access-token",
          refresh_token: "aal1-refresh-token",
          factor_id: factorId,
          challenge_id: challengeId,
          expires_at: new Date(Date.now() + 300_000).toISOString(),
        });
      }
      if (url.endsWith("/rpc/service_consume_marketing_auth_attempt")) {
        const body = JSON.parse(String(init?.body)) as { p_key_hash: string };
        consumedRateKeys.add(body.p_key_hash);
        return json({ allowed: true, retry_after_seconds: 0 });
      }
      if (url.endsWith(`/auth/v1/factors/${factorId}/verify`)) {
        return json({
          access_token: aal2Token,
          refresh_token: "aal2-refresh-token",
          user: { id: userId, email: "admin@thetok.ch" },
        });
      }
      if (url.endsWith("/auth/v1/user")) return json({ id: userId, email: "admin@thetok.ch" });
      if (url.endsWith(`/auth/v1/admin/users/${userId}`)) {
        return json({ id: userId, email: "admin@thetok.ch" });
      }
      if (url.includes("/rest/v1/user_roles?")) return json([{ user_id: userId }]);
      if (url.endsWith("/rpc/service_finalize_marketing_web_session")) {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(body.p_pending_sid_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(body.p_sid_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(body.p_csrf_hash).toMatch(/^[0-9a-f]{64}$/);
        return json({ user_id: userId, email: "admin@thetok.ch", expires_at: expiresAt });
      }
      if (url.endsWith("/auth/v1/logout?scope=local")) return new Response(null, { status: 204 });
      if (url.endsWith("/rpc/service_clear_marketing_auth_attempt")) {
        const body = JSON.parse(String(init?.body)) as { p_key_hash: string };
        clearedRateKeys.add(body.p_key_hash);
        return new Response(null, { status: 204 });
      }
      if (url.endsWith("/rpc/service_revoke_marketing_web_session")) return json(true);
      throw new Error(`Unexpected test request: ${url}`);
    }));

    const recorder = responseRecorder();
    await marketingMfaVerifyHandler(
      mutationRequest(
        { code: "123456" },
        `${MARKETING_CSRF_COOKIE}=${"c".repeat(43)}; __Host-tok_marketing_pending=${"p".repeat(43)}`,
      ),
      recorder.response,
    );

    expect(recorder.response.statusCode).toBe(200);
    expect(JSON.parse(recorder.body)).toMatchObject({
      status: "authenticated",
      session: { authenticated: true, admin: true, aal: "aal2" },
    });
    expect(recorder.body).not.toContain(aal2Token);
    expect(recorder.body).not.toContain("aal2-refresh-token");
    expect(recorder.body).not.toMatch(/access_token|refresh_token/i);
    const cookies = recorder.headers.get("set-cookie") as readonly string[];
    const sid = cookies.find((value) => value.startsWith("__Host-tok_marketing_sid="));
    const csrf = cookies.find((value) => value.startsWith(`${MARKETING_CSRF_COOKIE}=`));
    expect(sid).toContain("HttpOnly");
    expect(sid).toContain("SameSite=Strict");
    expect(csrf).not.toContain("HttpOnly");
    expect(cookies.join(";")).not.toMatch(/aal2-refresh-token|aal1-access-token/);
    expect(consumedRateKeys.size).toBe(2);
    for (const key of consumedRateKeys) expect(clearedRateKeys.has(key)).toBe(true);
  });

  it("does not clear either MFA bucket after a rejected TOTP code", async () => {
    configureServerEnvironment();
    const userId = "11111111-1111-4111-8111-111111111111";
    const factorId = "22222222-2222-4222-8222-222222222222";
    const challengeId = "33333333-3333-4333-8333-333333333333";
    const nextChallengeId = "55555555-5555-4555-8555-555555555555";
    const consumedRateKeys = new Set<string>();
    let clearCalls = 0;

    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/rpc/service_get_marketing_auth_challenge")) {
        return json({
          user_id: userId,
          access_token: "aal1-access-token",
          refresh_token: "aal1-refresh-token",
          factor_id: factorId,
          challenge_id: challengeId,
          expires_at: new Date(Date.now() + 300_000).toISOString(),
        });
      }
      if (url.endsWith("/rpc/service_consume_marketing_auth_attempt")) {
        const body = JSON.parse(String(init?.body)) as { p_key_hash: string };
        consumedRateKeys.add(body.p_key_hash);
        return json({ allowed: true, retry_after_seconds: 0 });
      }
      if (url.endsWith(`/auth/v1/factors/${factorId}/verify`)) {
        return json({ error: "invalid_code" }, 422);
      }
      if (url.endsWith(`/auth/v1/factors/${factorId}/challenge`)) {
        return json({ id: nextChallengeId });
      }
      if (url.endsWith("/rpc/service_store_marketing_auth_challenge")) {
        return json({ user_id: userId, expires_at: new Date(Date.now() + 600_000).toISOString() });
      }
      if (url.endsWith("/rpc/service_clear_marketing_auth_attempt")) {
        clearCalls += 1;
        return new Response(null, { status: 204 });
      }
      throw new Error(`Unexpected test request: ${url}`);
    }));

    const recorder = responseRecorder();
    await marketingMfaVerifyHandler(
      mutationRequest(
        { code: "123456" },
        `${MARKETING_CSRF_COOKIE}=${"c".repeat(43)}; __Host-tok_marketing_pending=${"p".repeat(43)}`,
      ),
      recorder.response,
    );

    expect(recorder.response.statusCode).toBe(401);
    expect(consumedRateKeys.size).toBe(2);
    expect(clearCalls).toBe(0);
  });
});
