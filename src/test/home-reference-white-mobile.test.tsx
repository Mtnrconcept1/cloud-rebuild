import { existsSync, statSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import HeroSection from "@/components/home/HeroSection";

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));

describe("TOK reference-white mobile homepage", () => {
  it("preserves the real search, shortcuts and newsletter navigation around the new chef", () => {
    render(
      <MemoryRouter>
        <HeroSection activeFeatures={new Set(["ventes-flash", "anti-gaspi", "chefs-table"])} />
      </MemoryRouter>,
    );
    expect(document.querySelector(".tok-home-hero__mobile-mascot")).toBeInTheDocument();
    expect(screen.getByRole("search", { name: "Rechercher un restaurant" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ventes flash" })).toHaveAttribute("href", "/ventes-flash");
    expect(screen.getByRole("link", { name: "Anti-gaspi" })).toHaveAttribute("href", "/anti-gaspi");
    expect(screen.getByRole("link", { name: "La Tok d’Or" })).toHaveAttribute("href", "/chefs-table");
    expect(screen.getByRole("link", { name: "Inscrivez-vous" })).toHaveAttribute("href", "/auth?newsletter=1");
  });

  it("keeps the four approved visual labels when optional modules are disabled", () => {
    render(<MemoryRouter><HeroSection /></MemoryRouter>);
    for (const name of ["Ventes flash", "Anti-gaspi", "La Tok d’Or", "Offres & promos"]) {
      expect(screen.getByRole("link", { name })).toHaveAttribute("href", "/recherche");
    }
  });

  it("does not overlay the standalone chef on the Halloween artwork", () => {
    render(<MemoryRouter><HeroSection activeFeatures={new Set(["seasonal-halloween-2026"])} /></MemoryRouter>);
    expect(document.querySelector(".tok-home-hero__mobile-mascot")).not.toBeInTheDocument();
    expect(document.querySelector(".tok-home-hero__background img")).toHaveAttribute("src", "/images/seasonal/halloween/hero-desktop.webp");
  });

  it("isolates white mobile styling and serves a small, proportional local mascot", () => {
    const css = readFileSync(resolve(process.cwd(), "src/components/home/HeroSectionReferenceMobile.css"), "utf8");
    expect(css).toContain('@media (max-width: 767px)');
    expect(css).toContain(':root:not(.dark):not([data-seasonal-theme="halloween"])');
    expect(css).toContain("background: #fff;");
    expect(css).toContain(".tok-home-hero__mobile-mascot");
    const asset = resolve(process.cwd(), "public/images/home/tok-chef-white-mobile.webp");
    expect(existsSync(asset)).toBe(true);
    expect(statSync(asset).size).toBeLessThan(140_000);
  });
});
