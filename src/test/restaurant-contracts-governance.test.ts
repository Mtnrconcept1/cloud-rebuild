import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260621120000_restaurant_partner_contracts.sql",
  "utf8",
);
const contractCopy = readFileSync(
  "src/lib/restaurantPartnerContract.ts",
  "utf8",
);
const authPage = readFileSync("src/pages/Auth.tsx", "utf8");
const dashboardContractCard = readFileSync(
  "src/components/contracts/RestaurantPartnerContractCard.tsx",
  "utf8",
);
const signupValidation = readFileSync(
  "supabase/functions/submit-signup-application/validation.ts",
  "utf8",
);

describe("restaurant partner contracts governance", () => {
  it("stores signatures in an RLS protected restaurant_contracts table", () => {
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS public.restaurant_contracts",
    );
    expect(migration).toContain(
      "ALTER TABLE public.restaurant_contracts ENABLE ROW LEVEL SECURITY",
    );
    expect(migration).toContain("restaurant_contracts_owner_insert_signature");
    expect(migration).toContain("signed_by = auth.uid()");
    expect(migration).toContain("r.owner_id = auth.uid()");
    expect(migration).toContain("public.auth_is_admin()");
    expect(migration).toContain(
      "REVOKE ALL ON public.restaurant_contracts FROM anon",
    );
  });

  it("keeps a complete signed contract version in the frontend copy", () => {
    expect(contractCopy).toContain("RESTAURANT_PARTNER_CONTRACT_VERSION");
    expect(contractCopy).toContain(
      "Annexe tarifaire Fair Growth, commissions et facturation",
    );
    expect(contractCopy).toContain(
      "Paiements, annulations, no-show, remboursements et litiges clients",
    );
    expect(contractCopy).toContain(
      "Signature numérique, piste de preuve et archivage",
    );
    expect(contractCopy).toContain(
      "generateSignedRestaurantPartnerContractHtml",
    );
    expect(contractCopy).toContain("Signature manuscrite du restaurateur");
    expect(contractCopy).toContain("Informations complètes du restaurateur");
    expect(contractCopy).toContain("TOK_CONTRACT_LEGAL_INFORMATION");
    expect(contractCopy).toContain("Date de signature");
    expect(contractCopy).toContain("Lieu");
    expect(contractCopy).toContain("IDE/UID suisse");
    expect(contractCopy).toContain("Sur les frais de réservation");
    expect(contractCopy).toContain("chargeback");
    expect(contractCopy).toContain("sous-traitants ultérieurs");
    expect(contractCopy).toContain("allergènes");
    expect(contractCopy).toContain("tribunaux compétents du canton de Genève");
    expect(contractCopy).toContain("Annexes contractuelles attendues");
  });

  it("requires a manual restaurateur contract signature during signup before submission", () => {
    expect(authPage).toContain("RestaurantContractSignaturePad");
    expect(authPage).toContain("Signature au doigt ou au stylet");
    expect(authPage).toContain("Exporter le contrat signé en PDF");
    expect(authPage).toContain("openSafeHtmlPrintDocument");
    expect(authPage).not.toContain(
      'window.open("", "_blank", "noopener,noreferrer")',
    );
    expect(authPage).toContain("contract_signature_data_url");
    expect(authPage).toContain("contract_content_hash");
    expect(authPage).toContain("contract_acceptance_text");
    expect(signupValidation).toContain("contract_signature_data_url");
    expect(signupValidation).toContain(
      "La signature manuscrite du contrat restaurateur est requise.",
    );
  });

  it("allows signed restaurant contracts to be exported from the restaurateur dashboard", () => {
    expect(dashboardContractCard).toContain("Exporter le contrat en PDF");
    expect(dashboardContractCard).toContain(
      "generateSignedRestaurantPartnerContractHtml",
    );
    expect(dashboardContractCard).toContain("user_profiles");
    expect(dashboardContractCard).toContain("contract_signature_data_url");
    expect(dashboardContractCard).toContain("acceptance_text");
    expect(dashboardContractCard).toContain("signed_user_id");
    expect(dashboardContractCard).toContain("signed_restaurant_id");
  });

  it("uses the shared iframe fallback for contract PDF exports on mobile browsers", () => {
    const safePrintWindow = readFileSync("src/lib/safePrintWindow.ts", "utf8");

    expect(authPage).toContain("openSafeHtmlPrintDocument");
    expect(dashboardContractCard).toContain("openSafeHtmlPrintDocument");
    expect(safePrintWindow).toContain("openIframePrintFallback");
    expect(safePrintWindow).toContain("shouldUseInlinePrintFallback");
    expect(safePrintWindow).toContain("if (shouldUseInlinePrintFallback())");
    expect(safePrintWindow).toContain(
      "return openIframePrintFallback(safeHtml, printDelayMs)",
    );
  });
});
