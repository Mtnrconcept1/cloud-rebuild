import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("operational health score advisor policy", () => {
  const migration = readFileSync(
    resolve(root, "supabase/migrations/20260712063000_separate_advisors_from_operational_health.sql"),
    "utf8",
  );
  const auditPage = readFileSync(resolve(root, "src/pages/admin/AdminAuditLogs.tsx"), "utf8");

  it("keeps non-critical Advisors consultable without treating them as an outage", () => {
    expect(migration).toContain("admin_get_production_health_with_advisors");
    expect(migration).toContain("item->>'rootCauseId' <> 'supabase_advisors'");
    expect(migration).toContain("v_advisors_status = 'critical'");
    expect(migration).toContain("INFO/WARN consultables mais exclus du score operationnel");
  });

  it("explains the Advisor scoring boundary in the admin dashboard", () => {
    expect(auditPage).toContain("Les recommandations Supabase INFO/WARN restent consultables");
    expect(auditPage).toContain("Seules les erreurs ERROR/CRITICAL entrent dans le score opérationnel");
  });
});
