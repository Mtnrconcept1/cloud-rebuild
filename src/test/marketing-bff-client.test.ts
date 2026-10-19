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

  it.each([
    [400, "marketing_campaign_approval_required", /Approuvez d’abord la campagne.*Campagnes/],
    [400, "marketing_schedule_too_soon", /deux minutes dans le futur/],
    [400, "marketing_schedule_quiet_hours", /08:00 et 20:00.*Zurich/],
    [400, "marketing_channel_unavailable", /Intégrations/],
    [400, "marketing_audience_empty", /Aucun destinataire éligible/],
    [400, "marketing_audience_mismatch", /Corrigez le ciblage/],
    [400, "marketing_content_required", /Complétez et relisez le contenu/],
    [400, "marketing_campaign_incomplete", /l’audience et les canaux/],
    [400, "marketing_approval_reason_required", /motif de validation/],
    [400, "marketing_item_terminal", /déjà terminé ou annulé/],
    [400, "marketing_campaign_unavailable", /pause, terminée, annulée ou en échec/],
    [409, "marketing_edit_conflict", /modifié depuis son ouverture/],
    [404, "marketing_record_not_found", /n’existe plus/],
    [400, "marketing_outreach_review_required", /attente de validation/],
    [400, "marketing_outreach_target_unavailable", /Validez la cible de prospection/],
    [400, "marketing_outreach_draft_immutable", /déjà approuvé/],
    [400, "instagram_story_manual_required", /Story manuelle/],
  ] as const)("explains the operation failure %s %s without trusting server text", async (status, code, message) => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: {
      code, message: "PRIVATE_UPSTREAM_DETAILS",
    } }), { status, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(marketingBffRequest("/api/marketing/rpc", { method: "POST", body: {} }))
      .rejects.toMatchObject({ status, code, message: expect.stringMatching(message) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it.each(["marketing_campaign_approval_required", "marketing_edit_conflict", "instagram_story_manual_required"])(
    "does not use the operation message when %s is paired with an authorization failure", async (code) => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: {
        code, message: "PRIVATE_UPSTREAM_DETAILS",
      } }), { status: 403, headers: { "Content-Type": "application/json" } })));
      await expect(marketingBffRequest("/api/marketing/rpc", { method: "POST", body: {} }))
        .rejects.toMatchObject({ status: 403, message: "Cette action n’est pas autorisée." });
      expect(replace).not.toHaveBeenCalled();
    },
  );

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

  it("preserves a selected review after expiry while stripping authentication and redirect parameters", async () => {
    window.location.search = "?view=calendar&campaignId=82450000-0000-4000-8000-000000000001&itemId=82450000-0000-4000-8000-000000000002&from=2026-11-01&code=secret&next=https://evil.example";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    await expect(marketingBffRequest("/api/marketing/rpc", {
      method: "POST", body: { operation: "admin_test", args: {} },
    })).rejects.toBeInstanceOf(MarketingBffError);
    const destination = new URL(replace.mock.calls[0][0], "https://marketing.thetok.ch");
    expect(destination.pathname).toBe("/marketing/login");
    const returnTo = destination.searchParams.get("returnTo") || "";
    expect(returnTo).toContain("view=calendar");
    expect(returnTo).toContain("itemId=82450000-0000-4000-8000-000000000002");
    expect(returnTo).not.toMatch(/secret|next|evil/);
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
