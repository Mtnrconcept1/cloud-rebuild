import { afterEach, describe, expect, it, vi } from "vitest";
import { TOK_MARKETING_REFERENCES } from "../../supabase/functions/_shared/marketing-brand";
import {
  CAMPAIGN_VISUAL_CHECKS,
  inspectTokCampaignImage,
} from "../../supabase/functions/_shared/marketing-campaign-visual-quality";

const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
const references = TOK_MARKETING_REFERENCES.map(() => new Blob([bytes], { type: "image/jpeg" }));

function mockReview(overrides: Record<string, unknown> = {}) {
  Object.defineProperty(Blob.prototype, "arrayBuffer", {
    configurable: true,
    writable: true,
    value: function (this: Blob) {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(this);
      });
    },
  });
  const checks = Object.fromEntries(CAMPAIGN_VISUAL_CHECKS.map((key) => [key, true]));
  const payload = {
    checks,
    observed_headline: "Genève à table",
    reason: "DA TOK conforme et composition distincte.",
    tok_style_score: 0.93,
    novelty_score: 0.82,
    ...overrides,
  };
  const fetcher = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({
    status: "completed",
    output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(payload) }] }],
  }));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("TOK campaign visual quality", () => {
  it("accepts only a strong TOK-style, novel, single-scene visual", async () => {
    const fetcher = mockReview();
    const quality = await inspectTokCampaignImage({
      bytes,
      references,
      prompt: "Direction créative Genève/local.",
      expectedHeadline: "Genève à table",
      creativeDirectionId: "geneva-local",
      recentCreativeDirectionIds: ["chef-product-impact", "app-device"],
      apiKey: "test-only",
      model: "review-model",
    });
    expect(quality).toMatchObject({ tok_style_score: 0.93, novelty_score: 0.82 });
    const body = JSON.parse(fetcher.mock.calls[0][1]!.body as string);
    const instructions = body.input[1].content.find((part: { type: string }) => part.type === "input_text").text;
    expect(instructions).toContain("doit être au moins 0.85");
    expect(instructions).toContain("doit être au moins 0.7");
    expect(instructions).toContain("geneva-local");
  });

  it.each([
    [{ tok_style_score: 0.84 }, "marketing_campaign_quality_style_score"],
    [{ novelty_score: 0.69 }, "marketing_campaign_quality_novelty_score"],
    [{ observed_headline: "Autre texte" }, "marketing_campaign_quality_headline_mismatch"],
  ] as const)("rejects quality below the approved gate (%j)", async (override, error) => {
    mockReview(override);
    await expect(inspectTokCampaignImage({
      bytes,
      references,
      prompt: "Direction créative TOK.",
      expectedHeadline: "Genève à table",
      apiKey: "test-only",
      model: "review-model",
    })).rejects.toThrow(error);
  });
});
