import fs from "node:fs";
import { describe, expect, it } from "vitest";

const auth = fs.readFileSync("src/pages/Auth.tsx", "utf8");
const app = fs.readFileSync("src/App.tsx", "utf8");
const profile = fs.readFileSync("src/pages/Profil.tsx", "utf8");
const passwordForm = fs.readFileSync(
  "src/components/auth/AccountPasswordForm.tsx",
  "utf8",
);
const passwordPolicy = fs.readFileSync("src/lib/passwordPolicy.ts", "utf8");

describe("password recovery routing", () => {
  it("keeps recovery links on the dedicated reset form", () => {
    expect(auth).toContain('searchParams.get("mode") === "recovery"');
    expect(auth).toContain('event === "PASSWORD_RECOVERY"');
    expect(auth).toContain("<AccountPasswordForm");
    expect(auth).toContain("recovery");
    expect(auth).toContain("if (passwordRecoveryMode) return;");
  });

  it("returns to a clean login after the password is reset", () => {
    expect(auth).toContain('await supabase.auth.signOut({ scope: "local" })');
    expect(auth).toContain('navigate("/auth", { replace: true })');
  });
});

describe("authenticated account security", () => {
  it("uses the shared Supabase password updater", () => {
    expect(passwordForm).toContain("supabase.auth.updateUser({ password })");
    expect(passwordForm).toContain("new-password");
    expect(passwordForm).toContain("getAuthenticatorAssuranceLevel");
    expect(passwordForm).toContain("challengeAndVerify");
    expect(passwordForm).toContain("known to be weak");
  });

  it("validates passwords through the shared Supabase-aligned policy", () => {
    expect(passwordForm).toContain('from "@/lib/passwordPolicy"');
    expect(passwordForm).toContain("getPasswordError");
    // The symbol guidance must name the set Supabase actually accepts, so an
    // accented character is never mistaken for a valid symbol.
    expect(passwordPolicy).toContain("Ajoutez au moins un symbole");
    expect(passwordPolicy).toContain("REQUIRED_SYMBOLS");
    // A regular expression here would silently reopen the gap on a bad escape.
    expect(passwordPolicy).not.toMatch(/\[\^A-Za-z0-9/);
  });

  it("exposes account security from protected dashboards and client settings", () => {
    expect(app).toContain('path="/parametres/securite"');
    expect(app).toContain('to="/parametres/securite"');
    expect(profile).toContain("<AccountPasswordForm");
  });
});
