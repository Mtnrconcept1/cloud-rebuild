import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const appSource = readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8");

function getRouteElement(routePath: string) {
  const escapedPath = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = appSource.match(new RegExp(`<Route\\s+path="${escapedPath}"\\s+element=\\{([\\s\\S]*?)\\}\\s*/>`));
  return match?.[1] || "";
}

describe("role route wiring", () => {
  it("requires the client role for authenticated customer account routes", () => {
    const customerRoutes = [
      "/commandes",
      "/commande/:id",
      "/reservations",
      "/profil",
      "/notifications",
      "/points-cadeau",
    ];

    const routesWithoutClientGuard = customerRoutes.filter((routePath) =>
      !getRouteElement(routePath).includes('requiredRole="client"')
    );

    expect(routesWithoutClientGuard).toEqual([]);
  });

  it("guards restaurant and courier notification history routes by role", () => {
    expect(getRouteElement("/dashboard/notifications")).toContain("DashboardRoute");
    expect(getRouteElement("/courier/notifications")).toContain('requiredRole="courier"');
  });

  it("keeps the public social feed accessible without an auth guard", () => {
    const actualitesRoute = getRouteElement("/actualites");

    expect(actualitesRoute).toContain("<Actualites />");
    expect(actualitesRoute).toContain("actualitesSocialesEnabled");
    expect(actualitesRoute).not.toContain("ProtectedRoute");
    expect(actualitesRoute).not.toContain("requiredRole");
    expect(actualitesRoute).not.toContain("requiredRoles");
  });

  it("does not use the admin role as a generic bypass in ProtectedRoute", () => {
    const protectedRouteSource = readFileSync(resolve(process.cwd(), "src/components/ProtectedRoute.tsx"), "utf8");

    expect(protectedRouteSource).not.toMatch(/roles\.includes\("admin"\)|role\s*===\s*"admin"/);
  });

  it("does not hide the public social feed behind the customer-only navigation surface", () => {
    const navbarSource = readFileSync(resolve(process.cwd(), "src/components/Navbar.tsx"), "utf8");

    expect(navbarSource).toContain("showSocialFeedSurface");
    expect(navbarSource).not.toContain("showClientSurface && actualitesEnabled");
  });
});
