import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MARKETING_CSRF_HEADER_NAME,
  MarketingBffError,
  marketingBffRequest,
} from "@/marketing/marketingBffClient";

const csrfToken = "csrf-token-abcdefghijklmnop";

describe("marketing BFF client", () => {
  const replace = vi.fn();
  const dispatchEvent = vi.fn();

  beforeEach(() => {
    replace.mockReset();
    dispatchEvent.mockReset();
    vi.stubGlobal("document", {
      cookie: `__Host-tok_marketing_csrf=${csrfToken}`,
    });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      dispatchEvent,
      location: {
        pathname: "/marketing",
        replace,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends mutations same-origin with cookies, CSRF and no-store", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { ok: true } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(marketingBffRequest("/api/marketing/rpc", {
      method: "POST",
      body: { operation: "admin_test", args: { p_value: "safe" } },
    })).resolves.toEqual({ data: { ok: true } });

    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/marketing/rpc");
    expect(init.credentials).toBe("include");
    expect(init.cache).toBe("no-store");
    expect(init.redirect).toBe("error");
    expect((init.headers as Record<string, string>)[MARKETING_CSRF_HEADER_NAME]).toBe(csrfToken);
  });

  it("fails before fetch when the CSRF cookie is missing", async () => {
    vi.stubGlobal("document", { cookie: "theme=dark" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(marketingBffRequest("/api/marketing/rpc", {
      method: "POST",
      body: { operation: "admin_test", args: {} },
    })).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("redirects a data request 401 to the fixed marketing login path", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "ignored" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    })));

    await expect(marketingBffRequest("/api/marketing/rpc", {
      method: "POST",
      body: { operation: "admin_test", args: {} },
    })).rejects.toBeInstanceOf(MarketingBffError);
    expect(replace).toHaveBeenCalledWith("/marketing/login");
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });

  it("rejects a declared response larger than the client limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "3000000",
      },
    })));

    await expect(marketingBffRequest("/api/marketing/session", {
      method: "GET",
      requireCsrf: false,
      redirectOnUnauthorized: false,
    })).rejects.toMatchObject({ status: 502 });
  });

  it.each([
    ["authentication_required", "authentication_required"],
    ["mfa_failed", "mfa_failed"],
    ["ai_auth_unavailable", "ai_auth_unavailable"],
    ["discovery_unavailable", "discovery_unavailable"],
    ["secret-upstream-detail", undefined],
  ])("exposes only an allowlisted error code: %s", async (code, expectedCode) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      error: { code, message: "Sensitive upstream detail" },
    }), { status: 401, headers: { "Content-Type": "application/json" } })));
    await expect(marketingBffRequest("/api/marketing/mfa/verify", {
      body: { code: "123456" }, redirectOnUnauthorized: false,
    })).rejects.toMatchObject({ status: 401, code: expectedCode, message: "Votre session marketing a expiré." });
    expect(replace).not.toHaveBeenCalled();
  });
});


describe("safe campaign validation feedback", () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    ["campaign_schedule_invalid", /date de début.*future/],
    ["campaign_destination_invalid", /destination TOK/],
    ["campaign_channels_invalid", /canaux/],
    ["campaign_plan_invalid", /incohérent.*pas été enregistré/],
  ])("translates the known code without exposing upstream text: %s", async (code, message) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code, message: "private-provider-detail" } }), { status: code === "campaign_plan_invalid" ? 502 : 400, headers: { "Content-Type": "application/json" } })));
    await expect(marketingBffRequest("/api/marketing/agent", { method: "GET", requireCsrf: false })).rejects.toMatchObject({ code, message: expect.stringMatching(message) });
  });
});
