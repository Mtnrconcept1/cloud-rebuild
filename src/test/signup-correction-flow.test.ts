import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("signup legal acceptance and correction flow", () => {
  it("requires and forwards CGU/privacy acceptance through the public Edge Function", () => {
    const validation = read("supabase/functions/submit-signup-application/validation.ts");
    const submitFunction = read("supabase/functions/submit-signup-application/index.ts");

    expect(validation).toContain("terms_accepted");
    expect(validation).toContain("privacy_policy_accepted");
    expect(submitFunction).toContain("legal_terms_accepted_at");
    expect(submitFunction).toContain("privacy_policy_accepted_at");
    expect(submitFunction).toContain('sanitizeText(form.get("terms_accepted")');
    expect(submitFunction).toContain('sanitizeText(form.get("privacy_policy_accepted")');
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

    expect(dashboardHome).toContain("uploadVerificationDocument");
    expect(dashboardHome).toContain("sync_signup_application");
    expect(dashboardHome).toContain("correction_resubmitted_at");
    expect(dashboardHome).toContain('p_requested_role: "restaurateur"');
  });
});
