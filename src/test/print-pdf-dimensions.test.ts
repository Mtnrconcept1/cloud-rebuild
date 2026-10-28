import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as artwork from "../../supabase/functions/_shared/print/artwork";
import { readBoundedImageBody } from "../../supabase/functions/_shared/ai-image-response";

const state = vi.hoisted(() => ({
  image: { width: 2551, height: 3579 },
  addPage: vi.fn(),
  save: vi.fn(),
  embedPng: vi.fn(),
  embedJpg: vi.fn(),
  review: vi.fn(),
}));
const pdfLibrary = {
  StandardFonts: { Helvetica: "regular", HelveticaBold: "bold" },
  rgb: vi.fn(),
  PDFDocument: { create: async () => ({
    addPage: state.addPage, save: state.save,
    embedPng: state.embedPng, embedJpg: state.embedJpg,
    embedFont: async () => ({}), setTitle: vi.fn(), setProducer: vi.fn(), setCreator: vi.fn(),
  }) },
};
const auth = {
  HttpError: class extends Error {
    constructor(public status: number, message: string, public details?: Record<string, unknown>) { super(message); }
  },
  getEnv: () => "https://storage.example.test",
};
// Execute the unchanged Edge source, replacing only runtime dependencies because
// Vite cannot resolve Deno's npm: imports. This tests the full PDF decision path.
const compiled = ts.transpileModule(readFileSync("supabase/functions/_shared/print/pdf.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const loaded = { exports: {} as { buildPrintPdf: (input: { document: unknown; spec: typeof spec; expectedSourceSha256: string }) => Promise<{
  preflight: { ready: boolean; effectiveResolutionDpi: { x: number; y: number } };
}> } };
runInNewContext(compiled.outputText, {
  exports: loaded.exports,
  require: (name: string) => {
    if (name === "./artwork.ts") return artwork;
    if (name === "../ai-image-response.ts") return { readBoundedImageBody };
    if (name === "./artwork-review.ts") return { reviewNativePrintArtwork: state.review };
    if (name === "node:crypto") return { createHash };
    if (name === "npm:pdf-lib@1.17.1") return pdfLibrary;
    if (name === "npm:qrcode@1.5.4") return { default: {} };
    if (name === "../auth.ts") return auth;
    if (name === "./security.ts") return { sha256Hex: async () => "sha256" };
    throw new Error(`Unexpected dependency: ${name}`);
  },
  URL, AbortSignal, Uint8Array,
  fetch: (...args: Parameters<typeof fetch>) => fetch(...args),
});
const { buildPrintPdf } = loaded.exports;

const spec = { widthMm: 210, heightMm: 297, bleedMm: 3, safeMarginMm: 5 };
const document = (widthPx = 2551, heightPx = 3579) => ({
  background: { url: "https://storage.example.test/storage/v1/object/public/print/raster.png", mimeType: "image/png", widthPx, heightPx },
});
beforeEach(() => {
  vi.clearAllMocks();
  state.image = { width: 2551, height: 3579 };
  state.review.mockResolvedValue({ ready: true, blocking: [], policyVersion: 1 });
  state.embedPng.mockImplementation(async () => state.image);
  state.embedJpg.mockImplementation(async () => state.image);
  state.addPage.mockReturnValue({
    setMediaBox: vi.fn(), setBleedBox: vi.fn(), setCropBox: vi.fn(), setTrimBox: vi.fn(), setArtBox: vi.fn(), drawImage: vi.fn(),
  });
  state.save.mockResolvedValue(new Uint8Array([37, 80, 68, 70]));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } })));
});
afterEach(() => vi.unstubAllGlobals());

describe("PDF preflight uses decoded image dimensions", () => {
  it.each([{ texts: [{ text: "CHF 39", x: .2, y: .2, width: .5, height: .1 }] }, { logo: {} }, { qr: { value: "https://example.test", x: .2, y: .2, size: .2 } }, { layout: { overlayOpacity: .2 } }])("rejects artistic overlays before fetching or drawing %j", async (overlay) => {
    await expect(buildPrintPdf({ document: { ...document(), ...overlay }, spec, expectedSourceSha256: "sha256" })).rejects.toMatchObject({ status: 422 });
    expect(fetch).not.toHaveBeenCalled();
    expect(state.addPage).not.toHaveBeenCalled();
  });

  it("rejects changed original bytes before decoding or charging visual assessment", async () => {
    await expect(buildPrintPdf({ document: document(), spec, expectedSourceSha256: "different-hash" })).rejects.toMatchObject({ status: 409, message: "PRINT_SOURCE_CHANGED_REGENERATE" });
    expect(state.embedPng).not.toHaveBeenCalled();
    expect(state.review).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  });
  it("blocks uncertain native artwork before drawing a proof", async () => {
    state.review.mockResolvedValue({ ready: false, blocking: [{ code: "artwork_review_inconclusive", message: "Position incertaine" }] });
    await expect(buildPrintPdf({ document: document(), spec, expectedSourceSha256: "sha256" })).rejects.toMatchObject({ status: 422 });
    expect(state.addPage).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  });
  it("wraps the unchanged original in bleed/trim/safe boxes with proportional placement only", async () => {
    await buildPrintPdf({ document: document(), spec, expectedSourceSha256: "sha256" });
    const pt = 72 / 25.4;
    expect(state.addPage).toHaveBeenCalledWith([216 * pt, 303 * pt]);
    const page = state.addPage.mock.results[0].value;
    expect(page.setTrimBox).toHaveBeenCalledWith(3 * pt, 3 * pt, 210 * pt, 297 * pt);
    expect(page.setArtBox).toHaveBeenCalledWith(8 * pt, 8 * pt, 210 * pt - 10 * pt, 297 * pt - 10 * pt);
    expect(page.drawImage).toHaveBeenCalledOnce();
    const [image, placement] = page.drawImage.mock.calls[0];
    expect(image).toBe(state.image);
    expect(placement.width / placement.height).toBeCloseTo(state.image.width / state.image.height, 10);
    expect(placement.x).toBeGreaterThanOrEqual(0);
    expect(placement.y).toBeGreaterThanOrEqual(0);
  });
  it("rejects a low-resolution raster even when the caller declares 300 DPI", async () => {
    state.image = { width: 216, height: 303 };
    await expect(buildPrintPdf({ document: document(), spec, expectedSourceSha256: "sha256" })).rejects.toMatchObject({
      status: 422, details: { preflight: { ready: false, blocking: expect.arrayContaining([{ code: "resolution_too_low", message: expect.any(String) }]) } },
    });
    expect(state.addPage).not.toHaveBeenCalled();
    expect(state.save).not.toHaveBeenCalled();
  });
  it("rejects landscape bytes disguised as portrait without silently cropping", async () => {
    state.image = { width: 3579, height: 2551 };
    await expect(buildPrintPdf({ document: document(), spec, expectedSourceSha256: "sha256" })).rejects.toMatchObject({
      status: 422, details: { preflight: { blocking: expect.arrayContaining([{ code: "background_format_mismatch", message: expect.any(String) }]) } },
    });
    expect(state.save).not.toHaveBeenCalled();
  });
  it("accepts rounded bleed-inclusive pixels and calculates actual DPI despite incorrect client dimensions", async () => {
    const result = await buildPrintPdf({ document: document(1, 1), spec, expectedSourceSha256: "sha256" });
    expect(result.preflight.ready).toBe(true);
    expect(result.preflight.effectiveResolutionDpi.x).toBeCloseTo(2551 / (216 / 25.4));
    expect(result.preflight.effectiveResolutionDpi.y).toBeCloseTo(3579 / (303 / 25.4));
    expect(state.save).toHaveBeenCalledOnce();
  });
  it("also validates decoded JPEG dimensions", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(new Uint8Array([1]), { headers: { "content-type": "image/jpeg" } }));
    state.image = { width: 216, height: 303 };
    await expect(buildPrintPdf({ document: document(), spec, expectedSourceSha256: "sha256" })).rejects.toMatchObject({ status: 422 });
    expect(state.embedJpg).toHaveBeenCalledOnce();
    expect(state.embedPng).not.toHaveBeenCalled();
  });
});
