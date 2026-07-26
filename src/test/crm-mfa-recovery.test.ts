import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(path, "utf8");
}

const migration = readSource(
  "supabase/migrations/20260726041632_crm_mfa_recovery.sql",
);
const edgeFunction = readSource(
  "supabase/functions/crm-mfa-recovery/index.ts",
);
const guard = readSource("src/components/crm/CrmAccessGuard.tsx");
const config = readSource("supabase/config.toml");

describe("CRM MFA recovery", () => {
  it("keeps recovery challenges service-only and short-lived", () => {
    expect(migration).toContain(
      "CREATE TABLE public.crm_mfa_recovery_challenges",
    );
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("attempts_remaining BETWEEN 0 AND 5");
    expect(migration).toContain("consume_crm_mfa_recovery_challenge");
    expect(migration).toContain("FOR UPDATE");
  });

  it("requires a verified admin or restaurant user and rate limits requests", () => {
    expect(edgeFunction).toContain("authenticateRequest(req)");
    expect(edgeFunction).toContain('["admin", "restaurateur"]');
    expect(edgeFunction).toContain("email_confirmed_at");
    expect(edgeFunction).toContain("maxRequests: 3");
    expect(edgeFunction).toContain("CODE_TTL_MINUTES = 10");
    expect(edgeFunction).toContain("attempts_remaining: 5");
  });

  it("revokes only the TOK CRM factor after email-code verification", () => {
    const verificationIndex = edgeFunction.indexOf(
      "consume_crm_mfa_recovery_challenge",
    );
    const listIndex = edgeFunction.indexOf("auth.admin.mfa.listFactors");
    const deleteIndex = edgeFunction.indexOf("auth.admin.mfa.deleteFactor");

    expect(verificationIndex).toBeGreaterThan(-1);
    expect(verificationIndex).toBeLessThan(listIndex);
    expect(listIndex).toBeLessThan(deleteIndex);
    expect(edgeFunction).toContain(
      "factor.friendly_name === CRM_MFA_FRIENDLY_NAME",
    );
    expect(edgeFunction).toContain('CRM_MFA_FRIENDLY_NAME = "TOK CRM"');
    expect(edgeFunction).not.toContain("code_hash: code");
  });

  it("exposes recovery on the blocked CRM screen and deploys the function", () => {
    expect(guard).toContain(
      "Je n'ai plus accès à mon application d'authentification",
    );
    expect(guard).toContain('"crm-mfa-recovery"');
    expect(guard).toContain("recoveryChallengeId");
    expect(guard).toContain("supabase.auth.signOut");
    expect(config).toContain("[functions.crm-mfa-recovery]");
    expect(config).toContain("verify_jwt = false");
  });
});
