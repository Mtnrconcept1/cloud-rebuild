import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../supabase/functions/_shared/openai.ts", () => ({ OPENAI_API_KEY: "test-key", selectTokAiModel: () => "configured-vision-model", extractOutputText: (x: any) => x.output_text || "" }));
vi.mock("../../supabase/functions/_shared/auth.ts", () => ({ HttpError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
import { reviewNativePrintArtwork } from "../../supabase/functions/_shared/print/artwork-review";
import { buildNativePrintTemplate } from "../../supabase/functions/_shared/print/artwork";
const template = buildNativePrintTemplate({ widthMm: 85, heightMm: 55, bleedMm: 3 });
const observation = { complete: true, uncertain: false, singleDesign: true, bleedContinuous: true, containsQr: false, legible: true, hasGuides: false, elements: [{ kind: "logo", left: .2, top: .2, right: .7, bottom: .7 }] };
const input = () => ({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/png", width: template.widthPx, height: template.heightPx, template });
afterEach(() => vi.unstubAllGlobals());
describe("bounded native print visual review", () => {
  it("uses a single structured vision call, no image generation retry", async () => {
    const fetcher = vi.fn(async () => Response.json({ status: "completed", output_text: JSON.stringify(observation) }));
    vi.stubGlobal("fetch", fetcher);
    const result = await reviewNativePrintArtwork(input());
    expect(result.ready).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(payload.model).toBe("configured-vision-model");
    expect(payload.store).toBe(false);
    expect(payload.text.format.strict).toBe(true);
    expect(payload.max_output_tokens).toBeLessThanOrEqual(4000);
  });
  it.each([{}, { status: "incomplete", output_text: JSON.stringify(observation) }, { status: "completed", output_text: "broken-json" }])("rejects malformed/partial responses %j", async (body) => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(body)));
    await expect(reviewNativePrintArtwork(input())).rejects.toMatchObject({ status: 503 });
  });
  it("does not trust a claimed pass over an unsafe element", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: "completed", output_text: JSON.stringify({ ...observation, safe: true, elements: [{ kind: "text", left: 0, top: .2, right: .3, bottom: .4 }] }) })));
    expect((await reviewNativePrintArtwork(input())).ready).toBe(false);
  });
  it("fails closed once on a provider timeout", async () => {
    const fetcher = vi.fn(async () => { throw new Error("timeout"); });
    vi.stubGlobal("fetch", fetcher);
    await expect(reviewNativePrintArtwork(input())).rejects.toMatchObject({ status: 503 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
