import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationsDir = resolve(root, "supabase/migrations");

function latestMigrationContaining(pattern: RegExp) {
  const matches = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .filter((name) => pattern.test(readFileSync(resolve(migrationsDir, name), "utf8")));

  expect(matches.length).toBeGreaterThan(0);
  return readFileSync(resolve(migrationsDir, matches[matches.length - 1]), "utf8");
}

describe("restaurant review submission governance", () => {
  it("keeps review submission restricted to verified platform consumption", () => {
    const sql = latestMigrationContaining(/get_restaurant_review_submission_state/i);

    expect(sql).toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.get_restaurant_review_submission_state/i);
    expect(sql).toContain("status = 'arrived'");
    expect(sql).toContain("lower(COALESCE(status, '')) IN ('delivered', 'completed', 'ready_for_pickup', 'picked_up')");
    expect(sql).toContain("DROP POLICY IF EXISTS \"reviews_user_all\" ON public.reviews;");
    expect(sql).toContain("DROP POLICY IF EXISTS \"Users can create reviews\" ON public.reviews;");
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE ON public.reviews FROM authenticated;");
    expect(sql).toContain("CREATE POLICY \"reviews_no_direct_client_insert\"");
    expect(sql).toContain("WITH CHECK (false)");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.get_restaurant_review_submission_state(uuid) TO authenticated");
  });

  it("shows a clear anti-abuse message before non-eligible users can submit", () => {
    const form = readFileSync(resolve(root, "src/components/ReviewForm.tsx"), "utf8");

    expect(form).toContain("get_restaurant_review_submission_state");
    expect(form).toContain("Pour éviter les abus");
    expect(form).toContain("avoir réservé ou commandé");
    expect(form).toContain("via TOK");
    expect(form).toContain("setReviewState");
  });
});
