import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("signup legal acceptance and correction flow", () => {
  it("reuses the server operation for confirmation, reload, replay, and an already finalized dossier", () => {
    const auth = read("src/pages/Auth.tsx");
    const migration = read("supabase/migrations/20260728075715_server_signup_drafts.sql");

    expect(auth).toContain('status === "finalized"');
    expect(auth).toContain("privilegedSignupOperationRef.current");
    expect(auth).toContain("skipIfExisting: true");
    expect(auth).toContain("mark_signup_application_draft_finalized");
    expect(migration).toContain("ON CONFLICT (user_id, requested_role) DO UPDATE");
    expect(migration).toContain("operation_id = EXCLUDED.operation_id");
    expect(migration).toContain("status <> 'finalized'");
  });

  it("forwards CGU/privacy acceptance through the authenticated direct signup flow", () => {
    const auth = read("src/pages/Auth.tsx");
    const retiredSubmitFunction = read("supabase/functions/submit-signup-application/index.ts");

    expect(auth).toContain("toLegalAcceptanceMetadata");
    expect(auth).toContain("legal_terms_accepted_at: legalAcceptance.acceptedAt");
    expect(auth).toContain("privacy_policy_accepted_at: legalAcceptance.acceptedAt");
    expect(retiredSubmitFunction).toContain("signup_submission_endpoint_retired");
    expect(retiredSubmitFunction).toContain("status: 410");
  });

  it("lets a restaurateur resubmit an admin correction with edited fields and replacement documents", () => {
    const statusCard = read("src/components/signup/SignupApplicationStatusCard.tsx");
    const dashboardHome = read("src/pages/dashboard/DashboardHome.tsx");

    expect(statusCard).toContain("Corriger le dossier");
    expect(statusCard).toContain("onResubmitApplication");
    expect(statusCard).toContain('application.status === "needs_changes"');
    expect(statusCard).toContain("businessName");
    expect(statusCard).toContain("restaurantName");
    expect(statusCard).toContain("documentInputs");

    expect(dashboardHome).toContain("uploadVerificationDocumentsWithRollback");
    expect(dashboardHome).toContain("findUncommittedVerificationDocumentPaths");
    expect(dashboardHome).toContain("correctionWasCommitted");
    expect(dashboardHome).toContain("uploadedDocuments.length === 0");
    expect(dashboardHome).toContain("previousPathByDocumentType");
    expect(dashboardHome).toContain("removeVerificationDocumentsBestEffort(replacedPaths)");
    expect(dashboardHome).toContain("sync_signup_application");
    expect(dashboardHome).toContain("correction_resubmitted_at");
    expect(dashboardHome).toContain('p_requested_role: "restaurateur"');
  });
});
