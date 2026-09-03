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

describe("security audit P0 remediation", () => {
  it("keeps stripe-setup as an authenticated, side-effect-free tombstone", () => {
    const worker = read("supabase/functions/stripe-setup/index.ts");
    const config = read("supabase/config.toml");

    expect(config).toMatch(/\[functions\.stripe-setup\]\s*verify_jwt\s*=\s*true/);
    expect(worker).toContain('code: "STRIPE_SETUP_RETIRED"');
    expect(worker).toContain("status: 410");
    expect(worker).toContain('"Cache-Control": "no-store"');
    expect(worker).not.toMatch(/Deno\.env|getStripe|STRIPE_SECRET|service[_-]?role/i);
    expect(worker).not.toMatch(/products\.create|prices\.create|checkout\.sessions\.create/i);
  });

  it("resolves every sensitive cron credential from Vault at execution time", () => {
    const migration = readMigration("security_audit_p0_remediation");
    const jobs = [
      "tok-stripe-subscription-reconcile",
      "tok-directory-image-enrichment",
      "tok-directory-commercial-name-verification",
      "tok-directory-cuisine-enrichment",
      "tok-directory-cuisine-osm-enrichment",
    ];

    for (const job of jobs) expect(migration).toContain(job);
    expect(migration.match(/FROM vault\.decrypted_secrets/g)).toHaveLength(jobs.length);
    expect(migration.match(/NULLIF\(decrypted_secret, ''\) IS NOT NULL/g)).toHaveLength(jobs.length);
    expect(migration.match(/'x-internal-cron-secret', secret\.decrypted_secret/g)).toHaveLength(jobs.length);
    expect(migration).not.toMatch(/["'][0-9a-f]{64}["']/i);
    expect(migration).not.toMatch(/format\s*\([\s\S]*internal_cron_secret/i);
  });

  it("adds bounded cache retention and removes only the measured duplicate index", () => {
    const migration = readMigration("security_audit_p0_remediation");

    expect(migration).toContain("tok-net-http-response-cache-retention");
    expect(migration).toContain("created_at < now() - interval '7 days'");
    expect(migration).toContain("LIMIT 5000");
    expect(migration).toContain("DROP INDEX IF EXISTS public.idx_edge_function_audit_logs_status_created_at");
    expect(migration).toContain("idx_edge_function_audit_logs_status_created_10k");
  });

  it("makes restaurants_clean enforce the caller's RLS context", () => {
    const migration = readMigration("security_audit_p0_remediation");

    expect(migration).toContain("ALTER VIEW public.restaurants_clean SET (security_invoker = true)");
  });

  it("runs the reusable CI validation for direct production-branch pushes", () => {
    const workflow = read(".github/workflows/ci.yml");

    expect(workflow).toMatch(/push:\s*branches:\s*- main\s*- master/);
    expect(workflow).toContain('uses: ./.github/workflows/_validation.yml');
  });
});
