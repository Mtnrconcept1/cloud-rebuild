import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SolidaritySection from "@/components/home/SolidaritySection";

describe("SolidaritySection", () => {
  it("shows the Miamz image, impact counters, progress and next goal", () => {
    const { container } = render(<SolidaritySection donatedMeals={68} donatedPoints={6939} />);

    expect(screen.getByRole("img", { name: /miamz solidaire tok/i })).toHaveAttribute("src", "/Miamz2.webp");
    expect(container.querySelector('source[media="(max-width: 767px)"]')).toHaveAttribute("srcSet", "/Miamz3.webp");
    expect(screen.getByText(/68 repas/i)).toBeInTheDocument();
    expect(screen.getByText("6 939")).toBeInTheDocument();
    expect(screen.getByText("5 000")).toBeInTheDocument();
    expect(screen.getByText(/objectif solidaire du mois/i)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/pâques|paques/i);

    const progress = screen.getByRole("progressbar", { name: /progression vers le prochain objectif/i });
    expect(progress).toHaveAttribute("aria-valuenow", "5000");
    expect(progress).toHaveAttribute("aria-valuemax", "5000");
    expect(container.querySelector('[data-testid="solidarity-card"]')).toHaveClass("max-w-[520px]");

    const statsPanel = container.querySelector('[data-testid="solidarity-stats-panel"]');
    expect(statsPanel).toHaveClass("bottom-[3.5%]");
    expect(statsPanel).toHaveClass("top-auto");
    expect(statsPanel).not.toHaveClass("top-[58%]");
  });
});
