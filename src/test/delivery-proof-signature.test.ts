import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("delivery proof signature flow", () => {
  it("allows manual signatures in the courier portal proof flow", () => {
    const source = readFileSync("supabase/functions/courier-portal/index.ts", "utf8");

    expect(source).toContain('"manual_signature"');
    expect(source).toContain("signature_data_url");
    expect(source).toContain("Signature client invalide");
    expect(source).toContain('nextStatus: "delivered"');
  });

  it("allows manual_signature in the proof_of_delivery constraint", () => {
    const migration = readFileSync("supabase/migrations/20260603102000_allow_manual_signature_delivery_proof.sql", "utf8");

    expect(migration).toContain("'manual_signature'");
    expect(migration).toContain("proof_of_delivery_verification_method_check");
  });
});
