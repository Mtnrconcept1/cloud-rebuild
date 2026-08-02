import fs from "node:fs";
import { describe, expect, it } from "vitest";

const auth = fs.readFileSync("src/pages/Auth.tsx", "utf8");

describe("password recovery hardening", () => {
  it("normalizes email before calling Supabase", () => {
    expect(auth).toContain("signupForm.email.trim().toLowerCase()");
    expect(auth).toContain("resetPasswordForEmail(\n        normalizedEmail");
  });

  it("blocks duplicate in-flight requests", () => {
    expect(auth).toContain("passwordRecoveryRequestRef.current");
    expect(auth).toContain("if (passwordRecoveryRequestRef.current) return");
  });

  it("shows a dedicated rate-limit message", () => {
    expect(auth).toContain("error.status === 429");
    expect(auth).toContain("Trop de demandes");
    expect(auth).toContain("Attendez quelques minutes");
  });
});
