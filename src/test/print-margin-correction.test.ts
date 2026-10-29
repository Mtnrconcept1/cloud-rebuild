import { describe, expect, it } from "vitest";
import { buildNativePrintTemplate } from "../../supabase/functions/_shared/print/artwork";
import {
  PRINT_MARGIN_INSET_OPTIONS, buildPrintMarginCorrectionPrompt, readPrintMarginCorrection, isPrintFrameReady,
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
  it("validates the live frame geometry and rejects manipulated client coordinates", () => {
    const input = { sourceGenerationId, insetPercent: 5 as const,
      frame: { scalePercent: 80, offsetXPercent: 0, offsetYPercent: 0 } };
    expect(readPrintMarginCorrection(input)).toEqual(input);
    expect(readPrintMarginCorrection({ ...input, frame: { scalePercent: 95, offsetXPercent: 20, offsetYPercent: 20 } })).toBeTruthy();
    expect(() => readPrintMarginCorrection({ ...input, frame: { ...input.frame, scalePercent: 120 } })).toThrow("PRINT_MARGIN_FRAME_INVALID");
    expect(() => readPrintMarginCorrection({ ...input, frame: { ...input.frame, offsetXPercent: Number.NaN } })).toThrow("PRINT_MARGIN_FRAME_INVALID");
    expect(buildPrintMarginCorrectionPrompt(5, input.frame)).toContain("80%");
  });
  it("allows a framing that crosses green but remains entirely within the mandatory red trim", () => {
    const t = buildNativePrintTemplate({ widthMm: 105, heightMm: 148, bleedMm: 3 });
    const trimX = t.trimArea.left * 100;
    const trimY = t.trimArea.top * 100;
    const frame = { scalePercent: 92, offsetXPercent: 0, offsetYPercent: 0 };
    expect(isPrintFrameReady(frame, trimX, trimY)).toBe(true);
    expect(isPrintFrameReady(frame, t.safeArea.left * 100, t.safeArea.top * 100)).toBe(false);
    expect(isPrintFrameReady({ ...frame, offsetXPercent: 8 }, trimX, trimY)).toBe(false);
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
