import { describe, expect, it } from "vitest";

import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_POLICY_HINT,
  getPasswordError,
  getPasswordPolicyError,
  hasRequiredSymbol,
} from "@/lib/passwordPolicy";

describe("Supabase password policy", () => {
  it("rejects the accented passwords Supabase answered with 422", () => {
    // Observed in production: the client accepted these because it tested for
    // any non-alphanumeric character, then Supabase refused them with
    // "Password should contain at least one character of each: ...".
    for (const password of ["Motdepassé1", "Chaîne2026€", "Passwörter9", "Résumé123«»"]) {
      expect(hasRequiredSymbol(password)).toBe(false);
      expect(getPasswordPolicyError(password)).toContain("Ajoutez au moins un symbole");
    }
  });

  it("accepts a password satisfying every Supabase character class", () => {
    expect(getPasswordPolicyError("Bonjour2026!")).toBeNull();
    expect(getPasswordError("Bonjour2026!", "Bonjour2026!")).toBeNull();
  });

  it("covers the full symbol set Supabase advertises", () => {
    for (const symbol of "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~") {
      expect(hasRequiredSymbol(`Bonjour2026${symbol}`)).toBe(true);
    }
  });

  it("requires length, case and digits before the symbol check", () => {
    expect(getPasswordPolicyError("Court1!")).toContain(String(MIN_PASSWORD_LENGTH));
    expect(getPasswordPolicyError("bonjour2026!")).toContain("majuscule");
    expect(getPasswordPolicyError("BonjourMonde!")).toContain("chiffre");
  });

  it("reports a confirmation mismatch only once the policy is satisfied", () => {
    expect(getPasswordError("Bonjour2026!", "Bonjour2027!")).toContain("ne correspondent pas");
    expect(getPasswordError("court", "autre")).toContain(String(MIN_PASSWORD_LENGTH));
  });

  it("states the accepted symbols in the hint shown to users", () => {
    expect(PASSWORD_POLICY_HINT).toContain(String(MIN_PASSWORD_LENGTH));
    expect(PASSWORD_POLICY_HINT).toContain("!@#$%^&*()");
  });
});
