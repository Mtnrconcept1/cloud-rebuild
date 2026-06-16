import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_CREATIVE_TEMPLATES,
  DEFAULT_CAMPAIGN_CREATIVE,
  getCampaignCreativeSummary,
  normalizeCampaignCreative,
} from "@/lib/campaignCreative";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("campaign creative studio", () => {
  it("ships the eight fixed restaurant-card templates", () => {
    expect(CAMPAIGN_CREATIVE_TEMPLATES).toHaveLength(8);
    expect(CAMPAIGN_CREATIVE_TEMPLATES.map((template) => template.id)).toEqual([
      "classic_elegant",
      "modern_clean",
      "warm_gourmet",
      "bold_contrast",
      "minimal_premium",
      "dynamic_color",
      "immersive_photo",
      "urban_street",
    ]);
  });

  it("normalizes campaign creative choices to supported values only", () => {
    expect(normalizeCampaignCreative({
      template: "immersive_photo",
      tone: "night_gold",
      font: "editorial",
      background: "dark_grain",
      shape: "grunge",
      colors: {
        frame: "#111111",
        button: "#ff3300",
      },
    })).toMatchObject({
      template: "immersive_photo",
      text: DEFAULT_CAMPAIGN_CREATIVE.text,
    });

    expect(normalizeCampaignCreative({
      template: "unsafe-template",
      tone: "rainbow",
      font: "comic",
      background: "remote-css",
      shape: "blob",
      colors: {
        frame: "#111111",
      },
    })).toEqual(DEFAULT_CAMPAIGN_CREATIVE);
  });

  it("keeps editable text controls within safe ranges", () => {
    expect(normalizeCampaignCreative({
      text: {
        headline: {
          x: 88,
          y: -42,
          scale: 135,
          rotation: -18,
          color: "#AbC123",
          font: "modern",
          align: "center",
        },
      },
    })).toMatchObject({
      text: {
        headline: {
          x: 88,
          y: -42,
          scale: 135,
          rotation: -18,
          color: "#abc123",
        },
      },
    });
  });

  it("keeps a readable summary for campaign operators", () => {
    expect(getCampaignCreativeSummary({
      ...DEFAULT_CAMPAIGN_CREATIVE,
      template: "warm_gourmet",
    })).toContain("Chaleureux");
  });

  it("persists creative choices in channels and normalizes them server-side", () => {
    const dashboard = readSource("src/pages/dashboard/DashboardCampagnes.tsx");
    const portal = readSource("supabase/functions/campaign-portal/index.ts");
    const card = readSource("src/components/campaigns/SponsoredRestaurantTemplateCard.tsx");

    expect(dashboard).toContain("CampaignCreativeStudio");
    expect(dashboard).toContain("creative: campaignCreative");
    expect(dashboard).toContain("getCampaignCreativeFromChannels(initial?.channels)");
    expect(dashboard).not.toContain("Nuancier des blocs");
    expect(dashboard).not.toContain("Masque photo");

    expect(portal).toContain("sanitizeCampaignCreative");
    expect(portal).toContain("classic_elegant");
    expect(portal).not.toContain("VALID_CREATIVE_TONES");
    expect(portal).toContain("creative,");

    expect(card).toContain("TEMPLATE_NUMBERS");
    expect(card).toContain("photo-zone-template");
  });
});
