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

describe("RLS exact-policy deduplication", () => {
  it("drops only the measured legacy duplicates and preserves canonical policies", () => {
    const migration = readMigration("deduplicate_exact_rls_policies");

    for (const statement of [
      'DROP POLICY IF EXISTS "Anyone can read active campaigns" ON public.ad_campaigns;',
      'DROP POLICY IF EXISTS "Feature flags are viewable by everyone" ON public.feature_flags;',
      'DROP POLICY IF EXISTS "Users can manage their subscriptions" ON public.notification_subscriptions;',
      'DROP POLICY IF EXISTS hide_commercial_demo_branches ON public.restaurant_branches;',
      'DROP POLICY IF EXISTS hide_commercial_demo_hours ON public.restaurant_hours;',
    ]) {
      expect(migration).toContain(statement);
    }

    for (const canonicalPolicy of [
      "ad_campaigns_public_select",
      "feature_flags_public_select",
      "notification_subscriptions_self",
      "hide_commercial_demo_rows",
      "hide_commercial_demo_branch_rows",
    ]) {
      expect(migration).not.toContain(`DROP POLICY IF EXISTS ${canonicalPolicy} `);
      expect(migration).not.toContain(`DROP POLICY IF EXISTS "${canonicalPolicy}" `);
    }
  });

  it("replaces duplicate proof visibility policies with one shared authorization policy", () => {
    const migration = readMigration("deduplicate_exact_rls_policies");

    expect(migration).toContain("DROP POLICY IF EXISTS proof_of_delivery_client_select");
    expect(migration).toContain("DROP POLICY IF EXISTS proof_of_delivery_restaurant_select");
    expect(migration).toContain("CREATE POLICY proof_of_delivery_authorized_select");
    expect(migration).toMatch(/FOR SELECT\s+TO authenticated\s+USING \(public\.auth_can_view_dispatch_job\(dispatch_job_id\)\)/);
  });

  it("fails closed when production drift leaves another exact duplicate", () => {
    const migration = readMigration("deduplicate_exact_rls_policies");

    expect(migration).toContain("FROM pg_policies");
    expect(migration).toContain("permissive");
    expect(migration).toContain("roles");
    expect(migration).toContain("coalesce(qual, '')");
    expect(migration).toContain("coalesce(with_check, '')");
    expect(migration).toContain("HAVING count(*) > 1");
    expect(migration).toContain("RAISE EXCEPTION 'Exact duplicate RLS policies remain: %'");
  });

  it("does not mutate application data or remove tables", () => {
    const migration = readMigration("deduplicate_exact_rls_policies");

    expect(migration).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
    expect(migration).not.toMatch(/DROP\s+(?:TABLE|VIEW|FUNCTION)\b/i);
    expect(migration).toContain("NOTIFY pgrst, 'reload schema'");
  });
});
