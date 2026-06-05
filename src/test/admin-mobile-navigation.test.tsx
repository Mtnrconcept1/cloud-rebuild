import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AdminMobileNavigation from "@/components/admin/AdminMobileNavigation";

const featureState = vi.hoisted(() => ({
  activeFeatures: new Set<string>(),
}));

vi.mock("@/lib/featureFlags", () => ({
  useActiveFeatures: () => featureState.activeFeatures,
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ role: "admin" }),
}));

vi.mock("@/hooks/useNotificationCenter", () => ({
  useNotificationCenter: () => ({ unreadNotifications: [] }),
}));

const allAdminFeatures = [
  "admin-operations-center",
  "admin-restaurants",
  "admin-utilisateurs",
  "admin-compta",
  "ai_accounting_insights",
  "admin-avis",
  "admin-catalog",
  "admin-loyalty",
  "admin-drops",
  "admin-notifications",
  "admin-actualites",
  "admin-audit",
  "admin-platform-config",
  "ai_admin_monitoring",
  "admin-packs",
];

describe("AdminMobileNavigation", () => {
  beforeEach(() => {
    featureState.activeFeatures = new Set(allAdminFeatures);
  });

  it("shows the same floating mobile dashboard menu pattern for admin routes", () => {
    render(
      <MemoryRouter initialEntries={["/admin/restaurants"]}>
        <AdminMobileNavigation />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole("button", { name: "Ouvrir le menu admin" });

    expect(trigger.textContent).toContain("Admin");
    expect(trigger.textContent).toContain("Restaurants");

    fireEvent.click(trigger);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Vue d'ensemble" }).getAttribute("href")).toBe("/admin");
    expect(screen.getByRole("link", { name: "Commandes et reservations" }).getAttribute("href")).toBe("/admin/commandes-reservations");
    expect(screen.getByRole("link", { name: "Configuration plateforme" }).getAttribute("href")).toBe("/admin/platform");
  });

  it("hides admin tabs whose feature flag is disabled", () => {
    featureState.activeFeatures = new Set(["admin-restaurants"]);

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <AdminMobileNavigation />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le menu admin" }));

    expect(screen.getByRole("link", { name: "Restaurants" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Notifications" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Configuration plateforme" })).toBeNull();
  });
});
