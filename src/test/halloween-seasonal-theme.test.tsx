import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import HalloweenTheme, { HalloweenCanopy } from "@/components/seasonal/HalloweenTheme";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.seasonalTheme;
});

describe("HalloweenTheme", () => {
  it("renders the full-width decorative image as a child of the sticky header", () => {
    const { container } = render(<header className="tok-site-header"><HalloweenCanopy /></header>);
    const canopy = container.querySelector("header > .tok-halloween-canopy");
    const image = canopy?.querySelector("img");

    expect(canopy?.getAttribute("aria-hidden")).toBe("true");
    expect(image?.getAttribute("src")).toBe("/images/seasonal/halloween/canopy.webp");
    expect(image?.getAttribute("alt")).toBe("");
  });


  it("applies the seasonal theme and removes it immediately when disabled", () => {
    const { rerender } = render(<HalloweenTheme enabled />);

    expect(document.documentElement.dataset.seasonalTheme).toBe("halloween");
    rerender(<HalloweenTheme enabled={false} />);

    expect(document.documentElement.dataset.seasonalTheme).toBeUndefined();
  });

  it("cleans the document attribute when the themed surface unmounts", () => {
    const { unmount } = render(<HalloweenTheme enabled />);

    unmount();

    expect(document.documentElement.dataset.seasonalTheme).toBeUndefined();
  });
});
