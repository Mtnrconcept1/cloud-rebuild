import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MapPin } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import RestaurantSection from "@/components/home/RestaurantSection";

vi.mock("@/components/RestaurantCard", () => ({
  default: ({ name, homeRail }: { name: string; homeRail?: boolean }) => (
    <div data-home-rail-card={String(Boolean(homeRail))}>{name}</div>
  ),
}));

vi.mock("@/components/home/SectionShowcaseHeader", () => ({
  default: ({
    title,
    className,
    mobileLinkText,
  }: {
    title: string;
    className?: string;
    mobileLinkText?: string;
  }) => (
    <h2 className={className} data-mobile-link-text={mobileLinkText}>
      {title}
    </h2>
  ),
}));

const baseProps = {
  title: "Dans votre ville",
  subtitle: "Vos adresses",
  icon: MapPin,
  iconColor: "text-primary",
  restaurants: [
    { id: "r1", name: "Le Jardin", city: "Genève" },
    { id: "r2", name: "La Terrasse", city: "Carouge", campaign_id: "promo-2" },
    { id: "r3", name: "Le Comptoir", city: "Thônex" },
  ],
};

describe("homepage restaurant rails", () => {
  it("shows one accessible swipeable row per section with a visible mobile peek", () => {
    const markup = renderToStaticMarkup(createElement(RestaurantSection, baseProps));
    const root = document.createElement("div");
    root.innerHTML = markup;

    const carousel = root.querySelector('[data-testid="home-restaurant-carousel"]');
    expect(carousel).not.toBeNull();
    expect(carousel).toHaveAttribute("aria-roledescription", "carousel");
    expect(carousel).toHaveAttribute("aria-label", "Restaurants : Dans votre ville");
    expect(carousel?.querySelectorAll('[aria-roledescription="slide"]')).toHaveLength(3);
    expect(carousel?.querySelectorAll('[data-home-rail-card="true"]')).toHaveLength(3);
    expect(markup).toContain("basis-[calc(75%-9px)]");
    expect(markup).toContain("sm:basis-[calc(43.5%-7px)]");
    expect(markup).toContain("lg:basis-[calc(30.77%-5px)]");
    expect(root.querySelector('[data-mobile-link-text="Voir plus"]')).not.toBeNull();
    expect(markup).not.toContain("grid-cols-3");
  });

  it("reserves matching horizontal slides while restaurant data loads", () => {
    const markup = renderToStaticMarkup(
      createElement(RestaurantSection, { ...baseProps, restaurants: [], loading: true }),
    );
    const root = document.createElement("div");
    root.innerHTML = markup;

    expect(root.querySelector("section")).toHaveAttribute("aria-busy", "true");
    expect(root.querySelectorAll('[data-testid="home-restaurant-skeleton"]')).toHaveLength(3);
    expect(root.querySelectorAll('[aria-roledescription="slide"]')).toHaveLength(3);
  });

  it("hides empty sections only when loading is finished", () => {
    expect(
      renderToStaticMarkup(createElement(RestaurantSection, { ...baseProps, restaurants: [] })),
    ).toBe("");
  });
});
