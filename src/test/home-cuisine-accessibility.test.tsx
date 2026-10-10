import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import CuisineCategoryStrip from "@/components/home/CuisineCategoryStrip";

afterEach(cleanup);

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

describe("CuisineCategoryStrip accessibility", () => {
  it("keeps each cuisine button to a single accessible name and clean French copy", () => {
    render(
      <MemoryRouter>
        <CuisineCategoryStrip />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Africain" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Français" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Africain\s+Africain/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Défiler à gauche" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Défiler à droite" })).toBeInTheDocument();
  });
  it("opens the selected cuisine with a safely encoded query and no imposed city", () => {
    render(<MemoryRouter><CuisineCategoryStrip activeSlug="francais" /><LocationProbe /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Français" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Français" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/recherche?q=francais");
  });
});
