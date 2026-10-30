import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../supabase/functions/_shared/openai.ts", () => ({ OPENAI_API_KEY: "test-key", selectTokAiModel: vi.fn(() => "configured-vision-model"), extractOutputText: (x: any) => x.output_text || "" }));
vi.mock("../../supabase/functions/_shared/auth.ts", () => ({ HttpError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
import { reviewNativePrintArtwork } from "../../supabase/functions/_shared/print/artwork-review";
import { buildNativePrintTemplate } from "../../supabase/functions/_shared/print/artwork";
import { selectTokAiModel } from "../../supabase/functions/_shared/openai";
const template = buildNativePrintTemplate({ widthMm: 85, heightMm: 55, bleedMm: 3 });
const observation = { complete: true, uncertain: false, singleDesign: true, bleedContinuous: true, containsQr: false, legible: true, hasGuides: false, elements: [{ kind: "logo", left: .2, top: .2, right: .7, bottom: .7 }] };
const input = () => ({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/png", width: template.widthPx, height: template.heightPx, template });
afterEach(() => vi.unstubAllGlobals());
describe("bounded native print visual review", () => {
  it("uses one structured vision call for an already-safe print, without regeneration", async () => {
    const fetcher = vi.fn(async () => Response.json({ status: "completed", output_text: JSON.stringify(observation) }));
    vi.stubGlobal("fetch", fetcher);
    const result = await reviewNativePrintArtwork(input());
    expect(result.ready).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(payload.model).toBe("configured-vision-model");
    expect(selectTokAiModel).toHaveBeenCalledWith("image_premium");
    expect(payload.input[0].content[0].text).toContain("red trim line");
    expect(payload.input[0].content[0].text).toContain("NEVER label a real word, price, logo");
    expect(payload.input[0].content[0].text).toContain("restaurant/interior photograph");
    expect(payload.store).toBe(false);
    expect(payload.text.format.strict).toBe(true);
    expect(payload.max_output_tokens).toBeLessThanOrEqual(4000);
  });
  it.each([{}, { status: "incomplete", output_text: JSON.stringify(observation) }, { status: "completed", output_text: "broken-json" }])("rejects malformed/partial responses %j", async (body) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
    await expect(reviewNativePrintArtwork(input())).rejects.toMatchObject({ status: 503 });
  });
  it("accepts ornamental bleed but not a cut-off meaningful label even if the model says safe", async () => {
    const withOrnament = { ...observation, elements: [
      ...observation.elements,
      { kind: "decorative", left: 0, top: 0, right: 1, bottom: 1 },
    ] };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: "completed", output_text: JSON.stringify(withOrnament) })));
    expect((await reviewNativePrintArtwork(input())).ready).toBe(true);
  });
  it("does not trust a claimed pass over an unsafe element", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: "completed", output_text: JSON.stringify({ ...observation, safe: true, elements: [{ kind: "text", left: 0, top: .2, right: .3, bottom: .4 }] }) })));
    expect((await reviewNativePrintArtwork(input())).ready).toBe(false);
  });
  it("rechecks suspicious oversized imagery against the red trim with one targeted structured call", async () => {
    const first = { ...observation, elements: [
      ...observation.elements,
      { kind: "essential", left: 0, top: 0, right: 1, bottom: 1 },
    ] };
    const second = { complete: true, uncertain: false, candidates: [
      { index: 1, kind: "decorative", reason: "background_photo", left: 0, top: 0, right: 1, bottom: 1 },
    ] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ status: "completed", output_text: JSON.stringify(first) }))
      .mockResolvedValueOnce(Response.json({ status: "completed", output_text: JSON.stringify(second) }));
    vi.stubGlobal("fetch", fetcher);
    const result = await reviewNativePrintArtwork(input());
    expect(result.ready).toBe(true);
    expect(result.warnings.some(issue => issue.code === "native_trim_refinement")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const confirmation = JSON.parse(fetcher.mock.calls[1][1].body);
    expect(confirmation.text.format.strict).toBe(true);
    expect(confirmation.input[1].content[0].text).toContain("first pass suspected");
  });
  it("keeps the original refusal if targeted verification is unavailable", async () => {
    const outside = { ...observation, elements: [{ kind: "text", left: 0, top: .2, right: .3, bottom: .4 }] };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ status: "completed", output_text: JSON.stringify(outside) }))
      .mockRejectedValueOnce(new Error("timeout"));
    vi.stubGlobal("fetch", fetcher);
    const result = await reviewNativePrintArtwork(input());
    expect(result.ready).toBe(false);
    expect(result.blocking[0].code).toBe("native_element_outside_trim");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("fails closed once on a provider timeout", async () => {
    const fetcher = vi.fn(async () => { throw new Error("timeout"); });
    vi.stubGlobal("fetch", fetcher);
    await expect(reviewNativePrintArtwork(input())).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
