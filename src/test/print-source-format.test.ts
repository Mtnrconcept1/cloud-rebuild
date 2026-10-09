import { describe, expect, it } from "vitest";
import { matchesGeneratedPrintFormat, readGeneratedOutputFormat, generatedPrintOrientation } from "../../supabase/functions/_shared/print/source-format";
import { applyMarketingOutputTargetToImageRequest, setMarketingOutputSession } from "@/lib/marketing/outputSession";
import { buildPrintMarketingOutputTargets, DIGITAL_MARKETING_OUTPUT_TARGETS } from "@/lib/marketing/outputGeometry";

const a4 = { providerProductId: "11111111-1111-4111-8111-111111111111", widthMm: 210, heightMm: 297, bleedMm: 3 };
const format = { destination: "print", ...a4 };

describe("generated visual print format", () => {
  it("derives native orientation from physical dimensions", () => {
    expect(generatedPrintOrientation({ destination: "print", ...a4 })).toBe("portrait");
    expect(generatedPrintOrientation({ destination: "print", ...a4, widthMm: 85, heightMm: 55 })).toBe("landscape");
    expect(generatedPrintOrientation({ destination: "print", ...a4, widthMm: 55, heightMm: 55 })).toBe("square");
  });
  it("accepts only the recorded A4 portrait product and geometry", () => {
    expect(matchesGeneratedPrintFormat(format, a4)).toBe(true);
    expect(matchesGeneratedPrintFormat(format, { ...a4, widthMm: 148, heightMm: 210 })).toBe(false);
    expect(matchesGeneratedPrintFormat(format, { ...a4, widthMm: 297, heightMm: 210 })).toBe(false);
    expect(matchesGeneratedPrintFormat(format, { ...a4, bleedMm: 5 })).toBe(false);
    expect(matchesGeneratedPrintFormat(format, { ...a4, providerProductId: "22222222-2222-4222-8222-222222222222" })).toBe(false);
  });
  it("blocks digital, legacy and malformed formats without ratio guesses", () => {
    for (const value of [null, undefined, {}, { destination: "digital" }, { ...format, widthMm: NaN },
      { ...format, heightMm: 0 }, { ...format, bleedMm: -1 }, { ...format, providerProductId: "invalid" }]) {
      expect(matchesGeneratedPrintFormat(value, a4)).toBe(false);
    }
  });
  it("captures the format before generation and preserves it when the selected target changes", () => {
    const [target] = buildPrintMarketingOutputTargets([{
      id: "flyer", slug: "flyer", displayName: "Flyer A4", category: "flyer",
      variants: [{ ...a4, productId: "flyer", providerReference: "a4", displayName: "A4 portrait",
        safeMarginMm: 5, printableSides: 1, orientation: "portrait", printTechnology: null,
        minimumQuantity: 1, quantityStep: 1, options: [] }],
    }]);
    setMarketingOutputSession({ destination: "print", targets: [target], target });
    const request = applyMarketingOutputTargetToImageRequest({ restaurantId: "r", prompt: "Flyer", marketingAssetMode: true });
    setMarketingOutputSession({ destination: "digital", targets: DIGITAL_MARKETING_OUTPUT_TARGETS, target: DIGITAL_MARKETING_OUTPUT_TARGETS[0] });
    expect(request.marketingOutputFormat).toEqual(format);
    expect(readGeneratedOutputFormat(request.marketingOutputFormat)).toEqual(format);
    expect(applyMarketingOutputTargetToImageRequest({ restaurantId: "r", prompt: "Social", marketingAssetMode: true }).marketingOutputFormat)
      .toEqual({ destination: "digital" });
  });
});
