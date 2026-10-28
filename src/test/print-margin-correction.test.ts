import { describe, expect, it } from "vitest";
import {
  PRINT_MARGIN_INSET_OPTIONS, buildPrintMarginCorrectionPrompt, readPrintMarginCorrection,
} from "../../supabase/functions/_shared/print/margin-correction";

const sourceGenerationId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

describe("native generative print margin correction", () => {
  it("limits the request to an original generated UUID and approved small insets", () => {
    for (const insetPercent of PRINT_MARGIN_INSET_OPTIONS) {
      expect(readPrintMarginCorrection({ sourceGenerationId, insetPercent })).toEqual({ sourceGenerationId, insetPercent });
    }
    expect(readPrintMarginCorrection(undefined)).toBeNull();
    for (const request of [
      { sourceGenerationId, insetPercent: 20 },
      { sourceGenerationId, insetPercent: "5" },
      { sourceGenerationId: "../other-restaurant.png", insetPercent: 5 },
      { insetPercent: 5 }, [],
    ]) {
      expect(() => readPrintMarginCorrection(request)).toThrow("PRINT_MARGIN_CORRECTION_INVALID");
    }
  });
  it("requires native outpainting and preserving all embedded words, prices and logos", () => {
    const prompt = buildPrintMarginCorrectionPrompt(5);
    expect(prompt).toContain("5%");
    expect(prompt).toContain("generative outpainting");
    expect(prompt).toContain("Preserve all existing words");
    expect(prompt).toContain("No new text, no new logos");
    expect(prompt).toContain("one generation");
    expect(() => buildPrintMarginCorrectionPrompt(15 as 5)).toThrow("PRINT_MARGIN_CORRECTION_INVALID");
  });
});
