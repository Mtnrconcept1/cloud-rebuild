import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationsDir = resolve(root, "supabase/migrations");

function readAllMigrations() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(resolve(migrationsDir, name), "utf8"))
    .join("\n");
}

describe("admin Actualités sponsored control", () => {
  it("adds admin RPCs to list and review sponsored Actualités promotions with audit", () => {
    const sql = readAllMigrations();

    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_get_actualites_sponsored_posts/i);
    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_review_social_post_promotion/i);
    expect(sql).toMatch(/public\.has_role\(v_actor_id,\s*'admin'\)/i);
    expect(sql).toMatch(/FROM\s+public\.social_post_promotions/i);
    expect(sql).toMatch(/campaign_conversions_count/i);
    expect(sql).toMatch(/repeat_clicks/i);
    expect(sql).toMatch(/INSERT\s+INTO\s+public\.audit_log/i);
    expect(sql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_get_actualites_sponsored_posts/i);
    expect(sql).toMatch(/GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.admin_review_social_post_promotion/i);
  });

  it("exposes sponsored performance, fraud signals and suspension controls in admin Actualités", () => {
    const source = readFileSync(resolve(root, "src/pages/admin/AdminActualites.tsx"), "utf8");

    expect(source).toContain('TabsTrigger value="sponsored"');
    expect(source).toContain('TabsTrigger value="fraud"');
    expect(source).toContain("admin_get_actualites_sponsored_posts");
    expect(source).toContain("admin_review_social_post_promotion");
    expect(source).toContain("Posts sponsorisés");
    expect(source).toContain("Fraude métriques");
    expect(source).toContain("suspiciousSignals");
    expect(source).toContain("exportSponsoredPostsCsv");
    expect(source).toContain("Suspendre");
    expect(source).toContain("Réactiver");
  });
});
