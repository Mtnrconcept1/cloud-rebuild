import { describe, expect, it } from "vitest";

import {
  getOptimizedImageSizes,
  getOptimizedImageSrcSet,
  getOptimizedImageUrl,
} from "@/lib/optimizedImages";

describe("optimized image URLs", () => {
  it("builds transformed Supabase Storage URLs for public images", () => {
    const url = "https://example.supabase.co/storage/v1/object/public/images/demo/photo.jpg";

    expect(getOptimizedImageUrl(url, "card")).toBe(
      "https://example.supabase.co/storage/v1/render/image/public/images/demo/photo.jpg?width=720&height=450&quality=76&resize=cover&format=webp",
    );
  });

  it("keeps local and external non-storage images unchanged", () => {
    expect(getOptimizedImageUrl("/images/kebab-box-spread.jpeg", "thumbnail")).toBe("/images/kebab-box-spread.jpeg");
    expect(getOptimizedImageUrl("https://cdn.example.com/photo.jpg", "hero")).toBe("https://cdn.example.com/photo.jpg");
  });

  it("creates responsive srcSet only when a transformed URL is available", () => {
    const url = "https://example.supabase.co/storage/v1/object/public/images/demo/photo.jpg";

    expect(getOptimizedImageSrcSet(url, "thumbnail")).toContain("width=96");
    expect(getOptimizedImageSrcSet("/images/kebab-box-spread.jpeg", "thumbnail")).toBeUndefined();
    expect(getOptimizedImageSizes("card")).toContain("100vw");
  });
});
