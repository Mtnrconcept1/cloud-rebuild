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

  it.each([
    [400, "marketing_visual_required", "Ajoutez un visuel HTTPS valide à chaque publication illustrée avant de l’approuver."],
    [503, "marketing_readiness_unavailable", "La vérification des visuels est indisponible. Réessayez avant d’approuver."],
    [400, "mailing_image_invalid", "Choisissez une image JPG ou PNG valide de 3 Mo maximum pour cet e-mail."],
    [409, "mailing_image_conflict", "Cet e-mail ou sa campagne a changé ou a été approuvé. Actualisez avant de réimporter l’image."],
    [503, "mailing_image_upload_failed", "L’image n’a pas pu être enregistrée. Réessayez l’import de cet e-mail."],
    [400, "mailing_recipients_invalid", "Vérifiez la liste : de 1 à 500 adresses e-mail valides sont acceptées."],
    [503, "mailing_recipients_unavailable", "Les destinataires n’ont pas pu être vérifiés. Réessayez leur enregistrement."],
  ])("explains the known visual readiness failure without exposing upstream text: %s %s", async (status, code, message) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code, message: "PRIVATE_UPSTREAM_DETAILS" } }), {
      status: Number(status), headers: { "Content-Type": "application/json" },
    })));
    await expect(marketingBffRequest("/api/marketing/rpc", { method: "POST", body: {} }))
      .rejects.toMatchObject({ status, code, message });
  });

  it("does not trust the visual error code when paired with an unrelated status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "marketing_visual_required", message: "PRIVATE" } }), {
      status: 403, headers: { "Content-Type": "application/json" },
    })));
    await expect(marketingBffRequest("/api/marketing/rpc", { method: "POST", body: {} }))
      .rejects.toMatchObject({ status: 403, message: "Cette action n’est pas autorisée." });
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

  it("allows the larger body only for the dedicated mailing image action", async () => {
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const imageBase64 = "a".repeat(4 * 1024 * 1024);
    await expect(marketingBffRequest("/api/marketing/agent", { method: "POST", body: {
      action: "upload_mailing_image", imageBase64,
    } })).resolves.toEqual({ ok: true });
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]).toMatchObject({ credentials: "include", cache: "no-store",
      headers: expect.objectContaining({ [MARKETING_CSRF_HEADER_NAME]: csrfToken }) });
    fetchMock.mockClear();
    for (const [path, action, method] of [
      ["/api/marketing/rpc", "upload_mailing_image", "POST"],
      ["/api/marketing/agent", "generate", "POST"],
      ["/api/marketing/agent", "prepare_mailing_recipients", "POST"],
      ["/api/marketing/agent", "upload_mailing_image", "GET"],
    ] as const) {
      await expect(marketingBffRequest(path, { method, body: { action, imageBase64 } })).rejects.toMatchObject({ status: 413 });
    }
    await expect(marketingBffRequest("/api/marketing/agent", { body: { action: "upload_mailing_image", imageBase64: `${imageBase64}${"a".repeat(4096)}` } })).rejects.toMatchObject({ status: 413 });
    expect(fetchMock).not.toHaveBeenCalled();
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
