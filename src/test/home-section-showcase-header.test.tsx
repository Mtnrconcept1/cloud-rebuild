import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { MapPinned, Utensils } from "lucide-react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import SectionShowcaseHeader from "@/components/home/SectionShowcaseHeader";

describe("TOK homepage editorial headers", () => {
  it("renders unchanged generated artwork behind the left-hand text, not in a separate row", () => {
    const css = readFileSync("src/home-section-headers.css", "utf8");
    expect(css).not.toContain("mask-image");
    expect(css).not.toContain("opacity:");
    expect(css).not.toContain("backdrop-filter");
    expect(css).not.toContain("grid-template-rows: auto auto");
    expect(css).toContain("position: absolute;");
    expect(css).toContain("object-fit: cover");
    expect(css).toContain("min-height: 0;");
    expect(css).not.toMatch(/min-height:\s*clamp\(/);
    expect(css).not.toContain("aspect-ratio: 4 / 1");
    expect(css).toContain("z-index: 1;");
    expect(css).toContain("flex-basis: 65%");
  });

  it("keeps the photograph decorative and the location heading accessible", () => {
    const { container } = render(
      <MemoryRouter>
        <SectionShowcaseHeader
          title="À moins de 5 km de vous"
          subtitle="Votre position actuelle"
          description="Découvrez les meilleures tables autour de vous."
          icon={MapPinned}
          imageSrc="/images/section-headers/tok-editorial-geneva-full.jpg"
          theme="sky"
          linkText="Explorer autour de vous"
          linkTo="/recherche"
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { level: 2, name: "À moins de 5 km de vous" })).toBeInTheDocument();
    expect(screen.getByText("Découvrez les meilleures tables autour de vous.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explorer autour de vous" })).toHaveAttribute("href", "/recherche");

    const header = container.querySelector("[data-section-showcase-header]");
    const photo = header?.querySelector("img");
    expect(header).toHaveAttribute("data-theme", "sky");
    expect(header).toHaveAttribute("data-image-kind", "photo");
    expect(photo).not.toHaveAttribute("src");
    expect(photo).toHaveAttribute("data-deferred-src", "/images/section-headers/tok-editorial-geneva-full.jpg");
    expect(photo).toHaveAttribute("alt", "");
    expect(photo).toHaveAttribute("loading", "lazy");
    expect(photo?.parentElement).toHaveAttribute("aria-hidden", "true");
    expect(photo?.parentElement).toHaveAttribute("data-image-ready", "false");
  });

  it("retains the culinary image and optional carousel actions", () => {
    const { container } = render(
      <MemoryRouter>
        <SectionShowcaseHeader
          title="Explorez par cuisine"
          subtitle="À votre goût"
          icon={Utensils}
          imageSrc="/images/section-headers/tok-editorial-cuisine-full.jpg"
          actions={<button type="button">Cuisine suivante</button>}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "Explorez par cuisine" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cuisine suivante" })).toBeInTheDocument();
    expect(container.querySelector("[data-section-action-row]")).toBeInTheDocument();
    expect(container.querySelector('[data-theme="orange"]')).toBeInTheDocument();
  });
});
