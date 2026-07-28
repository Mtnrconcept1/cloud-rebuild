import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("security abuse monitoring 10k", () => {
  const migration = read("supabase/migrations/20260602124000_security_abuse_monitoring_10k.sql");

  it("adds an admin/service-role security abuse summary without exposing it to anon", () => {
    expect(migration).toContain("admin_get_security_abuse_summary");
    expect(migration).toContain("auth.role() <> 'service_role'");
    expect(migration).toContain("public.has_role(auth.uid(), 'admin')");
    expect(migration).toContain("REVOKE EXECUTE ON FUNCTION public.admin_get_security_abuse_summary(integer) FROM anon");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.admin_get_security_abuse_summary(integer) TO authenticated, service_role");
  });

  it("monitors mass account creation, sensitive failures, card testing and uploads", () => {
    for (const expected of [
      "massAccountCréation",
      "sensitiveEndpointFailures",
      "cardTesting",
      "massUploads",
      "sensitiveActions",
      "auth.users",
      "signup_applications",
      "edge_function_audit_logs",
      "request_metadata->>'ip'",
      "payment_transactions",
      "storage.objects",
    ]) {
      expect(migration).toContain(expected);
    }
  });

  it("adds launch-scale indexes for audit IP/status and failed payment scans", () => {
    expect(migration).toContain("idx_edge_function_audit_logs_status_created_10k");
    expect(migration).toContain("idx_edge_function_audit_logs_ip_created_10k");
    expect(migration).toContain("idx_payment_transactions_user_status_created_10k");
  });
});
