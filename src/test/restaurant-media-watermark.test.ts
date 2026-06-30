import { describe, expect, it } from "vitest";

import {
  isTokProOrHigherRestaurantSubscription,
  shouldApplyTokWatermarkToRestaurantMedia,
} from "@/lib/ai/restaurantMediaMetadata";

describe("restaurant media TOK watermark rules", () => {
  it("applies the TOK logo only to PhotoPro gallery media below Tok Pro", () => {
    expect(
      shouldApplyTokWatermarkToRestaurantMedia({
        mediaType: "photo_ai_tok",
        metadata: { tool: "photopro" },
        subscription: { plan: "starter", status: "active" },
      }),
    ).toBe(true);

    expect(
      shouldApplyTokWatermarkToRestaurantMedia({
        mediaType: "photo_ai_tok",
        metadata: { tool: "marketing_studio" },
        subscription: { plan: "starter", status: "active" },
      }),
    ).toBe(false);

    expect(
      shouldApplyTokWatermarkToRestaurantMedia({
        mediaType: "photo",
        metadata: { tool: "photopro" },
        subscription: { plan: "starter", status: "active" },
      }),
    ).toBe(false);
  });

  it("lets Tok Pro or higher restaurants remove the TOK logo", () => {
    for (const plan of ["pro", "premium", "elite", "custom"]) {
      expect(
        shouldApplyTokWatermarkToRestaurantMedia({
          mediaType: "photo_ai_tok",
          metadata: { tool: "photopro" },
          subscription: { plan, status: "active" },
        }),
      ).toBe(false);
    }

    expect(isTokProOrHigherRestaurantSubscription({ plan: "premium", status: "trialing" })).toBe(true);
  });

  it("does not treat inactive Tok Pro subscriptions as watermark-free", () => {
    expect(isTokProOrHigherRestaurantSubscription({ plan: "pro", status: "canceled" })).toBe(false);
    expect(
      shouldApplyTokWatermarkToRestaurantMedia({
        mediaType: "photo_ai_tok",
        metadata: { tool: "photopro" },
        subscription: { plan: "pro", status: "canceled" },
      }),
    ).toBe(true);
  });

  it("respects an explicit stored watermark opt-out", () => {
    expect(
      shouldApplyTokWatermarkToRestaurantMedia({
        mediaType: "photo_ai_tok",
        metadata: { tool: "photopro", tok_watermark_required: false },
        subscription: { plan: "starter", status: "active" },
      }),
    ).toBe(false);
  });
});
