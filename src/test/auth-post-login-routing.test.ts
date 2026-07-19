import { describe, expect, it } from "vitest";

import { getPostAuthTargetForRole } from "@/lib/authPostLogin";

describe("post-auth workspace routing", () => {
  it("sends every production account to the canonical workspace chooser", () => {
    for (const role of ["client", "admin", "restaurateur", "courier", "commercial"] as const) {
      expect(getPostAuthTargetForRole(role, null)).toBe("/espaces");
      expect(getPostAuthTargetForRole(role, "/admin/restaurants")).toBe("/espaces");
      expect(getPostAuthTargetForRole(role, "/commercial/demo-live")).toBe("/espaces");
    }
  });

  it("resumes a valid OAuth consent flow immediately", () => {
    const consentTarget = "/oauth/consent?authorization_id=authorization-123";
    for (const role of ["client", "admin", "restaurateur", "courier", "commercial"] as const) {
      expect(getPostAuthTargetForRole(role, consentTarget)).toBe(consentTarget);
    }
  });

  it("does not accept invalid or cross-origin consent continuations", () => {
    expect(getPostAuthTargetForRole("admin", "/oauth/consent")).toBe("/espaces");
    expect(getPostAuthTargetForRole(
      "restaurateur",
      "https://attacker.example/oauth/consent?authorization_id=authorization-123",
    )).toBe("/espaces");
  });

  it("keeps the internal dedicated-demo login on its isolated role home", () => {
    expect(getPostAuthTargetForRole("restaurateur", null, { isDemoAuthMode: true }))
      .toBe("/dashboard");
    expect(getPostAuthTargetForRole("commercial", null, { isDemoAuthMode: true }))
      .toBe("/commercial");
  });
});
