import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildCommercialContractDocument,
  COMMERCIAL_CONTRACT_PAGE_COUNT,
  COMMERCIAL_CONTRACT_TITLE,
  COMMERCIAL_CONTRACT_VERSION,
  hashCommercialContract,
} from "@/lib/commercialContract";
import { COMMERCIAL_COMPENSATION_RULES } from "@/lib/commercialSales";

const party = {
  id: "00000000-0000-4000-8000-000000000001",
  legalName: "Partie Test SA",
  address: "Genève, Suisse",
  representativeName: "Camille Test",
  representativeRole: "Direction",
};

describe("dedicated commercial contract generation", () => {
  const document = buildCommercialContractDocument(party, { ...party, id: "00000000-0000-4000-8000-000000000002" });

  it("freezes the identity, version and three controlled A4 print pages", () => {
    expect(document.title).toBe(COMMERCIAL_CONTRACT_TITLE);
    expect(document.version).toBe(COMMERCIAL_CONTRACT_VERSION);
    expect(COMMERCIAL_CONTRACT_PAGE_COUNT).toBe(3);
    expect(document.pages).toHaveLength(3);
    expect(document.pages.map((page) => page.number)).toEqual([1, 2, 3]);
    expect(document.pages.map((page) => page.heading)).toMatchInlineSnapshot(`
      [
        "Identification et mission",
        "Rémunération, attribution et commissions",
        "Confidentialité, conformité, durée et signatures",
      ]
    `);

    const component = readFileSync(resolve(process.cwd(), "src/components/commercial/CommercialContractPanel.tsx"), "utf8");
    const styles = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    expect(component).toContain('className="commercial-contract-print-page');
    expect(component).toContain("document.pages.map");
    expect(component).toContain("data-print-page={page.number}");
    expect(styles).toContain("width: 210mm");
    expect(styles).toContain("height: 297mm");
    expect(styles).toContain("page-break-after: always");
  });

  it("contains the critical Swiss-law, confidentiality, attribution and termination clauses", () => {
    const clauses = document.pages.flatMap((page) => page.clauses).map((clause) => `${clause.title} ${clause.text}`).join("\n");
    for (const criticalText of [
      "droit suisse",
      "LPD suisse",
      "commission de signature reste en attente jusqu’au paiement restaurateur",
      "préavis de 30 jours",
      "juriste suisse avant toute activation en production",
    ]) expect(clauses).toContain(criticalText);
  });

  it("snapshots the authoritative compensation appendix and produces a SHA-256 hash", async () => {
    expect(document.compensationSnapshot).toEqual(COMMERCIAL_COMPENSATION_RULES);
    expect(document.compensationSnapshot.signatureCommissionChf).toMatchInlineSnapshot(`
      {
        "engaged": {
          "business": 120,
          "elite": 300,
          "premium": 190,
          "starter": 60,
        },
        "sprint": {
          "business": 220,
          "elite": 650,
          "premium": 350,
          "starter": 120,
        },
      }
    `);
    expect(document.compensationSnapshot.monthlySalaryChf).toEqual({ engaged: 2_500, teamLead: 3_500 });
    expect(document.compensationSnapshot.honoredReservationCommissionChf).toEqual({ personal: 0.1, teamLead: 0.05 });
    await expect(hashCommercialContract(document)).resolves.toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps evidence append-only, role-scoped, audited and legally gated", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260728150000_commercial_contract_acceptances.sql"), "utf8");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("prevent_commercial_contract_evidence_mutation");
    expect(migration).toContain("swiss_legal_review_required_before_activation");
    expect(migration).toContain("commercial_contract_accepted");
    expect(migration).toContain("REVOKE ALL ON TABLE public.commercial_contract_acceptances");
    expect(migration).not.toContain("restaurant_partner_contracts");
  });
});
