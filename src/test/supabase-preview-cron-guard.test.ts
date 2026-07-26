import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Supabase Production cron isolation", () => {
  const migrationDirectory = path.join(
    process.cwd(),
    "supabase",
    "migrations",
  );
  const guardMigration =
    "20260530120500_install_nonproduction_http_cron_guard.sql";
  const productionProjectRef = "wwcrtyoueexyxkkikaos";
  const productionSystemIdentifier = "7623125441096521075";
  const expectedProductionCronSchedules = new Map([
    ["20260530121000_schedule_email_worker.sql", 1],
    [
      "20260602095159_reconcile_paid_order_checkouts_10k_hardening.sql",
      1,
    ],
    ["20260626143100_tok_connect_webhook_scheduler.sql", 1],
    ["20260712060000_fix_production_security_alerts.sql", 5],
    ["20260715044653_commercial_demo_openai_gateway.sql", 1],
    ["20260717220000_deferred_subscription_commission_lifecycle.sql", 1],
    [
      "20260717235004_stripe_security_and_finance_fail_closed.sql",
      1,
    ],
  ]);

  const migrationFiles = readdirSync(migrationDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const readMigration = (file: string) =>
    readFileSync(path.join(migrationDirectory, file), "utf8");

  it("installs the fail-closed classifier before the first cron schedule", () => {
    const firstCronMigration = migrationFiles.find((file) =>
      /cron[.]schedule\s*[(]/i.test(readMigration(file)),
    );

    expect(firstCronMigration).toBeDefined();
    expect(guardMigration.localeCompare(firstCronMigration!)).toBeLessThan(0);

    const guardSql = readMigration(guardMigration);

    expect(guardSql).toContain("CREATE EXTENSION IF NOT EXISTS pg_cron");
    expect(guardSql).toContain(
      "CREATE OR REPLACE FUNCTION private.tok_is_production_cluster()",
    );
    expect(guardSql).toContain("FROM pg_control_system() AS control");
    expect(guardSql).toContain(productionSystemIdentifier);
    expect(guardSql).toContain(productionProjectRef);
    expect(guardSql).toContain("RETURN false;");
    expect(guardSql).toContain("cron.alter_job(");
    expect(guardSql).toContain("active := false");
    expect(guardSql).toContain(
      "REVOKE EXECUTE ON FUNCTION private.tok_is_production_cluster()",
    );
    expect(guardSql).toContain(
      "Non-Production cron guard failed: an active job still targets Production",
    );
    expect(guardSql).not.toMatch(
      /\bCREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\b/i,
    );
  });

  it("gates every literal Production-targeting cron before schedule or cleanup", () => {
    const productionCronMigrations = migrationFiles.filter((file) => {
      const sql = readMigration(file);

      return (
        sql.includes(productionProjectRef) &&
        /cron[.]schedule\s*[(]/i.test(sql)
      );
    });

    expect(productionCronMigrations).toEqual([
      ...expectedProductionCronSchedules.keys(),
    ]);

    for (const file of productionCronMigrations) {
      const sql = readMigration(file);
      const guardCallIndex = sql.indexOf(
        "private.tok_is_production_cluster() IS NOT TRUE",
      );
      const firstReturnAfterGuard = sql.indexOf("RETURN;", guardCallIndex);
      const firstScheduleIndex = sql.search(/cron[.]schedule\s*[(]/i);
      const firstUnscheduleIndex = sql.search(/cron[.]unschedule\s*[(]/i);
      const scheduleCount = sql.match(/cron[.]schedule\s*[(]/gi)?.length ?? 0;

      expect(guardCallIndex, file).toBeGreaterThanOrEqual(0);
      expect(firstReturnAfterGuard, file).toBeGreaterThan(guardCallIndex);
      expect(firstReturnAfterGuard, file).toBeLessThan(firstScheduleIndex);
      expect(guardCallIndex, file).toBeLessThan(firstScheduleIndex);

      if (firstUnscheduleIndex >= 0) {
        expect(guardCallIndex, file).toBeLessThan(firstUnscheduleIndex);
      }

      expect(scheduleCount, file).toBe(
        expectedProductionCronSchedules.get(file),
      );
    }
  });
});
