import { existsSync } from "node:fs";
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
  it("uses nine generated 3D images with integrated labels and larger cards", () => {
    render(<MemoryRouter><CuisineCategoryStrip /></MemoryRouter>);

    const items = [
      ["Africain", "africain"], ["Américain", "americain"], ["Bistro", "bistro"],
      ["Boulangerie", "boulangerie"], ["Brunch", "brunch"], ["Burger", "burger"],
      ["Café", "cafe"], ["Desserts", "desserts"], ["Italien", "italien"],
    ] as const;

    for (const [label, slug] of items) {
      const button = screen.getByRole("button", { name: label });
      expect(button).toHaveClass("w-[116px]");
      expect(button.firstElementChild).toHaveClass("rounded-[20px]", "bg-background", "h-28", "w-28");
      expect(button.querySelector("img")).toHaveAttribute("src", `/miniatures-3d/${slug}.webp`);
      expect(button.querySelector("img")).toHaveAttribute("loading", "lazy");
      expect(button.children).toHaveLength(1);
      expect(existsSync(`public/miniatures-3d/${slug}.webp`)).toBe(true);
    }
  });

  it("opens the selected cuisine with a safely encoded query and no imposed city", () => {
    render(<MemoryRouter><CuisineCategoryStrip activeSlug="francais" /><LocationProbe /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "Français" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Français" }));
    expect(screen.getByTestId("location")).toHaveTextContent("/recherche?q=francais");
  });
});
