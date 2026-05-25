import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPaths = [
  "supabase/migrations/20260522030000_social_feed_restaurateurs.sql",
  "supabase/migrations/20260522075454_social_reactions_and_comment_threads.sql",
].map((path) => resolve(process.cwd(), path));

describe("social reactions migration SQL", () => {
  it.each(migrationPaths)("uses an array expression for preferred cuisine matching in %s", (migrationPath) => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).not.toMatch(/=\s+ANY\s*\(\s*\(\s*SELECT\s+values\s+FROM\s+preferred_cuisines\s*\)\s*\)/i);
    expect(sql).toContain("AS cuisines");
    expect(sql).toContain("= ANY (pc.cuisines)");
  });

  it.each(migrationPaths)("drops get_social_feed before recreating it in %s", (migrationPath) => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_social_feed/i);
    expect(sql).toContain("DROP FUNCTION IF EXISTS public.get_social_feed(integer, timestamptz);");
  });
});
