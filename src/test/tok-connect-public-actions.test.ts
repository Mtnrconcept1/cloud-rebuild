import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TOK_ROLE_OPERATION_TOOLS } from "../../supabase/functions/_shared/tok-connect-role-operations.ts";
import { TOK_CUSTOMER_OPERATION_TOOLS } from "../../supabase/functions/_shared/tok-connect-customer-operations.ts";
import reviewedMutations from "../../scripts/contracts/tok-connect-public-mutations.json";
import { readFileSync } from "node:fs";

let handler: (request: Request) => Promise<Response>;
const upstreamCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
let bridgeStatus = 200;
let canonicalResult: Record<string, unknown> | undefined;
let bridgePayload: Record<string, unknown>;
const restaurant = "ac197b4c-3a47-4fc8-bf66-414ee23f1c8b";
const booking = "f281426f-bcd8-40c3-8114-33000c1fd76c";
async function rpc(method: string, params = {}, authorized = false) {
  const response = await handler(new Request("https://www.thetok.ch/mcp", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25", ...(authorized ? { authorization: "Bearer fixture-user-token" } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }));
  return { response, body: await response.json() };
}

beforeAll(async () => {
  vi.stubGlobal("Deno", { env: { get: () => undefined }, serve: (callback: typeof handler) => { handler = callback; } });
  await import("../../supabase/functions/tok-connect-remote-mcp/index.ts");
});
beforeEach(() => {
  upstreamCalls.length = 0;
  bridgeStatus = 200;
  canonicalResult = undefined;
  bridgePayload = { ok: true, data: { reservation_id: booking, status: "pending" } };
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    const body = JSON.parse(String(init?.body || "{}"));
    upstreamCalls.push({ url: String(url), body });
    return String(url).endsWith("tok-connect-chatgpt")
      ? Response.json({ jsonrpc: "2.0", id: body.id, result: body.method === "tools/call" && canonicalResult ? canonicalResult : { tools: [
        { name: "prepare_customer_reservation", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
        { name: "create_reservation", annotations: { readOnlyHint: false } },
      ] } })
      : Response.json(bridgePayload, { status: bridgeStatus });
  }));
});
afterAll(() => vi.unstubAllGlobals());

describe("public TOK actions through the actual HTTP router", () => {
  it("advertises only the opaque TOK issuer and scope across discovery, challenges and plugin", async () => {
    const response = await handler(new Request("https://www.thetok.ch/mcp?tok_connect_route=protected-resource"));
    const resource = await response.json();
    expect(resource).toMatchObject({ resource: "https://www.thetok.ch/mcp", authorization_servers: ["https://www.thetok.ch/oauth"], scopes_supported: ["tok"] });
    const metadata = JSON.parse(readFileSync("public/.well-known/oauth-authorization-server/oauth", "utf8"));
    expect(metadata).toMatchObject({ issuer: resource.authorization_servers[0], scopes_supported: ["tok"],
      token_endpoint_auth_methods_supported: ["none"], code_challenge_methods_supported: ["S256"] });
    for (const [key, suffix] of [["authorization_endpoint", "authorize"], ["token_endpoint", "token"], ["registration_endpoint", "register"]]) {
      expect(metadata[key]).toBe(`${metadata.issuer}/${suffix}`);
    }
    const plugin = JSON.parse(readFileSync("plugins/tok-connect/mcp.json", "utf8"));
    expect(plugin.mcpServers["tok-connect"].extensions["com.openai"].auth).toMatchObject({ baseScopes: ["tok"], oidcEnabled: false });
    const challenge = await rpc("tools/call", { name: "tok_get_my_account", arguments: {} });
    expect(challenge.body.result._meta["mcp/www_authenticate"][0]).toContain('scope="tok"');
  });
  it("routes OAuth to the broker before the frontend and prevents caching exchanges", () => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8"));
    const fallback = config.rewrites.findIndex((entry: { source: string; destination: string }) => entry.source.includes("oauth") && entry.destination === "/index.html");
    for (const suffix of ["register", "authorize", "token"]) {
      const index = config.rewrites.findIndex((entry: { source: string }) => entry.source === `/oauth/${suffix}`);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(fallback);
      expect(config.rewrites[index].destination).toBe(`https://wwcrtyoueexyxkkikaos.supabase.co/functions/v1/tok-connect-broker/${suffix}`);
    }
    expect(config.headers.find((entry: { source: string }) => entry.source === "/oauth/:endpoint(register|authorize|token)").headers)
      .toEqual(expect.arrayContaining([{ key: "Cache-Control", value: "no-store" }, { key: "Referrer-Policy", value: "no-referrer" }]));
  });
  it("exposes targeted model actions and blocks generic backend mutations", async () => {
    const { body } = await rpc("tools/list");
    const tools = body.result.tools;
    for (const name of ["tok_book_table", "tok_cancel_my_reservation", "tok_checkout_customer_cart", "tok_customer_payment_status", "tok_cancel_cart_payment_attempt"]) {
      const tool = tools.find((entry: { name: string }) => entry.name === name);
      expect(tool._meta.ui.visibility).toEqual(["model", "app"]);
      expect(tool._meta["openai/visibility"]).toBeUndefined();
    }
    for (const definition of TOK_ROLE_OPERATION_TOOLS) expect(tools.some((entry: { name: string }) => entry.name === definition.name)).toBe(true);
    for (const name of ["tok_generate_restaurant_campaign_draft", "tok_generate_restaurant_marketing_visual", "tok_generate_restaurant_dish_photo", "tok_attach_restaurant_dish_photo"]) {
      const tool = tools.find((entry: { name: string }) => entry.name === name);
      expect(tool._meta.ui.visibility).toEqual(["model", "app"]);
      expect(tool._meta["openai/outputTemplate"]).toBe("ui://tok-connect/actions-window-v1.html");
      expect(tool.inputSchema.required).toEqual(expect.arrayContaining(["restaurant_id", "confirmed_by_user", "idempotency_key"]));
    }
    for (const definition of TOK_CUSTOMER_OPERATION_TOOLS) expect(tools.some((entry: { name: string }) => entry.name === definition.name)).toBe(true);
    for (const name of ["tok_data", "tok_invoke_capability", "tok_invoke_rpc", "tok_commercial", "create_reservation"]) {
      expect(tools.some((entry: { name: string }) => entry.name === name)).toBe(false);
      const denied = await rpc("tools/call", { name, arguments: {} }, true);
      expect(denied.body.error.message).toBe("public_mcp_read_only");
    }
  });
  it("pins the anonymous smoke mutation allowlist to the reviewed public contracts", () => {
    const names = ["tok_book_table", "tok_cancel_my_reservation", "tok_checkout_customer_cart", "tok_cancel_cart_payment_attempt",
      ...[...TOK_ROLE_OPERATION_TOOLS, ...TOK_CUSTOMER_OPERATION_TOOLS].filter((tool) => !tool.annotations.readOnlyHint).map((tool) => tool.name)];
    expect(reviewedMutations.mutation_names).toEqual(names.sort());
  });
  it("challenges missing and expired authentication without calling a business action", async () => {
    for (const name of ["tok_book_table", "tok_accept_restaurant_reservation", "tok_checkout_customer_cart"]) {
      const { body } = await rpc("tools/call", { name, arguments: {} });
      expect(body.result.isError).toBe(true);
      expect(body.result._meta["mcp/www_authenticate"][0]).toContain("invalid_token");
    }
    expect(upstreamCalls.some(({ url }) => url.endsWith("tok-connect-app-bridge"))).toBe(false);
    bridgeStatus = 401; bridgePayload = { ok: false };
    const expired = await rpc("tools/call", { name: "tok_get_my_account", arguments: {} }, true);
    expect(expired.body.result._meta["mcp/www_authenticate"]).toHaveLength(1);
  });
  it("routes an explicit booking, preserves the key and renders pending faithfully", async () => {
    const args = { restaurant_id: restaurant, date: "2026-10-18", time: "19:00", party_size: 7, confirmed_by_user: true, idempotency_key: "same-intent-1234" };
    const result = await rpc("tools/call", { name: "tok_book_table", arguments: args }, true);
    expect(result.body.result.structuredContent.booking_result).toMatchObject({ reservation_id: booking, restaurant_id: restaurant, party_size: 7, status: "pending" });
    expect(upstreamCalls.at(-1)?.body).toMatchObject({ mode: "edge", capability: "reservations.classic.create", idempotency_key: "same-intent-1234", payload: { feature: "classique", party_size: 7 } });
    const denied = await rpc("tools/call", { name: "tok_book_table", arguments: { ...args, confirmed_by_user: false } }, true);
    expect(denied.response.status).toBe(400);
  });
  it("forwards only a named role operation and reports a server ownership denial", async () => {
    bridgeStatus = 403; bridgePayload = { ok: false, error: { code: "restaurant_not_owned" } };
    const result = await rpc("tools/call", { name: "tok_list_restaurant_reservations", arguments: { restaurant_id: restaurant } }, true);
    expect(upstreamCalls.at(-1)?.body).toEqual({ mode: "role_operation", operation: "tok_list_restaurant_reservations", args: { restaurant_id: restaurant } });
    expect(result.body.result.isError).toBe(true);
    expect(result.body.result.structuredContent.ok).toBe(false);
  });
  it("preserves the canonical visual output schema through the public endpoint, without the short generic bridge", async () => {
    const args = { restaurant_id: restaurant, prompt: "Carte de chasse", reference_media_ids: [booking],
      confirmed_by_user: true, idempotency_key: "studio:same-key" };
    canonicalResult = { content: [{ type: "text", text: "Visuel enregistré" }], structuredContent: {
      marketing_visual: { restaurant_id: restaurant, asset_id: booking, status: "stored", image_url: "https://wwcrtyoueexyxkkikaos.supabase.co/storage/v1/object/public/restaurant-images/test.png" }, replayed: true,
    } };
    const result = await rpc("tools/call", { name: "tok_generate_restaurant_marketing_visual", arguments: args }, true);
    expect(result.body.result).toEqual(canonicalResult);
    expect(upstreamCalls.at(-1)).toMatchObject({ url: expect.stringContaining("tok-connect-chatgpt"),
      body: { method: "tools/call", params: { name: "tok_generate_restaurant_marketing_visual", arguments: args } } });
    expect(upstreamCalls.some(({ url }) => url.endsWith("tok-connect-app-bridge"))).toBe(false);
  });
  it("preserves canonical OAuth challenges and credit refusals instead of claiming success", async () => {
    for (const result of [
      { content: [{ type: "text", text: "Connexion requise" }], isError: true, _meta: { "mcp/www_authenticate": ["Bearer invalid_token"] } },
      { content: [{ type: "text", text: "ai_credits_exhausted" }], isError: true },
    ]) {
      canonicalResult = result;
      expect((await rpc("tools/call", { name: "tok_generate_restaurant_marketing_visual", arguments: {} })).body.result).toEqual(result);
    }
  });
  it("allows the full native campaign generation window and does not retry an uncertain write", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    try {
      await rpc("tools/list");
      await rpc("tools/call", { name: "tok_generate_restaurant_campaign_draft", arguments: {
        restaurant_id: restaurant, prompt: "Carte de chasse", confirmed_by_user: true, idempotency_key: "studio:same-key",
      } }, true);
      expect(timeout).toHaveBeenCalledWith(100_000);
      const fetcher = vi.fn(async () => { throw new Error("upstream timeout"); });
      vi.stubGlobal("fetch", fetcher);
      const uncertain = await rpc("tools/call", { name: "tok_generate_restaurant_campaign_draft", arguments: {
        restaurant_id: restaurant, prompt: "Carte de chasse", confirmed_by_user: true, idempotency_key: "studio:same-key",
      } }, true);
      expect(uncertain.body.result).toMatchObject({ isError: true, structuredContent: {
        retry_with_same_key_only: true, error: { code: "tok_connect_studio_result_unconfirmed" },
      } });
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { timeout.mockRestore(); }
  });

});
