import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { getRestaurantDashboardVisual, getCustomerDashboardVisual, getTokHeroStyle } from "@/lib/dashboardVisuals";

const assetDir = path.resolve(process.cwd(), "public/images/dashboard-generated");

describe("TOK dashboard image collection", () => {
  it("ships all 124 independently named WebP images", () => {
    const files = readdirSync(assetDir).filter(name => name.endsWith(".webp"));
    const heroFiles = files.filter(name => name.endsWith("_hero.webp"));
    expect(files).toHaveLength(124);
    expect(heroFiles).toHaveLength(62);
    expect(files.filter(name => name.endsWith("_3d.webp"))).toHaveLength(62);
    expect(new Set(files).size).toBe(124);

    const heroHashes = heroFiles.map(name => createHash("sha256")
      .update(readFileSync(path.join(assetDir, name)))
      .digest("hex"));
    expect(new Set(heroHashes).size).toBe(62);
  });

  it("renders client photographs in the shared hero instead of leaving them unused", () => {
    const source = readFileSync(path.resolve(process.cwd(), "src/components/dashboard/WorkspaceDesign.css"), "utf8");
    expect(source).toMatch(/\.tok-customer-page-hero::before[^}]*--workspace-hero-image/);
    expect(source).toMatch(/\.tok-customer-page-hero::after/);
  });

  it.each([
    ["/dashboard", "restaurant_accueil"],
    ["/dashboard/commandes", "restaurant_commandes"],
    ["/dashboard/plan-salle", "restaurant_plan_de_salle"],
    ["/dashboard/factures/entrees", "restaurant_entrees"],
    ["/dashboard/photos", "restaurant_studio_marketing"],
  ])("maps restaurant route %s to its distinct pair", (route, prefix) => {
    const media = getRestaurantDashboardVisual(route);
    expect(media?.hero).toBe(`/images/dashboard-generated/${prefix}_hero.webp`);
    expect(media?.illustration).toBe(`/images/dashboard-generated/${prefix}_3d.webp`);
    expect(existsSync(path.join("public", media!.hero))).toBe(true);
    expect(existsSync(path.join("public", media!.illustration))).toBe(true);
  });

  it("maps customer profile tabs independently", () => {
    expect(getCustomerDashboardVisual("/profil", "?tab=favoris")?.hero)
      .toBe("/images/dashboard-generated/client_favoris_hero.webp");
    expect(getCustomerDashboardVisual("/profil", "?tab=fidelite")?.hero)
      .toBe("/images/dashboard-generated/client_miamz_hero.webp");
    expect(getCustomerDashboardVisual("/profil", "?tab=abonnement")?.illustration)
      .toBe("/images/dashboard-generated/client_mon_abonnement_3d.webp");
  });

  it("maps customer tracking and checkout routes", () => {
    expect(getCustomerDashboardVisual("/commande/confirmation")?.hero)
      .toBe("/images/dashboard-generated/client_confirmation_commande_hero.webp");
    expect(getCustomerDashboardVisual("/commande/abc123")?.illustration)
      .toBe("/images/dashboard-generated/client_suivi_commande_3d.webp");
  });

  it("keeps background style optional on non-dashboard surfaces", () => {
    expect(getRestaurantDashboardVisual("/admin")).toBeUndefined();
    expect(getCustomerDashboardVisual("/auth")).toBeUndefined();
    expect(getTokHeroStyle(undefined)).toBeUndefined();
    expect(getTokHeroStyle("/images/dashboard-generated/restaurant_performances_hero.webp"))
      .toEqual({ "--workspace-hero-image": "url(\"/images/dashboard-generated/restaurant_performances_hero.webp\")" });
  });
});
