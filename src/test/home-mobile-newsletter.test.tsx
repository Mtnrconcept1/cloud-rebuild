import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import HeroSection from "@/components/home/HeroSection";

describe("HeroSection mobile newsletter", () => {
  it("keeps newsletter terms and signup separated on small viewports", () => {
    render(
      <MemoryRouter>
        <HeroSection />
      </MemoryRouter>,
    );

    const newsletter = screen.getByTestId("mobile-newsletter");
    expect(within(newsletter).getByRole("link", { name: "Inscrivez-vous" })).toHaveAttribute("href", "/auth");

    fireEvent.click(within(newsletter).getByRole("button", { name: "Conditions applicables." }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Conditions du bonus newsletter")).toBeInTheDocument();
    expect(screen.getByText(/500 Miamz sont crédités une seule fois/i)).toBeInTheDocument();
    expect(screen.getByText(/Vous pouvez vous désinscrire de la newsletter à tout moment/i)).toBeInTheDocument();
  });
});
