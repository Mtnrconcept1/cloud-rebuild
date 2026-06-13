import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

describe("cross-interface logout availability", () => {
  it("keeps a shared logout button wired to the central auth signOut flow", () => {
    const signOutButton = read("src/components/auth/SignOutButton.tsx");

    expect(signOutButton).toContain("useAuth");
    expect(signOutButton).toContain("await signOut()");
    expect(signOutButton).toContain('aria-label="Déconnexion"');
    expect(signOutButton).toContain("LogOut");
  });

  it("exposes logout from client, restaurant, courier and admin interfaces", () => {
    const customer = read("src/components/CustomerDashboardLayout.tsx");
    const restaurant = read("src/components/DashboardLayout.tsx");
    const courier = read("src/components/CourierDashboardLayout.tsx");
    const app = read("src/App.tsx");
    const adminMobile = read("src/components/admin/AdminMobileNavigation.tsx");

    expect(customer).toContain("SignOutButton");
    expect(restaurant).toContain("SignOutButton");
    expect(restaurant).toContain("iconOnly={collapsed}");
    expect(courier).toContain("SignOutButton iconOnly");
    expect(app).toContain("AdminRouteFrame");
    expect(app).toContain("SignOutButton iconOnly");
    expect(adminMobile).toContain("SignOutButton");
    expect(adminMobile).toContain(
      "onSignedOut={() => setMobileMenuOpen(false)}",
    );
  });
});
