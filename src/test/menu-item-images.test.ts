import { describe, expect, it } from "vitest";

import { resolveMenuItemImageUrl } from "@/lib/menu-item-images";

describe("menu item images", () => {
  it("canonicalizes legacy seeded public image paths before rendering", () => {
    const cases = [
      ["/images/fondue moiti\u00e9 moiti\u00e9.jpg", "/images/fondue-moitie-moitie.jpg"],
      ["/images/fondue%20moiti%C3%A9%20moiti%C3%A9.jpg", "/images/fondue-moitie-moitie.jpg"],
      ["/images/meringue double.webp", "/images/meringue-double.webp"],
      ["/images/milshake oreo.jpg", "/images/milkshake-oreo.jpg"],
      ["/images/milshake vanille.jpeg", "/images/milkshake-vanille.jpeg"],
      ["/images/moshi glac\u00e9s.jpg", "/images/mochi-glaces.jpg"],
      ["/images/r\u00f6sti bernois.jpg", "/images/rosti-bernois.jpg"],
      ["/images/salade du march\u00e9.jpg", "/images/salade-du-marche.jpg"],
      ["/images/taboul\u00e9.webp", "/images/taboule.webp"],
    ] as const;

    for (const [imageUrl, expected] of cases) {
      expect(resolveMenuItemImageUrl({ name: "plat legacy", imageUrl })).toBe(expected);
    }
  });

  it("uses canonical paths for curated local menu matches", () => {
    expect(resolveMenuItemImageUrl({ name: "milkshake" })).toBe("/images/milkshake-vanille.jpeg");
    expect(resolveMenuItemImageUrl({ name: "green tea ice cream" })).toBe("/images/mochi-glaces.jpg");
    expect(resolveMenuItemImageUrl({ name: "frappe cafe" })).toBe("/images/milkshake-vanille.jpeg");
  });

  it("preserves external image urls", () => {
    const externalImage = "https://cdn.example.test/photos/menu-item.jpg";

    expect(resolveMenuItemImageUrl({ name: "plat externe", imageUrl: externalImage })).toBe(externalImage);
  });
});
