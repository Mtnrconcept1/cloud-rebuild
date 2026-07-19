import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("admin domain routing", () => {
  it("centralizes admin host redirects and navigation targets", async () => {
    const {
      TOK_ADMIN_APP_HOST,
      TOK_ADMIN_APP_ORIGIN,
      getAdminHostRedirectTarget,
      getAdminNavigationHref,
    } = await import("@/lib/adminDomains");

    expect(TOK_ADMIN_APP_HOST).toBe("admin.thetok.ch");
    expect(TOK_ADMIN_APP_ORIGIN).toBe("https://admin.thetok.ch");

    expect(getAdminNavigationHref("/admin/avis", "www.thetok.ch")).toBe("https://admin.thetok.ch/admin/avis");
    expect(getAdminNavigationHref("/admin/avis", "admin.thetok.ch")).toBe("/admin/avis");
    expect(getAdminNavigationHref("/admin/avis", "localhost")).toBe("/admin/avis");

    expect(getAdminHostRedirectTarget({
      hostname: "www.thetok.ch",
      pathname: "/admin/avis",
      search: "?review=123",
    })).toBe("https://admin.thetok.ch/admin/avis?review=123");

    expect(getAdminHostRedirectTarget({
      hostname: "admin.thetok.ch",
      pathname: "/",
    })).toBe("https://admin.thetok.ch/admin");

    expect(getAdminHostRedirectTarget({
      hostname: "admin.thetok.ch",
      pathname: "/auth",
      search: "?redirect=%2Fadmin",
    })).toBe("https://www.thetok.ch/auth?redirect=%2Fadmin");

    expect(getAdminHostRedirectTarget({
      hostname: "admin.thetok.ch",
      pathname: "/espaces",
    })).toBe("https://www.thetok.ch/espaces");

    expect(getAdminHostRedirectTarget({
      hostname: "admin.thetok.ch",
      pathname: "/recherche",
      search: "?q=sushi",
    })).toBe("https://www.thetok.ch/recherche?q=sushi");

    expect(getAdminHostRedirectTarget({
      hostname: "localhost",
      pathname: "/admin",
    })).toBeNull();
  });

  it("wires admin entry points to the dedicated admin host", () => {
    const app = read("src/App.tsx");
    const navbar = read("src/components/Navbar.tsx");
    const customerLayout = read("src/components/CustomerDashboardLayout.tsx");
    const courierLayout = read("src/components/CourierDashboardLayout.tsx");
    const roleSpaceMenu = read("src/components/navigation/RoleSpaceMenuSection.tsx");

    expect(app).toContain("AdminHostBoundary");
    expect(app).toContain("getAdminHostRedirectTarget");
    expect(roleSpaceMenu).toContain("getAdminNavigationHref");
    expect(navbar).toContain("RoleSpaceMenuSection");
    expect(customerLayout).toContain("RoleSpaceMenuSection");
    expect(courierLayout).toContain("RoleSpaceMenuSection");
  });
});
