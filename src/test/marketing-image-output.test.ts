import { describe, expect, it } from "vitest";

import {
  assertMarketingOutputDimensions,
  marketingOutputFileName,
} from "@/lib/marketing/imageOutput";

import { DIGITAL_MARKETING_OUTPUT_TARGETS } from "@/lib/marketing/outputGeometry";

describe("Marketing output raster safeguards", () => {
  it("accepts the exact supported social and print-sized raster surface", () => {
    expect(assertMarketingOutputDimensions(1080, 1920)).toEqual({ widthPx: 1080, heightPx: 1920 });
    expect(assertMarketingOutputDimensions(3567, 2552)).toEqual({ widthPx: 3567, heightPx: 2552 });
  });

  it("rejects invalid and excessive raster surfaces before canvas allocation", () => {
    expect(() => assertMarketingOutputDimensions(0, 1920)).toThrow("INVALID_MARKETING_OUTPUT_DIMENSIONS");
    expect(() => assertMarketingOutputDimensions(5000, 5000)).toThrow("MARKETING_OUTPUT_TOO_LARGE");
  });

  it("generates stable downloadable file names from target geometry", () => {
    const target = DIGITAL_MARKETING_OUTPUT_TARGETS.find((item) => item.id === "social-story");
    if (!target) throw new Error("story target missing");
    expect(marketingOutputFileName("Restaurant Démo TOK", target, "png"))
      .toBe("restaurant-demo-tok-social-story-1080x1920.png");
  });
});
