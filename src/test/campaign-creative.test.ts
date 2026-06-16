import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_CAMPAIGN_CREATIVE,
  getCampaignCreativeSummary,
  normalizeCampaignCreative,
} from "@/lib/campaignCreative";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("campaign creative studio", () => {
  it("normalizes campaign creative choices to supported values", () => {
    expect(normalizeCampaignCreative({
      template: "immersive",
      tone: "night_gold",
      font: "editorial",
      background: "dark_grain",
      shape: "grunge",
    })).toEqual({
      template: "immersive",
      tone: "night_gold",
      font: "editorial",
      background: "dark_grain",
      shape: "grunge",
    });

    expect(normalizeCampaignCreative({
      template: "unsafe-template",
      tone: "rainbow",
      font: "comic",
      background: "remote-css",
      shape: "blob",
    })).toEqual(DEFAULT_CAMPAIGN_CREATIVE);
  });

  it("keeps a readable summary for campaign operators", () => {
    expect(getCampaignCreativeSummary({
      template: "story",
      tone: "fresh_green",
      font: "modern",
      background: "paper",
      shape: "wave",
    })).toContain("Coulisses");
    expect(getCampaignCreativeSummary(DEFAULT_CAMPAIGN_CREATIVE)).toContain("TOK orange");
  });

  it("persists creative choices in channels and normalizes them server-side", () => {
    const dashboard = readSource("src/pages/dashboard/DashboardCampagnes.tsx");
    const portal = readSource("supabase/functions/campaign-portal/index.ts");

    expect(dashboard).toContain("CampaignCreativeStudio");
    expect(dashboard).toContain("creative: campaignCreative");
    expect(dashboard).toContain("getCampaignCreativeFromChannels(initial?.channels)");

    expect(portal).toContain("sanitizeCampaignCreative");
    expect(portal).toContain("VALID_CREATIVE_TEMPLATES");
    expect(portal).toContain("creative,");
  });
});
