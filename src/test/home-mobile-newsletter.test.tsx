import { render, screen, within } from "@testing-library/react";
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

    expect(screen.getByTestId("mobile-hero-panel")).toHaveClass("h-[calc(100svh-216px)]");
    expect(screen.getByTestId("mobile-hero-panel")).toHaveClass("min-h-[600px]");
    expect(screen.getByText("Réservez et")).toBeInTheDocument();
    expect(screen.getByText("offres food")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /je veux manger/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /restaurateur/i }).length).toBeGreaterThan(0);

    const newsletter = screen.getByTestId("mobile-newsletter");
    expect(newsletter).toHaveClass("min-h-[148px]");
    expect(newsletter).toHaveClass("space-y-2");
    expect(newsletter.textContent).not.toContain("Conditions applicables.Inscrivez-vous");

    const signup = within(newsletter).getByRole("button", { name: "Inscrivez-vous" });
    expect(signup.className).not.toContain("-top-");
  });
});
