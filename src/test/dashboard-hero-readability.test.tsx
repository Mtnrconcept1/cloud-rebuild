import { render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { MemoryRouter } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { describe, expect, it } from "vitest";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import CustomerPageHero from "@/components/dashboard/CustomerPageHero";
import PageHeading from "@/components/editorial/PageHeading";
import RouteHeroBanner from "@/components/dashboard/RouteHeroBanner";

describe("en-têtes éditoriaux TOK", () => {
  it("expose le titre client, ses deux descriptions et son action au clavier", () => {
    render(<CustomerPageHero title="Mon espace" subtitle="Bonjour Camille" description="Vos prochaines visites"
      actions={<a href="/reservations">Mes réservations</a>} />);
    expect(screen.getByRole("heading", { name: "Mon espace", level: 1 })).toBeVisible();
    expect(screen.getByText("Bonjour Camille")).toBeVisible();
    expect(screen.getByText("Vos prochaines visites")).toBeVisible();
    expect(screen.getByRole("link", { name: "Mes réservations" })).toHaveAttribute("href", "/reservations");
  });

  it("affiche un seul hero de secours avec titre et texte, jamais une bannière vide", () => {
    const { container } = render(
      <RouteHeroBanner
        src="/images/dashboard-generated/client_mon_abonnement_hero.webp"
        title="Mon abonnement"
        eyebrow="Espace client TOK"
        description="Retrouvez votre abonnement et vos avantages."
      />,
    );
    const hero = container.querySelector(".tok-route-hero-fallback");
    expect(hero).toHaveClass("tok-editorial-heading");
    expect(hero).toHaveAttribute("role", "presentation");
    expect(hero).toHaveAttribute("data-editorial-hero", "/images/dashboard-generated/client_mon_abonnement_hero.webp");
    expect(screen.getByRole("heading", { name: "Mon abonnement" })).toBeVisible();
    expect(screen.getByText("Retrouvez votre abonnement et vos avantages.")).toBeVisible();
    expect(container.querySelector(".tok-route-hero")).toBeNull();
    expect(container.querySelector('[src*="chef-"]')).toBeNull();
  });

  it("n'affiche aucune mascotte même quand un ancien appel fournit mascot", () => {
    const { container } = render(<PageHeading title="TOK One" description="Vos avantages" mascot="cloche" />);
    expect(screen.getByRole("heading", { name: "TOK One" })).toBeVisible();
    expect(container.querySelector(".tok-editorial-heading__art")).toBeNull();
    expect(container.querySelector('[src*="chef-"]')).toBeNull();
    const css = readFileSync(path.resolve(process.cwd(), "src/components/editorial/editorial.css"), "utf8");
    expect(css).not.toMatch(/\.tok-editorial-heading::after\s*\{/);
    expect(css).not.toContain(".tok-dashboard-hero-art__chef");
  });

  it("masque le fallback dès que la page comporte un hero éditorial natif", () => {
    const css = readFileSync(path.resolve(process.cwd(), "src/components/dashboard/WorkspaceDesign.css"), "utf8");
    expect(css).toContain(":has(.tok-editorial-heading:not(.tok-route-hero-fallback)) > .tok-route-hero-fallback");
    expect(css).toContain(":has(.tok-dashboard-hero) > .tok-route-hero-fallback");
  });

  it("conserve les statistiques réelles et les actions des espaces professionnels", () => {
    render(<MemoryRouter initialEntries={["/dashboard/reservations"]}>
      <DashboardPageHero badge="Service" title="Réservations" description="Aujourd’hui"
        icon={CalendarDays} stats={[{ label: "Confirmées", value: 0 }]} visualLabel="Activité"
        actions={<button>Exporter</button>} />
    </MemoryRouter>);
    expect(screen.getByRole("heading", { name: "Réservations" })).toBeVisible();
    const stats = within(screen.getByLabelText("Activité"));
    expect(stats.getByText("Confirmées")).toBeVisible();
    expect(stats.getByText("0")).toBeVisible();
    expect(screen.getByRole("button", { name: "Exporter" })).toBeVisible();
  });
});
