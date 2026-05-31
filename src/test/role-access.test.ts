import { describe, expect, it } from "vitest";

import {
  canAccessAnyRole,
  canAccessRole,
  canShowSocialFeedSurface,
  canShowClientSurface,
  canSwitchRoles,
  getDefaultActiveRole,
  getEffectiveRoles,
  getRoleHomePath,
  isSuperAdminEmail,
} from "@/lib/roleAccess";
import type { UserRole } from "@/lib/auth-context";

describe("role access policy", () => {
  it("recognizes only rbarman@hotmail.ch as the cross-role super admin", () => {
    expect(isSuperAdminEmail("rbarman@hotmail.ch")).toBe(true);
    expect(isSuperAdminEmail(" RBARMAN@hotmail.ch ")).toBe(true);
    expect(isSuperAdminEmail("admin@example.com")).toBe(false);
    expect(isSuperAdminEmail(null)).toBe(false);
  });

  it("allows cross-role dashboard access only for the super admin account", () => {
    const assignedRoles: UserRole[] = ["client", "admin", "restaurateur", "courier"];

    expect(canAccessRole({
      requiredRole: "courier",
      activeRole: "admin",
      roles: assignedRoles,
      userEmail: "rbarman@hotmail.ch",
    })).toBe(true);

    expect(canAccessRole({
      requiredRole: "courier",
      activeRole: "admin",
      roles: assignedRoles,
      userEmail: "admin@example.com",
    })).toBe(false);
  });

  it("allows routes that explicitly accept either client or restaurateur", () => {
    expect(canAccessAnyRole({
      requiredRoles: ["client", "restaurateur"],
      activeRole: "restaurateur",
      roles: ["client", "restaurateur"],
      userEmail: "owner@example.com",
    })).toBe(true);

    expect(canAccessAnyRole({
      requiredRoles: ["client", "restaurateur"],
      activeRole: "courier",
      roles: ["client", "courier"],
      userEmail: "driver@example.com",
    })).toBe(false);
  });

  it("keeps non-super users limited to their active role even if multiple roles are assigned", () => {
    expect(canAccessRole({
      requiredRole: "restaurateur",
      activeRole: "restaurateur",
      roles: ["client", "restaurateur", "courier"],
      userEmail: "owner@example.com",
    })).toBe(true);

    expect(canAccessRole({
      requiredRole: "client",
      activeRole: "restaurateur",
      roles: ["client", "restaurateur", "courier"],
      userEmail: "owner@example.com",
    })).toBe(false);

    expect(canSwitchRoles(["client", "restaurateur"], "owner@example.com")).toBe(false);
    expect(canSwitchRoles(["client", "restaurateur"], "rbarman@hotmail.ch")).toBe(true);
  });

  it("grants all role surfaces only to the super admin effective role set", () => {
    expect(getEffectiveRoles(["admin"], "rbarman@hotmail.ch")).toEqual([
      "client",
      "admin",
      "restaurateur",
      "courier",
    ]);

    expect(getEffectiveRoles(["admin"], "admin@example.com")).toEqual(["admin"]);
  });

  it("selects a role-specific landing page for non-super accounts", () => {
    expect(getDefaultActiveRole(["client", "restaurateur"], "owner@example.com")).toBe("restaurateur");
    expect(getDefaultActiveRole(["client", "courier"], "driver@example.com")).toBe("courier");
    expect(getDefaultActiveRole(["client", "admin"], "admin@example.com")).toBe("admin");
    expect(getDefaultActiveRole(["client", "admin", "courier"], "rbarman@hotmail.ch")).toBe("admin");

    expect(getRoleHomePath("client")).toBe("/");
    expect(getRoleHomePath("restaurateur")).toBe("/dashboard");
    expect(getRoleHomePath("courier")).toBe("/courier");
    expect(getRoleHomePath("admin")).toBe("/admin");
  });

  it("shows shopping and customer navigation only to guests, clients, and the super admin", () => {
    expect(canShowClientSurface({ userEmail: null, activeRole: null })).toBe(true);
    expect(canShowClientSurface({ userEmail: "client@example.com", activeRole: "client" })).toBe(true);
    expect(canShowClientSurface({ userEmail: "owner@example.com", activeRole: "restaurateur" })).toBe(false);
    expect(canShowClientSurface({ userEmail: "driver@example.com", activeRole: "courier" })).toBe(false);
    expect(canShowClientSurface({ userEmail: "rbarman@hotmail.ch", activeRole: "admin" })).toBe(true);
  });

  it("shows the social feed to clients, restaurateurs and the super admin only", () => {
    expect(canShowSocialFeedSurface({ userEmail: null, activeRole: null })).toBe(true);
    expect(canShowSocialFeedSurface({ userEmail: "client@example.com", activeRole: "client" })).toBe(true);
    expect(canShowSocialFeedSurface({ userEmail: "owner@example.com", activeRole: "restaurateur" })).toBe(true);
    expect(canShowSocialFeedSurface({ userEmail: "driver@example.com", activeRole: "courier" })).toBe(false);
    expect(canShowSocialFeedSurface({ userEmail: "admin@example.com", activeRole: "admin" })).toBe(false);
    expect(canShowSocialFeedSurface({ userEmail: "rbarman@hotmail.ch", activeRole: "admin" })).toBe(true);
  });
});
