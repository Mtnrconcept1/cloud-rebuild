import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationsDir = join(process.cwd(), "supabase", "migrations");

function findNewsletterAutomationMigration() {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .filter((file) => file.includes("newsletter") || file.includes("notification_campaign_automation"))
    .sort()
    .at(-1);
}

describe("newsletter campaign automation migration", () => {
  it("adds a service-role safe due campaign dispatcher", () => {
    const migration = findNewsletterAutomationMigration();
    expect(migration).toBeTruthy();
    const filePath = join(migrationsDir, migration!);
    expect(existsSync(filePath)).toBe(true);

    const sql = readFileSync(filePath, "utf8");
    expect(sql).toContain("dispatch_due_notification_campaigns");
    expect(sql).toMatch(/status\s*=\s*'scheduled'/i);
    expect(sql).toMatch(/scheduled_at\s*<=\s*now\(\)/i);
    expect(sql).toMatch(/auth\.role\(\)\s*=\s*'service_role'/i);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.dispatch_due_notification_campaigns\(integer\) TO service_role/i);
  });
});

