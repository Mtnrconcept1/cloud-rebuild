import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("TOK all-pages UX system", () => {
  it("keeps operational page headings compact and exposes their live statistics on every viewport", () => {
    const hero = read("src/components/dashboard/DashboardPageHero.tsx");

    expect(hero).toContain("<header");
    expect(hero).toContain("<h1");
    expect(hero).toContain("<dl aria-label={visualLabel}");
    expect(hero).toContain("<dt");
    expect(hero).toContain("<dd");
    expect(hero).not.toContain("Console active");
    expect(hero).not.toContain("hidden lg:block");
    expect(hero).not.toContain("sm:text-5xl");
  });

  it("lets restaurant and admin users find an available tool without bypassing feature filtering", () => {
    const dashboard = read("src/components/DashboardLayout.tsx");
    const admin = read("src/components/admin/AdminMobileNavigation.tsx");

    expect(dashboard).toContain('id="dashboard-tool-search"');
    expect(dashboard).toContain('id="dashboard-mobile-tool-search"');
    expect(dashboard).toContain("visibleSections");
    expect(dashboard).toContain('aria-label="Outils du restaurant"');
    expect(admin).toContain('id="admin-navigation-search"');
    expect(admin).toContain('aria-label="Outils administrateur"');
    expect(admin).toContain("matchingSections");
  });

  it("organizes customer and marketing tools around recognizable tasks", () => {
    const customer = read("src/components/CustomerDashboardLayout.tsx");
    const marketing = read("src/components/marketing/MarketingWorkspaceChrome.tsx");

    expect(customer).toContain('id="customer-tool-search"');
    expect(customer).toContain('id="customer-mobile-tool-search"');
    expect(customer).toContain("navigationQuery");
    expect(marketing).toContain("NAV_GROUPS");
    expect(marketing).toContain('label: "Pilotage"');
    expect(marketing).toContain('label: "Créer et diffuser"');
    expect(marketing).toContain('label: "Contacts et canaux"');
    expect(marketing).toContain('label: "Contrôle"');
    expect(marketing).not.toContain('bg-[#07111f]');
  });

  it("prioritizes restaurant operations and gives filters accessible names and a reset", () => {
    const reservations = read("src/pages/dashboard/DashboardReservations.tsx");
    const orders = read("src/pages/dashboard/DashboardCommandes.tsx");
    const channels = read("src/components/dashboard/DirectReservationChannelsCard.tsx");
    const sort = read("src/components/list/SortControls.tsx");

    expect(reservations).toContain('aria-label="Rechercher et filtrer les réservations"');
    expect(reservations).toContain("Réinitialiser les filtres");
    expect(orders).toContain('aria-label="Rechercher et filtrer les commandes"');
    expect(orders).toContain("Réinitialiser les filtres");
    expect(channels).toContain("<details");
    expect(channels).toContain("Partager mon lien de réservation");
    expect(sort).toContain("aria-label={columnLabel}");
    expect(sort).toContain("aria-label={directionLabel}");
  });

  it("does not represent failed customer or courier reads as empty data", () => {
    const state = read("src/components/client/DataLoadState.tsx");
    const courierPages = ["CourierHome", "CourierJobs", "CourierEarnings", "CourierProfile"];

    expect(state).toContain('role="alert"');
    expect(state).toContain("Réessayer");
    for (const page of courierPages) {
      expect(read(`src/pages/courier/${page}.tsx`)).toContain("DataLoadState");
      expect(read(`src/pages/courier/${page}.tsx`)).toContain(".isError");
    }
    expect(read("src/pages/CustomerMemory.tsx")).toContain("memoryQuery.isError");
  });
});
