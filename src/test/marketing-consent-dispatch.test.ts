import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260801190000_marketing_operations_center.sql"),
  "utf8",
);

describe("marketing consent and targeting", () => {
  it("rejects empty or unknown targeting and forces approval", () => {
    expect(migration).toContain("Audience filter cannot be empty");
    expect(migration).toContain("Unsupported audience filter key");
    expect(migration).toContain("requires_approval boolean NOT NULL DEFAULT true CHECK (requires_approval IS TRUE)");
    expect(migration).toContain("Calendar targeting differs from the approved campaign audience");
  });

  it("centralizes channel eligibility with an absolute opt-out", () => {
    expect(migration).toContain("marketing_contact_is_eligible");
    expect(migration).toContain("c.opted_out_at IS NULL");
    expect(migration).toContain("c.lawful_basis IN ('consent','existing_customer')");
    expect(migration).toContain("lawful_basis <> 'none'");
    expect(migration).toContain("Opt-out cannot be cleared by contact upsert");
  });

  it("synchronizes only identified consent receipts and never imports client email", () => {
    expect(migration).toContain("FROM public.consent_receipts r");
    expect(migration).toContain("WHERE r.user_id IS NOT NULL");
    expect(migration).toContain("Re-consent is accepted only from a newer explicit settings receipt");
    expect(migration).toContain("'contains_email', false");
  });

  it("revalidates parent approval and revision before claim or retry", () => {
    expect(migration).toContain("i.approved_at = d.item_approved_at");
    expect(migration).toContain("campaign.approved_at IS NOT NULL");
    expect(migration).not.toContain("v_delivery.status NOT IN ('failed','bounced','blocked_configuration')");
    expect(migration).toContain("v_delivery.status NOT IN ('failed','blocked_configuration')");
    expect(migration).toContain("'email_suppressed', true");
    expect(migration).toContain("'email_suppression_reason', 'provider_bounce'");
  });

  it("masks PII in list responses and audit rows", () => {
    expect(migration).toContain("'target_masked', target_masked");
    expect(migration).toContain("public.marketing_mask_target(email)");
    expect(migration).toContain("- 'email' - 'email_normalized' - 'phone'");
  });

  it("keeps audience type and manual follow-up visible without exposing raw targets", () => {
    expect(migration).toContain("'contact_type', contact_type");
    expect(migration).toContain("'manual_outcome', metadata ->> 'manual_outcome'");
    expect(migration).toContain("'manual_note', left(metadata ->> 'manual_note', 2000)");
  });
});
