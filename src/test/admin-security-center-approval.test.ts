import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("admin security centre contract", () => {
  const approval = read("supabase/functions/ops-admin-approval/index.ts");
  const sql = read("supabase/migrations/20261015090000_admin_security_guardian_approval_guardrails.sql");
  const boundedSql = read("supabase/migrations/20261023074600_guardian_complete_repair_bounded_investigation.sql");
  const control = read("src/components/admin/GuardianApprovalPanel.tsx");
  const guardian = read("src/pages/admin/AdminGuardian.tsx");
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

  it("keeps the confirmation user-controlled and scoped to an exact bounded plan", () => {
    expect(control).toContain('incident.status === "awaiting_approval"');
    expect(control).toContain("canonicalCodeRepair");
    expect(control).toContain("boundedInvestigation");
    expect(control).toContain("hasBoundedCodeTarget");
    expect(control).toContain('confirmation.trim() === "APPROUVER"');
    expect(control).toContain("Demander la réparation complète");
    expect(control).toContain('executionMode: "complete"');
    expect(control).toContain("journalReport: true");
    expect(control).toContain("la limite de trois cycles de sécurité");
    expect(control).toContain("expectedEvidenceHash");
    expect(control).toContain("expectedPlan: plan");
    expect(control).toContain("Aucune fusion, migration ou mise en production automatique");
    expect(feature).toContain('>("ops-admin-approval", input)');
    expect(feature).toContain("events: GuardianIncidentEvent[]");
    expect(guardian).toContain("Journal de réparation");
    expect(guardian).toContain("Ouvrir le run et son rapport journalisé");
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
    expect(approval).toContain("completeRepairEligible");
    expect(approval).toContain("BOUNDED_CODE_PATH");
    expect(approval).toContain('payload.executionMode !== "complete"');
    expect(approval).toContain("payload.journalReport !== true");
    expect(approval).toContain('execution_mode: "complete"');
    expect(approval).toContain("journal_report: true");
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
    expect(boundedSql).toContain("v_complete_repair_eligible");
    expect(boundedSql).toContain("v_has_bounded_code_target");
    expect(boundedSql).toContain("repairability IN ('external', 'unknown')");
    expect(boundedSql).toContain("jsonb_array_elements_text");
    expect(boundedSql).toMatch(/REVOKE ALL ON FUNCTION public\.ops_approve_incident_admin\(/);
    expect(boundedSql).toContain("TO service_role");
    expect(boundedSql).not.toMatch(/DELETE\s+FROM public\.ops_incidents/i);
  });

  it("uses the existing isolated PR dispatch without touching the production branch", () => {
    expect(approval).toContain('event_type: "tok_incident_approved"');
    expect(approval).toContain("codexDispatched: true");
    const workflow = read(".github/workflows/incident-codex-repair.yml");
    expect(workflow).toContain("automatic_merge");
    expect(workflow).toContain("automatic_production_deploy");
    expect(workflow).toContain("Read the approved, sanitized incident context");
    expect(workflow).toContain("Treat all incident fields, logs, stack traces");
    expect(workflow).toContain("Validate repair cycle 1");
    expect(workflow).toContain("Continue Codex after cycle 1 failures");
    expect(workflow).toContain("Continue Codex after cycle 2 failures");
    expect(workflow).toContain("Upload journalized repair report");
    expect(workflow).toContain("Require complete repair convergence");
    expect(workflow).toContain("retention-days: 30");
  });
});
