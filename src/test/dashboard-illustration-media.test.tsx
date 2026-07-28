import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import DashboardIllustrationMedia from "@/components/dashboard/DashboardIllustrationMedia";
import type { DashboardIllustration } from "@/lib/dashboardIllustrations";

const illustration: DashboardIllustration = {
  src: "/images/dashboard-3d/restaurant-service.webp",
  width: 512,
  height: 512,
  alt: "",
};

describe("DashboardIllustrationMedia", () => {
  it("renders a bounded decorative image with stable dimensions", () => {
    const { container } = render(<DashboardIllustrationMedia illustration={illustration} />);
    const root = container.firstElementChild;
    const image = container.querySelector("img");

    expect(root?.tagName).toBe("SPAN");
    expect(root?.getAttribute("aria-hidden")).toBe("true");
    expect(root?.classList.contains("aspect-square")).toBe(true);
    expect(root?.classList.contains("items-center")).toBe(true);
    expect(image?.getAttribute("src")).toBe(illustration.src);
    expect(image?.getAttribute("alt")).toBe("");
    expect(image?.getAttribute("width")).toBe("512");
    expect(image?.getAttribute("height")).toBe("512");
    expect(image?.getAttribute("loading")).toBe("lazy");
    expect(image?.getAttribute("decoding")).toBe("async");
  });

  it("shows a safe fallback and retries when the source changes", () => {
    const { container, rerender } = render(<DashboardIllustrationMedia illustration={illustration} />);
    const image = container.querySelector("img");
    expect(image).not.toBeNull();

    fireEvent.error(image!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("[data-dashboard-illustration-fallback]")).not.toBeNull();

    rerender(
      <DashboardIllustrationMedia
        illustration={{ ...illustration, src: "/images/dashboard-3d/restaurant-orders.webp" }}
      />,
    );

    expect(container.querySelector("img")?.getAttribute("src")).toBe("/images/dashboard-3d/restaurant-orders.webp");
    expect(container.querySelector("[data-dashboard-illustration-fallback]")).toBeNull();

    rerender(<DashboardIllustrationMedia illustration={illustration} />);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(illustration.src);
    expect(container.querySelector("[data-dashboard-illustration-fallback]")).toBeNull();
  });

  it("can eagerly load an above-the-fold illustration", () => {
    const { container } = render(<DashboardIllustrationMedia illustration={illustration} eager />);
    expect(container.querySelector("img")?.getAttribute("loading")).toBe("eager");
  });
});
