import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSocialV2Migration() {
  const migrationsDir = resolve(process.cwd(), "supabase/migrations");
  const migrationName = readdirSync(migrationsDir).find((name) => name.includes("social_feed_v2"));

  expect(migrationName).toBeTruthy();
  return readFileSync(resolve(migrationsDir, migrationName!), "utf8");
}

describe("social feed v2 migration SQL", () => {
  it("adds the v2 social graph and metrics tables", () => {
    const sql = readSocialV2Migration();

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.social_post_saves");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.social_feed_feedback");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.social_feed_events");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.social_post_metrics_daily");
  });

  it("extends social posts without changing the legacy feed function", () => {
    const sql = readSocialV2Migration();

    expect(sql).toContain("ADD COLUMN IF NOT EXISTS post_type");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS cta_type");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS scheduled_at");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS pinned_until");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS visibility");
    expect(sql).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_social_feed\s*\(/i);
  });

  it("creates v2 RPCs with explicit drops for return-type safety", () => {
    const sql = readSocialV2Migration();

    for (const fn of [
      "get_social_feed_v2",
      "get_social_post_thread",
      "set_social_reaction",
      "toggle_social_save",
      "record_social_feed_event",
      "moderate_social_target",
    ]) {
      expect(sql).toContain(`DROP FUNCTION IF EXISTS public.${fn}`);
      expect(sql).toContain(`CREATE FUNCTION public.${fn}`);
    }
  });
});
