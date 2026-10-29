import { describe, expect, it } from "vitest";
import {
  buildNativePrintTemplate, buildNativePrintInstructions, validateNativeArtwork,
  validateArtworkObservation, hasArtworkOverlays, nativePrintContractMatches,
} from "../../supabase/functions/_shared/print/artwork";

const a6 = { widthMm: 105, heightMm: 148, bleedMm: 3, safeMarginMm: null };
const formats = [[105, 148], [148, 210], [210, 297], [297, 420], [85, 55], [55, 85], [55, 55], [98, 210]];

describe("Cloudprinter native print templates", () => {
  it.each(formats)("generates one native full-bleed format for %s×%s without cropping", (widthMm, heightMm) => {
    const t = buildNativePrintTemplate({ ...a6, widthMm, heightMm });
    expect(t.mediaWidthMm).toBe(widthMm + 6);
    expect(t.mediaHeightMm).toBe(heightMm + 6);
    expect(t.widthPx % 16).toBe(0);
    expect(t.heightPx % 16).toBe(0);
    expect(t.widthPx * t.heightPx).toBeLessThanOrEqual(8_294_400);
    expect(Math.max(t.widthPx, t.heightPx)).toBeLessThanOrEqual(3840);
    expect(validateNativeArtwork(t.widthPx, t.heightPx, t).ready).toBe(true);
    expect(t.safeArea.left).toBeCloseTo(6 / (widthMm + 6));
    expect(t.safeArea.top).toBeCloseTo(6 / (heightMm + 6));
    expect(t.trimArea.left).toBeCloseTo(3 / (widthMm + 6));
    expect(t.trimArea.top).toBeCloseTo(3 / (heightMm + 6));
  });
  it.each([null, undefined, ""])("missing provider safe margin %s never becomes zero", (safeMarginMm) => {
    expect(buildNativePrintTemplate({ ...a6, safeMarginMm }).safeMarginMm).toBe(3);
  });
  it("honours a larger margin and enforces the documented minimum", () => {
    expect(buildNativePrintTemplate({ ...a6, safeMarginMm: 5 }).safeMarginMm).toBe(5);
    expect(buildNativePrintTemplate({ ...a6, safeMarginMm: 0 }).safeMarginMm).toBe(3);
  });
  it.each([{ bleedMm: null }, { widthMm: 0 }, { heightMm: Infinity }, { safeMarginMm: -1 }, { safeMarginMm: 60 }])("rejects incomplete or impossible geometry %j", (bad) => {
    expect(() => buildNativePrintTemplate({ ...a6, ...bad })).toThrow();
  });
  it("does not label a large native raster as 300 DPI after upscaling", () => {
    const t = buildNativePrintTemplate({ ...a6, widthMm: 297, heightMm: 420 });
    const result = validateNativeArtwork(t.widthPx, t.heightPx, t);
    expect(Math.min(result.effectiveResolutionDpi.x, result.effectiveResolutionDpi.y)).toBeLessThan(300);
    expect(result.warnings.some(x => x.code === "resolution_below_recommended")).toBe(true);
    expect(validateNativeArtwork(1024, 1536, t).ready).toBe(false);
  });
  it("enforces supplier minimum DPI when explicitly present", () => {
    expect(() => buildNativePrintTemplate({ ...a6, widthMm: 297, heightMm: 420, minimumDpi: 300 })).toThrow();
  });
  it("adds native text, full bleed, trim and pixel safe boundaries without crop instructions", () => {
    const prompt = buildNativePrintInstructions(buildNativePrintTemplate(a6));
    expect(prompt).toContain("111×154 mm");
    expect(prompt).toContain("RECTANGLE ROUGE");
    expect(prompt).toContain("marge conseillée");
    expect(prompt).toContain("PAS un motif de rejet");
    expect(prompt).toContain("AUCUN calque");
    expect(prompt).toContain("une seule image");
    expect(prompt).not.toContain("recadrage cover");
  });
  it.each([{ texts: [{ text: "Prix" }] }, { texts: {} }, { qr: { value: "https://x.test" } }, { logo: {} }, { layout: { overlayOpacity: 0.2 } }])("rejects all post-generation artistic additions %j", (document) => {
    expect(hasArtworkOverlays(document)).toBe(true);
  });
  it("accepts no overlays and does not treat the PDF metadata title as artwork", () => {
    expect(hasArtworkOverlays({ title: "Metadata only", texts: [], qr: null, logo: null, layout: { overlayOpacity: 0 } })).toBe(false);
  });
  it("does not accept an old contract or a stale safe margin", () => {
    const template = buildNativePrintTemplate(a6);
    expect(nativePrintContractMatches({}, template)).toBe(false);
    expect(nativePrintContractMatches({ ...template.contract, safeMarginMm: 0 }, template)).toBe(false);
    expect(nativePrintContractMatches(template.contract, template)).toBe(true);
  });
});

describe("embedded raster element checks", () => {
  const template = buildNativePrintTemplate(a6);
  const clean = () => ({ complete: true, uncertain: false, singleDesign: true, bleedContinuous: true,
    containsQr: false, legible: true, hasGuides: false,
    elements: [{ kind: "text", left: .2, top: .2, right: .8, bottom: .4 }] });
  it("blocks meaningful content outside red trim, never merely outside green", () => {
    const { trimArea, safeArea } = template;
    expect(validateArtworkObservation(clean(), template).ready).toBe(true);
    const betweenGreenAndRed = { ...clean(), elements: [
      { kind: "logo", left: (trimArea.left + safeArea.left) / 2, top: .2, right: .18, bottom: .4 },
      { kind: "text", left: .2, top: .7, right: .8, bottom: (trimArea.bottom + safeArea.bottom) / 2 },
    ] };
    const allowed = validateArtworkObservation(betweenGreenAndRed, template);
    expect(allowed.ready).toBe(true);
    expect(allowed.blocking).toEqual([]);
    expect(allowed.warnings.some(w => w.code === "native_element_near_trim")).toBe(true);
    for (const kind of ["text", "logo", "face", "essential"]) {
      const rejected = validateArtworkObservation({ ...clean(), elements: [
        { kind, left: 0, top: .2, right: .2, bottom: .4 },
      ] }, template);
      expect(rejected.ready).toBe(false);
      expect(rejected.blocking.some(issue => issue.code === "native_element_outside_trim")).toBe(true);
    }
  });
  it("allows backgrounds, textures and ornaments to cross red without accepting a cut-off label", () => {
    const result = validateArtworkObservation({ ...clean(), elements: [
      ...clean().elements,
      { kind: "decorative", left: 0, top: 0, right: 1, bottom: 1 },
    ] }, template);
    expect(result.ready).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(validateArtworkObservation({ ...clean(), elements: [
      { kind: "decorative", left: 0, top: 0, right: 1, bottom: 1 },
    ] }, template).ready).toBe(false);
  });
  it("warns instead of rejecting when lettering is small but all boxes are known and in the red rectangle", () => {
    const result = validateArtworkObservation({ ...clean(), legible: false }, template);
    expect(result.ready).toBe(true);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "print_text_legibility_review" }));
  });
  it.each([{ complete: undefined }, { complete: false }, { uncertain: true }, { elements: [] }, { elements: [{ kind: "decorative", left: 0, top: 0, right: 1, bottom: 1 }] }, { elements: [{ kind: "invalid", left: .2, top: .2, right: .6, bottom: .4 }] }, { containsQr: true }, { bleedContinuous: false }, { hasGuides: true }, { singleDesign: false }, { elements: [{ kind: "text", left: "0.2", top: 0, right: 1, bottom: 1 }] }])("fails closed on uncertain/incomplete/unsafe observations %j", (bad) => {
    expect(validateArtworkObservation({ ...clean(), ...bad }, template).ready).toBe(false);
  });
});
