import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TOK_ROLE_OPERATION_TOOLS } from "../../supabase/functions/_shared/tok-connect-role-operations.ts";
import { TOK_CUSTOMER_OPERATION_TOOLS } from "../../supabase/functions/_shared/tok-connect-customer-operations.ts";
import reviewedMutations from "../../scripts/contracts/tok-connect-public-mutations.json";

let handler: (request: Request) => Promise<Response>;
const upstreamCalls: Array<{ url: string; body: Record<string, unknown> }> = [];
let bridgeStatus = 200;
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
  bridgePayload = { ok: true, data: { reservation_id: booking, status: "pending" } };
  vi.stubGlobal("fetch", vi.fn(async (url, init) => {
    const body = JSON.parse(String(init?.body || "{}"));
    upstreamCalls.push({ url: String(url), body });
    return String(url).endsWith("tok-connect-chatgpt")
      ? Response.json({ jsonrpc: "2.0", id: body.id, result: { tools: [
        { name: "prepare_customer_reservation", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
        { name: "create_reservation", annotations: { readOnlyHint: false } },
      ] } })
      : Response.json(bridgePayload, { status: bridgeStatus });
  }));
});
afterAll(() => vi.unstubAllGlobals());

describe("public TOK actions through the actual HTTP router", () => {
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
});
