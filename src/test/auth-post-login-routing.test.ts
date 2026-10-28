import { describe, expect, it } from "vitest";

import { getOAuthConsentTargetFromSearch, getPostAuthTargetForRole } from "@/lib/authPostLogin";

describe("post-auth workspace routing", () => {
  it("sends professional accounts to the canonical workspace chooser", () => {
    for (const role of ["admin", "restaurateur", "courier", "commercial"] as const) {
      expect(getPostAuthTargetForRole(role, null)).toBe("/espaces");
      expect(getPostAuthTargetForRole(role, "/admin/restaurants")).toBe("/espaces");
      expect(getPostAuthTargetForRole(role, "/commercial/demo-live")).toBe("/espaces");
    }
  });

  it("returns a recovering administrator to CRM without opening arbitrary redirect targets", () => {
    expect(getPostAuthTargetForRole("admin", "/admin/crm")).toBe("/admin/crm");
    expect(getPostAuthTargetForRole("client", "/admin/crm")).toBe("/");
    expect(getPostAuthTargetForRole("restaurateur", "/admin/crm")).toBe("/espaces");
    expect(getPostAuthTargetForRole("admin", "/admin/crm?external=1")).toBe("/espaces");
    expect(getPostAuthTargetForRole("admin", "//attacker.example/admin/crm")).toBe("/espaces");
  });

  it("sends clients to the public homepage instead of their dashboard after launch", () => {
    expect(getPostAuthTargetForRole("client", null, { launchEnabled: false })).toBe("/");
    expect(getPostAuthTargetForRole("client", "/mon-espace", { launchEnabled: false })).toBe("/");
    expect(getPostAuthTargetForRole("client", "/commercial/demo-live", { launchEnabled: false })).toBe("/");
  });

  it("resumes a valid OAuth consent flow immediately", () => {
    const consentTarget = "/oauth/consent?authorization_id=authorization-123";
    for (const role of ["client", "admin", "restaurateur", "courier", "commercial"] as const) {
      expect(getPostAuthTargetForRole(role, consentTarget)).toBe(consentTarget);
    }
  });

  it("preserves OAuth consent for clients while the launch gate is enabled or unknown", () => {
    const consentTarget = "/oauth/consent?authorization_id=authorization-123";
    expect(getPostAuthTargetForRole("client", consentTarget, { launchEnabled: true })).toBe(consentTarget);
    expect(getPostAuthTargetForRole("client", null, { launchEnabled: true })).toBe("/coming-soon");
    expect(getPostAuthTargetForRole("client", "/panier", { launchEnabled: true })).toBe("/coming-soon");
  });

  it("recovers the native Supabase authorization id sent directly to the login page", () => {
    const params = new URLSearchParams("authorization_id=authorization-123&redirect=https://attacker.example");
    expect(getOAuthConsentTargetFromSearch(params)).toBe("/oauth/consent?authorization_id=authorization-123");
  });

  it.each(["", "authorization_id=", "authorization_id=%20", "authorization_id=x&authorization_id=y", "authorization_id=%2F%2Fevil.example", `authorization_id=${"x".repeat(201)}`])("ignores malformed or ambiguous authorization ids: %s", (query) => {
    expect(getOAuthConsentTargetFromSearch(new URLSearchParams(query))).toBeNull();
  });

  it("does not accept invalid or cross-origin consent continuations", () => {
    expect(getPostAuthTargetForRole("admin", "/oauth/consent")).toBe("/espaces");
    expect(getPostAuthTargetForRole(
      "restaurateur",
      "https://attacker.example/oauth/consent?authorization_id=authorization-123",
    )).toBe("/espaces");
  });

  it("resumes a validated employee invitation for an ordinary client during launch", () => {
    const target = "/equipe/mon-espace?restaurant=10000000-0000-4000-8000-000000000001";
    expect(getPostAuthTargetForRole("client", target, { launchEnabled: true })).toBe(target);
    expect(getPostAuthTargetForRole("restaurateur", target)).toBe(target);
    expect(getPostAuthTargetForRole("client", "/equipe/gestion", { launchEnabled: true })).toBe("/equipe/gestion");
  });

  it.each([
    "https://attacker.example/equipe/mon-espace",
    "/equipe/mon-espace?restaurant=invalid",
    "/equipe/mon-espace?restaurant=10000000-0000-4000-8000-000000000001&next=/admin",
    "/equipe/gestion?next=/admin",
  ])("does not resume an invalid employee continuation: %s", (target) => {
    expect(getPostAuthTargetForRole("client", target, { launchEnabled: true })).toBe("/coming-soon");
    expect(getPostAuthTargetForRole("admin", target)).toBe("/espaces");
  });

  it("keeps the internal dedicated-demo login on its isolated role home", () => {
    expect(getPostAuthTargetForRole("restaurateur", null, { isDemoAuthMode: true }))
      .toBe("/dashboard");
    expect(getPostAuthTargetForRole("commercial", null, { isDemoAuthMode: true }))
      .toBe("/commercial");
  });
});
