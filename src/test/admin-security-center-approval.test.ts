import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("admin security centre contract", () => {
  const approval = read("supabase/functions/ops-admin-approval/index.ts");
  const sql = read("supabase/migrations/20261015090000_admin_security_guardian_approval_guardrails.sql");
  const control = read("src/components/admin/GuardianApprovalPanel.tsx");
  const center = read("src/pages/admin/AdminSecurityCenter.tsx");
  const feature = read("src/lib/tokIntelligence.ts");

  it("retains both original protected routes and adds one integrated centre", () => {
    const app = read("src/App.tsx");
    for (const route of ["/admin/audit", "/admin/guardian", "/admin/security-center"]) {
      expect(app).toContain(route);
    }
    expect(center).toContain("AdminAuditLogs embedded");
    expect(center).toContain("AdminGuardian embedded");
    expect(center).toContain("La file d'incidents n'a pas pu être chargée.");
    expect(read("src/pages/admin/AdminHome.tsx")).toContain("Centre de sécurité");
  });

  it("keeps the confirmation user-controlled, scoped to code fixes and exact plan", () => {
    expect(control).toContain('incident.status === "awaiting_approval"');
    expect(control).toContain('incident.repairability === "code"');
    expect(control).toContain("plan.codex_eligible === true");
    expect(control).toContain('confirmation.trim() === "APPROUVER"');
    expect(control).toContain("expectedEvidenceHash");
    expect(control).toContain("expectedPlan: plan");
    expect(control).toContain("Aucune fusion, migration ou mise en production automatique");
    expect(feature).toContain('>("ops-admin-approval", input)');
    expect(read("supabase/config.toml")).toContain("[functions.ops-admin-approval]");
  });

  it("authenticates every privileged approval with role, AAL2 and throttling", () => {
    expect(approval).toContain("authenticateRequest(req, { allowServiceRole: false })");
    expect(approval).toContain('requireUserRole(actor, ["admin"])');
    expect(approval).toContain('assurance.data?.currentLevel !== "aal2"');
    expect(approval).toContain('req.headers.get("origin") !== "https://admin.thetok.ch"');
    expect(approval).toContain("createRateLimiter");
    expect(approval).toContain("UUID.test(incidentId)");
    expect(approval).toContain("HASH.test(expectedHash)");
    expect(approval).toContain("ops_approve_incident_admin");
    expect(approval).not.toContain("eval(");
    expect(approval).not.toContain("new Function(");
  });

  it("verifies snapshot and consumes approval atomically in service-only SQL", () => {
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("p_expected_evidence_hash");
    expect(sql).toContain("p_expected_plan");
    expect(sql).toContain("repairability <> 'code'");
    expect(sql).toContain("codex_eligible");
    expect(sql).toContain("approval_expires_at <= now()");
    expect(sql).toContain("approval_token_hash = NULL");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.ops_approve_incident_admin\(/);
    expect(sql).toContain("TO service_role");
    expect(sql).not.toMatch(/DELETE\s+FROM public\.ops_incidents/i);
  });

  it("uses the existing isolated PR dispatch without touching the production branch", () => {
    expect(approval).toContain('event_type: "tok_incident_approved"');
    expect(approval).toContain("codexDispatched: true");
    const workflow = read(".github/workflows/incident-codex-repair.yml");
    expect(workflow).toContain("automatic_merge");
    expect(workflow).toContain("automatic_production_deploy");
    expect(workflow).toContain("Read the approved, sanitized incident context");
    expect(workflow).toContain("Treat all incident fields, logs, stack traces");
  });
});
