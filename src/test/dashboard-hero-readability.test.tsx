import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { describe, expect, it } from "vitest";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import CustomerPageHero from "@/components/dashboard/CustomerPageHero";

describe("en-têtes éditoriaux TOK", () => {
  it("expose le titre client, ses deux descriptions et son action au clavier", () => {
    render(<CustomerPageHero title="Mon espace" subtitle="Bonjour Camille" description="Vos prochaines visites"
      actions={<a href="/reservations">Mes réservations</a>} />);
    expect(screen.getByRole("heading", { name: "Mon espace", level: 1 })).toBeVisible();
    expect(screen.getByText("Bonjour Camille")).toBeVisible();
    expect(screen.getByText("Vos prochaines visites")).toBeVisible();
    expect(screen.getByRole("link", { name: "Mes réservations" })).toHaveAttribute("href", "/reservations");
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
