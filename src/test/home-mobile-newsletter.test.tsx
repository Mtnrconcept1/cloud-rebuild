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

    const mobileHero = screen.getByTestId("mobile-hero-shell");
    expect(mobileHero).toHaveClass("min-h-[calc(100svh-64px)]");
    expect(screen.getByTestId("mobile-hero-panel")).toHaveClass("min-h-[calc(100svh-64px)]");
    expect(mobileHero.innerHTML).toContain("fondacceuil.png");
    expect((mobileHero.innerHTML.match(/fondacceuil\.png/g) ?? [])).toHaveLength(1);
    expect(mobileHero.innerHTML).toContain("bg-[position:50%_0%]");
    expect(mobileHero.innerHTML).toContain("bg-[length:100%_auto]");
    expect(mobileHero.innerHTML).toContain("bg-no-repeat");
    expect(mobileHero.innerHTML).toContain("bottom-2 space-y-2");
    expect(mobileHero.innerHTML).toContain("pt-9 text-center min-[390px]:pt-10");
    expect(mobileHero.innerHTML).toContain("translate-x-[12px]");
    expect(mobileHero.innerHTML).toContain("w-full max-w-[390px]");
    expect(mobileHero.innerHTML).toContain("[font-family:'Playball',cursive]");
    expect(mobileHero.innerHTML).toContain("text-[2.16rem] font-normal");
    expect(mobileHero.innerHTML).toContain("font-black italic");
    expect(screen.getByText("Réservez et commandez")).toBeInTheDocument();
    expect(screen.getByText("offres food")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /je veux manger/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: /restaurateur/i }).length).toBeGreaterThan(0);

    const newsletter = screen.getByTestId("mobile-newsletter");
    expect(newsletter).toHaveClass("rounded-[24px]");
    expect(newsletter.className).toContain("bg-[#2d1608]/78");
    expect(newsletter.innerHTML).not.toContain("fondacceuil.png");

    const signup = within(newsletter).getByRole("button", { name: "Inscrivez-vous" });
    expect(signup.className).not.toContain("-top-");

    fireEvent.click(within(newsletter).getByRole("button", { name: "Conditions applicables." }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Conditions du bonus newsletter")).toBeInTheDocument();
    expect(screen.getByText(/500 Miamz sont crédités une seule fois/i)).toBeInTheDocument();
    expect(screen.getByText(/Vous pouvez vous désinscrire de la newsletter à tout moment/i)).toBeInTheDocument();
  });
});
