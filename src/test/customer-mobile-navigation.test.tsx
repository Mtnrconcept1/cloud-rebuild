import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import CustomerMobileNavigation from "@/components/dashboard/CustomerMobileNavigation";

afterEach(cleanup);
function Navigation() {
  const { pathname } = useLocation();
  return <><p data-testid="route">{pathname}</p><CustomerMobileNavigation currentPage="Mes Miamz" footer={<button type="button">Déconnexion</button>} shortcuts={<Link to="/mon-espace">Accueil</Link>}>
    <h2>Mes avantages</h2><Link to="/profil?tab=fidelite">Mes Miamz</Link>
  </CustomerMobileNavigation></>;
}
describe("customer mobile menu", () => {
  it("makes secondary pages discoverable and closes after navigation", async () => {
    render(<MemoryRouter initialEntries={["/mon-espace"]}><Navigation /></MemoryRouter>);
    expect(screen.getByText("Vous êtes ici : Mes Miamz")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le menu client" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Menu principal" })).toBeVisible();
    expect(screen.getByText("Espace client")).toBeVisible();
    expect(screen.getByRole("button", { name: "Déconnexion" })).toBeVisible();
    fireEvent.click(screen.getByRole("link", { name: "Mes Miamz" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("route")).toHaveTextContent("/profil");
    expect(screen.getByRole("button", { name: "Ouvrir le menu client" })).toHaveFocus();
  });
  it("closes with Escape and returns focus to the hamburger", async () => {
    render(<MemoryRouter><Navigation /></MemoryRouter>);
    const trigger = screen.getByRole("button", { name: "Ouvrir le menu client" });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
