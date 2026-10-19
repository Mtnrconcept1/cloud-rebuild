import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  marketingRpcHandler,
  type MarketingApiRequest,
  type MarketingApiResponse,
} from "../../server/marketingBff";

const actor = "11111111-1111-4111-8111-111111111111";
const itemId = "22222222-2222-4222-8222-222222222222";
const csrf = "c".repeat(43);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" },
});

function request(operation = "admin_approve_marketing_item"): MarketingApiRequest {
  const args = operation === "admin_approve_marketing_campaign"
    ? { p_campaign_id: itemId, p_reason: "Contenu et audience relus" }
    : operation === "admin_approve_marketing_outreach_draft"
      ? { p_draft_id: itemId, p_reason: "Message et cible relus" }
      : { p_item_id: itemId, p_scheduled_at: "2026-10-20T10:00:00Z" };
  return {
    method: "POST",
    body: { operation, args },
    headers: {
      host: "marketing.thetok.ch", origin: "https://marketing.thetok.ch",
      "sec-fetch-site": "same-origin", "content-type": "application/json",
      cookie: `__Host-tok_marketing_sid=${"s".repeat(43)}; __Host-tok_marketing_csrf=${csrf}`,
      "x-tok-marketing-csrf": csrf,
    },
  };
}

function recorder() {
  let body = "";
  const response: MarketingApiResponse = {
    statusCode: 0, setHeader: vi.fn(), end: (value) => { body = value || ""; },
  };
  return { response, value: () => JSON.parse(body) };
}

function upstream(failure: unknown, status = 400, sessionFailure = false) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/rpc/service_get_marketing_web_session")) {
      if (sessionFailure) return json(failure, status);
      return json({ user_id: actor, email: "admin@example.org",
        expires_at: new Date(Date.now() + 600000).toISOString() });
    }
    if (url.endsWith(`/admin/users/${actor}`)) return json({ id: actor, email: "admin@example.org" });
    if (url.includes("/user_roles?")) return json([{ user_id: actor }]);
    if (url.includes("/marketing_calendar_items?")) return json([]);
    if (url.includes("/rpc/service_execute_marketing_")) return json(failure, status);
    throw new Error("Unexpected test upstream");
  });
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "publishable-key-longer-than-twenty");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_" + "x".repeat(32));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("marketing approval business errors", () => {
  it.each([
    [403, "42501", "Campaign approval is required first", 400, "marketing_campaign_approval_required", /Approuvez d’abord la campagne/],
    [400, "22023", "Approved marketing must be scheduled at least two minutes in the future", 400, "marketing_schedule_too_soon", /deux minutes dans le futur/],
    [400, "22023", "Individual marketing must be scheduled between 08:00 and 20:00 Europe/Zurich", 400, "marketing_schedule_quiet_hours", /08:00 et 20:00.*Zurich/],
    [500, "55000", "Channel is not configured", 400, "marketing_channel_unavailable", /Intégrations/],
    [500, "55000", "External channel is blocked by configuration", 400, "marketing_channel_unavailable", /Intégrations/],
    [400, "22023", "No eligible contact for this item and channel", 400, "marketing_audience_empty", /Aucun destinataire éligible/],
    [403, "42501", "Calendar targeting differs from the approved campaign audience", 400, "marketing_audience_mismatch", /Corrigez le ciblage/],
    [400, "22023", "Content is required before approval", 400, "marketing_content_required", /Complétez et relisez le contenu/],
    [400, "22023", "Campaign audience is required", 400, "marketing_campaign_incomplete", /l’audience et les canaux/],
    [400, "22023", "Approval reason is required", 400, "marketing_approval_reason_required", /motif de validation/],
    [400, "22023", "Terminal calendar item cannot be approved", 400, "marketing_item_terminal", /déjà terminé ou annulé/],
    [400, "22023", "Campaign cannot be approved", 400, "marketing_campaign_unavailable", /pause, terminée, annulée ou en échec/],
    [500, "40001", "Calendar item was modified by another administrator", 409, "marketing_edit_conflict", /Actualisez les données/],
    [404, "P0002", "Calendar item not found", 404, "marketing_record_not_found", /n’existe plus/],
  ] as const)("explains the stored business guard %s %s %s without changing the operation", async (
    status, sqlCode, sqlMessage, expectedStatus, expectedCode, expectedMessage,
  ) => {
    const fetchMock = upstream({ code: sqlCode, message: sqlMessage,
      details: "PRIVATE_UPSTREAM_DETAILS", hint: "PRIVATE_UPSTREAM_HINT" }, status);
    vi.stubGlobal("fetch", fetchMock);
    const res = recorder();
    await marketingRpcHandler(request(), res.response);
    expect(res.response.statusCode).toBe(expectedStatus);
    expect(res.value()).toEqual({ error: { code: expectedCode, message: expect.stringMatching(expectedMessage) } });
    expect(JSON.stringify(res.value())).not.toContain("PRIVATE_UPSTREAM");
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/rpc/service_execute_marketing_")))
      .toHaveLength(1);
  });

  it.each([
    ["22023", "Only a pending outreach draft can be approved", "marketing_outreach_review_required"],
    ["42501", "Opportunity must be pending review without risk flags", "marketing_outreach_review_required"],
    ["42501", "Outreach target is not allowlisted", "marketing_outreach_target_unavailable"],
    ["22023", "Approved outreach draft cannot be edited", "marketing_outreach_draft_immutable"],
  ])("explains outreach approval failures through its own dispatcher: %s %s", async (code, message, expectedCode) => {
    const fetchMock = upstream({ code, message }, 400);
    vi.stubGlobal("fetch", fetchMock);
    const res = recorder();
    await marketingRpcHandler(request("admin_approve_marketing_outreach_draft"), res.response);
    expect(res.response.statusCode).toBe(400);
    expect(res.value().error.code).toBe(expectedCode);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/rpc/service_execute_marketing_outreach_operation")))
      .toHaveLength(1);
  });

  it.each([
    [400, { code: "42501", message: "PRIVATE_UPSTREAM_DETAILS" }, 400, "operation_rejected"],
    [400, { code: "42501", message: "Campaign approval is required first PRIVATE_UPSTREAM_DETAILS" }, 400, "operation_rejected"],
    [400, { code: "unknown", message: "Campaign approval is required first" }, 400, "operation_rejected"],
    [400, { code: "22023", message: "Campaign approval is required first" }, 400, "operation_rejected"],
    [500, { code: "XX000", message: "PRIVATE_UPSTREAM_DETAILS" }, 503, "service_unavailable"],
    [500, null, 503, "service_unavailable"],
  ] as const)("keeps unreviewed database failures opaque: %s %o", async (status, failure, expectedStatus, expectedCode) => {
    vi.stubGlobal("fetch", upstream(failure, status));
    const res = recorder();
    await marketingRpcHandler(request(), res.response);
    expect(res.response.statusCode).toBe(expectedStatus);
    expect(res.value().error.code).toBe(expectedCode);
    expect(JSON.stringify(res.value())).not.toContain("PRIVATE_UPSTREAM");
    expect(res.value().error.message).not.toContain("Campaign approval");
  });

  it("does not translate an authentication lookup failure even if it matches a known business guard", async () => {
    const fetchMock = upstream({ code: "55000", message: "Channel is not configured" }, 500, true);
    vi.stubGlobal("fetch", fetchMock);
    const res = recorder();
    await marketingRpcHandler(request(), res.response);
    expect(res.response.statusCode).toBe(503);
    expect(res.value()).toEqual({ error: { code: "service_unavailable", message: "Service indisponible." } });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/rpc/service_execute_marketing_"))).toBe(false);
  });

  it("preserves the successful approval response without retrying the mutation", async () => {
    const approved = { id: itemId, approval_status: "approved", status: "scheduled", scheduled_at: "2026-10-20T10:00:00Z" };
    const fetchMock = upstream(approved, 200);
    vi.stubGlobal("fetch", fetchMock);
    const res = recorder();
    await marketingRpcHandler(request(), res.response);
    expect(res.response.statusCode).toBe(200);
    expect(res.value()).toEqual(approved);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/rpc/service_execute_marketing_")))
      .toHaveLength(1);
  });
});
