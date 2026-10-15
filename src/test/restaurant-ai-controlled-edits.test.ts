import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("restaurant AI controlled edits", () => {
  const edge = source("supabase/functions/ai-restaurant-editor/index.ts");
  const page = source("src/pages/dashboard/DashboardAdvisor.tsx");
  const client = source("src/lib/ai/tokAiClient.ts");

  it("requires a signed-in real owner even if the actor is an admin", () => {
    expect(edge).toContain("authenticateRequest(req, { allowServiceRole: false })");
    expect(edge).toContain("requireRestaurantAccess(actor, restaurantId)");
    expect(edge).toContain("restaurant.owner_id !== actor.userId");
    expect(edge).toContain('restaurant_id", restaurantId');
    expect(edge).toContain('user_id", actor.userId');
    expect(edge).toContain("Cette proposition a déjà été traitée");
  });

  it("separates preview, explicit confirmation, and one-time server-side application", () => {
    expect(edge).toContain('mode === "apply_photo"');
    expect(edge).toContain('mode === "plan"');
    expect(edge).toContain('eq("source", FUNCTION_NAME).eq("status", oldStatus)');
    expect(edge).toContain('changeStatus(actor, taskId, restaurantId, actor.userId, "draft", "generated")');
    expect(edge).toContain('changeStatus(actor, taskId, restaurantId, actor.userId, "generated", "applied")');
    expect(edge).toContain("change.previous_value");
    expect(page).toContain("setPendingEdit(proposal)");
    expect(page).toContain("handleConfirmEdit");
    expect(page).toContain("Confirmer la modification");
    expect(page).toContain("isCommercialDemo");
    expect(client).toContain('mode: "plan"');
    expect(client).toContain('mode: request.assetId ? "apply_photo" : "apply"');
  });

  it("does not expose financial fields, ownership, arbitrary tables, or direct URLs", () => {
    const allowed = edge.split("const ALLOWED:")[1].split("const TABLES:")[0];
    expect(allowed).toContain("restaurant_settings");
    expect(allowed).toContain("menu_item");
    expect(allowed).toContain("ai_profile");
    expect(allowed).toContain("dish_photo");
    for (const forbidden of [
      "owner_id", "stripe_account_id", "stripe_connect", "commission_rate",
      "iban", "password", "api_key", "payment_transactions",
    ]) expect(allowed).not.toContain(forbidden);
    expect(edge).toContain('asset.status !== "stored"');
    expect(edge).toContain('asset.asset_type !== "menu_visual"');
    expect(edge).toContain('asset.metadata?.gallery_storage_bucket !== "restaurant-images"');
    expect(edge).toContain('.eq("id", body.assetId).eq("restaurant_id", restaurantId).eq("user_id", actor.userId)');
    expect(page).toContain("variantCount: 1");
  });

  it("retains credits, quotas, rate limits, audit logs and per-restaurant isolation", () => {
    expect(edge).toContain("requireRestaurantTokCreditBalance");
    expect(edge).toContain("check_restaurant_ai_quota");
    expect(edge).toContain("createRateLimiter");
    expect(edge).toContain("assertTokCreditSpendRecorded");
    expect(edge).toContain('credit_kind: "ai_tools"');
    expect(edge).toContain("writeAuditLog");
    const config = source("supabase/config.toml");
    expect(config).toMatch(/\[functions\.ai-restaurant-editor\]\s+verify_jwt = false/);
  });
});
