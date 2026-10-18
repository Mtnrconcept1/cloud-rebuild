import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  generateTokMarketingVisualThroughBridge,
  TokMarketingVisualBridgeError,
  type TokMarketingVisualInput,
} from "../../supabase/functions/_shared/tok-connect-marketing-visual";

const RESTAURANT_ID = "10000000-0000-4000-8000-000000000001";
const ASSET_ID = "20000000-0000-4000-8000-000000000002";
const SUPABASE_URL = "https://wwcrtyoueexyxkkikaos.supabase.co";
const IMAGE_URL = `${SUPABASE_URL}/storage/v1/object/public/restaurant-images/generated/${ASSET_ID}.png`;

function input(overrides: Partial<TokMarketingVisualInput> = {}): TokMarketingVisualInput {
  return {
    authorization: "Bearer test-user-oauth-jwt",
    authMode: "supabase_oauth",
    environment: "production",
    userId: "user-123",
    supabaseUrl: SUPABASE_URL,
    anonKey: "test-publishable-key",
    args: {
      restaurant_id: RESTAURANT_ID,
      prompt: "Affiche orientale, textes et logo natifs.",
      format: "portrait",
      reference_media_ids: [ASSET_ID],
      confirmed_by_user: true,
      idempotency_key: "marketing:12345678",
    },
    ...overrides,
  };
}

function bridgeResponse(overrides: Record<string, unknown> = {}, status = 200) {
  return new Response(JSON.stringify({
    ok: true,
    mode: "edge",
    capability: "restaurant.ai.image",
    data: {
      status: "stored",
      assetId: ASSET_ID,
      gallery_image_url: IMAGE_URL,
      credit_units: 9,
      model: "gpt-image-2",
    },
    replayed: false,
    ...overrides,
  }), { status, headers: { "content-type": "application/json" } });
}

describe("TOK Connect native Marketing Studio bridge", () => {
  it("exposes the existing role operation through the canonical MCP, not as a sandbox preview", () => {
    const mcp = readFileSync(resolve(process.cwd(), "supabase/functions/tok-connect-mcp/index.ts"), "utf8");
    const roleOperations = readFileSync(resolve(process.cwd(), "supabase/functions/_shared/tok-connect-role-operations.ts"), "utf8");
    const gateway = readFileSync(resolve(process.cwd(), "supabase/functions/tok-connect-chatgpt/index.ts"), "utf8");

    expect(roleOperations).toContain('tool("tok_generate_restaurant_marketing_visual"');
    expect(mcp).toContain("TOK_ROLE_OPERATION_TOOLS.find(");
    expect(mcp).toContain("TOK_CONNECT_MARKETING_VISUAL_TOOL,");
    expect(mcp).toContain('requiredScopes: ["campaigns:preview"]');
    expect(mcp).toContain('assertTokConnectRestaurantGrant(context, restaurantId, "campaigns:preview"');
    expect(mcp).toContain("args.confirmed_by_user !== true");
    expect(mcp).toContain("generateTokMarketingVisualThroughBridge({");
    expect(mcp).toContain('route: `MCP tools/call ${toolName}`');
    expect(gateway).toContain("...canonicalItems, ...fullItems, ...extras");
    expect(gateway).toContain("internalMcp(CANONICAL_MCP, rpc, req)");
  });

  it("forwards only approved fields and the caller JWT to the existing TOK native image backend", async () => {
    const fetcher = vi.fn(async () => bridgeResponse());
    const request = input({
      fetcher: fetcher as typeof fetch,
      args: { ...input().args, arbitrary_backend_url: "https://attacker.invalid", sourceImageUrl: "https://attacker.invalid/image" },
    });
    const result = await generateTokMarketingVisualThroughBridge(request);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [target, init] = fetcher.mock.calls[0] as unknown as [URL, RequestInit];
    expect(target.toString()).toBe(`${SUPABASE_URL}/functions/v1/tok-connect-app-bridge`);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe(request.authorization);
    expect(new Headers(init.headers).get("apikey")).toBe(request.anonKey);
    expect(JSON.parse(String(init.body))).toEqual({
      mode: "role_operation",
      operation: "tok_generate_restaurant_marketing_visual",
      args: {
        restaurant_id: RESTAURANT_ID,
        prompt: "Affiche orientale, textes et logo natifs.",
        format: "portrait",
        reference_media_ids: [ASSET_ID],
        confirmed_by_user: true,
        idempotency_key: "marketing:12345678",
      },
    });
    expect(result).toEqual({
      marketing_visual: {
        restaurant_id: RESTAURANT_ID,
        asset_id: ASSET_ID,
        image_url: IMAGE_URL,
        format: "portrait",
        image_count: 1,
        model: "gpt-image-2",
        credit_units: 9,
        status: "stored",
        publication_status: "not_published",
        requires_publication_confirmation: true,
      },
      replayed: false,
    });
  });

  it("does not forward sandbox, partner, unauthenticated or unconfirmed generations", async () => {
    const fetcher = vi.fn(async () => bridgeResponse());
    for (const overrides of [
      { environment: "sandbox" },
      { authMode: "legacy_partner_token" },
      { userId: null },
      { authorization: null },
      { args: { ...input().args, confirmed_by_user: false } },
      { args: { ...input().args, idempotency_key: "short" } },
      { args: { ...input().args, restaurant_id: "not-a-uuid" } },
      { supabaseUrl: "http://attacker.invalid" },
    ] satisfies Array<Partial<TokMarketingVisualInput>>) {
      await expect(generateTokMarketingVisualThroughBridge(input({
        fetcher: fetcher as typeof fetch,
        ...overrides,
      }))).rejects.toBeInstanceOf(TokMarketingVisualBridgeError);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects absent, malformed, duplicate or excessive references before any credit-consuming call", async () => {
    const fetcher = vi.fn(async () => bridgeResponse());
    for (const references of [undefined, [], ["invalid"], [ASSET_ID, ASSET_ID], Array(5).fill(ASSET_ID)]) {
      await expect(generateTokMarketingVisualThroughBridge(input({ fetcher: fetcher as typeof fetch,
        args: { ...input().args, reference_media_ids: references },
      }))).rejects.toMatchObject({ status: 400, message: "marketing_reference_ids_required" });
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("preserves native reference errors instead of hiding the actionable cause", async () => {
    await expect(generateTokMarketingVisualThroughBridge(input({
      fetcher: vi.fn(async () => bridgeResponse({ ok: false, data: { error: "marketing_reference_mismatch" } }, 409)) as typeof fetch,
    }))).rejects.toMatchObject({ status: 409, message: "marketing_reference_mismatch" });
  });

  it("surfaces a real credit refusal without claiming an image exists", async () => {
    const fetcher = vi.fn(async () => bridgeResponse({
      ok: false, error: { code: "ai_credits_exhausted" }, data: null,
    }, 402));
    await expect(generateTokMarketingVisualThroughBridge(input({
      fetcher: fetcher as typeof fetch,
    }))).rejects.toMatchObject({ status: 402, message: "ai_credits_exhausted" });
  });

  it.each([
    [{ error: { message: "tok_marketing_visual_result_unconfirmed" } }, 503, "tok_marketing_visual_result_unconfirmed"],
    [{ error: { message: "tok_connect_idempotency_request_in_progress" } }, 409, "tok_connect_idempotency_request_in_progress"],
    [{ data: { error: "image_edit_timeout" } }, 503, "image_edit_timeout"],
    [{ data: { error: { message: "image_reference_edit_required" } } }, 502, "image_reference_edit_required"],
    [{ data: { error_code: "ai_provider_billing_unavailable" } }, 503, "ai_provider_billing_unavailable"],
  ])("preserves bounded native and bridge error shapes: %s", async (failure, status, code) => {
    const fetcher = vi.fn(async () => bridgeResponse({ ok: false, ...failure }, status));
    await expect(generateTokMarketingVisualThroughBridge(input({ fetcher: fetcher as typeof fetch })))
      .rejects.toMatchObject({ status, message: code });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("never exposes raw provider or transport details as an MCP error", async () => {
    const details = "provider request rejected: credential=test-private-fixture";
    const fetcher = vi.fn(async () => bridgeResponse({ ok: false, error: { message: details }, data: { error: details } }, 502));
    await expect(generateTokMarketingVisualThroughBridge(input({ fetcher: fetcher as typeof fetch })))
      .rejects.toMatchObject({ status: 502, message: "tok_marketing_visual_generation_failed" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("refuses a simulated success, an absent asset and a non-TOK storage URL", async () => {
    const badResponses = [
      bridgeResponse({ mode: "preview" }),
      bridgeResponse({ data: { assetId: ASSET_ID, gallery_image_url: IMAGE_URL, status: "preview" } }),
      bridgeResponse({ data: { assetId: ASSET_ID, gallery_image_url: "https://attacker.invalid/image.png", status: "stored" } }),
      bridgeResponse({ data: { assetId: ASSET_ID, generated_image_url: IMAGE_URL, status: "stored" } }),
    ];
    for (const response of badResponses) {
      await expect(generateTokMarketingVisualThroughBridge(input({
        fetcher: vi.fn(async () => response) as typeof fetch,
      }))).rejects.toMatchObject({ status: 502 });
    }
  });

  it("keeps the same idempotency key when the native bridge reports an existing result", async () => {
    const fetcher = vi.fn(async () => bridgeResponse({ replayed: true }));
    const result = await generateTokMarketingVisualThroughBridge(input({ fetcher: fetcher as typeof fetch }));
    expect(result.replayed).toBe(true);
    const payload = JSON.parse(String((fetcher.mock.calls[0] as unknown as [URL, RequestInit])[1].body));
    expect(payload.args.idempotency_key).toBe("marketing:12345678");
  });

  it("fails closed after an upstream timeout instead of silently retrying or charging twice", async () => {
    const fetcher = vi.fn(async () => { throw new TypeError("network interrupted"); });
    await expect(generateTokMarketingVisualThroughBridge(input({
      fetcher: fetcher as typeof fetch,
    }))).rejects.toMatchObject({ status: 503, message: "tok_marketing_visual_result_unconfirmed" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
