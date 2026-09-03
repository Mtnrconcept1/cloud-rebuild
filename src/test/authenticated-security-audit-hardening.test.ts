import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = "supabase/migrations/20260607063751_authenticated_security_audit_hardening.sql";
const GATEWAY_DEFAULT_TOMBSTONES = new Map([
  ["stripe-setup", "STRIPE_SETUP_RETIRED"],
]);

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
  it("declares an explicit Supabase Edge Function auth policy for every active function directory", () => {
    const config = read("supabase/config.toml");
    const functionNames = readdirSync(resolve(root, "supabase/functions"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
      .map((entry) => entry.name)
      .sort();

    expect(functionNames.length).toBeGreaterThan(0);
    for (const functionName of functionNames) {
      const tombstoneMarker = GATEWAY_DEFAULT_TOMBSTONES.get(functionName);
      if (tombstoneMarker) {
        const source = read(`supabase/functions/${functionName}/index.ts`);
        expect(source).toContain(tombstoneMarker);
        expect(source).toContain("status: 410");
        expect(source).not.toMatch(/Deno\.env|getStripe|STRIPE_SECRET|service[_-]?role/i);
        continue;
      }

      expect(["true", "false"]).toContain(getVerifyJwt(config, functionName));
    }
  });

  it("keeps gateway-default tombstones on the authenticated Supabase CLI default", () => {
    const deployHelper = read("scripts/supabase-ci-retry.sh");

    expect(GATEWAY_DEFAULT_TOMBSTONES.size).toBeGreaterThan(0);
    expect(deployHelper).not.toContain("--no-verify-jwt");
  });

  it("uses handler-level auth instead of Supabase gateway JWT verification for ES256-compatible functions", () => {
    const config = read("supabase/config.toml");

    for (const functionName of [
      "authorize-match-group-order",
      "campaign-portal",
      "cancel-pending-order-checkout",
      "complete-order-checkout",
      "confirm-match-group-authorization",
      "courier-portal",
      "create-checkout",
      "create-chefs-table-reservation",
      "create-reservation",
      "create-social-post-boost",
      "create-zero-attente-reservation",
      "delete-account",
      "floorplan-ai",
      "generate-campaign",
      "manage-tok-one-subscription",
      "process-refund",
      "provision-commercial-accounts",
      "restaurant-advisor",
      "restaurant-order-status",
      "restaurant-media-governance",
      "stripe-connect-onboard",
      "stripe-connect-status",
      "validate-order",
    ]) {
      const source = read(`supabase/functions/${functionName}/index.ts`);

      expect(getVerifyJwt(config, functionName)).toBe("false");
      expect(
        source.includes("authenticateRequest(") || source.includes(".auth.getUser") || source.includes("getUser("),
        `${functionName} must verify the caller inside the handler when gateway JWT verification is disabled`,
      ).toBe(true);
    }

    expect(getVerifyJwt(config, "provision-commercial-demo-logins")).toBe("true");
    const retiredProvisioner = read("supabase/functions/provision-commercial-demo-logins/index.ts");
    expect(retiredProvisioner).toContain("LEGACY_DEMO_PROVISIONING_DISABLED");
    expect(retiredProvisioner).toContain("status: 410");

    expect(getVerifyJwt(config, "submit-signup-application")).toBe("false");
    const retiredSignupSubmitter = read("supabase/functions/submit-signup-application/index.ts");
    expect(retiredSignupSubmitter).toContain("signup_submission_endpoint_retired");
    expect(retiredSignupSubmitter).toContain("status: 410");
    expect(retiredSignupSubmitter).not.toContain("authenticateRequest(");
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
