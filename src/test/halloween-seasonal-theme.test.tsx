import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import HalloweenTheme from "@/components/seasonal/HalloweenTheme";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.seasonalTheme;
});

describe("HalloweenTheme", () => {
  it("applies the seasonal theme and removes it immediately when disabled", () => {
    const { container, rerender } = render(<HalloweenTheme enabled />);

    expect(document.documentElement.dataset.seasonalTheme).toBe("halloween");
    expect(container.querySelector(".tok-halloween-canopy")).not.toBeNull();

    rerender(<HalloweenTheme enabled={false} />);

    expect(document.documentElement.dataset.seasonalTheme).toBeUndefined();
    expect(container.querySelector(".tok-halloween-canopy")).toBeNull();
  });

  it("cleans the document attribute when the themed surface unmounts", () => {
    const { unmount } = render(<HalloweenTheme enabled />);

    unmount();

    expect(document.documentElement.dataset.seasonalTheme).toBeUndefined();
  });
});
