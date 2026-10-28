import { describe, expect, it } from "vitest";
import { createMarketingPrintDocument, type PrintProductSpec } from "@/lib/print/document";
import { runPrintPreflight } from "@/lib/print/preflight";

const a5Spec: PrintProductSpec = {
  productId: "product-a5",
  providerProductId: "provider-a5",
  providerReference: "CLOUD-A5",
  displayName: "Flyer A5",
  widthMm: 148,
  heightMm: 210,
  bleedMm: 3,
  safeMarginMm: 3,
  printableSides: 1,
  orientation: "portrait",
  printTechnology: "digital",
  minimumQuantity: 100,
  quantityStep: 50,
  options: [],
};

function documentWith(overrides: Partial<Parameters<typeof createMarketingPrintDocument>[0]> = {}) {
  return createMarketingPrintDocument({
    title: "Brunch du dimanche",
    background: {
      url: "https://example.supabase.co/storage/v1/object/sign/restaurant-images/visual.jpg?token=abc",
      mimeType: "image/jpeg",
      widthPx: 2464,
      heightPx: 3456,
    },
    orientation: "portrait",
    ...overrides,
  });
}

describe("TheTok Print preflight", () => {
  it("accepts native A5 artwork with no post-generation additions", () => {
    const result = runPrintPreflight(documentWith(), a5Spec);

    expect(result.ready).toBe(true);
    expect(result.blocking).toEqual([]);
    expect(Math.min(result.effectiveResolutionDpi.x, result.effectiveResolutionDpi.y)).toBeGreaterThan(250);
  });

  it("blocks an image whose effective print resolution is too low", () => {
    const document = documentWith({
      background: {
        url: "https://example.supabase.co/storage/v1/object/sign/restaurant-images/low.jpg?token=abc",
        mimeType: "image/jpeg",
        widthPx: 500,
        heightPx: 700,
      },
    });

    const result = runPrintPreflight(document, a5Spec);

    expect(result.ready).toBe(false);
    expect(result.blocking.some((issue) => issue.code === "resolution_too_low")).toBe(true);
  });

  it("rejects added title/price/logo/QR at the document constructor", () => {
    expect(() => documentWith({ texts: [{ id: "price", kind: "price", text: "CHF 39", x: .2, y: .2, width: .4, height: .1 }] })).toThrow("PRINT_NATIVE_ARTWORK_ONLY");
    expect(() => documentWith({ qr: { value: "https://www.thetok.ch", x: .2, y: .2, size: .2 } })).toThrow("PRINT_NATIVE_ARTWORK_ONLY");
  });
  it("also blocks crafted documents bypassing the constructor", () => {
    const document = documentWith();
    document.qr = { value: "https://www.thetok.ch", x: .2, y: .2, size: .2 };
    expect(runPrintPreflight(document, a5Spec).blocking.some(x => x.code === "artwork_overlays_forbidden")).toBe(true);
  });
});
