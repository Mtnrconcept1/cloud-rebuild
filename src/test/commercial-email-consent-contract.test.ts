import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261027161000_commercial_signed_email_consent.sql", "utf8");
const ui = readFileSync("src/components/commercial/CommercialEmailConsentDialog.tsx", "utf8");
const cockpit = readFileSync("src/pages/CommercialProspection.tsx", "utf8");

describe("consentement signé de prospection", () => {
  it("sépare signature marketing et souscription, avec consentement affirmatif", () => {
    expect(migration).toContain("p_explicit_consent IS DISTINCT FROM TRUE");
    expect(migration).toContain("commercial_email_consent_receipts");
    expect(ui).toContain("checked={consented}");
    expect(ui).toContain("!consented || !signature");
    expect(ui).toContain("n’engage aucun abonnement");
    expect(cockpit).toContain("<CommercialEmailConsentDialog");
  });

  it("ne supprime aucune opposition et conserve une preuve privée", () => {
    expect(migration).toContain("v_contact.opted_out_at IS NOT NULL");
    expect(migration).toContain("v_contact.lifecycle_status='opted_out'");
    expect(migration).toContain("v_contact.suppression_reason IS NOT NULL");
    expect(migration).toContain("email_suppressed");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON public.commercial_email_consent_receipts");
    expect(migration).toContain("marketing_lawful_basis_evidence");
    expect(migration).toContain("marketing_contacts");
  });

  it("vérifie commercial actif et propriété du prospect côté serveur", () => {
    expect(migration).toContain("public.has_role(v_actor,'commercial'");
    expect(migration).toContain("commercial_account_inactive");
    expect(migration).toContain("prospect_owned_by_another_commercial");
    expect(migration).toContain("GRANT EXECUTE");
  });
});
