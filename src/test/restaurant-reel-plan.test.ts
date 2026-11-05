import { describe, expect, it } from "vitest";
import { applyReelDirection, DEFAULT_REEL_SETTINGS, readReelDraft, reelFrameAt } from "@/lib/media/restaurantReelPlan";
import { boundedReelImageSize, readReelImageDimensions } from "@/lib/media/reelImageGeometry";

describe("selected-source reel direction and timeline", () => {
  it.each(["Images fixes, coupes franches, fond noir", "Pas de zoom", "Ne pas zoomer", "Sans mouvement", "Photos fixes"])("honors negative/fixed direction: %s", (prompt) => {
    expect(applyReelDirection(prompt, { ...DEFAULT_REEL_SETTINGS, motion: "zoom-in" }).settings.motion).toBe("none");
  });
  it("applies only supported presentation settings, never invented subjects or prompt text", () => {
    const result = applyReelDirection("Zoom arrière, fond #c8ad8b, logo en bas, ajoute une terrasse et un plat de homard", DEFAULT_REEL_SETTINGS);
    expect(result.settings).toMatchObject({ motion: "zoom-out", background: "#c8ad8b", logoPosition: "bottom", caption: "" });
    expect(Object.keys(result.settings).sort()).toEqual(Object.keys(DEFAULT_REEL_SETTINGS).sort());
    expect(applyReelDirection("Ajoute des photos de Paris", DEFAULT_REEL_SETTINGS).applied).toEqual([]);
  });
  it("restores acknowledged direction without replacing later manual changes", () => {
    const draft = readReelDraft(JSON.stringify({ version: 1, photoIds: ["p1", "p1"], logoId: "logo", prompt: "zoom avant", appliedPrompt: "zoom avant", settings: { motion: "zoom-out", caption: "Texte choisi" } }));
    expect(draft).toMatchObject({ photoIds: ["p1"], appliedPrompt: "zoom avant", settings: { motion: "zoom-out", caption: "Texte choisi" } });
    expect(readReelDraft("invalid")).toBeNull();
  });
  it("keeps all selected images in order within exactly ten seconds, without wrapping the end", () => {
    expect([0, 2.5, 5, 7.5, 10].map((time) => reelFrameAt(time, 4, "cut").index)).toEqual([0, 1, 2, 3, 3]);
    expect(reelFrameAt(2.4, 4, "fade")).toMatchObject({ index: 0, nextIndex: 1 });
    expect(reelFrameAt(2.4, 4, "fade").blend).toBeGreaterThan(0);
    expect(reelFrameAt(10, 4, "fade")).toMatchObject({ nextIndex: 3, blend: 0 });
    expect(() => reelFrameAt(0, 7, "cut")).toThrow();
  });
});

describe("reel image memory bounds", () => {
  const pngHeader = (width: number, height: number) => {
    const buffer = new ArrayBuffer(24); const view = new DataView(buffer);
    view.setUint32(0, 0x89504e47); view.setUint32(12, 0x49484452);
    view.setUint32(16, width); view.setUint32(20, height); return buffer;
  };
  it("bounds the longest edge and never enlarges a small original", () => {
    expect(boundedReelImageSize(200, 4000)).toEqual({ width: 72, height: 1440 });
    expect(boundedReelImageSize(100, 100)).toEqual({ width: 100, height: 100 });
    expect(boundedReelImageSize(1080, 1920)).toEqual({ width: 810, height: 1440 });
  });
  it("rejects decompression bombs and invalid headers before decoding pixels", () => {
    expect(readReelImageDimensions(pngHeader(4000, 3000))).toEqual({ width: 4000, height: 3000 });
    expect(() => readReelImageDimensions(pngHeader(12000, 12000))).toThrow("20 mégapixels");
    expect(() => readReelImageDimensions(new ArrayBuffer(24))).toThrow("Image illisible");
  });
});
