import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const bridge = readFileSync("supabase/functions/tok-connect-app-bridge/index.ts", "utf8");
const remote = readFileSync("supabase/functions/tok-connect-remote-mcp/index.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260905022000_tok_connect_mcp_action_bridge.sql", "utf8");
const config = readFileSync("supabase/config.toml", "utf8");

describe("TOK Connect authenticated application bridge", () => {
  it("requires a real user JWT and never grants the bridge service-role identity", () => {
    expect(bridge).toContain("authenticateRequest(req, { allowServiceRole: false })");
    expect(bridge).toContain("if (!actor.userId)");
    expect(bridge).toContain("actor.userClient");
    expect(bridge).not.toContain('allowServiceRole: true');
    expect(bridge).not.toContain('Authorization: `Bearer ${serviceRole');
    expect(config).toContain("[functions.tok-connect-app-bridge]");
  });

  it("exposes allowlisted real TOK backends for all primary authenticated role domains", () => {
    for (const functionName of [
      "validate-order",
      "create-checkout",
      "complete-order-checkout",
      "payment-attempt-status",
      "cancel-payment-attempt",
      "create-reservation",
      "create-zero-attente-reservation",
      "create-chefs-table-reservation",
      "manage-tok-one-subscription",
      "contact-support",
      "customer-memory",
      "restaurant-order-status",
      "manage-restaurant-subscription",
      "stripe-connect-onboard",
      "generate-campaign",
      "campaign-portal",
      "create-social-post-boost",
      "floorplan-ai",
      "ai-restaurant-agent",
      "ai-restaurant-tools",
      "ai-image-enhance",
      "daily-dish-ai",
      "ai-campaign-studio",
      "ai-social-post-copy",
      "menu-image-import",
      "restaurant-media-governance",
      "courier-portal",
      "process-refund",
      "admin-restaurant-adjustment",
      "provision-commercial-accounts",
      "dispatch-order",
      "dispatch-timeout",
      "ai-admin-dashboard-chat",
      "ai-admin-support",
      "ai-accounting-agent",
      "ai-admin-monitor",
      "ai-guardian",
    ]) expect(bridge).toContain(`functionName: "${functionName}"`);

    expect(bridge).toContain("EDGE_CAPABILITIES[capabilityName]");
    expect(bridge).not.toContain("functionName: String(body");
  });

  it("keeps generic RPC and data execution bounded by role families, RLS and per-table operation policies", () => {
    expect(bridge).toContain('if (name.startsWith("admin_")) return ["admin"]');
    expect(bridge).toContain('if (name.startsWith("restaurant_"))');
    expect(bridge).toContain("actor.userClient.rpc(rpcName, args)");
    expect(bridge).toContain("DATA_POLICIES");
    expect(bridge).toContain("tok_connect_data_operation_not_allowed");
    for (const table of [
      "profiles",
      "favorites",
      "menu_items",
      "restaurant_promotions",
      "orders",
      "order_items",
      "reservations",
      "notifications",
      "payment_transactions",
      "loyalty_accounts",
      "loyalty_transactions",
      "support_tickets",
      "tok_one_subscriptions",
      "user_subscriptions",
      "restaurant_invoices",
    ]) expect(bridge).toContain(`${table}:`);

    expect(bridge).toContain('orders: { roles: [], operations: READ }');
    expect(bridge).toContain('reservations: { roles: [], operations: READ }');
    expect(bridge).toContain('payment_transactions: { roles: [], operations: READ }');
    expect(bridge).toContain("actor.userClient.from(table)");
    expect(bridge).toContain("tok_connect_table_not_allowlisted");
    expect(bridge).toContain("tok_connect_rpc_not_allowlisted");
  });

  it("requires confirmation, bounded mutations and server-side idempotency", () => {
    expect(bridge).toContain("tok_connect_human_confirmation_required");
    expect(bridge).toContain("tok_connect_mutation_filter_required");
    expect(bridge).toContain("tok_connect_idempotency_key_reused_with_different_body");
    expect(bridge).toContain("sha256Base64Url");
    expect(bridge).toContain("IDEMPOTENCY_TABLE");
    expect(migration).toContain("tok_connect_mcp_action_idempotency");
    expect(migration).toContain("unique (user_id, idempotency_key)");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.tok_connect_mcp_action_idempotency from public, anon, authenticated");
    expect(migration).toContain("grant all on table public.tok_connect_mcp_action_idempotency to service_role");
  });

  it("publishes the full-app execution bridge as normal authenticated MCP tools", () => {
    for (const tool of ["tok_list_capabilities", "tok_invoke_capability", "tok_invoke_rpc", "tok_data", "tok_commercial"]) {
      expect(remote).toContain(`name: "${tool}"`);
    }
    expect(remote).toContain("APP_BRIDGE_URL");
    expect(remote).toContain("mcp/www_authenticate");
    expect(remote).toContain("mergeTools");
    expect(remote).toContain("callAppBridge");
    expect(remote).toContain("Service-role, scheduler-only and webhook-only operations are never exposed");
  });
});
