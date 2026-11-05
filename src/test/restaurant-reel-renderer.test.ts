import { Blob as NativeBlob } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_REEL_SETTINGS } from "@/lib/media/restaurantReelPlan";
import { drawReelFrame, loadReelAssets, renderRestaurantReel, type ReelAssets } from "@/lib/media/restaurantReelRenderer";
import { optimizeSocialMediaUpload } from "@/lib/media/socialMediaCompression";

const codec = vi.hoisted(() => ({ supported: vi.fn(), add: vi.fn(), finalize: vi.fn(), cancel: vi.fn(), close: vi.fn() }));
vi.mock("mediabunny", () => ({
  canEncodeVideo: codec.supported,
  Quality: class {}, Mp4OutputFormat: class {},
  BufferTarget: class { buffer = new Uint8Array([1, 2, 3]).buffer; },
  Output: class {
    state = "started";
    addVideoTrack() {} async start() {}
    async finalize() { codec.finalize(); this.state = "finalized"; }
    async cancel() { codec.cancel(); this.state = "canceled"; }
  },
  CanvasSource: class { add = codec.add; close = codec.close; },
}));
const bitmap = (width = 720, height = 1280) => ({ width, height, close: vi.fn() }) as unknown as ImageBitmap;
const assets = (): ReelAssets => ({ photos: [bitmap(), bitmap(1200, 800)], logo: bitmap(300, 200), close: vi.fn() });
const context = (canvas: Pick<HTMLCanvasElement, "width" | "height">) => ({
  canvas, save: vi.fn(), restore: vi.fn(), fillRect: vi.fn<(x: number, y: number, w: number, h: number) => void>(),
  drawImage: vi.fn<(image: CanvasImageSource, x: number, y: number, w: number, h: number) => void>(), fillText: vi.fn(),
  measureText: vi.fn((text: string) => ({ width: text.length * 28 })),
  globalAlpha: 1, fillStyle: "", font: "", textAlign: "center",
});
beforeEach(() => {
  vi.clearAllMocks(); codec.supported.mockResolvedValue(true); codec.add.mockResolvedValue(undefined);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(function (this: HTMLCanvasElement) {
    return context(this) as unknown as CanvasRenderingContext2D;
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("reel rendering contract", () => {
  it("encodes exactly 300 timestamped frames and keeps the resulting File intact for publication", async () => {
    const file = await renderRestaurantReel({ assets: assets(), settings: DEFAULT_REEL_SETTINGS });
    expect(codec.add).toHaveBeenCalledTimes(300);
    expect(codec.add).toHaveBeenNthCalledWith(1, 0, 1 / 30);
    expect(codec.add).toHaveBeenLastCalledWith(299 / 30, 1 / 30);
    expect(codec.finalize).toHaveBeenCalledTimes(1);
    expect(file.type).toBe("video/mp4");
    expect(await optimizeSocialMediaUpload(file)).toBe(file);
  });
  it("cancels an interrupted export without returning a partial file", async () => {
    const controller = new AbortController(); let count = 0;
    codec.add.mockImplementation(async () => { if (++count === 25) controller.abort(); });
    await expect(renderRestaurantReel({ assets: assets(), settings: DEFAULT_REEL_SETTINGS, signal: controller.signal })).rejects.toThrow();
    expect(codec.add).toHaveBeenCalledTimes(25);
    expect(codec.cancel).toHaveBeenCalledTimes(1);
    expect(codec.finalize).not.toHaveBeenCalled();
  });
  it("reports unsupported MP4 export instead of producing a different format", async () => {
    codec.supported.mockResolvedValue(false);
    await expect(renderRestaurantReel({ assets: assets(), settings: DEFAULT_REEL_SETTINGS })).rejects.toThrow("Ce navigateur ne permet pas l'export MP4");
    expect(codec.add).not.toHaveBeenCalled();
  });
  it("uses only selected sources and reserves separate zones for a bottom logo and long caption", () => {
    const refs = assets(); const ctx = context({ width: 720, height: 1280 });
    drawReelFrame(ctx as unknown as CanvasRenderingContext2D, refs, { ...DEFAULT_REEL_SETTINGS,
      logoPosition: "bottom", caption: "Notre restaurant vous accueille pour découvrir la cuisine de notre équipe et partager un moment autour de notre table." }, 0);
    expect(ctx.drawImage.mock.calls.map((call) => call[0])).toEqual([refs.photos[0], refs.logo]);
    const logo = ctx.drawImage.mock.calls[1];
    const caption = ctx.fillRect.mock.calls.at(-1)!;
    expect(logo[2] + logo[4] + 720 * 0.018).toBeLessThan(caption[1]);
  });
  it("moves a full-frame photo without exposing empty edges", () => {
    const refs = { ...assets(), photos: [bitmap()], logo: null };
    const before = context({ width: 720, height: 1280 }); const after = context({ width: 720, height: 1280 });
    const settings = { ...DEFAULT_REEL_SETTINGS, motion: "pan-left" as const, photoFit: "cover" as const };
    drawReelFrame(before as unknown as CanvasRenderingContext2D, refs, settings, 0);
    drawReelFrame(after as unknown as CanvasRenderingContext2D, refs, settings, 9.9);
    const a = before.drawImage.mock.calls[0]; const b = after.drawImage.mock.calls[0];
    expect(a[1]).toBeGreaterThan(b[1]); expect(a[1]).toBeLessThanOrEqual(0);
    expect(b[1] + b[3]).toBeGreaterThanOrEqual(720);
  });
});

describe("selected image loading", () => {
  it("loads only selected URLs, bounds portrait dimensions and closes decoded originals", async () => {
    const header = new ArrayBuffer(24); const view = new DataView(header);
    view.setUint32(0, 0x89504e47); view.setUint32(12, 0x49484452); view.setUint32(16, 200); view.setUint32(20, 4000);
    const original = bitmap(200, 4000); const resized = bitmap(72, 1440);
    const decode = vi.fn().mockResolvedValueOnce(original).mockResolvedValueOnce(resized);
    const fetcher = vi.fn().mockResolvedValue({ ok: true, headers: new Headers(), blob: async () => new NativeBlob([header], { type: "image/png" }) });
    vi.stubGlobal("createImageBitmap", decode); vi.stubGlobal("fetch", fetcher);
    const loaded = await loadReelAssets([{ id: "only-selected", url: "https://assets.example/original.png" }], null);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(decode).toHaveBeenLastCalledWith(original, { resizeWidth: 72, resizeHeight: 1440, resizeQuality: "high" });
    expect(original.close).toHaveBeenCalledTimes(1);
    expect(loaded.photos).toEqual([resized]); loaded.close(); expect(resized.close).toHaveBeenCalledTimes(1);
  });
});
