import { readFileSync } from "node:fs";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import HalloweenTheme, { HalloweenCanopy } from "@/components/seasonal/HalloweenTheme";

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
  delete document.documentElement.dataset.seasonalTheme;
  localStorage.clear();
});

describe("HalloweenTheme", () => {
  it("uses a real portrait background and the reference dripping font only in Halloween mode", () => {
    const hero = readFileSync("src/components/home/HeroSection.tsx", "utf8");
    const styles = readFileSync("src/styles/halloween-theme.css", "utf8");
    const html = readFileSync("index.html", "utf8");
    const art = readFileSync("public/images/seasonal/halloween/hero-mobile-20261030.webp");

    expect(hero).toContain("/images/seasonal/halloween/hero-mobile-20261030.webp");
    expect(art.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(art.subarray(8, 12).toString("ascii")).toBe("WEBP");
    expect(styles).toContain(':root[data-seasonal-theme="halloween"] .tok-home-hero .tok-home-hero__title');
    expect(styles).toContain('font-family: "Nosifer"');
    expect(html).toContain("&family=Nosifer&");
  });

  it("renders the full-width decorative image as a child of the sticky header", () => {
    const { container } = render(<header className="tok-site-header"><HalloweenCanopy /></header>);
    const canopy = container.querySelector("header > .tok-halloween-canopy");
    const image = canopy?.querySelector("img");

    expect(canopy?.getAttribute("aria-hidden")).toBe("true");
    expect(image?.getAttribute("src")).toBe("/images/seasonal/halloween/canopy.webp");
    expect(image?.getAttribute("alt")).toBe("");
  });


  it("forces dark mode without overwriting a light preference, then restores it", () => {
    localStorage.setItem("theme", "light");
    const { rerender } = render(<HalloweenTheme enabled />);

    expect(document.documentElement.dataset.seasonalTheme).toBe("halloween");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("light");

    rerender(<HalloweenTheme enabled={false} />);

    expect(document.documentElement.dataset.seasonalTheme).toBeUndefined();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("keeps the dark preference after unmounting and prevents external light mode", async () => {
    localStorage.setItem("theme", "dark");
    const { unmount } = render(<HalloweenTheme enabled />);
    await act(async () => {
      document.documentElement.classList.remove("dark");
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    unmount();
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("cleans the document attribute when the themed surface unmounts", () => {
    const { unmount } = render(<HalloweenTheme enabled />);

    unmount();

    expect(document.documentElement.dataset.seasonalTheme).toBeUndefined();
  });
});
