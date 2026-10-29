import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import TokSaturnLoader from "@/components/ui/tok-saturn-loader";
import AppLoadingScreen from "@/components/ui/app-loading-screen";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TOK Saturn loader", () => {
  it("uses the official TOK image once, with a metallic back and centered orbits", () => {
    const { container } = render(<TokSaturnLoader size="sm" />);

    const loader = screen.getByTestId("tok-saturn-loader");
    expect(loader).toHaveAttribute("aria-hidden", "true");
    expect(loader).toHaveAttribute("data-gpu-ready", "false");
    expect(container.querySelectorAll(".tok-saturn__front")).toHaveLength(1);
    expect(container.querySelector(".tok-saturn__front")).toHaveAttribute(
      "src", "/images/home/tok-logo-ui.webp",
    );
    expect(container.querySelectorAll(".tok-saturn__back")).toHaveLength(1);
    expect(container.querySelectorAll(".tok-saturn__ring")).toHaveLength(2);
    expect(container.querySelector(".tok-saturn__coin")).not.toHaveClass("bg-white");
  });

  it("retains a static branded fallback when motion is reduced", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    render(<TokSaturnLoader size="lg" />);
    expect(screen.getByTestId("tok-saturn-loader")).toHaveAttribute("data-gpu-ready", "false");
    expect(document.querySelector(".tok-saturn__front")).toBeInTheDocument();
  });

  it("preserves page-loading announcements and progress semantics", () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
    render(<AppLoadingScreen title="Chargement du tableau de bord" fullScreen />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveTextContent("Chargement du tableau de bord");
    expect(status.querySelector('[data-testid="tok-saturn-loader"]')).not.toBeNull();
    expect(screen.getByRole("progressbar", { name: "Chargement du tableau de bord" }))
      .toHaveAttribute("aria-valuemax", "100");
  });
});