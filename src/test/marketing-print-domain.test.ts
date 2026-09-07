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
      widthPx: 2000,
      heightPx: 2800,
    },
    texts: [
      {
        id: "title",
        kind: "title",
        text: "Brunch du dimanche",
        x: 0.1,
        y: 0.1,
        width: 0.8,
        height: 0.12,
        align: "center",
        fontSizeMm: 7,
        weight: "bold",
        color: "#ffffff",
      },
    ],
    qr: { value: "https://www.thetok.ch/reserver", x: 0.7, y: 0.7, size: 0.18 },
    orientation: "portrait",
    ...overrides,
  });
}

describe("TheTok Print preflight", () => {
  it("accepts a high-resolution structured A5 composition", () => {
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

  it("blocks factual text placed inside the cut-risk margin", () => {
    const document = documentWith({
      texts: [
        {
          id: "price",
          kind: "price",
          text: "CHF 39.–",
          x: 0,
          y: 0.05,
          width: 0.25,
          height: 0.1,
          fontSizeMm: 6,
          weight: "bold",
          color: "#ffffff",
        },
      ],
    });

    const result = runPrintPreflight(document, a5Spec);

    expect(result.ready).toBe(false);
    expect(result.blocking.some((issue) => issue.code === "text_outside_safe_area")).toBe(true);
  });

  it("blocks a fake or undersized QR code before BAT generation", () => {
    const invalidUrl = runPrintPreflight(
      documentWith({ qr: { value: "not-a-url", x: 0.7, y: 0.7, size: 0.18 } }),
      a5Spec,
    );
    const tooSmall = runPrintPreflight(
      documentWith({ qr: { value: "https://www.thetok.ch", x: 0.7, y: 0.7, size: 0.05 } }),
      a5Spec,
    );

    expect(invalidUrl.blocking.some((issue) => issue.code === "qr_invalid")).toBe(true);
    expect(tooSmall.blocking.some((issue) => issue.code === "qr_too_small")).toBe(true);
  });
});
