import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import CuisineCategoryStrip from "@/components/home/CuisineCategoryStrip";

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
});
