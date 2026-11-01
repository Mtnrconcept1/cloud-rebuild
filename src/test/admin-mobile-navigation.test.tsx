import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AdminMobileNavigation from "@/components/admin/AdminMobileNavigation";

const featureState = vi.hoisted(() => ({
  activeFeatures: new Set<string>(),
}));

vi.mock("@/lib/featureFlags", () => ({
  useActiveFeatures: () => featureState.activeFeatures,
  useFeatureFlags: () => ({ flags: [], loading: false, setFlagState: vi.fn() }),
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
  "admin-crm",
  "admin-audit",
  "admin-guardian",
  "admin-support-resolution",
  "admin-platform-config",
  "ai_admin_monitoring",
  "admin-tok-connect",
  "admin-packs",
  "commercial-prospection",
];

describe("AdminMobileNavigation", () => {
  it("preserves accounting, configuration and commercial destinations in the drawer", () => {
    render(<MemoryRouter initialEntries={["/admin"]}><AdminMobileNavigation /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir les outils admin" }));
    const drawer = within(screen.getByRole("dialog"));
    for (const href of ["/admin/compta/entrees", "/admin/compta/sorties", "/admin/platform", "/commercial"]) {
      expect(drawer.getAllByRole("link").some((link) => link.getAttribute("href") === href)).toBe(true);
    }
  });

  it("keeps category icons stable when feature flags hide other categories", () => {
    featureState.activeFeatures = new Set(["admin-audit"]);
    render(<MemoryRouter initialEntries={["/admin/security-center"]}><AdminMobileNavigation /></MemoryRouter>);
    const rail = within(screen.getByRole("navigation", { name: "Catégories admin" }));
    expect(rail.getByRole("link", { name: "Sécurité & assistance" }).querySelector("svg")?.classList.contains("lucide-shield-check")).toBe(true);
  });

  it("hides the mobile alerts shortcut when notifications are disabled", () => {
    featureState.activeFeatures = new Set(["admin-restaurants"]);
    render(<MemoryRouter initialEntries={["/admin"]}><AdminMobileNavigation /></MemoryRouter>);
    expect(within(screen.getByRole("navigation", { name: "Navigation admin mobile" })).queryByRole("link", { name: "Alertes" })).toBeNull();
  });

  beforeEach(() => {
    featureState.activeFeatures = new Set(allAdminFeatures);
  });

  it("exposes the six-category drawer from desktop and mobile navigation", () => {
    render(
      <MemoryRouter initialEntries={["/admin/restaurants"]}>
        <AdminMobileNavigation />
      </MemoryRouter>,
    );

    const trigger = screen.getByRole("button", { name: "Ouvrir le menu admin" });

    fireEvent.click(trigger);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Vue d'ensemble" }).getAttribute("href")).toBe("/admin");
    expect(screen.getByRole("link", { name: "Commandes et réservations" }).getAttribute("href")).toBe("/admin/commandes-reservations");
    expect(screen.getByRole("link", { name: "TOK Printer" }).getAttribute("href")).toBe("/admin/tok-printer");
    expect(screen.getByText("Utilisateurs, Partenaires et équipe")).toBeTruthy();
    expect(screen.getByText("Réservations & services")).toBeTruthy();
    expect(screen.getByText("Clients & marketing")).toBeTruthy();
    expect(screen.getByText("Finances & abonnements")).toBeTruthy();
    expect(screen.getByText("Sécurité & assistance")).toBeTruthy();
    expect(screen.getByText("Plateforme & outils")).toBeTruthy();
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
    expect(screen.getByRole("link", { name: "TOK Printer" })).toBeTruthy();
  });
});
