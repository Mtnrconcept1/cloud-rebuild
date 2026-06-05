import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("navbar dashboard access design", () => {
  const source = readFileSync(resolve(process.cwd(), "src/components/Navbar.tsx"), "utf8");

  it("surfaces role dashboards as a visible CTA instead of plain menu links", () => {
    expect(source).toContain("dashboardAccessItems");
    expect(source).toContain("hasDashboardAccess");
    expect(source).toContain("Mes espaces");
    expect(source).toContain("Accès rapides");
    expect(source).toContain("Ouvrir mes espaces");
    expect(source).toContain("rounded-2xl border border-primary/15 bg-background/90 p-3");
    expect(source).toContain("group-hover:translate-x-0.5");
    expect(source).toContain("getAdminNavigationHref(\"/admin\")");
  });
});
