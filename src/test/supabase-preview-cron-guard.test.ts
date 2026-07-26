import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Supabase preview cron isolation", () => {
  const productionHost = "wwcrtyoueexyxkkikaos.supabase.co";

  it("disables every Production target during preview seeding", () => {
    const seed = readFileSync(
      path.join(process.cwd(), "supabase", "seed.sql"),
      "utf8",
    );

    expect(seed).toContain(productionHost);
    expect(seed).toContain(
      "cron.alter_job(\n      job_id := v_job.jobid,\n      active := false",
    );
    expect(seed).toContain(
      "Preview cron guard failed: an active job still targets Production",
    );
    expect(seed).toContain("v_detected_count");
    expect(seed).toContain("v_disabled_count");
    expect(seed).not.toContain("cron.unschedule");
    expect(seed).not.toContain("cron.schedule");
    expect(seed).not.toContain("INTERNAL_CRON_SECRET");
  });

  it("requires review when a migration adds a Production-targeting cron", () => {
    const migrationDirectory = path.join(
      process.cwd(),
      "supabase",
      "migrations",
    );

    const productionCronMigrations = readdirSync(migrationDirectory)
      .filter((file) => file.endsWith(".sql"))
      .filter((file) => {
        const sql = readFileSync(
          path.join(migrationDirectory, file),
          "utf8",
        );

        return (
          sql.includes(productionHost) &&
          /cron[.]schedule\s*[(]/i.test(sql)
        );
      })
      .sort();

    expect(productionCronMigrations).toEqual([
      "20260530121000_schedule_email_worker.sql",
      "20260602095159_reconcile_paid_order_checkouts_10k_hardening.sql",
      "20260626143100_tok_connect_webhook_scheduler.sql",
      "20260712060000_fix_production_security_alerts.sql",
      "20260715044653_commercial_demo_openai_gateway.sql",
      "20260717220000_deferred_subscription_commission_lifecycle.sql",
      "20260717235004_stripe_security_and_finance_fail_closed.sql",
    ]);
  });
});
