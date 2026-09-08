import { describe, expect, it } from "vitest";

import { parseCloudprinterProductGeometry } from "../../supabase/functions/_shared/print/product-geometry";

describe("Cloudprinter product geometry", () => {
  it("reads the real card after-trimming dimensions returned by products/info", () => {
    expect(parseCloudprinterProductGeometry({
      "the exact width of the card in mm. after trimming": "105.0",
      "the exact height of the card in mm. after trimming": "148.0",
      "bleed in mm": "3",
      "minimum order quantity": "1",
    })).toMatchObject({
      widthMm: 105,
      heightMm: 148,
      bleedMm: 3,
    });
  });

  it("keeps the closed folded size separate from the open trim spread", () => {
    expect(parseCloudprinterProductGeometry({
      "the exact width of the card in mm. after trimming": "297",
      "the exact height of the card in mm. after trimming": "420",
      "the exact width of the card in mm. after folding": "297",
      "the exact height of the card in mm. after folding": "210",
      "fold position": "Top",
    })).toMatchObject({
      widthMm: 297,
      heightMm: 420,
      foldedWidthMm: 297,
      foldedHeightMm: 210,
    });
  });

  it("falls back to item/product exact dimensions without overriding trim dimensions", () => {
    expect(parseCloudprinterProductGeometry({
      "the exact width of the item in mm.": "85",
      "the exact height of the item in mm.": "55",
    })).toMatchObject({ widthMm: 85, heightMm: 55 });

    expect(parseCloudprinterProductGeometry({
      "the exact width of the product in mm": "98",
      "the exact height of the product in mm": "210",
      "the exact width of the card in mm. after trimming": "104",
      "the exact height of the card in mm. after trimming": "216",
    })).toMatchObject({ widthMm: 104, heightMm: 216 });
  });

  it("returns null instead of inventing missing dimensions or margins", () => {
    expect(parseCloudprinterProductGeometry({
      "orientation of the product": "Portrait",
    })).toEqual({
      widthMm: null,
      heightMm: null,
      foldedWidthMm: null,
      foldedHeightMm: null,
      bleedMm: null,
      safeMarginMm: null,
    });
  });
});
