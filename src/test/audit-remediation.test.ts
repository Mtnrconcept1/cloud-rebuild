import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function readMigration(suffix: string) {
  const directory = resolve(process.cwd(), "supabase/migrations");
  const filename = readdirSync(directory).find((entry) => entry.endsWith(`_${suffix}.sql`));
  if (!filename) throw new Error(`Migration ${suffix} introuvable`);
  return read(`supabase/migrations/${filename}`);
}

describe("audit remediation guards", () => {
  it("closes the incident diagnostics and pauses an unconfigured Google worker", () => {
    const migration = readMigration("close_audit_security_gaps");

    expect(migration).toContain("get_open_incidents(timestamp with time zone, integer)");
    expect(migration).toContain("get_open_incidents_summary(timestamp with time zone, integer)");
    expect(migration).toMatch(/REVOKE EXECUTE[\s\S]*FROM PUBLIC, anon, authenticated/i);
    expect(migration).toContain("security_invoker=true");
    expect(migration).toContain("cron.alter_job(v_google_job_id, active := false)");
    expect(migration).toContain("google_sync_paused_missing_configuration");
  });

  it("reports missing Google credentials as an unavailable integration", () => {
    const worker = read("supabase/functions/google-actions-center-sync/index.ts");

    expect(worker).toContain('{ ok: false, error: "google_service_account_missing"');
    expect(worker).toContain("503,");
    expect(worker).not.toContain('{ ok: true, skipped: "google_service_account_missing"');
  });

  it("reconciles restaurant subscriptions against Stripe without charging", () => {
    const worker = read("supabase/functions/stripe-subscription-reconcile/index.ts");
    const migration = readMigration("schedule_stripe_subscription_reconcile");
    const config = read("supabase/config.toml");

    expect(worker).toContain("allowSchedulerSecret: true");
    expect(worker).toContain("subscriptions.retrieve");
    expect(worker).toContain('if (normalized === "canceled") return "cancelled"');
    expect(worker).toContain('.eq("stripe_subscription_id", row.stripe_subscription_id)');
    expect(worker).toContain("stripe_reconciliation_source: FUNCTION_NAME");
    expect(worker).not.toMatch(/paymentIntents\.create|subscriptions\.create|checkout\.sessions\.create/);
    expect(migration).toContain("tok-stripe-subscription-reconcile");
    expect(migration).toContain("/stripe-subscription-reconcile");
    expect(config).toContain("[functions.stripe-subscription-reconcile]");
  });

  it("removes visible fake production data and wires the admin action", () => {
    const tableTool = read("public/tok-table-v2/app.js");
    const restaurantCard = read("src/components/RestaurantCard.tsx");
    const adminPacks = read("src/pages/admin/AdminLaunchPacks.tsx");

    expect(tableTool).toContain("STANDALONE_ACCESS_BLOCKED");
    expect(tableTool).toContain("Ouvrez le plan de salle depuis votre dashboard");
    expect(tableTool).not.toContain("Famille Martin");
    expect(tableTool).not.toContain("Sophie Bernard");
    expect(tableTool).not.toContain("Groupe Dubois");
    expect(restaurantCard).not.toContain("estimatedMinutes");
    expect(adminPacks).toContain("onClick={() => setSelectedSubscriptionId(subscription.id)}");
  });
});
