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
    expect(contractCopy).toContain("Prix, commissions, frais et facturation");
    expect(contractCopy).toContain(
      "Paiements, remboursements et Stripe Connect",
    );
    expect(contractCopy).toContain("Signature numérique et preuve");
  });
});
