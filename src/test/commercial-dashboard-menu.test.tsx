import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import CommercialWorkspaceChrome from "@/components/commercial/CommercialWorkspaceChrome";

const state = vi.hoisted(() => ({ embedded: false }));
vi.mock("@/components/commercial/CommercialDemoFrameProvider", () => ({
  useCommercialDemoFrame: () => state.embedded ? { surface: "commercial" } : null,
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ role: "commercial", roles: ["commercial"] }) }));
vi.mock("@/hooks/useNotificationCenter", () => ({ useNotificationCenter: () => ({ unreadNotifications: [] }) }));
function Workspace() {
  const location = useLocation();
  return <><p data-testid="route">{location.pathname}</p><CommercialWorkspaceChrome activeLabel="Prospection" /></>;
}
afterEach(() => { cleanup(); state.embedded = false; });

describe("commercial dashboard menu", () => {
  it("opens the shared branded panel and closes after selecting a destination", async () => {
    render(<MemoryRouter initialEntries={["/commercial"]}><Workspace /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le menu commercial" }));
    expect(screen.getByRole("heading", { name: "Menu principal" })).toBeVisible();
    expect(screen.getByRole("dialog")).toHaveTextContent("Espace commercial");
    fireEvent.click(screen.getByRole("button", { name: /Comptabilité.*Revenus/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("route")).toHaveTextContent("/commercial/comptabilite");
    expect(screen.getByRole("button", { name: "Ouvrir le menu commercial" })).toHaveFocus();
  });
  it("preserves demo destination isolation", () => {
    state.embedded = true;
    render(<MemoryRouter initialEntries={["/commercial"]}><Workspace /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Ouvrir le menu commercial" }));
    expect(screen.queryByRole("button", { name: /Démo multi-espace/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Notifications.*Historique/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Comptabilité.*Revenus/ })).toBeVisible();
  });
});
