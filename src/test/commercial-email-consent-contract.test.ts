import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const sql = readFileSync("supabase/migrations/20261027161000_commercial_signed_email_consent.sql", "utf8");
const ui = readFileSync("src/components/commercial/CommercialEmailConsentDialog.tsx", "utf8");
const cockpit = readFileSync("src/pages/CommercialProspection.tsx", "utf8");
describe("contrat de consentement du Cockpit", () => {
  it("intègre le formulaire dans la fiche prospect et réserve l’accord au restaurateur", () => {
    expect(cockpit).toContain("<CommercialEmailConsentDialog");
    expect(ui).toContain("J’approuve et je signe mon consentement");
    expect(sql).toContain("p_explicit_consent IS DISTINCT FROM TRUE");
    expect(sql).toContain("restaurateur_signature_in_person");
    expect(sql).toContain("il n’engage aucun abonnement");
  });
  it("lie une preuve privée et idempotente au journal marketing existant", () => {
    expect(sql).toContain("UNIQUE (captured_by, request_id)");
    expect(sql).toContain("consent_document_changed");
    expect(sql).toContain("app.marketing_lawful_basis_context");
    expect(sql).toContain("'quality','system_event'");
    expect(sql).not.toContain("INSERT INTO public.marketing_lawful_basis_evidence");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("consent_evidence_is_immutable");
  });
  it("ne transforme ni l’import ni une signature en levée d’opposition", () => {
    for (const guard of ["v_contact.opted_out_at IS NOT NULL", "v_contact.lifecycle_status='opted_out'", "v_contact.suppression_reason IS NOT NULL", "email_suppressed", "commercial_email_consent_only", "prospect_owned_by_another_commercial"]) expect(sql).toContain(guard);
    expect(sql).not.toMatch(/last_verified_at\s*=/);
    expect(sql).not.toMatch(/opted_out_at\s*=\s*NULL/i);
    expect(sql).not.toMatch(/display_name,email,email_normalized/);
  });
});
