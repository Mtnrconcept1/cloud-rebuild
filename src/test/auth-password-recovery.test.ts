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

  it("only offers the new password form once a recovery session exists", () => {
    // mode=recovery says the link pointed here, not that its one-time token
    // survived. Supabase burns that token on first use, so a mail scanner or a
    // first click on another device leaves the visitor session-less. Showing
    // the form anyway ends on a raw "Auth session missing!" after typing.
    expect(auth).toContain("const recoverySessionReady = Boolean(session);");
    expect(auth).toContain("{recoverySessionReady ? (");
    expect(auth).toContain("Lien de réinitialisation expiré");
    expect(auth).toContain("Demander un nouveau lien");
    // Never announce an expired link while the code exchange is still running.
    expect(auth).toContain("const recoveryLinkPending = authLoading || loading;");
  });

  it("translates the session-missing failure into an actionable sentence", () => {
    const form = fs.readFileSync("src/components/auth/AccountPasswordForm.tsx", "utf8");

    expect(form).toContain("auth session missing");
    expect(form).toContain("Demandez un nouveau lien");
  });
});
