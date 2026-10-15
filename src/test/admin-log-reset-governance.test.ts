import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}
function latestResetMigration() {
  const dir = resolve(root, "supabase/migrations");
  const files = readdirSync(dir).filter((f) => /\.sql$/.test(f)).sort();
  const latest = files.filter((f) => /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.admin_reset_dashboard_logs/i.test(
    readFileSync(resolve(dir, f), "utf8"),
  )).at(-1);
  expect(latest).toBeDefined();
  return readFileSync(resolve(dir, latest!), "utf8");
}

describe("audit evidence must be preserved", () => {
  it("disables the dangerous historic dashboard reset at the database boundary", () => {
    const migration = latestResetMigration();
    expect(migration).toContain("audit_evidence_reset_disabled");
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.admin_reset_dashboard_logs\(text\)/i);
    expect(migration).toMatch(/SECURITY INVOKER/i);
    expect(migration).not.toMatch(/DELETE FROM public\.edge_function_audit_logs/i);
    expect(migration).not.toMatch(/DELETE FROM public\.audit_log/i);
    expect(migration).not.toMatch(/UPDATE public\.support_incidents/i);
    expect(migration).not.toContain("Tok2026$$");
  });

  it("removes the destructive reset action from every admin dashboard", () => {
    for (const path of [
      "src/pages/admin/AdminHome.tsx",
      "src/pages/admin/AdminAuditLogs.tsx",
      "src/pages/admin/AdminAiOperations.tsx",
    ]) {
      expect(read(path)).not.toContain("AdminLogResetButton");
    }
    expect(existsSync(resolve(root, "src/components/admin/AdminLogResetButton.tsx"))).toBe(true);
    expect(read("src/components/admin/AdminLogResetButton.tsx")).toContain("admin_reset_dashboard_logs");
  });
});
