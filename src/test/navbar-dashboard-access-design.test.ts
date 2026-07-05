import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("navbar dashboard access design", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/Navbar.tsx"), "utf8");
  const roleMenuSource = readFileSync(resolve(process.cwd(), "src/components/navigation/RoleSpaceMenuSection.tsx"), "utf8");

  it("surfaces role dashboards inside menus instead of a header spaces CTA", () => {
    expect(source).toContain("RoleSpaceMenuSection");
    expect(source).toContain('aria-label="Compte"');
    expect(source).not.toContain("dashboardAccessItems");
    expect(source).not.toContain("hasDashboardAccess");
    expect(source).not.toContain("Ouvrir mes espaces");
    expect(roleMenuSource).toContain("Mes espaces");
    expect(roleMenuSource).toContain("getFeatureVisibleRoles(roles, activeFeatures)");
    expect(roleMenuSource).toContain("Dashboard restaurateur");
    expect(roleMenuSource).toContain("Espace commercial");
    expect(roleMenuSource).toContain("getAdminNavigationHref(\"/admin\")");
  });
});
