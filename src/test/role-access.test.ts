import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  canAccessAnyRole,
  canAccessRole,
  canShowSocialFeedSurface,
  canShowClientSurface,
  canSwitchRoles,
  canUseClientRole,
  getFeatureVisibleRoles,
  getDefaultActiveRole,
  getEffectiveRoles,
  isRoleFeatureEnabled,
  getRoleHomePath,
} from "@/lib/roleAccess";
import type { UserRole } from "@/lib/auth-context";

describe("role access policy", () => {
  it("does not grant frontend roles from a hardcoded privileged email", () => {
    const roleAccessSource = readFileSync(resolve(process.cwd(), "src/lib/roleAccess.ts"), "utf8");

    expect(roleAccessSource).not.toContain("SUPER_ADMIN_EMAIL");
    expect(roleAccessSource).not.toContain("rbarman@hotmail.ch");
    expect(getEffectiveRoles(["admin"])).toEqual(["admin"]);
    expect(getEffectiveRoles([])).toEqual(["client"]);
  });

  it("keeps assigned client roles switchable for Supabase-backed multi-role accounts", () => {
    const authSource = readFileSync(resolve(process.cwd(), "src/lib/auth.tsx"), "utf8");
    const authPageSource = readFileSync(resolve(process.cwd(), "src/pages/Auth.tsx"), "utf8");
    const navbarSource = readFileSync(resolve(process.cwd(), "src/components/Navbar.tsx"), "utf8");
    const roleSwitcherSource = readFileSync(resolve(process.cwd(), "src/components/navigation/RoleSpaceSwitcher.tsx"), "utf8");
    const dashboardLayoutSource = readFileSync(resolve(process.cwd(), "src/components/DashboardLayout.tsx"), "utf8");
    const customerLayoutSource = readFileSync(resolve(process.cwd(), "src/components/CustomerDashboardLayout.tsx"), "utf8");
    const courierLayoutSource = readFileSync(resolve(process.cwd(), "src/components/CourierDashboardLayout.tsx"), "utf8");
    const adminFrameSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

    expect(authSource).not.toContain('role === "client" && hasPrivilegedRole(roles)');
    expect(authPageSource).toContain("getFeatureVisibleRoles(roles, activeFeatures)");
    expect(navbarSource).toContain("getFeatureVisibleRoles(roles, activeFeatures)");
    expect(roleSwitcherSource).toContain("getFeatureVisibleRoles(roles, activeFeatures)");
    expect(roleSwitcherSource).toContain("switchableRoles.map");
    expect(roleSwitcherSource).toContain("switchRole(nextRole)");
    expect(roleSwitcherSource).toContain("getRoleTarget");
    expect(dashboardLayoutSource).toContain("RoleSpaceSwitcher");
    expect(customerLayoutSource).toContain("RoleSpaceSwitcher");
    expect(courierLayoutSource).toContain("RoleSpaceSwitcher");
    expect(adminFrameSource).toContain("RoleSpaceSwitcher");
  });

  it("hides feature-disabled roles from switchers without mutating assigned roles", () => {
    const assignedRoles: UserRole[] = ["client", "admin", "restaurateur", "courier"];

    expect(isRoleFeatureEnabled("courier", new Set())).toBe(false);
    expect(isRoleFeatureEnabled("courier", new Set(["espace-livreur"]))).toBe(true);
    expect(isRoleFeatureEnabled("admin", new Set())).toBe(true);

    expect(getFeatureVisibleRoles(assignedRoles, new Set())).toEqual(["client", "admin", "restaurateur"]);
    expect(getFeatureVisibleRoles(assignedRoles, new Set(["espace-livreur"]))).toEqual(assignedRoles);
  });

  it("allows cross-role dashboard access only for roles assigned by Supabase", () => {
    const assignedRoles: UserRole[] = ["client", "admin", "restaurateur", "courier"];

    expect(canAccessRole({
      requiredRole: "courier",
      activeRole: "admin",
      roles: assignedRoles,
    })).toBe(true);

    expect(canAccessRole({
      requiredRole: "courier",
      activeRole: "admin",
      roles: ["client", "admin"],
    })).toBe(false);
  });

  it("allows routes that explicitly accept either client or restaurateur", () => {
    expect(canAccessAnyRole({
      requiredRoles: ["client", "restaurateur"],
      activeRole: "restaurateur",
      roles: ["client", "restaurateur"],
    })).toBe(true);

    expect(canAccessAnyRole({
      requiredRoles: ["client", "restaurateur"],
      activeRole: "courier",
      roles: ["client", "courier"],
    })).toBe(false);

    expect(canAccessAnyRole({
      requiredRoles: ["client", "restaurateur"],
      activeRole: "courier",
      roles: ["courier"],
    })).toBe(false);
  });

  it("lets backend admins switch only between their assigned roles", () => {
    expect(canAccessRole({
      requiredRole: "restaurateur",
      activeRole: "restaurateur",
      roles: ["client", "restaurateur", "courier"],
    })).toBe(true);

    expect(canAccessRole({
      requiredRole: "client",
      activeRole: "restaurateur",
      roles: ["client", "restaurateur", "courier"],
    })).toBe(false);

    expect(canAccessRole({
      requiredRole: "admin",
      activeRole: "restaurateur",
      roles: ["client", "restaurateur", "courier"],
    })).toBe(false);

    expect(canAccessRole({
      requiredRole: "client",
      activeRole: "admin",
      roles: ["client", "admin", "restaurateur"],
    })).toBe(false);

    expect(canAccessRole({
      requiredRole: "client",
      activeRole: "client",
      roles: ["client", "admin", "restaurateur", "courier"],
    })).toBe(true);

    expect(canSwitchRoles(["client"])).toBe(false);
    expect(canSwitchRoles(["client", "restaurateur"])).toBe(false);
    expect(canSwitchRoles(["client", "admin"])).toBe(true);
  });

  it("selects a role-specific landing page from assigned roles", () => {
    expect(getDefaultActiveRole(["client", "restaurateur"])).toBe("restaurateur");
    expect(getDefaultActiveRole(["client", "courier"])).toBe("courier");
    expect(getDefaultActiveRole(["client", "admin"])).toBe("admin");
    expect(getDefaultActiveRole(["client", "admin", "courier"])).toBe("admin");

    expect(getRoleHomePath("client")).toBe("/");
    expect(getRoleHomePath("restaurateur")).toBe("/dashboard");
    expect(getRoleHomePath("courier")).toBe("/courier");
    expect(getRoleHomePath("admin")).toBe("/admin");
  });

  it("shows shopping and customer navigation only to guests and users actively using an assigned client role", () => {
    expect(canShowClientSurface({ activeRole: null })).toBe(true);
    expect(canShowClientSurface({ activeRole: "client", roles: ["client"] })).toBe(true);
    expect(canShowClientSurface({ activeRole: "client", roles: ["client", "admin"] })).toBe(true);
    expect(canShowClientSurface({ activeRole: "client", roles: ["client", "restaurateur"] })).toBe(true);
    expect(canUseClientRole({ activeRole: "client", roles: ["client", "courier"] })).toBe(true);
    expect(canUseClientRole({ activeRole: "client", roles: ["courier"] })).toBe(false);
    expect(canShowClientSurface({ activeRole: "restaurateur" })).toBe(false);
    expect(canShowClientSurface({ activeRole: "courier" })).toBe(false);
    expect(canShowClientSurface({ activeRole: "admin" })).toBe(false);
  });

  it("shows the social feed to guests, clients and the active restaurateur role only", () => {
    expect(canShowSocialFeedSurface({ activeRole: null })).toBe(true);
    expect(canShowSocialFeedSurface({ activeRole: "client", roles: ["client"] })).toBe(true);
    expect(canShowSocialFeedSurface({ activeRole: "client", roles: ["client", "admin"] })).toBe(true);
    expect(canShowSocialFeedSurface({ activeRole: "restaurateur", roles: ["client", "restaurateur"] })).toBe(true);
    expect(canShowSocialFeedSurface({ activeRole: "courier" })).toBe(false);
    expect(canShowSocialFeedSurface({ activeRole: "admin" })).toBe(false);
  });
});
