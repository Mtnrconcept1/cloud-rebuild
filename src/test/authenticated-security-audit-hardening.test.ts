import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = "supabase/migrations/20260607063751_authenticated_security_audit_hardening.sql";

function read(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

function getVerifyJwt(config: string, functionName: string) {
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = config.match(
    new RegExp(`\\[functions\\.${escaped}\\]\\s+verify_jwt\\s*=\\s*(true|false)`, "i"),
  );
  expect(match, `${functionName} should have an explicit verify_jwt setting`).toBeTruthy();
  return match?.[1];
}

describe("authenticated security audit hardening", () => {
  it("enables Supabase gateway JWT verification for user-authenticated Edge Functions", () => {
    const config = read("supabase/config.toml");

    for (const functionName of [
      "authorize-match-group-order",
      "campaign-portal",
      "complete-order-checkout",
      "courier-portal",
      "create-checkout",
      "create-chefs-table-reservation",
      "create-zero-attente-reservation",
      "delete-account",
      "floorplan-ai",
      "generate-campaign",
      "manage-tok-one-subscription",
      "process-refund",
      "restaurant-advisor",
      "restaurant-order-status",
      "restaurant-media-governance",
      "stripe-connect-onboard",
      "validate-order",
    ]) {
      expect(getVerifyJwt(config, functionName)).toBe("true");
    }

    expect(config).not.toMatch(/verify_jwt`\s+is incompatible/i);
    expect(config).not.toMatch(/every function below explicitly opts out/i);
  });

  it("keeps webhook, scheduler, internal secret and public collector endpoints without gateway JWT verification", () => {
    const config = read("supabase/config.toml");

    for (const functionName of [
      "stripe-webhook",
      "capture-due-match-groups",
      "close-due-match-groups",
      "dispatch-timeout",
      "generate-invoices",
      "notification-dispatch",
      "reconcile-match-group-authorizations",
      "reconcile-paid-order-checkouts",
      "send-email",
      "send-push",
      "contact-support",
      "dispatch-order",
      "track-analytics",
      "track-sponsored-event",
    ]) {
      expect(getVerifyJwt(config, functionName)).toBe("false");
    }
  });

  it("removes public and anonymous execute from audit-confirmed sensitive SECURITY DEFINER RPCs", () => {
    const sql = read(migrationPath);

    for (const signature of [
      "has_role(uuid, public.app_role)",
      "get_order_customers(uuid)",
      "get_reservation_customers(uuid)",
      "track_order_event(uuid, text, jsonb)",
      "restaurant_set_cover_media(uuid)",
      "restaurant_delete_media_metadata(uuid)",
      "restaurant_upsert_anti_waste_offer(uuid, jsonb, text)",
      "restaurant_update_flash_sale_status(uuid, boolean, text)",
    ]) {
      expect(sql).toContain(`IF to_regprocedure('public.${signature}') IS NOT NULL THEN`);
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${signature} FROM PUBLIC, anon;`);
      expect(sql).toContain(
        `GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated, service_role;`,
      );
    }
  });

  it("keeps maintenance RPCs callable only by service_role so anonymous users cannot trigger writes", () => {
    const sql = read(migrationPath);

    for (const signature of [
      "recompute_restaurant_review_stats(uuid)",
      "refresh_restaurant_daily_kpis_for_date(uuid, text)",
      "refresh_restaurant_daily_kpis_recent_days(integer)",
    ]) {
      expect(sql).toContain(`IF to_regprocedure('public.${signature}') IS NOT NULL THEN`);
      expect(sql).toContain(
        `REVOKE EXECUTE ON FUNCTION public.${signature} FROM PUBLIC, anon, authenticated;`,
      );
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role;`);
    }

    expect(sql).toContain("NOTIFY pgrst, 'reload schema';");
  });
});
