import { describe, expect, it } from "vitest";

import { getPostAuthTargetForRole } from "@/lib/authPostLogin";

describe("post-auth role routing", () => {
  it("preserves the requested admin route after admin sign-in", () => {
    expect(getPostAuthTargetForRole("admin", "/admin/restaurants")).toBe("/admin/restaurants");
    expect(getPostAuthTargetForRole("admin", "/admin/restaurants?filter=active")).toBe(
      "/admin/restaurants?filter=active",
    );
  });

  it("does not send client users to privileged routes after sign-in", () => {
    expect(getPostAuthTargetForRole("client", "/admin/restaurants")).toBe("/mon-espace");
    expect(getPostAuthTargetForRole("client", "/dashboard/reservations")).toBe("/mon-espace");
    expect(getPostAuthTargetForRole("client", "/courier/jobs")).toBe("/mon-espace");
  });

  it("preserves role-specific dashboard redirects for privileged users", () => {
    expect(getPostAuthTargetForRole("restaurateur", "/dashboard/reservations")).toBe(
      "/dashboard/reservations",
    );
    expect(getPostAuthTargetForRole("courier", "/courier/jobs")).toBe("/courier/jobs");
  });

  it("resumes OAuth consent after sign-in for every TOK role", () => {
    const consentTarget = "/oauth/consent?authorization_id=authorization-123";

    for (const role of ["client", "admin", "restaurateur", "courier", "commercial"] as const) {
      expect(getPostAuthTargetForRole(role, consentTarget)).toBe(consentTarget);
    }
  });

  it("does not treat invalid or cross-origin consent targets as OAuth continuations", () => {
    expect(getPostAuthTargetForRole("admin", "/oauth/consent")).toBe("/admin");
    expect(
      getPostAuthTargetForRole(
        "restaurateur",
        "https://attacker.example/oauth/consent?authorization_id=authorization-123",
      ),
    ).toBe("/dashboard");
  });

  it("sends privileged users to their role home when the redirect targets a public surface", () => {
    expect(getPostAuthTargetForRole("admin", "/recherche?q=sushi")).toBe("/admin");
    expect(getPostAuthTargetForRole("restaurateur", "/recherche?q=sushi")).toBe("/dashboard");
    expect(getPostAuthTargetForRole("courier", "/recherche?q=sushi")).toBe("/courier");
  });
});

