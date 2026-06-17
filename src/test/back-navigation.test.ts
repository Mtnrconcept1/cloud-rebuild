import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdminRouteFrame } from "@/App";

const root = process.cwd();

vi.mock("@/components/notifications/NotificationBell", () => ({
  default: () => null,
}));

vi.mock("@/components/admin/AdminMobileNavigation", () => ({
  default: () => null,
}));

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

afterEach(() => {
  cleanup();
});

describe("route back navigation", () => {
  it("provides one shared back button with history fallback handling", () => {
    const source = read("src/components/navigation/BackNavigationButton.tsx");
    const helper = read("src/lib/backNavigation.ts");

    expect(source).toContain("ArrowLeft");
    expect(source).toContain("export function BackNavigationButton");
    expect(source).toContain("export function FloatingRouteBackButton");
    expect(helper).toContain("export function shouldShowFloatingBackButton");
    expect(source).toContain('import { shouldShowFloatingBackButton } from "@/lib/backNavigation";');
    expect(source).toContain("getBackFallbackForPathname");
    expect(source).toContain("navigate(-1)");
    expect(source).toContain("showLabel");
    expect(source).toContain("sr-only");
    expect(source).toContain("aria-label=");
    expect(source).toContain("relative z-10 mx-auto flex w-full max-w-screen-2xl");
    expect(source).toContain("pt-[calc(env(safe-area-inset-top,0px)+4.75rem)] md:pt-3");
    expect(source).not.toContain("pointer-events-none absolute");
    expect(source).not.toContain("z-[65]");
    expect(source).not.toContain('pathname === "/actualites"');
  });

  it("adds back navigation to public, admin, dashboard, client and courier shells", () => {
    const app = read("src/App.tsx");
    const dashboard = read("src/components/DashboardLayout.tsx");
    const customer = read("src/components/CustomerDashboardLayout.tsx");
    const courier = read("src/components/CourierDashboardLayout.tsx");
    const backNavigation = read("src/components/navigation/BackNavigationButton.tsx");

    expect(app).toContain("<FloatingRouteBackButton />");
    expect(app).not.toContain("floating-back-button-mobile-offset");
    expect(app).toContain("function AdminRouteFrame");
    expect(app).toContain('import { createPortal } from "react-dom";');
    expect(app).toContain("adminBackButtonPortalStyle");
    expect(app).toContain("zIndex: 1200");
    expect(app).toContain('data-testid="admin-mobile-back-button"');
    expect(app).toContain("createPortal(backButton, document.body)");
    expect(app).toContain("AdminMobileNavigation");
    expect(app).toContain("pb-24");
    expect(app).toContain("pt-[calc(env(safe-area-inset-top,0px)+3.75rem)]");
    expect(app).toContain("showLabel={false}");
    expect(app).toContain("bg-primary");
    expect(app).toContain("function AdminDashboardRoute");
    expect(app).toContain('<AdminRouteFrame fallback="/">');
    expect(app).toContain("function AdminProtectedRoute");
    expect(app).toContain("<AdminRouteFrame fallback={fallback}>");
    expect(dashboard).toContain('const backFallback = pathname === "/dashboard" ? "/" : "/dashboard";');
    expect(dashboard).toContain("<BackNavigationButton fallback={backFallback}");
    expect(customer).toContain('<BackNavigationButton fallback="/"');
    expect(courier).toContain('const backFallback = pathname === "/courier" ? "/" : "/courier";');
    expect(courier).toContain("<BackNavigationButton fallback={backFallback}");
    expect(courier).toContain('data-testid="courier-mobile-back-button"');
    expect(courier).toContain('data-testid="courier-mobile-menu-trigger"');
    expect(courier).toContain("Sheet open={mobileMenuOpen}");
    expect(courier).toContain("hidden w-full shrink-0 md:block");
    expect(backNavigation).not.toContain('pathname.startsWith("/restaurant/")');
  });

  it("wraps every admin sub-route with the back-aware admin route", () => {
    const app = read("src/App.tsx");
    const adminSubRoutes = app
      .split("\n")
      .filter((line) => line.includes('<Route path="/admin/') && !line.includes('path="/admin"'));

    expect(adminSubRoutes.length).toBeGreaterThan(0);
    expect(adminSubRoutes.every((line) => line.includes("<AdminProtectedRoute"))).toBe(true);
  });

  it("renders the admin back button through a body portal for mobile stacking safety", () => {
    render(
      createElement(
        MemoryRouter,
        { initialEntries: ["/admin/restaurants"] },
        createElement(
          AdminRouteFrame,
          { fallback: "/admin" },
          createElement("main", null, "Admin content"),
        ),
      ),
    );

    const portal = screen.getByTestId("admin-mobile-back-button");

    expect(document.body.contains(portal)).toBe(true);
    expect(portal.className).toContain("fixed");
    expect(portal.style.zIndex).toBe("1200");
    expect(portal.style.left).toContain("safe-area-inset-left");
    expect(portal.style.top).toContain("safe-area-inset-top");
    expect(screen.getByRole("button", { name: /retour/i })).toBeTruthy();
  });
});
