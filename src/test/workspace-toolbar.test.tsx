import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { CalendarDays, FileText, Utensils } from "lucide-react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WorkspaceRestaurantSearch,
  WorkspaceToolSearch,
  type WorkspaceTool,
} from "@/components/dashboard/WorkspaceToolbar";

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));

const allowedTools: WorkspaceTool[] = [
  { to: "/dashboard/reservations", label: "Réservations", group: "Pilotage", icon: CalendarDays },
  { to: "/dashboard/menu", label: "Menu", group: "Mon restaurant", icon: Utensils },
  { to: "/dashboard/guide?tab=commandes", label: "Guide d’utilisation", group: "Assistance", icon: FileText },
];

function LocationReadout() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderSearch(search: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={["/mon-espace"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {search}
      <LocationReadout />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // cmdk measures its list and scrolls the keyboard-selected option in browsers.
  vi.stubGlobal("ResizeObserver", class {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  });
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

describe("workspace restaurant search", () => {
  it("submits a trimmed, lossless q value without turning punctuation into extra URL parameters", () => {
    renderSearch(<WorkspaceRestaurantSearch />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Trouver un restaurant" }), {
      target: { value: "  Sushi & thé + riz #Genève  " },
    });
    fireEvent.submit(screen.getByRole("search"));

    expect(screen.getByTestId("location")).toHaveTextContent(
      "/recherche?q=Sushi%20%26%20th%C3%A9%20%2B%20riz%20%23Gen%C3%A8ve",
    );
    const target = new URL(screen.getByTestId("location").textContent!, "https://thetok.ch");
    expect([...target.searchParams]).toEqual([["q", "Sushi & thé + riz #Genève"]]);
    expect(target.hash).toBe("");
  });

  it("opens restaurant discovery when the submitted input contains only whitespace", () => {
    renderSearch(<WorkspaceRestaurantSearch />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Rechercher un restaurant" }));

    expect(screen.getByTestId("location").textContent).toBe("/recherche");
  });
});

describe("workspace tool search", () => {
  it("only presents supplied destinations, filters them and closes after selection", async () => {
    renderSearch(<WorkspaceToolSearch tools={allowedTools} />);
    fireEvent.click(screen.getByRole("button", { name: "Rechercher un outil du dashboard" }));
    const dialog = screen.getByRole("dialog", { name: "Rechercher dans le dashboard" });
    expect(within(dialog).getAllByRole("option")).toHaveLength(3);

    fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "Menu" } });
    await waitFor(() => expect(within(dialog).getAllByRole("option")).toHaveLength(1));
    fireEvent.click(within(dialog).getByRole("option", { name: "Menu" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("location").textContent).toBe("/dashboard/menu");
  });

  it("cannot discover or navigate to a tool omitted by the workspace access filter", async () => {
    renderSearch(<WorkspaceToolSearch tools={[allowedTools[2]]} />);
    fireEvent.click(screen.getByRole("button", { name: "Rechercher un outil du dashboard" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "Réservations" } });

    await waitFor(() => expect(within(dialog).queryAllByRole("option")).toHaveLength(0));
    expect(within(dialog).getByText("Aucun outil ne correspond à votre recherche.")).toBeVisible();
    fireEvent.keyDown(within(dialog).getByRole("combobox"), { key: "Enter" });
    expect(screen.getByTestId("location").textContent).toBe("/mon-espace");
  });

  it("supports Enter selection with the complete supplied route, including its query", async () => {
    renderSearch(<WorkspaceToolSearch tools={allowedTools} />);
    fireEvent.click(screen.getByRole("button", { name: "Rechercher un outil du dashboard" }));
    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Guide" } });
    await waitFor(() => expect(screen.getByRole("option", { name: "Guide d’utilisation" })).toHaveAttribute("aria-selected", "true"));
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("location").textContent).toBe("/dashboard/guide?tab=commandes");
  });

  it("dismisses with Escape without changing the current page", async () => {
    renderSearch(<WorkspaceToolSearch tools={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Rechercher un outil du dashboard" }));
    expect(screen.getByText("Aucun outil ne correspond à votre recherche.")).toBeVisible();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByTestId("location").textContent).toBe("/mon-espace");
  });
});
